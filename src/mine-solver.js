// src/mine-solver.js -- 扫雷棋盘数据层 + 概率求解器 (纯逻辑, 不碰 DOM)
//
// 独立成模块的原因: 求解器需要在 Node 里做统计校验(概率校准、确定性结论正确率),
// 与渲染层耦合会让这部分逻辑无法测试。
//
// 三层推理:
//   1) 确定性规则  数字格约束饱和 => 直接得出「全是雷」或「全安全」
//   2) 精确枚举    边界格按连通分量分组, 组内回溯枚举合法布雷方案
//   3) 全局约束    用 DP 卷积把各分量组合起来, 满足剩余雷数后求边际概率
// 兜底: 枚举超限或约束矛盾时退化为局部平均比例

// ─── 难度配置 ───
export const DIFFICULTIES = {
    easy:   { cols: 9,  rows: 9,  mines: 10 },
    medium: { cols: 16, rows: 16, mines: 40 },
    hard:   { cols: 30, rows: 16, mines: 99 },
};

// 枚举规模上限: 超出即降级, 防止高难度盘面卡住主线程
const ENUM_CELL_CAP = 26;
const ENUM_SOLUTION_CAP = 30000;

export class Board {
    constructor(diffKey) {
        const diff = DIFFICULTIES[diffKey] || DIFFICULTIES.easy;
        this.diffKey = DIFFICULTIES[diffKey] ? diffKey : 'easy';
        this.cols = diff.cols;
        this.rows = diff.rows;
        this.mineCount = diff.mines;
        this.size = diff.cols * diff.rows;
        this.neighbors = this.#buildNeighborTable();
        this.reset();
    }

    // 邻域表只与尺寸有关, 构造期算一次, 避免每步重复边界判断
    #buildNeighborTable() {
        const table = new Array(this.size);
        for (let i = 0; i < this.size; i++) {
            const x = i % this.cols;
            const y = (i / this.cols) | 0;
            const list = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
                    list.push(ny * this.cols + nx);
                }
            }
            table[i] = list;
        }
        return table;
    }

    reset() {
        this.mine = new Uint8Array(this.size);
        this.revealed = new Uint8Array(this.size);
        this.flagged = new Uint8Array(this.size);
        this.adjacent = new Uint8Array(this.size);
        this.minesPlaced = false;
        this.revealedCount = 0;
        this.flagCount = 0;
    }

    // 首点安全: 布雷时排除点击格及其 8 邻域, 保证第一次点击必然展开一片
    placeMines(safeIndex) {
        const forbidden = new Set([safeIndex, ...this.neighbors[safeIndex]]);
        const pool = [];
        for (let i = 0; i < this.size; i++) if (!forbidden.has(i)) pool.push(i);

        for (let i = 0; i < this.mineCount && i < pool.length; i++) {
            const j = i + Math.floor(Math.random() * (pool.length - i));
            const tmp = pool[i];
            pool[i] = pool[j];
            pool[j] = tmp;
            this.mine[pool[i]] = 1;
        }

        for (let i = 0; i < this.size; i++) {
            if (this.mine[i]) continue;
            let count = 0;
            for (const n of this.neighbors[i]) count += this.mine[n];
            this.adjacent[i] = count;
        }
        this.minesPlaced = true;
    }

    // 翻开并做连锁展开, 返回本次翻开的格子索引(供增量渲染)
    reveal(start) {
        if (!this.minesPlaced) this.placeMines(start);
        const opened = [];
        const stack = [start];
        while (stack.length) {
            const i = stack.pop();
            if (this.revealed[i] || this.flagged[i]) continue;
            this.revealed[i] = 1;
            this.revealedCount++;
            opened.push(i);
            if (this.adjacent[i] !== 0 || this.mine[i]) continue;
            for (const n of this.neighbors[i]) {
                if (!this.revealed[n] && !this.flagged[n]) stack.push(n);
            }
        }
        return opened;
    }

    toggleFlag(i) {
        if (this.revealed[i]) return false;
        this.flagged[i] = this.flagged[i] ? 0 : 1;
        this.flagCount += this.flagged[i] ? 1 : -1;
        return true;
    }

    get isWon() {
        return this.revealedCount === this.size - this.mineCount;
    }
}

// ═══════════ 求解器 ═══════════

// 把已翻开的数字格转成约束: { cells: 未知邻格, mines: 这些未知格中应有几颗雷 }
function collectConstraints(board) {
    const constraints = [];
    for (let i = 0; i < board.size; i++) {
        if (!board.revealed[i] || board.adjacent[i] <= 0) continue;
        const cells = [];
        let flaggedAround = 0;
        for (const n of board.neighbors[i]) {
            if (board.flagged[n]) flaggedAround++;
            else if (!board.revealed[n]) cells.push(n);
        }
        if (!cells.length) continue;
        const need = board.adjacent[i] - flaggedAround;
        // need 越界说明玩家标记有误, 该约束不可信, 直接丢弃
        if (need < 0 || need > cells.length) continue;
        constraints.push({ cells, mines: need });
    }
    return constraints;
}

// 共享格子的约束必属同一连通分量; 分量之间独立, 可分别枚举
function groupConstraints(constraints) {
    const byCell = new Map();
    constraints.forEach((c, ci) => {
        for (const cell of c.cells) {
            let list = byCell.get(cell);
            if (!list) { list = []; byCell.set(cell, list); }
            list.push(ci);
        }
    });

    const seen = new Uint8Array(constraints.length);
    const groups = [];
    for (let start = 0; start < constraints.length; start++) {
        if (seen[start]) continue;
        const stack = [start];
        seen[start] = 1;
        const cellSet = new Set();
        const consList = [];
        while (stack.length) {
            const ci = stack.pop();
            const c = constraints[ci];
            consList.push(c);
            for (const cell of c.cells) {
                if (cellSet.has(cell)) continue;
                cellSet.add(cell);
                for (const other of byCell.get(cell)) {
                    if (!seen[other]) { seen[other] = 1; stack.push(other); }
                }
            }
        }
        groups.push({ cells: Array.from(cellSet), constraints: consList });
    }
    return groups;
}

// 组内回溯枚举。结果按「本组恰好用了 k 颗雷」分桶, 便于后面做全局 DP 卷积,
// 无需把上万个解原样留存。
function enumerateGroup(cells, constraints) {
    const n = cells.length;
    const localOf = new Map();
    cells.forEach((c, i) => localOf.set(c, i));

    const cons = constraints.map(c => ({
        ids: c.cells.map(x => localOf.get(x)),
        mines: c.mines,
    }));

    const touch = Array.from({ length: n }, () => []);
    cons.forEach((c, ci) => { for (const id of c.ids) touch[id].push(ci); });

    const hist = new Float64Array(n + 1);
    const perCell = Array.from({ length: n }, () => new Float64Array(n + 1));
    const assign = new Uint8Array(n);
    const consMines = new Int32Array(cons.length);
    const consDone = new Int32Array(cons.length);

    let total = 0;
    let aborted = false;

    function dfs(pos, minesSoFar) {
        if (aborted) return;
        if (pos === n) {
            hist[minesSoFar]++;
            total++;
            for (let i = 0; i < n; i++) if (assign[i]) perCell[i][minesSoFar]++;
            if (total > ENUM_SOLUTION_CAP) aborted = true;
            return;
        }
        for (let v = 0; v <= 1; v++) {
            const list = touch[pos];
            let ok = true;
            for (let k = 0; k < list.length; k++) {
                const ci = list[k];
                const need = cons[ci].mines;
                const nextMines = consMines[ci] + v;
                // 超额直接剪枝; 约束内格子填满时必须刚好相等
                if (nextMines > need) { ok = false; break; }
                if (consDone[ci] + 1 === cons[ci].ids.length && nextMines !== need) { ok = false; break; }
            }
            if (!ok) continue;

            for (let k = 0; k < list.length; k++) { consMines[list[k]] += v; consDone[list[k]]++; }
            assign[pos] = v;
            dfs(pos + 1, minesSoFar + v);
            for (let k = 0; k < list.length; k++) { consMines[list[k]] -= v; consDone[list[k]]--; }
            assign[pos] = 0;
        }
    }

    dfs(0, 0);
    return { cells, hist, perCell, total, aborted };
}

// 组合数表 C(n, k), k = 0..min(n, maxK)。用递推避免阶乘溢出。
function binomialRow(n, maxK) {
    const lim = Math.min(n, maxK);
    const out = new Float64Array(Math.max(0, lim) + 1);
    out[0] = 1;
    for (let k = 1; k <= lim; k++) out[k] = out[k - 1] * (n - k + 1) / k;
    return out;
}

// 把各分量的解分布与「边界之外的自由格」一起卷积, 得到每格的条件概率。
//
// 关键: 剩余雷数 R 不是由边界分量独占的。边界之外还有 interiorCount 个自由格,
// 它们可以承担 0~interiorCount 颗雷, 方案数为组合数 C(N_i, t)。
// 早期版本把「边界雷数 === R」当作硬约束, 等于假定 interior 一颗雷都不放,
// 会强行选出「边界用满全部雷」的方案, 从而把某些格误判成必然是雷。
function combineWithGlobalCount(solved, remaining, interiorCount, prob) {
    const G = solved.length;
    const R = remaining;
    if (R < 0) return null;

    const prefix = [new Float64Array(R + 1)];
    prefix[0][0] = 1;
    for (let g = 0; g < G; g++) {
        const cur = prefix[g];
        const next = new Float64Array(R + 1);
        const h = solved[g].hist;
        for (let k = 0; k <= R; k++) {
            if (cur[k] === 0) continue;
            const lim = Math.min(h.length - 1, R - k);
            for (let m = 0; m <= lim; m++) if (h[m]) next[k + m] += cur[k] * h[m];
        }
        prefix.push(next);
    }

    const suffix = new Array(G + 1);
    suffix[G] = new Float64Array(R + 1);
    suffix[G][0] = 1;
    for (let g = G - 1; g >= 0; g--) {
        const after = suffix[g + 1];
        const h = solved[g].hist;
        const arr = new Float64Array(R + 1);
        for (let k = 0; k <= R; k++) {
            if (after[k] === 0) continue;
            const lim = Math.min(h.length - 1, R - k);
            for (let m = 0; m <= lim; m++) if (h[m]) arr[k + m] += h[m] * after[k];
        }
        suffix[g] = arr;
    }

    // interior 承担 t 颗雷的方案数
    const binom = binomialRow(interiorCount, R);
    const bw = t => (t >= 0 && t < binom.length ? binom[t] : 0);

    const F = prefix[G];
    let totalAll = 0;
    for (let m = 0; m <= R && m < F.length; m++) {
        if (F[m]) totalAll += F[m] * bw(R - m);
    }
    if (!(totalAll > 0)) return null;

    // 边界之外每格的条件概率
    let interiorP = 0;
    if (interiorCount > 0) {
        let acc = 0;
        for (let m = 0; m <= R && m < F.length; m++) {
            const t = R - m;
            if (t < 0) continue;
            acc += F[m] * bw(t) * (t / interiorCount);
        }
        interiorP = acc / totalAll;
    }

    // 边界格: 先用 prefix/suffix 卷积出「其余分量用 mr 颗雷」的方案数,
    // 再把 interior 的自由分配卷积进去, 得到 H[t]
    for (let g = 0; g < G; g++) {
        const s = solved[g];
        const before = prefix[g];
        const after = suffix[g + 1];

        const conj = new Float64Array(R + 1);
        for (let mr = 0; mr <= R; mr++) {
            let sum = 0;
            for (let k = 0; k <= mr; k++) {
                const b = before[k];
                if (b) {
                    const a = after[mr - k];
                    if (a) sum += b * a;
                }
            }
            conj[mr] = sum;
        }

        const H = new Float64Array(R + 1);
        for (let t = 0; t <= R; t++) {
            let sum = 0;
            for (let mr = 0; mr <= t; mr++) {
                if (conj[mr] === 0) continue;
                const w = bw(t - mr);
                if (w) sum += conj[mr] * w;
            }
            H[t] = sum;
        }

        for (let i = 0; i < s.cells.length; i++) {
            const row = s.perCell[i];
            let acc = 0;
            for (let m = 0; m <= R && m < row.length; m++) {
                if (row[m]) acc += row[m] * H[R - m];
            }
            prob[s.cells[i]] = acc / totalAll;
        }
    }

    return { interiorP };
}

// 降级路径: 只用局部比例(该格在所有合法方案中为雷的频率)
function applyLocalRatio(solved, prob) {
    for (const s of solved) {
        if (!s.total) continue;
        for (let i = 0; i < s.cells.length; i++) {
            let acc = 0;
            const row = s.perCell[i];
            for (let m = 0; m < row.length; m++) acc += row[m];
            prob[s.cells[i]] = acc / s.total;
        }
    }
}

/**
 * 计算每个未翻开格是雷的概率。
 * @returns {{ prob: Float32Array, forced: Int8Array, exact: boolean }}
 *          prob[i]    0~1, 已翻开/已标旗的格子为 -1
 *          forced[i]  0 未定 / 1 确定安全 / 2 确定是雷
 *          exact      是否走了精确路径(未降级)
 */
export function solveProbabilities(board) {
    const { size } = board;
    const prob = new Float32Array(size);
    const forced = new Int8Array(size);
    let exact = true;

    const unknown = [];
    for (let i = 0; i < size; i++) {
        if (!board.revealed[i] && !board.flagged[i]) unknown.push(i);
        else prob[i] = -1;
    }
    if (!unknown.length) return { prob, forced, exact };

    const remaining = Math.max(0, board.mineCount - board.flagCount);
    const prior = remaining / unknown.length;
    const constraints = collectConstraints(board);

    // 没有任何数字线索(开局): 只能按均匀先验
    if (!constraints.length) {
        for (const i of unknown) prob[i] = prior;
        return { prob, forced, exact };
    }

    const groups = groupConstraints(constraints);
    const solved = groups.map(g => {
        if (g.cells.length > ENUM_CELL_CAP) { exact = false; return null; }
        const res = enumerateGroup(g.cells, g.constraints);
        if (res.aborted) { exact = false; return null; }
        return res;
    });

    const frontier = new Set();
    for (const s of solved) if (s) for (const c of s.cells) frontier.add(c);
    const interior = unknown.filter(i => !frontier.has(i));

    let interiorP = null;
    if (solved.every(Boolean)) {
        const res = combineWithGlobalCount(solved, remaining, interior.length, prob);
        if (res) interiorP = res.interiorP;
        else {
            // 约束自身矛盾(多半是玩家标错旗): 退到局部比例
            applyLocalRatio(solved, prob);
            exact = false;
        }
    } else {
        applyLocalRatio(solved.filter(Boolean), prob);
        exact = false;
    }

    if (interior.length) {
        let p = interiorP;
        if (p === null) {
            let expected = 0;
            for (const i of frontier) if (prob[i] > 0) expected += prob[i];
            p = Math.max(0, Math.min(1, (remaining - expected) / interior.length));
        }
        for (const i of interior) prob[i] = p;
    }

    for (const i of unknown) {
        let p = prob[i];
        if (!(p >= 0)) p = prior;
        if (p > 1) p = 1;
        prob[i] = p;
        if (p <= 1e-9) forced[i] = 1;
        else if (p >= 1 - 1e-9) forced[i] = 2;
    }

    return { prob, forced, exact };
}
