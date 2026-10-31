/* =========================================================
 * Slide & Triple — browser-bugtest（Δ12: blocked-slider-vanish 真机验证）
 *
 * node tools/browser-bugtest.js [--level N] [--pre-fix]
 * node tools/browser-bugtest.js --deep-link [--strict-fps]
 *
 * 背景: /speckit-bug-test——以真实 Chrome/Edge（CDP）复现评估报告的复现步骤:
 *   点击受阻滑块 → blocked 动画 → 贴图应存活（修复前: rAF 主循环死亡、贴图永久消失）。
 * 依赖: 零 npm 依赖——Node 24 内置 WebSocket + 本机 Chrome/Edge（宪章 II 离线铁律）。
 *
 * 检查项（每关）:
 *   A. 页面错误哨兵: 页面加载/操作全程 window.__stmErrors 无未捕获异常
 *   B. 受阻滑块点击 → 仍返回 blocked + 抖动反馈（输入管线正常）
 *   C. 动画窗口内 rAF 循环存活（连续采样 ≥600ms 帧计数递增）
 *   D. 动画结束后该滑块格中心像素 ≠ 背景色（贴图存活——核心回归断言）
 *   E. 二次点击同格（复现路径「再点消失滑块」）→ 全部检查重新通过
 *   F. gear 动画路径（同根缺陷）存活
 * --pre-fix: 用 git show HEAD~1 的 BoardRenderer 覆盖内存副本注入（红向对照）
 *
 * T236 / R6 深链首帧场景（--deep-link）:
 *   G. 深链 ?level=N 首帧：遮罩仍可见时棋盘 MUST 处于起始态且 t0 未记
 *      （探针实测 splash 要到 ≈4.6s 才移除，故看门狗 MUST 重挂而非静置）
 *   H. 遮罩移除后逐帧采样：首帧相位 = 0（≤1%）、total ∈ 380~420ms
 *   I. 帧间隔 p95 ≤20ms / max ≤34ms（headless 软件渲染下仅报告；--strict-fps 才硬断言）
 *   J. 穿模帧 = 0（逐帧断言绘制序恒 (z,r,c) 升序）
 *   K. 三消窗口内 #vfx-canvas alpha>2 像素数恒 0 + .slot 计算样式逐项不变
 *   产物：截图与 JSON 存 shots/deeplink/（不入库，.gitignore 已覆盖）
 * ========================================================= */
'use strict';

/* ---------- CLI ---------- */
var args = process.argv.slice(2);
/* R5 修复：默认关卡改为 3 —— `main.js` 的深链条件是 `if (deepIdGlobal > 1) enterGame(...)`，
 * `?level=1` 不触发进关，就绪探针会一直 NOT_READY 并 exit 2（与本缺陷无关的假红灯）。 */
var LEVEL = 3;
var li = args.indexOf('--level');
if (li >= 0 && args[li + 1]) LEVEL = parseInt(args[li + 1], 10);
var PRE_FIX = args.indexOf('--pre-fix') >= 0;
/* T236：深链首帧取证模式 + 严格帧率开关 */
var DEEP_LINK = args.indexOf('--deep-link') >= 0;
var STRICT_FPS = args.indexOf('--strict-fps') >= 0;

/* ---------- 定位浏览器 ---------- */
var fs = require('fs');
var CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
var BROWSER = null;
for (var i = 0; i < CANDIDATES.length; i++) {
  try { if (fs.statSync(CANDIDATES[i]).isFile()) { BROWSER = CANDIDATES[i]; break; } } catch (e) {}
}
if (!BROWSER) { console.error('browser-bugtest: 未找到 Chrome/Edge'); process.exit(2); }

/* ---------- 前置哨兵注入（错误捕获必须在所有脚本之前） ---------- */
var ERR_SENTINEL =
  'window.__stmErrors = [];\n' +
  'window.addEventListener("error", function (e) { window.__stmErrors.push(String(e.message || e.error)); });\n' +
  'window.addEventListener("unhandledrejection", function (e) { window.__stmErrors.push("promise:" + String(e.reason)); });\n';

/* ---------- T236 深链首帧采样器（必须在页面脚本之前注入） ----------
 * 为什么必须在页面内逐帧采样：CDP 往返 ~30~60ms，而落距窗口只有 400ms，
 * 从外面 poll 必然抓不到「首帧相位」。
 * 为什么必须包 requestAnimationFrame：只有这样才能拿到渲染器**真正使用**的那个
 * rAF 时间戳 ts，`dealStateOf().startTime` 与 ts 的差才是可比的相位证据；
 * 用 performance.now() 自测会引入「我的回调先于渲染器回调」的半帧误差。 */
var DEEP_LINK_SAMPLER = `(function(){
  var W = window.__dl = { s: [], geo: null, col: null };
  function blk(){
    var ids = ['modal-root','lobby','splash-screen','result-root','fail-root'];
    for (var i = 0; i < ids.length; i++){
      var el = document.getElementById(ids[i]);
      if (!el || el.hidden) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.02) return ids[i];
    }
    var b = document.getElementById('board');
    if (!b) return 'no-board';
    var r = b.getBoundingClientRect();
    return (r.width > 0 && r.height > 0) ? '' : 'zero-board';
  }
  function geoMap(){
    try {
      var s = STM.main.session(); if (!s) return null;
      var b = s.state().board, m = {};
      for (var i = 0; i < b.length; i++) m[b[i].id] = { z: b[i].z || 0, r: b[i].r, c: b[i].c };
      return m;
    } catch (e) { return null; }
  }
  function orderOk(g){
    if (!g) return null;
    var r = STM.main.renderer(); if (!r || !r.drawOrderOf) return null;
    var ord = r.drawOrderOf(), prev = null;
    for (var i = 0; i < ord.length; i++){
      var t = g[ord[i]]; if (!t) continue;
      var k = t.z * 10000 + t.r * 100 + t.c;
      if (prev !== null && k < prev) return false;
      prev = k;
    }
    return true;
  }
  /* #vfx-canvas 的 alpha > 2 像素数——**禁全画布 getImageData**
   * （840x1800 = 150 万像素，单次 100ms+，200ms 的坍缩窗会被整段跳过）。
   * 改逐行扫描（每 8 个设备行一条，整行宽）——覆盖 12.5% 行数、全宽度，
   * 光圈/星芒/粒子若复活必然跨多行，漏检概率可忽略。 */
  function vfxScan(){
    var cv = document.getElementById('vfx-canvas');
    if (!cv) return { err: 'no #vfx-canvas' };
    var ctx = cv.getContext('2d');
    var w = cv.width, h = cv.height, n = 0;
    try {
      for (var y = 0; y < h; y += 8){
        var d = ctx.getImageData(0, y, w, 1).data;
        for (var i = 3; i < d.length; i += 4) if (d[i] > 2) n++;
      }
    } catch (e) { return { err: 'getImageData: ' + e.message }; }
    return { nonZero: n, w: w, h: h, rows: Math.ceil(h / 8) };
  }
  /* 槽框**盒几何**签名（R6-G6）。
   * 为什么按 state 分键：有牌槽（has-tile / is-filled）与空槽的 border / background
   * 本来就不同（有牌 = 透明无边框），落牌 / 消牌引起的 state 翻转是**合法**的，
   * 直接整串比对会把 44 帧正常状态变化误判成「改形」。
   * 真正要抓的是：同一 state 下盒几何被演出改动（slot-shattering 若加了
   * border / padding / radius 就会在此暴露）。background 不进签名——它带
   * transition: background .2s，状态翻转后 200ms 内读到的是插值中间值；
   * 「演出 MUST NOT 改 background」由 render-selftest 的静态 CSS 断言覆盖。 */
  function boxOf(el){
    var cs = getComputedStyle(el);
    var cn = el.className || '';
    var state = (cn.indexOf('has-tile') >= 0 || cn.indexOf('is-filled') >= 0 ||
                 el.childElementCount > 0) ? 'T' : 'E';
    return {
      state: state,
      sh: cn.indexOf('slot-shattering') >= 0,
      g: [cs.borderTopWidth, cs.borderLeftWidth, cs.paddingTop, cs.paddingLeft,
          cs.borderTopLeftRadius, cs.borderBottomRightRadius].join('/')
    };
  }
  /* 贪心选牌：优先补满 dock 里**已有最多张**的那个花色。
   * 为什么不能只用「一次快照里的 3 张同花色」：L3 实测第 3 张在连点两张后
   * 变成 blocked（canTap 随局面变化），一次快照取 3 张会打出
   * ["flyout","flyout","blocked"] 而永远凑不成三消（假红灯）。 */
  function bestTapId(){
    try {
      var s = STM.main.session(), st = s.state(), eng = s.engineState(), RE = STM.RulesEngine;
      var cnt = {}, d = st.dock || [];
      for (var i = 0; i < d.length; i++){ var k = d[i].s | 0; cnt[k] = (cnt[k] || 0) + 1; }
      var best = null, bestSc = -1;
      for (var j = 0; j < st.board.length; j++){
        var b = st.board[j];
        if (!RE.canTap(eng, b.id)) continue;
        var sc = cnt[b.s | 0] || 0;
        if (sc > bestSc){ bestSc = sc; best = b.id; }
      }
      return best;
    } catch (e) { return null; }
  }
  function tappableTriple(){
    try {
      var s = STM.main.session(), st = s.state(), eng = s.engineState(), RE = STM.RulesEngine;
      var by = {};
      for (var i = 0; i < st.board.length; i++){
        var b = st.board[i];
        if (!RE.canTap(eng, b.id)) continue;
        var k = b.s | 0;
        if (!by[k]) by[k] = [];
        by[k].push(b.id);
      }
      for (var kk in by) if (by[kk].length >= 3) return by[kk].slice(0, 3);
      return null;
    } catch (e) { return null; }
  }
  /* 三消窗口采样：基线盒几何 → 连点三张 → 逐帧读 vfx 像素 + 槽框几何
   * 判据口径（与 delta27-verify ⑤ 同源）：
   *   · #vfx-canvas 在**飞牌离场段**本来就承载像素（棋盘外的那半张牌），
   *     所以 vfx 零像素只在「无在途飞行」的帧上断言；
   *   · 反向证据 = 飞行帧确有像素（证明画布通路仍在工作，不是「全黑假绿」）。 */
  W.col = function(){
    return new Promise(function(done){
      var firstIds = tappableTriple();
      if (!firstIds) { done({ err: 'no tappable triple' }); return; }
      var s = STM.main.session();
      var rnd = STM.main.renderer();
      var ns0 = document.querySelectorAll('#dock .slot');
      var ref = [];
      for (var b = 0; b < ns0.length; b++){
        ref[b] = {};
        var bx = boxOf(ns0[b]);
        ref[b][bx.state] = bx.g;
      }
      var frames = 0, maxPix = 0, maxPixFly = 0, flyFrames = 0, idleFrames = 0;
      var geomBad = 0, geomChecked = 0, sawShat = false, pixErr = null;
      var ti = 0, lastTap = -1e9, t0 = performance.now(), taps = [];
      var shatAt = -1;
      function step(){
        var now = performance.now();
        /* 连点：最多 6 次、每次间隔 90ms；看到坍缩后停手（不污染采样窗） */
        if (ti < 6 && now - lastTap > 90 && !(shatAt > 0 && now - shatAt > 260)){
          var id = bestTapId();
          if (id != null){
            var tr = null;
            try { tr = s.tap(id); } catch (eTap) { tr = { type: 'throw' }; }
            taps.push((tr && tr.type ? tr.type : 'null') + '#' + id);
          } else {
            taps.push('none');
          }
          ti++; lastTap = now;
        }
        var ns = document.querySelectorAll('#dock .slot');
        for (var i = 0; i < ns.length; i++){
          if (!ref[i]) ref[i] = {};
          var bx2 = boxOf(ns[i]);
          if (bx2.sh){ sawShat = true; if (shatAt < 0) shatAt = now; }
          if (ref[i][bx2.state] == null) ref[i][bx2.state] = bx2.g;
          else { geomChecked++; if (ref[i][bx2.state] !== bx2.g) geomBad++; }
        }
        var flying = 0;
        try { flying = (rnd && rnd.flightsOf) ? rnd.flightsOf().length : 0; } catch (eF) { flying = 0; }
        var px = vfxScan();
        if (px.err) pixErr = px.err;
        else if (flying > 0) { flyFrames++; if (px.nonZero > maxPixFly) maxPixFly = px.nonZero; }
        else { idleFrames++; if (px.nonZero > maxPix) maxPix = px.nonZero; }
        frames++;
        var stop = (shatAt > 0 && now - shatAt > 420) || now - t0 > 3000;
        if (!stop) requestAnimationFrame(step);
        else done({ frames: frames, maxPix: maxPix, maxPixFly: maxPixFly,
                    flyFrames: flyFrames, idleFrames: idleFrames,
                    geomBad: geomBad, geomChecked: geomChecked,
                    sawShat: sawShat, pixErr: pixErr,
                    slots: ns.length, taps: taps });
      }
      requestAnimationFrame(step);
    });
  };
  var orig = window.requestAnimationFrame;
  window.requestAnimationFrame = function(cb){
    return orig.call(window, function(ts){
      var ret = cb(ts);
      try {
        if (W.s.length < 2400){
          var r = (window.STM && STM.main && STM.main.renderer) ? STM.main.renderer() : null;
          var st = (r && r.dealStateOf) ? r.dealStateOf() : null;
          if (st){
            if (!W.geo) W.geo = geoMap();
            W.s.push({
              ts: Math.round(ts * 100) / 100,
              blk: blk(),
              st: st.startTime == null ? null : Math.round(st.startTime * 100) / 100,
              armed: st.armed, gf: st.gateFrames, act: st.active,
              tot: st.totalMs, md: st.maxDelay, wd: st.watchdog, rw: st.watchdogRearms,
              ord: orderOk(W.geo)
            });
            /* 相位取证帧：CDP 截图往返 200ms+（软件光栅），必然错过 400ms 的落距，
             * 故在**页面内**按相位直接从 #board 取 dataURL（file:// 已由
             * --allow-file-access-from-files 解 taint，getImageData 同样可用）。
             * 0.30 / 0.65 两个相位足以证明「牌在空中、且被 HUD 安全线裁掉上半」。 */
            if (st.startTime != null && st.active){
              var span = (st.maxDelay || 0) + 200;
              var ph = span > 0 ? (ts - st.startTime) / span : 0;
              var cvB = document.getElementById('board');
              if (cvB && cvB.toDataURL){
                if (!W.snap30 && ph >= 0.30){ try { W.snap30 = cvB.toDataURL('image/png'); } catch (e30) {} }
                if (!W.snap65 && ph >= 0.65){ try { W.snap65 = cvB.toDataURL('image/png'); } catch (e65) {} }
              }
            }
          }
        }
      } catch (e) {}
      return ret;
    });
  };
})();`;

/* ---------- CDP 客户端（内置 WebSocket，极简协议封装） ---------- */
function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var nextId = 1;
  var pending = {};
  var ready = null;
  var self = this;
  this.send = function (method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
  this.ready = new Promise(function (resolve) { ready = resolve; });
  ws.onopen = function () { ready(); };
  ws.onerror = function (err) { console.error('ws error', err); };
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

/* ---------- 主流程 ---------- */
var TMP = require('os').tmpdir() + '/stm-bugtest-profile';

/* 启动无头浏览器并连上 CDP（两条驱动共用：blocked-slider 场景 / 深链首帧场景） */
async function launchBrowser() {
  /* 1. 启动无头浏览器 */
  var PORT = 9222 + Math.floor(Math.random() * 500);
  var cp = require('child_process');
  var userDataDir = TMP + '-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--window-size=420,900',
    /* R5 修复：file:// 下 assets/ 的本地图片会把 #board 画布标记为 tainted，
     * 导致 colorAt() 的 getImageData 抛 SecurityError 而整条链路中断。
     * 加此开关让同目录 file:// 图片视作同源（不改交付形态，仍是双击 index.html）。 */
    '--allow-file-access-from-files',
    '--user-data-dir=' + userDataDir,
    'about:blank'
  ], { stdio: 'ignore' });

  /* 2. 等待 DevTools 端点 */
  var http = require('http');
  var targets = null;
  for (var t = 0; t < 40; t++) {
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
  if (!targets) { console.error('browser-bugtest: DevTools 端点未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: ERR_SENTINEL });
  return { c: c, proc: proc };
}

async function main() {
  var ctx0 = await launchBrowser();
  var c = ctx0.c;
  var proc = ctx0.proc;
  var cp = require('child_process');

  /* 3. 打开游戏（file:// 直载——宪章 file:// 零报错红线） */
  var path = require('path');
  var root = path.resolve(__dirname, '..');
  var url = 'file:///' + (root.replace(/\\/g, '/')) + '/index.html?level=' + LEVEL;
  if (PRE_FIX) {
    /* 红向对照: 注入 HEAD~1 版 BoardRenderer（内存覆盖磁盘加载的模块） */
    var pre = cp.execSync('git show HEAD~1:src/render/BoardRenderer.js', { cwd: root, maxBuffer: 32 * 1024 * 1024 }).toString();
    var inject = 'window.__preFixRenderer = ' + JSON.stringify(pre) + ';\n';
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: inject + ERR_SENTINEL });
    /* 先加载页面拿默认渲染器 → 替换 STM.createBoardRenderer → 重 boot */
    await c.send('Page.navigate', { url: url });
    await sleep(1200);
    var swap = '(function () { var s = document.createElement("script");' +
      's.textContent = "window.STM.createBoardRenderer = (function(f){ return function(c,sess,o){' +
      ' var r = f(c,sess,o); window.__replacedRenderer = r; return r; }; })(window.STM.createBoardRenderer);";' +
      'document.head.appendChild(s); })();';
    /* 直接 eval HEAD~1 全文覆盖模块工厂（IIFE 挂 STM 命名空间） */
    var applyPre = 'eval(window.__preFixRenderer); STM.main.boot(); location.reload();';
    await c.send('Runtime.evaluate', { expression: applyPre, awaitPromise: false });
    await sleep(1500);
  } else {
    await c.send('Page.navigate', { url: url });
    await sleep(1200);
  }

  /* 4. 页面就绪探针
   * Δ16d: 开机动画 2.0s + 淡出 0.38s 后才载入关卡（FR-038 时序）——改为轮询
   * 真实就绪信号 STM.main.session() 返回真会话（STM.main.session 恒为函数
   * 对象，真值性判断在关卡未载入时亦为真，会误报 READY） */
  var READY_EXPR = '(function(){try{return (typeof STM === "object" && STM.main && STM.main.session && STM.main.session()) ? "READY" : "NOT_READY";}catch(e){return "NOT_READY";}})()';
  var probe = { result: { value: 'NOT_READY' } };
  for (var wp = 0; wp < 160; wp++) {
    probe = await c.send('Runtime.evaluate', { expression: READY_EXPR, returnByValue: true });
    if (probe.result.value === 'READY') break;
    await sleep(50);
  }
  console.log('page state:', probe.result.value, '| level:', LEVEL, PRE_FIX ? '(PRE-FIX CODE)' : '(FIXED CODE)');
  if (probe.result.value !== 'READY') {
    var errs = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__stmErrors)', returnByValue: true });
    console.error('boot errors:', errs.result.value);
    c.close(); proc.kill(); process.exit(2);
  }
  return { c: c, proc: proc };
}

/* 导出给驱动层（同文件内完成全部断言更简单——直接续写） */
module.exports = { main: main };

/* =========================================================
 * T236 / R6 —— 深链首帧真机取证（--deep-link）
 *
 * 场景：`?level=N` 深链直载。`tryPrepareLobby()` 在 `#splash-screen` 仍 100%
 * 时就同步 `enterGame() → loadLevel() → startDeal()`，因此「遮罩背后的偷跑」
 * 与「遮罩撤掉后动画已过半」是同一根因的两个面。
 *
 * 实测基线（R6，本机 headless=new / --disable-gpu）：
 *   · `startDeal()` @ ≈0.6s；`#splash-screen` 移除 @ ≈4.6s
 *   · 旧「单次 1200ms 到期即 skipDeal()」口径 → 探针实测 `act=false`、
 *     `tot=400` 却**一帧未渲染**（整段雨幕被吞）。故看门狗改为「复查 + 重挂」，
 *     总预算 `GATE_WATCHDOG_MAX_MS = 8000`。
 *
 * 断言（三档 L3 / L33 / L72 各跑一遍）：
 *   ① 遮罩仍可见的每一帧：`startTime ≡ null`、`armed ≡ true`、`gateFrames ≡ 0`
 *   ② 遮挡期确实发生过看门狗重挂（`watchdogRearms >= 1`）——防「静置假绿」
 *   ③ 开闸首帧：`startTime === 该帧 rAF ts`（相位 = 0，≤1%）且遮罩已撤
 *   ④ `totalMs === maxDelay + TILE 260`（440~1000ms）；实测帧跨度 ∈ [终点, 终点+一个帧间隔]
 *   ⑤ 帧间隔 p95 ≤20ms / max ≤34ms（headless 软件渲染下仅报告；`--strict-fps` 硬断言）
 *   ⑥ 穿模帧 = 0（逐帧断言绘制序恒 `(z,r,c)` 升序）+ 反向证据（有序帧数 > 0）
 *   ⑦ 三消窗口内 `#vfx-canvas` alpha>2 像素数恒 0
 *   ⑧ 三消窗口内 `.slot` 计算样式逐项不变（border/padding/background/radius）
 * ========================================================= */
async function deepLinkDriver() {
  var fs = require('fs');
  var path = require('path');
  var root = path.resolve(__dirname, '..');
  var SHOT_DIR = root + '/shots/deeplink';
  try { fs.mkdirSync(SHOT_DIR, { recursive: true }); } catch (eMk) {}

  var ctx = await launchBrowser();
  var c = ctx.c;
  var failures = [];
  var report = { strictFps: STRICT_FPS, levels: [] };
  function check(name, cond, extra) {
    if (cond) console.log('  ✓ ' + name);
    else { failures.push(name); console.log('  ✗ ' + name + (extra ? ' [' + extra + ']' : '')); }
  }
  async function ev(expr, opts) {
    var r = await c.send('Runtime.evaluate', Object.assign(
      { expression: expr, returnByValue: true }, opts || {}));
    if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  }
  async function shot(name) {
    try {
      var r = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(SHOT_DIR + '/' + name, Buffer.from(r.data, 'base64'));
      return true;
    } catch (e) { console.log('  （截图失败 ' + name + ': ' + e.message + '）'); return false; }
  }
  function pct(arr, p) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[Math.min(a.length - 1, Math.floor(a.length * p))];
  }

  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: DEEP_LINK_SAMPLER });

  var SCALES = [{ lv: 3, tag: 'L3' }, { lv: 33, tag: 'L33' }, { lv: 72, tag: 'L72' }];
  try {
    for (var si = 0; si < SCALES.length; si++) {
      var sc = SCALES[si];
      console.log('\n[' + sc.tag + '] 深链 ?level=' + sc.lv + ' 首帧采样');
      var url = 'file:///' + root.replace(/\\/g, '/') + '/index.html?level=' + sc.lv;
      await c.send('Page.navigate', { url: url });

      /* 轮询到「会话就绪 + 首帧已开闸 + 编舞结束」；最多 12s（splash 实测 ≈4.6s） */
      var seen = false, waited = 0;
      while (waited < 12000) {
        await sleep(120);
        waited += 120;
        var v = await ev('(function(){ var S = (window.__dl && window.__dl.s) || [];' +
          ' if (!S.length) return "0"; var opened = false;' +
          ' for (var i = 0; i < S.length; i++) if (S[i].st != null) opened = true;' +
          ' var last = S[S.length - 1];' +
          ' return (opened ? "S" : "-") + (opened && last.act === false ? "F" : "-"); })()');
        if (v === 'SF') { seen = true; break; }
      }
      await shot('deeplink-' + sc.tag + '-settled.png');
      if (!seen) { check(sc.tag + ' 深链首屏编舞跑完（未超 12s 超时）', false, 'waited=' + waited); continue; }

      /* 相位取证帧（页面内 dataURL，见采样器注释）——落盘为 -phase30 / -phase65 */
      var snapA = await ev('window.__dl.snap30 || ""');
      var snapB = await ev('window.__dl.snap65 || ""');
      function writeDataUrl(name, url) {
        if (!url || url.indexOf('base64,') < 0) return false;
        try {
          fs.writeFileSync(SHOT_DIR + '/' + name, Buffer.from(url.split('base64,')[1], 'base64'));
          return true;
        } catch (e) { return false; }
      }
      var gotA = writeDataUrl('deeplink-' + sc.tag + '-phase30.png', snapA);
      var gotB = writeDataUrl('deeplink-' + sc.tag + '-phase65.png', snapB);
      check('相位取证帧已落盘（30% / 65% —— 证明牌确实在空中下落）',
        gotA && gotB, 'phase30=' + gotA + ' phase65=' + gotB);

      var raw = await ev('JSON.stringify(window.__dl.s)');
      var all = JSON.parse(raw || '[]');
      /* 同一 rAF 帧内可能有多个被包裹的回调 → 按 ts 去重（保留最后一条，
       * 即渲染器 frame() 跑完之后的状态） */
      var s = [], lastTs = -1;
      for (var i2 = 0; i2 < all.length; i2++) {
        if (all[i2].ts === lastTs) s[s.length - 1] = all[i2];
        else { s.push(all[i2]); lastTs = all[i2].ts; }
      }

      var masked = s.filter(function (x) { return x.blk !== ''; });
      var opened = s.filter(function (x) { return x.st != null; });
      var first = opened.length ? opened[0] : null;
      /* 「动画结束帧」= 开闸之后**第一个** `active === false` 的帧。
       * MUST NOT 用「最后一个 active === true 的帧」——那是结束帧的**前一帧**，
       * 会少算一整个帧间隔（实测把 400ms 读成 283ms，纯属度量口径错）。 */
      var endFrame = null;
      if (first) {
        for (var i3 = 0; i3 < s.length; i3++) {
          if (s[i3].ts > first.st && s[i3].act === false) { endFrame = s[i3]; break; }
        }
      }
      var rearmMax = 0;
      for (var i4 = 0; i4 < s.length; i4++) if ((s[i4].rw || 0) > rearmMax) rearmMax = s[i4].rw;

      /* ① 遮罩可见期 MUST NOT 记 t0 / MUST 处于起始态 */
      var badMasked = masked.filter(function (x) { return x.st !== null || x.armed !== true || x.gf !== 0; });
      check('① 遮罩仍可见时 startTime ≡ null / armed ≡ true / gateFrames ≡ 0',
        masked.length > 0 && badMasked.length === 0,
        '遮罩帧=' + masked.length + ' 违规=' + badMasked.length +
        (badMasked.length ? ' ' + JSON.stringify(badMasked[0]) : ''));
      /* ② 遮挡期确实重挂过（否则「静置」会把整段雨幕吞掉——真机红向判据） */
      check('② 遮挡期看门狗确实重挂（watchdogRearms >= 1，非静置）',
        rearmMax >= 1, 'rearms=' + rearmMax);
      /* ③ 开闸首帧相位 = 0 且遮罩已撤 */
      check('③ 开闸首帧遮罩已撤（MUST NOT 在遮挡期偷偷开闸）',
        !!first && first.blk === '', first ? 'blk="' + first.blk + '"' : 'no-open-frame');
      var phase = first ? (first.ts - first.st) / Math.max(1, first.tot) : 1;
      check('③ 首帧相位 = 0（≤1% —— 动画从 0 开始渲染，零偷跑）',
        !!first && Math.abs(first.ts - first.st) < 0.5 && phase <= 0.01,
        first ? 'ts-start=' + (first.ts - first.st).toFixed(2) + 'ms phase=' + (phase * 100).toFixed(2) + '%' : 'n/a');
      /* ④ 总时长 */
      /* 15 种编舞的权威口径：totalMs = maxDelay + TILE 260（LEAD 180 + SPREAD 340 + z·55 决定 maxDelay）。
       * 下界 = LEAD + TILE 440ms，上界 = 180+340+4×55+260 = 1000ms。 */
      check('④ totalMs ∈ [440,1000]（maxDelay + TILE 的真实窗口）',
        !!first && first.tot >= 440 && first.tot <= 1000, first ? 'total=' + first.tot : 'n/a');
      var span = (first && endFrame) ? (endFrame.ts - first.st) : -1;
      /* 实际编舞终点 = 计划里最晚起跑（`maxDelay`）+ 单牌时长 `TILE_MS`。
       * 15 种编舞里 `totalMs` 就定义为 `maxDelay + TILE`（无公式高估项），
       * 故此处两条断言互为交叉验证：`totalMs === endTheo`（±1ms 帧量化）。 */
      var TILE_MS = 260; /* 与 STM.rendererTest.INTRO.TILE_MS 同源（deal-smoke / render-selftest 断言） */
      var endTheo = first ? (first.md || 0) + TILE_MS : -1;
      /* 帧间隔（动画窗口内） */
      var iv = [];
      if (first && endFrame) {
        for (var i5 = 1; i5 < s.length; i5++) {
          if (s[i5].ts <= first.st || s[i5].ts > endFrame.ts) continue;
          iv.push(s[i5].ts - s[i5 - 1].ts);
        }
      }
      var p95 = pct(iv, 0.95), mx = iv.length ? Math.max.apply(null, iv) : 0;
      console.log('  帧间隔: n=' + iv.length + ' p50=' + pct(iv, 0.5).toFixed(1) +
        'ms p95=' + p95.toFixed(1) + 'ms max=' + mx.toFixed(1) + 'ms');
      check('④ 实际编舞终点（maxDelay + TILE）∈ [440,1000]',
        !!first && endTheo >= 440 && endTheo <= 1000,
        'endTheo=' + endTheo.toFixed(1) + ' maxDelay=' + (first ? first.md : '-'));
      check('④ totalMs === maxDelay + TILE（同源精确值，零高估）',
        !!first && Math.abs(first.tot - endTheo) <= 1,
        'total=' + (first ? first.tot : '-') + ' endTheo=' + endTheo.toFixed(1) +
        ' 差=' + (first ? (first.tot - endTheo).toFixed(1) : '-'));
      check('④ 实测帧跨度 ∈ [终点, 终点 + 一个帧间隔]（结束帧即第一个 active=false 帧）',
        !!first && span >= endTheo - 0.5 && span <= endTheo + mx + 1,
        'span=' + span.toFixed(1) + ' endTheo=' + endTheo.toFixed(1) + ' maxIv=' + mx.toFixed(1));
      if (STRICT_FPS) {
        check('⑤ 帧间隔 p95 ≤20ms / max ≤34ms（--strict-fps 硬门禁）',
          p95 <= 20 && mx <= 34, 'p95=' + p95.toFixed(1) + ' max=' + mx.toFixed(1));
      } else {
        /* headless=new + --disable-gpu 是软件光栅，帧率天然达不到 60fps
         * （实测 L3 p95 83ms / L33 167ms / L72 100ms，且样本只有 3~7 个帧间隔
         * ——n=3 的 p95 统计意义为零）。故默认只做两条**环境无关**的硬断言：
         *   ① 动画期至少采到 3 个帧间隔 → 证明是逐帧渲染，不是「1~2 帧落定」；
         *   ② 无 ≥250ms 级冻结 → 主循环未卡死。
         * 严格帧率门禁（p95 ≤20 / max ≤34）需真机前台运行并加 --strict-fps。 */
        check('⑤ 动画期逐帧渲染（帧间隔样本 >= 3，非「一帧落定」）',
          iv.length >= 3, 'n=' + iv.length);
        check('⑤ 无 250ms 级冻结（headless 软件光栅基线；严格 p95 门禁见 --strict-fps）',
          mx <= 250, 'max=' + mx.toFixed(1));
      }
      /* ⑥ 穿模帧 = 0 */
      var ordFalse = s.filter(function (x) { return x.ord === false; });
      var ordTrue = s.filter(function (x) { return x.ord === true; });
      check('⑥ 穿模帧 = 0（逐帧绘制序恒 (z,r,c) 升序）',
        ordFalse.length === 0, '违规帧=' + ordFalse.length);
      check('⑥ 反向证据：采样确有有效序帧（非「读不到序」的假绿）',
        ordTrue.length > 0, '有效序帧=' + ordTrue.length);

      /* ⑦⑧ 三消窗口：vfx 零像素 + 槽框计算样式不变 */
      var col = null;
      try {
        col = await ev('window.__dl.col()', { awaitPromise: true });
      } catch (eCol) { col = { err: eCol.message }; }
      if (col && !col.err) {
        check('⑦ 三消窗口内无在途飞行帧上 #vfx-canvas alpha>2 像素数恒 0',
          col.maxPix === 0 && !col.pixErr,
          'maxPix=' + col.maxPix + ' 空闲帧=' + col.idleFrames +
          ' 飞行帧=' + col.flyFrames + (col.pixErr ? ' err=' + col.pixErr : ''));
        check('⑦ 反向证据：飞牌期 VFX 层确有像素（画布通路仍在工作，非「全黑假绿」）',
          col.maxPixFly > 0, 'maxFly=' + col.maxPixFly);
        check('⑦ 采样窗内确实发生过三消演出（断言非空转）',
          col.sawShat === true, 'taps=' + JSON.stringify(col.taps) + ' ids=' + JSON.stringify(col.ids));
        check('⑧ .slot 盒几何逐项不变（同 state 下 border-width / padding / radius 零改形）',
          col.geomBad === 0 && col.geomChecked > 0,
          '违规=' + col.geomBad + ' 比对=' + col.geomChecked + ' 槽数=' + col.slots);
        await shot('deeplink-' + sc.tag + '-collapse.png');
      } else {
        check('⑦⑧ 三消窗口采样成功', false, col ? JSON.stringify(col.err) : 'null');
      }

      var errs = await ev('JSON.stringify(window.__stmErrors)');
      check('页面零未捕获异常（全程哨兵）', errs === '[]', errs);

      report.levels.push({
        tag: sc.tag, lv: sc.lv, frames: s.length, maskedFrames: masked.length,
        rearmMax: rearmMax, totalMs: first ? first.tot : null,
        maxDelay: first ? first.md : null, endTheoMs: endTheo,
        firstPhasePct: first ? +(phase * 100).toFixed(3) : null,
        spanMs: +span.toFixed(1), frameIntervals: { n: iv.length, p50: +pct(iv, 0.5).toFixed(1),
          p95: +p95.toFixed(1), max: +mx.toFixed(1) },
        ordViolations: ordFalse.length, ordValidFrames: ordTrue.length,
        collapse: col
      });
      console.log('  → ' + JSON.stringify({ total: first ? first.tot : null, endTheo: endTheo,
        span: +span.toFixed(1), rearm: rearmMax, p95: +p95.toFixed(1), max: +mx.toFixed(1),
        ordBad: ordFalse.length, vfxIdle: col ? col.maxPix : null,
        vfxFly: col ? col.maxPixFly : null, geomBad: col ? col.geomBad : null,
        shat: col ? col.sawShat : null }));
    }
  } catch (err) {
    failures.push('异常中断: ' + err.message);
    console.error('  ✗ 异常中断:', err.message);
  }

  try {
    fs.writeFileSync(SHOT_DIR + '/deeplink-report.json', JSON.stringify(report, null, 2));
    console.log('\n取证产物：shots/deeplink/（截图 + deeplink-report.json，不入库）');
  } catch (eW) {}

  console.log('');
  if (failures.length) {
    console.log('browser-bugtest(--deep-link): FAILED — ' + failures.join('; '));
    ctx.c.close(); ctx.proc.kill();
    process.exit(1);
  }
  console.log('browser-bugtest(--deep-link): all green（深链首帧零偷跑 + 三档 totalMs = maxDelay + TILE + 零穿模 + 零 vfx 残留 + 槽框零改形）');
  ctx.c.close();
  ctx.proc.kill();
  process.exit(0);
}

/* ---------- 独立运行入口: 执行 L1 blocked 场景三步走 ---------- */
(async function () {
  if (require.main !== module) return;
  if (DEEP_LINK) { await deepLinkDriver(); return; }
  var ctx = await main();
  var c = ctx.c;
  var failures = [];
  function check(name, cond, extra) {
    if (cond) console.log('  ✓ ' + name);
    else { failures.push(name); console.log('  ✗ ' + name + (extra ? ' [' + extra + ']' : '')); }
  }
  async function ev(expr, opts) {
    var r = await c.send('Runtime.evaluate', Object.assign(
      { expression: expr, returnByValue: true }, opts || {}));
    if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  }

  try {
    /* A. 错误哨兵基线 */
    var e0 = await ev('window.__stmErrors.length');
    check('页面加载零未捕获异常', e0 === 0, JSON.stringify(await ev('window.__stmErrors.slice(0,3)')));

    /* B. 枚举一枚受阻滑块（引擎侧快照试算——与 deadlockSuspect 同法） */
    var blockedId = await ev('(function () {' +
      ' var s = STM.main.session().engineState(); var RE = STM.RulesEngine;' +
      ' for (var i = 0; i < s.tiles.length; i++) {' +
      '   if (!RE.canTap(s, i)) continue;' +
      '   var snap = RE.snapshot(s); var r = RE.applyTap(s, i); RE.restore(s, snap);' +
      '   if (r.type === "blocked") return i;' +
      ' } return -1; })()');
    check('找到受阻滑块（tap 试算 type=blocked）', blockedId >= 0, 'id=' + blockedId);
    if (blockedId < 0) throw new Error('no blocked tile');

    var tile = await ev('(function () {' +
      ' var t = STM.main.session().engineState().tiles[' + blockedId + '];' +
      ' return JSON.stringify({ r: t.r, c: t.c, z: t.z, n: STM.main.session().state().n }); })()');
    var T = JSON.parse(tile);
    console.log('  目标滑块: id=' + blockedId + ' 格(' + T.r + ',' + T.c + ') z=' + T.z + ' ' + T.n + '×' + T.n);

    /* C. 计算点击坐标（格中心 → 画布 CSS 像素）
     * ⚠ 奇偶层半格偏移：渲染器把奇数层画在 `(r + 0.5, c + 0.5)`（见 BoardRenderer `rr/cc`），
     * 直接用 `(c + 0.5)/n` 会在奇数层偏半格 → `hitTest` 落空 → 引擎发 `click` 事件（**静音**），
     * 于是「受阻点击应有 knock」变成假红灯。中心必须按 `rr + 0.5` 算。 */
    var rect = await ev('(function () { var cv = document.getElementById("board"); var b = cv.getBoundingClientRect();' +
      ' var n = ' + T.n + '; return JSON.stringify({ x: b.left, y: b.top, w: b.width, h: b.height }); })()');
    var B = JSON.parse(rect);
    function centerOf(t) {
      var off = (t.z % 2 === 1) ? 0.5 : 0;
      return {
        x: B.x + B.w * (t.c + off + 0.5) / T.n,
        y: B.y + B.h * (t.r + off + 0.5) / T.n
      };
    }
    var pc = centerOf(T);
    var px = pc.x;
    var py = pc.y;

    /* C2. 命中层就绪：开机动画 `#splash-screen` 与大厅层都盖在棋盘上，
     * `session()` 变真**不等于**棋盘可点（实测 L3 上首点被遮罩吃掉 → 零音源假红灯）。
     * 轮询到点击点最顶层元素就是 `#board` 再往下走。 */
    var topTag = '';
    for (var wf = 0; wf < 60; wf++) {
      topTag = await ev('(function () {' +
        ' var sp = document.getElementById("splash-screen");' +
        ' if (sp && sp.parentNode) { var cs = getComputedStyle(sp); if (cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity || "1") > 0.05) return "splash"; }' +
        ' var el = document.elementFromPoint(' + px + ', ' + py + ');' +
        ' return el ? (el.id || el.className || el.tagName) : "none"; })()');
      if (topTag === 'board') break;
      await sleep(100);
    }
    check('点击点最顶层元素为棋盘（开机遮罩 / 大厅层已让位）', topTag === 'board', 'top=' + topTag);

    /* C3. 等进场编舞彻底结束再取基线色。
     * R6 之后深链 `?level=N` 的编舞**要等遮罩撤除才开播**（看门狗复查重挂，
     * 不再单次到期即静置），因此「遮罩让位」与「编舞结束」不再同一时刻。
     * 基线若取在挤压尾巴还在的那几帧，「block 结束后贴图回到原位」会读到
     * 亚像素差异而假红灯（实测 227,201,185 → 207,194,187，牌并未移动）。 */
    var dealWaited = 0;
    for (var wg = 0; wg < 120; wg++) {
      var dealing = await ev('(function(){ try { var r = STM.main.renderer();' +
        ' return (r && r.isDealing && r.isDealing()) ? 1 : 0; } catch (e) { return 0; } })()');
      if (!dealing) break;
      dealWaited += 50;
      await sleep(50);
    }
    console.log('  编舞收尾等待:', dealWaited + 'ms');
    await sleep(150);

    /* D. 取背景基线色（受阻滑块格旁空格中心） + 点击前该格色 */
    function colorAt(x, y) {
      return ev('(function () { var cv = document.getElementById("board"); var ctx = cv.getContext("2d");' +
        ' var n = ' + T.n + '; var dpr = cv.width / cv.getBoundingClientRect().width;' +
        ' var d = ctx.getImageData(Math.round(' + x + ' * dpr - cv.getBoundingClientRect().left * dpr),' +
        ' Math.round(' + y + ' * dpr - cv.getBoundingClientRect().top * dpr), 1, 1).data;' +
        ' return d[0] + "," + d[1] + "," + d[2] + "," + d[3]; })()');
    }
    var before = await colorAt(px, py);
    console.log('  点击前格中心色:', before);

    /* D1. 预热手势：`file://` 下 AudioContext 首次需要用户手势才解锁，而「第一次点击」
     * 有可能被 unlock()/BGM kick 吃掉（实测 L3 首点 osc=0，L12 因页面停留更久已解锁）。
     * 先在 document 上打一发空手势把音频解锁，再装探针，保证被测的那一次点击是**真的在发声**。 */
    await ev('(function () {' +
      ' var o = { bubbles: true, cancelable: true, clientX: 2, clientY: 2, pointerId: 99, isPrimary: true };' +
      ' document.body.dispatchEvent(new PointerEvent("pointerdown", o));' +
      ' document.body.dispatchEvent(new PointerEvent("pointerup", o));' +
      '})()');
    await sleep(150);

    /* D2. SC-024 ④ 真机音源探针：挂 createOscillator / createBufferSource 计数器，
     * 让下面这一次「受阻点击」的链路可被数出来（预期只有 knock 双叩 = 2 osc + 2 瞬态 buf）。
     * 两个必须注意的探针细节（否则断言会假绿）：
     *   ① `oscillator.type` 在**创建瞬间恒为默认 'sine'**，`o.type = 'square'` 是之后赋值的
     *      ——所以类型必须在 `start()` 时才读，否则「零 square/sawtooth」永远恒真；
     *   ② `frequency.value` 同理恒为 440，真实音高来自 `setValueAtTime`，必须钩住它记首值。 */
    await ev('(function () {' +
      ' window.__audioLog = [];' +
      ' if (window.__audioProbeInstalled) return;' +
      ' var AC = window.AudioContext || window.webkitAudioContext;' +
      ' if (!AC) return;' +
      ' var co = AC.prototype.createOscillator;' +
      ' AC.prototype.createOscillator = function () {' +
      '   var o = co.apply(this, arguments);' +
      '   var rec = { k: "osc", type: o.type, f: 0 };' +
      '   window.__audioLog.push(rec);' +
      '   try {' +
      '     var sv = o.frequency.setValueAtTime;' +
      '     o.frequency.setValueAtTime = function (v, t) {' +
      '       if (!rec.f) rec.f = v;' +
      '       return sv.apply(this, arguments); };' +
      '     var st = o.start;' +
      '     o.start = function () { rec.type = o.type; if (!rec.f) rec.f = o.frequency.value; return st.apply(this, arguments); };' +
      '   } catch (e) {}' +
      '   return o; };' +
      ' var cb = AC.prototype.createBufferSource;' +
      ' AC.prototype.createBufferSource = function () {' +
      '   var b = cb.apply(this, arguments); window.__audioLog.push({ k: "buf", type: "buffer", f: 0 }); return b; };' +
      ' window.__audioProbeInstalled = true;' +
      '})()');

    /* E. 点击（真实 input 事件→ pointerdown 管线）
     * 重试至多 3 次：进场编舞（400ms + 2 帧闸门）期间的点击会被 `isDealing()` 主动吞掉，
     * 首点落在编舞窗内就会得到 osc=0 的假红灯。只要拿到一次有声的链路就停。 */
    async function clickAndLog(x, y, pid) {
      await ev('window.__audioLog.length = 0');
      await ev('(function () { var cv = document.getElementById("board");' +
        ' var opts = { bubbles: true, cancelable: true, clientX: ' + x + ', clientY: ' + y + ', pointerId: ' + pid + ', isPrimary: true };' +
        ' cv.dispatchEvent(new PointerEvent("pointerdown", opts));' +
        ' cv.dispatchEvent(new PointerEvent("pointerup", opts)); })()');
      await sleep(120);
      return JSON.parse((await ev('JSON.stringify(window.__audioLog || [])')) || '[]');
    }
    var blockLog = [];
    for (var ba = 0; ba < 3; ba++) {
      blockLog = await clickAndLog(px, py, 1 + ba);
      if (blockLog.some(function (x) { return x.k === 'osc'; })) break;
      console.log('  （第 ' + (ba + 1) + ' 次点击无声——多半落在进场编舞窗内，重试）');
      await sleep(450);
    }
    await sleep(80);

    if (process.argv.indexOf('--debug-audio') >= 0) {
      var dbg = await ev('(function () {' +
        ' var out = {};' +
        ' var AC = window.AudioContext || window.webkitAudioContext;' +
        ' out.hasAC = !!AC;' +
        ' out.probeInstalled = !!window.__audioProbeInstalled;' +
        ' out.logLen = (window.__audioLog || []).length;' +
        ' try { out.scene = String(STM.main.scene && STM.main.scene()); } catch (e) { out.scene = "n/a"; }' +
        ' try { out.isDealing = String(STM.main.isDealing && STM.main.isDealing()); } catch (e) { out.isDealing = "n/a"; }' +
        ' return JSON.stringify(out); })()');
      console.log('  [debug] ' + dbg);
      /* 再试一次「合法飞出」的点击，看音频管线本身是否活着 */
      var legalId = await ev('(function () { var s = STM.main.session().engineState(); var RE = STM.RulesEngine;' +
        ' for (var i = 0; i < s.tiles.length; i++) { if (!RE.canTap(s, i)) continue;' +
        '   var snap = RE.snapshot(s); var r = RE.applyTap(s, i); RE.restore(s, snap);' +
        '   if (r.type === "flyout") return i; } return -1; })()');
      if (legalId >= 0) {
        var lt = JSON.parse(await ev('JSON.stringify(STM.main.session().engineState().tiles[' + legalId + '])'));
        var lx = B.x + B.w * (lt.c + 0.5) / T.n;
        var ly = B.y + B.h * (lt.r + 0.5) / T.n;
        var llog = await clickAndLog(lx, ly, 77);
        console.log('  [debug] 合法飞出点击 osc=' + llog.filter(function (x) { return x.k === 'osc'; }).length +
          ' types=[' + llog.filter(function (x) { return x.k === 'osc'; }).map(function (x) { return x.type; }).join(',') + ']');
      } else {
        console.log('  [debug] 无可飞出牌');
      }
    }

    /* E2. 受阻链路的音源断言（SC-024 ④）
     * 设计口径（SoundManager.triggerKnock）：单声 = 1 个三角振荡器 + 1 个瞬态噪声 bufferSource，
     * 双叩 = 2 osc + 2 buf。断言「恰好 2/2」而不是「buf = 0」——噪声瞬态是白瓷硬边的**设计成分**，
     * 不是第二音源；真正的缺陷判据是「有没有多出方波/扫频振荡器」。 */
    var bOsc = blockLog.filter(function (x) { return x.k === 'osc'; });
    var bBuf = blockLog.filter(function (x) { return x.k === 'buf'; });
    var bBad = bOsc.filter(function (x) { return x.type !== 'sine' && x.type !== 'triangle'; });
    console.log('  受阻点击音源: osc=' + bOsc.length + ' buf=' + bBuf.length +
      ' types=[' + bOsc.map(function (x) { return x.type; }).join(',') + ']');
    check('SC-024④ 受阻点击恰为 knock 双叩（2 osc + 2 瞬态 buf）',
      bOsc.length === 2 && bBuf.length === 2, 'osc=' + bOsc.length + ' buf=' + bBuf.length);
    check('SC-024④ 受阻零 square / sawtooth（无滑音方波叠加）', bBad.length === 0,
      bBad.map(function (x) { return x.type; }).join(','));

    /* F. blocked 生效确认（session actions 记账） */
    var blocked2 = await ev('(function () {' +
      ' var s = STM.main.session().engineState(); var RE = STM.RulesEngine;' +
      ' var snap = RE.snapshot(s); var r = RE.applyTap(s, ' + blockedId + '); RE.restore(s, snap);' +
      ' return r.type + "|" + s.actions.length; })()');
    console.log('  点击后: 引擎试算=' + blocked2.split('|')[0] + '（重复点击自身仍 blocked）');

    /* G. rAF 存活采样（600ms 窗口帧计数） */
      var frames = await ev('(function () { return new Promise(function (resolve) {' +
      ' var n = 0; var t0 = performance.now();' +
      ' function cb() { n++; if (performance.now() - t0 < 600) requestAnimationFrame(cb); else resolve(n); }' +
      ' requestAnimationFrame(cb); }); })()', { awaitPromise: true, returnByValue: true });
    check('rAF 主循环存活（600ms 内 ≥30 帧渲染管线持续）', frames >= 30, 'frames=' + frames);

    /* H. 动画结束后贴图存活（格中心色 ≠ 纯背景 #1B2430） */
    await sleep(700); /* block 360ms + 余量 */
    var after = await colorAt(px, py);
    console.log('  动画后格中心色:', after);
    check('受阻滑块贴图存活（格中心非背景色）', after !== '27,36,48,255', 'color=' + after + ' vs BG 27,36,48');
    check('贴图颜色与点击前一致（回到原位）', after === before, before + ' → ' + after);

    /* I. 二次点击同格（复现路径） */
    await ev('(function () { var cv = document.getElementById("board");' +
      ' var opts = { bubbles: true, cancelable: true, clientX: ' + px + ', clientY: ' + py + ', pointerId: 2, isPrimary: true };' +
      ' cv.dispatchEvent(new PointerEvent("pointerdown", opts));' +
      ' cv.dispatchEvent(new PointerEvent("pointerup", opts)); })()');
    await sleep(700);
    var after2 = await colorAt(px, py);
    var frames2 = await ev('(function () { return new Promise(function (resolve) {' +
      ' var n = 0; var t0 = performance.now();' +
      ' function cb() { n++; if (performance.now() - t0 < 600) requestAnimationFrame(cb); else resolve(n); }' +
      ' requestAnimationFrame(cb); }); })()', { awaitPromise: true, returnByValue: true });
    /* 存活判据（liveness）而非性能判据：本脚本跑在 `--headless=new --disable-gpu` 的软件渲染下，
     * 600ms 的帧数会随机器负载抖动（实测 26~40）。这里只回答「rAF 主循环还在不在跑」，
     * 40fps 已足以证明未卡死；**真实帧率门禁在 `delta27-verify` 的 p95 ≤20ms / max ≤34ms**。 */
    check('二次点击后 rAF 仍存活（liveness ≥24 帧/600ms）', frames2 >= 24, 'frames=' + frames2);
    check('二次点击后贴图仍存活', after2 === before, after2);

    /* J. 全程零未捕获异常（终检——修复前此处非零且含 TypeError） */
    var errsEnd = await ev('JSON.stringify(window.__stmErrors)');
    check('全程零未捕获异常（崩溃哨兵）', errsEnd === '[]', errsEnd);

    /* K. gear 同根路径（L6: 4 齿轮——点击任意飞出滑块触发齿轮转向动画） */
    var gearOk = await ev('(function () { return new Promise(function (resolve) {' +
      ' var s = STM.main.session().engineState(); var RE = STM.RulesEngine;' +
      ' for (var i = 0; i < s.tiles.length; i++) {' +
      '   if (!RE.canTap(s, i)) continue;' +
      '   var snap = RE.snapshot(s); var r = RE.applyTap(s, i);' +
      '   if (r.type === "flyout" && r.events.some(function (e) { return e.e === "gear"; })) {' +
      '     RE.restore(s, snap); resolve(i); return; }' +
      '   RE.restore(s, snap);' +
      ' } resolve(-1); }); })()', { awaitPromise: true });
    if (gearOk >= 0) {
      var gt = await ev('JSON.stringify(STM.main.session().engineState().tiles[' + gearOk + '])');
      var GT = JSON.parse(gt);
      var gc = centerOf(GT); /* 含奇偶层半格偏移，见 §C 注释 */
      var gpx = gc.x;
      var gpy = gc.y;

      /* K1. SC-024 ②③ 真机音源计数：复用 D2 已安装的探针（`__audioProbeInstalled`），
       * 只清空日志后点一次「会级联齿轮的飞出牌」，断言链路内只起 tap
       * （4 个正弦/三角振荡器 + 2 个瞬态噪声源，零 square/sawtooth）。
       * 这是「点角标牌 / 角标邻牌有奇怪杂音」缺陷的真机红向判据。 */
      await ev('window.__audioLog.length = 0');
      await ev('(function () { var cv = document.getElementById("board");' +
        ' var opts = { bubbles: true, cancelable: true, clientX: ' + gpx + ', clientY: ' + gpy + ', pointerId: 3, isPrimary: true };' +
        ' cv.dispatchEvent(new PointerEvent("pointerdown", opts));' +
        ' cv.dispatchEvent(new PointerEvent("pointerup", opts)); })()');
      await sleep(200);
      var alogRaw = await ev('JSON.stringify(window.__audioLog || [])');
      var alog = JSON.parse(alogRaw || '[]');
      var oscs = alog.filter(function (x) { return x.k === 'osc'; });
      var bufs = alog.filter(function (x) { return x.k === 'buf'; });
      var badTone = oscs.filter(function (x) { return x.type !== 'sine' && x.type !== 'triangle'; });
      console.log('  齿轮联动点击音源: osc=' + oscs.length + ' buf=' + bufs.length +
        ' types=[' + oscs.map(function (x) { return x.type; }).join(',') + ']');
      /* 设计口径（playTap）：4 个正弦/三角振荡器（body ×2 + dock ×2）+ 2 个瞬态噪声 bufferSource。
       * 旧缺陷（gear 方波 300→420Hz / 160ms）会让 osc 变 5 个且类型里出现 square。 */
      check('SC-024② 齿轮级联点击恰为 tap 单一音源（4 osc + 2 瞬态 buf）',
        oscs.length === 4 && bufs.length === 2, 'osc=' + oscs.length + ' buf=' + bufs.length);
      check('SC-024① 零 square / sawtooth（退役方波音未复活）', badTone.length === 0,
        badTone.map(function (x) { return x.type; }).join(','));

      /* K1b. 探针灵敏度自检（防「假绿」）：手动造一个 square 振荡器，断言探针**能**记到它。
       * 没有这一步，「零 square / sawtooth」可能只是因为探针永远只读到创建瞬间的默认 'sine'。 */
      await ev('(function () {' +
        ' var AC = window.AudioContext || window.webkitAudioContext;' +
        ' if (!AC) return;' +
        ' var c2 = new AC();' +
        ' var o = c2.createOscillator();' +
        ' o.type = "square";' +
        ' try { o.frequency.setValueAtTime(300, c2.currentTime); } catch (e) {}' +
        ' try { o.connect(c2.destination); o.start(); } catch (e) {}' +
        '})()');
      var selfLog = JSON.parse((await ev('JSON.stringify(window.__audioLog || [])')) || '[]');
      var sawSquare = selfLog.some(function (x) { return x.k === 'osc' && x.type === 'square'; });
      check('探针灵敏度自检：square 振荡器能被探针捕获（防假绿）', sawSquare,
        selfLog.map(function (x) { return x.k + ':' + x.type; }).join(','));
      await ev('window.__audioLog.length = 0');

      /* K2. SC-024 ③ 三类点击听感一致：再点一张**不触发齿轮**的飞出牌，
       * 断言两者的振荡器类型序列与频率表逐项相同（同一 STM.AUDIO_CONFIG.tap 引用，零按机制分流）。 */
      var plainOk = await ev('(function () { return new Promise(function (resolve) {' +
        ' var s = STM.main.session().engineState(); var RE = STM.RulesEngine;' +
        ' for (var i = 0; i < s.tiles.length; i++) {' +
        '   if (!RE.canTap(s, i)) continue;' +
        '   var snap = RE.snapshot(s); var r = RE.applyTap(s, i);' +
        '   if (r.type === "flyout" && !r.events.some(function (e) { return e.e === "gear"; })) {' +
        '     RE.restore(s, snap); resolve(i); return; }' +
        '   RE.restore(s, snap);' +
        ' } resolve(-1); }); })()', { awaitPromise: true });
      if (plainOk >= 0) {
        var pt = JSON.parse(await ev('JSON.stringify(STM.main.session().engineState().tiles[' + plainOk + '])'));
        var pcx = centerOf(pt); /* 含奇偶层半格偏移 */
        var ppx = pcx.x;
        var ppy = pcx.y;
        await ev('window.__audioLog.length = 0');
        await ev('(function () { var cv = document.getElementById("board");' +
          ' var opts = { bubbles: true, cancelable: true, clientX: ' + ppx + ', clientY: ' + ppy + ', pointerId: 4, isPrimary: true };' +
          ' cv.dispatchEvent(new PointerEvent("pointerdown", opts));' +
          ' cv.dispatchEvent(new PointerEvent("pointerup", opts)); })()');
        await sleep(200);
        var plog = JSON.parse((await ev('JSON.stringify(window.__audioLog || [])')) || '[]');
        var posc = plog.filter(function (x) { return x.k === 'osc'; });
        var gearProfile = oscs.map(function (x) { return x.type + '@' + Math.round(x.f); }).join('|');
        var plainProfile = posc.map(function (x) { return x.type + '@' + Math.round(x.f); }).join('|');
        console.log('  普通飞出点击音源: osc=' + posc.length + ' profile=' + plainProfile);
        check('SC-024③ 齿轮牌与普通牌点击的 tap 参数逐项相同', gearProfile === plainProfile,
          gearProfile + ' vs ' + plainProfile);
      } else {
        console.log('  （本关无可对照的普通飞出——跳过 SC-024③）');
      }

      await sleep(400);
      var frames3 = await ev('(function () { return new Promise(function (resolve) {' +
        ' var n = 0; var t0 = performance.now();' +
        ' function cb() { n++; if (performance.now() - t0 < 400) requestAnimationFrame(cb); else resolve(n); }' +
        ' requestAnimationFrame(cb); }); })()', { awaitPromise: true, returnByValue: true });
      check('齿轮联动动画路径 rAF 存活（同根缺陷回归）', frames3 >= 20, 'frames=' + frames3);
    } else {
      console.log('  （本关无可触发齿轮联动的飞出——跳过 K；用 --level 12 可覆盖）');
    }

    var errsFinal = await ev('JSON.stringify(window.__stmErrors)');
    check('终态错误哨兵仍为空', errsFinal === '[]', errsFinal);
  } catch (err) {
    failures.push('异常中断: ' + err.message);
    console.error('  ✗ 异常中断:', err.message);
  }

  console.log('');
  if (failures.length) {
    console.log('browser-bugtest: FAILED — ' + failures.join('; '));
    ctx.c.close(); ctx.proc.kill();
    process.exit(1);
  }
  console.log('browser-bugtest: all green（真机 CDP: blocked 点击全流程贴图存活 + rAF 存活 + 零未捕获异常 + SC-024 音源唯一性' + (PRE_FIX ? '【红向】' : '') + '）');
  ctx.c.close();
  ctx.proc.kill();
  process.exit(0);
})().catch(function (e) {
  console.error('browser-bugtest fatal:', e.message);
  process.exit(2);
});
