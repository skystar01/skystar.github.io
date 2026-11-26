# Sky Star 个人网站与 AI 游戏中心

> 一个集个人作品展示、互动小游戏、强化学习模型推理与每日资讯于一体的个人项目。

整理日期：2026-10-12  
项目类型：个人网站 / AI 应用实践 / 游戏算法展示  
主要技术：JavaScript、HTML、CSS、Vite、Python、PyTorch、ONNX Runtime Web、Flask、FastAPI

## 项目简介

Sky Star 是我的个人展示网站，同时也是探索 AI 算法与前端交互的实验平台。访客可以浏览个人介绍、技能和项目，进入游戏中心试玩小游戏，并体验不同算法控制游戏的效果。

其中 Flappy Bird AI 贯穿模型训练、模型导出、服务端推理和浏览器本地推理；其他游戏展示搜索、博弈与启发式算法的应用。网站还包含每日资讯展示与配套聚合服务。

## 项目链接

- 代码仓库：https://github.com/skystar01/skystar.github.io
- 在线体验地址：待填写实际部署地址
- 演示视频：待补充

代码仓库链接来自网站内项目数据，在线部署地址需自行确认。

## 功能范围

| 模块 | 内容 |
| --- | --- |
| 首页 | 网站入口与个人展示 |
| 关于我 | 个人背景与经历 |
| 技能 | 技术能力与相关详情 |
| 项目 | 项目介绍、技术栈与成果展示 |
| 游戏中心 | 10 个小游戏及部分 AI 自动游玩功能 |
| 资讯 | 资讯内容展示、静态快照与配套聚合服务 |
| 联系 | 联系信息与入口 |

### 游戏与算法

| 游戏 | 算法或实现方向 |
| --- | --- |
| 贪吃蛇 | BFS 寻路与 Flood Fill 安全性检查 |
| Flappy Bird | Dueling DQN；ONNX 浏览器推理 / Flask 推理接口 |
| 2048 | Expectimax 搜索与棋盘启发式评估 |
| 俄罗斯方块 | Pierre Dellacherie 启发式评分 |
| 井字棋 | Minimax 博弈搜索 |
| 五子棋 | Minimax、Alpha-Beta 剪枝与棋型评估 |
| 记忆翻牌 | 卡牌配对交互 |
| 打飞机 | 独立模块的射击游戏 |
| 迷宫 | 迷宫游戏交互 |
| 生存游戏 | 玩家、敌人、武器与战斗交互 |

这里的 AI 包括搜索和规则评分算法，只有 Flappy Bird 使用训练得到的强化学习模型。

## 技术架构

### 前端

使用原生 JavaScript、HTML 和 CSS，通过 Vite 管理 ES Modules、开发服务器与生产构建。`index.html` 提供页面结构，`src/main.js` 为模块入口，`src/app.js` 管理网站交互。

游戏主体集中在 `src/games-bundle.js`，打飞机独立在 `src/game-plane.js`；项目与技能展示数据放在 `src/data/`，存储封装位于 `src/storage.js`。游戏与推理模块采用按需加载，减少首次访问需要加载的内容。

### Flappy Bird AI

训练代码使用 PyTorch，项目展示数据描述的训练方案包括 Dueling DQN、优先经验回放（PER）、奖励设计、目标网络同步与梯度裁剪。

模型可通过 `tools/export_onnx.py` 导出为 ONNX。浏览器通过 `src/flappy-onnx.js` 加载 ONNX Runtime Web 和 `public/models/` 中的模型、WASM 文件，在本地进行推理。项目也保留 Flask 后端接口 `POST /api/ai/action`，接收 12 维状态并返回动作与 Q 值。

### 资讯服务

`news_server.py` 使用 FastAPI，提供健康检查与资讯抓取接口，并结合 LLM 生成资讯摘要。`news/` 保存资讯快照与展示内容；LLM 配置通过环境变量管理。

## 核心目录

```text
index.html                 页面入口
src/main.js                前端模块入口
src/app.js                 网站交互
src/games-bundle.js         游戏主体与 AI 算法
src/game-plane.js           打飞机游戏
src/flappy-onnx.js          浏览器模型推理
src/storage.js             本地存储封装
src/data/                  项目、技能与指标数据
styles/                    页面和游戏样式
assets/                    图标、卡牌与游戏素材
images/                    项目图示与证书
public/models/             ONNX 模型与 WASM 文件
backend/                   Flask 推理后端
news_server.py             FastAPI 资讯服务
news/                      资讯快照与页面
train_flappy.py            模型训练
test_flappy.py             模型测试
tools/export_onnx.py        ONNX 导出
vite.config.js             构建配置
```

仓库还包含 `dsh-desktop/` 桌面子目录；本文聚焦个人网站，桌面部分可另建项目页记录。

## 项目亮点

- 将个人展示与可操作的游戏体验结合，让访客直接观察算法效果。
- 在多个游戏中实践寻路、博弈搜索、启发式评分与强化学习。
- 打通 Flappy Bird 模型训练、模型导出、API 推理和浏览器推理流程。
- 使用 ONNX Runtime Web 在浏览器运行模型，提供本地推理路径。
- 将展示数据与交互代码分离，方便维护项目介绍和训练指标。
- 使用模块加载和 Vite 构建组织逐步扩大的前端项目。

## 网站中展示的其他作品

这些是个人作品集条目，不能视为全部算法源码都在本仓库内。

| 作品 | 网站中记录的内容 |
| --- | --- |
| 智能博弈算法 | 2025 腾讯开悟参赛项目；DQN / Target DQN / PPO、奖励设计与特征处理 |
| Flappy Bird AI | 强化学习训练与网站部署；本仓库包含相关代码 |
| 智能问答系统 | 基于 minimind 的轻量中文对话模型训练与服务封装 |

网站中记录开悟初赛全国第 4、川渝地区二等奖、复赛全国第 9。对外展示时应同时提供对应证书或榜单，并清楚说明团队贡献和个人负责部分。

## 成果与证据

目前可整理的材料包括游戏运行截图、Flappy Bird 流程图、问答系统流程图和获奖证书图片。`output/audit/` 中已有页面与游戏截图，可选择合适的图片上传至 Notion。

`src/data/metrics.js` 中训练指标仍标记为占位状态，Flappy Bird 曲线标注为示意曲线。因此暂不填写平均得分、最高得分、训练收敛速度或胜率等数值，也不把示意曲线当作训练证据。

建议补充：

- [ ] 首页、游戏中心和移动端截图
- [ ] Flappy Bird AI 实际运行视频
- [ ] 真实训练日志与曲线
- [ ] 固定测试条件下的模型评估结果
- [ ] 各项目中的个人职责与贡献说明
- [ ] 实际在线部署地址

## 本地运行

### 网站

在项目根目录执行：

```bash
npm install
npm run dev
```

Vite 配置端口为 `5500`，以启动日志给出的地址为准。生产构建与预览：

```bash
npm run build
npm run preview
```

### 可选：Flask 推理后端

在 `backend/` 目录执行：

```bash
pip install -r requirements.txt
python app.py
```

默认地址为 `http://127.0.0.1:5000`。模型位置与状态格式参考 `backend/README.md`；浏览器 ONNX 推理需要对应模型与 WASM 文件可访问。

### 可选：资讯服务

在项目根目录配置 `.env` 中的 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 等参数，然后执行：

```bash
pip install -r requirements.txt
python news_server.py
```

Windows 也提供 `start-news.bat` 启动入口。公开项目文档中不要填写实际 API Key。

## 后续改进

- [ ] 按游戏拆分 `games-bundle.js`，降低单模块维护成本
- [ ] 补充移动、合并和 AI 决策等核心逻辑测试
- [ ] 为强化学习模型建立可重复的评估流程
- [ ] 完善模型加载失败与资讯请求失败的反馈
- [ ] 持续检查移动端操作和页面性能
- [ ] 更新 README，使目录和功能描述与当前实现一致

## 可用于作品集的简短介绍

开发 Sky Star 个人网站，集成作品展示、10 个互动小游戏与资讯模块。使用原生 JavaScript 和 Vite 构建前端，在游戏中应用 BFS、Expectimax、Minimax 和启发式算法；为 Flappy Bird 实现基于 PyTorch 的强化学习训练及 Flask / ONNX 浏览器推理流程，探索模型训练到交互应用的完整部署路径。

## 导入 Notion

1. 在 Notion 中打开导入入口，选择 Markdown 或 Text & Markdown 类型。
2. 选择本文件 `notion-project.md`。
3. 导入后检查标题、表格、代码块与待办列表的显示。
4. 将截图、视频和证书作为附件上传到对应章节。

本文不依赖本地图片链接，导入后文字内容可独立阅读。导入方式和入口名称以使用的 Notion 客户端为准。
