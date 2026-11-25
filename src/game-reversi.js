// src/game-reversi.js -- 黑白棋（Othello）
// 独立懒加载：只有切到本游戏才下载，不进公共游戏包。
//
// 为什么选它替换「记忆翻牌」：
//   记忆翻牌只能调「记性」这一档，滑杆没有中间地带；黑白棋的评估权重（角/边/行动力/子数）
//   每一项都能单独拧，行为变化肉眼可见 —— 把角权重调到 0，AI 会主动把角送给你。
//
// AI: negamax + α-β 剪枝，权重实时读 window.aiLab。

import '../styles/game-reversi.css';
import { searchReversiAsync } from './ai-worker-client.js';
import {
    applyMove,
    BLACK,
    cellName,
    countDiscs,
    DEFAULT_WEIGHTS,
    flipsAt,
    initialBoard,
    legalMoves,
    opp,
    searchBest,
    WHITE,
} from './reversi-engine.js';
import SkyStorage from './storage.js';

const STORE_KEY = 'skystar:v1:reversi:record';

function readWeights() {
    const lab = window.aiLab;
    if (!lab) return { ...DEFAULT_WEIGHTS, depth: 3 };
    return {
        corner: lab.get('reversi', 'wCorner', DEFAULT_WEIGHTS.corner),
        edge: lab.get('reversi', 'wEdge', DEFAULT_WEIGHTS.edge),
        mobility: lab.get('reversi', 'wMobility', DEFAULT_WEIGHTS.mobility),
        disc: lab.get('reversi', 'wDisc', DEFAULT_WEIGHTS.disc),
        depth: lab.get('reversi', 'depth', 3),
    };
}

// ─── 界面 ───

class ReversiGame {
    constructor() {
        this.boardEl = document.getElementById('reversiBoard');
        this.statusEl = document.getElementById('reversiStatus');
        this.blackEl = document.getElementById('reversiBlackScore');
        this.whiteEl = document.getElementById('reversiWhiteScore');
        this.recordEl = document.getElementById('reversiRecord');
        this.startBtn = document.getElementById('reversiStart');
        this.restartBtn = document.getElementById('reversiRestart');
        this.overlay = document.getElementById('reversiOverlay');
        this.overlayTitle = document.getElementById('reversiOverlayTitle');
        this.overlayMsg = document.getElementById('reversiOverlayMsg');
        this.overlayBtn = document.getElementById('reversiOverlayBtn');

        this.human = BLACK;
        this.ai = WHITE;
        this.aiTimer = null;
        this.epoch = 0;
        this.buildCells();

        this.startBtn?.addEventListener('click', () => this.restart());
        this.restartBtn?.addEventListener('click', () => this.restart());
        this.overlayBtn?.addEventListener('click', () => this.restart());
        this.boardEl?.addEventListener('click', (e) => this.onCellClick(e));

        this.restart();
    }

    buildCells() {
        if (!this.boardEl) return;
        this.boardEl.innerHTML = '';
        this.cells = [];
        for (let i = 0; i < 64; i++) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'reversi-cell';
            cell.dataset.index = String(i);
            cell.setAttribute('aria-label', cellName(i));
            const disc = document.createElement('span');
            disc.className = 'reversi-disc';
            cell.appendChild(disc);
            this.boardEl.appendChild(cell);
            this.cells.push(cell);
        }
    }

    restart() {
        this.epoch++;
        clearTimeout(this.aiTimer);
        this.aiTimer = null;
        this.board = initialBoard();
        this.turn = BLACK;
        this.playing = true;
        this.busy = false;
        this.lastMove = -1;
        this.overlay?.classList.remove('is-open');
        this.render();
        this.syncStatus();
        // 玩家执黑先行，AI 不用抢跑；但若开局无合法手（不会发生）也要兜住
        this.maybeAutoPass();
    }

    get aiTurn() {
        return this.playing && this.turn === this.ai;
    }

    onCellClick(event) {
        const cell = event.target.closest('.reversi-cell');
        if (!cell || !this.playing || this.busy || this.turn !== this.human) return;
        const pos = Number(cell.dataset.index);
        if (!flipsAt(this.board, pos, this.human)) return;
        this.place(pos, this.human);
        if (!this.playing) return;
        this.scheduleAI();
    }

    place(pos, player) {
        this.board = applyMove(this.board, pos, player);
        this.lastMove = pos;
        this.turn = opp(player);
        this.render();
        this.syncStatus();
    }

    scheduleAI() {
        if (!this.aiTurn) return;
        this.busy = true;
        this.syncStatus();
        clearTimeout(this.aiTimer);
        this.aiTimer = setTimeout(() => this.aiStep(), 420);
    }

    async aiStep() {
        if (!this.playing || this.turn !== this.ai) { this.busy = false; return; }
        const stepEpoch = this.epoch;
        const W = readWeights();
        const res = await searchReversiAsync(this.board, this.ai, W);
        if (stepEpoch !== this.epoch || !this.playing || this.turn !== this.ai) {
            this.busy = false;
            return;
        }
        if (!res) { this.busy = false; this.maybeAutoPass(); return; }

        if (window.aiTrace) {
            window.aiTrace.report('reversi', {
                candidates: res.scored.length,
                unit: '个落点',
                ms: res.ms,
                choice: cellName(res.move),
                score: res.best,
                runnerUp: res.runnerUp,
                meta: `深度 ${res.depth}`,
            });
        }

        this.busy = false;
        this.place(res.move, this.ai);
        if (!this.playing) return;
        this.maybeAutoPass();
        if (this.aiTurn) this.scheduleAI();
    }

    /** 轮到的一方无子可落就轮空；双方都无子可落则收官结算 */
    maybeAutoPass() {
        if (!this.playing) return;
        if (legalMoves(this.board, this.turn).length) return;

        const otherHasMove = legalMoves(this.board, opp(this.turn)).length;
        if (!otherHasMove) { this.finish(); return; }

        this.turn = opp(this.turn);
        this.render();
        this.syncStatus();
        if (this.aiTurn) this.scheduleAI();
    }

    finish() {
        this.playing = false;
        this.busy = false;
        clearTimeout(this.aiTimer);
        const { black, white } = countDiscs(this.board);
        const humanScore = this.human === BLACK ? black : white;
        const aiScore = this.human === BLACK ? white : black;
        const outcome = humanScore > aiScore ? 'win' : humanScore < aiScore ? 'lose' : 'draw';
        this.updateRecord(outcome);
        this.render();

        const title = outcome === 'win' ? '你赢了' : outcome === 'lose' ? 'AI 获胜' : '平局';
        if (this.overlayTitle) this.overlayTitle.textContent = title;
        if (this.overlayMsg) this.overlayMsg.textContent = `你 ${humanScore} : ${aiScore} AI`;
        this.overlay?.classList.add('is-open');
        if (this.statusEl) this.statusEl.textContent = `${title} · 你 ${humanScore} : ${aiScore} AI`;
    }

    updateRecord(outcome) {
        let record = { win: 0, lose: 0, draw: 0 };
        try {
            const saved = SkyStorage.getJSON(STORE_KEY, null);
            if (saved && typeof saved === 'object') record = { ...record, ...saved };
        } catch { /* 存储不可用时只影响记录显示 */ }
        record[outcome] = (record[outcome] || 0) + 1;
        SkyStorage.setJSON(STORE_KEY, record);
        this.renderRecord(record);
    }

    renderRecord(record) {
        if (!this.recordEl) return;
        const r = record || SkyStorage.getJSON(STORE_KEY, null) || { win: 0, lose: 0, draw: 0 };
        this.recordEl.textContent = `${r.win || 0} 胜 ${r.lose || 0} 负${r.draw ? ` ${r.draw} 平` : ''}`;
    }

    render() {
        if (!this.cells) return;
        const { black, white } = countDiscs(this.board);
        if (this.blackEl) this.blackEl.textContent = String(black);
        if (this.whiteEl) this.whiteEl.textContent = String(white);

        const legal = this.playing && this.turn === this.human ? new Set(legalMoves(this.board, this.human)) : new Set();
        for (let i = 0; i < 64; i++) {
            const cell = this.cells[i];
            const v = this.board[i];
            cell.classList.toggle('is-black', v === BLACK);
            cell.classList.toggle('is-white', v === WHITE);
            cell.classList.toggle('is-legal', legal.has(i));
            cell.classList.toggle('is-last', i === this.lastMove);
            cell.disabled = !legal.has(i);
        }
        this.renderRecord();
    }

    syncStatus() {
        if (!this.statusEl) return;
        if (!this.playing) return;
        if (this.busy || this.turn === this.ai) { this.statusEl.textContent = 'AI 正在思考…'; return; }
        const my = legalMoves(this.board, this.human).length;
        this.statusEl.textContent = my ? `轮到你了（黑）· 可落 ${my} 处` : '你无处可落，轮空';
    }

    getSession() {
        const { black, white } = countDiscs(this.board);
        const label = `你 ${black} : ${white} AI`;
        if (!this.playing) return { state: 'ended', detail: label, score: black, resultDetail: label };
        // 只用 playing / ended 两个状态：统一状态栏对未知状态会走「开始」分支，
        // 报 thinking 会让玩家点一下就把棋局重开。AI 思考中写进 detail 就够了。
        return { state: 'playing', detail: this.busy ? 'AI 正在思考…' : label, score: black };
    }

    fit() {
        const container = document.querySelector('.game-container.game-reversi');
        if (!container || !this.boardEl) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const header = container.querySelector('.reversi-header');
        const status = container.querySelector('.reversi-status');
        const controls = container.querySelector('.reversi-controls');
        const hint = container.querySelector('.reversi-instructions');
        const chromeH = [header, status, controls, hint].reduce((sum, el) => sum + (el?.offsetHeight || 0), 0);
        // 预留 28px 弹性：字号/行高随系统缩放变化，算得太紧会把最后一个元素挤出可视区
        const avail = Math.min(container.clientWidth - padX, container.clientHeight - padY - chromeH - 28);
        const size = Math.max(240, Math.min(avail, 520));
        container.style.setProperty('--reversi-board-size', `${Math.floor(size)}px`);
    }

    pause() { this.epoch++; clearTimeout(this.aiTimer); this.aiTimer = null; this.busy = false; }
    resume() { if (this.aiTurn) this.scheduleAI(); }
}

// ─── 跑分入口：纯规则对局，不碰 DOM ───
// 一局 = AI 执黑 vs 随机执白。返回子数差（正=AI 赢）。种子由调用方控制随机序列。
function simulateGame() {
    const W = readWeights();
    let board = initialBoard();
    let turn = BLACK;
    let steps = 0;
    while (steps < 120) {
        const moves = legalMoves(board, turn);
        if (!moves.length) {
            if (!legalMoves(board, opp(turn)).length) break;
            turn = opp(turn);
            steps++;
            continue;
        }
        let mv;
        if (turn === BLACK) {
            // AI 一方走搜索
            mv = searchBest(board, turn, W).move;
        } else {
            mv = moves[Math.floor(Math.random() * moves.length)];
        }
        board = applyMove(board, mv, turn);
        turn = opp(turn);
        steps++;
    }
    const { black, white } = countDiscs(board);
    return { score: black - white, steps, black, white };
}

const instance = new ReversiGame();

window.reversiGame = {
    getSession: () => instance.getSession(),
    fitReversi: () => instance.fit(),
    pause: () => instance.pause(),
    resume: () => instance.resume(),
    restart: () => instance.restart(),
    simulate: () => simulateGame(),
    // 调试/测试用：暴露棋盘与规则，便于在控制台核对
    _debug: { legalMoves, flipsAt, applyMove, initialBoard, countDiscs, searchBest, readWeights },
};

if (window.registerGame) window.registerGame('reversi', window.reversiGame);
