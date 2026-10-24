/* =========================================================
 * Slide & Triple — Bestiary《万物出发！》45 种图鉴（Δ14 / T052a / T052c）
 * classic script；向 window.STM 挂载 STM.Bestiary（D-01）
 * 纯数据 + 纯函数：45 种生灵/载具图鉴定义 + 阶段花色映射表
 * BoardRenderer 消费；严禁写回 levels.js（FR-033 §3 / Δ13 保留铁律）
 *
 * 阶段区间（按 level.id 区间判定——严禁读 level.chapter，L21/L41/L42 错位）:
 *   阶段一 L1~21   → 陆地萌宠池 Suit 0~14（15 种）
 *   阶段二 L25~48  → 陆地+碧海合并池 Suit 0~29（30 种）
 *   阶段三 L49~72  → 全图鉴池 Suit 0~44（45 种）
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

  /* 阶段池定义（FR-033 §1~§3；区间按 level.id；Δ16a 重划为 3×24） */
  /* Δ21: 扩容至 90 种——复用前 45 种绘制/Emoji 作为占位（sheet{4..6} 贴图优先） */
  (function extendBestiary90() {
    var baseLen = BESTIARY.length;
    while (BESTIARY.length < 90) {
      var b = BESTIARY[BESTIARY.length % baseLen];
      BESTIARY.push({ id: BESTIARY.length, name: b.name, theme: b.theme, draw: b.draw });
    }
  })();

  var STAGES = [
    { stage: 1, from: 1,  to: 12, poolMax: 15 },
    { stage: 2, from: 13, to: 24, poolMax: 30 },
    { stage: 3, from: 25, to: 36, poolMax: 45 },
    { stage: 4, from: 37, to: 48, poolMax: 60 },
    { stage: 5, from: 49, to: 60, poolMax: 75 },
    { stage: 6, from: 61, to: 72, poolMax: 90 }
  ];

  /* =========================================================
   * Δ15b/T052i: 45 条目 → Emoji 码点常量表（贴图缺失兜底渲染源）
   * spec FR-033 §6: ctx.fillText + 系统 Emoji 字体栈直渲染；
   * 严禁 ctx.arc 手绘圆球加黑点（宪章 III v2.0.0 红线）
   * ========================================================= */
  var EMOJI = [
    /* 阶段一【陆地萌宠篇】Suit 0~14 */
    '🐸', /* 0  跳跳蛙   🐸 */
    '🐥', /* 1  小黄鸡   🐤 */
    '🐑', /* 2  小绵羊   🐑 */
    '🐮', /* 3  小奶牛   🐮 */
    '😸', /* 4  三花猫   🐸→🐱 */
    '🐕', /* 5  柴犬     🐕 */
    '🐼', /* 6  大熊猫   🐼 */
    '🦊', /* 7  小狐狸   🦊 */
    '🐰', /* 8  小白兔   🐰 */
    '🐷', /* 9  小粉猪   🐷 */
    '🐹', /* 10 小仓鼠   🐹 */
    '🐢', /* 11 小乌龟   🐢 */
    '🦔', /* 12 小刺猬   🦔 */
    '🐯', /* 13 小松鼠   🐿 */
    '🦆', /* 14 小黄鸭   🦆 */
    /* 阶段二【碧海飞羽篇】Suit 15~29 */
    '🐟', /* 15 红锦鲤   🐟 */
    '🐠', /* 16 小丑鱼   🐠 */
    '🐬', /* 17 小海豚   🐬 */
    '🐳', /* 18 蓝鲸     🐳 */
    '🐙', /* 19 小章鱼   🐙 */
    '🦀', /* 20 小螃蟹   🦀 */
    '🧊', /* 21 水母     🪼（🫧 同创） */
    '🦋', /* 22 蓝闪蝶   🦋 */
    '🐝', /* 23 小蜜蜂   🐝 */
    '🪌', /* 24 七星瓢虫 🐞 */
    '🐦', /* 25 知更鸟   🐦 */
    '🦉', /* 26 猫头鹰   🦉 */
    '🦤', /* 27 火烈鸟   🦩 */
    '🦢', /* 28 白天鹅   🦢 */
    '🕊', /* 29 和平鸽   🕊 */
    /* 阶段三【奇幻远航篇】Suit 30~44 */
    '🚀', /* 30 小火箭   🚀 */
    '🛸', /* 31 飞碟     🛸 */
    '🛩', /* 32 小飞机   🛩 */
    '🚁', /* 33 直升机   🚁 */
    '🎲', /* 34 热气球   🎈（🫧 备选） */
    '⛵',       /* 35 小帆船   ⛵ */
    '🚂', /* 36 小火车   🚂 */
    '🚗', /* 37 甲壳虫车 🚗 */
    '🚌', /* 38 黄色巴士 🚌 */
    '🛵', /* 39 小电驴   🛵 */
    '🛹', /* 40 滑板     🛹 */
    '🪃', /* 41 风筝     🪁 */
    '🌠', /* 42 流星     🌠（☄ 备选） */
    '☄',       /* 43 彗星     ☄ */
    '🎐'  /* 44 土星环   🪐 */
  ];

  /* ---------- 确定性 PRNG（xorshift32——D-08 禁 Math.random） ---------- */
  while (EMOJI.length < 90) EMOJI.push(EMOJI[EMOJI.length % 45]);

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

  /* 阶段号（按 level.id 区间——非 chapter；Δ16a 重划 3×24，阶段三兜底 id>48） */
  function stageOf(levelId) {
    if (levelId <= 12) return 1;
    if (levelId <= 24) return 2;
    if (levelId <= 36) return 3;
    if (levelId <= 48) return 4;
    if (levelId <= 60) return 5;
    return 6;
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

  /* =========================================================
   * 45 种图鉴绘制函数（T052a——每图案独立 Canvas 2D 绘制）
   * 语汇: 贝塞尔/径向渐变/高光点；纯代码零图片（宪章 III）
   * 签名 draw(ctx, x, y, R): (x,y) 中心，R 主题半径（≈格宽 0.30）
   * 图形细节饱满但每函数精炼（治愈系圆润轮廓 + 高光点）
   * ========================================================= */
  function rg2(ctx, x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function hl(ctx, x, y, rx, ry, a) { /* 通用高光点 */
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, a || -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  function eye(ctx, x, y, r) { /* 通用黑点眼 */
    ctx.fillStyle = '#2A2A33';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x + r * 0.3, y - r * 0.3, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  function bodyEllipse(ctx, x, y, rx, ry, cLight, cMain, cDeep) { /* 通用渐变身体 */
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = rg2(ctx, x - rx * 0.35, y - ry * 0.4, rx * 0.1, rx * 1.15,
      [0, cLight, 0.55, cMain, 1, cDeep]);
    ctx.fill();
  }

  /* ---------- 阶段一: 陆地萌宠 0~14 ---------- */
  var DRAW = {
    frog: function (ctx, x, y, R) { /* 跳跳蛙: 圆身 + 双凸眼 + 微笑 */
      bodyEllipse(ctx, x, y + R * 0.08, R * 0.62, R * 0.52, '#A8E063', '#7CC24B', '#59922F');
      ctx.fillStyle = '#8FD14F';
      ctx.beginPath(); ctx.arc(x - R * 0.42, y - R * 0.42, R * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + R * 0.42, y - R * 0.42, R * 0.22, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.42, y - R * 0.44, R * 0.09);
      eye(ctx, x + R * 0.42, y - R * 0.44, R * 0.09);
      ctx.strokeStyle = '#3E6B1F'; ctx.lineWidth = Math.max(1, R * 0.05); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y + R * 0.1, R * 0.24, 0.35, Math.PI - 0.35); ctx.stroke();
      ctx.fillStyle = '#F2F7DC';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.02, R * 0.26, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      hl(ctx, x - R * 0.24, y - R * 0.16, R * 0.14, R * 0.08);
    },
    chick: function (ctx, x, y, R) { /* 小黄鸡: 圆绒身 + 三角喙 + 呆毛 */
      bodyEllipse(ctx, x, y + R * 0.05, R * 0.55, R * 0.5, '#FFE873', '#FFD93B', '#E8B41F');
      eye(ctx, x - R * 0.2, y - R * 0.06, R * 0.075);
      eye(ctx, x + R * 0.2, y - R * 0.06, R * 0.075);
      ctx.fillStyle = '#F59F2A';
      ctx.beginPath();
      ctx.moveTo(x - R * 0.09, y + R * 0.12); ctx.lineTo(x + R * 0.09, y + R * 0.12); ctx.lineTo(x, y + R * 0.26);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#F59F2A'; ctx.lineWidth = Math.max(1, R * 0.05); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y - R * 0.44); ctx.quadraticCurveTo(x + R * 0.1, y - R * 0.62, x + R * 0.02, y - R * 0.68);
      ctx.stroke();
      hl(ctx, x - R * 0.2, y - R * 0.2, R * 0.13, R * 0.07);
    },
    sheep: function (ctx, x, y, R) { /* 小绵羊: 云朵绒身 + 灰脸垂耳 */
      ctx.fillStyle = '#F0EDE6';
      var puffs = [[-0.34, -0.2], [0.34, -0.2], [-0.4, 0.12], [0.4, 0.12], [0, -0.32], [-0.2, 0.32], [0.2, 0.32]];
      for (var i = 0; i < puffs.length; i++) {
        ctx.beginPath();
        ctx.arc(x + R * puffs[i][0], y + R * puffs[i][1], R * 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rg2(ctx, x - R * 0.1, y - R * 0.1, R * 0.03, R * 0.4,
        [0, '#CFC4B4', 0.6, '#A69A88', 1, '#877B6A']);
      ctx.beginPath(); ctx.ellipse(x, y, R * 0.3, R * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#877B6A';
      ctx.beginPath(); ctx.ellipse(x - R * 0.3, y + R * 0.08, R * 0.09, R * 0.16, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.3, y + R * 0.08, R * 0.09, R * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.11, y - R * 0.02, R * 0.055);
      eye(ctx, x + R * 0.11, y - R * 0.02, R * 0.055);
    },
    cow: function (ctx, x, y, R) { /* 小奶牛: 白身黑斑 + 粉鼻 */
      bodyEllipse(ctx, x, y, R * 0.58, R * 0.5, '#FFFFFF', '#F7F3EC', '#D8D0C0');
      ctx.fillStyle = '#3A3630';
      ctx.beginPath(); ctx.ellipse(x - R * 0.3, y - R * 0.24, R * 0.18, R * 0.13, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.34, y + R * 0.2, R * 0.15, R * 0.11, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F4B8C0';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.26, R * 0.2, R * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#B06B75';
      ctx.beginPath(); ctx.arc(x - R * 0.07, y + R * 0.26, R * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + R * 0.07, y + R * 0.26, R * 0.03, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.22, y - R * 0.1, R * 0.07);
      eye(ctx, x + R * 0.22, y - R * 0.1, R * 0.07);
      hl(ctx, x - R * 0.26, y - R * 0.24, R * 0.14, R * 0.07);
    },
    cat: function (ctx, x, y, R) { /* 三花猫: 圆脸 + 三角耳 + 三花斑 */
      bodyEllipse(ctx, x, y + R * 0.05, R * 0.55, R * 0.48, '#F7C48A', '#F2A65A', '#D2833B');
      ctx.fillStyle = '#F2A65A';
      ctx.beginPath(); ctx.moveTo(x - R * 0.42, y - R * 0.3); ctx.lineTo(x - R * 0.52, y - R * 0.62); ctx.lineTo(x - R * 0.18, y - R * 0.48); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + R * 0.42, y - R * 0.3); ctx.lineTo(x + R * 0.52, y - R * 0.62); ctx.lineTo(x + R * 0.18, y - R * 0.48); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5A4632';
      ctx.beginPath(); ctx.ellipse(x + R * 0.05, y - R * 0.42, R * 0.16, R * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(x - R * 0.28, y + R * 0.18, R * 0.13, R * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.2, y - R * 0.06, R * 0.07);
      eye(ctx, x + R * 0.2, y - R * 0.06, R * 0.07);
      ctx.strokeStyle = '#8A5A2A'; ctx.lineWidth = Math.max(1, R * 0.045); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - R * 0.1, y + R * 0.16); ctx.quadraticCurveTo(x, y + R * 0.24, x + R * 0.1, y + R * 0.16); ctx.stroke();
    },
    shiba: function (ctx, x, y, R) { /* 柴犬: 橘头 + 奶油面 + 卷尾 */
      bodyEllipse(ctx, x, y + R * 0.08, R * 0.56, R * 0.46, '#F9CB96', '#F5B778', '#D69552');
      ctx.fillStyle = '#FBF3E4';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.18, R * 0.3, R * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F5B778';
      ctx.beginPath(); ctx.moveTo(x - R * 0.36, y - R * 0.34); ctx.lineTo(x - R * 0.46, y - R * 0.6); ctx.lineTo(x - R * 0.16, y - R * 0.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + R * 0.36, y - R * 0.34); ctx.lineTo(x + R * 0.46, y - R * 0.6); ctx.lineTo(x + R * 0.16, y - R * 0.5); ctx.closePath(); ctx.fill();
      eye(ctx, x - R * 0.2, y - R * 0.08, R * 0.065);
      eye(ctx, x + R * 0.2, y - R * 0.08, R * 0.065);
      ctx.fillStyle = '#4A3427';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.06, R * 0.07, R * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#D69552'; ctx.lineWidth = Math.max(1.2, R * 0.09); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x + R * 0.5, y - R * 0.3, R * 0.16, -Math.PI * 0.5, Math.PI * 0.85); ctx.stroke();
    },
    panda: function (ctx, x, y, R) { /* 大熊猫: 白圆脸 + 黑耳眼 + 竹叶 */
      bodyEllipse(ctx, x, y + R * 0.05, R * 0.56, R * 0.5, '#FFFFFF', '#F5F5F2', '#D5D5CC');
      ctx.fillStyle = '#2E2E34';
      ctx.beginPath(); ctx.arc(x - R * 0.42, y - R * 0.4, R * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + R * 0.42, y - R * 0.4, R * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x - R * 0.24, y - R * 0.06, R * 0.13, R * 0.16, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.24, y - R * 0.06, R * 0.13, R * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.24, y - R * 0.06, R * 0.05);
      eye(ctx, x + R * 0.24, y - R * 0.06, R * 0.05);
      ctx.fillStyle = '#2E2E34';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.22, R * 0.09, R * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4E9B4F'; ctx.lineWidth = Math.max(1, R * 0.05); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + R * 0.2, y + R * 0.42); ctx.quadraticCurveTo(x + R * 0.42, y + R * 0.5, x + R * 0.5, y + R * 0.3); ctx.stroke();
    },
    fox: function (ctx, x, y, R) { /* 小狐狸: 橙尖脸 + 白面颊 + 大耳 */
      ctx.fillStyle = '#E07B34';
      ctx.beginPath(); ctx.moveTo(x - R * 0.4, y - R * 0.28); ctx.lineTo(x - R * 0.54, y - R * 0.66); ctx.lineTo(x - R * 0.12, y - R * 0.44); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + R * 0.4, y - R * 0.28); ctx.lineTo(x + R * 0.54, y - R * 0.66); ctx.lineTo(x + R * 0.12, y - R * 0.44); ctx.closePath(); ctx.fill();
      bodyEllipse(ctx, x, y + R * 0.06, R * 0.56, R * 0.44, '#FCB27A', '#F98E48', '#D66E2A');
      ctx.fillStyle = '#FFF5E8';
      ctx.beginPath(); ctx.moveTo(x, y - R * 0.3); ctx.quadraticCurveTo(x - R * 0.34, y + R * 0.1, x, y + R * 0.4);
      ctx.quadraticCurveTo(x + R * 0.34, y + R * 0.1, x, y - R * 0.3); ctx.closePath(); ctx.fill();
      eye(ctx, x - R * 0.18, y - R * 0.06, R * 0.06);
      eye(ctx, x + R * 0.18, y - R * 0.06, R * 0.06);
      ctx.fillStyle = '#3A2413';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.24, R * 0.06, R * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    },
    rabbit: function (ctx, x, y, R) { /* 小白兔: 长耳 + 粉内耳 + 圆脸 */
      ctx.fillStyle = '#FAFAFA';
      ctx.beginPath(); ctx.ellipse(x - R * 0.22, y - R * 0.55, R * 0.12, R * 0.34, 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.22, y - R * 0.55, R * 0.12, R * 0.34, -0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F4B8C0';
      ctx.beginPath(); ctx.ellipse(x - R * 0.22, y - R * 0.52, R * 0.06, R * 0.24, 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.22, y - R * 0.52, R * 0.06, R * 0.24, -0.12, 0, Math.PI * 2); ctx.fill();
      bodyEllipse(ctx, x, y + R * 0.08, R * 0.5, R * 0.44, '#FFFFFF', '#F6F4EE', '#D8D5CC');
      eye(ctx, x - R * 0.18, y, R * 0.055);
      eye(ctx, x + R * 0.18, y, R * 0.055);
      ctx.fillStyle = '#F09AA4';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.14, R * 0.05, R * 0.035, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFC53D';
      ctx.beginPath(); ctx.arc(x - R * 0.32, y + R * 0.4, R * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + R * 0.32, y + R * 0.4, R * 0.04, 0, Math.PI * 2); ctx.fill();
    },
    pig: function (ctx, x, y, R) { /* 小粉猪: 圆身 + 大鼻孔 + 卷耳 */
      bodyEllipse(ctx, x, y + R * 0.06, R * 0.55, R * 0.48, '#FCCBD8', '#F9AEC0', '#E28AA0');
      ctx.fillStyle = '#E28AA0';
      ctx.beginPath(); ctx.ellipse(x - R * 0.42, y - R * 0.26, R * 0.11, R * 0.15, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.42, y - R * 0.26, R * 0.11, R * 0.15, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F6A2B5';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.1, R * 0.22, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#C46E82';
      ctx.beginPath(); ctx.arc(x - R * 0.08, y + R * 0.1, R * 0.035, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + R * 0.08, y + R * 0.1, R * 0.035, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.24, y - R * 0.1, R * 0.06);
      eye(ctx, x + R * 0.24, y - R * 0.1, R * 0.06);
      hl(ctx, x - R * 0.22, y - R * 0.28, R * 0.14, R * 0.07);
    },
    hamster: function (ctx, x, y, R) { /* 小仓鼠: 鼓腮圆 + 小耳 + 嗑瓜子 */
      bodyEllipse(ctx, x, y + R * 0.05, R * 0.56, R * 0.48, '#F7DDC0', '#F0C8A0', '#D3A676');
      ctx.fillStyle = '#E0B48A';
      ctx.beginPath(); ctx.arc(x - R * 0.4, y - R * 0.38, R * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + R * 0.4, y - R * 0.38, R * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F7DDC0';
      ctx.beginPath(); ctx.ellipse(x - R * 0.34, y + R * 0.14, R * 0.14, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.34, y + R * 0.14, R * 0.14, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.16, y - R * 0.1, R * 0.055);
      eye(ctx, x + R * 0.16, y - R * 0.1, R * 0.055);
      ctx.fillStyle = '#C48A5A';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.1, R * 0.06, R * 0.045, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8A6B45';
      ctx.beginPath(); ctx.ellipse(x - R * 0.02, y + R * 0.4, R * 0.09, R * 0.06, 0.4, 0, Math.PI * 2); ctx.fill();
    },
    turtle: function (ctx, x, y, R) { /* 小乌龟: 六边纹壳 + 探头 + 四鳍 */
      ctx.fillStyle = '#A8C97F';
      ctx.beginPath(); ctx.ellipse(x - R * 0.44, y + R * 0.3, R * 0.12, R * 0.08, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.44, y + R * 0.3, R * 0.12, R * 0.08, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rg2(ctx, x - R * 0.1, y - R * 0.2, R * 0.05, R * 0.6, [0, '#9FBE72', 0.6, '#8FBF6F', 1, '#6E9448']);
      ctx.beginPath(); ctx.arc(x, y + R * 0.08, R * 0.5, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6E9448'; ctx.lineWidth = Math.max(1, R * 0.045);
      ctx.beginPath();
      ctx.moveTo(x - R * 0.28, y + R * 0.02); ctx.lineTo(x + R * 0.28, y + R * 0.02);
      ctx.moveTo(x - R * 0.16, y - R * 0.24); ctx.lineTo(x + R * 0.16, y - R * 0.24);
      ctx.moveTo(x, y - R * 0.28); ctx.lineTo(x, y + R * 0.32);
      ctx.stroke();
      ctx.fillStyle = '#A8C97F';
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.38, R * 0.2, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.07, y - R * 0.42, R * 0.04);
      eye(ctx, x + R * 0.07, y - R * 0.42, R * 0.04);
    },
    hedgehog: function (ctx, x, y, R) { /* 小刺猬: 背刺放射 + 浅脸 + 黑鼻 */
      ctx.fillStyle = '#7A5C3A';
      for (var i = 0; i < 9; i++) {
        var a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
        var sx = x + Math.cos(a) * R * 0.34, sy = y + Math.sin(a) * R * 0.34;
        var tx = x + Math.cos(a) * R * 0.68, ty = y + Math.sin(a) * R * 0.68;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a + 1.57) * R * 0.08, sy + Math.sin(a + 1.57) * R * 0.08);
        ctx.lineTo(tx, ty);
        ctx.lineTo(sx - Math.cos(a + 1.57) * R * 0.08, sy - Math.sin(a + 1.57) * R * 0.08);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = rg2(ctx, x, y + R * 0.2, R * 0.04, R * 0.55, [0, '#E8CFAE', 0.6, '#C9A47E', 1, '#A07B54']);
      ctx.beginPath();
      ctx.moveTo(x - R * 0.3, y - R * 0.18);
      ctx.quadraticCurveTo(x - R * 0.2, y + R * 0.42, x + R * 0.3, y + R * 0.3);
      ctx.quadraticCurveTo(x + R * 0.5, y + R * 0.05, x + R * 0.3, y - R * 0.18);
      ctx.closePath(); ctx.fill();
      eye(ctx, x + R * 0.14, y + R * 0.02, R * 0.05);
      ctx.fillStyle = '#2A2A33';
      ctx.beginPath(); ctx.arc(x + R * 0.36, y + R * 0.2, R * 0.055, 0, Math.PI * 2); ctx.fill();
    },
    squirrel: function (ctx, x, y, R) { /* 小松鼠: 大尾弧 + 竖耳 + 捧果 */
      ctx.fillStyle = '#C9803E';
      ctx.beginPath();
      ctx.moveTo(x - R * 0.1, y + R * 0.3);
      ctx.quadraticCurveTo(x - R * 0.75, y + R * 0.35, x - R * 0.55, y - R * 0.4);
      ctx.quadraticCurveTo(x - R * 0.35, y - R * 0.05, x - R * 0.1, y + R * 0.05);
      ctx.closePath(); ctx.fill();
      bodyEllipse(ctx, x + R * 0.1, y + R * 0.08, R * 0.42, R * 0.44, '#F0AC66', '#E89B55', '#C9803E');
      ctx.fillStyle = '#C9803E';
      ctx.beginPath(); ctx.ellipse(x - R * 0.02, y - R * 0.36, R * 0.1, R * 0.16, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + R * 0.26, y - R * 0.36, R * 0.1, R * 0.16, -0.3, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x + R * 0.06, y - R * 0.08, R * 0.055);
      eye(ctx, x + R * 0.32, y - R * 0.08, R * 0.055);
      ctx.fillStyle = '#8A5B2A';
      ctx.beginPath(); ctx.ellipse(x + R * 0.19, y + R * 0.46, R * 0.11, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    },
    duck: function (ctx, x, y, R) { /* 小黄鸭: 圆头扁喙 + 头顶呆毛 */
      bodyEllipse(ctx, x, y + R * 0.12, R * 0.55, R * 0.42, '#FFE87A', '#FFE066', '#E8C22E');
      bodyEllipse(ctx, x, y - R * 0.22, R * 0.4, R * 0.34, '#FFF0A0', '#FFE87A', '#E8C22E');
      ctx.fillStyle = '#F59F2A';
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.06, R * 0.22, R * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E08521';
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.02, R * 0.2, R * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      eye(ctx, x - R * 0.17, y - R * 0.3, R * 0.06);
      eye(ctx, x + R * 0.17, y - R * 0.3, R * 0.06);
      ctx.strokeStyle = '#F59F2A'; ctx.lineWidth = Math.max(1, R * 0.05); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - R * 0.04, y - R * 0.52); ctx.quadraticCurveTo(x + R * 0.02, y - R * 0.68, x - R * 0.1, y - R * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#FF7EAB';
      ctx.beginPath(); ctx.arc(x - R * 0.4, y - R * 0.14, R * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + R * 0.4, y - R * 0.14, R * 0.05, 0, Math.PI * 2); ctx.fill();
    }
  };

  /* ---------- 阶段二: 碧海飞羽 15~29 ---------- */
  DRAW.koi = function (ctx, x, y, R) { /* 红锦鲤: 纺锤身 + 摆尾 + 白斑 */
    ctx.fillStyle = '#F5E6D0';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.3, y);
    ctx.quadraticCurveTo(x + R * 0.7, y - R * 0.35, x + R * 0.68, y - R * 0.05);
    ctx.quadraticCurveTo(x + R * 0.85, y, x + R * 0.68, y + R * 0.05);
    ctx.quadraticCurveTo(x + R * 0.7, y + R * 0.35, x + R * 0.3, y);
    ctx.closePath(); ctx.fill();
    bodyEllipse(ctx, x - R * 0.08, y, R * 0.45, R * 0.28, '#F98A7E', '#F0625A', '#D0433C');
    ctx.fillStyle = '#FDF6EC';
    ctx.beginPath(); ctx.ellipse(x - R * 0.18, y - R * 0.08, R * 0.14, R * 0.09, 0.3, 0, Math.PI * 2); ctx.fill();
    eye(ctx, x - R * 0.38, y - R * 0.08, R * 0.05);
    ctx.strokeStyle = '#B04A45'; ctx.lineWidth = Math.max(1, R * 0.04); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - R * 0.42, y + R * 0.06); ctx.quadraticCurveTo(x - R * 0.3, y + R * 0.14, x - R * 0.16, y + R * 0.1); ctx.stroke();
  };
  DRAW.clownfish = function (ctx, x, y, R) { /* 小丑鱼: 橙身白纹圆鳍 */
    bodyEllipse(ctx, x, y, R * 0.52, R * 0.32, '#FFA85E', '#FF8A3D', '#E06520');
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.12, y - R * 0.3); ctx.quadraticCurveTo(x - R * 0.06, y, x - R * 0.12, y + R * 0.3);
    ctx.quadraticCurveTo(x + R * 0.02, y, x - R * 0.12, y - R * 0.3); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.2, y - R * 0.24); ctx.quadraticCurveTo(x + R * 0.26, y, x + R * 0.2, y + R * 0.24);
    ctx.quadraticCurveTo(x + R * 0.34, y, x + R * 0.2, y - R * 0.24); ctx.closePath(); ctx.fill();
    eye(ctx, x - R * 0.3, y - R * 0.1, R * 0.055);
    ctx.fillStyle = '#FFA85E';
    ctx.beginPath(); ctx.arc(x - R * 0.62, y, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.58, y, R * 0.13, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.dolphin = function (ctx, x, y, R) { /* 小海豚: 弧跃体 + 背鳍 + 吻 */
    ctx.fillStyle = rg2(ctx, x - R * 0.1, y - R * 0.25, R * 0.05, R * 0.85, [0, '#A8D0F0', 0.6, '#7FB8E6', 1, '#5A93C4']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.62, y + R * 0.1);
    ctx.quadraticCurveTo(x - R * 0.2, y - R * 0.45, x + R * 0.55, y - R * 0.18);
    ctx.quadraticCurveTo(x + R * 0.62, y - R * 0.02, x + R * 0.4, y + R * 0.06);
    ctx.quadraticCurveTo(x - R * 0.1, y + R * 0.3, x - R * 0.62, y + R * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5A93C4';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.12, y - R * 0.32);
    ctx.quadraticCurveTo(x - R * 0.02, y - R * 0.6, x + R * 0.16, y - R * 0.38);
    ctx.quadraticCurveTo(x + R * 0.02, y - R * 0.3, x - R * 0.12, y - R * 0.32);
    ctx.closePath(); ctx.fill();
    eye(ctx, x + R * 0.34, y - R * 0.16, R * 0.05);
    ctx.fillStyle = '#FDFDFD';
    ctx.beginPath(); ctx.ellipse(x - R * 0.1, y + R * 0.05, R * 0.28, R * 0.09, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#E8EEF6'; ctx.lineWidth = Math.max(1, R * 0.04); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - R * 0.2, y + R * 0.25); ctx.quadraticCurveTo(x + R * 0.1, y + R * 0.34, x + R * 0.3, y + R * 0.14); ctx.stroke();
  };
  DRAW.whale = function (ctx, x, y, R) { /* 蓝鲸: 圆胖身 + 尾鳍 + 水柱 */
    bodyEllipse(ctx, x - R * 0.08, y + R * 0.08, R * 0.58, R * 0.38, '#8FB4E0', '#5C8FD6', '#4070B8');
    ctx.fillStyle = '#4070B8';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.4, y + R * 0.02);
    ctx.quadraticCurveTo(x + R * 0.7, y - R * 0.28, x + R * 0.62, y + R * 0.02);
    ctx.quadraticCurveTo(x + R * 0.7, y + R * 0.3, x + R * 0.4, y + R * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#D9E8F5';
    ctx.beginPath(); ctx.ellipse(x - R * 0.2, y + R * 0.22, R * 0.34, R * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    eye(ctx, x - R * 0.48, y - R * 0.06, R * 0.055);
    ctx.strokeStyle = '#BFE0F2'; ctx.lineWidth = Math.max(1.2, R * 0.07); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y - R * 0.34); ctx.quadraticCurveTo(x - R * 0.2, y - R * 0.55, x - R * 0.05, y - R * 0.7);
    ctx.stroke();
  };
  DRAW.octopus = function (ctx, x, y, R) { /* 小章鱼: 圆头 + 波浪腕足 */
    bodyEllipse(ctx, x, y - R * 0.12, R * 0.44, R * 0.4, '#F2A6CD', '#E07BB5', '#C25AA0');
    eye(ctx, x - R * 0.15, y - R * 0.18, R * 0.06);
    eye(ctx, x + R * 0.15, y - R * 0.18, R * 0.06);
    ctx.fillStyle = '#E07BB5';
    for (var i = 0; i < 4; i++) {
      var bx = x - R * 0.36 + i * R * 0.24;
      ctx.beginPath();
      ctx.moveTo(bx, y + R * 0.18);
      ctx.quadraticCurveTo(bx - R * 0.06, y + R * 0.45, bx - R * 0.16, y + R * 0.5);
      ctx.quadraticCurveTo(bx + R * 0.04, y + R * 0.5, bx + R * 0.08, y + R * 0.3);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#C25AA0';
    ctx.beginPath(); ctx.arc(x - R * 0.14, y - R * 0.36, R * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.05, y - R * 0.4, R * 0.04, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.crab = function (ctx, x, y, R) { /* 小螃蟹: 扁椭圆 + 大钳 + 侧步足 */
    ctx.strokeStyle = '#D04A28'; ctx.lineWidth = Math.max(1.2, R * 0.07); ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var ly = y + R * (0.05 + i * 0.18);
      ctx.beginPath();
      ctx.moveTo(x - R * 0.45, ly); ctx.quadraticCurveTo(x - R * 0.68, ly + R * 0.1, x - R * 0.72, ly - R * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + R * 0.45, ly); ctx.quadraticCurveTo(x + R * 0.68, ly + R * 0.1, x + R * 0.72, ly - R * 0.02);
      ctx.stroke();
    }
    bodyEllipse(ctx, x, y, R * 0.5, R * 0.36, '#F98565', '#F2603C', '#D04424');
    eye(ctx, x - R * 0.16, y - R * 0.12, R * 0.055);
    eye(ctx, x + R * 0.16, y - R * 0.12, R * 0.055);
    ctx.fillStyle = '#D04424';
    ctx.beginPath();
    ctx.arc(x - R * 0.58, y - R * 0.32, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - R * 0.5, y - R * 0.32); ctx.lineTo(x - R * 0.7, y - R * 0.44); ctx.lineTo(x - R * 0.52, y - R * 0.44);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.arc(x + R * 0.58, y - R * 0.32, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.5, y - R * 0.32); ctx.lineTo(x + R * 0.7, y - R * 0.44); ctx.lineTo(x + R * 0.52, y - R * 0.44);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#A83418'; ctx.lineWidth = Math.max(1, R * 0.045);
    ctx.beginPath(); ctx.moveTo(x - R * 0.08, y + R * 0.1); ctx.quadraticCurveTo(x, y + R * 0.16, x + R * 0.08, y + R * 0.1); ctx.stroke();
  };
  DRAW.jellyfish = function (ctx, x, y, R) { /* 水母: 半圆伞体 + 波浪触须 */
    ctx.fillStyle = rg2(ctx, x - R * 0.1, y - R * 0.3, R * 0.05, R * 0.65, [0, '#E6D4FA', 0.6, '#C9A7F5', 1, '#A683DB']);
    ctx.beginPath();
    ctx.arc(x, y - R * 0.05, R * 0.48, Math.PI, 0);
    ctx.quadraticCurveTo(x + R * 0.3, y + R * 0.08, x + R * 0.2, y + R * 0.06);
    ctx.quadraticCurveTo(x + R * 0.08, y + R * 0.16, x, y + R * 0.06);
    ctx.quadraticCurveTo(x - R * 0.08, y + R * 0.16, x - R * 0.2, y + R * 0.06);
    ctx.quadraticCurveTo(x - R * 0.3, y + R * 0.08, x - R * 0.48, y - R * 0.05);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(166,131,219,0.85)'; ctx.lineWidth = Math.max(1.2, R * 0.06); ctx.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      var tx = x - R * 0.3 + i * R * 0.2;
      ctx.beginPath();
      ctx.moveTo(tx, y + R * 0.08);
      ctx.quadraticCurveTo(tx - R * 0.08, y + R * 0.35, tx + R * 0.04, y + R * 0.58);
      ctx.stroke();
    }
    eye(ctx, x - R * 0.14, y - R * 0.2, R * 0.05);
    eye(ctx, x + R * 0.14, y - R * 0.2, R * 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(x - R * 0.16, y - R * 0.4, R * 0.14, R * 0.07, -0.4, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.butterfly = function (ctx, x, y, R) { /* 蓝闪蝶: 双翼 + 翼纹 + 触角 */
    ctx.fillStyle = rg2(ctx, x - R * 0.25, y - R * 0.3, R * 0.05, R * 0.7, [0, '#8FC8F2', 0.6, '#5AA9E6', 1, '#3A85C9']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.08, y);
    ctx.bezierCurveTo(x - R * 0.85, y - R * 0.65, x - R * 0.55, y + R * 0.1, x - R * 0.08, y + R * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.08, y);
    ctx.bezierCurveTo(x + R * 0.85, y - R * 0.65, x + R * 0.55, y + R * 0.1, x + R * 0.08, y + R * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2A1F45';
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.04, R * 0.07, R * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2A1F45'; ctx.lineWidth = Math.max(1, R * 0.045); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - R * 0.04, y - R * 0.22); ctx.quadraticCurveTo(x - R * 0.18, y - R * 0.5, x - R * 0.3, y - R * 0.54); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R * 0.04, y - R * 0.22); ctx.quadraticCurveTo(x + R * 0.18, y - R * 0.5, x + R * 0.3, y - R * 0.54); ctx.stroke();
    ctx.fillStyle = '#F2F7FC';
    ctx.beginPath(); ctx.arc(x - R * 0.32, y - R * 0.28, R * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.32, y - R * 0.28, R * 0.09, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.bee = function (ctx, x, y, R) { /* 小蜜蜂: 圆身条纹 + 双翅 + 蜂针 */
    ctx.fillStyle = 'rgba(214,236,248,0.92)';
    ctx.beginPath(); ctx.ellipse(x - R * 0.34, y - R * 0.3, R * 0.24, R * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + R * 0.34, y - R * 0.3, R * 0.24, R * 0.14, 0.5, 0, Math.PI * 2); ctx.fill();
    bodyEllipse(ctx, x, y + R * 0.08, R * 0.42, R * 0.36, '#FFDD66', '#FFC93C', '#E8A81F');
    ctx.fillStyle = '#3A3630';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y - R * 0.24);
    ctx.quadraticCurveTo(x - R * 0.05, y + R * 0.02, x - R * 0.12, y + R * 0.26);
    ctx.quadraticCurveTo(x + R * 0.02, y + R * 0.02, x - R * 0.1, y - R * 0.24);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.18, y - R * 0.2);
    ctx.quadraticCurveTo(x + R * 0.24, y + R * 0.02, x + R * 0.16, y + R * 0.22);
    ctx.quadraticCurveTo(x + R * 0.04, y + R * 0.02, x + R * 0.18, y - R * 0.2);
    ctx.closePath(); ctx.fill();
    eye(ctx, x - R * 0.24, y - R * 0.14, R * 0.055);
    ctx.strokeStyle = '#3A3630'; ctx.lineWidth = Math.max(1, R * 0.045); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - R * 0.36, y - R * 0.28); ctx.quadraticCurveTo(x - R * 0.44, y - R * 0.44, x - R * 0.34, y - R * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R * 0.08, y - R * 0.28); ctx.quadraticCurveTo(x, y - R * 0.44, x + R * 0.1, y - R * 0.5); ctx.stroke();
    ctx.fillStyle = '#3A3630';
    ctx.beginPath(); ctx.moveTo(x + R * 0.4, y + R * 0.2); ctx.lineTo(x + R * 0.56, y + R * 0.28); ctx.lineTo(x + R * 0.4, y + R * 0.32); ctx.closePath(); ctx.fill();
  };
  DRAW.ladybug = function (ctx, x, y, R) { /* 七星瓢虫: 红鞘黑点 + 中缝 + 头 */
    bodyEllipse(ctx, x, y + R * 0.08, R * 0.5, R * 0.42, '#F87A58', '#F05030', '#C93A1E');
    ctx.fillStyle = '#3A2A20';
    ctx.beginPath(); ctx.arc(x, y - R * 0.34, R * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A2A33';
    var dots = [[-0.26, -0.08], [0.26, -0.08], [-0.2, 0.24], [0.2, 0.24], [0, 0.12], [-0.36, 0.1], [0.36, 0.1]];
    for (var i = 0; i < dots.length; i++) {
      ctx.beginPath();
      ctx.arc(x + R * dots[i][0], y + R * dots[i][1], R * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#2A2A33'; ctx.lineWidth = Math.max(1, R * 0.04);
    ctx.beginPath(); ctx.moveTo(x, y - R * 0.28); ctx.lineTo(x, y + R * 0.46); ctx.stroke();
    eye(ctx, x - R * 0.08, y - R * 0.38, R * 0.04);
    eye(ctx, x + R * 0.08, y - R * 0.38, R * 0.04);
  };
  DRAW.robin = function (ctx, x, y, R) { /* 知更鸟: 橙胸 + 蓝灰背 + 侧头 */
    ctx.fillStyle = '#8AA8C4';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.55, y + R * 0.12);
    ctx.quadraticCurveTo(x - R * 0.2, y - R * 0.42, x + R * 0.3, y - R * 0.3);
    ctx.quadraticCurveTo(x + R * 0.5, y - R * 0.1, x + R * 0.35, y + R * 0.14);
    ctx.quadraticCurveTo(x - R * 0.1, y + R * 0.3, x - R * 0.55, y + R * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F5B39A';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y - R * 0.3);
    ctx.quadraticCurveTo(x - R * 0.45, y - R * 0.05, x - R * 0.3, y + R * 0.3);
    ctx.quadraticCurveTo(x + R * 0.05, y + R * 0.25, x + R * 0.08, y - R * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#D9484A';
    ctx.beginPath(); ctx.ellipse(x - R * 0.12, y + R * 0.12, R * 0.16, R * 0.14, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5B7A94';
    ctx.beginPath(); ctx.arc(x + R * 0.28, y - R * 0.34, R * 0.2, 0, Math.PI * 2); ctx.fill();
    eye(ctx, x + R * 0.3, y - R * 0.38, R * 0.05);
    ctx.fillStyle = '#E8B41F';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.42, y - R * 0.32); ctx.lineTo(x + R * 0.6, y - R * 0.28); ctx.lineTo(x + R * 0.44, y - R * 0.22);
    ctx.closePath(); ctx.fill();
  };
  DRAW.owl = function (ctx, x, y, R) { /* 猫头鹰: 圆脸盘 + 大环眼 + 耳羽 */
    ctx.fillStyle = '#B08F5C';
    ctx.beginPath(); ctx.moveTo(x - R * 0.4, y - R * 0.34); ctx.lineTo(x - R * 0.5, y - R * 0.62); ctx.lineTo(x - R * 0.2, y - R * 0.48); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + R * 0.4, y - R * 0.34); ctx.lineTo(x + R * 0.5, y - R * 0.62); ctx.lineTo(x + R * 0.2, y - R * 0.48); ctx.closePath(); ctx.fill();
    bodyEllipse(ctx, x, y + R * 0.04, R * 0.55, R * 0.5, '#E8CFA8', '#D9B98A', '#B08F5C');
    ctx.fillStyle = '#B08F5C';
    for (var i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y + R * (0.14 + i * 0.08), R * 0.4, R * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#F2E4CB';
    ctx.beginPath(); ctx.arc(x - R * 0.2, y - R * 0.1, R * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.2, y - R * 0.1, R * 0.15, 0, Math.PI * 2); ctx.fill();
    eye(ctx, x - R * 0.2, y - R * 0.1, R * 0.07);
    eye(ctx, x + R * 0.2, y - R * 0.1, R * 0.07);
    ctx.fillStyle = '#E8B41F';
    ctx.beginPath();
    ctx.moveTo(x, y + R * 0.02); ctx.lineTo(x + R * 0.06, y + R * 0.14); ctx.lineTo(x, y + R * 0.2); ctx.lineTo(x - R * 0.06, y + R * 0.14);
    ctx.closePath(); ctx.fill();
  };
  DRAW.flamingo = function (ctx, x, y, R) { /* 火烈鸟: 弧颈 + 黑尖喙 + 单腿 */
    ctx.strokeStyle = '#F2A0B8'; ctx.lineWidth = Math.max(2, R * 0.14); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y + R * 0.36);
    ctx.quadraticCurveTo(x - R * 0.16, y - R * 0.1, x + R * 0.2, y - R * 0.24);
    ctx.stroke();
    ctx.fillStyle = rg2(ctx, x - R * 0.1, y, R * 0.05, R * 0.6, [0, '#FBA8BF', 0.6, '#F87BA0', 1, '#E05E85']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.2, y + R * 0.34);
    ctx.quadraticCurveTo(x - R * 0.05, y + R * 0.1, x + R * 0.12, y + R * 0.3);
    ctx.quadraticCurveTo(x - R * 0.02, y + R * 0.5, x - R * 0.2, y + R * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F87BA0';
    ctx.beginPath(); ctx.arc(x + R * 0.24, y - R * 0.28, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A2A33';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.34, y - R * 0.3); ctx.lineTo(x + R * 0.56, y - R * 0.24); ctx.lineTo(x + R * 0.34, y - R * 0.2);
    ctx.closePath(); ctx.fill();
    eye(ctx, x + R * 0.24, y - R * 0.34, R * 0.04);
    ctx.strokeStyle = '#E05E85'; ctx.lineWidth = Math.max(1.5, R * 0.09); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - R * 0.06, y + R * 0.46); ctx.lineTo(x - R * 0.04, y + R * 0.66); ctx.stroke();
  };
  DRAW.swan = function (ctx, x, y, R) { /* 白天鹅: S 颈 + 展翅 + 水面 */
    ctx.fillStyle = 'rgba(180,215,240,0.75)';
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.55, R * 0.6, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FDFDFD';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.5, y + R * 0.2);
    ctx.quadraticCurveTo(x - R * 0.15, y + R * 0.02, x + R * 0.3, y + R * 0.18);
    ctx.quadraticCurveTo(x + R * 0.5, y + R * 0.3, x + R * 0.2, y + R * 0.4);
    ctx.quadraticCurveTo(x - R * 0.25, y + R * 0.44, x - R * 0.5, y + R * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#FDFDFD'; ctx.lineWidth = Math.max(2, R * 0.13); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.3, y + R * 0.24);
    ctx.quadraticCurveTo(x - R * 0.4, y - R * 0.2, x + R * 0.05, y - R * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#F2F2F0';
    ctx.beginPath(); ctx.ellipse(x + R * 0.2, y + R * 0.06, R * 0.34, R * 0.16, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FDFDFD';
    ctx.beginPath(); ctx.arc(x + R * 0.12, y - R * 0.4, R * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E89B55';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.2, y - R * 0.44); ctx.lineTo(x + R * 0.38, y - R * 0.38); ctx.lineTo(x + R * 0.22, y - R * 0.32);
    ctx.closePath(); ctx.fill();
    eye(ctx, x + R * 0.17, y - R * 0.46, R * 0.04);
  };
  DRAW.dove = function (ctx, x, y, R) { /* 和平鸽: 白展翅 + 橙喙 + 尾羽 */
    ctx.fillStyle = '#FDFDFD';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.06, y - R * 0.05);
    ctx.quadraticCurveTo(x - R * 0.85, y - R * 0.5, x - R * 0.6, y + R * 0.05);
    ctx.quadraticCurveTo(x - R * 0.35, y + R * 0.18, x - R * 0.06, y + R * 0.05);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.06, y - R * 0.05);
    ctx.quadraticCurveTo(x + R * 0.85, y - R * 0.5, x + R * 0.6, y + R * 0.05);
    ctx.quadraticCurveTo(x + R * 0.35, y + R * 0.18, x + R * 0.06, y + R * 0.05);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#EAEAF2';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.14, y - R * 0.15);
    ctx.quadraticCurveTo(x - R * 0.5, y + R * 0.1, x - R * 0.62, y + R * 0.4);
    ctx.quadraticCurveTo(x - R * 0.2, y + R * 0.3, x - R * 0.05, y + R * 0.08);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.14, y - R * 0.15);
    ctx.quadraticCurveTo(x + R * 0.5, y + R * 0.1, x + R * 0.62, y + R * 0.4);
    ctx.quadraticCurveTo(x + R * 0.2, y + R * 0.3, x + R * 0.05, y + R * 0.08);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FDFDFD';
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.02, R * 0.13, R * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - R * 0.02, y - R * 0.34, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F59F2A';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.12, y - R * 0.36); ctx.lineTo(x - R * 0.34, y - R * 0.3); ctx.lineTo(x - R * 0.12, y - R * 0.26);
    ctx.closePath(); ctx.fill();
    eye(ctx, x - R * 0.08, y - R * 0.4, R * 0.04);
  };

  /* ---------- 阶段三: 奇幻远航 30~44 ---------- */
  DRAW.rocket = function (ctx, x, y, R) { /* 小火箭: 白箭身 + 红鼻 + 蓝舷窗 + 双喷焰 */
    ctx.fillStyle = '#F05030';
    ctx.beginPath(); ctx.moveTo(x, y - R * 0.72);
    ctx.quadraticCurveTo(x + R * 0.22, y - R * 0.4, x + R * 0.2, y - R * 0.05);
    ctx.lineTo(x - R * 0.2, y - R * 0.05);
    ctx.quadraticCurveTo(x - R * 0.22, y - R * 0.4, x, y - R * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rg2(ctx, x - R * 0.06, y - R * 0.3, R * 0.03, R * 0.4, [0, '#FFFFFF', 0.6, '#E8E8F0', 1, '#C8C8D5']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.2, y - R * 0.1);
    ctx.lineTo(x + R * 0.2, y - R * 0.1);
    ctx.lineTo(x + R * 0.24, y + R * 0.42);
    ctx.quadraticCurveTo(x, y + R * 0.52, x - R * 0.24, y + R * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E8482A';
    ctx.beginPath(); ctx.moveTo(x - R * 0.2, y - R * 0.05); ctx.lineTo(x - R * 0.42, y + R * 0.2); ctx.lineTo(x - R * 0.2, y + R * 0.2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + R * 0.2, y - R * 0.05); ctx.lineTo(x + R * 0.42, y + R * 0.2); ctx.lineTo(x + R * 0.2, y + R * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8FD3F4';
    ctx.beginPath(); ctx.arc(x, y - R * 0.02, R * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5B8FC4'; ctx.lineWidth = Math.max(1, R * 0.04);
    ctx.beginPath(); ctx.arc(x, y - R * 0.02, R * 0.13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#FFB53D';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y + R * 0.5); ctx.lineTo(x, y + R * 0.82); ctx.lineTo(x + R * 0.1, y + R * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FF7E2A';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.06, y + R * 0.5); ctx.lineTo(x, y + R * 0.68); ctx.lineTo(x + R * 0.06, y + R * 0.5);
    ctx.closePath(); ctx.fill();
  };
  DRAW.ufo = function (ctx, x, y, R) { /* 飞碟: 荧光碟身 + 玻璃罩 + 光束 */
    ctx.fillStyle = 'rgba(168,230,207,0.28)';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.3, y + R * 0.24);
    ctx.lineTo(x + R * 0.3, y + R * 0.24);
    ctx.lineTo(x + R * 0.55, y + R * 0.75);
    ctx.lineTo(x - R * 0.55, y + R * 0.75);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(190,235,250,0.85)';
    ctx.beginPath();
    ctx.arc(x, y + R * 0.06, R * 0.3, Math.PI, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rg2(ctx, x - R * 0.15, y + R * 0.05, R * 0.05, R * 0.6, [0, '#C8F2DC', 0.6, '#A8E6CF', 1, '#6FBF9A']);
    ctx.beginPath();
    ctx.ellipse(x, y + R * 0.18, R * 0.58, R * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F2FFFA';
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(x + i * R * 0.2, y + R * 0.24, R * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    eye(ctx, x - R * 0.08, y - R * 0.08, R * 0.05);
    eye(ctx, x + R * 0.08, y - R * 0.08, R * 0.05);
  };
  DRAW.plane = function (ctx, x, y, R) { /* 小飞机: 白机身 + 主翼 + 尾翼 + 圆窗 */
    ctx.fillStyle = rg2(ctx, x - R * 0.2, y - R * 0.15, R * 0.05, R * 0.75, [0, '#FFFFFF', 0.6, '#DAEEF7', 1, '#AFCBD8']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.7, y + R * 0.06);
    ctx.quadraticCurveTo(x - R * 0.3, y - R * 0.24, x + R * 0.55, y - R * 0.12);
    ctx.quadraticCurveTo(x + R * 0.72, y - R * 0.04, x + R * 0.5, y + R * 0.1);
    ctx.quadraticCurveTo(x, y + R * 0.3, x - R * 0.7, y + R * 0.06);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5B8FC4';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y - R * 0.02);
    ctx.quadraticCurveTo(x - R * 0.4, y - R * 0.5, x - R * 0.62, y - R * 0.52);
    ctx.quadraticCurveTo(x - R * 0.5, y - R * 0.05, x - R * 0.16, y + R * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y - R * 0.02);
    ctx.quadraticCurveTo(x + R * 0.2, y + R * 0.42, x - R * 0.06, y + R * 0.44);
    ctx.quadraticCurveTo(x - R * 0.32, y + R * 0.14, x - R * 0.16, y + R * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E8482A';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.66, y - R * 0.04);
    ctx.lineTo(x - R * 0.78, y - R * 0.4);
    ctx.lineTo(x - R * 0.5, y - R * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8FA8BF';
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x + R * (0.05 + i * 0.16), y + R * 0.02, R * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  DRAW.helicopter = function (ctx, x, y, R) { /* 直升机: 球舱 + 旋翼 + 尾梁 */
    ctx.strokeStyle = '#8FA8BF'; ctx.lineWidth = Math.max(1.5, R * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - R * 0.62, y - R * 0.44); ctx.lineTo(x + R * 0.62, y - R * 0.44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - R * 0.44); ctx.lineTo(x, y - R * 0.56); ctx.stroke();
    ctx.fillStyle = '#B8C5CE';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.72, y - R * 0.62); ctx.lineTo(x + R * 0.72, y - R * 0.62);
    ctx.lineTo(x + R * 0.6, y - R * 0.5); ctx.lineTo(x - R * 0.6, y - R * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rg2(ctx, x - R * 0.15, y - R * 0.15, R * 0.05, R * 0.5, [0, '#FFFFFF', 0.6, '#CFE3EE', 1, '#9FBCCE']);
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.05, R * 0.42, R * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#CFE3EE';
    ctx.beginPath(); ctx.ellipse(x + R * 0.06, y + R * 0.05, R * 0.24, R * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5B7A94';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.38, y + R * 0.02);
    ctx.quadraticCurveTo(x + R * 0.7, y - R * 0.08, x + R * 0.74, y + R * 0.06);
    ctx.lineTo(x + R * 0.4, y + R * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E8482A';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.68, y - R * 0.1); ctx.lineTo(x + R * 0.86, y - R * 0.02); ctx.lineTo(x + R * 0.66, y + R * 0.02);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5B7A94'; ctx.lineWidth = Math.max(1.5, R * 0.08);
    ctx.beginPath(); ctx.moveTo(x - R * 0.3, y + R * 0.34); ctx.lineTo(x + R * 0.3, y + R * 0.34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - R * 0.34, y + R * 0.34); ctx.lineTo(x - R * 0.28, y + R * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R * 0.34, y + R * 0.34); ctx.lineTo(x + R * 0.28, y + R * 0.52); ctx.stroke();
    eye(ctx, x - R * 0.2, y, R * 0.05);
  };
  DRAW.balloon = function (ctx, x, y, R) { /* 热气球: 条纹球 + 吊篮 + 气绳 */
    ctx.fillStyle = rg2(ctx, x - R * 0.2, y - R * 0.25, R * 0.05, R * 0.7, [0, '#FCA8BC', 0.6, '#F78FA7', 1, '#E06A88']);
    ctx.beginPath();
    ctx.moveTo(x, y - R * 0.72);
    ctx.bezierCurveTo(x + R * 0.6, y - R * 0.62, x + R * 0.6, y + R * 0.18, x, y + R * 0.34);
    ctx.bezierCurveTo(x - R * 0.6, y + R * 0.18, x - R * 0.6, y - R * 0.62, x, y - R * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FCE3B0';
    ctx.beginPath();
    ctx.moveTo(x, y - R * 0.72);
    ctx.bezierCurveTo(x + R * 0.18, y - R * 0.66, x + R * 0.18, y + R * 0.14, x, y + R * 0.34);
    ctx.bezierCurveTo(x - R * 0.18, y + R * 0.14, x - R * 0.18, y - R * 0.66, x, y - R * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F2F7FC';
    ctx.beginPath();
    ctx.moveTo(x, y - R * 0.72);
    ctx.bezierCurveTo(x + R * 0.34, y - R * 0.64, x + R * 0.34, y + R * 0.14, x, y + R * 0.34);
    ctx.bezierCurveTo(x + R * 0.06, y + R * 0.14, x + R * 0.06, y - R * 0.64, x, y - R * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8A6B45'; ctx.lineWidth = Math.max(1, R * 0.04);
    ctx.beginPath(); ctx.moveTo(x - R * 0.1, y + R * 0.34); ctx.lineTo(x - R * 0.14, y + R * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R * 0.1, y + R * 0.34); ctx.lineTo(x + R * 0.14, y + R * 0.52); ctx.stroke();
    ctx.fillStyle = '#B08F5C';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.2, y + R * 0.5);
    ctx.lineTo(x + R * 0.2, y + R * 0.5);
    ctx.lineTo(x + R * 0.16, y + R * 0.74);
    ctx.lineTo(x - R * 0.16, y + R * 0.74);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2A2A33';
    ctx.beginPath(); ctx.arc(x, y + R * 0.6, R * 0.055, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.sailboat = function (ctx, x, y, R) { /* 小帆船: 白帆 + 船身 + 波纹 */
    ctx.fillStyle = 'rgba(140,180,220,0.6)';
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.58, R * 0.6, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FDFDFD';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.05, y - R * 0.7);
    ctx.quadraticCurveTo(x + R * 0.5, y - R * 0.1, x + R * 0.04, y + R * 0.28);
    ctx.lineTo(x - R * 0.05, y + R * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F2A65A';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.1, y - R * 0.6);
    ctx.quadraticCurveTo(x - R * 0.5, y - R * 0.05, x - R * 0.12, y + R * 0.24);
    ctx.lineTo(x - R * 0.1, y - R * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8A6B45'; ctx.lineWidth = Math.max(1.2, R * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - R * 0.02, y - R * 0.72); ctx.lineTo(x - R * 0.02, y + R * 0.3); ctx.stroke();
    ctx.fillStyle = '#E8482A';
    ctx.beginPath(); ctx.moveTo(x - R * 0.02, y - R * 0.72); ctx.lineTo(x + R * 0.12, y - R * 0.64); ctx.lineTo(x - R * 0.02, y - R * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5B8FC4';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.5, y + R * 0.32);
    ctx.quadraticCurveTo(x, y + R * 0.56, x + R * 0.5, y + R * 0.32);
    ctx.lineTo(x + R * 0.34, y + R * 0.44);
    ctx.lineTo(x - R * 0.34, y + R * 0.44);
    ctx.closePath(); ctx.fill();
  };
  DRAW.train = function (ctx, x, y, R) { /* 小火车: 红车头 + 烟囱 + 车轮 */
    ctx.fillStyle = '#9AA8B5';
    ctx.beginPath(); ctx.ellipse(x - R * 0.44, y - R * 0.62, R * 0.16, R * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,210,225,0.75)';
    ctx.beginPath(); ctx.ellipse(x - R * 0.32, y - R * 0.78, R * 0.12, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - R * 0.5, y - R * 0.92, R * 0.08, R * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rg2(ctx, x - R * 0.2, y - R * 0.2, R * 0.05, R * 0.6, [0, '#F98A7E', 0.6, '#E85D5D', 1, '#C43A3A']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.55, y + R * 0.2);
    ctx.lineTo(x - R * 0.55, y - R * 0.45);
    ctx.lineTo(x - R * 0.3, y - R * 0.45);
    ctx.lineTo(x - R * 0.3, y - R * 0.15);
    ctx.lineTo(x + R * 0.1, y - R * 0.15);
    ctx.lineTo(x + R * 0.1, y + R * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8FD3F4';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - R * 0.5, y - R * 0.4, R * 0.16, R * 0.16, R * 0.03) : ctx.rect(x - R * 0.5, y - R * 0.4, R * 0.16, R * 0.16);
    ctx.fill();
    ctx.fillStyle = '#F5B778';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.34, y - R * 0.5); ctx.lineTo(x - R * 0.26, y - R * 0.5);
    ctx.lineTo(x - R * 0.26, y - R * 0.62); ctx.lineTo(x - R * 0.34, y - R * 0.62);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#B0BAC4';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.1, y + R * 0.2);
    ctx.lineTo(x + R * 0.58, y + R * 0.2);
    ctx.lineTo(x + R * 0.58, y + R * 0.02);
    ctx.lineTo(x + R * 0.1, y + R * 0.02);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F0C8A0';
    for (var i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(x - R * 0.44 + i * R * 0.28, y + R * 0.28, R * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#3A3A40';
    for (var i2 = 0; i2 < 3; i2++) {
      ctx.beginPath(); ctx.arc(x - R * 0.44 + i2 * R * 0.28, y + R * 0.28, R * 0.045, 0, Math.PI * 2); ctx.fill();
    }
  };
  DRAW.beetle = function (ctx, x, y, R) { /* 甲壳虫车: 蓝圆顶车身 + 车窗 + 双轮 */
    ctx.fillStyle = rg2(ctx, x - R * 0.15, y - R * 0.3, R * 0.05, R * 0.6, [0, '#9AD5EE', 0.6, '#6FC3E0', 1, '#4A9CBF']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.6, y + R * 0.18);
    ctx.quadraticCurveTo(x - R * 0.58, y - R * 0.4, x, y - R * 0.42);
    ctx.quadraticCurveTo(x + R * 0.58, y - R * 0.4, x + R * 0.6, y + R * 0.18);
    ctx.quadraticCurveTo(x, y + R * 0.4, x - R * 0.6, y + R * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#D9EFF8';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.28, y - R * 0.28);
    ctx.quadraticCurveTo(x, y - R * 0.44, x + R * 0.28, y - R * 0.28);
    ctx.quadraticCurveTo(x, y - R * 0.16, x - R * 0.28, y - R * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + R * 0.12, y - R * 0.28);
    ctx.quadraticCurveTo(x + R * 0.42, y - R * 0.26, x + R * 0.44, y - R * 0.1);
    ctx.quadraticCurveTo(x + R * 0.3, y - R * 0.12, x + R * 0.12, y - R * 0.22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F2F7FC';
    ctx.beginPath(); ctx.arc(x + R * 0.52, y - R * 0.14, R * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F59F2A';
    ctx.beginPath(); ctx.arc(x + R * 0.52, y - R * 0.14, R * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A2A33';
    ctx.beginPath(); ctx.arc(x - R * 0.34, y + R * 0.3, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.36, y + R * 0.3, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9AA8B5';
    ctx.beginPath(); ctx.arc(x - R * 0.34, y + R * 0.3, R * 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.36, y + R * 0.3, R * 0.055, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.bus = function (ctx, x, y, R) { /* 黄色巴士: 长方车身 + 车窗排 + 车灯 */
    ctx.fillStyle = rg2(ctx, x - R * 0.15, y - R * 0.25, R * 0.05, R * 0.65, [0, '#FFE066', 0.6, '#FFCB2E', 1, '#E8A81F']);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - R * 0.66, y - R * 0.42, R * 1.32, R * 0.74, R * 0.12) : ctx.rect(x - R * 0.66, y - R * 0.42, R * 1.32, R * 0.74);
    ctx.fill();
    ctx.fillStyle = '#D9EFF8';
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - R * 0.58 + i * R * 0.3, y - R * 0.32, R * 0.22, R * 0.2, R * 0.04) : ctx.rect(x - R * 0.58 + i * R * 0.3, y - R * 0.32, R * 0.22, R * 0.2);
      ctx.fill();
    }
    ctx.fillStyle = '#E8482A';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - R * 0.4, y, R * 0.8, R * 0.18, R * 0.06) : ctx.rect(x - R * 0.4, y, R * 0.8, R * 0.18);
    ctx.fill();
    ctx.fillStyle = '#FDFDFD';
    ctx.font = 'bold ' + Math.max(6, R * 0.16) + 'px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GO', x, y + R * 0.09);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#2A2A33';
    ctx.beginPath(); ctx.arc(x - R * 0.4, y + R * 0.36, R * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.4, y + R * 0.36, R * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9AA8B5';
    ctx.beginPath(); ctx.arc(x - R * 0.4, y + R * 0.36, R * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.4, y + R * 0.36, R * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F2F7FC';
    ctx.beginPath(); ctx.arc(x + R * 0.58, y - R * 0.28, R * 0.06, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.scooter = function (ctx, x, y, R) { /* 小电驴: 踏板车 + 车把 + 头盔 */
    ctx.fillStyle = '#2A2A33';
    ctx.beginPath(); ctx.arc(x + R * 0.44, y + R * 0.3, R * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - R * 0.5, y + R * 0.32, R * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9AA8B5';
    ctx.beginPath(); ctx.arc(x + R * 0.44, y + R * 0.3, R * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rg2(ctx, x - R * 0.1, y, R * 0.05, R * 0.55, [0, '#B4E678', 0.6, '#9BD35B', 1, '#7AB53E']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.52, y + R * 0.26);
    ctx.quadraticCurveTo(x - R * 0.58, y - R * 0.1, x - R * 0.3, y - R * 0.16);
    ctx.lineTo(x + R * 0.3, y - R * 0.16);
    ctx.quadraticCurveTo(x + R * 0.5, y - R * 0.1, x + R * 0.52, y + R * 0.16);
    ctx.lineTo(x - R * 0.52, y + R * 0.16);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8A8F96'; ctx.lineWidth = Math.max(1.5, R * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + R * 0.32, y - R * 0.14); ctx.lineTo(x + R * 0.4, y - R * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R * 0.24, y - R * 0.56); ctx.lineTo(x + R * 0.56, y - R * 0.56); ctx.stroke();
    ctx.fillStyle = '#F0C8A0';
    ctx.beginPath();
    ctx.arc(x + R * 0.06, y - R * 0.48, R * 0.17, Math.PI, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4CC38A';
    ctx.beginPath();
    ctx.arc(x + R * 0.06, y - R * 0.48, R * 0.17, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath(); ctx.fill();
    eye(ctx, x + R * 0.02, y - R * 0.52, R * 0.04);
    ctx.fillStyle = '#F2F7FC';
    ctx.beginPath(); ctx.ellipse(x + R * 0.38, y + R * 0.08, R * 0.09, R * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.skateboard = function (ctx, x, y, R) { /* 滑板: 上翘板面 + 双轮架 + 动感线 */
    ctx.fillStyle = 'rgba(244,158,76,0.5)';
    ctx.beginPath(); ctx.ellipse(x - R * 0.55, y - R * 0.1, R * 0.18, R * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rg2(ctx, x - R * 0.1, y - R * 0.2, R * 0.05, R * 0.7, [0, '#F9BC80', 0.6, '#F49E4C', 1, '#E07E2E']);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.72, y - R * 0.1);
    ctx.quadraticCurveTo(x, y - R * 0.3, x + R * 0.72, y - R * 0.1);
    ctx.lineTo(x + R * 0.66, y + R * 0.02);
    ctx.quadraticCurveTo(x, y - R * 0.16, x - R * 0.66, y + R * 0.02);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E07E2E';
    ctx.beginPath();
    ctx.moveTo(x + R * 0.6, y - R * 0.14);
    ctx.quadraticCurveTo(x + R * 0.82, y - R * 0.26, x + R * 0.78, y - R * 0.34);
    ctx.quadraticCurveTo(x + R * 0.72, y - R * 0.22, x + R * 0.6, y - R * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - R * 0.6, y - R * 0.14);
    ctx.quadraticCurveTo(x - R * 0.82, y - R * 0.26, x - R * 0.78, y - R * 0.34);
    ctx.quadraticCurveTo(x - R * 0.72, y - R * 0.22, x - R * 0.6, y - R * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2A2A33';
    ctx.beginPath(); ctx.arc(x - R * 0.4, y + R * 0.18, R * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.4, y + R * 0.18, R * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F59F2A';
    ctx.beginPath(); ctx.arc(x - R * 0.4, y + R * 0.18, R * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.4, y + R * 0.18, R * 0.045, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.kite = function (ctx, x, y, R) { /* 风筝: 菱形面 + 骨架 + 尾飘带 */
    ctx.strokeStyle = '#E8482A'; ctx.lineWidth = Math.max(1.5, R * 0.07); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + R * 0.3);
    ctx.quadraticCurveTo(x - R * 0.3, y + R * 0.55, x - R * 0.18, y + R * 0.72);
    ctx.quadraticCurveTo(x + R * 0.02, y + R * 0.5, x, y + R * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + R * 0.3);
    ctx.quadraticCurveTo(x + R * 0.28, y + R * 0.6, x + R * 0.16, y + R * 0.78);
    ctx.stroke();
    ctx.fillStyle = rg2(ctx, x - R * 0.1, y - R * 0.3, R * 0.05, R * 0.65, [0, '#F98A9E', 0.6, '#F56A79', 1, '#E04860']);
    ctx.beginPath();
    ctx.moveTo(x, y - R * 0.72);
    ctx.lineTo(x + R * 0.46, y - R * 0.1);
    ctx.lineTo(x, y + R * 0.32);
    ctx.lineTo(x - R * 0.46, y - R * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#FCE3B0'; ctx.lineWidth = Math.max(1, R * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, y - R * 0.72); ctx.lineTo(x, y + R * 0.32);
    ctx.moveTo(x - R * 0.46, y - R * 0.1); ctx.lineTo(x + R * 0.46, y - R * 0.1);
    ctx.stroke();
    ctx.fillStyle = '#FCE3B0';
    ctx.beginPath(); ctx.arc(x, y - R * 0.32, R * 0.08, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.meteor = function (ctx, x, y, R) { /* 流星: 金头 + 双尾焰光束 */
    ctx.strokeStyle = 'rgba(255,226,138,0.75)'; ctx.lineWidth = Math.max(2, R * 0.16); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.2, y - R * 0.2);
    ctx.quadraticCurveTo(x - R * 0.5, y - R * 0.5, x - R * 0.85, y - R * 0.7);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,226,138,0.4)'; ctx.lineWidth = Math.max(1.5, R * 0.1);
    ctx.beginPath();
    ctx.moveTo(x - R * 0.25, y - R * 0.1);
    ctx.quadraticCurveTo(x - R * 0.55, y - R * 0.3, x - R * 0.8, y - R * 0.35);
    ctx.stroke();
    ctx.fillStyle = rg2(ctx, x - R * 0.12, y - R * 0.12, R * 0.03, R * 0.6, [0, '#FFF6DC', 0.5, '#FFE28A', 1, '#F5B93D']);
    ctx.beginPath();
    ctx.moveTo(x + R * 0.5, y + R * 0.4);
    ctx.quadraticCurveTo(x + R * 0.5, y - R * 0.1, x, y - R * 0.5);
    ctx.quadraticCurveTo(x - R * 0.3, y - R * 0.4, x - R * 0.3, y);
    ctx.quadraticCurveTo(x - R * 0.2, y + R * 0.45, x + R * 0.5, y + R * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x + R * 0.1, y + R * 0.05, R * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x + R * 0.24, y + R * 0.18, R * 0.06, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.comet = function (ctx, x, y, R) { /* 彗星: 冰蓝核 + 蓝扇尾 */
    ctx.strokeStyle = 'rgba(184,216,245,0.7)'; ctx.lineWidth = Math.max(2, R * 0.13); ctx.lineCap = 'round';
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x - R * 0.28, y + i * R * 0.2);
      ctx.quadraticCurveTo(x - R * 0.6, y + i * R * 0.34, x - R * 0.88, y + i * R * 0.3);
      ctx.stroke();
    }
    ctx.fillStyle = rg2(ctx, x - R * 0.1, y - R * 0.1, R * 0.03, R * 0.55, [0, '#F0F8FF', 0.5, '#B8D8F5', 1, '#7FB3E0']);
    ctx.beginPath();
    ctx.moveTo(x + R * 0.55, y + R * 0.05);
    ctx.quadraticCurveTo(x + R * 0.45, y - R * 0.45, x - R * 0.1, y - R * 0.45);
    ctx.quadraticCurveTo(x - R * 0.5, y - R * 0.4, x - R * 0.45, y);
    ctx.quadraticCurveTo(x - R * 0.4, y + R * 0.42, x + R * 0.55, y + R * 0.05);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x + R * 0.05, y, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(x + R * 0.26, y + R * 0.06, R * 0.07, 0, Math.PI * 2); ctx.fill();
  };
  DRAW.saturn = function (ctx, x, y, R) { /* 土星环: 条纹球体 + 斜环带 + 环星 */
    ctx.strokeStyle = '#D9B98A'; ctx.lineWidth = Math.max(2, R * 0.1);
    ctx.beginPath(); ctx.ellipse(x, y, R * 0.82, R * 0.26, -0.18, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(217,185,138,0.5)'; ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.beginPath(); ctx.ellipse(x, y, R * 0.95, R * 0.3, -0.18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rg2(ctx, x - R * 0.15, y - R * 0.15, R * 0.05, R * 0.55, [0, '#F2E2C0', 0.6, '#E8CFA0', 1, '#C9A96B']);
    ctx.beginPath(); ctx.arc(x, y, R * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(201,169,107,0.55)';
    ctx.beginPath(); ctx.ellipse(x, y - R * 0.1, R * 0.44, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#B08F5C';
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.12, R * 0.43, R * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E8CFA0';
    ctx.beginPath(); ctx.arc(x, y - R * 0.42, R * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + R * 0.32, y - R * 0.3, R * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.ellipse(x - R * 0.12, y - R * 0.22, R * 0.14, R * 0.06, -0.4, 0, Math.PI * 2); ctx.fill();
  };

  /* 显式缓存失效（测试用——会话内恒定） */
  /* Δ21: 六画卷权威常量（单一数据源） */
  var PAINTINGS = [
    { id: 1, range: [1,12], name: '晨曦雪峰庄园', desc: '晨曦雪峰庄园', bg: 'bg1', aliases: ['画卷一'] },
    { id: 2, range: [13,24], name: '云端飞瀑风车岛', desc: '云端飞瀑风车岛', bg: 'bg2', aliases: ['画卷二'] },
    { id: 3, range: [25,36], name: '碧浪椰影浅湾', desc: '碧浪椰影浅湾', bg: 'bg3', aliases: ['画卷三'] },
    { id: 4, range: [37,48], name: '凛冬冰川镜湖', desc: '凛冬冰川镜湖', bg: 'bg4', aliases: ['画卷四'] },
    { id: 5, range: [49,60], name: '云端霞彩航道', desc: '云端霞彩航道', bg: 'bg5', aliases: ['画卷五'] },
    { id: 6, range: [61,72], name: '星穹极光之巅', desc: '星穹极光之巅', bg: 'bg6', aliases: ['画卷六'] }
  ];
  function paintingForLevel(levelId) {
    var idx = Math.min(PAINTINGS.length, Math.max(1, Math.floor(((levelId || 1) - 1) / 12) + 1));
    return PAINTINGS[idx - 1];
  }

  function clearCache() { cache = {}; }

  STM.Bestiary = {
    PAINTINGS: PAINTINGS,
    paintingForLevel: paintingForLevel,
    BESTIARY: BESTIARY,
    STAGES: STAGES,
    DRAW: DRAW,
    EMOJI: EMOJI,
    mapSuits: mapSuits,
    mappingForLevel: mappingForLevel,
    stageOf: stageOf,
    makeRng: makeRng,
    entry: entry,
    emojiOf: function (bestiaryId) {
      return EMOJI[bestiaryId] || EMOJI[0];
    },
    drawEntry: function (ctx, bestiaryId, x, y, R) {
      var e = entry(bestiaryId);
      var fn = DRAW[e.draw];
      if (fn) fn(ctx, x, y, R);
    },
    clearCache: clearCache
  };

})(typeof window !== 'undefined' ? window : globalThis);
