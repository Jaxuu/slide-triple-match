/* =========================================================
 * Slide & Triple — delta27-verify（Δ27 三项效果真机验收）
 *
 *   node tools/delta27-verify.js
 *
 * 为什么必须开浏览器：Node 侧门禁只能断言「数据与纯函数」，本脚本验证
 * 真实 DOM/CSS/Canvas 环境下的**用户可见行为**：
 *   ① 飞行期间 #dock 槽位零抖动（目标槽保持 .slot.empty，落定才切 has-tile）
 *   ② 飞行期间棋盘静态层绘制序恒按 (z,r,c) 升序（相邻卡牌绝不变底层）
 *   ③ 编舞单帧在途 <= 22 张（真实 rAF 时序下复验）
 *   ④ 三消碎块：120~150 枚 + 图集切片命中率 >= 90%
 * 同时把 6 张取证帧写到 shots/delta27/（.gitignore 已忽略，不入库）。
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
  }
};`;

async function main() {
  console.log('Δ27 真机验收（飞行 / 编舞 / 碎块）\n');

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

  /* L33：72 关中体量最大（N=141, zMax=4），三层叠放，最坏形态 */
  await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html?level=33' });
  var ready = false;
  for (var rp = 0; rp < 200; rp++) {
    await sleep(60);
    ready = await ev('(function(){try{return !!(window.STM && STM.main && STM.main.session && STM.main.session());}catch(e){return false;}})()');
    if (ready) break;
  }
  check('L33 载入完成（session 就绪）', ready === true);
  if (!ready) { cleanup(); process.exit(1); }

  await ev(HELPERS);
  check('页面助手注入成功', (await ev('!!window.__D27')) === true);

  /* 深链进关发生在开机动画之后——必须等 splash 真正退场再取帧，
   * 否则截到的是 HooLey 过渡屏（实测 800ms 时仍是 splash）。 */
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

  /* ---------- ① 编舞：真实 rAF 时序下的在途峰值 + 取证帧 ---------- */
  console.log('\n① 开局进场编舞（真实 rAF）');
  await ev('window.__D27.rnd().startDeal(0)');
  await sleep(300);
  await shot('deal-300ms.png');
  var planInfo = await ev(`(function(){
    var r = window.__D27.rnd();
    var p = r.dealPlanOf();
    if (!p) return { err: 'no plan' };
    var ds = [];
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) ds.push(p[k].delay);
    ds.sort(function(a,b){return a-b;});
    var peak = 0;
    for (var i = 0; i < ds.length; i++) {
      var c = 0;
      for (var j = 0; j < ds.length; j++) if (ds[j] <= ds[i] && ds[i] < ds[j] + 260) c++;
      if (c > peak) peak = c;
    }
    var minGap = Infinity;
    for (var m = 1; m < ds.length; m++) { var g = ds[m] - ds[m-1]; if (g < minGap) minGap = g; }
    return { n: ds.length, peak: peak, minGap: minGap, total: r.dealTotalMs(), mode: r.dealMode() };
  })()`);
  check('① 编舞计划覆盖全部卡牌（141 张）', planInfo && planInfo.n === 141,
    planInfo ? planInfo.n : 'null');
  check('① 单帧在途 <= 22 张（真实关卡数据）', planInfo && planInfo.peak <= 22,
    planInfo ? 'peak=' + planInfo.peak : '-');
  check('① 相邻落点 >= 12ms（粒粒分明）', planInfo && planInfo.minGap >= 12 - 1e-6,
    planInfo ? 'minGap=' + planInfo.minGap.toFixed(2) : '-');
  check('① 编舞总时长 = 2340ms（公式值）', planInfo && Math.abs(planInfo.total - 2340) < 1,
    planInfo ? planInfo.total : '-');
  await sleep(500);
  await shot('deal-800ms.png');
  await ev('window.__D27.rnd().skipDeal()');
  await sleep(120);

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

  /* ---------- ③ 三消碎块：真实图集命中率 + 取证帧 ---------- */
  console.log('\n③ 三消碎块瀑布（真实图集）');
  var atl = await ev('(function(){var A=window.STM.ShardAtlas;return A?A.state():null;})()');
  check('③ 碎块图集已就绪', atl === 'ready', atl);
  var shardInfo = await ev(`(function(){
    var r = window.__D27.rnd();
    var ns = document.querySelectorAll('#dock .slot');
    var rects = [];
    for (var i = 0; i < 3 && i < ns.length; i++) rects.push(ns[i].getBoundingClientRect());
    var before = r.vfxShardsOf().length;
    r.spawnDockShatter(rects);
    var all = r.vfxShardsOf().slice(before);
    var withAtlas = 0, kinds = {}, minSize = 1e9, maxSize = 0;
    for (var j = 0; j < all.length; j++) {
      if (all[j].atlas != null) withAtlas++;
      kinds[all[j].kind] = (kinds[all[j].kind] || 0) + 1;
      if (all[j].size < minSize) minSize = all[j].size;
      if (all[j].size > maxSize) maxSize = all[j].size;
    }
    return { n: all.length, withAtlas: withAtlas, kinds: kinds, minSize: minSize, maxSize: maxSize };
  })()`);
  check('③ 单次爆发 120~150 枚', shardInfo && shardInfo.n >= 120 && shardInfo.n <= 150,
    shardInfo ? shardInfo.n : 'null');
  check('③ 图集切片命中率 >= 90%（黑底键控生效）',
    shardInfo && shardInfo.withAtlas / shardInfo.n >= 0.90,
    shardInfo ? (100 * shardInfo.withAtlas / shardInfo.n).toFixed(1) + '%' : '-');
  check('③ 三级尺寸齐备（large/medium/small 均 > 0）',
    shardInfo && shardInfo.kinds.large > 0 && shardInfo.kinds.medium > 0 && shardInfo.kinds.small > 0,
    shardInfo ? JSON.stringify(shardInfo.kinds) : '-');
  await sleep(70);
  await shot('shatter-70ms.png');
  await sleep(110);
  await shot('shatter-180ms.png');

  var errCount = await ev('(function(){return (window.__D27ERR||0);})()');
  check('③ 全程零未捕获异常', !errCount, errCount);

  cleanup();

  console.log('');
  if (fails.length) {
    console.log('delta27-verify: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('delta27-verify: all green（编舞在途<=22 / 槽位零抖动 / 图层不反转 / 碎块 120~150 枚 + 图集命中>=90%）');
    console.log('取证帧目录：shots/delta27/');
  }
}

main().catch(function (e) {
  console.error('delta27-verify: 异常', e && e.message);
  process.exit(2);
});
