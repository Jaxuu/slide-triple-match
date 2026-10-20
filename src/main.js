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
      toast: ensureToast(d)
    };
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

    /* Δ15b/T052i: 贴图就绪惰性换装——Dock chip 同步刷新（棋盘由渲染器
     * markDirty 重绘；贴图后到不闪烁——同关内同 suit 恒同来源） */
    if (STM.IconAssets && STM.IconAssets.onSpritesReady) {
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
