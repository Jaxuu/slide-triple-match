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

  function boot() {
    cacheEls();
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

    sound = STM.createSoundManager({});
    if (sound.setMuted && progress.muted) sound.setMuted(progress.muted);

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

    /* Δ16d/T066: HooLey Games 开机动画（FR-038——纯表现层）
     * Δ17/T068: 落点改为**主大厅**（FR-039——开机后与每关结算后的必经枢纽）
     * 动画 MUST NOT 触碰进度/棱晶/拼图态——本调用不写任何持久化状态。
     * 首次点击/按键可跳过，落点与自然播完一致（均进入大厅）。 */
    scene = SCENE.SPLASH;
    var startGame = function () {
      /* 深链 ?level=N 优先；否则进入大厅（大厅内 `关卡 X` 按钮再进局内） */
      if (deepId > 1) enterGame(deepId);
      else enterLobby({ unlocked: progress.unlocked, level: progress.last });
    };
    if (STM.Splash) {
      /* sound 已创建 → 注入供开机和弦音（playBootChime）使用 */
      STM.Splash.show({ sound: sound, onDone: startGame });
    } else {
      startGame();
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
      debugMute: d.getElementById('debug-mute')
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

    renderer = STM.createBoardRenderer(els.board, session, {
      onShake: shakeBoard
    });
    renderer.setLevel(currentLevel); /* Δ14: 渲染层花色映射/背景随当前关 id 切换 */
    renderer.refresh();

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

    /* Δ19e/T087: L1/L2 交互式教学（L3+ 零提示——纯表现层，不阻塞输入） */
    if (STM.Tutorial) {
      if (STM.Tutorial.dismiss) STM.Tutorial.dismiss();
      STM.Tutorial.maybeStart(id, { session: session, renderer: renderer });
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
      if (els.debugMute) els.debugMute.checked = !!progress.muted;
    }
    /* 同步下拉框当前选中 → currentId */
    if (els.debugLevel) els.debugLevel.value = String(id);
    renderDebugInfo();
    currentHintIndex = 0; /* 跳关 → 重置 onRail 解前缀计数器 */
    /* 跳出任何残留 Bot */
    stopAutoBot('载入关卡');

    startBgStage(currentId); /* Δ15b3: 全视口背景舞台（贴图 + 氛围 + 粒子） */
    showChallengeBanner(); /* Δ14/T052e: 挑战位关开局 1.6s 激励横幅（FR-036） */
  }

  /* =========================================================
   * Δ14/T052e: 困难关挑战横幅（FR-036）
   * 挑战位集合 = L3 ∪ (id-4)%3==2 位（L6/L9/…/L72，共 24 关——
   * Δ16a: 20→24 关（72 关 = 24 个三关循环，每循环 1 难关 + L3）；
   * 内嵌精确集合，勿只取 (id-4)%3==2 漏 L3）
   * 非模态: pointer-events:none + 不冻结 rAF/判定；1.6s 自动消散
   * ========================================================= */
  function isChallengeLevel(id) {
    return id === 3 || (id - 4) % 3 === 2;
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
  function showChallengeBanner() {
    if (!isChallengeLevel(currentId)) return;
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    var el = ensureBannerEl();
    el.textContent = '🔥 挑战关卡！只有 ' + challengePercent(currentId) + '% 的玩家能一次通过这一关';
    el.classList.remove('show');
    void el.offsetWidth; /* 重启动画 */
    el.classList.add('show');
    bannerTimer = setTimeout(function () {
      el.classList.remove('show');
      bannerTimer = null;
    }, 1600);
  }

  function ensureBannerEl() {
    var d = global.document;
    var b = d.getElementById('challenge-banner');
    if (!b) {
      b = d.createElement('div');
      b.id = 'challenge-banner';
      d.getElementById('app').appendChild(b);
    }
    return b;
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
  var IQ_START = 90;
  var IQ_TITLES = [
    { min: 180, name: '旷世奇才' },
    { min: 150, name: '最强大脑' },
    { min: 120, name: '超凡头脑' },
    { min: 100, name: '逻辑达人' },
    { min: 0, name: '敏锐直觉' }
  ];
  var iqValue = IQ_START;
  var iqTitle = '敏锐直觉';
  var iqDeltaTimer = null;

  function iqTitleOf(v) {
    for (var i = 0; i < IQ_TITLES.length; i++) {
      if (v >= IQ_TITLES[i].min) return IQ_TITLES[i].name;
    }
    return IQ_TITLES[IQ_TITLES.length - 1].name;
  }

  function resetIq() {
    iqValue = IQ_START;
    iqTitle = iqTitleOf(iqValue);
    if (els.iqValue) els.iqValue.textContent = String(iqValue);
    if (els.iqPill) {
      els.iqPill.classList.remove('level-up');
      els.iqPill.classList.remove('iq-broken');
    }
    if (els.iqDelta) { els.iqDelta.textContent = ''; els.iqDelta.classList.remove('show'); }
  }

  /* 每次成功三消: IQ += 3 + combo × 2（绿色跳字 + 放大动效）；
   * 头衔在 100 / 120 / 150 / 180 处依次晋升。 */
  function addIq(gain, combo) {
    iqValue += gain;
    var next = iqTitleOf(iqValue);
    var leveled = next !== iqTitle;
    iqTitle = next;
    if (els.iqValue) els.iqValue.textContent = String(iqValue);
    if (els.iqDelta) {
      /* 绿色跳字固定展示本次增量（如 +5 / +9） */
      els.iqDelta.textContent = '+' + gain;
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

  /* 受阻反弹: IQ 不减少，但连击立即归零（重置由 GameState.breakCombo 权威执行，
   * 此函数仅负责表现层的红闪与 HUD 刷新） */
  function breakComboOnBlocked() {
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
    if (els.iqValue) els.iqValue.textContent = String(iqValue);
  }

  function renderDock() {
    var s = session.state();
    /* Dock 7 格（Δ14: chipSVG 消费当前关花色映射——与棋盘图鉴口径一致） */
    var html = '';
    for (var i = 0; i < 7; i++) {
      if (i < s.dock.length) {
        html += '<div class="slot has-tile" data-idx="' + i + '">' + STM.chipSVG(s.dock[i].s, currentLevel) + '</div>';
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
      resetIq();
      renderer.refresh(); renderHud(); renderDock(); renderItems();
      return;
    }
    /* Δ10: 「别急，动画中…」Toast 与 input-locked 提示音已删除——
     * 动画期间不再拦截点击；仅终态时 GameState 才发 input-locked（静默忽略） */
    if (e.e === 'input-locked') return;
    if (e.e === 'click') {
      sound.play('click');
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
    if (e.e === 'dock' || e.e === 'match' || e.e === 'remove') {
      if (e.e === 'match') {
        sound.play('match', e.combo);
        /* Δ19c/T085: 每次三消 IQ += 3 + combo × 2（绿色跳字 + 放大动效） */
        addIq(3 + (e.combo || 0) * 2, e.combo || 0);
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
    if (e.e === 'undo') { renderer.refresh(); renderDock(); renderHud(); renderItems(); return; }
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
      sound.play('victory');
      recordWin(currentId, o.score, o.combo); /* T050: unlocked/max 刷新 + 持久化 */
      /* Δ16e/T070: 结算奖励 + 晶片点亮（FR-041 §1 确定性表，幂等） */
      var settlement = settleWin(currentId);
      enterResult(settlement);
    } else {
      sound.play('defeat');
      progress.last = currentId; /* 失败也记录 last（刷新回本关） */
      saveProgress();
      var reason = o.kind === 'lost_burst' ? '收集槽爆满' :
        o.kind === 'lost_lives' ? '生命耗尽' : '陷入死局';
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
    STM.Result.show({
      level: settlement.level,
      shards: settlement.shards,
      litChip: settlement.litChip,
      paintingFull: settlement.paintingFull,
      firstClear: settlement.firstClear,
      onContinue: function () { enterLobby({ unlocked: progress.unlocked, level: progress.last }); }
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
    sound.play('match', 3);
    renderer.refresh();
    renderDock();
    renderHud();
    renderItems();
    STM.Fail.hide();
    scene = SCENE.GAME;
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
      els.debugMute.checked = !!progress.muted;
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
    renderHud();
    renderDock();
    renderItems();
    renderDebugInfo();
    showChallengeBanner();
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
    var suitSet = {};
    var suitCount = 0;
    for (var j = 0; j < tiles.length; j++) {
      var s = tiles[j].s;
      if (s != null && !suitSet[s]) { suitSet[s] = 1; suitCount++; }
    }
    var metrics = lv.metrics || {};
    var info =
      '<div><b>' + (lv.name || ('L' + currentId)) + '</b> · ' + n + '×' + n + ' · ' + maxZ + '层</div>' +
      '<div>主题: ' + (themes || '—') + '</div>' +
      '<div>滑块 ' + tiles.length + ' · 花色 ' + suitCount + '</div>' +
      '<div>难度 <b>' + (metrics.difficultyScore || 0) + '</b> · 槽压峰 ' + (metrics.dockPeak || '-') +
        ' · 最优 ' + (metrics.minMoves || '-') + ' 步</div>' +
      '<div>机制: ' + mechFlags + '</div>';
    els.debugInfo.innerHTML = info;
  }

  /* T057: 音效开关（与 HUD 的 mute 同步——走 setMuted 单入口） */
  function onDebugMuteChange() {
    setMuted(!!els.debugMute.checked);
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
    /* 必须在 READY 态 */
    var st = session.state();
    if (st.phase === 'WON' || st.phase === 'LOST_BURST' || st.phase === 'LOST_LIVES' || st.phase === 'LOST_DEADLOCK') {
      toast('终局态不可 Hint');
      return;
    }
    /* 已存在高亮 → 用户再次请求相同高亮=无操作（避免频繁闪烁） */
    if (session.onRail()) {
      var sol = currentLevel.solutionMoves || [];
      if (currentHintIndex >= sol.length) {
        toast('已通关——无可 Hint');
        return;
      }
      var tileId = sol[currentHintIndex].t;
      highlightTile(tileId, 1800);
      return;
    }
    /* off-rail → 有界 DFS 搜索（复用 T033 死锁复证搜索器同形 action set） */
    var found = searchHint(/*depth*/6, /*nodeCap*/100000, /*timeCap*/300);
    if (found && found.firstTileId != null) {
      highlightTile(found.firstTileId, 1800);
      if (found.guaranteed) {
        sound.play('click');
      } else {
        toast('非保证建议');
      }
      return;
    }
    /* 失败 → 启发式: 找一个能飞出、且降低当前 dock 压力的 tap */
    var tip = heuristicHint();
    if (tip != null && tip >= 0) {
      highlightTile(tip, 1800);
      toast('启发式建议（非保证）');
    } else {
      toast('无可用提示——尝试 Undo 或扳手');
    }
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
    autoBot.timer = setTimeout(autoBotTick, 450);
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
      /* off-rail: 优先尝试有界 DFS 续解 */
      var r = searchHint(6, 50000, 200);
      if (r && r.firstTileId != null) {
        tileId = r.firstTileId;
      } else {
        /* 兜底 reset + 重放（保证「直至该关胜利」承诺） */
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
    maxPassedLevel: maxPassedLevel
  };
})(typeof window !== 'undefined' ? window : globalThis);
