/* =========================================================
 * Slide & Triple — GameState（会话编排层）
 * classic script；向 window.STM 挂载（D-01）
 * 不实现任何规则（纯编排）——规则语义全部在 RulesEngine
 *
 * 状态机（data-model.md §7；Δ10 无锁连点）:
 *   LOADING → READY → WON | LOST_BURST | LOST_DEADLOCK
 *   逻辑瞬时结算：applyTap 同步执行（0ms），动画纯视觉异步并发；
 *   不存在 ANIMATING/SETTLING 输入锁——「别急，动画中…」提示已删除
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};
  var RE = STM.RulesEngine;

  var PHASE = {
    LOADING: 'LOADING',
    READY: 'READY',
    WON: 'WON',
    LOST_BURST: 'LOST_BURST',
    LOST_DEADLOCK: 'LOST_DEADLOCK'
  };

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

    /* ---- 事件转发（Renderer/SoundManager 订阅） ---- */
    var ready = false; /* 构造期静默标志：调用方尚未拿到 session 引用 */

    function emit(e) {
      if (!ready && e.e === 'phase') return; /* 构造期 phase 事件延后 */
      onEvent(e);
    }

    function emitPhase() {
      if (ready) onEvent({ e: 'phase', phase: phase, score: engine.score, combo: engine.combo, lives: engine.lives });
    }

    /* ---- T033 死锁复证搜索器（D-09 防误杀——M2 保守预算 3k 节点/60ms; M4 校准） ----
     * 动作集与 Solver 同构: 仅 enumerateTaps
     * Δ19: **扳手道具下线**（FR-048 §4）——道具动作不再进入死局复证搜索器；
     *   灵犀三消/乾坤洗牌属道具层超常能力，MUST NOT 进入死局判定口径
     *   （FR-032 铁律：玩家实际可玩局面集合 = 求解器验证过的可解局面集合）。
     * true = 复证通过（确死）; false = 找到出路（非死锁） */
    function verifyDeadlock() {
      var nodes = 0;
      var NODE_CAP = 3000;
      var TIME_CAP = 60;
      var t0 = Date.now();

      function dfs(depth) {
        if (nodes >= NODE_CAP || Date.now() - t0 > TIME_CAP) return false; /* 预算尽 → 非确死 */
        if (RE.terminal(engine) === 'won') return true; /* 找到通关出路 → 非死锁 */
        if (depth <= 0) return false;
        var snap = RE.snapshot(engine);
        var out = false;
        try {
          /* ① tap 动作 */
          var taps = RE.enumerateTaps(engine);
          for (var i = 0; i < taps.length && !out; i++) {
            var snapI = RE.snapshot(engine);
            var r = RE.applyTap(engine, taps[i]);
            nodes++;
            if (r.type === 'flyout' || r.type === 'prism-flyout') {
              out = dfs(depth - 1);
            }
            RE.restore(engine, snapI);
          }
        } finally {
          RE.restore(engine, snap);
        }
        return out;
      }
      /* won 已在 judgeTerminal 排除; 此处搜索「有无任何出路」: 找到 won=true → 非死锁 */
      var found = dfs(4);
      /* 语义翻转: dfs 返回 true = 通关可达 = 非死锁 */
      return !found;
    }

    /* ---- 终局判定调度（SETTLING 末尾，顺序固定：won → burst → deadlock） ---- */
    function judgeTerminal() {
      var t = RE.terminal(engine);
      if (t === 'playing') {
        /* T033: 疑死锁 → 复证（D-09 防误杀——复证失败才判负） */
        if (RE.deadlockSuspect(engine)) {
          var confirmed = verifyDeadlock();
          if (confirmed) {
            phase = PHASE.LOST_DEADLOCK;
            emitPhase();
            onTerminal({ kind: 'lost_deadlock', score: engine.score, combo: engine.combo });
          }
          /* 复证失败 → 继续游戏（保守不误杀） */
        }
        return;
      }
      phase = t === 'won' ? PHASE.WON
        : t === 'lost_burst' ? PHASE.LOST_BURST
        : PHASE.LOST_DEADLOCK;
      emitPhase();
      onTerminal({ kind: t, score: engine.score, combo: engine.combo });
    }

    /* ---- Δ10 无锁连点：逻辑瞬时结算（0ms 同步），无动画锁 ----
     * 终局判定调度（每原子回合末，顺序固定：won → burst → lives → deadlock） */

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

    /* Δ19c/T084: 受阻清空连击（表现层 IQ 不扣分，但 combo 必须归零）
     * 引擎 combo 为连击倍率来源，归零后下一次三消从 base 重新起跳。 */
    function breakCombo() {
      engine.combo = 0;
      comboActive = false;
      lastMatchAt = 0;
      emitPhase();
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

    /* ---- 公共动作 API（玩家输入与 Bot/Hint 同一入口） ----
     * Δ10 无锁连点: 仅终态（won/lost_*）拦截；READY 期间 0ms 瞬时结算——
     * flyout 后格子立即腾空，renderProbe 即时反映，连续点击直接命中下层滑块 */
    function tap(tileId) {
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
        if (t && !t.removed) {
          /* Δ19c/T085: 被压/冰封/机关锁定的滑块点击同样视为「受阻」——
           * 不扣 IQ，但必须立即清空连击（与射线受阻同一表现口径）。 */
          emit({ e: 'blocked', tileId: tileId, path: [], damage: 0 });
          breakCombo();
        } else {
          emit({ e: 'input-locked' });
        }
        return null;
      }

      /* 每原子回合前快照入栈（Undo 基础设施） */
      history.push(RE.snapshot(engine));
      if (history.length > 200) history.shift(); /* 界栈深防泄漏 */

      var result = RE.applyTap(engine, tileId);
      trackRail({ k: 0, t: tileId });

      /* 事件流转发（渲染/音效——动画并发非阻塞，由 Renderer 各自动画槽消化） */
      emit({ e: 'click', tileId: tileId });
      var i;
      for (i = 0; i < result.events.length; i++) emit(result.events[i]);
      if (result.type === 'flyout' || result.type === 'prism-flyout') emit({ e: 'flyout', tileId: tileId, path: result.path });
      if (result.type === 'blocked') {
        emit({ e: 'blocked', tileId: tileId, path: result.path, damage: result.damage });
        breakCombo(); /* Δ19c/T084: 受阻 MUST 立即清空连击（IQ 不扣分） */
      }
      for (i = 0; i < result.events.length; i++) {
        if (result.events[i].e === 'match') windowCombo();
      }

      /* 瞬时终局判定（无 SETTLING 等待——级联已在 applyTap 内原子结算完毕） */
      judgeTerminal();
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
      emit({ e: 'reset' });
      emitPhase();
    }

    /* ---- 道具编排（M2 T031 实现——引擎 applyItem + 快照/次数递减/事件转发） ---- */
    function useItem(item, tileId) {
      if (phase !== PHASE.READY) { emit({ e: 'input-locked' }); return null; }
      if (!engine.items || !engine.items[item] || engine.items[item] <= 0) {
        emit({ e: 'item-unavailable', item: item });
        return null;
      }
      /* undo: 弹快照栈整条级联链回滚（FR-024-1——快照取于原子回合前） */
      if (item === 'undo') {
        if (!history.length) { emit({ e: 'item-unavailable', item: 'undo' }); return null; }
        var snap = history.pop();
        RE.restore(engine, snap);
        engine.items.undo = Math.max(0, (engine.items.undo || 0) - 1);
        /* rail 失效（回滚后动作序列不再等于解前缀——保守置 off） */
        onRail = false;
        emit({ e: 'undo', snapshot: snap });
        emit({ e: 'reset-soft' });
        return { type: 'undo' };
      }
      /* Δ19d: magnet/shuffle 为**无目标**道具（无需选牌）；undo 走上方分支 */
      if ((item === 'magnet' || item === 'shuffle') && tileId != null) {
        emit({ e: 'item-invalid', item: item });
        return null;
      }

      /* 执行前快照（与 tap 同——undo 可整体回滚道具动作） */
      history.push(RE.snapshot(engine));
      if (history.length > 200) history.shift();

      var result = RE.applyItem(engine, item, tileId);
      if (result.type === 'invalid') {
        history.pop(); /* 无效动作不入史 */
        emit({ e: 'item-invalid', item: item, tileId: tileId, reason: result.reason });
        return result;
      }
      /* 成功: 次数递减（cfg.items 拷贝上的运行时计数） */
      engine.items[item] = Math.max(0, (engine.items[item] || 0) - 1);
      trackRail({ k: item === 'magnet' ? 3 : (item === 'shuffle' ? 4 : 2), t: tileId == null ? -1 : tileId });
      var i;
      for (i = 0; i < result.events.length; i++) emit(result.events[i]);
      for (i = 0; i < result.events.length; i++) {
        if (result.events[i].e === 'match') windowCombo();
      }
      emit({ e: 'item', item: item });
      judgeTerminal(); /* Δ10: 道具动作同样瞬时终局判定 */
      return result;
    }

    /* （tapStaged 已随暂存区功能移除——滑块只在棋盘 ↔ Dock 单向守恒流转） */

    /* ---- Δ16f/T071: 棱晶购买道具（FR-041 §2）
     *   扣费与生效 MUST 为**原子操作**（Edge Case「棱晶余额不足与购买竞态」）：
     *   余额恰好等于价格时扣费后归零、道具仍正常生效，MUST NOT 因余额为 0
     *   而误判为「不足」。扣费由调用方（main.js）在**先扣成功后**调用本
     *   函数——本函数负责「把购买出来的那一次」真正用掉，保证计数不出现
     *   「扣了钱没生效」或「生效了没扣钱」的中间态。
     *   返回 { ok, reason }：ok=false 时调用方 MUST NOT 已扣费。 */
    function buyItemUse(item, tileId, cost) {
      if (phase !== PHASE.READY) return { ok: false, reason: 'locked' };
      if (!engine.items) engine.items = { undo: 0, magnet: 0, shuffle: 0 };
      /* 购买 = 免费次数用尽后，用棱晶临时补出一次可立即使用的次数 */
      engine.items[item] = (engine.items[item] || 0) + 1;
      var r = useItem(item, tileId);
      if (!r || (r.type !== 'undo' && r.type !== 'magnet' && r.type !== 'shuffle')) {
        /* 生效失败（例：undo 无快照可回滚）→ 回滚刚补的次数，MUST NOT
         * 让余额付出而道具未用（FR-041 §2 确定性铁律） */
        engine.items[item] = Math.max(0, engine.items[item] - 1);
        return { ok: false, reason: (r && r.type) || 'unavailable' };
      }
      if (r.type === 'invalid') {
        engine.items[item] = Math.max(0, engine.items[item] - 1);
        return { ok: false, reason: 'invalid' };
      }
      return { ok: true, result: r, cost: cost };
    }

    /* ---- Δ16g/T074: 棱晶复活（成组净化消除，FR-043 §3/§4） ----
     * 语义: Dock 全部滞留滑块 + 板面同花色配对块成组消除（恒为 3 的倍数）
     * → 腾空 Dock → 恢复 3 生命 → 续局（**不重置棋盘**）。
     * 与 Solver 共用 RE.applyPurify（FR-032 铁律不破）。 */
    function purify() {
      var res = RE.applyPurify(engine);
      var i;
      for (i = 0; i < res.events.length; i++) emit(res.events[i]);
      /* rail 失效（净化改变了板面与 Dock —— 保守置 off） */
      onRail = false;
      /* 复活后回到可操作态（此前为 LOST_* —— 终局态须重新开闸） */
      phase = PHASE.READY;
      emitPhase();
      emit({ e: 'purify', removed: res.removed, suits: res.suits });
      return res;
    }

    /* ---- 引擎态直访（Renderer 轮询用） ---- */
    function engineState() { return engine; }

    function findBestNextMove() {
    if (phase !== PHASE.READY) return -1;
    if (onRail) {
      var sol = levelDef.solutionMoves || [];
      if (railIndex < sol.length) return sol[railIndex].t;
    }
    return RE.findBestMove(engine);
  }

  ready = true; /* 构造完毕：此后事件可正常下发（首 phase 事件于返回后异步发） */
    var api = {
      tap: tap,
      useItem: useItem,
      buyItemUse: buyItemUse,
      purify: purify,
      breakCombo: breakCombo,
      reset: reset,
      state: state,
      onRail: onRailCheck,
      findBestNextMove: findBestNextMove,
      findBestMove: findBestNextMove,
      engineState: engineState,
      PHASE: PHASE
    };
    setTimeout(function () { emitPhase(); }, 0); /* 首次 phase 通知（调用方此时已持有 session） */
    return api;
  }

  STM.GameState = { createSession: createSession, PHASE: PHASE };
})(typeof window !== 'undefined' ? window : globalThis);
