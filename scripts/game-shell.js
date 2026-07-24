// ─── GAME TAB CAROUSEL + CANVAS 适配 ───
// 无限轮播: 自动复制多组 tab + 中间组归位; 切换时按游戏类型分别 fit canvas
// 依赖外部游戏脚本提供的接口:
//   window.snakeGame.fitSnake() / window.fitGomoku(container) / window.fitMemory(container) / window.startPlaneGame() / window.mazeGame.fitMaze()

(function() {
    const tabsSidebar = document.querySelector('.tabs-sidebar');
    const tabsTrack   = document.querySelector('.tabs-track');
    const realTabs    = tabsTrack ? Array.from(tabsTrack.querySelectorAll('.game-tab')) : [];
    const N           = realTabs.length;
    const GAMES       = realTabs.map(t => t.dataset.game);
    const gameTabFor  = (game) => realTabs.find(t => t.dataset.game === game);

    let allTrackTabs  = realTabs.slice();
    let trackOffset   = 0;
    let targetOffset  = 0;
    let targetIndex   = 0;
    let sideGroupCount = 2;
    let middleGroupIndex = 2;
    let totalGroupCount = 5;

    const MOBILE_BREAKPOINT = 900;
    function isMobile() { return window.innerWidth <= MOBILE_BREAKPOINT; }

    function resetTabVisual(tab) {
        tab.classList.remove('active', 'is-center');
        tab.style.removeProperty('--v');
        tab.style.removeProperty('--s');
    }

    function makeClone(realTab) {
        const btn = realTab.cloneNode(true);
        resetTabVisual(btn);
        btn.dataset.clone = 'true';
        btn.dataset.game = realTab.dataset.game;
        return btn;
    }

    function getTrackGap() {
        if (!tabsTrack) return 0;
        const style = getComputedStyle(tabsTrack);
        return parseFloat(style.rowGap || style.gap) || 0;
    }

    function estimateCycleHeight() {
        if (!realTabs.length) return 0;
        const itemH = realTabs[0].offsetHeight || 50;
        return N * (itemH + getTrackGap());
    }

    function middleStartIndex() {
        return middleGroupIndex * N;
    }

    function positiveMod(num, mod) {
        return ((num % mod) + mod) % mod;
    }

    function buildInfiniteTrack() {
        if (!tabsTrack || !realTabs.length) return;

        // 移动端: 不需要无限轮播,直接放一组真实 tab,用 CSS 横向滚动
        if (isMobile()) {
            tabsTrack.textContent = '';
            realTabs.forEach(tab => {
                resetTabVisual(tab);
                tab.removeAttribute('data-clone');
                tabsTrack.appendChild(tab);
            });
            allTrackTabs = realTabs.slice();
            trackOffset = 0;
            targetOffset = 0;
            targetIndex = 0;
            if (tabsTrack) tabsTrack.style.transform = '';
            return;
        }

        const cycleH = estimateCycleHeight();
        sideGroupCount = cycleH > 0 ? Math.max(2, Math.ceil(tabsSidebar.clientHeight / cycleH) + 1) : 2;
        middleGroupIndex = sideGroupCount;
        totalGroupCount = sideGroupCount * 2 + 1;

        tabsTrack.textContent = '';
        for (let group = 0; group < totalGroupCount; group++) {
            realTabs.forEach(tab => {
                const node = group === middleGroupIndex ? tab : makeClone(tab);
                resetTabVisual(node);
                if (group === middleGroupIndex) node.removeAttribute('data-clone');
                tabsTrack.appendChild(node);
            });
        }

        allTrackTabs = Array.from(tabsTrack.querySelectorAll('.game-tab'));
        targetIndex = middleStartIndex();
    }

    // 计算容器内除目标元素外，其他非绝对定位子元素占用的总高度
    function calcOtherHeight(container, exclude) {
        let h = 0;
        Array.from(container.children).forEach(el => {
            if (!el || el === exclude) return;
            const style = getComputedStyle(el);
            if (style.display === 'none') return;
            if (style.position === 'absolute' || style.position === 'fixed') return;
            h += el.offsetHeight;
            h += (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
        });
        return h;
    }

    // 通用 canvas 适配：在可用空间内按原始宽高比缩放，不超过原始尺寸
    function fitCanvasToContainer(canvas, container, opts) {
        opts = opts || {};
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const otherH = calcOtherHeight(container, canvas);
        const availH = ch - otherH;
        if (cw <= 0 || availH <= 0) return;

        const aspect = canvas.width / canvas.height;
        let w = cw;
        let h = w / aspect;
        if (h > availH) { h = availH; w = h * aspect; }

        // 不放大超过原始尺寸，避免模糊
        if (w > canvas.width) { w = canvas.width; h = w / aspect; }
        if (h > canvas.height) { h = canvas.height; w = h * aspect; }

        // 可选最大宽度限制
        if (opts.maxWidth && w > opts.maxWidth) { w = opts.maxWidth; h = w / aspect; }

        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';
    }

    function fit2048(container) {
        const grid = container.querySelector('.game2048-grid-container');
        if (!grid) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const otherH = calcOtherHeight(container, grid);
        const size = Math.max(240, Math.min(cw, ch - otherH, 540));
        grid.style.maxWidth = size + 'px';
        // 同步调整数字大小，避免格子大了数字太小
        const cells = grid.querySelectorAll('.cell-2048');
        const fontRem = Math.max(0.9, Math.min(1.8, size / 300));
        cells.forEach(cell => { cell.style.fontSize = fontRem + 'rem'; });
    }

    function fitTicTacToe(container) {
        const board = container.querySelector('.tic-tac-toe-board');
        if (!board) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const otherH = calcOtherHeight(container, board);
        const size = Math.max(240, Math.min(cw, ch - otherH, 540));
        board.style.maxWidth = size + 'px';
        // 同步调整棋子大小
        const cells = board.querySelectorAll('.tic-tac-toe-cell');
        const fontRem = Math.max(1.4, Math.min(2.8, size / 200));
        cells.forEach(cell => { cell.style.fontSize = fontRem + 'rem'; });
    }

    function fitTetris(container) {
        const canvas = document.getElementById('tetrisCanvas');
        if (!canvas) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        // 横向布局，主 canvas 高度尽量撑满，宽度不超过容器的 48%
        const availH = ch - 20;
        const aspect = canvas.width / canvas.height;
        let h = availH;
        let w = h * aspect;
        const maxW = cw * 0.48;
        if (w > maxW) { w = maxW; h = w / aspect; }
        // 限制最大放大倍数
        const maxScale = 2.2;
        if (h > canvas.height * maxScale) { h = canvas.height * maxScale; w = h * aspect; }
        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';

        // 让两侧卡片面板与画布同高，并允许内容超出时滚动
        const sidePanel = container.querySelector('.tetris-side-panel');
        const infoPanel = container.querySelector('.tetris-info-panel');
        const panelH = Math.floor(h) + 'px';
        if (sidePanel) { sidePanel.style.height = panelH; sidePanel.style.overflowY = 'auto'; }
        if (infoPanel) { infoPanel.style.height = panelH; infoPanel.style.overflowY = 'auto'; }
    }

    function fitPlane(container) {
        const canvas = document.getElementById('planeCanvas');
        if (!canvas) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const hud = container.querySelector('.plane-hud');
        const hudH = hud ? hud.offsetHeight + (parseFloat(getComputedStyle(hud).marginTop) || 0) + (parseFloat(getComputedStyle(hud).marginBottom) || 0) : 0;
        const availH = ch - hudH;
        if (cw <= 0 || availH <= 0) return;

        const aspect = canvas.width / canvas.height;
        let w = Math.min(cw, 1000);
        let h = w / aspect;
        if (h > availH) { h = availH; w = h * aspect; }
        if (w > canvas.width) { w = canvas.width; h = w / aspect; }

        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';
    }

    // 按游戏类型分别适配固定容器
    function fitGame(gameName, container) {
        if (!container) return;
        requestAnimationFrame(() => {
            switch (gameName) {
                case 'snake':
                    if (window.snakeGame && window.snakeGame.fitSnake) window.snakeGame.fitSnake();
                    break;
                case '2048':
                    fit2048(container);
                    break;
                case 'tetris':
                    fitTetris(container);
                    break;
                case 'tic-tac-toe':
                    fitTicTacToe(container);
                    break;
                case 'gomoku':
                    if (window.fitGomoku) window.fitGomoku(container);
                    break;
                case 'memory':
                    if (window.fitMemory) window.fitMemory(container);
                    break;
                case 'plane':
                    fitPlane(container);
                    break;
                case 'maze':
                    if (window.mazeGame && window.mazeGame.fitMaze) window.mazeGame.fitMaze();
                    break;
                case 'flappy':
                default: {
                    const canvas = container.querySelector('canvas');
                    if (canvas) fitCanvasToContainer(canvas, container);
                    break;
                }
            }
        });
    }

    // 切换 active (active 只落在中间真实 tab 上；副本只负责视觉和点击)
    // 按需加载 game-plane.js (135KB,只有切到飞机游戏才下载)
    let planeScriptPromise = null;
    function ensurePlaneScript() {
        if (window.startPlaneGame) return Promise.resolve();
        if (planeScriptPromise) return planeScriptPromise;
        planeScriptPromise = new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'scripts/game-plane.js';
            s.onload = () => resolve();
            s.onerror = () => { planeScriptPromise = null; resolve(); };
            document.body.appendChild(s);
        });
        return planeScriptPromise;
    }

    // ─── 游戏生命周期管理 ───
    // 有 RAF/setTimeout 循环的游戏注册后, tab 切换时自动暂停/恢复, 避免后台空转
    const gameRegistry = {};
    window.registerGame = function(name, api) {
        gameRegistry[name] = api;
    };
    function pauseAllGames() {
        for (const name in gameRegistry) {
            const g = gameRegistry[name];
            if (g && typeof g.pause === 'function') g.pause();
        }
    }
    function resumeGame(name) {
        const g = gameRegistry[name];
        if (g && typeof g.resume === 'function') g.resume();
    }

    function setActiveByGame(gameName, opts) {
        const force = opts && opts.force;
        let changed = force;
        realTabs.forEach(t => {
            const want = t.dataset.game === gameName;
            const has  = t.classList.contains('active');
            if (want && !has) { t.classList.add('active'); changed = true; }
            else if (!want && has) { t.classList.remove('active'); changed = true; }
        });
        if (!changed) return;

        // 切换前暂停所有游戏 (停止后台 RAF/setTimeout 循环)
        pauseAllGames();

        document.querySelectorAll('.game-container').forEach(gc => gc.classList.remove('active'));
        const targetGc = document.querySelector(`.game-container.game-${gameName}`);
        if (targetGc) {
            targetGc.classList.add('active');
            fitGame(gameName, targetGc);
        }
        // 切换后恢复目标游戏 (重启渲染循环)
        resumeGame(gameName);

        if (gameName === 'plane') {
            if (window.startPlaneGame) {
                window.startPlaneGame();
            } else {
                ensurePlaneScript().then(() => {
                    if (window.startPlaneGame) window.startPlaneGame();
                });
            }
        }
    }

    function switchTo(gameName) {
        setActiveByGame(gameName);
    }

    function getOffsetForIndex(index) {
        const tab = allTrackTabs[index];
        if (!tab || !tabsSidebar) return targetOffset;
        const tabCenterY = tab.offsetTop + tab.offsetHeight / 2;
        return tabsSidebar.clientHeight / 2 - tabCenterY;
    }

    function setTargetIndex(index) {
        if (!allTrackTabs.length) return;
        targetIndex = Math.max(0, Math.min(index, allTrackTabs.length - 1));
        targetOffset = getOffsetForIndex(targetIndex);
    }

    function jumpToEquivalentIndex(newIndex) {
        if (!allTrackTabs[targetIndex] || !allTrackTabs[newIndex]) return;
        const oldOffset = getOffsetForIndex(targetIndex);
        const newOffset = getOffsetForIndex(newIndex);
        const delta = newOffset - oldOffset;
        targetIndex = newIndex;
        targetOffset = newOffset;
        trackOffset += delta;
        applyTransform();
    }

    // 到副本区后，瞬间归位到中间组的同名 tab；内容一样，所以视觉上无感
    function normalizeTargetToMiddle() {
        if (!N) return false;
        const middleStart = middleStartIndex();
        const middleEnd = middleStart + N;
        if (targetIndex >= middleStart && targetIndex < middleEnd) return false;

        const normalizedIndex = middleStart + positiveMod(targetIndex, N);
        jumpToEquivalentIndex(normalizedIndex);
        return true;
    }

    function moveBy(step) {
        if (!N || !allTrackTabs.length || step === 0) return;

        const safeMin = N;
        const safeMax = (totalGroupCount - 1) * N - 1;
        if (targetIndex + step < safeMin || targetIndex + step > safeMax) {
            normalizeTargetToMiddle();
        }

        setTargetIndex(targetIndex + step);
    }

    // 检测 viewport 中心最近的 tab → 加 .is-center 高亮 + 切游戏 + 物理距离 fade
    function detectCenterTab() {
        if (isMobile() || !tabsSidebar.clientHeight) return;
        const viewportCenterY = -trackOffset + tabsSidebar.clientHeight / 2;
        const maxDist = tabsSidebar.clientHeight / 2;
        let bestIdx = -1, minDist = Infinity;

        allTrackTabs.forEach((tab, i) => {
            const tabCenterY = tab.offsetTop + tab.offsetHeight / 2;
            const d = Math.abs(tabCenterY - viewportCenterY);
            const t = Math.min(d / maxDist, 1);
            tab.style.setProperty('--v', (1 - t * 0.55).toFixed(3));
            tab.style.setProperty('--s', (1 - t * 0.08).toFixed(3));
            if (d < minDist) { minDist = d; bestIdx = i; }
        });

        if (bestIdx < 0) return;
        const best = allTrackTabs[bestIdx];
        allTrackTabs.forEach(t => t.classList.remove('is-center'));
        best.classList.add('is-center');
        best.style.setProperty('--v', '1');
        best.style.setProperty('--s', '1');

        const activeRealTab = gameTabFor(best.dataset.game);
        if (!activeRealTab || !activeRealTab.classList.contains('active')) {
            switchTo(best.dataset.game);
        }
    }

    function applyTransform() {
        if (isMobile() || !tabsTrack) return;
        tabsTrack.style.transform = `translateY(${trackOffset}px)`;
    }

    // rAF loop: 平滑追赶目标；停稳在副本区时归位到中间组
    function rafLoop() {
        if (isMobile() || !realTabs.length) return;
        const diff = targetOffset - trackOffset;
        if (Math.abs(diff) > 0.1) {
            trackOffset += diff * 0.28;
            applyTransform();
            detectCenterTab();
        } else {
            if (trackOffset !== targetOffset) {
                trackOffset = targetOffset;
                applyTransform();
            }
            if (normalizeTargetToMiddle()) detectCenterTab();
        }
        requestAnimationFrame(rafLoop);
    }

    if (tabsSidebar && tabsTrack && realTabs.length) {
        tabsSidebar.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY > 0)      moveBy(1);
            else if (e.deltaY < 0) moveBy(-1);
        }, { passive: false });

        let touchStartY = 0;
        tabsSidebar.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        tabsSidebar.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        tabsSidebar.addEventListener('touchend', (e) => {
            const endY = e.changedTouches[0].clientY;
            const dy = endY - touchStartY;
            if (Math.abs(dy) < 28) return;
            moveBy(dy < 0 ? 1 : -1);
        }, { passive: true });

        // 委托 click: 点到哪一个可见 tab，就平滑滚到哪一个；副本同样有效
        tabsTrack.addEventListener('click', (e) => {
            const btn = e.target.closest('.game-tab');
            if (!btn) return;
            e.preventDefault();

            const clickedIndex = allTrackTabs.indexOf(btn);
            switchTo(btn.dataset.game);
            if (clickedIndex >= 0) {
                setTargetIndex(clickedIndex);
            } else {
                const gameIndex = GAMES.indexOf(btn.dataset.game);
                if (gameIndex >= 0) setTargetIndex(middleStartIndex() + gameIndex);
            }
        });

        requestAnimationFrame(() => {
            buildInfiniteTrack();
            const initialGame = GAMES[0];
            if (!isMobile()) {
                setTargetIndex(middleStartIndex());
                trackOffset = targetOffset;
                applyTransform();
            }
            setActiveByGame(initialGame, { force: true });
            detectCenterTab();
            if (!isMobile()) requestAnimationFrame(rafLoop);
        });
    }

    // 窗口大小变化时，重新适配当前激活的游戏
    let resizeTimeout;
    let lastMobile = isMobile();
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const nowMobile = isMobile();
            if (nowMobile !== lastMobile) {
                // 跨越桌面/移动端断点: tab 轨道结构完全不同,刷新最稳妥
                lastMobile = nowMobile;
                location.reload();
                return;
            }
            const activeTab = document.querySelector('.game-tab.active');
            const activeContainer = document.querySelector('.game-container.active');
            if (activeTab && activeContainer) {
                fitGame(activeTab.dataset.game, activeContainer);
            }
        }, 120);
    });

    // game container 默认激活第一个 tab 对应游戏
    const defaultGame = GAMES[0] || 'snake';
    const defaultContainer = document.querySelector(`.game-container.game-${defaultGame}`);
    if (defaultContainer && !defaultContainer.classList.contains('active')) {
        defaultContainer.classList.add('active');
    }
})();
