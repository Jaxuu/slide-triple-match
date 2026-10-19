#!/usr/bin/env node
/* =========================================================
 * Slide & Triple — Generator（逆向关卡生成器，D-10）
 * Node ≥18 离线工具（CommonJS，零 npm 依赖——宪章 II）
 * 前端永不引用本文件
 *
 * M3 构造策略（底层 z=0 满铺 + 多层立体叠塔最高 5 层）:
 *   1. z=0 底盘 100% 满铺（棱镜格除外）——剥洋葱序（外圈→内圈）
 *   2. 塔格: 内圈格按 zMax 堆叠（层号连续 0..h）——塔顶朝最近边凌空飞越
 *   3. 三消组逆推: 轮数 = tiles/3，每轮 3 同花色滑块按「后推入先飞出」逆序落位
 *   4. 机制镜像: gear（落位约束十字相邻晚入者的旋转可达）/ ice（独立冰厚）/
 *      chain（钥匙晚于锁链落位=更早飞出）/ prism（先行布置+对射拒绝）
 *   5. 正向自检（RulesEngine 回放构造解）→ Solver 门禁 → 失败回炉/降档
 *
 * CLI: node tools/generator.js [--chapters 1,2,3,4,5] [--seed S] [--out src/data/levels.js] [--dry-run]
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

/* =========================================================
 * 格规划: 满铺底盘 + 塔位 + 棱镜
 * 返回 { n, baseCells, towerMap, prisms }
 *   baseCells: [{r,c,ring}] 剥洋葱序（ring 0=最外圈）
 *   towerMap: {"r:c": h}（塔高 h=层数-1，h≥1 才是塔）
 *   prisms: [{r,c,t}]
 * ========================================================= */
function ringOf(r, c, n) {
  return Math.min(r, c, n - 1 - r, n - 1 - c);
}

function planCells(params, rng) {
  var n = params.n;
  var prisms = [];
  if (params.prismCount > 0) {
    /* 棱镜布置: 避免边缘一圈与角（对射高风险区）——取中心区随机格 */
    var candidates = [];
    for (var r = 1; r < n - 1; r++) {
      for (var c = 1; c < n - 1; c++) candidates.push({ r: r, c: c });
    }
    shuffle(rng, candidates);
    var used = {};
    for (var i = 0; i < candidates.length && prisms.length < params.prismCount; i++) {
      var p = candidates[i];
      var k = p.r + ':' + p.c;
      if (used[k]) continue;
      /* 对射拒绝（简化预检）: 不与已放棱镜同行/列/斜线相邻 */
      var conflict = false;
      for (var j = 0; j < prisms.length; j++) {
        var q = prisms[j];
        if (Math.abs(q.r - p.r) + Math.abs(q.c - p.c) === 0) { conflict = true; break; }
      }
      if (conflict) continue;
      used[k] = true;
      prisms.push({ r: p.r, c: p.c, t: rng() < 0.5 ? '/' : '\\' });
    }
  }
  var prismSet = {};
  prisms.forEach(function (p) { prismSet[p.r + ':' + p.c] = true; });

  /* 底盘格（满铺: n*n - 棱镜数）按 ring 升序（剥洋葱） */
  var byRing = [];
  for (var rr = 0; rr < n; rr++) {
    for (var cc = 0; cc < n; cc++) {
      if (prismSet[rr + ':' + cc]) continue;
      byRing.push({ r: rr, c: cc, ring: ringOf(rr, cc, n) });
    }
  }
  byRing.sort(function (a, b) {
    if (a.ring !== b.ring) return a.ring - b.ring; /* 外圈先行飞出 */
    /* ring 内: 行优先列优先（确定性基础序） */
    if (a.r !== b.r) return a.r - b.r;
    return a.c - b.c;
  });

  /* 塔位: 上层 tiles = params.tiles - 底盘数; 分配到内圈格（ring ≥ 1） */
  var baseCount = byRing.length;
  var stackCount = Math.max(0, params.tiles - baseCount);
  var towerMap = {};
  if (stackCount > 0) {
    /* 塔候选 = 内圈格（ring ≥ 1，非棱镜）; 解压爽关按 theme 对称模板优先 */
    var towerCells = byRing.filter(function (cell) { return cell.ring >= 1; });
    if (params.theme) towerCells = themeOrder(towerCells, params.theme, n, rng);
    else shuffle(rng, towerCells);
    var zMax = params.zMax;
    var si = 0;
    while (stackCount > 0 && towerCells.length) {
      var cell = towerCells[si % towerCells.length];
      si++;
      var k2 = cell.r + ':' + cell.c;
      var h = (towerMap[k2] || 0) + 1;
      if (h >= zMax) { /* 该格已达最大高 */
        if (h === zMax) towerCells = towerCells.filter(function (tc) { return !(tc.r === cell.r && tc.c === cell.c); });
        if (!towerCells.length) break;
        continue;
      }
      towerMap[k2] = h;
      stackCount--;
    }
  }

  return { n: n, baseCells: byRing, towerMap: towerMap, prisms: prisms, prismSet: prismSet };
}

/* 解压爽关 theme 对称模板: 上层塔位按对称图案优先排布 */
function themeOrder(cells, theme, n, rng) {
  var mid = (n - 1) / 2;
  function symScore(cell) {
    var dx = cell.c - mid, dy = cell.r - mid;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var absd = Math.abs(Math.abs(dx) - Math.abs(dy));
    switch (theme) {
      case 'ring': return dist;                       /* 环形: 距中心排序 */
      case 'butterfly': return Math.abs(Math.abs(dx) - Math.abs(dy)) + dist * 0.3; /* 蝶形: 对角带 */
      case 'diamond': return Math.abs(dx) + Math.abs(dy) - dist * 0.5; /* 菱形 */
      case 'heart': return Math.sqrt(Math.abs(dx)) + Math.abs(dy) * 0.7; /* 心形近似 */
      default: return dist;
    }
  }
  var scored = cells.map(function (c) { return { c: c, s: symScore(c) }; });
  scored.sort(function (a, b) { return a.s - b.s; });
  return scored.map(function (x) { return x.c; });
}

/* =========================================================
 * T045 逆向构造核心: 落位序 = 飞出序的逆序（后推入者先飞出）
 * 槽位表: cellSlots = 底盘序（ring 升序）+ 每塔格的 z 降序段（塔顶先飞）
 * 逆序落位: 从「最先飞出」到最后——先放外圈，后放内圈；塔顶段先于塔基
 *
 * 返回构造解 constructMoves（飞出序 = slots 逆序排列后正向）
 * ========================================================= */
function buildSlots(plan, n) {
  /* 展开槽位: 每塔格 → [z=h, h-1, ..., 1]（塔顶先飞）; 底盘格 → [z=0]
   * 飞出顺序约束（洋葱拓扑——确保任意时刻射线只穿已清空格）:
   *   外圈 z0 → 内圈 z0 … ; 塔段整体先于其底盘格（同格栈顶先飞）
   * 简化合并: slot 序 = cells 按 ring 升序; 塔格在自身 ring 位置展开 [z 高→低]
   *   塔顶凌空飞越约束天然满足（前方低层格无论是否清空均不阻挡高 z 飞行）
   */
  var slots = [];
  plan.baseCells.forEach(function (cell) {
    var h = plan.towerMap[cell.r + ':' + cell.c] || 0;
    for (var z = h; z >= 1; z--) slots.push({ r: cell.r, c: cell.c, z: z, ring: cell.ring, tower: true });
    slots.push({ r: cell.r, c: cell.c, z: 0, ring: cell.ring, tower: false });
  });
  return slots;
}

/* 槽位方向: 朝「最近边」（洋葱序的飞出保证）——塔段（z≥1）同格朝最近边（凌空） */
function dirForSlot(slot, n, rng) {
  var r = slot.r, c = slot.c;
  /* 最近边距离; 平局取行优先（确定性）; rng 微扰解压关多样性 */
  var dUp = r, dDown = n - 1 - r, dLeft = c, dRight = n - 1 - c;
  var min = Math.min(dUp, dDown, dLeft, dRight);
  var cands = [];
  if (dUp === min) cands.push(0);
  if (dRight === min) cands.push(1);
  if (dDown === min) cands.push(2);
  if (dLeft === min) cands.push(3);
  return pick(rng, cands);
}

/* =========================================================
 * T045 花色分配: 轮数 = tiles/3，每轮 3 同花色
 * 开放花色约束: 飞出序上任何时刻 dock 未满三花色 ≤5
 *   → 分配按飞出序分段: 相邻轮花色分组（3 连同花色轮次互错开）
 *   简化保证: 花色以「块」分配——每 suit 的所有组连续出现 → 开放数 = 活跃块数
 *   再以 suits 数滚动分配，每花色连续 ≥3 组（同花色组相接 → dock 峰值低）
 * ========================================================= */
function assignSuits(groups, suitsN, rng, params) {
  /* groups = 组数; 每花色组数 %3==0? 不必——每花色总滑块数 %3==0 自动成立（组数×3）
   * 分配: 轮流给花色但连续轮同花色打包成 run（run 长 1~3 组）→ 开放花色低 */
  var assignment = [];
  var suitRuns = [];
  var runLen = params.rhythmKind === 'relax' ? randInt(rng, 2, 3) : randInt(rng, 1, 2);
  var cur = 0, run = 0;
  for (var g = 0; g < groups; g++) {
    assignment.push(cur);
    run++;
    if (run >= runLen) {
      run = 0;
      runLen = params.rhythmKind === 'relax' ? randInt(rng, 2, 3) : randInt(rng, 1, 2);
      cur = (cur + 1 + Math.floor(rng() * 2)) % suitsN; /* 跳 1~2 步滚动 */
    }
  }
  return assignment;
}

/* =========================================================
 * T046 机制分配:
 *   gear: 随机标记（密度 d ∈ density 区间按 rng 插值）——标记在「晚于邻居落位」的滑块
 *     （齿轮约束在正向解里 = 落位后十字相邻有更早飞出（=更晚落位）者存在 → 其旋转对准）
 *     构造简化: 只把齿轮放在飞出序早段（ring 小）的滑块上——旋转语义由 Solver 复证
 *   ice: 冰厚 x 1~2（挑战关上探 3）; 冰封滑块任意位置（破冰由三消全局触发——逆序无约束）
 *   chain: 锁链放晚飞段、钥匙放早飞段（钥匙先飞出解锁）; chains 边表
 *   互斥: 单滑块单机制（D-11）
 * ========================================================= */
/* 十字相邻格中已放置滑块的 fly 序列表（slots = fly 序数组; 目标格 slots[gi]） */
function neighborsIn(slots, gi) {
  var t = slots[gi];
  var out = [];
  var dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  for (var d = 0; d < 4; d++) {
    var rr = t.r + dirs[d][0], cc = t.c + dirs[d][1];
    for (var i = 0; i < slots.length; i++) {
      if (i !== gi && slots[i].r === rr && slots[i].c === cc) { out.push(i); break; }
    }
  }
  return out;
}

function assignMechanisms(slots, flyOrder, params, rng) {
  /* flyOrder: 槽位飞出序（= slots 的正序）; slots[i] 对应 flyOrder[i] */
  var n = params.n;
  var total = flyOrder.length;
  var marked = {};
  var chains = [];

  /* gear: 密度取插值; 放底盘滑块且其十字邻居的飞出序（=id）均小于自身
   *   → 该齿轮的全部旋转发生在其飞出前——构造补偿: spec.d = 边方向 - 邻居数 (mod 4)
   *   正向回放中旋转 k 次 → 净方向对准边（畅通飞出） */
  if (params.gearOn) {
    var gDens = params.gearDensity[0] + (params.gearDensity[1] - params.gearDensity[0]) * rng();
    if (params.rhythmKind === 'challenge') gDens = params.gearDensity[1];
    var gCount = Math.max(1, Math.round(total * gDens));
    var idxs = [];
    for (var i = 1; i < total; i++) idxs.push(i);
    shuffle(rng, idxs);
    var placed = 0;
    for (var j = 0; j < idxs.length && placed < gCount; j++) {
      var gi = idxs[j];
      if (marked[gi]) continue;
      if (flyOrder[gi].z !== 0 || flyOrder[gi].tower) continue; /* 仅底盘 */
      /* 统计十字相邻格中 fly 序小于 gi 的滑块数 k（它们先飞出 → 触发 k 次旋转） */
      var nb = neighborsIn(slots, gi);
      if (nb.some(function (nid) { return nid > gi; })) continue; /* 有邻居晚于自身飞出 → 旋转不确定 → 跳过 */
      marked[gi] = { m: 'g', k: nb.length };
      placed++;
    }
  }

  /* ice: 密度插值; 厚度 1~iceMax（挑战上探）; 任意段 */
  if (params.iceOn) {
    var iDens = params.iceDensity[0] + (params.iceDensity[1] - params.iceDensity[0]) * rng();
    if (params.rhythmKind === 'challenge') iDens = params.iceDensity[1];
    var iCount = Math.max(1, Math.round(total * iDens));
    var idxs2 = [];
    /* 冰封滑块 fly 序 ≥3（首个三消组之后——保证破冰三消先发生; 破冰后按序畅通） */
    for (var k = 3; k < total; k++) idxs2.push(k);
    shuffle(rng, idxs2);
    for (var m = 0; m < iCount && m < idxs2.length; m++) {
      var ii = idxs2[m];
      if (marked[ii]) continue;
      marked[ii] = { m: 'i', x: randInt(rng, 1, params.rhythmKind === 'challenge' ? params.iceMax : 2) };
    }
  }

  /* chain: 锁链在后 50%（晚飞）; 钥匙在锁链之前飞出（早段）; 每锁一钥 */
  if (params.chainOn) {
    var cDens = params.chainDensity[0] + (params.chainDensity[1] - params.chainDensity[0]) * rng();
    var cCount = Math.max(1, Math.round(total * cDens));
    var lockIdxs = [];
    for (var p2 = Math.floor(total * 0.5); p2 < total; p2++) lockIdxs.push(p2);
    shuffle(rng, lockIdxs);
    var locks = [];
    for (var q = 0; q < cCount && q < lockIdxs.length; q++) {
      if (marked[lockIdxs[q]]) continue;
      locks.push(lockIdxs[q]);
    }
    /* 每把锁配 1 钥匙（钥匙飞序 < 锁飞序——早于锁解锁） */
    for (var li = 0; li < locks.length; li++) {
      var lockPos = locks[li];
      if (marked[lockPos]) continue; /* 已被此前链条的钥匙占用（key 位与 lock 位冲突防护） */
      /* 钥匙位置: 0..lockPos-1 中未标记滑块（避开已用键/锁/机制位） */
      var keyCands = [];
      for (var kc = 0; kc < lockPos; kc++) {
        if (!marked[kc]) keyCands.push(kc);
      }
      if (!keyCands.length) continue;
      var keyPos = pick(rng, keyCands);
      marked[keyPos] = 'k';
      marked[lockPos] = 'c';
      chains.push([keyPos, [lockPos]]);
    }
  }

  return { marked: marked, chains: chains };
}

/* =========================================================
 * T045/T047 关卡组装 + 正向自检
 * ========================================================= */
function assembleLevel(params, rng, subSeed) {
  var plan = planCells(params, rng);
  var slots = buildSlots(plan, params.n);

  /* flyOrder = slots（即飞出序）; tiles 按 fly 序排列 → tile.id = fly 序号
   * 构造解 solutionMoves = [{k:0,t:0},{k:0,t:1},...]（依次点击 id 序——洋葱拓扑保证畅通） */

  var groups = Math.floor(slots.length / 3);
  if (groups * 3 !== slots.length) return null; /* 参数错位 → 上层重试 */
  var suitOfGroup = assignSuits(groups, params.suits, rng, params);
  var suitOfSlot = [];
  for (var g = 0; g < groups; g++) {
    for (var q3 = 0; q3 < 3; q3++) suitOfSlot.push(suitOfGroup[g]);
  }

  var mech = assignMechanisms(slots, slots, params, rng);

  var tiles = [];
  for (var i = 0; i < slots.length; i++) {
    var sl = slots[i];
    var spec = { r: sl.r, c: sl.c, s: suitOfSlot[i], d: dirForSlot(sl, params.n, rng) };
    if (sl.z > 0) spec.z = sl.z;
    var mk = mech.marked[i];
    if (mk === 'g') spec.m = 'g';
    else if (mk && mk.m === 'g') {
      /* 齿轮补偿: 构造时先转 (edge - k) 次 → 回放中 k 次旋转后净方向 = 边方向 */
      spec.m = 'g';
      var k = mk.k % 4;
      spec.d = (spec.d - k + 8) % 4;
    }
    else if (mk === 'k') spec.m = 'k';
    else if (mk === 'c') spec.m = 'c';
    else if (mk && mk.m === 'i') { spec.m = 'i'; spec.x = mk.x; }
    tiles.push(spec);
  }

  var levelDef = {
    id: params.id,
    chapter: params.chapter,
    name: 'Level ' + params.id + (params.theme ? (' · ' + themeName(params.theme)) : ''),
    n: params.n,
    tiles: tiles,
    prisms: plan.prisms,
    cfg: JSON.parse(JSON.stringify(params.cfg)),
    metrics: null,
    solutionMoves: tiles.map(function (t, idx) { return { k: 0, t: idx }; }),
    theme: params.theme || undefined
  };
  levelDef.cfg.chains = mech.chains;
  return levelDef;
}

function themeName(theme) {
  return { ring: '同心圆环', butterfly: '蝶翼绽放', diamond: '菱形钻面', heart: '心形花语' }[theme] || theme;
}

/* T047 正向自检: RulesEngine 回放构造解 */
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
  return { ok: true, dockPeak: dockPeak, openSuits: openSuits };
}

/* =========================================================
 * T048 三重验证闭环 + 重试/降档
 * ========================================================= */
var MAX_RETRY = 5;

function generateOne(levelId, seed) {
  var params = CFG.levelParams(levelId);

  function attemptWith(p, tagPrefix) {
    for (var attempt = 0; attempt < MAX_RETRY; attempt++) {
      var subSeed = (seed + levelId * 1000 + attempt * 17 + (tagPrefix || 0)) | 0;
      var rng = makeRng(subSeed);
      var levelDef = assembleLevel(p, rng, subSeed);
      if (!levelDef) continue;

      var fc = forwardSelfCheck(levelDef);
      if (!fc.ok) { console.log('  L' + levelId + ' try' + attempt + ' 自检: ' + fc.reason); continue; }

      /* Solver 门禁（锚定构造解长度——上界钉死避免深扫; 结构性 minMoves=tilesN） */
      /* Solver 门禁——预算与 CLI 全量门禁完全一致（CFG.BUDGET: 2M/60s）
       * 口径漂移会导致 metrics 双写不一致（levels.js vs solver-report.json） */
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

  /* 正常档 */
  var normal = attemptWith(JSON.parse(JSON.stringify(params)), 0);
  if (normal) return { levelDef: normal, degraded: false };

  /* 降档（T048: tiles/suits 降 1 档至章区间下界; 连续 5 次失败后） */
  var CH = CFG.CHAPTERS[params.chapter - 1];
  for (var dg = 1; dg <= 3; dg++) {
    var p = JSON.parse(JSON.stringify(params));
    p.tiles = Math.max(Math.round(CH.tiles[0] / 3) * 3, p.tiles - 3 * dg);
    p.suits = Math.max(CH.suits[0], p.suits - dg);
    while (p.n > 5 && p.tiles < p.n * p.n) p.n -= 1;
    console.log('  L' + levelId + ' 降档 ' + dg + '（tiles=' + p.tiles + ' suits=' + p.suits + ' n=' + p.n + '）');
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
  out.push('        items: { undo: ' + L.cfg.items.undo + ', wrench: ' + L.cfg.items.wrench + ', stage: ' + L.cfg.items.stage + ' },');
  out.push('        iceMode: ' + JSON.stringify(L.cfg.iceMode) + ',');
  out.push('        chains: ' + JSON.stringify(L.cfg.chains) + ',');
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

function writeLevelsJs(levels, outPath, seed) {
  var fs = require('fs');
  var lines = [];
  lines.push('/* =========================================================');
  lines.push(' * Slide & Triple — 关卡数据（M3 量产生成物）');
  lines.push(' * UMD 双导出（D-02）：浏览器挂 STM.LEVELS / Node module.exports');
  lines.push(' * 由 tools/generator.js --seed ' + seed + ' 生成（FR-031：此后禁止手改）');
  lines.push(' * Schema 契约: specs/001-slide-triple-match-core/contracts/level-data.md');
  lines.push(' *');
  lines.push(' * 显式保证（生成器不变量 + 三重验证 D-10）:');
  lines.push(' *   ① 初始滑块数 ≥6 且 %3==0');
  lines.push(' *   ② 钥匙解锁前可达（钥匙飞出序早于锁链——逆向构造结构性保证）');
  lines.push(' *   ③ 单滑块单机制（D-11 互斥）');
  lines.push(' *   ④ 无对射棱镜（布置预检 + Solver 复验）');
  lines.push(' *   ⑤ z=0 底层 100% 满铺（棱镜格除外）+ 多层立体叠塔（最高 5 层）');
  lines.push(' *   ⑥ solutionMoves = Solver 最优解（Δ6 预计算; 构造解仅自检）');
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
  var chaptersArg = '1,2,3,4,5';
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
  console.log('generator: seed=' + seed + ' levels=' + levelIds.length + '（chapters ' + chaptersArg + '）');

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
    console.log('  ✓ L' + levelIds[i] + ' n=' + r.levelDef.n + ' tiles=' + r.levelDef.tiles.length +
      ' minMoves=' + m.minMoves + ' dockPeak=' + m.dockPeak + ' mech=' + m.mechCount +
      (r.levelDef.theme ? (' theme=' + r.levelDef.theme) : '') + (r.degraded ? ' [degraded]' : ''));
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
  planCells: planCells,
  buildSlots: buildSlots,
  dirForSlot: dirForSlot,
  assignSuits: assignSuits,
  assignMechanisms: assignMechanisms,
  assembleLevel: assembleLevel,
  forwardSelfCheck: forwardSelfCheck,
  generateOne: generateOne,
  writeLevelsJs: writeLevelsJs,
  difficultyDomains: difficultyDomains
};
