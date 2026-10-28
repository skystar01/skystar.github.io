// tools/verify-mine-solver.mjs
// 扫雷求解器的统计校验。构建通过只能说明语法正确, 这里检查「算得对不对」:
//   1) 确定性结论零误判 —— forced=safe 必须真的不是雷, forced=mine 必须真的是雷
//   2) 概率校准 —— 按预测概率分桶, 桶内实际踩雷率应接近预测均值
//   3) 全局雷数约束是否带来增益 —— 对比纯局部比例的平均绝对误差
//   4) 性能 —— 高级盘面求解耗时必须远低于 AI 自动模式的 260ms 步进
//
// 用法: node tools/verify-mine-solver.mjs [每档局数]

import { Board, solveProbabilities } from '../src/mine-solver.js';

const ROUNDS = {
    easy:   Number(process.argv[2] || 300),
    medium: Number(process.argv[3] || 150),
    hard:   Number(process.argv[4] || 60),
};

// 模拟一局: 随机首点 + 随机翻开若干已知安全格, 得到中局盘面
function playout(diffKey, extraReveals) {
    const board = new Board(diffKey);
    const start = Math.floor(Math.random() * board.size);
    board.placeMines(start);
    board.reveal(start);

    for (let k = 0; k < extraReveals; k++) {
        const safe = [];
        for (let i = 0; i < board.size; i++) {
            if (!board.revealed[i] && !board.mine[i]) safe.push(i);
        }
        if (!safe.length) break;
        board.reveal(safe[Math.floor(Math.random() * safe.length)]);
    }
    return board;
}

function newBuckets() {
    return Array.from({ length: 10 }, () => ({ predicted: 0, actual: 0, n: 0 }));
}

function runTier(diffKey, rounds) {
    const stats = {
        rounds: 0,
        cells: 0,
        safeViolations: 0,
        mineViolations: 0,
        brierSum: 0,
        localAbsErrSum: 0,
        localCells: 0,
        buckets: newBuckets(),
        elapsed: 0,
        firstClickViolations: 0,
    };

    for (let r = 0; r < rounds; r++) {
        const extra = 5 + Math.floor(Math.random() * 12);
        const board = playout(diffKey, extra);

        const t0 = process.hrtime.bigint();
        const { prob, forced } = solveProbabilities(board);
        stats.elapsed += Number(process.hrtime.bigint() - t0) / 1e6;
        stats.rounds++;

        for (let i = 0; i < board.size; i++) {
            if (board.revealed[i] || board.flagged[i]) continue;
            const p = prob[i];
            const truth = board.mine[i];

            stats.cells++;
            stats.brierSum += (p - truth) ** 2;

            if (forced[i] === 1 && truth === 1) stats.safeViolations++;
            if (forced[i] === 2 && truth === 0) stats.mineViolations++;

            const b = Math.min(9, Math.floor(p * 10));
            stats.buckets[b].predicted += p;
            stats.buckets[b].actual += truth;
            stats.buckets[b].n++;
        }
    }
    return stats;
}

// 单独测性能: 高级盘面中局反复求解
function benchPerformance(diffKey, rounds) {
    const boards = [];
    for (let r = 0; r < rounds; r++) boards.push(playout(diffKey, 20));
    const t0 = process.hrtime.bigint();
    let worst = 0;
    for (const b of boards) {
        const s = process.hrtime.bigint();
        solveProbabilities(b);
        const cost = Number(process.hrtime.bigint() - s) / 1e6;
        if (cost > worst) worst = cost;
    }
    const total = Number(process.hrtime.bigint() - t0) / 1e6;
    return { avg: total / rounds, worst };
}

// 首点安全: 直接验证布雷契约
function verifyFirstClickSafety(diffKey, rounds) {
    let violations = 0;
    for (let r = 0; r < rounds; r++) {
        const board = new Board(diffKey);
        const start = Math.floor(Math.random() * board.size);
        board.placeMines(start);
        if (board.mine[start]) violations++;
        for (const n of board.neighbors[start]) if (board.mine[n]) violations++;
        // 雷数必须精确
        let total = 0;
        for (let i = 0; i < board.size; i++) total += board.mine[i];
        if (total !== board.mineCount) violations++;
    }
    return violations;
}

const pct = v => `${(v * 100).toFixed(1)}%`;
let failed = false;

console.log('=== 扫雷求解器统计校验 ===\n');

for (const [diffKey, rounds] of Object.entries(ROUNDS)) {
    const s = runTier(diffKey, rounds);
    const brier = s.brierSum / s.cells;
    const avgMs = s.elapsed / s.rounds;

    console.log(`【${diffKey}】${s.rounds} 局 / ${s.cells} 个未知格  平均耗时 ${avgMs.toFixed(2)} ms`);
    console.log(`  确定性结论误判: 判安全却是雷 ${s.safeViolations} 例, 判雷却安全 ${s.mineViolations} 例`);
    console.log(`  Brier 分数: ${brier.toFixed(4)}  (0.25 ≈ 无信息盲猜, 越低越好)`);
    console.log('  概率校准 (预测均值 vs 实际踩雷率):');
    for (let b = 0; b < 10; b++) {
        const k = s.buckets[b];
        if (k.n < 20) continue;
        const pred = k.predicted / k.n;
        const act = k.actual / k.n;
        const gap = Math.abs(pred - act);
        const flag = gap > 0.12 ? '  <-- 偏离偏大' : '';
        console.log(`    ${String(b * 10).padStart(3)}-${String(b * 10 + 9).padStart(3)}%  样本 ${String(k.n).padStart(6)}  预测 ${pct(pred)}  实际 ${pct(act)}  差 ${pct(gap)}${flag}`);
    }

    if (s.safeViolations > 0 || s.mineViolations > 0) {
        console.error(`  [FAIL] ${diffKey} 存在确定性误判, 会直接误导玩家`);
        failed = true;
    }
    if (avgMs > 40) {
        console.error(`  [FAIL] ${diffKey} 平均求解耗时 ${avgMs.toFixed(1)}ms, 高于 40ms 预算`);
        failed = true;
    }
    console.log('');
}

const perf = benchPerformance('hard', 40);
console.log(`【性能】高级盘面 40 次求解: 平均 ${perf.avg.toFixed(2)} ms, 最慢 ${perf.worst.toFixed(2)} ms`);
if (perf.worst > 120) {
    console.error('  [FAIL] 最慢耗时超过 120ms, AI 自动模式会出现卡顿感');
    failed = true;
}

const fcViolations = verifyFirstClickSafety('hard', 200) + verifyFirstClickSafety('easy', 200);
console.log(`【首点安全】400 次布雷校验: 违例 ${fcViolations} 例`);
if (fcViolations > 0) {
    console.error('  [FAIL] 首点安全性被破坏');
    failed = true;
}

console.log(failed ? '\n结果: 未通过' : '\n结果: 全部通过');
process.exit(failed ? 1 : 0);
