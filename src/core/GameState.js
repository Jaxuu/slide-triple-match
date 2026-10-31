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

  /* Δ22b/T108: 纯表现层连击窗口（FR-050 §9）——5.0 秒滑动时间窗。
   * 与上方 COMBO_WINDOW_MS（IQ 乘区 M_combo 口径，受阻断连、无时间窗）**双口径并存**：
   * 二者 MUST NOT 互相覆盖或隐式同步（T108 ⑤）。 */
  var COMBO_FX_WINDOW_MS = 5000;
  /* 档位速率表（FR-050 §9）：1.00 / 1.06 / 1.12 / 1.18 / 1.25（>=5 起步，逐级 +0.05 封顶 1.30） */
  var COMBO_FX_RATE_MAX = 1.30;
  var COMBO_FX_RATE_STEP = 0.05;

  function createSession(levelDef, handlers) {
    handlers = handlers || {};
    var onEvent = handlers.onEvent || function () {};
    var onTerminal = handlers.onTerminal || function () {};

    var engine = RE.init(levelDef);
    var phase = PHASE.READY;
    var history = [];            /* 快照栈（Undo 基础设施） */
    /* IQ 乘区连击（M_combo 口径——受阻断连、1.5s 窗口，Δ22 起改名以让出 comboCount/lastMatchAt） */
    var iqComboLastAt = 0;
    var iqComboActive = false;
    /* Δ22b/T108: 表现层连击态（5.0 秒滑动窗——驱动碎裂升调 / 语音 / 飘字） */
    var comboCount = 0;
    var lastMatchAt = 0;
    /* Δ30/FR-054: 连击周期内人声单次播报闸门——
     * 记录**本次连击周期内已播报的最高语音档位**（0 = 本周期尚未播报）。
     * 5 秒窗口超时 / reset() 时归零，允许下一轮重新播报高阶夸赞。
     * MUST NOT 与 comboCount / lastMatchAt 合并语义（前者是计数权威，
     * 本变量只服务于「同一档位不重复出声」）。 */
    var comboVoiceTier = 0;
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
      if (iqComboActive && now - iqComboLastAt < COMBO_WINDOW_MS) {
        iqComboLastAt = now;
        return true; /* 窗口内续击 */
      }
      iqComboLastAt = now;
      iqComboActive = true;
      return false;
    }

    /* ---- Δ22b/T108: 表现层 5.0 秒滑动窗连击（FR-050 §9 / contracts §5.3） ----
     * 语义：now - lastMatchAt <= 5000 → count += 1；否则重置为 1；
     * **无论续连与否 MUST 刷新 lastMatchAt**（滑动窗口，非固定节拍）。
     * 计时 MUST 用时间戳差值（performance.now），MUST NOT 用 rAF 帧计数
     * （切后台 / 掉帧后不得误判为续连）。
     * 受阻反弹 MUST NOT 重置本计数（与 IQ 口径不同——本计数只受 5 秒窗口约束）。
     * 纯表现层：不写 localStorage、不影响判定 / 计分 / 棱晶 / 可解性（FR-032）。 */
    function comboFxNow() {
      return (global.performance && global.performance.now)
        ? global.performance.now()
        : Date.now();
    }

    function comboFxTier(count) {
      if (count <= 1) return 1;
      return count >= 5 ? 5 : count; /* count >= 5 归 5 */
    }

    /* 档位速率：1.00 / 1.06 / 1.12 / 1.18 /（5 起）1.0 + count × 0.05，封顶 1.30 */
    function comboFxRate(count) {
      if (count <= 1) return 1.00;
      if (count === 2) return 1.06;
      if (count === 3) return 1.12;
      if (count === 4) return 1.18;
      return Math.min(COMBO_FX_RATE_MAX, 1.0 + count * COMBO_FX_RATE_STEP);
    }

    /* 文案逐字锁定（含标点与空格）——MUST NOT 改写、MUST NOT 本地化 */
    function comboFxText(count, tier) {
      if (tier <= 1) return null;
      if (tier === 2) return 'Combo ×2';
      if (tier === 3) return 'Good! ×3';
      if (tier === 4) return 'Great! ×4';
      return 'Unbelievable! ×' + count;
    }

    function comboFxVoice(tier) {
      if (tier === 3) return 'good';
      if (tier === 4) return 'great';
      if (tier >= 5) return 'unbelievable';
      return null; /* tier 1/2 MUST NOT 播语音 */
    }

    /* 每次三消结算后广播 comboChanged（唯一计数权威——消费方 MUST NOT 自建副本）
     * Δ30/FR-054: `voice` 字段改为**跨档单次**语义——
     *   · 连击计数（count）/ 碎裂升调（playbackRate）/ 飘字（floatText）不受影响；
     *   · 仅当本次跨入**比本周期已播档位更高**的档位时才下发 voice，
     *     持续停留在同一高阶档位时 voice = null（计数与积分照常累加）。
     * 5 秒窗口超时（连击重置）→ comboVoiceTier 归零 → 重新打出高阶可再播。 */
    function bumpCombo() {
      var now = comboFxNow();
      if (lastMatchAt > 0 && (now - lastMatchAt) <= COMBO_FX_WINDOW_MS) {
        comboCount += 1;
      } else {
        comboCount = 1; /* 首次消除或间隔超 5 秒 */
        comboVoiceTier = 0; /* 新连击周期 → 人声闸门复位 */
      }
      lastMatchAt = now;
      var tier = comboFxTier(comboCount);
      var voice = comboFxVoice(tier);
      var voiceOut = null;
      if (voice && tier > comboVoiceTier) {
        voiceOut = voice;
        comboVoiceTier = tier; /* 本周期该档位（及更低档）不再重复播报 */
      }
      emit({
        e: 'comboChanged',
        count: comboCount,
        tier: tier,
        playbackRate: comboFxRate(comboCount),
        voice: voiceOut,
        floatText: comboFxText(comboCount, tier)
      });
    }

    /* Δ19c/T084: 受阻清空连击（表现层 IQ 不扣分，但 combo 必须归零）
     * 引擎 combo 为连击倍率来源，归零后下一次三消从 base 重新起跳。 */
    function breakCombo() {
      engine.combo = 0;
      iqComboActive = false;
      iqComboLastAt = 0;
      /* Δ22b/T108 ⑥: 受阻 MUST NOT 重置表现层连击（comboCount 只受 5 秒窗口约束） */
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
      for (i = 0; i < result.events.length; i++) {
        var evt = result.events[i];
        if (evt.e === 'match') {
          /* Δ22b/T108: 先结算连击（comboChanged 先于 match 下发——
           * 音频层据此取 playbackRate，MUST NOT 自行推断档位） */
          windowCombo();  /* IQ 乘区口径（M_combo） */
          bumpCombo();    /* 表现层 5s 口径（碎裂升调 / 语音 / 飘字） */
        }
        emit(evt);
      }
      if (result.type === 'flyout' || result.type === 'prism-flyout') emit({ e: 'flyout', tileId: tileId, path: result.path });
      if (result.type === 'blocked') {
        emit({ e: 'blocked', tileId: tileId, path: result.path, damage: result.damage });
        breakCombo(); /* Δ19c/T084: 受阻 MUST 立即清空连击（IQ 不扣分） */
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
        comboCount: comboCount, /* Δ22b/T108: 表现层连击（5s 滑动窗）——只读观测位 */
        comboVoiceTier: comboVoiceTier, /* Δ30/FR-054: 本周期已播语音档位（只读观测位） */
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
      iqComboActive = false;
      iqComboLastAt = 0;
      /* Δ22b/T108 ⑥: 重置本关 MUST 归零表现层连击 */
      comboCount = 0;
      lastMatchAt = 0;
      comboVoiceTier = 0; /* Δ30/FR-054: 人声闸门随连击一并复位 */
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
      for (i = 0; i < result.events.length; i++) {
        var evtI = result.events[i];
        if (evtI.e === 'match') { windowCombo(); bumpCombo(); } /* Δ22b/T108: 道具三消同样计入连击 */
        emit(evtI);
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

    function autoPlayStep() {
      if (phase !== PHASE.READY) return { type: 'locked' };
      var eng = engine;
      function emitMagnetResult(r) {
        var i;
        for (i = 0; i < r.events.length; i++) {
          var evtM = r.events[i];
          if (evtM.e === 'match') { windowCombo(); bumpCombo(); } /* Δ22b/T108 */
          emit(evtM);
        }
        emit({ e: 'item', item: 'magnet' });
        judgeTerminal();
      }
      if (eng.dock.length >= 5) {
        var snap = RE.snapshot(eng);
        history.push(snap);
        if (history.length > 200) history.shift();
        var r = RE.applyItem(eng, 'magnet', null);
        if (r && r.type !== 'invalid') {
          emitMagnetResult(r);
          return { type: 'magnet', result: r };
        }
        history.pop();
        RE.restore(eng, snap);
      }
      var taps = RE.enumerateTaps(eng);
      var anySafe = false;
      if (taps && taps.length) {
        for (var ti = 0; ti < taps.length; ti++) {
          var sn = RE.snapshot(eng);
          RE.applyTap(eng, taps[ti]);
          var term = RE.terminal(eng);
          RE.restore(eng, sn);
          if (term !== 'lost_burst') { anySafe = true; break; }
        }
      }
      if (!taps || !taps.length || !anySafe) {
        var snap2 = RE.snapshot(eng);
        history.push(snap2);
        if (history.length > 200) history.shift();
        var r2 = RE.applyItem(eng, 'magnet', null);
        if (r2 && r2.type !== 'invalid') {
          emitMagnetResult(r2);
          return { type: 'magnet', result: r2 };
        }
        history.pop();
        RE.restore(eng, snap2);
      }
      var tileId = findBestNextMove();
      if (tileId == null || tileId < 0) {
        var snap3 = RE.snapshot(eng);
        history.push(snap3);
        if (history.length > 200) history.shift();
        var r3 = RE.applyItem(eng, 'magnet', null);
        if (r3 && r3.type !== 'invalid') {
          emitMagnetResult(r3);
          return { type: 'magnet', result: r3 };
        }
        history.pop();
        RE.restore(eng, snap3);
        return { type: 'none' };
      }
      var tapRes = tap(tileId);
      return { type: 'tap', tileId: tileId, result: tapRes };
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
      autoPlayStep: autoPlayStep,
      engineState: engineState,
      PHASE: PHASE
    };
    setTimeout(function () { emitPhase(); }, 0); /* 首次 phase 通知（调用方此时已持有 session） */
    return api;
  }

  STM.GameState = { createSession: createSession, PHASE: PHASE };
})(typeof window !== 'undefined' ? window : globalThis);
