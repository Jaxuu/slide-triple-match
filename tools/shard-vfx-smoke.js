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

console.log('Δ27c/Δ28c 三消碎块瀑布门禁（FR-049 / SC-023 自动化部分）\n');

/* ---------- ① 常量口径 ---------- */
console.log('① 常量口径');
check('数量区间 120~150 枚', D.min === 120 && D.max === 150);
check('生命周期 420~620ms', D.lifeMin === 420 && D.lifeMax === 620);
check('重力 2600 px/s²（原 920 太飘）', D.gravity === 2600);
check('Δ28c 径向迸射初速 140~460 px/s', D.speedMin === 140 && D.speedMax === 460);
check('Δ28c 向上分量上限 300 px/s（0.35s 内被重力拉回）', D.upMax === 300);
check('Δ28c 半透明玻璃 alpha 0.84~0.96', D.alphaMin === 0.84 && D.alphaMax === 0.96);
check('角速度下限 4 rad/s', D.vrMin === 4);
check('三级配比 15% / 45% / 40%',
  Math.abs(D.ratio.large - 0.15) < 1e-9 &&
  Math.abs(D.ratio.medium - 0.45) < 1e-9 &&
  Math.abs(D.ratio.small - 0.40) < 1e-9);
check('Δ28c 三级可见长边上调为 30~46 / 18~28 / 10~15',
  D.size.large[0] === 30 && D.size.large[1] === 46 &&
  D.size.medium[0] === 18 && D.size.medium[1] === 28 &&
  D.size.small[0] === 10 && D.size.small[1] === 15);
check('同帧切片种类下限 6', D.atlasKindsMin === 6);
check('Δ28b 图集切片主体占比 0.70（留 30% 给预烘焙柔光晕）',
  Math.abs(RT.SHARD_SUBJECT_RATIO - 0.70) < 1e-9, RT.SHARD_SUBJECT_RATIO);
check('Δ28b 图集总切片数 27（9 形状 × 3 色系）',
  RT.SHARD_ATLAS_TOTAL === 27 && RT.SHARD_THEMES.length === 3, RT.SHARD_ATLAS_TOTAL);
/* Δ28b-2: 素材是纯白瓷（亮度 p50≈168~214），若不做对比拉伸会全部落进亮面。
 * 这三项锁定「暗面真的被展开」的材质参数，防止后续调参把质感调回白纸屑。 */
check('Δ28b-2 三段 ramp 中间调切点 0.55（暗面占前半程）',
  Math.abs(RT.SHARD_RAMP_MID - 0.55) < 1e-9, RT.SHARD_RAMP_MID);
check('Δ28b-2 对比拉伸指数 >= 1.5（压暗中间调，否则暗部 < 15%）',
  RT.SHARD_RAMP_GAMMA >= 1.5, RT.SHARD_RAMP_GAMMA);
check('Δ28b-2 预烘焙方向光强度 0.28~0.42（统一光源，MUST NOT 糊成黑块）',
  RT.SHARD_SHADE_ALPHA >= 0.28 && RT.SHARD_SHADE_ALPHA <= 0.42, RT.SHARD_SHADE_ALPHA);
/* 同帧色系多样性：27 张切片按「形状主序 / 色系次序」排列（index % 3 = 色系），
 * 而单次爆发生成 n >= 120 枚、前 27 枚按 ki 轮转取遍 0..26，
 * 故只要 D.min >= 27 就必然同帧出现 3 种色系（SC-023 ⑧ 的构造性保证）。 */
check('Δ28b-2 单次爆发数 >= 图集总数（前 27 枚轮转取遍全图集 → 同帧 3 色系齐现）',
  D.min >= RT.SHARD_ATLAS_TOTAL && RT.SHARD_ATLAS_TOTAL % RT.SHARD_THEMES.length === 0,
  D.min + ' vs ' + RT.SHARD_ATLAS_TOTAL);
check('Δ28b-2 每张切片含暗面与亮面双极（三色系均给出 sh/mid/hi 三段）',
  RT.SHARD_THEMES.every(function (t) {
    return Array.isArray(t.sh) && Array.isArray(t.mid) && Array.isArray(t.hi) &&
      Math.max.apply(null, t.hi) - Math.max.apply(null, t.sh) >= 60;
  }));

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

var cntOk = true, ratioOk = true, sizeOk = true, vyOk = true, vxOk = true, vrOk = true, lifeOk = true, alphaOk = true;
var totalSeen = [], ratioSeen = [], upSeen = [];
for (var trial = 0; trial < 3; trial++) {
  rnd.cancelFlights();
  var beforeN = rnd.vfxShardsOf().length;
  var ret = rnd.spawnDockShatter(RECTS);
  var list = rnd.vfxShardsOf().slice(beforeN);
  totalSeen.push(list.length);
  if (list.length < 120 || list.length > 150) cntOk = false;
  var big = 0, mid = 0, small = 0, upCnt = 0;
  for (var si = 0; si < list.length; si++) {
    var s = list[si];
    if (s.kind === 'large') big++;
    else if (s.kind === 'medium') mid++;
    else small++;
    /* 尺寸必须落在该级区间 */
    var rg = s.kind === 'large' ? D.size.large : (s.kind === 'medium' ? D.size.medium : D.size.small);
    if (!(s.size >= rg[0] - 1e-9 && s.size <= rg[1] + 1e-9)) sizeOk = false;
    /* Δ28c: 径向迸射——vy 允许为负（向上炸开），但不得突破向上分量上限 */
    if (!(s.vy >= -D.upMax - 1e-9)) vyOk = false;
    if (s.vy < 0) upCnt++;
    /* 水平分量 = cos(ang) × spd × 1.35，理论 |vx| <= 780 × 1.35 = 1053 */
    if (!(Math.abs(s.vx) <= D.speedMax * D.vxGain + 1e-6)) vxOk = false;
    if (!(Math.abs(s.vr) >= D.vrMin - 1e-9)) vrOk = false;
    if (!(s.life >= D.lifeMin && s.life <= D.lifeMax)) lifeOk = false;
    if (!(s.alpha0 >= D.alphaMin - 1e-9 && s.alpha0 <= D.alphaMax + 1e-9)) alphaOk = false;
  }
  upSeen.push(upCnt);
  ratioSeen.push([big / list.length, mid / list.length, small / list.length]);
  if (Math.abs(big / list.length - D.ratio.large) > 0.03) ratioOk = false;
  if (Math.abs(mid / list.length - D.ratio.medium) > 0.04) ratioOk = false;
}
check('单次爆发数量恒落 120~150', cntOk, totalSeen.join('/'));
check('三级配比贴近 15/45/40（±3~4%）', ratioOk,
  ratioSeen.map(function (r) { return r.map(function (v) { return v.toFixed(2); }).join('/'); }).join(' | '));
check('每枚可见长边落在所属级区间', sizeOk);
check('Δ28c 向上分量不超上限（vy >= -300）', vyOk);
check('Δ28c 确有向上迸射的碎片（径向炸开，非单纯下落）',
  upSeen.every(function (n) { return n > 0; }), '向上枚数 ' + upSeen.join('/'));
check('水平分量 |vx| <= speedMax × vxGain', vxOk);
check('角速度 |vr| >= 4 rad/s（翻滚感）', vrOk);
check('生命周期恒落 420~620ms', lifeOk);
check('Δ28c 半透明 alpha 落 0.84~0.96（玻璃通透）', alphaOk);
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
  /* Δ28c: 径向迸射后仍有向上飞的碎片 → 断言改为「位移方向 = 3 帧内平均速度方向」。
   * 积分序为显式欧拉（y += vy·dt 后再 vy += g·dt），故 3 帧位移 ∝ vy0+vy1+vy2
   * = 3·vy0 + Δvy。符号一致即证明连续运动、无瞬移。 */
  var dy3 = pool1[mi].y - snap[mi].y;
  var vSum = 3 * snap[mi].vy + (pool1[mi].vy - snap[mi].vy);
  if (Math.abs(vSum) < 1e-6 || dy3 === 0 || (dy3 > 0) === (vSum > 0)) moved++;
  if (pool1[mi].vy > snap[mi].vy) accelerated++;
  if (pool1[mi].rot !== snap[mi].rot) spun++;
}
check('3 帧内位移方向与初速同号（连续运动，无瞬移）', moved === Math.min(snap.length, pool1.length),
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
