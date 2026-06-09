import onnxruntime as ort
import numpy as np

# 尝试加载模型
try:
    sess = ort.InferenceSession("model.onnx")
    print("✅ 模型在本地可以正常加载!")
    # 可选：进行一次推理测试
    dummy_input = np.random.randn(1, 12).astype(np.float32)
    outputs = sess.run(None, {"input": dummy_input})
    print(f"✅ 模型推理测试通过! 输出: {outputs}")
except Exception as e:
    print(f"❌ 模型加载或推理失败: {e}")