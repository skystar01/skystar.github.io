import '../styles/game-2048.css';
import { whenDomReady } from './dom-ready.js';

// ---------- game-2048.js ----------
class Game2048 {
    constructor(gridId, scoreId, bestScoreId, overlayId, finalScoreId) {
        this.gridContainer = document.getElementById(gridId);
        this.scoreSpan = document.getElementById(scoreId);
        this.bestScoreSpan = document.getElementById(bestScoreId);
        this.gameOverlay = document.getElementById(overlayId);
        this.finalScoreSpan = document.getElementById(finalScoreId);

        this.requiredElements = [
            { name: gridId, element: this.gridContainer },
            { name: scoreId, element: this.scoreSpan },
            { name: bestScoreId, element: this.bestScoreSpan },
            { name: overlayId, element: this.gameOverlay },
            { name: finalScoreId, element: this.finalScoreSpan }
        ];
        this.validateElements(this.requiredElements);
        
        this.board = [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ];
        this.score = 0;
        SkyStorage.migrate('2048best', 'skystar:v1:2048:best');
        this.bestScore = SkyStorage.getInt('skystar:v1:2048:best', 0);
        this.gameActive = true;
        this.aiTimer = null;          // AI 定时器
        this.aiPlaying = false;       // AI 是否正在运行
        this.keydownHandler = (e) => this.handleKeydown(e);
        this.touchStartHandler = (e) => this.handleTouchStart(e);
        this.touchEndHandler = (e) => this.handleTouchEnd(e);
        
        this.bindEvents();
        this.updateBestUI();
        this.initGame();
    }
    
    // ---------- 原有公共方法 ----------
    validateElements(elements) {
        for (let { name, element } of elements) {
            if (!element) {
                throw new Error(`Game2048 初始化失败：找不到页面元素 #${name}`);
            }
        }
    }

    updateBestUI() {
        this.bestScoreSpan.innerText = this.bestScore;
    }
    
    updateScoreUI() {
        this.scoreSpan.innerText = this.score;
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            SkyStorage.setInt('skystar:v1:2048:best', this.bestScore);
            this.updateBestUI();
        }
    }
    
    initGame() {
        this.board = [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ];
        this.score = 0;
        this.gameActive = true;
        this.gameOverlay.classList.remove('active');
        this.updateScoreUI();
        this.addRandomTile();
        this.addRandomTile();
        this.renderBoard();
        // 如果之前 AI 正在运行，停止它（新游戏时）
        if (this.aiPlaying) this.stopAI();
    }
    
    addRandomTile() {
        let emptyCells = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (this.board[i][j] === 0) emptyCells.push({row: i, col: j});
            }
        }
        if (emptyCells.length === 0) return;
        const {row, col} = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        this.board[row][col] = Math.random() < 0.9 ? 2 : 4;
    }
    
    canMove() {
        return this.canMoveBoard(this.board);
    }

    canMoveBoard(board) {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (board[i][j] === 0) return true;
            }
        }
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const val = board[i][j];
                if (j < 3 && val === board[i][j+1]) return true;
                if (i < 3 && val === board[i+1][j]) return true;
            }
        }
        return false;
    }

    areLinesEqual(a, b) {
        for (let i = 0; i < 4; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    areBoardsEqual(a, b) {
        for (let i = 0; i < 4; i++) {
            if (!this.areLinesEqual(a[i], b[i])) return false;
        }
        return true;
    }
    
    mergeLine(line) {
        const { newLine, gain } = this.mergeLinePure(line);
        this.score += gain;
        return newLine;
    }

    mergeLinePure(line) {
        let filtered = line.filter(v => v !== 0);
        let newLine = [];
        let gain = 0;
        for (let i = 0; i < filtered.length; i++) {
            if (i + 1 < filtered.length && filtered[i] === filtered[i+1]) {
                let merged = filtered[i] * 2;
                newLine.push(merged);
                gain += merged;
                i++;
            } else {
                newLine.push(filtered[i]);
            }
        }
        while (newLine.length < 4) newLine.push(0);
        return { newLine, gain };
    }
    
    moveLeft() {
        let changed = false;
        for (let i = 0; i < 4; i++) {
            let original = [...this.board[i]];
            let newRow = this.mergeLine(original);
            if (!this.areLinesEqual(original, newRow)) changed = true;
            this.board[i] = newRow;
        }
        return changed;
    }
    
    moveRight() {
        let changed = false;
        for (let i = 0; i < 4; i++) {
            let original = [...this.board[i]].reverse();
            let merged = this.mergeLine(original);
            let newRow = merged.reverse();
            if (!this.areLinesEqual(this.board[i], newRow)) changed = true;
            this.board[i] = newRow;
        }
        return changed;
    }
    
    moveUp() {
        let changed = false;
        let transposed = this.board[0].map((_, col) => this.board.map(row => row[col]));
        for (let i = 0; i < 4; i++) {
            let original = [...transposed[i]];
            let newRow = this.mergeLine(original);
            if (!this.areLinesEqual(original, newRow)) changed = true;
            transposed[i] = newRow;
        }
        this.board = transposed[0].map((_, col) => transposed.map(row => row[col]));
        return changed;
    }
    
    moveDown() {
        let changed = false;
        let transposed = this.board[0].map((_, col) => this.board.map(row => row[col]));
        for (let i = 0; i < 4; i++) {
            let original = [...transposed[i]].reverse();
            let merged = this.mergeLine(original);
            let newRow = merged.reverse();
            if (!this.areLinesEqual(transposed[i], newRow)) changed = true;
            transposed[i] = newRow;
        }
        this.board = transposed[0].map((_, col) => transposed.map(row => row[col]));
        return changed;
    }
    
    performMove(moveFunc) {
        if (!this.gameActive) return false;
        let changed = moveFunc();
        if (changed) {
            this.updateScoreUI();
            this.addRandomTile();
            this.renderBoard();
            if (!this.canMove()) {
                this.gameActive = false;
                this.finalScoreSpan.innerText = this.score;
                this.gameOverlay.classList.add('active');
                // AI 自动停止
                if (this.aiPlaying) this.stopAI();
            }
        }
        return changed;
    }
    
    renderBoard() {
        this.gridContainer.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const value = this.board[i][j];
                const cell = document.createElement('div');
                cell.classList.add('cell-2048');
                if (value !== 0) {
                    cell.innerText = value;
                    if (value <= 2048) {
                        cell.classList.add(`tile-2048-${value}`);
                    } else {
                        cell.classList.add('tile-2048-super');
                    }
                } else {
                    cell.innerText = '';
                }
                this.gridContainer.appendChild(cell);
            }
        }
    }
    
    newGame() {
        this.initGame();
    }
    
    // ---------- 键盘/触摸事件 ----------
    handleKeydown(e) {
        if (!this.gameActive || this.aiPlaying) return;  // AI 运行时禁止手动操作
        const key = e.key;
        switch (key) {
            case 'ArrowLeft': e.preventDefault(); this.performMove(() => this.moveLeft()); break;
            case 'ArrowRight': e.preventDefault(); this.performMove(() => this.moveRight()); break;
            case 'ArrowUp': e.preventDefault(); this.performMove(() => this.moveUp()); break;
            case 'ArrowDown': e.preventDefault(); this.performMove(() => this.moveDown()); break;
            default: break;
        }
    }
    
    bindEvents() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        
        document.addEventListener('keydown', this.keydownHandler);
        this.gridContainer.addEventListener('touchstart', this.touchStartHandler);
        this.gridContainer.addEventListener('touchend', this.touchEndHandler);
    }

    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        e.preventDefault();
    }

    handleTouchEnd(e) {
        if (!this.gameActive || this.aiPlaying) return;
        let deltaX = e.changedTouches[0].clientX - this.touchStartX;
        let deltaY = e.changedTouches[0].clientY - this.touchStartY;
        if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) return;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) this.performMove(() => this.moveRight());
            else this.performMove(() => this.moveLeft());
        } else {
            if (deltaY > 0) this.performMove(() => this.moveDown());
            else this.performMove(() => this.moveUp());
        }
        e.preventDefault();
    }

    destroy() {
        document.removeEventListener('keydown', this.keydownHandler);
        this.gridContainer.removeEventListener('touchstart', this.touchStartHandler);
        this.gridContainer.removeEventListener('touchend', this.touchEndHandler);
        this.stopAI();
    }
    
    // ---------- AI 核心算法 (Expectimax) ----------
    // 纯函数：克隆棋盘
    cloneBoard(board) {
        return board.map(row => [...row]);
    }
    
    // 纯函数：获取空格
    getEmptyCells(board) {
        let cells = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (board[i][j] === 0) cells.push([i, j]);
            }
        }
        return cells;
    }
    
    // 纯函数：移动（不修改原棋盘，返回新棋盘）
    moveBoard(board, direction) {
        let newBoard = this.cloneBoard(board);
        let scoreGain = 0;
        
        if (direction === 'left') {
            for (let i = 0; i < 4; i++) {
                let original = newBoard[i];
                let { newLine, gain } = this.mergeLinePure(original);
                newBoard[i] = newLine;
                scoreGain += gain;
            }
        } else if (direction === 'right') {
            for (let i = 0; i < 4; i++) {
                let original = [...newBoard[i]].reverse();
                let { newLine, gain } = this.mergeLinePure(original);
                newBoard[i] = newLine.reverse();
                scoreGain += gain;
            }
        } else if (direction === 'up') {
            let transposed = newBoard[0].map((_, col) => newBoard.map(row => row[col]));
            for (let i = 0; i < 4; i++) {
                let original = transposed[i];
                let { newLine, gain } = this.mergeLinePure(original);
                transposed[i] = newLine;
                scoreGain += gain;
            }
            newBoard = transposed[0].map((_, col) => transposed.map(row => row[col]));
        } else if (direction === 'down') {
            let transposed = newBoard[0].map((_, col) => newBoard.map(row => row[col]));
            for (let i = 0; i < 4; i++) {
                let original = [...transposed[i]].reverse();
                let { newLine, gain } = this.mergeLinePure(original);
                transposed[i] = newLine.reverse();
                scoreGain += gain;
            }
            newBoard = transposed[0].map((_, col) => transposed.map(row => row[col]));
        }
        return { newBoard, scoreGain };
    }
    
    // 评估函数（启发式）
    evaluateBoard(board) {
        // 权重可被 AI 实验台覆盖; evalW 由 getBestMove 每次决策前写入一次,
        // 避免在 expectimax 的叶子里成千上万次查表
        const W = this.evalW || { empty: 200, smooth: 1.5, mono: 2, corner: 1000 };
        let empty = 0;
        let smoothness = 0;
        let monotonicity = 0;
        let maxTile = 0;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let val = board[i][j];
                if (val === 0) {
                    empty++;
                } else {
                    maxTile = Math.max(maxTile, val);
                    if (j < 3) {
                        let diff = Math.abs(val - board[i][j+1]);
                        smoothness -= diff;
                        if (val > board[i][j+1]) monotonicity += val - board[i][j+1];
                        else monotonicity -= board[i][j+1] - val;
                    }
                    if (i < 3) {
                        let diff = Math.abs(val - board[i+1][j]);
                        smoothness -= diff;
                        if (val > board[i+1][j]) monotonicity += val - board[i+1][j];
                        else monotonicity -= board[i+1][j] - val;
                    }
                }
            }
        }
        // 角落奖励
        let cornerBonus = 0;
        if (board[0][0] === maxTile) cornerBonus = W.corner;
        else if (board[0][3] === maxTile || board[3][0] === maxTile || board[3][3] === maxTile) cornerBonus = W.corner * 0.5;
        return empty * W.empty + smoothness * W.smooth + monotonicity * W.mono + cornerBonus;
    }
    
    // Expectimax 递归（带缓存）
    expectimax(board, depth, isPlayerTurn) {
        if (depth === 0) return this.evaluateBoard(board);
        if (!this.aiCache) this.aiCache = new Map();
        let key = `${board.flat().join(',')}|${depth}|${isPlayerTurn}`;
        if (this.aiCache && this.aiCache.has(key)) return this.aiCache.get(key);
        
        if (isPlayerTurn) {
            let best = -Infinity;
            let hasMove = false;
            for (let dir of ['left', 'right', 'up', 'down']) {
                let { newBoard } = this.moveBoard(board, dir);
                if (!this.areBoardsEqual(newBoard, board)) {
                    hasMove = true;
                    let score = this.expectimax(newBoard, depth - 1, false);
                    best = Math.max(best, score);
                }
            }
            if (!hasMove) best = this.evaluateBoard(board);
            this.aiCache.set(key, best);
            return best;
        } else {
            let empty = this.getEmptyCells(board);
            if (empty.length === 0) return this.evaluateBoard(board);
            let total = 0;
            for (let [x, y] of empty) {
                let board2 = this.cloneBoard(board);
                board2[x][y] = 2;
                let score2 = this.expectimax(board2, depth - 1, true);
                let board4 = this.cloneBoard(board);
                board4[x][y] = 4;
                let score4 = this.expectimax(board4, depth - 1, true);
                total += (score2 * 0.9 + score4 * 0.1);
            }
            let avg = total / empty.length;
            this.aiCache.set(key, avg);
            return avg;
        }
    }
    
    // 获取最佳移动方向
    getBestMove() {
        this.aiCache = new Map();
        // 搜索深度与评估权重都可被 AI 实验台覆盖; 兜底值与旧行为一致
        const depth = (window.aiLab && window.aiLab.get('2048', 'searchDepth', 3)) || 3;
        this.evalW = window.aiLab ? {
            empty: window.aiLab.get('2048', 'wEmpty', 200),
            smooth: window.aiLab.get('2048', 'wSmooth', 1.5),
            mono: window.aiLab.get('2048', 'wMono', 2),
            corner: window.aiLab.get('2048', 'wCorner', 1000),
        } : null;
        let bestDir = null;
        let bestScore = -Infinity;
        const ranked = [];
        const startedAt = performance.now();
        for (let dir of ['left', 'right', 'up', 'down']) {
            let { newBoard } = this.moveBoard(this.board, dir);
            if (!this.areBoardsEqual(newBoard, this.board)) {
                let score = this.expectimax(newBoard, depth, false);
                ranked.push({ dir, score });
                if (score > bestScore) {
                    bestScore = score;
                    bestDir = dir;
                }
            }
        }
        // 上报决策摘要: 让「AI 为什么选这个方向」从黑箱变成一行可读的数字
        if (ranked.length && window.aiTrace) {
            const sorted = [...ranked].sort((a, b) => b.score - a.score);
            window.aiTrace.report('2048', {
                candidates: ranked.length,
                unit: '个方向',
                ms: performance.now() - startedAt,
                choice: { left: '左移', right: '右移', up: '上移', down: '下移' }[bestDir] || bestDir,
                score: sorted[0]?.score,
                runnerUp: sorted[1]?.score,
                meta: `深度 ${depth}`,
            });
        }
        return bestDir;
    }
    
    // AI 自动走一步
    aiStep() {
        if (!this.gameActive) {
            this.stopAI();
            return;
        }
        let bestDir = this.getBestMove();
        if (!bestDir) {
            // 无可用移动，游戏可能结束了
            if (!this.canMove()) {
                this.gameActive = false;
                this.finalScoreSpan.innerText = this.score;
                this.gameOverlay.classList.add('active');
                this.stopAI();
            }
            return;
        }
        // 执行移动
        switch (bestDir) {
            case 'left': this.performMove(() => this.moveLeft()); break;
            case 'right': this.performMove(() => this.moveRight()); break;
            case 'up': this.performMove(() => this.moveUp()); break;
            case 'down': this.performMove(() => this.moveDown()); break;
        }
    }
    
    // 启动 AI（间隔毫秒）
    startAI(delayMs = 50) {
        if (this.aiPlaying) return;
        if (!this.gameActive) this.newGame();   // 如果游戏结束，自动新开一局
        this.aiPlaying = true;
        if (this.aiTimer) clearInterval(this.aiTimer);
        this.aiTimer = setInterval(() => {
            this.aiStep();
        }, delayMs);
        // 更新按钮状态
        this.updateAIButtonState();
    }
    
    stopAI() {
        if (this.aiTimer) {
            clearInterval(this.aiTimer);
            this.aiTimer = null;
        }
        this.aiPlaying = false;
        // 更新按钮状态
        this.updateAIButtonState();
    }
    
    // 更新 AI 按钮的视觉状态
    updateAIButtonState() {
        const aiBtn = document.getElementById('toggleAI2048');
        if (aiBtn) {
            if (this.aiPlaying) {
                aiBtn.textContent = '⏹️ 停止 AI';
                aiBtn.classList.add('ai-active');
            } else {
                aiBtn.textContent = '🤖 AI 模式';
                aiBtn.classList.remove('ai-active');
            }
        }
    }
}

// 页面加载时初始化
whenDomReady(() => {
    const game2048 = new Game2048(
        'grid2048',
        'score2048',
        'bestScore2048',
        'gameOverlay2048',
        'finalScore2048'
    );
    window.game2048 = game2048;   // 暴露全局，供按钮调用

    const newGameBtn = document.getElementById('newGame2048');
    const overlayRestartBtn = document.getElementById('overlayRestart2048');
    const aiBtn = document.getElementById('toggleAI2048');

    game2048.validateElements([
        { name: 'newGame2048', element: newGameBtn },
        { name: 'overlayRestart2048', element: overlayRestartBtn },
        { name: 'toggleAI2048', element: aiBtn }
    ]);
    
    newGameBtn.addEventListener('click', () => game2048.newGame());
    overlayRestartBtn.addEventListener('click', () => {
        game2048.newGame();
        game2048.gameOverlay.classList.remove('active');
    });
    
    // AI 模式切换按钮
    aiBtn.addEventListener('click', () => {
        if (game2048.aiPlaying) {
            // 停止 AI
            game2048.stopAI();
            aiBtn.textContent = '🤖 AI 模式';
            aiBtn.classList.remove('ai-active');
        } else {
            // 启动 AI
            game2048.startAI(80);  // 80ms 间隔，视觉效果更好
            aiBtn.textContent = '⏹️ 停止 AI';
            aiBtn.classList.add('ai-active');
        }
    });
});

