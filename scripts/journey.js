// =============================================
// journey.js — 全空间叙事模式
// 把 7 个面板变成 7 个深空「空间站」,相机沿 Z 轴穿越。
// 内容零改动:复用现有 switchPanel 做主题/星空联动,
// 本脚本只接管「怎么去」——大门开场 / 滚轮 / 键盘 / 触摸 / 星图。
// reduce-motion 用户:本模式整体不启用,保持经典翻页。
// =============================================
(function () {
    'use strict';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var STATIONS = ['home', 'news', 'about', 'skills', 'projects', 'game', 'contact'];
    var LABELS = {
        home: '首页', news: '资讯', about: '关于', skills: '技能',
        projects: '项目', game: '游戏', contact: '联系'
    };
    var SPACING = 1500;          // 站间距(px,Z 轴)
    var FADE_FAR = -1450;        // 比这个更远:完全隐藏(停靠时相邻站不可见)
    var FADE_IN = -500;          // 从这个距离开始完全清晰
    var PASS_OUT = 120;          // 越过相机这个距离开始消散
    var GONE = 480;              // 越过相机这么远就彻底隐藏

    var panels = {};             // name -> { el, z }
    STATIONS.forEach(function (name, i) {
        var el = document.getElementById('panel-' + name);
        if (el) panels[name] = { el: el, z: i * SPACING };
    });

    var camZ = 0, targetZ = 0;
    var current = 'home';
    var navLockUntil = 0;
    var gatePresent = false;

    document.body.classList.add('journey');

    // ────────────────────────────────────────────
    // 1. 接管导航:包装现有 switchPanel(主题/星空/激活态照旧)
    // ────────────────────────────────────────────
    function flyTo(name) {
        if (!panels[name]) return;
        targetZ = panels[name].z;
        current = name;
        updateMap();
    }

    var origSwitch = window.switchPanel;
    if (typeof origSwitch === 'function') {
        window.switchPanel = function (t) {
            origSwitch(t);                 // 原逻辑:背景主题 + 星空变色 + active 类
            flyTo(t);                      // 相机飞向目标站
        };
    }

    // ────────────────────────────────────────────
    // 2. 相机主循环:每帧驱动 7 个面板的 Z / 透明度 / 可见性
    // ────────────────────────────────────────────
    function stepCamera() {
        var diff = targetZ - camZ;
        camZ = Math.abs(diff) > 0.4 ? camZ + diff * 0.06 : targetZ;

        STATIONS.forEach(function (name) {
            var p = panels[name];
            if (!p) return;
            var tz = camZ - p.z;           // 0=到站; 负=前方深处; 正=已越过
            var op;
            if (tz < FADE_FAR || tz > GONE)      op = 0;
            else if (tz >= PASS_OUT)             op = 1 - (tz - PASS_OUT) / (GONE - PASS_OUT);
            else if (tz >= FADE_IN)              op = 1;
            else                                 op = (tz - FADE_FAR) / (FADE_IN - FADE_FAR);

            var visible = op > 0.02;

            // 距离模糊:远处和正在掠过的站轻微失焦,焦点只留在当前站
            var blur = 0;
            if (tz < FADE_IN) blur = Math.min(4, (FADE_IN - tz) / 300);
            else if (tz > 60) blur = Math.min(4, (tz - 60) / 100);

            p.el.style.transform = 'translate(-50%,-50%) translateZ(' + tz.toFixed(1) + 'px)';
            p.el.style.opacity = op.toFixed(3);
            p.el.style.visibility = visible ? 'visible' : 'hidden';
            p.el.style.filter = blur > 0.2 ? 'saturate(1.05) blur(' + blur.toFixed(1) + 'px)' : '';

            // 停靠判定:只有到站的 panel 可交互
            var docked = Math.abs(tz) < 60;
            p.el.classList.toggle('dock', docked);
        });
    }

    // ────────────────────────────────────────────
    // 3. 飞行拖影(径向光线,速度越快越密)
    // ────────────────────────────────────────────
    var warp = { canvas: null, ctx: null, dpr: 1, streaks: [], boost: 0 };
    warp.canvas = document.createElement('canvas');
    warp.canvas.id = 'fxWarp';
    document.body.appendChild(warp.canvas);
    warp.ctx = warp.canvas.getContext('2d');
    warp.dpr = Math.min(window.devicePixelRatio || 1, 2);

    function sizeWarp() {
        warp.canvas.width = window.innerWidth * warp.dpr;
        warp.canvas.height = window.innerHeight * warp.dpr;
    }
    sizeWarp();
    window.addEventListener('resize', sizeWarp);

    function stepWarp() {
        var ctx = warp.ctx;
        var w = window.innerWidth, h = window.innerHeight;
        var cx = w / 2, cy = h * 0.46;       // 跟 perspective-origin 对齐
        ctx.setTransform(warp.dpr, 0, 0, warp.dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        var speedN = Math.min(1, Math.abs(targetZ - camZ) / (SPACING * 0.6));
        if (warp.boost > 0) { speedN = Math.max(speedN, warp.boost); warp.boost -= 0.02; }
        if (speedN <= 0.04 && !warp.streaks.length) return;

        if (speedN > 0.04) {
            var n = Math.ceil(speedN * 6);
            for (var i = 0; i < n && warp.streaks.length < 260; i++) {
                warp.streaks.push({
                    a: Math.random() * Math.PI * 2,
                    r: 30 + Math.random() * 80,
                    v: 5 + Math.random() * 9,
                    life: 1
                });
            }
        }

        var maxR = Math.sqrt(cx * cx + cy * cy) + 120;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.2;
        for (var j = warp.streaks.length - 1; j >= 0; j--) {
            var s = warp.streaks[j];
            s.r += s.v * (0.4 + speedN);
            s.v *= 1.03;
            s.life -= 0.012;
            if (s.life <= 0 || s.r > maxR) { warp.streaks.splice(j, 1); continue; }
            var len = s.v * 4.5 * Math.max(speedN, 0.15);
            var cos = Math.cos(s.a), sin = Math.sin(s.a);
            ctx.strokeStyle = 'rgba(200,220,255,' + (0.4 * s.life * Math.max(speedN, 0.2)).toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(cx + cos * s.r, cy + sin * s.r);
            ctx.lineTo(cx + cos * (s.r + len), cy + sin * (s.r + len));
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    (function loop() {
        stepCamera();
        stepWarp();
        requestAnimationFrame(loop);
    })();

    // ────────────────────────────────────────────
    // 4. 输入:滚轮 / 键盘 / 触摸(都走 scroll 边缘检测)
    // ────────────────────────────────────────────
    function go(dir) {
        if (gatePresent || Date.now() < navLockUntil) return;
        var idx = STATIONS.indexOf(current) + dir;
        if (idx < 0 || idx >= STATIONS.length) return;
        navLockUntil = Date.now() + 850;
        hideHint();
        window.switchPanel(STATIONS[idx]);
    }

    // 长内容 panel(skills/game)先滚自己,滚到头才切站
    function atEdge(dir) {
        var p = panels[current] && panels[current].el;
        if (!p) return true;
        if (dir > 0) return p.scrollTop + p.clientHeight >= p.scrollHeight - 8;
        return p.scrollTop <= 0;
    }

    window.addEventListener('wheel', function (e) {
        if (gatePresent) return;
        var dir = e.deltaY > 0 ? 1 : -1;
        if (atEdge(dir)) {
            e.preventDefault();
            go(dir);
        }
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
        if (gatePresent) return;
        if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
        if (document.body.dataset.activePanel === 'game') return;  // 游戏区把方向键留给游戏
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
        else if (e.key === 'Home') { e.preventDefault(); window.switchPanel(STATIONS[0]); }
        else if (e.key === 'End')  { e.preventDefault(); window.switchPanel(STATIONS[STATIONS.length - 1]); }
    });

    var touchY = null;
    window.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) touchY = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener('touchend', function (e) {
        if (touchY === null || gatePresent) return;
        var dy = touchY - e.changedTouches[0].clientY;
        touchY = null;
        if (Math.abs(dy) < 70) return;
        var dir = dy > 0 ? 1 : -1;
        if (atEdge(dir)) go(dir);
    }, { passive: true });

    // ────────────────────────────────────────────
    // 5. 星图导航 + 迷你品牌 + 航行提示
    // ────────────────────────────────────────────
    var mapEl = document.createElement('nav');
    mapEl.className = 'jmap';
    mapEl.setAttribute('aria-label', '空间站导航');
    STATIONS.forEach(function (name) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jmap-stop';
        btn.dataset.s = name;
        btn.innerHTML = '<span class="jmap-dot"></span><span class="jmap-label">' + LABELS[name] + '</span>';
        btn.addEventListener('click', function () { hideHint(); window.switchPanel(name); });
        mapEl.appendChild(btn);
    });
    document.body.appendChild(mapEl);

    function updateMap() {
        mapEl.querySelectorAll('.jmap-stop').forEach(function (b) {
            b.classList.toggle('on', b.dataset.s === current);
        });
    }
    updateMap();

    var brand = document.createElement('div');
    brand.className = 'jbrand';
    brand.textContent = 'SKY STAR';
    brand.title = '回到起点';
    brand.addEventListener('click', function () { window.switchPanel('home'); });
    document.body.appendChild(brand);

    var hint = document.createElement('div');
    hint.className = 'jhint';
    hint.innerHTML = '滚动 / 方向键 向深处航行 <span class="jhint-arrow">▼</span>';
    document.body.appendChild(hint);
    var hintGone = false;
    function hideHint() {
        if (hintGone) return;
        hintGone = true;
        hint.classList.add('gone');
        setTimeout(function () { hint.remove(); }, 800);
    }

    // ────────────────────────────────────────────
    // 6. 大门开场(每个会话只看一次)
    // ────────────────────────────────────────────
    var seen = false;
    try { seen = sessionStorage.getItem('sj-gate') === 'seen'; } catch (e) { /* 隐私模式静默 */ }

    if (!seen) {
        gatePresent = true;
        // 相机先停在首页「门外」900px 处,开门后再滑入,形成往里走的感觉
        camZ = -900;
        targetZ = -900;
        var gate = document.createElement('div');
        gate.id = 'fx-gate';
        gate.setAttribute('role', 'button');
        gate.setAttribute('aria-label', '点击进入网站');
        gate.innerHTML =
            '<div class="gate-inner">' +
            '  <div class="gate-title">SKY STAR</div>' +
            '  <div class="gate-frame">' +
            '    <div class="gate-glow"></div>' +
            '    <div class="gate-leaf left"></div>' +
            '    <div class="gate-leaf right"></div>' +
            '  </div>' +
            '  <div class="gate-hint">点 击 进 入 我 的 宇 宙</div>' +
            '</div>';
        document.body.appendChild(gate);

        gate.addEventListener('click', function () {
            if (gate.classList.contains('opening')) return;
            gate.classList.add('opening');
            warp.boost = 1;                                   // 开门即加速
            setTimeout(function () {
                gate.classList.add('fly');                    // 镜头冲过门框
                gatePresent = false;
                targetZ = 0;                                  // 同时滑入首页
                try { sessionStorage.setItem('sj-gate', 'seen'); } catch (e) { /* 静默 */ }
                setTimeout(function () { gate.remove(); }, 1000);
            }, 1050);
        });
        // 键盘用户:回车开门
        gate.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') gate.click();
        });
        gate.tabIndex = 0;
        gate.focus();
    }

    // 调试 / 给其他脚本留的钩子
    window.Journey = { flyTo: flyTo, stations: STATIONS.slice() };

})();
