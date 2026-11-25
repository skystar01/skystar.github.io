// src/reversi-engine.js -- 黑白棋纯规则与 AI 搜索层（无 DOM/CSS 依赖，可直接单测）

export const SIZE = 8;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

// 候选顺序：角 → 边 → 内部。α-β 下好顺序能少搜一大截。
// 用代码生成而不是手写：手写漏一格会让「合法点被跳过」，是规则级错误。
const SCAN_ORDER = (() => {
  const corners = [0, 7, 56, 63];
  const edges = [];
  const inner = [];
  for (let i = 0; i < 64; i++) {
    if (corners.includes(i)) continue;
    const r = (i / 8) | 0;
    const c = i % 8;
    if (r === 0 || r === 7 || c === 0 || c === 7) edges.push(i);
    else inner.push(i);
  }
  return [...corners, ...edges, ...inner];
})();

export const opp = (p) => (p === BLACK ? WHITE : BLACK);
export const rowOf = (i) => (i / SIZE) | 0;
export const colOf = (i) => i % SIZE;
export const cellName = (i) => `${rowOf(i) + 1}行${colOf(i) + 1}列`;

/** 返回该点落子能翻掉的棋子下标；不能落则返回 null */
export function flipsAt(board, pos, player) {
  if (board[pos] !== EMPTY) return null;
  const r0 = rowOf(pos);
  const c0 = colOf(pos);
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === opp(player)) {
      line.push(r * SIZE + c);
      r += dr;
      c += dc;
    }
    if (line.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === player) {
      out.push(...line);
    }
  }
  return out.length ? out : null;
}

export function legalMoves(board, player) {
  const res = [];
  for (const i of SCAN_ORDER) {
    if (board[i] === EMPTY && flipsAt(board, i, player)) res.push(i);
  }
  return res;
}

export function applyMove(board, pos, player) {
  const next = board.slice();
  const flips = flipsAt(next, pos, player) || [];
  next[pos] = player;
  for (const f of flips) next[f] = player;
  return next;
}

export function countDiscs(board) {
  let black = 0;
  let white = 0;
  for (const v of board) {
    if (v === BLACK) black++;
    else if (v === WHITE) white++;
  }
  return { black, white };
}

export function initialBoard() {
  const b = new Array(SIZE * SIZE).fill(EMPTY);
  b[27] = WHITE;
  b[28] = BLACK; // d4=e5 摆法：黑在 e4/d5
  b[35] = BLACK;
  b[36] = WHITE;
  return b;
}

export const DEFAULT_WEIGHTS = { corner: 40, edge: 8, mobility: 10, disc: 1 };

export function evaluate(board, me, W = DEFAULT_WEIGHTS) {
  let mine = 0;
  let theirs = 0;
  let myEdge = 0;
  let theirEdge = 0;
  let myCorner = 0;
  let theirCorner = 0;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (!v) continue;
    const isMine = v === me;
    if (isMine) mine++;
    else theirs++;
    const r = rowOf(i);
    const c = colOf(i);
    const onEdge = r === 0 || r === 7 || c === 0 || c === 7;
    const onCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
    if (onCorner) {
      if (isMine) myCorner++;
      else theirCorner++;
    } else if (onEdge) {
      if (isMine) myEdge++;
      else theirEdge++;
    }
  }
  const myMob = legalMoves(board, me).length;
  const opMob = legalMoves(board, opp(me)).length;
  return (
    W.corner * (myCorner - theirCorner) +
    W.edge * (myEdge - theirEdge) +
    W.mobility * (myMob - opMob) +
    W.disc * (mine - theirs)
  );
}

function negamax(board, player, depth, alpha, beta, W) {
  const moves = legalMoves(board, player);
  if (!moves.length) {
    // 自己无处可落：对手也无所可落则终局，否则轮空一手（深度不递减，避免无限递归）
    if (!legalMoves(board, opp(player)).length) {
      const d = countDiscs(board);
      const diff = player === BLACK ? d.black - d.white : d.white - d.black;
      return diff * 1000;
    }
    return -negamax(board, opp(player), depth, -beta, -alpha, W);
  }
  if (depth <= 0) return evaluate(board, player, W);

  let best = -Infinity;
  let nextAlpha = alpha;
  for (const mv of moves) {
    const val = -negamax(
      applyMove(board, mv, player),
      opp(player),
      depth - 1,
      -beta,
      -nextAlpha,
      W,
    );
    if (val > best) best = val;
    if (best > nextAlpha) nextAlpha = best;
    if (nextAlpha >= beta) break;
  }
  return best;
}

/** 选出最佳落点，附带每个候选的评分供遥测展示 */
export function searchBest(board, player, W = { ...DEFAULT_WEIGHTS, depth: 3 }) {
  const moves = legalMoves(board, player);
  if (!moves.length) return null;
  const startedAt = performance.now();
  const scored = [];
  let best = -Infinity;
  let bestMove = moves[0];
  for (const mv of moves) {
    const val = -negamax(
      applyMove(board, mv, player),
      opp(player),
      W.depth - 1,
      -Infinity,
      Infinity,
      W,
    );
    scored.push({ move: mv, val });
    if (val > best) {
      best = val;
      bestMove = mv;
    }
  }
  const sorted = [...scored].sort((a, b) => b.val - a.val);
  return {
    move: bestMove,
    scored,
    best,
    runnerUp: sorted[1]?.val,
    ms: performance.now() - startedAt,
    depth: W.depth,
  };
}
