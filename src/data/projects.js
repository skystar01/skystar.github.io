// 项目详情数据（展示层只读；改文案/截图/指标改这里即可）
export const projectData = {
    '智能博弈算法': {
        icon:'icon-chess',
        description:'2025 腾讯开悟人工智能全球公开赛（智能体决策算法-中级赛道）参赛项目。我作为星之队（成都师范学院）成员，与队友合作基于 DQN / Target DQN / PPO 修改奖励设计、特征处理和超参数调整，两个月时间训练出强化学习智能体。\n\n初赛（自动寻路+道具收集智能体）：川渝地区二等奖（全国总榜第 4 名）\n复赛（智能体对战）：全国第 9 名\n\n证书编号：202501020009（2025 年 12 月颁发）',
        progress:95,
        techStack:'RL,DQN,PPO,PyTorch,竞赛',
        level:'主秀',
        tags:['强化学习','DQN','PPO','竞赛获奖'],
        features:['DQN / Target DQN 算法实现','PPO 算法调参与实验','奖励函数设计 (reward shaping)','特征工程与状态表示','超参数调优','团队协作'],
        link:'https://github.com/skystar01/my-created',
        linkLabel:'查看代码',
        metrics:[{k:'初赛全国',v:'#4'},{k:'复赛全国',v:'#9'},{k:'奖项',v:'川渝二等奖'}],
        screenshots:['images/kaiwu-stats.svg','images/award-kaiwu-final-page1.webp']
    },
    'Flappy Bird AI': {
        icon:'icon-flappy',
        description:'从零实现的 Flappy Bird AI 训练与部署项目。算法核心：Dueling DQN（拆分 Value / Advantage 流）+ Prioritized Experience Replay（带 alpha / beta 退火）+ 自定义 Reward Wrapper（过管 +10、死亡 -10、存活 +0.1）。\n\n完整跑通的 pipeline：\n  1) 自定义 Gym 环境\n  2) Dueling DQN 网络（PyTorch）\n  3) Reward Wrapper 与训练循环（含 epsilon 衰减、Huber Loss、Grad Clip、Target Network 同步）\n  4) Checkpoint 保存（best_flappy.pth / final_flappy.pth）\n  5) Flask API 暴露推理接口\n  6) 前端 Canvas + 浏览器 ONNX 本地推理\n\n训练好的模型已部署在本站游戏区，可直接召唤 AI 试玩。',
        progress:90,
        techStack:'PyTorch,Flask,DQN,ONNX,RL',
        level:'主秀',
        tags:['Dueling DQN','PER','Reward Shaping','端到端','部署'],
        features:['Dueling DQN 网络结构','Prioritized Experience Replay','自定义 Reward Wrapper','Huber Loss + Gradient Clipping','Target Network 定期同步','Flask API 推理服务','浏览器 ONNX 本地推理'],
        link:'https://github.com/skystar01/skystar.github.io',
        linkLabel:'查看代码',
        playTarget:'game',
        playLabel:'在本站试玩 AI',
        metrics:[{k:'算法',v:'Dueling DQN'},{k:'回放',v:'PER'},{k:'推理',v:'ONNX / Flask'}],
        screenshots:['images/flappy-pipeline.svg','images/flappy-curve.svg']
    },
    '智能问答系统': {
        icon:'icon-chat',
        description:'本科毕业设计。基于开源项目 jingyaogong/minimind 实现，从零预训练轻量级中文对话 Transformer 模型。\n\n完整跑通 数据清洗 → tokenizer 配置 → 模型训练 → 推理脚本 → FastAPI 封装 端到端流程。租显卡完成训练，最终模型可进行基础中文多轮对话。\n\n定位：重在流程完整，模型效果受限于参数量与训练资源。',
        progress:75,
        techStack:'PyTorch,FastAPI,NLP',
        level:'副秀',
        tags:['NLP','Transformer','端到端'],
        features:['参考开源项目 minimind','中文对话数据集处理','轻量级 Transformer 训练','数据处理 pipeline','基础多轮对话生成'],
        link:'https://github.com/skystar01/my-created',
        linkLabel:'查看代码',
        metrics:[{k:'方向',v:'中文对话'},{k:'流程',v:'端到端'},{k:'服务',v:'FastAPI'}],
        screenshots:['images/qa-pipeline.svg']
    }
};

export default projectData;
