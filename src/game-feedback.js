// Presentation only: game engines remain the source of truth for session state.
const panel = document.getElementById('panel-game');
const header = panel?.querySelector('.tabs-hint');
if (panel && header) {
    const originalHint = header.querySelector('span');
    const session = document.createElement('div');
    session.className = 'game-session';
    session.innerHTML = '<span class="game-session-state" role="status" aria-live="polite" aria-atomic="true"></span><button type="button" class="game-session-action"></button>';
    originalHint?.replaceWith(session);
    const status = session.querySelector('.game-session-state');
    const action = session.querySelector('button');
    const click = id => document.getElementById(id)?.click();
    const text = id => document.getElementById(id)?.textContent.trim() || '';
    const ended = id => document.getElementById(id)?.classList.contains('visible');
    const states = { ready: '准备开始', playing: '进行中', paused: '已暂停', ended: '本局结束', complete: '已完成', thinking: 'AI 思考中', choosing: '选择强化' };
    const realtime = (g, running, paused, over) => !g ? null : { state: over ? 'ended' : !running ? 'ready' : paused ? 'paused' : 'playing', score: g.score };
    const games = {
        snake: {
            read: () => realtime(window.snakeGame, window.snakeGame?.running, window.snakeGame?.paused, ended('gameOverOverlay')),
            start: () => click('gameStart'), pause: () => click('gamePause'), startId: 'gameStart', pauseId: 'gamePause',
            result: true, titleId: 'gameOverTitle', detailId: 'finalScore',
        },
        flappy: {
            read: () => { const g = window.flappyGame; return realtime(g, g?.gameRunning, g?.gamePaused, g?.gameOver); },
            start: () => { window.flappyGame.reset(); window.flappyGame.start(); }, pause: () => window.flappyGame.togglePause(), result: true,
        },
        tetris: {
            read: () => { const g = window.tetris; return realtime(g, g?.gameRunning, g?.paused, g?.gameOver); },
            start: () => click('tetrisStart'), pause: () => { window.tetris.togglePause(); window.tetris.drawBoard(); }, startId: 'tetrisStart', result: true,
        },
        maze: { read: () => window.mazeGame?.getSession(), start: () => click('mazeStart'), pause: () => click('mazePause'), next: () => click('mazeOverlayBtn'), startId: 'mazeStart', pauseId: 'mazePause', result: true, titleId: 'mazeOverlayTitle', detailId: 'mazeOverlayMsg' },
        plane: { read: () => window.planeGame?.getSession(), start: () => click('planeRestartButton'), pause: () => window.planeGame.togglePause(), result: true },
        survivor: {
            read: () => { const g = window.survivorGame; return g?.levelupPending ? { state: 'choosing' } : realtime(g, g?.gameStarted, g?.paused, g?.gameOver); },
            start: () => click(window.survivorGame.gameStarted ? 'survivorRestartBtn' : 'survivorStartBtn'), pause: () => click('survivorPauseBtn'), pauseId: 'survivorPauseBtn',
            result: true, titleId: 'survGameoverTitle', detailId: 'survGameoverStats',
        },
        '2048': { read: () => window.game2048 && ({ state: window.game2048.gameActive ? 'playing' : 'ended', detail: window.game2048.aiPlaying ? 'AI 正在游玩' : '方向键移动方块' }), start: () => click('newGame2048') },
        'tic-tac-toe': { read: () => { const g = window.ticTacToeGame; return g && { state: !g.gameActive ? 'ended' : g.aiThinking ? 'thinking' : 'playing', detail: text('ticTacToeStatus') }; }, start: () => click('ticTacToeStart') },
        gomoku: { read: () => { const g = window.gomokuGame; return g && { state: !g.gameActive ? 'ended' : g.aiThinking ? 'thinking' : 'playing', detail: text('gomokuStatus') }; }, start: () => click('gomokuReset') },
        memory: { read: () => { const g = window.memoryGame; return g && { state: g.matched === 8 ? 'complete' : g.playing ? 'playing' : 'ready', detail: g.playing ? '寻找相同图案' : undefined, resultTitle: '全部配对完成', resultDetail: `用时 ${g.seconds} 秒 · ${g.moves} 次翻牌` }; }, start: () => click('memoryStart'), result: true },
    };
    let current = null;
    let overlay = null;
    let overlayKey = '';
    let timer;
    const setText = (el, value) => { if (el && el.textContent !== value) el.textContent = value; };

    function perform() {
        if (!current) return;
        const g = games[current];
        const value = g.read();
        if (!value || value.state === 'choosing') return;
        if (value.state === 'complete' && g.next) g.next();
        else if ((value.state === 'playing' || value.state === 'paused') && g.pause) g.pause();
        else g.start();
        sync();
        // Return keyboard control to the game after an action; otherwise Space
        // would re-activate the toolbar button instead of moving/flapping.
        const target = overlay?.querySelector('button') || panel.querySelector('.game-container.active');
        if (target) {
            if (target.matches('.game-container')) target.tabIndex = -1;
            target.focus({ preventScroll: true });
        }
    }
    action.addEventListener('click', perform);

    function removeOverlay() {
        if (overlay?.contains(document.activeElement)) action.focus({ preventScroll: true });
        overlay?.parentElement.classList.remove('game-feedback-covered');
        overlay?.remove();
        overlay = null;
        overlayKey = '';
    }

    function sync() {
        const active = panel.querySelector('.game-container.active');
        const name = panel.querySelector('.game-tab.active')?.dataset.game;
        if (document.body.dataset.activePanel !== 'game' || document.hidden || !active || !games[name]) {
            removeOverlay();
            return;
        }
        current = name;
        const game = games[name];
        const value = game.read();
        session.hidden = !value;
        if (!value) { removeOverlay(); return; }
        const state = value.state;
        session.dataset.state = state;
        setText(status, value.detail || states[state]);
        const label = state === 'choosing' ? '请在游戏内选择' : state === 'complete' && game.next ? '下一关' : state === 'paused' ? '继续游戏' : state === 'playing' && game.pause ? '暂停游戏' : state === 'ready' ? '开始游戏' : state === 'ended' || state === 'complete' ? '再来一局' : '新对局';
        setText(action, label);
        action.disabled = state === 'choosing' || state === 'thinking';
        if (game.startId) setText(document.getElementById(game.startId), state === 'ready' ? '开始游戏' : state === 'ended' ? '再来一局' : '重新开始');
        if (game.pauseId) {
            const button = document.getElementById(game.pauseId);
            setText(button, state === 'paused' ? '继续游戏' : '暂停');
            if (button) button.disabled = !['playing', 'paused'].includes(state);
        }
        const showOverlay = state === 'paused' || (['ended', 'complete'].includes(state) && game.result);
        const key = `${name}:${state}`;
        if (!showOverlay) removeOverlay();
        else if (overlayKey !== key) {
            removeOverlay();
            overlay = document.createElement('div');
            overlay.className = 'game-session-overlay';
            const card = document.createElement('div');
            card.className = 'game-session-card';
            const eyebrow = document.createElement('span');
            eyebrow.className = 'game-session-eyebrow';
            eyebrow.textContent = state === 'paused' ? 'TAKE A BREAK' : 'ROUND COMPLETE';
            const title = document.createElement('h3');
            title.textContent = state === 'paused' ? '游戏已暂停' : value.resultTitle || text(game.titleId) || '本局结束';
            const description = document.createElement('p');
            description.textContent = state === 'paused' ? '当前进度已保留，准备好后继续。' : value.resultDetail || text(game.detailId) || `本局得分 ${value.score ?? 0}`;
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', perform);
            card.append(eyebrow, title, description, button);
            overlay.append(card);
            active.append(overlay);
            active.classList.add('game-feedback-covered');
            overlayKey = key;
        }
    }
    // Observe state at a modest rate, only while the game panel is visible.
    // This also covers keyboard shortcuts, AI turns and engine-driven endings.
    function schedule() {
        clearTimeout(timer);
        sync();
        if (!document.hidden && document.body.dataset.activePanel === 'game') timer = setTimeout(schedule, 150);
    }
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-active-panel'] });
    document.addEventListener('visibilitychange', schedule);
    panel.addEventListener('click', () => queueMicrotask(sync));
    panel.addEventListener('keydown', e => {
        // Space/Enter on a button should activate it once, not also control a game.
        if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest('button, summary, select')) e.stopPropagation();
    }, true);
    schedule();
}
