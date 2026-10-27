/* =========================================================
 * Slide & Triple — shards-audit（Δ29b / T155~T156 图集键控与立体材质审计）
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
 *   ③ 主体包围盒居中、覆盖 0.62~0.80 的 256 边（素材没被裁切）
 *   ④ 每格不透明占比 0.10~0.80（是碎块，不是整块实心矩形）
 *   ⑤ 9 格内容两两不同（指纹互异，不是同一块复制）
 *   ⑥ 键控耗时 < 400ms（一次性开销，不阻塞首屏）
 *   ⑧ 三色系色相 / 同色系聚拢 / 暗面 >= 15%
 *   ⑬ Δ29b 泛洪键控六条（SC-023 ⑬）：
 *      · 每张切片暗面（max(R,G,B) <= 190）占比 >= 25%（全 27 张）
 *      · 暗面 / 亮面均值亮度差 >= 55（明暗切面可辨）
 *      · 暗面与亮面双极共存（>= 25% / >= 8%）
 *      · **零掏空**：画框内不存在「从边界不可达的 alpha==0 洞」
 *      · 画框外沿 2px 环带全透明（背景零误留）
 *      · 内部明暗交界线存在（不是一块纯色）
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
      /* Δ28b: SC-023 ⑧ 材质断言所需——暗部占比（max(R,G,B) <= 190）与平均色相 */
      var dark = 0, sumR = 0, sumG = 0, sumB = 0;
      /* Δ29b ⑬: 暗/亮均值亮度差、双极共存、内部明暗交界线 */
      var darkSum = 0, lightSum = 0, light = 0, edgeContrast = 0, hardSteps = 0;
      var hist = new Array(256);
      for (var hi0 = 0; hi0 < 256; hi0++) hist[hi0] = 0;
      var minX = W, maxX = -1, minY = H, maxY = -1;
      var fp = 0;
      /* 先取一份 alpha 平面，供「零掏空 / 外沿环带」两项几何断言用 */
      var alphaPlane = new Uint8Array(N);
      for (var q0 = 0; q0 < N; q0++) alphaPlane[q0] = d[q0 * 4 + 3];
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var o = (y * W + x) * 4;
          var a = d[o + 3];
          if (a > 200) {
            opaque++;
            var r = d[o], g = d[o + 1], b = d[o + 2];
            var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
            if (mx <= 40) nearBlack++;
            var lum = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
            if (mx <= 190) { dark++; darkSum += lum; }
            else { light++; lightSum += lum; }
            /* 明暗交界线：与右/下邻像素**跨越 190 明暗阈值**的相邻对数
             * （素材是柔和着色的瓷器，梯度平缓，用「>= 60 跳变」会全部判 0；
             *  跨阈值的相邻对才是「暗面与亮面真的分开」的稳定证据） */
            var isDark = mx <= 190;
            if (x + 1 < W) {
              var oR = o + 4;
              if (d[oR + 3] > 200) {
                var mxR = Math.max(d[oR], d[oR + 1], d[oR + 2]);
                if ((mxR <= 190) !== isDark) edgeContrast++;
                if (Math.abs(mxR - mx) >= 60) hardSteps++;
              }
            }
            if (y + 1 < H) {
              var oD = o + W * 4;
              if (d[oD + 3] > 200) {
                var mxD = Math.max(d[oD], d[oD + 1], d[oD + 2]);
                if ((mxD <= 190) !== isDark) edgeContrast++;
                if (Math.abs(mxD - mx) >= 60) hardSteps++;
              }
            }
            sum += mx;
            sumR += r; sumG += g; sumB += b;
            hist[lum]++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            fp = (fp * 31 + mx + ((x * 7 + y * 13) % 251)) % 1000003;
          }
        }
      }
      /* Δ29b ⑬: 「零掏空」——从画框四边泛洪 alpha==0 区域，凡不可达的 alpha==0
       * 像素即「主体被掏出的洞」。旧全局阈值键控会把主体内的近黑厚壁抠成洞，
       * 本项是「泛洪键控真的保住了暗面」的**独立**几何证据（不是重跑同一算法）。 */
      var reach = new Uint8Array(N);
      var qs = [];
      function seedA(ix) {
        if (reach[ix] || alphaPlane[ix] !== 0) return;
        reach[ix] = 1; qs.push(ix);
      }
      for (var qx = 0; qx < W; qx++) { seedA(qx); seedA((H - 1) * W + qx); }
      for (var qy = 0; qy < H; qy++) { seedA(qy * W); seedA(qy * W + W - 1); }
      while (qs.length) {
        var ci2 = qs.pop();
        var cxx = ci2 % W, cyy = (ci2 - cxx) / W;
        if (cxx > 0) seedA(ci2 - 1);
        if (cxx < W - 1) seedA(ci2 + 1);
        if (cyy > 0) seedA(ci2 - W);
        if (cyy < H - 1) seedA(ci2 + W);
      }
      var enclosedHoles = 0;
      for (var qh = 0; qh < N; qh++) if (alphaPlane[qh] === 0 && !reach[qh]) enclosedHoles++;
      /* 画框外沿 2px 环带：必须全透明（背景零误留） */
      var ringN = 0, ringOpaque = 0;
      for (var ry = 0; ry < H; ry++) {
        for (var rx = 0; rx < W; rx++) {
          if (rx > 1 && rx < W - 2 && ry > 1 && ry < H - 2) continue;
          ringN++;
          if (alphaPlane[ry * W + rx] > 8) ringOpaque++;
        }
      }
      out.push({
        w: W, h: H,
        opaqueRatio: opaque / N,
        nearBlackRatio: opaque > 0 ? nearBlack / opaque : 1,
        darkRatio: opaque > 0 ? dark / opaque : 0,
        lightRatio: opaque > 0 ? light / opaque : 0,
        darkMean: dark > 0 ? darkSum / dark : 0,
        lightMean: light > 0 ? lightSum / light : 0,
        edgeContrast: edgeContrast,
        hardSteps: hardSteps,
        enclosedHoles: enclosedHoles,
        ringOpaqueRatio: ringN > 0 ? ringOpaque / ringN : 1,
        meanBright: opaque > 0 ? sum / opaque : 0,
        meanRGB: opaque > 0
          ? [sumR / opaque, sumG / opaque, sumB / opaque]
          : [0, 0, 0],
        /* 亮度分位（诊断用：判断素材动态范围是否够染色展开） */
        lumP: (function () {
          if (!opaque) return [0, 0, 0, 0, 0];
          var want = [0.02, 0.10, 0.50, 0.90, 0.98], got = [], acc = 0, wi = 0;
          for (var q = 0; q < 256 && wi < want.length; q++) {
            acc += hist[q];
            while (wi < want.length && acc >= want[wi] * opaque) { got.push(q); wi++; }
          }
          while (got.length < want.length) got.push(255);
          return got;
        })(),
        bbox: opaque > 0 ? { x0: minX, x1: maxX, y0: minY, y1: maxY } : null,
        fp: fp
      });
    }
    return { state: A.state(), validCount: A.validCount(), keyMs: A.keyMs(), slices: out,
      consts: (function () {
        var T = window.STM.rendererTest || {};
        return {
          keying: T.SHARD_KEYING || null,
          rimMix: T.SHARD_RIM_MIX != null ? T.SHARD_RIM_MIX : null,
          rampGamma: T.SHARD_RAMP_GAMMA != null ? T.SHARD_RAMP_GAMMA : null,
          shadeAlpha: T.SHARD_SHADE_ALPHA != null ? T.SHARD_SHADE_ALPHA : null
        };
      })() };
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

  console.log('  状态 ' + res.state + ' · 有效格 ' + res.validCount + '/9 · 切片 ' + (res.slices || []).length + ' 张 · 键控耗时 ' + Math.round(res.keyMs) + 'ms');
  /* 诊断：素材亮度分位（p2/p10/p50/p90/p98）——决定 ramp 能否展开出暗面 */
  if (res.slices && res.slices.length) {
    console.log('  亮度分位 p2/p10/p50/p90/p98：' + res.slices.map(function (s, i2) {
      return (i2 % 3 === 0 ? '形状' + (i2 / 3) + '[' : '') + (s.lumP || []).join('/') + (i2 % 3 === 2 ? ']' : '');
    }).join(' ') + '\n');
  } else {
    console.log('');
  }

  check('① 图集加载成功（state=ready）', res.state === 'ready', res.state);
  check('① 3×3 九宫格全部切出有效主体（9/9）', res.validCount === 9, res.validCount);
  check('⑥ 键控耗时 < 400ms', res.keyMs < 400, Math.round(res.keyMs) + 'ms');

  var sl = res.slices || [];
  /* Δ28b: 9 形状 × 3 色系 = 27 张切片 */
  var allPresent = sl.length === 27 && sl.every(function (s) { return !!s; });
  check('② 27 张切片（9 形状 × 3 色系）像素全部可回读（无跨源污染）', allPresent,
    sl.length + ' 张');

  if (allPresent) {
    var worstBlack = 0, worstIdx = -1;
    for (var i = 0; i < sl.length; i++) {
      if (sl[i].nearBlackRatio > worstBlack) { worstBlack = sl[i].nearBlackRatio; worstIdx = i; }
    }
    check('② 黑底已键掉：近黑不透明像素占比 < 2%',
      worstBlack < 0.02, 'worst=' + (100 * worstBlack).toFixed(2) + '% (格' + worstIdx + ')');

    var ratioOk = true, ratioWorst = '';
    for (var j = 0; j < sl.length; j++) {
      var rr = sl[j].opaqueRatio;
      if (!(rr >= 0.10 && rr <= 0.80)) { ratioOk = false; ratioWorst += '格' + j + '=' + rr.toFixed(2) + ' '; }
    }
    check('④ 每格不透明占比 0.10~0.80（是碎块而非实心矩形）', ratioOk, ratioWorst);

    var bboxOk = true, bboxWorst = '';
    for (var k = 0; k < sl.length; k++) {
      var bb = sl[k].bbox;
      if (!bb) { bboxOk = false; continue; }
      var bw = bb.x1 - bb.x0 + 1, bh = bb.y1 - bb.y0 + 1;
      /* Δ28b: 主体占比 0.92 → 0.70（留 30% 给预烘焙柔光晕），故长边应落
       * 256 × 0.70 ≈ 179 附近；带 ±8% 容差（键控 alpha 渐变带会略微外扩）。 */
      var longEdge = Math.max(bw, bh);
      if (longEdge < 256 * 0.62 || longEdge > 256 * 0.80) {
        bboxOk = false; bboxWorst += '格' + k + '长边' + longEdge + ' ';
      }
      /* 居中：左右 / 上下留白差 <= 4px */
      var padL = bb.x0, padR = 255 - bb.x1, padT = bb.y0, padB = 255 - bb.y1;
      if (Math.abs(padL - padR) > 4 || Math.abs(padT - padB) > 4) {
        bboxOk = false; bboxWorst += '格' + k + '偏移(' + padL + '/' + padR + ',' + padT + '/' + padB + ') ';
      }
    }
    check('③ 主体长边落 0.62~0.80 画框（含柔光晕留白）且居中', bboxOk, bboxWorst);

    var fps = {}, dup = 0;
    for (var m = 0; m < sl.length; m++) {
      if (fps[sl[m].fp]) dup++;
      fps[sl[m].fp] = 1;
    }
    check('⑤ 各格内容两两不同（指纹互异，不是复制同一块）', dup === 0, 'dup=' + dup);

    var brightOk = true;
    for (var n2 = 0; n2 < sl.length; n2++) if (sl[n2].meanBright < 120) brightOk = false;
    check('② 主体亮度均值 >= 120（白瓷/玻璃材质，非灰黑残留）', brightOk,
      sl.map(function (s) { return Math.round(s.meanBright); }).join(','));

    /* ---- Δ28b / SC-023 ⑧ 材质与色系 ---- */
    var darkOk = true, darkWorst = '', darkMin = 1;
    for (var p2 = 0; p2 < sl.length; p2++) {
      var dr = sl[p2].darkRatio;
      if (dr < darkMin) darkMin = dr;
      if (!(dr >= 0.25)) { darkOk = false; darkWorst += '格' + p2 + '=' + (100 * dr).toFixed(1) + '% '; }
    }
    check('⑬ 每张切片暗面（max(R,G,B) <= 190）占比 >= 25%（全 27 张，SC-023 ⑬）',
      darkOk, darkWorst);
    console.log('    暗面占比 min=' + (100 * darkMin).toFixed(1) + '% · max=' +
      (100 * Math.max.apply(null, sl.map(function (s3) { return s3.darkRatio; }))).toFixed(1) + '%');
    /* Δ29b 诊断：逐张「暗/亮/对比边/不透明占比」——调参时看这张表最快 */
    console.log('    逐张诊断 [暗%/亮%/对比边/不透明%]：' + sl.map(function (s4, i4) {
      return (i4 % 3 === 0 ? '形状' + (i4 / 3) + '[' : '') +
        (100 * s4.darkRatio).toFixed(0) + '/' + (100 * s4.lightRatio).toFixed(0) + '/' +
        s4.edgeContrast + '/' + (100 * s4.opaqueRatio).toFixed(0) +
        (i4 % 3 === 2 ? ']' : '');
    }).join(' '));

    /* 色系互异：切片序为「形状主序 / 色系次序」，故 theme = i % 3。
     * 同色系 9 张平均色相必须聚拢，异色系之间色相跨度必须够大，
     * 才能保证「同一采样帧内 >= 2 种色系」在观感上真的可分辨。 */
    var HUE = function (rgb) {
      var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
      if (dl < 1e-6) return -1;
      var h;
      if (mx === r) h = 60 * (((g - b) / dl) % 6);
      else if (mx === g) h = 60 * ((b - r) / dl + 2);
      else h = 60 * ((r - g) / dl + 4);
      return (h + 360) % 360;
    };
    var groups = [[], [], []];
    for (var q2 = 0; q2 < sl.length; q2++) groups[q2 % 3].push(HUE(sl[q2].meanRGB));
    var groupHue = groups.map(function (g2) {
      var t = 0, c = 0;
      for (var z = 0; z < g2.length; z++) if (g2[z] >= 0) { t += g2[z]; c++; }
      return c ? t / c : -1;
    });
    var minPairDiff = 999, pairStr = '';
    for (var ga = 0; ga < 3; ga++) {
      for (var gb = ga + 1; gb < 3; gb++) {
        var dd = Math.abs(groupHue[ga] - groupHue[gb]);
        if (dd > 180) dd = 360 - dd;
        if (dd < minPairDiff) minPairDiff = dd;
        pairStr += '色系' + ga + '↔' + gb + '=' + dd.toFixed(1) + '° ';
      }
    }
    check('⑧ 三色系平均色相互异（最小色相跨度 >= 15°，同帧 >= 2 色系可辨）',
      minPairDiff >= 15, pairStr + '| 组内色相 ' +
      groupHue.map(function (v) { return v < 0 ? 'n/a' : v.toFixed(1); }).join('/'));

    /* 组内聚拢：同色系 9 张的色相极差 <= 40°（否则等于每张一个颜色，色系分组失效） */
    var intraOk = true, intraWorst = '';
    for (var gi = 0; gi < 3; gi++) {
      var vals = groups[gi].filter(function (v) { return v >= 0; });
      if (vals.length < 2) { intraOk = false; intraWorst += '色系' + gi + '样本不足 '; continue; }
      var spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      if (spread > 40) { intraOk = false; intraWorst += '色系' + gi + '极差' + spread.toFixed(1) + '° '; }
    }
    check('⑧ 同色系 9 张切片色相极差 <= 40°（色系内一致，只随形状变明暗）',
      intraOk, intraWorst);

    /* ---- Δ29b / SC-023 ⑬ 泛洪键控与立体材质六条 ---- */
    /* ① 暗 / 亮均值亮度差 >= 55：明暗切面必须「分得开」，否则仍是扁平白片 */
    var minDiff = 1e9, diffWorst = '';
    for (var dq = 0; dq < sl.length; dq++) {
      var dvv = sl[dq].lightMean - sl[dq].darkMean;
      if (dvv < minDiff) { minDiff = dvv; diffWorst = '格' + dq + '=' + dvv.toFixed(1); }
    }
    check('⑬ 暗面 / 亮面均值亮度差 >= 55（明暗立体切面可辨，全 27 张）',
      minDiff >= 55, 'min=' + minDiff.toFixed(1) + ' (' + diffWorst + ')');

    /* ② 双极共存：只有暗面没有亮面 = 一块黑板；只有亮面没有暗面 = 白纸片 */
    var polarOk = true, polarWorst = '';
    for (var pq = 0; pq < sl.length; pq++) {
      if (!(sl[pq].darkRatio >= 0.25 && sl[pq].lightRatio >= 0.08)) {
        polarOk = false;
        polarWorst += '格' + pq + '(暗' + (100 * sl[pq].darkRatio).toFixed(1) +
          '%/亮' + (100 * sl[pq].lightRatio).toFixed(1) + '%) ';
      }
    }
    check('⑬ 暗面 >= 25% 且亮面 >= 8%（双极共存，不是纯色块）', polarOk, polarWorst);

    /* ③ 零掏空：画框内不得存在「从边界不可达的 alpha==0 洞」。
     * 旧全局阈值键控会把主体内的近黑厚壁抠成洞 → 本项是泛洪键控生效的独立几何证据。 */
    var holeTotal = 0, holeWorst = '';
    for (var hq = 0; hq < sl.length; hq++) {
      holeTotal += sl[hq].enclosedHoles;
      if (sl[hq].enclosedHoles > 0) holeWorst += '格' + hq + '=' + sl[hq].enclosedHoles + ' ';
    }
    check('⑬ 零掏空：27 张切片均无「被主体包围的透明洞」（暗面未被当背景抠掉）',
      holeTotal === 0, holeWorst || ('holes=' + holeTotal));

    /* ④ 背景零误留：画框外沿 2px 环带必须全透明 */
    var ringOk = true, ringWorst = '';
    for (var rq = 0; rq < sl.length; rq++) {
      if (!(sl[rq].ringOpaqueRatio <= 0.005)) {
        ringOk = false;
        ringWorst += '格' + rq + '=' + (100 * sl[rq].ringOpaqueRatio).toFixed(2) + '% ';
      }
    }
    check('⑬ 画框外沿 2px 环带不透明像素 <= 0.5%（黑底零误留）', ringOk, ringWorst);

    /* ⑤ 内部明暗交界线存在（横向相邻像素 max 通道差 >= 60 的计数） */
    var edgeMin = 1e9;
    for (var eq = 0; eq < sl.length; eq++) {
      if (sl[eq].edgeContrast < edgeMin) edgeMin = sl[eq].edgeContrast;
    }
    check('⑬ 每张切片内部存在明暗交界线（跨 190 阈值的相邻对 >= 200，不是一块平涂）',
      edgeMin >= 200, 'min=' + edgeMin);

    /* ⑥ 键控口径常量：泛洪 + 阈值落 24~56（MUST NOT 与 96 图标的 215 混用） */
    var K = (res.consts && res.consts.keying) || {};
    check('⑬ 键控模式 = 边界连通域泛洪（mode=flood-fill）', K.mode === 'flood-fill', K.mode);
    check('⑬ 泛洪阈值落 24~56（吸收 JPEG 块噪声但不得啃掉暗面）',
      K.bgThreshold >= 24 && K.bgThreshold <= 56, K.bgThreshold);
    check('⑬ 亮边只作用外沿（SHARD_RIM_MIX < 0.7，MUST NOT 洗白内部暗面）',
      res.consts.rimMix > 0 && res.consts.rimMix < 0.7, res.consts.rimMix);
    check('⑬ 对比拉伸指数 >= 1.5（MUST NOT 为提亮把暗面拉进中间调）',
      res.consts.rampGamma >= 1.5, res.consts.rampGamma);
    check('⑬ 预烘焙方向光 0.28~0.42（统一光源，过高压成黑块 / 过低不可辨）',
      res.consts.shadeAlpha >= 0.28 && res.consts.shadeAlpha <= 0.42, res.consts.shadeAlpha);
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
