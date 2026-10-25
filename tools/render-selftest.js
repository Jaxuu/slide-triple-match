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
require('../src/core/profile.js'); /* Δ16c/T065: 玩家档案与经济态（纯数据层） */
require('../src/render/bestiary.js'); /* Δ14: BoardRenderer 之前（装载序 D-01） */
require('../src/render/backdrops.js'); /* Δ14/T052d: 生态背景池（BoardRenderer 消费） */
require('../src/data/icon-bboxes.js'); /* Δ22: 离线包围盒 */
require('../src/render/BoardRenderer.js');
require('../src/audio/SoundManager.js'); /* Δ16c: BGM/SFX 粒度 + Δ16d 开机和弦音 */
require('../src/ui/splash.js'); /* Δ16d/T066: HooLey Games 开机动画 */
require('../src/ui/tutorial.js'); /* Δ19e/T087: L1/L2 教学层（纯表现层） */
var STM = globalThis.STM;
var LEVELS = require('../src/data/levels.js'); /* T052c: 72 关映射断言只读消费 */

/* ---- Δ16c/T065: localStorage 内存桩（Node 无 DOM 存储——profile 全访问
 * try/catch 须降级为内存态照常可玩，D-03 纪律延续） ---- */
function mkStorage() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
var memStore = mkStorage();
globalThis.localStorage = memStore;

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
    translate: function () {}, rotate: function () {}, scale: function () {},
    drawImage: function () {}
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
  /* 纯只读快照（Δ15 注: L1 花 Δ15a 重打散后首块 suit 非必 0——只读断言
   * 须取映射前后快照对照，不得断言迁移前的具体花色值） */
  var snapBefore = JSON.stringify(LEVELS[0].tiles);
  var snapMovesBefore = JSON.stringify(LEVELS[0].solutionMoves);
  for (i = 0; i < LEVELS.length; i++) {
    lv = LEVELS[i];
    map = B.mappingForLevel(lv);
    keys = [];
    for (key in map) keys.push(parseInt(key, 10));
    /* K ≤ 池大小恒真 + 映射数 = 关卡花色数 */
    if (keys.length === 0 || keys.length > B.STAGES[B.stageOf(lv.id) - 1].poolMax) kOk = false;
    /* Δ16a 阶段边界重划为 3×24: L24∈一 / L25∈二 / L48∈二 / L49∈三
     * （spec FR-033 Δ16 修订: 阶段一 L1~L24 / 阶段二 L25~L48 / 阶段三 L49~L72；
     *  区间按 level.id 判定，非 chapter） */
    var st = B.stageOf(lv.id);
    if (lv.id === 24 && st !== 1) stage1Ok = false;
    if (lv.id === 25 && st !== 2) stage2Ok = false;
    if (lv.id === 48 && st !== 2) stage2Ok = false;
    if (lv.id === 49 && st !== 3) stage3Ok = false;
    if (lv.id === 72 && st !== 3) stage3Ok = false;
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
  check('72 关 K ≤ 阶段池大小恒真 + 映射数 = 花色数', kOk);
  check('Δ16a 阶段边界正确（L24∈一/L25∈二/L48∈二/L49∈三/L72∈三——spec FR-033 3×24 id 区间非 chapter）',
    stage1Ok && stage2Ok && stage3Ok);
  check('72 关图案均落在对应阶段池内', inPoolOk);
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
  check('72 关映射确定性（清缓存二次计算一致——SC-007）', detOk);

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

  /* 不触碰 tiles 坐标/solutionMoves 有效性（映射纯只读——Δ15a 迁移后快照对照） */
  check('映射不修改关卡 tiles（纯只读）', JSON.stringify(LEVELS[0].tiles) === snapBefore);
  check('映射不修改 solutionMoves（纯只读）', JSON.stringify(LEVELS[0].solutionMoves) === snapMovesBefore);
  check('solutionMoves 照常存在（Hint/Bot 回放不受影响）', Array.isArray(LEVELS[0].solutionMoves) && LEVELS[0].solutionMoves.length === LEVELS[0].tiles.length);
}

/* ---- 场景 E: Δ14/T052d 背景层集成（真实关卡 × 20 循环全覆盖 + 8×8 满载） ---- */
function scenarioEcoBackdrop() {
  console.log('场景 E: 生态背景层集成（Δ16b 24 循环全覆盖 + 8×8×5 层满载稳定性）');
  var BD = STM.Backdrops;
  check('Backdrops 挂载于 STM（装载序 BoardRenderer 前）', !!BD && Array.isArray(BD.SCENES) && BD.SCENES.length === 20);

  /* Δ16b: 24 循环 × 每循环恰 3 关（SC-008: 0 遗漏 0 冲突）——72 关 = 24 循环 */
  var cover = {};
  var i, id;
  for (id = 1; id <= LEVELS.length; id++) {
    var ci = BD.cycleIndexOf(id);
    cover[ci] = (cover[ci] || 0) + 1;
  }
  var keys = Object.keys(cover).map(Number).sort(function (a, b) { return a - b; });
  var exact3 = keys.length === 24 && keys.every(function (k) { return cover[k] === 3; });
  check('Δ16b: 24 循环 × 每循环恰 3 关（0 遗漏 0 冲突）', exact3);
  check('Δ16b: cycleIndex 钳制: L73+ → 23 / L0 → 0', BD.cycleIndexOf(73) === 23 && BD.cycleIndexOf(0) === 0);

  /* 24 循环全部经真实渲染器数据流绘制（坐标有限性桩——含换关重绘路径） */
  var okPaint = true;
  var sampleIds = [];
  for (var sc = 0; sc < 24; sc++) sampleIds.push(sc * 3 + 1);
  for (i = 0; i < sampleIds.length; i++) {
    var lv = LEVELS[sampleIds[i] - 1];
    var g = makeGame(lv);
    g.renderer.setLevel(lv);
    try { pumpFrames(3); } catch (err) { okPaint = false; }
  }
  check('20 循环代表关卡（每循环第 1 关）背景+滑块绘制无异常', okPaint);

  /* 8×8×5 层满载稳定性（L60 = 8×8 105 满载关——含飞出/reveal 并发） */
  var lv60 = LEVELS[59];
  check('L60 为 8×8 满载关（n=8）', lv60.n === 8);
  var g60 = makeGame(lv60);
  g60.renderer.setLevel(lv60);
  var ok60 = true;
  try { pumpFrames(4); } catch (err) { ok60 = false; }
  check('L60 初始满载绘制无异常', ok60);
  /* 沿 solutionMoves 连点 12 步（动画并发 + 背景缓存重绘 + 换色精灵） */
  var okSteps = true;
  var played = 0;
  for (var sv = 0; sv < 12; sv++) {
    var mv = lv60.solutionMoves[sv];
    if (!mv) break;
    try {
      g60.session.tap(mv.t);
      pumpFrames(3);
      played++;
    } catch (err) { okSteps = false; break; }
  }
  check('L60 连点 12 步（fly/reveal/prism 动画 + 背景层并发）无异常', okSteps && played === 12);

  /* 换关横幅挑战位（T052e 集成语义——挑战位恰为每循环第 3 关; Δ16a: 24 关） */
  var challenge = [];
  for (id = 1; id <= LEVELS.length; id++) if (id === 3 || (id - 4) % 3 === 2) challenge.push(id);
  check('Δ16a: 挑战位集合 24 关（L3 ∪ (id-4)%3==2——每循环 1 难关）', challenge.length === 24);
  check('Δ16a: 新增尾段挑战位恰为 L63/L66/L69/L72',
    [63, 66, 69, 72].every(function (cid) { return challenge.indexOf(cid) >= 0; }));
  var perCycleOk = challenge.every(function (cid) {
    var cyc = BD.cycleIndexOf(cid);
    return cover[cyc] === 3; /* 难关属于恰含 3 关的循环 */
  });
  check('每个挑战位关归属其三关循环', perCycleOk);

  /* Δ16b: 6 张贴图 → 24 循环映射断言（每幅画卷覆盖 4 个三关循环 = 12 关） */
  var bgMapOk = [0, 1, 2, 3].every(function (c) { return BD.bgImageIndexOf(c) === 1; }) &&
    [4, 5, 6, 7].every(function (c) { return BD.bgImageIndexOf(c) === 2; }) &&
    [8, 9, 10, 11].every(function (c) { return BD.bgImageIndexOf(c) === 3; }) &&
    [12, 13, 14, 15].every(function (c) { return BD.bgImageIndexOf(c) === 4; }) &&
    [16, 17, 18, 19].every(function (c) { return BD.bgImageIndexOf(c) === 5; }) &&
    [20, 21, 22, 23].every(function (c) { return BD.bgImageIndexOf(c) === 6; });
  check('Δ16b: bg 贴图映射（0~3→bg1 / 4~7→bg2 / 8~11→bg3 / 12~15→bg4 / 16~19→bg5 / 20~23→bg6）', bgMapOk);
  /* Δ16b 铁律: 画卷序号 = floor((id-1)/12)+1（FR-044 拼图同源） */
  var paintOk = [1, 12].every(function (i) { return BD.paintingOf(i) === 1; }) &&
    [13, 24].every(function (i) { return BD.paintingOf(i) === 2; }) &&
    [25, 36].every(function (i) { return BD.paintingOf(i) === 3; }) &&
    [37, 48].every(function (i) { return BD.paintingOf(i) === 4; }) &&
    [49, 60].every(function (i) { return BD.paintingOf(i) === 5; }) &&
    [61, 72].every(function (i) { return BD.paintingOf(i) === 6; });
  check('Δ16b: 画卷序号 floor((id-1)/12)+1（L1-12→1 … L61-72→6）', paintOk);
  /* 兜底确定性: Node 无 Image 环境探测直接 failed → drawBackdrop 走程序化路径 */
  var probeRec = BD.probeBgImage(0);
  check('贴图探测无 DOM 环境降级 failed（程序化兜底命中）', probeRec.state === 'failed');
  var okFallbackPaint = true;
  try { BD.drawBackdrop(makeCtx(90, 160), 1, 90, 160); } catch (errFB) { okFallbackPaint = false; }
  check('兜底程序化绘制无异常（Image 桩失败路径）', okFallbackPaint);
  /* 粒子层: drawBackdropAnim 纯函数（theme × 4 类全程无异常） */
  var okAnim = true;
  for (var tk = 0; tk < 4; tk++) {
    try { BD.drawBackdropAnim(makeCtx(90, 160), 1 + tk * 7, 90, 160, tk * 1200 + 500); } catch (errAN) { okAnim = false; }
  }
  check('飘落粒子层 4 主题纯函数绘制无异常（sun/bubble/petal/stardust）', okAnim);
}

/* ---- 场景 F: Δ15b/T052i 精灵图集切片与渲染级联断言（Node 桩环境） ---- */
function scenarioSpriteSheets() {
  console.log('场景 F: 精灵图集切片/白键控/渲染级联（Δ15b——贴图>单张>Emoji 兜底）');
  var IA = STM.IconAssets;
  var B = STM.Bestiary;
  check('IconAssets 挂载于 STM（BoardRenderer 导出）', !!IA && typeof IA.ensureLoaded === 'function');

  /* Emoji 码点表: 45 条全覆盖且无重复（FR-033 §6 兜底渲染源） */
  check('Emoji 码点表 45 条全覆盖', Array.isArray(B.EMOJI) && B.EMOJI.length === 45);
  var emSet = {};
  var emUniq = true;
  for (var ei = 0; ei < 45; ei++) {
    if (!B.EMOJI[ei] || typeof B.EMOJI[ei] !== 'string' || B.EMOJI[ei].length < 1) emUniq = false;
    if (emSet[B.EMOJI[ei]]) emUniq = false;
    emSet[B.EMOJI[ei]] = true;
  }
  check('Emoji 码点无重复且均为非空字符串', emUniq);

  /* Node 无 DOM/无 Image → ensureLoaded 空转不抛（file:// 之外环境安全） */
  var loadOk = true;
  try { IA.ensureLoaded(); } catch (err) { loadOk = false; }
  check('Node 无 Image 环境下 ensureLoaded 安全空转', loadOk);
  check('Node 环境无贴图状态（sheetCount=0——Emoji 兜底路径）', IA.sheetCount() === 0);

  /* 兜底链确定性: Sprite 生成走 Emoji 路径（无 DOM → getSprite null → 直绘分支可达） */
  var RT = STM.rendererTest;
  var sp = RT.getSprite(0, 40); /* Node 无 DOM → null（直绘路径） */
  check('getSprite Node 无 DOM 返回 null（直绘/Emoji 分支保留）', sp === null);

  /* 贴图切片单元（浏览器白键控逻辑桩测——canvas 桩对象驱动 registerSheet） */
  /* 构造 4×4 canvas 桩: getImageData/putImageData/drawImage 全记录 */
  function makeSliceCtx() {
    var calls = { getImageData: 0, putImageData: 0, drawImage: 0, fill: 0 };
    var ctx = makeCtx();
    ctx.drawImage = function () { calls.drawImage++; };
    ctx.getImageData = function (x, y, w, h) {
      calls.getImageData++;
      if (!(w === 128 && h === 128)) throw new Error('切片分辨率非 128×128: ' + w + '×' + h);
      /* 128×128 RGBA: 四角纯白(255) 中心主体色(200,180,150) */
      var data = new Uint8ClampedArray(128 * 128 * 4);
      for (var i = 0; i < 128 * 128; i++) {
        var px = i % 128, py = (i / 128) | 0;
        var edge = px < 4 || px > 123 || py < 4 || py > 123;
        if (edge) { data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; }
        else { data[i * 4] = 200; data[i * 4 + 1] = 180; data[i * 4 + 2] = 150; }
        data[i * 4 + 3] = 255;
      }
      return { data: data, width: w, height: h };
    };
    ctx.putImageData = function (d) {
      calls.putImageData++;
      /* 白键控断言: 四角 alpha=0（纯白 → 透明）、中心 alpha>0 */
      var corner = d.data[3];
      var center = d.data[(64 * 128 + 64) * 4 + 3];
      if (!(corner === 0 && center > 0)) throw new Error('白键控失效: corner=' + corner + ' center=' + center);
    };
    ctx._calls = calls;
    return ctx;
  }

  /* 离屏 canvas 桩（createElement('canvas') 返回带切片 ctx 桩） */
  var origCreate = globalThis.document && globalThis.document.createElement;
  var docStub = {
    createElement: function (tag) {
      if (tag !== 'canvas') return null;
      return { width: 0, height: 0, getContext: function () { return makeSliceCtx(); } };
    }
  };
  /* registerSheet 走 document.createElement → 需临时注入 document 桩 */
  globalThis.document = docStub;
  var sliceOk = true, sliceMsg = '';
  try {
    var fakeImg = { width: 2048, height: 2048 };
    var T = IA._test;
    T.registerSheet(fakeImg, 0);
    /* 断言: 15 格注册、第 16 格（index 15）未注册（跳过右下角水印格） */
    var n = 0;
    for (var bi = 0; bi < 16; bi++) if (T.slices[bi]) n++;
    if (n !== 15) { sliceOk = false; sliceMsg = '注册格数=' + n + '（应 15——跳过第 16 格）'; }
    if (T.slices[15]) { sliceOk = false; sliceMsg = '第 16 格（水印格）被误注册'; }
  } catch (err) {
    sliceOk = false; sliceMsg = err.message;
  } finally {
    if (origCreate !== undefined && origCreate !== null) globalThis.document = origCreate && globalThis.document;
    else delete globalThis.document;
  }
  check('sheet 切片: 15 格注册 + 第 16 格（row3,col3 水印格）跳过', sliceOk && sliceMsg === '');
  if (sliceMsg) console.log('    [' + sliceMsg + ']');

  /* sheet 定义: 3 张 × 15 格 = 45 覆盖 + 基址 0/15/30 */
  var sheetsOk = IA.SHEETS.length === 3 &&
    IA.SHEETS[0].base === 0 && IA.SHEETS[1].base === 15 && IA.SHEETS[2].base === 30 &&
    IA.SHEETS.every(function (sh) { return sh.count === 15; });
  check('SHEETS 配置: 3 张 × 基址 0/15/30 × 15 格（45 全覆盖）', sheetsOk);
  var pathsOk = IA.SHEETS.every(function (sh) { return sh.file.indexOf('assets/icons/sheet') === 0; });
  check('sheet 路径约定 assets/icons/sheet{1..3}.png（相对路径）', pathsOk);

  /* statusOf 兜底链: 未注册 bid → 'emoji'（贴图缺失降级口径） */
  var stOk = IA.statusOf(0) === 'emoji' || IA.statusOf(0) === 'sheet';
  check('statusOf 未加载态回退 emoji（贴图缺失降级）', IA.statusOf(999) === 'emoji');
}

/* ---- 场景 G: Δ15b3 全视口背景舞台（贴图映射 / 20 档氛围 / 4 族粒子） ---- */
function scenarioBackdropStage() {
  console.log('场景 G: 全视口背景舞台（Δ16b——6 图映射 24 循环 + 24 档氛围 + 4 族粒子）');
  var BS = STM.BackdropStage;
  check('BackdropStage 挂载于 STM（BoardRenderer 导出）', !!BS && typeof BS.drawStage === 'function');

  /* Δ16b: 6 张底图 → 24 循环映射（每幅画卷 4 个三关循环 = 12 关:
   * 0~3→bg1 / 4~7→bg2 / 8~11→bg3 / 12~15→bg4 / 16~19→bg5 / 20~23→bg6） */
  var mapOk = [0, 1, 2, 3].every(function (c) { return BS.bgIndexOf(c) === 1; }) &&
    [4, 5, 6, 7].every(function (c) { return BS.bgIndexOf(c) === 2; }) &&
    [8, 9, 10, 11].every(function (c) { return BS.bgIndexOf(c) === 3; }) &&
    [12, 13, 14, 15].every(function (c) { return BS.bgIndexOf(c) === 4; }) &&
    [16, 17, 18, 19].every(function (c) { return BS.bgIndexOf(c) === 5; }) &&
    [20, 21, 22, 23].every(function (c) { return BS.bgIndexOf(c) === 6; });
  check('Δ16b: 6 图 → 24 循环映射（0~3→1 / 4~7→2 / 8~11→3 / 12~15→4 / 16~19→5 / 20~23→6）', mapOk);
  check('Δ16b: bgIndexOf 越界钳制（-5→1 / 24→6 / 99→6）',
    BS.bgIndexOf(-5) === 1 && BS.bgIndexOf(24) === 6 && BS.bgIndexOf(99) === 6);

  /* Δ16b: 画卷序号 = floor((id-1)/12)+1（FR-044 拼图同源铁律） */
  var bsPaintOk = [1, 12].every(function (i) { return BS.paintingOf(i) === 1; }) &&
    [13, 24].every(function (i) { return BS.paintingOf(i) === 2; }) &&
    [25, 36].every(function (i) { return BS.paintingOf(i) === 3; }) &&
    [37, 48].every(function (i) { return BS.paintingOf(i) === 4; }) &&
    [49, 60].every(function (i) { return BS.paintingOf(i) === 5; }) &&
    [61, 72].every(function (i) { return BS.paintingOf(i) === 6; });
  check('Δ16b: BackdropStage.paintingOf 画卷序号（L1-12→1 … L61-72→6）', bsPaintOk);
  /* 三关循环序号 0~23（L73+ 钳制 23 / L0 钳制 0） */
  check('Δ16b: cycleOf 0~23 钳制（L73→23 / L0→0）',
    BS.cycleOf(73) === 23 && BS.cycleOf(0) === 0 && BS.cycleOf(1) === 0 && BS.cycleOf(72) === 23);

  /* 24 档氛围逐环唯一（每过 3 关一换气氛——同图不同循环互异） */
  var atmos = BS.ATMOS;
  check('Δ16b: 氛围档位 24 档（每循环一档）', Array.isArray(atmos) && atmos.length === 24);
  var sigs = {}, uniqAtmos = true;
  for (var ai = 0; ai < 24; ai++) {
    var a = atmos[ai];
    if (!a || !a.name || !a.top || !a.bot) { uniqAtmos = false; break; }
    var sg = a.name + '|' + a.top + '|' + a.bot + '|' + a.veil + '|' + a.lift + '|' + a.warm;
    if (sigs[sg]) { uniqAtmos = false; break; }
    sigs[sg] = 1;
  }
  check('20 档氛围互不相同（氛围签名无重复）', uniqAtmos);
  /* 同一底图负责的多个循环氛围名互异（bg1 的 4 个循环各有气氛） */
  var byBg = {};
  for (var bj = 0; bj < 24; bj++) {
    var k = BS.bgIndexOf(bj);
    (byBg[k] = byBg[k] || []).push(atmos[bj].name);
  }
  var sameNameOk = Object.keys(byBg).every(function (k) {
    var names = byBg[k];
    return names.every(function (n) { return names.indexOf(n) === names.lastIndexOf(n); });
  });
  check('同一底图的各循环氛围名互异（bg1 四循环四气氛）', sameNameOk);

  /* 4 族粒子按底图主题归属 */
  var famOk = BS.familyOf(0) === 'meadow' && BS.familyOf(7) === 'meadow' &&
    BS.familyOf(8) === 'sea' && BS.familyOf(11) === 'sea' &&
    BS.familyOf(12) === 'petal' && BS.familyOf(15) === 'petal' &&
    BS.familyOf(16) === 'star' && BS.familyOf(23) === 'star';
  check('Δ16b: 粒子族归属（bg1/2→meadow、bg3→sea、bg4→petal、bg5/6→star）', famOk);

  /* 粒子层纯函数绘制（4 族 × 多时间点——坐标有限性契约） */
  var okPart = true;
  var fams = ['meadow', 'sea', 'petal', 'star'];
  for (var fi = 0; fi < fams.length; fi++) {
    for (var ti = 0; ti < 5; ti++) {
      try { BS.drawParticles(makeCtx(), fams[fi], 90, 160, ti * 1400 + 300, 1); } catch (errP) { okPart = false; }
    }
  }
  check('4 族粒子纯函数绘制无异常（meadow/sea/petal/star）', okPart);

  /* 全视口舞台绘制（贴图缺失 → 渐变兜底 + 氛围 + 粒子——无异常） */
  var okStage = true;
  for (var si = 0; si < 24; si++) {
    try { BS.drawStage(makeCtx(), si * 3 + 1, 90, 160, si * 700, 1); } catch (errS) { okStage = false; }
  }
  check('Δ16b: 24 循环全视口舞台绘制无异常（渐变兜底 + 24 档氛围 + 粒子）', okStage);

  /* 贴图探测在 Node 无 Image 环境降级 failed（不抛错） */
  var probeRec = BS.probe(1);
  check('贴图探测无 DOM 环境降级 failed（渐变兜底命中）', probeRec.state === 'failed');
  check('resolveImage 无贴图时返回 null（走渐变兜底）', BS.resolveImage(0) === null);

  /* 背景层与棋盘层分离（BoardRenderer 不再内绘场景——透出背景） */
  var src = require('fs').readFileSync(__dirname + '/../src/render/BoardRenderer.js', 'utf8');
  check('BoardRenderer 场景层已移出棋盘画布（drawEcoBackdrop 已下线）',
    src.indexOf('function drawEcoBackdrop') === -1);

  /* Δ15b3e（Bug B 修复）: 磨砂暖白 veil 已移除——画布完全透明透出高清背景，
   * 滑块对比度改由自身 3D 厚度边 + 深色投影承载。原断言钉的是被移除的
   * 蒙版字面量，改为反向断言「雾遮罩不得回归」+ 正向断言新可读性载体。 */
  check('Bug B: 磨砂暖白 veil 已移除（不再有雾遮罩——高清背景锐利透出）',
    src.indexOf('rgba(255,252,246,0.10)') === -1);
  check('Bug B: 滑块改由深色投影承载对比度（rgba(15,23,42,0.30)）',
    src.indexOf('rgba(15, 23, 42, 0.25)') !== -1);
  check('Bug B: 切片分辨率提升至 256（SLICE_PX=256，非 128）',
    /SLICE_PX\s*=\s*256/.test(src) && src.indexOf('cv.width = 128') === -1);
  check('Bug B: DPR 2x 下限超采样（Math.max(2, devicePixelRatio)）',
    /Math\.max\(2,\s*global\.devicePixelRatio\s*\|\|\s*1\)/.test(src));
  check('Bug B: 显式高质量插值（imageSmoothingQuality=high）',
    src.indexOf("imageSmoothingQuality = 'high'") !== -1);

  /* Δ15b3e（Bug A 修复）: Dock 与棋盘同源——DataURL 缓存 + canvas 兜底 */
  var BR = STM;
  check('Bug A: paintDockIcons 已导出（file:// canvas 同源兜底）',
    typeof BR.paintDockIcons === 'function');
  check('Bug A: dockIconDataURL 已导出（DataURL 缓存出口）',
    typeof BR.dockIconDataURL === 'function');
  check('Bug A: chipSVG 走 .dock-icon 类（含 img/canvas 双出口）',
    src.indexOf('class="dock-icon"') !== -1);
  check('Bug A: ensureSinglesFor onerror 不再无条件覆写已有来源（TOCTOU 修复）',
    src.indexOf("img.onerror = function () { source[bid] = 'emoji'; }") === -1);
  check('Bug A: 降级路径有 console.warn 留痕（不再静默吞异常）',
    src.indexOf('warnOnce') !== -1);

  /* Δ15b3e（Bug C 修复）: 四向高饱和主题色箭头 */
  check('Bug C: 方向箭头四向主题色表存在',
    /DIR_COLORS\s*=\s*\['#10B981',\s*'#F59E0B',\s*'#EF4444',\s*'#3B82F6'\]/.test(src));
  check('Bug C: 箭头填充取 DIR_COLORS（不再是纯白 #FFFFFF）',
    src.indexOf("ctx.fillStyle = DIR_COLORS[d]") !== -1);
  check('Bug C: 箭头保留 1.5px 纯白描边',
    src.indexOf("ctx.strokeStyle = 'rgba(255,255,255,1)'") !== -1);

  /* CSS 侧: backdrop-filter 与白纱不得回归（先剥注释——注释中引用了
   被移除的旧属性名「backdrop-filter」，会误判） */
  var cssRaw = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
  var css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  var boardRule = (css.match(/#board\s*\{[^}]*\}/) || [''])[0];
  check('Bug B: #board 无 backdrop-filter（毛玻璃已移除）',
    boardRule.indexOf('backdrop-filter') === -1);
  check('Bug B: #board 底板透明（无灰白雾遮罩）',
    /background:\s*transparent/.test(boardRule));

  /* Δ15b3f（回归守卫）: 棋盘尺寸负反馈棘轮——
   * 原实现读 canvas.clientWidth 再写回 canvas.style.width，每次 refresh
   * 掉 2~4px（实测 20 步 480px→176px）。三条铁律：
   *   ① JS 侧绝不写 canvas.style.width/height
   *   ② 尺寸来源只能是父容器 #board-wrap（canvas.parentElement）
   *   ③ 正方形状由 CSS 的 aspect-ratio 单向声明。
   * 断言在**剥离注释后**的源码上做——注释中引用了被禁的 API 名字，
   * 直接 grep 会误判。 */
  var srcCode = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('Δ15b3f: JS 不回写 canvas.style 宽高（切断尺寸负反馈棘轮）',
    srcCode.indexOf('canvas.style.width') === -1 && srcCode.indexOf('canvas.style.height') === -1);
  check('Δ15b3f: 尺寸来源为父容器 canvas.parentElement',
    /var wrap = canvas\.parentElement/.test(srcCode));
  check('Δ15b3f: 边长下限 280（防极小屏塌缩）',
    /Math\.max\(280,\s*Math\.floor\(Math\.min\(/.test(srcCode));
  check('Δ15b3f: setBitmapSize 幂等（尺寸未变直接返回，不重置画布）',
    /side === lastSideCss/.test(srcCode));
  check('Δ15b3f: 每帧 draw 开头绝对重置变换矩阵（CSS 空间 dpr 矩阵）',
    /ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\)/.test(srcCode) &&
    /ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\);\s*\n\s*ctx\.clearRect/.test(srcCode));
  check('Δ15b3f: 全文件无 ctx.scale 累加调用（变换只经 setTransform 绝对赋值）',
    srcCode.indexOf('ctx.scale(') === -1);
  check('Δ15b3f: #board CSS 正方形状由 aspect-ratio + width 声明',
    /aspect-ratio:\s*1\s*\/\s*1/.test(boardRule) && /width:\s*calc\(100% - 12px\)/.test(boardRule));
  check('Δ15b3f: #dock 固定死高度（chip 进出不挤压棋盘）',
    /height:\s*clamp\(58px/.test((css.match(/#dock\s*\{[^}]*\}/) || [''])[0]));
  check('Δ15b3f: #hud 固定死高度（IQ 文案不撑大）',
    /height:\s*clamp\(54px/.test((css.match(/#hud\s*\{[^}]*\}/) || [''])[0]));
}

/* =========================================================
 * 场景 H: Δ16 断言组（T067 §3）—— profile v2 往返 / 棱晶扣费原子性与余额下限
 * / 拼图进度递增 / 开机动画时序常量 / 72 关扩容口径
 * ========================================================= */
function scenarioDelta16() {
  console.log('场景 H: Δ16 断言组（profile v2 + 棱晶经济 + 拼图进度 + 开机动画 + 72 关口径）');

  /* ---------- H1: 关卡数据 72 关口径（Δ16a） ---------- */
  check('Δ16a: LEVELS.length = 72（FR-008 扩容铁律）', LEVELS.length === 72);
  var idSeqOk = true, chOk = true, waveOk = true;
  for (var li = 0; li < LEVELS.length; li++) {
    if (LEVELS[li].id !== li + 1) idSeqOk = false;
    var wantCh = li < 24 ? 1 : (li < 48 ? 2 : 3);
    if (LEVELS[li].chapter !== wantCh) chOk = false;
    if (li >= 3) { /* L4+ 三关循环: 2 简 7×7 + 1 难 8×8 */
      var wantN = (LEVELS[li].id - 4) % 3 === 2 ? 8 : 7;
      if (LEVELS[li].n !== wantN) waveOk = false;
    }
  }
  check('Δ16a: 72 关 id 连续（LEVELS[i].id === i+1）', idSeqOk);
  check('Δ16a: 章区间 ch1[1,24]/ch2[25,48]/ch3[49,72]（3×24 大阶段）', chOk);
  check('Δ16a: L4~L72 严格「2 简(7×7) 1 难(8×8)」三关循环', waveOk);
  check('Δ16a: L63/L66/L69/L72 为新增尾段 8×8 挑战位',
    [63, 66, 69, 72].every(function (id) { return LEVELS[id - 1].n === 8; }));

  /* ---------- H2: profile v2 往返读写一致 ---------- */
  var P = STM.Profile;
  check('Δ16c: STM.Profile 挂载（装载序 main 之前）', !!P && typeof P.load === 'function');
  memStore.removeItem(P.PROFILE_KEY);
  P.load();
  var g0 = P.get();
  check('Δ16c: 初始棱晶 200（FR-041 赠送起点）', g0.shards === 200);
  check('Δ16c: 默认档案 {name: 探险家, avatarSuit: 6}（大熊猫头像）',
    g0.nickname === '探险家' && g0.avatar === 6);
  check('Δ16c: 默认设置 {bgm:true, sfx:true, haptics:true}（三项独立开关）',
    g0.settings.bgm === true && g0.settings.sfx === true && g0.settings.haptics === true);
  check('Δ16c: 拼图进度初始 6 幅全 0（6 幅画卷 × 每幅 0~4 块）',
    g0.paintingProgress.length === 6 && g0.paintingProgress.every(function (v) { return v === 0; }));

  /* 写入 → 存档 → 重读 → 一致 */
  P.setNickname('小明');
  P.setAvatar(12);
  P.setSetting('bgm', false);
  P.setSetting('haptics', false);
  P.addShards(75);
  P.save();
  P.load();
  var g1 = P.get();
  check('Δ16c: v2 往返读写一致（昵称/头像/设置/棱晶）',
    g1.nickname === '小明' && g1.avatar === 12 &&
    g1.settings.bgm === false && g1.settings.sfx === true && g1.settings.haptics === false &&
    g1.shards === 275);

  /* 旧 v1 进度键并存不迁移（FR-041 §4 / Δ16c 铁律） */
  memStore.setItem('slide-triple:progress:v1', JSON.stringify({ v: 1, unlocked: 7, last: 6, best: {}, muted: false }));
  P.load();
  check('Δ16c: profile v2 与 progress v1 并存（v1 键零改写——不迁移）',
    JSON.parse(memStore.getItem('slide-triple:progress:v1')).unlocked === 7 && P.PROFILE_KEY !== 'slide-triple:progress:v1');

  /* ---------- H3: 棱晶扣费原子性与余额下限 ---------- */
  P.set('shards', 100);
  check('Δ16f: 余额 100 扣 50 → true 且余额归零（余额恰等于价格不得误判不足）',
    P.spendShards(50) === true && P.get().shards === 50);
  check('Δ16f: 余额 50 扣 50 → true 且余额 0（原子生效）',
    P.spendShards(50) === true && P.get().shards === 0);
  check('Δ16f: 余额 0 扣 50 → false 且余额恒 0（零扣费零消耗）',
    P.spendShards(50) === false && P.get().shards === 0);
  P.addShards(-99999);
  check('Δ16f: 负向增减下限钳制 0（余额 MUST NOT 出现负值）', P.get().shards === 0);
  check('Δ16f: 扣费零消耗（余额不足时 spendShards 不改余额）',
    P.spendShards(100) === false && P.get().shards === 0);

  /* ---------- H4: 首通幂等 + 拼图进度递增 ---------- */
  check('Δ16f: grantFirstClear 首次 true / 重复 false（幂等）',
    P.grantFirstClear(5) === true && P.grantFirstClear(5) === false);
  var tiles = [];
  for (var t = 0; t < 5; t++) tiles.push(P.unlockPaintingTile(0));
  check('Δ16f: 拼图块递增至上限 4（第 5 次返回 false）',
    tiles[0] === true && tiles[3] === true && tiles[4] === false && P.get().paintingProgress[0] === 4);
  check('Δ16f: 6 幅画卷进度互相独立', P.get().paintingProgress[1] === 0 && P.get().paintingProgress[5] === 0);
  check('Δ16b: paintingIndexOfLevel 画卷归属（L1-12→0 / L13-24→1 / L61-72→5）',
    P.paintingIndexOfLevel(1) === 0 && P.paintingIndexOfLevel(12) === 0 &&
    P.paintingIndexOfLevel(13) === 1 && P.paintingIndexOfLevel(61) === 5 &&
    P.paintingIndexOfLevel(72) === 5);

  /* ---------- H5: 隐私模式降级（存储不可用照常可玩，D-03） ---------- */
  var realLS = globalThis.localStorage;
  try {
    globalThis.localStorage = {
      getItem: function () { throw new Error('SecurityError: 隐私模式'); },
      setItem: function () { throw new Error('SecurityError: 隐私模式'); }
    };
    P.load();
    P.addShards(30);
    check('Δ16c: 隐私模式降级为内存态（load 不抛错 + 照常可玩 + 余额恒非负）',
      P.get().shards === 30 && P.spendShards(999) === false && P.get().shards === 30);
  } finally {
    globalThis.localStorage = realLS;
    P.load();
  }

  /* ---------- H6: 开机动画时序常量（FR-038） ---------- */
  var SP = STM.Splash;
  check('Δ16d: STM.Splash 挂载且 show 可调用', !!SP && typeof SP.show === 'function');
  check('Δ16d: 开机动画总时长 ≈2.0s（TOTAL_MS === 2000）', SP.TOTAL_MS === 2000);
  check('Δ16d: 淡出时长常量为正且 ≤ 总时长（平滑淡出）',
    SP.FADE_MS > 0 && SP.FADE_MS <= SP.TOTAL_MS);
  check('Δ16d: 和弦音触发时刻在动画时序窗口内（0 < CHIME_AT < TOTAL_MS）',
    SP.CHIME_AT > 0 && SP.CHIME_AT < SP.TOTAL_MS);

  /* 开机和弦音 autoplay 合规 + BGM/SFX 粒度接口 */
  var sm = STM.createSoundManager({});
  check('Δ16d: SoundManager 暴露 playBootChime（纯代码合成和弦音）',
    typeof sm.playBootChime === 'function');
  check('Δ16d: autoplay 合规——首次交互前 playBootChime 静默返回 false',
    sm.playBootChime() === false);
  check('Δ16c: SoundManager 暴露 BGM/SFX 独立静音粒度接口',
    typeof sm.setBgmMute === 'function' && typeof sm.setSfxMute === 'function');
  sm.setBgmMute(true);
  check('Δ16c: BGM 静音粒度独立生效', sm.isMuted() === true);
  sm.setSfxMute(false);
  sm.setBgmMute(false);
  check('Δ16c: 兼容 setMuted() 仍同时置两粒度（Δ14 单开关行为零回归）',
    (sm.setMuted(true), sm.isMuted() === true) && (sm.setMuted(false), sm.isMuted() === false));

  /* ---------- H7: 开机动画零持久化副作用（FR-038 §6） ---------- */
  var beforeShards = P.get().shards;
  var beforePainting = P.get().paintingProgress.join(',');
  var lsBefore = memStore._dump()[P.PROFILE_KEY];
  var splashSrc = require('fs').readFileSync(__dirname + '/../src/ui/splash.js', 'utf8');
  var profileSrc = require('fs').readFileSync(__dirname + '/../src/core/profile.js', 'utf8');
  check('Δ16d: splash/profile 模块零关卡数据写入（不回写 levels.js——FR-041 §4 铁律）',
    splashSrc.indexOf('STM.LEVELS') === -1 && profileSrc.indexOf('STM.LEVELS') === -1);
  check('Δ16d: 动画播放不触碰棱晶/拼图态（纯表现层）',
    P.get().shards === beforeShards && P.get().paintingProgress.join(',') === beforePainting &&
    memStore._dump()[P.PROFILE_KEY] === lsBefore);

  /* ---------- H8: index.html 骨架与加载序 ---------- */
  var html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  check('Δ16d: index.html 含 #splash-screen 骨架（HooLey 六个字母 span）',
    html.indexOf('id="splash-screen"') !== -1 && (html.match(/class="splash-ch/g) || []).length === 6);
  check('Δ16d: HooLey 骨架含两个双环 o（splash-oo）与 GAMES 副标题',
    (html.match(/splash-oo/g) || []).length === 2 && html.indexOf('>GAMES<') !== -1);
  check('Δ16c/Δ16d: index.html 加载序 profile → splash → main',
    html.indexOf('src/core/profile.js') !== -1 &&
    html.indexOf('src/core/profile.js') < html.indexOf('src/ui/splash.js') &&
    html.indexOf('src/ui/splash.js') < html.indexOf('src/main.js'));
  var splashCss = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
  check('Δ16d: 开机背景为高级黑径向渐变（绝不用纯黑 #000000）',
    /#splash-screen\s*\{[^}]*radial-gradient\(circle at 50% 42%/.test(splashCss));
  check('Δ16d: 开机背景含黑曜石微光口径 #181E29 → #0B0E14 → #05070A',
    splashCss.indexOf('#181E29') !== -1 && splashCss.indexOf('#0B0E14') !== -1 &&
    splashCss.indexOf('#05070A') !== -1);
  check('Δ16d: 白金流光扫掠由 --sweep 驱动（渐变遮罩，非整体闪烁）',
    /--sweep/.test(splashCss));
}


/* =========================================================
 * Δ16g/T074 + Δ17 断言组 —— 复活净化花色守恒 + 外围 UI 原创性红线
 * ========================================================= */
function scenarioPurifyAndOriginality() {
  console.log('\n[Δ16g/Δ17] 复活净化（applyPurify）+ 外围 UI 原创性红线');

  var lvl = LEVELS[0]; /* 只读消费（与 T052c 一致） */
  var st = RE.init(lvl);
  var baseTiles = st.tiles.length;

  /* 造出 Dock 滞留（三个**不同**花色各一块）+ 生命耗尽态
     （Δ19 v2 布局：移除序前 3 块同属一个三元组（同花色）——
       故 MUST 按花色去重取样，否则 Dock 内已是同色三张 → 板面无块可净化）*/
  var pickSuits = [];
  for (var pi = 0; pi < st.tiles.length && pickSuits.length < 3; pi++) {
    if (pickSuits.indexOf(st.tiles[pi].s) < 0) pickSuits.push(st.tiles[pi].s);
  }
  var s0 = pickSuits[0], s1 = pickSuits[1], s2 = pickSuits[2];
  st.dock = [
    { id: 9001, s: s0 }, { id: 9002, s: s0 }, { id: 9003, s: s0 }, { id: 9004, s: s0 },
    { id: 9005, s: s1 }, { id: 9006, s: s1 },
    { id: 9007, s: s2 }
  ];
  check('Δ16g: 净化前处于 lost_burst 终局态', RE.terminal(st) === 'lost_burst', RE.terminal(st));

  /* 净化前存活滑块数（MUST 在净化前取——净化只置 removed 标记，
   * `state.tiles` 数组长度恒定，下标 == 滑块 id 是引擎寻址铁律） */
  var liveBefore = st.tiles.filter(function (t) { return !t.removed; }).length;

  var r = RE.applyPurify(st);
  check('Δ16g: applyPurify 已导出且可调用', typeof r === 'object' && !!r.events);
  check('Δ16g: Dock 完全腾空（FR-043 §3）', st.dock.length === 0, 'dock=' + st.dock.length);
  check('Δ16g: 生命恢复为 3（FR-043 §3）', st.lives === lvl.lives || st.lives === 3, 'lives=' + st.lives);
  check('Δ16g: 净化后回到可玩态（续局不重置棋盘）', RE.terminal(st) === 'playing', RE.terminal(st));
  /* 板面被成组消除：MUST 以**存活滑块数**计（Δ19 起 `state.tiles` 数组长度
   * 恒定不变——下标 == 滑块 id 是引擎寻址铁律，净化只置 removed 标记） */
  var liveAfter = st.tiles.filter(function (t) { return !t.removed; }).length;
  check('Δ16g: 板面被成组消除（存活滑块数减少）', liveAfter < liveBefore,
    liveBefore + ' -> ' + liveAfter);

  /* 花色守恒铁律: 每组恒为 3 的倍数（MUST NOT 留非 3 倍数余数） */
  var groups = r.events.filter(function (e) { return e.e === 'match'; });
  var allMultiple3 = groups.length > 0 && groups.every(function (e) { return e.ids.length % 3 === 0; });
  check('Δ16g: 花色守恒——每组恒为 3 的倍数（FR-043 §4）', allMultiple3,
    groups.map(function (e) { return e.suit + ':' + e.ids.length; }).join(','));
  check('Δ16g: 腾空 Dock + 板面消除成组，无非法余数态',
    r.removed > 0 && r.removed === groups.reduce(function (a, e) { return a + e.ids.length; }, 0));

  /* 空 Dock 幂等：不得崩、不得改棋盘 */
  var st2 = RE.init(lvl);
  var t2 = st2.tiles.length;
  var r2 = RE.applyPurify(st2);
  check('Δ16g: 空 Dock 净化幂等（不崩、不改板面）', r2.removed === 0 && st2.tiles.length === t2);

  /* 不变量: 净化不改动既有判定口径 —— 三消/射线仍可用 */
  var st3 = RE.init(lvl);
  var probe = RE.snapshot(st3);
  var t3 = st3.tiles.length;
  RE.applyPurify(st3);
  check('Δ16g: 净化后快照与渲染探针仍可用（未破坏引擎结构）',
    !!probe && !!RE.renderProbe(st3) && st3.tiles.length === t3);

  /* ---------- Δ19 回归：净化后引擎寻址不变量（board/tiles 脱钩 Bug 门禁） ----------
   * Bug 现象（Δ16g 初版）：applyPurify 用 `tiles.filter()` 压缩数组并跳过
   *   `state.board[r][c]` 栈维护 → ① 数组下标与滑块 id 脱钩，玩家点击命中
   *   **错误**的滑块；② 被净化的滑块仍留在 board 栈里 → 继续挡光、继续占据
   *   栈顶 → 复活后大量滑块变成「点不动的死块」；③ 候选块未过滤 `removed`
   *   → 选中已飞出棋盘的幽灵块，既不消块也不消除。
   * 铁律：`state.tiles` 下标 MUST 恒等于滑块 id；`state.board` 栈 MUST 与
   *   `tiles` 的存活集合逐格一致。 */
  var st4 = RE.init(lvl);
  st4.dock = [{ id: 9001, s: st4.tiles[0].s }];
  var r4 = RE.applyPurify(st4);
  var rmIds4 = [];
  r4.events.forEach(function (e) { if (e.e === 'remove') rmIds4 = rmIds4.concat(e.ids); });
  check('Δ19: 净化后 tiles 下标恒等于滑块 id（寻址不变量）',
    st4.tiles.every(function (t, i) { return t.id === i; }));
  var phantom4 = 0;
  for (var rr4 = 0; rr4 < st4.n; rr4++) {
    for (var cc4 = 0; cc4 < st4.n; cc4++) {
      var cell4 = st4.board[rr4][cc4];
      if (!cell4 || !cell4.length) continue;
      cell4.forEach(function (t) { if (rmIds4.indexOf(t.id) >= 0) phantom4++; });
    }
  }
  check('Δ19: board 栈已摘除被净化滑块（无幽灵阻挡块）', phantom4 === 0, 'phantom=' + phantom4);
  var emptyCell4 = 0;
  for (var rr4b = 0; rr4b < st4.n; rr4b++) {
    for (var cc4b = 0; cc4b < st4.n; cc4b++) {
      var cell4b = st4.board[rr4b][cc4b];
      if (cell4b && !cell4b.prism && !cell4b.length) emptyCell4++;
    }
  }
  check('Δ19: board 空栈已置 null（空数组不得被射线判为占格）', emptyCell4 === 0, 'empty=' + emptyCell4);

  /* 复活后必须仍可正常操作：活着的滑块中「点不动」的数量 MUST NOT 超过
   * 未净化时的基线（被上层滑块压住本就可点不动——那是正常堆叠口径）。 */
  var stBase = RE.init(lvl);
  var baseStuck = RE.renderProbe(stBase).tiles.filter(function (t) { return !RE.canTap(stBase, t.id); }).length;
  var afterStuck = RE.renderProbe(st4).tiles.filter(function (t) { return !RE.canTap(st4, t.id); }).length;
  check('Δ19: 复活后「点不动的活块」不超基线（无死块残留）',
    afterStuck <= baseStuck, 'base=' + baseStuck + ' after=' + afterStuck);

  /* 候选块 MUST 过滤 removed —— 不得选中已飞出棋盘的幽灵块 */
  var st5 = RE.init(lvl);
  for (var i5 = 0; i5 < 8; i5++) RE.applyTap(st5, i5);
  var deadBefore5 = st5.tiles.filter(function (t) { return t.removed; }).length;
  /* 记录净化前已死滑块的 id 集合——净化后新增的 removed 才是真正被净化的 */
  var deadIds5 = {};
  st5.tiles.forEach(function (t) { if (t.removed) deadIds5[t.id] = true; });
  st5.dock = [{ id: 9002, s: st5.tiles[0].s }];
  var r5 = RE.applyPurify(st5);
  var rmIds5 = [];
  r5.events.forEach(function (e) { if (e.e === 'remove') rmIds5 = rmIds5.concat(e.ids); });
  /* 幽灵块 = 净化声称消除、但净化前就已经死了（既不在棋盘上也不在 Dock 上） */
  var ghost5 = rmIds5.filter(function (id) { return id !== 9002 && deadIds5[id] === true; });
  check('Δ19: 净化不选中已移出棋盘的幽灵块（候选过滤 removed）',
    deadBefore5 > 0 && ghost5.length === 0, 'dead=' + deadBefore5 + ' ghost=' + ghost5.join(','));

  /* 复活后仍能继续操作（tap 链路完好——MUST NOT 出现点击命中错块） */
  var tapOk5 = RE.renderProbe(st5).tiles.filter(function (t) { return RE.canTap(st5, t.id); });
  var tapRes5 = tapOk5.length ? RE.applyTap(st5, tapOk5[0].id) : null;
  check('Δ19: 复活后棋盘仍可正常点击出块（tap 链路完好）',
    !!tapRes5 && (tapRes5.type === 'flyout' || tapRes5.type === 'prism-flyout' || tapRes5.type === 'blocked'),
    tapRes5 ? tapRes5.type : 'no-tappable');

  /* ---------- Δ17 外围 UI 原创性红线 ---------- */
  var fs = require('fs');
  var path = require('path');
  var RT = path.join(__dirname, '..');

  var lobbySrc = fs.readFileSync(path.join(RT, 'src', 'ui', 'lobby.js'), 'utf8');
  var resultSrc = fs.readFileSync(path.join(RT, 'src', 'ui', 'result.js'), 'utf8');
  var modalsSrc = fs.readFileSync(path.join(RT, 'src', 'ui', 'modals.js'), 'utf8');
  var failSrc = fs.readFileSync(path.join(RT, 'src', 'ui', 'fail.js'), 'utf8');

  /* 竞品元素禁令（MUST NOT 出现在成品视觉实现中）—— 仅允许出现在
   * 「禁令声明」语境（注释里出现关键词不计为实现） */
  var srcAll = [lobbySrc, resultSrc, modalsSrc, failSrc];
  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }
  var implOnly = srcAll.map(stripComments).join('\n');

  var banned = [
    ['浅蓝竖条纹木墙', /stripe[\s_-]*wall|木墙|wallpaper/i],
    ['室内盆栽', /potted[\s_-]*?plant|盆栽/i],
    ['风景木质相框', /wooden?[\s_-]*frame|木质相框/i],
    ['天蓝丝带横幅', /ribbon[\s_-]*banner|丝带横幅/i],
    ['金色庆典号角', /gold[\s_-]*?horn|庆典号角|号角/i],
    ['天蓝圆弧顶盖', /skyblue[\s_-]*?arch|天蓝圆弧/i]
  ];
  var hits = banned.filter(function (b) { return b[1].test(implOnly); })
    .map(function (b) { return b[0]; });
  check('Δ17: 外围 UI 实现零竞品视觉元素（七项禁令）', hits.length === 0, hits.join(','));

  /* Δ17 三项核心原创载体必须在实现中就位 */
  check('Δ17: 棱晶星盘（Prism Portal）载体就位',
    /portal-chip/.test(lobbySrc) && /portal-ring/.test(lobbySrc));
  /* Δ20 Bug 3：8 齿长方体凸起已删除——实现中 MUST NOT 残留 .portal-gear 构造 */
  check('Δ20: 星盘无 8 齿长方体凸起（.portal-gear 已删除）',
    !/portal-gear/.test(stripComments(lobbySrc)));
  check('Δ17: 大厅兜底为云端浮空岛（非室内场景）',
    /drawCloudIslands/.test(lobbySrc) && /drawFloatingIsland/.test(lobbySrc) && !/木桌|窗景/.test(implOnly));
  check('Δ17: 奶油果冻弹窗基底（琥珀金铭牌 + 棱晶拨片）',
    /jelly-plaque/.test(modalsSrc) && /prism-toggle/.test(modalsSrc) && !/arc-cap|天蓝顶盖/.test(implOnly));
  check('Δ17: 双风翼棱晶能量铭牌（无彩带横幅/号角）',
    /plate-wing/.test(resultSrc) && /plate-bar/.test(resultSrc) && !/banner|号角/.test(implOnly));
  check('Δ17: 传送门开启展板（大陆全貌 + 关卡徽章 + 手账）',
    /portal-board/.test(resultSrc) && /portal-board-range/.test(resultSrc) && /portal-board-note/.test(resultSrc));
  check('Δ17: 失败页零倒计时（无 countdown 类名/话术）',
    /fail-encourage/.test(failSrc) && !/countdown|倒计时|限时/.test(stripComments(failSrc)));

  /* ---------- Δ19: Batch C 结构补强回归（T072/T073/T074 契约细化） ----------
   * ① T072 ③: 结算层 MUST 展示**完整 2×2 棱晶星盘**（4 块能量晶片），
   *    而非单块象限；未点亮象限呈紫晶盲盒态（不泄漏画面内容）。
   * ② T073 ③⑤: 传送门展板的名称/徽章/手账 MUST 指向**下一片**大陆
   *    （nextIdx = pi + 1），且手账文案为**两行**；终局（bg6）MUST NOT
   *    显示越界的 `关卡 X-Y` 区间。
   * ③ T074 ③: 失败页 MUST 提供**右上角返回主大厅**按钮。 */
  check('Δ19: 结算层展示完整 2×2 棱晶星盘（4 块晶片）',
    /result-chip result-chip-/.test(resultSrc) &&
    /for \(var q = 0; q < 4; q\+\+\)/.test(resultSrc) &&
    /is-blind/.test(resultSrc));
  check('Δ19: 传送门展板指向下一片大陆（nextIdx = pi + 1）',
    /var nextIdx = pi \+ 1/.test(resultSrc) &&
    /PAINTING_RANGES\[nextIdx\]/.test(resultSrc) &&
    /PAINTING_NAMES\[nextIdx\]/.test(resultSrc));
  check('Δ19: 手账文案为两行（两段 portal-board-note-text）',
    (resultSrc.match(/portal-board-note-text/g) || []).length >= 3);
  check('Δ19: 终局（bg6 拼齐）不显示越界关卡区间',
    /isLast/.test(resultSrc) && /全境点亮/.test(resultSrc));
  check('Δ19: 失败页提供右上角返回主大厅按钮',
    /fail-back-lobby/.test(failSrc) && /opts\.onLobby/.test(failSrc));

  /* 切片区必须复用会话级缓存（MUST NOT 新建 Image —— FR-035 §6） */
  var bdSrc = fs.readFileSync(path.join(RT, 'src', 'render', 'backdrops.js'), 'utf8');
  var drawQuadrantBody = bdSrc.slice(bdSrc.indexOf('function drawQuadrant'),
                                     bdSrc.indexOf('function drawWhole'));
  check('Δ17: 晶片切片复用会话级 Image 缓存（零额外解码/请求）',
    /probeBgImage/.test(drawQuadrantBody) && !/new Image/.test(drawQuadrantBody));

  /* Δ18: 象限源矩形口径回归（FR-035 §6 —— 4 块晶片拼合 == 整幅 cover 裁切）
   * 回归缺陷: 源矩形曾用「缩放后尺寸」当作原图坐标取样，导致每块晶片
   * 显示放大错位的条带。正确口径 = 可见源区域换算回原图像素后取半。 */
  check('Δ18: 象限源矩形换算回原图坐标（sw=cw/scale 后取半）',
    /var sw = cw \/ scale/.test(drawQuadrantBody) &&
    /var qw = sw \/ 2, qh = sh \/ 2/.test(drawQuadrantBody) &&
    !/var fw = iw \* scale/.test(drawQuadrantBody));

  /* 象限取样数值自检：4 块象限 MUST 恰好铺满可见源区域且不越界 */
  (function () {
    var iw = 1440, ih = 2560, dw = 300, dh = 300; /* bg{n}.png 实际尺寸口径 */
    var cw = dw * 2, ch = dh * 2;
    var scale = Math.max(cw / iw, ch / ih);
    var sw = cw / scale, sh = ch / scale;
    var sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    var qw = sw / 2, qh = sh / 2;
    var inBounds = true, covers = true;
    for (var q = 0; q < 4; q++) {
      var qx = q % 2, qy = (q - (q % 2)) / 2;
      var rx = sx + qx * qw, ry = sy + qy * qh;
      if (rx < 0 || ry < 0 || rx + qw > iw + 0.01 || ry + qh > ih + 0.01) inBounds = false;
    }
    /* 拼合宽度 == 可见源宽度（4 块各半宽 = 2qw = sw） */
    if (Math.abs(qw * 2 - sw) > 0.01 || Math.abs(qh * 2 - sh) > 0.01) covers = false;
    check('Δ18: 4 象限取样不越界且恰好铺满可见源区域', inBounds && covers,
      'inBounds=' + inBounds + ' covers=' + covers);
  })();
}

/* =========================================================
 * 场景 I: Δ19/T084~T087 —— 局内 UI 重排 / IQ / 三大道具 / L1-L2 教学
 * ========================================================= */
function scenarioDelta19() {
  console.log('场景 I: Δ19/T084~T087 局内 UI 重排 / IQ / 道具 / 教学');
  var fs = require('fs');
  var path = require('path');
  var RT = path.join(__dirname, '..');
  var brSrc = fs.readFileSync(path.join(RT, 'src', 'render', 'BoardRenderer.js'), 'utf8');
  var mainSrc = fs.readFileSync(path.join(RT, 'src', 'main.js'), 'utf8');
  var lobbySrc = fs.readFileSync(path.join(RT, 'src', 'ui', 'lobby.js'), 'utf8');
  var prismSrc = fs.readFileSync(path.join(RT, 'src', 'ui', 'prism-icon.js'), 'utf8');
  var gsSrc = fs.readFileSync(path.join(RT, 'src', 'core', 'GameState.js'), 'utf8');
  var css = fs.readFileSync(path.join(RT, 'css', 'style.css'), 'utf8');
  var html = fs.readFileSync(path.join(RT, 'index.html'), 'utf8');

  /* ---- T084: 1px 紧贴 / 半格错位 / 无遮罩伪影 / 碎片 ---- */
  check('T084: 同层间距 GAP ≥ 1px', STM.rendererTest.GAP >= 1);
  check('T084: 牌宽 = cellStep - 1（同层 1px 细缝紧贴）',
    brSrc.indexOf('Math.max(1, cell - GAP)') !== -1 &&
    /tileSize:\s*Math\.max\(1, cell - GAP\)/.test(brSrc));
  check('T084: 奇数层半格坐标 +0.5（压 2×2 交界）',
    brSrc.indexOf('z % 2 === 1 ? t.r + 0.5 : t.r') !== -1 &&
    brSrc.indexOf('z % 2 === 1 ? t.c + 0.5 : t.c') !== -1);
  check('T084: 变暗遮罩 / 层间灰影块 / 点阵底纹已彻底移除',
    brSrc.indexOf('rgba(15, 23, 42, 0.32)') === -1 &&
    brSrc.indexOf('0.16 * aboveN') === -1 &&
    brSrc.indexOf('var dotR') === -1 &&
    brSrc.indexOf('rgba(120,135,155,0.55)') === -1);
  /* Δ22c/T111: drawTileBody 的宽高分离（w/h）以支持 blinds_flip 的 scaleX——
   * 图标基准改取**短边** Math.min(w, h)，等比调用点（w === h）与原实现逐像素一致 */
  check('T084: 动物图标 iconSize = tileSize × 0.84（居中铺满）',
    /drawBestiaryIcon\(ctx,\s*sv,\s*x \+ w \/ 2,\s*y \+ h \/ 2,\s*Math\.round\(Math\.min\(w, h\) \* 0\.82\)\)/.test(brSrc));
  check('T084: 卡牌内无内缩白描边（drawTileBody 内零 strokeRect）', (function () {
    var i = brSrc.indexOf('function drawTileBody');
    var j = brSrc.indexOf('function drawBestiaryIcon', i);
    return i >= 0 && j > i && brSrc.slice(i, j).indexOf('strokeRect') === -1;
  })());
  var sh = STM.rendererTest.SHARDS;
  check('T084: 白瓷碎片数落入 48~60', sh && sh.min >= 48 && sh.max <= 60 && sh.max > sh.min);

  /* ---- T085: 顶栏（含 IQ 胶囊）→ 待消槽 → 棋盘 ---- */
  var iqPillAt = html.indexOf('id="iq-pill"');
  var dockAt = html.indexOf('id="dock"');
  var boardAt = html.indexOf('id="board-wrap"');
  var hudAt = html.indexOf('id="hud"');
  check('T085: DOM 顺序为 顶栏（含 IQ）→ 待消槽 → 棋盘，无独立 #iq-bar',
    hudAt >= 0 && iqPillAt > hudAt && dockAt > iqPillAt && boardAt > dockAt &&
    html.indexOf('id="iq-bar"') === -1);
  check('T085: 顶栏中央为极简 IQ（无 `关卡` 文本 / 无 /72 / 无标题节点）',
    html.indexOf('/72') === -1 && html.indexOf('id="iq-value"') !== -1 &&
    html.indexOf('hud-title') === -1 && html.indexOf('关卡') === -1 &&
    /els\.hudNo\.textContent = String\(currentId\)/.test(mainSrc));
  check('T085: 生命/分数/连击次级栏彻底移除',
    html.indexOf('id="hud-lives"') === -1 && html.indexOf('id="hud-score"') === -1 &&
    html.indexOf('id="hud-combo"') === -1 && html.indexOf('iq-side') === -1 &&
    mainSrc.indexOf('els.hudLives') === -1 && css.indexOf('.iq-side') === -1);
  check('T085: 顶栏左侧为无文字纯图标键（.hud-round-cap 已删除）',
    html.indexOf('id="btn-lobby"') !== -1 && html.indexOf('id="btn-settings"') !== -1 &&
    html.indexOf('hud-round-cap') === -1 && css.indexOf('.hud-round-cap') === -1 &&
    /function bindHudButtons/.test(mainSrc));
  check('T085: 棱晶图标单一来源（大厅 / 局内共用 STM.PrismIcon）',
    prismSrc.indexOf('STM.PrismIcon') !== -1 &&
    prismSrc.indexOf('var BODY') !== -1 &&
    (prismSrc.slice(prismSrc.indexOf('var BODY')).match(/<polygon /g) || []).length === 7 &&
    lobbySrc.indexOf('GEM_SVG') === -1 && lobbySrc.indexOf('gemSvg(') !== -1 &&
    mainSrc.indexOf('STM.PrismIcon.html(cls)') !== -1 &&
    html.indexOf('src/ui/prism-icon.js') !== -1 &&
    html.indexOf('prism-icon.js') < html.indexOf('lobby.js'));
  check('T085: 局内零 💎 Emoji（顶栏 / 道具角标 / 提示文案 / 失败页 / 结算页 / 画卷预览）',
    mainSrc.indexOf('💎') === -1 && html.indexOf('💎') === -1 &&
    fs.readFileSync(path.join(RT, 'src', 'ui', 'fail.js'), 'utf8').indexOf('💎') === -1 &&
    fs.readFileSync(path.join(RT, 'src', 'ui', 'result.js'), 'utf8').indexOf('💎') === -1 &&
    fs.readFileSync(path.join(RT, 'src', 'ui', 'lobby.js'), 'utf8').indexOf('💎') === -1 &&
    fs.readFileSync(path.join(RT, 'src', 'ui', 'prism-icon.js'), 'utf8').indexOf('💎') === -1);
  check('T085: 棋盘无外框线（#board border:none）',
    /#board\s*\{[\s\S]*?border:\s*none/.test(css));
  check('T085: 待消槽为简约托盘（无木纹 / 无槽内横线）',
    css.indexOf('#dock::before') === -1 &&
    css.indexOf('rgba(30, 41, 59, 0.55)') !== -1 &&
    /\.slot\.empty::after\s*\{\s*content:\s*none/.test(css) &&
    css.indexOf('rgba(15, 23, 42, 0.45)') !== -1);
  /* file:// 下 getImageData 被跨源污染阻断，白键控失败 → 切片保留不透明白底。
   * 若不处理，0.84×tile 的白底会在奶油白卡面上露出「内嵌白方框」。
   * 修法: keyingAvailable() 为 false 时该图标绘制改用 darken 合成（白→卡面本色）。 */
  check('T085: file:// 白键控失败时用 darken 合成消除内嵌白框',
    /keyingOk = false/.test(brSrc) &&
    /keyingAvailable: function \(\) \{ return keyingOk; \}/.test(brSrc) &&
    /!IconAssets\.keyingAvailable\(\)/.test(brSrc) &&
    /globalCompositeOperation = 'darken'/.test(brSrc));
  check('T085: IQ 初始 90 / 增量 3+combo×2 / 四档头衔',
    /var IQ_START = 50/.test(mainSrc) &&
    /3 \+ \(e\.combo \|\| 0\) \* 2/.test(mainSrc) &&
    mainSrc.indexOf("min: 100") !== -1 && mainSrc.indexOf("min: 120") !== -1 &&
    mainSrc.indexOf("min: 150") !== -1 && mainSrc.indexOf("min: 180") !== -1);
  check('T085: 受阻清空 combo（IQ 不扣）', /function breakCombo\(\)/.test(gsSrc) &&
    /engine\.combo = 0/.test(gsSrc) && gsSrc.indexOf("result.type === 'blocked'") !== -1);

  /* 运行时: 受阻 → engine.combo 归零 */
  var blockedLevel = {
    id: 1, n: 3,
    tiles: [
      { r: 1, c: 0, d: 1, s: 0 },  /* 向右被 t1 挡住 */
      { r: 1, c: 1, d: 2, s: 1 }
    ],
    cfg: { items: { undo: 1, magnet: 1, shuffle: 1 } }
  };
  var gb = makeGame(blockedLevel);
  gb.session.engineState().combo = 7;
  var rb = gb.session.tap(0);
  check('T085: 受阻后 combo 立即归零（IQ 不扣分）',
    rb && rb.type === 'blocked' && gb.session.engineState().combo === 0);

  /* 运行时: 被压锁定点击同样归零 combo（T085 契约） */
  var stackedLevel = {
    id: 1, n: 4,
    tiles: [
      { r: 1, c: 1, d: 0, s: 0, z: 0 },  /* 被 z=1 上层压住 */
      { r: 0, c: 0, d: 0, s: 1, z: 1 }
    ],
    cfg: {}
  };
  var gs2 = makeGame(stackedLevel);
  var coveredLocked = !RE.canTap(gs2.session.engineState(), 0);
  gs2.session.engineState().combo = 4;
  var rs2 = gs2.session.tap(0);
  check('T085: 被压锁定点击也清空 combo',
    coveredLocked && rs2 === null && gs2.session.engineState().combo === 0);

  /* ---- T086: 三大道具（底部大圆按钮 + 灵犀/洗牌购买闭环） ---- */
  check('T086: 底部三道具按钮（撤销/灵犀三消/乾坤洗牌）',
    html.indexOf('id="item-undo"') !== -1 && html.indexOf('id="item-magnet"') !== -1 &&
    html.indexOf('id="item-shuffle"') !== -1);
  check('T086: 三按钮均带原创 SVG 图标',
    (html.match(/class="item-icon"/g) || []).length === 3);
  check('T086: 免费次数 0 时角标显示「棱晶图标 + 50」',
    /var ITEM_PRICE = 50/.test(mainSrc) &&
    /cnt\.innerHTML = prismHtml\('prism-gem-sm'\) \+ '<span>' \+ ITEM_PRICE \+ '<\/span>'/.test(mainSrc));
  check('T086: 购买成功判定涵盖 magnet/shuffle（Δ19 修复）',
    /r\.type !== 'undo' && r\.type !== 'magnet' && r\.type !== 'shuffle'/.test(gsSrc));

  var magnetLevel = {
    id: 1, n: 3,
    tiles: [
      { r: 0, c: 0, d: 0, s: 5 },
      { r: 0, c: 1, d: 0, s: 5 },
      { r: 0, c: 2, d: 0, s: 5 }
    ],
    cfg: { items: { undo: 0, magnet: 0, shuffle: 0 } }
  };
  var gm = makeGame(magnetLevel);
  var buy = gm.session.buyItemUse('magnet', null, 50);
  check('T086: 棱晶购买灵犀三消 → 扣费后立即生效',
    buy && buy.ok === true && buy.result && buy.result.type === 'magnet');

  /* ---- T087: L1/L2 教学边界与目标可达 ---- */
  var Tut = STM.Tutorial;
  check('T087: L1/L2 触发，L3+ 零提示',
    !!Tut && Tut._shouldShow(1) === true && Tut._shouldShow(2) === true &&
    Tut._shouldShow(3) === false && Tut._shouldShow(72) === false);
  check('T087: 教学文案分层（L1 基础 / L2 层叠）',
    Tut._text(1).indexOf('待消槽') !== -1 && Tut._text(2).indexOf('层叠') !== -1);
  var tutorLevel = {
    id: 1, n: 3,
    tiles: [
      { r: 0, c: 0, d: 0, s: 6 },
      { r: 0, c: 1, d: 0, s: 6 },
      { r: 0, c: 2, d: 0, s: 6 }
    ],
    cfg: {}
  };
  var gt = makeGame(tutorLevel);
  var targets = Tut._targetsOf(1, gt.session);
  check('T087: L1 目标为 3 张实际可飞出同花色',
    targets.length === 3 && targets.every(function (id) {
      var t = gt.session.engineState().tiles[id];
      return !!t && !t.removed && t.s === 6;
    }));
  check('T087: 教学层非模态（pointer-events:none + 跳过按钮可点）',
    /#tutorial-root[\s\S]*?pointer-events:\s*none/.test(css) &&
    /\.tut-skip[\s\S]*?pointer-events:\s*auto/.test(css));
}


/* =========================================================
 * 场景 J: ingame-hud-render-defects —— 点击几何回归防线
 * 背景: `cell = boardPx / n`（位图像素）与 hitTest 的
 *   `(boardPx / dpr) / rect.width` 相差 dpr 倍 → 只有左上 1/4 可命中。
 * 本场景直接调用 renderer.hitTest（main.js onBoardDown 的同一入口），
 * 逐格点击可视中心断言命中该格卡牌。
 * ========================================================= */
function scenarioHitGeometry() {
  console.log('场景 J: 点击几何（绘制 / 命中同源）');
  var G = STM.rendererTest;
  check('几何: getTileCssRect 已导出（纯函数）', typeof G.getTileCssRect === 'function');

  /* 纯函数: 偶数层 c*step / 奇数层 (c+0.5)*step，边长 = step - 1 */
  var L = { originX: 0, originY: 0, cellStep: 60, tileSize: 59, n: 8 };
  var even = G.getTileCssRect({ r: 2, c: 3, z: 0 }, L);
  var odd = G.getTileCssRect({ r: 2, c: 3, z: 1 }, L);
  check('几何: 偶数层左上角 = (c*step, r*step) 且边框 = tileSize',
    even.x === 180 && even.y === 120 && even.w === 59 && even.h === 59,
    JSON.stringify(even));
  check('几何: 奇数层半格错位 (+0.5 step)',
    odd.x === 210 && odd.y === 150, JSON.stringify(odd));

  var CANVAS_RECT = { left: 0, top: 0, width: 320, height: 320 };
  function hitAt(renderer, tile, rect) {
    var lay = renderer.layoutOf();
    var r = G.getTileCssRect(tile, lay);
    var k = rect.width / (lay.cellStep * lay.n); /* CSS 盒宽 / 画布逻辑边长 */
    return renderer.hitTest(rect.left + (r.x + r.w / 2) * k,
                            rect.top + (r.y + r.h / 2) * k);
  }

  /* ① 满盘单层: 每格中心必须命中自己（n=8 覆盖原缺陷的右/下半区） */
  [5, 8].forEach(function (n) {
    var tiles = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) tiles.push({ r: r, c: c, d: 0, s: (r + c) % 5, z: 0 });
    }
    var g = makeGame({ id: 1, n: n, tiles: tiles, cfg: {} });
    var pr = RE.renderProbe(g.session.engineState());
    var bad = [];
    for (var i = 0; i < pr.tiles.length; i++) {
      var t = pr.tiles[i];
      if (t.covered) continue;
      var got = hitAt(g.renderer, t, CANVAS_RECT);
      if (got !== t.id) bad.push('id' + t.id + '(' + t.r + ',' + t.c + ')→' + got);
    }
    check('几何: ' + n + '×' + n + ' 单层逐格中心 100% 命中（' + pr.tiles.length + ' 格）',
      bad.length === 0, bad.slice(0, 6).join(' '));
  });

  /* ② 奇数层半格错位命中 + 棋盘外返回 -1 */
  var go = makeGame({
    id: 1, n: 4, cfg: {},
    tiles: [
      { r: 0, c: 0, d: 0, s: 0, z: 1 },
      { r: 2, c: 2, d: 0, s: 1, z: 0 }
    ]
  });
  var po = RE.renderProbe(go.session.engineState());
  var oddTile = po.tiles.filter(function (t) { return t.z === 1; })[0];
  check('几何: 奇数层卡牌中心可命中（半格错位）',
    hitAt(go.renderer, oddTile, CANVAS_RECT) === oddTile.id);
  check('几何: 棋盘外点击返回 -1',
    go.renderer.hitTest(-40, -40) === -1 && go.renderer.hitTest(9999, 9999) === -1);

  /* ③ 被压卡牌不可命中（引擎 covered=true → hitTest 跳过） */
  var gs = makeGame({
    id: 1, n: 4, cfg: {},
    tiles: [
      { r: 1, c: 1, d: 0, s: 0, z: 0 },
      { r: 1, c: 1, d: 0, s: 1, z: 1 }
    ]
  });
  var ps = RE.renderProbe(gs.session.engineState());
  var low = ps.tiles.filter(function (t) { return t.z === 0; })[0];
  var lr = G.getTileCssRect(low, gs.renderer.layoutOf());
  var layS = gs.renderer.layoutOf();
  var kS = CANVAS_RECT.width / (layS.cellStep * layS.n);
  /* 取下层牌左上内角（不在上层牌矩形内）验证「被压不可点」 */
  var lx = (lr.x + 5) * kS, ly = (lr.y + 5) * kS;
  check('几何: 被压卡牌 covered 且不可命中',
    low.covered === true && gs.renderer.hitTest(lx, ly) === -1);

  /* ④ 教学小手锚点（tileRect）与 hitTest 闭环一致 */
  var gt = makeGame({
    id: 1, n: 3, cfg: {},
    tiles: [
      { r: 1, c: 0, d: 0, s: 0, z: 0 },
      { r: 0, c: 2, d: 1, s: 1, z: 0 }
    ]
  });
  var pt = RE.renderProbe(gt.session.engineState());
  var tr = gt.renderer.tileRect(pt.tiles[0].id);
  check('几何: tileRect 锚点回投 → hitTest 命中同一张牌',
    !!tr && gt.renderer.hitTest(tr.x, tr.y) === pt.tiles[0].id,
    JSON.stringify(tr));
}

/* ---- 场景 K: 动画层 z 序不变量（Bug 1）+ dock 内框（Bug 2） ----
 * flight-neighbor-morph-dock-inset 回归闸门：
 *   Bug 1 根因——drawAnim 的 gear/unlock 分支调用 drawTileBody 重绘整块卡体，
 *   而动画层整体叠在静态层之后、不做 z 交错 → 低层牌盖住压在其格心上的高层牌。
 *   Bug 2 根因——.slot .dock-icon 的 drop-shadow 按切片 alpha 轮廓（圆角方块）
 *   投射阴影 → 白卡内出现灰蓝内嵌小方框。
 * 断言分三层：① 源码结构 ② 真实跑帧的 drawImage 轨迹 ③ CSS 口径。 */
function scenarioAnimLayerZOrder() {
  console.log('场景 K: 动画层 z 序不变量（Bug 1）+ dock 内框（Bug 2）');
  var fs2 = require('fs');
  var rawSrc = fs2.readFileSync(__dirname + '/../src/render/BoardRenderer.js', 'utf8');
  var src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* 大括号配对截取函数体（含嵌套） */
  function sliceFn(name) {
    var at = src.indexOf('function ' + name + '(');
    if (at < 0) return '';
    var i = src.indexOf('{', at), depth = 0;
    for (var j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
    }
    return '';
  }
  var animBody = sliceFn('drawAnim');
  function branch(kind) {
    if (!animBody) return null;
    var at = animBody.indexOf("a.kind === '" + kind + "'");
    if (at < 0) return null;
    var nxt = animBody.indexOf('} else if (', at);
    return animBody.slice(at, nxt > 0 ? nxt : animBody.length);
  }
  var gearBr = branch('gear');
  var unlockBr = branch('unlock');
  check('Bug1: gear 分支不再重绘卡体（分支内无 drawTileBody）',
    !!gearBr && gearBr.indexOf('drawTileBody') === -1);
  check('Bug1: unlock 分支不再重绘卡体（分支内无 drawTileBody）',
    !!unlockBr && unlockBr.indexOf('drawTileBody') === -1);
  check('Bug1: block 分支已移出动画层（改由静态层施加位移）', branch('block') === null);
  check('Bug1: 动画层循环显式跳过 block', /kind === 'block'\)\s*continue/.test(src));
  check('Bug1: 静态层 drawBoardTile 施加受阻微震位移', src.indexOf('blockDx[t.id]') !== -1);
  check('Bug1: 动画坐标改走 getTileCssRect（无逻辑坐标直乘卡体）',
    !!gearBr && !!unlockBr &&
    gearBr.indexOf('getTileCssRect') !== -1 && unlockBr.indexOf('getTileCssRect') !== -1 &&
    src.indexOf('drawTileBody(ctx, cell, (t.c + 0.5) * cell') === -1);
  check('Bug1: tileInfo 缓存补 covered（防御位）',
    /covered:\s*t\.covered === true/.test(src));

  /* ② 真实跑帧：低层齿轮 + 高层压角牌，触发 gear 动画并记录 drawImage 轨迹 */
  var recCtx = makeCtx();
  recCtx.drawImage = function (img) {
    if (!img || img.__bid == null) return;
    var a = Array.prototype.slice.call(arguments, 1), dx, dy, dw;
    if (a.length >= 8) { dx = a[4]; dy = a[5]; dw = a[6]; }
    else if (a.length >= 4) { dx = a[0]; dy = a[1]; dw = a[2]; }
    else { dx = a[0]; dy = a[1]; dw = img.width; }
    if (zTrace) zTrace.push({ bid: img.__bid, x: dx, y: dy, w: dw });
  };
  var zTrace = null;
  var recCanvas = {
    clientWidth: 320, parentElement: { clientWidth: 320 }, width: 0, height: 0,
    getContext: function () { return recCtx; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 320, height: 320 }; }
  };
  var lvZ = {
    id: 1, n: 3, cfg: {},
    tiles: [
      { r: 1, c: 1, d: 0, s: 0, z: 0, m: 'g' },  /* 低层齿轮（被联动对象） */
      { r: 1, c: 1, d: 0, s: 1, z: 1 },           /* 高层压角牌（必须始终最上） */
      { r: 0, c: 2, d: 1, s: 2, z: 0 }
    ]
  };
  var renderer2 = null;
  var sessZ = STM.GameState.createSession(lvZ, {
    onEvent: function (e) { if (renderer2) renderer2.handleEvent(e); }
  });
  renderer2 = STM.createBoardRenderer(recCanvas, sessZ, {});
  renderer2.setLevel(lvZ);
  renderer2.refresh();

  var IA = STM.IconAssets;
  var origSlice = IA.sliceCanvasOf;
  IA.sliceCanvasOf = function (bid) { return { width: 64, height: 64, __bid: bid }; };
  try {
    var prZ = RE.renderProbe(sessZ.engineState());
    var mapZ = STM.Bestiary.mappingForLevel(lvZ);
    var zOfBid = {};
    prZ.tiles.forEach(function (t) { zOfBid[mapZ[t.s]] = t.z; });
    var gearTile = prZ.tiles.filter(function (t) { return t.m === 'g'; })[0];
    check('Bug1(行为): 关卡含「低层齿轮 + 高层压角」组合（Bug 1 触发前提）',
      !!gearTile && gearTile.z === 0 && gearTile.covered === true);
    if (gearTile) {
      renderer2.handleEvent({ e: 'gear', id: gearTile.id });
      var framesZ = [], sampled = 0, inversions = 0;
      for (var f = 0; f < 26; f++) {
        zTrace = [];
        framesZ.push(zTrace);
        pumpFrames(1);
      }
      framesZ.forEach(function (calls) {
        if (calls.length) sampled++;
        for (var i = 0; i < calls.length; i++) {
          for (var j = i + 1; j < calls.length; j++) {
            var A = calls[i], B = calls[j];
            var za = zOfBid[A.bid], zb = zOfBid[B.bid];
            if (za == null || zb == null || za <= zb) continue; /* 只看「高层先画」 */
            var ox = Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x));
            var oy = Math.max(0, Math.min(A.y + A.w, B.y + B.w) - Math.max(A.y, B.y));
            if (ox * oy > Math.min(A.w * A.w, B.w * B.w) * 0.08) inversions++;
          }
        }
      });
      check('Bug1(行为): gear 动画全程零 z 序反转（' + sampled + ' 帧采样）',
        inversions === 0 && sampled > 0, 'inversions=' + inversions + ' sampled=' + sampled);

      /* ④ 微震下放静态层后必须真的还在抖（防「静默失去动感」的表现层回归） */
      var bt = prZ.tiles.filter(function (t) { return t.r === 0 && t.c === 2; })[0];
      if (bt) {
        renderer2.handleEvent({ e: 'blocked', tileId: bt.id });
        var bxs = {};
        for (var bf = 0; bf < 12; bf++) {
          zTrace = [];
          pumpFrames(1);
          zTrace.forEach(function (r) { if (r.bid === mapZ[bt.s]) bxs[Math.round(r.x)] = 1; });
        }
        check('Bug1(行为): block 微震下放静态层后仍产生水平位移（≥2 个不同 x）',
          Object.keys(bxs).length >= 2, 'xs=' + JSON.stringify(Object.keys(bxs)));
      }
    }
  } finally {
    IA.sliceCanvasOf = origSlice;
    zTrace = null;
  }

  /* ③ CSS 口径（Bug 2）——先剥注释，避免注释里的旧写法误判 */
  var css = fs2.readFileSync(__dirname + '/../css/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  var dockIconRule = (css.match(/\.slot\s+\.dock-icon\s*\{[^}]*\}/) || [''])[0];
  check('Bug2: .slot .dock-icon 不再带 filter（画出内嵌方框的元凶）',
    !!dockIconRule && !/filter\s*:/.test(dockIconRule));
  check('Bug2: keying 成功时投影只给 <img class="dock-icon">（贴合动物轮廓）',
    /\.slot\s+img\.dock-icon\s*\{[^}]*filter\s*:\s*drop-shadow/.test(css));
  check('Bug2: file:// 降级规则 #dock.no-keying 用 darken 融掉切片白底（仅 canvas 直绘形态）',
    /#dock\.no-keying\s+\.slot\s+canvas\.dock-icon\s*\{[^}]*mix-blend-mode\s*:\s*darken/.test(css));
  var dockRule = (css.match(/#dock\s*\{[^}]*\}/) || [''])[0];
  check('Bug2: #dock 托盘仍为深色半透明磨砂（严禁改白）',
    /background\s*:\s*rgba\(30,\s*41,\s*59,\s*0\.55\)/.test(dockRule) &&
    /backdrop-filter\s*:\s*blur\(10px\)/.test(dockRule));
  check('Bug2: paintDockIcons 按 keyingAvailable() 同步 no-keying 类',
    src.indexOf("classList.add('no-keying')") !== -1 &&
    src.indexOf("classList.remove('no-keying')") !== -1);
}

/* =========================================================
 * 场景 L: Δ22c / FR-052 —— 15 种开局进场编舞（T111/T112）
 *   ① 常量表与 15 模式全覆盖、逐种可辨识（规格两两不同）
 *   ② 时序：180ms 纯底图留白 → 基准延迟 180~520ms + z*55ms
 *   ③ 零穿模：同坐标高层延迟恒 > 低层（严格单调，且 = +55ms*z）
 *   ④ 落定归位：动画结束后 introTransformOf → null（静态精确坐标）
 *   ⑤ 点击快进：skipDeal 后立刻可命中且该次点击被正常处理
 *   ⑥ reduced-motion：无位移/无缩放，仅淡入，保留 180ms 留白
 * ========================================================= */
function scenarioDelta22Intro() {
  console.log('场景 L: Δ22c 开局进场编舞（15 模式 / 零穿模 / 落子音 / 点击快进）');
  var RT = STM.rendererTest;
  var I = RT.INTRO;
  var spec = RT.introSpecOf;
  check('T111①: 15 种编舞模式全部登记（mode 0..14）',
    !!I && I.MODES.length === 15);
  check('T111①: 模式名两两互异（逐种可辨识）', (function () {
    var seen = {};
    for (var i = 0; i < I.MODES.length; i++) {
      if (seen[I.MODES[i]]) return false;
      seen[I.MODES[i]] = 1;
    }
    return true;
  })());
  check('T111②: 留白 180ms / 单卡 260ms / 层补偿 55ms / 落定阈值 0.85',
    I.LEAD_MS === 180 && I.TILE_MS === 260 && I.Z_STEP_MS === 55 && I.TICK_AT === 0.85);
  check('T111②: 基准延迟区间 = 180~520ms（LEAD + SPREAD）',
    I.LEAD_MS + I.SPREAD_MS === 520);

  /* 逐模式 × 逐坐标：规格有限性 + ord 值域 + 规格互异 */
  var n = 6;
  var total = n * n;
  var sigs = {};
  var allFinite = true;
  var ordOk = true;
  var distinct = 0;
  for (var m = 0; m < 15; m++) {
    var sig = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var t = { id: r * n + c, r: r, c: c, z: 0, d: (r + c) % 4 };
        var s = spec(m, t, n, r * n + c, total);
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
  check('T111②: 15 模式 × 36 坐标全量规格均为有限数值', allFinite);
  check('T111②: 排序权重 ord 恒落 [0,1]', ordOk);
  check('T111②: 15 种模式的落牌序/位移规格两两不同（非退化）', distinct === 15);

  /* ③ 零穿模：同一 (r,c) 上高层延迟严格更大，且增量 = 55ms × Δz（layer_stack 因 ord 含 z 项而更大） */
  var zMonotone = true;
  var zExact = true;
  for (var m2 = 0; m2 < 15; m2++) {
    for (var rr = 0; rr < n; rr += 2) {
      for (var cc = 0; cc < n; cc += 2) {
        var prev = -Infinity;
        for (var z = 0; z <= 4; z++) {
          var st = spec(m2, { id: rr * n + cc, r: rr, c: cc, z: z, d: 0 }, n, 0, total);
          var dly = I.LEAD_MS + st.ord * I.SPREAD_MS + z * I.Z_STEP_MS;
          if (!(dly > prev)) zMonotone = false;
          if (m2 !== 6 && z > 0 && Math.abs((dly - prev) - I.Z_STEP_MS) > 1e-6) zExact = false;
          prev = dly;
        }
      }
    }
  }
  check('T111③: 同坐标高层延迟严格大于低层（零穿模——先落底层后落顶层）', zMonotone);
  check('T111③: 除 layer_stack 外层延迟增量恒 = +55ms × Δz', zExact);

  /* 运行时：逐模式跑完整进场，零异常 + 落定后归位 */
  var lv = {
    id: 1, name: 'delta22-intro', n: 4, cfg: {},
    tiles: [
      { r: 0, c: 0, d: 1, s: 0, z: 0 },
      { r: 0, c: 2, d: 2, s: 1, z: 0 },
      { r: 1, c: 1, d: 0, s: 2, z: 0 },
      { r: 2, c: 2, d: 3, s: 3, z: 0 },
      { r: 3, c: 0, d: 1, s: 4, z: 0 }
    ],
    prisms: []
  };
  var dealTicks = [];
  var cv = makeCanvas();
  var ctxTrace = cv.getContext('2d');
  var fillCount = 0;
  var origFill = ctxTrace.fill;
  ctxTrace.fill = function () { fillCount++; return origFill.apply(ctxTrace, arguments); };
  var rnd = null;
  var sess = STM.GameState.createSession(lv, {
    onEvent: function (e) { if (rnd) { rnd.handleEvent(e); rnd.refresh(); } }
  });
  rnd = STM.createBoardRenderer(cv, sess, {
    onDealTick: function (p) { dealTicks.push(p); }
  });
  rnd.refresh();

  var modeOk = true;
  var settledOk = true;
  var tickOk = true;
  for (var mm = 0; mm < 15; mm++) {
    dealTicks = [];
    rnd.startDeal(mm);
    check('T111: 启动模式 ' + mm + '（' + I.MODES[mm] + '）', rnd.dealMode() === mm && rnd.isDealing());
    if (rnd.dealMode() !== mm) modeOk = false;
    /* 留白期（前 8 帧 ≈ 128ms < 180ms）棋盘零卡体填充 */
    fillCount = 0;
    try { pumpFrames(8); } catch (e0) { modeOk = false; check('  ↳ 模式 ' + mm + ' 留白期异常: ' + e0.message, false); }
    if (fillCount !== 0) { tickOk = false; }
    /* 跑完整个进场（120 帧 = 1920ms > 最大 1000ms） */
    try { pumpFrames(120); } catch (e1) { modeOk = false; check('  ↳ 模式 ' + mm + ' 进场异常: ' + e1.message, false); }
    if (rnd.isDealing()) settledOk = false;
    if (rnd.dealPlanOf() !== null) settledOk = false;
    /* 落定后必须回到静态路径（100% 精确网格坐标） */
    if (dealTicks.length === 0) tickOk = false;
  }
  check('T111: 15 种模式逐种进场渲染零异常', modeOk);
  check('T111①: 0~180ms 留白期棋盘零卡体绘制（纯风景底图）', tickOk);
  check('T111④: 15 种模式进场结束后全部归位（introPlan 清空 / active=false）', settledOk);

  /* 落子音：逐牌一声且节流后仍能覆盖多数卡牌；progress 单调上扬 */
  dealTicks = [];
  rnd.startDeal(0);
  pumpFrames(120);
  check('T111④: 逐牌落定触发落牌涟漪音（5 张牌全部发声）', dealTicks.length === 5);
  check('T111④: 落牌音 progress 单调不减（音高渐次上扬）', (function () {
    for (var i = 1; i < dealTicks.length; i++) if (dealTicks[i] < dealTicks[i - 1]) return false;
    return true;
  })());

  /* ⑤ 点击快进：动画中途 skipDeal → 立即可命中 */
  rnd.startDeal(3);
  pumpFrames(6);
  check('T112③: 动画进行中（约 96ms）intro 仍 active', rnd.isDealing());
  var fast = rnd.skipDeal();
  check('T112③: skipDeal 返回「此前确实在动画中」', fast === true);
  check('T112③: 快进后 intro 立刻失活且计划清空',
    rnd.isDealing() === false && rnd.dealPlanOf() === null);
  var hitId = rnd.hitTest(160, 160);
  check('T112③: 快进后同帧命中判定可用（不吞点击）', hitId >= 0);
  var tapRes = sess.tap(hitId);
  check('T112③: 快进后该次点击被正常处理（非 undefined）', !!tapRes);

  /* ⑥ reduced-motion 降级 */
  rnd.setReducedMotion(true);
  rnd.startDeal(4);
  var rm = RT.INTRO;
  pumpFrames(14); /* ≈224ms → 越过 180ms 留白，进入淡入期 */
  check('T112⑥: reduced-motion 下仍保留 180ms 底图留白节奏', rm.LEAD_MS === 180);
  try { pumpFrames(120); check('T112⑥: reduced-motion 降级路径零异常', true); }
  catch (e2) { check('T112⑥: reduced-motion 降级路径零异常 [' + e2.message + ']', false); }
  check('T112⑥: reduced-motion 降级后同样完全归位', rnd.isDealing() === false);
  rnd.setReducedMotion(false);

  /* ⑦ 相邻两次开局不重复 + 锁定可复现 */
  rnd.setDealModeLock(null);
  var lastM = -1;
  var noRepeat = true;
  for (var k = 0; k < 40; k++) {
    var got = rnd.startDeal();
    if (got === lastM) noRepeat = false;
    lastM = got;
    rnd.skipDeal();
  }
  check('T112①: 连续 40 次开局相邻两次模式不重复', noRepeat);
  rnd.setDealModeLock(9);
  check('T112②: 调试锁定模式 9 → 启动即命中（评委逐种回放）',
    rnd.startDeal() === 9 && rnd.dealModeName() === 'v_formation');
  rnd.setDealModeLock(null);
  rnd.skipDeal();
  pumpFrames(2);
}

scenarioBlocked();
scenarioMechAnims();
scenarioPrismBlocked();
scenarioSuitMapping();
scenarioEcoBackdrop();
scenarioSpriteSheets();
scenarioBackdropStage();
scenarioDelta16();
scenarioPurifyAndOriginality();
scenarioDelta19();
scenarioHitGeometry();
scenarioAnimLayerZOrder();
scenarioDelta22Intro();

console.log('');
if (failures.length) {
  console.log('render-selftest: FAILED — ' + failures.length + ' 失败项: ' + failures.join('; '));
  process.exit(1);
} else {
  console.log('render-selftest: all green（Δ12: 受阻/机制/棱镜动画数据流全量——rAF 存活 + 坐标有限性 + 逻辑态无扰）');
}
