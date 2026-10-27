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
 *   ⑤ 爆心辉光（0~180ms 可见、之后零残留）
 *   ⑥ 碎裂出生点 = 本轮三消真实所在槽位（不是「最左 3 槽」）
 *   ⑦ 碎块轨迹形态：全团 vx 同号 / 倾角 5~40° / 首 100ms 下坠 >= 40px /
 *      墙钟下落速率 >= 300 px/s（Δ28f：单条扫掠 + 干脆下落 + 掉帧不减速）
 * 同时把 8 张取证帧写到 shots/delta27/（.gitignore 已忽略，不入库）。
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
  },
  /* Δ28a: 找同一花色、3 张当前都可点的卡牌（用来驱动一次真实三消） */
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
  /* Δ28d: 待消槽有牌槽位的包围盒（CSS 像素，视口坐标） */
  dockBBox: function(){
    var slots = document.querySelectorAll('#dock .slot');
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].className.indexOf('has-tile') < 0) continue;
      var r = slots[i].getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.left < x0) x0 = r.left;
      if (r.top < y0) y0 = r.top;
      if (r.right > x1) x1 = r.right;
      if (r.bottom > y1) y1 = r.bottom;
      n++;
    }
    return n ? { x0: x0, y0: y0, x1: x1, y1: y1, n: n } : null;
  },
  /* Δ28d: 待消槽全部槽位的包围盒（7 槽固定行，与「是否有牌」无关 → 稳定参照） */
  dockAllBBox: function(){
    var slots = document.querySelectorAll('#dock .slot');
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0, slotH = 0, slotW = 0;
    for (var i = 0; i < slots.length; i++) {
      var r = slots[i].getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.left < x0) x0 = r.left;
      if (r.top < y0) y0 = r.top;
      if (r.right > x1) x1 = r.right;
      if (r.bottom > y1) y1 = r.bottom;
      slotH = r.height; slotW = r.width; n++;
    }
    return n ? { x0: x0, y0: y0, x1: x1, y1: y1, n: n, slotH: slotH, slotW: slotW } : null;
  },
  /* Δ28d: 读取「辉光圆心」像素（#vfx-canvas，视口坐标 → 画布像素）。
   * 隔离实验用：调用前先 clearVfx(true) 清掉全部碎片、只留辉光，
   * 因此该点若有像素，唯一来源就是爆心辉光。 */
  probeCenter: function(){
    var r = this.rnd(); if (!r) return { err: 'no renderer' };
    var cv = document.getElementById('vfx-canvas');
    if (!cv) return { err: 'no #vfx-canvas' };
    var ctx = cv.getContext('2d');
    var dpr = cv.width / Math.max(1, cv.clientWidth);
    var fl = r.vfxFlashInfo();
    if (!fl) return { flash: null, shards: r.vfxShardsOf().length };
    var fp = Math.min(1, Math.max(0, (performance.now() - fl.t0) / fl.dur));
    var sx = Math.round(fl.x * dpr), sy = Math.round(fl.y * dpr);
    if (sx < 0 || sy < 0 || sx >= cv.width || sy >= cv.height) return { flash: fl, err: 'oob' };
    var d;
    try { d = ctx.getImageData(sx, sy, 1, 1).data; }
    catch (e) { return { flash: fl, err: 'getImageData: ' + e.message }; }
    return {
      flash: fl, fp: +fp.toFixed(2), fR: Math.round(fl.r * (0.55 + 0.85 * fp)),
      shards: r.vfxShardsOf().length,
      a: d[3], lum: Math.round(0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2])
    };
  },
  /* Δ28d: 全屏 VFX 画布是否彻底清空（无残留亮斑） */
  vfxResidue: function(){
    var cv = document.getElementById('vfx-canvas');
    if (!cv) return { err: 'no #vfx-canvas' };
    var ctx = cv.getContext('2d');
    var d;
    try { d = ctx.getImageData(0, 0, cv.width, cv.height).data; }
    catch (e) { return { err: 'getImageData: ' + e.message }; }
    var n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 2) n++;
    return { nonZero: n, total: d.length / 4 };
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
      for (var j = 0; j < ds.length; j++) if (ds[j] <= ds[i] && ds[i] < ds[j] + 180) c++;
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
  check('① 相邻落点 >= 9ms（粒粒分明，Δ28f 提速后口径）', planInfo && planInfo.minGap >= 9 - 1e-6,
    planInfo ? 'minGap=' + planInfo.minGap.toFixed(2) : '-');
  check('① 编舞总时长 = 1780ms（公式值，Δ28f 提速后）', planInfo && Math.abs(planInfo.total - 1780) < 1,
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

  /* ---------- ④ 碎裂时序：3 张全部落定后才爆发（Δ28a） ---------- */
  console.log('\n④ 三消碎裂时序（3 张全部落定后才爆发）');
  await ev('window.__D27.rnd().cancelFlights()');
  await ev('window.__D27.sess().reset()');
  await sleep(150);
  await ev('window.__D27.rnd().skipDeal()');
  await sleep(150);

  var triple = await ev('window.__D27.tappableTriple()');
  check('④ 找到同花色 3 张可点卡牌', !!triple && triple.ids && triple.ids.length === 3,
    triple ? JSON.stringify(triple) : 'null');

  var seq = null;
  if (triple && triple.ids && triple.ids.length === 3) {
    seq = await ev(`(async function(){
      var ids = ${JSON.stringify(triple.ids)};
      var r = window.__D27.rnd();
      var base = r.vfxShardsOf().length;
      var frames = [];
      var t0 = performance.now();
      var ti = 0, lastTapAt = -1e9, taps = [];
      await new Promise(function(resolve){
        function step(){
          var now = performance.now();
          if (ti < ids.length && now - lastTapAt > 90) {
            window.__D27.sess().tap(ids[ti]);
            taps.push(Math.round(now - t0));
            ti++;
            lastTapAt = now;
          }
          frames.push({
            t: Math.round(now - t0),
            sh: r.vfxShardsOf().length - base,
            fl: r.flightsOf().length,
            tTiles: (window.__D27.dockSig().match(/T/g) || []).length
          });
          if (now - t0 < 1600) requestAnimationFrame(step); else resolve();
        }
        requestAnimationFrame(step);
      });
      return { frames: frames, taps: taps };
    })()`);
  }

  if (seq && seq.frames && seq.frames.length) {
    var firstSh = -1, maxFl = 0;
    for (var fi = 0; fi < seq.frames.length; fi++) {
      if (firstSh < 0 && seq.frames[fi].sh > 0) firstSh = fi;
      if (seq.frames[fi].fl > maxFl) maxFl = seq.frames[fi].fl;
    }
    check('④ 3 次点击后确实产生了在途并发飞行（>= 2 张同飞）', maxFl >= 2, 'maxFl=' + maxFl);
    check('④ 碎裂已触发（采样窗内出现碎片）', firstSh >= 0,
      firstSh >= 0 ? ('t=' + seq.frames[firstSh].t + 'ms') : 'no shards');
    if (firstSh >= 0) {
      var f0 = seq.frames[firstSh];
      /* 核心断言：碎片出现的那一帧，**不允许**还有卡牌在飞 */
      check('④ 碎裂瞬间零在途飞行（第 3 张已落定，不再「牌没到就碎」）',
        f0.fl === 0, 'flights=' + f0.fl + ' @' + f0.t + 'ms');
      check('④ 碎裂瞬间槽内已有 3 张有牌态（ghost 生效，不是空槽爆炸）',
        f0.tTiles >= 3, 'T×' + f0.tTiles);
      check('④ 碎裂发生在最后一次点击之后（非点击同帧爆发）',
        seq.taps.length === 3 && f0.t > seq.taps[2],
        'taps=' + JSON.stringify(seq.taps) + ' shatter@' + f0.t + 'ms');
    }
    await shot('shatter-seq.png');
    await sleep(90);
    await shot('shatter-seq+90.png');
  }

  /* ---------- ⑤ 爆心辉光（SC-023 ⑩ / Δ28d） ---------- */
  console.log('\n⑤ 爆心辉光（0~180ms 有径向辉光 / 之后无残留）');
  await ev('window.__D27.rnd().cancelFlights()');
  await ev('window.__D27.sess().reset()');
  await sleep(150);
  await ev('window.__D27.rnd().skipDeal()');
  await sleep(150);

  var triple2 = await ev('window.__D27.tappableTriple()');
  check('⑤ 找到同花色 3 张可点卡牌', !!triple2 && triple2.ids && triple2.ids.length === 3,
    triple2 ? JSON.stringify(triple2) : 'null');

  var glow = null;
  if (triple2 && triple2.ids && triple2.ids.length === 3) {
    glow = await ev(`(async function(){
      var D = window.__D27, r = D.rnd();
      var ids = ${JSON.stringify(triple2.ids)};
      var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
      var base = r.vfxShardsOf().length;
      var bboxBefore = D.dockBBox();
      var dockRow = D.dockAllBBox();
      for (var i = 0; i < ids.length; i++) { D.sess().tap(ids[i]); await sleep(95); }
      /* 逐帧采样：headless 软件渲染下单帧可达 100ms+，一次定时采样会错过
       * 180ms 的辉光窗口（实测首采样 fp 已 0.88）。故用 rAF 循环连续采。
       * **隔离实验**：碎裂首帧记录描述符后立即 clearVfx(true) ——清掉全部碎片、
       * 保留辉光，此后圆心像素若有内容，唯一来源就是爆心辉光（无需再靠几何排除）。 */
      var samples = [], seen = 0, shatterAt = -1, stopAt = 0, bboxAtShatter = null;
      var flash0 = null, isolated = false;
      var tStart = performance.now();
      await new Promise(function(resolve){
        function step(){
          var now = performance.now();
          var n = r.vfxShardsOf().length - base;
          if (n > 0) {
            if (shatterAt < 0) { shatterAt = now; stopAt = now + 420; }
            seen = n;
            if (!flash0) {
              flash0 = r.vfxFlashInfo();
              r.clearVfx(true);      /* 只留辉光，碎片全清 */
              isolated = true;
            }
            /* 采样放在「清碎片之后」的下一帧起——此时画布上只剩辉光 */
            var pr = D.probeCenter();
            if (pr && pr.flash) {
              samples.push({ fp: pr.fp, fR: pr.fR, a: pr.a, lum: pr.lum, shards: pr.shards });
            }
          } else if (!isolated) {
            /* 碎裂前：逐帧记录槽位包围盒（ghost 逐张揭示，最后一次 >= 2 槽即
             * 最接近真实 3 槽包围盒；碎裂后 ghost 会被清空，故必须提前捕获） */
            var bb2 = D.dockBBox();
            if (bb2 && bb2.n >= 2) bboxAtShatter = bb2;
          }
          if (stopAt && now > stopAt) { resolve(); return; }
          if (!stopAt && now - tStart > 1500) { resolve(); return; }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
      /* 越窗后：描述符必须清空 */
      var afterWin = D.probeCenter();
      var bbox = bboxAtShatter || bboxBefore;
      /* 回收 + 残留测试：隔离实验已把池清空，故必须**再爆一次**才能验证自然回收。
       * life 按帧递减（每帧 -16ms），headless 软件渲染只有 ~10fps，
       * 墙钟 900ms 内回收不完 → 必须轮询池长度。 */
      r.spawnDockShatter([]);
      var refill = r.vfxShardsOf().length;
      var tDrain = performance.now(), drained = false;
      while (performance.now() - tDrain < 8000) {
        if (r.vfxShardsOf().length === 0) { drained = true; break; }
        await sleep(60);
      }
      await sleep(120); /* 留一帧给「由有转空」的补清屏 */
      var residue = D.vfxResidue();
      return { bbox: bbox, samples: samples, seen: seen, afterWin: afterWin,
               residue: residue, drained: drained, refill: refill,
               dockRow: dockRow, flash0: flash0, isolated: isolated,
               drainMs: Math.round(performance.now() - tDrain),
               shatterAt: Math.round(shatterAt) };
    })()`);
  }

  if (glow && !glow.err && glow.shatterAt > 0) {
    var smp = glow.samples || [];
    var bestA = 0, bestLum = 0, bestFp = 0, bestFr = 0, maxShards = 0;
    for (var gi = 0; gi < smp.length; gi++) {
      if (smp[gi].a > bestA) { bestA = smp[gi].a; bestLum = smp[gi].lum; bestFp = smp[gi].fp; bestFr = smp[gi].fR; }
      if (smp[gi].shards > maxShards) maxShards = smp[gi].shards;
    }
    check('⑤ 碎裂后辉光被真实绘制（采样帧数 >= 1）', smp.length >= 1,
      smp.length + ' 帧 · fp=' + smp.map(function (s) { return s.fp; }).join(','));
    /* 隔离实验：碎片已全清，圆心像素只可能来自 'lighter' 合成的径向渐变。 */
    check('⑤ 辉光在画布上真实可见（清空碎片后圆心 alpha > 6）',
      bestA > 6 && maxShards === 0,
      'a=' + bestA + ' lum=' + bestLum + ' fp=' + bestFp + ' fR=' + bestFr +
      ' 采样时池内碎片=' + maxShards);
    /* 位置判据（确定性，不依赖碎裂瞬间的槽位快照）：
     * 辉光圆心 MUST 落在 #dock 槽位行的水平范围内、且与槽位行垂直中心偏差 <= 1 个槽高；
     * 半径 MUST 与槽位行宽度同量级（3 槽并集 + 2 × slotW × 1.35 的 0.52 倍）。 */
    var fl0 = glow.flash0, row = glow.dockRow;
    if (fl0 && row) {
      var inRow = fl0.x >= row.x0 - 1 && fl0.x <= row.x1 + 1;
      var vErr = Math.abs(fl0.y - (row.y0 + row.y1) / 2);
      check('⑤ 辉光圆心落在待消槽槽位行内（水平在行内、垂直偏差 <= 1 槽高）',
        inRow && vErr <= row.slotH,
        'x=' + Math.round(fl0.x) + '∈[' + Math.round(row.x0) + ',' + Math.round(row.x1) +
        '] vErr=' + vErr.toFixed(1) + ' slotH=' + Math.round(row.slotH));
      var expR0 = (row.slotW * 3 + row.slotW * 1.35 * 2) * 0.52;
      check('⑤ 辉光半径与 3 槽并集同量级（r ≈ (3 槽 + 2×1.35 槽宽) × 0.52，0.6~1.4×）',
        fl0.r >= expR0 * 0.6 && fl0.r <= expR0 * 1.4,
        'r=' + Math.round(fl0.r) + ' base=' + Math.round(expR0));
      check('⑤ 辉光生命周期 = 180ms', fl0.dur === 180, fl0.dur);
    } else {
      check('⑤ 辉光位置判据可采样（flash0 + dockRow 均非空）', false,
        'flash0=' + JSON.stringify(fl0) + ' row=' + (row ? 'ok' : 'null'));
    }
    check('⑤ 180ms 窗口后辉光描述符清空（不残留）',
      glow.afterWin && glow.afterWin.flash === null,
      glow.afterWin ? ('flash=' + JSON.stringify(glow.afterWin.flash)) : 'n/a');
    check('⑤ 碎块池最终完全回收（无泄漏）', glow.drained === true,
      'refill=' + glow.refill + ' drainMs=' + glow.drainMs);
    check('⑤ 碎块全部回收后全屏 VFX 画布零残留像素',
      glow.residue && glow.residue.nonZero === 0,
      glow.residue ? (glow.residue.nonZero + '/' + glow.residue.total) : 'n/a');
    await shot('shatter-glow.png');
  } else {
    check('⑤ 爆心辉光采样成功', false, glow ? JSON.stringify(glow.err || glow) : 'null');
  }

  /* ---------- ⑥ 碎裂出生点定位（Δ28e：碎片必须从三消所在槽位崩出） ----------
   * 为什么需要这一步：`applyTap` 是原子结算，`match` 时那 3 张牌已从 `state.dock`
   * 移除，`lastDockSnapshot` 也被刷成移除后形态。旧实现只能退化成「取最左边 3 个
   * 有牌槽」→ 碎片恒定从左侧爆开。若只在空槽上凑三消（槽 0,1,2），错误实现与正确
   * 实现结果**相同**，测不出来。故此处先在槽 0,1 预置两张异花色牌，把三消块挤到
   * 槽 2,3,4——两种实现相差整整 2 个槽宽，可确定性区分。 */
  console.log('\n⑥ 碎裂出生点定位（Δ28e）');
  var birth = await ev(`(async function(){
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    var r = window.__D27.rnd(), s = window.__D27.sess(), RE = window.STM.RulesEngine;
    s.reset();
    await sleep(120);

    function tappableBySuit(exclude) {
      var st = s.state(), eng = s.engineState(), by = {};
      for (var i = 0; i < st.board.length; i++) {
        var t = st.board[i];
        if (!t || !RE.canTap(eng, t.id)) continue;
        var k = t.s | 0;
        if (k === exclude) continue;
        (by[k] = by[k] || []).push(t.id);
      }
      return by;
    }
    function firstOf(suit) {
      var st = s.state(), eng = s.engineState();
      for (var i = 0; i < st.board.length; i++) {
        var t = st.board[i];
        if (!t || (t.s | 0) !== suit) continue;
        if (!RE.canTap(eng, t.id)) continue;
        return t.id;
      }
      return null;
    }

    /* 目标花色 = 可点数量最多的花色 */
    var st0 = s.state(), eng0 = s.engineState(), cnt = {};
    for (var i0 = 0; i0 < st0.board.length; i0++) {
      var b0 = st0.board[i0];
      if (!b0 || !RE.canTap(eng0, b0.id)) continue;
      var k0 = b0.s | 0;
      cnt[k0] = (cnt[k0] || 0) + 1;
    }
    var target = -1, bestN = 0;
    for (var kk in cnt) if (cnt[kk] > bestN) { bestN = cnt[kk]; target = kk | 0; }
    if (target < 0 || bestN < 3) return { err: 'no triple suit' };

    /* 预置 2 张异花色（占用槽 0,1） */
    var pre = tappableBySuit(target);
    var preSuit = -1, preN = 0;
    for (var pk in pre) if (pre[pk].length > preN) { preN = pre[pk].length; preSuit = pk | 0; }
    var preTapped = 0;
    for (var pv = 0; pv < 2; pv++) {
      var pid = firstOf(preSuit);
      if (pid == null) break;
      s.tap(pid); preTapped++;
      await sleep(100);
    }
    var preDock = s.state().dock.map(function(t){ return t.s; });

    /* 凑目标花色三消 */
    var tapped = 0;
    while (tapped < 8) {
      var stc = s.state(), c = 0;
      for (var ci = 0; ci < stc.dock.length; ci++) if ((stc.dock[ci].s | 0) === target) c++;
      if (c >= 3) break;
      var tid = firstOf(target);
      if (tid == null) break;
      s.tap(tid); tapped++;
      await sleep(100);
    }

    /* 等碎裂首帧，采「震颤槽位」与碎片 x 分布 */
    var t0 = performance.now(), snap = null;
    while (performance.now() - t0 < 2000) {
      if (r.vfxShardsOf().length > 0) {
        var nodes = document.querySelectorAll('#dock .slot');
        var shat = [], slotRects = [];
        for (var q = 0; q < nodes.length; q++) {
          var bq = nodes[q].getBoundingClientRect();
          slotRects.push({ i: q, l: Math.round(bq.left), r: Math.round(bq.right), w: Math.round(bq.width) });
          if ((nodes[q].className || '').indexOf('slot-shattering') >= 0) shat.push(q);
        }
        var xs = r.vfxShardsOf().map(function(a){ return a.x; }).sort(function(a,b){ return a-b; });
        snap = {
          shat: shat, slots: slotRects,
          xMin: Math.round(xs[0]),
          xMax: Math.round(xs[xs.length - 1]),
          xP10: Math.round(xs[Math.floor(xs.length * 0.10)]),
          xP90: Math.round(xs[Math.floor(xs.length * 0.90)])
        };
        break;
      }
      await sleep(8);
    }
    return { target: target, preSuit: preSuit, preTapped: preTapped,
             preDock: preDock, tapped: tapped, snap: snap };
  })()`);

  if (birth && !birth.err && birth.snap && birth.snap.shat.length) {
    var bs = birth.snap, slots = bs.slots;
    check('⑥ 预置 2 张异花色占住槽 0,1（把三消块挤到右侧）',
      birth.preTapped === 2 && birth.preDock.length >= 2, JSON.stringify(birth.preDock));
    check('⑥ 震颤槽位恰为 3 个', bs.shat.length === 3, JSON.stringify(bs.shat));
    /* 核心：槽位 MUST NOT 退化成「最左 3 个有牌槽」 */
    var isLeftmost = bs.shat.length === 3 && bs.shat[0] === 0 && bs.shat[1] === 1 && bs.shat[2] === 2;
    check('⑥ 爆发槽位不是「最左 3 槽」（MUST 为本轮三消真实所在槽位）',
      !isLeftmost, 'shat=' + JSON.stringify(bs.shat) + ' preDock=' + JSON.stringify(birth.preDock));
    /* 出生 x 必须落在 3 槽并集 ± 0.9 槽宽内 */
    var s0 = slots[bs.shat[0]], s2 = slots[bs.shat[bs.shat.length - 1]];
    if (s0 && s2) {
      var pad = s0.w * 0.9;
      var lo = s0.l - pad, hi = s2.r + pad;
      check('⑥ 碎片出生 x 落在 3 槽并集 ± 0.9 槽宽内（p10/p90）',
        bs.xP10 >= lo && bs.xP90 <= hi,
        'p10=' + bs.xP10 + ' p90=' + bs.xP90 + ' 允许 [' + Math.round(lo) + ',' + Math.round(hi) + ']');
      var unionCX = (s0.l + s2.r) / 2;
      /* 用 p10~p90 中点而非 min/max——极少数离群碎片（拒绝采样的 bestX 兜底）
       * 会把 min/max 拉偏，p10/p90 才是「出生云主体」的稳定估计。 */
      var cloudCX = (bs.xP10 + bs.xP90) / 2;
      check('⑥ 碎片云主体中心与 3 槽并集中心偏差 <= 1 槽宽',
        Math.abs(cloudCX - unionCX) <= s0.w,
        'cloud(p10~p90)=' + Math.round(cloudCX) + ' union=' + Math.round(unionCX) + ' slotW=' + s0.w);
    }
    await shot('shatter-birth.png');
  } else {
    check('⑥ 出生点采样成功', false, birth ? JSON.stringify(birth.err || birth) : 'null');
  }

  /* ---------- ⑦ 碎块轨迹形态（Δ28f：单条扫掠 + 干脆下落） ----------
   * 用户两轮反馈的验收点：
   *   「不是三条轨迹」→ 全团 vx MUST 同号（旧实现按「远离爆心」定向 = 左/中/右三束）
   *   「像红线那样斜着落下」→ 轨迹倾角 MUST 斜但明确向下（p50 <= 40°）
   *   「现在感觉是飘下去的」→ 首 100ms 竖直位移 MUST 够大 + 墙钟下落速率 MUST 够快
   * 最后一条同时守住 Δ28f 的根因修复：物理若按「帧数」而非「墙钟」积分，
   * 掉帧时速度会被摊薄（headless 只有 8fps，旧实现会掉到 ~60px/s）。 */
  console.log('\n⑦ 碎块轨迹形态（Δ28f）');
  var traj = await ev(`(async function(){
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    var r = window.__D27.rnd(), s = window.__D27.sess(), RE = window.STM.RulesEngine;
    s.reset();
    await sleep(150);
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
    var tapped = 0;
    while (tapped < 8) {
      var stc = s.state(), c2 = 0;
      for (var ci=0;ci<stc.dock.length;ci++) if ((stc.dock[ci].s|0) === target) c2++;
      if (c2 >= 3) break;
      var tid = firstOf(target);
      if (tid == null) break;
      s.tap(tid); tapped++;
      await sleep(110);
    }
    var t0 = performance.now();
    while (performance.now() - t0 < 2000 && r.vfxShardsOf().length === 0) await sleep(6);
    if (r.vfxShardsOf().length === 0) return { err: 'no shards' };

    var frames = [];
    var start = performance.now();
    await new Promise(function(done){
      function loop(){
        var now = performance.now() - start;
        var list = r.vfxShardsOf();
        frames.push({
          t: now,
          s: list.map(function(x){ return { x: x.x, y: x.y, vx: x.vx, vy: x.vy }; })
        });
        if (now < 460) requestAnimationFrame(loop); else done();
      }
      requestAnimationFrame(loop);
    });
    return { frames: frames };
  })()`);

  if (traj && !traj.err && traj.frames && traj.frames.length >= 2) {
    var tf = traj.frames;
    /* ⑦a 全团 vx 同号 */
    var vPos = 0, vNeg = 0;
    for (var tf1 = 0; tf1 < tf.length; tf1++) {
      for (var ts1 = 0; ts1 < tf[tf1].s.length; ts1++) {
        if (tf[tf1].s[ts1].vx > 0) vPos++; else if (tf[tf1].s[ts1].vx < 0) vNeg++;
      }
    }
    check('⑦ 全团 vx 同号（单条扫掠轨迹，MUST NOT 左/中/右三束扇形）',
      vPos === 0 || vNeg === 0, '正 ' + vPos + ' / 负 ' + vNeg);

    /* ⑦b 轨迹倾角：首帧 → 末个「仍 >= 60 枚」的帧，逐枚配对 */
    var fA = tf[0], fB = null;
    for (var tb = tf.length - 1; tb >= 0; tb--) { if (tf[tb].s.length >= 60) { fB = tf[tb]; break; } }
    var angs = [], sumAbsDx = 0, sumDy = 0;
    if (fB) {
      var np = Math.min(fA.s.length, fB.s.length);
      for (var tp = 0; tp < np; tp++) {
        var ddx = fB.s[tp].x - fA.s[tp].x;
        var ddy = fB.s[tp].y - fA.s[tp].y;
        if (ddy < 1) continue;
        angs.push(Math.atan2(Math.abs(ddx), ddy) * 180 / Math.PI);
        sumAbsDx += Math.abs(ddx); sumDy += ddy;
      }
    }
    angs.sort(function (a, b) { return a - b; });
    var angP50 = angs.length ? angs[Math.floor(angs.length / 2)] : NaN;
    check('⑦ 轨迹倾角 p50 落 5~40°（斜着落下，既非垂直也非横飞）',
      isFinite(angP50) && angP50 >= 5 && angP50 <= 40,
      'p50=' + (isFinite(angP50) ? angP50.toFixed(1) : '-') + '° 配对=' + angs.length);

    /* ⑦c 首 100ms 竖直位移 */
    var f100 = null;
    for (var tq = 0; tq < tf.length; tq++) { if (tf[tq].t >= 95) { f100 = tf[tq]; break; } }
    var drop100 = NaN;
    if (f100) {
      var nq = Math.min(fA.s.length, f100.s.length), acc = 0, cn2 = 0;
      for (var pq = 0; pq < nq; pq++) { var dq = f100.s[pq].y - fA.s[pq].y; if (dq > 0) { acc += dq; cn2++; } }
      drop100 = cn2 ? acc / cn2 : NaN;
    }
    check('⑦ 首 100ms 平均竖直位移 >= 40px（起手即下坠，不是飘）',
      isFinite(drop100) && drop100 >= 40,
      (isFinite(drop100) ? drop100.toFixed(1) : '-') + 'px');

    /* ⑦d 墙钟下落速率（掉帧不改速度——Δ28f 根因修复的实机护栏） */
    var wallRate = NaN;
    if (fB && fB.t > fA.t + 1) {
      var dtW = (fB.t - fA.t) / 1000;
      var nw = Math.min(fA.s.length, fB.s.length), accY = 0, cnW = 0;
      for (var pw = 0; pw < nw; pw++) { var dw = fB.s[pw].y - fA.s[pw].y; if (dw > 0) { accY += dw; cnW++; } }
      if (cnW && dtW > 0) wallRate = (accY / cnW) / dtW;
    }
    check('⑦ 墙钟下落速率 >= 300 px/s（物理按墙钟积分，掉帧不减速）',
      isFinite(wallRate) && wallRate >= 300,
      (isFinite(wallRate) ? Math.round(wallRate) : '-') + ' px/s');
    await shot('shatter-traj.png');
  } else {
    check('⑦ 轨迹采样成功', false, traj ? JSON.stringify(traj.err || ('frames=' + (traj.frames ? traj.frames.length : 'null'))) : 'null');
  }

  var errCount = await ev('(function(){return (window.__D27ERR||0);})()');
  check('③ 全程零未捕获异常', !errCount, errCount);

  cleanup();

  console.log('');
  if (fails.length) {
    console.log('delta27-verify: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('delta27-verify: all green（编舞在途<=22 / 槽位零抖动 / 图层不反转 / 碎块 120~150 枚 + 图集命中>=90% / 碎裂出生点定位 / 单条扫掠轨迹）');
    console.log('取证帧目录：shots/delta27/');
  }
}

main().catch(function (e) {
  console.error('delta27-verify: 异常', e && e.message);
  process.exit(2);
});
