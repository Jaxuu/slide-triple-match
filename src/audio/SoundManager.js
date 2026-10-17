/* =========================================================
 * Slide & Triple — SoundManager（Web Audio 纯代码合成音效）
 * classic script；向 window.STM 挂载（D-01）
 * AudioContext 首次 pointerdown 惰性创建 + resume（autoplay 政策）
 * 振荡器（正弦/方波/三角扫频）+ 白噪声 buffer + DynamicsCompressor
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  function createSoundManager(opts) {
    opts = opts || {};
    var ctx = null;
    var master = null;
    var noiseBuf = null;
    var muted = !!opts.muted;

    /* 惰性创建（首次 pointerdown 由外层调用 unlock()） */
    function unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch (e) { ctx = null; return; }
      /* 压缩总线（防爆音） */
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -18;
      master.knee.value = 20;
      master.ratio.value = 8;
      master.attack.value = 0.003;
      master.release.value = 0.2;
      master.connect(ctx.destination);
      /* 白噪声 buffer（1s，单声道） */
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      if (ctx.state === 'suspended') ctx.resume();
    }

    /* ---------- 基础合成原语 ---------- */
    /* 单振荡器音符（type, 频率扫频 f0→f1, 时长, 峰值音量, 起始延迟） */
    function tone(type, f0, f1, dur, vol, delay) {
      if (!ctx || muted) return;
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }

    /* 噪声冲击（时长, 峰值, 高通频率） */
    function noise(dur, vol, delay, highpass) {
      if (!ctx || muted || !noiseBuf) return;
      var t0 = ctx.currentTime + (delay || 0);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      var g = ctx.createGain();
      var f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = highpass || 400;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    }

    /* ---------- 音色表（M1: click/flyout/blocked/match/victory/defeat; M2 扩展机制音效） ---------- */
    var SFX = {
      /* 点击: 880Hz 短方波 */
      click: function () { tone('square', 880, 880, 0.08, 0.12); },
      /* 飞出: 上行扫频 */
      flyout: function () { tone('sine', 320, 960, 0.28, 0.16); },
      /* 受阻: 120Hz 三角 + 噪声冲击 */
      blocked: function () {
        tone('triangle', 140, 90, 0.22, 0.22);
        noise(0.12, 0.18, 0, 300);
      },
      /* 三消: 三音上行琶音（连击数调制音高） */
      match: function (combo) {
        var base = 523.25 * Math.pow(1.0595, Math.min(12, (combo || 1) - 1) * 2);
        tone('sine', base, base, 0.14, 0.14, 0.00);
        tone('sine', base * 1.26, base * 1.26, 0.14, 0.14, 0.09);
        tone('sine', base * 1.5, base * 1.5, 0.20, 0.16, 0.18);
      },
      /* 胜利: 大三和弦琶音 */
      victory: function () {
        tone('sine', 523.25, 523.25, 0.16, 0.15, 0.00);
        tone('sine', 659.25, 659.25, 0.16, 0.15, 0.12);
        tone('sine', 783.99, 783.99, 0.16, 0.15, 0.24);
        tone('sine', 1046.5, 1046.5, 0.34, 0.17, 0.36);
      },
      /* 失败: 下行 */
      defeat: function () {
        tone('triangle', 440, 440, 0.18, 0.14, 0.00);
        tone('triangle', 349.23, 349.23, 0.18, 0.14, 0.14);
        tone('triangle', 261.63, 220, 0.40, 0.16, 0.28);
      },
      /* 输入锁提示（短滴） */
      tick: function () { tone('square', 660, 660, 0.04, 0.06); },
      /* M2 机制音效签名（预留，T036 实现） */
      gear: function () { tone('square', 300, 420, 0.16, 0.12); },
      unlock: function () { tone('sine', 700, 1050, 0.2, 0.13); },
      iceBreak: function () { noise(0.2, 0.16, 0, 1800); tone('sine', 1400, 900, 0.16, 0.08); },
      prism: function () { tone('sine', 900, 1350, 0.14, 0.11); },
      undo: function () { tone('sine', 700, 300, 0.3, 0.13); },
      item: function () { tone('square', 520, 660, 0.1, 0.1); },
      botTick: function () { tone('square', 990, 990, 0.03, 0.05); }
    };

    /* 事件 → 音效映射（game-session.md §5 全表；GameState onEvent 转发） */
    function play(name, arg) {
      if (muted) return;
      if (!ctx) unlock(); /* 已在用户手势内调用时直接初始化 */
      var fn = SFX[name];
      if (fn) fn(arg);
    }

    function setMuted(m) { muted = !!m; }
    function isMuted() { return muted; }

    return {
      unlock: unlock,
      play: play,
      setMuted: setMuted,
      isMuted: isMuted
    };
  }

  STM.createSoundManager = createSoundManager;
})(typeof window !== 'undefined' ? window : globalThis);
