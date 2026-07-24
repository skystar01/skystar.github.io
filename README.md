# Sky Star Personal Website

个人主页 + AI 游戏中心 + 强化学习推理后端 + 每日资讯聚合系统。

## 项目结构

```
.
├── main.html              # 单页 SPA 入口（home/news/about/skills/projects/game/contact）
├── styles/                # CSS（main + 6 个游戏样式）
├── scripts/               # 8 个游戏 JS + 一次性工具脚本
├── assets/                # 图标 / 卡牌图
├── images/                # 项目截图 / 证书
├── news/                  # 资讯数据（自动生成）
├── backend/               # Flappy Bird DQN 推理后端（Flask + PyTorch）
│   ├── app.py
│   ├── requirements.txt
│   └── README.md          # 推理 API 详细说明
├── news_server.py         # 每日资讯后端（FastAPI，抓 4 源 + LLM 总结）
├── train_flappy.py        # Flappy Bird DQN 续训脚本
├── test_flappy.py         # 模型渲染测试
├── requirements.txt       # 资讯后端依赖
├── start-news.bat         # Windows 一键启动资讯后端
└── .gitignore
```

## 功能模块

### 1. 主页（main.html）

7 个 panel：home / news / about / skills / projects / game / contact，外加 3 个 modal。

### 2. 游戏中心（8 个游戏，5 个带 AI）

| 游戏 | 文件 | AI 算法 |
|---|---|---|
| 贪吃蛇 | `scripts/snake-game.js` | BFS + Flood Fill 安全性检查 |
| Flappy Bird | `scripts/flappy-bird.js` | Dueling DQN（调用 backend/） |
| 2048 | `scripts/game-2048.js` | Expectimax（深度 3） |
| 俄罗斯方块 | `scripts/game-tetris.js` | Pierre Dellacherie 启发式 |
| 井字棋 | `scripts/game-tic-tac-toe.js` | Minimax |
| 五子棋 | `scripts/gomoku.js` | Minimax + α-β 剪枝 + 棋型评估 |
| 记忆翻牌 | `scripts/memory-game.js` | 无（纯休闲） |
| 打飞机 | `scripts/game-plane.js` | 无（单机射击） |

## 快速开始

### 前端（纯静态）

直接用浏览器打开 `main.html`，或用任意静态服务器：

```bash
# 例：VS Code Live Server / Python 内置服务器
python -m http.server 5500
# 访问 http://localhost:5500/main.html
```

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

服务启动在 `http://localhost:8000`，前端 `main.html` 会自动读取 `news/news-data.js`。

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
