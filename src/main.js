// ─── 阶段1：模块化入口（ES Module）───
// storage.js 是第一个改造的模块；其余所有脚本已合并进 src/app.js 单一模块，
// 保持与原全局脚本完全一致的行为（共享模块作用域），由 Vite 统一打包。
// game-plane.js 由 game-shell 按需动态 import，不在此预载。

import SkyStorage from './storage.js';

// 确保全局兼容层存在（storage.js 内已挂，这里再确认一次执行顺序可控）
if (typeof window !== 'undefined') {
  window.SkyStorage = SkyStorage;
}

// 载入全部应用脚本（星空背景 / UI / 特效 / 叙事 / 游戏外壳 / 各游戏）
import './app.js';

// ─── AI 算法标签联动 ───
// 让 .ai-algo-tag 在游戏 AI 激活时进入"脉动态"(加 .ai-algo-tag--active),
// 配合 CSS 实现: 默认呼吸 + hover 放大 → AI 激活时强发光 + 缩放脉动。
// 不读游戏内部状态(避免耦合), 改成"按钮 click → 60ms 后同步 toggle 标签"——
// 游戏代码基本都在 toggle 内部 setTimeout 切 class, 60ms 足够追上。
function bindAiAlgoTag(btnId, tagSelector, getActive) {
  const btn = document.getElementById(btnId);
  const tag = document.querySelector(tagSelector);
  if (!btn || !tag) return;
  // 初始同步
  tag.classList.toggle('ai-algo-tag--active', !!getActive(btn));
  // 按钮 click 后, 短暂延迟让游戏切完状态, 再同步
  btn.addEventListener('click', () => {
    setTimeout(() => {
      tag.classList.toggle('ai-algo-tag--active', !!getActive(btn));
    }, 60);
  });
}

// 5 个独立 AI 按钮: 读按钮上的 .ai-active class (snake/2048/tetris/tictactoe 用这个标记)
// flappy 例外, 看按钮文字里是否含"停止"
const hasAiActive = (btn) => btn.classList.contains('ai-active');
const isFlappyActive = (btn) => /停止|取消|Stop|stop/i.test(btn.textContent);

bindAiAlgoTag('gameAI',         '.game-snake         .ai-algo-tag', hasAiActive);
bindAiAlgoTag('toggleAI2048',   '.game-2048          .ai-algo-tag', hasAiActive);
bindAiAlgoTag('tetrisAI',       '.game-tetris        .ai-algo-tag', hasAiActive);
bindAiAlgoTag('ticTacToeAI',    '.game-tic-tac-toe   .ai-algo-tag', hasAiActive);
bindAiAlgoTag('flappyAIButton', '.game-flappy        .ai-algo-tag', isFlappyActive);

// gomoku: 没有独立 AI 按钮, AI 在 pve 模式下自动启用, 监听 mode 切换
const gomokuPveBtn = document.querySelector('.gomoku-mode-btn[data-mode="pve"]');
const gomokuTag = document.querySelector('.game-gomoku .ai-algo-tag');
if (gomokuPveBtn && gomokuTag) {
  const syncGomoku = () => {
    gomokuTag.classList.toggle('ai-algo-tag--active', gomokuPveBtn.classList.contains('active'));
  };
  document.querySelectorAll('.gomoku-mode-btn').forEach((b) => {
    b.addEventListener('click', () => setTimeout(syncGomoku, 60));
  });
  // 初始: pve 默认 active (index.html 里 .active 初始落在 pve)
  syncGomoku();
}
