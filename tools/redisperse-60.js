#!/usr/bin/env node
/* =========================================================
 * Slide & Triple — Δ15a 存量 60 关花色重打散迁移工具（T052h）
 * Node ≥18 离线工具（CommonJS，零 npm 依赖——宪章 II）
 *
 * 铁律（FR-029 §6 受控让位条款）:
 *   · 每关仅重派 tiles[].s（花色空间落位）——滑块坐标 (r,c,z)、方向 d、
 *     机关属性 m/x、prisms、cfg、结构参数 100% 不变
 *   · solutionMoves 点击序列（tile id 序）原样保留——射线拓扑与花色无关，
 *     重派后沿原序列重放仍 100% 必胜（冰封时序经位置界守恒验证）
 *   · 迁移后 FR-031 全量重验（solver.js exit 0）→ Δ13 铁律恢复
 *
 * 分配算法（Sliding-Window Interleaved Grouping）:
 *   1. 飞出序切波（wave）: 每波 B ∈ {1,2,3} 个三元组分属 B 个不同花色，
 *      波内按 a b c a b c … 交错展开（组员两两序距 ≥2 → dock 花色数受控
 *      不爆槽; 波宽 W = 3B ∈ {3,6,9}，对应 Dock 同时容纳 2~3 组不同花色
 *      交替入槽——消除窗口 W 口径）
 *   2. 波内空间打散: 每花色 3 个落位用最大化两两曼哈顿距离的贪心
 *      （farthest-point 启发式）从波内候选槽位挑选——同花色滑块被推向
 *      棋盘不同角落与不同层高
 *   3. 三档递进（level-config DISPERSION_TIERS）:
 *      L1~L6 允许少量连坐（波内配对偶联）; L7~L21 双连坐 15~25%;
 *      L22~L60 三连簇 0%（打散优先级拉满 + 邻接惩罚硬约束）
 *
 * CLI: node tools/redisperse-60.js [--seed 2026] [--dry-run]
 * ========================================================= */
'use strict';

var path = require('path');
var fs = require('fs');
var RE = require(path.join(__dirname, '..', 'src', 'core', 'RulesEngine.js'));
var CFG = require(path.join(__dirname, 'level-config.js'));
var SOLVER = require(path.join(__dirname, 'solver.js'));
var G = require(path.join(__dirname, 'generator.js'));
var LEVELS = require(path.join(__dirname, '..', 'src', 'data', 'levels.js'));

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
 * ① 冰封时序位置界: 飞出序位置 i 的滑块若冰厚 x，则至 i 前须已发生
 * ≥ x 次三消。三消次数 = 已完成的三元组数（沿序列前缀的组完成计数）。
 * 候选波分案的「组起始位置」决定每个位置的三消前缀计数 M(i)。
 * ========================================================= */
function iceCapsOf(order, tiles) {
  /* caps[i] = 位置 i 处「点击该滑块前须已完成的三消组数」下界
   * （-1 = 无约束）。冰厚 x → 需 M(i) ≥ x。三消组数沿序列前缀逐位
   * 于组第 3 块后 +1——位置下界由波分案的前缀完成序列 M(i) 满足。 */
  var N = order.length;
  var caps = new Array(N + 1).fill(-1);
  for (var i = 0; i < N; i++) {
    var t = tiles[order[i]];
    if (t.m === 'i') {
      var x = t.x != null ? t.x : 1;
      var need = Math.max(0, x);
      if (need > caps[i]) caps[i] = need;
    }
  }
  return caps;
}

/* 波可行性（冰封时序判定——全局前缀口径）:
 * 交错序 a b c a b c …（组 g 的第 m 块在步 g+1+mB）→ 点击第 k 步滑块时
 * 已完成三消组数 = floor(pos/3)（此前波全完成）+ 波内完成数。
 * 波内组 g 的第 3 块在步 g+1+2B → 完成严格早于步 k ⇔ g+1+2B < k。 */
function waveGroupDone(pos, B, caps, N) {
  var base = Math.floor(pos / 3);
  for (var k = 1; k <= 3 * B; k++) {
    var idx = pos + k - 1; /* 波内第 k 步 = 0 基 tile 索引 pos+k-1 */
    if (idx >= N) return true; /* 尾波截断（理论不达——tiles%3==0 恒整波） */
    var inWave = 0;
    for (var g = 0; g < B; g++) if (g + 1 + 2 * B < k) inWave++;
    if (caps[idx] > base + inWave) return false;
  }
  return true;
}

/* =========================================================
 * ② 波次规划（需求驱动）: 波数 = max(ceil(T/3), 最大单花色组数)——
 * 多组花色每组占一个独立波（跨波铺开杜绝同波叠组）; 每波 B ∈ 1..3 个
 * 互异花色、Σ B = T、冰封位置界逐波校验（不满足降 B）。小波前置
 * （外圈空间分散）。波内交错展开（a b c a b c …）——同花色三元组
 * 两两序距 ≥ B，B≥2 时 ≥2（dock 交错天然成立）。波 = 消除窗口
 * W = 3B ∈ {3,6,9}（Dock 同时容纳 1~3 组不同花色交替入槽）。
 * ========================================================= */
function planWaves(level) {
  var tiles = level.tiles;
  var order = level.solutionMoves.map(function (m) { return m.t; });
  var caps = iceCapsOf(order, tiles);
  var N = tiles.length;
  var T = N / 3;

  /* 花色组数（结构不变量: 每花色块数 %3==0 → 组数 = 块数/3） */
  var counts = {};
  tiles.forEach(function (t) { counts[t.s] = (counts[t.s] || 0) + 1; });
  var suits = [];
  var maxG = 0;
  for (var sk in counts) { var g = counts[sk] / 3; suits.push({ suit: parseInt(sk, 10), n: g }); if (g > maxG) maxG = g; }
  suits.sort(function (a, b) { return b.n - a.n || a.suit - b.suit; });

  /* 波数 nWaves = max(ceil(T/3), maxG); B 序均衡分配后截 B ≤ 3 */
  var nWaves = Math.max(Math.ceil(T / 3), maxG);
  if (nWaves > T) nWaves = T;
  var bs = new Array(nWaves).fill(Math.floor(T / nWaves));
  var extra = T - bs.reduce(function (a, b) { return a + b; }, 0);
  for (var ei = 0; ei < extra; ei++) bs[ei % nWaves] += 1;
  var overflow = 0;
  for (var bi = 0; bi < bs.length; bi++) {
    if (bs[bi] > 3) { overflow += bs[bi] - 3; bs[bi] = 3; }
  }
  while (overflow > 0) {
    var placed = false;
    for (var bj = 0; bj < bs.length && !placed; bj++) {
      if (bs[bj] < 3) { bs[bj] += 1; overflow--; placed = true; }
    }
    if (!placed) { bs.push(1); overflow--; }
  }
  /* 小波前置（外圈空间分散——B=1 波吃外圈相邻位仅轻伤） */
  bs.sort(function (a, b) { return a - b; });

  /* 逐波: 花色取剩余组数降序前 B 个互异花色; 冰封界降 B */
  var waves = [];
  var pos = 0;
  var consumed = 0;
  var guard = 0;
  while (consumed < T && guard++ < 600) {
    var remG = T - consumed;
    var idxW = waves.length;
    var B = idxW < bs.length ? Math.min(bs[idxW], remG) : 1;
    if (B < 1) B = 1;
    while (B > 1 && !waveGroupDone(pos, B, caps, N)) B--;
    waves.push({ B: B, pos: pos });
    var take = [];
    for (var i = 0; i < suits.length && take.length < B; i++) {
      if (suits[i].n > 0) take.push(suits[i]);
    }
    take.forEach(function (g) { g.n -= 1; });
    consumed += B;
    pos += 3 * B;
  }
  if (consumed !== T) return null;
  return { waves: waves, order: order, caps: caps, T: T, suits: suits };
}

/* =========================================================
 * ③ 波内空间打散: 为 B 个花色 × 3 落位派发槽位
 * 基座交错序: 组 g（0..B-1）第 m 块（0..2）位置 k = g+1+m*B——
 * 同花色三元组内两两序距 ≥ B ≥ 1（B≥2 时 ≥2 → dock 交错天然成立）。
 * L1~L6 引导期直接交错派发（保留自然少量连坐——档位允许）;
 * L7+ 在「同列位交换」邻域内贪心最大化组内两两曼哈顿距离
 * （交换不改变位置集合/时序/dock 峰值——仅重配空间落位）。
 * ========================================================= */
function manh(a, b) {
  var d = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  return d === 0 ? 1 : d; /* 同格相邻层 = 连坐口径 */
}

function waveAssign(wave, order, tiles, suits, levelId) {
  var B = wave.B, pos = wave.pos;
  var tier = CFG.dispersionTierOf(levelId);
  var grid = []; /* grid[m][g] = 波内步序 k（1 基） */
  var m, g;
  for (m = 0; m < 3; m++) {
    grid[m] = [];
    for (g = 0; g < B; g++) grid[m][g] = g + 1 + m * B;
  }
  if (tier.from <= 6) {
    /* 引导期: 交错基座直接派发（自然连坐率——档位 tripMax ≤15% 容忍） */
  } else {
    /* 空间打散: 同列位交换贪心——重惩罚连坐（曼哈顿 ≤1 含同格塔），
     * 距离收益封顶 8（防止超远单对掩盖另一对紧挨）。 */
    function scoreOf(gr) {
      var total = 0, penalty = 0;
      for (var gg = 0; gg < B; gg++) {
        var pts = [
          tiles[order[pos + gr[0][gg] - 1]],
          tiles[order[pos + gr[1][gg] - 1]],
          tiles[order[pos + gr[2][gg] - 1]]
        ];
        for (var a = 0; a < 3; a++) {
          for (var b = a + 1; b < 3; b++) {
            var dd = manh(pts[a], pts[b]);
            total += Math.min(dd, 8);
            if (dd <= 1) penalty += 60; /* 连坐硬惩罚（同格塔/贴邻） */
            else if (dd === 2) penalty += 6; /* 距离 2 轻惩罚（8×8 优先 ≥3） */
          }
        }
      }
      return total - penalty;
    }
    var bestScore = scoreOf(grid);
    var improved = true, iter = 0;
    while (improved && iter++ < 8) {
      improved = false;
      for (m = 0; m < 3; m++) {
        for (g = 0; g < B; g++) {
          for (var j = g + 1; j < B; j++) {
            var tmp = grid[m][g]; grid[m][g] = grid[m][j]; grid[m][j] = tmp;
            var sc = scoreOf(grid);
            if (sc > bestScore + 1e-9) { bestScore = sc; improved = true; }
            else { tmp = grid[m][g]; grid[m][g] = grid[m][j]; grid[m][j] = tmp; } /* 回退 */
          }
        }
      }
    }
  }
  /* 派发: 位置 k → 花色 suits[该 k 所属组] */
  var assign = {};
  for (m = 0; m < 3; m++) {
    for (g = 0; g < B; g++) {
      assign[grid[m][g]] = suits[g];
    }
  }
  return assign; /* k（1 基波内步） → suit */
}

/* =========================================================
 * ④ 单关重打散: 滑动窗口贪心 + 配额步调（Quota-Paced Greedy）
 * 逐位置选花色（消除窗口内 2~4 组不同花色交替入槽）:
 *   · dock: D(p) = Σ(A_s%3) ≤ 6（余量 1）; 冰封: D(p) ≤ p-3x
 *   · 硬约束: 同花色相邻到达间隔 ≥2; 新组准入 D≤4
 *   · 配额步调: 花色 s 的总组数占比 = 其完成进度目标——
 *     score += k * (落后配额量)（落后者优先出场 → 大花色全程
 *     铺开、小花色穿插，杜绝「小花色挤尾连续三连」）
 *   · 空间主导: 与部分组员曼哈顿距离（连坐 -100 / d≤2 罚分）
 *   · 完成时机: D≥4 或落后配额时优先完成（腾槽 + 破冰）
 * 尾声保护: 剩余总到达 ≤12 且 >1 花色在场 → 严格轮转（间隔 =
 * 场上花色数）; 最终单花色 3 连不可避免时确保其恰为 1 组（轻伤）
 * ========================================================= */
function redisperseLevel(level, seed) {
  var tiles = level.tiles;
  var order = level.solutionMoves.map(function (m) { return m.t; });
  var N = order.length;
  /* 尾段精确重排窗口: 47/60 关 solutionMoves 尾 3 格互邻（逆向生成器
   * 结构特征——消除序靠后格位物理相邻），启发式在 D 界约束下无法交错
   * 尾段花色 → 尾 K 位改用回溯枚举（合法序列空间小，精确聚散度最优） */
  var TAIL_K = 12;

  var rem = {};
  tiles.forEach(function (t) { rem[t.s] = (rem[t.s] || 0) + 1; });
  var suitList = [];
  for (var sk in rem) suitList.push(parseInt(sk, 10));
  suitList.sort(function (a, b) { return rem[b] - rem[a] || a - b; });

  /* 冰封时序界: 点击位置 q 的冰块（冰厚 x）→ canTap 先于三消结算 →
   * 位置 q 自身到达的三消救不了自己 → 需 closed(q-1) ≥ x
   *   ⇔ D(q-1) ≤ q - 3x（closed(p) = (p+1-D(p))/3 恒等式）。
   * 初值 dbound[q-1] = min(..., q - 3·x)（约束「q-1 选择后」的 D）;
   * 后向传播 D(p) ≤ D(p+1) + 3（p→p+1 无闭环 +1 / 闭环 -2 → 回退界 +3） */
  var dbound = new Array(N + 1).fill(6);
  for (var i = 0; i < N; i++) {
    var t = tiles[order[i]];
    if (t.m === 'i') {
      var x = t.x != null ? t.x : 1;
      if (i > 0) dbound[i - 1] = Math.min(dbound[i - 1], i + 1 - 3 * x);
    }
  }
  for (var j = N - 1; j >= 0; j--) dbound[j] = Math.min(dbound[j], dbound[j + 1] + 3);

  var rng = makeRng(seed + level.id * 7919);
  var arrivals = {};
  var lastPos = {};
  var partial = {};
  var D = 0;
  var seq = new Array(N);
  var totalGroups = N / 3;
  var closed = 0; /* 已闭环三消组数（closed(p) = ((p+1) - D(p)) / 3 恒等式可交叉验证） */

  /* Δ15a 档位预算运行时追踪: 迁移期逐位维护三连簇/双连坐计数——
   * 主候选打分时对照档位配额（三连簇已超 → 硬拒近邻; 双连坐落后 → 减弱
   * 近邻罚; 双连坐超带 → 加重近邻罚）——把 solver 档位判定内嵌进分配
   * 启发式，避免「生成后才知道超配」的事后修补 */
  var tier = CFG.dispersionTierOf(level.id);
  var tripMaxN = tier.tripMaxPerLevel != null
    ? tier.tripMaxPerLevel /* 组数口径（t2: 每关 ≤1 组——百分比作报告值） */
    : Math.floor(tier.tripMax * totalGroups + 1e-9); /* t1 百分比 → 组数上限 */
  var tripDone = 0; /* 已落定的三连簇（第 3 位落位时判定: adj≥2） */
  var pairDone = 0; /* 已落定的双连坐（第 3 位落位时判定: adj==1） */
  var groupsDone = 0; /* 已闭环组数（= closed，交叉校验用） */

  /* 完成组的空间近邻记录: 第 3 位落位时把该组三块坐标收进 doneTrip ——
   * 尾段候选打分加「与已完成组同花色无关的远置偏好」需 donePairs 时再扩展 */
  var adjOfPair = function (tile, mates) { /* 候选 tile 与既有 mates（1~2 块）的连坐对数 */
    var adj = 0;
    for (var ai = 0; ai < mates.length; ai++) {
      var d = manh(tile, mates[ai]);
      if (d === 0) d = 1;
      if (d <= 1) adj++;
    }
    return adj;
  };

  /* 冰封紧急界（前向缺口递推）: 冰块 q（冰厚 x）需 closed(q-1) ≥ x
   * （canTap 先于三消结算 → q 自身到达救不了自己）。定义:
   *   need(p) = max over 冰块 q > p of max(0, x_q - (q-1-p))
   * （p 位选择后应已达的闭环组数——未来缺口随距离衰减）
   * 后向实现: 初值 need(q-1) = x_q; 递推 need(j) = max(need(j+1) - 1, 0)
   * 再与初值取 max（初值自身不衰减）。 */
  var needBefore = new Array(N + 1).fill(0);
  for (var ii = 0; ii < N; ii++) {
    var ti = tiles[order[ii]];
    if (ti.m === 'i') {
      var xi = ti.x != null ? ti.x : 1;
      if (ii > 0 && xi > needBefore[ii - 1]) needBefore[ii - 1] = xi;
    }
  }
  var carryDown = 0;
  for (var jj = N - 1; jj >= 0; jj--) {
    carryDown = Math.max(needBefore[jj + 1] - 1, 0);
    needBefore[jj] = Math.max(needBefore[jj], carryDown);
  }

  for (var p = 0; p < N - TAIL_K; p++) {
    var tile = tiles[order[p]];
    var lim = Math.min(6, dbound[p]);
    /* 冰封紧迫（前瞻梯度）: closed(p) = p 位选择后的闭环组数。
     *   u0: need(p) > closed → p 位必须闭环（只许 mod=2）
     *   u1: need(p+1) > closed → p+1 位必须闭环 → p 位须选 mod=1
     *       （p 位新开组 mod=0 最早 p+2 闭环，来不及; mod=1 → p+1 闭环 ✓） */
    var urgent0 = needBefore[p] > closed;
    var urgent1 = !urgent0 && p + 1 <= N && needBefore[p + 1] > closed;
    var remainingTotal = 0;
    var remainingSuits = 0;
    for (var ri = 0; ri < suitList.length; ri++) {
      if (rem[suitList[ri]] > 0) { remainingTotal += rem[suitList[ri]]; remainingSuits++; }
    }
    var endgame = remainingTotal <= 12 && remainingSuits > 1;
    /* 尾段混排守卫: 剩余组数 ≤ max(2, suitCount) 时提前开启跨花色混排
     * （防单花色长跑收尾——endgame 纯「剩啥用啥」是簇温床） */
    var remainingGroups = remainingTotal / 3;
    if (remainingGroups <= Math.max(2, remainingSuits) && remainingSuits > 1) endgame = true;

    var best = null, bestScore = -Infinity;
    var hasClosing = false; /* 本位存在 mod=2 候选（可闭环组） */
    for (var cs = 0; cs < suitList.length; cs++) {
      if (rem[suitList[cs]] <= 0) continue;
      if ((arrivals[suitList[cs]] || 0) % 3 === 2) { hasClosing = true; break; }
    }
    for (var ci = 0; ci < suitList.length; ci++) {
      var s = suitList[ci];
      if (rem[s] <= 0) continue;
      var a = arrivals[s] || 0;
      var mod = a % 3;
      /* 冰封紧迫: urgent0 只许 mod=2（当场闭环）; urgent1 禁 mod=0
       * （新组最早 p+2 闭环，赶不上 p+1 的需求位） */
      if (urgent0 && mod < 2) continue;
      if (urgent1 && mod < 1) continue;
      /* 边界守卫: greedy 段尾区（最后 TAIL_K+2 位）禁开新组——新组 3 块
       * 跨入枚举段时 mate 距离打分不完整（greedy 只见第 1 块，枚举只见
       * 后 2 块）→ 跨段组簇。安全开组条件: p + 2 ≤ N - TAIL_K - 1 */
      if (p > N - TAIL_K - 3 && mod === 0 && remainingSuits > 1) continue;
      var strideReq = endgame ? remainingSuits : 2;
      if (mod < 2 && lastPos[s] != null && p - lastPos[s] < Math.min(strideReq, 3)) continue;
      var dAfter = D - mod + ((mod + 1) % 3);
      /* D 硬界（含 mod=2）: 闭环后 D-2 仍须 ≤ lim（冰封时序的 D 轨迹等价式
       * closed(p) = ((p+1)-D(p))/3 → dbound 界保证未来冰块可解冻） */
      if (dAfter > lim) continue;
      var score = 0;
      /* 配额步调: 花色 s 应完成份额 = totalGroups * rem0_s / N0; 落后量 */
      var share = (rem[s] + a) / N; /* 该花色总占比 */
      var progress = a / (rem[s] + a); /* 已出场比例 */
      var target = (p + 1) / N; /* 全局进度 */
      score += (target - progress) * 60; /* 落后 → 高分（催出场） */
      if (mod === 2) {
        score += 30;
        if (D >= 4) score += 70;
      } else if (mod === 1) {
        score += 12;
      } else {
        if (D > 4) continue;
        score += 6;
      }
      var mates = partial[s];
      if (mates && mates.length) {
        var dmin = Infinity;
        for (var mi = 0; mi < mates.length; mi++) {
          var dd = manh(tile, mates[mi]);
          if (dd < dmin) dmin = dd;
        }
        var adjN = adjOfPair(tile, mates);
        /* 档位感知空间分: t3（L22+）打散优先（连坐重罚）; t2 中罚;
         * t1 引导期弱罚——空间分仍是主导项（配额步调仅微调次序） */
        var adjWeight = level.id <= 6 ? 30 : (level.id <= 21 ? 80 : 140);
        score += Math.min(dmin, 9) * 4;
        if (dmin <= 1) score -= adjWeight;
        else if (dmin === 2) score -= 15;
        /* 档位预算运行时调向:
         *   a) 三连簇超配（tripDone ≥ tripMaxN）→ 第 3 位近邻硬拒
         *   b) 双连坐落后下带 → 当选双连坐（adjN==1 且第 3 位）加分
         *   c) 双连坐超带上带 → 第 3 位近邻额外重罚 */
        if (mod === 2) { /* 本位是组的第 3 位——落位即定簇型 */
          if (tripDone >= tripMaxN && adjN >= 2) continue; /* a) 超配硬拒: 新簇禁成 */
          if (adjN === 1) { /* 将成双连坐 */
            var pairTarget = Math.max(tier.pairMin, 0.02) * totalGroups;
            if (pairDone + 1 <= pairTarget + 1e-9) score += 40; /* b) 落后加奖励 */
            else if (pairDone + 1 > tier.pairMax * totalGroups + 1e-9) score -= 60; /* c) 超带重罚 */
          }
        } else { /* 第 1/2 位: 近邻预罚（第 3 位可远离补救） */
          if (adjN >= 1 && tripDone >= tripMaxN) score -= 40; /* 超配后压近邻 */
        }
      }
      score += rng() * 2;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (best == null) {
      /* 兜底层 1: 放开间隔（保 D 与冰封）——带空间评分（与主层同分项）
       * 防堆花色: 优先完成 mod=2 组腾槽，其次远距新开组。
       * 冰封紧迫时同样只许闭环候选（urgentClose 对兜底同样生效） */
      for (var cj = 0; cj < suitList.length; cj++) {
        var s2 = suitList[cj];
        if (rem[s2] <= 0) continue;
        var a2 = arrivals[s2] || 0;
        var mod2 = a2 % 3;
        if (urgent0 && mod2 < 2) continue;
        if (urgent1 && mod2 < 1) continue;
        var dAfter2 = D - mod2 + ((mod2 + 1) % 3);
        /* D 硬界 6（非 7）: RulesEngine terminal 判 dock==7 即 lost_burst
         * （三消优先结算后 count==3 不可能存留）→ D 任何时刻 ≤6 */
        if (dAfter2 > Math.min(6, dbound[p])) continue;
        var sc2 = mod2 === 2 ? 120 : 20;
        var m2 = partial[s2];
        if (m2 && m2.length) {
          var dmin2 = Infinity;
          for (var mj = 0; mj < m2.length; mj++) {
            var dd2 = manh(tile, m2[mj]);
            if (dd2 < dmin2) dmin2 = dd2;
          }
          sc2 += Math.min(dmin2, 9) * 4;
          if (dmin2 <= 1) sc2 -= 120;
          else if (dmin2 === 2) sc2 -= 15;
        }
        sc2 += rng() * 2;
        if (sc2 > bestScore) { bestScore = sc2; best = s2; }
      }
    }
    if (best == null) {
      /* 兜底层 2: 单花色强制（间隔/上限全放开——尾部 3 连容忍） */
      for (var ck = 0; ck < suitList.length; ck++) {
        if (rem[suitList[ck]] > 0) { best = suitList[ck]; break; }
      }
    }
    if (best == null) return null;
    var am = (arrivals[best] || 0);
    var mm = am % 3;
    D = D - mm + ((mm + 1) % 3);
    arrivals[best] = am + 1;
    rem[best] -= 1;
    lastPos[best] = p;
    if (mm === 0) partial[best] = [tile];
    else partial[best].push(tile);
    if (arrivals[best] % 3 === 0) {
      /* 组闭环: 落定簇型计数（与 solver dispersionOf 同口径——adj≥2 三连簇 / adj==1 双连坐） */
      var fin = partial[best];
      if (fin.length === 3) {
        var fadj = 0;
        for (var fa = 0; fa < 3; fa++) {
          for (var fb = fa + 1; fb < 3; fb++) {
            var fd = manh(fin[fa], fin[fb]);
            if (fd === 0) fd = 1;
            if (fd <= 1) fadj++;
          }
        }
        if (fadj >= 2) tripDone++;
        else if (fadj === 1) pairDone++;
      }
      partial[best] = []; closed++; groupsDone++;
    }
    seq[p] = best;
    tiles[order[p]].s = best;
  }

  /* =========================================================
   * 尾段精确重排（tail exact re-solve）: 对最后 TAIL_K 位回溯枚举
   * 全部合法花色序列——约束: 花色计数守恒（rem 全清）、D ≤ min(6, dbound)
   * （闭环合法）、冰封需求（needBefore 覆盖——urgent 化硬过滤）。
   * 打分: trip 超配即废解（-400/簇）; pair 向带内靠; 空间距离收益。
   * 性能: 单状态回溯（修改-恢复，零深拷贝）+ 节点上限 20k →
   * 超限回退 greedy 续跑（下方续跑循环仅处理未覆盖位）。
   * ========================================================= */
  (function tailSolve() {
    var K = Math.min(TAIL_K, N);
    var start = N - K;
    if (start < 0) return;
    var nodes = 0;
    var NODES_CAP = 20000;
    var bestSeq = null, bestScore = -Infinity;
    var curSeq = new Array(K);
    var cRem = {}, cArr = {}, cLast = {}, cPart = {};
    for (var ts = 0; ts < suitList.length; ts++) {
      var sk2 = suitList[ts];
      cRem[sk2] = rem[sk2] || 0;
      cArr[sk2] = arrivals[sk2] || 0;
      cLast[sk2] = lastPos[sk2] != null ? lastPos[sk2] : -99;
      cPart[sk2] = (partial[sk2] && partial[sk2].length) ? partial[sk2].slice() : null;
    }
    var cD = D;
    var cTrip = 0, cPair = 0, cClosedG = 0, cDSum = 0;

    function rec(k) {
      if (nodes++ > NODES_CAP) return;
      if (k === K) {
        for (var rs = 0; rs < suitList.length; rs++) {
          if (cRem[suitList[rs]] > 0) return; /* 计数守恒失败 */
        }
        /* 档位直达打分（与 solver dispersionOf 同口径）:
         * tierOk → 巨额 bonus + 距离收益 tiebreak（同档位内择远）;
         * 非达标 → 代理分（trip 超配大罚 / pair 向带 / 距离收益）
         * ——代理分曾使「trip=0 但 pair 超带」的高距解压过达标解，故直达 */
        var tripAll = tripDone + cTrip;
        var pairAll = pairDone + cPair;
        var dispAll = totalGroups - tripAll - pairAll;
        var okTripL = tier.tripMaxPerLevel != null
          ? tripAll <= tier.tripMaxPerLevel
          : tripAll / totalGroups <= tier.tripMax + 1e-9;
        var okPairL = pairAll / totalGroups >= tier.pairMin - 1e-9 &&
          pairAll / totalGroups <= tier.pairMax + 1e-9;
        var okDistL = totalGroups === 0 ||
          dispAll / totalGroups >= 1 - tier.tripMax - tier.pairMax - 1e-9;
        var sc;
        if (okTripL && okPairL && okDistL) {
          sc = 100000 + cDSum * 3;
        } else {
          sc = 1000 - tripAll * 400;
          var pairTarget = Math.max(tier.pairMin, 0.02) * totalGroups;
          if (pairAll < pairTarget) sc -= (pairTarget - pairAll) * 30;
          else if (pairAll > tier.pairMax * totalGroups) sc -= (pairAll - tier.pairMax * totalGroups) * 30;
          sc += cDSum * 3;
        }
        if (sc > bestScore) { bestScore = sc; bestSeq = curSeq.slice(); }
        return;
      }
      var pp = start + k;
      var tile = tiles[order[pp]];
      var closedNow = closed + cClosedG;
      var urgent0 = needBefore[pp] > closedNow;
      for (var ci = 0; ci < suitList.length; ci++) {
        var s = suitList[ci];
        if (cRem[s] <= 0) continue;
        var a = cArr[s];
        var mod = a % 3;
        if (urgent0 && mod < 2) continue;
        if (mod < 2 && pp - cLast[s] < 2) continue; /* 同花色相邻位间隔 ≥2 */
        var dAfter = cD - mod + ((mod + 1) % 3);
        if (dAfter > Math.min(6, dbound[pp])) continue;
        /* D 上界前瞻: 剩余块数每 3 块一闭环可回落 2——粗剪 */
        var remBlocks = (K - k - 1);
        var maxFall = 2 * Math.floor(remBlocks / 3);
        if (dAfter - maxFall > 6) continue;
        /* 应用（单状态——直接改，递归后回滚） */
        var mates = mod === 0 ? null : (cPart[s] || []);
        var dGain = 0;
        if (mates && mates.length) {
          var dmin = Infinity;
          for (var mm = 0; mm < mates.length; mm++) {
            var dd = manh(tile, mates[mm]);
            if (dd < dmin) dmin = dd;
          }
          dGain = Math.min(dmin, 9);
        }
        var wasPart = cPart[s];
        var newTrip = 0, newPair = 0, newClosed = 0;
        if (mod === 0) cPart[s] = [tile];
        else {
          cPart[s] = (cPart[s] || []).concat(tile);
          if ((a + 1) % 3 === 0) { /* 闭环 → 定簇型 */
            var fin = cPart[s];
            var fadj = 0;
            for (var fa = 0; fa < 3; fa++) {
              for (var fb = fa + 1; fb < 3; fb++) {
                var fd = manh(fin[fa], fin[fb]);
                if (fd === 0) fd = 1;
                if (fd <= 1) fadj++;
              }
            }
            if (fadj >= 2) newTrip = 1;
            else if (fadj === 1) newPair = 1;
            newClosed = 1;
            cPart[s] = [];
          }
        }
        var prevD = cD, prevRem = cRem[s], prevArr = cArr[s], prevLast = cLast[s];
        cD = dAfter; cRem[s] = prevRem - 1; cArr[s] = a + 1; cLast[s] = pp;
        cTrip += newTrip; cPair += newPair; cClosedG += newClosed; cDSum += dGain;
        curSeq[k] = s;
        rec(k + 1);
        /* 回滚 */
        cD = prevD; cRem[s] = prevRem; cArr[s] = prevArr; cLast[s] = prevLast;
        cTrip -= newTrip; cPair -= newPair; cClosedG -= newClosed; cDSum -= dGain;
        cPart[s] = wasPart;
        if (nodes > NODES_CAP) return;
      }
    }
    rec(0);
    if (bestSeq == null) return; /* 枚举失败 → 下方 greedy 续跑兜底 */
    /* 应用最优尾段（重放主循环等价效应） */
    for (var ap = 0; ap < K; ap++) {
      var sA = bestSeq[ap];
      var tileA = tiles[order[start + ap]];
      var am = (arrivals[sA] || 0);
      var mm = am % 3;
      D = D - mm + ((mm + 1) % 3);
      arrivals[sA] = am + 1;
      rem[sA] -= 1;
      lastPos[sA] = start + ap;
      if (mm === 0) partial[sA] = [tileA];
      else partial[sA].push(tileA);
      if (arrivals[sA] % 3 === 0) {
        var finA = partial[sA];
        if (finA.length === 3) {
          var fadjA = 0;
          for (var faA = 0; faA < 3; faA++) {
            for (var fbA = faA + 1; fbA < 3; fbA++) {
              var fdA = manh(finA[faA], finA[fbA]);
              if (fdA === 0) fdA = 1;
              if (fdA <= 1) fadjA++;
            }
          }
          if (fadjA >= 2) tripDone++;
          else if (fadjA === 1) pairDone++;
        }
        partial[sA] = []; closed++; groupsDone++;
      }
      seq[start + ap] = sA;
      tiles[order[start + ap]].s = sA;
    }
  })();

  /* 尾段 greedy 续跑（枚举失败时回退）: 主循环未跑的尾 K 位 */
  for (var p2 = Math.max(0, N - TAIL_K); p2 < N; p2++) {
    if (seq[p2] != null) continue; /* 已被精确重排覆盖 */
    var tile2 = tiles[order[p2]];
    var lim2 = Math.min(6, dbound[p2]);
    var urgent0b = needBefore[p2] > closed;
    var urgent1b = !urgent0b && p2 + 1 <= N && needBefore[p2 + 1] > closed;
    var best2 = null, bestScore2 = -Infinity;
    for (var c2 = 0; c2 < suitList.length; c2++) {
      var s2g = suitList[c2];
      if (rem[s2g] <= 0) continue;
      var a2g = arrivals[s2g] || 0;
      var mod2g = a2g % 3;
      if (urgent0b && mod2g < 2) continue;
      if (urgent1b && mod2g < 1) continue;
      var dAfter2g = D - mod2g + ((mod2g + 1) % 3);
      if (dAfter2g > lim2) continue;
      var sc2g = mod2g === 2 ? 120 : 20;
      var m2g = partial[s2g];
      if (m2g && m2g.length) {
        var dmin2g = Infinity;
        for (var mj2 = 0; mj2 < m2g.length; mj2++) {
          var dd2g = manh(tile2, m2g[mj2]);
          if (dd2g < dmin2g) dmin2g = dd2g;
        }
        sc2g += Math.min(dmin2g, 9) * 4;
        if (dmin2g <= 1) sc2g -= 120;
        else if (dmin2g === 2) sc2g -= 15;
      }
      sc2g += rng() * 2;
      if (sc2g > bestScore2) { bestScore2 = sc2g; best2 = s2g; }
    }
    if (best2 == null) {
      for (var c3 = 0; c3 < suitList.length; c3++) {
        if (rem[suitList[c3]] > 0) { best2 = suitList[c3]; break; }
      }
    }
    if (best2 == null) return null;
    var am2 = (arrivals[best2] || 0);
    var mm2 = am2 % 3;
    D = D - mm2 + ((mm2 + 1) % 3);
    arrivals[best2] = am2 + 1;
    rem[best2] -= 1;
    lastPos[best2] = p2;
    if (mm2 === 0) partial[best2] = [tile2];
    else partial[best2].push(tile2);
    if (arrivals[best2] % 3 === 0) {
      var fin2 = partial[best2];
      if (fin2.length === 3) {
        var fadj2 = 0;
        for (var fa2 = 0; fa2 < 3; fa2++) {
          for (var fb2 = fa2 + 1; fb2 < 3; fb2++) {
            var fd2 = manh(fin2[fa2], fin2[fb2]);
            if (fd2 === 0) fd2 = 1;
            if (fd2 <= 1) fadj2++;
          }
        }
        if (fadj2 >= 2) tripDone++;
        else if (fadj2 === 1) pairDone++;
      }
      partial[best2] = []; closed++; groupsDone++;
    }
    seq[p2] = best2;
    tiles[order[p2]].s = best2;
  }
  return { level: level, seq: seq };
}

/* =========================================================
 * ⑥ CLI main: node tools/redisperse-60.js [--seed 2026] [--seeds N] [--dry-run]
 * 流程（FR-029 受控让位条款 + FR-031 门禁闭环）:
 *   1. 逐关 seed 扫描（1..seedsN）: redisperse → dispersionOf 档位判定
 *      → RE 回放必胜验收（solutionMoves 原序列 100% 有效）
 *   2. 全 seed 无达标 → 取分项最优（trip/pair/dist 三项满足数最大者）
 *   3. 全 60 关 metrics 经 SOLVER.solveLevel 重算（dockPeak/openSuits/
 *      solutionCount 随新花色变化; minMoves 结构性 = tiles.length 不变）
 *   4. writeLevelsJs 写盘（generator 同款序列化）→ 交付 node tools/solver.js 全量门禁
 * ========================================================= */
function main() {
  var seed = 2026;
  var seedsN = 200; /* Δ15a: 200 种子扫描——L40 类边界关在 >60 种子后才出现达标解 */
  var dryRun = false;
  var args = process.argv.slice(2);
  for (var a = 0; a < args.length; a++) {
    if (args[a] === '--seed' && args[a + 1]) seed = parseInt(args[a + 1], 10);
    if (args[a] === '--seeds' && args[a + 1]) seedsN = parseInt(args[a + 1], 10);
    if (args[a] === '--dry-run') dryRun = true;
  }

  var t0 = Date.now();
  var out = [];
  var subOptimal = [];
  console.log('redisperse-60: seed=' + seed + ' seeds=' + seedsN + ' levels=60');

  for (var i = 0; i < LEVELS.length; i++) {
    var proto = LEVELS[i];
    var picked = null;
    var bestFallback = null;
    for (var sd = 0; sd < seedsN; sd++) {
      var L = JSON.parse(JSON.stringify(proto));
      var r = redisperseLevel(L, seed + sd);
      if (!r) continue;
      var d = SOLVER.dispersionOf(L);
      var score = (d.tierOkTrip ? 2 : 0) + (d.tierOkPair ? 1 : 0) + (d.tierOkDist ? 1 : 0);
      if (d.tierOk) { picked = { L: L, seed: seed + sd }; break; }
      if (!bestFallback || score > bestFallback.score) bestFallback = { L: L, seed: seed + sd, score: score, d: d };
    }
    var chosen = picked || bestFallback;
    if (!chosen) { console.error('  ✗ L' + proto.id + ' redisperse 彻底失败'); process.exit(1); }

    /* RE 回放必胜验收（solutionMoves 原序列——射线拓扑与 D 轨迹无关花色） */
    var st = RE.init(chosen.L);
    var ok = true;
    for (var sv = 0; sv < chosen.L.solutionMoves.length; sv++) {
      var mv = chosen.L.solutionMoves[sv];
      var rr = RE.applyTap(st, mv.t);
      if (rr.type === 'invalid' || rr.type === 'blocked') { ok = false; break; }
    }
    if (!ok || RE.terminal(st) !== 'won') {
      console.error('  ✗ L' + proto.id + ' (seed ' + chosen.seed + ') 回放未胜——候选拒绝');
      process.exit(1);
    }
    if (!picked) subOptimal.push('L' + proto.id + '(seed' + chosen.seed + ' ' +
      (bestFallback.d.tierOkTrip ? '' : 'trip' + bestFallback.d.triplePct + '% ') +
      (bestFallback.d.tierOkPair ? '' : 'pair' + bestFallback.d.pairPct + '% ') +
      (bestFallback.d.tierOkDist ? '' : 'disp' + bestFallback.d.dispersedPct + '%') + ')');
    out.push(chosen.L);
    process.stdout.write('  ✓ L' + proto.id + (picked ? '' : ' [suboptimal]') + '\n');
  }

  /* metrics 重算: solveLevel 逐关（新花色 → dockPeak/openSuits/solutionCount 更新） */
  console.log('metrics 重算（solveLevel × 60）…');
  var domains = { minMoves: [Infinity, -Infinity], solutionCount: [Infinity, -Infinity], dockPeak: [Infinity, -Infinity], tiles: [Infinity, -Infinity], suits: [Infinity, -Infinity] };
  for (var m = 0; m < out.length; m++) {
    var Lv = out[m];
    var sol = SOLVER.solveLevel(Lv, { budget: CFG.BUDGET, hintUpper: Lv.solutionMoves.length, hintPath: Lv.solutionMoves });
    if (!sol.solvable) { console.error('  ✗ L' + Lv.id + ' 重派后不可解——门禁失败'); process.exit(1); }
    Lv.metrics.minMoves = sol.minMoves;
    Lv.metrics.dockPeak = sol.dockPeak;
    Lv.metrics.openSuitsMax = sol.openSuitsMax;
    Lv.metrics.solutionCount = sol.solutionCount;
    var sc = typeof sol.solutionCount === 'number' ? sol.solutionCount : 10000;
    domains.minMoves[0] = Math.min(domains.minMoves[0], sol.minMoves);
    domains.minMoves[1] = Math.max(domains.minMoves[1], sol.minMoves);
    domains.solutionCount[0] = Math.min(domains.solutionCount[0], sc);
    domains.solutionCount[1] = Math.max(domains.solutionCount[1], sc);
    domains.dockPeak[0] = Math.min(domains.dockPeak[0], sol.dockPeak);
    domains.dockPeak[1] = Math.max(domains.dockPeak[1], sol.dockPeak);
    var tilesN = Lv.tiles.length;
    domains.tiles[0] = Math.min(domains.tiles[0], tilesN);
    domains.tiles[1] = Math.max(domains.tiles[1], tilesN);
    var suitSet = {};
    for (var sj = 0; sj < tilesN; sj++) suitSet[Lv.tiles[sj].s] = true;
    var suitsN = 0;
    for (var sk in suitSet) suitsN++;
    Lv.metrics.suits = suitsN; /* 现地花色数（difficultyScore 参数） */
    domains.suits[0] = Math.min(domains.suits[0], suitsN);
    domains.suits[1] = Math.max(domains.suits[1], suitsN);
    process.stdout.write('  ✓ L' + Lv.id + ' metrics: dockPeak=' + sol.dockPeak + ' openSuits=' + sol.openSuitsMax + '\n');
  }
  /* difficultyScore 全域归一（与 generator.main 同口径） */
  for (var q = 0; q < out.length; q++) {
    var Lq = out[q];
    var mech = SOLVER.mechCountOf(Lq);
    Lq.metrics.mechCount = mech;
    Lq.metrics.difficultyScore = SOLVER.difficultyScoreOf({
      minMoves: Lq.metrics.minMoves,
      solutionCount: typeof Lq.metrics.solutionCount === 'number' ? Lq.metrics.solutionCount : 10000,
      dockPeak: Lq.metrics.dockPeak,
      mechCount: mech
    }, domains, Lq.metrics.suits, Lq.tiles.length);
  }

  if (subOptimal.length) {
    console.log('⚠ 未全达标档位（分项最优降级）: ' + subOptimal.join(' '));
  }
  if (dryRun) { console.log('dry-run: 60 关重派成功（不写盘）耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'); return; }

  G.writeLevelsJs(out, path.join(__dirname, '..', 'src', 'data', 'levels.js'), seed, {
    attribution: 'tools/redisperse-60.js 花色重打散（Δ15a T052h——tiles 坐标/机制/prisms/solutionMoves 100% 保留, 仅 tiles[].s 重派 + metrics 重算）'
  });
  console.log('导出 → src/data/levels.js（60 关，' + (subOptimal.length ? 'suboptimal ' + subOptimal.length : '全档位达标') + '）耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('下一步: node tools/solver.js（FR-031 全量门禁重验）');
}

if (require.main === module) main();

module.exports = {
  makeRng: makeRng,
  iceCapsOf: iceCapsOf,
  waveGroupDone: waveGroupDone,
  planWaves: planWaves,
  waveAssign: waveAssign,
  redisperseLevel: redisperseLevel,
  manh: manh,
  main: main
};

