// =============================================
// skill-sphere.js — 零依赖 3D 球面技能知识图谱
// 特性:
//  - Fibonacci 球面均匀分布 + 最近邻网格连线
//  - 仅在 #panel-skills 处于 active 时运行 rAF，切走零性能消耗
//  - 支持拖拽旋转、点击节点平滑拉近聚焦并展示详情、点空白处退回继续旋转
// =============================================
import { skillData } from './data/skills.js';
import { whenDomReady } from './dom-ready.js';

function initSkillSphere() {
    const host = document.getElementById('skillSphereHost');
    const panel = document.getElementById('panel-skills');
    if (!host || !panel) return;

    const entries = Object.entries(skillData);
    if (entries.length === 0) return;

    // ─── DOM 结构 ───
    host.innerHTML = `
        <div class="sphere-head">
            <span class="sphere-eyebrow">KNOWLEDGE GRAPH · 3D</span>
            <span class="sphere-hint">拖拽旋转 · 点击节点拉近 · 点空白处恢复</span>
        </div>
        <div class="sphere-stage">
            <canvas class="sphere-canvas" aria-label="3D 技能知识图谱"></canvas>
            <div class="sphere-detail" hidden>
                <button type="button" class="sphere-detail-close" aria-label="关闭详情">×</button>
                <div class="sphere-detail-badge"></div>
                <h4 class="sphere-detail-title"></h4>
                <p class="sphere-detail-desc"></p>
                <div class="sphere-detail-tags"></div>
            </div>
        </div>
    `;

    const canvas = host.querySelector('.sphere-canvas');
    const ctx = canvas.getContext('2d');
    const detailEl = host.querySelector('.sphere-detail');
    const detailBadge = host.querySelector('.sphere-detail-badge');
    const detailTitle = host.querySelector('.sphere-detail-title');
    const detailDesc = host.querySelector('.sphere-detail-desc');
    const detailTags = host.querySelector('.sphere-detail-tags');
    const detailClose = host.querySelector('.sphere-detail-close');

    // ─── Fibonacci 球面分布 ───
    const N = entries.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const nodes = entries.map(([name, info], i) => {
        const y = 1 - (i / Math.max(1, N - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * i;
        return {
            name,
            info,
            x: Math.cos(theta) * r,
            y,
            z: Math.sin(theta) * r,
            sx: 0,
            sy: 0,
            sz: 0,
            scale: 1,
        };
    });

    // 每个节点连向最近的 3 个邻居，形成球面网格
    const edges = [];
    const edgeSet = new Set();
    for (let i = 0; i < N; i++) {
        const dists = [];
        for (let j = 0; j < N; j++) {
            if (i === j) continue;
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dz = nodes[i].z - nodes[j].z;
            dists.push({ j, d: dx * dx + dy * dy + dz * dz });
        }
        dists.sort((a, b) => a.d - b.d);
        for (let k = 0; k < Math.min(3, dists.length); k++) {
            const j = dists[k].j;
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (!edgeSet.has(key)) {
                edgeSet.add(key);
                edges.push([i, j]);
            }
        }
    }

    // ─── 状态 ───
    let width = 0;
    let height = 0;
    let dpr = 1;
    let rotX = 0.22;
    let rotY = 0;
    let velX = 0;
    let velY = 0.0035;
    let zoom = 1;
    let targetZoom = 1;
    let targetRotX = null;
    let targetRotY = null;
    let selectedNode = null;
    let hoveredNode = null;
    let dragging = false;
    let dragMoved = false;
    let lastX = 0;
    let lastY = 0;
    let rafId = null;

    function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        width = Math.max(300, Math.floor(rect.width));
        height = Math.max(280, Math.floor(rect.height));
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function showDetail(node) {
        selectedNode = node;
        targetZoom = 1.38;
        // 计算把该节点转到正前方 (0, 0, 1) 所需的目标角度
        const yaw = Math.atan2(-node.x, node.z);
        const pitch = Math.asin(Math.max(-1, Math.min(1, node.y)));
        targetRotY = yaw;
        targetRotX = pitch;

        detailBadge.textContent = node.info.level || '技能';
        detailTitle.textContent = node.name;
        detailDesc.textContent = node.info.description || '';
        detailTags.innerHTML = (node.info.tags || [])
            .map((t) => `<span>${t}</span>`)
            .join('');
        detailEl.hidden = false;
    }

    function clearDetail() {
        selectedNode = null;
        targetZoom = 1;
        targetRotX = null;
        targetRotY = null;
        detailEl.hidden = true;
    }

    function project() {
        const cx = width * 0.5;
        const cy = height * 0.5;
        const radius = Math.min(width, height) * 0.34 * zoom;
        const fov = 3.2;

        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);

        for (const n of nodes) {
            // 绕 Y 轴旋转
            const x1 = n.x * cosY + n.z * sinY;
            const z1 = -n.x * sinY + n.z * cosY;
            // 绕 X 轴旋转
            const y2 = n.y * cosX - z1 * sinX;
            const z2 = n.y * sinX + z1 * cosX;

            const perspective = fov / (fov - z2);
            n.sx = cx + x1 * radius * perspective;
            n.sy = cy + y2 * radius * perspective;
            n.sz = z2;
            n.scale = perspective;
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        const cx = width * 0.5;
        const cy = height * 0.5;
        const rGlobe = Math.min(width, height) * 0.34 * zoom;

        // 0. GitHub Globe 风格：淡雅球体轮廓光晕 + 经纬线参考环
        const halo = ctx.createRadialGradient(cx, cy, rGlobe * 0.25, cx, cy, rGlobe * 1.18);
        halo.addColorStop(0, 'rgba(45, 85, 212, 0.06)');
        halo.addColorStop(0.75, 'rgba(45, 85, 212, 0.025)');
        halo.addColorStop(1, 'rgba(45, 85, 212, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, rGlobe * 1.18, 0, Math.PI * 2);
        ctx.fill();

        // 球体最外圈细轮廓
        ctx.beginPath();
        ctx.arc(cx, cy, rGlobe * 1.02, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(45, 85, 212, 0.09)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 赤道椭圆虚线环（随 rotX 倾角变化）
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.ellipse(0, 0, rGlobe * 1.02, Math.max(4, Math.abs(Math.sin(rotX)) * rGlobe * 1.02), 0, 0, Math.PI * 2);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = 'rgba(45, 85, 212, 0.11)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // 1. 绘制球面网格连线
        for (const [i, j] of edges) {
            const a = nodes[i];
            const b = nodes[j];
            const depth = (a.sz + b.sz) * 0.5;
            const isHighlighted =
                selectedNode && (a === selectedNode || b === selectedNode);
            const alpha = isHighlighted
                ? 0.65
                : Math.max(0.04, Math.min(0.2, (depth + 1) * 0.1));

            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.strokeStyle = isHighlighted
                ? `rgba(207, 113, 76, ${alpha})`
                : `rgba(45, 85, 212, ${alpha})`;
            ctx.lineWidth = isHighlighted ? 1.6 : 0.8;
            ctx.stroke();
        }

        // 2. 按 z 深度从后往前绘制节点
        const sorted = [...nodes].sort((a, b) => a.sz - b.sz);
        for (const n of sorted) {
            const frontness = (n.sz + 1) * 0.5; // 0(背) -> 1(正前)
            const isSelected = n === selectedNode;
            const isHovered = n === hoveredNode;
            const isConnected = selectedNode && edges.some(
                ([i, j]) => (nodes[i] === selectedNode && nodes[j] === n) || (nodes[j] === selectedNode && nodes[i] === n)
            );
            const baseAlpha = isSelected || isHovered || isConnected ? 1 : 0.22 + frontness * 0.78;
            const r = (isSelected ? 7.5 : isHovered ? 6 : isConnected ? 5 : 3 + frontness * 2.4) * Math.min(1.25, zoom * 0.9);

            // 节点外圈微光（正面节点 & 选中节点）
            if (frontness > 0.65 || isSelected || isHovered) {
                ctx.beginPath();
                ctx.arc(n.sx, n.sy, r + (isSelected ? 5 : 3), 0, Math.PI * 2);
                ctx.fillStyle = isSelected
                    ? 'rgba(207, 113, 76, 0.16)'
                    : 'rgba(45, 85, 212, 0.1)';
                ctx.fill();
            }

            // 节点圆点
            ctx.beginPath();
            ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
            ctx.fillStyle = isSelected
                ? `rgba(207, 113, 76, ${baseAlpha})`
                : isConnected
                    ? `rgba(207, 113, 76, 0.85)`
                    : `rgba(45, 85, 212, ${baseAlpha})`;
            ctx.fill();

            // 标签文字（悬停/选中时带 GitHub 风格胶囊底，避免被线穿过）
            const fontSize = Math.round(10 + frontness * 2.5);
            ctx.font = `${isSelected || isHovered ? '600' : '500'} ${fontSize}px 'Noto Sans SC', sans-serif`;
            const labelY = n.sy - r - 10;
            if (isSelected || isHovered) {
                const tw = ctx.measureText(n.name).width;
                const pw = tw + 14;
                const ph = 20;
                ctx.fillStyle = 'rgba(251, 251, 248, 0.94)';
                ctx.strokeStyle = isSelected ? '#cf714c' : '#2d55d4';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(n.sx - pw / 2, labelY - ph / 2, pw, ph, 10);
                ctx.fill();
                ctx.stroke();
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isSelected
                ? '#cf714c'
                : isHovered
                    ? '#2d55d4'
                    : `rgba(37, 42, 48, ${0.2 + frontness * 0.8})`;
            ctx.fillText(n.name, n.sx, labelY);
        }
    }

    function step() {
        if (!panel.classList.contains('active')) {
            rafId = null;
            return;
        }

        zoom += (targetZoom - zoom) * 0.1;

        if (selectedNode && targetRotY !== null && targetRotX !== null) {
            // 平滑插值到选中节点正面
            let dy = targetRotY - rotY;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            rotY += dy * 0.12;
            rotX += (targetRotX - rotX) * 0.12;
        } else if (!dragging) {
            rotY += velY;
            rotX += velX;
            // 阻尼回归慢速自转
            velY += (0.0032 - velY) * 0.03;
            velX *= 0.94;
        }

        project();
        draw();
        rafId = requestAnimationFrame(step);
    }

    function startLoop() {
        if (!rafId && panel.classList.contains('active')) {
            resize();
            rafId = requestAnimationFrame(step);
        }
    }

    function findNodeAt(x, y) {
        let best = null;
        let bestDist = 26 * 26;
        for (const n of nodes) {
            const dx = n.sx - x;
            const dy = n.sy - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist && n.sz > -0.25) {
                bestDist = d2;
                best = n;
            }
        }
        return best;
    }

    // ─── 指针交互 ───
    canvas.addEventListener('pointerdown', (e) => {
        dragging = true;
        dragMoved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (dragging) {
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
            if (dragMoved && selectedNode) clearDetail();
            rotY += dx * 0.006;
            rotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.006));
            velY = dx * 0.0025;
            velX = dy * 0.0025;
            lastX = e.clientX;
            lastY = e.clientY;
            return;
        }

        hoveredNode = findNodeAt(x, y);
        canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
    });

    canvas.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        if (!dragMoved) {
            const rect = canvas.getBoundingClientRect();
            const hit = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (hit) showDetail(hit);
            else clearDetail();
        }
    });

    detailClose.addEventListener('click', (e) => {
        e.stopPropagation();
        clearDetail();
    });

    window.addEventListener('resize', () => {
        if (panel.classList.contains('active')) resize();
    });

    // 仅在 #panel-skills 激活时运行，切走立刻停掉 rAF
    new MutationObserver(() => {
        if (panel.classList.contains('active')) startLoop();
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });

    if (panel.classList.contains('active')) startLoop();
}

whenDomReady(initSkillSphere);
