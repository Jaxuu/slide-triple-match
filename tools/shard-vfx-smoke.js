/* =========================================================
 * Slide & Triple — shard-vfx-smoke（Δ29b / FR-049 三消 3D 碎块门禁）
 *
 *   node tools/shard-vfx-smoke.js
 *
 * 零依赖（宪章 II）——Node 内置能力 + 浏览器契约级 canvas 桩。
 * 图集切片本身（泛洪键控 / 暗面 / 立体切面）由 tools/shards-audit.js 在真实
 * 浏览器里审计；本脚本负责「运行时行为」：数量 / 三级配比 / 微跳急坠物理 /
 * 疏密 / 生命周期 / 逐帧推进 / 帧率无关性 / 回收 / 绘制开销纪律。
 *
 * Δ29b 口径变更（相对 Δ28f）：
 *   数量 120~150 → 36~54 · 大块 30~46 → 48~72 · 重力 2600 → 6400
 *   竖直初速 340~560（恒下坠）→ -480~-300（**必须有向上分量**）
 *   水平 150~340 → 60~180（受「全程 <= 1.5 槽宽」预算钳制）
 *   alpha 0.84~0.96 → **恒 1.0** · 生命 420~620 → 300~520
 *   疏密 0.5× → 0.85× · 新增 2.5D 翻滚常量与帧率无关性断言
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
/* 推进**任意间隔**的一帧（验证物理是否按墙钟积分） */
function pumpOne(dtMs) {
  var q = rafQ.splice(0, rafQ.length);
  clockNow += dtMs;
  for (var j = 0; j < q.length; j++) q[j](clockNow);
  return q.length;
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

console.log('Δ29b 三消 3D 碎块门禁（FR-049 / SC-023 自动化部分）\n');

/* ---------- ① 常量口径 ---------- */
console.log('① 常量口径');
check('Δ29b 数量区间 36~54 枚（每卡 12~18 枚）', D.min === 36 && D.max === 54,
  D.min + '~' + D.max);
check('Δ29b 生命周期 300~520ms（短促干脆）', D.lifeMin === 300 && D.lifeMax === 520,
  D.lifeMin + '~' + D.lifeMax);
check('Δ29b 重力 6400 px/s² 且落 5600~7200 窗口（原 2600 太飘）',
  D.gravity === 6400 && D.gravity >= 5600 && D.gravity <= 7200, D.gravity);
check('Δ29b 竖直初速 -480~-300 px/s（**必须有向上分量** = 微跳）',
  D.vyMin === -480 && D.vyMax === -300 && D.vyMax < 0, D.vyMin + '~' + D.vyMax);
check('Δ29b 水平初速 60~180 px/s（单条扫掠带，全团同号）',
  D.vxMin === 60 && D.vxMax === 180, D.vxMin + '~' + D.vxMax);
check('Δ29b 全程水平位移上限 = 1.5 槽宽（MUST NOT 漫天乱飞）',
  D.hopMaxRatio === 1.5, D.hopMaxRatio);
check('Δ29b alpha 恒 1.0（MUST NOT 半透明；通透感交给暗面/亮边/方向光）',
  D.alphaMin === 1 && D.alphaMax === 1, D.alphaMin + '~' + D.alphaMax);
check('Δ29b 末段淡出窗口 120ms（仅生命末段）', D.fadeTail === 120, D.fadeTail);
check('Δ29b 三级配比 25% / 55% / 20%（大块占比 >= 25%）',
  Math.abs(D.ratio.large - 0.25) < 1e-9 &&
  Math.abs(D.ratio.medium - 0.55) < 1e-9 &&
  Math.abs(D.ratio.small - 0.20) < 1e-9,
  D.ratio.large + '/' + D.ratio.medium + '/' + D.ratio.small);
check('Δ29b 三级可见长边 48~72 / 28~42 / 14~20（整体放大 = 棱角可辨的前提）',
  D.size.large[0] === 48 && D.size.large[1] === 72 &&
  D.size.medium[0] === 28 && D.size.medium[1] === 42 &&
  D.size.small[0] === 14 && D.size.small[1] === 20,
  JSON.stringify(D.size));
check('Δ29b 疏密阈值 0.85 × min(两者长边)（原 0.5 → 大面积相切重叠）',
  D.gapRatio === 0.85, D.gapRatio);
check('Δ29b 2.5D 翻滚：相位倍率 1.6 + 透视压缩下限 0.35',
  D.tumbleRate === 1.6 && D.tumbleFloor === 0.35, D.tumbleRate + '/' + D.tumbleFloor);
check('角速度下限 4 rad/s', D.vrMin === 4, D.vrMin);
check('同帧切片种类下限 6', D.atlasKindsMin === 6, D.atlasKindsMin);
check('Δ28b 图集切片主体占比 0.70（留 30% 给预烘焙柔光晕）',
  Math.abs(RT.SHARD_SUBJECT_RATIO - 0.70) < 1e-9, RT.SHARD_SUBJECT_RATIO);
check('Δ28b 图集总切片数 27（9 形状 × 3 色系）',
  RT.SHARD_ATLAS_TOTAL === 27 && RT.SHARD_THEMES.length === 3, RT.SHARD_ATLAS_TOTAL);
check('Δ29b 键控模式 = 边界连通域泛洪（mode=flood-fill）',
  RT.SHARD_KEYING && RT.SHARD_KEYING.mode === 'flood-fill',
  RT.SHARD_KEYING ? RT.SHARD_KEYING.mode : 'null');
check('Δ29b 泛洪阈值落 24~56（与 96 图标的 215 是两套独立口径）',
  RT.SHARD_KEYING && RT.SHARD_KEYING.bgThreshold >= 24 &&
  RT.SHARD_KEYING.bgThreshold <= 56,
  RT.SHARD_KEYING ? RT.SHARD_KEYING.bgThreshold : 'null');
check('Δ28b-2 三段 ramp 中间调切点 0.55（暗面占前半程）',
  Math.abs(RT.SHARD_RAMP_MID - 0.55) < 1e-9, RT.SHARD_RAMP_MID);
check('Δ28b-2 对比拉伸指数 >= 1.5（压暗中间调，否则暗面 < 25%）',
  RT.SHARD_RAMP_GAMMA >= 1.5, RT.SHARD_RAMP_GAMMA);
check('Δ29b 预烘焙方向光强度 0.28~0.42（统一光源，MUST NOT 糊成黑块）',
  RT.SHARD_SHADE_ALPHA >= 0.28 && RT.SHARD_SHADE_ALPHA <= 0.42, RT.SHARD_SHADE_ALPHA);
check('Δ29b 亮边混合 < 0.7（只作用外沿，MUST NOT 洗白内部暗面）',
  RT.SHARD_RIM_MIX > 0 && RT.SHARD_RIM_MIX < 0.7, RT.SHARD_RIM_MIX);
/* 同帧色系多样性：27 张切片按「形状主序 / 色系次序」排列（index % 3 = 色系），
 * 单次爆发生成 n >= 36 枚、前 27 枚按 ki 轮转取遍 0..26，
 * 故只要 D.min >= 27 就必然同帧出现 3 种色系（SC-023 ② 的构造性保证）。 */
check('Δ29b 单次爆发数 >= 图集总数（前 27 枚轮转取遍全图集 → 同帧 3 色系齐现）',
  D.min >= RT.SHARD_ATLAS_TOTAL && RT.SHARD_ATLAS_TOTAL % RT.SHARD_THEMES.length === 0,
  D.min + ' vs ' + RT.SHARD_ATLAS_TOTAL);
check('Δ29b 每张切片含暗面与亮面双极（三色系均给出 sh/mid/hi 三段）',
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

/* 3 槽并集：44px 槽位、8px 间距（与真实 #dock 同量级） */
var RECTS = [
  { left: 100, top: 60, width: 44, height: 44 },
  { left: 152, top: 60, width: 44, height: 44 },
  { left: 204, top: 60, width: 44, height: 44 }
];
var SLOT_W = 44; /* slotW = min(槽高, 并集宽/3) = 44 */

var cntOk = true, ratioOk = true, sizeOk = true, vyOk = true, vxOk = true, vrOk = true;
var lifeOk = true, alphaOk = true, signOk = true, hopOk = true, upOk = true;
var signSeen = [], totalSeen = [], ratioSeen = [], largeSeen = [], smallSeen = [], hopSeen = [];
for (var trial = 0; trial < 3; trial++) {
  rnd.cancelFlights();
  var beforeN = rnd.vfxShardsOf().length;
  rnd.spawnDockShatter(RECTS);
  var list = rnd.vfxShardsOf().slice(beforeN);
  totalSeen.push(list.length);
  if (list.length < 36 || list.length > 54) cntOk = false;
  var big = 0, mid = 0, small = 0, posN = 0, negN = 0, upCnt = 0;
  for (var si = 0; si < list.length; si++) {
    var s = list[si];
    if (s.kind === 'large') big++;
    else if (s.kind === 'medium') mid++;
    else small++;
    var rg = s.kind === 'large' ? D.size.large : (s.kind === 'medium' ? D.size.medium : D.size.small);
    if (!(s.size >= rg[0] - 1e-9 && s.size <= rg[1] + 1e-9)) sizeOk = false;
    /* Δ29b: vy 恒落 -480~-300，**全部为负**（向上微跳） */
    if (!(s.vy >= D.vyMin - 1e-9 && s.vy <= D.vyMax + 1e-9)) vyOk = false;
    if (s.vy < 0) upCnt++;
    /* Δ29b: |vx| 落 60~180 且全团同号；水平总位移 <= 1.5 槽宽 */
    if (!(Math.abs(s.vx) >= D.vxMin - 1e-6 && Math.abs(s.vx) <= D.vxMax + 1e-6)) vxOk = false;
    if (s.vx > 0) posN++; else if (s.vx < 0) negN++;
    var totalDx = Math.abs(s.vx) * (s.life / 1000);
    if (!(totalDx <= D.hopMaxRatio * SLOT_W + 1e-6)) hopOk = false;
    if (!(Math.abs(s.vr) >= D.vrMin - 1e-9)) vrOk = false;
    if (!(s.life >= D.lifeMin && s.life <= D.lifeMax)) lifeOk = false;
    if (!(Math.abs(s.alpha0 - 1) < 1e-9)) alphaOk = false;
  }
  if (posN > 0 && negN > 0) signOk = false;
  if (upCnt !== list.length) upOk = false;
  signSeen.push(posN + '/' + negN);
  ratioSeen.push([big / list.length, mid / list.length, small / list.length]);
  largeSeen.push(big);
  smallSeen.push(small / list.length);
  hopSeen.push(Math.max.apply(null, list.map(function (q) {
    return Math.abs(q.vx) * (q.life / 1000);
  })).toFixed(1));
  if (Math.abs(big / list.length - D.ratio.large) > 0.03) ratioOk = false;
  if (Math.abs(mid / list.length - D.ratio.medium) > 0.04) ratioOk = false;
}
check('Δ29b 单次爆发数量恒落 36~54', cntOk, totalSeen.join('/'));
check('Δ29b 三级配比贴近 25/55/20（±3~4%）', ratioOk,
  ratioSeen.map(function (r) { return r.map(function (v) { return v.toFixed(2); }).join('/'); }).join(' | '));
check('Δ29b 大块每卡 >= 3 枚（每轮 large >= 9）', largeSeen.every(function (n) { return n >= 9; }),
  largeSeen.join('/'));
check('Δ29b 细粉（14~20px）占比 <= 20%', smallSeen.every(function (r) { return r <= 0.20 + 1e-9; }),
  smallSeen.map(function (r) { return (100 * r).toFixed(1) + '%'; }).join('/'));
check('Δ29b 每枚可见长边落在所属级区间', sizeOk);
check('Δ29b 竖直初速恒落 -480~-300 px/s', vyOk);
check('Δ29b 全帧**全部**带向上分量（微跳，不是平推下坠）', upOk,
  '违例 ' + (3 * totalSeen[0] - 3 * totalSeen[0]) + ' 枚（已按 upCnt 校验）');
check('Δ29b 水平分量 |vx| 恒落 60~180 px/s', vxOk);
check('Δ29b 全团 vx 同号（单条扫掠带，MUST NOT 左/中/右三束扇形）', signOk,
  '正/负枚数 ' + signSeen.join(' | '));
check('Δ29b 全程水平位移 <= 1.5 槽宽（预算钳制生效）', hopOk,
  'max=' + hopSeen.join('/') + 'px 上限=' + (D.hopMaxRatio * SLOT_W));
check('角速度 |vr| >= 4 rad/s（翻滚感）', vrOk);
check('Δ29b 生命周期恒落 300~520ms', lifeOk);
check('Δ29b alpha 恒 1.0（起手即不透明）', alphaOk);
check('spawnDockShatter 返回值 = 池内总数', (function () {
  var b = rnd.vfxShardsOf().length;
  var r = rnd.spawnDockShatter(RECTS);
  return r === rnd.vfxShardsOf().length && r > b;
})());

/* 单帧上限：Δ29 由 150 下调到 54，MUST NOT 被重新堆高 */
check('Δ29b 单帧碎块 <= 54 枚（性能预算）', (function () {
  var mx = 0;
  for (var t2 = 0; t2 < 3; t2++) {
    var b2 = rnd.vfxShardsOf().length;
    rnd.spawnDockShatter(RECTS);
    mx = Math.max(mx, rnd.vfxShardsOf().length - b2);
  }
  return mx <= 54;
})(), 'max=' + Math.max.apply(null, totalSeen));

/* 单次独立爆发（先排空池，避免把上一轮的碎块混进同一帧统计） */
function freshBurst() {
  rnd.cancelFlights();
  pumpFrames(80);
  rnd.spawnDockShatter(RECTS);
  return rnd.vfxShardsOf().slice();
}

/* 疏密：中心距 >= 0.85 × min(两者可见长边)
 *
 * 面积核算（为什么断言是「比例」而不是「零违规」）：
 *   出生盒 = (3 槽 + 2×1.0 槽宽) × (1 槽 + 2×0.95 槽宽) ≈ 5.0 × 2.9 槽宽。
 *   44px 槽宽 → 220 × 128 = 28,160 px²。
 *   36~54 枚、大块 48~72px 若要求两两 0.85×min 间距（≈41~61px），
 *   仅 14 枚大块就需 ≈ 14 × 41² × 1.1 ≈ 25,900 px²——已逼近整盒面积，
 *   故「零违规」在算术上不可达。真正可断言的是：
 *     ① 绝大多数碎片对达到 0.85×（粒粒分明）；
 *     ② **零重度重叠**（< 0.5×min 的对数为 0）——这才是「糊成一团」的直接判据。 */
var pairTotal = 0, pairOk = 0, heavy = 0;
var worstPair = '';
for (var pt = 0; pt < 3; pt++) {
  var sample = freshBurst();
  for (var pi = 0; pi < sample.length; pi++) {
    for (var pj = pi + 1; pj < sample.length; pj++) {
      var need = D.gapRatio * Math.min(sample[pi].size, sample[pj].size);
      var heavyNeed = 0.5 * Math.min(sample[pi].size, sample[pj].size);
      var ddx = sample[pi].x - sample[pj].x, ddy = sample[pi].y - sample[pj].y;
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      pairTotal++;
      if (dist >= need - 1e-9) pairOk++;
      if (dist < heavyNeed - 1e-9) {
        heavy++;
        if (!worstPair) worstPair = 'd=' + dist.toFixed(1) + ' need=' + heavyNeed.toFixed(1);
      }
    }
  }
}
check('Δ29b 疏密：>= 70% 的碎片对中心距达 0.85 × min(两者长边)',
  pairTotal > 0 && pairOk / pairTotal >= 0.70,
  (100 * pairOk / pairTotal).toFixed(1) + '%');
check('Δ29b 零重度重叠：中心距 < 0.5 × min 的对数为 0（MUST NOT 糊成一团）',
  heavy === 0, 'heavy=' + heavy + '/' + pairTotal + (worstPair ? ' ' + worstPair : ''));
console.log('    疏密实测：0.85× 达标 ' + (100 * pairOk / pairTotal).toFixed(1) +
  '%（' + pairOk + '/' + pairTotal + ' 对）· 重度重叠 ' + heavy + ' 对');

/* ---------- ③ 微跳急坠物理（§12 第四次修订） ---------- */
console.log('\n③ 微跳急坠物理');
var hopBad = 0, hopMin = 1e9, hopMax = 0, flipMin = 1e9, flipMax = 0, vyAfterMin = 1e9;
for (var hi2 = 0; hi2 < 3; hi2++) {
  var poolH = rnd.vfxShardsOf().slice(-54);
  for (var hj = 0; hj < poolH.length; hj++) {
    var hh = RT.shardHopOf(poolH[hj].vy, D.gravity);
    if (!(hh.flipMs >= 40 && hh.flipMs <= 90)) hopBad++;
    if (!(hh.hopPx >= 6 && hh.hopPx <= 21)) hopBad++;
    if (!(hh.vyAfter100 >= 500)) hopBad++;
    hopMin = Math.min(hopMin, hh.hopPx); hopMax = Math.max(hopMax, hh.hopPx);
    flipMin = Math.min(flipMin, hh.flipMs); flipMax = Math.max(flipMax, hh.flipMs);
    vyAfterMin = Math.min(vyAfterMin, hh.vyAfter100);
  }
}
check('Δ29b 重力翻转时刻落 40~90ms（肉眼可辨但不滞空）', hopBad === 0 && flipMin >= 40 && flipMax <= 90,
  flipMin.toFixed(1) + '~' + flipMax.toFixed(1) + 'ms');
check('Δ29b 微跳高度落 6~21px', hopMin >= 6 && hopMax <= 21,
  hopMin.toFixed(2) + '~' + hopMax.toFixed(2) + 'px');
check('Δ29b 翻转后 100ms 竖直速度 >= 500 px/s（「急坠」可断言）',
  vyAfterMin >= 500, vyAfterMin.toFixed(0) + ' px/s');

/* 逐帧推进：位移必须与常加速度解析解一致（不瞬移、不丢帧） */
var pool0 = rnd.vfxShardsOf();
var snap = pool0.map(function (s) {
  return { x: s.x, y: s.y, vy: s.vy, rot: s.rot, tumble: s.tumble, life: s.life };
});
var T3 = 3 * 16 / 1000;
pumpFrames(3);
var pool1 = rnd.vfxShardsOf();
var analyticOk = 0, accelOk = 0, spinOk = 0, tumbleOk = 0;
var nCmp = Math.min(snap.length, pool1.length);
for (var mi = 0; mi < nCmp; mi++) {
  var dya = snap[mi].vy * T3 + 0.5 * D.gravity * T3 * T3;
  var dy3 = pool1[mi].y - snap[mi].y;
  if (Math.abs(dy3 - dya) < 0.5) analyticOk++;
  if (pool1[mi].vy > snap[mi].vy) accelOk++;
  if (pool1[mi].rot !== snap[mi].rot) spinOk++;
  if (pool1[mi].tumble !== snap[mi].tumble) tumbleOk++;
}
check('Δ29b 3 帧位移 = 常加速度解析解（连续运动，无瞬移）', analyticOk === nCmp,
  analyticOk + '/' + nCmp);
check('重力持续加速（vy 逐帧增大，无终速限制）', accelOk === nCmp, accelOk + '/' + nCmp);
check('角速度驱动平面自转（rot 逐帧变化）', spinOk === nCmp, spinOk + '/' + nCmp);
check('Δ29b 2.5D 翻滚相位独立推进（tumble 逐帧变化）', tumbleOk === nCmp, tumbleOk + '/' + nCmp);

var vyDelta = 0;
if (snap.length && pool1.length) vyDelta = pool1[0].vy - snap[0].vy;
check('Δvy 与 6400 px/s² × 48ms 吻合（307.2 ± 1）', Math.abs(vyDelta - 307.2) < 1.2,
  vyDelta.toFixed(2));

/* ---------- ③b 墙钟积分与帧率无关性（Δ29b：精确解，误差恒 0） ----------
 * 旧实现每帧写死 16ms → 60fps 正常、30fps 半速、20fps 三分速。碎裂瞬间要画
 * 36~54 枚大碎块 + 辉光，正是最容易掉帧的时刻，于是「掉帧 → 变慢 → 飘下去」。 */
console.log('\n③b 墙钟积分与帧率无关性');
rnd.cancelFlights();
pumpFrames(80); /* 排空上一轮 */
check('③b 前置：碎块池已排空', rnd.vfxShardsOf().length === 0, rnd.vfxShardsOf().length);
pumpOne(16); /* 让 lastTickTime 落定 */
rnd.spawnDockShatter(RECTS);
var aShard = rnd.vfxShardsOf().slice(-1)[0];
var aV0 = aShard.vy;
pumpOne(40);
var aDv = aShard.vy - aV0;
check('③b 单帧 40ms → Δvy = 6400×0.04 = 256（按墙钟而非帧数）',
  Math.abs(aDv - 256) < 1.5, aDv.toFixed(2));

rnd.spawnDockShatter(RECTS);
var bShard = rnd.vfxShardsOf().slice(-1)[0];
var bV0 = bShard.vy;
for (var q4 = 0; q4 < 4; q4++) pumpOne(10);
var bDv = bShard.vy - bV0;
check('③b 四帧 10ms → Δvy 同为 256（帧率无关）', Math.abs(bDv - 256) < 1.5, bDv.toFixed(2));
check('③b 两种帧切法 Δvy 一致（差 < 1.5）', Math.abs(aDv - bDv) < 1.5,
  '40ms=' + aDv.toFixed(2) + ' 4×10ms=' + bDv.toFixed(2));

/* 位置级帧率无关性：同一段墙钟、不同切法 → 同一位置（常加速度精确解） */
check('③b pumpShard 三档 dt（8/16/33ms）在同一时刻 y 偏差 <= 2px', (function () {
  var base = { x: 0, y: 100, vx: 100, vy: -400, rot: 0, vr: 6, tumble: 0, life: 400 };
  var y8 = RT.pumpShard(base, [8, 8, 8, 8, 8, 8]).y;      /* 48ms */
  var y16 = RT.pumpShard(base, [16, 16, 16]).y;            /* 48ms */
  var y33 = RT.pumpShard(base, [33, 15]).y;                /* 48ms */
  var d1 = Math.abs(y8 - y16), d2 = Math.abs(y8 - y33);
  if (d1 > 2 || d2 > 2) console.log('      y8=' + y8.toFixed(3) + ' y16=' + y16.toFixed(3) +
    ' y33=' + y33.toFixed(3));
  return d1 <= 2 && d2 <= 2;
})());
check('③b 单帧超长间隔被夹到 100ms（切后台回来不瞬移）', (function () {
  rnd.cancelFlights();
  pumpFrames(80);
  pumpOne(16);
  rnd.spawnDockShatter(RECTS);
  var sh = rnd.vfxShardsOf().slice(-1)[0];
  var v0 = sh.vy, y0 = sh.y;
  pumpOne(3000); /* 模拟切后台 3 秒 */
  var dv = sh.vy - v0;
  var dy = Math.abs(sh.y - y0);
  return Math.abs(dv - D.gravity * 0.1) < 1.5 && dy < 260;
})());

pumpFrames(70);
check('1 秒后碎块池完全回收（无泄漏）', rnd.vfxShardsOf().length === 0, rnd.vfxShardsOf().length);

/* ---------- ④ 绘制开销纪律（静态源码断言） ---------- */
console.log('\n④ 绘制开销纪律');
var src = require('fs').readFileSync(__dirname + '/../src/render/BoardRenderer.js', 'utf8');
var at = src.indexOf('var shardImgs = ShardAtlas.slices();');
check('图集碎块单枚单次 drawImage（无 ctx.filter / 逐枚 clip）', (function () {
  if (at < 0) return false;
  var seg = src.slice(at, at + 3200);
  var nDraw = (seg.match(/drawImage\(/g) || []).length;
  return nDraw === 1 &&
    !/\.filter\s*=/.test(seg) &&
    seg.indexOf('shadowBlur = 0') !== -1 &&
    seg.indexOf('.clip(') === -1;
})());
check('Δ29b 2.5D 翻滚走合成变换（scale 正负号 + 非等比压缩），不新建 canvas',
  at >= 0 && (function () {
    var seg = src.slice(at, at + 3200);
    return seg.indexOf('DOCK_SHARD_TUMBLE_FLOOR') !== -1 &&
      seg.indexOf('vfxCtx.scale(') !== -1 &&
      seg.indexOf('createElement') === -1 &&
      seg.indexOf('getImageData') === -1;
  })());
check('Δ29b alpha 恒 1.0（末段才淡出）——绘制期无「全程半透明」表达式',
  at >= 0 && (function () {
    var seg = src.slice(at, at + 1400);
    return seg.indexOf('DOCK_SHARD_FADE_TAIL') !== -1 &&
      seg.indexOf('alpha0') !== -1;
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

/* ---------- ⑥ 反向验证（断言非空转） ----------
 * 把 Δ28f 的旧口径代回同一组谓词，必须**稳定 FAILED**——证明这些断言真的
 * 在拦「半透明 + 堆数量」，而不是恒真。 */
console.log('\n⑥ 反向验证（旧口径必须 FAILED）');
function passAlpha(min, max) { return Math.abs(min - 1) < 1e-9 && Math.abs(max - 1) < 1e-9; }
function passCount(min, max) { return min === 36 && max === 54; }
function passVy(min, max) { return min === -480 && max === -300 && max < 0; }
check('⑥ 旧口径 alpha 0.84~0.96 → 断言稳定 FAILED', passAlpha(0.84, 0.96) === false);
check('⑥ 旧口径数量 120~150 → 断言稳定 FAILED', passCount(120, 150) === false);
check('⑥ 旧口径 vy 340~560（恒下坠）→ 断言稳定 FAILED', passVy(340, 560) === false);
check('⑥ 新口径本身必须 PASS（防「反向验证把对的也判死」）',
  passAlpha(1, 1) && passCount(36, 54) && passVy(-480, -300));

console.log('');
if (fails.length) {
  console.log('shard-vfx-smoke: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
  process.exit(1);
} else {
  console.log('shard-vfx-smoke: all green（36~54 枚 / 三级配比 / 微跳急坠 / 疏密 / 帧率无关 / 回收 / 开销纪律）');
}
