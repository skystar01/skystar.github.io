// ─── STARS CANVAS ───
// 全屏星空背景: 350 颗粒子(布朗运动 + 鼠标引力) + 星-星连线 + 鼠标-星连线 + 流星
// 暴露 window.setStarTheme / PANEL_HUES / currentPanelHue / activeBgPanel 供 ui.js 切 panel 时调用
(function() {
    const canvas = document.getElementById('starsCanvas');
    const ctx = canvas.getContext('2d');
    let stars = [];
    let meteors = [];
    let mouse = { x: -9999, y: -9999, active: false, lastMove: 0 };
    const MOUSE_PULL_R = 200;
    const STAR_LINK_R = 100;
    const MOUSE_LINK_R = 150;
    const MOUSE_LINK_R2 = MOUSE_LINK_R * MOUSE_LINK_R;
    const STAR_LINK_R2 = STAR_LINK_R * STAR_LINK_R;

    // 主题色:每个 panel 配一套粒子色 + 连线色(色相 240°→60° 走一圈,饱和度 70%)
    const STAR_COLORS = {
        home:     [180, 200, 255],
        news:     [195, 175, 255],
        about:    [210, 170, 255],
        skills:   [255, 170, 240],
        projects: [255, 195, 225],
        game:     [255, 210, 175],
        contact:  [210, 255, 175],
        waypoint: [255, 175, 200]
    };
    const LINE_COLORS = {
        home:     [150, 180, 255],
        news:     [170, 145, 255],
        about:    [190, 140, 255],
        skills:   [255, 140, 220],
        projects: [255, 165, 200],
        game:     [255, 175, 130],
        contact:  [175, 255, 130],
        waypoint: [255, 140, 170]
    };
    // 每个 panel 的代表色相(用于大色差跳变时决定要不要走 waypoint)
    const PANEL_HUES = {
        home: 240, news: 255, about: 270, skills: 300, projects: 330,
        game: 20, contact: 60
    };
    let currentStar = [...STAR_COLORS.home];
    let currentLine = [...LINE_COLORS.home];
    let targetStar = [...currentStar];
    let targetLine = [...currentLine];
    let currentHue = 240; // 跟 home 一致
    let colorAnim = null;

    function setStarTheme(panel, useWaypoint) {
        const sc = STAR_COLORS[panel];
        const lc = LINE_COLORS[panel];
        if (!sc) return;
        if (colorAnim) cancelAnimationFrame(colorAnim);

        if (useWaypoint) {
            // Stage 1: current → waypoint(0° 红)
            targetStar = [...STAR_COLORS.waypoint];
            targetLine = [...LINE_COLORS.waypoint];
            animateColors(() => {
                // Stage 2: waypoint → target
                targetStar = [...sc];
                targetLine = [...lc];
                animateColors(() => {
                    currentHue = PANEL_HUES[panel] || 240;
                });
            });
        } else {
            targetStar = [...sc];
            targetLine = [...lc];
            animateColors(() => {
                currentHue = PANEL_HUES[panel] || 240;
            });
        }
    }

    function animateColors(onComplete) {
        // 单段动画(被 setStarTheme 调 1-2 次,waypoint 时 2 段串行)
        function step() {
            for (let i = 0; i < 3; i++) {
                currentStar[i] += (targetStar[i] - currentStar[i]) * 0.15;
                currentLine[i] += (targetLine[i] - currentLine[i]) * 0.15;
            }
            if (Math.abs(currentStar[0] - targetStar[0]) < 0.5 &&
                Math.abs(currentStar[1] - targetStar[1]) < 0.5 &&
                Math.abs(currentStar[2] - targetStar[2]) < 0.5) {
                currentStar = [...targetStar];
                currentLine = [...targetLine];
                if (onComplete) onComplete();
                return;
            }
            colorAnim = requestAnimationFrame(step);
        }
        colorAnim = requestAnimationFrame(step);
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function initStars() {
        stars = [];
        for (let i = 0; i < 350; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 2 + 0.3,
                baseAlpha: Math.random() * 0.5 + 0.2,
                alphaSpeed: Math.random() * 0.003 + 0.001,
                phase: Math.random() * Math.PI * 2,
                angle: Math.random() * Math.PI * 2,
                speed: Math.random() * 0.2 + 0.1,
                angleChangeSpeed: Math.random() * 0.05 + 0.02,
                t: Math.random() * 1000,
                mouseDist2: Infinity
            });
        }
    }

    function spawnMeteor() {
        const fromLeft = Math.random() < 0.5;
        const startX = fromLeft ? -50 : canvas.width + 50;
        const startY = Math.random() * canvas.height * 0.55;
        const angle = (fromLeft ? 1 : -1) * (Math.random() * 0.35 + 0.45);
        const speed = Math.random() * 6 + 14;
        meteors.push({
            x: startX, y: startY,
            vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
            vy: Math.sin(angle) * speed,
            life: 0,
            maxLife: 70,
            trail: []
        });
    }

    function drawStars() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. 更新粒子位置(布朗运动 + 鼠标引力)
        // 鼠标空闲淡出: 移动时全力,800-1500ms 线性衰减到 0,避免静止时粒子在鼠标处堆积卡顿
        const mActive = mouse.active;
        const mx = mouse.x, my = mouse.y;
        let pullMul = 0;
        if (mActive) {
            const idleMs = performance.now() - mouse.lastMove;
            if (idleMs < 800) pullMul = 1;
            else if (idleMs < 1500) pullMul = 1 - (idleMs - 800) / 700;
        }
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            s.alpha = s.baseAlpha + Math.sin(s.t * s.alphaSpeed + s.phase) * 0.4;

            if (pullMul > 0) {
                const dx = mx - s.x;
                const dy = my - s.y;
                const d2 = dx*dx + dy*dy;
                s.mouseDist2 = d2;
                if (d2 < MOUSE_PULL_R * MOUSE_PULL_R && d2 > 0) {
                    const d = Math.sqrt(d2);
                    const f = (1 - d / MOUSE_PULL_R) * 0.012 * 60 * pullMul;
                    s.x += (dx / d) * f;
                    s.y += (dy / d) * f;
                }
            } else {
                s.mouseDist2 = Infinity;
            }

            s.angle += (Math.random() - 0.5) * s.angleChangeSpeed;
            let nx = s.x + Math.cos(s.angle) * s.speed;
            let ny = s.y + Math.sin(s.angle) * s.speed;
            if (nx < -10) nx = canvas.width + 10;
            else if (nx > canvas.width + 10) nx = -10;
            if (ny < -10) ny = canvas.height + 10;
            else if (ny > canvas.height + 10) ny = -10;
            s.x = nx; s.y = ny;
            s.t++;
        }

        // 2. 星-星连线(距离平方剪枝)
        ctx.lineWidth = 0.6;
        for (let i = 0; i < stars.length; i++) {
            const a = stars[i];
            for (let j = i + 1; j < stars.length; j++) {
                const b = stars[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const d2 = dx*dx + dy*dy;
                if (d2 < STAR_LINK_R2) {
                    const d = Math.sqrt(d2);
                    const alpha = (1 - d / STAR_LINK_R) * 0.25;
                    ctx.strokeStyle = `rgba(${currentLine[0]|0}, ${currentLine[1]|0}, ${currentLine[2]|0}, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        // 3. 鼠标-星连线(更亮更粗,随鼠标空闲淡出)
        if (pullMul > 0) {
            ctx.lineWidth = 0.8;
            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                if (s.mouseDist2 < MOUSE_LINK_R2) {
                    const d = Math.sqrt(s.mouseDist2);
                    const alpha = (1 - d / MOUSE_LINK_R) * 0.5 * pullMul;
                    ctx.strokeStyle = `rgba(${currentLine[0]|0}, ${currentLine[1]|0}, ${currentLine[2]|0}, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(mx, my);
                    ctx.lineTo(s.x, s.y);
                    ctx.stroke();
                }
            }
        }

        // 4. 画粒子
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${currentStar[0]|0}, ${currentStar[1]|0}, ${currentStar[2]|0}, ${s.alpha})`;
            ctx.fill();
        }

        // 5. 画流星 + 拖尾
        for (let i = 0; i < meteors.length; i++) {
            const m = meteors[i];
            m.life++;
            m.x += m.vx;
            m.y += m.vy;
            m.trail.push({ x: m.x, y: m.y });
            if (m.trail.length > 14) m.trail.shift();

            const lifeRatio = m.life / m.maxLife;
            const headAlpha = Math.min(1, m.life / 8) * (1 - lifeRatio);

            for (let k = 0; k < m.trail.length - 1; k++) {
                const t = m.trail[k];
                const next = m.trail[k + 1];
                const a = (k / m.trail.length) * 0.55 * headAlpha;
                ctx.strokeStyle = `rgba(${currentLine[0]|0}, ${currentLine[1]|0}, ${currentLine[2]|0}, ${a})`;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(t.x, t.y);
                ctx.lineTo(next.x, next.y);
                ctx.stroke();
            }
            ctx.fillStyle = `rgba(230, 245, 255, ${headAlpha})`;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
        meteors = meteors.filter(m => m.life < m.maxLife);

        requestAnimationFrame(drawStars);
    }

    resize();
    initStars();
    requestAnimationFrame(drawStars);
    window.addEventListener('resize', () => { resize(); initStars(); });
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
        mouse.lastMove = performance.now();
    });
    window.addEventListener('mouseleave', () => { mouse.active = false; });
    document.addEventListener('mouseout', (e) => {
        if (!e.relatedTarget && !e.toElement) mouse.active = false;
    });

    function scheduleMeteor() {
        spawnMeteor();
        setTimeout(scheduleMeteor, Math.random() * 3000 + 4000);
    }
    setTimeout(scheduleMeteor, 2000);

    // 暴露 setStarTheme + PANEL_HUES + currentHue 给 switchPanel
    window.setStarTheme = setStarTheme;
    window.PANEL_HUES = PANEL_HUES;
    window.currentPanelHue = currentHue;
    window.activeBgPanel = 'home';
})();
