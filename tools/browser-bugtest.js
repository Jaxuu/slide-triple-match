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
/* R5 修复：默认关卡改为 3 —— `main.js` 的深链条件是 `if (deepIdGlobal > 1) enterGame(...)`，
 * `?level=1` 不触发进关，就绪探针会一直 NOT_READY 并 exit 2（与本缺陷无关的假红灯）。 */
var LEVEL = 3;
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
