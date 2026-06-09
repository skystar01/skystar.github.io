
# Flappy Bird AI 后端

## 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

## 运行后端

```bash
python app.py
```

后端将在 `http://127.0.0.1:5000` 启动

## 使用 AI 模式

1. 确保后端已启动
2. 在游戏界面按 `A` 键切换到 AI 模式
3. 按 `空格键` 开始游戏，AI 将自动控制小鸟

## API 端点

### POST /api/ai/action
获取 AI 动作

请求体:
```json
{
  "state": [12维数组]
}
```

响应:
```json
{
  "action": 0 或 1,
  "q_values": [两个动作的Q值]
}
```

## 状态格式

12维状态数组:
```
[
  last_pipe_x,
  last_pipe_top_y,
  last_pipe_bottom_y,
  next_pipe_x,
  next_pipe_top_y,
  next_pipe_bottom_y,
  next_next_pipe_x,
  next_next_pipe_top_y,
  next_next_pipe_bottom_y,
  bird_y,
  bird_velocity,
  bird_rotation
]
```

