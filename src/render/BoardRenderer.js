/* =========================================================
 * Slide & Triple — BoardRenderer（Canvas 2D 渲染）
 * classic script；向 window.STM 挂载（D-01）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* T016/T017: createBoardRenderer 占位 */
  function createBoardRenderer(canvas, session, opts) {
    // 占位：M1 实现 rAF 脏检查主循环、花色表绘制、动效
    return {};
  }

  STM.createBoardRenderer = createBoardRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
