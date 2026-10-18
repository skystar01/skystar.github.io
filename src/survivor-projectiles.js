// Small, cached Canvas textures: no bitmap backgrounds or per-frame blur filters.
const PALETTE = {
    dart: ['#63b5ff', '#e0f4ff'], scatter: ['#b9a0ff', '#fff1ff'],
    bomb: ['#ff914d', '#fff2bc'], poison: ['#80df9d', '#e2ffd5'],
    snow: ['#56d9ed', '#efffff'], fused: ['#e8b85c', '#fff5d1'],
    hostile: ['#f0747b', '#ffe1d5'], bounce: ['#ce85f1', '#f5dcff'],
};

export function createProjectileArt() {
    const textures = {};
    for (const [type, [color, light]] of Object.entries(PALETTE)) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const c = canvas.getContext('2d');
        c.translate(88, 32);
        const hostile = type === 'hostile' || type === 'bounce';
        const length = hostile ? 23 : type === 'dart' ? 68 : type === 'scatter' ? 44 : 52;
        // Tapered wake: narrow at the tail, luminous at the projectile core.
        const trail = c.createLinearGradient(-length, 0, 6, 0);
        trail.addColorStop(0, color + '00');
        trail.addColorStop(.65, color + (hostile ? '32' : '55'));
        trail.addColorStop(1, color + 'b0');
        c.fillStyle = trail;
        c.beginPath();
        c.moveTo(-length, 0); c.quadraticCurveTo(-12, -3, 0, -7);
        c.lineTo(7, 0); c.lineTo(0, 7); c.quadraticCurveTo(-12, 3, -length, 0);
        c.fill();
        c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 1.5;
        c.shadowColor = color; c.shadowBlur = hostile ? 4 : 7;
        const polygon = points => {
            c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill();
        };
        if (type === 'dart' || type === 'scatter') {
            polygon(type === 'dart' ? [[18,0],[-6,-6],[-1,0],[-6,6]] : [[12,0],[-3,-5],[-9,0],[-3,5]]);
            c.shadowBlur = 0; c.fillStyle = light;
            polygon([[12,0],[-3,-2],[-1,0],[-3,2]]);
        } else if (type === 'snow') {
            c.beginPath();
            for (let i=0;i<6;i++) {
                const a=i*Math.PI/3, x=Math.cos(a), y=Math.sin(a);
                c.moveTo(0,0); c.lineTo(x*11,y*11);
                c.moveTo(x*7-y*3,y*7+x*3); c.lineTo(x*5,y*5); c.lineTo(x*7+y*3,y*7-x*3);
            }
            c.stroke(); c.fillStyle=light;
            polygon([[5,0],[0,-5],[-5,0],[0,5]]);
        } else if (type === 'bomb') {
            c.beginPath(); c.arc(0,0,9,0,Math.PI*2); c.fill();
            c.shadowBlur=0; c.strokeStyle=light; c.lineWidth=2;
            c.beginPath(); c.arc(0,0,5,-1.1,1.2); c.stroke();
            c.fillStyle=light; polygon([[5,0],[-2,-4],[-4,0],[-2,4]]);
            c.fillStyle=color+'90'; polygon([[-14,-3],[-26,-6],[-20,-1]]);
        } else if (type === 'poison') {
            c.beginPath(); c.ellipse(0,0,8,6,0,0,Math.PI*2); c.fill();
            c.shadowBlur=0; c.strokeStyle=light; c.beginPath(); c.arc(0,0,4,Math.PI,Math.PI*1.8); c.stroke();
            for (const [x,y,r] of [[-16,-5,3],[-24,3,2],[-34,-2,1.5]]) {
                c.fillStyle=color+'80'; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
            }
        } else if (type === 'fused') {
            polygon([[16,0],[0,-10],[-12,0],[0,10]]);
            c.shadowBlur=0; c.fillStyle='#31415c'; polygon([[10,0],[0,-6],[-7,0],[0,6]]);
            c.fillStyle=light; polygon([[6,0],[0,-3],[-4,0],[0,3]]);
            c.strokeStyle=color+'80'; c.beginPath(); c.ellipse(-4,0,19,13,0,-1.1,1.1); c.stroke();
        } else {
            // Enemy rounds keep a dark rim and compact silhouette for dodging.
            c.beginPath(); c.arc(0,0,8,0,Math.PI*2); c.fill();
            c.shadowBlur=0; c.strokeStyle='#301d35'; c.lineWidth=2; c.stroke();
            c.fillStyle=light; c.beginPath(); c.arc(1,-1,3,0,Math.PI*2); c.fill();
            if(type==='bounce') { c.strokeStyle=light; c.lineWidth=1; c.beginPath(); c.arc(0,0,11,0,Math.PI*2); c.stroke(); }
        }
        textures[type]=canvas;
    }
    return textures;
}

export function drawProjectile(ctx, textures, bullet, hostile = false) {
    const key = hostile ? (bullet.bounce ? 'bounce' : 'hostile') : (PALETTE[bullet.type] ? bullet.type : 'fused');
    const texture = textures[key];
    const scale = hostile ? bullet.r / 8 : bullet.tier === 'S' ? 1.15 : bullet.tier === 'A' ? 1.05 : .9;
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
    ctx.scale(scale, scale);
    ctx.drawImage(texture, -88, -32);
    ctx.restore();
}
