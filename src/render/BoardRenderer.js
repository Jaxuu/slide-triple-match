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
      var CELL = img.width / 4;          /* 4×4 网格边长（2048→512） */
      var PAD = Math.round(CELL * 0.04); /* 4% 内缩——避开邻格阴影 */
      var row = Math.floor(cellIndex / 4);
      var col = cellIndex % 4;
      var sx = col * CELL + PAD;
      var sy = row * CELL + PAD;
      var sw = CELL - PAD * 2;
      /* 切片分辨率 128×128（Dock/棋盘双层消费——drawImage 硬件缩放） */
      var cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      var c2 = cv.getContext('2d');
      c2.drawImage(img, sx, sy, sw, sw, 0, 0, 128, 128);
      /* 圆角遮罩（软边——融入奶油白 3D 牌面） */
      maskRounded(c2, 128);
      try {
        var d = c2.getImageData(0, 0, 128, 128);
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
        }
        c2.putImageData(d, 0, 0);
      } catch (err) { /* getImageData 安全异常（本地文件极罕见）——切片照用不杀加载 */ }
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
          img.onerror = function () { source[bid] = 'emoji'; };
          img.src = 'assets/icons/' + bid + '.png';
        })(bids[i]);
      }
    }

    /* 单张整图切片（无网格切分——直接 4% 内缩 + 白键控） */
    function whiteKeySliceSq(img) {
      var S = Math.min(img.naturalWidth, img.naturalHeight);
      var PAD = Math.round(S * 0.04);
      var cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      var c2 = cv.getContext('2d');
      c2.drawImage(img, PAD, PAD, S - PAD * 2, S - PAD * 2, 0, 0, 128, 128);
      maskRounded(c2, 128);
      try {
        var d = c2.getImageData(0, 0, 128, 128);
        var px = d.data;
        for (var i = 0; i < px.length; i += 4) {
          if (px[i] > 242 && px[i + 1] > 242 && px[i + 2] > 242) {
            var t = (248 - Math.max(px[i], px[i + 1], px[i + 2])) / 6;
            var a = Math.max(0, Math.min(1, t));
            px[i + 3] = Math.round(px[i + 3] * a * a);
          }
        }
        c2.putImageData(d, 0, 0);
      } catch (err) { /* 同 sheet——切片照用 */ }
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
      sheetCount: function () { return sheetCount; },
      SHEETS: SHEETS,
      onSpritesReady: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
      _test: { source: source, slices: slices, registerSheet: registerSheet, whiteKeySlice: whiteKeySlice }
    };
  })();

  var GRID_LINE = '#26313E';

  /* ---------- 动效参数 ---------- */
  var FLY_MS = 420;        /* 飞出动画 */
  var BLOCK_MS = 360;      /* 受阻弹回 */
  var REVEAL_MS = 380;     /* Δ7 次顶层暴露上浮 */
  var REVEAL_DELAY = 180;  /* Δ7 上浮延迟（等飞出滑块让位） */
  var PARTICLE_LIFE = 600; /* 三消粒子 */

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

  /* 径向渐变快捷：stops = [offset, color, offset, color, ...] */
  function rg(ctx, x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }

  /* =========================================================
  /* =========================================================
   * Δ14/T052b: 1:1 奶油白 3D 正方体滑块（FR-034）
   * 底部 #CBD5E1 立体厚度边 + #FFFFFF→#F4F7FB 微渐变面板 +
   * 纯白内高光描边；多层堆叠 z 阶梯偏移(-3px,-3px/层) + 层间柔和投影
   * 图案居中完整展示零遮挡（Sprite 消费——T052a）
   * 方向 = 朝向侧边缘内嵌流光胶囊角标（drawWingBadge——FR-034 §3）
   * px,py 牌中心；layerOff = Δ7 堆叠错层偏移（金字塔式）
   * ========================================================= */
  function drawTileBody(ctx, cell, px, py, t, scale, alpha, layerOff, nowMs) {
    var sv = suitVisual(t.s);
    scale = scale || 1;
    alpha = alpha == null ? 1 : alpha;
    layerOff = layerOff || 0;
    var w = cell * 0.84 * scale;
    var x = px - w / 2 + layerOff;
    var y = py - w / 2 + layerOff;
    var depth = Math.max(1, t.stackDepth || 1);
    /* Δ11/Δ14: 厚度随格宽分级收紧（8×8×5 层不越界） */
    var thickK = cell < 58 ? 0.028 : 0.035;
    var thick = cell * (thickK * depth + 0.03);
    ctx.globalAlpha = alpha;
    /* 1. 立体厚度边（#CBD5E1——底部 5px 级立体厚度投影） */
    var side = cell * 0.055;
    roundRect(ctx, x, y + side * 0.4, w, w, cell * 0.15);
    ctx.fillStyle = '#B8C4D4';
    ctx.fill();
    roundRect(ctx, x, y + side * 0.4 - thick * 0.55, w, w, cell * 0.15);
    ctx.fillStyle = '#CBD5E1';
    ctx.fill();
    /* 2. 奶油白面板（#FFFFFF → #F4F7FB 微渐变） */
    var fz = y - thick * 0.85;
    var fg = ctx.createLinearGradient(x, fz, x, fz + w);
    fg.addColorStop(0, '#FFFFFF');
    fg.addColorStop(0.62, '#FBFCFE');
    fg.addColorStop(1, '#F4F7FB');
    roundRect(ctx, x, fz, w, w, cell * 0.15);
    ctx.fillStyle = fg;
    ctx.fill();
    /* 3. 纯白高光内倒角描边 + 主题色细边 */
    ctx.strokeStyle = hexA(sv.fill, 0.55);
    ctx.lineWidth = Math.max(1.5, dprSafe(1.8));
    roundRect(ctx, x, fz, w, w, cell * 0.15);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, dprSafe(1.1));
    roundRect(ctx, x + dprSafe(1.5), fz + dprSafe(1.5), w - dprSafe(3), w - dprSafe(3), cell * 0.13);
    ctx.stroke();
    /* 4. 图鉴图案（居中完整展示——零遮挡；Sprite 缓存加速） */
    drawBestiaryIcon(ctx, sv, x + w / 2, fz + w / 2, cell * 0.31 * scale);
    /* 5. 边缘嵌入式流光方向角标（朝向侧边正中——替代面部箭头圆圈） */
    drawWingBadge(ctx, t.d, x, fz, w, cell, sv, nowMs);
    /* 6. T034 机制角标: 齿轮(右上)/冰封(全牌覆层+厚度)/锁链(四角)/钥匙(左上) */
    if (t.m === 'g') drawGearBadge(ctx, x, fz, w, cell);
    else if (t.m === 'i') drawIceOverlay(ctx, x, fz, w, cell, t.ice != null ? t.ice : (t.x || 1)); /* Δ12: 运行态字段 ice（t.x 仅 TileSpec 原始字段） */
    else if (t.m === 'k') drawKeyBadge(ctx, x, fz, w, cell);
    else if (t.m === 'c') drawChainCorners(ctx, x, fz, w, cell);
    /* Δ14: 左上角圆圈层高指示器已彻底移除（多层金字塔投影即层高视觉） */
    ctx.globalAlpha = 1;
  }

  /* 图鉴图案绘制：Sprite 命中即 drawImage；Node/无 DOM 或未命中走直绘
   * Δ15b: Sprite 内部已含贴图切片/Emoji/程序化三源级联（getSprite） */
  function drawBestiaryIcon(ctx, sv, cx, cy, R) {
    if (sv.bid != null) {
      IconAssets.ensureLoaded(); /* 惰性启动贴图加载（首绘触发） */
      if (!IconAssets.sliceCanvasOf(sv.bid)) {
        IconAssets.ensureSinglesFor([sv.bid]); /* sheet 未覆盖 → 单张按需探测 */
      }
      var sp = getSprite(sv.bid, R * 2);
      if (sp) {
        var size = R * 2 * SPRITE_PAD;
        ctx.drawImage(sp, cx - size / 2, cy - size / 2, size, size);
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
   * ========================================================= */
  function drawWingBadge(ctx, d, x, fz, w, cell, sv, nowMs) {
    var v = RE.DIR_VEC[d];
    var cx = x + w / 2 + v.dc * (w / 2 - dprSafe(3)); /* 朝向边缘内侧正中，距边 3px */
    var cy = fz + w / 2 + v.dr * (w / 2 - dprSafe(3));
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
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = Math.max(dprSafe(1.5), 1);
    ctx.strokeStyle = 'rgba(255,255,255,1)';
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
    var dpr = Math.max(1, global.devicePixelRatio || 1);
    RENDER_DPR = dpr;
    var cell = 0;
    var boardPx = 0;
    var dirty = true;
    var running = false;
    var rafId = 0;
    var anims = [];        /* {kind:'fly'|'block'|'match'|'reveal', tileId, ...} */
    var particles = [];
    var highlight = -1;    /* Hint 高亮（M4） */
    var lastProbe = null;
    var tileInfo = {};     /* M1.6: id → {s,d,z,stackDepth} 视觉缓存（滑块移除后动画仍可绘制） */
    var revealAt = {};     /* Δ7: tileId → 上浮起始时刻（含延迟） */

    function nowMs() {
      return global.performance ? global.performance.now() : Date.now();
    }

    function resize() {
      var cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
      boardPx = Math.round(cssW * dpr);
      if (canvas.width !== boardPx) canvas.width = boardPx;
      if (canvas.height !== boardPx) canvas.height = boardPx;
      cell = boardPx / (lastProbe ? lastProbe.n : 5);
      markDirty();
    }

    function markDirty() { dirty = true; start(); }

    function start() {
      if (running) return;
      running = true;
      rafId = global.requestAnimationFrame(frame);
    }

    function frame(now) {
      running = false;
      var needMore = tick(now);
      if (needMore || dirty) {
        /* Δ12: 单帧绘制异常不杀 rAF 主循环（重排程置 finally——
         * 崩溃帧仅丢一帧画面，下一帧照常调度） */
        try {
          draw();
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
          if (a.kind === 'reveal') delete revealAt[a.tileId];
          anims.splice(i, 1);
          dirty = true; /* 动画结束时强制重绘（防“末帧静默”——M1.6 渲染缺陷修复） */
        } else active = true;
      }
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.12 * dpr;
        p.life -= 16;
        if (p.life <= 0) particles.splice(i, 1);
      }
      if (particles.length > 0) active = true;
      return active;
    }

    /* 三消粒子：Δ14 图鉴主题色 12~20 个（单帧 ≤200） */
    function spawnParticles(a, now) {
      var sv = suitVisual(a.suit);
      var count = 12 + Math.floor(Math.random() * 9);
      if (particles.length + count > 200) count = Math.max(0, 200 - particles.length);
      for (var i = 0; i < count; i++) {
        particles.push({
          x: a.x, y: a.y,
          vx: (Math.random() - 0.5) * 5 * dpr,
          vy: (Math.random() - 0.9) * 5 * dpr,
          life: PARTICLE_LIFE * (0.6 + Math.random() * 0.6),
          color: sv.fill,
          size: (2 + Math.random() * 3) * dpr
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

    /* ---------- 主绘制 ---------- */
    function draw() {
      ctx.clearRect(0, 0, boardPx, boardPx);
      if (!lastProbe) return;
      var now = nowMs();
      var n = lastProbe.n;

      /* Δ15b3: 背景层已移出棋盘画布（STM.BackdropStage 全视口 #bg-canvas）——
       * 画布保持透明以透出背后高清风景图；可读性由下述磨砂暖白层保证 */

      /* Δ15b3: 磨砂暖白可读性层（半透明——与 CSS 底板 0.22 叠加后
       * 仍透出背景；滑块对比度由其自身 3D 投影 + CSS backdrop-blur 保证） */
      var veil = ctx.createRadialGradient(boardPx / 2, boardPx / 2, boardPx * 0.20, boardPx / 2, boardPx / 2, boardPx * 0.76);
      veil.addColorStop(0, 'rgba(255,252,246,0.10)');
      veil.addColorStop(0.60, 'rgba(252,246,236,0.13)');
      veil.addColorStop(1, 'rgba(240,232,220,0.18)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, boardPx, boardPx);

      /* 点阵格线（深色系在浅蒙版上保持可辨） */
      ctx.fillStyle = 'rgba(120,135,155,0.4)';
      var dotR = Math.max(1, cell * 0.035);
      for (var gr = 0; gr < n; gr++) {
        for (var gc = 0; gc < n; gc++) {
          ctx.beginPath();
          ctx.arc((gc + 0.5) * cell, (gr + 0.5) * cell, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* 棱镜（M1 关卡无——逻辑就绪，M2 T034 完整视觉） */
      drawPrisms(lastProbe.prisms);

      /* 棋盘滑块：z 升序（底层先画，顶层覆盖）
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

      /* Hint 高亮（脉冲描边，M4 启用） */
      if (highlight >= 0) {
        for (i = 0; i < tiles.length; i++) {
          if (tiles[i].id !== highlight) continue;
          var pulse = 0.5 + 0.5 * Math.sin(now / 180);
          ctx.strokeStyle = 'rgba(255,197,61,' + (0.4 + 0.6 * pulse) + ')';
          ctx.lineWidth = 3 * dpr;
          ctx.strokeRect(tiles[i].c * cell + 3, tiles[i].r * cell + 3, cell - 6, cell - 6);
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
        ctx.lineWidth = 2 * dpr;
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

    /* 棋盘滑块：Δ14 多层金字塔投影（向左上阶梯偏移 + 层间柔和投影）
     *     + Δ7 reveal 上浮；Δ11: 偏移系数按格宽分级收紧（8×8×5 层不越界） */
    function drawBoardTile(t, now) {
      var px = (t.c + 0.5) * cell;
      var py = (t.r + 0.5) * cell;
      var stackN = t.stackDepth || 1;
      var offK = cell < 58 ? 0.05 : 0.07; /* 8×8 小格 5 层错层收紧 */
      var layerOff = -cell * offK * Math.max(0, stackN - 1 - (t.z || 0));
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
      /* Δ14: 多层堆叠层间柔和投影（下层在右上投出淡影——金字塔立体厚度） */
      if (stackN > 1) {
        var aboveN = Math.max(0, stackN - 1 - (t.z || 0));
        if (aboveN > 0) {
          ctx.globalAlpha = 0.16 * aboveN;
          var w = cell * 0.84;
          roundRect(ctx, px + layerOff + cell * 0.05, py + lift + layerOff + cell * 0.05, w, w, cell * 0.15);
          ctx.fillStyle = 'rgba(90,105,125,0.55)';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      drawTileBody(ctx, cell, px + layerOff, py + lift, t, 1, 1, layerOff, now);
    }

    /* ---------- 动画绘制 ---------- */
    function drawAnim(a, prog, now) {
      var t = tileById(a.tileId);
      if (!t) return;
      if (a.kind === 'fly') {
        var seg = pathPos(a.path, prog);
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
          ctx.ellipse((seg.c + 0.5) * cell, (seg.r + 0.5) * cell + cell * 0.38, cell * 0.3 * sc, cell * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        /* Δ14: 白色推进云朵粒子（轻盈拖尾——随飞出迸发） */
        drawFlyPuff(a, prog);
        drawTileBody(ctx, cell, (seg.c + 0.5) * cell, (seg.r + 0.5) * cell - lift, t, sc, alpha, 0, now);
      } else if (a.kind === 'block') {
        var p = prog < 0.55 ? (prog / 0.55) : (1 - (prog - 0.55) / 0.45);
        var dir = RE.DIR_VEC[t.d];
        var zB = t.z || 0;
        drawTileBody(ctx, cell,
          (t.c + dir.dc * 0.38 * p + 0.5) * cell,
          (t.r + dir.dr * 0.38 * p + 0.5) * cell - zB * cell * 0.22, t, 1, 1, 0, now);
      } else if (a.kind === 'match') {
        drawTileBody(ctx, cell, a.x, a.y, t, 1 + 0.6 * prog, 1 - prog, 0, now);
      } else if (a.kind === 'gear') {
        /* T034 齿轮旋转脉冲: 牌体原地放大回弹 + 角标区高亮圈 */
        var gp = prog < 0.5 ? prog / 0.5 : (1 - (prog - 0.5) / 0.5);
        drawTileBody(ctx, cell, (t.c + 0.5) * cell, (t.r + 0.5) * cell, t, 1 + 0.12 * gp, 1, 0, now);
        ctx.beginPath();
        ctx.arc((t.c + 0.5) * cell + cell * 0.34, (t.r + 0.5) * cell - cell * 0.34, cell * 0.14 * (1 + gp), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,217,160,' + (1 - prog) + ')';
        ctx.lineWidth = Math.max(1.5, dprSafe(2));
        ctx.stroke();
      } else if (a.kind === 'unlock') {
        /* T034 锁链断开: 牌面亮闪 */
        drawTileBody(ctx, cell, (t.c + 0.5) * cell, (t.r + 0.5) * cell, t, 1, 1, 0, now);
        ctx.beginPath();
        roundRect(ctx, t.c * cell + dprSafe(2), t.r * cell + dprSafe(2), cell - dprSafe(4), cell - dprSafe(4), cell * 0.12);
        ctx.strokeStyle = 'rgba(255,200,80,' + (0.85 * (1 - prog)) + ')';
        ctx.lineWidth = Math.max(2, dprSafe(2.5));
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
          ctx.lineWidth = Math.max(2, dprSafe(3));
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
    function handleEvent(e) {
      var now = nowMs();
      if (e.e === 'flyout' && e.path && e.path.length) {
        anims.push({ kind: 'fly', tileId: e.tileId, path: e.path, t0: now, dur: FLY_MS });
      } else if (e.e === 'blocked') {
        anims.push({ kind: 'block', tileId: e.tileId, t0: now, dur: BLOCK_MS });
        if (opts.onShake) opts.onShake();
      } else if (e.e === 'match') {
        anims.push({ kind: 'match', tileId: e.ids[0], suit: e.suit, t0: now, dur: 300, x: boardPx / 2, y: -cell });
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

    /* 点击命中检测：Δ7 仅命中该格最高 z 未移除滑块 */
    function hitTest(clientX, clientY) {
      if (!lastProbe) return -1;
      var rect = canvas.getBoundingClientRect();
      var c = Math.floor((clientX - rect.left) / rect.width * lastProbe.n);
      var r = Math.floor((clientY - rect.top) / rect.height * lastProbe.n);
      if (r < 0 || r >= lastProbe.n || c < 0 || c >= lastProbe.n) return -1;
      var best = -1, bestZ = -1;
      for (var i = 0; i < lastProbe.tiles.length; i++) {
        var t = lastProbe.tiles[i];
        if (t.r !== r || t.c !== c) continue;
        if ((t.z || 0) > bestZ) { bestZ = t.z || 0; best = t.id; }
      }
      return best;
    }

    function setHighlight(tileId) {
      highlight = tileId == null ? -1 : tileId;
      markDirty();
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

    return {
      refresh: refresh,
      handleEvent: handleEvent,
      hitTest: hitTest,
      setHighlight: setHighlight,
      setLevel: setLevel,
      SUITS: SUITS
    };
  }

  /* DOM chip（Dock 槽图标——Δ14 与棋盘图鉴口径一致 / Δ15 贴图切片优先）
   * 贴图切片就绪 → 输出 <img src="DataURL">（128×128 白键控切片）；
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
        /* DataURL 缓存（贴图 bump 失效——不闪烁纪律） */
        var url = dockIconCache[bid];
        if (!url) {
          try { url = slice.toDataURL('image/png'); dockIconCache[bid] = url; }
          catch (err) { url = null; }
        }
        if (url) {
          return '<img class="chip-icon-canvas" src="' + url + '" alt="' +
            (Bestiary.entry(bid).name || '') + '" draggable="false"/>';
        }
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

  /* =========================================================
   * Δ15b3: BackdropStage — 全视口背景舞台（贴图 + 氛围滤镜 + 前景粒子）
   * · 贴图: assets/bg/bg{1..6}.{png|jpg|jpeg|webp} 逐扩展探测，
   *   Image 相对路径（file:// 双击与静态服务一致——宪章 II/III）
   * · 映射: cycleIndex = floor((level.id-1)/3)（0~19）→
   *   0~3→bg1 / 4~6→bg2 / 7~10→bg3 / 11~13→bg4 / 14~16→bg5 / 17~19→bg6
   * · 氛围: 20 循环逐环 20 档微调色温/明度（同图不同循环互异——
   *   每过 3 关一换气氛），叠在贴图之上、粒子之下
   * · 粒子: 4 族前景环境粒子（meadow 绒毛+光斑 / sea 水泡+波光 /
   *   petal 樱瓣 / star 星尘+流星）——纯函数动画（相位由 (i,t) 决定，
   *   零状态污染），低透明度低密度不干扰操作视线
   * · 兜底: 某张未加载成功 → 复用 bg1；全失败 → Canvas 渐变底色
   * ========================================================= */
  var BackdropStage = (function () {
    var BG_INDEX = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6];
    var EXT_ORDER = ['png', 'jpg', 'jpeg', 'webp'];
    var imgCache = {};   /* bg 序号 → { state:'loading'|'ready'|'failed', img } */
    var readyFns = [];   /* 贴图就绪回调（惰性换装——换装无闪烁） */

    function bgIndexOf(ci) {
      return BG_INDEX[Math.min(19, Math.max(0, ci))];
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
     * Δ15b3: 20 循环 × 20 档氛围光影（FR-035 §4 派生）
     * 同一张底图在负责的 3~4 个循环中呈现不同气氛——每过 3 关
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
      { name: '终局星辉', top: 'rgba(196,186,255,0.15)', bot: 'rgba(110,96,206,0.19)', tint: 'rgba(188,176,255,0.10)', veil: 0.22, lift: 0.00, warm: 0.02 }
    ];

    function atmosOf(ci) {
      return ATMOS[Math.min(19, Math.max(0, ci))];
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
     * · 氛围: 20 档 ATMOS 叠加（渐变 + 色温罩 + 暗角）
     * · 粒子: 4 族环境粒子（低密度低透明度——不干扰操作视线）
     * ========================================================= */
    function drawStage(ctx, levelId, W, H, tMs, dpr) {
      var ci = Math.min(19, Math.max(0, Math.floor(((levelId || 1) - 1) / 3)));
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

  STM.createBoardRenderer = createBoardRenderer;
  STM.SUITS = SUITS;
  STM.chipSVG = chipSVG;
  STM.IconAssets = IconAssets;
  STM.BackdropStage = BackdropStage;
  STM.rendererTest = { setSuitLevel: setSuitLevel, suitVisual: suitVisual, spriteCache: spriteCache, getSprite: getSprite, IconAssets: IconAssets };


})(typeof window !== 'undefined' ? window : globalThis);
