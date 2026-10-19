#!/usr/bin/env node
/* =========================================================
 * Slide & Triple — Δ13 增量扩容 50→60 关（严禁全量重生成）
 * Node ≥18 离线工具（CommonJS，零 npm 依赖——宪章 II）
 *
 * 铁律（用户最高优先级指令）:
 *   原 50 关（L1~L50）的 tiles / prisms / cfg / solutionMoves 100% 原封不动:
 *     · 新 L1 = OLD[0]（5×5）  新 L2 = OLD[1]（6×6）——原样复用
 *     · 新 L4~L51 = OLD[2]~OLD[49]（48 关）——仅改 id(+1)/chapter/name
 *     · 新 L3  = 单独新生成（7×7 新手循环 1 困难关, 57 块, 无机关）
 *     · 新 L52~L60 = 尾部新生成 9 关（循环 18~20: 7×7/7×7/8×8）
 *   生成关卡走 Generator 三重验证（逆向构造 → 正向自检 → Solver 门禁）;
 *   平移关仅重算 difficultyScore（全域归一域随 60 关全域变化）+ 名称编号。
 *
 * 章节重排（60 关 = 3×20 大阶段）:
 *   ch1 L1~20 / ch2 L21~40 / ch3 L41~60
 *   波浪挑战位 = (id-4)%3===2（L6/L9/…/L51/L54/L57/L60——与旧数据 +1 平移
 *   及用户新增循环 18~20 精确对齐, 见 level-config.js Δ13 注记）
 *
 * CLI: node tools/expand-60.js [--seed 2026] [--dry-run]
 * ========================================================= */
'use strict';

var path = require('path');
var fs = require('fs');
var G = require(path.join(__dirname, 'generator.js'));
var CFG = require(path.join(__dirname, 'level-config.js'));
var SOLVER = require(path.join(__dirname, 'solver.js'));

/* ---------- 平移关: 仅重写 id/chapter/name（tiles/prisms/cfg/solutionMoves 原样） ---------- */
function chapterOf(newId) {
  if (newId <= 20) return 1;
  if (newId <= 40) return 2;
  return 3;
}

function shiftLevel(oldLevel, newId) {
  /* 浅拷贝 + 字段级替换——tiles/prisms/cfg/solutionMoves/metrics 为共享引用,
   * 序列化时原样输出（100% 保留铁律）; name 按新编号重排（保留主题后缀） */
  var suffix = oldLevel.name.indexOf(' · ') >= 0 ? oldLevel.name.slice(oldLevel.name.indexOf(' · ')) : '';
  return {
    id: newId,
    chapter: chapterOf(newId),
    name: 'Level ' + newId + suffix,
    n: oldLevel.n,
    tiles: oldLevel.tiles,
    prisms: oldLevel.prisms,
    cfg: oldLevel.cfg,
    metrics: oldLevel.metrics,
    solutionMoves: oldLevel.solutionMoves,
    theme: oldLevel.theme
  };
}

/* ---------- 新增关参数（Δ13 拼接规范——与 level-config 对齐） ---------- */
function newLevelParams(newId) {
  var p = CFG.levelParams(newId);
  /* 新 L3: 新手循环 1 困难关——无任何机关（prism/gear/ice/chain 全关）;
   * L52~L60: levelParams 全机制口径（mechFrom 已按 +1 平移: gear7/ice12/chain22/prism32） */
  if (newId === 3) {
    p.gearOn = false;
    p.iceOn = false;
    p.chainOn = false;
    p.prismOn = false;
    p.prismCount = 0;
    p.cfg.damageOnBlock = false; /* 新手循环 1 不扣命 */
  }
  return p;
}

module.exports = {
  chapterOf: chapterOf,
  shiftLevel: shiftLevel,
  newLevelParams: newLevelParams
};

/* ---------- 生成单关（复用 generator 三重验证闭环 generateOne） ---------- */
function generateNewLevel(newId, seed) {
  /* generateOne(levelId, seed) 以 level-config levelParams 为参数源;
   * 新 L3 的「无机关」口径经 newLevelParams 覆写后无法直接传入——
   * 此处内联复刻 generateOne 的 attempt 循环（同一验证口径: 自检 + Solver 门禁） */
  var params = newLevelParams(newId);
  var MAX_RETRY = 5;
  for (var attempt = 0; attempt < MAX_RETRY; attempt++) {
    var subSeed = (seed + newId * 1000 + attempt * 17) | 0;
    var rng = G.makeRng(subSeed);
    var levelDef = G.assembleLevel(params, rng, subSeed);
    if (!levelDef) continue;
    var fc = G.forwardSelfCheck(levelDef);
    if (!fc.ok) { console.log('  新 L' + newId + ' try' + attempt + ' 自检: ' + fc.reason); continue; }
    var sol = SOLVER.solveLevel(levelDef, {
      budget: { nodes: CFG.BUDGET.nodes, ms: CFG.BUDGET.ms },
      hintUpper: levelDef.solutionMoves.length
    });
    if (!sol.solvable) { console.log('  新 L' + newId + ' try' + attempt + ' Solver: 不可解 nodes=' + sol.nodes); continue; }
    levelDef.solutionMoves = (sol.solutionMoves || levelDef.solutionMoves).map(function (t) { return { k: 0, t: t }; });
    levelDef.metrics = {
      minMoves: sol.minMoves,
      solutionCount: sol.solutionCount,
      dockPeak: sol.dockPeak,
      mechCount: SOLVER.mechCountOf(levelDef),
      difficultyScore: 0, /* 全域归一后统一回填 */
      openSuitsMax: sol.openSuitsMax
    };
    return levelDef;
  }
  return null;
}

/* ---------- 60 关拼接（旧数据只读复用 + 新关卡生成） ---------- */
function buildSixty(seed) {
  var OLD = require(path.join(__dirname, '..', 'src', 'data', 'levels.js'));
  if (OLD.length !== 50) { throw new Error('OLD_LEVELS 应为 50 关, 实际 ' + OLD.length); }

  var levels = [];
  /* 1. 新 L1/L2 = 原 L1/L2 原样（仅重算 chapter/name 归一——chapterOf(1/2)=1 与原值一致） */
  levels.push(shiftLevel(OLD[0], 1));
  levels.push(shiftLevel(OLD[1], 2));

  /* 2. 新 L3 = 单独新生成 */
  var l3 = generateNewLevel(3, seed);
  if (!l3) { console.error('  ✗ 新 L3 生成失败'); process.exit(1); }
  levels.push(l3);

  /* 3. 新 L4~L51 = 原 L3~L50 平移（仅 id/chapter/name; tiles/prisms/cfg/solutionMoves 原样引用）
   *    OLD[oi] = 旧 L(oi+1) → 新 id = 旧 id + 1 = oi + 2 */
  for (var oi = 2; oi <= 49; oi++) levels.push(shiftLevel(OLD[oi], oi + 2));

  /* 4. 新 L52~L60 = 尾部新生成（循环 18~20: 7×7/7×7/8×8） */
  for (var ni = 52; ni <= 60; ni++) {
    var lv = generateNewLevel(ni, seed);
    if (!lv) { console.error('  ✗ 新 L' + ni + ' 生成失败'); process.exit(1); }
    levels.push(lv);
  }
  return levels;
}

module.exports.generateNewLevel = generateNewLevel;
module.exports.buildSixty = buildSixty;

/* ---------- difficultyScore 全域回填（60 关全域 min-max 归一——与 solver 同权重口径） ---------- */
function recomputeDifficulty(levels) {
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

module.exports.recomputeDifficulty = recomputeDifficulty;

/* ---------- CLI ---------- */
function main() {
  var args = process.argv.slice(2);
  var seed = 2026;
  var si = args.indexOf('--seed');
  if (si >= 0 && args[si + 1]) seed = parseInt(args[si + 1], 10);
  var dryRun = args.indexOf('--dry-run') >= 0;

  var t0 = Date.now();
  console.log('expand-60: seed=' + seed + '（50→60 增量拼接: 1 插入 + 9 追加 + 48 平移）');
  var levels = buildSixty(seed);
  recomputeDifficulty(levels);

  /* 自检: 60 关 id 连续 + 旧数据完整保留（抽验 tiles 深比较） */
  var OLD = require(path.join(__dirname, '..', 'src', 'data', 'levels.js'));
  for (var i = 0; i < levels.length; i++) {
    if (levels[i].id !== i + 1) { console.error('✗ id 不连续: index ' + i + ' = ' + levels[i].id); process.exit(1); }
  }
  /* 铁律抽验: 新 L4~L51 的 tiles 与原 L3~L50 逐位一致（JSON 深比较） */
  var preserved = true;
  for (var oi = 2; oi <= 49; oi++) {
    if (JSON.stringify(levels[oi + 1].tiles) !== JSON.stringify(OLD[oi].tiles) ||
        JSON.stringify(levels[oi + 1].solutionMoves) !== JSON.stringify(OLD[oi].solutionMoves) ||
        JSON.stringify(levels[oi + 1].prisms) !== JSON.stringify(OLD[oi].prisms) ||
        JSON.stringify(levels[oi + 1].cfg) !== JSON.stringify(OLD[oi].cfg)) {
      preserved = false;
      console.error('✗ 平移关数据被改动: 原 L' + (oi + 1));
    }
  }
  if (!preserved) process.exit(1);
  console.log('铁律校验: 原 L3~L50 tiles/prisms/cfg/solutionMoves 100% 保留 ✓（新 L1/L2 原样复用）');

  /* 简报 */
  levels.forEach(function (L) {
    console.log('  L' + L.id + ' ch' + L.chapter + ' n=' + L.n + ' tiles=' + L.tiles.length +
      ' minMoves=' + L.metrics.minMoves + ' dockPeak=' + L.metrics.dockPeak + ' mech=' + L.metrics.mechCount +
      ' dScore=' + L.metrics.difficultyScore);
  });

  if (dryRun) { console.log('dry-run: 60 关拼接成功（不写盘）, 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'); return; }

  /* 写盘: 复用 generator 的 writeLevelsJs（UMD 头 + 契约序列化; Δ13 拼接溯源） */
  var outPath = path.join(__dirname, '..', 'src', 'data', 'levels.js');
  G.writeLevelsJs(levels, outPath, seed, {
    attribution: 'tools/expand-60.js 增量拼接（Δ13 50→60: 原 50 关 tiles/prisms/cfg/solutionMoves 100% 保留复用 + 新 L3 插入 + L52~L60 追加）'
  });
  console.log('导出 → ' + outPath + '（60 关, 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');
  console.log('下一步: node tools/solver.js 全量验证 60/60（更新 solver-report.json）');
}

if (require.main === module) main();
module.exports.main = main;


