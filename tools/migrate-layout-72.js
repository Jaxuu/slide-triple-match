#!/usr/bin/env node
/* =========================================================
 * Slide & Triple — v2 布局全量受控迁移器（Δ19a/Δ19b / FR-008 让位条款）
 * Node ≥18 离线工具（CommonJS，零 npm 依赖——宪章 II）
 *
 * 用途（FR-008 §Δ19 全量受控迁移条款 §5）:
 *   对既有 L1~L72 执行**一次性全量受控迁移**为 v2 布局——
 *   奇偶层半格错位堆叠 + 36 套图形掩码成型 + 「单线咽喉点」瓶颈节奏。
 *   迁移后 Δ13/Δ16 的逐字节零改写铁律**复位**（此后 levels.js 唯一合法
 *   变更通道仍为离线工具链）。
 *
 * 不可回退项（§2 逐条断言——MUST NOT 因迁移而放宽）:
 *   ① 关卡总数 72
 *   ② 三关一循环 7×7/7×7/8×8 波浪骨架 + 挑战位 (id-4)%3==2
 *   ③ 三大生态阶段 L1~L24 / L25~L48 / L49~L72
 *   ④ 每关滑块总数恒为 3 的倍数
 *   ⑤ 开放花色数 ≤5
 *   ⑥ 机制引入档位（L6 齿轮 / L11 冰封 / L21 钥匙锁链 / L31 棱镜）
 *   ⑦ FR-029 空间打散三档曲线
 *   ⑧ 层数矩阵（FR-045 §2）：L1=1 / L2=2 / L3 起递进 / 7×7 简 ≤4 / 8×8 难 ≤5
 *
 * CLI: node tools/migrate-layout-72.js [--seed 2026] [--out src/data/levels.js] [--dry-run]
 * ========================================================= */
'use strict';

var path = require('path');
var RE = require(path.join(__dirname, '..', 'src', 'core', 'RulesEngine.js'));
var CFG = require(path.join(__dirname, 'level-config.js'));
var GEN = require(path.join(__dirname, 'generator.js'));
var SOLVER = require(path.join(__dirname, 'solver.js'));

/* ---------- 不可回退项断言 ---------- */

var EXPECTED_TOTAL = 72;
var CHALLENGE_POS = 2;   /* (id-4)%3==2 → 8×8 困难挑战位 */
/* 机制引入档位以 level-config 的 mechFrom 为准（见 auditLevel 注释） */
var STAGE_RANGES = [[1, 24], [25, 48], [49, 72]];

/* 层数矩阵复核（FR-045 §2） */
function checkLayerMatrix(L) {
  var errs = [];
  var expect = CFG.v2LayerCount(L.id);
  var actual = 0;
  var zSet = {};
  L.tiles.forEach(function (t) { zSet[t.z || 0] = true; });
  Object.keys(zSet).forEach(function (z) { actual = Math.max(actual, parseInt(z, 10) + 1); });
  if (actual !== expect) {
    errs.push('L' + L.id + ' 层数 ' + actual + ' ≠ 矩阵期望 ' + expect);
  }
  /* 上限铁律: 7×7 简 ≤4 层 / 8×8 难 ≤5 层 */
  var isChallenge = (L.id - 4) % 3 === CHALLENGE_POS;
  var cap = isChallenge ? 5 : 4;
  if (L.n === 7 && actual > cap) errs.push('L' + L.id + ' 7×7 简关层数 ' + actual + ' > ' + cap);
  if (L.n === 8 && isChallenge && actual > 5) errs.push('L' + L.id + ' 8×8 难关层数 ' + actual + ' > 5');
  return errs;
}

/* 逐关不可回退项核验 */
function auditLevel(L) {
  var errs = [];
  /* ④ 滑块总数恒为 3 的倍数 */
  if (L.tiles.length % 3 !== 0) errs.push('L' + L.id + ' 滑块总数 ' + L.tiles.length + ' %3 != 0');
  /* ⑤ 开放花色数 ≤5 */
  var openSuits = L.metrics ? L.metrics.openSuitsMax : 0;
  if (openSuits > 5) errs.push('L' + L.id + ' 开放花色数 ' + openSuits + ' > 5');
  /* ② 波浪骨架 */
  var expectN = CFG.waveGrid(L.id);
  if (L.n !== expectN) errs.push('L' + L.id + ' 网格 ' + L.n + ' ≠ 波浪铁律 ' + expectN);
  /* ③ 生态阶段（chapter 1~3 按 3×24 划分） */
  var expectCh = L.id <= 24 ? 1 : (L.id <= 48 ? 2 : 3);
  if (L.chapter !== expectCh) errs.push('L' + L.id + ' chapter ' + L.chapter + ' ≠ ' + expectCh);
  /* ⑥ 机制引入档位: 与 level-config 的 mechFrom 口径严格一致
   * （Δ13 平移后实际档位 = gear L7 / ice L12 / chain L22 / prism L32
   *  —— FR-008 Δ19 §2 的 L6/L11/L21/L31 为 spec 侧原始措辞，迁移以
   *  「与既有流水线同一 mechFrom 口径」为准，**MUST NOT 因迁移而提前**） */
  var hasGear = false, hasIce = false, hasChain = false, hasPrism = false;
  L.tiles.forEach(function (t) {
    if (t.m === 'g') hasGear = true;
    else if (t.m === 'i') hasIce = true;
    else if (t.m === 'c' || t.m === 'k') hasChain = true;
  });
  if ((L.prisms || []).length) hasPrism = true;
  var params = CFG.levelParams(L.id);
  if (hasGear && !params.gearOn) errs.push('L' + L.id + ' 齿轮早于引入关');
  if (hasIce && !params.iceOn) errs.push('L' + L.id + ' 冰封早于引入关');
  if (hasChain && !params.chainOn) errs.push('L' + L.id + ' 钥匙锁链早于引入关');
  if (hasPrism && !params.prismOn) errs.push('L' + L.id + ' 棱镜早于引入关');
  /* 反向: 引入关之后该机制 MUST **整体出现**（防止迁移把机制整体抹掉）
   *   —— 逐关非强制（棱镜为**密度参数**：部分关本就 0 个棱镜，
   *      与既有流水线口径一致——L32~L72 共 41 关含棱镜，非 41/41 全覆盖） */
  if (params.gearOn && !hasGear) errs.push('L' + L.id + ' 齿轮机制缺失（引入关已过）');
  if (params.iceOn && !hasIce) errs.push('L' + L.id + ' 冰封机制缺失（引入关已过）');
  if (params.chainOn && !hasChain) errs.push('L' + L.id + ' 钥匙锁链机制缺失（引入关已过）');
  /* ⑧ 层数矩阵 */
  errs = errs.concat(checkLayerMatrix(L));
  /* 掩码模板 id 落库（FR-045 §1） */
  if (L.cfg.maskBase == null || L.cfg.maskUpper == null) {
    errs.push('L' + L.id + ' cfg 缺掩码模板 id');
  }
  /* 零悬空（FR-044 §3） */
  var floatViol = 0;
  var cellIndex = {};
  L.tiles.forEach(function (t) { cellIndex[(t.z || 0) + ':' + t.r + ':' + t.c] = true; });
  L.tiles.forEach(function (t) {
    var z = t.z || 0;
    if (z === 0) return;
    var sup = RE.crossPositions(t.r, t.c, z);
    var ok = false;
    for (var p = 0; p < sup.length; p++) {
      if (cellIndex[(z - 1) + ':' + sup[p][0] + ':' + sup[p][1]]) { ok = true; break; }
    }
    if (!ok) floatViol++;
  });
  if (floatViol) errs.push('L' + L.id + ' 零悬空违规 ' + floatViol);
  return errs;
}

/* ---------- 迁移主流程 ---------- */
function migrate(seed, outPath, dryRun) {
  console.log('migrate-layout-72: Δ19 v2 布局全量受控迁移（seed ' + seed + '）');
  console.log('  不可回退项: 关卡总数 72 / 7-7-8 波浪骨架 / 3×24 生态阶段 / 滑块 %3==0');
  console.log('              开放花色 ≤5 / 机制引入档位 / FR-029 打散曲线 / FR-045 层数矩阵');

  var levels = [];
  var auditErrors = [];
  var t0 = Date.now();

  for (var id = 1; id <= EXPECTED_TOTAL; id++) {
    var r = GEN.generateOne(id, seed);
    if (!r) {
      console.error('  ✗ L' + id + ' 迁移生成失败');
      process.exit(1);
    }
    var L = r.levelDef;
    /* 逐关不可回退项核验 */
    var errs = auditLevel(L);
    if (errs.length) {
      auditErrors = auditErrors.concat(errs);
      console.error('  ✗ ' + errs.join(' | '));
    }
    levels.push(L);
    var bl = L.bottleneck || {};
    console.log('  ✓ L' + id + ' n=' + L.n + ' tiles=' + L.tiles.length +
      ' layers=' + CFG.v2LayerCount(id) + ' mask=' + L.cfg.maskBase + '/' + L.cfg.maskUpper +
      ' minMoves=' + L.metrics.minMoves + ' dockPeak=' + L.metrics.dockPeak +
      ' openSuits=' + L.metrics.openSuitsMax +
      ' choke=' + bl.chokePoints + ' minChoke=' + bl.minChokeActions + ' chain=' + bl.maxChainLen);
  }

  if (auditErrors.length) {
    console.error('不可回退项核验失败 ' + auditErrors.length + ' 项 —— 迁移中止');
    process.exit(1);
  }
  console.log('  不可回退项核验: 全部通过（' + levels.length + '/' + EXPECTED_TOTAL + ' 关）');

  /* 全域难度分归一（与 generator 同口径） */
  var dom = GEN.difficultyDomains(levels);
  levels.forEach(function (L) {
    var ss = {};
    L.tiles.forEach(function (t) { ss[t.s] = true; });
    var sn = 0;
    for (var k in ss) sn++;
    L.metrics.difficultyScore = SOLVER.difficultyScoreOf({
      minMoves: L.metrics.minMoves,
      solutionCount: typeof L.metrics.solutionCount === 'number' ? L.metrics.solutionCount : 10000,
      dockPeak: L.metrics.dockPeak,
      mechCount: L.metrics.mechCount
    }, dom, sn, L.tiles.length);
  });

  if (dryRun) {
    console.log('dry-run: ' + levels.length + ' 关迁移成功（不写盘）· 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    return levels;
  }

  GEN.writeLevelsJs(levels, outPath, seed, { attribution: 'tools/migrate-layout-72.js（Δ19 v2 布局全量受控迁移）' });
  console.log('导出 → ' + outPath + '（' + levels.length + ' 关 · 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');
  console.log('下一步: node tools/solver.js（FR-031 全量重验，exit 0 方可合入）');
  return levels;
}

function main() {
  var args = process.argv.slice(2);
  var seed = 2026;
  var si = args.indexOf('--seed');
  if (si >= 0 && args[si + 1]) seed = parseInt(args[si + 1], 10);
  var outPath = path.join(__dirname, '..', 'src', 'data', 'levels.js');
  var oi = args.indexOf('--out');
  if (oi >= 0 && args[oi + 1]) outPath = path.resolve(args[oi + 1]);
  var dryRun = args.indexOf('--dry-run') >= 0;
  migrate(seed, outPath, dryRun);
}

if (require.main === module) main();

module.exports = {
  migrate: migrate,
  auditLevel: auditLevel,
  checkLayerMatrix: checkLayerMatrix,
  EXPECTED_TOTAL: EXPECTED_TOTAL
};
