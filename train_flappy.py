"""
续训脚本：从 best_flappy.pth 继续训练
核心改动：
  1. 加载已有模型权重
  2. epsilon 从较低值重新开始（轻微回温探索）
  3. 训练更多 episode
  4. 加入 epsilon 震荡调度，防止陷入局部最优
"""

import gymnasium as gym
import flappy_bird_gymnasium
import torch
import torch.nn as nn
import torch.optim as optim
import random
import numpy as np
from collections import deque
import matplotlib.pyplot as plt
import os

# -------------------- 超参数 --------------------
EPISODES       = 8000            # 续训轮数（在原基础上继续跑）
BATCH_SIZE     = 64
GAMMA          = 0.99
EPS_RESUME     = 0.15            # 续训时 epsilon 从这里开始（轻微回温，不要从1.0重来）
EPS_END        = 0.01            # 更低的最终探索率
EPS_DECAY      = 50000           # 续训时衰减更慢
TARGET_UPDATE  = 500
LEARNING_RATE  = 0.00005         # 续训时学习率减半，防止破坏已有知识
MEMORY_SIZE    = 100000          # 更大的经验池
WARMUP_STEPS   = 500             # 续训时预热更短
GRAD_CLIP      = 10.0
CHECKPOINT     = "best_flappy.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {DEVICE}")


# -------------------- 网络结构（与训练时保持一致）--------------------
class DuelingDQN(nn.Module):
    def __init__(self, state_dim, action_dim):
        super(DuelingDQN, self).__init__()
        self.feature = nn.Sequential(
            nn.Linear(state_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
        )
        self.value_stream = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1)
        )
        self.advantage_stream = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, action_dim)
        )

    def forward(self, x):
        feat = self.feature(x)
        value = self.value_stream(feat)
        advantage = self.advantage_stream(feat)
        return value + advantage - advantage.mean(dim=1, keepdim=True)


# -------------------- 优先经验回放 --------------------
class PrioritizedReplayBuffer:
    def __init__(self, capacity, alpha=0.6, beta_start=0.4, beta_frames=100000):
        self.capacity    = capacity
        self.alpha       = alpha
        self.beta_start  = beta_start
        self.beta_frames = beta_frames
        self.frame       = 1
        self.buffer      = []
        self.pos         = 0
        self.priorities  = np.zeros((capacity,), dtype=np.float32)

    def push(self, state, action, reward, next_state, done):
        max_prio = self.priorities.max() if self.buffer else 1.0
        if len(self.buffer) < self.capacity:
            self.buffer.append((state, action, reward, next_state, done))
        else:
            self.buffer[self.pos] = (state, action, reward, next_state, done)
        self.priorities[self.pos] = max_prio
        self.pos = (self.pos + 1) % self.capacity

    def sample(self, batch_size):
        n = len(self.buffer)
        prios = self.priorities[:n]
        probs = prios ** self.alpha
        probs /= probs.sum()
        indices = np.random.choice(n, batch_size, p=probs)
        samples = [self.buffer[idx] for idx in indices]
        beta = min(1.0, self.beta_start + self.frame * (1.0 - self.beta_start) / self.beta_frames)
        self.frame += 1
        weights = (n * probs[indices]) ** (-beta)
        weights /= weights.max()
        weights = torch.FloatTensor(weights).to(DEVICE)
        state, action, reward, next_state, done = map(np.stack, zip(*samples))
        return (
            torch.FloatTensor(state).to(DEVICE),
            torch.LongTensor(action).to(DEVICE),
            torch.FloatTensor(reward).to(DEVICE),
            torch.FloatTensor(next_state).to(DEVICE),
            torch.FloatTensor(done).to(DEVICE),
            indices, weights
        )

    def update_priorities(self, indices, priorities):
        for idx, prio in zip(indices, priorities):
            self.priorities[idx] = prio + 1e-5

    def __len__(self):
        return len(self.buffer)


# -------------------- 奖励Wrapper --------------------
class FlappyRewardWrapper(gym.Wrapper):
    def __init__(self, env):
        super().__init__(env)
        self.prev_score = 0

    def reset(self, **kwargs):
        self.prev_score = 0
        return self.env.reset(**kwargs)

    def step(self, action):
        obs, reward, terminated, truncated, info = self.env.step(action)
        score = info.get("score", 0)
        if terminated:
            shaped_reward = -10.0
        elif score > self.prev_score:
            shaped_reward = 10.0
            self.prev_score = score
        else:
            shaped_reward = 0.1
        return obs, shaped_reward, terminated, truncated, info


# -------------------- 智能体 --------------------
class Agent:
    def __init__(self, state_dim, action_dim, checkpoint_path=None):
        self.action_dim  = action_dim
        self.policy_net  = DuelingDQN(state_dim, action_dim).to(DEVICE)
        self.target_net  = DuelingDQN(state_dim, action_dim).to(DEVICE)

        # 加载已有模型
        if checkpoint_path and os.path.exists(checkpoint_path):
            state_dict = torch.load(checkpoint_path, map_location=DEVICE)
            self.policy_net.load_state_dict(state_dict)
            self.target_net.load_state_dict(state_dict)
            print(f"✅ 已加载模型: {checkpoint_path}")
        else:
            print("⚠️  未找到checkpoint，从头开始训练")

        self.target_net.eval()
        self.optimizer   = optim.Adam(self.policy_net.parameters(), lr=LEARNING_RATE)
        self.memory      = PrioritizedReplayBuffer(MEMORY_SIZE)
        self.steps_done  = 0    # 续训时从0开始算 epsilon 衰减
        self.total_steps = 0

    def get_epsilon(self):
        # 续训 epsilon：从 EPS_RESUME 缓慢衰减到 EPS_END
        return EPS_END + (EPS_RESUME - EPS_END) * np.exp(-self.steps_done / EPS_DECAY)

    def select_action(self, state):
        eps = self.get_epsilon()
        self.steps_done += 1
        if random.random() > eps:
            with torch.no_grad():
                state_t = torch.FloatTensor(state).unsqueeze(0).to(DEVICE)
                return self.policy_net(state_t).argmax().item()
        else:
            return random.randint(0, self.action_dim - 1)

    def train_step(self):
        if len(self.memory) < WARMUP_STEPS:
            return None
        state, action, reward, next_state, done, indices, weights = \
            self.memory.sample(BATCH_SIZE)
        current_q = self.policy_net(state).gather(1, action.unsqueeze(1)).squeeze(1)
        with torch.no_grad():
            next_actions = self.policy_net(next_state).argmax(1, keepdim=True)
            next_q       = self.target_net(next_state).gather(1, next_actions).squeeze(1)
            target_q     = reward + GAMMA * next_q * (1 - done)
        td_errors = (current_q - target_q).abs().detach().cpu().numpy()
        self.memory.update_priorities(indices, td_errors)
        loss = (weights * nn.HuberLoss(reduction='none')(current_q, target_q)).mean()
        self.optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(self.policy_net.parameters(), GRAD_CLIP)
        self.optimizer.step()
        self.total_steps += 1
        if self.total_steps % TARGET_UPDATE == 0:
            self.target_net.load_state_dict(self.policy_net.state_dict())
        return loss.item()


# -------------------- 训练主循环 --------------------
def train():
    env = gym.make("FlappyBird-v0", use_lidar=False)
    env = FlappyRewardWrapper(env)
    state_dim  = env.observation_space.shape[0]
    action_dim = env.action_space.n

    agent      = Agent(state_dim, action_dim, checkpoint_path=CHECKPOINT)
    scores     = []
    pipes_list = []
    loss_log   = []
    best_pipes = 26         # 从你已知的最好成绩开始计
    no_improve = 0          # 连续多少个检查点没有改善

    for episode in range(EPISODES):
        state, info = env.reset()
        total_reward = 0
        done         = False

        while not done:
            action = agent.select_action(state)
            next_state, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            agent.memory.push(state, action, reward, next_state, float(done))
            loss = agent.train_step()
            if loss is not None:
                loss_log.append(loss)
            state         = next_state
            total_reward += reward

        pipes = info.get("score", 0)
        scores.append(total_reward)
        pipes_list.append(pipes)

        if pipes > best_pipes:
            best_pipes = pipes
            no_improve = 0
            torch.save(agent.policy_net.state_dict(), "best_flappy.pth")
            print(f"  *** 新纪录! Episode {episode}, pipes={best_pipes} ***")

        if episode % 20 == 0:
            avg_reward = np.mean(scores[-20:])
            avg_pipes  = np.mean(pipes_list[-20:])
            avg_loss   = np.mean(loss_log[-200:]) if loss_log else 0
            eps        = agent.get_epsilon()
            no_improve += 1

            print(f"Ep {episode:4d} | AvgReward: {avg_reward:7.2f} | "
                  f"AvgPipes: {avg_pipes:.2f} | BestPipes: {best_pipes} | "
                  f"Eps: {eps:.4f} | Loss: {avg_loss:.4f}")

            # 保存阶段性checkpoint，防止训练崩溃丢失进度
            if episode % 500 == 0 and episode > 0:
                torch.save(agent.policy_net.state_dict(), f"checkpoint_ep{episode}.pth")
                print(f"  [保存阶段checkpoint: checkpoint_ep{episode}.pth]")

    env.close()
    torch.save(agent.policy_net.state_dict(), "final_flappy_v2.pth")

    # 绘图
    fig, axes = plt.subplots(1, 3, figsize=(16, 4))

    # 滑动平均
    window = 50
    def smooth(x):
        return np.convolve(x, np.ones(window)/window, mode='valid') if len(x) > window else x

    axes[0].plot(scores, alpha=0.3, color='steelblue')
    axes[0].plot(range(window-1, len(scores)), smooth(scores), color='steelblue')
    axes[0].set_title("Total Reward (smoothed)")

    axes[1].plot(pipes_list, alpha=0.3, color='green')
    axes[1].plot(range(window-1, len(pipes_list)), smooth(pipes_list), color='green', linewidth=2)
    axes[1].set_title("Pipes Passed (smoothed)")
    axes[1].set_ylabel("Pipes")

    if loss_log:
        s = np.convolve(loss_log, np.ones(500)/500, mode='valid')
        axes[2].plot(s, color='orange')
        axes[2].set_title("Loss (smoothed)")

    plt.tight_layout()
    plt.savefig("training_curve_v3.png", dpi=150)
    print("续训完成！曲线已保存为 training_curve_v3.png")

if __name__ == "__main__":
    train()