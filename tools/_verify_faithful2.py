"""真正的忠实性校验:同一次 gym 运行,每步同时算 torch 与 onnx 动作,数不一致步数。
(总分不能直接比,因为 gym 管子间隙随机,两次独立 run 拿到不同关卡。)
"""
import sys, numpy as np, gymnasium as gym, flappy_bird_gymnasium, torch, torch.nn as nn
import onnxruntime as ort

class DuelingDQN(nn.Module):
    def __init__(self, d, a):
        super().__init__()
        self.feature = nn.Sequential(nn.Linear(d,128),nn.ReLU(),nn.Linear(128,128),nn.ReLU())
        self.value_stream = nn.Sequential(nn.Linear(128,64),nn.ReLU(),nn.Linear(64,1))
        self.advantage_stream = nn.Sequential(nn.Linear(128,64),nn.ReLU(),nn.Linear(64,a))
    def forward(self, x):
        f=self.feature(x); return self.value_stream(f)+self.advantage_stream(f)-self.advantage_stream(f).mean(1,keepdim=True)

net = DuelingDQN(12,2); net.load_state_dict(torch.load('best_flappy.pth', map_location='cpu')); net.eval()
SESS = ort.InferenceSession('public/models/flappy-dqn.onnx', providers=['CPUExecutionProvider'])

e=gym.make('FlappyBird-v0', use_lidar=False)
total=0; mismatch=0; max_abs=0.0
for ep in range(20):
    s,_=e.reset()
    for _ in range(4000):
        with torch.no_grad():
            qt=net(torch.from_numpy(s).float().unsqueeze(0))[0].numpy()
        qo=SESS.run(['q_values'], {'state': np.asarray(s,np.float32)[None,:]})[0][0]
        at=int(qt[0]<qt[1]); ao=int(qo[0]<qo[1])
        max_abs=max(max_abs, np.abs(qt-qo).max())
        if at!=ao: mismatch+=1
        total+=1
        s,r,tc,tr,info=e.step(at)   # 用 torch 动作推进,保证两端看同一关卡
        if tc or tr: break
print(f"总步数 {total} | 动作不一致 {mismatch} ({mismatch/total*100:.2f}%) | max|ΔQ|={max_abs:.2e}")
print("结论:", "✅ 逐状态一致 -> onnx 忠实 == torch,部署此 onnx 浏览器应和 Flask 一样飞" if mismatch==0 else "❌ 有不一致 -> 导出有数值偏差")
