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
  var BG = '#1B2430';
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

  /* 图鉴图案绘制：Sprite 命中即 drawImage；Node/无 DOM 或未命中走直绘 */
  function drawBestiaryIcon(ctx, sv, cx, cy, R) {
    if (sv.bid != null) {
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
   * Δ14/T052b: 边缘嵌入式流光方向角标（FR-034 §3）
   * 朝向侧边缘内侧正中: 高对比胶囊形 + 四向微色相区分 +
   * 白色双箭头纹 + 程序化渐变流光动画（sin 相位随 time）
   * 图案脸面零遮挡（角标贴边缘——图案居中反方向让位已由布局保证）
   * ========================================================= */
  var WING_HUE = ['#5FA8E8', '#E8635F', '#E89B2A', '#5FB87A']; /* U/R/D/L 微色相区分 */
  function drawWingBadge(ctx, d, x, fz, w, cell, sv, nowMs) {
    var v = RE.DIR_VEC[d];
    var hue = WING_HUE[d] || '#5B8FC4';
    var cx = x + w / 2 + v.dc * (w / 2 - cell * 0.085); /* 朝向侧边缘内侧正中 */
    var cy = fz + w / 2 + v.dr * (w / 2 - cell * 0.085);
    var horiz = v.dc !== 0; /* 横向（R/L）角标横置；纵向（U/D）竖置 */
    var bw = horiz ? cell * 0.30 : cell * 0.15;  /* 胶囊长轴 */
    var bh = horiz ? cell * 0.15 : cell * 0.30;
    var r = Math.min(bw, bh) / 2;
    /* 1. 胶囊底（深色底 + 主题描边） */
    roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, r);
    ctx.fillStyle = 'rgba(35,45,60,0.88)';
    ctx.fill();
    ctx.strokeStyle = hue;
    ctx.lineWidth = Math.max(1, dprSafe(1.1));
    ctx.stroke();
    /* 2. 程序化流光渐变（sin 相位沿角标长轴流动——零状态纯函数） */
    var phase = ((nowMs || 0) / 700) % 1;
    var lg = horiz
      ? ctx.createLinearGradient(cx - bw / 2, cy, cx + bw / 2, cy)
      : ctx.createLinearGradient(cx, cy - bh / 2, cx, cy + bh / 2);
    var sh = 0.5 + 0.5 * Math.sin((nowMs || 0) / 350);
    lg.addColorStop(0, hexA(hue, 0.35));
    lg.addColorStop(Math.max(0.02, Math.min(0.98, phase)), hexA(hue, 0.95));
    lg.addColorStop(1, hexA(hue, 0.35));
    roundRect(ctx, cx - bw / 2 + dprSafe(1), cy - bh / 2 + dprSafe(1), bw - dprSafe(2), bh - dprSafe(2), r * 0.8);
    ctx.fillStyle = lg;
    ctx.fill();
    /* 3. 白色双箭头纹（指 d 方向——两条人字形箭头串联） */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(d * Math.PI / 2);
    ctx.fillStyle = '#FFFFFF';
    var aLen = Math.min(bw, bh) * 0.78;
    for (var k = 0; k < 2; k++) {
      var off = (k === 0 ? -aLen * 0.28 : aLen * 0.24);
      ctx.beginPath();
      ctx.moveTo(off - aLen * 0.14, -aLen * 0.2);
      ctx.lineTo(off + aLen * 0.1, 0);
      ctx.lineTo(off - aLen * 0.14, aLen * 0.2);
      ctx.lineTo(off - aLen * 0.2, 0);
      ctx.closePath();
      ctx.fill();
    }
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
    var bgCanvas = null;   /* Δ14: 生态背景缓存层（cycleIndex/尺寸变化才重绘——60fps 预算） */
    var bgCycle = -1;      /* 当前背景 cycleIndex（-1 = 未绘制） */
    var bgDim = 0;         /* 当前背景缓存尺寸 */

    /* Δ14/T052d: 生态背景绘制（缓存 offscreen——滑块层每帧仅 drawImage） */
    function drawEcoBackdrop() {
      var bd = STM.Backdrops;
      if (!bd) { ctx.fillStyle = BG; ctx.fillRect(0, 0, boardPx, boardPx); return; }
      var ci = bd.cycleIndexOf(pendingLevel ? pendingLevel.id : currentLevelId);
      if (!bgCanvas || bgCycle !== ci || bgDim !== boardPx) {
        bgCycle = ci; bgDim = boardPx;
        if (typeof document !== 'undefined') {
          bgCanvas = document.createElement('canvas');
          bgCanvas.width = boardPx; bgCanvas.height = boardPx;
          var bctx = bgCanvas.getContext('2d');
          try { bd.drawBackdrop(bctx, (pendingLevel ? pendingLevel.id : currentLevelId) || 1, boardPx, boardPx); } catch (err) { /* 兜底 */ }
        } else {
          bgCanvas = null;
        }
      }
      if (bgCanvas) {
        ctx.drawImage(bgCanvas, 0, 0);
      } else {
        /* Node 无 DOM: 直接绘制到主 ctx（自测路径） */
        try { bd.drawBackdrop(ctx, (pendingLevel ? pendingLevel.id : currentLevelId) || 1, boardPx, boardPx); } catch (err) { /* 兜底 */ }
      }
    }

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

      /* Δ14/T052d: 生态背景层（cycleIndex 绑定当前关 id——低频重绘） */
      drawEcoBackdrop();

      /* Δ14: 毛玻璃暗角蒙版（半透明暖白透底——滑块/角标对比度红线） */
      var veil = ctx.createRadialGradient(boardPx / 2, boardPx / 2, boardPx * 0.22, boardPx / 2, boardPx / 2, boardPx * 0.74);
      veil.addColorStop(0, 'rgba(240,244,248,0.20)');
      veil.addColorStop(0.62, 'rgba(228,234,240,0.34)');
      veil.addColorStop(1, 'rgba(205,214,224,0.55)');
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

    /* Δ14: 关卡上下文注册（main.js loadLevel 时调用——花色映射/背景随 id 切换） */
    var pendingLevel = null; /* 工厂作用域 var 提升——drawEcoBackdrop/refresh 均可读 */
    function setLevel(level) {
      pendingLevel = level;
      setSuitLevel(level);
      bgCycle = -1; /* 换关强制背景重绘（跳关/Undo 均以当前 id 实时计算） */
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

  /* DOM chip SVG（Dock 槽图标——Δ14 与棋盘图鉴口径一致）
   * 有图鉴映射时渲染主题色双圈 chip（底晕 + 图案色圆点），
   * 无映射兜底旧色彩圆点。SVG 内联零外部资源（宪章 III）。 */
  function chipSVG(s, level) {
    var bid = null;
    if (Bestiary && level) {
      var m = Bestiary.mappingForLevel(level);
      bid = m[s] != null ? m[s] : null;
    } else if (Bestiary && currentLevelId != null) {
      bid = currentMapping[s] != null ? currentMapping[s] : null;
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

  STM.createBoardRenderer = createBoardRenderer;
  STM.SUITS = SUITS;
  STM.chipSVG = chipSVG;
  STM.rendererTest = { setSuitLevel: setSuitLevel, suitVisual: suitVisual, spriteCache: spriteCache, getSprite: getSprite };


})(typeof window !== 'undefined' ? window : globalThis);
