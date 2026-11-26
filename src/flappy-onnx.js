// =============================================
// flappy-onnx.js — Flappy DQN 浏览器端推理
// 设计要点:
//  - 懒加载:onnxruntime-web 的 WASM(~7MB)只在首次召唤 AI 时下载,
//    通过动态 import 单独成 chunk,不拖累首屏与游戏包
//  - 归一化规则必须与 backend/app.py 完全一致:state / 100
//  - 单线程 WASM:onnxruntime-web 1.16.3 自带非 jsep 的 ort-wasm-simd.wasm,
//    numThreads=1 时主线程加载它,不依赖 SharedArrayBuffer,
//    GitHub Pages(无 COOP/COEP 跨域隔离头)也能跑。
//  - 单例:session 只建一次,后续推理复用
// =============================================

// wasm 运行时放在 public/models/(包体 exports 不放行深路径,走静态目录最稳)。
//
// ✅ 路径策略:用 import.meta.url 取当前 chunk 的绝对 URL,再推算 models/ 目录。
//   - Dev 模式:  src/flappy-onnx.js        → ../models/ → /models/
//   - GitHub Pages: assets/game-flappy-xxx.js → ../models/ → /repo/models/
//   这比 document.baseURI 更可靠:不依赖 DOM,不受页面 URL 格式(有无尾斜杠)影响,
//   Vite/Rollup 会在构建时把 import.meta.url 替换为 chunk 的真实 URL。
const WASM_DIR = new URL('../models/', import.meta.url).href;
const MODEL_URL = new URL('../models/flappy-dqn.onnx', import.meta.url).href;

// 推理上下文单例({ ort, session }),重复调用复用同一个 Promise
let contextPromise = null;

function createContext() {
    return import('onnxruntime-web').then(async (ort) => {
        // 单线程:GitHub Pages 无 COOP/COEP 头,多线程不可用
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = WASM_DIR;
        const session = await ort.InferenceSession.create(MODEL_URL);
        return { ort, session };
    });
}

/** 加载模型(幂等);首次调用触发下载,之后秒回 */
export function loadFlappyAi() {
    if (!contextPromise) contextPromise = createContext();
    return contextPromise;
}

/**
 * 输入经过 gymnasium 归一化的 12 维状态数组,输出动作 0(不动)/ 1(拍翅)
 *
 * ⚠️ 调用方必须先调用 toGymState() 做坐标系转换,再传入此函数。
 *    训练时 obs space = Box(-1, 1),直接传原始像素坐标会导致 AI 完全失效。
 */
export async function predictAction(gymState) {
    const { ort, session } = await loadFlappyAi();
    const input = new Float32Array(gymState);   // 已归一化,直接用
    const tensor = new ort.Tensor('float32', input, [1, 12]);
    const result = await session.run({ state: tensor });
    const q = result.q_values.data;
    return q[0] >= q[1] ? 0 : 1;
}
