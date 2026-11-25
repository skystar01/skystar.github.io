// src/dom-ready.js -- 兼容动态 import() 懒加载的 DOM 就绪钩子

/**
 * 文档已就绪则立即执行回调，否则等待 DOMContentLoaded。
 * @param {() => void} cb
 */
export function whenDomReady(cb) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb);
  } else {
    cb();
  }
}
