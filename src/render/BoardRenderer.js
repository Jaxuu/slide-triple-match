/* =========================================================
 * Slide & Triple — BoardRenderer（Canvas 2D 渲染）
 * classic script；向 window.STM 挂载（D-01）
 * rAF 脏检查主循环（60fps 目标）；花色颜色+图形双编码（无障碍）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};
  var RE = STM.RulesEngine;

  /* ---------- 花色表（game-session.md §4 固定契约——颜色+图形双编码） ---------- */
  var SUITS = [
    { name: '赤三角', fill: '#E5484D', shape: 'triangle' },
    { name: '橙菱',   fill: '#F76B15', shape: 'diamond' },
    { name: '金五角', fill: '#FFC53D', shape: 'star5' },
    { name: '草绿方', fill: '#46A758', shape: 'square' },
    { name: '青圆',   fill: '#00B8D9', shape: 'circle' },
    { name: '天蓝下三角', fill: '#3E63DD', shape: 'triangle-down' },
    { name: '紫六边', fill: '#8E4EC6', shape: 'hexagon' },
    { name: '品红十字', fill: '#D6409F', shape: 'cross' }
  ];
  var BG = '#1B2430';
  var GRID_LINE = '#2A3644';
  /* 每色明度差 ≥ 2:1 于底色（契约要求）；白箭头 */
  var ARROW = '#FFFFFF';

  /* ---------- 动效参数 ---------- */
  var FLY_MS = 420;        /* 飞出动画 */
  var BLOCK_MS = 360;      /* 受阻弹回 */
  var PARTICLE_LIFE = 600; /* 三消粒子 */

  /* ---------- 图形绘制器（Canvas path，程序化——宪章 III） ---------- */
  function drawShape(ctx, shape, x, y, R) {
    ctx.beginPath();
    var i;
    if (shape === 'triangle') {
      ctx.moveTo(x, y - R);
      ctx.lineTo(x + R * 0.87, y + R * 0.5);
      ctx.lineTo(x - R * 0.87, y + R * 0.5);
      ctx.closePath();
    } else if (shape === 'triangle-down') {
      ctx.moveTo(x, y + R);
      ctx.lineTo(x + R * 0.87, y - R * 0.5);
      ctx.lineTo(x - R * 0.87, y - R * 0.5);
      ctx.closePath();
    } else if (shape === 'diamond') {
      ctx.moveTo(x, y - R);
      ctx.lineTo(x + R * 0.85, y);
      ctx.lineTo(x, y + R);
      ctx.lineTo(x - R * 0.85, y);
      ctx.closePath();
    } else if (shape === 'square') {
      var r = R * 0.8;
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else if (shape === 'circle') {
      ctx.arc(x, y, R * 0.85, 0, Math.PI * 2);
    } else if (shape === 'star5') {
      for (i = 0; i < 10; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / 5;
        var rad = (i % 2 === 0) ? R : R * 0.42;
        var px = x + Math.cos(ang) * rad;
        var py = y + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (shape === 'hexagon') {
      for (i = 0; i < 6; i++) {
        var a6 = -Math.PI / 2 + i * Math.PI / 3;
        var px6 = x + Math.cos(a6) * R * 0.92;
        var py6 = y + Math.sin(a6) * R * 0.92;
        if (i === 0) ctx.moveTo(px6, py6); else ctx.lineTo(px6, py6);
      }
      ctx.closePath();
    } else if (shape === 'cross') {
      var w1 = R * 0.34, l1 = R * 0.95;
      ctx.moveTo(x - w1, y - l1);
      ctx.lineTo(x + w1, y - l1);
      ctx.lineTo(x + w1, y - w1);
      ctx.lineTo(x + l1, y - w1);
      ctx.lineTo(x + l1, y + w1);
      ctx.lineTo(x + w1, y + w1);
      ctx.lineTo(x + w1, y + l1);
      ctx.lineTo(x - w1, y + l1);
      ctx.lineTo(x - w1, y + w1);
      ctx.lineTo(x - l1, y + w1);
      ctx.lineTo(x - l1, y - w1);
      ctx.lineTo(x - w1, y - w1);
      ctx.closePath();
    }
  }

  /* 方向箭头（白色三角，指 d 方向） */
  function drawArrow(ctx, d, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(d * Math.PI / 2); /* 0=U → 旋转 d×90°（顺时针序与 (d+1)%4 一致） */
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.8, size * 0.55);
    ctx.lineTo(-size * 0.8, size * 0.55);
    ctx.closePath();
    ctx.fillStyle = ARROW;
    ctx.fill();
    ctx.restore();
  }

  /* ---------- Renderer 工厂 ---------- */
  function createBoardRenderer(canvas, session, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var dpr = Math.max(1, global.devicePixelRatio || 1);
    var cell = 0;            /* CSS px 单格宽 */
    var boardPx = 0;
    var dirty = true;
    var running = false;
    var rafId = 0;

    /* 动画队列（事件驱动入队，rAF 消费） */
    var anims = [];          /* {kind:'fly'|'block'|'match', tileId, path, t0, dur, suit} */
    var particles = [];      /* 粒子 {x,y,vx,vy,life,color,size} */
    var highlight = -1;      /* Hint 高亮 tileId（M4） */
    var lastProbe = null;

    /* 尺寸自适应：clientWidth × devicePixelRatio（8×8 时格宽 ≥40 CSS px 由布局保证） */
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

    /* 动画推进；返回是否还有活跃动效 */
    function tick(now) {
      var active = false;
      var i;
      for (i = anims.length - 1; i >= 0; i--) {
        var a = anims[i];
        var t = (now - a.t0) / a.dur;
        if (t >= 1) {
          if (a.kind === 'match') spawnParticles(a, now);
          anims.splice(i, 1);
        } else active = true;
      }
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.12 * dpr; /* 重力 */
        p.life -= 16;
        if (p.life <= 0) particles.splice(i, 1);
      }
      if (particles.length > 0) active = true;
      return active;
    }

    /* 三消粒子：花色色粒子 12~20 个（单帧 ≤200 全局约束） */
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

      /* 背景板 */
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, boardPx, boardPx);

      /* 格线 */
      var n = lastProbe.n;
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      var g;
      for (g = 0; g <= n; g++) {
        var pos = Math.round(g * cell) + 0.5;
        ctx.moveTo(pos, 0); ctx.lineTo(pos, boardPx);
        ctx.moveTo(0, pos); ctx.lineTo(boardPx, pos);
      }
      ctx.stroke();

      /* 棱镜（M1 关卡无——绘制逻辑就绪，M2 T034 完整视觉） */
      drawPrisms(lastProbe.prisms);

      /* 滑块（跳过动画中的——动画层最后画） */
      var animSet = {};
      var i, a;
      for (i = 0; i < anims.length; i++) animSet[anims[i].tileId] = true;

      var tiles = lastProbe.tiles;
      for (i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        if (animSet[t.id]) continue;
        drawTile(t, 1, 1, 1);
      }

      /* 动画层 */
      var now = global.performance ? global.performance.now() : Date.now();
      for (i = 0; i < anims.length; i++) {
        a = anims[i];
        var prog = Math.min(1, (now - a.t0) / a.dur);
        drawAnim(a, prog);
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
        var ht = null;
        for (i = 0; i < tiles.length; i++) if (tiles[i].id === highlight) ht = tiles[i];
        if (ht) {
          var pulse = 0.5 + 0.5 * Math.sin(now / 180);
          ctx.strokeStyle = 'rgba(255,197,61,' + (0.4 + 0.6 * pulse) + ')';
          ctx.lineWidth = 3 * dpr;
          ctx.strokeRect(ht.c * cell + 3, ht.r * cell + 3, cell - 6, cell - 6);
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
        /* 粗斜杠条（/ 或 \） */
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

    /* t: tile probe；scale/alpha 用于动画变换 */
    function drawTile(t, cx, cy, alpha, scale) {
      var suit = SUITS[t.s] || SUITS[0];
      var x = (t.c + 0.5) * cell * (cx || 1);
      var y = (t.r + 0.5) * cell * (cy || 1);
      var R = cell * 0.36 * (scale || 1);

      ctx.globalAlpha = alpha == null ? 1 : alpha;
      /* 滑块底：花色填充圆角方块 */
      var pad = cell * 0.09;
      roundRect(ctx, t.c * cell + pad, t.r * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.14);
      ctx.fillStyle = suit.fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.stroke();

      /* 花色图形（中心） */
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      drawShape(ctx, suit.shape, x, y, R * 0.78);
      ctx.fill();

      /* 机制角标（M1 关卡无；M2 T034 扩展） */
      if (t.ice > 0) drawIceBadge(t, x, y);
      if (t.locked) drawChainBadge(t, x, y);
      if (t.m === 'g') drawGearBadge(t, x, y);
      if (t.m === 'k') drawKeyBadge(t, x, y);

      /* 方向箭头（右下角小白三角——不与中心图形冲突） */
      var ax = x + cell * 0.26, ay = y + cell * 0.26;
      drawArrow(ctx, t.d, ax, ay, cell * 0.11);

      ctx.globalAlpha = 1;
    }

    function drawIceBadge(t, x, y) {
      /* 半透明冰蓝覆盖 + 厚度数字（FR-017） */
      ctx.fillStyle = 'rgba(143,211,244,0.30)';
      roundRect(ctx, t.c * cell + cell * 0.09, t.r * cell + cell * 0.09, cell * 0.82, cell * 0.82, cell * 0.14);
      ctx.fill();
      ctx.fillStyle = '#EAF7FF';
      ctx.font = 'bold ' + Math.round(cell * 0.22) + 'px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(t.ice), t.c * cell + cell * 0.12, t.r * cell + cell * 0.08);
    }

    function drawChainBadge(t, x, y) {
      /* 四角链条角标（简化: 两个环） */
      ctx.strokeStyle = '#B8C4D0';
      ctx.lineWidth = Math.max(1.5, dpr);
      var bx = t.c * cell, by = t.r * cell;
      ctx.beginPath();
      ctx.arc(bx + cell * 0.16, by + cell * 0.16, cell * 0.07, 0, Math.PI * 2);
      ctx.moveTo(bx + cell * 0.26, by + cell * 0.16);
      ctx.arc(bx + cell * 0.22, by + cell * 0.16, cell * 0.07, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawGearBadge(t, x, y) {
      /* 右上角小齿轮（8 齿简化） */
      var gx = t.c * cell + cell * 0.82;
      var gy = t.r * cell + cell * 0.18;
      ctx.strokeStyle = '#2A3644';
      ctx.fillStyle = '#E8EEF6';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.arc(gx, gy, cell * 0.08, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      for (var k = 0; k < 8; k++) {
        var a = k * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(gx + Math.cos(a) * cell * 0.08, gy + Math.sin(a) * cell * 0.08);
        ctx.lineTo(gx + Math.cos(a) * cell * 0.13, gy + Math.sin(a) * cell * 0.13);
        ctx.stroke();
      }
    }

    function drawKeyBadge(t, x, y) {
      /* 左上角钥匙角标（圆+齿） */
      var kx = t.c * cell + cell * 0.18;
      var ky = t.r * cell + cell * 0.18;
      ctx.strokeStyle = '#FFC53D';
      ctx.lineWidth = Math.max(1.5, dpr);
      ctx.beginPath();
      ctx.arc(kx, ky, cell * 0.06, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(kx + cell * 0.06, ky);
      ctx.lineTo(kx + cell * 0.15, ky);
      ctx.moveTo(kx + cell * 0.11, ky);
      ctx.lineTo(kx + cell * 0.11, ky + cell * 0.04);
      ctx.stroke();
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    /* ---------- 动画绘制 ---------- */
    function drawAnim(a, prog) {
      var t = tileById(a.tileId);
      if (!t) return;
      if (a.kind === 'fly') {
        /* 沿 path 位移 + 缩放淡出 */
        var seg = pathPos(a.path, prog);
        var fake = { c: seg.c + 0.5 - 0.5, r: seg.r + 0.5 - 0.5, s: t.s, d: t.d, id: t.id };
        /* 直接以格中心坐标绘制 */
        var suit = SUITS[t.s] || SUITS[0];
        var x = (seg.c + 0.5) * cell;
        var y = (seg.r + 0.5) * cell;
        var scale = 1 - 0.35 * prog;
        var alpha = 1 - 0.85 * prog;
        drawTileAt(x, y, t, scale, alpha);
      } else if (a.kind === 'block') {
        /* 前冲-回弹（prog 0→1: 先冲 60% 再回 40%） */
        var p = prog < 0.55 ? (prog / 0.55) : (1 - (prog - 0.55) / 0.45);
        var dir = RE.DIR_VEC[t.d];
        var cx = t.c + dir.dc * 0.38 * p;
        var cy = t.r + dir.dr * 0.38 * p;
        drawTileAt((cx + 0.5) * cell, (cy + 0.5) * cell, t, 1, 1);
      } else if (a.kind === 'match') {
        /* 三消聚合爆闪（在 dock 区域由 DOM 侧处理；Canvas 侧粒子） */
        drawTileAt(a.x, a.y, t, 1 + 0.6 * prog, 1 - prog);
      }
    }

    function drawTileAt(px, py, t, scale, alpha) {
      var suit = SUITS[t.s] || SUITS[0];
      var R = cell * 0.36 * scale;
      ctx.globalAlpha = alpha;
      roundRect(ctx, px - cell / 2 + cell * 0.09, py - cell / 2 + cell * 0.09, cell * 0.82, cell * 0.82, cell * 0.14);
      ctx.fillStyle = suit.fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      drawShape(ctx, suit.shape, px, py, R * 0.78);
      ctx.fill();
      drawArrow(ctx, t.d, px + cell * 0.26, py + cell * 0.26, cell * 0.11);
      ctx.globalAlpha = 1;
    }

    /* 路径插值: prog ∈ [0,1] → path 上的连续格坐标 */
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
      var now = global.performance ? global.performance.now() : Date.now();
      if (e.e === 'flyout' && e.path && e.path.length) {
        anims.push({ kind: 'fly', tileId: e.tileId, path: e.path, t0: now, dur: FLY_MS });
      } else if (e.e === 'blocked') {
        anims.push({ kind: 'block', tileId: e.tileId, t0: now, dur: BLOCK_MS });
        if (opts.onShake) opts.onShake(); /* 棋盘 CSS shake 由外层 DOM 处理 */
      } else if (e.e === 'match') {
        /* dock 位置由 DOM 渲染；Canvas 侧记录爆闪中心（近似取 dock chip 位置换算） */
        anims.push({ kind: 'match', tileId: e.ids[0], suit: e.suit, t0: now, dur: 300, x: boardPx / 2, y: -cell });
      }
      refresh();
    }

    /* ---------- 数据刷新（脏检查入口） ---------- */
    function refresh() {
      if (session) {
        lastProbe = RE.renderProbe(session.engineState());
      }
      resize();
      markDirty();
    }

    /* 点击命中检测（main.js 绑定 pointerdown → 坐标→tileId） */
    function hitTest(clientX, clientY) {
      if (!lastProbe) return -1;
      var rect = canvas.getBoundingClientRect();
      var x = (clientX - rect.left) / rect.width * lastProbe.n;
      var y = (clientY - rect.top) / rect.height * lastProbe.n;
      var c = Math.floor(x), r = Math.floor(y);
      if (r < 0 || r >= lastProbe.n || c < 0 || c >= lastProbe.n) return -1;
      for (var i = 0; i < lastProbe.tiles.length; i++) {
        var t = lastProbe.tiles[i];
        if (!t.inStaging && t.r === r && t.c === c) return t.id;
      }
      return -1;
    }

    function setHighlight(tileId) {
      highlight = tileId == null ? -1 : tileId;
      markDirty();
    }

    /* 观察者：session 每次 emit 后 refresh（简化轮询脏检查） */
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

  /* DOM chip SVG（Dock/Staging 用——同花色表双编码） */
  function chipSVG(s) {
    var suit = SUITS[s] || SUITS[0];
    var shape = {
      'triangle': '<path d="M12 2 L22 20 L2 20 Z"/>',
      'triangle-down': '<path d="M12 22 L2 4 L22 4 Z"/>',
      'diamond': '<path d="M12 2 L21 12 L12 22 L3 12 Z"/>',
      'square': '<rect x="3" y="3" width="18" height="18" rx="2"/>',
      'circle': '<circle cx="12" cy="12" r="10"/>',
      'star5': '<path d="M12 2 L14.6 8.6 L21.5 9.2 L16.2 13.8 L18 20.6 L12 17 L6 20.6 L7.8 13.8 L2.5 9.2 L9.4 8.6 Z"/>',
      'hexagon': '<path d="M12 2 L20.6 7 L20.6 17 L12 22 L3.4 17 L3.4 7 Z"/>',
      'cross': '<path d="M9 2 L15 2 L15 9 L22 9 L22 15 L15 15 L15 22 L9 22 L9 15 L2 15 L2 9 L9 9 Z"/>'
    }[suit.shape];
    return '<svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.25)" stroke-width="0.8">' +
      '<rect x="0" y="0" width="24" height="24" rx="4" fill="' + suit.fill + '"/>' + shape + '</svg>';
  }

  STM.createBoardRenderer = createBoardRenderer;
  STM.SUITS = SUITS;
  STM.chipSVG = chipSVG;
})(typeof window !== 'undefined' ? window : globalThis);
