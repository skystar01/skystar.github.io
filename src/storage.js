// ─── 安全 localStorage 工具（ES Module 版 · 阶段1模块化验证）───
// 通过 export 提供模块化的 SkyStorage；同时保留 window.SkyStorage 兼容层，
// 让尚未改造的经典 <script defer> 脚本仍可照常调用。
//
// 模块内用法：  import SkyStorage from './storage.js'
// 经典脚本用法：window.SkyStorage.getInt('skystar:v1:flappy:best', 0)
//
// 设计要点：
// 1. 隐私模式 / 配额满 / Safari ITP 下 localStorage 会抛错，统一 try-catch
// 2. key 命名规范：skystar:v1:<scope>:<field>，带前缀防冲突、带版本便于升级
// 3. migrate()：旧 key 数据一次性迁移到新 key，老用户数据不丢

function safeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

const SkyStorage = {
  // 原始字符串读写
  get: safeGet,
  set: safeSet,
  remove: safeRemove,

  // 整数读写（失败返回 fallback）
  getInt(key, fallback = 0) {
    const v = safeGet(key);
    if (v === null) return fallback;
    const n = parseInt(v, 10);
    return isNaN(n) ? fallback : n;
  },
  setInt(key, value) {
    safeSet(key, String(value));
  },

  // JSON 读写（失败返回 fallback）
  getJSON(key, fallback = null) {
    const v = safeGet(key);
    if (v === null) return fallback;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  },
  setJSON(key, value) {
    try { safeSet(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },

  // 一次性迁移：旧 key 有数据 → 写入新 key + 删除旧 key
  // 若新 key 已有数据则跳过（已迁移过）
  migrate(oldKey, newKey) {
    const existing = safeGet(newKey);
    if (existing !== null) return false; // 已迁移过
    const oldVal = safeGet(oldKey);
    if (oldVal === null) return false;   // 旧 key 无数据
    safeSet(newKey, oldVal);
    safeRemove(oldKey);
    return true;
  }
};

// 兼容层：经典脚本通过 window 调用（模块改造完成后可移除）
if (typeof window !== 'undefined') {
  window.SkyStorage = SkyStorage;
}

export default SkyStorage;
export { SkyStorage };
