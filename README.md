# Sky Star Personal Website

个人主页 + AI 游戏中心 + 强化学习推理后端 + 每日资讯聚合系统。

## 项目结构

```
.
├── index.html             # 单页 SPA 入口（home/news/about/skills/projects/game/contact）
├── src/                   # 前端 ES Module 源码（Vite 管理）
│   ├── main.js            # 模块入口（挂载 SkyStorage + 引入 app.js）
│   ├── app.js            # 全部应用脚本拼接为单一共享作用域模块（HMR/代码分割）
│   ├── storage.js        # SkyStorage（localStorage 封装，保留 window 兼容）
│   ├── games-bundle.js   # 9 个游戏的懒加载包（首次切到非飞机游戏时载入）
│   ├── game-plane.js      # 打飞机游戏（按需动态 import，懒加载代码分割）
│   ├── game-mine.js       # 概率扫雷的渲染与交互层（懒加载）
│   ├── game-reversi.js    # 黑白棋：规则 + α-β 搜索 + 棋盘渲染（懒加载，8KB）
│   ├── mine-solver.js     # 扫雷棋盘数据 + 概率求解器（纯逻辑，可在 Node 中统计校验）
│   ├── ai-lab.js          # AI 实验台：参数注册表 + 抽屉 UI + 持久化
│   ├── ai-bench.js        # 跑分台：同种子批量对局，输出可比较的量化结果
│   └── ai-trace.js        # 决策遥测：游戏上报「这一步想了什么」，浮一条摘要
├── styles/                # CSS（main / fx / journey / studio / game-center + 各游戏专属样式）
├── assets/                # 图标 / 卡牌图
├── images/                # 项目截图 / 证书
├── news/                  # 资讯数据（自动生成）
├── public/models/         # ONNX 模型与 onnxruntime wasm（原样拷进 dist 根）
├── tools/                 # 本地工具脚本（证书转图 / 求解器校验，不参与构建）
├── .github/workflows/     # deploy-pages.yml：push main 后自动构建并发布 Pages
├── backend/               # Flappy Bird DQN 推理后端（Flask + PyTorch）
│   ├── app.py
│   ├── requirements.txt
│   └── README.md          # 推理 API 详细说明
├── news_server.py         # 每日资讯后端（FastAPI，抓 4 源 + LLM 总结）
├── train_flappy.py        # Flappy Bird DQN 续训脚本
├── test_flappy.py         # 模型渲染测试
├── package.json           # 前端依赖与脚本（dev/build/preview）
├── vite.config.js         # Vite 配置（拷贝 news/，base:'./'）
├── requirements.txt       # 资讯后端依赖
├── start-news.bat         # Windows 一键启动资讯后端
└── .gitignore
```

> **架构说明**：前端已从「1.3k 行 index.html + 16 个经典 `<script>` 全局脚本」升级为 Vite + ES Modules。
> 原 16 个脚本已按加载顺序拼接为 `src/app.js` 单一共享作用域模块（语义与原全局脚本完全等价），
> 打飞机游戏（最大，135KB）改为 `import('./game-plane.js')` 按需懒加载、独立代码分割。
> 构建产物为 `dist/`，本地 `npm run dev` 开发带 HMR。

## 功能模块

### 1. 主页（index.html）

7 个 panel：home / news / about / skills / projects / game / contact，外加 3 个 modal。

### 2. 游戏中心（11 个游戏，9 个带 AI）

| 游戏 | 源码位置 | AI 算法 |
|---|---|---|
| 贪吃蛇 | `src/games-bundle.js` | BFS + Flood Fill 安全性检查 |
| Flappy Bird | `src/games-bundle.js` | Dueling DQN（后端推理 / ONNX 降级） |
| 2048 | `src/games-bundle.js` | Expectimax（深度 3） |
| 俄罗斯方块 | `src/games-bundle.js` | Pierre Dellacherie 启发式 |
| 井字棋 | `src/games-bundle.js` | Minimax + ε-greedy（搜索建模“棋子会消失”的变体规则） |
| 五子棋 | `src/games-bundle.js` | Minimax + α-β 剪枝 + 棋型评估 |
| 黑白棋 | `src/game-reversi.js`（懒加载） | negamax + α-β，角/边/行动力/子数权重可调 |
| AI 迷宫逃生 | `src/games-bundle.js` | 寻路 |
| 霜境星火 | `src/games-bundle.js` | 无（弹幕肉鸽） |
| 打飞机 | `src/game-plane.js`（懒加载） | 无（单机射击） |
| 概率扫雷 | `src/game-mine.js` + `src/mine-solver.js`（懒加载） | 三层推理：规则饱和 → 边界分量枚举 → 全局雷数 DP |

#### 井字棋：一个被规则变更遗漏的搜索

这款井字棋不是标准规则：**每方最多 3 子，落下第 4 子时最早的会消失**。
好处是几乎没有平局（棋盘永远填不满，只能靠连成三子分胜负）。

问题在于原来的 Minimax 搜的是静态棋盘，完全没有建模"棋子会消失"这条规则——
搜索里走的规则和实际走的规则不一致。实测随机乱走的玩家 200 局能赢 **14 局（7%）**，
"不可战胜"是名不副实的。

修正做法：把双方的出子队列一并纳入搜索状态（落子→入队→超过 3 个就移除最早的），
配合 alpha-beta 剪枝与「两子一空」的威胁估值。实测单步 0.1–4ms，不影响手感。

修正后对随机对手的胜率（各 200 局，对手为随机走子，先后手已随机）：

| 失误率 | 0% | 10% | 35% | 50% |
|---|---|---|---|---|
| AI 胜率 | 100% | 98% | 88% | 81% |

修复前是 93%（即静默失误约 7%），现在 0% 一档提升到 100%。

但 0% 也不是绝对不可战胜：样本加到 500 局仍有个位数失手，而且**加深搜索没有改善**
（深度 5 输 1 局、深度 6 输 3 局，单步耗时反而翻倍）。说明瓶颈在深度上限处的静态估值
——棋子消失的后果看不穿那么远，而不是搜得不够深。界面上因此没写"不可战胜"。

**顺带发现一个规则层面的不平衡**：双方都纯随机时，后手胜 367/500（73%）。
因为每方最多 3 子，先落的一方更早开始丢子——**先手在这个变体里是劣势**。
原先 AI 固定执后手，等于天然占优，所以玩家"怎么都赢不了"里有相当一部分是规则造成的。

现在改为**开局随机先后手**（各 50%，实测 196/400 由 AI 先手），这个优势不再固定落在 AI 身上；
AI 抽到先手时会自己先落子，不用等玩家点第一格。

难度档位用 ε-greedy 实现：以 ε 概率从**全部合法位置**里随机选一步（也可能正好选中最优），
其余时候取搜索结果。它不是把搜索变浅，而是让 AI 在关键时刻真的犯错——两种完全不同的降智方式。

#### 黑白棋（替换掉原先的记忆翻牌）

记忆翻牌的问题是**参数没有中间地带**：记性只能整块调，调到 100% 碾压玩家、调到 30% 变成随机乱翻，
滑杆拉不出「一点点变强」的手感。黑白棋的评估是四项加权和，每一项都能单独拧：

```
评分 = 角权重·角 + 边权重·边 + 行动力权重·(双方可落点数差) + 子数权重·子数差
```

把**角权重调到 0**，AI 会为了多吃两子主动把角送给你——这种「参数改了、行为肉眼可见地变了」
正是调参面板想展示的东西。行动力权重则是黑白棋中盘的核心：让对手可选的点更少，比当下多吃子重要。

AI 用 negamax + α-β，候选按「角 → 边 → 内部」排序以提升剪枝效率。
实测中后盘（最多 15 个落点）单步：深度 3 约 3ms、深度 4 约 16ms、深度 5 约 55ms（最慢 130ms）。

跑分指标是**终局子数差**（AI 执黑 vs 随机执白，下完整盘）。实测「贪吃」档比「标准」档
平均少 17 子（21 vs 38），与预期一致——贪吃档前中期吃得多，后期无处可落。

#### 黑白棋（替换掉原先的记忆翻牌）

记忆翻牌的问题是**参数没有中间地带**：记性只能整块调，调到 100% 碾压玩家、调到 30% 变成随机乱翻，
滑杆拉不出「一点点变强」的手感。黑白棋的评估是四项加权和，每一项都能单独拧：

```
评分 = 角权重·角 + 边权重·边 + 行动力权重·(双方可落点数差) + 子数权重·子数差
```

把**角权重调到 0**，AI 会为了多吃两子主动把角送给你——这种「参数改了、行为肉眼可见地变了」
正是调参面板想展示的东西。行动力权重则是黑白棋中盘的核心：让对手可选的点更少，比当下多吃子重要。

AI 用 negamax + α-β，候选按「角 → 边 → 内部」排序以提升剪枝效率。
实测中后盘（最多 15 个落点）单步：深度 3 约 3ms、深度 4 约 16ms、深度 5 约 55ms（最慢 130ms）。

跑分指标是**终局子数差**（AI 执黑 vs 随机执白，下完整盘）。实测「贪吃」档比「标准」档
平均少 17 子（21 vs 38），与预期一致——贪吃档前中期吃得多，后期无处可落。

#### 概率扫雷的求解器

不同于「高亮安全格」的常规提示，扫雷会为每个未翻开格给出**爆炸概率**，
并以热力图呈现（绿=安全、红=高危、青色描边=逻辑上必然安全）。

推理分三层，逐层收紧：

1. **确定性规则** — 数字格约束饱和时直接判定邻格全是雷或全安全。
2. **边界分量枚举** — 把边界格按共享约束分组，组内回溯枚举所有合法布雷方案，
   按「本组恰好用 k 颗雷」分桶统计。超过 26 格或 3 万解即降级，避免卡住主线程。
3. **全局雷数 DP** — 用前缀/后缀卷积组合各分量，并把边界之外的自由格以组合数
   `C(N, t)` 权重一并卷积，从而在「剩余雷数」约束下求每格边际概率。

第 3 层是关键：若把「边界雷数 === 剩余雷数」当硬约束（即假定边界之外一颗雷都不放），
会系统性高估边界格的中雷概率，并产生「必然有雷」的误判。

校验脚本：

```bash
node tools/verify-mine-solver.mjs          # 默认 300/150/60 局
node tools/verify-mine-solver.mjs 200 900 120
```

它检查四件事：确定性结论零误判、概率校准（按预测值分桶对比实际踩雷率）、
Brier 分数（0.25 ≈ 无信息盲猜）、以及高级盘面的求解耗时。

#### AI 实验台

游戏中心右上角的「AI 实验台」把各游戏原本硬编码的 AI 参数暴露成可调滑杆，
让「AI 有多强」从黑箱变成可以亲手拧的旋钮。

| 游戏 | 参数 | 默认 | 说明 |
|---|---|---|---|
| 2048 | 搜索深度 | 3 | 深度 1/3/5 实测单步约 0.2 / 2 / 25 ms |
| 2048 | 空格 / 平滑 / 单调 / 角落 权重 | 200 / 1.5 / 2 / 1000 | 评估式：`空格×w + 平滑×w + 单调×w + 角落奖励` |
| 俄罗斯方块 | 总高度 / 消行 / 空洞 / 凹凸 权重 | -0.51 / 0.76 / -0.36 / -0.18 | Dellacherie 经典系数，滑杆精度 0.01 |
| 五子棋 | 搜索深度 | 自动 | 自动 = 开局 3 层、中后盘 4 层；手动覆盖则全程固定 |
| 井字棋 | 失误率 | 10% | 按概率放弃最优解、随机改走别处；0% 时近乎不失误 |
| 概率扫雷 | AI 步进间隔 | 260ms | 自动扫雷时每步停顿，改动对运行中的扫描即时生效 |
| 黑白棋 | 角 / 边 / 行动力 / 子数权重 | 40 / 8 / 10 / 1 | 角权重调 0，AI 会主动把角送给你 |
| 黑白棋 | 搜索深度 | 3 | 实测中后盘：深度 3 约 3ms、深度 4 约 16ms、深度 5 约 55ms |
| AI 迷宫逃生 | 怪物视野 / 移速 | 1.0× | 倍率缩放，不改变关卡推进曲线 |

预设档位由各游戏自定义（2048 是 保守/标准/激进，俄罗斯方块是 平整优先/标准/消行优先，
井字棋是 完美/标准/新手，黑白棋是 贪吃/标准/稳健，扫雷是 慢/标准/快，迷宫是 温和/标准/凶狠），
抽屉按配置渲染，不写死档位名。

**权重是真的会影响决策的**，不是装饰。以俄罗斯方块固定地形 + T 型方块为例：

| 权重档位 | 落点 |
|---|---|
| 标准 | 第 4 列，朝下插入缺口 |
| 平整优先 | 第 8 列，另一种旋转，把地形摊平 |

同一棋盘三组权重的评分分别是 -15.2 / -34.8 / 0，说明系数确实进了评估函数。
另外实测：权重取两位小数（-0.51 等）与原始六位精度（-0.510066）在 20 个随机局面上
决策**完全一致**，所以滑杆精度没有牺牲行为。

Flappy（权重在模型文件里）以及其余无 AI 决策的游戏
不提供参数，按钮会置灰并说明原因。

**新增游戏只需注册一张参数表**，UI 不用动：

```js
window.aiLab.register('yourgame', [
  { key: 'depth', label: '搜索深度', min: 1, max: 5, step: 1, def: 3, hint: '说明文字' },
], { presets: { 弱: { depth: 2 }, 标准: { depth: 3 }, 强: { depth: 4 } } });
```

游戏侧读取一行即可，兜底值保持原来的硬编码常量：

```js
const depth = window.aiLab?.get('2048', 'searchDepth', 3) ?? 3;
```

参数存 `localStorage`（`skystar:ai-lab:v1`），切游戏时抽屉自动跟随，
改过参数后按钮右上角会亮一个小圆点，避免「AI 变弱了被当成 bug」。

`note` 既可以是字符串，也可以是 `(values) => string`：传函数时抽屉底部会实时显示
当前评估式（俄罗斯方块和 2048 用的就是这个），让「参数 → 公式」的因果关系看得见。
`presets` 的键名自由，会直接渲染成档位按钮。

#### AI 决策遥测

光有滑杆还不够 —— 玩家改完参数，得看得见 AI 这一步到底怎么想的。
决策发生时，游戏区左下角会浮出一条摘要（7 秒后自动淡出，点一下可立即收起）：

```
评估 34 个落点 · 0.3ms · 选中「第 8 列」 -13.47（次优 -14.01） · 第 1 种旋转
评估 4 个方向 · 0.8ms · 选中「上移」 2,859（次优 2,755） · 深度 3
评估 3 个方向 · 1.3ms · 选中「右」 1,482（次优 1,217） · 活路 626 格
```

已接入贪吃蛇（方向评分 + 模拟存活空间）、2048（四方向评分 + 搜索深度）、
俄罗斯方块（落点评估数 + 评分差）、五子棋（候选点数 + minimax 评分）、
黑白棋（候选落点数 + 评估分 + 搜索深度）。
扫雷有概率热力图、迷宫有 A* 路径，本身已经是可视化状态，不重复加。

实现约定（`src/ai-trace.js`）：

- **总线只做展示**。候选数、耗时、评分由各游戏在决策处自己上报，遥测层不反向
  猜测游戏内部状态，避免又造一套"影子逻辑"。
- **只在当前游戏上报时显示**，并且监听 tab 的 active 类变化 —— 程序化切换游戏
  （路由、移动端下拉）不产生 click，只靠 click 会残留上一个游戏的数字。
- 两个评分在显示精度上相同时写「次优持平」，不写两遍一样的数。

顺带清掉了五子棋每次落子都往控制台 `console.table` 打调试信息的行为（线上也照打）。

#### 量化对比（跑分台）

只靠手感判断参数好坏不可靠 —— 一局分数高低很大程度取决于出块运气。
抽屉底部的「跑 10 局对比」会拿**当前设置 vs 标准预设**各跑 10 局，给出均值、
中位数、差值及其标准误。

公平性靠三条约束保证（`src/ai-bench.js`）：

1. **不复制规则**。决策、消行、计分、随机全部调用游戏原本的方法，跑分台只把
   `drawBoard` / `renderBoard` 这类渲染函数临时替换成空函数。另写一套简化规则
   会产生"评估路径 ≠ 交付路径"的偏差，那些数字就没有参考价值。
2. **同种子开局**。两组参数用同一串随机数，差异才来自参数而非运气。方块序列在
   存活期间保持对齐；一旦某一方提前结束就会分叉，报告里如实标注。
3. **报告波动**。给出配对差值的标准误与 t 值，`|t| < 2.3`（N=10）时直接判为噪声，
   不把随机波动说成"调优成功"。

另外两个细节：跑分前后会**快照并还原玩家的局面与分数**，不会把正在下的棋冲掉；
参数一改动，旧结果立刻作废，避免看着过期数字下结论。

目前支持俄罗斯方块、2048、井字棋与黑白棋。前两者按「一局得分」累计，井字棋按**胜率**
（一局 = 对战随机走子的玩家，赢记 100、输记 0）；黑白棋按**终局子数差**
（一局 = 完整下完一盘，AI 执黑 vs 随机执白）。

局数按指标特性给默认值：得分类 10 局够用，胜率的步长是 1/N，10 局根本分辨不出
93% 和 100%，所以井字棋默认 30 局。扫雷/迷宫仍没接——用时是另一套口径，不硬凑。

## 快速开始

### 前端（Vite + ES Modules）

```bash
npm install        # 安装 vite 开发依赖
npm run dev        # 本地开发，带 HMR，默认 http://localhost:5500
npm run build      # 产出 dist/（已内联 base:'./'，可直接静态托管）
npm run preview    # 本地预览构建产物
```

> 注意：开发态用 `npm run dev`，不要再用 `python -m http.server` 直接开 `index.html`——
> 模块入口 `<script type="module" src="/src/main.js">` 需要 Vite 的模块解析与转换。

### 后端 A：Flappy Bird AI 推理（Flask + PyTorch）

```bash
cd backend
pip install -r requirements.txt
# 把训练好的 best_flappy.pth 或 final_flappy.pth 放到 backend/ 目录
python app.py
# 服务启动在 http://127.0.0.1:5000
```

详细 API 与 12 维 state 格式见 [backend/README.md](backend/README.md)。

### 后端 B：每日资讯服务（FastAPI + LLM）

```bash
# 1. 创建 .env（同 news_server.py 目录）
cat > .env <<EOF
LLM_API_KEY=your_minimax_key_here
LLM_BASE_URL=https://api.MiniMax.chat/v1
LLM_MODEL=MiniMax-Text-01
PORT=8000
MAX_ITEMS=25
EOF

# 2. 安装依赖并启动
pip install -r requirements.txt
python news_server.py
# 或 Windows 直接双击 start-news.bat
```

服务启动在 `http://localhost:8000`，前端 `index.html` 会自动读取 `news/news-data.js`。

## 线上地址与部署

**线上地址：<https://skystar01.github.io/skystar.github.io/>**

注意是**带仓库名的子路径**，不是根域名。

### 为什么根域名打不开

仓库 `skystar01/skystar.github.io` 的仓库名不等于 `skystar01.github.io`，
GitHub 因此把它当作 **project page**，只发布在 `/<repo>/` 子路径下。
根域名 `https://skystar01.github.io/` 背后没有任何内容，
访问会得到 GitHub Pages 的 **"Site not found" 404**。

这个 404 极容易误判成「部署失败」——实际上仓库 `has_pages` 为 true、
Actions 显示 success。**判断部署是否成功别看根域名**，看这两处：

```bash
# 1. 最近一次部署的 run 状态
curl -s "https://api.github.com/repos/skystar01/skystar.github.io/actions/runs?per_page=1"

# 2. 部署记录里登记的真实访问地址（environment_url）
curl -s "https://api.github.com/repos/skystar01/skystar.github.io/deployments?per_page=1"
```

如果想彻底让根域名可用，只能把仓库重命名为 `skystar01.github.io`（升级成 user page），
届时四处要同步改：`git remote set-url`、`index.html` 的 `canonical` / `og:url` /
`og:image` / `twitter:image`（去掉 `/skystar.github.io` 前缀）、以及本 README。

### 部署流程

push 到 `main` 触发 `.github/workflows/deploy-pages.yml`：
`npm install` → `npm run build` → 把 `dist/` 作为 Pages 产物发布。
push 后约 1–2 分钟线上生效。

### 路径铁律（踩过的坑）

`vite.config.js` 必须保持 **`base: './'`**。子路径部署下，任何绝对路径
（`/src/main.js`、`/assets/x.png`）都会被浏览器解析到根域名一级，直接 404，
页面表现为白屏或样式全丢。所以：

- HTML 里引资源用相对路径：`assets/...`、`styles/...`，**不要**写 `/assets/...`
- JS 里拼资源路径走 `import.meta.env.BASE_URL`，不要手写 `/`
- 唯一必须写死绝对地址的是 `<link rel="canonical">` 和 og / twitter 的分享图元信息
  （社交平台抓取需要完整 URL），这些已经指向上面的子路径地址

## 依赖说明

项目有三套独立的 Python 依赖：

| 文件 | 用途 | 关键依赖 |
|---|---|---|
| `requirements.txt` | 资讯后端（news_server.py） | fastapi, uvicorn, httpx, python-dotenv |
| `backend/requirements.txt` | 推理后端（backend/app.py） | flask, flask-cors, torch, numpy |
| `requirements-dev.txt` | 训练 + 独立 pygame 游戏 | gymnasium, flappy_bird_gymnasium, torch, pygame, matplotlib, pypdfium2 |

## 环境配置

- Python 3.10+（推荐 3.11）
- 现代浏览器（支持 Canvas / ES6 class / CSS backdrop-filter）
- 可选：CUDA 环境（用于加速 DQN 推理；CPU 也可跑）

## 注意事项

- `.env` 已在 `.gitignore` 中，不会提交
- 模型文件（`.pth` / `.onnx`）已在 `.gitignore` 中，需自行训练或下载后放到 `backend/`
- `news/*.json` 为自动生成的快照，可删除后由后端重新抓取
- **改资源引用前先读「[路径铁律](#路径铁律踩过的坑)」**：子路径部署下写了绝对路径必然 404，
  而且本地 `npm run dev` 看不出来，只有线上才炸
