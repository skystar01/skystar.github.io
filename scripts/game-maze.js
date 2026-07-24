// ─── AI 迷宫逃生 (Maze Escape) ───
// 玩家在程序生成的迷宫中寻找出口, AI 怪物用 A* 实时寻路追击
// 依赖: SkyStorage (scripts/storage.js)
//
// 设计要点:
//   1. 迷宫生成: 递归回溯 DFS, 1=墙 0=路, N 为奇数
//   2. 怪物 AI: A* 实时寻路 (最小堆优先队列) + 视线感知 + 巡逻
//   3. 关卡递进: 尺寸/怪物数/视野/速度随关卡增长
//   4. 保护期: 关卡开始 1.5s 怪物不动, 玩家闪烁无敌
//   5. 寻路可视化: 默认开启, 高亮怪物 A* 路径

(function () {
    // ---------- 最小堆 (A* 优先队列) ----------
    class MinHeap {
        constructor() { this.data = []; }
        size() { return this.data.length; }
        push(item) {
            this.data.push(item);
            this._up(this.data.length - 1);
        }
        pop() {
            if (this.data.length === 0) return null;
            const top = this.data[0];
            const last = this.data.pop();
            if (this.data.length > 0) {
                this.data[0] = last;
                this._down(0);
            }
            return top;
        }
        _up(i) {
            const d = this.data;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (d[p].f <= d[i].f) break;
                const t = d[p]; d[p] = d[i]; d[i] = t;
                i = p;
            }
        }
        _down(i) {
            const d = this.data, n = d.length;
            for (;;) {
                const l = i * 2 + 1, r = i * 2 + 2;
                let best = i;
                if (l < n && d[l].f < d[best].f) best = l;
                if (r < n && d[r].f < d[best].f) best = r;
                if (best === i) break;
                const t = d[best]; d[best] = d[i]; d[i] = t;
                i = best;
            }
        }
    }

    // ---------- 迷宫生成 (递归回溯 DFS, 迭代实现) ----------
    function generateMaze(N) {
        // N 为奇数; 1=墙, 0=路
        const grid = [];
        for (let i = 0; i < N; i++) grid.push(new Array(N).fill(1));
        const stack = [[1, 1]];
        grid[1][1] = 0;
        while (stack.length) {
            const top = stack[stack.length - 1];
            const x = top[0], y = top[1];
            const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]];
            // shuffle
            for (let i = dirs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
            }
            let carved = false;
            for (let k = 0; k < dirs.length; k++) {
                const dx = dirs[k][0], dy = dirs[k][1];
                const nx = x + dx, ny = y + dy;
                if (nx > 0 && nx < N - 1 && ny > 0 && ny < N - 1 && grid[ny][nx] === 1) {
                    grid[y + dy / 2][x + dx / 2] = 0;
                    grid[ny][nx] = 0;
                    stack.push([nx, ny]);
                    carved = true;
                    break;
                }
            }
            if (!carved) stack.pop();
        }
        // 确保出口通路
        grid[N - 2][N - 2] = 0;

        // ── 增加环路和灵活性 ──
        // 1) 随机打通更多捷径 (从 N/4 提到 N/2, 打破纯树状单行道)
        const extra = Math.floor(N / 2);
        for (let i = 0; i < extra; i++) {
            const x = 2 + Math.floor(Math.random() * (N - 4));
            const y = 2 + Math.floor(Math.random() * (N - 4));
            if (grid[y][x] === 1) grid[y][x] = 0;
        }

        // 2) 找出死胡同 (只有一个相邻通路格的格子), 打通约 40% 的死胡同尽头
        //    让玩家有更多绕路选择, 也方便拾取道具和周旋怪物
        const deadEnds = [];
        for (let y = 1; y < N - 1; y++) {
            for (let x = 1; x < N - 1; x++) {
                if (grid[y][x] !== 0) continue;
                let openNeighbors = 0;
                if (grid[y - 1][x] === 0) openNeighbors++;
                if (grid[y + 1][x] === 0) openNeighbors++;
                if (grid[y][x - 1] === 0) openNeighbors++;
                if (grid[y][x + 1] === 0) openNeighbors++;
                if (openNeighbors === 1) deadEnds.push({ x: x, y: y });
            }
        }
        // 打通死胡同: 朝其唯一的墙方向开一个口 (变成通路), 不破坏边界
        for (let i = 0; i < deadEnds.length; i++) {
            if (Math.random() > 0.4) continue; // 40% 概率打通
            const d = deadEnds[i];
            // 找到死胡同格子的墙邻居 (打通它连到隔壁格子)
            const wallDirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            for (let k = 0; k < wallDirs.length; k++) {
                const wx = d.x + wallDirs[k][0];
                const wy = d.y + wallDirs[k][1];
                if (wx <= 0 || wx >= N - 1 || wy <= 0 || wy >= N - 1) continue;
                if (grid[wy][wx] === 1) {
                    grid[wy][wx] = 0; // 打通墙
                    // 确保墙另一侧也是路 (避免打通后又是个死胡同)
                    const bx = wx + wallDirs[k][0];
                    const by = wy + wallDirs[k][1];
                    if (bx > 0 && bx < N - 1 && by > 0 && by < N - 1 && grid[by][bx] === 1) {
                        grid[by][bx] = 0;
                    }
                    break;
                }
            }
        }
        return grid;
    }

    // ---------- A* 寻路 (返回从 start 到 goal 的路径数组, 含起终点) ----------
    function heuristic(ax, ay, bx, by) {
        return Math.abs(ax - bx) + Math.abs(ay - by);
    }

    function astar(grid, sx, sy, gx, gy) {
        const N = grid.length;
        const key = (x, y) => y * N + x;
        const open = new MinHeap();
        const gScore = new Map();
        const cameFrom = new Map();
        const closed = new Set();
        const startKey = key(sx, sy);
        gScore.set(startKey, 0);
        open.push({ x: sx, y: sy, f: heuristic(sx, sy, gx, gy) });

        while (open.size() > 0) {
            const cur = open.pop();
            const curKey = key(cur.x, cur.y);
            if (cur.x === gx && cur.y === gy) {
                const path = [{ x: cur.x, y: cur.y }];
                let ck = curKey;
                while (cameFrom.has(ck)) {
                    const pk = cameFrom.get(ck);
                    path.unshift({ x: pk % N, y: Math.floor(pk / N) });
                    ck = pk;
                }
                return path;
            }
            if (closed.has(curKey)) continue;
            closed.add(curKey);
            const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            for (let k = 0; k < 4; k++) {
                const nx = cur.x + neighbors[k][0];
                const ny = cur.y + neighbors[k][1];
                if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
                if (grid[ny][nx] === 1) continue;
                const nk = key(nx, ny);
                if (closed.has(nk)) continue;
                const tg = gScore.get(curKey) + 1;
                if (!gScore.has(nk) || tg < gScore.get(nk)) {
                    cameFrom.set(nk, curKey);
                    gScore.set(nk, tg);
                    open.push({ x: nx, y: ny, f: tg + heuristic(nx, ny, gx, gy) });
                }
            }
        }
        return null;
    }

    // ---------- 关卡配置 ----------
    function getLevelConfig(level) {
        const N = Math.min(21 + (level - 1) * 2, 41); // 21 起步, 每关 +2, 上限 41 (均为奇数)
        const monsters = level >= 4 ? 2 : 1;
        const vision = Math.min(5 + Math.floor((level - 1) / 2), 8);
        const moveInterval = Math.max(420 - (level - 1) * 25, 200);
        const portals = level >= 4 ? 1 : 0;       // 第 4 关起有 1 对传送门
        const predict = level >= 5 ? 2 : 0;        // 第 5 关起怪物预判玩家 2 步走位
        // 钥匙需求: 1-2关1把, 3-4关2把, 5关起3把
        const keysNeeded = level <= 2 ? 1 : (level <= 4 ? 2 : 3);
        return { N: N, monsters: monsters, vision: vision, moveInterval: moveInterval, portals: portals, predict: predict, keysNeeded: keysNeeded };
    }

    // ---------- 游戏类 ----------
    class MazeGame {
        constructor() {
            this.canvas = document.getElementById('mazeCanvas');
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.levelEl = document.getElementById('mazeLevel');
            this.timerEl = document.getElementById('mazeTimer');
            this.statusEl = document.getElementById('mazeStatus');
            this.overlay = document.getElementById('mazeOverlay');
            this.overlayTitle = document.getElementById('mazeOverlayTitle');
            this.overlayMsg = document.getElementById('mazeOverlayMsg');
            this.bestLevelEl = document.getElementById('mazeBestLevel');
            this.bestTimeEl = document.getElementById('mazeBestTime');

            this.CELL_SIZE = 0;
            this.N = 21;
            this.level = 1;
            this.grid = null;
            this.player = { x: 1, y: 1 };
            this.exit = { x: 0, y: 0 };
            this.monsters = [];

            // 朝向系统: 玩家和怪物都有朝向, 影响视野锥和闪现方向
            // dir 用 {x, y}: 上{0,-1} 下{0,1} 左{-1,0} 右{1,0}
            this.playerDir = { x: 0, y: 1 }; // 初始朝下
            this.FOV_HALF_ANGLE = Math.PI / 3; // 扇形半角 60° (总 120°)
            this.chaseSpeedMult = 0.7; // 发现玩家后移动间隔 ×0.7 (加速)

            this.showPath = SkyStorage.getInt('skystar:v1:maze:show-path', 1) === 1;
            this.bestLevel = SkyStorage.getInt('skystar:v1:maze:best-level', 0);
            this.bestTime = SkyStorage.getInt('skystar:v1:maze:best-time', 0); // ms, 0 = 无

            this.running = false;
            this.paused = false;
            this.levelStartTime = 0;
            this.elapsed = 0;
            this.graceUntil = 0;
            this.pauseStart = 0;

            // 生命系统: 初始 3 命, 被怪物撞到扣 1, 归零 game over
            this.MAX_LIVES = 3;
            this.lives = this.MAX_LIVES;
            this.invincibleUntil = 0;  // 受伤后的无敌截止时间
            this.livesEl = document.getElementById('mazeLives');

            this.playerMoveInterval = 110; // ms
            this.lastPlayerMove = 0;
            this.heldDir = null;
            this.keys = {};

            this.monsterMoveInterval = 400;
            this.vision = 5;
            this.predict = 0;           // 怪物预判步数 (第 5 关起为 2)
            this.portals = [];          // 传送门对 [{a:{x,y}, b:{x,y}}]

            // 钥匙系统: 出口需收集足够钥匙才能开启
            this.keysNeeded = 1;        // 本关需要的钥匙数
            this.keysCollected = 0;     // 已收集钥匙数
            this.keyPickups = [];       // 地图上的钥匙拾取点 [{x, y}]
            this.exitLocked = true;     // 出口是否锁定 (钥匙够数后解锁)

            this.animId = null;
            this.pulse = 0;

            // ---------- 迷宫主题 (每关随机选择) ----------
            // 每个主题: wall=墙色, wallEdge=墙描边, wallTop=墙顶高光, wallShadow=墙底阴影,
            //           floor=地面色, dot=地面点阵色, footprint=足迹色
            // 固定色 (玩家绿/怪物红/出口金/道具紫青冰蓝橙) 在所有主题下都需清晰可辨
            this.THEMES = [
                { name: '青石地牢', wall: '#1e293b', wallEdge: '#475569', wallTop: '#334155', wallShadow: '#0f172a', floor: '#0f172a', dot: 'rgba(99, 102, 241, 0.18)', footprint: 'rgba(148, 163, 184, 0.5)' },
                { name: '熔岩洞穴', wall: '#3f1d1d', wallEdge: '#7f1d1d', wallTop: '#5b2424', wallShadow: '#1a0a0a', floor: '#1a0f0a', dot: 'rgba(251, 146, 60, 0.22)', footprint: 'rgba(251, 146, 60, 0.55)' },
                { name: '冰封遗迹', wall: '#1e3a5f', wallEdge: '#3b82f6', wallTop: '#2c5282', wallShadow: '#0c1e3a', floor: '#0c1e3a', dot: 'rgba(147, 197, 253, 0.22)', footprint: 'rgba(147, 197, 253, 0.55)' },
                { name: '虚空深渊', wall: '#2e1065', wallEdge: '#6d28d9', wallTop: '#4c1d95', wallShadow: '#0f0a1f', floor: '#0f0a1f', dot: 'rgba(167, 139, 250, 0.22)', footprint: 'rgba(167, 139, 250, 0.55)' }
            ];
            this.currentTheme = this.THEMES[0];
            this.footprints = []; // 玩家走过的格子 [{x, y, life}]

            // ---------- 道具系统 ----------
            // 4 种道具: sprint=闪现, vision=视野, freeze=冻结, decoy=诱饵
            this.ITEM_TYPES = ['sprint', 'vision', 'freeze', 'decoy'];
            this.ITEM_MAX = { sprint: 2, vision: 1, freeze: 1, decoy: 1 };
            this.ITEM_DURATION = { vision: 3000, freeze: 3000, decoy: 3000 };
            this.ITEM_NAMES = { sprint: '闪现', vision: '视野', freeze: '冻结', decoy: '诱饵' };
            // 每种道具的主题色 (核心色 + 辉光色 + rgb 字符串用于粒子), 替代统一的金色脉冲
            this.ITEM_COLORS = {
                sprint: { core: '#a855f7', glow: 'rgba(168, 85, 247, 0.7)', fade: 'rgba(168, 85, 247, 0)', rgbStr: '168,85,247', name: '紫' },
                vision: { core: '#22d3ee', glow: 'rgba(34, 211, 238, 0.7)', fade: 'rgba(34, 211, 238, 0)', rgbStr: '34,211,238', name: '青' },
                freeze: { core: '#7dd3fc', glow: 'rgba(125, 211, 252, 0.7)', fade: 'rgba(125, 211, 252, 0)', rgbStr: '125,211,252', name: '冰蓝' },
                decoy:  { core: '#fb923c', glow: 'rgba(251, 146, 60, 0.7)', fade: 'rgba(251, 146, 60, 0)', rgbStr: '251,146,60', name: '橙' }
            };
            this.items = { sprint: 0, vision: 0, freeze: 0, decoy: 0 }; // 玩家持有数量
            this.pickups = [];            // 地图上的道具拾取点 [{x, y, type, particles:[]}]
            this.activeEffects = {        // 当前生效中的效果
                visionPath: null,         // 视野道具: 到出口的路径数组
                visionUntil: 0,
                freezeUntil: 0,
                decoyPos: null,           // 诱饵道具: 幻影位置
                decoyUntil: 0,
                sprintTrail: []           // 闪现道具: 残影坐标列表 (渐隐)
            };
            this.itemSlots = [
                document.getElementById('mazeSlot0'),
                document.getElementById('mazeSlot1'),
                document.getElementById('mazeSlot2'),
                document.getElementById('mazeSlot3')
            ];

            // ---------- 正反馈系统 ----------
            this.dangerOverlay = document.getElementById('mazeDangerOverlay');
            this.floatTextsEl = document.getElementById('mazeFloatingTexts');
            this.scoreEl = document.getElementById('mazeScore');
            this.minimapCanvas = document.getElementById('mazeMinimap');
            this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
            this.totalScore = SkyStorage.getInt('skystar:v1:maze:totalScore', 0); // 累积总分持久化
            this.levelScore = 0;        // 本关得分
            this.hitsTaken = 0;         // 本关被怪物撞到的次数 (用于无伤判定)
            this.dangerActive = false;  // 险情警示是否激活中
            this.achievements = SkyStorage.getJSON('skystar:v1:maze:achievements', {}); // 成就持久化

            this.init();
        }

        init() {
            this.fitMaze();
            this.updateBestDisplay();
            if (this.scoreEl) this.scoreEl.textContent = this.totalScore;
            this.setupListeners();
            // 生成预览迷宫 (未开始)
            this.level = 1;
            this.prepareLevel(false);
            this.draw();
            // 启动渲染循环 (始终运行, 即便未开始也绘制静态画面)
            this.animId = requestAnimationFrame((t) => this.loop(t));
        }

        // 根据 game-container 可用空间计算 canvas 尺寸和格子大小
        fitMaze() {
            const container = this.canvas.parentElement;
            if (!container) return;
            const cs = getComputedStyle(container);
            const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            const cw = container.clientWidth - padX;
            const ch = container.clientHeight - padY;
            const otherH = this.calcOtherHeight(container);
            const avail = Math.min(cw, ch - otherH);
            const size = Math.max(240, Math.min(avail, 560));
            const N = this.N || 21;
            this.CELL_SIZE = Math.max(1, Math.floor(size / N));
            const pixelSize = this.CELL_SIZE * N;
            this.canvas.width = pixelSize;
            this.canvas.height = pixelSize;
            this.canvas.style.width = pixelSize + 'px';
            this.canvas.style.height = pixelSize + 'px';
        }

        calcOtherHeight(container) {
            let h = 0;
            const children = Array.from(container.children);
            for (let i = 0; i < children.length; i++) {
                const el = children[i];
                if (el === this.canvas) continue;
                if (el === this.overlay) continue;
                if (getComputedStyle(el).position === 'absolute') continue;
                h += el.offsetHeight;
            }
            return h;
        }

        setupListeners() {
            // 键盘控制 (全局监听, 但仅在迷宫游戏激活时生效)
            window.addEventListener('keydown', (e) => {
                if (!this.isGameActive()) return;
                const k = e.key.toLowerCase();
                let dir = null;
                if (k === 'arrowup' || k === 'w') dir = { x: 0, y: -1 };
                else if (k === 'arrowdown' || k === 's') dir = { x: 0, y: 1 };
                else if (k === 'arrowleft' || k === 'a') dir = { x: -1, y: 0 };
                else if (k === 'arrowright' || k === 'd') dir = { x: 1, y: 0 };
                else if (k === ' ') { e.preventDefault(); this.togglePause(); return; }
                else if (k === 'r') { this.restartLevel(); return; }
                else if (k >= '1' && k <= '4') {
                    e.preventDefault();
                    this.useItem(this.ITEM_TYPES[parseInt(k, 10) - 1]);
                    return;
                }
                if (dir) {
                    e.preventDefault();
                    this.keys[k] = true;
                    this.heldDir = dir;
                    // 按方向键即转向 (即使撞墙也更新朝向, 用于视野和闪现)
                    this.playerDir = { x: dir.x, y: dir.y };
                    if (this.running && !this.paused) {
                        this.tryMovePlayer(dir);
                        this.lastPlayerMove = performance.now();
                    }
                }
            });
            window.addEventListener('keyup', (e) => {
                const k = e.key.toLowerCase();
                this.keys[k] = false;
                if (this.heldDir) {
                    const hk = this.heldDir;
                    const stillHeld =
                        (hk.x === 0 && hk.y === -1 && (this.keys['arrowup'] || this.keys['w'])) ||
                        (hk.x === 0 && hk.y === 1 && (this.keys['arrowdown'] || this.keys['s'])) ||
                        (hk.x === -1 && hk.y === 0 && (this.keys['arrowleft'] || this.keys['a'])) ||
                        (hk.x === 1 && hk.y === 0 && (this.keys['arrowright'] || this.keys['d']));
                    if (!stillHeld) this.heldDir = null;
                }
            });

            const startBtn = document.getElementById('mazeStart');
            const pauseBtn = document.getElementById('mazePause');
            const restartBtn = document.getElementById('mazeRestart');
            const overlayBtn = document.getElementById('mazeOverlayBtn');
            const pathToggle = document.getElementById('mazePathToggle');
            if (startBtn) startBtn.addEventListener('click', () => this.start());
            if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());
            if (restartBtn) restartBtn.addEventListener('click', () => this.restartLevel());
            if (overlayBtn) overlayBtn.addEventListener('click', () => this.handleOverlay());
            if (pathToggle) {
                pathToggle.checked = this.showPath;
                pathToggle.addEventListener('change', (e) => {
                    this.showPath = e.target.checked;
                    SkyStorage.setInt('skystar:v1:maze:show-path', this.showPath ? 1 : 0);
                });
            }
        }

        // 仅当迷宫游戏容器处于 active 时才响应键盘
        isGameActive() {
            const gc = this.canvas.closest('.game-container');
            return gc && gc.classList.contains('active');
        }

        // Shell 生命周期: tab 切走时取消 RAF, 切回时重启
        pause() {
            if (this.animId) {
                cancelAnimationFrame(this.animId);
                this.animId = null;
                this._shellPauseStart = performance.now();
            }
        }

        resume() {
            if (!this.animId) {
                // 时间公平: 暂停期间不累计计时 (同 togglePause 逻辑)
                if (this._shellPauseStart) {
                    const pauseDur = performance.now() - this._shellPauseStart;
                    if (this.running && !this.paused) {
                        this.levelStartTime += pauseDur;
                        this.graceUntil += pauseDur;
                        if (this.invincibleUntil) this.invincibleUntil += pauseDur;
                        if (this.activeEffects.visionUntil) this.activeEffects.visionUntil += pauseDur;
                        if (this.activeEffects.freezeUntil) this.activeEffects.freezeUntil += pauseDur;
                        if (this.activeEffects.decoyUntil) this.activeEffects.decoyUntil += pauseDur;
                        this.lastPlayerMove += pauseDur;
                        for (const m of this.monsters) m.lastMove += pauseDur;
                    }
                    this._shellPauseStart = 0;
                }
                this.animId = requestAnimationFrame((t) => this.loop(t));
            }
        }

        updateBestDisplay() {
            if (this.bestLevelEl) this.bestLevelEl.textContent = this.bestLevel;
            if (this.bestTimeEl) this.bestTimeEl.textContent = this.bestTime ? this.fmtTime(this.bestTime) : '--';
        }

        fmtTime(ms) {
            return (ms / 1000).toFixed(1) + 's';
        }

        // 生成关卡迷宫 + 放置玩家/怪物; autoStart=true 时进入运行状态
        prepareLevel(autoStart) {
            const cfg = getLevelConfig(this.level);
            this.N = cfg.N;
            this.grid = generateMaze(cfg.N);
            this.player = { x: 1, y: 1 };
            this.exit = { x: cfg.N - 2, y: cfg.N - 2 };
            this.monsters = [];
            this.monsterMoveInterval = cfg.moveInterval;
            this.vision = cfg.vision;
            this.predict = cfg.predict;
            for (let i = 0; i < cfg.monsters; i++) {
                const pos = this.farSpawn(cfg.N, i);
                this.monsters.push({
                    x: pos.x, y: pos.y,
                    lastMove: 0,
                    path: null,
                    patrolTarget: null,
                    dir: { x: 0, y: 1 },     // 朝向, 初始朝下
                    alerted: false            // 是否发现玩家 (加速追击状态)
                });
            }
            // 传送门: 第 4 关起生成 1 对
            this.portals = cfg.portals > 0 ? this.spawnPortals(cfg.N) : [];
            // 钥匙: 按关卡需求生成, 散布在地图不同区域, 出口初始锁定
            this.keysNeeded = cfg.keysNeeded;
            this.keysCollected = 0;
            this.keyPickups = this.spawnKeys(cfg.N, cfg.keysNeeded);
            this.exitLocked = cfg.keysNeeded > 0;
            this.updateKeyDisplay();
            // 每关随机选一个迷宫主题
            this.currentTheme = this.THEMES[Math.floor(Math.random() * this.THEMES.length)];
            // 重置足迹
            this.footprints = [];
            // 重置本关得分和被撞次数
            this.levelScore = 0;
            this.hitsTaken = 0;
            // 每关回满生命 (关卡制: 每关独立挑战)
            this.lives = this.MAX_LIVES;
            this.invincibleUntil = 0;
            this.updateLivesDisplay();
            this.setDangerState(false);
            // 重置道具系统
            this.items = { sprint: 0, vision: 0, freeze: 0, decoy: 0 };
            this.pickups = this.spawnPickups(cfg.N);
            this.activeEffects = {
                visionPath: null, visionUntil: 0,
                freezeUntil: 0, decoyPos: null, decoyUntil: 0,
                sprintTrail: []
            };
            this.updateItemUI();

            this.fitMaze();
            this.levelStartTime = performance.now();
            this.elapsed = 0;
            this.graceUntil = this.levelStartTime + 1500;
            this.heldDir = null;
            this.keys = {};
            if (this.levelEl) this.levelEl.textContent = this.level;
            if (this.timerEl) this.timerEl.textContent = '0.0s';
            if (autoStart) {
                this.running = true;
                this.paused = false;
                this.setStatus('GO!', 'status-go');
            }
        }

        // 在远离玩家和怪物的可达路径上生成 2-3 个道具拾取点
        spawnPickups(N) {
            const count = 2 + Math.floor(Math.random() * 2); // 2-3 个
            const pickups = [];
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] !== 0) continue;
                    // 排除起点和出口
                    if (x === 1 && y === 1) continue;
                    if (x === this.exit.x && y === this.exit.y) continue;
                    // 排除离玩家太近的格子
                    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) < N * 0.2) continue;
                    // 排除离怪物太近的格子
                    let nearMonster = false;
                    for (let i = 0; i < this.monsters.length; i++) {
                        if (Math.abs(x - this.monsters[i].x) + Math.abs(y - this.monsters[i].y) < 4) {
                            nearMonster = true; break;
                        }
                    }
                    if (nearMonster) continue;
                    candidates.push({ x: x, y: y });
                }
            }
            // 随机抽取 count 个位置, 每个随机分配道具类型
            for (let i = 0; i < count && candidates.length > 0; i++) {
                const idx = Math.floor(Math.random() * candidates.length);
                const pos = candidates.splice(idx, 1)[0];
                const type = this.ITEM_TYPES[Math.floor(Math.random() * this.ITEM_TYPES.length)];
                pickups.push({ x: pos.x, y: pos.y, type: type, particles: [], spawnTime: performance.now() });
            }
            return pickups;
        }

        start() {
            this.level = 1;
            this.hideOverlay();
            this.prepareLevel(true);
        }

        restartLevel() {
            this.hideOverlay();
            this.prepareLevel(true);
        }

        // 在远离玩家的可达路径点刷新怪物
        farSpawn(N, idx) {
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] === 0) {
                        const d = Math.abs(x - this.player.x) + Math.abs(y - this.player.y);
                        if (d > N * 0.5) candidates.push({ x: x, y: y, d: d });
                    }
                }
            }
            if (candidates.length === 0) return { x: N - 2, y: N - 2 };
            candidates.sort((a, b) => b.d - a.d);
            const top = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.25)));
            const pick = top[(Math.floor(Math.random() * top.length) + idx) % top.length];
            return { x: pick.x, y: pick.y };
        }

        togglePause() {
            if (!this.running) return;
            this.paused = !this.paused;
            if (this.paused) {
                this.pauseStart = performance.now();
                this.setStatus('PAUSED', 'status-pause');
            } else {
                // 暂停期间不累计时间: 关卡计时、保护期、道具效果到期时间都顺延
                const pauseDur = performance.now() - this.pauseStart;
                this.levelStartTime += pauseDur;
                this.graceUntil += pauseDur;
                if (this.invincibleUntil) this.invincibleUntil += pauseDur;
                if (this.activeEffects.visionUntil) this.activeEffects.visionUntil += pauseDur;
                if (this.activeEffects.freezeUntil) this.activeEffects.freezeUntil += pauseDur;
                if (this.activeEffects.decoyUntil) this.activeEffects.decoyUntil += pauseDur;
                this.setStatus('GO!', 'status-go');
            }
        }

        setStatus(text, cls) {
            if (this.statusEl) {
                this.statusEl.textContent = text;
                this.statusEl.className = 'maze-status ' + cls;
            }
        }

        tryMovePlayer(dir) {
            const nx = this.player.x + dir.x;
            const ny = this.player.y + dir.y;
            if (nx < 0 || nx >= this.N || ny < 0 || ny >= this.N) return;
            if (this.grid[ny][nx] === 1) return; // 撞墙不移动
            // 更新玩家朝向 (移动方向)
            this.playerDir = { x: dir.x, y: dir.y };
            this.player.x = nx;
            this.player.y = ny;
            this.addFootprint(nx, ny);
            // 传送门: 踩到入口传送到配对入口 (一次移动只传送一次, 避免死循环)
            this.checkPortalTransport();
            // 检查是否踩到道具拾取点
            for (let i = 0; i < this.pickups.length; i++) {
                const p = this.pickups[i];
                if (p.x === this.player.x && p.y === this.player.y) {
                    const color = this.ITEM_COLORS[p.type];
                    if (this.items[p.type] < this.ITEM_MAX[p.type]) {
                        this.items[p.type]++;
                        this.updateItemUI();
                        this.spawnFloatText(this.player.x, this.player.y, '+1 ' + this.ITEM_NAMES[p.type], color.core);
                        this.levelScore += 50; // 拾取道具奖励分
                    } else {
                        // 已满额, 提示但不得分
                        this.spawnFloatText(this.player.x, this.player.y, '已满', '#94a3b8');
                    }
                    this.pickups.splice(i, 1);
                    break;
                }
            }
            // 钥匙拾取
            this.checkKeyPickup();
            // 到达出口: 需解锁才能通关
            if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
                if (this.exitLocked) {
                    // 出口锁定, 提示需要钥匙
                    this.spawnFloatText(this.player.x, this.player.y, '需要钥匙', '#f87171');
                } else {
                    this.onLevelClear();
                }
            }
        }

        // 在格子位置 (相对迷宫坐标) 上浮一行文字, 1 秒渐隐
        spawnFloatText(gridX, gridY, text, color) {
            if (!this.floatTextsEl) return;
            const cs = this.CELL_SIZE;
            const canvasRect = this.canvas.getBoundingClientRect();
            const containerRect = this.floatTextsEl.getBoundingClientRect();
            // 格子中心相对 floatTextsEl 的位置
            const px = (gridX * cs + cs / 2 + canvasRect.left) - containerRect.left;
            const py = (gridY * cs + cs / 2 + canvasRect.top) - containerRect.top;
            const el = document.createElement('div');
            el.className = 'maze-float-text';
            el.textContent = text;
            el.style.color = color;
            el.style.left = px + 'px';
            el.style.top = py + 'px';
            this.floatTextsEl.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
        }

        // 险情警示开关: 怪物进入 2 格范围时激活
        setDangerState(active) {
            if (this.dangerActive === active) return;
            this.dangerActive = active;
            if (this.dangerOverlay) {
                if (active) this.dangerOverlay.classList.add('active');
                else this.dangerOverlay.classList.remove('active');
            }
        }

        // 检查险情: 任意怪物与玩家曼哈顿距离 <= 2 时触发
        checkDanger() {
            let danger = false;
            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                if (Math.abs(m.x - this.player.x) + Math.abs(m.y - this.player.y) <= 2) {
                    danger = true;
                    break;
                }
            }
            this.setDangerState(danger);
        }

        // 记录玩家走过的格子 (用于绘制足迹, 3 秒渐隐)
        addFootprint(x, y) {
            // 同一格不重复记录, 只刷新 life
            for (let i = 0; i < this.footprints.length; i++) {
                if (this.footprints[i].x === x && this.footprints[i].y === y) {
                    this.footprints[i].life = 1;
                    return;
                }
            }
            this.footprints.push({ x: x, y: y, life: 1 });
        }

        // 扇形视野检测: 玩家是否在怪物朝向的视野锥内
        // 朝向方向 + vision 格距离 + 120° 扇形角, 且需有视线 (无墙阻挡)
        isInMonsterFOV(m) {
            const dx = this.player.x - m.x;
            const dy = this.player.y - m.y;
            const dist = Math.abs(dx) + Math.abs(dy); // 曼哈顿距离
            if (dist > this.vision) return false;
            if (dist === 0) return true;
            // 计算玩家相对怪物的角度, 与怪物朝向的夹角
            const angleToPlayer = Math.atan2(dy, dx);
            const angleFacing = Math.atan2(m.dir.y, m.dir.x);
            let diff = Math.abs(angleToPlayer - angleFacing);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff > this.FOV_HALF_ANGLE) return false;
            // 视线检查: 怪物到玩家之间不能有墙 (Bresenham 简化版, 逐格检查)
            return this.hasLineOfSight(m.x, m.y, this.player.x, this.player.y);
        }

        // 视线检查: 两点之间是否有墙阻挡 (简单线性插值逐格)
        hasLineOfSight(x0, y0, x1, y1) {
            const dx = x1 - x0;
            const dy = y1 - y0;
            const steps = Math.max(Math.abs(dx), Math.abs(dy));
            if (steps === 0) return true;
            for (let i = 1; i < steps; i++) {
                const x = Math.round(x0 + (dx * i) / steps);
                const y = Math.round(y0 + (dy * i) / steps);
                if (this.grid[y] && this.grid[y][x] === 1) return false;
            }
            return true;
        }

        updateMonsters(now) {
            if (now < this.graceUntil) return; // 保护期内怪物不动
            // 冻结效果: 所有怪物静止
            const frozen = now < this.activeEffects.freezeUntil;
            if (frozen) return;
            // 保护期刚结束时怪物逐渐加速: 前 1 秒移动间隔 ×2 (慢启动), 之后恢复正常
            const graceEnd = this.graceUntil;
            const rampDuration = 1000;
            const baseInterval = (now < graceEnd + rampDuration)
                ? this.monsterMoveInterval * 2
                : this.monsterMoveInterval;
            // 玩家无敌期内怪物改用巡逻 (不追击, 给玩家喘息)
            const playerInvincible = now < this.invincibleUntil;
            const decoyActive = now < this.activeEffects.decoyUntil && this.activeEffects.decoyPos;

            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                // 发现玩家: 进入警戒状态 (加速追击)
                const canSeePlayer = !playerInvincible && this.isInMonsterFOV(m);
                if (canSeePlayer) {
                    m.alerted = true;
                    m.alertedUntil = now + 2500; // 脱离视野后仍追击 2.5 秒
                } else if (m.alerted && now > m.alertedUntil) {
                    m.alerted = false; // 警戒超时, 回到巡逻
                }
                // 警戒状态移动加速 (间隔 ×0.7)
                const currentInterval = m.alerted ? baseInterval * this.chaseSpeedMult : baseInterval;
                if (now - m.lastMove < currentInterval) continue;
                m.lastMove = now;

                // 决定追击目标
                let target;
                if (decoyActive) {
                    target = this.activeEffects.decoyPos;
                    m.patrolTarget = null;
                } else if (playerInvincible) {
                    // 玩家无敌: 怪物巡逻
                    if (!m.patrolTarget || (m.x === m.patrolTarget.x && m.y === m.patrolTarget.y)) {
                        m.patrolTarget = this.randomPatrolTarget();
                    }
                    target = m.patrolTarget;
                } else if (m.alerted) {
                    // 警戒中: 追玩家 (第 5 关起预判走位)
                    target = this.predictPlayerPosition(this.predict);
                    m.patrolTarget = null;
                } else {
                    // 未警戒: 巡逻
                    if (!m.patrolTarget || (m.x === m.patrolTarget.x && m.y === m.patrolTarget.y)) {
                        m.patrolTarget = this.randomPatrolTarget();
                    }
                    target = m.patrolTarget;
                }
                const path = astar(this.grid, m.x, m.y, target.x, target.y);
                m.path = path;
                if (path && path.length > 1) {
                    let next = path[1];
                    // 避免两只怪物叠在一起: 下一步被同伴占据则尝试侧移
                    const occupied = this.monsters.some((o, j) => j !== i && o.x === next.x && o.y === next.y);
                    if (occupied) {
                        const alts = [[0, -1], [1, 0], [0, 1], [-1, 0]];
                        for (let a = 0; a < alts.length; a++) {
                            const ax = m.x + alts[a][0], ay = m.y + alts[a][1];
                            if (ax < 0 || ax >= this.N || ay < 0 || ay >= this.N) continue;
                            if (this.grid[ay][ax] === 1) continue;
                            if (this.monsters.some((o, j) => j !== i && o.x === ax && o.y === ay)) continue;
                            next = { x: ax, y: ay };
                            break;
                        }
                    }
                    // 更新朝向: 仅在移动方向改变时转向 (巡逻直行保持朝向不变)
                    const moveDx = next.x - m.x;
                    const moveDy = next.y - m.y;
                    if (moveDx !== m.dir.x || moveDy !== m.dir.y) {
                        m.dir = { x: moveDx, y: moveDy };
                    }
                    m.x = next.x;
                    m.y = next.y;
                }
                // 碰撞玩家: 扣 1 生命, 触发无敌; 生命归零才 game over
                if (m.x === this.player.x && m.y === this.player.y) {
                    this.onPlayerHit(m);
                    return;
                }
            }
        }

        randomPatrolTarget() {
            const N = this.N;
            for (let tries = 0; tries < 20; tries++) {
                const x = 1 + Math.floor(Math.random() * (N - 2));
                const y = 1 + Math.floor(Math.random() * (N - 2));
                if (this.grid[y][x] === 0) return { x: x, y: y };
            }
            return { x: this.exit.x, y: this.exit.y };
        }

        // 预判玩家未来 N 步位置: 按当前移动方向推演, 撞墙则停在墙前
        // predict=0 时返回当前位置 (即不预判)
        predictPlayerPosition(steps) {
            if (steps <= 0 || !this.heldDir) return { x: this.player.x, y: this.player.y };
            let px = this.player.x, py = this.player.y;
            for (let s = 0; s < steps; s++) {
                const nx = px + this.heldDir.x;
                const ny = py + this.heldDir.y;
                if (nx < 0 || nx >= this.N || ny < 0 || ny >= this.N) break;
                if (this.grid[ny][nx] === 1) break; // 撞墙停止预判
                px = nx; py = ny;
            }
            return { x: px, y: py };
        }

        // 生成 1 对传送门: 两个入口分处迷宫不同区域, 踩入一个从另一个出来
        spawnPortals(N) {
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] !== 0) continue;
                    if (x === 1 && y === 1) continue;                       // 排除起点
                    if (x === this.exit.x && y === this.exit.y) continue;   // 排除出口
                    // 排除离玩家太近
                    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) < 3) continue;
                    candidates.push({ x: x, y: y });
                }
            }
            if (candidates.length < 2) return [];
            // 随机选两个距离较远的点作为传送门对
            const a = candidates[Math.floor(Math.random() * candidates.length)];
            let bestB = null, bestDist = 0;
            for (let i = 0; i < candidates.length; i++) {
                const c = candidates[i];
                if (c.x === a.x && c.y === a.y) continue;
                const d = Math.abs(c.x - a.x) + Math.abs(c.y - a.y);
                if (d > bestDist) { bestDist = d; bestB = c; }
            }
            if (!bestB) return [];
            return [{ a: a, b: bestB }];
        }

        // 玩家踩到传送门时传送到配对入口
        checkPortalTransport() {
            for (let i = 0; i < this.portals.length; i++) {
                const p = this.portals[i];
                if (this.player.x === p.a.x && this.player.y === p.a.y) {
                    this.player.x = p.b.x; this.player.y = p.b.y;
                    this.addFootprint(this.player.x, this.player.y);
                    return true;
                } else if (this.player.x === p.b.x && this.player.y === p.b.y) {
                    this.player.x = p.a.x; this.player.y = p.a.y;
                    this.addFootprint(this.player.x, this.player.y);
                    return true;
                }
            }
            return false;
        }

        // 生成钥匙: 散布在迷宫不同区域 (彼此距离尽量远, 远离起点和出口)
        spawnKeys(N, count) {
            const keys = [];
            const candidates = [];
            for (let y = 1; y < N - 1; y++) {
                for (let x = 1; x < N - 1; x++) {
                    if (this.grid[y][x] !== 0) continue;
                    if (x === 1 && y === 1) continue;                       // 排除起点
                    if (x === this.exit.x && y === this.exit.y) continue;   // 排除出口
                    // 排除离玩家太近
                    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) < N * 0.15) continue;
                    candidates.push({ x: x, y: y });
                }
            }
            if (candidates.length < count) count = candidates.length;
            // 每次选离已选钥匙最远的候选点, 保证钥匙分散
            for (let i = 0; i < count; i++) {
                if (candidates.length === 0) break;
                let pickIdx = 0;
                if (keys.length > 0) {
                    let bestMinDist = -1;
                    for (let j = 0; j < candidates.length; j++) {
                        let minDist = Infinity;
                        for (let k = 0; k < keys.length; k++) {
                            const d = Math.abs(candidates[j].x - keys[k].x) + Math.abs(candidates[j].y - keys[k].y);
                            if (d < minDist) minDist = d;
                        }
                        if (minDist > bestMinDist) { bestMinDist = minDist; pickIdx = j; }
                    }
                } else {
                    pickIdx = Math.floor(Math.random() * candidates.length);
                }
                keys.push({ x: candidates[pickIdx].x, y: candidates[pickIdx].y });
                candidates.splice(pickIdx, 1);
            }
            return keys;
        }

        // 玩家踩到钥匙时拾取
        checkKeyPickup() {
            for (let i = this.keyPickups.length - 1; i >= 0; i--) {
                const k = this.keyPickups[i];
                if (k.x === this.player.x && k.y === this.player.y) {
                    this.keyPickups.splice(i, 1);
                    this.keysCollected++;
                    this.spawnFloatText(this.player.x, this.player.y, '钥匙 +1', '#fbbf24');
                    this.levelScore += 80; // 钥匙比普通道具分高
                    this.updateKeyDisplay();
                    // 集齐钥匙: 解锁出口
                    if (this.keysCollected >= this.keysNeeded && this.exitLocked) {
                        this.exitLocked = false;
                        this.spawnFloatText(this.exit.x, this.exit.y, '出口已解锁!', '#4ade80');
                    }
                    break;
                }
            }
        }

        updateKeyDisplay() {
            // 复用 statusEl 旁边显示, 通过 title 属性或直接在状态栏体现
            // 这里用 status 元素在 READY/GO 状态下附加钥匙信息
            if (!this.statusEl) return;
            if (this.exitLocked) {
                // 还在锁着, 状态文字带上钥匙进度
                if (this.running && !this.paused) {
                    this.statusEl.textContent = '钥匙 ' + this.keysCollected + '/' + this.keysNeeded;
                    this.statusEl.className = 'maze-status status-pause'; // 黄色提示
                }
            } else {
                if (this.running && !this.paused) {
                    this.statusEl.textContent = 'GO!';
                    this.statusEl.className = 'maze-status status-go';
                }
            }
        }

        // 玩家被怪物撞到: 扣 1 生命, 触发 1.5s 无敌, 击退怪物
        onPlayerHit(monster) {
            // 无敌期内不再受伤
            if (performance.now() < this.invincibleUntil) return;
            this.lives--;
            this.hitsTaken++;
            this.updateLivesDisplay();
            this.spawnFloatText(this.player.x, this.player.y, '-1 ❤', '#ef4444');
            if (this.lives <= 0) {
                this.onGameOver();
                return;
            }
            // 1.5 秒无敌期
            this.invincibleUntil = performance.now() + 1500;
            // 击退怪物到相邻可达格子 (远离玩家方向), 避免连续撞击
            const dx = monster.x - this.player.x;
            const dy = monster.y - this.player.y;
            const kickDirs = [];
            if (dx !== 0) kickDirs.push({ x: Math.sign(dx), y: 0 });
            if (dy !== 0) kickDirs.push({ x: 0, y: Math.sign(dy) });
            kickDirs.push({ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 });
            for (let k = 0; k < kickDirs.length; k++) {
                const kx = monster.x + kickDirs[k].x;
                const ky = monster.y + kickDirs[k].y;
                if (kx < 0 || kx >= this.N || ky < 0 || ky >= this.N) continue;
                if (this.grid[ky][kx] === 1) continue;
                if (kx === this.player.x && ky === this.player.y) continue;
                monster.x = kx;
                monster.y = ky;
                break;
            }
            // 重置怪物移动计时, 给玩家喘息空间
            monster.lastMove = performance.now();
            monster.path = null;
        }

        updateLivesDisplay() {
            if (!this.livesEl) return;
            let txt = '';
            for (let i = 0; i < this.MAX_LIVES; i++) {
                txt += i < this.lives ? '❤' : '🖤';
            }
            this.livesEl.textContent = txt;
            // 仅剩 1 命时红色脉冲警示
            if (this.lives <= 1) this.livesEl.classList.add('low');
            else this.livesEl.classList.remove('low');
        }

        onLevelClear() {
            this.running = false;
            this.setDangerState(false);
            const time = performance.now() - this.levelStartTime;
            if (this.bestTime === 0 || time < this.bestTime) {
                this.bestTime = Math.floor(time);
                SkyStorage.setInt('skystar:v1:maze:best-time', this.bestTime);
            }
            if (this.level > this.bestLevel) {
                this.bestLevel = this.level;
                SkyStorage.setInt('skystar:v1:maze:best-level', this.level);
            }
            this.updateBestDisplay();
            this.setStatus('CLEAR!', 'status-clear');

            // 得分计算: 基础分 + 速度奖励 + 道具奖励 + 无伤奖励
            const baseScore = 100 * this.level;
            const speedBonus = Math.max(0, 500 - Math.floor(time / 100)); // 越快越高, 上限 500
            const itemBonus = this.levelScore; // 拾取道具累计的分 (每个 50)
            const noHitBonus = (this.hitsTaken === 0) ? 200 : 0;
            const earned = baseScore + speedBonus + itemBonus + noHitBonus;
            this.totalScore += earned;
            SkyStorage.setInt('skystar:v1:maze:totalScore', this.totalScore);
            this.flashScore();

            // 成就判定
            this.checkAchievements({ time: time, noHit: this.hitsTaken === 0, level: this.level });

            const detail = '用时 ' + this.fmtTime(time) + ' · 得分 +' + earned +
                (noHitBonus > 0 ? ' · 无伤!' : '');
            this.showOverlay('level-clear', '第 ' + this.level + ' 关通关！', detail, '下一关');
        }

        onGameOver() {
            this.running = false;
            this.setDangerState(false);
            this.setStatus('CAUGHT!', 'status-caught');
            this.showOverlay('game-over', '生命耗尽！', '你到达了第 ' + this.level + ' 关', '重新开始');
        }

        // 分数变化时高亮动画
        flashScore() {
            if (this.scoreEl) {
                this.scoreEl.textContent = this.totalScore;
                this.scoreEl.classList.remove('score-flash');
                // 触发 reflow 让动画重新播放
                void this.scoreEl.offsetWidth;
                this.scoreEl.classList.add('score-flash');
            }
        }

        // 成就判定: 首通/速通(单关<10s)/无伤通关/达到第5关/总分1000
        checkAchievements(ctx) {
            const list = [
                { key: 'firstClear', cond: () => true, name: '初次通关', desc: '完成第 1 关' },
                { key: 'speedRun', cond: () => ctx.time < 10000, name: '速通大师', desc: '单关用时 < 10 秒' },
                { key: 'noHit', cond: () => ctx.noHit, name: '无伤通关', desc: '单关未被怪物碰到' },
                { key: 'reach5', cond: () => ctx.level >= 5, name: '迷宫行者', desc: '到达第 5 关' },
                { key: 'score1k', cond: () => this.totalScore >= 1000, name: '千分玩家', desc: '总分达到 1000' }
            ];
            let unlocked = [];
            for (let i = 0; i < list.length; i++) {
                const a = list[i];
                if (!this.achievements[a.key] && a.cond()) {
                    this.achievements[a.key] = { name: a.name, desc: a.desc, time: Date.now() };
                    unlocked.push(a);
                }
            }
            if (unlocked.length > 0) {
                SkyStorage.setJSON('skystar:v1:maze:achievements', this.achievements);
                // 在画面中央显示成就解锁浮字
                if (this.floatTextsEl && this.canvas) {
                    const cx = this.canvas.offsetLeft + this.canvas.width / 2;
                    const cy = this.canvas.offsetTop + 40;
                    for (let i = 0; i < unlocked.length; i++) {
                        setTimeout(((a) => () => {
                            this.spawnFloatTextAt(cx, cy + i * 24, '成就解锁: ' + a.name, '#facc15');
                        })(unlocked[i]), i * 600);
                    }
                }
            }
        }

        // 在像素坐标 (相对容器) 上浮文字
        spawnFloatTextAt(px, py, text, color) {
            if (!this.floatTextsEl) return;
            const el = document.createElement('div');
            el.className = 'maze-float-text';
            el.textContent = text;
            el.style.color = color;
            el.style.left = px + 'px';
            el.style.top = py + 'px';
            this.floatTextsEl.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
        }

        // 小地图: 缩略绘制全图 (墙/出口/玩家/怪物), 放在 HUD 栏内不挡游戏 canvas
        drawMinimap() {
            const ctx = this.minimapCtx;
            if (!ctx || !this.grid) return;
            const mw = this.minimapCanvas.width;
            const mh = this.minimapCanvas.height;
            const N = this.N;
            const s = Math.min(mw, mh) / N; // 每格像素
            // 清空
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(0, 0, mw, mh);
            // 墙
            ctx.fillStyle = this.currentTheme.wallEdge;
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    if (this.grid[y][x] === 1) {
                        ctx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
                    }
                }
            }
            // 出口 (锁定=灰色, 解锁=金色)
            ctx.fillStyle = this.exitLocked ? '#64748b' : '#facc15';
            ctx.fillRect(this.exit.x * s, this.exit.y * s, Math.max(2, s), Math.max(2, s));
            // 钥匙 (亮黄色, 略大)
            ctx.fillStyle = '#fbbf24';
            for (let i = 0; i < this.keyPickups.length; i++) {
                const k = this.keyPickups[i];
                ctx.fillRect(k.x * s - 0.5, k.y * s - 0.5, Math.max(3, s + 1), Math.max(3, s + 1));
            }
            // 传送门 (紫色)
            ctx.fillStyle = '#a855f7';
            for (let i = 0; i < this.portals.length; i++) {
                const p = this.portals[i];
                ctx.fillRect(p.a.x * s, p.a.y * s, Math.max(2, s), Math.max(2, s));
                ctx.fillRect(p.b.x * s, p.b.y * s, Math.max(2, s), Math.max(2, s));
            }
            // 怪物 (红色)
            ctx.fillStyle = '#ef4444';
            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                ctx.fillRect(m.x * s, m.y * s, Math.max(2, s), Math.max(2, s));
            }
            // 玩家 (绿色, 略大一点突出)
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(this.player.x * s - 0.5, this.player.y * s - 0.5, Math.max(3, s + 1), Math.max(3, s + 1));
        }

        showOverlay(type, title, msg, btnText) {
            this.overlay.dataset.type = type;
            if (this.overlayTitle) this.overlayTitle.textContent = title;
            if (this.overlayMsg) this.overlayMsg.textContent = msg;
            const btn = document.getElementById('mazeOverlayBtn');
            if (btn) btn.textContent = btnText;
            this.overlay.classList.add('visible');
        }

        hideOverlay() {
            this.overlay.classList.remove('visible');
        }

        handleOverlay() {
            const type = this.overlay.dataset.type;
            this.hideOverlay();
            if (type === 'level-clear') {
                this.level++;
                this.prepareLevel(true);
            } else {
                this.start();
            }
        }

        // ---------- 主循环 ----------
        loop(now) {
            this.pulse = (this.pulse + 0.05) % (Math.PI * 2);

            if (this.running && !this.paused) {
                this.elapsed = now - this.levelStartTime;
                if (this.timerEl) this.timerEl.textContent = this.fmtTime(this.elapsed);
                // 玩家持续移动 (按住方向键)
                if (this.heldDir && now - this.lastPlayerMove > this.playerMoveInterval) {
                    this.tryMovePlayer(this.heldDir);
                    this.lastPlayerMove = now;
                }
                this.updateMonsters(now);
                // 险情警示检查 (怪物贴近玩家时画面边缘红色脉冲)
                this.checkDanger();
                // 钥匙进度状态刷新 (拾取后状态文字变化)
                this.updateKeyDisplay();
                // 闪现残影衰减
                if (this.activeEffects.sprintTrail.length > 0) {
                    this.activeEffects.sprintTrail = this.activeEffects.sprintTrail
                        .map(t => ({ x: t.x, y: t.y, life: t.life - 0.05 }))
                        .filter(t => t.life > 0);
                }
                // 足迹衰减 (约 3 秒消失, 按 60fps 每帧 -0.0055)
                if (this.footprints.length > 0) {
                    for (let i = this.footprints.length - 1; i >= 0; i--) {
                        this.footprints[i].life -= 0.0055;
                        if (this.footprints[i].life <= 0) this.footprints.splice(i, 1);
                    }
                }
                // 视野效果到期清除
                if (this.activeEffects.visionPath && now > this.activeEffects.visionUntil) {
                    this.activeEffects.visionPath = null;
                }
                // 诱饵效果到期清除
                if (this.activeEffects.decoyPos && now > this.activeEffects.decoyUntil) {
                    this.activeEffects.decoyPos = null;
                }
            }
            this.draw();
            this.drawMinimap();
            this.animId = requestAnimationFrame((t) => this.loop(t));
        }

        // ---------- 绘制 ----------
        draw() {
            const ctx = this.ctx;
            const cs = this.CELL_SIZE;
            const N = this.N;
            if (!this.grid || cs <= 0) return;
            const theme = this.currentTheme;

            // 背景 (地面色铺底)
            ctx.fillStyle = theme.floor;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // 地面点阵纹理 (每格中心一个小点, 提供空间参照)
            ctx.fillStyle = theme.dot;
            const dotR = Math.max(0.8, cs * 0.05);
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    if (this.grid[y][x] === 0) {
                        ctx.beginPath();
                        ctx.arc(x * cs + cs / 2, y * cs + cs / 2, dotR, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // 玩家足迹 (走过的格子, 3 秒渐隐)
            for (let i = 0; i < this.footprints.length; i++) {
                const f = this.footprints[i];
                const alpha = f.life * 0.4;
                ctx.fillStyle = theme.footprint.replace(/[\d.]+\)$/, alpha.toFixed(3) + ')');
                ctx.fillRect(f.x * cs + cs * 0.2, f.y * cs + cs * 0.2, cs * 0.6, cs * 0.6);
            }

            // 墙 (带立体感: 主体 + 顶高光 + 底阴影)
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    if (this.grid[y][x] === 1) {
                        const px = x * cs, py = y * cs;
                        // 主体
                        ctx.fillStyle = theme.wall;
                        ctx.fillRect(px, py, cs, cs);
                        // 描边
                        ctx.strokeStyle = theme.wallEdge;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
                        // 顶高光 (上方 1px 浅色, 模拟顶面受光)
                        ctx.fillStyle = theme.wallTop;
                        ctx.fillRect(px, py, cs, Math.max(1, cs * 0.12));
                        // 底阴影 (下方 1px 深色, 模拟投影)
                        ctx.fillStyle = theme.wallShadow;
                        ctx.fillRect(px, py + cs - Math.max(1, cs * 0.12), cs, Math.max(1, cs * 0.12));
                    }
                }
            }

            // 出口 (旋转光环)
            this.drawExit(ctx, cs);

            // 道具拾取点 (金色脉冲方块)
            this.drawPickups(ctx, cs);

            // 传送门 (成对漩涡, 紫色)
            this.drawPortals(ctx, cs);

            // 钥匙 (金色发光, 浮动)
            this.drawKeys(ctx, cs);

            // 怪物视野锥 (扇形, 朝向 m.dir, 警戒时变红更亮)
            for (let i = 0; i < this.monsters.length; i++) {
                const m = this.monsters[i];
                const cx = m.x * cs + cs / 2;
                const cy = m.y * cs + cs / 2;
                const facing = Math.atan2(m.dir.y, m.dir.x);
                const radius = this.vision * cs;
                // 警戒状态视野锥更亮 (红橙色), 巡逻时暗红
                const alpha = m.alerted ? 0.18 : 0.08;
                const color = m.alerted ? '239, 68, 68' : '239, 68, 68';
                ctx.fillStyle = 'rgba(' + color + ', ' + alpha + ')';
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, radius, facing - this.FOV_HALF_ANGLE, facing + this.FOV_HALF_ANGLE);
                ctx.closePath();
                ctx.fill();
                // 警戒时加描边突出
                if (m.alerted) {
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            // A* 寻路路径可视化
            if (this.showPath) {
                for (let i = 0; i < this.monsters.length; i++) {
                    const path = this.monsters[i].path;
                    if (path && path.length > 1) {
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
                        for (let p = 1; p < path.length; p++) {
                            ctx.beginPath();
                            ctx.arc(path[p].x * cs + cs / 2, path[p].y * cs + cs / 2, Math.max(1, cs * 0.12), 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
            }

            // 视野道具: 高亮到出口的路径 (淡黄色虚线)
            if (this.activeEffects.visionPath) {
                const path = this.activeEffects.visionPath;
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
                ctx.lineWidth = Math.max(2, cs * 0.15);
                ctx.setLineDash([cs * 0.3, cs * 0.2]);
                ctx.beginPath();
                ctx.moveTo(path[0].x * cs + cs / 2, path[0].y * cs + cs / 2);
                for (let p = 1; p < path.length; p++) {
                    ctx.lineTo(path[p].x * cs + cs / 2, path[p].y * cs + cs / 2);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 闪现残影 (渐隐玩家轮廓)
            for (let i = 0; i < this.activeEffects.sprintTrail.length; i++) {
                const t = this.activeEffects.sprintTrail[i];
                ctx.fillStyle = 'rgba(34, 197, 94, ' + (t.life * 0.4) + ')';
                ctx.beginPath();
                ctx.arc(t.x * cs + cs / 2, t.y * cs + cs / 2, Math.max(2, cs * 0.3), 0, Math.PI * 2);
                ctx.fill();
            }

            // 诱饵幻影 (半透明玩家轮廓)
            if (this.activeEffects.decoyPos) {
                const dx = this.activeEffects.decoyPos.x * cs + cs / 2;
                const dy = this.activeEffects.decoyPos.y * cs + cs / 2;
                const r = Math.max(2, cs * 0.35);
                ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
                ctx.beginPath();
                ctx.arc(dx, dy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(187, 247, 208, 0.6)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 玩家
            this.drawPlayer(ctx, cs);
            // 怪物 (含冻结状态视觉)
            for (let i = 0; i < this.monsters.length; i++) this.drawMonster(ctx, cs, this.monsters[i]);

            // 保护期闪烁提示
            const now = performance.now();
            if (this.running && now < this.graceUntil) {
                const alpha = 0.12 + 0.12 * Math.sin(now / 80);
                ctx.fillStyle = 'rgba(34, 197, 94, ' + alpha + ')';
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }

        drawExit(ctx, cs) {
            const x = this.exit.x * cs + cs / 2;
            const y = this.exit.y * cs + cs / 2;
            const r = Math.max(2, cs * 0.4);
            if (this.exitLocked) {
                // 锁定状态: 灰色 + 锁图标, 提示需要钥匙
                ctx.fillStyle = 'rgba(100, 116, 139, 0.25)';
                ctx.beginPath();
                ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
                ctx.fill();
                // 锁体 (灰色方块)
                ctx.fillStyle = '#64748b';
                ctx.fillRect(x - r * 0.5, y - r * 0.2, r, r * 0.8);
                // 锁环 (上方半圆)
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                ctx.beginPath();
                ctx.arc(x, y - r * 0.2, r * 0.35, Math.PI, 0);
                ctx.stroke();
                // 钥匙数量提示 (小字)
                ctx.fillStyle = '#fbbf24';
                ctx.font = 'bold ' + Math.max(8, Math.floor(cs * 0.4)) + 'px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(this.keysCollected + '/' + this.keysNeeded, x, y + r * 1.4);
                ctx.textAlign = 'left';
                return;
            }
            // 解锁状态: 原金色光晕 + 旋转十字环
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            grad.addColorStop(0, 'rgba(250, 204, 21, 0.9)');
            grad.addColorStop(0.5, 'rgba(250, 204, 21, 0.3)');
            grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            // 旋转十字环
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(this.pulse);
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.stroke();
            ctx.restore();
        }

        drawPlayer(ctx, cs) {
            const x = this.player.x * cs + cs / 2;
            const y = this.player.y * cs + cs / 2;
            const r = Math.max(2, cs * 0.35);
            // 无敌期间: 玩家闪烁 (半透明 + 呼吸)
            const now = performance.now();
            const invincible = now < this.invincibleUntil;
            let alpha = 1;
            if (invincible) {
                alpha = 0.35 + 0.35 * Math.abs(Math.sin(now / 90));
            }
            ctx.save();
            ctx.globalAlpha = alpha;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            grad.addColorStop(0, 'rgba(34, 197, 94, 0.6)');
            grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#bbf7d0';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 朝向指示: 在朝向方向画一个小三角箭头
            const facing = Math.atan2(this.playerDir.y, this.playerDir.x);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(facing);
            ctx.fillStyle = '#bbf7d0';
            ctx.beginPath();
            ctx.moveTo(r * 0.95, 0);
            ctx.lineTo(r * 0.55, -r * 0.3);
            ctx.lineTo(r * 0.55, r * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.restore();
        }

        drawMonster(ctx, cs, m) {
            const x = m.x * cs + cs / 2;
            const y = m.y * cs + cs / 2;
            const now = performance.now();
            const inGrace = this.running && now < this.graceUntil;
            const frozen = now < this.activeEffects.freezeUntil;
            const pulse = 0.85 + 0.15 * Math.sin(this.pulse * 3);
            const r = Math.max(2, cs * 0.35 * pulse);
            // 警戒状态: 主色变橙红 + 更强辉光; 巡逻: 暗红; 冻结: 冰蓝
            const mainColor = frozen ? '#7dd3fc' : (m.alerted ? '#f97316' : '#ef4444');
            const glowColor = frozen ? 'rgba(125, 211, 252, 0.7)' : (m.alerted ? 'rgba(249, 115, 22, 0.85)' : 'rgba(239, 68, 68, 0.7)');
            const glowFade = frozen ? 'rgba(125, 211, 252, 0)' : (m.alerted ? 'rgba(249, 115, 22, 0)' : 'rgba(239, 68, 68, 0)');
            // 保护期内: 怪物加白色脉冲外环高亮, 提示玩家位置以便提前规划
            if (inGrace) {
                const gracePulse = 0.5 + 0.5 * Math.sin(now / 120);
                ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.4 + 0.4 * gracePulse) + ')';
                ctx.lineWidth = Math.max(1.5, cs * 0.1);
                ctx.beginPath();
                ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
                ctx.stroke();
            }
            // 警戒状态: 加急促脉冲外环 (警示玩家被发现)
            if (m.alerted && !frozen) {
                const alertPulse = 0.5 + 0.5 * Math.sin(now / 80);
                ctx.strokeStyle = 'rgba(249, 115, 22, ' + (0.4 + 0.4 * alertPulse) + ')';
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                ctx.beginPath();
                ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
                ctx.stroke();
            }
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            grad.addColorStop(0, glowColor);
            grad.addColorStop(1, glowFade);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = mainColor;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = frozen ? '#e0f2fe' : '#fecaca';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 冻结时画冰晶十字, 否则画眼睛朝向 m.dir (怪物朝向)
            if (frozen) {
                ctx.strokeStyle = '#e0f2fe';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y);
                ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5);
                ctx.stroke();
            } else {
                // 眼睛朝向怪物朝向方向 (m.dir), 玩家可据此判断怪物面朝哪边
                const len = Math.hypot(m.dir.x, m.dir.y) || 1;
                const ex = (m.dir.x / len) * r * 0.3;
                const ey = (m.dir.y / len) * r * 0.3;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(x + ex, y + ey, Math.max(1, r * 0.22), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 绘制地图上的道具拾取点 (旋转六边形符文环 + 浮动图标 + 上升光粒子)
        // 每种道具独立主题色, 玩家拾取前就能辨识类型
        drawPickups(ctx, cs) {
            const now = performance.now();
            for (let i = 0; i < this.pickups.length; i++) {
                const p = this.pickups[i];
                const color = this.ITEM_COLORS[p.type];
                const cx = p.x * cs + cs / 2;
                const cy = p.y * cs + cs / 2;
                const baseR = Math.max(2, cs * 0.34);
                const t = now * 0.001 + i * 0.7; // 每个道具错开相位, 避免整齐划一

                // 1. 外层光晕 (主题色径向渐变)
                const glowR = baseR * 2.2;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
                grad.addColorStop(0, color.glow);
                grad.addColorStop(1, color.fade);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
                ctx.fill();

                // 2. 六边形符文环 (细线条, 缓慢旋转)
                const ringR = baseR * 1.05;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(t * 0.6);
                ctx.strokeStyle = color.core;
                ctx.lineWidth = Math.max(1, cs * 0.05);
                ctx.beginPath();
                for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * Math.PI * 2;
                    const px = Math.cos(a) * ringR;
                    const py = Math.sin(a) * ringR;
                    if (k === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
                // 六个顶点小亮点
                ctx.fillStyle = color.core;
                for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * ringR, Math.sin(a) * ringR, Math.max(1, cs * 0.05), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                // 3. 中心图标 (上下浮动, 呼吸缩放)
                const floatY = Math.sin(t * 2.2) * baseR * 0.18;
                const iconScale = 0.9 + 0.1 * Math.sin(t * 2.2);
                ctx.save();
                ctx.translate(cx, cy + floatY);
                ctx.scale(iconScale, iconScale);
                ctx.strokeStyle = '#fff';
                ctx.fillStyle = '#fff';
                ctx.lineWidth = Math.max(1.2, cs * 0.07);
                this.drawItemIcon(ctx, p.type, 0, 0, baseR * 0.5);
                ctx.restore();

                // 4. 上升光粒子 (持久状态, 每帧更新位置和透明度)
                this.updatePickupParticles(p, cx, cy, baseR, color, now, cs);
                for (let pi = 0; pi < p.particles.length; pi++) {
                    const pt = p.particles[pi];
                    ctx.fillStyle = 'rgba(' + color.rgbStr + ',' + (pt.life * 0.7) + ')';
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 维护单个道具拾取点的粒子状态: 持续生成 + 上升 + 渐隐
        updatePickupParticles(p, cx, cy, baseR, color, now, cs) {
            // 生成新粒子 (每帧约 20% 概率, 控制密度)
            if (Math.random() < 0.2 && p.particles.length < 6) {
                p.particles.push({
                    x: cx + (Math.random() - 0.5) * baseR * 0.8,
                    y: cy + baseR * 0.3,
                    vy: -(0.15 + Math.random() * 0.25) * cs * 0.1, // 上升速度, 按格子大小缩放
                    r: Math.max(0.8, cs * 0.04 + Math.random() * cs * 0.03),
                    life: 1
                });
            }
            // 更新现有粒子
            for (let i = p.particles.length - 1; i >= 0; i--) {
                const pt = p.particles[i];
                pt.y += pt.vy;
                pt.life -= 0.025;
                if (pt.life <= 0) {
                    p.particles.splice(i, 1);
                }
            }
        }

        // 在道具拾取点上画类型图标 (简笔, 已 translate 到中心)
        drawItemIcon(ctx, type, x, y, s) {
            ctx.beginPath();
            if (type === 'sprint') {
                // 闪电
                ctx.moveTo(x - s * 0.3, y - s);
                ctx.lineTo(x + s * 0.4, y - s * 0.2);
                ctx.lineTo(x, y - s * 0.2);
                ctx.lineTo(x + s * 0.3, y + s);
                ctx.lineTo(x - s * 0.4, y + s * 0.2);
                ctx.lineTo(x, y + s * 0.2);
                ctx.closePath();
                ctx.fill();
            } else if (type === 'vision') {
                // 眼睛 (椭圆 + 瞳孔)
                ctx.ellipse(x, y, s, s * 0.6, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === 'freeze') {
                // 雪花 (六射线)
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
                }
                ctx.stroke();
            } else if (type === 'decoy') {
                // 同心圆
                ctx.arc(x, y, s, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 绘制传送门 (成对紫色漩涡, 两个入口同步旋转)
        drawPortals(ctx, cs) {
            if (this.portals.length === 0) return;
            const now = performance.now();
            for (let i = 0; i < this.portals.length; i++) {
                const p = this.portals[i];
                this.drawSinglePortal(ctx, cs, p.a, now, i * 0.5);
                this.drawSinglePortal(ctx, cs, p.b, now, i * 0.5 + 0.3);
            }
        }

        // 绘制单个传送门入口: 外层光晕 + 旋转双环 + 中心亮点
        drawSinglePortal(ctx, cs, pos, now, phaseOffset) {
            const cx = pos.x * cs + cs / 2;
            const cy = pos.y * cs + cs / 2;
            const baseR = Math.max(2, cs * 0.36);
            const t = now * 0.001 + phaseOffset;
            // 外层光晕
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.8);
            grad.addColorStop(0, 'rgba(168, 85, 247, 0.5)');
            grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, baseR * 1.8, 0, Math.PI * 2);
            ctx.fill();
            // 外环 (顺时针旋转)
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(t * 1.5);
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
            ctx.lineWidth = Math.max(1, cs * 0.06);
            ctx.beginPath();
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * Math.PI * 2;
                const r = baseR * (0.9 + 0.1 * Math.sin(t * 3 + k));
                if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            // 内环 (逆时针旋转)
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(-t * 2);
            ctx.strokeStyle = 'rgba(216, 180, 254, 0.9)';
            ctx.lineWidth = Math.max(1, cs * 0.05);
            ctx.beginPath();
            ctx.arc(0, 0, baseR * 0.55, 0, Math.PI * 1.5);
            ctx.stroke();
            ctx.restore();
            // 中心亮点
            ctx.fillStyle = '#e9d5ff';
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(1, cs * 0.08), 0, Math.PI * 2);
            ctx.fill();
        }

        // 绘制钥匙: 金色发光圆环 + 钥匙图标 + 上下浮动
        drawKeys(ctx, cs) {
            if (this.keyPickups.length === 0) return;
            const now = performance.now();
            for (let i = 0; i < this.keyPickups.length; i++) {
                const k = this.keyPickups[i];
                const bobY = Math.sin(now / 400 + i * 1.7) * cs * 0.08; // 上下浮动
                const cx = k.x * cs + cs / 2;
                const cy = k.y * cs + cs / 2 + bobY;
                const r = Math.max(2, cs * 0.32);
                // 外光晕 (金色脉冲)
                const pulse = 0.7 + 0.3 * Math.sin(now / 250 + i);
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
                grad.addColorStop(0, 'rgba(251, 191, 36, ' + (0.6 * pulse) + ')');
                grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
                ctx.fill();
                // 钥匙图标: 圆环头 + 长杆 + 齿
                ctx.save();
                ctx.translate(cx, cy);
                ctx.strokeStyle = '#fbbf24';
                ctx.fillStyle = '#fbbf24';
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                // 圆环头 (左上)
                ctx.beginPath();
                ctx.arc(-r * 0.3, -r * 0.2, r * 0.3, 0, Math.PI * 2);
                ctx.stroke();
                // 杆 (右下)
                ctx.lineWidth = Math.max(2, cs * 0.1);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(r * 0.5, r * 0.5);
                ctx.stroke();
                // 齿 (杆末端的小横)
                ctx.lineWidth = Math.max(1.5, cs * 0.08);
                ctx.beginPath();
                ctx.moveTo(r * 0.5, r * 0.5);
                ctx.lineTo(r * 0.5, r * 0.2);
                ctx.moveTo(r * 0.35, r * 0.35);
                ctx.lineTo(r * 0.35, r * 0.15);
                ctx.stroke();
                ctx.restore();
            }
        }

        // ---------- 道具使用 ----------
        useItem(type) {
            if (!this.running || this.paused) return;
            if (this.items[type] <= 0) return;
            this.items[type]--;
            this.updateItemUI();

            if (type === 'sprint') {
                this.useSprint();
            } else if (type === 'vision') {
                this.useVision();
            } else if (type === 'freeze') {
                this.useFreeze();
            } else if (type === 'decoy') {
                this.useDecoy();
            }
        }

        // 闪现: 朝当前朝向瞬移 3 格 (撞墙则停在墙前)
        useSprint() {
            // 闪现: 朝玩家当前朝向瞬移 3 格 (不再依赖 heldDir, 即使没按键也能朝面朝方向闪)
            const dir = this.playerDir;
            for (let step = 0; step < 3; step++) {
                const nx = this.player.x + dir.x;
                const ny = this.player.y + dir.y;
                if (nx < 0 || nx >= this.N || ny < 0 || ny >= this.N) break;
                if (this.grid[ny][nx] === 1) break;
                // 留下残影
                this.activeEffects.sprintTrail.push({ x: this.player.x, y: this.player.y, life: 1 });
                this.player.x = nx;
                this.player.y = ny;
                this.addFootprint(nx, ny);
                // 传送门: 闪现踩到入口也触发传送
                if (this.checkPortalTransport()) break; // 传送后停止闪现
                // 拾取路径上的道具
                for (let i = 0; i < this.pickups.length; i++) {
                    if (this.pickups[i].x === this.player.x && this.pickups[i].y === this.player.y) {
                        if (this.items[this.pickups[i].type] < this.ITEM_MAX[this.pickups[i].type]) {
                            this.items[this.pickups[i].type]++;
                            this.updateItemUI();
                        }
                        this.pickups.splice(i, 1);
                        break;
                    }
                }
                // 拾取路径上的钥匙
                this.checkKeyPickup();
                if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
                    if (!this.exitLocked) {
                        this.onLevelClear();
                        return;
                    } else {
                        this.spawnFloatText(this.player.x, this.player.y, '需要钥匙', '#f87171');
                        break; // 锁定门挡住闪现
                    }
                }
            }
        }

        // 视野: 计算到出口的最短路径, 高亮 3 秒
        useVision() {
            const path = astar(this.grid, this.player.x, this.player.y, this.exit.x, this.exit.y);
            if (path) {
                this.activeEffects.visionPath = path;
                this.activeEffects.visionUntil = performance.now() + this.ITEM_DURATION.vision;
            }
        }

        // 冻结: 所有怪物静止 3 秒
        useFreeze() {
            this.activeEffects.freezeUntil = performance.now() + this.ITEM_DURATION.freeze;
        }

        // 诱饵: 在当前位置放幻影, 怪物改追幻影 3 秒
        useDecoy() {
            this.activeEffects.decoyPos = { x: this.player.x, y: this.player.y };
            this.activeEffects.decoyUntil = performance.now() + this.ITEM_DURATION.decoy;
        }

        // 同步更新道具栏 UI (4 个槽位的数量 + 灰显状态)
        updateItemUI() {
            for (let i = 0; i < this.ITEM_TYPES.length; i++) {
                const slot = this.itemSlots[i];
                if (!slot) continue;
                const type = this.ITEM_TYPES[i];
                const count = this.items[type];
                const countEl = slot.querySelector('.item-count');
                if (countEl) countEl.textContent = count;
                if (count > 0) slot.classList.remove('empty');
                else slot.classList.add('empty');
            }
        }
    }

    // 暴露接口给 game-shell.js 轮播适配 + 生命周期管理
    let game = null;
    window.mazeGame = {
        fitMaze() { if (game) game.fitMaze(); },
        pause()   { if (game) game.pause(); },
        resume()  { if (game) game.resume(); }
    };
    if (window.registerGame) window.registerGame('maze', window.mazeGame);

    // 自动初始化 (脚本 defer 加载, DOM 已就绪)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { game = new MazeGame(); });
    } else {
        game = new MazeGame();
    }
})();
