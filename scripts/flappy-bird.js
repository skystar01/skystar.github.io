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
        this.highScore = parseInt(localStorage.getItem('flappyHighScore') || '0');
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
                console.log('✅ Flask backend connected!');
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
            console.log('⚠️ Backend not connected, please start Flask server first');
            return;
        }
        this.aiMode = !this.aiMode;
        if (this.aiMode && !this.gameRunning) {
            this.start();
        }
        console.log(this.aiMode ? '🤖 AI Mode ON' : '👤 Manual Mode');
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
            localStorage.setItem('flappyHighScore', this.highScore.toString());
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

document.addEventListener('DOMContentLoaded', () => {
    const flappyGame = new FlappyBird('flappyCanvas');
    window.flappyGame = flappyGame;
});
