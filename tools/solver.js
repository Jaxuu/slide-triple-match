#!/usr/bin/env node
/* =========================================================
 * Slide & Triple — Solver（回溯求解器 + 验证门禁）
 * Node ≥18 离线工具（CommonJS，零 npm 依赖——宪章 II）
 * 规则口径与前端 100% 同源：require('../src/core/RulesEngine.js')（D-02）
 * CLI:
 *   node tools/solver.js                    # 全量验证 LEVELS + 指标 + 曲线门
 *   node tools/solver.js --level N          # 单关验证
 *   node tools/solver.js --engine-selftest  # 规则不变量断言（T038）
 * ========================================================= */
'use strict';

/* T038/T041~T044: M2 自测 + M3 求解核心（本文件 M1 仅占位） */

function main() {
  var args = process.argv.slice(2);
  if (args.indexOf('--engine-selftest') >= 0) {
    console.log('engine-selftest: not implemented yet (M2 / T038)');
    process.exit(0);
    return;
  }
  console.log('solver: not implemented yet (M3 / Phase 5)');
  process.exit(0);
}

if (require.main === module) main();
module.exports = { main: main };
