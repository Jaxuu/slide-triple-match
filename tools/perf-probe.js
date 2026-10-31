'use strict';
/* =========================================================
 * perf-probe.js —— 渲染循环性能诊断探针（R8）
 *
 * 目的：用**真实数据**定位开局编舞期间的掉帧根因，而不是靠读代码猜。
 *
 * 手法：`Page.addScriptToEvaluateOnNewDocument` 在**所有页面脚本之前**注入
 * 计数器，逐帧记录：
 *   · dt        帧间隔（ms）——>20ms 即掉帧（60FPS 预算 16.7ms）
 *   · cb        本帧被调用的 rAF 回调数——>1 即存在并发循环
 *   · clrBoard  本帧 #board 的 clearRect 次数——>1 即 draw() 被跑了多次
 *   · clrVfx    本帧 #vfx-canvas 的 clearRect 次数
 *   · lg/rg     本帧 createLinearGradient / createRadialGradient 次数
 *   · fill/stroke/drawImage/save/restore/clip  本帧绘制调用数
 *   · gbcr      本帧 getBoundingClientRect 次数（强制同步布局）
 *
 * 为什么必须在页面内计数：CDP 往返 30~60ms，而编舞窗口只有 440~1000ms，
 * 外部 poll 必然漏帧。
 *
 * 用法：
 *   node tools/perf-probe.js                # L3 进关 + 重置（默认 GPU 光栅 = 真机口径）
 *   node tools/perf-probe.js --level 72
 *   node tools/perf-probe.js --no-gpu       # 强制 --disable-gpu（软件光栅保守档）
 *
 * 口径说明（为什么默认 GPU）：`--disable-gpu` 下 Canvas2D 走 SwiftShader 软件光栅，
 * 实测同一份代码的帧间隔 p95 会在 16.8~33.3ms 之间抖动，而**脚本耗时恒定 2.6~2.9ms**。
 * 即：软件光栅的填充率噪声会淹没真实回归信号。真机（含 GPU）实测 p95 = 16.8ms。
 * 故门禁默认用 GPU 光栅做帧预算断言，用脚本耗时（与光栅无关）做**硬红线**。
 * ========================================================= */
var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');

var args = process.argv.slice(2);
var LEVEL = 3;
var li = args.indexOf('--level');
if (li >= 0 && args[li + 1]) LEVEL = parseInt(args[li + 1], 10);
var USE_GPU = args.indexOf('--no-gpu') < 0;

var ROOT = path.resolve(__dirname, '..');
var CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
var BROWSER = null;
for (var i = 0; i < CANDIDATES.length; i++) {
  try { if (fs.statSync(CANDIDATES[i]).isFile()) { BROWSER = CANDIDATES[i]; break; } } catch (e) {}
}
if (!BROWSER) { console.error('perf-probe: 未找到 Chrome/Edge'); process.exit(2); }

/* ---------- 注入式计数器（必须早于页面脚本） ---------- */
var INSTRUMENT = [
  '(function(){',
  '  var P = window.__perf = { frames: [], t0: (window.performance && performance.now) ? performance.now() : 0 };',
  '  function zero(){ return { cb:0, cbMs:0, clrBoard:0, clrVfx:0, lg:0, rg:0, fill:0, stroke:0, img:0, save:0, restore:0, clip:0, gbcr:0, grad:0 }; }',
  '  P.acc = zero();',
  '  var origRAF = window.requestAnimationFrame.bind(window);',
  '  window.requestAnimationFrame = function(cb){',
  '    return origRAF(function(ts){',
  '      var t0 = performance.now();',
  '      P.acc.cb++;',
  '      try { return cb(ts); } finally { P.acc.cbMs += performance.now() - t0; }',
  '    });',
  '  };',
  '  /* 长任务归因：区分「脚本太长」与「GC / 合成器停顿」 */',
  '  P.long = [];',
  '  try {',
  '    new PerformanceObserver(function(list){',
  '      list.getEntries().forEach(function(e){ P.long.push({ d: +e.duration.toFixed(1), at: Math.round(e.startTime - P.t0) }); });',
  '    }).observe({ entryTypes: ["longtask"] });',
  '  } catch (eLT) {}',
  '  var C2D = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;',
  '  function wrap(name, key){',
  '    if (!C2D || typeof C2D[name] !== "function") return;',
  '    var o = C2D[name];',
  '    C2D[name] = function(){ P.acc[key]++; return o.apply(this, arguments); };',
  '  }',
  '  wrap("createLinearGradient","lg");',
  '  wrap("createRadialGradient","rg");',
  '  wrap("fill","fill");',
  '  wrap("stroke","stroke");',
  '  wrap("drawImage","img");',
  '  wrap("save","save");',
  '  wrap("restore","restore");',
  '  wrap("clip","clip");',
  '  if (C2D && typeof C2D.clearRect === "function") {',
  '    var oc = C2D.clearRect;',
  '    C2D.clearRect = function(){',
  '      var cv = this.canvas;',
  '      if (cv && cv.id === "board") P.acc.clrBoard++;',
  '      else if (cv && cv.id === "vfx-canvas") P.acc.clrVfx++;',
  '      return oc.apply(this, arguments);',
  '    };',
  '  }',
  '  if (window.Element && Element.prototype.getBoundingClientRect) {',
  '    var gb = Element.prototype.getBoundingClientRect;',
  '    Element.prototype.getBoundingClientRect = function(){ P.acc.gbcr++; return gb.apply(this, arguments); };',
  '  }',
  '  var last = 0;',
  '  function drive(ts){',
  '    if (last) { var r = P.acc; r.dt = ts - last; r.at = ts - P.t0; P.frames.push(r); }',
  '    last = ts; P.acc = zero(); origRAF(drive);',
  '  }',
  '  origRAF(drive);',
  '})();'
].join('\n');

/* ---------- CDP 客户端 ---------- */
function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var nextId = 1;
  var pending = {};
  var self = this;
  this.send = function (method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
  this.ready = new Promise(function (resolve) { self._r = resolve; });
  ws.onopen = function () { self._r(); };
  ws.onmessage = function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && pending[msg.id]) {
      var p = pending[msg.id];
      delete pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------- 统计 ---------- */
function pct(arr, q) {
  if (!arr.length) return 0;
  var a = arr.slice().sort(function (x, y) { return x - y; });
  var idx = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * q)));
  return a[idx];
}
function summarize(frames, label) {
  if (!frames.length) return { label: label, n: 0 };
  var dts = frames.map(function (f) { return f.dt; });
  var cbs = frames.map(function (f) { return f.cbMs || 0; });
  var keys = ['cb', 'clrBoard', 'clrVfx', 'lg', 'rg', 'fill', 'stroke', 'img', 'save', 'clip', 'gbcr'];
  var avg = {};
  keys.forEach(function (k) {
    var s = 0;
    for (var i = 0; i < frames.length; i++) s += (frames[i][k] || 0);
    avg[k] = +(s / frames.length).toFixed(2);
  });
  var jank = dts.filter(function (d) { return d > 20; }).length;
  var bad = dts.filter(function (d) { return d > 33; }).length;
  return {
    label: label, n: frames.length,
    avg: +(dts.reduce(function (a, b) { return a + b; }, 0) / dts.length).toFixed(2),
    p50: +pct(dts, 0.5).toFixed(2),
    p95: +pct(dts, 0.95).toFixed(2),
    max: +Math.max.apply(null, dts).toFixed(2),
    cbAvg: +(cbs.reduce(function (a, b) { return a + b; }, 0) / cbs.length).toFixed(2),
    cbP95: +pct(cbs, 0.95).toFixed(2),
    cbMax: +Math.max.apply(null, cbs).toFixed(2),
    jank: jank, bad: bad,
    jankPct: +((jank / dts.length) * 100).toFixed(1),
    per: avg
  };
}
function show(s) {
  if (!s.n) { console.log('  ' + s.label + ': 无样本'); return; }
  console.log('  ' + s.label + ': frames=' + s.n +
    ' | avg=' + s.avg + 'ms p50=' + s.p50 + ' p95=' + s.p95 + ' max=' + s.max +
    ' | jank(>20ms)=' + s.jank + ' (' + s.jankPct + '%) >33ms=' + s.bad);
  console.log('     脚本耗时/帧: avg=' + s.cbAvg + 'ms p95=' + s.cbP95 + ' max=' + s.cbMax + 'ms');
  console.log('     每帧: rafCb=' + s.per.cb + ' clearBoard=' + s.per.clrBoard +
    ' clearVfx=' + s.per.clrVfx + ' linGrad=' + s.per.lg + ' radGrad=' + s.per.rg +
    ' fill=' + s.per.fill + ' stroke=' + s.per.stroke + ' drawImage=' + s.per.img +
    ' save=' + s.per.save + ' clip=' + s.per.clip + ' gBCR=' + s.per.gbcr);
}

/* ---------- 主流程 ---------- */
async function main() {
  var PORT = 9700 + Math.floor(Math.random() * 200);
  var userDataDir = require('os').tmpdir() + '/stm-perf-' + Date.now();
  var flags = [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--window-size=420,900',
    '--allow-file-access-from-files',
    '--user-data-dir=' + userDataDir,
    'about:blank'
  ];
  if (!USE_GPU) flags.splice(3, 0, '--disable-gpu');
  var proc = cp.spawn(BROWSER, flags, { stdio: 'ignore' });

  var targets = null;
  for (var t = 0; t < 60; t++) {
    await sleep(250);
    try {
      targets = await new Promise(function (resolve, reject) {
        http.get('http://127.0.0.1:' + PORT + '/json/list', function (res) {
          var body = '';
          res.on('data', function (d) { body += d; });
          res.on('end', function () { resolve(JSON.parse(body)); });
        }).on('error', reject);
      });
      break;
    } catch (e) {}
  }
  if (!targets) { console.error('perf-probe: DevTools 端点未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });

  var url = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html?level=' + LEVEL;
  await c.send('Page.navigate', { url: url });

  var READY = '(function(){try{return (typeof STM==="object"&&STM.main&&STM.main.session&&STM.main.session())?"READY":"NO";}catch(e){return "NO";}})()';
  var ok = false;
  for (var w = 0; w < 200; w++) {
    var p = await c.send('Runtime.evaluate', { expression: READY, returnByValue: true });
    if (p.result.value === 'READY') { ok = true; break; }
    await sleep(50);
  }
  if (!ok) { console.error('perf-probe: 页面未就绪'); c.close(); proc.kill(); process.exit(2); }

  console.log('=== perf-probe | level=' + LEVEL + ' | gpu=' + (USE_GPU ? 'on' : 'off(--disable-gpu)') + ' ===\n');

  async function grab(label, from, ms) {
    await sleep(ms);
    var r = await c.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__perf.frames.slice(' + from + '))', returnByValue: true
    });
    return { label: label, frames: JSON.parse(r.result.value) };
  }
  async function len() {
    var r = await c.send('Runtime.evaluate', { expression: 'window.__perf.frames.length', returnByValue: true });
    return r.result.value;
  }

  /* ① 首次进关（深链自动进关，编舞可能已过——故紧接着做重置） */
  var m0 = await len();
  var g1 = await grab('① 进关稳态（编舞后）', m0, 900);

  /* 包裹 createBoardRenderer：统计后续每次重置**新建**了多少个渲染器实例。
   * 若无销毁机制，该计数 = 重置次数 → 泄漏的直接证据。 */
  await c.send('Runtime.evaluate', {
    expression: '(function(){window.__rc=0;var f=STM.createBoardRenderer;STM.createBoardRenderer=function(){window.__rc++;return f.apply(this,arguments);};return 1;})()',
    returnByValue: true
  });

  /* ② 重置关卡 → 编舞窗口（关键测量点） */
  await c.send('Runtime.evaluate', { expression: 'STM.main.enterGame(' + LEVEL + '); 1', returnByValue: true });
  var m1 = await len();
  var g2 = await grab('② 重置后编舞窗口（0~1200ms）', m1, 1200);

  /* ③ 重置后稳态 */
  var m2 = await len();
  var g3 = await grab('③ 重置后稳态（编舞结束后）', m2, 900);

  /* ③b 真正空闲（等 2.5s 无任何操作）——若仍在每帧重绘即为「rAF 空转」 */
  await sleep(2500);
  var mIdle = await len();
  var gIdle = await grab('③b 完全空闲（无操作 2.5s 后）', mIdle, 900);

  /* ④ 连续重置 3 次（检测渲染器泄漏累积） */
  async function state(tag) {
    var r = await c.send('Runtime.evaluate', {
      expression: '(function(){try{var r=STM.main.renderer();if(!r)return JSON.stringify({tag:"' + tag + '",renderer:null});' +
        'var d=r.dealStateOf?r.dealStateOf():null;' +
        'return JSON.stringify({tag:"' + tag + '",destroyed:r.isDestroyed?r.isDestroyed():null,' +
        'dealing:r.isDealing?r.isDealing():null,drawOrder:(r.drawOrderOf?r.drawOrderOf().length:-1),' +
        'deal:d,errs:(window.__perfErr||[]).length});}catch(e){return JSON.stringify({tag:"' + tag + '",err:String(e)});}})()',
      returnByValue: true
    });
    console.log('    [' + tag + '] ' + r.result.value);
  }
  await state('重置前');
  for (var k = 0; k < 3; k++) {
    await c.send('Runtime.evaluate', { expression: 'STM.main.enterGame(' + LEVEL + '); 1', returnByValue: true });
    /* 只等 350ms（编舞 440~1000ms）——确保第 3 次重置后采样窗口仍覆盖编舞期。
     * 原 700ms 会让采样起点落在编舞结束之后，测到的 clearBoard≈0 是采样错位，
     * 不是「渲染器停摆」（已用 dealStateOf 逐次确认 dealing=true）。 */
    if (k < 2) await sleep(350);
  }
  await state('重置#3');
  var m3 = await len();
  var g4 = await grab('④ 连续重置 3 次后编舞窗口', m3, 1100);

  var report = [g1, g2, g3, gIdle, g4].map(function (g) { return summarize(g.frames, g.label); });
  report.forEach(show);

  /* ---------- 门禁断言（R8 性能红线） ---------- */
  var fails = [];
  function need(cond, msg) { if (!cond) fails.push(msg); }
  var s1 = report[0], s2 = report[1], s3 = report[2], si = report[3], s4 = report[4];

  /* ① 单轨 RAF 锁：重置后 #board 每帧只能清一次（>1 = 有第二个循环在画同一画布） */
  need(s2.per.clrBoard <= 1.02, '② 重置后 clearRect(#board) = ' + s2.per.clrBoard + '/帧（>1 → 存在并发 RAF 循环）');
  need(s3.per.clrBoard <= 1.02, '③ 稳态 clearRect(#board) = ' + s3.per.clrBoard + '/帧（>1 → 存在并发 RAF 循环）');
  need(s4.per.clrBoard <= 1.05, '④ 连续重置 3 次后 clearRect(#board) = ' + s4.per.clrBoard + '/帧（>1 → 渲染器泄漏）');
  /* ② 每帧零渐变对象（卡面已改纯色填充） */
  need(s2.per.lg <= 0.05, '② 每帧 createLinearGradient = ' + s2.per.lg + '（应恒 0）');
  /* ③ 每帧零强制同步布局 */
  need(s2.per.gbcr <= 0.25, '② 每帧 getBoundingClientRect = ' + s2.per.gbcr + '（应恒 0，接缝几何须缓存）');
  /* ④ 帧预算：编舞窗口 p95 < 20ms，脚本耗时 p95/max 双红线 < 16ms */
  need(s2.p95 <= 20, '② 编舞窗口 p95 = ' + s2.p95 + 'ms（红线 20ms' + (USE_GPU ? '' : '；--no-gpu 软件光栅下该值天然抖动') + '）');
  need(s2.cbP95 < 16, '② 编舞窗口脚本耗时 p95 = ' + s2.cbP95 + 'ms（红线 16ms，与光栅无关的硬指标）');
  need(s2.cbMax < 16.7, '② 编舞窗口单帧脚本耗时 max = ' + s2.cbMax + 'ms（红线 16.7ms = 一个帧预算）');
  need(s2.jankPct <= 5, '② 编舞窗口掉帧率 = ' + s2.jankPct + '%（红线 5%）');
  /* ⑤ 空闲必须真的停（否则永久 60FPS 空转烧电） */
  need(si.per.clrBoard <= 0.02, '③b 空闲期 clearRect(#board) = ' + si.per.clrBoard + '/帧（应为 0，rAF 须停止）');

  /* 渲染器实例计数（检测 createBoardRenderer 泄漏） */
  var inst = await c.send('Runtime.evaluate', {
    expression: '(function(){try{var r=STM.main.renderer();return JSON.stringify({hasRenderer:!!r, dealing: r&&r.isDealing?r.isDealing():null, mode: r&&r.dealMode?r.dealMode():null, createdSinceWrap: window.__rc||0});}catch(e){return JSON.stringify({err:String(e)});}})()',
    returnByValue: true
  });
  console.log('\n当前渲染器: ' + inst.result.value);

  var errs = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__perfErr||[])', returnByValue: true });
  console.log('页面错误: ' + errs.result.value);

  var lt = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify((window.__perf.long||[]).slice(-12))', returnByValue: true
  });
  console.log('长任务(>50ms，末 12 条): ' + lt.result.value);

  c.close();
  proc.kill();

  console.log('');
  if (fails.length) {
    console.log('perf-probe: FAILED — ' + fails.length + ' 项超标');
    fails.forEach(function (f) { console.log('  ✗ ' + f); });
    process.exit(1);
  }
  console.log('perf-probe: all green（单轨 RAF / 零渐变分配 / 零逐帧布局读取 / 编舞窗口 60FPS / 空闲停帧）');
  process.exit(0);
}

main().catch(function (e) { console.error('perf-probe 失败:', e && e.message); process.exit(1); });
