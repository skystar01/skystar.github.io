// =============================================
// flappy-onnx.js — Flappy DQN 浏览器端推理
// 设计要点:
//  - 懒加载:onnxruntime-web 的 WASM(~7MB)只在首次召唤 AI 时下载,
//    通过动态 import 单独成 chunk,不拖累首屏与游戏包
//  - 归一化规则必须与 backend/app.py 完全一致:state / 100
//  - 单线程 WASM:GitHub Pages 无 COOP/COEP 头,多线程 SIMD 不可用
//  - 单例:session 只建一次,后续推理复用
// =============================================

const WASM_BASE = import.meta.env.BASE_URL + 'models/';
const MODEL_URL = WASM_BASE + 'flappy-dqn.onnx';
// wasm 运行时放在 public/models/(包体 exports 不放行深路径,走静态目录最稳)。
// 必须用 import.meta.env.BASE_URL 拼出带 "./"(或子路径)前缀的目录,
// 否则浏览器会把 ort-wasm-simd-threaded.jsep.mjs 当成裸模块标识符而解析失败
// (报 "Failed to resolve module specifier")。
const WASM_DIR = WASM_BASE;

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
