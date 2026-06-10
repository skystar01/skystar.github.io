class PlaneShooterGame {
    constructor() {
        this.W = 600;
        this.H = 400;
        
        this.gameRunning = true;
        this.score = 0;
        this.lives = 3;
        this.invincibleFrames = 0;
        this.invincibleDuration = 120;
        
        this.PLAYER_WIDTH = 32;
        this.PLAYER_HEIGHT = 32;
        this.player = {
            x: this.W/2 - this.PLAYER_WIDTH/2,
            y: this.H - 70,
            width: this.PLAYER_WIDTH,
            height: this.PLAYER_HEIGHT,
            speed: 1.5
        };
        
        this.shootCooldown = 0;
        this.SHOOT_DELAY_FRAMES = 30;
        
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.explosions = [];
        
        this.BULLET_W = 5;
        this.BULLET_H = 12;
        this.ENEMY_BULLET_W = 5;
        this.ENEMY_BULLET_H = 12;
        
        this.ENEMY_BASE_W = 36;
        this.ENEMY_BASE_H = 32;
        this.enemySpawnCounter = 0;
        this.enemySpawnDelay = 28;
        this.waveLevel = 1;
        
        this.powerUps = [];
        this.powerUpSpawnTimer = 0;
        this.powerUpSpawnInterval = 600;
        
        this.tempWeaponLevel = 0;
        this.tempWeaponTimer = 0;
        this.bulletHoming = false;
        this.bulletHomingTimer = 0;
        
        this.frame = 0;
        this.animationId = null;
        
        this.keys = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            ArrowDown: false,
            KeyA: false,
            KeyD: false,
            KeyW: false,
            KeyS: false,
            Space: false,
            KeyZ: false,
            KeyK: false
        };
        
        this.init();
    }
    
    init() {
        this.canvas = document.getElementById('planeCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.scoreSpan = document.getElementById('planeScoreValue');
        this.livesSpan = document.getElementById('planeLivesValue');
        this.restartBtn = document.getElementById('planeRestartButton');
        
        this.restartBtn.addEventListener('click', () => this.restartGame());
        
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        window.addEventListener('blur', () => this.resetKeys());
        
        this.initMobileControls();
        this.gameStarted = false;
        this.gameLoop();
    }
    
    updateUI() {
        this.scoreSpan.innerText = this.score;
        this.livesSpan.innerText = this.lives;
    }
    
    restartGame() {
        this.gameStarted = true;
        this.gameRunning = true;
        this.score = 0;
        this.lives = 3;
        this.invincibleFrames = 0;
        this.player.x = this.W/2 - this.PLAYER_WIDTH/2;
        this.player.y = this.H - 70;
        this.shootCooldown = 0;
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.explosions = [];
        this.powerUps = [];
        this.powerUpSpawnTimer = 0;
        this.tempWeaponLevel = 0;
        this.tempWeaponTimer = 0;
        this.bulletHoming = false;
        this.bulletHomingTimer = 0;
        this.enemySpawnCounter = 5;
        this.waveLevel = 1;
        this.enemySpawnDelay = 28;
        this.restartBtn.innerText = '🔄 重新起飞';
        this.updateUI();
    }
    
    spawnEnemy() {
        let dynamicDelay = Math.max(18, 32 - Math.floor(this.score / 400));
        this.enemySpawnDelay = dynamicDelay;
        
        let rand = Math.random();
        let type = 0;
        let specialChance = Math.min(0.5, 0.2 + Math.floor(this.score / 800) * 0.1);
        if(rand < specialChance) {
            type = 1;
        }
        
        let x = Math.random() * (this.W - this.ENEMY_BASE_W);
        let y = -this.ENEMY_BASE_H - Math.random() * 40;
        let hp = 1;
        let lastShootTime = Date.now() - Math.random() * 3000;
        this.enemies.push({
            x: x, y: y, w: this.ENEMY_BASE_W, h: this.ENEMY_BASE_H,
            hp: hp, type: type, lastShootTime: lastShootTime
        });
    }
    
    shootFromPlayer() {
        if(!this.gameRunning) return;
        
        let level = this.getWeaponLevel();
        let centerX = this.player.x + this.PLAYER_WIDTH/2;
        let y = this.player.y - 8;
        
        if(level === 1) {
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 0
            });
        } else if(level === 2) {
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2 - 10,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 0
            });
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2 + 10,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 0
            });
        } else if(level === 3) {
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 0
            });
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2 - 12,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: -0.3
            });
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2 + 12,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 0.3
            });
        } else {
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 0
            });
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: -0.6
            });
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 0.6
            });
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: -1.4
            });
            this.playerBullets.push({
                x: centerX - this.BULLET_W/2,
                y: y,
                w: this.BULLET_W,
                h: this.BULLET_H,
                active: true,
                vx: 1.4
            });
        }
    }
    
    getWeaponLevel() {
        let baseLevel = 1;
        if(this.score >= 10000) baseLevel = 4;
        else if(this.score >= 3000) baseLevel = 3;
        else if(this.score >= 500) baseLevel = 2;
        
        return Math.max(baseLevel, this.tempWeaponLevel);
    }
    
    createPowerUp(type) {
        let colors = {
            shield: '#ffd700',
            weapon: '#4dabf7',
            life: '#51cf66',
            homing: '#be4bdb'
        };
        let icons = {
            shield: '🛡️',
            weapon: '⚡',
            life: '❤️',
            homing: '🎯'
        };
        
        this.powerUps.push({
            x: Math.random() * (this.W - 30) + 15,
            y: -30,
            w: 25,
            h: 25,
            speed: 1 + Math.random() * 0.5,
            type: type,
            color: colors[type],
            icon: icons[type],
            rotation: 0,
            rotationSpeed: (Math.random() - 0.5) * 0.1
        });
    }
    
    spawnPowerUpGroup() {
        if(!this.gameRunning) return;
        
        let availableTypes = ['shield', 'life', 'homing'];
        let currentLevel = this.getWeaponLevel();
        if(currentLevel < 4) {
            availableTypes.push('weapon');
        }
        
        let type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        this.createPowerUp(type);
        
        if(Math.random() < 0.25) {
            this.pendingPowerUp = {
                type: availableTypes[Math.floor(Math.random() * availableTypes.length)],
                spawnTime: Date.now() + 3000
            };
        }
    }
    
    checkPendingPowerUp() {
        if(this.pendingPowerUp && Date.now() >= this.pendingPowerUp.spawnTime) {
            this.createPowerUp(this.pendingPowerUp.type);
            this.pendingPowerUp = null;
        }
    }
    
    applyPowerUp(powerUp) {
        let now = Date.now();
        switch(powerUp.type) {
            case 'shield':
                this.invincibleFrames = 180;
                this.invincibleDuration = 180;
                break;
            case 'weapon':
                this.tempWeaponLevel = Math.min(4, this.getWeaponLevel() + 1);
                this.tempWeaponTimer = now + 10000;
                break;
            case 'life':
                if(this.lives < 3) {
                    this.lives++;
                    this.updateUI();
                }
                break;
            case 'homing':
                this.bulletHoming = true;
                this.bulletHomingTimer = now + 10000;
                break;
        }
    }
    
    createExplosion(x, y) {
        // 限制同时存在的爆炸数量最多2个，防止堆积
        if (this.explosions.length >= 2) {
            this.explosions.shift();
        }

        const sparkColors = ['#ff6b6b', '#ffd93d', '#ff9f43', '#ff4757', '#ffa502'];
        const smokeColors = ['#2d3436', '#636e72', '#4a4a4a'];
        const glowColors  = ['#ffffff', '#ffeaa7', '#fab1a0'];

        const particles = [];
        // 20个火花
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 2 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 3,
                life: 1,
                decay: 0.025 + Math.random() * 0.015,
                color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
                type: 'spark'
            });
        }
        // 15个烟雾
        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2 + Math.random() * 0.5;
            const speed = 1 + Math.random() * 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 6 + Math.random() * 4,
                life: 1,
                decay: 0.02 + Math.random() * 0.01,
                color: smokeColors[Math.floor(Math.random() * smokeColors.length)],
                type: 'smoke'
            });
        }
        // 8个辉光
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const speed = 3 + Math.random() * 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                size: 3 + Math.random() * 2,
                life: 1,
                decay: 0.03 + Math.random() * 0.02,
                color: glowColors[Math.floor(Math.random() * glowColors.length)],
                type: 'glow'
            });
        }

        this.explosions.push({
            particles: particles,
            flashAlpha: 0.8,
            flashX: x,
            flashY: y
        });
    }
    
    enemyShoot(e) {
        if(!this.gameRunning) return;
        
        let bulletX = e.x + e.w/2 - this.ENEMY_BULLET_W/2;
        let bulletY = e.y + e.h/2;
        
        let playerCenterX = this.player.x + this.PLAYER_WIDTH/2;
        let playerCenterY = this.player.y + this.PLAYER_HEIGHT/2;
        
        let dx = playerCenterX - (bulletX + this.ENEMY_BULLET_W/2);
        let dy = playerCenterY - bulletY;
        
        let distance = Math.sqrt(dx * dx + dy * dy);
        if(distance > 0) {
            dx /= distance;
            dy /= distance;
        }
        
        let speed = 1.5;
        this.enemyBullets.push({
            x: bulletX,
            y: bulletY,
            w: this.ENEMY_BULLET_W,
            h: this.ENEMY_BULLET_H,
            vx: dx * speed,
            vy: Math.max(dy * speed, 0.8)
        });
    }
    
    rectCollide(r1, r2) {
        return !(r2.x > r1.x + r1.w ||
            r2.x + r2.w < r1.x ||
            r2.y > r1.y + r1.h ||
            r2.y + r2.h < r1.y);
    }
    
    updateGame() {
        if(!this.gameRunning) return;
        
        let now = Date.now();
        
        if(this.invincibleFrames > 0) {
            this.invincibleFrames--;
        }
        
        if(this.tempWeaponTimer > 0 && now >= this.tempWeaponTimer) {
            this.tempWeaponLevel = 0;
            this.tempWeaponTimer = 0;
        }
        
        if(this.bulletHomingTimer > 0 && now >= this.bulletHomingTimer) {
            this.bulletHoming = false;
            this.bulletHomingTimer = 0;
        }
        
        if(this.powerUpSpawnTimer === 0) {
            this.powerUpSpawnTimer = now;
            this.powerUpSpawnInterval = 10000 + Math.random() * 5000;
        }
        
        if(now - this.powerUpSpawnTimer >= this.powerUpSpawnInterval) {
            this.spawnPowerUpGroup();
            this.powerUpSpawnTimer = now;
            this.powerUpSpawnInterval = 10000 + Math.random() * 5000;
        }
        
        this.checkPendingPowerUp();
        
        for(let i=0; i<this.powerUps.length; i++) {
            let p = this.powerUps[i];
            p.y += p.speed;
            p.rotation += p.rotationSpeed;
            
            if(p.y > this.H + 50) {
                this.powerUps.splice(i, 1);
                i--;
                continue;
            }
            
            if(this.rectCollide(p, {x:this.player.x, y:this.player.y, w:this.PLAYER_WIDTH, h:this.PLAYER_HEIGHT})) {
                this.applyPowerUp(p);
                this.powerUps.splice(i, 1);
                i--;
            }
        }
        
        let moveX = 0;
        let moveY = 0;
        if(this.keys.ArrowLeft || this.keys.KeyA) moveX = -1;
        if(this.keys.ArrowRight || this.keys.KeyD) moveX = 1;
        if(this.keys.ArrowUp || this.keys.KeyW) moveY = -1;
        if(this.keys.ArrowDown || this.keys.KeyS) moveY = 1;
        
        let newX = this.player.x + moveX * this.player.speed;
        let newY = this.player.y + moveY * this.player.speed;
        
        if(newX >= 0 && newX + this.PLAYER_WIDTH <= this.W) {
            this.player.x = newX;
        }
        if(newY >= 0 && newY + this.PLAYER_HEIGHT <= this.H) {
            this.player.y = newY;
        }
        
        this.shootCooldown--;
        if(this.shootCooldown <= 0 && this.gameRunning) {
            this.shootFromPlayer();
            this.shootCooldown = this.SHOOT_DELAY_FRAMES;
        }
        
        for(let i=0; i<this.playerBullets.length; i++) {
            let b = this.playerBullets[i];
            
            if(this.bulletHoming && this.enemies.length > 0) {
                let nearestEnemy = null;
                let nearestDist = Infinity;
                for(let e of this.enemies) {
                    let dist = Math.sqrt(
                        Math.pow(e.x + e.w/2 - (b.x + b.w/2), 2) +
                        Math.pow(e.y + e.h/2 - (b.y + b.h/2), 2)
                    );
                    if(dist < nearestDist) {
                        nearestDist = dist;
                        nearestEnemy = e;
                    }
                }
                if(nearestEnemy) {
                    let dx = nearestEnemy.x + nearestEnemy.w/2 - (b.x + b.w/2);
                    let dy = nearestEnemy.y + nearestEnemy.h/2 - (b.y + b.h/2);
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if(dist > 0) {
                        dx /= dist;
                        dy /= dist;
                    }
                    b.x += dx * 1;
                    b.y += dy * 2.8;
                } else {
                    b.y -= 2.8;
                    if(b.vx) b.x += b.vx;
                }
            } else {
                b.y -= 2.8;
                if(b.vx) b.x += b.vx;
            }
            
            if(b.y + b.h < 0 || b.y > this.H || b.x < -10 || b.x > this.W + 10) {
                this.playerBullets.splice(i,1);
                i--;
                continue;
            }
            let hit = false;
            for(let j=0; j<this.enemies.length; j++) {
                let e = this.enemies[j];
                if(this.rectCollide(b, e)) {
                    e.hp -= 1;
                    hit = true;
                    if(e.hp <= 0) {
                        this.createExplosion(e.x + e.w/2, e.y + e.h/2);
                        this.score += 10;
                        this.updateUI();
                        this.enemies.splice(j,1);
                        j--;
                    }
                    break;
                }
            }
            if(hit) {
                this.playerBullets.splice(i,1);
                i--;
            }
        }
        
        if(this.gameStarted) {
            for(let i=0; i<this.enemies.length; i++) {
                let e = this.enemies[i];
                let baseSpeed = 0.2 + Math.min(0.6, this.score / 3000);
                e.y += baseSpeed;
                
                if(e.y + e.h > this.H + 80 || e.y + e.h < -100) {
                    this.enemies.splice(i,1);
                    i--;
                    continue;
                }
                
                if(e.type === 1 && this.gameRunning) {
                    let now = Date.now();
                    if(now - (e.lastShootTime || 0) >= 4000) {
                        this.enemyShoot(e);
                        e.lastShootTime = now;
                    }
                } else if(e.type === 0 && this.gameRunning){
                    let now = Date.now();
                    if(now - (e.lastShootTime || 0) >= 2500) {
                        this.enemyShoot(e);
                        e.lastShootTime = now;
                    }
                }
            }
            
            for(let i=0; i<this.enemyBullets.length; i++) {
                let eb = this.enemyBullets[i];
                if(eb.vx) eb.x += eb.vx;
                if(eb.vy) eb.y += eb.vy;
                if(eb.y + eb.h < 0 || eb.y > this.H + 100 || eb.x < -20 || eb.x > this.W + 20) {
                    this.enemyBullets.splice(i,1);
                    i--;
                    continue;
                }
                if(this.rectCollide(eb, {x:this.player.x, y:this.player.y, w:this.PLAYER_WIDTH, h:this.PLAYER_HEIGHT})) {
                    if(this.invincibleFrames <= 0 && this.gameRunning) {
                        this.lives--;
                        this.updateUI();
                        if(this.lives <= 0) {
                            this.gameRunning = false;
                            this.restartBtn.innerText = '🔄 重新起飞';
                        } else {
                            this.invincibleFrames = this.invincibleDuration;
                        }
                    }
                    this.enemyBullets.splice(i,1);
                    i--;
                }
            }
            
            for(let i=0; i<this.enemies.length; i++) {
                let e = this.enemies[i];
                if(this.rectCollide({x:this.player.x, y:this.player.y, w:this.PLAYER_WIDTH, h:this.PLAYER_HEIGHT}, e)) {
                    if(this.invincibleFrames <= 0 && this.gameRunning) {
                        this.lives--;
                        this.updateUI();
                        if(this.lives <= 0) {
                            this.gameRunning = false;
                            this.restartBtn.innerText = '🔄 重新起飞';
                        } else {
                            this.invincibleFrames = this.invincibleDuration;
                        }
                        this.enemies.splice(i,1);
                        i--;
                    } else {
                        this.enemies.splice(i,1);
                        i--;
                    }
                }
            }
            
            let maxEnemies = 5 + Math.min(9, Math.floor(this.score / 500));
            
            if(this.enemySpawnCounter <= 0) {
                if(this.enemies.length < maxEnemies) {
                    this.spawnEnemy();
                }
                let dynamic = Math.max(30, this.enemySpawnDelay + (Math.random() * 10 - 5));
                this.enemySpawnCounter = Math.floor(dynamic);
            } else {
                this.enemySpawnCounter--;
            }
            
            if(this.score > 500 && this.enemySpawnDelay > 25) {
                this.enemySpawnDelay = Math.max(20, this.enemySpawnDelay - 0.01);
            }
        }
        
        for (let i = 0; i < this.explosions.length; i++) {
            const exp = this.explosions[i];
            // 更新粒子并移除生命值耗尽的粒子
            for (let j = 0; j < exp.particles.length; j++) {
                const p = exp.particles[j];
                p.x += p.vx;
                p.y += p.vy;
                p.life -= p.decay;
                p.vx *= 0.96;
                p.vy *= 0.96;
                if (p.type === 'smoke') {
                    p.vy -= 0.1;
                    p.size += 0.1;
                }
                if (p.life <= 0) {
                    exp.particles.splice(j, 1);
                    j--;
                }
            }
            let alive = exp.particles.length > 0;
            if (exp.flashAlpha > 0) alive = true;
            if (!alive) {
                this.explosions.splice(i, 1);
                i--;
            }
        }
    }
    
    drawStars() {
        for(let i=0; i<300; i++) {
            if(i%2 === 0) continue;
            let sx = (i * 131) % this.W;
            let sy = (i * 253 + this.frame) % this.H;
            this.ctx.fillStyle = `rgba(255,240,200,${0.3+Math.sin(this.frame*0.02+i)*0.2})`;
            this.ctx.fillRect(sx, sy, 1.5, 1.5);
        }
        for(let i=0;i<150;i++){
            let x = (i*997 + this.frame*2)%this.W;
            let y = (i*367)%this.H;
            this.ctx.fillStyle = `rgba(255,200,100,0.6)`;
            this.ctx.fillRect(x, y, 1, 1);
        }
    }
    
    drawPlayer() {
        let px = this.player.x, py = this.player.y;
        let drawSolid = true;
        if(this.invincibleFrames > 0 && (Math.floor(Date.now() / 50) % 3 === 0)) {
            drawSolid = false;
        }
        if(!drawSolid) {
            this.ctx.globalAlpha = 0.6;
        }
        
        if(this.invincibleFrames > 0) {
            let pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
            this.ctx.beginPath();
            this.ctx.arc(px + this.PLAYER_WIDTH/2, py + this.PLAYER_HEIGHT/2, Math.max(this.PLAYER_WIDTH, this.PLAYER_HEIGHT)/2 + 10, 0, Math.PI*2);
            this.ctx.strokeStyle = `rgba(255, 215, 0, ${pulse * 0.5})`;
            this.ctx.lineWidth = 3;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = "#ffd700";
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;
        }
        
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = "#2affcc";
        
        this.ctx.beginPath();
        this.ctx.moveTo(px + this.PLAYER_WIDTH/2, py);
        this.ctx.lineTo(px + this.PLAYER_WIDTH-6, py + this.PLAYER_HEIGHT-6);
        this.ctx.lineTo(px + this.PLAYER_WIDTH/2, py + this.PLAYER_HEIGHT-2);
        this.ctx.lineTo(px + 6, py + this.PLAYER_HEIGHT-6);
        this.ctx.fillStyle = "#7df9ff";
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.moveTo(px + this.PLAYER_WIDTH/2, py+4);
        this.ctx.lineTo(px + this.PLAYER_WIDTH-10, py + this.PLAYER_HEIGHT-8);
        this.ctx.lineTo(px + this.PLAYER_WIDTH/2, py + this.PLAYER_HEIGHT-4);
        this.ctx.lineTo(px + 10, py + this.PLAYER_HEIGHT-8);
        this.ctx.fillStyle = "#42e0ff";
        this.ctx.fill();
        
        this.ctx.fillStyle = "#ffd966";
        this.ctx.fillRect(px+4, py+14, 6, 8);
        this.ctx.fillRect(px+this.PLAYER_WIDTH-10, py+14, 6, 8);
        
        this.ctx.fillStyle = "orange";
        this.ctx.fillRect(px+this.PLAYER_WIDTH/2-3, py+4, 6, 8);
        
        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;
    }
    
    drawEnemy(e) {
        if(e.type === 0) {
            this.ctx.fillStyle = "#e34d4d";
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = "red";
            this.ctx.fillRect(e.x, e.y, e.w, e.h);
            this.ctx.fillStyle = "#b02c2c";
            this.ctx.fillRect(e.x+4, e.y+6, e.w-8, 6);
            this.ctx.fillStyle = "#ff7777";
            this.ctx.beginPath();
            this.ctx.ellipse(e.x+e.w/2, e.y+12, 8, 6, 0, 0, Math.PI*2);
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = "#b76eff";
            this.ctx.shadowColor = "#c05eff";
            this.ctx.fillRect(e.x, e.y, e.w, e.h);
            this.ctx.fillStyle = "#862dff";
            this.ctx.fillRect(e.x+6, e.y+8, e.w-12, 6);
            this.ctx.fillStyle = "#f4c2ff";
            this.ctx.beginPath();
            this.ctx.arc(e.x+e.w/2, e.y+e.h-12, 8, 0, Math.PI*2);
            this.ctx.fill();
            this.ctx.fillStyle = "#ffa500";
            this.ctx.fillRect(e.x+e.w/2-3, e.y+e.h-6, 6, 10);
        }
        this.ctx.shadowBlur = 0;
        
        this.ctx.fillStyle = "white";
        this.ctx.fillRect(e.x+e.w*0.2, e.y+8, 6, 6);
        this.ctx.fillRect(e.x+e.w*0.7, e.y+8, 6, 6);
        this.ctx.fillStyle = "#020202";
        this.ctx.fillRect(e.x+e.w*0.2+2, e.y+9, 3, 3);
        this.ctx.fillRect(e.x+e.w*0.7+2, e.y+9, 3, 3);
    }
    
    drawBullets() {
        for(let b of this.playerBullets) {
            this.ctx.fillStyle = "#ffdf70";
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = "gold";
            this.ctx.fillRect(b.x, b.y, b.w, b.h);
            this.ctx.fillStyle = "#ffb347";
            this.ctx.fillRect(b.x+1, b.y+2, b.w-2, b.h-4);
        }
        for(let eb of this.enemyBullets) {
            this.ctx.save();
            
            let angle = Math.atan2(eb.vy || 1, eb.vx || 0);
            
            let centerX = eb.x + eb.w/2;
            let centerY = eb.y + eb.h/2;
            
            this.ctx.translate(centerX, centerY);
            this.ctx.rotate(angle);
            
            this.ctx.fillStyle = "#ff3a6f";
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = "#ff0066";
            
            this.ctx.beginPath();
            this.ctx.moveTo(eb.w/2, 0);
            this.ctx.lineTo(-eb.w/2, -eb.h/2);
            this.ctx.lineTo(-eb.w/3, 0);
            this.ctx.lineTo(-eb.w/2, eb.h/2);
            this.ctx.closePath();
            this.ctx.fill();
            
            this.ctx.fillStyle = "#ff8cae";
            this.ctx.beginPath();
            this.ctx.moveTo(eb.w/2 - 2, 0);
            this.ctx.lineTo(-eb.w/4, -eb.h/3);
            this.ctx.lineTo(-eb.w/4, eb.h/3);
            this.ctx.closePath();
            this.ctx.fill();
            
            this.ctx.restore();
        }
        this.ctx.shadowBlur = 0;
    }
    
    drawExplosions() {
        const ctx = this.ctx;
        for (const exp of this.explosions) {
            // 闪光效果：两层简单圆形，无渐变无阴影
            if (exp.flashAlpha > 0) {
                ctx.beginPath();
                ctx.arc(exp.flashX, exp.flashY, 35 * exp.flashAlpha, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 220, 150, ${exp.flashAlpha * 0.7})`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(exp.flashX, exp.flashY, 20 * exp.flashAlpha, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 100, 50, ${exp.flashAlpha * 0.5})`;
                ctx.fill();
                exp.flashAlpha -= 0.08;
            }

            for (const p of exp.particles) {
                if (p.life <= 0) continue;

                const size = (p.size || 3) * p.life;
                ctx.globalAlpha = p.life;

                if (p.type === 'spark') {
                    // 火花改用矩形，性能远优于 arc + 阴影
                    ctx.fillStyle = p.color;
                    ctx.fillRect(p.x - size/2, p.y - size/2, size, size);
                    // 内层高光
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.fillRect(p.x - size/4, p.y - size/4, size/2, size/2);
                } else if (p.type === 'smoke') {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 1.2, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(40, 40, 40, ${p.life * 0.5})`;
                    ctx.fill();
                } else if (p.type === 'glow') {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = p.color;
                    ctx.fill();
                    // 外发光模拟（无阴影，用半透明大圆）
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 1.6, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 200, ${p.life * 0.4})`;
                    ctx.fill();
                }
            }
        }
        ctx.globalAlpha = 1;
    }
    
    drawHUDinfo() {
        this.ctx.font = "bold 22px 'Courier New'";
        this.ctx.fillStyle = "#bfffc2";
        this.ctx.shadowBlur = 0;
        if(!this.gameRunning) {
            this.ctx.font = "bold 38px monospace";
            this.ctx.fillStyle = "#ff6680";
            this.ctx.shadowColor = "black";
            this.ctx.fillText("💀 GAME OVER 💀", this.W/2-140, this.H/2-50);
            this.ctx.font = "bold 18px monospace";
            this.ctx.fillStyle = "#ddddaa";
            this.ctx.fillText("点击「重新起飞」继续征战星河", this.W/2-150, this.H/2+40);
        }
        if(this.invincibleFrames > 0) {
            this.ctx.font = "bold 16px monospace";
            this.ctx.fillStyle = "#9effcf";
            this.ctx.fillText("✨ 护盾激活 ✨", this.player.x-10, this.player.y-12);
        }
    }
    
    drawBackgroundGrid() {
        this.ctx.fillStyle = "#020218";
        this.ctx.fillRect(0,0,this.W,this.H);
        for(let i=0;i<this.W+30;i+=40){
            this.ctx.beginPath();
            this.ctx.strokeStyle = "#2affaa22";
            this.ctx.lineWidth = 0.5;
            this.ctx.moveTo(i,0);
            this.ctx.lineTo(i+ (this.frame%40)*0.3, this.H);
            this.ctx.stroke();
        }
    }
    
    drawScene() {
        this.drawBackgroundGrid();
        this.drawStars();
        for(let e of this.enemies) this.drawEnemy(e);
        this.drawBullets();
        this.drawPlayer();
        this.drawPowerUps();
        this.drawExplosions();
        this.drawHUDinfo();
        
        this.ctx.font = "12px monospace";
        this.ctx.fillStyle = "#66ffccaa";
        this.ctx.fillText("经典弹幕 · 火力全开", this.W-130, 30);
    }
    
    drawPowerUps() {
        for(let p of this.powerUps) {
            this.ctx.save();
            
            let centerX = p.x + p.w/2;
            let centerY = p.y + p.h/2;
            
            this.ctx.translate(centerX, centerY);
            this.ctx.rotate(p.rotation);
            
            let time = Date.now() / 500;
            let pulseScale = 1 + Math.sin(time) * 0.1;
            this.ctx.scale(pulseScale, pulseScale);
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, -p.h/2);
            this.ctx.lineTo(p.w/2, 0);
            this.ctx.lineTo(0, p.h/2);
            this.ctx.lineTo(-p.w/2, 0);
            this.ctx.closePath();
            
            this.ctx.fillStyle = p.color;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = p.color;
            this.ctx.fill();
            
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.font = "14px Arial";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillStyle = "white";
            this.ctx.shadowBlur = 0;
            this.ctx.fillText(p.icon, 0, 0);
            
            this.ctx.restore();
        }
    }
    
    gameLoop() {
        if(this.gameRunning) {
            this.updateGame();
        }
        this.drawScene();
        this.frame++;
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }
    
    handleKeyDown(e) {
        let code = e.code;
        if(this.keys.hasOwnProperty(code)) {
            this.keys[code] = true;
            e.preventDefault();
        }
        if(code === 'Space') {
            e.preventDefault();
        }
        if(code === 'KeyR') {
            e.preventDefault();
            this.restartGame();
        }
    }
    
    handleKeyUp(e) {
        let code = e.code;
        if(this.keys.hasOwnProperty(code)) {
            this.keys[code] = false;
            e.preventDefault();
        }
    }
    
    resetKeys() {
        for(let k in this.keys) this.keys[k] = false;
    }
    
    initMobileControls() {
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            let rect = this.canvas.getBoundingClientRect();
            let touchX = e.touches[0].clientX - rect.left;
            let newX = touchX - this.PLAYER_WIDTH/2;
            newX = Math.min(Math.max(newX, 0), this.W - this.PLAYER_WIDTH);
            if(this.gameRunning) this.player.x = newX;
        });
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if(this.gameRunning && this.shootCooldown === 0) {
                this.shootFromPlayer();
                this.shootCooldown = this.SHOOT_DELAY_FRAMES;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let _planeGameInstance = null;

    const startPlaneGame = () => {
        if (_planeGameInstance) {
            // 已有实例，直接重置而不是新建，避免多个 gameLoop 同时跑
            _planeGameInstance.restartGame();
        } else {
            _planeGameInstance = new PlaneShooterGame();
        }
    };
    window.startPlaneGame = startPlaneGame;
});