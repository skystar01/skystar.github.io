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
function cooldownFor(tier, level) {
    const tierMult = tier === 'B' ? 1.0 : tier === 'A' ? 0.55 : 0.28;
    const lvMult = [1.0, 0.82, 0.65][level - 1] || 0.65;
    return 0.8 * tierMult * lvMult;
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

        // ── 经验/等级 ──
        this.level = 1;
        this.exp = 0;

        // ── 波次 ──
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.bossSpawned = false;
        this.bossSpawnTime = 200; // 约3分20秒
        this.enemyKillCount = 0;

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

        this.lastTime = performance.now();
        this.gameRunning = true;
        this._loop = this._loop.bind(this);
        this.animationId = requestAnimationFrame(this._loop);
    }

    resetGame() {
        this.player = {
            x: this.W / 2,
            y: this.H - 60,
            r: 14,
            hp: 200,
            maxHp: 200,
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

        this.level = 1;
        this.exp = 0;
        this.gameTime = 0;
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.bossSpawned = false;
        this.enemyKillCount = 0;
        this.gameOver = false;
        this.levelupPending = false;

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
        const overBtn = document.getElementById('survivorGameoverBtn');
        if (overBtn) {
            overBtn.addEventListener('click', () => this.resetGame());
        }
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
        if (this.paused || this.levelupPending || this.gameOver) {
            this.lastTime = now;
            return;
        }
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        if (dt > this.DT_CAP) dt = this.DT_CAP;
        if (!this.gameRunning) return;

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
        this._checkLevelup();
        this._checkBossSpawn();
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

        // 毒区伤害
        for (const z of this.poisonZones) {
            if (z.team === 'enemy' && this._dist(p.x, p.y, z.x, z.y) < p.r + z.r) {
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
            r: 5,
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
            // 碰撞敌人
            for (const e of this.enemies) {
                if (b.hitSet.has(e)) continue;
                if (e.dead) continue;
                if (this._dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
                    this._hitEnemy(e, b.dmg, b);
                    b.hitSet.add(e);
                    // 爆炸
                    if (b.explode) {
                        this._explode(b.x, b.y, b.explodeR, b.dmg * 0.6, b.poison, b.poisonR, b.slow);
                        arr.splice(i, 1);
                        break;
                    }
                    // 毒区
                    if (b.poison) {
                        this.poisonZones.push({
                            x: b.x, y: b.y, r: b.poisonR,
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
                return;
            }
        }
        e.hp -= dmg;
        if (bullet && bullet.slow) {
            e.slowTimer = 1.5;
            e.slowFactor = 0.5;
        }
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

        // 掉落晶石
        if (e.isBoss) {
            // Boss 掉多个
            for (let i = 0; i < 8; i++) {
                this._dropCrystal(e.x + (Math.random()-0.5)*40, e.y + (Math.random()-0.5)*40, 'red');
            }
            for (let i = 0; i < 6; i++) {
                this._dropCrystal(e.x + (Math.random()-0.5)*60, e.y + (Math.random()-0.5)*60, 'blue');
            }
            this._doGameWin();
        } else if (e.isElite) {
            this._dropCrystal(e.x, e.y, Math.random() < 0.3 ? 'red' : 'blue');
        } else {
            const r = Math.random();
            if (r < 0.1) this._dropCrystal(e.x, e.y, 'blue');
            else this._dropCrystal(e.x, e.y, 'green');
        }
    }

    _dropCrystal(x, y, color) {
        const exp = { green: 1, blue: 3, red: 8 }[color];
        this.crystals.push({
            x, y,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40 - 30,
            color, exp,
            r: 6,
            life: 12,
            magnet: false,
        });
    }

    // ─── 敌人 ───
    _updateEnemies(dt) {
        // 生成
        if (!this.bossSpawned) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this._spawnEnemy();
                // 间隔随时间递减
                this.spawnInterval = Math.max(0.5, 1.5 - this.gameTime * 0.003);
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

            // 移动: 朝玩家移动 + 持续下推
            const ang = Math.atan2(p.y - e.y, p.x - e.x);
            if (e.isBoss) {
                // Boss 缓慢移动
                e.x += Math.cos(ang) * e.speed * 0.5 * sf * dt;
                e.y += Math.sin(ang) * e.speed * 0.5 * sf * dt;
            } else {
                e.x += Math.cos(ang) * e.speed * sf * dt;
                e.y += Math.sin(ang) * e.speed * sf * dt;
            }

            // 朝向玩家
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
        const x = 60 + Math.random() * (this.W - 120);
        const y = -30;
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
        const e = {
            x, y,
            r: (isBoss ? 30 : 16) * sizeMult,
            hp: base.hp * hpScale,
            maxHp: base.hp * hpScale,
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
                // 定点轰炸: 在玩家位置标记, 延迟爆炸（由 _updateEffects 触发）
                this.effects.push({ type: 'bombMarker', x: p.x, y: p.y, r: 30, life: 1.2, maxLife: 1.2, color:'#fb923c', willExplode: true, explodeDmg: 15 });
                break;
            case 'poison': {
                // 在玩家附近方格吐毒液
                const count = e.isElite ? 2 : 1;
                for (let i = 0; i < count; i++) {
                    const tx = p.x + (Math.random() - 0.5) * 80;
                    const ty = p.y + (Math.random() - 0.5) * 80;
                    this.poisonZones.push({
                        x: tx, y: ty, r: 25,
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
        // 特性攻击
        for (const t of e.bossTypes || []) {
            if (t === 'bomb') {
                this.effects.push({ type: 'bombMarker', x: p.x, y: p.y, r: 40, life: 1.0, maxLife: 1.0, color:'#fb923c' });
            } else if (t === 'poison') {
                this.poisonZones.push({ x: p.x, y: p.y, r: 30, team:'enemy', life: 4, dmg: 8, tick: 0 });
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
            r: opts.r || 5,
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
                this.enemyBullets.splice(i, 1);
            }
        }
    }

    // ─── 晶石 ───
    _updateCrystals(dt) {
        const p = this.player;
        for (let i = this.crystals.length - 1; i >= 0; i--) {
            const c = this.crystals[i];
            c.life -= dt;
            // 初速度衰减
            c.vx *= 0.92;
            c.vy *= 0.92;
            c.x += c.vx * dt;
            c.y += c.vy * dt;

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
                this.exp += c.exp;
                this._floatingText(c.x, c.y, '+' + c.exp, c.color === 'green' ? '#4ade80' : c.color === 'blue' ? '#60a5fa' : '#f87171');
                this.crystals.splice(i, 1);
                continue;
            }
            if (c.life <= 0) this.crystals.splice(i, 1);
        }
    }

    _updatePoisonZones(dt) {
        for (let i = this.poisonZones.length - 1; i >= 0; i--) {
            const z = this.poisonZones[i];
            z.life -= dt;
            z.tick = (z.tick || 0) + dt;
            if (z.life <= 0) { this.poisonZones.splice(i, 1); continue; }
            // 对敌人持续伤害（玩家毒区）
            if (z.team === 'player') {
                for (const e of this.enemies) {
                    if (e.dead) continue;
                    if (this._dist(z.x, z.y, e.x, e.y) < z.r + e.r) {
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
        const hpEl = document.getElementById('survHpValue');
        const hpFill = document.getElementById('survHpFill');
        const hpText = document.getElementById('survHpText');
        const lvEl = document.getElementById('survLevelValue');
        const expFill = document.getElementById('survExpFill');
        const timeEl = document.getElementById('survTimeValue');
        const killEl = document.getElementById('survKillValue');

        if (hpEl) hpEl.style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
        if (hpText) hpText.textContent = Math.ceil(Math.max(0, p.hp)) + '/' + p.maxHp;
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
                <div class="ev-icon" style="color:${c.icon === '↻' ? '#c4b5fd' : ''}">${c.icon}</div>
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

    // ─── 渲染 ───
    _render() {
        const ctx = this.ctx;
        // 背景
        ctx.fillStyle = '#0f0c1d';
        ctx.fillRect(0, 0, this.W, this.H);

        // 方格
        ctx.strokeStyle = 'rgba(167,139,250,0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= this.W; x += this.CELL) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke();
        }
        for (let y = 0; y <= this.H; y += this.CELL) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke();
        }

        // 毒区
        for (const z of this.poisonZones) {
            const alpha = Math.min(1, z.life / 2);
            ctx.fillStyle = z.team === 'player' ? `rgba(132,204,22,${0.2 * alpha})` : `rgba(239,68,68,${0.2 * alpha})`;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = z.team === 'player' ? `rgba(132,204,22,${0.5 * alpha})` : `rgba(239,68,68,${0.5 * alpha})`;
            ctx.lineWidth = 2; ctx.stroke();
        }

        // 晶石
        for (const c of this.crystals) {
            const blink = c.life < 3 && Math.floor(c.life * 8) % 2 === 0;
            if (blink) continue;
            const colors = { green: '#4ade80', blue: '#60a5fa', red: '#f87171' };
            ctx.fillStyle = colors[c.color];
            ctx.shadowColor = colors[c.color];
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // 敌人
        for (const e of this.enemies) {
            this._drawEnemy(e);
        }

        // 敌人子弹
        for (const b of this.enemyBullets) {
            ctx.fillStyle = b.color;
            ctx.shadowColor = b.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // 玩家子弹
        for (const b of this.playerBullets) {
            ctx.fillStyle = b.color;
            ctx.shadowColor = b.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
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
                ctx.strokeStyle = e.color;
                ctx.globalAlpha = 0.3 + Math.sin(t * Math.PI * 4) * 0.3;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(e.x - e.r, e.y); ctx.lineTo(e.x + e.r, e.y);
                ctx.moveTo(e.x, e.y - e.r); ctx.lineTo(e.x, e.y + e.r);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        // 玩家
        this._drawPlayer();

        // 浮动文字
        for (const t of this.floatingTexts) {
            ctx.globalAlpha = t.life / t.maxLife;
            ctx.fillStyle = t.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(t.text, t.x, t.y);
            ctx.globalAlpha = 1;
        }

        // HUD 更新（每帧）
        this._updateHUD();
    }

    _drawPlayer() {
        const ctx = this.ctx;
        const p = this.player;
        // 无敌闪烁
        if (p.invincible > 0 && Math.floor(p.invincible * 10) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        // 光环
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#c4b5fd';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // 朝向指示
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.dirX * p.r * 1.5, p.y + p.dirY * p.r * 1.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    _drawEnemy(e) {
        const ctx = this.ctx;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 护盾
        if (e.shield > 0) {
            ctx.strokeStyle = '#67e8f9';
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
            const bw = 60;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw, 6);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * (e.hp / e.maxHp), 6);
        }

        // 精英标记
        if (e.isElite) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 10px sans-serif';
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
