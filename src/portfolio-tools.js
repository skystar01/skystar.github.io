import { skillData } from './data/skills.js';

const skillAliases = { RL:'强化学习', DQN:'强化学习', PPO:'强化学习', 'Reward Shaping':'强化学习', Flask:'Flask / FastAPI', FastAPI:'Flask / FastAPI', ONNX:'ONNX 导出', NLP:'模型训练' };
const projectAliases = { '开悟 AI 竞赛 RLBrain':'智能博弈算法', 'Flappy Bird AI':'Flappy Bird AI', '智能问答系统':'智能问答系统' };

export function enhanceProjectLinks() {
    document.querySelectorAll('#modalTechTags .tech-badge').forEach(tag => {
        const name = tag.textContent;
        const skill = skillAliases[name] || (Object.hasOwn(skillData, name) ? name : null);
        if (!skill) return;
        const link = document.createElement('a');
        link.className = 'tech-badge skill-link';
        link.textContent = name + ' ↗';
        link.href = '#/skills/' + encodeURIComponent(skill);
        link.setAttribute('aria-label', `${name}：查看${skill}技能`);
        link.addEventListener('click', e => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault(); window.siteNavigation.go({panel:'skills', skill});
        });
        tag.replaceWith(link);
    });
}

export function enhanceSkillLinks() {
    document.querySelectorAll('#detailProjects .detail-project').forEach(link => {
        const name = link.querySelector('.detail-project-name').textContent;
        const project = projectAliases[name];
        if (project || name === '本站') {
            const slugs = {'智能博弈算法':'rl-agent','Flappy Bird AI':'flappy-ai','智能问答系统':'qa-system'};
            link.href = project ? '#/projects/' + slugs[project] : '#/home';
            link.addEventListener('click', e => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault(); window.siteNavigation.go(project ? {panel:'projects',project} : {panel:'home'});
            });
        } else if (link.getAttribute('href') === '#') {
            const item = document.createElement('div'); item.className = link.className;
            item.append(...link.childNodes); link.replaceWith(item);
        }
    });
}

// Native modal semantics; zoom levels and keyboard conventions follow PhotoSwipe.
export function initImageViewer() {
    const dialog = document.createElement('dialog');
    dialog.className = 'image-viewer';
    dialog.setAttribute('aria-label', '项目图片查看器');
    dialog.innerHTML = `<header><span class="viewer-caption" aria-live="polite"></span><div class="viewer-tools"><button data-action="out" aria-label="缩小图片">−</button><button data-action="reset">适应窗口</button><button data-action="in" aria-label="放大图片">＋</button><button data-action="close" aria-label="关闭图片查看器">关闭 ×</button></div></header><div class="viewer-stage" tabindex="0" aria-label="图片区域，放大后可滚动查看"><div class="viewer-surface"><img draggable="false" alt="项目预览"><p class="viewer-status" role="status"></p></div></div><footer><button data-action="prev">← 上一张</button><span>← → 切图 · + − 缩放 · Esc 返回</span><button data-action="next">下一张 →</button></footer>`;
    document.body.append(dialog);
    const img = dialog.querySelector('img');
    const stage = dialog.querySelector('.viewer-stage');
    const surface = dialog.querySelector('.viewer-surface');
    const status = dialog.querySelector('.viewer-status');
    let images = [], index = 0, zoom = 1, opener, drag, ready = false;
    function fit() {
        if (!ready || !img.naturalWidth) return;
        // SVGs may report a small default intrinsic size despite being scalable.
        const limit = /\.svg(?:[?#]|$)/i.test(img.src) ? Infinity : 1;
        const scale = Math.min((stage.clientWidth - 40) / img.naturalWidth, (stage.clientHeight - 40) / img.naturalHeight, limit);
        const w = Math.round(img.naturalWidth * scale * zoom), h = Math.round(img.naturalHeight * scale * zoom);
        img.style.width = w + 'px'; img.style.height = h + 'px';
        surface.style.width = Math.max(stage.clientWidth, w + 40) + 'px';
        surface.style.height = Math.max(stage.clientHeight, h + 40) + 'px';
        dialog.querySelector('[data-action="reset"]').textContent = zoom === 1 ? '适应窗口' : `${Math.round(zoom * 100)}% · 重置`;
        dialog.querySelector('[data-action="out"]').disabled = zoom <= 1;
        dialog.querySelector('[data-action="in"]').disabled = zoom >= 4;
    }
    function show(next) {
        index = Math.max(0, Math.min(images.length - 1, next)); zoom = 1;
        ready = false; drag = null;
        surface.style.width = '100%'; surface.style.height = '100%'; stage.scrollTo(0,0);
        dialog.querySelector('[data-action="reset"]').textContent = '适应窗口';
        dialog.querySelector('[data-action="out"]').disabled = true;
        dialog.querySelector('[data-action="in"]').disabled = true;
        img.hidden = true; status.textContent = '正在加载图片…';
        img.onload = () => { ready = true; img.hidden = false; status.textContent = ''; fit(); stage.scrollTo(0,0); };
        img.onerror = () => { status.textContent = '图片暂时无法加载，请关闭后重试。'; };
        img.src = images[index].src; img.alt = images[index].alt;
        dialog.querySelector('.viewer-caption').textContent = `${document.getElementById('modalProjectTitle').textContent} · ${index+1} / ${images.length}`;
        dialog.querySelector('[data-action="prev"]').disabled = index === 0;
        dialog.querySelector('[data-action="next"]').disabled = index === images.length - 1;
    }
    function action(name) {
        if (name === 'close') { dialog.close(); return; }
        if (name === 'prev' || name === 'next') { show(index + (name === 'prev' ? -1 : 1)); return; }
        if (!ready) return;
        zoom = name === 'reset' ? 1 : Math.max(1, Math.min(4, zoom + (name === 'in' ? .5 : -.5)));
        fit();
    }
    document.getElementById('carouselSlides').addEventListener('click',e=>{
        const button = e.target.closest('.preview-expand'); if (!button) return;
        const nodes = [...document.querySelectorAll('#carouselSlides .preview-expand img')];
        images = nodes.map(el=>({src:el.src,alt:el.alt})); opener = button;
        dialog.showModal(); show(nodes.indexOf(button.querySelector('img')));
        dialog.querySelector('[data-action="close"]').focus();
    });
    dialog.addEventListener('click',e=>{ const button=e.target.closest('[data-action]'); if(button) action(button.dataset.action); });
    dialog.addEventListener('close',()=>{ drag=null; if(opener?.isConnected) opener.focus({preventScroll:true}); });
    document.addEventListener('keydown',e=>{
        if (!dialog.open) return;
        // Do not let gallery shortcuts reach the project dialog or page navigation.
        e.stopImmediatePropagation();
        if(e.ctrlKey || e.metaKey || e.altKey) return;
        const shortcuts={Escape:'close',ArrowLeft:'prev',ArrowRight:'next','+':'in','=':'in','-':'out','0':'reset'};
        if(shortcuts[e.key]) {e.preventDefault(); action(shortcuts[e.key]);}
    },true);
    stage.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();action(e.deltaY < 0?'in':'out');}}, {passive:false});
    stage.addEventListener('pointerdown',e=>{if(zoom<=1 || e.button!==0)return;drag={x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};stage.setPointerCapture(e.pointerId);});
    stage.addEventListener('pointermove',e=>{if(drag){stage.scrollLeft=drag.left+drag.x-e.clientX;stage.scrollTop=drag.top+drag.y-e.clientY;}});
    stage.addEventListener('pointerup',()=>drag=null);
    stage.addEventListener('pointercancel',()=>drag=null);
    addEventListener('resize',()=>{if(dialog.open)fit();});
    addEventListener('popstate',()=>{if(dialog.open)dialog.close();});
}
