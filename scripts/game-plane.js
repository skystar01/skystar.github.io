class PlaneShooterGame {
    constructor() {
        this.W = 1000;
        this.H = 600;

        this.gameRunning = true;
        this.gameStarted = false;
        this.score = 0;
        this.lives = 3;

        // === 最佳分（localStorage 持久化）===
        this.bestScore = 0;
        try {
            const saved = localStorage.getItem('planeShooterBestScore');
            if (saved) this.bestScore = parseInt(saved, 10) || 0;
        } catch (e) {
            // 隐私模式下 localStorage 可能不可用，静默忽略
        }
        this._recordCelebrated = false;

        // === 暂停 ===
        this.paused = false;

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
        this.lastEliteThreshold = 0;
        this.lastBossThreshold = 0;
        this.bossCount = 0;

        // === 渲染 ===
        this.frame = 0;                // 仅用于视觉特效滚动
        this.animationId = null;

        // 飞船移动尾迹
        this.playerTrail = [];

        // 预计算星星数据
        this._initStars();

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
        this.lastEliteThreshold = 0;       // 重置精英生成阈值
        this.lastBossThreshold = 0;        // 重置Boss生成阈值
        this.bossCount = 0;               // 重置Boss计数
        this.paused = false;              // 重置暂停
        this._recordCelebrated = false;   // 重置纪录庆祝标记
        this.restartBtn.innerText = '🔄 重新起飞';
        this.updateUI();
    }

    // ─────────── 最佳分 ───────────

    saveBestScore() {
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            try {
                localStorage.setItem('planeShooterBestScore', String(this.bestScore));
            } catch (e) {
                // 写入失败不阻断游戏
            }
            // 首次突破时只庆祝一次，避免每杀一个都刷屏
            if (!this._recordCelebrated) {
                this._recordCelebrated = true;
                this.createFloatingText(
                    this.W / 2,
                    this.H / 2 - 80,
                    `🏆 NEW RECORD: ${String(this.bestScore).padStart(6, '0')}`,
                    '#fbbf24'
                );
            }
        }
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
            lastShootTime: this.gameTime - Math.random() * 3,
            lastShieldHitTime: 0
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
            phaseTimer: 0,
            lastShieldHitTime: 0
        });
    }
    
    spawnBoss() {
        this.bossCount++;
        let scale = 1 + (this.bossCount - 1) * 0.5;
        let baseHp = 80;
        let hp = Math.floor(baseHp * scale);
        let bossStyle = Math.min(3, this.bossCount - 1);  // 0/1/2/3+
        let names = ["PINK STAR", "VOID CRYSTAL", "GOLDEN LORD", "DARK OBLIVION"];

        let x = this.W / 2 - 75;
        let y = -120;  // 从屏幕外飞入
        this.enemies.push({
            x, y,
            w: 150,
            h: 120,
            hp: hp,
            maxHp: hp,
            type: 3,
            bossStyle: bossStyle,
            bossName: names[bossStyle],
            lastShootTime: this.gameTime,
            lastShieldHitTime: 0,
            moveDirection: 1,
            attackPhase: -1,        // -1 = 进场动画
            phaseTimer: 0,
            patternTimer: 0,
            hitFlash: 0,            // 受击闪烁计时
            warningFlash: 0,        // 阶段切换预警
            dashTarget: null,       // 冲刺目标
            dashTimer: 0,
            entryY: 100,            // 进场目标Y
            entryDone: false,
            phaseChanged: false
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
        const bgColors = {
            shield: 'rgba(59, 130, 246, 0.4)',
            weapon: 'rgba(168, 85, 247, 0.4)',
            life: 'rgba(239, 68, 68, 0.4)',
            homing: 'rgba(236, 72, 153, 0.4)'
        };
        const borderColors = {
            shield: '#3b82f6',
            weapon: '#a855f7',
            life: '#ef4444',
            homing: '#ec4899'
        };

        this.powerUps.push({
            x: Math.random() * (this.W - 30) + 15,
            y: -30,
            w: 25,
            h: 25,
            speed: 100 + Math.random() * 50,
            type,
            bgColor: bgColors[type],
            borderColor: borderColors[type],
            rotation: 0,
            rotationSpeed: (Math.random() - 0.5) * 6
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
                } else {
                    // [UX 优化] 满血时给个反馈，不让道具吃了个寂寞
                    this.createFloatingText(
                        this.player.x + this.PLAYER_WIDTH / 2,
                        this.player.y - 12,
                        'MAX HP',
                        '#51cf66'
                    );
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
                , enemyType: 2 });
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
            , enemyType: 2 });
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
                , enemyType: 2 });
            }
        }
    }
    
    bossShoot(e) {
        let style = e.bossStyle || 0;
        let bx = e.x + e.w / 2;
        let by = e.y + e.h / 2 + 20;
        let px = this.player.x + this.PLAYER_WIDTH / 2;
        let py = this.player.y + this.PLAYER_HEIGHT / 2;
        let dx = px - bx, dy = py - by;
        let dist = Math.hypot(dx, dy);
        if (dist > 0) { dx /= dist; dy /= dist; }

        // === Boss A (style 0): Pink Energy - Spiral + Tracking ===
        if (style === 0) {
            if (e.attackPhase === 0) {
                // Scatter + spiral
                for (let i = -2; i <= 2; i++) {
                    let a = Math.atan2(py - by, px - bx) + i * 0.12;
                    let s = 150 + Math.random() * 50;
                    this.enemyBullets.push({ x: bx - 5, y: by, w: 10, h: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color: '#fd79a8' , enemyType: 2 });
                }
                let sa = e.patternTimer * 5;
                for (let i = 0; i < 3; i++) {
                    let a = sa + (i / 3) * Math.PI * 2;
                    this.enemyBullets.push({ x: bx - 4, y: by, w: 8, h: 8, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100 + 40, color: '#e17055' , enemyType: 2 });
                }
            } else if (e.attackPhase === 1) {
                // Big tracking + delayed bomb
                this.enemyBullets.push({ x: bx - 18, y: by, w: 36, h: 36, vx: dx * 200, vy: dy * 200, color: '#a29bfe', damage: 2 , enemyType: 2 });
                if (Math.random() < 0.4) this.enemyBullets.push({ x: bx - 8, y: by, w: 16, h: 16, vx: dx * 60, vy: dy * 60, color: '#ffeaa7', delayed: true, fuseTimer: 1.8 , enemyType: 2 });
            } else if (e.attackPhase === 2) {
                // 12-way ring
                for (let i = 0; i < 12; i++) {
                    let a = (i / 12) * Math.PI * 2 + e.patternTimer * 3;
                    this.enemyBullets.push({ x: bx - 3, y: by, w: 6, h: 6, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, color: '#74b9ff' , enemyType: 2 });
                }
            } else {
                // Tracking rain + ring
                for (let i = 0; i < 2; i++) this.enemyBullets.push({ x: bx - 10, y: by + i * 25, w: 18, h: 18, vx: dx * 170, vy: dy * 170, color: '#ffeaa7', homing: true , enemyType: 2 });
                for (let i = 0; i < 8; i++) { let a = (i / 8) * Math.PI * 2 + e.patternTimer; this.enemyBullets.push({ x: bx - 5, y: by, w: 10, h: 10, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, color: '#fdcb6e' , enemyType: 2 }); }
            }
        }

        // === Boss B (style 1): Purple Crystal - Wide Fan + Double Ring + Triple Tracking ===
        else if (style === 1) {
            if (e.attackPhase === 0) {
                // Wide fan: 7 bullets
                for (let i = -3; i <= 3; i++) {
                    let a = Math.atan2(py - by, px - bx) + i * 0.22;
                    this.enemyBullets.push({ x: bx - 4, y: by, w: 10, h: 10, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, color: '#a29bfe' , enemyType: 2 });
                }
            } else if (e.attackPhase === 1) {
                // Double ring: alternating rotation
                for (let ring = 0; ring < 2; ring++) {
                    let rot = e.patternTimer * (2 + ring) * (ring === 0 ? 1 : -1);
                    for (let i = 0; i < 6; i++) {
                        let a = (i / 6) * Math.PI * 2 + rot;
                        this.enemyBullets.push({ x: bx - 3, y: by, w: 6, h: 6, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, color: ring === 0 ? '#6c5ce7' : '#fd79a8' , enemyType: 2 });
                    }
                }
            } else if (e.attackPhase === 2) {
                // Triple tracking bullets
                for (let i = 0; i < 3; i++) {
                    let spread = (i - 1) * 0.08;
                    let a = Math.atan2(py - by + i * 10, px - bx) + spread;
                    this.enemyBullets.push({ x: bx - 6, y: by, w: 12, h: 12, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, color: '#ffeaa7', homing: true , enemyType: 2 });
                }
            } else {
                // Hexagonal spray
                for (let i = 0; i < 6; i++) {
                    let a = (i / 6) * Math.PI * 2 + e.patternTimer * 1.5;
                    this.enemyBullets.push({ x: bx - 4, y: by, w: 8, h: 8, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 + 50, color: '#74b9ff' , enemyType: 2 });
                }
            }
        }

        // === Boss C (style 2): Golden Emperor - Expanding Ring + Fast Aim + Cross ===
        else if (style === 2) {
            if (e.attackPhase === 0) {
                // Expanding ring + slow orbs
                for (let i = 0; i < 16; i++) {
                    let a = (i / 16) * Math.PI * 2 + e.patternTimer * 1.2;
                    this.enemyBullets.push({ x: bx - 3, y: by, w: 6, h: 6, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, color: '#fdcb6e' , enemyType: 2 });
                }
                // Slow big ball
                this.enemyBullets.push({ x: bx - 15, y: by, w: 30, h: 30, vx: dx * 90, vy: dy * 90, color: '#fab1a0', damage: 2 , enemyType: 2 });
            } else if (e.attackPhase === 1) {
                // Fast aimed bullets
                for (let i = -1; i <= 1; i++) {
                    let a = Math.atan2(py - by, px - bx) + i * 0.06;
                    this.enemyBullets.push({ x: bx - 3, y: by, w: 5, h: 14, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, color: '#ffeaa7' , enemyType: 2 });
                }
            } else if (e.attackPhase === 2) {
                // Cross rotating
                let cr = e.patternTimer * 2;
                for (let i = 0; i < 4; i++) {
                    let a = (i / 4) * Math.PI * 2 + cr;
                    this.enemyBullets.push({ x: bx - 4, y: by, w: 8, h: 8, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, color: '#fbbf24' , enemyType: 2 });
                }
            } else {
                // Side wall bullets
                for (let side = 0; side < 2; side++) {
                    let sx = side === 0 ? 20 : this.W - 20;
                    let targetAngle = Math.atan2(py - by, px - sx);
                    this.enemyBullets.push({ x: sx, y: by - 40 + side * 80, w: 8, h: 8, vx: Math.cos(targetAngle) * 180, vy: Math.sin(targetAngle) * 180, color: '#ef4444' , enemyType: 2 });
                }
            }
        }

        // === Boss D (style 3): Dark Destroyer - Chaos + Wall + Mines ===
        else {
            if (e.attackPhase === 0) {
                // Chaotic scatter
                for (let i = 0; i < 8; i++) {
                    let a = Math.random() * Math.PI * 2;
                    let s = 100 + Math.random() * 180;
                    this.enemyBullets.push({ x: bx - 3, y: by, w: 8, h: 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 30, color: '#f59e0b' , enemyType: 2 });
                }
            } else if (e.attackPhase === 1) {
                // Moving bullet wall
                let wallX = bx + Math.sin(e.patternTimer * 0.7) * 200;
                for (let i = 0; i < 8; i++) {
                    let wy = e.y + i * (e.h / 7);
                    this.enemyBullets.push({ x: Math.max(20, Math.min(this.W - 20, wallX)) - 5, y: wy, w: 10, h: 10, vx: 0, vy: 160, color: '#ef4444' , enemyType: 2 });
                }
            } else if (e.attackPhase === 2) {
                // Delayed mine field + fast shot
                for (let i = 0; i < 5; i++) {
                    let a = (i / 5) * Math.PI * 2 + e.patternTimer * 0.5;
                    this.enemyBullets.push({ x: bx - 6, y: by, w: 14, h: 14, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 + 80, color: '#7c3aed', delayed: true, fuseTimer: 1.2 , enemyType: 2 });
                }
                this.enemyBullets.push({ x: bx - 3, y: by, w: 5, h: 16, vx: dx * 280, vy: dy * 280, color: '#fbbf24' , enemyType: 2 });
            } else {
                // All-direction burst + homing
                for (let i = 0; i < 10; i++) {
                    let a = (i / 10) * Math.PI * 2 + e.patternTimer * 2;
                    this.enemyBullets.push({ x: bx - 4, y: by, w: 8, h: 8, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, color: '#f97316' , enemyType: 2 });
                }
                this.enemyBullets.push({ x: bx - 8, y: by, w: 18, h: 18, vx: dx * 190, vy: dy * 190, color: '#ef4444', homing: true , enemyType: 2 });
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

        // 飞船移动尾迹粒子
        this._updatePlayerTrail(dt);

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
                    if (e.type >= 2) e.hitFlash = 1.0;  // 精英/Boss受击闪烁
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
                        this.saveBestScore();  // 检查是否破纪录
                        
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
                        
                        // 精英死亡：标记已处理
                        if (e.type === 3) {
                            // Boss死亡：大量道具掉落
                            this.createPowerUp('shield');
                            this.createPowerUp('weapon');
                            this.createPowerUp('life');
                            if (this.bossCount >= 2) this.createPowerUp('homing');
                            // 大爆炸特效
                            for (let k = 0; k < 3; k++) {
                                let ox = e.x + e.w / 2 + (Math.random() - 0.5) * 80;
                                let oy = e.y + e.h / 2 + (Math.random() - 0.5) * 60;
                                this.createExplosion(ox, oy);
                            }
                            // Boss击杀提示
                            this.createFloatingText(e.x + e.w / 2, e.y - 10, 'BOSS DEFEATED!', '#fbbf24');
                        }
                        
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
        e.hitFlash = Math.max(0, e.hitFlash - dt * 3);
        e.phaseTimer += dt;
        e.patternTimer += dt;
        
        // ── 进场动画：从屏幕外飞入 ──
        if (!e.entryDone) {
            e.y += 120 * dt;  // 快速下飞
            if (e.y >= e.entryY) {
                e.y = e.entryY;
                e.entryDone = true;
                e.attackPhase = 0;
                e.phaseTimer = 0;
                e.warningFlash = 1.8;  // 进场后短闪一下当开场秀
                this.createFloatingText(e.x + e.w / 2, e.y - 20, '⚠ BOSS ⚠', '#fbbf24');
            }
            return;  // 进场期间不攻击不移动
        }
        
        // ── 阶段切换预警 ──
        if (e.warningFlash > 0) {
            e.warningFlash -= dt;
            if (e.warningFlash <= 0) {
                e.phaseChanged = false;
            }
        }
        
        let phaseDuration = 6;  // 每个阶段持续6秒
        if (e.phaseTimer >= phaseDuration - 1.2 && !e.phaseChanged) {
            // 切换前1.2秒预警
            e.warningFlash = 1.2;
            e.phaseChanged = true;
        }
        if (e.phaseTimer >= phaseDuration) {
            e.phaseTimer = 0;
            e.attackPhase = (e.attackPhase + 1) % 4;
            e.patternTimer = 0;
            e.phaseChanged = false;
        }
        
        // ── 冲刺攻击（30%概率，阶段1和3时）──
        if ((e.attackPhase === 1 || e.attackPhase === 3) && !e.dashTarget) {
            e.dashTimer += dt;
            if (e.dashTimer > 2.5 && Math.random() < 0.02) {
                let px = this.player.x + this.PLAYER_WIDTH / 2;
                e.dashTarget = { x: px - e.w / 2, y: e.y };
                e.dashTimer = 0;
            }
        }
        if (e.dashTarget) {
            let dx = e.dashTarget.x - e.x;
            let dy = e.dashTarget.y - e.y;
            let dist = Math.hypot(dx, dy);
            if (dist < 30 || e.dashTimer > 1.5) {
                e.dashTarget = null;
                e.dashTimer = 0;
            } else {
                e.x += (dx / dist) * 400 * dt;
                e.y += (dy / dist) * 400 * dt;
                return;  // 冲刺时不射击
            }
        }
        
        // ── 正常移动（密集弹幕阶段减速）──
        let moveSpeedByPhase = [40, 90, 20, 95];
        let moveSpeed = moveSpeedByPhase[e.attackPhase] || 80;
        e.x += e.moveDirection * moveSpeed * dt;
        if (e.x <= 10 || e.x >= this.W - e.w - 10) {
            e.moveDirection *= -1;
        }
        
        // Boss attack intervals: different rhythm per boss style
        let bossIntervals = [
            [0.8, 1.1, 0.7, 0.9],    // Boss A
            [1.1, 1.3, 0.85, 1.0],   // Boss B
            [1.0, 1.2, 0.9, 1.0],    // Boss C
            [1.1, 1.4, 0.95, 1.1]    // Boss D
        ];
        let siSrc = (e.bossStyle !== undefined && bossIntervals[e.bossStyle]) ? bossIntervals[e.bossStyle] : bossIntervals[0];
        let shootInterval = siSrc[e.attackPhase] || 0.9;

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

            // 延时爆炸弹：引信到期 → 炸成8方向
            if (eb.delayed && eb.fuseTimer !== undefined) {
                eb.fuseTimer -= dt;
                if (eb.fuseTimer <= 0) {
                    for (let j = 0; j < 8; j++) {
                        let angle = (j / 8) * Math.PI * 2;
                        this.enemyBullets.push({
                            x: eb.x, y: eb.y,
                            w: 8, h: 8,
                            vx: Math.cos(angle) * 180,
                            vy: Math.sin(angle) * 180,
                            color: '#ff6b6b'
                        , enemyType: 2 });
                    }
                    this.enemyBullets.splice(i, 1);
                    continue;
                }
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
                    let hasShield = this.shieldCount > 0;
                    let isInvincible = this.invincibleTimer > 0;

                    if (hasShield || isInvincible) {
                        // ── 护盾/无敌碰撞伤害 ──
                        if (hasShield) {
                            this.shieldCount--;
                            // 护盾碰撞：造成伤害（1秒冷却），小怪直接撞死
                            let now = this.gameTime;
                            if (!e.lastShieldHitTime) e.lastShieldHitTime = 0;
                            if (now - e.lastShieldHitTime >= 1.0) {
                                e.lastShieldHitTime = now;
                                let dmg = (e.hp <= 3) ? e.hp : 3;
                                e.hp -= dmg;
                                if (e.type >= 2) e.hitFlash = 1.0;
                            }
                        }
                        // 无敌金光期间不造成碰撞伤害（纯防御）
                    } else {
                        // 无护盾无无敌：直接扣命
                        this.lives--;
                        this.updateUI();
                        if (this.lives <= 0) {
                            this.gameRunning = false;
                            this.restartBtn.innerText = '🔄 重新起飞';
                        } else {
                            this.invincibleTimer = this.invincibleDuration;
                        }
                    }
                    // 小怪/残血敌机直接移除
                    if (e.hp <= 0) {
                        this.createExplosion(e.x + e.w / 2, e.y + e.h / 2);
                        if (e.type === 3) {
                            this.createPowerUp('shield');
                            this.createPowerUp('weapon');
                            this.createPowerUp('life');
                            if (this.bossCount >= 2) this.createPowerUp('homing');
                            for (let k = 0; k < 3; k++) {
                                let ox = e.x + e.w / 2 + (Math.random() - 0.5) * 80;
                                let oy = e.y + e.h / 2 + (Math.random() - 0.5) * 60;
                                this.createExplosion(ox, oy);
                            }
                            this.createFloatingText(e.x + e.w / 2, e.y - 10, 'BOSS DEFEATED!', '#fbbf24');
                        }
                        this.enemies.splice(i, 1);
                    }
                } else {
                    this.enemies.splice(i, 1);
                }
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
        if (!hasBoss && !hasElite && eliteThreshold > this.lastEliteThreshold && eliteThreshold >= 2000) {
            this.spawnEliteEnemy();
            this.lastEliteThreshold = eliteThreshold;
        }
        
        // 检查是否需要生成Boss（每5000分，不与精英同场）
        let bossThreshold = Math.floor(this.score / 5000) * 5000;
        if (!hasBoss && !hasElite && bossThreshold > this.lastBossThreshold && bossThreshold >= 5000) {
            this.spawnBoss();
            this.lastBossThreshold = bossThreshold;
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

    // ===== 玩家飞船 5 级调色板（统一管理）=====
    static PLAYER_PALETTES = {
        1: { main: '#67e8f9', mid: '#22d3ee', dark: '#0891b2', accent: '#ecfeff', flame1: '#67e8f9', flame2: '#22d3ee', aura: 'rgba(103, 232, 249, 0.45)' },
        2: { main: '#f472b6', mid: '#ec4899', dark: '#9d174d', accent: '#fce7f3', flame1: '#f472b6', flame2: '#ec4899', aura: 'rgba(244, 114, 182, 0.45)' },
        3: { main: '#fb923c', mid: '#f97316', dark: '#9a3412', accent: '#fed7aa', flame1: '#fb923c', flame2: '#f59e0b', aura: 'rgba(251, 146, 60, 0.5)' },
        4: { main: '#a855f7', mid: '#9333ea', dark: '#6b21a8', accent: '#e9d5ff', flame1: '#c084fc', flame2: '#a855f7', aura: 'rgba(168, 85, 247, 0.55)' },
        5: { main: '#fbbf24', mid: '#f59e0b', dark: '#92400e', accent: '#fef3c7', flame1: '#fde047', flame2: '#fbbf24', aura: 'rgba(251, 191, 36, 0.6)' }
    };

    // hex → "r, g, b"（用于 rgba 字符串拼接）
    static _hexToRgbStr(hex) {
        const m = hex.replace('#', '');
        return `${parseInt(m.slice(0,2), 16)}, ${parseInt(m.slice(2,4), 16)}, ${parseInt(m.slice(4,6), 16)}`;
    }

    drawPlayer() {
        const ctx = this.ctx;
        const px = this.player.x, py = this.player.y;
        const W = this.PLAYER_WIDTH, H = this.PLAYER_HEIGHT;
        const level = this.getWeaponLevel();

        // 1. 无敌闪烁 alpha
        if (this.invincibleTimer > 0 && (Math.floor(Date.now() / 50) % 3 === 0)) {
            ctx.globalAlpha = 0.6;
        }

        // 2. 道具护盾光环（不旋转，世界坐标系）
        if (this.shieldCount > 0) {
            this._drawPlayerShield(px, py);
        }

        // 3. 无敌光环（不旋转）
        if (this.invincibleTimer > 0) {
            this._drawPlayerInvincibleAura(px, py);
        }

        // 4. 倾斜角度（基于按键状态，模拟转向）
        let tilt = 0;
        if (this.keys.ArrowLeft || this.keys.KeyA) tilt = -0.25;
        else if (this.keys.ArrowRight || this.keys.KeyD) tilt = 0.25;

        // 5. 旋转坐标系（飞船倾斜）
        const cx = px + W / 2;
        const cy = py + H / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);

        // 6. 等级光环（旋转坐标系下）
        if (level >= 3) {
            this._drawPlayerLevelAura(-W/2, -H/2, level);
        }

        // 7. 飞船本体
        this._drawPlayerShip(-W/2, -H/2, level);

        // 8. 引擎火焰
        this._drawPlayerEngines(-W/2, -H/2, level);

        ctx.restore();

        // 9. 尾迹（世界坐标系，旋转外）
        this._drawPlayerTrail();

        ctx.globalAlpha = 1;
    }

    // ─── 飞船本体分发 ───
    _drawPlayerShip(px, py, level) {
        if (level === 1) this._drawShipL1(px, py);
        else if (level === 2) this._drawShipL2(px, py);
        else if (level === 3) this._drawShipL3(px, py);
        else if (level === 4) this._drawShipL4(px, py);
        else this._drawShipL5(px, py);
    }

    // ─── L1 基础战机：上指三角 + 1 引擎 + 座舱 ───
    _drawShipL1(px, py) {
        const ctx = this.ctx;
        const pal = this.constructor.PLAYER_PALETTES[1];
        const W = this.PLAYER_WIDTH, H = this.PLAYER_HEIGHT;
        const cx = px + W / 2;

        // 主体三角
        ctx.fillStyle = pal.main;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, py);
        ctx.lineTo(px + W - 4, py + H - 4);
        ctx.lineTo(cx, py + H - 2);
        ctx.lineTo(px + 4, py + H - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 头部高光三角
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.moveTo(cx, py + 6);
        ctx.lineTo(cx - 3, py + 16);
        ctx.lineTo(cx + 3, py + 16);
        ctx.closePath();
        ctx.fill();

        // 座舱
        ctx.fillStyle = '#0c4a6e';
        ctx.beginPath();
        ctx.ellipse(cx, py + 14, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a5f3fc';
        ctx.beginPath();
        ctx.ellipse(cx - 1, py + 12, 1.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 左右小翼
        ctx.fillStyle = pal.mid;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 22);
        ctx.lineTo(px + 10, py + 28);
        ctx.lineTo(px + 4, py + 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px + W - 4, py + 22);
        ctx.lineTo(px + W - 10, py + 28);
        ctx.lineTo(px + W - 4, py + 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // ─── L2 双翼战机：流线型 + 两侧副翼 + 翼刀 ───
    _drawShipL2(px, py) {
        const ctx = this.ctx;
        const pal = this.constructor.PLAYER_PALETTES[2];
        const W = this.PLAYER_WIDTH, H = this.PLAYER_HEIGHT;
        const cx = px + W / 2;

        // 副翼（梯形，背景）
        ctx.fillStyle = pal.dark;
        ctx.beginPath();
        ctx.moveTo(px + 1, py + 18);
        ctx.lineTo(px + 10, py + 22);
        ctx.lineTo(px + 10, py + 30);
        ctx.lineTo(px + 1, py + 28);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + W - 1, py + 18);
        ctx.lineTo(px + W - 10, py + 22);
        ctx.lineTo(px + W - 10, py + 30);
        ctx.lineTo(px + W - 1, py + 28);
        ctx.closePath();
        ctx.fill();

        // 主体（流线型）
        ctx.fillStyle = pal.main;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, py);
        ctx.lineTo(px + W - 5, py + H - 5);
        ctx.lineTo(cx, py + H - 1);
        ctx.lineTo(px + 5, py + H - 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 高光
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.moveTo(cx, py + 4);
        ctx.lineTo(cx - 3, py + 14);
        ctx.lineTo(cx + 3, py + 14);
        ctx.closePath();
        ctx.fill();

        // 座舱
        ctx.fillStyle = '#831843';
        ctx.beginPath();
        ctx.ellipse(cx, py + 13, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.ellipse(cx - 1, py + 11, 1.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // 翼刀（中段）
        ctx.fillStyle = pal.mid;
        ctx.beginPath();
        ctx.moveTo(px + 9, py + 24);
        ctx.lineTo(px + 14, py + 28);
        ctx.lineTo(px + 9, py + 30);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + W - 9, py + 24);
        ctx.lineTo(px + W - 14, py + 28);
        ctx.lineTo(px + W - 9, py + 30);
        ctx.closePath();
        ctx.fill();
    }

    // ─── L3 重型战机：加厚机身 + 双层翼 ───
    _drawShipL3(px, py) {
        const ctx = this.ctx;
        const pal = this.constructor.PLAYER_PALETTES[3];
        const W = this.PLAYER_WIDTH, H = this.PLAYER_HEIGHT;
        const cx = px + W / 2;

        // 下层翼（大）
        ctx.fillStyle = pal.dark;
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 30);
        ctx.lineTo(px + 14, py + 30);
        ctx.lineTo(px + 10, py + 38);
        ctx.lineTo(px + 2, py + 36);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + W - 2, py + 30);
        ctx.lineTo(px + W - 14, py + 30);
        ctx.lineTo(px + W - 10, py + 38);
        ctx.lineTo(px + W - 2, py + 36);
        ctx.closePath();
        ctx.fill();

        // 上层翼（小）
        ctx.fillStyle = pal.mid;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 6, py + 18);
        ctx.lineTo(px + 12, py + 20);
        ctx.lineTo(px + 10, py + 26);
        ctx.lineTo(px + 6, py + 26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px + W - 6, py + 18);
        ctx.lineTo(px + W - 12, py + 20);
        ctx.lineTo(px + W - 10, py + 26);
        ctx.lineTo(px + W - 6, py + 26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 主体（加厚梯形）
        ctx.fillStyle = pal.main;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, py);
        ctx.lineTo(px + W - 8, py + H - 8);
        ctx.lineTo(px + W - 12, py + H - 4);
        ctx.lineTo(px + 12, py + H - 4);
        ctx.lineTo(px + 8, py + H - 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 装甲纹（中部）
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 10, py + 22);
        ctx.lineTo(px + W - 10, py + 22);
        ctx.stroke();

        // 座舱
        ctx.fillStyle = '#7c2d12';
        ctx.beginPath();
        ctx.ellipse(cx, py + 13, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath();
        ctx.ellipse(cx - 1, py + 11, 2, 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ─── L4 科技战舰：六边形主机身 + 4 角引擎舱 ───
    _drawShipL4(px, py) {
        const ctx = this.ctx;
        const pal = this.constructor.PLAYER_PALETTES[4];
        const W = this.PLAYER_WIDTH, H = this.PLAYER_HEIGHT;
        const cx = px + W / 2;

        // 4 角引擎舱（背景）
        ctx.fillStyle = pal.dark;
        [[px + 5, py + 30], [px + W - 5, py + 30], [px + 5, py + 38], [px + W - 5, py + 38]].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        });

        // 主机身（六边形）
        ctx.fillStyle = pal.main;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, py + 2);
        ctx.lineTo(px + W - 8, py + 12);
        ctx.lineTo(px + W - 8, py + 28);
        ctx.lineTo(cx, py + 36);
        ctx.lineTo(px + 8, py + 28);
        ctx.lineTo(px + 8, py + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 内部高光
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.moveTo(cx, py + 6);
        ctx.lineTo(cx - 4, py + 14);
        ctx.lineTo(cx + 4, py + 14);
        ctx.closePath();
        ctx.fill();

        // 座舱（圆形大）
        ctx.fillStyle = '#581c87';
        ctx.beginPath();
        ctx.arc(cx, py + 18, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e9d5ff';
        ctx.beginPath();
        ctx.arc(cx - 1, py + 16, 2, 0, Math.PI * 2);
        ctx.fill();

        // 翼刀
        ctx.fillStyle = pal.mid;
        ctx.beginPath();
        ctx.moveTo(px + 6, py + 20);
        ctx.lineTo(px + 14, py + 24);
        ctx.lineTo(px + 6, py + 28);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + W - 6, py + 20);
        ctx.lineTo(px + W - 14, py + 24);
        ctx.lineTo(px + W - 6, py + 28);
        ctx.closePath();
        ctx.fill();
    }

    // ─── L5 究极战舰：金色多层 + 紫色装饰 + 能量核心 ───
    _drawShipL5(px, py) {
        const ctx = this.ctx;
        const pal = this.constructor.PLAYER_PALETTES[5];
        const W = this.PLAYER_WIDTH, H = this.PLAYER_HEIGHT;
        const cx = px + W / 2;
        const time = Date.now() / 100;
        const pulse = Math.sin(time * 3) * 0.1 + 0.9;

        // 外层紫色装饰翼（背景）
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 18);
        ctx.lineTo(px + 16, py + 22);
        ctx.lineTo(px + 14, py + 38);
        ctx.lineTo(px + 2, py + 34);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + W - 2, py + 18);
        ctx.lineTo(px + W - 16, py + 22);
        ctx.lineTo(px + W - 14, py + 38);
        ctx.lineTo(px + W - 2, py + 34);
        ctx.closePath();
        ctx.fill();

        // 主机身（金色）
        ctx.fillStyle = pal.main;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, py);
        ctx.lineTo(px + W - 10, py + 10);
        ctx.lineTo(px + W - 10, py + 30);
        ctx.lineTo(cx, py + 38);
        ctx.lineTo(px + 10, py + 30);
        ctx.lineTo(px + 10, py + 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 第二层（紫色装饰条）
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath();
        ctx.moveTo(cx, py + 8);
        ctx.lineTo(px + W - 12, py + 16);
        ctx.lineTo(px + W - 12, py + 24);
        ctx.lineTo(cx, py + 30);
        ctx.lineTo(px + 12, py + 24);
        ctx.lineTo(px + 12, py + 16);
        ctx.closePath();
        ctx.fill();

        // 高光三角
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.moveTo(cx, py + 4);
        ctx.lineTo(cx - 3, py + 12);
        ctx.lineTo(cx + 3, py + 12);
        ctx.closePath();
        ctx.fill();

        // 能量核心（金色脉冲）
        const coreGrad = ctx.createRadialGradient(cx, py + 19, 0, cx, py + 19, 7 * pulse);
        coreGrad.addColorStop(0, '#fff');
        coreGrad.addColorStop(0.3, '#fef3c7');
        coreGrad.addColorStop(0.7, '#fbbf24');
        coreGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, py + 19, 7 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // 核心高光点
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - 1, py + 18, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 翼尖装饰
        ctx.fillStyle = pal.mid;
        ctx.beginPath();
        ctx.moveTo(px + 8, py + 20);
        ctx.lineTo(px + 16, py + 24);
        ctx.lineTo(px + 8, py + 28);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + W - 8, py + 20);
        ctx.lineTo(px + W - 16, py + 24);
        ctx.lineTo(px + W - 8, py + 28);
        ctx.closePath();
        ctx.fill();
    }

    // ─── 引擎火焰（每级数量递增）───
    _drawPlayerEngines(px, py, level) {
        const ctx = this.ctx;
        const pal = this.constructor.PLAYER_PALETTES[level];
        const W = this.PLAYER_WIDTH;
        const cy = py + this.PLAYER_HEIGHT;
        const time = Date.now() / 80;
        const baseFlame = 8 + Math.sin(time) * 3;

        if (level === 1) {
            this._drawFlame(px + W / 2, cy, 6, baseFlame, pal);
        } else if (level === 2) {
            this._drawFlame(px + 12, cy, 6, baseFlame * 1.1, pal);
            this._drawFlame(px + W - 12, cy, 6, baseFlame * 1.1, pal);
        } else if (level === 3) {
            this._drawFlame(px + W / 2, cy, 8, baseFlame * 1.3, pal);
            this._drawFlame(px + 8, cy, 4, baseFlame * 0.9, pal);
            this._drawFlame(px + W - 8, cy, 4, baseFlame * 0.9, pal);
        } else if (level === 4) {
            this._drawFlame(px + 8, cy, 4, baseFlame * 1.1, pal);
            this._drawFlame(px + W - 8, cy, 4, baseFlame * 1.1, pal);
            this._drawFlame(px + W / 2, cy, 7, baseFlame * 1.4, pal);
            this._drawFlame(px + W / 2, cy + 4, 5, baseFlame * 0.7, pal);
        } else {
            // L5: 6 引擎 + 长火焰
            const longFlame = baseFlame * 1.8;
            this._drawFlame(px + 6, cy, 4, longFlame, pal, 0.7);
            this._drawFlame(px + 18, cy, 4, longFlame, pal, 0.7);
            this._drawFlame(px + W - 18, cy, 4, longFlame, pal, 0.7);
            this._drawFlame(px + W - 6, cy, 4, longFlame, pal, 0.7);
            this._drawFlame(px + W / 2, cy, 8, longFlame * 1.2, pal, 1);
            this._drawFlame(px + W / 2, cy + 4, 5, longFlame * 0.5, pal, 0.5);
        }
    }

    // 单个引擎火焰
    _drawFlame(x, y, w, h, pal, alphaMul = 1) {
        const ctx = this.ctx;
        const rgb1 = this.constructor._hexToRgbStr(pal.flame1);
        const rgb2 = this.constructor._hexToRgbStr(pal.flame2);
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * alphaMul})`);
        grad.addColorStop(0.3, `rgba(${rgb1}, ${0.85 * alphaMul})`);
        grad.addColorStop(0.7, `rgba(${rgb2}, ${0.5 * alphaMul})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 4, y + h);
        ctx.lineTo(x - w / 4, y + h);
        ctx.closePath();
        ctx.fill();
    }

    // ─── 等级光环（L3+，光晕 + 旋转环）───
    _drawPlayerLevelAura(px, py, level) {
        const ctx = this.ctx;
        const pal = this.constructor.PLAYER_PALETTES[level];
        const cx = px + this.PLAYER_WIDTH / 2;
        const cy = py + this.PLAYER_HEIGHT / 2;
        const r = this.PLAYER_WIDTH / 2 + 6 + level;
        const time = Date.now() / 100;

        // 径向光晕
        const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.3);
        grad.addColorStop(0, pal.aura);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // L4+ 旋转光环
        if (level >= 4) {
            const teeth = 6;
            const segLen = Math.PI * 0.5 / teeth;
            ctx.strokeStyle = pal.aura;
            ctx.lineWidth = 2;
            for (let i = 0; i < teeth; i++) {
                const a = time * (level === 5 ? 2 : 1) + i * (Math.PI * 2 / teeth);
                ctx.beginPath();
                ctx.arc(cx, cy, r + 3, a, a + segLen);
                ctx.stroke();
            }
        }

        // L5 第二层反向旋转
        if (level >= 5) {
            const teeth = 8;
            const segLen = Math.PI * 0.4 / teeth;
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < teeth; i++) {
                const a = -time * 1.5 + i * (Math.PI * 2 / teeth);
                ctx.beginPath();
                ctx.arc(cx, cy, r + 7, a, a + segLen);
                ctx.stroke();
            }
        }
    }

    // ─── 护盾光环（去 shadowBlur）───
    _drawPlayerShield(px, py) {
        const ctx = this.ctx;
        const pulse = Math.sin(Date.now() / 80) * 0.3 + 0.7;
        const cx = px + this.PLAYER_WIDTH / 2;
        const cy = py + this.PLAYER_HEIGHT / 2;
        const baseR = Math.max(this.PLAYER_WIDTH, this.PLAYER_HEIGHT) / 2 + 12;

        for (let i = 0; i < this.shieldCount; i++) {
            const layerR = baseR + i * 3;
            const layerA = Math.max(0, pulse * (0.4 - i * 0.05));
            ctx.strokeStyle = `rgba(0, 191, 255, ${layerA})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, layerR, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 护盾次数
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00bfff';
        ctx.fillText(`${this.shieldCount}`, cx, py + this.PLAYER_HEIGHT + 20);
        ctx.textAlign = 'left';
    }

    // ─── 无敌光环（去 shadowBlur）───
    _drawPlayerInvincibleAura(px, py) {
        const ctx = this.ctx;
        const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
        const cx = px + this.PLAYER_WIDTH / 2;
        const cy = py + this.PLAYER_HEIGHT / 2;
        const r = Math.max(this.PLAYER_WIDTH, this.PLAYER_HEIGHT) / 2 + 8;
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse * 0.6})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    // ─── 尾迹粒子更新 + 渲染 ───
    _updatePlayerTrail(dt) {
        const moving = (this.keys.ArrowLeft || this.keys.ArrowRight ||
                        this.keys.ArrowUp || this.keys.ArrowDown ||
                        this.keys.KeyA || this.keys.KeyD ||
                        this.keys.KeyW || this.keys.KeyS);

        if (moving && this.gameRunning) {
            const level = this.getWeaponLevel();
            const pal = this.constructor.PLAYER_PALETTES[level];
            const cx = this.player.x + this.PLAYER_WIDTH / 2;
            const cy = this.player.y + this.PLAYER_HEIGHT;

            // 不同等级不同数量光线
            const emitPoints = level === 1 ? [[0, 0]] :
                               level === 2 ? [[-10, 0], [10, 0]] :
                               level === 3 ? [[-12, 0], [0, 0], [12, 0]] :
                               level === 4 ? [[-12, 0], [12, 0], [0, 0], [0, 4]] :
                                              [[-13, 0], [-5, 0], [5, 0], [13, 0], [0, 0], [0, 4]];

            for (const [ox, oy] of emitPoints) {
                this.playerTrail.push({
                    x: cx + ox + (Math.random() - 0.5) * 2,
                    y: cy + oy + Math.random() * 3,
                    vx: (Math.random() - 0.5) * 20,
                    vy: 40 + Math.random() * 30,         // 慢一点，留得久
                    life: 0.35 + Math.random() * 0.2,
                    maxLife: 0.55,
                    width: 1.8 + Math.random() * 1.6,   // 线宽
                    length: 12 + Math.random() * 14,    // 线长 12-26
                    color: pal.flame2
                });
            }
        }

        // 更新
        for (let i = this.playerTrail.length - 1; i >= 0; i--) {
            const p = this.playerTrail[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.playerTrail.splice(i, 1);
        }
    }

    _drawPlayerTrail() {
        const ctx = this.ctx;
        for (const p of this.playerTrail) {
            const lifeRatio = Math.max(0, p.life / p.maxLife);
            const rgb = this.constructor._hexToRgbStr(p.color);

            // 沿速度反方向延伸光线
            const speed = Math.hypot(p.vx, p.vy);
            if (speed < 0.01) continue;
            const dx = (p.vx / speed) * p.length;
            const dy = (p.vy / speed) * p.length;
            const ex = p.x - dx;
            const ey = p.y - dy;

            // 主光线（沿速度反方向渐变）
            const grad = ctx.createLinearGradient(p.x, p.y, ex, ey);
            grad.addColorStop(0, `rgba(${rgb}, ${lifeRatio * 0.95})`);
            grad.addColorStop(0.5, `rgba(${rgb}, ${lifeRatio * 0.5})`);
            grad.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = p.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }
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

        // 普通敌机手画（升级版：倒三角机身 + 翼刀 + 引擎火焰 + 眼睛）
        if (true) {
            const cx = e.x + e.w / 2;
            const time = Date.now() / 100;
            const flameLen = 8 + Math.sin(time * 4) * 3;

            if (e.type === 0) {
                // === Type 0: 基础敌机（红色，倒三角）===
                // 红色径向光晕
                const c0x = e.x + e.w / 2, c0y = e.y + e.h / 2;
                const grad0 = ctx.createRadialGradient(c0x, c0y, 4, c0x, c0y, e.w);
                grad0.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
                grad0.addColorStop(1, 'rgba(239, 68, 68, 0)');
                ctx.fillStyle = grad0;
                ctx.beginPath();
                ctx.arc(c0x, c0y, e.w, 0, Math.PI * 2);
                ctx.fill();

                // 左右翼刀（深红，在上方两侧）
                ctx.fillStyle = '#991b1b';
                ctx.beginPath();
                ctx.moveTo(e.x + 4, e.y + 10);
                ctx.lineTo(e.x + 11, e.y + 7);
                ctx.lineTo(e.x + 11, e.y + 14);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(e.x + e.w - 4, e.y + 10);
                ctx.lineTo(e.x + e.w - 11, e.y + 7);
                ctx.lineTo(e.x + e.w - 11, e.y + 14);
                ctx.closePath();
                ctx.fill();

                // 主体（倒三角，尖头朝下）
                ctx.fillStyle = '#e34d4d';
                ctx.strokeStyle = '#7f1d1d';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cx, e.y + e.h);  // 底尖
                ctx.lineTo(e.x + e.w - 4, e.y + 4);
                ctx.lineTo(cx, e.y + 2);
                ctx.lineTo(e.x + 4, e.y + 4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // 头部高光
                ctx.fillStyle = '#fca5a5';
                ctx.beginPath();
                ctx.moveTo(cx, e.y + e.h - 4);
                ctx.lineTo(cx - 3, e.y + e.h - 14);
                ctx.lineTo(cx + 3, e.y + e.h - 14);
                ctx.closePath();
                ctx.fill();

                // 眼睛（红色，凶）
                ctx.fillStyle = '#fef2f2';
                ctx.beginPath();
                ctx.arc(cx - 6, e.y + 12, 2.5, 0, Math.PI * 2);
                ctx.arc(cx + 6, e.y + 12, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#dc2626';
                ctx.beginPath();
                ctx.arc(cx - 6, e.y + 12, 1.3, 0, Math.PI * 2);
                ctx.arc(cx + 6, e.y + 12, 1.3, 0, Math.PI * 2);
                ctx.fill();

                // 引擎火焰（朝上）
                this._drawEnemyFlame(ctx, cx, e.y, 5, flameLen, '#ef4444', '#fbbf24');

            } else {
                // === Type 1: 强化敌机（紫色，多层结构 HP 2）===
                // 紫色径向光晕
                const c1x = e.x + e.w / 2, c1y = e.y + e.h / 2;
                const grad1 = ctx.createRadialGradient(c1x, c1y, 4, c1x, c1y, e.w * 1.1);
                grad1.addColorStop(0, 'rgba(168, 85, 247, 0.5)');
                grad1.addColorStop(1, 'rgba(168, 85, 247, 0)');
                ctx.fillStyle = grad1;
                ctx.beginPath();
                ctx.arc(c1x, c1y, e.w * 1.1, 0, Math.PI * 2);
                ctx.fill();

                // 下层翼（深紫，最外层）
                ctx.fillStyle = '#6b21a8';
                ctx.beginPath();
                ctx.moveTo(e.x + 2, e.y + e.h - 8);
                ctx.lineTo(e.x + 14, e.y + e.h - 4);
                ctx.lineTo(e.x + 10, e.y + 4);
                ctx.lineTo(e.x + 2, e.y + 6);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(e.x + e.w - 2, e.y + e.h - 8);
                ctx.lineTo(e.x + e.w - 14, e.y + e.h - 4);
                ctx.lineTo(e.x + e.w - 10, e.y + 4);
                ctx.lineTo(e.x + e.w - 2, e.y + 6);
                ctx.closePath();
                ctx.fill();

                // 主体（加厚梯形）
                ctx.fillStyle = '#a855f7';
                ctx.strokeStyle = '#581c87';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cx, e.y + e.h);
                ctx.lineTo(e.x + e.w - 8, e.y + 10);
                ctx.lineTo(e.x + e.w - 12, e.y + 4);
                ctx.lineTo(e.x + 12, e.y + 4);
                ctx.lineTo(e.x + 8, e.y + 10);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // 装甲纹
                ctx.strokeStyle = '#581c87';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(e.x + 10, e.y + 22);
                ctx.lineTo(e.x + e.w - 10, e.y + 22);
                ctx.stroke();

                // 头部高光
                ctx.fillStyle = '#e9d5ff';
                ctx.beginPath();
                ctx.moveTo(cx, e.y + e.h - 4);
                ctx.lineTo(cx - 3, e.y + e.h - 14);
                ctx.lineTo(cx + 3, e.y + e.h - 14);
                ctx.closePath();
                ctx.fill();

                // 眼睛（紫红，凶）
                ctx.fillStyle = '#f3e8ff';
                ctx.beginPath();
                ctx.arc(cx - 6, e.y + 14, 2.8, 0, Math.PI * 2);
                ctx.arc(cx + 6, e.y + 14, 2.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#dc2626';
                ctx.beginPath();
                ctx.arc(cx - 6, e.y + 14, 1.4, 0, Math.PI * 2);
                ctx.arc(cx + 6, e.y + 14, 1.4, 0, Math.PI * 2);
                ctx.fill();

                // 双引擎火焰
                this._drawEnemyFlame(ctx, e.x + 12, e.y, 4, flameLen, '#a855f7', '#f0abfc');
                this._drawEnemyFlame(ctx, e.x + e.w - 12, e.y, 4, flameLen, '#a855f7', '#f0abfc');
            }
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

    // 敌机引擎火焰（朝上喷出，区别于玩家飞船的朝下火焰）
    _drawEnemyFlame(ctx, x, y, w, h, color1, color2) {
        const rgb1 = this.constructor._hexToRgbStr(color1);
        const rgb2 = this.constructor._hexToRgbStr(color2);
        const grad = ctx.createLinearGradient(x, y, x, y - h);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.3, `rgba(${rgb1}, 0.85)`);
        grad.addColorStop(0.7, `rgba(${rgb2}, 0.5)`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 4, y - h);
        ctx.lineTo(x - w / 4, y - h);
        ctx.closePath();
        ctx.fill();
    }

    drawEliteEnemy(e) {
        let ctx = this.ctx;
        let time = Date.now() / 100;
        let pulse = Math.sin(time * 3) * 0.2 + 0.8;
        let cx = e.x + e.w / 2;
        let cy = e.y + e.h / 2;
        let r = e.w / 2;  // 半径40

        ctx.save();

        // ── 受击闪烁 ──
        if (e.hitFlash > 0.3) {
            ctx.globalAlpha = 0.5 + Math.sin(time * 30) * 0.5;
        }

        // ── 外层旋转光环 ──
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * 1.2);
        ctx.strokeStyle = 'rgba(255, 107, 107, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let teeth = 10;
        for (let i = 0; i < teeth * 2; i++) {
            let a = (i / (teeth * 2)) * Math.PI * 2;
            let rr = r + 4 + (i % 2 === 0 ? 6 : 0);
            if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // ── 外层光环（径向渐变）──
        let auraGrad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r + 8);
        auraGrad.addColorStop(0, `rgba(255, 80, 80, ${pulse * 0.5})`);
        auraGrad.addColorStop(0.6, 'rgba(255, 60, 60, 0.15)');
        auraGrad.addColorStop(1, 'rgba(255, 40, 40, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
        ctx.fill();

        // ── 主体六边形装甲 ──
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#ff4444';

        // 外层装甲（深红色六边形）
        ctx.fillStyle = '#b71c1c';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            let sx = cx + Math.cos(a) * (r + 2);
            let sy = cy + Math.sin(a) * (r + 2);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();

        // 内层装甲（亮红色六边形）
        ctx.fillStyle = '#e53935';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            let sx = cx + Math.cos(a) * (r - 5);
            let sy = cy + Math.sin(a) * (r - 5);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();

        // ── 装甲纹路（六边形内凹槽）──
        ctx.strokeStyle = 'rgba(255, 180, 180, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            let sx = cx + Math.cos(a) * (r - 8);
            let sy = cy + Math.sin(a) * (r - 8);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();

        // ── 能量核心 ──
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffd93d';
        let coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.2, '#ffe066');
        coreGrad.addColorStop(0.5, '#ff6b6b');
        coreGrad.addColorStop(1, 'rgba(255, 60, 60, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // 核心高光点
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 2, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // ── 引擎火焰 ──
        for (let i = -1; i <= 1; i += 2) {
            let fx = cx + i * 18;
            let fy = e.y + e.h - 6;
            let flameH = 14 + Math.sin(time * 12 + i) * 6;
            let flameGrad = ctx.createLinearGradient(fx, fy, fx, fy + flameH);
            flameGrad.addColorStop(0, '#ffd93d');
            flameGrad.addColorStop(0.5, '#ff6b6b');
            flameGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = flameGrad;
            ctx.beginPath();
            ctx.moveTo(fx - 6, fy);
            ctx.lineTo(fx + 6, fy);
            ctx.lineTo(fx + 2, fy + flameH);
            ctx.lineTo(fx - 2, fy + flameH);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // ── 受击闪烁恢复 ──
        ctx.globalAlpha = 1;

        // ── 血条 ──
        let hpRatio = e.hp / e.maxHp;
        let barW = e.w + 20;
        let barH = 8;
        let barX = e.x - 10;
        let barY = e.y - 18;

        // 血条背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX, barY, barW, barH);

        // 血量渐变
        let barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        if (hpRatio > 0.5) {
            barGrad.addColorStop(0, '#ef5350');
            barGrad.addColorStop(1, '#c62828');
        } else if (hpRatio > 0.25) {
            barGrad.addColorStop(0, '#ffb74d');
            barGrad.addColorStop(1, '#e65100');
        } else {
            barGrad.addColorStop(0, '#ff5252');
            barGrad.addColorStop(1, '#b71c1c');
        }
        ctx.fillStyle = barGrad;
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // 血量分段线
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        for (let seg = 1; seg < 3; seg++) {
            let sx = barX + (barW / 3) * seg;
            ctx.beginPath();
            ctx.moveTo(sx, barY);
            ctx.lineTo(sx, barY + barH);
            ctx.stroke();
        }

        // 血条边框
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barX, barY, barW, barH);

        // ── ELITE标签 ──
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff6b6b';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ff0000';
        ctx.fillText('\u25c6 ELITE \u25c6', cx, barY - 6);
        ctx.shadowBlur = 0;

        // ── HP 数字 ──
        ctx.font = 'bold 10px Arial';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000';
        ctx.fillText(`HP ${e.hp} / ${e.maxHp}`, cx, barY + barH + 12);
        ctx.shadowBlur = 0;

        // ── 低血警告脉冲（HP < 25% 时整个敌机 alpha 闪烁 + 红圈脉动）──
        if (hpRatio < 0.25) {
            const warnPulse = Math.sin(time * 8) * 0.3 + 0.7;
            ctx.strokeStyle = `rgba(255, 50, 50, ${warnPulse * 0.9})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
            ctx.stroke();
        }
    }


    drawBoss(e) {
        let ctx = this.ctx;
        let time = Date.now() / 100;
        let pulse = Math.sin(time * 3) * 0.15 + 0.85;
        let cx = e.x + e.w / 2;
        let cy = e.y + e.h / 2;
        let style = e.bossStyle || 0;

        // 4套配色方案
        let colorSets = [
            [{ main: '#fd79a8', glow: '#e84393', core: '#ffeaa7' }, { main: '#a29bfe', glow: '#6c5ce7', core: '#fd79a8' }, { main: '#74b9ff', glow: '#0984e3', core: '#a29bfe' }, { main: '#fdcb6e', glow: '#f39c12', core: '#ff6b6b' }],
            [{ main: '#a855f7', glow: '#7c3aed', core: '#e9d5ff' }, { main: '#c084fc', glow: '#8b5cf6', core: '#fdf4ff' }, { main: '#e879f9', glow: '#a21caf', core: '#d8b4fe' }, { main: '#d946ef', glow: '#86198f', core: '#f5d0fe' }],
            [{ main: '#f59e0b', glow: '#d97706', core: '#fef3c7' }, { main: '#fbbf24', glow: '#b45309', core: '#fffbeb' }, { main: '#fcd34d', glow: '#92400e', core: '#fef08a' }, { main: '#eab308', glow: '#854d0e', core: '#fef9c3' }],
            [{ main: '#dc2626', glow: '#7f1d1d', core: '#fecaca' }, { main: '#b91c1c', glow: '#450a0a', core: '#fee2e2' }, { main: '#991b1b', glow: '#ef4444', core: '#fca5a5' }, { main: '#7f1d1d', glow: '#dc2626', core: '#f87171' }]
        ];
        let colors = colorSets[style] || colorSets[0];
        let phase = Math.max(0, e.attackPhase);
        let c = colors[phase % 4];

        ctx.save();

        if (e.hitFlash > 0.3) ctx.globalAlpha = 0.5 + Math.sin(time * 30) * 0.5;
        if (e.warningFlash > 0) { let wf = Math.sin(time * 15) * 0.5 + 0.5; ctx.shadowBlur = 30 + wf * 20; ctx.shadowColor = c.glow; }
        else { ctx.shadowBlur = 18; ctx.shadowColor = c.glow; }

        if (style === 0) {
            // ── Boss-A: PINK STAR ──
            ctx.strokeStyle = c.main; ctx.lineWidth = 3;
            for (let ring = 0; ring < 3; ring++) {
                ctx.save(); ctx.translate(cx, cy);
                ctx.rotate(time * (0.5 + ring * 0.3) * (ring % 2 === 0 ? 1 : -1));
                let rr = e.w * 0.35 + ring * 12;
                ctx.beginPath(); let teeth = 8 + ring * 4;
                for (let i = 0; i < teeth * 2; i++) {
                    let a = (i / (teeth * 2)) * Math.PI * 2, rrr = rr + (i % 2 === 0 ? 8 : 0);
                    i === 0 ? ctx.moveTo(Math.cos(a) * rrr, Math.sin(a) * rrr) : ctx.lineTo(Math.cos(a) * rrr, Math.sin(a) * rrr);
                }
                ctx.closePath(); ctx.stroke(); ctx.restore();
            }
            ctx.fillStyle = c.main; ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                let a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 === 0 ? e.w * 0.28 : e.w * 0.22;
                i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                let a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 === 0 ? e.w * 0.18 : e.w * 0.14;
                i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            // core
            ctx.shadowBlur = 25; ctx.shadowColor = c.core;
            let cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
            cg.addColorStop(0, '#fff'); cg.addColorStop(0.3, c.core); cg.addColorStop(0.7, c.glow); cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 22 * pulse, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 15; ctx.shadowColor = '#fff'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 3, cy - 3, 6, 0, Math.PI * 2); ctx.fill();
        } else if (style === 1) {
            // ── Boss-B: VOID CRYSTAL ──
            // rotating crystal shards
            ctx.strokeStyle = c.main; ctx.lineWidth = 2;
            for (let s = 0; s < 4; s++) {
                ctx.save(); ctx.translate(cx, cy);
                ctx.rotate(time * 1.5 + s * Math.PI / 2);
                ctx.beginPath(); ctx.moveTo(e.w * 0.2, -8); ctx.lineTo(e.w * 0.35, 0); ctx.lineTo(e.w * 0.2, 8); ctx.closePath(); ctx.stroke();
                ctx.restore();
            }
            // diamond body
            ctx.fillStyle = c.main; ctx.beginPath();
            ctx.moveTo(cx, cy - e.h * 0.35); ctx.lineTo(cx + e.w * 0.25, cy); ctx.lineTo(cx, cy + e.h * 0.3); ctx.lineTo(cx - e.w * 0.25, cy); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath();
            ctx.moveTo(cx, cy - e.h * 0.25); ctx.lineTo(cx + e.w * 0.15, cy); ctx.lineTo(cx, cy + e.h * 0.2); ctx.lineTo(cx - e.w * 0.15, cy); ctx.closePath(); ctx.fill();
            // crystal core
            ctx.shadowBlur = 30; ctx.shadowColor = c.core;
            let cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
            cg.addColorStop(0, '#fff'); cg.addColorStop(0.15, c.core); cg.addColorStop(0.5, c.glow); cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg; ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                let a = (i / 6) * Math.PI * 2, rr = 18 * pulse;
                i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 15; ctx.shadowColor = '#fff'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 5, 0, Math.PI * 2); ctx.fill();
        } else if (style === 2) {
            // ── Boss-C: GOLDEN LORD ──
            // golden force field
            ctx.strokeStyle = c.main; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, cy, e.w * 0.38 + Math.sin(time * 4) * 6, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = c.glow; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, e.w * 0.42 + Math.cos(time * 3) * 4, 0, Math.PI * 2); ctx.stroke();
            // circular armor
            let armorGrad = ctx.createRadialGradient(cx, cy, e.w * 0.1, cx, cy, e.w * 0.35);
            armorGrad.addColorStop(0, c.main); armorGrad.addColorStop(0.6, c.glow); armorGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = armorGrad; ctx.beginPath(); ctx.arc(cx, cy, e.w * 0.35, 0, Math.PI * 2); ctx.fill();
            // inner rings
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
            for (let r = 0.15; r <= 0.3; r += 0.05) { ctx.beginPath(); ctx.arc(cx, cy, e.w * r, 0, Math.PI * 2); ctx.stroke(); }
            // core
            ctx.shadowBlur = 35; ctx.shadowColor = c.core;
            let cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
            cg.addColorStop(0, '#fff'); cg.addColorStop(0.2, '#fef08a'); cg.addColorStop(0.5, c.glow); cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 20 * pulse, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 15; ctx.shadowColor = '#fff'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 6, 0, Math.PI * 2); ctx.fill();
        } else {
            // ── Boss-D: DARK OBLIVION ──
            // distorted aura
            ctx.strokeStyle = c.main; ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < 30; i++) {
                let a = (i / 30) * Math.PI * 2, rr = e.w * 0.38 + Math.sin(time * 8 + i * 0.5) * 10 + Math.sin(time * 5 + i) * 5;
                i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.stroke();
            // irregular body
            ctx.fillStyle = c.main; ctx.beginPath();
            let teeth = 5 + Math.floor(Math.sin(time * 2) * 2);
            for (let i = 0; i < teeth; i++) {
                let a = (i / teeth) * Math.PI * 2 - Math.PI / 2, rr = e.w * 0.22 + Math.sin(time * 6 + i) * 8;
                i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath();
            for (let i = 0; i < teeth; i++) {
                let a = (i / teeth) * Math.PI * 2 - Math.PI / 2, rr = e.w * 0.12 + Math.cos(time * 5 + i) * 4;
                i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            // glowing cracks
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
            for (let ck = 0; ck < 5; ck++) {
                let a = (ck / 5) * Math.PI * 2 + time * 0.5;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * e.w * 0.3, cy + Math.sin(a) * e.w * 0.3); ctx.stroke();
            }
            // core
            ctx.shadowBlur = 30; ctx.shadowColor = c.glow;
            let cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
            cg.addColorStop(0, '#fff'); cg.addColorStop(0.1, '#fca5a5'); cg.addColorStop(0.4, c.glow); cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 12; ctx.shadowColor = '#fff'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 4, 0, Math.PI * 2); ctx.fill();
        }

        ctx.shadowBlur = 0;

        // ── 引擎火焰 ──
        if (e.entryDone) {
            for (let i = -1; i <= 1; i += 2) {
                let fx = cx + i * 25, fy = e.y + e.h - 10;
                let flameH = 20 + Math.sin(time * 10 + i) * 8;
                let flameGrad = ctx.createLinearGradient(fx, fy, fx, fy + flameH);
                flameGrad.addColorStop(0, c.core); flameGrad.addColorStop(0.5, c.glow); flameGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = flameGrad; ctx.beginPath();
                ctx.moveTo(fx - 8, fy); ctx.lineTo(fx + 8, fy); ctx.lineTo(fx + 3, fy + flameH); ctx.lineTo(fx - 3, fy + flameH);
                ctx.closePath(); ctx.fill();
            }
        }

        ctx.restore();

        // ── 血条 ──
        let hpRatio = e.hp / e.maxHp;
        let barW = e.w + 40, barH = 12, barX = e.x - 20, barY = e.y - 28;
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(barX, barY, barW, barH);
        let barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        if (hpRatio > 0.5) { barGrad.addColorStop(0, '#4ade80'); barGrad.addColorStop(1, c.main); }
        else if (hpRatio > 0.25) { barGrad.addColorStop(0, '#fbbf24'); barGrad.addColorStop(1, '#f97316'); }
        else { barGrad.addColorStop(0, '#ef4444'); barGrad.addColorStop(1, '#7f1d1d'); }
        ctx.fillStyle = barGrad; ctx.fillRect(barX, barY, barW * hpRatio, barH);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        for (let seg = 1; seg < 4; seg++) { let sx = barX + (barW / 4) * seg; ctx.beginPath(); ctx.moveTo(sx, barY); ctx.lineTo(sx, barY + barH); ctx.stroke(); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(barX, barY, barW, barH);

        ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        ctx.fillStyle = c.main; ctx.shadowBlur = 8; ctx.shadowColor = c.glow;
        ctx.fillText(e.bossName || 'BOSS', cx, barY - 6);
        ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
        ctx.fillText('HP ' + e.hp + '/' + e.maxHp, cx, barY + barH + 13);
    }

    drawBullets() {
        let ctx = this.ctx;

        // 玩家子弹根据等级显示不同外观
        for (let b of this.playerBullets) {
            let level = b.level || 1;
            this.drawPlayerBullet(b, level);
        }

        // 敌机子弹：根据来源类型显示不同外观
        for (let eb of this.enemyBullets) {
            ctx.save();

            let angle = Math.atan2(eb.vy || 1, eb.vx || 0);
            let cx = eb.x + eb.w / 2;
            let cy = eb.y + eb.h / 2;
            let etype = eb.enemyType || 0;
            let c = eb.color || '#ff3a6f';

            ctx.translate(cx, cy);
            ctx.rotate(angle);

            if (etype <= 1) {
                // 普通敌机：小圆点弹
                ctx.shadowBlur = 8; ctx.shadowColor = c;
                ctx.fillStyle = c;
                ctx.beginPath(); ctx.arc(0, 0, eb.w * 0.6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.beginPath(); ctx.arc(-1, -1, eb.w * 0.3, 0, Math.PI * 2); ctx.fill();
            } else if (etype === 2) {
                // 精英敌机：菱形弹
                ctx.shadowBlur = 12; ctx.shadowColor = c;
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.moveTo(eb.w * 0.7, 0); ctx.lineTo(0, eb.h * 0.7); ctx.lineTo(-eb.w * 0.7, 0);
                ctx.lineTo(0, -eb.h * 0.7); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.beginPath();
                ctx.moveTo(eb.w * 0.35, 0); ctx.lineTo(0, eb.h * 0.35); ctx.lineTo(-eb.w * 0.35, 0);
                ctx.lineTo(0, -eb.h * 0.35); ctx.closePath(); ctx.fill();
            } else {
                // Boss弹：发光圆球 + 颜色环
                ctx.shadowBlur = 15; ctx.shadowColor = c;
                let grad = ctx.createRadialGradient(0, 0, 0, 0, 0, eb.w * 0.8);
                grad.addColorStop(0, 'rgba(255,255,255,0.9)');
                grad.addColorStop(0.3, c);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(0, 0, eb.w * 0.8, 0, Math.PI * 2); ctx.fill();
                // 外环
                ctx.strokeStyle = c; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(0, 0, eb.w * 0.55, 0, Math.PI * 2); ctx.stroke();
            }

            ctx.shadowBlur = 0;
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
            ctx.fillText("💀 GAME OVER 💀", this.W / 2, this.H / 2 - 60);
            ctx.font = "bold 18px monospace";
            ctx.fillStyle = "#ddddaa";
            ctx.fillText(`本局得分: ${String(this.score).padStart(6, '0')}`, this.W / 2, this.H / 2 - 20);
            // 破纪录时高亮提示
            if (this.score >= this.bestScore && this.score > 0) {
                ctx.fillStyle = "#fbbf24";
                ctx.shadowBlur = 12;
                ctx.shadowColor = "#fbbf24";
                ctx.fillText(`🏆 历史最佳: ${String(this.bestScore).padStart(6, '0')} (新纪录!)`, this.W / 2, this.H / 2 + 10);
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = "#aaa";
                ctx.fillText(`历史最佳: ${String(this.bestScore).padStart(6, '0')}`, this.W / 2, this.H / 2 + 10);
            }
            ctx.font = "bold 16px monospace";
            ctx.fillStyle = "#ddddaa";
            ctx.fillText("点击「重新起飞」继续征战星河", this.W / 2, this.H / 2 + 50);
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
        const ctx = this.ctx;
        const t = Date.now() / 200;
        for (let p of this.powerUps) {
            ctx.save();

            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            ctx.translate(cx, cy);
            ctx.rotate(p.rotation);

            const pulseScale = 1 + Math.sin(t + p.x) * 0.08;
            ctx.scale(pulseScale, pulseScale);

            // 1. 外圈径向光晕
            const aura = ctx.createRadialGradient(0, 0, 5, 0, 0, 18);
            aura.addColorStop(0, p.bgColor);
            aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.fill();

            // 2. 主体白底圆
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();

            // 3. 彩色描边
            ctx.strokeStyle = p.borderColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.stroke();

            // 4. 中心 icon
            this._drawPowerUpIcon(ctx, p.type, t);

            ctx.restore();
        }
    }

    // 道具 icon 分发
    _drawPowerUpIcon(ctx, type, t) {
        if (type === 'shield') this._drawShieldIcon(ctx, t);
        else if (type === 'weapon') this._drawWeaponIcon(ctx, t);
        else if (type === 'life') this._drawLifeIcon(ctx, t);
        else if (type === 'homing') this._drawHomingIcon(ctx, t);
    }

    // 护盾 icon：蓝色六边形 + 中心高亮
    _drawShieldIcon(ctx, t) {
        // 六边形径向渐变
        const grad = ctx.createRadialGradient(0, -2, 1, 0, 0, 11);
        grad.addColorStop(0, '#dbeafe');
        grad.addColorStop(0.5, '#3b82f6');
        grad.addColorStop(1, '#1e3a8a');
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(a) * 9;
            const y = Math.sin(a) * 9;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(-2, -3, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // 武器升级 icon：紫色闪电
    _drawWeaponIcon(ctx, t) {
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-2, -10);
        ctx.lineTo(5, -3);
        ctx.lineTo(0, -1);
        ctx.lineTo(3, 9);
        ctx.lineTo(-4, 1);
        ctx.lineTo(1, -1);
        ctx.lineTo(-5, -10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // 闪电高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(-1, -8);
        ctx.lineTo(2, -3);
        ctx.lineTo(0, -2);
        ctx.closePath();
        ctx.fill();
    }

    // 生命 icon：红色心形
    _drawLifeIcon(ctx, t) {
        const pulse = Math.sin(t * 1.5) * 0.06 + 1;
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 7);
        ctx.bezierCurveTo(-9, 0, -9, -9, 0, -4);
        ctx.bezierCurveTo(9, -9, 9, 0, 0, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // 高光
        ctx.fillStyle = 'rgba(254, 226, 226, 0.8)';
        ctx.beginPath();
        ctx.ellipse(-3, -4, 1.8, 2.5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 追踪弹 icon：紫色靶心
    _drawHomingIcon(ctx, t) {
        const pulse = Math.sin(t * 2) * 0.1 + 1;
        // 外圈（脉动）
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        // 内圈
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.stroke();
        // 中心红点
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // 十字
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(0, -7);
        ctx.moveTo(0, 7); ctx.lineTo(0, 11);
        ctx.moveTo(-11, 0); ctx.lineTo(-7, 0);
        ctx.moveTo(7, 0); ctx.lineTo(11, 0);
        ctx.stroke();
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

        // 暂停遮罩（最后画，盖在上面）
        if (this.paused) {
            this.drawPausedOverlay();
        }
    }

    drawPausedOverlay() {
        let ctx = this.ctx;
        ctx.save();

        // 半透明黑色遮罩
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, this.W, this.H);

        // 主标题
        ctx.font = 'bold 52px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2affcc';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#2affcc';
        ctx.fillText('⏸  PAUSED', this.W / 2, this.H / 2 - 20);

        // 副提示
        ctx.font = '16px monospace';
        ctx.fillStyle = '#cccccc';
        ctx.shadowBlur = 0;
        ctx.fillText('按 P 或 Esc 继续', this.W / 2, this.H / 2 + 30);

        // 额外信息：当前分数
        ctx.font = '14px monospace';
        ctx.fillStyle = '#888888';
        ctx.fillText(`当前分数 ${String(this.score).padStart(6, '0')}   历史最佳 ${String(this.bestScore).padStart(6, '0')}`, this.W / 2, this.H / 2 + 65);

        ctx.textAlign = 'left';
        ctx.restore();
    }

    // ─────────── 游戏主循环 ───────────

    gameLoop() {
        let now = performance.now() / 1000;
        let dt = Math.min(now - this.lastTime, this.DT_CAP);
        this.lastTime = now;

        // 暂停时跳过逻辑更新但保持画面渲染（星空滚动不停、闪烁动画不断）
        if (this.gameRunning && !this.paused) {
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
        // 暂停切换：P 或 Esc
        if (code === 'KeyP' || code === 'Escape') {
            e.preventDefault();
            if (this.gameRunning) {
                this.paused = !this.paused;
                if (this.paused) this.resetKeys();  // 防卡键
            }
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