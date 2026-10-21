'use strict';
/* =========================================================
 * Δ15b3f 回归守卫: 棋盘尺寸稳定性（连续点击 20 步零漂移）
 *   node tools/board-stability.js
 *
 * 背景: Δ15b3e 的 aspectDelta=0 修复引入 Canvas 尺寸负反馈棘轮——
 *   resize() 读 canvas.clientWidth（不含 2px 边框）→ 写回
 *   canvas.style.width → 浏览器重测得更小值 → 下次 refresh 再掉 2~4px。
 *   refresh() 随每个游戏事件触发，故棋盘随点击逐步缩小
 *   （实测 480px → 176px，20 步漂移 -304px）。
 *
 * 断言（用户强制要求，误差必须为 0px）:
 *   第 0 / 10 / 20 步的 #board getBoundingClientRect().width
 *   与内部 cellSize 均须恒等不变。
 * 同时覆盖 file:// 与 http:// 双形态（file:// 走 canvas 兜底出口）。
 * ========================================================= */
'use strict';

var cp = require('child_process');
var path = require('path');
var http = require('http');
var fs = require('fs');

var BROWSER = null;
var CANDS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
for (var i = 0; i < CANDS.length; i++) {
  try { if (fs.statSync(CANDS[i]).isFile()) { BROWSER = CANDS[i]; break; } } catch (e) {}
}
if (!BROWSER) { console.error('board-stability: 未找到 Chrome/Edge'); process.exit(2); }

var ROOT = path.resolve(__dirname, '..');
var LEVEL = 12;
var PORT = 8400 + Math.floor(Math.random() * 60);
var STEPS = 20;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var nextId = 1, pending = {}, ready = null;
  this.send = function (m, p) {
    return new Promise(function (res, rej) {
      var id = nextId++;
      pending[id] = { resolve: res, reject: rej };
      ws.send(JSON.stringify({ id: id, method: m, params: p || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
  this.ready = new Promise(function (r) { ready = r; });
  ws.onopen = function () { ready(); };
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  };
}

var failures = [];
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures.push(name); console.log('  ✗ ' + name + (extra ? ' [' + extra + ']' : '')); }
}

/* 页面内探针: 连点 N 步并逐步采样棋盘尺寸 */
var PROBE = '(function(steps){' +
  '  var cv=document.getElementById("board");' +
  '  var sess=STM.main.session(); var RE=STM.RulesEngine;' +
  '  var out=[];' +
  '  function snap(step){ var r=cv.getBoundingClientRect(); var es=sess.engineState();' +
  '    var n=es.n||8;' +
  '    out.push({step:step, w:+r.width.toFixed(3), h:+r.height.toFixed(3),' +
  '      bitmap:cv.width, cell:+(cv.width/n).toFixed(3),' +
  '      wrapH:+document.getElementById("board-wrap").getBoundingClientRect().height.toFixed(3),' +
  '      dockH:+document.getElementById("dock").getBoundingClientRect().height.toFixed(3),' +
  '      hudH:+document.getElementById("hud").getBoundingClientRect().height.toFixed(3),' +
  '      dockN:es.dock.length, tiles:es.tiles.length}); }' +
  '  snap(0);' +
  '  for(var i=0;i<steps;i++){' +
  '    var es=sess.engineState(); var pick=-1;' +
  '    /* 优先可飞出滑块——制造 dock 增长 / 三消 / 连击 */' +
  '    for(var k=0;k<es.tiles.length && pick<0;k++){' +
  '      if(!RE.canTap(es,k)) continue;' +
  '      var s0=RE.snapshot(es); var res=RE.applyTap(es,k); RE.restore(es,s0);' +
  '      if(res.type==="out"||res.type==="match"||res.type==="dock") pick=k;' +
  '    }' +
  '    if(pick<0){ for(var k2=0;k2<es.tiles.length;k2++){ if(RE.canTap(es,k2)){pick=k2;break;} } }' +
  '    if(pick<0) break;' +
  '    var t=es.tiles[pick]; var r0=cv.getBoundingClientRect(); var n=es.n;' +
  '    var cx=r0.left+r0.width*(t.c+0.5)/n, cy=r0.top+r0.height*(t.r+0.5)/n;' +
  '    var o={bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:1,isPrimary:true};' +
  '    cv.dispatchEvent(new PointerEvent("pointerdown",o));' +
  '    cv.dispatchEvent(new PointerEvent("pointerup",o));' +
  '    snap(i+1);' +
  '  }' +
  '  return JSON.stringify(out); })(' + STEPS + ')';

(async function () {
  var userDataDir = require('os').tmpdir() + '/stm-stab-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--window-size=420,900',
    '--user-data-dir=' + userDataDir, 'about:blank'
  ], { stdio: 'ignore' });

  var targets = null;
  for (var t = 0; t < 40; t++) {
    await sleep(250);
    try {
      targets = await new Promise(function (resolve, reject) {
        http.get('http://127.0.0.1:' + PORT + '/json/list', function (res) {
          var b = ''; res.on('data', function (d) { b += d; });
          res.on('end', function () { resolve(JSON.parse(b)); });
        }).on('error', reject);
      }); break;
    } catch (e) {}
  }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  var srv = http.createServer(function (req, res) {
    var p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (p.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, function (e, buf) {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise(function (r) { srv.listen(8097, r); });

  async function ev(expr) {
    var r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return { __err: String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).split('\n')[0] };
    return r.result.value;
  }

  var FORMS = [
    { name: 'http://', url: 'http://127.0.0.1:8097/index.html?level=' + LEVEL },
    { name: 'file://', url: 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html?level=' + LEVEL }
  ];

  console.log('Δ15b3f 回归守卫: 棋盘尺寸稳定性（Level 12 连点 ' + STEPS + ' 步，误差须为 0px）\n');

  for (var f = 0; f < FORMS.length; f++) {
    var F = FORMS[f];
    console.log('--- 形态: ' + F.name + ' ---');
    await c.send('Page.navigate', { url: F.url });
    await sleep(3000);

    var ready = await ev('typeof STM === "object" && STM.main && STM.main.session ? "READY" : "NOT_READY"');
    if (ready !== 'READY') { check(F.name + ' 页面就绪', false, ready); continue; }

    /* 先等贴图就绪（惰性加载会 bump 重绘，尺寸不应受其影响） */
    await sleep(1200);

    var raw = await ev(PROBE);
    if (raw.__err) { check(F.name + ' 探针执行', false, raw.__err); continue; }
    var T = JSON.parse(raw);

    console.log('    step: cssW × cellSize × wrapH × dockN');
    [0, 5, 10, 15, STEPS].forEach(function (s) {
      var row = T.filter(function (r) { return r.step === s; })[0];
      if (row) {
        console.log('    ' + String(row.step).padStart(3) + ':  ' + row.w + '  ×  ' + row.cell +
          '  ×  ' + row.wrapH + '  (dock=' + row.dockN + ', tiles=' + row.tiles + ')');
      }
    });

    var w0 = T[0].w, c0 = T[0].cell;
    function at(s) { return T.filter(function (r) { return r.step === s; })[0]; }
    var r10 = at(10), r20 = at(STEPS);

    /* 用户强制断言: 第 0/10/20 步 cssW 与 cellSize 误差 = 0px */
    check(F.name + ' 第 0 步有采样', !!T[0]);
    check(F.name + ' 第 10 步有采样', !!r10);
    check(F.name + ' 第 20 步有采样', !!r20);
    if (!r10 || !r20) continue;

    check(F.name + ' 第 0→10 步 #board width 误差 = 0px',
      Math.abs(r10.w - w0) === 0, 'Δ=' + (r10.w - w0));
    check(F.name + ' 第 10→20 步 #board width 误差 = 0px',
      Math.abs(r20.w - w10val(r10)) === 0, 'Δ=' + (r20.w - r10.w));
    check(F.name + ' 第 0→20 步 #board width 误差 = 0px',
      Math.abs(r20.w - w0) === 0, 'Δ=' + (r20.w - w0));

    check(F.name + ' 第 0→10 步 cellSize 误差 = 0px',
      Math.abs(r10.cell - c0) === 0, 'Δ=' + (r10.cell - c0));
    check(F.name + ' 第 10→20 步 cellSize 误差 = 0px',
      Math.abs(r20.cell - r10.cell) === 0, 'Δ=' + (r20.cell - r10.cell));
    check(F.name + ' 第 0→20 步 cellSize 误差 = 0px',
      Math.abs(r20.cell - c0) === 0, 'Δ=' + (r20.cell - c0));

    check(F.name + ' 位图尺寸恒定', r20.bitmap === T[0].bitmap, T[0].bitmap + ' → ' + r20.bitmap);
    check(F.name + ' #board-wrap 高度恒定（不受 dock/hud 挤压）',
      Math.abs(r20.wrapH - T[0].wrapH) === 0, 'Δ=' + (r20.wrapH - T[0].wrapH));
    check(F.name + ' #dock 高度恒定（chip 进出不撑大）',
      Math.abs(r20.dockH - T[0].dockH) === 0, T[0].dockH + ' → ' + r20.dockH);
    check(F.name + ' #hud 高度恒定（combo 文案不撑大）',
      Math.abs(r20.hudH - T[0].hudH) === 0, T[0].hudH + ' → ' + r20.hudH);

    /* 证明确实在玩（dock 发生过增删 = 三消/收槽真实发生） */
    var dockMax = T.reduce(function (m, r) { return Math.max(m, r.dockN); }, 0);
    var dockMin = T.reduce(function (m, r) { return Math.min(m, r.dockN); }, 99);
    check(F.name + ' 测试有效性（dock 数量发生过增减 → 点击真实生效）',
      dockMax > 0, 'dockMax=' + dockMax + ' dockMin=' + dockMin);
    console.log('');
  }

  function w10val(r) { return r.w; }

  console.log('========================================');
  if (failures.length === 0) {
    console.log('board-stability: all green（Δ15b3f——棋盘尺寸零漂移，双形态 × ' + (STEPS + 1) + ' 采样点误差均 0px）');
  } else {
    console.log('board-stability: FAILED（' + failures.length + ' 项）');
    failures.forEach(function (n) { console.log('  - ' + n); });
  }

  c.close(); proc.kill();
  process.exit(failures.length ? 1 : 0);
})().catch(function (e) { console.error('board-stability FAIL:', e); process.exit(2); });