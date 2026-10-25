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
 *   ④ BGM 双轨——loop、0.26/0.20 目标音量、350ms 淡变（非硬切）、
 *      切换后反向轨归零并暂停（无叠音）、通关压低至 0.08
 *   ⑤ 事件时序——sfx_win 延迟 250ms 且同时压低 BGM；sfx_lose 瞬发
 *   ⑥ 合成轨参数——ber~ 260→680Hz/65ms + 120ms 落槽轻叩；
 *      deng~ 210→135Hz/150ms + 2 次阻尼泛音；落牌涟漪 380→760Hz、
 *      28ms、0.12 音量、>= 22ms 节流
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
  return { type: 'lowpass', frequency: new Param(1000), Q: new Param(1), connect: function () {} };
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
  return { buffer: null, connect: function () {}, start: function () {}, stop: function () {} };
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
ok(near(CFG.bgmVolume.lobby, 0.26) && near(CFG.bgmVolume.game, 0.20), 'BGM 目标音量 0.26 / 0.20');
ok(CFG.dealTickMinMs === 22, '落牌涟漪节流 = 22ms');

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
ok(near(bgmLobby.volume, 0.26, 0.02), 'bgm_lobby 淡变至 0.26', '实测 ' + bgmLobby.volume.toFixed(3));
ok(bgmLobby.volume > 0 && bgmLobby.volume < 0.26 + 0.001, '淡变为渐进而非硬切');

sm.playBgm('game');
await sleep(460);
ok(near(bgmGame.volume, 0.20, 0.02), 'bgm_game 淡入至 0.20', '实测 ' + bgmGame.volume.toFixed(3));
ok(bgmLobby.volume <= 0.002 && bgmLobby.paused === true, 'bgm_lobby 淡出归零并暂停（无叠音）');

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
ok(near(bgmLobby.volume, 0.26, 0.02), '返回大厅回切 bgm_lobby 0.26');
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
 * ⑥ 合成轨：ber~ / deng~ / 落牌涟漪
 * ========================================================= */
console.log('\n[6] Web Audio 合成轨参数（FR-050 §6~§8）');
function oscSince(mark) { return oscLog.slice(mark); }
function findFreq(rec, f) {
  return (rec.frequency._events || []).some(function (e) { return near(e.v, f, 0.6); });
}

var mark = oscLog.length;
sm.playTap();
var tapOscs = oscSince(mark);
var pop = tapOscs.filter(function (r) { return r.type === 'sine' && findFreq(r, 260); })[0];
ok(!!pop, 'ber~ 起音 260Hz');
if (pop) {
  var ramp = (pop.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 680, 0.6); })[0];
  ok(!!ramp, 'ber~ 指数上滑至 680Hz');
  ok(ramp && near(ramp.t - 0, 0.065, 0.002), 'ber~ 上滑时长 65ms', ramp ? '实测 ' + ramp.t : '');
}
var thunk = tapOscs.filter(function (r) { return findFreq(r, 180); })[0];
ok(!!thunk, '落槽软木轻叩 180Hz');
if (thunk) {
  var thunkStart = thunk.started;
  ok(near(thunkStart, 0.121, 0.004), '轻叩延迟 120ms（卡牌落入 #dock）', '实测 ' + thunkStart);
  var down = (thunk.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 90, 0.6); })[0];
  ok(!!down && near(down.t - thunkStart, 0.040, 0.004), '轻叩下沉至 90Hz / 40ms');
}

mark = oscLog.length;
sm.playBlock();
var blockOscs = oscSince(mark);
var deng = blockOscs.filter(function (r) { return r.type === 'triangle' && findFreq(r, 210); })[0];
ok(!!deng, 'deng~ 起音 210Hz（三角波）');
if (deng) {
  var sink = (deng.frequency._events || []).filter(function (e) { return e.k === 'exp' && near(e.v, 135, 0.6); })[0];
  ok(!!sink, 'deng~ 下沉至 135Hz');
  ok(sink && near(sink.t, 0.150, 0.002), 'deng~ 下沉时长 150ms', sink ? '实测 ' + sink.t : '');
}
var bounces = blockOscs.filter(function (r) { return r.type === 'sine' && r.started > 0; });
ok(bounces.length >= 2, 'deng~ 叠加 2 次弹性阻尼泛音', '实测 ' + bounces.length);

mark = oscLog.length;
var tickLow = sm.playDealTick(0);
var tickLowOsc = oscSince(mark).filter(function (r) { return r.type === 'sine'; })[0];
ok(tickLow === true && tickLowOsc && findFreq(tickLowOsc, 380), '落牌涟漪 progress=0 → 380Hz');
var throttled = sm.playDealTick(0.5);
ok(throttled === false, '同帧第二次触发被 22ms 节流拦截');
await sleep(30);
mark = oscLog.length;
var tickHigh = sm.playDealTick(1);
var tickHighOsc = oscSince(mark).filter(function (r) { return r.type === 'sine'; })[0];
ok(tickHigh === true && tickHighOsc && findFreq(tickHighOsc, 760), 'progress=1 → 760Hz（音高上扬）');
if (tickHighOsc) {
  var tickGain = (tickHighOsc.frequency._events || []).length > 0;
  ok(tickGain && near(tickHighOsc.stopped - tickHighOsc.started, 0.04, 0.005), '落牌涟漪时长 ~28ms 包络');
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
sm.setBgmMute(false);
await sleep(460);
ok(near(bgmLobby.volume, 0.26, 0.02), '解除静音后按目标轨道续播');

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

console.log('\n──────────── 结果 ────────────');
console.log('通过 ' + passes + ' / 失败 ' + fails);
if (fails > 0) process.exit(1);
process.exit(0);
}

main().catch(function (e) {
  console.error('audio-smoke 异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
