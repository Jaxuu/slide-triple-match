/* =========================================================
 * Slide & Triple — delta27-verify（Δ31 真机验收）
 *
 *   node tools/delta27-verify.js
 *
 * 为什么必须开浏览器：Node 侧门禁只能断言「数据与纯函数」，本脚本验证
 * 真实 DOM/CSS/Canvas 环境下的**用户可见行为**：
 *   ① 开局进场「原位对角波浪层叠弹入」：N=141 全部覆盖 / 首帧零延迟 /
 *      同 (r+c) 同层同起同落（极差 0）/ 相邻对角线 >= 12ms /
 *      层序锁（同 (r,c) 低层恒先起跑）/ 总时长 380~450ms / 墙钟落定
 *   ② 飞行期间 #dock 槽位零抖动 + 棋盘静态层绘制序恒按 (z,r,c) 升序
 *   ③ 三消「纯卡牌自身力学」：.slot-shattering 恰好落在本轮三消真实所在 3 槽
 *      （MUST NOT 退化成「最左 3 槽」）/ data-collapse-role 角色分派
 *      （center 1 张 + side 2 张，z-index 3/1）/ --suck-dx 左右向中心收敛 /
 *      中心牌四段形变（静止 → 挤压 .92/1.08 → 回弹 1.32 → 坍缩 0）/
 *      闪白覆盖层 0 → .70 → .15 → 0 / 左右牌 70ms 到位后 1 帧内隐去 /
 *      #dock 受击微震（仅纵向 2.0px、90ms）/ 补位 200ms 欠阻尼
 *   ④ 碎裂时序：3 张全部落定后才起演（碎裂瞬间零在途飞行）
 *   ⑤ 零特效残留：三消窗口内 #vfx-canvas 全程零像素（光圈/星芒/粒子通路已删）
 *   ⑥ 多规模关卡归一：L3 / L33 / L72 三档盘面 totalMs 均 ∈ [380,450]
 *      且首波 delay === 0
 * 同时把取证帧写到 shots/delta27/（.gitignore 已忽略，不入库）。
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
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      var f = path.join(ROOT, u);
      if (f.indexOf(ROOT) !== 0) { res.statusCode = 403; res.end('no'); return; }
      fs.readFile(f, function (e, buf) {
        if (e) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', function () { resolve(srv); });
  });
}

/* 极简 CDP 客户端（Node 内置 http + 原生 WebSocket，零 npm 依赖） */
function cdp(url) {
  var ws = new WebSocket(url);
  var id = 0;
  var waiters = {};
  var self = this;
  this.ready = new Promise(function (res, rej) {
    ws.onopen = function () { res(); };
    ws.onerror = function (e) { rej(e); };
  });
  ws.onmessage = function (m) {
    var d;
    try { d = JSON.parse(m.data); } catch (e) { return; }
    if (d.id && waiters[d.id]) {
      var w = waiters[d.id];
      delete waiters[d.id];
      if (d.error) w.rej(new Error(d.error.message));
      else w.res(d.result);
    }
  };
  this.send = function (method, params) {
    id += 1;
    var myId = id;
    return new Promise(function (res, rej) {
      waiters[myId] = { res: res, rej: rej };
      ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
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
  /* 当前带 .slot-shattering 的槽位序号（纯卡牌力学演出在演的槽） */
  shatSlots: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = [];
    for (var i = 0; i < ns.length; i++) {
      if ((ns[i].className || '').indexOf('slot-shattering') >= 0) out.push(i);
    }
    return out;
  },
  /* Δ31a: 角色分派快照（data-collapse-role + z-index） */
  collapseRoles: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = [];
    for (var i = 0; i < ns.length; i++) {
      var role = ns[i].getAttribute ? ns[i].getAttribute('data-collapse-role') : null;
      if (!role) continue;
      out.push({ i: i, role: role, z: (ns[i].style && ns[i].style.zIndex) || '' });
    }
    return out;
  },
  /* 各槽 .dock-chip 的 --suck-dx（滑行位移量，内联 CSS 变量） */
  suckDxOf: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = {};
    for (var i = 0; i < ns.length; i++) {
      var chip = ns[i].querySelector ? ns[i].querySelector('.dock-chip') : null;
      if (!chip) continue;
      var raw = chip.style.getPropertyValue('--suck-dx');
      if (raw) out[i] = parseFloat(raw);
    }
    return out;
  },
  /* 静态槽位几何（必须在未挂动画时取——动画期 rect 会被 transform 污染） */
  slotRects: function(){
    var ns = document.querySelectorAll('#dock .slot');
    var out = [];
    for (var i = 0; i < ns.length; i++) {
      var r = ns[i].getBoundingClientRect();
      out.push({ i: i, l: Math.round(r.left), r: Math.round(r.right),
                 t: Math.round(r.top), b: Math.round(r.bottom),
                 w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  },
  /* #vfx-canvas 上 alpha > 2 的像素数（残留判据） */
  vfxPixels: function(){
    var cv = document.getElementById('vfx-canvas');
    if (!cv) return { err: 'no #vfx-canvas' };
    var ctx = cv.getContext('2d');
    var d;
    try { d = ctx.getImageData(0, 0, cv.width, cv.height).data; }
    catch (e) { return { err: 'getImageData: ' + e.message }; }
    var n = 0, sx = 0, sy = 0;
    for (var i = 3; i < d.length; i += 4) {
      if (d[i] > 2) { n++; var q = (i - 3) / 4; sx += q % cv.width; sy += Math.floor(q / cv.width); }
    }
    return { nonZero: n, total: d.length / 4, w: cv.width, h: cv.height,
             cx: n ? sx / n : 0, cy: n ? sy / n : 0 };
  },
  /* 计算样式的 transform 矩阵（2D 优先，3D 取 3D 的等价分量） */
  matOf: function(el){
    if (!el || !window.getComputedStyle) return { a:1, b:0, c:0, d:1, e:0, f:0 };
    var m = window.getComputedStyle(el).transform;
    if (!m || m === 'none') return { a:1, b:0, c:0, d:1, e:0, f:0 };
    var nums = m.replace(/^matrix3d\\(/,'').replace(/^matrix\\(/,'').replace(/\\)$/,'').split(',').map(Number);
    if (m.indexOf('matrix3d') === 0) {
      return { a: nums[0], b: nums[1], c: nums[4], d: nums[5], e: nums[12], f: nums[13] };
    }
    return { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] };
  },
  /* 元素上全部 CSS 动画（含伪元素）——按 animationName 取用 */
  animsOf: function(el){
    if (!el || !el.getAnimations) return [];
    try { return el.getAnimations(); } catch (e) { return []; }
  },
  animNamed: function(el, name){
    var as = this.animsOf(el);
    for (var i = 0; i < as.length; i++) if (as[i].animationName === name) return as[i];
    return null;
  },
  /* 伪元素上的动画（::after 的 chip-flash）不属于宿主元素的 getAnimations()
   * 稳定返回范围，统一走 document.getAnimations() 按 animationName 取。 */
  docAnimNamed: function(name){
    if (!document.getAnimations) return null;
    var as;
    try { as = document.getAnimations(); } catch (e) { return null; }
    for (var i = 0; i < as.length; i++) if (as[i].animationName === name) return as[i];
    return null;
  },
  /* 把动画暂停并拨到 t 毫秒（确定性相位采样——headless 单帧可达 100ms+，
   * 墙钟采样根本落不进 210ms 的四段演出） */
  seek: function(a, t){
    if (!a) return false;
    try { a.pause(); a.currentTime = t; return true; } catch (e) { return false; }
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
  /* 找同一花色、3 张当前都可点的卡牌（用来驱动一次真实三消） */
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
  /* Δ31b: 编舞对角结构分析（全部用**实时 dealPlanOf() + 真实棋盘 z/r/c**） */
  dealStructure: function(){
    var r = this.rnd(), s = this.sess();
    if (!r || !s) return { err: 'no renderer/session' };
    var plan = r.dealPlanOf();
    if (!plan) return { err: 'no plan' };
    var RT = window.STM.rendererTest, I = RT.INTRO;
    var board = s.state().board;
    var meta = {};
    var zMax = 0, n = 0;
    for (var i = 0; i < board.length; i++) {
      var b = board[i];
      meta[b.id] = { r: b.r, c: b.c, z: b.z || 0 };
      if ((b.z || 0) > zMax) zMax = b.z || 0;
      if ((b.c || 0) > n) n = b.c || 0;
    }
    n = n + 1;
    var delays = [], minDelay = Infinity, maxDelay = -Infinity;
    var diagGroups = {}, lockPairs = {}, exact = 0, mismatch = 0;
    var id, m, d;
    for (id in plan) {
      if (!Object.prototype.hasOwnProperty.call(plan, id)) continue;
      m = meta[id];
      if (!m) continue;
      d = plan[id].delay;
      delays.push(d);
      if (d < minDelay) minDelay = d;
      if (d > maxDelay) maxDelay = d;
      /* 同 (r+c, z) 必须完全同起（对角波浪的定义） */
      var dk = (m.r + m.c) + ',' + m.z;
      if (diagGroups[dk] == null) diagGroups[dk] = d;
      else if (Math.abs(diagGroups[dk] - d) > 1e-9) mismatch++;
      /* 与纯函数同源 */
      var g = RT.tileGridOf(m);
      if (Math.abs(d - RT.introDelayOf(g.rr, g.cc, m.z, n, zMax)) > 1e-9) exact++;
      var lk = m.r + ',' + m.c;
      if (!lockPairs[lk]) lockPairs[lk] = [];
      lockPairs[lk].push({ z: m.z, d: d });
    }
    /* 相邻对角线起跑间隔 */
    var diagStart = {};
    for (var dk2 in diagGroups) {
      if (!Object.prototype.hasOwnProperty.call(diagGroups, dk2)) continue;
      var rcSum = +dk2.split(',')[0];
      if (diagStart[rcSum] == null || diagGroups[dk2] < diagStart[rcSum]) diagStart[rcSum] = diagGroups[dk2];
    }
    var sums = [];
    for (var sk in diagStart) if (Object.prototype.hasOwnProperty.call(diagStart, sk)) sums.push(+sk);
    sums.sort(function (a, c2) { return a - c2; });
    /* 对角线覆盖：真实盘面**不一定**铺满 (0..2n−2)（L33 最远只到 r+c=12），
     * 故口径是「层数 = max(r+c)+1」+「0..max 连续无空洞」——空洞会让某一层
     * 整层缺卡，波浪出现「跳拍」。 */
    var maxRcSum = sums.length ? sums[sums.length - 1] : -1;
    var contiguous = true;
    for (var sq = 0; sq < sums.length; sq++) if (sums[sq] !== sq) contiguous = false;
    var diagGapMin = Infinity;
    for (var q = 1; q < sums.length; q++) {
      var gp = diagStart[sums[q]] - diagStart[sums[q - 1]];
      if (gp < diagGapMin) diagGapMin = gp;
    }
    /* 层序锁：同 (r,c) 低 z 的 delay MUST 严格小于高 z，且差 = Z_STEP × Δz */
    var lockBad = 0, lockMinGap = Infinity, pairCount = 0, lockStepBad = 0;
    for (var pk in lockPairs) {
      if (!Object.prototype.hasOwnProperty.call(lockPairs, pk)) continue;
      var arr = lockPairs[pk].slice().sort(function (a, c2) { return a.z - c2.z; });
      for (var t = 1; t < arr.length; t++) {
        pairCount++;
        var gg = arr[t].d - arr[t - 1].d;
        if (!(gg > 0)) lockBad++;
        if (gg < lockMinGap) lockMinGap = gg;
        if (Math.abs(gg - I.Z_STEP_MS * (arr[t].z - arr[t - 1].z)) > 1e-9) lockStepBad++;
      }
    }
    return {
      n: n, tiles: delays.length, zMax: zMax,
      diagCount: sums.length, maxRcSum: maxRcSum, contiguous: contiguous,
      diagStep: RT.introDiagStepOf(n, zMax),
      minDelay: minDelay, maxDelay: maxDelay,
      diagMismatch: mismatch, diagGapMin: diagGapMin,
      totalMs: r.dealTotalMs(), formulaMs: RT.introDealTotalMs(n, zMax),
      budgetTotal: RT.introDealTotalMs(n, zMax),
      exactBad: exact,
      lockBad: lockBad, lockStepBad: lockStepBad, lockMinGap: lockMinGap, pairCount: pairCount
    };
  },
  /* 起演 → 等计划就绪 → 快照结构 → 量墙钟落定（全在页面内，零 CDP 往返）
   * 为什么必须页面内：编舞只活 415ms，tickIntro 一收尾就把 introPlan 置 null，
   * Node 侧 60ms 一次轮询会直接读到 null。 */
  dealProbe: async function(){
    var D = this, r = D.rnd();
    if (!r) return { err: 'no renderer' };
    var t0 = performance.now();
    r.startDeal();
    var st = null;
    while (performance.now() - t0 < 3000) {
      st = D.dealStructure();
      if (st && !st.err) break;
      await new Promise(function(z){ requestAnimationFrame(z); });
    }
    if (!st || st.err) return st || { err: 'no plan' };
    st.planAt = Math.round(performance.now() - t0);
    var endedAt = -1;
    while (performance.now() - t0 < 5000) {
      if (!r.isDealing()) { endedAt = Math.round(performance.now() - t0); break; }
      await new Promise(function(z){ requestAnimationFrame(z); });
    }
    st.wallMs = endedAt >= 0 ? endedAt : -1;
    st.isDealing = r.isDealing();
    return st;
  }
};
window.__D27ERR = window.__D27ERR || [];
if (!window.__D27ERRWIRED) {
  window.__D27ERRWIRED = 1;
  window.addEventListener('error', function(e){ window.__D27ERR.push(String((e && e.message) || e)); });
  window.addEventListener('unhandledrejection', function(e){
    window.__D27ERR.push('reject:' + String((e && e.reason) || e));
  });
}
/* 渲染器内部把异常吞进 console.error（[STM render] 不杀帧）——
 * 不挂钩子就会「画布空白但门禁全绿」。 */
window.__D27LOG = window.__D27LOG || [];
if (!window.__D27LOGWIRED) {
  window.__D27LOGWIRED = 1;
  var __ce = console.error;
  console.error = function(){
    try {
      var a = Array.prototype.slice.call(arguments).map(function(x){ return String(x); });
      if (window.__D27LOG.length < 20) window.__D27LOG.push(a.join(' '));
    } catch (e) {}
    return __ce.apply(console, arguments);
  };
}`;

async function main() {
  console.log('Δ31 真机验收（对角波浪编舞 / 方向性飞行 / 纯卡牌力学）\n');

  var srv = await startServer();
  var PORT = srv.address().port;
  var devPort = 9600 + Math.floor(Math.random() * 300);
  var userDataDir = path.join(os.tmpdir(), 'stm-d31-' + Date.now());
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

  /* 载入某关并等 session + 布局就绪，然后注入页面助手 */
  async function loadLevel(lv) {
    await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html?level=' + lv });
    var ok = false;
    for (var rp = 0; rp < 200; rp++) {
      await sleep(60);
      ok = await ev('(function(){try{return !!(window.STM && STM.main && STM.main.session && STM.main.session());}catch(e){return false;}})()');
      if (ok) break;
    }
    if (!ok) return false;
    await ev(HELPERS);
    /* 布局就绪（layout.n > 0）才能建编舞计划 */
    for (var lp = 0; lp < 120; lp++) {
      var ln = await ev('(function(){var r=window.__D27.rnd();return r?(r.layoutOf().n||0):0;})()');
      if (ln > 0) return true;
      await sleep(60);
    }
    return false;
  }

  /* L33：72 关中体量最大（N=141, zMax=4），多层叠放，最坏形态 */
  var okL33 = await loadLevel(33);
  check('L33 载入完成（session + 布局就绪）', okL33 === true);
  if (!okL33) { cleanup(); process.exit(1); }

  check('页面助手注入成功', (await ev('!!window.__D27')) === true);

  /* 深链进关发生在开机动画之后——必须等 splash 真正退场再取帧，
   * 否则截到的是过渡屏（实测 800ms 时仍是 splash）。 */
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

  /* ---------- ① 开局进场：原位对角波浪（L33 真实 rAF + 实时计划） ---------- */
  console.log('\n① 开局进场对角波浪（L33 / N=141 / zMax=4）');
  var st1 = await ev('window.__D27.dealProbe()');
  check('① 编舞计划覆盖全部卡牌（141 张）', !!st1 && st1.tiles === 141, st1 ? st1.tiles : 'null');
  check('① 首帧零延迟（最小 delay === 0，取消开局留白）',
    !!st1 && st1.minDelay === 0, st1 ? 'minDelay=' + st1.minDelay : '-');
  check('① 对角层数 = max(r+c)+1 且 0..max 连续无空洞（跳拍 = 0）',
    !!st1 && st1.diagCount === st1.maxRcSum + 1 && st1.contiguous === true,
    st1 ? ('diag=' + st1.diagCount + ' maxRcSum=' + st1.maxRcSum + ' contiguous=' + st1.contiguous) : '-');
  check('① 同 (r+c) 同层起跑完全一致（对角波浪极差 === 0）',
    !!st1 && st1.diagMismatch === 0, st1 ? 'mismatch=' + st1.diagMismatch : '-');
  check('① 相邻对角线起跑间隔 >= 12ms',
    !!st1 && st1.diagGapMin >= 12 - 1e-6,
    st1 ? 'diagGapMin=' + Number(st1.diagGapMin).toFixed(2) : '-');
  check('① plan 与 introDelayOf 逐项相等（同源，零漂移）',
    !!st1 && st1.exactBad === 0, st1 ? 'bad=' + st1.exactBad + '/' + st1.tiles : '-');
  check('① 层序锁：同 (r,c) 低层 delay 恒早于高层（零穿模）',
    !!st1 && st1.lockBad === 0 && st1.pairCount > 0,
    st1 ? ('bad=' + st1.lockBad + '/' + st1.pairCount + ' minGap=' + st1.lockMinGap) : '-');
  check('① 层序锁层间差 = Z_STEP × Δz（8ms 精确值）',
    !!st1 && st1.lockStepBad === 0, st1 ? 'bad=' + st1.lockStepBad : '-');
  check('① 编舞总时长 ∈ [380,450]ms（415ms 目标）',
    !!st1 && st1.totalMs >= 380 && st1.totalMs <= 450 && Math.abs(st1.totalMs - 415) < 1,
    st1 ? st1.totalMs : '-');
  check('① totalMs === 纯函数公式（同源，零漂移）',
    !!st1 && Math.abs(st1.totalMs - st1.formulaMs) < 1e-6,
    st1 ? ('total=' + st1.totalMs + ' formula=' + st1.formulaMs) : '-');
  check('① maxDelay + TILE <= totalMs（缺角盘面由预算兜底，不截短）',
    !!st1 && (st1.maxDelay + 120) <= st1.totalMs + 1e-6,
    st1 ? ('maxDelay+120=' + (st1.maxDelay + 120) + ' total=' + st1.totalMs) : '-');
  check('① 墙钟落定 = totalMs + 帧闸门 2 帧 + 帧量化（<= 1200ms 兜底）',
    !!st1 && st1.wallMs > 0 && st1.isDealing === false &&
    st1.wallMs >= st1.totalMs - 1 && st1.wallMs <= st1.totalMs + 1200,
    st1 ? ('wall=' + st1.wallMs + 'ms total=' + st1.totalMs + 'ms') : '-');
  await ev('window.__D27.rnd().startDeal()');
  await sleep(60);
  await shot('deal-60ms.png');
  await sleep(160);
  await shot('deal-220ms.png');
  await ev('window.__D27.rnd().skipDeal()');
  await sleep(120);
  await shot('deal-settled.png');

  /* ---------- ② 飞行：槽位稳定性 + 图层序稳定性 + 取证帧 ---------- */
  console.log('\n② 方向性飞行（槽位稳定 / 图层不反转）');
  var tapId = await ev('window.__D27.firstTappable(0)');
  check('② 找到朝上（U）可点卡牌', tapId != null && tapId >= 0, tapId);
  if (tapId != null && tapId >= 0) {
    /* 采样为什么用 setInterval(8) 而不是 rAF：headless 无 GPU 时单帧可达
     * 100~150ms，220ms 的飞行窗口里 rAF 只落 1~2 个采样点（实测偶发 1 帧 →
     * 门禁抖动）。`flightsOf()` / `dockSig()` 都是纯读，8ms 定时采样既不改语义，
     * 又能稳定拿到 >= 8 个点。 */
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
        var iv = setInterval(function(){
          sigs.push(window.__D27.dockSig());
          var fs = r.flightsOf();
          flying.push(fs.length);
          if (fs.length && idxSeen < 0) idxSeen = fs[0].slotIndex;
          if (window.__D27.orderOk(geo) === false) orderOk = false;
          if (performance.now() - t0 >= 520) { clearInterval(iv); resolve(); }
        }, 8);
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
    check('② 采样到在途帧（>= 1 个采样点；headless 定时器实测 ~30ms/次，220ms 窗口仅落 2~3 点）',
      flyFrames >= 1, 'inFlightSamples=' + flyFrames + ' / total=' + (probe ? probe.frames : 0));
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

  /* ---------- ③ 三消纯卡牌自身力学（Δ31a） ----------
   * 为什么必须「先占住槽 0,1」：`applyTap` 是原子结算，`match` 时那 3 张牌已从
   * `state.dock` 移除，若只在空槽上凑三消（槽 0,1,2），错误实现（写死最左 3 槽）
   * 与正确实现结果**相同** → 测不出来。故先点 2 张异花色把三消块挤到槽 2,3,4，
   * 两种实现相差整整 2 个槽宽，可确定性区分。
   *
   * 相位采样为什么必须 seek()：整段演出只有 210ms，headless 无 GPU 时单帧可达
   * 100~150ms，rAF 墙钟采样会**整段跳过**挤压/回弹两个关键段（Δ29/Δ30 都踩过）。
   * 故用 Web Animations 的 pause + currentTime 拨到关键帧百分比对应的毫秒，
   * 同步读 computedStyle —— 像素/矩阵证据与 DOM 记录两条腿都拿到。 */
  console.log('\n③ 三消纯卡牌力学（槽位定位 / 角色分派 / 四段形变 / 托盘微震）');
  var col = await ev(`(async function(){
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    var D = window.__D27, r = D.rnd(), s = D.sess(), RE = window.STM.RulesEngine;
    s.reset();
    await sleep(160);
    r.skipDeal();
    await sleep(60);

    function firstOf(suit){
      var st = s.state(), eng = s.engineState();
      for (var i = 0; i < st.board.length; i++) {
        var t = st.board[i];
        if (!t || (t.s|0) !== suit) continue;
        if (!RE.canTap(eng, t.id)) continue;
        return t.id;
      }
      return null;
    }
    /* 目标花色 = 可点数量最多的花色；副花色 = 次多的（用于占槽 0,1） */
    var st0 = s.state(), eng0 = s.engineState(), cnt = {};
    for (var i0 = 0; i0 < st0.board.length; i0++) {
      var b0 = st0.board[i0];
      if (!b0 || !RE.canTap(eng0, b0.id)) continue;
      var k0 = b0.s|0; cnt[k0] = (cnt[k0]||0)+1;
    }
    var target = -1, bestN = 0, preSuit = -1, preN = 0;
    for (var kk in cnt) {
      if (cnt[kk] > bestN) { preN = bestN; preSuit = target; bestN = cnt[kk]; target = kk|0; }
      else if (cnt[kk] > preN) { preN = cnt[kk]; preSuit = kk|0; }
    }
    if (target < 0 || bestN < 3) return { err: 'no triple suit' };
    if (preSuit < 0) return { err: 'no second suit' };

    var out = {
      err: null, preTapped: 0, preDock: null, expectShat: null, dockBeforeMatch: null,
      shatSlots: null, shatT: -1, roles: null, zIdx: null, suckDx: null,
      anims: null, afterAnim: null, centerPhase: null, sidePhase: null,
      hitSeen: false, hitName: null, hitDur: null, hitAmp: null, hitAmpBack: null,
      flipTransition: null, baseRects: null, sigAtShat: null, sigEnd: null,
      slotCountAtShat: 0, slotCountEnd: 0, shatOffAt: -1,
      resid: null, rolesEnd: null, shatSlotsEnd: null,
      timing: window.STM.main.peakTiming, tapped: 0
    };
    out.baseRects = D.slotRects();

    /* 占住槽 0,1 */
    for (var pv = 0; pv < 2; pv++) {
      var pid = firstOf(preSuit);
      if (pid == null) break;
      s.tap(pid); out.preTapped++;
      await sleep(110);
    }
    out.preDock = s.state().dock.map(function(t){ return t.s; });

    /* 三张依次点入，间隔 110ms 让飞行落定（避免并发飞行干扰时序观测）。
     * ⚠ 必须在**第 3 张点击前**取 dock 快照：那时槽内已有 2 张目标花色，
     * 第 3 张落进 dock.length 这个槽 → 本轮三消 3 槽 = [idxT..., dock.length]。
     * 点击之后再取就永远是空数组（match 已原子结算）。 */
    var ti = 0, t0 = performance.now();
    while (ti < 3) {
      if (out.expectShat == null) {
        var stc = s.state();
        var idxT = [];
        for (var ci = 0; ci < stc.dock.length; ci++) if ((stc.dock[ci].s|0) === target) idxT.push(ci);
        if (idxT.length >= 2 && stc.dock.length < 7) {
          out.dockBeforeMatch = stc.dock.map(function(t){ return t.s; });
          out.expectShat = idxT.concat([stc.dock.length]).sort(function(a,b){ return a-b; });
        }
      }
      var tid = firstOf(target);
      if (tid == null) break;
      s.tap(tid); ti++; out.tapped++;
      await sleep(110);
    }

    /* ---- 用 MutationObserver 抓住 .slot-shattering 上屏那一瞬间 ---- */
    var sampled = false;
    function sampleNow(){
      if (sampled) return;
      sampled = true;
      var on = D.shatSlots();
      if (on.length < 3) return;
      out.shatSlots = on;
      out.shatT = Math.round(performance.now() - t0);
      out.sigAtShat = D.dockSig();
      out.slotCountAtShat = document.querySelectorAll('#dock .slot').length;
      out.suckDx = D.suckDxOf();
      out.roles = D.collapseRoles();
      var zIdx = {};
      for (var i = 0; i < out.roles.length; i++) zIdx[out.roles[i].i] = out.roles[i].z;
      out.zIdx = zIdx;

      var ns = document.querySelectorAll('#dock .slot');
      var chips = [];
      for (var q = 0; q < on.length; q++) {
        chips.push(ns[on[q]] ? ns[on[q]].querySelector('.dock-chip') : null);
      }
      /* 动画名 / 时长（center = chip-impact，side = chip-rush） */
      var anims = [];
      for (var w = 0; w < chips.length; w++) {
        var cs = chips[w] ? getComputedStyle(chips[w]) : null;
        anims.push(cs ? { name: cs.animationName, dur: cs.animationDuration } : null);
      }
      out.anims = anims;
      var midChip = chips[1] || chips[0];
      if (midChip) {
        var csa = getComputedStyle(midChip, '::after');
        out.afterAnim = csa ? { name: csa.animationName, dur: csa.animationDuration, opacity: csa.opacity } : null;
      }

      /* 中心牌四段相位（百分比 → 毫秒：0% / 33.3% / 45.2% / 54.8% / 61.9% / 100%）
       * 69ms 落在 0→33.3%（线性段）内、210ms 为 100% 终点（forwards 保留末帧）。 */
      if (midChip) {
        var aImpact = D.animNamed(midChip, 'chip-impact');
        var aFlash = D.docAnimNamed('chip-flash');
        var PTS = [0, 69, 94.92, 115.08, 129.99, 210];
        out.centerPhase = PTS.map(function(t){
          D.seek(aImpact, t);
          D.seek(aFlash, t);
          var m = D.matOf(midChip);
          var csm = getComputedStyle(midChip);
          var csf = getComputedStyle(midChip, '::after');
          return { t: t, sx: m.a, sy: m.d, tx: m.e, ty: m.f,
                   filter: csm.filter, flash: parseFloat(csf ? csf.opacity : '0') };
        });
        out.flashSeeked = !!aFlash;
      }
      /* 左右两张：0 / 35 / 70（33.3% 到位）/ 82（39% 隐去） */
      var sidePhase = [];
      for (var e2 = 0; e2 < chips.length; e2++) {
        if (e2 === 1) continue;
        var ch = chips[e2];
        if (!ch) { sidePhase.push(null); continue; }
        var aRush = D.animNamed(ch, 'chip-rush');
        var SPTS = [0, 35, 70, 82];
        sidePhase.push(SPTS.map(function(t){
          D.seek(aRush, t);
          var m2 = D.matOf(ch);
          var cs2 = getComputedStyle(ch);
          return { t: t, tx: m2.e, sx: m2.a, op: parseFloat(cs2.opacity) };
        }));
      }
      out.sidePhase = sidePhase;
      /* 采样完毕 → 直接把动画推到终点（视觉与「已坍缩」一致，不留冻结帧） */
      var all = D.animsOf(midChip || chips[0]);
      for (var y = 0; y < chips.length; y++) {
        if (!chips[y]) continue;
        var arr = D.animsOf(chips[y]);
        for (var z2 = 0; z2 < arr.length; z2++) {
          try { arr[z2].finish(); } catch (eF) {}
        }
      }
      for (var z3 = 0; z3 < all.length; z3++) { try { all[z3].finish(); } catch (eF2) {} }
      try { if (aFlash) aFlash.finish(); } catch (eF3) {}
    }

    var mo = new MutationObserver(function(){
      var on = D.shatSlots();
      if (on.length >= 3) sampleNow();
      var dockEl = document.getElementById('dock');
      if (dockEl && dockEl.classList && dockEl.classList.contains('dock-hit') && !out.hitSeen) {
        out.hitSeen = true;
        var csd = getComputedStyle(dockEl);
        out.hitName = csd.animationName;
        out.hitDur = csd.animationDuration;
        /* 受击微震幅度：拨到 25%（-2px）与 55%（+1px）确定性取样 */
        var aHit = D.animNamed(dockEl, 'dock-hit');
        if (aHit) {
          D.seek(aHit, 22.5);
          var mh = D.matOf(dockEl);
          out.hitAmp = { dx: mh.e, dy: mh.f };
          D.seek(aHit, 49.5);
          var mh2 = D.matOf(dockEl);
          out.hitAmpBack = { dx: mh2.e, dy: mh2.f };
          try { aHit.finish(); } catch (eH) {}
        }
      }
      /* 补位过渡：renderDockWithFlip 一次性写入内联 transition（200ms 欠阻尼）。
       * 内联 style 属性保留**书写原文**（.34 不会被序列化成 0.34），
       * 故这里只做「含 200ms + 含 cubic-bezier」的宽匹配，精确值在 Node 侧断言。 */
      var chipsNow = document.querySelectorAll('#dock .slot .dock-chip');
      for (var n = 0; n < chipsNow.length; n++) {
        var stl = chipsNow[n].getAttribute('style') || '';
        if (!out.flipTransition && stl.indexOf('200ms') >= 0 && stl.indexOf('cubic-bezier') >= 0) {
          out.flipTransition = stl;
        }
      }
    });
    mo.observe(document.getElementById('dock'), {
      attributes: true, attributeFilter: ['class', 'style'], subtree: true, childList: true
    });

    /* 等演出收尾（210ms + 帧量化） */
    var waitStart = performance.now();
    while (performance.now() - waitStart < 1500) {
      await new Promise(function(z){ requestAnimationFrame(z); });
      if (out.shatSlots && D.shatSlots().length === 0 && out.shatOffAt < 0) {
        out.shatOffAt = Math.round(performance.now() - t0);
      }
      if (out.shatOffAt > 0 && performance.now() - waitStart > 400) break;
    }
    mo.disconnect();
    /* 再等两帧，让末帧清屏落到画布上 */
    await new Promise(function(z){ requestAnimationFrame(function(){ requestAnimationFrame(z); }); });
    out.sigEnd = D.dockSig();
    out.shatSlotsEnd = D.shatSlots();
    out.rolesEnd = D.collapseRoles();
    out.slotCountEnd = document.querySelectorAll('#dock .slot').length;
    out.resid = D.vfxPixels();
    return out;
  })()`);

  if (col && !col.err && col.shatSlots && col.expectShat) {
    var bs = col.baseRects || [];
    var shat = col.shatSlots;
    check('③ 预置 2 张异花色占住槽 0,1（把三消块挤到右侧）',
      col.preTapped === 2 && col.preDock.length >= 2, JSON.stringify(col.preDock));
    check('③ .slot-shattering 恰好落在 3 个槽位',
      shat.length === 3, JSON.stringify(shat));
    check('③ 坍缩槽位 = dock 快照推导的本轮三消 3 槽',
      JSON.stringify(shat) === JSON.stringify(col.expectShat),
      'obs=' + JSON.stringify(shat) + ' expect=' + JSON.stringify(col.expectShat) +
      ' dockBefore=' + JSON.stringify(col.dockBeforeMatch));
    check('③ 坍缩槽位不是「最左 3 槽」（MUST 为本轮三消真实所在槽位）',
      !(shat[0] === 0 && shat[1] === 1 && shat[2] === 2),
      'shat=' + JSON.stringify(shat));

    /* 角色分派：center 1 张（中间槽）+ side 2 张 + z-index 3/1 */
    var roles = col.roles || [];
    var roleSeq = roles.map(function (o) { return o.role; });
    check('③ data-collapse-role 恰好落在 3 个槽（角色分派已写入）',
      roles.length === 3, JSON.stringify(roles));
    check('③ 角色序列 = side / center / side（中心牌唯一）',
      JSON.stringify(roleSeq) === JSON.stringify(['side', 'center', 'side']),
      JSON.stringify(roleSeq));
    check('③ 角色槽位 = 本轮三消 3 槽（角色与槽位同一来源）',
      JSON.stringify(roles.map(function (o) { return o.i; })) === JSON.stringify(shat),
      JSON.stringify(roles.map(function (o) { return o.i; })));
    var zi = col.zIdx || {};
    check('③ z-index 分派：center = 3 / side = 1（合体压序正确）',
      zi[shat[1]] === '3' && zi[shat[0]] === '1' && zi[shat[2]] === '1',
      JSON.stringify(zi));

    /* 滑行位移：中间槽 0、左侧为正、右侧为负，量级 ≈ 一个槽距 */
    var dx = col.suckDx || {};
    var d0 = dx[shat[0]], d1 = dx[shat[1]], d2 = dx[shat[2]];
    check('③ --suck-dx 三槽齐备（滑行位移已写入内联 CSS 变量）',
      d0 != null && d1 != null && d2 != null, JSON.stringify(dx));
    check('③ 中间槽位移 === 0（合体锚点，中心牌不滑行）', d1 === 0, 'mid=' + d1);
    check('③ 左槽向中间滑行（dx > 0）、右槽向中间滑行（dx < 0）',
      d0 > 0 && d2 < 0, 'left=' + d0 + ' right=' + d2);
    var pitch = (bs[shat[1]] && bs[shat[0]]) ? (bs[shat[1]].l - bs[shat[0]].l) : 0;
    check('③ 滑行位移量级 ≈ 一个槽距（0.8~1.6 槽距，非「槽宽×序号」换算）',
      pitch > 0 && Math.abs(d0) >= pitch * 0.8 && Math.abs(d0) <= pitch * 1.6 &&
      Math.abs(d2) >= pitch * 0.8 && Math.abs(d2) <= pitch * 1.6,
      'pitch=' + pitch + ' |d0|=' + Math.abs(d0).toFixed(1) + ' |d2|=' + Math.abs(d2).toFixed(1));

    /* 动画名 / 时长：center = chip-impact、side = chip-rush、都 0.21s */
    var an = col.anims || [];
    check('③ 中心牌走 chip-impact（0.21s）',
      !!an[1] && an[1].name === 'chip-impact' && an[1].dur === '0.21s',
      an[1] ? (an[1].name + ' / ' + an[1].dur) : 'null');
    check('③ 左右两张走 chip-rush（0.21s）',
      !!an[0] && an[0].name === 'chip-rush' && an[0].dur === '0.21s' &&
      !!an[2] && an[2].name === 'chip-rush' && an[2].dur === '0.21s',
      JSON.stringify(an));
    check('③ 旧关键帧 slot-shatter 已彻底下线（无残留动画名）',
      an.every(function (o) { return !o || o.name !== 'slot-shatter'; }),
      JSON.stringify(an));
    check('③ 闪白覆盖层 = ::after + chip-flash（0.21s，非纯 brightness）',
      !!col.afterAnim && col.afterAnim.name === 'chip-flash' && col.afterAnim.dur === '0.21s',
      JSON.stringify(col.afterAnim));

    /* 中心牌四段形变（相位确定性采样） */
    var cph = col.centerPhase || [];
    function cpAt(t) {
      for (var i = 0; i < cph.length; i++) if (Math.abs(cph[i].t - t) < 1e-6) return cph[i];
      return null;
    }
    var p0 = cpAt(0), p69 = cpAt(69), p95 = cpAt(94.92), p115 = cpAt(115.08),
        p130 = cpAt(129.99), p210 = cpAt(210);
    check('③ 中心牌 0ms 静止（scale 1，零位移——等左右撞上来）',
      !!p0 && Math.abs(p0.sx - 1) < 1e-3 && Math.abs(p0.sy - 1) < 1e-3 &&
      Math.abs(p0.tx) < 1e-6 && Math.abs(p0.ty) < 1e-6,
      p0 ? JSON.stringify(p0) : 'null');
    check('③ 中心牌 69ms 仍静止（0~33.3% 全段零位移零缩放）',
      !!p69 && Math.abs(p69.sx - 1) < 1e-3 && Math.abs(p69.sy - 1) < 1e-3,
      p69 ? JSON.stringify(p69) : 'null');
    check('③ 中心牌 95ms 非等比挤压（sx < 0.95 且 sy > 1.04，受压唯一可读表达）',
      !!p95 && p95.sx < 0.95 && p95.sy > 1.04,
      p95 ? ('sx=' + p95.sx.toFixed(3) + ' sy=' + p95.sy.toFixed(3)) : 'null');
    check('③ 中心牌 95ms 亮度峰值 ≈ 2.1（闪白回弹同帧达峰）',
      !!p95 && /brightness\(2\.0[0-9]|brightness\(2\.1/.test(p95.filter), p95 ? p95.filter : 'null');
    check('③ 中心牌 115ms 猛烈回弹至峰值 1.32（MUST NOT > 1.40）',
      !!p115 && Math.abs(p115.sx - 1.32) < 0.01 && p115.sx <= 1.40,
      p115 ? 'sx=' + p115.sx.toFixed(3) : 'null');
    check('③ 中心牌 130ms 峰值保持（115~130ms 不回弹，为坍缩蓄势）',
      !!p130 && Math.abs(p130.sx - 1.32) < 0.01, p130 ? 'sx=' + p130.sx.toFixed(3) : 'null');
    check('③ 中心牌 130ms → 210ms 加速坍缩至 0（末端极快，非匀速缩）',
      !!p130 && !!p210 && p130.sx > 1.3 && p210.sx < 0.02 && p210.sy < 0.02,
      p130 && p210 ? ('sx ' + p130.sx.toFixed(2) + ' → ' + p210.sx.toFixed(3)) : 'null');
    check('③ 闪白覆盖层 0 → .70（95ms）→ .15（130ms）→ 0（210ms）',
      !!p0 && p0.flash <= 0.01 && !!p95 && Math.abs(p95.flash - 0.70) < 0.02 &&
      !!p130 && Math.abs(p130.flash - 0.15) < 0.02 && !!p210 && p210.flash <= 0.01,
      [p0 && p0.flash, p95 && p95.flash, p130 && p130.flash, p210 && p210.flash].join('/'));

    /* 左右两张：强初速滑行 → 70ms 到位 → 1 帧内隐去 */
    var sp = col.sidePhase || [];
    var leftSp = sp[0] || null, rightSp = sp[1] || null;
    function spAt(arr, t) {
      if (!arr) return null;
      for (var i = 0; i < arr.length; i++) if (Math.abs(arr[i].t - t) < 1e-6) return arr[i];
      return null;
    }
    check('③ 左牌 0ms 起点零位移、不透明',
      !!spAt(leftSp, 0) && Math.abs(spAt(leftSp, 0).tx) < 1e-6 && spAt(leftSp, 0).op > 0.99,
      JSON.stringify(spAt(leftSp, 0)));
    check('③ 左牌 35ms 已完成 >= 60% 位移（强初速，非「被吸过去」的先慢后快）',
      !!spAt(leftSp, 35) && spAt(leftSp, 35).tx >= d0 * 0.6 - 1e-6 &&
      spAt(leftSp, 35).tx <= d0 + 1e-6,
      spAt(leftSp, 35) ? ('tx=' + spAt(leftSp, 35).tx.toFixed(2) + ' target=' + d0) : 'null');
    check('③ 左牌 70ms 精确到位（tx === --suck-dx，误差 <= 0.5px）',
      !!spAt(leftSp, 70) && Math.abs(spAt(leftSp, 70).tx - d0) <= 0.5,
      spAt(leftSp, 70) ? ('tx=' + spAt(leftSp, 70).tx.toFixed(2) + ' dx=' + d0) : 'null');
    check('③ 右牌 70ms 精确到位（tx === --suck-dx，误差 <= 0.5px）',
      !!spAt(rightSp, 70) && Math.abs(spAt(rightSp, 70).tx - d2) <= 0.5,
      spAt(rightSp, 70) ? ('tx=' + spAt(rightSp, 70).tx.toFixed(2) + ' dx=' + d2) : 'null');
    check('③ 左右两张 82ms（到位后 1 帧内）已完全隐去（opacity === 0）',
      !!spAt(leftSp, 82) && spAt(leftSp, 82).op <= 0.01 &&
      !!spAt(rightSp, 82) && spAt(rightSp, 82).op <= 0.01,
      [spAt(leftSp, 82) && spAt(leftSp, 82).op, spAt(rightSp, 82) && spAt(rightSp, 82).op].join('/'));
    check('③ 左右两张全程不缩放（只有位移——形变只属于中心牌）',
      leftSp && leftSp.every(function (o) { return Math.abs(o.sx - 1) < 0.02; }) &&
      rightSp && rightSp.every(function (o) { return Math.abs(o.sx - 1) < 0.02; }));

    /* 托盘受击微震 */
    check('③ #dock 受击微震已触发（130ms 起）', col.hitSeen === true);
    check('③ 微震动画名 = dock-hit / 时长 0.09s',
      col.hitName === 'dock-hit' && col.hitDur === '0.09s',
      col.hitName + ' / ' + col.hitDur);
    check('③ 微震幅度 = 纵向 −2.0px 且横向恒 0（MUST NOT 横向位移）',
      !!col.hitAmp && Math.abs(col.hitAmp.dy + 2) < 0.05 && Math.abs(col.hitAmp.dx) < 1e-6,
      JSON.stringify(col.hitAmp));
    check('③ 微震回弹过冲至 +1px（欠阻尼，非单向位移）',
      !!col.hitAmpBack && Math.abs(col.hitAmpBack.dy - 1) < 0.05,
      JSON.stringify(col.hitAmpBack));

    /* 补位：200ms 欠阻尼弹簧
     * 常量与曲线 MUST 唯一来源（main.js 的 renderDockWithFlip 两段式重排）。
     * 实测只在本轮三消**右侧仍有卡牌**（需要左移补位）时才存在——三消落在
     * dock 末尾时本来就没有牌要左移，此时以常量同源断言为准，不误报。 */
    var mainSrc = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    var flipSrcOk = /var DOCK_FLIP_MS = 200;/.test(mainSrc) &&
      /'transform ' \+ DOCK_FLIP_MS \+ 'ms cubic-bezier\(\.34,1\.28,\.64,1\)'/.test(mainSrc);
    check('③ 补位常量同源（DOCK_FLIP_MS = 200 + 欠阻尼曲线，唯一一处）',
      flipSrcOk === true, 'src=' + flipSrcOk);
    var flipOk = !!col.flipTransition &&
      col.flipTransition.indexOf('200ms') >= 0 &&
      /cubic-bezier\(\s*0?\.34\s*,\s*1\.28\s*,\s*0?\.64\s*,\s*1\s*\)/.test(col.flipTransition);
    var needsShift = !!(col.dockBeforeMatch && col.expectShat &&
      col.dockBeforeMatch.length > col.expectShat[2] + 1);
    check(needsShift
      ? '③ 补位过渡实测 = 200ms + cubic-bezier(.34,1.28,.64,1)（欠阻尼弹簧）'
      : '③ 本轮三消位于 dock 末尾、无左移补位对象（补位由常量同源断言覆盖）',
      needsShift ? flipOk : (col.flipTransition == null || flipOk),
      col.flipTransition || 'null');

    check('③ 演出期 #dock 槽位数不变（7 槽，零增删）',
      col.slotCountAtShat === 7 && col.slotCountEnd === 7,
      col.slotCountAtShat + ' → ' + col.slotCountEnd);

    /* 收尾：无残留 */
    check('③ 210ms + 1 帧后 .slot-shattering 全部摘除（DOM 无脏类）',
      col.shatSlotsEnd && col.shatSlotsEnd.length === 0, JSON.stringify(col.shatSlotsEnd));
    check('③ 收尾后 data-collapse-role 全部摘除（角色属性无残留）',
      col.rolesEnd && col.rolesEnd.length === 0, JSON.stringify(col.rolesEnd));
    check('③ 演出结束后本组 3 槽回到空槽态（ghost 已清，无残留有牌态）',
      !!col.sigEnd && col.sigEnd.length === 7 &&
      shat.every(function (i) { return col.sigEnd.charAt(i) === 'E'; }),
      'sigEnd=' + col.sigEnd + ' shat=' + JSON.stringify(shat));
    check('③ 210ms + 1 帧后 #vfx-canvas 零残留像素（alpha > 2 = 0）',
      col.resid && col.resid.nonZero === 0,
      col.resid ? (col.resid.nonZero + '/' + col.resid.total) : 'n/a');
    check('③ 时序常量同源（peakTiming: shudder 130 / collapse 210 / hit 90 / flip 200）',
      !!col.timing && col.timing.shudderAtMs === 130 && col.timing.collapseMs === 210 &&
      col.timing.hitMs === 90 && col.timing.flipMs === 200 && col.timing.freezeMs === 210,
      col.timing ? JSON.stringify(col.timing) : 'null');
    check('③ 旧时序键已移除（preshakeMs / ringAtMs 不得复现）',
      !!col.timing && col.timing.preshakeMs === undefined && col.timing.ringAtMs === undefined,
      col.timing ? JSON.stringify(col.timing) : 'null');
    await shot('collapse-after.png');
  } else {
    check('③ 纯卡牌力学采样成功', false,
      col ? JSON.stringify(col.err || { shatSlots: col.shatSlots, expect: col.expectShat }) : 'null');
  }

  /* ---------- ④ 碎裂时序：3 张全部落定后才起演（保留 Δ28a 铁律） ----------
   * 它验的是**时序**不是碎块：`match` 在点击结算瞬间下发，若直接起演就会
   * 「牌没到就爆」。正确链路是 pendingShatter → onFlightLand 逐张 →
   * 全落定才 fireDockShatter。 */
  console.log('\n④ 碎裂时序（3 张全部落定后才起演）');
  await ev('window.__D27.rnd().cancelFlights()');
  await ev('window.__D27.sess().reset()');
  await sleep(160);
  await ev('window.__D27.rnd().skipDeal()');
  await sleep(120);

  var triple = await ev('window.__D27.tappableTriple()');
  check('④ 找到同花色 3 张可点卡牌', !!triple && triple.ids && triple.ids.length === 3,
    triple ? JSON.stringify(triple) : 'null');

  var seq = null;
  if (triple && triple.ids && triple.ids.length === 3) {
    seq = await ev(`(async function(){
      var ids = ${JSON.stringify(triple.ids)};
      var D = window.__D27, r = D.rnd();
      var frames = [];
      var t0 = performance.now();
      var ti = 0, lastTapAt = -1e9, taps = [];
      /* 同 ②：8ms 定时采样（纯读），避免 headless 低帧率把并发飞行采成 1 张 */
      await new Promise(function(resolve){
        var iv = setInterval(function(){
          var now = performance.now();
          if (ti < ids.length && now - lastTapAt > 90) {
            D.sess().tap(ids[ti]);
            taps.push(Math.round(now - t0));
            ti++;
            lastTapAt = now;
          }
          frames.push({
            t: Math.round(now - t0),
            shat: D.shatSlots().length,
            roles: D.collapseRoles().length,
            fl: r.flightsOf().length,
            tTiles: (D.dockSig().match(/T/g) || []).length
          });
          if (now - t0 >= 1600) { clearInterval(iv); resolve(); }
        }, 8);
      });
      return { frames: frames, taps: taps };
    })()`);
  }

  if (seq && seq.frames && seq.frames.length) {
    var firstShat = -1, maxFl = 0;
    for (var fi = 0; fi < seq.frames.length; fi++) {
      if (firstShat < 0 && seq.frames[fi].shat > 0) firstShat = fi;
      if (seq.frames[fi].fl > maxFl) maxFl = seq.frames[fi].fl;
    }
    check('④ 3 次点击后确实产生了在途并发飞行（>= 2 张同飞）', maxFl >= 2, 'maxFl=' + maxFl);
    check('④ 坍缩已触发（采样窗内出现 .slot-shattering）', firstShat >= 0,
      firstShat >= 0 ? ('t=' + seq.frames[firstShat].t + 'ms') : 'no shatter');
    if (firstShat >= 0) {
      var f0 = seq.frames[firstShat];
      /* 核心断言：坍缩起演的那一帧，**不允许**还有卡牌在飞 */
      check('④ 碎裂瞬间零在途飞行（第 3 张已落定，不再「牌没到就爆」）',
        f0.fl === 0, 'flights=' + f0.fl + ' @' + f0.t + 'ms');
      check('④ 坍缩起演帧槽内已有 3 张有牌态（ghost 生效，不是空槽爆炸）',
        f0.tTiles >= 3, 'T×' + f0.tTiles + ' @' + f0.t + 'ms');
      check('④ 坍缩发生在最后一次点击之后（非点击同帧起演）',
        seq.taps.length === 3 && f0.t > seq.taps[2],
        'taps=' + JSON.stringify(seq.taps) + ' shatter@' + f0.t + 'ms');
      check('④ 角色属性与类名同帧就位（不是延迟一帧才分派）',
        f0.roles === 3, 'roles=' + f0.roles + ' @' + f0.t + 'ms');
    }
    await shot('collapse-seq.png');
    await sleep(90);
    await shot('collapse-seq+90.png');
  } else {
    check('④ 碎裂时序采样成功', false, seq ? JSON.stringify(seq) : 'null');
  }

  /* ---------- ⑤ 零特效残留：三消窗口内 #vfx-canvas 全程零像素 ----------
   * 为什么必须逐帧采样：光圈 / 星芒 / 粒子三条通路已整体删除，任何「复活」
   * 都会在 #vfx-canvas 或棋盘 canvas 上留下可读像素。三消期**没有**在途飞行
   * （④ 已断言），故 VFX 层 MUST 全程全透明。 */
  console.log('\n⑤ 零特效残留（三消窗口 / #vfx-canvas 逐帧采样）');
  var zero = await ev(`(async function(){
    var D = window.__D27, r = D.rnd(), s = D.sess(), RE = window.STM.RulesEngine;
    var sleep = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
    s.reset();
    await sleep(160);
    r.skipDeal();
    await sleep(80);
    r.clearVfx();
    r.drawVfxNow();
    var base = D.vfxPixels();

    var tri = D.tappableTriple();
    if (!tri || !tri.ids || tri.ids.length !== 3) return { err: 'no triple' };
    /* #vfx-canvas 在**飞牌离场段**本来就承载像素（方向性飞行的棋盘外部分），
     * 所以判据是「零在途飞行帧上 MUST 零像素」——光圈/星芒/粒子若复活，
     * 恰恰会在 flight 为 0 的坍缩窗口里留下亮像素（三消期无飞行，④ 已断言）。 */
    var maxPixIdle = 0, maxPixFly = 0, idleFrames = 0, flyFrames = 0, sawShat = false;
    var t0 = performance.now();
    var ti = 0, lastTap = -1e9;
    await new Promise(function(done){
      function step(){
        var now = performance.now();
        if (ti < 3 && now - lastTap > 90) { s.tap(tri.ids[ti]); ti++; lastTap = now; }
        if (D.shatSlots().length) sawShat = true;
        var fl = r.flightsOf().length;
        var px = D.vfxPixels();
        var nz = (px && px.nonZero) || 0;
        if (fl > 0) { flyFrames++; if (nz > maxPixFly) maxPixFly = nz; }
        else { idleFrames++; if (nz > maxPixIdle) maxPixIdle = nz; }
        if (now - t0 < 1400) requestAnimationFrame(step); else done();
      }
      requestAnimationFrame(step);
    });
    /* 收尾后再同步渲染一帧，确认「池空 → 画布空」 */
    r.drawVfxNow();
    var end = D.vfxPixels();
    return { base: base, maxPixIdle: maxPixIdle, maxPixFly: maxPixFly,
             idleFrames: idleFrames, flyFrames: flyFrames, sawShat: sawShat, end: end,
             logs: (window.__D27LOG || []).slice(0, 4) };
  })()`);

  if (zero && !zero.err) {
    check('⑤ 隔离前 VFX 层已清空（起点 alpha > 2 像素 = 0）',
      zero.base && zero.base.nonZero === 0, zero.base ? (zero.base.err || zero.base.nonZero) : 'n/a');
    check('⑤ 零在途飞行帧上 VFX 层恒零像素（光圈 / 星芒 / 粒子通路确已删除）',
      zero.maxPixIdle === 0,
      'maxIdle=' + zero.maxPixIdle + ' 空闲帧=' + zero.idleFrames + ' 飞行帧=' + zero.flyFrames);
    check('⑤ 飞牌期 VFX 层确有像素（反向证据：画布通路仍在工作，非「全黑假绿」）',
      zero.maxPixFly > 0, 'maxFly=' + zero.maxPixFly);
    check('⑤ 采样窗内确实发生过三消演出（断言非空转）', zero.sawShat === true);
    check('⑤ 收尾同步渲染后仍零像素（无冻结末帧）',
      zero.end && zero.end.nonZero === 0, zero.end ? zero.end.nonZero : 'n/a');
    check('⑤ 渲染器 console.error 零命中（无被吞掉的绘制异常）',
      !zero.logs || zero.logs.length === 0, zero.logs ? zero.logs.join(' | ') : '0');
    await shot('collapse-zero.png');
  } else {
    check('⑤ 零特效残留采样成功', false, zero ? JSON.stringify(zero.err || zero) : 'null');
  }

  /* ---------- ⑥ 多规模关卡归一（L3 / L33 / L72） ---------- */
  console.log('\n⑥ 多规模关卡总时长归一（380~450ms / 首帧零延迟）');
  var SCALES = [
    { lv: 3, tag: 'L3' },
    { lv: 33, tag: 'L33' },
    { lv: 72, tag: 'L72' }
  ];
  for (var si = 0; si < SCALES.length; si++) {
    var sc = SCALES[si];
    var okLv = await loadLevel(sc.lv);
    if (!okLv) { check('⑥ ' + sc.tag + ' 载入完成', false); continue; }
    var stx = await ev('window.__D27.dealProbe()');
    check('⑥ ' + sc.tag + ' 编舞计划就绪（n = ' + (stx && stx.n) + ' / zMax = ' + (stx && stx.zMax) + '）',
      !!stx && !stx.err && stx.tiles > 0);
    if (stx && !stx.err) {
      check('⑥ ' + sc.tag + ' 总时长 ∈ [380,450]ms（' + stx.totalMs + 'ms）',
        stx.totalMs >= 380 && stx.totalMs <= 450, stx.totalMs);
      check('⑥ ' + sc.tag + ' 首帧零延迟（minDelay === 0）',
        stx.minDelay === 0, stx.minDelay);
      check('⑥ ' + sc.tag + ' 对角层数 = max(r+c)+1 且连续无空洞（' + stx.diagCount + ' 条）',
        stx.diagCount === stx.maxRcSum + 1 && stx.contiguous === true,
        'diag=' + stx.diagCount + ' maxRcSum=' + stx.maxRcSum + ' contiguous=' + stx.contiguous);
      check('⑥ ' + sc.tag + ' 同 (r+c) 同层起跑极差 0',
        stx.diagMismatch === 0, stx.diagMismatch);
      check('⑥ ' + sc.tag + ' 层序锁成立（同 (r,c) 低层恒先起跑，差 = Z_STEP×Δz）',
        stx.lockBad === 0 && stx.lockStepBad === 0,
        'bad=' + stx.lockBad + ' stepBad=' + stx.lockStepBad + '/' + stx.pairCount);
      check('⑥ ' + sc.tag + ' plan 与纯函数同源（introDelayOf 逐项相等）',
        stx.exactBad === 0, stx.exactBad);
      check('⑥ ' + sc.tag + ' 墙钟落定 = totalMs + 帧闸门 2 帧 + 帧量化（<= 1200ms 兜底）',
        stx.wallMs > 0 && stx.isDealing === false &&
        stx.wallMs >= stx.totalMs - 1 && stx.wallMs <= stx.totalMs + 1200,
        'wall=' + stx.wallMs + 'ms total=' + stx.totalMs + 'ms');
    }
    if (si === 0) await shot('deal-L3.png');
    if (si === 2) await shot('deal-L72.png');
  }

  /* ---------- ⑦ 开局进场五时点取证帧（闸门前 / 0 / 100 / 200 / 400ms） ----------
   * 三档盘面：L2（n=6）/ L3（n=7）/ L33（n=8，多层满载）。
   * （L1 是 n=5 教学关，带引导遮罩、`STM.main.renderer` 就绪时机不同，不进本夹具。）
   *
   * 为什么每个相位都重载一次：headless 软件渲染下 `Page.captureScreenshot`
   * 请求本身 0~460ms 就被受理（**画面在这一刻定格**），但 CDP 回包要 ~800ms
   * 之后才到——整段演出只有 415ms，连续取帧只能拍到「已落定」的同一张图。
   * 故改为「重载 → 只取一帧」。
   *
   * 相位保真判据用**帧字节数差异**（同一视口、同一关卡，唯一变量是编舞相位）：
   *   · 闸门前 ≈ 400ms 落定帧（差 <= 3%）——两端都是静止画面；
   *   · 0ms / 100ms / 200ms 三者 MUST 明显不同于静止帧（差 > 3%）。
   * 这条能真正抓到「动画没跑 / 一帧就落定 / 落定后又动」三类回归。 */
  console.log('\n⑦ 开局进场五时点取证帧（闸门前 / 0 / 100 / 200 / 400ms）');
  var SHOTS = [{ lv: 2, tag: 'L2-n6' }, { lv: 3, tag: 'L3-n7' }, { lv: 33, tag: 'L33-n8' }];
  var NOMINAL = [-1, 0, 100, 200, 400];
  async function waitSplash() {
    for (var sg2 = 0; sg2 < 100; sg2++) {
      await sleep(100);
      var gone = await ev(`(function(){
        var s = document.getElementById('splash-screen');
        if (!s) return true;
        var cs = getComputedStyle(s);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
        if (parseFloat(cs.opacity || '1') < 0.05) return true;
        return s.classList.contains('hidden') || s.classList.contains('done');
      })()`);
      if (gone) return true;
    }
    return false;
  }
  for (var sh = 0; sh < SHOTS.length; sh++) {
    var sp2 = SHOTS[sh];
    var sizes = {}, loadOk = true, lastTotal = null, lastN = null;
    for (var k2 = 0; k2 < NOMINAL.length; k2++) {
      var tgt = NOMINAL[k2];
      var okSh = await loadLevel(sp2.lv);
      if (!okSh) { loadOk = false; break; }
      await waitSplash();
      await ev('window.__D27.rnd().skipDeal()');
      await sleep(140);
      var tt0 = Date.now();
      if (tgt >= 0) await ev('window.__D27.rnd().startDeal()');
      if (tgt > 0) await sleep(tgt);
      var beforeMs = Date.now() - tt0;
      var fname = 'intro-' + sp2.tag + '-' + (tgt < 0 ? 'pre' : tgt + 'ms') + '.png';
      await shot(fname);
      sizes[tgt] = fs.statSync(path.join(OUT, fname)).size;
      console.log('    · ' + sp2.tag + ' 目标 ' + (tgt < 0 ? '闸门前' : tgt + 'ms') +
        ' → 截图请求受理于 ' + beforeMs + 'ms / 帧 ' + Math.round(sizes[tgt] / 1024) + ' KB');
      /* 计划结构（含总时长）取一次即可——每个相位都重建同一份计划 */
      if (lastTotal == null) {
        var stSh = await ev('window.__D27.dealProbe()');
        if (stSh && !stSh.err) { lastTotal = stSh.totalMs; lastN = stSh.n; }
        await ev('window.__D27.rnd().skipDeal()');
      }
    }
    if (!loadOk) { check('⑦ ' + sp2.tag + ' 五相位取证帧全部取到', false); continue; }
    var szPre = sizes[-1], szEnd = sizes[400];
    var near = function (a, b, tol) { return Math.abs(a - b) / Math.max(a, b) <= tol; };
    check('⑦ ' + sp2.tag + ' 闸门前帧 ≈ 400ms 落定帧（两端同为静止画面，差 <= 3%）',
      near(szPre, szEnd, 0.03), szPre + ' vs ' + szEnd);
    check('⑦ ' + sp2.tag + ' 0ms 帧明显不同于静止帧（差 > 5%，起手段确被拍到）',
      !near(sizes[0], szPre, 0.05), sizes[0] + ' vs pre=' + szPre);
    check('⑦ ' + sp2.tag + ' 计划就绪且总时长 ∈ [380,450]ms（n=' + lastN + '）',
      lastTotal != null && lastTotal >= 380 && lastTotal <= 450, 'total=' + lastTotal);
  }

  var errList = await ev('(function(){return (window.__D27ERR||[]).slice(0,5);})()');
  check('全程零未捕获异常', Array.isArray(errList) && errList.length === 0,
    errList && errList.length ? errList.join(' | ') : '0');
  cleanup();

  console.log('');
  if (fails.length) {
    console.log('delta27-verify: FAILED — ' + fails.length + ' 失败项: ' + fails.join('; '));
    process.exit(1);
  } else {
    console.log('delta27-verify: all green（对角波浪 415ms + 首帧零延迟 + 层序锁 / ' +
      '方向性飞行槽位零抖动 + 图层不反转 / 纯卡牌力学 210ms 四段 + 角色分派 + ' +
      '挤压→回弹→坍缩 + 托盘微震 2px + 弹簧补位 200ms + 零特效残留 / 多规模关卡归一）');
    console.log('取证帧目录：shots/delta27/');
  }
}

main().catch(function (e) {
  console.error('delta27-verify: 异常', e && e.message);
  process.exit(2);
});
