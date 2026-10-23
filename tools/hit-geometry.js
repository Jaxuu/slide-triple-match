/* =========================================================
 * Slide & Triple — hit-geometry（ingame-hud-render-defects / Bug 1 回归防线）
 *
 * node tools/hit-geometry.js
 *
 * 背景: T081 起绘制用位图像素（boardPx / n），hitTest 又按
 *   (boardPx/dpr)/rect.width 归一 → 两套换算 → 点击中心命中相邻牌、
 *   点右下角飞出上面小鸡（Bug 1）。修复后绘制/命中/tileRect 共用
 *   getTileCssRect 单一几何出口。
 *
 * 本工具对 **全部真实关卡 × 每一张未被压滑块** 做穷举断言：
 *   ① 取绘制中心点 CSS 坐标 → 映射为客户端坐标 → hitTest 必须返回该牌自身 id
 *   ② 牌内 3×3 采样点 → 返回的牌矩形必须包含该点（杜绝越界命中）
 *   ③ 牌边内缩 0.5px → 同上（杜绝缝隙吞点击）
 *   ④ 画布外 → -1
 *   ⑤ 被压牌中心 → 绝不返回该牌 id
 * 并覆盖 dpr ∈ {2, 3} × CSS 盒宽 {1.00, 0.95, 1.05} × 盒偏移 {0,0 / 24,17}，
 * 以及「同层 gap = 1px」「z ≤ 4」两条几何不变量。
 * 零依赖（宪章 II）：Node + 浏览器契约级 2D 桩。
 * ========================================================= */
'use strict';

/* ---- 按经典脚本装载序加载（D-01 全局 STM 命名空间） ---- */
var RE = require('../src/core/RulesEngine.js');
globalThis.STM = globalThis.STM || {};
globalThis.STM.RulesEngine = RE; /* BoardRenderer/GameState 装载时读 STM.RulesEngine */
require('../src/core/GameState.js');
require('../src/core/profile.js');
require('../src/render/bestiary.js');
require('../src/render/backdrops.js');
require('../src/render/BoardRenderer.js');
var STM = globalThis.STM;
var LEVELS = require('../src/data/levels.js');

/* ---- 浏览器环境桩 ---- */
var storage = (function () {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }
  };
})();
globalThis.localStorage = storage;
globalThis.performance = { now: function () { return 0; } };
globalThis.addEventListener = function () {};
globalThis.requestAnimationFrame = function () { return 0; }; /* 不泵帧：几何与绘制解耦 */
globalThis.devicePixelRatio = 2;

/* 浏览器契约级 2D 桩：坐标非有限值即抛错（与 Chrome 同款），
 * 并把每次绘制累计成计数，便于确认 refresh 真的走了绘制路径。 */
var drawCalls = 0;
function finite(v, op) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw new TypeError(op + ': The provided double value is non-finite: ' + v);
  }
}
function makeCtx() {
  function d() { drawCalls++; }
  return {
    setTransform: function (a, b, c, d2, e, f) {
      [a, b, c, d2, e, f].forEach(function (v) { finite(v, 'setTransform'); });
    },
    createLinearGradient: function (x0, y0, x1, y1) {
      finite(x0, 'gradient'); finite(y0, 'gradient'); finite(x1, 'gradient'); finite(y1, 'gradient');
      return { addColorStop: function () {} };
    },
    createRadialGradient: function (x0, y0, r0, x1, y1, r1) {
      [x0, y0, r0, x1, y1, r1].forEach(function (v) { finite(v, 'gradient'); });
      return { addColorStop: function () {} };
    },
    createPattern: function () { return { setTransform: function () {} }; },
    moveTo: function (x, y) { finite(x, 'moveTo'); finite(y, 'moveTo'); d(); },
    lineTo: function (x, y) { finite(x, 'lineTo'); finite(y, 'lineTo'); d(); },
    arc: function (x, y, r) { finite(x, 'arc'); finite(y, 'arc'); finite(r, 'arc'); d(); },
    arcTo: function (x1, y1, x2, y2, r) {
      finite(x1, 'arcTo'); finite(y1, 'arcTo'); finite(x2, 'arcTo'); finite(y2, 'arcTo'); finite(r, 'arcTo'); d();
    },
    ellipse: function (x, y, rx, ry) {
      finite(x, 'ellipse'); finite(y, 'ellipse'); finite(rx, 'ellipse'); finite(ry, 'ellipse'); d();
    },
    quadraticCurveTo: function (cx, cy, x, y) {
      finite(cx, 'quad'); finite(cy, 'quad'); finite(x, 'quad'); finite(y, 'quad'); d();
    },
    bezierCurveTo: function (a, b, c, d2, e, f) {
      [a, b, c, d2, e, f].forEach(function (v) { finite(v, 'bezier'); }); d();
    },
    fillRect: function (x, y, w, h) {
      finite(x, 'fillRect'); finite(y, 'fillRect'); finite(w, 'fillRect'); finite(h, 'fillRect'); d();
    },
    strokeRect: function (x, y, w, h) {
      finite(x, 'strokeRect'); finite(y, 'strokeRect'); finite(w, 'strokeRect'); finite(h, 'strokeRect'); d();
    },
    fillText: function (s, x, y) { finite(x, 'fillText'); finite(y, 'fillText'); d(); },
    clearRect: function () {}, beginPath: function () {}, closePath: function () {},
    fill: function () {}, stroke: function () {}, save: function () {}, restore: function () {},
    translate: function () {}, rotate: function () {}, scale: function () {},
    drawImage: function () { d(); }, putImageData: function () {},
    getImageData: function () { return { data: new Uint8ClampedArray(4) }; },
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
  };
}

/* 画布桩：CSS 盒（getBoundingClientRect）可随时改动，模拟不同视口/缩放。 */
function makeCanvas(box) {
  return {
    clientWidth: 320,
    clientHeight: 320,
    parentElement: { clientWidth: 320, clientHeight: 320 },
    width: 0, height: 0,
    getContext: function () { return makeCtx(); },
    getBoundingClientRect: function () {
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    }
  };
}

/* ---- 断言器 ---- */
var failures = [];
var counts = { center: 0, inner: 0, edge: 0, outside: 0, covered: 0 };
function fail(msg) {
  if (failures.length < 25) failures.push(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) fail(msg + ' | 期望 ' + expected + ' 实得 ' + actual);
}

/* ---- 单关穷举 ---- */
var LEVELS_HIT = 0;
var TILES_HIT = 0;

function auditLevel(level, dpr, variant) {
  var box = { left: 0, top: 0, width: 320, height: 320 };
  var canvas = makeCanvas(box);
  var session = STM.GameState.createSession(level, { onEvent: function () {} });
  var renderer = STM.createBoardRenderer(canvas, session, {});
  renderer.refresh();

  var lay = renderer.layoutOf();
  var probe = RE.renderProbe(session.engineState());
  var tag = '[dpr ' + dpr + ' / 盒 ' + variant.label + ' / ' + (level.id != null ? level.id : '?') + ']';

  if (!lay || !lay.cellStep || !lay.n) { fail(tag + ' 布局缺失'); return; }
  eq(lay.n, probe.n, tag + ' layout.n 与 renderProbe.n 不一致');
  /* 几何不变量：同层 1px 细缝 / 最多 5 层 */
  if (Math.abs(lay.tileSize - (lay.cellStep - 1)) > 1e-9) {
    fail(tag + ' 同层 gap ≠ 1px（cellStep=' + lay.cellStep + ' tileSize=' + lay.tileSize + '）');
  }
  for (var qi = 0; qi < probe.tiles.length; qi++) {
    var qz = probe.tiles[qi].z || 0;
    if (qz < 0 || qz > 4) fail(tag + ' tile ' + probe.tiles[qi].id + ' z=' + qz + ' 超出 0..4');
  }

  /* 盒宽/偏移变体：k = CSS 盒宽 / 逻辑边长，客户端坐标 = left + css * k */
  var cssSize = lay.cellStep * lay.n;
  var k = variant.k;
  box.left = variant.left;
  box.top = variant.top;
  box.width = cssSize * k;
  box.height = cssSize * k;

  var byId = Object.create(null);
  var i;
  for (i = 0; i < probe.tiles.length; i++) byId[probe.tiles[i].id] = probe.tiles[i];

  function toClient(px, py) {
    return { x: box.left + px * k, y: box.top + py * k };
  }
  function rectOf(t) { return STM.rendererTest.getTileCssRect(t, lay); }
  function contains(rect, px, py) {
    return px >= rect.x - 1e-9 && px <= rect.x + rect.w + 1e-9 &&
           py >= rect.y - 1e-9 && py <= rect.y + rect.h + 1e-9;
  }

  for (i = 0; i < probe.tiles.length; i++) {
    var t = probe.tiles[i];
    var r = rectOf(t);
    var cx = r.x + r.w / 2;
    var cy = r.y + r.h / 2;

    if (!t.covered) {
      /* ① 中心点必须 100% 命中自身 */
      var p = toClient(cx, cy);
      var hit = renderer.hitTest(p.x, p.y);
      counts.center++;
      eq(hit, t.id, tag + ' 中心 miss: tile ' + t.id + ' @(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ') → ' + hit);

      /* ② 牌内 3×3 采样：返回牌必须包含该点（且不得是被压牌） */
      for (var u = 1; u <= 3; u++) {
        for (var v = 1; v <= 3; v++) {
          var sx = r.x + r.w * (u / 4);
          var sy = r.y + r.h * (v / 4);
          var pp = toClient(sx, sy);
          var h2 = renderer.hitTest(pp.x, pp.y);
          counts.inner++;
          if (h2 === -1) {
            fail(tag + ' 牌内空白: tile ' + t.id + ' 采样(' + u + '/4,' + v + '/4) → -1');
            continue;
          }
          var ht = byId[h2];
          if (!ht) { fail(tag + ' 命中未知 id ' + h2); continue; }
          if (ht.covered) fail(tag + ' 命中被压牌 ' + h2);
          if (!contains(rectOf(ht), sx, sy)) {
            fail(tag + ' 越界命中: 点(' + sx.toFixed(2) + ',' + sy.toFixed(2) +
                 ') 落在 ' + h2 + ' 矩形外');
          }
        }
      }

      /* ③ 牌边内缩 0.5px —— 缝隙不得吞掉点击 */
      var eg = 0.5;
      var edges = [
        [r.x + eg, r.y + eg], [r.x + r.w / 2, r.y + eg], [r.x + r.w - eg, r.y + eg],
        [r.x + eg, r.y + r.h / 2], [r.x + r.w - eg, r.y + r.h / 2],
        [r.x + eg, r.y + r.h - eg], [r.x + r.w / 2, r.y + r.h - eg], [r.x + r.w - eg, r.y + r.h - eg]
      ];
      for (var ei = 0; ei < edges.length; ei++) {
        var ep = toClient(edges[ei][0], edges[ei][1]);
        var h3 = renderer.hitTest(ep.x, ep.y);
        counts.edge++;
        if (h3 === -1) {
          fail(tag + ' 边缘空白: tile ' + t.id + ' 边采样 ' + ei + ' → -1');
        } else if (byId[h3] && !contains(rectOf(byId[h3]), edges[ei][0], edges[ei][1])) {
          fail(tag + ' 边缘越界命中: tile ' + t.id + ' → ' + h3);
        }
      }
    } else {
      /* ⑤ 被压牌：中心可命中覆盖它的牌，但绝不能返回它自己 */
      var pc = toClient(cx, cy);
      var hc = renderer.hitTest(pc.x, pc.y);
      counts.covered++;
      if (hc === t.id) fail(tag + ' 被压牌可点: ' + t.id);
    }
  }

  /* ④ 画布外 → -1 */
  var outs = [
    [-8, -8], [cssSize + 8, -8], [-8, cssSize + 8], [cssSize + 8, cssSize + 8],
    [cssSize / 2, -8], [cssSize / 2, cssSize + 8]
  ];
  for (var oi = 0; oi < outs.length; oi++) {
    var op = toClient(outs[oi][0], outs[oi][1]);
    counts.outside++;
    var ho = renderer.hitTest(op.x, op.y);
    if (ho !== -1) fail(tag + ' 画布外命中: (' + outs[oi][0] + ',' + outs[oi][1] + ') → ' + ho);
  }

  LEVELS_HIT++;
  TILES_HIT += probe.tiles.length;
}

/* ---- 主流程：dpr × CSS 盒变体 × 全关卡 ---- */
var VARIANTS = [
  { label: '1.00', k: 1.00, left: 0, top: 0 },
  { label: '0.95', k: 0.95, left: 24, top: 17 },
  { label: '1.05', k: 1.05, left: 0, top: 0 },
];

[2, 3].forEach(function (dpr) {
  globalThis.devicePixelRatio = dpr;
  VARIANTS.forEach(function (variant) {
    for (var li = 0; li < LEVELS.length; li++) {
      var level = LEVELS[li];
      if (!level || !level.tiles) continue;
      try {
        auditLevel(level, dpr, variant);
      } catch (err) {
        fail('[dpr ' + dpr + ' / 盒 ' + variant.label + ' / ' + (level.id != null ? level.id : li) + '] 抛错: ' +
             (err && err.stack ? err.stack.split('\n')[0] : err));
      }
    }
  });
});

var total = counts.center + counts.inner + counts.edge + counts.outside + counts.covered;
console.log('hit-geometry: dpr 2/3 × CSS 盒 1.00/0.95/1.05 × 全关卡');
console.log('  关卡实例 ' + LEVELS_HIT + ' · 牌实例 ' + TILES_HIT + ' · 断言 ' + total);
console.log('  中心命中 ' + counts.center + ' · 牌内 ' + counts.inner + ' · 边缘 ' + counts.edge +
            ' · 画布外 ' + counts.outside + ' · 被压牌 ' + counts.covered);

if (failures.length) {
  console.log('  ✗ FAIL');
  failures.forEach(function (f) { console.log('    - ' + f); });
  process.exit(1);
}
if (!counts.center) {
  console.log('  ✗ FAIL: 没有任何中心命中断言被执行');
  process.exit(1);
}
console.log('  ✓ ALL GREEN — 每一张可点击牌的中心点都精确返回自身 id');
