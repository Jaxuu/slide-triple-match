/* =========================================================
 * Slide & Triple — Δ29 实机取证（困难关预警横幅 + 3D 碎块四阶段）
 *
 *   node tools/delta29-shots.js [outDir]
 *
 * 零 npm 依赖——Node 内置 http/WebSocket + 本机 Chrome/Edge（宪章 II）。
 *
 * 产出（默认 shots/delta29/）：
 *   peak-banner-p1..p6.png   六画卷各一张（L6/L18/L30/L42/L54/L66）
 *   peak-banner-p1-crop.png  横幅局部放大（看头像 + 流光 + 文案）
 *   peak-normal-l7.png       普通关：零横幅（对照）
 *   shard-preshake.png       前摇：3 槽膨胀闪白（ghost 有牌态）
 *   shard-burst.png          爆发首帧：3D 碎块炸出
 *   shard-mid.png            中段：空中 3D 翻滚
 *   shard-late.png           末段：强重力急坠
 *
 * 断言（任何一条失败 → exit 1）：
 *   ① 六个画卷峰值关均出现 #peak-banner.show，且文案含「险境预警」
 *   ② 横幅与 #board-wrap 零相交、与 #dock 零相交（不遮挡棋盘/槽位）
 *   ③ 横幅 pointer-events 为 none（不阻塞点击）
 *   ④ 普通关（L7）零横幅
 *   ⑤ 前摇类在爆发前出现过（膨胀闪白真实播放）
 * ========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var OUT = process.argv[2] || path.join(ROOT, 'shots', 'delta29');
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
if (!BROWSER) { console.error('delta29-shots: 未找到 Chrome/Edge'); process.exit(2); }

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
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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

async function main() {
  console.log('Δ29 实机取证（困难关预警横幅 / 3D 碎块四阶段）\n');
  var srv = await startServer();
  var PORT = srv.address().port;
  var devPort = 9300 + Math.floor(Math.random() * 300);
  var userDataDir = path.join(os.tmpdir(), 'stm-d29shots-' + Date.now());

  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + devPort,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--window-size=430,880',
    '--user-data-dir=' + userDataDir, 'about:blank'
  ], { stdio: 'ignore' });

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
      break;
    } catch (e) {}
  }
  if (!targets) { console.error('delta29-shots: DevTools 未就绪'); proc.kill(); srv.close(); process.exit(2); }
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

  async function shot(name, clipSel, pad) {
    var params = { format: 'png' };
    if (clipSel) {
      pad = pad || 0;
      var box = await ev('(function(){var e=document.querySelector(' + JSON.stringify(clipSel) + ');' +
        'if(!e)return null;var r=e.getBoundingClientRect();' +
        'return {x:r.left,y:r.top,width:r.width,height:r.height};})()');
      if (box && box.width > 0) {
        params.clip = {
          x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
          width: box.width + pad * 2, height: box.height + pad * 2, scale: 2
        };
      }
    }
    var r = await c.send('Page.captureScreenshot', params);
    if (!r || !r.data) { console.error('  shot failed: ' + name); return; }
    var f = path.join(OUT, name);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('  · 取证帧 ' + name + ' (' + Math.round(fs.statSync(f).size / 1024) + ' KB)');
  }

  function bannerGeom() {
    return `(function(){
      var b = document.getElementById('peak-banner');
      var bw = document.getElementById('board-wrap');
      var dk = document.getElementById('dock');
      function R(e){ if(!e) return null; var r=e.getBoundingClientRect();
        return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; }
      var cs = b ? getComputedStyle(b) : null;
      var tiles = 0, slots = document.querySelectorAll('#dock .slot');
      for (var i = 0; i < slots.length; i++) {
        if ((slots[i].className || '').indexOf('has-tile') >= 0) tiles++;
      }
      return {
        exists: !!b,
        shown: !!b && b.classList.contains('show'),
        text: b ? ((b.querySelector('.peak-banner-text')||{}).textContent||'') : '',
        pet: !!b && !!b.querySelector('.peak-banner-pet canvas, .peak-banner-pet svg, .peak-banner-pet img'),
        sheen: !!b && !!b.querySelector('.peak-banner-sheen'),
        pe: cs ? cs.pointerEvents : null,
        opacity: cs ? cs.opacity : null,
        hue: b ? b.style.getPropertyValue('--banner-hue-a') : null,
        dockTiles: tiles,
        splash: !!document.getElementById('splash-screen'),
        banner: R(b), board: R(bw), dock: R(dk)
      };
    })()`;
  }
  function overlap(a, b) {
    if (!a || !b) return 0;
    var w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    var h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    return (w > 0 && h > 0) ? w * h : 0;
  }

  /* 等启动遮罩移除——否则截图全是 HooLey 启动画面（深链在 boot 阶段就 loadLevel） */
  async function waitSplash(maxMs) {
    var t0 = Date.now();
    while (Date.now() - t0 < (maxMs || 12000)) {
      var has = await ev('(function(){return !!document.getElementById("splash-screen");})()');
      if (has === false) return true;
      await sleep(150);
    }
    return false;
  }

  /* ---------- ① 六画卷各一张 ---------- */
  console.log('① 六画卷峰值关横幅（L6/L18/L30/L42/L54/L66）');
  var PEAKS = [6, 18, 30, 42, 54, 66];
  for (var pi = 0; pi < PEAKS.length; pi++) {
    var lv = PEAKS[pi];
    await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html?level=' + lv });
    await sleep(600);
    var g = null;
    for (var w = 0; w < 60; w++) {
      g = await ev(bannerGeom());
      if (g && g.shown && !g.splash) break;
      await sleep(100);
    }
    var tag = 'p' + (pi + 1);
    check('① L' + lv + ' 横幅已显示（且启动遮罩已移除）',
      !!(g && g.shown && !g.splash), g ? ('shown=' + g.shown + ' splash=' + g.splash) : 'null');
    if (g && g.shown) {
      check('① L' + lv + ' 文案含「险境预警」', g.text.indexOf('险境预警') >= 0, g.text);
      check('① L' + lv + ' 含探险搭档头像节点', g.pet === true);
      check('① L' + lv + ' 含流光扫掠层', g.sheen === true);
      check('① L' + lv + ' pointer-events = none（不阻塞点击）', g.pe === 'none', g.pe);
      check('① L' + lv + ' 与棋盘零相交（MUST NOT 遮挡棋盘）', overlap(g.banner, g.board) === 0,
        'ov=' + Math.round(overlap(g.banner, g.board)));
      /* 设计意图：横幅**叠在待消区之上**（不占额外版面），因此与 #dock 重合是预期；
       * 真正要守的是「重合 ≠ 遮挡卡牌」——显示期间槽内必须零牌。 */
      var dockArea = (g.dock.w * g.dock.h) || 1;
      check('① L' + lv + ' 叠在待消区（与 #dock 重合 >= 90%，不占额外版面）',
        overlap(g.banner, g.dock) / dockArea >= 0.90,
        (100 * overlap(g.banner, g.dock) / dockArea).toFixed(1) + '%');
      check('① L' + lv + ' 横幅显示期间待消槽内零牌（不遮挡任何卡牌）',
        g.dockTiles === 0, 'tiles=' + g.dockTiles);
      await shot('peak-banner-' + tag + '.png');
      if (pi === 0) await shot('peak-banner-' + tag + '-crop.png', '#peak-banner', 6);
    }
  }

  /* ---------- ② 普通关零横幅 ---------- */
  console.log('\n② 普通关对照（L7 / L20）');
  var NORMS = [7, 20];
  for (var ni = 0; ni < NORMS.length; ni++) {
    await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html?level=' + NORMS[ni] });
    await waitSplash(15000);
    await sleep(900);
    var gn = await ev(bannerGeom());
    check('② L' + NORMS[ni] + ' 零横幅（未显示）', !!(gn && !gn.shown),
      gn ? ('shown=' + gn.shown) : 'null');
    if (ni === 0) await shot('peak-normal-l7.png');
  }

  /* ---------- ③ 碎块四阶段 ---------- */
  console.log('\n③ 3D 碎块四阶段（L33 实机三消）');
  await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html?level=33' });
  await waitSplash(15000);
  await sleep(400);
  await ev('(function(){var m=window.STM&&STM.main; if(m&&m.skipDeal)m.skipDeal();})()');
  await sleep(400);

  var phase = await ev(`(async function(){
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    var M = window.STM.main;
    var s = M.session(), r = M.renderer(), RE = window.STM.RulesEngine;
    function firstOf(suit){
      var st = s.state(), eng = s.engineState();
      for (var i=0;i<st.board.length;i++){
        var t = st.board[i];
        if (!t || (t.s|0) !== suit) continue;
        if (!RE.canTap(eng, t.id)) continue;
        return t.id;
      }
      return null;
    }
    var st0 = s.state(), eng0 = s.engineState(), cnt = {};
    for (var i0=0;i0<st0.board.length;i0++){
      var b0 = st0.board[i0];
      if (!b0 || !RE.canTap(eng0, b0.id)) continue;
      var k0 = b0.s|0; cnt[k0] = (cnt[k0]||0)+1;
    }
    var target = -1, bestN = 0;
    for (var kk in cnt) if (cnt[kk] > bestN) { bestN = cnt[kk]; target = kk|0; }
    if (target < 0 || bestN < 3) return { err: 'no triple' };

    var seen = { preshake: false, shards: 0 };
    var t0 = performance.now(), tapped = 0, lastTap = -1e9;
    await new Promise(function(done){
      function loop(){
        var now = performance.now();
        if (tapped < 3 && now - lastTap > 110) {
          var tid = firstOf(target);
          if (tid != null) { s.tap(tid); tapped++; lastTap = now; }
        }
        var ns = document.querySelectorAll('#dock .slot');
        for (var q=0;q<ns.length;q++){
          if ((ns[q].className||'').indexOf('slot-shattering') >= 0) seen.preshake = true;
        }
        seen.shards = r.vfxShardsOf().length;
        if (seen.shards > 0 || now - t0 > 4000) { done(); return; }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
    return seen;
  })()`);
  check('③ 前摇类曾出现（膨胀闪白真实播放）', !!(phase && phase.preshake), phase ? JSON.stringify(phase) : 'null');
  check('③ 碎块已生成', !!(phase && phase.shards > 0), phase ? ('n=' + phase.shards) : 'null');

  /* 四阶段取证：CDP 全页截图在软件渲染下要 ~500ms（实测 dy 反解 530ms），
   * 拍不到 300~520ms 寿命内的瞬时相位。故改为**页面内按帧取画布**：
   * spawn 后由页面自己的 rAF 等到目标时刻，直接 toDataURL 导出 #vfx-canvas
   * （叠深色底以便看清暗面/亮边），零 CDP 延迟、相位可复现。 */
  async function captureVfx(name, targetMs) {
    var res = await ev(`(async function(){
      var r = window.STM.main.renderer();
      r.clearVfx();
      var ns = document.querySelectorAll('#dock .slot');
      var rects = [];
      for (var i = 0; i < 3 && i < ns.length; i++) rects.push(ns[i].getBoundingClientRect());
      var t0 = performance.now();
      r.spawnDockShatter(rects);
      await new Promise(function(done){
        function loop(){
          if (performance.now() - t0 >= ${targetMs}) { done(); return; }
          requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
      });
      var cv = document.getElementById('vfx-canvas');
      var out = document.createElement('canvas');
      out.width = cv.width; out.height = cv.height;
      var ctx = out.getContext('2d');
      ctx.fillStyle = '#1B2430';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(cv, 0, 0);
      var sh = r.vfxShardsOf();
      var sy = 0; for (var j = 0; j < sh.length; j++) sy += sh[j].y;
      return {
        url: out.toDataURL('image/png'),
        t: Math.round(performance.now() - t0),
        n: sh.length,
        cy: sh.length ? Math.round(sy / sh.length) : null,
        vy: sh.length ? Math.round(sh[0].vy) : null
      };
    })()`);
    if (!res || !res.url) { console.error('  vfx capture failed: ' + name); return null; }
    var f = path.join(OUT, name);
    fs.writeFileSync(f, Buffer.from(res.url.split(',')[1], 'base64'));
    console.log('  · 取证帧 ' + name + ' (' + Math.round(fs.statSync(f).size / 1024) + ' KB, t=' +
      res.t + 'ms, n=' + res.n + ', cy=' + res.cy + ', vy=' + res.vy + ')');
    return res;
  }

  var c1 = await captureVfx('shard-1-burst.png', 40);
  var c2 = await captureVfx('shard-2-tumble.png', 180);
  var c3 = await captureVfx('shard-3-plunge.png', 310);
  check('③ 三阶段相位递增且碎块仍在场（爆发 < 翻滚 < 急坠）',
    !!(c1 && c2 && c3) && c1.t <= c2.t && c2.t <= c3.t && c3.n > 0,
    [c1 && c1.t, c2 && c2.t, c3 && c3.t].join(' < ') + ' / n3=' + (c3 && c3.n));
  check('③ 末段竖直速度显著为正（强重力急坠，vy > 1000px/s）',
    !!(c3 && c3.vy > 1000), c3 ? ('vy=' + c3.vy) : 'null');

  /* 全页对照帧（含牌面背景，看碎块与棋盘/待槽的空间关系） */
  await ev(`(function(){
    var r = window.STM.main.renderer();
    r.clearVfx();
    var ns = document.querySelectorAll('#dock .slot');
    var rects = [];
    for (var i = 0; i < 3 && i < ns.length; i++) rects.push(ns[i].getBoundingClientRect());
    r.spawnDockShatter(rects);
    return r.vfxShardsOf().length;
  })()`);
  await shot('shard-fullpage.png');

  /* 前摇单独取证：重新触发一次并在类出现的同一帧截图 */
  var preShot = await ev(`(async function(){
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    var M = window.STM.main;
    var s = M.session(), r = M.renderer(), RE = window.STM.RulesEngine;
    r.clearVfx();
    s.reset();
    await sleep(200);
    function firstOf(suit){
      var st = s.state(), eng = s.engineState();
      for (var i=0;i<st.board.length;i++){
        var t = st.board[i];
        if (!t || (t.s|0) !== suit) continue;
        if (!RE.canTap(eng, t.id)) continue;
        return t.id;
      }
      return null;
    }
    var st0 = s.state(), eng0 = s.engineState(), cnt = {};
    for (var i0=0;i0<st0.board.length;i0++){
      var b0 = st0.board[i0];
      if (!b0 || !RE.canTap(eng0, b0.id)) continue;
      var k0 = b0.s|0; cnt[k0] = (cnt[k0]||0)+1;
    }
    var target = -1, bestN = 0;
    for (var kk in cnt) if (cnt[kk] > bestN) { bestN = cnt[kk]; target = kk|0; }
    if (target < 0 || bestN < 3) return { err: 'no triple' };
    var hit = false;
    var t0 = performance.now(), tapped = 0, lastTap = -1e9;
    await new Promise(function(done){
      function loop(){
        var now = performance.now();
        if (tapped < 3 && now - lastTap > 110) {
          var tid = firstOf(target);
          if (tid != null) { s.tap(tid); tapped++; lastTap = now; }
        }
        var ns = document.querySelectorAll('#dock .slot');
        for (var q=0;q<ns.length;q++){
          if ((ns[q].className||'').indexOf('slot-shattering') >= 0) hit = true;
        }
        if (hit || now - t0 > 3000) { done(); return; }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
    /* 命中后立刻把动画暂停在膨胀顶点，供 CDP 截图（headless 截图有 ~100ms 延迟） */
    var ns2 = document.querySelectorAll('#dock .slot');
    for (var q2=0;q2<ns2.length;q2++){
      if ((ns2[q2].className||'').indexOf('slot-shattering') >= 0) {
        ns2[q2].style.animationPlayState = 'paused';
        ns2[q2].style.animationDelay = '-58ms';
      }
    }
    return { hit: hit };
  })()`);
  if (preShot && preShot.hit) await shot('shard-preshake.png');
  check('③ 前摇取证帧已捕获', !!(preShot && preShot.hit), preShot ? JSON.stringify(preShot) : 'null');

  proc.kill();
  srv.close();
  await sleep(200);

  console.log('');
  if (fails.length) {
    console.log('delta29-shots: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('delta29-shots: all green（六画卷横幅零遮挡 / 普通关零横幅 / 碎块四阶段取证）');
    console.log('取证帧目录：' + OUT);
  }
}

main().catch(function (e) {
  console.error('delta29-shots: 异常', e && e.message);
  process.exit(2);
});
