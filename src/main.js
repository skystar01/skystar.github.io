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
