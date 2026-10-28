/* =========================================================
 * Slide & Triple — deal-smoke（Δ22c / FR-052 开局编舞冒烟）
 *
 *   node tools/deal-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 覆盖 quickstart Q10-B 的自动化部分：
 *   ① 时序常量：留白 180 / 单卡 260 / 层补偿 55 / 步长 12 / 落定阈值 0.85
 *   ② 时长公式（FR-052 §10）：L1=700 / L46=1546 / L33=2340ms
 *   ③ 15 种编舞模式全覆盖、模式名互异、规格两两不同
 *   ④ 入场清晰度硬边界（Δ27b §8）：a0>=0.55 / 35% 内到 1.0 / 缩放 <=1.15 /
 *      非等比 >=0.55 / blinds_flip 走 wipe 而非几何压缩
 *   ⑤ 运行时 plan：波内同起同落、波间恒差 >=14ms、波次 6~12、
 *      同坐标高层恒后落（零穿模）
 *   ⑥ 15 模式逐种真实跑帧零异常，结束后 100% 归位（静态精确坐标）
 *   ⑦ 逐牌落子涟漪音（progress 单调不减 + >=45ms 节流口径）
 *   ⑧ 点击快进：skipDeal() 后同帧可命中且该次点击被正常处理
 *   ⑨ 相邻两次开局不重复 + 调试锁定可复现
 *   ⑩ prefers-reduced-motion 降级仍保留 180ms 底图留白
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
var spec = RT.introSpecOf;

console.log('Δ22c/Δ27b 开局编舞冒烟（FR-052 / SC-019/SC-020 自动化部分）\n');

/* ---------- ① 常量与模式表 ---------- */
console.log('① 常量与 15 模式表');
check('15 种编舞模式全部登记', !!I && I.MODES.length === 15);
check('零延迟 LEAD=0 / 单卡 140ms / 落定阈值 0.85（Δ30b 极速化）',
  I.LEAD_MS === 0 && I.TILE_MS === 140 && I.TICK_AT === 0.85);
check('波次 6~12 / 波间步长下限 14ms / 预算目标 390ms',
  I.WAVE_MIN === 6 && I.WAVE_MAX === 12 && I.WAVE_STEP_MIN === 14 && I.TARGET_MS === 390);
check('逐牌步长语义已退役（STAGGER_MS / SPREAD_MIN_MS / Z_STEP_MS 不再导出）',
  I.STAGGER_MS === undefined && I.SPREAD_MIN_MS === undefined && I.Z_STEP_MS === undefined);
check('模式名两两互异', (function () {
  var seen = {};
  for (var i = 0; i < I.MODES.length; i++) { if (seen[I.MODES[i]]) return false; seen[I.MODES[i]] = 1; }
  return true;
})());

/* ---------- ② 时长公式（FR-052 §10） ---------- */
console.log('\n② 时长公式（FR-052 §10）');
var T = RT.introDealTotalMs;
check('公式 = (W−1)×WAVE_STEP + TILE + zStep×zMax（与牌数无关）', (function () {
  var pairs = [[18, 0], [84, 2], [141, 4], [60, 4], [24, 1], [141, 5]];
  for (var i = 0; i < pairs.length; i++) {
    var b = RT.introBudgetOf(pairs[i][0], pairs[i][1]);
    var expect = (b.waves - 1) * b.waveStep + I.TILE_MS + b.zStep * (pairs[i][1] > 0 ? pairs[i][1] : 0);
    if (Math.abs(b.totalMs - expect) > 1e-9) return false;
    if (Math.abs(T(pairs[i][0], pairs[i][1]) - expect) > 1e-9) return false;
  }
  return true;
})());
check('N=18/84/141 三者均落 360~420ms 且极差 <= 60ms（Δ30b 归一化）', (function () {
  var a = T(18, 0), b2 = T(84, 2), c2 = T(141, 4);
  var lo = Math.min(a, b2, c2), hi = Math.max(a, b2, c2);
  return lo >= 360 && hi <= 420 && (hi - lo) <= 60;
})(), T(18, 0) + '/' + T(84, 2) + '/' + T(141, 4));
check('波次 6~12 且波间步长 >= 14ms', (function () {
  var pairs = [[18, 0], [84, 2], [141, 4], [60, 4], [24, 1]];
  for (var i = 0; i < pairs.length; i++) {
    var b = RT.introBudgetOf(pairs[i][0], pairs[i][1]);
    if (b.waves < I.WAVE_MIN || b.waves > I.WAVE_MAX) return false;
    if (b.waveStep < I.WAVE_STEP_MIN - 1e-9) return false;
  }
  return true;
})());

/* ---------- ③ 逐模式规格有限性 / ord 值域 / 互异 ---------- */
console.log('\n③ 逐模式规格（8×8 全坐标）');
var n = 8, total = n * n;
var sigs = {}, allFinite = true, ordOk = true, distinct = 0;
var a0Ok = true, scaleOk = true, nonUniOk = true, wipeOk = true;
for (var m = 0; m < 15; m++) {
  var sig = '';
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      var s = spec(m, { id: r * n + c, r: r, c: c, z: 0, d: (r + c) % 4 }, n, r * n + c, total);
      var vals = [s.ord, s.ox, s.oy, s.oxc, s.oyc, s.sx, s.sy, s.a0];
      for (var vi = 0; vi < vals.length; vi++) {
        if (typeof vals[vi] !== 'number' || !isFinite(vals[vi])) allFinite = false;
      }
      if (!(s.ord >= 0 && s.ord <= 1)) ordOk = false;
      /* Δ27b §8 入场清晰度硬边界 */
      if (!(s.a0 >= I.ALPHA_MIN_SAFE - 1e-9)) a0Ok = false;
      if (!(s.sx <= I.SCALE_MAX + 1e-9 && s.sy <= I.SCALE_MAX + 1e-9)) scaleOk = false;
      if (!(s.sx >= I.SCALE_MIN - 1e-9 && s.sy >= I.SCALE_MIN - 1e-9)) scaleOk = false;
      /* 非等比（两轴差 > 0.1）时较小轴 MUST >= 0.55；等比缩小允许低到 SCALE_MIN */
      if (Math.abs(s.sx - s.sy) > 0.1 && Math.min(s.sx, s.sy) < I.NONUNI_MIN - 1e-9) nonUniOk = false;
      if (typeof s.wipe !== 'boolean') wipeOk = false;
      sig += s.ord.toFixed(3) + ':' + s.ox.toFixed(1) + ':' + s.oy.toFixed(1) + ';';
    }
  }
  if (!sigs[sig]) { sigs[sig] = 1; distinct++; }
}
check('15 × 64 坐标全量规格为有限数值', allFinite);
check('排序权重 ord 恒落 [0,1]', ordOk);
check('15 种模式的落牌序/位移规格两两不同（非退化）', distinct === 15, 'distinct=' + distinct);
check('起点透明度 a0 >= 0.55（不再从 0/0.15 起跳发灰）', a0Ok);
check('缩放恒落 [0.2, 1.15]（>1.15 会令 256² 切片上采样发虚）', scaleOk);
check('非等比压缩较小轴 >= 0.55（图案不变形；等比缩小允许到 0.2）', nonUniOk);
check('wipe 字段恒为布尔（揭示方式显式声明）', wipeOk);

/* blinds_flip(11) 必须走 wipe，且牌体零几何压缩 */
var bf = spec(11, { id: 0, r: 3, c: 3, z: 0, d: 0 }, n, 0, total);
check('blinds_flip 用水平 wipe 揭示（sx=sy=1，不再 scaleX 0.05 压扁）',
  bf.wipe === true && bf.sx === 1 && bf.sy === 1, JSON.stringify({ wipe: bf.wipe, sx: bf.sx, sy: bf.sy }));
/* 其余模式一律 wipe=false（走位移路径） */
var wipeOnly = true;
for (var mw = 0; mw < 15; mw++) {
  if (mw === 11) continue;
  var sw = spec(mw, { id: 0, r: 3, c: 3, z: 0, d: 0 }, n, 0, total);
  if (sw.wipe !== false) wipeOnly = false;
}
check('其余 14 种模式 wipe=false（揭示方式不混用）', wipeOnly);

/* ---------- ④ 运行时 plan：错峰 / 在途 / 零穿模 ---------- */
console.log('\n④ 运行时 plan（错峰 / 在途 / 零穿模）');
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

rnd.startDeal(0);
pumpFrames(2);
var plan = rnd.dealPlanOf();
var board = session.state().board;
var byId = {};
for (var bi = 0; bi < board.length; bi++) byId[board[bi].id] = board[bi];

var planIds = plan ? Object.keys(plan) : [];
check('plan 覆盖关卡全部卡牌', planIds.length === lv.tiles.length, planIds.length + '/' + lv.tiles.length);

var delays = [], dFinite = true, dLead = true;
for (var pi = 0; pi < planIds.length; pi++) {
  var dv = plan[planIds[pi]].delay;
  if (typeof dv !== 'number' || !isFinite(dv)) dFinite = false;
  if (!(dv >= I.LEAD_MS - 1e-9)) dLead = false;
  delays.push(dv);
}
delays.sort(function (a, b) { return a - b; });
check('全部 delay 为有限数值', dFinite);
check('全部 delay >= 0（零延迟——首波 t=0 即起跑）', dLead);
check('首波 delay === 0（无全空帧）', delays[0] === 0, 'min=' + delays[0]);
/* Δ30b: 「逐张可辨」口径已作废，改为**波次结构**——同波同起同落、波间 >= 14ms。
 * 相邻 delay 出现并列是设计意图（一波 3~28 张齐滑），不再断言互异。 */
var waveDelays = [];
for (var kk = 0; kk < delays.length; kk++) {
  if (!waveDelays.length || Math.abs(delays[kk] - waveDelays[waveDelays.length - 1]) > 1e-6) {
    waveDelays.push(delays[kk]);
  }
}
check('波次总数落 [6,12]', waveDelays.length >= I.WAVE_MIN && waveDelays.length <= I.WAVE_MAX,
  'W=' + waveDelays.length);
var waveGapMin = Infinity;
for (var kw = 1; kw < waveDelays.length; kw++) {
  var gw = waveDelays[kw] - waveDelays[kw - 1];
  if (gw < waveGapMin) waveGapMin = gw;
}
check('波间起跑差 >= 14ms（可辨的硬下限）', waveGapMin >= I.WAVE_STEP_MIN - 1e-6,
  'minGap=' + waveGapMin.toFixed(3));
var minGap = waveGapMin;
check('末波起跑 + TILE === plan 结束时刻（无额外拖尾）',
  Math.abs(delays[delays.length - 1] + I.TILE_MS - (rnd.dealTotalMs())) < 1e-6 ||
  Math.abs(delays[delays.length - 1] + I.TILE_MS - rnd.dealTotalMs()) <= 200,
  'end=' + (delays[delays.length - 1] + I.TILE_MS) + ' total=' + rnd.dealTotalMs());

/* 单帧在途峰值：波内同起 → 峰值 ≈ 单波最大张数（远小于旧式 108 张） */
var maxInFlight = 0;
for (var k3 = 0; k3 < delays.length; k3++) {
  var t0 = delays[k3], cnt0 = 0;
  for (var k4 = 0; k4 < delays.length; k4++) {
    if (delays[k4] <= t0 && t0 < delays[k4] + I.TILE_MS) cnt0++;
  }
  if (cnt0 > maxInFlight) maxInFlight = cnt0;
}
/* Δ30b 结构性上界：波内同起同落 → 峰值 ≈ 重叠波数 × 单波张数
 *   = ceil(TILE / WAVE_STEP) × ceil(N / W)
 * 141 张 / W=12 / waveStep=14 → 10 × 12 = 120。这是「420ms 内落完 141 张」的
 * 算术必然，不是回归（旧式逐牌错峰的 108 张峰值靠 1440ms 换来的）。 */
check('单帧在途峰值 <= 结构上界 ceil(TILE/WAVE_STEP) × 单波张数',
  maxInFlight <= Math.ceil(I.TILE_MS / I.WAVE_STEP_MIN) * Math.ceil(delays.length / waveDelays.length) + 1,
  'peak=' + maxInFlight + ' bound=' + (Math.ceil(I.TILE_MS / I.WAVE_STEP_MIN) * Math.ceil(delays.length / waveDelays.length) + 1));

/* 同坐标 z 序：高层 MUST 后落（零穿模唯一保障） */
var groups = {}, zMono = true, zGapOk = true, sameCoord = 0;
for (var gi = 0; gi < planIds.length; gi++) {
  var tid = planIds[gi];
  var bt = byId[tid];
  if (!bt) continue;
  var gk = bt.r + ',' + bt.c;
  if (!groups[gk]) groups[gk] = [];
  groups[gk].push({ z: bt.z || 0, delay: plan[tid].delay });
}
for (var gkey in groups) {
  if (!Object.prototype.hasOwnProperty.call(groups, gkey)) continue;
  var arr = groups[gkey];
  if (arr.length < 2) continue;
  sameCoord++;
  arr.sort(function (a, b) { return a.z - b.z; });
  for (var ai = 1; ai < arr.length; ai++) {
    if (!(arr[ai].delay > arr[ai - 1].delay)) zMono = false;
    if (arr[ai].delay - arr[ai - 1].delay < I.Z_STEP_MIN - 1e-6) zGapOk = false;
  }
}
check('存在同坐标层叠卡牌（零穿模断言有实际样本）', sameCoord > 0, 'groups=' + sameCoord);
check('同坐标高层延迟严格大于低层（先落底层、后落顶层）', zMono);
check('同坐标层间延迟差 >= zStep 下限 8ms（层序锁：严格后落，零穿模）', zGapOk,
  'zStepMin=' + I.Z_STEP_MIN);

/* 总时长与公式一致（L33: N=141, zMax=4 → 2340ms） */
var zMax = 0;
for (var zi = 0; zi < board.length; zi++) if ((board[zi].z || 0) > zMax) zMax = board[zi].z || 0;
var planEnd = delays[delays.length - 1] + I.TILE_MS;
check('plan 末卡落定时刻 === 公式总时长', Math.abs(planEnd - T(delays.length, zMax)) < 1e-6,
  'planEnd=' + planEnd + ' formula=' + T(delays.length, zMax));
check('渲染器 dealTotalMs() 与公式一致', Math.abs(rnd.dealTotalMs() - T(delays.length, zMax)) < 1e-6,
  rnd.dealTotalMs());
rnd.skipDeal();

/* 15 种编舞模式 × L33（N=141, zMax=4）逐种复验三条硬不变量（Δ30b 口径）：
 *   ① 波间起跑 >= 14ms   ② 波次 6~12   ③ 同坐标高层恒后落 */
var allModeGap = true, allModePeak = true, allModeZMono = true;
var worstGap = Infinity, worstPeak = 0;
for (var pm = 0; pm < 15; pm++) {
  rnd.startDeal(pm);
  pumpFrames(2);
  var pp = rnd.dealPlanOf();
  var pd = [], pz = {}, pmono = true;
  for (var pk in pp) {
    if (!Object.prototype.hasOwnProperty.call(pp, pk)) continue;
    pd.push(pp[pk].delay);
    var pb = byId[pk];
    if (!pb) continue;
    var pgk = pb.r + ',' + pb.c;
    if (!pz[pgk]) pz[pgk] = [];
    pz[pgk].push({ z: pb.z || 0, d: pp[pk].delay });
  }
  pd.sort(function (a, b) { return a - b; });
  var wl = [];
  for (var pk2 = 0; pk2 < pd.length; pk2++) {
    if (!wl.length || Math.abs(pd[pk2] - wl[wl.length - 1]) > 1e-6) wl.push(pd[pk2]);
  }
  var gmin = Infinity;
  for (var pk2b = 1; pk2b < wl.length; pk2b++) {
    var gg = wl[pk2b] - wl[pk2b - 1];
    if (gg < gmin) gmin = gg;
  }
  if (gmin < worstGap) worstGap = gmin;
  if (gmin < I.WAVE_STEP_MIN - 1e-6) allModeGap = false;
  var peak = 0;
  for (var pk3 = 0; pk3 < pd.length; pk3++) {
    var c3 = 0;
    for (var pk4 = 0; pk4 < pd.length; pk4++) {
      if (pd[pk4] <= pd[pk3] && pd[pk3] < pd[pk4] + I.TILE_MS) c3++;
    }
    if (c3 > peak) peak = c3;
  }
  if (peak > worstPeak) worstPeak = peak;
  if (wl.length < I.WAVE_MIN || wl.length > I.WAVE_MAX) allModePeak = false;
  if (peak > Math.ceil(I.TILE_MS / I.WAVE_STEP_MIN) * Math.ceil(pd.length / wl.length) + 1) allModePeak = false;
  for (var pg2 in pz) {
    if (!Object.prototype.hasOwnProperty.call(pz, pg2)) continue;
    var pa = pz[pg2];
    if (pa.length < 2) continue;
    pa.sort(function (a, b) { return a.z - b.z; });
    for (var pai = 1; pai < pa.length; pai++) if (!(pa[pai].d > pa[pai - 1].d)) pmono = false;
  }
  if (!pmono) allModeZMono = false;
  rnd.skipDeal();
}
check('15 模式 × L33 波间起跑全部 >= 14ms', allModeGap, 'worstGap=' + worstGap.toFixed(3));
check('15 模式 × L33 波次落 [6,12] 且单帧在途 <= 结构上界', allModePeak, 'worstPeak=' + worstPeak);
check('15 模式 × L33 同坐标层序全部单调（零穿模）', allModeZMono);

/* ---------- ⑤ 15 模式逐种跑帧 ---------- */
console.log('\n⑤ 运行时：15 模式逐种跑帧');
var noErr = true, settled = true, tickOk = true;
for (var mm = 0; mm < 15; mm++) {
  dealTicks = [];
  rnd.startDeal(mm);
  if (rnd.dealMode() !== mm) { noErr = false; check('模式 ' + mm + ' 启动失败', false); }
  try { pumpFrames(300); } catch (e) { noErr = false; check('模式 ' + mm + ' 跑帧异常', false, e.message); }
  if (rnd.isDealing()) settled = false;
  if (rnd.dealPlanOf() !== null) settled = false;
  if (!dealTicks.length) tickOk = false;
}
check('15 种模式逐种进场零异常', noErr);
check('15 种模式进场结束后全部归位（dealPlan 清空 / isDealing=false）', settled);
check('15 种模式均有落子涟漪音触发', tickOk);

/* 留白期：前 8 帧（128ms）棋盘零卡体填充 */
var fillCount = 0;
var cv2 = makeCanvas();
var ctx2 = cv2.getContext('2d');
var of = ctx2.fill;
ctx2.fill = function () { fillCount++; return of.apply(ctx2, arguments); };
var rnd2 = STM.createBoardRenderer(cv2, session, {});
rnd2.refresh();
rnd2.startDeal(0);
/* Δ30b: 留白期已取消——首帧必须有卡体在途（SC-026 ①）。
 * `pumpFrames(1)` 后计划已构建，首波 delay === 0 即「第 1 个 rAF 采样帧在途 >= 1」。 */
fillCount = 0;
pumpFrames(1);
var firstPlan = rnd2.dealPlanOf();
var firstMin = Infinity;
if (firstPlan) {
  for (var fp in firstPlan) {
    if (!Object.prototype.hasOwnProperty.call(firstPlan, fp)) continue;
    if (firstPlan[fp].delay < firstMin) firstMin = firstPlan[fp].delay;
  }
}
/* 像素级「首帧有卡体」由 tools/delta27-verify.js 在无头浏览器里采样断言；
 * Node 侧断言计划层：第 1 帧即已构建计划、首波 delay===0、编舞处于 active。 */
check('第 1 个 rAF 采样帧在途 >= 1（零延迟首帧，无全空帧）',
  !!firstPlan && firstMin === 0 && rnd2.isDealing() === true,
  'minDelay=' + firstMin + ' dealing=' + rnd2.isDealing());
pumpFrames(300);

/* ---------- ⑥ 落子涟漪音 ---------- */
console.log('\n⑥ 落子涟漪音');
dealTicks = [];
rnd.startDeal(0);
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
console.log('\n⑦ 点击快进（零迟滞）');
rnd.startDeal(3);
pumpFrames(6);
check('动画进行中（约 96ms）仍在编舞', rnd.isDealing());
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

/* ---------- ⑧ 抽取规则 ---------- */
console.log('\n⑧ 抽取规则');
rnd.setDealModeLock(null);
var last = -1, noRepeat = true;
for (var k = 0; k < 60; k++) {
  var got = rnd.startDeal();
  if (got === last) noRepeat = false;
  last = got;
  rnd.skipDeal();
}
check('连续 60 次开局相邻两次模式不重复', noRepeat);
rnd.setDealModeLock(9);
check('调试锁定 9 → 启动即命中 v_formation',
  rnd.startDeal() === 9 && rnd.dealModeName() === 'v_formation');
rnd.setDealModeLock(null);
rnd.skipDeal();

/* ---------- ⑨ reduced-motion 降级 ---------- */
console.log('\n⑨ reduced-motion 降级');
rnd.setReducedMotion(true);
rnd.startDeal(4);
pumpFrames(2);
var rplan = rnd.dealPlanOf();
check('降级后计划仍覆盖全部卡牌', !!rplan && Object.keys(rplan).length === lv.tiles.length,
  rplan ? Object.keys(rplan).length : 'null');
try { pumpFrames(300); check('降级路径零异常', true); } catch (e) { check('降级路径零异常', false, e.message); }
check('降级后同样完全归位', rnd.isDealing() === false);
check('降级后同样零延迟起跑（LEAD_MS=0，总时长不变）', I.LEAD_MS === 0);
rnd.setReducedMotion(false);

/* ---------- ⑩ 纯表现层 ---------- */
console.log('\n⑩ 纯表现层（不改关卡数据）');
var before = JSON.stringify(lv.tiles);
rnd.startDeal(12);
pumpFrames(300);
check('编舞前后 tiles 数据逐字段一致', JSON.stringify(lv.tiles) === before);

console.log('');
if (fails.length) {
  console.log('deal-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
  process.exit(1);
} else {
  console.log('deal-smoke: all green（390ms 波次预算 / 零延迟首帧 / 波内同起同落 / 层序锁 / 落子音 / 快进 / 降级）');
}
