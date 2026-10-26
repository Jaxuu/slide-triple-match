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
  /* Δ22c/T112: 编舞「上一次抽取结果」与「调试锁定」都是**会话级**状态——
   * 每次 loadLevel 都会重建 renderer 实例，若放在实例作用域内，
   * 换关后「相邻两次不重复」与「评委锁定」都会失效。故提升到模块作用域。 */
  var introLastModeGlobal = -1;
  var dealModeLockGlobal = null;
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
    if (Bestiary.EMOJI && Bestiary.EMOJI.length === 90) {
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
    c2.shadowBlur = 0;
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
    /* Δ25 性能（卡顿根因）：凡是**要回读像素**的画布，一律用它拿上下文。
     * 默认 2D 上下文是 GPU 后备的，`getImageData` 要先把整块像素从显存同步
     * 拷回内存，且这条通路首次使用还有一次性初始化。实测（probes/getimg-cost.js）：
     *   默认上下文 · 冷启动首次 1024²  →  get 260.5ms + loop 16.0 + put 3.1 = 279.6ms
     *   默认上下文 · 预热后再 1024²    →  get   7.7ms + loop  5.8 + put 1.0 =  14.5ms
     *   WRF 上下文 · 冷启动首次 1024²  →  get   3.3ms + loop  4.6 + put 2.0 =   9.9ms
     *   WRF 上下文 · 连做 6 张 1024²   →  合计 78.6ms
     * WRF 画布从一开始就是 CPU 后备，压根没有「显存→内存」这一步，连一次性
     * 初始化都不存在。代价是它不参与 GPU 合成——所以**只**给中间画布加：
     * 图集、键控临时层、单张兜底切片；真正逐帧绘制的 256 切片仍用默认上下文。 */
    var WRF = { willReadFrequently: true };
    /* 白键控可用性: getImageData 首次成功即确认；file:// 跨源污染下为 false，
     * 此时贴图保留不透明白底——由 drawBestiaryIcon 用 darken 合成把白底
     * 融进卡面（见该函数注释），避免「内嵌白方框」露出。 */
    var keyingOk = true;
    var SHEETS = [
      { file: 'assets/icons/sheet1.png', base: 0,  count: 16 },
      { file: 'assets/icons/sheet2.png', base: 16, count: 16 },
      { file: 'assets/icons/sheet3.png', base: 32, count: 16 },
      { file: 'assets/icons/sheet4.png', base: 48, count: 16 },
      { file: 'assets/icons/sheet5.png', base: 64, count: 16 },
      { file: 'assets/icons/sheet6.png', base: 80, count: 16 }
    ];

    function hasDOM() { return typeof document !== 'undefined' && typeof Image !== 'undefined'; }

    /* ---- 白底 Alpha Keying（getImageData 像素处理）----
     * 近纯白（R>242&&G>242&&B>242）→ alpha 平滑过渡为 0:
     *   亮度越接近 242 → alpha 线性降（242~252 柔化带），
     *   >252 纯白 → alpha 归 0；同时羽化带做 alpha 预乘防白边
     * 切片后贴图与奶油白牌面乘性自然融合（无矩形白底残留） */
    function whiteKeySlice(img, cellIndex, base) {
      /* Δ21b/T099: 非白包围盒质心自动居中
       * Δ22: 优先使用离线预计算包围盒 STM_ICON_BBOXES（绕过 file:// getImageData 跨域限制）
       * Δ23/Bug2: 离线包围盒口径改为「只忽略最外圈 2px + 阈值 246 + 外扩 8px + 正方形」，
       *   兜底路径的运行时内缩同步从 9% 降到 0.4%（≈2px）——5%/9% 内缩会把
       *   贴边的耳朵/尾鳍/角直接切掉。 */
      var S = SLICE_PX;
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var c2 = cv.getContext('2d');
      c2.imageSmoothingEnabled = true;
      c2.imageSmoothingQuality = 'high';

      var _bboxes = (typeof global !== 'undefined' && global.STM_ICON_BBOXES) ? global.STM_ICON_BBOXES
        : ((typeof window !== 'undefined' && window.STM_ICON_BBOXES) ? window.STM_ICON_BBOXES : null);
      var _suit = (base || 0) + (cellIndex || 0);
      var _bbox = (_bboxes && _bboxes[_suit]) ? _bboxes[_suit] : null;
      if (_bbox && _bbox.sw > 0 && _bbox.sh > 0) {
        /* 离线包围盒分支：直接裁切真实非白像素区域并等比居中 */
        var ttmp = document.createElement('canvas');
        ttmp.width = S; ttmp.height = S;
        var ttctx = ttmp.getContext('2d', WRF);
        if (ttctx) {
          ttctx.imageSmoothingEnabled = true;
          ttctx.imageSmoothingQuality = 'high';
          var scale = Math.min((S * 0.92) / _bbox.sw, (S * 0.92) / _bbox.sh);
          if (!isFinite(scale) || scale <= 0) scale = 1;
          var dw = Math.max(1, Math.round(_bbox.sw * scale));
          var dh = Math.max(1, Math.round(_bbox.sh * scale));
          var dx = Math.round((S - dw) / 2);
          var dy = Math.round((S - dh) / 2);
          try { ttctx.drawImage(img, _bbox.sx, _bbox.sy, _bbox.sw, _bbox.sh, dx, dy, dw, dh); } catch (eDrawB) { /* fallthrough to runtime */ }
          /* 白键控（尽力而为——file:// 下可能失败，降级 darken） */
          var didKey = false;
          try {
            var dd = ttctx.getImageData(0, 0, S, S);
            var pp = dd.data;
            for (var pi = 0; pi < pp.length; pi += 4) {
              var aa = pp[pi + 3];
              var rr = pp[pi], gg = pp[pi + 1], bb = pp[pi + 2];
              if (aa > 20 && rr > 244 && gg > 244 && bb > 244) pp[pi + 3] = 0;
            }
            ttctx.putImageData(dd, 0, 0);
            didKey = true;
            if (typeof keyingOk !== 'undefined') keyingOk = true;
          } catch (errK) {
            if (typeof keyingOk !== 'undefined') keyingOk = false;
            try { warnOnce('IconAssets', '离线包围盒白键控不可用（' + (errK && errK.name || 'err') + '）——保留切片，绘制时改用 darken 合成'); } catch (eW) {}
          }
          c2.clearRect(0, 0, S, S);
          c2.drawImage(ttmp, 0, 0);
          /* Δ24: 键控成功时**不**上圆角遮罩——白底已被抠成透明，
           * 遮罩此时只会把主体四角（耳朵/鳍/车头）削掉；
           * 仅在键控失败（白底仍在）时才用它清掉四角硬边。 */
          if (!didKey) maskRounded(c2, S);
          cv.__sliceRect = { x: 0, y: 0, w: S, h: S };
          return cv;
        }
      }

      function process(marginRatio) {
        var cellW = img.width / 4;
        var cellH = img.height / 4;
        var row = Math.floor(cellIndex / 4);
        var col = cellIndex % 4;
        var marginX = Math.round(cellW * marginRatio);
        var marginY = Math.round(cellH * marginRatio);
        var sx = Math.round(col * cellW) + marginX;
        var sy = Math.round(row * cellH) + marginY;
        var sw = Math.round(cellW) - marginX * 2;
        var sh = Math.round(cellH) - marginY * 2;
        if (sw < 1) sw = 1;
        if (sh < 1) sh = 1;
        var tmp = document.createElement('canvas');
        tmp.width = S; tmp.height = S;
        var tctx = tmp.getContext('2d', WRF);
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        try { tctx.drawImage(img, sx, sy, sw, sh, 0, 0, S, S); }
        catch (eDraw) { return null; }

        var bbox = null;
        var edge = false;
        try {
          var d = tctx.getImageData(0, 0, S, S);
          var px = d.data;
          var minX = S, maxX = -1, minY = S, maxY = -1;
          for (var y = 0; y < S; y++) {
            for (var x = 0; x < S; x++) {
              var idx = (y * S + x) * 4;
              var a = px[idx + 3];
              var r = px[idx], g = px[idx + 1], b = px[idx + 2];
              if (a > 20 && r > 244 && g > 244 && b > 244) {
                px[idx + 3] = 0;
              } else if (a > 20 && (r < 248 || g < 248 || b < 248)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          tctx.putImageData(d, 0, 0);
          keyingOk = true;
          if (maxX >= 0) {
            bbox = { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
            if (minX <= 0 || minY <= 0 || maxX >= S - 1 || maxY >= S - 1) edge = true;
          }
        } catch (err) {
          keyingOk = false;
          warnOnce('IconAssets', '白底 Alpha Keying 不可用（' + (err && err.name || 'err') +
            '）——file:// 跨源污染或受限环境；贴图保留圆角白底，绘制时改用 darken 合成融入卡面');
        }
        return { tmp: tmp, bbox: bbox, edge: edge };
      }

      var res = process(0.004);
      if (res && res.edge) {
        var res2 = process(0);
        if (res2) res = res2;
      }
      if (!res) {
        maskRounded(c2, S);
        return cv;
      }
      var tmp = res.tmp;
      var bbox = res.bbox;
      c2.clearRect(0, 0, S, S);
      if (bbox) {
        var bw = bbox.maxX - bbox.minX + 1;
        var bh = bbox.maxY - bbox.minY + 1;
        if (bw < 1) bw = 1;
        if (bh < 1) bh = 1;
        var scale = Math.min(220 / bw, 220 / bh);
        if (!isFinite(scale) || scale <= 0) scale = 1;
        var dw = Math.max(1, Math.round(bw * scale));
        var dh = Math.max(1, Math.round(bh * scale));
        var dx = Math.round((S - dw) / 2);
        var dy = Math.round((S - dh) / 2);
        c2.drawImage(tmp, bbox.minX, bbox.minY, bw, bh, dx, dy, dw, dh);
      } else {
        /* 全白空单元：整格居中 + 整格缩放 */
        var off = Math.round((S - 220) / 2);
        c2.drawImage(tmp, 0, 0, S, S, off, off, 220, 220);
      }
      maskRounded(c2, S);
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

    /* Δ25 性能：把「每格一次像素回读」压成「每张图集一次」。
     *
     * 【为什么必须这样】旧实现 registerSheet 里对 16 格逐个调 whiteKeySlice，
     * 每格内部都做一次 `getImageData` + `putImageData`——96 格 = **96 次
     * GPU↔CPU 同步回读**。实测（probes/cpu-prof.js，L40 开局 4.5s）：
     *   whiteKeySlice  self 3819ms / 70.9%  ← 主线程被独占
     *   ensureCtx        387ms /  7.2%
     * 直接后果：开局发牌动画 p95 帧间隔 66.8ms → 683.8ms（max 1050ms），
     * 即用户报告的「开局卡牌落子很卡」。
     *
     * 【为什么不直接对整张 2048² 键控】那样数据量反而翻 4 倍
     * （96×256²=25MB → 6×2048²=100MB），实测仍有 2477ms。
     * 正确做法：先把 16 格裁切缩放拼进一张 **1024×1024 图集**（纯 drawImage），
     * 再对图集做**一次**键控，最后拆回 16 个 256 切片。
     *   · 回读次数 96 → 6
     *   · 回读数据量 25MB（与逐格相同，但同步次数降 16 倍）
     *   · 逐像素循环 6.3M 次（与逐格相同）
     * 键控是逐像素独立运算，先缩放后键控与先键控后缩放**视觉等价**
     * （双线性插值只会在近白区域内部插值，不会跨越阈值边界产生新色）。 */
    function bboxArray() {
      if (typeof global !== 'undefined' && global.STM_ICON_BBOXES) return global.STM_ICON_BBOXES;
      if (typeof window !== 'undefined' && window.STM_ICON_BBOXES) return window.STM_ICON_BBOXES;
      return null;
    }

    /* 返回 16 个 256 切片数组；键控不可用（file:// 跨源）时返回**未键控**切片，
     * 由 drawBestiaryIcon 的 darken 合成兜底（T085 断言）。 */
    function buildSheetSlices(img, base) {
      if (!hasDOM()) return null;
      var S = SLICE_PX;
      var AW = S * 4, AH = S * 4;
      var atlas = document.createElement('canvas');
      atlas.width = AW; atlas.height = AH;
      var a2 = atlas.getContext('2d', WRF);   /* Δ25: 图集要回读 → WRF */
      if (!a2) return null;
      a2.imageSmoothingEnabled = true;
      a2.imageSmoothingQuality = 'high';

      var bboxes = bboxArray();
      var cw = img.naturalWidth / 4, ch = img.naturalHeight / 4;
      for (var i = 0; i < 16; i++) {
        var ax = (i % 4) * S, ay = Math.floor(i / 4) * S;
        var bb = (bboxes && bboxes[base + i]) ? bboxes[base + i] : null;
        try {
          if (bb && bb.sw > 0 && bb.sh > 0) {
            var sc = Math.min((S * 0.92) / bb.sw, (S * 0.92) / bb.sh);
            if (!isFinite(sc) || sc <= 0) sc = 1;
            var dw = Math.max(1, Math.round(bb.sw * sc));
            var dh = Math.max(1, Math.round(bb.sh * sc));
            a2.drawImage(img, bb.sx, bb.sy, bb.sw, bb.sh,
              ax + Math.round((S - dw) / 2), ay + Math.round((S - dh) / 2), dw, dh);
          } else {
            a2.drawImage(img, Math.round((i % 4) * cw), Math.round(Math.floor(i / 4) * ch),
              Math.round(cw), Math.round(ch), ax, ay, S, S);
          }
        } catch (eCell) { /* 单格失败不杀整张 */ }
      }

      /* 一次性键控（近白 → 透明） */
      var keyed = false;
      try {
        var d = a2.getImageData(0, 0, AW, AH);
        var p = d.data;
        for (var k = 0; k < p.length; k += 4) {
          if (p[k + 3] > 20 && p[k] > 244 && p[k + 1] > 244 && p[k + 2] > 244) p[k + 3] = 0;
        }
        a2.putImageData(d, 0, 0);
        keyingOk = true;
        keyed = true;
      } catch (errS) {
        keyingOk = false;
        warnOnce('IconAssets', '图集白键控不可用（' + (errS && errS.name || 'err') +
          '）——切片保留白底，绘制时改用 darken 合成');
      }

      var out = [];
      for (var j = 0; j < 16; j++) {
        var cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        var c2 = cv.getContext('2d');
        if (c2) {
          c2.drawImage(atlas, (j % 4) * S, Math.floor(j / 4) * S, S, S, 0, 0, S, S);
          if (!keyed) maskRounded(c2, S);  /* 键控失败：清四角硬边，避免白方框 */
        }
        cv.__sliceRect = { x: 0, y: 0, w: S, h: S };
        out.push(cv);
      }
      /* 图集画布（1024² ≈ 4MB 后备）用完立即释放 */
      atlas.width = 0; atlas.height = 0;
      return out;
    }

    /* Δ23/Bug2: sheet 加载成功 → 逐格切片 16 枚 + 注册来源
     * 【铁律】base MUST 按 16 步进（0/16/32/48/64/80）——6×16 = 96 个花色。
     * 旧实现 base 按 15 步进，每张第 16 格与下一张第 1 格索引撞车
     * （谁最后 onload 谁赢），导致 75/90 个花色取到错格包围盒 →
     * 白兔左脸/红鲸鱼头部/白牦牛左侧身体被裁切。
     * Δ25: 走 buildSheetSlices 的图集批量键控（见其注释）。 */
    function registerSheet(img, base) {
      var built = null;
      try { built = buildSheetSlices(img, base); } catch (eB) { built = null; }
      for (var i = 0; i < 16; i++) {
        try {
          slices[base + i] = (built && built[i]) ? built[i] : whiteKeySlice(img, i, base);
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
      var baseFile = (cfg.file || '').replace(/\.[^.]+$/, '');
      var exts = ['png', 'jpg', 'jpeg', 'webp'];
      var seq = 0;
      function tryNext() {
        if (seq >= exts.length) return;
        var ext = exts[seq++];
        var img = new Image();
        img.onload = function () {
          if (img.naturalWidth >= 64) {
            registerSheet(img, cfg.base);
            sheetCount++;
            bumpSprites();
          }
        };
        img.onerror = tryNext;
        img.src = baseFile + '.' + ext + '?v=22';
      }
      tryNext();
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
          img.src = 'assets/icons/' + bid + '.png?v=21';
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
      var c2 = cv.getContext('2d', WRF);
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

  /* =========================================================
   * Δ27c / FR-049 §8~§10: ShardAtlas —— 3D 立体碎块图集
   *
   * 素材：assets/icons/shards.jpg（2048×2048、3×3 九宫格共 9 枚白瓷 3D 碎块、
   *       **纯黑背景**、无 alpha）。`.jpg` 为权威路径；同名 `.png` 仅作可选
   *       增强（若带 alpha 则直接使用并跳过黑底键控），MUST NOT 因缺 `.png`
   *       判定素材缺失或降级。
   *
   * 黑底键控（MUST NOT 用单阈值硬切——硬切会在碎块外圈留锯齿状黑边）：
   *   max(R,G,B) <= 24         → alpha = 0（背景）
   *   24 < max(R,G,B) <= 40    → alpha 线性渐变（吸收 JPEG 8×8 块噪声与
   *                              边缘抗锯齿过渡），并把该带像素的 RGB 提到
   *                              本格主体亮色，消除暗边/灰雾
   *   max(R,G,B) > 40          → alpha = 255
   *
   * 切片：九宫格等分（格宽 W/3 = 682.67 —— **允许小数边界**，MUST NOT 因
   *   向下取整丢掉边缘 1~2px）→ 每格求非黑包围盒 → 正方形化 →
   *   等比居中置入 256×256（几何口径沿用 FR-044 §7）→ 会话级缓存。
   * ========================================================= */
  var SHARD_SUBJECT_RATIO = 0.70; /* 256² 切片内主体长边占比。
                                   * Δ28b: 0.92 → 0.70——留出 30% 给预烘焙柔光晕，
                                   * 否则光晕会被画框裁成方角；绘制侧 drawSz = size / ratio
                                   * 保证主体可见长边仍精确等于 size。 */
  /* Δ28b: 3 套冷调玻璃色系 —— 亮度三段 ramp（暗面压色 / 中间调 / 亮面）。
   * 原素材是纯白瓷：缩到 10~46px 时 3D 明暗全部丢失，且在雪景/沙滩等浅色背景上
   * 零对比，观感退化为「白纸屑」。染色后暗面带明确色相，轮廓在任何背景上都立得住。
   * 注意：`hi` MUST NOT 取纯白（`#FFF`）——纯白会让整块碎块回到「白纸片」，
   * 必须保留色相，镜面高光交给 §16 的爆心辉光去提。 */
  /* Δ28b-2: 中间调刻意压暗一档（原 `#7AB2E8` / `#9E8AE8` / `#E89EC4` 太接近白）。
   * 素材是双峰分布（暗面 p10≈76~133 / 亮面 p50≈168~214，中间几乎没有过渡），
   * 中间调不压暗的话，拉伸后仍然只有「暗面 + 亮面」两片，暗部占比卡在 13%，
   * 且缩到 10~46px 时两块之间没有过渡色，观感仍是「白纸屑」。 */
  var SHARD_THEMES = [
    { sh: [26, 56, 132], mid: [96, 150, 208], hi: [206, 230, 255] },   /* 冰蓝 */
    { sh: [52, 38, 134], mid: [130, 112, 214], hi: [222, 212, 255] },  /* 淡紫 */
    { sh: [136, 52, 100], mid: [212, 136, 180], hi: [255, 216, 234] }  /* 粉白 */
  ];
  var SHARD_ATLAS_TOTAL = 27;   /* 9 形状 × 3 色系 */
  var SHARD_GLOW_ALPHA = 0.48;  /* 外晕强度（预烘焙，逐帧零开销） */
  var SHARD_GLOW_BLUR = 30;     /* 模糊半径（256² 画框内 ≈ 主体长边 17%） */
  var SHARD_RIM_MIX = 0.52;     /* 键控渐变带向亮面靠拢的比例（玻璃折射亮边，MUST NOT 全白） */
  /* Δ28b-2: 素材是**纯白瓷**，亮度分位实测 p2≈76~133 / p50≈168~214 / p98≈207~228——
   * 若直接 `L^1.18` 映射，中位亮度 190 会被推到 0.71，几乎全部落进亮面（实测暗部占比
   * 仅 4%~14%，即用户说的「质感差 / 白纸屑」）。必须按**每张切片自身的动态范围**归一化
   * 再做对比拉伸，把素材固有的 3D 明暗真正展开到三段 ramp 上。 */
  var SHARD_RAMP_MID = 0.55;    /* 暗面→中间调的切换点（t 归一化后） */
  var SHARD_RAMP_GAMMA = 1.62;  /* 对比拉伸指数（>1 压暗中间调，让暗面占比落 15%+） */
  var SHARD_RAMP_P_LO = 0.05;   /* 归一化下界分位 */
  var SHARD_RAMP_P_HI = 0.97;   /* 归一化上界分位 */
  var SHARD_SHADE_ALPHA = 0.34; /* 预烘焙方向光最深处的不透明度（右下背光面） */
  var ShardAtlas = (function () {
    var EXTS = ['png', 'jpg']; /* .png 优先（若带 alpha 则免键控），.jpg 为权威 */
    var state = 'idle';        /* idle | loading | ready | failed */
    var slices = [];           /* 9 个 256×256 canvas */
    var validMask = [];        /* 每格是否含有效主体 */
    var tried = 0;
    var listeners = [];
    var keyMs = 0;

    function notify() {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](slices); } catch (e) { /* 单监听异常不杀加载 */ }
      }
    }

    function nextSrc() {
      if (tried >= EXTS.length) return null;
      return 'assets/icons/shards.' + EXTS[tried++];
    }

    function loadNext() {
      var src = nextSrc();
      if (!src) { state = 'failed'; notify(); return; }
      if (typeof Image !== 'function') { state = 'failed'; notify(); return; }
      var img = new Image();
      img.onload = function () {
        try { process(img); } catch (eProc) {
          state = 'failed';
          notify();
        }
      };
      img.onerror = function () { loadNext(); };
      img.src = src;
    }

    /* 单格：键控 + 包围盒 + 正方形化 + 等比居中 */
    function buildCell(data, W, x0, x1, y0, y1, hasAlpha) {
      var bw = x1 - x0, bh = y1 - y0;
      if (bw <= 0 || bh <= 0) return null;
      var out = { w: bw, h: bh, px: new Uint8ClampedArray(bw * bh * 4) };
      var minX = bw, maxX = -1, minY = bh, maxY = -1;
      var brightSum = 0, brightN = 0;
      var fringe = []; /* [di, r, g, b] —— 渐变带像素，稍后提亮 */
      for (var y = 0; y < bh; y++) {
        var sy = y0 + y;
        for (var x = 0; x < bw; x++) {
          var si = (sy * W + (x0 + x)) * 4;
          var r = data[si], g = data[si + 1], b = data[si + 2];
          var a0 = data[si + 3];
          var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
          var a;
          if (hasAlpha && a0 < 250) {
            a = a0;
            if (a0 > 8) { /* 带 alpha 的素材直接用 */
              if (mx > 120) { brightSum += mx; brightN++; }
            }
          } else if (mx <= 24) {
            a = 0;
          } else if (mx <= 40) {
            a = Math.round(255 * (mx - 24) / 16);
            fringe.push((y * bw + x) * 4, r, g, b);
          } else {
            a = 255;
            if (mx > 120) { brightSum += mx; brightN++; }
          }
          var di = (y * bw + x) * 4;
          out.px[di] = r; out.px[di + 1] = g; out.px[di + 2] = b; out.px[di + 3] = a;
          if (a > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      /* 渐变带提亮：避免「黑底残留 → 碎块外圈灰边」的观感（不改变 alpha） */
      if (fringe.length) {
        var lift = brightN > 0 ? Math.min(255, brightSum / brightN) : 200;
        for (var fi = 0; fi < fringe.length; fi += 4) {
          var di2 = fringe[fi];
          out.px[di2] = Math.max(out.px[di2], lift * 0.86);
          out.px[di2 + 1] = Math.max(out.px[di2 + 1], lift * 0.86);
          out.px[di2 + 2] = Math.max(out.px[di2 + 2], lift * 0.86);
        }
      }
      if (maxX < minX || maxY < minY) return null;
      var bw2 = maxX - minX + 1, bh2 = maxY - minY + 1;
      var size = Math.max(bw2, bh2);
      var area = bw2 * bh2;
      if (area < bw * bh * 0.01) return null; /* 有效像素 < 1% → 视为空格 */
      return { w: bw, h: bh, px: out.px, minX: minX, minY: minY, bw: bw2, bh: bh2, size: size };
    }

    /* Δ28b: 色系 ramp 预烘成 256 项 LUT（每色系一份，模块级一次）。
     * 输入是**归一化后的** t（0..1），不是原始亮度——原始亮度要先经每切片的
     * 动态范围归一化 + 对比拉伸（见 buildCellLut）。 */
    function buildRamp(theme) {
      var lut = new Uint8ClampedArray(256 * 3);
      var sh = theme.sh, mid = theme.mid, hi = theme.hi;
      var M = SHARD_RAMP_MID;
      for (var i = 0; i < 256; i++) {
        var t = i / 255, c0, c1, u;
        if (t < M) { c0 = sh; c1 = mid; u = t / M; }
        else { c0 = mid; c1 = hi; u = (t - M) / (1 - M); }
        lut[i * 3] = c0[0] + (c1[0] - c0[0]) * u;
        lut[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * u;
        lut[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * u;
      }
      return lut;
    }
    var RAMP_LUT = (function () {
      var a = [];
      for (var i = 0; i < SHARD_THEMES.length; i++) a.push(buildRamp(SHARD_THEMES[i]));
      return a;
    })();

    /* Δ28b-2: 单切片 → 单色系的「原始亮度 → 最终颜色」一级 LUT（256 项）。
     * 把「归一化 + 对比拉伸 + 三段 ramp」三步合成一次查表，逐像素零浮点运算。 */
    function buildCellLut(themeIdx, lo, span) {
      var ramp = RAMP_LUT[themeIdx] || RAMP_LUT[0];
      var lut = new Uint8ClampedArray(256 * 3);
      var g = SHARD_RAMP_GAMMA;
      for (var i = 0; i < 256; i++) {
        var tn = span > 1 ? (i - lo) / span : i / 255;
        if (tn < 0) tn = 0; else if (tn > 1) tn = 1;
        var ri = (Math.pow(tn, g) * 255 + 0.5) | 0;
        if (ri > 255) ri = 255;
        lut[i * 3] = ramp[ri * 3];
        lut[i * 3 + 1] = ramp[ri * 3 + 1];
        lut[i * 3 + 2] = ramp[ri * 3 + 2];
      }
      return lut;
    }

    /* Δ28b: 键控期可复用的临时画布（27 次组合只申请一次，避免 50MB 级 ImageData 反复分配） */
    var _cellCv = null, _baseCv = null, _baseCtx = null, _tintCv = null, _tintCtx = null, _glowCv = null, _glowCtx = null;
    var SHARD_GLOW_CV = 72; /* 光晕底图边长（256² 的 1/13 像素量） */

    /* 把 cell 等比缩放进 256² 的「主体区」，返回该 256² 的 ImageData。
     * 之后所有染色都只在 256²（65k 像素）上做，而不是 cell 原尺寸（~465k）——
     * 这是把键控耗时从 400ms+ 压到 ~150ms 的关键（27 次 × 7 倍差距）。 */
    function buildBase256(cell) {
      if (!_cellCv) _cellCv = document.createElement('canvas');
      if (_cellCv.width !== cell.w) _cellCv.width = cell.w;
      if (_cellCv.height !== cell.h) _cellCv.height = cell.h;
      var s2 = _cellCv.getContext('2d');
      var idata0 = s2.createImageData(cell.w, cell.h);
      idata0.data.set(cell.px);
      s2.putImageData(idata0, 0, 0);

      if (!_baseCv) {
        _baseCv = document.createElement('canvas');
        _baseCv.width = 256; _baseCv.height = 256;
        /* WRF：本画布只做一次回读，避免 GPU 往返（FR-044 §10 同纪律） */
        _baseCtx = _baseCv.getContext('2d', { willReadFrequently: true }) || _baseCv.getContext('2d');
      }
      var pad = 256 * (1 - SHARD_SUBJECT_RATIO) / 2;
      var drawSize = 256 - pad * 2;
      var sq = cell.size;
      var sx = cell.minX - (sq - cell.bw) / 2;
      var sy = cell.minY - (sq - cell.bh) / 2;
      _baseCtx.clearRect(0, 0, 256, 256);
      _baseCtx.imageSmoothingEnabled = true;
      _baseCtx.imageSmoothingQuality = 'high';
      _baseCtx.drawImage(_cellCv, sx, sy, sq, sq, pad, pad, drawSize, drawSize);
      var idata = _baseCtx.getImageData(0, 0, 256, 256);
      /* Δ28b-2: 统计该切片自身的亮度分位，供对比拉伸归一化用。
       * 只在 256²（65k 像素）上扫一遍，27 次合计 ~1.7M 次加法，可忽略。 */
      var hist = new Uint32Array(256);
      var px = idata.data, opaqueN = 0;
      for (var q = 0; q < px.length; q += 4) {
        if (px[q + 3] < 200) continue;
        hist[(0.299 * px[q] + 0.587 * px[q + 1] + 0.114 * px[q + 2]) | 0]++;
        opaqueN++;
      }
      var lo = 0, hiP = 255;
      if (opaqueN > 0) {
        var acc = 0, loHit = false, hiHit = false;
        for (var b = 0; b < 256; b++) {
          acc += hist[b];
          if (!loHit && acc >= SHARD_RAMP_P_LO * opaqueN) { lo = b; loHit = true; }
          if (!hiHit && acc >= SHARD_RAMP_P_HI * opaqueN) { hiP = b; hiHit = true; break; }
        }
      }
      return { img: idata, lo: lo, span: Math.max(1, hiP - lo) };
    }

    /* 单套色系：染色 → 柔光晕打底 → 主体，返回 256² canvas */
    function composeSlice(baseInfo, theme, themeIdx) {
      var baseData = baseInfo.img;
      var lut = buildCellLut(themeIdx, baseInfo.lo, baseInfo.span);
      var hi = theme.hi;
      if (!_tintCv) {
        _tintCv = document.createElement('canvas');
        _tintCv.width = 256; _tintCv.height = 256;
        _tintCtx = _tintCv.getContext('2d');
      }
      /* 1) 逐像素染色（原始亮度 → 一级 LUT；键控渐变带推向亮面形成玻璃折射亮边） */
      var idata = _tintCtx.createImageData(256, 256);
      var src = baseData.data, dst = idata.data;
      for (var i = 0; i < src.length; i += 4) {
        var a = src[i + 3];
        if (a < 1) { dst[i + 3] = 0; continue; }
        if (a < 250) {
          /* 键控渐变带（碎块外沿）→ 向亮面靠拢 `SHARD_RIM_MIX`，形成玻璃折射亮边。
           * MUST NOT 直接置为 `hi` 纯色：那会让边缘变成一圈白描边（回到「纸片」观感）。 */
          var m = SHARD_RIM_MIX;
          dst[i] = src[i] * (1 - m) + hi[0] * m;
          dst[i + 1] = src[i + 1] * (1 - m) + hi[1] * m;
          dst[i + 2] = src[i + 2] * (1 - m) + hi[2] * m;
          dst[i + 3] = a;
          continue;
        }
        var L = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) | 0;
        if (L > 255) L = 255;
        var li = L * 3;
        dst[i] = lut[li]; dst[i + 1] = lut[li + 1]; dst[i + 2] = lut[li + 2];
        dst[i + 3] = a;
      }
      _tintCtx.putImageData(idata, 0, 0);

      /* 2) 256² 画框：柔光晕打底 + 主体 */
      var dstCv = document.createElement('canvas');
      dstCv.width = 256; dstCv.height = 256;
      var d2 = dstCv.getContext('2d');
      d2.imageSmoothingEnabled = true;
      d2.imageSmoothingQuality = 'high';
      /* 柔光晕：在 72² 的临时画布上 blur 再放大回 256²——光晕本身是低频渐变，
       * 放大无损。ctx.filter 在 Chrome/Edge 全版本、Safari 16.4+ 可用；
       * 不支持时静默跳过（只少一层辉光，主体不受影响）。
       * **逐帧绘制路径仍然严禁 filter**（FR-049 §14）。 */
      try {
        if (!_glowCv) {
          _glowCv = document.createElement('canvas');
          _glowCv.width = SHARD_GLOW_CV; _glowCv.height = SHARD_GLOW_CV;
          _glowCtx = _glowCv.getContext('2d');
        }
        var blurPx = Math.max(2, Math.round(SHARD_GLOW_BLUR * SHARD_GLOW_CV / 256));
        _glowCtx.filter = 'blur(' + blurPx + 'px)';
        if (_glowCtx.filter !== 'none' && _glowCtx.filter !== '') {
          var gp = SHARD_GLOW_CV * (1 - SHARD_SUBJECT_RATIO) / 2;
          var gd = SHARD_GLOW_CV - gp * 2;
          _glowCtx.clearRect(0, 0, SHARD_GLOW_CV, SHARD_GLOW_CV);
          _glowCtx.globalAlpha = SHARD_GLOW_ALPHA;
          _glowCtx.drawImage(_tintCv, 0, 0, 256, 256, gp, gp, gd, gd);
          _glowCtx.filter = 'none';
          _glowCtx.globalAlpha = 1;
          d2.drawImage(_glowCv, 0, 0, SHARD_GLOW_CV, SHARD_GLOW_CV, 0, 0, 256, 256);
        } else {
          _glowCtx.filter = 'none';
        }
      } catch (eBlur) { /* 无 filter 支持 → 跳过光晕 */ }
      d2.drawImage(_tintCv, 0, 0);

      /* 3) Δ28b-2 预烘焙方向光：左上受光 → 右下背光。
       * 为什么必须有这一层：素材 9 枚碎块各自的受光方向是随机的（渲染时各转各的），
       * 染色后暗面面积由「该枚自身的几何」决定——实测最平的一枚暗部只占 14.6%，
       * 且整帧碎片的光向杂乱，这正是「纸片感」的最后一层成因。参考图的高级感来自
       * **统一光源**：所有碎片左上亮、右下暗，缩到 10px 仍能读出体积。
       * 用 `source-atop` 只在已有像素上叠色，不会把 256² 画框填成方块。 */
      try {
        var lg = d2.createLinearGradient(0, 0, 256, 256);
        lg.addColorStop(0, 'rgba(18,28,58,0)');
        lg.addColorStop(0.45, 'rgba(18,28,58,' + (SHARD_SHADE_ALPHA * 0.35) + ')');
        lg.addColorStop(1, 'rgba(14,22,48,' + SHARD_SHADE_ALPHA + ')');
        d2.globalCompositeOperation = 'source-atop';
        d2.fillStyle = lg;
        d2.fillRect(0, 0, 256, 256);
        d2.globalCompositeOperation = 'source-over';
      } catch (eShade) { /* 极端环境不支持合成模式 → 跳过方向光 */ }
      return dstCv;
    }

    function process(img) {
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var W = img.naturalWidth || img.width || 0;
      var H = img.naturalHeight || img.height || 0;
      if (!(W > 0) || !(H > 0)) { state = 'failed'; notify(); return; }
      if (typeof document === 'undefined') { state = 'failed'; notify(); return; }
      var tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      /* willReadFrequently: 单次回读，避免 GPU 往返（FR-044 §10 同纪律） */
      var c2 = tmp.getContext('2d', { willReadFrequently: true }) || tmp.getContext('2d');
      if (!c2) { state = 'failed'; notify(); return; }
      c2.drawImage(img, 0, 0);
      var data;
      try { data = c2.getImageData(0, 0, W, H).data; } catch (eRead) { state = 'failed'; notify(); return; }
      /* 素材是否自带 alpha（.png 增强路径）——抽样 1/64 像素判定 */
      var hasAlpha = false;
      for (var s = 3; s < data.length; s += 4 * 64) { if (data[s] < 250) { hasAlpha = true; break; } }

      var cw = W / 3, ch = H / 3; /* 允许小数边界（2048/3 = 682.67） */
      var out = [];
      var valid = 0;
      for (var i = 0; i < 9; i++) {
        var gx = i % 3, gy = Math.floor(i / 3);
        var x0 = Math.floor(gx * cw), x1 = Math.ceil(gx * cw + cw);
        var y0 = Math.floor(gy * ch), y1 = Math.ceil(gy * ch + ch);
        if (x1 > W) x1 = W;
        if (y1 > H) y1 = H;
        var cell = buildCell(data, W, x0, x1, y0, y1, hasAlpha);
        if (!cell) {
          /* 空格：占满 3 个色系槽位，保持索引 = 形状序号 × 3 + 色系序号 */
          for (var tn = 0; tn < SHARD_THEMES.length; tn++) out.push(null);
          validMask.push(false);
          continue;
        }
        var baseData = null;
        try { baseData = buildBase256(cell); } catch (eBase) { baseData = null; }
        for (var ti = 0; ti < SHARD_THEMES.length; ti++) {
          if (!baseData) { out.push(null); continue; }
          try { out.push(composeSlice(baseData, SHARD_THEMES[ti], ti)); }
          catch (eComp) { out.push(null); }
        }
        validMask.push(true);
        valid++;
      }
      slices = out;
      state = valid > 0 ? 'ready' : 'failed';
      keyMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
      notify();
    }

    function ensureLoaded() {
      if (state !== 'idle') return;
      state = 'loading';
      loadNext();
    }
    /* 可用的切片（过滤空格；不足时以首个可用切片补位，保证索引恒有图）。
     * Δ28b: 9 形状 × 3 色系 = 27 张。 */
    function readySlices() {
      if (state !== 'ready') return null;
      var first = null;
      for (var i = 0; i < slices.length; i++) if (slices[i]) { first = slices[i]; break; }
      if (!first) return null;
      var out = [];
      for (var j = 0; j < SHARD_ATLAS_TOTAL; j++) out.push(slices[j] || first);
      return out;
    }

    return {
      ensureLoaded: ensureLoaded,
      state: function () { return state; },
      slices: readySlices,
      validCount: function () {
        var n = 0;
        for (var i = 0; i < validMask.length; i++) if (validMask[i]) n++;
        return n;
      },
      keyMs: function () { return keyMs; },
      onReady: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
      _test: {
        buildCell: buildCell,
        composeSlice: composeSlice,
        buildCellLut: buildCellLut,
        buildRamp: buildRamp,
        SUBJECT_RATIO: SHARD_SUBJECT_RATIO,
        THEMES: SHARD_THEMES,
        TOTAL: SHARD_ATLAS_TOTAL,
        GLOW_ALPHA: SHARD_GLOW_ALPHA,
        GLOW_BLUR: SHARD_GLOW_BLUR,
        RAMP_MID: SHARD_RAMP_MID,
        RAMP_GAMMA: SHARD_RAMP_GAMMA
      }
    };
  })();

  /* ---------- 动效参数 ---------- */
  var FLY_MS = 420;        /* 飞出动画（Δ27a 起飞行由 FLIGHT_* 常量接管，此项仅历史保留） */
  var BLOCK_MS = 180;      /* 受阻原地微震 */
  var REVEAL_MS = 380;     /* Δ7 次顶层暴露上浮 */
  var REVEAL_DELAY = 180;  /* Δ7 上浮延迟（等飞出滑块让位） */
  var PARTICLE_LIFE = 600; /* 三消粒子 */
  var GAP = 1;               /* T081: 同层零缝隙紧凑排布——相邻滑块间距 1px */
  var SHARD_LIFE_MIN = 650;  /* T082: 白瓷碎片生命周期 ms */
  var SHARD_LIFE_MAX = 900;
  var SHARD_COUNT_MIN = 48;
  var SHARD_COUNT_MAX = 60;  /* T084: 碎片数 MUST 落入 45~60 区间（Δ19e/FR-049） */
/* Δ20/T093 → Δ27c/T135~T136: 顶部待消槽全屏 3D 碎块瀑布
 *   · 数量收口 120~150 枚（原固定 90 枚，与 FR-049 §2 不符）
 *   · 三级尺寸按素材可见长边换算：大 26~40 / 中 14~24 / 小 8~14
 *   · 配比沿用 FR-049 §3 的 15% / 45% / 40%
 *   · 重力 920 → 2600 px/s²（原值偏轻是「慢吞吞飘落」的主因）
 *   · 生命周期恒定 480 → 420~620ms 区间随机 */
var DOCK_SHARD_TOTAL_MIN = 120;
var DOCK_SHARD_TOTAL_MAX = 150;
var DOCK_SHARD_LIFE_MIN = 420;
var DOCK_SHARD_LIFE_MAX = 620;
var DOCK_SHARD_GRAVITY = 2600;      /* px/s²（Δ27c：原 920 太飘） */
/* Δ28c: 「纸片往下掉」的根因是初速恒向下（vy >= 300）。真实的碎裂是**径向迸射**
 * ——先向四周炸开（允许向上分量），再由 2600 的重力在 0.3s 内压成下落。
 * 重力不变 → 依旧「干脆直落」，但起手有爆开的张力。
 * Δ28c-2: 初版 260~780 px/s 太爆（70ms 就铺满全屏，像礼花不像碎裂）→
 * 收敛到 140~460，并让水平/垂直增益接近 1，保证前 200ms 仍是「贴着槽位的一团」。 */
var DOCK_SHARD_SPEED_MIN = 140;     /* 迸射初速下限 px/s */
var DOCK_SHARD_SPEED_MAX = 460;     /* 迸射初速上限 px/s */
var DOCK_SHARD_VX_GAIN = 1.05;      /* 水平分量增益 */
var DOCK_SHARD_VY_GAIN = 0.85;      /* 垂直分量增益 */
var DOCK_SHARD_UP_MAX = 300;        /* 向上分量上限 px/s（0.35s 内必被重力拉回） */
var DOCK_SHARD_DOWN_BIAS = 140;     /* 向下偏置 px/s */
var DOCK_SHARD_ALPHA_MIN = 0.84;    /* Δ28c: 半透明玻璃感（原为全不透明 1.0） */
var DOCK_SHARD_ALPHA_MAX = 0.96;
var DOCK_SHARD_VR_MIN = 4;          /* 角速度下限 rad/s */
var DOCK_SHARD_RATIO_LARGE = 0.15;
var DOCK_SHARD_RATIO_MEDIUM = 0.45;
/* Δ28c: 三级尺寸整体上调 ~30%——256² 素材缩到 8~24px 时 3D 明暗全部糊成白块，
 * 放大后才看得出瓷面折面与暗面。 */
var DOCK_SHARD_SIZE_LARGE = [30, 46];
var DOCK_SHARD_SIZE_MEDIUM = [18, 28];
var DOCK_SHARD_SIZE_SMALL = [10, 15];
var DOCK_SHARD_ATLAS_KINDS_MIN = 6; /* 同一帧内至少 6 种不同切片 */

/* Δ27a / FR-053: 卡牌点击方向性飞行轨迹（纯表现层）
 *   U（朝上）    —— 单段直飞入槽，<= 240ms
 *   L / R / D    —— 两段制：先顺箭头滑出棋盘（<= 140ms），再自槽位上沿落入，
 *                   总时长 <= 320ms
 *   全段 alpha >= 0.55（MUST NOT 中途淡出到不可辨） */
var FLIGHT_U_MS = 220;              /* U 向单段（上限 240） */
var FLIGHT_EXIT_MS_MIN = 80;        /* 离场段下限 */
var FLIGHT_EXIT_MS_MAX = 140;       /* 离场段上限（FR-053 §4） */
var FLIGHT_DROP_MS = 170;           /* 落槽段 */
var FLIGHT_TOTAL_MS_MAX = 320;      /* L/R/D 总时长上限 */
var FLIGHT_ALPHA_MIN = 0.55;        /* 全段 alpha 下限 */
var FLIGHT_EXIT_SPEED = 1.9;        /* 离场段基准速度 px/ms ≈ 1900px/s */
var FLIGHT_END_SCALE = 0.82;        /* 落定时等比缩至槽内卡片量级（44/57≈0.77） */
var FLIGHT_DROP_SCALE0 = 0.92;      /* 落槽段起点缩放 */
var FLIGHT_REDUCED_MS = 90;         /* prefers-reduced-motion：零位移直接落定 */

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
   * ========================================================= */
  /* px,py 牌中心（CSS 像素——draw() 已按 dpr 建立缩放矩阵）
   * Δ22c/T111: scaleX/scaleY 为**可选的等比/非等比缩放**（默认等于 scale）。
   *   · 只影响牌体矩形的宽高与图标基准，**不使用 ctx.scale**——
   *     Δ15b3f 铁律「变换矩阵只经 setTransform 绝对赋值」继续成立；
   *   · 其余调用点不传后两参 → w === h === (cell-GAP)*scale，与原实现逐像素一致。
   * ========================================================= */
  function drawTileBody(ctx, cell, px, py, t, scale, alpha, nowMs, scaleX, scaleY) {
    var sv = suitVisual(t.s);
    scale = scale || 1;
    alpha = alpha == null ? 1 : alpha;
    var base = Math.max(1, cell - GAP); /* tileSize = cellStep - 1 */
    var kx = (scaleX == null) ? scale : scaleX;
    var ky = (scaleY == null) ? scale : scaleY;
    if (!(kx > 0)) kx = 0.0001;
    if (!(ky > 0)) ky = 0.0001;
    var w = base * kx;
    var h = base * ky;
    var r = Math.round(Math.min(w, h) * 0.20);
    var x = px - w / 2;
    var y = py - h / 2;
    ctx.globalAlpha = alpha;
    /* 1. 底部 4px 立体厚度层 */
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y + 4, w, h, r);
    ctx.fillStyle = '#CBD5E1';
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    /* 2. 温润奶油白牌面 */
    var fg = ctx.createLinearGradient(x, y, x, y + h);
    fg.addColorStop(0, '#FFFFFF');
    fg.addColorStop(1, '#FFFFFF');
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fg;
    ctx.fill();
    /* 顶部内侧 1px 纯白高光边 */
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2), Math.max(1, r - 1));
    ctx.stroke();
    /* 外侧 1px solid #E2E8F0 柔和边界 */
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
    /* 3. 图鉴图案（基准取短边——百叶窗翻转时不拉伸变形）
     * Δ24: 0.82 → 0.93。切片内部已把主体归一化到 0.92×画布，
     *   故 0.93 × 0.92 ≈ 主体长边占卡面 86%，四周各留约 7% 呼吸位
     *   （用户口径：「充实地占满卡牌，边缘留 10% 空间」）。
     *   旧 0.82 叠上被投影撑大的包围盒，主体实际只有卡面 47%~75%。 */
    drawBestiaryIcon(ctx, sv, x + w / 2, y + h / 2, Math.round(Math.min(w, h) * 0.93));
    /* 零偏移原位被压变暗 */
    // covered = RulesEngine.isCovered(state, tile) 或 probe.covered
    var covered = (t && t.covered === true);
    if (covered === true) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      roundRect(ctx, x, y, w, h, r);
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
   * Δ22c / FR-052：15 种开局卡牌进场编舞（纯运动学表现层）
   *
   * 时序（ms，自 startDeal 起算）——Δ27b §10 起改为**按牌数自适应**：
   *   0 ~ 180              纯背景留白——全盘 alpha=0，仅透出关卡风景底图
   *   180 ~ 180+spread     逐牌错峰起点（spread = max(260, (N-1)×12)）
   *   + z × 55             层高补偿（**恒正**——永远先落底层、后落顶层）
   *   + 260                单卡持续时长
   *
   *   total = 180 + max(260, (N-1)×12) + 260 + 55×zMax
   *   实测：L1(N=18,z=0)=700ms / L46(N=84,z=2)=1546ms / L33(N=141,z=4)=2340ms
   *
   * Δ27b §9 为什么必须逐牌错峰（而不是固定 340ms 展开期）：
   *   旧式 delay = LEAD + ord×340 + z×55 在满载盘（N=141）下单帧在途
   *   ≈ 141×260/340 ≈ 108 张 —— 这就是用户报告的「一大坨同时砸下来」。
   *   改为「按编舞序 rank 均匀错峰、步长 >= 12ms」后单帧在途恒 <= 22 张
   *   （260/12 ≈ 21.7），逐张可辨。
   *
   * 安全不变量（MUST）：
   *   ① 绘制顺序 100% 复用静态层同一比较器
   *      (a.z-b.z)||(a.r-b.r)||(a.c-b.c)——本模块**只产生每张牌的
   *      位移/缩放/透明度**，绝不重排、绝不改 tile 属性；
   *   ② 动画结束后 introTransformOf 返回 null → 走静态路径，
   *      卡牌 100% 精确落在 getTileCssRect 给出的标准网格坐标；
   *   ③ 编舞期间不触发任何 Solver / 关卡生成 / 持久化写入。
   * ========================================================= */
  var INTRO_LEAD_MS = 180;        /* 纯背景留白（兼作解码/预排版窗口） */
  var INTRO_STAGGER_MS = 12;      /* 逐牌错峰步长（硬下限——见 §9） */
  var INTRO_SPREAD_MIN_MS = 260;  /* 展开期下限（小盘保护——避免「啪一下全出来」） */
  var INTRO_Z_STEP_MS = 55;       /* 每层 +55ms（零穿模的关键，常量不许改） */
  var INTRO_TILE_MS = 260;        /* 单卡进场持续时长（常量不许改） */
  var INTRO_TICK_AT = 0.85;       /* 落盘定格瞬间 → 落牌涟漪音 */
  var INTRO_ALPHA0 = 0.62;        /* Δ27b §8 入场起点透明度（>= 0.55——不再从 0 起跳发灰） */
  var INTRO_ALPHA_MIN_SAFE = 0.55;/* 起点透明度硬下限（FR-052 §8） */
  var INTRO_ALPHA_FULL_AT = 0.35; /* 入场进度 35% 内 alpha 必须达到 1.0 */
  var INTRO_SCALE_MAX = 1.15;     /* 等比放大上限（超出即令 256² 切片上采样发虚） */
  var INTRO_SCALE_MIN = 0.2;      /* 等比缩小起点下限 */
  var INTRO_NONUNI_MIN = 0.55;    /* 非等比压缩较小轴下限（低于此值图案即「糊」） */
  var INTRO_MODES = [
    'diagonal_cascade', 'center_ripple', 'outer_converge', 'spiral_vortex',
    'wings_clasp', 'sky_rain', 'layer_stack', 'zipper_interleave',
    'windmill_quadrants', 'v_formation', 'checkerboard_weave', 'blinds_flip',
    'deck_deal', 'tailwind_glide', 'starlight_scatter'
  ];

  function introEaseOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
  function introEaseOutQuart(p) { return 1 - Math.pow(1 - p, 4); }
  function introEaseOutBack(p) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }
  function introEase(kind, p) {
    if (p <= 0) return 0;
    if (kind === 'back') return introEaseOutBack(p);
    if (kind === 'quart') return introEaseOutQuart(p);
    return introEaseOutCubic(p);
  }

  /* 距棋盘中心的归一化欧氏距离（0=正中，1=四角） */
  function introDist01(r, c, n) {
    var h = (n - 1) / 2;
    var dx = c - h, dy = r - h;
    var d = Math.sqrt(dx * dx + dy * dy);
    var dmax = Math.sqrt(h * h + h * h) || 1;
    return { d: Math.max(0, Math.min(1, d / dmax)), dx: dx, dy: dy, len: d };
  }

  /* =========================================================
   * introSchedule —— 错峰排程的**纯函数**（Δ27b §9）
   * 「逐张可辨 + 零穿模」两条互斥约束的唯一出口，可离线断言。
   *
   *   entries : [{ z, key }]，数组顺序 = 编舞序（buildIntroPlan 的 ord 排序结果）
   *             key = 渲染坐标（`r,c`）——同 key 即同像素位置（会叠在一起）
   *   zMax    : 棋盘最大层高
   *   → { list: [{ idx, z, delay }], step, spread, totalMs }
   *
   * 三步，三个不变量：
   *   ① spread = max(260, (N-1)×12) + zMax×55（容量自适应，见 FR-052 §10）
   *   ② **同坐标层序锁**：把同一 (r,c) 组占用的槽位按升序重新分配给
   *      z 升序的成员——槽位集合不变（展开期/步长/在途上限全不受影响），
   *      仅组内重排，于是「同坐标先底层后顶层」从启发式变成**硬保证**。
   *      （旧式 delay = LEAD + i×12 + z×55 只在高层不早于低层 4 个名次时成立，
   *       实测 15 模式中有模式越界 → 会穿模）
   *   ③ delay = LEAD + 最终名次×step → 相邻恒差 step >= 12ms，
   *      单帧在途恒 <= ceil(260/12) = 22 张
   * ========================================================= */
  function introSchedule(entries, zMax) {
    var src = entries || [];
    var cnt = src.length || 1;
    var zz = zMax > 0 ? zMax : 0;
    var spread = Math.max(INTRO_SPREAD_MIN_MS, (cnt - 1) * INTRO_STAGGER_MS) + zz * INTRO_Z_STEP_MS;
    var step = cnt > 1 ? spread / (cnt - 1) : 0;
    var i;

    /* ① 初始槽位：编舞序 × step（槽位集合 = 最终落点集合，只做组内重排） */
    var slots = [];
    for (i = 0; i < src.length; i++) slots.push(i * step);

    /* ② 同坐标层序锁 */
    var groups = {};
    for (i = 0; i < src.length; i++) {
      var gk = src[i].key != null ? String(src[i].key) : ('#' + i);
      if (!groups[gk]) groups[gk] = [];
      groups[gk].push(i);
    }
    var base = slots.slice();
    for (var k in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, k)) continue;
      var idxs = groups[k];
      if (idxs.length < 2) continue;
      var used = [];
      for (i = 0; i < idxs.length; i++) used.push(slots[idxs[i]]);
      used.sort(function (a, b) { return a - b; });
      idxs.sort(function (a, b) {
        var az = src[a].z || 0, bz = src[b].z || 0;
        if (az !== bz) return az - bz;
        return a - b;
      });
      for (i = 0; i < idxs.length; i++) base[idxs[i]] = used[i];
    }

    /* ③ 按槽位定最终名次 → 均匀落点 */
    var keyed = [];
    for (i = 0; i < src.length; i++) keyed.push({ idx: i, z: src[i].z || 0, base: base[i] });
    keyed.sort(function (a, b) { return a.base - b.base || a.idx - b.idx; });
    var out = [];
    for (i = 0; i < keyed.length; i++) {
      out.push({ idx: keyed[i].idx, z: keyed[i].z, delay: INTRO_LEAD_MS + i * step });
    }
    return { list: out, step: step, spread: spread, totalMs: INTRO_LEAD_MS + spread + INTRO_TILE_MS };
  }

  /* =========================================================
   * 飞行运动学（模块级纯函数——离线可断言，不依赖实例状态）
   * ========================================================= */
  function quadBez(a, b, c, t) {
    var u = 1 - t;
    return u * u * a + 2 * u * t * b + t * t * c;
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smoothstep(a, b, v) {
    var t = clamp01((v - a) / ((b - a) || 1e-6));
    return t * t * (3 - 2 * t);
  }

  /* 飞行位置/缩放/透明度
   *   U（dir=0）：单段二次贝塞尔，控制点上提 74% → 轻微上扬后俯冲入槽
   *   L/R/D    ：两段制——① 顺箭头加速滑出棋盘矩形（p²）② 自 toY-dropH 落入
   * 全段 alpha 恒 1（MUST NOT 淡出——那是「飞到半空消失」的成因） */
  function flightPos(f, el) {
    if (f.reduced) {
      return { x: f.toX, y: f.toY, sx: 1, sy: 1, alpha: 1, p: 1, phase: 'drop' };
    }
    if (f.dir === 0) {
      var p = clamp01(el / f.dur);
      var e = introEaseOutCubic(p);
      var cx = f.fromX + (f.toX - f.fromX) * 0.18;
      var cy = f.fromY - (f.fromY - f.toY) * 0.74;
      var s = 1 - (1 - FLIGHT_END_SCALE) * smoothstep(0.62, 1, p);
      return {
        x: quadBez(f.fromX, cx, f.toX, e),
        y: quadBez(f.fromY, cy, f.toY, e),
        sx: s, sy: s, alpha: 1, p: p, phase: 'board'
      };
    }
    if (el <= f.dur1) {
      var p1 = clamp01(el / f.dur1);
      var e1 = p1 * p1; /* 加速滑出 */
      var k = f.d1 * e1;
      return {
        x: f.fromX + f.dx * k,
        y: f.fromY + f.dy * k,
        sx: 1, sy: 1, alpha: 1, p: p1, phase: 'exit'
      };
    }
    var p2 = clamp01((el - f.dur1) / f.dur2);
    var e2 = introEaseOutCubic(p2);
    var s2 = FLIGHT_DROP_SCALE0 + (FLIGHT_END_SCALE - FLIGHT_DROP_SCALE0) * e2;
    return {
      x: f.toX,
      y: f.toY - (1 - e2) * f.dropH,
      sx: s2, sy: s2, alpha: 1, p: p2, phase: 'drop'
    };
  }

  /* 牌矩形是否与棋盘矩形相交（画布 CSS 坐标系）→ 决定 board / offboard 段 */
  function flightSegOf(pos, cellPx, cssSizePx) {
    var hw = cellPx * 0.5 * (pos.sx || 1);
    var hh = cellPx * 0.5 * (pos.sy || 1);
    if (pos.x + hw <= 0 || pos.x - hw >= cssSizePx) return 'offboard';
    if (pos.y + hh <= 0 || pos.y - hh >= cssSizePx) return 'offboard';
    return 'board';
  }

  /* =========================================================
   * introSpecOf —— 15 种编舞的**纯函数**规格表（可离线断言）
   *   mode   : 0..14
   *   t      : 渲染探针 tile（需 r / c / z / d / id）
   *   n      : 棋盘边长（格）
   *   rank   : 该牌在 id 升序中的序号（deck_deal 发牌序）
   *   total  : 卡牌总数
   * 返回 { ord∈[0,1], ox, oy (px), oxc, oyc (格), sx, sy, a0, ease, wipe }
   *   ord  越大 → 越晚落定
   *   a0   入场起点透明度 —— Δ27b §8 恒 >= 0.55（不再从 0 起跳，否则图案
   *        前三分之一时长始终「发灰」，正是用户报告的模糊感来源之一）
   *   wipe true → 遮罩揭示（逐帧变宽的水平裁切），sx/sy 恒 1；
   *        替代 blinds_flip 旧式的 scaleX 0.05 几何压缩（非等比压到 0.05
   *        时图案已严重变形、观感即「糊」，Δ27b §8 明令禁止）
   * ========================================================= */
  function introSpecOf(mode, t, n, rank, total) {
    var r = t.r || 0, c = t.c || 0;
    var nn = n > 1 ? n : 2;
    var h = (nn - 1) / 2;
    var z = t.z || 0;
    var totalN = total > 1 ? total : 1;
    var cd = introDist01(r, c, nn);
    var out = { ord: 0, ox: 0, oy: 0, oxc: 0, oyc: 0, sx: 1, sy: 1, a0: INTRO_ALPHA0, ease: 'cubic', wipe: false };

    switch (mode) {
      case 0: /* diagonal_cascade —— 对角瀑布流：左上 → 右下斜向波浪落下 */
        out.ord = (r + c) / (2 * (nn - 1));
        out.oy = -45;
        break;
      case 1: /* center_ripple —— 中心涟漪绽放：由近及远 Ease-Out-Back 弹出 */
        out.ord = cd.d;
        out.sx = out.sy = INTRO_SCALE_MIN; /* 0.2 起（等比，不受非等比下限约束） */
        out.ease = 'back';
        break;
      case 2: /* outer_converge —— 外环聚拢：由远及近，自外 60px 向内滑入 */
        out.ord = 1 - cd.d;
        if (cd.len > 0.0001) {
          out.ox = (cd.dx / cd.len) * 60;
          out.oy = (cd.dy / cd.len) * 60;
        }
        break;
      case 3: { /* spiral_vortex —— 螺旋星璇：极角 + 半径构成螺旋序依次弹入 */
        var ang = Math.atan2(cd.dy, cd.dx);
        var an = ((ang + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
        out.ord = 0.62 * an + 0.38 * cd.d;
        var amp = 55 * (0.45 + 0.55 * cd.d);
        out.ox = Math.cos(ang - 0.9) * amp;
        out.oy = Math.sin(ang - 0.9) * amp;
        out.sx = out.sy = 0.55;
        out.ease = 'back';
        break;
      }
      case 4: /* wings_clasp —— 双翼合拢：左半自左、右半自右，中央最后咬合 */
        out.ord = 0.85 * (1 - Math.abs(c - h) / (h || 1)) + 0.15 * (r / (nn - 1));
        out.ox = c < nn / 2 ? -120 : 120;
        break;
      case 5: /* sky_rain —— 天降甘霖：列/行错落，自 -90px 带回弹落下 */
        out.ord = 0.45 * (c / (nn - 1)) + 0.55 * (r / (nn - 1));
        out.oy = -90;
        out.ease = 'back';
        break;
      case 6: /* layer_stack —— 层峦叠嶂：z=0→4 整层分批自上方放大压下 */
        out.ord = (z + (r + c) / (2 * (nn - 1))) / 5;
        out.oy = -50;
        out.sx = out.sy = 1.14;
        out.ease = 'quart';
        break;
      case 7: /* zipper_interleave —— 交错拉链：偶数行自左、奇数行自右 */
        out.ord = (r + 0.4 * (c / (nn - 1))) / (nn - 1 + 0.4);
        out.ox = (r % 2 === 0) ? -100 : 100;
        break;
      case 8: { /* windmill_quadrants —— 风车四象限：TL/TR/BR/BL 四向切入 */
        var q = (r < nn / 2) ? (c < nn / 2 ? 0 : 1) : (c < nn / 2 ? 3 : 2);
        out.ord = q * 0.25 + cd.d * 0.25;
        if (q === 0) out.ox = -90;
        else if (q === 1) out.oy = -90;
        else if (q === 2) out.ox = 90;
        else out.oy = 90;
        break;
      }
      case 9: /* v_formation —— V 字雁阵：r + |c - centerC| 呈 V 字波浪自上方 */
        out.ord = (r + Math.abs(c - h)) / (nn - 1 + h);
        out.oy = -70;
        break;
      case 10: /* checkerboard_weave —— 棋盘格交织：偶格前半拍、奇格后半拍 */
        out.ord = ((r + c) % 2 === 0)
          ? (r / (nn - 1)) * 0.45
          : 0.5 + (r / (nn - 1)) * 0.45;
        out.oy = -40;
        out.sx = out.sy = 0.7;
        break;
      case 11: /* blinds_flip —— 百叶窗揭示：按列从左到右**遮罩逐帧变宽**
       * Δ27b §8: 旧式 scaleX 0.05 属非等比几何压缩，图案被压到原宽 5% 时
       * 已严重变形（观感即「糊」），且 min(sx,sy)=0.05 < 0.55 违反下限。
       * 现改为等尺寸 + 水平裁切揭示：牌体始终 1:1 绘制，只裁可见宽度。 */
        out.ord = c / (nn - 1);
        out.wipe = true;
        break;
      case 12: /* deck_deal —— 中心发牌式：起点=棋盘正中，按 id 序飞散铺开 */
        out.ord = rank / (totalN - 1);
        out.oxc = h - c;
        out.oyc = h - r;
        out.sx = out.sy = 0.55;
        out.ease = 'quart';
        break;
      case 13: /* tailwind_glide —— 顺风滑入：沿自身箭头 d 的后方滑入 */
        out.ord = (r + c) / (2 * (nn - 1));
        if (t.d === 1) out.ox = -55;        /* 朝右 R → 自左侧滑入 */
        else if (t.d === 3) out.ox = 55;    /* 朝左 L → 自右侧滑入 */
        else if (t.d === 0) out.oy = 55;    /* 朝上 U → 自下方滑入 */
        else out.oy = -55;                  /* 朝下 D → 自上方滑入 */
        break;
      case 14: /* starlight_scatter —— 星雨点亮：伪随机均匀散点缩放点亮 */
        out.ord = (((t.id || 0) * 7 + 3) % totalN) / (totalN - 1);
        out.sx = out.sy = 0.35;
        break;
      default:
        out.ord = (r + c) / (2 * (nn - 1));
        out.oy = -45;
        break;
    }
    if (!isFinite(out.ord)) out.ord = 0;
    if (out.ord < 0) out.ord = 0;
    if (out.ord > 1) out.ord = 1;
    /* Δ27b §8 清晰度硬边界（纯函数层收口，杜绝任何模式越界）：
     *   ① 等比放大 <= 1.15（超出即令 256² 图标切片上采样发虚）
     *   ② 等比缩小起点 >= 0.2
     *   ③ 非等比压缩较小轴 >= 0.55（低于此值图案严重变形）
     *   ④ 起点透明度 >= 0.55（不从 0 起跳） */
    if (!(out.sx > 0)) out.sx = 1;
    if (!(out.sy > 0)) out.sy = 1;
    if (out.sx > INTRO_SCALE_MAX) out.sx = INTRO_SCALE_MAX;
    if (out.sy > INTRO_SCALE_MAX) out.sy = INTRO_SCALE_MAX;
    if (out.sx < INTRO_SCALE_MIN) out.sx = INTRO_SCALE_MIN;
    if (out.sy < INTRO_SCALE_MIN) out.sy = INTRO_SCALE_MIN;
    var nonUni = Math.abs(out.sx - out.sy) > 0.1;
    if (nonUni) {
      if (out.sx < INTRO_NONUNI_MIN) out.sx = INTRO_NONUNI_MIN;
      if (out.sy < INTRO_NONUNI_MIN) out.sy = INTRO_NONUNI_MIN;
    }
    if (!(out.a0 >= INTRO_ALPHA_MIN_SAFE)) out.a0 = INTRO_ALPHA_MIN_SAFE;
    return out;
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
    var vfxShards = [];
    /* Δ28d: 爆心闪光——碎裂瞬间在 3 槽包围盒中心打一次 180ms 的径向辉光
     * （`lighter` 混合）。这是参考效果「高级感」的关键一层：碎片再通透，
     * 没有爆心的 bloom 就只是「纸屑散开」。一次性开销（每帧 1 次 gradient fill）。 */
    var vfxFlash = null;
    /* Δ28d: 记录上一帧 VFX 层是否还有内容——由「有」转「空」时必须补一次清屏，
     * 否则最后一帧碎片会被永久冻结在画布上（详见 tick 尾部注释）。 */
    var vfxWasLive = false;
    var lastTickTime = null;     /* Δ20/T093: 全屏 #vfx-canvas 白瓷碎片瀑布池 */
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
    /* flight-neighbor-morph-dock-inset（Bug 1）: 受阻微震的水平位移表。
     * 原实现在动画层 drawAnim('block') 里整块重绘卡体，而动画层整体叠在静态层
     * 之后、不做 z 交错 → 低层牌会盖住压在其格心上的高层牌（层次反转）。
     * 现改为每帧在 draw() 里算出位移，交给静态层 drawBoardTile 施加，
     * 使抖动天然遵守 z 序。 */
    var blockDx = {};

    /* ---------- Δ27a / FR-053: 方向性飞行运行态 ----------
     * flights     : 在途飞行表（每张牌一条，独立计时，互不取消）
     * pendingDock : tileId → slotIndex —— `dock` 事件（RulesEngine:410/549/667）
     *               先于 `flyout` 下发（GameState:277），据此做 1:1 精确配对；
     *               废弃旧 `lastDockSlot` 全局推测（连点时必然错位）
     * dockSlotGeo : slotIndex → 画布坐标中心（缓存；**严禁逐帧读 DOM**——
     *               getBoundingClientRect() 会强制同步布局） */
    var flights = [];
    var pendingDock = {};
    /* Δ27a/FR-053 §5：本帧静态层的实际绘制序（tileId 序列）——仅供门禁断言
     * 「飞行牌与静止牌共用同一 (z,r,c) 升序」，不参与运行时逻辑。 */
    var lastDrawOrder = [];
    var dockSlotGeo = null;
    var dockSlotGeoLen = 0;

    /* ---------- Δ22c/T111: 开局进场编舞运行态 ---------- */
    var introAnim = null;        /* { startTime, mode, active, totalMs } */
    var introPlan = null;        /* tileId → { delay, ord, ox, oy, oxc, oyc, sx, sy, a0, ease } */
    var introTicked = {};        /* tileId → true（落牌涟漪音只响一次） */
    /* introLastMode / dealModeLock 见模块作用域（跨 renderer 实例存活） */
    var reducedMotion = false;
    try {
      if (typeof global.matchMedia === 'function') {
        reducedMotion = !!global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    } catch (eRM) { reducedMotion = false; }

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
      /* Δ27a/FR-053 §3: 棋盘矩形 / 缩放比变化 → 待消槽几何缓存必须作废
       * （窗口缩放、方向切换后飞行终点重新取实时 getBoundingClientRect） */
      invalidateDockGeometry();
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

    /* =========================================================
     * Δ22c/T111: 开局进场编舞——启动 / 计划 / 逐帧变换 / 落子音
     * ========================================================= */

    /* 抽取一种编舞（相邻两次开局 MUST NOT 重复；锁定优先） */
    function pickIntroMode() {
      if (dealModeLockGlobal != null && isFinite(dealModeLockGlobal)) {
        var lm = dealModeLockGlobal | 0;
        return (lm >= 0 && lm < INTRO_MODES.length) ? lm : 0;
      }
      if (introLastModeGlobal < 0 || introLastModeGlobal >= INTRO_MODES.length) {
        return Math.floor(Math.random() * INTRO_MODES.length);
      }
      /* 从「除上一次之外的 14 种」里等概率抽——数学上保证相邻不重复 */
      var k = Math.floor(Math.random() * (INTRO_MODES.length - 1));
      if (k >= introLastModeGlobal) k += 1;
      return k;
    }

    /* 启动进场动画；modeIdx 省略 → 按不重复规则抽取。返回实际使用的模式号 */
    function startDeal(modeIdx) {
      var m;
      if (modeIdx != null && isFinite(modeIdx)) {
        m = modeIdx | 0;
        if (m < 0 || m >= INTRO_MODES.length) m = 0;
      } else {
        m = pickIntroMode();
      }
      introLastModeGlobal = m;
      introAnim = { startTime: nowMs(), mode: m, active: true, totalMs: 0 };
      introPlan = null;
      introTicked = {};
      markDirty();
      return m;
    }

    /* 点击快进：立刻归位（introTransformOf 随即返回 null → 静态精确坐标） */
    function skipDeal() {
      var wasActive = !!(introAnim && introAnim.active);
      if (introAnim) introAnim.active = false;
      introPlan = null;
      dirty = true;
      markDirty();
      return wasActive;
    }

    function isDealing() { return !!(introAnim && introAnim.active); }
    function dealMode() { return introAnim ? introAnim.mode : -1; }
    function dealModeName() {
      var m = dealMode();
      return (m >= 0 && m < INTRO_MODES.length) ? INTRO_MODES[m] : '';
    }
    function dealTotalMs() { return introAnim ? (introAnim.totalMs || 0) : 0; }

    /* 剩余时长（main.js 据此把挑战横幅/教学卡推迟到编舞完成之后）
     * Δ27b §10: 兜底常量改为**按公式**（180 + max(260,(N-1)×12) + 260 + 55×zMax）。
     * 闸门 MUST 读本函数而非常量——点击快进会让实际剩余提前归零。 */
    function dealRemainingMs() {
      if (!introAnim || !introAnim.active) return 0;
      var total = introAnim.totalMs || introDealTotalMs(
        (lastProbe && lastProbe.tiles) ? lastProbe.tiles.length : 18,
        introMaxZOf()
      );
      var left = introAnim.startTime + total - nowMs();
      return left > 0 ? left : 0;
    }

    /* FR-052 §10 权威时长公式（纯函数——可离线断言） */
    function introDealTotalMs(n, zMax) {
      var cnt = n > 0 ? n : 1;
      var zz = zMax > 0 ? zMax : 0;
      var spread = Math.max(INTRO_SPREAD_MIN_MS, (cnt - 1) * INTRO_STAGGER_MS);
      return INTRO_LEAD_MS + spread + INTRO_TILE_MS + INTRO_Z_STEP_MS * zz;
    }
    function introMaxZOf() {
      var tiles = (lastProbe && lastProbe.tiles) ? lastProbe.tiles : [];
      var zMax = 0;
      for (var i = 0; i < tiles.length; i++) {
        var z = tiles[i].z || 0;
        if (z > zMax) zMax = z;
      }
      return zMax;
    }

    /* 构建逐牌计划（延迟 / 起点偏移 / 起点缩放 / 起点透明度）
     *
     * Δ27b §9 逐牌错峰：先按编舞序 ord 排序，同 ord 再按 (z, r, c, id) 打破并列
     * → 每张牌拿到**唯一** rank → 步长 = spread / (N-1) >= 12ms（N 大时恰为 12）。
     * 这样单帧在途恒 ≈ 260/12 ≈ 22 张，逐张可辨；旧式「ord×固定展开期」在
     * 对角/涟漪等模式上会产生大量并列 ord（满载时单帧在途 ≈ 108 张）。 */
    function buildIntroPlan() {
      if (!introAnim || !lastProbe) return null;
      var n = layout.n || lastProbe.n || 0;
      if (!n) return null; /* 布局未就绪——下一帧再建 */
      var tiles = lastProbe.tiles || [];
      var list = [];
      var i;
      for (i = 0; i < tiles.length; i++) if (!tiles[i].removed) list.push(tiles[i]);
      var total = list.length || 1;
      /* deck_deal 的发牌序 = id 升序 */
      var sorted = list.slice().sort(function (a, b) { return a.id - b.id; });
      var rankOf = {};
      for (i = 0; i < sorted.length; i++) rankOf[sorted[i].id] = i;

      /* ① 逐牌规格 + 编舞序（ord） */
      var items = [];
      var zMax = 0;
      for (i = 0; i < list.length; i++) {
        var t = list[i];
        var sp = introSpecOf(introAnim.mode, t, n, rankOf[t.id] || 0, total);
        if ((t.z || 0) > zMax) zMax = t.z || 0;
        items.push({ t: t, sp: sp });
      }
      /* ② 排序：ord → z → r → c → id（并列时低层先落，空间连续推进不跳跃） */
      items.sort(function (a, b) {
        if (a.sp.ord !== b.sp.ord) return a.sp.ord - b.sp.ord;
        var az = a.t.z || 0, bz = b.t.z || 0;
        if (az !== bz) return az - bz;
        if (a.t.r !== b.t.r) return a.t.r - b.t.r;
        if (a.t.c !== b.t.c) return a.t.c - b.t.c;
        return a.t.id - b.t.id;
      });
      /* ③ 展开期 = max(260, (N-1)×12) + 层补偿总量；步长 = 展开期 / (N-1)
       *
       *   ⚠ Δ27b 修正：层高补偿 z×55 **只作排序键、不直接叠加到 delay**。
       *   若写成 delay = LEAD + i×12 + z×55，由于 gcd(12,55)=1，相邻 delay
       *   会被挤到最小 2ms（实测 L33 N=141 单帧在途峰值 35 张 > 硬上限 22 张，
       *   即用户报告的「一大坨」）。改为「先按 (编舞序 + 层高补偿) 排序，
       *   再按最终名次均分」，步长恒 >= 12ms、单帧在途恒 <= ceil(260/12)=22 张，
       *   且层高补偿仍严格为正 → 同坐标永远先落底层后落顶层（零穿模不变）。 */
      var sched = introSchedule(items.map(function (o) {
        return { z: o.t.z || 0, key: o.t.r + ',' + o.t.c };
      }), zMax);
      var step = sched.step;

      var plan = {};
      for (i = 0; i < sched.list.length; i++) {
        var slot = sched.list[i];
        var it = items[slot.idx];
        var tt = it.t;
        var spp = it.sp;
        plan[tt.id] = {
          delay: slot.delay,
          ord: spp.ord,
          ease: spp.ease,
          ox: spp.ox, oy: spp.oy, oxc: spp.oxc, oyc: spp.oyc,
          sx: spp.sx, sy: spp.sy, a0: spp.a0, wipe: spp.wipe === true
        };
      }
      var maxDelay = INTRO_LEAD_MS + sched.spread;
      introAnim.totalMs = Math.max(maxDelay + INTRO_TILE_MS, introDealTotalMs(total, zMax));
      introAnim.maxDelay = maxDelay;
      introAnim.stepMs = step;
      introAnim.zMax = zMax;
      return plan;
    }

    /* 每帧变换：返回 null 表示「已归位」→ 调用方走静态路径（坐标 100% 精确）
     * Δ27b §8 清晰度口径：
     *   · alpha 从 a0(>=0.55) 起跳，并在入场进度 35% 内达到 1.0 后保持
     *     （旧式 ae*1.6 在 back 缓动下会拖到 40%+，前段持续发灰）
     *   · wipe=true（blinds_flip）→ 返回水平揭示进度，牌体本身零几何压缩
     *   · 落定（p>=1）立刻返回 null → 静态路径，无残留亚像素偏移 */
    function introTransformOf(t, now) {
      if (!introAnim || !introAnim.active) return null;
      if (!introPlan) introPlan = buildIntroPlan();
      if (!introPlan) return null;
      var rec = introPlan[t.id];
      if (!rec) return null;
      var el = now - introAnim.startTime - rec.delay;
      var oxPx = rec.ox + rec.oxc * cell;
      var oyPx = rec.oy + rec.oyc * cell;
      if (el <= 0) {
        /* 尚未开始：完全隐形（0~180ms 纯底图留白期的唯一表现） */
        return { p: 0, dx: oxPx, dy: oyPx, sx: rec.sx, sy: rec.sy, alpha: 0, wipe: 0 };
      }
      var p = el / INTRO_TILE_MS;
      if (p >= 1) return null; /* 定格 → 静态路径 */
      if (reducedMotion) {
        /* prefers-reduced-motion: reduce → 无位移/无旋转/无缩放，仅一次性淡入 */
        var ar = clamp01(p / INTRO_ALPHA_FULL_AT);
        return { p: p, dx: 0, dy: 0, sx: 1, sy: 1, alpha: rec.a0 + (1 - rec.a0) * ar, wipe: 1 };
      }
      var e = introEase(rec.ease, p);
      var k = 1 - e;
      var ae = e < 0 ? 0 : (e > 1 ? 1 : e);
      var af = clamp01(ae / INTRO_ALPHA_FULL_AT);
      return {
        p: p,
        dx: oxPx * k,
        dy: oyPx * k,
        sx: 1 + (rec.sx - 1) * k,
        sy: 1 + (rec.sy - 1) * k,
        alpha: rec.a0 + (1 - rec.a0) * af,
        wipe: rec.wipe ? ae : 1
      };
    }

    /* 逐帧推进：跨越 p>=0.85 首次落定 → 一声落牌涟漪（>=22ms 节流在 SoundManager 内） */
    function tickIntro(now) {
      if (!introAnim || !introAnim.active) return false;
      if (!introPlan) introPlan = buildIntroPlan();
      if (!introPlan) return true;
      var allDone = true;
      var pending = null;
      for (var key in introPlan) {
        if (!Object.prototype.hasOwnProperty.call(introPlan, key)) continue;
        var rec = introPlan[key];
        var el = now - introAnim.startTime - rec.delay;
        if (el < INTRO_TILE_MS) allDone = false;
        if (!introTicked[key] && el >= INTRO_TILE_MS * INTRO_TICK_AT) {
          introTicked[key] = true;
          if (typeof opts.onDealTick === 'function') {
            /* overallProgress = 该牌在**落牌时间轴**上的归一化位置——
             * 恒随落定时刻单调不减（若用 ord 会因层高补偿而乱序，
             * 音高就会忽高忽低）。节流由 SoundManager 保证 >= 22ms。 */
            var span = Math.max(1, (introAnim.maxDelay || INTRO_LEAD_MS) - INTRO_LEAD_MS);
            var prog = (rec.delay - INTRO_LEAD_MS) / span;
            if (!isFinite(prog)) prog = 0;
            if (prog < 0) prog = 0;
            if (prog > 1) prog = 1;
            if (!pending) pending = [];
            pending.push(prog);
          }
        }
      }
      /* 同帧内多张牌同时落定 → 按时间轴升序发声，保证音高单调上扬 */
      if (pending) {
        pending.sort(function (a, b) { return a - b; });
        for (var pi = 0; pi < pending.length; pi++) {
          try { opts.onDealTick(pending[pi]); } catch (eTick) { /* 音频异常不阻塞渲染 */ }
        }
      }
      if (allDone) {
        introAnim.active = false;
        introPlan = null;
        dirty = true;
        return false;
      }
      return true;
    }

    /* =========================================================
     * Δ27a / FR-053：卡牌点击方向性飞行轨迹
     *
     * 绘制纪律（本模块最易复发的回归红线）：
     *   ① 飞行牌**不**从 renderList 剔除——由 flightOf() 在 drawBoardTile 内
     *      施加位移/缩放/透明度，与 blockDx / introTransformOf 完全同构，
     *      因此天然遵守 draw() 的 (z,r,c) 升序比较器（**本体零改动**）。
     *   ② 卡牌中心越出棋盘矩形后（seg === 'offboard'）才退出该序单独绘制。
     *      棋盘画布只覆盖棋盘方格，够不到顶部待消槽；故离场段改由全屏
     *      #vfx-canvas 承载——**没有新增 canvas 元素**，沿用既有 VFX 层。
     *   ③ 跨界那一帧用「棋盘内/外」两块互补裁剪缝合：
     *      棋盘画布画矩形内的部分、#vfx-canvas 画矩形外的部分（even-odd
     *      裁剪），边界处严丝合缝 → 零 pop、零越序遮挡。
     *   ④ 终点 MUST 取目标 `.slot` 的实时 getBoundingClientRect() 中心，
     *      **禁止**再用 slotX = (slot+0.5)/7*cssSize 比例换算。
     * ========================================================= */

    /* 几何缓存失效（窗口缩放 / 方向切换 / 待消槽重排后必须重算） */
    function invalidateDockGeometry() {
      dockSlotGeo = null;
      dockSlotGeoLen = 0;
    }

    /* slotIndex → 画布 CSS 坐标中心（缓存查表；DOM 缺失时给确定性兜底） */
    function dockSlotCenters() {
      if (dockSlotGeo && dockSlotGeo.length === dockSlotGeoLen && dockSlotGeoLen > 0) return dockSlotGeo;
      var out = [];
      var br = null;
      if (typeof canvas.getBoundingClientRect === 'function') {
        try { br = canvas.getBoundingClientRect(); } catch (eBr) { br = null; }
      }
      var k = (br && br.width > 0 && cssSize > 0) ? (br.width / cssSize) : 1;
      var nodes = null;
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        try { nodes = document.querySelectorAll('#dock .slot'); } catch (eQ) { nodes = null; }
      }
      if (br && nodes && nodes.length) {
        for (var i = 0; i < nodes.length && i < 7; i++) {
          var r = nodes[i] && nodes[i].getBoundingClientRect ? nodes[i].getBoundingClientRect() : null;
          if (!r || !(r.width > 0)) { out.push(null); continue; }
          out.push({
            x: (r.left + r.width / 2 - br.left) / k,
            y: (r.top + r.height / 2 - br.top) / k
          });
        }
      }
      /* 兜底（Node 自测 / DOM 尚未渲染）：沿用 7 等分横向比例 + 棋盘上方一行 */
      if (!out.length) {
        for (var j = 0; j < 7; j++) out.push({ x: (j + 0.5) / 7 * cssSize, y: -cell * 1.35 });
      }
      dockSlotGeo = out;
      dockSlotGeoLen = out.length;
      return out;
    }

    function flightOf(tileId) {
      for (var i = 0; i < flights.length; i++) if (flights[i].tileId === tileId) return flights[i];
      return null;
    }

    /* 该牌是否「已入槽但尚未落定」——main.js 据此把对应槽位保持在空槽态 */
    function dockPending(tileId) {
      if (pendingDock[tileId] != null) return true;
      return !!flightOf(tileId);
    }

    /* 启动一次飞行。slotIndex 省略 → 取 pendingDock 精确配对，再退 lastDockSlot */
    function startFlight(tileId, slotIndex, dirHint) {
      var t = tileInfo[tileId] || null;
      if (!t) return null; /* 无几何缓存（异常路径）→ 不飞，直接落定 */
      var idx = slotIndex;
      if (idx == null || !isFinite(idx)) idx = pendingDock[tileId];
      if (idx == null || !isFinite(idx)) idx = lastDockSlot;
      idx = Math.max(0, Math.min(6, idx | 0));

      var rec = getTileCssRect(t, layout);
      var fx = rec.x + rec.w / 2;
      var fy = rec.y + rec.h / 2;
      var centers = dockSlotCenters();
      var c0 = centers[idx] || centers[0] || { x: cssSize / 2, y: -cell * 1.35 };
      var tx = c0.x;
      var ty = c0.y;

      var d = (dirHint != null) ? (dirHint | 0) : (t.d | 0);
      if (d < 0 || d > 3) d = 0;

      var f = {
        tileId: tileId,
        dir: d,
        slotIndex: idx,
        seg: 'board',
        t0: nowMs(),
        fromX: fx, fromY: fy,
        toX: tx, toY: ty,
        eased: 'cubic',
        dur: FLIGHT_U_MS,
        dur1: 0,
        dur2: 0,
        d1: 0,
        dx: 0, dy: 0,
        dropH: cell * 1.15
      };

      if (reducedMotion) {
        /* prefers-reduced-motion: reduce → 零位移直接落定（保留落槽音与槽位揭示） */
        f.dur = FLIGHT_REDUCED_MS;
        f.reduced = true;
        f.fromX = tx; f.fromY = ty;
      } else if (d !== 0) {
        /* L / R / D：先沿自身箭头方向加速滑出棋盘矩形 */
        var half = cell * 0.5;
        var exitDist;
        if (d === 3) exitDist = fx + half;                 /* L */
        else if (d === 1) exitDist = cssSize - fx + half;  /* R */
        else exitDist = cssSize - fy + half;               /* D */
        var d1 = Math.max(cell * 0.6, exitDist) * 1.06;
        var dur1 = Math.max(FLIGHT_EXIT_MS_MIN, Math.min(FLIGHT_EXIT_MS_MAX, d1 / FLIGHT_EXIT_SPEED));
        f.d1 = d1;
        f.dur1 = dur1;
        f.dur2 = FLIGHT_DROP_MS;
        f.dur = Math.min(FLIGHT_TOTAL_MS_MAX, dur1 + FLIGHT_DROP_MS);
        f.dx = d === 1 ? 1 : (d === 3 ? -1 : 0);
        f.dy = d === 2 ? 1 : 0;
      }

      flights.push(f);
      markDirty();
      return f;
    }

    /* 落定：一次性回调（揭示槽位）→ 出表。异常 MUST 不阻断其余飞行 */
    function landFlight(f) {
      try {
        if (typeof opts.onFlightLand === 'function') opts.onFlightLand(f.tileId, f.slotIndex);
      } catch (eLand) { /* 单个落定回调异常不影响其余 */ }
    }

    function cancelFlights() {
      if (!flights.length && !pendingDockKeys()) return 0;
      var n = flights.length;
      flights.length = 0;
      pendingDock = {};
      dirty = true;
      markDirty();
      return n;
    }
    function pendingDockKeys() {
      for (var k in pendingDock) if (Object.prototype.hasOwnProperty.call(pendingDock, k)) return true;
      return false;
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
        /* Δ27c/T136 物理定标：重力 2600 px/s² 持续加速 + 恒定翻滚。
         * MUST NOT 施加空气阻力或终速限制（会拖出「先减速→悬停→再飘落」的
         * 三段式，正是「慢吞吞飘落」的成因）。越过屏幕下沿即回收。 */
        vsh.x += vsh.vx * 0.016;
        vsh.y += vsh.vy * 0.016;
        vsh.vy += DOCK_SHARD_GRAVITY * 0.016;
        vsh.rot += (vsh.vr || 0) * 0.016; /* vr = rad/s */
        vsh.life -= 16;
        if (vsh.life <= 0 || (vsh.y - 80 > vfxViewH())) vfxShards.splice(i, 1);
      }
      if (vfxShards.length > 0) active = true;
      if (vfxFlash) active = true;
      if (particles.length > 0) active = true;
      /* Δ27a/FR-053: 飞行推进——每张独立计时，落定即回调揭示槽位并出表。
       * 兜底：超过 dur + 400ms 仍在表内（极端掉帧 / 回调异常）→ 强制落定，
       * MUST NOT 让卡牌永久滞留不可见。
       *
       * ⚠ 顺序铁律：**必须先出表、再回调**。`onFlightLand` 会同步调用 main.js 的
       * renderDock()，而 renderDock 用 `dockPending(tileId)` 决定槽位是空槽还是
       * has-tile；若飞行记录仍在表内，dockPending 恒为真 → 槽位永远不揭示
       * （实测：卡牌已消失但待消槽保持空槽，直到下一次点击才补上）。 */
      for (i = flights.length - 1; i >= 0; i--) {
        var fl = flights[i];
        var fel = now - fl.t0;
        if (fel >= fl.dur || fel > fl.dur + 400) {
          flights.splice(i, 1);
          landFlight(fl);
          dirty = true;
        } else {
          active = true;
        }
      }
      /* Δ22c/T111: 开局编舞推进（含逐牌落子涟漪音）——动画期持续请求下一帧 */
      if (introAnim && introAnim.active && tickIntro(now)) active = true;
      /* Δ28d（真 Bug 修复）：`frame()` 只在 `needMore || dirty` 时才调 drawVfx，
       * 而「最后一枚碎块被回收」的那一帧 active 恰好翻假 → 不重绘 →
       * 上一帧的碎片被**永久冻结**在全屏 #vfx-canvas 上（实测残留 15 万像素、
       * 占比 ~10%，即 SC-023 ⑩ 说的「残留亮斑」）。故池由「有」转「空」时必须
       * 强制再清一次画布。粒子/碎片同属该画布层，一并纳入守卫。 */
      var vfxLive = (vfxShards.length > 0 || particles.length > 0 || vfxFlash !== null);
      if (vfxLive) vfxWasLive = true;
      else if (vfxWasLive) { vfxWasLive = false; dirty = true; }
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
      /* Δ21d/T101: 无描边 Low-Poly 多面体瀑布发射器 */
      function spawnDockShatter(slotRects) {
        slotRects = slotRects || [];
        /* 兜底：若未传入槽位矩形，则取 #dock 前 3 个有牌槽位 */
        if (!slotRects.length && typeof document !== 'undefined') {
          var nodes = document.querySelectorAll('#dock .slot');
          var picks = [];
          for (var pi = 0; pi < nodes.length && picks.length < 3; pi++) {
            if (nodes[pi] && nodes[pi].getBoundingClientRect && nodes[pi].classList && nodes[pi].classList.contains('has-tile')) {
              picks.push(nodes[pi].getBoundingClientRect());
            }
          }
          if (picks.length < 3) {
            for (var pj = 0; pj < nodes.length && picks.length < 3; pj++) {
              if (nodes[pj] && nodes[pj].getBoundingClientRect) picks.push(nodes[pj].getBoundingClientRect());
            }
          }
          slotRects = picks;
        }
        /* 联合矩形：覆盖 3 个槽位全宽 */
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var si = 0; si < slotRects.length; si++) {
          var rect = slotRects[si] || {};
          var rx = (rect.left != null ? rect.left : (rect.x != null ? rect.x : 0));
          var ry = (rect.top != null ? rect.top : (rect.y != null ? rect.y : 0));
          var rw = rect.width || rect.w || 0;
          var rh = rect.height || rect.h || 0;
          if (rw < 1) rw = 1; if (rh < 1) rh = 1;
          if (rx < minX) minX = rx;
          if (ry < minY) minY = ry;
          if (rx + rw > maxX) maxX = rx + rw;
          if (ry + rh > maxY) maxY = ry + rh;
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 160; maxY = 44; }
        var rw = Math.max(1, maxX - minX);
        var rh = Math.max(1, maxY - minY);
        /* 出生半径 <= 槽宽（槽宽 = 联合矩形高，即单槽边长）
         * Δ28c: padding 由 1.0 → 1.35 槽宽，容纳上调后的三级尺寸（否则拒绝采样
         * 会挤成白团，失去「粒粒分明」）。 */
        var slotW = Math.max(28, Math.min(rh, rw / 3));
        var padW = slotW * 1.35;
        var bx0 = minX - padW, bx1 = maxX + padW;
        var by0 = minY - padW, by1 = maxY + padW;
        var bboxW = Math.max(1, bx1 - bx0);
        var bboxH = Math.max(1, by1 - by0);
        /* Δ28d: 爆心辉光定位在包围盒中心 */
        vfxFlash = {
          x: (bx0 + bx1) / 2,
          y: (by0 + by1) / 2,
          r: Math.max(bboxW, bboxH) * 0.52,
          t0: nowMs(),
          dur: 180
        };

        function makeVerts(n, r0) {
          var verts = [];
          for (var v = 0; v < n; v++) {
            var a2 = (v / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
            var rr = r0 * (0.6 + Math.random() * 0.75);
            verts.push({ x: Math.cos(a2) * rr, y: Math.sin(a2) * rr });
          }
          return verts;
        }

        /* ---------- Δ27c/T135: 数量收口 120~150 + 三级尺寸 + 疏密约束 ---------- */
        var atlasSlices = ShardAtlas.slices(); /* null → 程序化兜底（FR-049 §3） */
        var total = DOCK_SHARD_TOTAL_MIN +
          Math.floor(Math.random() * (DOCK_SHARD_TOTAL_MAX - DOCK_SHARD_TOTAL_MIN + 1));
        var largeCount = Math.round(total * DOCK_SHARD_RATIO_LARGE);
        var mediumCount = Math.round(total * DOCK_SHARD_RATIO_MEDIUM);
        var smallCount = total - largeCount - mediumCount;
        var kinds = [];
        var a, b, c;
        for (a = 0; a < largeCount; a++) kinds.push('large');
        for (b = 0; b < mediumCount; b++) kinds.push('medium');
        for (c = 0; c < smallCount; c++) kinds.push('small');
        /* 大块优先占位（它们需要更大的净空），再中块、小块 */
        kinds.sort(function (k1, k2) {
          var r1 = k1 === 'large' ? 0 : (k1 === 'medium' ? 1 : 2);
          var r2 = k2 === 'large' ? 0 : (k2 === 'medium' ? 1 : 2);
          return r1 - r2;
        });

        function sizeRangeOf(kind) {
          if (kind === 'large') return DOCK_SHARD_SIZE_LARGE;
          if (kind === 'medium') return DOCK_SHARD_SIZE_MEDIUM;
          return DOCK_SHARD_SIZE_SMALL;
        }

        var placed = []; /* { x, y, vis } —— 疏密约束的已占位列表 */
        var picked = []; /* 已选切片索引（同帧 >= 6 种） */
        var n = kinds.length;
        for (var ki = 0; ki < n; ki++) {
          var kind = kinds[ki];
          var rg = sizeRangeOf(kind);
          var vis = rg[0] + Math.random() * (rg[1] - rg[0]); /* 可见长边 px */
          /* 疏密：拒绝采样，中心距 >= 0.5 × min(两者长边) */
          var px = 0, py = 0, ok = false, bestX = 0, bestY = 0, bestGap = -1;
          var tries = 0;
          while (tries < 48) {
            tries++;
            var cx2 = bx0 + Math.random() * bboxW;
            var cy2 = by0 + Math.random() * bboxH;
            var minGap = Infinity;
            for (var pi2 = 0; pi2 < placed.length; pi2++) {
              var need = 0.5 * Math.min(vis, placed[pi2].vis);
              var dx2 = cx2 - placed[pi2].x, dy2 = cy2 - placed[pi2].y;
              var d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) - need;
              if (d2 < minGap) minGap = d2;
            }
            if (minGap > bestGap) { bestGap = minGap; bestX = cx2; bestY = cy2; }
            if (minGap >= 0) { ok = true; px = cx2; py = cy2; break; }
          }
          if (!ok) { px = bestX; py = bestY; }
          placed.push({ x: px, y: py, vis: vis });

          /* 切片索引：优先轮转 + 随机，保证同帧 >= 6 种不同切片（Δ28b: 27 张） */
          var atlas = null;
          if (atlasSlices) {
            atlas = (ki < SHARD_ATLAS_TOTAL) ? ki : Math.floor(Math.random() * SHARD_ATLAS_TOTAL);
            if (picked.indexOf(atlas) < 0) picked.push(atlas);
          }
          /* Δ28c: 径向迸射——全周角随机 + 水平放大 + 垂直收窄 + 向下偏置 */
          var ang0 = Math.random() * Math.PI * 2;
          var spd = DOCK_SHARD_SPEED_MIN + Math.random() * (DOCK_SHARD_SPEED_MAX - DOCK_SHARD_SPEED_MIN);
          var vx = Math.cos(ang0) * spd * DOCK_SHARD_VX_GAIN;
          var vy = Math.sin(ang0) * spd * DOCK_SHARD_VY_GAIN + DOCK_SHARD_DOWN_BIAS;
          if (vy < -DOCK_SHARD_UP_MAX) vy = -DOCK_SHARD_UP_MAX;
          var vrMag = DOCK_SHARD_VR_MIN + Math.random() * 8;
          var vr = (Math.random() < 0.5 ? -1 : 1) * vrMag;
          var life = DOCK_SHARD_LIFE_MIN +
            Math.floor(Math.random() * (DOCK_SHARD_LIFE_MAX - DOCK_SHARD_LIFE_MIN + 1));
          var rec = {
            x: px, y: py,
            vx: vx, vy: vy,
            rot: Math.random() * Math.PI * 2,
            vr: vr,               /* rad/s（Δ27c：改为角速度量纲，更新时 × dt） */
            verts: atlas ? null : makeVerts(4 + Math.floor(Math.random() * 3), Math.max(3, vis * 0.42)),
            size: vis,            /* 可见长边（px） */
            kind: kind,
            atlas: atlas,         /* 图集切片索引；null = 程序化兜底 */
            alpha0: DOCK_SHARD_ALPHA_MIN + Math.random() * (DOCK_SHARD_ALPHA_MAX - DOCK_SHARD_ALPHA_MIN),
            flip: Math.random() < 0.5,
            life: life,
            life0: life
          };
          vfxShards.push(rec);
        }
        /* 同帧切片多样性兜底：不足 6 种时把前几枚改抽未用过的切片 */
        if (atlasSlices && picked.length < DOCK_SHARD_ATLAS_KINDS_MIN) {
          var want = DOCK_SHARD_ATLAS_KINDS_MIN - picked.length;
          for (var wi = 0; wi < vfxShards.length && want > 0; wi++) {
            var idxTry = (wi * 3 + 1) % SHARD_ATLAS_TOTAL;
            if (picked.indexOf(idxTry) >= 0) continue;
            if (vfxShards[wi].atlas == null) continue;
            vfxShards[wi].atlas = idxTry;
            picked.push(idxTry);
            want--;
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

    /* 视口高度（碎片越界回收用；Node 桩回落 640） */
    function vfxViewH() {
      if (typeof global !== 'undefined' && global.innerHeight) return global.innerHeight;
      if (vfxCanvas && vfxCanvas.clientHeight) return vfxCanvas.clientHeight;
      return 640;
    }

    /* Δ20/T093 → Δ27c/T135: 全屏 #vfx-canvas 3D 立体碎块瀑布绘制
     * 单枚 MUST 以**一次** drawImage 完成（图集路径），禁用逐枚
     * getImageData / ctx.filter / 多次 clip / 逐枚 shadowBlur。 */
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
      /* Δ28d: 爆心辉光（在碎片之下，lighter 混合） */
      if (vfxFlash) {
        var fEl = nowMs() - vfxFlash.t0;
        if (fEl >= vfxFlash.dur) {
          vfxFlash = null;
        } else {
          var fp = fEl / vfxFlash.dur;
          var fR = vfxFlash.r * (0.55 + 0.85 * fp);
          var fA = (1 - fp) * (1 - fp) * 0.62;
          if (fR > 0.5 && fA > 0.004) {
            var fg = vfxCtx.createRadialGradient(vfxFlash.x, vfxFlash.y, 0, vfxFlash.x, vfxFlash.y, fR);
            fg.addColorStop(0, 'rgba(255,255,255,' + fA.toFixed(3) + ')');
            fg.addColorStop(0.42, 'rgba(222,240,255,' + (fA * 0.52).toFixed(3) + ')');
            fg.addColorStop(0.78, 'rgba(186,214,255,' + (fA * 0.18).toFixed(3) + ')');
            fg.addColorStop(1, 'rgba(170,200,255,0)');
            vfxCtx.globalCompositeOperation = 'lighter';
            vfxCtx.fillStyle = fg;
            vfxCtx.beginPath();
            vfxCtx.arc(vfxFlash.x, vfxFlash.y, fR, 0, Math.PI * 2);
            vfxCtx.fill();
            vfxCtx.globalCompositeOperation = 'source-over';
          }
        }
      }
      /* Δ27c/T135: 图集切片（会话级缓存；未就绪 → 本次静默走程序化兜底） */
      var shardImgs = ShardAtlas.slices();
      for (var i = 0; i < vfxShards.length; i++) {
        var sh = vfxShards[i];
        var ratio = sh.life0 > 0 ? (sh.life / sh.life0) : 0;
        /* Δ28c: 半透明玻璃感（alpha0 0.84~0.96）+ 末段 18% 淡出 */
        var a = (sh.alpha0 != null) ? sh.alpha0 : 0.92;
        if (ratio <= 0.18) a *= (ratio / 0.18);
        if (a < 0) a = 0;
        vfxCtx.globalAlpha = a;
        vfxCtx.save();
        vfxCtx.translate(sh.x, sh.y);
        vfxCtx.rotate(sh.rot);
        /* 严禁 shadowBlur / ctx.filter（性能 + 零描边红线） */
        vfxCtx.shadowBlur = 0;
        var img = (shardImgs && sh.atlas != null) ? shardImgs[sh.atlas] : null;
        if (img) {
          /* 图集路径：**单枚一次 drawImage**（3D 立体感由素材自身承载） */
          if (sh.flip) vfxCtx.scale(-1, 1);
          var drawSz = (sh.size || 14) / SHARD_SUBJECT_RATIO;
          vfxCtx.drawImage(img, -drawSz / 2, -drawSz / 2, drawSz, drawSz);
        } else {
          /* 程序化 Low-Poly 兜底（素材缺失 / 首组三消尚未就绪） */
          var verts = sh.verts;
          if (!verts || verts.length < 3) {
            var r = (sh.size != null ? sh.size * 0.42 : 3);
            verts = [{ x: 0, y: -r }, { x: r, y: 0 }, { x: 0, y: r }, { x: -r, y: 0 }];
          }
          var n = verts.length;
          /* 侧边厚度：向下偏移 2px 的浅冷灰 */
          vfxCtx.beginPath();
          vfxCtx.moveTo(verts[0].x, verts[0].y + 2);
          for (var si = 1; si < n; si++) vfxCtx.lineTo(verts[si].x, verts[si].y + 2);
          vfxCtx.closePath();
          vfxCtx.fillStyle = '#CBD5E1';
          vfxCtx.fill();
          /* 正面：纯白 */
          vfxCtx.beginPath();
          vfxCtx.moveTo(verts[0].x, verts[0].y);
          for (var fi = 1; fi < n; fi++) vfxCtx.lineTo(verts[fi].x, verts[fi].y);
          vfxCtx.closePath();
          vfxCtx.fillStyle = '#FFFFFF';
          vfxCtx.fill();
          /* 一侧极淡折光边 */
          vfxCtx.strokeStyle = '#F1F5F9';
          vfxCtx.lineWidth = 1;
          vfxCtx.beginPath();
          vfxCtx.moveTo(verts[0].x, verts[0].y);
          vfxCtx.lineTo(verts[1].x, verts[1].y);
          vfxCtx.stroke();
        }
        vfxCtx.restore();
      }
      vfxCtx.globalAlpha = 1;
      vfxCtx.shadowBlur = 0;
      /* Δ27a/FR-053 §5：飞行牌的「棋盘矩形之外」部分由本层接续绘制。
       * 棋盘画布只覆盖棋盘方格、够不到顶部待消槽；本层为既有全屏 VFX 画布
       * （**未新增任何 canvas 元素**），与棋盘画布共用同一 boardRect/scale 映射，
       * 边界处用 even-odd 互补裁剪缝合 → 整张牌跨两画布连续，零 pop。 */
      try { drawFlightsOutside(vfxCtx, w, h, nowMs()); } catch (eFl) { /* 飞行绘制异常不杀帧 */ }
    }

    /* 把飞行牌画到全屏 VFX 画布：仅在「棋盘矩形之外」可见（棋盘内已由棋盘画布
     * 按 z 序画过）。seg === 'offboard'（完全越出）时整张牌都在本层。 */
    function drawFlightsOutside(v, viewW, viewH, now) {
      if (!flights.length) return;
      if (!v || typeof canvas.getBoundingClientRect !== 'function') return;
      var br = canvas.getBoundingClientRect();
      if (!br || !(br.width > 0) || !(cssSize > 0)) return;
      var k = br.width / cssSize;
      for (var i = 0; i < flights.length; i++) {
        var f = flights[i];
        var t = tileInfo[f.tileId];
        if (!t) continue;
        var fp = flightPos(f, now - f.t0);
        if (!fp || fp.alpha <= 0.004) continue;
        var seg = flightSegOf(fp, cell, cssSize);
        if (seg === 'board') {
          /* 先判断是否真的有一块落在棋盘外——完全在矩形内则无需绘制 */
          var hw = cell * 0.5 * fp.sx, hh = cell * 0.5 * fp.sy;
          if (fp.x - hw >= 0 && fp.x + hw <= cssSize && fp.y - hh >= 0 && fp.y + hh <= cssSize) continue;
        }
        v.save();
        v.translate(br.left, br.top);
        if (k !== 1) v.scale(k, k);
        if (seg === 'board') {
          v.beginPath();
          v.rect(-br.left / k - cell, -br.top / k - cell, (viewW + 2 * cell) / k, (viewH + 2 * cell) / k);
          v.rect(0, 0, cssSize, cssSize);
          v.clip('evenodd');
        }
        drawTileBody(v, cell, fp.x, fp.y, t, 1, fp.alpha, now, fp.sx, fp.sy);
        v.restore();
      }
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
      /* 受阻微震：位移在静态层施加（不再由动画层重绘卡体）——
       * 这样抖动卡牌仍处在自己的 z 位置，绝不会盖到更高层的牌上。 */
      var i;
      blockDx = {};
      for (i = 0; i < anims.length; i++) {
        var ab = anims[i];
        if (ab.kind !== 'block') continue;
        var bp = Math.min(1, (now - ab.t0) / ab.dur);
        blockDx[ab.tileId] = Math.sin(bp * Math.PI * 6) * 3 * (1 - bp);
      }
      var tiles = lastProbe.tiles;
      /* Δ27a/FR-053 §5（图层遮挡红线）：飞行牌**不再**从 renderList 剔除。
       * 旧实现把全部飞行牌从列表里滤掉、再在静态层之后统一叠画一遍，
       * 于是任何低层飞行牌都会盖住压在其格心上的高层静止牌——这就是
       * 「飞行时旁边卡牌短暂变成底层」的直接成因。
       * 现改为：飞行牌以 tileInfo 缓存的原格位（r/c/z 不变）合成进同一份
       * renderList，共用下方**未改动**的 (z,r,c) 升序比较器；位移/缩放/透明度
       * 由 drawBoardTile 内 flightOf() 施加（与 blockDx / introTransformOf 同构）。
       * 只有「完全越出棋盘矩形」的离场段才退出该序（见 drawVfx 缝合绘制）。 */
      var renderList = [];
      var inList = {};
      for (i = 0; i < tiles.length; i++) {
        if (tiles[i].removed) continue;
        renderList.push(tiles[i]);
        inList[tiles[i].id] = true;
      }
      for (i = 0; i < flights.length; i++) {
        var fid = flights[i].tileId;
        if (inList[fid]) continue;
        var ftile = tileInfo[fid];
        if (ftile) { renderList.push(ftile); inList[fid] = true; }
      }
      renderList.sort(function (a, b) {
        return a.z - b.z || a.r - b.r || a.c - b.c;
      });
      lastDrawOrder.length = 0;
      for (i = 0; i < renderList.length; i++) {
        /* ingame-hud-render-defects（Bug 2）: 已删除「上层投射环境阴影」——
         * 该状态会泄漏到 drawTileBody 内每次 fill，放大成错位灰黑块。
         * 层次改由卡牌自身投影表达（drawTileBody 内局部 save/restore）。 */
        lastDrawOrder.push(renderList[i].id);
        drawBoardTile(renderList[i], now);
      }

      /* 动画层（gear/unlock/ice/prism/match；reveal 由 drawBoardTile 上浮插值处理）
       * flight-neighbor-morph-dock-inset（Bug 1）: 本层严禁绘制任何「卡体」——
       * 动画层整体叠在静态层之后且不做 z 交错，一旦在此重绘卡体，低层牌就会
       * 盖住更高层的牌（层次反转），表现为「未点击的相邻卡牌瞬间变成另一张」。
       * reveal 由静态层 drawBoardTile 插值；block 由静态层施加水平位移；
       * Δ27a：fly 亦已移入静态层 z 序（见上），本层不再有任何飞行绘制。 */
      for (i = 0; i < anims.length; i++) {
        var a2 = anims[i];
        if (a2.kind === 'reveal' || a2.kind === 'block') continue;
        drawAnim(a2, Math.min(1, (now - a2.t0) / a2.dur), now);
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
      /* 受阻微震：±3px 水平位移由本层施加（见 draw() 内 blockDx 计算） */
      var px = rect.x + rect.w / 2 + (blockDx[t.id] || 0);
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
      /* Δ22c/T111: 进场编舞——只对**本张牌**施加位移/缩放/透明度，
       * 绘制顺序仍由 draw() 的 z→r→c 升序循环决定（绝不重排、绝不穿模）。
       * 已归位时 introTransformOf 返回 null → 走下方静态路径，
       * 保证动画结束后坐标与 getTileCssRect 完全一致（零残留偏移）。 */
      var itr = introTransformOf(t, now);
      if (itr) {
        if (itr.alpha <= 0.004) return; /* 留白/未开始：不绘制（无半透明残影） */
        /* 位移交给牌心坐标、缩放交给 drawTileBody 的 scaleX/scaleY——
         * 全程零 ctx.transform 累加（Δ15b3f 铁律） */
        var icx = px + itr.dx;
        var icy = py + itr.dy + lift;
        /* Δ27b §8: blinds_flip 走**遮罩揭示**（水平裁切逐帧变宽），
         * 牌体始终 1:1 绘制 —— 替代旧式 scaleX 0.05 几何压缩（图案变形即「糊」）。
         * 同一张牌同帧仍只绘制一次（clip 只限定可见宽度，不叠第二层副本）。 */
        if (itr.wipe != null && itr.wipe < 0.999) {
          var halfW = cell * 0.5 * itr.sx;
          var wipeW = Math.max(0.5, cell * itr.wipe);
          ctx.save();
          ctx.beginPath();
          ctx.rect(icx - halfW, icy - cell, wipeW, cell * 2);
          ctx.clip();
          drawTileBody(ctx, cell, icx, icy, t, 1, itr.alpha, now, itr.sx, itr.sy);
          ctx.restore();
          return;
        }
        drawTileBody(ctx, cell, icx, icy, t, 1, itr.alpha, now, itr.sx, itr.sy);
        return;
      }
      /* Δ27a/FR-053：飞行段——本张牌仍处在上方 renderList 的 z 序位次上，
       * 只在此处施加「相对原格心的位移 + 缩放 + 透明度」，绝不重排绘制顺序。
       * 完全越出棋盘矩形后由 drawVfx 的互补裁剪接续（同一变换，严丝合缝）。 */
      var fl = flightOf(t.id);
      if (fl) {
        var fpos = flightPos(fl, now - fl.t0);
        if (fpos && fpos.alpha > 0.004) {
          drawTileBody(ctx, cell, px + (fpos.x - fl.fromX), py + (fpos.y - fl.fromY), t, 1, fpos.alpha, now, fpos.sx, fpos.sy);
          return;
        }
      }
      drawTileBody(ctx, cell, px, py + lift, t, 1, 1, now);
    }

    /* ---------- 动画绘制 ---------- */
    function drawAnim(a, prog, now) {
      var t = tileById(a.tileId);
      if (!t) return;
      /* Δ27a/FR-053 §5: 'fly' 分支已整体下线——飞行牌改由静态层 drawBoardTile
       * 在 (z,r,c) 升序位次上绘制（flightOf / flightPos），本层只承载
       * 不改变卡体层序的特效（gear 脉冲 / unlock 闪光 / ice 碎裂 / match 爆闪 /
       * prism 折线）。MUST NOT 在此恢复任何 drawTileBody 卡体重绘。 */
      if (a.kind === 'match') {
        drawTileBody(ctx, cell, a.x, a.y, t, 1 + 0.6 * prog, 1 - prog, now);
      } else if (a.kind === 'gear') {
        /* T034 齿轮旋转脉冲：**只画角标区高亮环，绝不重绘卡体**。
         * flight-neighbor-morph-dock-inset（Bug 1）直接元凶：原实现调用
         * drawTileBody 重绘整块卡体，而本层整体叠在静态层之后、不做 z 交错，
         * 且 tileInfo 不带 covered → 低层齿轮牌以「未压暗的亮牌」盖到压在其
         * 格心上的高层牌之上（层次反转），观感即「未点击的相邻卡牌变成另一张」。
         * 齿轮联动的唯一语义变化是 d（方向），refresh() 后静态层已是最新，
         * 卡体无需重画。坐标一律走 getTileCssRect（rr/cc 渲染坐标）。 */
        var gp = prog < 0.5 ? prog / 0.5 : (1 - (prog - 0.5) / 0.5);
        var gr = getTileCssRect(t, layout);
        var gcx = gr.x + gr.w / 2;
        var gcy = gr.y + gr.h / 2;
        ctx.beginPath();
        ctx.arc(gcx + cell * 0.34, gcy - cell * 0.34, cell * 0.14 * (1 + gp), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,217,160,' + (1 - prog) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (a.kind === 'unlock') {
        /* T034 锁链断开：只画金色描边闪光，同样不重绘卡体（理由见 gear 分支） */
        var ur = getTileCssRect(t, layout);
        ctx.beginPath();
        roundRect(ctx, ur.x + 2, ur.y + 2, ur.w - 4, ur.h - 4, cell * 0.12);
        ctx.strokeStyle = 'rgba(255,200,80,' + (0.85 * (1 - prog)) + ')';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (a.kind === 'ice') {
        /* T034 破冰碎裂: 白蓝碎片从牌心四散（牌心取渲染坐标，奇数层不偏半格） */
        var ir = getTileCssRect(t, layout);
        var icx = ir.x + ir.w / 2, icy = ir.y + ir.h / 2;
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
    var lastDockSlot = 0; /* 兼容兜底：仅在 pendingDock 缺项时使用（正常路径不依赖） */
    function handleEvent(e) {
      var now = nowMs();
      if (e.e === 'dock' && e.slotIndex != null) {
        var si = Math.max(0, Math.min(6, e.slotIndex | 0));
        /* Δ27a/FR-053 §6: `dock` 先于 `flyout` 下发 → 1:1 精确配对（废弃全局推测） */
        if (e.id != null) pendingDock[e.id] = si;
        lastDockSlot = si;
        refresh();
        return;
      }
      if (e.e === 'magnet-absorb') {
        /* Δ19d: 灵犀三消——无视阻挡，直接从牌位被吸向顶部待消槽 */
        var mt = tileInfo[e.id] || null;
        if (mt) {
          startFlight(e.id, pendingDock[e.id] != null ? pendingDock[e.id] : lastDockSlot, null);
          delete pendingDock[e.id];
        }
      } else if (e.e === 'flyout' && e.path && e.path.length) {
        var slotOf = (pendingDock[e.tileId] != null) ? pendingDock[e.tileId] : lastDockSlot;
        delete pendingDock[e.tileId];
        startFlight(e.tileId, slotOf, null);
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
        var currentIds = {};
        var flyingIdsNow = {};
        /* Δ27a: 在途飞行牌 + 已入槽但尚未起飞的牌（pendingDock）都必须保留
         * 几何缓存——否则 dock 事件触发的 refresh 会把缓存删掉，
         * flyout 时 startFlight 拿不到起点（旧实现正是这样让飞行彻底不渲染）。 */
        for (var fi = 0; fi < flights.length; fi++) flyingIdsNow[flights[fi].tileId] = true;
        for (var pk in pendingDock) {
          if (Object.prototype.hasOwnProperty.call(pendingDock, pk)) flyingIdsNow[pk] = true;
        }
        for (var i = 0; i < lastProbe.tiles.length; i++) {
          var t = lastProbe.tiles[i];
          tileInfo[t.id] = {
            id: t.id, r: t.r, c: t.c, s: t.s, d: t.d, z: t.z || 0, stackDepth: t.stackDepth || 1,
            m: t.m || null, ice: t.ice != null ? t.ice : null,
            /* flight-neighbor-morph-dock-inset（Bug 1 防御位）: 缓存必须带上
             * 压暗态，否则动画层任何残留的卡体重绘都会画出「没被压暗的亮牌」，
             * 与周边形成强烈反差（历史上正是这条缺失放大了 Bug 1 的观感）。 */
            covered: t.covered === true,
            seenAt: nowMs()
          };
          currentIds[t.id] = true;
        }
        /* 清理过期 tileInfo —— Δ27a 关键修正：**按时间窗淘汰，而非「不在盘面即删」**。
         *
         *   RulesEngine.applyTap 是原子结算：牌在**任何事件下发之前**就已从引擎移除。
         *   一次点击的事件序是 click → gear/unlock → dock → flyout，
         *   其中 click / gear 都会触发 refresh —— 若按「不在盘面即删」，
         *   缓存会在 dock 设置 pendingDock **之前**就被清掉，
         *   flyout 时 startFlight 拿不到起点 → 飞行彻底不渲染（静默失效）。
         *   改为保留 2000ms（远大于一次飞行的 320ms 上界），
         *   使几何缓存对任意事件顺序免疫。 */
        var pruneNow = nowMs();
        for (var k in tileInfo) {
          if (currentIds[k] || flyingIdsNow[k]) continue;
          var rec0 = tileInfo[k];
          if (!rec0 || (pruneNow - (rec0.seenAt || 0)) > 2000) delete tileInfo[k];
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
    /* Δ27c/T134 ③: 碎块图集键控 MUST 在 startDeal() 之前完成——渲染器一创建
     * 就启动加载（一次性 ~150ms），MUST NOT 把 2048² 的回读压在开局编舞窗口上。
     * 若首组三消时仍未就绪 → 该次静默走程序化 Low-Poly 兜底（不等、不掉帧）。 */
    ShardAtlas.ensureLoaded();
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
      /* Δ22c/T111: 开局进场编舞（main.js 抽取 / 快进 / 降级唯一入口） */
      startDeal: startDeal,
      skipDeal: skipDeal,
      isDealing: isDealing,
      dealMode: dealMode,
      dealModeName: dealModeName,
      dealTotalMs: dealTotalMs,
      dealRemainingMs: dealRemainingMs,
      setDealModeLock: function (m) {
        dealModeLockGlobal = (m == null || m === '' || m === 'random') ? null : (m | 0);
        return dealModeLockGlobal;
      },
      getDealModeLock: function () { return dealModeLockGlobal; },
      setReducedMotion: function (v) { reducedMotion = !!v; },
      isReducedMotion: function () { return reducedMotion; },
      dealPlanOf: function () { return introPlan; }, /* 自测只读 */
      /* ---------- Δ27a/FR-053：方向性飞行公开 API ----------
       * 契约口径（contracts/game-session.md）：
       *   startFlight(tileId, slotIndex, dir) → 飞行记录 | null
       *   flightOf(tileId)                   → 在途记录 | null
       *   dockPending(tileId)                → true = 已入槽但尚未落定（槽位须保持空槽态）
       *   flightsOf()                        → 只读快照（自测/门禁用）
       *   cancelFlights()                    → 重置 / Undo 时清空在途飞行 */
      startFlight: startFlight,
      flightOf: flightOf,
      dockPending: dockPending,
      flightsOf: function () { return flights.slice(); },
      cancelFlights: cancelFlights,
      invalidateDockGeometry: invalidateDockGeometry,
      dockSlotCentersOf: function () { return dockSlotCenters().slice(); },
      /* Δ27a/FR-053 §5：本帧静态层绘制序（tileId 序列）——门禁断言「飞行牌与
       * 静止牌共用同一 (z,r,c) 升序」，不得统一置顶。 */
      drawOrderOf: function () { return lastDrawOrder.slice(); },
      /* Δ27c：碎块池只读快照（shard-vfx-smoke 门禁断言数量/物理/配比） */
      vfxShardsOf: function () { return vfxShards.slice(); },
      /* Δ28d：爆心辉光描述符（delta27-verify ⑤ 断言「0~180ms 有辉光 / 之后无残留」）。
       * 返回 null 表示辉光已过期——绘制路径会先把它置 null 再跳过绘制，故与画面一致。 */
      vfxFlashInfo: function () {
        return vfxFlash
          ? { x: vfxFlash.x, y: vfxFlash.y, r: vfxFlash.r, t0: vfxFlash.t0, dur: vfxFlash.dur }
          : null;
      },
      /* Δ28d：清空 VFX 层（碎块 / 粒子 / 旧碎片），`keepFlash` 为真时保留爆心辉光。
       * 用途：① 换关 / 重置 / Undo 时不得残留上一局碎片（否则新局开场就带白点）；
       * ② 门禁隔离实验——清碎片但留辉光，使「该点有像素」唯一归因于辉光。 */
      clearVfx: function (keepFlash) {
        vfxShards.length = 0;
        particles.length = 0;
        shards.length = 0;
        if (!keepFlash) vfxFlash = null;
        vfxWasLive = false;
        markDirty();
      },
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
      if (Bestiary.EMOJI && Bestiary.EMOJI.length === 90) {
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
    /* flight-neighbor-morph-dock-inset（Bug 2）: 同步「无键控」降级类。
     * keyingAvailable()===false（file:// 双击运行）时切片保留不透明白底，
     * 需要 CSS 的 mix-blend-mode:darken 把纯白融进 .dock-chip 的白卡面。
     * 只给 #dock 挂一个类，托盘自身的深色半透明磨砂样式一行都不改。 */
    var noKey = !IconAssets.keyingAvailable();
    if (dock.classList) {
      if (noKey) dock.classList.add('no-keying');
      else dock.classList.remove('no-keying');
    }
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
    function albumIndex(levelId) {
      return Math.min(5, Math.floor(((levelId || 1) - 1) / 12));
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
        img.src = 'assets/bg/bg' + bgNo + '.' + ext + '?v=21';
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
      paintingOf: paintingOf,
      albumIndex: albumIndex, /* Δ16b: 画卷序号 = floor((id-1)/12)+1 → bg{1..6} */
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
    if (Bestiary && Bestiary.EMOJI && Bestiary.EMOJI.length === 90) {
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
  /* T084: Δ19 渲染常量外露（离线自测断言用——不参与运行时逻辑）
   * Δ27c: 数量改为 120~150 枚区间（原固定 90），尺寸档位与物理常量一并外露 */
  STM.rendererTest.SHARDS = { min: SHARD_COUNT_MIN, max: SHARD_COUNT_MAX };
  STM.rendererTest.DOCK_SHARDS = {
    min: DOCK_SHARD_TOTAL_MIN,
    max: DOCK_SHARD_TOTAL_MAX,
    lifeMin: DOCK_SHARD_LIFE_MIN,
    lifeMax: DOCK_SHARD_LIFE_MAX,
    gravity: DOCK_SHARD_GRAVITY,
    /* Δ28c: 径向迸射参数（取代旧的 vyMin/vxMin/vxMax 恒向下口径） */
    speedMin: DOCK_SHARD_SPEED_MIN,
    speedMax: DOCK_SHARD_SPEED_MAX,
    vxGain: DOCK_SHARD_VX_GAIN,
    vyGain: DOCK_SHARD_VY_GAIN,
    upMax: DOCK_SHARD_UP_MAX,
    downBias: DOCK_SHARD_DOWN_BIAS,
    alphaMin: DOCK_SHARD_ALPHA_MIN,
    alphaMax: DOCK_SHARD_ALPHA_MAX,
    vrMin: DOCK_SHARD_VR_MIN,
    ratio: { large: DOCK_SHARD_RATIO_LARGE, medium: DOCK_SHARD_RATIO_MEDIUM, small: 1 - DOCK_SHARD_RATIO_LARGE - DOCK_SHARD_RATIO_MEDIUM },
    size: { large: DOCK_SHARD_SIZE_LARGE, medium: DOCK_SHARD_SIZE_MEDIUM, small: DOCK_SHARD_SIZE_SMALL },
    atlasKindsMin: DOCK_SHARD_ATLAS_KINDS_MIN
  };
  STM.rendererTest.VFX_SHARDS = STM.rendererTest.DOCK_SHARDS;
  STM.rendererTest.SHATTER_SHARDS = STM.rendererTest.DOCK_SHARDS;
  STM.rendererTest.FRAGMENTS = STM.rendererTest.DOCK_SHARDS;
  STM.rendererTest.GAP = GAP;
  STM.DOCK_SHARDS = STM.rendererTest.DOCK_SHARDS;
  STM.VFX_SHARDS = STM.rendererTest.DOCK_SHARDS;
  /* ingame-hud-render-defects: 几何唯一出口外露（纯函数——Node/N 层/rect 任意组合可测） */
  STM.rendererTest.getTileCssRect = getTileCssRect;
  STM.rendererTest.tileGridOf = tileGridOf;
  /* Δ22c/T111 + Δ27b: 编舞常量表与纯函数规格（离线自测断言——不参与运行时逻辑） */
  STM.rendererTest.INTRO = {
    LEAD_MS: INTRO_LEAD_MS,
    STAGGER_MS: INTRO_STAGGER_MS,
    SPREAD_MIN_MS: INTRO_SPREAD_MIN_MS,
    Z_STEP_MS: INTRO_Z_STEP_MS,
    TILE_MS: INTRO_TILE_MS,
    TICK_AT: INTRO_TICK_AT,
    ALPHA0: INTRO_ALPHA0,
    ALPHA_MIN_SAFE: INTRO_ALPHA_MIN_SAFE,
    ALPHA_FULL_AT: INTRO_ALPHA_FULL_AT,
    SCALE_MAX: INTRO_SCALE_MAX,
    SCALE_MIN: INTRO_SCALE_MIN,
    NONUNI_MIN: INTRO_NONUNI_MIN,
    MODES: INTRO_MODES
  };
  STM.rendererTest.INTRO_MODES = INTRO_MODES;
  STM.rendererTest.introSpecOf = introSpecOf;
  /* FR-052 §10 权威时长公式（纯函数——离线可断言 700 / 1546 / 2340ms） */
  STM.rendererTest.introSchedule = introSchedule;
  STM.rendererTest.introDealTotalMs = function (n, zMax) {
    var cnt = n > 0 ? n : 1;
    var zz = zMax > 0 ? zMax : 0;
    var spread = Math.max(INTRO_SPREAD_MIN_MS, (cnt - 1) * INTRO_STAGGER_MS);
    return INTRO_LEAD_MS + spread + INTRO_TILE_MS + INTRO_Z_STEP_MS * zz;
  };
  /* Δ27a/FR-053: 飞行常量与纯运动学外露（flight-smoke 离线断言） */  STM.rendererTest.FLIGHT = {
    U_MS: FLIGHT_U_MS,
    EXIT_MS_MIN: FLIGHT_EXIT_MS_MIN,
    EXIT_MS_MAX: FLIGHT_EXIT_MS_MAX,
    DROP_MS: FLIGHT_DROP_MS,
    TOTAL_MS_MAX: FLIGHT_TOTAL_MS_MAX,
    ALPHA_MIN: FLIGHT_ALPHA_MIN,
    EXIT_SPEED: FLIGHT_EXIT_SPEED,
    END_SCALE: FLIGHT_END_SCALE,
    DROP_SCALE0: FLIGHT_DROP_SCALE0,
    REDUCED_MS: FLIGHT_REDUCED_MS
  };
  /* 纯函数：给定一条飞行记录与已过时长 → 位置/缩放/透明度（离线可断言） */
  STM.rendererTest.flightPosOf = function (f, el) { return flightPos(f, el); };
  STM.rendererTest.flightSegOf = function (pos, cellPx, cssSizePx) {
    return flightSegOf(pos, cellPx, cssSizePx);
  };
  /* Δ27c/T134: 碎块图集外露（shards-audit 离线审计 / shard-vfx-smoke 运行时断言） */
  STM.ShardAtlas = ShardAtlas;
  STM.rendererTest.ShardAtlas = ShardAtlas;
  STM.rendererTest.SHARD_SUBJECT_RATIO = SHARD_SUBJECT_RATIO;
  STM.rendererTest.SHARD_THEMES = SHARD_THEMES;
  STM.rendererTest.SHARD_ATLAS_TOTAL = SHARD_ATLAS_TOTAL;
  STM.rendererTest.SHARD_RAMP_MID = SHARD_RAMP_MID;
  STM.rendererTest.SHARD_RAMP_GAMMA = SHARD_RAMP_GAMMA;
  STM.rendererTest.SHARD_SHADE_ALPHA = SHARD_SHADE_ALPHA;

})(typeof window !== 'undefined' ? window : globalThis);
