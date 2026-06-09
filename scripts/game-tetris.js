class TetrisGame {
    constructor(canvasId, scoreId, levelId, linesId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.scoreElement = document.getElementById(scoreId);
        this.levelElement = document.getElementById(levelId);
        this.linesElement = document.getElementById(linesId);
        
        this.COLS = 10;
        this.ROWS = 20;
        this.BLOCK_SIZE = 28;
        this.canvas.width = this.COLS * this.BLOCK_SIZE;
        this.canvas.height = this.ROWS * this.BLOCK_SIZE;
        
        this.board = [];
        this.currentPiece = null;
        this.currentPosition = { x: 0, y: 0 };
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameRunning = false;
        this.gameOver = false;
        this.paused = false;
        
        this.dropInterval = 1000;
        this.lastDropTime = 0;
        
        this.flashRows = [];
        this.flashTimeout = null;
        this.ghostY = 0;
        
        this.TETROMINOES = {
            I: { shape: [[1, 1, 1, 1]], color: '#00f5ff' },
            O: { shape: [[1, 1], [1, 1]], color: '#ffeb3b' },
            T: { shape: [[0, 1, 0], [1, 1, 1]], color: '#d53aff' },
            S: { shape: [[0, 1, 1], [1, 1, 0]], color: '#4caf50' },
            Z: { shape: [[1, 1, 0], [0, 1, 1]], color: '#ff4d4d' },
            J: { shape: [[1, 0, 0], [1, 1, 1]], color: '#3a86ff' },
            L: { shape: [[0, 0, 1], [1, 1, 1]], color: '#ff9e3a' }
        };
        
        this.initBoard();
        this.bindEvents();
        this.drawBoard();
    }
    
    initBoard() {
        this.board = Array(this.ROWS).fill(null).map(() => Array(this.COLS).fill(null));
        this.flashRows = [];
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
    }
    
    createPiece(type) {
        const tetromino = this.TETROMINOES[type];
        return {
            type: type,
            shape: tetromino.shape.map(row => [...row]),
            color: tetromino.color
        };
    }
    
    getRandomPiece() {
        const types = Object.keys(this.TETROMINOES);
        const type = types[Math.floor(Math.random() * types.length)];
        return this.createPiece(type);
    }
    
    spawnPiece() {
        this.currentPiece = this.getRandomPiece();
        this.currentPosition = {
            x: Math.floor((this.COLS - this.currentPiece.shape[0].length) / 2),
            y: 0
        };
        this.updateGhostPosition();
        
        if (!this.isValidPosition(this.currentPosition.x, this.currentPosition.y)) {
            this.gameOver = true;
            this.gameRunning = false;
            this.drawBoard();
        }
    }
    
    updateGhostPosition() {
        if (!this.currentPiece) return;
        let y = this.currentPosition.y;
        while (this.isValidPosition(this.currentPosition.x, y + 1)) {
            y++;
        }
        this.ghostY = y;
    }
    
    isValidPosition(x, y, piece = null) {
        const shape = piece ? piece.shape : this.currentPiece.shape;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const newX = x + col;
                    const newY = y + row;
                    if (newX < 0 || newX >= this.COLS || newY >= this.ROWS) {
                        return false;
                    }
                    if (newY >= 0 && this.board[newY][newX]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    
    rotatePiece() {
        if (!this.currentPiece || this.paused || !this.gameRunning) return;
        
        const shape = this.currentPiece.shape;
        const rows = shape.length;
        const cols = shape[0].length;
        const rotated = [];
        for (let col = 0; col < cols; col++) {
            const newRow = [];
            for (let row = rows - 1; row >= 0; row--) {
                newRow.push(shape[row][col]);
            }
            rotated.push(newRow);
        }
        
        const oldShape = this.currentPiece.shape;
        this.currentPiece.shape = rotated;
        if (!this.isValidPosition(this.currentPosition.x, this.currentPosition.y)) {
            this.currentPiece.shape = oldShape;
        } else {
            this.updateGhostPosition();
        }
    }
    
    moveLeft() {
        if (!this.gameRunning || this.paused || !this.currentPiece) return;
        if (this.isValidPosition(this.currentPosition.x - 1, this.currentPosition.y)) {
            this.currentPosition.x--;
            this.updateGhostPosition();
        }
    }
    
    moveRight() {
        if (!this.gameRunning || this.paused || !this.currentPiece) return;
        if (this.isValidPosition(this.currentPosition.x + 1, this.currentPosition.y)) {
            this.currentPosition.x++;
            this.updateGhostPosition();
        }
    }
    
    moveDown() {
        if (!this.gameRunning || this.paused || !this.currentPiece) return;
        if (this.isValidPosition(this.currentPosition.x, this.currentPosition.y + 1)) {
            this.currentPosition.y++;
            this.updateGhostPosition();
            return true;
        }
        this.lockPiece();
        return false;
    }
    
    hardDrop() {
        if (!this.gameRunning || this.paused || !this.currentPiece) return;
        while (this.isValidPosition(this.currentPosition.x, this.currentPosition.y + 1)) {
            this.currentPosition.y++;
        }
        this.updateGhostPosition();
        this.lockPiece();
    }
    
    lockPiece() {
        const shape = this.currentPiece.shape;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const y = this.currentPosition.y + row;
                    const x = this.currentPosition.x + col;
                    if (y >= 0 && y < this.ROWS) {
                        this.board[y][x] = this.currentPiece.color;
                    }
                }
            }
        }
        this.clearLinesWithEffect();
        this.spawnPiece();
        this.drawBoard();
    }
    
    clearLinesWithEffect() {
        let rowsToClear = [];
        for (let row = this.ROWS - 1; row >= 0; row--) {
            if (this.board[row].every(cell => cell !== null)) {
                rowsToClear.push(row);
            }
        }
        
        if (rowsToClear.length === 0) return;
        
        this.flashRows = [...rowsToClear];
        const clearedLines = Math.min(rowsToClear.length, 4);
        const lineScores = [0, 100, 300, 500, 800];
        const points = lineScores[clearedLines] || 0;
        this.score += Math.min(points * this.level, 1000000000);
        if (isNaN(this.score)) this.score = 0;
        this.lines += clearedLines;
        
        const newLevel = Math.floor(this.lines / 10) + 1;
        if (newLevel > this.level) {
            this.level = newLevel;
            this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 90);
        }
        this.updateUI();
        
        for (let row of rowsToClear) {
            this.board.splice(row, 1);
            this.board.unshift(Array(this.COLS).fill(null));
        }
        
        this.drawBoard();
        
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        this.flashTimeout = setTimeout(() => {
            this.flashRows = [];
            this.drawBoard();
        }, 180);
    }
    
    drawBlock(x, y, color, isGhost = false) {
        const size = this.BLOCK_SIZE;
        const pad = 1;
        const radius = 6;
        const rectX = x * size + pad / 2;
        const rectY = y * size + pad / 2;
        const w = size - pad;
        const h = size - pad;
        
        if (isGhost) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.4;
            this.ctx.fillStyle = color;
            this.ctx.shadowBlur = 0;
            this.roundRect(rectX, rectY, w, h, radius);
            this.ctx.fill();
            this.ctx.globalAlpha = 0.8;
            this.ctx.strokeStyle = '#ffffffcc';
            this.ctx.lineWidth = 2;
            this.roundRect(rectX, rectY, w, h, radius);
            this.ctx.stroke();
            this.ctx.restore();
            return;
        }
        
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
        this.ctx.fillStyle = color;
        this.roundRect(rectX, rectY, w, h, radius);
        this.ctx.fill();
        
        const grad = this.ctx.createLinearGradient(rectX, rectY, rectX + w * 0.3, rectY + h * 0.3);
        grad.addColorStop(0, 'rgba(255,255,255,0.65)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        this.ctx.fillStyle = grad;
        this.roundRect(rectX, rectY, w, h, radius);
        this.ctx.fill();
        
        this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        this.ctx.lineWidth = 1;
        this.roundRect(rectX, rectY, w, h, radius);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }
    
    roundRect(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + r, y);
        this.ctx.lineTo(x + w - r, y);
        this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        this.ctx.lineTo(x + w, y + h - r);
        this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.ctx.lineTo(x + r, y + h);
        this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        this.ctx.lineTo(x, y + r);
        this.ctx.quadraticCurveTo(x, y, x + r, y);
        this.ctx.closePath();
    }
    
    drawBoard() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.strokeStyle = '#2a3345';
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i <= this.COLS; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.BLOCK_SIZE, 0);
            this.ctx.lineTo(i * this.BLOCK_SIZE, this.canvas.height);
            this.ctx.stroke();
        }
        for (let i = 0; i <= this.ROWS; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.BLOCK_SIZE);
            this.ctx.lineTo(this.canvas.width, i * this.BLOCK_SIZE);
            this.ctx.stroke();
        }
        
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                if (this.board[row][col]) {
                    this.drawBlock(col, row, this.board[row][col], false);
                }
            }
        }
        
        if (this.currentPiece && this.gameRunning && !this.paused && this.ghostY !== undefined) {
            const shape = this.currentPiece.shape;
            for (let row = 0; row < shape.length; row++) {
                for (let col = 0; col < shape[row].length; col++) {
                    if (shape[row][col]) {
                        const x = this.currentPosition.x + col;
                        const y = this.ghostY + row;
                        if (y >= 0 && y < this.ROWS && !this.board[y]?.[x]) {
                            this.drawBlock(x, y, this.currentPiece.color, true);
                        }
                    }
                }
            }
        }
        
        if (this.currentPiece) {
            const shape = this.currentPiece.shape;
            for (let row = 0; row < shape.length; row++) {
                for (let col = 0; col < shape[row].length; col++) {
                    if (shape[row][col]) {
                        const x = this.currentPosition.x + col;
                        const y = this.currentPosition.y + row;
                        if (y >= 0) {
                            this.drawBlock(x, y, this.currentPiece.color, false);
                        }
                    }
                }
            }
        }
        
        if (this.flashRows.length > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.75;
            this.ctx.fillStyle = '#ffffffcc';
            for (let row of this.flashRows) {
                this.ctx.fillRect(0, row * this.BLOCK_SIZE, this.canvas.width, this.BLOCK_SIZE);
            }
            this.ctx.restore();
        }
        
        if (this.paused && this.gameRunning) {
            this.ctx.font = 'bold 24px Arial';
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#f0fcff';
            this.ctx.shadowColor = '#00c8ff';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('⏸ PAUSED', this.canvas.width / 2, this.canvas.height / 2);
        }
        
        if (this.gameOver) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.font = 'bold 32px Arial';
            this.ctx.fillStyle = '#ff4d4d';
            this.ctx.shadowColor = '#ff0000';
            this.ctx.shadowBlur = 10;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 30);
            
            this.ctx.font = 'bold 20px Arial';
            this.ctx.fillStyle = '#ffd966';
            this.ctx.shadowColor = '#ffaa00';
            this.ctx.fillText(`得分: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 10);
            
            this.ctx.font = '16px Arial';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowBlur = 0;
            this.ctx.fillText('点击「开始游戏」重新开始', this.canvas.width / 2, this.canvas.height / 2 + 50);
            this.ctx.restore();
        }
    }
    
    updateUI() {
        this.scoreElement.textContent = this.score;
        this.levelElement.textContent = this.level;
        this.linesElement.textContent = this.lines;
    }
    
    start() {
        this.initBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameRunning = true;
        this.gameOver = false;
        this.paused = false;
        this.dropInterval = 1000;
        this.flashRows = [];
        this.aiPlaying = false;
        if (this.aiTimer) clearInterval(this.aiTimer);
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        this.updateUI();
        this.spawnPiece();
        this.lastDropTime = Date.now();
        this.drawBoard();
        this.gameLoop();
    }
    
    togglePause() {
        if (!this.gameRunning || this.gameOver) return;
        this.paused = !this.paused;
        if (!this.paused) {
            this.lastDropTime = Date.now();
            this.drawBoard();
            this.gameLoop();
        } else {
            this.drawBoard();
        }
    }
    
    gameLoop() {
        if (!this.gameRunning || this.gameOver || this.paused) {
            if (this.paused) {
                requestAnimationFrame(() => this.gameLoop());
            }
            return;
        }
        
        const now = Date.now();
        if (now - this.lastDropTime > this.dropInterval) {
            this.moveDown();
            this.lastDropTime = now;
        }
        
        this.drawBoard();
        requestAnimationFrame(() => this.gameLoop());
    }
    
    // ========== AI 算法 (Pierre Dellacherie 启发式) ==========
    
    cloneBoard(board) {
        return board.map(row => [...row]);
    }
    
    getDropPosition(board, shape, startX) {
        let y = 0;
        while (this.canPlacePieceAt(board, shape, startX, y + 1)) {
            y++;
        }
        return y;
    }
    
    canPlacePieceAt(board, shape, x, y) {
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const newX = x + col;
                    const newY = y + row;
                    if (newX < 0 || newX >= this.COLS || newY >= this.ROWS) {
                        return false;
                    }
                    if (newY >= 0 && board[newY][newX]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    
    getRotations(shape) {
        const rotations = [shape];
        let current = shape;
        for (let i = 0; i < 3; i++) {
            const rows = current.length;
            const cols = current[0].length;
            const rotated = [];
            for (let col = 0; col < cols; col++) {
                const newRow = [];
                for (let row = rows - 1; row >= 0; row--) {
                    newRow.push(current[row][col]);
                }
                rotated.push(newRow);
            }
            rotations.push(rotated);
            current = rotated;
        }
        return rotations;
    }
    
    placePieceOnBoard(board, shape, x, y) {
        const newBoard = this.cloneBoard(board);
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const newY = y + row;
                    const newX = x + col;
                    if (newY >= 0 && newY < this.ROWS && newX >= 0 && newX < this.COLS) {
                        newBoard[newY][newX] = true;
                    }
                }
            }
        }
        return newBoard;
    }
    
    // 计算列高度
    getColumnHeights(board) {
        const heights = Array(this.COLS).fill(0);
        for (let col = 0; col < this.COLS; col++) {
            for (let row = 0; row < this.ROWS; row++) {
                if (board[row][col]) {
                    heights[col] = this.ROWS - row;
                    break;
                }
            }
        }
        return heights;
    }
    
    // 计算消除行数
    countCompleteLines(board) {
        let count = 0;
        for (let row = 0; row < this.ROWS; row++) {
            if (board[row].every(cell => cell)) {
                count++;
            }
        }
        return count;
    }
    
    // 计算空洞数（被覆盖的空位）
    countHoles(board, heights) {
        let holes = 0;
        for (let col = 0; col < this.COLS; col++) {
            let blockFound = false;
            for (let row = this.ROWS - heights[col]; row < this.ROWS; row++) {
                if (row < 0) continue;
                if (board[row][col]) {
                    blockFound = true;
                } else if (blockFound) {
                    holes++;
                }
            }
        }
        return holes;
    }
    
    // 计算表面不平整度
    getBumpiness(heights) {
        let bumpiness = 0;
        for (let i = 0; i < heights.length - 1; i++) {
            bumpiness += Math.abs(heights[i] - heights[i + 1]);
        }
        return bumpiness;
    }
    
    // 评估函数 (Pierre Dellacherie)
    evaluateBoard(board) {
        const heights = this.getColumnHeights(board);
        const aggregateHeight = heights.reduce((a, b) => a + b, 0);
        const completeLines = this.countCompleteLines(board);
        const holes = this.countHoles(board, heights);
        const bumpiness = this.getBumpiness(heights);
        
        // 权重 (经过优化的经典参数)
        return -0.510066 * aggregateHeight
             + 0.760666 * completeLines
             - 0.35663 * holes
             - 0.184483 * bumpiness;
    }
    
    // 寻找当前方块的最佳放置位置
    findBestMove() {
        if (!this.currentPiece) return null;
        
        const rotations = this.getRotations(this.currentPiece.shape);
        let bestScore = -Infinity;
        let bestMove = null;
        
        for (const shape of rotations) {
            for (let x = -2; x < this.COLS + 2; x++) {
                if (!this.canPlacePieceAt(this.board, shape, x, 0)) continue;
                
                const y = this.getDropPosition(this.board, shape, x);
                if (y < 0) continue;
                
                const newBoard = this.placePieceOnBoard(this.board, shape, x, y);
                const score = this.evaluateBoard(newBoard);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = { shape, x, y };
                }
            }
        }
        
        return bestMove;
    }
    
    // 执行 AI 移动到目标位置
    executeAIMove() {
        if (!this.gameRunning || this.gameOver || this.paused || !this.aiPlaying) return;
        
        const bestMove = this.findBestMove();
        if (!bestMove) return;
        
        // 计算需要旋转的次数
        const originalShape = this.currentPiece.shape;
        let rotationCount = 0;
        for (let r = 0; r < this.getRotations(originalShape).length; r++) {
            if (this.shapesEqual(this.getRotations(originalShape)[r], bestMove.shape)) {
                rotationCount = r;
                break;
            }
        }
        
        // 旋转到目标姿态
        for (let i = 0; i < rotationCount; i++) {
            this.rotatePiece();
        }
        
        // 移动到目标 X 位置
        const dx = bestMove.x - this.currentPosition.x;
        if (dx > 0) {
            for (let i = 0; i < dx; i++) this.moveRight();
        } else if (dx < 0) {
            for (let i = 0; i < -dx; i++) this.moveLeft();
        }
        
        // 硬降落
        this.hardDrop();
    }
    
    shapesEqual(s1, s2) {
        if (s1.length !== s2.length) return false;
        for (let i = 0; i < s1.length; i++) {
            if (s1[i].length !== s2[i].length) return false;
            for (let j = 0; j < s1[i].length; j++) {
                if (s1[i][j] !== s2[i][j]) return false;
            }
        }
        return true;
    }
    
    startAI(intervalMs = 400) {
        if (this.aiPlaying) return;
        if (!this.gameRunning) this.start();
        this.aiPlaying = true;
        this.updateAIButton();
        
        this.aiTimer = setInterval(() => {
            if (this.gameRunning && !this.gameOver && !this.paused) {
                this.executeAIMove();
            } else if (this.gameOver) {
                this.stopAI();
            }
        }, intervalMs);
    }
    
    stopAI() {
        if (this.aiTimer) {
            clearInterval(this.aiTimer);
            this.aiTimer = null;
        }
        this.aiPlaying = false;
        this.updateAIButton();
    }
    
    updateAIButton() {
        const btn = document.getElementById('tetrisAI');
        if (btn) {
            if (this.aiPlaying) {
                btn.textContent = '⏹️ 停止 AI';
                btn.classList.add('ai-active');
            } else {
                btn.textContent = '🤖 AI 模式';
                btn.classList.remove('ai-active');
            }
        }
    }
    
    bindEvents() {
        document.addEventListener('keydown', (e) => {
            const key = e.code;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'Escape'].includes(key)) {
                e.preventDefault();
            }
            switch (key) {
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft();
                    this.drawBoard();
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight();
                    this.drawBoard();
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.moveDown();
                    this.drawBoard();
                    break;
                case 'ArrowUp':
                case 'KeyW':
                    this.rotatePiece();
                    this.drawBoard();
                    break;
                case 'Space':
                    this.hardDrop();
                    this.drawBoard();
                    break;
                case 'KeyP':
                case 'Escape':
                    this.togglePause();
                    this.drawBoard();
                    break;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tetris = new TetrisGame(
        'tetrisCanvas',
        'tetrisScore',
        'tetrisLevel',
        'tetrisLines'
    );
    window.tetris = tetris;
    
    document.getElementById('tetrisStart').addEventListener('click', () => {
        if (tetris.aiPlaying) tetris.stopAI();
        tetris.start();
    });
    
    document.getElementById('tetrisAI').addEventListener('click', () => {
        if (tetris.aiPlaying) {
            tetris.stopAI();
        } else {
            tetris.startAI(100);
        }
    });
});