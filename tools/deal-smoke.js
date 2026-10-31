/* =========================================================
 * Slide & Triple — deal-smoke（FR-052 / SC-018 开局进场编舞冒烟）
 *
 *   node tools/deal-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 口径：**Δ22c 最初实现的 15 种进场编舞**（提交 6aab674 原样移植）：
 *   delay = LEAD 180 + ord × SPREAD 340 + z × 55，单卡 TILE 260。
 * 覆盖：
 *   ① 常量收口：LEAD 180 / SPREAD 340 / Z_STEP 55 / TILE 260 / TICK_AT 0.85，
 *      15 个模式名唯一；R5/R6「垂直雨幕」口径常量**全部退役且不得再导出**
 *   ② introSpecOf 纯函数：ord ∈ [0,1]、偏移/缩放/透明度有限且在窗口内、
 *      15 种规格两两不同、逐模式的方向/顺序语义抽样成立
 *   ③ 时序公式：delay = LEAD + ord·SPREAD + z·Z_STEP；层序锁恒 +Z_STEP；
 *      totalMs = maxDelay + TILE
 *   ④ 运行时 plan：覆盖全部卡牌、字段齐备、与纯函数同源、模式确定性
 *   ⑤ 帧闸门：startDeal 只置 armed，第 2 个**已绘制**帧才写 startTime，
 *      draw() 抛异常那帧不计数；遮挡期复位且不静置（R6 看门狗）
 *   ⑥ 逐帧姿态：起点隐形 → 位移/缩放收敛 → p>=1 归 null（静态精确坐标）
 *   ⑦ 逐牌落子涟漪音（一次一张、progress 单调）
 *   ⑧ 点击快进：闸门期与动画期两条路径均零悬挂
 *   ⑨ 模式抽取：相邻不重复 / 调试锁定 / 越界夹取
 *   ⑩ prefers-reduced-motion 降级：零位移零缩放、时长不变
 *   ⑪ 纯表现层：tiles / board / tileRect 三份数据前后逐字段一致
 * ========================================================= */
'use strict';

var RE = require('../src/core/RulesEngine.js');
globalThis.STM = globalThis.STM || {};
globalThis.STM.RulesEngine = RE;
require('../src/core/GameState.js');
require('../src/core/profile.js');
require('../src/render/bestiary.js');
require('../src/render/backdrops.js');
require('../src/data/icon-bboxes.js');
require('../src/render/BoardRenderer.js');
var STM = globalThis.STM;

/* ---------- localStorage 内存桩 ---------- */
var mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};

/* ---------- 时钟 / rAF / DOM 桩 ---------- */
var clockNow = 0;
globalThis.performance = { now: function () { return clockNow; } };
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = function () {};
var rafQ = [];
globalThis.requestAnimationFrame = function (cb) { rafQ.push(cb); return rafQ.length; };
function pumpFrames(n) {
  for (var i = 0; i < n; i++) {
    var q = rafQ.splice(0, rafQ.length);
    if (!q.length) break;
    clockNow += 16;
    for (var j = 0; j < q.length; j++) q[j](clockNow);
  }
}

function finite(v, op) {
  if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(op + ': non-finite ' + v);
}
function makeCtx() {
  return {
    createLinearGradient: function (a, b, c, d) { finite(a, 'g'); finite(b, 'g'); finite(c, 'g'); finite(d, 'g'); return { addColorStop: function () {} }; },
    createRadialGradient: function (a, b, c, d, e, f) { [a, b, c, d, e, f].forEach(function (v) { finite(v, 'rg'); }); return { addColorStop: function () {} }; },
    moveTo: function (x, y) { finite(x, 'moveTo'); finite(y, 'moveTo'); },
    lineTo: function (x, y) { finite(x, 'lineTo'); finite(y, 'lineTo'); },
    arc: function (x, y, r) { finite(x, 'arc'); finite(y, 'arc'); finite(r, 'arc'); },
    arcTo: function (a, b, c, d, e) { [a, b, c, d, e].forEach(function (v) { finite(v, 'arcTo'); }); },
    ellipse: function (a, b, c, d) { [a, b, c, d].forEach(function (v) { finite(v, 'ellipse'); }); },
    quadraticCurveTo: function (a, b, c, d) { [a, b, c, d].forEach(function (v) { finite(v, 'quad'); }); },
    bezierCurveTo: function (a, b, c, d, e, f) { [a, b, c, d, e, f].forEach(function (v) { finite(v, 'bezier'); }); },
    fillRect: function (a, b, c, d) { [a, b, c, d].forEach(function (v) { finite(v, 'fillRect'); }); },
    strokeRect: function (a, b, c, d) { [a, b, c, d].forEach(function (v) { finite(v, 'strokeRect'); }); },
    fillText: function (s, x, y) { finite(x, 'fillText'); finite(y, 'fillText'); },
    clearRect: function () {}, beginPath: function () {}, closePath: function () {},
    fill: function () {}, stroke: function () {}, save: function () {}, restore: function () {},
    translate: function () {}, rotate: function () {}, scale: function () {}, drawImage: function () {},
    clip: function () {}, rect: function () {}, setLineDash: function () {}
  };
}
function makeCanvas() {
  return {
    clientWidth: 320, parentElement: { clientWidth: 320 }, width: 0, height: 0,
    getContext: function () { return makeCtx(); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 320, height: 320 }; }
  };
}

var fails = [];
function check(name, ok, extra) {
  if (ok) console.log('  ✓ ' + name);
  else { fails.push(name); console.log('  ✗ ' + name + (extra == null ? '' : '  [' + extra + ']')); }
}

/* ---------- 关卡：直接取真实关卡（8×8 满载 + 多层，最坏形态） ---------- */
var LEVELS = require('../src/data/levels.js');
function buildLevel() {
  /* 取 72 关中体量最大的一关（由 solver 门禁背书，避免自造关卡破坏 validateLevel 契约） */
  var best = LEVELS[0];
  for (var i = 0; i < LEVELS.length; i++) {
    if ((LEVELS[i].tiles || []).length > (best.tiles || []).length) best = LEVELS[i];
  }
  return best;
}

var RT = STM.rendererTest;
var I = RT.INTRO;
var fsD = require('fs');
var rootD = __dirname + '/..';
var brSrcD = fsD.readFileSync(rootD + '/src/render/BoardRenderer.js', 'utf8');
var mainSrcD = fsD.readFileSync(rootD + '/src/main.js', 'utf8');

console.log('FR-052 开局进场编舞冒烟（15 种编舞 · 原始口径 / 帧闸门 / 落子音）\n');

/* ---------- ① 常量与退役面 ---------- */
console.log('① 常量收口（Δ22c 原始口径）');
check('LEAD 180 / SPREAD 340 / Z_STEP 55 / TILE 260 / TICK_AT 0.85',
  !!I && I.LEAD_MS === 180 && I.SPREAD_MS === 340 && I.Z_STEP_MS === 55 &&
  I.TILE_MS === 260 && I.TICK_AT === 0.85,
  I ? [I.LEAD_MS, I.SPREAD_MS, I.Z_STEP_MS, I.TILE_MS, I.TICK_AT].join('/') : 'null');
check('15 个模式名齐备且互不相同', (function () {
  var m = I && I.MODES;
  if (!m || m.length !== 15) return false;
  var seen = {};
  for (var i = 0; i < m.length; i++) {
    if (typeof m[i] !== 'string' || !m[i]) return false;
    if (seen[m[i]]) return false;
    seen[m[i]] = true;
  }
  return true;
})(), I && I.MODES ? I.MODES.length : 'n/a');
check('模式号 0..14 覆盖「对角瀑布 / 中心涟漪 / 外环聚拢 / 螺旋 / 双翼 / 天降 / 层叠 / 拉链 / 风车 / V 阵 / 棋盘 / 百叶 / 发牌 / 顺风 / 星雨」',
  I.MODES[0] === 'diagonal_cascade' && I.MODES[1] === 'center_ripple' &&
  I.MODES[2] === 'outer_converge' && I.MODES[3] === 'spiral_vortex' &&
  I.MODES[4] === 'wings_clasp' && I.MODES[5] === 'sky_rain' &&
  I.MODES[6] === 'layer_stack' && I.MODES[7] === 'zipper_interleave' &&
  I.MODES[8] === 'windmill_quadrants' && I.MODES[9] === 'v_formation' &&
  I.MODES[10] === 'checkerboard_weave' && I.MODES[11] === 'blinds_flip' &&
  I.MODES[12] === 'deck_deal' && I.MODES[13] === 'tailwind_glide' &&
  I.MODES[14] === 'starlight_scatter');
check('帧闸门 2 帧保留（R6 未随编舞回退而丢失）', I.GATE_FRAMES === 2);
check('看门狗 1200ms 复查 + 8000ms 总预算（开局 MUST NOT 卡死）',
  I.GATE_WATCHDOG_MS === 1200 && I.GATE_WATCHDOG_MAX_MS === 8000);
check('R5/R6「垂直雨幕」口径常量全部退役（不得再导出）',
  I.IMPACT_AT === undefined && I.FALL_CELL === undefined &&
  I.FALL_CELL_MIN === undefined && I.FALL_CELL_MAX === undefined &&
  I.SQUASH_PX === undefined && I.DAMP === undefined && I.COL_STEP === undefined &&
  I.ROW_STEP_MIN === undefined && I.ROW_STEP_MAX === undefined &&
  I.TARGET_MS === undefined && I.ROW_SPAN_MIN === undefined &&
  I.COL_STEP_FLOOR === undefined && I.Z_STEP_FLOOR === undefined);
check('对应纯函数同步退役（只删实现不删导出 = 门禁读旧值）',
  RT.introFallEase === undefined && RT.introSquashOf === undefined &&
  RT.introPoseOf === undefined && RT.introStepsOf === undefined &&
  RT.introDelayOf === undefined && RT.introDealTotalMs === undefined &&
  RT.introRowStepOf === undefined);
check('原始纯函数齐备（introSpecOf / introEaseOf / introDist01 / INTRO_MODES）',
  typeof RT.introSpecOf === 'function' && typeof RT.introEaseOf === 'function' &&
  typeof RT.introDist01 === 'function' && Array.isArray(RT.INTRO_MODES));
check('缓动三支在 p=0 归零、p=1 归一（cubic / quart / back）', (function () {
  var kinds = ['cubic', 'quart', 'back'];
  for (var i = 0; i < kinds.length; i++) {
    if (Math.abs(RT.introEaseOf(kinds[i], 0)) > 1e-12) return false;
    if (Math.abs(RT.introEaseOf(kinds[i], 1) - 1) > 1e-12) return false;
  }
  return true;
})());

/* ---------- ② introSpecOf 纯函数 ---------- */
console.log('\n② introSpecOf 纯函数（15 种规格 · 窗口 · 两两不同）');
var nS = 8;
var sample = [];
for (var sr = 0; sr < nS; sr++) {
  for (var sc = 0; sc < nS; sc++) {
    sample.push({ id: sr * nS + sc, r: sr, c: sc, z: 0, d: (sr + sc) % 4 });
  }
}
/* 层叠样本（z 1..4 同坐标，验层序锁与 layer_stack） */
for (var sz = 1; sz <= 4; sz++) sample.push({ id: 900 + sz, r: 3, c: 4, z: sz, d: 0 });
var totalS = sample.length;

var ordOk = true, offOk = true, scaleOk = true, a0Ok = true, easeOk = true;
var offMax = 0, sxMin = 1e9, sxMax = -1e9, syMin = 1e9, syMax = -1e9, a0Max = -1;
var sigs = {};
for (var mo = 0; mo < 15; mo++) {
  var sig = [];
  for (var si = 0; si < sample.length; si++) {
    var sp = RT.introSpecOf(mo, sample[si], nS, si, totalS);
    if (!sp || typeof sp !== 'object') { ordOk = false; continue; }
    if (!(isFinite(sp.ord) && sp.ord >= 0 && sp.ord <= 1)) ordOk = false;
    if (!(isFinite(sp.ox) && isFinite(sp.oy) && isFinite(sp.oxc) && isFinite(sp.oyc))) offOk = false;
    var om = Math.max(Math.abs(sp.ox), Math.abs(sp.oy));
    if (om > offMax) offMax = om;
    if (!(sp.sx > 0 && sp.sx <= 1.2 && sp.sy > 0 && sp.sy <= 1.2)) scaleOk = false;
    if (sp.sx < sxMin) sxMin = sp.sx;
    if (sp.sx > sxMax) sxMax = sp.sx;
    if (sp.sy < syMin) syMin = sp.sy;
    if (sp.sy > syMax) syMax = sp.sy;
    if (!(sp.a0 >= 0 && sp.a0 < 1)) a0Ok = false;
    if (sp.a0 > a0Max) a0Max = sp.a0;
    if (sp.ease !== 'cubic' && sp.ease !== 'quart' && sp.ease !== 'back') easeOk = false;
    sig.push([sp.ord.toFixed(4), sp.ox.toFixed(2), sp.oy.toFixed(2),
      sp.oxc.toFixed(3), sp.oyc.toFixed(3), sp.sx.toFixed(3), sp.sy.toFixed(3),
      sp.a0.toFixed(3), sp.ease].join(','));
  }
  sigs[sig.join('|')] = (sigs[sig.join('|')] || 0) + 1;
}
check('15 模式 × 69 采样：ord 有限且 ∈ [0,1]', ordOk);
check('位移分量全部有限（无 NaN 流入 drawTileBody）', offOk);
check('像素偏移上限 <= 140px（「跨屏乱飞」的结构性排除）', offMax <= 140, 'max=' + offMax);
check('缩放 ∈ (0, 1.2]（不下探到 0、不放大到糊图）', scaleOk,
  'sx=[' + sxMin + ',' + sxMax + '] sy=[' + syMin + ',' + syMax + ']');
check('起点透明度 a0 ∈ [0, 1)（0 = 从透明淡入）', a0Ok, 'max=' + a0Max);
check('缓动种类只取 cubic / quart / back（无 elastic / spring 拖尾）', easeOk);
check('15 种规格两两不同（签名去重后仍为 15 组）',
  Object.keys(sigs).length === 15, Object.keys(sigs).length + ' groups');

/* 逐模式语义抽样 */
function ordOf(m, r, c) { return RT.introSpecOf(m, { id: r * 8 + c, r: r, c: c, z: 0, d: 0 }, 8, r * 8 + c, 64); }
check('模式 0 diagonal_cascade：ord 沿 r+c 单调不减、纵向 -45px 恒定', (function () {
  var prev = -1;
  for (var d = 0; d <= 14; d++) {
    var rr = Math.min(7, d), cc = d - rr;
    var s = ordOf(0, rr, cc);
    if (s.ord < prev - 1e-9) return false;
    if (Math.abs(s.oy + 45) > 1e-9 || s.ox !== 0) return false;
    prev = s.ord;
  }
  return true;
})());
check('模式 1 center_ripple：中心最先、四角最后（涟漪由内向外）', (function () {
  var mid = ordOf(1, 3, 3).ord, corner = ordOf(1, 0, 0).ord, edge = ordOf(1, 0, 3).ord;
  return mid < edge && edge < corner && mid < 0.2 && Math.abs(corner - 1) < 1e-9;
})());
check('模式 2 outer_converge：四角先、中心最后（外环聚拢）', (function () {
  return Math.abs(ordOf(2, 0, 0).ord) < 1e-9 &&
    ordOf(2, 0, 0).ord < ordOf(2, 0, 3).ord && ordOf(2, 3, 3).ord > 0.85;
})());
check('模式 4 wings_clasp：左半自左（ox<0）、右半自右（ox>0）', (function () {
  return ordOf(4, 3, 0).ox < 0 && ordOf(4, 3, 7).ox > 0 &&
    Math.abs(ordOf(4, 3, 0).ox) === 120 && Math.abs(ordOf(4, 3, 7).ox) === 120;
})());
check('模式 7 zipper_interleave：偶数行自左、奇数行自右（交错拉链）', (function () {
  return ordOf(7, 0, 3).ox < 0 && ordOf(7, 1, 3).ox > 0 &&
    ordOf(7, 2, 3).ox < 0 && ordOf(7, 3, 3).ox > 0;
})());
check('模式 11 blinds_flip：sx = 0.05（百叶窗横向展开）、ord 随列单调', (function () {
  var prev = -1;
  for (var c = 0; c < 8; c++) {
    var s = ordOf(11, 2, c);
    if (Math.abs(s.sx - 0.05) > 1e-9 || s.sy !== 1) return false;
    if (s.ord < prev - 1e-9) return false;
    prev = s.ord;
  }
  return true;
})());
check('模式 12 deck_deal：起点为棋盘中心（oxc/oyc 非零）、ord 随发牌序单调', (function () {
  var s = RT.introSpecOf(12, { id: 5, r: 2, c: 6, z: 0, d: 0 }, 8, 5, 20);
  var s2 = RT.introSpecOf(12, { id: 5, r: 2, c: 6, z: 0, d: 0 }, 8, 15, 20);
  return Math.abs(s.oxc - (3.5 - 6)) < 1e-9 && Math.abs(s.oyc - (3.5 - 2)) < 1e-9 &&
    s.ord < s2.ord;
})());
check('模式 13 tailwind_glide：四种箭头各自给出「逆箭头方向」的滑入位移', (function () {
  function d4(dv) { return RT.introSpecOf(13, { id: 1, r: 3, c: 3, z: 0, d: dv }, 8, 0, 1); }
  return d4(1).ox === -55 && d4(3).ox === 55 && d4(0).oy === 55 && d4(2).oy === -55;
})());
check('模式 14 starlight_scatter：ord 由 id 伪随机且覆盖全域（min≈0 / max≈1）', (function () {
  var mn = 1e9, mx = -1e9;
  for (var i = 0; i < 64; i++) {
    var o = RT.introSpecOf(14, { id: i, r: 3, c: 3, z: 0, d: 0 }, 8, 0, 64).ord;
    if (o < mn) mn = o;
    if (o > mx) mx = o;
  }
  return mn <= 0.02 && mx >= 0.98;
})());

/* ---------- ③ 时序公式 ---------- */
console.log('\n③ 时序公式（delay = LEAD + ord·SPREAD + z·Z_STEP）');
var leadOk = true, capOk = true;
var dMin = 1e9, dMax = -1e9;
for (var m3 = 0; m3 < 15; m3++) {
  for (var i3 = 0; i3 < sample.length; i3++) {
    var s3 = RT.introSpecOf(m3, sample[i3], nS, i3, totalS);
    var want3 = I.LEAD_MS + s3.ord * I.SPREAD_MS + (sample[i3].z || 0) * I.Z_STEP_MS;
    if (!(want3 >= I.LEAD_MS - 1e-9)) leadOk = false;
    if (!(want3 <= I.LEAD_MS + I.SPREAD_MS + 4 * I.Z_STEP_MS + 1e-9)) capOk = false;
    if (want3 < dMin) dMin = want3;
    if (want3 > dMax) dMax = want3;
  }
}
check('最小起跑延迟 >= LEAD 180ms（底图留白恒成立，不含「全空帧」）',
  dMin >= I.LEAD_MS - 1e-9, 'min=' + dMin.toFixed(2));
check('最大起跑延迟 <= LEAD + SPREAD + 4×Z_STEP = 740ms', capOk, 'max=' + dMax.toFixed(2));
check('单卡全程 = 起跑延迟 + TILE 260（整段上界 1000ms）',
  dMax + I.TILE_MS <= 1000 + 1e-9, 'end=' + (dMax + I.TILE_MS).toFixed(2));

/* ---------- ④ 运行时 plan ---------- */
console.log('\n④ 运行时 plan（覆盖 / 字段 / 同源 / 层序锁 / 模式确定性）');
var lv = buildLevel();
var dealTicks = [];
var canvas = makeCanvas();
var rnd = null;
var session = STM.GameState.createSession(lv, {
  onEvent: function (e) { if (rnd) { rnd.handleEvent(e); rnd.refresh(); } }
});
rnd = STM.createBoardRenderer(canvas, session, {
  onDealTick: function (p) { dealTicks.push(p); }
});
rnd.refresh();

var board = session.state().board;
var byId = {};
for (var bi = 0; bi < board.length; bi++) byId[board[bi].id] = board[bi];
var nR = lv.n || 8;

rnd.startDeal(0);
pumpFrames(3);
var plan = rnd.dealPlanOf();
var planIds = plan ? Object.keys(plan) : [];
check('plan 覆盖关卡全部卡牌', planIds.length === lv.tiles.length, planIds.length + '/' + lv.tiles.length);

var fieldOk = true, srcOk = true, dFinite = true;
var sortedIds = planIds.slice().sort(function (a, b) { return (+a) - (+b); });
var rankOf = {};
for (var rk = 0; rk < sortedIds.length; rk++) rankOf[sortedIds[rk]] = rk;
for (var pi = 0; pi < planIds.length; pi++) {
  var tid = planIds[pi];
  var rec = plan[tid];
  var keys = Object.keys(rec).sort().join(',');
  if (keys !== 'a0,delay,ease,ord,ox,oxc,oy,oyc,sx,sy') fieldOk = false;
  if (!isFinite(rec.delay) || rec.delay < I.LEAD_MS - 1e-9) dFinite = false;
  var bt = byId[tid];
  if (bt) {
    var spW = RT.introSpecOf(0, bt, nR, rankOf[tid] || 0, planIds.length);
    var wantD = I.LEAD_MS + spW.ord * I.SPREAD_MS + (bt.z || 0) * I.Z_STEP_MS;
    if (Math.abs(wantD - rec.delay) > 1e-9) srcOk = false;
    if (Math.abs(spW.ord - rec.ord) > 1e-9) srcOk = false;
  }
}
check('计划条目字段齐备（delay/ord/ease/ox/oy/oxc/oyc/sx/sy/a0 十项，无多余字段）', fieldOk);
check('全部 delay 有限且 >= LEAD（无「0 延迟偷跑」）', dFinite);
check('plan 与 introSpecOf 逐项同源（delay 与 ord 双重比对）', srcOk);
check('dealTotalMs() = maxDelay + TILE（运行时与公式同源）', (function () {
  var mx = 0;
  for (var i = 0; i < planIds.length; i++) if (plan[planIds[i]].delay > mx) mx = plan[planIds[i]].delay;
  return Math.abs(rnd.dealTotalMs() - (mx + I.TILE_MS)) < 1e-6;
})(), rnd.dealTotalMs());

/* 层序锁：同 (r,c) 高层恒后落 Z_STEP */
var groups = {}, zMono = true, zExact = true, sameCoord = 0;
for (var gi = 0; gi < planIds.length; gi++) {
  var bt2 = byId[planIds[gi]];
  if (!bt2) continue;
  var gk = bt2.r + ',' + bt2.c;
  if (!groups[gk]) groups[gk] = [];
  groups[gk].push({ z: bt2.z || 0, delay: plan[planIds[gi]].delay });
}
for (var gkey in groups) {
  if (!Object.prototype.hasOwnProperty.call(groups, gkey)) continue;
  var arr = groups[gkey];
  if (arr.length < 2) continue;
  sameCoord++;
  arr.sort(function (a, b) { return a.z - b.z; });
  for (var ai = 1; ai < arr.length; ai++) {
    if (!(arr[ai].delay > arr[ai - 1].delay)) zMono = false;
    if (Math.abs((arr[ai].delay - arr[ai - 1].delay) - I.Z_STEP_MS * (arr[ai].z - arr[ai - 1].z)) > 1e-9) zExact = false;
  }
}
check('存在同坐标层叠卡牌（零穿模断言有实际样本）', sameCoord > 0, 'groups=' + sameCoord);
check('同坐标高层延迟严格大于低层（先落底层、后落顶层）', zMono);
check('同坐标层间差 = Z_STEP 55 × Δz（层序锁）', zExact);

/* 模式确定性 */
var plan0 = JSON.stringify(plan);
rnd.skipDeal();
rnd.startDeal(0);
pumpFrames(3);
var plan0b = JSON.stringify(rnd.dealPlanOf());
rnd.skipDeal();
rnd.startDeal(5);
pumpFrames(3);
var plan5 = JSON.stringify(rnd.dealPlanOf());
rnd.skipDeal();
rnd.startDeal(12);
pumpFrames(3);
var plan12 = JSON.stringify(rnd.dealPlanOf());
rnd.skipDeal();
check('同一模式两次开局 plan 逐字段一致（纯函数、零随机）', plan0 === plan0b);
check('不同模式产出不同 plan（0 / 5 / 12 三者互异）',
  plan0 !== plan5 && plan5 !== plan12 && plan0 !== plan12);

/* ---------- ⑤ 帧闸门 ---------- */
console.log('\n⑤ 帧闸门（先数已绘制帧再记 t0）');
rnd.startDeal();
var st0 = rnd.dealStateOf();
check('startDeal 只置 armed，不记时间戳',
  !!st0 && st0.armed === true && st0.startTime === null && st0.active === true);
check('startDeal 当帧 plan 尚未构建（延到首个绘制帧）', rnd.dealPlanOf() === null);
pumpFrames(1);
var st1 = rnd.dealStateOf();
check('第 1 个已绘制帧后 startTime 仍为 null（闸门未开）',
  !!st1 && st1.startTime === null && st1.armed === true);
pumpFrames(1);
var st2 = rnd.dealStateOf();
check('第 2 个已绘制帧把当前 rAF 时间戳写入 startTime',
  !!st2 && st2.startTime !== null && st2.armed === false &&
  Math.abs(st2.startTime - clockNow) < 1e-6,
  'startTime=' + (st2 && st2.startTime) + ' now=' + clockNow);
check('闸门开启当帧相位恰为 0（不吞 0~5% 的起落）',
  !!st2 && (clockNow - st2.startTime) === 0);
check('draw() 抛异常那帧不计入闸门（drawnOk 守卫）',
  /\} else if \(drawnOk\) \{/.test(brSrcD));
check('闸门四条件：可见性前置 + 遮挡复位（t0 一并作废）',
  /if \(introAnim && introAnim\.armed\) \{[\s\S]{0,160}if \(!dealVisible\(\)\) \{[\s\S]{0,120}introGateFrames = 0;/.test(brSrcD) &&
  /if \(!dealVisible\(\)\) \{[\s\S]{0,200}introAnim\.startTime = null;/.test(brSrcD));
check('闸门期间每帧强制重绘（dirty = true，杜绝第 2 帧空帧）',
  /if \(introAnim && introAnim\.armed\) \{[\s\S]{0,700}?dirty = true;/.test(brSrcD));
check('编舞运行态推进不受闸门影响（armed 期不推进时间轴）',
  /if \(introAnim\.armed \|\| introAnim\.startTime == null\) return true;/.test(brSrcD));

/* ---------- ⑤b 可见性前置 / 复位 / 看门狗 ---------- */
console.log('\n⑤b R6 闸门四条件（可见性前置 / 复位 / 看门狗）');
var visFlag = false;
var cvV = makeCanvas();
var rndV = STM.createBoardRenderer(cvV, session, {
  dealVisibleProbe: function () { return visFlag; }
});
rndV.refresh();
rndV.startDeal();
var v0 = rndV.dealStateOf();
check('R6 startDeal 记 armedAt 并挂起看门狗', !!v0 && v0.watchdog === true &&
  typeof v0.armedAt === 'number' && isFinite(v0.armedAt));
var framesAllZero = true, startAllNull = true, vLoopErr = null;
try {
  for (var fi = 0; fi < 6; fi++) {
    pumpFrames(1);
    var vs = rndV.dealStateOf();
    if (!vs) { framesAllZero = false; break; }
    if (vs.gateFrames !== 0) framesAllZero = false;
    if (vs.startTime !== null) startAllNull = false;
  }
} catch (eV) { vLoopErr = eV.message; }
check('① 探针 false 期间 introGateFrames 恒 0（遮挡期一帧都不计）',
  framesAllZero && !vLoopErr, vLoopErr);
check('① 探针 false 期间 startTime 恒 null（t0 不作数）', startAllNull);
check('① 遮挡 6 帧后仍未开闸（MUST NOT 因「画完了」就放行）',
  !!rndV.dealStateOf() && rndV.dealStateOf().armed === true);
visFlag = true;
pumpFrames(1);
var vA = rndV.dealStateOf();
check('② false→true 后第 1 帧仍不开闸（闸门复位后重新数 2 帧）',
  !!vA && vA.startTime === null && vA.gateFrames === 1, vA ? 'g=' + vA.gateFrames : '-');
pumpFrames(1);
var vB = rndV.dealStateOf();
check('② 第 2 个可见帧才写 t0（四条件齐备）',
  !!vB && vB.startTime !== null && vB.armed === false);
check('② 开闸当帧看门狗已清除（不会有第二次开闸）', !!vB && vB.watchdog === false);
rndV.skipDeal();
check('skipDeal 后看门狗同步清除（不留悬挂定时器）',
  !!rndV.dealStateOf() && rndV.dealStateOf().watchdog === false);

/* ---------- ⑥ 逐帧姿态 ---------- */
console.log('\n⑥ 逐帧姿态（起点隐形 → 收敛 → 归 null）');
rnd.setDealModeLock(0);
var pid = planIds[0];
rnd.startDeal(0);
var preTr = rnd.dealTransformAt(pid, clockNow + 9999);   /* 闸门未开 → 按 el<=0 处理 */
pumpFrames(3);
var t0 = rnd.dealStateOf().startTime;
var planT = rnd.dealPlanOf();
var recT = planT[pid];
check('闸门未开时姿态为「起点 + 全透明」（绝不偷跑）',
  !!preTr && preTr.alpha === 0 && preTr.p === 0);
check('起点位移 = 该模式的起始偏移（未起跑时牌停在起点）',
  !!preTr && Math.abs(preTr.dx - (recT.ox + recT.oxc * rnd.layoutOf().cellStep)) < 1e-6);

function sampleAt(tid, p) {
  var r = rnd.dealPlanOf()[tid];
  return rnd.dealTransformAt(tid, t0 + r.delay + p * I.TILE_MS);
}
var s02 = sampleAt(pid, 0.02), s05 = sampleAt(pid, 0.5), s09 = sampleAt(pid, 0.9);
check('p=0.02 已可见（alpha > 0，非整帧空白）', !!s02 && s02.alpha > 0);
check('位移沿起点方向单调收敛（|dx|、|dy| 递减）',
  !!s05 && Math.abs(s05.dx) <= Math.abs(s02.dx) + 1e-9 &&
  Math.abs(s05.dy) <= Math.abs(s02.dy) + 1e-9 &&
  Math.abs(s09.dx) <= Math.abs(s05.dx) + 1e-9);
check('p=0.9 时位移已收敛到 < 1px（末段无长拖尾）',
  !!s09 && Math.abs(s09.dx) < 1 && Math.abs(s09.dy) < 1,
  s09 ? ('dx=' + s09.dx.toFixed(3) + ' dy=' + s09.dy.toFixed(3)) : 'null');
check('p=1 返回 null（落定帧走静态路径，零残留亚像素偏移）',
  sampleAt(pid, 1) === null);
check('缩放全程 ∈ (0, 1.2] 且 p=0.9 已贴近 1（|s-1| < 0.01）', (function () {
  var ps = [0.02, 0.2, 0.5, 0.9];
  for (var i = 0; i < ps.length; i++) {
    var s = sampleAt(pid, ps[i]);
    if (!s) return false;
    if (!(s.sx > 0 && s.sx <= 1.2 && s.sy > 0 && s.sy <= 1.2)) return false;
  }
  var s9 = sampleAt(pid, 0.9);
  return Math.abs(s9.sx - 1) < 0.01 && Math.abs(s9.sy - 1) < 0.01;
})());
check('alpha 单调不减且在 p<=0.45 已达 1.0（不会「半透明地停住」）', (function () {
  var prev = -1;
  for (var p = 0.02; p <= 0.99; p += 0.02) {
    var s = sampleAt(pid, p);
    if (!s) continue;
    if (s.alpha < prev - 1e-9) return false;
    prev = s.alpha;
  }
  var s45 = sampleAt(pid, 0.45);
  return !!s45 && s45.alpha >= 1 - 1e-9;
})());
check('落定后绘制序严格按 (z,r,c) 升序（编舞零重排、零穿模）', (function () {
  rnd.skipDeal();
  pumpFrames(2);
  var order = rnd.drawOrderOf();
  var keyOf = {};
  for (var i = 0; i < board.length; i++) keyOf[board[i].id] = [board[i].z || 0, board[i].r, board[i].c];
  var prevK = null;
  for (var j = 0; j < order.length; j++) {
    var k = keyOf[order[j]];
    if (!k) continue;
    if (prevK) {
      if (k[0] < prevK[0]) return false;
      if (k[0] === prevK[0] && k[1] < prevK[1]) return false;
      if (k[0] === prevK[0] && k[1] === prevK[1] && k[2] < prevK[2]) return false;
    }
    prevK = k;
  }
  return true;
})());
rnd.setDealModeLock(null);

/* ---------- ⑦ 落子涟漪音 ---------- */
console.log('\n⑦ 落子涟漪音');
dealTicks = [];
rnd.startDeal();
pumpFrames(300);
check('逐牌落定各触发一次（8×8 层叠关卡全部发声）', dealTicks.length === lv.tiles.length,
  dealTicks.length + '/' + lv.tiles.length);
var monoTick = true, tickRange = true;
for (var ti = 1; ti < dealTicks.length; ti++) if (dealTicks[ti] < dealTicks[ti - 1]) monoTick = false;
for (var tj = 0; tj < dealTicks.length; tj++) if (!(dealTicks[tj] >= 0 && dealTicks[tj] <= 1)) tickRange = false;
check('progress 单调不减（落牌时间轴顺序）', monoTick);
check('progress 恒落 [0,1]', tickRange);
check('落子音触发点与 TICK_AT 0.85 同源（无第二套阈值）',
  /el >= INTRO_TILE_MS \* INTRO_TICK_AT/.test(brSrcD) &&
  brSrcD.indexOf('INTRO_IMPACT_AT') === -1);
check('SoundManager 落牌节流口径 = 45ms（Δ23 收紧声数）', (function () {
  require('../src/audio/SoundManager.js');
  STM.createSoundManager({});
  return !!(globalThis.STM.AUDIO_CONFIG && globalThis.STM.AUDIO_CONFIG.dealTickMinMs === 45);
})());

/* ---------- ⑧ 点击快进 ---------- */
console.log('\n⑧ 点击快进（闸门期 + 动画期双路径）');
rnd.startDeal();
check('闸门未开时快进也有效（armed 期不悬挂）', rnd.skipDeal() === true);
check('闸门期快进后立刻失活且计划清空',
  rnd.isDealing() === false && rnd.dealPlanOf() === null);
rnd.startDeal();
pumpFrames(8);
check('动画进行中（约 96ms，已过闸门）仍在编舞', rnd.isDealing());
check('skipDeal() 返回「此前确实在编舞」', rnd.skipDeal() === true);
check('快进后立刻失活且计划清空', rnd.isDealing() === false && rnd.dealPlanOf() === null);
var hitId = rnd.hitTest(160, 160);
check('快进后同帧命中判定可用（不吞点击）', hitId >= 0, 'hit=' + hitId);
if (hitId >= 0) {
  var res = session.tap(hitId);
  check('快进后该次点击被正常处理', !!res && typeof res.type === 'string', JSON.stringify(res && res.type));
}
check('重复 skipDeal() 幂等返回 false', rnd.skipDeal() === false);

/* ---------- ⑨ 模式抽取 ---------- */
console.log('\n⑨ 模式抽取（相邻不重复 / 调试锁定 / 越界夹取）');
rnd.setDealModeLock(null);
var picks = [], noRepeat = true, inRange = true;
for (var pk = 0; pk < 30; pk++) {
  var mv = rnd.startDeal();
  if (typeof mv !== 'number' || mv < 0 || mv > 14) inRange = false;
  if (pk > 0 && mv === picks[pk - 1]) noRepeat = false;
  picks.push(mv);
  rnd.skipDeal();
}
check('30 次开局模式号恒落 [0,14]', inRange);
check('相邻两次开局零重复（除上次之外的 14 种等概率）', noRepeat, picks.join(','));
check('抽取覆盖多种模式（非退化为单值）',
  Object.keys(picks.reduce(function (o, v) { o[v] = 1; return o; }, {})).length >= 5);
rnd.setDealModeLock(7);
check('调试锁定生效（startDeal() 恒返回 7）', rnd.startDeal() === 7);
check('模式名与锁定一致', rnd.dealModeName() === I.MODES[7]);
rnd.skipDeal();
rnd.setDealModeLock(null);
check('解除锁定后恢复随机（返回合法模式号）', (function () {
  var v = rnd.startDeal();
  return v >= 0 && v <= 14;
})());
rnd.skipDeal();
check('越界模式号被夹到 0（不抛错）', rnd.startDeal(99) === 0);
rnd.skipDeal();
check('负模式号被夹到 0', rnd.startDeal(-3) === 0);
rnd.skipDeal();

/* ---------- ⑩ reduced-motion 降级 ---------- */
console.log('\n⑩ reduced-motion 降级');
rnd.setReducedMotion(true);
rnd.startDeal(4);
pumpFrames(4);
var rplan = rnd.dealPlanOf();
check('降级后计划仍覆盖全部卡牌', !!rplan && Object.keys(rplan).length === lv.tiles.length,
  rplan ? Object.keys(rplan).length : 'null');
check('降级后零位移零缩放（只淡入）', (function () {
  var t0r = rnd.dealStateOf().startTime;
  var rr = rnd.dealPlanOf()[pid];
  var s = rnd.dealTransformAt(pid, t0r + rr.delay + I.TILE_MS * 0.5);
  if (!s) return false;
  return s.dx === 0 && s.dy === 0 && s.sx === 1 && s.sy === 1 && s.alpha >= 0 && s.alpha <= 1;
})());
check('降级不改总时长（无特殊短路径）', (function () {
  var mx = 0;
  for (var k in rplan) {
    if (!Object.prototype.hasOwnProperty.call(rplan, k)) continue;
    if (rplan[k].delay > mx) mx = rplan[k].delay;
  }
  return Math.abs(rnd.dealTotalMs() - (mx + I.TILE_MS)) < 1e-6;
})(), rnd.dealTotalMs());
try { pumpFrames(300); check('降级路径零异常', true); } catch (e) { check('降级路径零异常', false, e.message); }
check('降级后同样完全归位', rnd.isDealing() === false);
rnd.setReducedMotion(false);

/* ---------- ⑪ 纯表现层 ---------- */
console.log('\n⑪ 纯表现层（不改关卡数据 / 不改坐标）');
var beforeTiles = JSON.stringify(lv.tiles);
var beforeBoard = JSON.stringify(session.state().board);
var rectBefore = [];
for (var ri = 0; ri < board.length; ri++) {
  var rc0 = rnd.tileRect(board[ri].id);
  rectBefore.push(rc0 ? [rc0.x, rc0.y, rc0.w, rc0.h].join(',') : 'null');
}
rnd.startDeal(1);
pumpFrames(300);
check('编舞前后 tiles 数据逐字段一致', JSON.stringify(lv.tiles) === beforeTiles);
check('编舞前后 board 卡牌集合逐字段一致（坐标/层高零改动）',
  JSON.stringify(session.state().board) === beforeBoard);
var rectSame = true;
for (var ri2 = 0; ri2 < board.length; ri2++) {
  var rc1 = rnd.tileRect(board[ri2].id);
  var s1 = rc1 ? [rc1.x, rc1.y, rc1.w, rc1.h].join(',') : 'null';
  if (s1 !== rectBefore[ri2]) rectSame = false;
}
check('编舞落定后每张牌的静态坐标与遮挡矩形 100% 还原', rectSame);

/* ---------- ⑫ R6 看门狗收口（真实定时器，必须等 1200ms） ----------
 * 闸门可能因「遮罩/弹窗一直不消失」永远开不了。看门狗是唯一兜底。
 * 口径 = 「复查 + 重挂」：
 *   · 到期仍遮挡 → 重新挂起（watchdogRearms++、armed 保持 true、startTime 仍 null）
 *   · 到期且已可见 → 立即开闸（startTime 非 null、看门狗清零）
 *   · 累计超 GATE_WATCHDOG_MAX_MS → skipDeal() 静置（开局 MUST NOT 卡死）
 * 判据：遮挡期**绝不**静置；总预算到期才收口。 */
console.log('\n⑫ R6 看门狗复查 / 重挂 / 总预算收口（真实定时器 1200ms）');
var wdFlag = false;
var cvW = makeCanvas();
var rndW = STM.createBoardRenderer(cvW, session, {
  dealVisibleProbe: function () { return wdFlag; }
});
rndW.refresh();
rndW.startDeal();
check('③ 看门狗启动后处于挂起态', !!rndW.dealStateOf() && rndW.dealStateOf().watchdog === true);

function finish() {
  console.log('');
  if (fails.length) {
    console.log('deal-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('deal-smoke: all green（15 种编舞 / 帧闸门四条件 / 看门狗复查重挂 / 层序锁 / 落子音 / 快进 / 降级 / 纯表现层）');
  }
}

/* 第 1 拍：1400ms（> 1200ms 复查间隔）后仍遮挡 → MUST 重挂，不得静置 */
setTimeout(function () {
  var stW = rndW.dealStateOf();
  check('③ 遮挡期到期 MUST NOT 静置（isDealing 仍真、armed 仍真）',
    rndW.isDealing() === true && !!stW && stW.armed === true);
  check('③ 遮挡期到期后重新挂起（watchdog 仍挂、rearms >= 1）',
    !!stW && stW.watchdog === true && stW.watchdogRearms >= 1,
    stW ? 'rearms=' + stW.watchdogRearms : 'null');
  check('③ 遮挡期 startTime 恒 null（绝不偷记 t0）', !!stW && stW.startTime === null);
  check('③ 遮挡期 gateFrames 恒 0（闸门未开）', !!stW && stW.gateFrames === 0);

  /* 第 2 拍：解除遮挡 → 下一次复查（<= 1200ms）必须立即开闸 */
  wdFlag = true;
  setTimeout(function () {
    var stV = rndW.dealStateOf();
    check('③ 解除遮挡后复查即开闸（startTime 非 null、armed 变假）',
      !!stV && stV.startTime !== null && stV.armed === false,
      stV ? JSON.stringify({ st: stV.startTime, armed: stV.armed }) : 'null');
    check('③ 开闸当帧看门狗已清除（不会有第三次挂起）',
      !!stV && stV.watchdog === false);

    /* 第 3 拍：总预算收口——把假时钟推过 8000ms 且保持遮挡，下一次复查 MUST 静置 */
    var cvX = makeCanvas();
    var rndX = STM.createBoardRenderer(cvX, session, {
      dealVisibleProbe: function () { return false; }
    });
    rndX.refresh();
    rndX.startDeal();
    clockNow += 8500; /* 假时钟越过总预算；真实定时器仍在 1200ms 后触发 */
    setTimeout(function () {
      var stX = rndX.dealStateOf();
      check('③ 累计超总预算才收口（isDealing 变假，开局不卡死）', rndX.isDealing() === false);
      check('③ 收口走 skipDeal（startTime 仍 null，棋盘停在静态精确坐标而非起始态）',
        !!stX && stX.startTime === null && stX.armed === false && stX.watchdog === false);
      check('③ 收口后 plan 已清空（零悬挂动画状态）', rndX.dealPlanOf() === null);
      finish();
    }, 1400);
  }, 1400);
}, 1400);
