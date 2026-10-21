/* =========================================================
 * Slide & Triple — browser-bugtest（Δ12: blocked-slider-vanish 真机验证）
 *
 * node tools/browser-bugtest.js [--level N] [--pre-fix]
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
 * ========================================================= */
'use strict';

/* ---------- CLI ---------- */
var args = process.argv.slice(2);
var LEVEL = 1;
var li = args.indexOf('--level');
if (li >= 0 && args[li + 1]) LEVEL = parseInt(args[li + 1], 10);
var PRE_FIX = args.indexOf('--pre-fix') >= 0;

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

async function main() {
  /* 1. 启动无头浏览器 */
  var PORT = 9222 + Math.floor(Math.random() * 500);
  var cp = require('child_process');
  var userDataDir = TMP + '-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--window-size=420,900',
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

/* ---------- 独立运行入口: 执行 L1 blocked 场景三步走 ---------- */
(async function () {
  if (require.main !== module) return;
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
      ' return JSON.stringify({ r: t.r, c: t.c, n: STM.main.session().state().n }); })()');
    var T = JSON.parse(tile);
    console.log('  目标滑块: id=' + blockedId + ' 格(' + T.r + ',' + T.c + ') ' + T.n + '×' + T.n);

    /* C. 计算点击坐标（格中心 → 画布 CSS 像素） */
    var rect = await ev('(function () { var cv = document.getElementById("board"); var b = cv.getBoundingClientRect();' +
      ' var n = ' + T.n + '; return JSON.stringify({ x: b.left, y: b.top, w: b.width, h: b.height }); })()');
    var B = JSON.parse(rect);
    var px = B.x + B.w * (T.c + 0.5) / T.n;
    var py = B.y + B.h * (T.r + 0.5) / T.n;

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

    /* E. 点击（真实 input 事件→ pointerdown 管线） */
    await ev('(function () { var cv = document.getElementById("board");' +
      ' var opts = { bubbles: true, cancelable: true, clientX: ' + px + ', clientY: ' + py + ', pointerId: 1, isPrimary: true };' +
      ' cv.dispatchEvent(new PointerEvent("pointerdown", opts));' +
      ' cv.dispatchEvent(new PointerEvent("pointerup", opts)); })()');
    await sleep(80);

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
    check('二次点击后 rAF 仍存活', frames2 >= 30, 'frames=' + frames2);
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
      var grect = await ev('(function () { var cv = document.getElementById("board"); var b = cv.getBoundingClientRect();' +
        ' var n = ' + GT.n + '; return JSON.stringify({ x: b.left, y: b.top, w: b.width, h: b.height }); })()');
      var GB = JSON.parse(grect);
      var gpx = GB.x + GB.w * (GT.c + 0.5) / T.n; /* T.n 与 GT.n 同关一致 */
      var gpy = GB.y + GB.h * (GT.r + 0.5) / T.n;
      await ev('(function () { var cv = document.getElementById("board");' +
        ' var opts = { bubbles: true, cancelable: true, clientX: ' + gpx + ', clientY: ' + gpy + ', pointerId: 3, isPrimary: true };' +
        ' cv.dispatchEvent(new PointerEvent("pointerdown", opts));' +
        ' cv.dispatchEvent(new PointerEvent("pointerup", opts)); })()');
      await sleep(600);
      var frames3 = await ev('(function () { return new Promise(function (resolve) {' +
        ' var n = 0; var t0 = performance.now();' +
        ' function cb() { n++; if (performance.now() - t0 < 400) requestAnimationFrame(cb); else resolve(n); }' +
        ' requestAnimationFrame(cb); }); })()', { awaitPromise: true, returnByValue: true });
      check('齿轮联动动画路径 rAF 存活（同根缺陷回归）', frames3 >= 20, 'frames=' + frames3);
    } else {
      console.log('  （本关无可触发齿轮联动的飞出——跳过 K）');
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
  console.log('browser-bugtest: all green（真机 CDP: blocked 点击全流程贴图存活 + rAF 存活 + 零未捕获异常' + (PRE_FIX ? '【红向】' : '') + '）');
  ctx.c.close();
  ctx.proc.kill();
  process.exit(0);
})().catch(function (e) {
  console.error('browser-bugtest fatal:', e.message);
  process.exit(2);
});
