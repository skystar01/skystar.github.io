// 技能弹窗数据（key 与 index.html .skill-item 里的名称文案一致）
export const skillData = {
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
    },
    '模型训练': {
        icon: 'fas fa-brain',
        description: 'LoRA 微调、训练循环、checkpoint 管理与端到端 pipeline。Flappy / 竞赛 / 毕设都走完整训练链路，而不是只调推理接口。',
        level: '熟练',
        tags: ['LoRA', '训练循环', 'Pipeline'],
        features: ['训练循环与调度', 'Checkpoint 保存/续训', 'LoRA 微调实践', '显存与算力取舍'],
        projects: [
            { name: 'Flappy Bird AI', desc: 'Dueling DQN + PER 完整训练', link: '#' },
            { name: '智能问答系统', desc: '轻量中文对话模型预训练', link: '#' },
            { name: '开悟竞赛', desc: '两个月 DQN/PPO 调参实战', link: '#' }
        ],
        exploring: ['分布式训练 (DDP)', '更大规模预训练']
    },
    'AI Agent': {
        icon: 'fas fa-robot',
        description: '游戏智能体：状态特征、动作空间、奖励设计与策略网络。本站游戏区多个游戏可直接召唤 AI。',
        level: '熟练',
        tags: ['智能体', '策略', '游戏 AI'],
        features: ['状态/动作空间设计', '奖励 shaping', '策略网络推理', '浏览器端部署'],
        projects: [
            { name: '开悟竞赛智能体', desc: '寻路 / 道具 / 对战', link: '#' },
            { name: '本站游戏 AI', desc: '贪吃蛇 BFS · 2048 Expectimax · Flappy DQN', link: '#panel-game' }
        ],
        exploring: ['多智能体', 'SAC']
    },
    'ONNX 导出': {
        icon: 'fas fa-wave-square',
        description: '把 PyTorch checkpoint 导出为 ONNX，在浏览器用 onnxruntime-web 本地推理，静态站无需后端也能召唤 AI。',
        level: '熟练',
        tags: ['ONNX', '浏览器推理', '部署'],
        features: ['PyTorch → ONNX 导出', '逐动作等价性校验', 'wasm 路径与线程配置', 'Flask / 浏览器双通道'],
        projects: [
            { name: 'Flappy Bird AI', desc: '本站游戏区浏览器 DQN 推理', link: '#panel-game' }
        ],
        exploring: ['量化压缩', 'WebGPU 后端']
    },
    'Linux': {
        icon: 'fas fa-terminal',
        description: '训练环境与本地开发日常：WSL / 远程服务器、依赖环境、日志排查。',
        level: '了解',
        tags: ['训练环境', '开发工具'],
        features: ['SSH 远程连接', 'WSL 本地开发', '环境与依赖配置', '日志与进程排查'],
        projects: [{ name: '训练环境', desc: 'WSL / 远程 GPU 日常', link: '#' }],
        exploring: ['tmux 进阶', 'shell 脚本']
    },
    'Flask / FastAPI': {
        icon: 'fas fa-server',
        description: '推理 API 与资讯服务后端：Flask 暴露 DQN action，FastAPI 做每日资讯聚合。',
        level: '熟练',
        tags: ['API', '推理服务'],
        features: ['REST 推理接口', 'CORS 本地联调', '请求校验与错误处理', '异步抓取 (FastAPI)'],
        projects: [
            { name: 'Flappy Flask API', desc: 'POST /api/ai/action', link: '#' },
            { name: '每日资讯服务', desc: 'FastAPI + LLM 摘要', link: '#' }
        ],
        exploring: ['鉴权与限流', '容器化部署']
    },
    'Docker': {
        icon: 'fas fa-cube',
        description: '环境隔离与复现：训练依赖、推理服务打包。',
        level: '了解',
        tags: ['容器', '环境隔离'],
        features: ['镜像构建', '依赖锁定', '本地容器运行'],
        projects: [{ name: '环境复现', desc: '训练/推理依赖隔离', link: '#' }],
        exploring: ['compose 多服务', 'CI 镜像缓存']
    },
    'pandas / numpy': {
        icon: 'fas fa-chart-line',
        description: '特征工程与数据处理：竞赛状态特征、日志分析、训练数据清洗。',
        level: '熟练',
        tags: ['数据处理', '特征工程'],
        features: ['向量化计算', '特征构造', '日志/指标分析', '训练数据清洗'],
        projects: [
            { name: '开悟竞赛', desc: '状态特征工程', link: '#' },
            { name: '智能问答', desc: '语料清洗', link: '#' }
        ],
        exploring: ['polars', '更大数据量处理']
    },
    'Canvas': {
        icon: 'fas fa-paint-brush',
        description: '本站 10 个小游戏与星空背景的渲染层。',
        level: '熟练',
        tags: ['2D 渲染', '游戏'],
        features: ['requestAnimationFrame 循环', '碰撞与精灵绘制', '粒子系统', '高分屏适配'],
        projects: [{ name: '本站游戏中心', desc: '贪吃蛇/Flappy/打飞机/弹幕等', link: '#panel-game' }],
        exploring: ['WebGL', 'OffscreenCanvas']
    },
    'Vite': {
        icon: 'fas fa-bolt',
        description: '本站构建工具：ES Modules、代码分割、静态资源拷贝。',
        level: '熟练',
        tags: ['构建', 'HMR'],
        features: ['dev server / HMR', '懒加载 chunk', '静态资源拷贝插件', '相对 base 部署'],
        projects: [{ name: '本站', desc: 'Vite + 原生 ES Modules', link: '#' }],
        exploring: ['SSG', '更细粒度拆包']
    }
};

export default skillData;
