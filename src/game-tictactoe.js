import '../styles/game-tic-tac-toe.css';
import { whenDomReady } from './dom-ready.js';

// ---------- game-tic-tac-toe.js ----------
class TicTacToeGame {
    constructor() {
        this.board = ['', '', '', '', '', '', '', '', ''];
        this.currentPlayer = 'X';
        this.aiPlayer = 'O';
        this.humanPlayer = 'X';
        this.gameActive = true;
        this.aiEnabled = false;
        this.aiThinking = false;
        
        this.winningCombos = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        
        this.movesX = [];
        this.movesO = [];
    }
    
    init() {
        this.board = ['', '', '', '', '', '', '', '', ''];
        this.gameActive = true;
        this.aiThinking = false;
        this.movesX = [];
        this.movesO = [];

        // 开局随机先后手。
        // 这个变体里先手反而吃亏（棋子先落、也先消失），固定 AI 后手等于白送优势，
        // 所以两边各 50% 开局，长局数下谁都不占便宜。
        if (this.aiEnabled) {
            this.aiFirst = Math.random() < 0.5;
            this.currentPlayer = this.aiFirst ? this.aiPlayer : this.humanPlayer;
        } else {
            // 双人模式没有"AI"，纯粹随机一方先走
            this.aiFirst = false;
            this.currentPlayer = Math.random() < 0.5 ? this.humanPlayer : this.aiPlayer;
        }

        this.updateUI();

        const cells = document.querySelectorAll('.game-tic-tac-toe .tic-tac-toe-cell');
        cells.forEach((cell, index) => {
            cell.style.pointerEvents = 'auto';
            cell.style.cursor = 'pointer';
        });

        // AI 抽到先手时，别干等着玩家点第一格 —— 自己先落子。
        // 用 token 只认最新一局：连续点「重开」会让旧定时器叠在新局上，替玩家白走一步。
        this.initToken = (this.initToken || 0) + 1;
        const token = this.initToken;
        if (this.aiEnabled && this.currentPlayer === this.aiPlayer) {
            this.aiThinking = true;
            this.updateUI();
            setTimeout(() => {
                if (token !== this.initToken) return;
                if (this.gameActive && this.currentPlayer === this.aiPlayer) {
                    this.aiMove();
                } else {
                    this.aiThinking = false;
                }
            }, 600);
        }
    }
    
    initDOM() {
        this.boardElement = document.getElementById('ticTacToeBoard');
        this.statusElement = document.getElementById('ticTacToeStatus');
        this.scoreXElement = document.getElementById('ticTacToeScoreX');
        this.scoreOElement = document.getElementById('ticTacToeScoreO');
        this.startBtn = document.getElementById('ticTacToeStart');
        this.aiBtn = document.getElementById('ticTacToeAI');
        
        this.startBtn.addEventListener('click', () => this.init());
        this.aiBtn.addEventListener('click', () => this.toggleAI());
        
        const cells = document.querySelectorAll('.game-tic-tac-toe .tic-tac-toe-cell');
        cells.forEach((cell, index) => {
            cell.addEventListener('click', () => this.makeMove(index));
        });
        
        this.updateScore();
        this.init();
    }
    
    makeMove(index) {
        if (!this.gameActive || this.board[index] !== '' || this.aiThinking) return;
        
        this.board[index] = this.currentPlayer;
        
        if (this.currentPlayer === 'X') {
            this.movesX.push(index);
            if (this.movesX.length > 3) {
                const oldestMove = this.movesX.shift();
                this.board[oldestMove] = '';
            }
        } else {
            this.movesO.push(index);
            if (this.movesO.length > 3) {
                const oldestMove = this.movesO.shift();
                this.board[oldestMove] = '';
            }
        }
        
        this.updateUI();
        
        if (this.checkWin(this.currentPlayer)) {
            this.gameActive = false;
            this.statusElement.textContent = `🎉 ${this.currentPlayer} 获胜！`;
            this.updateScore(this.currentPlayer);
            this.highlightWin(this.currentPlayer);
            return;
        }
        
        if (this.checkDraw()) {
            this.gameActive = false;
            this.statusElement.textContent = '🤝 平局！';
            return;
        }
        
        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        
        if (this.aiEnabled && this.currentPlayer === this.aiPlayer && this.gameActive) {
            this.aiThinking = true;
            setTimeout(() => this.aiMove(), 500);
        }
    }
    
    aiMove() {
        if (!this.gameActive) return;
        
        const bestMove = this.findBestMove();
        this.board[bestMove] = this.aiPlayer;
        
        this.movesO.push(bestMove);
        if (this.movesO.length > 3) {
            const oldestMove = this.movesO.shift();
            this.board[oldestMove] = '';
        }
        
        this.updateUI();
        
        if (this.checkWin(this.aiPlayer)) {
            this.gameActive = false;
            this.statusElement.textContent = `🤖 AI 获胜！`;
            this.updateScore(this.aiPlayer);
            this.highlightWin(this.aiPlayer);
        } else if (this.checkDraw()) {
            this.gameActive = false;
            this.statusElement.textContent = '🤝 平局！';
        } else {
            this.currentPlayer = this.humanPlayer;
        }
        
        this.aiThinking = false;
    }
    
    findBestMove() {
        const blunder = (window.aiLab && window.aiLab.get('tic-tac-toe', 'blunderRate', 0)) || 0;
        const depth = (window.aiLab && window.aiLab.get('tic-tac-toe', 'searchDepth', 5)) || 5;
        const startedAt = performance.now();

        // 把「每人最多 3 子」的队列一并纳入搜索状态。
        // 原实现只搜静态棋盘, 与真实规则不一致 —— 实测随机乱走的玩家也能赢约 7%。
        const board = [...this.board];
        const aiQ = [...this.movesO];
        const huQ = [...this.movesX];

        let bestScore = -Infinity;
        let bestMove = -1;
        const scored = [];

        // 候选顺序: 中心 → 四角 → 四边。alpha-beta 下更好的顺序能剪掉更多分支
        for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
            if (board[i] !== '') continue;
            const removed = this._place(board, aiQ, i, this.aiPlayer);
            const score = this._minimaxTTT(board, aiQ, huQ, depth - 1, -Infinity, Infinity, false);
            this._unplace(board, aiQ, i, removed, this.aiPlayer);
            scored.push({ i, score });
            if (score > bestScore) {
                bestScore = score;
                bestMove = i;
            }
        }

        // 标准 ε-greedy: 以 ε 概率从「全部合法位置」里随机选（可能仍选中最优，也可能选到很差的位置）。
        // 不排除最优解 —— 排除掉的话 ε=100% 也只是"随机换一个次优"，永远弱不到随机水平。
        const optimal = bestMove;
        let deliberateBlunder = false;
        if (blunder > 0 && scored.length > 1 && Math.random() * 100 < blunder) {
            bestMove = scored[Math.floor(Math.random() * scored.length)].i;
            deliberateBlunder = bestMove !== optimal;
        }

        if (window.aiTrace) {
            const sorted = [...scored].sort((a, b) => b.score - a.score);
            window.aiTrace.report('tic-tac-toe', {
                candidates: scored.length,
                unit: '个空格',
                ms: performance.now() - startedAt,
                choice: `第 ${bestMove + 1} 格`,
                score: sorted[0]?.score,
                runnerUp: sorted[1]?.score,
                meta: deliberateBlunder ? `故意失误 · 深度 ${depth}` : `最优解 · 深度 ${depth}`,
            });
        }

        return bestMove;
    }

    // 落子并按真实规则移走最早的己方棋子；返回被移走的位置（-1 表示没移走），供回滚
    _place(board, queue, index, player) {
        board[index] = player;
        queue.push(index);
        if (queue.length <= 3) return -1;
        const removed = queue.shift();
        board[removed] = '';
        return removed;
    }

    _unplace(board, queue, index, removed, player) {
        // 回滚顺序必须和 _place 相反: 先恢复被挤掉的老棋子, 再弹出刚落下的这一手
        if (removed >= 0) {
            board[removed] = player;
            queue.unshift(removed);
        }
        queue.pop();
        board[index] = '';
    }

    _minimaxTTT(board, aiQ, huQ, depth, alpha, beta, isMax) {
        const winner = this.getWinner(board);
        if (winner === this.aiPlayer) return 1000 - depth;
        if (winner === this.humanPlayer) return depth - 1000;
        if (depth <= 0) return this._evaluateTTT(board);

        if (isMax) {
            let best = -Infinity;
            for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
                if (board[i] !== '') continue;
                const removed = this._place(board, aiQ, i, this.aiPlayer);
                const score = this._minimaxTTT(board, aiQ, huQ, depth - 1, alpha, beta, false);
                this._unplace(board, aiQ, i, removed, this.aiPlayer);
                if (score > best) best = score;
                if (best > alpha) alpha = best;
                if (beta <= alpha) break;
            }
            return best;
        }
        let best = Infinity;
        for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
            if (board[i] !== '') continue;
            const removed = this._place(board, huQ, i, this.humanPlayer);
            const score = this._minimaxTTT(board, aiQ, huQ, depth - 1, alpha, beta, true);
            this._unplace(board, huQ, i, removed, this.humanPlayer);
            if (score < best) best = score;
            if (best < beta) beta = best;
            if (beta <= alpha) break;
        }
        return best;
    }

    // 搜索到深度上限时的估值: 只数「两子一空」的威胁，够用且便宜
    _evaluateTTT(board) {
        let score = 0;
        for (const combo of this.winningCombos) {
            let ai = 0, hu = 0;
            for (const idx of combo) {
                if (board[idx] === this.aiPlayer) ai++;
                else if (board[idx] === this.humanPlayer) hu++;
            }
            if (ai && hu) continue;
            if (ai === 2) score += 20;
            else if (hu === 2) score -= 20;
            else if (ai === 1) score += 2;
            else if (hu === 1) score -= 2;
        }
        return score;
    }
    
    getWinner(board) {
        for (const combo of this.winningCombos) {
            const [a, b, c] = combo;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }
        return null;
    }
    
    isBoardFull(board) {
        return board.every(cell => cell !== '');
    }
    
    checkWin(player) {
        return this.winningCombos.some(combo => {
            return combo.every(index => this.board[index] === player);
        });
    }
    
    checkDraw() {
        return this.board.every(cell => cell !== '') && !this.checkWin('X') && !this.checkWin('O');
    }
    
    highlightWin(player) {
        for (const combo of this.winningCombos) {
            if (combo.every(index => this.board[index] === player)) {
                combo.forEach(index => {
                    document.querySelector(`.tic-tac-toe-cell[data-index="${index}"]`).classList.add('winning-cell');
                });
                break;
            }
        }
    }
    
    updateUI() {
        const cells = document.querySelectorAll('.tic-tac-toe-cell');
        cells.forEach((cell, index) => {
            cell.textContent = this.board[index];
            cell.classList.remove('winning-cell', 'x-cell', 'o-cell');
            if (this.board[index] === 'X') {
                cell.classList.add('x-cell');
            } else if (this.board[index] === 'O') {
                cell.classList.add('o-cell');
            }
        });
        
        if (this.gameActive) {
            this.statusElement.textContent = `${this.currentPlayer === 'X' ? '❌' : '⭕'} ${this.currentPlayer} 的回合`;
        }
    }
    
    updateScore(winner = null) {
        SkyStorage.migrate('ticTacToeScoreX', 'skystar:v1:tictactoe:scoreX');
        SkyStorage.migrate('ticTacToeScoreO', 'skystar:v1:tictactoe:scoreO');
        let scoreX = SkyStorage.getInt('skystar:v1:tictactoe:scoreX', 0);
        let scoreO = SkyStorage.getInt('skystar:v1:tictactoe:scoreO', 0);

        if (winner === 'X') scoreX++;
        if (winner === 'O') scoreO++;

        SkyStorage.setInt('skystar:v1:tictactoe:scoreX', scoreX);
        SkyStorage.setInt('skystar:v1:tictactoe:scoreO', scoreO);
        
        this.scoreXElement.textContent = scoreX;
        this.scoreOElement.textContent = scoreO;
    }
    
    toggleAI() {
        this.aiEnabled = !this.aiEnabled;
        this.aiBtn.classList.toggle('ai-active');
        this.aiBtn.textContent = this.aiEnabled ? '👤 双人模式' : '🤖 AI模式';
        this.init();
    }
}

whenDomReady(() => {
    const game = new TicTacToeGame();
    window.ticTacToeGame = game;
    game.initDOM();
});

