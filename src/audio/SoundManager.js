/* =========================================================
 * Slide & Triple — SoundManager（Δ22 混合双轨声学引擎 / FR-050）
 * classic script；向 window.STM 挂载（D-01）
 *
 * 【双轨分工】
 *  ① 外部资产轨（assets/audio/ 8 个 mp3，`HTMLAudioElement`）
 *     · BGM：bgm_lobby（0.26 循环）/ bgm_game（0.20 循环）+ 350ms 交叉淡变
 *     · 事件音效：sfx_win（延迟 250ms + 压低 BGM）/ sfx_lose
 *     · 语音夸赞：sfx_voice_good / great / unbelievable（T109 消费）
 *     · 多声道实例池（碎裂音效 pool=4，连续三消不掐头）+ playbackRate 变调
 *  ② Web Audio 实时合成轨（零文件、零解码延迟）
 *     · 交互级：ber~（点击起飞）/ deng~（受阻反弹）/ 落牌涟漪（开局编舞）
 *     · 开机和弦 playBootChime（FR-038 §4）
 *     · 程序化治愈系 BGM —— bgm_*.mp3 缺失/解码失败时的强制兜底（FR-037 §5）
 *
 * 【加载方式红线（FR-050 §2）】
 *  MUST 使用 `new Audio(src)` + `preload="auto"`；
 *  **MUST NOT 使用 fetch + decodeAudioData** —— `file://` 下 `Origin: null`
 *  必触发 CORS，音频全线失效并击穿宪章「双击秒开」红线（SC-003）。
 *  同理 MUST NOT 用 createMediaElementSource 把外部 mp3 接入 Web Audio
 *  图（跨源媒体会输出静音），外部轨音量一律走 `element.volume`。
 *
 * 【降级】
 *  单文件 error / play() reject → 静默降级（音效回退同语义合成音、
 *  BGM 回退程序化合成），MUST NOT 抛错阻塞主循环。
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* =========================================================
   * 常量：外部资产清单（路径白名单 —— 宪章 v3.0.0 原则 III）
   * ========================================================= */
  var AUDIO_DIR = 'assets/audio/';

  var ASSETS = {
    bgm_lobby:  { file: 'bgm_lobby.mp3',            kind: 'bgm', volume: 0.26 },
    bgm_game:   { file: 'bgm_game.mp3',             kind: 'bgm', volume: 0.20 },
    shatter:    { file: 'sfx_shatter.mp3',          kind: 'sfx', pool: 4, volume: 0.55 },
    win:        { file: 'sfx_win.mp3',              kind: 'sfx', pool: 1, volume: 0.70 },
    lose:       { file: 'sfx_lose.mp3',             kind: 'sfx', pool: 1, volume: 0.62 },
    voice_good: { file: 'sfx_voice_good.mp3',       kind: 'sfx', pool: 2, volume: 0.85 },
    voice_great:{ file: 'sfx_voice_great.mp3',      kind: 'sfx', pool: 2, volume: 0.85 },
    voice_unbelievable: { file: 'sfx_voice_unbelievable.mp3', kind: 'sfx', pool: 2, volume: 0.85 }
  };

  var KEYS = ['bgm_lobby', 'bgm_game', 'shatter', 'win', 'lose',
    'voice_good', 'voice_great', 'voice_unbelievable'];

  var FADE_MS = 350;        /* BGM 交叉淡变时长（Δ22：350ms 平滑过渡） */
  var DUCK_VOL = 0.08;      /* 通关时 bgm_game 压低到的绝对音量 */
  var DUCK_FADE_MS = 240;   /* 压低/恢复的过渡时长 */
  var DEAL_TICK_MIN_MS = 22;/* 落牌涟漪最小触发间隔（节流防爆音） */

  /* 供自测/调试读取的只读配置快照（tools/audio-smoke.js 消费） */
  STM.AUDIO_CONFIG = {
    dir: AUDIO_DIR,
    fadeMs: FADE_MS,
    duckVolume: DUCK_VOL,
    dealTickMinMs: DEAL_TICK_MIN_MS,
    bgmVolume: { lobby: ASSETS.bgm_lobby.volume, game: ASSETS.bgm_game.volume },
    files: (function () {
      var out = {};
      for (var i = 0; i < KEYS.length; i++) out[KEYS[i]] = ASSETS[KEYS[i]].file;
      return out;
    })()
  };

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clampRate(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 1;
    return v < 0.5 ? 0.5 : (v > 2 ? 2 : v);
  }

  function createSoundManager(opts) {
    opts = opts || {};
    var ctx = null;
    var master = null;
    var noiseBuf = null;
    var muted = !!opts.muted;

    /* Δ16c: BGM / SFX 静音粒度分离（FR-040 §1）——muted 为派生兼容位 */
    var bgmMuted = opts.bgmMuted != null ? !!opts.bgmMuted : muted;
    var sfxMuted = opts.sfxMuted != null ? !!opts.sfxMuted : muted;

    var unlocked = false;     /* 首次用户交互标志（autoplay 合规门） */

    /* ---------- 外部资产轨状态 ---------- */
    var ext = {};             /* key → { status, el, pool, next, fade } */
    var bgmWant = null;       /* 目标 BGM：'bgm_lobby' | 'bgm_game' | null */
    var bgmDucked = false;    /* 通关压低态 */
    var bgmPlayingKey = null; /* 'bgm_lobby' | 'bgm_game' | 'procedural' */
    var pendingTimers = [];   /* 已排定的延迟触发（静音 MUST 一并取消） */
    var pendingChannels = {}; /* Δ22b/T109: 具名延迟通道（语音档位升级时只播最终档） */

    /* ---------- 合成轨（程序化治愈系 BGM 兜底）---------- */
    var bgmGain = null;
    var bgmTimer = null;
    var bgmPlaying = false;
    var bgmNextBeat = 0;
    var bgmBar = 0;

    function nowMs() {
      return (global.performance && global.performance.now)
        ? global.performance.now()
        : Date.now();
    }

    /* =========================================================
     * ① 外部资产轨：加载 / 状态机 / 实例池
     * ========================================================= */
    function initExternal() {
      for (var i = 0; i < KEYS.length; i++) {
        var key = KEYS[i];
        var cfg = ASSETS[key];
        var st = { status: 'loading', el: null, pool: [], next: 0, fade: 0 };
        ext[key] = st;
        if (cfg.kind === 'bgm') {
          st.el = makeAudio(key, cfg);
          if (st.el) {
            st.el.loop = true;
            st.el.volume = 0;
            st.pool = [st.el];
          }
        } else {
          var n = cfg.pool || 1;
          for (var j = 0; j < n; j++) {
            var el = makeAudio(key, cfg);
            if (el) st.pool.push(el);
          }
          st.el = st.pool[0] || null;
        }
        if (!st.el) st.status = 'failed';
      }
    }

    /* 单个 HTMLAudioElement 构造 + 就绪/失败状态迁移（FR-050 §2） */
    function makeAudio(key, cfg) {
      if (!global.Audio) return null;
      var el = null;
      try { el = new global.Audio(); } catch (e) { return null; }
      try {
        el.preload = 'auto';
        if (el.setAttribute) el.setAttribute('playsinline', '');
        el.addEventListener('loadeddata', onLoaded);
        el.addEventListener('canplaythrough', onLoaded);
        el.addEventListener('error', onError);
        el.src = AUDIO_DIR + cfg.file; /* 触发预加载（file:// 下同样有效） */
      } catch (e2) { return null; }

      function onLoaded() {
        var st = ext[key];
        if (!st || st.status === 'ready') return;
        st.status = 'ready';
        /* BGM 就绪 → 若正是当前目标轨道则补起播（首次交互已发生时） */
        if (cfg.kind === 'bgm' && bgmWant === key && unlocked && !bgmMuted) {
          startBgmKey(key);
        }
      }

      function onError() {
        var st = ext[key];
        if (!st) return;
        st.status = 'failed'; /* 静默降级——不抛错、不阻塞主循环 */
        if (cfg.kind === 'bgm' && bgmWant === key && unlocked && !bgmMuted) {
          startBgmKey(key); /* 回退程序化 BGM（FR-037 §5 强制兜底） */
        }
      }

      return el;
    }

    /* 取一个空闲实例（池内轮转——连续触发可叠放、互不掐头） */
    function pickInstance(st) {
      var pool = st.pool;
      if (!pool || !pool.length) return null;
      var len = pool.length;
      if (len === 1) return pool[0];
      for (var k = 0; k < len; k++) {
        var idx = (st.next + k) % len;
        var el = pool[idx];
        if (el && (el.paused || el.ended)) {
          st.next = (idx + 1) % len;
          return el;
        }
      }
      var fallback = pool[st.next % len];
      st.next = (st.next + 1) % len;
      return fallback;
    }

    /* =========================================================
     * ② BGM 双轨管理：交叉淡变 / 压低 / 可见性
     * ========================================================= */
    function bgmTarget(key) {
      var base = ASSETS[key].volume;
      if (bgmDucked && key === 'bgm_game') return Math.min(base, DUCK_VOL);
      return base;
    }

    function pauseEl(el) {
      try { el.pause(); } catch (e) { /* 忽略 */ }
    }

    /* element.volume 逐帧插值（HTMLAudioElement 不支持线性 ramp） */
    function fadeVolume(key, to, ms, pauseAfter) {
      var st = ext[key];
      if (!st || !st.el) return;
      var el = st.el;
      if (st.fade) { global.clearInterval(st.fade); st.fade = 0; }
      var from = el.volume;
      if (Math.abs(from - to) <= 0.002) {
        el.volume = clamp01(to);
        if (pauseAfter && to <= 0.002) pauseEl(el);
        return;
      }
      var dur = ms > 0 ? ms : 1;
      var t0 = nowMs();
      st.fade = global.setInterval(function () {
        var k = (nowMs() - t0) / dur;
        if (k >= 1) {
          el.volume = clamp01(to);
          global.clearInterval(st.fade);
          st.fade = 0;
          if (pauseAfter && to <= 0.002) pauseEl(el);
          return;
        }
        el.volume = clamp01(from + (to - from) * k);
      }, 16);
    }

    function fadeOutAllExternalBgm() {
      for (var i = 0; i < KEYS.length; i++) {
        var key = KEYS[i];
        if (ASSETS[key].kind !== 'bgm') continue;
        fadeVolume(key, 0, FADE_MS, true);
      }
    }

    /* 起播指定 BGM 轨（外部优先；缺失/失败回退程序化） */
    function startBgmKey(key) {
      var st = ext[key];
      if (!st) return;

      if (st.status === 'ready') {
        stopProceduralBgm(); /* 外部轨接管 → 停掉兜底合成，杜绝叠音 */
        for (var i = 0; i < KEYS.length; i++) {
          var other = KEYS[i];
          if (ASSETS[other].kind !== 'bgm' || other === key) continue;
          fadeVolume(other, 0, FADE_MS, true); /* 反向轨同步淡出 */
        }
        var el = st.el;
        el.loop = true;
        bgmPlayingKey = key;
        if (el.paused) {
          try {
            var p = el.play();
            if (p && typeof p.catch === 'function') {
              p.catch(function () { /* autoplay 未解锁 → 静默等待下次交互 */ });
            }
          } catch (e) { /* 静默 */ }
        }
        fadeVolume(key, bgmTarget(key), FADE_MS, false);
        return;
      }

      if (st.status === 'failed') {
        fadeOutAllExternalBgm();
        bgmPlayingKey = 'procedural';
        startProceduralBgm();
        applyProceduralGain();
        return;
      }
      /* status === 'loading' → 由 onLoaded 回调补起播 */
    }

    /* 对外：playBgm('lobby' | 'game') */
    function playBgm(track) {
      var key = track === 'game' ? 'bgm_game' : (track === 'lobby' ? 'bgm_lobby' : null);
      bgmWant = key;
      if (!key) {
        fadeOutAllExternalBgm();
        stopProceduralBgm();
        bgmPlayingKey = null;
        return;
      }
      bgmDucked = false;
      if (bgmMuted) return;   /* 只记录意图——解除静音后补播 */
      if (!unlocked) return;  /* 首次交互前 MUST NOT 发声（FR-050 §3） */
      startBgmKey(key);
    }

    /* 通关压低（FR-050 §4：sfx_win 触发同时压低 BGM） */
    function duckBgm(on) {
      bgmDucked = !!on;
      if (!bgmPlayingKey || bgmPlayingKey === 'procedural') return;
      fadeVolume(bgmPlayingKey, bgmTarget(bgmPlayingKey), DUCK_FADE_MS, false);
    }

    /* =========================================================
     * ③ 音效播放（实例池 + 变调 + 降级）
     * ========================================================= */
    function fireSfx(name, o) {
      var cfg = ASSETS[name];
      var st = ext[name];
      if (!cfg || !st) return false;
      if (st.status !== 'ready') { synthFallback(name, o); return false; }
      var el = pickInstance(st);
      if (!el) { synthFallback(name, o); return false; }
      try {
        /* 变调不变速（连击升调——T109 传入 rate） */
        el.preservesPitch = false;
        el.mozPreservesPitch = false;
        el.webkitPreservesPitch = false;
        el.playbackRate = clampRate(o && o.rate != null ? o.rate : 1);
        el.volume = clamp01(o && o.volume != null ? o.volume : cfg.volume);
        try { el.currentTime = 0; } catch (e0) { /* 未就绪时部分浏览器抛错 */ }
        var p = el.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function () { synthFallback(name, o); });
        }
        return true;
      } catch (err) {
        synthFallback(name, o);
        return false;
      }
    }

    /* 外部资产不可用 → 同语义合成音兜底（静默、不抛错） */
    function synthFallback(name, o) {
      if (sfxMuted) return;
      if (!ctx) {
        ensureCtx();       /* 兜底也需要 AudioContext——惰性补建（失败则静默） */
        if (!ctx) return;
      }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
      if (name === 'shatter') { SFX.match(o && o.combo); return; }
      if (name === 'win') { SFX.victory(); return; }
      if (name === 'lose') { SFX.defeat(); return; }
      /* voice_* 无合成兜底 → 静默降级（不发声） */
    }

    function removePending(id) {
      for (var i = 0; i < pendingTimers.length; i++) {
        if (pendingTimers[i] === id) { pendingTimers.splice(i, 1); return; }
      }
    }

    function cancelPending() {
      for (var i = 0; i < pendingTimers.length; i++) {
        try { global.clearTimeout(pendingTimers[i]); } catch (e) { /* 忽略 */ }
      }
      pendingTimers = [];
      pendingChannels = {};
    }

    /* 取消某个具名通道上尚未播放的延迟触发（T109 ③ 语音升级去叠放） */
    function cancelChannel(ch) {
      if (!ch || !pendingChannels[ch]) return false;
      var id = pendingChannels[ch];
      try { global.clearTimeout(id); } catch (e) { /* 忽略 */ }
      removePending(id);
      delete pendingChannels[ch];
      return true;
    }

    /* 对外：playSfx(name, { rate, delay, duck, volume, combo, channel }) */
    function playSfx(name, o) {
      o = o || {};
      if (sfxMuted) return false;
      if (!ASSETS[name]) return false;
      var delay = o.delay || 0;
      if (delay > 0) {
        /* 同一通道再次排定 → 取消上一条（只播最终档位，避免叠放成噪音） */
        if (o.channel) cancelChannel(o.channel);
        var id = global.setTimeout(function () {
          removePending(id);
          if (o.channel && pendingChannels[o.channel] === id) delete pendingChannels[o.channel];
          if (sfxMuted) return; /* 静音后漏音防线 */
          if (o.duck) duckBgm(true);
          fireSfx(name, o);
        }, delay);
        pendingTimers.push(id);
        if (o.channel) pendingChannels[o.channel] = id;
        return true;
      }
      if (o.duck) duckBgm(true);
      return fireSfx(name, o);
    }

    /* 对外：playShatter(rate) —— 三消碎裂瞬发 + 连击升调（T109 ①）
     * rate 由 GameState 的 comboChanged.playbackRate 提供，MUST NOT 在此推断档位。 */
    function playShatter(rate) {
      return playSfx('shatter', { rate: rate });
    }

    /* 对外：playVoice(tier) —— tier 1/2/3 = good/great/unbelievable（T109 ②）
     * 也接受契约字符串 'good' | 'great' | 'unbelievable'。
     * 内部固定延迟 120ms（错开碎裂瞬态），并占用 'voice' 通道：
     * 120ms 内连击再次升级时上一档未播语音被取消（只播最终档）。 */
    var VOICE_BY_TIER = { 1: 'voice_good', 2: 'voice_great', 3: 'voice_unbelievable' };
    var VOICE_BY_NAME = { good: 'voice_good', great: 'voice_great', unbelievable: 'voice_unbelievable' };
    function playVoice(tier, o) {
      o = o || {};
      var name = VOICE_BY_TIER[tier] || VOICE_BY_NAME[tier];
      if (!name) return false;
      var opts = {
        delay: o.delay != null ? o.delay : 120,
        rate: o.rate,
        volume: o.volume,
        channel: 'voice'
      };
      return playSfx(name, opts);
    }

    /* =========================================================
     * ④ 合成轨：AudioContext 惰性创建与解锁
     * ========================================================= */
    function ensureCtx() {
      if (ctx) return true;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
      } catch (e) { ctx = null; return false; }
      /* 压缩总线（SFX 防爆音） */
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -18;
      master.knee.value = 20;
      master.ratio.value = 8;
      master.attack.value = 0.003;
      master.release.value = 0.2;
      master.connect(ctx.destination);
      /* BGM 专用 gain（与 SFX 压缩总线隔离） */
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.16;
      bgmGain.connect(ctx.destination);
      /* 白噪声 buffer（1s，单声道） */
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    }

    /* 首次交互解锁（autoplay 合规门）：
     * 即使无 Web Audio（ctx 建不起来），外部轨也必须能播——故 unlocked
     * 与 ctx 成功与否解耦。 */
    function unlock() {
      if (ctx && ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* 忽略 */ }
      }
      if (!ctx) ensureCtx();
      if (unlocked) {
        if (bgmWant && !bgmMuted && bgmPlayingKey !== bgmWant) startBgmKey(bgmWant);
        return;
      }
      unlocked = true;
      /* 首次交互后自动起播目标 BGM（未静音时——FR-050 §3） */
      if (bgmWant && !bgmMuted) startBgmKey(bgmWant);
    }

    /* window 级一次性 pointerdown / keydown 解锁（用户首次交互即唤醒） */
    function bindUnlockOnce() {
      if (!global.addEventListener) return;
      function fire() {
        unlock();
        try { global.removeEventListener('pointerdown', fire, true); } catch (e) { }
        try { global.removeEventListener('keydown', fire, true); } catch (e) { }
      }
      try {
        global.addEventListener('pointerdown', fire, true);
        global.addEventListener('keydown', fire, true);
      } catch (e) { /* 忽略 */ }
    }

    /* =========================================================
     * ⑤ 合成轨基础原语
     * ========================================================= */
    /* 单振荡器音符（type, f0→f1 扫频, 时长, 峰值, 延迟, 声道） */
    function tone(type, f0, f1, dur, vol, delay, channel) {
      if (!ctx) return;
      if (channel === 'bgm' ? bgmMuted : sfxMuted) return;
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }

    /* 噪声冲击（时长, 峰值, 延迟, 高通频率） */
    function noise(dur, vol, delay, highpass) {
      if (!ctx || sfxMuted || !noiseBuf) return;
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
     * ⑥ Δ22/FR-050 §6~§8：交互级合成音效（零文件、零延迟）
     * ========================================================= */

    /* §6 点击飞入 ber~（Tile Tap Pop）
     *   0~65ms 260Hz → 680Hz 指数上滑（圆润正弦「拔塞气泡」）
     *   8ms 起音 / 75ms 衰减归零
     *   +120ms 软木入槽轻叩（180→90Hz / 40ms 正弦）—— 卡牌落入 #dock 瞬间 */
    function playTap() {
      if (!ctx) unlock();
      if (!ctx || sfxMuted) return false;
      try {
        var t0 = ctx.currentTime + 0.001;

        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, t0);
        osc.frequency.exponentialRampToValueAtTime(680, t0 + 0.065);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.30, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
        osc.connect(g); g.connect(master);
        osc.start(t0); osc.stop(t0 + 0.09);

        /* 泛音层（2× 三角，极轻——增加「啵」的颗粒感，不刺耳） */
        var osc2 = ctx.createOscillator();
        var g2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(520, t0);
        osc2.frequency.exponentialRampToValueAtTime(1360, t0 + 0.065);
        g2.gain.setValueAtTime(0.0001, t0);
        g2.gain.exponentialRampToValueAtTime(0.055, t0 + 0.010);
        g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.060);
        osc2.connect(g2); g2.connect(master);
        osc2.start(t0); osc2.stop(t0 + 0.075);

        /* 120ms 后：软木入槽低频轻叩（180→90Hz / 40ms） */
        var t1 = t0 + 0.120;
        var o3 = ctx.createOscillator();
        var g3 = ctx.createGain();
        o3.type = 'sine';
        o3.frequency.setValueAtTime(180, t1);
        o3.frequency.exponentialRampToValueAtTime(90, t1 + 0.040);
        g3.gain.setValueAtTime(0.0001, t1);
        g3.gain.exponentialRampToValueAtTime(0.15, t1 + 0.005);
        g3.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.042);
        o3.connect(g3); g3.connect(master);
        o3.start(t1); o3.stop(t1 + 0.06);
        return true;
      } catch (e) { return false; }
    }

    /* 弹性阻尼泛音（deng~ 的「回弹两下」单颗） */
    function bounce(at, f0, vol, dur) {
      if (!ctx) return;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.86, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(master);
      o.start(at); o.stop(at + dur + 0.02);
    }

    /* §7 受阻反弹 deng~（Blocked Bounce）
     *   三角波 210Hz → 135Hz（150ms 下沉）+ 24Hz 轻频偏
     *   + 2 次弹性阻尼泛音（一「开」一「合」，与 ber~ 盲听可区分） */
    function playBlock() {
      if (!ctx) unlock();
      if (!ctx || sfxMuted) return false;
      try {
        var t0 = ctx.currentTime + 0.001;

        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(210, t0);
        osc.frequency.exponentialRampToValueAtTime(135, t0 + 0.150);

        /* 轻微频率调制（橡胶弹簧 Q 弹感——绝不刺耳） */
        var lfo = ctx.createOscillator();
        var lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 24;
        lfoGain.gain.value = 9;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.26, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.155);
        osc.connect(g); g.connect(master);
        osc.start(t0); osc.stop(t0 + 0.17);
        lfo.start(t0); lfo.stop(t0 + 0.17);

        /* 2 次阻尼泛音（木鱼/木琴低音回弹） */
        bounce(t0 + 0.052, 152, 0.075, 0.045);
        bounce(t0 + 0.100, 138, 0.055, 0.040);
        return true;
      } catch (e) { return false; }
    }

    /* §8 开局落牌涟漪（Deal Domino Ticks）
     *   progress ∈ [0,1] → 380Hz 平滑爬升至 760Hz；28ms 温润木琴/白玉轻叩
     *   音量 0.12 极轻；>= 22ms 最小间隔节流（8×8×5 满载不糊成噪音） */
    var lastDealTickAt = -1e9;
    function playDealTick(progress) {
      var t = nowMs();
      if (t - lastDealTickAt < DEAL_TICK_MIN_MS) return false;
      lastDealTickAt = t;
      if (!ctx) unlock();
      if (!ctx || sfxMuted) return false;
      var p = progress;
      if (typeof p !== 'number' || !isFinite(p)) p = 0;
      p = p < 0 ? 0 : (p > 1 ? 1 : p);
      var f = 380 + (760 - 380) * p;
      try {
        var t0 = ctx.currentTime + 0.001;

        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(f * 1.06, t0 + 0.028);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.028);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + 0.04);

        /* 泛音层（2.4× 三角，极轻——白玉/木琴的木质光泽） */
        var o2 = ctx.createOscillator();
        var g2 = ctx.createGain();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(f * 2.4, t0);
        g2.gain.setValueAtTime(0.0001, t0);
        g2.gain.exponentialRampToValueAtTime(0.030, t0 + 0.003);
        g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.020);
        o2.connect(g2); g2.connect(master);
        o2.start(t0); o2.stop(t0 + 0.03);
        return true;
      } catch (e) { return false; }
    }

    /* =========================================================
     * ⑦ Δ14/FR-037：程序化治愈系 BGM（外部资产缺失时的强制兜底）
     * ========================================================= */
    var PENTA = [
      261.63, 293.66, 329.63, 392.00, 440.00, /* C4 D4 E4 G4 A4 */
      523.25, 587.33, 659.25, 783.99, 880.00  /* C5 D5 E5 G5 A5 */
    ];

    var CHORDS = [
      [130.81, 164.81, 196.00], /* C3 E3 G3 */
      [110.00, 130.81, 164.81], /* A2 C3 E3 */
      [174.61, 220.00, 261.63], /* F3 A3 C4 */
      [196.00, 246.94, 293.66]  /* G3 B3 D4 */
    ];

    var ARP = [
      [0, 2, 4, 5],
      [4, 5, -1, 6],
      [2, 4, 6, 7],
      [6, 5, 4, -1],
      [1, 3, 5, 6],
      [5, 7, -1, 8],
      [4, 6, 8, 9],
      [8, 6, 5, 4]
    ];

    var BEAT_MS = 480;
    var BAR_BEATS = 4;
    var TOTAL_BARS = 8;
    var LOOKAHEAD_BEATS = 3;

    function bgmNote(freq, when, vol) {
      var osc = ctx.createOscillator();
      var osc2 = ctx.createOscillator();
      var g = ctx.createGain();
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2400;
      f.Q.value = 0.8;
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 2;
      var g2 = ctx.createGain();
      g2.gain.value = 0.22;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.85);
      osc.connect(f);
      osc2.connect(g2); g2.connect(f);
      f.connect(g);
      g.connect(bgmGain);
      osc.start(when); osc.stop(when + 0.9);
      osc2.start(when); osc2.stop(when + 0.9);
    }

    function bgmPad(freqs, when, dur) {
      for (var i = 0; i < freqs.length; i++) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        var f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        osc.type = 'triangle';
        osc.frequency.value = freqs[i];
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.05, when + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, when + dur);
        osc.connect(f); f.connect(g); g.connect(bgmGain);
        osc.start(when); osc.stop(when + dur + 0.05);
      }
    }

    function scheduleAhead() {
      if (!ctx || !bgmPlaying) return;
      var now = ctx.currentTime;
      var horizon = now + (LOOKAHEAD_BEATS * BEAT_MS) / 1000 + 0.25;
      while (bgmNextBeat < horizon * 1000) {
        var when = bgmNextBeat / 1000;
        var beatInBar = Math.round((bgmNextBeat / BEAT_MS)) % BAR_BEATS;
        var barIdx = Math.floor(Math.round(bgmNextBeat / BEAT_MS) / BAR_BEATS) % TOTAL_BARS;
        var noteIdx = ARP[barIdx][beatInBar];
        if (noteIdx >= 0) {
          var vol = 0.20 + (noteIdx >= 6 ? 0.05 : 0);
          bgmNote(PENTA[noteIdx], when, vol);
        }
        if (beatInBar === 0) {
          var chord = CHORDS[Math.floor(barIdx / 2) % CHORDS.length];
          bgmPad(chord, when, (BAR_BEATS * BEAT_MS) / 1000 * 1.05);
        }
        bgmNextBeat += BEAT_MS;
        if (bgmNextBeat > 1e12) bgmNextBeat = ctx.currentTime * 1000;
      }
    }

    function startProceduralBgm() {
      if (!ctx || !bgmGain || bgmPlaying) return;
      bgmPlaying = true;
      bgmNextBeat = ctx.currentTime * 1000 + 120;
      bgmBar = 0;
      scheduleAhead();
      if (bgmTimer) clearInterval(bgmTimer);
      bgmTimer = setInterval(scheduleAhead, 200);
    }

    function stopProceduralBgm() {
      bgmPlaying = false;
      if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    }

    function applyProceduralGain() {
      if (!ctx || !bgmGain) return;
      bgmGain.gain.setTargetAtTime(bgmMuted ? 0 : 0.16, ctx.currentTime, 0.08);
    }

    /* =========================================================
     * ⑧ 音色表（合成轨兜底 + 机制音效；T083 碎裂为 shatter 兜底）
     * ========================================================= */
    var SFX = {
      /* 点击: 880Hz 短方波 */
      click: function () { tone('square', 880, 880, 0.08, 0.12); },
      /* 飞出: 上行扫频（Δ22 起改由 playTap 的 ber~ 承担，保留兜底） */
      flyout: function () { tone('sine', 320, 960, 0.28, 0.16); },
      /* 受阻: 三角下沉 + 噪声冲击（Δ22 起改由 playBlock 的 deng~ 承担） */
      blocked: function () {
        tone('triangle', 140, 90, 0.22, 0.22);
        noise(0.12, 0.18, 0, 300);
      },
      /* T083 三消: 薄瓷/冰晶脆裂 + 高频愉悦泛音颗粒（shatter 合成兜底） */
      match: function (combo) {
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
        var scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
        var idx0 = Math.min(scale.length - 1, Math.max(0, ((combo || 1) - 1) % scale.length));
        var delays = [0, 0.022, 0.048, 0.075];
        for (var gi = 0; gi < delays.length; gi++) {
          var f = scale[(idx0 + gi) % scale.length];
          tone('sine', f, f, 0.04, 0.10, delays[gi]);
          tone('triangle', f * 2, f * 2, 0.03, 0.04, delays[gi]);
        }
      },
      /* 胜利: 大三和弦琶音（win 合成兜底） */
      victory: function () {
        tone('sine', 523.25, 523.25, 0.16, 0.15, 0.00);
        tone('sine', 659.25, 659.25, 0.16, 0.15, 0.12);
        tone('sine', 783.99, 783.99, 0.16, 0.15, 0.24);
        tone('sine', 1046.5, 1046.5, 0.34, 0.17, 0.36);
      },
      /* 失败: 下行（lose 合成兜底） */
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

    /* 事件 → 音效映射（game-session.md §5；GameState onEvent 转发） */
    function play(name, arg) {
      if (sfxMuted) return;
      if (!ctx) unlock();
      switch (name) {
        /* 交互级：飞出 → ber~ / 受阻 → deng~（FR-050 §6 §7） */
        case 'flyout': playTap(); return;
        case 'blocked': playBlock(); return;
        /* 事件级：碎裂 / 通关 / 失败走外部资产轨（缺失时合成兜底） */
        case 'match': playSfx('shatter', { combo: arg }); return;
        case 'victory': playSfx('win'); return;
        case 'defeat': playSfx('lose'); return;
        default:
          var fn = SFX[name];
          if (fn) fn(arg);
      }
    }

    /* =========================================================
     * ⑨ Δ16d/T066: 开机合成和弦（零文件——宪章 v3.0.0 原则 III ③）
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
          var startAt = t0 + i * 0.06;
          tone(nt.type, nt.f, nt.f, nt.d, nt.v, startAt - ctx.currentTime);
          tone('triangle', nt.f * 2, nt.f * 2, nt.d * 0.7, nt.v * 0.25, startAt - ctx.currentTime);
        }
        tone('triangle', 2093.0, 2093.0, 0.14, 0.05, 0.26);
        return true;
      } catch (err) {
        return false;
      }
    }

    /* =========================================================
     * ⑩ 静音联动 / 可见性
     * ========================================================= */
    function setBgmMute(m) {
      bgmMuted = !!m;
      muted = bgmMuted || sfxMuted;
      if (bgmMuted) {
        fadeOutAllExternalBgm();
        stopProceduralBgm();
        bgmPlayingKey = null;
      } else if (unlocked && bgmWant) {
        startBgmKey(bgmWant);
      }
      applyProceduralGain();
    }

    function setSfxMute(m) {
      sfxMuted = !!m;
      muted = bgmMuted || sfxMuted;
      if (sfxMuted) cancelPending(); /* 已排定的延迟触发一并取消（无漏音） */
    }

    /* 兼容: 单开关 = 同时置两者（Δ14 既有口径，M4 调试面板仍走此） */
    function setMuted(m) {
      muted = !!m;
      bgmMuted = !!m;
      sfxMuted = !!m;
      if (bgmMuted) {
        fadeOutAllExternalBgm();
        stopProceduralBgm();
        bgmPlayingKey = null;
      } else if (unlocked && bgmWant) {
        startBgmKey(bgmWant);
      }
      if (sfxMuted) cancelPending();
      applyProceduralGain();
    }

    function isMuted() { return muted; }
    function isBgmPlaying() { return !!bgmPlayingKey; }

    /* visibilitychange → hidden 暂停 / 恢复按开关续播（FR-050 §11） */
    function handleVisibility() {
      if (!global.document) return;
      if (global.document.hidden) {
        fadeOutAllExternalBgm();
        stopProceduralBgm();
        if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) { } }
      } else {
        if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
        if (unlocked && !bgmMuted && bgmWant) startBgmKey(bgmWant);
      }
    }

    /* ---------- 初始化 ---------- */
    initExternal();          /* 8 个文件即刻 preload（file:// 亦有效） */
    bindUnlockOnce();
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', handleVisibility);
    }

    return {
      /* 生命周期 */
      unlock: unlock,
      /* 统一播放入口 */
      play: play,
      playSfx: playSfx,
      playShatter: playShatter,
      playVoice: playVoice,
      playBgm: playBgm,
      duckBgm: duckBgm,
      /* 交互级合成音效（T107 / 供 T111 逐牌消费） */
      playTap: playTap,
      playBlock: playBlock,
      playDealTick: playDealTick,
      playBootChime: playBootChime,
      /* 开关 */
      setMuted: setMuted,
      setBgmMute: setBgmMute,
      setSfxMute: setSfxMute,
      isMuted: isMuted,
      isBgmPlaying: isBgmPlaying,
      /* 自测/调试可观测态（tools/audio-smoke.js 消费） */
      getStatus: function () {
        var out = {};
        for (var i = 0; i < KEYS.length; i++) {
          var k = KEYS[i];
          out[k] = {
            status: ext[k] ? ext[k].status : 'idle',
            file: ASSETS[k].file,
            volume: ext[k] && ext[k].el ? ext[k].el.volume : 0,
            instances: ext[k] && ext[k].pool ? ext[k].pool.length : 0
          };
        }
        return out;
      },
      getBgmState: function () {
        return {
          want: bgmWant,
          playing: bgmPlayingKey,
          ducked: bgmDucked,
          unlocked: unlocked,
          muted: bgmMuted
        };
      }
    };
  }

  STM.createSoundManager = createSoundManager;
})(typeof window !== 'undefined' ? window : globalThis);
