import { whenDomReady } from './dom-ready.js';
import { loadFlappyAi, predictAction } from './flappy-onnx.js';

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
        this.aiBackend = null;        // 'flask' | 'onnx' —— 记录当前 AI 走哪条推理通道
        this.aiLoading = null;        // ONNX 加载中的 Promise,防重复触发
        this.lastPassedPipe = null;
        this.backendUrl = 'http://127.0.0.1:5000';
        
        this.bgOffset = 0;
        this.groundOffset = 0;
        this.clouds = [];
        
        this.colors = {
            sky: '#1a2744',            // 深空暮色,贴合游戏中心舞台
            ground: '#3d2c1f',
            birdBody: '#fbbf24',
            birdBeak: '#ff6b35',
            pipeGreen: '#2dd4bf',
            pipeDark: '#0f766e',
            pipeBorder: '#115e59',
            cloud: 'rgba(148, 163, 184, 0.35)'
        };
        
        this.initClouds();
        this.bindEvents();
        this.checkBackend();
        this.draw();
    }
    
    async checkBackend() {
        // 仅在本地开发环境探测 Flask 后端。线上(GitHub Pages 等)127.0.0.1:5000
        // 必然不可达,若仍发起请求会在控制台留下毫无意义的 ERR_CONNECTION_REFUSED,
        // 因此非 localhost 直接跳过,留待按 A 时降级到浏览器端 ONNX。
        if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            this.aiModelLoaded = false;
            return;
        }
        try {
            const response = await fetch(`${this.backendUrl}/`);
            if (response.ok) {
                this.aiBackend = 'flask';
                this.aiModelLoaded = true;
            }
        } catch (error) {
            // 连不上 Flask 是常态(静态托管),留待按 A 时降级到 ONNX
            this.aiModelLoaded = false;
        }
    }

    // Flask 不在时的降级通道:加载浏览器端 ONNX 模型(仅首次有下载成本)
    async tryLoadOnnxAi() {
        if (this.aiLoading) return this.aiLoading;
        this.aiLoading = (async () => {
            try {
                if (typeof window.showToast === 'function') {
                    window.showToast('正在加载浏览器端 AI 模型(约 13MB,仅首次)…');
                }
                await loadFlappyAi();
                this.aiBackend = 'onnx';
                this.aiModelLoaded = true;
                if (typeof window.showToast === 'function') {
                    window.showToast('AI 就绪:浏览器本地推理,无需后端');
                }
            } catch (err) {
                console.error('ONNX 模型加载失败:', err);
                if (typeof window.showToast === 'function') {
                    window.showToast('AI 模型加载失败,请稍后再试');
                }
            }
        })();
        return this.aiLoading;
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
    
    async toggleAI() {
        if (!this.aiModelLoaded) {
            await this.tryLoadOnnxAi();          // Flask 不在时现场加载 ONNX
            if (!this.aiModelLoaded) return;
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

        // ─── 坐标系转换: browser raw → gymnasium obs ───────────────────────
        // 训练环境 (flappy_bird_gymnasium) obs space = Box(-1, 1), 12 维:
        //   [0-2]  下一根柱子: x/W, topY/H, botY/H          (绝对位置/屏宽高)
        //   [3-5]  再下一根柱子
        //   [6-8]  第三根 (浏览器只追踪两根,用占位值)
        //   [9]    鸟 y / H
        //   [10]   速度 (拍翅后 ≈ -0.9; gymnasium lift=-9, norm by 10)
        //   [11]   旋转 (拍翅后 ≈ 0.5; 值域翻转: upward=大)
        //
        // 浏览器 getGameState() 顺序:
        //   [0-2]  lastPassedPipe  ← 模型不用这个!
        //   [3-5]  nextPipe        ← 对应 gym[0-2]
        //   [6-8]  nextNextPipe    ← 对应 gym[3-5]
        //   [9]    birdY
        //   [10]   birdVel  (lift = -2.5)
        //   [11]   birdRot  (-π/6 upward, π/2 downward)
        const raw = this.getGameState();
        const W = this.width;      // 400
        const H = this.height;     // 600

        // 速度缩放: 使拍翅后速度 -2.5 映射到 gym 的 -0.9
        const VEL_SCALE = 0.9 / Math.abs(this.bird.lift); // = 0.9 / 2.5 = 0.36
        // 旋转: [-π/6, π/2] → [0.5, 0]  (上扬=0.5, 俯冲=0, 与 gym 一致)
        const rotNorm = r => (-r + Math.PI / 6) / (Math.PI / 2 + Math.PI / 6);

        const gymState = [
            raw[3] / W,  raw[4] / H,  raw[5] / H,   // gym[0-2]: nextPipe
            raw[6] / W,  raw[7] / H,  raw[8] / H,   // gym[3-5]: nextNextPipe
            1.0,         0.0,         1.0,            // gym[6-8]: 第三根占位(屏外=1)
            raw[9] / H,                               // gym[9]:   bird y
            raw[10] * VEL_SCALE,                      // gym[10]:  velocity
            rotNorm(raw[11]),                          // gym[11]:  rotation
        ];

        // ONNX 通道:纯浏览器推理,零网络开销
        if (this.aiBackend === 'onnx') {
            try {
                return await predictAction(gymState);
            } catch (error) {
                console.error('ONNX 推理失败:', error);
                return 0;
            }
        }

        // Flask 通道(本地开发): Flask 内部做 state/100,故乘回 100 再传
        try {
            const response = await fetch(`${this.backendUrl}/api/ai/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ state: gymState.map(v => v * 100) })
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
        
        if (this.aiBackend === 'flask') {
            this.ctx.fillStyle = '#44ff44';
            this.ctx.strokeText('AI 就绪 · Flask 推理', this.width / 2, this.height / 2 + 110);
            this.ctx.fillText('AI 就绪 · Flask 推理', this.width / 2, this.height / 2 + 110);
        } else if (this.aiBackend === 'onnx' || this.aiModelLoaded) {
            this.ctx.fillStyle = '#44ff44';
            this.ctx.strokeText('AI 就绪 · 浏览器本地推理', this.width / 2, this.height / 2 + 110);
            this.ctx.fillText('AI 就绪 · 浏览器本地推理', this.width / 2, this.height / 2 + 110);
        } else {
            this.ctx.fillStyle = '#a5b4fc';
            this.ctx.strokeText('按 A / 点「召唤 AI」加载模型', this.width / 2, this.height / 2 + 110);
            this.ctx.fillText('按 A / 点「召唤 AI」加载模型', this.width / 2, this.height / 2 + 110);
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
        // 深空暮色渐变底,比单色更贴舞台
        const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.height);
        skyGrad.addColorStop(0, '#0b1228');
        skyGrad.addColorStop(0.55, this.colors.sky);
        skyGrad.addColorStop(1, '#243055');
        this.ctx.fillStyle = skyGrad;
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
                aiStatus.innerHTML = '<i class="fas fa-robot"></i> AI 待召唤';
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
                aiButton.innerHTML = '<i class="fas fa-robot"></i> 召唤 AI 试玩';
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
        aiButton.addEventListener('click', async () => {
            // toggleAI 内部已处理降级:Flask 不在则现场加载浏览器端 ONNX 模型
            await flappyGame.toggleAI();
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

