/* =========================================================
 * Slide & Triple — SoundManager（Web Audio 纯代码合成音效）
 * classic script；向 window.STM 挂载（D-01）
 * AudioContext 首次 pointerdown 惰性创建（autoplay 政策）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* T018: createSoundManager 占位 */
  function createSoundManager(opts) {
    // 占位：M1 实现振荡器合成音效
    return {
      play: function () {},
      setMuted: function () {}
    };
  }

  STM.createSoundManager = createSoundManager;
})(typeof window !== 'undefined' ? window : globalThis);
