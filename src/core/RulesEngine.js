/* =========================================================
 * Slide & Triple — RulesEngine（前后端共用纯函数规则引擎）
 * UMD 双导出（D-02）：浏览器挂 STM.RulesEngine / Node module.exports
 * 纯函数、零 DOM / 音频 / 存储依赖——Node 可 require 是硬约束
 * ========================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (global.STM = global.STM || {}).RulesEngine = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* T006/T008~T013: 规则引擎实现占位 */

  /* API 占位导出 */
  return {
    init: function () {},
    canTap: function () {},
    applyTap: function () {},
    applyItem: function () {},
    stageTile: function () {},
    terminal: function () {},
    deadlockSuspect: function () {},
    enumerateTaps: function () {},
    validateLevel: function () {},
    renderProbe: function () {},
    snapshot: function () {},
    restore: function () {}
  };
});
