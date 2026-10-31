/* =========================================================
 * Slide & Triple — voice-cooldown-smoke（Δ30 / FR-054 人声节流门禁）
 *
 * node tools/voice-cooldown-smoke.js
 *
 * 覆盖:
 *   ① 静态契约——冷却常量 3.5s、AUDIO_CONFIG 暴露、三道闸门代码段齐备、
 *      main.js 仅在 e.voice 非空时调用 playVoice
 *   ② 全局硬冷却——距上次人声 < 3.5s 的请求全部丢弃（不消耗冷却）
 *   ③ 单轨独占——已有夸赞人声在播时跳过，MUST NOT 截断 / 叠放
 *   ④ 基础音效隔离——冷却期内碎裂 / 点击 / 通关音照常触发
 *   ⑤ 连击跨档单次——连续 8 次三消，count 正常累加、voice 只在跨档时下发
 *   ⑥ 5 秒窗口复位——窗口超时后连击重置，重新打出高阶可再次播报
 *
 * 零依赖（宪章 II）：浏览器契约级桩，不引任何 npm 包。
 * 时钟为**可控桩**（CLOCK），冷却断言不依赖真实等待时长。
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

/* AudioContext 桩：本门禁不校验合成音波形，只保证调用不抛错 */
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
  var rec = { type: 'sine', frequency: new Param(440), connect: function () {},
    start: function () {}, stop: function () {} };
  return rec;
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
console.log('\n[1] 静态契约（FR-054 常量与闸门代码段）');
require('../src/audio/SoundManager.js');
var CFG = globalThis.STM.AUDIO_CONFIG;
ok(CFG.voiceCooldownMs === 3500, '人声全局硬冷却 = 3500ms', '实测 ' + CFG.voiceCooldownMs);
ok(CFG.voiceLeadMs === 120, '人声起播延迟 = 120ms（错开碎裂瞬态）', '实测 ' + CFG.voiceLeadMs);

var smSrc = fs.readFileSync(path.join(ROOT, 'src', 'audio', 'SoundManager.js'), 'utf8');
ok(/function isVoicePlaying\(\)/.test(smSrc), '存在单轨独占判定 isVoicePlaying()');
ok(/function fireVoice\(name, payload\)/.test(smSrc), '存在起播前二次复核 fireVoice()');
ok(/lastVoiceAt = nowMs\(\)/.test(smSrc), '冷却时间戳仅在真正起播后写入');
ok(/getVoiceState: function/.test(smSrc), '对外暴露 getVoiceState() 只读观测位');

var gsSrc = fs.readFileSync(path.join(ROOT, 'src', 'core', 'GameState.js'), 'utf8');
ok(/var comboVoiceTier = 0;/.test(gsSrc), 'GameState 维护 comboVoiceTier（本周期已播档位）');
ok(/if \(voice && tier > comboVoiceTier\)/.test(gsSrc), 'voice 仅在跨入更高档位时下发');
ok(/comboVoiceTier = 0; \/\* 新连击周期/.test(gsSrc), '5 秒窗口超时 → 人声闸门复位');

var mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
ok(/if \(e\.voice\) sound\.playVoice\(e\.voice\);/.test(mainSrc), 'main.js 仅在 e.voice 非空时调用 playVoice');
ok(!/sound\.playVoice\(e\.voice\);\s*sound\.playVoice/.test(mainSrc), 'main.js 无重复调用点');

/* =========================================================
 * ② 全局硬冷却 + ③ 单轨独占
 * ========================================================= */
console.log('\n[2] 全局硬冷却（3.5s）与单轨独占');
var sm = globalThis.STM.createSoundManager({});
audioInstances.forEach(function (a) { a.emit('loadeddata'); });
var stReady = sm.getStatus();
ok(Object.keys(stReady).every(function (k) { return stReady[k].status === 'ready'; }), '8 类资产全部 ready');

var voiceEls = audioInstances.filter(function (a) { return /sfx_voice_/.test(a.src); });
function voiceOf(name) {
  return audioInstances.filter(function (a) { return a.src.indexOf(name) >= 0; });
}
function playingVoiceCount() {
  return voiceEls.filter(function (a) { return !a.paused && !a.ended; }).length;
}

/* ── 第一次：正常起播（延迟 120ms） ── */
CLOCK = 1000;
var r1 = sm.playVoice('unbelievable');
ok(r1 === true, '首次请求排定成功（返回 true）');
ok(sm.getVoiceState().stats.played === 0, '120ms 内尚未实际发声');
await sleep(160);
var v1 = sm.getVoiceState();
ok(v1.stats.played === 1, '160ms 后实际发声 1 次', '实测 ' + v1.stats.played);
ok(v1.lastVoiceAt === 1000, '冷却时间戳 = 起播时刻（1000）', '实测 ' + v1.lastVoiceAt);
ok(voiceOf('sfx_voice_unbelievable').some(function (a) { return a._playCount === 1; }),
  'unbelievable 实例播放 1 次');

/* ── 冷却期内连续 5 次请求（模拟 5 次快速三消）── */
var beforePlayed = sm.getVoiceState().stats.played;
var accepted = 0;
for (var q = 0; q < 5; q++) {
  CLOCK += 500;                       /* 每次间隔 500ms，共 2.5s < 3.5s */
  if (sm.playVoice('unbelievable')) accepted++;
}
ok(accepted === 0, '冷却期内 5 次请求全部被拒（0 次排定）', '实测 ' + accepted);
ok(sm.getVoiceState().stats.played === beforePlayed, '冷却期内零实际发声（不叠音）');
ok(sm.getVoiceState().stats.skippedCooldown === 5, '5 次均计入 skippedCooldown',
  '实测 ' + sm.getVoiceState().stats.skippedCooldown);
ok(sm.getVoiceState().lastVoiceAt === 1000, '被拒请求不消耗 / 不改写冷却时间戳');

/* ── 冷却期满（+3.5s）→ 允许再播 ── */
voiceOf('sfx_voice_unbelievable').forEach(function (a) { a.paused = true; a.ended = true; });
CLOCK = 1000 + 3500;
var r2 = sm.playVoice('great');
ok(r2 === true, '冷却期满（恰好 3.5s）→ 排定成功');
await sleep(160);
var v2 = sm.getVoiceState();
ok(v2.stats.played === 2, '第 2 次实际发声', '实测 ' + v2.stats.played);
ok(v2.lastVoiceAt === 4500, '冷却时间戳刷新为 4500', '实测 ' + v2.lastVoiceAt);

/* ── 单轨独占：正在播时再请求 → 跳过，且不截断在播语音 ── */
CLOCK = 4500 + 3600;                  /* 冷却已过，排除冷却干扰 */
var greatEl = voiceOf('sfx_voice_great').filter(function (a) { return !a.paused; })[0];
ok(!!greatEl, 'great 实例处于播放态（用于独占判定）');
var playCountBefore = greatEl ? greatEl._playCount : 0;
var r3 = sm.playVoice('unbelievable');
ok(r3 === false, '已有夸赞人声在播 → 本次请求被跳过');
ok(sm.getVoiceState().stats.skippedBusy === 1, '计入 skippedBusy',
  '实测 ' + sm.getVoiceState().stats.skippedBusy);
ok(greatEl && greatEl._playCount === playCountBefore && greatEl.paused === false,
  '在播语音未被截断 / 未重新起播（单轨独占保护）');
ok(playingVoiceCount() === 1, '任一时刻最多 1 条语音在播（零叠音）', '实测 ' + playingVoiceCount());

/* ── 冷却与独占同时满足 → 恢复 ── */
greatEl.paused = true; greatEl.ended = true;
CLOCK += 3600;
var r4 = sm.playVoice('good');
ok(r4 === true, '独占解除且冷却期满 → 恢复播报');
await sleep(160);
ok(sm.getVoiceState().stats.played === 3, '累计发声 3 次（1 good / 1 great / 1 unbelievable）',
  '实测 ' + sm.getVoiceState().stats.played);
ok(playingVoiceCount() <= 1, '三次播报全程无重叠');

/* =========================================================
 * ④ 基础音效隔离（人声冷却 MUST NOT 波及非人声）
 * ========================================================= */
console.log('\n[3] 基础音效不受人声冷却影响');
var shatterEls = audioInstances.filter(function (a) { return /sfx_shatter/.test(a.src); });
var shBefore = shatterEls.reduce(function (acc, a) { return acc + a._playCount; }, 0);
/* 此刻仍在人声冷却期内（good 刚播完，CLOCK 未推进） */
ok(sm.getVoiceState().sinceLastVoiceMs < 3500, '当前处于人声冷却期内');
for (var m2 = 0; m2 < 3; m2++) sm.playShatter(1.0 + m2 * 0.06);
var shAfter = shatterEls.reduce(function (acc, a) { return acc + a._playCount; }, 0);
ok(shAfter === shBefore + 3, '冷却期内 3 次碎裂音全部正常播放', '实测 ' + (shAfter - shBefore));
ok(sm.playShatter(1.12) === true, 'playShatter 返回 true（未被节流）');
var tapOk = sm.playTap();
ok(tapOk === true, '点击合成音正常');
var winEl = audioInstances.filter(function (a) { return /sfx_win/.test(a.src); })[0];
sm.playSfx('win');
ok(winEl._playCount === 1, '通关音正常（非人声不参与冷却）');
/* 语音仍被冷却拦截 → 证明闸门只作用于人声 */
var blocked = sm.playVoice('unbelievable');
ok(blocked === false, '同一时刻人声仍被冷却拦截（闸门只作用于 Voiceover）');

/* 静音态：人声 MUST 完全静默且计入 skippedMuted */
sm.setSfxMute(true);
var muteBefore = sm.getVoiceState().stats.played;
ok(sm.playVoice('good') === false, 'SFX 静音时人声不排定');
ok(sm.getVoiceState().stats.played === muteBefore, '静音时零发声');
sm.setSfxMute(false);

/* =========================================================
 * ⑤ 连击跨档单次（真实 GameState 驱动 8 次三消）
 * ========================================================= */
console.log('\n[4] 连击跨档单次播报（8 次快速三消）');
CLOCK = 10000;
var RE = require('../src/core/RulesEngine.js');
globalThis.STM = { RulesEngine: RE };
require('../src/core/GameState.js');
var STM = globalThis.STM;
var LEVELS = require('../src/data/levels.js');

function biggestLevel() {
  var best = LEVELS[0];
  for (var i = 0; i < LEVELS.length; i++) {
    if ((LEVELS[i].tiles || []).length > (best.tiles || []).length) best = LEVELS[i];
  }
  return best;
}

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
var MATCHES = 0;
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
var matchCount = MATCHES;
ok(matchCount >= 8, '连续快速模拟 ' + usedTaps + ' 次点击触发 ' + matchCount + ' 次三消（>= 6）');

var counts = combos.map(function (c) { return c.count; });
var seqOk = counts.every(function (v, i) { return v === i + 1; });
ok(seqOk, '连击计数正常累积（1..' + counts.length + ' 连续递增）', counts.join(','));

var voices = combos.map(function (c) { return c.voice; });
ok(voices[0] === null && voices[1] === null, 'tier 1/2 不下发语音');
ok(voices[2] === 'good', '首次跨入 tier 3 → good');
ok(voices[3] === 'great', '首次跨入 tier 4 → great');
ok(voices[4] === 'unbelievable', '首次跨入 tier 5 → unbelievable');

/* 核心断言：tier 5 持续期间不再重复下发 */
var tier5Voices = combos.filter(function (c) { return c.tier >= 5; }).map(function (c) { return c.voice; });
ok(tier5Voices.length >= 4, '连击持续停留在最高档 >= 4 次（复现原缺陷场景）',
  '实测 ' + tier5Voices.length);
ok(tier5Voices.slice(1).every(function (v) { return v === null; }),
  '最高档持续期间 voice 恒为 null（不再复读 Unbelievable）', tier5Voices.join(','));

/* 同档位不得重复非空 voice */
var seen = {};
var dupTier = null;
combos.forEach(function (c) {
  if (!c.voice) return;
  if (seen[c.tier]) dupTier = c.tier;
  seen[c.tier] = true;
});
ok(dupTier === null, '同一档位在单次连击周期内至多播报一次', dupTier == null ? '' : 'tier ' + dupTier);

/* 非人声表现不受影响：飘字 / 升调 / 积分照常 */
ok(combos.every(function (c) { return c.rate >= 1; }), '碎裂升调 playbackRate 始终有效');
ok(combos[5] && combos[5].text === 'Unbelievable! ×6', '最高档飘字仍逐次累加（×6）',
  combos[5] ? combos[5].text : 'null');
ok(combos[7] && combos[7].text === 'Unbelievable! ×8', '最高档飘字 ×8 正常',
  combos[7] ? combos[7].text : 'null');
var scoreGrew = scores.every(function (v, i) { return i === 0 || v >= scores[i - 1]; });
ok(scoreGrew && scores[scores.length - 1] > 0, '积分结算不受影响（单调不减）',
  scores.join('→'));

/* =========================================================
 * ⑥ 5 秒窗口复位 → 允许再次播报
 * ========================================================= */
console.log('\n[5] 5 秒窗口超时 → 连击重置 → 人声闸门复位');
var combos2 = [];
var sess2 = STM.GameState.createSession(biggestLevel(), {
  onEvent: function (e) {
    if (e.e === 'match') MATCHES++;
    if (e.e === 'comboChanged') combos2.push({ count: e.count, tier: e.tier, voice: e.voice });
  }
});
runMatches(sess2, 3);
var firstCycle = combos2.slice();
ok(firstCycle.length === 3 && firstCycle[2].voice === 'good',
  '第一周期：3 次三消 → tier 3 播报 good',
  firstCycle.length === 3 ? String(firstCycle[2].voice) : 'len=' + firstCycle.length);

CLOCK += 6000;                       /* 超出 5.0s 滑动窗 */
runMatches(sess2, 3);
var secondCycle = combos2.slice(3);
ok(secondCycle.length === 3, '第二周期：再触发 3 次三消', '实测 ' + secondCycle.length);
ok(secondCycle[0] && secondCycle[0].count === 1, '窗口超时后连击计数重置为 1',
  secondCycle[0] ? String(secondCycle[0].count) : 'null');
ok(secondCycle[2] && secondCycle[2].tier === 3 && secondCycle[2].voice === 'good',
  '重新打出高阶连击 → good 再次下发（闸门随周期复位）',
  secondCycle[2] ? String(secondCycle[2].voice) : 'null');
ok(sess2.state().comboCount === 3, 'state().comboCount 同步为 3（只读观测位一致）',
  '实测 ' + sess2.state().comboCount);
ok(sess2.state().comboVoiceTier === 3, 'state().comboVoiceTier = 3（本周期已播档位）',
  '实测 ' + sess2.state().comboVoiceTier);

/* reset() 必须复位闸门 */
sess2.reset();
ok(sess2.state().comboVoiceTier === 0, 'reset() 后 comboVoiceTier 归零',
  '实测 ' + sess2.state().comboVoiceTier);

console.log('\n──────────── 结果 ────────────');
console.log('通过 ' + passes + ' / 失败 ' + fails);
if (fails > 0) process.exit(1);
process.exit(0);
}

main().catch(function (e) {
  console.error('voice-cooldown-smoke 异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
