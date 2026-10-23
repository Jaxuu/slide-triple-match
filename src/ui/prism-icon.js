/* =========================================================
 * Slide & Triple — 七彩切面棱晶图标（单一来源）
 *
 * ingame-hud-render-defects（Bug 9）: 大厅右上角货币栏与局内顶栏 /
 * 道具购买角标必须消费**同一颗**棱晶 SVG。此常量原先私有于 lobby.js
 * 的 IIFE 内（无法被 main.js 引用），导致局内只能退化为 Emoji。
 *
 * 装载序: modals.js → prism-icon.js → lobby.js（lobby 依赖本模块）。
 * 纯字符串拼接，零外部资源（宪章 III）。
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* 7 个 polygon 原样搬移自大厅 GEM_SVG（切面配色铁律——不得分叉） */
  var BODY =
    '<polygon points="16,2 28,9 28,17 16,30 4,17 4,9" fill="#8F6FD6" opacity=".32"/>' +
    '<polygon points="16,2 28,9 16,14" fill="#FF6B9D"/>' +
    '<polygon points="16,2 16,14 4,9" fill="#FFC53D"/>' +
    '<polygon points="4,9 16,14 9,30" fill="#7AE582"/>' +
    '<polygon points="16,14 28,9 23,30" fill="#4CC8F5"/>' +
    '<polygon points="9,30 16,14 23,30" fill="#A78BFA"/>' +
    '<polygon points="16,2 22,5.5 16,9 10,5.5" fill="#FFFFFF" opacity=".9"/>';

  /* html(cls) → 指定类名的完整 <svg> 字符串（尺寸/布局由 CSS 类决定） */
  function html(cls) {
    return '<svg class="' + (cls || 'prism-gem') + '" viewBox="0 0 32 32" aria-hidden="true">' +
      BODY + '</svg>';
  }

  STM.PrismIcon = {
    SVG: html('prism-gem'),
    html: html,
    MARKUP: BODY /* 同源断言用（polygon 数量 / points 文本） */
  };
})(typeof window !== 'undefined' ? window : globalThis);
