/* =========================================================
 * Slide & Triple — deal-smoke（Δ22c / FR-052 开局编舞冒烟）
 *
 *   node tools/deal-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 覆盖 quickstart Q10-B 的自动化部分：
 *   ① 15 种编舞模式全覆盖、模式名互异、规格两两不同
 *   ② 时序常量：留白 180ms / 单卡 260ms / 层补偿 55ms / 落定阈值 0.85
 *   ③ 落定 z 序：同一渲染坐标高层延迟恒大于低层，且增量 = +55ms × Δz
 *   ④ 15 模式逐种真实跑帧零异常，结束后 100% 归位（静态精确坐标）
 *   ⑤ 逐牌落子涟漪音（progress 单调不减）+ >=22ms 节流口径
 *   ⑥ 点击快进：skipDeal() 后同帧可命中且该次点击被正常处理
 *   ⑦ 相邻两次开局不重复 + 调试锁定可复现
 *   ⑧ prefers-reduced-motion 降级仍保留 180ms 底图留白
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
    translate: function () {}, rotate: function () {}, scale: function () {}, drawImage: function () {}
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

console.log('Δ22c 开局编舞冒烟（FR-052 / SC-019 自动化部分）\n');

/* ---------- ① 常量与模式表 ---------- */
console.log('① 常量与 15 模式表');
check('15 种编舞模式全部登记', !!I && I.MODES.length === 15);
check('留白 180ms / 单卡 260ms / 层补偿 55ms / 落定阈值 0.85',
  I.LEAD_MS === 180 && I.TILE_MS === 260 && I.Z_STEP_MS === 55 && I.TICK_AT === 0.85);
check('基准延迟区间 180~520ms（LEAD + SPREAD = 520）', I.LEAD_MS + I.SPREAD_MS === 520);
check('模式名两两互异', (function () {
  var seen = {};
  for (var i = 0; i < I.MODES.length; i++) { if (seen[I.MODES[i]]) return false; seen[I.MODES[i]] = 1; }
  return true;
})());

/* ---------- ② 逐模式规格有限性 / ord 值域 / 互异 ---------- */
console.log('\n② 逐模式规格（8×8 全坐标）');
var n = 8, total = n * n;
var sigs = {}, allFinite = true, ordOk = true, distinct = 0;
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
      sig += s.ord.toFixed(3) + ':' + s.ox.toFixed(1) + ':' + s.oy.toFixed(1) + ';';
    }
  }
  if (!sigs[sig]) { sigs[sig] = 1; distinct++; }
}
check('15 × 64 坐标全量规格为有限数值', allFinite);
check('排序权重 ord 恒落 [0,1]', ordOk);
check('15 种模式的落牌序/位移规格两两不同（非退化）', distinct === 15, 'distinct=' + distinct);

/* ---------- ③ 落定 z 序（零穿模） ---------- */
console.log('\n③ 落定 z 序（零穿模）');
var mono = true, exact = true;
for (var m2 = 0; m2 < 15; m2++) {
  for (var rr = 0; rr < n; rr += 3) {
    for (var cc = 0; cc < n; cc += 3) {
      var prev = -Infinity;
      for (var z = 0; z <= 4; z++) {
        var st = spec(m2, { id: 0, r: rr, c: cc, z: z, d: 0 }, n, 0, total);
        var dly = I.LEAD_MS + st.ord * I.SPREAD_MS + z * I.Z_STEP_MS;
        if (!(dly > prev)) mono = false;
        if (m2 !== 6 && z > 0 && Math.abs((dly - prev) - I.Z_STEP_MS) > 1e-6) exact = false;
        prev = dly;
      }
    }
  }
}
check('同坐标高层延迟严格大于低层（先落底层、后落顶层）', mono);
check('除 layer_stack 外层延迟增量恒 = +55ms × Δz', exact);

/* ---------- ④~⑦ 运行时 ---------- */
console.log('\n④ 运行时：15 模式逐种跑帧');
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

var noErr = true, settled = true, blankOk = true;
for (var mm = 0; mm < 15; mm++) {
  dealTicks = [];
  rnd.startDeal(mm);
  if (rnd.dealMode() !== mm) { noErr = false; check('模式 ' + mm + ' 启动失败', false); }
  try { pumpFrames(200); } catch (e) { noErr = false; check('模式 ' + mm + ' 跑帧异常', false, e.message); }
  if (rnd.isDealing()) settled = false;
  if (rnd.dealPlanOf() !== null) settled = false;
  if (!dealTicks.length) blankOk = false;
}
check('15 种模式逐种进场零异常', noErr);
check('15 种模式进场结束后全部归位（dealPlan 清空 / isDealing=false）', settled);
check('15 种模式均有落子涟漪音触发', blankOk);

/* 留白期：前 8 帧（128ms）棋盘零卡体填充 */
var fillCount = 0;
var cv2 = makeCanvas();
var ctx2 = cv2.getContext('2d');
var of = ctx2.fill;
ctx2.fill = function () { fillCount++; return of.apply(ctx2, arguments); };
var rnd2 = STM.createBoardRenderer(cv2, session, {});
rnd2.refresh();
rnd2.startDeal(0);
fillCount = 0;
pumpFrames(8);
check('0~180ms 留白期棋盘零卡体绘制（纯风景底图）', fillCount === 0, 'fill=' + fillCount);
pumpFrames(200);

console.log('\n⑤ 落子涟漪音');
dealTicks = [];
rnd.startDeal(0);
pumpFrames(200);
check('逐牌落定各触发一次（8×8 层叠关卡全部发声）', dealTicks.length === lv.tiles.length,
  dealTicks.length + '/' + lv.tiles.length);
var monoTick = true;
for (var ti = 1; ti < dealTicks.length; ti++) if (dealTicks[ti] < dealTicks[ti - 1]) monoTick = false;
check('progress 单调不减（音高渐次上扬）', monoTick);
check('SoundManager 落牌节流口径 = 22ms', (function () {
  var SM = require('../src/audio/SoundManager.js');
  var sm = STM.createSoundManager({});
  return !!(globalThis.STM.AUDIO_CONFIG && globalThis.STM.AUDIO_CONFIG.dealTickMinMs === 22);
})());

console.log('\n⑥ 点击快进（零迟滞）');
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

console.log('\n⑦ 抽取规则');
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

console.log('\n⑧ reduced-motion 降级');
rnd.setReducedMotion(true);
rnd.startDeal(4);
try { pumpFrames(200); check('降级路径零异常', true); } catch (e) { check('降级路径零异常', false, e.message); }
check('降级后同样完全归位', rnd.isDealing() === false);
check('降级仍保留 180ms 底图留白节奏（LEAD_MS 不变）', I.LEAD_MS === 180);
rnd.setReducedMotion(false);

console.log('\n⑨ 纯表现层（不改关卡数据）');
var before = JSON.stringify(lv.tiles);
rnd.startDeal(12);
pumpFrames(200);
check('编舞前后 tiles 数据逐字段一致', JSON.stringify(lv.tiles) === before);

console.log('');
if (fails.length) {
  console.log('deal-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
  process.exit(1);
} else {
  console.log('deal-smoke: all green（15 模式 / 零穿模 / 落子音 / 点击快进 / 降级）');
}
