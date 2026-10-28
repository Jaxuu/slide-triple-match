/* =========================================================
 * Slide & Triple — 大厅 / 设置弹窗 布局取证（UI 布局修复验证）
 *
 *   node tools/ui-fix-shots.js [outDir]
 *
 * 零 npm 依赖——Node 内置 WebSocket + 本机 Chrome/Edge（宪章 II 离线铁律）。
 * 产出:
 *   lobby.png            大厅全景（标题 + 相框 + 关卡按钮）
 *   lobby-brand.png      标题区局部
 *   lobby-portal.png     相框局部
 *   settings.png         设置弹窗全景
 *   settings-top.png     设置弹窗顶部局部（橙色「设置」铭牌）
 *   metrics.json         关键元素包围盒（自动化断言用）
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
if (!BROWSER) { console.error('ui-fix-shots: 未找到 Chrome/Edge'); process.exit(2); }

var OUT = process.argv[2] || path.join(__dirname, '..', 'shots', 'uifix');
var WIN = process.env.STM_WIN || '430,880';
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
  ws.onmessage = function (e) {
    var g = JSON.parse(e.data);
    if (g.id && pend[g.id]) {
      var p = pend[g.id]; delete pend[g.id];
      if (g.error) p.reject(new Error(g.error.message)); else p.resolve(g.result);
    }
  };
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  var PORT = 9700 + Math.floor(Math.random() * 200);
  var userDataDir = require('os').tmpdir() + '/stm-uifix-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--window-size=' + WIN,
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
  if (!targets) { console.error('ui-fix-shots: DevTools 未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  var indexPath = 'file:///' + path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/');
  await c.send('Page.navigate', { url: indexPath });
  await sleep(1200);

  async function ev(expr) {
    var r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
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
    console.log('  ✓ ' + name);
  }

  async function shotClip(name, selector, pad) {
    pad = pad || 0;
    var box = await ev('(function(){var e=document.querySelector(' + JSON.stringify(selector) + ');' +
      'if(!e) return null; var r=e.getBoundingClientRect();' +
      'return {x:r.left,y:r.top,width:r.width,height:r.height};})()');
    if (!box || !(box.width > 0)) { console.error('  clip failed: ' + name); return; }
    var r = await c.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
        width: box.width + pad * 2, height: box.height + pad * 2, scale: 2
      }
    });
    if (!r || !r.data) { console.error('  clip failed: ' + name); return; }
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    console.log('  ✓ ' + name);
  }

  /* 跳过开机动画 → 落入大厅（跳过监听器在 show() 后才挂载，故重试几次） */
  for (var k = 0; k < 3; k++) {
    await sleep(900);
    await ev('document.body.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); true');
  }
  for (var w = 0; w < 80; w++) {
    await sleep(250);
    var ready = await ev('(function(){var s=document.getElementById("splash-screen");' +
      'var l=document.getElementById("lobby");' +
      'return !!(l && !l.hidden && !s);})()');
    if (ready) break;
  }
  await sleep(1000);

  /* 关键元素包围盒 */
  var metrics = await ev(`(function(){
    function box(sel){
      var e = document.querySelector(sel);
      if (!e) return null;
      var r = e.getBoundingClientRect();
      return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
               left: +r.left.toFixed(1), right: +r.right.toFixed(1),
               w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    }
    var vh = window.innerHeight, vw = window.innerWidth;
    var brand = box('.lobby-brand');
    var critters = box('.lobby-brand-critters');
    var glide = box('.lobby-brand-glide');
    var portal = box('.portal');
    var plaque = box('.portal-plaque');
    var level = box('.lobby-btn-level');
    var pet = box('.lobby-brand-pet');
    return {
      viewport: { w: vw, h: vh },
      glide: glide, critters: critters, brand: brand, pet: pet,
      portal: portal, plaque: plaque, level: level,
      gapBrandToPlaque: (plaque && brand) ? +(plaque.top - brand.bottom).toFixed(1) : null,
      gapPortalToLevel: (portal && level) ? +(level.top - portal.bottom).toFixed(1) : null,
      crittersOverlappedByPortal: (critters && portal) ? +(critters.bottom - portal.top).toFixed(1) : null
    };
  })()`);
  console.log('\n--- lobby metrics ---');
  console.log(JSON.stringify(metrics, null, 2));

  await shot('lobby.png');
  await shotClip('lobby-brand.png', '.lobby-brand', 46);
  await shotClip('lobby-portal.png', '.portal', 10);

  /* 设置弹窗 */
  await ev('document.querySelector(".lobby-btn-settings").click(); true');
  await sleep(700);
  var m2 = await ev(`(function(){
    function box(sel){
      var e = document.querySelector(sel);
      if (!e) return null;
      var r = e.getBoundingClientRect();
      return { top:+r.top.toFixed(1), bottom:+r.bottom.toFixed(1), left:+r.left.toFixed(1),
               right:+r.right.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1) };
    }
    var card = document.querySelector('.jelly-card');
    var plaque = document.querySelector('.jelly-plaque');
    var closeBtn = document.querySelector('.jelly-close');
    var body = document.querySelector('.jelly-body');
    var cs = card ? getComputedStyle(card) : null;
    var cb = box('.jelly-card'), pb = box('.jelly-plaque'), xb = box('.jelly-close');
    var doneBtns = document.querySelectorAll('.jelly-btn-primary');
    var db = doneBtns.length ? (function(){var r=doneBtns[doneBtns.length-1].getBoundingClientRect();
      return {top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1)};})() : null;
    return {
      card: cb, plaque: pb, close: xb, done: db,
      overflow: cs ? (cs.overflowX + ' / ' + cs.overflowY) : null,
      paddingTop: cs ? cs.paddingTop : null,
      scrollH: card ? card.scrollHeight : null,
      clientH: card ? card.clientHeight : null,
      plaqueClippedTop: (cb && pb) ? +(cb.top - pb.top).toFixed(1) : null
    };
  })()`);
  console.log('\n--- settings metrics ---');
  console.log(JSON.stringify(m2, null, 2));

  await shot('settings.png');
  await shotClip('settings-top.png', '.jelly-card', 12);

  /* 局内设置（多两项按钮 —— 校验 body 内部滚动不裁切首尾） */
  await ev('STM.Modals.close(); true'); await sleep(300);
  await ev('STM.Modals.openSettings(true, {}); true');
  await sleep(500);
  var m3 = await ev(`(function(){
    var card = document.querySelector('.jelly-card');
    var body = document.querySelector('.jelly-body');
    if (!card || !body) return null;
    var cb = card.getBoundingClientRect(), bb = body.getBoundingClientRect();
    var pb = document.querySelector('.jelly-plaque').getBoundingClientRect();
    var btns = document.querySelectorAll('.jelly-btn-primary');
    var db = btns.length ? btns[btns.length-1].getBoundingClientRect() : null;
    return {
      cardH: +cb.height.toFixed(1), bodyH: +bb.height.toFixed(1),
      bodyScrollH: body.scrollHeight, bodyClientH: body.clientHeight,
      plaqueInsideTop: +(pb.top - cb.top).toFixed(1),
      doneInsideBottom: db ? +(cb.bottom - db.bottom).toFixed(1) : null
    };
  })()`);
  console.log('\n--- in-game settings metrics ---');
  console.log(JSON.stringify(m3, null, 2));
  await shot('settings-ingame.png');

  fs.writeFileSync(path.join(OUT, 'metrics.json'),
    JSON.stringify({ lobby: metrics, settings: m2 }, null, 2));

  console.log('\n输出目录: ' + OUT);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  proc.kill();
  process.exit(0);
}

main().catch(function (e) {
  console.error('ui-fix-shots: ' + (e && e.stack || e));
  process.exit(2);
});
