import gymnasium as gym
import flappy_bird_gymnasium
import torch
import torch.nn as nn

# -------------------- 定义与训练时相同的网络结构（Dueling DQN）--------------------
class DuelingDQN(nn.Module):
    """
    Dueling DQN：将Q值分解为 V(s) + A(s,a)
    比普通DQN更稳定，尤其在动作差异不大时
    """
    def __init__(self, state_dim, action_dim):
        super(DuelingDQN, self).__init__()
        self.feature = nn.Sequential(
            nn.Linear(state_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
        )
        # 状态价值流
        self.value_stream = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1)
        )
        # 动作优势流
        self.advantage_stream = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, action_dim)
        )

    def forward(self, x):
        feat = self.feature(x)
        value = self.value_stream(feat)
        advantage = self.advantage_stream(feat)
        # Q(s,a) = V(s) + A(s,a) - mean(A(s,·))
        return value + advantage - advantage.mean(dim=1, keepdim=True)

# -------------------- 测试函数 --------------------
def test(model_path, render=True):
    # 创建环境（带画面渲染）
    env = gym.make("FlappyBird-v0", use_lidar=False, render_mode="human" if render else None)
    state_dim = env.observation_space.shape[0]
    action_dim = env.action_space.n

    # 加载模型（使用与训练相同的DuelingDQN结构）
    policy_net = DuelingDQN(state_dim, action_dim)
    policy_net.load_state_dict(torch.load(model_path, map_location="cpu"))
    policy_net.eval()

    state, _ = env.reset()
    total_reward = 0
    done = False
    while not done:
        # 模型预测动作
        with torch.no_grad():
            state_t = torch.FloatTensor(state).unsqueeze(0)
            q_values = policy_net(state_t)
            action = q_values.argmax().item()

        state, reward, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
        total_reward += reward

    print(f"Test finished. Total reward: {total_reward:.2f}")
    env.close()

if __name__ == "__main__":
    # 请确保 best_flappy.pth 在当前目录下
    test("best_flappy.pth", render=True)
