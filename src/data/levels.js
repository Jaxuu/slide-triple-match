/* =========================================================
 * Slide & Triple — 关卡数据（M1/M2 手工测试关）
 * UMD 双导出（D-02）：浏览器挂 STM.LEVELS / Node module.exports
 * M3 起由 tools/generator.js 整体再生成（FR-031：此后禁止手改）
 * Schema 契约：specs/001-slide-triple-match-core/contracts/level-data.md
 * ========================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (global.STM = global.STM || {}).LEVELS = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* T005: 1 个 schema 完整占位 Level（活样例）
   * 4×4 / 2 花色 / 6 滑块（%3==0）/ cfg 默认值 / metrics 手工估值 / solutionMoves 手工解 */
  return [
    {
      id: 1,
      chapter: 1,
      name: 'Level 1 · 初启',
      n: 4,
      tiles: [
        { r: 0, c: 1, s: 0, d: 0 },
        { r: 0, c: 3, s: 0, d: 0 },
        { r: 1, c: 0, s: 1, d: 3 },
        { r: 1, c: 2, s: 1, d: 3 },
        { r: 2, c: 1, s: 1, d: 2 },
        { r: 3, c: 2, s: 0, d: 2 }
      ],
      prisms: [],
      cfg: {
        lives: 3,
        damageOnBlock: false,
        items: { undo: 1, wrench: 1, stage: 1 },
        iceMode: 'triple',
        chains: [],
        scoring: { comboBase: 10, comboStep: 5 }
      },
      metrics: {
        minMoves: 6,
        solutionCount: 2,
        dockPeak: 3,
        mechCount: 0,
        difficultyScore: 15,
        openSuitsMax: 2
      },
      solutionMoves: [
        { k: 0, t: 0 }, { k: 0, t: 1 }, { k: 0, t: 2 },
        { k: 0, t: 3 }, { k: 0, t: 4 }, { k: 0, t: 5 }
      ]
    }
  ];
});
