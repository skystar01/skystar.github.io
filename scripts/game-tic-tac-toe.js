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
        
        this.init();
    }
    
    init() {
        this.board = ['', '', '', '', '', '', '', '', ''];
        this.currentPlayer = 'X';
        this.gameActive = true;
        this.aiThinking = false;
        this.updateUI();
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
        
        this.boardElement.addEventListener('click', (e) => {
            const cell = e.target.closest('.tic-tac-toe-cell');
            if (cell) {
                this.makeMove(parseInt(cell.dataset.index));
            }
        });
        
        this.updateScore();
    }
    
    makeMove(index) {
        if (!this.gameActive || this.board[index] !== '' || this.aiThinking) return;
        
        this.board[index] = this.currentPlayer;
        
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
        this.updateUI();
        
        if (this.aiEnabled && this.currentPlayer === this.aiPlayer && this.gameActive) {
            this.aiThinking = true;
            setTimeout(() => this.aiMove(), 500);
        }
    }
    
    aiMove() {
        if (!this.gameActive) return;
        
        const bestMove = this.findBestMove();
        this.board[bestMove] = this.aiPlayer;
        
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
        this.updateUI();
    }
    
    findBestMove() {
        let bestScore = -Infinity;
        let bestMove = -1;
        
        for (let i = 0; i < 9; i++) {
            if (this.board[i] === '') {
                this.board[i] = this.aiPlayer;
                const score = this.minimax(this.board, 0, false);
                this.board[i] = '';
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = i;
                }
            }
        }
        
        return bestMove;
    }
    
    minimax(board, depth, isMaximizing) {
        const winner = this.getWinner(board);
        
        if (winner === this.aiPlayer) return 10 - depth;
        if (winner === this.humanPlayer) return depth - 10;
        if (this.isBoardFull(board)) return 0;
        
        if (isMaximizing) {
            let bestScore = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (board[i] === '') {
                    board[i] = this.aiPlayer;
                    const score = this.minimax(board, depth + 1, false);
                    board[i] = '';
                    bestScore = Math.max(score, bestScore);
                }
            }
            return bestScore;
        } else {
            let bestScore = Infinity;
            for (let i = 0; i < 9; i++) {
                if (board[i] === '') {
                    board[i] = this.humanPlayer;
                    const score = this.minimax(board, depth + 1, true);
                    board[i] = '';
                    bestScore = Math.min(score, bestScore);
                }
            }
            return bestScore;
        }
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
        let scoreX = parseInt(localStorage.getItem('ticTacToeScoreX') || '0');
        let scoreO = parseInt(localStorage.getItem('ticTacToeScoreO') || '0');
        
        if (winner === 'X') scoreX++;
        if (winner === 'O') scoreO++;
        
        localStorage.setItem('ticTacToeScoreX', scoreX.toString());
        localStorage.setItem('ticTacToeScoreO', scoreO.toString());
        
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

document.addEventListener('DOMContentLoaded', () => {
    const game = new TicTacToeGame();
    game.initDOM();
});