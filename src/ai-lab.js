// ─── AI 实验台 ───
// 把各游戏原本硬编码的 AI 参数抽出来，统一由本模块托管：schema 注册 → 抽屉渲染 → 持久化。
//
// 对外契约（游戏侧只需一行）：
//   const depth = window.aiLab?.get('2048', 'searchDepth', 3) ?? 3;
// 新增游戏不需要改 UI —— 调 register() 传一张表即可。

const STORE_KEY = 'skystar:ai-lab:v1';

/** @type {Map<string, {spec: object[], presets: Record<string, Record<string, number>>, note: string}>} */
const registry = new Map();
/** @type {Set<Function>} 参数变化订阅者（用于让正在跑的游戏重建定时器等） */
const listeners = new Set();
/** 从 localStorage 读出的原始存档：{ [gameKey]: { preset, values } } */
let store = {};

// 参数变更时的高频读取走缓存，避免每次 AI 决策都拼对象
const valueCache = new Map();

function loadStore() {
    const raw = window.SkyStorage?.getJSON?.(STORE_KEY, null);
    store = raw && typeof raw === 'object' ? raw : {};
}

function persist() {
    window.SkyStorage?.setJSON?.(STORE_KEY, store);
}

/** 取某游戏的生效参数对象（存档值覆盖默认值） */
function effectiveValues(gameKey) {
    if (valueCache.has(gameKey)) return valueCache.get(gameKey);
    const entry = registry.get(gameKey);
    const values = {};
    if (entry) {
        for (const item of entry.spec) values[item.key] = item.def;
        const saved = store[gameKey]?.values;
        if (saved) {
            for (const item of entry.spec) {
                const v = Number(saved[item.key]);
                if (Number.isFinite(v)) values[item.key] = clampTo(item, v);
            }
        }
    }
    valueCache.set(gameKey, values);
    return values;
}

function clampTo(item, v) {
    return Math.min(item.max, Math.max(item.min, v));
}

function emit(gameKey) {
    valueCache.delete(gameKey);
    // 参数改动后按钮上的「已自定义」圆点要立刻反映出来
    refreshButtonBadge();
    // 旧结果对应的是改动前的参数，继续显示会误导；直接作废，让用户重跑
    if (benchState.gameKey === gameKey && benchState.result) {
        benchState.result = null;
        if (openGameKey === gameKey && !benchState.running) paintBench();
    }
    for (const fn of listeners) {
        try { fn(gameKey); } catch (e) { /* 订阅者异常不应影响其他游戏 */ }
    }
}

// ─── 公共 API ───

const api = {
    /**
     * 注册一个游戏的可调参数
     * @param {string} gameKey 与 data-game 一致
     * @param {object[]} spec 参数表
     * @param {object} [opts] { presets, note }
     */
    register(gameKey, spec, opts = {}) {
        registry.set(gameKey, { spec, presets: opts.presets || {}, note: opts.note || '' });
        valueCache.delete(gameKey);
        refreshButtonBadge();
    },

    /** 读取单个参数；游戏侧读取时会带上兜底值，未注册也不会报错 */
    get(gameKey, key, fallback) {
        const values = effectiveValues(gameKey);
        const v = values[key];
        return Number.isFinite(v) ? v : fallback;
    },

    /** 写单个参数（会标记为自定义） */
    set(gameKey, key, value) {
        const entry = registry.get(gameKey);
        if (!entry) return;
        const item = entry.spec.find(s => s.key === key);
        if (!item) return;
        const current = { ...effectiveValues(gameKey) };
        current[key] = clampTo(item, value);
        store[gameKey] = { preset: '自定义', values: current };
        persist();
        emit(gameKey);
        if (openGameKey === gameKey) syncRowValue(gameKey, key);
    },

    applyPreset(gameKey, name) {
        const entry = registry.get(gameKey);
        if (!entry) return;
        const presetValues = entry.presets[name] || {};
        const values = {};
        for (const item of entry.spec) values[item.key] = item.def;
        for (const [k, v] of Object.entries(presetValues)) {
            const item = entry.spec.find(s => s.key === k);
            if (item) values[k] = clampTo(item, v);
        }
        store[gameKey] = { preset: name, values };
        persist();
        emit(gameKey);
        if (openGameKey === gameKey) renderBody();
    },

    reset(gameKey) {
        delete store[gameKey];
        persist();
        emit(gameKey);
        if (openGameKey === gameKey) renderBody();
    },

    /** 当前预设名（用于面板显示「标准 / 自定义」） */
    presetOf(gameKey) {
        return store[gameKey]?.preset || '标准';
    },

    /** 当前生效参数的副本（跑分台要用它做「当前设置」这一组） */
    valuesOf(gameKey) {
        return { ...effectiveValues(gameKey) };
    },

    /** 某个预设档位的参数值（跑分台要用它做基准，且不能污染玩家存档） */
    presetValues(gameKey, name) {
        const entry = registry.get(gameKey);
        if (!entry) return {};
        const out = {};
        for (const item of entry.spec) out[item.key] = item.def;
        const preset = entry.presets?.[name];
        if (preset) {
            for (const [k, v] of Object.entries(preset)) {
                const item = entry.spec.find(s => s.key === k);
                if (item) out[k] = clampTo(item, v);
            }
        }
        return out;
    },

    /** 当前是否被改过（用于按钮上的小圆点提示） */
    isCustomized(gameKey) {
        return store[gameKey]?.preset === '自定义';
    },

    /** 订阅任意参数变化 */
    subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },

    open,
    close,
    toggle,
};

window.aiLab = api;

// ─── 抽屉 UI ───

let openGameKey = null;
let drawerEl = null;
let bodyEl = null;
let titleEl = null;
let presetEl = null;
let toggleBtn = null;

function activeGameKey() {
    const tab = document.querySelector('.game-tab.active');
    return tab?.dataset.game || null;
}

function gameDisplayName(gameKey) {
    const tab = document.querySelector(`.game-tab[data-game="${gameKey}"]:not([data-clone])`);
    const label = tab?.querySelector('span:last-child')?.textContent?.trim();
    return label || gameKey;
}

function fmt(item, v) {
    if (typeof item.format === 'function') return item.format(v);
    const fixed = item.step < 1 ? Number(v).toFixed(2) : String(Math.round(v));
    return item.unit ? `${fixed}${item.unit}` : fixed;
}

function buildDrawer() {
    if (drawerEl) return;
    drawerEl = document.getElementById('aiLabDrawer');
    if (!drawerEl) return;
    bodyEl = drawerEl.querySelector('.ailab-body');
    titleEl = drawerEl.querySelector('.ailab-title');
    presetEl = drawerEl.querySelector('.ailab-preset');
    toggleBtn = document.getElementById('aiLabToggle');

    drawerEl.querySelector('.ailab-close')?.addEventListener('click', close);
    drawerEl.addEventListener('click', (e) => { if (e.target === drawerEl) close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawerEl.classList.contains('is-open')) close();
    });
}

function open() {
    buildDrawer();
    if (!drawerEl) return;
    const gameKey = activeGameKey();
    if (!gameKey) return;
    openGameKey = gameKey;
    document.body.classList.add('ailab-open');
    drawerEl.classList.add('is-open');
    drawerEl.setAttribute('aria-hidden', 'false');
    renderBody();
}

function close() {
    openGameKey = null;
    document.body.classList.remove('ailab-open');
    drawerEl?.classList.remove('is-open');
    drawerEl?.setAttribute('aria-hidden', 'true');
}

function toggle() {
    if (drawerEl?.classList.contains('is-open')) close();
    else open();
}

function refreshButtonBadge() {
    const btn = document.getElementById('aiLabToggle');
    if (!btn) return;
    const gameKey = activeGameKey();
    const has = gameKey && registry.has(gameKey);
    btn.classList.toggle('has-params', !!has);
    btn.classList.toggle('is-custom', !!(gameKey && api.isCustomized(gameKey)));
    btn.disabled = !has;
    btn.title = has ? '调整这款游戏的 AI 参数' : '这款游戏没有可调 AI 参数';
}

function renderBody() {
    if (!bodyEl || !openGameKey) return;
    const entry = registry.get(openGameKey);
    titleEl.textContent = gameDisplayName(openGameKey);

    if (!entry) {
        presetEl.innerHTML = '';
        bodyEl.innerHTML = `
            <p class="ailab-empty">这款游戏没有可调的 AI 参数。</p>
            <p class="ailab-empty-note">井字棋的 Minimax 已跑满全深度、Flappy 用的是训练好的模型权重，都不适合暴露成滑杆。</p>`;
        return;
    }

    const presetName = api.presetOf(openGameKey);
    presetEl.innerHTML = '';
    // 预设名由各游戏自己定（扫雷是 慢/标准/快，迷宫是 温和/标准/凶狠），不能写死
    const chipNames = Object.keys(entry.presets || {});
    const custom = presetName === '自定义';
    for (const name of chipNames) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ailab-chip' + (presetName === name ? ' is-active' : '');
        b.textContent = name;
        b.addEventListener('click', () => api.applyPreset(openGameKey, name));
        presetEl.appendChild(b);
    }
    const customChip = document.createElement('span');
    customChip.className = 'ailab-preset-state' + (custom ? ' is-custom' : '');
    customChip.textContent = custom ? '自定义' : '';
    // 预设命中时 chip 已经高亮了, 右侧再写一遍「标准」是重复信息; 只有自定义才需要额外提示
    if (custom) presetEl.appendChild(customChip);

    const values = effectiveValues(openGameKey);
    const noteText = typeof entry.note === 'function' ? entry.note(values) : entry.note;
    bodyEl.innerHTML = entry.spec.map(item => `
        <div class="ailab-row" data-key="${item.key}">
            <div class="ailab-row-head">
                <label for="ailab-${item.key}">${item.label}</label>
                <output id="ailab-out-${item.key}">${fmt(item, values[item.key])}</output>
            </div>
            <input type="range" id="ailab-${item.key}"
                   min="${item.min}" max="${item.max}" step="${item.step}"
                   value="${values[item.key]}">
            ${item.hint ? `<p class="ailab-hint">${item.hint}</p>` : ''}
        </div>`).join('') + (noteText ? `<p class="ailab-note" id="ailabNote">${noteText}</p>` : '') + `
        <div class="ailab-bench" id="ailabBench"></div>
        <button type="button" class="ailab-reset" id="ailabReset">恢复默认</button>`;

    bodyEl.querySelectorAll('input[type="range"]').forEach(input => {
        const key = input.id.replace('ailab-', '');
        const item = entry.spec.find(s => s.key === key);
        input.addEventListener('input', () => {
            api.set(openGameKey, key, Number(input.value));
        });
        input.addEventListener('change', () => {
            // 拖完一次重渲染一次，让「自定义」标记和预设 chip 状态同步
            renderBody();
        });
        if (item) input.setAttribute('aria-label', item.label);
    });
    bodyEl.querySelector('#ailabReset')?.addEventListener('click', () => api.reset(openGameKey));
    mountBench(openGameKey);
}

// ─── 量化对比（跑分台）───
// 面板只负责触发与展示，跑分逻辑在 src/ai-bench.js
const benchState = { gameKey: null, running: false, result: null, error: null };

function mountBench(gameKey) {
    const host = bodyEl?.querySelector('#ailabBench');
    if (!host) return;
    if (!window.aiBench?.supports?.(gameKey)) {
        host.remove();
        return;
    }
    if (benchState.gameKey !== gameKey) {
        benchState.gameKey = gameKey;
        benchState.result = null;
        benchState.error = null;
        benchState.running = false;
    }
    paintBench();
}

const fmtNum = (v) => Math.round(v).toLocaleString('zh-CN');

/** 当前参数是否与基准预设完全一致（一致时对比没有意义，需要提示用户） */
function isSameAsBaseline(gameKey) {
    const cur = api.valuesOf(gameKey);
    const base = api.presetValues(gameKey, '标准');
    return Object.keys(base).every(k => Math.abs((cur[k] ?? 0) - base[k]) < 1e-9);
}

function paintBench() {
    const host = bodyEl?.querySelector('#ailabBench');
    if (!host) return;
    const head = `<div class="ailab-bench-head"><span>量化对比</span><span class="ailab-bench-sub">同种子开局 · 基准为标准预设</span></div>`;

    if (benchState.running) {
        host.innerHTML = `${head}<button type="button" class="ailab-bench-run" id="ailabBenchRun" disabled>跑分中…</button>
            <p class="ailab-bench-progress" id="ailabBenchProgress">0 / 10 局</p>`;
        return;
    }

    if (benchState.error) {
        host.innerHTML = `${head}<button type="button" class="ailab-bench-run" id="ailabBenchRun">重试</button>
            <p class="ailab-bench-error">${benchState.error}</p>`;
        host.querySelector('#ailabBenchRun')?.addEventListener('click', runBench);
        return;
    }

    if (!benchState.result) {
        const same = isSameAsBaseline(openGameKey);
        host.innerHTML = `${head}<button type="button" class="ailab-bench-run" id="ailabBenchRun">跑 10 局对比</button>
            <p class="ailab-bench-progress">${same
                ? '当前就是标准预设，先改点参数再跑才有对比意义（也可以直接跑，看这套配置的绝对水平）。'
                : '当前设置 vs 标准预设，各 10 局，约需几秒。'}</p>`;
        host.querySelector('#ailabBenchRun')?.addEventListener('click', runBench);
        return;
    }

    const r = benchState.result;
    const d = r.delta;
    const sign = d.mean > 0 ? '+' : '';
    const tone = !d.significant ? 'noise' : d.mean > 0 ? 'better' : 'worse';
    const verdict = !d.significant
        ? '差值在噪声范围内，不足以说明变强或变弱'
        : d.mean > 0 ? '当前设置明显更好' : '当前设置明显更差';
    const sec = r.secondary ? `
        <p class="ailab-secondary">${r.secondary.label}：基准 ${fmtNum(r.secondary.baseline.mean)} → 当前 ${fmtNum(r.secondary.current.mean)}
           （中位 ${fmtNum(r.secondary.baseline.median)} → ${fmtNum(r.secondary.current.median)}）</p>` : '';

    host.innerHTML = `${head}
        <div class="ailab-res">
            <div class="ailab-res-row"><span>${r.baselineLabel}</span><b>${fmtNum(r.baseline.mean)}</b><em>中位 ${fmtNum(r.baseline.median)}</em></div>
            <div class="ailab-res-row is-cur"><span>当前设置</span><b>${fmtNum(r.current.mean)}</b><em>中位 ${fmtNum(r.current.median)}</em></div>
        </div>
        ${sec}
        <p class="ailab-delta is-${tone}">${sign}${fmtNum(d.mean)} ${r.unit} · 标准误 ${fmtNum(d.se)} · t=${d.t}</p>
        <p class="ailab-verdict is-${tone}">${verdict}</p>
        <p class="ailab-caveat">${r.runs} 局同种子开局：方块/新块序列在存活期间保持一致，直到一方提前结束；
            N=10 时 |t| &lt; 2.3 视为噪声。</p>
        <button type="button" class="ailab-bench-run is-ghost" id="ailabBenchRun">再跑一次</button>`;
    host.querySelector('#ailabBenchRun')?.addEventListener('click', runBench);
}

async function runBench() {
    const gameKey = openGameKey;
    if (!gameKey || benchState.running || !window.aiBench) return;
    benchState.running = true;
    benchState.result = null;
    benchState.error = null;
    paintBench();

    try {
        const res = await window.aiBench.run(gameKey, {
            runs: 10,
            onProgress: (done, total) => {
                if (openGameKey !== gameKey) return;
                const p = bodyEl?.querySelector('#ailabBenchProgress');
                if (p) p.textContent = `${done} / ${total} 局`;
            },
        });
        if (openGameKey === gameKey) benchState.result = res;
    } catch (e) {
        benchState.error = e?.message || '跑分失败';
    } finally {
        benchState.running = false;
        if (openGameKey === gameKey) paintBench();
    }
}

/** 拖动过程中只更新数字，不整体重绘（否则滑杆会掉焦点） */
function syncRowValue(gameKey, key) {
    const entry = registry.get(gameKey);
    const item = entry?.spec.find(s => s.key === key);
    if (!item) return;
    const out = bodyEl?.querySelector(`#ailab-out-${key}`);
    if (out) out.textContent = fmt(item, effectiveValues(gameKey)[key]);
    // 评估式随权重实时变化，让「参数 → 公式」的关系看得见
    if (typeof entry.note === 'function') {
        const noteEl = bodyEl?.querySelector('#ailabNote');
        if (noteEl) noteEl.textContent = entry.note(effectiveValues(gameKey));
    }
}

// ─── 启动 ───

/** 切换游戏后让抽屉跟上当前游戏：开着就换成新游戏的参数，避免显示上一个游戏的滑杆 */
function syncDrawerToActiveGame() {
    const key = activeGameKey();
    if (drawerEl?.classList.contains('is-open') && key && key !== openGameKey) {
        openGameKey = key;
        renderBody();
    }
    refreshButtonBadge();
}

function boot() {
    loadStore();
    buildDrawer();
    const btn = document.getElementById('aiLabToggle');
    btn?.addEventListener('click', () => api.toggle());
    refreshButtonBadge();

    // 监听 active 类变化而不是点事件 —— 程序化切换(路由/移动端下拉/键盘)不产生 click,
    // 只靠 click 会让按钮状态和抽屉内容都卡在旧游戏上。
    const track = document.querySelector('.tabs-track');
    if (track && typeof MutationObserver !== 'undefined') {
        let pending = 0;
        const obs = new MutationObserver(() => {
            cancelAnimationFrame(pending);
            pending = requestAnimationFrame(syncDrawerToActiveGame);
        });
        obs.observe(track, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    // 兜底: 点下拉 / tab 时也刷一次, 覆盖没有 observer 的老环境
    document.addEventListener('click', (e) => {
        if (e.target.closest('.game-tab, #gamePicker')) setTimeout(syncDrawerToActiveGame, 80);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// ─── 各游戏参数表 ───
// 集中注册而非各游戏自行注册: 飞机/扫雷走独立 chunk，若参数表跟着游戏代码走，
// 那些 chunk 未加载时面板会空掉。游戏侧只负责「读取」，兜底值仍是原来的硬编码常量，
// 所以这里的 def 必须与代码中的原常量保持一致，否则会悄悄改变默认行为。
api.register('2048', [
    {
        key: 'searchDepth', label: '搜索深度', min: 1, max: 5, step: 1, def: 3,
        hint: '实测单步计算：深度 1 约 0.2ms、深度 3 约 2ms、深度 5 约 25ms。越深越强，代价接近指数上涨。',
    },
    {
        key: 'wEmpty', label: '空格权重', min: 0, max: 500, step: 10, def: 200,
        hint: '空格越多越安全。调太高会让 AI 只顾着留空地，迟迟不肯合并，容易堆死。',
    },
    {
        key: 'wSmooth', label: '平滑度权重', min: 0, max: 10, step: 0.1, def: 1.5,
        hint: '相邻格数值差之和（取负计入）。越大越倾向于让相邻数字接近，便于连锁合并。',
    },
    {
        key: 'wMono', label: '单调性权重', min: 0, max: 10, step: 0.1, def: 2,
        hint: '一行/一列是否朝同一方向递增。权重高时 AI 会把大数锁在一角，稳但保守。',
    },
    {
        key: 'wCorner', label: '角落奖励', min: 0, max: 2000, step: 50, def: 1000,
        hint: '最大块留在四角的额外奖励。设为 0 后 AI 可能把最大块挪到棋盘中间。',
    },
], {
    presets: {
        保守: { searchDepth: 3, wEmpty: 400, wSmooth: 1.5, wMono: 1, wCorner: 800 },
        标准: { searchDepth: 3, wEmpty: 200, wSmooth: 1.5, wMono: 2, wCorner: 1000 },
        激进: { searchDepth: 4, wEmpty: 150, wSmooth: 2, wMono: 5, wCorner: 1200 },
    },
    note: (v) => `当前评分 = (${v.wEmpty})·空格 + (${v.wSmooth.toFixed(1)})·平滑 + (${v.wMono.toFixed(1)})·单调 + 角落 ${v.wCorner}`,
});

api.register('tetris', [
    {
        key: 'wHeight', label: '总高度惩罚', min: -1, max: 0, step: 0.01, def: -0.51,
        format: (v) => v.toFixed(2),
        hint: '经典值 -0.51。越负越怕堆高，AI 会更积极地把方块摊平。',
    },
    {
        key: 'wLines', label: '消行奖励', min: 0, max: 2, step: 0.01, def: 0.76,
        format: (v) => v.toFixed(2),
        hint: '经典值 0.76。调高会让 AI 优先凑消行；调成 0 就完全不看消行了。',
    },
    {
        key: 'wHoles', label: '空洞惩罚', min: -2, max: 0, step: 0.01, def: -0.36,
        format: (v) => v.toFixed(2),
        hint: '经典值 -0.36。空洞＝被方块盖住的空格，永久填不上，所以通常是重惩罚。',
    },
    {
        key: 'wBump', label: '凹凸惩罚', min: -1, max: 0, step: 0.01, def: -0.18,
        format: (v) => v.toFixed(2),
        hint: '经典值 -0.18。相邻列高度差之和，惩罚越重越追求平整的地形。',
    },
], {
    presets: {
        平整优先: { wHeight: -0.9, wLines: 0.76, wHoles: -0.36, wBump: -0.6 },
        标准: { wHeight: -0.51, wLines: 0.76, wHoles: -0.36, wBump: -0.18 },
        消行优先: { wHeight: -0.3, wLines: 1.6, wHoles: -0.36, wBump: -0.1 },
    },
    note: (v) => `当前评分 = (${v.wHeight.toFixed(2)})·总高度 + (${v.wLines.toFixed(2)})·消行 + (${v.wHoles.toFixed(2)})·空洞 + (${v.wBump.toFixed(2)})·凹凸`,
});

api.register('gomoku', [
    {
        key: 'searchDepth', label: '搜索深度', min: 0, max: 5, step: 1, def: 0,
        format: (v) => (v === 0 ? '自动' : `${v} 层`),
        hint: '自动 = 跟随步数（开局 3 层、中后盘 4 层）。手动指定后会覆盖该策略，全程固定深度。',
    },
], {
    presets: { 弱: { searchDepth: 2 }, 标准: { searchDepth: 0 }, 强: { searchDepth: 5 } },
});

api.register('mine', [
    {
        key: 'autoDelay', label: 'AI 步进间隔', min: 80, max: 600, step: 20, def: 260, unit: 'ms',
        hint: '自动扫雷时每步之间的停顿。太快看不清推理过程，太慢会以为卡住了。',
    },
], {
    presets: { 慢: { autoDelay: 450 }, 标准: { autoDelay: 260 }, 快: { autoDelay: 100 } },
});

api.register('maze', [
    {
        key: 'visionScale', label: '怪物视野', min: 0.5, max: 2, step: 0.1, def: 1,
        format: (v) => `${v.toFixed(1)}×`,
        hint: '原版视野随关卡从 5 涨到 8，这里是整体缩放：0.5× 几乎看不见你，2.0× 隔半张图就追过来。',
    },
    {
        key: 'speedScale', label: '怪物移速', min: 0.5, max: 2, step: 0.1, def: 1,
        format: (v) => `${v.toFixed(1)}×`,
        hint: '移动速度倍率（换算成移动间隔）。2.0× 时怪物节奏明显加快，留给你的反应时间只剩一半。',
    },
], {
    presets: { 温和: { visionScale: 0.7, speedScale: 0.7 }, 标准: { visionScale: 1, speedScale: 1 }, 凶狠: { visionScale: 1.6, speedScale: 1.6 } },
    note: '倍率型参数不改变关卡推进，只缩放原有的难度曲线。',
});

export default api;
