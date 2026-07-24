class SnakeGame {
    constructor(canvasId, scoreId, statusId, overlayId, finalScoreId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.scoreEl = document.getElementById(scoreId);
        this.statusEl = document.getElementById(statusId);
        this.overlay = document.getElementById(overlayId);
        this.finalScoreEl = document.getElementById(finalScoreId);
        this.aiScoreEl = document.getElementById('aiScore');

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
            // 玩家蛇（绿色系）
            snakeHead: '#22c55e',
            snakeHeadGlow: '#34d399',
            snakeBody: '#16a34a',
            snakeBodyDark: '#15803d',
            // AI 蛇（蓝色系）
            aiHead: '#3b82f6',
            aiHeadGlow: '#60a5fa',
            aiBody: '#2563eb',
            aiBodyDark: '#1d4ed8',
            // 食物
            food: '#ef4444',
            foodGlow: '#f87171',
            // 文字
            text: '#e2e8f0',
            score: '#fbbf24'
        };

        // 经典模式字段
        this.snake = [];
        this.direction = { x: 1, y: 0 };
        this.food = { x: 0, y: 0 };
        this.score = 0;
        this.aiMode = false;

        // 最高分持久化(skystar:v1:snake:best)
        this.bestScore = SkyStorage.getInt('skystar:v1:snake:best', 0);

        // 双蛇模式字段
        this.mode = 'classic';   // 'classic' | 'versus'
        this.aiSnake = [];
        this.aiDirection = { x: -1, y: 0 };
        this.playerScore = 0;
        this.aiScore = 0;

        // 状态
        this.running = false;
        this.paused = false;
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
        const instructions = container.querySelector('.game-instructions:not([style*="display: none"])');
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
            this.drawSnakes();
            this.drawUI();
        }
    }

    initGame() {
        this.FPS = 8;
        this.paused = false;

        if (this.mode === 'versus') {
            this.initVersus();
        } else {
            this.initClassic();
        }

        this.updateStatus();
        this.overlay.classList.remove('visible');
        // 重置 overlay title 颜色
        const titleEl = this.overlay.querySelector('.game-over-title');
        if (titleEl) titleEl.style.color = '';
    }

    initClassic() {
        const midX = Math.floor(this.CELL_X / 2);
        const midY = Math.floor(this.CELL_Y / 2);
        this.snake = [
            { x: midX, y: midY },
            { x: midX - 1, y: midY },
            { x: midX - 2, y: midY }
        ];
        this.direction = { x: 1, y: 0 };
        this.score = 0;
        this.aiMode = false;
        this.scoreEl.textContent = this.score;
        this.food = this.generateFood();
    }

    initVersus() {
        // 玩家蛇：左侧中点，朝右
        const midY = Math.floor(this.CELL_Y / 2);
        this.snake = [
            { x: 5, y: midY },
            { x: 4, y: midY },
            { x: 3, y: midY }
        ];
        this.direction = { x: 1, y: 0 };

        // AI 蛇：右上角，朝下
        this.aiSnake = [
            { x: this.CELL_X - 6, y: 4 },
            { x: this.CELL_X - 6, y: 3 },
            { x: this.CELL_X - 6, y: 2 }
        ];
        this.aiDirection = { x: 0, y: 1 };

        this.playerScore = 0;
        this.aiScore = 0;
        this.scoreEl.textContent = '0';
        if (this.aiScoreEl) this.aiScoreEl.textContent = '0';
        this.food = this.generateFood();
    }

    generateFood() {
        const occupied = new Set();
        this.snake.forEach(s => occupied.add(`${s.x},${s.y}`));
        if (this.mode === 'versus' && this.aiSnake) {
            this.aiSnake.forEach(s => occupied.add(`${s.x},${s.y}`));
        }
        let foodPos;
        let attempts = 0;
        do {
            foodPos = {
                x: Math.floor(Math.random() * this.CELL_X),
                y: Math.floor(Math.random() * this.CELL_Y)
            };
            attempts++;
            if (attempts > 1000) break; // 防止极端情况死循环
        } while (occupied.has(`${foodPos.x},${foodPos.y}`));
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
        this.ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
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
        const cx = fx + this.CELL_SIZE / 2;
        const cy = fy + this.CELL_SIZE / 2;

        this.foodGlowIntensity += 0.05 * this.foodGlowDirection;
        if (this.foodGlowIntensity >= 1 || this.foodGlowIntensity <= 0) {
            this.foodGlowDirection *= -1;
        }

        // 外圈光晕（脉动）
        const glowRadius = this.CELL_SIZE * 1.7 + this.foodGlowIntensity * 6;
        const glowGradient = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
        glowGradient.addColorStop(0, `rgba(239, 68, 68, ${0.35 * this.foodGlowIntensity})`);
        glowGradient.addColorStop(0.5, `rgba(251, 146, 60, ${0.15 * this.foodGlowIntensity})`);
        glowGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        this.ctx.fillStyle = glowGradient;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // 主体径向渐变（左上高光 → 主红 → 暗红）
        const mainGradient = this.ctx.createRadialGradient(
            cx - this.CELL_SIZE * 0.22, cy - this.CELL_SIZE * 0.22, 0,
            cx, cy, this.CELL_SIZE * 0.55
        );
        mainGradient.addColorStop(0, '#fecaca');
        mainGradient.addColorStop(0.3, '#f87171');
        mainGradient.addColorStop(0.7, '#dc2626');
        mainGradient.addColorStop(1, '#7f1d1d');
        this.ctx.fillStyle = mainGradient;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, this.CELL_SIZE / 2 - 2, 0, Math.PI * 2);
        this.ctx.fill();

        // 主体描边
        this.ctx.strokeStyle = 'rgba(127, 29, 29, 0.6)';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();

        // 高光小圆（左上）
        this.ctx.fillStyle = 'rgba(254, 226, 226, 0.85)';
        this.ctx.beginPath();
        this.ctx.arc(cx - this.CELL_SIZE * 0.18, cy - this.CELL_SIZE * 0.22, this.CELL_SIZE * 0.1, 0, Math.PI * 2);
        this.ctx.fill();

        // 叶柄（绿色小茎）
        this.ctx.strokeStyle = '#15803d';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(cx, fy + 2);
        this.ctx.lineTo(cx + 3, fy - 2);
        this.ctx.stroke();

        // 叶子
        this.ctx.fillStyle = '#22c55e';
        this.ctx.beginPath();
        this.ctx.ellipse(cx + 5, fy, 4, 2, Math.PI / 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#14532d';
        this.ctx.lineWidth = 0.8;
        this.ctx.stroke();
    }

    // ===== 调色板（玩家 = 绿；AI = 紫蓝，更"凶"） =====
    static PLAYER_PALETTE = {
        headLight: '#86efac',     // 头部高光
        headMid: '#22c55e',       // 头部主色
        bodyStart: '#22c55e',     // 身体起点
        bodyEnd: '#14532d',       // 身体终点
        stroke: '#052e16',
        eye: '#1f2937'            // 玩家眼瞳深色
    };

    static AI_PALETTE = {
        headLight: '#c4b5fd',
        headMid: '#8b5cf6',
        bodyStart: '#8b5cf6',
        bodyEnd: '#3b0764',
        stroke: '#1e1b4b',
        eye: '#ef4444'            // AI 红色眼（凶）
    };

    // hex → rgb
    static hexToRgb(hex) {
        const m = hex.replace('#', '');
        return {
            r: parseInt(m.slice(0, 2), 16),
            g: parseInt(m.slice(2, 4), 16),
            b: parseInt(m.slice(4, 6), 16)
        };
    }

    // 两个 hex 颜色按 t 插值，返回 rgb() 字符串
    static lerpHex(hex1, hex2, t) {
        const c1 = this.hexToRgb(hex1);
        const c2 = this.hexToRgb(hex2);
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);
        return `rgb(${r}, ${g}, ${b})`;
    }

    // 画一个身体段（圆角矩形 + 描边 + 顶部高光弧）
    drawSnakeBodySegment(x, y, fillColor, strokeColor) {
        const pad = 1.5;
        const size = this.CELL_SIZE - pad * 2;
        const r = size * 0.28;
        this.ctx.fillStyle = fillColor;
        this.ctx.beginPath();
        this.ctx.roundRect(x + pad, y + pad, size, size, r);
        this.ctx.fill();
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // 顶部高光弧
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(x + this.CELL_SIZE / 2, y + pad + 2, size * 0.32, Math.PI * 1.1, Math.PI * 1.9);
        this.ctx.stroke();
    }

    // 画蛇头（径向渐变 + 大圆角 + 眼睛）
    drawSnakeHead(sx, sy, direction, palette) {
        const size = this.CELL_SIZE;
        const cx = sx + size / 2;
        const cy = sy + size / 2;

        // 主体径向渐变（左上高光 → 主色 → 暗色）
        const grad = this.ctx.createRadialGradient(
            cx - size * 0.22, cy - size * 0.22, 0,
            cx, cy, size * 0.7
        );
        grad.addColorStop(0, palette.headLight);
        grad.addColorStop(0.6, palette.headMid);
        grad.addColorStop(1, this.constructor.lerpHex(palette.headMid, palette.bodyEnd, 0.4));
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.roundRect(sx, sy, size, size, size * 0.32);
        this.ctx.fill();

        // 描边
        this.ctx.strokeStyle = palette.stroke;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        // 头顶光泽弧
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy - size * 0.15, size * 0.4, Math.PI * 1.15, Math.PI * 1.85);
        this.ctx.stroke();

        // 眼睛
        this.drawSnakeEyes(sx, sy, direction, palette);
    }

    drawSnakeEyes(sx, sy, direction, palette) {
        const size = this.CELL_SIZE;
        const front = size * 0.62;   // 眼睛靠前
        const side = size * 0.28;    // 眼睛偏离中心
        const eyeR = size * 0.16;
        const pupilR = size * 0.085;
        const highlightR = size * 0.045;

        let centers = [];
        if (direction.x > 0) {        // 朝右
            centers = [
                { x: sx + front, y: sy + side },
                { x: sx + front, y: sy + size - side }
            ];
        } else if (direction.x < 0) { // 朝左
            centers = [
                { x: sx + size - front, y: sy + side },
                { x: sx + size - front, y: sy + size - side }
            ];
        } else if (direction.y < 0) { // 朝上
            centers = [
                { x: sx + side, y: sy + front },
                { x: sx + size - side, y: sy + front }
            ];
        } else {                       // 朝下
            centers = [
                { x: sx + side, y: sy + size - front },
                { x: sx + size - side, y: sy + size - front }
            ];
        }

        centers.forEach(c => {
            // 眼白
            this.ctx.fillStyle = '#fff';
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, eyeR, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = palette.stroke;
            this.ctx.lineWidth = 0.8;
            this.ctx.stroke();

            // 瞳孔
            this.ctx.fillStyle = palette.eye;
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, pupilR, 0, Math.PI * 2);
            this.ctx.fill();

            // 高光
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            this.ctx.beginPath();
            this.ctx.arc(c.x - pupilR * 0.35, c.y - pupilR * 0.35, highlightR, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    // 通用画蛇：传入 palette 决定外观
    drawSnakeFor(snake, direction, palette) {
        if (snake.length === 0) return;
        // 1. 身体（从尾到头，避免覆盖头）
        for (let i = snake.length - 1; i >= 1; i--) {
            const seg = snake[i];
            const t = snake.length > 1 ? (i - 1) / (snake.length - 1) : 0;
            const color = this.constructor.lerpHex(palette.bodyStart, palette.bodyEnd, t);
            this.drawSnakeBodySegment(
                seg.x * this.CELL_SIZE,
                seg.y * this.CELL_SIZE,
                color, palette.stroke
            );
        }
        // 2. 头
        this.drawSnakeHead(
            snake[0].x * this.CELL_SIZE,
            snake[0].y * this.CELL_SIZE,
            direction, palette
        );
    }

    drawSnakes() {
        this.drawSnakeFor(this.snake, this.direction, this.constructor.PLAYER_PALETTE);
        if (this.mode === 'versus') {
            this.drawSnakeFor(this.aiSnake, this.aiDirection, this.constructor.AI_PALETTE);
        }
    }

    drawUI() {
        // 双蛇模式：画左下/右下的"你"和"AI"小标签
        if (this.mode === 'versus') {
            // 左下：玩家
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            this.ctx.fillRect(5, this.WINDOW_HEIGHT - 30, 70, 24);
            this.ctx.fillStyle = '#4ade80';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('YOU', 12, this.WINDOW_HEIGHT - 14);

            // 右下：AI
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            this.ctx.fillRect(this.WINDOW_WIDTH - 75, this.WINDOW_HEIGHT - 30, 70, 24);
            this.ctx.fillStyle = '#60a5fa';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('AI', this.WINDOW_WIDTH - 55, this.WINDOW_HEIGHT - 14);
        } else {
            // 经典模式：左上 PLAYER/AI 标签 + 右上分数
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
        }

        // 底部操作提示（两种模式通用）
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        this.ctx.fillRect(this.WINDOW_WIDTH - 340, this.WINDOW_HEIGHT - 28, 330, 24);
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = '11px Arial';
        this.ctx.fillText('WASD/Arrows: Move | Space: Pause | M: AI', this.WINDOW_WIDTH - 335, this.WINDOW_HEIGHT - 12);
    }

    // 碰撞检测：head 是否撞到 mySnake 自身（非头部）或 otherSnake 任何部分或越界
    checkCollision(head, mySnake, otherSnake) {
        if (head.x < 0 || head.x >= this.CELL_X || head.y < 0 || head.y >= this.CELL_Y) {
            return true;
        }
        // 撞自己（跳过头部）
        for (let i = 1; i < mySnake.length; i++) {
            if (mySnake[i].x === head.x && mySnake[i].y === head.y) return true;
        }
        // 撞对方身体
        if (otherSnake) {
            for (let i = 0; i < otherSnake.length; i++) {
                if (otherSnake[i].x === head.x && otherSnake[i].y === head.y) return true;
            }
        }
        return false;
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

    // 通用 AI 决策：传入我方蛇/方向/食物/对方蛇，返回最佳下一步方向
    getAIDirectionFor(mySnake, myDir, food, otherSnake) {
        const head = mySnake[0];
        const mySet = new Set(mySnake.map(s => `${s.x},${s.y}`));
        const otherSet = new Set((otherSnake || []).map(s => `${s.x},${s.y}`));
        const allObstacles = new Set([...mySet, ...otherSet]);

        const foodPath = this.bfs(head, food, allObstacles);

        let bestDir = myDir;
        let bestScore = -Infinity;

        const directions = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 }
        ];

        for (const dir of directions) {
            // 排除反向（180度掉头）
            if (dir.x === -myDir.x && dir.y === -myDir.y) continue;

            const newHead = { x: head.x + dir.x, y: head.y + dir.y };

            // 撞墙直接跳过（不计入评分，等于判死）
            if (newHead.x < 0 || newHead.x >= this.CELL_X ||
                newHead.y < 0 || newHead.y >= this.CELL_Y) continue;

            const newHeadKey = `${newHead.x},${newHead.y}`;
            // 撞自己身体或对方身体也跳过
            if (mySet.has(newHeadKey) || otherSet.has(newHeadKey)) continue;

            let score = 0;

            // 沿 BFS 路径走 = 大奖励
            if (foodPath && foodPath.length > 1) {
                const nextInPath = foodPath[1];
                if (newHead.x === nextInPath.x && newHead.y === nextInPath.y) {
                    score += 200;
                } else {
                    const newObstacles = new Set(allObstacles);
                    newObstacles.add(newHeadKey);
                    const dist = this.bfs(newHead, food, newObstacles);
                    if (dist) score -= dist.length * 5;
                    else score -= 500;
                }
            }

            // 模拟移动后评估生存空间（我方蛇头+身体+对方身体作为障碍）
            const simulatedSnake = [newHead, ...mySnake.slice(0, -1)];
            const simObstacles = new Set(simulatedSnake.map(s => `${s.x},${s.y}`));
            (otherSnake || []).forEach(s => simObstacles.add(`${s.x},${s.y}`));
            const freeSpace = this.floodFill(newHead, simObstacles);
            score += freeSpace * 2;

            // 继续沿当前方向 = 小奖励（避免频繁转向）
            if (dir.x === myDir.x && dir.y === myDir.y) {
                score += 30;
            }

            if (score > bestScore) {
                bestScore = score;
                bestDir = dir;
            }
        }

        return bestDir;
    }

    // 单蛇 AI 模式的决策（兼容原行为，调用通用版）
    getAIDirection() {
        return this.getAIDirectionFor(this.snake, this.direction, this.food, []);
    }

    gameLoop() {
        if (!this.running) return;

        const currentFps = (this.mode === 'classic' && this.aiMode) ? this.AI_FPS : this.FPS;

        if (this.paused) {
            this.drawGradientBg();
            this.drawGrid();
            this.drawSnakes();
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

        if (this.mode === 'versus') {
            this.stepVersus();
        } else {
            this.stepClassic();
        }

        this.drawGradientBg();
        this.drawGrid();
        this.drawFood();
        this.drawSnakes();
        this.drawUI();

        this.animationId = setTimeout(() => this.gameLoop(), 1000 / currentFps);
    }

    stepClassic() {
        if (this.aiMode) {
            this.direction = this.getAIDirection();
        }
        const head = this.snake[0];
        const newHead = { x: head.x + this.direction.x, y: head.y + this.direction.y };

        if (this.checkCollision(newHead, this.snake, [])) {
            this.gameOver(null, null);
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
    }

    stepVersus() {
        // 1. AI 先决策
        this.aiDirection = this.getAIDirectionFor(
            this.aiSnake, this.aiDirection, this.food, this.snake
        );

        // 2. 双方新头
        const playerHead = this.snake[0];
        const playerNewHead = {
            x: playerHead.x + this.direction.x,
            y: playerHead.y + this.direction.y
        };
        const aiHead = this.aiSnake[0];
        const aiNewHead = {
            x: aiHead.x + this.aiDirection.x,
            y: aiHead.y + this.aiDirection.y
        };

        // 3. 互相把对方身体当障碍做碰撞检测
        const playerDied = this.checkCollision(playerNewHead, this.snake, this.aiSnake);
        const aiDied = this.checkCollision(aiNewHead, this.aiSnake, this.snake);

        // 4. 判定胜负
        if (playerDied && aiDied) {
            // 同归于尽 → AI 输
            this.gameOver('player', 'draw');
            return;
        }
        if (playerDied) {
            this.gameOver('ai', null);
            return;
        }
        if (aiDied) {
            this.gameOver('player', null);
            return;
        }

        // 5. 都没死，移动
        this.snake.unshift(playerNewHead);
        this.aiSnake.unshift(aiNewHead);

        // 6. 吃食物（玩家优先吃同格食物）
        if (playerNewHead.x === this.food.x && playerNewHead.y === this.food.y) {
            this.playerScore++;
            this.scoreEl.textContent = this.playerScore;
            this.food = this.generateFood();
        } else if (aiNewHead.x === this.food.x && aiNewHead.y === this.food.y) {
            this.aiScore++;
            if (this.aiScoreEl) this.aiScoreEl.textContent = this.aiScore;
            this.food = this.generateFood();
        } else {
            this.snake.pop();
            this.aiSnake.pop();
        }
    }

    gameOver(winner, kind) {
        this.running = false;
        if (this.animationId) clearTimeout(this.animationId);

        const titleEl = this.overlay.querySelector('.game-over-title');
        if (this.mode === 'versus') {
            if (winner === 'player' && kind === 'draw') {
                titleEl.textContent = '⚔️ 同归于尽 — 你赢';
                titleEl.style.color = '#4ade80';
            } else if (winner === 'player') {
                titleEl.textContent = '🏆 你赢了';
                titleEl.style.color = '#4ade80';
            } else {
                titleEl.textContent = '🤖 AI 赢了';
                titleEl.style.color = '#60a5fa';
            }
            this.finalScoreEl.textContent = `你 ${this.playerScore} : ${this.aiScore} AI`;
        } else {
            titleEl.textContent = 'Game Over';
            titleEl.style.color = '';
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                SkyStorage.setInt('skystar:v1:snake:best', this.bestScore);
                this.finalScoreEl.textContent = `Final Score: ${this.score}  🏆 Best: ${this.bestScore}`;
            } else {
                this.finalScoreEl.textContent = `Final Score: ${this.score}  (Best: ${this.bestScore})`;
            }
        }
        this.overlay.classList.add('visible');
    }

    updateStatus() {
        if (this.mode === 'versus') {
            this.statusEl.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#i-user"/></svg> YOU <span style="opacity:.5;margin:0 4px">vs</span> <svg class="ico" viewBox="0 0 24 24"><use href="#i-robot"/></svg> AI';
            this.statusEl.className = 'game-status status-versus';
        } else {
            this.statusEl.textContent = this.aiMode ? '🤖 AI' : '👤 PLAYER';
            this.statusEl.className = `game-status ${this.aiMode ? 'status-ai' : 'status-player'}`;
        }
    }

    start() {
        if (this.animationId) clearTimeout(this.animationId);
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
        if (this.running && this.mode === 'classic') {
            this.aiMode = !this.aiMode;
            this.updateStatus();
        }
    }

    // 模式切换：游戏运行中切换会重置
    setMode(mode) {
        if (mode !== 'classic' && mode !== 'versus') return;
        if (mode === this.mode) return;
        this.mode = mode;
        this.updateModeUI();
        if (this.running) {
            this.start();
        }
    }

    updateModeUI() {
        // 1. mode toggle 按钮 active
        const toggleBtns = document.querySelectorAll('#gameModeToggle .mode-btn');
        toggleBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.mode);
        });
        // 2. AI score box 显隐
        const aiScoreBox = document.getElementById('aiScoreBox');
        if (aiScoreBox) {
            aiScoreBox.style.display = this.mode === 'versus' ? '' : 'none';
        }
        // 3. instructions 切换
        const instrClassic = document.getElementById('instructionsClassic');
        const instrVersus = document.getElementById('instructionsVersus');
        if (instrClassic) instrClassic.style.display = this.mode === 'classic' ? '' : 'none';
        if (instrVersus) instrVersus.style.display = this.mode === 'versus' ? '' : 'none';
        // 4. AI 模式按钮在双蛇模式下隐藏（M 键无意义）
        const aiBtn = document.getElementById('gameAI');
        if (aiBtn) aiBtn.style.display = this.mode === 'versus' ? 'none' : '';
        // 5. status
        this.updateStatus();
    }

    handleKeyDown(e) {
        // 仅当贪吃蛇容器处于 active 时才响应键盘
        if (!document.querySelector('.game-container.game-snake.active')) return;
        if (!this.running) return;

        if (e.key === ' ') {
            e.preventDefault();
            this.paused = !this.paused;
        } else if (e.key.toLowerCase() === 'm') {
            // M 键只对经典模式有意义
            if (this.mode === 'classic') {
                this.aiMode = !this.aiMode;
                this.updateStatus();
            }
        } else if (!this.paused && this.mode === 'versus') {
            // 双蛇模式：只接受玩家控制
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
            if (newDir) {
                e.preventDefault();
                this.direction = newDir;
            }
        } else if (!this.aiMode && !this.paused && this.mode === 'classic') {
            // 经典模式：玩家控制
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
            if (newDir) {
                e.preventDefault();
                this.direction = newDir;
            }
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

        // 模式切换按钮
        const modeToggle = document.getElementById('gameModeToggle');
        if (modeToggle) {
            modeToggle.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    snakeGame.setMode(btn.dataset.mode);
                });
            });
        }

        // 初始化模式 UI（默认经典）
        snakeGame.updateModeUI();
    }
});
