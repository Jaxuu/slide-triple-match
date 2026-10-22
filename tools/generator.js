#!/usr/bin/env node
/* =========================================================
 * Slide & Triple — Generator（逆向关卡生成器，D-10）
 * Node ≥18 离线工具（CommonJS，零 npm 依赖——宪章 II）
 * 前端永不引用本文件
 *
 * Δ19b/FR-045 v2 布局生成策略（掩码成型 + 单线咽喉点瓶颈节奏）:
 *   1. **掩码成型**——每关底层与上层 MUST 按 FR-045 的 36 套模板之一成型
 *      （MUST NOT 回退正方形满铺）；模板 id 落库于关卡 cfg
 *   2. **槽位表**——由 ShapeMasks.buildLayers 产出逐层落位（零悬空已内建）
 *   3. **正向剥洋葱模拟**——用 RulesEngine 逐次移除「未被压住 + 同层射线畅通」
 *      的滑块，得到可解的移除序（= 构造解）
 *   4. **瓶颈卡点算法**——按「窄可行域咽喉点 → 解锁破局 → 连锁爽消 → 下一咽喉点」
 *      节奏驱动移除序的选择：咽喉点处合法可行操作集收窄至极少的「单线咽喉点」
 *      （咽喉点 MUST 由**层叠压制关系**构造而非同花色聚集——FR-029 §8）
 *   5. **花色分配 + 空间打散**——按移除序三元组分组，同花色三连簇恒为 0%
 *      （挑战期），邻接判定按**渲染实坐标**度量（FR-029 §7）
 *   6. **机制镜像**——gear（旋转补偿）/ ice（破冰时序）/ chain（钥匙先于锁）
 *   7. **三重验证**（逆向构造→正向自检→Solver 门禁，D-10）→ 失败回炉
 *
 * CLI: node tools/generator.js [--chapters 1,2,3] [--seed S] [--out src/data/levels.js] [--dry-run]
 * ========================================================= */
'use strict';

var path = require('path');
var RE = require(path.join(__dirname, '..', 'src', 'core', 'RulesEngine.js'));
var CFG = require(path.join(__dirname, 'level-config.js'));
var SOLVER = require(path.join(__dirname, 'solver.js'));

/* =========================================================
 * D-08 种子化 PRNG（xorshift128——与 solver.js 同实现）
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

function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(rng, arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function ringOf(r, c, n) {
  return Math.min(r, c, n - 1 - r, n - 1 - c);
}

/* =========================================================
 * Δ19b: 棱镜布置（贯穿全层——须避开所有层的瓦片）
 *   棱镜占偶数层 (r,c) 一格 + 奇数层 (r-1,c-1)(r-1,c)(r,c-1)(r,c) 四格
 *   故候选格 MUST 在**所有层**皆为空
 * ========================================================= */
function planPrisms(params, shape, rng) {
  var n = params.n;
  var prisms = [];
  if (!params.prismCount || params.prismCount <= 0) return prisms;

  /* 各层占用表（按「偶数层坐标 (r,c)」归一——奇数层瓦块按其压角 2×2 展开） */
  var occupied = {};
  shape.layers.forEach(function (L) {
    L.cells.forEach(function (cell) {
      if ((L.z % 2) === 0) {
        occupied[cell.r + ':' + cell.c] = true;
      } else {
        /* 奇数层 (r,c) 压住偶数层 (r,c)(r,c+1)(r+1,c)(r+1,c+1) */
        [[cell.r, cell.c], [cell.r, cell.c + 1], [cell.r + 1, cell.c], [cell.r + 1, cell.c + 1]]
          .forEach(function (p) {
            if (p[0] < n && p[1] < n) occupied[p[0] + ':' + p[1]] = true;
          });
      }
    });
  });

  var candidates = [];
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (occupied[r + ':' + c]) continue;
      /* 避免边缘一圈与角（对射高风险区） */
      if (r < 1 || c < 1 || r >= n - 1 || c >= n - 1) continue;
      candidates.push({ r: r, c: c });
    }
  }
  shuffle(rng, candidates);
  var used = {};
  for (var i = 0; i < candidates.length && prisms.length < params.prismCount; i++) {
    var p = candidates[i];
    var k = p.r + ':' + p.c;
    if (used[k]) continue;
    /* 对射拒绝（FR-022 预检）: 不与已放棱镜同行/同列/同斜线 */
    var conflict = false;
    for (var j = 0; j < prisms.length; j++) {
      var q = prisms[j];
      if (q.r === p.r || q.c === p.c || Math.abs(q.r - p.r) === Math.abs(q.c - p.c)) {
        conflict = true; break;
      }
    }
    if (conflict) continue;
    used[k] = true;
    prisms.push({ r: p.r, c: p.c, t: rng() < 0.5 ? '/' : '\\' });
  }
  return prisms;
}

/* =========================================================
 * Δ19b: 槽位表——由掩码逐层落位展开为瓦片槽位
 *   棱镜占位从对应层的槽位中剔除（棱镜格不可放滑块）
 * ========================================================= */
function buildSlots(shape, prisms) {
  var prismSet = {};
  prisms.forEach(function (p) { prismSet[p.r + ':' + p.c] = true; });
  var slots = [];
  shape.layers.forEach(function (L) {
    L.cells.forEach(function (cell) {
      if ((L.z % 2) === 0) {
        if (prismSet[cell.r + ':' + cell.c]) return;
      } else {
        /* 奇数层槽位与棱镜冲突判据：其压角 2×2 内含棱镜格即冲突 */
        var hit = [[cell.r, cell.c], [cell.r, cell.c + 1], [cell.r + 1, cell.c], [cell.r + 1, cell.c + 1]]
          .some(function (p) { return prismSet[p[0] + ':' + p[1]]; });
        if (hit) return;
      }
      slots.push({ r: cell.r, c: cell.c, z: L.z });
    });
  });
  return slots;
}

/* =========================================================
 * Δ19a: 覆盖关系分析（压制锁定的静态视图）
 *   cover[tileId] = 压住该瓦片的上层瓦块 id 列表（可为空）
 *   与 RulesEngine.isCovered 严格同形（crossPositions 口径）
 * ========================================================= */
function coverageMap(state) {
  var cover = {};
  var live = [];
  for (var i = 0; i < state.tiles.length; i++) {
    if (!state.tiles[i].removed) live.push(state.tiles[i]);
  }
  for (var j = 0; j < live.length; j++) {
    var t = live[j];
    var list = [];
    var up = (t.z || 0) + 1;
    if (RE.layerSize(state.n, up) > 0) {
      var pos = RE.crossPositions(t.r, t.c, t.z || 0);
      for (var p = 0; p < pos.length; p++) {
        var cell = RE.cellAt(state, up, pos[p][0], pos[p][1]);
        if (!cell || cell.prism || !cell.length) continue;
        for (var k = 0; k < cell.length; k++) {
          if (!cell[k].removed) list.push(cell[k].id);
        }
      }
    }
    cover[t.id] = list;
  }
  return cover;
}

/* 只被 g 压住的瓦片（移除 g 后即解锁） */
function exclusiveTargets(cover, gId) {
  var out = [];
  for (var id in cover) {
    if (cover[id].length === 1 && cover[id][0] === gId) out.push(parseInt(id, 10));
  }
  return out;
}

/* =========================================================
 * Δ19b/FR-045 §3: 正向剥洋葱模拟 + 单线咽喉点瓶颈节奏
 *
 * 算法（构造阶段，不依赖具体花色——花色在槽位序确定后分配）:
 *   1. 按掩码槽位铺一层「占位瓦片」（花色/方向暂缺），建引擎态
 *   2. 反复: 找出当前**可动**瓦片（未被压住 + 同层射线畅通 + 非冰封/锁链）
 *      —— 可动集即「合法可行操作集」
 *   3. **咽喉点收窄**: 若可动集 > 阈值(THROATLE_MAX)，则优先移除那些
 *      「移除后能解锁更多瓦片」的关键牌（层叠压制关系驱动），
 *      并刻意**保留**少量可动牌作为下一咽喉点的「唯一解路径」
 *   4. **连锁爽消段**: 咽喉点破局后，释放一段连续移除（可动集放大）
 *   5. 记录移除序 = 构造解
 *
 * 咽喉点统计（FR-011 Δ19 增补 / FR-030 报告口径）:
 *   咽喉点数 = 可动集 ≤3 的位置数
 *   最小咽喉点可行操作集大小
 *   最长连锁爽消段长度
 * ========================================================= */
var THROATLE_MAX = 3;      /* 咽喉点判据: 可动集 ≤ 此值 */
var CHAIN_MIN = 4;         /* 连锁爽消段最小长度 */
/* 批次内三块的最小渲染实距（曼哈顿）——逐级放宽。
 * 1.05 = 聚散度「不相邻」判据下界（≤1.05 即连坐）; 2.0 = FR-029 末档要求
 * 「三元组两两最小曼哈顿 ≥2」; 3.0 = 8×8 难关优先档。 */
var SEP_CANDIDATES = [2.0, 1.5, 1.05];

/* 判定某瓦块当前是否「可动」（未被压住 + 同层射线畅通） */
function movableIds(state) {
  var out = [];
  for (var i = 0; i < state.tiles.length; i++) {
    var t = state.tiles[i];
    if (t.removed) continue;
    if (t.ice > 0 || t.locked) continue;
    if (RE.isCovered(state, t)) continue;
    if (!RE.isTopOfStack(state, t)) continue;
    out.push(t.id);
  }
  return out;
}

/* 移除某瓦块并更新引擎态（试算用——不产生事件） */
function peelOne(state, tileId) {
  var t = state.tiles[tileId];
  t.removed = true;
  var lb = RE.layerBoard(state, t.z || 0);
  var cell = lb[t.r] && lb[t.r][t.c];
  if (cell && cell.length) {
    var idx = -1;
    for (var i = 0; i < cell.length; i++) if (cell[i] === t) { idx = i; break; }
    if (idx >= 0) cell.splice(idx, 1);
    if (!cell.length) lb[t.r][t.c] = null;
  }
}

/* 为某瓦块挑选一个**同层射线畅通**的方向（构造期方向求解）
 *   返回方向 d；若无任何畅通方向返回 -1（该瓦块被同层同伴永久阻挡） */
function pickFreeDir(state, tile) {
  var order = [0, 1, 2, 3];
  for (var i = 0; i < order.length; i++) {
    var d = order[i];
    var ray = RE.castRay(state, tile.r, tile.c, d, tile.z || 0);
    if (ray.free) return d;
  }
  return -1;
}

/* 剥洋葱模拟 —— 产出移除序 + 每块方向 + 瓶颈节奏指标
 *   方向在**剥除当下**求解（当时同层前方已被清空 → 方向必然畅通），
 *   保证构造解可原样回放（与 FR-032 口径一致）。
 *   返回 { order: [slotId...], dirs: {slotId: d}, metrics: {...} } */
function peelOrder(slots, prisms, n, params, rng) {
  /* 构造占位关卡（花色 0、方向 0——仅用于几何模拟） */
  var probeTiles = slots.map(function (s) {
    return { r: s.r, c: s.c, s: 0, d: 0, z: s.z };
  });
  var probe = {
    id: params.id, chapter: params.chapter, name: 'probe', n: n,
    tiles: probeTiles, prisms: prisms,
    cfg: { lives: 3, damageOnBlock: false, items: { undo: 1, magnet: 1, shuffle: 1 }, iceMode: 'triple', chains: [], scoring: { comboBase: 10, comboStep: 5 } },
    metrics: null, solutionMoves: []
  };
  var state = RE.init(probe);

  var order = [];
  var dirs = {};
  var batchSizes = [];
  var chokePoints = 0, minChoke = Infinity, maxChain = 0, chain = 0;

  /* 批次形态规划（Δ19a/FR-029 §2~§4 空间打散档位）:
     花色按**移除序连续 3 块**成组（FR-005 即时三消 + FR-029 聚散度口径），
     故 MUST 保证 order 中连续 3 块 = 一个批次 —— **批次几何即三元组几何**。
     两种形态:
       · pair  批 = 恰 1 对连坐（第 3 块与前两块皆远离 ≥2.0）
       · spread 批 = 0 对连坐（三块两两远离，优先 ≥2.0）
     三连簇（≥2 对连坐）在两种形态下皆不可构造 → 天然满足「挑战期恒 0%」。 */
  var totalBatches = Math.floor(slots.length / 3);
  var pairTarget = CFG.dispersionPairTarget(params.id);
  var desiredPairs = Math.round(pairTarget * totalBatches);
  var tierOf = CFG.dispersionTierOf(params.id);
  var preferredSep = Math.max(1.05, tierOf.minPairMin || 2);
  var pairsDone = 0, tripsDone = 0;

  /* 渲染实距（Δ19a/FR-029 §7 半格错位口径）*/
  function renderOf(slotId) {
    var s = slots[slotId];
    return RE.renderPos(s.r, s.c, s.z || 0);
  }
  function distOf(a, b) {
    var pa = renderOf(a), pb = renderOf(b);
    return Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c);
  }
  /* 批次实际连坐对数（0 / 1 / ≥2）*/
  function pairCountOf(tri) {
    var c = 0;
    for (var i = 0; i < 3; i++) {
      for (var j = i + 1; j < 3; j++) {
        var d = distOf(tri[i], tri[j]);
        if (d === 0) d = 1;
        if (d <= 1.05) c++;
      }
    }
    return c;
  }
  /* 可移除集（含同层射线畅通判据）*/
  function removableIds() {
    var cur = movableIds(state);
    var rem = [];
    for (var mi = 0; mi < cur.length; mi++) {
      if (pickFreeDir(state, state.tiles[cur[mi]]) >= 0) rem.push(cur[mi]);
    }
    return rem;
  }
  /* 搜索期临时移除（可回滚）*/
  function pushRemove(id) {
    var t = state.tiles[id];
    var lb = RE.layerBoard(state, t.z || 0);
    var cell = lb[t.r][t.c];
    var idx = cell.indexOf(t);
    var multi = cell.length > 1;
    t.removed = true;
    if (multi) cell.splice(idx, 1); else lb[t.r][t.c] = null;
    return { t: t, lb: lb, r: t.r, c: t.c, idx: idx, multi: multi };
  }
  function popRemove(rec) {
    var cell = rec.lb[rec.r][rec.c];
    if (!cell) { cell = []; rec.lb[rec.r][rec.c] = cell; }
    cell.splice(rec.idx, 0, rec.t);
    rec.t.removed = false;
  }
  /* 构造三元组（穷举 + 增量移除 + 回溯）:
     增量移除保证「移除前块后才可动」的块也能被选入（贪心法会漏）;
     回溯保证「存在即找得到」。 */
  function findTriple(wantPair, sep) {
    var unlockCache = {};
    function unlockOf(id) {
      if (unlockCache[id] == null) unlockCache[id] = exclusiveTargets(cover, id).length;
      return unlockCache[id];
    }
    function byUnlock(a, b) { return unlockOf(b) - unlockOf(a); }
    var S0 = removableIds().sort(byUnlock);
    for (var ia = 0; ia < S0.length; ia++) {
      var a = S0[ia];
      var recA = pushRemove(a);
      var S1 = removableIds().sort(byUnlock);
      for (var ib = 0; ib < S1.length; ib++) {
        var b = S1[ib];
        var dab = distOf(a, b);
        if (dab === 0) dab = 1;
        var okAB = wantPair ? (dab <= 1.05) : (dab > 1.05 && dab >= sep);
        if (!okAB) continue;
        var recB = pushRemove(b);
        var S2 = removableIds().sort(byUnlock);
        var found = null;
        for (var ic = 0; ic < S2.length; ic++) {
          var c = S2[ic];
          var tri = [a, b, c];
          var pc = pairCountOf(tri);
          if (wantPair) {
            if (pc !== 1) continue;          /* 恰 1 对连坐 */
            var dac = distOf(a, c); if (dac === 0) dac = 1;
            var dbc = distOf(b, c); if (dbc === 0) dbc = 1;
            if (dac < sep || dbc < sep) continue;  /* 第 3 块与两者皆远离 */
          } else {
            if (pc !== 0) continue;          /* 0 对连坐 */
          }
          found = tri;
          break;
        }
        popRemove(recB);
        if (found) { popRemove(recA); return found; }
      }
      popRemove(recA);
    }
    return null;
  }
  /* 形态构造（含逐级放宽的间距）*/
  function tryBuild(wantPair) {
    if (wantPair) {
      var sepList = [Math.max(2.0, preferredSep), 1.5];
      for (var pi = 0; pi < sepList.length; pi++) {
        var pr = findTriple(true, sepList[pi]);
        if (pr) return pr;
      }
      return null;
    }
    var seps = [preferredSep, Math.max(1.5, preferredSep - 0.5), 1.05];
    for (var si = 0; si < seps.length; si++) {
      var res = findTriple(false, seps[si]);
      if (res) return res;
    }
    return null;
  }
  /* 放宽构造: 允许「至多 1 对连坐」——
     用于 spread 形态不可达时的降级（连坐对数仍 ≤1，不产生三连簇）*/
  function tryBuildRelaxed(wantPair) {
    if (wantPair) return null;
    var res = findTriple(false, 1.05);
    if (res && pairCountOf(res) <= 1) return res;
    return null;
  }
  /* 末局兜底: 枚举可移除三元组，取连坐对数最少者（0 优先，其次 1）
     —— 避免「可移除块不足 / 形态不可达」直接判死锁
     三连簇铁律（FR-029 §4 挑战期恒 0%）: 档位允许 0 组时 MUST NOT 采用
     连坐对数 ≥2 的组合；档位允许少量时亦受档位上限约束。 */
  function tripAllowance() {
    if (tierOf.tripMaxPerLevel != null) return tierOf.tripMaxPerLevel - tripsDone;
    if (tierOf.tripMax > 0) {
      var pct = tripsDone / Math.max(1, totalBatches);
      return pct + 1 <= tierOf.tripMax ? 1 : 0;
    }
    return 0;
  }
  function tripAllowed() { return tripAllowance() > 0; }
  function buildBestEffort() {
    var cur = movableIds(state);
    var removable = [];
    for (var mi = 0; mi < cur.length; mi++) {
      if (pickFreeDir(state, state.tiles[cur[mi]]) >= 0) removable.push(cur[mi]);
    }
    if (removable.length < 3) return null;
    var allowTrip = tripAllowance() > 0;
    var best = null, bestScore = Infinity;
    for (var a = 0; a < removable.length; a++) {
      for (var b = a + 1; b < removable.length; b++) {
        for (var c = b + 1; c < removable.length; c++) {
          var tri = [removable[a], removable[b], removable[c]];
          var pc = pairCountOf(tri);
          if (pc >= 2 && !allowTrip) continue;   /* 三连簇铁律 */
          var sc = pc * 10;
          /* 同等连坐数时取「解锁最多」者（层叠压制关系）*/
          sc -= (exclusiveTargets(cover, tri[0]).length +
                 exclusiveTargets(cover, tri[1]).length +
                 exclusiveTargets(cover, tri[2]).length);
          if (sc < bestScore) { bestScore = sc; best = tri; }
        }
      }
    }
    return best;
  }

  for (;;) {
    var orderStart = order.length;
    var live = 0;
    for (var i = 0; i < state.tiles.length; i++) if (!state.tiles[i].removed) live++;
    if (!live) break;

    var movable = movableIds(state);
    if (!movable.length) {
      /* 无可动块——剩余瓦块形成几何死锁（构造失败）→ 本候选作废 */
      return { order: null, dirs: dirs, metrics: null, deadlocked: true };
    }

    /* 咽喉点判定（可动集收窄至极少 = 窄可行域） */
    if (movable.length <= THROATLE_MAX) {
      chokePoints++;
      if (movable.length < minChoke) minChoke = movable.length;
      chain = 0;
    } else {
      chain++;
      if (chain > maxChain) maxChain = chain;
    }

    /* 形态选取（Δ19a/FR-029 §2~§4）:
       · pair 批预算 = desiredPairs（= 档位目标占比 × 批次总数），
         优先在**早期**消耗（可移除集大、邻接对丰富）——末局几何受限易失败;
       · 预算耗尽后全用 spread 批。
       最终 pair% = desiredPairs / totalBatches = 档位目标占比（精确命中）。 */
    var cover = coverageMap(state);
    var batchIdx = batchSizes.length;
    var wantPair = pairsDone < desiredPairs;
    var tri = tryBuild(wantPair);
    if (!tri) tri = tryBuild(!wantPair);
    if (!tri) tri = tryBuildRelaxed(wantPair);
    if (!tri) tri = tryBuildRelaxed(!wantPair);
    if (!tri) tri = buildBestEffort();
    if (!tri) {
      /* 无可移除三元组 → 几何死锁 → 本候选作废 */
      return { order: null, dirs: dirs, metrics: null, deadlocked: true };
    }
    /* 记账: 批次实际连坐对数 */
    var pc = pairCountOf(tri);
    if (pc >= 2) tripsDone++;
    else if (pc === 1) pairsDone++;

    /* 移除整批 */
    for (var ri2 = 0; ri2 < tri.length; ri2++) {
      var cid3 = tri[ri2];
      if (state.tiles[cid3].removed) continue;
      var d3 = pickFreeDir(state, state.tiles[cid3]);
      if (d3 < 0) continue;
      dirs[cid3] = d3;
      peelOne(state, cid3);
      order.push(cid3);
    }
    batchSizes.push(order.length - orderStart);
    if (batchSizes[batchSizes.length - 1] !== 3) {
      /* 批次未凑满 3 块 → 移除序与三元组错位 → 本候选作废 */
      return { order: null, dirs: dirs, metrics: null, deadlocked: true };
    }
  }

  if (minChoke === Infinity) minChoke = 0;
  return {
    order: order,
    dirs: dirs,
    batchSizes: batchSizes,
    metrics: { chokePoints: chokePoints, minChokeActions: minChoke, maxChainLen: maxChain }
  };
}

/* =========================================================
 * Δ19a/FR-029 §7: 空间打散 —— 按**渲染实坐标**度量邻接
 *   两滑块曼哈顿距离 < 1（半格错位下的紧挨）亦构成连坐；
 *   跨层同渲染位（奇数层压在偶数层四格交界中心）视为空间相邻
 *   邻接判据: |Δrr| + |Δcc| < 1.05（实坐标） 或 同渲染位（距离 < 0.75）
 * ========================================================= */
function realPos(r, c, z) { return RE.renderPos(r, c, z); }

function adjacencyScore(a, b) {
  var pa = realPos(a.r, a.c, a.z || 0);
  var pb = realPos(b.r, b.c, b.z || 0);
  var d = Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c);
  if (d < 1.05) return 2;        /* 半格紧挨 → 连坐 */
  if (d < 1.5) return 1;         /* 邻近（非连坐） */
  return 0;
}

/* =========================================================
 * Δ19b/FR-029 §8: 花色分配 —— 与瓶颈节奏耦合
 *   约束: ① 每花色总数恒为 3 的倍数
 *         ② 同花色三连簇在挑战期恒为 0%（FR-029 §4）
 *         ③ 咽喉点处同花色聚集 MUST 保持连坐上限之内
 *   手法: 先按移除序分三元组，再做**空间打散置换**——
 *         在保持每组三元组同花色的前提下，把同花色的三块尽量分散到
 *         渲染实坐标彼此远离的槽位（最小化连坐/三连簇）
 * ========================================================= */
function assignSuitsV2(order, slots, suitsN, params, rng) {
  var groups = Math.floor(order.length / 3);
  if (groups * 3 !== order.length) return null;
  if (suitsN < 1) return null;

  /* ① 组 → 花色分配
     铁律: 每花色总块数恒为 3 的倍数 → 每花色**组数**必为整数倍。
     做法: 组数 G、目标花色数 K → 每花色 floor(G/K) 组，余数补给前几色。
     为保证每花色组数为 3 的倍数（总数 %3==0），将每色组数向下取到 3 的倍数，
     余下组数并入**首花色**（首花色组数 = G - (K-1)*per3，仍为 3 的倍数）。
     当 G < 3*K 时，退化为「每色 3 组」→ K 需 ≤ floor(G/3)（否则花色数下调）。 */
  var groupSuit = [];
  var per3 = Math.floor(groups / suitsN / 3) * 3;
  if (per3 < 3) per3 = 3;
  if (per3 * suitsN > groups) {
    /* G 不足以让每色各 3 组 → 削减花色数（保持每色 ≥3 组 = ≥9 块） */
    suitsN = Math.max(1, Math.floor(groups / 3));
    per3 = Math.floor(groups / suitsN / 3) * 3;
    if (per3 < 3) per3 = 3;
  }
  /* 余数组**均匀分摊**到各色（而非全部压给首色）——
   * 避免首色组数畸高（同色 48 块挤在少数区域 → 空间打散不可达）。
   * 每色组数 = per3 + (前 rem 色各 +1)；per3 为 3 的倍数，+1 后总数
   * 仍须 %3==0 → 故 rem 组也按 3 块一组合并：把余数按 3 打包分给各色。 */
  var remGroups = groups - per3 * suitsN;
  var extraPer = Math.floor(remGroups / 3);
  for (var s2 = 0; s2 < suitsN; s2++) {
    var c2 = per3 + (s2 < extraPer ? 3 : 0);
    for (var k2 = 0; k2 < c2; k2++) groupSuit.push(s2);
  }
  /* 剩余不足 3 组的零头 → 并入首色（首色总数仍 %3==0：3 的倍数 + 3 的倍数） */
  var leftover = groups - groupSuit.length;
  if (leftover > 0) {
    /* leftover 必为 3 的倍数（groups 与各色 3 倍数之差）→ 全部并入首色 */
    for (var lo = 0; lo < leftover; lo++) groupSuit.unshift(0);
  }
  if (groupSuit.length !== groups) return null;
  /* ② 槽位 → 花色初值（按移除序三元组）
     order[i] = 槽位下标；suitOfSlot 以**槽位下标**为键 */
  var suitOfSlot = new Array(slots.length);
  for (var oi = 0; oi < order.length; oi++) {
    suitOfSlot[order[oi]] = groupSuit[Math.floor(oi / 3)];
  }

  /* ③ 空间打散优化器（Δ19a/FR-029 §7 渲染实坐标口径）
     建模: **三元组** = 某花色在其移除序中连续的 3 块（FR-005 同口径）。
     目标: 三连簇（组内 ≥2 对相邻）→ 0；双连坐（恰 1 对）占比落入档位带。
     算子: 交换两槽位的花色标签（同色桶内 = 换落位；跨桶 = 换色）。
     增量代价: 仅重算受影响的三元组（O(1) 级）——全量重算 O(n²) 过慢。
     退火: 允许同档内小幅变差以跳出局部极小（**MUST NOT 接受三连簇增加**）。
     重启: 多次随机扰动重启，保留历史最优。 */
  var groupOf = new Array(suitOfSlot.length);
  for (var gi2 = 0; gi2 < order.length; gi2++) groupOf[order[gi2]] = Math.floor(gi2 / 3);

  /* 每花色的槽位列表（按移除序）*/
  function suitLists(sm) {
    var lists = {};
    for (var i2 = 0; i2 < sm.length; i2++) {
      if (sm[i2] == null) continue;
      (lists[sm[i2]] = lists[sm[i2]] || []).push(i2);
    }
    for (var k2 in lists) lists[k2].sort(function (a, b) { return rankOf[a] - rankOf[b]; });
    return lists;
  }
  /* 槽位 → 移除序排名（花色列表须按移除序排序——三元组即连续 3 块）*/
  var rankOf = new Array(suitOfSlot.length);
  for (var ri = 0; ri < order.length; ri++) rankOf[order[ri]] = ri;

  /* 三元组代价: 三连簇 1000 / 双连坐 1 */
  /* 同色三块的距离和（轻微惩罚——避免过度拉开导致槽压升高）*/
  function spreadCost(tri) {
    if (!tri || tri.length < 2) return 0;
    var sum = 0;
    for (var a3 = 0; a3 < tri.length; a3++) {
      for (var b3 = a3 + 1; b3 < tri.length; b3++) {
        var pa3 = RE.renderPos(slots[tri[a3]].r, slots[tri[a3]].c, slots[tri[a3]].z || 0);
        var pb3 = RE.renderPos(slots[tri[b3]].r, slots[tri[b3]].c, slots[tri[b3]].z || 0);
        sum += Math.abs(pa3.r - pb3.r) + Math.abs(pa3.c - pb3.c);
      }
    }
    return sum * 0.02;
  }
  function tripletCost(tri) {
    if (!tri || tri.length < 2) return 0;
    var adj = 0;
    for (var a2 = 0; a2 < tri.length; a2++) {
      for (var b2 = a2 + 1; b2 < tri.length; b2++) {
        if (adjacencyScore(slots[tri[a2]], slots[tri[b2]]) >= 2) adj++;
      }
    }
    /* 距离项: 组内最近两块的曼哈顿实距——<2 时额外惩罚
     * （距离 1 = 连坐；1.5~2 = 视觉仍偏近，pairMax ≤15% 档位须压低）*/
    var minD = 99;
    for (var a4 = 0; a4 < tri.length; a4++) {
      for (var b4 = a4 + 1; b4 < tri.length; b4++) {
        var pa4 = RE.renderPos(slots[tri[a4]].r, slots[tri[a4]].c, slots[tri[a4]].z || 0);
        var pb4 = RE.renderPos(slots[tri[b4]].r, slots[tri[b4]].c, slots[tri[b4]].z || 0);
        var dd4 = Math.abs(pa4.r - pb4.r) + Math.abs(pa4.c - pb4.c);
        if (dd4 < minD) minD = dd4;
      }
    }
    var distPenalty = minD < 2 ? (2 - minD) * 0.5 : 0;
    return (adj >= 2 ? 1000 : (adj === 1 ? 1 : 0)) + distPenalty;
  }
  /* 某槽位所属三元组（按其花色列表的连续 3 块分组）*/
  function tripletOf(lists, slot) {
    var list = lists[suitOfSlot[slot]];
    if (!list) return null;
    var idx = list.indexOf(slot);
    if (idx < 0) return null;
    var g = Math.floor(idx / 3);
    return list.slice(g * 3, g * 3 + 3);
  }

  var lists = suitLists(suitOfSlot);
  var curCost = 0;
  (function () {
    for (var sk in lists) {
      var l2 = lists[sk];
      for (var g3 = 0; g3 * 3 < l2.length; g3++) curCost += tripletCost(l2.slice(g3 * 3, g3 * 3 + 3));
    }
  })();

  /* **硬约束**: 同花色块在移除序上 MUST 连续（每 3 块一组）——
     否则三消无法即时结算（FR-005），Dock 滞留累积 → 槽压飙升。
     故置换算子 MUST 保持「同花色连续性」不变：
     仅允许交换**同组内**或**同色相邻组**的槽位花色标签。
     实现：交换 a、b 时，校验两者所属三元组的花色序列仍为「3 块同色」。 */
  function contiguityOk(a, b) {
    var sa = suitOfSlot[a], sb = suitOfSlot[b];
    if (sa === sb) return true;   /* 同色换落位——不破坏任何组的纯色性 */
    /* 跨色：仅当 a、b 各自所在组的**第三块**也是对方颜色时才可交换
     * （即两个纯色组整体互换颜色）——保证两组仍各为 3 块同色 */
    var la = lists[sa], lb2 = lists[sb];
    var ia = la.indexOf(a), ib = lb2.indexOf(b);
    if (ia < 0 || ib < 0) return false;
    var ga = Math.floor(ia / 3), gb = Math.floor(ib / 3);
    var grpA = la.slice(ga * 3, ga * 3 + 3);
    var grpB = lb2.slice(gb * 3, gb * 3 + 3);
    if (grpA.length !== 3 || grpB.length !== 3) return false;
    /* 交换后 grpA 全为 sb、grpB 全为 sa */
    for (var i4 = 0; i4 < 3; i4++) {
      var x4 = grpA[i4] === a ? sb : grpA[i4];
      if (x4 !== sb) return false;
      var y4 = grpB[i4] === b ? sa : grpB[i4];
      if (y4 !== sa) return false;
    }
    return true;
  }

  /* **组序置换算子**（主打散算子）——
     把某花色的第 g 组与第 g' 组（同色，槽位集合不同）在移除序中的**位置**互换。
     · 连续性保持: 同花色 3 块仍连续（只是换到移除序的别处）
     · 打散效果: 改变「哪 3 块构成一个三元组」→ 直击三连簇根因
     实现: 把组 g 的 3 块与组 g' 的 3 块在移除序中的槽位**逐一交换落位**
           （即: 组 g 的槽位改拿组 g' 的花色, 反之亦然 —— 花色相同故等价于换落位）*/
  function swapGroups(g1, g2) {
    /* g1、g2 为三元组序号（同花色）*/
    var moved = false;
    var suitKeys = Object.keys(lists);
    for (var sk3 = 0; sk3 < suitKeys.length; sk3++) {
      var lk = suitKeys[sk3];
      var l5 = lists[lk];
      if (g1 * 3 + 3 > l5.length || g2 * 3 + 3 > l5.length) continue;
      if (g1 === g2) continue;
      /* 组 g1 与组 g2 的槽位互换落位（花色相同 → 直接换槽位的 suit 标签）*/
      var grp1 = l5.slice(g1 * 3, g1 * 3 + 3);
      var grp2 = l5.slice(g2 * 3, g2 * 3 + 3);
      /* 记录各槽位所属移除序位置 → 交换后需重排 rankOf 使连续性保持 */
      for (var m2 = 0; m2 < 3; m2++) {
        var s1 = grp1[m2], s2b = grp2[m2];
        var tmpL = suitOfSlot[s1]; suitOfSlot[s1] = suitOfSlot[s2b]; suitOfSlot[s2b] = tmpL;
      }
      /* 交换 rankOf → 两组在移除序中的位置互换，组内仍连续 */
      for (var m3 = 0; m3 < 3; m3++) {
        var t1 = rankOf[grp1[m3]], t2 = rankOf[grp2[m3]];
        rankOf[grp1[m3]] = t2; rankOf[grp2[m3]] = t1;
      }
      moved = true;
    }
    return moved;
  }

  /* 交换两槽位的花色标签 → 返回代价增量（接受则维持，否则回滚）*/
  function trySwap(a, b, allowWorse) {
    var ta = suitOfSlot[a], tb = suitOfSlot[b];
    if (ta === tb) return false;
    if (!contiguityOk(a, b)) return false;
    var before = tripletCost(tripletOf(lists, a)) + tripletCost(tripletOf(lists, b));
    /* 执行交换 */
    suitOfSlot[a] = tb; suitOfSlot[b] = ta;
    lists[ta].splice(lists[ta].indexOf(a), 1);
    lists[ta].push(b); lists[ta].sort(function (x, y) { return rankOf[x] - rankOf[y]; });
    lists[tb].splice(lists[tb].indexOf(b), 1);
    lists[tb].push(a); lists[tb].sort(function (x, y) { return rankOf[x] - rankOf[y]; });
    var after = tripletCost(tripletOf(lists, a)) + tripletCost(tripletOf(lists, b));
    var delta = after - before;
    if (delta < 0 || (allowWorse && delta > 0 && delta < 1000)) {
      curCost += delta;
      return true;
    }
    /* 回滚 */
    suitOfSlot[a] = ta; suitOfSlot[b] = tb;
    lists[tb].splice(lists[tb].indexOf(a), 1);
    lists[tb].push(b); lists[tb].sort(function (x, y) { return rankOf[x] - rankOf[y]; });
    lists[ta].splice(lists[ta].indexOf(b), 1);
    lists[ta].push(a); lists[ta].sort(function (x, y) { return rankOf[x] - rankOf[y]; });
    return false;
  }

  /* 全量重算代价（组序置换后用）*/
  function recomputeCost() {
    var ls = suitLists(suitOfSlot);
    var cst = 0;
    for (var sk4 in ls) {
      var l4 = ls[sk4];
      for (var g5 = 0; g5 * 3 < l4.length; g5++) cst += tripletCost(l4.slice(g5 * 3, g5 * 3 + 3));
    }
    return cst;
  }

  /* **组序重排算子**（真正的打散算子）——
     把 order 数组中同花色的第 g1 组与第 g2 组**整体位置互换**。
     · 连续性保持: 同色 3 块仍连续（只是搬到移除序别处）→ 槽压不变
     · 打散效果: 改变「哪 3 块构成一个三元组」→ 直击三连簇根因
     实现: 交换 order 中两个 3-元切片 → 重新推导 suitOfSlot 与分组 */
  function tryGroupReorder(g1, g2) {
    var i1 = g1 * 3, i2 = g2 * 3;
    if (i1 + 3 > order.length || i2 + 3 > order.length || i1 === i2) return false;
    var before = curCost;
    /* 记录两组的槽位（按当前 order）*/
    var seg1 = order.slice(i1, i1 + 3);
    var seg2 = order.slice(i2, i2 + 3);
    /* 同花色才可换（保证连续性）*/
    if (suitOfSlot[seg1[0]] !== suitOfSlot[seg2[0]]) return false;
    /* 交换两段 */
    for (var m4 = 0; m4 < 3; m4++) {
      order[i1 + m4] = seg2[m4];
      order[i2 + m4] = seg1[m4];
    }
    /* 重建 suitOfSlot（按新 order 的三元组分组：同色块仍连续 → 花色标签不变）*/
    for (var m5 = 0; m5 < order.length; m5++) {
      rankOf[order[m5]] = m5;
    }
    lists = suitLists(suitOfSlot);
    var after = recomputeCost();
    if (after < before) { curCost = after; return true; }
    /* 回滚 */
    for (var m6 = 0; m6 < 3; m6++) {
      order[i1 + m6] = seg1[m6];
      order[i2 + m6] = seg2[m6];
    }
    for (var m7 = 0; m7 < order.length; m7++) rankOf[order[m7]] = m7;
    lists = suitLists(suitOfSlot);
    curCost = before;
    return false;
  }

  /* 主循环: 扫描所有槽位对（跳过同色），贪心接受改进 + 有限退火 */
  var allSlots = [];
  for (var asi = 0; asi < suitOfSlot.length; asi++) if (suitOfSlot[asi] != null) allSlots.push(asi);
  var best = suitOfSlot.slice();
  var bestCost = curCost;
  var pass = 0;
  while (pass < 40) {
    var improved = false;
    for (var ca = 0; ca < allSlots.length; ca++) {
      for (var cb = ca + 1; cb < allSlots.length; cb++) {
        if (trySwap(allSlots[ca], allSlots[cb], false)) improved = true;
      }
    }
    /* 组序重排: 同花色两组互换位置（打散主算子）*/
    if (!improved) {
      var nGroups = Math.floor(order.length / 3);
      for (var gA = 0; gA < nGroups; gA++) {
        for (var gB = gA + 1; gB < nGroups; gB++) {
          if (tryGroupReorder(gA, gB)) { improved = true; break; }
        }
        if (improved) break;
      }
    }
    if (!improved) {
      /* 无改进 → 退火扰动（随机接受若干同档变差）后继续 */
      var perturb = 3 + Math.floor(rng() * 6);
      for (var pt = 0; pt < perturb; pt++) {
        var pa = allSlots[Math.floor(rng() * allSlots.length)];
        var pb = allSlots[Math.floor(rng() * allSlots.length)];
        if (pa !== pb) trySwap(pa, pb, true);
      }
      if (curCost < bestCost) { best = suitOfSlot.slice(); bestCost = curCost; }
      if (curCost > bestCost + 6) {
        /* 偏离过远 → 回到历史最优重启 */
        suitOfSlot = best.slice();
        lists = suitLists(suitOfSlot);
        curCost = 0;
        (function () {
          for (var sk2 in lists) {
            var l3 = lists[sk2];
            for (var g4 = 0; g4 * 3 < l3.length; g4++) curCost += tripletCost(l3.slice(g4 * 3, g4 * 3 + 3));
          }
        })();
      }
    }
    pass++;
    if (curCost < bestCost) { best = suitOfSlot.slice(); bestCost = curCost; }
    if (bestCost === 0) break;
  }
  suitOfSlot = best;
  return suitOfSlot;
}

/* 两块交换后，同花色邻接代价的变化量（负数 = 改善）
 *   代价 = 与同花色其他块的连坐数（渲染实坐标口径） */
function tripletAdjacency(suitOfSlot, a, b, slots, swapped) {
  var sa = suitOfSlot[a], sb = suitOfSlot[b];
  var cost = 0;
  for (var i = 0; i < suitOfSlot.length; i++) {
    if (i === a || i === b) continue;
    if (suitOfSlot[i] !== sa) continue;
    var adjA = adjacencyScore(slots[a], slots[i]);
    var adjB = adjacencyScore(slots[b], slots[i]);
    if (swapped) { cost -= adjA + adjB; } else { cost += adjA + adjB; }
  }
  return cost;
}

/* =========================================================
 * Δ19a: 方向分配 —— 朝「最近边」保证射线不被同层阻挡
 *   槽位方向: 取到四边距离的最小者（平局按 U>R>D>L 序）
 *   偶数层与奇数层各自独立（层内同层阻挡）
 * ========================================================= */
function dirForSlot(slot, n, rng) {
  var r = slot.r, c = slot.c;
  var dUp = r, dDown = n - 1 - r, dLeft = c, dRight = n - 1 - c;
  var min = Math.min(dUp, dDown, dLeft, dRight);
  var cands = [];
  if (dUp === min) cands.push(0);
  if (dRight === min) cands.push(1);
  if (dDown === min) cands.push(2);
  if (dLeft === min) cands.push(3);
  if (!cands.length) cands.push(0);
  return pick(rng, cands);
}

/* =========================================================
 * Δ19a: 机制分配（齿轮/冰封/锁链）—— 适配掩码成型 + 分层容器
 *   约束（D-11 单滑块单机制）:
 *     · gear: 仅偶数层 z=0（底层）——其十字邻居同层
 *     · ice:  冰厚 1~iceMax；非组内首位（避免跨组交错滞留）
 *     · chain: 锁/钥匙均在组内第 2/3 位；钥匙飞出序 < 锁飞出序
 * ========================================================= */
function assignMechanismsV2(order, slots, params, rng) {
  var marked = {};
  var chains = [];
  var total = order.length;
  if (!total) return { marked: marked, chains: chains };

  /* gear: 底层偶数层滑块，密度按章参数插值（旋转补偿见 assembleLevelV2）
     marked 的键 = **槽位下标**（与 suitOfSlot 同键空间） */
  if (params.gearOn) {
    var gDens = params.gearDensity[0] + (params.gearDensity[1] - params.gearDensity[0]) * rng();
    if (params.rhythmKind === 'challenge') gDens = params.gearDensity[1];
    var gCount = Math.max(1, Math.round(total * gDens));
    var cand = [];
    for (var i = 0; i < total; i++) {
      if ((slots[order[i]].z || 0) === 0) cand.push(order[i]);
    }
    shuffle(rng, cand);
    var placed = 0;
    for (var j = 0; j < cand.length && placed < gCount; j++) {
      if (marked[cand[j]]) continue;
      marked[cand[j]] = { m: 'g' };
      placed++;
    }
  }

  /* ice: 组内第 2/3 位，且 MUST 位于**首批三消之后**
     （冰封滑块在破冰前不可点——若落在首个三消组内，构造解必然卡死）
     移除序位置 k ≥3 保证前面至少已完成一次三消（破冰触发） */
  if (params.iceOn) {
    var iDens = params.iceDensity[0] + (params.iceDensity[1] - params.iceDensity[0]) * rng();
    if (params.rhythmKind === 'challenge') iDens = params.iceDensity[1];
    var iCount = Math.max(1, Math.round(total * iDens));
    var cand2 = [];
    for (var k = 3; k < total; k++) {
      if (k % 3 === 0) continue;
      cand2.push(order[k]);
    }
    shuffle(rng, cand2);
    /* 冰厚 MUST ≤ 该位置之前已发生的三消次数（floor(k/3)）——
     * 否则冰封滑块在破冰前仍冻结 → 构造解卡死 */
    for (var m = 0; m < iCount && m < cand2.length; m++) {
      if (marked[cand2[m]]) continue;
      var kPos = order.indexOf(cand2[m]);
      var priorTriples = Math.floor(kPos / 3);
      if (priorTriples < 1) continue;
      var wantX = randInt(rng, 1, params.rhythmKind === 'challenge' ? params.iceMax : 2);
      var x = Math.min(wantX, priorTriples);
      if (x < 1) continue;
      marked[cand2[m]] = { m: 'i', x: x };
    }
  }

  /* chain: 锁在后半、钥匙在锁之前（移除序 = 飞出序） */
  if (params.chainOn) {
    var cDens = params.chainDensity[0] + (params.chainDensity[1] - params.chainDensity[0]) * rng();
    if (params.rhythmKind === 'challenge') cDens = params.chainDensity[1];
    var cCount = Math.max(1, Math.round(total * cDens));
    /* 锁候选: 移除序后半段的未标记槽位（非组首位）
       —— 优先取「后半段靠后」者（锁在链尾 → 钥匙有足够长的解锁窗口）*/
    var cand3 = [];
    for (var p = Math.floor(total * 0.4); p < total; p++) {
      if (p % 3 === 0) continue;
      if (marked[order[p]]) continue;
      cand3.push(order[p]);
    }
    shuffle(rng, cand3);
    var locks = [];
    for (var q = 0; q < cCount && q < cand3.length; q++) {
      if (marked[cand3[q]]) continue;
      locks.push(cand3[q]);
    }
    for (var li = 0; li < locks.length; li++) {
      var lockSlot = locks[li];
      if (marked[lockSlot]) continue;
      var lockPos = order.indexOf(lockSlot);
      /* 钥匙位置: 移除序更早（更早飞出）的未标记槽位
         优先取组内第 2/3 位（非组首——组首飞出后同组块会即时三消，钥匙须存活到解锁时）*/
      var keyCands = [];
      var keyCandsAny = [];
      for (var kc = 0; kc < lockPos; kc++) {
        var slotK = order[kc];
        if (marked[slotK]) continue;
        keyCandsAny.push(slotK);
        if (kc % 3 !== 0) keyCands.push(slotK);
      }
      if (!keyCandsAny.length) continue;
      var keySlot = keyCands.length ? pick(rng, keyCands) : pick(rng, keyCandsAny);
      marked[keySlot] = { m: 'k' };
      marked[lockSlot] = { m: 'c' };
      /* chains 边表用**瓦块 id**（= tiles 下标 = 移除序序号）*/
      chains.push([keySlot, [lockSlot]]);   /* 槽位下标——装配时统一转瓦块下标 */
    }
  }
  return { marked: marked, chains: chains };
}

/* =========================================================
 * 关卡组装（v2 掩码成型）
 *   tiles 顺序 = 移除序（构造解顺序）→ tile.id = 飞出序序号
 *   solutionMoves = [{k:0,t:id}] 依次
 * ========================================================= */
function assembleLevelV2(params, rng, variant) {
  var shape = CFG.v2ShapeLayers(params.id, variant);
  var prisms = planPrisms(params, shape, rng);
  var slots = buildSlots(shape, prisms);
  if (!slots.length) return null;
  if (slots.length % 3 !== 0) {
    /* 掩码落位数 MUST 为 3 的倍数——不足则补齐（向内扩展底层） */
    slots = padToMultiple3(slots, shape, prisms, params.n);
    if (!slots || slots.length % 3 !== 0) return null;
  }

  /* 正向剥洋葱 + 瓶颈节奏 */
  var peeled = peelOrder(slots, prisms, params.n, params, rng);
  if (!peeled.order || peeled.order.length !== slots.length) {
    /* 剥除未能覆盖全部槽位（几何死锁）——放弃本候选 */
    return null;
  }
  var order = peeled.order;
  var dirs = peeled.dirs;

  /* 花色分配（与瓶颈节奏耦合 + 空间打散） */
  var suitOfSlot = assignSuitsV2(order, slots, params.suits, params, rng);
  if (!suitOfSlot) return null;

  /* 机制分配（按槽位在移除序中的位置） */
  var mech = assignMechanismsV2(order, slots, params, rng);

  /* 装配瓦片——**tiles 下标 = 移除序序号**（tile.id 即飞出序）
     故 solutionMoves = 依次点击 0,1,2,... 必然为合法构造解 */
  /* 槽位下标 → 瓦块下标映射（机制标记与 chains 边表皆按瓦块下标记） */
  var tileIndexOfSlot = {};
  for (var ti = 0; ti < order.length; ti++) tileIndexOfSlot[order[ti]] = ti;

  /* Δ19a 齿轮旋转补偿——齿轮瓦块在构造解回放中会因十字相邻瓦块飞出而
     顺时针旋转若干次 → 其最终方向 = 构造方向 + 旋转次数。
     故构造时**预先反向偏转** rotationCount 次，使回放后净方向 = 目标方向。
     rotationCount = 与其同层十字相邻、且**先于它飞出**的瓦块数。 */
  function gearRotationCount(gSlot) {
    var g = slots[gSlot];
    var gPos = order.indexOf(gSlot);
    var cnt = 0;
    for (var oi2 = 0; oi2 < gPos; oi2++) {
      var o = slots[order[oi2]];
      if ((o.z || 0) !== (g.z || 0)) continue;   /* Δ19a: 仅同层齿轮受联动 */
      if (Math.abs(o.r - g.r) + Math.abs(o.c - g.c) !== 1) continue;
      cnt++;
    }
    return cnt % 4;
  }

  var tiles = new Array(slots.length);
  for (var i = 0; i < order.length; i++) {
    var slotId = order[i];
    var sl = slots[slotId];
    var mkPre = mech.marked[slotId];
    var kindPre = (mkPre && typeof mkPre === 'object') ? mkPre.m : mkPre;
    var dPre = dirs[slotId] != null ? dirs[slotId] : 0;
    if (kindPre === 'g') {
      dPre = (dPre - gearRotationCount(slotId) + 8) % 4;  /* 预先反向偏转 */
    }
    var spec = { r: sl.r, c: sl.c, s: suitOfSlot[slotId], d: dPre };
    if (sl.z > 0) spec.z = sl.z;
    var mk = mech.marked[slotId];
    var mkKind = (mk && typeof mk === 'object') ? mk.m : mk;
    if (mkKind === 'g') spec.m = 'g';
    else if (mkKind === 'k') spec.m = 'k';
    else if (mkKind === 'c') spec.m = 'c';
    else if (mkKind === 'i') { spec.m = 'i'; spec.x = mk.x; }
    tiles[i] = spec;
  }

  /* chains 边表 —— 键/锁皆转为**瓦块下标**（= TileSpec 索引 = tile.id） */
  var chainEdges = mech.chains.map(function (pair) {
    return [tileIndexOfSlot[pair[0]], [tileIndexOfSlot[pair[1][0]]]];
  });

  var levelDef = {
    id: params.id,
    chapter: params.chapter,
    name: 'Level ' + params.id,
    n: params.n,
    tiles: tiles,
    prisms: prisms,
    cfg: JSON.parse(JSON.stringify(params.cfg)),
    metrics: null,
    solutionMoves: tiles.map(function (tt, idx) { return { k: 0, t: idx }; }),
    theme: params.theme || undefined
  };
  levelDef.cfg.chains = chainEdges;
  levelDef.bottleneck = peeled.metrics;
  return levelDef;
}

/* 掩码落位补齐至 3 的倍数
 *   补位 MUST 满足: ① 该格在所有层皆未被占用（不与既有瓦块重叠）
 *     ② 补在**底层 z=0**（新增底层块只会增加支撑，不会造成悬空）
 *     ③ 不与棱镜格冲突
 *   候选优先级: 底层轮廓内 → 棋盘全域（轮廓内通常已用尽） */
function padToMultiple3(slots, shape, prisms, n) {
  var need = (3 - (slots.length % 3)) % 3;
  if (!need) return slots;
  var out = slots.slice();
  var used = {};
  out.forEach(function (s) { used[s.z + ':' + s.r + ':' + s.c] = true; });
  var prismSet = {};
  prisms.forEach(function (p) { prismSet[p.r + ':' + p.c] = true; });

  var candidates = shape.layers[0].cells.slice();
  for (var rr = 0; rr < n; rr++) {
    for (var cc = 0; cc < n; cc++) candidates.push({ r: rr, c: cc });
  }
  for (var i = 0; i < candidates.length && need > 0; i++) {
    var cell = candidates[i];
    var key = '0:' + cell.r + ':' + cell.c;
    if (used[key]) continue;
    if (prismSet[cell.r + ':' + cell.c]) continue;
    out.push({ r: cell.r, c: cell.c, z: 0 });
    used[key] = true;
    need--;
  }
  return need === 0 ? out : null;
}

/* =========================================================
 * Δ19a/FR-029 §7: 生成期聚散度核验（渲染实坐标口径）
 *   与 tools/solver.js 的 dispersionOf 同构——生成期自检即用此口径，
 *   使「不达标 → 回炉重生成」的闭环（D-10）在生成阶段就生效。
 *   档位判据与 FR-029 三档曲线一致（MUST NOT 因坐标体系变化而放宽）。
 * ========================================================= */
function dispersionCheck(levelDef) {
  var tiles = levelDef.tiles || [];
  var seq = (levelDef.solutionMoves || []).map(function (m) { return tiles[m.t]; });
  var bySuit = {};
  for (var i = 0; i < seq.length; i++) {
    var t = seq[i];
    if (!t) continue;
    (bySuit[t.s] = bySuit[t.s] || []).push(t);
  }
  var trip = 0, pair = 0, total = 0;
  for (var s in bySuit) {
    var list = bySuit[s];
    for (var j = 0; j + 2 < list.length; j += 3) {
      var tri = [list[j], list[j + 1], list[j + 2]];
      var adj = 0;
      for (var a = 0; a < 3; a++) {
        for (var b = a + 1; b < 3; b++) {
          var pa = RE.renderPos(tri[a].r, tri[a].c, tri[a].z || 0);
          var pb = RE.renderPos(tri[b].r, tri[b].c, tri[b].z || 0);
          if (Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c) <= 1.05) adj++;
        }
      }
      total++;
      if (adj >= 2) trip++; else if (adj === 1) pair++;
    }
  }
  var tier = CFG.dispersionTierOf(levelDef.id);
  var tripPct = total ? trip / total : 0;
  var pairPct = total ? pair / total : 0;
  var okTrip = tier.tripMaxPerLevel != null ? trip <= tier.tripMaxPerLevel : tripPct <= tier.tripMax + 1e-9;
  var okPair = pairPct >= tier.pairMin - 1e-9 && pairPct <= tier.pairMax + 1e-9;
  return {
    trip: trip, pair: pair, total: total,
    tripPct: Math.round(tripPct * 1000) / 10, pairPct: Math.round(pairPct * 1000) / 10,
    ok: okTrip && okPair
  };
}
/* =========================================================
 * T047 正向自检: RulesEngine 回放构造解
 * ========================================================= */
function forwardSelfCheck(levelDef) {
  var v = RE.validateLevel(levelDef);
  if (!v.ok) return { ok: false, reason: 'validateLevel: ' + v.errors.slice(0, 3).join('; ') };
  var s = RE.init(levelDef);
  var dockPeak = 0;
  var openSuits = 0;
  for (var i = 0; i < levelDef.solutionMoves.length; i++) {
    var mv = levelDef.solutionMoves[i];
    var r = RE.applyTap(s, mv.t);
    if (r.type === 'invalid' || r.type === 'blocked') {
      return { ok: false, reason: 'step ' + i + ' (id ' + mv.t + ') type=' + r.type + (r.blockedAt ? (' blockedAt=' + r.blockedAt.r + ',' + r.blockedAt.c) : '') };
    }
    if (s.dock.length > dockPeak) dockPeak = s.dock.length;
    var seen = {};
    for (var j = 0; j < s.dock.length; j++) seen[s.dock[j].s] = true;
    var cnt = 0;
    for (var k in seen) cnt++;
    if (cnt > openSuits) openSuits = cnt;
  }
  var term = RE.terminal(s);
  if (term !== 'won') return { ok: false, reason: 'terminal=' + term };
  if (dockPeak > 7) return { ok: false, reason: 'dockPeak=' + dockPeak + ' >7' };
  if (openSuits > 5) return { ok: false, reason: 'openSuits=' + openSuits + ' >5' };
  /* 零悬空复核: 初始态逐瓦块校验支撑 */
  var s0 = RE.init(levelDef);
  for (var ti = 0; ti < s0.tiles.length; ti++) {
    if (!RE.isSupported(s0, s0.tiles[ti])) {
      return { ok: false, reason: '零悬空违规 tile ' + ti + ' (' + s0.tiles[ti].r + ',' + s0.tiles[ti].c + ',z' + s0.tiles[ti].z + ')' };
    }
  }
  /* Δ19a/FR-029: 聚散度档位校验——不达标则回炉重生成（D-10 闭环） */
  var disp = dispersionCheck(levelDef);
  if (!disp.ok) {
    return { ok: false, reason: '聚散度不达标 trip=' + disp.tripPct + '% pair=' + disp.pairPct + '%' };
  }
  return { ok: true, dockPeak: dockPeak, openSuits: openSuits, dispersion: disp };
}

/* =========================================================
 * T048 三重验证闭环 + 重试/降档
 * ========================================================= */
var MAX_RETRY = 6;

function generateOne(levelId, seed) {
  var params = CFG.levelParams(levelId);
  /* Δ19b: v2 布局参数（层数矩阵 + 掩码模板 id） */
  params.v2Layers = CFG.v2LayerCount(levelId);
  params.v2MaskIds = CFG.v2MaskIds(levelId);
  params.cfg.maskBase = params.v2MaskIds.base;
  params.cfg.maskUpper = params.v2MaskIds.upper;

  function attemptWith(p, tagPrefix) {
    for (var attempt = 0; attempt < MAX_RETRY; attempt++) {
      var subSeed = (seed + levelId * 1000 + attempt * 17 + (tagPrefix || 0)) | 0;
      var rng = makeRng(subSeed);
      /* 变体偏移: 失败重试换掩码轮廓（否则几何相同 → 重试无效）*/
      var variant = attempt + (tagPrefix ? (tagPrefix % 7) : 0);
      var levelDef = assembleLevelV2(p, rng, variant);
      if (!levelDef) { console.log('  L' + levelId + ' try' + attempt + ' 组装失败'); continue; }
      /* 落库的掩码模板 id MUST 与实际轮廓一致（FR-045 §1）*/
      var vIds = CFG.v2MaskIds(levelId, variant);
      levelDef.cfg.maskBase = vIds.base;
      levelDef.cfg.maskUpper = vIds.upper;

      var fc = forwardSelfCheck(levelDef);
      if (!fc.ok) { console.log('  L' + levelId + ' try' + attempt + ' 自检: ' + fc.reason); continue; }

      /* Solver 门禁（锚定构造解长度——上界钉死避免深扫）
         hintPath = 构造解 → DFS 每层把构造解的下一块提到展开首位，
         使落库解 == 构造解（聚散度门禁口径与落库数据一致）*/
      var sol = SOLVER.solveLevel(levelDef, {
        budget: { nodes: CFG.BUDGET.nodes, ms: CFG.BUDGET.ms },
        hintUpper: levelDef.solutionMoves.length,
        hintPath: levelDef.solutionMoves
      });
      if (!sol.solvable) { console.log('  L' + levelId + ' try' + attempt + ' Solver: 不可解 nodes=' + sol.nodes); continue; }

      levelDef.solutionMoves = (sol.solutionMoves || levelDef.solutionMoves).map(function (t) { return { k: 0, t: t }; });
      /* Δ19a/FR-029: 落库解 = Solver 最优解 → 聚散度须在**落库解**上复验
         （Solver 路径可能异于构造序——档位判定以落库数据为准）*/
      var dispShip = dispersionCheck(levelDef);
      if (!dispShip.ok) {
        console.log('  L' + levelId + ' try' + attempt + ' 落库解聚散度不达标 trip=' +
          dispShip.tripPct + '% pair=' + dispShip.pairPct + '%');
        continue;
      }
      levelDef.metrics = {
        minMoves: sol.minMoves,
        solutionCount: sol.solutionCount,
        dockPeak: sol.dockPeak,
        mechCount: SOLVER.mechCountOf(levelDef),
        difficultyScore: 0,
        openSuitsMax: sol.openSuitsMax
      };
      return levelDef;
    }
    return null;
  }

  var normal = attemptWith(JSON.parse(JSON.stringify(params)), 0);
  if (normal) return { levelDef: normal, degraded: false };

  /* 降档：花色数降 1 档（网格/层数/掩码不降——掩码成型铁律） */
  var CH = CFG.CHAPTERS[params.chapter - 1];
  for (var dg = 1; dg <= 3; dg++) {
    var p = JSON.parse(JSON.stringify(params));
    p.suits = Math.max(3, p.suits - dg);
    console.log('  L' + levelId + ' 降档 ' + dg + '（suits=' + p.suits + '）');
    var d = attemptWith(p, 997 * dg);
    if (d) return { levelDef: d, degraded: true };
  }
  return null;
}

/* =========================================================
 * T049 导出
 * ========================================================= */
function difficultyDomains(levels) {
  var dom = { minMoves: [Infinity, -Infinity], solutionCount: [Infinity, -Infinity], dockPeak: [Infinity, -Infinity], tiles: [Infinity, -Infinity], suits: [Infinity, -Infinity] };
  levels.forEach(function (L) {
    var m = L.metrics;
    var sc = typeof m.solutionCount === 'number' ? m.solutionCount : 10000;
    dom.minMoves[0] = Math.min(dom.minMoves[0], m.minMoves); dom.minMoves[1] = Math.max(dom.minMoves[1], m.minMoves);
    dom.solutionCount[0] = Math.min(dom.solutionCount[0], sc); dom.solutionCount[1] = Math.max(dom.solutionCount[1], sc);
    dom.dockPeak[0] = Math.min(dom.dockPeak[0], m.dockPeak); dom.dockPeak[1] = Math.max(dom.dockPeak[1], m.dockPeak);
    dom.tiles[0] = Math.min(dom.tiles[0], L.tiles.length); dom.tiles[1] = Math.max(dom.tiles[1], L.tiles.length);
    var ss = {};
    L.tiles.forEach(function (t) { ss[t.s] = true; });
    var sn = 0;
    for (var k in ss) sn++;
    dom.suits[0] = Math.min(dom.suits[0], sn); dom.suits[1] = Math.max(dom.suits[1], sn);
  });
  return dom;
}

function serializeLevel(L, isLast) {
  var out = [];
  out.push('    {');
  out.push('      id: ' + L.id + ',');
  out.push('      chapter: ' + L.chapter + ',');
  out.push('      name: ' + JSON.stringify(L.name) + ',');
  out.push('      n: ' + L.n + ',');
  out.push('      tiles: [');
  L.tiles.forEach(function (t, i) {
    var parts = ['r: ' + t.r, 'c: ' + t.c, 's: ' + t.s, 'd: ' + t.d];
    if (t.z) parts.push('z: ' + t.z);
    if (t.m) parts.push('m: ' + JSON.stringify(t.m));
    if (t.x) parts.push('x: ' + t.x);
    out.push('        { ' + parts.join(', ') + ' }' + (i < L.tiles.length - 1 ? ',' : ''));
  });
  out.push('      ],');
  out.push('      prisms: ' + (L.prisms.length ? JSON.stringify(L.prisms) : '[]') + ',');
  out.push('      cfg: {');
  out.push('        lives: ' + L.cfg.lives + ',');
  out.push('        damageOnBlock: ' + L.cfg.damageOnBlock + ',');
  out.push('        items: { undo: ' + (L.cfg.items.undo != null ? L.cfg.items.undo : 1) +
    ', magnet: ' + (L.cfg.items.magnet != null ? L.cfg.items.magnet : 1) +
    ', shuffle: ' + (L.cfg.items.shuffle != null ? L.cfg.items.shuffle : 1) + ' },');
  out.push('        iceMode: ' + JSON.stringify(L.cfg.iceMode) + ',');
  out.push('        chains: ' + JSON.stringify(L.cfg.chains) + ',');
  out.push('        maskBase: ' + (L.cfg.maskBase != null ? L.cfg.maskBase : 0) + ',');
  out.push('        maskUpper: ' + (L.cfg.maskUpper != null ? L.cfg.maskUpper : 0) + ',');
  out.push('        scoring: { comboBase: ' + L.cfg.scoring.comboBase + ', comboStep: ' + L.cfg.scoring.comboStep + ' }');
  out.push('      },');
  var m = L.metrics;
  out.push('      metrics: { minMoves: ' + m.minMoves + ', solutionCount: ' + (typeof m.solutionCount === 'number' ? m.solutionCount : JSON.stringify(m.solutionCount)) + ', dockPeak: ' + m.dockPeak + ', mechCount: ' + m.mechCount + ', difficultyScore: ' + m.difficultyScore + ', openSuitsMax: ' + m.openSuitsMax + ' },');
  out.push('      solutionMoves: [');
  L.solutionMoves.forEach(function (mv, i) {
    out.push('        { k: 0, t: ' + mv.t + ' }' + (i < L.solutionMoves.length - 1 ? ',' : ''));
  });
  out.push('      ]' + (L.theme ? ',' : ''));
  if (L.theme) out.push('      theme: ' + JSON.stringify(L.theme));
  out.push('    }' + (isLast ? '' : ','));
  return out;
}

function writeLevelsJs(levels, outPath, seed, opts) {
  var attribution = opts && opts.attribution;
  var fs = require('fs');
  var lines = [];
  lines.push('/* =========================================================');
  lines.push(' * Slide & Triple — 关卡数据（v2 掩码布局 · M3 量产生成物）');
  lines.push(' * UMD 双导出（D-02）：浏览器挂 STM.LEVELS / Node module.exports');
  if (attribution) {
    lines.push(' * 由 ' + attribution + '（seed ' + seed + '；FR-031：此后禁止手改）');
  } else {
    lines.push(' * 由 tools/generator.js --seed ' + seed + ' 生成（FR-031：此后禁止手改）');
  }
  lines.push(' * Schema 契约: specs/001-slide-triple-match-core/contracts/level-data.md');
  lines.push(' *');
  lines.push(' * 显式保证（生成器不变量 + 三重验证 D-10）:');
  lines.push(' *   ① 初始滑块数 ≥6 且 %3==0');
  lines.push(' *   ② 钥匙解锁前可达（钥匙飞出序早于锁链——逆向构造结构性保证）');
  lines.push(' *   ③ 单滑块单机制（D-11 互斥）');
  lines.push(' *   ④ 无对射棱镜（布置预检 + Solver 复验）');
  lines.push(' *   ⑤ Δ19b 掩码成型——每关按 FR-045 的 36 套模板之一成型');
  lines.push(' *      （模板 id 落库于 cfg.maskBase / cfg.maskUpper；非正方形满铺）');
  lines.push(' *   ⑥ Δ19a 零悬空——所有 z>0 瓦块下方必有 z-1 支撑');
  lines.push(' *   ⑦ 奇偶层半格错位——偶数层 (r,c) / 奇数层 (r+0.5,c+0.5)');
  lines.push(' *   ⑧ solutionMoves = Solver 最优解（Δ6 预计算; 构造解仅自检）');
  lines.push(' * ========================================================= */');
  lines.push('(function (global, factory) {');
  lines.push("  if (typeof module === 'object' && module.exports) module.exports = factory();");
  lines.push("  else (global.STM = global.STM || {}).LEVELS = factory();");
  lines.push("})(typeof window !== 'undefined' ? window : globalThis, function () {");
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  return [');
  levels.forEach(function (L, i) {
    serializeLevel(L, i === levels.length - 1).forEach(function (sl) { lines.push(sl); });
  });
  lines.push('  ];');
  lines.push('});');
  fs.writeFileSync(outPath, lines.join('\n'));
}

function main() {
  var args = process.argv.slice(2);
  var seed = 2026;
  var si = args.indexOf('--seed');
  if (si >= 0 && args[si + 1]) seed = parseInt(args[si + 1], 10);
  var chaptersArg = '1,2,3';
  var ci = args.indexOf('--chapters');
  if (ci >= 0 && args[ci + 1]) chaptersArg = args[ci + 1];
  var outPath = path.join(__dirname, '..', 'src', 'data', 'levels.js');
  var oi = args.indexOf('--out');
  if (oi >= 0 && args[oi + 1]) outPath = path.resolve(args[oi + 1]);
  var dryRun = args.indexOf('--dry-run') >= 0;

  var chapters = chaptersArg.split(',').map(Number);
  var levelIds = [];
  chapters.forEach(function (ch) {
    var c = CFG.CHAPTERS[ch - 1];
    if (!c) return;
    for (var lv = c.levels[0]; lv <= c.levels[1]; lv++) levelIds.push(lv);
  });
  console.log('generator(v2 掩码布局): seed=' + seed + ' levels=' + levelIds.length + '（chapters ' + chaptersArg + '）');

  var t0 = Date.now();
  var levels = [];
  var degradedIds = [];
  var i;
  for (i = 0; i < levelIds.length; i++) {
    var r = generateOne(levelIds[i], seed);
    if (!r) {
      console.error('  ✗ L' + levelIds[i] + ' 生成彻底失败（含降档）');
      process.exit(1);
    }
    if (r.degraded) degradedIds.push(levelIds[i]);
    levels.push(r.levelDef);
    var m = r.levelDef.metrics;
    var bl = r.levelDef.bottleneck || {};
    console.log('  ✓ L' + levelIds[i] + ' n=' + r.levelDef.n + ' tiles=' + r.levelDef.tiles.length +
      ' mask=' + r.levelDef.cfg.maskBase + '/' + r.levelDef.cfg.maskUpper +
      ' minMoves=' + m.minMoves + ' dockPeak=' + m.dockPeak + ' mech=' + m.mechCount +
      ' choke=' + bl.chokePoints + ' minChoke=' + bl.minChokeActions + ' chain=' + bl.maxChainLen +
      (r.degraded ? ' [degraded]' : ''));
  }

  var dom = difficultyDomains(levels);
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
    console.log('dry-run: ' + levels.length + ' 关生成成功（不写盘）' + (degradedIds.length ? ' 降档: ' + degradedIds.join(',') : ''));
    return;
  }

  writeLevelsJs(levels, outPath, seed);
  console.log('导出 → ' + outPath + '（' + levels.length + ' 关' + (degradedIds.length ? ('，降档 ' + degradedIds.length + ' 关: ' + degradedIds.join(',')) : '') + '）');
  console.log('耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

if (require.main === module) main();

module.exports = {
  makeRng: makeRng,
  randInt: randInt,
  pick: pick,
  shuffle: shuffle,
  ringOf: ringOf,
  planPrisms: planPrisms,
  buildSlots: buildSlots,
  padToMultiple3: padToMultiple3,
  pickFreeDir: pickFreeDir,
  coverageMap: coverageMap,
  movableIds: movableIds,
  peelOrder: peelOrder,
  assignSuitsV2: assignSuitsV2,
  assignMechanismsV2: assignMechanismsV2,
  assembleLevelV2: assembleLevelV2,
  forwardSelfCheck: forwardSelfCheck,
  generateOne: generateOne,
  writeLevelsJs: writeLevelsJs,
  difficultyDomains: difficultyDomains
};
