import { skillData } from './data/skills.js';
import { initImageViewer } from './portfolio-tools.js';
const projects = { '智能博弈算法': 'rl-agent', 'Flappy Bird AI': 'flappy-ai', '智能问答系统': 'qa-system' };
const panels = ['home', 'news', 'about', 'skills', 'projects', 'game', 'contact'];
const games = [...new Set([...document.querySelectorAll('.game-tab[data-game]')].map(el => el.dataset.game))];
let applying = false;
let route = { panel: 'home' };
const positions = new Map();
const key = r => JSON.stringify(r);
function normalize(value) {
    const r = { panel: panels.includes(value.panel) ? value.panel : 'home' };
    if (r.panel === 'projects' && projects[value.project]) r.project = value.project;
    if (r.panel === 'skills' && Object.hasOwn(skillData, value.skill)) r.skill = value.skill;
    if (r.panel === 'game') r.game = games.includes(value.game) ? value.game : (document.querySelector('.game-tab.active')?.dataset.game || games[0]);
    return r;
}
function address(r) {
    return `#/${r.panel}${r.project ? '/' + projects[r.project] : r.skill ? '/' + encodeURIComponent(r.skill) : r.game ? '/' + r.game : ''}`;
}
function readAddress() {
    const [panel, detail] = location.hash.replace(/^#\/?/, '').split('/');
    let skill; try { skill = decodeURIComponent(detail || ''); } catch { skill = ''; }
    return normalize({panel, game:detail, skill, project:Object.keys(projects).find(name=>projects[name]===detail)});
}
function savePosition() {
    const panel = document.getElementById('panel-' + route.panel);
    positions.set(route.panel, panel?.scrollTop || 0);
    history.replaceState({...history.state, scroll:panel?.scrollTop || 0}, '', location.href);
}
function updateReturn() {
    const names = {home:'首页',news:'每日资讯',about:'关于我',skills:'技能',projects:'精选项目',game:'游戏中心',contact:'联系我'};
    document.title = `${route.project || route.skill || names[route.panel]} · Sky Star`;
    const button = document.getElementById('projectReturn');
    const project = history.state?.returnProject;
    button.hidden = route.panel !== 'game' || !projects[project];
    button.textContent = project ? `← 返回 ${project}` : '← 返回项目';
}
function write(next, extras = {}, replace = false) {
    next = normalize(next);
    if (!replace && key(next) === key(route)) return;
    savePosition();
    const parent = route;
    route = next;
    const inheritedReturn = next.panel === 'game' && parent.panel === 'game' ? history.state?.returnProject : undefined;
    history[replace ? 'replaceState' : 'pushState']({route:next, detailParent:!replace && !!(next.project || next.skill), modalParent:!!next.project && parent.panel === 'projects' && !parent.project, returnProject:inheritedReturn, ...extras}, '', address(next));
    updateReturn();
}
function apply(next) {
    applying = true;
    route = normalize(next);
    window.projectDialog.close(true);
    window.skillDialog.close(true);
    window.switchPanel(route.panel);
    if (route.game) window.selectSiteGame?.(route.game, {route:true, force:true});
    if (route.project) window.projectDialog.open(route.project);
    if (route.skill) window.skillDialog.open(route.skill);
    const panel = document.getElementById('panel-' + route.panel);
    panel.scrollTop = history.state?.scroll ?? positions.get(route.panel) ?? 0;
    applying = false;
    updateReturn();
}
function init() {
    initImageViewer();
    document.querySelectorAll('.skill-item').forEach(item=>{
        item.tabIndex = 0; item.setAttribute('role','button');
        item.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();item.click();} });
    });
    document.querySelectorAll('.project-card-visual img').forEach(img => {
        const preview = img.parentElement;
        const settle = () => { preview.dataset.preview = img.naturalWidth ? 'ready' : 'error'; };
        preview.dataset.preview = 'loading';
        img.addEventListener('load', settle, {once:true});
        img.addEventListener('error', settle, {once:true});
        if (img.complete) settle();
    });
    const info = document.querySelector('.project-info-panel');
    const preview = document.querySelector('.carousel-section');
    info.querySelector('#modalMetrics').after(preview);
    const actionRow = info.querySelector('.modal-cta-row');
    document.querySelector('.right-content-area').append(actionRow);
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'project-detail-back'; close.textContent = '返回项目';
    close.addEventListener('click',()=>window.projectDialog.close());
    actionRow.append(close);
    for (const [id, text] of [['modalProjectDesc','项目说明'],['modalTechTags','技术栈']]) {
        const label = document.createElement('h4'); label.className = 'detail-section-label'; label.textContent = text;
        document.getElementById(id).before(label);
    }
    const returnButton = document.createElement('button');
    returnButton.id = 'projectReturn';
    returnButton.className = 'project-return';
    returnButton.type = 'button';
    returnButton.hidden = true;
    document.querySelector('.games-header')?.append(returnButton);
    returnButton.addEventListener('click', () => window.siteNavigation.go({panel:'projects',project:history.state.returnProject}));
    window.siteNavigation = {
        record(next) {
            if (applying) return;
            write(next);
            if (next.panel === 'game' && !next.game) window.selectSiteGame?.(route.game,{force:true,route:true});
        },
        go(next, extras) { write(next, extras); apply(route); },
        closeProject() {
            if (applying || !route.project) return false;
            if (history.state?.modalParent || history.state?.detailParent) history.back();
            else { write({panel:'projects'}, {}, true); apply(route); }
            return true;
        },
        closeSkill() {
            if (applying || !route.skill) return false;
            if (history.state?.detailParent) history.back();
            else { write({panel:'skills'}, {}, true); apply(route); }
            return true;
        },
    };
    const initial = readAddress();
    history.replaceState({...history.state,route:initial}, '', address(initial));
    apply(initial);
    addEventListener('popstate', () => apply(readAddress()));
    addEventListener('pagehide', savePosition);
    addEventListener('hashchange', () => { const next = readAddress(); if (key(next) !== key(route)) apply(next); });
    const stage = document.querySelector('.game-stage');
    const loading = document.createElement('div');
    loading.className = 'game-load-feedback';
    loading.innerHTML = '<span role="status">正在准备游戏…</span><button type="button">加载失败，重新加载</button>';
    stage.append(loading);
    // Failed module imports are cached by the browser; a reload clears that cache.
    loading.querySelector('button').addEventListener('click',()=>location.reload());
    // Pointer response is bounded and only runs while the visitor interacts.
    const art = document.querySelector('.studio-art');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    art.addEventListener('pointermove', e => {
        if (reduced.matches) return;
        const box = art.getBoundingClientRect();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(()=>{
            art.style.setProperty('--art-x', `${(e.clientX-box.left)/box.width*8-4}px`);
            art.style.setProperty('--art-y', `${(e.clientY-box.top)/box.height*8-4}px`);
        });
    });
    art.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);art.style.setProperty('--art-x','0px');art.style.setProperty('--art-y','0px');});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
