import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMove,
  BLACK,
  countDiscs,
  EMPTY,
  flipsAt,
  initialBoard,
  legalMoves,
  searchBest,
  WHITE,
} from '../src/reversi-engine.js';

test('initialBoard sets up standard 2v2 center discs', () => {
  const board = initialBoard();
  assert.equal(board.length, 64);
  assert.deepEqual(countDiscs(board), { black: 2, white: 2 });
  assert.equal(board[27], WHITE);
  assert.equal(board[28], BLACK);
  assert.equal(board[35], BLACK);
  assert.equal(board[36], WHITE);
});

test('legalMoves returns the 4 standard opening moves for BLACK', () => {
  const board = initialBoard();
  const moves = legalMoves(board, BLACK).sort((a, b) => a - b);
  assert.deepEqual(moves, [19, 26, 37, 44]);
});

test('flipsAt and applyMove flip opponent discs accurately without mutating input', () => {
  const board = initialBoard();
  const flips = flipsAt(board, 19, BLACK);
  assert.deepEqual(flips, [27]);

  const next = applyMove(board, 19, BLACK);
  assert.equal(board[19], EMPTY);
  assert.equal(next[19], BLACK);
  assert.equal(next[27], BLACK);
  assert.deepEqual(countDiscs(next), { black: 4, white: 1 });
});

test('searchBest prioritizes corners when corner weight is high', () => {
  const board = new Array(64).fill(EMPTY);
  // 构造可抢左上角 (0) 也能走普通翻转 (19) 的局面
  board[1] = WHITE;
  board[2] = BLACK;
  board[27] = WHITE;
  board[35] = BLACK;

  const res = searchBest(board, BLACK, {
    corner: 100,
    edge: 8,
    mobility: 10,
    disc: 1,
    depth: 1,
  });
  assert.ok(res);
  assert.equal(res.move, 0);
});
