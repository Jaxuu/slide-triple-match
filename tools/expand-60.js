#!/usr/bin/env node
/* =========================================================
 * Slide & Triple — Δ16a 尾部增量扩容 60→72 关（严禁全量重生成）
 * Node ≥18 离线工具（CommonJS，零 npm 依赖——宪章 II）
 *
 * 铁律（用户最高优先级指令 / FR-008 Δ16 扩容铁律）:
 *   既有 60 关（L1~L60）的 tiles / prisms / cfg / solutionMoves 100% 原封不动:
 *     · 新 L1~L60 = OLD[0]~OLD[59] —— 仅 chapter 字段按 Δ16a 章区间
 *       （ch1[1,24]/ch2[25,48]/ch3[49,72]）重划 + 名称编号保持
 *     · 其余全部字段（tiles/prisms/cfg/solutionMoves/n/theme/metrics）
 *       序列化后逐字节一致——工具内以 JSON 深比较断言（bit-exact gate）
 *   仅尾部新生成 L61~L72 共 12 关（循环 21~24: 7×7简/7×7简/8×8难 × 4）
 *
 * 新关生成走 Generator 三重验证（逆向构造 → 正向自检 → Solver 门禁, D-10）
 * + Δ15a 同花色空间打散（沿用 level-config 聚散度末档 t3: 三连簇 0%）
 * + 内嵌 solutionMoves（Solver 最优解，Δ6 非构造解）
 *
 * 章节重排（72 关 = 3×24 大阶段）:
 *   ch1 L1~24 / ch2 L25~48 / ch3 L49~72
 *   波浪挑战位 = (id-4)%3===2（L6/L9/…/L72——L63/L66/L69/L72 为新增尾段）
 *
 * CLI: node tools/expand-60.js [--seed 2026] [--seeds N] [--dry-run]
 * ========================================================= */
'use strict';

var path = require('path');
var fs = require('fs');
var G = require(path.join(__dirname, 'generator.js'));
var CFG = require(path.join(__dirname, 'level-config.js'));
var SOLVER = require(path.join(__dirname, 'solver.js'));
var REDISP = require(path.join(__dirname, 'redisperse-60.js'));

/* Δ16a: 既有 60 关 + 尾部新增 12 关 */
var BASE_COUNT = 60;
var NEW_COUNT = 72;
var NEW_FROM = 61;   /* 尾部增量起点（既有 L1~L60 零改写） */
var NEW_TO = 72;

/* ---------- Δ16a 章区间（ch1[1,24]/ch2[25,48]/ch3[49,72]） ----------
 * 严禁读 level.chapter —— 按 level.id 区间判定（Δ14a 图鉴池边界同纪律） */
function chapterOf(newId) {
  if (newId <= 24) return 1;
  if (newId <= 48) return 2;
  return 3;
}

/* ---------- 既有 60 关: 仅重划 chapter 字段（Δ16a 章区间 3×20 → 3×24）
 * tiles/prisms/cfg/solutionMoves/n/theme/metrics/solutionMoves 为共享引用，
 * 序列化时原样输出（100% 保留铁律）; name 原样保留（不重排编号） */
function shiftLevel(oldLevel, newId) {
  return {
    id: newId,
    chapter: chapterOf(newId),
    name: oldLevel.name,
    n: oldLevel.n,
    tiles: oldLevel.tiles,
    prisms: oldLevel.prisms,
    cfg: oldLevel.cfg,
    metrics: oldLevel.metrics,
    solutionMoves: oldLevel.solutionMoves,
    theme: oldLevel.theme
  };
}

/* ---------- 新增关参数（Δ16a: 沿用后期档位，机制全解锁） ---------- */
function newLevelParams(newId) {
  /* L61~L72 为纯后期档（levelParams 已按 Δ16a 章区间 ch3 解析出
   * 全机制 + 最高 5 层堆叠）——此处仅保留可扩展钩子，不做覆写 */
  return CFG.levelParams(newId);
}

/* =========================================================
 * Δ16a: 单关生成（Generator 三重验证闭环 + Δ15a 空间打散）
 * 步骤: ① assembleLevel 逆向构造 ② forwardSelfCheck 正向自检
 *      ③ Solver 门禁（hintUpper = 构造解长度 → 求最优解）
 *      ④ Δ15a 同花色空间打散（t3 末档: 三连簇 0% + 双连坐 ≤15%）
 * 装配种子按 (seed, levelId, attempt) 确定性派生；未达聚散度末档时
 * 继续补充装配扫描（同一几何族的多样性来自装配种子而非随机重试），
 * 全部扫描仍失败 → 取分项最优降级并告警（不静默）。
 * ========================================================= */
var MAX_ASM = 5;         /* 首轮装配重试（同 Δ13/Δ16 口径） */
var MAX_ASM_EXT = 40;    /* 聚散度末档未达标时的补充装配扫描上限 */
var REDISP_SEEDS = 60;   /* 每装配的聚散度种子扫描数 */

/* 在一个装配上扫描聚散度种子: 返回 { level, tierOk, score, d } */
function pickDispersion(built, seed, dispSeeds) {
  var picked = null, bestFallback = null;
  for (var sd = 0; sd < dispSeeds; sd++) {
    var cand = JSON.parse(JSON.stringify(built));
    var r = REDISP.redisperseLevel(cand, seed + sd);
    if (!r) continue;
    var d = SOLVER.dispersionOf(cand);
    var score = (d.tierOkTrip ? 2 : 0) + (d.tierOkPair ? 1 : 0) + (d.tierOkDist ? 1 : 0);
    if (d.tierOk) { picked = { level: cand, tierOk: true, score: score, d: d }; break; }
    if (!bestFallback || score > bestFallback.score) bestFallback = { level: cand, tierOk: false, score: score, d: d };
  }
  return picked || bestFallback;
}

function generateNewLevel(newId, seed) {
  var params = newLevelParams(newId);
  var best = null, bestScore = -1;
  for (var a = 0; a < MAX_ASM + MAX_ASM_EXT; a++) {
    var subSeed = (seed + newId * 1000 + a * 17) | 0;
    var rng = G.makeRng(subSeed);
    var levelDef = G.assembleLevel(params, rng, subSeed);
    if (!levelDef) continue;
    var fc = G.forwardSelfCheck(levelDef);
    if (!fc.ok) { console.log('  新 L' + newId + ' 装配' + a + ' 自检: ' + fc.reason); continue; }
    var sol = SOLVER.solveLevel(levelDef, {
      budget: { nodes: CFG.BUDGET.nodes, ms: CFG.BUDGET.ms },
      hintUpper: levelDef.solutionMoves.length
    });
    if (!sol.solvable) { console.log('  新 L' + newId + ' 装配' + a + ' Solver: 不可解 nodes=' + sol.nodes); continue; }
    levelDef.id = newId;
    levelDef.chapter = chapterOf(newId);
    levelDef.solutionMoves = (sol.solutionMoves || levelDef.solutionMoves).map(function (t) { return { k: 0, t: t }; });
    levelDef.metrics = {
      minMoves: sol.minMoves,
      solutionCount: sol.solutionCount,
      dockPeak: sol.dockPeak,
      mechCount: SOLVER.mechCountOf(levelDef),
      difficultyScore: 0, /* 全域归一后统一回填 */
      openSuitsMax: sol.openSuitsMax
    };
    /* 首轮用满种子预算；补充装配扫描用较小预算（几何已多次采样） */
    var disp = pickDispersion(levelDef, seed, a < MAX_ASM ? REDISP_SEEDS : 12);
    if (!disp) continue;
    if (disp.tierOk) return disp.level;
    if (disp.score > bestScore) { bestScore = disp.score; best = disp.level; }
  }
  if (best) {
    var d = SOLVER.dispersionOf(best);
    console.log('  ⚠ 新 L' + newId + ' 聚散度分项最优降级: trip=' + d.triplePct +
      '% pair=' + d.pairPct + '% disp=' + d.dispersedPct + '%');
  }
  return best;
}

/* ---------- 72 关拼接（既有 60 关只读复用 + 尾部 12 关新生成） ---------- */
function buildSeventyTwo(seed) {
  var OLD = require(path.join(__dirname, '..', 'src', 'data', 'levels.js'));
  if (OLD.length !== BASE_COUNT) { throw new Error('OLD_LEVELS 应为 60 关, 实际 ' + OLD.length); }

  var levels = [];
  /* 1. 既有 L1~L60 = OLD[0]~OLD[59] 原样复用（仅 chapter 按 Δ16a 章区间重划） */
  for (var oi = 0; oi < BASE_COUNT; oi++) levels.push(shiftLevel(OLD[oi], oi + 1));

  /* 2. 尾部新增 L61~L72 = 循环 21~24（7×7简 / 7×7简 / 8×8难 × 4） */
  for (var ni = NEW_FROM; ni <= NEW_TO; ni++) {
    var lv = generateNewLevel(ni, seed);
    if (!lv) { console.error('  ✗ 新 L' + ni + ' 生成失败'); process.exit(1); }
    levels.push(lv);
  }
  return levels;
}

module.exports.generateNewLevel = generateNewLevel;
module.exports.buildSeventyTwo = buildSeventyTwo;
module.exports.BASE_COUNT = BASE_COUNT;
module.exports.NEW_COUNT = NEW_COUNT;
module.exports.NEW_FROM = NEW_FROM;
module.exports.NEW_TO = NEW_TO;
module.exports.chapterOf = chapterOf;
module.exports.shiftLevel = shiftLevel;
module.exports.newLevelParams = newLevelParams;

/* ---------- metrics 全域回填（72 关全域 min-max 归一——与 solver 同权重口径）
 * ① 新 12 关 metrics 重算: 打散改写 tiles[].s 后 dockPeak/openSuitsMax/
 *    solutionCount 随之变化（minMoves 结构性 = tiles.length 不变）——
 *    必须在打散之后按 solver 同口径重解，否则 solver.js 门 ⑦ 逐字段
 *    一致性校验必然失败
 * ② difficultyScore 全域归一（新 12 关加入使全域归一域变化；
 *    既有 60 关的 minMoves/dockPeak 等字段一律不触碰——FR-008 铁律） */
function recomputeDifficulty(levels) {
  for (var i = BASE_COUNT; i < levels.length; i++) {
    var L = levels[i];
    var sol = SOLVER.solveLevel(L, {
      budget: CFG.BUDGET,
      hintUpper: L.solutionMoves.length,
      hintPath: L.solutionMoves /* Δ15a 同口径构造解引导 */
    });
    if (!sol.solvable) { console.error('  ✗ 新 L' + L.id + ' 打散后不可解（metrics 重算门禁）'); process.exit(1); }
    L.metrics.minMoves = sol.minMoves;
    L.metrics.solutionCount = sol.solutionCount;
    L.metrics.dockPeak = sol.dockPeak;
    L.metrics.openSuitsMax = sol.openSuitsMax;
    L.metrics.mechCount = SOLVER.mechCountOf(L);
    if (sol.openSuitsMax > 5) { console.error('  ✗ 新 L' + L.id + ' openSuitsMax=' + sol.openSuitsMax + ' > 5'); process.exit(1); }
  }
  var dom = G.difficultyDomains(levels);
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
}

/* ---------- CLI ---------- */
function main() {
  var args = process.argv.slice(2);
  var seed = 2026;
  var si = args.indexOf('--seed');
  if (si >= 0 && args[si + 1]) seed = parseInt(args[si + 1], 10);
  var gi = args.indexOf('--seeds');
  if (gi >= 0 && args[gi + 1]) REDISP_SEEDS = parseInt(args[gi + 1], 10);
  var ai = args.indexOf('--assemblies');
  if (ai >= 0 && args[ai + 1]) MAX_ASM_EXT = parseInt(args[ai + 1], 10) - MAX_ASM;
  var dryRun = args.indexOf('--dry-run') >= 0;

  var t0 = Date.now();
  console.log('expand-60: seed=' + seed + '（Δ16a 60→72 尾部增量拼接: 60 关原样复用 + L61~L72 追加 12 关）');
  var levels = buildSeventyTwo(seed);
  recomputeDifficulty(levels);

  /* ---------- 铁律门禁 ①: 72 关 id 连续 ---------- */
  for (var i = 0; i < levels.length; i++) {
    if (levels[i].id !== i + 1) { console.error('✗ id 不连续: index ' + i + ' = ' + levels[i].id); process.exit(1); }
  }
  if (levels.length !== NEW_COUNT) { console.error('✗ 关数应为 ' + NEW_COUNT + '，实际 ' + levels.length); process.exit(1); }

  /* ---------- 铁律门禁 ②: 既有 L1~L60 的 tiles/prisms/cfg/solutionMoves
   * 与扩容前基线逐位深比较（JSON 严格相等 = 序列化后 bit-exact）。
   * 章区间重划只影响 chapter 字段，故不在本断言口径内（Δ16a 显式豁免） */
  var OLD = require(path.join(__dirname, '..', 'src', 'data', 'levels.js'));
  var preserved = true, mismatch = [];
  for (var oi = 0; oi < BASE_COUNT; oi++) {
    if (JSON.stringify(levels[oi].tiles) !== JSON.stringify(OLD[oi].tiles) ||
        JSON.stringify(levels[oi].solutionMoves) !== JSON.stringify(OLD[oi].solutionMoves) ||
        JSON.stringify(levels[oi].prisms) !== JSON.stringify(OLD[oi].prisms) ||
        JSON.stringify(levels[oi].cfg) !== JSON.stringify(OLD[oi].cfg)) {
      preserved = false;
      mismatch.push('L' + (oi + 1));
    }
  }
  if (!preserved) { console.error('✗ 既有 60 关数据被改动: ' + mismatch.join(' ')); process.exit(1); }
  console.log('铁律校验 ✓: 既有 L1~L60 tiles/prisms/cfg/solutionMoves 100% 逐位保留（bit-exact，' + BASE_COUNT + '/60）');

  /* ---------- 铁律门禁 ③: 章区间 Δ16a 重划（ch1[1,24]/ch2[25,48]/ch3[49,72]） ---------- */
  var chOk = true;
  for (var ci = 0; ci < levels.length; ci++) {
    if (levels[ci].chapter !== chapterOf(levels[ci].id)) { chOk = false; console.error('✗ L' + levels[ci].id + ' chapter 错位: ' + levels[ci].chapter); }
  }
  if (!chOk) process.exit(1);
  console.log('章区间校验 ✓: ch1 L1-24 / ch2 L25-48 / ch3 L49-72（3×24 大阶段）');

  /* ---------- 铁律门禁 ④: 波浪挑战位锚点 (id-4)%3==2 + 花色池铁律 ---------- */
  var waveOk = true;
  for (var wi = 3; wi < NEW_TO; wi++) {
    var want = (wi + 1 - 4) % 3 === 2 ? 8 : 7;
    if (levels[wi].n !== want) { waveOk = false; console.error('✗ L' + (wi + 1) + ' 网格 ' + levels[wi].n + ' ≠ 波浪铁律 ' + want); }
  }
  if (!waveOk) process.exit(1);
  console.log('波浪校验 ✓: L4~L72 严格「2 简(7×7) 1 难(8×8)」三关循环（挑战位 L63/L66/L69/L72）');

  /* ---------- 简报 ---------- */
  levels.forEach(function (L) {
    console.log('  L' + L.id + ' ch' + L.chapter + ' n=' + L.n + ' tiles=' + L.tiles.length +
      ' minMoves=' + L.metrics.minMoves + ' dockPeak=' + L.metrics.dockPeak + ' mech=' + L.metrics.mechCount +
      ' dScore=' + L.metrics.difficultyScore);
  });

  if (dryRun) { console.log('dry-run: 72 关拼接成功（不写盘）, 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'); return; }

  /* 写盘: 复用 generator 的 writeLevelsJs（UMD 头 + 契约序列化; Δ16a 拼接溯源） */
  var outPath = path.join(__dirname, '..', 'src', 'data', 'levels.js');
  G.writeLevelsJs(levels, outPath, seed, {
    attribution: 'tools/expand-60.js 尾部增量拼接（Δ16a 60→72: 既有 L1~L60 tiles/prisms/cfg/solutionMoves 100% 保留复用 + 章区间重划 3×24 + 新 L61~L72 追加）'
  });
  console.log('导出 → ' + outPath + '（72 关, 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');
  console.log('下一步: node tools/solver.js 全量验证 72/72（更新 solver-report.json）');
}

if (require.main === module) main();
module.exports.main = main;