/* =========================================================
 * Slide & Triple — shard-vfx-smoke（Δ27c / FR-049 三消碎块瀑布门禁）
 *
 *   node tools/shard-vfx-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 图集切片本身（黑底键控）由 tools/shards-audit.js 在真实浏览器里审计；
 * 本脚本负责「运行时行为」：数量 / 三级配比 / 物理定标 / 生命周期 /
 * 疏密约束 / 逐帧推进 / 回收 / 绘制开销纪律。
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

globalThis.localStorage = {
  getItem: function () { return null; },
  setItem: function () {}, removeItem: function () {}
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

var drawImageCalls = 0, fillCalls = 0;
function makeCtx() {
  var o = {};
  ['createLinearGradient', 'createRadialGradient'].forEach(function (m) {
    o[m] = function () { return { addColorStop: function () {} }; };
  });
  ['moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo',
    'fillRect', 'strokeRect', 'fillText', 'rect'].forEach(function (m) {
      o[m] = function () {};
    });
  ['clearRect', 'beginPath', 'closePath', 'stroke', 'save', 'restore',
    'translate', 'rotate', 'scale', 'clip', 'setLineDash', 'setTransform'].forEach(function (m) {
      o[m] = function () {};
    });
  o.fill = function () { fillCalls++; };
  o.drawImage = function () { drawImageCalls++; };
  return o;
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

var RT = STM.rendererTest;
var D = RT.DOCK_SHARDS;

console.log('Δ27c 三消碎块瀑布门禁（FR-049 / SC-022 自动化部分）\n');

/* ---------- ① 常量口径 ---------- */
console.log('① 常量口径');
check('数量区间 120~150 枚', D.min === 120 && D.max === 150);
check('生命周期 420~620ms', D.lifeMin === 420 && D.lifeMax === 620);
check('重力 2600 px/s²（原 920 太飘）', D.gravity === 2600);
check('向下初速下限 300 px/s', D.vyMin === 300);
check('水平分量 120~520 px/s', D.vxMin === 120 && D.vxMax === 520);
check('角速度下限 4 rad/s', D.vrMin === 4);
check('三级配比 15% / 45% / 40%',
  Math.abs(D.ratio.large - 0.15) < 1e-9 &&
  Math.abs(D.ratio.medium - 0.45) < 1e-9 &&
  Math.abs(D.ratio.small - 0.40) < 1e-9);
check('三级可见长边 26~40 / 14~24 / 8~14',
  D.size.large[0] === 26 && D.size.large[1] === 40 &&
  D.size.medium[0] === 14 && D.size.medium[1] === 24 &&
  D.size.small[0] === 8 && D.size.small[1] === 14);
check('同帧切片种类下限 6', D.atlasKindsMin === 6);
check('图集切片主体占比 0.92（四周留 4% 净空）',
  Math.abs(RT.SHARD_SUBJECT_RATIO - 0.92) < 1e-9, RT.SHARD_SUBJECT_RATIO);

/* ---------- ② 生成：数量 / 配比 / 尺寸 / 物理 ---------- */
console.log('\n② 生成（3 次采样，最坏值取严）');
var LEVELS = require('../src/data/levels.js');
var lv = LEVELS[0];
for (var i = 0; i < LEVELS.length; i++) {
  if ((LEVELS[i].tiles || []).length > (lv.tiles || []).length) lv = LEVELS[i];
}
var sess = STM.GameState.createSession(lv, {});
var rnd = STM.createBoardRenderer(makeCanvas(), sess, {});
rnd.refresh();

var RECTS = [
  { left: 100, top: 60, width: 44, height: 44 },
  { left: 152, top: 60, width: 44, height: 44 },
  { left: 204, top: 60, width: 44, height: 44 }
];

var cntOk = true, ratioOk = true, sizeOk = true, vyOk = true, vxOk = true, vrOk = true, lifeOk = true;
var totalSeen = [], ratioSeen = [];
for (var trial = 0; trial < 3; trial++) {
  rnd.cancelFlights();
  var beforeN = rnd.vfxShardsOf().length;
  var ret = rnd.spawnDockShatter(RECTS);
  var list = rnd.vfxShardsOf().slice(beforeN);
  totalSeen.push(list.length);
  if (list.length < 120 || list.length > 150) cntOk = false;
  var big = 0, mid = 0, small = 0;
  for (var si = 0; si < list.length; si++) {
    var s = list[si];
    if (s.kind === 'large') big++;
    else if (s.kind === 'medium') mid++;
    else small++;
    /* 尺寸必须落在该级区间 */
    var rg = s.kind === 'large' ? D.size.large : (s.kind === 'medium' ? D.size.medium : D.size.small);
    if (!(s.size >= rg[0] - 1e-9 && s.size <= rg[1] + 1e-9)) sizeOk = false;
    if (!(s.vy >= D.vyMin - 1e-9)) vyOk = false;
    if (!(Math.abs(s.vx) >= D.vxMin * 0.55 - 1e-9 && Math.abs(s.vx) <= D.vxMax + 1e-9)) vxOk = false;
    if (!(Math.abs(s.vr) >= D.vrMin - 1e-9)) vrOk = false;
    if (!(s.life >= D.lifeMin && s.life <= D.lifeMax)) lifeOk = false;
  }
  ratioSeen.push([big / list.length, mid / list.length, small / list.length]);
  if (Math.abs(big / list.length - D.ratio.large) > 0.03) ratioOk = false;
  if (Math.abs(mid / list.length - D.ratio.medium) > 0.04) ratioOk = false;
}
check('单次爆发数量恒落 120~150', cntOk, totalSeen.join('/'));
check('三级配比贴近 15/45/40（±3~4%）', ratioOk,
  ratioSeen.map(function (r) { return r.map(function (v) { return v.toFixed(2); }).join('/'); }).join(' | '));
check('每枚可见长边落在所属级区间', sizeOk);
check('向下初速恒 >= 300 px/s（干脆下落，不飘）', vyOk);
check('水平分量 |vx| 落 [66, 520]（偏左散射）', vxOk);
check('角速度 |vr| >= 4 rad/s（翻滚感）', vrOk);
check('生命周期恒落 420~620ms', lifeOk);
check('spawnDockShatter 返回值 = 池内总数', (function () {
  var b = rnd.vfxShardsOf().length;
  var r = rnd.spawnDockShatter(RECTS);
  return r === rnd.vfxShardsOf().length && r > b;
})());

/* 疏密：中心距 >= 0.5 × min(两者可见长边) */
var pairTotal = 0, pairOk = 0;
var sample = rnd.vfxShardsOf().slice(-130);
for (var pi = 0; pi < sample.length; pi++) {
  for (var pj = pi + 1; pj < sample.length; pj++) {
    var need = 0.5 * Math.min(sample[pi].size, sample[pj].size);
    var ddx = sample[pi].x - sample[pj].x, ddy = sample[pi].y - sample[pj].y;
    var dist = Math.sqrt(ddx * ddx + ddy * ddy);
    pairTotal++;
    if (dist >= need - 1e-9) pairOk++;
  }
}
check('疏密约束：>= 90% 的碎片对中心距达标（粒粒分明）',
  pairTotal > 0 && pairOk / pairTotal >= 0.90,
  (100 * pairOk / pairTotal).toFixed(1) + '%');

/* ---------- ③ 逐帧推进与回收 ---------- */
console.log('\n③ 逐帧推进与回收');
var pool0 = rnd.vfxShardsOf();
var snap = pool0.map(function (s) { return { x: s.x, y: s.y, vy: s.vy, rot: s.rot }; });
pumpFrames(3);
var pool1 = rnd.vfxShardsOf();
var moved = 0, accelerated = 0, spun = 0;
for (var mi = 0; mi < Math.min(snap.length, pool1.length); mi++) {
  if (pool1[mi].y > snap[mi].y) moved++;
  if (pool1[mi].vy > snap[mi].vy) accelerated++;
  if (pool1[mi].rot !== snap[mi].rot) spun++;
}
check('3 帧内碎片全部向下位移', moved === Math.min(snap.length, pool1.length),
  moved + '/' + Math.min(snap.length, pool1.length));
check('重力持续加速（vy 逐帧增大，无终速限制）',
  accelerated === Math.min(snap.length, pool1.length));
check('角速度驱动旋转（rot 逐帧变化）', spun === Math.min(snap.length, pool1.length));

var vyDelta = 0;
if (snap.length && pool1.length) {
  /* 3 帧 = 48ms → Δvy ≈ 2600 × 0.048 = 124.8 */
  vyDelta = pool1[0].vy - snap[0].vy;
}
check('Δvy 与 2600 px/s² × 48ms 吻合（124.8 ± 1）', Math.abs(vyDelta - 124.8) < 1.2, vyDelta.toFixed(2));

pumpFrames(60);
check('1 秒后碎块池完全回收（无泄漏）', rnd.vfxShardsOf().length === 0, rnd.vfxShardsOf().length);

/* ---------- ④ 绘制开销纪律（静态源码断言） ---------- */
console.log('\n④ 绘制开销纪律');
var src = require('fs').readFileSync(__dirname + '/../src/render/BoardRenderer.js', 'utf8');
var at = src.indexOf('var shardImgs = ShardAtlas.slices();');
check('图集碎块单枚单次 drawImage（无 ctx.filter / 逐枚 clip）', (function () {
  if (at < 0) return false;
  var seg = src.slice(at, at + 2200);
  var nDraw = (seg.match(/drawImage\(/g) || []).length;
  return nDraw === 1 &&
    !/\.filter\s*=/.test(seg) &&
    seg.indexOf('shadowBlur = 0') !== -1 &&
    seg.indexOf('.clip(') === -1;
})());
check('碎块绘制走 #vfx-canvas 全屏层（不在棋盘画布内逐枚重绘）',
  src.indexOf('function drawVfx()') !== -1 && /vfxCtx/.test(src));
check('每帧一次性 clear 全屏 VFX 画布（无逐枚 save/restore 爆炸）', (function () {
  var vAt = src.indexOf('function drawVfx()');
  if (vAt < 0) return false;
  var seg = src.slice(vAt, vAt + 3000);
  return seg.indexOf('clearRect') !== -1;
})());

/* ---------- ⑤ 降级兜底 ---------- */
console.log('\n⑤ 兜底');
check('图集未就绪时走程序化折面兜底（verts 非空）', (function () {
  rnd.spawnDockShatter(RECTS);
  var list = rnd.vfxShardsOf();
  var proc = 0;
  for (var i = 0; i < list.length; i++) if (list[i].atlas == null && list[i].verts && list[i].verts.length >= 4) proc++;
  return proc > 0;
})());
check('空槽位矩形也能安全爆发（不抛异常）', (function () {
  try { rnd.spawnDockShatter([]); return rnd.vfxShardsOf().length > 0; }
  catch (e) { return false; }
})());
check('非法矩形（0 宽高）不抛异常', (function () {
  try { rnd.spawnDockShatter([{ left: 0, top: 0, width: 0, height: 0 }]); return true; }
  catch (e) { return false; }
})());

console.log('');
if (fails.length) {
  console.log('shard-vfx-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
  process.exit(1);
} else {
  console.log('shard-vfx-smoke: all green（120~150 枚 / 三级配比 / 物理定标 / 疏密 / 回收 / 开销纪律）');
}
