/* =========================================================
 * Slide & Triple — delta27-verify（Δ30 真机验收）
 *
 *   node tools/delta27-verify.js
 *
 * 为什么必须开浏览器：Node 侧门禁只能断言「数据与纯函数」，本脚本验证
 * 真实 DOM/CSS/Canvas 环境下的**用户可见行为**：
 *   ① 开局进场波次结构：N=141 全部覆盖 / 首帧零延迟 / 波内同起同落 /
 *      波间 >= 14ms / 层序锁（同 (r,c) 低层恒先起跑）/ 总时长 360~420ms
 *   ② 飞行期间 #dock 槽位零抖动 + 棋盘静态层绘制序恒按 (z,r,c) 升序
 *   ③ 三消磁吸坍缩：.slot-shattering 恰好落在本轮三消真实所在 3 槽
 *      （MUST NOT 退化成「最左 3 槽」）/ --suck-dx 左右向中心收敛 /
 *      关键帧 220ms 三段 / 双环错峰 32ms + 白·冰晶蓝配色 + 星芒 4~8 枚 /
 *      光环圆心 = 中间槽实时中心 / 零 y 递增绘制物（无掉落碎块）
 *   ④ 碎裂时序：3 张全部落定后才起演（碎裂瞬间零在途飞行）+ 光环起跑
 *      与坍缩段首帧对齐（140ms）
 *   ⑤ 光环像素取证：清空 VFX 层后单独起演 → 画布确有环状亮像素、
 *      220ms + 2 帧后 alpha > 2 像素数 = 0（无残留脏迹）
 *   ⑥ 多规模关卡归一：L1 / L33 / L72 三档盘面 totalMs 均 ∈ [360,420]
 *      且首波 delay === 0
 * 同时把取证帧写到 shots/delta27/（.gitignore 已忽略，不入库）。
 *
 * 零 npm 依赖（Node 内置 http / WebSocket + 本机 Chrome，宪章 II）。
 * ========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, 'shots', 'delta27');
fs.mkdirSync(OUT, { recursive: true });

var CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
var BROWSER = null;
for (var bi = 0; bi < CANDIDATES.length; bi++) {
  try { if (fs.statSync(CANDIDATES[bi]).isFile()) { BROWSER = CANDIDATES[bi]; break; } } catch (e) {}
}
if (!BROWSER) { console.error('delta27-verify: 未找到 Chrome/Edge'); process.exit(2); }

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg'
};

var fails = [];
function check(name, ok, extra) {
  if (ok) console.log('  ✓ ' + name);
  else { fails.push(name); console.log('  ✗ ' + name + (extra == null ? '' : '  [' + extra + ']')); }
}

function startServer() {
  return new Promise(function (resolve, reject) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      var f = path.join(ROOT, p);
      if (f.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
      fs.stat(f, function (err, st) {
        if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', function () { resolve(srv); });
  });
}

function cdp(u) {
  var ws = new WebSocket(u);
  var id = 1, pend = {};
  this.send = function (m, p) {
    return new Promise(function (res, rej) {
      var i = id++; pend[i] = { resolve: res, reject: rej };
      ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
  this.ready = new Promise(function (r) { ws.onopen = function () { r(); }; });
  ws.onmessage = function (e) {
    var g = JSON.parse(e.data);
    if (g.id && pend[g.id]) {
      var p = pend[g.id]; delete pend[g.id];
      if (g.error) p.reject(new Error(g.error.message)); else p.resolve(g.result);
    }
  };
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* 页面侧小工具：注入一次，后续直接调用 */
var HELPERS = `window.__D27 = {
  rnd: function(){ return (window.STM && STM.main && STM.main.renderer) ? STM.main.renderer() : null; },
  sess: function(){ return (window.STM && STM.main && STM.main.session) ? STM.main.session() : null; },
  dockSig: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = [];
    for (var i = 0; i < ns.length; i++) {
      var c = ns[i].className || '';
      out.push(c.indexOf('has-tile') >= 0 ? 'T' : (c.indexOf('empty') >= 0 ? 'E' : '?'));
    }
    return out.join('');
  },
  /* Δ30a: 当前带 .slot-shattering 的槽位序号（坍缩演出在演的槽） */
  shatSlots: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = [];
    for (var i = 0; i < ns.length; i++) {
      if ((ns[i].className || '').indexOf('slot-shattering') >= 0) out.push(i);
    }
    return out;
  },
  /* Δ30a: 各槽 .dock-chip 的 --suck-dx（磁吸位移量，内联 CSS 变量） */
  suckDxOf: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = {};
    for (var i = 0; i < ns.length; i++) {
      var chip = ns[i].querySelector ? ns[i].querySelector('.dock-chip') : null;
      if (!chip) continue;
      var raw = chip.style.getPropertyValue('--suck-dx');
      if (raw) out[i] = parseFloat(raw);
    }
    return out;
  },
  /* Δ30a: 静态槽位几何（必须在未挂动画时取——动画期 rect 会被 transform 污染） */
  slotRects: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = [];
    for (var i = 0; i < ns.length; i++) {
      var r = ns[i].getBoundingClientRect();
      out.push({ i: i, l: Math.round(r.left), r: Math.round(r.right),
                 t: Math.round(r.top), b: Math.round(r.bottom),
                 w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  },
  /* Δ30a: 坍缩光环只读快照（含 kind / 圆心 / 时间锚点 / 配色） */
  ringsOf: function(){
    var r = this.rnd(); if (!r || !r.collapseRingsOf) return [];
    return r.collapseRingsOf();
  },
  /* Δ30a: #vfx-canvas 上 alpha > 2 的像素数（残留判据） */
  vfxPixels: function(){
    var cv = document.getElementById('vfx-canvas');
    if (!cv) return { err: 'no #vfx-canvas' };
    var ctx = cv.getContext('2d');
    var d;
    try { d = ctx.getImageData(0, 0, cv.width, cv.height).data; }
    catch (e) { return { err: 'getImageData: ' + e.message }; }
    var n = 0, sx = 0, sy = 0;
    for (var i = 3; i < d.length; i += 4) {
      if (d[i] > 2) { n++; var q = (i - 3) / 4; sx += q % cv.width; sy += Math.floor(q / cv.width); }
    }
    return { nonZero: n, total: d.length / 4, w: cv.width, h: cv.height,
             cx: n ? sx / n : 0, cy: n ? sy / n : 0 };
  },
  /* Δ30a: 过圆心的**单条水平扫描线**——只读 1 行像素（约 1ms），
   * 返回亮像素数 n 与「到圆心的距离」极值（CSS px）。
   * 用途：在 80ms 的外环生命周期内做多相位采样。全画布 getImageData 在
   * headless 下要 100ms+，用它采样会把演出本身耗完（实测相位 B 恒为 0）。 */
  vfxRow: function(cx, cy){
    var cv = document.getElementById('vfx-canvas');
    if (!cv) return { err: 'no #vfx-canvas' };
    var ctx = cv.getContext('2d');
    var dpr = cv.width / Math.max(1, cv.clientWidth);
    var y = Math.round(cy * dpr);
    if (y < 0 || y >= cv.height) return { err: 'oob y=' + y };
    var d;
    try { d = ctx.getImageData(0, y, cv.width, 1).data; }
    catch (e) { return { err: 'getImageData: ' + e.message }; }
    var n = 0, rMin = 1e9, rMax = -1, cxd = cx * dpr;
    for (var i = 3; i < d.length; i += 4) {
      if (d[i] <= 2) continue;
      n++;
      var rr = Math.abs((i - 3) / 4 - cxd) / dpr;
      if (rr < rMin) rMin = rr;
      if (rr > rMax) rMax = rr;
    }
    return { n: n, rMin: n ? rMin : 0, rMax: n ? rMax : 0, dpr: dpr, y: y };
  },
  /* Δ30a: 以 (cx,cy) 为中心的方形窗口内 alpha > 2 的像素数（残留/细环判据）。
   * 窗口 = ±half CSS px；比全画布扫描快两个数量级。 */
  vfxBox: function(cx, cy, half){
    var cv = document.getElementById('vfx-canvas');
    if (!cv) return { err: 'no #vfx-canvas' };
    var ctx = cv.getContext('2d');
    var dpr = cv.width / Math.max(1, cv.clientWidth);
    var x0 = Math.max(0, Math.round((cx - half) * dpr));
    var y0 = Math.max(0, Math.round((cy - half) * dpr));
    var x1 = Math.min(cv.width, Math.round((cx + half) * dpr));
    var y1 = Math.min(cv.height, Math.round((cy + half) * dpr));
    var w = x1 - x0, h = y1 - y0;
    if (!(w > 0) || !(h > 0)) return { err: 'empty box' };
    var d;
    try { d = ctx.getImageData(x0, y0, w, h).data; }
    catch (e) { return { err: 'getImageData: ' + e.message }; }
    var n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 2) n++;
    return { nonZero: n, area: w * h, w: w, h: h };
  },
  geo: function(){
    var s = this.sess(); if (!s) return null;
    var m = {}; var b = s.state().board;
    for (var i = 0; i < b.length; i++) m[b[i].id] = { r: b[i].r, c: b[i].c, z: b[i].z || 0 };
    return m;
  },
  orderOk: function(g){
    var r = this.rnd(); if (!r) return null;
    var ord = r.drawOrderOf(); var prev = null;
    for (var i = 0; i < ord.length; i++) {
      var g1 = g[ord[i]]; if (!g1) continue;
      var k = g1.z * 10000 + g1.r * 100 + g1.c;
      if (prev !== null && k < prev) return false;
      prev = k;
    }
    return true;
  },
  firstTappable: function(dir){
    var s = this.sess(); if (!s) return null;
    var st = s.state(), eng = s.engineState(), RE = window.STM.RulesEngine;
    for (var i = 0; i < st.board.length; i++) {
      var b = st.board[i];
      if (dir != null && (b.d | 0) !== dir) continue;
      if (RE.canTap(eng, b.id)) return b.id;
    }
    return null;
  },
  /* 找同一花色、3 张当前都可点的卡牌（用来驱动一次真实三消） */
  tappableTriple: function(){
    var s = this.sess(); if (!s) return null;
    var st = s.state(), eng = s.engineState(), RE = window.STM.RulesEngine;
    var bySuit = {};
    for (var i = 0; i < st.board.length; i++) {
      var b = st.board[i];
      if (!RE.canTap(eng, b.id)) continue;
      var k = b.s | 0;
      if (!bySuit[k]) bySuit[k] = [];
      bySuit[k].push(b.id);
    }
    for (var kk in bySuit) {
      if (Object.prototype.hasOwnProperty.call(bySuit, kk) && bySuit[kk].length >= 3) {
        return { suit: +kk, ids: bySuit[kk].slice(0, 3) };
      }
    }
    return null;
  },
  /* Δ30b: 编舞波次结构分析（全部用**实时 dealPlanOf() + 真实棋盘 z/r/c**） */
  dealStructure: function(){
    var r = this.rnd(), s = this.sess();
    if (!r || !s) return { err: 'no renderer/session' };
    var plan = r.dealPlanOf();
    if (!plan) return { err: 'no plan' };
    var board = s.state().board;
    var meta = {};
    var zMax = 0;
    for (var i = 0; i < board.length; i++) {
      var b = board[i];
      meta[b.id] = { r: b.r, c: b.c, z: b.z || 0 };
      if ((b.z || 0) > zMax) zMax = b.z || 0;
    }
    var n = 0, delays = [], byWave = {}, byZ = {}, rcPairs = {};
    var id, m, d;
    for (id in plan) {
      if (!Object.prototype.hasOwnProperty.call(plan, id)) continue;
      m = meta[id];
      if (!m) continue;
      d = plan[id].delay;
      n++; delays.push(d);
      byZ[m.z] = (byZ[m.z] || []).concat([d]);
      rcPairs[m.r + ',' + m.c] = (rcPairs[m.r + ',' + m.c] || []).concat([{ z: m.z, d: d }]);
    }
    var budget = window.STM.rendererTest.introBudgetOf(n, zMax);
    /* wave = round((delay − z × zStep) / waveStep) —— 与 introSchedule 逐字同源 */
    var wStep = budget.waveStep, zStep = budget.zStep;
    for (id in plan) {
      if (!Object.prototype.hasOwnProperty.call(plan, id)) continue;
      m = meta[id];
      if (!m) continue;
      d = plan[id].delay;
      var w = wStep > 0 ? Math.round((d - m.z * zStep) / wStep) : 0;
      if (!byWave[w]) byWave[w] = { z: m.z, delays: [], n: 0, start: d };
      byWave[w].n++;
      byWave[w].delays.push(d);
      if (d < byWave[w].start) byWave[w].start = d;
    }
    var waveIds = [];
    for (var wk in byWave) if (Object.prototype.hasOwnProperty.call(byWave, wk)) waveIds.push(+wk);
    waveIds.sort(function (a, c2) { return a - c2; });
    var waves = [];
    var intraSpreadMax = 0, waveGapMin = Infinity, waveSizeMin = Infinity;
    for (var q = 0; q < waveIds.length; q++) {
      var W = byWave[waveIds[q]];
      var lo = Math.min.apply(null, W.delays), hi = Math.max.apply(null, W.delays);
      if (hi - lo > intraSpreadMax) intraSpreadMax = hi - lo;
      if (W.n < waveSizeMin) waveSizeMin = W.n;
      waves.push({ id: waveIds[q], z: W.z, n: W.n, start: lo, spread: hi - lo });
      if (q > 0) {
        var gap = lo - waves[q - 1].start;
        if (gap < waveGapMin) waveGapMin = gap;
      }
    }
    /* 层序锁：同 (r,c) 低 z 的 delay MUST 严格小于高 z */
    var lockBad = 0, lockMinGap = Infinity, pairCount = 0;
    for (var pk in rcPairs) {
      if (!Object.prototype.hasOwnProperty.call(rcPairs, pk)) continue;
      var arr = rcPairs[pk].slice().sort(function (a, c2) { return a.z - c2.z; });
      for (var t = 1; t < arr.length; t++) {
        pairCount++;
        var g = arr[t].d - arr[t - 1].d;
        if (!(g > 0)) lockBad++;
        if (g < lockMinGap) lockMinGap = g;
      }
    }
    /* 同层内相邻波次的最小间隔（波间 >= 14ms 的真实口径） */
    var zGapMin = Infinity;
    for (var zk in byZ) {
      if (!Object.prototype.hasOwnProperty.call(byZ, zk)) continue;
      var ds = byZ[zk].slice().sort(function (a, c2) { return a - c2; });
      for (var u = 1; u < ds.length; u++) {
        var dd = ds[u] - ds[u - 1];
        if (dd > 1e-6 && dd < zGapMin) zGapMin = dd;
      }
    }
    var minDelay = Math.min.apply(null, delays);
    return {
      n: n, zMax: zMax, waves: waveIds.length, waveStep: wStep, zStep: zStep,
      budgetWaves: budget.waves, budgetTotal: budget.totalMs,
      totalMs: r.dealTotalMs(), maxDelay: Math.max.apply(null, delays),
      minDelay: minDelay, intraSpreadMax: intraSpreadMax,
      waveGapMin: waveGapMin, waveSizeMin: waveSizeMin, zGapMin: zGapMin,
      lockBad: lockBad, lockMinGap: lockMinGap, pairCount: pairCount,
      waveList: waves
    };
  },
  /* Δ30b: 起演 → 等计划就绪 → 快照结构 → 量墙钟落定（全在页面内，零 CDP 往返）
   * 为什么必须页面内：编舞只活 390ms，tickIntro 一收尾就把 introPlan 置 null，
   * Node 侧 60ms 一次轮询会直接读到 null。 */
  dealProbe: async function(){
    var D = this, r = D.rnd();
    if (!r) return { err: 'no renderer' };
    var t0 = performance.now();
    r.startDeal(0);
    var st = null;
    while (performance.now() - t0 < 3000) {
      st = D.dealStructure();
      if (st && !st.err) break;
      await new Promise(function(z){ requestAnimationFrame(z); });
    }
    if (!st || st.err) return st || { err: 'no plan' };
    st.planAt = Math.round(performance.now() - t0);
    var endedAt = -1;
    while (performance.now() - t0 < 5000) {
      if (!r.isDealing()) { endedAt = Math.round(performance.now() - t0); break; }
      await new Promise(function(z){ requestAnimationFrame(z); });
    }
    st.wallMs = endedAt >= 0 ? endedAt : -1;
    st.isDealing = r.isDealing();
    return st;
  }
};
window.__D27ERR = window.__D27ERR || [];
if (!window.__D27ERRWIRED) {
  window.__D27ERRWIRED = 1;
  window.addEventListener('error', function(e){ window.__D27ERR.push(String((e && e.message) || e)); });
  window.addEventListener('unhandledrejection', function(e){
    window.__D27ERR.push('reject:' + String((e && e.reason) || e));
  });
}
/* 渲染器内部把异常吞进 console.error（[STM render] / 光环异常不杀帧）——
 * 不挂钩子就会「画布空白但门禁全绿」。 */
window.__D27LOG = window.__D27LOG || [];
if (!window.__D27LOGWIRED) {
  window.__D27LOGWIRED = 1;
  var __ce = console.error;
  console.error = function(){
    try {
      var a = Array.prototype.slice.call(arguments).map(function(x){ return String(x); });
      if (window.__D27LOG.length < 20) window.__D27LOG.push(a.join(' '));
    } catch (e) {}
    return __ce.apply(console, arguments);
  };
}`;

async function main() {
  console.log('Δ30 真机验收（波次编舞 / 方向性飞行 / 磁吸坍缩光环）\n');

  var srv = await startServer();
  var PORT = srv.address().port;
  var devPort = 9600 + Math.floor(Math.random() * 300);
  var userDataDir = path.join(os.tmpdir(), 'stm-d27-' + Date.now());
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + devPort,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--window-size=430,880',
    '--user-data-dir=' + userDataDir, 'about:blank'
  ], { stdio: 'ignore' });

  function cleanup() {
    try { proc.kill(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

  var targets = null;
  for (var t = 0; t < 40; t++) {
    await sleep(250);
    try {
      targets = await new Promise(function (res, rej) {
        http.get('http://127.0.0.1:' + devPort + '/json/list', function (r) {
          var b = ''; r.on('data', function (d) { b += d; });
          r.on('end', function () { res(JSON.parse(b)); });
        }).on('error', rej);
      });
      if (targets && targets.length) break;
    } catch (e) {}
  }
  if (!targets || !targets.length) {
    console.error('delta27-verify: DevTools 未就绪'); cleanup(); process.exit(2);
  }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  async function ev(expr) {
    var r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) {
      var d = r.exceptionDetails;
      console.error('  eval error:', (d.exception && d.exception.description) || d.text);
      return undefined;
    }
    return r && r.result ? r.result.value : undefined;
  }
  async function shot(name) {
    var r = await c.send('Page.captureScreenshot', { format: 'png' });
    if (!r || !r.data) { console.error('  shot failed: ' + name); return; }
    var f = path.join(OUT, name);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('  · 取证帧 ' + name + ' (' + Math.round(fs.statSync(f).size / 1024) + ' KB)');
  }

  /* 载入某关并等 session + 布局就绪，然后注入页面助手 */
  async function loadLevel(lv) {
    await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html?level=' + lv });
    var ok = false;
    for (var rp = 0; rp < 200; rp++) {
      await sleep(60);
      ok = await ev('(function(){try{return !!(window.STM && STM.main && STM.main.session && STM.main.session());}catch(e){return false;}})()');
      if (ok) break;
    }
    if (!ok) return false;
    await ev(HELPERS);
    /* 布局就绪（layout.n > 0）才能建编舞计划 */
    for (var lp = 0; lp < 120; lp++) {
      var ln = await ev('(function(){var r=window.__D27.rnd();return r?(r.layoutOf().n||0):0;})()');
      if (ln > 0) return true;
      await sleep(60);
    }
    return false;
  }

  /* L33：72 关中体量最大（N=141, zMax=4），三层叠放，最坏形态 */
  var okL33 = await loadLevel(33);
  check('L33 载入完成（session + 布局就绪）', okL33 === true);
  if (!okL33) { cleanup(); process.exit(1); }

  check('页面助手注入成功', (await ev('!!window.__D27')) === true);

  /* 深链进关发生在开机动画之后——必须等 splash 真正退场再取帧，
   * 否则截到的是过渡屏（实测 800ms 时仍是 splash）。 */
  var splashGone = false;
  for (var sg = 0; sg < 120; sg++) {
    await sleep(100);
    splashGone = await ev(`(function(){
      var s = document.getElementById('splash-screen');
      if (!s) return true;
      var cs = getComputedStyle(s);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      if (parseFloat(cs.opacity || '1') < 0.05) return true;
      var r = s.getBoundingClientRect();
      return !(r.width > 0 && r.height > 0) || s.classList.contains('hidden') || s.classList.contains('done');
    })()`);
    if (splashGone) break;
  }
  check('开机过渡屏已退场（可安全取帧）', splashGone === true);

  /* ---------- ① 开局进场：波次结构（L33 真实 rAF + 实时计划） ---------- */
  console.log('\n① 开局进场波次结构（L33 / N=141 / zMax=4）');
  var st1 = await ev('window.__D27.dealProbe()');
  check('① 编舞计划覆盖全部卡牌（141 张）', !!st1 && st1.n === 141, st1 ? st1.n : 'null');
  check('① 首帧零延迟（最小 delay === 0，取消开局留白）',
    !!st1 && st1.minDelay === 0, st1 ? 'minDelay=' + st1.minDelay : '-');
  check('① 波次数 = 预算波次且 ∈ [6,12]',
    !!st1 && st1.waves === st1.budgetWaves && st1.waves >= 6 && st1.waves <= 12,
    st1 ? ('waves=' + st1.waves + ' budget=' + st1.budgetWaves) : '-');
  check('① 波内同起同落（波内 delay 极差 === 0）',
    !!st1 && st1.intraSpreadMax === 0, st1 ? 'spread=' + st1.intraSpreadMax : '-');
  check('① 波间起跑间隔 >= 14ms',
    !!st1 && st1.waveGapMin >= 14 - 1e-6, st1 ? 'waveGapMin=' + Number(st1.waveGapMin).toFixed(2) : '-');
  check('① 同层相邻波次间隔 >= 14ms（waveStep 生效）',
    !!st1 && st1.zGapMin >= 14 - 1e-6, st1 ? 'zGapMin=' + Number(st1.zGapMin).toFixed(2) : '-');
  check('① 层序锁：同 (r,c) 低层 delay 恒早于高层（零穿模）',
    !!st1 && st1.lockBad === 0 && st1.pairCount > 0,
    st1 ? ('bad=' + st1.lockBad + '/' + st1.pairCount + ' minGap=' + st1.lockMinGap) : '-');
  check('① 每波 >= 3 张（波内成组观感）',
    !!st1 && st1.waveSizeMin >= 3, st1 ? 'waveSizeMin=' + st1.waveSizeMin : '-');
  check('① 编舞总时长 = 390ms（落 360~420 窗口内）',
    !!st1 && Math.abs(st1.totalMs - 390) < 1 && st1.totalMs >= 360 && st1.totalMs <= 420,
    st1 ? st1.totalMs : '-');
  check('① totalMs === 末波起跑 + 单卡时长（公式逐字对齐）',
    !!st1 && Math.abs(st1.totalMs - (st1.maxDelay + 140)) < 1e-6,
    st1 ? ('total=' + st1.totalMs + ' maxDelay+140=' + (st1.maxDelay + 140)) : '-');
  check('① 墙钟落定 = totalMs + 帧量化（<= 300ms 容差，headless 单帧可达 100ms+）',
    !!st1 && st1.wallMs > 0 && st1.isDealing === false &&
    st1.wallMs >= st1.totalMs - 1 && st1.wallMs <= st1.totalMs + 300,
    st1 ? ('wall=' + st1.wallMs + 'ms total=' + st1.totalMs + 'ms') : '-');
  await ev('window.__D27.rnd().startDeal(0)');
  await sleep(60);
  await shot('deal-60ms.png');
  await sleep(160);
  await shot('deal-220ms.png');
  await ev('window.__D27.rnd().skipDeal()');
  await sleep(120);
  await shot('deal-settled.png');

  /* ---------- ② 飞行：槽位稳定性 + 图层序稳定性 + 取证帧 ---------- */
  console.log('\n② 方向性飞行（槽位稳定 / 图层不反转）');
  var tapId = await ev('window.__D27.firstTappable(0)');
  check('② 找到朝上（U）可点卡牌', tapId != null && tapId >= 0, tapId);
  if (tapId != null && tapId >= 0) {
    /* CDP 往返 ~50ms/次，逐帧采样必须放在**页面内**用 rAF 完成，
     * 否则抓不到 220ms 的飞行窗口（实测 Node 侧轮询只能抓到 1~2 帧）。 */
    var probe = await ev(`(async function(){
      var tid = ${tapId};
      var r = window.__D27.rnd();
      var sig0 = window.__D27.dockSig();
      var geo = window.__D27.geo();
      var sigs = [], flying = [], orderOk = true, idxSeen = -1;
      var rec = null;
      window.__D27.sess().tap(tid);
      var fs0 = r.flightsOf();
      rec = fs0.length ? { dir: fs0[0].dir, dur: fs0[0].dur, slot: fs0[0].slotIndex } : null;
      var t0 = performance.now();
      await new Promise(function(resolve){
        function step(){
          sigs.push(window.__D27.dockSig());
          var fs = r.flightsOf();
          flying.push(fs.length);
          if (fs.length && idxSeen < 0) idxSeen = fs[0].slotIndex;
          if (window.__D27.orderOk(geo) === false) orderOk = false;
          if (performance.now() - t0 < 520) requestAnimationFrame(step); else resolve();
        }
        requestAnimationFrame(step);
      });
      return {
        sig0: sig0, sigs: sigs, flying: flying, orderOk: orderOk,
        rec: rec, idxSeen: idxSeen, sigEnd: window.__D27.dockSig(),
        frames: sigs.length
      };
    })()`);

    check('② 产生在途飞行记录（dir=U / 220ms）',
      !!probe && !!probe.rec && probe.rec.dir === 0 && Math.abs(probe.rec.dur - 220) < 1e-6,
      probe && probe.rec ? JSON.stringify(probe.rec) : 'null');
    var flyFrames = probe ? probe.flying.filter(function (n) { return n > 0; }).length : 0;
    check('② 逐帧采样到在途帧（>= 2 帧；headless 无 GPU 时 rAF 约 8~17fps，220ms 窗口只能落 2~3 帧）',
      flyFrames >= 2, 'frames=' + flyFrames);
    /* 只在「该帧确实有在途飞行」时断言槽位签名不变 */
    var flySigs = [], afterSigs = [];
    if (probe) {
      for (var pi2 = 0; pi2 < probe.sigs.length; pi2++) {
        if (probe.flying[pi2] > 0) flySigs.push(probe.sigs[pi2]);
        else if (flySigs.length) afterSigs.push(probe.sigs[pi2]);
      }
    }
    check('② 飞行期间 #dock 槽位签名零变化（目标槽保持空槽）',
      flySigs.length > 0 && flySigs.every(function (s) { return s === probe.sig0; }),
      probe ? probe.sig0 + ' → [' + flySigs.join(',') + ']' : '-');
    check('② 落定后逐帧全部切入 has-tile（空槽 → 有牌，不再回退）',
      afterSigs.length > 0 && afterSigs.every(function (s) { return s.indexOf('T') >= 0; }),
      afterSigs.join(','));
    check('② 落定后槽位序号合法（0..6）',
      !!probe && probe.idxSeen >= 0 && probe.idxSeen <= 6, probe ? probe.idxSeen : '-');
    check('② 飞行全程棋盘静态层绘制序恒按 (z,r,c) 升序（无层次反转）',
      !!probe && probe.orderOk === true);

    /* 取证帧：再点一张（真实 220ms 窗口内 CDP 截图只能近似取时） */
    var tap2 = await ev('window.__D27.firstTappable(0)');
    if (tap2 != null && tap2 >= 0) {
      await ev('window.__D27.sess().tap(' + tap2 + ')');
      await shot('flight-a.png');
      await sleep(70);
      await shot('flight-b.png');
      await sleep(400);
    }
    await shot('flight-landed.png');
  }

  /* ---------- ③ 三消磁吸坍缩（Δ30a） ----------
   * 为什么必须「先占住槽 0,1」：`applyTap` 是原子结算，`match` 时那 3 张牌已从
   * `state.dock` 移除，若只在空槽上凑三消（槽 0,1,2），错误实现（写死最左 3 槽）
   * 与正确实现结果**相同** → 测不出来。故先点 2 张异花色把三消块挤到槽 2,3,4，
   * 两种实现相差整整 2 个槽宽，可确定性区分。 */
  console.log('\n③ 三消磁吸坍缩（槽位定位 / 磁吸位移 / 关键帧 / 双环星芒）');
  var col = await ev(`(async function(){
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    var D = window.__D27, r = D.rnd(), s = D.sess(), RE = window.STM.RulesEngine;
    s.reset();
    await sleep(160);
    r.skipDeal();
    await sleep(60);

    function firstOf(suit){
      var st = s.state(), eng = s.engineState();
      for (var i = 0; i < st.board.length; i++) {
        var t = st.board[i];
        if (!t || (t.s|0) !== suit) continue;
        if (!RE.canTap(eng, t.id)) continue;
        return t.id;
      }
      return null;
    }
    /* 目标花色 = 可点数量最多的花色；副花色 = 次多的（用于占槽 0,1） */
    var st0 = s.state(), eng0 = s.engineState(), cnt = {};
    for (var i0 = 0; i0 < st0.board.length; i0++) {
      var b0 = st0.board[i0];
      if (!b0 || !RE.canTap(eng0, b0.id)) continue;
      var k0 = b0.s|0; cnt[k0] = (cnt[k0]||0)+1;
    }
    var target = -1, bestN = 0, preSuit = -1, preN = 0;
    for (var kk in cnt) {
      if (cnt[kk] > bestN) { preN = bestN; preSuit = target; bestN = cnt[kk]; target = kk|0; }
      else if (cnt[kk] > preN) { preN = cnt[kk]; preSuit = kk|0; }
    }
    if (target < 0 || bestN < 3) return { err: 'no triple suit' };
    if (preSuit < 0) return { err: 'no second suit' };

    /* 静态基线几何（未挂动画时取） */
    var baseRects = D.slotRects();

    /* 占住槽 0,1 */
    var preTapped = 0;
    for (var pv = 0; pv < 2; pv++) {
      var pid = firstOf(preSuit);
      if (pid == null) break;
      s.tap(pid); preTapped++;
      await sleep(110);
    }
    var preDock = s.state().dock.map(function(t){ return t.s; });

    var obs = {
      shatSlots: null, shatT: -1, suckDx: null, animDur: null, animName: null,
      flightsAtShat: -1, dockTAtShat: -1, slotCountAtShat: -1,
      ringsAt: -1, ringsFirst: null, ringCountMax: 0, ringYDrift: 0,
      centerX: null, centerY: null, ringW: null,
      shatOffAt: -1, ringsGoneAt: -1, frames: 0,
      sigAtShat: null, sigEnd: null, shatSlotsEnd: null,
      expectShat: null, dockBeforeMatch: null
    };
    var ti = 0, lastTap = -1e9, tapped = 0;
    var t0 = performance.now();
    await new Promise(function(done){
      function loop(){
        var now = performance.now(), el = now - t0;
        /* 逐张点入，留 110ms 让飞行落定（避免并发飞行干扰时序观测） */
        if (ti < 3 && now - lastTap > 110) {
          var stc = s.state();
          var idxT = [];
          for (var ci = 0; ci < stc.dock.length; ci++) {
            if ((stc.dock[ci].s|0) === target) idxT.push(ci);
          }
          if (idxT.length >= 2 && stc.dock.length < 7) {
            obs.dockBeforeMatch = stc.dock.map(function(t){ return t.s; });
            obs.expectShat = idxT.concat([stc.dock.length]).sort(function(a,b){ return a-b; });
          }
          var tid = firstOf(target);
          if (tid != null) { s.tap(tid); ti++; tapped++; lastTap = now; }
        }
        var on = D.shatSlots();
        if (on.length && obs.shatSlots == null) {
          obs.shatSlots = on;
          obs.shatT = Math.round(el);
          obs.sigAtShat = D.dockSig();
          obs.slotCountAtShat = document.querySelectorAll('#dock .slot').length;
          obs.suckDx = D.suckDxOf();
          obs.flightsAtShat = r.flightsOf().length;
          obs.dockTAtShat = (D.dockSig().match(/T/g) || []).length;
          /* 关键帧必须读 .dock-chip（动画挂在 chip 上，不是 .slot） */
          var ns0 = document.querySelectorAll('#dock .slot');
          var chip0 = ns0[on[0]] ? ns0[on[0]].querySelector('.dock-chip') : null;
          if (chip0 && window.getComputedStyle) {
            var cs0 = window.getComputedStyle(chip0);
            obs.animDur = cs0.animationDuration;
            obs.animName = cs0.animationName;
          }
        }
        if (obs.shatSlots && on.length === 0 && obs.shatOffAt < 0) obs.shatOffAt = Math.round(el);
        var rr = D.ringsOf();
        if (rr.length) {
          if (obs.ringsAt < 0) {
            obs.ringsAt = Math.round(el);
            obs.centerX = rr[0].x; obs.centerY = rr[0].y; obs.ringW = rr[0].w;
            obs.ringsFirst = rr.map(function(o){
              return { kind: o.kind, t0: Math.round(o.t0), dur: o.dur, color: o.color,
                       r0: o.r0, r1: o.r1, lw0: o.lw0, lw1: o.lw1,
                       x: o.x, y: o.y, size: o.size, ang: o.ang };
            });
          }
          if (rr.length > obs.ringCountMax) obs.ringCountMax = rr.length;
          for (var q = 0; q < rr.length; q++) {
            var dy = Math.abs(rr[q].y - obs.centerY);
            if (dy > obs.ringYDrift) obs.ringYDrift = dy;
            var dxq = Math.abs(rr[q].x - obs.centerX);
            if (dxq > obs.ringYDrift) obs.ringYDrift = dxq;
          }
        } else if (obs.ringsAt >= 0 && obs.ringsGoneAt < 0) {
          obs.ringsGoneAt = Math.round(el);
        }
        obs.frames++;
        if (obs.ringsGoneAt >= 0 || el > 6000) { done(); return; }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
    /* 再等两帧，让「池有→空」的补清屏落到画布上 */
    await new Promise(function(z){ requestAnimationFrame(function(){ requestAnimationFrame(z); }); });
    var resid = D.vfxPixels();
    obs.sigEnd = D.dockSig();
    obs.shatSlotsEnd = D.shatSlots();
    obs.residue = resid;
    obs.tapped = tapped;
    obs.preTapped = preTapped;
    obs.preDock = preDock;
    obs.baseRects = baseRects;
    obs.slotCountEnd = document.querySelectorAll('#dock .slot').length;
    obs.timing = window.STM.main.peakTiming;
    return obs;
  })()`);

  if (col && !col.err && col.shatSlots && col.expectShat) {
    var bs = col.baseRects || [];
    var shat = col.shatSlots;
    check('③ 预置 2 张异花色占住槽 0,1（把三消块挤到右侧）',
      col.preTapped === 2 && col.preDock.length >= 2, JSON.stringify(col.preDock));
    check('③ .slot-shattering 恰好落在 3 个槽位',
      shat.length === 3, JSON.stringify(shat));
    check('③ 坍缩槽位 = dock 快照推导的本轮三消 3 槽',
      JSON.stringify(shat) === JSON.stringify(col.expectShat),
      'obs=' + JSON.stringify(shat) + ' expect=' + JSON.stringify(col.expectShat) +
      ' dockBefore=' + JSON.stringify(col.dockBeforeMatch));
    check('③ 坍缩槽位不是「最左 3 槽」（MUST 为本轮三消真实所在槽位）',
      !(shat[0] === 0 && shat[1] === 1 && shat[2] === 2),
      'shat=' + JSON.stringify(shat));

    /* 磁吸位移：中间槽 0、左侧为正、右侧为负，量级 ≈ 一个槽距 */
    var dx = col.suckDx || {};
    var d0 = dx[shat[0]], d1 = dx[shat[1]], d2 = dx[shat[2]];
    check('③ --suck-dx 三槽齐备（磁吸位移已写入内联 CSS 变量）',
      d0 != null && d1 != null && d2 != null, JSON.stringify(dx));
    check('③ 中间槽位移 === 0（合体锚点）', d1 === 0, 'mid=' + d1);
    check('③ 左槽向中间收敛（dx > 0）、右槽向中间收敛（dx < 0）',
      d0 > 0 && d2 < 0, 'left=' + d0 + ' right=' + d2);
    var pitch = (bs[shat[1]] && bs[shat[0]]) ? (bs[shat[1]].l - bs[shat[0]].l) : 0;
    check('③ 磁吸位移量级 ≈ 一个槽距（0.8~1.6 槽距，非「槽宽×序号」换算）',
      pitch > 0 && Math.abs(d0) >= pitch * 0.8 && Math.abs(d0) <= pitch * 1.6 &&
      Math.abs(d2) >= pitch * 0.8 && Math.abs(d2) <= pitch * 1.6,
      'pitch=' + pitch + ' |d0|=' + Math.abs(d0).toFixed(1) + ' |d2|=' + Math.abs(d2).toFixed(1));

    check('③ 关键帧动画时长 = 0.22s（三段 220ms 精确值）',
      col.animDur === '0.22s', 'animationDuration=' + col.animDur);
    check('③ 关键帧动画名 = slot-shatter（磁吸/闪白/坍缩已生效）',
      col.animName === 'slot-shatter', col.animName);
    check('③ 演出期 #dock 槽位数不变（7 槽，零增删）',
      col.slotCountAtShat === 7 && col.slotCountEnd === 7,
      col.slotCountAtShat + ' → ' + col.slotCountEnd);

    /* 光环：双环 + 星芒 */
    var rf = col.ringsFirst || [];
    var outer = null, inner = null, rays = [];
    for (var ri = 0; ri < rf.length; ri++) {
      if (rf[ri].kind === 'outer') outer = rf[ri];
      else if (rf[ri].kind === 'inner') inner = rf[ri];
      else if (rf[ri].kind === 'ray') rays.push(rf[ri]);
    }
    check('③ 光环起演即生成双环 + 星芒（outer/inner/ray 三类齐备）',
      !!outer && !!inner && rays.length > 0,
      'outer=' + !!outer + ' inner=' + !!inner + ' rays=' + rays.length);
    check('③ 星芒 4~8 枚（四角星芒扩散）',
      rays.length >= 4 && rays.length <= 8, 'rays=' + rays.length);
    if (outer && inner) {
      check('③ 外环纯白 / 内环冰晶蓝（双色分层）',
        outer.color === '#FFFFFF' && inner.color === 'hsl(205, 90%, 72%)',
        outer.color + ' / ' + inner.color);
      check('③ 双环错峰 32ms（外环先起、内环紧随）',
        Math.abs((inner.t0 - outer.t0) - 32) <= 1,
        'stagger=' + (inner.t0 - outer.t0) + 'ms');
      check('③ 双环生命周期 80ms / 48ms（细光环、快速收干净）',
        outer.dur === 80 && inner.dur === 48, outer.dur + ' / ' + inner.dur);
      check('③ 线宽递减（2.5 → 1.5，细光环 MUST NOT 粗描边）',
        outer.lw0 === 2.5 && outer.lw1 === 1.5 && inner.lw1 < inner.lw0,
        outer.lw0 + '→' + outer.lw1);
      check('③ 外环半径 2.0× 槽宽 / 内环 1.6× 槽宽（扩散幅度）',
        Math.abs(outer.r1 - 2.0) < 1e-6 && Math.abs(inner.r1 - 1.6) < 1e-6,
        outer.r1 + ' / ' + inner.r1);
      check('③ 双环圆心重合（同一次冲击的同心环）',
        Math.abs(outer.x - inner.x) < 0.5 && Math.abs(outer.y - inner.y) < 0.5,
        '(' + outer.x.toFixed(1) + ',' + outer.y.toFixed(1) + ')');
    }
    /* 圆心 = 中间槽实时中心（禁止「最左 3 槽」或比例换算） */
    var midRect = bs[shat[1]];
    if (midRect) {
      var ex = (midRect.l + midRect.r) / 2, ey = (midRect.t + midRect.b) / 2;
      check('③ 光环圆心 = 中间槽实时中心（<= 2px）',
        col.centerX != null && Math.abs(col.centerX - ex) <= 2 && Math.abs(col.centerY - ey) <= 2,
        'ring=(' + (col.centerX || 0).toFixed(1) + ',' + (col.centerY || 0).toFixed(1) +
        ') slot=(' + ex.toFixed(1) + ',' + ey.toFixed(1) + ')');
      check('③ 光环基准宽度 = 槽宽（半径按槽宽换算）',
        col.ringW != null && Math.abs(col.ringW - midRect.w) <= 1,
        'w=' + col.ringW + ' slotW=' + midRect.w);
    }
    /* 零掉落物：光环圆心在整个生命周期内恒定（MUST NOT 有 y 持续增大的绘制物） */
    check('③ 零掉落物：光环/星芒圆心全程恒定（无 y 递增的碎块绘制）',
      col.ringYDrift <= 1.5, 'maxDrift=' + (col.ringYDrift == null ? '-' : col.ringYDrift.toFixed(2)) + 'px');
    /* 光环与卡牌形变错峰接力：类名上屏那一帧 → 光环可见那一帧，实测受
     * headless 帧量化影响可达 ~300ms（单帧 100~150ms），精确值由
     * peakTiming.ringAtMs === 140 与 CSS 0.22s 两条常量断言守住。 */
    check('③ 光环与坍缩段错峰接力（起跑晚于坍缩首帧，非 0ms 同帧）',
      col.ringsAt - col.shatT >= 100 && col.ringsAt - col.shatT <= 420,
      'ringAt-shatOn=' + (col.ringsAt - col.shatT) + 'ms');

    /* 收尾：无残留 */
    check('③ 220ms + 1 帧后 .slot-shattering 全部摘除（DOM 无脏类）',
      col.shatSlotsEnd && col.shatSlotsEnd.length === 0, JSON.stringify(col.shatSlotsEnd));
    check('③ 演出结束后本组 3 槽回到空槽态（ghost 已清，无残留有牌态）',
      !!col.sigEnd && col.sigEnd.length === 7 &&
      shat.every(function (i) { return col.sigEnd.charAt(i) === 'E'; }),
      'sigEnd=' + col.sigEnd + ' shat=' + JSON.stringify(shat));
    check('③ 220ms + 1 帧后 #vfx-canvas 零残留像素（alpha > 2 = 0）',
      col.residue && col.residue.nonZero === 0,
      col.residue ? (col.residue.nonZero + '/' + col.residue.total) : 'n/a');
    check('③ 时序常量同源（peakTiming: collapse 220 / ringAt 140 / flip 140）',
      !!col.timing && col.timing.collapseMs === 220 && col.timing.ringAtMs === 140 &&
      col.timing.flipMs === 140 && col.timing.freezeMs === 220,
      col.timing ? JSON.stringify(col.timing) : 'null');
    await shot('collapse-after.png');
  } else {
    check('③ 磁吸坍缩采样成功', false, col ? JSON.stringify(col.err || { shatSlots: col.shatSlots, expect: col.expectShat }) : 'null');
  }

  /* ---------- ④ 碎裂时序：3 张全部落定后才起演（保留 Δ28a 铁律） ----------
   * 它验的是**时序**不是碎块：`match` 在点击结算瞬间下发，若直接起演就会
   * 「牌没到就爆」。正确链路是 pendingShatter → onFlightLand 逐张 →
   * 全落定才 fireDockShatter。 */
  console.log('\n④ 碎裂时序（3 张全部落定后才起演）');
  await ev('window.__D27.rnd().cancelFlights()');
  await ev('window.__D27.sess().reset()');
  await sleep(160);
  await ev('window.__D27.rnd().skipDeal()');
  await sleep(120);

  var triple = await ev('window.__D27.tappableTriple()');
  check('④ 找到同花色 3 张可点卡牌', !!triple && triple.ids && triple.ids.length === 3,
    triple ? JSON.stringify(triple) : 'null');

  var seq = null;
  if (triple && triple.ids && triple.ids.length === 3) {
    seq = await ev(`(async function(){
      var ids = ${JSON.stringify(triple.ids)};
      var D = window.__D27, r = D.rnd();
      var frames = [];
      var t0 = performance.now();
      var ti = 0, lastTapAt = -1e9, taps = [];
      await new Promise(function(resolve){
        function step(){
          var now = performance.now();
          if (ti < ids.length && now - lastTapAt > 90) {
            D.sess().tap(ids[ti]);
            taps.push(Math.round(now - t0));
            ti++;
            lastTapAt = now;
          }
          var rings = D.ringsOf();
          frames.push({
            t: Math.round(now - t0),
            shat: D.shatSlots().length,
            rings: rings.length,
            ringY: rings.length ? rings[0].y : null,
            fl: r.flightsOf().length,
            tTiles: (D.dockSig().match(/T/g) || []).length
          });
          if (now - t0 < 1600) requestAnimationFrame(step); else resolve();
        }
        requestAnimationFrame(step);
      });
      return { frames: frames, taps: taps };
    })()`);
  }

  if (seq && seq.frames && seq.frames.length) {
    var firstShat = -1, firstRing = -1, maxFl = 0;
    for (var fi = 0; fi < seq.frames.length; fi++) {
      if (firstShat < 0 && seq.frames[fi].shat > 0) firstShat = fi;
      if (firstRing < 0 && seq.frames[fi].rings > 0) firstRing = fi;
      if (seq.frames[fi].fl > maxFl) maxFl = seq.frames[fi].fl;
    }
    check('④ 3 次点击后确实产生了在途并发飞行（>= 2 张同飞）', maxFl >= 2, 'maxFl=' + maxFl);
    check('④ 坍缩已触发（采样窗内出现 .slot-shattering）', firstShat >= 0,
      firstShat >= 0 ? ('t=' + seq.frames[firstShat].t + 'ms') : 'no shatter');
    if (firstShat >= 0) {
      var f0 = seq.frames[firstShat];
      /* 核心断言：坍缩起演的那一帧，**不允许**还有卡牌在飞 */
      check('④ 碎裂瞬间零在途飞行（第 3 张已落定，不再「牌没到就爆」）',
        f0.fl === 0, 'flights=' + f0.fl + ' @' + f0.t + 'ms');
      check('④ 坍缩起演帧槽内已有 3 张有牌态（ghost 生效，不是空槽爆炸）',
        f0.tTiles >= 3, 'T×' + f0.tTiles + ' @' + f0.t + 'ms');
      check('④ 坍缩发生在最后一次点击之后（非点击同帧起演）',
        seq.taps.length === 3 && f0.t > seq.taps[2],
        'taps=' + JSON.stringify(seq.taps) + ' shatter@' + f0.t + 'ms');
    }
    if (firstRing >= 0 && firstShat >= 0) {
      var dRing = seq.frames[firstRing].t - seq.frames[firstShat].t;
      check('④ 光环起跑晚于坍缩首帧（非 0ms 同帧；headless 帧量化上界 420ms）',
        dRing >= 100 && dRing <= 420, 'Δ=' + dRing + 'ms');
    }
    await shot('collapse-seq.png');
    await sleep(90);
    await shot('collapse-seq+90.png');
  } else {
    check('④ 碎裂时序采样成功', false, seq ? JSON.stringify(seq) : 'null');
  }

  /* ---------- ⑤ 光环像素取证（隔离实验：清空 VFX 层后单独起演） ----------
   * 为什么隔离：坍缩期画布上只有光环（卡片形变走 DOM/CSS），但为排除任何
   * 干扰，先 clearVfx() 把池清空，再在**已知圆心**起演一次冲击，于是画布上
   * 亮像素的唯一来源就是双环 + 星芒。
   * 为什么必须 drawVfxNow() 同步渲染：坍缩演出总长仅 220ms（外环 80ms /
   * 内环 48ms / 星芒 64ms），headless 无 GPU 时单帧 100~150ms → rAF 会**整段
   * 跳过**该演出，靠 rAF 采样永远只能读到 0 像素（实测踩过）。故按「相位」
   * 手动推进 + 同步渲染 + 立即读像素，像素证据与池内记录两条腿都拿到。 */
  console.log('\n⑤ 光环像素取证与零残留（隔离实验 / 四相位确定性采样）');
  var pix = await ev(`(async function(){
    var D = window.__D27, r = D.rnd();
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    var rects = D.slotRects();
    var mid = rects[3] || rects[0];
    if (!mid) return { err: 'no slot rect' };
    var cx = (mid.l + mid.r) / 2, cy = (mid.t + mid.b) / 2;
    r.clearVfx();
    await new Promise(function(z){ requestAnimationFrame(z); });
    r.drawVfxNow();
    var base = D.vfxBox(cx, cy, mid.w * 3.2);

    var made = r.spawnCollapseImpact(cx, cy, mid.w, false);
    var rings0 = D.ringsOf();
    /* 外环的绝对起跑时刻（t0 域 = performance.now()）。后续所有相位都用
     * drawVfxNow(t0 + Δ) **拨时间轴**采样——低帧率下单帧 150ms，墙钟采样
     * 根本落不进 80ms 的光环寿命（实测相位 A 恒为 0 像素）。 */
    var tOuter = -1;
    for (var i0 = 0; i0 < rings0.length; i0++) {
      if (rings0[i0].kind === 'outer') { tOuter = rings0[i0].t0; break; }
    }
    if (!(tOuter > 0)) return { err: 'no outer ring' };

    /* 相位 A：Δ=8ms（p=0.10，起手段半径） */
    r.drawVfxNow(tOuter + 8);
    var rowA = D.vfxRow(cx, cy);
    /* 相位 B：Δ=56ms（p=0.70，扩散近终值） */
    r.drawVfxNow(tOuter + 56);
    var rowB = D.vfxRow(cx, cy);
    /* 相位 C：Δ=81ms（外环 80ms 已到期 → 必须收干净） */
    r.drawVfxNow(tOuter + 81);
    var boxC = D.vfxBox(cx, cy, mid.w * 3.2);
    /* 相位 D：等 tick 回收记录后再渲染 + 全画布扫描（防冻结末帧） */
    await sleep(260);
    var ringsLeft = D.ringsOf().length;
    r.drawVfxNow();
    var allD = D.vfxPixels();

    var yDrift = 0;
    for (var i = 0; i < rings0.length; i++) {
      var d1 = Math.abs(rings0[i].y - cy), d2 = Math.abs(rings0[i].x - cx);
      if (d1 > yDrift) yDrift = d1;
      if (d2 > yDrift) yDrift = d2;
    }
    return { made: made, cx: cx, cy: cy, w: mid.w, base: base, tOuter: tOuter,
             rowA: rowA, rowB: rowB, boxC: boxC, allD: allD,
             ringsAtSpawn: rings0.length, ringsLeft: ringsLeft,
             yDrift: yDrift, cvW: allD && allD.w, cvH: allD && allD.h,
             logs: (window.__D27LOG || []).slice(0, 4) };
  })()`);

  if (pix && !pix.err) {
    var rA = pix.rowA || {}, rB = pix.rowB || {};
    var bC = pix.boxC || {};
    var aD = pix.allD || {};
    var diag = 'rowA n=' + rA.n + ' rMax=' + (rA.rMax || 0).toFixed(1) +
      ' | rowB n=' + rB.n + ' rMax=' + (rB.rMax || 0).toFixed(1) +
      ' | boxC=' + bC.nonZero + ' allD=' + aD.nonZero +
      ' | 池=' + pix.ringsAtSpawn + '/' + pix.ringsLeft +
      ' 画布=' + pix.cvW + 'x' + pix.cvH +
      (pix.logs && pix.logs.length ? ' log=' + pix.logs.join('|') : '');
    check('⑤ 隔离前画布已清空（起点 alpha > 2 像素 = 0）',
      pix.base && pix.base.nonZero === 0, pix.base ? (pix.base.err || pix.base.nonZero) : 'n/a');
    check('⑤ 起演即生成 2 环 + 4~8 星芒（共 6~10 个绘制记录）',
      pix.made >= 6 && pix.made <= 10 && pix.ringsAtSpawn === pix.made,
      'made=' + pix.made + ' 池=' + pix.ringsAtSpawn);
    check('⑤ 相位 A（Δ=8ms）画布确有环状亮像素（扫描线 >= 2 段亮像素）',
      rA.n >= 2, diag);
    check('⑤ 相位 A 半径仍处起手段（0.6~1.6 槽宽，非一上来就满幅）',
      rA.n >= 2 && rA.rMax >= pix.w * 0.6 && rA.rMax <= pix.w * 1.6,
      'rMax=' + (rA.rMax || 0).toFixed(1) + ' slotW=' + pix.w);
    /* 细环判据：扫描线上若为实心盘，半径 1 槽宽会点亮 ~2 槽宽的像素
     * （dpr=2 时约 176 px）；细环只有「两侧各 2~3 px」→ 亮像素数远小于盘。 */
    check('⑤ 相位 A 呈细环而非实心盘（扫描线亮像素 <= 0.35 槽宽像素数）',
      rA.n >= 2 && rA.n <= Math.max(12, Math.ceil(pix.w * 0.35 * (rA.dpr || 2))),
      'n=' + rA.n + ' 上限=' + Math.max(12, Math.ceil(pix.w * 0.35 * (rA.dpr || 2))));
    check('⑤ 相位 B（Δ=56ms）环半径明显扩大（扩散中，非一帧闪过）',
      rB.n >= 2 && rB.rMax >= rA.rMax + 8,
      'rMax ' + (rA.rMax || 0).toFixed(1) + ' → ' + (rB.rMax || 0).toFixed(1));
    check('⑤ 相位 B 半径 ≈ 2.0 槽宽（OUTER_R1 扩散幅度实测，1.6~2.2）',
      rB.n >= 2 && rB.rMax / pix.w >= 1.6 && rB.rMax / pix.w <= 2.2,
      (rB.rMax / pix.w).toFixed(2) + '× 槽宽');
    check('⑤ 光环圆心全程恒定（零掉落物：无 y 递增绘制）',
      pix.yDrift <= 1.5, 'drift=' + pix.yDrift.toFixed(2) + 'px');
    check('⑤ 相位 C（Δ=81ms，外环 80ms 到期）窗口内零残留像素',
      bC.nonZero === 0, diag);
    check('⑤ 光环全部到期回收（池内记录归零）', pix.ringsLeft === 0, 'left=' + pix.ringsLeft);
    check('⑤ 相位 D（回收后再渲染）全画布零残留（无冻结末帧）',
      aD.nonZero === 0, diag);
    await shot('collapse-ring.png');
  } else {
    check('⑤ 光环像素采样成功', false, pix ? JSON.stringify(pix.err || pix) : 'null');
  }

  /* ---------- ⑥ 多规模关卡归一（L3 / L33 / L72） ---------- */
  console.log('\n⑥ 多规模关卡总时长归一（360~420ms / 首帧零延迟）');
  var SCALES = [
    { lv: 3, tag: 'L3' },
    { lv: 33, tag: 'L33' },
    { lv: 72, tag: 'L72' }
  ];
  for (var si = 0; si < SCALES.length; si++) {
    var sc = SCALES[si];
    var okLv = await loadLevel(sc.lv);
    if (!okLv) { check('⑥ ' + sc.tag + ' 载入完成', false); continue; }
    var stx = await ev('window.__D27.dealProbe()');
    check('⑥ ' + sc.tag + ' 编舞计划就绪（n = ' + (stx && stx.n) + ' / zMax = ' + (stx && stx.zMax) + '）',
      !!stx && !stx.err && stx.n > 0);
    if (stx && !stx.err) {
      check('⑥ ' + sc.tag + ' 总时长 ∈ [360,420]ms（' + stx.totalMs + 'ms）',
        stx.totalMs >= 360 && stx.totalMs <= 420, stx.totalMs);
      check('⑥ ' + sc.tag + ' 首帧零延迟（minDelay === 0）',
        stx.minDelay === 0, stx.minDelay);
      check('⑥ ' + sc.tag + ' 波次数 ∈ [6,12]（' + stx.waves + ' 波）',
        stx.waves >= 6 && stx.waves <= 12, stx.waves);
      check('⑥ ' + sc.tag + ' 波内同起同落（极差 0）',
        stx.intraSpreadMax === 0, stx.intraSpreadMax);
      check('⑥ ' + sc.tag + ' 层序锁成立（同 (r,c) 低层恒先起跑）',
        stx.lockBad === 0, 'bad=' + stx.lockBad + '/' + stx.pairCount);
      check('⑥ ' + sc.tag + ' 墙钟落定 = totalMs + 帧量化（<= 300ms 容差）',
        stx.wallMs > 0 && stx.isDealing === false &&
        stx.wallMs >= stx.totalMs - 1 && stx.wallMs <= stx.totalMs + 300,
        'wall=' + stx.wallMs + 'ms total=' + stx.totalMs + 'ms');
    }
    if (si === 0) await shot('deal-L3.png');
    if (si === 2) await shot('deal-L72.png');
  }

  var errList = await ev('(function(){return (window.__D27ERR||[]).slice(0,5);})()');
  check('全程零未捕获异常', Array.isArray(errList) && errList.length === 0,
    errList && errList.length ? errList.join(' | ') : '0');
  cleanup();

  console.log('');
  if (fails.length) {
    console.log('delta27-verify: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('delta27-verify: all green（波次编舞 390ms + 首帧零延迟 + 层序锁 / ' +
      '方向性飞行槽位零抖动 + 图层不反转 / 磁吸坍缩 220ms 三段 + 双环 32ms 错峰 + ' +
      '星芒 4~8 枚 + 零掉落物 + 画布零残留 / 多规模关卡总时长归一）');
    console.log('取证帧目录：shots/delta27/');
  }
}

main().catch(function (e) {
  console.error('delta27-verify: 异常', e && e.message);
  process.exit(2);
});
