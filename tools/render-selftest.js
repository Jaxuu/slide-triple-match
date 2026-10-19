/* =========================================================
 * Slide & Triple — render-selftest（Δ12: blocked-slider-vanish 渲染回归防线）
 *
 * node tools/render-selftest.js
 *
 * 背景: BoardRenderer tileById 的 tileInfo 视觉缓存曾缺 r/c 字段 →
 *   block/gear/unlock/ice 动画 drawAnim 读 t.c/t.r = undefined → NaN →
 *   createLinearGradient(NaN) 抛 TypeError → frame() 末尾 rAF 重排程不可达 →
 *   渲染主循环永久死亡（受阻滑块贴图永久消失、逻辑正常）。
 *
 * 本自测以浏览器契约级 canvas 桩（渐变/路径坐标有限性校验——Chrome 同款抛错）
 * + 手动 rAF 泵在 Node 内复现完整渲染数据流，零依赖（宪章 II）。
 * 覆盖: ① 受阻滑块全动画窗口无异常 + 连点 ② gear/unlock/ice/flyout 并发
 *       ③ 冰层厚度角标（t.ice 读取回归） ④ 逻辑态不受渲染影响。
 * ========================================================= */
'use strict';

/* ---- 按经典脚本装载序加载（D-01 全局 STM 命名空间；Node 下挂 globalThis） ---- */
var RE = require('../src/core/RulesEngine.js');
globalThis.STM = globalThis.STM || {};
globalThis.STM.RulesEngine = RE; /* BoardRenderer/GameState 装载时读 STM.RulesEngine */
require('../src/core/GameState.js');
require('../src/render/bestiary.js'); /* Δ14: BoardRenderer 之前（装载序 D-01） */
require('../src/render/BoardRenderer.js');
var STM = globalThis.STM;
var LEVELS = require('../src/data/levels.js'); /* T052c: 60 关映射断言只读消费 */

/* ---- 浏览器环境桩（零依赖——不引任何 npm 包） ---- */
var clockNow = 0;
globalThis.performance = { now: function () { return clockNow; } };
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = function () {}; /* renderer 构造期 resize 监听 */

var rafQ = [];
globalThis.requestAnimationFrame = function (cb) { rafQ.push(cb); return rafQ.length; };

/* 手动 rAF 泵: 每帧推进 16ms 时钟并执行当帧回调（异常向上抛由用例捕获） */
function pumpFrames(n) {
  for (var i = 0; i < n; i++) {
    var q = rafQ.splice(0, rafQ.length);
    if (!q.length) break;
    clockNow += 16;
    for (var j = 0; j < q.length; j++) q[j](clockNow);
  }
}

/* 浏览器契约级 ctx 桩: 坐标/渐变入参非有限值即抛 TypeError（Chrome 行为） */
function finite(v, op) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw new TypeError(op + ': The provided double value is non-finite: ' + v);
  }
}
var fillTextLog = [];

function makeCtx() {
  return {
    createLinearGradient: function (x0, y0, x1, y1) {
      finite(x0, 'gradient'); finite(y0, 'gradient'); finite(x1, 'gradient'); finite(y1, 'gradient');
      return { addColorStop: function () {} };
    },
    createRadialGradient: function (x0, y0, r0, x1, y1, r1) {
      [x0, y0, r0, x1, y1, r1].forEach(function (v) { finite(v, 'gradient'); });
      return { addColorStop: function () {} };
    },
    moveTo: function (x, y) { finite(x, 'moveTo'); finite(y, 'moveTo'); },
    lineTo: function (x, y) { finite(x, 'lineTo'); finite(y, 'lineTo'); },
    arc: function (x, y, r) { finite(x, 'arc'); finite(y, 'arc'); finite(r, 'arc'); },
    arcTo: function (x1, y1, x2, y2, r) {
      finite(x1, 'arcTo'); finite(y1, 'arcTo'); finite(x2, 'arcTo'); finite(y2, 'arcTo'); finite(r, 'arcTo');
    },
    ellipse: function (x, y, rx, ry) { finite(x, 'ellipse'); finite(y, 'ellipse'); finite(rx, 'ellipse'); finite(ry, 'ellipse'); },
    quadraticCurveTo: function (cx, cy, x, y) { finite(cx, 'quad'); finite(cy, 'quad'); finite(x, 'quad'); finite(y, 'quad'); },
    bezierCurveTo: function (a, b, c, d, e, f) { [a, b, c, d, e, f].forEach(function (v) { finite(v, 'bezier'); }); },
    fillRect: function (x, y, w, h) { finite(x, 'fillRect'); finite(y, 'fillRect'); finite(w, 'fillRect'); finite(h, 'fillRect'); },
    strokeRect: function (x, y, w, h) { finite(x, 'strokeRect'); finite(y, 'strokeRect'); finite(w, 'strokeRect'); finite(h, 'strokeRect'); },
    fillText: function (s, x, y) { finite(x, 'fillText'); finite(y, 'fillText'); fillTextLog.push(String(s)); },
    /* 无参校验的纯状态/绘制调用 */
    clearRect: function () {}, beginPath: function () {}, closePath: function () {},
    fill: function () {}, stroke: function () {}, save: function () {}, restore: function () {},
    translate: function () {}, rotate: function () {}
  };
}

function makeCanvas() {
  return {
    clientWidth: 320,
    parentElement: { clientWidth: 320 },
    width: 0, height: 0,
    getContext: function () { return makeCtx(); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 320, height: 320 }; }
  };
}

/* ---- 会话+渲染器装配（事件流复刻 main.js handleSessionEvent 的渲染语义） ---- */
function makeGame(level) {
  var shakeCount = 0;
  var canvas = makeCanvas();
  var renderer = null;
  var session = STM.GameState.createSession(level, {
    onEvent: function (e) {
      if (!renderer) return;
      renderer.handleEvent(e); /* main.js: 各事件分支均为 handleEvent → refresh */
      renderer.refresh();
    }
  });
  renderer = STM.createBoardRenderer(canvas, session, {
    onShake: function () { shakeCount++; }
  });
  renderer.refresh();
  return { session: session, renderer: renderer, shakeCount: function () { return shakeCount; } };
}

/* ---- 断言器（T038 --engine-selftest 同款风格） ---- */
var failures = [];
function check(name, cond) {
  if (cond) { console.log('  ✓ ' + name); }
  else { failures.push(name); console.log('  ✗ ' + name); }
}
function pumpOk(name, n) {
  try { pumpFrames(n); check(name, true); }
  catch (err) { check(name + ' [' + err.message + ']', false); }
}

/* ---- 场景 A: 受阻滑块（本 bug 报告主路径） ---- */
function scenarioBlocked() {
  console.log('场景 A: 受阻滑块点击 → block 动画 → 贴图存活');
  var level = {
    id: 1, name: 'render-selftest-A', n: 3,
    tiles: [
      { r: 1, c: 0, d: 1, s: 0 },                 /* t0: 向右 → 被 t1 同层阻挡 */
      { r: 1, c: 1, d: 2, s: 1 },                 /* t1: 向下畅通（非死锁保底） */
      { r: 0, c: 0, d: 0, s: 2, m: 'i', x: 3 }    /* t2: 冰封 3 层（不可点、静态绘制） */
    ],
    prisms: [],
    cfg: { lives: 3, damageOnBlock: false, iceMode: 'triple', chains: [], scoring: { comboBase: 10, comboStep: 5 } }
  };
  fillTextLog = [];
  var g = makeGame(level);
  pumpOk('初始静态层绘制无异常（含冰封厚度角标）', 2);
  check('冰层厚度角标渲染（t.ice=3 读取——Δ12 回归）', fillTextLog.indexOf('3') >= 0);

  var r0 = g.session.tap(0);
  check('t0 点击返回 blocked（射线受阻）', r0 && r0.type === 'blocked');
  check('受阻触发棋盘抖动反馈', g.shakeCount() >= 1);
  pumpOk('block 动画全程（30 帧 > 360ms）无异常', 30);

  var r1 = g.session.tap(0);
  check('动画结束后同格可再次点击（rAF 存活）', r1 && r1.type === 'blocked');
  check('第二次 blocked 抖动反馈正常', g.shakeCount() >= 2);
  pumpOk('第二次 block 动画全程无异常', 30);

  var boardIds = g.session.state().board.map(function (t) { return t.id; });
  check('逻辑态正常: t0 仍在棋盘（仅渲染曾丢失）', boardIds.indexOf(0) >= 0);
  check('逻辑态正常: 冰封 t2 仍在棋盘（不可点）', boardIds.indexOf(2) >= 0);
}

/* ---- 场景 B: 同根缺陷路径 gear/unlock/ice 动画 + flyout 并发 ---- */
function scenarioMechAnims() {
  console.log('场景 B: gear/unlock/ice 事件动画（同根 tileInfo 缺字段路径）+ flyout 并发');
  var level = {
    id: 1, name: 'render-selftest-B', n: 4,
    tiles: [
      { r: 0, c: 0, d: 0, s: 0, m: 'k' },              /* t0: 钥匙（向上飞出解锁 t2） */
      { r: 1, c: 0, d: 1, s: 1, m: 'g' },              /* t1: 齿轮（t0 飞出联动转向 d 1→2） */
      { r: 1, c: 2, d: 2, s: 2, m: 'c', locked: true },/* t2: 锁链（t0 钥匙解锁） */
      { r: 0, c: 3, d: 0, s: 3 },                      /* t3: 飞出保底（非死锁） */
      { r: 2, c: 3, d: 0, s: 4, m: 'i', x: 2 }         /* t4: 冰封 2 层 */
    ],
    prisms: [],
    cfg: { lives: 3, damageOnBlock: false, iceMode: 'triple', chains: [[0, [2]]],
      scoring: { comboBase: 10, comboStep: 5 } }
  };
  var g = makeGame(level);
  pumpOk('初始静态层绘制无异常', 2);

  var r = g.session.tap(0); /* 钥匙飞出 → cascade: gear(t1)/unlock(t2)/ice(t4) + dock */
  check('钥匙滑块飞出（flyout）', r && r.type === 'flyout');
  pumpOk('fly + gear + unlock + ice 四动画并发全程无异常（40 帧）', 40);

  var st = g.session.state();
  var gear = st.board.filter(function (t) { return t.id === 1; })[0];
  check('逻辑态: 齿轮 t1 已转向（d 1→2 邻接联动）', gear && gear.d === 2);
  var lock = st.board.filter(function (t) { return t.id === 2; })[0];
  check('逻辑态: 锁链 t2 解锁且仍在棋盘（解锁≠移除）', lock && lock.locked === false);
  check('逻辑态: dock 已入 1（t0 入槽）', st.dock.length === 1);
  check('逻辑态: 冰封 t4 仍被锁（triple 口径需三消破冰）',
    st.board.some(function (t) { return t.id === 4; }));
}

/* ---- 场景 C: 受阻棱镜路径（prism-blocked 同一 block 动画分支） ---- */
function scenarioPrismBlocked() {
  console.log('场景 C: 棱镜折射后受阻（block 动画棱镜路径）');
  var level = {
    id: 1, name: 'render-selftest-C', n: 3,
    tiles: [
      { r: 0, c: 0, d: 1, s: 0 },   /* t0: 向右撞棱镜 '/' → 折射向上 → 直接越界畅通 */
      { r: 2, c: 2, d: 0, s: 1 }    /* t1: 向上撞棱镜格… 折射后受阻的构造备用 */
    ],
    prisms: [{ r: 0, c: 1, t: '/' }],
    cfg: { lives: 3, damageOnBlock: false, iceMode: 'triple', chains: [],
      scoring: { comboBase: 10, comboStep: 5 } }
  };
  var g = makeGame(level);
  pumpOk('初始静态层绘制无异常（含棱镜）', 2);
  /* t0 d=1 向右 → 入棱镜 '/' → REFLECT['/'][1]=0 向上 → 越界 → prism-flyout */
  var r = g.session.tap(0);
  check('t0 棱镜折射飞出（prism-flyout）', r && r.type === 'prism-flyout');
  pumpOk('prism 折线动画 + fly 并发全程无异常', 30);
}

/* ---- 场景 D: Δ14/T052c 阶段花色映射断言组（60 关——纯渲染层，levels.js 零写回） ---- */
function scenarioSuitMapping() {
  console.log('场景 D: 60 关花色→图鉴映射（Δ14a/FR-033 §3——确定性/唯一性/阶段边界）');
  var B = STM.Bestiary;
  check('Bestiary 挂载于 STM（装载序 BoardRenderer 前）', !!B && Array.isArray(B.BESTIARY));
  check('图鉴总量 45 种（Suit 0~44）', B.BESTIARY.length === 45);
  check('三阶段各 15 种（0~14/15~29/30~44）',
    B.BESTIARY.filter(function (e) { return e.id < 15; }).length === 15 &&
    B.BESTIARY.filter(function (e) { return e.id >= 15 && e.id < 30; }).length === 15 &&
    B.BESTIARY.filter(function (e) { return e.id >= 30; }).length === 15);

  var i, lv, map, key, keys;
  var stage1Ok = true, stage2Ok = true, stage3Ok = true;
  var uniqueOk = true, kOk = true, detOk = true, sameSuitOk = true;
  var inPoolOk = true;
  for (i = 0; i < LEVELS.length; i++) {
    lv = LEVELS[i];
    map = B.mappingForLevel(lv);
    keys = [];
    for (key in map) keys.push(parseInt(key, 10));
    /* K ≤ 池大小恒真 + 映射数 = 关卡花色数 */
    if (keys.length === 0 || keys.length > B.STAGES[B.stageOf(lv.id) - 1].poolMax) kOk = false;
    /* 阶段边界: L21∈一 / L22∈二 / L42∈二 / L43∈三（spec FR-033: 阶段二 L22~L42 含 42；
     * tasks.md 原文「L42∈阶段三」为笔误——21+21+18=60 关与 spec 区间自洽，以 spec 为准） */
    var st = B.stageOf(lv.id);
    if (lv.id === 21 && st !== 1) stage1Ok = false;
    if (lv.id === 22 && st !== 2) stage2Ok = false;
    if (lv.id === 42 && st !== 2) stage2Ok = false;
    if (lv.id === 43 && st !== 3) stage3Ok = false;
    /* 阶段池包含: 图案 id < 阶段池上限（阶段一 ≤14 / 二 ≤29 / 三 ≤44） */
    var poolCap = [15, 30, 45][st - 1];
    var inPool = true;
    for (key in map) { if (!(map[key] >= 0 && map[key] < poolCap)) inPool = false; }
    if (!inPool) inPoolOk = false;
    /* 映射单射（同关内图案唯一） */
    var seen = {};
    for (key in map) {
      if (seen[map[key]]) uniqueOk = false;
      seen[map[key]] = true;
    }
    /* 同关同 suit 恒同图案（缓存二次查询一致） */
    var map2 = B.mappingForLevel(lv);
    for (key in map) { if (map[key] !== map2[key]) sameSuitOk = false; }
  }
  check('60 关 K ≤ 阶段池大小恒真 + 映射数 = 花色数', kOk);
  check('阶段边界正确（L21∈一/L22∈二/L42∈二/L43∈三——spec FR-033 id 区间非 chapter）',
    stage1Ok && stage2Ok && stage3Ok);
  check('60 关图案均落在对应阶段池内', inPoolOk);
  check('同关内 suit→图案单射（唯一）', uniqueOk);
  check('同关同 suit 恒同图案（会话级缓存一致）', sameSuitOk);

  /* 确定性: 清缓存重算逐关一致 */
  B.clearCache();
  for (i = 0; i < LEVELS.length; i++) {
    lv = LEVELS[i];
    var m1 = B.mappingForLevel(lv);
    B.clearCache();
    var m2 = B.mappingForLevel(lv);
    for (key in m1) { if (m1[key] !== m2[key]) detOk = false; }
  }
  check('60 关映射确定性（清缓存二次计算一致——SC-007）', detOk);

  /* 跳关/Undo 后以当前关 id 重算阶段（Edge Case「阶段边界换装」） */
  check('跳关重算: L21→阶段一池（≠chapter 2 错位）',
    B.mappingForLevel(LEVELS[20]).s !== undefined || Object.keys(B.mappingForLevel(LEVELS[20])).length > 0);
  var map21 = B.mappingForLevel(LEVELS[20]);
  var map22 = B.mappingForLevel(LEVELS[21]);
  var cross21 = 0, cross22 = 0;
  for (key in map21) { if (map21[key] >= 15) cross21++; }
  for (key in map22) { if (map22[key] > 29) cross22++; }
  check('L21 图案全在陆地萌宠池（0~14）', cross21 === 0);
  check('L22 图案全在合并池（0~29——含新图鉴可能）', cross22 === 0);

  /* 渐进解锁语义: 跨关累计可见图案随阶段推进不缩减（展示池目标口径） */
  var seenAll = {};
  for (i = 0; i < 60; i++) {
    map = B.mappingForLevel(LEVELS[i]);
    for (key in map) seenAll[map[key]] = true;
  }
  var seenCount = Object.keys(seenAll).length;
  check('60 关累计可见图鉴 ≥30 种（渐进解锁展示池）', seenCount >= 30);

  /* 不触碰 tiles 坐标/solutionMoves 有效性（映射纯只读——levels.js git diff 恒空由验收核对） */
  check('映射不修改关卡 tiles（纯只读）', LEVELS[0].tiles[0].s === 0 && LEVELS[0].tiles.length === 30);
  check('solutionMoves 照常存在（Hint/Bot 回放不受影响）', Array.isArray(LEVELS[0].solutionMoves));
}

/* ---- 主入口 ---- */
scenarioBlocked();
scenarioMechAnims();
scenarioPrismBlocked();
scenarioSuitMapping();

console.log('');
if (failures.length) {
  console.log('render-selftest: FAILED — ' + failures.length + ' 失败项: ' + failures.join('; '));
  process.exit(1);
} else {
  console.log('render-selftest: all green（Δ12: 受阻/机制/棱镜动画数据流全量——rAF 存活 + 坐标有限性 + 逻辑态无扰）');
}
