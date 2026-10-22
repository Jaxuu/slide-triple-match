/* =========================================================
 * Slide & Triple — 章节参数矩阵（level-config.js，Δ5）
 * Node 离线工具配置（CommonJS）：前端永不引用（level-pipeline.md §4）
 * 追加 CHAPTERS 条目即新增章节（Δ5 扩容）
 *
 * Δ11 大棋盘波浪架构（用户试玩驱动重构）:
 * Δ13 60 关增量扩容（3×20 大阶段 = 20 个「简-简-难」三关循环）:
 *   网格排布铁律:
 *     · L1 固定 5×5（新手引导: 底层满铺 + 局部 2 层堆叠, 27 或 30 块）
 *     · L2 固定 6×6（进阶过渡: 底层满铺 + 2 层堆叠, 42 或 45 块）
 *     · L3 = 新手循环 1 的困难关（7×7, z0 满铺 + 局部 2~3 层, 54~60 块, 无机关）
 *     · L4~L72 = 循环 2~24, 严格「2 简 1 难」波浪（7×7/7×7/8×8）:
 *       挑战位 = (levelId-4) % 3 === 2（L6/L9/…/L72 共 23 个 8×8; 加 L3 硬编码位 = 24 个挑战位关）
 *   纵向难度演进（L1→L60 总体稳步提高, 覆盖局部波浪）:
 *     · 前期 L4~16: 堆叠 2~3 层（7×7 约 54~63 块, 8×8 约 69~78 块）
 *     · 中期 L17~36: 堆叠 3~4 层（7×7 约 63~75 块, 8×8 约 78~90 块）
 *     · 后期 L37~72: 最高 5 层 z=0..4（7×7 约 72~84 块, 8×8 87~105 块）
 *   机制引入: gear L7+ / ice L12+ / chain L22+ / prism L32+（Δ13: 原 L6/L11/L21/L31
 *   随 +1 平移——与拼接数据一致; 新手循环 1（L1~L3）零机关）
 *   花色: 7×7 简单关较低（3~7）, 8×8 挑战关较高（最高 8）, 随关号递增
 *   章区间（Δ16 3×24 大阶段）: ch1 L1-24 / ch2 L25-48 / ch3 L49-72
 *   注: 拼接交付物中 damageOnBlock 实际自新 L17 起（原 L16 平移的历史批次痕迹;
 *   本章表描述全新再生成口径——ch1 全 false）
 * ========================================================= */
'use strict';

var CHAPTERS = [
  {
    id: 1,
    levels: [1, 24],   /* Δ16a: 3×24 大阶段（Δ13 原 [1,20]） */
    /* 网格由 waveGrid() 铁律决定（L1=5×5, L2=6×6, L3=新手难关 7×7, L4+ 7/7/8 波浪）——grid 字段为
     * 兼容旧字段保留（L2 之前插值用），实际 n 以 waveGrid 输出为准 */
    grid: [5, 6],
    suits: [3, 5],            /* 前期花色 3~5（简单关低花色） */
    tiles: [27, 63],          /* 区间上限仅校验用; 实际由 waveTiles() 按棋盘+阶段算 */
    zMax: [2, 3],             /* 前期堆叠 2~3 层 */
    mechanisms: { gear: true, ice: true, chain: false, prism: false },
    mechFrom: { gear: 7, ice: 12, chain: 22, prism: 32 },
    mechDensity: { gear: [0.08, 0.14], ice: [0.06, 0.14], chain: [0, 0], prism: [0, 0] },
    damageOnBlock: false,
    lives: 3,
    items: { undo: 1, wrench: 1 },
    iceMode: 'triple',
    rhythm: null,
    budget: { nodes: 2000000, ms: 60000 }
  },
  {
    id: 2,
    levels: [25, 48],  /* Δ16a: 3×24 大阶段（Δ13 原 [21,40]） */
    grid: [7, 8],
    suits: [5, 7],
    tiles: [63, 90],
    zMax: [3, 4],             /* 中期堆叠 3~4 层 */
    mechanisms: { gear: true, ice: true, chain: true, prism: true },
    mechFrom: { gear: 7, ice: 12, chain: 22, prism: 32 },
    mechDensity: { gear: [0.06, 0.10], ice: [0.06, 0.12], chain: [0.08, 0.16], prism: [1, 3] },
    damageOnBlock: true,      /* 中期起受阻扣命（FR-003） */
    lives: 3,
    items: { undo: 1, wrench: 1 },
    iceMode: 'triple',
    rhythm: null,
    budget: { nodes: 2000000, ms: 60000 }
  },
  {
    id: 3,
    levels: [49, 72],  /* Δ16a: 3×24 大阶段（Δ13 原 [41,60]） */
    grid: [7, 8],
    suits: [6, 8],
    tiles: [72, 105],
    zMax: [4, 5],             /* 后期最高 5 层（z=0..4） */
    mechanisms: { gear: true, ice: true, chain: true, prism: true },
    mechFrom: { gear: 7, ice: 12, chain: 22, prism: 32 },
    mechDensity: { gear: [0.06, 0.10], ice: [0.06, 0.10], chain: [0.06, 0.12], prism: [2, 4] },
    damageOnBlock: true,
    lives: 3,
    items: { undo: 1, wrench: 1 },
    iceMode: 'triple',
    /* FR-012 节奏模板: 个位 4/9 挑战关 / 5/0 解压爽关（对称图案） */
    rhythm: {
      challengeDigits: [4, 9],
      relaxDigits: [5, 0],
      themes: ['ring', 'butterfly', 'diamond', 'heart']
    },
    budget: { nodes: 2000000, ms: 60000 }
  }
];

/* 难度评分权重（FR-011/SC-004；norm = 全 60 关全域 min-max 归一） */
var SCORE_WEIGHTS = {
  minMoves: 1.1,
  solutionCount: 0.8,
  dockPeak: 1.2,
  mechCount: 1.0,
  tiles: 0.5,
  suits: 0.7
};

/* =========================================================
 * Δ15a/FR-029 §1~§4: 同花色空间聚散度三档曲线档位
 * 邻接定义（§1）: 两同花色滑块曼哈顿距离 1 或同格相邻层 = 连坐;
 *   三连簇 = 三元组内 ≥2 对连坐（连通紧挨）; 双连坐 = 恰 1 对连坐;
 *   完全分散 = 两两曼哈顿 ≥2
 * 档位（trip = 三连簇占比上限; pair = 双连坐目标占比带;
 *   minPairMin/minPairMax = 同花色三元组两两最小曼哈顿距离达标下限——
 *   L22~L72 恒 ≥2、8×8 关优先 ≥3）
 * ========================================================= */
var DISPERSION_TIERS = [
  { from: 1,  to: 6,   tripMax: 0.15, pairMin: 0.20, pairMax: 0.50, minPairMin: 1, minPairMax: 2 },
  { from: 7,  to: 21,  tripMax: 0.05, tripMaxPerLevel: 1, pairMin: 0.15, pairMax: 0.30, minPairMin: 2, minPairMax: 3 },
  { from: 22, to: 72,  tripMax: 0,   /* Δ16a: 末档延展至 L72（FR-029 §4 三连簇 0%） */    pairMin: 0.00, pairMax: 0.15, minPairMin: 2, minPairMax: 3 }
];

/* Δ15a/FR-029 §5: 聚散度档位结构极限白名单（可解性不降级铁律优先）——
 * 花色重打散（仅重排同花色落位，不改网格/总数/堆叠/机制）在下列关的
 * 几何结构下经 200 种子全扫描证明档位不可达，受控降级（分项最优）+ 报告
 * 记录，不触发回炉（回炉须改结构参数，违反 §6 迁移边界）:
 *   L1: 5×5 盘 30 块，suit0 占 60%（6/10 组）——小盘高占比下 trip≤15%（≤1 组）
 *       几何不可达（200 种子最优 3 组）
 *   L2: 6×6 盘 45 块满格占用（36/36，9 格双层），suit0=21 块——满盘密度下
 *       pair≤50% 不可达（200 种子恒 53.3% = 8/15 组，几何常数）
 *   L41: 尾 12 位格位仅 7 格（5 对同格堆叠），前段 quota 耗尽后尾段仅
 *       {suit2:9, suit4:3}——12 块 7 格鸽笼原理 ≥1 组 2 对连坐（trip>0
 *       不可达; 200 种子最优 1 簇 = 1/24 = 4.2%） */
var DISPERSION_STRUCTURAL_LIMITS = [1, 2, 41];

/* Δ15a/Δ16a: 按 levelId 取聚散度档位（L1~L6 / L7~L21 / L22~L72） */
function dispersionTierOf(levelId) {
  for (var i = 0; i < DISPERSION_TIERS.length; i++) {
    if (levelId >= DISPERSION_TIERS[i].from && levelId <= DISPERSION_TIERS[i].to) return DISPERSION_TIERS[i];
  }
  return DISPERSION_TIERS[DISPERSION_TIERS.length - 1];
}

/* =========================================================
 * Δ19b/FR-045 §2: 层数演进矩阵（v2 布局口径）
 *   L1 = 1 层; L2 = 2 层; L3 起按 2-2-3 / 2-3-4 随进度提升至普遍 ≥3 层
 *   7×7 简单关最高 4 层; 8×8 困难关最高 5 层
 *   （对既有「L1 2 层 / L2 2 层 / 前期 2~3 / 中期 3~4 / 后期最高 5」档位的
 *     受控修订——FR-008 Δ19 迁移条款 §3「迁移后以 FR-045 §2 为准」）
 * ========================================================= */
function v2LayerCount(levelId) {
  if (levelId === 1) return 1;            /* L1 = 1 层（基础玩法教学） */
  if (levelId === 2) return 2;            /* L2 = 2 层（层叠压制教学） */
  if (levelId === 3) return 2;            /* L3 = 新手循环 1 难关 */
  var n = waveGrid(levelId);
  var isChallenge = wavePos(levelId) === 2;
  var base;
  if (levelId <= 12) base = isChallenge ? 3 : 2;      /* 2-2-3 */
  else if (levelId <= 30) base = isChallenge ? 4 : (levelId % 3 === 0 ? 3 : 2); /* 2-3-4 */
  else base = isChallenge ? 5 : 3;                     /* 3-4-5 */
  /* 层数上限铁律: 7×7 简 ≤4 层 / 8×8 难 ≤5 层 */
  var cap = isChallenge ? 5 : 4;
  return Math.max(1, Math.min(cap, base));
}

/* Δ19b/FR-045 §1: 掩码模板 id 选取（确定性——禁 Math.random，D-08）
 *   每关绑定「底层模板 id + 上层模板 id」——上层模板与底层同族但
 *   取相邻 id（视觉上同主题、不同轮廓），全部落库于关卡 cfg。
 *   模板 id MUST 落库于关卡 cfg（运行时 MUST NOT 随机选取）。 */
function v2MaskIds(levelId) {
  var base = (levelId * 7 + 3) % 36;             /* 底层模板（确定性散列） */
  var upper = (base + 1 + (levelId % 5)) % 36;   /* 上层模板（同族相邻 + 偏移） */
  return { base: base, upper: upper };
}

/* Δ19b/FR-045 §2: 关卡掩码落位集合（按层数矩阵产出，含零悬空剔除）
 *   依赖 src/render/shape-masks.js（前端与离线工具共用同一份定义——
 *   宪章 II 零构建约束不破：Node 直接 require 该 UMD 模块） */
function loadShapeMasks() {
  var path = require('path');
  return require(path.join(__dirname, '..', 'src', 'render', 'shape-masks.js'));
}

function v2ShapeLayers(levelId) {
  var SM = loadShapeMasks();
  var ids = v2MaskIds(levelId);
  var n = waveGrid(levelId);
  var lc = v2LayerCount(levelId);
  /* 底层用 base 模板；上层（z≥1）用 upper 模板 */
  var lower = SM.buildLayers(ids.base, n, 1);
  var out = [{ z: 0, cells: lower[0].cells }];
  if (lc > 1) {
    var up = SM.buildLayers(ids.upper, n, lc - 1);
    /* 上层模板的 z 需重映射为实际层号 1..lc-1，并按引擎口径剔除悬空 */
    var prev = out[0].cells;
    for (var i = 0; i < up.length; i++) {
      var z = i + 1;
      var cells = up[i].cells;
      var viol = SM.supportViolations(prev, cells, (z % 2) === 1);
      if (viol.length) {
        var bad = {};
        for (var v = 0; v < viol.length; v++) bad[viol[v].r + ':' + viol[v].c] = true;
        cells = cells.filter(function (cell) { return !bad[cell.r + ':' + cell.c]; });
      }
      out.push({ z: z, cells: cells });
      prev = cells;
    }
  }
  return { ids: ids, layers: out, n: n, layerCount: lc };
}

/* Solver 默认预算（章级可覆盖，见 CHAPTERS[i].budget） */
var BUDGET = { nodes: 2000000, ms: 60000 };

/* ---------- 加载时校验: 章区间无空洞无重叠（T040） ---------- */
function validateChapters() {
  var errors = [];
  if (!Array.isArray(CHAPTERS) || !CHAPTERS.length) { errors.push('CHAPTERS 为空'); return errors; }
  var expectedStart = CHAPTERS[0].levels[0];
  for (var i = 0; i < CHAPTERS.length; i++) {
    var ch = CHAPTERS[i];
    if (ch.id !== i + 1) errors.push('章 ' + i + ' id 应为 ' + (i + 1));
    if (ch.levels[0] !== expectedStart) errors.push('章 ' + ch.id + ' 起始关号 ' + ch.levels[0] + ' 应为 ' + expectedStart + '（空洞/重叠）');
    var span = ch.levels[1] - ch.levels[0] + 1;
    if (span < 1) errors.push('章 ' + ch.id + ' 区间非法');
    expectedStart = ch.levels[1] + 1;
  }
  return errors;
}

var vErrs = validateChapters();
if (vErrs.length) {
  throw new Error('level-config CHAPTERS 校验失败: ' + vErrs.join('; '));
}

/* ---------- Δ13 网格铁律（waveGrid）----------
 * L1 = 5×5; L2 = 6×6; L3 = 7×7（新手循环 1 的困难关）;
 * L4+ = 3 关一循环（(id-4)%3===2 → 8×8 挑战关, 否则 7×7 简单关）
 * 挑战位: L6, L9, …, L72（Δ16a 扩容后 23 个 8×8 位 + L3 硬编码位） */
function waveGrid(levelId) {
  if (levelId === 1) return 5;
  if (levelId === 2) return 6;
  return (levelId - 4) % 3 === 2 ? 8 : 7;
}

/* ---------- Δ13 波浪周期内位置（0=简1, 1=简2, 2=挑战; L1~L3 新手循环 1 恒简位）---------- */
function wavePos(levelId) {
  if (levelId <= 3) return 0;
  return (levelId - 4) % 3;
}

/* ---------- Δ13/Δ16a tiles 预算（waveTiles）----------
 * 阶段表（7×7 / 8×8 双轨）: 依 levelId 取阶段基准区间 + 关内渐进。
 * 恒对齐 3 的倍数; z=0 满铺铁律要求 tiles ≥ n*n - prisms。
 *   新 L3: 57（7×7 底 49 + 叠 8, 新手循环 1 的困难关）
 *   前期 L4~16:  7×7 [54,63]   8×8 [69,78]
 *   中期 L17~36: 7×7 [63,75]   8×8 [78,90]
 *   后期 L37~72: 7×7 [72,84]   8×8 [87,105]（Δ16: L61~L72 沿用本档）
 * L1 = 27 或 30（5×5 底 25 + 叠 2~5）; L2 = 42 或 45（6×6 底 36 + 叠 6~9） */
function waveTiles(levelId) {
  if (levelId === 1) return 30;   /* 5×5: 底 25 + 叠 5（新手引导, 局部 2 层） */
  if (levelId === 2) return 45;   /* 6×6: 底 36 + 叠 9（进阶过渡, 2 层为主） */
  if (levelId === 3) return 57;   /* 7×7: 底 49 + 叠 8（新手循环 1 困难关, 局部 2~3 层） */
  var n = waveGrid(levelId);
  var isChallenge = wavePos(levelId) === 2;
  var lo, hi;
  if (levelId <= 16) { lo = n === 7 ? 54 : 69; hi = n === 7 ? 63 : 78; }
  else if (levelId <= 36) { lo = n === 7 ? 63 : 78; hi = n === 7 ? 75 : 90; }
  else { lo = n === 7 ? 72 : 87; hi = n === 7 ? 84 : 105; }
  /* 关内渐进: 周期位置（简1→简2→挑战）+ 全局 frac 线性抬升; 档差拉大——
   * 简单关取区间低位（0.0~0.35）挑战关高位（0.6~1.0+0.15 抬升）→
   * 波浪锯齿显著性（简/难档 difficultyScore 分离，曲线门-3） */
  var frac = (levelId - 4) / 68; /* 0..1 全局进度（L4~L72——Δ16a 扩容后全域） */
  var v = lo + (hi - lo) * (isChallenge ? (0.6 + 0.4 * frac) : (0.0 + 0.35 * frac));
  /* 挑战关再抬一档（阶段内偏上界）; 简单关取低位 */
  if (isChallenge) v += (hi - lo) * 0.15;
  v = Math.max(lo, Math.min(hi, v));
  return Math.round(v / 3) * 3;
}

/* ---------- Δ13/Δ16a zMax（waveZMax）----------
 * 新 L3 = 3; 前期 L4~16 = 2~3 / 中期 L17~36 = 3~4 / 后期 L37~72 = 4~5;
 * 挑战关偏高, 简单关偏低; L1/L2 = 2 */
function waveZMax(levelId) {
  if (levelId <= 2) return 2;
  if (levelId === 3) return 3;
  var isChallenge = wavePos(levelId) === 2;
  var base;
  if (levelId <= 16) base = isChallenge ? 3 : 2;
  else if (levelId <= 36) base = isChallenge ? 4 : 3;
  else base = isChallenge ? 5 : 4;
  /* 简单关后期也逐步拔高（总体递进覆盖局部波浪） */
  if (!isChallenge) {
    if (levelId >= 46) base += 1;
    else if (levelId >= 29) base += 1;
    if (base > 5) base = 5;
  }
  return base;
}

/* ---------- 章内关级参数解析（D-08 确定性——无随机） ---------- */
function lerp(a, b, f) { return a + (b - a) * f; }
function lerpRound(a, b, f) { return Math.round(lerp(a, b, f)); }

function findChapter(levelId) {
  for (var i = 0; i < CHAPTERS.length; i++) {
    if (levelId >= CHAPTERS[i].levels[0] && levelId <= CHAPTERS[i].levels[1]) return CHAPTERS[i];
  }
  throw new Error('levelId ' + levelId + ' 不在任何章节区间');
}

/* 关参数解析（Δ11 波浪网格 + 阶段递进 + rhythm 覆盖）。返回:
 * {id, chapter, n, suits, tiles, zMax, mechDensity, gearOn, iceOn, chainOn, prismOn, prismCount, rhythmKind, theme, cfg} */
function levelParams(levelId) {
  var ch = findChapter(levelId);
  var idx = levelId - ch.levels[0];
  var frac = ch.levels[1] > ch.levels[0] ? idx / (ch.levels[1] - ch.levels[0]) : 0;
  var isChallenge = wavePos(levelId) === 2;

  /* Δ11: 网格/tiles/zMax 全由波浪函数决定（不再用章 grid/tiles 插值） */
  var n = waveGrid(levelId);
  var tiles = waveTiles(levelId);
  var zMax = waveZMax(levelId);

  /* 花色: 章区间插值 + 波浪调制——8×8 挑战关偏高（最高 8）、7×7 简单关偏低 */
  var suits = lerpRound(ch.suits[0], ch.suits[1], frac);
  if (levelId >= 3) {
    if (isChallenge) suits = Math.min(8, suits + 1);
    else suits = Math.max(3, suits - 1);
  }

  /* 机制开关: 按 mechFrom 引入关号（跨章统一口径） */
  var gearOn = levelId >= ch.mechFrom.gear;
  var iceOn = levelId >= ch.mechFrom.ice;
  var chainOn = levelId >= ch.mechFrom.chain;
  var prismOn = levelId >= ch.mechFrom.prism;

  var rhythmKind = 'normal';
  var theme = null;
  var digit = levelId % 10;
  if (ch.rhythm) {
    /* 网格铁律优先: 挑战节奏仅在 8×8 挑战位生效（个位 4/9 且 wavePos=2——
     * L5/L8/…/L50 8×8 关即「难」，个位节奏与其错峰叠加时以波浪位为准） */
    if (ch.rhythm.challengeDigits.indexOf(digit) >= 0 && isChallenge) rhythmKind = 'challenge';
    else if (ch.rhythm.relaxDigits.indexOf(digit) >= 0 && levelId > ch.levels[0] && !isChallenge) rhythmKind = 'relax';
  }
  /* 8×8 波浪挑战关同步按 challenge 节奏对待（参数上探）——
   * 仅在波浪位置=挑战位时叠加；7×7 简单关位即使个位 4/9 也维持简单档
   * （网格铁律优先: L5/L8/…=8×8 难关、其余 7×7 简关与个位节奏错峰叠加） */
  if (isChallenge && rhythmKind === 'normal') rhythmKind = 'challenge';
  if (rhythmKind === 'challenge') {
    /* 挑战关: zMax 上探 + 机制密度高 + 冰厚上探（tiles 已由 waveTiles 抬升） */
    zMax = waveZMax(levelId);
    suits = Math.min(8, Math.max(suits, lerpRound(ch.suits[0], ch.suits[1], 1)));
  } else if (rhythmKind === 'relax') {
    /* 解压爽关: tiles 收至阶段下界（对齐 3）、theme 对称模板
     * z0 满铺铁律: tiles ≥ n*n - prisms → 保持波浪铁律棋盘、塔量收 */
    var loT = waveTilesRelaxFloor(levelId);
    tiles = loT;
    theme = ch.rhythm.themes[(Math.floor(levelId / 10)) % ch.rhythm.themes.length];
  }

  /* 棱镜格数（第 3 章起; prism 密度值 = 个数区间） */
  var prismCount = 0;
  if (prismOn) {
    prismCount = lerpRound(ch.mechDensity.prism[0], ch.mechDensity.prism[1], frac);
    if (rhythmKind === 'challenge') prismCount = ch.mechDensity.prism[1];
    if (rhythmKind === 'relax') prismCount = Math.max(0, ch.mechDensity.prism[0]);
  }

  return {
    id: levelId,
    chapter: ch.id,
    n: n,
    suits: suits,
    tiles: tiles,
    zMax: zMax,
    /* Δ19b/FR-045 §2: v2 层数矩阵（zMax = layerCount - 1） */
    v2Layers: v2LayerCount(levelId),
    v2MaskIds: v2MaskIds(levelId),
    gearOn: gearOn,
    iceOn: iceOn,
    chainOn: chainOn,
    prismOn: prismOn,
    prismCount: prismCount,
    gearDensity: ch.mechDensity.gear,
    iceDensity: ch.mechDensity.ice,
    chainDensity: ch.mechDensity.chain,
    iceMax: ch.iceMax || (rhythmKind === 'challenge' ? 3 : 2),
    rhythmKind: rhythmKind,
    theme: theme,
    cfg: {
      lives: ch.lives,
      damageOnBlock: ch.damageOnBlock,
      items: { undo: 1, magnet: 1, shuffle: 1 },
      iceMode: ch.iceMode,
      chains: [],
      /* Δ19b/FR-045 §1: 掩码模板 id 落库（运行时 MUST NOT 随机选取） */
      maskBase: v2MaskIds(levelId).base,
      maskUpper: v2MaskIds(levelId).upper,
      scoring: { comboBase: 10, comboStep: 5 }
    },
    budget: ch.budget
  };
}

/* 解压爽关 tiles 下界（阶段区间 lo 对齐 3; 保持满铺+适度塔量） */
function waveTilesRelaxFloor(levelId) {
  if (levelId <= 2) return 27;
  if (levelId === 3) return 54;
  var n = waveGrid(levelId);
  if (levelId <= 16) return n === 7 ? 54 : 69;
  if (levelId <= 36) return n === 7 ? 63 : 78;
  return n === 7 ? 72 : 87;
}

module.exports = {
  CHAPTERS: CHAPTERS,
  SCORE_WEIGHTS: SCORE_WEIGHTS,
  BUDGET: BUDGET,
  DISPERSION_TIERS: DISPERSION_TIERS,
  DISPERSION_STRUCTURAL_LIMITS: DISPERSION_STRUCTURAL_LIMITS,
  dispersionTierOf: dispersionTierOf,
  validateChapters: validateChapters,
  levelParams: levelParams,
  waveGrid: waveGrid,
  wavePos: wavePos,
  waveTiles: waveTiles,
  waveZMax: waveZMax,
  /* Δ19b/FR-045: v2 布局层数矩阵 + 掩码模板 id + 逐层落位 */
  v2LayerCount: v2LayerCount,
  v2MaskIds: v2MaskIds,
  v2ShapeLayers: v2ShapeLayers,
  loadShapeMasks: loadShapeMasks
};
