/* =========================================================
 * Slide & Triple — 章节参数矩阵（level-config.js，Δ5）
 * Node 离线工具配置（CommonJS）：前端永不引用（level-pipeline.md §4）
 * 追加 CHAPTERS 条目即新增章节（Δ5 扩容）
 *
 * M3 参数口径（用户指令对齐——底层 z=0 满铺 + 多层动态叠塔最高 5 层）:
 *   第 1 章 L1-10   grid 5×5        tiles 27~36  suits 3~4   zMax 2~3  gear L6+
 *   第 2 章 L11-20  grid 5×5→6×6    tiles 30~45  suits 4~5   zMax 3    ice
 *   第 3 章 L21-30  grid 6×6        tiles 42~54  suits 5~6   zMax 4    chain + damageOnBlock
 *   第 4 章 L31-40  grid 6×6→7×7    tiles 45~57  suits 6~7   zMax 4    prism + ice/gear 混排
 *   第 5 章 L41-50  grid 7×7→8×8    tiles 54~81  suits 7~8   zMax 5    金字塔塔尖 + rhythm
 * （tiles 恒为 3 的倍数；z=0 底层除棱镜格 100% 满铺——恒 n×n）
 * ========================================================= */
'use strict';

var CHAPTERS = [
  {
    id: 1,
    levels: [1, 10],
    grid: [5, 5],
    suits: [3, 4],
    tiles: [27, 36],          /* 底 25 + 叠 2~11 */
    zMax: [2, 3],             /* 总高 2~3 层（章节内插值） */
    mechanisms: { gear: false, ice: false, chain: false, prism: false },
    mechFrom: { gear: 6, ice: 11, chain: 21, prism: 31 },  /* 引入关号（跨章引用） */
    mechDensity: { gear: [0.10, 0.18], ice: [0, 0], chain: [0, 0], prism: [0, 0] },
    damageOnBlock: false,
    lives: 3,
    items: { undo: 1, wrench: 1, stage: 1 },
    iceMode: 'triple',
    rhythm: null,
    budget: { nodes: 2000000, ms: 60000 }
  },
  {
    id: 2,
    levels: [11, 20],
    grid: [5, 6],
    suits: [4, 5],
    tiles: [30, 45],          /* 5×5 底 25 + 叠 5 … 6×6 底 36 + 叠 9 */
    zMax: [3, 3],
    mechanisms: { gear: true, ice: true, chain: false, prism: false },
    mechFrom: { gear: 6, ice: 11, chain: 21, prism: 31 },
    mechDensity: { gear: [0.08, 0.14], ice: [0.10, 0.20], chain: [0, 0], prism: [0, 0] },
    damageOnBlock: false,
    lives: 3,
    items: { undo: 1, wrench: 1, stage: 1 },
    iceMode: 'triple',
    rhythm: null,
    budget: { nodes: 2000000, ms: 60000 }
  },
  {
    id: 3,
    levels: [21, 30],
    grid: [6, 6],
    suits: [5, 6],
    tiles: [42, 54],          /* 底 36 + 叠 6~18 */
    zMax: [4, 4],
    mechanisms: { gear: true, ice: true, chain: true, prism: false },
    mechFrom: { gear: 6, ice: 11, chain: 21, prism: 31 },
    mechDensity: { gear: [0.08, 0.12], ice: [0.08, 0.16], chain: [0.10, 0.20], prism: [0, 0] },
    damageOnBlock: true,      /* FR-003 第 3 章起受阻扣命 */
    lives: 3,
    items: { undo: 1, wrench: 1, stage: 1 },
    iceMode: 'triple',
    rhythm: null,
    budget: { nodes: 2000000, ms: 60000 }
  },
  {
    id: 4,
    levels: [31, 40],
    grid: [6, 7],
    suits: [6, 7],
    tiles: [45, 57],          /* 6×6 底 35（1 棱镜格）+ 叠 10 … 7×7 底 46~48 + 叠 9~11 */
    zMax: [4, 4],
    mechanisms: { gear: true, ice: true, chain: true, prism: true },
    mechFrom: { gear: 6, ice: 11, chain: 21, prism: 31 },
    mechDensity: { gear: [0.08, 0.12], ice: [0.08, 0.14], chain: [0.08, 0.14], prism: [2, 4] },
    damageOnBlock: true,
    lives: 3,
    items: { undo: 1, wrench: 1, stage: 1 },
    iceMode: 'triple',
    rhythm: null,
    budget: { nodes: 2000000, ms: 60000 }
  },
  {
    id: 5,
    levels: [41, 50],
    grid: [7, 8],
    suits: [7, 8],
    tiles: [54, 81],          /* 7×7 底 47~49 + 塔尖 … 8×8 底 64 + 塔尖 */
    zMax: [5, 5],             /* 全章最高 5 层立体金字塔塔尖堆叠 */
    mechanisms: { gear: true, ice: true, chain: true, prism: true },
    mechFrom: { gear: 6, ice: 11, chain: 21, prism: 31 },
    mechDensity: { gear: [0.08, 0.12], ice: [0.08, 0.14], chain: [0.08, 0.14], prism: [1, 3] },
    damageOnBlock: true,
    lives: 3,
    items: { undo: 1, wrench: 1, stage: 1 },
    iceMode: 'triple',
    /* FR-012 节奏模板: 个位 4/9 挑战关 / 5/0 解压爽关（对称图案） */
    rhythm: {
      challengeDigits: [4, 9],   /* 卡点挑战: 参数上界 + 机制密度高 + 冰厚上探 */
      relaxDigits: [5, 0],       /* 解压爽关: 对称 theme + tiles 下界 + dockPeak 目标 ≤3 */
      themes: ['ring', 'butterfly', 'diamond', 'heart']
    },
    budget: { nodes: 2000000, ms: 60000 }
  }
];

/* 难度评分权重（FR-011/SC-004；norm = 50 关全域 min-max 归一）
 * mechCount 为唯一未归一项（原始 0~4）——1.0 时其在第 5 章（全关 mech=4）
 * 的常量抬升不再压缩 spike/valley 相对振幅，锯齿门（1.10/0.90）按设计区分度成立 */
var SCORE_WEIGHTS = {
  minMoves: 1.1,
  solutionCount: 0.8,
  dockPeak: 1.2,
  mechCount: 1.0,
  tiles: 0.5,
  suits: 0.7
};

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

/* ---------- 章内关级参数插值（D-08 确定性——无随机） ---------- */
function lerp(a, b, f) { return a + (b - a) * f; }
function lerpRound(a, b, f) { return Math.round(lerp(a, b, f)); }
/* tiles 取 3 的倍数（区间对齐） */
function tilesLerp(lo, hi, f) {
  var v = lerpRound(lo, hi, f);
  return Math.round(v / 3) * 3;
}

/* 关参数解析（章内插值 + rhythm 覆盖）。返回:
 * {id, chapter, n, suits, tiles, zMax, mechDensity, gearOn, iceOn, chainOn, prismOn, prismCount, rhythmKind, theme, cfg} */
function levelParams(levelId) {
  var ch = null;
  for (var i = 0; i < CHAPTERS.length; i++) {
    if (levelId >= CHAPTERS[i].levels[0] && levelId <= CHAPTERS[i].levels[1]) { ch = CHAPTERS[i]; break; }
  }
  if (!ch) throw new Error('levelId ' + levelId + ' 不在任何章节区间');
  var idx = levelId - ch.levels[0];
  var frac = ch.levels[1] > ch.levels[0] ? idx / (ch.levels[1] - ch.levels[0]) : 0;

  var n = lerpRound(ch.grid[0], ch.grid[1], frac);
  var suits = lerpRound(ch.suits[0], ch.suits[1], frac);
  var tiles = tilesLerp(ch.tiles[0], ch.tiles[1], frac);
  var zMax = lerpRound(ch.zMax[0], ch.zMax[1], frac);
  if (zMax < 2) zMax = 2;

  /* 机制开关: 按 mechFrom 引入关号（跨章统一口径） */
  var gearOn = levelId >= ch.mechFrom.gear;
  var iceOn = levelId >= ch.mechFrom.ice;
  var chainOn = levelId >= ch.mechFrom.chain;
  var prismOn = levelId >= ch.mechFrom.prism;

  var rhythmKind = 'normal';
  var theme = null;
  var digit = levelId % 10;
  if (ch.rhythm) {
    if (ch.rhythm.challengeDigits.indexOf(digit) >= 0) rhythmKind = 'challenge';
    else if (ch.rhythm.relaxDigits.indexOf(digit) >= 0 && levelId > ch.levels[0]) rhythmKind = 'relax';
  }
  if (rhythmKind === 'challenge') {
    /* 挑战关: 参数取区间上界、zMax 上探 */
    tiles = Math.max(tiles, ch.tiles[1] - (ch.tiles[1] % 3));
    zMax = ch.zMax[1];
    suits = ch.suits[1];
  } else if (rhythmKind === 'relax') {
    /* 解压爽关: tiles 取下界（对齐 3）、theme 对称模板
     * n 收缩至底格 ≤ tiles（z0 满铺铁律: tiles ≥ n*n - prisms）——最小可容格 */
    tiles = Math.round(ch.tiles[0] / 3) * 3;
    var prism0 = ch.mechFrom && levelId >= ch.mechFrom.prism ? 1 : 0;
    var nMin = ch.grid[0];
    for (var nc = nMin; nc <= ch.grid[1]; nc++) {
      if (nc * nc - prism0 <= tiles) n = nc; else break;
    }
    n = Math.max(nMin, n);
    theme = ch.rhythm.themes[(Math.floor(levelId / 10)) % ch.rhythm.themes.length];
  }

  /* 棱镜格数（第 4 章起; prism 密度值 = 个数区间） */
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
      items: { undo: 1, wrench: 1, stage: 1 },
      iceMode: ch.iceMode,
      chains: [],
      scoring: { comboBase: 10, comboStep: 5 }
    },
    budget: ch.budget
  };
}

module.exports = {
  CHAPTERS: CHAPTERS,
  SCORE_WEIGHTS: SCORE_WEIGHTS,
  BUDGET: BUDGET,
  validateChapters: validateChapters,
  levelParams: levelParams
};
