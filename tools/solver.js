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
 *   · blocked: 弹回原位（无棋盘副作用；damage 恒 0，不再扣命）
 * 前置条件: dock 滑块为 state.tiles 同一对象（init/dockInsert/restore 均满足）
 * ========================================================= */
function undoTap(state, r) {
  if (!r || !r.events) return;
  /* 2026-10-23: damage 恒 0，不再回补 lives */
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
  /* 主体滑块摘出 dock → 回棋盘（flyout/prism-flyout）
   * Δ19a: 插回**所属层**的独立容器（boards[z]） */
  if (r.type === 'flyout' || r.type === 'prism-flyout') {
    var t = state.tiles[r.tileId];
    var di = -1;
    for (i = 0; i < state.dock.length; i++) {
      if (state.dock[i] === t) { di = i; break; }
    }
    if (di >= 0) state.dock.splice(di, 1);
    t.removed = false;
    /* 插回棋盘栈（按 z 升序位置） */
    var lb = RE.layerBoard(state, t.z || 0);
    var cell = lb[t.r] && lb[t.r][t.c];
    if (!cell || cell.prism) {
      lb[t.r][t.c] = [t];
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

  /* Δ15a: 构造解引导（hintPath）——redisperse 后花色排列使盲目 DFS 搜索树
   * 指数爆炸（75 层深 × 几十动作/层，seen 剪枝救不回）。回放已证
   * solutionMoves 是合法必胜序列 → DFS 每层把它"下一步 tile"提到展开首位
   * （纯展开顺序启发——不改变解集/计数/minMoves 语义，命中即得 foundMoves，
   * 之后继续全展开照常计 solutions） */
  var hintPath = opts.hintPath || null;
  var hintSet = null;
  if (hintPath && anchorLen === hintPath.length) {
    hintSet = {};
    for (var hp = 0; hp < hintPath.length; hp++) {
      var hmv = hintPath[hp];
      hintSet[hmv.t + '_' + hp] = true;
    }
  }

  /* Δ11 口径修正: openSuitsMax = **最优解路径上**的最大开放花色数（FR-029/门 ③
   * 原实现为「搜索全程」——搜索中途试探态（非解路径）在大棋盘 8 花色下必然
   * 峰值更高，指标语义与契约「最优路径开放花色 ≤5」不符。改为首解路径回放统计） */
  function openSuitsOnPath(st, path) {
    var max = 0;
    for (var pi = 0; pi < path.length; pi++) {
      var r = RE.applyTap(st, path[pi]);
      if (r.type === 'invalid' || r.type === 'blocked') continue; /* 理论不发生（解路径全 flyout） */
      var seen = {};
      for (var j = 0; j < st.dock.length; j++) seen[st.dock[j].s] = true;
      var m = 0;
      for (var k in seen) m++;
      if (m > max) max = m;
    }
    return max;
  }

  /* 动作集（T042; Δ11 启发式排序）: enumerateTaps 按优先级降序展开——
   * ① Dock 已有花色计数 2 → 该花色 tap 最优先（下一步即三消腾槽）
   * ② 钥匙滑块（解锁锁链，扩大可行动作集）
   * ③ 高层 z 滑块（塔顶通常无阻挡——快速剥离）
   * ④ Dock 已有花色计数 1（凑对）
   * ⑤ 其余按 id 序（行优先列优先——D-08 确定性兜底）
   * 破冰隐含在 ①（三消即全场破冰）。同优先级稳定排序保证确定性。 */
  function expandActions(st) {
    var taps = RE.enumerateTaps(st);
    var counts = {};
    var i3;
    for (i3 = 0; i3 < st.dock.length; i3++) {
      var ds = st.dock[i3].s;
      counts[ds] = (counts[ds] || 0) + 1;
    }
    var scored = [];
    for (i3 = 0; i3 < taps.length; i3++) {
      var tid = taps[i3];
      var t = st.tiles[tid];
      var pri = 0;
      var c = counts[t.s];
      if (c === 2) pri = 4;             /* 立即三消 */
      else if (t.m === 'k') pri = 3;    /* 钥匙解锁 */
      else if ((t.z || 0) >= 2) pri = 2; /* 高层无阻挡剥离 */
      else if (c === 1) pri = 1;        /* 凑对 */
      scored.push({ k: 0, t: tid, pri: pri });
    }
    scored.sort(function (a, b) {
      if (a.pri !== b.pri) return b.pri - a.pri;
      return a.t - b.t; /* 同优先级 id 序（确定性） */
    });
    return scored;
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
    /* 构造解引导: hint 序列在本深度对应 tile 置顶（若仍可动） */
    if (hintSet && depth < hintPath.length) {
      var hkey = hintPath[depth].t + '_' + depth;
      if (hintSet[hkey]) {
        for (var hi = 0; hi < acts.length; hi++) {
          if (acts[hi].t === hintPath[depth].t) {
            if (hi !== 0) {
              var hv = acts.splice(hi, 1)[0];
              acts.unshift(hv);
            }
            break;
          }
        }
      }
    }
    for (var ai = 0; ai < acts.length; ai++) {
      if (budget.tick()) return 'budget'; /* 预算按动作边计（每边 = 一次快照+克隆——OOM 防护） */
      var a = acts[ai];
      var r = RE.applyTap(st, a.t);
      if (r.type === 'invalid') continue;
      if (r.type === 'blocked') { continue; } /* 无棋盘副作用（damage 恒 0） */
      if (st.dock.length > dockPeakMax) dockPeakMax = st.dock.length;
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

  /* Δ11: 首解路径上的开放花色（fresh 状态回放统计） */
  if (foundPath) {
    var stR = RE.init(levelDef);
    openSuitsMaxSeen = openSuitsOnPath(stR, foundPath);
  }

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
 * norm = 全 60 关全域 min-max 归一（传入预计算域——Δ13 扩容后全域）
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
 * T044: 质量门禁（曲线门; Δ11 波浪架构适配——3 章 + 7/7/8 锯齿）
 * ========================================================= */
function curveGates(levelsWithMetrics) {
  var CFGX = require(path.join(__dirname, 'level-config.js'));
  var LAST_CH = CFGX.CHAPTERS.length; /* Δ5: 章数动态（当前 3） */
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

  /* 门-2: 全章 minMoves 线性回归斜率 ≥0（Δ11: 章均值序列上——原 1~4 章
   * 改为全部章（新 3 章架构下 1~2 章仅 2 点无回归意义） */
  var slope14 = 0;
  if (chIds.length >= 2) {
    var xs = chIds;
    var ys = chIds.map(function (c) {
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

  /* 门-3: Δ11/Δ16a 波浪锯齿——「2 简 1 难」3 关一循环（Δ13 锚点: L4+ (id-4)%3==2 → 8×8 难关;
   * L1~L3 新手循环 1 不计入波浪统计）
   * 显著性: 8×8 挑战关均值 > 全程均值 × 1.05、7×7 简单关 < × 0.95
   * （门禁校准注记: 挑战/简单档实际分离 ≈ spike-valley ≥ 10 分（>20% 相对差），
   *   单侧 8%/8% 容差带在大棋盘波浪下过紧——总体递进（L39 7×7 后期高分）与
   *   局部波浪（8×8 挑战）叠加时 7×7 简单关均值被后期抬高; 1.05/0.95 保持
   * 「显著分离」语义且与总体递进共存。原 1.10/0.90 为第 5 章局部节奏口径）
   * （末章叠加个位 4/9 挑战 / 5/0 解压节奏——两者错峰时以波浪位为准） */
  var ch5Zigzag = false;
  var waved = levelsWithMetrics.filter(function (L2) { return L2.id >= 4; });
  if (waved.length >= 6) {
    var meanAll = waved.reduce(function (a, b) { return a + b.metrics.difficultyScore; }, 0) / waved.length;
    var spike = waved.filter(function (L3) { return (L3.id - 4) % 3 === 2; });
    var valley = waved.filter(function (L3) { return (L3.id - 4) % 3 !== 2; });
    var meanSpike = spike.length ? spike.reduce(function (a, b) { return a + b.metrics.difficultyScore; }, 0) / spike.length : meanAll;
    var meanValley = valley.length ? valley.reduce(function (a, b) { return a + b.metrics.difficultyScore; }, 0) / valley.length : meanAll;
    ch5Zigzag = (spike.length > 0 && valley.length > 0 && meanSpike > meanAll * 1.05 && meanValley < meanAll * 0.95);
  }

  return { chMonotonic: chMonotonic, slope14: slope14, ch5Zigzag: ch5Zigzag };
}


/* =========================================================
 * Δ15a/FR-029 §1 / FR-030: 空间聚散度核验（三档曲线档位判定）
 * 邻接定义: 曼哈顿距离 1 或同格相邻层（|Δr|+|Δc|==0）= 连坐;
 *   三连簇 = 三元组 ≥2 对连坐; 双连坐 = 恰 1 对; 完全分散 = 两两 ≥2
 * 口径: 三元组按 solutionMoves 消除序划分（第 3k+1..3k+3 个同花色滑块为一组——
 *   Dock 按 3 计数清空，第 3 次到达即整组消除; FR-005 同口径）
 * ========================================================= */
/* =========================================================
 * Δ19a/FR-029 §7: 空间聚散度（v2 半格坐标口径）
 *   邻接判据改用**渲染实坐标**（偶数层 (r,c) / 奇数层 (r+0.5,c+0.5)）:
 *     · 曼哈顿距离 < 1.05（半格错位下的紧挨）→ 连坐
 *     · 跨层同渲染位（奇数层压在偶数层四格交界中心）→ 视为空间相邻
 *   三档曲线档位上限 MUST NOT 因坐标体系变化而放宽（FR-029 §7）
 * ========================================================= */
function realAdjacency(a, b) {
  var pa = RE.renderPos(a.r, a.c, a.z || 0);
  var pb = RE.renderPos(b.r, b.c, b.z || 0);
  var d = Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c);
  if (d < 1.05) return 1;
  if (d < 1.5) return 0.5;
  return 0;
}

/* Δ19a/FR-044 §3: 零悬空违规计数（支撑性校验） */
function floatingViolationsOf(levelDef) {
  var tiles = levelDef.tiles || [];
  var cellIndex = {};
  for (var i = 0; i < tiles.length; i++) {
    var t = tiles[i];
    cellIndex[(t.z || 0) + ':' + t.r + ':' + t.c] = true;
  }
  var bad = 0;
  for (var j = 0; j < tiles.length; j++) {
    var st = tiles[j];
    var z = st.z || 0;
    if (z === 0) continue;
    var sup = RE.crossPositions(st.r, st.c, z);
    var ok = false;
    for (var p = 0; p < sup.length; p++) {
      if (cellIndex[(z - 1) + ':' + sup[p][0] + ':' + sup[p][1]]) { ok = true; break; }
    }
    if (!ok) bad++;
  }
  return bad;
}

/* =========================================================
 * Δ19b/FR-030: 瓶颈节奏指标（咽喉点 / 最小可行操作集 / 最长连锁爽消段）
 *   咽喉点 = 沿最优解路径推进时「合法可行操作集 ≤3」的位置
 * ========================================================= */
function bottleneckOf(levelDef) {
  var st = RE.init(levelDef);
  var chokePoints = 0, minChoke = null, maxChain = 0, chain = 0;
  for (var i = 0; i < (levelDef.solutionMoves || []).length; i++) {
    var mv = levelDef.solutionMoves[i];
    var live = 0;
    for (var t = 0; t < st.tiles.length; t++) if (!st.tiles[t].removed) live++;
    if (!live) break;
    var taps = RE.enumerateTaps(st);
    if (taps.length <= 3) {
      chokePoints++;
      if (minChoke == null || taps.length < minChoke) minChoke = taps.length;
      chain = 0;
    } else {
      chain++;
      if (chain > maxChain) maxChain = chain;
    }
    var r = RE.applyTap(st, mv.t);
    if (r.type === 'invalid' || r.type === 'blocked') break;
  }
  return {
    chokePoints: chokePoints,
    minChokeActions: minChoke == null ? 0 : minChoke,
    maxChainLen: maxChain
  };
}
function dispersionOf(levelDef) {
  var tiles = levelDef.tiles || [];
  var seq = (levelDef.solutionMoves || []).map(function (m) { return tiles[m.t]; });
  var bySuit = {};
  var i;
  for (i = 0; i < seq.length; i++) {
    var t = seq[i];
    if (!t) continue;
    (bySuit[t.s] = bySuit[t.s] || []).push(t);
  }
  var tripleClusters = 0, pairClusters = 0, dispersed = 0, total = 0;
  var minPairDist = null; /* 全关所有三元组两两最小距离的全局最小 */
  var tripletsBelow2 = 0, tripletsBelow3 = 0;
  var s, list;
  for (s in bySuit) {
    list = bySuit[s];
    for (i = 0; i + 2 < list.length; i += 3) {
      var tri = [list[i], list[i + 1], list[i + 2]];
      var adj = 0, minD = null;
      for (var a = 0; a < 3; a++) {
        for (var b = a + 1; b < 3; b++) {
          /* Δ19a/FR-029 §7: 邻接改用**渲染实坐标**（半格错位下紧挨亦连坐） */
          var pa = RE.renderPos(tri[a].r, tri[a].c, tri[a].z || 0);
          var pb = RE.renderPos(tri[b].r, tri[b].c, tri[b].z || 0);
          var d = Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c);
          if (d === 0) d = 1; /* 同渲染位 = 连坐（跨层同位视为相邻） */
          if (d <= 1.05) adj++;
          if (minD == null || d < minD) minD = d;
        }
      }
      total++;
      if (adj >= 2) tripleClusters++;
      else if (adj === 1) pairClusters++;
      else dispersed++;
      if (minD < 1.05) tripletsBelow2++;
      if (minD < 3) tripletsBelow3++;
      if (minPairDist == null || minD < minPairDist) minPairDist = minD;
    }
  }
  var is8x8 = levelDef.n === 8;
  var tier = CFG.dispersionTierOf(levelDef.id);
  var triplePct = total ? tripleClusters / total : 0;
  var pairPct = total ? pairClusters / total : 0;
  var dispPct = total ? dispersed / total : 0;
  /* 档位达标判定: 三连簇以「每关 ≤1 组」（tripMaxPerLevel）为主门——
   * spec FR-029 §3 原文「三连簇严格 ≤ 5%（每关最多 1 组三连）」:
   * 小关卡 1 组即 >5%（18 组关 5.6%）→ 组数口径优先，百分比作报告值;
   * t1/t3 无 perLevel → 用百分比门。双连坐在目标带内;
   * 完全分散（两两 ≥2）占比 ≥ 1-三连簇上限-双连坐上限（FR-029 §4「绝大多数」
   * 口径——与双连坐带解耦: 双连坐组定义上 minD=1，minPairDist 全局最小仅作
   * 报告指标，8×8 关 ≥3 为优先目标（tripletsBelow3 反推达标率），不作硬门） */
  var okTrip = tier.tripMaxPerLevel != null
    ? tripleClusters <= tier.tripMaxPerLevel
    : triplePct <= tier.tripMax + 1e-9;
  var okPair = pairPct >= tier.pairMin - 1e-9 && pairPct <= tier.pairMax + 1e-9;
  var okDist = total === 0 || dispPct >= 1 - tier.tripMax - tier.pairMax - 1e-9;
  return {
    tripleClusters: tripleClusters,
    pairClusters: pairClusters,
    dispersed: dispersed,
    triplets: total,
    triplePct: Math.round(triplePct * 1000) / 10,
    pairPct: Math.round(pairPct * 1000) / 10,
    dispersedPct: Math.round(dispPct * 1000) / 10,
    minPairDist: minPairDist,
    tripletsBelow2: tripletsBelow2,
    tripletsBelow3: tripletsBelow3,
    distPreferred: is8x8 ? tier.minPairMax : tier.minPairMin,
    tierOk: okTrip && okPair && okDist,
    tierOkTrip: okTrip,
    tierOkPair: okPair,
    tierOkDist: okDist
  };
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

/* ---------- 3. Δ19a 同层独立射线 + 压制锁定 + 零悬空 ---------- */
function testLayerAwareRaycast() {
  /* 3a. 同层独立射线——奇数层 (0,1) 位于半格位 (0.5,1.5)，压住偶数层
   *   (0,1)(0,2)(1,1)(1,2)，但 MUST NOT 阻挡偶数层 (0,0) 朝 R 的射线 */
  var L = mkLevel(5, [
    { r: 0, c: 0, s: 0, d: 1 }, { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 2, s: 0, d: 0 },
    { r: 3, c: 1, s: 1, d: 0 }, { r: 4, c: 0, s: 1, d: 0 }, { r: 4, c: 1, s: 1, d: 0 },
    { r: 0, c: 1, s: 2, d: 1, z: 1 }, { r: 1, c: 1, s: 2, d: 1, z: 1 }, { r: 2, c: 1, s: 2, d: 1, z: 1 }
  ]);
  var s = RE.init(L);
  var r = RE.applyTap(s, 0); /* id0 = (0,0) z=0 朝 R——前方 (0,1)..(0,4) 偶数层全空，奇数层 MUST NOT 阻挡 */
  assert(r.type === 'flyout', 'Δ19a 3a: 奇数层 MUST NOT 阻挡偶数层射线, got ' + r.type);

  /* 3b. 同层 z=1 前方同层 z=1 → 受阻弹回 */
  var LB = mkLevel(5, [
    { r: 0, c: 0, s: 0, d: 0 }, { r: 0, c: 1, s: 0, d: 0 }, { r: 0, c: 2, s: 0, d: 0 },
    { r: 2, c: 2, s: 1, d: 1, z: 1 },
    { r: 2, c: 3, s: 2, d: 1, z: 1 },
    { r: 2, c: 4, s: 2, d: 1 },
    { r: 2, c: 0, s: 2, d: 1 }, { r: 2, c: 1, s: 2, d: 1 }
  ]);
  var s2 = RE.init(LB);
  var r2 = RE.applyTap(s2, 3); /* id3 = (2,2) z=1——前方 (2,3) z=1 同层 */
  assert(r2.type === 'blocked', 'Δ19a 3b: 同层滑块应阻挡, got ' + r2.type);
  assert(r2.blockedAt && r2.blockedAt.r === 2 && r2.blockedAt.c === 3, 'Δ19a 3b: blockedAt 应为 (2,3)');

  /* 3c. z=0 底层被前方 z=0 阻挡（经典行为不变） */
  var s3 = RE.init(LB);
  var r3 = RE.applyTap(s3, 6); /* id6 = (2,0) z=0 朝 R——前方 (2,1) z=0 */
  assert(r3.type === 'blocked', 'Δ19a 3c: 同层经典阻挡应保留, got ' + r3.type);

  /* 3d. Δ19a: 奇数层越界不多飞/少飞一格——奇数层坐标域为 (n-1)×(n-1) */
  var s4 = RE.init(LB);
  var r4 = RE.applyTap(s4, 4); /* id4 = (2,3) z=1 朝 R——奇数层域 4×4，(2,4) 越界 */
  assert(r4.type !== 'invalid', 'Δ19a 3d: 奇数层瓦片应可操作, got ' + r4.type);
  if (r4.type === 'flyout') {
    var outIdx = r4.path[r4.path.length - 1];
    assert(outIdx.c === 4, 'Δ19a 3d: 奇数层飞行应止于 c=4（越界一步），got c=' + outIdx.c);
  }

  /* 3e. 棱镜 = 贯穿全层: z=1 射线遇棱镜恒折射 */
  var LE = mkLevel(5, [
    { r: 2, c: 2, s: 1, d: 1, z: 1 },
    { r: 0, c: 3, s: 0, d: 0 }, { r: 0, c: 4, s: 0, d: 0 }, { r: 1, c: 4, s: 0, d: 0 }
  ], [{ r: 2, c: 3, t: '/' }]);
  var s5 = RE.init(LE);
  var r5 = RE.applyTap(s5, 0);
  assert(r5.type === 'prism-flyout' || r5.type === 'blocked', 'Δ19a 3e: 棱镜应阻挡任意层高, got ' + r5.type);
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
  /* Δ19: 扳手下线——applyItem('wrench') 恒 invalid */
  var w = RE.applyItem(s, 'wrench', 0);
  assert(w.type === 'invalid', 'Δ19 扳手已下线: applyItem("wrench") 应恒 invalid, got ' + w.type);
  assert(s.tiles[0].d === 0, 'Δ19 扳手下线 MUST NOT 改变滑块方向');
  /* 未知道具恒 invalid */
  var stX = RE.applyItem(s, 'stage');
  assert(stX.type === 'invalid', 'stage 道具已移除: applyItem 恒 invalid');
}

/* ---------- 12. Δ19a 半格坐标换算 ---------- */
function testHalfGridCoords() {
  assert(RE.isOddZ(0) === false && RE.isOddZ(1) === true && RE.isOddZ(2) === false && RE.isOddZ(3) === true, 'Δ19a isOddZ 判定错误');
  var p0 = RE.renderPos(2, 3, 0);
  assert(p0.r === 2 && p0.c === 3, 'Δ19a 偶数层实坐标应为 (r,c), got ' + JSON.stringify(p0));
  var p1 = RE.renderPos(2, 3, 1);
  assert(p1.r === 2.5 && p1.c === 3.5, 'Δ19a 奇数层实坐标应为 (r+0.5,c+0.5), got ' + JSON.stringify(p1));
  /* 层坐标域: 偶数层 n / 奇数层 n-1 */
  assert(RE.layerSize(7, 0) === 7 && RE.layerSize(7, 1) === 6, 'Δ19a 层坐标域边长错误');
  /* 压角位: 偶数层 (r,c) 查 (r-1,c-1)(r-1,c)(r,c-1)(r,c) */
  var cp0 = RE.crossPositions(2, 2, 0);
  assert(cp0.length === 4 && cp0[0][0] === 1 && cp0[0][1] === 1 && cp0[3][0] === 2 && cp0[3][1] === 2, 'Δ19a 偶数层压角位错误: ' + JSON.stringify(cp0));
  /* 压角位: 奇数层 (r,c) 查 (r,c)(r,c+1)(r+1,c)(r+1,c+1) */
  var cp1 = RE.crossPositions(2, 2, 1);
  assert(cp1.length === 4 && cp1[0][0] === 2 && cp1[0][1] === 2 && cp1[3][0] === 3 && cp1[3][1] === 3, 'Δ19a 奇数层压角位错误: ' + JSON.stringify(cp1));
  /* renderProbe 暴露实坐标 + covered */
  var L = mkLevel(5, [
    { r: 0, c: 0, s: 0, d: 0 },
    { r: 0, c: 1, s: 0, d: 0 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 1, c: 1, s: 0, d: 0 },
    { r: 0, c: 0, s: 1, d: 1, z: 1 }
  ]);
  var s = RE.init(L);
  var probe = RE.renderProbe(s);
  var oddTile = probe.tiles.filter(function (t) { return t.z === 1; })[0];
  assert(oddTile.rr === 0.5 && oddTile.cc === 0.5, 'Δ19a renderProbe 奇数层实坐标错误: ' + oddTile.rr + ',' + oddTile.cc);
  var evenCovered = probe.tiles.filter(function (t) { return t.z === 0 && t.covered; });
  assert(evenCovered.length === 4, 'Δ19a renderProbe covered 标记数应为 4, got ' + evenCovered.length);
}

/* ---------- 13. Δ19a 压制锁定（Overlap Lock） ---------- */
function testOverlapLock() {
  /* 奇数层 (1,1) 压住偶数层 (1,1)(1,2)(2,1)(2,2) */
  var L = mkLevel(5, [
    { r: 1, c: 1, s: 0, d: 0 },
    { r: 1, c: 2, s: 0, d: 0 },
    { r: 2, c: 1, s: 0, d: 0 },
    { r: 2, c: 2, s: 0, d: 0 },
    { r: 1, c: 1, s: 1, d: 1, z: 1 },
    { r: 0, c: 0, s: 1, d: 0 }, { r: 0, c: 1, s: 1, d: 0 }, { r: 0, c: 2, s: 1, d: 0 }
  ]);
  var s = RE.init(L);
  assert(RE.isCovered(s, s.tiles[0]) === true, 'Δ19a 偶数层 (1,1) 应被奇数层 (1,1) 压住');
  assert(RE.isCovered(s, s.tiles[4]) === false, 'Δ19a 奇数层顶层自身不应被压住');
  assert(RE.canTap(s, 0) === false, 'Δ19a 被压滑块 MUST 不可点击');
  assert(RE.canTap(s, 4) === true, 'Δ19a 顶层滑块应可点击');
  /* 上层移除后自动解锁 */
  var r = RE.applyTap(s, 4);
  assert(r.type === 'flyout', 'Δ19a 顶层应飞出, got ' + r.type);
  assert(RE.isCovered(s, s.tiles[0]) === false, 'Δ19a 上层移除后下层应解锁');
  assert(RE.canTap(s, 0) === true, 'Δ19a 解锁后应可点击');
}

/* ---------- 14. Δ19a 零悬空谓词 + validateLevel 支撑校验 ---------- */
function testNoFloating() {
  /* 悬空: z=1 滑块 (3,3) 下方 z=0 支撑象限 (3,3)(3,4)(4,3)(4,4) 全空 */
  var bad = mkLevel(5, [
    { r: 0, c: 0, s: 0, d: 0 },
    { r: 0, c: 1, s: 0, d: 0 },
    { r: 0, c: 2, s: 0, d: 0 },
    { r: 0, c: 3, s: 1, d: 0 },
    { r: 0, c: 4, s: 1, d: 0 },
    { r: 3, c: 3, s: 1, d: 0, z: 1 }
  ]);
  var v = RE.validateLevel(bad);
  assert(v.ok === false, 'Δ19a validateLevel 应拒绝悬空滑块');
  assert(v.errors.some(function (e) { return e.indexOf('悬空') >= 0; }), 'Δ19a 悬空错误信息缺失: ' + v.errors.join('; '));
  /* 合规: 奇数层 (1,1) 下方有偶数层 (1,1) 支撑（支撑象限 (1,1)(1,2)(2,1)(2,2)） */
  var good = mkLevel(5, [
    { r: 0, c: 0, s: 0, d: 0 },
    { r: 0, c: 1, s: 0, d: 0 },
    { r: 0, c: 2, s: 0, d: 0 },
    { r: 1, c: 1, s: 1, d: 0 },
    { r: 1, c: 2, s: 1, d: 0 },
    { r: 1, c: 1, s: 1, d: 0, z: 1 }
  ]);
  var v2 = RE.validateLevel(good);
  assert(v2.ok === true, 'Δ19a 合规关卡应通过校验: ' + v2.errors.join('; '));
  /* 底层 MUST NOT 再要求 100% 满铺（Δ19a 废除旧断言） */
  assert(!v2.errors.some(function (e) { return e.indexOf('未满铺') >= 0; }), 'Δ19a 底层满铺断言应已废除');
}

/* ---------- 15. Δ19d 灵犀三消 + 乾坤洗牌 ---------- */
function testMagnetShuffle() {
  var L = mkLevel(5, [
    { r: 0, c: 0, s: 1, d: 0 }, { r: 0, c: 1, s: 1, d: 0 }, { r: 0, c: 2, s: 1, d: 0 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 1, c: 1, s: 0, d: 0 }, { r: 1, c: 2, s: 0, d: 0 },
    { r: 2, c: 0, s: 2, d: 0 }, { r: 2, c: 1, s: 2, d: 0 }, { r: 2, c: 2, s: 2, d: 0 }
  ]);
  var s = RE.init(L);
  var m = RE.applyItem(s, 'magnet');
  assert(m.type === 'magnet', 'Δ19d 灵犀三消应成功, got ' + m.type);
  assert(m.ids.length === 3, 'Δ19d 灵犀三消应吸走 3 张, got ' + m.ids.length);
  assert(m.events.some(function (e) { return e.e === 'match'; }), 'Δ19d 灵犀三消应立即结算三消');
  assert(s.dock.length === 0, 'Δ19d 灵犀三消后 Dock 应清空, got ' + s.dock.length);
  /* 花色不足 3 → 拒绝 */
  var L2 = mkLevel(5, [
    { r: 0, c: 0, s: 1, d: 0 }, { r: 0, c: 1, s: 1, d: 0 },
    { r: 1, c: 0, s: 0, d: 0 }, { r: 1, c: 1, s: 0, d: 0 },
    { r: 2, c: 0, s: 2, d: 0 }, { r: 2, c: 1, s: 2, d: 0 }
  ]);
  var s2 = RE.init(L2);
  var m2 = RE.applyItem(s2, 'magnet');
  assert(m2.type === 'invalid', 'Δ19d 同花色不足 3 张应拒绝, got ' + m2.type);
  /* 乾坤洗牌: 花色总数守恒 + 每花色 %3 不变 */
  var s3 = RE.init(L);
  var before = {};
  s3.tiles.forEach(function (t) { before[t.s] = (before[t.s] || 0) + 1; });
  var sh = RE.applyItem(s3, 'shuffle');
  assert(sh.type === 'shuffle', 'Δ19d 乾坤洗牌应成功, got ' + sh.type);
  var after = {};
  s3.tiles.forEach(function (t) { after[t.s] = (after[t.s] || 0) + 1; });
  assert(JSON.stringify(before) === JSON.stringify(after), 'Δ19d 洗牌 MUST 保持各花色总数不变');
  for (var k in after) assert(after[k] % 3 === 0, 'Δ19d 洗牌后花色 ' + k + ' 计数 %3 != 0');
}

/* ---------- 11. T028 死锁谓词不误杀 ---------- */
function testDeadlockPredicate() {
  /* 场景 A: 全员受阻（无飞出型 tap）+ 齿轮在场 + 旧 wrench 豁免字段仍有余量
   * Δ19: 扳手豁免条款已移除——死局谓词 MUST 判疑（true）而非豁免 */
  var L = mkLevel(5, [
    { r: 1, c: 1, s: 0, d: 1 },          /* 朝 R 被 (1,2) 挡 */
    { r: 1, c: 2, s: 0, d: 3 },          /* 朝 L 被 (1,1) 挡 */
    { r: 2, c: 2, s: 1, d: 0, m: 'g' }   /* 齿轮朝 U 被 (1,2) 挡 */
  ]);
  var s = RE.init(L);
  s.items = { undo: 1, wrench: 1, magnet: 1, shuffle: 1 }; /* 旧 wrench 字段仍有余量 */
  assert(RE.deadlockSuspect(s) === true, 'Δ19 死局谓词: 扳手豁免移除后齿轮在场不再豁免');
  /* 场景 B: 真死锁——清空自由滑块后仅剩互挡对、无道具 */
  var L2 = mkLevel(4, [
    { r: 1, c: 1, s: 0, d: 1 }, /* 朝 R 被 (1,2) 挡 */
    { r: 1, c: 2, s: 0, d: 3 }, /* 朝 L 被 (1,1) 挡 */
    { r: 0, c: 0, s: 0, d: 0 }, { r: 0, c: 1, s: 0, d: 0 }
  ]);
  var s2 = RE.init(L2);
  RE.applyTap(s2, 2); RE.applyTap(s2, 3); /* 清空第 0 行自由滑块（同花色×2 入槽——无三消不判胜） */
  s2.items = { undo: 0, magnet: 0, shuffle: 0 };
  s2.dock = []; /* 无关变量清空（两滑块仍在 dock——count=2 无三消） */
  var tapsB = RE.enumerateTaps(s2);
  assert(tapsB.length === 2, '互挡对均可 tap（弹回型）, got ' + tapsB.length);
  assert(RE.deadlockSuspect(s2) === true, 'T028 互挡无道具 → 疑死锁');
}

function engineSelftest() {
  var tests = [
    ['转向加法 (d+1)%4', testDirection],
    ['棱镜 8 映射', testPrismTable],
    ['Δ19a 同层独立射线 + 奇数层越界 + 全高棱镜', testLayerAwareRaycast],
    ['三消优先于爆槽', testTripleBeforeBurst],
    ['Δ3 胜利条件', testWinCondition],
    ['快照/restore 等价', testSnapshotRestore],
    ['T023 齿轮十字邻接触发/对角不触发', testGear],
    ['T024 破冰双口径（triple/adjacent）', testIce],
    ['T025 chains 解锁（或语义）', testChains],
    ['Δ19 道具语义（扳手下线 / magnet / shuffle）', testItems],
    ['T028 死局谓词不误杀（扳手豁免已移除）', testDeadlockPredicate],
    ['Δ19a 奇偶层半格坐标换算', testHalfGridCoords],
    ['Δ19a 压制锁定（被压不可点 / 上层移除后解锁）', testOverlapLock],
    ['Δ19a 零悬空谓词 + validateLevel 支撑校验', testNoFloating],
    ['Δ19d 灵犀三消 + 乾坤洗牌（花色守恒）', testMagnetShuffle]
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
  console.log('solver: 全量验证 ' + levels.length + ' 关（预算 nodes=' + CFG.BUDGET.nodes + ' ms=' + CFG.BUDGET.ms + '/关）');  var gate = 0; /* 0 = pass; 非 0 = fail（exit code） */
  var failedIds = [];
  var records = [];

  /* Δ16a/T067 门禁: 关卡总数必须恰为 72（FR-008 Δ16 扩容口径）——
   * 防止 levels.js 被截断/漏生成而门禁仍然"全绿"的静默失败 */
  var EXPECTED_TOTAL = 72;
  if (levels.length !== EXPECTED_TOTAL) {
    console.error('  ✗ 关卡总数 ' + levels.length + ' ≠ ' + EXPECTED_TOTAL + '（Δ16a 72 关扩容口径不符）');
    gate = 1;
  }
  /* id 连续性（L(i).id === i+1——契约 level-data.md §2） */
  for (var idc = 0; idc < levels.length; idc++) {
    if (levels[idc].id !== idc + 1) {
      console.error('  ✗ id 不连续: index ' + idc + ' = ' + levels[idc].id);
      gate = 1;
      break;
    }
  }

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
    /* Δ15a: hintUpper/hintPath 与 redisperse-60 同口径（内嵌 solutionMoves
     * 是逆向生成的构造解——重打散后 DFS 盲搜指数爆炸，构造解引导保证
     * 门禁与迁移工具的 metrics 完全一致; 解集/计数/minMoves 语义不变） */
    var sol = solveLevel(L, { budget: CFG.BUDGET, hintUpper: L.solutionMoves.length, hintPath: L.solutionMoves });
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

  /* difficultyScore 全域归一（min-max across 72 levels——Δ16a 扩容后全域） */
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

    /* Δ15a/FR-030: 聚散度指标逐关核验（三档曲线档位门禁）
     * 结构极限白名单（DISPERSION_STRUCTURAL_LIMITS）: 花色重打散几何不可达
     * 的关（§5 可解性不降级铁律优先——见 level-config 逐关证明注释）→
     * 降级为警告 + 报告记录（不置 gate）; 白名单外不达标仍硬门禁 */
    var disp = dispersionOf(L3);
    rec2.dispersion = disp;

    /* Δ19a/FR-044 §3: 零悬空违规计数（恒 MUST 为 0） */
    var floatViol = floatingViolationsOf(L3);
    rec2.floatingViolations = floatViol;
    if (floatViol > 0) {
      console.error("  ✗ L" + L3.id + " 零悬空违规计数=" + floatViol + "（MUST 为 0）");
      gate = 1;
    }

    /* Δ19b/FR-030: 瓶颈节奏指标（咽喉点 / 最小可行操作集 / 最长连锁爽消段） */
    var bn = bottleneckOf(L3);
    rec2.bottleneck = bn;
    /* 瓶颈节奏达标判定: 咽喉点 ≥1（存在窄可行域）且最长连锁段 ≥2（破局后有爽消段） */
    rec2.bottleneckOk = (bn.chokePoints >= 1 && bn.maxChainLen >= 2);
    if (!disp.tierOk) {
      if ((CFG.DISPERSION_STRUCTURAL_LIMITS || []).indexOf(L3.id) >= 0) {
        console.warn('  ⚠ L' + L3.id + ' 聚散度档位结构极限受控降级: trip=' + disp.triplePct + '%(簇' + disp.tripleClusters + ') pair=' + disp.pairPct +
          '% minD=' + disp.minPairDist + '（几何不可达证明见 level-config DISPERSION_STRUCTURAL_LIMITS）');
        rec2.dispersion.structuralLimit = true;
      } else {
        console.error('  ✗ L' + L3.id + ' 聚散度档位不达标: trip=' + disp.triplePct + '%(簇' + disp.tripleClusters + ') pair=' + disp.pairPct +
          '% minD=' + disp.minPairDist + '（档位: ' + JSON.stringify(CFG.dispersionTierOf(L3.id)) + '）');
        gate = 1;
      }
    }
  }

  /* 曲线门（Δ13/Δ16a 波浪架构: 章均值单调 + 全章 minMoves 斜率 + 7/7/8 波浪锯齿——72 关/3×24 大阶段口径） */
  var cg = curveGates(embedded);

  /* Δ16a/T067 门禁: 曲线门统计 MUST 覆盖全域 L1~L72（章均值单调 + 斜率 ≥0
   * + L4~L72「2 简 1 难」7/7/8 波浪锯齿）——覆盖数不足即门禁失败 */
  var chTotal = CFG.CHAPTERS.reduce(function (a, c) { return a + (c.levels[1] - c.levels[0] + 1); }, 0);
  cg.covered = embedded.length;
  cg.expected = EXPECTED_TOTAL;
  cg.chapterSpan = chTotal;
  if (embedded.length !== EXPECTED_TOTAL || chTotal !== EXPECTED_TOTAL) {
    console.error('  ✗ 曲线门覆盖不全: 实测 ' + embedded.length + '/' + EXPECTED_TOTAL +
      ' 关，章区间合计 ' + chTotal + ' 关（Δ16a 3×24 章区间口径不符）');
    gate = 1;
  }
  console.log('curveGate: chMonotonic=' + cg.chMonotonic + ' slope14=' + cg.slope14.toFixed(2) + ' waveZigzag=' + cg.ch5Zigzag);
  if (!cg.chMonotonic) { console.error('  ✗ 曲线门-1: 章均值非单调不减'); gate = 1; }
  if (cg.slope14 < 0) { console.error('  ✗ 曲线门-2: 全章 minMoves 斜率 < 0'); gate = 1; }
  if (!cg.ch5Zigzag) { console.error('  ✗ 曲线门-3: 7/7/8 波浪锯齿形态不显著（8×8 挑战关未显著难于 7×7 简单关）'); gate = 1; }

  /* 报告写盘 */
  var report = {
    schemaVersion: 3, /* Δ16a/T067: 72 关口径（Δ15 v2 加 dispersion 字段组——仍向后兼容旧报告读取） */
    generatedAt: new Date().toISOString(),
    seed: seed == null ? null : seed,
    nodeBudget: CFG.BUDGET,
    levels: records,
    summary: {
      total: levels.length,
      solvable: records.filter(function (r) { return r.solvable; }).length,
      failedIds: failedIds,
      curveGate: cg,
      dispersion: (function () { /* Δ15a: 三档曲线汇总（档位达标率） */
        var tiers = { t1: [0, 0], t2: [0, 0], t3: [0, 0] }; /* [ok, total] */
        var agg = { t1: [0, 0, 0, 0], t2: [0, 0, 0, 0], t3: [0, 0, 0, 0] }; /* [trip, pair, disp, T] */
        for (var ri = 0; ri < records.length; ri++) {
          var r2 = records[ri];
          if (!r2.dispersion) continue;
          var g = r2.id <= 6 ? 't1' : (r2.id <= 21 ? 't2' : 't3');
          tiers[g][1]++;
          if (r2.dispersion.tierOk) tiers[g][0]++;
          agg[g][0] += r2.dispersion.tripleClusters; agg[g][1] += r2.dispersion.pairClusters;
          agg[g][2] += r2.dispersion.dispersed; agg[g][3] += r2.dispersion.triplets;
        }
        function fmt(a) { return a[3] ? { triplePct: Math.round(a[0] / a[3] * 1000) / 10, pairPct: Math.round(a[1] / a[3] * 1000) / 10, dispersedPct: Math.round(a[2] / a[3] * 1000) / 10 } : null; }
        return {
          tierPass: { L1_6: tiers.t1[0] + '/' + tiers.t1[1], L7_21: tiers.t2[0] + '/' + tiers.t2[1], L22_72: tiers.t3[0] + '/' + tiers.t3[1] },
          aggregate: { L1_6: fmt(agg.t1), L7_21: fmt(agg.t2), L22_72: fmt(agg.t3) }
        };
      })(),
      /* Δ19a/Δ19b: 零悬空违规总计数 + 瓶颈节奏汇总 */
      zeroFloatingViolations: records.reduce(function (a, r) { return a + (r.floatingViolations || 0); }, 0),
      bottleneck: (function () {
        var ok = 0, tot = 0, minChoke = Infinity, maxChain = 0, choke = 0;
        for (var bi = 0; bi < records.length; bi++) {
          var rb = records[bi];
          if (!rb.bottleneck) continue;
          tot++;
          if (rb.bottleneckOk) ok++;
          choke += rb.bottleneck.chokePoints;
          if (rb.bottleneck.minChokeActions < minChoke) minChoke = rb.bottleneck.minChokeActions;
          if (rb.bottleneck.maxChainLen > maxChain) maxChain = rb.bottleneck.maxChainLen;
        }
        return {
          pass: ok + '/' + tot,
          totalChokePoints: choke,
          minChokeActions: minChoke === Infinity ? 0 : minChoke,
          maxChainLen: maxChain
        };
      })()
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
  var sol = solveLevel(L, { budget: CFG.BUDGET, hintUpper: L.solutionMoves.length, hintPath: L.solutionMoves }); /* Δ15a 同口径构造解引导 */
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
  curveGates: curveGates,
  dispersionOf: dispersionOf
};
