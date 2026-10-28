// src/game-mine.js -- 概率扫雷的渲染与交互层
// 独立懒加载模块: 首次切到「概率扫雷」时才下载, 不进首屏。
// 棋盘与求解器在同级 mine-solver.js (纯逻辑, 可在 Node 中做统计校验),
// 本文件只负责 DOM 渲染、输入事件、计时与 AI 自动游玩节奏。

import '../styles/game-mine.css';
import SkyStorage from './storage.js';
import { Board, DIFFICULTIES, solveProbabilities } from './mine-solver.js';

const BEST_KEY = diff => `skystar:v1:mine:best:${diff}`;

class MineGame {
    constructor() {
        this.boardEl = document.getElementById('mineBoard');
        this.areaEl = document.querySelector('.mine-board-area');
        this.flagEl = document.getElementById('mineFlagCount');
        this.timeEl = document.getElementById('mineTime');
        this.bestEl = document.getElementById('mineBest');
        this.statusEl = document.getElementById('mineStatus');
        this.hintBtn = document.getElementById('mineHint');
        this.autoBtn = document.getElementById('mineAuto');
        this.restartBtn = document.getElementById('mineRestart');

        if (!this.boardEl) return;

        this.diffKey = 'easy';
        this.board = new Board(this.diffKey);
        this.els = [];
        this.state = 'ready';       // ready | playing | paused | won | lost
        this.seconds = 0;
        this.timer = null;
        this.hintOn = false;
        this.autoOn = false;
        this.autoTimer = null;
        this.prob = null;
        this.forced = null;
        this.longPressTimer = null;
        this.suppressClick = false;
        this.winBest = false;

        this.#buildGrid();
        this.#bindEvents();
        // AI 实验台改步进间隔时, 正在跑的自动扫描要立即跟上新节奏
        window.aiLab?.subscribe?.((gameKey) => this.#onAiParamChange(gameKey));
        this.fitMine();
    }

    // ── 网格构建 ──

    #buildGrid() {
        const { cols, rows, size } = this.board;
        this.boardEl.style.setProperty('--cols', cols);
        this.boardEl.style.setProperty('--rows', rows);
        this.boardEl.textContent = '';
        this.els = new Array(size);

        const frag = document.createDocumentFragment();
        for (let i = 0; i < size; i++) {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'mine-cell';
            el.dataset.i = i;
            el.tabIndex = -1;
            const pct = document.createElement('span');
            pct.className = 'mine-pct';
            el.append(pct);
            this.els[i] = el;
            frag.append(el);
        }
        this.boardEl.append(frag);
    }

    #bindEvents() {
        this.boardEl.addEventListener('click', e => {
            const cell = e.target.closest('.mine-cell');
            if (cell) this.open(Number(cell.dataset.i));
        });

        // 右键标旗; contextmenu 统一拦截, 避免浏览器菜单打断操作
        this.boardEl.addEventListener('contextmenu', e => {
            e.preventDefault();
            const cell = e.target.closest('.mine-cell');
            if (cell) this.flag(Number(cell.dataset.i));
        });

        // 移动端长按标旗: 触发后置 suppressClick, 防止松手时又翻开
        this.boardEl.addEventListener('pointerdown', e => {
            const cell = e.target.closest('.mine-cell');
            if (!cell || e.pointerType === 'mouse') return;
            this.longPressTimer = setTimeout(() => {
                this.flag(Number(cell.dataset.i));
                this.longPressTimer = null;
                this.suppressClick = true;
            }, 420);
        });
        const cancelPress = () => { clearTimeout(this.longPressTimer); this.longPressTimer = null; };
        this.boardEl.addEventListener('pointerup', cancelPress);
        this.boardEl.addEventListener('pointercancel', cancelPress);
        this.boardEl.addEventListener('pointerleave', cancelPress);

        this.hintBtn?.addEventListener('click', () => this.toggleHint());
        this.autoBtn?.addEventListener('click', () => this.toggleAuto());
        this.restartBtn?.addEventListener('click', () => this.restart());

        document.querySelectorAll('.mine-diff-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setDifficulty(btn.dataset.diff));
        });
    }

    // ── 尺寸适配 ──

    fitMine() {
        if (!this.areaEl) return;
        const { cols, rows } = this.board;
        const gap = 2;
        const availW = this.areaEl.clientWidth || 560;
        // flex 布局下高度可能为 0, 用视口高度兜底
        const availH = this.areaEl.clientHeight || Math.round(window.innerHeight * 0.46);

        const sizeByW = (availW - gap * (cols - 1)) / cols;
        const sizeByH = (availH - gap * (rows - 1)) / rows;
        const cell = Math.max(13, Math.min(46, Math.floor(Math.min(sizeByW, sizeByH))));

        this.boardEl.style.setProperty('--cell', `${cell}px`);
        // 格子太小时格内百分比会糊成一团, 只保留颜色 + title
        this.boardEl.dataset.showPct = cell >= 30 ? '1' : '0';
        this.#paintProb();
    }

    // ── 游戏流程 ──

    open(i) {
        if (this.suppressClick) { this.suppressClick = false; return; }
        if (this.state === 'won' || this.state === 'lost' || this.state === 'paused') return;
        if (this.board.revealed[i] || this.board.flagged[i]) return;

        if (this.state === 'ready') this.#startPlay();

        // 首点单独处理: 布雷时排除该格及其邻域, 因此首次点击必不可能踩雷
        if (!this.board.minesPlaced) {
            this.board.placeMines(i);
            this.#updateCells(this.board.reveal(i));
            if (this.board.isWon) return this.#win();
            if (this.hintOn) this.#refreshProb();
            return;
        }

        if (this.board.mine[i]) {
            this.board.reveal(i);
            this.#updateCells([i]);
            return this.#lose();
        }

        const opened = this.board.reveal(i);
        this.#updateCells(opened);

        if (this.board.isWon) return this.#win();
        if (this.hintOn) this.#refreshProb();
    }

    flag(i) {
        if (this.state !== 'playing' && this.state !== 'ready') return;
        if (this.state === 'ready') this.#startPlay();
        if (!this.board.toggleFlag(i)) return;
        this.#updateCells([i]);
        if (this.hintOn) this.#refreshProb();
    }

    #startPlay() {
        this.state = 'playing';
        this.seconds = 0;
        this.#stopTimer();
        this.timer = setInterval(() => {
            this.seconds++;
            this.#syncHud();
        }, 1000);
        this.statusEl.textContent = '进行中 · 左键翻开，右键标旗';
    }

    #stopTimer() {
        clearInterval(this.timer);
        this.timer = null;
    }

    restart() {
        this.#stopTimer();
        this.#stopAuto();
        this.board.reset();
        this.state = 'ready';
        this.seconds = 0;
        this.prob = null;
        this.forced = null;
        this.winBest = false;
        this.suppressClick = false;
        this.els.forEach((_, i) => this.#renderCell(i));
        this.#syncHud();
        this.statusEl.textContent = '点击任意格开始，首点必安全';
        // 提示开关可能是开着的, 新盘面必须重算, 否则热力图会整片消失
        if (this.hintOn) this.#refreshProb();
    }

    setDifficulty(diffKey) {
        if (!DIFFICULTIES[diffKey] || diffKey === this.diffKey) return;
        this.diffKey = diffKey;
        this.board = new Board(diffKey);
        this.#stopTimer();
        this.#stopAuto();
        this.state = 'ready';
        this.seconds = 0;
        this.prob = null;
        this.forced = null;
        this.winBest = false;
        this.#buildGrid();
        document.querySelectorAll('.mine-diff-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.diff === diffKey);
        });
        this.#syncHud();
        this.statusEl.textContent = '点击任意格开始，首点必安全';
        this.fitMine();
        if (this.hintOn) this.#refreshProb();
    }

    #win() {
        this.state = 'won';
        this.#stopTimer();
        this.#stopAuto();
        for (let i = 0; i < this.board.size; i++) {
            if (this.board.mine[i] && !this.board.flagged[i]) {
                this.board.flagged[i] = 1;
                this.board.flagCount++;
                this.#renderCell(i);
            }
        }
        this.prob = null;

        const key = BEST_KEY(this.diffKey);
        const best = SkyStorage.getInt(key, 0);
        const isBest = !best || this.seconds < best;
        if (isBest) SkyStorage.setInt(key, this.seconds);
        this.winBest = isBest;

        this.#syncHud();
        this.statusEl.textContent = `完成 · 用时 ${this.#formatTime(this.seconds)}`;
        this.#paintProb();
    }

    #lose() {
        this.state = 'lost';
        this.#stopTimer();
        this.#stopAuto();
        // 揭示全部雷, 并把标错的旗打叉
        for (let i = 0; i < this.board.size; i++) {
            if (this.board.mine[i] || this.board.flagged[i]) this.#renderCell(i, true);
        }
        this.prob = null;
        this.#syncHud();
        this.statusEl.textContent = '踩雷 · 点击重开再来一局';
        this.#paintProb();
    }

    // ── AI 提示 ──

    #refreshProb() {
        if (this.state === 'won' || this.state === 'lost') return;
        const res = solveProbabilities(this.board);
        this.prob = res.prob;
        this.forced = res.forced;
        this.#paintProb();
    }

    toggleHint() {
        this.hintOn = !this.hintOn;
        this.hintBtn?.classList.toggle('active', this.hintOn);
        this.hintBtn?.setAttribute('aria-pressed', String(this.hintOn));
        if (this.hintOn) {
            this.#refreshProb();
            this.statusEl.textContent = '概率视图已开启 · 绿=安全 红=高危 青边=必然安全';
        } else {
            this.prob = null;
            this.forced = null;
            // 先把格内文字还原成数字/旗子, 再清掉热力层(顺序不能反, 否则百分比会残留)
            this.els.forEach((_, i) => this.#renderCell(i));
            this.#paintProb();
            this.statusEl.textContent = this.state === 'playing' ? '进行中 · 左键翻开，右键标旗' : '点击任意格开始，首点必安全';
        }
    }

    // 热力图: 用 --p 驱动 HSL 色相, 0 概率接近绿(140°), 1 概率接近红(-10°)
    #paintProb() {
        const showPct = this.boardEl.dataset.showPct === '1';
        for (const el of this.els) {
            const i = Number(el.dataset.i);
            const p = this.prob ? this.prob[i] : -1;
            const visible = this.hintOn && p >= 0 && !this.board.revealed[i] && !this.board.flagged[i];
            el.classList.toggle('show-prob', visible);

            if (visible) {
                const pctEl = el.querySelector('.mine-pct');
                el.style.setProperty('--p', p.toFixed(3));
                const f = this.forced ? this.forced[i] : 0;
                el.dataset.certain = f === 1 ? 'safe' : f === 2 ? 'mine' : '';
                if (pctEl) pctEl.textContent = showPct ? String(Math.round(p * 100)) : '';
                el.title = `${Math.round(p * 100)}% 有雷`;
            } else {
                // 只摘掉热力层, 格内文字归 #renderCell 管, 这里不碰
                el.style.removeProperty('--p');
                el.dataset.certain = '';
                el.removeAttribute('title');
            }
        }
    }

    toggleAuto() {
        if (this.autoOn) { this.#stopAuto(); return; }
        this.autoOn = true;
        this.autoBtn?.classList.add('active');
        this.autoBtn?.setAttribute('aria-pressed', 'true');
        if (!this.hintOn) this.toggleHint();
        this.#autoStep();
        this.#startAutoTimer();
    }

    // 步进间隔可被 AI 实验台调整; 兜底 260ms 与旧行为一致
    #autoDelay() {
        const v = window.aiLab && window.aiLab.get('mine', 'autoDelay', 260);
        return Number.isFinite(v) ? v : 260;
    }

    #startAutoTimer() {
        clearInterval(this.autoTimer);
        this.autoTimer = setInterval(() => this.#autoStep(), this.#autoDelay());
    }

    // 参数在 AI 自动进行中被改动时, 用新间隔重建定时器, 否则要等重开才生效
    #onAiParamChange(gameKey) {
        if (gameKey !== 'mine' || !this.autoOn) return;
        this.#startAutoTimer();
    }

    #stopAuto() {
        clearInterval(this.autoTimer);
        this.autoTimer = null;
        this.autoOn = false;
        this.autoBtn?.classList.remove('active');
        this.autoBtn?.setAttribute('aria-pressed', 'false');
    }

    // AI 一步: 先落确定性结论(必是雷→标旗, 必安全→翻开), 都没有才按最小概率猜
    #autoStep() {
        if (this.state === 'won' || this.state === 'lost') { this.#stopAuto(); return; }
        if (this.state === 'paused') return;
        if (this.state === 'ready') this.#startPlay();

        this.#refreshProb();
        const { prob, forced } = this;
        let safe = -1;
        let mine = -1;
        let best = -1;
        let bestP = Infinity;

        for (let i = 0; i < this.board.size; i++) {
            if (this.board.revealed[i] || this.board.flagged[i]) continue;
            if (forced[i] === 1) { if (safe < 0) safe = i; }
            else if (forced[i] === 2) { if (mine < 0) mine = i; }
            if (prob[i] < bestP) { bestP = prob[i]; best = i; }
        }

        // 确定性推理也要报状态: 否则 AI 一直在动, 状态栏却停在开局的提示文案上
        if (mine >= 0) {
            this.statusEl.textContent = `AI 推理 · 第 ${mine % this.board.cols + 1} 列必是雷，自动标旗`;
            this.flag(mine);
            return;
        }
        if (safe >= 0) {
            this.statusEl.textContent = 'AI 推理 · 判定该格必然安全，自动翻开';
            this.open(safe);
            return;
        }

        if (best >= 0) {
            this.statusEl.textContent = `AI 猜测 · 该格 ${Math.round(bestP * 100)}% 有雷`;
            this.open(best);
            return;
        }
        if (this.board.isWon) this.#win();
        else this.#stopAuto();
    }

    // ── 渲染 ──

    #updateCells(indices) {
        for (const i of indices) this.#renderCell(i);
        this.#syncHud();
    }

    #renderCell(i, revealAll = false) {
        const el = this.els[i];
        if (!el) return;
        const b = this.board;
        const pctEl = el.querySelector('.mine-pct');
        el.classList.remove('revealed', 'flagged', 'mine', 'wrong', 'exploded');
        el.removeAttribute('data-n');

        if (b.revealed[i]) {
            el.classList.add('revealed');
            if (b.mine[i]) {
                el.classList.add('mine', 'exploded');
                if (pctEl) pctEl.textContent = '✳';
            } else if (b.adjacent[i] > 0) {
                el.dataset.n = b.adjacent[i];
                if (pctEl) pctEl.textContent = String(b.adjacent[i]);
            } else if (pctEl) {
                pctEl.textContent = '';
            }
            el.disabled = true;
        } else if (b.flagged[i]) {
            el.classList.add('flagged');
            // 结算时把插错位置的旗子标出来, 方便复盘
            if (revealAll && !b.mine[i]) el.classList.add('wrong');
            if (pctEl) pctEl.textContent = '⚑';
            el.disabled = false;
        } else {
            if (revealAll && b.mine[i]) {
                el.classList.add('mine');
                if (pctEl) pctEl.textContent = '✳';
            } else if (pctEl) {
                pctEl.textContent = '';
            }
            el.disabled = false;
        }
    }

    #syncHud() {
        const left = Math.max(0, this.board.mineCount - this.board.flagCount);
        if (this.flagEl) this.flagEl.textContent = left;
        if (this.timeEl) this.timeEl.textContent = this.#formatTime(this.seconds);
        if (this.bestEl) {
            const best = SkyStorage.getInt(BEST_KEY(this.diffKey), 0);
            this.bestEl.textContent = best ? this.#formatTime(best) : '—';
        }
    }

    #formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    // ── 生命周期(供 game-shell 轮播调用) ──

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.#stopTimer();
        if (this.autoOn) this.#stopAuto();
    }

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.#stopTimer();
        this.timer = setInterval(() => { this.seconds++; this.#syncHud(); }, 1000);
    }

    // 统一状态栏的「暂停/继续」按钮是同一个, 需要 toggle 语义;
    // 而 tab 切换用的是严格的 pause()/resume(), 两者不能混用。
    togglePause() {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
    }

    // 结算浮层由 game-feedback 统一提供(与其他 10 个游戏一致), 这里只负责给文案
    getSession() {
        const { cols, rows } = DIFFICULTIES[this.diffKey];
        if (this.state === 'ready') return { state: 'ready', detail: '点击任意格开始' };
        if (this.state === 'paused') return { state: 'paused' };
        if (this.state === 'won') return {
            state: 'complete',
            resultTitle: this.winBest ? '新纪录！' : '扫雷完成',
            resultDetail: `${cols}×${rows} · 用时 ${this.#formatTime(this.seconds)}`,
        };
        if (this.state === 'lost') return {
            state: 'ended',
            resultTitle: '踩到雷了',
            resultDetail: `坚持了 ${this.#formatTime(this.seconds)}`,
        };
        return { state: 'playing', detail: this.autoOn ? 'AI 正在扫描' : '左键翻开，右键标旗' };
    }
}

// ── 实例化与注册 ──

let instance = null;
const api = {
    getSession: () => instance?.getSession() || null,
    fitMine: () => instance?.fitMine(),
    pause: () => instance?.pause(),
    resume: () => instance?.resume(),
    togglePause: () => instance?.togglePause(),
    restart: () => instance?.restart(),
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { instance = new MineGame(); });
} else {
    instance = new MineGame();
}

window.mineGame = api;
if (window.registerGame) window.registerGame('mine', api);
