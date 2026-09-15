// ─── 可替换的训练 / 运行指标空位 ───
// 有真实数据后改这里的字段即可,无需动展示层逻辑。
// 约定:
//   status: 'placeholder' | 'ready'
//   chartSrc: 曲线图路径(相对站点根); ready 且文件存在时,项目弹窗优先用它
//   scores: 可选 [{ episode, score }, ...]; 后续可画真实曲线
//   shots: 可选真实运行截图路径

export const flappyTraining = {
    status: 'placeholder',
    // 有真实导出后改成例如 'images/metrics/flappy-score.svg' 或 .png
    chartSrc: 'images/flappy-curve.svg',
    chartCaption: '示意曲线 · 待替换为训练导出',
    scores: null,
    eval: {
        // 评估跑分(可选) e.g. episodes: 20, meanScore: 1800, best: 3200
        episodes: null,
        meanScore: null,
        best: null
    },
    shots: {
        aiPlay: null,      // e.g. 'images/metrics/flappy-ai-play.png'
        trainingLog: null
    }
};

export const kaiwuEvidence = {
    status: 'placeholder',
    statsSrc: 'images/kaiwu-stats.svg',
    awardSrc: 'images/award-kaiwu-final-page1.webp',
    leaderboardSrc: null   // e.g. 'images/metrics/kaiwu-board.png'
};

export const qaTraining = {
    status: 'placeholder',
    chartSrc: 'images/qa-pipeline.svg',
    chartCaption: '流程示意 · 待替换为 loss / 对话截图',
    lossChartSrc: null,
    chatShotSrc: null
};

/** 若 status=ready 且 chartSrc 有值则返回图表路径,否则 fallback */
export function resolveChart(meta, fallback) {
    if (meta && meta.status === 'ready' && meta.chartSrc) return meta.chartSrc;
    return (meta && meta.chartSrc) || fallback;
}

export default { flappyTraining, kaiwuEvidence, qaTraining, resolveChart };
