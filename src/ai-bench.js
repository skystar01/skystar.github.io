// ─── AI 跑分台 ───
// 目的：把「感觉这个参数变强了」变成可比较的数字。
//
// 公平性设计（这几条决定了结论能不能信）：
//   1. 不复制规则 —— 决策、消行、计分、随机全部走游戏原本的方法，本模块只关掉渲染与 DOM。
//      另写一套简化规则会得到"训练/交付两条路径"式的偏差，那些数字就没有意义。
//   2. 同一随机种子开局 —— 两组参数用同一串随机数起手，差异才来自参数而非运气。
//      注意：决策不同会让随机调用次数分叉，所以是"同起点"而非严格配对，报告里如实说明。
//   3. 报告波动 —— 给出均值的标准误与 t 值，N 小的时候差值本身有噪声，不把噪声当结论。

const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/** 用固定种子替换 Math.random，结束后必定还原 */
async function withSeededRandom(seed, fn) {
    const original = Math.random;
    Math.random = mulberry32(seed);
    try {
        return await fn();
    } finally {
        Math.random = original;
    }
}

/** 临时覆盖 aiLab.get，让被测游戏读到指定权重，而不改动玩家存档 */
async function withParamOverride(gameKey, values, fn) {
    const lab = window.aiLab;
    if (!lab || !values) return fn();
    const originalGet = lab.get;
    lab.get = (key, name, fallback) => {
        if (key !== gameKey) return originalGet.call(lab, key, name, fallback);
        return name in values ? values[name] : fallback;
    };
    try {
        return await fn();
    } finally {
        lab.get = originalGet;
    }
}

const round1 = (v) => Math.round(v * 10) / 10;

function stats(samples) {
    const n = samples.length;
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const sorted = [...samples].sort((a, b) => a - b);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    return { mean, median, min: sorted[0], max: sorted[n - 1] };
}

/** 配对差值统计：等价于对每组"同种子"的结果做差，能抵消一部分开局运气 */
function pairedDelta(cur, base) {
    const diffs = cur.map((v, i) => v - base[i]);
    const n = diffs.length;
    const mean = diffs.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1) : 0;
    const se = n > 0 ? Math.sqrt(variance / n) : 0;
    const t = se > 0 ? mean / se : 0;
    return { mean, se, t, diffs };
}

// ─── 俄罗斯方块 ───
// 复刻 executeAIMove 的顺序：findBestMove → 套用旋转与落点 → lockPiece(内含消行/生成下一块/死亡判定)
function runTetris(seed, cfg) {
    const g = window.tetris;
    if (!g) throw new Error('俄罗斯方块实例未就绪');

    const snapshot = {
        board: g.board, score: g.score, lines: g.lines, level: g.level,
        dropInterval: g.dropInterval, currentPiece: g.currentPiece, nextPiece: g.nextPiece,
        currentPosition: g.currentPosition, gameOver: g.gameOver, gameRunning: g.gameRunning,
        flashRows: g.flashRows,
    };
    const renderMethods = ['drawBoard', 'drawNextPiece', 'drawHoldPiece', 'updateUI', 'updateGhostPosition'];
    const savedRender = renderMethods.map(m => g[m]);
    renderMethods.forEach(m => { g[m] = () => {}; });

    try {
        g.board = Array.from({ length: g.ROWS }, () => Array(g.COLS).fill(null));
        g.score = 0;
        g.lines = 0;
        g.level = 1;
        g.gameOver = false;
        g.nextPiece = null;
        g.spawnPiece();

        let pieces = 0;
        while (!g.gameOver && pieces < cfg.maxSteps) {
            const mv = g.findBestMove();
            if (!mv) break;
            g.currentPiece = { ...g.currentPiece, shape: mv.shape };
            g.currentPosition = { x: mv.x, y: mv.y };
            g.lockPiece();
            pieces++;
        }
        return { score: g.score, lines: g.lines, steps: pieces };
    } finally {
        Object.assign(g, snapshot);
        renderMethods.forEach((m, i) => { g[m] = savedRender[i]; });
    }
}

// ─── 2048 ───
// 复刻 aiStep 的顺序：getBestMove → performMove(含加分/生成新块/死亡判定)
function run2048(seed, cfg) {
    const g = window.game2048;
    if (!g) throw new Error('2048 实例未就绪');

    const snapshot = {
        board: g.board, score: g.score, gameActive: g.gameActive,
        gameOverlay: g.gameOverlay, finalScoreSpan: g.finalScoreSpan,
        updateScoreUI: g.updateScoreUI, renderBoard: g.renderBoard,
    };
    g.updateScoreUI = () => {};
    g.renderBoard = () => {};
    // performMove 在失败时会写这两个 DOM，用空壳顶掉，避免跑分把结算浮层弹到玩家脸上
    g.gameOverlay = { classList: { add() {}, remove() {}, contains: () => false } };
    g.finalScoreSpan = { innerText: '' };

    try {
        g.board = Array.from({ length: 4 }, () => Array(4).fill(0));
        g.score = 0;
        g.gameActive = true;
        g.addRandomTile();
        g.addRandomTile();

        const moves = {
            left: () => g.moveLeft(), right: () => g.moveRight(),
            up: () => g.moveUp(), down: () => g.moveDown(),
        };
        let steps = 0;
        while (g.gameActive && steps < cfg.maxSteps) {
            const dir = g.getBestMove();
            if (!dir) break;
            if (!g.performMove(moves[dir])) break;
            steps++;
        }
        return { score: g.score, steps, survived: g.gameActive };
    } finally {
        Object.assign(g, snapshot);
    }
}

// ─── 井字棋 ───
// 一「局」= AI 对战随机走子的玩家。返回 100/0 表示胜/负，均值即胜率（%）。
// 注意这个变体没有平局：每方最多 3 子、超出会消失，棋盘永远填不满，只能靠连成三子分胜负。
function runTicTacToe(seed, cfg) {
    const g = window.ticTacToeGame;
    if (!g) throw new Error('井字棋实例未就绪');

    const snapshot = {
        board: g.board, movesX: g.movesX, movesO: g.movesO, currentPlayer: g.currentPlayer,
        gameActive: g.gameActive, aiEnabled: g.aiEnabled, aiThinking: g.aiThinking,
        statusText: g.statusElement?.textContent || '',
    };
    // 胜局会通过 updateScore 写进 localStorage、highlightWin 改 DOM；跑分不能污染玩家战绩
    const savedMethods = { updateUI: g.updateUI, updateScore: g.updateScore, highlightWin: g.highlightWin };
    g.updateUI = () => {};
    g.updateScore = () => {};
    g.highlightWin = () => {};
    g.aiEnabled = false;   // 关掉自动落子的 setTimeout，这里手动驱动
    g.init();
    g.aiEnabled = false;

    try {
        let turns = 0;
        while (g.gameActive && turns < cfg.maxSteps) {
            const empties = [];
            for (let i = 0; i < 9; i++) if (g.board[i] === '') empties.push(i);
            if (!empties.length) break;
            // 开局先后手随机，驱动时必须按当前轮到谁来走；
            // makeMove 不看回合归属，抢走 AI 的回合会把对局跑歪
            if (g.currentPlayer === g.aiPlayer) {
                g.aiMove();
            } else {
                g.makeMove(empties[Math.floor(Math.random() * empties.length)]);
            }
            turns++;
        }
        const text = g.statusElement?.textContent || '';
        const won = /AI 获胜/.test(text);
        return { score: won ? 100 : 0, steps: turns };
    } finally {
        Object.assign(g, snapshot);
        Object.assign(g, savedMethods);
        // 把界面按还原后的状态重画一遍，否则棋盘上还留着跑分时的棋子
        try { g.updateUI(); } catch { /* 界面刷新失败不应影响跑分结果 */ }
        if (g.statusElement) g.statusElement.textContent = snapshot.statusText || '';
    }
}

// ─── 黑白棋 ───
// 一「局」= AI 执黑 vs 随机执白，跑完整盘取子数差（正数=AI 赢多少子）。
// 规则与搜索都在 game-reversi.js 里，这里只负责驱动，不复制任何棋规。
function runReversi() {
    const game = window.reversiGame;
    if (!game || !game.simulate) throw new Error('黑白棋实例未就绪');
    const r = game.simulate();
    return { score: r.score, steps: r.steps };
}

const RUNNERS = {
    tetris: {
        run: runTetris, metric: '分数', unit: '分', maxSteps: 400,
        // 固定块数下，强配置会全部跑满，单看分数会钝化；消行数更能反映"每块的平均收益"
        secondaryLabel: '消行',
        pickSecondary: (r) => r.lines,
    },
    '2048': {
        run: run2048, metric: '分数', unit: '分', maxSteps: 350,
        secondaryLabel: '步数',
        pickSecondary: (r) => r.steps,
    },
    reversi: {
        run: runReversi, metric: '子数差', unit: '子', maxSteps: 120,
        secondaryLabel: '步数',
        pickSecondary: (r) => r.steps,
    },
    'tic-tac-toe': {
        run: runTicTacToe, metric: '胜率', unit: '%', maxSteps: 40,
        // 单局只有胜/负（这个变体没有平局），所以不设次级指标。
        // 胜率的步长是 1/N，10 局根本分辨不出 90% 和 100%，默认给到 30 局。
        defaultRuns: 30,
    },
};

const api = {
    supports(gameKey) {
        return !!RUNNERS[gameKey] && !!window.aiLab;
    },

    /** 该游戏建议的对局数（胜率类指标需要更多局才有分辨力） */
    defaultRuns(gameKey) {
        return RUNNERS[gameKey]?.defaultRuns || 10;
    },

    /**
     * 跑对比：基准(标准预设) vs 当前设置，同一批种子
     * @returns {{metric,unit,runs,baseline,current,delta}}
     */
    async run(gameKey, opts = {}) {
        const spec = RUNNERS[gameKey];
        if (!spec) throw new Error('该游戏暂不支持跑分');
        const lab = window.aiLab;

        const runs = Math.max(4, Math.min(60, opts.runs || api.defaultRuns(gameKey)));
        const seeds = Array.from({ length: runs }, (_, i) => 1000 + i * 7919);
        const baseValues = lab.presetValues(gameKey, opts.baselinePreset || '标准');
        const curValues = lab.valuesOf(gameKey);

        const baseScores = [];
        const curScores = [];
        const baseSecondary = [];
        const curSecondary = [];

        for (let i = 0; i < runs; i++) {
            const seed = seeds[i];
            const bRun = await withSeededRandom(seed, () =>
                withParamOverride(gameKey, baseValues, () => spec.run(seed, spec)));
            const cRun = await withSeededRandom(seed, () =>
                withParamOverride(gameKey, curValues, () => spec.run(seed, spec)));
            baseScores.push(bRun.score);
            curScores.push(cRun.score);
            if (spec.pickSecondary) {
                baseSecondary.push(spec.pickSecondary(bRun));
                curSecondary.push(spec.pickSecondary(cRun));
            }
            opts.onProgress?.(i + 1, runs);
            // 让出主线程，避免连跑把界面卡死
            await new Promise(r => setTimeout(r, 0));
        }

        const base = stats(baseScores);
        const cur = stats(curScores);
        const delta = pairedDelta(curScores, baseScores);
        const significant = Math.abs(delta.t) >= 2.3;   // n≈10 时双侧 5% 的粗略门槛

        return {
            metric: spec.metric,
            unit: spec.unit,
            runs,
            baselineLabel: opts.baselinePreset || '标准',
            baseline: { ...base, samples: baseScores },
            current: { ...cur, samples: curScores },
            delta: { mean: round1(delta.mean), se: round1(delta.se), t: Math.round(delta.t * 10) / 10, significant },
            secondary: spec.pickSecondary ? {
                label: spec.secondaryLabel,
                baseline: stats(baseSecondary),
                current: stats(curSecondary),
            } : null,
        };
    },
};

window.aiBench = api;
export default api;
