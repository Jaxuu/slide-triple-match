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
  var progress = { v: 1, unlocked: 1, last: 1, best: {}, muted: false };
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
        }
      }
    } catch (e) { storageUsable = false; } /* 隐私模式/禁用 → 内存进度（D-03） */
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
    saveProgress();
  }

  function setMuted(m) {
    progress.muted = m;
    if (sound) sound.setMuted(m);
    saveProgress();
  }

  /* =========================================================
   * T020: boot 流程与 LEVELS.length 动态化（Δ4——禁止硬编码关数）
   * ========================================================= */
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

    /* 深链 ?level=N 优先；否则自动进 unlocked 关（Q3.6） */
    loadLevel(deepId > 1 ? deepId : progress.unlocked);
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
      hudName: d.getElementById('hud-level-name'),
      hudNo: d.getElementById('hud-level-no'),
      hudLives: d.getElementById('hud-lives'),
      hudCombo: d.getElementById('hud-combo'),
      hudScore: d.getElementById('hud-score'),
      board: d.getElementById('board'),
      boardWrap: d.getElementById('board-wrap'),
      dock: d.getElementById('dock'),
      items: d.getElementById('items'),
      overlay: d.getElementById('result-overlay'),
      resultTitle: d.getElementById('result-title'),
      resultDetail: d.getElementById('result-detail'),
      btnRetry: d.getElementById('result-retry'),
      btnNext: d.getElementById('result-next'),
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
  /* M4 T053: 移动端调试面板折叠按钮（PC 端不显示） */
  function ensureDebugToggle(d) {
    var t = d.getElementById('debug-toggle');
    if (!t) {
      t = d.createElement('button');
      t.id = 'debug-toggle';
      t.type = 'button';
      t.title = '调试面板';
      t.textContent = '🛠 调试';
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

    hideOverlay();
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
    exitWrenchMode();

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
   * 挑战位集合 = L3 ∪ (id-4)%3==2 位（L6/L9/…/L60，共 20 关——
   * 每个三关循环各含 1 难关；内嵌精确集合，勿只取 (id-4)%3==2 漏 L3）
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
  function renderHud() {
    var s = session.state();
    els.hudName.textContent = currentLevel.name || ('Level ' + currentId);
    els.hudNo.textContent = currentId + '/' + (STM.LEVELS.length); /* 动态关数（Δ4） */
    /* 生命 ♥×3 DOM */
    var livesHtml = '';
    var total = (currentLevel.cfg && currentLevel.cfg.lives) || 3;
    for (var i = 0; i < total; i++) {
      livesHtml += '<span class="life' + (i < s.lives ? '' : ' lost') + '">♥</span>';
    }
    els.hudLives.innerHTML = livesHtml;
    els.hudCombo.textContent = s.combo > 0 ? 'x' + s.combo + ' combo' : '';
    els.hudScore.textContent = String(s.score);
    if (s.combo > 0) {
      els.hudCombo.classList.remove('bump');
      void els.hudCombo.offsetWidth; /* 重启动画 */
      els.hudCombo.classList.add('bump');
    }
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
    setItemBtn('item-undo', it.undo, false);
    /* 扳手: 无余量禁用; 扳手选择态由 wrenchMode 控制（道具仅 2 种——暂存区已移除） */
    setItemBtn('item-wrench', it.wrench, wrenchMode);
    if (wrenchMode) {
      var wb = global.document.getElementById('item-wrench');
      if (wb) wb.classList.add('selecting');
    }
  }

  function setItemBtn(btnId, count, selecting, disabledExtra) {
    var btn = global.document.getElementById(btnId);
    if (!btn) return;
    var cnt = count == null ? 0 : count;
    var countEl = btn.querySelector('.item-count');
    if (countEl) countEl.textContent = String(cnt);
    btn.disabled = cnt <= 0 || !!disabledExtra;
    if (!selecting) btn.classList.remove('selecting');
  }

  /* ---------- T031/T035 道具交互编排（道具 2 种: undo/wrench——暂存区已移除） ---------- */
  var wrenchMode = false; /* 扳手目标选择模式 */

  function bindItemInput() {
    var undo = global.document.getElementById('item-undo');
    var wrench = global.document.getElementById('item-wrench');
    if (undo) {
      undo.removeEventListener('pointerdown', onUndoDown);
      undo.addEventListener('pointerdown', onUndoDown);
    }
    if (wrench) {
      wrench.removeEventListener('pointerdown', onWrenchDown);
      wrench.addEventListener('pointerdown', onWrenchDown);
    }
  }

  function onUndoDown() {
    if (!session) return;
    notifyBotInterruption(); /* M4 T056: 玩家道具操作 → 打断 Bot */
    var r = session.useItem('undo');
    if (r) {
      sound.play('undo');
      renderer.refresh();
      renderDock();
      renderHud();
      renderItems();
      toast('已撤回一步');
    }
  }

  function onWrenchDown() {
    if (!session) return;
    notifyBotInterruption(); /* M4 T056: 玩家道具操作 → 打断 Bot */
    var s = session.state();
    if (!s.items || s.items.wrench <= 0) return;
    wrenchMode = !wrenchMode;
    renderItems();
    if (wrenchMode) toast('点选要转向的滑块');
  }

  function exitWrenchMode() {
    if (wrenchMode) {
      wrenchMode = false;
      renderItems();
    }
  }

  /* ---------- session 事件 → 渲染/音效（Δ10 无锁连点：事件即时转发，动画并发） ---------- */
  function handleSessionEvent(e) {
    if (e.e === 'phase') { renderHud(); return; }
    if (e.e === 'reset') {
      renderer.refresh(); renderHud(); renderDock(); renderItems();
      return;
    }
    /* Δ10: 「别急，动画中…」Toast 与 input-locked 提示音已删除——
     * 动画期间不再拦截点击；仅终态时 GameState 才发 input-locked（静默忽略） */
    if (e.e === 'input-locked') return;
    if (e.e === 'click') { sound.play('click'); return; }
    if (e.e === 'flyout') { sound.play('flyout'); renderer.handleEvent(e); renderer.refresh(); renderDock(); renderHud(); return; }
    if (e.e === 'blocked') {
      sound.play('blocked');
      renderer.handleEvent(e);
      renderer.refresh(); /* Δ10: 弹回动画滑块由动画层绘制（blockSet 防重影），逻辑态即时刷新 */
      return;
    }
    if (e.e === 'dock' || e.e === 'match' || e.e === 'remove') {
      if (e.e === 'match') sound.play('match', e.combo);
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
      var isLast = currentId >= STM.LEVELS.length; /* 动态终局判定（Δ4） */
      var best = progress.best[currentId];
      var detail = isLast
        ? '全部 ' + STM.LEVELS.length + ' 关通关！ 总分 ' + o.score + ' · 连击 x' + o.combo
        : '得分 ' + o.score + ' · 连击 x' + o.combo + (best ? ' · 最佳 ' + best.score : '');
      showOverlay(isLast ? '全通关！' : '胜利！', detail, !isLast);
    } else {
      sound.play('defeat');
      progress.last = currentId; /* 失败也记录 last（刷新回本关） */
      saveProgress();
      var reason = o.kind === 'lost_burst' ? '收集槽爆满' :
        o.kind === 'lost_lives' ? '生命耗尽' : '陷入死局';
      showOverlay('失败', reason + ' · 得分 ' + o.score, false);
    }
  }

  function showOverlay(title, detail, showNext) {
    els.resultTitle.textContent = title;
    els.resultTitle.className = title.indexOf('全通关') >= 0 ? 'clear' : (title === '胜利！' ? 'win' : 'lose');
    els.resultDetail.textContent = detail;
    els.btnNext.hidden = !showNext;
    els.overlay.hidden = false;
  }

  function hideOverlay() { els.overlay.hidden = true; }

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

    /* 结算浮层按钮 */
    els.btnRetry.removeEventListener('pointerdown', onRetryDown);
    els.btnRetry.addEventListener('pointerdown', onRetryDown);
    els.btnNext.removeEventListener('pointerdown', onNextDown);
    els.btnNext.addEventListener('pointerdown', onNextDown);
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
    /* T035 扳手目标选择模式: 点击即施加转向（不 tap） */
    if (wrenchMode) {
      var r = session.useItem('wrench', id);
      if (r && r.type === 'wrench') {
        sound.play('gear');
        exitWrenchMode();
        renderer.refresh();
        renderHud();
        renderItems();
        toast('已顺时针转向');
      } else if (r && r.type === 'invalid') {
        toast('该滑块不可转向');
      }
      return;
    }
    /* Δ10 无锁连点: 瞬时结算（0ms）——连续狂点直接命中最新逻辑态的栈顶滑块 */
    session.tap(id);
  }

  function onRetryDown() {
    if (!session) return;
    session.reset();
    hideOverlay();
    renderer.refresh();
    renderDock();
    renderItems();
    renderHud();
    showChallengeBanner(); /* Δ14/T052e: 重开本关挑战横幅可再弹（FR-036 §3） */
  }

  function onNextDown() {
    if (!session) return;
    /* id+1 > LEVELS.length → 终局占位（已在 handleTerminal 处理为全通关） */
    var next = currentId + 1;
    if (next > STM.LEVELS.length) next = STM.LEVELS.length;
    loadLevel(next);
  }

  /* ---------- 启动 ---------- */
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  STM.main = { boot: boot, loadLevel: loadLevel, session: function () { return session; }, progress: progress };
})(typeof window !== 'undefined' ? window : globalThis);
