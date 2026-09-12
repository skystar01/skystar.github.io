// ============================================================
// src/app.js  --  阶段1 自动合并产物
// 原 scripts/ 下各经典脚本按原 index.html 加载顺序拼接为单一 ES Module。
// 全部游戏脚本(snake..survivor)与 game-plane.js 均已移至独立模块, 由 game-shell 按需动态 import 懒加载(阶段2).
// 静态内容数据在 src/data/, 改文案/指标不碰交互脚本。
// ============================================================

import { projectData } from './data/projects.js';
import { skillData } from './data/skills.js';

// ---------- stars-bg.js ----------
// ─── 静态星图 ───
// 高性能替代: 一次性绘制星座点线,无每帧 rAF / 无 O(n²) 连线 / 无鼠标引力。
// 动效仅保留: CSS 稀疏流星 + 少数亮星呼吸; 切站用 filter 快速染色。
// 仍暴露 window.setStarTheme / PANEL_HUES / currentPanelHue / activeBgPanel 供 ui.js 使用。
(function() {
    const canvas = document.getElementById('starsCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 每个 panel 的代表色相(大色差跳变走 waypoint 的判定仍由 ui.js 使用)
    const PANEL_HUES = {
        home: 240, news: 255, about: 270, skills: 300, projects: 330,
        game: 20, contact: 60
    };

    // 星座连线用的稀疏节点(归一化 0–1,随分辨率缩放)
    const CONSTELLATIONS = [
        // 北斗状
        [[0.08,0.18],[0.14,0.12],[0.22,0.14],[0.28,0.2],[0.26,0.28],[0.18,0.3],[0.12,0.25],[0.08,0.18]],
        // 三角
        [[0.72,0.12],[0.82,0.22],[0.7,0.28],[0.72,0.12]],
        // 折线
        [[0.55,0.55],[0.62,0.5],[0.7,0.58],[0.78,0.52]],
        // 小菱形
        [[0.18,0.62],[0.24,0.7],[0.18,0.78],[0.12,0.7],[0.18,0.62]],
        // 右下长弧
        [[0.82,0.68],[0.88,0.74],[0.86,0.84],[0.78,0.88]]
    ];

    function mulberry32(a) {
        return function () {
            let t = (a += 0x6d2b79f5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function drawStaticSky() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const rand = mulberry32(0x51c17a7); // 固定种子,刷新布局稳定
        const starCount = Math.min(220, Math.floor((w * h) / 9000));

        // 1) 淡雾径向光(静态,增强深度,不每帧画)
        const g = ctx.createRadialGradient(w * 0.55, h * 0.4, 0, w * 0.55, h * 0.4, Math.max(w, h) * 0.55);
        g.addColorStop(0, 'rgba(120,140,255,0.07)');
        g.addColorStop(1, 'rgba(120,140,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // 2) 星座线(极淡,固定结构 = 静态星图)
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(180, 200, 255, 0.12)';
        for (const path of CONSTELLATIONS) {
            ctx.beginPath();
            path.forEach((p, i) => {
                const x = p[0] * w;
                const y = p[1] * h;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // 3) 星点: 大量微星 + 少数亮星(给 CSS 呼吸 class)
        const heroStars = [];
        for (let i = 0; i < starCount; i++) {
            const x = rand() * w;
            const y = rand() * h;
            const r = rand() * 1.4 + 0.35;
            const a = 0.25 + rand() * 0.55;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(220, 230, 255, ${a})`;
            ctx.fill();
            if (r > 1.35 && rand() > 0.72) heroStars.push({ x, y, r: r + 0.8 });
        }

        // 亮星光晕(静态)
        for (const s of heroStars) {
            const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
            hg.addColorStop(0, 'rgba(200, 220, 255, 0.35)');
            hg.addColorStop(1, 'rgba(200, 220, 255, 0)');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();
        }
    }

    // 切站染色: 用 CSS filter,不再跑颜色 rAF
    function setStarTheme(panel, useWaypoint) {
        if (!PANEL_HUES[panel] && panel !== 'waypoint') return;
        const hue = PANEL_HUES[panel] != null ? PANEL_HUES[panel] : 240;
        // 轻微色相偏移即可,避免把白星滤成脏色
        const shift = ((hue - 240) + 360) % 360;
        canvas.style.filter = `hue-rotate(${Math.round(shift * 0.35)}deg) saturate(1.15)`;
        if (useWaypoint) {
            canvas.style.opacity = '0.55';
            setTimeout(() => { canvas.style.opacity = '1'; }, 280);
        }
    }

    drawStaticSky();
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawStaticSky, 120);
    });

    window.setStarTheme = setStarTheme;
    window.PANEL_HUES = PANEL_HUES;
    window.currentPanelHue = 240;
    window.activeBgPanel = 'home';
})();

// ---------- ui.js ----------
// ─── UI 逻辑: panel 切换 / toast / contact 复制 / 项目&技能数据 + 弹窗 ───
// 依赖: stars-bg.js 提供的 window.setStarTheme / PANEL_HUES / currentPanelHue / activeBgPanel

// ─── 通用 FOCUS TRAP 工具 ───
// 用法: const trap = createFocusTrap(modalEl); trap.activate(); ... trap.deactivate();
// - activate: 记录当前焦点, 把焦点移到弹窗内第一个可聚焦元素, 拦截 Tab 让焦点循环
// - deactivate: 移除拦截, 把焦点还原到打开者
const FOCUSABLE_SELECTOR = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'textarea:not([disabled])', 'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusableChildren(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
}

function createFocusTrap(modalEl) {
    let lastFocused = null;
    let keydownHandler = null;

    function activate() {
        lastFocused = document.activeElement;
        // 焦点移到弹窗内第一个可聚焦元素(通常是关闭按钮)
        const focusable = getFocusableChildren(modalEl);
        if (focusable.length) {
            // 优先聚焦关闭按钮,方便键盘用户立刻 ESC
            const closeBtn = modalEl.querySelector('[aria-label*="关闭"]');
            (closeBtn && focusable.includes(closeBtn) ? closeBtn : focusable[0]).focus();
        } else {
            modalEl.setAttribute('tabindex', '-1');
            modalEl.focus();
        }
        modalEl.setAttribute('aria-hidden', 'false');

        keydownHandler = (e) => {
            if (e.key !== 'Tab') return;
            const currentFocusable = getFocusableChildren(modalEl);
            if (!currentFocusable.length) { e.preventDefault(); return; }
            const first = currentFocusable[0];
            const last = currentFocusable[currentFocusable.length - 1];
            const active = document.activeElement;

            if (e.shiftKey) {
                if (active === first || !modalEl.contains(active)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (active === last || !modalEl.contains(active)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        modalEl.addEventListener('keydown', keydownHandler);
    }

    function deactivate() {
        if (keydownHandler) {
            modalEl.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }
        modalEl.setAttribute('aria-hidden', 'true');
        if (lastFocused && typeof lastFocused.focus === 'function') {
            // 用 setTimeout 避免在 closing 动画期间焦点被夺走
            setTimeout(() => lastFocused.focus(), 0);
        }
    }

    return { activate, deactivate };
}

// 全局 focus trap 实例 (每次打开新弹窗覆盖)
let _activeFocusTrap = null;
function activateFocusTrap(modalEl) {
    if (_activeFocusTrap) _activeFocusTrap.deactivate();
    _activeFocusTrap = createFocusTrap(modalEl);
    _activeFocusTrap.activate();
}
function deactivateFocusTrap() {
    if (_activeFocusTrap) {
        _activeFocusTrap.deactivate();
        _activeFocusTrap = null;
    }
}
// 暴露给 news.js 等其它脚本使用
window.activateFocusTrap = activateFocusTrap;
window.deactivateFocusTrap = deactivateFocusTrap;

// ─── SECTION SWITCHING ───
let currentPanel = 'home';
// 初始化 body 主题色 (与 switchPanel 内保持一致,保证首屏渲染就有正确 accent)
document.body.dataset.activePanel = currentPanel;

function switchPanel(target) {
    if (target === currentPanel) return;
    const oldPanel = document.getElementById('panel-' + currentPanel);
    const newPanel = document.getElementById('panel-' + target);
    if (!newPanel) return;

    // 记录"上一个 active 背景"用(因为 currentPanel 后面会改)
    const prevBgPanel = window.activeBgPanel || currentPanel;

    oldPanel.classList.add('exit');
    setTimeout(() => {
        oldPanel.classList.remove('active', 'exit');
    }, 300);

    newPanel.classList.add('active');
    currentPanel = target;
    // 同步 body 主题色,触发 CSS [data-active-panel] 切换 --accent / --accent2
    document.body.dataset.activePanel = target;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.target === target);
    });

    // 切背景主题 + 切粒子色
    // 大色差跳变(>90°):走 waypoint 中转(0° 红),2 段过渡
    // 小色差(≤90°):直接交叉淡入
    const targetHue = (window.PANEL_HUES && window.PANEL_HUES[target]) || 240;
    let hueDist = Math.abs(targetHue - window.currentPanelHue);
    if (hueDist > 180) hueDist = 360 - hueDist;
    const useWaypoint = hueDist > 90;

    const curBgEl = document.querySelector('.theme-' + prevBgPanel);
    const bgEl = document.querySelector('.theme-' + target);
    const wpEl = document.querySelector('.theme-waypoint');

    if (useWaypoint) {
        // Stage 1 (0-400ms):prev 淡出,waypoint 淡入
        if (curBgEl) curBgEl.classList.remove('active');
        if (wpEl) wpEl.classList.add('active');
        // Stage 2 (400ms 起):waypoint 淡出,target 淡入
        setTimeout(() => {
            if (wpEl) wpEl.classList.remove('active');
            if (bgEl) bgEl.classList.add('active');
            window.activeBgPanel = target;
        }, 400);
    } else {
        if (curBgEl) curBgEl.classList.remove('active');
        if (bgEl) bgEl.classList.add('active');
        window.activeBgPanel = target;
    }

    window.currentPanelHue = targetHue;
    if (typeof window.setStarTheme === 'function') window.setStarTheme(target, useWaypoint);
}
// 暴露 switchPanel 到 window 总线:
// 导航点击/键盘/按钮均通过 window.switchPanel(...) 调用;
// 且下方 journey 段(约 1433 行)会先读取 window.switchPanel 再包装,必须在包装前挂好,
// 否则 origSwitch 为 undefined → 包装器不安装 → window.switchPanel 始终 undefined 而报 is not a function。
window.switchPanel = switchPanel;

// Nav item clicks
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchPanel(item.dataset.target));
});

// CTA / any [data-target] links
document.querySelectorAll('[data-target]').forEach(el => {
    if (el.classList.contains('nav-item')) return;
    el.addEventListener('click', e => {
        e.preventDefault();
        switchPanel(el.dataset.target);
    });
});

// ─── TOAST ───
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
// 阶段2: 挂到 window 总线, 供被拆出的 games-bundle.js 模块调用 (拆模块后不再共享词法作用域)
window.showToast = showToast;

// ─── CONTACT COPY ───
function copyContactText(txt) {
    const done = () => showToast('已复制到剪贴板');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = txt;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
    }
}
document.querySelectorAll('.contact-item-copy').forEach(item => {
    const txt = item.getAttribute('data-copy') || item.querySelector('p')?.textContent || '';
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => copyContactText(txt.trim()));
});
document.querySelectorAll('.contact-item').forEach(item => {
    if (item.classList.contains('contact-item-copy')) return;
    const p = item.querySelector('p');
    const txt = p ? p.textContent : '';
    if (txt.includes('+86') || txt === 'tjqflydream') {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => copyContactText(txt));
    }
});


// ─── SKILL MODAL ───
let _modalBusy = false;

document.querySelectorAll('.skill-item').forEach(item => {
    item.addEventListener('click', () => {
        if (_modalBusy) return;
        // 优先无 class 的名称 span；SVG 图标 span 带 class，避免误取
        const nameEl = item.querySelector('span:not([class])')
            || [...item.querySelectorAll('span')].find(s => s.textContent.trim() && !String(s.className || '').includes('icon-'));
        if (nameEl) openSkillModal(nameEl.textContent.trim());
    });
});

document.getElementById('modalClose').addEventListener('click', closeSkillModal);
document.getElementById('modalOverlay').addEventListener('click', closeSkillModal);

function openSkillModal(skillName) {
    const skill = skillData[skillName];
    if (!skill) return;
    const modal = document.getElementById('skillModal');
    const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const escAttr = s => escHtml(s);
    // icon-* 走 SVG sprite; font-awesome 类名直接用 <i>
    const cardIcon = document.getElementById('cardIcon');
    if (skill.icon && skill.icon.indexOf('icon-') === 0) {
        const skillKey = skill.icon.replace(/^icon-/, '');
        cardIcon.innerHTML = `<span class="${escAttr(skill.icon)}" aria-label="${escAttr(skillName)}"><svg viewBox="0 0 24 24"><use href="#i-${escAttr(skillKey)}"/></svg></span>`;
    } else {
        cardIcon.innerHTML = `<i class="${escAttr(skill.icon || 'fas fa-cube')}" aria-label="${escAttr(skillName)}"></i>`;
    }
    document.getElementById('cardTitle').textContent = skillName;
    document.getElementById('cardLevel').textContent = skill.level;
    document.getElementById('detailTitle').textContent = skillName;
    document.getElementById('detailDesc').textContent = skill.description;
    document.getElementById('tag1').textContent = skill.tags[0];
    document.getElementById('tag2').textContent = skill.tags[1];
    const t3 = document.getElementById('tag3');
    t3.textContent = skill.tags[2] || '';
    t3.style.display = skill.tags[2] ? '' : 'none';
    // 渲染"我用这个做过"项目列表
    const projectsEl = document.getElementById('detailProjects');
    if (skill.projects && skill.projects.length) {
        projectsEl.innerHTML = skill.projects.map(p => `
            <a class="detail-project" href="${escAttr(p.link || '#')}" ${p.link && p.link !== '#' ? 'target="_blank" rel="noopener"' : ''}>
                <div class="detail-project-name">${escHtml(p.name)}</div>
                <div class="detail-project-desc">${escHtml(p.desc)}</div>
            </a>
        `).join('');
        projectsEl.style.display = '';
    } else {
        projectsEl.style.display = 'none';
    }
    document.getElementById('detailFeatures').innerHTML = skill.features.map(f =>
        `<li><span class="feat-icon"><i class="fas fa-check"></i></span> ${escHtml(f)}</li>`).join('');
    // 渲染"正在学"
    const exploringWrap = document.getElementById('detailExploring');
    if (skill.exploring && skill.exploring.length) {
        document.getElementById('exploringTags').innerHTML = skill.exploring
            .map(t => `<span class="exploring-tag">${escHtml(t)}</span>`).join('');
        exploringWrap.hidden = false;
    } else {
        exploringWrap.hidden = true;
    }
    modal.classList.remove('active','closing');
    void modal.offsetWidth;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    _modalBusy = true;
    setTimeout(() => { _modalBusy = false; }, 800);
    // focus trap: 转移焦点 + Tab 循环 + 关闭还原
    activateFocusTrap(modal);
}

function closeSkillModal() {
    const modal = document.getElementById('skillModal');
    if (!modal.classList.contains('active') || modal.classList.contains('closing')) return;
    _modalBusy = true;
    deactivateFocusTrap();
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.remove('active','closing');
        document.body.style.overflow = '';
        _modalBusy = false;
    }, 520);
}

// ─── PROJECT MODAL ───
let currentCarouselIndex = 0;
let currentProjectScreenshots = [];

function renderCarousel(screenshots) {
    const slides = document.getElementById('carouselSlides');
    const dots = document.getElementById('carouselDots');
    slides.innerHTML = ''; dots.innerHTML = '';
    if (!screenshots || !screenshots.length) screenshots = ['🌟','🚀','💡'];
    currentProjectScreenshots = screenshots;
    screenshots.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'carousel-slide';
        if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('images/') || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(item))) {
            const img = document.createElement('img'); img.src = item; div.appendChild(img);
        } else {
            div.innerHTML = `<i class="fas fa-image" style="font-size:2.5rem"></i><span style="margin-left:8px">${item}</span>`;
        }
        slides.appendChild(div);
        const dot = document.createElement('div');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => goToSlide(i));
        dots.appendChild(dot);
    });
    goToSlide(0);
}
function goToSlide(i) {
    if (!currentProjectScreenshots.length) return;
    i = Math.max(0, Math.min(i, currentProjectScreenshots.length - 1));
    currentCarouselIndex = i;
    document.getElementById('carouselSlides').style.transform = `translateX(-${i * 100}%)`;
    document.querySelectorAll('#carouselDots .dot').forEach((d, j) => d.classList.toggle('active', j === i));
}

document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openProjectModal(card.querySelector('h3').textContent));
});
document.querySelectorAll('.project-link').forEach(link => {
    link.addEventListener('click', e => e.stopPropagation());
});
document.querySelectorAll('.project-cta-soft, .project-cta-play').forEach(btn => {
    btn.addEventListener('click', e => {
        e.stopPropagation();
        const openName = btn.getAttribute('data-open-project');
        if (openName) { openProjectModal(openName); return; }
        const game = btn.getAttribute('data-play-game');
        if (game) {
            if (window.switchPanel) window.switchPanel('game');
            setTimeout(() => {
                document.querySelector(`.game-tab[data-game="${game}"]`)?.click();
            }, 500);
        }
    });
});
document.getElementById('projectModalClose').addEventListener('click', closeProjectModal);
document.getElementById('projectOverlay').addEventListener('click', closeProjectModal);
document.getElementById('carouselPrev').addEventListener('click', () => goToSlide(currentCarouselIndex - 1));
document.getElementById('carouselNext').addEventListener('click', () => goToSlide(currentCarouselIndex + 1));

function openProjectModal(projectName) {
    const project = projectData[projectName];
    if (!project) return;
    const modal = document.getElementById('projectModal');
    const projKey = project.icon.replace(/^icon-/, '');
    document.getElementById('projCardIcon').innerHTML = `<span class="${project.icon}" aria-label="${projectName}"><svg viewBox="0 0 24 24"><use href="#i-${projKey}"/></svg></span>`;
    document.getElementById('projMainCardName').textContent = projectName;
    document.getElementById('projCardBadge').textContent = project.level || '高级';
    document.getElementById('modalProjectTitle').textContent = projectName;
    document.getElementById('modalProjectDesc').textContent = project.description;
    document.getElementById('modalProgressValue').textContent = project.progress + '%';
    const pf = document.getElementById('modalProgressFill');
    pf.style.transition = 'none'; pf.style.width = '0%';
    const tc = document.getElementById('modalTechTags'); tc.innerHTML = '';
    const techs = project.techStack ? project.techStack.split(',').map(t => t.trim()) : (project.tags || ['创新']);
    techs.forEach(t => { const b = document.createElement('span'); b.className = 'tech-badge'; b.textContent = t; tc.appendChild(b); });
    // 可量化指标
    const metricsEl = document.getElementById('modalMetrics');
    if (metricsEl) {
        if (project.metrics && project.metrics.length) {
            metricsEl.innerHTML = project.metrics.map(m =>
                `<div class="metric-item"><span class="metric-k">${m.k}</span><span class="metric-v">${m.v}</span></div>`
            ).join('');
            metricsEl.hidden = false;
        } else {
            metricsEl.innerHTML = '';
            metricsEl.hidden = true;
        }
    }
    // 试玩 CTA
    const playBtn = document.getElementById('modalPlayBtn');
    if (playBtn) {
        if (project.playTarget) {
            playBtn.hidden = false;
            playBtn.innerHTML = `<i class="fas fa-gamepad"></i> ${project.playLabel || '立即试玩'}`;
            playBtn.onclick = () => {
                closeProjectModal();
                setTimeout(() => {
                    if (window.switchPanel) window.switchPanel(project.playTarget);
                    if (project.playTarget === 'game') {
                        setTimeout(() => document.querySelector('.game-tab[data-game="flappy"]')?.click(), 600);
                    }
                }, 350);
            };
        } else {
            playBtn.hidden = true;
            playBtn.onclick = null;
        }
    }
    renderCarousel(project.screenshots || ['✨','⚙️','📊']);
    modal.classList.remove('active','closing');
    void modal.offsetWidth;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { pf.style.transition = ''; pf.style.width = project.progress + '%'; }, 900);
    activateFocusTrap(modal);
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    if (!modal.classList.contains('active') || modal.classList.contains('closing')) return;
    deactivateFocusTrap();
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.remove('active','closing');
        document.body.style.overflow = '';
        const pf = document.getElementById('modalProgressFill');
        if (pf) { pf.style.transition = 'none'; pf.style.width = '0%'; }
    }, 480);
}

// Escape key closes modals
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('skillModal').classList.contains('active')) closeSkillModal();
        if (document.getElementById('projectModal').classList.contains('active')) closeProjectModal();
    }
});

// ============================================================
// 主页 hero RL 神经网络 — Level 1 tooltip + Level 2 forward pass
// ============================================================
(function initRLNetworkInteraction() {
    const tooltip   = document.getElementById('rlTooltip');
    const visual    = document.querySelector('.hero-visual');
    const allNodes  = document.querySelectorAll('.hero-visual .rl-node');
    const states    = document.querySelectorAll('.hero-visual .rl-node-in');
    const policies  = document.querySelectorAll('.hero-visual .rl-node-mid');
    const actions   = document.querySelectorAll('.hero-visual .rl-node-action');
    if (!tooltip || !visual || !allNodes.length) return;

    // ── Level 1: 12 节点语义信息 ──
    // 顺序: 4 State → 5 Policy → 3 Action (跟 DOM 顺序一致)
    // 标注"网络示意"以避免跟 Flappy 12 维 obs 错位
    const NODE_INFO = [
        { layer: 'state',  name: 'STATE 节点 1',  desc: '网络示意 · 表示环境状态的一维特征' },
        { layer: 'state',  name: 'STATE 节点 2',  desc: '网络示意 · 状态向量的另一维特征' },
        { layer: 'state',  name: 'STATE 节点 3',  desc: '网络示意 · 状态向量的另一维特征' },
        { layer: 'state',  name: 'STATE 节点 4',  desc: '网络示意 · 状态向量的另一维特征' },
        // Policy 层对应 train_flappy.py 里的 Dueling DQN
        { layer: 'policy', name: 'HIDDEN h1',     desc: 'Linear → ReLU · 128 维特征提取层' },
        { layer: 'policy', name: 'HIDDEN h2',     desc: 'Linear → ReLU · 128 维特征提取层' },
        { layer: 'policy', name: 'VALUE 流',      desc: 'V(s) · 状态价值,这一局整体赢面多大' },
        { layer: 'policy', name: 'ADVANTAGE 流',  desc: 'A(s,a) · 优势,某动作相对均值的差' },
        { layer: 'policy', name: 'Q 合并',        desc: 'Q = V + A − mean(A) · 每动作的预期回报' },
        // Action 层可点击,触发 forward pass
        { layer: 'action', name: 'Q(flap)',       desc: '拍翅膀的预期累积回报 · 点击看推理过程' },
        { layer: 'action', name: 'Q 融合',        desc: '决策层 Q 值输出 · 点击看推理过程' },
        { layer: 'action', name: 'argmax',        desc: '取 Q 最大的动作执行 · 点击看推理过程' }
    ];

    function showTooltip(idx, node) {
        const info = NODE_INFO[idx];
        if (!info) return;
        tooltip.innerHTML =
            '<div class="rl-tooltip-name ' + info.layer + '">' + info.name + '</div>' +
            '<div class="rl-tooltip-desc">' + info.desc + '</div>';
        tooltip.hidden = false;
        const nRect = node.getBoundingClientRect();
        const vRect = visual.getBoundingClientRect();
        const x = nRect.left + nRect.width / 2 - vRect.left;
        const y = nRect.top - vRect.top;
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
        requestAnimationFrame(() => tooltip.classList.add('visible'));
    }
    function hideTooltip() {
        tooltip.classList.remove('visible');
        setTimeout(() => { tooltip.hidden = true; }, 160);
    }

    allNodes.forEach((node, idx) => {
        node.addEventListener('mouseenter', () => showTooltip(idx, node));
        node.addEventListener('mouseleave', hideTooltip);
        node.addEventListener('focus',      () => showTooltip(idx, node));
        node.addEventListener('blur',       hideTooltip);
    });

    // ── Level 2: Action 节点点击 → forward pass 演示 ──
    const l1l2Edges = document.querySelectorAll('.rl-edges-l1l2 line');
    const l2l3Edges = document.querySelectorAll('.rl-edges-l2l3 line');
    let forwardTimer = null;

    function clearForwardPass() {
        if (forwardTimer) { clearTimeout(forwardTimer); forwardTimer = null; }
        l1l2Edges.forEach(e => { e.classList.remove('forward-active'); e.style.animationDelay = ''; });
        l2l3Edges.forEach(e => { e.classList.remove('forward-active'); e.style.animationDelay = ''; });
        [...states, ...policies, ...actions].forEach(n => {
            n.classList.remove('forward-pulse');
            n.style.animationDelay = '';
        });
    }

    function runForwardPass(actionIdx) {
        // 防止动画叠加
        clearForwardPass();
        const targetAction = actions[actionIdx];
        if (!targetAction) return;

        // Phase 1 (320ms): Action 节点脉动 + L2L3 边流光
        targetAction.classList.add('forward-pulse');
        l2l3Edges.forEach((e, i) => {
            e.style.animationDelay = (i * 12) + 'ms';
            e.classList.add('forward-active');
        });

        forwardTimer = setTimeout(() => {
            targetAction.classList.remove('forward-pulse');
            l2l3Edges.forEach(e => e.classList.remove('forward-active'));

            // Phase 2 (420ms): Policy 节点脉动 + L1L2 边流光
            policies.forEach((n, i) => {
                n.style.animationDelay = (i * 30) + 'ms';
                n.classList.add('forward-pulse');
            });
            l1l2Edges.forEach((e, i) => {
                e.style.animationDelay = (i * 6) + 'ms';
                e.classList.add('forward-active');
            });

            forwardTimer = setTimeout(() => {
                policies.forEach(n => n.classList.remove('forward-pulse'));
                l1l2Edges.forEach(e => e.classList.remove('forward-active'));

                // Phase 3 (320ms): State 节点依次脉动
                states.forEach((n, i) => {
                    n.style.animationDelay = (i * 60) + 'ms';
                    n.classList.add('forward-pulse');
                });

                forwardTimer = setTimeout(() => {
                    clearForwardPass();
                }, 320);
            }, 420);
        }, 320);
    }

    actions.forEach((node, idx) => {
        node.addEventListener('click', e => {
            e.preventDefault();
            runForwardPass(idx);
        });
        node.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                runForwardPass(idx);
            }
        });
    });
})();

// ---------- fx.js ----------
// =============================================
// fx.js — 交互特效 & 彩蛋层(增量加载,不改动原有逻辑)
// 包含: console 签名 / hero 打字机 / 鼠标视差 / 粒子拖尾 /
//       磁吸按钮 / 卡片 3D 倾斜 / Konami 秘籍 / 终端彩蛋
// 性能: 单一 rAF 循环; 粒子封顶; 触屏与 reduce-motion 自动降级
// =============================================
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    // ────────────────────────────────────────────
    // 0. Console 签名(给会开 DevTools 的同类)
    // ────────────────────────────────────────────
    try {
        var art = [
            '  ____  _  ____   _______ _____ _____ ',
            ' / ___|| |/ /\\ \\ / / ____|_   _|  __ \\',
            ' \\___ \\|   /  \\ V /\\___ \\  | | | |  | |',
            '  ___) |   \\   | |  ___) | | | | |__| |',
            ' |____/|_|\\_\\  |_| |____/  |_| |_|  |_|'
        ].join('\n');
        console.log('%c' + art, 'color:#7c6ef5;font-family:monospace;');
        console.log('%c你好呀,同类。%c 既然翻到了这里——', 'color:#4ecdc4;font-size:14px;font-weight:bold;', 'color:#8892b0;');
        console.log('%c· 按 ` 键(反引号) 可以召唤一个终端\n· 方向键 ↑↑↓↓←→←→ 然后 B A,会有好事发生', 'color:#8892b0;line-height:1.8;');
    } catch (e) { /* console 不可用时静默 */ }

    // ────────────────────────────────────────────
    // 1. hero 打字机(eyebrow 轮换短语)
    // ────────────────────────────────────────────
    (function initTypewriter() {
        var eyebrow = document.querySelector('.hero-eyebrow');
        if (!eyebrow || reduceMotion) return;

        var PHRASES = [
            eyebrow.textContent.trim(),          // 原文案永远第一个
            'DQN · PPO · Reward Shaping',
            '让智能体学会玩游戏',
            'Training Agents, One Episode at a Time'
        ];

        var typed = document.createElement('span');
        typed.className = 'fx-typed';
        var caret = document.createElement('span');
        caret.className = 'fx-caret';
        eyebrow.textContent = '';
        eyebrow.appendChild(typed);
        eyebrow.appendChild(caret);

        var phraseIdx = 0, charIdx = 0, deleting = false;

        function tick() {
            var phrase = PHRASES[phraseIdx];
            if (!deleting) {
                charIdx++;
                typed.textContent = phrase.slice(0, charIdx);
                if (charIdx >= phrase.length) {
                    deleting = true;
                    setTimeout(tick, 2400);      // 完整显示停留
                    return;
                }
                setTimeout(tick, 75);
            } else {
                charIdx--;
                typed.textContent = phrase.slice(0, charIdx);
                if (charIdx <= 0) {
                    deleting = false;
                    phraseIdx = (phraseIdx + 1) % PHRASES.length;
                    setTimeout(tick, 450);
                    return;
                }
                setTimeout(tick, 32);
            }
        }
        setTimeout(tick, 900);                   // 等入场动画差不多结束
    })();

    // ────────────────────────────────────────────
    // 2. 入场编排开关(配合 fx.css 的 fxRise)
    // ────────────────────────────────────────────
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            document.body.classList.add('fx-ready');
        });
    });

    // ────────────────────────────────────────────
    // 3. 共享状态:鼠标 + 当前强调色
    // ────────────────────────────────────────────
    var mouse = { x: -9999, y: -9999, nx: 0.5, ny: 0.5 };
    window.addEventListener('mousemove', function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.nx = e.clientX / window.innerWidth;
        mouse.ny = e.clientY / window.innerHeight;
    }, { passive: true });

    var accentRGB = [78, 205, 196];
    function refreshAccent() {
        var raw = getComputedStyle(document.body).getPropertyValue('--accent2-rgb');
        var parts = raw.split(',').map(function (s) { return parseInt(s, 10); });
        if (parts.length === 3 && !isNaN(parts[0])) accentRGB = parts;
    }
    refreshAccent();
    new MutationObserver(refreshAccent)
        .observe(document.body, { attributes: true, attributeFilter: ['data-active-panel'] });

    // ────────────────────────────────────────────
    // 4. 鼠标视差(仅首页,lerp 平滑)
    // ────────────────────────────────────────────
    var parallaxLayers = [];
    if (!reduceMotion && !coarsePointer) {
        [
            { sel: '.hero-left',    depth: 14,  invert: false },
            { sel: '.hero-visual',  depth: 24,  invert: true  },
            { sel: '.corner-brand', depth: 8,   invert: false }
        ].forEach(function (cfg) {
            var el = document.querySelector(cfg.sel);
            if (el) parallaxLayers.push({ el: el, depth: cfg.depth, invert: cfg.invert, cx: 0, cy: 0 });
        });
    }

    function stepParallax() {
        if (!parallaxLayers.length) return;
        // 只在首页激活时推进,其它面板零开销
        if (document.body.dataset.activePanel !== 'home') return;
        var tx = (mouse.nx - 0.5), ty = (mouse.ny - 0.5);
        parallaxLayers.forEach(function (L) {
            var sign = L.invert ? -1 : 1;
            L.cx += (tx * L.depth * sign - L.cx) * 0.06;
            L.cy += (ty * L.depth * sign - L.cy) * 0.06;
            L.el.style.transform = 'translate3d(' + L.cx.toFixed(2) + 'px,' + L.cy.toFixed(2) + 'px,0)';
        });
    }

    // ────────────────────────────────────────────
    // 5. 鼠标粒子拖尾(发光星尘,跟随主题色)
    // ────────────────────────────────────────────
    var trail = { canvas: null, ctx: null, parts: [], lastSpawn: 0, dpr: 1 };
    // 减法审计:拖尾定位为「氛围配角」,密度/尺寸/亮度全面压低,
    // 主角让给面板内容与 RL 可视化;爆发(burst)场景不受影响
    var MAX_PARTS = 55;

    if (!reduceMotion && !coarsePointer) {
        trail.canvas = document.createElement('canvas');
        trail.canvas.id = 'fxTrail';
        document.body.appendChild(trail.canvas);
        trail.ctx = trail.canvas.getContext('2d');
        trail.dpr = Math.min(window.devicePixelRatio || 1, 2);

        function sizeTrail() {
            trail.canvas.width = window.innerWidth * trail.dpr;
            trail.canvas.height = window.innerHeight * trail.dpr;
        }
        sizeTrail();
        window.addEventListener('resize', sizeTrail);

        window.addEventListener('mousemove', function (e) {
            var now = performance.now();
            if (now - trail.lastSpawn < 40) return;   // ~25 次/秒封顶(减量)
            trail.lastSpawn = now;
            spawnPart(e.clientX, e.clientY, 1);
        }, { passive: true });
    }

    function spawnPart(x, y, spread, big) {
        if (!trail.ctx || trail.parts.length >= MAX_PARTS) return;
        var a = Math.random() * Math.PI * 2;
        var sp = (Math.random() * 0.6 + 0.2) * (spread || 1);
        trail.parts.push({
            x: x, y: y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 0.25,
            life: 1,
            decay: 0.018 + Math.random() * 0.02,
            r: big ? (2 + Math.random() * 3.5) : (0.7 + Math.random() * 1.3)
        });
    }

    // Konami / matrix 用的粒子爆发
    function burst(x, y, count, spread) {
        for (var i = 0; i < count; i++) spawnPart(x, y, spread || 6, true);
    }

    function stepTrail() {
        if (!trail.ctx) return;
        var ctx = trail.ctx;
        ctx.setTransform(trail.dpr, 0, 0, trail.dpr, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        if (!trail.parts.length) return;

        ctx.globalCompositeOperation = 'lighter';
        for (var i = trail.parts.length - 1; i >= 0; i--) {
            var p = trail.parts[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.012;                       // 微重力,星尘下沉
            p.life -= p.decay;
            if (p.life <= 0) { trail.parts.splice(i, 1); continue; }
            var al = p.life * 0.45;
            ctx.beginPath();
            ctx.fillStyle = 'rgba(' + accentRGB[0] + ',' + accentRGB[1] + ',' + accentRGB[2] + ',' + al.toFixed(3) + ')';
            ctx.shadowColor = 'rgba(' + accentRGB[0] + ',' + accentRGB[1] + ',' + accentRGB[2] + ',0.9)';
            ctx.shadowBlur = 6 * p.life;
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── 单一 rAF 主循环 ──
    if (!reduceMotion && !coarsePointer) {
        (function loop() {
            stepParallax();
            stepTrail();
            requestAnimationFrame(loop);
        })();
    }

    // ────────────────────────────────────────────
    // 6. 磁吸按钮(靠近被吸住,离开弹回)
    // ────────────────────────────────────────────
    if (!reduceMotion && !coarsePointer) {
        document.querySelectorAll('.nav-item, .hero-cta, .s-icon, .hero-quick-links button')
            .forEach(function (el) {
                el.classList.add('fx-magnetic');
                el.addEventListener('mousemove', function (e) {
                    var r = el.getBoundingClientRect();
                    var dx = e.clientX - (r.left + r.width / 2);
                    var dy = e.clientY - (r.top + r.height / 2);
                    el.style.transform = 'translate(' + (dx * 0.28).toFixed(1) + 'px,' + (dy * 0.28).toFixed(1) + 'px)';
                });
                el.addEventListener('mouseleave', function () {
                    el.style.transform = '';
                });
            });
    }

    // ────────────────────────────────────────────
    // 7. 卡片 3D 倾斜(项目卡 / 技能卡)
    // ────────────────────────────────────────────
    if (!reduceMotion && !coarsePointer) {
        document.querySelectorAll('.project-card, .skill-item').forEach(function (el) {
            el.classList.add('fx-tilt');
            el.addEventListener('mousemove', function (e) {
                var r = el.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                el.style.transform =
                    'perspective(700px) rotateX(' + (-py * 8).toFixed(2) + 'deg)' +
                    ' rotateY(' + (px * 8).toFixed(2) + 'deg) translateY(-3px)';
            });
            el.addEventListener('mouseleave', function () {
                el.style.transform = '';
            });
        });
    }

    // ────────────────────────────────────────────
    // 8. Konami 秘籍:↑↑↓↓←→←→ B A
    // ────────────────────────────────────────────
    (function initKonami() {
        var SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                   'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        var progress = 0;
        window.addEventListener('keydown', function (e) {
            if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
            var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            progress = (key === SEQ[progress]) ? progress + 1 : (key === SEQ[0] ? 1 : 0);
            if (progress < SEQ.length) return;
            progress = 0;
            // 触发:星光爆发 + 背景狂欢 + toast
            burst(window.innerWidth / 2, window.innerHeight / 2, 80, 9);
            document.body.classList.add('fx-party');
            setTimeout(function () { document.body.classList.remove('fx-party'); }, 3600);
            if (typeof window.showToast === 'function') {
                window.showToast('KONAMI! 奖励 +1000,星光为你爆发');
            }
        });
    })();

    // ────────────────────────────────────────────
    // 9. 终端彩蛋(按 ` 召唤)
    // ────────────────────────────────────────────
    (function initTerminal() {
        var term = null, out = null, input = null, body = null;
        var history = [], hIdx = -1;
        var busy = false;

        var COMMANDS = {
            help: function () {
                print('可用命令:', 'acc');
                print('  whoami      这个人是谁');
                print('  skills      技能矩阵速览');
                print('  projects    精选项目');
                print('  contact     联系方式');
                print('  train       现场训练一个智能体(别眨眼)');
                print('  konami      一个秘密');
                print('  matrix      进入矩阵(3 秒)');
                print('  sudo        试试就试试');
                print('  clear       清屏');
                print('  exit        关闭终端 (或按 ESC / `)');
            },
            whoami: function () {
                print('skystar —— 成都的一名 RL 方向 AI 工程师。', 'acc');
                print('日常:训练智能体打游戏,顺便把这个网站当试验田。');
                print('相信的事:奖励函数设计得好,智能体自己会找到出路。', 'dim');
            },
            skills: function () {
                print('Python / PyTorch / 强化学习 / JavaScript / HTML5 / CSS3 ...', 'acc');
                print('正在学: SAC · 多智能体 RL · LoRA 微调 · TypeScript', 'dim');
                print('完整版见「技能矩阵」面板。');
            },
            projects: function () {
                print('1. 智能博弈算法 —— 2025 腾讯开悟公开赛 · 全国第 9', 'acc');
                print('2. Flappy Bird AI —— Dueling DQN + PER,端到端部署在本站');
                print('3. 智能问答系统 —— 毕设,从零预训练中文对话模型');
                print('详情见「精选项目」面板。', 'dim');
            },
            contact: function () {
                print('GitHub: github.com/skystar01', 'acc');
                print('或者去「联系我」面板,点一下就能复制。');
            },
            konami: function () {
                print('上上下下左右左右,然后 B A。', 'acc');
                print('别问,问就是奖励 +1000。', 'dim');
            },
            sudo: function () {
                print('权限不足。这件事连梯度都救不了你。', 'err');
            },
            matrix: function () {
                print('欢迎来到矩阵。3 秒后返回现实...', 'acc');
                var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                var n = 0;
                var iv = setInterval(function () {
                    burst(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 6, 4);
                    if (++n >= 12) clearInterval(iv);
                }, 250);
            },
            clear: function () { body.innerHTML = ''; },
            exit: function () { close(); }
        };

        // train 单独实现:假的训练过程,loss 往下掉
        COMMANDS.train = function () {
            busy = true;
            print('初始化 Dueling DQN ... env=FlappyBird-v0', 'dim');
            var ep = 0, total = 8;
            var iv = setInterval(function () {
                ep++;
                var loss = (1.8 * Math.pow(0.62, ep) + Math.random() * 0.05).toFixed(4);
                var reward = Math.round(-120 + 340 * (1 - Math.pow(0.68, ep)) + Math.random() * 18);
                print('episode ' + ep + '/' + total + '  loss=' + loss + '  avg_reward=' + reward);
                if (ep >= total) {
                    clearInterval(iv);
                    print('训练完成 ✔ 策略已收敛(并没有,这只是个彩蛋)', 'acc');
                    print('想看真训练?去游戏区按 A 召唤 Flappy AI。', 'dim');
                    busy = false;
                }
            }, 380);
        };

        function build() {
            term = document.createElement('div');
            term.id = 'fxTerm';
            term.innerHTML =
                '<div class="fx-term-bar">' +
                '  <span class="fx-term-dot" style="background:#ff5f57"></span>' +
                '  <span class="fx-term-dot" style="background:#febc2e"></span>' +
                '  <span class="fx-term-dot" style="background:#28c840"></span>' +
                '  <i>skystar@site ~ zsh</i>' +
                '</div>' +
                '<div class="fx-term-body"></div>' +
                '<div class="fx-term-input-row">' +
                '  <span class="fx-prompt">➜ ~</span>' +
                '  <input type="text" autocomplete="off" spellcheck="false" aria-label="终端输入" />' +
                '</div>';
            document.body.appendChild(term);
            body = term.querySelector('.fx-term-body');
            input = term.querySelector('input');

            input.addEventListener('keydown', function (e) {
                e.stopPropagation();               // 别让游戏脚本抢按键
                if (e.key === 'Enter') {
                    var cmd = input.value.trim().toLowerCase();
                    input.value = '';
                    if (!cmd || busy) return;
                    history.push(cmd); hIdx = history.length;
                    print('➜ ~ ' + cmd, 'dim');
                    (COMMANDS[cmd] || function () {
                        print('zsh: command not found: ' + cmd + '  (试试 help)', 'err');
                    })();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (hIdx > 0) { hIdx--; input.value = history[hIdx]; }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (hIdx < history.length - 1) { hIdx++; input.value = history[hIdx]; }
                    else { hIdx = history.length; input.value = ''; }
                } else if (e.key === 'Escape') {
                    close();
                }
            });
            // 点击终端外不收起,避免误触;ESC / ` 关闭即可
        }

        function print(text, cls) {
            var div = document.createElement('div');
            div.className = 'fx-line' + (cls ? ' ' + cls : '');
            div.textContent = text;
            body.appendChild(div);
            body.scrollTop = body.scrollHeight;
        }

        function open() {
            if (!term) {
                build();
                print('SKY STAR 终端 v1.0 —— 输入 help 查看命令', 'acc');
                print('提示:这里的一切都是彩蛋,除了简历部分。', 'dim');
            }
            term.classList.add('open');
            setTimeout(function () { input.focus(); }, 120);
        }
        function close() {
            if (term) term.classList.remove('open');
        }

        window.addEventListener('keydown', function (e) {
            if (e.key !== '`' && e.key !== '~') return;
            if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target !== input) return;
            e.preventDefault();
            if (term && term.classList.contains('open')) close(); else open();
        });
    })();

})();

// ---------- journey.js ----------
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

        // 到站判定只看 target,不看过渡中的 camZ —— 飞行途中绝不让相邻站漏出来
        var settling = Math.abs(targetZ - camZ) < 24;
        var targetName = null;
        STATIONS.forEach(function (name) {
            if (panels[name] && Math.abs(panels[name].z - targetZ) < 1) targetName = name;
        });

        STATIONS.forEach(function (name) {
            var p = panels[name];
            if (!p) return;
            var tz = camZ - p.z;           // 0=到站; 负=前方深处; 正=已越过
            var isTarget = name === targetName;

            // 停靠/接近到站:只亮目标站,其余一律硬隐藏(消除半透明叠影)
            if (settling || Math.abs(tz) < 80) {
                if (isTarget && Math.abs(tz) < 80) {
                    p.el.style.transform = 'translate(-50%,-50%) translateZ(0px)';
                    p.el.style.opacity = '1';
                    p.el.style.visibility = 'visible';
                    p.el.style.filter = '';
                } else {
                    p.el.style.opacity = '0';
                    p.el.style.visibility = 'hidden';
                    p.el.style.filter = '';
                    p.el.style.pointerEvents = 'none';
                }
                var docked = isTarget && Math.abs(tz) < 60;
                p.el.classList.toggle('dock', docked);
                return;
            }

            var op;
            if (tz < FADE_FAR || tz > GONE)      op = 0;
            else if (tz >= PASS_OUT)             op = 1 - (tz - PASS_OUT) / (GONE - PASS_OUT);
            else if (tz >= FADE_IN)              op = 1;
            else                                 op = (tz - FADE_FAR) / (FADE_IN - FADE_FAR);

            // 飞行中更狠地收掉非目标站,避免半透明残影叠在游戏画布上
            if (!isTarget) op *= 0.55;

            var visible = op > 0.02;

            var blur = 0;
            if (tz < FADE_IN) blur = Math.min(4, (FADE_IN - tz) / 300);
            else if (tz > 60) blur = Math.min(4, (tz - 60) / 100);

            p.el.style.transform = 'translate(-50%,-50%) translateZ(' + tz.toFixed(1) + 'px)';
            p.el.style.opacity = op.toFixed(3);
            p.el.style.visibility = visible ? 'visible' : 'hidden';
            p.el.style.filter = blur > 0.2 ? 'saturate(1.05) blur(' + blur.toFixed(1) + 'px)' : '';
            p.el.classList.toggle('dock', false);
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

    // 游戏/关于等长内容站有自带说明或时间线,jhint 会叠字:只在首页展示
    function syncHintForPanel(name) {
        if (!hint || hintGone) return;
        var show = (name === 'home');
        hint.style.opacity = show ? '' : '0';
        hint.style.visibility = show ? '' : 'hidden';
    }
    var _origSwitchForHint = window.switchPanel;
    if (typeof _origSwitchForHint === 'function') {
        window.switchPanel = function (t) {
            _origSwitchForHint(t);
            syncHintForPanel(t);
        };
    }
    syncHintForPanel(current);

    // ────────────────────────────────────────────
    // 6. 大门开场
    // localStorage 记 30 天:回访不必每次进门;首访/久未访问仍保留仪式感
    // ────────────────────────────────────────────
    var GATE_KEY = 'skystar:v1:gate:seenAt';
    var GATE_TTL = 30 * 24 * 60 * 60 * 1000;
    var seen = false;
    try {
        var ts = parseInt(localStorage.getItem(GATE_KEY) || '0', 10);
        seen = ts > 0 && (Date.now() - ts) < GATE_TTL;
    } catch (e) { /* 隐私模式静默 */ }

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
                try { localStorage.setItem(GATE_KEY, String(Date.now())); } catch (e) { /* 静默 */ }
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

// ---------- game-shell.js ----------
// ─── GAME TAB CAROUSEL + CANVAS 适配 ───
// 无限轮播: 自动复制多组 tab + 中间组归位; 切换时按游戏类型分别 fit canvas
// 依赖外部游戏脚本提供的接口:
//   window.snakeGame.fitSnake() / window.fitGomoku(container) / window.fitMemory(container) / window.startPlaneGame() / window.mazeGame.fitMaze()

(function() {
    const tabsSidebar = document.querySelector('.tabs-sidebar');
    const tabsTrack   = document.querySelector('.tabs-track');
    const realTabs    = tabsTrack ? Array.from(tabsTrack.querySelectorAll('.game-tab')) : [];
    const N           = realTabs.length;
    const GAMES       = realTabs.map(t => t.dataset.game);
    const gameTabFor  = (game) => realTabs.find(t => t.dataset.game === game);

    let allTrackTabs  = realTabs.slice();
    let trackOffset   = 0;
    let targetOffset  = 0;
    let targetIndex   = 0;
    let sideGroupCount = 2;
    let middleGroupIndex = 2;
    let totalGroupCount = 5;

    const MOBILE_BREAKPOINT = 900;
    function isMobile() { return window.innerWidth <= MOBILE_BREAKPOINT; }

    function resetTabVisual(tab) {
        tab.classList.remove('active', 'is-center');
        tab.style.removeProperty('--v');
        tab.style.removeProperty('--s');
    }

    function makeClone(realTab) {
        const btn = realTab.cloneNode(true);
        resetTabVisual(btn);
        btn.dataset.clone = 'true';
        btn.dataset.game = realTab.dataset.game;
        return btn;
    }

    function getTrackGap() {
        if (!tabsTrack) return 0;
        const style = getComputedStyle(tabsTrack);
        return parseFloat(style.rowGap || style.gap) || 0;
    }

    function estimateCycleHeight() {
        if (!realTabs.length) return 0;
        const itemH = realTabs[0].offsetHeight || 50;
        return N * (itemH + getTrackGap());
    }

    function middleStartIndex() {
        return middleGroupIndex * N;
    }

    function positiveMod(num, mod) {
        return ((num % mod) + mod) % mod;
    }

    function buildInfiniteTrack() {
        if (!tabsTrack || !realTabs.length) return;

        // 移动端: 不需要无限轮播,直接放一组真实 tab,用 CSS 横向滚动
        if (isMobile()) {
            tabsTrack.textContent = '';
            realTabs.forEach(tab => {
                resetTabVisual(tab);
                tab.removeAttribute('data-clone');
                tabsTrack.appendChild(tab);
            });
            allTrackTabs = realTabs.slice();
            trackOffset = 0;
            targetOffset = 0;
            targetIndex = 0;
            if (tabsTrack) tabsTrack.style.transform = '';
            return;
        }

        const cycleH = estimateCycleHeight();
        sideGroupCount = cycleH > 0 ? Math.max(2, Math.ceil(tabsSidebar.clientHeight / cycleH) + 1) : 2;
        middleGroupIndex = sideGroupCount;
        totalGroupCount = sideGroupCount * 2 + 1;

        tabsTrack.textContent = '';
        for (let group = 0; group < totalGroupCount; group++) {
            realTabs.forEach(tab => {
                const node = group === middleGroupIndex ? tab : makeClone(tab);
                resetTabVisual(node);
                if (group === middleGroupIndex) node.removeAttribute('data-clone');
                tabsTrack.appendChild(node);
            });
        }

        allTrackTabs = Array.from(tabsTrack.querySelectorAll('.game-tab'));
        targetIndex = middleStartIndex();
    }

    // 计算容器内除目标元素外，其他非绝对定位子元素占用的总高度
    function calcOtherHeight(container, exclude) {
        let h = 0;
        Array.from(container.children).forEach(el => {
            if (!el || el === exclude) return;
            const style = getComputedStyle(el);
            if (style.display === 'none') return;
            if (style.position === 'absolute' || style.position === 'fixed') return;
            h += el.offsetHeight;
            h += (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
        });
        return h;
    }

    // 通用 canvas 适配：在可用空间内按原始宽高比缩放，不超过原始尺寸
    function fitCanvasToContainer(canvas, container, opts) {
        opts = opts || {};
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const otherH = calcOtherHeight(container, canvas);
        const availH = ch - otherH;
        if (cw <= 0 || availH <= 0) return;

        const aspect = canvas.width / canvas.height;
        let w = cw;
        let h = w / aspect;
        if (h > availH) { h = availH; w = h * aspect; }

        // 不放大超过原始尺寸，避免模糊
        if (w > canvas.width) { w = canvas.width; h = w / aspect; }
        if (h > canvas.height) { h = canvas.height; w = h * aspect; }

        // 可选最大宽度限制
        if (opts.maxWidth && w > opts.maxWidth) { w = opts.maxWidth; h = w / aspect; }

        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';
    }

    function fit2048(container) {
        const grid = container.querySelector('.game2048-grid-container');
        if (!grid) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const otherH = calcOtherHeight(container, grid);
        const size = Math.max(240, Math.min(cw, ch - otherH, 540));
        grid.style.maxWidth = size + 'px';
        // 同步调整数字大小，避免格子大了数字太小
        const cells = grid.querySelectorAll('.cell-2048');
        const fontRem = Math.max(0.9, Math.min(1.8, size / 300));
        cells.forEach(cell => { cell.style.fontSize = fontRem + 'rem'; });
    }

    function fitTicTacToe(container) {
        const board = container.querySelector('.tic-tac-toe-board');
        if (!board) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const otherH = calcOtherHeight(container, board);
        const size = Math.max(240, Math.min(cw, ch - otherH, 540));
        board.style.maxWidth = size + 'px';
        // 同步调整棋子大小
        const cells = board.querySelectorAll('.tic-tac-toe-cell');
        const fontRem = Math.max(1.4, Math.min(2.8, size / 200));
        cells.forEach(cell => { cell.style.fontSize = fontRem + 'rem'; });
    }

    function fitTetris(container) {
        const canvas = document.getElementById('tetrisCanvas');
        if (!canvas) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        // 横向布局，主 canvas 高度尽量撑满，宽度不超过容器的 48%
        const availH = ch - 20;
        const aspect = canvas.width / canvas.height;
        let h = availH;
        let w = h * aspect;
        const maxW = cw * 0.48;
        if (w > maxW) { w = maxW; h = w / aspect; }
        // 限制最大放大倍数
        const maxScale = 2.2;
        if (h > canvas.height * maxScale) { h = canvas.height * maxScale; w = h * aspect; }
        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';

        // 让两侧卡片面板与画布同高，并允许内容超出时滚动
        const sidePanel = container.querySelector('.tetris-side-panel');
        const infoPanel = container.querySelector('.tetris-info-panel');
        const panelH = Math.floor(h) + 'px';
        if (sidePanel) { sidePanel.style.height = panelH; sidePanel.style.overflowY = 'auto'; }
        if (infoPanel) { infoPanel.style.height = panelH; infoPanel.style.overflowY = 'auto'; }
    }

    function fitPlane(container) {
        const canvas = document.getElementById('planeCanvas');
        if (!canvas) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const hud = container.querySelector('.plane-hud');
        const hudH = hud ? hud.offsetHeight + (parseFloat(getComputedStyle(hud).marginTop) || 0) + (parseFloat(getComputedStyle(hud).marginBottom) || 0) : 0;
        const availH = ch - hudH;
        if (cw <= 0 || availH <= 0) return;

        const aspect = canvas.width / canvas.height;
        let w = Math.min(cw, 1000);
        let h = w / aspect;
        if (h > availH) { h = availH; w = h * aspect; }
        if (w > canvas.width) { w = canvas.width; h = w / aspect; }

        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';
    }

    // 弹幕幸存者: canvas 适配容器（保留宽高比，不放大超过原始尺寸）
    function fitSurvivor(container) {
        const canvas = document.getElementById('survivorCanvas');
        if (!canvas) return;
        const cs = getComputedStyle(container);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const cw = container.clientWidth - padX;
        const ch = container.clientHeight - padY;
        const hud = container.querySelector('.survivor-hud');
        const weaponBar = container.querySelector('.surv-weapon-bar');
        const instructions = container.querySelector('.surv-instructions');
        let extraH = 0;
        [hud, weaponBar, instructions].forEach(el => {
            if (el) {
                const s = getComputedStyle(el);
                extraH += el.offsetHeight + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0);
            }
        });
        const availH = ch - extraH;
        if (cw <= 0 || availH <= 0) return;

        const aspect = canvas.width / canvas.height;
        let w = Math.min(cw, 900);
        let h = w / aspect;
        if (h > availH) { h = availH; w = h * aspect; }
        if (w > canvas.width) { w = canvas.width; h = w / aspect; }

        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';
    }

    // 按游戏类型分别适配固定容器
    function fitGame(gameName, container) {
        if (!container) return;
        requestAnimationFrame(() => {
            switch (gameName) {
                case 'snake':
                    if (window.snakeGame && window.snakeGame.fitSnake) window.snakeGame.fitSnake();
                    break;
                case '2048':
                    fit2048(container);
                    break;
                case 'tetris':
                    fitTetris(container);
                    break;
                case 'tic-tac-toe':
                    fitTicTacToe(container);
                    break;
                case 'gomoku':
                    if (window.fitGomoku) window.fitGomoku(container);
                    break;
                case 'memory':
                    if (window.fitMemory) window.fitMemory(container);
                    break;
                case 'plane':
                    fitPlane(container);
                    break;
                case 'maze':
                    if (window.mazeGame && window.mazeGame.fitMaze) window.mazeGame.fitMaze();
                    break;
                case 'survivor':
                    fitSurvivor(container);
                    break;
                case 'flappy':
                default: {
                    const canvas = container.querySelector('canvas');
                    if (canvas) fitCanvasToContainer(canvas, container);
                    break;
                }
            }
        });
    }

    // 切换 active (active 只落在中间真实 tab 上；副本只负责视觉和点击)

    // 阶段2: 游戏包懒加载 —— 首次切到任意非飞机游戏时才下载(~302KB), 首屏不携带
    let gamesBundlePromise = null;
    function ensureGamesBundle() {
        if (gamesBundlePromise) return gamesBundlePromise;
        gamesBundlePromise = import('./games-bundle.js')
            .catch((e) => { gamesBundlePromise = null; console.error('[game-shell] 游戏包加载失败', e); });
        return gamesBundlePromise;
    }

    // 按需动态导入 game-plane.js (135KB,只有切到飞机游戏才下载) —— 阶段1模块化后改为 ES Module 动态 import
    let planeScriptPromise = null;
    function ensurePlaneScript() {
        if (window.startPlaneGame) return Promise.resolve();
        if (planeScriptPromise) return planeScriptPromise;
        planeScriptPromise = import('./game-plane.js')
            .then(() => {})
            .catch((e) => { planeScriptPromise = null; console.error('[game-shell] 飞机游戏模块加载失败', e); });
        return planeScriptPromise;
    }

    // ─── 游戏生命周期管理 ───
    // 有 RAF/setTimeout 循环的游戏注册后, tab 切换时自动暂停/恢复, 避免后台空转
    const gameRegistry = {};
    window.registerGame = function(name, api) {
        gameRegistry[name] = api;
    };
    function pauseAllGames() {
        for (const name in gameRegistry) {
            const g = gameRegistry[name];
            if (g && typeof g.pause === 'function') g.pause();
        }
    }
    function resumeGame(name) {
        const g = gameRegistry[name];
        if (g && typeof g.resume === 'function') g.resume();
    }

    async function setActiveByGame(gameName, opts) {
        const force = opts && opts.force;
        let changed = force;
        realTabs.forEach(t => {
            const want = t.dataset.game === gameName;
            const has  = t.classList.contains('active');
            if (want && !has) { t.classList.add('active'); changed = true; }
            else if (!want && has) { t.classList.remove('active'); changed = true; }
        });
        if (!changed) return;

        // 阶段2: 懒加载游戏代码, 首屏不下载(~302KB); 仅在真正切换时才触发
        if (gameName === 'plane') {
            await ensurePlaneScript();
        } else {
            await ensureGamesBundle();
        }

        // 切换前暂停所有游戏 (停止后台 RAF/setTimeout 循环)
        pauseAllGames();

        document.querySelectorAll('.game-container').forEach(gc => gc.classList.remove('active'));
        const targetGc = document.querySelector(`.game-container.game-${gameName}`);
        if (targetGc) {
            targetGc.classList.add('active');
            fitGame(gameName, targetGc);
        }
        // 切换后恢复目标游戏 (重启渲染循环)
        resumeGame(gameName);

        if (gameName === 'plane' && window.startPlaneGame) {
            window.startPlaneGame();
        }
    }

    function switchTo(gameName) {
        setActiveByGame(gameName);
    }

    function getOffsetForIndex(index) {
        const tab = allTrackTabs[index];
        if (!tab || !tabsSidebar) return targetOffset;
        const tabCenterY = tab.offsetTop + tab.offsetHeight / 2;
        return tabsSidebar.clientHeight / 2 - tabCenterY;
    }

    function setTargetIndex(index) {
        if (!allTrackTabs.length) return;
        targetIndex = Math.max(0, Math.min(index, allTrackTabs.length - 1));
        targetOffset = getOffsetForIndex(targetIndex);
    }

    function jumpToEquivalentIndex(newIndex) {
        if (!allTrackTabs[targetIndex] || !allTrackTabs[newIndex]) return;
        const oldOffset = getOffsetForIndex(targetIndex);
        const newOffset = getOffsetForIndex(newIndex);
        const delta = newOffset - oldOffset;
        targetIndex = newIndex;
        targetOffset = newOffset;
        trackOffset += delta;
        applyTransform();
    }

    // 到副本区后，瞬间归位到中间组的同名 tab；内容一样，所以视觉上无感
    function normalizeTargetToMiddle() {
        if (!N) return false;
        const middleStart = middleStartIndex();
        const middleEnd = middleStart + N;
        if (targetIndex >= middleStart && targetIndex < middleEnd) return false;

        const normalizedIndex = middleStart + positiveMod(targetIndex, N);
        jumpToEquivalentIndex(normalizedIndex);
        return true;
    }

    function moveBy(step) {
        if (!N || !allTrackTabs.length || step === 0) return;

        const safeMin = N;
        const safeMax = (totalGroupCount - 1) * N - 1;
        if (targetIndex + step < safeMin || targetIndex + step > safeMax) {
            normalizeTargetToMiddle();
        }

        setTargetIndex(targetIndex + step);
    }

    // 检测 viewport 中心最近的 tab → 加 .is-center 高亮 + 切游戏 + 物理距离 fade
    function detectCenterTab() {
        if (isMobile() || !tabsSidebar.clientHeight) return;
        const viewportCenterY = -trackOffset + tabsSidebar.clientHeight / 2;
        const maxDist = tabsSidebar.clientHeight / 2;
        let bestIdx = -1, minDist = Infinity;

        allTrackTabs.forEach((tab, i) => {
            const tabCenterY = tab.offsetTop + tab.offsetHeight / 2;
            const d = Math.abs(tabCenterY - viewportCenterY);
            const t = Math.min(d / maxDist, 1);
            tab.style.setProperty('--v', (1 - t * 0.55).toFixed(3));
            tab.style.setProperty('--s', (1 - t * 0.08).toFixed(3));
            if (d < minDist) { minDist = d; bestIdx = i; }
        });

        if (bestIdx < 0) return;
        const best = allTrackTabs[bestIdx];
        allTrackTabs.forEach(t => t.classList.remove('is-center'));
        best.classList.add('is-center');
        best.style.setProperty('--v', '1');
        best.style.setProperty('--s', '1');

        const activeRealTab = gameTabFor(best.dataset.game);
        if (!activeRealTab || !activeRealTab.classList.contains('active')) {
            switchTo(best.dataset.game);
        }
    }

    function applyTransform() {
        if (isMobile() || !tabsTrack) return;
        tabsTrack.style.transform = `translateY(${trackOffset}px)`;
    }

    // rAF loop: 平滑追赶目标；停稳在副本区时归位到中间组
    function rafLoop() {
        if (isMobile() || !realTabs.length) return;
        const diff = targetOffset - trackOffset;
        if (Math.abs(diff) > 0.1) {
            trackOffset += diff * 0.28;
            applyTransform();
            detectCenterTab();
        } else {
            if (trackOffset !== targetOffset) {
                trackOffset = targetOffset;
                applyTransform();
            }
            if (normalizeTargetToMiddle()) detectCenterTab();
        }
        requestAnimationFrame(rafLoop);
    }

    if (tabsSidebar && tabsTrack && realTabs.length) {
        tabsSidebar.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY > 0)      moveBy(1);
            else if (e.deltaY < 0) moveBy(-1);
        }, { passive: false });

        let touchStartY = 0;
        tabsSidebar.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        tabsSidebar.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        tabsSidebar.addEventListener('touchend', (e) => {
            const endY = e.changedTouches[0].clientY;
            const dy = endY - touchStartY;
            if (Math.abs(dy) < 28) return;
            moveBy(dy < 0 ? 1 : -1);
        }, { passive: true });

        // 委托 click: 点到哪一个可见 tab，就平滑滚到哪一个；副本同样有效
        tabsTrack.addEventListener('click', (e) => {
            const btn = e.target.closest('.game-tab');
            if (!btn) return;
            e.preventDefault();

            const clickedIndex = allTrackTabs.indexOf(btn);
            switchTo(btn.dataset.game);
            if (clickedIndex >= 0) {
                setTargetIndex(clickedIndex);
            } else {
                const gameIndex = GAMES.indexOf(btn.dataset.game);
                if (gameIndex >= 0) setTargetIndex(middleStartIndex() + gameIndex);
            }
        });

        requestAnimationFrame(() => {
            buildInfiniteTrack();
            const initialGame = GAMES[0];
            if (!isMobile()) {
                setTargetIndex(middleStartIndex());
                trackOffset = targetOffset;
                applyTransform();
            }
            setActiveByGame(initialGame, { force: true });
            detectCenterTab();
            if (!isMobile()) requestAnimationFrame(rafLoop);
        });
    }

    // 窗口大小变化时，重新适配当前激活的游戏
    let resizeTimeout;
    let lastMobile = isMobile();
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const nowMobile = isMobile();
            if (nowMobile !== lastMobile) {
                // 跨越桌面/移动端断点: tab 轨道结构完全不同,刷新最稳妥
                lastMobile = nowMobile;
                location.reload();
                return;
            }
            const activeTab = document.querySelector('.game-tab.active');
            const activeContainer = document.querySelector('.game-container.active');
            if (activeTab && activeContainer) {
                fitGame(activeTab.dataset.game, activeContainer);
            }
        }, 120);
    });

    // game container 默认激活第一个 tab 对应游戏
    const defaultGame = GAMES[0] || 'snake';
    const defaultContainer = document.querySelector(`.game-container.game-${defaultGame}`);
    if (defaultContainer && !defaultContainer.classList.contains('active')) {
        defaultContainer.classList.add('active');
    }
})();

// ---------- news.js ----------
// ─── 每日资讯模块 ───
// 数据来源优先级:
//   1. window.NEWS_DATA (news-data.js 注入, 离线可用)
//   2. localStorage 缓存
//   3. 用户手动点"刷新"按钮 POST /api/news/fetch 触发后端抓取
// 后端默认地址 http://localhost:8000, 见 news_server.py
(function() {
    const STORAGE_KEY = 'skystar:v1:news:data';
    const LEGACY_KEY = 'skystar_news_data';
    const BACKEND_URL = 'http://localhost:8000';

    const refreshBtn = document.getElementById('news-refresh-btn');
    const updatedAtEl = document.getElementById('news-updated-at');
    const loadingEl = document.getElementById('news-loading');
    const loadingText = document.getElementById('news-loading-text');
    const emptyEl = document.getElementById('news-empty');
    const errorEl = document.getElementById('news-error');
    const errorText = document.getElementById('news-error-text');
    const contentEl = document.getElementById('news-content');
    const listEl = document.getElementById('news-list');
    const footEl = document.getElementById('news-foot');
    const filterBtns = document.querySelectorAll('#news-filters .news-filter');

    let currentData = null;
    let currentFilter = 'all';
    let currentKeyword = '';

    function showState(state) {
        loadingEl.classList.add('hidden');
        emptyEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        contentEl.classList.add('hidden');
        if (state === 'loading') loadingEl.classList.remove('hidden');
        else if (state === 'empty') emptyEl.classList.remove('hidden');
        else if (state === 'error') errorEl.classList.remove('hidden');
        else if (state === 'content') contentEl.classList.remove('hidden');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function categoryColor(cat) {
        return {
            'AI 论文': '#7c6ef5',
            '开源动态': '#4ecdc4',
            '中文 AI': '#ff6b9d',
            '业界新闻': '#ffa94d'
        }[cat] || '#94a3b8';
    }

    // 标准化分类字符串:去空格、全/半角统一、小写,用于宽松匹配
    function normalizeCategory(cat) {
        if (!cat) return '';
        return String(cat)
            .replace(/[\s\u3000]+/g, '')  // 去所有空白(含全角空格)
            .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))  // 全角→半角
            .toLowerCase();
    }

    // 把 LLM 输出的不规范 category 映射到标准 4 分类
    const CATEGORY_ALIASES = {
        'ai论文': 'AI 论文',
        'ai 论文': 'AI 论文',
        'ai论': 'AI 论文',
        '论文': 'AI 论文',
        'paper': 'AI 论文',
        '开源动态': '开源动态',
        '开源': '开源动态',
        'github': '开源动态',
        'open source': '开源动态',
        '中文ai': '中文 AI',
        '中文 ai': '中文 AI',
        'chinese ai': '中文 AI',
        '中文': '中文 AI',
        '业界新闻': '业界新闻',
        '业界': '业界新闻',
        '行业': '业界新闻',
        'news': '业界新闻'
    };

    function resolveCategory(rawCat) {
        const norm = normalizeCategory(rawCat);
        if (CATEGORY_ALIASES[norm]) return CATEGORY_ALIASES[norm];
        return rawCat;  // 未知分类原样返回
    }

    function renderNews(data) {
        currentData = data;
        const items = (data && data.items) || [];

        if (data && data.generated_at) {
            try {
                const d = new Date(data.generated_at);
                updatedAtEl.textContent = '最后更新:' + d.toLocaleString('zh-CN', { hour12: false });
            } catch (e) {
                updatedAtEl.textContent = '最后更新:' + (data.date || '');
            }
            if (data._snapshot) {
                updatedAtEl.textContent += ' · 本地快照';
            }
        } else {
            updatedAtEl.textContent = '尚未更新';
        }

        if (items.length === 0) {
            listEl.innerHTML = '<p class="news-no-items">今日无资讯</p>';
            footEl.textContent = '';
            showState('content');
            return;
        }

        const filtered = items.filter(it => {
            const catOk = currentFilter === 'all' || resolveCategory(it.category) === currentFilter;
            if (!catOk) return false;
            if (!currentKeyword) return true;
            const t = (it.title || '').toLowerCase();
            const s = (it.summary || '').toLowerCase();
            return t.includes(currentKeyword) || s.includes(currentKeyword);
        });

        if (filtered.length === 0) {
            let msg = '暂无资讯';
            if (currentKeyword && currentFilter !== 'all') {
                msg = `分类「${currentFilter}」下没匹配「${currentKeyword}」的资讯`;
            } else if (currentKeyword) {
                msg = `没匹配「${currentKeyword}」的资讯`;
            } else if (currentFilter !== 'all') {
                msg = '该分类下暂无资讯';
            }
            listEl.innerHTML = `<p class="news-no-items">${escapeHtml(msg)}</p>`;
        } else {
            listEl.innerHTML = filtered.map((it, idx) => {
                const resolved = resolveCategory(it.category);
                const color = categoryColor(resolved);
                const preview = (it.summary || '').slice(0, 80).replace(/\s+\S*$/, '') + ((it.summary || '').length > 80 ? '…' : '');
                return `
                <div class="news-item" data-idx="${idx}" tabindex="0" role="button" aria-label="查看完整内容">
                    <div class="news-item-meta">
                        <span class="news-cat-tag" style="background:${color}22;color:${color};border-color:${color}55">${escapeHtml(resolved || '其他')}</span>
                        <span class="news-source"><i class="fas fa-circle-dot"></i> ${escapeHtml(it.source || '')}</span>
                        <span class="news-time">${escapeHtml(it.published_at || '')}</span>
                    </div>
                    <h3 class="news-item-title">${escapeHtml(it.title)}</h3>
                    <p class="news-item-summary">${escapeHtml(preview)}</p>
                    <span class="news-item-more">点击查看完整内容 <i class="fas fa-arrow-right"></i></span>
                </div>`;
            }).join('');
        }

        const srcs = (data.sources || []).join(' · ');
        let foot = `共 ${items.length} 条 · 来源:${srcs || '—'}`;
        if (filtered.length !== items.length) {
            foot += ` · 当前显示 ${filtered.length} 条`;
        }
        if (currentKeyword) {
            foot += ` · 搜索「${currentKeyword}」`;
        }
        if (data._snapshot) {
            foot += ' · 当前为本地快照，实时抓取需启动本地后端';
        }
        footEl.textContent = foot;

        showState('content');
    }

    function loadFromFile() {
        if (window.NEWS_DATA && window.NEWS_DATA.items && window.NEWS_DATA.items.length > 0) {
            renderNews(Object.assign({}, window.NEWS_DATA, { _snapshot: true }));
            return true;
        }
        return false;
    }

    function loadFromLocalStorage() {
        SkyStorage.migrate(LEGACY_KEY, STORAGE_KEY);
        const data = SkyStorage.getJSON(STORAGE_KEY, null);
        if (data && data.items) {
            renderNews(Object.assign({}, data, { _snapshot: true }));
            return true;
        }
        return false;
    }

    function restoreSnapshotOrEmpty(errMsg) {
        // 刷新失败时优先回退快照，避免整页错误态吓到访客
        if (window.NEWS_DATA && window.NEWS_DATA.items && window.NEWS_DATA.items.length > 0) {
            renderNews(Object.assign({}, window.NEWS_DATA, { _snapshot: true }));
            if (typeof window.showToast === 'function') {
                window.showToast('实时刷新不可用，已展示本地快照');
            }
            return;
        }
        const cached = SkyStorage.getJSON(STORAGE_KEY, null);
        if (cached && cached.items && cached.items.length) {
            renderNews(Object.assign({}, cached, { _snapshot: true }));
            if (typeof window.showToast === 'function') {
                window.showToast('实时刷新不可用，已展示本地缓存');
            }
            return;
        }
        if (errMsg) errorText.textContent = errMsg;
        showState('error');
    }

    function saveToLocalStorage(data) {
        SkyStorage.setJSON(STORAGE_KEY, data);
    }

    async function fetchNews() {
        refreshBtn.disabled = true;
        loadingText.textContent = '抓取资讯中(可能需要 20-40 秒)...';
        showState('loading');

        try {
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), 180000);
            const r = await fetch(BACKEND_URL + '/api/news/fetch', {
                method: 'POST',
                signal: ctrl.signal
            });
            clearTimeout(timeoutId);
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.detail || ('HTTP ' + r.status));
            }
            const data = await r.json();
            saveToLocalStorage(data);
            window.NEWS_DATA = data;
            renderNews(data);
        } catch (e) {
            console.error('Fetch failed', e);
            let msg;
            if (e.name === 'AbortError') {
                msg = '请求超时(超过 3 分钟),请检查后端';
            } else if (e.message && e.message.includes('Failed to fetch')) {
                msg = '后端未启动。静态站可继续浏览本地快照；本地开发请双击 start-news.bat';
            } else {
                msg = '刷新失败:' + e.message;
            }
            restoreSnapshotOrEmpty(msg);
        } finally {
            refreshBtn.disabled = false;
        }
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.cat;
            if (currentData) renderNews(currentData);
        });
    });

    // ── 搜索框 ──
    const searchInput = document.getElementById('news-search');
    const searchClear = document.getElementById('news-search-clear');
    const searchWrap = searchInput.closest('.news-search-wrap');

    function setKeyword(kw) {
        currentKeyword = kw.trim().toLowerCase();
        searchWrap.classList.toggle('has-text', !!currentKeyword);
        if (currentData) renderNews(currentData);
    }

    searchInput.addEventListener('input', (e) => setKeyword(e.target.value));
    // 中文输入防抖(中文输入法每个拼音都会触发 input,等 200ms 没新输入再过滤)
    let searchDebounce = null;
    searchInput.addEventListener('compositionstart', () => {
        if (searchDebounce) { clearTimeout(searchDebounce); searchDebounce = null; }
    });
    searchInput.addEventListener('compositionend', (e) => {
        searchDebounce = setTimeout(() => setKeyword(e.target.value), 0);
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        setKeyword('');
        searchInput.focus();
    });

    refreshBtn.addEventListener('click', fetchNews);

    // ── 资讯详情弹窗 ──
    const modal = document.getElementById('news-modal');
    const modalBackdrop = modal.querySelector('.news-modal-backdrop');
    const modalCloseBtn = modal.querySelector('.news-modal-close');
    const modalMeta = document.getElementById('news-modal-meta');
    const modalTitle = document.getElementById('news-modal-title');
    const modalSummary = document.getElementById('news-modal-summary');
    const modalLink = document.getElementById('news-modal-link');

    function openNewsModal(idx) {
        if (!currentData) return;
        // 找到对应 item(注意 idx 是 filtered 数组的下标,不是原始 items 的下标)
        const items = (currentData && currentData.items) || [];
        const filtered = currentFilter === 'all'
            ? items
            : items.filter(it => resolveCategory(it.category) === currentFilter);
        const it = filtered[idx];
        if (!it) return;

        const resolved = resolveCategory(it.category);
        const color = categoryColor(resolved);
        modalMeta.innerHTML = `
            <span class="news-cat-tag" style="background:${color}22;color:${color};border-color:${color}55">${escapeHtml(resolved || '其他')}</span>
            <span class="news-source"><i class="fas fa-circle-dot"></i> ${escapeHtml(it.source || '')}</span>
            <span class="news-time">${escapeHtml(it.published_at || '')}</span>
        `;
        modalTitle.textContent = it.title || '';
        // 把 summary 里的 \n 转成 <br>,保留段落感
        modalSummary.innerHTML = escapeHtml(it.summary || '').replace(/\n/g, '<br>');
        modalLink.href = it.url || '#';

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        // focus trap: 转移焦点 + Tab 循环 + 关闭还原
        if (window.activateFocusTrap) window.activateFocusTrap(modal);
    }

    function closeNewsModal() {
        if (window.deactivateFocusTrap) window.deactivateFocusTrap();
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    // 事件绑定
    listEl.addEventListener('click', (e) => {
        // 点 "查看原文" 链接不触发弹窗(由链接自己处理,虽然现在卡片里没这链接)
        const card = e.target.closest('.news-item');
        if (!card) return;
        const idx = parseInt(card.dataset.idx, 10);
        if (!isNaN(idx)) openNewsModal(idx);
    });
    // 键盘 Enter / Space 也触发
    listEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.news-item');
        if (!card) return;
        e.preventDefault();
        const idx = parseInt(card.dataset.idx, 10);
        if (!isNaN(idx)) openNewsModal(idx);
    });
    // 关闭:点 X / 点背景 / 按 ESC
    modalCloseBtn.addEventListener('click', closeNewsModal);
    modalBackdrop.addEventListener('click', closeNewsModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeNewsModal();
        }
    });

    if (!loadFromFile()) {
        if (!loadFromLocalStorage()) {
            showState('empty');
        }
    }
})();


// ─────────────────────────────────────────────
// 阶段2: 以下游戏逻辑已整体移至 src/games-bundle.js,
// 由 game-shell.ensureGamesBundle() 首次切到游戏时动态 import 懒加载,
// 首屏不再下载 ~302KB 游戏代码。
// ─────────────────────────────────────────────
