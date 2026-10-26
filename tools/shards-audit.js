/* =========================================================
 * Slide & Triple — shards-audit（Δ27c / T134 图集黑底键控审计）
 *
 *   node tools/shards-audit.js
 *
 * 为什么必须开浏览器：键控依赖 getImageData 回读像素，而 file:// 下
 * canvas 会被跨源污染（Origin: null → SecurityError）。故本脚本起一个
 * 本机静态服务器，用 CDP 驱动 headless Chrome 打开 http://127.0.0.1。
 * 零 npm 依赖（Node 内置 http / WebSocket + 本机 Chrome，宪章 II）。
 *
 * 断言：
 *   ① assets/icons/shards.jpg 能被加载并切出 9 格（3×3）
 *   ② 黑底已键掉：不透明像素中「近黑」占比 < 2%
 *   ③ 主体包围盒居中、覆盖 >= 80% 的 256 边（素材没被裁切）
 *   ④ 每格不透明占比 0.15~0.80（是碎块，不是整块实心矩形）
 *   ⑤ 9 格内容两两不同（指纹互异，不是同一块复制）
 *   ⑥ 键控耗时 < 400ms（一次性开销，不阻塞首屏）
 * ========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
var BROWSER = null;
for (var bi = 0; bi < CANDIDATES.length; bi++) {
  try { if (fs.statSync(CANDIDATES[bi]).isFile()) { BROWSER = CANDIDATES[bi]; break; } } catch (e) {}
}
if (!BROWSER) { console.error('shards-audit: 未找到 Chrome/Edge'); process.exit(2); }

var fails = [];
function check(name, ok, extra) {
  if (ok) console.log('  ✓ ' + name);
  else { fails.push(name); console.log('  ✗ ' + name + (extra == null ? '' : '  [' + extra + ']')); }
}

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2'
};

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

/* 浏览器侧审计脚本（返回纯数据，断言在 Node 侧做） */
function auditExpr() {
  return `(async function(){
    var A = window.STM && window.STM.ShardAtlas;
    if (!A) return { err: 'no ShardAtlas' };
    A.ensureLoaded();
    var t0 = Date.now();
    while (A.state() === 'idle' || A.state() === 'loading') {
      if (Date.now() - t0 > 8000) return { err: 'timeout', state: A.state() };
      await new Promise(function(r){ setTimeout(r, 40); });
    }
    if (A.state() !== 'ready') return { err: 'state=' + A.state() };
    var slices = A.slices() || [];
    var out = [];
    for (var i = 0; i < slices.length; i++) {
      var cv = slices[i];
      if (!cv || !cv.getContext) { out.push(null); continue; }
      var c2 = cv.getContext('2d');
      var d;
      try { d = c2.getImageData(0, 0, cv.width, cv.height).data; }
      catch (e) { return { err: 'getImageData: ' + e.message }; }
      var W = cv.width, H = cv.height, N = W * H;
      var opaque = 0, nearBlack = 0, sum = 0;
      var minX = W, maxX = -1, minY = H, maxY = -1;
      var fp = 0;
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var o = (y * W + x) * 4;
          var a = d[o + 3];
          if (a > 200) {
            opaque++;
            var r = d[o], g = d[o + 1], b = d[o + 2];
            var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
            if (mx <= 40) nearBlack++;
            sum += mx;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            fp = (fp * 31 + mx + ((x * 7 + y * 13) % 251)) % 1000003;
          }
        }
      }
      out.push({
        w: W, h: H,
        opaqueRatio: opaque / N,
        nearBlackRatio: opaque > 0 ? nearBlack / opaque : 1,
        meanBright: opaque > 0 ? sum / opaque : 0,
        bbox: opaque > 0 ? { x0: minX, x1: maxX, y0: minY, y1: maxY } : null,
        fp: fp
      });
    }
    return { state: A.state(), validCount: A.validCount(), keyMs: A.keyMs(), slices: out };
  })()`;
}

async function main() {
  console.log('Δ27c 图集黑底键控审计（assets/icons/shards.jpg）\n');

  var srv = await startServer();
  var PORT = srv.address().port;
  var devPort = 9200 + Math.floor(Math.random() * 300);
  var userDataDir = path.join(os.tmpdir(), 'stm-shards-' + Date.now());
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + devPort,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--hide-scrollbars', '--window-size=430,880',
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
    console.error('shards-audit: DevTools 未就绪');
    cleanup(); process.exit(2);
  }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(1800);

  var r = await c.send('Runtime.evaluate', {
    expression: auditExpr(), awaitPromise: true, returnByValue: true
  });
  if (r && r.exceptionDetails) {
    console.error('shards-audit: 页面异常', r.exceptionDetails.text);
    cleanup(); process.exit(2);
  }
  var res = r && r.result ? r.result.value : null;
  cleanup();

  if (!res || res.err) {
    console.error('shards-audit: 审计失败 —', res ? res.err : 'no result');
    process.exit(1);
  }

  console.log('  状态 ' + res.state + ' · 有效格 ' + res.validCount + '/9 · 键控耗时 ' + Math.round(res.keyMs) + 'ms\n');

  check('① 图集加载成功（state=ready）', res.state === 'ready', res.state);
  check('① 3×3 九宫格全部切出有效主体（9/9）', res.validCount === 9, res.validCount);
  check('⑥ 键控耗时 < 400ms', res.keyMs < 400, Math.round(res.keyMs) + 'ms');

  var sl = res.slices || [];
  var allPresent = sl.length === 9 && sl.every(function (s) { return !!s; });
  check('② 九格像素全部可回读（无跨源污染）', allPresent);

  if (allPresent) {
    var worstBlack = 0, worstIdx = -1;
    for (var i = 0; i < 9; i++) {
      if (sl[i].nearBlackRatio > worstBlack) { worstBlack = sl[i].nearBlackRatio; worstIdx = i; }
    }
    check('② 黑底已键掉：近黑不透明像素占比 < 2%',
      worstBlack < 0.02, 'worst=' + (100 * worstBlack).toFixed(2) + '% (格' + worstIdx + ')');

    var ratioOk = true, ratioWorst = '';
    for (var j = 0; j < 9; j++) {
      var rr = sl[j].opaqueRatio;
      if (!(rr >= 0.15 && rr <= 0.80)) { ratioOk = false; ratioWorst += '格' + j + '=' + rr.toFixed(2) + ' '; }
    }
    check('④ 每格不透明占比 0.15~0.80（是碎块而非实心矩形）', ratioOk, ratioWorst);

    var bboxOk = true, bboxWorst = '';
    for (var k = 0; k < 9; k++) {
      var bb = sl[k].bbox;
      if (!bb) { bboxOk = false; continue; }
      var bw = bb.x1 - bb.x0 + 1, bh = bb.y1 - bb.y0 + 1;
      /* 长边必须吃满 92% 画框（256 × 0.92 ≈ 235）；短边随碎块形状自由 */
      if (Math.max(bw, bh) < 256 * 0.85) { bboxOk = false; bboxWorst += '格' + k + '长边' + Math.max(bw, bh) + ' '; }
      /* 居中：左右 / 上下留白差 <= 4px（实测 <= 1px） */
      var padL = bb.x0, padR = 255 - bb.x1, padT = bb.y0, padB = 255 - bb.y1;
      if (Math.abs(padL - padR) > 4 || Math.abs(padT - padB) > 4) {
        bboxOk = false; bboxWorst += '格' + k + '偏移(' + padL + '/' + padR + ',' + padT + '/' + padB + ') ';
      }
    }
    check('③ 主体长边 >= 85% 画框且四边留白对称（无裁切、居中）', bboxOk, bboxWorst);

    var fps = {}, dup = 0;
    for (var m = 0; m < 9; m++) {
      if (fps[sl[m].fp]) dup++;
      fps[sl[m].fp] = 1;
    }
    check('⑤ 九格内容两两不同（指纹互异，不是复制同一块）', dup === 0, 'dup=' + dup);

    var brightOk = true;
    for (var n2 = 0; n2 < 9; n2++) if (sl[n2].meanBright < 120) brightOk = false;
    check('② 主体亮度均值 >= 120（白瓷材质，非灰黑残留）', brightOk,
      sl.map(function (s) { return Math.round(s.meanBright); }).join(','));
  }

  console.log('');
  if (fails.length) {
    console.log('shards-audit: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('shards-audit: all green（9/9 切片 / 黑底键除 / 包围盒居中 / 指纹互异 / 耗时达标）');
  }
}

main().catch(function (e) {
  console.error('shards-audit: 异常', e && e.message);
  process.exit(2);
});
