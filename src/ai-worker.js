// src/ai-worker.js -- 统一 AI 搜索 Web Worker（隔离高耗时搜索，避免阻塞主线程渲染）
import { searchBest } from './reversi-engine.js';

self.addEventListener('message', (event) => {
  const { id, type, payload } = event.data || {};
  try {
    let result = null;
    if (type === 'reversi:search') {
      const { board, player, weights } = payload;
      result = searchBest(board, player, weights);
    } else {
      throw new Error(`Unknown worker task type: ${String(type)}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
