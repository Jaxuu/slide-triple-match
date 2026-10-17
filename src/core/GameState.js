/* =========================================================
 * Slide & Triple — GameState（会话编排层）
 * classic script；向 window.STM 挂载（D-01）
 * 不实现任何规则（纯编排）——规则语义全部在 RulesEngine
 *
 * 状态机（data-model.md §7）:
 *   LOADING → READY ⇄ ANIMATING → SETTLING → READY …
 *   READY ──判定──→ WON | LOST_BURST | LOST_LIVES | LOST_DEADLOCK
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};
  var RE = STM.RulesEngine;

  var PHASE = {
    LOADING: 'LOADING',
    READY: 'READY',
    ANIMATING: 'ANIMATING',
    SETTLING: 'SETTLING',
    WON: 'WON',
    LOST_BURST: 'LOST_BURST',
    LOST_LIVES: 'LOST_LIVES',
    LOST_DEADLOCK: 'LOST_DEADLOCK'
  };

  /* 级联动画时长上限（超时强制结算解锁，防卡死——game-session.md §2） */
  var MAX_ANIM_MS = 1200;
  /* 连击窗口：连续三消间隔 < 1.5s（game-session.md §2） */
  var COMBO_WINDOW_MS = 1500;

  function createSession(levelDef, handlers) {
    handlers = handlers || {};
    var onEvent = handlers.onEvent || function () {};
    var onTerminal = handlers.onTerminal || function () {};

    var engine = RE.init(levelDef);
    var phase = PHASE.READY;
    var history = [];            /* 快照栈（Undo 基础设施） */
    var lastMatchAt = 0;         /* 连击窗口时间戳 */
    var comboActive = false;
    var railIndex = 0;           /* onRail 基准：已匹配 solutionMoves 前缀长度 */
    var onRail = true;
    var animTimer = null;

    /* ---- 事件转发（Renderer/SoundManager 订阅） ---- */
    var ready = false; /* 构造期静默标志：调用方尚未拿到 session 引用 */

    function emit(e) {
      if (!ready && e.e === 'phase') return; /* 构造期 phase 事件延后 */
      onEvent(e);
    }

    function emitPhase() {
      if (ready) onEvent({ e: 'phase', phase: phase, score: engine.score, combo: engine.combo, lives: engine.lives });
    }

    /* ---- 终局判定调度（SETTLING 末尾，顺序固定：won → burst → lives → deadlock） ---- */
    function judgeTerminal() {
      var t = RE.terminal(engine);
      if (t === 'playing') return;
      phase = t === 'won' ? PHASE.WON
        : t === 'lost_burst' ? PHASE.LOST_BURST
        : t === 'lost_lives' ? PHASE.LOST_LIVES
        : PHASE.LOST_DEADLOCK;
      emitPhase();
      onTerminal({ kind: t, score: engine.score, combo: engine.combo });
    }

    /* ---- 动画锁：ANIMATING/SETTLING 期间 tap 忽略（忽略 + 短提示音策略） ---- */
    function lockForAnimation(durationMs, done) {
      phase = PHASE.ANIMATING;
      emitPhase();
      if (animTimer) clearTimeout(animTimer);
      /* 上限 1.2s 强制结算解锁 */
      animTimer = setTimeout(function () {
        animTimer = null;
        phase = PHASE.SETTLING;
        emitPhase();
        done();
        if (phase === PHASE.SETTLING) {
          phase = PHASE.READY;
          emitPhase();
        }
        judgeTerminal();
      }, Math.min(durationMs, MAX_ANIM_MS));
    }

    /* ---- 计分记账（连击窗口由会话层管理；引擎 combo 为累计三消数） ----
     * 引擎已按 comboBase+combo×comboStep 计分（settleMatches）。
     * 会话层补连击窗口语义：连续三消间隔 <1.5s 才算连击链。 */
    function windowCombo() {
      var now = Date.now();
      if (comboActive && now - lastMatchAt < COMBO_WINDOW_MS) {
        lastMatchAt = now;
        return true; /* 窗口内续击 */
      }
      lastMatchAt = now;
      comboActive = true;
      return false;
    }

    /* ---- onRail 维护：动作序列 == solutionMoves 前缀 ---- */
    function trackRail(action) {
      if (!onRail) return false;
      var sol = levelDef.solutionMoves || [];
      if (railIndex < sol.length && sol[railIndex].k === action.k && sol[railIndex].t === action.t) {
        railIndex++;
        return true;
      }
      onRail = false;
      return false;
    }

    /* ---- 公共动作 API（玩家输入与 Bot/Hint 同一入口） ---- */
    function tap(tileId) {
      if (phase === PHASE.ANIMATING || phase === PHASE.SETTLING) {
        emit({ e: 'input-locked' });
        return null;
      }
      if (phase !== PHASE.READY) {
        emit({ e: 'input-locked' });
        return null;
      }

      var isFly = false;
      var t = engine.tiles[tileId];
      if (t && !t.removed && (RE.canTap(engine, tileId))) {
        isFly = true;
      }
      if (!isFly) {
        emit({ e: 'input-locked' });
        return null;
      }

      /* 每原子回合前快照入栈（Undo 基础设施） */
      history.push(RE.snapshot(engine));
      if (history.length > 200) history.shift(); /* 界栈深防泄漏 */

      var result = RE.applyTap(engine, tileId);
      trackRail({ k: 0, t: tileId });

      /* 事件流转发（渲染/音效） */
      emit({ e: 'click', tileId: tileId });
      var i;
      for (i = 0; i < result.events.length; i++) emit(result.events[i]);
      if (result.type === 'flyout' || result.type === 'prism-flyout' || result.type === 'staged-return') emit({ e: 'flyout', tileId: tileId, path: result.path });
      if (result.type === 'blocked') emit({ e: 'blocked', tileId: tileId, path: result.path, damage: result.damage });
      for (i = 0; i < result.events.length; i++) {
        if (result.events[i].e === 'match') windowCombo();
      }

      if (result.type === 'blocked') {
        /* 弹回动画短锁 */
        lockForAnimation(380, function () {});
        return result;
      }

      /* 飞出/入槽/三消动画锁（级联时长上限 1.2s 兜底） */
      lockForAnimation(result.events.length > 1 ? 700 : 450, function () {});
      return result;
    }

    /* ---- 只读视图 ---- */
    function state() {
      return {
        phase: phase,
        score: engine.score,
        combo: engine.combo,
        lives: engine.lives,
        items: engine.items,
        dock: engine.dock.map(function (t) { return { id: t.id, s: t.s }; }),
        staging: engine.staging.map(function (t) { return { id: t.id, s: t.s }; }),
        board: RE.renderProbe(engine).tiles,
        n: engine.n
      };
    }

    /* ---- onRail 判定（D-06 Bot/Hint 基准） ---- */
    function onRailCheck() { return onRail; }

    /* ---- 重置当前关（调试面板/败局重玩） ---- */
    function reset() {
      engine = RE.init(levelDef);
      phase = PHASE.READY;
      history = [];
      railIndex = 0;
      onRail = true;
      comboActive = false;
      lastMatchAt = 0;
      if (animTimer) { clearTimeout(animTimer); animTimer = null; }
      emit({ e: 'reset' });
      emitPhase();
    }

    /* ---- 道具编排（M2 T031/T032 实现；M1 占位接口） ---- */
    function useItem(item, tileId) {
      emit({ e: 'item-unavailable', item: item });
      return null;
    }

    function tapStaged(tileId) {
      emit({ e: 'input-locked' });
      return null;
    }

    /* ---- 引擎态直访（Renderer 轮询用） ---- */
    function engineState() { return engine; }

    ready = true; /* 构造完毕：此后事件可正常下发（首 phase 事件于返回后异步发） */
    var api = {
      tap: tap,
      tapStaged: tapStaged,
      useItem: useItem,
      reset: reset,
      state: state,
      onRail: onRailCheck,
      engineState: engineState,
      PHASE: PHASE
    };
    setTimeout(function () { emitPhase(); }, 0); /* 首次 phase 通知（调用方此时已持有 session） */
    return api;
  }

  STM.GameState = { createSession: createSession, PHASE: PHASE };
})(typeof window !== 'undefined' ? window : globalThis);
