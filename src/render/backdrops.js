/* =========================================================
 * Slide & Triple — Eco Backdrops《万物出发！》20 景生态背景（Δ14c / T052d / FR-035）
 * classic script；向 window.STM 挂载 STM.Backdrops（D-01）
 * 纯程序化多层风景（天空渐变/远景剪影/中景/近景 ≥3 层——宪章 III 零图片）
 *
 * 绑定铁律: cycleIndex = Math.floor((level.id - 1) / 3)（0~19 一一对应，
 * 同一循环 3 关共享同一景——跳关/Undo 均以当前关 id 实时计算）
 * 题材分布: Cycle 1~7 陆地田园 / 8~14 碧海蓝天 / 15~20 奇幻远航
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* cycleIndex → 景（20 景清单——FR-035 §1 题材分布） */
  var SCENES = [
    { idx: 0,  name: '阳光牧场',  kind: 'meadow' },
    { idx: 1,  name: '花海梯田',  kind: 'flower' },
    { idx: 2,  name: '金黄麦田',  kind: 'wheat' },
    { idx: 3,  name: '青翠山谷',  kind: 'valley' },
    { idx: 4,  name: '果园飘香',  kind: 'orchard' },
    { idx: 5,  name: '湖畔草坪',  kind: 'lake' },
    { idx: 6,  name: '山间风车',  kind: 'windmill' },
    { idx: 7,  name: '碧海沙滩',  kind: 'beach' },
    { idx: 8,  name: '珊瑚浅湾',  kind: 'coral' },
    { idx: 9,  name: '蔚蓝群岛',  kind: 'islands' },
    { idx: 10, name: '彩虹河谷',  kind: 'rainbow' },
    { idx: 11, name: '灯塔海岸',  kind: 'lighthouse' },
    { idx: 12, name: '云海日出',  kind: 'seasky' },
    { idx: 13, name: '飞鱼跃浪',  kind: 'dolphins' },
    { idx: 14, name: '热气球晨光', kind: 'balloons' },
    { idx: 15, name: '扬帆海港',  kind: 'harbor' },
    { idx: 16, name: '云端金顶',  kind: 'goldpeak' },
    { idx: 17, name: '极光夜航',  kind: 'aurora' },
    { idx: 18, name: '璀璨星河',  kind: 'galaxy' },
    { idx: 19, name: '星际远航',  kind: 'cosmos' }
  ];

  /* ---------- 工具 ---------- */
  function lin(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function fillRect(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  /* 三层远山剪影（色 + 起伏正弦合成） */
  function hills(ctx, W, H, baseY, layers, seed) {
    for (var li = 0; li < layers.length; li++) {
      var L = layers[li];
      ctx.fillStyle = L.c;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += Math.max(8, W / 40)) {
        var y = baseY + L.off
          + Math.sin(x / W * Math.PI * 2 + seed * 7 + li * 2.4) * L.amp
          + Math.sin(x / W * Math.PI * 6 + seed * 13 + li * 1.3) * L.amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
  }
  /* 云朵（柔白多圆——治愈系圆润语汇） */
  function cloud(ctx, x, y, s, alpha) {
    ctx.globalAlpha = alpha == null ? 0.85 : alpha;
    ctx.fillStyle = '#FFFFFF';
    var r = s * 0.24;
    ctx.beginPath();
    ctx.arc(x - s * 0.36, y, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x, y - r * 0.5, r, 0, Math.PI * 2);
    ctx.arc(x + s * 0.36, y, r * 0.85, 0, Math.PI * 2);
    ctx.arc(x + s * 0.1, y + r * 0.35, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x - s * 0.1, y + r * 0.3, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  /* 星星（星河/夜航场景） */
  function stars(ctx, W, H, n, seed, maxY) {
    var x = seed * 9301 + 49297;
    function rnd() { x = (x * 9301 + 49297) % 233280; return x / 233280; }
    ctx.fillStyle = '#FFFFFF';
    var lim = maxY == null ? H * 0.6 : maxY;
    for (var i = 0; i < n; i++) {
      var sx = rnd() * W, sy = rnd() * lim;
      var r = 0.6 + rnd() * 1.6;
      ctx.globalAlpha = 0.35 + rnd() * 0.6;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  /* 太阳/月亮光晕 */
  function sun(ctx, x, y, r, c1, c2) {
    var g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.6);
    g.addColorStop(0, c1);
    g.addColorStop(0.35, c2);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  /* 海面波光（水平亮条） */
  function sea(ctx, W, H, y0, topC, botC) {
    fillRect(ctx, lin(ctx, 0, y0, 0, H, [0, topC, 1, botC]), 0, y0, W, H - y0);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = Math.max(1, W / 480);
    for (var i = 0; i < 7; i++) {
      var wy = y0 + (H - y0) * (0.12 + i * 0.13);
      ctx.beginPath();
      var wl = W * (0.2 + (i % 3) * 0.18), wx = W * (0.25 + (i % 4) * 0.14);
      ctx.moveTo(wx - wl / 2, wy);
      ctx.quadraticCurveTo(wx, wy - H * 0.012, wx + wl / 2, wy);
      ctx.stroke();
    }
  }
  /* 花草地毯（近景繁花点缀） */
  function meadowGround(ctx, W, H, y0, c1, c2, seed, flowerColors) {
    fillRect(ctx, lin(ctx, 0, y0, 0, H, [0, c1, 1, c2]), 0, y0, W, H - y0);
    var x = seed * 7919 + 3;
    function rnd() { x = (x * 9301 + 49297) % 233280; return x / 233280; }
    var n = 34;
    for (var i = 0; i < n; i++) {
      var fx = rnd() * W, fy = y0 + rnd() * (H - y0);
      var fc = flowerColors[Math.floor(rnd() * flowerColors.length)];
      var fr = Math.max(1.6, W * 0.006 + rnd() * W * 0.005);
      ctx.fillStyle = fc;
      for (var p = 0; p < 5; p++) {
        var pa = p * Math.PI * 2 / 5;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(pa) * fr, fy + Math.sin(pa) * fr, fr * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#FFE28A';
      ctx.beginPath(); ctx.arc(fx, fy, fr * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* =========================================================
   * 20 景绘制器（每景天空/远景/中景/近景 ≥3 层 + 渐变）
   * draw(ctx, W, H)——W/H 为画布像素
   * ========================================================= */
  var PAINT = {
    /* ---- Cycle 1~7 陆地田园 ---- */
    meadow: function (ctx, W, H) { /* 阳光牧场 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#8ED0F5', 0.55, '#BEE8F7', 1, '#E8F6E0']), 0, 0, W, H);
      sun(ctx, W * 0.78, H * 0.16, W * 0.045, '#FFE28A', 'rgba(255,240,180,0.5)');
      cloud(ctx, W * 0.2, H * 0.1, W * 0.14, 0.9);
      cloud(ctx, W * 0.55, H * 0.2, W * 0.1, 0.6);
      hills(ctx, W, H, H * 0.52, [
        { c: 'rgba(140,190,120,0.85)', off: -H * 0.05, amp: H * 0.03 },
        { c: 'rgba(110,170,95,0.9)', off: 0, amp: H * 0.04 }
      ], 3);
      meadowGround(ctx, W, H, H * 0.6, '#A8D977', '#7CBF58', 7, ['#FF7EAB', '#FFE066', '#FFFFFF', '#F98E48']);
    },
    flower: function (ctx, W, H) { /* 花海梯田 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#A5D8F2', 0.5, '#D5EEF8', 1, '#F5E8F0']), 0, 0, W, H);
      cloud(ctx, W * 0.3, H * 0.12, W * 0.16, 0.85);
      cloud(ctx, W * 0.72, H * 0.24, W * 0.11, 0.65);
      /* 梯田层带 */
      var bands = ['#F2A6C8', '#F7BFD4', '#FACFE1', '#FDE3EE', '#C8EBC0'];
      for (var i = 0; i < bands.length; i++) {
        var y0 = H * (0.5 + i * 0.1);
        ctx.fillStyle = bands[i];
        ctx.beginPath();
        ctx.moveTo(0, y0 + H * 0.08);
        for (var x = 0; x <= W; x += W / 24) {
          ctx.lineTo(x, y0 + Math.sin(x / W * 5 + i * 1.7) * H * 0.02);
        }
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      }
    },
    wheat: function (ctx, W, H) { /* 金黄麦田 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#95CBEE', 0.5, '#C8E6F5', 1, '#F2E8C8']), 0, 0, W, H);
      sun(ctx, W * 0.22, H * 0.18, W * 0.05, '#FFD93B', 'rgba(255,220,100,0.5)');
      cloud(ctx, W * 0.6, H * 0.12, W * 0.13, 0.8);
      hills(ctx, W, H, H * 0.5, [
        { c: 'rgba(200,180,120,0.8)', off: -H * 0.06, amp: H * 0.025 },
        { c: 'rgba(230,205,140,0.9)', off: 0, amp: H * 0.03 }
      ], 11);
      fillRect(ctx, lin(ctx, 0, H * 0.58, 0, H, [0, '#F0D070', 0.5, '#E8C058', 1, '#D8A840']), 0, H * 0.58, W, H * 0.42);
      /* 麦穗纹理排 */
      ctx.strokeStyle = 'rgba(180,140,60,0.4)';
      ctx.lineWidth = Math.max(1, W / 400);
      for (var i = 0; i < 9; i++) {
        var wy = H * (0.63 + i * 0.045);
        ctx.beginPath(); ctx.moveTo(0, wy); ctx.lineTo(W, wy - H * 0.01); ctx.stroke();
      }
    },
    valley: function (ctx, W, H) { /* 青翠山谷 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#A0D2F0', 0.6, '#C5E5F5', 1, '#DEF0E0']), 0, 0, W, H);
      cloud(ctx, W * 0.18, H * 0.14, W * 0.12, 0.85);
      cloud(ctx, W * 0.82, H * 0.1, W * 0.1, 0.7);
      hills(ctx, W, H, H * 0.5, [
        { c: 'rgba(110,160,150,0.75)', off: -H * 0.09, amp: H * 0.05 },
        { c: 'rgba(100,175,120,0.85)', off: -H * 0.03, amp: H * 0.04 },
        { c: 'rgba(125,200,130,0.92)', off: H * 0.03, amp: H * 0.035 }
      ], 5);
      meadowGround(ctx, W, H, H * 0.68, '#9FCE77', '#78B85C', 13, ['#FFFFFF', '#FFE066', '#B8D8F5']);
    },
    orchard: function (ctx, W, H) { /* 果园飘香 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#8FCBF0', 0.55, '#C0E8F5', 1, '#EAF5D8']), 0, 0, W, H);
      sun(ctx, W * 0.85, H * 0.12, W * 0.04, '#FFC93C', 'rgba(255,215,120,0.45)');
      hills(ctx, W, H, H * 0.54, [
        { c: 'rgba(150,200,110,0.8)', off: -H * 0.04, amp: H * 0.03 }
      ], 9);
      fillRect(ctx, lin(ctx, 0, H * 0.62, 0, H, [0, '#A8D977', 1, '#7CBF58']), 0, H * 0.62, W, H * 0.38);
      /* 果树（圆冠 + 果点） */
      var trees = [[0.15, 0.7], [0.5, 0.66], [0.85, 0.72]];
      for (var t = 0; t < trees.length; t++) {
        var tx = W * trees[t][0], ty = H * trees[t][1];
        var tr = W * 0.085;
        ctx.fillStyle = '#8A6B45';
        ctx.fillRect(tx - W * 0.008, ty, W * 0.016, H * 0.1);
        ctx.fillStyle = 'rgba(90,160,80,0.92)';
        ctx.beginPath();
        ctx.arc(tx, ty - tr * 0.4, tr, 0, Math.PI * 2);
        ctx.arc(tx - tr * 0.7, ty, tr * 0.75, 0, Math.PI * 2);
        ctx.arc(tx + tr * 0.7, ty, tr * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F05030';
        var fruit = [[-0.4, -0.5], [0.3, -0.7], [0.5, -0.2], [-0.55, -0.1], [0, -0.15]];
        for (var f = 0; f < fruit.length; f++) {
          ctx.beginPath();
          ctx.arc(tx + tr * fruit[f][0], ty - tr * 0.4 + tr * fruit[f][1], tr * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    lake: function (ctx, W, H) { /* 湖畔草坪 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#9AD5F2', 0.5, '#C8E8F7', 1, '#E2F0E8']), 0, 0, W, H);
      cloud(ctx, W * 0.25, H * 0.1, W * 0.13, 0.85);
      cloud(ctx, W * 0.7, H * 0.2, W * 0.1, 0.6);
      hills(ctx, W, H, H * 0.46, [
        { c: 'rgba(120,170,130,0.8)', off: -H * 0.05, amp: H * 0.035 }
      ], 17);
      /* 湖面（天空镜像） */
      fillRect(ctx, lin(ctx, 0, H * 0.55, 0, H * 0.82, [0, '#A8D8F0', 1, '#78B4D8']), 0, H * 0.55, W, H * 0.27);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = Math.max(1, W / 420);
      for (var i = 0; i < 5; i++) {
        var ly = H * (0.6 + i * 0.045);
        ctx.beginPath(); ctx.moveTo(W * 0.3, ly); ctx.lineTo(W * 0.7, ly); ctx.stroke();
      }
      meadowGround(ctx, W, H, H * 0.82, '#98CC70', '#76B85A', 23, ['#FFFFFF', '#F2A6C8', '#FFE066']);
    },
    windmill: function (ctx, W, H) { /* 山间风车 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#8FCDF2', 0.55, '#C5E8F7', 1, '#E0F0D8']), 0, 0, W, H);
      sun(ctx, W * 0.16, H * 0.14, W * 0.045, '#FFE28A', 'rgba(255,235,160,0.5)');
      cloud(ctx, W * 0.55, H * 0.12, W * 0.12, 0.8);
      hills(ctx, W, H, H * 0.52, [
        { c: 'rgba(135,185,115,0.85)', off: -H * 0.04, amp: H * 0.03 },
        { c: 'rgba(110,170,95,0.92)', off: H * 0.02, amp: H * 0.035 }
      ], 29);
      /* 风车塔 + 叶片 */
      var mx = W * 0.72, my = H * 0.56;
      ctx.fillStyle = '#FDFDFD';
      ctx.beginPath();
      ctx.moveTo(mx - W * 0.028, my + H * 0.16);
      ctx.lineTo(mx - W * 0.016, my - H * 0.02);
      ctx.lineTo(mx + W * 0.016, my - H * 0.02);
      ctx.lineTo(mx + W * 0.028, my + H * 0.16);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#D8D0C0'; ctx.lineWidth = Math.max(1.5, W / 300);
      ctx.beginPath();
      for (var b = 0; b < 4; b++) {
        var ba = b * Math.PI / 2 + 0.5;
        ctx.moveTo(mx, my - H * 0.02);
        ctx.lineTo(mx + Math.cos(ba) * W * 0.06, my - H * 0.02 + Math.sin(ba) * W * 0.06);
      }
      ctx.stroke();
      meadowGround(ctx, W, H, H * 0.7, '#A0D077', '#7ABF5A', 31, ['#FFFFFF', '#FFE066', '#F98E48']);
    },
    /* ---- Cycle 8~14 碧海蓝天 ---- */
    beach: function (ctx, W, H) { /* 碧海沙滩 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#6EC4EE', 0.45, '#A8DDF5', 1, '#F5E8C8']), 0, 0, W, H);
      sun(ctx, W * 0.8, H * 0.13, W * 0.05, '#FFE28A', 'rgba(255,240,180,0.55)');
      cloud(ctx, W * 0.25, H * 0.1, W * 0.12, 0.85);
      cloud(ctx, W * 0.6, H * 0.22, W * 0.09, 0.6);
      sea(ctx, W, H, H * 0.5, '#5BB8E8', '#2E8FC8');
      /* 沙滩 */
      fillRect(ctx, lin(ctx, 0, H * 0.72, 0, H, [0, '#F7E8B8', 1, '#EBD08A']), 0, H * 0.72, W, H * 0.28);
      /* 贝壳点缀 */
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      var shells = [[0.2, 0.85], [0.5, 0.92], [0.8, 0.82], [0.35, 0.78]];
      for (var i = 0; i < shells.length; i++) {
        ctx.beginPath();
        ctx.arc(W * shells[i][0], H * shells[i][1], W * 0.012, Math.PI, 0);
        ctx.closePath(); ctx.fill();
      }
    },
    coral: function (ctx, W, H) { /* 珊瑚浅湾 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#5FC0EA', 0.4, '#9AD8F2', 1, '#C8E8F0']), 0, 0, W, H);
      sun(ctx, W * 0.2, H * 0.1, W * 0.045, '#FFE9A8', 'rgba(255,235,170,0.5)');
      sea(ctx, W, H, H * 0.42, '#48B0E0', '#1E88C0');
      /* 珊瑚群（浅水底景） */
      var corals = [[0.18, '#F98E7E', 0.9], [0.5, '#F5B7A0', 1.1], [0.82, '#E88AA8', 0.85]];
      for (var ci = 0; ci < corals.length; ci++) {
        var cx0 = W * corals[ci][0], cy0 = H * 0.86, sc = corals[ci][2];
        ctx.fillStyle = corals[ci][1];
        for (var b = 0; b < 5; b++) {
          var bh = H * 0.13 * sc * (0.6 + (b % 3) * 0.28);
          var bw = W * 0.02 * sc;
          ctx.beginPath();
          ctx.moveTo(cx0 + (b - 2) * bw * 1.4 - bw / 2, cy0);
          ctx.quadraticCurveTo(cx0 + (b - 2) * bw * 1.4, cy0 - bh, cx0 + (b - 2) * bw * 1.4 + bw / 2, cy0);
          ctx.closePath(); ctx.fill();
        }
      }
      /* 气泡 */
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, W / 500);
      for (var bu = 0; bu < 8; bu++) {
        var bx = W * (0.1 + (bu * 0.11) % 0.8), by = H * (0.5 + (bu * 0.07) % 0.3);
        ctx.beginPath(); ctx.arc(bx, by, W * (0.006 + (bu % 3) * 0.004), 0, Math.PI * 2); ctx.stroke();
      }
    },
    islands: function (ctx, W, H) { /* 蔚蓝群岛 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#5AB8EC', 0.5, '#A0DCF5', 1, '#D5EDF5']), 0, 0, W, H);
      cloud(ctx, W * 0.3, H * 0.12, W * 0.13, 0.85);
      sun(ctx, W * 0.85, H * 0.15, W * 0.04, '#FFE28A', 'rgba(255,235,170,0.5)');
      /* 岛屿剪影（远近两排） */
      hills(ctx, W, H, H * 0.55, [
        { c: 'rgba(90,150,170,0.5)', off: -H * 0.08, amp: H * 0.025 },
        { c: 'rgba(70,150,110,0.85)', off: -H * 0.02, amp: H * 0.03 }
      ], 41);
      sea(ctx, W, H, H * 0.62, '#48B0E0', '#2490C8');
      /* 帆影 */
      ctx.fillStyle = '#FDFDFD';
      var sx = W * 0.4, sy = H * 0.74;
      ctx.beginPath();
      ctx.moveTo(sx, sy - H * 0.09); ctx.lineTo(sx, sy); ctx.lineTo(sx + W * 0.045, sy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#E8482A';
      ctx.fillRect(sx - W * 0.03, sy, W * 0.075, H * 0.012);
    },
    rainbow: function (ctx, W, H) { /* 彩虹河谷 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#78C0F0', 0.55, '#B0E0F5', 1, '#E0F0E5']), 0, 0, W, H);
      /* 彩虹拱 */
      var colors = ['#F05030', '#F59F2A', '#FFD93B', '#7CC24B', '#5AA9E6', '#9B72D0'];
      var rcx = W * 0.5, rcy = H * 0.78, rr = W * 0.34;
      for (var i = 0; i < colors.length; i++) {
        ctx.strokeStyle = colors[i];
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = Math.max(4, W * 0.018);
        ctx.beginPath();
        ctx.arc(rcx, rcy, rr - i * W * 0.02, Math.PI, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      cloud(ctx, W * 0.12, H * 0.18, W * 0.12, 0.9);
      cloud(ctx, W * 0.88, H * 0.2, W * 0.1, 0.75);
      hills(ctx, W, H, H * 0.68, [
        { c: 'rgba(120,180,110,0.9)', off: -H * 0.03, amp: H * 0.03 }
      ], 47);
      meadowGround(ctx, W, H, H * 0.78, '#A0D077', '#7ABF5A', 53, ['#FFFFFF', '#FFE066', '#F2A6C8', '#B8D8F5']);
    },
    lighthouse: function (ctx, W, H) { /* 灯塔海岸 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#8AC8EC', 0.5, '#C0E0F2', 1, '#F0E8D8']), 0, 0, W, H);
      sun(ctx, W * 0.18, H * 0.14, W * 0.045, '#FFD93B', 'rgba(255,220,110,0.5)');
      cloud(ctx, W * 0.55, H * 0.12, W * 0.12, 0.8);
      sea(ctx, W, H, H * 0.6, '#5BB8E8', '#2E90C8');
      /* 灯塔（崖上） */
      var lx = W * 0.74, lbase = H * 0.62;
      fillRect(ctx, lin(ctx, lx, lbase - H * 0.22, lx, lbase, [0, '#FDFDFD', 1, '#E8D8C8']), lx - W * 0.022, lbase - H * 0.22, W * 0.044, H * 0.22);
      ctx.fillStyle = '#F05030';
      ctx.fillRect(lx - W * 0.024, lbase - H * 0.2, W * 0.048, H * 0.035);
      ctx.fillRect(lx - W * 0.024, lbase - H * 0.13, W * 0.048, H * 0.035);
      ctx.fillStyle = '#FFC93C';
      ctx.fillRect(lx - W * 0.012, lbase - H * 0.26, W * 0.024, H * 0.045);
      ctx.fillStyle = '#F05030';
      ctx.beginPath();
      ctx.moveTo(lx - W * 0.018, lbase - H * 0.26);
      ctx.lineTo(lx, lbase - H * 0.3);
      ctx.lineTo(lx + W * 0.018, lbase - H * 0.26);
      ctx.closePath(); ctx.fill();
      /* 崖体 */
      ctx.fillStyle = 'rgba(140,150,130,0.95)';
      ctx.beginPath();
      ctx.moveTo(W * 0.6, H); ctx.lineTo(lx - W * 0.05, lbase + H * 0.04);
      ctx.lineTo(lx + W * 0.06, lbase + H * 0.04); ctx.lineTo(W * 0.92, H);
      ctx.closePath(); ctx.fill();
    },
    seasky: function (ctx, W, H) { /* 云海日出 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#F5B76E', 0.3, '#F2D5A0', 0.6, '#B8DCF0', 1, '#E8F2F8']), 0, 0, W, H);
      sun(ctx, W * 0.5, H * 0.4, W * 0.055, '#FFDFA0', 'rgba(255,200,120,0.6)');
      /* 云海层（多层柔白正弦带） */
      var bandsC = ['rgba(255,240,220,0.75)', 'rgba(255,248,238,0.85)', 'rgba(248,252,255,0.92)'];
      for (var i = 0; i < 3; i++) {
        ctx.fillStyle = bandsC[i];
        var y0 = H * (0.5 + i * 0.11);
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (var x = 0; x <= W; x += W / 32) {
          ctx.lineTo(x, y0 + Math.sin(x / W * 7 + i * 2.2) * H * 0.035);
        }
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
      sun(ctx, W * 0.5, H * 0.46, W * 0.03, '#FFFFFF', 'rgba(255,255,255,0.4)');
    },
    dolphins: function (ctx, W, H) { /* 飞鱼跃浪 */
      fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#6EC0E8', 0.5, '#A5DCF2', 1, '#E0EFF8']), 0, 0, W, H);
      cloud(ctx, W * 0.2, H * 0.1, W * 0.12, 0.8);
      sun(ctx, W * 0.82, H * 0.12, W * 0.04, '#FFE28A', 'rgba(255,235,160,0.45)');
      sea(ctx, W, H, H * 0.52, '#4AB0E0', '#2490C8');
      /* 海豚跃弧×2 */
      var jumps = [[W * 0.3, H * 0.42, 1], [W * 0.68, H * 0.5, -1]];
      for (var j = 0; j < jumps.length; j++) {
        var jx = jumps[j][0], jy = jumps[j][1], flip = jumps[j][2];
        ctx.save();
        ctx.translate(jx, jy);
        ctx.scale(flip, 1);
        ctx.fillStyle = '#7FB8E6';
        ctx.beginPath();
        ctx.moveTo(-W * 0.07, 0);
        ctx.quadraticCurveTo(0, -H * 0.09, W * 0.07, -H * 0.01);
        ctx.quadraticCurveTo(0, H * 0.02, -W * 0.07, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#A8D0F0';
        ctx.beginPath();
        ctx.moveTo(0, -H * 0.02);
        ctx.quadraticCurveTo(W * 0.02, -H * 0.05, W * 0.05, -H * 0.06);
        ctx.quadraticCurveTo(W * 0.02, -H * 0.03, 0, -H * 0.02);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      /* 水花 */
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (var s = 0; s < 6; s++) {
        ctx.beginPath();
        ctx.arc(W * (0.26 + s * 0.09), H * (0.55 + (s % 2) * 0.03), W * 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  /* ---- Cycle 15~20 奇幻远航 ---- */
  PAINT.balloons = function (ctx, W, H) { /* 热气球晨光 */
    fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#F5C88E', 0.35, '#F2E0B8', 0.7, '#C8E0F0', 1, '#EAF2F8']), 0, 0, W, H);
    sun(ctx, W * 0.2, H * 0.3, W * 0.05, '#FFE28A', 'rgba(255,220,150,0.55)');
    hills(ctx, W, H, H * 0.66, [
      { c: 'rgba(160,170,150,0.6)', off: -H * 0.05, amp: H * 0.03 }
    ], 59);
    fillRect(ctx, lin(ctx, 0, H * 0.72, 0, H, [0, '#B8D4A0', 1, '#8ABF7A']), 0, H * 0.72, W, H * 0.28);
    /* 热气球群（远小近大） */
    var bal = [[0.35, 0.22, 0.09, '#F78FA7'], [0.62, 0.14, 0.06, '#8FD3F4'], [0.82, 0.28, 0.075, '#FFE28A']];
    for (var i = 0; i < bal.length; i++) {
      var bx = W * bal[i][0], by = H * bal[i][1], br = W * bal[i][2];
      /* 球体条纹 */
      ctx.fillStyle = bal[i][3];
      ctx.beginPath();
      ctx.moveTo(bx, by - br * 0.62);
      ctx.bezierCurveTo(bx + br * 0.75, by - br * 0.55, bx + br * 0.7, by + br * 0.2, bx, by + br * 0.38);
      ctx.bezierCurveTo(bx - br * 0.7, by + br * 0.2, bx - br * 0.75, by - br * 0.55, bx, by - br * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(bx, by - br * 0.62);
      ctx.bezierCurveTo(bx + br * 0.22, by - br * 0.55, bx + br * 0.2, by + br * 0.2, bx, by + br * 0.38);
      ctx.bezierCurveTo(bx - br * 0.22, by + br * 0.2, bx - br * 0.22, by - br * 0.55, bx, by - br * 0.62);
      ctx.closePath(); ctx.fill();
      /* 吊篮 */
      ctx.strokeStyle = '#8A6B45';
      ctx.lineWidth = Math.max(1, W / 450);
      ctx.beginPath();
      ctx.moveTo(bx - br * 0.15, by + br * 0.38); ctx.lineTo(bx - br * 0.12, by + br * 0.62);
      ctx.moveTo(bx + br * 0.15, by + br * 0.38); ctx.lineTo(bx + br * 0.12, by + br * 0.62);
      ctx.stroke();
      ctx.fillStyle = '#B08F5C';
      ctx.fillRect(bx - br * 0.14, by + br * 0.6, br * 0.28, br * 0.2);
    }
    cloud(ctx, W * 0.5, H * 0.4, W * 0.1, 0.5);
  };
  PAINT.harbor = function (ctx, W, H) { /* 扬帆海港 */
    fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#7BB8E8', 0.5, '#B5DDF2', 1, '#F0E5D0']), 0, 0, W, H);
    cloud(ctx, W * 0.28, H * 0.1, W * 0.12, 0.85);
    sun(ctx, W * 0.78, H * 0.16, W * 0.045, '#FFE28A', 'rgba(255,235,170,0.5)');
    sea(ctx, W, H, H * 0.58, '#50B4E4', '#2894CC');
    /* 港口城市剪影 */
    ctx.fillStyle = 'rgba(90,110,140,0.85)';
    var bld = [[0.06, 0.14], [0.16, 0.1], [0.26, 0.18], [0.36, 0.12], [0.46, 0.16]];
    for (var i = 0; i < bld.length; i++) {
      ctx.fillRect(W * bld[i][0], H * (0.5 - bld[i][1]), W * 0.08, H * bld[i][1]);
    }
    /* 双帆船 */
    var boats = [[W * 0.3, H * 0.75, 1.1], [W * 0.68, H * 0.7, 0.8]];
    for (var b = 0; b < boats.length; b++) {
      var sx = boats[b][0], sy = boats[b][1], sc = boats[b][2];
      ctx.fillStyle = '#FDFDFD';
      ctx.beginPath();
      ctx.moveTo(sx, sy - H * 0.1 * sc); ctx.lineTo(sx, sy); ctx.lineTo(sx + W * 0.05 * sc, sy);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx, sy - H * 0.07 * sc); ctx.lineTo(sx, sy); ctx.lineTo(sx - W * 0.035 * sc, sy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#E8482A';
      ctx.fillRect(sx - W * 0.035 * sc, sy, W * 0.085 * sc, H * 0.014 * sc);
    }
  };
  PAINT.goldpeak = function (ctx, W, H) { /* 云端金顶 */
    fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#C8B8E8', 0.4, '#F2D8C0', 0.75, '#FFE8C0', 1, '#FFF5E0']), 0, 0, W, H);
    sun(ctx, W * 0.5, H * 0.32, W * 0.06, '#FFF0B8', 'rgba(255,225,150,0.65)');
    /* 云海 */
    var bandsC = ['rgba(230,220,250,0.7)', 'rgba(245,235,252,0.8)', 'rgba(252,248,255,0.92)'];
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = bandsC[i];
      var y0 = H * (0.55 + i * 0.1);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += W / 32) {
        ctx.lineTo(x, y0 + Math.sin(x / W * 6 + i * 2.6) * H * 0.032);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
    /* 金顶雪山 */
    ctx.fillStyle = '#8A7BA8';
    ctx.beginPath();
    ctx.moveTo(W * 0.18, H * 0.78); ctx.lineTo(W * 0.38, H * 0.52); ctx.lineTo(W * 0.58, H * 0.78);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFF5D8';
    ctx.beginPath();
    ctx.moveTo(W * 0.3, H * 0.62); ctx.lineTo(W * 0.38, H * 0.52); ctx.lineTo(W * 0.46, H * 0.62);
    ctx.lineTo(W * 0.42, H * 0.6); ctx.lineTo(W * 0.38, H * 0.64); ctx.lineTo(W * 0.34, H * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#A898C4';
    ctx.beginPath();
    ctx.moveTo(W * 0.55, H * 0.82); ctx.lineTo(W * 0.72, H * 0.6); ctx.lineTo(W * 0.9, H * 0.82);
    ctx.closePath(); ctx.fill();
  };
  PAINT.aurora = function (ctx, W, H) { /* 极光夜航 */
    fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#0E1A30', 0.55, '#1E3050', 1, '#2A4460']), 0, 0, W, H);
    stars(ctx, W, H, 60, 67, H * 0.55);
    /* 极光带（3 条渐变波带） */
    var aurora = [
      { c: 'rgba(80,240,180,0.35)', off: 0.32, amp: 0.06, ph: 1.2 },
      { c: 'rgba(120,180,250,0.3)', off: 0.38, amp: 0.08, ph: 2.8 },
      { c: 'rgba(200,130,250,0.25)', off: 0.45, amp: 0.05, ph: 4.4 }
    ];
    for (var a = 0; a < aurora.length; a++) {
      var A = aurora[a];
      var g = ctx.createLinearGradient(0, H * (A.off - 0.1), 0, H * (A.off + 0.18));
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, A.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, H * A.off);
      for (var x = 0; x <= W; x += W / 40) {
        ctx.lineTo(x, H * (A.off + Math.sin(x / W * 5 + A.ph) * A.amp));
      }
      ctx.lineTo(W, H * (A.off + A.amp + 0.14));
      for (var x2 = W; x2 >= 0; x2 -= W / 40) {
        ctx.lineTo(x2, H * (A.off + Math.sin(x2 / W * 5 + A.ph) * A.amp + 0.14));
      }
      ctx.closePath(); ctx.fill();
    }
    /* 雪岭剪影 */
    ctx.fillStyle = '#152238';
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, H * 0.72);
    ctx.lineTo(W * 0.2, H * 0.62); ctx.lineTo(W * 0.38, H * 0.75);
    ctx.lineTo(W * 0.55, H * 0.58); ctx.lineTo(W * 0.72, H * 0.74);
    ctx.lineTo(W * 0.9, H * 0.64); ctx.lineTo(W, H * 0.76); ctx.lineTo(W, H);
    ctx.closePath(); ctx.fill();
  };
  PAINT.galaxy = function (ctx, W, H) { /* 璀璨星河 */
    fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#0A1230', 0.5, '#182848', 1, '#2A3A60']), 0, 0, W, H);
    stars(ctx, W, H, 90, 71, H * 0.7);
    /* 银河带（斜向星雾） */
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(120,140,220,0)');
    g.addColorStop(0.35, 'rgba(160,180,255,0.22)');
    g.addColorStop(0.5, 'rgba(200,215,255,0.3)');
    g.addColorStop(0.65, 'rgba(160,180,255,0.22)');
    g.addColorStop(1, 'rgba(120,140,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.1);
    ctx.quadraticCurveTo(W * 0.5, H * 0.5, W, H * 0.9);
    ctx.lineTo(W, H * 0.55);
    ctx.quadraticCurveTo(W * 0.5, H * 0.25, 0, H * -0.15);
    ctx.closePath(); ctx.fill();
    /* 银河内密星 */
    var x = 173;
    function rnd() { x = (x * 9301 + 49297) % 233280; return x / 233280; }
    ctx.fillStyle = '#FFFFFF';
    for (var i = 0; i < 40; i++) {
      var sx = rnd() * W, sy = H * (0.15 + rnd() * 0.6);
      if (Math.abs(sy - (0.5 * sx / W + 0.15) * H) < H * 0.18) {
        ctx.globalAlpha = 0.5 + rnd() * 0.5;
        ctx.beginPath(); ctx.arc(sx, sy, 0.5 + rnd() * 1.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    /* 流星 */
    ctx.strokeStyle = 'rgba(255,240,200,0.8)';
    ctx.lineWidth = Math.max(1.5, W / 400);
    ctx.beginPath();
    ctx.moveTo(W * 0.15, H * 0.18); ctx.lineTo(W * 0.3, H * 0.28);
    ctx.stroke();
    /* 地平线行星弧 */
    ctx.fillStyle = '#1A2C50';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 1.4, W * 0.75, Math.PI * 1.15, Math.PI * 1.85);
    ctx.closePath(); ctx.fill();
  };
  PAINT.cosmos = function (ctx, W, H) { /* 星际远航 */
    fillRect(ctx, lin(ctx, 0, 0, 0, H, [0, '#0C0E24', 0.5, '#1A1E3E', 1, '#283058']), 0, 0, W, H);
    stars(ctx, W, H, 110, 83, H * 0.85);
    /* 大行星（带环） */
    var px = W * 0.5, py = H * 0.78, pr = W * 0.42;
    var pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
    pg.addColorStop(0, '#E8CFA0');
    pg.addColorStop(0.6, '#C9A96B');
    pg.addColorStop(1, '#8A7448');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, pr, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(230,210,170,0.5)';
    ctx.lineWidth = Math.max(2, W * 0.012);
    ctx.beginPath(); ctx.ellipse(px, py, pr * 1.25, pr * 0.3, -0.12, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    /* 小卫星 */
    ctx.fillStyle = '#B8C4D4';
    ctx.beginPath(); ctx.arc(W * 0.18, H * 0.3, W * 0.035, 0, Math.PI * 2); ctx.fill();
    /* 星尘光带 */
    var g = ctx.createLinearGradient(0, 0, W, H * 0.8);
    g.addColorStop(0, 'rgba(130,150,240,0)');
    g.addColorStop(0.5, 'rgba(150,170,255,0.18)');
    g.addColorStop(1, 'rgba(130,150,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.25);
    ctx.quadraticCurveTo(W * 0.5, H * 0.1, W, H * 0.45);
    ctx.lineTo(W, H * 0.6);
    ctx.quadraticCurveTo(W * 0.5, H * 0.28, 0, H * 0.42);
    ctx.closePath(); ctx.fill();
  };

  /* =========================================================
   * Δ15b/T052j: 贴图优先背景层（宪章 III v2.0.0——外部贴图 + 强制兜底）
   * · 6 张去水印 9:16 背景图映射 20 循环（用户口径——覆盖 T052j 原文
   *   bg{cycleIndex+1} 的 1~20 一一对应: 0~3→bg1, 4~6→bg2, 7~10→bg3,
   *   11~13→bg4, 14~16→bg5, 17~19→bg6）
   * · 逐景独立判定: Image onerror/未就绪 → 该景降级程序化绘制
   *   （PAINT 函数为兜底渲染源——T052d 产出降格复用）
   * · 会话级缓存: 探测结果缓存（同景不重复探测、不闪烁——三态:
   *   loading/ready/failed）
   * · Image 相对路径（file:// 双击与静态服务双形态一致）
   * ========================================================= */
  var BG_EXT = ['png', 'jpg', 'jpeg', 'webp']; /* 兼容扩展序（逐个探测） */
  var bgImageCache = {}; /* cycleIndex → { state, img, ext, tried } */
  var bgReadyListeners = []; /* Δ15b: 贴图就绪惰性换装通知（loading→ready 一次性回调） */

  function onBgReady(fn) {
    if (typeof fn === 'function') bgReadyListeners.push(fn);
  }

  function bgImageIndexOf(ci) {
    if (ci <= 3) return 1;
    if (ci <= 6) return 2;
    if (ci <= 10) return 3;
    if (ci <= 13) return 4;
    if (ci <= 16) return 5;
    return 6;
  }

  function probeBgImage(ci) {
    var rec = bgImageCache[ci];
    if (rec && rec.tried) return rec; /* 会话级缓存——同景不重复探测 */
    rec = bgImageCache[ci] = { state: 'loading', img: null, ext: null, tried: true };
    if (typeof Image !== 'function') { rec.state = 'failed'; return rec; } /* 非 DOM 环境（selftest）直接兜底 */
    var seq = 0;
    function tryNext() {
      if (seq >= BG_EXT.length) { rec.state = 'failed'; return; }
      var ext = BG_EXT[seq++];
      var img = new Image();
      img.onload = function () {
        rec.state = 'ready'; rec.img = img; rec.ext = ext;
        /* Δ15b: 就绪通知（一次性——监听器换装重绘; BoardRenderer 失效
         * 背景缓存层使下一帧以贴图重绘——不闪烁: 程序化底已铺） */
        for (var ln = 0; ln < bgReadyListeners.length; ln++) {
          try { bgReadyListeners[ln](); } catch (errL) { /* 监听器异常隔离 */ }
        }
      };
      img.onerror = tryNext; /* 扩展序逐个探测 */
      img.src = 'assets/bg/bg' + bgImageIndexOf(ci) + '.' + ext;
    }
    tryNext();
    return rec;
  }
  function cycleIndexOf(levelId) {
    /* 60 关闭环: >60 的 id 钳制回 19（Math.min 防越界——SC-008 0 遗漏 0 冲突） */
    return Math.min(19, Math.max(0, Math.floor(((levelId || 1) - 1) / 3)));
  }

  /* =========================================================
   * Δ15b/T052j: 色温光影 + 飘落粒子（贴图与程序化两来源同样叠加）
   * · 色温: 按循环段落的题材基调（暖阳/清新/海洋/暮色/高空/星夜）
   *   低透明度覆盖——保证滑块可读性（FR-035 §4 对两来源同样生效）
   * · 粒子: 4 类主题飘落（阳光光斑/气泡浮升/樱花瓣/星尘）
   *   ——纯函数动画（rAF 时间驱动，零状态污染——粒子相位由 (i, t) 决定）
   * ========================================================= */
  var TONE = [
    { grad: 'rgba(255,214,140,0.10)', bot: 'rgba(255,180,90,0.14)',  kind: 'sun' },     /* bg1 牧场/花田/麦田——暖阳 */
    { grad: 'rgba(190,235,170,0.10)', bot: 'rgba(140,210,160,0.13)', kind: 'sun' },     /* bg2 果园/湖畔/风车——清新 */
    { grad: 'rgba(160,220,240,0.10)', bot: 'rgba(90,180,220,0.14)',  kind: 'bubble' },  /* bg3 海滩/珊瑚/群岛/彩虹 */
    { grad: 'rgba(255,200,150,0.10)', bot: 'rgba(240,150,110,0.15)', kind: 'petal' },   /* bg4 灯塔/日出/飞鱼——暮彩 */
    { grad: 'rgba(230,235,250,0.10)', bot: 'rgba(200,215,245,0.14)', kind: 'petal' },   /* bg5 气球/海港/金顶——高风云 */
    { grad: 'rgba(140,160,255,0.10)', bot: 'rgba(80,100,220,0.16)',  kind: 'stardust' } /* bg6 极光/星河/远航——星夜 */
  ];

  function drawToneOverlay(ctx, ci, W, H) {
    var t = TONE[Math.min(5, Math.max(0, (ci <= 3 ? 0 : ci <= 6 ? 1 : ci <= 10 ? 2 : ci <= 13 ? 3 : ci <= 16 ? 4 : 5)))];
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.grad);
    g.addColorStop(0.72, t.bot);
    g.addColorStop(1, t.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return t;
  }

  /* 飘落粒子（kind × 紮比相位——纯函数）; 每类 12~16 粒 */
  function drawParticles(ctx, kind, W, H, tMs) {
    var n = 14;
    var t = (tMs || 0) / 1000;
    ctx.save();
    for (var i = 0; i < n; i++) {
      var ph = i * 0.618; /* 黄金散布——伪随机相位 */
      var cyc = (t * (0.06 + (i % 5) * 0.014) + ph) % 1;
      if (kind === 'sun') {
        /* 阳光光斑: 上浮微光点（左上光源方向漂移） */
        var sx = (0.12 + (i % 7) * 0.12 + Math.sin(t * 0.7 + ph) * 0.03) * W;
        var sy = (1 - cyc) * H;
        var sr = (1.5 + (i % 4) * 0.8) * (W / 400);
        ctx.globalAlpha = 0.10 + 0.08 * Math.sin(t * 1.3 + ph * 3);
        ctx.fillStyle = 'rgba(255,238,180,1)';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'bubble') {
        /* 气泡: 底部上浮（半径随高度涨大——解压感） */
        var bx = (0.10 + (i % 6) * 0.16 + Math.sin(t * 0.9 + ph) * 0.02) * W;
        var by = (1 - cyc) * H;
        var br = (1.2 + (i % 5) * 0.7) * (W / 400) * (0.7 + cyc * 0.6);
        ctx.globalAlpha = 0.09 + 0.07 * Math.sin(t * 1.6 + ph * 5);
        ctx.strokeStyle = 'rgba(230,250,255,1)';
        ctx.lineWidth = Math.max(1, W / 500);
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
      } else if (kind === 'petal') {
        /* 樱花瓣: 飘落 + 横向摆动（花瓣形椭圆旋转） */
        var px = (0.08 + (i % 8) * 0.12 + Math.sin(t * 0.8 + ph * 2) * 0.05) * W;
        var py = cyc * H;
        ctx.globalAlpha = 0.12 + 0.08 * Math.sin(t * 1.1 + ph * 4);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(t * 1.2 + ph * 6);
        ctx.fillStyle = 'rgba(255,182,210,1)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.6 * (W / 400), 1.5 * (W / 400), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        /* 星尘: 缓降闪烁微光（夜空主题） */
        var dx = (0.06 + (i % 9) * 0.11 + Math.sin(t * 0.5 + ph) * 0.02) * W;
        var dy = cyc * H;
        var dr = (0.8 + (i % 4) * 0.6) * (W / 400);
        ctx.globalAlpha = 0.10 + 0.10 * Math.sin(t * 2.0 + ph * 7);
        ctx.fillStyle = 'rgba(210,225,255,1)';
        ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore(); /* globalAlpha 复位 */
  }

  /* =========================================================
   * 背景渲染入口（BoardRenderer 消费）—— Δ15b: 贴图优先 + 程序化兜底
   * drawBackdrop(ctx, levelId, W, H) —— 静态一次性绘制
   * cycleIndex = Math.floor((level.id - 1) / 3)（FR-035 §2 铁律）
   * drawBackdropAnim(ctx, levelId, W, H, tMs) —— 粒子/光影动态层
   *   （BoardRenderer 每帧调——低开销 14 粒纯函数）
   * ========================================================= */
  function drawBackdrop(ctx, levelId, W, H) {
    var ci = cycleIndexOf(levelId);
    var scene = SCENES[Math.min(19, ci)];
    var rec = probeBgImage(ci);
    if (rec.state === 'ready' && rec.img) {
      /* 贴图 cover 满铺（9:16 源对 9:16 画布——同比例直接铺满无裁切;
       * 异常比例走 cover 短边铺满裁切算法——宽高比失配角缩放） */
      try {
        var iw = rec.img.naturalWidth || rec.img.width;
        var ih = rec.img.naturalHeight || rec.img.height;
        var scale = Math.max(W / iw, H / ih); /* cover: 短边铺满 */
        var dw = iw * scale, dh = ih * scale;
        ctx.drawImage(rec.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        drawToneOverlay(ctx, ci, W, H); /* FR-035 §4 可读性蒙版——两来源同样生效 */
        return scene;
      } catch (err) { rec.state = 'failed'; } /* 绘制异常 → 兜底 */
    }
    if (rec.state === 'loading') {
      /* 探测期: 先程序化铺底（不闪烁）; 探测成功后下次绘制惰性换装 */
      var fn = PAINT[scene.kind];
      if (fn) {
        try { fn(ctx, W, H); } catch (err2) { fillRect(ctx, '#C8E0F0', 0, 0, W, H); }
      }
      return scene;
    }
    var fn2 = PAINT[scene.kind];
    if (fn2) {
      try { fn2(ctx, W, H); } catch (err3) { fillRect(ctx, '#C8E0F0', 0, 0, W, H); }
    }
    return scene;
  }

  function drawBackdropAnim(ctx, levelId, W, H, tMs) {
    var ci = cycleIndexOf(levelId);
    var toneIdx = ci <= 3 ? 0 : ci <= 6 ? 1 : ci <= 10 ? 2 : ci <= 13 ? 3 : ci <= 16 ? 4 : 5;
    drawParticles(ctx, TONE[toneIdx].kind, W, H, tMs);
  }

  STM.Backdrops = {
    SCENES: SCENES,
    cycleIndexOf: cycleIndexOf,
    drawBackdrop: drawBackdrop,
    drawBackdropAnim: drawBackdropAnim,
    bgImageIndexOf: bgImageIndexOf,
    probeBgImage: probeBgImage,
    onBgReady: onBgReady
  };

})(typeof window !== 'undefined' ? window : globalThis);