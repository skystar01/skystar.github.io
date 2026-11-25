import assert from 'node:assert/strict';
import test from 'node:test';
import { searchReversiAsync } from '../src/ai-worker-client.js';
import { BLACK, DEFAULT_WEIGHTS, initialBoard, legalMoves } from '../src/reversi-engine.js';

test('searchReversiAsync falls back to main thread when Worker is unavailable', async () => {
  const board = initialBoard();
  const res = await searchReversiAsync(board, BLACK, { ...DEFAULT_WEIGHTS, depth: 2 });
  assert.ok(res);
  assert.ok(legalMoves(board, BLACK).includes(res.move));
  assert.equal(res.depth, 2);
});
