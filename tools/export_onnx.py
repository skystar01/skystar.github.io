"""把 Flappy Dueling DQN 的 .pth 导出为 ONNX,并做数值对齐验证。

用法(系统 Python,需 torch/onnx/onnxruntime):
    python tools/export_onnx.py

产物: public/models/flappy-dqn.onnx  (Vite 会把 public/ 原样拷进 dist)
验证: 随机 2000 组状态,PyTorch 与 onnxruntime 的 argmax 必须 100% 一致,
      否则说明导出图与训练图不等价,直接报错退出。
"""
import os

import numpy as np
import torch
import torch.nn as nn

# 与 backend/app.py 完全一致的网络结构(改动训练侧时三处需同步)
class DuelingDQN(nn.Module):
    def __init__(self, state_dim, action_dim):
        super().__init__()
        self.feature = nn.Sequential(
            nn.Linear(state_dim, 128), nn.ReLU(),
            nn.Linear(128, 128), nn.ReLU(),
        )
        self.value_stream = nn.Sequential(
            nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, 1),
        )
        self.advantage_stream = nn.Sequential(
            nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, action_dim),
        )

    def forward(self, x):
        feat = self.feature(x)
        value = self.value_stream(feat)
        advantage = self.advantage_stream(feat)
        return value + advantage - advantage.mean(dim=1, keepdim=True)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "models")
OUT_PATH = os.path.join(OUT_DIR, "flappy-dqn.onnx")


def load_policy_net():
    """优先 best,其次 final,与 backend/app.py 的取模顺序一致。"""
    for name in ("best_flappy.pth", "final_flappy.pth"):
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            net = DuelingDQN(12, 2)
            net.load_state_dict(torch.load(path, map_location="cpu"))
            net.eval()
            print(f"已加载 checkpoint: {name}")
            return net
    raise FileNotFoundError("best_flappy.pth / final_flappy.pth 都不存在")


def export(net):
    os.makedirs(OUT_DIR, exist_ok=True)
    dummy = torch.zeros(1, 12)
    torch.onnx.export(
        net, dummy, OUT_PATH,
        input_names=["state"], output_names=["q_values"],
        dynamic_axes={"state": {0: "batch"}, "q_values": {0: "batch"}},
        opset_version=17,
        dynamo=False,                # 旧导出器:单文件内嵌权重,dynamo 版会拆 .onnx.data 外置文件
    )
    print(f"已导出: {OUT_PATH} ({os.path.getsize(OUT_PATH) / 1024:.1f} KB)")


def verify(net):
    """数值对齐:argmax 不一致即失败(Q 值浮点误差可容忍,决策不能变)。"""
    import onnxruntime as ort

    sess = ort.InferenceSession(OUT_PATH, providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(42)
    # 覆盖真实量级:游戏原始状态 /100 后大致在 [-5, 10] 区间
    states = rng.uniform(-5, 10, size=(2000, 12)).astype(np.float32)

    with torch.no_grad():
        torch_q = net(torch.from_numpy(states)).numpy()
    ort_q = sess.run(["q_values"], {"state": states})[0]

    max_abs_diff = np.abs(torch_q - ort_q).max()
    match = (torch_q.argmax(1) == ort_q.argmax(1)).mean()
    print(f"数值对齐: max|ΔQ|={max_abs_diff:.2e}, argmax 一致率={match * 100:.2f}%")
    if match < 1.0:
        raise SystemExit("❌ argmax 不一致,导出不等价,终止")


if __name__ == "__main__":
    policy_net = load_policy_net()
    export(policy_net)
    verify(policy_net)
    print("✅ ONNX 导出 + 验证完成")
