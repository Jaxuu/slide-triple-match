/* =========================================================
 * Slide & Triple — GameState（会话编排层）
 * classic script；向 window.STM 挂载（D-01）
 * 不实现任何规则（纯编排）——规则语义全部在 RulesEngine
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* T014/T015: createSession 状态机占位 */
  function createSession(levelDef, handlers) {
    // 占位：M1 实现状态机 LOADING→READY⇄ANIMATING→SETTLING→READY / WON|LOST_*
    return {
      tap: function () {},
      reset: function () {},
      state: function () { return {}; }
    };
  }

  STM.GameState = { createSession: createSession };
})(typeof window !== 'undefined' ? window : globalThis);
