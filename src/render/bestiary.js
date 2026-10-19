/* =========================================================
 * Slide & Triple — Bestiary《万物出发！》45 种图鉴（Δ14 / T052a / T052c）
 * classic script；向 window.STM 挂载 STM.Bestiary（D-01）
 * 纯数据 + 纯函数：45 种生灵/载具图鉴定义 + 阶段花色映射表
 * BoardRenderer 消费；严禁写回 levels.js（FR-033 §3 / Δ13 保留铁律）
 *
 * 阶段区间（按 level.id 区间判定——严禁读 level.chapter，L21/L41/L42 错位）:
 *   阶段一 L1~21   → 陆地萌宠池 Suit 0~14（15 种）
 *   阶段二 L22~42  → 陆地+碧海合并池 Suit 0~29（30 种）
 *   阶段三 L43~60  → 全图鉴池 Suit 0~44（45 种）
 * 确定性抽样: seed = f(level.id, 阶段号) xorshift PRNG（禁 Math.random——D-08）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* =========================================================
   * 45 种图鉴定义表（FR-033 §1~§3 名称与清单严格照抄 spec）
   * id: Suit 编号 0~44 | name: 中文名 | theme: 专属柔和主题色
   * （底晕与粒子用；canvas: BoardRenderer 按 draw 函数键绘制）
   * ========================================================= */
  var BESTIARY = [
    /* ---- 阶段一【陆地萌宠篇】Suit 0~14 ---- */
    { id: 0,  name: '跳跳蛙',   theme: '#7CC24B', draw: 'frog' },
    { id: 1,  name: '小黄鸡',   theme: '#FFD93B', draw: 'chick' },
    { id: 2,  name: '小绵羊',   theme: '#F0EDE6', draw: 'sheep' },
    { id: 3,  name: '小奶牛',   theme: '#F7F3EC', draw: 'cow' },
    { id: 4,  name: '三花猫',   theme: '#F2A65A', draw: 'cat' },
    { id: 5,  name: '柴犬',     theme: '#F5B778', draw: 'shiba' },
    { id: 6,  name: '大熊猫',   theme: '#FFFFFF', draw: 'panda' },
    { id: 7,  name: '小狐狸',   theme: '#F98E48', draw: 'fox' },
    { id: 8,  name: '小白兔',   theme: '#FAFAFA', draw: 'rabbit' },
    { id: 9,  name: '小粉猪',   theme: '#F9AEC0', draw: 'pig' },
    { id: 10, name: '小仓鼠',   theme: '#F0C8A0', draw: 'hamster' },
    { id: 11, name: '小乌龟',   theme: '#8FBF6F', draw: 'turtle' },
    { id: 12, name: '小刺猬',   theme: '#C9A47E', draw: 'hedgehog' },
    { id: 13, name: '小松鼠',   theme: '#E89B55', draw: 'squirrel' },
    { id: 14, name: '小黄鸭',   theme: '#FFE066', draw: 'duck' },
    /* ---- 阶段二【碧海飞羽篇】Suit 15~29 ---- */
    { id: 15, name: '红锦鲤',   theme: '#F0625A', draw: 'koi' },
    { id: 16, name: '小丑鱼',   theme: '#FF8A3D', draw: 'clownfish' },
    { id: 17, name: '小海豚',   theme: '#7FB8E6', draw: 'dolphin' },
    { id: 18, name: '蓝鲸',     theme: '#5C8FD6', draw: 'whale' },
    { id: 19, name: '小章鱼',   theme: '#E07BB5', draw: 'octopus' },
    { id: 20, name: '小螃蟹',   theme: '#F2603C', draw: 'crab' },
    { id: 21, name: '水母',     theme: '#C9A7F5', draw: 'jellyfish' },
    { id: 22, name: '蓝闪蝶',   theme: '#5AA9E6', draw: 'butterfly' },
    { id: 23, name: '小蜜蜂',   theme: '#FFC93C', draw: 'bee' },
    { id: 24, name: '七星瓢虫', theme: '#F05030', draw: 'ladybug' },
    { id: 25, name: '知更鸟',   theme: '#F5978A', draw: 'robin' },
    { id: 26, name: '猫头鹰',   theme: '#D9B98A', draw: 'owl' },
    { id: 27, name: '火烈鸟',   theme: '#F87BA0', draw: 'flamingo' },
    { id: 28, name: '白天鹅',   theme: '#FDFDFD', draw: 'swan' },
    { id: 29, name: '和平鸽',   theme: '#EAEAF2', draw: 'dove' },
    /* ---- 阶段三【奇幻远航篇】Suit 30~44 ---- */
    { id: 30, name: '小火箭',   theme: '#E8E8F0', draw: 'rocket' },
    { id: 31, name: '飞碟',     theme: '#A8E6CF', draw: 'ufo' },
    { id: 32, name: '小飞机',   theme: '#DAEEF7', draw: 'plane' },
    { id: 33, name: '直升机',   theme: '#CFE3EE', draw: 'helicopter' },
    { id: 34, name: '热气球',   theme: '#F78FA7', draw: 'balloon' },
    { id: 35, name: '小帆船',   theme: '#FDFDFD', draw: 'sailboat' },
    { id: 36, name: '小火车',   theme: '#E85D5D', draw: 'train' },
    { id: 37, name: '甲壳虫车', theme: '#6FC3E0', draw: 'beetle' },
    { id: 38, name: '黄色巴士', theme: '#FFCB2E', draw: 'bus' },
    { id: 39, name: '小电驴',   theme: '#9BD35B', draw: 'scooter' },
    { id: 40, name: '滑板',     theme: '#F49E4C', draw: 'skateboard' },
    { id: 41, name: '风筝',     theme: '#F56A79', draw: 'kite' },
    { id: 42, name: '流星',     theme: '#FFE28A', draw: 'meteor' },
    { id: 43, name: '彗星',     theme: '#B8D8F5', draw: 'comet' },
    { id: 44, name: '土星环',   theme: '#E8CFA0', draw: 'saturn' }
  ];

  /* 阶段池定义（FR-033 §1~§3；区间按 level.id） */
  var STAGES = [
    { stage: 1, from: 1,  to: 21, poolMax: 15 }, /* 陆地萌宠 0~14 */
    { stage: 2, from: 22, to: 42, poolMax: 30 }, /* + 碧海飞羽 0~29 */
    { stage: 3, from: 43, to: 60, poolMax: 45 }  /* + 奇幻远航 0~44 */
  ];

  /* ---------- 确定性 PRNG（xorshift32——D-08 禁 Math.random） ---------- */
  function makeRng(seed) {
    var x = seed | 0;
    if (x === 0) x = 0x9E3779B9;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;  x >>>= 0;
      return (x >>> 0) / 4294967296; /* [0,1) */
    };
  }

  /* 阶段号（按 level.id 区间——非 chapter；阶段三兜底 id>42） */
  function stageOf(levelId) {
    if (levelId >= 1 && levelId <= 21) return 1;
    if (levelId >= 22 && levelId <= 42) return 2;
    return 3;
  }

  /* =========================================================
   * 阶段花色映射表（FR-033 §3 消解口径 / T052c 核心）
   * mapSuits(levelId, suits) → { suit: bestiaryId }
   * · 关卡实际花色数 K（3~8 不变）映射至该阶段池 K 个图案
   * · seed = f(level.id, 阶段号)（可复现——SC-007）
   * · 同关内 suit→图案唯一；不写回关卡数据（只读 levels.js）
   * ========================================================= */
  function mapSuits(levelId, suits) {
    var st = stageOf(levelId);
    var poolMax = STAGES[st - 1].poolMax;
    /* seed = level.id * 100003 + 阶段号 * 7919（互质混叠，同关恒定） */
    var rng = makeRng(levelId * 100003 + st * 7919 + 2621);
    var sorted = (suits || []).slice().sort(function (a, b) { return a - b; });
    var K = sorted.length;
    var out = {};
    if (K === 0) return out;
    /* 池内不放回抽样 K 个图案（Fisher-Yates 部分洗牌——确定性） */
    var pool = [];
    var i;
    for (i = 0; i < poolMax; i++) pool.push(i);
    var n = Math.min(K, poolMax);
    for (i = 0; i < n; i++) {
      var j = i + Math.floor(rng() * (poolMax - i));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    /* suit 升序 ↔ 抽样池前 K 个升序（同关内确定且唯一；视觉跨关渐进解锁） */
    var picked = pool.slice(0, n).sort(function (a, b) { return a - b; });
    for (i = 0; i < K && i < n; i++) out[sorted[i]] = picked[i];
    return out;
  }

  /* 会话级缓存（60 关映射结果——重复进关/Undo 重算零成本） */
  var cache = {};
  function mappingForLevel(level) {
    if (!level || typeof level.id !== 'number') return {};
    var hit = cache[level.id];
    if (hit) return hit;
    var suitSet = {};
    var tiles = level.tiles || [];
    for (var i = 0; i < tiles.length; i++) suitSet[tiles[i].s] = true;
    var suits = [];
    for (var k in suitSet) suits.push(parseInt(k, 10));
    var m = mapSuits(level.id, suits);
    cache[level.id] = m;
    return m;
  }

  /* 图鉴条目查询（BoardRenderer 绘制/Dock 图标消费） */
  function entry(bestiaryId) {
    return BESTIARY[bestiaryId] || BESTIARY[0];
  }

  /* 显式缓存失效（测试用——会话内恒定） */
  function clearCache() { cache = {}; }

  STM.Bestiary = {
    BESTIARY: BESTIARY,
    STAGES: STAGES,
    mapSuits: mapSuits,
    mappingForLevel: mappingForLevel,
    stageOf: stageOf,
    makeRng: makeRng,
    entry: entry,
    clearCache: clearCache
  };

})(typeof window !== 'undefined' ? window : globalThis);
