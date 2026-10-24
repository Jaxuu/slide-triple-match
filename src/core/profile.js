/* =========================================================
 * Slide & Triple — 玩家档案与经济态持久化模块（Δ16c / T065 / FR-040 / FR-041 / FR-044）
 * classic script；向 window.STM 挂载 STM.Profile（D-01；禁 import/export 语法）
 *
 * 铁律（宪章 I + FR-041 §4 + FR-044 §3）:
 *   ① localStorage 键 `slide-triple:profile:v2` —— 与既有
 *      `slide-triple:progress:v1`（关卡进度，T050）**并存不迁移**：
 *      v1 = 关卡进度（读取逻辑零改动，向后兼容）；v2 = 经济与档案态。
 *   ② **零回写 src/data/levels.js** —— 本模块与关卡数据完全解耦
 *      （FR-041 §4 / FR-032 铁律）。
 *   ③ localStorage 全访问 try/catch（隐私模式 / 配额异常 → 内存态
 *      降级照常可玩，D-03 纪律延续）。
 *   ④ 棱晶余额恒 ≥0（set/addShards 全路径下限钳制，MUST NOT 出现负值）。
 *   ⑤ 首通奖励幂等（grantFirstClear：同一关不重复发放）。
 *
 * 结构:
 *   {
 *     v: 2,
 *     shards: 200,                       // 初始赠送 200 棱晶（FR-041）
 *     nickname: '探险家',                 // 空值/超长有兜底默认
 *     avatar: 6,                         // 当前萌宠 Suit 0~44（默认 6 大熊猫）
 *     paintingProgress: [0,0,0,0,0,0],   // 6 幅画卷各自已点亮块数 0~4
 *     settings: { bgm: true, sfx: true, haptics: true },
 *     firstClear: {}                     // { levelId: true } 首通幂等账本
 *   }
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  var PROFILE_KEY = 'slide-triple:profile:v2';

  /* 初始赠送棱晶（FR-041 经济起点） */
  var INITIAL_SHARDS = 200;

  /* 昵称长度兜底（FR-040 §2） */
  var NICK_MAX = 12;
  var NICK_DEFAULT = '探险家';

  /* 默认头像 = Suit 6 大熊猫（FR-040 §2 图鉴已加载的萌宠切片） */
  var AVATAR_DEFAULT = 6;
  var AVATAR_MAX = 89;

  /* 6 幅风景画卷（Δ16b：bg{1..6} × 12 关） */
  var PAINTINGS = 6;
  var PIECES_PER_PAINTING = 4; /* 每幅 4 块拼图（每 12 关 = 4 个困难位关） */

  /* 6 幅画卷名称（Δ16b: L1-12 / L13-24 / L25-36 / L37-48 / L49-60 / L61-72）
   * Δ19 命名校正：按 bg{1..6} 实绘画面核对后同步（与美术资产一致）。 */
  var PAINTING_NAMES = [
    '晨曦雪峰浮岛', '云端飞瀑风车岛', '碧浪果冻浅湾',
    '凛冬冰川镜湖', '云端热气球航道', '星穹极光之巅'
  ];
  var PAINTING_RANGES = [
    [1, 12], [13, 24], [25, 36], [37, 48], [49, 60], [61, 72]
  ];

  /* 存储可用性（隐私模式 / 配额异常 → false，内存态继续） */
  var storageUsable = true;

  function defaults() {
    return {
      v: 2,
      shards: INITIAL_SHARDS,
      nickname: NICK_DEFAULT,
      avatar: AVATAR_DEFAULT,
      paintingProgress: [0, 0, 0, 0, 0, 0],
      settings: { bgm: true, sfx: true, haptics: true },
      firstClear: {}
    };
  }

  /* 内存态（存储不可用时的降级载体——照常可玩，仅不持久化） */
  var state = defaults();

  /* ---------- 数值钳制 ---------- */
  function clampInt(v, lo, hi, dflt) {
    var n = typeof v === 'number' ? Math.round(v) : parseInt(v, 10);
    if (typeof n !== 'number' || isNaN(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  /* 昵称兜底：空值 / 纯空白 / 超长截断 / 非字符串 → 默认名 */
  function sanitizeNickname(v) {
    if (typeof v !== 'string') return NICK_DEFAULT;
    var t = v.replace(/^\s+|\s+$/g, '');
    if (!t) return NICK_DEFAULT;
    /* 按 Unicode 码点截断（避免截出半个代理对） */
    var chars = Array.from ? Array.from(t) : t.split('');
    if (chars.length > NICK_MAX) t = chars.slice(0, NICK_MAX).join('');
    return t || NICK_DEFAULT;
  }

  /* ---------- localStorage 全访问 try/catch（D-03） ---------- */
  function rawGet(key) {
    try {
      var ls = global.localStorage;
      if (!ls) { storageUsable = false; return null; }
      return ls.getItem(key);
    } catch (e) {
      storageUsable = false;
      return null;
    }
  }

  /* 存储可用性主动复探（storageUsable 为粘滞位——某次异常后不会自动
   * 恢复；进入隐私模式/退出隐私模式等场景下须显式重探，否则存档会被
   * 永久误判为不可写）。返回本次探测结论并更新粘滞位。 */
  function probeStorage() {
    try {
      var ls = global.localStorage;
      if (!ls || typeof ls.getItem !== 'function') { storageUsable = false; return false; }
      storageUsable = true;
      return true;
    } catch (e) {
      storageUsable = false;
      return false;
    }
  }

  function rawSet(key, val) {
    try {
      var ls = global.localStorage;
      if (!ls) { storageUsable = false; return; }
      ls.setItem(key, val);
    } catch (e) {
      storageUsable = false; /* 写失败静默降级为内存态 */
    }
  }

  /* ---------- 归一化：任意读入对象 → 合法 state ---------- */
  function normalize(p) {
    var out = defaults();
    if (!p || typeof p !== 'object') return out;

    out.shards = clampInt(p.shards, 0, 999999999, INITIAL_SHARDS);
    out.nickname = sanitizeNickname(p.nickname);
    out.avatar = clampInt(p.avatar, 0, AVATAR_MAX, AVATAR_DEFAULT);

    var pp = p.paintingProgress;
    for (var i = 0; i < PAINTINGS; i++) {
      out.paintingProgress[i] = clampInt(pp && pp[i], 0, PIECES_PER_PAINTING, 0);
    }

    var st = p.settings || {};
    out.settings.bgm = typeof st.bgm === 'boolean' ? st.bgm : true;
    out.settings.sfx = typeof st.sfx === 'boolean' ? st.sfx : true;
    out.settings.haptics = typeof st.haptics === 'boolean' ? st.haptics : true;

    var fc = p.firstClear;
    if (fc && typeof fc === 'object') {
      Object.keys(fc).forEach(function (k) {
        var id = parseInt(k, 10);
        if (!isNaN(id) && id > 0) out.firstClear[id] = true;
      });
    }
    return out;
  }

  /* ---------- API ---------- */

  /* 读档（幂等——重复调用只是重读并归一化）
   * 降级纪律（D-03）: 存储不可用（隐私模式 / 配额异常）时 **保留内存态**
   * 作为真源——不因读失败而清空玩家当场的经济/档案态；仅当存储可用且
   * 确无存档记录时才回落默认值（首次开局送 200 棱晶）。 */
  function load() {
    probeStorage(); /* 先复探——粘滞位需按当前真实可用性刷新 */
    var raw = rawGet(PROFILE_KEY);
    if (raw == null) {
      if (!storageUsable) return state; /* 降级：内存态即真源，不清空 */
      state = defaults();               /* 可用但无记录 → 首次开局 */
      return state;
    }
    try {
      state = normalize(JSON.parse(raw));
    } catch (e) {
      /* 存档损坏 → 回落默认值，不抛错 */
      state = defaults();
    }
    return state;
  }

  /* 存档（浅快照——返回副本防外部误改） */
  function save() {
    rawSet(PROFILE_KEY, JSON.stringify(state));
    return state;
  }

  /* 只读访问：返回浅拷贝（调用方不得直接改内部态） */
  function get() {
    return {
      v: state.v,
      shards: state.shards,
      nickname: state.nickname,
      avatar: state.avatar,
      paintingProgress: state.paintingProgress.slice(),
      settings: {
        bgm: state.settings.bgm,
        sfx: state.settings.sfx,
        haptics: state.settings.haptics
      },
      firstClear: Object.assign({}, state.firstClear)
    };
  }

  /* 通用字段写入（key 白名单 + 归一化，杜绝越权写） */
  function set(key, value) {
    var next = normalize({
      v: 2,
      shards: state.shards,
      nickname: state.nickname,
      avatar: state.avatar,
      paintingProgress: state.paintingProgress,
      settings: state.settings,
      firstClear: state.firstClear
    });
    switch (key) {
      case 'shards': next.shards = clampInt(value, 0, 999999999, state.shards); break;
      case 'nickname': next.nickname = sanitizeNickname(value); break;
      case 'avatar': next.avatar = clampInt(value, 0, AVATAR_MAX, state.avatar); break;
      case 'settings':
        next.settings = {
          bgm: typeof value.bgm === 'boolean' ? value.bgm : state.settings.bgm,
          sfx: typeof value.sfx === 'boolean' ? value.sfx : state.settings.sfx,
          haptics: typeof value.haptics === 'boolean' ? value.haptics : state.settings.haptics
        };
        break;
      default: return state; /* 未知字段静默忽略 */
    }
    state = next;
    save();
    return state;
  }

  /* 棱晶增减（delta 可正可负；余额下限钳制 0 —— MUST NOT 出现负值）。
   * 返回扣费后的实际余额（= attempt - actualSpent 语义供调用方核对） */
  function addShards(delta) {
    var d = typeof delta === 'number' ? Math.round(delta) : parseInt(delta, 10);
    if (typeof d !== 'number' || isNaN(d)) return state.shards;
    state.shards = clampInt(state.shards + d, 0, 999999999, 0);
    save();
    return state.shards;
  }

  /* 原子扣费（FR-041 §2 / Edge Case「棱晶余额不足与购买竞态」铁律）:
   * 余额恰等于价格 → 扣至 0 且**返回 true**（不因余额为 0 而误判不足）；
   * 余额不足 → 零扣费零消耗，返回 false。 */
  function spendShards(cost) {
    var c = typeof cost === 'number' ? Math.round(cost) : parseInt(cost, 10);
    if (typeof c !== 'number' || isNaN(c) || c <= 0) return true; /* 非正价格 = 无需扣费 */
    if (state.shards < c) return false; /* 不足：零扣费（余额未被触碰） */
    state.shards = clampInt(state.shards - c, 0, 999999999, 0);
    save();
    return true;
  }

  /* 首通幂等账本：首次返回 true 并标记；重复通关返回 false（不重复发奖） */
  function grantFirstClear(levelId) {
    var id = parseInt(levelId, 10);
    if (isNaN(id) || id <= 0) return false;
    if (state.firstClear[id]) return false;
    state.firstClear[id] = true;
    save();
    return true;
  }

  function hasCleared(levelId) {
    var id = parseInt(levelId, 10);
    return !!(state.firstClear && state.firstClear[id]);
  }

  /* 拼图块递增（上限 4 —— 达上限后返回 false 不再递增） */
  function unlockPaintingTile(paintingIdx) {
    var pi = parseInt(paintingIdx, 10);
    if (isNaN(pi) || pi < 0 || pi >= PAINTINGS) return false;
    if (state.paintingProgress[pi] >= PIECES_PER_PAINTING) return false;
    state.paintingProgress[pi] = clampInt(state.paintingProgress[pi] + 1, 0, PIECES_PER_PAINTING, 0);
    save();
    return true;
  }

  /* 由关卡号推当前画卷序号（Δ16b 铁律: floor((id-1)/12)，0-based） */
  function paintingIndexOfLevel(levelId) {
    var id = parseInt(levelId, 10);
    if (isNaN(id) || id < 1) return 0;
    return Math.min(PAINTINGS - 1, Math.max(0, Math.floor((id - 1) / 12)));
  }

  /* 由关卡号推该关在当前画卷内的序号（0..11），供拼图进度展示 */
  function levelSlotInPainting(levelId) {
    var id = parseInt(levelId, 10);
    if (isNaN(id) || id < 1) return 0;
    return (id - 1) % 12;
  }

  /* ---------- Δ20 Bug 1：晶片解锁态反推（纯计算——零持久化写入） ----------
   * 背景：paintingProgress 只在真实通关结算（settleWin）时递增，跳关 /
   * 深链 / 老存档下与关卡进度发散 → 大厅出现「关卡 12 却拼图 0/4」。
   * 故以**关卡进度为权威源**反推点亮态：凡充能关卡 <= maxPassed 即点亮。
   *
   * 口径：maxPassed = max(unlocked-1, currentLevel-1, ...clearedLevels)
   *   · unlocked      = 最新解锁关卡号（= 已通关最高关 + 1）
   *   · currentLevel  = 当前所处关卡号（跳关/深链时高于已通关进度）
   *   · clearedLevels = 已通关关卡号集合（并入 profile v2 的 firstClear 账本）
   * 晶片 q（第 q+1 块，0-based）的充能关卡 = range[0] + 2 + 3*q
   *   （第 1 大陆 = L3/L6/L9/L12，与「每第 3 关点亮 1 块」节奏一致）
   * 本函数 MUST NOT 写入任何持久化状态——点亮态（展示）与奖励发放
   * （settleWin 按 firstClear 幂等发奖）解耦（FR-041 §4 铁律）。 */
  function maxPassedLevel(ctx) {
    ctx = ctx || {};
    var m = Math.max((ctx.unlocked || 1) - 1, (ctx.currentLevel || 1) - 1);
    var cl = ctx.clearedLevels || [];
    for (var i = 0; i < cl.length; i++) {
      var v = parseInt(cl[i], 10);
      if (!isNaN(v) && v > m) m = v;
    }
    return m;
  }

  /* 某画卷第 quad 块晶片的充能关卡号（0-based quad → 1-based 关卡） */
  function chargeLevelOf(paintingIdx, quad) {
    var idx = Math.min(PAINTINGS, Math.max(1, paintingIdx | 0 || 1));
    var range = PAINTING_RANGES[idx - 1] || [1, 12];
    return range[0] + 2 + 3 * quad;
  }

  /* 某画卷 4 块晶片的解锁态（flags[0..3] + 已点亮计数） */
  function pieceUnlockFlags(paintingIdx, ctx) {
    var idx = Math.min(PAINTINGS, Math.max(1, paintingIdx | 0 || 1));
    var maxPassed = maxPassedLevel(ctx);
    var cleared = (ctx && ctx.clearedLevels) ? ctx.clearedLevels : [];
    var flags = [];
    for (var q = 0; q < PIECES_PER_PAINTING; q++) {
      var req = chargeLevelOf(idx, q);
      var inCleared = false;
      for (var i = 0; i < cleared.length; i++) {
        if (parseInt(cleared[i], 10) === req) { inCleared = true; break; }
      }
      flags.push(req <= maxPassed || inCleared);
    }
    var litCount = 0;
    for (var j = 0; j < flags.length; j++) if (flags[j]) litCount++;
    return { flags: flags, litCount: litCount, maxPassed: maxPassed, index: idx };
  }

  function setAvatar(suit) { set('avatar', suit); return get().avatar; }
  function setNickname(name) { set('nickname', name); return get().nickname; }
  function setSetting(key, on) {
    var cur = get().settings;
    if (key !== 'bgm' && key !== 'sfx' && key !== 'haptics') return get().settings;
    cur[key] = !!on;
    set('settings', cur);
    return get().settings;
  }

  /* 触觉震动可用性探测（FR-040 §1: 不支持时 MUST 显示为不可用且保持关闭） */
  function hapticsSupported() {
    try {
      return typeof (global.navigator || {}).vibrate === 'function';
    } catch (e) {
      return false;
    }
  }

  function isStorageUsable() { return probeStorage(); }

  STM.Profile = {
    PROFILE_KEY: PROFILE_KEY,
    INITIAL_SHARDS: INITIAL_SHARDS,
    NICK_MAX: NICK_MAX,
    NICK_DEFAULT: NICK_DEFAULT,
    AVATAR_DEFAULT: AVATAR_DEFAULT,
    PAINTINGS: PAINTINGS,
    PIECES_PER_PAINTING: PIECES_PER_PAINTING,
    PAINTING_NAMES: PAINTING_NAMES,
    PAINTING_RANGES: PAINTING_RANGES,

    load: load,
    save: save,
    get: get,
    set: set,
    addShards: addShards,
    spendShards: spendShards,
    grantFirstClear: grantFirstClear,
    hasCleared: hasCleared,
    unlockPaintingTile: unlockPaintingTile,
    paintingIndexOfLevel: paintingIndexOfLevel,
    albumIndex: paintingIndexOfLevel,
    levelSlotInPainting: levelSlotInPainting,
    maxPassedLevel: maxPassedLevel,
    chargeLevelOf: chargeLevelOf,
    pieceUnlockFlags: pieceUnlockFlags,
    setAvatar: setAvatar,
    setNickname: setNickname,
    setSetting: setSetting,
    hapticsSupported: hapticsSupported,
    probeStorage: probeStorage,
    isStorageUsable: isStorageUsable
  };
})(typeof window !== 'undefined' ? window : globalThis);