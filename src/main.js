/* =========================================================
 * Slide & Triple — 应用入口（boot / 编排）
 * classic script；向 window.STM 挂载（D-01）
 * 禁止 import/export 语法、动态 import()、fetch（宪章 II）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* M1 占位：DOMContentLoaded boot 入口（T020 实现） */
  function boot() {
    // T020: 读 STM.LEVELS / ?level=N 深链 → createSession → 挂 Renderer/Sound
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  STM.main = { boot: boot };
})(typeof window !== 'undefined' ? window : globalThis);
