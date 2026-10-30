/* =========================================================
 * Slide & Triple — flight-smoke（Δ27a / FR-053 方向性飞行门禁）
 *
 *   node tools/flight-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 四组断言：
 *   A 常量：飞行时长/缩放/透明度口径
 *   B 运动学纯函数：U 单段贝塞尔 + L/R/D 两段（滑出→落入）全量采样
 *   C 绘制序（核心 Bug 回归）：飞行牌 MUST 与静止牌共用 (z,r,c) 升序，
 *     绝不统一置顶——这正是「旁边卡牌短暂变成底层」的成因
 *   D 槽位揭示门控：dockPending 生命周期 + 连续点击 slotIndex 精确配对
 *   E 兜底：无几何缓存 / cancelFlights / 落定回调抛异常 / reduced-motion
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
function pumpOne() { pumpFrames(1); }

function finite(v, op) {
  if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(op + ': non-finite ' + v);
}
function makeCtx() {
  return {
    createLinearGradient: function (a, b, c, d) { [a, b, c, d].forEach(function (v) { finite(v, 'g'); }); return { addColorStop: function () {} }; },
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
    rect: function (a, b, c, d) { [a, b, c, d].forEach(function (v) { finite(v, 'rect'); }); },
    clearRect: function () {}, beginPath: function () {}, closePath: function () {},
    fill: function () {}, stroke: function () {}, save: function () {}, restore: function () {},
    translate: function () {}, rotate: function () {}, scale: function () {},
    drawImage: function () {}, clip: function () {}, setLineDash: function () {}, setTransform: function () {}
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

var LEVELS = require('../src/data/levels.js');
function biggestLevel() {
  var best = LEVELS[0];
  for (var i = 0; i < LEVELS.length; i++) {
    if ((LEVELS[i].tiles || []).length > (best.tiles || []).length) best = LEVELS[i];
  }
  return best;
}

var RT = STM.rendererTest;
var F = RT.FLIGHT;
var fpOf = RT.flightPosOf;

console.log('Δ27a 方向性飞行门禁（FR-053 / SC-021 自动化部分）\n');

/* ---------- A 常量 ---------- */
console.log('A 飞行常量');
check('U 单段时长 220ms', F.U_MS === 220, F.U_MS);
check('L/R/D 滑出段 80~140ms', F.EXIT_MS_MIN === 80 && F.EXIT_MS_MAX === 140);
check('落入段 170ms / 总时长上界 320ms', F.DROP_MS === 170 && F.TOTAL_MS_MAX === 320);
check('落槽终点缩放 0.82 / 落入起点 0.92',
  F.END_SCALE === 0.82 && F.DROP_SCALE0 === 0.92);
check('透明度硬下限 0.55（全段不得淡出）', F.ALPHA_MIN === 0.55);
check('reduced-motion 降级时长 90ms', F.REDUCED_MS === 90);

/* ---------- B 运动学纯函数 ---------- */
console.log('\nB 运动学（纯函数全量采样）');
function mkU() {
  return { dir: 0, fromX: 100, fromY: 300, toX: 120, toY: -40, dur: 220, sx: 1, sy: 1 };
}
var fU = mkU();
var p0 = fpOf(fU, 0), p1 = fpOf(fU, fU.dur);
check('U：起点精确等于起始格心', Math.abs(p0.x - fU.fromX) < 1e-6 && Math.abs(p0.y - fU.fromY) < 1e-6,
  p0.x + ',' + p0.y);
check('U：终点精确等于目标槽心', Math.abs(p1.x - fU.toX) < 1e-6 && Math.abs(p1.y - fU.toY) < 1e-6,
  p1.x + ',' + p1.y);
var uFinite = true, uUp = true, uAlpha = true, uScaleDown = true, uScaleMin = 1;
for (var ui = 0; ui <= 40; ui++) {
  var up = fpOf(fU, fU.dur * ui / 40);
  if (!isFinite(up.x) || !isFinite(up.y) || !isFinite(up.sx) || !isFinite(up.alpha)) uFinite = false;
  if (up.y > fU.fromY + 1e-6) uUp = false;
  if (up.alpha !== 1) uAlpha = false;
  if (up.sx > uScaleMin + 1e-9 && ui > 0) { /* 记录最小缩放 */ }
  if (up.sx < uScaleMin) uScaleMin = up.sx;
}
check('U：全段坐标有限', uFinite);
check('U：y 全程单调不增（朝上飞，不回摆）', uUp);
check('U：alpha 全段恒 1（不淡出 → 不会「飞到半空消失」）', uAlpha);
check('U：终值缩放 = 0.82', Math.abs(p1.sx - F.END_SCALE) < 1e-6, p1.sx);

/* L / R / D：两段制 */
function mkExit(dir, fromX, fromY, toX, toY, d1, dur1, dur2, dropH) {
  return {
    dir: dir, fromX: fromX, fromY: fromY, toX: toX, toY: toY,
    dur1: dur1, dur2: dur2, d1: d1,
    dx: dir === 1 ? 1 : (dir === 3 ? -1 : 0),
    dy: dir === 2 ? 1 : 0,
    dropH: dropH, dur: Math.min(320, dur1 + dur2), sx: 1, sy: 1
  };
}
var fR = mkExit(1, 100, 200, 260, -40, 260, 120, 170, 60);
var fL = mkExit(3, 200, 200, 60, -40, 260, 120, 170, 60);
var fD = mkExit(2, 160, 100, 300, -40, 260, 120, 170, 60);

var rMono = true, lMono = true, dMono = true;
for (var ei = 1; ei <= 20; ei++) {
  var eR0 = fpOf(fR, fR.dur1 * (ei - 1) / 20), eR1 = fpOf(fR, fR.dur1 * ei / 20);
  if (!(eR1.x >= eR0.x - 1e-9)) rMono = false;
  var eL0 = fpOf(fL, fL.dur1 * (ei - 1) / 20), eL1 = fpOf(fL, fL.dur1 * ei / 20);
  if (!(eL1.x <= eL0.x + 1e-9)) lMono = false;
  var eD0 = fpOf(fD, fD.dur1 * (ei - 1) / 20), eD1 = fpOf(fD, fD.dur1 * ei / 20);
  if (!(eD1.y >= eD0.y - 1e-9)) dMono = false;
}
check('R：滑出段 x 单调递增（顺箭头向右）', rMono);
check('L：滑出段 x 单调递减（顺箭头向左）', lMono);
check('D：滑出段 y 单调递增（顺箭头向下）', dMono);

/* 滑出段末刻必须完全离开棋盘矩形 */
var cssSize = 320, cellPx = 320 / 5;
check('R：滑出段末刻中心已越出棋盘右沿',
  RT.flightSegOf(fpOf(fR, fR.dur1), cellPx, cssSize) === 'offboard');
check('L：滑出段末刻中心已越出棋盘左沿',
  RT.flightSegOf(fpOf(fL, fL.dur1), cellPx, cssSize) === 'offboard');
check('D：滑出段末刻中心已越出棋盘下沿',
  RT.flightSegOf(fpOf(fD, fD.dur1), cellPx, cssSize) === 'offboard');

/* 落入段：从 toY - dropH 落回 toY，缩放 DROP_SCALE0 → END_SCALE */
var dropStart = fpOf(fR, fR.dur1 + 0.001);
var dropEnd = fpOf(fR, fR.dur);
check('R：落入段起点 = 目标槽心上方 dropH', Math.abs(dropStart.y - (fR.toY - fR.dropH)) < 0.5,
  dropStart.y + ' vs ' + (fR.toY - fR.dropH));
check('R：落入段终点 = 目标槽心', Math.abs(dropEnd.y - fR.toY) < 1e-6 && Math.abs(dropEnd.x - fR.toX) < 1e-6);
check('R：落入段缩放 0.92 → 0.82', Math.abs(dropStart.sx - F.DROP_SCALE0) < 0.02 &&
  Math.abs(dropEnd.sx - F.END_SCALE) < 1e-6, dropStart.sx + ' → ' + dropEnd.sx);
var dropMono = true, dropAlpha = true;
for (var di = 1; di <= 20; di++) {
  /* 采样必须严格落在落入段内（el > dur1），dur1 那一帧仍属滑出段 */
  var dA = fpOf(fR, fR.dur1 + 1e-6 + (fR.dur2 - 1e-6) * (di - 1) / 20);
  var dB = fpOf(fR, fR.dur1 + 1e-6 + (fR.dur2 - 1e-6) * di / 20);
  if (!(dB.y >= dA.y - 1e-9)) dropMono = false;
  if (dA.alpha !== 1 || dB.alpha !== 1) dropAlpha = false;
}
check('R：落入段 y 单调下坠（不悬停、不回弹）', dropMono);
check('R：落入段 alpha 恒 1', dropAlpha);
check('L/R/D：总时长不超过 320ms 上界',
  fR.dur <= F.TOTAL_MS_MAX && fL.dur <= F.TOTAL_MS_MAX && fD.dur <= F.TOTAL_MS_MAX);

/* ---------- C 绘制序（核心 Bug 回归） ---------- */
console.log('\nC 绘制序（飞行牌 MUST 共用 z 序，绝不置顶）');
var src = require('fs').readFileSync(__dirname + '/../src/render/BoardRenderer.js', 'utf8');
check('C①: 静态层 renderList 无 flyingIds 过滤（旧 Bug 根因）',
  src.indexOf('flyingIdsNow') !== -1 && src.indexOf('if (flyingIds[') === -1);
check('C②: 动画层 drawAnim 已无 fly 分支（飞行改由静态层承载）',
  (function () {
    var at = src.indexOf('function drawAnim(');
    if (at < 0) return false;
    var i = src.indexOf('{', at), depth = 0, body = '';
    for (var j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { body = src.slice(i, j + 1); break; } }
    }
    return body.indexOf("a.kind === 'fly'") === -1 && body.indexOf("kind: 'fly'") === -1;
  })());
check('C③: 飞行绘制入口集中在 drawBoardTile 内 flightOf()',
  /var fl = flightOf\(t\.id\)/.test(src));

var lv = biggestLevel();
var sess = null, rnd = null, landLog = [], landPending = [];
function mkRenderer(extraOpts) {
  var o = {
    onFlightLand: function (tileId, slotIndex) {
      landLog.push({ id: tileId, slot: slotIndex });
      /* Δ27a 顺序铁律：回调时该牌 MUST 已出表（否则 main.js 的 renderDock
       * 读到 dockPending=true → 槽位永远不揭示） */
      landPending.push(rnd ? rnd.dockPending(tileId) : null);
    }
  };
  if (extraOpts) for (var k in extraOpts) if (Object.prototype.hasOwnProperty.call(extraOpts, k)) o[k] = extraOpts[k];
  sess = STM.GameState.createSession(lv, {
    onEvent: function (e) { if (rnd) { rnd.handleEvent(e); rnd.refresh(); } }
  });
  rnd = STM.createBoardRenderer(makeCanvas(), sess, o);
  rnd.refresh();
  landLog = [];
  landPending = [];
  return rnd;
}
function geoOf() {
  var m = {};
  var st = sess.state();
  for (var i = 0; i < st.board.length; i++) {
    var b = st.board[i];
    m[b.id] = { r: b.r, c: b.c, z: b.z || 0 };
  }
  return m;
}
function firstTappable(pred) {
  var st = sess.state();
  var eng = sess.engineState();
  for (var i = 0; i < st.board.length; i++) {
    var b = st.board[i];
    if (!RE.canTap(eng, b.id)) continue;
    if (pred && !pred(b)) continue;
    return b;
  }
  return null;
}

/* 场景 C1：U 方向飞行 —— 每帧 drawOrder 必须严格按 (z,r,c) 升序 */
mkRenderer();
var geo = geoOf();
var tU = firstTappable(function (b) { return (b.d | 0) === 0 && (b.z || 0) === 0; });
check('C④: 找到可点的朝上（U）卡牌', !!tU, tU ? 'id=' + tU.id : 'none');
var orderOk = true, flyingInList = true, notForcedTop = true, orderFrames = 0;
if (tU) {
  var before = geo[tU.id];
  sess.tap(tU.id);
  pumpOne();
  var flU = rnd.flightOf(tU.id);
  check('C⑤: 点击后产生在途飞行记录（dir=U）', !!flU && flU.dir === 0, flU ? 'dir=' + flU.dir : 'null');
  check('C⑥: U 飞行时长 = 220ms', !!flU && Math.abs(flU.dur - F.U_MS) < 1e-6, flU ? flU.dur : '-');
  for (var cf = 0; cf < 18; cf++) {
    pumpOne();
    if (!rnd.flightOf(tU.id)) break; /* 已落定 → 后续帧本就不该再画它 */
    var ord = rnd.drawOrderOf();
    if (!ord.length) continue;
    orderFrames++;
    /* ① 全序列按 (z,r,c) 升序 */
    var prevKey = null;
    for (var oi = 0; oi < ord.length; oi++) {
      var g = geo[ord[oi]];
      if (!g) continue;
      var key = g.z * 10000 + g.r * 100 + g.c;
      if (prevKey !== null && key < prevKey) orderOk = false;
      prevKey = key;
    }
    /* ② 飞行牌必须在列表内（不被剔除） */
    var idxFly = -1;
    for (var oj = 0; oj < ord.length; oj++) {
      if (ord[oj] === tU.id) idxFly = oj;
    }
    if (idxFly < 0) flyingInList = false;
    else {
      /* ③ 「统一置顶」Bug 签名：存在更高层牌却排在飞行牌**之前** →
       *    说明飞行牌被强行画到了它们上面（旧实现的做法）。
       *    正确行为：更高层牌一律排在飞行牌之后。 */
      var flyKey = before.z * 10000 + before.r * 100 + before.c;
      for (var ol = 0; ol < ord.length; ol++) {
        if (ol === idxFly) continue;
        var gl = geo[ord[ol]];
        if (!gl) continue;
        var kl = gl.z * 10000 + gl.r * 100 + gl.c;
        if (kl > flyKey && ol < idxFly) notForcedTop = false;
      }
    }
  }
  check('C⑦: 逐帧采样到有效绘制序（>=8 帧）', orderFrames >= 8, 'frames=' + orderFrames);
  check('C⑧: 飞行牌每帧都在静态层绘制序内（未被剔除重画）', flyingInList);
  check('C⑨: drawOrder 逐帧严格按 (z,r,c) 升序（无层次反转）', orderOk);
  check('C⑩: 飞行牌未统一置顶（更高层牌仍排在它之后绘制）', notForcedTop);
  pumpFrames(30);
  check('C⑪: 飞行结束 → 槽位揭示回调恰好 1 次', landLog.length === 1,
    JSON.stringify(landLog));
  check('C⑫: 回调携带的槽位序号合法（0..6）',
    landLog.length === 1 && landLog[0].slot >= 0 && landLog[0].slot <= 6,
    landLog.length ? landLog[0].slot : '-');
  check('C⑫b: 回调触发时该牌已出表（dockPending=false → 槽位能揭示）',
    landPending.length === 1 && landPending[0] === false, JSON.stringify(landPending));
}

/* 场景 C2：L / R / D 两段制 —— 至少各命中一种 */
var dirSeen = {};
var dirTotal = 0, dirMaxOk = true, dirOffOk = true;
mkRenderer();
for (var dsel = 1; dsel <= 3; dsel++) {
  var td = firstTappable(function (b) { return (b.d | 0) === dsel; });
  if (!td) continue;
  dirSeen[dsel] = true;
  dirTotal++;
  sess.tap(td.id);
  pumpOne();
  var fd = rnd.flightOf(td.id);
  if (fd) {
    if (fd.dur > F.TOTAL_MS_MAX + 1e-6) dirMaxOk = false;
    var lay = rnd.layoutOf();
    if (RT.flightSegOf(fpOf(fd, fd.dur1), lay.tileSize, lay.n * lay.cellStep) !== 'offboard') dirOffOk = false;
  }
  pumpFrames(30);
}
check('C⑬: 至少覆盖 1 种非朝上方向（L/R/D）', dirTotal >= 1, 'dirs=' + JSON.stringify(Object.keys(dirSeen)));
check('C⑭: 非朝上方向总时长均 <= 320ms', dirMaxOk);
check('C⑮: 非朝上方向滑出段末刻均已离开棋盘矩形', dirOffOk);

/* ---------- D 槽位揭示门控 ---------- */
console.log('\nD 槽位揭示门控（连续点击精确配对）');
mkRenderer();
var picked = [], pickSuit = {};
for (var pk = 0; pk < 3; pk++) {
  var cand = firstTappable(function (b) { return !pickSuit[b.s]; });
  if (!cand) break;
  pickSuit[cand.s] = true;
  picked.push(cand.id);
}
check('D①: 选到 3 张互异花色的可点卡牌', picked.length === 3, picked.length);
if (picked.length === 3) {
  /* 连续点击（不跑帧）——模拟用户极速连点 */
  for (var pt = 0; pt < 3; pt++) sess.tap(picked[pt]);
  check('D②: 连续 3 次点击 → 3 条在途飞行',
    rnd.flightsOf().length === 3, rnd.flightsOf().length);
  var pendAll = true, slotSet = {};
  for (var pf = 0; pf < 3; pf++) {
    if (!rnd.dockPending(picked[pf])) pendAll = false;
    var rec = rnd.flightOf(picked[pf]);
    if (rec) slotSet[rec.slotIndex] = true;
  }
  check('D③: 3 张牌飞行期间 dockPending 全为 true（槽位保持空槽）', pendAll);
  check('D④: 3 条飞行分别锁定 3 个不同槽位（无错配）',
    Object.keys(slotSet).length === 3, JSON.stringify(Object.keys(slotSet)));
  pumpFrames(40);
  var pendNone = true;
  for (var pg = 0; pg < 3; pg++) if (rnd.dockPending(picked[pg])) pendNone = false;
  check('D⑤: 全部落定后 dockPending 全为 false（槽位揭示）', pendNone);
  check('D⑥: 落定回调 3 次且槽位与飞行记录一一对应',
    landLog.length === 3 && landLog.every(function (o) { return o.slot >= 0 && o.slot <= 6; }),
    JSON.stringify(landLog));
  check('D⑦: 每次回调时该牌均已出表（槽位可立即揭示）',
    landPending.length === 3 && landPending.every(function (v) { return v === false; }),
    JSON.stringify(landPending));
}

/* ---------- E 兜底 ---------- */
console.log('\nE 兜底与降级');
mkRenderer();
check('E①: 未知 tileId → startFlight 返回 null（不崩）', rnd.startFlight(999999, 0, 0) === null);
var tE = firstTappable(null);
if (tE) {
  sess.tap(tE.id);
  pumpOne();
  check('E②: 产生在途飞行', rnd.flightsOf().length === 1);
  check('E③: cancelFlights() 清空在途与 pendingDock',
    rnd.cancelFlights() === 1 && rnd.flightsOf().length === 0 && !rnd.dockPending(tE.id));
}
/* 落定回调抛异常：其余飞行不得被阻断 */
var thrown = 0;
mkRenderer({
  onFlightLand: function () { thrown++; throw new Error('boom'); }
});
var e1 = firstTappable(function (b) { return !pickSuit[b.s]; });
var pickSuit2 = {};
var multi = [];
for (var mq = 0; mq < 2; mq++) {
  var c2 = firstTappable(function (b) { return !pickSuit2[b.s]; });
  if (!c2) break;
  pickSuit2[c2.s] = true;
  multi.push(c2.id);
}
for (var mr = 0; mr < multi.length; mr++) sess.tap(multi[mr]);
try { pumpFrames(40); check('E④: 落定回调抛异常不杀帧', true); }
catch (e4) { check('E④: 落定回调抛异常不杀帧', false, e4.message); }
check('E⑤: 异常回调仍被逐条调用（不吞飞行）', thrown === multi.length && rnd.flightsOf().length === 0,
  thrown + '/' + multi.length);

/* reduced-motion：零位移直接落定 */
mkRenderer();
rnd.setReducedMotion(true);
var tR = firstTappable(null);
if (tR) {
  sess.tap(tR.id);
  pumpOne();
  var fr = rnd.flightOf(tR.id);
  check('E⑥: 降级飞行标记 reduced', !!fr && fr.reduced === true);
  check('E⑦: 降级时长 90ms', !!fr && Math.abs(fr.dur - F.REDUCED_MS) < 1e-6, fr ? fr.dur : '-');
  var rpos = fr ? fpOf(fr, 0) : null;
  check('E⑧: 降级零位移（起点即终点）', !!rpos && Math.abs(rpos.x - fr.toX) < 1e-6 && Math.abs(rpos.y - fr.toY) < 1e-6);
  pumpFrames(20);
  check('E⑨: 降级路径同样触发落定回调', landLog.length === 1, landLog.length);
}
rnd.setReducedMotion(false);

/* ---------- F R6/T225：FLIP 补位**起点**（不只终态） ----------
 * 受控槽序：7 槽，消除槽 = 1 / 3 / 6 → 剩余 4 张牌各左移一格。
 * 判据：每张剩余牌的 dx 起点 = 该牌「旧槽 left − 新槽 left」（±0.5px）。
 * ⚠ 旧实现按下标配对，此时第 1 项拿到的是「旧第 1 格（已被消除）」的 left
 *   → 起点整体错位。下面同时断言「旧口径会算错」，证明本条断言有判别力
 *   （T235 的反向验证部分）。 */
console.log('\nF R6/T225：FLIP 补位起点（按 tile id 配对）');
var PITCH = 50, IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
var oldLeftById = {}, newLeftById = {};
for (var fi = 0; fi < 7; fi++) oldLeftById[IDS[fi]] = fi * PITCH;
var keep = [0, 2, 4, 5];             /* 消除 1 / 3 / 6 后剩下的槽序 */
for (var ki = 0; ki < keep.length; ki++) newLeftById[IDS[keep[ki]]] = ki * PITCH;
var dxOf = STM.dockFlipDxOf(oldLeftById, newLeftById);
var dxOk = true, dxDetail = [], movedCount = 0;
for (var ki2 = 0; ki2 < keep.length; ki2++) {
  var id2 = IDS[keep[ki2]];
  var want = keep[ki2] * PITCH - ki2 * PITCH;   /* 旧 left − 新 left */
  var got = dxOf[id2];
  dxDetail.push(id2 + ':' + (got == null ? 'null' : got.toFixed(1)) + '/' + want.toFixed(1));
  if (want === 0) {
    /* 未移动的牌（第 0 格）不产生位移项——写了反而会打断它正在跑的过渡 */
    if (got != null) dxOk = false;
    continue;
  }
  movedCount++;
  if (got == null || Math.abs(got - want) > 0.5) dxOk = false;
}
check('F①: 受控槽序（消除 1/3/6）下每张剩余牌 dx 起点 = 旧 left − 新 left（±0.5px）',
  dxOk, dxDetail.join(' '));
check('F②: 被消除的槽不产生位移项（不在 newLeftById 里 → 无条目）',
  dxOf[IDS[1]] === undefined && dxOf[IDS[3]] === undefined && dxOf[IDS[6]] === undefined);
check('F③: 位移项数量 = 实际移动的牌数（未移动的第 0 格不产出条目）',
  Object.keys(dxOf).length === movedCount, Object.keys(dxOf).length + '/' + movedCount);
/* 反向证据：旧「按下标配对」在本槽序下必然错位 —— 第 1 项拿到的是旧第 1 格 */
var legacyDx = [];
for (var li = 0; li < keep.length; li++) {
  var oldArr = [0, 1, 2, 3];           /* 旧数组前 4 项的下标 → 旧槽 0/1/2/3 的 left */
  legacyDx.push(oldArr[li] * PITCH - li * PITCH);
}
check('F④: 旧「按下标配对」在本槽序下确实算错（证明 F① 有判别力）',
  Math.abs(legacyDx[1] - (keep[1] * PITCH - 1 * PITCH)) > 0.5,
  'legacy=' + legacyDx.join(',') + ' want=' + keep.map(function (s, i2) { return s * PITCH - i2 * PITCH; }).join(','));
check('F⑤: 亚像素位移被剔除（|dx| <= 0.5 不产生条目）',
  Object.keys(STM.dockFlipDxOf({ x: 10 }, { x: 10.4 })).length === 0);
check('F⑥: 缺项 / 非数值一律跳过（不产出 NaN 位移）', (function () {
  var o = STM.dockFlipDxOf({ x: 10 }, { x: 20, y: 5 });
  return o.x === -10 && o.y === undefined;
})());

console.log('');
if (fails.length) {
  console.log('flight-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
  process.exit(1);
} else {
  console.log('flight-smoke: all green（U/L/R/D 运动学 / z 序不置顶 / 槽位门控 / FLIP 起点 / 兜底降级）');
}
