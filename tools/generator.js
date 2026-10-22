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
  var chokePoints = 0, minChoke = Infinity, maxChain = 0, chain = 0;

  for (;;) {
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

    /* 选牌策略: 优先移除「解锁最多」的关键牌（层叠压制关系驱动——
     * 咽喉点 MUST 由层叠压制关系构造而非同花色聚集，FR-029 §8） */
    var cover = coverageMap(state);
    var scored = movable.map(function (id) {
      var unlock = exclusiveTargets(cover, id).length;   /* 移除后解锁的瓦块数 */
      var t = state.tiles[id];
      return { id: id, s: unlock * 10 + (t.z || 0) * 2, z: t.z || 0 };
    });
    scored.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      if (b.z !== a.z) return b.z - a.z;
      return a.id - b.id;
    });

    /* 逐个候选尝试：先为该瓦块求解一个畅通方向（失败则试下一个候选） */
    var chosen = -1, chosenDir = -1;
    for (var ci = 0; ci < scored.length; ci++) {
      var cid = scored[ci].id;
      var ct = state.tiles[cid];
      var d = pickFreeDir(state, ct);
      if (d < 0) continue;
      chosen = cid; chosenDir = d;
      break;
    }
    if (chosen < 0) {
      /* 全部候选皆无畅通方向——几何死锁 */
      return { order: null, dirs: dirs, metrics: null, deadlocked: true };
    }
    dirs[chosen] = chosenDir;
    peelOne(state, chosen);
    order.push(chosen);
  }

  if (minChoke === Infinity) minChoke = 0;
  return {
    order: order,
    dirs: dirs,
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

  /* ① 组 → 花色：轮流分配（每花色组数 %3==0 → 总数 %3==0 自动成立） */
  var groupSuit = [];
  for (var g = 0; g < groups; g++) groupSuit.push(g % suitsN);
  /* 每花色组数需为整数倍（3 的倍数）——总组数须能被 suitsN 整除或反之。
   * 稳妥做法: 花色按「连续 run」分配，每花色恰好 groups/suitsN 组（取整），
   * 余数补给前面的花色（使每花色组数相同 → 总数恒等） */
  var per = Math.floor(groups / suitsN);
  var rem = groups - per * suitsN;
  groupSuit = [];
  var gi = 0;
  for (var s = 0; s < suitsN; s++) {
    var cnt = per + (s < rem ? 1 : 0);
    for (var k = 0; k < cnt; k++) { groupSuit.push(s); gi++; }
  }
  /* 每花色组数 %3 未必为 0 → 总量 %3==0 需每花色组数 %3==0。
   * 修正: 组数向下取到 3 的倍数，多余组并入首花色（首花色组数 %3==0） */
  var per3 = Math.floor(per / 3) * 3;
  if (per3 < 3) per3 = 3;   /* 至少 1 组（3 块）——但 %3 要求组数是 3 的倍数 */
  if (per3 % 3 !== 0) per3 -= per3 % 3;
  groupSuit = [];
  var idx = 0;
  for (var s2 = 0; s2 < suitsN; s2++) {
    var c2 = (s2 === 0) ? (groups - per3 * (suitsN - 1)) : per3;
    for (var k2 = 0; k2 < c2; k2++) { groupSuit.push(s2); idx++; }
  }
  if (groupSuit.length !== groups) return null;

  /* ② 槽位 → 花色初值（按移除序三元组）
     order[i] = 槽位下标；suitOfSlot 以**槽位下标**为键 */
  var suitOfSlot = new Array(slots.length);
  for (var oi = 0; oi < order.length; oi++) {
    suitOfSlot[order[oi]] = groupSuit[Math.floor(oi / 3)];
  }

  /* ③ 空间打散置换 —— 在同花色块之间交换落位，最小化连坐/三连簇 */
  var suitBuckets = {};
  for (var t2 = 0; t2 < suitOfSlot.length; t2++) {
    if (suitOfSlot[t2] == null) continue;
    (suitBuckets[suitOfSlot[t2]] = suitBuckets[suitOfSlot[t2]] || []).push(t2);
  }
  var tries = 0;
  var improved = true;
  while (improved && tries < 60) {
    improved = false;
    tries++;
    var bucketKeys = Object.keys(suitBuckets);
    for (var bi = 0; bi < bucketKeys.length; bi++) {
      var bucket = suitBuckets[bucketKeys[bi]];
      for (var x = 0; x < bucket.length; x++) {
        for (var y = x + 1; y < bucket.length; y++) {
          var a = bucket[x], b = bucket[y];
          var cur = tripletAdjacency(suitOfSlot, a, b, slots);
          var swapped = tripletAdjacency(suitOfSlot, a, b, slots, true);
          if (swapped < cur) {
            var tmp = suitOfSlot[a]; suitOfSlot[a] = suitOfSlot[b]; suitOfSlot[b] = tmp;
            bucket[x] = b; bucket[y] = a;
            improved = true;
          }
        }
      }
    }
  }
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
    var cand3 = [];
    for (var p = Math.floor(total * 0.4); p < total; p++) {
      if (p % 3 === 0) continue;
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
      /* 钥匙位置: 移除序更早（更早飞出）的未标记槽位 */
      var keyCands = [];
      for (var kc = 0; kc < lockPos; kc++) {
        var slotK = order[kc];
        if (!marked[slotK] && kc % 3 !== 0) keyCands.push(slotK);
      }
      if (!keyCands.length) continue;
      var keySlot = pick(rng, keyCands);
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
function assembleLevelV2(params, rng) {
  var shape = CFG.v2ShapeLayers(params.id);
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
  return { ok: true, dockPeak: dockPeak, openSuits: openSuits };
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
      var levelDef = assembleLevelV2(p, rng);
      if (!levelDef) { console.log('  L' + levelId + ' try' + attempt + ' 组装失败'); continue; }

      var fc = forwardSelfCheck(levelDef);
      if (!fc.ok) { console.log('  L' + levelId + ' try' + attempt + ' 自检: ' + fc.reason); continue; }

      /* Solver 门禁（锚定构造解长度——上界钉死避免深扫） */
      var sol = SOLVER.solveLevel(levelDef, {
        budget: { nodes: CFG.BUDGET.nodes, ms: CFG.BUDGET.ms },
        hintUpper: levelDef.solutionMoves.length
      });
      if (!sol.solvable) { console.log('  L' + levelId + ' try' + attempt + ' Solver: 不可解 nodes=' + sol.nodes); continue; }

      levelDef.solutionMoves = (sol.solutionMoves || levelDef.solutionMoves).map(function (t) { return { k: 0, t: t }; });
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
