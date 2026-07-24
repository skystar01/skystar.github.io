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

// ─── CONTACT COPY ───
document.querySelectorAll('.contact-item').forEach(item => {
    const txt = item.querySelector('p').textContent;
    if (txt.includes('+86') || txt === 'tjqflydream') {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            navigator.clipboard.writeText(txt).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = txt;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
            showToast('已复制到剪贴板');
        });
    }
});

// ─── PROJECT DATA ───
const projectData = {
    '智能博弈算法': {
        icon:'icon-chess',
        description:'2025 腾讯开悟人工智能全球公开赛（智能体决策算法-中级赛道）参赛项目。我作为星之队（成都师范学院）成员，与队友合作基于 DQN / Target DQN / PPO 修改奖励设计、特征处理和超参数调整，两个月时间训练出强化学习智能体。\n\n初赛（自动寻路+道具收集智能体）：川渝地区二等奖（全国总榜第 4 名）\n复赛（智能体对战）：全国第 9 名\n\n证书编号：202501020009（2025 年 12 月颁发）',
        progress:95,
        techStack:'RL,DQN,PPO,PyTorch,竞赛',
        level:'主秀',
        tags:['强化学习','DQN','PPO','竞赛获奖'],
        features:['DQN / Target DQN 算法实现','PPO 算法调参与实验','奖励函数设计 (reward shaping)','特征工程与状态表示','超参数调优','团队协作'],
        link:'https://github.com/skystar01/my-created',
        screenshots:['images/award-kaiwu-final-page1.webp']
    },
    'Flappy Bird AI': {
        icon:'icon-flappy',
        description:'从零实现的 Flappy Bird AI 训练与部署项目。算法核心：Dueling DQN（拆分 Value / Advantage 流）+ Prioritized Experience Replay（带 alpha / beta 退火）+ 自定义 Reward Wrapper（过管 +10、死亡 -10、存活 +0.1）。\n\n完整跑通的 pipeline：\n  1) 自定义 Gym 环境\n  2) Dueling DQN 网络（PyTorch）\n  3) Reward Wrapper 与训练循环（含 epsilon 衰减、Huber Loss、Grad Clip、Target Network 同步）\n  4) Checkpoint 保存（best_flappy.pth / final_flappy.pth）\n  5) Flask API 暴露推理接口\n  6) 网站前端 Canvas 直接调用 API\n\n训练好的模型已部署在本站游戏区，按 A 即可召唤 AI 试玩。',
        progress:90,
        techStack:'PyTorch,Flask,DQN,RL',
        level:'主秀',
        tags:['Dueling DQN','PER','Reward Shaping','端到端','部署'],
        features:['Dueling DQN 网络结构','Prioritized Experience Replay','自定义 Reward Wrapper','Huber Loss + Gradient Clipping','Target Network 定期同步','Flask API 推理服务','端到端 pipeline'],
        link:'https://github.com/skystar01/skystar.github.io',
        screenshots:['🎮','🤖','📊']
    },
    '智能问答系统': {
        icon:'icon-chat',
        description:'本科毕业设计。基于开源项目 jingyaogong/minimind 实现，从零预训练轻量级中文对话 Transformer 模型。\n\n完整跑通  数据清洗 → tokenizer 配置 → 模型训练 → 推理脚本 → FastAPI 封装 端到端流程。租显卡完成训练，最终模型可进行基础中文多轮对话。\n\n**定位**：重在流程完整，模型效果受限于参数量与训练资源。',
        progress:75,
        techStack:'PyTorch,FastAPI,NLP',
        level:'副秀',
        tags:['NLP','Transformer','端到端'],
        features:['参考开源项目 minimind','中文对话数据集处理','轻量级 Transformer 训练','数据处理 pipeline','基础多轮对话生成'],
        link:'https://github.com/skystar01/my-created',
        screenshots:['🤖','💬','📚']
    }
};

// ─── SKILL DATA ───
const skillData = {
    'Python': {
        icon: 'fab fa-python',
        description: '主要编程语言,数据处理 / ML 训练 / Flask 推理 / 自动化脚本。',
        level: '熟练',
        tags: ['数据处理', 'ML 训练', '后端脚本'],
        features: ['pandas / numpy 数据处理', 'PyTorch 训练脚本', 'Flask 推理 API', '自动化脚本'],
        projects: [
            { name: '开悟 AI 竞赛 RLBrain', desc: 'Dueling DQN 训练 AI 玩游戏', link: '#' },
            { name: 'Flappy Bird AI', desc: 'DQN 训练 + 浏览器可视化推理', link: '#' },
            { name: '智能问答系统', desc: '毕设,后端问答服务', link: '#' },
            { name: '本站', desc: '数据处理 / 自动化脚本', link: '#' }
        ],
        exploring: ['异步性能优化', 'asyncio 模式']
    },
    'PyTorch': {
        icon: 'icon-flame',
        description: 'RL 项目与毕设中使用。熟悉 DQN / Transformer 的训练循环、Reward 设计、Checkpoint 管理。',
        level: '熟练',
        tags: ['深度学习', 'RL', '训练流程'],
        features: ['Dueling DQN 网络实现', '训练循环与 epsilon 衰减', 'Reward Wrapper 设计', 'Checkpoint 保存 / 加载', 'Transformer 预训练脚本'],
        projects: [
            { name: '开悟 AI 竞赛 RLBrain', desc: 'Dueling DQN 主训练框架', link: '#' },
            { name: 'Flappy Bird AI', desc: 'DQN 模型训练 + 推理', link: '#' },
            { name: '智能问答系统', desc: '毕设,Transformer 微调', link: '#' }
        ],
        exploring: ['LoRA 微调', '分布式训练 (DDP)']
    },
    '强化学习': {
        icon: 'icon-rl',
        description: '我最熟悉的方向。本科开悟竞赛 + Flappy Bird 自学。系统用过 Q-learning / DQN / Target DQN / PPO,核心在奖励函数设计、环境数据处理、特征工程。',
        level: '熟练',
        tags: ['DQN', 'PPO', '奖励设计', '调参'],
        features: ['DQN / Target DQN 算法实现', 'PPO 调参与实验', '奖励函数设计与 shaping', '环境返回数据处理', '特征维度工程', '超参数调优'],
        projects: [
            { name: '开悟 AI 竞赛 RLBrain', desc: 'Dueling DQN,川渝地区二等奖 / 全国第 9', link: '#' },
            { name: 'Flappy Bird AI', desc: 'DQN 训练 + 浏览器可视化推理', link: '#' }
        ],
        exploring: ['SAC 算法', '多智能体强化学习']
    },
    'JavaScript': {
        icon: 'fab fa-js-square',
        description: '智能问答毕设 + 本站(粒子系统 / 弹窗 / 搜索 / 主题切换)主要使用。',
        level: '熟练',
        tags: ['前端', 'Canvas', 'ES6+'],
        features: ['DOM 操作', 'Canvas 动画与游戏', 'ES6+ 语法', '异步编程 (Promise / async)'],
        projects: [
            { name: '本站', desc: '粒子系统 / 弹窗 / 搜索 / 主题切换 / Canvas 游戏', link: '#' },
            { name: '智能问答系统', desc: '毕设,前端交互', link: '#' }
        ],
        exploring: ['TypeScript']
    },
    'HTML5': {
        icon: 'fab fa-html5',
        description: '语义化结构,智能问答毕设 + 本站使用。',
        level: '熟练',
        tags: ['语义化', 'Canvas', '表单'],
        features: ['语义化标签', 'Canvas 绘图', '音视频嵌入', '表单与文件上传'],
        projects: [
            { name: '本站', desc: '多 panel 单页布局', link: '#' },
            { name: '智能问答系统', desc: '毕设前端结构', link: '#' }
        ],
        exploring: ['无障碍 (a11y)', '语义化最佳实践']
    },
    'CSS3': {
        icon: 'fab fa-css3-alt',
        description: '本站大量使用(玻璃拟态 / 渐变 / 动画 / 响应式)。',
        level: '熟练',
        tags: ['动画', '响应式', 'Glassmorphism'],
        features: ['动画与过渡 (transition / animation)', 'Grid / Flexbox 布局', '响应式适配', '毛玻璃 / 渐变效果'],
        projects: [
            { name: '本站', desc: '深空主题 / 卡片 / 弹窗 / 粒子 / 7 panel 主题色', link: '#' },
            { name: '智能问答系统', desc: '毕设样式', link: '#' }
        ],
        exploring: ['高级动效', 'CSS Houdini']
    },
    'Linux / 命令行': {
        icon: 'fas fa-terminal',
        description: '训练环境与本地开发的日常工具。简单命令还记得,复杂的靠搜。',
        level: '了解',
        tags: ['训练环境', '开发工具'],
        features: ['SSH 远程连接', 'WSL 本地开发', '环境与依赖配置', '日志与进程排查'],
        projects: [
            { name: '训练环境', desc: 'WSL / 远程服务器日常', link: '#' }
        ],
        exploring: ['tmux 进阶', 'shell 脚本']
    },
    'Git': {
        icon: 'fab fa-git-alt',
        description: '日常版本控制,初始化仓库 + 提交过代码 + 简单的分支合并。',
        level: '熟练',
        tags: ['版本控制', 'GitHub'],
        features: ['仓库初始化', 'commit 规范', '分支与合并', '基本冲突解决'],
        projects: [
            { name: '全部项目', desc: '开悟 / Flappy / 智能问答 / 本站', link: '#' }
        ],
        exploring: ['rebase 工作流', 'PR 规范']
    },
    'SQL': {
        icon: 'fas fa-database',
        description: 'MySQL,智能问答毕设用来存用户表 / 问答记录。',
        level: '了解',
        tags: ['MySQL', '查询'],
        features: ['基础 CRUD', '多表 JOIN 查询', '索引基础', '数据建模入门'],
        projects: [
            { name: '智能问答系统', desc: '毕设,用户表 / 问答记录表', link: '#' }
        ],
        exploring: ['索引优化', '复杂查询性能']
    },
    'React': {
        icon: 'fab fa-react',
        description: '目前工作中接触使用。基础组件 + Hooks。体验过 React 生态(组件化 / 虚拟 DOM / 状态管理),比原生 HTML 复杂但性能更好。',
        level: '了解',
        tags: ['组件', 'Hooks', '工作接触'],
        features: ['基础组件编写', 'useState / useEffect', 'JSX 语法', 'Props 与组件组合'],
        projects: [
            { name: '工作中使用', desc: '业务组件开发', link: '#' }
        ],
        exploring: ['Hooks 进阶', '状态管理 (Redux / Zustand)']
    }
};

// ─── SKILL MODAL ───
let _modalBusy = false;

document.querySelectorAll('.skill-item').forEach(item => {
    item.addEventListener('click', () => {
        if (_modalBusy) return;
        const nameEl = item.querySelector('span:not([class])');
        if (nameEl) openSkillModal(nameEl.textContent);
    });
});

document.getElementById('modalClose').addEventListener('click', closeSkillModal);
document.getElementById('modalOverlay').addEventListener('click', closeSkillModal);

function openSkillModal(skillName) {
    const skill = skillData[skillName];
    if (!skill) return;
    const modal = document.getElementById('skillModal');
    const skillKey = skill.icon.replace(/^icon-/, '');
    const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const escAttr = s => escHtml(s);
    document.getElementById('cardIcon').innerHTML = `<span class="${skill.icon}" aria-label="${skillName}"><svg viewBox="0 0 24 24"><use href="#i-${skillKey}"/></svg></span>`;
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
        if (typeof item === 'string' && (item.startsWith('http') || item.includes('.png') || item.includes('.jpg'))) {
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
