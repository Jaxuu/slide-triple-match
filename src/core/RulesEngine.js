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

  /* ---------- API 实现（T008~T013 逐任务填充；此处为地基骨架） ---------- */

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

    /* tiles 深拷贝 + id = TileSpec 索引 */
    var tiles = [];
    for (var j = 0; j < level.tiles.length; j++) {
      var t = deepClone(level.tiles[j]);
      t.id = j;
      if (t.m === MECH.ICE) t.ice = (t.x != null ? t.x : 1);
      if (t.m === MECH.CHAIN) t.locked = true;
      board[t.r][t.c] = t;
      tiles.push(t);
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
      actions: []            /* 动作序列（onRail 基准；opts.seed 由 Node 侧注入用） */
    };
  }

  /* T008: canTap 谓词（射线畅通性不属于 canTap——受阻滑块仍可点击） */
  function canTap(state, tileId) {
    var t = state.tiles[tileId];
    if (!t || t.removed) return false;
    if (t.inStaging) return true;             /* 暂存滑块恒可 tap（Δ3 自由牌） */
    if (t.ice > 0) return false;              /* 冰封不可点（M2 扩展点，M1 占位判断） */
    if (t.locked) return false;               /* 锁链不可点（M2 扩展点，M1 占位判断） */
    return true;
  }

  /* T008: enumerateTaps 枚举可行 tap 目标 id（行优先、列优先序——D-08 确定性） */
  function enumerateTaps(state) {
    var out = [];
    for (var i = 0; i < state.tiles.length; i++) {
      if (canTap(state, i)) out.push(i);
    }
    return out;
  }

  /* T009/T010: applyTap 原子回合结算（M1 实现，M2 扩展机制） */
  function applyTap(state, tileId) {
    return { type: 'invalid', tileId: tileId, path: [], events: [] };
  }

  /* T011: terminal 终局判定 */
  function terminal(state) {
    return 'playing';
  }

  /* T011: deadlockSuspect 占位（M2 实现保守谓词） */
  function deadlockSuspect(state) {
    return false;
  }

  /* T012: snapshot/restore 深拷贝对 */
  function snapshot(state) {
    return deepClone({
      boardTiles: boardTileSnap(state),
      dock: state.dock,
      staging: state.staging,
      items: state.items,
      combo: state.combo,
      score: state.score,
      lives: state.lives
    });
  }

  function boardTileSnap(state) {
    /* 棋盘滑块态以 tiles 数组紧凑表达（removed/位置/方向/机制动态量） */
    var out = [];
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      out.push({
        id: t.id, r: t.r, c: t.c, d: t.d,
        m: t.m || null, x: t.x != null ? t.x : null,
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
      t.r = s.r; t.c = s.c; t.d = s.d;
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
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.removed || t.inStaging) continue;
      state.board[t.r][t.c] = t;
    }
  }

  /* T013: validateLevel 基础校验 */
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
      var key = t.r + ':' + t.c;
      if (seen[key]) errors.push('tiles 位置重复 (' + t.r + ',' + t.c + ')');
      seen[key] = true;
      if (t.r < 0 || t.r >= level.n || t.c < 0 || t.c >= level.n) errors.push('tile 越界 (' + t.r + ',' + t.c + ')');
      if (t.d < 0 || t.d > 3) errors.push('tile 方向非法 d=' + t.d);
    }
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
    for (var k = 0; k < prisms.length; k++) {
      var p = prisms[k];
      var pk = p.r + ':' + p.c;
      if (seen[pk]) errors.push('棱镜与滑块重叠 (' + p.r + ',' + p.c + ')');
      if (pSeen[pk]) errors.push('棱镜位置重复 (' + p.r + ',' + p.c + ')');
      pSeen[pk] = true;
      if (p.t !== '/' && p.t !== '\\') errors.push('棱镜型非法 t=' + p.t);
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

  /* T013: renderProbe（§8 轻量视图，仅浏览器构建含；Node 侧为纯数据） */
  function renderProbe(state) {
    var tiles = [];
    for (var i = 0; i < state.tiles.length; i++) {
      var t = state.tiles[i];
      if (t.removed) continue;
      tiles.push({
        id: t.id, r: t.r, c: t.c, s: t.s, d: t.d,
        m: t.m || null, ice: t.ice != null ? t.ice : null,
        locked: t.locked === true, inStaging: t.inStaging === true
      });
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
