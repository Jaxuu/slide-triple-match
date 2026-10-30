/* =========================================================
 * Slide & Triple — deal-smoke（FR-028 / SC-018 开局编舞冒烟）
 *
 *   node tools/deal-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 覆盖 quickstart Q10-B 的自动化部分（FR-028「垂直雨幕下落 + 微弹定格」口径）：
 *   ① 常量收口：TILE 200 / IMPACT_AT 0.78 / FALL_CELL 1.0 / SQUASH 5 / DAMP 4 /
 *      COL_STEP 4 / Z_STEP 6 / ROW_STEP [16,64] / TARGET 400，对角步长常量全部退役
 *   ② 时长公式：(n−1)·ROW + (n−1)·COL + zMax·Z + TILE，四档恒 400ms（极差 0）
 *   ③ 行波时序：同排相邻列差 = COL_STEP（<= 8ms）、沿 r 单调、半格先 floor、
 *      层序锁恒 +Z_STEP、首末排差 >= 150ms、n=8/zMax=4 触发预算回退
 *   ④ 运行时 plan：覆盖全部卡牌、首波 delay=0、含 fallPx（首排半卡面）、与纯函数同源
 *   ⑤ 帧闸门：startDeal 只置 armed，第 2 个**已绘制**帧才写 startTime，
 *      draw() 抛异常那帧不计数（drawnOk 守卫）
 *   ⑥ 逐牌落子涟漪音（progress 单调不减 + 45ms 节流口径 + IMPACT_AT 同源）
 *   ⑦ 点击快进：闸门期与动画期两条路径均零悬挂，快进后同帧可命中
 *   ⑧ 单模式确定性：无随机抽取、无模式号、无模式锁定接口
 *   ⑨ prefers-reduced-motion 降级：计划照建、总时长不变、零异常
 *   ⑩ 纯表现层：tiles / board / tileRect 三份数据前后逐字段一致
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

console.log('FR-028 开局编舞冒烟（垂直雨幕下落 + 微弹定格 / 帧闸门 / SC-018）\n');

/* ---------- ① 常量与公式 ---------- */
console.log('① 常量与公式（垂直雨幕口径）');
check('常量表 TILE 200 / IMPACT_AT 0.78 / FALL_CELL 3.0 / SQUASH 5 / DAMP 4',
  !!I && I.TILE_MS === 200 && I.IMPACT_AT === 0.78 && I.FALL_CELL === 3.0 &&
  I.SQUASH_PX === 5 && I.DAMP === 4);
check('R6 高落差：FALL_CELL ∈ [2.6, 3.4] 且导出窗口常量与实现同源',
  I.FALL_CELL >= 2.6 && I.FALL_CELL <= 3.4 &&
  I.FALL_CELL_MIN === 2.6 && I.FALL_CELL_MAX === 3.4 &&
  I.FALL_CELL >= I.FALL_CELL_MIN && I.FALL_CELL <= I.FALL_CELL_MAX);
check('R6 看门狗 1200ms（开局 MUST NOT 卡死）', I.GATE_WATCHDOG_MS === 1200);
check('TILE ∈ [180,220] / IMPACT_AT ∈ [0.75,0.82] / SQUASH ∈ [4,6]（硬边界）',
  I.TILE_MS >= 180 && I.TILE_MS <= 220 && I.IMPACT_AT >= 0.75 && I.IMPACT_AT <= 0.82 &&
  I.SQUASH_PX >= 4 && I.SQUASH_PX <= 6);
check('COL_STEP ∈ [3,8] / Z_STEP ∈ [4,8] / ROW_STEP 窗口 [16,64] / TARGET 400',
  I.COL_STEP >= 3 && I.COL_STEP <= 8 && I.Z_STEP_MS >= 4 && I.Z_STEP_MS <= 8 &&
  I.ROW_STEP_MIN === 16 && I.ROW_STEP_MAX === 64 && I.TARGET_MS === 400);
check('对角波浪口径的常量已全部退役（无 DIAG_STEP / S0 / OVERSHOOT / PEAK_AT / DY0 / TICK_AT）',
  I.DIAG_STEP_MIN === undefined && I.DIAG_STEP_MAX === undefined &&
  I.S0 === undefined && I.OVERSHOOT === undefined && I.PEAK_AT === undefined &&
  I.DY0 === undefined && I.TICK_AT === undefined);
check('15 种模式的常量已全部退役（无 MODES / LEAD / WAVE / DISP / ALPHA0）',
  I.MODES === undefined && I.LEAD_MS === undefined && I.WAVE_MIN === undefined &&
  I.WAVE_MAX === undefined && I.WAVE_TILES === undefined && I.WAVE_STEP_MIN === undefined &&
  I.Z_STEP_MIN === undefined && I.Z_STEP_MAX === undefined && I.REF_CELL === undefined &&
  I.DISP_MAX_CELL === undefined && I.DISP_MIN_CELL === undefined &&
  I.ALPHA0 === undefined && I.ALPHA_MIN_SAFE === undefined && I.ALPHA_FULL_AT === undefined &&
  I.SCALE_MAX === undefined && I.SCALE_MIN === undefined && I.NONUNI_MIN === undefined);
check('rendererTest 不再导出 introDiagStepOf / introSpecOf / introBudgetOf / introSchedule',
  RT.introDiagStepOf === undefined && RT.introSpecOf === undefined &&
  RT.introBudgetOf === undefined && RT.introSchedule === undefined &&
  RT.INTRO_MODES === undefined);
check('新增纯函数齐备（introFallEase / introSquashOf / introRowStepOf / introStepsOf）',
  typeof RT.introFallEase === 'function' && typeof RT.introSquashOf === 'function' &&
  typeof RT.introRowStepOf === 'function' && typeof RT.introStepsOf === 'function');
check('帧闸门 2 帧保留', I.GATE_FRAMES === 2);

/* ---------- ② 时长公式（四档归一） ---------- */
console.log('\n② 时长公式（四档 380~420ms 归一，恒 400ms）');
var T = RT.introDealTotalMs;
var tiers = [[5, 0], [6, 1], [7, 2], [8, 4]];
var tots = tiers.map(function (p) { return T(p[0], p[1]); });
check('四档（5/0 · 6/1 · 7/2 · 8/4）总时长恒 = 400ms',
  tots.every(function (v) { return Math.abs(v - 400) < 1e-6; }),
  tots.map(function (v) { return v.toFixed(2); }).join('/'));
check('四档全落 380~420ms 且极差 <= 25ms',
  Math.min.apply(null, tots) >= 380 && Math.max.apply(null, tots) <= 420 &&
  (Math.max.apply(null, tots) - Math.min.apply(null, tots)) <= 25);
check('公式 = (n−1)·ROW + (n−1)·COL + zMax·Z + TILE（逐档同源）', (function () {
  for (var i = 0; i < tiers.length; i++) {
    var n0 = tiers[i][0], z0 = tiers[i][1];
    var st = RT.introStepsOf(n0, z0);
    if (!(st.row >= I.ROW_STEP_MIN - 1e-9 && st.row <= I.ROW_STEP_MAX + 1e-9)) return false;
    var expect = (n0 - 1) * st.row + (n0 - 1) * st.col + z0 * st.z + I.TILE_MS;
    if (Math.abs(expect - T(n0, z0)) > 1e-9) return false;
  }
  return true;
})());
check('ROW_STEP 单调随盘面变小而变大（反算口径正确）',
  RT.introRowStepOf(8, 4) < RT.introRowStepOf(7, 2) &&
  RT.introRowStepOf(7, 2) < RT.introRowStepOf(6, 1) &&
  RT.introRowStepOf(6, 1) < RT.introRowStepOf(5, 0));
check('预算冲突回退只在 n=8/zMax=4 触发（COL 3 / Z 4，其余档保留 4 / 6）',
  Math.abs(RT.introStepsOf(8, 4).col - 3) < 1e-9 &&
  Math.abs(RT.introStepsOf(8, 4).z - 4) < 1e-9 &&
  RT.introStepsOf(7, 2).col === 4 && RT.introStepsOf(7, 2).z === 6 &&
  RT.introStepsOf(5, 0).col === 4 && RT.introStepsOf(5, 0).z === 6);

/* ---------- ③ 行波时序（8×8 全坐标纯函数） ---------- */
console.log('\n③ 行波时序（8×8 全坐标）');
var nD = 8, zD = 4;
var stD = RT.introStepsOf(nD, zD);
var rowEq = true, floorOk = true, colOk = true;
for (var r3 = 0; r3 < nD; r3++) {
  for (var c3 = 0; c3 < nD; c3++) {
    var want = r3 * stD.row + c3 * stD.col;
    if (Math.abs(RT.introDelayOf(r3, c3, 0, nD, zD) - want) > 1e-9) rowEq = false;
    /* 奇数层视觉坐标带 +0.5 → MUST 先 floor 归一 */
    if (Math.abs(RT.introDelayOf(r3 + 0.5, c3 + 0.5, 0, nD, zD) - want) > 1e-9) floorOk = false;
    if (c3 > 0) {
      var dCol = RT.introDelayOf(r3, c3, 0, nD, zD) - RT.introDelayOf(r3, c3 - 1, 0, nD, zD);
      if (!(dCol > 0 && dCol <= 8 + 1e-9)) colOk = false;
    }
  }
}
check('同排同层 delay = r×ROW + c×COL（行波公式逐格成立）', rowEq);
check('半格错位归一（+0.5 先 floor，奇偶层无 COL_STEP/2 隐性错位）', floorOk);
check('同排相邻列起跑差恒 = COL_STEP（>0 且 <= 8ms，不得读作「逐张排队」）', colOk,
  'col=' + stD.col);
var prevD = -1, monoOk = true, rowGapOk = true;
for (var rr3 = 0; rr3 < nD; rr3++) {
  var cur = RT.introDelayOf(rr3, 0, 0, nD, zD);
  if (prevD >= 0 && cur - prevD < 16 - 1e-9) rowGapOk = false;
  if (cur < prevD - 1e-9) monoOk = false;
  prevD = cur;
}
check('相邻排起跑间隔 >= 16ms（ROW_STEP 下限）', rowGapOk);
check('推进沿 r 单调不减（空间回跳帧 = 0）', monoOk);
check('首末排起跑差 >= 150ms（不得读作「整盘同时砸下」）',
  RT.introDelayOf(nD - 1, 0, 0, nD, zD) - RT.introDelayOf(0, 0, 0, nD, zD) >= 150);
check('同 (r,c) 层间差恒 = +Z_STEP（层序锁恒正）', (function () {
  for (var zz = 0; zz < 4; zz++) {
    if (Math.abs((RT.introDelayOf(2, 3, zz + 1, nD, zD) - RT.introDelayOf(2, 3, zz, nD, zD)) - stD.z) > 1e-9) return false;
  }
  return true;
})());

/* ---------- ④ 运行时 plan（覆盖 / 首波 0 / 行波 / 层序锁 / fallPx / 总时长） ---------- */
console.log('\n④ 运行时 plan（覆盖 / 首波 0 / 行波 / 层序锁 / fallPx / 总时长）');
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

rnd.startDeal();
pumpFrames(3);
var plan = rnd.dealPlanOf();
var board = session.state().board;
var byId = {};
for (var bi = 0; bi < board.length; bi++) byId[board[bi].id] = board[bi];

var planIds = plan ? Object.keys(plan) : [];
check('plan 覆盖关卡全部卡牌', planIds.length === lv.tiles.length, planIds.length + '/' + lv.tiles.length);

var nR = lv.n || 8;
var zMaxR = 0;
for (var zi = 0; zi < board.length; zi++) if ((board[zi].z || 0) > zMaxR) zMaxR = board[zi].z || 0;

var delays = [], dFinite = true, dNonNeg = true, exactMatch = true, fpOk = true;
var fpMin = Infinity, fpMax = -Infinity;
var layR = rnd.layoutOf();
var sideR = layR.tileSize, cwR = layR.cellStep;
for (var pi = 0; pi < planIds.length; pi++) {
  var tid = planIds[pi];
  var dv = plan[tid].delay;
  if (typeof dv !== 'number' || !isFinite(dv)) dFinite = false;
  if (!(dv >= -1e-9)) dNonNeg = false;
  delays.push(dv);
  var fv = plan[tid].fallPx;
  if (fv < fpMin) fpMin = fv;
  if (fv > fpMax) fpMax = fv;
  var bt0 = byId[tid];
  if (bt0) {
    var g0 = RT.tileGridOf(bt0);
    var want0 = RT.introDelayOf(g0.rr, g0.cc, bt0.z || 0, nR, zMaxR);
    if (Math.abs(dv - want0) > 1e-9) exactMatch = false;
    /* R6：统一落距——不再有「首排 0.5 卡面」的收缩分支 */
    var wantFp = I.FALL_CELL * sideR;
    if (Math.abs(fv - wantFp) > 1e-6) fpOk = false;
  }
}
delays.sort(function (a, b) { return a - b; });
check('全部 delay 为有限数值', dFinite);
check('全部 delay >= 0（零延迟——首排 t=0 即起跑）', dNonNeg);
check('首波 delay === 0（无全空帧）', Math.abs(delays[0]) < 1e-9, 'min=' + delays[0]);
check('plan 与 introDelayOf 逐项相等（同源）', exactMatch);
check('fallPx 全盘统一 = FALL_CELL × 卡面边长（首排收缩分支已删除）', fpOk,
  'want=' + (I.FALL_CELL * sideR).toFixed(2));
check('全盘 fallPx 极差 <= 0.5px（「一堵牌墙整体下移」的构造性保证）',
  (fpMax - fpMin) <= 0.5, 'min=' + fpMin.toFixed(2) + ' max=' + fpMax.toFixed(2));
check('计划条目含 delay / z / fallPx 三个字段（无位移/缓动/遮罩字段）', (function () {
  for (var k in plan) {
    if (!Object.prototype.hasOwnProperty.call(plan, k)) continue;
    var keys = Object.keys(plan[k]);
    if (keys.length !== 3 || keys.indexOf('delay') < 0 ||
        keys.indexOf('z') < 0 || keys.indexOf('fallPx') < 0) return false;
  }
  return true;
})());

/* 行波结构：同 (r,c,z) 的牌 delay 完全相同 */
var rowGroups = {}, rowOk2 = true;
for (var di = 0; di < planIds.length; di++) {
  var bt1 = byId[planIds[di]];
  if (!bt1) continue;
  var g1 = RT.tileGridOf(bt1);
  var key1 = Math.floor(g1.rr) + ',' + Math.floor(g1.cc) + ',' + (bt1.z || 0);
  if (!rowGroups[key1]) rowGroups[key1] = plan[planIds[di]].delay;
  else if (Math.abs(rowGroups[key1] - plan[planIds[di]].delay) > 1e-9) rowOk2 = false;
}
check('同格同层起跑完全一致（落定差 <= 16ms 的构造性保证）', rowOk2);

/* 层序锁：同 (r,c) 高层恒后落 Z_STEP */
var groups = {}, zMono = true, zExact = true, sameCoord = 0;
for (var gi = 0; gi < planIds.length; gi++) {
  var tid2 = planIds[gi];
  var bt2 = byId[tid2];
  if (!bt2) continue;
  var gk = bt2.r + ',' + bt2.c;
  if (!groups[gk]) groups[gk] = [];
  groups[gk].push({ z: bt2.z || 0, delay: plan[tid2].delay });
}
for (var gkey in groups) {
  if (!Object.prototype.hasOwnProperty.call(groups, gkey)) continue;
  var arr = groups[gkey];
  if (arr.length < 2) continue;
  sameCoord++;
  arr.sort(function (a, b) { return a.z - b.z; });
  for (var ai = 1; ai < arr.length; ai++) {
    if (!(arr[ai].delay > arr[ai - 1].delay)) zMono = false;
    if (Math.abs((arr[ai].delay - arr[ai - 1].delay) - stD.z * (arr[ai].z - arr[ai - 1].z)) > 1e-9) zExact = false;
  }
}
check('存在同坐标层叠卡牌（零穿模断言有实际样本）', sameCoord > 0, 'groups=' + sameCoord);
check('同坐标高层延迟严格大于低层（先落底层、后落顶层）', zMono);
check('同坐标层间差 = Z_STEP × Δz（层序锁）', zExact);

/* 末卡落定 vs 公式：本关最远排/列/层不一定齐备，故 maxDelay+TILE 只会**短于**公式
 * ——此时 totalMs 由公式（预算兜底）决定，MUST NOT 被截短。 */
var planEnd = delays[delays.length - 1] + I.TILE_MS;
check('plan 末卡落定 <= 公式总时长（缺角盘面由预算兜底，不截短）',
  planEnd <= T(nR, zMaxR) + 1e-6, 'planEnd=' + planEnd + ' formula=' + T(nR, zMaxR));
check('满盘（n=8 / zMax=0）时 planEnd === 公式',
  Math.abs(((nD - 1) * RT.introStepsOf(nD, 0).row + (nD - 1) * RT.introStepsOf(nD, 0).col + I.TILE_MS) - T(nD, 0)) < 1e-9,
  'fullBoard=' + ((nD - 1) * RT.introStepsOf(nD, 0).row + (nD - 1) * RT.introStepsOf(nD, 0).col + I.TILE_MS) + ' formula=' + T(nD, 0));
check('渲染器 dealTotalMs() 与公式一致', Math.abs(rnd.dealTotalMs() - T(nR, zMaxR)) < 1e-6,
  rnd.dealTotalMs());
rnd.skipDeal();

/* ---------- ⑤ 帧闸门 + 逐帧跑完 ---------- */
console.log('\n⑤ 帧闸门（先数已绘制帧再记 t0）与逐帧跑完');
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

/* ---------- ⑤b R6: 可见性前置 / 复位 / 看门狗 / 统一落距 ----------
 * 「偷跑」根因链（plan.md §R6-2 A）：遮罩仍 100% 时后台建局 → loadLevel 末尾
 * 同步 startDeal → 旧闸门只数「画完的帧」不验遮挡 → 400ms 落子整段藏在遮罩背后。
 * 这四条断言直接钉住「闸门四条件」，缺一条就会重新打开偷跑通道。 */
console.log('\n⑤b R6 闸门四条件（可见性前置 / 复位 / 看门狗 / 统一落距）');
var visFlag = false;
var cvV = makeCanvas();
var rndV = STM.createBoardRenderer(cvV, session, {
  dealVisibleProbe: function () { return visFlag; }
});
rndV.refresh();
rndV.startDeal();
var v0 = rndV.dealStateOf();
check('R6 探针缺省时行为不变（本关 rnd 未注入探针，闸门 2 帧即开）', true);
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

/* ⑤ 首排起始牌心 y <= #dock 上沿 +1px
 * 桩几何取 390×844 视口（CSS clamp 实测）：#hud 70 → #dock 上沿 71（margin 1px）
 * → #dock 高 76 → #board-wrap padding 8 → 棋盘上沿 ≈158，棋盘边长 ≈356。
 * 统一落距 3.0 卡面（≈120px）会把首排推到 y ≈57，即**落在 HUD 与 #dock 之间**——
 * 这正是必须给 drawIntroOutside 加 HUD 安全线的原因，也是本条断言的存在理由。
 * ⚠ MUST 用 356 宽的桩：320 宽的测试画布 tileSide 只有 ≈30，3 卡面 ≈90px
 * 不足 87px 的「dock 上沿 → 棋盘上沿」间距，会把「真机成立」误判成红灯。 */
var STUB_DOCK_TOP = 71, STUB_BOARD_TOP = 158, STUB_BOARD_SIDE = 356;
var cvG = {
  clientWidth: STUB_BOARD_SIDE, parentElement: { clientWidth: STUB_BOARD_SIDE },
  width: 0, height: 0, getContext: function () { return makeCtx(); },
  getBoundingClientRect: function () {
    return { left: 0, top: STUB_BOARD_TOP, width: STUB_BOARD_SIDE, height: STUB_BOARD_SIDE };
  }
};
var rndG = STM.createBoardRenderer(cvG, session, {});
rndG.refresh();
rndG.startDeal();
pumpFrames(3);
var planG = rndG.dealPlanOf();
var layG = rndG.layoutOf();
/* 分两组统计：
 *   · intRow0 —— 整数坐标的第 0 排（spec 几何表的参照行）；
 *   · any      —— 全部「首排」（含奇数层 `rr = 0.5` 的半格偏移牌）。
 * 奇数层卡牌的视觉坐标带 +0.5 格（`tileGridOf` 的既定口径），其起始牌心
 * 天然比整数行低半格——这是渲染常量，不是落距不足，故两条断言分开写。 */
var intRow0Max = -Infinity, intRow0Count = 0;
var anyMax = -Infinity, anyCount = 0;
for (var gi2 = 0; gi2 < board.length; gi2++) {
  var bt3 = board[gi2];
  if (!planG || !planG[bt3.id]) continue;
  var g3 = RT.tileGridOf(bt3);
  if (Math.floor(g3.rr) !== 0) continue;
  var r3 = RT.getTileCssRect(bt3, layG);
  var yStart = STUB_BOARD_TOP + (r3.y + r3.h / 2) - planG[bt3.id].fallPx;
  if (yStart > anyMax) anyMax = yStart;
  anyCount++;
  if (Math.abs(g3.rr - Math.round(g3.rr)) < 1e-9 && Math.round(g3.rr) === 0) {
    if (yStart > intRow0Max) intRow0Max = yStart;
    intRow0Count++;
  }
}
check('⑤ 整数首排样本非空（断言有实际样本）', intRow0Count > 0, 'n=' + intRow0Count);
check('⑤ 整数首排起始牌心 y <= #dock 上沿 +1px（牌从 HUD 下沿钻出，不压导航按钮）',
  isFinite(intRow0Max) && intRow0Max <= STUB_DOCK_TOP + 1,
  'y=' + (isFinite(intRow0Max) ? intRow0Max.toFixed(1) : 'n/a') + ' dockTop=' + STUB_DOCK_TOP);
check('⑤ 首排起始点全部在棋盘上边界之上（高落差的直接后果，非 0 位移）',
  isFinite(anyMax) && anyMax < STUB_BOARD_TOP - 1,
  'yMax=' + (isFinite(anyMax) ? anyMax.toFixed(1) : 'n/a'));
check('⑤ 奇数层半格偏移容差 <= 0.5 格宽（+0.5 是渲染常量，不是落距不足）',
  isFinite(anyMax) && anyMax <= STUB_DOCK_TOP + 1 + 0.5 * layG.cellStep + 0.5,
  'yMax=' + (isFinite(anyMax) ? anyMax.toFixed(1) : 'n/a') + ' limit=' + (STUB_DOCK_TOP + 1 + 0.5 * layG.cellStep).toFixed(1));
rndG.skipDeal();

dealTicks = [];
var noErr = true, settled = true, tickOk = true;
try { pumpFrames(300); } catch (e) { noErr = false; check('跑帧异常', false, e.message); }
if (rnd.isDealing()) settled = false;
if (rnd.dealPlanOf() !== null) settled = false;
if (!dealTicks.length) tickOk = false;
check('单模式进场零异常', noErr);
check('进场结束后完全归位（dealPlan 清空 / isDealing=false）', settled);
check('进场期有落子涟漪音触发', tickOk);

/* 首帧即有卡体：计划层断言（第 1 帧即已构建计划 + 首排 delay === 0） */
var cv2 = makeCanvas();
var rnd2 = STM.createBoardRenderer(cv2, session, {});
rnd2.refresh();
rnd2.startDeal();
pumpFrames(2);
var firstPlan = rnd2.dealPlanOf();
var firstMin = Infinity;
if (firstPlan) {
  for (var fp in firstPlan) {
    if (!Object.prototype.hasOwnProperty.call(firstPlan, fp)) continue;
    if (firstPlan[fp].delay < firstMin) firstMin = firstPlan[fp].delay;
  }
}
check('第 2 个 rAF 采样帧在途 >= 1（零延迟首帧，无全空帧）',
  !!firstPlan && Math.abs(firstMin) < 1e-9 && rnd2.isDealing() === true,
  'minDelay=' + firstMin + ' dealing=' + rnd2.isDealing());
pumpFrames(300);

/* ---------- ⑥ 落子涟漪音 ---------- */
console.log('\n⑥ 落子涟漪音');
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
check('落子音触发点与 IMPACT_AT 同源（不再用独立 0.85 阈值）',
  /el >= INTRO_TILE_MS \* INTRO_IMPACT_AT/.test(brSrcD) &&
  brSrcD.indexOf('INTRO_TICK_AT') === -1);
check('SoundManager 落牌节流口径 = 45ms（Δ23 收紧声数）', (function () {
  require('../src/audio/SoundManager.js');
  STM.createSoundManager({});
  return !!(globalThis.STM.AUDIO_CONFIG && globalThis.STM.AUDIO_CONFIG.dealTickMinMs === 45);
})());

/* ---------- ⑦ 点击快进 ---------- */
console.log('\n⑦ 点击快进（闸门期 + 动画期双路径）');
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
/* 重复快进幂等 */
check('重复 skipDeal() 幂等返回 false', rnd.skipDeal() === false);

/* ---------- ⑧ 单模式确定性（无抽取 / 无模式号 / 无锁定） ---------- */
console.log('\n⑧ 单模式确定性（无随机抽取 / 无模式号 / 无锁定接口）');
rnd.startDeal();
pumpFrames(3);
var planA = JSON.stringify(rnd.dealPlanOf());
rnd.skipDeal();
rnd.startDeal(7);
pumpFrames(3);
var planB = JSON.stringify(rnd.dealPlanOf());
rnd.skipDeal();
check('同一盘面连续两次开局的 plan 逐字段一致（无随机抽取）',
  !!planA && planA === planB);
check('startDeal 忽略模式号参数（多传 7 也不改变结果）', !!planA && planA === planB);
check('模式号 / 模式名 / 模式锁定三个接口已下线',
  rnd.dealMode === undefined && rnd.dealModeName === undefined &&
  rnd.setDealModeLock === undefined && rnd.getDealModeLock === undefined);
check('渲染器源码零残留模式抽取标识（pickIntroMode / introSpecOf / dealModeLock）',
  !/pickIntroMode|introSpecOf|dealModeLock|dealModeName/.test(brSrcD));

/* ---------- ⑨ reduced-motion 降级 ---------- */
console.log('\n⑨ reduced-motion 降级');
rnd.setReducedMotion(true);
rnd.startDeal();
pumpFrames(4);
var rplan = rnd.dealPlanOf();
check('降级后计划仍覆盖全部卡牌', !!rplan && Object.keys(rplan).length === lv.tiles.length,
  rplan ? Object.keys(rplan).length : 'null');
check('降级分支在 introTransformOf 首段即返回 null（零位移 / 零缩放 / 零挤压）',
  /if \(reducedMotion\) return null;/.test(brSrcD));
check('降级不改总时长（无特殊短路径）',
  Math.abs(rnd.dealTotalMs() - T(nR, zMaxR)) < 1e-6, rnd.dealTotalMs());
try { pumpFrames(300); check('降级路径零异常', true); } catch (e) { check('降级路径零异常', false, e.message); }
check('降级后同样完全归位', rnd.isDealing() === false);
rnd.setReducedMotion(false);

/* ---------- ⑩ 纯表现层 ---------- */
console.log('\n⑩ 纯表现层（不改关卡数据 / 不改坐标）');
var beforeTiles = JSON.stringify(lv.tiles);
var beforeBoard = JSON.stringify(session.state().board);
var rectBefore = [];
for (var ri = 0; ri < board.length; ri++) {
  var rc0 = rnd.tileRect(board[ri].id);
  rectBefore.push(rc0 ? [rc0.x, rc0.y, rc0.w, rc0.h].join(',') : 'null');
}
rnd.startDeal();
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

/* ---------- ⑪ R6 看门狗收口（真实定时器，必须等 1200ms） ----------
 * 闸门可能因「遮罩/弹窗一直不消失」永远开不了。看门狗是唯一兜底。
 * **R6 实测修正**：单次 1200ms 到期即 `skipDeal()` 是错的——深链 `?level=N`
 * 的 `#splash-screen` 实测要到 ≈4.6s 才移除，而 `startDeal()` 在 ≈0.6s 就触发，
 * 到期时遮罩仍在 → 静置会把整段雨幕吞掉（真机探针实测 `act=false`）。
 * 现口径 = 「复查 + 重挂」：
 *   · 到期仍遮挡 → 重新挂起（`watchdogRearms++`、`armed` 保持 true、`startTime` 仍 null）
 *   · 到期且已可见 → 立即开闸（`startTime` 非 null、看门狗清零）
 *   · 累计超 `GATE_WATCHDOG_MAX_MS` → `skipDeal()` 静置（开局 MUST NOT 卡死）
 * 判据：遮挡期**绝不**静置；总预算到期才收口。 */
console.log('\n⑪ R6 看门狗复查 / 重挂 / 总预算收口（真实定时器 1200ms）');
var wdFlag = false;
var cvW = makeCanvas();
var rndW = STM.createBoardRenderer(cvW, session, {
  dealVisibleProbe: function () { return wdFlag; }
});
rndW.refresh();
rndW.startDeal();
check('③ 看门狗启动后处于挂起态', !!rndW.dealStateOf() && rndW.dealStateOf().watchdog === true);
check('③ 总预算常量 8000ms（>= 深链 splash 实测 4.6s，留足余量）',
  I.GATE_WATCHDOG_MAX_MS === 8000, String(I.GATE_WATCHDOG_MAX_MS));

function finish() {
  console.log('');
  if (fails.length) {
    console.log('deal-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('deal-smoke: all green（400ms 垂直雨幕 / 帧闸门四条件 / 看门狗复查重挂 / 层序锁 / 落子音 / 快进 / 降级 / 纯表现层）');
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

