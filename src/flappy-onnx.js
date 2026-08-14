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
// ⚠️ 关键坑:wasm 路径必须是「绝对 URL」,不能是相对路径。
//   - vite base 是 './',import.meta.env.BASE_URL 只返回 './',无法提供
//     GitHub Pages 的子路径(/skystar.github.io/)。
//   - 若给 onnxruntime 相对路径 './models/',它会把请求解析到
//     它自己 bundle 所在的 assets/ 目录 → 请求 assets/models/...wasm → 404。
//   - 用 document.baseURI 取页面绝对目录(自带子路径),拼出绝对 URL,
//     onnxruntime 才会老老实实去 <origin>/<子路径>/models/ 下加载。
function resolveModelsDir() {
  const uri = document.baseURI || location.href;
  return uri.slice(0, uri.lastIndexOf('/') + 1) + 'models/';
}
const WASM_DIR = resolveModelsDir();
const MODEL_URL = WASM_DIR + 'flappy-dqn.onnx';

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
 * 输入 12 维原始游戏状态,输出动作 0(不动)/ 1(拍翅)
 * 与 Flask 版 /api/ai/action 的语义完全等价
 */
export async function predictAction(rawState) {
    const { ort, session } = await loadFlappyAi();
    const input = new Float32Array(12);
    for (let i = 0; i < 12; i++) input[i] = rawState[i] / 100;
    const tensor = new ort.Tensor('float32', input, [1, 12]);
    const result = await session.run({ state: tensor });
    const q = result.q_values.data;
    return q[0] >= q[1] ? 0 : 1;
}
