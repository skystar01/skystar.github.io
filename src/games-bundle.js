// src/games-bundle.js -- 阶段2 懒加载游戏包
// 原 app.js 中的 9 个游戏脚本(snake-game .. game-survivor)整体移入此模块。
// 语义与原单模块共享作用域一致: 模块内函数互见, 对外依赖均走 window 总线
// (SkyStorage / window.registerGame / 各游戏暴露的 window.xxxGame 接口)。
// game-shell 首次切到任意非飞机游戏时 import 本模块, IIFE 执行并注册到 game-shell。
// ============================================================

// 阶段2: 游戏专属 CSS 随游戏包懒加载 (仅在首次切到游戏时下载, 不进首屏)
import '../styles/game-tic-tac-toe.css';
import '../styles/game-gomoku.css';
import '../styles/game-memory.css';
import '../styles/game-2048.css';
import '../styles/game-tetris.css';
import '../styles/game-maze.css';
import '../styles/game-survivor.css';

// 阶段2 修复: 本模块通过动态 import() 懒加载, 此时 DOMContentLoaded 早已触发,
// 若仍用 document.addEventListener('DOMContentLoaded', ...) 包裹初始化, 回调永远不会执行,
// 导致所有游戏的按钮绑定 / 画布 fit / window.xxxGame 暴露全部失效
// (现象: 点开始无反应、界面错位、零报错)。
// 改为 whenDomReady: 文档已就绪则立即执行, 否则才挂 DOMContentLoaded, 二者兼容。
function whenDomReady(cb) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cb);
    } else {
        cb();
    }
}

// ---------- snake-game.js ----------
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

whenDomReady(() => {
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

// ---------- flappy-bird.js ----------
class FlappyBird {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.width = 400;
        this.height = 600;
        this.groundHeight = 100;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        this.bird = {
            x: 100,
            y: this.height / 2,
            radius: 15,
            velocity: 0,
            gravity: 0.04,
            lift: -2.5,
            rotation: 0
        };
        
        this.pipes = [];
        this.pipeWidth = 70;
        this.pipeGap = 150;
        this.pipeSpeed = 1.5;
        this.pipeFreq = 1500;
        
        this.score = 0;
        this.highScore = (function() {
            SkyStorage.migrate('flappyHighScore', 'skystar:v1:flappy:best');
            return SkyStorage.getInt('skystar:v1:flappy:best', 0);
        })();
        this.gameRunning = false;
        this.gamePaused = false;
        this.gameOver = false;
        this.loopRunning = false;
        
        this.aiMode = false;
        this.aiModelLoaded = false;
        this.lastPassedPipe = null;
        this.backendUrl = 'http://127.0.0.1:5000';
        
        this.bgOffset = 0;
        this.groundOffset = 0;
        this.clouds = [];
        
        this.colors = {
            sky: '#87ceeb',
            ground: '#deb887',
            birdBody: '#ffff00',
            birdBeak: '#ff6b35',
            pipeGreen: '#009600',
            pipeDark: '#006400',
            pipeBorder: '#004d00',
            cloud: '#ffffff'
        };
        
        this.initClouds();
        this.bindEvents();
        this.checkBackend();
        this.draw();
    }
    
    async checkBackend() {
        try {
            const response = await fetch(`${this.backendUrl}/`);
            if (response.ok) {
                this.aiModelLoaded = true;
            }
        } catch (error) {
            console.error('❌ Cannot connect to backend:', error);
            this.aiModelLoaded = false;
        }
    }
    
    initClouds() {
        for (let i = 0; i < 4; i++) {
            this.clouds.push({
                x: Math.random() * this.width,
                y: 50 + Math.random() * 150,
                size: 0.5 + Math.random() * 0.5,
                speed: 0.3 + Math.random() * 0.5
            });
        }
    }
    
    bindEvents() {
        this.canvas.addEventListener('click', () => this.flap());
        document.addEventListener('keydown', (e) => {
            // 仅当 Flappy Bird 容器处于 active 时才响应键盘
            if (!document.querySelector('.game-container.game-flappy.active')) return;
            if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
                e.preventDefault();
                this.flap();
            }
            if (e.code === 'KeyP' || e.code === 'Escape') {
                this.togglePause();
            }
            if (e.code === 'KeyA') {
                this.toggleAI();
            }
        });
    }
    
    toggleAI() {
        if (!this.aiModelLoaded) {
            return;
        }
        this.aiMode = !this.aiMode;
        if (this.aiMode && !this.gameRunning) {
            this.start();
        }
    }
    
    flap() {
        if (this.gameOver) {
            this.reset();
            return;
        }
        if (!this.gameRunning) {
            this.start();
            return;
        }
        if (!this.aiMode) {
            this.bird.velocity = this.bird.lift;
        }
    }
    
    start() {
        this.gameRunning = true;
        if (!this.loopRunning) this.gameLoop();
        this.gameOver = false;
        this.pipes = [];
        this.score = 0;
        this.lastPassedPipe = null;
        this.bird.y = this.height / 2;
        this.bird.velocity = 0;
        this.bird.rotation = 0;
        this.lastPipeTime = Date.now();
    }
    
    reset() {
        this.gameRunning = false;
        this.gameOver = false;
        this.gamePaused = false;
        this.score = 0;
        this.pipes = [];
        this.lastPassedPipe = null;
        this.bird.y = this.height / 2;
        this.bird.velocity = 0;
        this.bird.rotation = 0;
        this.bgOffset = 0;
        this.groundOffset = 0;
    }
    
    togglePause() {
        if (this.gameRunning && !this.gameOver) {
            this.gamePaused = !this.gamePaused;
        }
    }
    
    createPipe() {
        const topHeight = Math.random() * (this.height - this.groundHeight - this.pipeGap - 200) + 100;
        this.pipes.push({
            x: this.width,
            topHeight: topHeight,
            passed: false
        });
    }
    
    getLastPassedPipe() {
        if (!this.lastPassedPipe) {
            return { x: 0, topY: 250, bottomY: 400 };
        }
        return {
            x: this.lastPassedPipe.x,
            topY: this.lastPassedPipe.topHeight,
            bottomY: this.lastPassedPipe.topHeight + this.pipeGap
        };
    }
    
    getNextPipe() {
        if (this.pipes.length === 0) {
            return { x: this.width, topY: 250, bottomY: 400 };
        }
        const pipe = this.pipes[0];
        return {
            x: pipe.x,
            topY: pipe.topHeight,
            bottomY: pipe.topHeight + this.pipeGap
        };
    }
    
    getNextNextPipe() {
        if (this.pipes.length < 2) {
            return { x: this.width + 200, topY: 250, bottomY: 400 };
        }
        const pipe = this.pipes[1];
        return {
            x: pipe.x,
            topY: pipe.topHeight,
            bottomY: pipe.topHeight + this.pipeGap
        };
    }
    
    getGameState() {
        const lastPipe = this.getLastPassedPipe();
        const nextPipe = this.getNextPipe();
        const nextNextPipe = this.getNextNextPipe();
        
        const playerPos = this.bird.y;
        const playerVel = this.bird.velocity;
        const playerRot = this.bird.rotation;
        
        return [
            lastPipe.x,
            lastPipe.topY,
            lastPipe.bottomY,
            nextPipe.x,
            nextPipe.topY,
            nextPipe.bottomY,
            nextNextPipe.x,
            nextNextPipe.topY,
            nextNextPipe.bottomY,
            playerPos,
            playerVel,
            playerRot
        ];
    }
    
    async getAIAction() {
        if (!this.aiModelLoaded) return 0;
        
        try {
            const state = this.getGameState();
            const response = await fetch(`${this.backendUrl}/api/ai/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ state: state })
            });
            
            const data = await response.json();
            return data.action;
        } catch (error) {
            console.error('AI inference error:', error);
            return 0;
        }
    }
    
    async update() {
        if (!this.gameRunning || this.gamePaused || this.gameOver) return;
        
        if (this.aiMode && this.aiModelLoaded) {
            const action = await this.getAIAction();
            if (action === 1) {
                this.bird.velocity = this.bird.lift;
            }
        }
        
        this.bird.velocity += this.bird.gravity;
        this.bird.y += this.bird.velocity;
        this.bird.rotation = Math.min(Math.PI / 2, Math.max(-Math.PI / 6, this.bird.velocity * 0.15));
        
        this.bgOffset = (this.bgOffset + 0.5) % 512;
        this.groundOffset = (this.groundOffset + this.pipeSpeed) % 336;
        
        this.clouds.forEach(cloud => {
            cloud.x -= cloud.speed;
            if (cloud.x < -100) {
                cloud.x = this.width + Math.random() * 100;
                cloud.y = 50 + Math.random() * 150;
            }
        });
        
        this.pipes.forEach(pipe => {
            pipe.x -= this.pipeSpeed;
            if (!pipe.passed && pipe.x + this.pipeWidth < this.bird.x) {
                pipe.passed = true;
                this.lastPassedPipe = pipe;
            }
        });
        
        if (this.pipes.length > 0 && this.pipes[0].x + this.pipeWidth < 0) {
            if (this.pipes[0].passed) {
                this.score++;
            }
            this.pipes.shift();
        }
        
        const now = Date.now();
        if (now - this.lastPipeTime > this.pipeFreq) {
            this.createPipe();
            this.lastPipeTime = now;
        }
        
        this.checkCollisions();
    }
    
    checkCollisions() {
        if (this.bird.y + this.bird.radius >= this.height - this.groundHeight || 
            this.bird.y - this.bird.radius <= 0) {
            this.gameOver = true;
            this.updateHighScore();
        }
        
        this.pipes.forEach(pipe => {
            if (this.bird.x + this.bird.radius > pipe.x &&
                this.bird.x - this.bird.radius < pipe.x + this.pipeWidth) {
                if (this.bird.y - this.bird.radius < pipe.topHeight) {
                    this.gameOver = true;
                    this.updateHighScore();
                }
                if (this.bird.y + this.bird.radius > pipe.topHeight + this.pipeGap) {
                    this.gameOver = true;
                    this.updateHighScore();
                }
            }
        });
    }
    
    updateHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            SkyStorage.setInt('skystar:v1:flappy:best', this.highScore);
        }
    }
    
    drawClouds() {
        this.clouds.forEach(cloud => {
            this.ctx.save();
            this.ctx.scale(cloud.size, cloud.size);
            this.ctx.fillStyle = this.colors.cloud;
            this.ctx.beginPath();
            this.ctx.arc(cloud.x / cloud.size, cloud.y / cloud.size, 20, 0, Math.PI * 2);
            this.ctx.arc(cloud.x / cloud.size + 25, cloud.y / cloud.size - 5, 25, 0, Math.PI * 2);
            this.ctx.arc(cloud.x / cloud.size + 50, cloud.y / cloud.size, 20, 0, Math.PI * 2);
            this.ctx.arc(cloud.x / cloud.size + 25, cloud.y / cloud.size + 5, 18, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
    }
    
    drawPipe(pipe) {
        this.ctx.fillStyle = this.colors.pipeGreen;
        this.ctx.fillRect(pipe.x, 0, this.pipeWidth, pipe.topHeight);
        
        this.ctx.fillStyle = this.colors.pipeDark;
        this.ctx.fillRect(pipe.x, pipe.topHeight - 30, this.pipeWidth, 30);
        
        const bottomY = pipe.topHeight + this.pipeGap;
        this.ctx.fillStyle = this.colors.pipeGreen;
        this.ctx.fillRect(pipe.x, bottomY, this.pipeWidth, this.height - bottomY - this.groundHeight);
        
        this.ctx.fillStyle = this.colors.pipeDark;
        this.ctx.fillRect(pipe.x, bottomY, this.pipeWidth, 30);
    }
    
    drawGround() {
        this.ctx.fillStyle = this.colors.ground;
        this.ctx.fillRect(0, this.height - this.groundHeight, this.width, this.groundHeight);
        this.ctx.strokeStyle = '#646464';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height - this.groundHeight);
        this.ctx.lineTo(this.width, this.height - this.groundHeight);
        this.ctx.stroke();
    }
    
    drawBird() {
        this.ctx.save();
        this.ctx.translate(this.bird.x, this.bird.y);
        this.ctx.rotate(this.bird.rotation);
        
        this.ctx.fillStyle = this.colors.birdBody;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.bird.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.arc(5, -5, 3, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(6, -4, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawScore() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.font = 'bold 40px Arial';
        this.ctx.textAlign = 'center';
        
        this.ctx.strokeText(this.score.toString(), this.width / 2, 60);
        this.ctx.fillText(this.score.toString(), this.width / 2, 60);
        
        if (this.highScore > 0) {
            this.ctx.font = 'bold 16px Arial';
            this.ctx.strokeText(`High Score: ${this.highScore}`, this.width / 2, 90);
            this.ctx.fillText(`High Score: ${this.highScore}`, this.width / 2, 90);
        }
        
        if (this.aiMode) {
            this.ctx.fillStyle = '#44ff44';
            this.ctx.font = 'bold 18px Arial';
            this.ctx.strokeText('🤖 AI MODE', this.width / 2, 120);
            this.ctx.fillText('🤖 AI MODE', this.width / 2, 120);
        }
    }
    
    drawStartScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 4;
        
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        
        this.ctx.strokeText('Flappy Bird', this.width / 2, this.height / 2 - 60);
        this.ctx.fillText('Flappy Bird', this.width / 2, this.height / 2 - 60);
        
        this.ctx.font = 'bold 24px Arial';
        this.ctx.strokeText('Click or Press SPACE to Start', this.width / 2, this.height / 2 + 20);
        this.ctx.fillText('Click or Press SPACE to Start', this.width / 2, this.height / 2 + 20);
        
        this.ctx.font = '18px Arial';
        this.ctx.strokeText('SPACE/↑/W - Fly | P/ESC - Pause | A - AI Mode', this.width / 2, this.height / 2 + 70);
        this.ctx.fillText('SPACE/↑/W - Fly | P/ESC - Pause | A - AI Mode', this.width / 2, this.height / 2 + 70);
        
        if (this.aiModelLoaded) {
            this.ctx.fillStyle = '#44ff44';
            this.ctx.strokeText('✅ Flask Backend Connected', this.width / 2, this.height / 2 + 110);
            this.ctx.fillText('✅ Flask Backend Connected', this.width / 2, this.height / 2 + 110);
        } else {
            this.ctx.fillStyle = '#ff4444';
            this.ctx.strokeText('❌ Backend not connected', this.width / 2, this.height / 2 + 110);
            this.ctx.fillText('❌ Backend not connected', this.width / 2, this.height / 2 + 110);
        }
    }
    
    drawGameOverScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = '#ff4444';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 4;
        this.ctx.font = 'bold 56px Arial';
        this.ctx.textAlign = 'center';
        
        this.ctx.strokeText('Game Over', this.width / 2, this.height / 2 - 60);
        this.ctx.fillText('Game Over', this.width / 2, this.height / 2 - 60);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 32px Arial';
        this.ctx.strokeText(`Score: ${this.score}`, this.width / 2, this.height / 2 + 10);
        this.ctx.fillText(`Score: ${this.score}`, this.width / 2, this.height / 2 + 10);
        
        if (this.score >= this.highScore && this.score > 0) {
            this.ctx.fillStyle = '#ffd700';
            this.ctx.strokeText('🎉 New Record! 🎉', this.width / 2, this.height / 2 + 55);
            this.ctx.fillText('🎉 New Record! 🎉', this.width / 2, this.height / 2 + 55);
        } else {
            this.ctx.fillStyle = '#aaaaaa';
            this.ctx.font = '24px Arial';
            this.ctx.strokeText(`High Score: ${this.highScore}`, this.width / 2, this.height / 2 + 55);
            this.ctx.fillText(`High Score: ${this.highScore}`, this.width / 2, this.height / 2 + 55);
        }
        
        this.ctx.fillStyle = '#44ff44';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.strokeText('Click to Restart', this.width / 2, this.height / 2 + 100);
        this.ctx.fillText('Click to Restart', this.width / 2, this.height / 2 + 100);
    }
    
    drawPausedScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 4;
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        
        this.ctx.strokeText('Paused', this.width / 2, this.height / 2);
        this.ctx.fillText('Paused', this.width / 2, this.height / 2);
        
        this.ctx.font = '24px Arial';
        this.ctx.strokeText('Press P or ESC to Continue', this.width / 2, this.height / 2 + 50);
        this.ctx.fillText('Press P or ESC to Continue', this.width / 2, this.height / 2 + 50);
    }
    
    draw() {
        this.ctx.fillStyle = this.colors.sky;
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.drawClouds();
        
        this.pipes.forEach(pipe => this.drawPipe(pipe));
        
        this.drawGround();
        
        this.drawBird();
        
        this.drawScore();
        
        if (!this.gameRunning && !this.gameOver) {
            this.drawStartScreen();
        }
        
        if (this.gameOver) {
            this.drawGameOverScreen();
        }
        
        if (this.gamePaused && this.gameRunning) {
            this.drawPausedScreen();
        }
    }
    
    async gameLoop() {
        this.loopRunning = true;
        await this.update();
        this.draw();
        if (this.gameRunning || this.gameOver) {
            requestAnimationFrame(() => this.gameLoop());
        } else {
            this.loopRunning = false;
        }
    }
}

whenDomReady(() => {
    const flappyGame = new FlappyBird('flappyCanvas');
    window.flappyGame = flappyGame;

    // ─── UI WIRING (added by Mavis) ───
    const aiButton = document.getElementById('flappyAIButton');
    const restartButton = document.getElementById('flappyRestartButton');
    const aiStatus = document.getElementById('flappyAIStatus');
    const highScoreEl = document.getElementById('flappyHighScore');

    function updateFlappyUI() {
        if (highScoreEl) highScoreEl.textContent = flappyGame.highScore || 0;
        if (aiStatus) {
            if (!flappyGame.aiModelLoaded) {
                aiStatus.innerHTML = '<i class="fas fa-plug"></i> 未连接';
                aiStatus.className = 'game-status status-player';
            } else if (flappyGame.aiMode) {
                aiStatus.innerHTML = '<i class="fas fa-robot"></i> AI 模式';
                aiStatus.className = 'game-status status-ai';
            } else {
                aiStatus.innerHTML = '<i class="fas fa-hand-paper"></i> 手动';
                aiStatus.className = 'game-status status-player';
            }
        }
        if (aiButton) {
            if (!flappyGame.aiModelLoaded) {
                aiButton.innerHTML = '<i class="fas fa-plug"></i> 启动 Flask 后可召唤 AI';
                aiButton.disabled = false;
            } else if (flappyGame.aiMode) {
                aiButton.innerHTML = '<i class="fas fa-user"></i> 切回手动';
                aiButton.disabled = false;
            } else {
                aiButton.innerHTML = '<i class="fas fa-robot"></i> 召唤 AI 试玩';
                aiButton.disabled = false;
            }
        }
    }

    if (aiButton) {
        aiButton.addEventListener('click', () => {
            if (!flappyGame.aiModelLoaded) {
                if (typeof window.showToast === 'function') {
                    window.showToast('未连接 Flask 推理服务，请先启动 backend (port 5000)');
                } else {
                    alert('未连接 Flask 推理服务，请先启动 backend (port 5000)');
                }
                return;
            }
            flappyGame.toggleAI();
            updateFlappyUI();
        });
    }

    if (restartButton) {
        restartButton.addEventListener('click', () => {
            flappyGame.reset();
            updateFlappyUI();
        });
    }

    // 初始 + 定时刷新状态（checkBackend 是异步的，需要轮询一下）
    updateFlappyUI();
    setInterval(updateFlappyUI, 1500);
});

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
                    cell.style.backgroundColor = 'rgba(238, 228, 218, 0.35)';
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
        if (board[0][0] === maxTile) cornerBonus = 1000;
        else if (board[0][3] === maxTile || board[3][0] === maxTile || board[3][3] === maxTile) cornerBonus = 500;
        return empty * 200 + smoothness * 1.5 + monotonicity * 2 + cornerBonus;
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
        let bestDir = null;
        let bestScore = -Infinity;
        for (let dir of ['left', 'right', 'up', 'down']) {
            let { newBoard } = this.moveBoard(this.board, dir);
            if (!this.areBoardsEqual(newBoard, this.board)) {
                let score = this.expectimax(newBoard, 3, false);  // 深度3，效果足够
                if (score > bestScore) {
                    bestScore = score;
                    bestDir = dir;
                }
            }
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

// ---------- game-tetris.js ----------
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
        this.nextPiece = null;
        this.holdPiece = null;
        this.canHold = true;
        this.currentPosition = { x: 0, y: 0 };
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameRunning = false;
        this.gameOver = false;
        this.paused = false;
        this.rafId = null;
        this.bestScore = SkyStorage.getInt('skystar:v1:tetris:best', 0);

        this.dropInterval = 1000;
        this.lastDropTime = 0;

        this.flashRows = [];
        this.flashTimeout = null;
        this.ghostY = 0;

        this.aiSpeed = 300;
        this.aiPlaying = false;
        this.aiTimer = null;
        
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
        if (this.nextPiece) {
            this.currentPiece = this.nextPiece;
        } else {
            this.currentPiece = this.getRandomPiece();
        }
        this.nextPiece = this.getRandomPiece();
        this.canHold = true;
        this.currentPosition = {
            x: Math.floor((this.COLS - this.currentPiece.shape[0].length) / 2),
            y: 0
        };
        this.updateGhostPosition();
        this.drawNextPiece();
        this.drawHoldPiece();

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

    swapHold() {
        if (!this.gameRunning || this.gameOver || this.paused || !this.canHold) return;

        if (!this.holdPiece) {
            this.holdPiece = this.createPiece(this.currentPiece.type);
            this.currentPiece = this.nextPiece || this.getRandomPiece();
            this.nextPiece = this.getRandomPiece();
        } else {
            const tempType = this.currentPiece.type;
            this.currentPiece = this.createPiece(this.holdPiece.type);
            this.holdPiece = this.createPiece(tempType);
        }

        this.currentPosition = {
            x: Math.floor((this.COLS - this.currentPiece.shape[0].length) / 2),
            y: 0
        };
        this.canHold = false;
        this.updateGhostPosition();
        this.drawNextPiece();
        this.drawHoldPiece();
        this.drawBoard();
    }

    drawMiniBlock(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, size, size);
    }

    drawPieceToCanvas(canvas, piece, blockSize) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!piece) return;
        const shape = piece.shape;
        const rows = shape.length;
        const cols = shape[0].length;
        const offsetX = (canvas.width - cols * blockSize) / 2;
        const offsetY = (canvas.height - rows * blockSize) / 2;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (shape[row][col]) {
                    this.drawMiniBlock(ctx, offsetX + col * blockSize, offsetY + row * blockSize, blockSize, piece.color);
                }
            }
        }
    }

    drawNextPiece() {
        const nextCanvas = document.getElementById('tetrisNextCanvas');
        if (nextCanvas) {
            this.drawPieceToCanvas(nextCanvas, this.nextPiece, 16);
        }
    }

    drawHoldPiece() {
        const holdCanvas = document.getElementById('tetrisHoldCanvas');
        if (holdCanvas) {
            this.drawPieceToCanvas(holdCanvas, this.holdPiece, 16);
        }
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
            const isNewBest = this.score > this.bestScore;
            if (isNewBest) {
                this.bestScore = this.score;
                SkyStorage.setInt('skystar:v1:tetris:best', this.bestScore);
            }
            this.ctx.fillText(`得分: ${this.score}${isNewBest ? '  🏆 New Best!' : `  (Best: ${this.bestScore})`}`, this.canvas.width / 2, this.canvas.height / 2 + 10);

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

        const progress = this.lines % 10;
        const progressFill = document.getElementById('tetrisProgressFill');
        const progressText = document.getElementById('tetrisProgressText');
        if (progressFill) progressFill.style.width = (progress / 10 * 100) + '%';
        if (progressText) progressText.textContent = `${progress} / 10`;
    }
    
    start() {
        // 取消已有 RAF, 防止重复启动
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.initBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameRunning = true;
        this.gameOver = false;
        this.paused = false;
        this.dropInterval = 1000;
        this.flashRows = [];
        this.nextPiece = null;
        this.holdPiece = null;
        this.canHold = true;
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
            if (!this.rafId) this.gameLoop(); // 仅在 RAF 未运行时重启
        } else {
            this.drawBoard();
        }
    }
    
    gameLoop() {
        if (!this.gameRunning || this.gameOver || this.paused) {
            this.rafId = null; // 清除标记, 让 togglePause/resume 能判断需要重启
            return; // 暂停/未开始/结束时不调度 RAF, 避免空转
        }

        const now = Date.now();
        if (now - this.lastDropTime > this.dropInterval) {
            this.moveDown();
            this.lastDropTime = now;
        }

        this.drawBoard();
        this.rafId = requestAnimationFrame(() => this.gameLoop());
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
    
    startAI(intervalMs = null) {
        if (this.aiPlaying) return;
        if (!this.gameRunning) this.start();
        this.aiPlaying = true;
        this.updateAIButton();

        const speed = intervalMs || this.aiSpeed || 300;
        this.aiTimer = setInterval(() => {
            if (this.gameRunning && !this.gameOver && !this.paused) {
                this.executeAIMove();
            } else if (this.gameOver) {
                this.stopAI();
            }
        }, speed);
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
            // 仅当俄罗斯方块容器处于 active 时才响应键盘
            if (!document.querySelector('.game-container.game-tetris.active')) return;
            const key = e.code;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'Escape', 'KeyC', 'ShiftLeft', 'ShiftRight'].includes(key)) {
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
                case 'KeyC':
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.swapHold();
                    break;
                case 'KeyP':
                case 'Escape':
                    this.togglePause();
                    this.drawBoard();
                    break;
            }
        });
    }

    // Shell 生命周期: tab 切走时取消 RAF, 切回时重启
    pause() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
            this._shellPauseStart = Date.now();
        }
    }

    resume() {
        if (!this.rafId && this.gameRunning && !this.gameOver && !this.paused) {
            if (this._shellPauseStart) {
                this.lastDropTime += Date.now() - this._shellPauseStart;
                this._shellPauseStart = 0;
            }
            this.gameLoop();
        }
    }
}

whenDomReady(() => {
    const tetris = new TetrisGame(
        'tetrisCanvas',
        'tetrisScore',
        'tetrisLevel',
        'tetrisLines'
    );
    window.tetris = tetris;
    if (window.registerGame) window.registerGame('tetris', {
        pause()  { tetris.pause(); },
        resume() { tetris.resume(); }
    });

    document.getElementById('tetrisStart').addEventListener('click', () => {
        if (tetris.aiPlaying) tetris.stopAI();
        tetris.start();
    });

    document.getElementById('tetrisAI').addEventListener('click', () => {
        if (tetris.aiPlaying) {
            tetris.stopAI();
        } else {
            tetris.startAI();
        }
    });

    const speedSelector = document.getElementById('tetrisSpeedSelector');
    if (speedSelector) {
        speedSelector.addEventListener('click', (e) => {
            if (e.target.classList.contains('speed-btn')) {
                speedSelector.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                tetris.aiSpeed = parseInt(e.target.dataset.speed);
                if (tetris.aiPlaying) {
                    tetris.stopAI();
                    tetris.startAI();
                }
            }
        });
    }
});

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
        this.currentPlayer = 'X';
        this.gameActive = true;
        this.aiThinking = false;
        this.movesX = [];
        this.movesO = [];
        this.updateUI();
        
        const cells = document.querySelectorAll('.game-tic-tac-toe .tic-tac-toe-cell');
        cells.forEach((cell, index) => {
            cell.style.pointerEvents = 'auto';
            cell.style.cursor = 'pointer';
        });
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
    game.initDOM();
});

// ---------- gomoku.js ----------
// ─── Gomoku (五子棋) ───
// 核心: minimax + alpha-beta 剪枝 + 棋型评估函数 + 候选点剪枝
// 棋型评分: 五连 100000 > 活四 10000 > 冲四 1000 > 活三 1000 > 眠三 100 > 活二 100 > ...

class GomokuGame {
    constructor() {
        this.BOARD_SIZE = 15;
        this.WIN_COUNT = 5;
        this.EMPTY = 0;
        this.BLACK = 1;   // 玩家
        this.WHITE = 2;   // AI (在 pve 模式下)

        this.board = [];
        this.currentPlayer = this.BLACK;
        this.moveHistory = [];      // [{x, y, player}]
        this.lastMove = null;
        this.winner = null;         // null | 1 | 2 | 'draw'
        this.winningCells = [];     // 获胜 5 子的坐标
        this.gameActive = false;
        this.aiThinking = false;
        this.mode = 'pve';          // 'pve' | 'pvp'
        this.humanPlayer = this.BLACK;
        this.aiPlayer = this.WHITE;
        this.scores = SkyStorage.getJSON('skystar:v1:gomoku:scores', { black: 0, white: 0, draw: 0 });
        // 防御: 旧数据可能字段不全
        if (!this.scores || typeof this.scores !== 'object') this.scores = { black: 0, white: 0, draw: 0 };
        this.scores.black = this.scores.black || 0;
        this.scores.white = this.scores.white || 0;
        this.scores.draw = this.scores.draw || 0;
        this.heatMap = null;        // AI 思考时显示热力图 {key: score}

        this.init();
    }

    // ─── 初始化 ───
    init() {
        this.buildBoard();
        this.bindControls();
        this.resetGame();
    }

    buildBoard() {
        const boardEl = document.getElementById('gomokuBoard');
        const linesEl = document.getElementById('gomokuBoardLines');
        const starsEl = document.getElementById('gomokuStarPoints');
        const heatEl = document.getElementById('gomokuHeatmap');
        if (!boardEl || !linesEl || !starsEl || !heatEl) return;

        // 清空
        boardEl.innerHTML = '';
        starsEl.innerHTML = '';
        heatEl.innerHTML = '';

        // 225 个 cell: 用 absolute 定位, 中心对齐到棋盘线交点 (j/15, i/15)
        // 棋盘线间距 100%/15 画 16 条 (第 0 和 15 重合在边缘), 落子点严格在交点上
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                const cell = document.createElement('div');
                cell.className = 'gomoku-cell';
                cell.dataset.x = i;
                cell.dataset.y = j;
                cell.style.left = (j / 15 * 100) + '%';
                cell.style.top = (i / 15 * 100) + '%';
                cell.addEventListener('click', () => this.onCellClick(i, j));
                boardEl.appendChild(cell);
            }
        }

        // 5 个定位点 (天元 + 4 星): 中心 (7,7) + 4 个角 (3,3)(3,11)(11,3)(11,11)
        // 位置 = 棋盘线交点 = (j/15, i/15) * 100% (跟 cell 中心完全对齐)
        const stars = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
        stars.forEach(([x, y]) => {
            const dot = document.createElement('div');
            dot.className = 'gomoku-star-point';
            dot.style.left = (y / 15 * 100) + '%';
            dot.style.top = (x / 15 * 100) + '%';
            starsEl.appendChild(dot);
        });

        // 热力图占位
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                const heat = document.createElement('div');
                heat.className = 'gomoku-heat';
                heat.dataset.x = i;
                heat.dataset.y = j;
                heat.style.background = 'transparent';
                heatEl.appendChild(heat);
            }
        }
    }

    bindControls() {
        document.querySelectorAll('.gomoku-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });
        const resetBtn = document.getElementById('gomokuReset');
        const undoBtn = document.getElementById('gomokuUndo');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetGame());
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
    }

    // ─── 模式与重置 ───
    setMode(mode) {
        if (mode === this.mode) return;
        this.mode = mode;
        document.querySelectorAll('.gomoku-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        this.resetGame();
    }

    resetGame() {
        this.board = Array.from({ length: this.BOARD_SIZE }, () =>
            Array(this.BOARD_SIZE).fill(this.EMPTY)
        );
        this.currentPlayer = this.BLACK;  // 黑先
        this.moveHistory = [];
        this.lastMove = null;
        this.winner = null;
        this.winningCells = [];
        this.gameActive = true;
        this.aiThinking = false;
        this.heatMap = null;
        this.hideHeatmap();
        this.renderBoard();
        this.updateStatus();
        this.updateScores();
    }

    // ─── 落子 ───
    onCellClick(x, y) {
        if (!this.gameActive || this.aiThinking) return;
        if (this.board[x][y] !== this.EMPTY) return;
        // 人机模式下, 只允许玩家落子
        if (this.mode === 'pve' && this.currentPlayer !== this.humanPlayer) return;
        this.makeMove(x, y);
        // 触发 AI
        if (this.mode === 'pve' && this.gameActive) {
            this.aiMove();
        }
    }

    makeMove(x, y) {
        const player = this.currentPlayer;
        this.board[x][y] = player;
        this.moveHistory.push({ x, y, player });
        this.lastMove = { x, y, player };

        // 胜负判定
        const winLine = this.checkWin(x, y, player);
        if (winLine) {
            this.winner = player;
            this.gameActive = false;
            this.winningCells = winLine;
            this.scores[player === this.BLACK ? 'black' : 'white']++;
        } else if (this.moveHistory.length === this.BOARD_SIZE * this.BOARD_SIZE) {
            this.winner = 'draw';
            this.gameActive = false;
            this.scores.draw++;
        } else {
            this.currentPlayer = player === this.BLACK ? this.WHITE : this.BLACK;
        }

        this.hideHeatmap();
        this.renderBoard();
        this.updateStatus();
        this.updateScores();
    }

    // ─── 胜负判定 ───
    // 从 (x, y) 向 4 个方向延伸, 找到连续的同色连子; 返回 5 子坐标数组
    checkWin(x, y, player) {
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (const [dx, dy] of dirs) {
            const line = [{ x, y }];
            // 正向
            for (let k = 1; k < this.WIN_COUNT; k++) {
                const nx = x + dx * k, ny = y + dy * k;
                if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) break;
                if (this.board[nx][ny] !== player) break;
                line.push({ x: nx, y: ny });
            }
            // 反向
            for (let k = 1; k < this.WIN_COUNT; k++) {
                const nx = x - dx * k, ny = y - dy * k;
                if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) break;
                if (this.board[nx][ny] !== player) break;
                line.unshift({ x: nx, y: ny });
            }
            if (line.length >= this.WIN_COUNT) {
                return line.slice(0, this.WIN_COUNT);
            }
        }
        return null;
    }

    // ─── 悔棋 ───
    undo() {
        if (this.aiThinking) return;
        if (this.moveHistory.length === 0) return;
        const undoCount = this.mode === 'pve' ? 2 : 1;
        for (let i = 0; i < undoCount && this.moveHistory.length > 0; i++) {
            const last = this.moveHistory.pop();
            this.board[last.x][last.y] = this.EMPTY;
        }
        this.winner = null;
        this.winningCells = [];
        this.gameActive = true;
        this.lastMove = this.moveHistory.length > 0
            ? { ...this.moveHistory[this.moveHistory.length - 1] }
            : null;
        this.currentPlayer = this.moveHistory.length > 0
            ? (this.moveHistory[this.moveHistory.length - 1].player === this.BLACK ? this.WHITE : this.BLACK)
            : this.BLACK;
        this.hideHeatmap();
        this.renderBoard();
        this.updateStatus();
    }

    // ─── AI ───
    aiMove() {
        this.aiThinking = true;
        this.updateStatus();
        // 异步, 避免阻塞 UI
        setTimeout(() => {
            const move = this.findBestMove();
            if (move && this.gameActive) {
                this.makeMove(move.x, move.y);
            }
            this.aiThinking = false;
            this.updateStatus();
        }, 80);
    }

    // 搜索深度: 开局浅 (2), 中局深 (3-4), 残局深 (4)
    getSearchDepth() {
        const n = this.moveHistory.length;
        if (n < 6) return 3;       // 开局: 浅一些
        if (n < 30) return 4;      // 中局: 较深
        return 4;                  // 残局: 4 层
    }

    // 候选点剪枝: 已有棋子 2 格内 OR 必杀/必防点
    // 返回按"紧迫度"排序的前 K 个候选点
    getCandidateMoves(limit = 14) {
        if (this.moveHistory.length === 0) {
            return [{ x: 7, y: 7 }];
        }
        const candidates = [];
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] !== this.EMPTY) continue;
                // 检查 2 格内是否有子
                let near = false;
                for (let dx = -2; dx <= 2 && !near; dx++) {
                    for (let dy = -2; dy <= 2 && !near; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = i + dx, ny = j + dy;
                        if (nx >= 0 && nx < this.BOARD_SIZE && ny >= 0 && ny < this.BOARD_SIZE &&
                            this.board[nx][ny] !== this.EMPTY) {
                            near = true;
                        }
                    }
                }
                if (near) candidates.push({ x: i, y: j });
            }
        }
        if (candidates.length <= limit) return candidates;

        // 评分排序: 双方紧迫度 = max(AI 落子收益, 玩家落子收益 * 1.2)
        // 防守略优先于进攻 (避免 AI 忽视对方的 4 连)
        const scored = candidates.map(move => {
            this.board[move.x][move.y] = this.aiPlayer;
            const aiScore = this.evaluatePoint(move.x, move.y, this.aiPlayer);
            this.board[move.x][move.y] = this.humanPlayer;
            const humanScore = this.evaluatePoint(move.x, move.y, this.humanPlayer);
            this.board[move.x][move.y] = this.EMPTY;
            // 防守权重略高
            return { x: move.x, y: move.y, score: Math.max(aiScore, humanScore * 1.15) };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit).map(s => ({ x: s.x, y: s.y }));
    }

    // 找最佳落子
    findBestMove() {
        const candidates = this.getCandidateMoves(14);
        if (candidates.length === 0) return { x: 7, y: 7 };

        const depth = this.getSearchDepth();
        let bestScore = -Infinity;
        let bestMove = candidates[0];
        const movesWithScore = [];

        for (const move of candidates) {
            this.board[move.x][move.y] = this.aiPlayer;
            const score = this.minimax(depth - 1, -Infinity, Infinity, false);
            this.board[move.x][move.y] = this.EMPTY;
            movesWithScore.push({ ...move, score });
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        // 调试: 把前几个候选点写到控制台
        if (window.console && console.table) {
            console.table(movesWithScore.slice(0, 5).map(m => ({
                x: m.x, y: m.y, score: m.score.toFixed(0)
            })));
        }

        // 热力图: 把评分显示到棋盘上
        this.showHeatmap(movesWithScore);

        return bestMove;
    }

    // minimax + alpha-beta
    // isMax=true 表示当前层是 AI 走 (取 max), false 表示玩家走 (取 min)
    minimax(depth, alpha, beta, isMax) {
        if (depth === 0) return this.evaluate();

        const candidates = this.getCandidateMoves(10);
        if (candidates.length === 0) return this.evaluate();

        if (isMax) {
            let maxScore = -Infinity;
            for (const move of candidates) {
                this.board[move.x][move.y] = this.aiPlayer;
                // 终局检查
                if (this.checkWin(move.x, move.y, this.aiPlayer)) {
                    this.board[move.x][move.y] = this.EMPTY;
                    return 1000000;
                }
                const score = this.minimax(depth - 1, alpha, beta, false);
                this.board[move.x][move.y] = this.EMPTY;
                if (score > maxScore) maxScore = score;
                if (maxScore > alpha) alpha = maxScore;
                if (beta <= alpha) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const move of candidates) {
                this.board[move.x][move.y] = this.humanPlayer;
                if (this.checkWin(move.x, move.y, this.humanPlayer)) {
                    this.board[move.x][move.y] = this.EMPTY;
                    return -1000000;
                }
                const score = this.minimax(depth - 1, alpha, beta, true);
                this.board[move.x][move.y] = this.EMPTY;
                if (score < minScore) minScore = score;
                if (minScore < beta) beta = minScore;
                if (beta <= alpha) break;
            }
            return minScore;
        }
    }

    // ─── 评估函数 ───
    // 全局评分: 己方总分 - 对方总分
    evaluate() {
        let aiScore = 0, humanScore = 0;
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] === this.aiPlayer) {
                    aiScore += this.evaluatePoint(i, j, this.aiPlayer);
                } else if (this.board[i][j] === this.humanPlayer) {
                    humanScore += this.evaluatePoint(i, j, this.humanPlayer);
                }
            }
        }
        return aiScore - humanScore;
    }

    // 单点评估: 从 (x, y) 出发, 4 个方向的棋型得分之和
    evaluatePoint(x, y, player) {
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        let total = 0;
        for (const [dx, dy] of dirs) {
            total += this.evaluateLine(x, y, dx, dy, player);
        }
        return total;
    }

    // 评估从 (x, y) 沿 (dx, dy) 方向的连子情况
    // 假设 (x, y) 是 player 的棋子
    evaluateLine(x, y, dx, dy, player) {
        let count = 1;
        let leftOpen = 0, rightOpen = 0;  // 0=边界/对手堵, 1=空格

        // 正向 (向右)
        let i = 1;
        while (true) {
            const nx = x + dx * i, ny = y + dy * i;
            if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) { rightOpen = 0; break; }
            if (this.board[nx][ny] === player) { count++; i++; continue; }
            if (this.board[nx][ny] === this.EMPTY) { rightOpen = 1; break; }
            rightOpen = 0; break;  // 对方棋子
        }
        // 反向 (向左)
        i = 1;
        while (true) {
            const nx = x - dx * i, ny = y - dy * i;
            if (nx < 0 || nx >= this.BOARD_SIZE || ny < 0 || ny >= this.BOARD_SIZE) { leftOpen = 0; break; }
            if (this.board[nx][ny] === player) { count++; i++; continue; }
            if (this.board[nx][ny] === this.EMPTY) { leftOpen = 1; break; }
            leftOpen = 0; break;
        }

        // 评分
        if (count >= 5) return 100000;
        const openEnds = leftOpen + rightOpen;
        if (openEnds === 0) {
            // 死棋
            if (count === 4) return 0;       // 死四 (没威胁)
            if (count === 3) return 0;
            if (count === 2) return 0;
            return 0;
        } else if (openEnds === 2) {
            // 活 N
            if (count === 4) return 10000;    // 活四: 必胜
            if (count === 3) return 1000;     // 活三: 高威胁
            if (count === 2) return 100;      // 活二
            return 10;                        // 活一
        } else {
            // 眠 N (一端被堵)
            if (count === 4) return 1000;     // 冲四
            if (count === 3) return 100;      // 眠三
            if (count === 2) return 10;       // 眠二
            return 1;
        }
    }

    // ─── 热力图 ───
    showHeatmap(movesWithScore) {
        const heatEl = document.getElementById('gomokuHeatmap');
        if (!heatEl) return;
        const maxScore = Math.max(...movesWithScore.map(m => m.score), 1);
        const map = new Map();
        movesWithScore.forEach(m => map.set(`${m.x},${m.y}`, m.score));
        heatEl.querySelectorAll('.gomoku-heat').forEach(heat => {
            const key = `${heat.dataset.x},${heat.dataset.y}`;
            const score = map.get(key);
            if (score === undefined) {
                heat.textContent = '';
                heat.style.background = 'transparent';
            } else {
                const intensity = Math.min(1, score / 100000);
                const alpha = 0.15 + intensity * 0.55;
                heat.textContent = score > 100 ? Math.round(score / 100) : '';
                heat.style.background = score > 0
                    ? `radial-gradient(circle, rgba(251, 191, 36, ${alpha}) 0%, transparent 70%)`
                    : 'rgba(239, 68, 68, 0.15)';
            }
        });
        heatEl.classList.add('show');
    }

    hideHeatmap() {
        const heatEl = document.getElementById('gomokuHeatmap');
        if (heatEl) heatEl.classList.remove('show');
    }

    // ─── 渲染 ───
    renderBoard() {
        const boardEl = document.getElementById('gomokuBoard');
        if (!boardEl) return;
        const cells = boardEl.querySelectorAll('.gomoku-cell');
        const winSet = new Set(this.winningCells.map(c => `${c.x},${c.y}`));
        cells.forEach(cell => {
            const x = parseInt(cell.dataset.x, 10);
            const y = parseInt(cell.dataset.y, 10);
            const v = this.board[x][y];
            // 清空
            cell.innerHTML = '';
            cell.classList.remove('win-cell');
            if (v !== this.EMPTY) {
                const piece = document.createElement('div');
                piece.className = 'gomoku-piece ' + (v === this.BLACK ? 'black' : 'white');
                if (this.lastMove && this.lastMove.x === x && this.lastMove.y === y) {
                    piece.classList.add('last-move');
                }
                cell.appendChild(piece);
            }
            if (winSet.has(`${x},${y}`)) {
                cell.classList.add('win-cell');
            }
        });
    }

    updateStatus() {
        const statusEl = document.getElementById('gomokuStatus');
        if (!statusEl) return;
        statusEl.classList.remove('thinking');

        if (this.winner === 'draw') {
            statusEl.innerHTML = '<span style="color:#fbbf24">🤝 平局</span>';
            return;
        }
        if (this.winner) {
            const name = this.winner === this.BLACK ? '黑方' : '白方';
            const iconClass = this.winner === this.BLACK ? 'black' : 'white';
            statusEl.innerHTML = `<span class="status-icon ${iconClass}"></span> ${name} 获胜！`;
            return;
        }
        if (this.aiThinking) {
            statusEl.classList.add('thinking');
            statusEl.textContent = '🤖 AI 思考中';
            return;
        }
        const name = this.currentPlayer === this.BLACK ? '黑方' : '白方';
        const iconClass = this.currentPlayer === this.BLACK ? 'black' : 'white';
        statusEl.innerHTML = `<span class="status-icon ${iconClass}"></span> ${name} 回合`;
    }

    updateScores() {
        const blackEl = document.getElementById('gomokuScoreBlack');
        const whiteEl = document.getElementById('gomokuScoreWhite');
        const drawEl = document.getElementById('gomokuScoreDraw');
        if (blackEl) blackEl.textContent = this.scores.black;
        if (whiteEl) whiteEl.textContent = this.scores.white;
        if (drawEl) drawEl.textContent = this.scores.draw;
        SkyStorage.setJSON('skystar:v1:gomoku:scores', this.scores);
    }
}

// ─── 启动 ───
whenDomReady(() => {
    if (document.getElementById('gomokuBoard')) {
        window.gomokuGame = new GomokuGame();
        // 暴露 fitGomoku 给 index.html 的 fitGame()
        window.fitGomoku = function (container) {
            const board = container.querySelector('.gomoku-board-wrapper');
            if (!board) return;
            const cs = getComputedStyle(container);
            const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            const cw = container.clientWidth - padX;
            const ch = container.clientHeight - padY;
            // 减去其他元素占用
            const others = container.querySelectorAll('.gomoku-header, .gomoku-status, .gomoku-controls, .gomoku-instructions');
            let otherH = 0;
            others.forEach(el => {
                const s = getComputedStyle(el);
                otherH += el.offsetHeight;
                otherH += (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0);
            });
            const availH = ch - otherH;
            const size = Math.max(260, Math.min(cw, availH, 580));
            board.style.maxWidth = size + 'px';
            board.style.maxHeight = size + 'px';
        };
    }
});

// ---------- memory-game.js ----------
// ─── Memory Game (记忆翻牌) ───
// 玩法: 4×4 = 8 对卡牌，翻两张找相同，全部消除计时最短者胜
// 特效: 匹配时，卡片本身化作像素粒子向外飞散

class MemoryGame {
    constructor() {
        // 8 对卡牌: 图片名 + 图案名
        this.CARD_PAIRS = [
            { id: 'star',      label: '星光水晶',   src: 'assets/card-star.webp' },
            { id: 'moon',     label: '明月',       src: 'assets/card-moon.webp' },
            { id: 'lightning',label: '闪电',       src: 'assets/card-lightning.webp' },
            { id: 'sun',      label: '烈阳',       src: 'assets/card-sun.webp' },
            { id: 'flower',   label: '莲花',       src: 'assets/card-flower.webp' },
            { id: 'flame',    label: '烈焰',       src: 'assets/card-flame.webp' },
            { id: 'potion',   label: '魔药',       src: 'assets/card-potion.webp' },
            { id: 'waterfall',label: '瀑布',       src: 'assets/card-waterfall.webp' },
        ];

        this.STORAGE_KEY = 'skystar:v1:memory:bestTime';
        this.LEGACY_KEY = 'memory_best_time';
        this.FLIP_MS = 550;     // CSS transition 时长 (要等翻完再触发抖动/匹配)
        this.PREVIEW_MS = 1200; // 开局预览时长

        this.board = [];
        this.flipped = [];
        this.matched = 0;
        this.moves = 0;
        this.seconds = 0;
        this.timer = null;
        this.playing = false;
        this.locked = false;
        this.dissolving = new Set();

        // 粒子 / 冲击波
        this.particles = [];
        this.shockwaves = [];
        this.particleCanvas = null;
        this.particleCtx = null;
        this.particleRaf = null;

        this.init();
    }

    init() {
        this.buildBoard();
        this.bindControls();
        this.loadBest();
        this.updateUI();
    }

    // ─── 初始化 / 重置 ───
    buildBoard() {
        const boardEl = document.getElementById('memoryBoard');
        const canvasEl = document.getElementById('memoryParticleCanvas');
        if (!boardEl) return;
        boardEl.innerHTML = '';

        // 16 张牌 (每对 2 张)
        const pairs = [];
        this.CARD_PAIRS.forEach((card, idx) => {
            pairs.push({ ...card, uid: idx + '-a' });
            pairs.push({ ...card, uid: idx + '-b' });
        });

        // Fisher-Yates 洗牌
        for (let i = pairs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
        }
        this.board = pairs.map((p, i) => ({
            ...p,
            index: i,
            flipped: false,
            matched: false,
        }));

        // 创建 DOM
        this.board.forEach((card, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'memory-card';
            cardEl.dataset.index = idx;
            cardEl.innerHTML = `
                <div class="memory-card-inner">
                    <div class="memory-card-face memory-card-front"></div>
                    <div class="memory-card-face memory-card-back">
                        <img src="${card.src}" alt="${card.label}" draggable="false">
                    </div>
                </div>
            `;
            cardEl.addEventListener('click', () => this.onCardClick(idx));
            boardEl.appendChild(cardEl);
        });

        // 预加载所有图片（让 shard 首次出现就有图，不会闪空白）
        this.preloadImages();

        // 初始化粒子画布
        this.particleCanvas = canvasEl;
        this.particleCtx = canvasEl ? canvasEl.getContext('2d') : null;
    }

    preloadImages() {
        this.imageCache = {};
        this.CARD_PAIRS.forEach(card => {
            const img = new Image();
            img.src = card.src;
            this.imageCache[card.id] = img;
        });
    }

    bindControls() {
        const startBtn = document.getElementById('memoryStart');
        const resetBtn = document.getElementById('memoryReset');
        if (startBtn) startBtn.addEventListener('click', () => this.startGame());
        if (resetBtn) resetBtn.addEventListener('click', () => this.shuffleGame());
    }

    // ─── 最佳成绩 (localStorage, 隐私模式/配额满自动降级) ───
    loadBest() {
        SkyStorage.migrate(this.LEGACY_KEY, this.STORAGE_KEY);
        const stored = SkyStorage.get(this.STORAGE_KEY);
        this.bestTime = stored !== null ? parseInt(stored, 10) : null;
        if (isNaN(this.bestTime)) this.bestTime = null;
    }

    saveBest() {
        SkyStorage.setInt(this.STORAGE_KEY, this.bestTime);
    }

    // ─── 启动：先预览再开始 ───
    startGame() {
        this.stopTimer();
        this.board.forEach(c => { c.flipped = false; c.matched = false; });
        this.flipped = [];
        this.matched = 0;
        this.moves = 0;
        this.seconds = 0;
        this.locked = true;       // 预览期间锁住
        this.playing = true;
        this.dissolving.clear();
        this.particles = [];
        this.shockwaves = [];
        if (this.particleRaf) cancelAnimationFrame(this.particleRaf);
        this.particleCtx && this.particleCtx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);
        this.cleanupShards();

        this.renderCards();
        this.updateUI();

        // 清空状态文字
        const statusEl = document.getElementById('memoryStatus');
        if (statusEl) {
            statusEl.className = 'memory-status';
            statusEl.textContent = '';
        }

        // 显示预览: 翻所有牌 → 等 → 翻回
        const cardEls = document.querySelectorAll('.memory-card');
        cardEls.forEach(el => el.classList.add('preview'));

        const mask = document.getElementById('memoryPreviewMask');
        const previewText = mask ? mask.querySelector('.memory-preview-text') : null;
        if (previewText) previewText.innerHTML = '<strong>记住位置</strong>翻开中…';
        if (mask) mask.classList.add('show');

        setTimeout(() => {
            // 翻回背面
            cardEls.forEach(el => el.classList.remove('preview'));
            if (previewText) previewText.innerHTML = '<strong>开始挑战</strong>点击任意卡牌';
            setTimeout(() => {
                if (mask) mask.classList.remove('show');
                this.locked = false;
                this.startTimer();
            }, 400);
        }, this.PREVIEW_MS);
    }

    shuffleGame() {
        // 重新洗牌并直接开始 (不预览)
        this.stopTimer();
        this.board.forEach(c => { c.flipped = false; c.matched = false; });
        this.flipped = [];
        this.matched = 0;
        this.moves = 0;
        this.seconds = 0;
        this.locked = false;
        this.playing = true;
        this.dissolving.clear();
        this.particles = [];
        this.shockwaves = [];
        if (this.particleRaf) cancelAnimationFrame(this.particleRaf);
        this.particleCtx && this.particleCtx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);
        this.cleanupShards();

        // 重新洗牌数据
        for (let i = this.board.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.board[i], this.board[j]] = [this.board[j], this.board[i]];
        }
        this.board.forEach((c, i) => { c.index = i; });

        // 重建 DOM
        const boardEl = document.getElementById('memoryBoard');
        if (boardEl) boardEl.innerHTML = '';
        this.board.forEach((card, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'memory-card';
            cardEl.dataset.index = idx;
            cardEl.innerHTML = `
                <div class="memory-card-inner">
                    <div class="memory-card-face memory-card-front"></div>
                    <div class="memory-card-face memory-card-back">
                        <img src="${card.src}" alt="${card.label}" draggable="false">
                    </div>
                </div>
            `;
            cardEl.addEventListener('click', () => this.onCardClick(idx));
            boardEl.appendChild(cardEl);
        });

        this.renderCards();
        this.updateUI();

        // 更新状态文字
        const statusEl = document.getElementById('memoryStatus');
        if (statusEl) {
            statusEl.className = 'memory-status';
            statusEl.textContent = '🔀 新的牌局已开始';
        }

        this.startTimer();
    }

    // ─── 计时 ───
    startTimer() {
        this.timer = setInterval(() => {
            this.seconds++;
            this.updateUI();
        }, 1000);
    }

    stopTimer() {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    formatTime(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    // ─── 点击 ───
    onCardClick(idx) {
        if (!this.playing || this.locked) return;
        const card = this.board[idx];
        if (card.flipped || card.matched) return;
        if (this.dissolving.has(idx)) return;
        if (this.flipped.length >= 2) return;

        // 翻开
        card.flipped = true;
        this.flipped.push(idx);
        this.renderCard(idx);

        if (this.flipped.length === 2) {
            this.moves++;
            this.locked = true;
            const [i1, i2] = this.flipped;
            const c1 = this.board[i1];
            const c2 = this.board[i2];

            // 翻牌动画完成后 (FLIP_MS) 再判定
            setTimeout(() => {
                if (c1.id === c2.id) {
                    this.handleMatch(i1, i2);
                } else {
                    this.handleMismatch(i1, i2);
                }
            }, this.FLIP_MS);
        }
    }

    handleMatch(i1, i2) {
        const c1 = this.board[i1];
        const c2 = this.board[i2];

        this.matched++;
        c1.matched = true;
        c2.matched = true;
        this.dissolving.add(i1);
        this.dissolving.add(i2);

        const cardEls = document.querySelectorAll('.memory-card');
        // T=0: matched class (青光短暂可见, 100ms 后被 shattering 隐藏)
        cardEls[i1].classList.add('matched');
        cardEls[i2].classList.add('matched');

        // T=0: 立即触发冲击波 + 卡片撕裂
        this.emitShockwave(i1, i2);
        this.shatterCard(i1);
        this.shatterCard(i2);

        // T=100ms: 卡片淡出 (让青光先闪一下, 再交棒给碎片)
        setTimeout(() => {
            cardEls[i1].classList.add('shattering');
            cardEls[i2].classList.add('shattering');
        }, 100);

        this.flipped = [];
        this.updateUI(true);

        // 检查胜利
        if (this.matched === this.CARD_PAIRS.length) {
            setTimeout(() => this.onWin(), 900);
        } else {
            this.locked = false;
        }
    }

    handleMismatch(i1, i2) {
        const c1 = this.board[i1];
        const c2 = this.board[i2];
        const cardEls = document.querySelectorAll('.memory-card');

        // 翻牌动画已完成 (FLIP_MS 后), 此时用户已看到牌, 可以开始抖动
        cardEls[i1].classList.add('wrong');
        cardEls[i2].classList.add('wrong');

        setTimeout(() => {
            c1.flipped = false;
            c2.flipped = false;
            this.renderCard(i1);
            this.renderCard(i2);
            cardEls[i1].classList.remove('wrong');
            cardEls[i2].classList.remove('wrong');
            this.flipped = [];
            this.locked = false;
        }, 700);
    }

    onWin() {
        this.playing = false;
        this.stopTimer();

        // 检查是否破纪录
        const isRecord = this.bestTime == null || this.seconds < this.bestTime;
        if (isRecord) {
            this.bestTime = this.seconds;
            this.saveBest();
        }

        const statusEl = document.getElementById('memoryStatus');
        if (statusEl) {
            statusEl.className = isRecord ? 'memory-status record' : 'memory-status win';
            statusEl.textContent = isRecord
                ? `🏆 新纪录！${this.formatTime(this.seconds)} / ${this.moves} 步`
                : `🎉 完成！用时 ${this.formatTime(this.seconds)} / ${this.moves} 步`;
        }
        this.updateUI();
    }

    // ─── 渲染 ───
    renderCards() {
        this.board.forEach((_, i) => this.renderCard(i));
    }

    renderCard(idx) {
        const card = this.board[idx];
        const cardEls = document.querySelectorAll('.memory-card');
        const cardEl = cardEls[idx];
        if (!cardEl) return;
        cardEl.classList.toggle('flipped', card.flipped);
        cardEl.classList.toggle('matched', card.matched);
    }

    updateUI(pulseMatched = false) {
        const movesEl = document.getElementById('memoryMoves');
        const timeEl = document.getElementById('memoryTime');
        const matchedEl = document.getElementById('memoryMatched');
        const bestEl = document.getElementById('memoryBest');
        const progressEl = document.getElementById('memoryProgressBar');

        if (movesEl) movesEl.textContent = this.moves;
        if (timeEl) timeEl.textContent = this.formatTime(this.seconds);
        if (matchedEl) matchedEl.textContent = `${this.matched}/${this.CARD_PAIRS.length}`;
        if (bestEl) bestEl.textContent = this.bestTime != null ? this.formatTime(this.bestTime) : '—:—';

        if (progressEl) {
            const pct = (this.matched / this.CARD_PAIRS.length) * 100;
            progressEl.style.width = pct + '%';
        }

        if (pulseMatched && matchedEl) {
            matchedEl.classList.remove('pulse');
            void matchedEl.offsetWidth;  // 强制 reflow 重启动画
            matchedEl.classList.add('pulse');
        }
    }

    // ─── 卡片撕裂 (核心特效) ───
    // 把卡片切成 3×2 六个碎片，CSS keyframe 动画带飞散 + 旋转
    shatterCard(idx) {
        const card = this.board[idx];
        const cardEl = document.querySelectorAll('.memory-card')[idx];
        if (!cardEl) return;

        const boardArea = this.particleCanvas
            ? this.particleCanvas.parentElement
            : cardEl.parentElement.parentElement;
        if (!boardArea) return;

        const cardRect = cardEl.getBoundingClientRect();
        const areaRect = boardArea.getBoundingClientRect();

        // 卡片在 board-area 内的位置
        const x = cardRect.left - areaRect.left;
        const y = cardRect.top - areaRect.top;
        const w = cardRect.width;
        const h = cardRect.height;

        const shardW = w / 3;
        const shardH = h / 2;

        // 6 个碎片: [col, row, tx, ty, rot]
        // 中心两片偏小位移, 角落两片飞得更远
        const configs = [
            [0, 0, -150,  -95,  -32],  // 左上
            [1, 0,    0, -135,   18],  // 中上
            [2, 0,  150,  -95,   28],  // 右上
            [0, 1, -140,   90,   22],  // 左下
            [1, 1,   15,  120,  -28],  // 中下
            [2, 1,  140,   90,  -34],  // 右下
        ];

        configs.forEach(([col, row, tx, ty, rot]) => {
            const shard = document.createElement('div');
            shard.className = 'memory-shard';
            shard.style.left = (x + col * shardW) + 'px';
            shard.style.top  = (y + row * shardH) + 'px';
            shard.style.width  = shardW + 'px';
            shard.style.height = shardH + 'px';
            shard.style.backgroundImage = `url('${card.src}')`;
            // background-size 300% 200% 让图片覆盖整个卡片 (3 列 × 2 行)
            // background-position 取该碎片对应的图片区域
            shard.style.backgroundPosition = `${col * -100}% ${row * -100}%`;
            shard.style.setProperty('--tx', tx + 'px');
            shard.style.setProperty('--ty', ty + 'px');
            shard.style.setProperty('--rot', rot + 'deg');
            shard.style.setProperty('--delay', (Math.random() * 0.05) + 's');
            boardArea.appendChild(shard);
            shard.addEventListener('animationend', () => shard.remove());
        });
    }

    // ─── 中心冲击波 (从两张配对卡的中点扩散) ───
    emitShockwave(idx1, idx2) {
        if (!this.particleCanvas) return;
        const cardEls = document.querySelectorAll('.memory-card');
        const c1 = cardEls[idx1];
        const c2 = cardEls[idx2];
        if (!c1 || !c2) return;

        const canvasRect = this.particleCanvas.getBoundingClientRect();
        const r1 = c1.getBoundingClientRect();
        const r2 = c2.getBoundingClientRect();

        // 两卡中心的中点
        const cx = ((r1.left + r1.width / 2) + (r2.left + r2.width / 2)) / 2 - canvasRect.left;
        const cy = ((r1.top + r1.height / 2) + (r2.top + r2.height / 2)) / 2 - canvasRect.top;

        this.shockwaves.push({
            x: cx, y: cy,
            radius: 0,
            maxRadius: 220,
            life: 48,
            maxLife: 48,
        });

        if (!this.particleRaf) this.tickParticles();
    }

    // ─── Canvas 帧循环 (画冲击波) ───
    tickParticles() {
        if (!this.particleCtx || !this.particleCanvas) return;
        const ctx = this.particleCtx;
        const W = this.particleCanvas.width;
        const H = this.particleCanvas.height;

        ctx.clearRect(0, 0, W, H);

        // 画冲击波 (双环: 外青内紫, 都带辉光)
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            const progress = 1 - sw.life / sw.maxLife;
            const r = sw.maxRadius * progress;
            const alpha = (1 - progress) * 0.9;

            if (sw.life > 0 && r > 0) {
                // 外环 (青)
                ctx.save();
                ctx.strokeStyle = `rgba(78, 205, 196, ${alpha})`;
                ctx.lineWidth = 5 * (1 - progress * 0.55);
                ctx.shadowBlur = 14;
                ctx.shadowColor = 'rgba(78, 205, 196, 0.7)';
                ctx.beginPath();
                ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
                ctx.stroke();
                // 内环 (紫, 稍小)
                ctx.strokeStyle = `rgba(139, 92, 246, ${alpha * 0.65})`;
                ctx.lineWidth = 3 * (1 - progress * 0.5);
                ctx.shadowColor = 'rgba(139, 92, 246, 0.6)';
                ctx.beginPath();
                ctx.arc(sw.x, sw.y, r * 0.68, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            sw.life--;
            if (sw.life <= 0) this.shockwaves.splice(i, 1);
        }

        // 兼容旧的 particle 系统 (没在用, 保留空数组安全)
        if (this.particles.length > 0) {
            // (no-op, particles 已被 shard 替代)
            this.particles = [];
        }

        if (this.shockwaves.length > 0) {
            this.particleRaf = requestAnimationFrame(() => this.tickParticles());
        } else {
            this.particleRaf = null;
            ctx.clearRect(0, 0, W, H);
        }
    }

    // 清理残余 shard (新一局/重新洗牌时调用)
    cleanupShards() {
        const boardArea = document.querySelector('.memory-board-area');
        if (boardArea) {
            boardArea.querySelectorAll('.memory-shard').forEach(s => s.remove());
        }
    }
}

// ─── 启动 + fitGame ───
whenDomReady(() => {
    if (document.getElementById('memoryBoard')) {
        window.memoryGame = new MemoryGame();

        // 暴露给 index.html 的 fitGame()
        window.fitMemory = function (container) {
            if (!container) return;
            const boardArea = container.querySelector('.memory-board-area');
            if (!boardArea) return;

            const cs = getComputedStyle(container);
            const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            const availW = container.clientWidth - padX;
            const availH = container.clientHeight - padY;

            // 测量其他元素占用的总高度
            const siblings = container.querySelectorAll('.memory-header, .memory-meta, .memory-status, .memory-controls, .memory-instructions');
            let otherH = 0;
            siblings.forEach(el => { if (el) otherH += el.offsetHeight; });
            const gapN = Math.max(0, siblings.length);  // 大致 gap 数
            const gap = parseFloat(cs.rowGap || cs.gap) || 10;
            const boardH = availH - otherH - gapN * gap;

            // 取最小值, 限定 240-520
            const size = Math.max(240, Math.min(availW, boardH, 520));
            boardArea.style.maxWidth = size + 'px';
            boardArea.style.maxHeight = size + 'px';

            // 同步 canvas 尺寸
            const canvas = container.querySelector('.memory-particle-canvas');
            if (canvas) {
                canvas.width = boardArea.offsetWidth;
                canvas.height = boardArea.offsetHeight;
            }
        };
    }
});

// ---------- game-maze.js ----------
// ─── AI 迷宫逃生 (Maze Escape) ───
// 玩家在程序生成的迷宫中寻找出口, AI 怪物用 A* 实时寻路追击
// 依赖: SkyStorage (scripts/storage.js)
//
// 设计要点:
//   1. 迷宫生成: 递归回溯 DFS, 1=墙 0=路, N 为奇数
//   2. 怪物 AI: A* 实时寻路 (最小堆优先队列) + 视线感知 + 巡逻
//   3. 关卡递进: 尺寸/怪物数/视野/速度随关卡增长
//   4. 保护期: 关卡开始 1.5s 怪物不动, 玩家闪烁无敌
//   5. 寻路可视化: 默认开启, 高亮怪物 A* 路径

(function () {
    // ---------- 最小堆 (A* 优先队列) ----------
    class MinHeap {
        constructor() { this.data = []; }
        size() { return this.data.length; }
        push(item) {
            this.data.push(item);
            this._up(this.data.length - 1);
        }
        pop() {
            if (this.data.length === 0) return null;
            const top = this.data[0];
            const last = this.data.pop();
            if (this.data.length > 0) {
                this.data[0] = last;
                this._down(0);
            }
            return top;
        }
        _up(i) {
            const d = this.data;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (d[p].f <= d[i].f) break;
                const t = d[p]; d[p] = d[i]; d[i] = t;
                i = p;
            }
        }
        _down(i) {
            const d = this.data, n = d.length;
            for (;;) {
                const l = i * 2 + 1, r = i * 2 + 2;
                let best = i;
                if (l < n && d[l].f < d[best].f) best = l;
                if (r < n && d[r].f < d[best].f) best = r;
                if (best === i) break;
                const t = d[best]; d[best] = d[i]; d[i] = t;
                i = best;
            }
        }
    }

    // ---------- 迷宫生成 (递归回溯 DFS, 迭代实现) ----------
    function generateMaze(N) {
        // N 为奇数; 1=墙, 0=路
        const grid = [];
        for (let i = 0; i < N; i++) grid.push(new Array(N).fill(1));
        const stack = [[1, 1]];
        grid[1][1] = 0;
        while (stack.length) {
            const top = stack[stack.length - 1];
            const x = top[0], y = top[1];
            const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]];
            // shuffle
            for (let i = dirs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
            }
            let carved = false;
            for (let k = 0; k < dirs.length; k++) {
                const dx = dirs[k][0], dy = dirs[k][1];
                const nx = x + dx, ny = y + dy;
                if (nx > 0 && nx < N - 1 && ny > 0 && ny < N - 1 && grid[ny][nx] === 1) {
                    grid[y + dy / 2][x + dx / 2] = 0;
                    grid[ny][nx] = 0;
                    stack.push([nx, ny]);
                    carved = true;
                    break;
                }
            }
            if (!carved) stack.pop();
        }
        // 确保出口通路
        grid[N - 2][N - 2] = 0;

        // ── 增加环路和灵活性 ──
        // 1) 随机打通更多捷径 (从 N/4 提到 N/2, 打破纯树状单行道)
        const extra = Math.floor(N / 2);
        for (let i = 0; i < extra; i++) {
            const x = 2 + Math.floor(Math.random() * (N - 4));
            const y = 2 + Math.floor(Math.random() * (N - 4));
            if (grid[y][x] === 1) grid[y][x] = 0;
        }

        // 2) 找出死胡同 (只有一个相邻通路格的格子), 打通约 40% 的死胡同尽头
        //    让玩家有更多绕路选择, 也方便拾取道具和周旋怪物
        const deadEnds = [];
        for (let y = 1; y < N - 1; y++) {
            for (let x = 1; x < N - 1; x++) {
                if (grid[y][x] !== 0) continue;
                let openNeighbors = 0;
                if (grid[y - 1][x] === 0) openNeighbors++;
                if (grid[y + 1][x] === 0) openNeighbors++;
                if (grid[y][x - 1] === 0) openNeighbors++;
                if (grid[y][x + 1] === 0) openNeighbors++;
                if (openNeighbors === 1) deadEnds.push({ x: x, y: y });
            }
        }
        // 打通死胡同: 朝其唯一的墙方向开一个口 (变成通路), 不破坏边界
        for (let i = 0; i < deadEnds.length; i++) {
            if (Math.random() > 0.4) continue; // 40% 概率打通
            const d = deadEnds[i];
            // 找到死胡同格子的墙邻居 (打通它连到隔壁格子)
            const wallDirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            for (let k = 0; k < wallDirs.length; k++) {
                const wx = d.x + wallDirs[k][0];
                const wy = d.y + wallDirs[k][1];
                if (wx <= 0 || wx >= N - 1 || wy <= 0 || wy >= N - 1) continue;
                if (grid[wy][wx] === 1) {
                    grid[wy][wx] = 0; // 打通墙
                    // 确保墙另一侧也是路 (避免打通后又是个死胡同)
                    const bx = wx + wallDirs[k][0];
                    const by = wy + wallDirs[k][1];
                    if (bx > 0 && bx < N - 1 && by > 0 && by < N - 1 && grid[by][bx] === 1) {
                        grid[by][bx] = 0;
                    }
                    break;
                }
            }
        }
        return grid;
    }

    // ---------- A* 寻路 (返回从 start 到 goal 的路径数组, 含起终点) ----------
    function heuristic(ax, ay, bx, by) {
        return Math.abs(ax - bx) + Math.abs(ay - by);
    }

    function astar(grid, sx, sy, gx, gy) {
        const N = grid.length;
        const key = (x, y) => y * N + x;
        const open = new MinHeap();
        const gScore = new Map();
        const cameFrom = new Map();
        const closed = new Set();
        const startKey = key(sx, sy);
        gScore.set(startKey, 0);
        open.push({ x: sx, y: sy, f: heuristic(sx, sy, gx, gy) });

        while (open.size() > 0) {
            const cur = open.pop();
            const curKey = key(cur.x, cur.y);
            if (cur.x === gx && cur.y === gy) {
                const path = [{ x: cur.x, y: cur.y }];
                let ck = curKey;
                while (cameFrom.has(ck)) {
                    const pk = cameFrom.get(ck);
                    path.unshift({ x: pk % N, y: Math.floor(pk / N) });
                    ck = pk;
                }
                return path;
            }
            if (closed.has(curKey)) continue;
            closed.add(curKey);
            const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            for (let k = 0; k < 4; k++) {
                const nx = cur.x + neighbors[k][0];
                const ny = cur.y + neighbors[k][1];
                if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
                if (grid[ny][nx] === 1) continue;
                const nk = key(nx, ny);
                if (closed.has(nk)) continue;
                const tg = gScore.get(curKey) + 1;
                if (!gScore.has(nk) || tg < gScore.get(nk)) {
                    cameFrom.set(nk, curKey);
                    gScore.set(nk, tg);
                    open.push({ x: nx, y: ny, f: tg + heuristic(nx, ny, gx, gy) });
                }
            }
        }
        return null;
    }

    // ---------- 关卡配置 ----------
    function getLevelConfig(level) {
        const N = Math.min(21 + (level - 1) * 2, 41); // 21 起步, 每关 +2, 上限 41 (均为奇数)
        const monsters = level >= 4 ? 2 : 1;
        const vision = Math.min(5 + Math.floor((level - 1) / 2), 8);
        const moveInterval = Math.max(420 - (level - 1) * 25, 200);
        const portals = level >= 4 ? 1 : 0;       // 第 4 关起有 1 对传送门
        const predict = level >= 5 ? 2 : 0;        // 第 5 关起怪物预判玩家 2 步走位
        // 钥匙需求: 1-2关1把, 3-4关2把, 5关起3把
        const keysNeeded = level <= 2 ? 1 : (level <= 4 ? 2 : 3);
        return { N: N, monsters: monsters, vision: vision, moveInterval: moveInterval, portals: portals, predict: predict, keysNeeded: keysNeeded };
    }

    // ---------- 游戏类 ----------
    class MazeGame {
        constructor() {
            this.canvas = document.getElementById('mazeCanvas');
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.levelEl = document.getElementById('mazeLevel');
            this.timerEl = document.getElementById('mazeTimer');
            this.statusEl = document.getElementById('mazeStatus');
            this.overlay = document.getElementById('mazeOverlay');
            this.overlayTitle = document.getElementById('mazeOverlayTitle');
            this.overlayMsg = document.getElementById('mazeOverlayMsg');
            this.bestLevelEl = document.getElementById('mazeBestLevel');
            this.bestTimeEl = document.getElementById('mazeBestTime');

            this.CELL_SIZE = 0;
            this.N = 21;
            this.level = 1;
            this.grid = null;
            this.player = { x: 1, y: 1 };
            this.exit = { x: 0, y: 0 };
            this.monsters = [];

            // 朝向系统: 玩家和怪物都有朝向, 影响视野锥和闪现方向
            // dir 用 {x, y}: 上{0,-1} 下{0,1} 左{-1,0} 右{1,0}
            this.playerDir = { x: 0, y: 1 }; // 初始朝下
            this.FOV_HALF_ANGLE = Math.PI / 3; // 扇形半角 60° (总 120°)
            this.chaseSpeedMult = 0.7; // 发现玩家后移动间隔 ×0.7 (加速)

            this.showPath = SkyStorage.getInt('skystar:v1:maze:show-path', 1) === 1;
            this.bestLevel = SkyStorage.getInt('skystar:v1:maze:best-level', 0);
            this.bestTime = SkyStorage.getInt('skystar:v1:maze:best-time', 0); // ms, 0 = 无

            this.running = false;
            this.paused = false;
            this.levelStartTime = 0;
            this.elapsed = 0;
            this.graceUntil = 0;
            this.pauseStart = 0;

            // 生命系统: 初始 3 命, 被怪物撞到扣 1, 归零 game over
            this.MAX_LIVES = 3;
            this.lives = this.MAX_LIVES;
            this.invincibleUntil = 0;  // 受伤后的无敌截止时间
            this.livesEl = document.getElementById('mazeLives');

            this.playerMoveInterval = 110; // ms
            this.lastPlayerMove = 0;
            this.heldDir = null;
            this.keys = {};

            this.monsterMoveInterval = 400;
            this.vision = 5;
            this.predict = 0;           // 怪物预判步数 (第 5 关起为 2)
            this.portals = [];          // 传送门对 [{a:{x,y}, b:{x,y}}]

            // 钥匙系统: 出口需收集足够钥匙才能开启
            this.keysNeeded = 1;        // 本关需要的钥匙数
            this.keysCollected = 0;     // 已收集钥匙数
            this.keyPickups = [];       // 地图上的钥匙拾取点 [{x, y}]
            this.exitLocked = true;     // 出口是否锁定 (钥匙够数后解锁)

            this.animId = null;
            this.pulse = 0;

            // ---------- 迷宫主题 (每关随机选择) ----------
            // 每个主题: wall=墙色, wallEdge=墙描边, wallTop=墙顶高光, wallShadow=墙底阴影,
            //           floor=地面色, dot=地面点阵色, footprint=足迹色
            // 固定色 (玩家绿/怪物红/出口金/道具紫青冰蓝橙) 在所有主题下都需清晰可辨
            this.THEMES = [
                { name: '青石地牢', wall: '#1e293b', wallEdge: '#475569', wallTop: '#334155', wallShadow: '#0f172a', floor: '#0f172a', dot: 'rgba(99, 102, 241, 0.18)', footprint: 'rgba(148, 163, 184, 0.5)' },
                { name: '熔岩洞穴', wall: '#3f1d1d', wallEdge: '#7f1d1d', wallTop: '#5b2424', wallShadow: '#1a0a0a', floor: '#1a0f0a', dot: 'rgba(251, 146, 60, 0.22)', footprint: 'rgba(251, 146, 60, 0.55)' },
                { name: '冰封遗迹', wall: '#1e3a5f', wallEdge: '#3b82f6', wallTop: '#2c5282', wallShadow: '#0c1e3a', floor: '#0c1e3a', dot: 'rgba(147, 197, 253, 0.22)', footprint: 'rgba(147, 197, 253, 0.55)' },
                { name: '虚空深渊', wall: '#2e1065', wallEdge: '#6d28d9', wallTop: '#4c1d95', wallShadow: '#0f0a1f', floor: '#0f0a1f', dot: 'rgba(167, 139, 250, 0.22)', footprint: 'rgba(167, 139, 250, 0.55)' }
            ];
            this.currentTheme = this.THEMES[0];
            this.footprints = []; // 玩家走过的格子 [{x, y, life}]

            // ---------- 道具系统 ----------
            // 4 种道具: sprint=闪现, vision=视野, freeze=冻结, decoy=诱饵
            this.ITEM_TYPES = ['sprint', 'vision', 'freeze', 'decoy'];
            this.ITEM_MAX = { sprint: 2, vision: 1, freeze: 1, decoy: 1 };
            this.ITEM_DURATION = { vision: 3000, freeze: 3000, decoy: 3000 };
            this.ITEM_NAMES = { sprint: '闪现', vision: '视野', freeze: '冻结', decoy: '诱饵' };
            // 每种道具的主题色 (核心色 + 辉光色 + rgb 字符串用于粒子), 替代统一的金色脉冲
            this.ITEM_COLORS = {
                sprint: { core: '#a855f7', glow: 'rgba(168, 85, 247, 0.7)', fade: 'rgba(168, 85, 247, 0)', rgbStr: '168,85,247', name: '紫' },
                vision: { core: '#22d3ee', glow: 'rgba(34, 211, 238, 0.7)', fade: 'rgba(34, 211, 238, 0)', rgbStr: '34,211,238', name: '青' },
                freeze: { core: '#7dd3fc', glow: 'rgba(125, 211, 252, 0.7)', fade: 'rgba(125, 211, 252, 0)', rgbStr: '125,211,252', name: '冰蓝' },
                decoy:  { core: '#fb923c', glow: 'rgba(251, 146, 60, 0.7)', fade: 'rgba(251, 146, 60, 0)', rgbStr: '251,146,60', name: '橙' }
            };
            this.items = { sprint: 0, vision: 0, freeze: 0, decoy: 0 }; // 玩家持有数量
            this.pickups = [];            // 地图上的道具拾取点 [{x, y, type, particles:[]}]
            this.activeEffects = {        // 当前生效中的效果
                visionPath: null,         // 视野道具: 到出口的路径数组
                visionUntil: 0,
                freezeUntil: 0,
                decoyPos: null,           // 诱饵道具: 幻影位置
                decoyUntil: 0,
                sprintTrail: []           // 闪现道具: 残影坐标列表 (渐隐)
            };
            this.itemSlots = [
                document.getElementById('mazeSlot0'),
                document.getElementById('mazeSlot1'),
                document.getElementById('mazeSlot2'),
                document.getElementById('mazeSlot3')
            ];

            // ---------- 正反馈系统 ----------
            this.dangerOverlay = document.getElementById('mazeDangerOverlay');
            this.floatTextsEl = document.getElementById('mazeFloatingTexts');
            this.scoreEl = document.getElementById('mazeScore');
            this.minimapCanvas = document.getElementById('mazeMinimap');
            this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
            this.totalScore = SkyStorage.getInt('skystar:v1:maze:totalScore', 0); // 累积总分持久化
            this.levelScore = 0;        // 本关得分
            this.hitsTaken = 0;         // 本关被怪物撞到的次数 (用于无伤判定)
            this.dangerActive = false;  // 险情警示是否激活中
            this.achievements = SkyStorage.getJSON('skystar:v1:maze:achievements', {}); // 成就持久化

            this.init();
        }

        init() {
            this.fitMaze();
            this.updateBestDisplay();
            if (this.scoreEl) this.scoreEl.textContent = this.totalScore;
            this.setupListeners();
            // 生成预览迷宫 (未开始)
            this.level = 1;
            this.prepareLevel(false);
            this.draw();
            // 启动渲染循环 (始终运行, 即便未开始也绘制静态画面)
            this.animId = requestAnimationFrame((t) => this.loop(t));
        }

        // 根据 game-container 可用空间计算 canvas 尺寸和格子大小
        fitMaze() {
            const container = this.canvas.parentElement;
            if (!container) return;
            const cs = getComputedStyle(container);
            const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            const cw = container.clientWidth - padX;
            const ch = container.clientHeight - padY;
            const otherH = this.calcOtherHeight(container);
            const avail = Math.min(cw, ch - otherH);
            const size = Math.max(240, Math.min(avail, 560));
            const N = this.N || 21;
            this.CELL_SIZE = Math.max(1, Math.floor(size / N));
            const pixelSize = this.CELL_SIZE * N;
            this.canvas.width = pixelSize;
            this.canvas.height = pixelSize;
            this.canvas.style.width = pixelSize + 'px';
            this.canvas.style.height = pixelSize + 'px';
        }

        calcOtherHeight(container) {
            let h = 0;
            const children = Array.from(container.children);
            for (let i = 0; i < children.length; i++) {
                const el = children[i];
                if (el === this.canvas) continue;
                if (el === this.overlay) continue;
                if (getComputedStyle(el).position === 'absolute') continue;
                h += el.offsetHeight;
            }
            return h;
        }

        setupListeners() {
            // 键盘控制 (全局监听, 但仅在迷宫游戏激活时生效)
            window.addEventListener('keydown', (e) => {
                if (!this.isGameActive()) return;
                const k = e.key.toLowerCase();
                let dir = null;
                if (k === 'arrowup' || k === 'w') dir = { x: 0, y: -1 };
                else if (k === 'arrowdown' || k === 's') dir = { x: 0, y: 1 };
                else if (k === 'arrowleft' || k === 'a') dir = { x: -1, y: 0 };
                else if (k === 'arrowright' || k === 'd') dir = { x: 1, y: 0 };
                else if (k === ' ') { e.preventDefault(); this.togglePause(); return; }
                else if (k === 'r') { this.restartLevel(); return; }
                else if (k >= '1' && k <= '4') {
                    e.preventDefault();
                    this.useItem(this.ITEM_TYPES[parseInt(k, 10) - 1]);
                    return;
                }
                if (dir) {
                    e.preventDefault();
                    this.keys[k] = true;
                    this.heldDir = dir;
                    // 按方向键即转向 (即使撞墙也更新朝向, 用于视野和闪现)
                    this.playerDir = { x: dir.x, y: dir.y };
                    if (this.running && !this.paused) {
                        this.tryMovePlayer(dir);
                        this.lastPlayerMove = performance.now();
                    }
                }
            });
            window.addEventListener('keyup', (e) => {
                const k = e.key.toLowerCase();
                this.keys[k] = false;
                if (this.heldDir) {
                    const hk = this.heldDir;
                    const stillHeld =
                        (hk.x === 0 && hk.y === -1 && (this.keys['arrowup'] || this.keys['w'])) ||
                        (hk.x === 0 && hk.y === 1 && (this.keys['arrowdown'] || this.keys['s'])) ||
                        (hk.x === -1 && hk.y === 0 && (this.keys['arrowleft'] || this.keys['a'])) ||
                        (hk.x === 1 && hk.y === 0 && (this.keys['arrowright'] || this.keys['d']));
                    if (!stillHeld) this.heldDir = null;
                }
            });

            const startBtn = document.getElementById('mazeStart');
            const pauseBtn = document.getElementById('mazePause');
            const restartBtn = document.getElementById('mazeRestart');
            const overlayBtn = document.getElementById('mazeOverlayBtn');
            const pathToggle = document.getElementById('mazePathToggle');
            if (startBtn) startBtn.addEventListener('click', () => this.start());
            if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());
            if (restartBtn) restartBtn.addEventListener('click', () => this.restartLevel());
            if (overlayBtn) overlayBtn.addEventListener('click', () => this.handleOverlay());
            if (pathToggle) {
                pathToggle.checked = this.showPath;
                pathToggle.addEventListener('change', (e) => {
                    this.showPath = e.target.checked;
                    SkyStorage.setInt('skystar:v1:maze:show-path', this.showPath ? 1 : 0);
                });
            }
        }

        // 仅当迷宫游戏容器处于 active 时才响应键盘
        isGameActive() {
            const gc = this.canvas.closest('.game-container');
            return gc && gc.classList.contains('active');
        }

        // Shell 生命周期: tab 切走时取消 RAF, 切回时重启
        pause() {
            if (this.animId) {
                cancelAnimationFrame(this.animId);
                this.animId = null;
                this._shellPauseStart = performance.now();
            }
        }

        resume() {
            if (!this.animId) {
                // 时间公平: 暂停期间不累计计时 (同 togglePause 逻辑)
                if (this._shellPauseStart) {
                    const pauseDur = performance.now() - this._shellPauseStart;
                    if (this.running && !this.paused) {
                        this.levelStartTime += pauseDur;
                        this.graceUntil += pauseDur;
                        if (this.invincibleUntil) this.invincibleUntil += pauseDur;
                        if (this.activeEffects.visionUntil) this.activeEffects.visionUntil += pauseDur;
                        if (this.activeEffects.freezeUntil) this.activeEffects.freezeUntil += pauseDur;
                        if (this.activeEffects.decoyUntil) this.activeEffects.decoyUntil += pauseDur;
                        this.lastPlayerMove += pauseDur;
                        for (const m of this.monsters) m.lastMove += pauseDur;
                    }
                    this._shellPauseStart = 0;
                }
                this.animId = requestAnimationFrame((t) => this.loop(t));
            }
        }

        updateBestDisplay() {
            if (this.bestLevelEl) this.bestLevelEl.textContent = this.bestLevel;
            if (this.bestTimeEl) this.bestTimeEl.textContent = this.bestTime ? this.fmtTime(this.bestTime) : '--';
        }

        fmtTime(ms) {
            return (ms / 1000).toFixed(1) + 's';
        }

        // 生成关卡迷宫 + 放置玩家/怪物; autoStart=true 时进入运行状态
        prepareLevel(autoStart) {
            const cfg = getLevelConfig(this.level);
            this.N = cfg.N;
            this.grid = generateMaze(cfg.N);
            this.player = { x: 1, y: 1 };
            this.exit = { x: cfg.N - 2, y: cfg.N - 2 };
            this.monsters = [];
            this.monsterMoveInterval = cfg.moveInterval;
            this.vision = cfg.vision;
            this.predict = cfg.predict;
            for (let i = 0; i < cfg.monsters; i++) {
                const pos = this.farSpawn(cfg.N, i);
                this.monsters.push({
                    x: pos.x, y: pos.y,
                    lastMove: 0,
                    path: null,
                    patrolTarget: null,
                    dir: { x: 0, y: 1 },     // 朝向, 初始朝下
                    alerted: false            // 是否发现玩家 (加速追击状态)
                });
            }
            // 传送门: 第 4 关起生成 1 对
            this.portals = cfg.portals > 0 ? this.spawnPortals(cfg.N) : [];
            // 钥匙: 按关卡需求生成, 散布在地图不同区域, 出口初始锁定
            this.keysNeeded = cfg.keysNeeded;
            this.keysCollected = 0;
            this.keyPickups = this.spawnKeys(cfg.N, cfg.keysNeeded);
            this.exitLocked = cfg.keysNeeded > 0;
            this.updateKeyDisplay();
            // 每关随机选一个迷宫主题
            this.currentTheme = this.THEMES[Math.floor(Math.random() * this.THEMES.length)];
            // 重置足迹
            this.footprints = [];
            // 重置本关得分和被撞次数
            this.levelScore = 0;
            this.hitsTaken = 0;
            // 每关回满生命 (关卡制: 每关独立挑战)
            this.lives = this.MAX_LIVES;
            this.invincibleUntil = 0;
            this.updateLivesDisplay();
            this.setDangerState(false);
            // 重置道具系统
            this.items = { sprint: 0, vision: 0, freeze: 0, decoy: 0 };
            this.pickups = this.spawnPickups(cfg.N);
            this.activeEffects = {
                visionPath: null, visionUntil: 0,
                freezeUntil: 0, decoyPos: null, decoyUntil: 0,
                sprintTrail: []
            };
            this.updateItemUI();

            this.fitMaze();
            this.levelStartTime = performance.now();
            this.elapsed = 0;
            this.graceUntil = this.levelStartTime + 1500;
            this.heldDir = null;
            this.keys = {};
            if (this.levelEl) this.levelEl.textContent = this.level;
            if (this.timerEl) this.timerEl.textContent = '0.0s';
            if (autoStart) {
                this.running = true;
                this.paused = false;
                this.setStatus('GO!', 'status-go');
            }
        }

        // 在远离玩家和怪物的可达路径上生成 2-3 个道具拾取点
        spawnPickups(N) {
            const count = 2 + Math.floor(Math.random() * 2); // 2-3 个
            const pickups = [];
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] !== 0) continue;
                    // 排除起点和出口
                    if (x === 1 && y === 1) continue;
                    if (x === this.exit.x && y === this.exit.y) continue;
                    // 排除离玩家太近的格子
                    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) < N * 0.2) continue;
                    // 排除离怪物太近的格子
                    let nearMonster = false;
                    for (let i = 0; i < this.monsters.length; i++) {
                        if (Math.abs(x - this.monsters[i].x) + Math.abs(y - this.monsters[i].y) < 4) {
                            nearMonster = true; break;
                        }
                    }
                    if (nearMonster) continue;
                    candidates.push({ x: x, y: y });
                }
            }
            // 随机抽取 count 个位置, 每个随机分配道具类型
            for (let i = 0; i < count && candidates.length > 0; i++) {
                const idx = Math.floor(Math.random() * candidates.length);
                const pos = candidates.splice(idx, 1)[0];
                const type = this.ITEM_TYPES[Math.floor(Math.random() * this.ITEM_TYPES.length)];
                pickups.push({ x: pos.x, y: pos.y, type: type, particles: [], spawnTime: performance.now() });
            }
            return pickups;
        }

        start() {
            this.level = 1;
            this.hideOverlay();
            this.prepareLevel(true);
        }

        restartLevel() {
            this.hideOverlay();
            this.prepareLevel(true);
        }

        // 在远离玩家的可达路径点刷新怪物
        farSpawn(N, idx) {
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] === 0) {
                        const d = Math.abs(x - this.player.x) + Math.abs(y - this.player.y);
                        if (d > N * 0.5) candidates.push({ x: x, y: y, d: d });
                    }
                }
            }
            if (candidates.length === 0) return { x: N - 2, y: N - 2 };
            candidates.sort((a, b) => b.d - a.d);
            const top = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.25)));
            const pick = top[(Math.floor(Math.random() * top.length) + idx) % top.length];
            return { x: pick.x, y: pick.y };
        }

        togglePause() {
            if (!this.running) return;
            this.paused = !this.paused;
            if (this.paused) {
                this.pauseStart = performance.now();
                this.setStatus('PAUSED', 'status-pause');
            } else {
                // 暂停期间不累计时间: 关卡计时、保护期、道具效果到期时间都顺延
                const pauseDur = performance.now() - this.pauseStart;
                this.levelStartTime += pauseDur;
                this.graceUntil += pauseDur;
                if (this.invincibleUntil) this.invincibleUntil += pauseDur;
                if (this.activeEffects.visionUntil) this.activeEffects.visionUntil += pauseDur;
                if (this.activeEffects.freezeUntil) this.activeEffects.freezeUntil += pauseDur;
                if (this.activeEffects.decoyUntil) this.activeEffects.decoyUntil += pauseDur;
                this.setStatus('GO!', 'status-go');
            }
        }

        setStatus(text, cls) {
            if (this.statusEl) {
                this.statusEl.textContent = text;
                this.statusEl.className = 'maze-status ' + cls;
            }
        }

        tryMovePlayer(dir) {
            const nx = this.player.x + dir.x;
            const ny = this.player.y + dir.y;
            if (nx < 0 || nx >= this.N || ny < 0 || ny >= this.N) return;
            if (this.grid[ny][nx] === 1) return; // 撞墙不移动
            // 更新玩家朝向 (移动方向)
            this.playerDir = { x: dir.x, y: dir.y };
            this.player.x = nx;
            this.player.y = ny;
            this.addFootprint(nx, ny);
            // 传送门: 踩到入口传送到配对入口 (一次移动只传送一次, 避免死循环)
            this.checkPortalTransport();
            // 检查是否踩到道具拾取点
            for (let i = 0; i < this.pickups.length; i++) {
                const p = this.pickups[i];
                if (p.x === this.player.x && p.y === this.player.y) {
                    const color = this.ITEM_COLORS[p.type];
                    if (this.items[p.type] < this.ITEM_MAX[p.type]) {
                        this.items[p.type]++;
                        this.updateItemUI();
                        this.spawnFloatText(this.player.x, this.player.y, '+1 ' + this.ITEM_NAMES[p.type], color.core);
                        this.levelScore += 50; // 拾取道具奖励分
                    } else {
                        // 已满额, 提示但不得分
                        this.spawnFloatText(this.player.x, this.player.y, '已满', '#94a3b8');
                    }
                    this.pickups.splice(i, 1);
                    break;
                }
            }
            // 钥匙拾取
            this.checkKeyPickup();
            // 到达出口: 需解锁才能通关
            if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
                if (this.exitLocked) {
                    // 出口锁定, 提示需要钥匙
                    this.spawnFloatText(this.player.x, this.player.y, '需要钥匙', '#f87171');
                } else {
                    this.onLevelClear();
                }
            }
        }

        // 在格子位置 (相对迷宫坐标) 上浮一行文字, 1 秒渐隐
        spawnFloatText(gridX, gridY, text, color) {
            if (!this.floatTextsEl) return;
            const cs = this.CELL_SIZE;
            const canvasRect = this.canvas.getBoundingClientRect();
            const containerRect = this.floatTextsEl.getBoundingClientRect();
            // 格子中心相对 floatTextsEl 的位置
            const px = (gridX * cs + cs / 2 + canvasRect.left) - containerRect.left;
            const py = (gridY * cs + cs / 2 + canvasRect.top) - containerRect.top;
            const el = document.createElement('div');
            el.className = 'maze-float-text';
            el.textContent = text;
            el.style.color = color;
            el.style.left = px + 'px';
            el.style.top = py + 'px';
            this.floatTextsEl.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
        }

        // 险情警示开关: 怪物进入 2 格范围时激活
        setDangerState(active) {
            if (this.dangerActive === active) return;
            this.dangerActive = active;
            if (this.dangerOverlay) {
                if (active) this.dangerOverlay.classList.add('active');
                else this.dangerOverlay.classList.remove('active');
            }
        }

        // 检查险情: 任意怪物与玩家曼哈顿距离 <= 2 时触发
        checkDanger() {
            let danger = false;
            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                if (Math.abs(m.x - this.player.x) + Math.abs(m.y - this.player.y) <= 2) {
                    danger = true;
                    break;
                }
            }
            this.setDangerState(danger);
        }

        // 记录玩家走过的格子 (用于绘制足迹, 3 秒渐隐)
        addFootprint(x, y) {
            // 同一格不重复记录, 只刷新 life
            for (let i = 0; i < this.footprints.length; i++) {
                if (this.footprints[i].x === x && this.footprints[i].y === y) {
                    this.footprints[i].life = 1;
                    return;
                }
            }
            this.footprints.push({ x: x, y: y, life: 1 });
        }

        // 扇形视野检测: 玩家是否在怪物朝向的视野锥内
        // 朝向方向 + vision 格距离 + 120° 扇形角, 且需有视线 (无墙阻挡)
        isInMonsterFOV(m) {
            const dx = this.player.x - m.x;
            const dy = this.player.y - m.y;
            const dist = Math.abs(dx) + Math.abs(dy); // 曼哈顿距离
            if (dist > this.vision) return false;
            if (dist === 0) return true;
            // 计算玩家相对怪物的角度, 与怪物朝向的夹角
            const angleToPlayer = Math.atan2(dy, dx);
            const angleFacing = Math.atan2(m.dir.y, m.dir.x);
            let diff = Math.abs(angleToPlayer - angleFacing);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff > this.FOV_HALF_ANGLE) return false;
            // 视线检查: 怪物到玩家之间不能有墙 (Bresenham 简化版, 逐格检查)
            return this.hasLineOfSight(m.x, m.y, this.player.x, this.player.y);
        }

        // 视线检查: 两点之间是否有墙阻挡 (简单线性插值逐格)
        hasLineOfSight(x0, y0, x1, y1) {
            const dx = x1 - x0;
            const dy = y1 - y0;
            const steps = Math.max(Math.abs(dx), Math.abs(dy));
            if (steps === 0) return true;
            for (let i = 1; i < steps; i++) {
                const x = Math.round(x0 + (dx * i) / steps);
                const y = Math.round(y0 + (dy * i) / steps);
                if (this.grid[y] && this.grid[y][x] === 1) return false;
            }
            return true;
        }

        updateMonsters(now) {
            if (now < this.graceUntil) return; // 保护期内怪物不动
            // 冻结效果: 所有怪物静止
            const frozen = now < this.activeEffects.freezeUntil;
            if (frozen) return;
            // 保护期刚结束时怪物逐渐加速: 前 1 秒移动间隔 ×2 (慢启动), 之后恢复正常
            const graceEnd = this.graceUntil;
            const rampDuration = 1000;
            const baseInterval = (now < graceEnd + rampDuration)
                ? this.monsterMoveInterval * 2
                : this.monsterMoveInterval;
            // 玩家无敌期内怪物改用巡逻 (不追击, 给玩家喘息)
            const playerInvincible = now < this.invincibleUntil;
            const decoyActive = now < this.activeEffects.decoyUntil && this.activeEffects.decoyPos;

            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                // 发现玩家: 进入警戒状态 (加速追击)
                const canSeePlayer = !playerInvincible && this.isInMonsterFOV(m);
                if (canSeePlayer) {
                    m.alerted = true;
                    m.alertedUntil = now + 2500; // 脱离视野后仍追击 2.5 秒
                } else if (m.alerted && now > m.alertedUntil) {
                    m.alerted = false; // 警戒超时, 回到巡逻
                }
                // 警戒状态移动加速 (间隔 ×0.7)
                const currentInterval = m.alerted ? baseInterval * this.chaseSpeedMult : baseInterval;
                if (now - m.lastMove < currentInterval) continue;
                m.lastMove = now;

                // 决定追击目标
                let target;
                if (decoyActive) {
                    target = this.activeEffects.decoyPos;
                    m.patrolTarget = null;
                } else if (playerInvincible) {
                    // 玩家无敌: 怪物巡逻
                    if (!m.patrolTarget || (m.x === m.patrolTarget.x && m.y === m.patrolTarget.y)) {
                        m.patrolTarget = this.randomPatrolTarget();
                    }
                    target = m.patrolTarget;
                } else if (m.alerted) {
                    // 警戒中: 追玩家 (第 5 关起预判走位)
                    target = this.predictPlayerPosition(this.predict);
                    m.patrolTarget = null;
                } else {
                    // 未警戒: 巡逻
                    if (!m.patrolTarget || (m.x === m.patrolTarget.x && m.y === m.patrolTarget.y)) {
                        m.patrolTarget = this.randomPatrolTarget();
                    }
                    target = m.patrolTarget;
                }
                const path = astar(this.grid, m.x, m.y, target.x, target.y);
                m.path = path;
                if (path && path.length > 1) {
                    let next = path[1];
                    // 避免两只怪物叠在一起: 下一步被同伴占据则尝试侧移
                    const occupied = this.monsters.some((o, j) => j !== i && o.x === next.x && o.y === next.y);
                    if (occupied) {
                        const alts = [[0, -1], [1, 0], [0, 1], [-1, 0]];
                        for (let a = 0; a < alts.length; a++) {
                            const ax = m.x + alts[a][0], ay = m.y + alts[a][1];
                            if (ax < 0 || ax >= this.N || ay < 0 || ay >= this.N) continue;
                            if (this.grid[ay][ax] === 1) continue;
                            if (this.monsters.some((o, j) => j !== i && o.x === ax && o.y === ay)) continue;
                            next = { x: ax, y: ay };
                            break;
                        }
                    }
                    // 更新朝向: 仅在移动方向改变时转向 (巡逻直行保持朝向不变)
                    const moveDx = next.x - m.x;
                    const moveDy = next.y - m.y;
                    if (moveDx !== m.dir.x || moveDy !== m.dir.y) {
                        m.dir = { x: moveDx, y: moveDy };
                    }
                    m.x = next.x;
                    m.y = next.y;
                }
                // 碰撞玩家: 扣 1 生命, 触发无敌; 生命归零才 game over
                if (m.x === this.player.x && m.y === this.player.y) {
                    this.onPlayerHit(m);
                    return;
                }
            }
        }

        randomPatrolTarget() {
            const N = this.N;
            for (let tries = 0; tries < 20; tries++) {
                const x = 1 + Math.floor(Math.random() * (N - 2));
                const y = 1 + Math.floor(Math.random() * (N - 2));
                if (this.grid[y][x] === 0) return { x: x, y: y };
            }
            return { x: this.exit.x, y: this.exit.y };
        }

        // 预判玩家未来 N 步位置: 按最近一次成功移动方向推演, 撞墙则停在墙前
        // 用 playerDir 而非 heldDir: 玩家松开键后仍有"惯性方向", AI 不会因为玩家停步就失效
        // predict=0 时返回当前位置 (即不预判)
        predictPlayerPosition(steps) {
            if (steps <= 0) return { x: this.player.x, y: this.player.y };
            const dir = this.playerDir;
            if (!dir || (dir.x === 0 && dir.y === 0)) return { x: this.player.x, y: this.player.y };
            let px = this.player.x, py = this.player.y;
            for (let s = 0; s < steps; s++) {
                const nx = px + dir.x;
                const ny = py + dir.y;
                if (nx < 0 || nx >= this.N || ny < 0 || ny >= this.N) break;
                if (this.grid[ny][nx] === 1) break; // 撞墙停止预判
                px = nx; py = ny;
            }
            return { x: px, y: py };
        }

        // 生成 1 对传送门: 两个入口分处迷宫不同区域, 踩入一个从另一个出来
        spawnPortals(N) {
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] !== 0) continue;
                    if (x === 1 && y === 1) continue;                       // 排除起点
                    if (x === this.exit.x && y === this.exit.y) continue;   // 排除出口
                    // 排除离玩家太近
                    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) < 3) continue;
                    candidates.push({ x: x, y: y });
                }
            }
            if (candidates.length < 2) return [];
            // 随机选两个距离较远的点作为传送门对
            const a = candidates[Math.floor(Math.random() * candidates.length)];
            let bestB = null, bestDist = 0;
            for (let i = 0; i < candidates.length; i++) {
                const c = candidates[i];
                if (c.x === a.x && c.y === a.y) continue;
                const d = Math.abs(c.x - a.x) + Math.abs(c.y - a.y);
                if (d > bestDist) { bestDist = d; bestB = c; }
            }
            if (!bestB) return [];
            return [{ a: a, b: bestB }];
        }

        // 玩家踩到传送门时传送到配对入口
        checkPortalTransport() {
            for (let i = 0; i < this.portals.length; i++) {
                const p = this.portals[i];
                if (this.player.x === p.a.x && this.player.y === p.a.y) {
                    this.player.x = p.b.x; this.player.y = p.b.y;
                    this.addFootprint(this.player.x, this.player.y);
                    return true;
                } else if (this.player.x === p.b.x && this.player.y === p.b.y) {
                    this.player.x = p.a.x; this.player.y = p.a.y;
                    this.addFootprint(this.player.x, this.player.y);
                    return true;
                }
            }
            return false;
        }

        // 生成钥匙: 散布在迷宫不同区域 (彼此距离尽量远, 远离起点和出口)
        spawnKeys(N, count) {
            const keys = [];
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] !== 0) continue;
                    if (x === 1 && y === 1) continue;                       // 排除起点
                    if (x === this.exit.x && y === this.exit.y) continue;   // 排除出口
                    // 排除离玩家太近
                    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) < N * 0.15) continue;
                    candidates.push({ x: x, y: y });
                }
            }
            if (candidates.length < count) count = candidates.length;
            // 每次选离已选钥匙最远的候选点, 保证钥匙分散
            for (let i = 0; i < count; i++) {
                if (candidates.length === 0) break;
                let pickIdx = 0;
                if (keys.length > 0) {
                    let bestMinDist = -1;
                    for (let j = 0; j < candidates.length; j++) {
                        let minDist = Infinity;
                        for (let k = 0; k < keys.length; k++) {
                            const d = Math.abs(candidates[j].x - keys[k].x) + Math.abs(candidates[j].y - keys[k].y);
                            if (d < minDist) minDist = d;
                        }
                        if (minDist > bestMinDist) { bestMinDist = minDist; pickIdx = j; }
                    }
                } else {
                    pickIdx = Math.floor(Math.random() * candidates.length);
                }
                keys.push({ x: candidates[pickIdx].x, y: candidates[pickIdx].y });
                candidates.splice(pickIdx, 1);
            }
            return keys;
        }

        // 玩家踩到钥匙时拾取
        checkKeyPickup() {
            for (let i = this.keyPickups.length - 1; i >= 0; i--) {
                const k = this.keyPickups[i];
                if (k.x === this.player.x && k.y === this.player.y) {
                    this.keyPickups.splice(i, 1);
                    this.keysCollected++;
                    this.spawnFloatText(this.player.x, this.player.y, '钥匙 +1', '#fbbf24');
                    this.levelScore += 80; // 钥匙比普通道具分高
                    this.updateKeyDisplay();
                    // 集齐钥匙: 解锁出口
                    if (this.keysCollected >= this.keysNeeded && this.exitLocked) {
                        this.exitLocked = false;
                        this.spawnFloatText(this.exit.x, this.exit.y, '出口已解锁!', '#4ade80');
                    }
                    break;
                }
            }
        }

        updateKeyDisplay() {
            // 复用 statusEl 旁边显示, 通过 title 属性或直接在状态栏体现
            // 这里用 status 元素在 READY/GO 状态下附加钥匙信息
            if (!this.statusEl) return;
            if (this.exitLocked) {
                // 还在锁着, 状态文字带上钥匙进度
                if (this.running && !this.paused) {
                    this.statusEl.textContent = '钥匙 ' + this.keysCollected + '/' + this.keysNeeded;
                    this.statusEl.className = 'maze-status status-pause'; // 黄色提示
                }
            } else {
                if (this.running && !this.paused) {
                    this.statusEl.textContent = 'GO!';
                    this.statusEl.className = 'maze-status status-go';
                }
            }
        }

        // 玩家被怪物撞到: 扣 1 生命, 触发 1.5s 无敌, 击退怪物
        onPlayerHit(monster) {
            // 无敌期内不再受伤
            if (performance.now() < this.invincibleUntil) return;
            this.lives--;
            this.hitsTaken++;
            this.updateLivesDisplay();
            this.spawnFloatText(this.player.x, this.player.y, '-1 ❤', '#ef4444');
            if (this.lives <= 0) {
                this.onGameOver();
                return;
            }
            // 1.5 秒无敌期
            this.invincibleUntil = performance.now() + 1500;
            // 击退怪物到相邻可达格子 (远离玩家方向), 避免连续撞击
            const dx = monster.x - this.player.x;
            const dy = monster.y - this.player.y;
            const kickDirs = [];
            if (dx !== 0) kickDirs.push({ x: Math.sign(dx), y: 0 });
            if (dy !== 0) kickDirs.push({ x: 0, y: Math.sign(dy) });
            kickDirs.push({ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 });
            for (let k = 0; k < kickDirs.length; k++) {
                const kx = monster.x + kickDirs[k].x;
                const ky = monster.y + kickDirs[k].y;
                if (kx < 0 || kx >= this.N || ky < 0 || ky >= this.N) continue;
                if (this.grid[ky][kx] === 1) continue;
                if (kx === this.player.x && ky === this.player.y) continue;
                monster.x = kx;
                monster.y = ky;
                break;
            }
            // 重置怪物移动计时, 给玩家喘息空间
            monster.lastMove = performance.now();
            monster.path = null;
        }

        updateLivesDisplay() {
            if (!this.livesEl) return;
            let txt = '';
            for (let i = 0; i < this.MAX_LIVES; i++) {
                txt += i < this.lives ? '❤' : '🖤';
            }
            this.livesEl.textContent = txt;
            // 仅剩 1 命时红色脉冲警示
            if (this.lives <= 1) this.livesEl.classList.add('low');
            else this.livesEl.classList.remove('low');
        }

        onLevelClear() {
            this.running = false;
            this.setDangerState(false);
            const time = performance.now() - this.levelStartTime;
            if (this.bestTime === 0 || time < this.bestTime) {
                this.bestTime = Math.floor(time);
                SkyStorage.setInt('skystar:v1:maze:best-time', this.bestTime);
            }
            if (this.level > this.bestLevel) {
                this.bestLevel = this.level;
                SkyStorage.setInt('skystar:v1:maze:best-level', this.level);
            }
            this.updateBestDisplay();
            this.setStatus('CLEAR!', 'status-clear');

            // 得分计算: 基础分 + 速度奖励 + 道具奖励 + 无伤奖励
            const baseScore = 100 * this.level;
            const speedBonus = Math.max(0, 500 - Math.floor(time / 100)); // 越快越高, 上限 500
            const itemBonus = this.levelScore; // 拾取道具累计的分 (每个 50)
            const noHitBonus = (this.hitsTaken === 0) ? 200 : 0;
            const earned = baseScore + speedBonus + itemBonus + noHitBonus;
            this.totalScore += earned;
            SkyStorage.setInt('skystar:v1:maze:totalScore', this.totalScore);
            this.flashScore();

            // 成就判定
            this.checkAchievements({ time: time, noHit: this.hitsTaken === 0, level: this.level });

            const detail = '用时 ' + this.fmtTime(time) + ' · 得分 +' + earned +
                (noHitBonus > 0 ? ' · 无伤!' : '');
            this.showOverlay('level-clear', '第 ' + this.level + ' 关通关！', detail, '下一关');
        }

        onGameOver() {
            this.running = false;
            this.setDangerState(false);
            this.setStatus('CAUGHT!', 'status-caught');
            this.showOverlay('game-over', '生命耗尽！', '你到达了第 ' + this.level + ' 关', '重新开始');
        }

        // 分数变化时高亮动画
        flashScore() {
            if (this.scoreEl) {
                this.scoreEl.textContent = this.totalScore;
                this.scoreEl.classList.remove('score-flash');
                // 触发 reflow 让动画重新播放
                void this.scoreEl.offsetWidth;
                this.scoreEl.classList.add('score-flash');
            }
        }

        // 成就判定: 首通/速通(单关<10s)/无伤通关/达到第5关/总分1000
        checkAchievements(ctx) {
            const list = [
                { key: 'firstClear', cond: () => true, name: '初次通关', desc: '完成第 1 关' },
                { key: 'speedRun', cond: () => ctx.time < 10000, name: '速通大师', desc: '单关用时 < 10 秒' },
                { key: 'noHit', cond: () => ctx.noHit, name: '无伤通关', desc: '单关未被怪物碰到' },
                { key: 'reach5', cond: () => ctx.level >= 5, name: '迷宫行者', desc: '到达第 5 关' },
                { key: 'score1k', cond: () => this.totalScore >= 1000, name: '千分玩家', desc: '总分达到 1000' }
            ];
            let unlocked = [];
            for (let i = 0; i < list.length; i++) {
                const a = list[i];
                if (!this.achievements[a.key] && a.cond()) {
                    this.achievements[a.key] = { name: a.name, desc: a.desc, time: Date.now() };
                    unlocked.push(a);
                }
            }
            if (unlocked.length > 0) {
                SkyStorage.setJSON('skystar:v1:maze:achievements', this.achievements);
                // 在画面中央显示成就解锁浮字
                if (this.floatTextsEl && this.canvas) {
                    const cx = this.canvas.offsetLeft + this.canvas.width / 2;
                    const cy = this.canvas.offsetTop + 40;
                    for (let i = 0; i < unlocked.length; i++) {
                        setTimeout(((a) => () => {
                            this.spawnFloatTextAt(cx, cy + i * 24, '成就解锁: ' + a.name, '#facc15');
                        })(unlocked[i]), i * 600);
                    }
                }
            }
        }

        // 在像素坐标 (相对容器) 上浮文字
        spawnFloatTextAt(px, py, text, color) {
            if (!this.floatTextsEl) return;
            const el = document.createElement('div');
            el.className = 'maze-float-text';
            el.textContent = text;
            el.style.color = color;
            el.style.left = px + 'px';
            el.style.top = py + 'px';
            this.floatTextsEl.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
        }

        // 小地图: 缩略绘制全图 (墙/出口/玩家/怪物), 放在 HUD 栏内不挡游戏 canvas
        drawMinimap() {
            const ctx = this.minimapCtx;
            if (!ctx || !this.grid) return;
            const mw = this.minimapCanvas.width;
            const mh = this.minimapCanvas.height;
            const N = this.N;
            const s = Math.min(mw, mh) / N; // 每格像素
            // 清空
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(0, 0, mw, mh);
            // 墙
            ctx.fillStyle = this.currentTheme.wallEdge;
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    if (this.grid[y][x] === 1) {
                        ctx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
                    }
                }
            }
            // 出口 (锁定=灰色, 解锁=金色)
            ctx.fillStyle = this.exitLocked ? '#64748b' : '#facc15';
            ctx.fillRect(this.exit.x * s, this.exit.y * s, Math.max(2, s), Math.max(2, s));
            // 钥匙 (亮黄色, 略大)
            ctx.fillStyle = '#fbbf24';
            for (let i = 0; i < this.keyPickups.length; i++) {
                const k = this.keyPickups[i];
                ctx.fillRect(k.x * s - 0.5, k.y * s - 0.5, Math.max(3, s + 1), Math.max(3, s + 1));
            }
            // 传送门 (紫色)
            ctx.fillStyle = '#a855f7';
            for (let i = 0; i < this.portals.length; i++) {
                const p = this.portals[i];
                ctx.fillRect(p.a.x * s, p.a.y * s, Math.max(2, s), Math.max(2, s));
                ctx.fillRect(p.b.x * s, p.b.y * s, Math.max(2, s), Math.max(2, s));
            }
            // 怪物 (红色)
            ctx.fillStyle = '#ef4444';
            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                ctx.fillRect(m.x * s, m.y * s, Math.max(2, s), Math.max(2, s));
            }
            // 玩家 (绿色, 略大一点突出)
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(this.player.x * s - 0.5, this.player.y * s - 0.5, Math.max(3, s + 1), Math.max(3, s + 1));
        }

        showOverlay(type, title, msg, btnText) {
            this.overlay.dataset.type = type;
            if (this.overlayTitle) this.overlayTitle.textContent = title;
            if (this.overlayMsg) this.overlayMsg.textContent = msg;
            const btn = document.getElementById('mazeOverlayBtn');
            if (btn) btn.textContent = btnText;
            this.overlay.classList.add('visible');
        }

        hideOverlay() {
            this.overlay.classList.remove('visible');
        }

        handleOverlay() {
            const type = this.overlay.dataset.type;
            this.hideOverlay();
            if (type === 'level-clear') {
                this.level++;
                this.prepareLevel(true);
            } else {
                this.start();
            }
        }

        // ---------- 主循环 ----------
        loop(now) {
            this.pulse = (this.pulse + 0.05) % (Math.PI * 2);

            if (this.running && !this.paused) {
                this.elapsed = now - this.levelStartTime;
                if (this.timerEl) this.timerEl.textContent = this.fmtTime(this.elapsed);
                // 玩家持续移动 (按住方向键)
                if (this.heldDir && now - this.lastPlayerMove > this.playerMoveInterval) {
                    this.tryMovePlayer(this.heldDir);
                    this.lastPlayerMove = now;
                }
                this.updateMonsters(now);
                // 险情警示检查 (怪物贴近玩家时画面边缘红色脉冲)
                this.checkDanger();
                // 钥匙进度状态刷新 (拾取后状态文字变化)
                this.updateKeyDisplay();
                // 闪现残影衰减
                if (this.activeEffects.sprintTrail.length > 0) {
                    this.activeEffects.sprintTrail = this.activeEffects.sprintTrail
                        .map(t => ({ x: t.x, y: t.y, life: t.life - 0.05 }))
                        .filter(t => t.life > 0);
                }
                // 足迹衰减 (约 3 秒消失, 按 60fps 每帧 -0.0055)
                if (this.footprints.length > 0) {
                    for (let i = this.footprints.length - 1; i >= 0; i--) {
                        this.footprints[i].life -= 0.0055;
                        if (this.footprints[i].life <= 0) this.footprints.splice(i, 1);
                    }
                }
                // 视野效果到期清除
                if (this.activeEffects.visionPath && now > this.activeEffects.visionUntil) {
                    this.activeEffects.visionPath = null;
                }
                // 诱饵效果到期清除
                if (this.activeEffects.decoyPos && now > this.activeEffects.decoyUntil) {
                    this.activeEffects.decoyPos = null;
                }
            }
            this.draw();
            this.drawMinimap();
            this.animId = requestAnimationFrame((t) => this.loop(t));
        }

        // ---------- 绘制 ----------
        draw() {
            const ctx = this.ctx;
            const cs = this.CELL_SIZE;
            const N = this.N;
            if (!this.grid || cs <= 0) return;
            const theme = this.currentTheme;

            // 背景 (地面色铺底)
            ctx.fillStyle = theme.floor;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // 地面点阵纹理 (每格中心一个小点, 提供空间参照)
            ctx.fillStyle = theme.dot;
            const dotR = Math.max(0.8, cs * 0.05);
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    if (this.grid[y][x] === 0) {
                        ctx.beginPath();
                        ctx.arc(x * cs + cs / 2, y * cs + cs / 2, dotR, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // 玩家足迹 (走过的格子, 3 秒渐隐)
            for (let i = 0; i < this.footprints.length; i++) {
                const f = this.footprints[i];
                const alpha = f.life * 0.4;
                ctx.fillStyle = theme.footprint.replace(/[\d.]+\)$/, alpha.toFixed(3) + ')');
                ctx.fillRect(f.x * cs + cs * 0.2, f.y * cs + cs * 0.2, cs * 0.6, cs * 0.6);
            }

            // 墙 (带立体感: 主体 + 顶高光 + 底阴影)
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    if (this.grid[y][x] === 1) {
                        const px = x * cs, py = y * cs;
                        // 主体
                        ctx.fillStyle = theme.wall;
                        ctx.fillRect(px, py, cs, cs);
                        // 描边
                        ctx.strokeStyle = theme.wallEdge;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
                        // 顶高光 (上方 1px 浅色, 模拟顶面受光)
                        ctx.fillStyle = theme.wallTop;
                        ctx.fillRect(px, py, cs, Math.max(1, cs * 0.12));
                        // 底阴影 (下方 1px 深色, 模拟投影)
                        ctx.fillStyle = theme.wallShadow;
                        ctx.fillRect(px, py + cs - Math.max(1, cs * 0.12), cs, Math.max(1, cs * 0.12));
                    }
                }
            }

            // 出口 (旋转光环)
            this.drawExit(ctx, cs);

            // 道具拾取点 (金色脉冲方块)
            this.drawPickups(ctx, cs);

            // 传送门 (成对漩涡, 紫色)
            this.drawPortals(ctx, cs);

            // 钥匙 (金色发光, 浮动)
            this.drawKeys(ctx, cs);

            // 怪物视野锥: 13 条射线沿 FOV 角等分采样, 多边形画"实际可视范围" (沿墙截断)
            // 之前的 arc 扇形忽略墙体, 玩家容易误判"锥在我身上=它看见我"; 现在跟 hasLineOfSight 一致
            const FOV_RAY_COUNT = 13;
            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                const cx = m.x * cs + cs / 2;
                const cy = m.y * cs + cs / 2;
                const facing = Math.atan2(m.dir.y, m.dir.x);
                const alpha = m.alerted ? 0.18 : 0.08;
                const color = '239, 68, 68';
                // 13 射线等角采样, t=0 左边界, t=1 右边界
                const points = [{ x: cx, y: cy }];
                for (let r = 0; r < FOV_RAY_COUNT; r++) {
                    const t = FOV_RAY_COUNT === 1 ? 0.5 : r / (FOV_RAY_COUNT - 1);
                    const ang = facing - this.FOV_HALF_ANGLE + t * 2 * this.FOV_HALF_ANGLE;
                    const dx = Math.cos(ang);
                    const dy = Math.sin(ang);
                    // 沿射线逐步走, 找撞墙距离 (跟 hasLineOfSight 同款网格量化)
                    let hitDist = this.vision;
                    for (let s = 1; s <= this.vision; s++) {
                        const gx = m.x + Math.round(dx * s);
                        const gy = m.y + Math.round(dy * s);
                        if (gx < 0 || gx >= this.N || gy < 0 || gy >= this.N) { hitDist = s; break; }
                        if (this.grid[gy][gx] === 1) { hitDist = s; break; }
                    }
                    points.push({ x: cx + dx * hitDist * cs, y: cy + dy * hitDist * cs });
                }
                // 画多边形
                ctx.fillStyle = 'rgba(' + color + ', ' + alpha + ')';
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
                ctx.closePath();
                ctx.fill();
                // 警戒时加描边突出
                if (m.alerted) {
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            // A* 寻路路径可视化 (虚线 + 终点圆点, 跟 vision 道具画风统一)
            if (this.showPath) {
                ctx.lineWidth = Math.max(2, cs * 0.18);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                for (let i = 0; i < this.monsters.length; i++) {
                    const path = this.monsters[i].path;
                    if (!path || path.length <= 1) continue;
                    // 路径线
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
                    ctx.setLineDash([cs * 0.4, cs * 0.25]);
                    ctx.beginPath();
                    ctx.moveTo(path[0].x * cs + cs / 2, path[0].y * cs + cs / 2);
                    for (let p = 1; p < path.length; p++) {
                        ctx.lineTo(path[p].x * cs + cs / 2, path[p].y * cs + cs / 2);
                    }
                    ctx.stroke();
                    // 终点圆点 (怪物想去的地方: 玩家位置 / 巡逻点 / 诱饵)
                    const end = path[path.length - 1];
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
                    ctx.beginPath();
                    ctx.arc(end.x * cs + cs / 2, end.y * cs + cs / 2, Math.max(2, cs * 0.22), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.setLineDash([]);
            }

            // 视野道具: 高亮到出口的路径 (淡黄色虚线)
            if (this.activeEffects.visionPath) {
                const path = this.activeEffects.visionPath;
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
                ctx.lineWidth = Math.max(2, cs * 0.15);
                ctx.setLineDash([cs * 0.3, cs * 0.2]);
                ctx.beginPath();
                ctx.moveTo(path[0].x * cs + cs / 2, path[0].y * cs + cs / 2);
                for (let p = 1; p < path.length; p++) {
                    ctx.lineTo(path[p].x * cs + cs / 2, path[p].y * cs + cs / 2);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 闪现残影 (渐隐玩家轮廓)
            for (let i = 0; i < this.activeEffects.sprintTrail.length; i++) {
                const t = this.activeEffects.sprintTrail[i];
                ctx.fillStyle = 'rgba(34, 197, 94, ' + (t.life * 0.4) + ')';
                ctx.beginPath();
                ctx.arc(t.x * cs + cs / 2, t.y * cs + cs / 2, Math.max(2, cs * 0.3), 0, Math.PI * 2);
                ctx.fill();
            }

            // 诱饵幻影 (半透明玩家轮廓)
            if (this.activeEffects.decoyPos) {
                const dx = this.activeEffects.decoyPos.x * cs + cs / 2;
                const dy = this.activeEffects.decoyPos.y * cs + cs / 2;
                const r = Math.max(2, cs * 0.35);
                ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
                ctx.beginPath();
                ctx.arc(dx, dy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(187, 247, 208, 0.6)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 玩家
            this.drawPlayer(ctx, cs);
            // 怪物 (含冻结状态视觉)
            for (let i = 0; i < this.monsters.length; i++) this.drawMonster(ctx, cs, this.monsters[i]);

            // 保护期闪烁提示
            const now = performance.now();
            if (this.running && now < this.graceUntil) {
                const alpha = 0.12 + 0.12 * Math.sin(now / 80);
                ctx.fillStyle = 'rgba(34, 197, 94, ' + alpha + ')';
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }

        drawExit(ctx, cs) {
            const x = this.exit.x * cs + cs / 2;
            const y = this.exit.y * cs + cs / 2;
            const r = Math.max(2, cs * 0.4);
            if (this.exitLocked) {
                // 锁定状态: 灰色 + 锁图标, 提示需要钥匙
                ctx.fillStyle = 'rgba(100, 116, 139, 0.25)';
                ctx.beginPath();
                ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
                ctx.fill();
                // 锁体 (灰色方块)
                ctx.fillStyle = '#64748b';
                ctx.fillRect(x - r * 0.5, y - r * 0.2, r, r * 0.8);
                // 锁环 (上方半圆)
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                ctx.beginPath();
                ctx.arc(x, y - r * 0.2, r * 0.35, Math.PI, 0);
                ctx.stroke();
                // 钥匙数量提示 (小字)
                ctx.fillStyle = '#fbbf24';
                ctx.font = 'bold ' + Math.max(8, Math.floor(cs * 0.4)) + 'px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(this.keysCollected + '/' + this.keysNeeded, x, y + r * 1.4);
                ctx.textAlign = 'left';
                return;
            }
            // 解锁状态: 原金色光晕 + 旋转十字环
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            grad.addColorStop(0, 'rgba(250, 204, 21, 0.9)');
            grad.addColorStop(0.5, 'rgba(250, 204, 21, 0.3)');
            grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            // 旋转十字环
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(this.pulse);
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.stroke();
            ctx.restore();
        }

        drawPlayer(ctx, cs) {
            const x = this.player.x * cs + cs / 2;
            const y = this.player.y * cs + cs / 2;
            const r = Math.max(2, cs * 0.35);
            // 无敌期间: 玩家闪烁 (半透明 + 呼吸)
            const now = performance.now();
            const invincible = now < this.invincibleUntil;
            let alpha = 1;
            if (invincible) {
                alpha = 0.35 + 0.35 * Math.abs(Math.sin(now / 90));
            }
            ctx.save();
            ctx.globalAlpha = alpha;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            grad.addColorStop(0, 'rgba(34, 197, 94, 0.6)');
            grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#bbf7d0';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 朝向指示: 在朝向方向画一个小三角箭头
            const facing = Math.atan2(this.playerDir.y, this.playerDir.x);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(facing);
            ctx.fillStyle = '#bbf7d0';
            ctx.beginPath();
            ctx.moveTo(r * 0.95, 0);
            ctx.lineTo(r * 0.55, -r * 0.3);
            ctx.lineTo(r * 0.55, r * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.restore();
        }

        drawMonster(ctx, cs, m) {
            const x = m.x * cs + cs / 2;
            const y = m.y * cs + cs / 2;
            const now = performance.now();
            const inGrace = this.running && now < this.graceUntil;
            const frozen = now < this.activeEffects.freezeUntil;
            const pulse = 0.85 + 0.15 * Math.sin(this.pulse * 3);
            const r = Math.max(2, cs * 0.35 * pulse);
            // 警戒状态: 主色变橙红 + 更强辉光; 巡逻: 暗红; 冻结: 冰蓝
            const mainColor = frozen ? '#7dd3fc' : (m.alerted ? '#f97316' : '#ef4444');
            const glowColor = frozen ? 'rgba(125, 211, 252, 0.7)' : (m.alerted ? 'rgba(249, 115, 22, 0.85)' : 'rgba(239, 68, 68, 0.7)');
            const glowFade = frozen ? 'rgba(125, 211, 252, 0)' : (m.alerted ? 'rgba(249, 115, 22, 0)' : 'rgba(239, 68, 68, 0)');
            // 保护期内: 怪物加白色脉冲外环高亮, 提示玩家位置以便提前规划
            if (inGrace) {
                const gracePulse = 0.5 + 0.5 * Math.sin(now / 120);
                ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.4 + 0.4 * gracePulse) + ')';
                ctx.lineWidth = Math.max(1.5, cs * 0.1);
                ctx.beginPath();
                ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
                ctx.stroke();
            }
            // 警戒状态: 加急促脉冲外环 (警示玩家被发现)
            if (m.alerted && !frozen) {
                const alertPulse = 0.5 + 0.5 * Math.sin(now / 80);
                ctx.strokeStyle = 'rgba(249, 115, 22, ' + (0.4 + 0.4 * alertPulse) + ')';
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                ctx.beginPath();
                ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
                ctx.stroke();
            }
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            grad.addColorStop(0, glowColor);
            grad.addColorStop(1, glowFade);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = mainColor;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = frozen ? '#e0f2fe' : '#fecaca';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 冻结时画冰晶十字, 否则画眼睛朝向 m.dir (怪物朝向)
            if (frozen) {
                ctx.strokeStyle = '#e0f2fe';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y);
                ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5);
                ctx.stroke();
            } else {
                // 眼睛朝向怪物朝向方向 (m.dir), 玩家可据此判断怪物面朝哪边
                const len = Math.hypot(m.dir.x, m.dir.y) || 1;
                const ex = (m.dir.x / len) * r * 0.3;
                const ey = (m.dir.y / len) * r * 0.3;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(x + ex, y + ey, Math.max(1, r * 0.22), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 绘制地图上的道具拾取点 (旋转六边形符文环 + 浮动图标 + 上升光粒子)
        // 每种道具独立主题色, 玩家拾取前就能辨识类型
        drawPickups(ctx, cs) {
            const now = performance.now();
            for (let i = 0; i < this.pickups.length; i++) {
                const p = this.pickups[i];
                const color = this.ITEM_COLORS[p.type];
                const cx = p.x * cs + cs / 2;
                const cy = p.y * cs + cs / 2;
                const baseR = Math.max(2, cs * 0.34);
                const t = now * 0.001 + i * 0.7; // 每个道具错开相位, 避免整齐划一

                // 1. 外层光晕 (主题色径向渐变)
                const glowR = baseR * 2.2;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
                grad.addColorStop(0, color.glow);
                grad.addColorStop(1, color.fade);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
                ctx.fill();

                // 2. 六边形符文环 (细线条, 缓慢旋转)
                const ringR = baseR * 1.05;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(t * 0.6);
                ctx.strokeStyle = color.core;
                ctx.lineWidth = Math.max(1, cs * 0.05);
                ctx.beginPath();
                for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * Math.PI * 2;
                    const px = Math.cos(a) * ringR;
                    const py = Math.sin(a) * ringR;
                    if (k === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
                // 六个顶点小亮点
                ctx.fillStyle = color.core;
                for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * ringR, Math.sin(a) * ringR, Math.max(1, cs * 0.05), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                // 3. 中心图标 (上下浮动, 呼吸缩放)
                const floatY = Math.sin(t * 2.2) * baseR * 0.18;
                const iconScale = 0.9 + 0.1 * Math.sin(t * 2.2);
                ctx.save();
                ctx.translate(cx, cy + floatY);
                ctx.scale(iconScale, iconScale);
                ctx.strokeStyle = '#fff';
                ctx.fillStyle = '#fff';
                ctx.lineWidth = Math.max(1.2, cs * 0.07);
                this.drawItemIcon(ctx, p.type, 0, 0, baseR * 0.5);
                ctx.restore();

                // 4. 上升光粒子 (持久状态, 每帧更新位置和透明度)
                this.updatePickupParticles(p, cx, cy, baseR, color, now, cs);
                for (let pi = 0; pi < p.particles.length; pi++) {
                    const pt = p.particles[pi];
                    ctx.fillStyle = 'rgba(' + color.rgbStr + ',' + (pt.life * 0.7) + ')';
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 维护单个道具拾取点的粒子状态: 持续生成 + 上升 + 渐隐
        updatePickupParticles(p, cx, cy, baseR, color, now, cs) {
            // 生成新粒子 (每帧约 20% 概率, 控制密度)
            if (Math.random() < 0.2 && p.particles.length < 6) {
                p.particles.push({
                    x: cx + (Math.random() - 0.5) * baseR * 0.8,
                    y: cy + baseR * 0.3,
                    vy: -(0.15 + Math.random() * 0.25) * cs * 0.1, // 上升速度, 按格子大小缩放
                    r: Math.max(0.8, cs * 0.04 + Math.random() * cs * 0.03),
                    life: 1
                });
            }
            // 更新现有粒子
            for (let i = p.particles.length - 1; i >= 0; i--) {
                const pt = p.particles[i];
                pt.y += pt.vy;
                pt.life -= 0.025;
                if (pt.life <= 0) {
                    p.particles.splice(i, 1);
                }
            }
        }

        // 在道具拾取点上画类型图标 (简笔, 已 translate 到中心)
        drawItemIcon(ctx, type, x, y, s) {
            ctx.beginPath();
            if (type === 'sprint') {
                // 闪电
                ctx.moveTo(x - s * 0.3, y - s);
                ctx.lineTo(x + s * 0.4, y - s * 0.2);
                ctx.lineTo(x, y - s * 0.2);
                ctx.lineTo(x + s * 0.3, y + s);
                ctx.lineTo(x - s * 0.4, y + s * 0.2);
                ctx.lineTo(x, y + s * 0.2);
                ctx.closePath();
                ctx.fill();
            } else if (type === 'vision') {
                // 眼睛 (椭圆 + 瞳孔)
                ctx.ellipse(x, y, s, s * 0.6, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === 'freeze') {
                // 雪花 (六射线)
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
                }
                ctx.stroke();
            } else if (type === 'decoy') {
                // 同心圆
                ctx.arc(x, y, s, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 绘制传送门 (成对紫色漩涡, 两个入口同步旋转)
        drawPortals(ctx, cs) {
            if (this.portals.length === 0) return;
            const now = performance.now();
            for (let i = 0; i < this.portals.length; i++) {
                const p = this.portals[i];
                this.drawSinglePortal(ctx, cs, p.a, now, i * 0.5);
                this.drawSinglePortal(ctx, cs, p.b, now, i * 0.5 + 0.3);
            }
        }

        // 绘制单个传送门入口: 外层光晕 + 旋转双环 + 中心亮点
        drawSinglePortal(ctx, cs, pos, now, phaseOffset) {
            const cx = pos.x * cs + cs / 2;
            const cy = pos.y * cs + cs / 2;
            const baseR = Math.max(2, cs * 0.36);
            const t = now * 0.001 + phaseOffset;
            // 外层光晕
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.8);
            grad.addColorStop(0, 'rgba(168, 85, 247, 0.5)');
            grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, baseR * 1.8, 0, Math.PI * 2);
            ctx.fill();
            // 外环 (顺时针旋转)
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(t * 1.5);
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
            ctx.lineWidth = Math.max(1, cs * 0.06);
            ctx.beginPath();
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * Math.PI * 2;
                const r = baseR * (0.9 + 0.1 * Math.sin(t * 3 + k));
                if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            // 内环 (逆时针旋转)
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(-t * 2);
            ctx.strokeStyle = 'rgba(216, 180, 254, 0.9)';
            ctx.lineWidth = Math.max(1, cs * 0.05);
            ctx.beginPath();
            ctx.arc(0, 0, baseR * 0.55, 0, Math.PI * 1.5);
            ctx.stroke();
            ctx.restore();
            // 中心亮点
            ctx.fillStyle = '#e9d5ff';
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(1, cs * 0.08), 0, Math.PI * 2);
            ctx.fill();
        }

        // 绘制钥匙: 金色发光圆环 + 钥匙图标 + 上下浮动
        drawKeys(ctx, cs) {
            if (this.keyPickups.length === 0) return;
            const now = performance.now();
            for (let i = 0; i < this.keyPickups.length; i++) {
                const k = this.keyPickups[i];
                const bobY = Math.sin(now / 400 + i * 1.7) * cs * 0.08; // 上下浮动
                const cx = k.x * cs + cs / 2;
                const cy = k.y * cs + cs / 2 + bobY;
                const r = Math.max(2, cs * 0.32);
                // 外光晕 (金色脉冲)
                const pulse = 0.7 + 0.3 * Math.sin(now / 250 + i);
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
                grad.addColorStop(0, 'rgba(251, 191, 36, ' + (0.6 * pulse) + ')');
                grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
                ctx.fill();
                // 钥匙图标: 圆环头 + 长杆 + 齿
                ctx.save();
                ctx.translate(cx, cy);
                ctx.strokeStyle = '#fbbf24';
                ctx.fillStyle = '#fbbf24';
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                // 圆环头 (左上)
                ctx.beginPath();
                ctx.arc(-r * 0.3, -r * 0.2, r * 0.3, 0, Math.PI * 2);
                ctx.stroke();
                // 杆 (右下)
                ctx.lineWidth = Math.max(2, cs * 0.1);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(r * 0.5, r * 0.5);
                ctx.stroke();
                // 齿 (杆末端的小横)
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                ctx.beginPath();
                ctx.moveTo(r * 0.5, r * 0.5);
                ctx.lineTo(r * 0.5, r * 0.2);
                ctx.moveTo(r * 0.35, r * 0.35);
                ctx.lineTo(r * 0.35, r * 0.15);
                ctx.stroke();
                ctx.restore();
            }
        }

        // ---------- 道具使用 ----------
        useItem(type) {
            if (!this.running || this.paused) return;
            if (this.items[type] <= 0) return;
            this.items[type]--;
            this.updateItemUI();

            if (type === 'sprint') {
                this.useSprint();
            } else if (type === 'vision') {
                this.useVision();
            } else if (type === 'freeze') {
                this.useFreeze();
            } else if (type === 'decoy') {
                this.useDecoy();
            }
        }

        // 闪现: 朝当前朝向瞬移 3 格 (撞墙则停在墙前)
        useSprint() {
            // 闪现: 朝玩家当前朝向瞬移 3 格 (不再依赖 heldDir, 即使没按键也能朝面朝方向闪)
            const dir = this.playerDir;
            for (let step = 0; step < 3; step++) {
                const nx = this.player.x + dir.x;
                const ny = this.player.y + dir.y;
                if (nx < 0 || nx >= this.N || ny < 0 || ny >= this.N) break;
                if (this.grid[ny][nx] === 1) break;
                // 留下残影
                this.activeEffects.sprintTrail.push({ x: this.player.x, y: this.player.y, life: 1 });
                this.player.x = nx;
                this.player.y = ny;
                this.addFootprint(nx, ny);
                // 传送门: 闪现踩到入口也触发传送
                if (this.checkPortalTransport()) break; // 传送后停止闪现
                // 拾取路径上的道具
                for (let i = 0; i < this.pickups.length; i++) {
                    if (this.pickups[i].x === this.player.x && this.pickups[i].y === this.player.y) {
                        if (this.items[this.pickups[i].type] < this.ITEM_MAX[this.pickups[i].type]) {
                            this.items[this.pickups[i].type]++;
                            this.updateItemUI();
                        }
                        this.pickups.splice(i, 1);
                        break;
                    }
                }
                // 拾取路径上的钥匙
                this.checkKeyPickup();
                if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
                    if (!this.exitLocked) {
                        this.onLevelClear();
                        return;
                    } else {
                        this.spawnFloatText(this.player.x, this.player.y, '需要钥匙', '#f87171');
                        break; // 锁定门挡住闪现
                    }
                }
            }
        }

        // 视野: 计算到出口的最短路径, 高亮 3 秒
        useVision() {
            const path = astar(this.grid, this.player.x, this.player.y, this.exit.x, this.exit.y);
            if (path) {
                this.activeEffects.visionPath = path;
                this.activeEffects.visionUntil = performance.now() + this.ITEM_DURATION.vision;
            }
        }

        // 冻结: 所有怪物静止 3 秒
        useFreeze() {
            this.activeEffects.freezeUntil = performance.now() + this.ITEM_DURATION.freeze;
        }

        // 诱饵: 在当前位置放幻影, 怪物改追幻影 3 秒
        useDecoy() {
            this.activeEffects.decoyPos = { x: this.player.x, y: this.player.y };
            this.activeEffects.decoyUntil = performance.now() + this.ITEM_DURATION.decoy;
        }

        // 同步更新道具栏 UI (4 个槽位的数量 + 灰显状态)
        updateItemUI() {
            for (let i = 0; i < this.ITEM_TYPES.length; i++) {
                const slot = this.itemSlots[i];
                if (!slot) continue;
                const type = this.ITEM_TYPES[i];
                const count = this.items[type];
                const countEl = slot.querySelector('.item-count');
                if (countEl) countEl.textContent = count;
                if (count > 0) slot.classList.remove('empty');
                else slot.classList.add('empty');
            }
        }
    }

    // 暴露接口给 game-shell.js 轮播适配 + 生命周期管理
    let game = null;
    window.mazeGame = {
        fitMaze() { if (game) game.fitMaze(); },
        pause()   { if (game) game.pause(); },
        resume()  { if (game) game.resume(); }
    };
    if (window.registerGame) window.registerGame('maze', window.mazeGame);

    // 自动初始化 (脚本 defer 加载, DOM 已就绪)
    if (document.readyState === 'loading') {
        whenDomReady(() => { game = new MazeGame(); });
    } else {
        game = new MazeGame();
    }
})();

// ---------- game-survivor.js ----------
// ─── 弹幕幸存者 Survivor ───
// 自动射击 + 肉鸽升级 + 子弹合成
// 依赖: SkyStorage (storage.js)

(function() {

// ─── 子弹类型定义 ───
const BULLET_DEFS = {
    dart:    { name:'飞镖', icon:'➤', color:'#60a5fa', desc:'直射穿透', baseCD:0.8 },
    bomb:    { name:'爆破', icon:'💥', color:'#f97316', desc:'范围爆炸', baseCD:1.2 },
    poison:  { name:'毒气', icon:'☣', color:'#84cc16', desc:'持续毒区', baseCD:1.5 },
    scatter: { name:'散射', icon:'※', color:'#f43f5e', desc:'扇形多发', baseCD:0.9 },
    snow:    { name:'雪花', icon:'❄', color:'#22d3ee', desc:'冰冻减速', baseCD:1.0 },
};
const BULLET_KEYS = Object.keys(BULLET_DEFS);

// 发射间隔（秒）—— 等级越高/位阶越高越快
// 基础 0.9s (B/1); 位阶 B→A 0.55x, A→S 0.28x; 等级每升一级 0.85x (指数衰减, 无上限)
function cooldownFor(tier, level) {
    const tierMult = tier === 'B' ? 1.0 : tier === 'A' ? 0.55 : 0.28;
    const lvMult = Math.max(0.25, Math.pow(0.85, level - 1));
    return 0.9 * tierMult * lvMult;
}

// 经验曲线: 4分钟≈24级, 前期快后期慢
function expToNext(level) {
    return Math.floor(5 * Math.pow(level, 1.25));
}

// ─── 合成配方 (B+B → A, A+A → S) ───
// 键: "type1+type2" (字母序), 值: { name, icon, color, desc, effect }
const FUSE_RECIPES = {
    // B级合成 → A级
    'dart+bomb':     { name:'爆裂镖', icon:'✦', color:'#fb923c', desc:'穿透+爆炸' },
    'dart+poison':   { name:'剧毒镖', icon:'☠', color:'#4ade80', desc:'穿透+中毒' },
    'dart+scatter':  { name:'穿刺散', icon:'⬢', color:'#f472b6', desc:'扇形穿透' },
    'dart+snow':     { name:'冰锋镖', icon:'❅', color:'#67e8f9', desc:'穿透+冰冻' },
    'bomb+poison':   { name:'毒爆弹', icon:'☢', color:'#a3e635', desc:'爆炸+毒区' },
    'bomb+scatter':  { name:'霰爆弹', icon:'✺', color:'#fb7185', desc:'扇形爆炸' },
    'bomb+snow':     { name:'冰爆弹', icon:'❄', color:'#5eead4', desc:'爆炸+冰冻' },
    'poison+scatter':{ name:'毒雾散', icon:'⚗', color:'#bef264', desc:'扇形毒区' },
    'poison+snow':   { name:'寒毒云', icon:'❉', color:'#6ee7b7', desc:'毒区+减速' },
    'scatter+snow':  { name:'冰霰弹', icon:'❋', color:'#67e8f9', desc:'扇形冰冻' },
    // A级合成 → S级 (取A弹效果强化)
    'dart+poison_a': { name:'死神之锋', icon:'★', color:'#fbbf24', desc:'穿透爆炸剧毒' },
};
function getFuseRecipe(t1, t2) {
    const key = [t1, t2].sort().join('+');
    return FUSE_RECIPES[key] || { name:'融合弹', icon:'✧', color:'#fbbf24', desc:'强化融合' };
}

// ─── 怪物类型 ───
const ENEMY_TYPES = ['normal', 'bomb', 'poison', 'shield', 'blackhole'];

class SurvivorGame {
    constructor() {
        this.W = 900;
        this.H = 700;
        this.CELL = 40;

        this.canvas = document.getElementById('survivorCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = this.W;
        this.canvas.height = this.H;

        this.paused = false;
        this.gameRunning = false;
        this.gameOver = false;
        this.levelupPending = false;

        this.lastTime = 0;
        this.gameTime = 0;
        this.DT_CAP = 0.05;

        // ── 玩家 ──
        this.player = null;
        this.playerBullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.crystals = [];
        this.effects = [];
        this.floatingTexts = [];
        this.poisonZones = [];   // 毒液方格

        // ── Sprite & 粒子 ──
        this.spriteCache = {};          // 预加载的精灵图
        this.particles = [];            // 通用粒子 (敌人死亡/命中/boss 死亡)
        this.snowFar = [];              // 远景飘雪 (~50)
        this.snowNear = [];             // 近景飘雪 (~30)
        this.shakeTime = 0;             // 屏幕震动剩余时间
        this.shakeMag = 0;              // 屏幕震动强度 (px)

        // ── 经验/等级 ──
        this.level = 1;
        this.exp = 0;

        // ── 波次 ──
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.bossSpawned = false;
        this.bossSpawnTime = 200; // 约3分20秒
        this.enemyKillCount = 0;

        // ── 地图滚动 (世界下移) ──
        this.scrollY = 0;
        this.scrollSpeed = 50; // px/s, 世界持续向下推

        // ── 开始游戏 (默认未开始, 等点开始按钮) ──
        this.gameStarted = false;

        // ── Offscreen 缓存 (背景静态层) ──
        this.bgCanvas = null; // 第一次 _drawBackground 时创建
        this.groundTile = null; // 雪地格子 (offscreen, lazy init)
        this.groundPattern = null; // ctx.createPattern 绑定, 平铺用
        this.groundTileSize = 60; // 单格 60x60
        this.wallW = 32; // 两侧墙宽 (每侧)

        // ── 晶石 Path2D (棱形预构建, 3 种颜色) ──
        this.crystalPaths = null; // 第一次渲染晶石时创建

        // ── 输入 ──
        this.keys = {};
        this._keyHandler = null;
        this._blurHandler = null;

        // ── 渲染 ──
        this.animationId = null;
        this.frame = 0;

        // 升级事件状态
        this._pendingChoices = null;

        this.init();
    }

    init() {
        this._loadSprites();
        this._initSnow();
        this.resetGame();
        this._bindInput();
        this._bindUI();

        // 注册生命周期
        if (window.registerGame) {
            window.registerGame('survivor', {
                pause: () => this.pause(),
                resume: () => this.resume()
            });
        }

        // 默认暂停, 但循环已在跑 (paused 期间只 _render 不 _update)
        this.paused = true;
        this.gameRunning = true;
        this.lastTime = performance.now();
        this._loop = this._loop.bind(this);
        this.animationId = requestAnimationFrame(this._loop);
        this._showStartOverlay();
    }

    _startGame() {
        if (this.gameStarted) return;
        this.gameStarted = true;
        this.paused = false;
        this.lastTime = performance.now();
        this._hideStartOverlay();
        // 循环已在 init() 启动, 这里只翻 paused 即可
    }

    _showStartOverlay() {
        const overlay = document.getElementById('survivorStartOverlay');
        if (overlay) overlay.classList.add('active');
    }
    _hideStartOverlay() {
        const overlay = document.getElementById('survivorStartOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    resetGame() {
        this.player = {
            x: this.W / 2,
            y: this.H - 60,
            r: 18,
            hp: 200,
            maxHp: 200,
            mana: 60,
            maxMana: 100,
            speed: 200,
            dirX: 0, dirY: -1,  // 朝向（默认向上）
            weapons: [
                { type: 'scatter', tier: 'B', level: 1, timer: 0 }
            ],
            invincible: 0,
        };
        this.playerBullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.crystals = [];
        this.effects = [];
        this.floatingTexts = [];
        this.poisonZones = [];
        this.particles = [];
        this.shakeTime = 0;
        this.shakeMag = 0;

        this.level = 1;
        this.exp = 0;
        this.gameTime = 0;
        this.spawnTimer = 0;
        this.spawnInterval = 1.2;
        this.skillCd = 0;
        this.bossSpawned = false;
        this.enemyKillCount = 0;
        this.gameOver = false;
        this.levelupPending = false;
        this.paused = false; // 重启后立即可玩 (避免 gameOver 状态卡住 paused)

        // 重置飘雪位置 (避免开局顶部空白)
        if (this.snowFar) {
            for (const s of this.snowFar) { s.x = Math.random() * this.W; s.y = Math.random() * this.H; }
        }
        if (this.snowNear) {
            for (const s of this.snowNear) { s.x = Math.random() * this.W; s.y = Math.random() * this.H; }
        }

        this._hideLevelup();
        this._hideGameover();
        this._updateHUD();
    }

    // ─── 输入 ───
    _bindInput() {
        this._keyHandler = (e) => {
            if (!this.gameRunning) return;
            const code = e.code;
            if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
                 'KeyA','KeyD','KeyW','KeyS','Space'].includes(code)) {
                e.preventDefault();
            }
            if (e.type === 'keydown') {
                this.keys[code] = true;
            } else {
                this.keys[code] = false;
            }
        };
        window.addEventListener('keydown', this._keyHandler);
        window.addEventListener('keyup', this._keyHandler);

        this._blurHandler = () => {
            this.keys = {};
        };
        window.addEventListener('blur', this._blurHandler);
    }

    _bindUI() {
        const restartBtn = document.getElementById('survivorRestartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.resetGame());
        }
        const overBtn = document.getElementById('survGameoverBtn');
        if (overBtn) {
            overBtn.addEventListener('click', () => this.resetGame());
        }
        const startBtn = document.getElementById('survivorStartBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this._startGame());
        }
        const pauseBtn = document.getElementById('survivorPauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this._togglePause());
        }
    }

    _togglePause() {
        // 升级选择中 / gameOver / 还没开始: 暂停按钮无效
        if (this.levelupPending || this.gameOver || !this.gameStarted) return;
        if (this.paused) {
            this.resume();
        } else {
            this.pause();
        }
        const btn = document.getElementById('survivorPauseBtn');
        if (btn) btn.textContent = this.paused ? '▶ 继续' : '⏸ 暂停';
    }

    pause() {
        this.paused = true;
    }
    resume() {
        if (this.paused) {
            this.paused = false;
            this.lastTime = performance.now();
        }
    }

    // ─── 主循环 ───
    _loop(now) {
        this.animationId = requestAnimationFrame(this._loop);
        if (!this.gameRunning) return;

        // paused / 升级选择中 / gameOver: 仍渲染一帧 (背景+玩家), 但跳过 _update
        if (this.paused || this.levelupPending || this.gameOver) {
            this.lastTime = now;
            this._render();
            return;
        }

        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        if (dt > this.DT_CAP) dt = this.DT_CAP;

        this.gameTime += dt;
        this.frame++;
        this._update(dt);
        this._render();
    }

    // ─── 更新逻辑 ───
    _update(dt) {
        this._updatePlayer(dt);
        this._updateWeapons(dt);
        this._updatePlayerBullets(dt);
        this._updateEnemies(dt);
        this._updateEnemyBullets(dt);
        this._updateCrystals(dt);
        this._updatePoisonZones(dt);
        this._updateEffects(dt);
        this._updateFloatingTexts(dt);
        this._updateParticles(dt);
        this._updateSkill(dt);
        this._checkLevelup();
        this._checkBossSpawn();
        this._applyWorldScroll(dt);
    }

    // ─── 技能: 冰霜新星 (空格释放, 消耗蓝量) ───
    _updateSkill(dt) {
        if (this.skillCd > 0) this.skillCd -= dt;
        // 只在空格"按下瞬间"触发, 防止按住连发
        const pressed = this.keys['Space'] && !this._spacePrev;
        this._spacePrev = !!this.keys['Space'];
        if (pressed) {
            this._castSkill();
        }
    }

    _castSkill() {
        const p = this.player;
        if (this.skillCd > 0) return;
        const COST = 50;
        if (p.mana < COST) {
            this._floatingText(p.x, p.y - 30, '蓝量不足', '#60a5fa');
            return;
        }
        p.mana -= COST;
        this.skillCd = 3.0;

        // 冰霜新星: 清屏周围敌弹 + 范围伤害
        const R = 220;
        this.enemyBullets = this.enemyBullets.filter(b => this._dist(b.x, b.y, p.x, p.y) > R);
        for (const e of this.enemies) {
            if (e.dead) continue;
            if (this._dist(e.x, e.y, p.x, p.y) < R + e.r) {
                this._hitEnemy(e, 60, {});
            }
        }
        // 特效
        this.effects.push({ type: 'explode', x: p.x, y: p.y, r: R, life: 0.45, maxLife: 0.45, color: '#67e8f9' });
        this._triggerShake(6, 0.25);
        this._spawnParticles(p.x, p.y, { kind: 'bossDeath', color: '#67e8f9', count: 24 });
        this._floatingText(p.x, p.y - 34, '❄ 冰霜新星', '#67e8f9');
        this._updateHUD();
    }

    // ─── 地图滚动: 所有"世界对象"统一下移 ───
    // 普通敌怪、晶石、毒区、玩家子弹、敌怪子弹、特效 都跟随世界下移
    // Boss / 玩家 / 浮动文字 / 飘雪 是屏幕空间, 不参与
    _applyWorldScroll(dt) {
        const dy = this.scrollSpeed * dt;
        this.scrollY += dy;
        for (const e of this.enemies) {
            if (!e.isBoss) e.y += dy;
        }
        for (const b of this.playerBullets) b.y += dy;
        for (const b of this.enemyBullets) b.y += dy;
        for (const c of this.crystals) c.y += dy;
        for (const z of this.poisonZones) z.y += dy;
        for (const e of this.effects) e.y += dy;
    }

    _updatePlayer(dt) {
        const p = this.player;
        if (p.invincible > 0) p.invincible -= dt;

        let dx = 0, dy = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;
        if (this.keys['ArrowUp'] || this.keys['KeyW']) dy -= 1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) dy += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            dx /= len; dy /= len;
            p.x += dx * p.speed * dt;
            p.y += dy * p.speed * dt;
            // 更新朝向
            p.dirX = dx;
            p.dirY = dy;
        }
        // 边界
        p.x = Math.max(p.r, Math.min(this.W - p.r, p.x));
        p.y = Math.max(p.r, Math.min(this.H - p.r, p.y));

        // 毒区伤害 (矩形判定: 毒区为方格)
        for (const z of this.poisonZones) {
            if (z.team === 'enemy' && Math.abs(p.x - z.x) < z.half + p.r && Math.abs(p.y - z.y) < z.half + p.r) {
                if (p.invincible <= 0) {
                    p.hp -= 8 * dt;
                }
            }
        }

        if (p.hp <= 0) {
            this._doGameOver();
        }
    }

    // ─── 武器/自动射击 ───
    _updateWeapons(dt) {
        const p = this.player;
        for (const w of p.weapons) {
            w.timer -= dt;
            if (w.timer <= 0) {
                w.timer = cooldownFor(w.tier, w.level);
                this._fireWeapon(w);
            }
        }
    }

    _findNearestEnemy(x, y) {
        let best = null, bestDist = Infinity;
        for (const e of this.enemies) {
            const d = this._dist(x, y, e.x, e.y);
            if (d < bestDist) { bestDist = d; best = e; }
        }
        return best;
    }

    _fireWeapon(w) {
        const p = this.player;
        const def = BULLET_DEFS[w.type] || {};
        const target = this._findNearestEnemy(p.x, p.y);
        if (!target && w.type !== 'scatter') return; // 没目标也允许散射(向上)

        let aimX = target ? target.x : p.x;
        let aimY = target ? target.y : p.y - 100;
        let ang = Math.atan2(aimY - p.y, aimX - p.x);

        const dmg = this._weaponDamage(w);
        const speed = 420;

        switch (w.type) {
            case 'dart': {
                // 穿透直射
                this._addBullet(p.x, p.y, ang, speed, dmg, w, { pierce: 99 });
                break;
            }
            case 'bomb': {
                // 爆破弹（触碰爆炸）
                this._addBullet(p.x, p.y, ang, speed * 0.8, dmg, w, { explode: true, radius: 50 + w.level * 10 });
                break;
            }
            case 'poison': {
                // 毒气弹（落点产生毒区）
                this._addBullet(p.x, p.y, ang, speed * 0.7, dmg * 0.5, w, { poison: true, radius: 35 + w.level * 8 });
                break;
            }
            case 'scatter': {
                // 扇形多发
                const count = 2 + w.level; // 3/4/5发
                const spread = 0.5;
                for (let i = 0; i < count; i++) {
                    const t = count === 1 ? 0.5 : i / (count - 1);
                    const a = ang - spread / 2 + spread * t;
                    this._addBullet(p.x, p.y, a, speed, dmg, w, { pierce: 0 });
                }
                break;
            }
            case 'snow': {
                // 雪花减速弹
                this._addBullet(p.x, p.y, ang, speed * 0.9, dmg, w, { slow: true });
                break;
            }
            default: {
                // A/S 级融合弹: 同时具备两种效果
                this._fireFused(w, p, ang, dmg, speed);
            }
        }
    }

    _fireFused(w, p, ang, dmg, speed) {
        // 融合弹: 根据配方效果发射
        const meta = w._meta || {};
        // 默认: 穿透 + 爆炸
        const opts = { pierce: w.tier === 'S' ? 99 : 3, explode: true, radius: 40 + w.level * 12 };
        if (meta.name && meta.name.includes('毒')) opts.poison = true;
        if (meta.name && meta.name.includes('冰')) opts.slow = true;
        // S级多发
        const shots = w.tier === 'S' ? 3 : 1;
        for (let i = 0; i < shots; i++) {
            const a = ang + (i - (shots - 1) / 2) * 0.2;
            this._addBullet(p.x, p.y, a, speed, dmg, w, opts);
        }
    }

    _weaponDamage(w) {
        const base = { dart: 18, bomb: 25, poison: 10, scatter: 16, snow: 14 }[w.type] || 15;
        const tierMult = w.tier === 'B' ? 1 : w.tier === 'A' ? 2.2 : 4.5;
        const lvMult = 1 + (w.level - 1) * 0.35;
        return Math.floor(base * tierMult * lvMult);
    }

    _addBullet(x, y, ang, speed, dmg, w, opts) {
        this.playerBullets.push({
            x, y,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            r: 7,
            dmg,
            tier: w.tier,
            level: w.level,
            type: w.type,
            color: (BULLET_DEFS[w.type] || w._meta || {}).color || '#fbbf24',
            pierce: opts.pierce || 0,
            explode: opts.explode || false,
            explodeR: opts.radius || 0,
            poison: opts.poison || false,
            poisonR: opts.radius || 0,
            slow: opts.slow || false,
            life: 2.5,
            hitSet: new Set(),
            meta: w._meta,
        });
    }

    _updatePlayerBullets(dt) {
        const arr = this.playerBullets;
        for (let i = arr.length - 1; i >= 0; i--) {
            const b = arr[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            if (b.life <= 0 || b.x < -20 || b.x > this.W + 20 || b.y < -20 || b.y > this.H + 20) {
                arr.splice(i, 1);
                continue;
            }
            // 碰撞敌人 (平方距离 + 屏幕内剪枝, 避免 Math.hypot + 跳过屏外)
            const reach = b.r + 50; // 敌怪最大 r ~30, 留余量
            const reach2 = reach * reach;
            for (const e of this.enemies) {
                if (b.hitSet.has(e)) continue;
                if (e.dead) continue;
                // 屏幕外剪枝 (敌怪 x 必须在画布内, y 在 [-50, H+50] 范围)
                if (e.x < -50 || e.x > this.W + 50) continue;
                if (e.y < -50 || e.y > this.H + 50) continue;
                const r = b.r + e.r;
                if (this._distSq(b.x, b.y, e.x, e.y) < r * r) {
                    this._hitEnemy(e, b.dmg, b);
                    b.hitSet.add(e);
                    // 爆炸
                    if (b.explode) {
                        this._explode(b.x, b.y, b.explodeR, b.dmg * 0.6, b.poison, b.poisonR, b.slow);
                        arr.splice(i, 1);
                        break;
                    }
                    // 毒区 (方格覆盖)
                    if (b.poison) {
                        const g = this._snapToGrid(b.x, b.y);
                        this.poisonZones.push({
                            x: g.x, y: g.y, half: 30,
                            team: 'player', life: 4, dmg: b.dmg * 0.3, tick: 0
                        });
                        arr.splice(i, 1);
                        break;
                    }
                    if (b.pierce <= 0) {
                        arr.splice(i, 1);
                        break;
                    }
                    b.pierce--;
                }
            }
        }
    }

    _explode(x, y, r, dmg, poison, poisonR, slow) {
        this.effects.push({ type: 'explode', x, y, r, life: 0.35, maxLife: 0.35, color: '#fb923c' });
        for (const e of this.enemies) {
            if (e.dead) continue;
            if (this._dist(x, y, e.x, e.y) < r + e.r) {
                this._hitEnemy(e, dmg, { slow });
            }
        }
    }

    _hitEnemy(e, dmg, bullet) {
        if (e.dead) return;
        // 护盾怪
        if (e.shield > 0) {
            e.shield -= dmg;
            if (e.shield <= 0) {
                e.shield = 0;
            } else {
                this._floatingText(e.x, e.y - e.r, '🛡', '#67e8f9');
                this._spawnParticles(e.x, e.y - e.r, { kind: 'bulletHit', color: '#67e8f9', count: 3 });
                return;
            }
        }
        e.hp -= dmg;
        if (bullet && bullet.slow) {
            e.slowTimer = 1.5;
            e.slowFactor = 0.5;
        }
        // 命中火花
        const sparkColor = (bullet && bullet.color) || '#bae6fd';
        this._spawnParticles(e.x, e.y, { kind: 'bulletHit', color: sparkColor, count: 4 });
        if (e.hp <= 0) {
            this._killEnemy(e);
        }
    }

    _killEnemy(e) {
        if (e.dead) return;
        e.dead = true;
        this.enemyKillCount++;

        // 爆炸特效
        this.effects.push({ type: 'enemyDeath', x: e.x, y: e.y, r: e.r, life: 0.3, maxLife: 0.3, color: e.color });

        // 死亡粒子
        if (e.isBoss) {
            this._spawnParticles(e.x, e.y, { kind: 'bossDeath', color: e.color, count: 36 });
            this._triggerShake(8, 0.3);
        } else if (e.isElite) {
            this._spawnParticles(e.x, e.y, { kind: 'enemyDeath', color: e.color, count: 14 });
        } else {
            this._spawnParticles(e.x, e.y, { kind: 'enemyDeath', color: e.color, count: 10 });
        }

        // 掉落晶石 (更丰富, 加快前期升级)
        if (e.isBoss) {
            // Boss 掉多个
            for (let i = 0; i < 10; i++) {
                this._dropCrystal(e.x + (Math.random()-0.5)*40, e.y + (Math.random()-0.5)*40, 'red');
            }
            for (let i = 0; i < 8; i++) {
                this._dropCrystal(e.x + (Math.random()-0.5)*60, e.y + (Math.random()-0.5)*60, 'blue');
            }
            this._doGameWin();
        } else if (e.isElite) {
            // 精英: 2~3 个蓝/红 (品质随时间提升) + 必掉一瓶
            const t = this.gameTime;
            const n = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < n; i++) {
                const roll = Math.random();
                const color = roll < Math.min(0.5, 0.2 + t / 200) ? 'red' : 'blue';
                this._dropCrystal(e.x + (Math.random()-0.5)*30, e.y + (Math.random()-0.5)*30, color);
            }
            this._dropPickup(e.x, e.y + 10, Math.random() < 0.5 ? 'hp' : 'mana');
        } else {
            // 普通: 必掉 1 绿 + 概率额外, 品质随时间提升, 后期主要不额外掉绿
            const t = this.gameTime;
            const blueChance = Math.min(0.45, 0.08 + t / 150);          // 前期8%, 后期45%
            const redChance  = Math.min(0.2, t / 500);                  // 后期才出红
            const extraGreenChance = Math.max(0.05, 0.55 - t / 90);     // 前期55%, 90秒后≈5% (兜底)
            this._dropCrystal(e.x, e.y, 'green');
            const r = Math.random();
            if (r < redChance) {
                this._dropCrystal(e.x + 12, e.y + 8, 'red');
            } else if (r < redChance + blueChance) {
                this._dropCrystal(e.x + 12, e.y + 8, 'blue');
            } else if (r < redChance + blueChance + extraGreenChance) {
                this._dropCrystal(e.x - 12, e.y + 10, 'green');
            }
            // 小概率掉血/蓝瓶
            const pr = Math.random();
            if (pr < 0.06) {
                this._dropPickup(e.x, e.y + 14, 'hp');
            } else if (pr < 0.12) {
                this._dropPickup(e.x, e.y + 14, 'mana');
            }
        }
    }

    _dropCrystal(x, y, color) {
        const exp = { green: 1, blue: 3, red: 8 }[color];
        this.crystals.push({
            x, y,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40 - 30,
            color, exp,
            kind: 'crystal',
            r: 8,
            life: 12,
            magnet: false,
        });
    }

    // 血瓶 / 蓝瓶
    _dropPickup(x, y, kind) {
        this.crystals.push({
            x, y,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40 - 30,
            color: kind === 'hp' ? '#f87171' : '#60a5fa',
            kind,
            r: 9,
            life: 15,
            magnet: false,
        });
    }

    // 对齐到地面方格中心 (地面 tile 60x60, 毒区/轰炸以方格为单位)
    _snapToGrid(x, y) {
        const g = this.groundTileSize;
        return {
            x: Math.floor(x / g) * g + g / 2,
            y: Math.floor(y / g) * g + g / 2
        };
    }

    // ─── 敌人 ───
    _updateEnemies(dt) {
        // 生成
        if (!this.bossSpawned) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                // 一次生成 1~2 只 (随时间缓慢增加), 后期不失控
                const batch = 1 + Math.floor(this.gameTime / 75); // 75s后2只, 150s后3只
                for (let i = 0; i < Math.min(batch, 3); i++) {
                    this._spawnEnemy();
                }
                // 间隔随时间递减 (下限 0.5s, 防止后期过密)
                this.spawnInterval = Math.max(0.5, 1.2 - this.gameTime * 0.004);
                this.spawnTimer = this.spawnInterval;
            }
        }

        const p = this.player;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.dead) { this.enemies.splice(i, 1); continue; }

            // 减速
            const sf = e.slowTimer > 0 ? e.slowFactor : 1;
            if (e.slowTimer > 0) e.slowTimer -= dt;

            // 移动: Boss 驻场屏上中央 (不参与 scroll, 可能有冲刺技能 TODO)
            // 普通敌怪: 不自己移动, 由 _applyWorldScroll 统一下推
            if (e.isBoss) {
                // Boss 驻场到屏上 30% 位置中央 (缓慢回弹)
                e.x += (this.W / 2 - e.x) * 0.5 * dt;
                e.y = this.H * 0.3;
            }

            // 朝向玩家 (dirX/dirY 仍要更新, 让 sprite 旋转)
            const ang = Math.atan2(p.y - e.y, p.x - e.x);
            e.dirX = Math.cos(ang);
            e.dirY = Math.sin(ang);

            // 怪物射击
            if (e.shootTimer !== undefined) {
                e.shootTimer -= dt;
                if (e.shootTimer <= 0) {
                    e.shootTimer = e.shootInterval;
                    this._enemyShoot(e);
                }
            }

            // 碰撞玩家
            if (this._dist(e.x, e.y, p.x, p.y) < e.r + p.r && p.invincible <= 0) {
                p.hp -= e.contactDmg;
                p.invincible = 0.8;
                this._floatingText(p.x, p.y - 20, '-' + e.contactDmg, '#ef4444');
                this._triggerShake(4, 0.15);
                this._spawnParticles(p.x, p.y, { kind: 'bulletHit', color: '#ef4444', count: 6 });
            }

            // 出界（底部）
            if (e.y > this.H + 50) {
                this.enemies.splice(i, 1);
            }
        }
    }

    _spawnEnemy() {
        const p = this.player;
        const weaponCount = p.weapons.length;
        // 武器槽 >= 3 后解锁更强怪种
        const allowStrong = weaponCount >= 3;
        const allowElite = this.gameTime > 60; // 1分钟后可出精英

        let type = 'normal';
        if (allowStrong && !this.bossSpawned) {
            const r = Math.random();
            if (r < 0.35) type = 'normal';
            else if (r < 0.5) type = 'bomb';
            else if (r < 0.65) type = 'poison';
            else if (r < 0.8) type = 'shield';
            else type = 'blackhole';
        }

        const isElite = allowElite && Math.random() < 0.12;
        this._createEnemy(type, isElite);
    }

    _createEnemy(type, isElite, isBoss) {
        // Boss 出生在屏上中央, 不从屏外进入
        const x = isBoss ? this.W / 2 : 60 + Math.random() * (this.W - 120);
        const y = isBoss ? this.H * 0.3 : -30;
        const mult = isElite ? 1.0 : 1.0;
        const sizeMult = isElite ? 2.0 : 1.0;

        const base = {
            normal:    { hp: 25, speed: 35, color:'#94a3b8', contactDmg: 6,  shootInterval: 3.0, bulletSpeed: 120 },
            bomb:      { hp: 30, speed: 28, color:'#fb923c', contactDmg: 8,  shootInterval: 4.0, bulletSpeed: 100 },
            poison:    { hp: 28, speed: 30, color:'#84cc16', contactDmg: 5,  shootInterval: 3.5, bulletSpeed: 90 },
            shield:    { hp: 35, speed: 28, color:'#60a5fa', contactDmg: 6,  shootInterval: 3.5, bulletSpeed: 110 },
            blackhole: { hp: 40, speed: 26, color:'#a855f7', contactDmg: 10, shootInterval: 4.5, bulletSpeed: 130 },
        }[type] || {};

        const hpScale = isBoss ? 15 : (isElite ? 3 : 1);
        // 时间缩放血量: 后期血量按 gameTime 增长, 避免冰霜新星 + 少量攻击就速通
        // boss: 1.5 分钟 x2, 3 分钟 x3, 4 分钟 x4
        // elite: 3 分钟 x2, 6 分钟 x3
        const t = this.gameTime;
        const timeHpMult = isBoss ? (1 + t / 90) : (isElite ? (1 + t / 180) : 1);
        const hpFinal = Math.round(base.hp * hpScale * timeHpMult);
        const e = {
            x, y,
            r: (isBoss ? 40 : 22) * sizeMult,
            hp: hpFinal,
            maxHp: hpFinal,
            speed: base.speed * (isBoss ? 0.6 : 1),
            color: base.color,
            contactDmg: base.contactDmg * (isElite ? 1.5 : 1),
            type,
            isElite,
            isBoss: !!isBoss,
            shield: type === 'shield' ? (isBoss ? 100 : isElite ? 40 : 15) : 0,
            shootTimer: 1 + Math.random() * 2,
            shootInterval: base.shootInterval / (isBoss ? 1.5 : 1),
            bulletSpeed: base.bulletSpeed,
            slowTimer: 0,
            slowFactor: 1,
            dead: false,
            dirX: 0, dirY: 1,
            bossPhase: 0,
            bossTypes: null,
        };

        if (isBoss) {
            // Boss 随机结合2种特性
            const types = ['normal','bomb','poison','shield','blackhole'];
            const t1 = types[Math.floor(Math.random() * types.length)];
            let t2 = types[Math.floor(Math.random() * types.length)];
            while (t2 === t1) t2 = types[Math.floor(Math.random() * types.length)];
            e.bossTypes = [t1, t2];
            e.shootInterval = 1.2;
        }

        this.enemies.push(e);
    }

    _enemyShoot(e) {
        if (e.isBoss) {
            this._bossShoot(e);
            return;
        }
        const p = this.player;
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        switch (e.type) {
            case 'normal':
                this._addEnemyBullet(e.x, e.y, ang, e.bulletSpeed, e.contactDmg * 0.4);
                break;
            case 'bomb':
                // 定点轰炸: 在玩家所在方格标记, 延迟爆炸（由 _updateEffects 触发）
                const g1 = this._snapToGrid(p.x, p.y);
                this.effects.push({ type: 'bombMarker', x: g1.x, y: g1.y, r: 30, life: 1.2, maxLife: 1.2, color:'#fb923c', willExplode: true, explodeDmg: 15 });
                break;
            case 'poison': {
                // 在玩家附近方格吐毒液 (对齐格子)
                const count = e.isElite ? 2 : 1;
                for (let i = 0; i < count; i++) {
                    const tx = p.x + (Math.random() - 0.5) * 120;
                    const ty = p.y + (Math.random() - 0.5) * 120;
                    const g = this._snapToGrid(tx, ty);
                    this.poisonZones.push({
                        x: g.x, y: g.y, half: 30,
                        team: 'enemy', life: 4, dmg: 6, tick: 0
                    });
                }
                break;
            }
            case 'shield':
                // 护盾怪也射普通弹
                this._addEnemyBullet(e.x, e.y, ang, e.bulletSpeed, e.contactDmg * 0.4);
                break;
            case 'blackhole':
                // 黑洞弹: 反弹
                this._addEnemyBullet(e.x, e.y, ang, e.bulletSpeed, e.contactDmg * 0.5, { bounce: true, bounceCount: 3, r: 8 });
                break;
        }
    }

    _bossShoot(e) {
        // Boss 弹幕: 连射 + 根据特性额外攻击
        const p = this.player;
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        // 基础弹幕: 扇形5发
        for (let i = -2; i <= 2; i++) {
            this._addEnemyBullet(e.x, e.y, ang + i * 0.15, 160, 8);
        }
        // Boss 射击闪光
        this._spawnParticles(e.x, e.y, { kind: 'bulletHit', color: '#a855f7', count: 3 });
        // 特性攻击
        for (const t of e.bossTypes || []) {
            if (t === 'bomb') {
                const g = this._snapToGrid(p.x, p.y);
                this.effects.push({ type: 'bombMarker', x: g.x, y: g.y, r: 30, life: 1.0, maxLife: 1.0, color:'#fb923c' });
            } else if (t === 'poison') {
                const g = this._snapToGrid(p.x, p.y);
                this.poisonZones.push({ x: g.x, y: g.y, half: 30, team:'enemy', life: 4, dmg: 8, tick: 0 });
            } else if (t === 'blackhole') {
                this._addEnemyBullet(e.x, e.y, ang, 140, 10, { bounce: true, bounceCount: 4, r: 9 });
            }
            // normal/shield 不额外攻击
        }

        // 阶段切换
        if (e.hp < e.maxHp * 0.5 && e.bossPhase === 0) {
            e.bossPhase = 1;
            e.shootInterval = 0.8;
        }
    }

    _addEnemyBullet(x, y, ang, speed, dmg, opts) {
        opts = opts || {};
        this.enemyBullets.push({
            x, y,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            r: opts.r || 7,
            dmg,
            color: opts.bounce ? '#a855f7' : '#f87171',
            bounce: opts.bounce || false,
            bounceCount: opts.bounceCount || 0,
            life: 5,
        });
    }

    _updateEnemyBullets(dt) {
        const p = this.player;
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            // 反弹
            if (b.bounce && b.bounceCount > 0) {
                if (b.x < b.r || b.x > this.W - b.r) { b.vx *= -1; b.x = Math.max(b.r, Math.min(this.W - b.r, b.x)); b.bounceCount--; }
                if (b.y < b.r || b.y > this.H - b.r) { b.vy *= -1; b.y = Math.max(b.r, Math.min(this.H - b.r, b.y)); b.bounceCount--; }
            }
            if (b.life <= 0 || b.x < -20 || b.x > this.W + 20 || b.y < -20 || b.y > this.H + 20) {
                this.enemyBullets.splice(i, 1);
                continue;
            }
            // 碰撞玩家
            if (this._dist(b.x, b.y, p.x, p.y) < b.r + p.r && p.invincible <= 0) {
                p.hp -= b.dmg;
                p.invincible = 0.8;
                this._floatingText(p.x, p.y - 20, '-' + Math.floor(b.dmg), '#ef4444');
                this._triggerShake(3, 0.12);
                this._spawnParticles(p.x, p.y, { kind: 'bulletHit', color: b.color, count: 4 });
                this.enemyBullets.splice(i, 1);
            }
        }
    }

    // ─── 晶石 ───
    _updateCrystals(dt) {
        const p = this.player;
        for (let i = this.crystals.length - 1; i >= 0; i--) {
            const c = this.crystals[i];
            // 永生: 不再衰减 life
            // 初速度衰减 (保留, 有动感)
            c.vx *= 0.92;
            c.vy *= 0.92;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            // 旋转
            c.rot = (c.rot || 0) + dt * 1.5;

            const d = this._dist(c.x, c.y, p.x, p.y);
            // 磁吸
            if (d < 80 || c.magnet) {
                c.magnet = true;
                const ang = Math.atan2(p.y - c.y, p.x - c.x);
                const pull = 200;
                c.x += Math.cos(ang) * pull * dt;
                c.y += Math.sin(ang) * pull * dt;
            }
            if (d < p.r + c.r) {
                if (c.kind === 'hp') {
                    // 血瓶: 回血
                    p.hp = Math.min(p.maxHp, p.hp + 40);
                    this._floatingText(c.x, c.y - 8, '+40 HP', '#f87171');
                    this._spawnParticles(c.x, c.y, { kind: 'bulletHit', color: '#f87171', count: 6 });
                } else if (c.kind === 'mana') {
                    // 蓝瓶: 加蓝
                    p.mana = Math.min(p.maxMana, p.mana + 30);
                    this._floatingText(c.x, c.y - 8, '+30 MP', '#60a5fa');
                    this._spawnParticles(c.x, c.y, { kind: 'bulletHit', color: '#60a5fa', count: 6 });
                } else {
                    // 晶石: 经验
                    this.exp += c.exp;
                    this._floatingText(c.x, c.y, '+' + c.exp, c.color === 'green' ? '#4ade80' : c.color === 'blue' ? '#60a5fa' : '#f87171');
                }
                this.crystals.splice(i, 1);
                continue;
            }
            // 出底部消失 (玩家没捡到, 落在屏幕外)
            if (c.y > this.H + 50) this.crystals.splice(i, 1);
        }
    }

    _updatePoisonZones(dt) {
        for (let i = this.poisonZones.length - 1; i >= 0; i--) {
            const z = this.poisonZones[i];
            z.life -= dt;
            z.tick = (z.tick || 0) + dt;
            if (z.life <= 0) { this.poisonZones.splice(i, 1); continue; }
            // 对敌人持续伤害（玩家毒区, 矩形判定）
            if (z.team === 'player') {
                const half = z.half || 25;
                for (const e of this.enemies) {
                    if (e.dead) continue;
                    if (Math.abs(z.x - e.x) < half + e.r && Math.abs(z.y - e.y) < half + e.r) {
                        if (z.tick >= 0.5) {
                            this._hitEnemy(e, z.dmg, {});
                        }
                    }
                }
                if (z.tick >= 0.5) z.tick = 0;
            }
        }
    }

    _updateEffects(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.life -= dt;
            if (e.life <= 0) {
                // 定点轰炸: 标记时间到, 触发爆炸
                if (e.willExplode) {
                    this._explode(e.x, e.y, e.r, e.explodeDmg || 15, false, 0, false);
                }
                this.effects.splice(i, 1);
            }
        }
    }

    _updateFloatingTexts(dt) {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i];
            t.life -= dt;
            t.y -= 30 * dt;
            if (t.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }

    // ─── 升级系统 ───
    _checkLevelup() {
        const need = expToNext(this.level);
        if (this.exp >= need) {
            this.exp -= need;
            this.level++;
            this._triggerLevelup();
        }
    }

    _triggerLevelup() {
        this.levelupPending = true;
        const choices = this._generateChoices();
        this._pendingChoices = choices;
        this._renderLevelup(choices);
    }

    _generateChoices() {
        const p = this.player;
        const weapons = p.weapons;
        const slots = weapons.length;
        const maxSlots = 5;
        const events = [];

        // 检查可合成
        const fusable = this._findFusable();
        const hasFusable = fusable.length > 0;

        // 事件池
        if (slots < maxSlots) {
            // 武器槽未满: 大概率出新子弹或升级
            // 新子弹（从没有的B级弹里选2种）
            const owned = new Set(weapons.map(w => w.type));
            const avail = BULLET_KEYS.filter(k => !owned.has(k));
            if (avail.length > 0) {
                const shuffled = avail.slice().sort(() => Math.random() - 0.5);
                const pick = shuffled.slice(0, Math.min(2, shuffled.length));
                for (const t of pick) {
                    const def = BULLET_DEFS[t];
                    events.push({
                        kind: 'new',
                        type: t,
                        icon: def.icon,
                        name: def.name,
                        desc: def.desc + ' (B级·1级)',
                        tier: 'B',
                        tierLabel: 'B',
                    });
                }
            }
        }

        // 升级已有子弹
        const upgradable = weapons.filter(w => w.level < 3);
        for (const w of upgradable) {
            const def = BULLET_DEFS[w.type] || w._meta || {};
            events.push({
                kind: 'upgrade',
                type: w.type,
                icon: def.icon || '✧',
                name: def.name || '融合弹',
                desc: `升级 → ${w.level + 1}级 (伤害+射速提升)`,
                tier: w.tier,
                tierLabel: w.tier,
                level: w.level,
            });
        }

        // 随机连升3-5次（有2+未满级子弹时）
        if (upgradable.length >= 2) {
            events.push({
                kind: 'upgradeBurst',
                icon: '⬆',
                name: '强化冲击',
                desc: `随机升级已有子弹 3~5 次`,
                tierLabel: '',
            });
        }

        // 合成事件
        if (hasFusable) {
            for (const pair of fusable.slice(0, 2)) {
                const recipe = getFuseRecipe(pair[0].type, pair[1].type);
                events.push({
                    kind: 'fuse',
                    pair: pair,
                    icon: recipe.icon,
                    name: recipe.name,
                    desc: recipe.desc + ` (合成→${pair[0].tier === 'B' ? 'A' : 'S'}级)`,
                    tierLabel: pair[0].tier === 'B' ? 'A' : 'S',
                    recipe,
                });
            }
        }

        // 从事件池中随机选2个
        const shuffled = events.sort(() => Math.random() - 0.5);
        const choices = shuffled.slice(0, 2);
        // 给每个选择附带"已刷新"标记
        choices.forEach(c => c.refreshed = false);
        return choices;
    }

    _findFusable() {
        const p = this.player;
        const weapons = p.weapons;
        const result = [];
        // 找2个满级同级同类（B或A）的子弹
        const tierGroups = {};
        for (const w of weapons) {
            if (w.level >= 3) {
                const k = w.tier;
                if (!tierGroups[k]) tierGroups[k] = [];
                tierGroups[k].push(w);
            }
        }
        for (const tier in tierGroups) {
            const group = tierGroups[tier];
            if (group.length >= 2) {
                // 取前2个
                result.push([group[0], group[1]]);
            }
        }
        return result;
    }

    _refreshChoice(idx) {
        const p = this.player;
        const choices = this._pendingChoices;
        if (!choices || !choices[idx]) return;
        if (choices[idx].refreshed) return;

        // 重新生成
        const newEvents = this._generateChoices();
        const filtered = newEvents.filter(e => {
            // 排除与另一个 choice 重复的
            return true;
        });
        if (filtered.length > 0) {
            const pick = filtered[Math.floor(Math.random() * filtered.length)];
            pick.refreshed = true;
            choices[idx] = pick;
            this._renderLevelup(choices);
        }
    }

    _applyChoice(idx) {
        const p = this.player;
        const c = this._pendingChoices[idx];
        if (!c) return;

        switch (c.kind) {
            case 'new': {
                p.weapons.push({ type: c.type, tier: 'B', level: 1, timer: 0 });
                break;
            }
            case 'upgrade': {
                const w = p.weapons.find(w => w.type === c.type && w.tier === c.tier && w.level === c.level);
                if (w) w.level++;
                break;
            }
            case 'upgradeBurst': {
                const count = 3 + Math.floor(Math.random() * 3);
                const upgradable = p.weapons.filter(w => w.level < 3);
                for (let i = 0; i < count && upgradable.length > 0; i++) {
                    const w = upgradable[Math.floor(Math.random() * upgradable.length)];
                    w.level++;
                    if (w.level >= 3) {
                        const idx2 = upgradable.indexOf(w);
                        if (idx2 >= 0) upgradable.splice(idx2, 1);
                    }
                }
                break;
            }
            case 'fuse': {
                const [w1, w2] = c.pair;
                const newTier = w1.tier === 'B' ? 'A' : 'S';
                // 移除两把
                const i1 = p.weapons.indexOf(w1);
                if (i1 >= 0) p.weapons.splice(i1, 1);
                const i2 = p.weapons.indexOf(w2);
                if (i2 >= 0) p.weapons.splice(i2, 1);
                // 添加合成弹
                const recipe = c.recipe;
                p.weapons.push({
                    type: w1.type + '_fused',
                    tier: newTier,
                    level: 1,
                    timer: 0,
                    _meta: recipe,
                });
                break;
            }
        }

        this.levelupPending = false;
        this._pendingChoices = null;
        this._hideLevelup();
        this._updateHUD();
    }

    // ─── Boss ───
    _checkBossSpawn() {
        if (!this.bossSpawned && this.gameTime >= this.bossSpawnTime) {
            this.bossSpawned = true;
            this._createEnemy('normal', false, true);
            this._floatingText(this.W / 2, 100, '⚠ BOSS 出现 ⚠', '#ef4444');
        }
    }

    // ─── 游戏结束 ───
    _doGameOver() {
        if (this.gameOver) return;
        this.gameOver = true;
        this._showGameover();
    }

    _doGameWin() {
        if (this.gameOver) return;
        this.gameOver = true;
        this._showGameover(true);
    }

    // ─── UI 渲染 ───
    _updateHUD() {
        const p = this.player;
        const hpFill = document.getElementById('survHpFill');
        const hpText = document.getElementById('survHpText');
        const mpFill = document.getElementById('survMpFill');
        const mpText = document.getElementById('survMpText');
        const lvEl = document.getElementById('survLevelValue');
        const expFill = document.getElementById('survExpFill');
        const timeEl = document.getElementById('survTimeValue');
        const killEl = document.getElementById('survKillValue');

        if (hpFill) hpFill.style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
        if (hpText) hpText.textContent = Math.ceil(Math.max(0, p.hp)) + '/' + p.maxHp;
        if (mpFill) mpFill.style.width = Math.max(0, p.mana / p.maxMana * 100) + '%';
        if (mpText) mpText.textContent = Math.floor(p.mana) + '/' + p.maxMana;
        if (lvEl) lvEl.textContent = this.level;
        if (expFill) expFill.style.width = (this.exp / expToNext(this.level) * 100) + '%';
        if (timeEl) timeEl.textContent = Math.floor(this.gameTime) + 's';
        if (killEl) killEl.textContent = this.enemyKillCount;

        // 武器槽
        this._renderWeaponBar();
    }

    _renderWeaponBar() {
        const bar = document.getElementById('survWeaponBar');
        if (!bar) return;
        const p = this.player;
        const maxSlots = 5;
        let html = '';
        for (let i = 0; i < maxSlots; i++) {
            const w = p.weapons[i];
            if (!w) {
                html += `<div class="surv-weapon-slot empty"><span class="surv-weapon-icon">·</span><span class="surv-weapon-name">空槽</span></div>`;
                continue;
            }
            const def = BULLET_DEFS[w.type] || w._meta || {};
            const maxed = w.level >= 3;
            const fusable = maxed && this._findFusable().some(pair => pair.includes(w));
            const dots = '';
            let dotHtml = '';
            for (let d = 0; d < 3; d++) {
                dotHtml += `<span class="surv-dot ${d < w.level ? 'filled' : ''}"></span>`;
            }
            html += `<div class="surv-weapon-slot ${maxed ? 'maxed' : ''} ${fusable ? 'can-fuse' : ''}">
                <span class="surv-weapon-tier tier-${w.tier}">${w.tier}</span>
                <span class="surv-weapon-level">Lv${w.level}</span>
                <span class="surv-weapon-icon" style="color:${def.color || '#fbbf24'}">${def.icon || '✧'}</span>
                <span class="surv-weapon-name">${def.name || '融合弹'}</span>
                <div class="surv-weapon-dots">${dotHtml}</div>
            </div>`;
        }
        bar.innerHTML = html;
    }

    _renderLevelup(choices) {
        const overlay = document.getElementById('survLevelupOverlay');
        const cardsEl = document.getElementById('survLevelupCards');
        if (!overlay || !cardsEl) return;

        const levelEl = document.getElementById('survLevelupLevel');
        if (levelEl) levelEl.textContent = this.level;

        let html = '';
        choices.forEach((c, i) => {
            const tierBadge = c.tierLabel ? `<div class="ev-tier-badge tier-${c.tierLabel}">${c.tierLabel}级</div>` : '';
            html += `<div class="surv-event-card" data-idx="${i}">
                <button class="ev-refresh ${c.refreshed ? 'used' : ''}" data-refresh="${i}" title="刷新">↻</button>
                ${tierBadge}
                <div class="ev-icon" style="color:${c.icon === '↻' ? '#bae6fd' : ''}">${c.icon}</div>
                <div class="ev-name">${c.name}</div>
                <div class="ev-desc">${c.desc}</div>
            </div>`;
        });
        cardsEl.innerHTML = html;
        overlay.classList.add('active');

        // 绑定点击
        cardsEl.querySelectorAll('.surv-event-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('ev-refresh')) {
                    e.stopPropagation();
                    const idx = parseInt(e.target.dataset.refresh);
                    this._refreshChoice(idx);
                    return;
                }
                const idx = parseInt(card.dataset.idx);
                this._applyChoice(idx);
            });
        });
    }

    _hideLevelup() {
        const overlay = document.getElementById('survLevelupOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    _showGameover(win) {
        const overlay = document.getElementById('survGameoverOverlay');
        const title = document.getElementById('survGameoverTitle');
        const stats = document.getElementById('survGameoverStats');
        if (overlay) overlay.classList.add('active');
        if (title) title.textContent = win ? '🏆 胜利！' : '☠ 游戏结束';
        if (stats) stats.innerHTML = `等级: ${this.level}<br>击杀: ${this.enemyKillCount}<br>存活: ${Math.floor(this.gameTime)}s`;
    }

    _hideGameover() {
        const overlay = document.getElementById('survGameoverOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    _floatingText(x, y, text, color) {
        this.floatingTexts.push({ x, y, text, color, life: 1.0, maxLife: 1.0 });
    }

    _dist(x1, y1, x2, y2) {
        return Math.hypot(x1 - x2, y1 - y2);
    }
    // 平方距离 (避免 sqrt, 用于碰撞比较)
    _distSq(x1, y1, x2, y2) {
        const dx = x1 - x2, dy = y1 - y2;
        return dx * dx + dy * dy;
    }

    // ─── 屏幕震动 ───
    _triggerShake(mag, time) {
        if (mag > this.shakeMag) this.shakeMag = mag;
        if (time > this.shakeTime) this.shakeTime = time;
    }

    // ─── Sprite 预加载 ───
    _loadSprites() {
        const list = [
            ['player',           'assets/survivor/player.png'],
            ['boss',             'assets/survivor/boss.png'],
            ['enemy-normal',     'assets/survivor/enemy-normal.png'],
            ['enemy-bomb',       'assets/survivor/enemy-bomb.png'],
            ['enemy-poison',     'assets/survivor/enemy-poison.png'],
            ['enemy-shield',     'assets/survivor/enemy-shield.png'],
            ['enemy-blackhole',  'assets/survivor/enemy-blackhole.png'],
            ['bullet-dart',      'assets/survivor/bullet-dart.png'],
            ['bullet-bomb',      'assets/survivor/bullet-bomb.png'],
            ['bullet-poison',    'assets/survivor/bullet-poison.png'],
            ['bullet-scatter',   'assets/survivor/bullet-scatter.png'],
            ['bullet-snow',      'assets/survivor/bullet-snow.png'],
        ];
        for (const [key, src] of list) {
            const img = new Image();
            img.src = src;
            this.spriteCache[key] = img;
        }
    }

    // 取 sprite,未加载完成返回 null
    _sprite(key) {
        const img = this.spriteCache[key];
        if (!img) return null;
        if (!img.complete || img.naturalWidth === 0) return null;
        return img;
    }

    // ─── 飘雪初始化 ───
    _initSnow() {
        this.snowFar = [];
        this.snowNear = [];
        for (let i = 0; i < 50; i++) {
            this.snowFar.push({
                x: Math.random() * this.W,
                y: Math.random() * this.H,
                v: 10 + Math.random() * 10,
                r: 0.5 + Math.random() * 1.5,
                drift: (Math.random() - 0.5) * 8,
            });
        }
        for (let i = 0; i < 30; i++) {
            this.snowNear.push({
                x: Math.random() * this.W,
                y: Math.random() * this.H,
                v: 40 + Math.random() * 20,
                r: 1.5 + Math.random() * 1.5,
                drift: (Math.random() - 0.5) * 20,
            });
        }
    }

    // ─── 粒子系统 ───
    _spawnParticles(x, y, opts) {
        opts = opts || {};
        const kind = opts.kind || 'bulletHit';
        const color = opts.color || '#bae6fd';
        const count = opts.count || 5;

        for (let i = 0; i < count; i++) {
            if (this.particles.length >= 200) break;
            const ang = Math.random() * Math.PI * 2;
            let speed, size, life, grav, vyBias;
            if (kind === 'bossDeath') {
                speed = 80 + Math.random() * 180;
                size = 3 + Math.random() * 4;
                life = 1.5 + Math.random() * 1.0;
                grav = 80;
                vyBias = 40;
            } else if (kind === 'enemyDeath') {
                speed = 60 + Math.random() * 140;
                size = 2 + Math.random() * 3;
                life = 0.8 + Math.random() * 0.7;
                grav = 80;
                vyBias = 40;
            } else { // bulletHit
                speed = 60 + Math.random() * 100;
                size = 1.5 + Math.random() * 1.5;
                life = 0.3 + Math.random() * 0.3;
                grav = 0;
                vyBias = 0;
            }
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed - vyBias,
                life, maxLife: life, size, color, grav,
            });
        }
    }

    _updateParticles(dt) {
        // 屏幕震动衰减
        if (this.shakeTime > 0) this.shakeTime -= dt;

        // 通用粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.grav) p.vy += p.grav * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // 远景飘雪
        for (const s of this.snowFar) {
            s.y += s.v * dt;
            s.x += s.drift * dt;
            if (s.y > this.H) { s.y = -2; s.x = Math.random() * this.W; }
            if (s.x < 0) s.x = this.W;
            else if (s.x > this.W) s.x = 0;
        }
        // 近景飘雪
        for (const s of this.snowNear) {
            s.y += s.v * dt;
            s.x += s.drift * dt;
            if (s.y > this.H) { s.y = -2; s.x = Math.random() * this.W; }
            if (s.x < 0) s.x = this.W;
            else if (s.x > this.W) s.x = 0;
        }
    }

    _drawParticles() {
        const ctx = this.ctx;
        for (const p of this.particles) {
            const a = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ─── 渲染 ───
    _render() {
        const ctx = this.ctx;
        ctx.save();

        // 屏幕震动
        if (this.shakeTime > 0) {
            const m = this.shakeMag * (this.shakeTime > 0 ? Math.min(1, this.shakeTime * 6) : 0);
            ctx.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
        }

        // 雪原背景
        this._drawBackground();

        // 毒区 (方格覆盖)
        for (const z of this.poisonZones) {
            const alpha = Math.min(1, z.life / 2);
            const half = z.half || 25;
            ctx.fillStyle = z.team === 'player' ? `rgba(132,204,22,${0.2 * alpha})` : `rgba(239,68,68,${0.2 * alpha})`;
            ctx.fillRect(z.x - half, z.y - half, half * 2, half * 2);
            ctx.strokeStyle = z.team === 'player' ? `rgba(132,204,22,${0.5 * alpha})` : `rgba(239,68,68,${0.5 * alpha})`;
            ctx.lineWidth = 2; ctx.strokeRect(z.x - half, z.y - half, half * 2, half * 2);
        }

        // 晶石 (长六边形) + 血/蓝瓶 (Path2D 预构建 + 按类型分桶 + setTransform 批量)
        ctx.save(); // 保存震动 transform 状态, 循环后 restore
        if (!this.crystalPaths) {
            const rx = 11, ry = 7; // 长六边形: 水平拉长, 与圆形敌弹区分
            const makeHex = () => {
                const p = new Path2D();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    const px = Math.cos(a) * rx;
                    const py = Math.sin(a) * ry;
                    if (i === 0) p.moveTo(px, py);
                    else p.lineTo(px, py);
                }
                p.closePath();
                return p;
            };
            const makeBottle = () => {
                const p = new Path2D();
                const bw = 9, bh = 13, neck = 4;
                // 瓶颈
                p.moveTo(-neck/2, -bh/2 + 3);
                p.lineTo(-neck/2, -bh/2 + 1);
                p.lineTo(neck/2, -bh/2 + 1);
                p.lineTo(neck/2, -bh/2 + 3);
                // 瓶身右侧
                p.lineTo(bw/2, bh/2 - 2);
                p.quadraticCurveTo(bw/2, bh/2, bw/2 - 2, bh/2);
                // 瓶底
                p.lineTo(-bw/2 + 2, bh/2);
                p.quadraticCurveTo(-bw/2, bh/2, -bw/2, bh/2 - 2);
                p.closePath();
                return p;
            };
            this.crystalPaths = {
                green: makeHex(),
                blue: makeHex(),
                red: makeHex(),
                hp: makeBottle(),
                mana: makeBottle(),
            };
        }
        const crystalColors = { green: '#4ade80', blue: '#60a5fa', red: '#f87171' };
        const pickupColors = { hp: '#f87171', mana: '#60a5fa' };
        // 按颜色/类型分桶
        const buckets = { green: [], blue: [], red: [], hp: [], mana: [] };
        for (const c of this.crystals) {
            const key = c.kind === 'crystal' ? c.color : c.kind;
            if (buckets[key]) buckets[key].push(c);
        }
        for (const col of ['green', 'blue', 'red', 'hp', 'mana']) {
            const list = buckets[col];
            if (!list || list.length === 0) continue;
            ctx.fillStyle = pickupColors[col] || crystalColors[col];
            for (const c of list) {
                const rot = c.rot || 0;
                // setTransform 省 save/translate/rotate/restore 4 个状态切换
                ctx.setTransform(Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), c.x, c.y);
                ctx.fill(this.crystalPaths[col]);
                // 瓶子加白色描边, 更好辨认
                if (col === 'hp' || col === 'mana') {
                    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                    ctx.lineWidth = 1;
                    ctx.stroke(this.crystalPaths[col]);
                }
            }
        }
        // 恢复 transform 到循环前状态 (含屏幕震动, 不影响后续 _drawEnemy / _drawPlayer)
        ctx.restore();

        // 敌人
        for (const e of this.enemies) {
            this._drawEnemy(e);
        }

        // 敌人子弹 (程序化发光圆, 红色/紫色保留)
        for (const b of this.enemyBullets) {
            ctx.fillStyle = b.color;
            ctx.shadowColor = b.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // 玩家子弹 (5 种 sprite + 融合弹金色圆)
        for (const b of this.playerBullets) {
            const baseType = (b.type || '').replace('_fused', '');
            const spriteKey = 'bullet-' + baseType;
            const img = this._sprite(spriteKey);
            if (img && BULLET_KEYS.includes(baseType)) {
                // sprite 渲染
                const ang = Math.atan2(b.vy, b.vx);
                const size = 22;
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.rotate(ang);
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
                ctx.restore();
            } else {
                // 融合弹 (A/S) 保留金色发光圆
                ctx.fillStyle = b.color;
                ctx.shadowColor = b.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // 特效
        for (const e of this.effects) {
            const t = 1 - e.life / e.maxLife;
            if (e.type === 'explode') {
                ctx.strokeStyle = e.color;
                ctx.globalAlpha = 1 - t;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r * (0.5 + t * 0.8), 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (e.type === 'enemyDeath') {
                ctx.fillStyle = e.color;
                ctx.globalAlpha = 1 - t;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r * (1 + t), 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else if (e.type === 'bombMarker') {
                // 定点轰炸标记: 方格闪烁 + 十字
                ctx.strokeStyle = e.color;
                ctx.globalAlpha = 0.3 + Math.sin(t * Math.PI * 4) * 0.3;
                ctx.lineWidth = 3;
                const half = e.r || 30;
                ctx.strokeRect(e.x - half, e.y - half, half * 2, half * 2);
                ctx.beginPath();
                ctx.moveTo(e.x - half, e.y); ctx.lineTo(e.x + half, e.y);
                ctx.moveTo(e.x, e.y - half); ctx.lineTo(e.x, e.y + half);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        // 玩家
        this._drawPlayer();

        // 粒子 (死亡碎片/火花/飘雪?)
        this._drawParticles();

        // 浮动文字
        for (const t of this.floatingTexts) {
            ctx.globalAlpha = t.life / t.maxLife;
            ctx.fillStyle = t.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(t.text, t.x, t.y);
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // HUD 更新（每帧）
        this._updateHUD();
    }

    // ─── 雪原背景 ───
    _drawBackground() {
        const ctx = this.ctx;
        const W = this.W, H = this.H;
        const wallW = this.wallW;
        const tileSize = this.groundTileSize;

        // ── Lazy init: 地面 tile (offscreen) + 两侧墙 (offscreen) ──
        if (!this.groundTile) {
            // 单格 60x60, 含接缝高光 + 内部小雪点
            const t = document.createElement('canvas');
            t.width = t.height = tileSize;
            const tctx = t.getContext('2d');
            // 底色 (比墙亮一档, 区分)
            tctx.fillStyle = '#102a44';
            tctx.fillRect(0, 0, tileSize, tileSize);
            // 中心微亮 (让 tile 内部比边缘稍亮)
            tctx.fillStyle = 'rgba(186, 230, 253, 0.05)';
            tctx.fillRect(2, 2, tileSize - 4, tileSize - 4);
            // 顶 + 左 高光 (冰蓝)
            tctx.strokeStyle = 'rgba(125, 211, 252, 0.4)';
            tctx.lineWidth = 1;
            tctx.beginPath();
            tctx.moveTo(0.5, 0.5); tctx.lineTo(tileSize - 0.5, 0.5);
            tctx.moveTo(0.5, 0.5); tctx.lineTo(0.5, tileSize - 0.5);
            tctx.stroke();
            // 底 + 右 阴影 (深冰蓝)
            tctx.strokeStyle = 'rgba(2, 132, 199, 0.3)';
            tctx.beginPath();
            tctx.moveTo(0.5, tileSize - 0.5); tctx.lineTo(tileSize - 0.5, tileSize - 0.5);
            tctx.moveTo(tileSize - 0.5, 0.5); tctx.lineTo(tileSize - 0.5, tileSize - 0.5);
            tctx.stroke();
            // 内部小雪点 (deterministic 几个, 让 tile 有细节不单调)
            tctx.fillStyle = 'rgba(224, 242, 254, 0.5)';
            const dots = [[14, 22, 2], [38, 12, 2], [28, 42, 2], [48, 32, 2], [10, 48, 2], [44, 50, 2]];
            for (const [dx, dy, r] of dots) {
                tctx.fillRect(dx, dy, r, r);
            }
            this.groundTile = t;
            this.groundPattern = ctx.createPattern(t, 'repeat');
        }

        // ── 静态层: 渐变 + 两侧墙 (offscreen 缓存, 只画一次) ──
        if (!this.bgCanvas) {
            this.bgCanvas = document.createElement('canvas');
            this.bgCanvas.width = W;
            this.bgCanvas.height = H;
            const bctx = this.bgCanvas.getContext('2d');
            // 渐变底色 (深雪夜) — 整屏, 墙和地都坐落其上
            const grad = bctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#0a1929');
            grad.addColorStop(1, '#0c1a2e');
            bctx.fillStyle = grad;
            bctx.fillRect(0, 0, W, H);

            // 左侧墙
            bctx.fillStyle = '#0a1929';
            bctx.fillRect(0, 0, wallW, H);
            // 墙内竖向接缝 (错位砖块效果)
            bctx.strokeStyle = 'rgba(2, 132, 199, 0.5)';
            bctx.lineWidth = 1;
            bctx.beginPath();
            for (let y = 0; y < H; y += 60) {
                bctx.moveTo(8, y); bctx.lineTo(8, y + 28);
                bctx.moveTo(24, y + 30); bctx.lineTo(24, y + 60);
            }
            bctx.stroke();
            // 墙右侧高光 (朝中间亮)
            const wallHL = bctx.createLinearGradient(wallW - 4, 0, wallW, 0);
            wallHL.addColorStop(0, 'rgba(125, 211, 252, 0)');
            wallHL.addColorStop(1, 'rgba(125, 211, 252, 0.6)');
            bctx.fillStyle = wallHL;
            bctx.fillRect(wallW - 4, 0, 4, H);
            // 墙顶/底 装饰线
            bctx.strokeStyle = 'rgba(125, 211, 252, 0.4)';
            bctx.lineWidth = 1;
            bctx.beginPath();
            bctx.moveTo(0, 0.5); bctx.lineTo(wallW, 0.5);
            bctx.moveTo(0, H - 0.5); bctx.lineTo(wallW, H - 0.5);
            bctx.stroke();

            // 右侧墙 (镜像)
            bctx.fillStyle = '#0a1929';
            bctx.fillRect(W - wallW, 0, wallW, H);
            bctx.strokeStyle = 'rgba(2, 132, 199, 0.5)';
            bctx.lineWidth = 1;
            bctx.beginPath();
            for (let y = 0; y < H; y += 60) {
                bctx.moveTo(W - 8, y); bctx.lineTo(W - 8, y + 28);
                bctx.moveTo(W - 24, y + 30); bctx.lineTo(W - 24, y + 60);
            }
            bctx.stroke();
            const wallHR = bctx.createLinearGradient(W - wallW, 0, W - wallW + 4, 0);
            wallHR.addColorStop(0, 'rgba(125, 211, 252, 0.6)');
            wallHR.addColorStop(1, 'rgba(125, 211, 252, 0)');
            bctx.fillStyle = wallHR;
            bctx.fillRect(W - wallW, 0, 4, H);
            bctx.strokeStyle = 'rgba(125, 211, 252, 0.4)';
            bctx.lineWidth = 1;
            bctx.beginPath();
            bctx.moveTo(W - wallW, 0.5); bctx.lineTo(W, 0.5);
            bctx.moveTo(W - wallW, H - 0.5); bctx.lineTo(W, H - 0.5);
            bctx.stroke();
        }
        // 每帧 blit 静态层
        ctx.drawImage(this.bgCanvas, 0, 0);

        // ── 动态层: 中间滚动地面 (createPattern + translate, 1 次 fill 即可) ──
        // scrollY 单调增, modulo 让 translate 永在 [0, tileSize) 内, 视觉无缝
        const middleX = wallW;
        const middleW = W - 2 * wallW;
        ctx.save();
        ctx.translate(0, this.scrollY % tileSize);
        ctx.fillStyle = this.groundPattern;
        // 上下各多画一格, 防止滚出视野
        ctx.fillRect(middleX, -tileSize, middleW, H + tileSize);
        ctx.restore();

        // ── 飘雪 (动态层, 批 fill 优化) ──
        // 远景: 50 个一起 beginPath + 1 次 fill (减少 fillStyle/beginPath 切换)
        ctx.fillStyle = 'rgba(186, 230, 253, 0.4)';
        ctx.beginPath();
        for (const s of this.snowFar) {
            ctx.moveTo(s.x + s.r, s.y);
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        }
        ctx.fill();
        // 近景: 30 个一起
        ctx.fillStyle = 'rgba(224, 242, 254, 0.75)';
        ctx.beginPath();
        for (const s of this.snowNear) {
            ctx.moveTo(s.x + s.r, s.y);
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        }
        ctx.fill();

        // ── PAUSED 遮罩 (在飘雪之上, 半透明黑底 + 大字) ──
        if (this.paused && this.gameStarted) {
            ctx.fillStyle = 'rgba(10, 25, 41, 0.55)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#bae6fd';
            ctx.font = 'bold 64px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(125, 211, 252, 0.8)';
            ctx.shadowBlur = 24;
            ctx.fillText('PAUSED', W / 2, H / 2);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(224, 242, 254, 0.7)';
            ctx.font = '14px sans-serif';
            ctx.fillText('按 暂停 按钮继续', W / 2, H / 2 + 56);
        }
    }

    _drawPlayer() {
        const ctx = this.ctx;
        const p = this.player;
        const img = this._sprite('player');
        const size = 64;

        // 无敌闪烁
        if (p.invincible > 0 && Math.floor(p.invincible * 10) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        if (img) {
            // 朝向: dir 默认 (0, -1) 表示朝上, sprite 通常以 "上" 为正面
            const ang = Math.atan2(p.dirY, p.dirX) + Math.PI / 2;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(ang);
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
            ctx.restore();
        } else {
            // 降级: 冰蓝光球
            ctx.shadowColor = '#7dd3fc';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#bae6fd';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // 朝向指示 (白色短线, 即使有 sprite 也保留一点视觉提示)
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.dirX * p.r * 1.5, p.y + p.dirY * p.r * 1.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    _drawEnemy(e) {
        const ctx = this.ctx;
        const spriteKey = e.isBoss ? 'boss' : 'enemy-' + e.type;
        const img = this._sprite(spriteKey);
        const size = e.isBoss ? 128 : (e.isElite ? 88 : 44);

        if (img) {
            // 朝向玩家
            const ang = Math.atan2(e.dirY, e.dirX) + Math.PI / 2;
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(ang);
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
            ctx.restore();
        } else {
            // 降级: 发光圆
            ctx.shadowColor = e.color;
            ctx.shadowBlur = 8;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // 护盾 (冰蓝)
        if (e.shield > 0) {
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // 减速效果
        if (e.slowTimer > 0) {
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Boss 血条
        if (e.isBoss) {
            const bw = 80;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(e.x - bw / 2, e.y - e.r - 14, bw, 7);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(e.x - bw / 2, e.y - e.r - 14, bw * (e.hp / e.maxHp), 7);
        }

        // 精英标记
        if (e.isElite) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('★', e.x, e.y - e.r - 4);
        }
    }
}

// ─── 启动 ───
window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('survivorCanvas')) {
        window.survivorGame = new SurvivorGame();
    }
});

})();
