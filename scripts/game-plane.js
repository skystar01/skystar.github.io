class PlaneShooterGame {
    constructor() {
        this.W = 1000;
        this.H = 600;

        this.gameRunning = true;
        this.gameStarted = false;
        this.score = 0;
        this.lives = 3;

        // === 时间系统（全部统一为秒） ===
        this.lastTime = 0;
        this.gameTime = 0;              // 游戏累计时间（秒）
        this.DT_CAP = 0.05;            // 最大帧间隔，防止切tab后跳帧

        // === 玩家 ===
        this.PLAYER_WIDTH = 45;
        this.PLAYER_HEIGHT = 45;
        this.PLAYER_SPEED = 240;       // px/s
        this.player = {
            x: this.W / 2 - 22,
            y: this.H - 90
        };

        // === 无敌 ===
        this.invincibleTimer = 0;      // 剩余秒数（被击后免伤）
        this.invincibleDuration = 3.0; // 被击后无敌时间
        this.shieldCount = 0;          // 护盾剩余次数（道具获得）
        this.maxShieldCount = 5;       // 护盾最大次数（道具护盾）

        // === 射击 ===
        this.shootTimer = 0;           // 剩余冷却秒数
        this.shootInterval = 0.33;     // 射击间隔（提速：0.5s→0.33s）

        // === 子弹 ===
        this.playerBullets = [];
        this.enemyBullets = [];
        this.BULLET_W = 5;
        this.BULLET_H = 12;
        this.BULLET_SPEED = 500;       // px/s（提速1.7x，弹幕更凌厉）
        this.ENEMY_BULLET_W = 5;
        this.ENEMY_BULLET_H = 12;
        this.ENEMY_BULLET_SPEED = 260;  // px/s（提速1.7x）

        // === 敌机 ===
        this.enemies = [];
        this.ENEMY_BASE_W = 50;
        this.ENEMY_BASE_H = 45;
        this.spawnTimer = 0.083;       // 首次生成延迟（原 5帧 / 60）
        this.waveLevel = 1;

        // === 爆炸 ===
        this.explosions = [];

        // === 道具 ===
        this.powerUps = [];
        this.powerUpSpawnTimer = 10 + Math.random() * 5;  // 首次道具延迟（秒）
        this.pendingPowerUp = null;

        // === 武器升级 ===
        this.tempWeaponLevel = 0;
        this.tempWeaponTimer = 0;      // 剩余秒数
        this.bulletHoming = false;
        this.bulletHomingTimer = 0;    // 剩余秒数

        // === 连击系统 ===
        this.combo = 0;
        this.comboTimer = 0;
        this.comboDuration = 5.0;      // 连击窗口（秒）
        this.maxCombo = 0;

        // === 浮动得分文字 ===
        this.floatingTexts = [];
        
        // === 精英/Boss生成标志 ===
        this.eliteSpawned = false;
        this.bossSpawned = false;

        // === 渲染 ===
        this.frame = 0;                // 仅用于视觉特效滚动
        this.animationId = null;
        
        // 飞船贴图
        this.playerImages = {};
        this.enemyImages = {};
        this.imagesLoaded = false;

        // 预计算星星数据
        this._initStars();
        
        // 加载飞船贴图
        this.loadShipImages();

        // 缓存星球背景
        this._cachedPlanetIndex = -1;
        this._cachedBgColors = null;
        this._cachedPlanet = null;
        
        // 背景过渡效果（淡入淡出）
        this._transitioning = false;
        this._transitionStartTime = 0;
        this._transitionDuration = 2000; // 过渡时间（毫秒）

        // === 输入 ===
        this.keys = {
            ArrowLeft: false, ArrowRight: false,
            ArrowUp: false, ArrowDown: false,
            KeyA: false, KeyD: false,
            KeyW: false, KeyS: false,
            Space: false, KeyZ: false, KeyK: false
        };

        this.init();
    }

    // ─────────── 初始化 ───────────

    _initStars() {
        // 第一层：闪烁星星（原 300 个中取奇数 = 150 个）
        this.starsLayer1 = [];
        for (let i = 0; i < 150; i++) {
            this.starsLayer1.push({
                x: (i * 131) % this.W,
                baseY: (i * 253) % this.H,
                phase: i * 0.7,
                brightness: 0.3 + (i % 5) * 0.04
            });
        }
        // 第二层：流动星星
        this.starsLayer2 = [];
        for (let i = 0; i < 75; i++) {
            this.starsLayer2.push({
                x: (i * 997) % this.W,
                baseY: (i * 367) % this.H,
                speed: 120 + (i % 5) * 12
            });
        }
    }
    
    loadShipImages() {
        let imagesToLoad = [];
        let loadedCount = 0;
        
        // 玩家飞船（5个等级）
        for (let level = 1; level <= 5; level++) {
            let img = new Image();
            img.src = `images/player-level${level}.png`;
            this.playerImages[level] = img;
            imagesToLoad.push(img);
        }
        
        // 敌机飞船（2种）
        let enemyNormal = new Image();
        enemyNormal.src = 'images/enemy-normal.png';
        this.enemyImages.normal = enemyNormal;
        imagesToLoad.push(enemyNormal);
        
        let enemyNormal2 = new Image();
        enemyNormal2.src = 'images/enemy-normal2.png';
        this.enemyImages.normal2 = enemyNormal2;
        imagesToLoad.push(enemyNormal2);
        
        // 所有图片加载完成后标记
        imagesToLoad.forEach(img => {
            img.onload = () => {
                loadedCount++;
                if (loadedCount === imagesToLoad.length) {
                    this.imagesLoaded = true;
                }
            };
            img.onerror = () => {
                loadedCount++;
                if (loadedCount === imagesToLoad.length) {
                    this.imagesLoaded = true;
                }
            };
        });
    }

    init() {
        this.canvas = document.getElementById('planeCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.scoreSpan = document.getElementById('planeScoreValue');
        this.livesSpan = document.getElementById('planeLivesValue');
        this.weaponSpan = document.getElementById('planeWeaponValue');
        this.restartBtn = document.getElementById('planeRestartButton');

        this.restartBtn.addEventListener('click', () => this.restartGame());
        
        // 点击画布启动游戏
        this.canvas.addEventListener('click', (e) => {
            if (!this.gameStarted || !this.gameRunning) {
                this.restartGame();
            }
        });

        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        window.addEventListener('blur', () => this.resetKeys());

        // 触摸控制已移除
        this.lastTime = performance.now() / 1000;
        this.gameLoop();
    }

    // ─────────── UI ───────────

    updateUI() {
        this.scoreSpan.innerText = String(this.score).padStart(6, '0');
        
        // 更新生命显示
        let livesText = "";
        for (let i = 0; i < 3; i++) {
            livesText += i < this.lives ? "❤️" : "🖤";
        }
        this.livesSpan.innerText = livesText;
        
        // 更新武器等级显示
        let weaponLevel = this.getWeaponLevel();
        let weaponText = "";
        for (let i = 0; i < 5; i++) {
            weaponText += i < weaponLevel ? "★" : "☆";
        }
        this.weaponSpan.innerText = weaponText;
        
        // 根据武器等级更新颜色
        if (weaponLevel >= 5) {
            this.weaponSpan.style.color = '#fbbf24';
        } else if (weaponLevel >= 4) {
            this.weaponSpan.style.color = '#a855f7';
        } else if (weaponLevel >= 3) {
            this.weaponSpan.style.color = '#f97316';
        } else if (weaponLevel >= 2) {
            this.weaponSpan.style.color = '#22c55e';
        } else {
            this.weaponSpan.style.color = '#60a5fa';
        }
    }

    restartGame() {
        this.gameStarted = true;
        this.gameRunning = true;
        this.score = 0;
        this.lives = 3;
        this.invincibleTimer = 0;
        this.player.x = this.W / 2 - 16;
        this.player.y = this.H - 70;
        this.shootTimer = 0;
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.explosions = [];
        this.powerUps = [];
        this.powerUpSpawnTimer = 10 + Math.random() * 5;
        this.pendingPowerUp = null;        // [BUG FIX] 清除残留延迟道具
        this.tempWeaponLevel = 0;
        this.tempWeaponTimer = 0;
        this.bulletHoming = false;
        this.bulletHomingTimer = 0;
        this.spawnTimer = 0.083;
        this.waveLevel = 1;
        this.gameTime = 0;
        this._cachedPlanetIndex = -1;      // 重置背景缓存
        this.combo = 0;                    // 重置连击
        this.comboTimer = 0;
        this.maxCombo = 0;
        this.floatingTexts = [];           // 重置浮动文字
        this.eliteSpawned = false;         // 重置精英生成标志
        this.bossSpawned = false;          // 重置Boss生成标志
        this.restartBtn.innerText = '🔄 重新起飞';
        this.updateUI();
    }

    // ─────────── 敌机生成 ───────────

    getSpawnInterval() {
        // 统一生成间隔计算（秒），替代原 spawnEnemy + updateGame 双重修改
        // 原: max(18, 32 - score/400) 帧 → 除以60转秒
        let base = Math.max(0.3, 0.533 - this.score / 24000);
        // 加入 ±0.083s 随机（原 ±5帧）
        return base + (Math.random() * 0.167 - 0.083);
    }

    spawnEnemy() {
        let rand = Math.random();
        let type = 0;
        let specialChance = Math.min(0.5, 0.2 + Math.floor(this.score / 800) * 0.1);
        if (rand < specialChance) {
            type = 1;
        }

        let x = Math.random() * (this.W - this.ENEMY_BASE_W);
        let y = -this.ENEMY_BASE_H - Math.random() * 40;
        let hp = type === 1 ? 2 : 1;
        let w = this.ENEMY_BASE_W;
        let h = this.ENEMY_BASE_H;
        
        this.enemies.push({
            x, y,
            w, h,
            hp,
            maxHp: hp,
            type,
            lastShootTime: this.gameTime - Math.random() * 3
        });
    }
    
    spawnEliteEnemy() {
        let x = this.W / 2 - 40;
        let y = 60;
        this.enemies.push({
            x, y,
            w: 80,
            h: 70,
            hp: 12,
            maxHp: 12,
            type: 2,
            lastShootTime: this.gameTime,
            moveDirection: 1,
            attackPhase: 0,
            phaseTimer: 0
        });
    }
    
    spawnBoss() {
        let x = this.W / 2 - 60;
        let y = 40;
        this.enemies.push({
            x, y,
            w: 120,
            h: 100,
            hp: 40,
            maxHp: 40,
            type: 3,
            lastShootTime: this.gameTime,
            moveDirection: 1,
            attackPhase: 0,
            phaseTimer: 0,
            patternTimer: 0
        });
    }

    // ─────────── 武器系统 ───────────

    shootFromPlayer() {
        if (!this.gameRunning) return;

        let level = this.getWeaponLevel();
        let centerX = this.player.x + this.PLAYER_WIDTH / 2;
        let y = this.player.y - 8;
        let bw = this.BULLET_W;
        let bh = this.BULLET_H;

        if (level === 1) {
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 0, level: 1 });
        } else if (level === 2) {
            this.playerBullets.push({ x: centerX - bw / 2 - 10, y, w: bw, h: bh, vx: 0, level: 2 });
            this.playerBullets.push({ x: centerX - bw / 2 + 10, y, w: bw, h: bh, vx: 0, level: 2 });
        } else if (level === 3) {
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 0, level: 3 });
            this.playerBullets.push({ x: centerX - bw / 2 - 12, y, w: bw, h: bh, vx: -60, level: 3 });
            this.playerBullets.push({ x: centerX - bw / 2 + 12, y, w: bw, h: bh, vx: 60, level: 3 });
        } else if (level === 4) {
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 0, level: 4 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: -100, level: 4 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 100, level: 4 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: -220, level: 4 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 220, level: 4 });
        } else {
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 0, level: 5 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: -80, level: 5 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 80, level: 5 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: -180, level: 5 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 180, level: 5 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: -320, level: 5 });
            this.playerBullets.push({ x: centerX - bw / 2, y, w: bw, h: bh, vx: 320, level: 5 });
        }
    }

    getWeaponLevel() {
        let baseLevel = 1;
        if (this.score >= 15000) baseLevel = 5;
        else if (this.score >= 8000) baseLevel = 4;
        else if (this.score >= 2000) baseLevel = 3;
        else if (this.score >= 500) baseLevel = 2;
        return Math.max(baseLevel, this.tempWeaponLevel);
    }

    // ─────────── 道具系统 ───────────

    createPowerUp(type) {
        const colors = { shield: '#ffd700', weapon: '#4dabf7', life: '#51cf66', homing: '#be4bdb' };
        const icons = { shield: '🛡️', weapon: '⚡', life: '❤️', homing: '🎯' };

        this.powerUps.push({
            x: Math.random() * (this.W - 30) + 15,
            y: -30,
            w: 25,
            h: 25,
            speed: 100 + Math.random() * 50,           // px/s（提速1.7x）
            type,
            color: colors[type],
            icon: icons[type],
            rotation: 0,
            rotationSpeed: (Math.random() - 0.5) * 6   // rad/s（原 *0.1 帧 → *60）
        });
    }

    spawnPowerUpGroup() {
        if (!this.gameRunning) return;

        let availableTypes = ['shield', 'life', 'homing'];
        if (this.getWeaponLevel() < 5) {
            availableTypes.push('weapon');
        }

        let type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        this.createPowerUp(type);

        // 25% 概率延迟3秒再出一个
        if (Math.random() < 0.25) {
            this.pendingPowerUp = {
                type: availableTypes[Math.floor(Math.random() * availableTypes.length)],
                spawnTime: this.gameTime + 3.0
            };
        }
    }

    applyPowerUp(powerUp) {
        switch (powerUp.type) {
            case 'shield':
                this.shieldCount = this.maxShieldCount;  // 刷新为5次
                break;
            case 'weapon':
                this.tempWeaponLevel = Math.min(5, this.getWeaponLevel() + 1);
                this.tempWeaponTimer = 10.0;  // 10秒
                break;
            case 'life':
                if (this.lives < 3) {
                    this.lives++;
                    this.updateUI();
                }
                break;
            case 'homing':
                this.bulletHoming = true;
                this.bulletHomingTimer = 10.0; // 10秒
                break;
        }
    }

    // ─────────── 敌机射击 ───────────

    enemyShoot(e) {
        if (!this.gameRunning) return;

        if (e.type === 2) {
            this.eliteShoot(e);
        } else if (e.type === 3) {
            this.bossShoot(e);
        } else {
            let bulletX = e.x + e.w / 2 - this.ENEMY_BULLET_W / 2;
            let bulletY = e.y + e.h / 2;

            let playerCX = this.player.x + this.PLAYER_WIDTH / 2;
            let playerCY = this.player.y + this.PLAYER_HEIGHT / 2;

            let dx = playerCX - (bulletX + this.ENEMY_BULLET_W / 2);
            let dy = playerCY - bulletY;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) { dx /= dist; dy /= dist; }

            let speed = this.ENEMY_BULLET_SPEED;
            this.enemyBullets.push({
                x: bulletX,
                y: bulletY,
                w: this.ENEMY_BULLET_W,
                h: this.ENEMY_BULLET_H,
                vx: dx * speed,
                vy: Math.max(dy * speed, 80)
            });
        }
    }
    
    eliteShoot(e) {
        let bulletX = e.x + e.w / 2;
        let bulletY = e.y + e.h;
        
        let playerCX = this.player.x + this.PLAYER_WIDTH / 2;
        let playerCY = this.player.y + this.PLAYER_HEIGHT / 2;
        
        if (e.attackPhase === 0) {
            // 阶段0：扇形弹幕
            for (let i = -2; i <= 2; i++) {
                let angle = Math.atan2(playerCY - bulletY, playerCX - bulletX) + i * 0.15;
                let speed = 180;
                this.enemyBullets.push({
                    x: bulletX - 6,
                    y: bulletY,
                    w: 12,
                    h: 12,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: '#ff6b6b'
                });
            }
        } else if (e.attackPhase === 1) {
            // 阶段1：追踪弹
            let dx = playerCX - bulletX;
            let dy = playerCY - bulletY;
            let dist = Math.hypot(dx, dy);
            if (dist > 0) { dx /= dist; dy /= dist; }
            this.enemyBullets.push({
                x: bulletX - 8,
                y: bulletY,
                w: 16,
                h: 16,
                vx: dx * 200,
                vy: dy * 200,
                color: '#ffd93d',
                homing: true
            });
        } else {
            // 阶段2：环形弹幕
            for (let i = 0; i < 8; i++) {
                let angle = (i / 8) * Math.PI * 2;
                let speed = 150;
                this.enemyBullets.push({
                    x: bulletX - 5,
                    y: bulletY,
                    w: 10,
                    h: 10,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: '#6c5ce7'
                });
            }
        }
    }
    
    bossShoot(e) {
        let bulletX = e.x + e.w / 2;
        let bulletY = e.y + e.h;
        
        let playerCX = this.player.x + this.PLAYER_WIDTH / 2;
        let playerCY = this.player.y + this.PLAYER_HEIGHT / 2;
        
        if (e.attackPhase === 0) {
            // 阶段0：密集弹幕
            for (let i = -3; i <= 3; i++) {
                let angle = Math.atan2(playerCY - bulletY, playerCX - bulletX) + i * 0.1;
                let speed = 160 + Math.random() * 40;
                this.enemyBullets.push({
                    x: bulletX - 5,
                    y: bulletY,
                    w: 10,
                    h: 10,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: '#fd79a8'
                });
            }
        } else if (e.attackPhase === 1) {
            // 阶段1：巨型激光弹
            let dx = playerCX - bulletX;
            let dy = playerCY - bulletY;
            let dist = Math.hypot(dx, dy);
            if (dist > 0) { dx /= dist; dy /= dist; }
            this.enemyBullets.push({
                x: bulletX - 15,
                y: bulletY,
                w: 30,
                h: 30,
                vx: dx * 220,
                vy: dy * 220,
                color: '#a29bfe',
                damage: 2
            });
        } else if (e.attackPhase === 2) {
            // 阶段2：旋转弹幕
            for (let i = 0; i < 12; i++) {
                let angle = (i / 12) * Math.PI * 2 + e.patternTimer * 2;
                let speed = 140;
                this.enemyBullets.push({
                    x: bulletX - 4,
                    y: bulletY,
                    w: 8,
                    h: 8,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: '#74b9ff'
                });
            }
        } else {
            // 阶段3：追踪弹+环形弹幕组合
            let dx = playerCX - bulletX;
            let dy = playerCY - bulletY;
            let dist = Math.hypot(dx, dy);
            if (dist > 0) { dx /= dist; dy /= dist; }
            
            for (let i = 0; i < 3; i++) {
                this.enemyBullets.push({
                    x: bulletX - 10,
                    y: bulletY + i * 20,
                    w: 20,
                    h: 20,
                    vx: dx * 180,
                    vy: dy * 180,
                    color: '#ffeaa7',
                    homing: true
                });
            }
            
            for (let i = 0; i < 6; i++) {
                let angle = (i / 6) * Math.PI * 2 + Math.PI / 2;
                let speed = 120;
                this.enemyBullets.push({
                    x: bulletX - 5,
                    y: bulletY,
                    w: 10,
                    h: 10,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: '#fdcb6e'
                });
            }
        }
    }

    // ─────────── 爆炸系统 ───────────

    createExplosion(x, y) {
        if (this.explosions.length >= 2) {
            this.explosions.shift();
        }

        const sparkColors = ['#ff6b6b', '#ffd93d', '#ff9f43', '#ff4757', '#ffa502'];
        const smokeColors = ['#2d3436', '#636e72', '#4a4a4a'];
        const glowColors = ['#ffffff', '#ffeaa7', '#fab1a0'];

        const particles = [];

        // 20 个火花（速度 200-510 px/s，提速1.7x）
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 200 + Math.random() * 310;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 3,
                life: 1,
                decay: 1.5 + Math.random() * 0.9,
                color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
                type: 'spark'
            });
        }

        // 15 个烟雾（速度 100-310 px/s，提速1.7x）
        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2 + Math.random() * 0.5;
            const speed = 100 + Math.random() * 210;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 6 + Math.random() * 4,
                life: 1,
                decay: 1.2 + Math.random() * 0.6,
                color: smokeColors[Math.floor(Math.random() * smokeColors.length)],
                type: 'smoke'
            });
        }

        // 8 个辉光（速度 300-510 px/s，提速1.7x）
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const speed = 300 + Math.random() * 210;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 100,
                size: 3 + Math.random() * 2,
                life: 1,
                decay: 1.8 + Math.random() * 1.2,
                color: glowColors[Math.floor(Math.random() * glowColors.length)],
                type: 'glow'
            });
        }

        this.explosions.push({
            particles,
            flashAlpha: 0.8,
            flashX: x,
            flashY: y
        });
    }

    // ─────────── 碰撞检测 ───────────

    rectCollide(r1, r2) {
        return !(r2.x > r1.x + r1.w ||
                 r2.x + r2.w < r1.x ||
                 r2.y > r1.y + r1.h ||
                 r2.y + r2.h < r1.y);
    }

    // ─────────── 主更新逻辑（delta time） ───────────

    updateGame(dt) {
        if (!this.gameRunning) return;

        this.gameTime += dt;

        // 无敌倒计时
        if (this.invincibleTimer > 0) {
            this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
        }

        // 武器升级倒计时
        if (this.tempWeaponTimer > 0) {
            this.tempWeaponTimer -= dt;
            if (this.tempWeaponTimer <= 0) {
                this.tempWeaponLevel = 0;
                this.tempWeaponTimer = 0;
            }
        }

        // 追踪弹倒计时
        if (this.bulletHomingTimer > 0) {
            this.bulletHomingTimer -= dt;
            if (this.bulletHomingTimer <= 0) {
                this.bulletHoming = false;
                this.bulletHomingTimer = 0;
            }
        }
        
        // 连击倒计时
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                this.combo = 0;  // 连击中断
            }
        }
        
        // 更新浮动文字
        this.updateFloatingTexts(dt);

        // 道具生成
        this.powerUpSpawnTimer -= dt;
        if (this.powerUpSpawnTimer <= 0) {
            this.spawnPowerUpGroup();
            this.powerUpSpawnTimer = 10 + Math.random() * 5;
        }

        // 延迟道具检查
        if (this.pendingPowerUp && this.gameTime >= this.pendingPowerUp.spawnTime) {
            this.createPowerUp(this.pendingPowerUp.type);
            this.pendingPowerUp = null;
        }

        // 更新道具位置 & 碰撞
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            let p = this.powerUps[i];
            p.y += p.speed * dt;
            p.rotation += p.rotationSpeed * dt;

            if (p.y > this.H + 50) {
                this.powerUps.splice(i, 1);
                continue;
            }

            if (this.rectCollide(p, { x: this.player.x, y: this.player.y, w: this.PLAYER_WIDTH, h: this.PLAYER_HEIGHT })) {
                this.applyPowerUp(p);
                this.powerUps.splice(i, 1);
            }
        }

        // [BUG FIX] 斜向移动归一化
        this.updatePlayerMovement(dt);

        // 自动射击
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
            this.shootFromPlayer();
            this.shootTimer = this.shootInterval;
        }

        // 更新玩家子弹
        this.updatePlayerBullets(dt);

        // 敌机相关（仅在游戏开始后）
        if (this.gameStarted) {
            this.updateEnemies(dt);
            this.updateEnemyBullets(dt);
            this.checkPlayerEnemyCollisions();
            this.updateEnemySpawning(dt);
        }

        // 更新爆炸粒子
        this.updateExplosions(dt);
    }

    updatePlayerMovement(dt) {
        let moveX = 0, moveY = 0;
        if (this.keys.ArrowLeft || this.keys.KeyA) moveX = -1;
        if (this.keys.ArrowRight || this.keys.KeyD) moveX = 1;
        if (this.keys.ArrowUp || this.keys.KeyW) moveY = -1;
        if (this.keys.ArrowDown || this.keys.KeyS) moveY = 1;

        // [BUG FIX] 斜向移动归一化：√2/2 ≈ 0.707
        if (moveX !== 0 && moveY !== 0) {
            moveX *= 0.707;
            moveY *= 0.707;
        }

        let newX = this.player.x + moveX * this.PLAYER_SPEED * dt;
        let newY = this.player.y + moveY * this.PLAYER_SPEED * dt;

        if (newX >= 0 && newX + this.PLAYER_WIDTH <= this.W) {
            this.player.x = newX;
        }
        if (newY >= 0 && newY + this.PLAYER_HEIGHT <= this.H) {
            this.player.y = newY;
        }
    }

    updatePlayerBullets(dt) {
        for (let i = this.playerBullets.length - 1; i >= 0; i--) {
            let b = this.playerBullets[i];

            if (this.bulletHoming && this.enemies.length > 0) {
                // 追踪模式：子弹锁定并追踪敌机
                let bx = b.x + b.w / 2;
                let by = b.y + b.h / 2;
                
                // 如果子弹还没有锁定目标，找一个未被锁定的敌机
                if (!b.targetEnemy || !this.enemies.includes(b.targetEnemy)) {
                    let nearestEnemy = null;
                    let nearestDist = Infinity;
                    
                    for (let e of this.enemies) {
                        // 检查敌机是否已被其他子弹锁定
                        let isTargeted = this.playerBullets.some(otherB => otherB !== b && otherB.targetEnemy === e);
                        if (isTargeted) continue;
                        
                        let ex = e.x + e.w / 2;
                        let ey = e.y + e.h / 2;
                        let dist = Math.hypot(ex - bx, ey - by);
                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearestEnemy = e;
                        }
                    }
                    
                    if (nearestEnemy) {
                        b.targetEnemy = nearestEnemy; // 锁定目标
                    }
                }
                
                // 如果有锁定目标，飞向它
                if (b.targetEnemy) {
                    let dx = b.targetEnemy.x + b.targetEnemy.w / 2 - bx;
                    let dy = b.targetEnemy.y + b.targetEnemy.h / 2 - by;
                    let dist = Math.hypot(dx, dy);
                    if (dist > 0) { dx /= dist; dy /= dist; }
                    
                    // 直接飞向目标
                    b.x += dx * this.BULLET_SPEED * dt;
                    b.y += dy * this.BULLET_SPEED * dt;
                } else {
                    b.y -= this.BULLET_SPEED * dt;
                    b.x += b.vx * dt;
                }
            } else {
                b.y -= this.BULLET_SPEED * dt;
                b.x += b.vx * dt;
            }

            // 出界移除
            if (b.y + b.h < 0 || b.y > this.H || b.x < -10 || b.x > this.W + 10) {
                this.playerBullets.splice(i, 1);
                continue;
            }

            // 碰撞检测
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                let e = this.enemies[j];
                if (this.rectCollide(b, e)) {
                    e.hp -= 1;
                    hit = true;
                    if (e.hp <= 0) {
                        this.createExplosion(e.x + e.w / 2, e.y + e.h / 2);
                        
                        // 计算基础分数
                        let baseScore = 10;
                        if (e.type === 1) baseScore = 30;
                        else if (e.type === 2) baseScore = 100;
                        else if (e.type === 3) baseScore = 500;
                        
                        // 连击加成
                        this.combo++;
                        this.comboTimer = this.comboDuration;
                        if (this.combo > this.maxCombo) {
                            this.maxCombo = this.combo;
                        }
                        
                        let comboMultiplier = 1.0;
                        if (this.combo >= 4) comboMultiplier = 2.5;
                        else if (this.combo >= 3) comboMultiplier = 2.0;
                        else if (this.combo >= 2) comboMultiplier = 1.5;
                        
                        let finalScore = Math.floor(baseScore * comboMultiplier);
                        this.score += finalScore;
                        
                        // 创建浮动得分文字
                        let scoreColor = '#ffff00';
                        if (e.type === 2) scoreColor = '#ff6b6b';
                        else if (e.type === 3) scoreColor = '#a29bfe';
                        else if (this.combo > 1) scoreColor = this.getComboColor(this.combo);
                        
                        this.createFloatingText(
                            e.x + e.w / 2,
                            e.y + e.h / 2,
                            '+' + finalScore,
                            scoreColor
                        );
                        
                        // 重置精英/Boss生成标志
                        if (e.type === 2) this.eliteSpawned = false;
                        if (e.type === 3) this.bossSpawned = false;
                        
                        this.updateUI();
                        this.enemies.splice(j, 1);
                    }
                    break;
                }
            }
            if (hit) {
                this.playerBullets.splice(i, 1);
            }
        }
    }
    
        getComboColor(combo) {
        if (combo >= 10) return '#ff00ff';  // 紫色 - 超级连击
        if (combo >= 6) return '#00ffff';   // 青色 - 高级连击
        if (combo >= 3) return '#00ff00';   // 绿色 - 中级连击
        return '#ffff00';                   // 黄色 - 初级连击
    }
    
    createFloatingText(x, y, text, color) {
        this.floatingTexts.push({
            x: x,
            y: y,
            text: text,
            color: color,
            life: 1.5,        // 存活时间（秒）
            maxLife: 1.5,
            speed: 80,        // 上升速度
            scale: 1
        });
    }
    
    updateFloatingTexts(dt) {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            let ft = this.floatingTexts[i];
            ft.y -= ft.speed * dt;
            ft.life -= dt;
            
            // 根据存活时间调整大小
            let lifeRatio = ft.life / ft.maxLife;
            ft.scale = 0.8 + lifeRatio * 0.4;  // 从1.2缩小到0.8
            
            if (ft.life <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    updateEnemies(dt) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            let e = this.enemies[i];
            
            if (e.type === 2) {
                this.updateEliteEnemy(e, dt);
            } else if (e.type === 3) {
                this.updateBoss(e, dt);
            } else {
                let baseSpeed = 50 + Math.min(100, this.score / 20);
                e.y += baseSpeed * dt;

                if (e.y + e.h > this.H + 80 || e.y + e.h < -100) {
                    this.enemies.splice(i, 1);
                    continue;
                }

                if (this.gameRunning) {
                    let shootInterval = e.type === 1 ? 4.0 : 2.5;
                    if (this.gameTime - e.lastShootTime >= shootInterval) {
                        this.enemyShoot(e);
                        e.lastShootTime = this.gameTime;
                    }
                }
            }
        }
    }
    
    updateEliteEnemy(e, dt) {
        e.phaseTimer += dt;
        
        // 精英敌机：左右移动
        e.x += e.moveDirection * 80 * dt;
        if (e.x <= 0 || e.x >= this.W - e.w) {
            e.moveDirection *= -1;
        }
        
        // 攻击阶段切换（延长到4秒）
        if (e.phaseTimer >= 4) {
            e.phaseTimer = 0;
            e.attackPhase = (e.attackPhase + 1) % 3;
        }
        
        // 根据阶段攻击（延长攻击间隔）
        let shootInterval = 0;
        if (e.attackPhase === 0) shootInterval = 1.5;
        else if (e.attackPhase === 1) shootInterval = 2.0;
        else shootInterval = 1.8;
        
        if (this.gameRunning && this.gameTime - e.lastShootTime >= shootInterval) {
            this.enemyShoot(e);
            e.lastShootTime = this.gameTime;
        }
    }
    
    updateBoss(e, dt) {
        e.phaseTimer += dt;
        e.patternTimer += dt;
        
        // Boss：左右缓慢移动
        e.x += e.moveDirection * 60 * dt;
        if (e.x <= 0 || e.x >= this.W - e.w) {
            e.moveDirection *= -1;
        }
        
        // 攻击阶段切换（每5秒）
        if (e.phaseTimer >= 5) {
            e.phaseTimer = 0;
            e.attackPhase = (e.attackPhase + 1) % 4;
            e.patternTimer = 0;
        }
        
        // 根据阶段攻击
        let shootInterval = 0;
        if (e.attackPhase === 0) shootInterval = 0.6;
        else if (e.attackPhase === 1) shootInterval = 1.0;
        else if (e.attackPhase === 2) shootInterval = 0.3;
        else shootInterval = 0.8;
        
        if (this.gameRunning && this.gameTime - e.lastShootTime >= shootInterval) {
            this.enemyShoot(e);
            e.lastShootTime = this.gameTime;
        }
    }

    updateEnemyBullets(dt) {
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            let eb = this.enemyBullets[i];
            eb.x += eb.vx * dt;
            eb.y += eb.vy * dt;

            // 出界移除
            if (eb.y + eb.h < 0 || eb.y > this.H + 100 || eb.x < -20 || eb.x > this.W + 20) {
                this.enemyBullets.splice(i, 1);
                continue;
            }

            // 碰撞玩家
            if (this.rectCollide(eb, { x: this.player.x, y: this.player.y, w: this.PLAYER_WIDTH, h: this.PLAYER_HEIGHT })) {
                if (this.gameRunning) {
                    if (this.shieldCount > 0) {
                        this.shieldCount--;  // 使用护盾抵挡
                    } else if (this.invincibleTimer <= 0) {
                        this.lives--;
                        this.updateUI();
                        if (this.lives <= 0) {
                            this.gameRunning = false;
                            this.restartBtn.innerText = '🔄 重新起飞';
                        } else {
                            this.invincibleTimer = this.invincibleDuration;
                        }
                    }
                }
                this.enemyBullets.splice(i, 1);
            }
        }
    }

    checkPlayerEnemyCollisions() {
        let playerRect = { x: this.player.x, y: this.player.y, w: this.PLAYER_WIDTH, h: this.PLAYER_HEIGHT };

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            let e = this.enemies[i];
            if (this.rectCollide(playerRect, e)) {
                if (this.gameRunning) {
                    if (this.shieldCount > 0) {
                        this.shieldCount--;  // 使用护盾抵挡
                    } else if (this.invincibleTimer <= 0) {
                        this.lives--;
                        this.updateUI();
                        if (this.lives <= 0) {
                            this.gameRunning = false;
                            this.restartBtn.innerText = '🔄 重新起飞';
                        } else {
                            this.invincibleTimer = this.invincibleDuration;
                        }
                    }
                }
                this.enemies.splice(i, 1);
            }
        }
    }

    updateEnemySpawning(dt) {
        this.spawnTimer -= dt;
        
        // 检查是否有Boss或精英存在
        let hasBoss = this.enemies.some(e => e.type === 3);
        let hasElite = this.enemies.some(e => e.type === 2);
        
        // 检查是否需要生成精英敌机（每2000分）
        let eliteThreshold = Math.floor(this.score / 2000) * 2000;
        if (!hasBoss && this.score >= eliteThreshold && !this.eliteSpawned && this.score >= 2000) {
            if (!hasElite) {
                this.spawnEliteEnemy();
                this.eliteSpawned = true;
            }
        }
        
        // 检查是否需要生成Boss（每5000分）
        let bossThreshold = Math.floor(this.score / 5000) * 5000;
        if (this.score >= bossThreshold && !this.bossSpawned && this.score >= 5000) {
            if (!hasBoss) {
                this.spawnBoss();
                this.bossSpawned = true;
            }
        }
        
        // 普通敌机生成逻辑
        if (this.spawnTimer <= 0) {
            let maxEnemies = 5 + Math.min(9, Math.floor(this.score / 500));
            
            // 有Boss时不生成普通敌机
            if (hasBoss) {
                this.spawnTimer = this.getSpawnInterval();
                return;
            }
            
            // 有精英时大幅减少普通敌机数量
            if (hasElite) {
                maxEnemies = 2;
            }
            
            // 只生成普通敌机（type 0或1）
            let normalCount = this.enemies.filter(e => e.type === 0 || e.type === 1).length;
            if (normalCount < maxEnemies) {
                this.spawnEnemy();
            }
            this.spawnTimer = this.getSpawnInterval();
        }
    }

    updateExplosions(dt) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            let exp = this.explosions[i];

            // 闪光衰减
            if (exp.flashAlpha > 0) {
                exp.flashAlpha -= 4.8 * dt;  // 原 0.08/帧 * 60
            }

            // 粒子更新
            for (let j = exp.particles.length - 1; j >= 0; j--) {
                let p = exp.particles[j];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= p.decay * dt;

                // 阻尼：0.96/帧 → per-second 指数衰减
                let dampFactor = Math.pow(0.96, dt * 60);
                p.vx *= dampFactor;
                p.vy *= dampFactor;

                if (p.type === 'smoke') {
                    p.vy -= 600 * dt;    // 上浮加速度（提速1.7x）
                    p.size += 10 * dt;   // 膨胀速率（提速1.7x）
                }

                if (p.life <= 0) {
                    exp.particles.splice(j, 1);
                }
            }

            let alive = exp.particles.length > 0 || exp.flashAlpha > 0;
            if (!alive) {
                this.explosions.splice(i, 1);
            }
        }
    }

    // ─────────── 绘制 ───────────

    drawStars() {
        let ctx = this.ctx;
        let scrollY = this.gameTime * 180; // 视觉滚动用（提速1.7x）

        // 第一层：闪烁星星（预计算数据，无逐帧 sin）
        for (let i = 0; i < this.starsLayer1.length; i++) {
            let s = this.starsLayer1[i];
            let sy = (s.baseY + scrollY) % this.H;
            // 用帧计数取模模拟闪烁，比 sin 快
            let flicker = 0.3 + ((this.frame + i * 7) % 17) / 17 * 0.2;
            ctx.fillStyle = `rgba(255,240,200,${flicker})`;
            ctx.fillRect(s.x, sy, 1.5, 1.5);
        }

        // 第二层：流动星星
        for (let i = 0; i < this.starsLayer2.length; i++) {
            let s = this.starsLayer2[i];
            let y = (s.baseY + scrollY * (s.speed / 200)) % this.H;
            ctx.fillStyle = 'rgba(255,200,100,0.6)';
            ctx.fillRect(s.x, y, 1, 1);
        }
    }

    drawPlayer() {
        let ctx = this.ctx;
        let px = this.player.x, py = this.player.y;

        // 无敌闪烁
        let drawSolid = true;
        if (this.invincibleTimer > 0 && (Math.floor(Date.now() / 50) % 3 === 0)) {
            drawSolid = false;
        }
        if (!drawSolid) {
            ctx.globalAlpha = 0.6;
        }

        // 道具护盾光环（蓝色）
        if (this.shieldCount > 0) {
            let pulse = Math.sin(Date.now() / 80) * 0.3 + 0.7;
            let radius = Math.max(this.PLAYER_WIDTH, this.PLAYER_HEIGHT) / 2 + 12;
            
            // 多层护盾效果
            for (let i = 0; i < this.shieldCount; i++) {
                let layerRadius = radius + i * 3;
                let layerAlpha = pulse * (0.4 - i * 0.05);
                ctx.beginPath();
                ctx.arc(px + this.PLAYER_WIDTH / 2, py + this.PLAYER_HEIGHT / 2, layerRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 191, 255, ${Math.max(0, layerAlpha)})`;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#00bfff";
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            
            // 显示护盾次数
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = "#00bfff";
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#00bfff";
            ctx.fillText(`${this.shieldCount}`, px + this.PLAYER_WIDTH / 2, py + this.PLAYER_HEIGHT + 20);
            ctx.shadowBlur = 0;
            ctx.textAlign = "left";
        }
        
        // 无敌光环（金色，被击后）
        if (this.invincibleTimer > 0) {
            let pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
            ctx.beginPath();
            ctx.arc(px + this.PLAYER_WIDTH / 2, py + this.PLAYER_HEIGHT / 2,
                Math.max(this.PLAYER_WIDTH, this.PLAYER_HEIGHT) / 2 + 8, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 215, 0, ${pulse * 0.6})`;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#ffd700";
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 获取当前武器等级对应的飞船图片
        let weaponLevel = this.getWeaponLevel();
        let playerImg = this.playerImages[weaponLevel];
        
        if (this.imagesLoaded && playerImg && playerImg.complete && playerImg.naturalWidth > 0) {
            // 玩家飞船发光
            ctx.shadowBlur = 12;
            ctx.shadowColor = "#2affcc";
            ctx.drawImage(playerImg, px, py, this.PLAYER_WIDTH, this.PLAYER_HEIGHT);
            ctx.shadowBlur = 0;
        } else {
            // 回退到绘制模式
            ctx.shadowBlur = 12;
            ctx.shadowColor = "#2affcc";

            ctx.beginPath();
            ctx.moveTo(px + this.PLAYER_WIDTH / 2, py);
            ctx.lineTo(px + this.PLAYER_WIDTH - 6, py + this.PLAYER_HEIGHT - 6);
            ctx.lineTo(px + this.PLAYER_WIDTH / 2, py + this.PLAYER_HEIGHT - 2);
            ctx.lineTo(px + 6, py + this.PLAYER_HEIGHT - 6);
            ctx.fillStyle = "#7df9ff";
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(px + this.PLAYER_WIDTH / 2, py + 4);
            ctx.lineTo(px + this.PLAYER_WIDTH - 10, py + this.PLAYER_HEIGHT - 8);
            ctx.lineTo(px + this.PLAYER_WIDTH / 2, py + this.PLAYER_HEIGHT - 4);
            ctx.lineTo(px + 10, py + this.PLAYER_HEIGHT - 8);
            ctx.fillStyle = "#42e0ff";
            ctx.fill();

            ctx.fillStyle = "#ffd966";
            ctx.fillRect(px + 4, py + 14, 6, 8);
            ctx.fillRect(px + this.PLAYER_WIDTH - 10, py + 14, 6, 8);

            ctx.fillStyle = "orange";
            ctx.fillRect(px + this.PLAYER_WIDTH / 2 - 3, py + 4, 6, 8);

            ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = 1;
    }

    drawEnemy(e) {
        let ctx = this.ctx;

        // 精英敌机和Boss的特殊绘制
        if (e.type === 2) {
            this.drawEliteEnemy(e);
            return;
        }
        if (e.type === 3) {
            this.drawBoss(e);
            return;
        }

        // 普通敌机绘制
        let enemyImg = e.type === 1 ? this.enemyImages.normal2 : this.enemyImages.normal;
        
        if (this.imagesLoaded && enemyImg && enemyImg.complete) {
            ctx.save();
            
            if (e.type === 0) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ff4d4d';
            } else {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#b76eff';
            }
            
            ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
            ctx.scale(1, -1);
            ctx.drawImage(enemyImg, -e.w / 2, -e.h / 2, e.w, e.h);
            
            ctx.shadowBlur = 0;
            ctx.restore();
        } else {
            if (e.type === 0) {
                ctx.fillStyle = 'rgba(227, 77, 77, 0.3)';
                ctx.fillRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
                ctx.fillStyle = "#e34d4d";
                ctx.fillRect(e.x, e.y, e.w, e.h);
                ctx.fillStyle = "#b02c2c";
                ctx.fillRect(e.x + 4, e.y + 6, e.w - 8, 6);
                ctx.fillStyle = "#ff7777";
                ctx.beginPath();
                ctx.ellipse(e.x + e.w / 2, e.y + 12, 8, 6, 0, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = 'rgba(183, 110, 255, 0.3)';
                ctx.fillRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
                ctx.fillStyle = "#b76eff";
                ctx.fillRect(e.x, e.y, e.w, e.h);
                ctx.fillStyle = "#862dff";
                ctx.fillRect(e.x + 6, e.y + 8, e.w - 12, 6);
                ctx.fillStyle = "#f4c2ff";
                ctx.beginPath();
                ctx.arc(e.x + e.w / 2, e.y + e.h - 12, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#ffa500";
                ctx.fillRect(e.x + e.w / 2 - 3, e.y + e.h - 6, 6, 10);
            }

            ctx.fillStyle = "white";
            ctx.fillRect(e.x + e.w * 0.2, e.y + 8, 6, 6);
            ctx.fillRect(e.x + e.w * 0.7, e.y + 8, 6, 6);
            ctx.fillStyle = "#020202";
            ctx.fillRect(e.x + e.w * 0.2 + 2, e.y + 9, 3, 3);
            ctx.fillRect(e.x + e.w * 0.7 + 2, e.y + 9, 3, 3);
        }

        if (e.maxHp > 1) {
            let barW = e.w - 4;
            let barH = 3;
            let barX = e.x + 2;
            let barY = e.y - 6;
            let hpRatio = e.hp / e.maxHp;
            ctx.fillStyle = '#333';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = hpRatio > 0.5 ? '#51cf66' : hpRatio > 0.25 ? '#ffd93d' : '#ff4757';
            ctx.fillRect(barX, barY, barW * hpRatio, barH);
        }
    }
    
    drawEliteEnemy(e) {
        let ctx = this.ctx;
        let pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
        
        ctx.save();
        
        // 精英光环
        let gradient = ctx.createRadialGradient(
            e.x + e.w / 2, e.y + e.h / 2, 0,
            e.x + e.w / 2, e.y + e.h / 2, e.w
        );
        gradient.addColorStop(0, `rgba(255, 107, 107, ${pulse * 0.4})`);
        gradient.addColorStop(1, 'rgba(255, 107, 107, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w, 0, Math.PI * 2);
        ctx.fill();
        
        // 主体
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff6b6b';
        
        // 三角形主体
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.moveTo(e.x + e.w / 2, e.y + e.h);
        ctx.lineTo(e.x + e.w, e.y);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.fill();
        
        // 内圈
        ctx.fillStyle = '#ff8787';
        ctx.beginPath();
        ctx.moveTo(e.x + e.w / 2, e.y + e.h - 10);
        ctx.lineTo(e.x + e.w - 15, e.y + 15);
        ctx.lineTo(e.x + 15, e.y + 15);
        ctx.closePath();
        ctx.fill();
        
        // 核心
        ctx.fillStyle = '#ffd93d';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, e.y + e.h / 2, 10, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
        
        // 血条
        let hpRatio = e.hp / e.maxHp;
        let barW = e.w + 20;
        let barH = 6;
        let barX = e.x - 10;
        let barY = e.y - 15;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = hpRatio > 0.5 ? '#ff6b6b' : hpRatio > 0.25 ? '#ffd93d' : '#ff4757';
        ctx.fillRect(barX, barY, barW * hpRatio, barH);
        
        // 边框
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
        
        // 标签
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('ELITE', e.x + e.w / 2, barY - 5);
    }
    
    drawBoss(e) {
        let ctx = this.ctx;
        let pulse = Math.sin(Date.now() / 80) * 0.2 + 0.8;
        
        ctx.save();
        
        // Boss光环
        let gradient = ctx.createRadialGradient(
            e.x + e.w / 2, e.y + e.h / 2, 0,
            e.x + e.w / 2, e.y + e.h / 2, e.w * 1.2
        );
        gradient.addColorStop(0, `rgba(162, 155, 254, ${pulse * 0.5})`);
        gradient.addColorStop(0.5, `rgba(108, 92, 231, ${pulse * 0.3})`);
        gradient.addColorStop(1, 'rgba(162, 155, 254, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w * 1.2, 0, Math.PI * 2);
        ctx.fill();
        
        // 主体
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#a29bfe';
        
        // 六边形主体
        ctx.fillStyle = '#6c5ce7';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
            let rx = e.x + e.w / 2 + Math.cos(angle) * e.w / 2;
            let ry = e.y + e.h / 2 + Math.sin(angle) * e.h / 2;
            if (i === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.fill();
        
        // 内层
        ctx.fillStyle = '#a29bfe';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
            let rx = e.x + e.w / 2 + Math.cos(angle) * e.w / 3;
            let ry = e.y + e.h / 2 + Math.sin(angle) * e.h / 3;
            if (i === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.fill();
        
        // 核心
        ctx.fillStyle = '#ffeaa7';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, e.y + e.h / 2, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // 核心闪光
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2 - 5, e.y + e.h / 2 - 5, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
        
        // 血条
        let hpRatio = e.hp / e.maxHp;
        let barW = e.w + 40;
        let barH = 10;
        let barX = e.x - 20;
        let barY = e.y - 25;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        
        // 渐变色血条
        let hpGradient = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        hpGradient.addColorStop(0, '#a29bfe');
        hpGradient.addColorStop(0.5, '#6c5ce7');
        hpGradient.addColorStop(1, '#fd79a8');
        ctx.fillStyle = hpGradient;
        ctx.fillRect(barX, barY, barW * hpRatio, barH);
        
        // 边框
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);
        
        // Boss标签
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a29bfe';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#a29bfe';
        ctx.fillText('BOSS', e.x + e.w / 2, barY - 8);
        ctx.shadowBlur = 0;
    }

    drawBullets() {
        let ctx = this.ctx;

        // 玩家子弹根据等级显示不同外观
        for (let b of this.playerBullets) {
            let level = b.level || 1;
            this.drawPlayerBullet(b, level);
        }

        // 敌机子弹保持旋转箭头造型，用双层模拟发光
        for (let eb of this.enemyBullets) {
            ctx.save();

            let angle = Math.atan2(eb.vy || 1, eb.vx || 0);
            let cx = eb.x + eb.w / 2;
            let cy = eb.y + eb.h / 2;

            ctx.translate(cx, cy);
            ctx.rotate(angle);

            // 外发光层
            ctx.fillStyle = 'rgba(255, 0, 102, 0.25)';
            ctx.beginPath();
            ctx.moveTo(eb.w / 2 + 2, 0);
            ctx.lineTo(-eb.w / 2 - 1, -eb.h / 2 - 1);
            ctx.lineTo(-eb.w / 3, 0);
            ctx.lineTo(-eb.w / 2 - 1, eb.h / 2 + 1);
            ctx.closePath();
            ctx.fill();

            // 主体
            ctx.fillStyle = "#ff3a6f";
            ctx.beginPath();
            ctx.moveTo(eb.w / 2, 0);
            ctx.lineTo(-eb.w / 2, -eb.h / 2);
            ctx.lineTo(-eb.w / 3, 0);
            ctx.lineTo(-eb.w / 2, eb.h / 2);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#ff8cae";
            ctx.beginPath();
            ctx.moveTo(eb.w / 2 - 2, 0);
            ctx.lineTo(-eb.w / 4, -eb.h / 3);
            ctx.lineTo(-eb.w / 4, eb.h / 3);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    drawPlayerBullet(b, level) {
        let ctx = this.ctx;
        
        if (level === 1) {
            // 1级：基础能量弹 - 细长三角形
            ctx.save();
            ctx.fillStyle = 'rgba(100, 200, 255, 0.4)';
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y);
            ctx.lineTo(b.x + b.w, b.y + b.h);
            ctx.lineTo(b.x, b.y + b.h);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#67e8f9';
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y + 2);
            ctx.lineTo(b.x + b.w - 2, b.y + b.h);
            ctx.lineTo(b.x + 2, b.y + b.h);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y + 4);
            ctx.lineTo(b.x + b.w / 2 + 3, b.y + b.h - 2);
            ctx.lineTo(b.x + b.w / 2 - 3, b.y + b.h - 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            
        } else if (level === 2) {
            // 2级：双管激光 - 带发光效果的菱形
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#f472b6';
            
            ctx.fillStyle = 'rgba(244, 114, 182, 0.3)';
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y - 2);
            ctx.lineTo(b.x + b.w + 2, b.y + b.h / 2);
            ctx.lineTo(b.x + b.w / 2, b.y + b.h + 2);
            ctx.lineTo(b.x - 2, b.y + b.h / 2);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#f472b6';
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y);
            ctx.lineTo(b.x + b.w, b.y + b.h / 2);
            ctx.lineTo(b.x + b.w / 2, b.y + b.h);
            ctx.lineTo(b.x, b.y + b.h / 2);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#f9a8d4';
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y + 2);
            ctx.lineTo(b.x + b.w - 2, b.y + b.h / 2);
            ctx.lineTo(b.x + b.w / 2, b.y + b.h - 2);
            ctx.lineTo(b.x + 2, b.y + b.h / 2);
            ctx.closePath();
            ctx.fill();
            
            ctx.shadowBlur = 0;
            ctx.restore();
            
        } else if (level === 3) {
            // 3级：等离子弹 - 圆形能量球带尾迹
            ctx.save();
            
            let pulse = Math.sin(Date.now() / 100) * 0.2 + 0.8;
            let glowSize = 10 + pulse * 4;
            
            ctx.fillStyle = `rgba(251, 146, 60, ${0.3 * pulse})`;
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 2, glowSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fb923c';
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fed7aa';
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fff7ed';
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 3, 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
            
        } else if (level === 4) {
            // 4级：量子毁灭弹 - 在3级基础上增强，带旋转光环和粒子尾迹
            ctx.save();
            
            let time = Date.now() / 80;
            let pulse = Math.sin(Date.now() / 80) * 0.2 + 0.8;
            
            // 外层旋转光环（多层）
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
            ctx.lineWidth = 2;
            for (let ring = 0; ring < 3; ring++) {
                ctx.beginPath();
                let ringRadius = b.w * (0.8 + ring * 0.3);
                let offsetAngle = time * (1 - ring * 0.3);
                ctx.arc(b.x + b.w / 2, b.y + b.h / 2, ringRadius, offsetAngle, offsetAngle + Math.PI * 1.5);
                ctx.stroke();
            }
            
            // 脉冲光晕（紫色+青色渐变）
            let gradient = ctx.createRadialGradient(
                b.x + b.w / 2, b.y + b.h / 2, 0,
                b.x + b.w / 2, b.y + b.h / 2, b.w * 1.5
            );
            gradient.addColorStop(0, 'rgba(0, 255, 255, 0.4)');
            gradient.addColorStop(0.3, 'rgba(168, 85, 247, 0.3)');
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w * 1.5 * pulse, 0, Math.PI * 2);
            ctx.fill();
            
            // 主能量球（类似3级但更大更亮）
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#a855f7';
            ctx.fillStyle = '#a855f7';
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 2, 0, Math.PI * 2);
            ctx.fill();
            
            // 内层核心（青色闪光）- 确保半径不为负
            ctx.shadowColor = '#22d3ee';
            ctx.fillStyle = '#22d3ee';
            let coreRadius = Math.max(2, b.w / 3 + Math.sin(time) * 2);
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 2, coreRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // 中心亮点
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + b.h / 3, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // 旋转的粒子碎片 - 确保半径不为负
            let fragments = 6;
            for (let i = 0; i < fragments; i++) {
                let angle = (i / fragments) * Math.PI * 2 + time;
                let dist = b.w * 0.6;
                let fx = b.x + b.w / 2 + Math.cos(angle) * dist;
                let fy = b.y + b.h / 2 + Math.sin(angle) * dist;
                
                ctx.fillStyle = `rgba(${168 + Math.sin(time + i) * 50}, ${85 + Math.cos(time + i) * 30}, 247, ${0.6 + Math.sin(time * 2 + i) * 0.3})`;
                let fragmentRadius = Math.max(1, 3 + Math.sin(time * 3 + i) * 2);
                ctx.beginPath();
                ctx.arc(fx, fy, fragmentRadius, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.shadowBlur = 0;
            ctx.restore();
        } else {
            // 5级：星辰风暴 - 金色五角星 + 彩虹尾迹 + 钻石光环
            ctx.save();
            
            let time5 = Date.now() / 60;
            let pulse5 = Math.sin(Date.now() / 100) * 0.2 + 0.8;
            let cx5 = b.x + b.w / 2;
            let cy5 = b.y + b.h / 2;
            
            // 外层钻石旋转光环
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
            ctx.lineWidth = 2;
            for (let ring = 0; ring < 2; ring++) {
                ctx.save();
                ctx.translate(cx5, cy5);
                ctx.rotate(time5 * (1 + ring * 0.5));
                let r = b.w * (0.8 + ring * 0.6);
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    let a = (i / 8) * Math.PI * 2;
                    let rr = r * (i % 2 === 0 ? 0.65 : 1);
                    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
                    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
            }
            
            // 脉冲光晕（金色渐变）
            let grad5 = ctx.createRadialGradient(cx5, cy5, 0, cx5, cy5, b.w * 2.2);
            grad5.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
            grad5.addColorStop(0.2, 'rgba(251, 191, 36, 0.4)');
            grad5.addColorStop(0.6, 'rgba(251, 191, 36, 0.08)');
            grad5.addColorStop(1, 'rgba(251, 191, 36, 0)');
            ctx.fillStyle = grad5;
            ctx.beginPath();
            ctx.arc(cx5, cy5, b.w * 2.2 * pulse5, 0, Math.PI * 2);
            ctx.fill();
            
            // 金色五角星主体
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#fbbf24';
            let outerR = b.w + 3;
            let innerR = b.w / 2 + 1;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                let r = i % 2 === 0 ? outerR : innerR;
                let a = (i * Math.PI) / 5 - Math.PI / 2;
                let sx = cx5 + Math.cos(a) * r;
                let sy = cy5 + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.closePath();
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
            
            // 星星内层亮色
            ctx.shadowBlur = 0;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                let r = i % 2 === 0 ? b.w / 2 : b.w / 4;
                let a = (i * Math.PI) / 5 - Math.PI / 2;
                let sx = cx5 + Math.cos(a) * r;
                let sy = cy5 + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.closePath();
            ctx.fillStyle = '#fef3c7';
            ctx.fill();
            
            // 白色炽热核心
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx5, cy5, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // 彩虹粒子尾迹
            let rainbow = ['#ef4444', '#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6'];
            for (let i = 0; i < 8; i++) {
                let a = (i / 8) * Math.PI * 2 + time5 * 1.5;
                let d = b.w * 0.5 + Math.sin(time5 * 2 + i) * b.w * 0.3;
                let px = cx5 + Math.cos(a) * d;
                let py = cy5 + Math.sin(a) * d;
                ctx.fillStyle = rainbow[i % rainbow.length];
                ctx.globalAlpha = 0.55 + Math.sin(time5 * 3 + i) * 0.25;
                ctx.beginPath();
                ctx.arc(px, py, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            
            ctx.restore();
        }
    }

    drawExplosions() {
        let ctx = this.ctx;
        for (let exp of this.explosions) {
            if (exp.flashAlpha > 0) {
                ctx.beginPath();
                ctx.arc(exp.flashX, exp.flashY, 35 * exp.flashAlpha, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 220, 150, ${exp.flashAlpha * 0.7})`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(exp.flashX, exp.flashY, 20 * exp.flashAlpha, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 100, 50, ${exp.flashAlpha * 0.5})`;
                ctx.fill();
            }

            for (let p of exp.particles) {
                if (p.life <= 0) continue;
                let size = (p.size || 3) * p.life;
                ctx.globalAlpha = p.life;

                if (p.type === 'spark') {
                    ctx.fillStyle = p.color;
                    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.fillRect(p.x - size / 4, p.y - size / 4, size / 2, size / 2);
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
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 1.6, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 200, ${p.life * 0.4})`;
                    ctx.fill();
                }
            }
        }
        ctx.globalAlpha = 1;
    }
    
    drawFloatingTexts() {
        let ctx = this.ctx;
        for (let ft of this.floatingTexts) {
            ctx.save();
            
            let lifeRatio = ft.life / ft.maxLife;
            ctx.globalAlpha = lifeRatio;  // 逐渐变透明
            
            ctx.font = `bold ${Math.floor(18 * ft.scale)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 文字描边
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.strokeText(ft.text, ft.x, ft.y);
            
            // 文字填充
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
            
            ctx.restore();
        }
    }
    
    drawComboInfo() {
        if (this.combo > 1 && this.comboTimer > 0) {
            let ctx = this.ctx;
            ctx.save();
            
            let lifeRatio = this.comboTimer / this.comboDuration;
            ctx.globalAlpha = lifeRatio;
            
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            
            // 连击文字
            let comboText = `${this.combo}x COMBO!`;
            let color = this.getComboColor(this.combo);
            
            // 文字阴影
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.strokeText(comboText, 10, 35);
            
            ctx.fillStyle = color;
            ctx.fillText(comboText, 10, 35);
            
            ctx.restore();
        }
    }

    drawHUDinfo() {
        let ctx = this.ctx;
        ctx.shadowBlur = 0;

        if (!this.gameRunning) {
            ctx.font = "bold 38px monospace";
            ctx.fillStyle = "#ff6680";
            ctx.textAlign = "center";
            ctx.fillText("💀 GAME OVER 💀", this.W / 2, this.H / 2 - 50);
            ctx.font = "bold 18px monospace";
            ctx.fillStyle = "#ddddaa";
            ctx.fillText("点击「重新起飞」继续征战星河", this.W / 2, this.H / 2 + 40);
            ctx.textAlign = "left";
        }
        
        if (this.invincibleTimer > 0) {
            ctx.font = "bold 16px monospace";
            ctx.fillStyle = "#9effcf";
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#9effcf";
            ctx.fillText("✨ 护盾激活 ✨", this.player.x - 10, this.player.y - 12);
            ctx.shadowBlur = 0;
        }
    }
    
    drawStartScreen() {
        let ctx = this.ctx;
        
        // 显示开始提示
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, this.W, this.H);
        
        ctx.font = "bold 32px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#2affcc";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#2affcc";
        ctx.fillText("🚀 点击开始游戏 🚀", this.W / 2, this.H / 2);
        
        ctx.font = "16px Arial";
        ctx.fillStyle = "#888";
        ctx.shadowBlur = 0;
        ctx.fillText("WASD 或 方向键 移动 | 子弹自动发射", this.W / 2, this.H / 2 + 40);
        
        ctx.textAlign = "left";
    }

    drawBackgroundGrid() {
        let ctx = this.ctx;
        let planetIndex = Math.floor(this.score / 1000) % 8;

        const planets = [
            { name: '水星', base: '#8c8c8c', accent: '#a0a0a0', glow: '#d0d0d0' },
            { name: '金星', base: '#e6c87a', accent: '#d4a84b', glow: '#f5deb3' },
            { name: '地球', base: '#4a90d9', accent: '#2e7d32', glow: '#87ceeb' },
            { name: '火星', base: '#c1440e', accent: '#8b4513', glow: '#ff6347' },
            { name: '木星', base: '#d4a574', accent: '#c4956a', glow: '#daa520' },
            { name: '土星', base: '#f4d59e', accent: '#e8c07d', glow: '#ffd700' },
            { name: '天王星', base: '#72d5e8', accent: '#4fb3bf', glow: '#afeeee' },
            { name: '海王星', base: '#4169e1', accent: '#1e3a8a', glow: '#6495ed' }
        ];

        let currentPlanet = planets[planetIndex];
        let prevPlanet = this._cachedPlanet || currentPlanet;

        // 计算过渡进度
        let transitionAlpha = 0;
        if (this._transitioning) {
            let elapsed = Date.now() - this._transitionStartTime;
            if (elapsed >= this._transitionDuration) {
                this._transitioning = false;
                transitionAlpha = 1;
                // 过渡结束，更新缓存
                this._cachedPlanetIndex = planetIndex;
                this._cachedPlanet = currentPlanet;
                prevPlanet = currentPlanet;
            } else {
                transitionAlpha = this.easeInOutCubic(elapsed / this._transitionDuration);
            }
        } else {
            // 检测星球切换，开始过渡
            if (planetIndex !== this._cachedPlanetIndex && this._cachedPlanetIndex >= 0) {
                this._transitioning = true;
                this._transitionStartTime = Date.now();
                transitionAlpha = 0;
            } else {
                // 正常状态，更新缓存
                this._cachedPlanetIndex = planetIndex;
                this._cachedPlanet = currentPlanet;
            }
        }

        // 绘制旧背景（底层）
        let prevGradient = ctx.createLinearGradient(0, 0, 0, this.H);
        prevGradient.addColorStop(0, this.darkenColor(prevPlanet.base, 0.3));
        prevGradient.addColorStop(0.5, this.darkenColor(prevPlanet.base, 0.5));
        prevGradient.addColorStop(1, this.darkenColor(prevPlanet.base, 0.7));
        ctx.fillStyle = prevGradient;
        ctx.fillRect(0, 0, this.W, this.H);

        // 绘制新背景（顶层，带透明度过渡）
        if (this._transitioning) {
            let newGradient = ctx.createLinearGradient(0, 0, 0, this.H);
            newGradient.addColorStop(0, this.darkenColor(currentPlanet.base, 0.3));
            newGradient.addColorStop(0.5, this.darkenColor(currentPlanet.base, 0.5));
            newGradient.addColorStop(1, this.darkenColor(currentPlanet.base, 0.7));
            
            ctx.globalAlpha = transitionAlpha;
            ctx.fillStyle = newGradient;
            ctx.fillRect(0, 0, this.W, this.H);
            ctx.globalAlpha = 1;
        }

        // 使用当前星球的装饰元素
        let displayPlanet = this._transitioning ? currentPlanet : prevPlanet;

        ctx.globalAlpha = 0.15;
        for (let i = 0; i < 30; i++) {
            let x = (i * 73 + this.frame * 0.1) % this.W;
            let y = (i * 47 + this.frame * 0.05) % this.H;
            let size = 2 + (i % 3);
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = displayPlanet.glow;
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 20; i++) {
            let x = (i * 89 + this.frame * 0.15) % this.W;
            let y = (i * 61 + this.frame * 0.08) % this.H;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 30 + (i % 20), y + 10 + (i % 15));
            ctx.strokeStyle = displayPlanet.accent;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // 土星光环
        if (planetIndex === 5) {
            ctx.globalAlpha = 0.1;
            let time = Date.now() / 2000;
            let cx = this.W * 0.8, cy = this.H * 0.15;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 80 + Math.sin(time) * 5, 20 + Math.cos(time) * 2, 0, 0, Math.PI * 2);
            ctx.strokeStyle = '#f5deb3';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // 木星条纹
        if (planetIndex === 4) {
            ctx.globalAlpha = 0.08;
            for (let i = 0; i < 5; i++) {
                ctx.fillStyle = displayPlanet.accent;
                ctx.fillRect(0, this.H * 0.2 + i * 40, this.W, 8 + (i % 3) * 3);
            }
            ctx.globalAlpha = 1;
        }
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    darkenColor(hex, factor) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        r = Math.floor(r * (1 - factor));
        g = Math.floor(g * (1 - factor));
        b = Math.floor(b * (1 - factor));
        return `rgb(${r}, ${g}, ${b})`;
    }

    drawPowerUps() {
        let ctx = this.ctx;
        for (let p of this.powerUps) {
            ctx.save();

            let cx = p.x + p.w / 2;
            let cy = p.y + p.h / 2;
            ctx.translate(cx, cy);
            ctx.rotate(p.rotation);

            let pulseScale = 1 + Math.sin(Date.now() / 500) * 0.1;
            ctx.scale(pulseScale, pulseScale);

            // [性能优化] 用半透明外圈替代 shadowBlur
            ctx.beginPath();
            ctx.moveTo(0, -p.h / 2 - 3);
            ctx.lineTo(p.w / 2 + 3, 0);
            ctx.lineTo(0, p.h / 2 + 3);
            ctx.lineTo(-p.w / 2 - 3, 0);
            ctx.closePath();
            ctx.fillStyle = p.color.replace(')', ', 0.25)').replace('rgb', 'rgba').replace('#', '');
            // 简化：直接用半透明色
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = p.color;
            ctx.fill();

            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(0, -p.h / 2);
            ctx.lineTo(p.w / 2, 0);
            ctx.lineTo(0, p.h / 2);
            ctx.lineTo(-p.w / 2, 0);
            ctx.closePath();

            ctx.fillStyle = p.color;
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "white";
            ctx.fillText(p.icon, 0, 0);

            ctx.restore();
        }
    }

    drawScene() {
        this.drawBackgroundGrid();
        this.drawStars();
        
        // 如果游戏未开始，显示开始画面
        if (!this.gameStarted) {
            this.drawStartScreen();
            return;
        }
        
        for (let e of this.enemies) this.drawEnemy(e);
        this.drawBullets();
        this.drawPlayer();
        this.drawPowerUps();
        this.drawExplosions();
        this.drawFloatingTexts();  // 绘制浮动得分
        this.drawComboInfo();      // 绘制连击信息
        this.drawHUDinfo();

        this.ctx.font = "12px monospace";
        this.ctx.fillStyle = "#66ffccaa";
        this.ctx.fillText("经典弹幕 · 火力全开", this.W - 130, 30);
    }

    // ─────────── 游戏主循环 ───────────

    gameLoop() {
        let now = performance.now() / 1000;
        let dt = Math.min(now - this.lastTime, this.DT_CAP);
        this.lastTime = now;

        if (this.gameRunning) {
            this.updateGame(dt);
        }
        this.drawScene();
        this.frame++;
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    // ─────────── 输入处理 ───────────

    handleKeyDown(e) {
        let code = e.code;
        if (this.keys.hasOwnProperty(code)) {
            this.keys[code] = true;
            e.preventDefault();
        }
        if (code === 'Space') {
            e.preventDefault();
        }
        if (code === 'KeyR') {
            e.preventDefault();
            this.restartGame();
        }
    }

    handleKeyUp(e) {
        let code = e.code;
        if (this.keys.hasOwnProperty(code)) {
            this.keys[code] = false;
            e.preventDefault();
        }
    }

    resetKeys() {
        for (let k in this.keys) this.keys[k] = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let _planeGameInstance = null;

    const startPlaneGame = () => {
        if (_planeGameInstance) {
            _planeGameInstance.restartGame();
        } else {
            _planeGameInstance = new PlaneShooterGame();
        }
    };
    window.startPlaneGame = startPlaneGame;
});