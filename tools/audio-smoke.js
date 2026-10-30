/* =========================================================
 * Slide & Triple — audio-smoke（Δ22 / FR-050 声学层自测）
 *
 * node tools/audio-smoke.js
 *
 * 覆盖（对应 SC-018 ①~④ 的可静态/半动态断言部分）:
 *   ① 资产核对——assets/audio/ 8 文件存在且文件名与代码映射逐字一致
 *   ② 加载方式红线——源码零 decodeAudioData / 零 fetch / 零
 *      createMediaElementSource（file:// 下必 CORS）
 *   ③ 外部资产轨——new Audio + preload="auto" + 每音效独立实例池
 *      （shatter pool=4 连续触发不掐头；win/lose 单实例）
 *   ④ BGM 双轨——loop、0.45/0.38 目标音量、350ms 淡变（非硬切）、
 *      切换后反向轨归零并暂停（无叠音）、通关压低至 0.08、
 *      Δ23/Bug1 常驻手势兜底（被策略暂停后任意点击自动恢复）
 *   ⑤ 事件时序——sfx_win 延迟 250ms 且同时压低 BGM；sfx_lose 瞬发
 *   ⑥ 合成轨参数（Δ26 白瓷/竹木麻将物理碰撞口径）——
 *      提牌：2400Hz/Q3.5 带通 12ms 脆响 + 520→580Hz/28ms 三角+正弦共鸣；
 *      落槽：115ms 处 380→290Hz/32ms 轻叩 + 1600Hz 8ms 微噪点；
 *      受阻：55ms 间隔双叩 310Hz/260Hz，单声严格 28ms；
 *      全程最大频差 ≤ 90Hz（无大幅度滑音）；
 *      落牌涟漪 320→180Hz、22ms 总时长、单振荡器零泛音、>= 45ms 节流
 *   ⑦ 降级——单文件 error 后 playSfx 不抛错且走合成兜底
 *
 * 零依赖（宪章 II）：全部为浏览器契约级桩，不引任何 npm 包。
 * ========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var fails = 0;
var passes = 0;

function ok(cond, label, extra) {
  if (cond) { passes++; console.log('  ✓ ' + label); }
  else { fails++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.004 : tol); }

/* =========================================================
 * 浏览器桩
 * ========================================================= */
globalThis.performance = { now: function () { return Date.now(); } };

var docHandlers = {};
var winHandlers = {};
globalThis.document = {
  hidden: false,
  addEventListener: function (t, fn) { (docHandlers[t] = docHandlers[t] || []).push(fn); }
};
globalThis.addEventListener = function (t, fn) { (winHandlers[t] = winHandlers[t] || []).push(fn); };
globalThis.removeEventListener = function (t, fn) {
  var arr = winHandlers[t] || [];
  var i = arr.indexOf(fn);
  if (i >= 0) arr.splice(i, 1);
};

/* ---- HTMLAudioElement 桩（记录 src / 播放次数 / 变调参数） ---- */
var audioInstances = [];
function FakeAudio() {
  this.preload = '';
  this.src = '';
  this.volume = 1;
  this.loop = false;
  this.paused = true;
  this.ended = false;
  this.currentTime = 0;
  this.playbackRate = 1;
  this.preservesPitch = true;
  this.mozPreservesPitch = true;
  this.webkitPreservesPitch = true;
  this._handlers = {};
  this._playCount = 0;
  this._errorFired = false;
  audioInstances.push(this);
}
FakeAudio.prototype.addEventListener = function (t, fn) {
  (this._handlers[t] = this._handlers[t] || []).push(fn);
};
FakeAudio.prototype.setAttribute = function () {};
FakeAudio.prototype.play = function () {
  this._playCount++;
  this.paused = false;
  this.ended = false;
  return Promise.resolve();
};
FakeAudio.prototype.pause = function () { this.paused = true; };
FakeAudio.prototype.emit = function (t) {
  var arr = this._handlers[t] || [];
  for (var i = 0; i < arr.length; i++) arr[i]();
};
globalThis.Audio = FakeAudio;

/* ---- AudioContext 桩（记录每个振荡器的频率事件时间线） ---- */
var oscLog = [];
var filterLog = [];   /* Δ26：记录滤波器（type / frequency / Q），用于脆响层断言 */
var noiseLog = [];    /* Δ26：记录噪声 BufferSource 的起止，用于瞬态时长断言 */
function Param(v) {
  this.value = v;
  this._events = [];
}
Param.prototype.setValueAtTime = function (v, t) { this.value = v; this._events.push({ k: 'set', v: v, t: t }); return this; };
Param.prototype.linearRampToValueAtTime = function (v, t) { this.value = v; this._events.push({ k: 'lin', v: v, t: t }); return this; };
Param.prototype.exponentialRampToValueAtTime = function (v, t) { this.value = v; this._events.push({ k: 'exp', v: v, t: t }); return this; };
Param.prototype.setTargetAtTime = function (v) { this.value = v; return this; };

function FakeCtx() {
  this.state = 'running';
  this.currentTime = 0;
  this.sampleRate = 44100;
  this.destination = {};
}
FakeCtx.prototype.createOscillator = function () {
  var rec = { type: 'sine', frequency: new Param(440), started: null, stopped: null };
  rec.connect = function () {};
  rec.start = function (t) { rec.started = t; };
  rec.stop = function (t) { rec.stopped = t; };
  oscLog.push(rec);
  return rec;
};
FakeCtx.prototype.createGain = function () {
  var g = { gain: new Param(1) };
  g.connect = function () {};
  return g;
};
FakeCtx.prototype.createBiquadFilter = function () {
  var f = { type: 'lowpass', frequency: new Param(1000), Q: new Param(1), connect: function () {} };
  filterLog.push(f);
  return f;
};
FakeCtx.prototype.createDynamicsCompressor = function () {
  return {
    threshold: new Param(-24), knee: new Param(30), ratio: new Param(12),
    attack: new Param(0.003), release: new Param(0.25), connect: function () {}
  };
};
FakeCtx.prototype.createBuffer = function (ch, len) {
  return { getChannelData: function () { return new Float32Array(len); } };
};
FakeCtx.prototype.createBufferSource = function () {
  var rec = {
    buffer: null, connect: function () {},
    start: function (t) { rec.started = t; }, stop: function (t) { rec.stopped = t; },
    started: null, stopped: null
  };
  noiseLog.push(rec);
  return rec;
};
FakeCtx.prototype.resume = function () { this.state = 'running'; return Promise.resolve(); };
FakeCtx.prototype.suspend = function () { this.state = 'suspended'; return Promise.resolve(); };
globalThis.AudioContext = FakeCtx;

/* =========================================================
 * 用例主体（async —— 需要真实定时器驱动 250ms 延迟与 350ms 淡变）
 * ========================================================= */
async function main() {

/* =========================================================
 * ① 资产核对
 * ========================================================= */
console.log('\n[1] assets/audio/ 8 文件核对（FR-050 §2 文件清单）');
require('../src/audio/SoundManager.js');
var CFG = globalThis.STM.AUDIO_CONFIG;
var KEY_FILES = {
  bgm_lobby: 'bgm_lobby.mp3',
  bgm_game: 'bgm_game.mp3',
  shatter: 'sfx_shatter.mp3',
  win: 'sfx_win.mp3',
  lose: 'sfx_lose.mp3',
  voice_good: 'sfx_voice_good.mp3',
  voice_great: 'sfx_voice_great.mp3',
  voice_unbelievable: 'sfx_voice_unbelievable.mp3'
};
var keys = Object.keys(KEY_FILES);
ok(keys.length === 8, '清单为 8 类资产');
for (var i = 0; i < keys.length; i++) {
  var k = keys[i];
  var p = path.join(ROOT, 'assets', 'audio', KEY_FILES[k]);
  var exists = fs.existsSync(p);
  var size = exists ? fs.statSync(p).size : 0;
  ok(exists && size > 1000, KEY_FILES[k] + ' 存在且非空 (' + size + ' B)');
  ok(CFG.files[k] === KEY_FILES[k], '代码路径映射逐字一致: ' + k + ' → ' + CFG.files[k]);
}
ok(CFG.dir === 'assets/audio/', '音频目录白名单 = assets/audio/');
ok(CFG.fadeMs === 350, 'BGM 交叉淡变 = 350ms');
ok(near(CFG.bgmVolume.lobby, 0.45) && near(CFG.bgmVolume.game, 0.38), 'BGM 目标音量 0.45 / 0.38');
ok(CFG.dealTickMinMs === 45, '落牌涟漪节流 = 45ms');

/* =========================================================
 * ② 加载方式红线（源码静态断言）
 * ========================================================= */
console.log('\n[2] 加载方式红线（file:// 零 CORS）');
var srcDir = path.join(ROOT, 'src');
function walk(dir, out) {
  var list = fs.readdirSync(dir);
  for (var i = 0; i < list.length; i++) {
    var f = path.join(dir, list[i]);
    var st = fs.statSync(f);
    if (st.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}
var allSrc = walk(srcDir, []).filter(function (f) { return /\.js$/.test(f); });
var joined = allSrc.map(function (f) { return fs.readFileSync(f, 'utf8'); }).join('\n');
ok(joined.indexOf('decodeAudioData(') < 0, 'src/ 零 decodeAudioData() 调用（SC-018 ① 静态断言）');
ok(!/\bfetch\s*\(/.test(joined), 'src/ 零 fetch() 调用');
ok(joined.indexOf('createMediaElementSource(') < 0, 'src/ 零 createMediaElementSource()（跨源媒体会静音）');
var smSrc = fs.readFileSync(path.join(srcDir, 'audio', 'SoundManager.js'), 'utf8');
ok(/new global\.Audio\(\)/.test(smSrc), '使用 new Audio() 创建外部音频实例');
ok(/preload\s*=\s*'auto'/.test(smSrc), 'preload = "auto" 预加载');
var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/src="src\/audio\/SoundManager\.js"/.test(html), 'index.html 装载 SoundManager（classic script）');

/* =========================================================
 * ③ 实例池与状态机
 * ========================================================= */
console.log('\n[3] 外部资产轨：实例池与状态机');
var sm = globalThis.STM.createSoundManager({});
var st0 = sm.getStatus();
var totalInstances = 0;
for (var s in st0) if (Object.prototype.hasOwnProperty.call(st0, s)) totalInstances += st0[s].instances;
ok(totalInstances === 14, '实例总数 = 14（BGM 2 + shatter 4 + win/lose 2 + 语音 6）', '实测 ' + totalInstances);
ok(st0.shatter.instances === 4, 'sfx_shatter 四声道池（连续三消不掐头）');
ok(st0.win.instances === 1 && st0.lose.instances === 1, 'win / lose 单实例（同一事件不叠成噪音）');
ok(st0.bgm_lobby.status === 'loading', '初始状态 = loading');
var allPreload = audioInstances.every(function (a) { return a.preload === 'auto'; });
ok(allPreload, '全部实例 preload = "auto"');
var allPath = audioInstances.every(function (a) { return /^assets\/audio\/[\w-]+\.mp3$/.test(a.src); });
ok(allPath, '全部实例 src 落在 assets/audio/ 白名单内');
var bgmEls = audioInstances.filter(function (a) { return /bgm_/.test(a.src); });
ok(bgmEls.length === 2 && bgmEls.every(function (a) { return a.loop === true; }), '两条 BGM 均 loop = true');

/* 就绪迁移 */
audioInstances.forEach(function (a) { a.emit('loadeddata'); });
var st1 = sm.getStatus();
var allReady = Object.keys(st1).every(function (k2) { return st1[k2].status === 'ready'; });
ok(allReady, '8 类资产全部迁移至 ready（SC-018 ①）');

/* =========================================================
 * ④ BGM 双轨：解锁 / 淡变 / 压低
 * ========================================================= */
console.log('\n[4] BGM 双轨：autoplay 解锁 / 350ms 淡变 / 通关压低');
var bgmLobby = audioInstances.filter(function (a) { return /bgm_lobby/.test(a.src); })[0];
var bgmGame = audioInstances.filter(function (a) { return /bgm_game/.test(a.src); })[0];

sm.playBgm('lobby');
ok(bgmLobby._playCount === 0, '首次交互前零发声（autoplay 合规）');

var fireUnlock = (winHandlers.pointerdown || [])[0];
ok(typeof fireUnlock === 'function', 'window 已绑定一次性 pointerdown 解锁');
if (fireUnlock) fireUnlock();
ok(bgmLobby._playCount === 1, '首次交互后 bgm_lobby 起播');
ok((winHandlers.pointerdown || []).length === 0, '解锁监听为一次性（已自我移除）');

await sleep(460);
ok(near(bgmLobby.volume, 0.45, 0.02), 'bgm_lobby 淡变至 0.45', '实测 ' + bgmLobby.volume.toFixed(3));
ok(bgmLobby.volume > 0 && bgmLobby.volume < 0.45 + 0.001, '淡变为渐进而非硬切');

sm.playBgm('game');
await sleep(460);
ok(near(bgmGame.volume, 0.38, 0.02), 'bgm_game 淡入至 0.38', '实测 ' + bgmGame.volume.toFixed(3));
ok(bgmLobby.volume <= 0.002 && bgmLobby.paused === true, 'bgm_lobby 淡出归零并暂停（无叠音）');

/* Δ23/Bug1：常驻手势兜底 —— 目标轨被策略性暂停后，任意一次点击都必须拉回播放 */
var kickFire = (docHandlers.pointerdown || [])[0];
ok(typeof kickFire === 'function', 'document 已绑定常驻 pointerdown 兜底（非一次性）');
ok((docHandlers.pointerdown || []).length === 1, '常驻兜底只绑一次（不随点击累加）');
var kickBefore = bgmGame._playCount;
bgmGame.pause();                       /* 模拟浏览器/系统策略性暂停 */
if (kickFire) kickFire();
ok(bgmGame.paused === false && bgmGame._playCount === kickBefore + 1,
  '暂停后任意手势 → bgm_game 立即恢复播放', 'playCount ' + kickBefore + '→' + bgmGame._playCount);
var kickAgain = bgmGame._playCount;
if (kickFire) kickFire();
ok(bgmGame._playCount === kickAgain, '正在播放时手势兜底为幂等空操作（不重播）');

/* 通关：延迟 250ms + 压低 BGM */
var winEl = audioInstances.filter(function (a) { return /sfx_win/.test(a.src); })[0];
sm.playSfx('win', { delay: 250, duck: true });
ok(winEl._playCount === 0, 'sfx_win 未立即播放（延迟 250ms）');
await sleep(120);
ok(winEl._playCount === 0, '120ms 时仍未播放（时序正确）');
await sleep(220);
ok(winEl._playCount === 1, '250ms 后 sfx_win 触发');
await sleep(300);
ok(near(bgmGame.volume, 0.08, 0.02), '触发同时 bgm_game 压低至 0.08', '实测 ' + bgmGame.volume.toFixed(3));

/* 失败音效瞬发 */
var loseEl = audioInstances.filter(function (a) { return /sfx_lose/.test(a.src); })[0];
sm.playSfx('lose');
ok(loseEl._playCount === 1, 'sfx_lose 瞬发（槽满 7 格弹窗瞬间）');

/* 返回大厅 → 回切且解除压低 */
sm.playBgm('lobby');
await sleep(460);
ok(near(bgmLobby.volume, 0.45, 0.02), '返回大厅回切 bgm_lobby 0.45');
ok(bgmGame.paused === true, 'bgm_game 已暂停');

/* =========================================================
 * ⑤ 碎裂音效：变调 + 多声道
 * ========================================================= */
console.log('\n[5] sfx_shatter：变调与多声道并发');
var shatterEls = audioInstances.filter(function (a) { return /sfx_shatter/.test(a.src); });
sm.playSfx('shatter', { rate: 1.18 });
var p1 = shatterEls.filter(function (a) { return a._playCount === 1; })[0];
ok(!!p1, '第 1 次碎裂触发一个实例');
ok(p1 && near(p1.playbackRate, 1.18), 'playbackRate 按档位生效 (1.18)');
ok(p1 && p1.preservesPitch === false && p1.mozPreservesPitch === false && p1.webkitPreservesPitch === false,
  'preservesPitch = false（升调不变速失真）');
sm.playSfx('shatter', { rate: 1.25 });
var busy = shatterEls.filter(function (a) { return a._playCount >= 1; }).length;
ok(busy === 2, '第 2 次碎裂取不同实例（不掐头）', '实测活跃 ' + busy);
sm.playSfx('shatter', { rate: 1.0 });
sm.playSfx('shatter', { rate: 1.06 });
sm.playSfx('shatter', { rate: 1.12 });
var totalPlayed = shatterEls.reduce(function (acc, a) { return acc + a._playCount; }, 0);
ok(totalPlayed === 5 && shatterEls.length === 4, '5 连击跨 4 声道轮转（可叠放）');

/* =========================================================
 * ⑥ 合成轨：提牌+落槽 / 双叩 / 落牌涟漪
 * ========================================================= */
console.log('\n[6] Web Audio 合成轨参数（FR-050 §6~§8 / Δ26 白瓷口径）');
function oscSince(mark) { return oscLog.slice(mark); }
function findFreq(rec, f) {
  return (rec.frequency._events || []).some(function (e) { return near(e.v, f, 0.6); });
}

var mark = oscLog.length;
var fMark = filterLog.length;
var nMark = noiseLog.length;
sm.playTap();
var tapOscs = oscSince(mark);
var tapFilters = filterLog.slice(fMark);
var tapNoises = noiseLog.slice(nMark);

/* ── 第一声 0ms：提牌（脆响层 + 瓷木共鸣层）── */
var bodyTri = tapOscs.filter(function (r) { return r.type === 'triangle' && findFreq(r, 520); })[0];
var bodySin = tapOscs.filter(function (r) { return r.type === 'sine' && findFreq(r, 520); })[0];
ok(!!bodyTri && !!bodySin, '提牌共鸣层 = 三角波 + 正弦波（520Hz 起音）');
if (bodyTri && bodySin) {
  var triUp = (bodyTri.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 580, 0.6); })[0];
  var sinUp = (bodySin.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 580, 0.6); })[0];
  ok(!!triUp && !!sinUp, '双振荡器同步微升至 580Hz（仅 +60Hz 定音）');
  ok(triUp && near(triUp.t - bodyTri.started, 0.028, 0.002),
    '微升时长 28ms', triUp ? '实测 ' + (triUp.t - bodyTri.started).toFixed(4) : '');
  var bodyLen = bodyTri.stopped - bodyTri.started;
  ok(near(bodyLen, 0.048, 0.002) && bodyLen <= 0.05,
    '共鸣总时长 ≤ 48ms（45ms 包络 + 3ms 余量，无延音）', '实测 ' + bodyLen.toFixed(4));
}
var clickFilter = tapFilters.filter(function (f) { return f.type === 'bandpass' && near(f.frequency.value, 2400, 0.6); })[0];
ok(!!clickFilter, '脆响层带通中心 2400Hz');
ok(clickFilter && near(clickFilter.Q.value, 3.5, 0.01), '脆响层 Q = 3.5（有音高的「咔」）');
var clickNoise = tapNoises[0];
ok(!!clickNoise && near(clickNoise.stopped - clickNoise.started, 0.014, 0.001),
  '脆响瞬态 12ms（+2ms 截止余量）', clickNoise ? '实测 ' + (clickNoise.stopped - clickNoise.started).toFixed(4) : '');

/* ── 第二声 115ms：落槽 ── */
var dockSin = tapOscs.filter(function (r) { return r.type === 'sine' && findFreq(r, 380); })[0];
var dockTri = tapOscs.filter(function (r) { return r.type === 'triangle' && findFreq(r, 380); })[0];
ok(!!dockSin && !!dockTri, '落槽轻叩 = 正弦 + 三角（380Hz 起音）');
if (dockSin) {
  ok(near(dockSin.started - bodyTri.started, 0.115, 0.004),
    '落槽延迟 115ms（卡牌飞入 #dock）', '实测 ' + (dockSin.started - bodyTri.started).toFixed(4));
  var dockDown = (dockSin.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 290, 0.6); })[0];
  ok(!!dockDown, '落槽下沉至 290Hz');
  ok(dockDown && near(dockDown.t - dockSin.started, 0.032, 0.002),
    '落槽时长 32ms', dockDown ? '实测 ' + (dockDown.t - dockSin.started).toFixed(4) : '');
}
var dockFilter = tapFilters.filter(function (f) { return f.type === 'bandpass' && near(f.frequency.value, 1600, 0.6); })[0];
ok(!!dockFilter, '落槽微噪点带通 1600Hz');
ok(tapNoises.length === 2 && tapNoises[1] && near(tapNoises[1].stopped - tapNoises[1].started, 0.010, 0.001),
  '落槽噪声 8ms（+2ms 截止余量）');

/* ── 全程零大幅度滑音（Δ26 核心回归：旧版 260→680Hz 已废除）── */
var maxSweep = 0;
tapOscs.forEach(function (r) {
  var evs = r.frequency._events || [];
  var base = evs.length ? evs[0].v : 0;
  evs.forEach(function (e) { maxSweep = Math.max(maxSweep, Math.abs(e.v - base)); });
});
ok(maxSweep <= 90.5, '全程无大幅度滑音（最大频差 ≤ 90Hz）', '实测 ' + maxSweep.toFixed(1) + 'Hz');

/* ── 受阻：双叩「哒-哒」── */
mark = oscLog.length;
fMark = filterLog.length;
sm.playBlock();
var blockOscs = oscSince(mark);
var blockFilters = filterLog.slice(fMark);
var knock1 = blockOscs.filter(function (r) { return r.type === 'triangle' && findFreq(r, 310); })[0];
var knock2 = blockOscs.filter(function (r) { return r.type === 'triangle' && findFreq(r, 260); })[0];
ok(!!knock1 && !!knock2, '双叩 = 310Hz + 260Hz 两声三角波硬牌面微碰');
ok(blockOscs.length === 2, '仅 2 个振荡器（旧版 LFO + 2 次阻尼泛音已彻底删除）', '实测 ' + blockOscs.length);
ok(blockOscs.every(function (r) { return r.type === 'triangle'; }), '零正弦泛音（弹簧回弹音已废除）');
if (knock1 && knock2) {
  ok(near(knock2.started - knock1.started, 0.055, 0.002),
    '两声间隔 55ms', '实测 ' + (knock2.started - knock1.started).toFixed(4));
  var k1Down = (knock1.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 263.5, 0.6); })[0];
  ok(!!k1Down, '第 1 声 310 → 263.5Hz（×0.85 微降）');
  ok(k1Down && near(k1Down.t - knock1.started, 0.025, 0.002),
    '微降时长 25ms', k1Down ? '实测 ' + (k1Down.t - knock1.started).toFixed(4) : '');
  var len1 = knock1.stopped - knock1.started;
  var len2 = knock2.stopped - knock2.started;
  ok(near(len1, 0.028, 0.0005) && near(len2, 0.028, 0.0005),
    '单声严格 28ms（零拖尾）', '实测 ' + len1.toFixed(4) + ' / ' + len2.toFixed(4));
}
var knockBpf = blockFilters.filter(function (f) { return f.type === 'bandpass' && near(f.frequency.value, 1400, 0.6); });
ok(knockBpf.length === 2, '每声各叠 8ms / 1400Hz 带通瞬态噪声', '实测 ' + knockBpf.length + ' 个');

mark = oscLog.length;
var tickLow = sm.playDealTick(0);
var tickLowOscs = oscSince(mark);
var tickLowOsc = tickLowOscs.filter(function (r) { return r.type === 'sine'; })[0];
ok(tickLow === true && tickLowOsc && findFreq(tickLowOsc, 320), '落牌涟漪 progress=0 → 320Hz 起音');
ok(tickLowOscs.length === 1, '单次只建 1 个振荡器（Δ23 去掉了 2.4× 三角泛音）', '实测 ' + tickLowOscs.length);
if (tickLowOsc) {
  var tickSink = (tickLowOsc.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 180, 0.6); })[0];
  ok(!!tickSink, '落牌涟漪 320Hz → 180Hz 极速下沉');
  var tickLen = tickLowOsc.stopped - tickLowOsc.started;
  ok(near(tickLen, 0.022, 0.002) && tickLen <= 0.0225,
    '单次发声总时长 22ms（严格 ≤ 22ms，零拖尾）', '实测 ' + tickLen.toFixed(4));
  ok(tickLowOscs.every(function (r) { return r.type !== 'triangle'; }),
    '零三角/锯齿泛音（旧版「塑料感」来源已移除）');
}
var throttled = sm.playDealTick(0.5);
ok(throttled === false, '同帧第二次触发被 45ms 节流拦截');
await sleep(60);
mark = oscLog.length;
var tickHigh = sm.playDealTick(1);
var tickHighOsc = oscSince(mark).filter(function (r) { return r.type === 'sine'; })[0];
ok(tickHigh === true && tickHighOsc && findFreq(tickHighOsc, 250), 'progress=1 → 250Hz（越靠后越低沉）');
if (tickHighOsc) {
  var hiSink = (tickHighOsc.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 140, 0.6); })[0];
  ok(!!hiSink, 'progress=1 下沉至 140Hz');
}

/* =========================================================
 * ⑦ 静音与降级
 * ========================================================= */
console.log('\n[7] 静音联动与单文件降级');
sm.setSfxMute(true);
var before = audioInstances.filter(function (a) { return /sfx_lose/.test(a.src); })[0]._playCount;
sm.playSfx('lose');
ok(audioInstances.filter(function (a) { return /sfx_lose/.test(a.src); })[0]._playCount === before,
  'SFX 静音时外部轨不发声');
var oscBefore = oscLog.length;
sm.playTap();
ok(oscLog.length === oscBefore, 'SFX 静音时合成轨同样不发声（无漏网路径）');
sm.setSfxMute(false);

sm.setBgmMute(true);
await sleep(420);
ok(bgmLobby.volume <= 0.002, 'BGM 静音时外部轨淡出归零');
ok(sm.isBgmPlaying() === false, 'BGM 静音后无活跃 BGM');
/* Δ23/Bug1：静音态下手势兜底 MUST NOT 发声（否则「关了还响」） */
var muteKickBefore = bgmLobby._playCount;
if (kickFire) kickFire();
ok(bgmLobby._playCount === muteKickBefore, 'BGM 静音时手势兜底不发声');
sm.setBgmMute(false);
await sleep(460);
ok(near(bgmLobby.volume, 0.45, 0.02), '解除静音后按目标轨道续播');

/* 单文件失败 → 静默降级 + 合成兜底（不抛错） */
var sm2 = globalThis.STM.createSoundManager({});
var shatterFailed = audioInstances.filter(function (a) { return /sfx_shatter/.test(a.src); });
shatterFailed.slice(-4).forEach(function (a) { a.emit('error'); });
var threw = false;
var mark2 = oscLog.length;
try { sm2.playSfx('shatter', {}); } catch (e) { threw = true; }
ok(threw === false, '单文件 error 后 playSfx 不抛错');
ok(oscLog.length > mark2, '失败音效回退 Web Audio 合成音（有声音，非静默失败）');
var stFail = sm2.getStatus();
ok(stFail.shatter.status === 'failed', '失败文件状态迁移为 failed');

/* =========================================================
 * ⑧ FR-049 / SC-024：点击链路唯一音源
 * ========================================================= */
console.log('\n[8] FR-049 点击链路唯一音源（机制音不得抢占交互音）');
var SFX_HEAD = smSrc.indexOf('var SFX = {');
var SFX_TAIL = smSrc.indexOf('function play(name');
var SFX_BLOCK = (SFX_HEAD >= 0 && SFX_TAIL > SFX_HEAD) ? smSrc.slice(SFX_HEAD, SFX_TAIL) : '';
ok(SFX_BLOCK.length > 0, '定位 SFX 音色表代码段');
ok(!/tone\(\s*'square'/.test(SFX_BLOCK), 'SFX 表零 square 波形（方波一次性交互音）');
ok(!/tone\(\s*'sawtooth'/.test(SFX_BLOCK), 'SFX 表零 sawtooth 波形');
/* 保留的 4 项必须是事件级（match / victory / defeat / iceBreak） */
var RETIRED_SFX = ['click', 'gear', 'unlock', 'prism', 'item', 'botTick', 'tick', 'undo'];
ok(RETIRED_SFX.every(function (n) { return SFX_BLOCK.indexOf(n + ':') < 0; }),
  '八个退役音色键全部下线（' + RETIRED_SFX.join(' / ') + '）');
ok(['match:', 'victory:', 'defeat:', 'iceBreak:'].every(function (n) { return SFX_BLOCK.indexOf(n) >= 0; }),
  '保留 match / victory / defeat / iceBreak 四项');

var mainSrcA = fs.readFileSync(path.join(srcDir, 'main.js'), 'utf8');
ok(!/sound\.play\(\s*['"](gear|unlock|prism|click|item|botTick|tick|undo)['"]/.test(mainSrcA),
  'main.js 零退役音色调用点（机制音 / 电子音零残留）');
ok(/if \(e\.e === 'gear'\) \{ renderer\.handleEvent\(e\);/.test(mainSrcA) &&
  !/if \(e\.e === 'gear'\) \{ sound\.play/.test(mainSrcA),
  'gear（齿轮联动）机制事件零音源——视觉走 drawAnim 角标脉冲');
ok(/if \(e\.e === 'unlock'\) \{ renderer\.handleEvent\(e\);/.test(mainSrcA) &&
  !/if \(e\.e === 'unlock'\) \{ sound\.play/.test(mainSrcA),
  'unlock（锁链断开）机制事件零音源');
ok(/if \(e\.e === 'prism'\) \{ renderer\.handleEvent\(e\);/.test(mainSrcA) &&
  !/if \(e\.e === 'prism'\) \{ sound\.play/.test(mainSrcA),
  'prism（棱镜折射）机制事件零音源');
ok(/if \(e\.e === 'ice'\) \{ sound\.play\('iceBreak'\)/.test(mainSrcA),
  'ice（破冰）保留 iceBreak——非点击派生、低域正弦无方波');

/* 动态：一次合法点击（flyout）派生的音频节点组数恒 = 1 */
sm.setSfxMute(false);
var chainMark = oscLog.length;
sm.play('flyout');
var tapOscs2 = oscLog.slice(chainMark);
ok(tapOscs2.length === 4, '一次合法点击 = 1 个音源（tap 的 4 个振荡器）', '实测 ' + tapOscs2.length);
ok(tapOscs2.every(function (r) { return r.type === 'sine' || r.type === 'triangle'; }),
  '点击链路振荡器只有正弦 / 三角（零方波、零锯齿）');
/* 反向：即便机制事件被误派，退役音色也 MUST 完全静默（零新节点） */
RETIRED_SFX.forEach(function (n) {
  var bOsc = oscLog.length, bFil = filterLog.length, bNoise = noiseLog.length;
  sm.play(n);
  ok(oscLog.length === bOsc && filterLog.length === bFil && noiseLog.length === bNoise,
    '退役音色 ' + n + ' 完全静默（零新音频节点）');
});
/* 点击链路「同帧 + 机制事件」总节点组数仍 = 1（gear 静默 → 不叠加第二音源） */
var chainMark2 = oscLog.length;
sm.play('flyout');
sm.play('gear');
ok(oscLog.length - chainMark2 === 4,
  '点击 + 齿轮联动的节点组数仍 = 1（gear 不再叠加第二音源）',
  '实测 ' + (oscLog.length - chainMark2));
var blockMark = oscLog.length;
sm.play('blocked');
ok(oscLog.length - blockMark === 2, '受阻反弹 = knock 的 2 个振荡器（双叩）',
  '实测 ' + (oscLog.length - blockMark));

console.log('\n──────────── 结果 ────────────');
console.log('通过 ' + passes + ' / 失败 ' + fails);
if (fails > 0) process.exit(1);
process.exit(0);
}

main().catch(function (e) {
  console.error('audio-smoke 异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
