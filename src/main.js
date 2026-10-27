/* =========================================================
 * Slide & Triple — 应用入口（boot / 编排）
 * classic script；向 window.STM 挂载（D-01）
 * 禁止 import/export 语法、动态 import()、fetch（宪章 II）
 * 输入统一 pointerdown/pointerup（宪章 IV 红线——禁 touchstart/mousedown）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM = global.STM || {};

  var els = {};
  var session = null;
  var renderer = null;
  var sound = null;
  var currentLevel = null;
  var currentId = 1;
  var dockReadyHooked = false; /* Δ15b3e: Dock 贴图就绪回调仅注册一次（防逐关累积） */
var lastDockSnapshot = null; /* Δ20/T093: 上一帧 Dock 花色快照（用于定位消除槽） */
/* Δ27b/T128: 碎裂驻留窗口——#dock 的 DOM 在此窗口内禁止被 innerHTML 重建覆盖，
 * 否则 180ms 的 `.slot-shattering` 演出会被紧随其后的 remove/flyout 事件立刻抹掉。
 * 窗口结束时统一重绘一次（状态取当前真值，不需要中间帧）。 */
var dockFreezeUntil = 0;
var dockFreezeTimer = null;
/* Δ28a: `match` 事件在**点击结算瞬间**下发（RulesEngine.applyTap 是原子的），
 * 此时第 3 张牌往往还在飞——旧实现直接 spawnDockShatter，观感是「牌没到就碎」。
 * 现改为：match 时若仍有在途牌 → 挂起，逐张落定后先用 ghost 把槽位画成有牌态，
 * 全部落定再爆发。`dockGhost` 只影响 DOM 渲染，不碰引擎态。 */
var pendingShatter = null;
var pendingShatterTimer = null;
/* Δ28e: 待消槽「id → 槽序号」镜像。
 *
 * 为什么必须有它：`RulesEngine.applyTap` 是**原子结算**——`applyTap` 返回时
 * `state.dock` 里 3 张牌已经被移除，`match` 事件此刻才下发。所以无论 `match`
 * 处理器怎么读 `session.state().dock` 或 `lastDockSnapshot`（由 renderDock 写、
 * 而 renderDock 已被 `dock`/`flyout` 事件刷成移除后的样子），**都拿不到这 3 张
 * 牌原本落在哪 3 个槽位**——旧实现只能退化成「取最左边 3 个有牌槽」，于是碎片
 * 恒定从左侧爆开（用户实测「都是统一在左侧落下」）。
 *
 * 修法：按事件序在本地重放 `dockInsert` / `remove` 语义，`match` 时镜像里仍是
 * 移除前的序列，`indexOf` 即为真实槽位。镜像 MUST 与引擎同步更新，
 * 任何漏更（换关 / 重置 / Undo / 洗牌）都会让它漂移。 */
var dockMirror = [];
var dockGhost = null; /* { map: { slotIndex: suit } } —— 碎裂前/期间槽位的有牌态 */

  /* =========================================================
   * T050: 进度持久化（data-model.md §8，D-03 隐私模式降级）
   * localStorage 全访问 try/catch；不可用时内存进度照常可玩
   * ========================================================= */
  var PROGRESS_KEY = 'slide-triple:progress:v1';
  /* clearedLevels = 已通关关卡号集合（Δ20 Bug 1 修复）。
   * 与 profile v2 的 firstClear 账本**同源互补**：firstClear 只在真实通关
   * 结算时写入，跳关 / 深链 / 老存档下二者会发散——故本字段按并集维护，
   * 大厅晶片点亮态据此反推，避免「关卡 12 却拼图 0/4」的脱节。 */
  var progress = { v: 1, unlocked: 1, last: 1, best: {}, muted: false, clearedLevels: [] };
  var storageUsable = true;

  function loadProgress() {
    try {
      var raw = global.localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.v === 1) {
          var max = (STM.LEVELS || []).length || 1;
          progress.unlocked = Math.min(Math.max(1, p.unlocked | 0), max); /* 钳制 ≤LEVELS.length（Δ4） */
          progress.last = Math.min(Math.max(1, p.last | 0), max);
          progress.best = p.best && typeof p.best === 'object' ? p.best : {};
          progress.muted = !!p.muted;
          progress.clearedLevels = normalizeCleared(p.clearedLevels, max);
        }
      }
    } catch (e) { storageUsable = false; } /* 隐私模式/禁用 → 内存进度（D-03） */
  }

  /* clearedLevels 归一化：去重 + 升序 + 钳制 1..max（脏数据不可信） */
  function normalizeCleared(list, max) {
    var out = [], seen = {};
    if (!list || !list.length) return out;
    for (var i = 0; i < list.length; i++) {
      var v = parseInt(list[i], 10);
      if (isNaN(v) || v < 1) continue;
      if (v > max) v = max;
      if (!seen[v]) { seen[v] = 1; out.push(v); }
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /* 把 profile v2 的 firstClear 账本并入 progress.clearedLevels——
   * 二者是「已通关集合」的两个来源，取并集即完整（Δ20 Bug 1）。 */
  function syncClearedFromProfile() {
    try {
      if (!STM.Profile) return;
      var fc = STM.Profile.get().firstClear || {};
      var max = (STM.LEVELS || []).length || 1;
      var merged = normalizeCleared(progress.clearedLevels.concat(Object.keys(fc)), max);
      if (merged.length !== progress.clearedLevels.length) {
        progress.clearedLevels = merged;
        saveProgress();
      }
    } catch (e) { /* 存储不可用 → 内存态照常（D-03） */ }
  }

  /* 有效已通关最大关卡号（Δ20 Bug 1 权威口径）——
   * max(unlocked-1, currentLevel-1, ...clearedLevels)。
   * 与 profile 的同名函数同口径——此处仅作进度态的便捷视图，
   * 晶片点亮态的实际判定走 STM.Profile.pieceUnlockFlags。 */
  function maxPassedLevel() {
    if (STM.Profile && STM.Profile.maxPassedLevel) {
      return STM.Profile.maxPassedLevel({
        unlocked: progress.unlocked,
        currentLevel: currentId,
        clearedLevels: progress.clearedLevels
      });
    }
    return Math.max((progress.unlocked || 1) - 1, (currentId || 1) - 1);
  }

  function saveProgress() {
    try {
      global.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (e) { storageUsable = false; } /* 写失败静默降级 */
  }

  function recordWin(id, score, combo) {
    progress.unlocked = Math.max(progress.unlocked, Math.min(id + 1, (STM.LEVELS || []).length));
    var b = progress.best[id];
    if (!b || score > b.score) progress.best[id] = { score: score, combo: combo };
    else if (score === b.score && combo > (b.combo || 0)) progress.best[id] = { score: score, combo: combo };
    progress.last = id;
    markCleared(id); /* Δ20 Bug 1：记入已通关集合（供大厅晶片点亮态反推） */
    syncClearedFromProfile();
    saveProgress();
  }

  /* 记入已通关关卡（去重，保持升序） */
  function markCleared(id) {
    var v = parseInt(id, 10);
    if (isNaN(v) || v < 1) return;
    var max = (STM.LEVELS || []).length || 1;
    if (v > max) v = max;
    var cl = progress.clearedLevels || [];
    for (var i = 0; i < cl.length; i++) if (cl[i] === v) return;
    cl.push(v);
    progress.clearedLevels = normalizeCleared(cl, max);
  }

  function setMuted(m) {
    progress.muted = m;
    if (sound) sound.setMuted(m);
    saveProgress();
  }

  /* Δ23/Bug1：设置面板 / 调试面板把「背景音乐」拨回【开】时，立即按当前界面起播。
   * 旧实现只调 setBgmMute(false) → startBgmKey 内部 el.play() 一旦被 autoplay
   * 策略 reject 就再无第二次机会，表现为「开关打开了还是没声」。
   * 这里显式 playBgm(当前场景) + kickBgm() 双保险；关闭分支由
   * setBgmMute(true) 负责淡出并 pause()，故本函数只在「开」时动作。 */
  function resumeBgmNow() {
    if (!sound) return;
    var on = true;
    try {
      var s = STM.Profile.get().settings;
      on = !s || s.bgm !== false;
    } catch (e) { on = true; }
    if (!on) return;
    if (sound.playBgm) sound.playBgm(isScene(SCENE.LOBBY) ? 'lobby' : 'game');
    if (sound.kickBgm) sound.kickBgm();
  }

  /* =========================================================
   * T020: boot 流程与 LEVELS.length 动态化（Δ4——禁止硬编码关数）
   * ========================================================= */
  /* =========================================================
   * Δ16e/T068 §1: 应用级场景状态机
   *   BOOT → SPLASH → LOBBY → GAME → (RESULT →) LOBBY / GAME
   * 大厅与局内**互斥切换**（Edge Case 铁律：MUST NOT 出现大厅与局内并存
   * 的叠加态，模态弹窗除外）——本函数是唯一的场景切换入口。
   * ========================================================= */
  var SCENE = { BOOT: 'BOOT', SPLASH: 'SPLASH', LOBBY: 'LOBBY', GAME: 'GAME', RESULT: 'RESULT' };
  var scene = SCENE.BOOT;

  function isScene(s) { return scene === s; }

  /* 进入主大厅（大厅与局内互斥——隐藏 HUD/棋盘/Dock/道具栏与旧结算层） */
  function enterLobby(opts) {
    opts = opts || {};
    /* Δ20 Bug 2 修复：场景切换 MUST 关闭失败层——失败层 z-index:26 且底衬
     * 完全不透明，若在「重新开始 / 返回主大厅」后残留，会盖死新场景，
     * 表现为按钮「点了毫无反应」。失败层是唯一独立于大厅/局内的模态层，
     * 故在此处（唯一的场景切换入口）统一 teardown，与 Lobby.hide() 并列。 */
    if (STM.Fail) STM.Fail.hide();
    if (STM.Tutorial) STM.Tutorial.dismiss();
    var app = global.document.getElementById('app');
    if (app) app.classList.add('scene-lobby');
    scene = SCENE.LOBBY;
    stopBgStage();
    /* Δ22/T106 ⑥: 返回大厅 → 切回 bgm_lobby（350ms 交叉淡变，非硬切） */
    if (sound) sound.playBgm('lobby');
    if (STM.Lobby) {
      STM.Lobby.show({
        unlocked: opts.unlocked || progress.unlocked,
        level: opts.level || progress.last || progress.unlocked,
        /* Δ20 Bug 1：已通关关卡集合——大厅据此反推晶片点亮态 */
        clearedLevels: progress.clearedLevels,
        debugOpen: els.debugPanel ? !els.debugPanel.hidden : false,
        handlers: lobbyHandlers()
      });
    }
  }

  /* 进入局内（隐藏大厅；HUD/棋盘/Dock/道具栏恢复） */
  function enterGame(id) {
    /* Δ20 Bug 2 修复：同上——进入局内前关闭残留失败层（幂等） */
    if (STM.Fail) STM.Fail.hide();
    if (STM.Tutorial) STM.Tutorial.dismiss();
    var app = global.document.getElementById('app');
    if (app) app.classList.remove('scene-lobby');
    if (STM.Lobby) STM.Lobby.hide();
    scene = SCENE.GAME;
    /* Δ22/T106 ⑥: 进入关卡 → bgm_lobby 淡出 / bgm_game 淡入（同 350ms） */
    if (sound) sound.playBgm('game');
    loadLevel(id);
  }

  function lobbyHandlers() {
    return {
      onSettings: function () { openSettingsModal(false); },
      onProfile: function () { openProfileModal(function () { if (STM.Lobby) STM.Lobby.refresh(lobbyRefreshOpts()); }); },
      onPlay: function (id) { enterGame(id); },
      onToggleDebug: function () {
        /* 大厅与局内共用同一份调试面板开关状态（Edge Case 铁律） */
        if (!els.debugPanel) return false;
        els.debugPanel.hidden = !els.debugPanel.hidden;
        return !els.debugPanel.hidden;
      }
    };
  }

  /* ---------- Δ16e/T069: 设置 / 个人信息弹窗入口 ---------- */
  function openSettingsModal(inGame) {
    if (!STM.Modals) return null;
    return STM.Modals.openSettings(!!inGame, {
      /* 与 FR-037 的 BGM/音效静音联动口径一致（BGM 与 SFX 独立粒度） */
      onAudio: function () {
        try {
          var s = STM.Profile.get().settings;
          if (sound.setBgmMute) sound.setBgmMute(!s.bgm);
          if (sound.setSfxMute) sound.setSfxMute(!s.sfx);
          if (els.debugMute) els.debugMute.checked = !!(s.bgm && s.sfx);
          progress.muted = !(s.bgm && s.sfx);
          renderMuteBtn();
          /* Δ23/Bug1：拨回「开」→ 立刻按当前界面响起（不等下一次手势） */
          resumeBgmNow();
        } catch (e) { /* 存储不可用 → 内存态照常（D-03） */ }
      },
      onBackToLobby: function () { enterLobby({ unlocked: progress.unlocked, level: progress.last }); },
      onRestart: function () { enterGame(currentId); }
    });
  }

  function openProfileModal(onChange) {
    if (!STM.Modals) return null;
    return STM.Modals.openProfile({
      onChange: function () {
        /* 头像在所有引用处同步生效（单一数据源——大厅/结算/失败页） */
        if (onChange) onChange();
      },
      /* 「确认」= 保存点：全局刷新所有引用头像的地方 */
      onConfirm: function () {
        syncAvatarEverywhere();
      }
    });
  }

  /* Δ19c/T085: 局内顶栏左侧两个按钮
   * 【↩ 返回大厅】直接切场景（保留关卡进度，幂等 teardown）
   * 【⚙️ 设置】复用大厅同一设置弹窗（audio / 返回大厅 / 重开均可用） */
  function bindHudButtons() {
    if (els.btnLobby) {
      els.btnLobby.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        enterLobby({ unlocked: progress.unlocked, level: progress.last });
      });
    }
    if (els.btnSettings) {
      els.btnSettings.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openSettingsModal(true);
      });
    }
  }

  /* 大厅刷新参数（Δ20 Bug 1：携带已通关集合 → 晶片点亮态反推） */
  function lobbyRefreshOpts() {
    return {
      unlocked: progress.unlocked,
      level: progress.last,
      clearedLevels: progress.clearedLevels
    };
  }

  /* 全局同步头像（大厅头像按钮 / 徽标探头 / 结算铭牌 / 失败页 / 传送门展板）
   * —— 单一数据源（profile v2），零副本不同步（FR-040 §2） */
  function syncAvatarEverywhere() {
    try {
      if (STM.Lobby && STM.Lobby.isVisible && STM.Lobby.isVisible()) {
        STM.Lobby.refresh(lobbyRefreshOpts());
      }
    } catch (e) { /* 存储不可用 → 内存态照常（D-03） */ }
  }

  /* ---------- 高级名言预加载过渡屏：真实资源并行预加载 ---------- */
  var PRELOAD_TOTAL = 9;
  var preloadLoaded = 0;
  var preloadDone = false;
  var preloadPromise = null;
  var splashStageReached = false;
  var lobbyPrepared = false;
  var splashProgressCurrent = 0;
  var splashProgressTarget = 0;
  var splashProgressRaf = 0;
  var progressManualMode = false;
  var progressAnimationDone = false;

  function splashProgressTick() {
    splashProgressRaf = 0;
    var diff = splashProgressTarget - splashProgressCurrent;
    if (Math.abs(diff) < 0.001) {
      splashProgressCurrent = splashProgressTarget;
    } else {
      splashProgressCurrent += diff * 0.07;
    }
    var fill = global.document.getElementById('splash-progress-fill');
    if (fill) fill.style.width = (splashProgressCurrent * 100).toFixed(2) + '%';
    if (splashProgressCurrent < splashProgressTarget - 0.001 || splashProgressCurrent > splashProgressTarget + 0.001) {
      splashProgressRaf = global.requestAnimationFrame(splashProgressTick);
    }
  }

  function bumpPreloadProgress() {
    preloadLoaded++;
    if (progressManualMode) return;
    splashProgressTarget = Math.min(1, preloadLoaded / PRELOAD_TOTAL);
    if (!splashProgressRaf) splashProgressRaf = global.requestAnimationFrame(splashProgressTick);
  }

  function imgLoadPromise(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = function () { bumpPreloadProgress(); resolve(); };
      img.onload = done;
      img.onerror = done;
      img.src = src;
    });
  }

  function waitForBBoxes() {
    return new Promise(function (resolve) {
      var tries = 0;
      function check() {
        var b = (typeof global.STM_ICON_BBOXES !== 'undefined') ? global.STM_ICON_BBOXES
          : (global.STM && global.STM.ICON_BBOXES ? global.STM.ICON_BBOXES : null);
        if (b) { bumpPreloadProgress(); resolve(); return; }
        if (tries++ > 200) { bumpPreloadProgress(); resolve(); return; }
        global.setTimeout(check, 16);
      }
      check();
    });
  }

  /* Δ25 性能：音频上下文预热。建出来只是 suspended，首次手势由 unlock()
   * 的 resume() 唤醒——autoplay 合规性不变，只是把构造成本挪出编舞窗口。 */
  function warmAudioNow() {
    if (!sound || !sound.warmup) return;
    try { sound.warmup(); } catch (eWarm) { /* 忽略 */ }
  }

  /* Δ25 性能：等图标切片（96 格键控）全部就绪。
   *
   * 【为什么必须等】实测 deal-timeline.js：旧实现里 `enterGame → loadLevel →
   * startDealChoreography` 在 ~520ms 就跑起来了，而 6 张图集的键控要到
   * ~1.7s 才陆续到达（sheet 的 Image 解码耗时），于是键控直接压在落牌编舞上，
   * 把 1000ms 的动画拉长到 2883~3158ms——这就是「开局卡牌落子很卡」。
   * 现在把「准备大厅/局内」整体推到切片就绪之后，编舞再也不会与键控重叠。
   *
   * 【为什么不会拖慢开机】开机遮罩本来就要挂到 3.76s（1.6s 片头 + 2.16s 进度条），
   * 切片在 1.7~1.9s 完成，仍完全落在遮罩窗口内。 */
  function waitIconSlices() {
    return new Promise(function (resolve) {
      if (!STM.IconAssets || !STM.IconAssets.ensureLoaded) { resolve(); return; }
      try { STM.IconAssets.ensureLoaded(); } catch (e) { resolve(); return; }
      var total = (STM.IconAssets.SHEETS && STM.IconAssets.SHEETS.length) || 6;
      var t0 = Date.now();
      (function poll() {
        var n = 0;
        try { n = STM.IconAssets.sheetCount() || 0; } catch (e2) { n = 0; }
        /* 2.5s 兜底：任一张 sheet 404 时不能把开机卡死（键控降级 darken 仍可玩） */
        if (n >= total || Date.now() - t0 > 2500) { resolve(); return; }
        global.setTimeout(poll, 32);
      })();
    });
  }

  function startPreloadResources() {
    if (preloadPromise) return preloadPromise;
    var items = [];
    items.push(imgLoadPromise('assets/bg/lobby_bg.png'));
    items.push(imgLoadPromise('assets/bg/bg1.png'));
    for (var i = 1; i <= 6; i++) items.push(imgLoadPromise('assets/icons/sheet' + i + '.png'));
    items.push(waitForBBoxes());
    preloadPromise = Promise.all(items).then(function () {
      preloadDone = true;
      tryFinishSplashTransition();
      /* Δ25: 大厅/局内准备（含开局编舞）必须排在图标切片之后 */
      return waitIconSlices().then(function () {
        tryPrepareLobby();
        tryFinishSplashTransition();
      });
    });
    return preloadPromise;
  }

  function renderSplashQuote() {
    var quotes = global.STM_QUOTES || (global.STM && global.STM.QUOTES) || [];
    if (!quotes || !quotes.length) return;
    var q = quotes[Math.floor(Math.random() * quotes.length)];
    var textEl = global.document.getElementById('splash-quote-text');
    var authorEl = global.document.getElementById('splash-quote-author');
    if (textEl && q) textEl.textContent = q.text;
    if (authorEl && q) authorEl.textContent = '—— ' + q.author;
  }

  function tryPrepareLobby() {
    if (lobbyPrepared) return;
    lobbyPrepared = true;
    /* 在遮罩仍 100% 时后台完整准备大厅/局内 DOM 与 Canvas */
    var startGame = function () {
      if (deepIdGlobal > 1) enterGame(deepIdGlobal);
      else enterLobby({ unlocked: progress.unlocked, level: progress.last });
    };
    try { startGame(); } catch (e) { /* 隔离 */ }
  }

  function tryFinishSplashTransition() {
    /* Δ25: 追加 lobbyPrepared 门槛——大厅/局内准备已整体推到图标切片之后，
     * 遮罩 MUST 等它完成再淡出，否则会露出空白底。 */
    if (!preloadDone || !splashStageReached || !progressAnimationDone || !lobbyPrepared) return;
    global.setTimeout(function () {
      var splash = global.document.getElementById('splash-screen');
      if (!splash) return;
      splash.classList.add('fade-out');
      global.setTimeout(function () {
        try { splash.parentNode && splash.parentNode.removeChild(splash); } catch (e) { /* 已移除 */ }
      }, 500);
    }, 150);
  }

  var deepIdGlobal = 1;

  function boot() {
    cacheEls();
    startPreloadResources();
    var LEVELS = STM.LEVELS || [];
    if (!LEVELS.length) {
      showError('关卡数据为空（STM.LEVELS 未加载）');
      return;
    }
    loadProgress(); /* T050: LEVELS 就绪后才钳制 unlocked/last（Δ4 动态关数） */

    /* ?level=N 深链（1 ≤ N ≤ LEVELS.length 钳制——Δ4） */
    var deepId = 1;
    try {
      var q = new URLSearchParams(global.location.search);
      var raw = parseInt(q.get('level'), 10);
      if (!isNaN(raw)) deepId = Math.min(Math.max(1, raw), LEVELS.length);
    } catch (e) { /* file:// 下 location.search 恒可读，防御性包裹 */ }
    deepIdGlobal = deepId;

    sound = STM.createSoundManager({});
    if (sound.setMuted && progress.muted) sound.setMuted(progress.muted);

    /* Δ25 性能：AudioContext 预热。
     * `new AudioContext()` 冷启动实测 180ms（隔离测量，probes 内 /tmp/ac-cost.js），
     * 原先它落在**第一声落牌**上（ensureCtx 惰性创建），把发牌顶出 ~300ms 卡顿。
     * 这里在 boot 之后的下一个宏任务里建好——此时 6 张 sheet 还没解码完，
     * 音频线程初始化不会和 JPEG 解码抢 CPU；建出来只是 suspended，
     * 首次手势由 unlock() 的 resume() 唤醒，autoplay 合规性不变。 */
    global.setTimeout(warmAudioNow, 0);

    /* 首次 pointerdown 惰性解锁 AudioContext（autoplay 政策）
     * Δ14/T052f: unlock() 内首交互自动开启治愈系 BGM（FR-037 §2） */
    global.document.addEventListener('pointerdown', function onFirst() {
      if (sound) sound.unlock();
    }, { capture: true });
    /* Δ14: keydown 同样视为首次交互（键盘玩家 BGM 合规解锁） */
    global.document.addEventListener('keydown', function onFirstKey() {
      if (sound) sound.unlock();
    }, { capture: true });

    /* Δ15b3: 视口尺寸变化 → 重铺全视口背景（贴图/氛围层随视口缩放） */
    global.addEventListener('resize', function onResize() {
      paintBg();
    });

    /* Δ29a: 预警横幅「点击即消散」旁观监听（捕获阶段，不消费事件） */
    bindPeakBannerDismiss();

    /* T051: 静音开关（muted 持久化于 progress） */
    if (els.btnMute) {
      els.btnMute.addEventListener('pointerdown', onMuteDown);
      renderMuteBtn();
    }

    /* Δ19c/T085: 顶栏左侧【返回大厅】/【设置】——设置与主大厅同一弹窗 */
    bindHudButtons();

    /* Δ16c/T065: 玩家档案与经济态持久化（profile v2——与 progress v1 并存
     * 不迁移; 纯读取，不改写任何关卡数据——FR-041 §4 铁律） */
    try {
      if (STM.Profile) {
        STM.Profile.load();
        var prof = STM.Profile.get();
        /* Δ16c 音效粒度: BGM / SFX 独立开关（FR-040 §1）——单一 muted
         * 开关仅在两粒度同时关闭时才生效，避免设置弹窗语义丢失 */
        if (sound.setBgmMute) sound.setBgmMute(!prof.settings.bgm);
        if (sound.setSfxMute) sound.setSfxMute(!prof.settings.sfx);
        /* Δ20 Bug 1：并入 profile v2 的 firstClear 账本 → progress.clearedLevels
         * （老存档在 profile v2 键建立前通关的关卡据此补回，点亮态不再脱节） */
        syncClearedFromProfile();
      }
    } catch (eP) { /* 存储不可用 → 内存态照常可玩（D-03） */ }

    /* Δ16d/T066: HooLey Games 开机动画 + 高级名言预加载过渡屏
     * 真实资源并行预加载；动画 1.6s 后过渡至加载阶段；100% 后淡入大厅。 */
    scene = SCENE.SPLASH;
    /* 启动时立即执行真实预加载 */
    startPreloadResources();
    if (STM.Splash) {
      STM.Splash.show({
        sound: sound,
        onStageLoading: function () {
          splashStageReached = true;
          renderSplashQuote();
          /* 确保 stage-loading 类（CSS 驱动） */
          var sp = global.document.getElementById('splash-screen');
          if (sp) sp.classList.add('stage-loading');
          var brand = global.document.getElementById('splash-branding');
          if (brand) brand.classList.add('stage-loading');
          var quote = global.document.getElementById('splash-quote');
          if (quote) quote.classList.add('stage-loading');
          var wrap = global.document.getElementById('splash-progress-wrap');
          if (wrap) wrap.classList.add('stage-loading');
          /* 进度条严格从 0% 补间至 100%（2.0s），避免预加载进度先写满 */
          progressManualMode = true;
          if (splashProgressRaf) {
            try { global.cancelAnimationFrame(splashProgressRaf); } catch (e) { /* 降级 */ }
            splashProgressRaf = 0;
          }
          var fill = global.document.getElementById('splash-progress-fill');
          if (fill) {
            fill.style.transition = 'none';
            fill.style.setProperty('width', '0%', 'important');
            void fill.offsetHeight;
            fill.style.transition = 'width 2000ms cubic-bezier(0.22, 1, 0.36, 1)';
            fill.style.setProperty('width', '100%', 'important');
          }
          global.setTimeout(function () {
            progressAnimationDone = true;
            tryFinishSplashTransition();
          }, 2160);
          tryFinishSplashTransition();
        }
      });
    } else {
      splashStageReached = true;
      renderSplashQuote();
      var fill2 = global.document.getElementById('splash-progress-fill');
      if (fill2) {
        fill2.style.transition = 'width 2000ms cubic-bezier(0.25, 1, 0.5, 1)';
        fill2.style.width = '100%';
      }
      global.setTimeout(function () {
        progressAnimationDone = true;
        tryFinishSplashTransition();
      }, 2000);
      tryFinishSplashTransition();
    }
  }

  function onMuteDown() {
    setMuted(!progress.muted);
    renderMuteBtn();
  }

  function renderMuteBtn() {
    if (!els.btnMute) return;
    if (progress.muted) {
      els.btnMute.textContent = '🔇';
      els.btnMute.classList.add('muted');
    } else {
      els.btnMute.textContent = '🔊';
      els.btnMute.classList.remove('muted');
    }
    if (!storageUsable) els.btnMute.title = '进度无法持久化（存储不可用）';
  }

  function cacheEls() {
    var d = global.document;
    els = {
      hud: d.getElementById('hud'),
      hudNo: d.getElementById('hud-level-no'),
      hudShards: d.getElementById('hud-shards'),
      iqPill: d.getElementById('iq-pill'),
      iqValue: d.getElementById('iq-value'),
      iqDelta: d.getElementById('iq-delta'),
      btnLobby: d.getElementById('btn-lobby'),
      btnSettings: d.getElementById('btn-settings'),
      board: d.getElementById('board'),
      boardWrap: d.getElementById('board-wrap'),
      dock: d.getElementById('dock'),
      items: d.getElementById('items'),
      btnMute: d.getElementById('btn-mute'),
      toast: ensureToast(d),
      /* M4 T053~T058: 调试面板 DOM 元素 */
      debugPanel: d.getElementById('debug-panel'),
      debugToggle: ensureDebugToggle(d),
      debugLevel: d.getElementById('debug-level'),
      debugReset: d.getElementById('debug-reset'),
      debugHint: d.getElementById('debug-hint'),
      debugAuto: d.getElementById('debug-auto'),
      debugInfo: d.getElementById('debug-info'),
      debugMute: d.getElementById('debug-mute'),
      debugIntro: d.getElementById('debug-intro')
    };
  }
  /* M4 T053: 移动端调试面板折叠按钮（PC 端不显示）
   * Δ19c: 图标化放在左下角——避免遮挡顶栏【返回大厅/设置】主按钮 */
  function ensureDebugToggle(d) {
    var t = d.getElementById('debug-toggle');
    if (!t) {
      t = d.createElement('button');
      t.id = 'debug-toggle';
      t.type = 'button';
      t.title = '调试面板';
      t.textContent = '🛠';
      d.getElementById('app').appendChild(t);
    }
    return t;
  }
  function ensureToast(d) {
    var t = d.getElementById('toast');
    if (!t) {
      t = d.createElement('div');
      t.id = 'toast';
      d.getElementById('app').appendChild(t);
    }
    return t;
  }

  /* ---------- Δ18/T071: 棱晶飘字（`-50 棱晶` 扣费反馈） ----------
   * 纯 DOM 飘字（一次性元素 + CSS 动画，动画结束自动移除）——
   * 不复用 toast（toast 为居中横幅语义，与飘字不同）。 */
  function spawnShardFloat(text, anchorEl) {
    var d = global.document;
    var app = d.getElementById('app');
    if (!app) return null;
    var f = d.createElement('div');
    f.className = 'shard-float';
    f.textContent = text;
    f.setAttribute('aria-hidden', 'true');
    /* 锚定道具按钮（无锚点则落在视口中下部） */
    var x = 0, y = 0;
    if (anchorEl && anchorEl.getBoundingClientRect) {
      var r = anchorEl.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top;
    } else {
      x = (app.clientWidth || 360) / 2;
      y = (app.clientHeight || 640) * 0.72;
    }
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    app.appendChild(f);
    /* 动画结束移除（animationend 为主，setTimeout 为兜底） */
    var kill = function () {
      if (f.parentNode) f.parentNode.removeChild(f);
    };
    if (f.addEventListener) f.addEventListener('animationend', kill, { once: true });
    global.setTimeout(kill, 1400);
    return f;
  }

  /* ---------- Δ22b/T110: 连击微光艺术字飘字（`#dock` 正下方） ----------
   * 纯 DOM 一次性元素 + CSS 动画；飘字层 pointer-events:none（MUST NOT 拦截命中），
   * z-index 位于棋盘之上但不遮挡待消槽/棋盘的可点击区域。
   * 锚点：#dock 底边（换算到 #app 坐标系），多条并存时纵向错位不重叠。 */
  var comboFloatLayer = null;
  var comboFloatRows = []; /* 在场飘字（新→旧），最多同时 2 条——避免连锁时铺满棋盘遮挡看牌 */
  var COMBO_FLOAT_MAX = 2;

  function ensureComboFloatLayer(d) {
    if (comboFloatLayer && comboFloatLayer.parentNode) return comboFloatLayer;
    comboFloatLayer = d.getElementById('combo-float-layer');
    if (!comboFloatLayer) {
      comboFloatLayer = d.createElement('div');
      comboFloatLayer.id = 'combo-float-layer';
      comboFloatLayer.setAttribute('aria-hidden', 'true');
      d.getElementById('app').appendChild(comboFloatLayer);
    }
    return comboFloatLayer;
  }

  /* #dock 底边在 #app 坐标系中的 y（布局变化时逐次重算，不缓存） */
  function dockBottomInApp() {
    var app = global.document.getElementById('app');
    if (!app || !els.dock || !els.dock.getBoundingClientRect) return null;
    var ar = app.getBoundingClientRect();
    var dr = els.dock.getBoundingClientRect();
    if (!dr.height) return null;
    return dr.bottom - ar.top;
  }

  function spawnComboFloat(text, tier) {
    if (!text) return null;
    var d = global.document;
    var app = d.getElementById('app');
    if (!app) return null;
    var layer = ensureComboFloatLayer(d);
    var top = dockBottomInApp();
    if (top == null) top = (app.clientHeight || 640) * 0.14;

    var row = d.createElement('div');
    row.className = 'combo-float-row';
    /* 纵向错位：与仍在场的飘字错开（间距 > 胶囊高度）；超过上限先淘汰最旧一条 */
    while (comboFloatRows.length >= COMBO_FLOAT_MAX) {
      var oldest = comboFloatRows.shift();
      if (oldest && oldest.kill) oldest.kill();
    }
    row.style.top = (top + comboFloatRows.length * 36) + 'px';

    var el = d.createElement('div');
    el.className = 'combo-float combo-float-t' + (tier || 2);
    el.textContent = text; /* 文案逐字锁定（FR-050 §9）——不得改写 */
    row.appendChild(el);
    layer.appendChild(row);

    var entry = { row: row, kill: null };
    comboFloatRows.unshift(entry); /* 新条目在队首（错位以在场条数为准） */

    var alive = true;
    var kill = function () {
      if (!alive) return;
      alive = false;
      var at = comboFloatRows.indexOf(entry);
      if (at >= 0) comboFloatRows.splice(at, 1);
      if (row.parentNode) row.parentNode.removeChild(row);
    };
    entry.kill = kill;
    if (el.addEventListener) el.addEventListener('animationend', kill, { once: true });
    global.setTimeout(kill, 1500); /* 兜底（动画被降级/中断时仍回收） */
    return el;
  }

  /* 余额不足 → 按钮轻晃（拒绝扣费、拒绝消耗——FR-041 §2） */
  function shakeItemBtn(btnId) {
    var btn = global.document.getElementById(btnId);
    if (!btn) return;
    btn.classList.remove('is-denied');
    void btn.offsetWidth; /* 强制重排以重启动画 */
    btn.classList.add('is-denied');
  }

  function showError(msg) {
    if (global.console) console.error('[STM]', msg);
  }

  /* =========================================================
   * Δ15b3: 全视口背景舞台（#bg-canvas 底图+氛围 / #fx-canvas 前景粒子）
   * · 底图画布 = 9:16 视口尺寸，贴图 cover 等比铺满居中（不裁切边缘——
   *   源图已去水印且为标准 9:16）
   * · 前景粒子独立画布（pointer-events:none——不拦截操作）
   * · 背景低频重绘（换关/贴图就绪时重铺）+ 粒子 rAF 每帧刷新
   * · 换关即重算 cycleIndex（floor((id-1)/3)）——跳关/Undo 实时生效
   * ========================================================= */
  var bgCanvas = null, bgCtx = null, fxCanvas = null, fxCtx = null;
  var bgLevelId = 0, bgRaf = 0, bgRunning = false;

  function ensureBgCanvases() {
    var d = global.document;
    var app = d.getElementById('app');
    if (!app) return;
    if (!bgCanvas) {
      bgCanvas = d.createElement('canvas');
      bgCanvas.id = 'bg-canvas';
      bgCanvas.setAttribute('aria-hidden', 'true');
      app.insertBefore(bgCanvas, app.firstChild);
    }
    if (!fxCanvas) {
      fxCanvas = d.createElement('canvas');
      fxCanvas.id = 'fx-canvas';
      fxCanvas.setAttribute('aria-hidden', 'true');
      app.insertBefore(fxCanvas, app.firstChild);
    }
    bgCtx = bgCanvas.getContext('2d');
    fxCtx = fxCanvas.getContext('2d');
  }

  /* 视口尺寸同步（9:16 视口——CSS 尺寸 × dpr） */
  function sizeBgCanvases() {
    if (!bgCanvas || !fxCanvas) return;
    var app = global.document.getElementById('app');
    if (!app) return;
    var dpr = Math.max(1, global.devicePixelRatio || 1);
    var w = Math.max(1, Math.round((app.clientWidth || 360) * dpr));
    var h = Math.max(1, Math.round((app.clientHeight || 640) * dpr));
    if (bgCanvas.width !== w || bgCanvas.height !== h) {
      bgCanvas.width = w; bgCanvas.height = h;
    }
    if (fxCanvas.width !== w || fxCanvas.height !== h) {
      fxCanvas.width = w; fxCanvas.height = h;
    }
  }

  /* 重铺底图 + 氛围（换关/贴图就绪/尺寸变化时调用——低频） */
  function paintBg() {
    if (!bgCtx || !STM.BackdropStage) return;
    sizeBgCanvases();
    var W = bgCanvas.width, H = bgCanvas.height;
    bgCtx.clearRect(0, 0, W, H);
    try {
      STM.BackdropStage.drawStage(bgCtx, bgLevelId || currentId || 1, W, H, 0, Math.max(1, global.devicePixelRatio || 1));
    } catch (err) {
      bgCtx.fillStyle = '#2A3568';
      bgCtx.fillRect(0, 0, W, H);
    }
  }

  /* 前景粒子循环（rAF——轻量：每帧仅数十粒，不影响 60fps 棋盘） */
  function bgLoop(now) {
    bgRaf = 0;
    if (!fxCtx || !STM.BackdropStage) return;
    sizeBgCanvases();
    var W = fxCanvas.width, H = fxCanvas.height;
    fxCtx.clearRect(0, 0, W, H);
    try {
      STM.BackdropStage.drawParticles(fxCtx, STM.BackdropStage.familyOf(
        Math.min(19, Math.max(0, Math.floor(((bgLevelId || currentId || 1) - 1) / 3)))
      ), W, H, now, Math.max(1, global.devicePixelRatio || 1));
    } catch (err) { /* 粒子异常静默——不杀循环 */ }
    scheduleBgLoop();
  }

  function scheduleBgLoop() {
    if (bgRaf) return;
    bgRaf = global.requestAnimationFrame(bgLoop);
  }

  function startBgStage(levelId) {
    ensureBgCanvases();
    bgLevelId = levelId || currentId || 1;
    paintBg();
    if (!bgRunning) {
      bgRunning = true;
      scheduleBgLoop();
    }
    /* 贴图就绪 → 惰性换装（重铺底图——程序化底已铺，不闪烁） */
    if (STM.BackdropStage && typeof STM.BackdropStage.onReady === 'function') {
      STM.BackdropStage.onReady(function () { paintBg(); });
    }
  }

  /* Δ17/T068 §1: 进入大厅时停掉局内背景舞台（互斥——避免大厅与局内叠加） */
  function stopBgStage() {
    bgRunning = false;
    if (bgRaf) { cancelAnimationFrame(bgRaf); bgRaf = 0; }
    /* 背景画布保留但清空，避免大厅透出上一关背景 */
    if (bgCtx) bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  }

  /* ---------- 关卡加载（全部关卡总数引用动态取 LEVELS.length——Δ4） ---------- */
  function loadLevel(id) {
    var LEVELS = STM.LEVELS;
    id = Math.min(Math.max(1, id), LEVELS.length); /* 钳制 */
    currentId = id;
    currentLevel = LEVELS[id - 1];

    /* validateLevel 自检（校验失败 → 控制台错误 + 跳过该关，不静默） */
    var v = STM.RulesEngine.validateLevel(currentLevel);
    if (!v.ok) {
      showError('关卡 ' + id + ' 数据校验失败: ' + v.errors.join('; '));
      if (id < LEVELS.length) return loadLevel(id + 1);
      return;
    }

    session = STM.GameState.createSession(currentLevel, {
      onEvent: handleSessionEvent,
      onTerminal: handleTerminal
    });

    /* Δ27b/T128: 换关清掉上一关残留的碎裂驻留窗口（否则新关前 180ms 内 Dock 不重绘） */
    if (dockFreezeTimer) { clearTimeout(dockFreezeTimer); dockFreezeTimer = null; }
    if (pendingShatterTimer) { clearTimeout(pendingShatterTimer); pendingShatterTimer = null; }
    if (preshakeTimer) { clearTimeout(preshakeTimer); preshakeTimer = null; } /* Δ29b: 前摇不得跨关残留 */
    dockFreezeUntil = 0;
    pendingShatter = null;
    dockGhost = null;
    resyncDockMirror(); /* Δ28e: 新一关的待消槽镜像（通常为空） */
    resetPeakBanner(); /* Δ29a: 换关立即清理预警横幅（计时器 + 节点内容，零残留叠层） */

    renderer = STM.createBoardRenderer(els.board, session, {
      onShake: shakeBoard,
      /* Δ27b/T128（FR-053 §6）: 飞行落定回调——目标槽位此刻才切入 `has-tile`。
       * 飞行全程该槽保持 `.slot.empty`（classList 变更次数 = 0），落定同帧一次性
       * 亮起并触发 `dock-seat` 弹入。连续点击时每次落定各自回调，互不覆盖。
       * Δ28a: 若存在挂起的碎裂，先按「已落定」的牌刷新 ghost（逐张可见地落槽），
       * 全部落定后再爆发碎块。 */
      onFlightLand: function () {
        advancePendingShatter();
        renderDock();
        flushPendingShatter(false);
      },
      /* Δ22/T107 ④（FR-050 §8）: 落牌涟漪音回调——T111 的进场编舞每张卡牌
       * 落定时调用（progress ∈ [0,1] 随落牌进度上扬；>= 22ms 节流在
       * SoundManager 内部保证，满载 8×8×5 也不会糊成噪音） */
      onDealTick: function (progress) { if (sound) sound.playDealTick(progress); }
    });
    renderer.setLevel(currentLevel); /* Δ14: 渲染层花色映射/背景随当前关 id 切换 */
    renderer.refresh();
    /* Δ22c/T111+T112: 开局进场编舞——15 种随机抽取、相邻两次不重复；
     * 0~180ms 纯底图留白，180~1000ms 花式落牌（z=4 满载上界；z≤2 典型 820ms），
     * 逐牌落定配落子涟漪音 */
    startDealChoreography();

    /* Δ15/T052i: 贴图就绪惰性换装——Dock chip 同步刷新（棋盘由渲染器
     * markDirty 重绘；贴图后到不闪烁——同关内同 suit 恒同来源）
     * Δ15b3e（Bug A 修复）: 注册仅一次——原实现每进一次关卡就向
     * IconAssets.listeners 追加一个闭包，60 关后回调数组累积 60 项；
     * 且换关期间到达的贴图就绪通知会重复触发 renderDock。
     * 置 dockReadyHooked 后由全局单一回调服务全部关卡。 */
    if (!dockReadyHooked && STM.IconAssets && STM.IconAssets.onSpritesReady) {
      dockReadyHooked = true;
      STM.IconAssets.onSpritesReady(function () {
        if (session && els.dock) renderDock();
      });
    }

    renderHud();
    renderDock();
    renderItems();
    bindBoardInput();
    bindItemInput(); /* T035: 道具栏 + 暂存区输入绑定 */
    resetIq(); /* Δ19c/T085: 每关 IQ 重置为 90（纯局内表现态，不持久化） */

    /* Δ19e/T087: L1/L2 交互式教学（L3+ 零提示——纯表现层，不阻塞输入）
     * Δ22c/T112 ④: 教学卡 MUST 在编舞完成（>= 820ms，z=4 满载 1000ms）后再出现 */
    if (STM.Tutorial) {
      if (STM.Tutorial.dismiss) STM.Tutorial.dismiss();
      afterIntro(function () {
        if (!session || !renderer) return;
        STM.Tutorial.maybeStart(id, { session: session, renderer: renderer });
      });
    }

    /* M4: 调试面板首次初始化（DOM 订阅 + 1~LEVELS.length 动态选项） */
    var panelNeedsInit = !els.debugPanel || !els.debugPanel._stmDebugInitialized;
    if (panelNeedsInit) {
      initDebugPanel();
      if (els.debugPanel) els.debugPanel._stmDebugInitialized = true;
    } else {
      /* 已初始化 → 刷新面板选项 + 信息（动态 LEVELS.length 适配） */
      if (els.debugLevel) {
        var opts = '';
        for (var i = 0; i < STM.LEVELS.length; i++) {
          var lv0 = STM.LEVELS[i];
          var size0 = (lv0 && lv0.n) ? (lv0.n + '×' + lv0.n) : '?';
          var flags0 = levelFlagLabel(lv0);
          opts += '<option value="' + (i + 1) + '">L' + (i + 1) + ' · ' + size0 + ' [' + flags0 + ']</option>';
        }
        els.debugLevel.innerHTML = opts;
      }
      if (els.debugMute) els.debugMute.checked = sound ? !sound.isMuted() : !progress.muted;
    }
    /* 同步下拉框当前选中 → currentId */
    if (els.debugLevel) els.debugLevel.value = String(id);
    renderDebugInfo();
    currentHintIndex = 0; /* 跳关 → 重置 onRail 解前缀计数器 */
    /* 跳出任何残留 Bot */
    stopAutoBot('载入关卡');

    startBgStage(currentId); /* Δ15b3: 全视口背景舞台（贴图 + 氛围 + 粒子） */
    /* Δ22c/T112 ④: 挑战横幅 1.6s 计时自**编舞完成**起算（不遮挡落牌） */
    afterIntro(showChallengeBanner);
  }

  /* =========================================================
   * Δ29a / FR-036: 困难关「险境预警」顶部流光横幅
   *
   * 旧实现的三处根因（读代码确认）：
   *   ① 节点 appendChild 到 `#app`（flex 列容器），样式 `position:absolute;
   *      top:34%; left:50%; transform:translate(-50%,-50%)` → 定位上下文就是
   *      `#app`，横幅天然压在**棋盘中央**（用户反馈「遮挡棋盘」）；
   *   ② 墨绿渐变底 + `#FFC53D` 黄边 + 两枚 10×46px 金色卷轴端饰 → 用户指认的
   *      「照搬传统麻将」识别特征；
   *   ③ `setTimeout(..., 1600)` 无打断路径，而这段正是玩家最想动手的开局段。
   *
   * Δ29a 口径：
   *   · 节点 = `#app` 内 **`#dock` 之后的兄弟**（index.html 静态占位），
   *     `position:absolute` + `pointer-events:none`，矩形与 `#dock` 完全重合
   *     → 包围盒与 `#board-wrap` **零相交**（构造性保证，不靠调数值）；
   *   · 触发集合只读 `STM.PeakBanner.isPeakLevel`（单一源，12 关）；
   *   · 六画卷色相经 CSS 变量一次性写入（不逐帧改样式、不起 rAF）；
   *   · 展示 1.4s 后淡出 + 轻微下沉；任意 pointerdown 立即消散（<= 100ms），
   *     且该次点击照常被棋盘判定（横幅 pointer-events:none，监听只做旁观）。
   * ========================================================= */
  var PEAK_BANNER_ID = 'peak-banner';
  var PEAK_SHOW_MS = 1400;
  var PEAK_DISMISS_MS = 80;

  function peakBannerApi() {
    return STM.PeakBanner || null;
  }

  /* 触发判定唯一出口——委托给 STM.PeakBanner（单一源，MUST NOT 在此另写区间判定） */
  function isChallengeLevel(id) {
    var api = peakBannerApi();
    if (api && api.isPeakLevel) return api.isPeakLevel(id);
    return false;
  }

  /* XX% = 关卡难度指标确定性函数（同关恒定——FR-036 §1）
   * difficultyScore 单调映射至 49%~12% 值域（线性递减——挑战语气真实感） */
  function challengePercent(id) {
    var lv = STM.LEVELS[id - 1];
    var score = lv && lv.metrics ? (lv.metrics.difficultyScore || 0) : 0;
    var pct = 49 - Math.round(score * 37 / 100); /* score 0~100 → 49%~12% */
    return Math.max(12, Math.min(49, pct));
  }

  var bannerTimer = null;
  var bannerFadeTimer = null;
  var bannerShownForLevel = 0;   /* 同一次开局会话内不重复弹出（换关/重置后清 0） */
  var bannerSplashTimer = null;  /* 等待启动遮罩移除的重试计时器 */
  var bannerSplashTries = 0;     /* 重试次数上限（40 × 160ms ≈ 6.4s 兜底） */
  var bannerLayoutHooked = false;

  /* =========================================================
   * Δ22c/T112: 开局编舞闸门（FR-052 §3 §5）
   *   挑战横幅（FR-036 的 1.6s）与 L1/L2 教学卡 MUST 在编舞完成
   *   之后才出现；横幅 1.6s 计时自编舞完成起算。
   *   点击快进 → flushIntroGate() 立即放行（不等到原定时刻）。
   * ========================================================= */
  var introGateTimer = null;
  var introGateQueue = [];
  function clearIntroGate() {
    if (introGateTimer) { clearTimeout(introGateTimer); introGateTimer = null; }
    introGateQueue = [];
  }
  function flushIntroGate() {
    if (introGateTimer) { clearTimeout(introGateTimer); introGateTimer = null; }
    var q = introGateQueue;
    introGateQueue = [];
    for (var i = 0; i < q.length; i++) {
      try { q[i](); } catch (eGate) { /* 单个闸门回调异常不影响其余 */ }
    }
  }
  function afterIntro(fn) {
    var d = (renderer && renderer.dealRemainingMs) ? renderer.dealRemainingMs() : 0;
    if (d <= 0) { fn(); return; }
    introGateQueue.push(fn);
    if (!introGateTimer) introGateTimer = setTimeout(flushIntroGate, d);
  }

  /* 抽取并启动本局编舞（进入关卡 / 重置本关都走这里） */
  function startDealChoreography() {
    if (!renderer || !renderer.startDeal) return -1;
    clearIntroGate();
    var m = renderer.startDeal(); /* 相邻两次开局 MUST NOT 重复（渲染器内部保证） */
    if (els.debugIntro) {
      els.debugIntro.value = (renderer.getDealModeLock && renderer.getDealModeLock() != null)
        ? String(renderer.getDealModeLock()) : 'random';
    }
    return m;
  }

  function showChallengeBanner() {
    if (!isChallengeLevel(currentId)) return;
    if (bannerShownForLevel === currentId) return; /* 同一次开局会话内不重复弹出 */
    /* 启动遮罩（#splash-screen）仍在时**必须延后**：深链 `?level=N` 会在 boot 阶段
     * 就 loadLevel，若此时开播，1.4s 的横幅整段藏在遮罩背后 → 玩家永远看不到。
     * 轮询到遮罩节点被移除（preload 完成 + 500ms 淡出）再开播；40 次（≈6.4s）后
     * 放弃等待直接开播（遮罩异常滞留时也不能吞掉预警）。 */
    var splashEl = global.document ? global.document.getElementById('splash-screen') : null;
    if (splashEl) {
      if (bannerSplashTimer) return;              /* 已在等待中，避免叠加计时器 */
      if (bannerSplashTries >= 40) {
        bannerSplashTries = 0;                    /* 兜底：不再等，落到下面正常开播 */
      } else {
        bannerSplashTries++;
        bannerSplashTimer = setTimeout(function () {
          bannerSplashTimer = null;
          showChallengeBanner();
        }, 160);
        return;
      }
    }
    bannerSplashTries = 0;
    bannerShownForLevel = currentId;
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    if (bannerFadeTimer) { clearTimeout(bannerFadeTimer); bannerFadeTimer = null; }
    var el = ensureBannerEl();
    if (!el) return;

    /* 色相一次性写入（六画卷自适应；MUST NOT 逐帧改样式） */
    var api = peakBannerApi();
    var th = api && api.themeOf ? api.themeOf(currentId) : null;
    if (th) {
      el.style.setProperty('--banner-hue-a', String(th.a));
      el.style.setProperty('--banner-hue-b', String(th.b));
      el.style.setProperty('--banner-glow', String(th.glow));
      el.setAttribute('data-painting', String(th.id));
    }

    /* 文案 + 搭档头像（与大厅 / 结算同源同缓存链：STM.petAvatarHTML） */
    var pct = challengePercent(currentId);
    var text = api && api.TEXT ? api.TEXT(pct) : ('\u2726 险境预警 \u00b7 仅 ' + pct + '% 探险家一次突破 \u2726');
    var av = null;
    try {
      av = (STM.Profile && STM.Profile.get) ? STM.Profile.get().avatar : null;
    } catch (eAv) { av = null; }
    var avatarHtml = '';
    if (STM.petAvatarHTML) {
      try { avatarHtml = STM.petAvatarHTML(av == null ? 0 : av); } catch (ePa) { avatarHtml = ''; }
    }
    el.innerHTML = '<span class="peak-banner-pet" aria-hidden="true">' + avatarHtml + '</span>' +
      '<span class="peak-banner-text">' + text + '</span>' +
      '<span class="peak-banner-sheen" aria-hidden="true"></span>';
    if (STM.paintAvatarCanvases) {
      try { STM.paintAvatarCanvases(el); } catch (ePaint) { /* 兜底直绘失败不阻断横幅 */ }
    }

    positionBanner(el); /* 一次性反算（resize 时重算，MUST NOT 每帧读布局） */
    if (!bannerLayoutHooked) {
      bannerLayoutHooked = true;
      try {
        global.addEventListener('resize', function () {
          var b = global.document.getElementById(PEAK_BANNER_ID);
          if (b && b.classList.contains('show')) positionBanner(b);
        });
      } catch (eRz) { /* 无 resize 能力的环境忽略 */ }
    }

    el.classList.remove('hide', 'instant');
    el.classList.add('show');
    bannerTimer = setTimeout(function () {
      bannerTimer = null;
      dismissPeakBanner(false); /* 自然消散：淡出 + 轻微下沉，MUST NOT 硬切 */
    }, PEAK_SHOW_MS);
  }

  /* 消散：`instant` 为真时 80ms 内不可见（点击打断 / 换关清理），
   * 为假时走 260ms 自然淡出。两路都不动 DOM 结构（零布局抖动）。 */
  function dismissPeakBanner(instant) {
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    var d = global.document;
    var el = d ? d.getElementById(PEAK_BANNER_ID) : null;
    if (!el) return;
    if (!el.classList.contains('show')) return;
    el.classList.remove('show');
    el.classList.add('hide');
    if (instant) el.classList.add('instant');
    if (bannerFadeTimer) clearTimeout(bannerFadeTimer);
    bannerFadeTimer = setTimeout(function () {
      bannerFadeTimer = null;
      var e2 = global.document ? global.document.getElementById(PEAK_BANNER_ID) : null;
      if (!e2) return;
      e2.classList.remove('hide', 'instant');
      e2.innerHTML = '';
    }, instant ? PEAK_DISMISS_MS + 20 : 280);
  }

  /* 换关 / 重置 / 失败复活：立即清理计时器与节点内容（防残留叠层） */
  function resetPeakBanner() {
    bannerShownForLevel = 0;
    bannerSplashTries = 0;
    if (bannerSplashTimer) { clearTimeout(bannerSplashTimer); bannerSplashTimer = null; }
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    if (bannerFadeTimer) { clearTimeout(bannerFadeTimer); bannerFadeTimer = null; }
    var d = global.document;
    var el = d ? d.getElementById(PEAK_BANNER_ID) : null;
    if (!el) return;
    el.classList.remove('show', 'hide', 'instant');
    el.innerHTML = '';
  }

  /* 矩形与 `#dock` 完全重合 → 与 `#board-wrap` 零相交（构造性，不靠数值调参）。
   * 只在「显示」与「resize」时读布局，MUST NOT 每帧读。 */
  function positionBanner(el) {
    var d = global.document;
    if (!d || !el) return;
    var app = d.getElementById('app');
    var dock = d.getElementById('dock');
    if (!app || !dock || !dock.getBoundingClientRect || !app.getBoundingClientRect) return;
    var ar = app.getBoundingClientRect();
    var dr = dock.getBoundingClientRect();
    if (!(dr.width > 0) || !(dr.height > 0)) return;
    el.style.left = Math.round(dr.left - ar.left) + 'px';
    el.style.top = Math.round(dr.top - ar.top) + 'px';
    el.style.width = Math.round(dr.width) + 'px';
    el.style.height = Math.round(dr.height) + 'px';
  }

  function ensureBannerEl() {
    var d = global.document;
    if (!d) return null;
    var b = d.getElementById(PEAK_BANNER_ID);
    if (b) return b;
    /* 静态占位缺失时补建——**必须**紧跟在 `#dock` 之后（不是 appendChild 到 #app 末尾），
     * 否则定位上下文/层级关系与静态路径不一致。 */
    var dock = d.getElementById('dock');
    var app = d.getElementById('app');
    if (!dock || !app) return null;
    b = d.createElement('div');
    b.id = PEAK_BANNER_ID;
    b.className = 'peak-banner';
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    if (dock.nextSibling) app.insertBefore(b, dock.nextSibling);
    else app.appendChild(b);
    return b;
  }

  /* 点击可打断（FR-036 §8）：捕获阶段旁观，**不消费事件**——横幅自身
   * `pointer-events:none`，故该次点击照常落到棋盘并产生正常飞出/受阻反馈。 */
  function bindPeakBannerDismiss() {
    var d = global.document;
    if (!d || d.__stmPeakBannerBound) return;
    d.__stmPeakBannerBound = true;
    var onDown = function () {
      var el = d.getElementById(PEAK_BANNER_ID);
      if (el && el.classList.contains('show')) dismissPeakBanner(true);
    };
    try { d.addEventListener('pointerdown', onDown, true); } catch (ePd) {
      try { d.addEventListener('mousedown', onDown, true); } catch (eMd) {}
    }
  }

  /* =========================================================
   * T021: HUD / Dock DOM 视图与结算浮层
   * ========================================================= */
  /* =========================================================
   * T021 + Δ19c/T085 + ingame-hud-render-defects: HUD / IQ / Dock / 道具栏
   *   · 顶栏中央仅极简 `IQ: XX`（关号降级为不可见节点）
   *   · 右上角棱晶胶囊实时反映 profile v2 余额（七彩棱晶 SVG，与大厅同源）
   *   · IQ 为纯局内表现态（不持久化、不影响棱晶与进度）；称号仅驱动升段音效
   * ========================================================= */
  var IQ_START = 50;
  var IQ_TITLES = [
    { min: 180, name: '旷世奇才' },
    { min: 150, name: '最强大脑' },
    { min: 120, name: '超凡头脑' },
    { min: 100, name: '逻辑达人' },
    { min: 0, name: '敏锐直觉' }
  ];
  var iqScore = IQ_START;
  var levelStartTime = 0;
  var blockErrors = 0;
  var totalTriples = 1;
  var iqTitle = '敏锐直觉';
  var iqDeltaTimer = null;

  function iqTitleOf(v) {
    for (var i = 0; i < IQ_TITLES.length; i++) {
      if (v >= IQ_TITLES[i].min) return IQ_TITLES[i].name;
    }
    return IQ_TITLES[IQ_TITLES.length - 1].name;
  }

  function resetIq() {
    iqScore = IQ_START;
    levelStartTime = performance.now();
    blockErrors = 0;
    totalTriples = Math.max(1, Math.round((((currentLevel && currentLevel.tiles) ? currentLevel.tiles.length : 3)) / 3));
    iqTitle = iqTitleOf(iqScore);
    if (els.iqValue) els.iqValue.textContent = String(Math.round(Number(iqScore) || 50));
    if (els.iqPill) {
      els.iqPill.classList.remove('level-up');
      els.iqPill.classList.remove('iq-broken');
    }
    if (els.iqDelta) { els.iqDelta.textContent = ''; els.iqDelta.classList.remove('show'); }
  }

  /* 每次成功三消: IQ += 3 + combo × 2（绿色跳字 + 放大动效）；
   * 头衔在 100 / 120 / 150 / 180 处依次晋升。 */
  function addIq(gain, combo) {
    combo = combo || 0;
    var baseGain = 150 / totalTriples;
    var comboMul = Math.min(1.08, 0.76 + combo * 0.08);
    var errorMul = Math.pow(0.88, blockErrors);
    var mins = Math.floor((performance.now() - levelStartTime) / 60000);
    var timeMul = Math.max(0.50, 1.0 - mins * 0.15);
    var rawDelta = baseGain * comboMul * errorMul * timeMul;
    var newScore = iqScore + rawDelta;
    if (newScore > 165) {
      var excess = newScore - 165;
      var damp = (200 - iqScore) / 38;
      newScore = 165 + excess * damp;
    }
    if (newScore > 200) newScore = 200;
    var delta = newScore - iqScore;
    iqScore = Math.round(newScore);
    var next = iqTitleOf(iqScore);
    var leveled = next !== iqTitle;
    iqTitle = next;
    if (els.iqValue) els.iqValue.textContent = String(Math.round(Number(iqScore) || 50));
    if (els.iqDelta) {
      els.iqDelta.textContent = '+' + (Math.round(delta * 10) / 10);
      els.iqDelta.classList.remove('show');
      void els.iqDelta.offsetWidth;
      els.iqDelta.classList.add('show');
      if (iqDeltaTimer) clearTimeout(iqDeltaTimer);
      iqDeltaTimer = setTimeout(function () {
        if (els.iqDelta) els.iqDelta.classList.remove('show');
      }, 820);
    }
    if (els.iqPill) {
      if (leveled) {
        els.iqPill.classList.remove('level-up');
        void els.iqPill.offsetWidth;
        els.iqPill.classList.add('level-up');
        if (sound) sound.play('unlock');
      }
    }
  }

  function breakComboOnBlocked() {
    blockErrors += 1;
    if (els.iqPill) {
      els.iqPill.classList.remove('iq-broken');
      void els.iqPill.offsetWidth;
      els.iqPill.classList.add('iq-broken');
    }
    renderHud();
  }

  /* Bug 9: 棱晶图标唯一来源——与大厅货币栏同一颗七彩切面 SVG */
  function prismHtml(cls) {
    return (STM.PrismIcon && STM.PrismIcon.html) ? STM.PrismIcon.html(cls) : '';
  }

  function renderHud() {
    /* 关号仅保留不可见节点（a11y / 自动化断言 / 调试）——
     * 顶栏中央已改为极简 `IQ: XX`（无大脑图标、无称号、无关卡标题） */
    if (els.hudNo) els.hudNo.textContent = String(currentId);
    if (els.hud) els.hud.setAttribute('aria-label', '关卡 ' + currentId + ' · 局内导航栏');
    /* 右上角: 七彩棱晶图标 + 数量（与大厅同一颗 SVG，profile v2 实时同步） */
    if (els.hudShards) {
      var bal = 0;
      try { bal = STM.Profile ? STM.Profile.get().shards : 0; } catch (e) { bal = 0; }
      els.hudShards.innerHTML = prismHtml('prism-gem') + '<b>' + bal + '</b>';
    }
    if (els.iqValue) els.iqValue.textContent = String(Math.round(Number(iqScore) || 50));
  }

  function renderDock() {
    var s = session.state();
    lastDockSnapshot = (s.dock || []).map(function (t) { return { id: t.id, s: t.s }; });
    /* Δ27b/T128: 碎裂驻留窗口内不重建 DOM（保留 `.slot-shattering` 演出）；
     * 快照照常更新——match 分支依赖它定位消除槽。 */
    if (dockFreezeUntil && Date.now() < dockFreezeUntil) return;
    dockFreezeUntil = 0;
    /* Dock 7 格（Δ14: chipSVG 消费当前关花色映射——与棋盘图鉴口径一致） */
    var html = '';
    for (var i = 0; i < 7; i++) {
      /* Δ28a: ghost 优先——match 已把牌从引擎 dock 移除，但视觉上必须先让玩家
       * 看到「牌落进槽里」，再碎。ghost 只读快照花色，不回写任何引擎态。 */
      var ghostSuit = (dockGhost && dockGhost.map && dockGhost.map[i] != null) ? dockGhost.map[i] : null;
      if (ghostSuit != null) {
        var gCls = dockGhost.shatter ? 'slot has-tile is-filled filled slot-shattering' : 'slot has-tile is-filled filled';
        html += '<div class="' + gCls + '" data-idx="' + i + '"><div class="dock-chip">' + STM.chipSVG(ghostSuit, currentLevel) + '</div></div>';
      } else if (i < s.dock.length) {
        /* Δ27b/T128（FR-053 §6）: 该牌逻辑上已入槽、但飞行尚未落定 →
         * 槽位保持空槽态（不提前亮起），落定由 onFlightLand 回调揭示。 */
        if (renderer && renderer.dockPending && renderer.dockPending(s.dock[i].id)) {
          html += '<div class="slot empty"></div>';
        } else {
          html += '<div class="slot has-tile is-filled filled" data-idx="' + i + '"><div class="dock-chip">' + STM.chipSVG(s.dock[i].s, currentLevel) + '</div></div>';
        }
      } else {
        html += '<div class="slot empty"></div>';
      }
    }
    els.dock.innerHTML = html;
    /* Δ15b3e（Bug A 修复）: 若 chipSVG 走了 <canvas class="dock-icon"> 兜底
     * 出口（file:// 跨源污染下 toDataURL 不可用），此处立即以棋盘同源的
     * 离屏切片直绘填充，保证 Dock 与棋盘图标 100% 同一张贴图。 */
    if (STM.paintDockIcons) STM.paintDockIcons();
  }

  /* =========================================================
   * Δ28a: 碎裂时序修正（「牌没到就碎」）
   *
   * 根因：`RulesEngine.applyTap` 是**原子结算**——第 3 张牌一点，`dock` / `match` /
   * `remove` 三个事件在同一批里下发，而该牌的飞行动画才刚开始（U 向 220ms、
   * L/R/D 两段最长 320ms）。旧实现在 `match` 里直接 `spawnDockShatter`，于是
   * 前两张的碎片已经炸开、第 3 张还在半空。
   *
   * 修法：`match` 时若有 `renderer.dockPending(id)` 为真 → 挂起 `pendingShatter`；
   * 每张落定先用 `dockGhost` 把槽位画成「有牌态」（逐张可见地落槽），
   * 3 张全部落定后统一爆发 + 挂 `.slot-shattering` + 冻结 180ms。
   * `dockGhost` 只是 DOM 渲染态，不写回 `session` / 不参与任何判定。
   * ========================================================= */

  /* 从引擎 dock 快照里定位本次三消的 3 个槽位（顺序 = 左→右） */
  /* Δ28e: 镜像与引擎真值对齐（换关 / 重置 / Undo 后调用）。
   * `state.dock` 是密集数组，下标即槽位序号，故可直接重建。 */
  function resyncDockMirror() {
    dockMirror = [];
    if (!session) return;
    try {
      var d = session.state().dock || [];
      for (var i = 0; i < d.length; i++) dockMirror.push(d[i].id);
    } catch (eRs) { dockMirror = []; }
  }

  /* Δ28e: 权威槽位来源——按 id 在镜像里查序号（`match` 时镜像仍是移除前序列）。
   * 只有当镜像漂移（漏更新）导致查不全 3 个时才退回 `locateShatterSlots` 的启发式。 */
  function shatterSlotsOf(ids) {
    var out = [];
    var list = ids || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] == null) continue;
      var idx = dockMirror.indexOf(list[i]);
      if (idx >= 0 && out.indexOf(idx) < 0) out.push(idx);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function locateShatterSlots(suit) {
    var out = [];
    if (!lastDockSnapshot) return out;
    var i;
    for (i = 0; i + 2 < lastDockSnapshot.length; i++) {
      if (lastDockSnapshot[i] && lastDockSnapshot[i + 1] && lastDockSnapshot[i + 2] &&
          lastDockSnapshot[i].s === suit && lastDockSnapshot[i + 1].s === suit && lastDockSnapshot[i + 2].s === suit) {
        return [i, i + 1, i + 2];
      }
    }
    for (i = 0; i < lastDockSnapshot.length; i++) {
      if (lastDockSnapshot[i] && lastDockSnapshot[i].s === suit) out.push(i);
    }
    if (out.length >= 3) return out.slice(0, 3);
    var filled = [];
    for (i = 0; i < lastDockSnapshot.length; i++) if (lastDockSnapshot[i]) filled.push(i);
    out = filled.slice(0, 3);
    while (out.length < 3) out.push(out.length);
    return out;
  }

  /* 挂起的碎裂：把「已落定」的牌逐张刷进 ghost（可见地落槽，尚未开碎） */
  function advancePendingShatter() {
    if (!pendingShatter) return;
    var ids = pendingShatter.ids || [];
    var slots = pendingShatter.slots || [];
    var suits = pendingShatter.suits || [];
    var map = {};
    for (var i = 0; i < slots.length; i++) {
      var id = ids[i];
      var landed = !(renderer && renderer.dockPending && id != null && renderer.dockPending(id));
      if (landed && suits[i] != null) map[slots[i]] = suits[i];
    }
    dockGhost = { map: map, shatter: false };
  }

  /* 3 张全部落定（或超时兜底）后爆发：ghost 挂 `.slot-shattering` → 碎块 → 冻结 180ms */
  function flushPendingShatter(force) {
    if (!pendingShatter) return;
    if (!force && renderer && renderer.dockPending) {
      var ids = pendingShatter.ids || [];
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] != null && renderer.dockPending(ids[i])) return; /* 还有在途 → 继续等 */
      }
    }
    var ps = pendingShatter;
    pendingShatter = null;
    if (pendingShatterTimer) { clearTimeout(pendingShatterTimer); pendingShatterTimer = null; }
    try { fireDockShatter(ps.slots, ps.suits); } catch (eF) { /* VFX 失败不阻断主流程 */ }
  }

  /* =========================================================
   * Δ29b / FR-049 §2 ①②④ §15: 「挤压闪白前摇 → 膨胀顶点同帧撑爆」
   *
   * 取代 Δ20 的「槽内保留 180ms 播放震颤裂纹」：用户要的是**一记短促的挤压闪白**，
   * 而不是慢慢裂开。时序：
   *
   *   t = 0ms      ghost 上屏（3 张牌原位）→ 挂 `.slot-shattering`
   *                → CSS 在 PRESHAKE_MS 内做**非等比膨胀挤压 + 高光闪白**
   *   t = 0ms      取**未变形**的槽位 rect（必须先取——CSS 动画一旦起跑，
   *                getBoundingClientRect 会返回放大后的盒子，碎块出生点会外扩）
   *   t = PRESHAKE_MS（膨胀顶点）  spawnDockShatter(rects) + 同帧清空 ghost 并重绘
   *                → 零空窗帧（牌消失的那一帧碎块已存在）、零叠帧（碎块出现时牌已清）
   *
   * `#dock` 的 DOM 冻结窗口覆盖「前摇 + 爆发」两段（DOCK_FREEZE_MS = 180ms），
   * 否则 match 事件处理末尾的 renderDock() 会把 `.slot-shattering` 抹掉。
   * ========================================================= */
  var PRESHAKE_MS = 70;      /* 前摇时长（FR-049 §2 ②：60~80ms） */
  var DOCK_FREEZE_MS = 180;  /* 冻结窗口 = 前摇 + 爆发 */
  var preshakeTimer = null;

  /* 真正的碎裂：先渲染「有牌 + 挤压闪白」的 ghost，膨胀顶点同帧爆发，最后解冻 */
  function fireDockShatter(slotIndices, suits) {
    slotIndices = slotIndices || [];
    suits = suits || [];
    var map = {};
    var g;
    for (g = 0; g < slotIndices.length; g++) {
      if (suits[g] != null) map[slotIndices[g]] = suits[g];
    }
    if (preshakeTimer) { clearTimeout(preshakeTimer); preshakeTimer = null; }

    /* ① 先让 ghost 上屏（有牌态、无动画）→ 立刻取未变形 rect */
    dockGhost = { map: map, shatter: false };
    dockFreezeUntil = 0;
    renderDock();
    var nodes = els.dock ? els.dock.querySelectorAll('.slot') : [];
    var rects = [];
    for (var k = 0; k < slotIndices.length; k++) {
      var idx = slotIndices[k];
      if (nodes[idx] && nodes[idx].getBoundingClientRect) rects.push(nodes[idx].getBoundingClientRect());
    }

    /* ② 挂前摇动画（`.slot-shattering` 复用既有类名，只改时序与关键帧） */
    dockGhost = { map: map, shatter: true };
    renderDock();
    dockFreezeUntil = Date.now() + DOCK_FREEZE_MS;
    if (dockFreezeTimer) clearTimeout(dockFreezeTimer);
    dockFreezeTimer = setTimeout(function () {
      dockFreezeTimer = null;
      dockFreezeUntil = 0;
      /* 前摇回调被节流推迟时，交给它自己清槽，避免这里提前抹掉动画 */
      if (preshakeTimer) return;
      dockGhost = null;
      if (session && els.dock) renderDock();
    }, DOCK_FREEZE_MS);

    /* ③ 膨胀顶点：同帧「出碎块 + 清槽」 */
    preshakeTimer = setTimeout(function () {
      preshakeTimer = null;
      dockFreezeUntil = 0;
      if (rects.length && renderer && renderer.spawnDockShatter) {
        try { renderer.spawnDockShatter(rects); } catch (eVfx) { /* VFX 异常不阻断清槽 */ }
      }
      dockGhost = null;
      if (session && els.dock) renderDock();
    }, PRESHAKE_MS);
  }

  function renderItems() {
    var s = session.state();
    var it = s.items || {};
    setItemBtn('item-undo', it.undo || 0);
    setItemBtn('item-magnet', it.magnet || 0);
    setItemBtn('item-shuffle', it.shuffle || 0);
    /* Δ16f/T071: 免费次数用尽后角标变为「棱晶图标 50」（不再显示数字次数） */
    renderItemBadge('item-undo', (it.undo || 0) > 0);
    renderItemBadge('item-magnet', (it.magnet || 0) > 0);
    renderItemBadge('item-shuffle', (it.shuffle || 0) > 0);
  }

  /* 道具角标：免费可用 → 显次数；用尽 → 显「棱晶图标 + 50」购买价
   * （Bug 9: 图标与大厅棱晶栏同源 SVG，不再使用蓝色宝石 Emoji） */
  function renderItemBadge(btnId, hasFree) {
    var btn = global.document.getElementById(btnId);
    if (!btn) return;
    var cnt = btn.querySelector('.item-count');
    if (!cnt) return;
    btn.classList.toggle('is-buyable', !hasFree);
    if (!hasFree) {
      cnt.innerHTML = prismHtml('prism-gem-sm') + '<span>' + ITEM_PRICE + '</span>';
    }
  }

  function setItemBtn(btnId, count) {
    var btn = global.document.getElementById(btnId);
    if (!btn) return;
    var cnt = count == null ? 0 : count;
    var countEl = btn.querySelector('.item-count');
    /* 记录免费次数原值（购买态恢复时回填） */
    if (countEl && cnt > 0) btn.setAttribute('data-free', String(cnt));
    if (countEl) countEl.textContent = String(cnt);
    /* Δ16f/T071: 次数用尽**不得**禁用——按钮进入购买态仍可点击
     * （余额不足时在点击时提示，FR-041 §2：拒绝扣费、拒绝消耗） */
    btn.disabled = false;
  }

  /* ---------- Δ16f/T071: 棱晶购买（原子扣费 + 立即生效，FR-041 §2） ----------
   * 顺序铁律: ① 校验余额 → ② 扣费（spendShards 原子）→ ③ 使用。
   * 余额不足 MUST 拒绝扣费、拒绝消耗道具次数并给出明确提示（不得静默失败、
   * 不得扣成负数）。余额恰好等于价格时扣费后归零、道具仍正常生效。 */
  var ITEM_PRICE = 50;
  var ITEM_BTN = { undo: 'item-undo', magnet: 'item-magnet', shuffle: 'item-shuffle' };
  var ITEM_NAME = { undo: '撤销', magnet: '灵犀三消', shuffle: '乾坤洗牌' };

  function buyItemAndUse(item, tileId) {
    if (!session || !STM.Profile) return false;
    var cost = ITEM_PRICE;
    var btnId = ITEM_BTN[item] || 'item-undo';
    if (!STM.Profile.spendShards(cost)) {
      /* 余额不足 → 明确提示，零扣费零消耗（余额恒 ≥0）+ 按钮轻晃 */
      toast('棱晶不足，需要 ' + cost + ' 棱晶');
      sound.play('blocked');
      shakeItemBtn(btnId);
      return false;
    }
    var r = session.buyItemUse(item, tileId, cost);
    if (!r || !r.ok) {
      /* 生效失败 → 退还已扣的棱晶（扣费与生效必须原子，不得白扣） */
      STM.Profile.addShards(cost);
      toast('本次无法使用该道具');
      sound.play('blocked');
      shakeItemBtn(btnId);
      return false;
    }
    if (item !== 'undo') flashItemBtn(btnId);
    sound.play(item === 'shuffle' ? 'gear' : 'match');
    if (item === 'shuffle') playShuffleFx();
    renderer.refresh();
    renderDock();
    renderHud();
    renderItems();
    /* 扣费飘字 `-50 棱晶`（锚定触发道具按钮） */
    spawnShardFloat('-' + cost + ' 棱晶', global.document.getElementById(btnId));
    toast('已消耗 ' + cost + ' 棱晶，使用一次' + ITEM_NAME[item]);
    return true;
  }

  /* ---------- Δ19d/T086 道具交互编排（撤销 / 灵犀三消 / 乾坤洗牌） ---------- */
  function bindItemInput() {
    var undo = global.document.getElementById('item-undo');
    var magnet = global.document.getElementById('item-magnet');
    var shuffle = global.document.getElementById('item-shuffle');
    if (undo) {
      undo.removeEventListener('pointerdown', onUndoDown);
      undo.addEventListener('pointerdown', onUndoDown);
    }
    if (magnet) {
      magnet.removeEventListener('pointerdown', onMagnetDown);
      magnet.addEventListener('pointerdown', onMagnetDown);
    }
    if (shuffle) {
      shuffle.removeEventListener('pointerdown', onShuffleDown);
      shuffle.addEventListener('pointerdown', onShuffleDown);
    }
  }

  function flashItemBtn(btnId) {
    var btn = global.document.getElementById(btnId);
    if (!btn) return;
    btn.classList.remove('item-flash');
    void btn.offsetWidth;
    btn.classList.add('item-flash');
  }

  /* 乾坤洗牌棋盘整体旋转缩放动效（纯表现层——不改布局盒） */
  function playShuffleFx() {
    if (!els.boardWrap) return;
    els.boardWrap.classList.remove('shuffling');
    void els.boardWrap.offsetWidth;
    els.boardWrap.classList.add('shuffling');
    setTimeout(function () {
      if (els.boardWrap) els.boardWrap.classList.remove('shuffling');
    }, 660);
  }

  function onUndoDown() {
    if (!session) return;
    notifyBotInterruption(); /* M4 T056: 玩家道具操作 → 打断 Bot */
    /* Δ16f/T071: 免费次数用尽 → 进入棱晶购买闭环（FR-041 §2） */
    var left = (session.state().items || {}).undo || 0;
    if (left <= 0) { buyItemAndUse('undo'); return; }
    var r = session.useItem('undo');
    if (r && r.type === 'undo') {
      sound.play('undo');
      renderer.refresh();
      renderDock();
      renderHud();
      renderItems();
      toast('已撤回一步');
    } else {
      toast('暂无可撤回的步骤');
      sound.play('blocked');
      shakeItemBtn('item-undo');
    }
  }

  /* 灵犀三消：无视阻挡与层叠锁定，吸走 3 张同花色直接爆裂消除 */
  function onMagnetDown() {
    if (!session) return;
    notifyBotInterruption();
    var left = (session.state().items || {}).magnet || 0;
    if (left <= 0) { buyItemAndUse('magnet'); return; }
    var r = session.useItem('magnet');
    if (r && r.type === 'magnet') {
      flashItemBtn('item-magnet');
      sound.play('prism');
      renderer.refresh();
      renderDock();
      renderHud();
      renderItems();
      toast('灵犀三消！同色萌宠已吸入待消槽');
    } else {
      var why = r && r.reason === 'insufficient' ? '场上同花色不足 3 张' : '当前无法使用灵犀三消';
      toast(why);
      sound.play('blocked');
      shakeItemBtn('item-magnet');
    }
  }

  /* 乾坤洗牌：剩余卡牌花色与方向随机重排（洗牌后仍必胜可解） */
  function onShuffleDown() {
    if (!session) return;
    notifyBotInterruption();
    var left = (session.state().items || {}).shuffle || 0;
    if (left <= 0) { buyItemAndUse('shuffle'); return; }
    var r = session.useItem('shuffle');
    if (r && r.type === 'shuffle') {
      flashItemBtn('item-shuffle');
      playShuffleFx();
      sound.play('gear');
      renderer.refresh();
      renderDock();
      renderHud();
      renderItems();
      toast('乾坤洗牌！场上卡牌已重新分布');
    } else {
      toast('当前无法使用乾坤洗牌');
      sound.play('blocked');
      shakeItemBtn('item-shuffle');
    }
  }

  /* ---------- session 事件 → 渲染/音效（Δ10 无锁连点：事件即时转发，动画并发） ---------- */
  function handleSessionEvent(e) {
    if (e.e === 'phase') { renderHud(); return; }
    if (e.e === 'reset') {
      if (dockFreezeTimer) { clearTimeout(dockFreezeTimer); dockFreezeTimer = null; }
      if (pendingShatterTimer) { clearTimeout(pendingShatterTimer); pendingShatterTimer = null; }
      if (preshakeTimer) { clearTimeout(preshakeTimer); preshakeTimer = null; } /* Δ29b: 重置清前摇 */
      dockFreezeUntil = 0;
      pendingShatter = null;
      dockGhost = null;
      dockMirror = []; /* Δ28e: 镜像随重置清空 */
      resetIq();
      renderer.refresh(); renderHud(); renderDock(); renderItems();
      return;
    }
    /* Δ10: 「别急，动画中…」Toast 与 input-locked 提示音已删除——
     * 动画期间不再拦截点击；仅终态时 GameState 才发 input-locked（静默忽略） */
    if (e.e === 'input-locked') return;
    if (e.e === 'click') {
      /* Δ22/T107: 点击音改由交互级合成音承担（flyout → ber~ / blocked →
       * deng~），此处不再补 click 合成音，避免双重起音糊成一团 */
      return;
    }
    if (e.e === 'flyout') {
      /* Δ19e/T087: 仅在「有效飞出」时推进 L1/L2 教学进度（受阻不计） */
      if (STM.Tutorial) STM.Tutorial.onTap(e.tileId);
      sound.play('flyout'); renderer.handleEvent(e); renderer.refresh(); renderDock(); renderHud(); return;
    }
    if (e.e === 'blocked') {
      /* Δ19c/T085: 受阻反弹 → IQ 不减少，但 combo 立即归零（FR-047 §2） */
      sound.play('blocked');
      renderer.handleEvent(e);
      renderer.refresh(); /* Δ10: 弹回动画滑块由动画层绘制（blockSet 防重影），逻辑态即时刷新 */
      breakComboOnBlocked();
      return;
    }
    /* Δ22b/T108~T110: 连击唯一权威事件——碎裂升调（0ms 瞬发）+ 120ms 延迟三阶语音
     * + `#dock` 下方微光飘字。此处 MUST NOT 自行推算档位（rate/voice/floatText 全取自事件）。 */
    if (e.e === 'comboChanged') {
      if (sound) {
        if (sound.playShatter) sound.playShatter(e.playbackRate);
        else sound.playSfx('shatter', { rate: e.playbackRate });
        if (e.voice) sound.playVoice(e.voice); /* SoundManager 内部固定 120ms 延迟 + 通道去叠放 */
      }
      if (e.floatText) spawnComboFloat(e.floatText, e.tier);
      return;
    }
    if (e.e === 'dock' || e.e === 'match' || e.e === 'remove') {
      /* Δ28e: 镜像重放——`dock` 的 slotIndex 与引擎 `dockInsert` 同语义（插入到该位），
       * `remove` 与 `settleMatches` 同语义（按 id 剔除）。事件序为 dock → match → remove，
       * 故 `match` 处理时镜像仍是移除前序列。 */
      if (e.e === 'dock' && e.id != null) {
        var dIns = (e.slotIndex != null && e.slotIndex >= 0) ? e.slotIndex : dockMirror.length;
        if (dockMirror.indexOf(e.id) < 0) {
          if (dIns > dockMirror.length) dIns = dockMirror.length;
          dockMirror.splice(dIns, 0, e.id);
        }
      } else if (e.e === 'remove') {
        var rIds = e.ids || [];
        for (var ri = 0; ri < rIds.length; ri++) {
          var rk = dockMirror.indexOf(rIds[ri]);
          if (rk >= 0) dockMirror.splice(rk, 1);
        }
      }
      if (e.e === 'match') {
        /* Δ22b/T109: 碎裂音效已上移至 comboChanged（需带 playbackRate），
         * 此处只负责 IQ 记账与碎片瀑布 VFX，避免同一次三消双重起音。 */
        /* Δ19c/T085: 每次三消 IQ += 3 + combo × 2（绿色跳字 + 放大动效） */
        addIq(3 + (e.combo || 0) * 2, e.combo || 0);
        /* Δ28a: 三消碎裂——**必须等 3 张全部落定**再爆发。
         * `match` 在点击结算瞬间下发，此时第 3 张往往还在飞（U 向 220ms /
         * L/R/D 最长 320ms），旧实现直接爆发 → 观感「牌没到就碎」。 */
        try {
          var ids = (e.ids || []).slice();
          /* Δ28e: 槽位以「镜像反查」为权威——3 张牌落定前所在的真实槽位。
           * 镜像查不全（理论上只在漏更新时发生）才退回启发式，绝不再默认取最左 3 槽。 */
          var slotIndices = shatterSlotsOf(ids);
          if (slotIndices.length !== ids.length) slotIndices = locateShatterSlots(e.suit);
          /* 三张牌必然同花色 → 直接用事件花色，不再读已被刷新的快照 */
          var suits = [];
          for (var sq = 0; sq < slotIndices.length; sq++) suits.push(e.suit);
          var stillFlying = false;
          if (renderer && renderer.dockPending) {
            for (var qi = 0; qi < ids.length; qi++) {
              if (ids[qi] != null && renderer.dockPending(ids[qi])) { stillFlying = true; break; }
            }
          }
          if (stillFlying) {
            pendingShatter = { slots: slotIndices, suits: suits, ids: ids };
            advancePendingShatter(); /* 已落定的先亮起来（逐张可见地落槽） */
            if (pendingShatterTimer) clearTimeout(pendingShatterTimer);
            /* 兜底：飞行异常未回调时 700ms 后强制爆发（不得让碎片永不出现） */
            pendingShatterTimer = setTimeout(function () {
              pendingShatterTimer = null;
              flushPendingShatter(true);
            }, 700);
          } else {
            fireDockShatter(slotIndices, suits);
          }
        } catch (eSh) { /* VFX 失败不阻断主流程 */ }
      }
      renderer.handleEvent(e);
      renderer.refresh();
      renderDock();
      renderHud();
      return;
    }
    /* 机制事件（M2 T034/T036: gear/unlock/ice/prism 动效 + 音效映射）
     * 引擎破冰事件名为 'ice'（含 from/to），映射音效 'iceBreak' */
    if (e.e === 'gear') { sound.play('gear'); renderer.handleEvent(e); renderer.refresh(); return; }
    if (e.e === 'unlock') { sound.play('unlock'); renderer.handleEvent(e); renderer.refresh(); return; }
    if (e.e === 'ice') { sound.play('iceBreak'); renderer.handleEvent(e); renderer.refresh(); return; }
    if (e.e === 'prism') { sound.play('prism'); renderer.handleEvent(e); renderer.refresh(); return; }
    if (e.e === 'undo') {
      /* Δ28e: Undo 会把待消槽整体回滚，镜像无法按增量重放 → 直接从真值重建 */
      resyncDockMirror();
      renderer.refresh(); renderDock(); renderHud(); renderItems(); return;
    }
    renderer.handleEvent(e);
    renderer.refresh();
  }

  function shakeBoard() {
    els.boardWrap.classList.remove('shake');
    void els.boardWrap.offsetWidth;
    els.boardWrap.classList.add('shake');
  }

  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 900);
  }

  /* ---------- 终局结算（won/lost）T051: 进关/进度/终局 ---------- */
  function handleTerminal(o) {
    if (o.kind === 'won') {
      /* Δ22/T106 ③（FR-050 §4）: sfx_win 相对最后一组三消碎裂延迟 250ms 触发，
       * 触发同时把 bgm_game 压低至 0.08（避免胜利音被 BGM 掩蔽）；
       * 延迟由 SoundManager 内部排定——静音时会被一并取消（无漏音） */
      if (sound) sound.playSfx('win', { delay: 250, duck: true });
      recordWin(currentId, o.score, o.combo); /* T050: unlocked/max 刷新 + 持久化 */
      /* Δ16e/T070: 结算奖励 + 晶片点亮（FR-041 §1 确定性表，幂等） */
      var settlement = settleWin(currentId);
      enterResult(settlement);
    } else {
      /* Δ22/T106 ③（FR-050 §4）: 槽满 7 格锁死 / 死局 → 失败页弹出瞬间瞬发 */
      if (sound) sound.playSfx('lose');
      progress.last = currentId; /* 失败也记录 last（刷新回本关） */
      saveProgress();
      var reason = o.kind === 'lost_burst' ? '收集槽爆满' : '陷入死局';
      /* Δ16g/T074: 无倒计时失败页接管（FR-043） */
      enterFail(o.kind, reason, o.score);
    }
  }

  /* ---------- Δ16e/T070: 通关结算（FR-041 §1 确定性表 + FR-044 §2 点亮节奏）
   * 产出规则（MUST NOT 依赖随机数——FR-041 §5 确定性铁律）:
   *   首通普通 +25 / 首通困难 +60 / 整幅满充能额外 +150 / 重复通关 +10
   * 幂等: 重复通关不重复发首通奖励、不重复点亮晶片。 */
  var REWARD_NORMAL = 25, REWARD_HARD = 60, REWARD_PAINTING = 150, REWARD_REPEAT = 10;

  function settleWin(levelId) {
    var out = { level: levelId, shards: 0, litChip: false, paintingFull: false, firstClear: false };
    if (!STM.Profile) return out;
    try {
      var isFirst = STM.Profile.grantFirstClear(levelId);
      out.firstClear = isFirst;
      /* 困难位关 = 每第 3 关（FR-044 §2 —— 同时点亮晶片的那一关） */
      var isHard = levelId % 3 === 0;
      /* 首通奖励（幂等——重复通关只走 +10 分支） */
      if (isFirst) out.shards += isHard ? REWARD_HARD : REWARD_NORMAL;
      else out.shards += REWARD_REPEAT;

      /* 点亮晶片：仅困难位关 + 仅首通（重复游玩不重复点亮） */
      if (isFirst && isHard) {
        var pi = STM.Profile.paintingIndexOfLevel(levelId);
        if (STM.Profile.unlockPaintingTile(pi)) out.litChip = true;
        /* 满充能 4/4 → 整幅大奖（仅点亮成功的那一次触发，幂等） */
        var pp = STM.Profile.get().paintingProgress;
        if (pp[pi] >= STM.Profile.PIECES_PER_PAINTING) {
          out.paintingFull = true;
          out.shards += REWARD_PAINTING;
        }
      }
      if (out.shards > 0) STM.Profile.addShards(out.shards);
      out.balance = STM.Profile.get().shards;
    } catch (e) { /* 存储不可用 → 内存态照常（D-03） */ }
    return out;
  }

  /* ---------- Δ16e/T070: 结算层 / 展板 / 失败页 场景入口 ----------
   * 导航闭环（FR-042 §3 铁律）:
   *   通关 → 结算层（必经中间态）→ [满 4/4 时传送门开启展板] → 主大厅
   * 结算层 MUST NOT 跳过直接回大厅；分支由「是否本次触发 4/4」确定性驱动。 */
  function enterResult(settlement) {
    scene = SCENE.RESULT;
    var app = global.document.getElementById('app');
    if (app) app.classList.remove('scene-lobby');
    if (STM.Lobby) STM.Lobby.hide();
    if (!STM.Result) { enterLobby({ unlocked: progress.unlocked, level: progress.last }); return; }
    var nextLevelId = Math.min(STM.LEVELS.length, (settlement.level || currentId || 1) + 1);
    STM.Result.show({
      level: settlement.level,
      shards: settlement.shards,
      litChip: settlement.litChip,
      paintingFull: settlement.paintingFull,
      firstClear: settlement.firstClear,
      onContinue: function () { enterGame(nextLevelId); },
      onHome: function () { enterLobby({ unlocked: progress.unlocked, level: progress.last }); }
    });
  }

  /* ---------- Δ16g/T074: 失败页入口（零倒计时铁律） ---------- */
  function enterFail(kind, reason, score) {
    scene = SCENE.RESULT;
    var app = global.document.getElementById('app');
    if (app) app.classList.remove('scene-lobby');
    if (STM.Lobby) STM.Lobby.hide();
    if (!STM.Fail) { enterLobby({ unlocked: progress.unlocked, level: progress.last }); return; }
    STM.Fail.show({
      kind: kind,
      reason: reason,
      score: score,
      percent: challengePercent(currentId), /* FR-036 同源确定性函数，非倒计时 */
      onRevive: function () { reviveWithPrisms(); },
      onRestart: function () { enterGame(currentId); },
      onLobby: function () { enterLobby({ unlocked: progress.unlocked, level: progress.last }); }
    });
  }

  /* ---------- Δ16f/T074: 100 棱晶复活（净化消除 + 续局不重置棋盘） ---------- */
  var REVIVE_COST = 100;

  function reviveWithPrisms() {
    if (!STM.Profile || !STM.Fail || !session) return;
    /* 余额不足 → 拒绝扣费、按钮置为不可用并提示（FR-043 §3） */
    if (!STM.Profile.spendShards(REVIVE_COST)) {
      STM.Fail.notifyInsufficient();
      return;
    }
    var r = session.purify(); /* 成组净化消除——恒为 3 的倍数（FR-043 §4） */
    sound.playSfx('shatter', { combo: 3 });
    renderer.refresh();
    renderDock();
    renderHud();
    renderItems();
    STM.Fail.hide();
    scene = SCENE.GAME;
    resetPeakBanner(); /* Δ29a: 复活清理预警横幅（计时器 + 节点，零残留） */
    toast('棱晶净化完成，继续挑战！');
  }


  /* =========================================================
   * M4: 评委调试面板（T053~T058）
   *   T053: 响应式容器（PC 右侧 320px 侧栏 + 移动端底部抽屉 + 浮动按钮）
   *   T054: 1~LEVELS.length 动态跳关与重置
   *   T055: AI 提示下一步（Hint）——on-rail → 高亮 solutionMoves 下一步；
   *         off-rail → 有界 DFS（100k 节点/300ms 预算）首步高亮
   *         或启发式提示「非保证」标记
   *   T056: 一键自动演示通关（Auto-Play Bot）——450ms/步；玩家
   *         pointerdown 立即打断；off-rail 失败兜底 reset 重放 solutionMoves
   *   T057: 难度指标 + 机制标签 + 音效开关
   *   T058: 检查点（quickstart Q4 + SC-002）
   * ========================================================= */

  /* T053: 调试面板初始化（首次弹出 + 移动端浮动按钮 +
   * 1~LEVELS.length 动态选项填入 + 信息面板格式） */
  function initDebugPanel() {
    var d = global.document;
    if (!els.debugPanel) return;
    /* PC 默认显示 / 移动端默认收起 */
    var isPC = global.matchMedia ? global.matchMedia('(min-width:1024px)').matches : true;
    els.debugPanel.hidden = !isPC;
    if (els.debugToggle) {
      els.debugToggle.style.display = isPC ? 'none' : '';
    }

    /* T054: 关卡下拉框 = 1~LEVELS.length 动态生成（Δ4 零硬编码） */
    if (els.debugLevel && STM.LEVELS) {
      var opts = '';
      for (var i = 0; i < STM.LEVELS.length; i++) {
        var lv = STM.LEVELS[i];
        var size = (lv && lv.n) ? (lv.n + '×' + lv.n) : '?';
        var flags = levelFlagLabel(lv);
        opts += '<option value="' + (i + 1) + '">L' + (i + 1) + ' · ' + size + ' [' + flags + ']</option>';
      }
      els.debugLevel.innerHTML = opts;
    }

    /* T057: 默认静音 checkbox 反映 progress.muted */
    if (els.debugMute) {
      els.debugMute.checked = sound ? !sound.isMuted() : !progress.muted;
    }

    /* Δ22c/T112 ②: 编舞模式锁定下拉（15 种 + 随机）——评委逐种回放验收 */
    if (els.debugIntro) {
      var im = (STM.rendererTest && STM.rendererTest.INTRO_MODES) || [];
      var iopts = '<option value="random">随机（相邻不重复）</option>';
      for (var ii = 0; ii < im.length; ii++) {
        iopts += '<option value="' + ii + '">' + ii + ' · ' + im[ii] + '</option>';
      }
      els.debugIntro.innerHTML = iopts;
      els.debugIntro.value = 'random';
    }

    /* T053: 移动端浮动按钮 + 抽屉切换 */
    if (els.debugToggle) {
      els.debugToggle.addEventListener('pointerdown', onDebugToggleDown);
    }
    els.debugPanel.addEventListener('pointerdown', onDebugPanelPointerDown, true);
    if (els.debugLevel) els.debugLevel.addEventListener('change', onJumpLevel);
    if (els.debugReset) els.debugReset.addEventListener('pointerdown', onDebugResetDown);
    if (els.debugHint) els.debugHint.addEventListener('pointerdown', onDebugHintDown);
    if (els.debugAuto) els.debugAuto.addEventListener('pointerdown', onDebugAutoDown);
    if (els.debugMute) els.debugMute.addEventListener('change', onDebugMuteChange);
    if (els.debugIntro) els.debugIntro.addEventListener('change', onDebugIntroChange);
  }

  /* Δ22c/T112 ②: 切换编舞模式 → 立刻重放一次进场（评委逐种验收用） */
  function onDebugIntroChange() {
    if (!renderer || !renderer.setDealModeLock) return;
    var v = els.debugIntro ? els.debugIntro.value : 'random';
    renderer.setDealModeLock(v === 'random' ? null : parseInt(v, 10));
    startDealChoreography();
  }

  /* 关卡机制标记文本（齿轮/冰封/锁链/棱镜——按 tiles/prisms/cfg 实际出现计） */
  function levelFlagLabel(lv) {
    if (!lv) return '?';
    var flags = [];
    var tiles = lv.tiles || [];
    var hasG = false, hasI = false, hasC = false, hasK = false;
    for (var i = 0; i < tiles.length; i++) {
      var m = tiles[i].m;
      if (m === 'g') hasG = true;
      else if (m === 'i') hasI = true;
      else if (m === 'c') hasC = true;
      else if (m === 'k') hasK = true;
    }
    var prisms = lv.prisms || [];
    var hasP = prisms.length > 0;
    if (hasG) flags.push('齿轮');
    if (hasI) flags.push('冰封');
    if (hasC || hasK) flags.push('锁链');
    if (hasP) flags.push('棱镜');
    if (!flags.length) flags.push('基础');
    return flags.join('/');
  }

  function onDebugToggleDown() {
    if (!els.debugPanel) return;
    if (els.debugPanel.hidden) {
      els.debugPanel.hidden = false;
    } else {
      els.debugPanel.hidden = true;
    }
  }

  /* 面板内点击拦截（非按钮/选择器不冒泡到棋盘） */
  /* 面板内点击仅在「背景空白处」拦截——目标为按钮/选择器时不绝止
   * 冒泡，让子元素的 pointerdown / change listener 正常触发（捕获阶段
   * 拦截会阻断 reset/hint/auto 等按钮的 bubble 阶段 listener） */
  function onDebugPanelPointerDown(ev) {
    var t = ev.target;
    if (!t) return;
    if (t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'LABEL' || t === els.debugInfo) return;
    ev.stopPropagation();
  }

  /* T054: 跳关（深链等效——直接调用 loadLevel） */
  function onJumpLevel() {
    var id = parseInt(els.debugLevel.value, 10) || 1;
    /* 跳出 Bot（再点跳出） */
    stopAutoBot('跳关');
    loadLevel(id);
  }

  /* T054: 重置本关（session.reset） */
  function onDebugResetDown() {
    if (!session) return;
    stopAutoBot('重置');
    session.reset();
    renderer.refresh();
    /* Δ22c/T111: 重置本关同样是一次「开局」——重新抽签进场编舞 */
    startDealChoreography();
    renderHud();
    renderDock();
    renderItems();
    renderDebugInfo();
    /* Δ29a: 重置本关是一次新开局 → 允许横幅再弹（先清掉上一轮的残留与去重标记） */
    resetPeakBanner();
    afterIntro(showChallengeBanner);
  }

  /* T057: 难度指标 + 机制标签在面板中实时刷新 */
  function renderDebugInfo() {
    if (!els.debugInfo) return;
    if (!currentLevel) {
      els.debugInfo.innerHTML = '';
      return;
    }
    var lv = currentLevel;
    var n = lv.n || (lv.tiles && Math.sqrt(lv.tiles.length)) || 0;
    var maxZ = 0;
    var tiles = lv.tiles || [];
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].z != null && tiles[i].z + 1 > maxZ) maxZ = tiles[i].z + 1;
    }
    var mechFlags = levelFlagLabel(lv);
    var themes = lv.theme || '';
    var paintingName = '—';
    try {
      if (STM.Bestiary && typeof STM.Bestiary.paintingForLevel === 'function') {
        paintingName = STM.Bestiary.paintingForLevel(currentId).name;
      } else if (STM.Bestiary && STM.Bestiary.PAINTINGS) {
        var _pi = Math.min(STM.Bestiary.PAINTINGS.length, Math.max(1, Math.floor((currentId - 1) / 12) + 1));
        paintingName = STM.Bestiary.PAINTINGS[_pi - 1].name;
      }
    } catch (ePaint) { paintingName = '—'; }
    var suitSet = {};
    var suitCount = 0;
    for (var j = 0; j < tiles.length; j++) {
      var s = tiles[j].s;
      if (s != null && !suitSet[s]) { suitSet[s] = 1; suitCount++; }
    }
    var metrics = lv.metrics || {};
    var info =
      '<div><b>' + (lv.name || ('L' + currentId)) + '</b> · ' + n + '×' + n + ' · ' + maxZ + '层</div>' +
      '<div>主题: ' + paintingName + '</div>' +
      '<div>滑块 ' + tiles.length + ' · 花色 ' + suitCount + '</div>' +
      '<div>难度 <b>' + (metrics.difficultyScore || 0) + '</b> · 槽压峰 ' + (metrics.dockPeak || '-') +
        ' · 最优 ' + (metrics.minMoves || '-') + ' 步</div>' +
      '<div>机制: ' + mechFlags + '</div>';
    els.debugInfo.innerHTML = info;
  }

  /* T057: 音效开关（与 HUD 的 mute 同步——走 setMuted 单入口） */
  function onDebugMuteChange() {
    var on = !!els.debugMute.checked;
    setMuted(!on);
    try {
      if (STM.Profile) {
        STM.Profile.setSetting('bgm', on);
        STM.Profile.setSetting('sfx', on);
      }
    } catch (e) { }
    if (sound && sound.setBgmMute) sound.setBgmMute(!on);
    if (sound && sound.setSfxMute) sound.setSfxMute(!on);
    /* Δ23/Bug1：调试面板同样「一开就响」，与设置面板口径一致 */
    resumeBgmNow();
    renderMuteBtn();
  }

  /* =========================================================
   * T055: Hint —— on-rail 回放 solutionMoves 高亮下一步；
   *        off-rail 有界 DFS（100k 节点/300ms 时限）搜索解决方案；
   *        失败则给启发式建议 +「非保证」标记
   * ========================================================= */
  function onDebugHintDown() {
    if (!session) return;
    stopAutoBot('Hint');
    var st = session.state();
    if (st.phase === 'WON' || st.phase === 'LOST_BURST' || st.phase === 'LOST_DEADLOCK') {
      toast('终局态不可 Hint');
      return;
    }
    var tileId = -1;
    if (session.onRail()) {
      var sol = currentLevel.solutionMoves || [];
      if (currentHintIndex >= sol.length) {
        toast('已通关——无可 Hint');
        return;
      }
      tileId = sol[currentHintIndex].t;
    } else {
      var eng = session.engineState();
      var RE = STM.RulesEngine;
      tileId = (typeof session.findBestNextMove === 'function') ? session.findBestNextMove() : RE.findBestMove(eng);
      if (tileId == null || tileId < 0) {
        try { RE.healHeadOnCollisions(eng); } catch (e) { }
        tileId = RE.findBestMove(eng);
      }
      if (tileId == null || tileId < 0) {
        var tip = heuristicHint();
        if (tip != null && tip >= 0) tileId = tip;
      }
    }
    if (tileId == null || tileId < 0) {
      toast('无可用提示——尝试 Undo 或洗牌');
      return;
    }
    highlightTile(tileId, 1800);
    sound.play('click');
  }

  function highlightTile(tileId, ttlMs) {
    if (!renderer) return;
    renderer.setHighlight(tileId, ttlMs);
    currentHintIndex++;
  }

  /* off-rail DFS（动作集=tap，引信搜索——返回首步 tileId） */
  function searchHint(maxDepth, nodeCap, timeCap) {
    var eng = session.engineState();
    var RE = STM.RulesEngine;
    var nodes = 0;
    var t0 = Date.now();

    function dfs(state, depth, firstTileId) {
      if (nodes >= nodeCap || Date.now() - t0 > timeCap) return null;
      var ts = RE.terminal(state);
      if (ts === 'won') return { firstTileId: firstTileId, guaranteed: true };
      if (depth <= 0 || ts !== 'playing') return null;
      var taps = RE.enumerateTaps(state);
      /* 启发式排序: 优先 enumerateTaps 返回序（D-08 确定性） */
      for (var i = 0; i < taps.length; i++) {
        nodes++;
        var snap = RE.snapshot(state);
        var res = RE.applyTap(state, taps[i]);
        if (res.type === 'flyout' || res.type === 'prism-flyout') {
          var sub = dfs(state, depth - 1, firstTileId != null ? firstTileId : taps[i]);
          RE.restore(state, snap);
          if (sub) return sub;
        } else {
          RE.restore(state, snap);
        }
      }
      return null;
    }
    /* 浅层优先（深度 3~6）——保证首解不爆预算 */
    return dfs(RE.snapshot(eng), Math.min(maxDepth, 6), null);
  }

  /* 启发式提示: 优先 enumerateTaps 中能降低 dock 压力的 tap */
  function heuristicHint() {
    var eng = session.engineState();
    var RE = STM.RulesEngine;
    var taps = RE.enumerateTaps(eng);
    /* 当前 dock 各花色计数（1 或 2=接近 3） */
    function suitCounts() {
      var c = {};
      var dock = eng.dock || [];
      for (var i = 0; i < dock.length; i++) {
        var s = dock[i].s;
        c[s] = (c[s] || 0) + 1;
      }
      return c;
    }
    var best = -1, bestScore = -1;
    for (var i = 0; i < taps.length; i++) {
      var t = eng.tiles[taps[i]];
      if (!t || t.removed) continue;
      var cnt = suitCounts()[t.s] || 0;
      /* 优先: cnt===2（再入一个可三消）；次优: 普通滑块; 排除冰封/锁定 */
      var sc = (cnt === 2 ? 100 : cnt === 1 ? 50 : 10) - (t.ice > 0 ? 30 : 0) - (t.locked ? 50 : 0);
      if (sc > bestScore) { bestScore = sc; best = taps[i]; }
    }
    return best;
  }

  /* =========================================================
   * T056: Auto-Play Bot —— on-rail 逐 tap 回放（450ms/步）；
   *        off-rail 优先有界续解（失败→reset 重放 solutionMoves）；
   *        玩家 pointerdown 棋盘/道具 立即打断；
   *        终态自动停
   * ========================================================= */
  var autoBot = null;
  var currentHintIndex = 0;

  function onDebugAutoDown() {
    if (autoBot && autoBot.running) {
      stopAutoBot('用户点击');
      return;
    }
    if (!session) return;
    /* 终态 → 不启 */
    var st = session.state();
    if (st.phase !== 'READY' && st.phase !== 'LOADING') {
      toast('终局态不可自动演示');
      return;
    }
    startAutoBot();
  }

  function startAutoBot() {
    autoBot = {
      running: true,
      stepIndex: 0,
      failed: false,
      label: 'Bot',
      timer: 0
    };
    sound.play('botTick');
    toast('🤖 自动演示中（再次点击或点棋盘停止）');
    setAutoBtnState(true);
    scheduleNextBotStep();
  }

  function stopAutoBot(reason) {
    if (!autoBot || !autoBot.running) return;
    clearTimeout(autoBot.timer);
    autoBot.running = false;
    autoBot.timer = 0;
    setAutoBtnState(false);
    /* 不特意 toast（玩家主动停止常见，不打扰） */
  }

  function setAutoBtnState(running) {
    if (!els.debugAuto) return;
    if (running) {
      els.debugAuto.textContent = '⏹ 停止 Bot';
      els.debugAuto.classList.add('active');
    } else {
      els.debugAuto.textContent = '🤖 自动演示（Auto-Play）';
      els.debugAuto.classList.remove('active');
    }
  }

  function scheduleNextBotStep() {
    if (!autoBot || !autoBot.running) return;
    autoBot.timer = setTimeout(autoBotTick, 420);
  }

  function autoBotTick() {
    if (!autoBot || !autoBot.running) return;
    if (!session) return;
    var st = session.state();
    /* 终态 → 停止 */
    if (st.phase !== 'READY' && st.phase !== 'LOADING') {
      stopAutoBot('终态');
      return;
    }
    if (typeof session.autoPlayStep === "function") {
      var ar = session.autoPlayStep();
      if (!ar || ar.type === "locked" || ar.type === "none") { stopAutoBot("no-solution"); return; }
      if (ar.type === "magnet") { sound.play("botTick"); scheduleNextBotStep(); return; }
      if (ar.type === "tap" && ar.tileId != null) {
        autoBot.stepIndex++;
        currentHintIndex = autoBot.stepIndex;
        sound.play("botTick");
        try { highlightTile(ar.tileId, 220); } catch (eHl) {}
        scheduleNextBotStep();
        return;
      }
      stopAutoBot("no-solution");
      return;
    }
    var sol = currentLevel.solutionMoves || [];
    var RE = STM.RulesEngine;
    var tileId = null;
    if (session.onRail()) {
      /* on-rail: 直接取 solutionMoves[stepIndex].t */
      if (autoBot.stepIndex >= sol.length) {
        stopAutoBot('解已走完');
        return;
      }
      tileId = sol[autoBot.stepIndex].t;
    } else {
      /* off-rail: findBestMove 实时启发式 */
      var RE2 = STM.RulesEngine;
      var eng2 = session.engineState();
      try { RE2.healHeadOnCollisions(eng2); } catch (e) { }
      tileId = (typeof session.findBestNextMove === 'function') ? session.findBestNextMove() : RE2.findBestMove(eng2);
      if (tileId == null || tileId < 0) {
        try { RE2.healHeadOnCollisions(eng2); } catch (e) { }
        tileId = RE2.findBestMove(eng2);
      }
      if (tileId == null || tileId < 0) {
        /* 兜底 reset + 重放 */
        toast('Bot 偏离 → 重置并重放最优解');
        session.reset();
        renderer.refresh();
        renderHud();
        renderDock();
        renderItems();
        autoBot.stepIndex = 0;
        if (sol.length) {
          tileId = sol[0].t;
        } else {
          stopAutoBot('无解');
          return;
        }
      }
    }
    if (tileId == null) { stopAutoBot('空 tileId'); return; }
    var t = session.state().board; /* 已被移除/不可点击 → 跳过 */
    var exists = false;
    for (var i = 0; i < t.length; i++) {
      if (t[i].id === tileId) { exists = true; break; }
    }
    if (!exists) {
      /* 该滑块已不在棋盘上——跳过到下一步 */
      autoBot.stepIndex++;
      sound.play('botTick');
      scheduleNextBotStep();
      return;
    }
    session.tap(tileId);
    autoBot.stepIndex++;
    currentHintIndex = autoBot.stepIndex;
    sound.play('botTick');
    /* 提示框高亮此滑块（短促 200ms 视觉反馈） */
    highlightTile(tileId, 220);
    scheduleNextBotStep();
  }

  /* 玩家手动操作 → 打断 Bot（不重置进度仅停 Bot） */
  function notifyBotInterruption() {
    if (autoBot && autoBot.running) {
      stopAutoBot('玩家点击');
      toast('🤖 Bot 已停止——玩家接管');
    }
  }

  /* ---------- 输入绑定（PointerEvents 唯一输入模型——宪章 IV） ---------- */
  function bindBoardInput() {
    /* canvas tap：pointerdown 判定（点击型交互，无拖动语义） */
    els.board.removeEventListener('pointerdown', onBoardDown);
    els.board.addEventListener('pointerdown', onBoardDown);

    /* Δ17/T070: 旧结算浮层已退役 → 结算层由 STM.Result 接管（FR-042 §3
     * 必经中间态），失败页由 STM.Fail 接管（FR-043），二者均为模态场景层，
     * 不在棋盘输入绑定范围内。 */
  }

  function onBoardDown(ev) {
    if (!session || !renderer) return;
    /* M4 T056: 玩家手动点击棋盘 → 立即打断 Bot */
    notifyBotInterruption();
    /* Δ10: 终态拦截（won/lost_* 结算浮层期间棋盘不可点）；扳手选目标期间点选优先 */
    var st = session.state();
    if (st.phase !== 'READY' && st.phase !== 'LOADING') return;
    /* Δ22c/T112 ③（FR-052 §7）: 开局编舞点击快进——零迟滞。
     * 先归位（skipDeal 使 introTransformOf 立刻返回 null，全部卡牌
     * 100% 精确落回标准网格坐标），**紧接着继续走同一套命中判定**——
     * 绝不吞掉本次点击、绝不要求二次点击、绝不以「动画中」禁用输入。 */
    if (renderer.isDealing && renderer.isDealing()) {
      renderer.skipDeal();
      flushIntroGate(); /* 横幅/教学闸门同步放行 */
    }
    var id = renderer.hitTest(ev.clientX, ev.clientY);
    if (id < 0) return;
    /* Δ10 无锁连点: 瞬时结算（0ms）——连续狂点直接命中最新逻辑态的栈顶滑块 */
    session.tap(id);
  }

  /* ---------- 启动 ---------- */
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  STM.main = {
    boot: boot,
    loadLevel: loadLevel,
    enterGame: enterGame,   /* Δ18: 场景入口（大厅 → 局内）——供测试与深链复用 */
    enterLobby: enterLobby, /* Δ18: 场景入口（局内 → 大厅） */
    session: function () { return session; },
    /* 只读渲染器句柄（自动化测试断言 hitTest / 几何——不参与运行时逻辑） */
    renderer: function () { return renderer; },
    progress: progress,
    /* Δ20 Bug 1：有效已通关最大关卡号（大厅晶片点亮态的权威口径） */
    maxPassedLevel: maxPassedLevel,
    findBestMove: function (state) { return STM.RulesEngine.findBestMove(state); },
    nextHint: function () { return onDebugHintDown(); },
    /* Δ29 门禁只读探针（不参与运行时逻辑）：
     *   · isChallengeLevel / challengePercent —— 触发集合与通关率同源函数
     *   · peakTiming —— 前摇 / 冻结 / 横幅展示时序常量（delta27-verify ⑧、
     *     banner 专项断言「前摇 ∈ [60,80]ms」直接读这里，避免常量漂移成假绿）
     *   · peakBannerState —— 横幅可见性 / 主色相 / 去重标记（banner 专项断言） */
    isChallengeLevel: isChallengeLevel,
    challengePercent: challengePercent,
    peakTiming: {
      preshakeMs: PRESHAKE_MS,
      freezeMs: DOCK_FREEZE_MS,
      showMs: PEAK_SHOW_MS,
      dismissMs: PEAK_DISMISS_MS
    },
    peakBannerState: function () {
      var d = global.document;
      var el = d ? d.getElementById(PEAK_BANNER_ID) : null;
      if (!el) return { exists: false };
      var cs = d.defaultView && d.defaultView.getComputedStyle ? d.defaultView.getComputedStyle(el) : null;
      return {
        exists: true,
        show: el.classList.contains('show'),
        hide: el.classList.contains('hide'),
        text: (el.querySelector('.peak-banner-text') || {}).textContent || '',
        painting: el.getAttribute('data-painting'),
        hueA: el.style.getPropertyValue('--banner-hue-a'),
        hueB: el.style.getPropertyValue('--banner-hue-b'),
        glow: el.style.getPropertyValue('--banner-glow'),
        opacity: cs ? parseFloat(cs.opacity) : null,
        visibility: cs ? cs.visibility : null,
        pointerEvents: cs ? cs.pointerEvents : null,
        shownForLevel: bannerShownForLevel
      };
    }
  };
  try { global.findBestMove = STM.RulesEngine.findBestMove; global.nextHint = onDebugHintDown; } catch (e) { }
})(typeof window !== 'undefined' ? window : globalThis);
