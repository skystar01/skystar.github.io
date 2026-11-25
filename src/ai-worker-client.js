// src/ai-worker-client.js -- Web Worker 异步调用封装（支持无 Worker 环境自动降级为主线程执行）
import { searchBest } from './reversi-engine.js';

let worker = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => {
      const { id, ok, result, error } = event.data || {};
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error || 'AI worker error'));
    });
    worker.addEventListener('error', () => {
      // Worker 加载或运行失败时清理挂起请求并永久降级回主线程，避免卡死对局
      workerFailed = true;
      for (const entry of pending.values()) {
        entry.reject(new Error('AI worker unavailable'));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/**
 * 在 Web Worker 中异步执行任务；Worker 不可用或异常时自动降级到 fallback。
 * @template T
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {() => T} fallback
 * @returns {Promise<T>}
 */
export function runAiTask(type, payload, fallback) {
  const w = getWorker();
  if (!w) return Promise.resolve().then(fallback);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, payload });
  }).catch(() => fallback());
}

/**
 * 异步执行黑白棋最佳落点搜索（优先走 Web Worker，异常自动降级主线程）。
 * @param {number[]} board
 * @param {number} player
 * @param {{ corner: number, edge: number, mobility: number, disc: number, depth: number }} weights
 */
export function searchReversiAsync(board, player, weights) {
  return runAiTask('reversi:search', { board, player, weights }, () =>
    searchBest(board, player, weights),
  );
}
