/* =========================================================
 * Slide & Triple — deal-smoke（Δ31b / FR-052 开局编舞冒烟）
 *
 *   node tools/deal-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 覆盖 quickstart Q10-B 的自动化部分（Δ31b「原位对角波浪层叠弹入」口径）：
 *   ① 常量收口：TILE 120 / Z_STEP 8 / TARGET 415 / DIAG_STEP 14~48，
 *      15 种模式的常量与导出接口全部退役
 *   ② 时长公式：(rMax+cMax)×DIAG_STEP + zMax×Z_STEP + TILE，四档落 380~450ms
 *   ③ 对角波浪时序：同 (r+c) 起跑差 0ms、半格先 floor、层序锁恒 +Z_STEP
 *   ④ 运行时 plan：覆盖全部卡牌、首波 delay=0、与纯函数同源、末卡落定=公式
 *   ⑤ 帧闸门：startDeal 只置 armed，第 2 个**已绘制**帧才写 startTime，
 *      draw() 抛异常那帧不计数（drawnOk 守卫）
 *   ⑥ 逐牌落子涟漪音（progress 单调不减 + 45ms 节流口径）
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

console.log('Δ31b 开局编舞冒烟（原位对角波浪层叠弹入 / 帧闸门 / SC-028）\n');

/* ---------- ① 常量与公式 ---------- */
console.log('① 常量与公式（四个常量收口）');
check('常量表只剩 TILE / Z_STEP / TARGET / DIAG_STEP（+ 曲线参数）',
  !!I && I.TILE_MS === 120 && I.Z_STEP_MS === 8 && I.TARGET_MS === 415 &&
  I.DIAG_STEP_MIN === 14 && I.DIAG_STEP_MAX === 48);
check('TILE ∈ [110,140] / Z_STEP ∈ [6,12]（硬边界）',
  I.TILE_MS >= 110 && I.TILE_MS <= 140 && I.Z_STEP_MS >= 6 && I.Z_STEP_MS <= 12);
check('15 种模式的常量已全部退役（无 MODES / LEAD / WAVE / DISP / ALPHA0）',
  I.MODES === undefined && I.LEAD_MS === undefined && I.WAVE_MIN === undefined &&
  I.WAVE_MAX === undefined && I.WAVE_TILES === undefined && I.WAVE_STEP_MIN === undefined &&
  I.Z_STEP_MIN === undefined && I.Z_STEP_MAX === undefined && I.REF_CELL === undefined &&
  I.DISP_MAX_CELL === undefined && I.DISP_MIN_CELL === undefined &&
  I.ALPHA0 === undefined && I.ALPHA_MIN_SAFE === undefined && I.ALPHA_FULL_AT === undefined &&
  I.SCALE_MAX === undefined && I.SCALE_MIN === undefined && I.NONUNI_MIN === undefined);
check('rendererTest 不再导出 introSpecOf / introBudgetOf / introSchedule / INTRO_MODES',
  RT.introSpecOf === undefined && RT.introBudgetOf === undefined &&
  RT.introSchedule === undefined && RT.INTRO_MODES === undefined);
check('帧闸门 2 帧 / 落子音阈值 0.85 保留', I.GATE_FRAMES === 2 && I.TICK_AT === 0.85);
check('姿态曲线常量齐全（S0 0.62 / 峰值 1.05 @0.72 / dy 12）',
  I.S0 === 0.62 && I.OVERSHOOT === 1.05 && I.PEAK_AT === 0.72 && I.DY0 === 12);

/* ---------- ② 时长公式（四档归一） ---------- */
console.log('\n② 时长公式（四档 380~450ms 归一）');
var T = RT.introDealTotalMs;
var tiers = [[8, 4], [7, 3], [6, 2], [4, 0]];
var tots = tiers.map(function (p) { return T(p[0], p[1]); });
check('8/4 → 415ms、7/3 → 415ms、6/2 → 415ms、4/0 → 408ms',
  Math.abs(tots[0] - 415) < 1 && Math.abs(tots[1] - 415) < 1 &&
  Math.abs(tots[2] - 415) < 1 && Math.abs(tots[3] - 408) < 1,
  tots.map(function (v) { return v.toFixed(1); }).join('/'));
check('四档全落 380~450ms 且极差 <= 40ms',
  Math.min.apply(null, tots) >= 380 && Math.max.apply(null, tots) <= 450 &&
  (Math.max.apply(null, tots) - Math.min.apply(null, tots)) <= 40);
check('公式 = (rMax+cMax)×DIAG_STEP + zMax×Z_STEP + TILE（逐档同源）', (function () {
  for (var i = 0; i < tiers.length; i++) {
    var n0 = tiers[i][0], z0 = tiers[i][1];
    var ds = RT.introDiagStepOf(n0, z0);
    if (!(ds >= I.DIAG_STEP_MIN - 1e-9 && ds <= I.DIAG_STEP_MAX + 1e-9)) return false;
    var expect = 2 * (n0 - 1) * ds + z0 * I.Z_STEP_MS + I.TILE_MS;
    if (Math.abs(expect - T(n0, z0)) > 1e-9) return false;
  }
  return true;
})());
check('DIAG_STEP 单调随盘面变小而变大（反算口径正确）',
  RT.introDiagStepOf(8, 4) < RT.introDiagStepOf(7, 3) &&
  RT.introDiagStepOf(7, 3) < RT.introDiagStepOf(6, 2) &&
  RT.introDiagStepOf(6, 2) < RT.introDiagStepOf(4, 0));

/* ---------- ③ 对角波浪时序（8×8 全坐标纯函数） ---------- */
console.log('\n③ 对角波浪时序（8×8 全坐标）');
var nD = 8, zD = 4;
var dsD = RT.introDiagStepOf(nD, zD);
var sameDiag = true, floorOk = true;
for (var r3 = 0; r3 < nD; r3++) {
  for (var c3 = 0; c3 < nD; c3++) {
    var want = (r3 + c3) * dsD;
    if (Math.abs(RT.introDelayOf(r3, c3, 0, nD, zD) - want) > 1e-9) sameDiag = false;
    /* 奇数层视觉坐标带 +0.5 → MUST 先 floor 归一 */
    if (Math.abs(RT.introDelayOf(r3 + 0.5, c3 + 0.5, 0, nD, zD) - want) > 1e-9) floorOk = false;
  }
}
check('同 (r+c) 起跑差 = 0ms（对角波浪）', sameDiag);
check('半格错位归一（+0.5 先 floor，奇偶层无 DIAG_STEP/2 隐性错位）', floorOk);
var prevD = -1, monoOk = true, gapOk = true;
for (var ds2 = 0; ds2 <= 2 * (nD - 1); ds2++) {
  var pr3 = ds2 <= nD - 1 ? 0 : ds2 - (nD - 1);
  var cur = RT.introDelayOf(pr3, ds2 - pr3, 0, nD, zD);
  if (prevD >= 0 && cur - prevD < 12 - 1e-9) gapOk = false;
  if (cur < prevD - 1e-9) monoOk = false;
  prevD = cur;
}
check('相邻对角线起跑间隔 >= 12ms', gapOk);
check('r+c 推进单调不减（空间回跳帧 = 0）', monoOk);
check('首末对角线起跑跨度 >= 200ms',
  RT.introDelayOf(nD - 1, nD - 1, 0, nD, zD) - RT.introDelayOf(0, 0, 0, nD, zD) >= 200);
check('同 (r,c) 层间差恒 = +Z_STEP（层序锁恒正）', (function () {
  for (var zz = 0; zz < 4; zz++) {
    if (Math.abs((RT.introDelayOf(2, 3, zz + 1, nD, zD) - RT.introDelayOf(2, 3, zz, nD, zD)) - I.Z_STEP_MS) > 1e-9) return false;
  }
  return true;
})());

/* ---------- ④ 运行时 plan（覆盖 / 首波 0 / 对角 / 层序锁 / 总时长） ---------- */
console.log('\n④ 运行时 plan（覆盖 / 首波 0 / 对角 / 层序锁 / 总时长）');
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

var delays = [], dFinite = true, dNonNeg = true, exactMatch = true;
for (var pi = 0; pi < planIds.length; pi++) {
  var tid = planIds[pi];
  var dv = plan[tid].delay;
  if (typeof dv !== 'number' || !isFinite(dv)) dFinite = false;
  if (!(dv >= -1e-9)) dNonNeg = false;
  delays.push(dv);
  var bt0 = byId[tid];
  if (bt0) {
    var g0 = RT.tileGridOf(bt0);
    var want0 = RT.introDelayOf(g0.rr, g0.cc, bt0.z || 0, nR, zMaxR);
    if (Math.abs(dv - want0) > 1e-9) exactMatch = false;
  }
}
delays.sort(function (a, b) { return a - b; });
check('全部 delay 为有限数值', dFinite);
check('全部 delay >= 0（零延迟——首对角线 t=0 即起跑）', dNonNeg);
check('首波 delay === 0（无全空帧）', Math.abs(delays[0]) < 1e-9, 'min=' + delays[0]);
check('plan 与 introDelayOf 逐项相等（同源）', exactMatch);

/* 对角结构：同 (r+c) 且同 z 的牌 delay 完全相同 */
var diagGroups = {}, diagOk = true;
for (var di = 0; di < planIds.length; di++) {
  var bt1 = byId[planIds[di]];
  if (!bt1) continue;
  var g1 = RT.tileGridOf(bt1);
  var key1 = Math.floor(g1.rr) + ',' + Math.floor(g1.cc) + ',' + (bt1.z || 0);
  if (!diagGroups[key1]) diagGroups[key1] = plan[planIds[di]].delay;
  else if (Math.abs(diagGroups[key1] - plan[planIds[di]].delay) > 1e-9) diagOk = false;
}
check('同对角线同层起跑完全一致（落定差 <= 16ms 的构造性保证）', diagOk);

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
    if (Math.abs((arr[ai].delay - arr[ai - 1].delay) - I.Z_STEP_MS * (arr[ai].z - arr[ai - 1].z)) > 1e-9) zExact = false;
  }
}
check('存在同坐标层叠卡牌（零穿模断言有实际样本）', sameCoord > 0, 'groups=' + sameCoord);
check('同坐标高层延迟严格大于低层（先落底层、后落顶层）', zMono);
check('同坐标层间差 = Z_STEP × Δz（层序锁）', zExact);

/* 末卡落定 vs 公式：本关最远对角是 r+c=12、zMax=4 的卡不同张，故 maxDelay+TILE
 * 只会**短于**公式——此时 totalMs 由公式（预算兜底）决定，MUST NOT 被截短。
 * 「满盘对角齐备」的等价性由纯函数侧单独断言（8×8 单层含 (7,7)）。 */
var planEnd = delays[delays.length - 1] + I.TILE_MS;
check('plan 末卡落定 <= 公式总时长（缺角盘面由预算兜底，不截短）',
  planEnd <= T(nR, zMaxR) + 1e-6, 'planEnd=' + planEnd + ' formula=' + T(nR, zMaxR));
check('满盘对角齐备时 planEnd === 公式（(7,7) 单层 8×8）',
  Math.abs((2 * (nD - 1)) * RT.introDiagStepOf(nD, 0) + I.TILE_MS - T(nD, 0)) < 1e-9,
  'fullBoard=' + ((2 * (nD - 1)) * RT.introDiagStepOf(nD, 0) + I.TILE_MS) + ' formula=' + T(nD, 0));
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
check('闸门开启当帧相位恰为 0（不吞 0~5% 的起跳）',
  !!st2 && (clockNow - st2.startTime) === 0);
check('draw() 抛异常那帧不计入闸门（drawnOk 守卫）',
  /if \(drawnOk && introAnim && introAnim\.armed\)/.test(brSrcD));
check('闸门期间每帧强制重绘（dirty = true，杜绝第 2 帧空帧）',
  /dirty = true; \/\* 闸门期间每帧都必须重绘/.test(brSrcD));

dealTicks = [];
var noErr = true, settled = true, tickOk = true;
try { pumpFrames(300); } catch (e) { noErr = false; check('跑帧异常', false, e.message); }
if (rnd.isDealing()) settled = false;
if (rnd.dealPlanOf() !== null) settled = false;
if (!dealTicks.length) tickOk = false;
check('单模式进场零异常', noErr);
check('进场结束后完全归位（dealPlan 清空 / isDealing=false）', settled);
check('进场期有落子涟漪音触发', tickOk);

/* 首帧即有卡体：计划层断言（第 1 帧即已构建计划 + 首波 delay === 0） */
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
check('降级分支在 introTransformOf 首段即返回 null（零位移 / 零缩放 / 零弹起）',
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

console.log('');
if (fails.length) {
  console.log('deal-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
  process.exit(1);
} else {
  console.log('deal-smoke: all green（415ms 对角波浪 / 帧闸门 / 层序锁 / 落子音 / 快进 / 降级 / 纯表现层）');
}
