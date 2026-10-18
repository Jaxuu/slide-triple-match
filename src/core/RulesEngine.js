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
 * M1.5 Δ7 多层堆叠棋盘（Multi-Layer Stack）:
 *   TileSpec 可选字段 z: 0|1|2（0 最底层，数字大者位于当前格最顶层）
 *   board[r][c] = 栈数组（底→顶）；栈非空即视为占格（阻挡射线——哪怕只剩底层）
 *   仅栈顶滑块可点击/受齿轮作用/触发飞出；顶层飞出后次顶层立即暴露（reveal 事件）
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

  /* Dock 容量 / 暂存区容量 / 三消阈值 */
  var DOCK_CAP = 7;
  var STAGING_CAP = 3;
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
    if (!cfg.items) cfg.items = { undo: 1, wrench: 1, stage: 1 };
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
      staging: [],
      cfg: cfg,
      lives: cfg.lives,
      score: 0,
      combo: 0,
      items: deepClone(cfg.items),
      actions: []            /* 动作序列（onRail 基准） */
    };
  }

  /* T008: canTap 谓词——射线畅通性不属于 canTap（受阻滑块仍可点击，点击后弹回）
   * M1.5 Δ7: 仅当前格栈顶滑块可点击（下层滑块被顶层压住，不可交互） */
  function canTap(state, tileId) {
    var t = state.tiles[tileId];
    if (!t || t.removed) return false;
    if (t.inStaging) return true;             /* 暂存滑块恒可 tap（Δ3 自由牌） */
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
   * 返回 { free: true, exit: {r,c} }（exit=越界前的最后格）或
   *      { free: false, blocker: {r,c}, cell }（cell = 占格内容：滑块或棱镜） */
  function castRay(state, r, c, d) {
    var v = DIR_VEC[d];
    var rr = r, cc = c;
    var lastR = r, lastC = c;
    for (;;) {
      rr += v.dr; cc += v.dc;
      if (rr < 0 || rr >= state.n || cc < 0 || cc >= state.n) {
        return { free: true, exit: { r: lastR, c: lastC } };
      }
      var cell = state.board[rr][cc];
      if (cell) return { free: false, blocker: { r: rr, c: cc }, cell: cell };
      lastR = rr; lastC = cc;
    }
  }

  /* 构造飞行路径（渲染动画用）：从 (r,c) 沿 d 至出口（含越界一步起点） */
  function buildPath(state, r, c, d) {
    var v = DIR_VEC[d];
    var path = [{ r: r, c: c }];
    var rr = r, cc = c;
    for (;;) {
      rr += v.dr; cc += v.dc;
      path.push({ r: rr, c: cc });
      if (rr < 0 || rr >= state.n || cc < 0 || cc >= state.n) return path;
      if (state.board[rr][cc]) return path;
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
      /* M1 无破冰联动（M2 T024 按 cfg.iceMode 扩展） */
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

    /* 暂存区滑块（Δ3 自由牌）：无射线判定，直接飞入 dock 尾 */
    if (t.inStaging) {
      return applyStageReturn(state, tileId, events);
    }

    state.actions.push({ k: 0, t: tileId });

    /* Step 1: 射线行走 */
    var ray = castRay(state, t.r, t.c, t.d);

    /* Step 2: Blocked 分支 */
    if (!ray.free && !(ray.cell && ray.cell.prism)) {
      var damage = state.cfg.damageOnBlock ? 1 : 0;
      if (damage) state.lives -= 1; /* 生命扣减写回 EngineState（rules-engine.md §7.3 契约） */
      var path = buildPath(state, t.r, t.c, t.d);
      path.pop(); /* 去掉越界步（被阻挡时不到达越界格）——保留到阻挡格前一格 */
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
    var flyPath = buildPath(state, t.r, t.c, t.d);
    var revealed = removeFromBoard(state, t);
    if (revealed) events.push({ e: 'reveal', id: revealed.id, r: revealed.r, c: revealed.c, z: revealed.z });
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

  /* T026 占位实现（M1 关卡无棱镜；结构就绪）——折射分支 */
  function tapPrism(state, t, ray, events) {
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
      if (cell) { blocked = { r: rr, c: cc }; break; }
      lastR = rr; lastC = cc;
    }

    if (blocked) {
      /* 3b: 折射后受阻 → 弹回原位（单次折射上限，FR-022） */
      var damage = state.cfg.damageOnBlock ? 1 : 0;
      if (damage) state.lives -= 1;
      var path = buildPath(state, t.r, t.c, t.d);
      path.push({ r: ray.blocker.r, c: ray.blocker.c }); /* 折射折点 */
      var v2 = DIR_VEC[nd];
      var backR = lastR, backC = lastC;
      /* 新射线行至阻挡前一格 */
      var pr = ray.blocker.r - v2.dr, pc = ray.blocker.c - v2.dc;
      var cur = { r: ray.blocker.r, c: ray.blocker.c };
      while (!(cur.r === pr && cur.c === pc)) {
        cur.r += v2.dr; cur.c += v2.dc;
        path.push({ r: cur.r, c: cur.c });
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
    var flyPath = buildPath(state, t.r, t.c, t.d);
    flyPath.push({ r: ray.blocker.r, c: ray.blocker.c }); /* 折点（棱镜格） */
    /* 棱镜格起沿新方向到越界 */
    var fr = ray.blocker.r, fc = ray.blocker.c;
    for (;;) {
      fr += v.dr; fc += v.dc;
      flyPath.push({ r: fr, c: fc });
      if (fr < 0 || fr >= state.n || fc < 0 || fc >= state.n) break;
    }
    removeFromBoard(state, t);
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

  /* Δ3 暂存回填（M2 T030 完整实现；结构就绪） */
  function applyStageReturn(state, tileId, events) {
    var t = state.tiles[tileId];
    var idx = -1;
    for (var i = 0; i < state.staging.length; i++) {
      if (state.staging[i].id === tileId) { idx = i; break; }
    }
    if (idx < 0) return { type: 'invalid', tileId: tileId, path: [], events: [] };
    state.staging.splice(idx, 1);
    t.inStaging = false;
    t.removed = false;
    state.dock.push(t);
    state.actions.push({ k: 1, t: tileId });
    events.push({ e: 'dock', id: tileId, slotIndex: state.dock.length - 1 });
    settleMatches(state, events);
    return { type: 'staged-return', tileId: tileId, path: [], events: events };
  }

  /* T011: terminal 终局判定（M1 基础版；M2 扩展 staging 与死锁复证） */
  function terminal(state) {
    /* won = 棋盘滑块 == 0 且 dock == 0（M1 口径；M2 扩展 staging.length==0，Δ3） */
    var boardTiles = 0;
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (!t.removed && !t.inStaging) boardTiles++;
    }
    if (boardTiles === 0 && state.dock.length === 0 && state.staging.length === 0) return 'won';
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

  /* T011: deadlockSuspect 占位返回 false（M2 T028 实现保守谓词） */
  function deadlockSuspect(state) {
    return false;
  }

  /* T012: snapshot/restore 深拷贝对（Undo 与 Solver 回溯共用；运行时 dock 保序——D-07 规范化仅限 Solver 哈希） */
  function snapshot(state) {
    return deepClone({
      boardTiles: boardTileSnap(state),
      dock: state.dock,
      staging: state.staging,
      items: state.items,
      combo: state.combo,
      score: state.score,
      lives: state.lives,
      actions: state.actions
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
        removed: t.removed === true,
        inStaging: t.inStaging === true
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
      t.removed = s.removed; t.inStaging = s.inStaging;
    }
    rebuildBoard(state);
    state.dock = deepClone(snap.dock);
    state.staging = deepClone(snap.staging);
    state.items = deepClone(snap.items);
    state.combo = snap.combo;
    state.score = snap.score;
    state.lives = snap.lives;
    state.actions = deepClone(snap.actions || []);
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
      if (t.removed || t.inStaging) continue;
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
    var seen = {};
    for (var i = 0; i < (level.tiles || []).length; i++) {
      var t = level.tiles[i];
      var key = t.r + ':' + t.c + ':' + (t.z || 0);
      if (seen[key]) errors.push('tiles 同格同层重复 (' + t.r + ',' + t.c + ',z' + (t.z || 0) + ')');
      seen[key] = true;
      if (t.r < 0 || t.r >= level.n || t.c < 0 || t.c >= level.n) errors.push('tile 越界 (' + t.r + ',' + t.c + ')');
      if (t.d < 0 || t.d > 3) errors.push('tile 方向非法 d=' + t.d);
      if (t.z != null && (t.z < 0 || t.z > 2 || !isFinite(t.z) || Math.floor(t.z) !== t.z)) errors.push('tile 层号非法 z=' + t.z);
      if (t.m != null && t.m !== 'g' && t.m !== 'i' && t.m !== 'c' && t.m !== 'k') {
        errors.push('tile 机制标记非法 m=' + t.m);
      }
      if (t.m === 'i' && !(t.x >= 1)) errors.push('冰封滑块 x 须 ≥1');
    }
    /* 同格堆叠深度 ≤3 */
    var depth = {};
    for (var di = 0; di < (level.tiles || []).length; di++) {
      var dt = level.tiles[di];
      var dk = dt.r + ':' + dt.c;
      depth[dk] = (depth[dk] || 0) + 1;
    }
    for (var dkk in depth) if (depth[dkk] > 3) errors.push('格子 ' + dkk + ' 堆叠深度 >3');
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
    for (var gi = 0; gi < (level.tiles || []).length; gi++) {
      var gt = level.tiles[gi];
      if ((gt.z || 0) === 0) baseGrid[gt.r + ':' + gt.c] = true;
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
        locked: t.locked === true, inStaging: t.inStaging === true
      });
    }
    /* 堆叠深度表（格 → 未移除滑块数） */
    var depthMap = {};
    var j, tt;
    for (j = 0; j < tiles.length; j++) {
      tt = tiles[j];
      if (tt.inStaging) continue;
      var dk = tt.r + ':' + tt.c;
      depthMap[dk] = (depthMap[dk] || 0) + 1;
    }
    for (j = 0; j < tiles.length; j++) {
      tt = tiles[j];
      if (tt.inStaging) { tt.stackDepth = 1; continue; }
      tt.stackDepth = depthMap[tt.r + ':' + tt.c] || 1;
    }
    return {
      n: state.n,
      tiles: tiles,
      prisms: statePrisms(state),
      dock: state.dock.map(function (t) { return { id: t.id, s: t.s }; }),
      staging: state.staging.map(function (t) { return { id: t.id, s: t.s }; }),
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

  /* ---------- 道具占位（T030 M2 实现） ---------- */
  function applyItem(state, item, tileId) {
    return { type: 'invalid', events: [] };
  }

  function stageTile(state, tileId) {
    return { type: 'invalid', tileId: tileId, path: [], events: [] };
  }

  /* ---------- 导出 ---------- */
  return {
    DIR_VEC: DIR_VEC,
    REFLECT: REFLECT,
    MECH: MECH,
    DOCK_CAP: DOCK_CAP,
    STAGING_CAP: STAGING_CAP,
    MATCH_N: MATCH_N,
    init: init,
    canTap: canTap,
    applyTap: applyTap,
    applyItem: applyItem,
    stageTile: stageTile,
    terminal: terminal,
    deadlockSuspect: deadlockSuspect,
    enumerateTaps: enumerateTaps,
    validateLevel: validateLevel,
    renderProbe: renderProbe,
    snapshot: snapshot,
    restore: restore
  };
});
