// ─── AI 决策遥测 ───
// 统一收集「这一步 AI 想了什么」，在游戏区底部显示成一条轻量摘要。
//
// 设计取舍：
//   - 总线只做展示，不做计算。候选数、耗时、评分都由各游戏在决策处自己上报，
//     避免遥测层反过来猜游戏内部状态。
//   - 不常驻：默认 7 秒后自动淡出，避免每步刷新造成视觉噪音；点一下可立即收起。
//   - 只在「上报的游戏 == 当前激活的游戏」时显示，切游戏不会残留上一条。

const HIDE_MS = 7000;
let pillEl = null;
let hideTimer = null;

function ensurePill() {
    if (pillEl) return pillEl;
    const stage = document.querySelector('.game-stage');
    if (!stage) return null;
    pillEl = document.createElement('div');
    pillEl.className = 'ai-trace';
    pillEl.id = 'aiTracePill';
    pillEl.setAttribute('role', 'status');
    pillEl.setAttribute('aria-live', 'polite');
    pillEl.hidden = true;
    // 点击收起：偶尔挡住了棋盘边缘时，用户能自己关掉
    pillEl.addEventListener('click', () => api.clear());
    stage.appendChild(pillEl);
    return pillEl;
}

const num = (v) => {
    if (!Number.isFinite(v)) return null;
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('zh-CN');
    // 小数值保留 2 位并去掉多余的 0：-13.04 才不会和 -13.02 一起显示成两个 -13.0
    const digits = Math.abs(v) >= 100 ? 1 : 2;
    return String(+v.toFixed(digits));
};

function format(t) {
    const parts = [];
    if (Number.isFinite(t.candidates)) {
        parts.push(`评估 ${t.candidates} ${t.unit || '个候选'}`);
    }
    if (Number.isFinite(t.ms)) parts.push(`${t.ms.toFixed(t.ms < 10 ? 1 : 0)}ms`);
    if (t.choice) {
        const s = num(t.score);
        const r = num(t.runnerUp);
        let pick = `选中「${t.choice}」`;
        if (s !== null) pick += ` ${s}`;
        // 两个值在显示精度上相同就别写两遍，读者会以为是 bug
        if (r !== null) pick += r === s ? '（次优持平）' : `（次优 ${r}）`;
        parts.push(pick);
    }
    if (t.meta) parts.push(t.meta);
    return parts.join(' · ');
}

const api = {
    /**
     * 上报一次决策
     * @param {string} gameKey 与 data-game 一致
     * @param {{candidates?:number, unit?:string, ms?:number, choice?:string,
     *          score?:number, runnerUp?:number, meta?:string}} trace
     */
    report(gameKey, trace) {
        const active = document.querySelector('.game-tab.active')?.dataset.game;
        if (!active || active !== gameKey) return;   // 后台游戏的决策不打扰当前画面
        const el = ensurePill();
        if (!el) return;
        const text = format(trace);
        if (!text) return;
        el.textContent = text;
        el.hidden = false;
        el.classList.add('is-visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => api.clear(), HIDE_MS);
    },

    clear() {
        clearTimeout(hideTimer);
        if (!pillEl) return;
        pillEl.classList.remove('is-visible');
        pillEl.hidden = true;
    },
};

// 切游戏时立刻收掉，避免上一个游戏的摘要停留在新游戏画面上。
// 监听 active 类而不是 click —— 路由、移动端下拉、键盘切换都不产生 click。
const track = document.querySelector('.tabs-track');
if (track && typeof MutationObserver !== 'undefined') {
    let pending = 0;
    new MutationObserver(() => {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => api.clear());
    }).observe(track, { subtree: true, attributes: true, attributeFilter: ['class'] });
}
document.addEventListener('click', (e) => {
    if (e.target.closest('.game-tab, #gamePicker')) api.clear();
});

window.aiTrace = api;
export default api;
