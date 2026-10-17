/* =========================================================
 * Slide & Triple — 关卡数据（M1/M2 手工测试关）
 * UMD 双导出（D-02）：浏览器挂 STM.LEVELS / Node module.exports
 * M3 起由 tools/generator.js 整体再生成（FR-031：此后禁止手改）
 * Schema 契约：specs/001-slide-triple-match-core/contracts/level-data.md
 *
 * 手工烟雾关（T019）——布局以逆向构造法保证回放必胜:
 *   L1 初启 —— 4×4 / 2 花色 / 6 滑块，纯畅通飞出 + 双三消
 *   L2 交错 —— 4×4 / 3 花色 / 9 滑块
 *   L3 环流 —— 5×5 / 4 花色 / 12 滑块
 *   L4 满槽压力 —— 5×5 / 4 花色 / 12 滑块（花色数 ≥4，可演示 7 格爆槽结构）
 *   L5 四向大关 —— 5×5 / 5 花色 / 15 滑块
 * 全部 damageOnBlock:false（第 1 章）；solutionMoves 均经 RulesEngine 回放验证必胜
 * ========================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (global.STM = global.STM || {}).LEVELS = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  return [
    /* ---------- L1: 初启（4×4 / 2 花色 / 6 滑块） ---------- */
    {
      id: 1,
      chapter: 1,
      name: 'Level 1 · 初启',
      n: 4,
      tiles: [
        { r: 0, c: 1, s: 0, d: 0 },  // 0 ▲ U — 上方畅通
        { r: 0, c: 3, s: 0, d: 0 },  // 1 ▲ U — 上方畅通
        { r: 1, c: 0, s: 1, d: 3 },  // 2 ◆ L — 左方畅通
        { r: 1, c: 2, s: 1, d: 3 },  // 3 ◆ L — 左方畅通
        { r: 2, c: 1, s: 1, d: 2 },  // 4 ◆ D — 下方畅通
        { r: 3, c: 2, s: 0, d: 2 }   // 5 ▲ D — 下方畅通（最底行）
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
      metrics: { minMoves: 6, solutionCount: 2, dockPeak: 4, mechCount: 0, difficultyScore: 15, openSuitsMax: 2 },
      solutionMoves: [
        { k: 0, t: 0 }, { k: 0, t: 1 }, { k: 0, t: 2 },
        { k: 0, t: 3 }, { k: 0, t: 4 }, { k: 0, t: 5 }
      ]
    },

    /* ---------- L2: 交错（4×4 / 3 花色 / 9 滑块） ---------- */
    {
      id: 2,
      chapter: 1,
      name: 'Level 2 · 交错',
      n: 4,
      tiles: [
        { r: 2, c: 3, s: 0, d: 1 },
        { r: 1, c: 0, s: 0, d: 3 },
        { r: 0, c: 2, s: 0, d: 0 },
        { r: 0, c: 0, s: 1, d: 0 },
        { r: 1, c: 3, s: 1, d: 1 },
        { r: 2, c: 0, s: 1, d: 3 },
        { r: 0, c: 3, s: 2, d: 1 },
        { r: 3, c: 3, s: 2, d: 2 },
        { r: 0, c: 1, s: 2, d: 0 }
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
      metrics: { minMoves: 9, solutionCount: 1, dockPeak: 4, mechCount: 0, difficultyScore: 22, openSuitsMax: 3 },
      solutionMoves: [
        { k: 0, t: 0 }, { k: 0, t: 1 }, { k: 0, t: 2 },
        { k: 0, t: 3 }, { k: 0, t: 4 }, { k: 0, t: 5 },
        { k: 0, t: 6 }, { k: 0, t: 7 }, { k: 0, t: 8 }
      ]
    },

    /* ---------- L3: 环流（5×5 / 4 花色 / 12 滑块） ---------- */
    {
      id: 3,
      chapter: 1,
      name: 'Level 3 · 环流',
      n: 5,
      tiles: [
        { r: 4, c: 2, s: 0, d: 2 },
        { r: 0, c: 3, s: 0, d: 0 },
        { r: 4, c: 4, s: 0, d: 1 },
        { r: 1, c: 4, s: 1, d: 1 },
        { r: 1, c: 0, s: 1, d: 3 },
        { r: 0, c: 1, s: 1, d: 0 },
        { r: 2, c: 4, s: 2, d: 1 },
        { r: 2, c: 0, s: 2, d: 3 },
        { r: 0, c: 2, s: 2, d: 0 },
        { r: 0, c: 0, s: 3, d: 0 },
        { r: 4, c: 0, s: 3, d: 2 },
        { r: 0, c: 4, s: 3, d: 1 }
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
      metrics: { minMoves: 12, solutionCount: 1, dockPeak: 5, mechCount: 0, difficultyScore: 30, openSuitsMax: 4 },
      solutionMoves: [
        { k: 0, t: 0 }, { k: 0, t: 1 }, { k: 0, t: 2 },
        { k: 0, t: 3 }, { k: 0, t: 4 }, { k: 0, t: 5 },
        { k: 0, t: 6 }, { k: 0, t: 7 }, { k: 0, t: 8 },
        { k: 0, t: 9 }, { k: 0, t: 10 }, { k: 0, t: 11 }
      ]
    },

    /* ---------- L4: 满槽压力（5×5 / 4 花色 / 12 滑块） ----------
     * 花色数 ≥4：玩家乱序飞出时可滞留 7 格无三消（爆槽演示结构） */
    {
      id: 4,
      chapter: 1,
      name: 'Level 4 · 满槽压力',
      n: 5,
      tiles: [
        { r: 0, c: 4, s: 0, d: 1 },
        { r: 0, c: 1, s: 0, d: 0 },
        { r: 4, c: 0, s: 0, d: 3 },
        { r: 4, c: 4, s: 1, d: 1 },
        { r: 0, c: 2, s: 1, d: 0 },
        { r: 3, c: 0, s: 1, d: 3 },
        { r: 2, c: 4, s: 2, d: 1 },
        { r: 0, c: 0, s: 2, d: 0 },
        { r: 2, c: 0, s: 2, d: 3 },
        { r: 3, c: 4, s: 3, d: 1 },
        { r: 0, c: 3, s: 3, d: 0 },
        { r: 1, c: 0, s: 3, d: 3 }
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
      metrics: { minMoves: 12, solutionCount: 1, dockPeak: 4, mechCount: 0, difficultyScore: 35, openSuitsMax: 4 },
      solutionMoves: [
        { k: 0, t: 0 }, { k: 0, t: 1 }, { k: 0, t: 2 },
        { k: 0, t: 3 }, { k: 0, t: 4 }, { k: 0, t: 5 },
        { k: 0, t: 6 }, { k: 0, t: 7 }, { k: 0, t: 8 },
        { k: 0, t: 9 }, { k: 0, t: 10 }, { k: 0, t: 11 }
      ]
    },

    /* ---------- L5: 四向大关（5×5 / 5 花色 / 15 滑块） ---------- */
    {
      id: 5,
      chapter: 1,
      name: 'Level 5 · 四向大关',
      n: 5,
      tiles: [
        { r: 4, c: 0, s: 0, d: 2 },
        { r: 0, c: 1, s: 0, d: 0 },
        { r: 3, c: 4, s: 0, d: 1 },
        { r: 4, c: 4, s: 1, d: 1 },
        { r: 0, c: 2, s: 1, d: 0 },
        { r: 2, c: 0, s: 1, d: 3 },
        { r: 2, c: 4, s: 2, d: 1 },
        { r: 3, c: 0, s: 2, d: 3 },
        { r: 4, c: 3, s: 2, d: 2 },
        { r: 0, c: 3, s: 3, d: 0 },
        { r: 4, c: 2, s: 3, d: 2 },
        { r: 0, c: 4, s: 3, d: 1 },
        { r: 0, c: 0, s: 4, d: 0 },
        { r: 1, c: 4, s: 4, d: 1 },
        { r: 1, c: 0, s: 4, d: 3 }
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
      metrics: { minMoves: 15, solutionCount: 1, dockPeak: 6, mechCount: 0, difficultyScore: 40, openSuitsMax: 5 },
      solutionMoves: [
        { k: 0, t: 0 }, { k: 0, t: 1 }, { k: 0, t: 2 },
        { k: 0, t: 3 }, { k: 0, t: 4 }, { k: 0, t: 5 },
        { k: 0, t: 6 }, { k: 0, t: 7 }, { k: 0, t: 8 },
        { k: 0, t: 9 }, { k: 0, t: 10 }, { k: 0, t: 11 },
        { k: 0, t: 12 }, { k: 0, t: 13 }, { k: 0, t: 14 }
      ]
    }
  ];
});
