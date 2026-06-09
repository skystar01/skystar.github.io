
import os
import torch
import torch.nn as nn
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='..')
CORS(app)

# Dueling DQN 网络结构
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

# 全局模型变量
policy_net = None
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def load_model():
    global policy_net
    model_path = 'best_flappy.pth'
    if not os.path.exists(model_path):
        model_path = 'final_flappy.pth'
    if not os.path.exists(model_path):
        raise FileNotFoundError('模型文件不存在')
    
    policy_net = DuelingDQN(state_dim=12, action_dim=2)
    policy_net.load_state_dict(torch.load(model_path, map_location=device))
    policy_net.to(device)
    policy_net.eval()
    print(f'✅ 模型加载成功: {model_path}')

@app.route('/')
def index():
    return send_from_directory('..', 'index.html')

@app.route('/&lt;path:path&gt;')
def static_files(path):
    return send_from_directory('..', path)

@app.route('/api/ai/action', methods=['POST'])
def get_ai_action():
    global policy_net
    if policy_net is None:
        return jsonify({'error': 'Model not loaded'}), 500
    
    try:
        data = request.json
        state = data.get('state')
        
        if state is None or len(state) != 12:
            return jsonify({'error': 'Invalid state'}), 400
        
        # 归一化状态
        state_normalized = np.array(state) / 100.0
        state_tensor = torch.FloatTensor(state_normalized).unsqueeze(0).to(device)
        
        with torch.no_grad():
            q_values = policy_net(state_tensor)
            action = q_values.argmax(dim=1).item()
        
        return jsonify({
            'action': action,
            'q_values': q_values.cpu().numpy().tolist()[0]
        })
    
    except Exception as e:
        print(f'❌ 推理错误: {e}')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    try:
        load_model()
    except Exception as e:
        print(f'❌ 模型加载失败: {e}')
        print('⚠️ 使用规则基模式运行')
        policy_net = None
    
    print('🚀 Flask 服务器启动中...')
    app.run(host='127.0.0.1', port=5000, debug=True)

