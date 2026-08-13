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
│   └── game-plane.js      # 打飞机游戏（按需动态 import，懒加载代码分割）
├── styles/                # CSS（main + 6 个游戏样式）
├── assets/                # 图标 / 卡牌图
├── images/                # 项目截图 / 证书
├── news/                  # 资讯数据（自动生成）
├── tools/                 # 本地一次性工具脚本（获奖证书转图等，不参与构建）
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

### 2. 游戏中心（8 个游戏，5 个带 AI）

| 游戏 | 源码位置 | AI 算法 |
|---|---|---|
| 贪吃蛇 | `src/app.js`（原 snake-game.js） | BFS + Flood Fill 安全性检查 |
| Flappy Bird | `src/app.js`（原 flappy-bird.js） | Dueling DQN（调用 backend/） |
| 2048 | `src/app.js`（原 game-2048.js） | Expectimax（深度 3） |
| 俄罗斯方块 | `src/app.js`（原 game-tetris.js） | Pierre Dellacherie 启发式 |
| 井字棋 | `src/app.js`（原 game-tic-tac-toe.js） | Minimax |
| 五子棋 | `src/app.js`（原 gomoku.js） | Minimax + α-β 剪枝 + 棋型评估 |
| 记忆翻牌 | `src/app.js`（原 memory-game.js） | 无（纯休闲） |
| 打飞机 | `src/game-plane.js`（按需懒加载） | 无（单机射击） |

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
