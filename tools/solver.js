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
var CFG = require(path.join(__dirname, 'level-config.js'));
var LEVELS_SRC = require(path.join(__dirname, '..', 'src', 'data', 'levels.js'));

/* =========================================================
 * T042: xorshift128 种子化 PRNG（禁 Math.random，D-08）
 * ========================================================= */
function makeRng(seed) {
  var x = seed | 0;
  if (x === 0) x = 0x9E3779B9;
  var a = x, b = x ^ 0x85EBCA6B, c = x ^ 0xC2B2AE35, d = x ^ 0x27D4EB2F;
  return function () {
    var t = a ^ (a << 11);
    a = b; b = c; c = d;
    d = (d ^ (d >>> 19)) ^ (t ^ (t >>> 8));
    return (d >>> 0) / 4294967296;
  };
}

/* =========================================================
 * T041: 状态哈希（D-07 dock 顺序规范化）
 * dock 顺序不参与哈希（tap 结局仅依赖花色计数）
 * ========================================================= */
function stateKey(state) {
  var parts = [];
  var tiles = state.tiles;
  var i, t;
  for (i = 0; i < tiles.length; i++) {
    t = tiles[i];
    if (t.removed) continue;
    parts.push(t.r + '.' + t.c + '.' + (t.z || 0) + '.' + t.d + '.' + (t.m || '') + (t.ice > 0 ? ('i' + t.ice) : '') + (t.locked ? 'L' : ''));
  }
  var counts = {};
  for (i = 0; i < state.dock.length; i++) {
    var s = state.dock[i].s;
    counts[s] = (counts[s] || 0) + 1;
  }
  var dc = [];
  for (var k in counts) dc.push(k + ':' + counts[k]);
  dc.sort();
  return parts.join('|') + '||D' + dc.join(',');
}

function makeBudget(nodes, ms) {
  var t0 = Date.now();
  return {
    nodes: nodes, ms: ms, spent: 0, t0: t0,
    exceed: function () {
      return this.spent >= this.nodes || (Date.now() - this.t0) > this.ms;
    },
    tick: function () { this.spent++; return this.exceed(); }
  };
}

/* =========================================================
 * Solver 内部回溯（事件撤销日志——O(events) 替代 O(tiles) 快照克隆）
 * undoTap 精确逆放 applyTap 的 TapResult.events（含级联）:
 *   · flyout: t 从 dock 摘出 → removed=false → 按原 (r,c,z) 插回棋盘栈
 *   · remove(match): 3 滑块按原 dock 相对序 append 回 dock 尾（removed 已 true——维持入槽态）
 *   · match: combo--、score 回扣
 *   · gear/unlock/ice: 字段回退（from 值）
 *   · blocked: damage 回补 lives
 * 前置条件: dock 滑块为 state.tiles 同一对象（init/dockInsert/restore 均满足）
 * ========================================================= */
function undoTap(state, r) {
  if (!r || !r.events) {
    if (r && r.damage) state.lives += r.damage;
    return;
  }
  var events = r.events;
  var i, ev, j;  /* 逆序回退字段类事件（ice/gear/unlock） */
  for (i = events.length - 1; i >= 0; i--) {
    ev = events[i];
    if (ev.e === 'gear') {
      state.tiles[ev.id].d = ev.from;
    } else if (ev.e === 'unlock') {
      state.tiles[ev.id].locked = true;
    } else if (ev.e === 'ice') {
      var it = state.tiles[ev.id];
      it.ice = ev.from;
      if (ev.from > 0) it.m = 'i';
    }
  }
  /* remove 事件（逆序）: 每组 3 滑块 append 回 dock 尾 */
  for (i = events.length - 1; i >= 0; i--) {
    ev = events[i];
    if (ev.e === 'remove') {
      for (j = 0; j < ev.ids.length; j++) {
        state.dock.push(state.tiles[ev.ids[j]]);
      }
      state.combo = Math.max(0, state.combo - 1);
      /* score 回扣由 match 事件携带 gain（undo 循环下） */
    } else if (ev.e === 'match') {
      state.score -= (ev.gain || 0) * ev.ids.length;
    }
  }
  /* 钥匙消费的 chains 配对回滚（cascadeOnFlyout 摘除 → 回插）
   * at 记录于 applyTap 动作入栈之后 = 当时 actions.length; 本回退点尚未弹动作 → 恰等
   * 同一 tap 可消费多条配对 → while 循环逐条回插
   * chains 顺序对语义无影响（解锁按内容查找、validate/stateKey 顺序无关）——回插至末尾即可 */
  if (state.chainConsumed && state.chainConsumed.length) {
    while (state.chainConsumed.length && state.chainConsumed[state.chainConsumed.length - 1].at === state.actions.length) {
      var last = state.chainConsumed.pop();
      state.cfg.chains.push(last.pair);
    }
  }
  /* 主体滑块摘出 dock → 回棋盘（flyout/prism-flyout） */
  if (r.type === 'flyout' || r.type === 'prism-flyout') {
    var t = state.tiles[r.tileId];
    var di = -1;
    for (i = 0; i < state.dock.length; i++) {
      if (state.dock[i] === t) { di = i; break; }
    }
    if (di >= 0) state.dock.splice(di, 1);
    t.removed = false;
    /* 插回棋盘栈（按 z 升序位置） */
    var cell = state.board[t.r][t.c];
    if (!cell || cell.prism) {
      state.board[t.r][t.c] = [t];
    } else {
      var pos = cell.length;
      for (j = 0; j < cell.length; j++) {
        if ((cell[j].z || 0) > (t.z || 0)) { pos = j; break; }
      }
      cell.splice(pos, 0, t);
    }
  }
  /* applyTap 对 blocked 也 push 动作（Step 0 后立即入栈）→ 统一弹 1 */
  state.actions.length = Math.max(0, state.actions.length - 1);
  if (r.damage) state.lives += r.damage;
}

/* =========================================================
 * T041/T042/T043: 单关求解（迭代加深 DFS——首解即最优步数解）
 * ========================================================= */
var SOLUTION_CAP = 10000;

function solveLevel(levelDef, opts) {
  opts = opts || {};
  var rawBudget = opts.budget || CFG.BUDGET;
  var budget = makeBudget(rawBudget.nodes, rawBudget.ms);
  /* 生成器锚定: hintUpper 提供已知可行解长度（构造解）——搜索上界钉在该值
   * （tiles 全消的任何解长度 = tiles.length——本游戏最优解步数结构性等于滑块数） */
  var anchorLen = opts.hintUpper || null;

  var state = RE.init(levelDef);
  var tilesN = levelDef.tiles.length;
  var lowerBound = Math.ceil(tilesN / 3);
  var upperLimit = anchorLen != null ? anchorLen : Math.max(tilesN + 8, 60);
  /* 结构事实: 每次成功 tap 恰移除 1 滑块 → 任何胜利路径长度 == tiles.length
   * minMoves 结构性 = tilesN（无更短可能）; Solver 任务 = 验证存在 + 计数 */
  var structuralMin = tilesN;

  var dockPeakMax = 0;
  var openSuitsMaxSeen = 0;
  var solutions = 0;
  var foundMoves = null;
  var foundPath = null;
  var result = 'dead';
  var i;

  function trackOpenSuits(st) {
    var seen = {};
    for (var i2 = 0; i2 < st.dock.length; i2++) seen[st.dock[i2].s] = true;
    var m = 0;
    for (var k in seen) m++;
    if (m > openSuitsMaxSeen) openSuitsMaxSeen = m;
  }

  /* 动作集（T042）: enumerateTaps（行优先列优先——id 序即 tiles 序）; 道具仅 withItems 时 */
  function expandActions(st) {
    var acts = [];
    var taps = RE.enumerateTaps(st);
    for (var i3 = 0; i3 < taps.length; i3++) acts.push({ k: 0, t: taps[i3] });
    return acts;
  }

  function dfs(st, depth, seen, path) {
    if (budget.tick()) return 'budget';
    var term = RE.terminal(st);
    if (term === 'won') {
      solutions++;
      if (foundMoves == null) { foundMoves = depth; foundPath = path.slice(); }
      return solutions >= SOLUTION_CAP ? 'capped' : 'found';
    }
    if (term !== 'playing') return 'dead';
    if (foundMoves != null && depth >= foundMoves) return 'found';
    if (depth >= upperLimit) return 'limit';

    var acts = expandActions(st);
    for (var ai = 0; ai < acts.length; ai++) {
      if (budget.tick()) return 'budget'; /* 预算按动作边计（每边 = 一次快照+克隆——OOM 防护） */
      var a = acts[ai];
      var r = RE.applyTap(st, a.t);
      if (r.type === 'invalid') continue;
      if (r.type === 'blocked') { if (r.damage) st.lives += r.damage; continue; } /* 无棋盘副作用 */
      if (st.dock.length > dockPeakMax) dockPeakMax = st.dock.length;
      trackOpenSuits(st);
      var key = stateKey(st);
      if (seen[key]) { undoTap(st, r); continue; }
      seen[key] = true;
      path.push(a.t);
      var res = dfs(st, depth + 1, seen, path);
      path.pop();
      delete seen[key];
      undoTap(st, r);
      if (res === 'capped' || res === 'budget') return res;
    }
    return 'dead';
  }

  /* 迭代加深: 锚定时直接以 anchor 深度首扫（无逐层浪费）; 否则 lowerBound→upperLimit */
  var depths = [];
  if (anchorLen != null) {
    depths = [anchorLen];
  } else {
    for (var dl = lowerBound; dl <= upperLimit; dl++) depths.push(dl);
  }
  for (var di2 = 0; di2 < depths.length; di2++) {
    var limit = depths[di2];
    var seen = {};
    seen[stateKey(state)] = true;
    var r = dfs(state, 0, seen, []);
    if (foundMoves != null && foundMoves <= limit) { result = 'found'; break; }
    if (r === 'budget') { result = 'budget'; break; }
    if (r === 'capped') { result = 'capped'; break; }
  }
  /* 结构性最优: tiles 全消路径长度 == tilesN（若首解 = tilesN 即最优——无需更深探索） */

  return {
    solvable: foundMoves != null,
    minMoves: foundMoves != null ? foundMoves : structuralMin,
    solutionMoves: foundPath,
    dockPeak: dockPeakMax,
    openSuitsMax: openSuitsMaxSeen,
    solutionCount: solutions >= SOLUTION_CAP ? '>=10000' : solutions,
    exhausted: result === 'budget' || result === 'capped',
    nodes: budget.spent
  };
}

/* =========================================================
 * T043: mechCount（按 tiles/prisms/cfg 实际出现计 0~4）
 * ========================================================= */
function mechCountOf(levelDef) {
  var has = { gear: false, ice: false, chain: false, prism: false };
  var tiles = levelDef.tiles || [];
  for (var i = 0; i < tiles.length; i++) {
    var m = tiles[i].m;
    if (m === 'g') has.gear = true;
    else if (m === 'i') has.ice = true;
    else if (m === 'c') has.chain = true;
    else if (m === 'k') has.chain = true; /* 钥匙+锁链同组机制 */
  }
  if ((levelDef.prisms || []).length > 0) has.prism = true;
  if ((levelDef.cfg && levelDef.cfg.chains || []).length > 0) has.chain = true;
  var count = 0;
  for (var k in has) if (has[k]) count++;
  return count;
}

/* =========================================================
 * T040/T043: difficultyScore（权重 level-config SCORE_WEIGHTS）
 * norm = 全 50 关全域 min-max 归一（传入预计算域）
 * ========================================================= */
function difficultyScoreOf(m, domains, suitsCount, tilesCount) {
  function norm(v, dom) {
    if (dom[1] === dom[0]) return 0.5;
    return (v - dom[0]) / (dom[1] - dom[0]);
  }
  var w = CFG.SCORE_WEIGHTS;
  var scVal =
    w.minMoves * norm(m.minMoves, domains.minMoves) +
    w.solutionCount * (1 - norm(m.solutionCount, domains.solutionCount)) +
    w.dockPeak * norm(m.dockPeak, domains.dockPeak) +
    w.mechCount * m.mechCount +
    w.tiles * norm(tilesCount, domains.tiles) +
    w.suits * norm(suitsCount, domains.suits);
  return Math.round(scVal * 10);
}

/* =========================================================
 * T044: 质量门禁（曲线门）
 * ========================================================= */
function curveGates(levelsWithMetrics) {
  /* 按章聚合 difficultyScore 均值 */
  var chScores = {};
  var chMoves = {};
  var i, L;
  for (i = 0; i < levelsWithMetrics.length; i++) {
    L = levelsWithMetrics[i];
    var ch = L.chapter;
    if (!chScores[ch]) { chScores[ch] = []; chMoves[ch] = []; }
    chScores[ch].push(L.metrics.difficultyScore);
    chMoves[ch].push(L.metrics.minMoves);
  }
  var chIds = Object.keys(chScores).map(Number).sort(function (a, b) { return a - b; });

  /* 门-1: 各章均值随章号单调不减 */
  var chMonotonic = true;
  var prev = -1;
  for (i = 0; i < chIds.length; i++) {
    var arr = chScores[chIds[i]];
    var mean = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    if (mean < prev - 1e-9) { chMonotonic = false; break; }
    prev = mean;
  }

  /* 门-2: 1~4 章 minMoves 线性回归斜率 ≥0（章均值序列上） */
  var slope14 = 0;
  var ch14 = chIds.filter(function (c) { return c <= 4; });
  if (ch14.length >= 2) {
    var xs = ch14;
    var ys = ch14.map(function (c) {
      var ms = chMoves[c];
      return ms.reduce(function (a, b) { return a + b; }, 0) / ms.length;
    });
    var xm = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
    var ym = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
    var num = 0, den = 0;
    for (i = 0; i < xs.length; i++) {
      num += (xs[i] - xm) * (ys[i] - ym);
      den += (xs[i] - xm) * (xs[i] - xm);
    }
    slope14 = den === 0 ? 0 : num / den;
  }

  /* 门-3: 第 5 章锯齿——个位 4/9 显著 > 章均值、5/0 显著 < */
  var ch5Zigzag = false;
  var ch5 = levelsWithMetrics.filter(function (L2) { return L2.chapter === 5; });
  if (ch5.length) {
    var mean5 = ch5.reduce(function (a, b) { return a + b.metrics.difficultyScore; }, 0) / ch5.length;
    var spike = ch5.filter(function (L3) { var dg = L3.id % 10; return dg === 4 || dg === 9; });
    var valley = ch5.filter(function (L3) { var dg = L3.id % 10; return dg === 5 || dg === 0; });
    var meanSpike = spike.length ? spike.reduce(function (a, b) { return a + b.metrics.difficultyScore; }, 0) / spike.length : mean5;
    var meanValley = valley.length ? valley.reduce(function (a, b) { return a + b.metrics.difficultyScore; }, 0) / valley.length : mean5;
    /* 显著: 挑战高于均值 ≥10%、解压低于均值 ≥10%（容差带） */
    ch5Zigzag = (spike.length > 0 && valley.length > 0 && meanSpike > mean5 * 1.10 && meanValley < mean5 * 0.90);
  }

  return { chMonotonic: chMonotonic, slope14: slope14, ch5Zigzag: ch5Zigzag };
}


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

/* ---------- 5. 胜利条件（棋盘+dock 全清; 暂存区已移除） ---------- */
function testWinCondition() {
  var L = mkLevel(4, [
    { r: 0, c: 1, s: 1, d: 0 },
    { r: 2, c: 0, s: 0, d: 2 }, { r: 2, c: 1, s: 0, d: 2 }
  ]);
  var s = RE.init(L);
  assert(RE.terminal(s) === 'playing', '棋盘非空 → playing');
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

/* ---------- 7. T023 齿轮: 十字相邻触发 / 对角不触发 ---------- */
function testGear() {
  var L = mkLevel(5, [
    { r: 2, c: 2, s: 1, d: 0, m: 'g' },              /* id0 齿轮 朝 U */
    { r: 2, c: 3, s: 2, d: 1 },                       /* id1 十字相邻 (右) 朝 R 畅通 */
    { r: 3, c: 3, s: 2, d: 1 },                       /* id2 (3,3) 朝 R 边缘畅通——对角于齿轮 (2,2)（|Δr|+|Δc|=2） */
    { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 2, s: 0, d: 0 }, { r: 1, c: 3, s: 0, d: 0 },
    { r: 3, c: 1, s: 0, d: 3 }, { r: 3, c: 2, s: 0, d: 3 }, { r: 4, c: 1, s: 0, d: 2 },
    { r: 0, c: 0, s: 0, d: 0 }, { r: 4, c: 2, s: 0, d: 2 }, { r: 4, c: 3, s: 0, d: 2 }
  ]);
  var s = RE.init(L);
  var r = RE.applyTap(s, 1); /* id1 飞出 → 十字相邻齿轮应转 90° */
  assert(r.type === 'flyout', '齿轮关: id1 应飞出');
  assert(s.tiles[0].d === 1, 'T023 齿轮应顺时针转 90°（0→1）, got ' + s.tiles[0].d);
  var gearEv = r.events.some(function (e) { return e.e === 'gear' && e.id === 0 && e.from === 0 && e.to === 1; });
  assert(gearEv, 'T023 gear 事件应携带 from/to');
  /* 对角滑块飞出不触发 */
  var r2 = RE.applyTap(s, 2); /* id2 (3,3) 朝 R 畅通——对角于齿轮 */
  assert(r2.type === 'flyout', 'id2 应飞出');
  assert(s.tiles[0].d === 1, 'T023 对角飞出不触发齿轮（仍 1）, got ' + s.tiles[0].d);
}

/* ---------- 8. T024 破冰双口径 ---------- */
function testIce() {
  /* triple 口径: 三消全场冰层 -1 */
  var L = mkLevel(5, [
    { r: 0, c: 2, s: 1, d: 0 }, { r: 0, c: 1, s: 1, d: 0 }, { r: 0, c: 3, s: 1, d: 0 }, /* 三同花色 s=1 */
    { r: 3, c: 3, s: 0, d: 2, m: 'i', x: 2 },   /* id3 冰封厚 2 */
    { r: 3, c: 0, s: 2, d: 2 }, { r: 3, c: 1, s: 2, d: 2 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 2, c: 0, s: 0, d: 3 }, { r: 4, c: 0, s: 0, d: 2 },
    { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 2, s: 0, d: 0 }, { r: 1, c: 3, s: 0, d: 0 },
    { r: 2, c: 1, s: 0, d: 3 }, { r: 2, c: 2, s: 0, d: 3 }, { r: 2, c: 3, s: 0, d: 3 }
  ]);
  L.cfg.iceMode = 'triple';
  var s = RE.init(L);
  assert(RE.canTap(s, 3) === false, 'T024 冰封滑块不可 tap');
  /* id0/1/2 三连飞出 → 三消 → 全场冰层 2→1 */
  RE.applyTap(s, 0); RE.applyTap(s, 1); RE.applyTap(s, 2);
  assert(s.tiles[3].ice === 1, 'T024 triple 破冰: 冰层 2→1, got ' + s.tiles[3].ice);
  assert(RE.canTap(s, 3) === false, '冰层 1 仍不可 tap');
  /* adjacent 口径: 仅十字相邻飞出者 ice-- */
  var L2 = mkLevel(5, [
    { r: 0, c: 2, s: 1, d: 0 }, { r: 0, c: 1, s: 1, d: 0 }, { r: 0, c: 3, s: 1, d: 0 },
    { r: 3, c: 3, s: 0, d: 2, m: 'i', x: 1 },   /* id3 冰封 */
    { r: 2, c: 3, s: 2, d: 1 },                 /* id4 (2,3) 十字相邻 id3 上方 朝 R 飞出 */
    { r: 3, c: 0, s: 2, d: 2 }, { r: 3, c: 1, s: 2, d: 2 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 2, c: 0, s: 0, d: 3 }, { r: 4, c: 0, s: 0, d: 2 },
    { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 2, s: 0, d: 0 }, { r: 1, c: 3, s: 0, d: 0 },
    { r: 2, c: 1, s: 0, d: 3 }, { r: 2, c: 2, s: 0, d: 3 }, { r: 4, c: 3, s: 0, d: 2 }
  ]);
  L2.cfg.iceMode = 'adjacent';
  var s2 = RE.init(L2);
  var r4 = RE.applyTap(s2, 4); /* id4 飞出——十字相邻 id3 → 破冰 1→0 */
  assert(r4.type === 'flyout', 'adjacent 关 id4 应飞出');
  assert(s2.tiles[3].ice === 0 && s2.tiles[3].m == null, 'T024 adjacent 破冰: 冰层归零清标记, got ice=' + s2.tiles[3].ice + ' m=' + s2.tiles[3].m);
}

/* ---------- 9. T025 chains 或语义解锁 + 钥匙可达性 ---------- */
function testChains() {
  var L = mkLevel(5, [
    { r: 0, c: 1, s: 1, d: 0, m: 'k' },          /* id0 钥匙 朝 U */
    { r: 2, c: 2, s: 1, d: 0, m: 'c' },          /* id1 锁链（1 朵 s=1 但锁住） */
    { r: 2, c: 3, s: 1, d: 1 },                  /* id2 s=1 凑组 */
    { r: 0, c: 2, s: 1, d: 0 },                  /* id3 s=1 凑组 */
    { r: 3, c: 0, s: 0, d: 2 }, { r: 3, c: 1, s: 0, d: 2 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 2, c: 0, s: 0, d: 3 }, { r: 4, c: 0, s: 0, d: 2 },
    { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 3, s: 0, d: 0 }, { r: 2, c: 1, s: 0, d: 3 }
  ]);
  L.cfg.chains = [[0, [1]]];
  var s = RE.init(L);
  assert(RE.canTap(s, 1) === false, 'T025 锁链滑块不可 tap');
  var r = RE.applyTap(s, 0); /* 钥匙飞出 → 锁链解锁 */
  assert(r.type === 'flyout', '钥匙应飞出');
  assert(s.tiles[1].locked === false, 'T025 钥匙飞出后锁链应解锁');
  var unlockEv = r.events.some(function (e) { return e.e === 'unlock' && e.id === 1 && e.by === 0; });
  assert(unlockEv, 'T025 unlock 事件应携带 by');
  assert(RE.canTap(s, 1) === true, '解锁后可 tap');
}

/* ---------- 10. T030 道具语义 ---------- */
function testItems() {
  var L = mkLevel(5, [
    { r: 0, c: 1, s: 1, d: 0 },
    { r: 2, c: 2, s: 0, d: 2 },
    { r: 3, c: 0, s: 2, d: 2 }, { r: 3, c: 1, s: 2, d: 2 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 2, s: 0, d: 0 },
    { r: 2, c: 0, s: 0, d: 3 }, { r: 2, c: 1, s: 0, d: 3 }
  ]);
  var s = RE.init(L);
  /* wrench: 普通滑块顺时针转 */
  var w = RE.applyItem(s, 'wrench', 0);
  assert(w.type === 'wrench' && s.tiles[0].d === 1, 'T030 扳手应顺时针转（0→1）');
  /* wrench 对冰封 invalid */
  var L2 = mkLevel(5, [
    { r: 0, c: 1, s: 1, d: 0 },
    { r: 2, c: 2, s: 0, d: 2, m: 'i', x: 1 },
    { r: 3, c: 0, s: 2, d: 2 }, { r: 3, c: 1, s: 2, d: 2 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 2, s: 0, d: 0 },
    { r: 2, c: 0, s: 0, d: 3 }, { r: 2, c: 1, s: 0, d: 3 }
  ]);
  var s2 = RE.init(L2);
  var w2 = RE.applyItem(s2, 'wrench', 1);
  assert(w2.type === 'invalid', 'T030 扳手对冰封滑块应 invalid');
  /* （stage/stageTile 断言已随暂存区功能移除——applyItem('stage') 恒 invalid） */
  var s3 = RE.init(L2);
  var stX = RE.applyItem(s3, 'stage');
  assert(stX.type === 'invalid', 'stage 道具已移除: applyItem 恒 invalid');
}

/* ---------- 11. T028 死锁谓词不误杀 ---------- */
function testDeadlockPredicate() {
  /* 场景 A: 齿轮在场且可转（wrench 可用）→ 非疑 */
  var L = mkLevel(5, [
    { r: 2, c: 2, s: 1, d: 0, m: 'g' },  /* 齿轮朝 U 前方 (1,2) 有滑块 → blocked */
    { r: 1, c: 2, s: 0, d: 0, m: 'i', x: 1 }, /* 冰封不可点 → 无飞出型 tap */
    { r: 3, c: 0, s: 2, d: 2 }, { r: 3, c: 1, s: 2, d: 2 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 1, c: 1, s: 0, d: 0 },
    { r: 2, c: 0, s: 0, d: 3 }, { r: 2, c: 1, s: 0, d: 3 }
  ]);
  var s = RE.init(L);
  assert(RE.deadlockSuspect(s) === false, 'T028 扳手可用 + 齿轮在场 → 非疑死锁');
  /* 场景 B: 真死锁——清空自由滑块后仅剩互挡对、无道具 */
  var L2 = mkLevel(4, [
    { r: 1, c: 1, s: 0, d: 1 }, /* 朝 R 被 (1,2) 挡 */
    { r: 1, c: 2, s: 0, d: 3 }, /* 朝 L 被 (1,1) 挡 */
    { r: 0, c: 0, s: 0, d: 0 }, { r: 0, c: 1, s: 0, d: 0 }
  ]);
  var s2 = RE.init(L2);
  RE.applyTap(s2, 2); RE.applyTap(s2, 3); /* 清空第 0 行自由滑块（同花色×2 入槽——无三消不判胜） */
  s2.items = { undo: 0, wrench: 0 };
  s2.dock = []; /* 无关变量清空（两滑块仍在 dock——count=2 无三消） */
  var tapsB = RE.enumerateTaps(s2);
  assert(tapsB.length === 2, '互挡对均可 tap（弹回型）, got ' + tapsB.length);
  assert(RE.deadlockSuspect(s2) === true, 'T028 互挡无道具 → 疑死锁');
}

function engineSelftest() {
  var tests = [
    ['转向加法 (d+1)%4', testDirection],
    ['棱镜 8 映射', testPrismTable],
    ['Δ8 分层立体阻挡（凌空飞越/同层阻挡/全高棱镜/reveal 级联）', testLayerAwareRaycast],
    ['三消优先于爆槽', testTripleBeforeBurst],
    ['Δ3 胜利条件', testWinCondition],
    ['快照/restore 等价', testSnapshotRestore],
    ['T023 齿轮十字邻接触发/对角不触发', testGear],
    ['T024 破冰双口径（triple/adjacent）', testIce],
    ['T025 chains 解锁（或语义）', testChains],
    ['T030 道具语义（wrench; stage 已移除）', testItems],
    ['T028 死锁谓词不误杀', testDeadlockPredicate]
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
  console.log('engine-selftest: ' + passed + '/' + tests.length + ' all green（T038 断言组全量: 转向/棱镜/Δ8 分层/三消优先/胜利条件/快照/齿轮/破冰/chains/道具/死锁谓词）');
  process.exit(0);
}

/* =========================================================
 * T044: CLI 与质量门禁
 * ========================================================= */
function fmtMs(n) { return (n / 1000).toFixed(2) + 's'; }

function runFull(seed) {
  var levels = LEVELS_SRC;
  var t0 = Date.now();
  console.log('solver: 全量验证 ' + levels.length + ' 关（预算 nodes=' + CFG.BUDGET.nodes + ' ms=' + CFG.BUDGET.ms + '/关）');
  var gate = 0; /* 0 = pass; 非 0 = fail（exit code） */
  var failedIds = [];
  var records = [];

  /* 第一遍: validateLevel + solve */
  var i;
  for (i = 0; i < levels.length; i++) {
    var L = levels[i];
    var t1 = Date.now();
    var v = RE.validateLevel(L);
    if (!v.ok) {
      console.error('  ✗ L' + L.id + ' validateLevel: ' + v.errors.join('; '));
      gate = 1;
      failedIds.push(L.id);
      records.push({ id: L.id, solvable: false, error: 'validateLevel: ' + v.errors.join('; '), elapsedMs: 0 });
      continue;
    }
    var sol = solveLevel(L, { budget: CFG.BUDGET });
    var elapsed = Date.now() - t1;
    if (!sol.solvable) {
      console.error('  ✗ L' + L.id + ' 不可解（nodes=' + sol.nodes + (sol.exhausted ? ' [预算耗尽]' : '') + '）');
      gate = 1;
      failedIds.push(L.id);
    }
    records.push({
      id: L.id,
      solvable: sol.solvable,
      minMoves: sol.minMoves,
      solutionCount: sol.solutionCount,
      dockPeak: sol.dockPeak,
      openSuitsMax: sol.openSuitsMax,
      elapsedMs: elapsed
    });
    console.log('  ' + (sol.solvable ? '✓' : '✗') + ' L' + L.id + ' solvable=' + sol.solvable +
      ' minMoves=' + sol.minMoves + ' dockPeak=' + sol.dockPeak +
      ' openSuits=' + sol.openSuitsMax + ' solCount=' + sol.solutionCount +
      ' nodes=' + sol.nodes + ' ' + fmtMs(elapsed));
  }

  /* difficultyScore 全域归一（min-max across 50 levels） */
  var domains = { minMoves: [Infinity, -Infinity], solutionCount: [Infinity, -Infinity], dockPeak: [Infinity, -Infinity], tiles: [Infinity, -Infinity], suits: [Infinity, -Infinity] };
  var suitsOf = {};
  for (i = 0; i < levels.length; i++) {
    var L2 = levels[i];
    var rec = records[i];
    if (!rec.solvable) continue;
    var tilesN = L2.tiles.length;
    var suitSet = {};
    for (var j = 0; j < tilesN; j++) suitSet[L2.tiles[j].s] = true;
    var suitsN = 0;
    for (var k in suitSet) suitsN++;
    suitsOf[L2.id] = suitsN;
    var sc = typeof rec.solutionCount === 'number' ? rec.solutionCount : 10000;
    domains.minMoves[0] = Math.min(domains.minMoves[0], rec.minMoves);
    domains.minMoves[1] = Math.max(domains.minMoves[1], rec.minMoves);
    domains.solutionCount[0] = Math.min(domains.solutionCount[0], sc);
    domains.solutionCount[1] = Math.max(domains.solutionCount[1], sc);
    domains.dockPeak[0] = Math.min(domains.dockPeak[0], rec.dockPeak);
    domains.dockPeak[1] = Math.max(domains.dockPeak[1], rec.dockPeak);
    domains.tiles[0] = Math.min(domains.tiles[0], tilesN);
    domains.tiles[1] = Math.max(domains.tiles[1], tilesN);
    domains.suits[0] = Math.min(domains.suits[0], suitsN);
    domains.suits[1] = Math.max(domains.suits[1], suitsN);
  }

  /* metrics 逐字段一致（levels.js 内嵌 vs 本次求解） + 结构约束门 */
  var embedded = [];
  for (i = 0; i < levels.length; i++) {
    var L3 = levels[i];
    var rec2 = records[i];
    var mech = mechCountOf(L3);
    var dScore = rec2.solvable ? difficultyScoreOf({
      minMoves: rec2.minMoves, solutionCount: typeof rec2.solutionCount === 'number' ? rec2.solutionCount : 10000,
      dockPeak: rec2.dockPeak, mechCount: mech
    }, domains, suitsOf[L3.id], L3.tiles.length) : 0;
    rec2.mechCount = mech;
    rec2.difficultyScore = dScore;
    embedded.push({ id: L3.id, chapter: L3.chapter, metrics: { minMoves: rec2.minMoves, solutionCount: rec2.solutionCount, dockPeak: rec2.dockPeak, mechCount: mech, difficultyScore: dScore, openSuitsMax: rec2.openSuitsMax } });

    /* 门 ③结构: openSuitsMax ≤5（解路径上的最大开放花色——此处用求解全程值） */
    if (rec2.solvable && rec2.openSuitsMax > 5) {
      console.error('  ✗ L' + L3.id + ' openSuitsMax=' + rec2.openSuitsMax + ' > 5');
      gate = 1;
    }
    /* 门 ⑦报告一致: levels.js 内嵌 metrics 与本报告逐字段一致 */
    if (L3.metrics) {
      var mm = ['minMoves', 'solutionCount', 'dockPeak', 'mechCount', 'difficultyScore', 'openSuitsMax'];
      for (var mi = 0; mi < mm.length; mi++) {
        var f = mm[mi];
        if (L3.metrics[f] !== rec2[f]) {
          console.error('  ✗ L' + L3.id + ' metrics.' + f + ' 不一致: levels.js=' + L3.metrics[f] + ' report=' + rec2[f]);
          gate = 1;
        }
      }
    } else {
      console.error('  ✗ L' + L3.id + ' metrics 缺失');
      gate = 1;
    }
    /* solutionMoves 回放必胜（门禁兜底——D-10 双验） */
    if (rec2.solvable && Array.isArray(L3.solutionMoves)) {
      var st = RE.init(L3);
      var ok = true;
      for (var sv = 0; sv < L3.solutionMoves.length; sv++) {
        var mv = L3.solutionMoves[sv];
        var rr = RE.applyTap(st, mv.t);
        if (rr.type === 'invalid' || rr.type === 'blocked') { ok = false; break; }
      }
      if (!ok || RE.terminal(st) !== 'won') {
        console.error('  ✗ L' + L3.id + ' solutionMoves 回放未胜');
        gate = 1;
      }
      if (L3.solutionMoves.length !== rec2.minMoves) {
        console.error('  ✗ L' + L3.id + ' solutionMoves.length=' + L3.solutionMoves.length + ' ≠ minMoves=' + rec2.minMoves);
        gate = 1;
      }
    }
  }

  /* 曲线门 */
  var cg = curveGates(embedded);
  console.log('curveGate: chMonotonic=' + cg.chMonotonic + ' slope14=' + cg.slope14.toFixed(2) + ' ch5Zigzag=' + cg.ch5Zigzag);
  if (!cg.chMonotonic) { console.error('  ✗ 曲线门-1: 章均值非单调不减'); gate = 1; }
  if (cg.slope14 < 0) { console.error('  ✗ 曲线门-2: 1~4 章 minMoves 斜率 < 0'); gate = 1; }
  if (!cg.ch5Zigzag) { console.error('  ✗ 曲线门-3: 第 5 章锯齿形态不显著'); gate = 1; }

  /* 报告写盘 */
  var report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seed: seed == null ? null : seed,
    nodeBudget: CFG.BUDGET,
    levels: records,
    summary: {
      total: levels.length,
      solvable: records.filter(function (r) { return r.solvable; }).length,
      failedIds: failedIds,
      curveGate: cg
    }
  };
  var fs = require('fs');
  fs.writeFileSync(path.join(__dirname, 'solver-report.json'), JSON.stringify(report, null, 2));
  console.log('报告 → tools/solver-report.json');
  console.log('summary: ' + report.summary.solvable + '/' + report.summary.total + ' solvable, 耗时 ' + fmtMs(Date.now() - t0));
  process.exit(gate === 0 ? 0 : 1);
}

function runSingle(levelId) {
  var levels = LEVELS_SRC;
  var L = null;
  for (var i = 0; i < levels.length; i++) if (levels[i].id === levelId) { L = levels[i]; break; }
  if (!L) { console.error('未找到关卡 id=' + levelId); process.exit(1); }
  var v = RE.validateLevel(L);
  if (!v.ok) { console.error('validateLevel FAIL: ' + v.errors.join('; ')); process.exit(1); }
  var t0 = Date.now();
  var sol = solveLevel(L, { budget: CFG.BUDGET });
  console.log('L' + L.id + ' solvable=' + sol.solvable + ' minMoves=' + sol.minMoves + ' dockPeak=' + sol.dockPeak +
    ' openSuits=' + sol.openSuitsMax + ' solCount=' + sol.solutionCount + ' nodes=' + sol.nodes + ' ' + fmtMs(Date.now() - t0));
  process.exit(sol.solvable ? 0 : 1);
}

function main() {
  var args = process.argv.slice(2);
  if (args.indexOf('--engine-selftest') >= 0) {
    engineSelftest();
    return;
  }
  var li = args.indexOf('--level');
  if (li >= 0 && args[li + 1]) {
    runSingle(parseInt(args[li + 1], 10));
    return;
  }
  var si = args.indexOf('--seed');
  var seed = si >= 0 && args[si + 1] ? parseInt(args[si + 1], 10) : null;
  runFull(seed);
}

if (require.main === module) main();
module.exports = {
  main: main,
  engineSelftest: engineSelftest,
  makeRng: makeRng,
  stateKey: stateKey,
  makeBudget: makeBudget,
  solveLevel: solveLevel,
  undoTap: undoTap,
  mechCountOf: mechCountOf,
  difficultyScoreOf: difficultyScoreOf,
  curveGates: curveGates
};
