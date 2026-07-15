// ─── Memory Game (记忆翻牌) ───
// 玩法: 4×4 = 8 对卡牌，翻两张找相同，全部消除计时最短者胜
// 特效: 匹配时，卡片本身化作像素粒子向外飞散

class MemoryGame {
    constructor() {
        // 8 对卡牌: 图片名 + 图案名
        this.CARD_PAIRS = [
            { id: 'star',      label: '星光水晶',   src: 'assets/card-star.png' },
            { id: 'moon',     label: '明月',       src: 'assets/card-moon.png' },
            { id: 'lightning',label: '闪电',       src: 'assets/card-lightning.png' },
            { id: 'sun',      label: '烈阳',       src: 'assets/card-sun.png' },
            { id: 'flower',   label: '莲花',       src: 'assets/card-flower.png' },
            { id: 'flame',    label: '烈焰',       src: 'assets/card-flame.png' },
            { id: 'potion',   label: '魔药',       src: 'assets/card-potion.png' },
            { id: 'waterfall',label: '瀑布',       src: 'assets/card-waterfall.png' },
        ];

        this.STORAGE_KEY = 'memory_best_time';
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

    // ─── 最佳成绩 (localStorage) ───
    loadBest() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            this.bestTime = stored ? parseInt(stored, 10) : null;
        } catch (e) {
            this.bestTime = null;
        }
    }

    saveBest() {
        try {
            localStorage.setItem(this.STORAGE_KEY, String(this.bestTime));
        } catch (e) { /* ignore */ }
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
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('memoryBoard')) {
        window.memoryGame = new MemoryGame();

        // 暴露给 main.html 的 fitGame()
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
