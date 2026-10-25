/* =========================================================
 * Slide & Triple — SoundManager（Δ22 混合双轨声学引擎 / FR-050）
 * classic script；向 window.STM 挂载（D-01）
 *
 * 【双轨分工】
 *  ① 外部资产轨（assets/audio/ 8 个 mp3，`HTMLAudioElement`）
 *     · BGM：bgm_lobby（0.45 循环）/ bgm_game（0.38 循环）+ 350ms 交叉淡变
 *     · 事件音效：sfx_win（延迟 250ms + 压低 BGM）/ sfx_lose
 *     · 语音夸赞：sfx_voice_good / great / unbelievable（T109 消费）
 *     · 多声道实例池（碎裂音效 pool=4，连续三消不掐头）+ playbackRate 变调
 *  ② Web Audio 实时合成轨（零文件、零解码延迟）
 *     · 交互级：提牌+落槽（点击飞入）/ 双叩（受阻反弹）/ 落牌涟漪（开局编舞）
 *       —— Δ26 起全部改为「白瓷/竹木麻将物理碰撞」口径，与三消碎裂声同族
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
    bgm_lobby:  { file: 'bgm_lobby.mp3',            kind: 'bgm', volume: 0.45 },
    bgm_game:   { file: 'bgm_game.mp3',             kind: 'bgm', volume: 0.38 },
    shatter:    { file: 'sfx_shatter.mp3',          kind: 'sfx', pool: 4, volume: 0.85 },
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
  var DEAL_TICK_MIN_MS = 45;/* 落牌涟漪最小触发间隔（Δ23：22→45ms，满载只余 8~12 声） */

  /* =========================================================
   * Δ26 交互音声学参数（白瓷/竹木麻将物理碰撞口径）
   * 《Tile Explorer》《Vita Mahjong》式：极短瞬态 + 温润短共鸣，零滑音。
   * 全部为「物理量」而非「旋律量」——刻意不做大幅度扫频。
   * ========================================================= */
  var TAP = {
    /* 第一声 0ms：提牌（指尖叩击白瓷牌面） */
    clickMs: 12,          /* 高频脆响噪声长度 */
    clickBpf: 2400,       /* 脆响带通中心频率（与 match 兜底的 2600Hz 同族） */
    clickQ: 3.5,          /* 高 Q → 有音高的「咔」，不是「嘶」 */
    clickPeak: 0.45,
    clickAtkMs: 2,        /* 2ms 内达峰 = 指尖触感，无软起音 */
    bodyF0: 520,          /* 温润瓷木共鸣：起始频率 */
    bodyF1: 580,          /* 28ms 内微升至 580Hz（仅轻微定音，绝不气泡滑音） */
    bodyGlideMs: 28,
    bodyPeak: 0.55,
    bodyMs: 45,           /* 共鸣衰减总长（干净利落，无延音） */
    /* 第二声 115ms：落槽（麻将牌嵌入磨砂/木质卡槽） */
    dockAt: 0.115,
    dockF0: 380,
    dockF1: 290,
    dockMs: 32,
    dockPeak: 0.40,
    dockNoiseMs: 8,
    dockNoiseBpf: 1600
  };

  var KNOCK = {
    /* 受阻：原地轻磕两下的「哒-哒」（Double Crisp Wood/Tile Knock） */
    gap: 0.055,           /* 两声间隔 */
    dur: 0.028,           /* 单次敲击总时长上限——极度干脆，零拖尾 */
    glideMs: 25,          /* freq → freq*0.85 的微降时长 */
    glideRatio: 0.85,
    bpf: 1400,            /* 瞬态冲击噪声带通中心频率 */
    bpfQ: 2.2,
    noiseMs: 8,
    noiseMix: 0.35,       /* 噪声相对主体峰值的比例（微冲击，不抢戏） */
    f1: 310, g1: 0.55,    /* 第一下：牌面受阻 */
    f2: 260, g2: 0.38     /* 第二下：原地回弹归位 */
  };

  /* 供自测/调试读取的只读配置快照（tools/audio-smoke.js 消费） */
  STM.AUDIO_CONFIG = {
    dir: AUDIO_DIR,
    fadeMs: FADE_MS,
    duckVolume: DUCK_VOL,
    dealTickMinMs: DEAL_TICK_MIN_MS,
    tap: TAP,
    knock: KNOCK,
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
      kickBgm();              /* 起播被 autoplay 策略拦下 → 就地重试一次 */
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
      /* 压缩总线（SFX 防爆音）
       * Δ23/Bug4：-18dB / 8:1 会把峰值 0.65 的点击音再压掉 ~12dB，
       * 增益提升全被吃掉 → 放宽到 -12dB / 5:1，只削真正的叠加过载。 */
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -12;
      master.knee.value = 16;
      master.ratio.value = 5;
      master.attack.value = 0.002;
      master.release.value = 0.18;
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
        if (bgmWant && !bgmMuted) kickBgm();
        return;
      }
      unlocked = true;
      /* 首次交互后自动起播目标 BGM（未静音时——FR-050 §3） */
      if (bgmWant && !bgmMuted) { startBgmKey(bgmWant); kickBgm(); }
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

    /* Δ23/Bug1: BGM 播放态兜底自愈（幂等，正在播时零开销）
     *
     * 覆盖三类「接线正确但仍无声」的真实场景：
     *   ① 首次 play() 被 autoplay 策略 reject（unlock 时 play 的 Promise 已 catch 掉，
     *      但没有第二次尝试的机会）；
     *   ② 切后台回来被浏览器/系统策略性 pause，而 bgmPlayingKey 仍是该轨；
     *   ③ 设置里刚把「背景音乐」拨回开（bgmMuted=false 但目标轨仍 paused）。
     * 只要 !bgmMuted && 当前场景轨 paused → 立刻 .play() 并复位到目标音量。 */
    function kickBgm() {
      if (!unlocked || bgmMuted || !bgmWant) return false;
      var st = ext[bgmWant];
      if (!st) return false;
      if (st.status === 'failed') { startBgmKey(bgmWant); return false; }
      if (st.status !== 'ready' || !st.el) return false;
      if (bgmPlayingKey !== bgmWant) { startBgmKey(bgmWant); return true; }
      var el = st.el;
      var wasPaused = !!el.paused;
      if (wasPaused) {
        try {
          el.loop = true;
          var p = el.play();
          if (p && typeof p.catch === 'function') p.catch(function () { });
        } catch (e) { return false; }
      }
      fadeVolume(bgmWant, bgmTarget(bgmWant), FADE_MS, false);
      return wasPaused;
    }

    /* document 级【常驻】手势监听（刻意不做一次性移除）：
     * 用户每一次点击都顺手把 BGM 拉回播放态——这是大厅 100% 立刻响起的最终保险。 */
    function bindBgmKick() {
      var doc = global.document;
      if (!doc || !doc.addEventListener) return;
      function onGesture() { kickBgm(); }
      try {
        doc.addEventListener('pointerdown', onGesture, true);
        doc.addEventListener('click', onGesture, true);
        doc.addEventListener('keydown', onGesture, true);
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

    /* 噪声冲击（时长, 峰值, 延迟, 高通频率）
     * Δ23/Bug4：原实现 setValueAtTime(vol) 是**零起音硬起**，波形在 t0 处
     * 从 0 瞬跳到 vol，产生宽带爆裂 click —— 这是「刺耳」的物理来源之一。
     * 现补 6ms（或 dur 的 1/4）线性起音，任何调用点都不会再有硬边。 */
    function noise(dur, vol, delay, highpass) {
      if (!ctx || sfxMuted || !noiseBuf) return;
      var t0 = ctx.currentTime + (delay || 0);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      var g = ctx.createGain();
      var f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = highpass || 400;
      var atk = Math.min(0.006, dur * 0.25);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    }

    /* =========================================================
     * ⑥ Δ22/FR-050 §6~§8：交互级合成音效（零文件、零延迟）
     *   Δ26 声学口径：全部按「白瓷 / 竹木麻将物理碰撞」设计——
     *   极短瞬态（8~12ms）+ 温润短共鸣（≤45ms），MUST NOT 出现
     *   超过 ±60Hz 的大幅度滑音或 >100ms 的拖尾延音。
     * ========================================================= */

    /* §6 点击飞入 —— 白瓷/竹木麻将「提牌 + 落槽」双段式（Δ26 彻底重做）
     *
     * 旧版（已废除）：260→680Hz / 65ms 指数上滑 + 2× 三角泛音同扫 ——
     *   「拔塞气泡」式长滑音，电子玩具感强，与三消碎裂的物理质感割裂。
     *
     * 新版（《Tile Explorer》口径）：两段都是**极短物理瞬态**，全程零滑音——
     *   第一声 0ms 提牌：
     *     ① 高频脆响层：12ms 白噪 + 2400Hz/Q3.5 带通，
     *        2ms 达峰 0.45 → 12ms 指数衰到 0.001（指尖叩白瓷「咔」）
     *     ② 温润瓷木共鸣层：三角波 + 正弦波同时 520→580Hz（28ms 微升，
     *        仅做轻微定音），共享包络 0.55 在 45ms 内衰完（短木琴体感）
     *   第二声 115ms 落槽（卡牌飞入 #dock 的瞬间）：
     *     正弦 + 三角 380→290Hz / 32ms 轻叩，峰 0.40，
     *     叠 8ms / 1600Hz 带通微噪点（磨砂卡槽的「沙」感），干脆无拖尾。 */
    function playTap() {
      if (!ctx) unlock();
      if (!ctx || sfxMuted) return false;
      try {
        var t0 = ctx.currentTime + 0.001;
        var i;

        /* ── 第一声 ①：高频脆响层（Transient Click）── */
        if (noiseBuf) {
          var nz = ctx.createBufferSource();
          nz.buffer = noiseBuf;
          var nbp = ctx.createBiquadFilter();
          nbp.type = 'bandpass';
          nbp.frequency.setValueAtTime(TAP.clickBpf, t0);
          nbp.Q.setValueAtTime(TAP.clickQ, t0);
          var ng = ctx.createGain();
          ng.gain.setValueAtTime(0.0001, t0);
          ng.gain.linearRampToValueAtTime(TAP.clickPeak, t0 + TAP.clickAtkMs / 1000);
          ng.gain.exponentialRampToValueAtTime(0.001, t0 + TAP.clickMs / 1000);
          nz.connect(nbp); nbp.connect(ng); ng.connect(master);
          /* 随机读偏移：连续点击时瞬态波形不逐次重合，避免「机关枪」感 */
          nz.start(t0, Math.random() * 0.8);
          nz.stop(t0 + TAP.clickMs / 1000 + 0.002);
        }

        /* ── 第一声 ②：温润瓷木共鸣层（Body Resonance）── */
        var bodyEnv = ctx.createGain();
        bodyEnv.gain.setValueAtTime(0.0001, t0);
        bodyEnv.gain.linearRampToValueAtTime(TAP.bodyPeak, t0 + 0.003);
        bodyEnv.gain.exponentialRampToValueAtTime(0.001, t0 + TAP.bodyMs / 1000);
        bodyEnv.connect(master);

        /* 三角波 45% + 正弦 55%（合成权重和为 1 → 包络峰值即 0.55） */
        var bodyMix = [['triangle', 0.45], ['sine', 0.55]];
        for (i = 0; i < bodyMix.length; i++) {
          var bo = ctx.createOscillator();
          var bw = ctx.createGain();
          bo.type = bodyMix[i][0];
          bw.gain.value = bodyMix[i][1];
          bo.frequency.setValueAtTime(TAP.bodyF0, t0);
          bo.frequency.exponentialRampToValueAtTime(TAP.bodyF1, t0 + TAP.bodyGlideMs / 1000);
          bo.connect(bw); bw.connect(bodyEnv);
          bo.start(t0); bo.stop(t0 + TAP.bodyMs / 1000 + 0.003);
        }

        /* ── 第二声：115ms 落槽（Dock Knock）── */
        var t1 = t0 + TAP.dockAt;
        var dockEnv = ctx.createGain();
        dockEnv.gain.setValueAtTime(0.0001, t1);
        dockEnv.gain.linearRampToValueAtTime(TAP.dockPeak, t1 + 0.003);
        dockEnv.gain.exponentialRampToValueAtTime(0.001, t1 + TAP.dockMs / 1000);
        dockEnv.connect(master);

        var dockMix = [['sine', 0.60], ['triangle', 0.40]];
        for (i = 0; i < dockMix.length; i++) {
          var doo = ctx.createOscillator();
          var dw = ctx.createGain();
          doo.type = dockMix[i][0];
          dw.gain.value = dockMix[i][1];
          doo.frequency.setValueAtTime(TAP.dockF0, t1);
          doo.frequency.exponentialRampToValueAtTime(TAP.dockF1, t1 + TAP.dockMs / 1000);
          doo.connect(dw); dw.connect(dockEnv);
          doo.start(t1); doo.stop(t1 + TAP.dockMs / 1000 + 0.003);
        }

        /* 落槽微噪点：8ms / 1600Hz 带通，峰 0.12（约主体 30%，只给「沙」感） */
        if (noiseBuf) {
          var dnz = ctx.createBufferSource();
          dnz.buffer = noiseBuf;
          var dbp = ctx.createBiquadFilter();
          dbp.type = 'bandpass';
          dbp.frequency.setValueAtTime(TAP.dockNoiseBpf, t1);
          dbp.Q.setValueAtTime(1.6, t1);
          var dng = ctx.createGain();
          dng.gain.setValueAtTime(0.0001, t1);
          dng.gain.linearRampToValueAtTime(0.12, t1 + 0.0015);
          dng.gain.exponentialRampToValueAtTime(0.001, t1 + TAP.dockNoiseMs / 1000);
          dnz.connect(dbp); dbp.connect(dng); dng.connect(master);
          dnz.start(t1, Math.random() * 0.8);
          dnz.stop(t1 + TAP.dockNoiseMs / 1000 + 0.002);
        }
        return true;
      } catch (e) { return false; }
    }

    /* 单次硬牌面微碰（内部辅助）——「叩」一声的全部材料：
     *   · 三角波固定在 freq，25ms 内只微降到 freq*0.85（微降=实心感，绝不滑音）
     *   · 8ms / 1400Hz 带通瞬态冲击噪声（牌面撞击的「硬边」）
     *   · 总时长严格 28ms，stop 与包络终点同一时刻 → 零拖尾
     * 两声之间的音高与力度差（310/0.55 → 260/0.38）制造「第一下受阻、
     * 第二下回弹归位」的物理叙事。 */
    function triggerKnock(delaySec, freq, peakGain) {
      if (!ctx) return;
      var at = ctx.currentTime + 0.001 + (delaySec || 0);

      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, at);
      o.frequency.exponentialRampToValueAtTime(freq * KNOCK.glideRatio, at + KNOCK.glideMs / 1000);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peakGain, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, at + KNOCK.dur);
      o.connect(g); g.connect(master);
      o.start(at); o.stop(at + KNOCK.dur);

      /* 瞬态冲击噪声（微冲击：只取主体峰值的 35%） */
      if (noiseBuf) {
        var nz = ctx.createBufferSource();
        nz.buffer = noiseBuf;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(KNOCK.bpf, at);
        bp.Q.setValueAtTime(KNOCK.bpfQ, at);
        var ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, at);
        ng.gain.linearRampToValueAtTime(peakGain * KNOCK.noiseMix, at + 0.0015);
        ng.gain.exponentialRampToValueAtTime(0.001, at + KNOCK.noiseMs / 1000);
        nz.connect(bp); bp.connect(ng); ng.connect(master);
        nz.start(at, Math.random() * 0.8);
        nz.stop(at + KNOCK.noiseMs / 1000 + 0.002);
      }
    }

    /* §7 受阻反弹 —— 麻将牌原地轻磕两下的「哒-哒」（Δ26 彻底重做）
     *
     * 旧版（已废除）：三角波 210→135Hz / 150ms + 24Hz LFO 频偏 + 2 次阻尼泛音
     *   —— 低频弹簧震荡滑音，是「电子玩具」听感的另一个主要来源，
     *   且 150ms 的拖尾与受阻瞬间 ±3px 的微震动画（约 60ms）不同步。
     *
     * 新版（《Vita Mahjong》《Tile Explorer》口径）：两声极快、极干脆的
     *   硬牌面微碰（Double Crisp Wood/Tile Knock），单声 28ms：
     *     第 1 声 0ms    310Hz / 0.55 —— 牌面受阻的第一下清脆轻碰
     *     第 2 声 55ms   260Hz / 0.38 —— 原地回弹归位的第二下轻碰
     *   整体 83ms 收尾，与 ±3px 微震动画、三消碎裂声完美契合。 */
    function playBlock() {
      if (!ctx) unlock();
      if (!ctx || sfxMuted) return false;
      try {
        triggerKnock(0, KNOCK.f1, KNOCK.g1);
        triggerKnock(KNOCK.gap, KNOCK.f2, KNOCK.g2);
        return true;
      } catch (e) { return false; }
    }

    /* §8 开局落牌涟漪（Deal Domino Ticks）
     *   Δ23/Bug3 彻底重写——旧版「28ms 正弦 + 2.4× 三角泛音 + 380→760Hz 大跨度
     *   上滑 + 22ms 节流」的问题不是单声太长，而是**声数太多**：满载 141 张牌时
     *   0.8s 内约 37 声首尾相接，叠成一条连续电子扫频，听起来像刻意配音。
     *
     *   新口径：极短促、干脆、自然的「木质/骨牌微触声」（Soft Dry Wood Tap）
     *     · 单次总时长 22ms，快速指数衰减，**零拖尾延音**
     *     · 正弦 320→180Hz 极速下沉（木头/骨牌被轻叩的实心感），
     *       越靠后越低沉：f0 = 320-70p、f1 = 180-40p
     *     · 800Hz 低通削掉一切高频毛刺，只留「叩」的木头质感
     *     · 去掉全部 2.4× 三角泛音（旧版「塑料感」来源）
     *     · 全局节流 45ms → 满载一场只余 8~12 声，密度回到「点缀」而非「音阶」 */
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
      var f0 = 320 - 70 * p;   /* 320 → 250Hz */
      var f1 = 180 - 40 * p;   /* 180 → 140Hz */
      try {
        var t0 = ctx.currentTime + 0.001;

        var o = ctx.createOscillator();
        var g = ctx.createGain();
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 800;   /* 木质低通：高频毛刺一律不留 */
        lp.Q.value = 0.7;

        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t0);
        o.frequency.exponentialRampToValueAtTime(f1, t0 + 0.020); /* 20ms 极速下沉 */

        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.003);    /* 3ms 起音——干脆 */
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.022);  /* 22ms 归零——无拖尾 */

        o.connect(lp); lp.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + 0.022);
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
      /* 飞出 / 受阻：Δ26 起由 playTap() / playBlock() 独占（见 §6 §7），
       * 原「320→960Hz 上行扫频」「140Hz 三角下沉」两条滑音兜底已彻底废除，
       * 不留任何可被误触发的电子玩具音色。 */
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
      /* 冰封解冻：正弦水滴气泡融化声（Δ23/Bug4 彻底重写）
       * 旧版 noise(0.2, 0.16, 0, 1800) + tone('sine', 1400, 900, ...)：
       *   1800Hz 高通噪声 + 1400Hz 正弦正踩在 2~5kHz 等响曲线最敏感区，
       *   感知响度比点击音高 20~25dB，所以「刺耳且过大」。
       * 现改为两声低域正弦气泡（480→620Hz / 70ms / 0.22，
       * 再叠一声 320→380Hz / 50ms / 0.10 的「水膜破裂」）——
       * 零 sawtooth、零 square、零 >1000Hz 成分。 */
      iceBreak: function () {
        tone('sine', 480, 620, 0.07, 0.22, 0.000);
        tone('sine', 320, 380, 0.05, 0.10, 0.035);
      },
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
        /* 交互级：飞出 → 提牌+落槽 / 受阻 → 双叩（FR-050 §6 §7，Δ26 白瓷口径） */
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
        /* Δ23/Bug1：开关拨回「开」→ 立刻按当前场景起播（不等下一次手势） */
        startBgmKey(bgmWant);
        kickBgm();
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
        kickBgm();
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
    bindBgmKick();           /* Δ23/Bug1：常驻手势自愈（每一次点击都兜底一次） */
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
      kickBgm: kickBgm,        /* Δ23/Bug1：手动兜底一次（设置面板/调试面板切开关时用） */
      /* Δ25 性能：预热 AudioContext。
       * `new AudioContext()` 实测 self 166~344ms（probes/cpu-prof.js）。
       * 原先它只在第一声落牌时被惰性创建 → 开局发牌动画被顶出 300ms 卡顿。
       * 调用方应在**关卡加载之前**（开机动画期间）调一次；建出来只是
       * suspended 状态，首次手势由 unlock() 的 resume() 唤醒，合规性不变。 */
      warmup: function () { return ensureCtx(); },
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
