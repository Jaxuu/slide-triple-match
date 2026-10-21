/* =========================================================
 * Slide & Triple — RulesEngine（前后端共用纯函数规则引擎）
 * UMD 双导出（D-02）：浏览器挂 STM.RulesEngine / Node module.exports
 * 纯函数、零 DOM / 音频 / 存储依赖——Node 可 require 是硬约束
 *
 * 坐标与方向约定（D-12）:
 *   格 (r,c)，row 0 = 顶部；方向 0=U, 1=R, 2=D, 3=L（顺时针序）
 *   「顺时针转 90°」≡ (d+1)%4
 * 棱镜反射全枚举映射（8 条，rules-engine.md §0）:
 *   '/': U→R, R→U, D→L, L→D
 *   '\': U→L, L→U, D→R, R→D
 *
 * M1.5 Δ7 多层堆叠棋盘（Multi-Layer Stack; Δ11 扩容至 5 层）:
 *   TileSpec 可选字段 z: 0|1|2|3|4（0 最底层，数字大者位于当前格最顶层）
 *   board[r][c] = 栈数组（底→顶）；仅栈顶滑块可点击/受齿轮作用/触发飞出；顶层飞出后次顶层立即暴露（reveal 事件）
 *
 * M1.7 Δ8 分层立体阻挡（Layer-Aware Raycasting）:
 *   射线阻挡按层高 z 分层计算——高层滑块从低层滑块头顶凌空飞越！
 *   飞行滑块层高 z_self，前方格 (nr,nc) 栈顶层高 z_target:
 *     · z_target < z_self（含空格）→ 不阻挡，凌空飞越
 *     · z_target >= z_self（同层/高层）→ 有效阻挡
 *     · 棱镜 = 全层高柱体（任意层高射线均视为阻挡/折射）
 * ========================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (global.STM = global.STM || {}).RulesEngine = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---------- 常量（单点定义，level-data.md §3 枚举字面量表） ---------- */

  /* 方向增量向量：0=U, 1=R, 2=D, 3=L（顺时针序） */
  var DIR_VEC = [
    { dr: -1, dc: 0 }, // 0 U
    { dr: 0, dc: 1 },  // 1 R
    { dr: 1, dc: 0 },  // 2 D
    { dr: 0, dc: -1 }  // 3 L
  ];

  /* 棱镜反射表: REFLECT[prismType][dir] = newDir */
  var REFLECT = {
    '/': { 0: 1, 1: 0, 2: 3, 3: 2 },  // U→R, R→U, D→L, L→D
    '\\': { 0: 3, 1: 2, 2: 1, 3: 0 }  // U→L, R→D, D→R, L→U
  };

  /* 机制标记（D-11 互斥） */
  var MECH = { GEAR: 'g', ICE: 'i', CHAIN: 'c', KEY: 'k' };

  /* Dock 容量 / 三消阈值（暂存区已移除——道具 2 种: undo/wrench） */
  var DOCK_CAP = 7;
  var MATCH_N = 3;

  /* ---------- 内部工具 ---------- */

  function deepClone(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  /* ---------- API 实现（T008~T013） ---------- */

  function init(level, opts) {
    opts = opts || {};
    var cfg = deepClone(level.cfg || {});
    /* cfg 默认值补全（level-data.md §2「默认值可省略——消费方补默认」） */
    if (cfg.lives == null) cfg.lives = 3;
    if (cfg.damageOnBlock == null) cfg.damageOnBlock = false;
    if (!cfg.items) cfg.items = { undo: 1, wrench: 1 };
    if (cfg.iceMode == null) cfg.iceMode = 'triple';
    if (!cfg.chains) cfg.chains = [];
    if (!cfg.scoring) cfg.scoring = { comboBase: 10, comboStep: 5 };

    var n = level.n;
    var board = new Array(n);
    for (var r = 0; r < n; r++) {
      board[r] = new Array(n);
      for (var c = 0; c < n; c++) board[r][c] = null;
    }

    /* 棱镜格先行布置（不可覆盖、不可变） */
    var prisms = level.prisms || [];
    for (var i = 0; i < prisms.length; i++) {
      var p = prisms[i];
      board[p.r][p.c] = { prism: true, t: p.t };
    }

    /* tiles 深拷贝 + id = TileSpec 索引（id 序保持 TileSpec 序——D-08 确定性）
     * M1.5 Δ7 多层堆叠: 同格滑块按 z 升序入栈，board[r][c] = 栈数组（底→顶） */
    var tiles = [];
    var stacks = {};
    for (var j = 0; j < level.tiles.length; j++) {
      var t = deepClone(level.tiles[j]);
      t.id = j;
      t.z = t.z || 0;
      if (t.m === MECH.ICE) t.ice = (t.x != null ? t.x : 1);
      if (t.m === MECH.CHAIN) t.locked = true;
      tiles.push(t);
      var key = t.r + ':' + t.c;
      if (!stacks[key]) stacks[key] = [];
      stacks[key].push(t);
    }
    for (var sk in stacks) {
      var cell = stacks[sk];
      if (cell.length > 1) cell.sort(function (a, b) { return a.z - b.z; });
      var pos = sk.split(':');
      board[parseInt(pos[0], 10)][parseInt(pos[1], 10)] = cell;
    }

    return {
      n: n,
      board: board,
      tiles: tiles,          /* id → 运行态 Tile（含已飞出者；飞出时置 removed） */
      dock: [],
      cfg: cfg,
      lives: cfg.lives,
      score: 0,
      combo: 0,
      items: deepClone(cfg.items),
      actions: [],           /* 动作序列（onRail 基准） */
      chainConsumed: []      /* 已消费 chains 配对（Undo/Solver 回溯逆放恢复） */
    };
  }

  /* T008: canTap 谓词——射线畅通性不属于 canTap（受阻滑块仍可点击，点击后弹回）
   * M1.5 Δ7: 仅当前格栈顶滑块可点击（下层滑块被顶层压住，不可交互） */
  function canTap(state, tileId) {
    var t = state.tiles[tileId];
    if (!t || t.removed) return false;
    if (t.ice > 0) return false;              /* 冰封不可点（FR-015，M1 关卡无此标记） */
    if (t.locked) return false;               /* 锁链不可点（FR-018，M1 关卡无此标记） */
    if (!isTopOfStack(state, t)) return false;
    return true;
  }

  /* M1.5 Δ7: 栈顶判定——board[r][c] 栈数组末位即当前顶层滑块 */
  function isTopOfStack(state, t) {
    var cell = state.board[t.r][t.c];
    if (!cell || !cell.length) return false;
    return cell[cell.length - 1] === t;
  }

  /* T008: enumerateTaps 枚举可行 tap 目标 id（id 序 = 行优先列优先——D-08 确定性） */
  function enumerateTaps(state) {
    var out = [];
    for (var i = 0; i < state.tiles.length; i++) {
      if (canTap(state, i)) out.push(i);
    }
    return out;
  }

  /* T009: 射线行走——从 (r,c) 沿 d 逐格行走到边缘，返回首个被占格信息
   * Δ8 分层立体阻挡: 飞行滑块层高 z，前方格栈顶滑块层高 < z → 凌空飞越不阻挡；
   * 栈顶层高 >= z（同层/高层）或棱镜（全层高柱体）→ 阻挡
   * 返回 { free: true, exit: {r,c} }（exit=越界前的最后格）或
   *      { free: false, blocker: {r,c}, cell }（cell = 占格内容：滑块栈或棱镜） */
  function castRay(state, r, c, d, z) {
    var v = DIR_VEC[d];
    var rr = r, cc = c;
    var lastR = r, lastC = c;
    for (;;) {
      rr += v.dr; cc += v.dc;
      if (rr < 0 || rr >= state.n || cc < 0 || cc >= state.n) {
        return { free: true, exit: { r: lastR, c: lastC } };
      }
      var cell = state.board[rr][cc];
      if (cell) {
        if (cell.prism) return { free: false, blocker: { r: rr, c: cc }, cell: cell };
        /* Δ8: 栈顶滑块层高低于飞行层 → 凌空飞越（继续行进） */
        var top = cell[cell.length - 1];
        if ((top.z || 0) < z) { lastR = rr; lastC = cc; continue; }
        return { free: false, blocker: { r: rr, c: cc }, cell: cell };
      }
      lastR = rr; lastC = cc;
    }
  }

  /* 构造飞行路径（渲染动画用）：从 (r,c) 沿 d 至出口（含越界一步起点）
   * Δ8: 与 castRay 同步层高感知——低层格照常入 path（视觉凌空飞越低层牌顶） */
  function buildPath(state, r, c, d, z) {
    var v = DIR_VEC[d];
    var path = [{ r: r, c: c }];
    var rr = r, cc = c;
    for (;;) {
      rr += v.dr; cc += v.dc;
      path.push({ r: rr, c: cc });
      if (rr < 0 || rr >= state.n || cc < 0 || cc >= state.n) return path;
      var cell = state.board[rr][cc];
      if (cell) {
        if (cell.prism) return path;
        var top = cell[cell.length - 1];
        if ((top.z || 0) < z) continue; /* 凌空飞越——不终止路径 */
        return path;
      }
    }
  }

  /* T010: Dock 归拢插入（FR-004）——同花色紧邻插入；无同花色 → 末尾空位 */
  function dockInsert(dock, tile) {
    var lastSame = -1;
    for (var i = 0; i < dock.length; i++) {
      if (dock[i].s === tile.s) lastSame = i;
    }
    if (lastSame < 0) {
      dock.push(tile);
      return dock.length - 1;
    }
    dock.splice(lastSame + 1, 0, tile);
    return lastSame + 1;
  }

  /* T010: 三消结算循环（FR-005）——循环至无新三消
   * 返回事件数组 [{e:'match',suit,ids,combo},{e:'remove',ids}]（顺序 = 发生顺序） */
  function settleMatches(state, events) {
    for (;;) {
      var counts = {};
      var i, s;
      for (i = 0; i < state.dock.length; i++) {
        s = state.dock[i].s;
        counts[s] = (counts[s] || 0) + 1;
      }
      var matched = -1;
      for (s in counts) {
        if (counts[s] === MATCH_N) { matched = parseInt(s, 10); break; }
      }
      if (matched < 0) break;
      var ids = [];
      var remain = [];
      for (i = 0; i < state.dock.length; i++) {
        if (state.dock[i].s === matched) ids.push(state.dock[i].id);
        else remain.push(state.dock[i]);
      }
      state.dock = remain;
      state.combo = (state.combo || 0) + 1;
      var gain = state.cfg.scoring.comboBase + (state.combo - 1) * state.cfg.scoring.comboStep;
      state.score += gain * ids.length / 1; /* 每组三消按连击加成计分（GameState 记账口径） */
      events.push({ e: 'match', suit: matched, ids: ids.slice(), combo: state.combo, gain: gain });
      events.push({ e: 'remove', ids: ids.slice() });
      /* T024 'triple' 破冰口径（主口径）: 每次三消全场所有 ice>0 各减 1、归 0 清冰封标记 */
      if (state.cfg.iceMode !== 'adjacent') {
        for (var ii = 0; ii < state.tiles.length; ii++) {
          var iced = state.tiles[ii];
          if (iced.removed || !(iced.ice > 0)) continue;
          var ffrom = iced.ice;
          iced.ice -= 1;
          if (iced.ice <= 0) { iced.ice = 0; iced.m = null; }
          events.push({ e: 'ice', id: iced.id, from: ffrom, to: iced.ice });
        }
      }
    }
    return events;
  }

  /* T009/T010: applyTap 原子回合结算（单一事实源管线，rules-engine.md §3）
   * M1 覆盖：Step0 前置 → Step1 射线 → Step2 Blocked / Step3 Prism / Step4 Fly-out+入槽+三消 */
  function applyTap(state, tileId) {
    var events = [];
    var t = state.tiles[tileId];

    /* Step 0: 前置 */
    if (!canTap(state, tileId)) {
      return { type: 'invalid', tileId: tileId, path: [], events: [] };
    }

    state.actions.push({ k: 0, t: tileId });

    /* Step 1: 射线行走（Δ8 层高感知） */
    var ray = castRay(state, t.r, t.c, t.d, t.z || 0);

    /* Step 2: Blocked 分支 */
    if (!ray.free && !(ray.cell && ray.cell.prism)) {
      var damage = state.cfg.damageOnBlock ? 1 : 0;
      if (damage) state.lives -= 1; /* 生命扣减写回 EngineState（rules-engine.md §7.3 契约） */
      var path = buildPath(state, t.r, t.c, t.d, t.z || 0);
      path.pop(); /* 去掉越界步（被阻挡时不到达越界格）——保留到阻挡格前一格（含凌空飞越格） */
      return {
        type: 'blocked',
        tileId: tileId,
        path: path,
        blockedAt: ray.blocker,
        damage: damage,
        events: events
      };
    }

    /* Step 3: Prism 折射判定（M2 T026 完整实现；M1 关卡无棱镜——结构分支就绪） */
    if (!ray.free && ray.cell && ray.cell.prism) {
      return tapPrism(state, t, ray, events);
    }

    /* Step 4: Fly-out（无阻挡直达边缘） */
    var flyPath = buildPath(state, t.r, t.c, t.d, t.z || 0);
    var revealed = removeFromBoard(state, t);
    if (revealed) events.push({ e: 'reveal', id: revealed.id, r: revealed.r, c: revealed.c, z: revealed.z });
    /* T027 级联管线（顺序固定）: 4a 齿轮 → 4b 钥匙解锁 → adjacent 破冰 → 4c 入槽 → 4d 三消 */
    cascadeOnFlyout(state, t, events);
    var slotIndex = dockInsert(state.dock, t);
    events.push({ e: 'dock', id: tileId, slotIndex: slotIndex });

    /* Step 4d: 三消结算循环（三消优先于爆槽——Edge Case） */
    settleMatches(state, events);

    return {
      type: 'flyout',
      tileId: tileId,
      path: flyPath,
      events: events
    };
  }

  /* =========================================================
   * T023~T027 级联管线（单一事实源，顺序固定——Edge Case 原子级联）
   * 4a 齿轮: 十字相邻滑块 t 成功飞出 → 每个齿轮滑块 g（与 t 十字相邻）d=(d+1)%4
   *          Δ8 层高对齐: 触发对象恒为相邻格**当前栈顶**齿轮滑块
   * 4b 钥匙: t 为钥匙 → chains 或语义解锁（任一配对钥集全飞出 → 该锁解锁）
   * 4c adjacent 破冰（变体口径在入槽前结算: 仅与 t 十字相邻的冰封滑块 ice--）
   * （'triple' 主口径破冰在 settleMatches 内按三消结算触发）
   * ========================================================= */
  function cascadeOnFlyout(state, t, events) {
    /* 4a 齿轮联动（Δ8: 相邻格当前栈顶齿轮滑块） */
    for (var i = 0; i < state.tiles.length; i++) {
      var g = state.tiles[i];
      if (g.removed || g.m !== MECH.GEAR) continue;
      if (g.r < t.r - 1 || g.r > t.r + 1 || g.c < t.c - 1 || g.c > t.c + 1) continue;
      if (Math.abs(g.r - t.r) + Math.abs(g.c - t.c) !== 1) continue; /* 十字相邻（对角不触发） */
      var from = g.d;
      g.d = (g.d + 1) % 4;
      events.push({ e: 'gear', id: g.id, from: from, to: g.d });
    }

    /* 4b 钥匙解锁（chains: [[keyId,[lockId,...]],...] 或语义——一锁配多钥、一钥多锁）
     * 解锁后配对出队记入 state.chainConsumed（Undo/Solver 回溯逆放恢复） */
    if (t.m === MECH.KEY && Array.isArray(state.cfg.chains) && state.cfg.chains.length) {
      for (var ci = 0; ci < state.cfg.chains.length; ci++) {
        var pair = state.cfg.chains[ci];
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        if (pair[0] !== t.id || !Array.isArray(pair[1])) continue;
        /* pair[1] = [lockId,...]——本钥即该锁唯一钥 → 直接解锁 */
        for (var li = 0; li < pair[1].length; li++) {
          var lockId = pair[1][li];
          var lock = state.tiles[lockId];
          if (!lock || lock.removed || !lock.locked) continue;
          lock.locked = false;
          events.push({ e: 'unlock', id: lockId, by: t.id });
        }
        if (!state.chainConsumed) state.chainConsumed = [];
        state.chainConsumed.push({ at: state.actions.length, idx: ci, pair: pair });
        state.cfg.chains.splice(ci, 1); /* 已消费配对（防止重复解锁; Undo 按原位回插） */
        ci--;
      }
    }

    /* 4c adjacent 破冰（变体口径: 与 t 十字相邻的冰封滑块 ice--） */
    if (state.cfg.iceMode === 'adjacent') {
      for (var ai = 0; ai < state.tiles.length; ai++) {
        var it = state.tiles[ai];
        if (it.removed || !(it.ice > 0)) continue;
        if (Math.abs(it.r - t.r) + Math.abs(it.c - t.c) !== 1) continue;
        var ifrom = it.ice;
        it.ice -= 1;
        if (it.ice <= 0) { it.ice = 0; it.m = null; }
        events.push({ e: 'ice', id: it.id, from: ifrom, to: it.ice });
      }
    }
  }

  /* T026 占位实现（M1 关卡无棱镜；结构就绪）——折射分支
   * Δ8: 折射后续走与出口计算均层高感知（棱镜本身=全层高柱体恒阻挡） */
  function tapPrism(state, t, ray, events) {
    var zSelf = t.z || 0;
    /* 新方向 = 反射表[prism.t][dir]；从棱镜格沿新方向续走 */
    var nd = REFLECT[ray.cell.t][t.d];
    var v = DIR_VEC[nd];
    var rr = ray.blocker.r, cc = ray.blocker.c;
    var lastR = rr, lastC = cc;
    var blocked = null;
    for (;;) {
      rr += v.dr; cc += v.dc;
      if (rr < 0 || rr >= state.n || cc < 0 || cc >= state.n) break;
      var cell = state.board[rr][cc];
      if (cell) {
        if (!cell.prism) {
          var top = cell[cell.length - 1];
          if ((top.z || 0) < zSelf) { lastR = rr; lastC = cc; continue; } /* Δ8 凌空飞越 */
        }
        blocked = { r: rr, c: cc };
        break;
      }
      lastR = rr; lastC = cc;
    }

    if (blocked) {
      /* 3b: 折射后受阻 → 弹回原位（单次折射上限，FR-022） */
      var damage = state.cfg.damageOnBlock ? 1 : 0;
      if (damage) state.lives -= 1;
      var path = buildPath(state, t.r, t.c, t.d, zSelf);
      path.push({ r: ray.blocker.r, c: ray.blocker.c }); /* 折射折点（棱镜格） */
      /* 棱镜格 → 受阻格前一行走（lastR/lastC 已算就——直接补 path 剩余段） */
      var v2 = DIR_VEC[nd];
      var cr = ray.blocker.r, cc2 = ray.blocker.c;
      /* 从棱镜格沿 nd 行至 lastR/lastC（受阻前一格——buildPath 未覆盖的折射段） */
      for (;;) {
        cr += v2.dr; cc2 += v2.dc;
        path.push({ r: cr, c: cc2 });
        if (cr === lastR && cc2 === lastC) break;
        if (cr < 0 || cr >= state.n || cc2 < 0 || cc2 >= state.n) break; /* 越界保护 */
      }
      return {
        type: 'blocked',
        tileId: t.id,
        path: path,
        blockedAt: blocked,
        damage: damage,
        events: events
      };
    }

    /* 3a: 新射线畅通 → prism-flyout（path 含折射折点） */
    var flyPath = buildPath(state, t.r, t.c, t.d, zSelf);
    flyPath.push({ r: ray.blocker.r, c: ray.blocker.c }); /* 折点（棱镜格） */
    /* 棱镜格起沿新方向到越界（Δ8 层高感知——低层格照常飞越入 path） */
    var fr = ray.blocker.r, fc = ray.blocker.c;
    for (;;) {
      fr += v.dr; fc += v.dc;
      if (fr < 0 || fr >= state.n || fc < 0 || fc >= state.n) { flyPath.push({ r: fr, c: fc }); break; }
      var fcell = state.board[fr][fc];
      if (fcell && !fcell.prism) {
        var ftop = fcell[fcell.length - 1];
        if ((ftop.z || 0) < zSelf) { flyPath.push({ r: fr, c: fc }); continue; }
      }
      flyPath.push({ r: fr, c: fc });
      if (fcell) break;
    }
    removeFromBoard(state, t);
    /* T027: prism-flyout 同走级联管线（齿轮/钥匙/adjacent 破冰） */
    cascadeOnFlyout(state, t, events);
    var slotIndex = dockInsert(state.dock, t);
    events.push({ e: 'dock', id: t.id, slotIndex: slotIndex });
    settleMatches(state, events);
    return {
      type: 'prism-flyout',
      tileId: t.id,
      path: flyPath,
      events: events
    };
  }

  /* M1.5 Δ7: 弹栈移除——飞出后暴露次顶层（返回新顶层滑块或 null）
   * 栈弹空 → 格置 null（后续射线不再被该格阻挡） */
  function removeFromBoard(state, t) {
    var cell = state.board[t.r][t.c];
    if (cell && cell.length) {
      for (var i = 0; i < cell.length; i++) {
        if (cell[i] === t) { cell.splice(i, 1); break; }
      }
      if (cell.length === 0) state.board[t.r][t.c] = null;
      t.removed = true;
      return cell.length > 0 ? cell[cell.length - 1] : null;
    }
    t.removed = true;
    return null;
  }

  /* T030 道具引擎语义（FR-024）:
   * wrench: 目标滑块 (d+1)%4——仅普通与齿轮滑块可用（冰封/锁链 invalid，FR-024-2）
   * （stage/暂存区功能已移除——道具仅 undo/wrench 两种） */
  function applyItem(state, item, tileId) {
    if (item === 'wrench') {
      var t = state.tiles[tileId];
      if (!t || t.removed) return { type: 'invalid', item: item, events: [] };
      if (t.ice > 0 || t.locked) return { type: 'invalid', item: item, events: [] }; /* FR-024-2 */
      var from = t.d;
      t.d = (t.d + 1) % 4;
      state.actions.push({ k: 2, t: tileId });
      return { type: 'wrench', tileId: tileId, from: from, to: t.d, events: [{ e: 'gear', id: tileId, from: from, to: t.d }] };
    }
    return { type: 'invalid', item: item, events: [] };
  }

  /* T011: terminal 终局判定（暂存区已移除: won = 棋盘滑块 == 0 且 dock == 0） */
  function terminal(state) {
    var boardTiles = 0;
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (!t.removed) boardTiles++;
    }
    if (boardTiles === 0 && state.dock.length === 0) return 'won';

    /* lost_burst = dock 满 7 且无任何花色计数 == 3（结算后态——三消优先已保证） */
    if (state.dock.length === DOCK_CAP) {
      var counts = {};
      var has3 = false;
      for (var j = 0; j < state.dock.length; j++) {
        var s = state.dock[j].s;
        counts[s] = (counts[s] || 0) + 1;
      }
      for (var k in counts) if (counts[k] === MATCH_N) has3 = true;
      if (!has3) return 'lost_burst';
    }

    /* lost_lives = lives ≤ 0 */
    if (state.lives <= 0) return 'lost_lives';

    return 'playing';
  }

  /* ---------- T028 死锁保守谓词（D-09/FR-006；复证由调用方执行） ---------- */
  function deadlockSuspect(state) {
    /* ① 存在飞出型 tap → 非疑（快照试算——纯谓词、无副作用） */
    var taps = enumerateTaps(state);
    for (var i = 0; i < taps.length; i++) {
      var snap = snapshot(state);
      var r = applyTap(state, taps[i]);
      var isFly = r.type === 'flyout' || r.type === 'prism-flyout';
      restore(state, snap);
      if (isFly) return false;
    }
    /* ② 有扳手可用 → 非疑（可救）（暂存区/stage 已移除——道具仅 undo/wrench） */
    if (state.items && state.items.wrench > 0 && taps.length > 0) return false;
    /* ③ ice>0 且 dock 内某花色计数 ≥2 → 三消可解冻 → 非疑 */
    var hasIce = false;
    for (var j = 0; j < state.tiles.length; j++) {
      if (!state.tiles[j].removed && state.tiles[j].ice > 0) { hasIce = true; break; }
    }
    if (hasIce) {
      var dc = {};
      for (var k = 0; k < state.dock.length; k++) dc[state.dock[k].s] = (dc[state.dock[k].s] || 0) + 1;
      for (var s in dc) if (dc[s] >= 2) return false;
    }
    /* ④ 存在 locked 且场上存在钥匙 → 可解锁 → 非疑 */
    var hasLock = false, hasKey = false;
    for (var m = 0; m < state.tiles.length; m++) {
      var tt = state.tiles[m];
      if (tt.removed) continue;
      if (tt.locked) hasLock = true;
      if (tt.m === MECH.KEY) hasKey = true;
    }
    if (hasLock && hasKey) return false;
    return true; /* 全部可救路径不存在 → 疑死锁（复证由调用方） */
  }

  /* T012: snapshot/restore 深拷贝对（Undo 与 Solver 回溯共用；运行时 dock 保序——D-07 规范化仅限 Solver 哈希）
   * actions 仅记长度（快照体量 O(1)——Solver DFS 数百万快照下 O(n) actions 拷贝会 OOM） */
  function snapshot(state) {
    return deepClone({
      boardTiles: boardTileSnap(state),
      dock: state.dock,
      items: state.items,
      combo: state.combo,
      score: state.score,
      lives: state.lives,
      actionCount: state.actions.length,
      chainConsumedCount: (state.chainConsumed || []).length
    });
  }

  function boardTileSnap(state) {
    /* 棱镜与 TileSpec 静态部分不入快照（不可变） */
    var out = [];
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      out.push({
        id: t.id, r: t.r, c: t.c, d: t.d, z: t.z || 0,
        m: t.m || null,
        ice: t.ice != null ? t.ice : null,
        locked: t.locked === true,
        removed: t.removed === true
      });
    }
    return out;
  }

  function restore(state, snap) {
    for (var i = 0; i < snap.boardTiles.length; i++) {
      var s = snap.boardTiles[i];
      var t = state.tiles[s.id];
      t.r = s.r; t.c = s.c; t.d = s.d; t.z = s.z || 0;
      t.ice = s.ice; t.locked = s.locked;
      t.removed = s.removed;
    }
    rebuildBoard(state);
    /* dock 恢复为 state.tiles 同一对象引用（对象身份统一——
     * 深拷贝会分叉身份: settleMatches 置 removed 的对象 ≠ state.tiles[id] → 幽灵滑块回棋盘 → 状态爆炸） */
    state.dock = [];
    for (var di = 0; di < snap.dock.length; di++) {
      state.dock.push(state.tiles[snap.dock[di].id]);
    }
    state.items = deepClone(snap.items);
    state.combo = snap.combo;
    state.score = snap.score;
    state.lives = snap.lives;
    /* actions 截断回快照长度（保留真实历史前缀; DFS 回溯按长度截断） */
    if (snap.actionCount != null) state.actions.length = snap.actionCount;
    else if (Array.isArray(snap.actions)) state.actions = deepClone(snap.actions);
    /* chainConsumed 截断: 超出快照计数的已消费配对逆序回插 cfg.chains
     * chains 顺序对语义无影响（解锁按内容查找）——计数对齐即可 */
    if (snap.chainConsumedCount != null && state.chainConsumed) {
      while (state.chainConsumed.length > snap.chainConsumedCount) {
        var back = state.chainConsumed.pop();
        state.cfg.chains.push(back.pair);
      }
    }
    return state;
  }

  function rebuildBoard(state) {
    var n = state.n;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var cell = state.board[r][c];
        if (cell && cell.prism) continue; /* 棱镜常驻 */
        state.board[r][c] = null;
      }
    }
    /* M1.5 Δ7: 同格未移除滑块按 z 升序重建栈数组 */
    var stacks = {};
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.removed) continue;
      var key = t.r + ':' + t.c;
      if (!stacks[key]) stacks[key] = [];
      stacks[key].push(t);
    }
    for (var sk in stacks) {
      var cellArr = stacks[sk];
      if (cellArr.length > 1) cellArr.sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
      var pos = sk.split(':');
      state.board[parseInt(pos[0], 10)][parseInt(pos[1], 10)] = cellArr;
    }
  }

  /* T013: validateLevel 基础校验（+ 每关 id===i+1 连续性由消费方遍历保证）
   * M1.5 Δ7: tiles 同格堆叠合法（z 0..2 唯一）；「无 (r,c) 重复」改为「同格 z 不重复」 */
  function validateLevel(level) {
    var errors = [];
    if (!level || typeof level !== 'object') { errors.push('level 非对象'); return { ok: false, errors: errors }; }
    if (typeof level.id !== 'number' || level.id < 1) errors.push('id 必须 ≥1');
    if (typeof level.n !== 'number' || level.n < 4 || level.n > 8) errors.push('n 必须在 4..8');
    if (!Array.isArray(level.tiles) || level.tiles.length < 6 || level.tiles.length % 3 !== 0) {
      errors.push('tiles 数量须 ≥6 且 %3==0');
    }
    if (Array.isArray(level.tiles) && level.tiles.length > 150) errors.push('tiles 数量超上限 150（Δ11 大棋盘 5 层塔容量放宽）');
    var seen = {};
    for (var i = 0; i < (level.tiles || []).length; i++) {
      var t = level.tiles[i];
      var key = t.r + ':' + t.c + ':' + (t.z || 0);
      if (seen[key]) errors.push('tiles 同格同层重复 (' + t.r + ',' + t.c + ',z' + (t.z || 0) + ')');
      seen[key] = true;
      if (t.r < 0 || t.r >= level.n || t.c < 0 || t.c >= level.n) errors.push('tile 越界 (' + t.r + ',' + t.c + ')');
      if (t.d < 0 || t.d > 3) errors.push('tile 方向非法 d=' + t.d);
      if (t.z != null && (t.z < 0 || t.z > 4 || !isFinite(t.z) || Math.floor(t.z) !== t.z)) errors.push('tile 层号非法 z=' + t.z);
      if (t.m != null && t.m !== 'g' && t.m !== 'i' && t.m !== 'c' && t.m !== 'k') {
        errors.push('tile 机制标记非法 m=' + t.m);
      }
      if (t.m === 'i' && !(t.x >= 1)) errors.push('冰封滑块 x 须 ≥1');
    }
    /* 同格堆叠深度 ≤5（M3 最高 5 层立体塔） */
    var depth = {};
    for (var di = 0; di < (level.tiles || []).length; di++) {
      var dt = level.tiles[di];
      var dk = dt.r + ':' + dt.c;
      depth[dk] = (depth[dk] || 0) + 1;
    }
    for (var dkk in depth) if (depth[dkk] > 5) errors.push('格子 ' + dkk + ' 堆叠深度 >5');
    var suits = {};
    for (var j = 0; j < (level.tiles || []).length; j++) {
      var s = level.tiles[j].s;
      suits[s] = (suits[s] || 0) + 1;
    }
    for (var sk in suits) {
      if (suits[sk] % 3 !== 0) errors.push('花色 ' + sk + ' 计数 %3 != 0');
    }
    var prisms = level.prisms || [];
    var pSeen = {};
    var occupied = {};
    for (var oi = 0; oi < (level.tiles || []).length; oi++) {
      var ot = level.tiles[oi];
      occupied[ot.r + ':' + ot.c] = true;
    }
    for (var k = 0; k < prisms.length; k++) {
      var p = prisms[k];
      var pk = p.r + ':' + p.c;
      if (occupied[pk]) errors.push('棱镜与滑块重叠 (' + p.r + ',' + p.c + ')');
      if (pSeen[pk]) errors.push('棱镜位置重复 (' + p.r + ',' + p.c + ')');
      pSeen[pk] = true;
      if (p.t !== '/' && p.t !== '\\') errors.push('棱镜型非法 t=' + p.t);
    }
    /* M1.6 根基规范 2: 底层 z=0 必须 100% 满铺（棱镜格除外——严禁空置黑洞格） */
    var nVal = typeof level.n === 'number' ? level.n : 0;
    var baseGrid = {};
    var zSets = {}; /* M1.7 Δ8: 同格层号集合——塔式堆叠须连续 {0..maxZ}（无悬空层） */
    for (var gi = 0; gi < (level.tiles || []).length; gi++) {
      var gt = level.tiles[gi];
      if ((gt.z || 0) === 0) baseGrid[gt.r + ':' + gt.c] = true;
      var gk = gt.r + ':' + gt.c;
      if (!zSets[gk]) zSets[gk] = {};
      zSets[gk][gt.z || 0] = true;
    }
    for (var zk in zSets) {
      var maxZ = 0;
      for (var zz in zSets[zk]) { var zNum = parseInt(zz, 10); if (zNum > maxZ) maxZ = zNum; }
      for (var zc = 0; zc <= maxZ; zc++) {
        if (!zSets[zk][zc]) errors.push('格子 ' + zk + ' 层号不连续（缺 z=' + zc + '——塔式堆叠禁悬空层）');
      }
    }
    for (var gr2 = 0; gr2 < nVal; gr2++) {
      for (var gc2 = 0; gc2 < nVal; gc2++) {
        var isPrismCell = false;
        for (var gp = 0; gp < prisms.length; gp++) {
          if (prisms[gp].r === gr2 && prisms[gp].c === gc2) { isPrismCell = true; break; }
        }
        if (!isPrismCell && !baseGrid[gr2 + ':' + gc2]) {
          errors.push('底层 z=0 未满铺: 空洞格 (' + gr2 + ',' + gc2 + ')');
        }
      }
    }
    var cfg = level.cfg || {};
    if (cfg.iceMode != null && cfg.iceMode !== 'triple' && cfg.iceMode !== 'adjacent') {
      errors.push('iceMode 非法: ' + cfg.iceMode);
    }
    if (Array.isArray(cfg.chains)) {
      for (var ci = 0; ci < cfg.chains.length; ci++) {
        var pair = cfg.chains[ci];
        if (!Array.isArray(pair) || pair.length !== 2 || !Array.isArray(pair[1]) || pair[1].length === 0) {
          errors.push('chains[' + ci + '] 配对格式非法');
          continue;
        }
        if (pair[0] === pair[1][0]) errors.push('chains[' + ci + '] 自环');
        /* T029: 键指向 m=='k' 滑块、锁指向 m=='c' 滑块 */
        var keyTile = (level.tiles || [])[pair[0]];
        if (!keyTile || keyTile.m !== 'k') errors.push('chains[' + ci + '] 键 ' + pair[0] + ' 非 m==k 钥匙滑块');
        for (var lk = 0; lk < pair[1].length; lk++) {
          var lockTile = (level.tiles || [])[pair[1][lk]];
          if (!lockTile || lockTile.m !== 'c') errors.push('chains[' + ci + '] 锁 ' + pair[1][lk] + ' 非 m==c 锁链滑块');
        }
      }
    }
    if (Array.isArray(level.solutionMoves)) {
      for (var m = 0; m < level.solutionMoves.length; m++) {
        var mv = level.solutionMoves[m];
        if (mv.k !== 0 && mv.k !== 1 && mv.k !== 2) errors.push('solutionMoves[' + m + '].k 非法');
        if ((mv.k === 0 || mv.k === 1) && (mv.t < 0 || mv.t >= (level.tiles || []).length)) {
          errors.push('solutionMoves[' + m + '].t 引用非法 tile id');
        }
      }
    } else {
      errors.push('solutionMoves 缺失或非数组');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* T013: renderProbe（§8 轻量视图，仅浏览器构建含；Node 侧为纯数据）
   * M1.5 Δ7: tiles 含 z 与 stackDepth（渲染堆叠底座/下层角标）；board 滑块 id 序 = tiles 序 */
  function renderProbe(state) {
    var tiles = [];
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.removed) continue;
      tiles.push({
        id: t.id, r: t.r, c: t.c, s: t.s, d: t.d, z: t.z || 0,
        m: t.m || null, ice: t.ice != null ? t.ice : null,
        locked: t.locked === true
      });
    }
    /* 堆叠深度表（格 → 未移除滑块数） */
    var depthMap = {};
    var j, tt;
    for (j = 0; j < tiles.length; j++) {
      tt = tiles[j];
      var dk = tt.r + ':' + tt.c;
      depthMap[dk] = (depthMap[dk] || 0) + 1;
    }
    for (j = 0; j < tiles.length; j++) {
      tt = tiles[j];
      tt.stackDepth = depthMap[tt.r + ':' + tt.c] || 1;
    }
    return {
      n: state.n,
      tiles: tiles,
      prisms: statePrisms(state),
      dock: state.dock.map(function (t) { return { id: t.id, s: t.s }; }),
      score: state.score, combo: state.combo, lives: state.lives
    };
  }

  function statePrisms(state) {
    var out = [];
    for (var r = 0; r < state.n; r++) {
      for (var c = 0; c < state.n; c++) {
        var cell = state.board[r][c];
        if (cell && cell.prism) out.push({ r: r, c: c, t: cell.t });
      }
    }
    return out;
  }

  /* ---------- 道具（T030: applyItem——wrench; stage/stageTile 已随暂存区移除） ---------- */

  /* =========================================================
   * Δ16g/T074 §4: applyPurify —— 棱晶复活的**唯一新增规则语义**
   *
   * 语义（FR-043 §1/§3/§4）:
   *   将 Dock 内**所有滞留滑块**连同棋盘上**同花色配对滑块**一并净化
   *   消除 → 腾空 Dock → 恢复 3 点生命 → 续局（不重置棋盘）。
   *
   * 花色守恒铁律（FR-043 §4 + Edge Case「复活后花色守恒与槽位状态」）:
   *   每个被净化的花色 MUST 以 **3 的倍数**成组消除；配对块不足 3 时
   *   以该花色的全部板面配对块成组消除，MUST NOT 留下「余数非 3 倍数」
   *   的非法态。
   *
   * 不变量（MUST NOT 改变的口径）: 三消 / 射线 / 齿轮 / 冰封 / 锁链 /
   * 棱镜 / 死局判定逐条不变——本函数只新增净化消除与生命值恢复。
   *
   * 前后端共用（FR-032 铁律）: 前端与 Solver 消费同一实现。
   * ========================================================= */
  function applyPurify(state) {
    var events = [];
    if (!state || !Array.isArray(state.dock)) return { events: events, removed: 0, suits: [] };

    /* ① 收集待净化的花色集合（Dock 内全部滞留滑块的花色） */
    var suitSet = {};
    var i, s;
    for (i = 0; i < state.dock.length; i++) {
      s = state.dock[i].s;
      suitSet[s] = true;
    }
    var suits = Object.keys(suitSet).map(function (k) { return parseInt(k, 10); });
    if (!suits.length) {
      /* Dock 本就为空 → 仍恢复生命（保证「点了复活」总有实效） */
      state.lives = state.cfg.lives;
      return { events: events, removed: 0, suits: [] };
    }

    /* ② 每个花色取够 3 块：Dock 滞留块优先，差额由板面**存活**同花色配对块
     *    补足；板面不足 3 时取该花色全部存活块（成组消除，不留非 3 倍数余数）。
     *    板面候选 MUST 过滤 `removed` —— 已飞出棋盘的滑块不在板上，
     *    选中它们会既不消块也不消除（幽灵块）并破坏花色守恒。 */
    var removedIds = [];
    var removedTiles = [];
    for (var k = 0; k < suits.length; k++) {
      var suit = suits[k];
      var ids = [];
      var tiles = [];
      /* 先取 Dock 内该花色的块 */
      for (i = 0; i < state.dock.length; i++) {
        if (state.dock[i].s === suit && ids.length < MATCH_N) ids.push(state.dock[i].id);
      }
      /* 差额由板面补足（仅存活块——`removed` 者已不在棋盘上） */
      if (ids.length < MATCH_N) {
        for (i = 0; i < state.tiles.length; i++) {
          var bt = state.tiles[i];
          if (bt.removed) continue;
          if (bt.s === suit && ids.length < MATCH_N) {
            ids.push(bt.id);
            tiles.push(bt);
          }
        }
      }
      if (!ids.length) continue; /* 该花色已无处可取（理论上不会发生） */
      /* 成组消除事件（与 settleMatches 同构，保持渲染层事件口径一致） */
      state.combo = (state.combo || 0) + 1;
      events.push({ e: 'match', suit: suit, ids: ids.slice(), combo: state.combo, gain: 0, purify: true });
      events.push({ e: 'remove', ids: ids.slice(), purify: true });
      removedIds = removedIds.concat(ids);
      removedTiles = removedTiles.concat(tiles);
    }

    /* ③ 板面移除被净化的配对块。
     *    铁律：`state.tiles` 的**数组下标 == 滑块 id**（init 阶段按 TileSpec
     *    顺序建表，canTap/applyTap/restore 均以 `tiles[id]` 寻址）。故此处
     *    MUST NOT 用 `filter` 压缩数组——那会让下标与 id 脱钩，导致复活后
     *    玩家点击命中**错误**的滑块，且 `tiles[id]` 越界取到 undefined。
     *    正确做法 = 原地置 `removed` 标记（与 removeFromBoard 同构），
     *    数组长度与下标恒定不变。 */
    if (removedTiles.length) {
      for (i = 0; i < removedTiles.length; i++) removedTiles[i].removed = true;
    }

    /* ③b 同步维护 `state.board[r][c]` 栈数组。
     *    `board` 是射线阻挡 / 栈顶判定的**唯一事实源**（castRay、isTopOfStack
     *    均读它）。若只置 `removed` 而不从栈里摘除，被净化的滑块会继续
     *    挡光、继续占据栈顶 → 复活后大量滑块变成「点不动的死块」。
     *    栈内摘除后若该格空了，须把 board[r][c] 置 null（与 removeFromBoard
     *    的口径一致，否则空数组会被 castRay 当作有效占格）。 */
    for (i = 0; i < removedTiles.length; i++) {
      var rt = removedTiles[i];
      var cell = state.board[rt.r] && state.board[rt.r][rt.c];
      if (!cell || !cell.length || cell.prism) continue;
      for (var ci = 0; ci < cell.length; ci++) {
        if (cell[ci] === rt) { cell.splice(ci, 1); break; }
      }
      if (!cell.length) state.board[rt.r][rt.c] = null;
    }

    /* ④ 腾空 Dock */
    state.dock = [];

    /* ⑤ 恢复 3 点生命（FR-043 §3） */
    state.lives = state.cfg.lives;

    return { events: events, removed: removedIds.length, suits: suits };
  }

  /* ---------- 导出 ---------- */
  return {
    DIR_VEC: DIR_VEC,
    REFLECT: REFLECT,
    MECH: MECH,
    DOCK_CAP: DOCK_CAP,
    MATCH_N: MATCH_N,
    init: init,
    canTap: canTap,
    applyTap: applyTap,
    applyItem: applyItem,
    applyPurify: applyPurify,
    terminal: terminal,
    deadlockSuspect: deadlockSuspect,
    enumerateTaps: enumerateTaps,
    validateLevel: validateLevel,
    renderProbe: renderProbe,
    snapshot: snapshot,
    restore: restore
  };
});
