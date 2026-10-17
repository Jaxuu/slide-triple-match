/* =========================================================
 * Slide & Triple — 章节参数矩阵（level-config.js，Δ5）
 * Node 离线工具配置（CommonJS）：前端永不引用（level-pipeline.md §4）
 * 追加 CHAPTERS 条目即新增章节（Δ5 扩容）
 * ========================================================= */
'use strict';

/* T040: M3 实现章节参数矩阵（Phase 5 任务，本文件 M1 仅占位） */
module.exports = {
  CHAPTERS: [
    /* T040: 第 1~5 章参数矩阵占位（M3 量产阶段实现） */
  ],
  SCORE_WEIGHTS: {
    minMoves: 1.0,
    solutionCount: 0.8,
    dockPeak: 1.2,
    mechCount: 1.5,
    tiles: 0.5,
    suits: 0.7
  },
  BUDGET: { nodes: 2000000, ms: 60000 }
};
