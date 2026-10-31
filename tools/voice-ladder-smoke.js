/* =========================================================
 * Slide & Triple — voice-ladder-smoke（Δ31 / FR-055 连击语音阶梯门禁）
 *
 * node tools/voice-ladder-smoke.js
 *
 * 覆盖:
 *   ① 静态契约——晋升间隔 800ms / 等待上限 2s / 旧 3.5s 硬冷却已彻底移除 /
 *      阶梯映射 2→good 3→great 4→excellent 5+→unbelievable / 飘字文案仍逐字锁定
 *   ② 阶梯映射——真实 GameState 连打 8 次三消，voice 序列一档一词、同档不复读
 *   ③ 1.2s 节奏——Good → Great → Excellent → Unbelievable 逐档播报，零吞音
 *   ④ 晋升必响——上一句仍在播时进入等待槽，播完立即起播（绝不丢弃）
 *   ⑤ 极快连击——升档顶替，只保留最高档（不排成一串、不叠音）
 *   ⑥ 同档防复读——最高档播完后再请求同档 → 丢弃
 *   ⑦ 5 秒窗口复位——连击归零后阶梯可再次完整触发
 *   ⑧ 隔离——排队 / 等待期间碎裂·点击·通关音全部正常；静音零漏音
 *
 * 零依赖（宪章 II）：浏览器契约级桩，不引任何 npm 包。
 * 时钟为可控桩（CLOCK），阶梯时序断言不依赖真实等待时长。
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

/* =========================================================
 * 浏览器桩（可控时钟）
 * ========================================================= */
var CLOCK = 0;
globalThis.performance = { now: function () { return CLOCK; } };

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
  this._handlers = {};
  this._playCount = 0;
  this._startedAt = -1;
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
  this._startedAt = CLOCK;
  return Promise.resolve();
};
FakeAudio.prototype.pause = function () { this.paused = true; };
FakeAudio.prototype.emit = function (t) {
  var arr = this._handlers[t] || [];
  for (var i = 0; i < arr.length; i++) arr[i]();
};
globalThis.Audio = FakeAudio;

function Param(v) { this.value = v; }
Param.prototype.setValueAtTime = function (v) { this.value = v; return this; };
Param.prototype.linearRampToValueAtTime = function (v) { this.value = v; return this; };
Param.prototype.exponentialRampToValueAtTime = function (v) { this.value = v; return this; };
Param.prototype.setTargetAtTime = function (v) { this.value = v; return this; };
function FakeCtx() {
  this.state = 'running';
  this.currentTime = 0;
  this.sampleRate = 44100;
  this.destination = {};
}
FakeCtx.prototype.createOscillator = function () {
  return { type: 'sine', frequency: new Param(440), connect: function () {}, start: function () {}, stop: function () {} };
};
FakeCtx.prototype.createGain = function () { return { gain: new Param(1), connect: function () {} }; };
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
 * 用例主体
 * ========================================================= */
async function main() {

/* =========================================================
 * ① 静态契约
 * ========================================================= */
console.log('\n[1] 静态契约（FR-055 阶梯参数与旧冷却退场）');
require('../src/audio/SoundManager.js');
var CFG = globalThis.STM.AUDIO_CONFIG;
ok(CFG.voiceAscentGapMs === 800, '晋升最多等待 800ms（不是最小间隔）', '实测 ' + CFG.voiceAscentGapMs);
ok(CFG.voiceWaitMaxMs === 2000, '晋升排队硬上限 2000ms（超时强发）', '实测 ' + CFG.voiceWaitMaxMs);
ok(CFG.voiceLeadMs === 120, '起播延迟 120ms（错开碎裂瞬态）', '实测 ' + CFG.voiceLeadMs);
ok(CFG.voiceCooldownMs === undefined, '旧 3.5s 全局硬冷却已从配置中移除');

var smSrc = fs.readFileSync(path.join(ROOT, 'src', 'audio', 'SoundManager.js'), 'utf8');
ok(smSrc.indexOf('VOICE_COOLDOWN_MS') < 0, 'SoundManager 零 VOICE_COOLDOWN_MS 残留（含注释）');
ok(smSrc.indexOf('3500') < 0, 'SoundManager 零 3500ms 常量残留');
ok(/function tickVoiceQueue\(entry, delay\)/.test(smSrc), '存在等待槽轮询 tickVoiceQueue()');
ok(/function dropVoiceQueue\(reason\)/.test(smSrc), '存在等待槽清空 dropVoiceQueue()');
ok(/var VOICE_ASCENT_GAP_MS = 800;/.test(smSrc), '晋升间隔常量 = 800ms');
ok(/excellent: 'voice_great'/.test(smSrc), 'excellent 暂用 great 资产（升降调变体）');
ok(/var VOICE_RATE_OF = \{ excellent: 1\.14 \};/.test(smSrc), 'excellent 变调 1.14（与第 3 档听感区分）');

var gsSrc = fs.readFileSync(path.join(ROOT, 'src', 'core', 'GameState.js'), 'utf8');
ok(/if \(tier === 2\) return 'good';/.test(gsSrc), '阶梯映射 Combo 2 → good');
ok(/if \(tier === 3\) return 'great';/.test(gsSrc), '阶梯映射 Combo 3 → great');
ok(/if \(tier === 4\) return 'excellent';/.test(gsSrc), '阶梯映射 Combo 4 → excellent');
ok(/if \(tier >= 5\) return 'unbelievable';/.test(gsSrc), '阶梯映射 Combo 5+ → unbelievable');
ok(/if \(tier === 2\) return 'Combo ×2';/.test(gsSrc) && /return 'Good! ×3'/.test(gsSrc) &&
  /return 'Great! ×4'/.test(gsSrc) && /return 'Unbelievable! ×'/.test(gsSrc),
  '飘字文案仍逐字锁定（T109 ④ 未改写）');

var mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
ok(/sound\.playVoice\(e\.voice, \{ tier: e\.tier \}\)/.test(mainSrc), 'main.js 下发档位供排队排序');

/* =========================================================
 * ② 阶梯映射（真实 GameState）
 * ========================================================= */
console.log('\n[2] 阶梯映射：连续 8 次三消一档一词');
CLOCK = 10000;
var RE = require('../src/core/RulesEngine.js');
/* MUST NOT 重建 STM —— SoundManager 已在 [1] 挂到同一对象上 */
var STM = globalThis.STM = globalThis.STM || {};
STM.RulesEngine = RE;
require('../src/core/GameState.js');
var LEVELS = require('../src/data/levels.js');

function biggestLevel() {
  var best = LEVELS[0];
  for (var i = 0; i < LEVELS.length; i++) {
    if ((LEVELS[i].tiles || []).length > (best.tiles || []).length) best = LEVELS[i];
  }
  return best;
}

var MATCHES = 0;
function runMatches(sess, want) {
  var base = MATCHES;
  var taps = 0;
  while (MATCHES - base < want && taps < 400) {
    var r = sess.autoPlayStep();
    taps++;
    if (!r || r.type !== 'tap' || !r.result) break;
  }
  return taps;
}

var combos = [];
var scores = [];
var sess = STM.GameState.createSession(biggestLevel(), {
  onEvent: function (e) {
    if (e.e === 'match') { MATCHES++; scores.push(sess.state().score); }
    if (e.e === 'comboChanged') {
      combos.push({ count: e.count, tier: e.tier, voice: e.voice, rate: e.playbackRate, text: e.floatText });
    }
  }
});
var usedTaps = runMatches(sess, 8);
ok(MATCHES >= 8, '连续快速模拟 ' + usedTaps + ' 次点击触发 ' + MATCHES + ' 次三消');

var counts = combos.map(function (c) { return c.count; });
ok(counts.every(function (v, i) { return v === i + 1; }), '连击计数正常累积 1..' + counts.length,
  counts.join(','));
var voices = combos.map(function (c) { return c.voice; });
ok(voices[0] === null, 'Combo 1 无语音');
ok(voices[1] === 'good', 'Combo 2 → good', String(voices[1]));
ok(voices[2] === 'great', 'Combo 3 → great', String(voices[2]));
ok(voices[3] === 'excellent', 'Combo 4 → excellent', String(voices[3]));
ok(voices[4] === 'unbelievable', 'Combo 5 → unbelievable', String(voices[4]));
var topVoices = combos.filter(function (c) { return c.tier >= 5; }).map(function (c) { return c.voice; });
ok(topVoices.length >= 4 && topVoices.slice(1).every(function (v) { return v === null; }),
  'Combo 6~8 不再复读 Unbelievable', topVoices.join(','));
ok(combos[5] && combos[5].text === 'Unbelievable! ×6', '最高档飘字仍逐次累加（×6）',
  combos[5] ? combos[5].text : 'null');
ok(scores.every(function (v, i) { return i === 0 || v >= scores[i - 1]; }) && scores[scores.length - 1] > 0,
  '积分结算不受影响（单调不减）');

/* =========================================================
 * ③ 1.2s 节奏：逐档播报，零吞音
 * ========================================================= */
console.log('\n[3] 1.2 秒节奏连打 5 次：Good → Great → Excellent → Unbelievable');
var sm = STM.createSoundManager({});
audioInstances.forEach(function (a) { a.emit('loadeddata'); });
ok(Object.keys(sm.getStatus()).every(function (k) { return sm.getStatus()[k].status === 'ready'; }),
  '8 类资产全部 ready');

/* 每次重新取——后续每个 createSoundManager 都会新建一批实例 */
function allVoiceEls() {
  return audioInstances.filter(function (a) { return /sfx_voice_/.test(a.src); });
}
function playingVoiceCount() {
  return allVoiceEls().filter(function (a) { return !a.paused && !a.ended; }).length;
}
function endAllVoices() {
  allVoiceEls().forEach(function (a) { a.paused = true; a.ended = true; });
}
function playedSeq() {
  return allVoiceEls()
    .filter(function (a) { return a._playCount > 0; })
    .map(function (a) { return { src: a.src.replace(/^.*sfx_voice_/, '').replace(/\.mp3$/, ''), at: a._startedAt, rate: a.playbackRate }; })
    .sort(function (x, y) { return x.at - y.at; });
}

CLOCK = 20000;
var LADDER = [
  { v: 'good', tier: 2, expectRate: 1 },
  { v: 'great', tier: 3, expectRate: 1 },
  { v: 'excellent', tier: 4, expectRate: 1.14 },
  { v: 'unbelievable', tier: 5, expectRate: 1 }
];
var acceptedAll = true;
for (var li = 0; li < LADDER.length; li++) {
  endAllVoices();                       /* 1.2s 间隔 > 单句时长（0.67~1.06s）→ 上一句已播完 */
  var step = LADDER[li];
  if (!sm.playVoice(step.v, { tier: step.tier })) acceptedAll = false;
  await sleep(160);                     /* 让 120ms 起播延迟走完 */
  CLOCK += 1200;
}
ok(acceptedAll, '四档请求全部被受理（无任何一档被冷却丢弃）');
var vs3 = sm.getVoiceState();
ok(vs3.stats.played === 4, '四档各播报 1 次，共 4 次', '实测 ' + vs3.stats.played);
ok(vs3.stats.skippedDup === 0, '零同档丢弃', '实测 ' + vs3.stats.skippedDup);

var seq = playedSeq();
ok(seq.length === 4, '起播实例数 = 4（不叠放）', '实测 ' + seq.length);
ok(seq[0].src === 'good' && seq[1].src === 'great' && seq[2].src === 'great' && seq[3].src === 'unbelievable',
  '起播顺序 good → great → (excellent 复用 great) → unbelievable',
  seq.map(function (s) { return s.src; }).join(' → '));
ok(seq[2].rate === 1.14, 'excellent 档以 1.14 变调起播（与第 3 档可区分）', '实测 ' + seq[2].rate);
ok(seq[1].rate === 1, 'great 档保持原调（未被变调污染）', '实测 ' + seq[1].rate);

/* =========================================================
 * ④ 晋升必响：上一句仍在播 → 等待，播完立即起播
 * ========================================================= */
console.log('\n[4] 晋升必响：上一句未播完时排队等待，播完立即起播');
var sm2 = STM.createSoundManager({});
audioInstances.forEach(function (a) { a.emit('loadeddata'); });
CLOCK = 40000;
var v4 = allVoiceEls().filter(function (a) { return a._playCount > 0; });
v4.forEach(function (a) { a.paused = true; a.ended = true; });

ok(sm2.playVoice('good', { tier: 2 }) === true, 'Combo 2 good 受理');
await sleep(160);
var playedAfterGood = sm2.getVoiceState().stats.played;
ok(playedAfterGood === 1, 'good 已起播', '实测 ' + playedAfterGood);

CLOCK += 300;                            /* 仅过 300ms，good 仍在播（未标记结束）*/
ok(sm2.playVoice('great', { tier: 3 }) === true, 'Combo 3 great 受理（不因上一句在播而丢弃）');
await sleep(60);
ok(sm2.getVoiceState().stats.played === 1, 'great 未抢播（等待上一句播完）');
ok(sm2.getVoiceState().queued && sm2.getVoiceState().queued.name === 'great', 'great 进入等待槽',
  JSON.stringify(sm2.getVoiceState().queued));

endAllVoices();                          /* 上一句播完 */
CLOCK += 120;                            /* 仍 < 800ms，靠「已播完」放行 */
await sleep(240);                        /* 覆盖 120ms 起播延迟 + 50ms 轮询 */
ok(sm2.getVoiceState().stats.played === 2, '上一句播完后 great 立即起播（零吞音）',
  '实测 ' + sm2.getVoiceState().stats.played);
ok(sm2.getVoiceState().queued === null, '等待槽已清空');

/* =========================================================
 * ⑤ 极快连击：升档顶替，只保留最高档
 * ========================================================= */
console.log('\n[5] 极快连击（<0.8s/次）：升档顶替，不排成一串');
var sm3 = STM.createSoundManager({});
audioInstances.forEach(function (a) { a.emit('loadeddata'); });
CLOCK = 60000;
endAllVoices();
var played0 = sm3.getVoiceState().stats.played;

sm3.playVoice('good', { tier: 2 });
await sleep(160);
ok(sm3.getVoiceState().stats.played === played0 + 1, 'good 起播（上一句已结束，不等待）');
CLOCK += 100;
sm3.playVoice('great', { tier: 3 });     /* 上一句仍在播 → 排队 */
CLOCK += 100;
sm3.playVoice('excellent', { tier: 4 }); /* 顶替 great */
CLOCK += 100;
sm3.playVoice('unbelievable', { tier: 5 }); /* 顶替 excellent */
var vs5 = sm3.getVoiceState();
ok(vs5.stats.upgraded === 2, '两次升档顶替（great→excellent→unbelievable）', '实测 ' + vs5.stats.upgraded);
ok(vs5.queued && vs5.queued.name === 'unbelievable', '等待槽只保留最高档',
  JSON.stringify(vs5.queued));
await sleep(80);
ok(sm3.getVoiceState().stats.played === played0 + 1, '等待期内不叠播');
CLOCK += 800;                            /* 触达 800ms 上限 */
await sleep(90);
ok(sm3.getVoiceState().stats.played === played0 + 2, '等待上限到点后强发最高档（绝不吞音）',
  '实测 ' + sm3.getVoiceState().stats.played);
ok(sm3.getVoiceState().lastVoiceName === 'unbelievable', '最后起播的是最高档',
  String(sm3.getVoiceState().lastVoiceName));

/* =========================================================
 * ⑥ 同档防复读
 * ========================================================= */
console.log('\n[6] 同档防复读（最高档）');
/* 权威防复读在 GameState.comboVoiceTier（见 [2] 的 Combo 6~8 → null）；
 * 此处验证 SoundManager 侧兜底：同档请求在等待槽已存在时一律丢弃。 */
var accepted6 = 0;
var rejected6 = 0;
for (var d6 = 0; d6 < 3; d6++) {
  if (sm3.playVoice('unbelievable', { tier: 5 })) accepted6++;
  else rejected6++;
}
ok(accepted6 === 1, '同一时刻只有 1 次同档请求被受理', '实测 ' + accepted6);
ok(rejected6 === 2, '紧随其后的 2 次同档请求被丢弃', '实测 ' + rejected6);
ok(sm3.getVoiceState().stats.skippedDup === 2, '计入 skippedDup',
  '实测 ' + sm3.getVoiceState().stats.skippedDup);
var beforeDup = sm3.getVoiceState().stats.played;
endAllVoices();                          /* 上一句播完 → 等待槽放行 */
await sleep(240);
ok(sm3.getVoiceState().stats.played === beforeDup + 1, '同档只起播 1 次',
  '实测 ' + (sm3.getVoiceState().stats.played - beforeDup));

/* =========================================================
 * ⑦ 5 秒窗口复位 → 阶梯重新触发
 * ========================================================= */
console.log('\n[7] 5 秒窗口超时 → 连击归零 → 阶梯可再次完整触发');
var combos2 = [];
var sess2 = STM.GameState.createSession(biggestLevel(), {
  onEvent: function (e) {
    if (e.e === 'match') MATCHES++;
    if (e.e === 'comboChanged') combos2.push({ count: e.count, tier: e.tier, voice: e.voice });
  }
});
CLOCK = 80000;
runMatches(sess2, 2);
ok(combos2.length === 2 && combos2[1].voice === 'good',
  '第一周期：Combo 2 播报 good', combos2[1] ? String(combos2[1].voice) : 'len=' + combos2.length);
CLOCK += 6000;
runMatches(sess2, 2);
var cyc2 = combos2.slice(2);
ok(cyc2.length === 2 && cyc2[0].count === 1, '窗口超时后连击重置为 1',
  cyc2[0] ? String(cyc2[0].count) : 'null');
ok(cyc2[1] && cyc2[1].voice === 'good', '第二周期 Combo 2 再次播报 good（闸门复位）',
  cyc2[1] ? String(cyc2[1].voice) : 'null');
ok(sess2.state().comboVoiceTier === 2, 'state().comboVoiceTier = 2', '实测 ' + sess2.state().comboVoiceTier);

/* =========================================================
 * ⑧ 隔离：非人声不受影响 + 静音零漏音
 * ========================================================= */
console.log('\n[8] 隔离：非人声不受影响 / 静音零漏音');
var sm4 = STM.createSoundManager({});
audioInstances.forEach(function (a) { a.emit('loadeddata'); });
CLOCK = 100000;
endAllVoices();
var shatterEls = audioInstances.filter(function (a) { return /sfx_shatter/.test(a.src); });
var shBefore = shatterEls.reduce(function (acc, a) { return acc + a._playCount; }, 0);

sm4.playVoice('good', { tier: 2 });       /* 人声排队/等待期 */
sm4.playVoice('great', { tier: 3 });
for (var m8 = 0; m8 < 3; m8++) sm4.playShatter(1.0 + m8 * 0.06);
var shAfter = shatterEls.reduce(function (acc, a) { return acc + a._playCount; }, 0);
ok(shAfter === shBefore + 3, '人声等待期 3 次碎裂音全部正常', '实测 ' + (shAfter - shBefore));
ok(sm4.playTap() === true, '点击合成音正常');
var winEl = audioInstances.filter(function (a) { return /sfx_win/.test(a.src); }).slice(-1)[0];
sm4.playSfx('win');
ok(winEl._playCount === 1, '通关音正常');

sm4.setSfxMute(true);
ok(sm4.getVoiceState().queued === null, '静音时等待槽被清空（无漏音）');
var mutedBefore = sm4.getVoiceState().stats.played;
await sleep(200);
ok(sm4.getVoiceState().stats.played === mutedBefore, '静音后零人声漏出');
ok(sm4.playVoice('unbelievable', { tier: 5 }) === false, '静音时人声不排定');
sm4.setSfxMute(false);

console.log('\n──────────── 结果 ────────────');
console.log('通过 ' + passes + ' / 失败 ' + fails);
if (fails > 0) process.exit(1);
process.exit(0);
}

main().catch(function (e) {
  console.error('voice-ladder-smoke 异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
