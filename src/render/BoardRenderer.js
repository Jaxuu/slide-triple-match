/* =========================================================
 * Slide & Triple — BoardRenderer（Canvas 2D 渲染）
 * classic script；向 window.STM 挂载（D-01）
 * rAF 脏检查主循环（60fps 目标）；花色颜色+图形双编码（无障碍）
 *
 * M1.5 视觉升级（零外部资源，纯程序化绘制——宪章 III）：
 *   · 立体奶油麻将牌面：#FFFDF9 渐变 + 深色厚度底座 + 花色描边高光
 *   · 8 种鲜艳水果/麻将花色（贝塞尔 + 径向渐变 + 高光点）
 *   · 胶囊形方向箭头徽章（花色深色底 + 白色人字箭头）
 *   · Δ7 多层堆叠：底座随层数加厚 + 左上角层角标 + reveal 上浮动画
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};
  var RE = STM.RulesEngine;

  /* ---------- 花色表（game-session.md §4 双编码契约；M1.5 水果主题）
   * fill=粒子/角标主色 deep=徽章深色 shape=绘制键 ---------- */
  var SUITS = [
    { name: '草莓',   fill: '#FF4D6D', deep: '#B01739', shape: 'strawberry' },
    { name: '甜橙',   fill: '#FF8A00', deep: '#B35A00', shape: 'orange' },
    { name: '菠萝',   fill: '#FFC531', deep: '#A87A00', shape: 'pineapple' },
    { name: '奇异果', fill: '#7CB342', deep: '#4E7526', shape: 'kiwi' },
    { name: '蓝莓',   fill: '#4A6CF7', deep: '#2438A0', shape: 'blueberry' },
    { name: '葡萄',   fill: '#9B4DE0', deep: '#5F22A0', shape: 'grape' },
    { name: '蜜桃心', fill: '#FF7EAB', deep: '#C74B78', shape: 'peach' },
    { name: '翡翠竹', fill: '#00A878', deep: '#00674B', shape: 'jade' }
  ];
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
   * 水果/麻将花色绘制器（纯 Canvas path，每个精炼 10~15 行）
   * ========================================================= */
  function drawFruit(ctx, shape, x, y, R) {
    if (shape === 'strawberry') {
      /* 草莓：倒心形果身 + 叶冠 + 白籽 */
      ctx.beginPath();
      ctx.moveTo(x, y - R * 0.7);
      ctx.bezierCurveTo(x + R * 0.6, y - R * 0.8, x + R * 0.75, y - R * 0.1, x, y + R * 0.8);
      ctx.bezierCurveTo(x - R * 0.75, y - R * 0.1, x - R * 0.6, y - R * 0.8, x, y - R * 0.7);
      ctx.fillStyle = rg(ctx, x - R * 0.25, y - R * 0.3, R * 0.1, R, [0, '#FF8FA8', 0.55, '#FF4D6D', 1, '#D92B4E']);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - R * 0.45, y - R * 0.6);
      ctx.lineTo(x, y - R * 0.95);
      ctx.lineTo(x + R * 0.45, y - R * 0.6);
      ctx.lineTo(x + R * 0.18, y - R * 0.55);
      ctx.lineTo(x, y - R * 0.38);
      ctx.lineTo(x - R * 0.18, y - R * 0.55);
      ctx.closePath();
      ctx.fillStyle = '#3E9B4F';
      ctx.fill();
      ctx.fillStyle = '#FFF3E0';
      var seeds = [[-0.3, -0.1], [0.3, -0.1], [0, 0.25], [-0.25, 0.45], [0.25, 0.45]];
      for (var s = 0; s < seeds.length; s++) {
        ctx.beginPath();
        ctx.arc(x + R * seeds[s][0], y + R * seeds[s][1], R * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (shape === 'orange') {
      /* 甜橙：圆果身 + 高光 + 小叶 */
      ctx.beginPath();
      ctx.arc(x, y + R * 0.06, R * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = rg(ctx, x - R * 0.3, y - R * 0.25, R * 0.1, R * 0.9, [0, '#FFC37E', 0.55, '#FF8A00', 1, '#E06D00']);
      ctx.fill();
      ctx.fillStyle = '#3E9B4F';
      ctx.beginPath();
      ctx.moveTo(x, y - R * 0.68);
      ctx.quadraticCurveTo(x + R * 0.4, y - R * 0.95, x + R * 0.55, y - R * 0.6);
      ctx.quadraticCurveTo(x + R * 0.2, y - R * 0.6, x, y - R * 0.68);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(x - R * 0.3, y - R * 0.25, R * 0.2, R * 0.11, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'pineapple') {
      /* 菠萝：椭圆网纹果身 + 放射冠叶 */
      ctx.beginPath();
      ctx.ellipse(x, y + R * 0.25, R * 0.6, R * 0.68, 0, 0, Math.PI * 2);
      ctx.fillStyle = rg(ctx, x, y + R * 0.25, R * 0.1, R * 0.8, [0, '#FFDD66', 0.6, '#FFC531', 1, '#DFA000']);
      ctx.fill();
      ctx.strokeStyle = 'rgba(168,122,0,0.5)';
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.beginPath();
      for (var pl = -2; pl <= 2; pl++) {
        ctx.moveTo(x - R * 0.6, y + R * 0.25 + pl * R * 0.26);
        ctx.quadraticCurveTo(x, y + R * 0.25 + pl * R * 0.26 - R * 0.15, x + R * 0.6, y + R * 0.25 + pl * R * 0.26);
      }
      ctx.stroke();
      ctx.fillStyle = '#3E9B4F';
      ctx.beginPath();
      ctx.moveTo(x - R * 0.4, y - R * 0.38);
      ctx.lineTo(x - R * 0.08, y - R * 0.9);
      ctx.lineTo(x - R * 0.2, y - R * 0.32);
      ctx.lineTo(x + R * 0.06, y - R * 1.0);
      ctx.lineTo(x + R * 0.12, y - R * 0.3);
      ctx.lineTo(x + R * 0.4, y - R * 0.75);
      ctx.lineTo(x + R * 0.28, y - R * 0.26);
      ctx.closePath();
      ctx.fill();
    } else if (shape === 'kiwi') {
      /* 奇异果：果肉 + 浅芯 + 放射黑籽 */
      ctx.beginPath();
      ctx.arc(x, y, R * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = rg(ctx, x, y, R * 0.1, R * 0.85, [0, '#D9E8B0', 0.4, '#8CC152', 1, '#5F8A2E']);
      ctx.fill();
      ctx.fillStyle = '#F2F7DC';
      ctx.beginPath();
      ctx.arc(x, y, R * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2A1F0A';
      for (var ks = 0; ks < 8; ks++) {
        var ka = ks * Math.PI / 4 + 0.4;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(ka) * R * 0.45, y + Math.sin(ka) * R * 0.45, R * 0.07, R * 0.035, ka, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (shape === 'blueberry') {
      /* 蓝莓：深蓝圆果 + 五瓣冠口 + 高光 */
      ctx.beginPath();
      ctx.arc(x, y + R * 0.08, R * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = rg(ctx, x - R * 0.3, y - R * 0.15, R * 0.1, R * 0.9, [0, '#8FA4FF', 0.5, '#4A6CF7', 1, '#2E45B8']);
      ctx.fill();
      ctx.fillStyle = '#1D2E80';
      ctx.beginPath();
      for (var bc = 0; bc < 5; bc++) {
        var ba = -Math.PI / 2 + bc * 1.2566;
        var px = x + Math.cos(ba) * R * 0.16, py = y - R * 0.5 + Math.sin(ba) * R * 0.16;
        if (bc === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(x - R * 0.3, y - R * 0.18, R * 0.2, R * 0.11, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'grape') {
      /* 葡萄：三簇紫珠 + 茎 */
      var dots = [[-0.32, -0.2], [0.32, -0.2], [0, -0.1], [-0.18, 0.22], [0.18, 0.22], [0, 0.52]];
      for (var gd = 0; gd < dots.length; gd++) {
        var gx = x + R * dots[gd][0], gy = y + R * dots[gd][1];
        ctx.beginPath();
        ctx.arc(gx, gy, R * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = rg(ctx, gx - R * 0.09, gy - R * 0.1, R * 0.03, R * 0.32, [0, '#C79BF0', 0.55, '#9B4DE0', 1, '#7135A8']);
        ctx.fill();
      }
      ctx.strokeStyle = '#5F8A2E';
      ctx.lineWidth = Math.max(1.5, R * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, y - R * 0.42);
      ctx.lineTo(x, y - R * 0.75);
      ctx.stroke();
    } else if (shape === 'peach') {
      /* 蜜桃心：心形粉果 + 对缝线 + 小叶 */
      ctx.beginPath();
      ctx.moveTo(x, y + R * 0.75);
      ctx.bezierCurveTo(x - R * 0.95, y + R * 0.1, x - R * 0.6, y - R * 0.75, x, y - R * 0.25);
      ctx.bezierCurveTo(x + R * 0.6, y - R * 0.75, x + R * 0.95, y + R * 0.1, x, y + R * 0.75);
      ctx.fillStyle = rg(ctx, x - R * 0.2, y - R * 0.3, R * 0.1, R, [0, '#FFC9DC', 0.55, '#FF7EAB', 1, '#E5578C']);
      ctx.fill();
      ctx.strokeStyle = 'rgba(199,75,120,0.7)';
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y - R * 0.26);
      ctx.quadraticCurveTo(x + R * 0.12, y + R * 0.2, x, y + R * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#3E9B4F';
      ctx.beginPath();
      ctx.ellipse(x - R * 0.28, y - R * 0.52, R * 0.25, R * 0.11, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'jade') {
      /* 翡翠麻将牌：渐变底 + 三段白竹节 */
      roundRect(ctx, x - R * 0.66, y - R * 0.66, R * 1.32, R * 1.32, R * 0.2);
      var jg = ctx.createLinearGradient(x - R * 0.6, y - R * 0.6, x + R * 0.6, y + R * 0.6);
      jg.addColorStop(0, '#39C792');
      jg.addColorStop(0.6, '#00A878');
      jg.addColorStop(1, '#007A57');
      ctx.fillStyle = jg;
      ctx.fill();
      ctx.strokeStyle = '#00543C';
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.stroke();
      ctx.fillStyle = '#F0FBF4';
      for (var js = 0; js < 3; js++) {
        roundRect(ctx, x - R * 0.32, y - R * 0.36 + js * R * 0.32, R * 0.64, R * 0.24, R * 0.07);
        ctx.fill();
      }
    }
  }

  /* =========================================================
   * 立体奶油牌块（M1.5 核心：牌面 + 厚度底座 + 高光描边 + 箭头/层角标）
   * px,py 牌中心；layerOff = Δ7 堆叠错层偏移
   * ========================================================= */
  function drawTileBody(ctx, cell, px, py, t, scale, alpha, layerOff) {
    var suit = SUITS[t.s] || SUITS[0];
    scale = scale || 1;
    alpha = alpha == null ? 1 : alpha;
    layerOff = layerOff || 0;
    var depth = Math.max(1, t.stackDepth || 1);
    var w = cell * 0.84 * scale;
    var x = px - w / 2 + layerOff;
    var y = py - w / 2 + layerOff;
    var thick = cell * (0.04 * depth + 0.035); /* 底座厚度随堆叠层数增加 */
    ctx.globalAlpha = alpha;
    /* 1. 厚度底座（深→浅两级暖棕——立体麻将质感） */
    roundRect(ctx, x, y + cell * 0.028, w, w, cell * 0.14);
    ctx.fillStyle = '#8A6B4F';
    ctx.fill();
    roundRect(ctx, x, y + cell * 0.028 - thick * 0.4, w, w, cell * 0.14);
    ctx.fillStyle = '#A8845F';
    ctx.fill();
    /* 2. 奶油牌面（上亮下微暖灰） */
    var fz = y - thick * 0.85;
    var fg = ctx.createLinearGradient(x, fz, x, fz + w);
    fg.addColorStop(0, '#FFFEFB');
    fg.addColorStop(0.65, '#FFFDF9');
    fg.addColorStop(1, '#F1E8DA');
    roundRect(ctx, x, fz, w, w, cell * 0.14);
    ctx.fillStyle = fg;
    ctx.fill();
    /* 3. 花色描边 + 内侧高光 */
    ctx.strokeStyle = suit.fill;
    ctx.lineWidth = Math.max(1.5, dprSafe(1.8));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, dprSafe(1));
    roundRect(ctx, x + dprSafe(1.5), fz + dprSafe(1.5), w - dprSafe(3), w - dprSafe(3), cell * 0.12);
    ctx.stroke();
    /* 4. 花色水果图形（中心偏上） */
    drawFruit(ctx, suit.shape, x + w / 2, fz + w * 0.42, cell * 0.29 * scale);
    /* 5. 胶囊方向箭头徽章（牌面中心偏 d 侧） */
    drawArrowBadge(ctx, t.d, x + w / 2, fz + w / 2, cell, suit, scale);
    /* 6. Δ7 多层堆叠左上角层角标（下层可见性预告） */
    if (depth > 1) drawStackBadge(ctx, depth, x, fz, cell, scale);
    ctx.globalAlpha = 1;
  }

  /* 胶囊箭头徽章：花色深色胶囊底 + 白色人字箭头（指 d） */
  function drawArrowBadge(ctx, d, cx, cy, cell, suit, scale) {
    var v = RE.DIR_VEC[d];
    var r = cell * 0.15 * (scale || 1);
    var bx = cx + v.dc * cell * 0.27;
    var by = cy + v.dr * cell * 0.27;
    ctx.beginPath();
    ctx.arc(bx - v.dc * r * 0.5, by - v.dr * r * 0.5, r, 0, Math.PI * 2);
    ctx.arc(bx + v.dc * r * 0.5, by + v.dr * r * 0.5, r, 0, Math.PI * 2);
    ctx.fillStyle = suit.deep;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, dprSafe(1));
    ctx.stroke();
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(d * Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(r * 0.5, r * 0.3);
    ctx.lineTo(0, r * 0.02);
    ctx.lineTo(-r * 0.5, r * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }

  /* Δ7 左上角堆叠角标：每层一点（白=顶层） */
  function drawStackBadge(ctx, depth, x, y, cell, scale) {
    for (var i = 0; i < depth; i++) {
      ctx.beginPath();
      ctx.arc(x + cell * 0.1, y + cell * 0.1 + i * cell * 0.11, cell * 0.042 * (scale || 1), 0, Math.PI * 2);
      ctx.fillStyle = i === depth - 1 ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, dprSafe(0.8));
      ctx.fill();
      ctx.stroke();
    }
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
        draw();
        dirty = false;
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

    /* 三消粒子：花色色 12~20 个（单帧 ≤200） */
    function spawnParticles(a, now) {
      var suit = SUITS[a.suit] || SUITS[0];
      var count = 12 + Math.floor(Math.random() * 9);
      if (particles.length + count > 200) count = Math.max(0, 200 - particles.length);
      for (var i = 0; i < count; i++) {
        particles.push({
          x: a.x, y: a.y,
          vx: (Math.random() - 0.5) * 5 * dpr,
          vy: (Math.random() - 0.9) * 5 * dpr,
          life: PARTICLE_LIFE * (0.6 + Math.random() * 0.6),
          color: suit.fill,
          size: (2 + Math.random() * 3) * dpr
        });
      }
    }

    /* ---------- 主绘制 ---------- */
    function draw() {
      ctx.clearRect(0, 0, boardPx, boardPx);
      if (!lastProbe) return;
      var now = nowMs();
      var n = lastProbe.n;

      /* 背景板 */
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, boardPx, boardPx);

      /* 点阵格线（避免与牌块横竖线冲突） */
      ctx.fillStyle = GRID_LINE;
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

      /* 棋盘滑块：z 升序（底层先画，顶层覆盖）；跳过动画中滑块 */
      var animSet = {};
      var i;
      for (i = 0; i < anims.length; i++) animSet[anims[i].tileId] = true;
      var tiles = lastProbe.tiles;
      var boardTiles = [];
      for (i = 0; i < tiles.length; i++) {
        if (!tiles[i].inStaging) boardTiles.push(tiles[i]);
      }
      boardTiles.sort(function (p, q) {
        if (p.z !== q.z) return p.z - q.z;
        if (p.r !== q.r) return p.r - q.r;
        return p.c - q.c;
      });
      for (i = 0; i < boardTiles.length; i++) {
        var t = boardTiles[i];
        if (animSet[t.id]) continue;
        drawBoardTile(t, now);
      }

      /* 动画层（飞出/弹回/爆闪） */
      for (i = 0; i < anims.length; i++) {
        var a = anims[i];
        if (a.kind === 'reveal') continue;
        drawAnim(a, Math.min(1, (now - a.t0) / a.dur));
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

    /* 棋盘滑块：堆叠错层 + Δ7 reveal 上浮 */
    function drawBoardTile(t, now) {
      var px = (t.c + 0.5) * cell;
      var py = (t.r + 0.5) * cell;
      var stackN = t.stackDepth || 1;
      var layerOff = -cell * 0.07 * Math.max(0, stackN - 1 - (t.z || 0));
      var lift = 0;
      var rv = revealAt[t.id];
      if (rv != null && now >= rv) {
        var el = Math.min(1, (now - rv) / REVEAL_MS);
        var ease = 1 - Math.pow(1 - el, 3);
        lift = (1 - ease) * cell * 0.45;
      }
      drawTileBody(ctx, cell, px + layerOff, py + lift, t, 1, 1, layerOff);
    }

    /* ---------- 动画绘制 ---------- */
    function drawAnim(a, prog) {
      var t = tileById(a.tileId);
      if (!t) return;
      if (a.kind === 'fly') {
        var seg = pathPos(a.path, prog);
        drawTileBody(ctx, cell, (seg.c + 0.5) * cell, (seg.r + 0.5) * cell,
          t, 1 - 0.35 * prog, 1 - 0.85 * prog, 0);
      } else if (a.kind === 'block') {
        var p = prog < 0.55 ? (prog / 0.55) : (1 - (prog - 0.55) / 0.45);
        var dir = RE.DIR_VEC[t.d];
        drawTileBody(ctx, cell,
          (t.c + dir.dc * 0.38 * p + 0.5) * cell,
          (t.r + dir.dr * 0.38 * p + 0.5) * cell, t, 1, 1, 0);
      } else if (a.kind === 'match') {
        drawTileBody(ctx, cell, a.x, a.y, t, 1 + 0.6 * prog, 1 - prog, 0);
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
      }
      refresh();
    }

    /* ---------- 数据刷新（脏检查入口） ---------- */
    function refresh() {
      if (session) lastProbe = RE.renderProbe(session.engineState());
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
        if (t.inStaging || t.r !== r || t.c !== c) continue;
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

    return {
      refresh: refresh,
      handleEvent: handleEvent,
      hitTest: hitTest,
      setHighlight: setHighlight,
      SUITS: SUITS
    };
  }

  /* DOM chip SVG（Dock/Staging——水果花色简化图形） */
  function chipSVG(s) {
    var suit = SUITS[s] || SUITS[0];
    var shape = {
      'strawberry': '<path d="M12 4 C17 3 20 7 19 12 C18 17 14 20 12 21 C10 20 6 17 5 12 C4 7 7 3 12 4 Z"/>',
      'orange': '<circle cx="12" cy="13" r="8"/><path d="M12 5 Q16 2 18 5 Q15 6 12 5 Z" fill="#3E9B4F"/>',
      'pineapple': '<ellipse cx="12" cy="14" rx="6.5" ry="8"/><path d="M9 6 L11 2 L12 6 L14 1 L15 6 L18 4 L16 7 Z" fill="#3E9B4F"/>',
      'kiwi': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="#F2F7DC"/>',
      'blueberry': '<circle cx="12" cy="13" r="8"/><path d="M12 5 L13.5 7 L12 9 L10.5 7 Z" fill="#1D2E80"/>',
      'grape': '<circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="12" cy="13" r="4"/><circle cx="9" cy="17" r="4" fill="#7135A8"/><circle cx="15" cy="17" r="4"/>',
      'peach': '<path d="M12 21 C4 17 5 8 12 7 C19 8 20 17 12 21 Z"/>',
      'jade': '<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="7.5" y="7" width="9" height="3" rx="1" fill="#F0FBF4"/><rect x="7.5" y="11" width="9" height="3" rx="1" fill="#F0FBF4"/><rect x="7.5" y="15" width="9" height="3" rx="1" fill="#F0FBF4"/>'
    }[suit.shape];
    return '<svg viewBox="0 0 24 24" fill="' + suit.fill + '" stroke="rgba(0,0,0,0.35)" stroke-width="0.8">' + shape + '</svg>';
  }

  STM.createBoardRenderer = createBoardRenderer;
  STM.SUITS = SUITS;
  STM.chipSVG = chipSVG;


})(typeof window !== 'undefined' ? window : globalThis);
