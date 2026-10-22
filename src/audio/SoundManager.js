/* =========================================================
 * Slide & Triple — SoundManager（Web Audio 纯代码合成音效 + Δ14 治愈系 BGM）
 * classic script；向 window.STM 挂载（D-01）
 * AudioContext 首次 pointerdown/keydown 惰性创建 + resume（autoplay 政策）
 * 振荡器（正弦/方波/三角扫频）+ 白噪声 buffer + DynamicsCompressor
 *
 * Δ14/T052f（FR-037）治愈系循环 BGM:
 *   · 大调五声音阶（C D E G A）柔和木琴琶音（短促衰减正弦/三角波 +
 *     低通滤波）+ 温暖低通滤波和弦 Pad 铺底
 *   · 8 小节调度表驱动（Web Audio 前瞻调度 setInterval 节拍器——
 *     主线程零负担、无 setInterval 音质抖动）
 *   · BGM 专用 gain 节点与 SFX 链路隔离（互不串音）
 *   · 首次交互（PointerEvent/keydown 任一）后自动播放（autoplay 合规
 *     ——首次交互前 MUST NOT 发声）
 *   · Δ16c: BGM / SFX 静音粒度分离（setBgmMute / setSfxMute——FR-040 §1
 *     三开关音频侧口径）; setMuted() 保留为兼容包装（同时置两者）
 *   · visibilitychange→hidden 暂停 / 恢复续播
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

    /* ---------- Δ16c: BGM / SFX 独立静音（FR-040 §1 三个开关的音频侧口径）
     * Δ14 原为单一 muted 同步控两者；Δ16 拆为 bgmMuted / sfxMuted 粒度。
     * muted 保留为派生兼容位（= bgmMuted || sfxMuted），既有单开关闭子行为
     * 与 setMuted() 语义零变化；新增 setBgmMuted / setSfxMuted 粒度接口。 */
    var bgmMuted = opts.bgmMuted != null ? !!opts.bgmMuted : muted;
    var sfxMuted = opts.sfxMuted != null ? !!opts.sfxMuted : muted;

    /* ---------- BGM 专用链路（与 SFX 隔离——FR-037 §BGM gain） ---------- */
    var bgmGain = null;        /* BGM 音量节点（SFX 走 master 压缩总线） */
    var bgmTimer = null;       /* 调度器句柄 */
    var bgmPlaying = false;
    var bgmNextBeat = 0;       /* 下一次调度的绝对 AudioContext 时间 */
    var bgmBar = 0;            /* 当前小节序（0~7 循环） */
    var unlocked = false;      /* 首次交互标志（autoplay 合规门） */

    /* 惰性创建（首次 pointerdown/keydown 由外层调用 unlock()） */
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
      /* 压缩总线（SFX 防爆音） */
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -18;
      master.knee.value = 20;
      master.ratio.value = 8;
      master.attack.value = 0.003;
      master.release.value = 0.2;
      master.connect(ctx.destination);
      /* BGM 专用 gain（低通前的独立音量——舒适背景级） */
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.16;
      bgmGain.connect(ctx.destination); /* 绕过 SFX 压缩总线（链路隔离） */
      /* 白噪声 buffer（1s，单声道） */
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      if (ctx.state === 'suspended') ctx.resume();
      unlocked = true;
      /* 首次交互后自动开启 BGM（若 BGM 未静音——FR-037 §2 autoplay 合规;
       * Δ16c: 只看 BGM 粒度，SFX 静音不影响 BGM 起播） */
      if (!bgmMuted) startBgm();
    }

    /* ---------- 基础合成原语（SFX） ---------- */
    /* 单振荡器音符（type, 频率扫频 f0→f1, 时长, 峰值音量, 起始延迟, 声道）
     * Δ16c: channel = 'bgm' | 'sfx'（默认 'sfx'）——BGM/SFX 静音粒度分离 */
    function tone(type, f0, f1, dur, vol, delay, channel) {
      if (!ctx) return;
      if (channel === 'bgm' ? bgmMuted : sfxMuted) return;
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
      if (!ctx || sfxMuted || !noiseBuf) return; /* Δ16c: 噪声仅 SFX 链路使用 */
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

    /* =========================================================
     * Δ14/T052f: 治愈系 BGM 合成器（大调五声音阶——FR-037）
     * ========================================================= */

    /* C 大调五声音阶（跨两个八度——柔和木琴域） */
    var PENTA = [
      261.63, 293.66, 329.63, 392.00, 440.00, /* C4 D4 E4 G4 A4 */
      523.25, 587.33, 659.25, 783.99, 880.00  /* C5 D5 E5 G5 A5 */
    ];

    /* 和弦进行（4 和弦 × 2 小节 = 8 小节循环——柔和 pad 铺底）
     * C 大调: C (C E G) → Am (A C E) → F (F A C) → G (G B D)
     * 频率取中低音区（温暖） */
    var CHORDS = [
      [130.81, 164.81, 196.00], /* C3 E3 G3 */
      [110.00, 130.81, 164.81], /* A2 C3 E3 */
      [174.61, 220.00, 261.63], /* F3 A3 C4 */
      [196.00, 246.94, 293.66]  /* G3 B3 D4 */
    ];

    /* 8 小节琶音调度表（每小节 4 拍、每拍触发 0~2 音）
     * 音高索引取 PENTA 序（-1 = 休止）；轻快上行琶音 + 偶发回落 */
    var ARP = [
      [0, 2, 4, 5],    /* bar 1: 上行 */
      [4, 5, -1, 6],   /* bar 2: 接续 + 呼吸 */
      [2, 4, 6, 7],    /* bar 3 */
      [6, 5, 4, -1],   /* bar 4: 回落 */
      [1, 3, 5, 6],    /* bar 5 */
      [5, 7, -1, 8],   /* bar 6 */
      [4, 6, 8, 9],    /* bar 7: 高潮 */
      [8, 6, 5, 4]     /* bar 8: 收束 */
    ];

    var BEAT_MS = 480;    /* 每拍 480ms（~125bpm 的舒缓半拍感） */
    var BAR_BEATS = 4;
    var TOTAL_BARS = 8;
    var LOOKAHEAD_BEATS = 3; /* 前瞻调度窗口（拍） */

    /* 木琴音色: 短促衰减正弦/三角双振荡器 + 低通滤波（柔和敲击感） */
    function bgmNote(freq, when, vol) {
      var osc = ctx.createOscillator();
      var osc2 = ctx.createOscillator();
      var g = ctx.createGain();
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2400; /* 温暖低通（去高频毛刺） */
      f.Q.value = 0.8;
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 2; /* 泛音层（木琴木质共鸣） */
      var g2 = ctx.createGain();
      g2.gain.value = 0.22; /* 泛音较弱 */
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.85); /* 柔和衰减 */
      osc.connect(f);
      osc2.connect(g2); g2.connect(f);
      f.connect(g);
      g.connect(bgmGain);
      osc.start(when); osc.stop(when + 0.9);
      osc2.start(when); osc2.stop(when + 0.9);
    }

    /* 和弦 Pad: 三音长持续 + 缓起缓收包络（温暖铺底） */
    function bgmPad(freqs, when, dur) {
      for (var i = 0; i < freqs.length; i++) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        var f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900; /* 深低通——柔和不抢音 */
        osc.type = 'triangle';
        osc.frequency.value = freqs[i];
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.05, when + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, when + dur);
        osc.connect(f); f.connect(g); g.connect(bgmGain);
        osc.start(when); osc.stop(when + dur + 0.05);
      }
    }

    /* 前瞻调度器: 每 200ms 唤醒，把未来 LOOKAHEAD_BEATS 拍内的音符
     * 全部排入 Web Audio 时间线（主线程零负担、无回调抖动） */
    function scheduleAhead() {
      if (!ctx || !bgmPlaying) return;
      var now = ctx.currentTime;
      var horizon = now + (LOOKAHEAD_BEATS * BEAT_MS) / 1000 + 0.25;
      while (bgmNextBeat < horizon * 1000) {
        var when = bgmNextBeat / 1000;
        var beatInBar = Math.round((bgmNextBeat / BEAT_MS)) % BAR_BEATS;
        var barIdx = Math.floor(Math.round(bgmNextBeat / BEAT_MS) / BAR_BEATS) % TOTAL_BARS;
        /* 琶音音符（查表——休止跳过） */
        var noteIdx = ARP[barIdx][beatInBar];
        if (noteIdx >= 0) {
          var vol = 0.20 + (noteIdx >= 6 ? 0.05 : 0); /* 高音稍亮 */
          bgmNote(PENTA[noteIdx], when, vol);
        }
        /* 小节头换和弦（Pad 持续整小节） */
        if (beatInBar === 0) {
          var chord = CHORDS[Math.floor(barIdx / 2) % CHORDS.length];
          bgmPad(chord, when, (BAR_BEATS * BEAT_MS) / 1000 * 1.05);
        }
        bgmNextBeat += BEAT_MS;
        if (bgmNextBeat > 1e12) bgmNextBeat = ctx.currentTime * 1000; /* 时钟回绕防御 */
      }
    }

    function startBgm() {
      if (!ctx || !bgmGain || bgmPlaying) return;
      bgmPlaying = true;
      bgmNextBeat = ctx.currentTime * 1000 + 120; /* 起拍微延迟 */
      bgmBar = 0;
      scheduleAhead();
      if (bgmTimer) clearInterval(bgmTimer);
      bgmTimer = setInterval(scheduleAhead, 200);
    }

    function stopBgm() {
      bgmPlaying = false;
      if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    }

    /* visibilitychange → hidden 暂停 / 恢复续播（FR-037 §4） */
    function handleVisibility() {
      if (!ctx) return;
      if (global.document && global.document.hidden) {
        stopBgm();
        if (ctx.state === 'running') ctx.suspend();
      } else if (unlocked && !bgmMuted) {
        if (ctx.state === 'suspended') ctx.resume();
        startBgm(); /* 恢复续播（bgmNextBeat 重锚当前时间） */
      }
    }
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', handleVisibility);
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
        /* T083: 清脆薄瓷碎裂 ASMR 音效 —— 第一层薄瓷/冰晶瞬态脆裂声（高频带通白噪声 65ms）
         * 第二层碎晶散落微颗粒（0ms/22ms/48ms/75ms 四颗高频木琴/水晶泛音） */
        /* 第一层：白噪声带通滤波 2600->1800Hz, Q=3.5, 65ms */
        if (ctx && !sfxMuted && noiseBuf) {
          var t0 = ctx.currentTime;
          var src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          var bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(2600, t0);
          bp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.065);
          bp.Q.value = 3.5;
          var g = ctx.createGain();
          g.gain.setValueAtTime(0.18, t0);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.065);
          src.connect(bp); bp.connect(g); g.connect(master);
          src.start(t0); src.stop(t0 + 0.07);
        }
        /* 第二层：4 颗高频木琴/水晶泛音颗粒（C6,D6,E6,G6,A6,C7 大调五声跳跃） */
        var scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
        var idx0 = Math.min(scale.length - 1, Math.max(0, ((combo || 1) - 1) % scale.length));
        var delays = [0, 0.022, 0.048, 0.075];
        for (var gi = 0; gi < delays.length; gi++) {
          var f = scale[(idx0 + gi) % scale.length];
          tone('sine', f, f, 0.04, 0.10, delays[gi]);
          tone('triangle', f * 2, f * 2, 0.03, 0.04, delays[gi]);
        }
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
      /* M2 机制音效 */
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
      if (sfxMuted) return;
      if (!ctx) unlock(); /* 已在用户手势内调用时直接初始化 */
      var fn = SFX[name];
      if (fn) fn(arg);
    }

    /* =========================================================
     * Δ16d/T066: 开机合成和弦音 playBootChime()
     * 温润空灵短促和弦 ≈0.35s，Web Audio 纯代码实时合成（**零音频文件**
     * ——宪章 III 音频红线不破）:
     *   主琶音 C5 → E5 → C6 (523.25 / 659.25 / 1046.5 Hz 正弦+三角泛音)
     *   + 柔和高频清脆铃音（C6 倍频三角波，极短衰减）
     *   包络柔和（attack 12ms / 指数衰减），总长 0.4s 不刺耳
     * autoplay 合规（FR-038 §4）: ctx 未解锁（首次交互前）时**静默返回
     * false 不发声**——由 splash 在首次 pointerdown/keydown 后补发。
     * 静音口径（SFX 粒度）: sfxMuted 时不响；bgmMuted 不影响本次和弦。
     * ========================================================= */
    function playBootChime() {
      if (!ctx || !unlocked || sfxMuted) return false;
      try {
        var t0 = ctx.currentTime + 0.01;
        var notes = [
          { f: 523.25, v: 0.16, d: 0.30, type: 'sine' },
          { f: 659.25, v: 0.13, d: 0.30, type: 'sine' },
          { f: 1046.5, v: 0.10, d: 0.40, type: 'sine' }
        ];
        for (var i = 0; i < notes.length; i++) {
          var nt = notes[i];
          var startAt = t0 + i * 0.06; /* 轻柔琶音间隔 60ms */
          tone(nt.type, nt.f, nt.f, nt.d, nt.v, startAt - ctx.currentTime);
          /* 三角泛音层（同频 2 倍微弱叠音增厚） */
          tone('triangle', nt.f * 2, nt.f * 2, nt.d * 0.7, nt.v * 0.25, startAt - ctx.currentTime);
        }
        /* 柔和高频清脆铃音（轻装饰——非刺耳） */
        tone('triangle', 2093.0, 2093.0, 0.14, 0.05, 0.26);
        return true;
      } catch (err) {
        return false; /* 合成失败静默降级——不阻塞开机动画 */
      }
    }

    /* 静音联动（Δ16c）: BGM 与 SFX 粒度独立（FR-040 §1）:
     * BGM 走 bgmGain 归零/恢复 + 停调度续播；SFX 走 sfxMuted 门控。
     * setMuted() 为兼容包装（同时置两者——既有单开关行为不变）。 */
    function applyBgmMute() {
      if (!ctx || !bgmGain) return;
      bgmGain.gain.setTargetAtTime(bgmMuted ? 0 : 0.16, ctx.currentTime, 0.08);
      if (bgmMuted) {
        stopBgm();
      } else if (unlocked && !bgmMuted) {
        startBgm();
      }
    }

    function setBgmMute(m) {
      bgmMuted = !!m;
      muted = bgmMuted || sfxMuted;
      applyBgmMute();
    }

    function setSfxMute(m) {
      sfxMuted = !!m;
      muted = bgmMuted || sfxMuted;
    }

    /* 兼容: 单开关 = 同时置两者（Δ14 既有口径，M4 调试面板仍走此） */
    function setMuted(m) {
      muted = !!m;
      bgmMuted = !!m;
      sfxMuted = !!m;
      applyBgmMute();
    }

    function isMuted() { return muted; }
    function isBgmPlaying() { return bgmPlaying; }

    return {
      unlock: unlock,
      play: play,
      playBootChime: playBootChime,
      setMuted: setMuted,
      setBgmMute: setBgmMute,
      setSfxMute: setSfxMute,
      isMuted: isMuted,
      isBgmPlaying: isBgmPlaying
    };
  }

  STM.createSoundManager = createSoundManager;
})(typeof window !== 'undefined' ? window : globalThis);
