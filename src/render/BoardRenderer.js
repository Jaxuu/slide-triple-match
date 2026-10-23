/* =========================================================
 * Slide & Triple — BoardRenderer（Canvas 2D 渲染）
 * classic script；向 window.STM 挂载（D-01）
 * rAF 脏检查主循环（60fps 目标）
 *
 * Δ14/T052b《万物出发！》（M3.5 表现层——FR-034）:
 *   · 3D 奶油白正方体底座（底部 #CBD5E1 立体厚度 + #FFFFFF→#F4F7FB
 *     微渐变面板 + 纯白内高光描边）——替代暖棕厚度底座
 *   · 多层金字塔投影（向左上阶梯偏移 + 层间柔和投影）——
 *     彻底移除左上角圆圈层高指示器（drawStackBadge 下线）
 *   · 彻底移除牌面中心半透明圆圈箭头（drawArrowBadge 下线）——
 *     方向改为朝向侧边缘内嵌流光胶囊角标（四向微色相区分 +
 *     白色双箭头纹，程序化渐变流光动画）
 *   · 图案居中完整展示零遮挡（Bestiary Sprite 消费 T052a）
 *   · 花色→图鉴渲染层映射（FR-033 §3——suit 整数仍为逻辑口径）
 *   · 离屏 Sprite 预渲染缓存（按 suit+尺寸档绘制一次会话内复用——
 *     8×8×5 层满载 105 滑块 60fps 预算）
 *
 * Δ15b/T052i 精灵图集支持（宪章 III v2.0.0——FR-033 §6）:
 *   · assets/icons/sheet{1..3}.png 4×4 合集大图（2048×2048——每格
 *     512×512）离屏切片: 每张仅取前 15 格（index 0~14 按行列序），
 *     跳过 row=3,col=3 第 16 格（右下角平台水印）
 *   · 单元格四周内缩 4% padding 防切到邻格阴影 → 绘制到独立
 *     128×128 缓存 Canvas → getImageData 白底 Alpha Keying
 *     （R>242&&G>242&&B>242 近纯白 → alpha 平滑过渡 0），
 *     贴图白底与奶油白 3D 牌面自然融合
 *   · 兼容单张 assets/icons/{0..44}.png；某张 sheet 缺失时对应阶段
 *     整体回退（单张 → Emoji 直渲染——bestiary.js EMOJI 码点表）
 *   · 渲染优先级: sheet 切片 > 单张 PNG > Emoji 字体直渲染
 *   · Dock 7 格收集槽 chip 同步消费切片后的 Sprite DataURL
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};
  var lastRendererApi = null;
  var RE = STM.RulesEngine;
  var Bestiary = STM.Bestiary; /* Δ14: 装载序保证先于 BoardRenderer */

  /* ---------- 花色表（兼容兜底：Bestiary 缺失时纯色回退——契约健壮性）
   * 逻辑 suit 值不再限 0~7: 渲染层经 mappingForLevel 映射至图鉴 id */
  var SUITS = [
    { name: '跳跳蛙', fill: '#7CC24B', deep: '#59922F' },
    { name: '小黄鸡', fill: '#FFD93B', deep: '#E8B41F' },
    { name: '小绵羊', fill: '#F0EDE6', deep: '#C9BEB0' },
    { name: '小奶牛', fill: '#F7F3EC', deep: '#CFC5B8' },
    { name: '三花猫', fill: '#F2A65A', deep: '#D2833B' },
    { name: '柴犬',   fill: '#F5B778', deep: '#D69552' },
    { name: '大熊猫', fill: '#E8E8E0', deep: '#2E2E34' },
    { name: '小狐狸', fill: '#F98E48', deep: '#D66E2A' }
  ];

  /* =========================================================
   * Δ14: 花色→图鉴视觉解析（渲染层映射——FR-033 §3）
   * suitOf(levelId, suit) → 图鉴条目（含 theme/draw/绘制函数）
   * 无 level 上下文时（旧自测关卡兜底）suit 直接索引前 8 图鉴
   * ========================================================= */
  var currentLevelId = null;   /* 主循环切换关时设置（main.js 经 setLevelId） */
  var currentMapping = {};     /* 会话级: suit → bestiaryId */

  function setSuitLevel(level) {
    currentLevelId = level ? level.id : null;
    currentMapping = (Bestiary && level) ? Bestiary.mappingForLevel(level) : {};
  }

  /* suit → {fill,deep,entry} 视觉解析（图案主色 + 图鉴条目） */
  function suitVisual(suit) {
    var bid = currentMapping[suit];
    if (bid != null && Bestiary) {
      var e = Bestiary.entry(bid);
      return { fill: e.theme, deep: shade(e.theme, -60), entry: e, bid: bid };
    }
    var s = SUITS[suit] || SUITS[suit % SUITS.length];
    return { fill: s.fill, deep: s.deep, entry: null, bid: null };
  }

  /* 颜色明度调节（hex ±amount——底晕/徽章深色派生） */
  function shade(hex, amt) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = Math.max(0, Math.min(255, parseInt(h.slice(0, 2), 16) + amt));
    var g = Math.max(0, Math.min(255, parseInt(h.slice(2, 4), 16) + amt));
    var b = Math.max(0, Math.min(255, parseInt(h.slice(4, 6), 16) + amt));
    return '#' + (r < 16 ? '0' : '') + r.toString(16) + (g < 16 ? '0' : '') + g.toString(16) + (b < 16 ? '0' : '') + b.toString(16);
  }

  /* =========================================================
   * Δ14/T052a: 离屏 Sprite 预渲染缓存
   * 键 = bestiaryId × 尺寸档（2px 步进量化——尺寸档收敛缓存数）
   * 值 = offscreen canvas（径向柔光底晕 + 图鉴图案 + 浮雕阴影）
   * 每档绘制一次、会话内复用（105 滑块满载 60fps 预算）
   * ========================================================= */
  var spriteCache = {};
  var SPRITE_PAD = 1.55; /* 相对 R 的画布内边距（容纳底晕+阴影） */
  var dockIconCache = {}; /* Δ15: Dock chip DataURL 缓存（贴图就绪 bump 失效） */

  /* Δ15b3e（Bug A 修复）: 一次性告警（同一 key 只报一次——防 45 格刷屏）。
   * 原实现在 file:// 下静默失败 45 次却零可观测信号，是该缺陷长期
   * 未被发现的直接原因；降级路径必须留痕。 */
  var warned = {};
  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console.warn) console.warn('[STM]', msg);
  }

  function getSprite(bid, sizePx) {
    if (!Bestiary || bid == null) return null;
    var band = Math.max(8, Math.round(sizePx / 2) * 2); /* 2px 档量化 */
    var key = bid + '×' + band;
    var hit = spriteCache[key];
    if (hit) return hit;
    if (typeof document === 'undefined') return null; /* Node 自测无 DOM——直绘路径 */
    var cv = document.createElement('canvas');
    var w = Math.ceil(band * SPRITE_PAD);
    cv.width = w; cv.height = w;
    var c2 = cv.getContext('2d');
    var R = band * 0.5;
    var e = Bestiary.entry(bid);
    /* Δ15b/T052i: 贴图切片优先（sheet/single 白键控 128×128——高清放大至 band） */
    var src = IconAssets.sliceCanvasOf(bid);
    if (src) {
      var sz = band * 0.96; /* 切片近满幅（圆角遮罩内） */
      var off = (w - sz) / 2;
      c2.drawImage(src, off, off, sz, sz);
      /* 记录切片内容框——drawBestiaryIcon 按其裁剪，让图标真实铺满卡面 */
      cv.__sliceRect = { x: off, y: off, w: sz, h: sz };
      spriteCache[key] = cv;
      return cv;
    }
    /* Emoji 兜底（bestiary.js EMOJI 码点表——ctx.fillText 原生全彩直渲染；
     * 严禁 ctx.arc 手绘圆球——宪章 III v2.0.0 红线） */
    if (Bestiary.EMOJI && Bestiary.EMOJI.length === 45) {
      var ch = Bestiary.emojiOf(bid);
      var fs = Math.round(band * 0.92);
      c2.font = 'bold ' + fs + "px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      try { c2.fillText(ch, w / 2, w / 2 + fs * 0.06); } catch (err) { /* 字体缺失不杀帧 */ }
      spriteCache[key] = cv;
      return cv;
    }
    /* 程序化绘制最后兜底（Δ14 产出——贴图与 Emoji 均不可用时） */
    /* 1. 径向柔光底晕（主题色 18% → 透明） */
    var g = c2.createRadialGradient(w / 2, w / 2, R * 0.2, w / 2, w / 2, R * 1.3);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.45, hexA(e.theme, 0.30));
    g.addColorStop(1, hexA(e.theme, 0));
    c2.fillStyle = g;
    c2.beginPath(); c2.arc(w / 2, w / 2, R * 1.3, 0, Math.PI * 2); c2.fill();
    /* 2. 浮雕 Drop Shadow（下右偏移柔和投影） */
    c2.save();
    c2.shadowColor = 'rgba(80, 96, 115, 0.38)';
    c2.shadowBlur = R * 0.22;
    c2.shadowOffsetX = R * 0.07;
    c2.shadowOffsetY = R * 0.1;
    /* 3. 图鉴图案主体 */
    try { Bestiary.DRAW[e.draw](c2, w / 2, w / 2, R * 0.88); } catch (err) { /* 图案异常不杀渲染 */ }
    c2.restore();
    spriteCache[key] = cv;
    return cv;
  }

  /* hex → rgba 透明度混合 */
  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* =========================================================
   * Δ15b/T052i: IconAssets — 精灵图集加载 / 离屏切片 / 白底柔化
   * 优先级: sheet{1..3}.png 切片 > 单张 {suit}.png > Emoji 兜底
   * 全部 Image 相对路径 + onerror 降级（file:// 与静态服务一致）
   * ========================================================= */
  var IconAssets = (function () {
    /* 渲染来源状态: bid → 'sheet' | 'single' | 'emoji'
     * 'pending' 未就绪（Emoji 先行渲染、就绪后惰性换装——FR-033 §6 不闪烁） */
    var source = {};      /* bestiaryId → 'pending'|'sheet'|'single'|'emoji' */
    var slices = {};      /* bestiaryId → 128×128 白底柔化切片 Canvas */
    var sheetCount = 0;   /* 已就绪 sheet 张数（0~3） */
    var sheetLoadStarted = false;

    /* Δ15b3e（Bug B 修复）: 切片分辨率 128→256。单格源 512×512，
     * 128 档丢弃 87.5% 像素且在 DPR≥2 真机上逼近源分辨率而被迫插值。
     * 256 档在 8×8×DPR2（图标绘制约 150px）下仍有余量，且切片总数仅 45。 */
    var SLICE_PX = 256;
    /* 白键控可用性: getImageData 首次成功即确认；file:// 跨源污染下为 false，
     * 此时贴图保留不透明白底——由 drawBestiaryIcon 用 darken 合成把白底
     * 融进卡面（见该函数注释），避免「内嵌白方框」露出。 */
    var keyingOk = true;
    var SHEETS = [
      { file: 'assets/icons/sheet1.png', base: 0,  count: 15 },
      { file: 'assets/icons/sheet2.png', base: 15, count: 15 },
      { file: 'assets/icons/sheet3.png', base: 30, count: 15 }
    ];

    function hasDOM() { return typeof document !== 'undefined' && typeof Image !== 'undefined'; }

    /* ---- 白底 Alpha Keying（getImageData 像素处理）----
     * 近纯白（R>242&&G>242&&B>242）→ alpha 平滑过渡为 0:
     *   亮度越接近 242 → alpha 线性降（242~252 柔化带），
     *   >252 纯白 → alpha 归 0；同时羽化带做 alpha 预乘防白边
     * 切片后贴图与奶油白牌面乘性自然融合（无矩形白底残留） */
    function whiteKeySlice(img, cellIndex) {
      const cellW = img.width / 4;          /* 4×4 网格单元格宽 */
      const cellH = img.height / 4;         /* 4×4 网格单元格高 */
      const padX = Math.round(cellW * 0.035);
      const padY = Math.round(cellH * 0.035);
      const row = Math.floor(cellIndex / 4);
      const col = cellIndex % 4;
      const sx = Math.round(col * cellW) + padX;
      const sy = Math.round(row * cellH) + padY;
      const sw = Math.round(cellW) - padX * 2;
      const sh = Math.round(cellH) - padY * 2;
      /* Δ15b3e（Bug B 修复）: 切片分辨率 128→256（Dock/棋盘双层消费——
       * drawImage 高质量缩放，2x 超采样下仍留有余量） */
      var S = SLICE_PX;
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var c2 = cv.getContext('2d');
      c2.imageSmoothingEnabled = true;
      c2.imageSmoothingQuality = 'high'; /* 高质量降采样——边缘锐利不发糊 */
      c2.drawImage(img, sx, sy, sw, sh, 8, 8, 240, 240);
      /* 圆角遮罩（软边——融入奶油白 3D 牌面） */
      maskRounded(c2, S);
      /* 白键控。Δ15b3e（Bug A 修复）: file:// 下画布被跨源污染，
       * getImageData 必抛 SecurityError——此时静默保留圆角白底切片
       * （棋盘/Dock 仍与同一张切片同源，视觉一致）；
       * 首次失败告警一次，不静默吞异常（可观测性）。 */
      try {
        var d = c2.getImageData(0, 0, S, S);
        var px = d.data;
        for (var i = 0; i < px.length; i += 4) {
          var lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
          if (px[i] > 242 && px[i + 1] > 242 && px[i + 2] > 242) {
            /* 柔化带: 242~246 线性衰减; ≥246 全透明（主体高光≠纯白免误杀） */
            var t = (248 - Math.max(px[i], px[i + 1], px[i + 2])) / 6;
            var a = Math.max(0, Math.min(1, t));
            px[i + 3] = Math.round(px[i + 3] * a * a); /* 平方——边缘过渡更利落 */
          } else if (lum > 238 && px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235) {
            /* 次亮羽化带: 轻微降 alpha 消白边 */
            px[i + 3] = Math.round(px[i + 3] * 0.45);
          }
          /* 边缘 10px 羽化：高亮近白/浅米色背景像素柔和透明 */
          var _idx = i / 4;
          var _ex = _idx % S;
          var _ey = Math.floor(_idx / S);
          var _edgeDist = Math.min(_ex, _ey, S - 1 - _ex, S - 1 - _ey);
          if (_edgeDist < 10 && lum > 220) {
            var _ef = _edgeDist / 10;
            px[i + 3] = Math.round(px[i + 3] * _ef * _ef);
          }

        }
        c2.putImageData(d, 0, 0);
        keyingOk = true;
      } catch (err) {
        keyingOk = false;
        warnOnce('IconAssets', '白底 Alpha Keying 不可用（' + (err && err.name || 'err') +
          '）——file:// 跨源污染或受限环境；贴图保留圆角白底，绘制时改用 darken 合成融入卡面');
      }
      return cv;
    }

    /* 圆角软遮罩: destination-in 圆角矩形（清除四角硬边） */
    function maskRounded(c2, size) {
      c2.globalCompositeOperation = 'destination-in';
      var r = size * 0.12;
      c2.beginPath();
      c2.moveTo(r, 0);
      c2.arcTo(size, 0, size, size, r);
      c2.arcTo(size, size, 0, size, r);
      c2.arcTo(0, size, 0, 0, r);
      c2.arcTo(0, 0, size, 0, r);
      c2.closePath();
      c2.fill();
      c2.globalCompositeOperation = 'source-over';
    }

    /* sheet 加载成功 → 逐格切片 15 枚 + 注册来源 */
    function registerSheet(img, base) {
      for (var i = 0; i < 15; i++) {
        try {
          slices[base + i] = whiteKeySlice(img, i);
          source[base + i] = 'sheet';
        } catch (err) { /* 单格失败不杀整张 */ }
      }
    }

    function statusOf(bid) {
      var s = source[bid];
      return s || 'emoji';
    }

    function sliceCanvasOf(bid) {
      return slices[bid] || null;
    }

    /* 惰性加载入口: 首帧绘制前调用（浏览器环境一次；Node 自测直接空转） */
    function ensureLoaded() {
      if (sheetLoadStarted || !hasDOM()) return;
      sheetLoadStarted = true;
      for (var s = 0; s < SHEETS.length; s++) {
        loadSheet(SHEETS[s]);
      }
    }

    function loadSheet(cfg) {
      var img = new Image();
      img.onload = function () {
        if (img.naturalWidth >= 64) { /* 有效性下限（防御空图/损坏图） */
          registerSheet(img, cfg.base);
          sheetCount++;
          bumpSprites();
        }
      };
      img.onerror = function () { /* sheet 缺失 → 对应阶段回退单张/Emoji */ };
      img.src = cfg.file;
    }

    /* 单张 PNG 兜底加载（sheet 缺失阶段）——按需惰性: 仅无贴图来源的条目
     * 逐条目独立探测（singleTried 会话级防重——不闪烁纪律） */
    function ensureSinglesFor(bids) {
      if (!hasDOM()) return;
      for (var i = 0; i < bids.length; i++) {
        (function (bid) {
          if (source[bid] === 'sheet' || source[bid] === 'single') return; /* 已有更优来源 */
          if (singleTried[bid]) return;
          singleTried[bid] = true;
          var img = new Image();
          img.onload = function () {
            if (img.naturalWidth >= 16) {
              slices[bid] = whiteKeySliceSq(img);
              source[bid] = 'single';
              bumpSprites();
            }
          };
          /* Δ15b3e（Bug A 修复）: onerror 不得无条件覆写来源——sheet 的 onload
     * 与单张探测存在竞态（ensureSinglesFor 先于 sheet 就绪发起时，单张
     * 404 的 onerror 会把已由 sheet 覆盖的条目误标为 'emoji'，实测
     * 45 条中 5 条 source='emoji' 却 hasSlice=true 的不一致即源于此）。
     * 仅当条目确无更优来源时才降级。 */
          img.onerror = function () {
            if (source[bid] !== 'sheet' && source[bid] !== 'single') source[bid] = 'emoji';
          };
          img.src = 'assets/icons/' + bid + '.png';
        })(bids[i]);
      }
    }

    /* 单张整图切片（无网格切分——直接 4% 内缩 + 白键控） */
    function whiteKeySliceSq(img) {
      var SS = Math.min(img.naturalWidth, img.naturalHeight);
      var PAD = Math.round(SS * 0.035);
      var S = SLICE_PX; /* Δ15b3e（Bug B 修复）: 128→256 */
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var c2 = cv.getContext('2d');
      c2.imageSmoothingEnabled = true;
      c2.imageSmoothingQuality = 'high';
      c2.drawImage(img, PAD, PAD, SS - PAD * 2, SS - PAD * 2, 8, 8, 240, 240);
      maskRounded(c2, S);
      try {
        var d = c2.getImageData(0, 0, S, S);
        var px = d.data;
        for (var i = 0; i < px.length; i += 4) {
          if (px[i] > 242 && px[i + 1] > 242 && px[i + 2] > 242) {
            var t = (248 - Math.max(px[i], px[i + 1], px[i + 2])) / 6;
            var a = Math.max(0, Math.min(1, t));
            px[i + 3] = Math.round(px[i + 3] * a * a);
          }
        }
        c2.putImageData(d, 0, 0);
        keyingOk = true;
      } catch (err) {
        keyingOk = false;
        warnOnce('IconAssets', '单张贴图白键控不可用——保留圆角白底切片（darken 合成融入卡面）');
      }
      return cv;
    }

    var singleTried = {};

    /* 贴图就绪 → Sprite 缓存失效 + 通知注册的渲染器重绘（惰性换装——本关内生效） */
    var listeners = [];
    function bumpSprites() {
      for (var k in spriteCache) delete spriteCache[k];
      dockIconCache = {};
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](); } catch (err) { /* 单监听异常不杀加载 */ }
      }
    }

    return {
      ensureLoaded: ensureLoaded,
      ensureSinglesFor: ensureSinglesFor,
      statusOf: statusOf,
      sliceCanvasOf: sliceCanvasOf,
      /* false = file:// 等受限环境下白键控失败（切片仍带不透明白底） */
      keyingAvailable: function () { return keyingOk; },
      sheetCount: function () { return sheetCount; },
      SHEETS: SHEETS,
      onSpritesReady: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
      _test: { source: source, slices: slices, registerSheet: registerSheet, whiteKeySlice: whiteKeySlice }
    };
  })();

  /* ---------- 动效参数 ---------- */
  var FLY_MS = 420;        /* 飞出动画 */
  var BLOCK_MS = 360;      /* 受阻弹回 */
  var REVEAL_MS = 380;     /* Δ7 次顶层暴露上浮 */
  var REVEAL_DELAY = 180;  /* Δ7 上浮延迟（等飞出滑块让位） */
  var PARTICLE_LIFE = 600; /* 三消粒子 */
  var GAP = 1;               /* T081: 同层零缝隙紧凑排布——相邻滑块间距 1px */
  var SHARD_LIFE_MIN = 650;  /* T082: 白瓷碎片生命周期 ms */
  var SHARD_LIFE_MAX = 900;
  var SHARD_COUNT_MIN = 48;
  var SHARD_COUNT_MAX = 60;  /* T084: 碎片数 MUST 落入 45~60 区间（Δ19e/FR-049） */
/* Δ20/T093: 顶部待消槽全屏白瓷碎片瀑布（3 槽 × 45 = 135 枚） */
var DOCK_SHARD_PER_SLOT = 50;
var DOCK_SHARD_TOTAL = 150;
var DOCK_SHARD_LIFE_MIN = 750;
var DOCK_SHARD_LIFE_MAX = 950;
var DOCK_SHARD_GRAVITY = 950; /* px/s² */

  /* ---------- 通用工具 ---------- */
  var RENDER_DPR = 1;
  function dprSafe(v) { return RENDER_DPR * v; }

  function roundRect(ctx, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* =========================================================
   * 单一几何出口 —— 绘制 / 命中 / 教学锚点共用（ingame-hud-render-defects）
   * 坐标系 = CSS 像素（draw() 已 setTransform(dpr,0,0,dpr,0,0)）。
   *   · 偶数层（z = 0, 2, 4）: 左上角 = (c * cellStep, r * cellStep)
   *   · 奇数层（z = 1, 3）:    左上角 = ((c + 0.5) * cellStep, (r + 0.5) * cellStep)
   * tileSize = cellStep - 1 → 同层相邻卡牌仅 1px 细缝，紧密贴合。
   * 命中测试禁止再自行换算 dpr——本函数返回什么，就点什么。
   * ========================================================= */
  function tileGridOf(t) {
    var z = t.z || 0;
    return {
      rr: (t.rr != null ? t.rr : (z % 2 === 1 ? t.r + 0.5 : t.r)),
      cc: (t.cc != null ? t.cc : (z % 2 === 1 ? t.c + 0.5 : t.c))
    };
  }

  function getTileCssRect(tile, layout) {
    var g = tileGridOf(tile);
    var s = layout.cellStep;
    return {
      x: layout.originX + g.cc * s,
      y: layout.originY + g.rr * s,
      w: layout.tileSize,
      h: layout.tileSize
    };
  }

  /* 径向渐变快捷：stops = [offset, color, offset, color, ...] */
  function rg(ctx, x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }

  /* =========================================================
   * 奶油白 3D 圆角底板（ingame-hud-render-defects 重做）
   *   · 干净奶油白面板 + 底部 3px 浅灰立体厚度边（唯一边缘）
   *   · 圆角 r = tileSize * 0.18；同层相邻卡牌仅留 1px 细缝
   *   · 动物图标 iconSize = tileSize * 0.84（居中饱满，留白最小）
   *   · 已彻底移除：被压变暗遮罩、层间环境阴影块、内嵌白描边、
   *     堆叠 layerOff 双叠加 —— 层次仅靠卡牌自身柔和投影表达
   * px,py 牌中心（CSS 像素——draw() 已按 dpr 建立缩放矩阵）
   * ========================================================= */
  function drawTileBody(ctx, cell, px, py, t, scale, alpha, nowMs) {
    var sv = suitVisual(t.s);
    scale = scale || 1;
    alpha = alpha == null ? 1 : alpha;
    var w = Math.max(1, cell - GAP) * scale; /* tileSize = cellStep - 1 */
    var r = Math.round(w * 0.20);
    var x = px - w / 2;
    var y = py - w / 2;
    ctx.globalAlpha = alpha;
    /* 1. 底部 4px 立体厚度层 */
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y + 4, w, w, r);
    ctx.fillStyle = '#CBD5E1';
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    /* 2. 温润奶油白牌面 */
    var fg = ctx.createLinearGradient(x, y, x, y + w);
    fg.addColorStop(0, '#FFFFFF');
    fg.addColorStop(1, '#F8FAFC');
    roundRect(ctx, x, y, w, w, r);
    ctx.fillStyle = fg;
    ctx.fill();
    /* 顶部内侧 1px 纯白高光边 */
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1, y + 1, w - 2, w - 2, Math.max(1, r - 1));
    ctx.stroke();
    /* 外侧 1px solid #E2E8F0 柔和边界 */
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, w, r);
    ctx.stroke();
    /* 3. 图鉴图案 */
    drawBestiaryIcon(ctx, sv, x + w / 2, y + w / 2, Math.round(w * 0.82));
    /* 零偏移原位被压变暗 */
    // covered = RulesEngine.isCovered(state, tile) 或 probe.covered
    var covered = (t && t.covered === true);
    if (covered === true) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      roundRect(ctx, x, y, w, w, r);
      ctx.fill();
      ctx.restore();
    }
    /* 4. 边缘嵌入式方向角标 */
    drawWingBadge(ctx, t.d, x, y, w, cell, sv, nowMs);
    /* 5. T034 机制角标 */
    if (t.m === 'g') drawGearBadge(ctx, x, y, w, cell);
    else if (t.m === 'i') drawIceOverlay(ctx, x, y, w, cell, t.ice != null ? t.ice : (t.x || 1));
    else if (t.m === 'k') drawKeyBadge(ctx, x, y, w, cell);
    else if (t.m === 'c') drawChainCorners(ctx, x, y, w, cell);
    ctx.globalAlpha = 1;
  }

  function drawBestiaryIcon(ctx, sv, cx, cy, iconSize) {
    var R = iconSize / 2;
    if (sv.bid != null) {
      IconAssets.ensureLoaded(); /* 惰性启动贴图加载（首绘触发） */
      if (!IconAssets.sliceCanvasOf(sv.bid)) {
        IconAssets.ensureSinglesFor([sv.bid]); /* sheet 未覆盖 → 单张按需探测 */
      }
      var slice = IconAssets.sliceCanvasOf(sv.bid);
      if (slice) {
        var noKeyS = !IconAssets.keyingAvailable();
        if (noKeyS) { ctx.save(); ctx.globalCompositeOperation = 'darken'; }
        ctx.drawImage(slice, 0, 0, slice.width, slice.height, Math.round(cx - iconSize / 2), Math.round(cy - iconSize / 2), iconSize, iconSize);
        if (noKeyS) ctx.restore();
        return;
      }
      var sp = getSprite(sv.bid, iconSize);
      if (sp) {
        var sr = sp.__sliceRect || { x: 0, y: 0, w: sp.width, h: sp.height };
        /* file:// 等环境无法逐像素扣白底 → 用 darken 合成：纯白像素与卡面
         * 取 min 后退化为卡面本色（白底「隐形」），彩色/深色主体基本无变化。
         * http 正常态仍走 source-over，零行为漂移。 */
        var noKey = !IconAssets.keyingAvailable();
        if (noKey) { ctx.save(); ctx.globalCompositeOperation = 'darken'; }
        ctx.drawImage(sp, sr.x, sr.y, sr.w, sr.h, Math.round(cx - iconSize / 2), Math.round(cy - iconSize / 2), iconSize, iconSize);
        if (noKey) ctx.restore();
        return;
      }
    }
    if (sv.entry && Bestiary && Bestiary.DRAW[sv.entry.draw]) {
      /* 直绘兜底（径向柔光底晕 + 图案） */
      var g = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 1.35);
      g.addColorStop(0, 'rgba(255,255,255,0.4)');
      g.addColorStop(0.5, hexA(sv.entry.theme, 0.28));
      g.addColorStop(1, hexA(sv.entry.theme, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2); ctx.fill();
      try { Bestiary.DRAW[sv.entry.draw](ctx, cx, cy, R * 0.95); } catch (err) { /* 单图案异常不杀帧 */ }
    } else {
      /* 极端兜底：色相圆点（无 Bestiary 环境） */
      ctx.fillStyle = sv.fill;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(cx - R * 0.2, cy - R * 0.2, R * 0.18, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* =========================================================
   * Δ15c/T052i: 方向角标重做——单枚锐利宽翼实心三角箭头
   * （替代 Δ14 流光胶囊「猪鼻子」造型: 胶囊椭圆底 + 双点/双三角纹全废）
   * · 位置: 滑块朝向边缘内侧正中，距边缘 3px
   * · 造型: 单枚宽翼实心三角（翼宽 ≈ 1.5× 高，锐角顶点指向 d）
   * · 描边: 1.5px 纯白（深色底块上高对比）
   * · 纯视觉替换——方向语义/hitTest/动画坐标零变化
   *
   * Δ15b3e（Bug C 修复）: 填充由纯白 #FFFFFF 改为【四向高饱和主题色】。
   * 实测原实现箭头区域亮度跨度仅 2.9（卡面亮度 255）——纯白填充 + 纯白
   * 描边落在 #FFFFFF→#F4F7FB 奶油白卡面上，等于零对比，方向不可辨。
   * 现为四向主题色 + 1.5px 纯白描边（白描边保留原美术意图且此时
   * 描边跨在彩-白交界处反而增强轮廓锐度）。
   * ========================================================= */
  /* 四向主题色（d=0 上 U / 1 右 R / 2 下 D / 3 左 L） */
  var DIR_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6'];

  function drawWingBadge(ctx, d, x, fz, w, cell, sv, nowMs) {
    var v = RE.DIR_VEC[d];
    var cx = x + w / 2 + v.dc * (w / 2 - dprSafe(4)); /* T081: 距外边框 4px 内侧安全区 */
    var cy = fz + w / 2 + v.dr * (w / 2 - dprSafe(4));
    var hgt = Math.max(cell * 0.20, dprSafe(5)); /* 三角高（沿指向轴）——Δ11 分级下限 */
    var wid = hgt * 1.6; /* 宽翼: 翼展 ≈ 1.6× 高 */
    ctx.save();
    ctx.translate(cx, cy);
    /* 局部造型顶点朝 -y（北），rotate(d*90°) 映射到 DIR_VEC:
     * d=0(U 北)→0° / d=1(R 东)→90°(顺时针) / d=2(D 南)→180° / d=3(L 西)→270°
     * （canvas y 轴向下——顺时针为正） */
    ctx.rotate(d * Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -hgt * 0.5);          /* 锐角顶点（指向边缘） */
    ctx.lineTo(-wid / 2, hgt * 0.5);     /* 左翼根（宽翼张开） */
    ctx.lineTo(0, hgt * 0.28);           /* 尾部内凹（锐利感） */
    ctx.lineTo(wid / 2, hgt * 0.5);      /* 右翼根 */
    ctx.closePath();
    ctx.fillStyle = DIR_COLORS[d] || '#10B981'; /* Δ15b3e（Bug C）: 四向主题色 */
    ctx.fill();
    ctx.lineWidth = Math.max(dprSafe(1.5), 1);
    ctx.strokeStyle = 'rgba(255,255,255,1)'; /* 1.5px 纯白描边（保留） */
    ctx.stroke();
    ctx.restore();
  }

  /* T034 齿轮角标: 右上小齿轮图形 + 深色描边底（FR-014 旋转机制可视化） */
  function drawGearBadge(ctx, x, fz, w, cell) {
    var cx = x + w - cell * 0.10;
    var cy = fz + cell * 0.10;
    var r = cell * 0.075;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(52,58,64,0.85)';
    ctx.fill();
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var rr = i % 2 === 0 ? r : r * 0.62;
      var px = cx + Math.cos(a) * rr;
      var py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#E8D9A0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,58,64,0.9)';
    ctx.lineWidth = Math.max(1, dprSafe(0.8));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(52,58,64,0.9)';
    ctx.fill();
  }

  /* T034 冰封覆层: 半透明冰蓝覆盖 + 冰层厚度数字 + 裂纹层数（FR-017） */
  function drawIceOverlay(ctx, x, fz, w, cell, layers) {
    ctx.beginPath();
    roundRect(ctx, x + dprSafe(1), fz + dprSafe(1), w - dprSafe(2), w - dprSafe(2), cell * 0.12);
    ctx.fillStyle = 'rgba(190,225,255,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,190,235,0.9)';
    ctx.lineWidth = Math.max(1.2, dprSafe(1.4));
    ctx.stroke();
    /* 裂纹: 层数愈多愈密（封顶 3 层图样） */
    var cracks = Math.max(1, Math.min(3, layers));
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(0.8, dprSafe(0.9));
    for (var ci = 0; ci < cracks; ci++) {
      var oy = fz + w * (0.30 + ci * 0.16);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, oy);
      ctx.lineTo(x + w * 0.40, oy + w * 0.06);
      ctx.lineTo(x + w * 0.62, oy - w * 0.03);
      ctx.lineTo(x + w * 0.82, oy + w * 0.05);
      ctx.stroke();
    }
    /* 厚度数字: 右下角 */
    if (layers > 1) {
      ctx.fillStyle = 'rgba(30,90,150,0.95)';
      ctx.font = 'bold ' + Math.max(9, Math.floor(cell * 0.20)) + 'px system-ui,sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(layers), x + w - cell * 0.06, fz + w - cell * 0.04);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
  }

  /* T034 锁链四角链条角标（配对钥匙飞出后全链解开——FR-019/020） */
  function drawChainCorners(ctx, x, fz, w, cell) {
    var r = Math.max(2, cell * 0.045);
    var pts = [
      [x + cell * 0.07, fz + cell * 0.07],
      [x + w - cell * 0.07, fz + cell * 0.07],
      [x + cell * 0.07, fz + w - cell * 0.07],
      [x + w - cell * 0.07, fz + w - cell * 0.07]
    ];
    ctx.strokeStyle = 'rgba(70,80,92,0.95)';
    ctx.lineWidth = Math.max(1.6, dprSafe(1.8));
    for (var i = 0; i < pts.length; i++) {
      var cx = pts[i][0], cy = pts[i][1];
      ctx.beginPath();
      ctx.arc(cx - r * 0.6, cy, r, Math.PI / 2, Math.PI * 1.5);
      ctx.arc(cx + r * 0.6, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + r, pts[0][1]);
    ctx.lineTo(pts[1][0] - r * 1.6, pts[1][1]);
    ctx.moveTo(pts[2][0] + r, pts[2][1]);
    ctx.lineTo(pts[3][0] - r * 1.6, pts[3][1]);
    ctx.strokeStyle = 'rgba(70,80,92,0.6)';
    ctx.stroke();
  }

  /* T034 钥匙角标: 左上钥匙图形（FR-020 辨识） */
  function drawKeyBadge(ctx, x, fz, w, cell) {
    var cx = x + cell * 0.11;
    var cy = fz + cell * 0.11;
    var s = cell * 0.055;
    ctx.beginPath();
    ctx.arc(cx - s * 0.5, cy, s * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#F5B301';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,0,0.9)';
    ctx.lineWidth = Math.max(1, dprSafe(1));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.4, cy);
    ctx.lineTo(cx + s * 1.9, cy);
    ctx.moveTo(cx + s * 1.1, cy);
    ctx.lineTo(cx + s * 1.1, cy + s * 0.55);
    ctx.moveTo(cx + s * 1.7, cy);
    ctx.lineTo(cx + s * 1.7, cy + s * 0.55);
    ctx.stroke();
  }


  /* =========================================================
   * Renderer 工厂
   * ========================================================= */
  function createBoardRenderer(canvas, session, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    /* Δ15b3e（Bug B 修复）: DPR 2x 下限超采样——即便 DPR=1 屏也按 2 倍
     * 物理像素渲染，图标/箭头边缘在高分屏与普通屏均锐利（评估实测原实现
     * DPR=1 时 1 CSS px = 1 位图像素，零超采样余量）。 */
    var dpr = Math.max(2, global.devicePixelRatio || 1);
    /* ingame-hud-render-defects: 绘制坐标系改为 **CSS 像素**——
     * draw() 每帧 setTransform(dpr,0,0,dpr,0,0)，所有几何量（cellStep /
     * tileSize / 粒子速度）均以 CSS px 表达，再由矩阵统一放大到物理像素。
     * 因此 dprSafe() 不再需要二次乘 dpr（乘了会在 DPR=2 屏上放大 2 倍）。 */
    RENDER_DPR = 1;
    /* Δ15b3e（Bug B 修复）: 显式高质量插值——实测浏览器默认
     * imageSmoothingQuality='low'，是图标边缘发糊的最直接成因。 */
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    var cell = 0;
    var boardPx = 0;
    var cssSize = 0;   /* 画布逻辑边长（CSS px）——绘制/命中/教学锚点唯一量纲 */
    /* 唯一布局对象：getTileCssRect(tile, layout) 的唯一输入 */
    var layout = { originX: 0, originY: 0, cellStep: 0, tileSize: 0, n: 0 };
    /* Δ15b3f: 幂等守卫用——lastSideCss 为上次采用的 CSS 边长（与 boardPx
     * 的物理像素量纲不同，不可混用）；lastCellN 为上次算 cell 时的关卡尺寸。 */
    var lastSideCss = -1;
    var lastCellN = -1;
    var dirty = true;
    var running = false;
    var rafId = 0;
    var anims = [];        /* {kind:'fly'|'block'|'match'|'reveal', tileId, ...} */
    var particles = [];
    var shards = [];        /* T082: 白瓷多边形碎片池 */
    var vfxShards = [];     /* Δ20/T093: 全屏 #vfx-canvas 白瓷碎片瀑布池 */
    var vfxCanvas = null, vfxCtx = null;
    try {
      if (typeof document !== 'undefined') {
        vfxCanvas = document.getElementById('vfx-canvas');
        if (!vfxCanvas) {
          vfxCanvas = document.createElement('canvas');
          vfxCanvas.id = 'vfx-canvas';
          var app = document.getElementById('app');
          if (app) app.appendChild(vfxCanvas);
          else if (document.body) document.body.appendChild(vfxCanvas);
        }
        if (vfxCanvas) vfxCtx = vfxCanvas.getContext('2d');
      }
    } catch (eVfx) { vfxCanvas = null; vfxCtx = null; }
    var highlight = -1;    /* Hint 高亮（M4 T055） */
    var highlightIds = []; /* Δ19e/T087: 教学多目标高亮 */
    var highlightUntil = 0;  /* 高亮失效时间（ms）——M4 T055 自动 1.8s 清除 */
    function setHighlight(tileId, ttlMs) {
      highlight = tileId == null ? -1 : tileId;
      highlightIds = [];
      if (highlight >= 0 && ttlMs) {
        highlightUntil = nowMs() + ttlMs;
      } else {
        highlightUntil = 0;
      }
      markDirty();
    }
    /* Δ19e/T087: 一组教学目标高亮（ttlMs=0 表示常驻直到显式清除） */
    function setHighlights(ids, ttlMs) {
      highlight = -1;
      highlightIds = (ids || []).slice();
      highlightUntil = (highlightIds.length && ttlMs) ? (nowMs() + ttlMs) : 0;
      markDirty();
    }
    function tickHighlight(now) {
      if (highlightUntil > 0 && now > highlightUntil) {
        highlight = -1;
        highlightIds = [];
        highlightUntil = 0;
        return true;
      }
      return false;
    }
    var lastProbe = null;
    var tileInfo = {};     /* M1.6: id → {s,d,z,stackDepth} 视觉缓存（滑块移除后动画仍可绘制） */
    var revealAt = {};     /* Δ7: tileId → 上浮起始时刻（含延迟） */

    function nowMs() {
      return global.performance ? global.performance.now() : Date.now();
    }

    /* Δ15b3e（Bug B 修复）: 消除纵向拉伸
     * 实测原实现 #board 的 CSS 盒为 484×569（aspect-ratio:1/1 与
     * max-height:100% 冲突后被压成非正方形），而位图恒为 482×482 正方形
     * → 浏览器把正方形位图纵向拉伸 1.18×，图标随之拉长 + 低质插值发虚。
     * 修法: 正方形状由 **CSS 单向声明**（#board 的 aspect-ratio + width）
     * 保证，JS 侧只读容器尺寸算位图，绝不回写 canvas 的 CSS 宽高。
     *
     * Δ15b3f（回归修复）: 原 Δ15b3e 实现读了 canvas.clientWidth 再写回
     * canvas.style.width，构成「测量自身 → 缩小写回 → 再测量」的负反馈棘轮：
     * clientWidth 不含 2px 边框，写回 478 后浏览器重测得 476，每次
     * refresh（每个游戏事件）掉 2~4px，20 步内 480px → 176px 缩成一小团。
     * 本版铁律：
     *   ① 尺寸来源只能是**父容器** #board-wrap（不受本函数写入影响）；
     *   ② 任何情况下都**不写** canvas.style.width/height（正方形状由 CSS 负责）；
     *   ③ 位图更新走 setSize()，仅在 side 真正变化时置位，幂等无抖动。 */
    function resize() {
      var wrap = canvas.parentElement;              /* #board-wrap */
      var availW = wrap ? wrap.clientWidth : 0;
      var availH = wrap ? wrap.clientHeight : 0;
      /* NaN 防御：Node 自测桩的 parentElement 可能缺 clientHeight；
       * 非有限值一律回落到 320（不可让 NaN 流入 cell → arc(NaN) 抛错）。 */
      if (!isFinite(availW)) availW = 320;
      if (!isFinite(availH)) availH = 320;
      if (availW <= 0) availW = 320;
      if (availH <= 0) availH = 320;
      /* 容器 padding 已在 clientWidth 内扣除——此处再留 8px 呼吸位 */
      availW -= 8;
      availH -= 8;
      if (availW <= 0) availW = 320;
      if (availH <= 0) availH = 320;
      /* 正方形边长取容器短边；下限 280 防极小屏塌缩 */
      var side = Math.max(280, Math.floor(Math.min(availW, availH)));
      /* 幂等守卫须比对 **CSS 边长**（lastSideCss），不能拿物理像素
       * boardPx（= side × dpr）比——两者量纲不同，会导致守卫永不命中。
       * lastCellN 记录上次计算 cell 时用的关卡尺寸：换关时 n 变化，
       * 即使位图未变也需重算 cell，否则 cell 会停在上一个关卡的值。 */
      if (side === lastSideCss && canvas.width === Math.round(side * dpr) &&
          lastCellN === (lastProbe ? lastProbe.n : 0)) {
        /* 尺寸未变——直接返回，避免无谓的位图重设（重设会清空画布） */
        return;
      }
      lastSideCss = side;
      lastCellN = lastProbe ? lastProbe.n : 0;
      setBitmapSize(side);
      computeLayout(lastCellN || 5);
      markDirty();
    }

    /* 布局唯一入口：CSS 像素方阵（origin 恒 0——画布即棋盘区域） */
    function computeLayout(n) {
      cell = n > 0 ? cssSize / n : 0;
      layout = {
        originX: 0,
        originY: 0,
        cellStep: cell,
        tileSize: Math.max(1, cell - GAP), /* 同层相邻卡牌仅 1px 细缝 */
        n: n
      };
    }

    /* 位图尺寸设定（幂等 + 变换矩阵绝对重置）。
     * canvas.width/height 赋值本身即清空画布并重置全部上下文状态，
     * 故必须在此统一重设采样质量与变换矩阵。
     * Node 自测的 2D 桩上下文无 setTransform——防御性跳过。 */
    function setBitmapSize(sideCss) {
      boardPx = Math.round(sideCss * dpr);
      cssSize = boardPx / dpr;
      if (canvas.width !== boardPx) canvas.width = boardPx;
      if (canvas.height !== boardPx) canvas.height = boardPx;
      /* 2D 上下文状态在位图重设后复位——显式重设（Δ15b3e） */
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      /* 变换矩阵绝对重置（Δ15b3f 防御）——严禁在任何循环里累加 ctx.scale() */
      if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function markDirty() { dirty = true; start(); }

    function start() {
      if (running) return;
      running = true;
      rafId = global.requestAnimationFrame(frame);
    }

    function frame(now) {
      running = false;
      /* M4 T055: 高亮 ttl 到期 → markDirty 重绘并清状态 */
      if (highlight >= 0 && tickHighlight(now)) dirty = true;
      var needMore = tick(now);
      if (needMore || dirty) {
        /* Δ12: 单帧绘制异常不杀 rAF 主循环（重排程置 finally——
         * 崩溃帧仅丢一帧画面，下一帧照常调度） */
        try {
          draw();
          try { drawVfx(); } catch (eVfx2) { /* vfx 异常不杀帧 */ }
        } catch (err) {
          if (global.console && console.error) console.error('[STM render]', err);
        } finally {
          dirty = false;
        }
      }
      if (needMore) start();
    }

    /* 动画推进；reveal 过期即移除 */
    function tick(now) {
      var active = false;
      var i;
      for (i = anims.length - 1; i >= 0; i--) {
        var a = anims[i];
        if ((now - a.t0) / a.dur >= 1) {
          if (a.kind === 'match') spawnParticles(a, now);
          /* Bug 2: 旧 #board 半透明碎片已禁用，仅 #vfx-canvas 瀑布 */
          if (a.kind === 'reveal') delete revealAt[a.tileId];
          anims.splice(i, 1);
          dirty = true; /* 动画结束时强制重绘（防“末帧静默”——M1.6 渲染缺陷修复） */
        } else active = true;
      }
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.12;
        p.life -= 16;
        if (p.life <= 0) particles.splice(i, 1);
      }
      for (i = shards.length - 1; i >= 0; i--) {
        var sh = shards[i];
        sh.x += sh.vx; sh.y += sh.vy;
        sh.vy += 0.22; /* 重力 */
        sh.rot += sh.vr;
        sh.life -= 16;
        if (sh.life <= 0) shards.splice(i, 1);
      }
      if (shards.length > 0) active = true;
      for (i = vfxShards.length - 1; i >= 0; i--) {
        var vsh = vfxShards[i];
        vsh.x += vsh.vx * 0.016;
        vsh.y += vsh.vy * 0.016;
        vsh.vy += DOCK_SHARD_GRAVITY * 0.016;
        vsh.rot += vsh.vr;
        vsh.life -= 16;
        if (vsh.life <= 0) vfxShards.splice(i, 1);
      }
      if (vfxShards.length > 0) active = true;
      if (particles.length > 0) active = true;
      return active;
    }

    /* 三消粒子：Δ14 图鉴主题色 12~20 个（单帧 ≤200） */
    function spawnShards(a, now) {
      var count = SHARD_COUNT_MIN + Math.floor(Math.random() * (SHARD_COUNT_MAX - SHARD_COUNT_MIN + 1));
      if (shards.length + count > 400) count = Math.max(0, 400 - shards.length);
      var cx = a.x != null ? a.x : cssSize / 2;
      var cy = a.y != null ? a.y : -cell;
      for (var i = 0; i < count; i++) {
        var ang = Math.random() * Math.PI * 2;
        var speed = 1.5 + Math.random() * 3.5;
        var verts = [];
        var n = 4 + Math.floor(Math.random() * 3); /* 4~6 边 */
        var r0 = 4 + Math.random() * 6;
        for (var v = 0; v < n; v++) {
          var a2 = (v / n) * Math.PI * 2 + Math.random() * 0.6;
          var rr = r0 * (0.7 + Math.random() * 0.6);
          verts.push({ x: Math.cos(a2) * rr, y: Math.sin(a2) * rr });
        }
        var life = SHARD_LIFE_MIN + Math.floor(Math.random() * (SHARD_LIFE_MAX - SHARD_LIFE_MIN));
        shards.push({
          x: cx, y: cy,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - 2, /* 向上炸开 */
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.25,
          verts: verts,
          life: life,
          life0: life
        });
      }
    }
      /* Δ20/T093: 顶部待消槽全屏白瓷碎片瀑布发射器 */
      function spawnDockShatter(slotRects) {
        slotRects = slotRects || [];
        for (var si = 0; si < slotRects.length; si++) {
          var rect = slotRects[si] || {};
          var rx = (rect.left != null ? rect.left : (rect.x != null ? rect.x : 0));
          var ry = (rect.top != null ? rect.top : (rect.y != null ? rect.y : 0));
          var rw = rect.width || rect.w || 1;
          var rh = rect.height || rect.h || 1;
          if (rw < 1) rw = 1; if (rh < 1) rh = 1;
          for (var i = 0; i < DOCK_SHARD_PER_SLOT; i++) {
            var n = 5 + Math.floor(Math.random() * 2); /* 5~6 边 */
            var r0 = 7 + Math.random() * 11; /* 7~18 px */
            var verts = [];
            for (var v = 0; v < n; v++) {
              var a2 = (v / n) * Math.PI * 2 + Math.random() * 0.6;
              var rr = r0 * (0.7 + Math.random() * 0.6);
              verts.push({ x: Math.cos(a2) * rr, y: Math.sin(a2) * rr });
            }
            var life = DOCK_SHARD_LIFE_MIN + Math.floor(Math.random() * (DOCK_SHARD_LIFE_MAX - DOCK_SHARD_LIFE_MIN + 1));
            vfxShards.push({
              x: rx + Math.random() * rw,
              y: ry + Math.random() * rh,
              vx: -220 + Math.random() * 280,   /* [-220, 60] px/s */
              vy: -120 + Math.random() * 300,   /* [-120, 180] px/s */
              rot: Math.random() * Math.PI * 2,
              vr: (Math.random() - 0.5) * 0.25,
              verts: verts,
              life: life,
              life0: life
            });
          }
        }
        markDirty();
        return vfxShards.length;
      }
      /* 三消粒子：Δ14 图鉴主题色 12~20 个（单帧 ≤200） */
      function spawnParticles(a, now) {
        var sv = suitVisual(a.suit);
        var count = 12 + Math.floor(Math.random() * 9);
        if (particles.length + count > 200) count = Math.max(0, 200 - particles.length);
        for (var i = 0; i < count; i++) {
          particles.push({
            x: a.x, y: a.y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.9) * 5,
            life: PARTICLE_LIFE * (0.6 + Math.random() * 0.6),
            color: sv.fill,
            size: 2 + Math.random() * 3
          });
        }
      }

    /* Δ14: 飞出白色推进云朵粒子（3 团柔白圆——沿路径尾部拖尾） */
    function drawFlyPuff(a, prog) {
      var seg = pathPos(a.path, Math.max(0, prog - 0.12));
      if (!seg) return;
      var px = (seg.c + 0.5) * cell;
      var py = (seg.r + 0.5) * cell;
      var fade = 1 - prog;
      var puffR = cell * (0.16 + 0.1 * (1 - fade));
      for (var i = 0; i < 3; i++) {
        var ang = i * 2.1 + prog * 4;
        var ox = Math.cos(ang) * cell * 0.1 * i;
        var oy = Math.sin(ang) * cell * 0.1 * i;
        ctx.globalAlpha = 0.32 * fade * (1 - i * 0.22);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px + ox, py + oy, puffR * (1 - i * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* Δ20/T093: 全屏 #vfx-canvas 白瓷碎片瀑布绘制 */
    function drawVfx() {
      if (!vfxCtx || !vfxCanvas) return;
      var dpr = Math.max(1, (typeof global !== 'undefined' && global.devicePixelRatio) || 1);
      var w = (typeof global !== 'undefined' && global.innerWidth) ? global.innerWidth : (vfxCanvas.clientWidth || 360);
      var h = (typeof global !== 'undefined' && global.innerHeight) ? global.innerHeight : (vfxCanvas.clientHeight || 640);
      if (!w || !h) { w = 360; h = 640; }
      var pxW = Math.max(1, Math.round(w * dpr));
      var pxH = Math.max(1, Math.round(h * dpr));
      if (vfxCanvas.width !== pxW) vfxCanvas.width = pxW;
      if (vfxCanvas.height !== pxH) vfxCanvas.height = pxH;
      if (typeof vfxCtx.setTransform === 'function') vfxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vfxCtx.clearRect(0, 0, w, h);
      for (var i = 0; i < vfxShards.length; i++) {
        var sh = vfxShards[i];
        var ratio = sh.life0 > 0 ? (sh.life / sh.life0) : 0;
        /* 前 85% 生命周期强制不透明 */
        var a = ratio > 0.15 ? 1.0 : (ratio / 0.15);
        if (a < 0) a = 0;
        vfxCtx.globalAlpha = a;
        vfxCtx.save();
        vfxCtx.translate(sh.x, sh.y);
        vfxCtx.rotate(sh.rot);
        /* 1. 银灰立体厚度底面（右下偏移 2.5px） */
        vfxCtx.shadowColor = 'rgba(15, 23, 42, 0.45)';
        vfxCtx.shadowBlur = 5;
        vfxCtx.shadowOffsetY = 3;
        vfxCtx.fillStyle = '#94A3B8';
        vfxCtx.beginPath();
        for (var ti = 0; ti < sh.verts.length; ti++) {
          var tv = sh.verts[ti];
          if (ti === 0) vfxCtx.moveTo(tv.x + 2.5, tv.y + 2.5);
          else vfxCtx.lineTo(tv.x + 2.5, tv.y + 2.5);
        }
        vfxCtx.closePath();
        vfxCtx.fill();
        /* 2. 纯白高光瓷面 */
        vfxCtx.shadowBlur = 0;
        vfxCtx.shadowOffsetY = 0;
        vfxCtx.fillStyle = (Math.cos(sh.rot) > 0 ? '#FFFFFF' : '#F1F5F9');
        vfxCtx.beginPath();
        for (var fi = 0; fi < sh.verts.length; fi++) {
          var fv = sh.verts[fi];
          if (fi === 0) vfxCtx.moveTo(fv.x, fv.y);
          else vfxCtx.lineTo(fv.x, fv.y);
        }
        vfxCtx.closePath();
        vfxCtx.fill();
        vfxCtx.lineWidth = 1.2;
        vfxCtx.strokeStyle = '#64748B';
        vfxCtx.stroke();
        vfxCtx.restore();
      }
      vfxCtx.globalAlpha = 1;
      vfxCtx.shadowBlur = 0;
    }

    /* ---------- 主绘制 ---------- */
    function draw() {
      /* ingame-hud-render-defects（Bug 1 根治）: 绘制坐标系 = CSS 像素。
       * 每帧绝对重设 dpr 矩阵（幂等），所有卡牌几何由 getTileCssRect 给出，
       * 与 hitTest 共用同一份 layout —— 点哪张牌就命中哪张牌。
       * Δ15b3f 铁律继续生效：绝不回写 canvas.style.width/height。 */
      if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);
      if (!lastProbe) return;
      var now = nowMs();
      var n = lastProbe.n;

      /* Δ15b3: 背景层已移出棋盘画布（STM.BackdropStage 全视口 #bg-canvas）——
       * 画布保持透明以透出背后高清风景图。
       *
       * Δ15b3e（Bug B 修复）: 原「磨砂暖白可读性层」（径向 veil
       * 0.10→0.18）已彻底移除。评估实测背景画布同区域亮度 201.6，
       * 而经 CSS 白纱 0.22 + backdrop-filter blur(3px) + 本 veil 三重
       * 叠加后升至 240.5 —— 背景被显著"提白"，观感即"雾蒙蒙"。
       * 现在画布完全透明，高清背景 100% 锐利通透透出；滑块可读性
       * 改由其自身的 3D 立体厚度边 + 深色底部投影承载（见
       * drawTileBody），不再依赖任何磨砂蒙版。
       *
       * ingame-hud-render-defects（Bug 2）: 原「点阵格线」灰点已彻底删除——
       * 棋盘上除卡牌外不绘制任何底色块/灰点，杜绝灰黑伪影。 */

      /* 棱镜（M1 关卡无——逻辑就绪，M2 T034 完整视觉） */
      drawPrisms(lastProbe.prisms);

      /* 棋盘滑块：z 升序（底层先画，顶层覆盖）——T081 阴影
       * M1.6 缺陷修复：reveal 目标滑块不跳过——由 drawBoardTile 内按 revealAt 插值上浮
       * （此前 animSet 跳过 + 动画层 continue → 下层滑块 560ms 隐形甚至永久隐形）
       * 飞出/弹回/三消源滑块已 removed，renderProbe 不含 → 无需 animSet 过滤 */
      /* 弹回动画滑块仍在棋盘（未 removed）——仅由动画层绘制，防静态层重影 */
      var blockSet = {};
      var i;
      for (i = 0; i < anims.length; i++) if (anims[i].kind === 'block') blockSet[anims[i].tileId] = true;
      var tiles = lastProbe.tiles;
      var boardTiles = [];
      for (i = 0; i < tiles.length; i++) {
        boardTiles.push(tiles[i]);
      }
      boardTiles.sort(function (p, q) {
        if (p.z !== q.z) return p.z - q.z;
        if (p.r !== q.r) return p.r - q.r;
        return p.c - q.c;
      });
      for (i = 0; i < boardTiles.length; i++) {
        if (blockSet[boardTiles[i].id]) continue;
        /* ingame-hud-render-defects（Bug 2）: 已删除「上层投射环境阴影」——
         * 该状态会泄漏到 drawTileBody 内每次 fill，放大成错位灰黑块。
         * 层次改由卡牌自身投影表达（drawTileBody 内局部 save/restore）。 */
        drawBoardTile(boardTiles[i], now);
      }

      /* 动画层（飞出/弹回/爆闪；reveal 由 drawBoardTile 上浮插值处理——不再跳过绘制） */
      for (i = 0; i < anims.length; i++) {
        var a = anims[i];
        if (a.kind === 'reveal') continue;
        drawAnim(a, Math.min(1, (now - a.t0) / a.dur), now);
      }

      /* 粒子 */
      for (i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / PARTICLE_LIFE));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      /* Bug 2: 旧 #board 半透明碎片绘制已移除，仅 #vfx-canvas 瀑布 */

      /* Hint 高亮 + Δ19e 教学引导高亮（脉冲描边，支持多目标） */
      var hs = highlightIds.length ? highlightIds : (highlight >= 0 ? [highlight] : []);
      for (var hi = 0; hi < hs.length; hi++) {
        for (i = 0; i < tiles.length; i++) {
          if (tiles[i].id !== hs[hi]) continue;
          var hr = getTileCssRect(tiles[i], layout);
          var pulse = 0.5 + 0.5 * Math.sin(now / 180);
          ctx.strokeStyle = 'rgba(255,197,61,' + (0.4 + 0.6 * pulse) + ')';
          ctx.lineWidth = 3;
          ctx.strokeRect(hr.x + 3, hr.y + 3, hr.w - 6, hr.h - 6);
        }
      }
    }

    function drawPrisms(prisms) {
      if (!prisms) return;
      for (var i = 0; i < prisms.length; i++) {
        var p = prisms[i];
        var x = p.c * cell, y = p.r * cell;
        ctx.fillStyle = '#3A4A5C';
        ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
        ctx.strokeStyle = '#5B7A94';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
        ctx.beginPath();
        ctx.lineWidth = cell * 0.16;
        ctx.strokeStyle = '#8FD3F4';
        ctx.lineCap = 'round';
        var m = cell * 0.26;
        if (p.t === '/') {
          ctx.moveTo(x + m, y + cell - m);
          ctx.lineTo(x + cell - m, y + m);
        } else {
          ctx.moveTo(x + m, y + m);
          ctx.lineTo(x + cell - m, y + cell - m);
        }
        ctx.stroke();
      }
    }

    /* 棋盘滑块绘制：几何完全来自 getTileCssRect（与 hitTest 同一函数）。
     * ingame-hud-render-defects（Bug 1/2）: layerOff 堆叠偏移已删除——
     * 奇偶层 +0.5 半格错位本身已构成层次；被压变暗遮罩与层间灰影块
     * 一并删除，卡牌保持干净明亮本色。仅保留 Δ7 reveal 上浮。 */
    function drawBoardTile(t, now) {
      var rect = getTileCssRect(t, layout);
      var px = rect.x + rect.w / 2;
      var py = rect.y + rect.h / 2;
      var lift = 0;
      var rv = revealAt[t.id];
      if (rv != null) {
        /* M1.6: 延迟期下沉待命（被飞出滑块遮盖——避免「静止→跳落→上浮」突跳） */
        if (now < rv) {
          lift = cell * 0.45;
        } else {
          var el = Math.min(1, (now - rv) / REVEAL_MS);
          var ease = 1 - Math.pow(1 - el, 3);
          lift = (1 - ease) * cell * 0.45;
        }
      }
      drawTileBody(ctx, cell, px, py + lift, t, 1, 1, now);
    }

    /* ---------- 动画绘制 ---------- */
    function drawAnim(a, prog, now) {
      var t = tileById(a.tileId);
      if (!t) return;
      if (a.kind === 'fly') {
        var seg = pathPos(a.path, prog);
        /* Δ19c: 所有飞出牌最终都汇聚向**顶部** #dock 对应槽位——
         * 前 30% 沿本层射线滑行，之后平滑弯折向画面上方槽位并淡出。
         * 槽位横坐标按 slotIndex 在 7 格中的比例换算（与 DOM 托盘同序）。 */
        var slotX = ((a.slot != null ? a.slot : 3) + 0.5) / 7 * cssSize;
        var turn = Math.max(0, (prog - 0.30) / 0.70);
        var ease = turn * turn * (3 - 2 * turn);
        var gx = (seg.c + 0.5) * cell;
        var gy = (seg.r + 0.5) * cell;
        gx += (slotX - gx) * ease;
        gy += (-cell * 0.55 - gy) * ease;
        /* Δ8 凌空飞越感: z>=1 高层飞出保持层高——上移偏移 + 放大 + 底部投影 */
        var fz = t.z || 0;
        var lift = fz * cell * 0.22;          /* 高层牌浮在半空 */
        var sc = 1 + fz * 0.12 * (1 - 0.3 * prog); /* 起飞时更大（近镜头感），滑向边缘渐收 */
        var alpha = 1 - 0.85 * prog;
        if (fz >= 1 && prog < 0.92) {
          /* 投影: 高层飞行牌在地面投下椭圆暗影（随高度虚化） */
          ctx.globalAlpha = 0.28 * (1 - prog) * alpha;
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.beginPath();
          ctx.ellipse(gx, gy + cell * 0.38, cell * 0.3 * sc, cell * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        /* Δ14: 白色推进云朵粒子（轻盈拖尾——随飞出迸发） */
        drawFlyPuff(a, prog);
        drawTileBody(ctx, cell, gx, gy - lift, t, sc, alpha, now);
      } else if (a.kind === 'block') {
        var p = prog < 0.55 ? (prog / 0.55) : (1 - (prog - 0.55) / 0.45);
        var dir = RE.DIR_VEC[t.d];
        var zB = t.z || 0;
        drawTileBody(ctx, cell,
          (t.c + dir.dc * 0.38 * p + 0.5) * cell,
          (t.r + dir.dr * 0.38 * p + 0.5) * cell - zB * cell * 0.22, t, 1, 1, now);
      } else if (a.kind === 'match') {
        drawTileBody(ctx, cell, a.x, a.y, t, 1 + 0.6 * prog, 1 - prog, now);
      } else if (a.kind === 'gear') {
        /* T034 齿轮旋转脉冲: 牌体原地放大回弹 + 角标区高亮圈 */
        var gp = prog < 0.5 ? prog / 0.5 : (1 - (prog - 0.5) / 0.5);
        drawTileBody(ctx, cell, (t.c + 0.5) * cell, (t.r + 0.5) * cell, t, 1 + 0.12 * gp, 1, now);
        ctx.beginPath();
        ctx.arc((t.c + 0.5) * cell + cell * 0.34, (t.r + 0.5) * cell - cell * 0.34, cell * 0.14 * (1 + gp), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,217,160,' + (1 - prog) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (a.kind === 'unlock') {
        /* T034 锁链断开: 牌面亮闪 */
        drawTileBody(ctx, cell, (t.c + 0.5) * cell, (t.r + 0.5) * cell, t, 1, 1, now);
        ctx.beginPath();
        roundRect(ctx, t.c * cell + 2, t.r * cell + 2, cell - 4, cell - 4, cell * 0.12);
        ctx.strokeStyle = 'rgba(255,200,80,' + (0.85 * (1 - prog)) + ')';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (a.kind === 'ice') {
        /* T034 破冰碎裂: 白蓝碎片从牌心四散 */
        var icx = (t.c + 0.5) * cell, icy = (t.r + 0.5) * cell;
        ctx.globalAlpha = 1 - prog;
        for (var fi = 0; fi < 6; fi++) {
          var fa = fi * Math.PI / 3 + 0.4;
          var fd = cell * 0.5 * (0.3 + 0.7 * prog);
          var fx = icx + Math.cos(fa) * fd;
          var fy = icy + Math.sin(fa) * fd - prog * cell * 0.25;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + cell * 0.09, fy + cell * 0.05);
          ctx.lineTo(fx - cell * 0.03, fy + cell * 0.1);
          ctx.closePath();
          ctx.fillStyle = fi % 2 ? 'rgba(190,225,255,0.95)' : 'rgba(255,255,255,0.95)';
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (a.kind === 'prism') {
        /* T034 折射折线光条: 沿事件 path 高亮行进 */
        if (a.path && a.path.length >= 2) {
          ctx.globalAlpha = 0.9 * (1 - prog * 0.5);
          ctx.strokeStyle = '#8FD3F4';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          var upto = Math.max(1, Math.ceil(prog * (a.path.length - 1)));
          ctx.moveTo((a.path[0].c + 0.5) * cell, (a.path[0].r + 0.5) * cell);
          for (var pi = 1; pi <= upto && pi < a.path.length; pi++) {
            ctx.lineTo((a.path[pi].c + 0.5) * cell, (a.path[pi].r + 0.5) * cell);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    function pathPos(path, prog) {
      if (!path || path.length < 2) return path ? path[0] : { r: 0, c: 0 };
      var fi = prog * (path.length - 1);
      var i0 = Math.floor(fi);
      var i1 = Math.min(path.length - 1, i0 + 1);
      var f = fi - i0;
      return {
        r: path[i0].r + (path[i1].r - path[i0].r) * f,
        c: path[i0].c + (path[i1].c - path[i0].c) * f
      };
    }

    function tileById(id) {
      /* M1.6: 已移除滑块查 tileInfo 缓存（飞出/三消动画在 removal 后仍可绘制） */
      if (tileInfo[id]) return tileInfo[id];
      if (!lastProbe) return null;
      for (var i = 0; i < lastProbe.tiles.length; i++) {
        if (lastProbe.tiles[i].id === id) return lastProbe.tiles[i];
      }
      return null;
    }

    /* ---------- 事件接入（session onEvent → 渲染动效） ---------- */
    var lastDockSlot = 0; /* Δ19c: 最近一次入槽下标——飞出终点对准顶部待消槽 */
    function handleEvent(e) {
      var now = nowMs();
      if (e.e === 'dock' && e.slotIndex != null) {
        lastDockSlot = Math.max(0, Math.min(6, e.slotIndex | 0));
        refresh();
        return;
      }
      if (e.e === 'magnet-absorb') {
        /* Δ19d: 灵犀三消——无视阻挡，直接从牌位被吸向顶部待消槽 */
        var mt = tileInfo[e.id] || null;
        if (mt) {
          anims.push({
            kind: 'fly', tileId: e.id, slot: lastDockSlot, t0: now, dur: FLY_MS * 0.7,
            path: [{ r: mt.r, c: mt.c }, { r: -0.6, c: mt.c }]
          });
        }
      } else if (e.e === 'flyout' && e.path && e.path.length) {
        anims.push({ kind: 'fly', tileId: e.tileId, path: e.path, slot: lastDockSlot, t0: now, dur: FLY_MS });
      } else if (e.e === 'blocked') {
        anims.push({ kind: 'block', tileId: e.tileId, t0: now, dur: BLOCK_MS });
        if (opts.onShake) opts.onShake();
      } else if (e.e === 'match') {
        /* match 事件——顶部 Dock 槽位坐标爆发白瓷碎片 */
        var cx = cssSize / 2;
        var cy = -cell * 0.5; /* 顶部 Dock 槽位上方 */
        anims.push({ kind: 'match', tileId: e.ids[0], suit: e.suit, t0: now, dur: 300, x: cx, y: cy });
        spawnShards({ x: cx, y: cy }, now);
      } else if (e.e === 'reveal') {
        /* Δ7: 次顶层暴露——延迟后上浮（revealAt 驱动 drawBoardTile 内插值） */
        revealAt[e.id] = now + REVEAL_DELAY;
        anims.push({ kind: 'reveal', tileId: e.id, t0: now, dur: REVEAL_DELAY + REVEAL_MS });
      } else if (e.e === 'gear') {
        /* T034 齿轮 90° 旋转过渡（UI 即时可见——牌面箭头已由引擎转好，这里叠加旋转脉冲） */
        anims.push({ kind: 'gear', tileId: e.id, t0: now, dur: 320 });
      } else if (e.e === 'unlock') {
        /* T034 锁链断开闪烁 */
        anims.push({ kind: 'unlock', tileId: e.id || (e.ids && e.ids[0]), t0: now, dur: 400 });
      } else if (e.e === 'ice') {
        /* T034 破冰碎裂粒子（白蓝碎片飞散）——引擎事件名 'ice'（含 from/to 厚度） */
        var ids = e.ids && e.ids.length ? e.ids : (e.id != null ? [e.id] : []);
        for (var bi = 0; bi < ids.length; bi++) {
          anims.push({ kind: 'ice', tileId: ids[bi], t0: now, dur: 480 });
        }
      } else if (e.e === 'iceBreak') {
        /* 兼容别名（若调用方发 iceBreak 聚合事件） */
        var ids2 = e.ids && e.ids.length ? e.ids : (e.id != null ? [e.id] : []);
        for (var bi2 = 0; bi2 < ids2.length; bi2++) {
          anims.push({ kind: 'ice', tileId: ids2[bi2], t0: now, dur: 480 });
        }
      } else if (e.e === 'prism') {
        /* T034 棱镜折线路径动画（入射→折射→出射折线光条） */
        if (e.path && e.path.length >= 2) {
          anims.push({ kind: 'prism', tileId: e.tileId, path: e.path, t0: now, dur: 360 });
        }
      }
      refresh();
    }

    /* ---------- 数据刷新（脏检查入口） ---------- */
    function refresh() {
      if (session) lastProbe = RE.renderProbe(session.engineState());
      /* Δ14: 渲染层花色映射刷新——跳关/Undo 均以当前关 id 实时重算阶段
       *（currentLevel 切换由 main.js 经 setSuitLevel 通知；此处兜底幂等） */
      if (pendingLevel) setSuitLevel(pendingLevel);
      /* M1.6: 视觉缓存——未移除滑块全量绘制字段（removed 后 drawAnim 仍可用）
       * Δ12: 补 r/c/m/ice —— tileById 缓存优先命中时 block/gear/unlock/ice 动画
       * 读 t.c/t.r 曾为 undefined → NaN → createLinearGradient 抛错杀死 rAF 循环
       * （受阻滑块贴图永久消失根因）；m/ice 补全已移除滑块飞出动画的机制角标 */
      if (lastProbe) {
        for (var i = 0; i < lastProbe.tiles.length; i++) {
          var t = lastProbe.tiles[i];
          tileInfo[t.id] = {
            id: t.id, r: t.r, c: t.c, s: t.s, d: t.d, z: t.z || 0, stackDepth: t.stackDepth || 1,
            m: t.m || null, ice: t.ice != null ? t.ice : null
          };
        }
      }
      resize();
      markDirty();
    }

    /* 命中测试 —— 与 getTileCssRect 完全同源（ingame-hud-render-defects 根治）
     * 客户端坐标 → 画布 CSS 逻辑坐标（严禁乘/除 dpr）；从最高层 z=4 向下遍历。 */
    function hitTest(clientX, clientY) {
      if (!lastProbe || !canvas.getBoundingClientRect) return -1;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return -1;
      /* 画布逻辑边长 cssSize 与 CSS 盒宽可能相差一个固定的布局余量
       * （父容器测量 −8px vs #board 的 calc(100% - 12px)）——用盒宽归一，
       * 这是纯 CSS 比例换算，与 dpr / 位图像素无关。 */
      var kx = cssSize / rect.width;
      var ky = cssSize / rect.height;
      var cx = (clientX - rect.left) * kx;
      var cy = (clientY - rect.top) * ky;
      for (var zi = 4; zi >= 0; zi--) {
        for (var i = 0; i < lastProbe.tiles.length; i++) {
          var t = lastProbe.tiles[i];
          if ((t.z || 0) !== zi) continue;
          if (t.covered) continue; /* 仅未被压住可交互 */
          var r = getTileCssRect(t, layout);
          if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return t.id;
        }
      }
      return -1;
    }

    /* Δ19e/T087: 教学指引取牌——返回牌中心在视口中的 CSS 像素位置
     * （tutorial.js 据此把动态小手压在「实际可飞出」的滑块上）。
     * 几何来自同一 getTileCssRect，禁止第三套换算。 */
    function tileRect(tileId) {
      if (!lastProbe || !canvas.getBoundingClientRect) return null;
      var t = null;
      for (var i = 0; i < lastProbe.tiles.length; i++) {
        if (lastProbe.tiles[i].id === tileId) { t = lastProbe.tiles[i]; break; }
      }
      if (!t) return null;
      var rect = canvas.getBoundingClientRect();
      var k = cssSize > 0 ? (rect.width / cssSize) : 1;
      var r = getTileCssRect(t, layout);
      return {
        x: rect.left + (r.x + r.w / 2) * k,
        y: rect.top + (r.y + r.h / 2) * k,
        w: r.w * k,
        h: r.h * k
      };
    }

    if (session && session.engineState) {
      refresh();
      global.addEventListener('resize', function () { resize(); markDirty(); });
    }

    /* Δ15b/T052i: 贴图就绪 → 惰性换装重绘（Emoji 先渲、贴图后到不闪烁）
     * bumpSprites 已清空 spriteCache/dockIconCache——此处仅重绘棋盘;
     * Dock chip 由 main.js 渲染（棋盘重绘同帧经 renderDock 事件驱动——
     * 贴图就绪即 bump 通知,后续 dock/match 事件自然消费新切片） */
    IconAssets.ensureLoaded();
    IconAssets.onSpritesReady(function () {
      markDirty();
    });

    /* Δ14: 关卡上下文注册（main.js loadLevel 时调用——花色映射随 id 切换） */
    var pendingLevel = null; /* 工厂作用域 var 提升——refresh 可读 */
    function setLevel(level) {
      pendingLevel = level;
      setSuitLevel(level);
      markDirty();
    }

    lastRendererApi = {
      refresh: refresh,
      handleEvent: handleEvent,
      spawnDockShatter: spawnDockShatter,
      vfxShards: vfxShards,
      hitTest: hitTest,
      setHighlight: setHighlight,
      setHighlights: setHighlights,
      tileRect: tileRect,
      setLevel: setLevel,
      /* 自测/调试用只读布局（CSS 像素：origin/cellStep/tileSize/n） */
      layoutOf: function () { return layout; },
      SUITS: SUITS
    };
    return lastRendererApi;
  }

  /* DOM chip（Dock 槽图标——Δ14 与棋盘图鉴口径一致 / Δ15 贴图切片优先）
   * Δ15b3e（Bug A 修复）: 贴图切片就绪 → 两条同源出口——
   *   ① 首选 DataURL <img class="dock-icon">（dockIconDataURL 缓存）；
   *   ② file:// 画布跨源污染下 toDataURL 必抛 SecurityError（评估已证实
   *      getImageData/toDataURL 双双被击穿）→ 退化为 <canvas class="dock-icon"
   *      data-bid>，由 paintDockIcons() 在 Dock 重绘后直接 drawImage 同一张
   *      切片——与棋盘 getSprite 走的是同一条 drawImage 路径，无需导出像素。
   *   二者同图同源，故 file:// 与静态服务两形态下 Dock 与棋盘 100% 一致。
   * 未就绪 → Emoji 字符 chip（贴图缺失或加载中）；
   * 无 Bestiary 映射 → 旧 SVG 双圈 chip 兜底。内联零外部资源（宪章 III） */
  function chipSVG(s, level) {
    var bid = null;
    if (Bestiary && level) {
      var m = Bestiary.mappingForLevel(level);
      bid = m[s] != null ? m[s] : null;
    } else if (Bestiary && currentLevelId != null) {
      bid = currentMapping[s] != null ? currentMapping[s] : null;
    }
    if (bid != null) {
      IconAssets.ensureLoaded();
      var slice = IconAssets.sliceCanvasOf(bid);
      if (!slice) {
        /* sheet 未覆盖该条目 → 按需探测单张 {bid}.png（逐条目独立） */
        IconAssets.ensureSinglesFor([bid]);
      } else {
        /* ① DataURL 出口（http:// 及可导出环境） */
        var url = dockIconDataURL(bid);
        if (url) {
          return '<img class="dock-icon" src="' + url + '" alt="' +
            (Bestiary.entry(bid).name || '') + '" draggable="false"/>';
        }
        /* ② 污染兜底：canvas 直绘同一张切片（与棋盘同源） */
        return '<canvas class="dock-icon" width="256" height="256" data-bid="' + bid +
          '" aria-label="' + (Bestiary.entry(bid).name || '') + '"></canvas>';
      }
      /* Emoji chip（原生全彩 Emoji 直渲染——无 ctx.arc 手绘） */
      if (Bestiary.EMOJI && Bestiary.EMOJI.length === 45) {
        return '<span class="chip-icon-emoji">' + Bestiary.emojiOf(bid) + '</span>';
      }
    }
    var fill, deep;
    if (bid != null) {
      var e = Bestiary.entry(bid);
      fill = e.theme;
      deep = shade(e.theme, -60);
    } else {
      var suit = SUITS[s] || SUITS[s % SUITS.length];
      fill = suit.fill;
      deep = suit.deep;
    }
    /* 图鉴 chip: 柔光底晕圈 + 主体色圆 + 高光点（与棋盘 Sprite 视觉同源） */
    return '<svg viewBox="0 0 24 24" fill="' + fill + '" stroke="rgba(0,0,0,0.3)" stroke-width="0.8">' +
      '<circle cx="12" cy="12" r="10.5" fill="rgba(255,255,255,0.55)"/>' +
      '<circle cx="12" cy="12" r="8.5"/>' +
      '<ellipse cx="9" cy="8.5" rx="2.6" ry="1.4" fill="rgba(255,255,255,0.6)" stroke="none"/>' +
      '</svg>';
  }

  /* Δ15b3e（Bug A 修复）: Dock 图标 DataURL 导出（带缓存 + 失败告警）
   * · 缓存键 bestiaryId，dockIconCache 随 bumpSprites() 失效（不闪烁纪律）
   * · 失败不静默：一次 console.warn 留痕——原实现在 file:// 下静默失败
   *   45 次却零信号，是该缺陷长期未被发现的直接原因 */
  function dockIconDataURL(bid) {
    var hit = dockIconCache[bid];
    if (hit !== undefined) return hit; /* null 亦缓存——避免逐帧重试抛错 */
    var slice = IconAssets.sliceCanvasOf(bid);
    if (!slice) return null;
    try {
      var url = slice.toDataURL('image/png');
      dockIconCache[bid] = url;
      return url;
    } catch (err) {
      dockIconCache[bid] = null; /* 记忆化失败——后续直接走 canvas 兜底 */
      warnOnce('dockDataURL',
        'Dock 图标 DataURL 导出不可用（' + (err && err.name || 'err') +
        '，file:// 跨源污染）——已切换为 canvas 同源直绘，视觉与棋盘保持一致');
      return null;
    }
  }

  /* Δ15b3e（Bug A 修复）: Dock <canvas class="dock-icon"> 兜底绘制
   * main.js renderDock() 在写入 innerHTML 后调用——对每个带 data-bid 的
   * canvas 直接 drawImage 棋盘同源的离屏切片（不读像素、不导出，
   * 故 file:// 污染下依然可用）。DPR 自适应放大至设备像素。 */
  function paintDockIcons() {
    if (typeof document === 'undefined') return 0;
    var dock = document.getElementById('dock');
    if (!dock) return 0;
    var nodes = dock.querySelectorAll('canvas.dock-icon[data-bid]');
    if (!nodes || nodes.length === 0) return 0;
    var dpr = Math.max(1, global.devicePixelRatio || 1);
    var n = 0;
    for (var i = 0; i < nodes.length; i++) {
      var cv = nodes[i];
      var bid = parseInt(cv.getAttribute('data-bid'), 10);
      var slice = IconAssets.sliceCanvasOf(bid);
      if (!slice) continue;
      var cssW = cv.clientWidth || 40;
      var px = Math.max(64, Math.round(cssW * dpr));
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      var c2 = cv.getContext('2d');
      if (!c2) continue;
      c2.clearRect(0, 0, px, px);
      c2.imageSmoothingEnabled = true;
      c2.imageSmoothingQuality = 'high';
      c2.drawImage(slice, 0, 0, px, px);
      n++;
    }
    return n;
  }

  /* Δ17/T068+T069+T072: 萌宠头像 canvas 直绘
   * file:// 下 toDataURL 因跨源污染不可用（dockIconDataURL 返回 null），
   * petAvatarHTML 退化为 <canvas data-bid> 占位——必须由本函数补绘，
   * 否则大厅头像 / 档案网格 / 结算铭牌萌宠呈现为空白圆形。 */
  function paintAvatarCanvases(scope) {
    if (typeof document === 'undefined') return 0;
    var root = scope || document;
    var nodes = root.querySelectorAll('canvas.pet-avatar-img[data-bid]');
    if (!nodes || !nodes.length) return 0;
    var dpr = Math.max(1, global.devicePixelRatio || 1);
    var n = 0;
    for (var i = 0; i < nodes.length; i++) {
      var cv = nodes[i];
      var bid = parseInt(cv.getAttribute('data-bid'), 10);
      var slice = IconAssets.sliceCanvasOf(bid);
      if (!slice) continue;
      var cssW = cv.clientWidth || 48;
      var px = Math.max(64, Math.round(cssW * dpr));
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      var c2 = cv.getContext('2d');
      if (!c2) continue;
      c2.clearRect(0, 0, px, px);
      c2.imageSmoothingEnabled = true;
      c2.imageSmoothingQuality = 'high';
      c2.drawImage(slice, 0, 0, px, px);
      n++;
    }
    return n;
  }

  /* =========================================================
   * Δ15b3: BackdropStage — 全视口背景舞台（贴图 + 氛围滤镜 + 前景粒子）
   * · 贴图: assets/bg/bg{1..6}.{png|jpg|jpeg|webp} 逐扩展探测，
   *   Image 相对路径（file:// 双击与静态服务一致——宪章 II/III）
   * · 映射（Δ16b）: cycleIndex = floor((level.id-1)/3)（0~23）→
   *   画卷序号 = floor((level.id-1)/12)+1 → 0~3→bg1 / 4~7→bg2 /
   *   8~11→bg3 / 12~15→bg4 / 16~19→bg5 / 20~23→bg6
   *   （每幅画卷覆盖 4 个三关循环 = 12 关，与 FR-044 拼图节奏同源）
   * · 氛围: 24 循环逐环 24 档微调色温/明度（同图不同循环互异——
   *   每过 3 关一换气氛），叠在贴图之上、粒子之下
   * · 粒子: 4 族前景环境粒子（meadow 绒毛+光斑 / sea 水泡+波光 /
   *   petal 樱瓣 / star 星尘+流星）——纯函数动画（相位由 (i,t) 决定，
   *   零状态污染），低透明度低密度不干扰操作视线
   * · 兜底: 某张未加载成功 → 复用 bg1；全失败 → Canvas 渐变底色
   * ========================================================= */
  var BackdropStage = (function () {
    /* Δ16b: 6 幅画卷 × 每幅 4 个三关循环 = 24 循环（0~23） */
    var CYCLES = 24;
    var BG_INDEX = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
    var EXT_ORDER = ['png', 'jpg', 'jpeg', 'webp'];
    var imgCache = {};   /* bg 序号 → { state:'loading'|'ready'|'failed', img } */
    var readyFns = [];   /* 贴图就绪回调（惰性换装——换装无闪烁） */

    /* 三关循环序号（Δ16: 0~23 —— 24 个「两简一难」循环） */
    function cycleOf(levelId) {
      return Math.min(CYCLES - 1, Math.max(0, Math.floor(((levelId || 1) - 1) / 3)));
    }

    /* 画卷序号（Δ16b 铁律）: floor((level.id-1)/12)+1 → bg{1..6}
     * 与 FR-044 拼图进度、大厅 2×2 拼图相框同源（零额外映射表） */
    function paintingOf(levelId) {
      return Math.min(6, Math.max(1, Math.floor(((levelId || 1) - 1) / 12) + 1));
    }

    function bgIndexOf(ci) {
      return BG_INDEX[Math.min(CYCLES - 1, Math.max(0, ci))];
    }

    /* 逐扩展探测一张底图（会话级缓存——同图不重复探测） */
    function probe(bgNo) {
      var rec = imgCache[bgNo];
      if (rec) return rec;
      rec = imgCache[bgNo] = { state: 'loading', img: null };
      if (typeof Image !== 'function') { rec.state = 'failed'; return rec; }
      var seq = 0;
      function next() {
        if (seq >= EXT_ORDER.length) { rec.state = 'failed'; return; }
        var ext = EXT_ORDER[seq++];
        var img = new Image();
        img.onload = function () {
          rec.state = 'ready'; rec.img = img;
          for (var i = 0; i < readyFns.length; i++) {
            try { readyFns[i](bgNo); } catch (err) { /* 监听器异常隔离 */ }
          }
        };
        img.onerror = next; /* 扩展序逐个探测 */
        img.src = 'assets/bg/bg' + bgNo + '.' + ext;
      }
      next();
      return rec;
    }

    function onReady(fn) {
      if (typeof fn === 'function') readyFns.push(fn);
    }

    /* =========================================================
     * Δ15b3/Δ16b: 24 循环 × 24 档氛围光影（FR-035 §4 派生）
     * 同一张底图在负责的 4 个循环中呈现不同气氛——每过 3 关
     * 一次视觉新鲜感。字段:
     *   top/bot  垂直渐变叠加色（低透明度——保滑块对比度）
     *   tint     全局色温罩（着色/柔化）
     *   veil     暗角强度（0 = 无暗角——明亮场景不加暗）
     *   lift     提亮（晨光/月光等透亮气氛）
     *   warm     暖色偏移（午后/粉霞）
     * ========================================================= */
    var ATMOS = [
      /* Cycle 0~3 —— bg1 雪山城堡花海（陆地萌宠前段） */
      { name: '清透晨光', top: 'rgba(255,246,214,0.10)', bot: 'rgba(214,238,255,0.12)', tint: 'rgba(255,250,235,0.05)', veil: 0.10, lift: 0.05, warm: 0.00 },
      { name: '暖金午后', top: 'rgba(255,222,150,0.13)', bot: 'rgba(255,190,110,0.15)', tint: 'rgba(255,214,150,0.07)', veil: 0.14, lift: 0.02, warm: 0.06 },
      { name: '微醺粉霞', top: 'rgba(255,196,206,0.13)', bot: 'rgba(226,158,190,0.15)', tint: 'rgba(255,196,204,0.07)', veil: 0.15, lift: 0.01, warm: 0.05 },
      { name: '清凉月光', top: 'rgba(190,214,255,0.14)', bot: 'rgba(146,176,236,0.16)', tint: 'rgba(186,208,255,0.08)', veil: 0.18, lift: 0.00, warm: 0.00 },
      /* Cycle 4~6 —— bg2 金色麦田风车（陆地萌宠后段） */
      { name: '晴空麦浪', top: 'rgba(255,244,200,0.10)', bot: 'rgba(244,214,140,0.13)', tint: 'rgba(255,240,200,0.05)', veil: 0.11, lift: 0.05, warm: 0.02 },
      { name: '正午暖阳', top: 'rgba(255,230,160,0.14)', bot: 'rgba(255,196,100,0.16)', tint: 'rgba(255,220,150,0.08)', veil: 0.15, lift: 0.03, warm: 0.07 },
      { name: '金色黄昏', top: 'rgba(255,206,138,0.14)', bot: 'rgba(238,146,92,0.17)', tint: 'rgba(255,196,130,0.08)', veil: 0.17, lift: 0.00, warm: 0.08 },
      /* Cycle 7~10 —— bg3 黄金椰林海滩（碧海飞羽前段） */
      { name: '碧海晨汐', top: 'rgba(214,246,255,0.12)', bot: 'rgba(150,214,238,0.14)', tint: 'rgba(206,240,255,0.07)', veil: 0.10, lift: 0.05, warm: 0.00 },
      { name: '澄澈正午', top: 'rgba(190,238,255,0.13)', bot: 'rgba(110,196,236,0.15)', tint: 'rgba(186,234,255,0.07)', veil: 0.12, lift: 0.04, warm: 0.00 },
      { name: '珊瑚霞光', top: 'rgba(255,206,182,0.13)', bot: 'rgba(246,160,140,0.15)', tint: 'rgba(255,198,176,0.07)', veil: 0.15, lift: 0.01, warm: 0.05 },
      { name: '静谧月夜', top: 'rgba(178,204,255,0.14)', bot: 'rgba(122,152,220,0.17)', tint: 'rgba(176,200,255,0.09)', veil: 0.19, lift: 0.00, warm: 0.00 },
      /* Cycle 11~13 —— bg4 樱花飞舞湖畔（碧海飞羽后段） */
      { name: '樱映晨光', top: 'rgba(255,236,240,0.12)', bot: 'rgba(246,206,226,0.14)', tint: 'rgba(255,232,238,0.07)', veil: 0.10, lift: 0.05, warm: 0.02 },
      { name: '午后暖樱', top: 'rgba(255,224,226,0.14)', bot: 'rgba(240,170,200,0.16)', tint: 'rgba(255,216,222,0.08)', veil: 0.14, lift: 0.02, warm: 0.06 },
      { name: '暮色紫霞', top: 'rgba(216,196,255,0.14)', bot: 'rgba(170,146,224,0.17)', tint: 'rgba(212,190,255,0.08)', veil: 0.18, lift: 0.00, warm: 0.02 },
      /* Cycle 14~16 —— bg5 漫天彩色热气球（奇幻远航前段） */
      { name: '气球晨光', top: 'rgba(255,240,206,0.11)', bot: 'rgba(224,214,255,0.14)', tint: 'rgba(255,238,214,0.06)', veil: 0.11, lift: 0.05, warm: 0.01 },
      { name: '云端暖阳', top: 'rgba(255,232,186,0.13)', bot: 'rgba(206,196,246,0.15)', tint: 'rgba(255,228,190,0.07)', veil: 0.13, lift: 0.03, warm: 0.05 },
      { name: '彩霞满天', top: 'rgba(255,204,196,0.14)', bot: 'rgba(190,160,236,0.17)', tint: 'rgba(252,200,200,0.08)', veil: 0.16, lift: 0.01, warm: 0.05 },
      /* Cycle 17~19 —— bg6 奇幻星辰云海（奇幻远航终局） */
      { name: '银河初现', top: 'rgba(196,214,255,0.13)', bot: 'rgba(120,140,230,0.16)', tint: 'rgba(190,206,255,0.08)', veil: 0.17, lift: 0.02, warm: 0.00 },
      { name: '星海流光', top: 'rgba(170,196,255,0.14)', bot: 'rgba(96,116,214,0.18)', tint: 'rgba(168,192,255,0.09)', veil: 0.20, lift: 0.00, warm: 0.00 },
      { name: '终局星辉', top: 'rgba(196,186,255,0.15)', bot: 'rgba(110,96,206,0.19)', tint: 'rgba(188,176,255,0.10)', veil: 0.22, lift: 0.00, warm: 0.02 },
      /* Δ16b Cycle 20~23 —— bg6 星穹极光之巅（奇幻远航后篇 L61~L72 终局四循环） */
      { name: '极光初升', top: 'rgba(178,204,255,0.13)', bot: 'rgba(104,124,222,0.17)', tint: 'rgba(176,198,255,0.08)', veil: 0.18, lift: 0.01, warm: 0.00 },
      { name: '虹光漫卷', top: 'rgba(186,178,255,0.14)', bot: 'rgba(96,110,210,0.18)', tint: 'rgba(184,176,255,0.09)', veil: 0.20, lift: 0.00, warm: 0.01 },
      { name: '深空寂光', top: 'rgba(160,180,248,0.14)', bot: 'rgba(78,92,196,0.19)', tint: 'rgba(166,184,250,0.09)', veil: 0.21, lift: 0.00, warm: 0.00 },
      { name: '万星加冕', top: 'rgba(204,196,255,0.16)', bot: 'rgba(116,100,214,0.20)', tint: 'rgba(196,186,255,0.11)', veil: 0.23, lift: 0.00, warm: 0.02 }
    ];

    function atmosOf(ci) {
      return ATMOS[Math.min(CYCLES - 1, Math.max(0, ci))];
    }

    /* =========================================================
     * Δ15b3: 前景环境粒子（4 族——按底图主题）
     * meadow  bg1/bg2: 蒲公英绒毛（飘散）+ 柔和阳光光斑
     * sea     bg3:    晶莹水泡（上升）+ 海面波光（横向亮带）
     * petal   bg4:    粉色樱花瓣（缓缓飘落）
     * star    bg5/bg6: 流光星尘（闪烁）+ 微光流星（划过）
     * 纪律: 低透明度（≤0.22）、低密度（≤24 粒）、分布于边缘与
     * 上/下半区（避开棋盘中心操作区——不干扰操作视线）
     * ========================================================= */
    function familyOf(ci) {
      var no = bgIndexOf(ci);
      if (no <= 2) return 'meadow';
      if (no === 3) return 'sea';
      if (no === 4) return 'petal';
      return 'star';
    }

    function drawParticles(ctx, family, W, H, tMs, dpr) {
      var t = (tMs || 0) / 1000;
      var s = (W / 400) * (dpr || 1); /* 尺度基准（400px 宽） */
      ctx.save();
      if (family === 'meadow') {
        /* 蒲公英绒毛: 缓慢飘散 + 自转（8 粒） */
        for (var i = 0; i < 8; i++) {
          var ph = i * 0.786;
          var fx = (0.08 + (i % 4) * 0.28 + Math.sin(t * 0.28 + ph) * 0.06) * W;
          var fy = ((t * 0.018 + ph * 0.31) % 1) * H;
          var fr = (1.6 + (i % 3) * 0.7) * s;
          ctx.globalAlpha = 0.16 + 0.10 * Math.sin(t * 0.9 + ph * 3);
          ctx.fillStyle = 'rgba(255,253,245,1)';
          /* 绒球: 中心点 + 放射细丝 */
          ctx.beginPath(); ctx.arc(fx, fy, fr * 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,253,245,0.75)';
          ctx.lineWidth = Math.max(0.5, 0.6 * s);
          for (var k = 0; k < 5; k++) {
            var ang = t * 0.5 + ph * 6 + k * (Math.PI * 2 / 5);
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(fx + Math.cos(ang) * fr * 2.1, fy + Math.sin(ang) * fr * 2.1);
            ctx.stroke();
          }
        }
        /* 柔和阳光光斑: 上浮柔光圆（6 粒） */
        for (var j = 0; j < 6; j++) {
          var ph2 = j * 0.642;
          var gx = (0.14 + (j % 3) * 0.33 + Math.sin(t * 0.32 + ph2) * 0.05) * W;
          var gy = (1 - ((t * 0.028 + ph2 * 0.27) % 1)) * H;
          var gr = (3.2 + (j % 3) * 1.6) * s;
          var ga = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          ga.addColorStop(0, 'rgba(255,248,214,0.20)');
          ga.addColorStop(1, 'rgba(255,248,214,0)');
          ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 0.6 + ph2 * 4);
          ctx.fillStyle = ga;
          ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
        }
      } else if (family === 'sea') {
        /* 晶莹水泡: 上升 + 轻微横摆（10 粒） */
        for (var b = 0; b < 10; b++) {
          var pb = b * 0.573;
          var bx = (0.10 + (b % 5) * 0.19 + Math.sin(t * 0.55 + pb) * 0.035) * W;
          var by = (1 - ((t * (0.035 + (b % 4) * 0.010) + pb * 0.19) % 1)) * H;
          var br = (1.3 + (b % 4) * 0.9) * s * (0.75 + (1 - by / H) * 0.55);
          ctx.globalAlpha = 0.13 + 0.09 * Math.sin(t * 1.1 + pb * 5);
          ctx.strokeStyle = 'rgba(226,250,255,1)';
          ctx.lineWidth = Math.max(0.6, 0.7 * s);
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
          /* 泡内高光点 */
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.arc(bx - br * 0.34, by - br * 0.34, br * 0.22, 0, Math.PI * 2); ctx.fill();
        }
        /* 海面波光: 横向流动亮带（下半区 3 道） */
        ctx.globalAlpha = 1;
        for (var w = 0; w < 3; w++) {
          var wy = (0.62 + w * 0.12) * H;
          var phase = (t * 0.05 + w * 0.33) % 1;
          var wg = ctx.createLinearGradient(0, 0, W, 0);
          wg.addColorStop(0, 'rgba(255,255,255,0)');
          wg.addColorStop(Math.max(0.01, Math.min(0.99, phase)), 'rgba(255,255,255,0.20)');
          wg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = wg;
          ctx.fillRect(0, wy, W, Math.max(1, 1.2 * s));
        }
      } else if (family === 'petal') {
        /* 粉色樱花瓣: 缓缓飘落 + 摇摆 + 自转（12 粒） */
        for (var p = 0; p < 12; p++) {
          var pp = p * 0.531;
          var px2 = (0.07 + (p % 6) * 0.16 + Math.sin(t * 0.42 + pp * 2) * 0.05) * W;
          var py2 = ((t * (0.028 + (p % 4) * 0.008) + pp * 0.23) % 1) * H;
          var pr = (2.2 + (p % 3) * 0.6) * s;
          ctx.globalAlpha = 0.18 + 0.10 * Math.sin(t * 0.8 + pp * 4);
          ctx.save();
          ctx.translate(px2, py2);
          ctx.rotate(t * 0.9 + pp * 6);
          ctx.fillStyle = p % 3 === 0 ? 'rgba(255,196,216,1)' : 'rgba(255,214,228,1)';
          ctx.beginPath();
          ctx.ellipse(0, 0, pr, pr * 0.56, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else {
        /* 流光星尘: 闪烁微点（14 粒） */
        for (var d = 0; d < 14; d++) {
          var pd = d * 0.449;
          var dx2 = (0.05 + (d % 7) * 0.14 + Math.sin(t * 0.3 + pd) * 0.025) * W;
          var dy2 = ((t * (0.014 + (d % 5) * 0.005) + pd * 0.17) % 1) * H;
          var dr2 = (0.7 + (d % 4) * 0.55) * s;
          ctx.globalAlpha = 0.14 + 0.14 * Math.sin(t * 1.6 + pd * 7);
          ctx.fillStyle = d % 4 === 0 ? 'rgba(255,240,205,1)' : 'rgba(214,228,255,1)';
          ctx.beginPath(); ctx.arc(dx2, dy2, dr2, 0, Math.PI * 2); ctx.fill();
        }
        /* 微光流星: 划过天幕（2 道·周期错开） */
        for (var m = 0; m < 2; m++) {
          var cycle = 7.5 + m * 4.2; /* 每道流星周期（秒） */
          var mt = (t + m * 3.1) % cycle;
          if (mt > 1.5) continue; /* 窗口外不绘制 */
          var prog = mt / 1.5;
          var mx = (0.15 + m * 0.45 + prog * 0.5) * W;
          var my = (0.08 + m * 0.10 + prog * 0.42) * H;
          var mlen = (16 + m * 6) * s;
          ctx.globalAlpha = Math.sin(prog * Math.PI) * 0.55;
          var mg = ctx.createLinearGradient(mx, my, mx - mlen, my - mlen * 0.6);
          mg.addColorStop(0, 'rgba(255,255,255,0.9)');
          mg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = mg;
          ctx.lineWidth = Math.max(1, 1.2 * s);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(mx - mlen, my - mlen * 0.6);
          ctx.stroke();
        }
      }
      ctx.restore(); /* globalAlpha 复位 */
    }

    /* 取当前应显示的底图（失败降级：bgN → bg1 → 程序化渐变） */
    function resolveImage(ci) {
      var no = bgIndexOf(ci);
      var rec = probe(no);
      if (rec.state === 'ready' && rec.img) return rec.img;
      if (no !== 1) {
        var r1 = probe(1);
        if (r1.state === 'ready' && r1.img) return r1.img;
      }
      return null;
    }

    /* =========================================================
     * Δ15b3: 全视口背景绘制（贴图优先 + 氛围滤镜 + 前景粒子）
     * · 贴图: 9:16 源按 cover 等比铺满视口（短边铺满、居中——
     *   同比例时无裁切；非 9:16 时短边溢出裁切，不拉伸变形）
     * · 兜底: 贴图缺失 → Canvas 渐变底色（暖阳/海蓝/星夜三档）
     * · 氛围: 24 档 ATMOS 叠加（渐变 + 色温罩 + 暗角）
     * · 粒子: 4 族环境粒子（低密度低透明度——不干扰操作视线）
     * ========================================================= */
    function drawStage(ctx, levelId, W, H, tMs, dpr) {
      var ci = cycleOf(levelId); /* Δ16b: 三关循环序号（0~23） */
      var at = atmosOf(ci);

      /* 1) 底图（贴图优先 → bg1 复用 → 渐变兜底） */
      var img = resolveImage(ci);
      if (img) {
        try {
          var iw = img.naturalWidth || img.width;
          var ih = img.naturalHeight || img.height;
          if (iw > 0 && ih > 0) {
            var scale = Math.max(W / iw, H / ih); /* cover: 短边铺满 */
            var dw = iw * scale, dh = ih * scale;
            ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
          }
        } catch (err) { /* 绘制异常 → 落到渐变兜底 */ }
      } else {
        /* 渐变兜底底色（按主题族选取——非纯灰，避免白屏感） */
        var fam = familyOf(ci);
        var g = ctx.createLinearGradient(0, 0, 0, H);
        if (fam === 'meadow') {
          g.addColorStop(0, '#8ED0F5'); g.addColorStop(0.55, '#BEE8F7'); g.addColorStop(1, '#E4F4D8');
        } else if (fam === 'sea') {
          g.addColorStop(0, '#7FC8EE'); g.addColorStop(0.55, '#A8DDF2'); g.addColorStop(1, '#F2EBD2');
        } else if (fam === 'petal') {
          g.addColorStop(0, '#A8D4F0'); g.addColorStop(0.5, '#F0D6E4'); g.addColorStop(1, '#F8E8EE');
        } else {
          g.addColorStop(0, '#2A3568'); g.addColorStop(0.55, '#4A5AA0'); g.addColorStop(1, '#6E7FB8');
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      /* 2) 氛围光影层（20 档——同图不同循环互异） */
      var lg = ctx.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, at.top);
      lg.addColorStop(0.72, at.bot);
      lg.addColorStop(1, at.bot);
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);
      if (at.tint) {
        ctx.fillStyle = at.tint;
        ctx.fillRect(0, 0, W, H);
      }
      /* 暗角（veil=0 的明亮场景跳过——不压暗风景） */
      if (at.veil > 0.01) {
        var vg = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.30, W / 2, H * 0.46, Math.max(W, H) * 0.78);
        vg.addColorStop(0, 'rgba(30,38,52,0)');
        vg.addColorStop(1, 'rgba(30,38,52,' + at.veil.toFixed(3) + ')');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }
      /* 提亮（清透/晨光气氛——压暗氛围的反向调节） */
      if (at.lift > 0.001) {
        ctx.fillStyle = 'rgba(255,252,242,' + at.lift.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      /* 暖色偏移（午后/粉霞气氛——压向金橙调） */
      if (at.warm > 0.001) {
        ctx.fillStyle = 'rgba(255,168,86,' + at.warm.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      /* 3) 前景环境粒子 */
      drawParticles(ctx, familyOf(ci), W, H, tMs, dpr);
    }

    STM.BackdropStage = {
      CYCLES: CYCLES,
      cycleOf: cycleOf,       /* Δ16b: 三关循环序号 0~23 */
      paintingOf: paintingOf, /* Δ16b: 画卷序号 = floor((id-1)/12)+1 → bg{1..6} */
      bgIndexOf: bgIndexOf,
      probe: probe,
      onReady: onReady,
      resolveImage: resolveImage,
      atmosOf: atmosOf,
      familyOf: familyOf,
      drawParticles: drawParticles,
      ATMOS: ATMOS,
      drawStage: drawStage
    };
    return STM.BackdropStage;
  })();

  /* Δ17/T068+T069: 玩家萌宠头像 HTML（大厅头像按钮 / 档案弹窗网格 / 结算铭牌共用）
   * 与 chipSVG 的区别: chipSVG 消费「当前关花色 → 图鉴 id」映射；本函数直接
   * 接收 profile 存的 avatar suit 编号（0~44），不受关卡映射影响。
   * 渲染来源链与棋盘完全同源（FR-040 §2 / FR-033 §6）:
   *   ① sheet1~3 切片 DataURL → ② 切片 canvas 直绘 → ③ 原生全彩 Emoji */
  function petAvatarHTML(bid) {
    if (Bestiary && !IconAssets) return '';
    if (typeof bid !== 'number' || isNaN(bid)) bid = 0;
    IconAssets.ensureLoaded();
    var slice = IconAssets.sliceCanvasOf(bid);
    var name = Bestiary ? ((Bestiary.entry(bid) || {}).name || '') : '';
    if (slice) {
      var url = dockIconDataURL(bid); /* DataURL 记忆化，跨会话零重复导出 */
      if (url) {
        return '<img class="pet-avatar-img" src="' + url + '" alt="' + name +
          '" draggable="false"/>';
      }
      return '<canvas class="pet-avatar-img" width="256" height="256" data-bid="' +
        bid + '" aria-label="' + name + '"></canvas>';
    }
    /* Emoji 兜底（sheet 未覆盖该条目） */
    if (Bestiary && Bestiary.EMOJI && Bestiary.EMOJI.length === 45) {
      return '<span class="pet-avatar-emoji">' + Bestiary.emojiOf(bid) + '</span>';
    }
    return '';
  }

  STM.createBoardRenderer = createBoardRenderer;
  STM.spawnDockShatter = function (slotRects) {
    if (lastRendererApi && typeof lastRendererApi.spawnDockShatter === 'function') {
      return lastRendererApi.spawnDockShatter(slotRects);
    }
    return 0;
  };
  STM.SUITS = SUITS;
  STM.chipSVG = chipSVG;
  STM.petAvatarHTML = petAvatarHTML; /* Δ17: 萌宠头像统一出口 */
  STM.paintAvatarCanvases = paintAvatarCanvases; /* Δ17: file:// 跨源兜底直绘 */
  STM.paintDockIcons = paintDockIcons; /* Δ15b3e: file:// canvas 兜底绘制 */
  STM.dockIconDataURL = dockIconDataURL;
  STM.IconAssets = IconAssets;
  STM.BackdropStage = BackdropStage;
  STM.rendererTest = { setSuitLevel: setSuitLevel, suitVisual: suitVisual, spriteCache: spriteCache, getSprite: getSprite, IconAssets: IconAssets, dockIconDataURL: dockIconDataURL, paintDockIcons: paintDockIcons, DIR_COLORS: DIR_COLORS };
  /* T084: Δ19 渲染常量外露（离线自测断言用——不参与运行时逻辑） */
  STM.rendererTest.SHARDS = { min: SHARD_COUNT_MIN, max: SHARD_COUNT_MAX };
  STM.rendererTest.DOCK_SHARDS = { min: 150, max: 150, perSlot: DOCK_SHARD_PER_SLOT, total: DOCK_SHARD_TOTAL };
  STM.rendererTest.VFX_SHARDS = STM.rendererTest.DOCK_SHARDS;
  STM.rendererTest.SHATTER_SHARDS = STM.rendererTest.DOCK_SHARDS;
  STM.rendererTest.FRAGMENTS = STM.rendererTest.DOCK_SHARDS;
  STM.rendererTest.GAP = GAP;
  STM.DOCK_SHARDS = STM.rendererTest.DOCK_SHARDS;
  STM.VFX_SHARDS = STM.rendererTest.DOCK_SHARDS;
  /* ingame-hud-render-defects: 几何唯一出口外露（纯函数——Node/N 层/rect 任意组合可测） */
  STM.rendererTest.getTileCssRect = getTileCssRect;
  STM.rendererTest.tileGridOf = tileGridOf;

})(typeof window !== 'undefined' ? window : globalThis);
