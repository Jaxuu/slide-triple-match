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

var path = require('path');
var RE = require(path.join(__dirname, '..', 'src', 'core', 'RulesEngine.js'));

/* =========================================================
 * T038: --engine-selftest 规则不变量断言（rules-engine.md §9）
 * 断言失败 → console.error + process.exit(1)（exit code 门禁）
 * ========================================================= */

function assert(cond, msg) {
  if (!cond) { throw new Error('SELFTEST FAIL: ' + msg); }
}

/* 构造内嵌 fixture 关（不依赖 LEVELS——规则语义独立验证） */
function mkLevel(n, tiles, prisms, extra) {
  return {
    id: 1, chapter: 1, name: 'selftest', n: n, tiles: tiles, prisms: prisms || [],
    cfg: Object.assign({ lives: 3, damageOnBlock: false, iceMode: 'triple', chains: [], scoring: { comboBase: 10, comboStep: 5 } }, extra || {}),
    metrics: null, solutionMoves: tiles.map(function (t, i) { return { k: 0, t: i }; })
  };
}

/* ---------- 1. 转向加法 (d+1)%4 全 4 向 ---------- */
function testDirection() {
  for (var d = 0; d < 4; d++) {
    assert(RE.DIR_VEC[(d + 1) % 4].dr === RE.DIR_VEC[d].dc, '(d+1)%4 顺时针序失败 d=' + d);
  }
  /* 顺时针 90°: U→R→D→L */
  assert(RE.DIR_VEC[0].dr === -1 && RE.DIR_VEC[1].dc === 1 && RE.DIR_VEC[2].dr === 1 && RE.DIR_VEC[3].dc === -1, 'DIR_VEC 基向量错误');
}

/* ---------- 2. 棱镜 8 映射 ---------- */
function testPrismTable() {
  assert(RE.REFLECT['/'][0] === 1 && RE.REFLECT['/'][1] === 0 && RE.REFLECT['/'][2] === 3 && RE.REFLECT['/'][3] === 2, "'/' 反射表错误");
  assert(RE.REFLECT['\\'][0] === 3 && RE.REFLECT['\\'][1] === 2 && RE.REFLECT['\\'][2] === 1 && RE.REFLECT['\\'][3] === 0, "'\\' 反射表错误");
}

/* ---------- 3. Δ8 分层立体阻挡（本次核心新增） ---------- */
function testLayerAwareRaycast() {
  /* 3a. z=1 凌空飞越 z=0 行（前方全低层 → 畅通 flyout） */
  var L = mkLevel(5, [
    { r: 0, c: 0, s: 0, d: 0 }, { r: 0, c: 1, s: 0, d: 0 }, { r: 0, c: 2, s: 0, d: 0 }, { r: 0, c: 3, s: 0, d: 0 },
    { r: 2, c: 2, s: 1, d: 1, z: 1 },
    { r: 2, c: 3, s: 2, d: 1 }, { r: 2, c: 4, s: 2, d: 1 },
    { r: 2, c: 0, s: 2, d: 1 }, { r: 2, c: 1, s: 2, d: 1 },
    { r: 4, c: 0, s: 2, d: 2 }, { r: 4, c: 1, s: 2, d: 2 }, { r: 4, c: 2, s: 2, d: 2 }
  ]);
  var s = RE.init(L);
  var r = RE.applyTap(s, 4); /* id4 = (2,2) z=1 朝 R——前方 (2,3)(2,4) 全 z=0 */
  assert(r.type === 'flyout', 'Δ8 3a: z=1 应凌空飞越 z=0 行, got ' + r.type);
  assert(r.path.length >= 4, 'Δ8 3a: flyout path 应覆盖低层格, len=' + r.path.length);
  var has23 = r.path.some(function (p) { return p.r === 2 && p.c === 3; });
  assert(has23, 'Δ8 3a: path 应含凌空飞越格 (2,3)');

  /* 3b. z=1 前方同层 z=1 → 受阻弹回 */
  var LB = mkLevel(5, [
    { r: 0, c: 0, s: 0, d: 0 }, { r: 0, c: 1, s: 0, d: 0 }, { r: 0, c: 2, s: 0, d: 0 },
    { r: 2, c: 2, s: 1, d: 1, z: 1 },
    { r: 2, c: 3, s: 2, d: 1, z: 1 },
    { r: 2, c: 4, s: 2, d: 1 },
    { r: 2, c: 0, s: 2, d: 1 }, { r: 2, c: 1, s: 2, d: 1 }
  ]);
  var s2 = RE.init(LB);
  var r2 = RE.applyTap(s2, 3); /* id3 = (2,2) z=1——前方 (2,3) z=1 同层 */
  assert(r2.type === 'blocked', 'Δ8 3b: z=1 应被前方 z=1 阻挡, got ' + r2.type);
  assert(r2.blockedAt && r2.blockedAt.r === 2 && r2.blockedAt.c === 3, 'Δ8 3b: blockedAt 应为 (2,3)');

  /* 3c. z=0 底层被前方 z=0 阻挡（经典行为不变） */
  var s3 = RE.init(LB);
  var r3 = RE.applyTap(s3, 6); /* id6 = (2,0) z=0 朝 R——前方 (2,1) z=0 */
  assert(r3.type === 'blocked', 'Δ8 3c: z=0 经典阻挡应保留, got ' + r3.type);

  /* 3d. z=2 从 z=1 塔顶飞越 + reveal 级联 */
  var LD = mkLevel(5, [
    { r: 2, c: 2, s: 1, d: 1, z: 2 }, { r: 2, c: 2, s: 2, d: 1, z: 1 }, { r: 2, c: 2, s: 2, d: 1, z: 0 },
    { r: 2, c: 3, s: 2, d: 1, z: 1 }, { r: 2, c: 3, s: 2, d: 1 },
    { r: 0, c: 0, s: 0, d: 0 }, { r: 0, c: 1, s: 0, d: 0 }, { r: 0, c: 2, s: 0, d: 0 }
  ]);
  var s4 = RE.init(LD);
  var r4 = RE.applyTap(s4, 0);
  assert(r4.type === 'flyout', 'Δ8 3d: z=2 应凌空飞越 z=1 塔, got ' + r4.type);
  assert(r4.events.some(function (e) { return e.e === 'reveal' && e.id === 1; }), 'Δ8 3d: reveal 次顶层事件应触发');

  /* 3e. 棱镜 = 全层高柱体: z=2 射线遇棱镜恒折射 */
  var LE = mkLevel(5, [
    { r: 2, c: 2, s: 1, d: 1, z: 2 }, { r: 2, c: 2, s: 2, d: 1, z: 1 }, { r: 2, c: 2, s: 2, d: 1, z: 0 },
    { r: 0, c: 3, s: 0, d: 0 }, { r: 0, c: 4, s: 0, d: 0 }, { r: 1, c: 4, s: 0, d: 0 }
  ], [{ r: 2, c: 3, t: '/' }]);
  var s5 = RE.init(LE);
  var r5 = RE.applyTap(s5, 0);
  assert(r5.type === 'prism-flyout' || r5.type === 'blocked', 'Δ8 3e: 棱镜应阻挡任意层高, got ' + r5.type);
}

/* ---------- 4. 三消优先于爆槽 ---------- */
function testTripleBeforeBurst() {
  /* dock 预填 6 块（2 同花色组各 2+1? 设计: 2,2,2 → 点击飞入第三块同花色 */
  var L = mkLevel(4, [
    { r: 0, c: 1, s: 1, d: 0 },
    { r: 2, c: 0, s: 0, d: 2 }, { r: 2, c: 1, s: 0, d: 2 }, { r: 2, c: 2, s: 0, d: 2 },
    { r: 3, c: 0, s: 1, d: 2 }, { r: 3, c: 1, s: 1, d: 2 }
  ]);
  var s = RE.init(L);
  /* 手工入槽 6 块（2×3 花色互异排列） */
  s.dock = [
    { id: 1, s: 1 }, { id: 2, s: 2 }, { id: 3, s: 3 },
    { id: 4, s: 1 }, { id: 5, s: 2 }, { id: 6, s: 3 }
  ].map(function (t, i) { t.id = i + 10; t.removed = false; return t; });
  s.tiles[0].removed = true; /* id0 已入槽 */
  /* id0 (0,1) s=1 d=0: 移除后入 dock: 花色 1 计数=3 → 三消 */
  var r = RE.applyTap(s, 0);
  assert(r.type === 'invalid', 't0 已 removed, canTap false → invalid');
  /* 直接预置 dock 到 6 块后飞入第 7 块同花色 → 三消优先（不爆槽） */
  var s2 = RE.init(L);
  s2.dock = [
    { id: 10, s: 1 }, { id: 11, s: 2 }, { id: 12, s: 1 },
    { id: 13, s: 2 }, { id: 14, s: 1 }, { id: 15, s: 2 }
  ];
  for (var i = 0; i < s2.dock.length; i++) { s2.dock[i].removed = false; }
  /* t0 (0,1) s=1? mkLevel 里 s: 1 → 飞入后花色 1 计数=3 → 三消优先 */
  var r2 = RE.applyTap(s2, 0);
  assert(r2.type === 'flyout', 't0 应飞出, got ' + r2.type);
  assert(RE.terminal(s2) !== 'lost_burst', '三消优先于爆槽: dock 空出不应爆槽, terminal=' + RE.terminal(s2));
  var hasMatch = r2.events.some(function (e) { return e.e === 'match'; });
  assert(hasMatch, '三消事件应发生（花色1计数==3）');
}

/* ---------- 5. Δ3 胜利条件（staging 残留非胜） ---------- */
function testWinCondition() {
  var L = mkLevel(4, [
    { r: 0, c: 1, s: 1, d: 0 },
    { r: 2, c: 0, s: 0, d: 2 }, { r: 2, c: 1, s: 0, d: 2 }
  ]);
  var s = RE.init(L);
  s.staging = [{ id: 99, s: 1 }];
  assert(RE.terminal(s) === 'playing', 'staging 残留 + 棋盘非空 → playing');
  s.staging = [];
  s.tiles.forEach(function (t) { t.removed = true; });
  s.dock = [];
  assert(RE.terminal(s) === 'won', '全清 → won');
}

/* ---------- 6. 快照/restore 等价 ---------- */
function testSnapshotRestore() {
  var L = mkLevel(4, [
    { r: 0, c: 1, s: 1, d: 0 },
    { r: 2, c: 0, s: 0, d: 2 }, { r: 2, c: 1, s: 0, d: 2 }, { r: 2, c: 2, s: 0, d: 2 }
  ]);
  var s = RE.init(L);
  RE.applyTap(s, 0); /* 走 1 步 */
  var snap = RE.snapshot(s);
  RE.applyTap(s, 1);
  RE.applyTap(s, 2);
  RE.restore(s, snap);
  /* restore 后: 与快照点等价——再走同一序列应得到同一终态 */
  var s2 = RE.init(L);
  RE.applyTap(s2, 0);
  assert(JSON.stringify(RE.renderProbe(s)) === JSON.stringify(RE.renderProbe(s2)), 'restore 等价性失败');
}

function engineSelftest() {
  var tests = [
    ['转向加法 (d+1)%4', testDirection],
    ['棱镜 8 映射', testPrismTable],
    ['Δ8 分层立体阻挡（凌空飞越/同层阻挡/全高棱镜/reveal 级联）', testLayerAwareRaycast],
    ['三消优先于爆槽', testTripleBeforeBurst],
    ['Δ3 胜利条件', testWinCondition],
    ['快照/restore 等价', testSnapshotRestore]
  ];
  var passed = 0;
  for (var i = 0; i < tests.length; i++) {
    try {
      tests[i][1]();
      passed++;
      console.log('  ✓ ' + tests[i][0]);
    } catch (e) {
      console.error('  ✗ ' + tests[i][0] + ' — ' + e.message);
      process.exit(1);
      return;
    }
  }
  console.log('engine-selftest: ' + passed + '/' + tests.length + ' all green (M2 机制断言 [gear/ice/chains] 见 T038 后续任务)');
  process.exit(0);
}

function main() {
  var args = process.argv.slice(2);
  if (args.indexOf('--engine-selftest') >= 0) {
    engineSelftest();
    return;
  }
  console.log('solver: not implemented yet (M3 / Phase 5)');
  process.exit(0);
}

if (require.main === module) main();
module.exports = { main: main, engineSelftest: engineSelftest };
