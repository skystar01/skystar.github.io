// ─── Gomoku (五子棋) ───
// 核心: minimax + alpha-beta 剪枝 + 棋型评估函数 + 候选点剪枝
// 棋型评分: 五连 100000 > 活四 10000 > 冲四 1000 > 活三 1000 > 眠三 100 > 活二 100 > ...

class GomokuGame {
    constructor() {
        this.BOARD_SIZE = 15;
        this.WIN_COUNT = 5;
        this.EMPTY = 0;
        this.BLACK = 1;   // 玩家
        this.WHITE = 2;   // AI (在 pve 模式下)

        this.board = [];
        this.currentPlayer = this.BLACK;
        this.moveHistory = [];      // [{x, y, player}]
        this.lastMove = null;
        this.winner = null;         // null | 1 | 2 | 'draw'
        this.winningCells = [];     // 获胜 5 子的坐标
        this.gameActive = false;
        this.aiThinking = false;
        this.mode = 'pve';          // 'pve' | 'pvp'
        this.humanPlayer = this.BLACK;
        this.aiPlayer = this.WHITE;
        this.scores = SkyStorage.getJSON('skystar:v1:gomoku:scores', { black: 0, white: 0, draw: 0 });
        // 防御: 旧数据可能字段不全
        if (!this.scores || typeof this.scores !== 'object') this.scores = { black: 0, white: 0, draw: 0 };
        this.scores.black = this.scores.black || 0;
        this.scores.white = this.scores.white || 0;
        this.scores.draw = this.scores.draw || 0;
        this.heatMap = null;        // AI 思考时显示热力图 {key: score}

        this.init();
    }

    // ─── 初始化 ───
    init() {
        this.buildBoard();
        this.bindControls();
        this.resetGame();
    }

    buildBoard() {
        const boardEl = document.getElementById('gomokuBoard');
        const linesEl = document.getElementById('gomokuBoardLines');
        const starsEl = document.getElementById('gomokuStarPoints');
        const heatEl = document.getElementById('gomokuHeatmap');
        if (!boardEl || !linesEl || !starsEl || !heatEl) return;

        // 清空
        boardEl.innerHTML = '';
        starsEl.innerHTML = '';
        heatEl.innerHTML = '';

        // 225 个 cell: 用 absolute 定位, 中心对齐到棋盘线交点 (j/15, i/15)
        // 棋盘线间距 100%/15 画 16 条 (第 0 和 15 重合在边缘), 落子点严格在交点上
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                const cell = document.createElement('div');
                cell.className = 'gomoku-cell';
                cell.dataset.x = i;
                cell.dataset.y = j;
                cell.style.left = (j / 15 * 100) + '%';
                cell.style.top = (i / 15 * 100) + '%';
                cell.addEventListener('click', () => this.onCellClick(i, j));
                boardEl.appendChild(cell);
            }
        }

        // 5 个定位点 (天元 + 4 星): 中心 (7,7) + 4 个角 (3,3)(3,11)(11,3)(11,11)
        // 位置 = 棋盘线交点 = (j/15, i/15) * 100% (跟 cell 中心完全对齐)
        const stars = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
        stars.forEach(([x, y]) => {
            const dot = document.createElement('div');
            dot.className = 'gomoku-star-point';
            dot.style.left = (y / 15 * 100) + '%';
            dot.style.top = (x / 15 * 100) + '%';
            starsEl.appendChild(dot);
        });

        // 热力图占位
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                const heat = document.createElement('div');
                heat.className = 'gomoku-heat';
                heat.dataset.x = i;
                heat.dataset.y = j;
                heat.style.background = 'transparent';
                heatEl.appendChild(heat);
            }
        }
    }

    bindControls() {
        document.querySelectorAll('.gomoku-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });
        const resetBtn = document.getElementById('gomokuReset');
        const undoBtn = document.getElementById('gomokuUndo');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetGame());
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
    }

    // ─── 模式与重置 ───
    setMode(mode) {
        if (mode === this.mode) return;
        this.mode = mode;
        document.querySelectorAll('.gomoku-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        this.resetGame();
    }

    resetGame() {
        this.board = Array.from({ length: this.BOARD_SIZE }, () =>
            Array(this.BOARD_SIZE).fill(this.EMPTY)
        );
        this.currentPlayer = this.BLACK;  // 黑先
        this.moveHistory = [];
        this.lastMove = null;
        this.winner = null;
        this.winningCells = [];
        this.gameActive = true;
        this.aiThinking = false;
        this.heatMap = null;
        this.hideHeatmap();
        this.renderBoard();
        this.updateStatus();
        this.updateScores();
    }

    // ─── 落子 ───
    onCellClick(x, y) {
        if (!this.gameActive || this.aiThinking) return;
        if (this.board[x][y] !== this.EMPTY) return;
        // 人机模式下, 只允许玩家落子
        if (this.mode === 'pve' && this.currentPlayer !== this.humanPlayer) return;
        this.makeMove(x, y);
        // 触发 AI
        if (this.mode === 'pve' && this.gameActive) {
            this.aiMove();
        }
    }

    makeMove(x, y) {
        const player = this.currentPlayer;
        this.board[x][y] = player;
        this.moveHistory.push({ x, y, player });
        this.lastMove = { x, y, player };

        // 胜负判定
        const winLine = this.checkWin(x, y, player);
        if (winLine) {
            this.winner = player;
            this.gameActive = false;
            this.winningCells = winLine;
            this.scores[player === this.BLACK ? 'black' : 'white']++;
        } else if (this.moveHistory.length === this.BOARD_SIZE * this.BOARD_SIZE) {
            this.winner = 'draw';
            this.gameActive = false;
            this.scores.draw++;
        } else {
            this.currentPlayer = player === this.BLACK ? this.WHITE : this.BLACK;
        }

        this.hideHeatmap();
        this.renderBoard();
        this.updateStatus();
        this.updateScores();
    }

    // ─── 胜负判定 ───
    // 从 (x, y) 向 4 个方向延伸, 找到连续的同色连子; 返回 5 子坐标数组
    checkWin(x, y, player) {
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (const [dx, dy] of dirs) {
            const line = [{ x, y }];
            // 正向
            for (let k = 1; k < this.WIN_COUNT; k++) {
                const nx = x + dx * k, ny = y + dy * k;
                if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) break;
                if (this.board[nx][ny] !== player) break;
                line.push({ x: nx, y: ny });
            }
            // 反向
            for (let k = 1; k < this.WIN_COUNT; k++) {
                const nx = x - dx * k, ny = y - dy * k;
                if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) break;
                if (this.board[nx][ny] !== player) break;
                line.unshift({ x: nx, y: ny });
            }
            if (line.length >= this.WIN_COUNT) {
                return line.slice(0, this.WIN_COUNT);
            }
        }
        return null;
    }

    // ─── 悔棋 ───
    undo() {
        if (this.aiThinking) return;
        if (this.moveHistory.length === 0) return;
        const undoCount = this.mode === 'pve' ? 2 : 1;
        for (let i = 0; i < undoCount && this.moveHistory.length > 0; i++) {
            const last = this.moveHistory.pop();
            this.board[last.x][last.y] = this.EMPTY;
        }
        this.winner = null;
        this.winningCells = [];
        this.gameActive = true;
        this.lastMove = this.moveHistory.length > 0
            ? { ...this.moveHistory[this.moveHistory.length - 1] }
            : null;
        this.currentPlayer = this.moveHistory.length > 0
            ? (this.moveHistory[this.moveHistory.length - 1].player === this.BLACK ? this.WHITE : this.BLACK)
            : this.BLACK;
        this.hideHeatmap();
        this.renderBoard();
        this.updateStatus();
    }

    // ─── AI ───
    aiMove() {
        this.aiThinking = true;
        this.updateStatus();
        // 异步, 避免阻塞 UI
        setTimeout(() => {
            const move = this.findBestMove();
            if (move && this.gameActive) {
                this.makeMove(move.x, move.y);
            }
            this.aiThinking = false;
            this.updateStatus();
        }, 80);
    }

    // 搜索深度: 开局浅 (2), 中局深 (3-4), 残局深 (4)
    getSearchDepth() {
        const n = this.moveHistory.length;
        if (n < 6) return 3;       // 开局: 浅一些
        if (n < 30) return 4;      // 中局: 较深
        return 4;                  // 残局: 4 层
    }

    // 候选点剪枝: 已有棋子 2 格内 OR 必杀/必防点
    // 返回按"紧迫度"排序的前 K 个候选点
    getCandidateMoves(limit = 14) {
        if (this.moveHistory.length === 0) {
            return [{ x: 7, y: 7 }];
        }
        const candidates = [];
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] !== this.EMPTY) continue;
                // 检查 2 格内是否有子
                let near = false;
                for (let dx = -2; dx <= 2 && !near; dx++) {
                    for (let dy = -2; dy <= 2 && !near; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = i + dx, ny = j + dy;
                        if (nx >= 0 && nx < this.BOARD_SIZE && ny >= 0 && ny < this.BOARD_SIZE &&
                            this.board[nx][ny] !== this.EMPTY) {
                            near = true;
                        }
                    }
                }
                if (near) candidates.push({ x: i, y: j });
            }
        }
        if (candidates.length <= limit) return candidates;

        // 评分排序: 双方紧迫度 = max(AI 落子收益, 玩家落子收益 * 1.2)
        // 防守略优先于进攻 (避免 AI 忽视对方的 4 连)
        const scored = candidates.map(move => {
            this.board[move.x][move.y] = this.aiPlayer;
            const aiScore = this.evaluatePoint(move.x, move.y, this.aiPlayer);
            this.board[move.x][move.y] = this.humanPlayer;
            const humanScore = this.evaluatePoint(move.x, move.y, this.humanPlayer);
            this.board[move.x][move.y] = this.EMPTY;
            // 防守权重略高
            return { x: move.x, y: move.y, score: Math.max(aiScore, humanScore * 1.15) };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit).map(s => ({ x: s.x, y: s.y }));
    }

    // 找最佳落子
    findBestMove() {
        const candidates = this.getCandidateMoves(14);
        if (candidates.length === 0) return { x: 7, y: 7 };

        const depth = this.getSearchDepth();
        let bestScore = -Infinity;
        let bestMove = candidates[0];
        const movesWithScore = [];

        for (const move of candidates) {
            this.board[move.x][move.y] = this.aiPlayer;
            const score = this.minimax(depth - 1, -Infinity, Infinity, false);
            this.board[move.x][move.y] = this.EMPTY;
            movesWithScore.push({ ...move, score });
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        // 调试: 把前几个候选点写到控制台
        if (window.console && console.table) {
            console.table(movesWithScore.slice(0, 5).map(m => ({
                x: m.x, y: m.y, score: m.score.toFixed(0)
            })));
        }

        // 热力图: 把评分显示到棋盘上
        this.showHeatmap(movesWithScore);

        return bestMove;
    }

    // minimax + alpha-beta
    // isMax=true 表示当前层是 AI 走 (取 max), false 表示玩家走 (取 min)
    minimax(depth, alpha, beta, isMax) {
        if (depth === 0) return this.evaluate();

        const candidates = this.getCandidateMoves(10);
        if (candidates.length === 0) return this.evaluate();

        if (isMax) {
            let maxScore = -Infinity;
            for (const move of candidates) {
                this.board[move.x][move.y] = this.aiPlayer;
                // 终局检查
                if (this.checkWin(move.x, move.y, this.aiPlayer)) {
                    this.board[move.x][move.y] = this.EMPTY;
                    return 1000000;
                }
                const score = this.minimax(depth - 1, alpha, beta, false);
                this.board[move.x][move.y] = this.EMPTY;
                if (score > maxScore) maxScore = score;
                if (maxScore > alpha) alpha = maxScore;
                if (beta <= alpha) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const move of candidates) {
                this.board[move.x][move.y] = this.humanPlayer;
                if (this.checkWin(move.x, move.y, this.humanPlayer)) {
                    this.board[move.x][move.y] = this.EMPTY;
                    return -1000000;
                }
                const score = this.minimax(depth - 1, alpha, beta, true);
                this.board[move.x][move.y] = this.EMPTY;
                if (score < minScore) minScore = score;
                if (minScore < beta) beta = minScore;
                if (beta <= alpha) break;
            }
            return minScore;
        }
    }

    // ─── 评估函数 ───
    // 全局评分: 己方总分 - 对方总分
    evaluate() {
        let aiScore = 0, humanScore = 0;
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] === this.aiPlayer) {
                    aiScore += this.evaluatePoint(i, j, this.aiPlayer);
                } else if (this.board[i][j] === this.humanPlayer) {
                    humanScore += this.evaluatePoint(i, j, this.humanPlayer);
                }
            }
        }
        return aiScore - humanScore;
    }

    // 单点评估: 从 (x, y) 出发, 4 个方向的棋型得分之和
    evaluatePoint(x, y, player) {
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        let total = 0;
        for (const [dx, dy] of dirs) {
            total += this.evaluateLine(x, y, dx, dy, player);
        }
        return total;
    }

    // 评估从 (x, y) 沿 (dx, dy) 方向的连子情况
    // 假设 (x, y) 是 player 的棋子
    evaluateLine(x, y, dx, dy, player) {
        let count = 1;
        let leftOpen = 0, rightOpen = 0;  // 0=边界/对手堵, 1=空格

        // 正向 (向右)
        let i = 1;
        while (true) {
            const nx = x + dx * i, ny = y + dy * i;
            if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) { rightOpen = 0; break; }
            if (this.board[nx][ny] === player) { count++; i++; continue; }
            if (this.board[nx][ny] === this.EMPTY) { rightOpen = 1; break; }
            rightOpen = 0; break;  // 对方棋子
        }
        // 反向 (向左)
        i = 1;
        while (true) {
            const nx = x - dx * i, ny = y - dy * i;
            if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) { leftOpen = 0; break; }
            if (this.board[nx][ny] === player) { count++; i++; continue; }
            if (this.board[nx][ny] === this.EMPTY) { leftOpen = 1; break; }
            leftOpen = 0; break;
        }

        // 评分
        if (count >= 5) return 100000;
        const openEnds = leftOpen + rightOpen;
        if (openEnds === 0) {
            // 死棋
            if (count === 4) return 0;       // 死四 (没威胁)
            if (count === 3) return 0;
            if (count === 2) return 0;
            return 0;
        } else if (openEnds === 2) {
            // 活 N
            if (count === 4) return 10000;    // 活四: 必胜
            if (count === 3) return 1000;     // 活三: 高威胁
            if (count === 2) return 100;      // 活二
            return 10;                        // 活一
        } else {
            // 眠 N (一端被堵)
            if (count === 4) return 1000;     // 冲四
            if (count === 3) return 100;      // 眠三
            if (count === 2) return 10;       // 眠二
            return 1;
        }
    }

    // ─── 热力图 ───
    showHeatmap(movesWithScore) {
        const heatEl = document.getElementById('gomokuHeatmap');
        if (!heatEl) return;
        const maxScore = Math.max(...movesWithScore.map(m => m.score), 1);
        const map = new Map();
        movesWithScore.forEach(m => map.set(`${m.x},${m.y}`, m.score));
        heatEl.querySelectorAll('.gomoku-heat').forEach(heat => {
            const key = `${heat.dataset.x},${heat.dataset.y}`;
            const score = map.get(key);
            if (score === undefined) {
                heat.textContent = '';
                heat.style.background = 'transparent';
            } else {
                const intensity = Math.min(1, score / 100000);
                const alpha = 0.15 + intensity * 0.55;
                heat.textContent = score > 100 ? Math.round(score / 100) : '';
                heat.style.background = score > 0
                    ? `radial-gradient(circle, rgba(251, 191, 36, ${alpha}) 0%, transparent 70%)`
                    : 'rgba(239, 68, 68, 0.15)';
            }
        });
        heatEl.classList.add('show');
    }

    hideHeatmap() {
        const heatEl = document.getElementById('gomokuHeatmap');
        if (heatEl) heatEl.classList.remove('show');
    }

    // ─── 渲染 ───
    renderBoard() {
        const boardEl = document.getElementById('gomokuBoard');
        if (!boardEl) return;
        const cells = boardEl.querySelectorAll('.gomoku-cell');
        const winSet = new Set(this.winningCells.map(c => `${c.x},${c.y}`));
        cells.forEach(cell => {
            const x = parseInt(cell.dataset.x, 10);
            const y = parseInt(cell.dataset.y, 10);
            const v = this.board[x][y];
            // 清空
            cell.innerHTML = '';
            cell.classList.remove('win-cell');
            if (v !== this.EMPTY) {
                const piece = document.createElement('div');
                piece.className = 'gomoku-piece ' + (v === this.BLACK ? 'black' : 'white');
                if (this.lastMove && this.lastMove.x === x && this.lastMove.y === y) {
                    piece.classList.add('last-move');
                }
                cell.appendChild(piece);
            }
            if (winSet.has(`${x},${y}`)) {
                cell.classList.add('win-cell');
            }
        });
    }

    updateStatus() {
        const statusEl = document.getElementById('gomokuStatus');
        if (!statusEl) return;
        statusEl.classList.remove('thinking');

        if (this.winner === 'draw') {
            statusEl.innerHTML = '<span style="color:#fbbf24">🤝 平局</span>';
            return;
        }
        if (this.winner) {
            const name = this.winner === this.BLACK ? '黑方' : '白方';
            const iconClass = this.winner === this.BLACK ? 'black' : 'white';
            statusEl.innerHTML = `<span class="status-icon ${iconClass}"></span> ${name} 获胜！`;
            return;
        }
        if (this.aiThinking) {
            statusEl.classList.add('thinking');
            statusEl.textContent = '🤖 AI 思考中';
            return;
        }
        const name = this.currentPlayer === this.BLACK ? '黑方' : '白方';
        const iconClass = this.currentPlayer === this.BLACK ? 'black' : 'white';
        statusEl.innerHTML = `<span class="status-icon ${iconClass}"></span> ${name} 回合`;
    }

    updateScores() {
        const blackEl = document.getElementById('gomokuScoreBlack');
        const whiteEl = document.getElementById('gomokuScoreWhite');
        const drawEl = document.getElementById('gomokuScoreDraw');
        if (blackEl) blackEl.textContent = this.scores.black;
        if (whiteEl) whiteEl.textContent = this.scores.white;
        if (drawEl) drawEl.textContent = this.scores.draw;
        SkyStorage.setJSON('skystar:v1:gomoku:scores', this.scores);
    }
}

// ─── 启动 ───
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('gomokuBoard')) {
        window.gomokuGame = new GomokuGame();
        // 暴露 fitGomoku 给 main.html 的 fitGame()
        window.fitGomoku = function (container) {
            const board = container.querySelector('.gomoku-board-wrapper');
            if (!board) return;
            const cs = getComputedStyle(container);
            const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            const cw = container.clientWidth - padX;
            const ch = container.clientHeight - padY;
            // 减去其他元素占用
            const others = container.querySelectorAll('.gomoku-header, .gomoku-status, .gomoku-controls, .gomoku-instructions');
            let otherH = 0;
            others.forEach(el => {
                const s = getComputedStyle(el);
                otherH += el.offsetHeight;
                otherH += (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0);
            });
            const availH = ch - otherH;
            const size = Math.max(260, Math.min(cw, availH, 580));
            board.style.maxWidth = size + 'px';
            board.style.maxHeight = size + 'px';
        };
    }
});
