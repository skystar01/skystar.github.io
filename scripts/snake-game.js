class SnakeGame {
    constructor(canvasId, scoreId, statusId, overlayId, finalScoreId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.scoreEl = document.getElementById(scoreId);
        this.statusEl = document.getElementById(statusId);
        this.overlay = document.getElementById(overlayId);
        this.finalScoreEl = document.getElementById(finalScoreId);

        this.WINDOW_WIDTH = 0;
        this.WINDOW_HEIGHT = 0;
        this.CELL_SIZE = 0;
        this.CELL_X = 0;
        this.CELL_Y = 0;

        this.FPS = 8;
        this.MAX_FPS = 30;
        this.AI_FPS = 15;
        this.SPEED_INCREASE_SCORE = 30;

        this.COLORS = {
            bgDark: '#0f172a',
            bgLight: '#1e293b',
            grid: '#1e3a5f',
            snakeHead: '#22c55e',
            snakeHeadGlow: '#34d399',
            snakeBody: '#16a34a',
            snakeBodyDark: '#15803d',
            food: '#ef4444',
            foodGlow: '#f87171',
            text: '#e2e8f0',
            score: '#fbbf24'
        };

        this.snake = [];
        this.direction = { x: 1, y: 0 };
        this.food = { x: 0, y: 0 };
        this.score = 0;
        this.running = false;
        this.paused = false;
        this.aiMode = false;
        this.foodGlowIntensity = 0;
        this.foodGlowDirection = 1;
        this.animationId = null;

        this.init();
    }

    init() {
        this.fitSnake();
        this.setupEventListeners();
    }

    // 根据 game-container 的可用空间计算 canvas 尺寸和网格
    fitSnake() {
        const container = this.canvas.parentElement;
        if (!container) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const header = container.querySelector('.game-header');
        const instructions = container.querySelector('.game-instructions');
        const controls = container.querySelector('.game-controls');
        const outerH = (el) => {
            if (!el) return 0;
            const s = getComputedStyle(el);
            return el.offsetHeight + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0);
        };
        const headerH = outerH(header);
        const instrH = outerH(instructions);
        const ctrlH = outerH(controls);
        const availW = container.clientWidth - padX;
        const availH = container.clientHeight - padY - headerH - instrH - ctrlH;
        if (availW <= 0 || availH <= 0) return;

        const aspect = availW / availH;
        const targetCells = 480;
        const gridX = Math.max(18, Math.round(Math.sqrt(targetCells * aspect)));
        const gridY = Math.max(18, Math.round(targetCells / gridX));
        const cellSize = Math.min(availW / gridX, availH / gridY);

        this.canvas.width = Math.floor(gridX * cellSize);
        this.canvas.height = Math.floor(gridY * cellSize);
        this.canvas.style.width = this.canvas.width + 'px';
        this.canvas.style.height = this.canvas.height + 'px';
        this.WINDOW_WIDTH = this.canvas.width;
        this.WINDOW_HEIGHT = this.canvas.height;
        this.CELL_SIZE = cellSize;
        this.CELL_X = gridX;
        this.CELL_Y = gridY;

        this.render();
    }

    render() {
        this.drawGradientBg();
        this.drawGrid();
        if (this.running) {
            this.drawFood();
            this.drawSnake();
            this.drawUI();
        }
    }

    initGame() {
        const midX = Math.floor(this.CELL_X / 2);
        const midY = Math.floor(this.CELL_Y / 2);
        this.snake = [
            { x: midX, y: midY },
            { x: midX - 1, y: midY },
            { x: midX - 2, y: midY }
        ];
        this.direction = { x: 1, y: 0 };
        this.score = 0;
        this.FPS = 8;
        this.food = this.generateFood();
        this.scoreEl.textContent = this.score;
        this.updateStatus();
        this.overlay.classList.remove('visible');
    }

    generateFood() {
        let foodPos;
        do {
            foodPos = {
                x: Math.floor(Math.random() * this.CELL_X),
                y: Math.floor(Math.random() * this.CELL_Y)
            };
        } while (this.snake.some(s => s.x === foodPos.x && s.y === foodPos.y));
        return foodPos;
    }

    drawGradientBg() {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.WINDOW_HEIGHT);
        gradient.addColorStop(0, this.COLORS.bgDark);
        gradient.addColorStop(1, this.COLORS.bgLight);
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.WINDOW_WIDTH, this.WINDOW_HEIGHT);
    }

    drawGrid() {
        this.ctx.strokeStyle = this.COLORS.grid;
        this.ctx.lineWidth = 1;
        for (let x = 0; x <= this.WINDOW_WIDTH; x += this.CELL_SIZE) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.WINDOW_HEIGHT);
            this.ctx.stroke();
        }
        for (let y = 0; y <= this.WINDOW_HEIGHT; y += this.CELL_SIZE) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.WINDOW_WIDTH, y);
            this.ctx.stroke();
        }
    }

    drawFood() {
        const fx = this.food.x * this.CELL_SIZE;
        const fy = this.food.y * this.CELL_SIZE;

        this.foodGlowIntensity += 0.05 * this.foodGlowDirection;
        if (this.foodGlowIntensity >= 1 || this.foodGlowIntensity <= 0) {
            this.foodGlowDirection *= -1;
        }

        const glowRadius = this.CELL_SIZE * 1.5 + this.foodGlowIntensity * 5;
        const glowGradient = this.ctx.createRadialGradient(
            fx + this.CELL_SIZE/2, fy + this.CELL_SIZE/2, 0,
            fx + this.CELL_SIZE/2, fy + this.CELL_SIZE/2, glowRadius
        );
        glowGradient.addColorStop(0, `rgba(239, 68, 68, ${0.3 * this.foodGlowIntensity})`);
        glowGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        this.ctx.fillStyle = glowGradient;
        this.ctx.beginPath();
        this.ctx.arc(fx + this.CELL_SIZE/2, fy + this.CELL_SIZE/2, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = this.COLORS.food;
        this.ctx.beginPath();
        this.ctx.arc(fx + this.CELL_SIZE/2, fy + this.CELL_SIZE/2, this.CELL_SIZE/2 - 2, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = this.COLORS.foodGlow;
        this.ctx.beginPath();
        this.ctx.arc(fx + this.CELL_SIZE/2, fy + this.CELL_SIZE/2, this.CELL_SIZE/2 - 4, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawSnake() {
        this.snake.forEach((segment, i) => {
            const sx = segment.x * this.CELL_SIZE;
            const sy = segment.y * this.CELL_SIZE;
            if (i === 0) {
                this.ctx.fillStyle = this.COLORS.snakeHead;
                this.ctx.fillRect(sx, sy, this.CELL_SIZE, this.CELL_SIZE);

                this.ctx.strokeStyle = this.COLORS.snakeHeadGlow;
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(sx, sy, this.CELL_SIZE, this.CELL_SIZE);

                const eyeOffset = 4;
                this.ctx.fillStyle = '#fff';
                if (this.direction.x > 0) {
                    this.ctx.beginPath();
                    this.ctx.arc(sx + this.CELL_SIZE - 6, sy + eyeOffset, 3, 0, Math.PI * 2);
                    this.ctx.arc(sx + this.CELL_SIZE - 6, sy + this.CELL_SIZE - eyeOffset, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = '#000';
                    this.ctx.beginPath();
                    this.ctx.arc(sx + this.CELL_SIZE - 5, sy + eyeOffset, 1, 0, Math.PI * 2);
                    this.ctx.arc(sx + this.CELL_SIZE - 5, sy + this.CELL_SIZE - eyeOffset, 1, 0, Math.PI * 2);
                    this.ctx.fill();
                } else if (this.direction.x < 0) {
                    this.ctx.beginPath();
                    this.ctx.arc(sx + 6, sy + eyeOffset, 3, 0, Math.PI * 2);
                    this.ctx.arc(sx + 6, sy + this.CELL_SIZE - eyeOffset, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = '#000';
                    this.ctx.beginPath();
                    this.ctx.arc(sx + 5, sy + eyeOffset, 1, 0, Math.PI * 2);
                    this.ctx.arc(sx + 5, sy + this.CELL_SIZE - eyeOffset, 1, 0, Math.PI * 2);
                    this.ctx.fill();
                } else if (this.direction.y < 0) {
                    this.ctx.beginPath();
                    this.ctx.arc(sx + eyeOffset, sy + 6, 3, 0, Math.PI * 2);
                    this.ctx.arc(sx + this.CELL_SIZE - eyeOffset, sy + 6, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = '#000';
                    this.ctx.beginPath();
                    this.ctx.arc(sx + eyeOffset, sy + 5, 1, 0, Math.PI * 2);
                    this.ctx.arc(sx + this.CELL_SIZE - eyeOffset, sy + 5, 1, 0, Math.PI * 2);
                    this.ctx.fill();
                } else {
                    this.ctx.beginPath();
                    this.ctx.arc(sx + eyeOffset, sy + this.CELL_SIZE - 6, 3, 0, Math.PI * 2);
                    this.ctx.arc(sx + this.CELL_SIZE - eyeOffset, sy + this.CELL_SIZE - 6, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = '#000';
                    this.ctx.beginPath();
                    this.ctx.arc(sx + eyeOffset, sy + this.CELL_SIZE - 5, 1, 0, Math.PI * 2);
                    this.ctx.arc(sx + this.CELL_SIZE - eyeOffset, sy + this.CELL_SIZE - 5, 1, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            } else {
                const ratio = i / this.snake.length;
                const r = Math.round(163 * (1 - ratio) + 128 * ratio);
                const g = Math.round(163 * (1 - ratio) + 128 * ratio);
                const b = Math.round(74 * (1 - ratio) + 59 * ratio);
                this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                this.ctx.fillRect(sx, sy, this.CELL_SIZE, this.CELL_SIZE);
                this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(sx, sy, this.CELL_SIZE, this.CELL_SIZE);
            }
        });
    }

    drawUI() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(this.WINDOW_WIDTH - 80, 10, 70, 45);
        
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('Score', this.WINDOW_WIDTH - 55, 26);
        
        this.ctx.fillStyle = this.COLORS.score;
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText(this.score.toString(), this.WINDOW_WIDTH - 50, 48);

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(5, 5, 70, 26);
        
        this.ctx.fillStyle = this.aiMode ? '#4ade80' : '#fb923c';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.fillText(this.aiMode ? 'AI' : 'PLAYER', 12, 22);

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        this.ctx.fillRect(this.WINDOW_WIDTH - 340, this.WINDOW_HEIGHT - 28, 330, 24);
        
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = '11px Arial';
        this.ctx.fillText('WASD/Arrows: Move | Space: Pause | M: AI', this.WINDOW_WIDTH - 335, this.WINDOW_HEIGHT - 12);
    }

    checkCollision(head) {
        if (head.x < 0 || head.x >= this.CELL_X || head.y < 0 || head.y >= this.CELL_Y) {
            return true;
        }
        return this.snake.some((s, i) => i > 0 && s.x === head.x && s.y === head.y);
    }

    floodFill(start, obstacles) {
        const visited = new Set();
        const queue = [start];
        visited.add(`${start.x},${start.y}`);
        let count = 0;

        while (queue.length > 0) {
            const current = queue.shift();
            count++;

            const neighbors = [
                { x: current.x + 1, y: current.y },
                { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 },
                { x: current.x, y: current.y - 1 }
            ];

            for (const neighbor of neighbors) {
                const key = `${neighbor.x},${neighbor.y}`;
                if (neighbor.x >= 0 && neighbor.x < this.CELL_X &&
                    neighbor.y >= 0 && neighbor.y < this.CELL_Y &&
                    !visited.has(key) && !obstacles.has(key)) {
                    visited.add(key);
                    queue.push(neighbor);
                }
            }
        }
        return count;
    }

    bfs(start, goal, obstacles) {
        if (start.x === goal.x && start.y === goal.y) return [start];

        const queue = [start];
        const visited = new Set([`${start.x},${start.y}`]);
        const parent = {};

        while (queue.length > 0) {
            const current = queue.shift();

            const neighbors = [
                { x: current.x + 1, y: current.y },
                { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 },
                { x: current.x, y: current.y - 1 }
            ];

            for (const next of neighbors) {
                const key = `${next.x},${next.y}`;
                if (next.x >= 0 && next.x < this.CELL_X &&
                    next.y >= 0 && next.y < this.CELL_Y &&
                    !visited.has(key) && !obstacles.has(key)) {
                    visited.add(key);
                    parent[key] = current;

                    if (next.x === goal.x && next.y === goal.y) {
                        const path = [];
                        let node = next;
                        while (node) {
                            path.push(node);
                            const nodeKey = `${node.x},${node.y}`;
                            node = parent[nodeKey];
                        }
                        return path.reverse();
                    }
                    queue.push(next);
                }
            }
        }
        return null;
    }

    getAIDirection() {
        const head = this.snake[0];
        const snakeSet = new Set(this.snake.map(s => `${s.x},${s.y}`));
        let bestDir = this.direction;
        let bestScore = -Infinity;

        const foodPath = this.bfs(head, this.food, snakeSet);

        const directions = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 }
        ];

        for (const dir of directions) {
            const newHead = { x: head.x + dir.x, y: head.y + dir.y };

            if (newHead.x < 0 || newHead.x >= this.CELL_X ||
                newHead.y < 0 || newHead.y >= this.CELL_Y) continue;

            const newHeadKey = `${newHead.x},${newHead.y}`;
            if (snakeSet.has(newHeadKey)) continue;

            let score = 0;

            if (foodPath && foodPath.length > 1) {
                const nextInPath = foodPath[1];
                if (newHead.x === nextInPath.x && newHead.y === nextInPath.y) {
                    score += 200;
                } else {
                    const newObstacles = new Set(snakeSet);
                    newObstacles.add(newHeadKey);
                    const dist = this.bfs(newHead, this.food, newObstacles);
                    if (dist) score -= dist.length * 5;
                    else score -= 500;
                }
            }

            const newSnakeTemp = [{ x: newHead.x, y: newHead.y }, ...this.snake.slice(0, -1)];
            const newObstacles = new Set(newSnakeTemp.map(s => `${s.x},${s.y}`));
            const freeSpace = this.floodFill(newHead, newObstacles);
            score += freeSpace * 2;

            if (dir.x === this.direction.x && dir.y === this.direction.y) {
                score += 50;
            }

            if (score > bestScore) {
                bestScore = score;
                bestDir = dir;
            }
        }

        return bestDir;
    }

    gameLoop() {
        if (!this.running) return;

        const currentFps = this.aiMode ? this.AI_FPS : this.FPS;

        if (this.paused) {
            this.drawGradientBg();
            this.drawGrid();
            this.drawSnake();
            this.drawFood();
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Paused', this.WINDOW_WIDTH / 2, this.WINDOW_HEIGHT / 2);
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press Space to continue', this.WINDOW_WIDTH / 2, this.WINDOW_HEIGHT / 2 + 50);
            this.ctx.textAlign = 'left';
            this.animationId = setTimeout(() => this.gameLoop(), 1000 / currentFps);
            return;
        }

        if (this.aiMode) {
            this.direction = this.getAIDirection();
        }

        const head = this.snake[0];
        const newHead = { x: head.x + this.direction.x, y: head.y + this.direction.y };

        if (this.checkCollision(newHead)) {
            this.gameOver();
            return;
        }

        this.snake.unshift(newHead);

        if (newHead.x === this.food.x && newHead.y === this.food.y) {
            this.score += 10;
            this.scoreEl.textContent = this.score;
            this.food = this.generateFood();
            if (!this.aiMode && this.score % this.SPEED_INCREASE_SCORE === 0 && this.FPS < this.MAX_FPS) {
                this.FPS++;
            }
        } else {
            this.snake.pop();
        }

        this.drawGradientBg();
        this.drawGrid();
        this.drawFood();
        this.drawSnake();
        this.drawUI();

        this.animationId = setTimeout(() => this.gameLoop(), 1000 / currentFps);
    }

    gameOver() {
        this.running = false;
        if (this.animationId) clearTimeout(this.animationId);
        this.finalScoreEl.textContent = `Final Score: ${this.score}`;
        this.overlay.classList.add('visible');
    }

    updateStatus() {
        this.statusEl.textContent = this.aiMode ? '🤖 AI' : '👤 PLAYER';
        this.statusEl.className = `game-status ${this.aiMode ? 'status-ai' : 'status-player'}`;
    }

    start() {
        this.initGame();
        this.running = true;
        this.paused = false;
        this.gameLoop();
    }

    togglePause() {
        if (this.running) {
            this.paused = !this.paused;
        }
    }

    toggleAI() {
        if (this.running) {
            this.aiMode = !this.aiMode;
            this.updateStatus();
        }
    }

    handleKeyDown(e) {
        if (!this.running) return;

        if (e.key === ' ') {
            e.preventDefault();
            this.paused = !this.paused;
        } else if (e.key.toLowerCase() === 'm') {
            this.aiMode = !this.aiMode;
            this.updateStatus();
        } else if (!this.aiMode && !this.paused) {
            let newDir = null;
            if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
                if (this.direction.y !== 1) newDir = { x: 0, y: -1 };
            } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
                if (this.direction.y !== -1) newDir = { x: 0, y: 1 };
            } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                if (this.direction.x !== 1) newDir = { x: -1, y: 0 };
            } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                if (this.direction.x !== -1) newDir = { x: 1, y: 0 };
            }
            if (newDir) this.direction = newDir;
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }
}

let snakeGame = null;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('gameCanvas')) {
        snakeGame = new SnakeGame(
            'gameCanvas',
            'gameScore',
            'gameStatus',
            'gameOverOverlay',
            'finalScore'
        );
        window.snakeGame = snakeGame;

        document.getElementById('gameStart').addEventListener('click', () => snakeGame.start());
        document.getElementById('gamePause').addEventListener('click', () => snakeGame.togglePause());
        document.getElementById('gameAI').addEventListener('click', () => snakeGame.toggleAI());
        document.getElementById('gameRestart').addEventListener('click', () => snakeGame.start());
    }
});