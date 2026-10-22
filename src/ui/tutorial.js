/* =========================================================
 * Slide & Triple — 新手交互式玩法引导层（Δ19e/T087 / FR-046）
 * classic script；向 window.STM 挂载（D-01）
 *
 * 纯表现层铁律:
 *   · MUST NOT 写入 src/data/levels.js，MUST NOT 影响 Solver 口径与可解性
 *   · 非模态: 引导卡片本体 pointer-events:none（不冻结核心循环，FR-036 同口径）
 *   · 可随时「跳过」；L3 及以后 MUST NOT 弹出任何新手提示
 *
 * 触发边界:
 *   L1 → 基础方向滑行 + 三消引导（3 次有效点击后平滑消失）
 *   L2 → 层叠压制 + 分层独立飞行引导（2 次上层点击后平滑消失）
 *   L3~L72 → 零提示
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  var TEXT_L1 = '玩法指引：点击箭头前方无阻挡的萌宠，让它滑入上方待消槽，凑齐 3 只相同萌宠即可碎裂消除！';
  var TEXT_L2 = '层叠秘诀：变暗的下层萌宠被上层压住了！请先消去压在上面的亮色上层萌宠来解锁它（不同层之间的飞行路线互不干扰哦）';

  var state = null;   /* { levelId, need, done, session, renderer, targets: [], dismissed } */
  var els = null;
  var resizeHooked = false;
  var tutHideTimer = null;

  /* ---------- 触发边界（纯函数——自测直接断言） ---------- */
  function shouldShow(levelId) {
    return levelId === 1 || levelId === 2;
  }

  /* ---------- DOM（惰性创建——Node 自测无 document 时不触碰） ---------- */
  function ensureEls() {
    if (els || typeof document === 'undefined') return els;
    var root = document.getElementById('tutorial-root');
    var card = document.getElementById('tutorial-card');
    if (!root) {
      root = document.createElement('div');
      root.id = 'tutorial-root';
      root.hidden = true;
      var app = document.getElementById('app');
      if (app) app.appendChild(root);
    }
    var text = document.getElementById('tutorial-text');
    var step = document.getElementById('tutorial-step');
    var skip = document.getElementById('tutorial-skip');
    var hand = document.getElementById('tutorial-hand');
    if (!card && root) {
      card = root.querySelector('.tut-card');
    }
    els = { root: root, card: card, text: text, step: step, skip: skip, hand: hand };
    if (skip && !skip._stmHooked) {
      skip._stmHooked = true;
      skip.addEventListener('pointerdown', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        dismiss();
      });
      skip.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        dismiss();
      });
    }
    return els;
  }

  /* ---------- 目标选取（实际可飞出——enumerateTaps 同源口径） ---------- */
  function targetsOf(levelId, session) {
    var out = [];
    if (!session || !session.engineState || !STM.RulesEngine) return out;
    var eng = session.engineState();
    var taps = STM.RulesEngine.enumerateTaps(eng);
    var i, t;
    if (levelId === 1) {
      /* L1: 优先第一组「同花色且可达 ≥3 张」的无阻挡滑块 */
      var bySuit = {};
      var order = [];
      for (i = 0; i < taps.length; i++) {
        t = eng.tiles[taps[i]];
        if (!t || t.removed) continue;
        if (!bySuit[t.s]) { bySuit[t.s] = []; order.push(t.s); }
        bySuit[t.s].push(t.id);
      }
      for (i = 0; i < order.length; i++) {
        if (bySuit[order[i]].length >= 3) {
          out = bySuit[order[i]].slice(0, 3);
          break;
        }
      }
      if (!out.length) out = taps.slice(0, 3);
    } else if (levelId === 2) {
      /* L2: 优先「上层亮色滑块」（z≥1 且未被压）——先解锁下层 */
      for (i = 0; i < taps.length && out.length < 2; i++) {
        t = eng.tiles[taps[i]];
        if (!t || t.removed) continue;
        if ((t.z || 0) >= 1) out.push(t.id);
      }
      if (!out.length) out = taps.slice(0, 2);
    }
    return out;
  }

  function refreshTargets() {
    if (!state || state.dismissed) return;
    var targets = state.targets.filter(function (id) {
      var eng = state.session.engineState();
      var t = eng.tiles[id];
      return t && !t.removed;
    });
    if (targets.length < state.targets.length) {
      state.targets = targetsOf(state.levelId, state.session);
    }
    if (!state.targets.length) state.targets = targetsOf(state.levelId, state.session);
    if (state.renderer && state.renderer.setHighlights) {
      state.renderer.setHighlights(state.targets, 0);
    }
    placeHand();
    updateStep();
  }

  function placeHand() {
    if (!state || state.dismissed) return;
    var e = ensureEls();
    if (!e || !e.hand) return;
    var tileId = state.targets[0];
    var rect = null;
    if (state.renderer && state.renderer.tileRect) {
      try { rect = state.renderer.tileRect(tileId); } catch (err) { rect = null; }
    }
    if (!rect) { e.hand.classList.add('hidden'); return; }
    var app = document.getElementById('app');
    var base = app && app.getBoundingClientRect ? app.getBoundingClientRect() : { left: 0, top: 0 };
    e.hand.classList.remove('hidden');
    e.hand.style.left = Math.round(rect.x - base.left) + 'px';
    e.hand.style.top = Math.round(rect.y - base.top) + 'px';
  }

  function updateStep() {
    if (!state) return;
    var e = ensureEls();
    if (!e) return;
    if (e.step) e.step.textContent = '进度 ' + Math.min(state.done + 1, state.need) + ' / ' + state.need;
    if (e.text) {
      e.text.innerHTML = state.levelId === 1
        ? '玩法指引：点击箭头前方<em>无阻挡</em>的萌宠，让它滑入<em>上方待消槽</em>，凑齐 <b>3 只相同萌宠</b>即可碎裂消除！'
        : '层叠秘诀：<em>变暗的下层萌宠</em>被上层压住了！请先消去压在上面的<em>亮色上层萌宠</em>来解锁它（不同层之间的飞行路线互不干扰哦）';
    }
  }

  /* ---------- 生命周期 ---------- */
  var onResize = function () {
    if (!state || state.dismissed) return;
    placeHand();
    /* 视口变化后棋盘会重排——下一帧再对一次位 */
    global.setTimeout(placeHand, 60);
  };

  function maybeStart(levelId, ctx) {
    ctx = ctx || {};
    dismiss(); /* 幂等：换关先清上一关残留 */
    if (!shouldShow(levelId)) return null;
    var e = ensureEls();
    if (!e || !e.root) return null;
    /* 取消上一关淡出尾巴，避免新引导被 320ms 后的 hidden 误关 */
    if (tutHideTimer) { global.clearTimeout(tutHideTimer); tutHideTimer = null; }
    if (e.card) e.card.classList.remove('tut-out');

    state = {
      levelId: levelId,
      need: levelId === 1 ? 3 : 2,
      done: 0,
      session: ctx.session || null,
      renderer: ctx.renderer || null,
      targets: [],
      dismissed: false
    };

    e.root.hidden = false;
    hintText(levelId); /* 静态文案（首帧） */
    updateStep();
    /* 等棋盘完成首帧布局后再对位小手 */
    global.setTimeout(function () {
      if (!state || state.dismissed) return;
      state.targets = targetsOf(state.levelId, state.session);
      refreshTargets();
    }, 80);

    if (!resizeHooked) {
      resizeHooked = true;
      global.addEventListener('resize', onResize);
    }
    return state;
  }

  function hintText(levelId) {
    var e = ensureEls();
    if (!e) return;
    if (e.text) e.text.textContent = levelId === 1 ? TEXT_L1 : TEXT_L2;
  }

  /* 玩家每次「有效飞出」回调（main.js 的 flyout 事件） */
  function onTap(tileId) {
    if (!state || state.dismissed) return;
    var eng = state.session ? state.session.engineState() : null;
    var t = eng && eng.tiles[tileId];
    if (!t) return; /* 无效点击不计入进度 */
    if (state.levelId === 2 && (t.z || 0) < 1) {
      /* L2 只统计上层滑块；但玩家若先点下层，也不影响引导存续 */
      return;
    }
    state.done++;
    if (state.done >= state.need) {
      dismiss();
      return;
    }
    /* 目标可能已被消掉 → 重算并重新对位 */
    global.setTimeout(refreshTargets, 30);
  }

  function dismiss() {
    if (state) state.dismissed = true;
    if (state && state.renderer && state.renderer.setHighlights) {
      try { state.renderer.setHighlights([], 0); } catch (err) { /* 渲染层异常不阻塞 */ }
    }
    state = null;
    var e = ensureEls();
    if (!e || !e.root) return;
    /* 平滑消失：先播 tut-out，动画结束后再隐藏（可被下一次 maybeStart 取消） */
    if (e.card) {
      e.card.classList.remove('tut-out');
      void e.card.offsetWidth;
      e.card.classList.add('tut-out');
    }
    if (tutHideTimer) global.clearTimeout(tutHideTimer);
    tutHideTimer = global.setTimeout(function () {
      tutHideTimer = null;
      if (e.root) e.root.hidden = true;
      if (e.card) e.card.classList.remove('tut-out');
    }, 320);
  }

  STM.Tutorial = {
    maybeStart: maybeStart,
    onTap: onTap,
    dismiss: dismiss,
    isActive: function () { return !!(state && !state.dismissed); },
    /* 自测口（离线 render-selftest 断言触发边界/目标可达） */
    _shouldShow: shouldShow,
    _targetsOf: targetsOf,
    _text: function (levelId) { return levelId === 1 ? TEXT_L1 : TEXT_L2; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
