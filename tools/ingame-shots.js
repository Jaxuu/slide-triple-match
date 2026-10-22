/* =========================================================
 * Slide & Triple — Δ19/T084~T087 局内 UI 截图 + 布局断言
 *
 *   node tools/ingame-shots.js [outDir]
 *
 * 零 npm 依赖——Node 内置 WebSocket + 本机 Chrome/Edge（宪章 II 离线铁律）。
 * 产出: ingame-l1.png / ingame-l1-top.png / ingame-l2.png / ingame-l2-skip.png
 * 断言: 顶栏 → IQ 条 → 待消槽 → 棋盘 的 DOM 顺序与几何位置、
 *       三大道具完整可见、L1/L2 教学出现、L3+ 不出现、无 /72 后缀、
 *       页面无横纵向溢出。
 * ========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');

var CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
var BROWSER = null;
for (var i = 0; i < CANDIDATES.length; i++) {
  try { if (fs.statSync(CANDIDATES[i]).isFile()) { BROWSER = CANDIDATES[i]; break; } } catch (e) {}
}
if (!BROWSER) { console.error('ingame-shots: 未找到 Chrome/Edge'); process.exit(2); }

var OUT = process.argv[2] || path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

function cdp(u) {
  var ws = new WebSocket(u);
  var id = 1, pend = {}, rd = null;
  this.send = function (m, p) {
    return new Promise(function (res, rej) {
      var i = id++; pend[i] = { resolve: res, reject: rej };
      ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
  this.ready = new Promise(function (r) { rd = r; });
  ws.onopen = function () { rd(); };
  ws.onerror = function (e) { console.error('ws error', e); };
  var self = this;
  this.events = [];
  ws.onmessage = function (e) {
    var g = JSON.parse(e.data);
    if (g.id && pend[g.id]) {
      var p = pend[g.id]; delete pend[g.id];
      if (g.error) p.reject(new Error(g.error.message)); else p.resolve(g.result);
    } else {
      self.events.push(g);
    }
  };
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  var PORT = 9900 + Math.floor(Math.random() * 90);
  var userDataDir = require('os').tmpdir() + '/stm-ingame-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
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
        http.get('http://127.0.0.1:' + PORT + '/json/list', function (r) {
          var b = ''; r.on('data', function (d) { b += d; });
          r.on('end', function () { res(JSON.parse(b)); });
        }).on('error', rej);
      });
      break;
    } catch (e) {}
  }
  if (!targets) { console.error('ingame-shots: DevTools 未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Log.enable');

  var indexPath = 'file:///' + path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/');

  async function ev(expr) {
    var r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) {
      var d = r.exceptionDetails;
      console.error('  eval error:', (d.exception && d.exception.description) || d.text);
    }
    return r && r.result ? r.result.value : undefined;
  }

  async function shot(name) {
    var r = await c.send('Page.captureScreenshot', { format: 'png' });
    if (!r || !r.data) { console.error('  shot failed: ' + name); return; }
    var f = path.join(OUT, name);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('  ✓ ' + name + ' (' + Math.round(fs.statSync(f).size / 1024) + ' KB)');
  }

  async function shotClip(name, selector, pad) {
    pad = pad || 0;
    var box = await ev(`(function(){
      var e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null;
      var r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    })()`);
    if (!box || !(box.width > 0)) { console.error('  clip failed: ' + name); return; }
    var clip = {
      x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
      width: box.width + pad * 2, height: box.height + pad * 2, scale: 2
    };
    var r = await c.send('Page.captureScreenshot', { format: 'png', clip: clip });
    if (!r || !r.data) { console.error('  clip failed: ' + name); return; }
    var f = path.join(OUT, name);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log('  ✓ ' + name + ' (' + Math.round(fs.statSync(f).size / 1024) + ' KB)');
  }

  function metricsExpr() {
    return `(function(){
      function rect(sel) {
        var e = document.querySelector(sel);
        if (!e) return null;
        var r = e.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, bottom: r.bottom };
      }
      var tut = document.getElementById('tutorial-root');
      var hand = document.getElementById('tutorial-hand');
      var hr = hand ? hand.getBoundingClientRect() : null;
      return {
        hud: rect('#hud'), iq: rect('#iq-bar'), dock: rect('#dock'),
        board: rect('#board-wrap'), items: rect('#items'),
        title: document.getElementById('hud-title') ? document.getElementById('hud-title').textContent : '',
        iqValue: document.getElementById('iq-value') ? document.getElementById('iq-value').textContent : '',
        iqTitle: document.getElementById('iq-title') ? document.getElementById('iq-title').textContent : '',
        score: document.getElementById('hud-score') ? document.getElementById('hud-score').textContent : '',
        shards: document.getElementById('hud-shards') ? document.getElementById('hud-shards').textContent : '',
        itemBtns: document.querySelectorAll('#items .item-btn').length,
        tutHidden: tut ? tut.hidden : true,
        tutText: document.getElementById('tutorial-text') ? document.getElementById('tutorial-text').textContent : '',
        hand: hr ? { x: hr.left, y: hr.top, w: hr.width, h: hr.height } : null,
        innerW: window.innerWidth, innerH: window.innerHeight,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
        errors: window.__stmErrors || []
      };
    })()`;
  }

  var failures = [];
  function check(name, cond, detail) {
    if (cond) { console.log('  ✓ ' + name); }
    else { failures.push(name); console.log('  ✗ ' + name + (detail ? ' [' + detail + ']' : '')); }
  }

  async function loadLevel(levelId, waitMs) {
    if (levelId === 1) {
      /* 深链 ?level=1 按设计进入大厅（深链仅 >1 时直入局内）——
       * L1 走大厅「关卡 1」主按钮进入，覆盖真实新手路径。 */
      await c.send('Page.navigate', { url: indexPath });
      await sleep(waitMs || 3600);
      await ev('(function(){var b=document.querySelector(".lobby-btn-level"); if(b) b.click(); return !!b;})()');
      await sleep(900);
      return;
    }
    await c.send('Page.navigate', { url: indexPath + '?level=' + levelId });
    await sleep(waitMs || 3600); /* 开机动画 2s + 局内首帧/教学对位 80ms */
  }

  /* ---------- L1 ---------- */
  console.log('L1: 顶栏 / IQ / 待消槽 / 三道具 / 教学引导');
  await loadLevel(1);
  var m1 = await ev(metricsExpr());
  await shot('ingame-l1.png');
  await shotClip('ingame-l1-top.png', '#hud', 4);

  check('顶栏 → IQ 条 → 待消槽 → 棋盘 顺序',
    !!m1.hud && !!m1.iq && !!m1.dock && !!m1.board &&
    m1.hud.y <= m1.iq.y && m1.iq.y <= m1.dock.y && m1.dock.y <= m1.board.y,
    JSON.stringify(m1 && { hud: m1.hud, iq: m1.iq, dock: m1.dock, board: m1.board }));
  check('IQ 初始 90 且显示头衔', m1.iqValue === '90' && !!m1.iqTitle, m1.iqValue + '/' + m1.iqTitle);
  check('顶栏仅 `关卡 1`（无 /72）', /^关卡\s*1$/.test(m1.title.replace(/\s+/g, ' ')), JSON.stringify(m1.title));
  check('棱晶胶囊已渲染', /💎\s*\d+/.test(m1.shards || ''), m1.shards);
  check('底部三大道具按钮完整可见',
    m1.itemBtns === 3 && m1.items && m1.items.bottom <= m1.innerH + 1,
    'n=' + m1.itemBtns + ' bottom=' + (m1.items && m1.items.bottom) + ' innerH=' + m1.innerH);
  check('L1 教学卡片出现且文案指向待消槽',
    m1.tutHidden === false && m1.tutText.indexOf('待消槽') !== -1,
    'hidden=' + m1.tutHidden + ' text=' + m1.tutText.slice(0, 24));
  check('L1 指引小手已对位到目标卡牌',
    !!m1.hand && m1.hand.w > 0 && m1.hand.x >= 0 && m1.hand.y >= 0,
    JSON.stringify(m1.hand));
  check('无横向/纵向滚动溢出',
    m1.scrollW <= m1.innerW + 1 && m1.scrollH <= m1.innerH + 1,
    'scroll=' + m1.scrollW + 'x' + m1.scrollH + ' inner=' + m1.innerW + 'x' + m1.innerH);

  /* 跳过按钮可点 → 教学平滑消失 */
  await ev('document.getElementById("tutorial-skip").click(); true');
  await sleep(500);
  var mSkip = await ev(metricsExpr());
  check('点击跳过 → 教学层隐藏', mSkip.tutHidden === true);
  await shot('ingame-l1-skip.png');
  await shotClip('ingame-l1-items.png', '#items', 10);

  /* 实际三消 → IQ 绿色跳字 + 得分联动（Auto-Play 走真实 session.tap 链路） */
  await ev('(function(){var b=document.getElementById("debug-auto"); if(!b) return false; b.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); return true;})()');
  await sleep(3200);
  var mLive = await ev(metricsExpr());
  await shot('ingame-l1-progress.png');
  await ev('(function(){var b=document.getElementById("debug-auto"); if(b) b.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); return true;})()');
  check('实际三消后 IQ 增长（3 + combo×2）',
    parseInt(mLive.iqValue, 10) > 90, 'IQ=' + mLive.iqValue);
  check('三消后得分 HUD 同步', parseInt(mLive.score, 10) > 0, 'score=' + mLive.score);

  /* ---------- L2 ---------- */
  console.log('L2: 层叠教学');
  await loadLevel(2, 4200);
  var m2 = await ev(metricsExpr());
  await shot('ingame-l2.png');
  check('L2 教学出现且文案为层叠引导',
    m2.tutHidden === false && m2.tutText.indexOf('层叠') !== -1,
    'hidden=' + m2.tutHidden + ' text=' + m2.tutText.slice(0, 24));
  check('L2 顶栏关卡号 = 2（无 /72）', /^关卡\s*2$/.test(m2.title.replace(/\s+/g, ' ')), JSON.stringify(m2.title));

  /* ---------- L3（零提示） ---------- */
  console.log('L3: 零提示边界');
  await loadLevel(3, 3600);
  var m3 = await ev(metricsExpr());
  check('L3+ 不出现新手提示', m3.tutHidden === true);
  await shot('ingame-l3.png');

  /* 全程无未捕获 JS 异常（跨 L1/L2/L3 三次导航累计） */
  var exceptions = c.events.filter(function (m) {
    return m && m.method === 'Runtime.exceptionThrown';
  });
  check('全程无未捕获 JS 异常', exceptions.length === 0,
    exceptions.map(function (m) {
      var d = m.params && m.params.exceptionDetails;
      return d && ((d.exception && d.exception.description) || d.text);
    }).join(' | '));

  console.log('');
  if (failures.length) {
    console.error('ingame-shots: FAILED — ' + failures.length + ' 项: ' + failures.join('; '));
  } else {
    console.log('ingame-shots: all green（布局/教学/IQ/道具/溢出）');
  }
  console.log('输出目录: ' + OUT);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  proc.kill();
  process.exit(failures.length ? 1 : 0);
}

main().catch(function (e) {
  console.error('ingame-shots: ' + (e && e.stack || e));
  process.exit(2);
});
