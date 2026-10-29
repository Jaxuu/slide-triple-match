/* =========================================================
 * Glide Critters — 作品展示实机截图采集（Δ33/T116）
 *
 *   node tools/showcase-shots.js [outDir]
 *
 * 零 npm 依赖 —— Node 内置 WebSocket + 本机 Chrome/Edge（宪章 II 离线铁律）。
 * 视口固定为移动端标准比例 390 × 844，devicePixelRatio = 2（输出 780 × 1688）。
 *
 * 产出（默认 docs/screenshots/）:
 *   lobby.png              主大厅（标题 + 探险家头像 + 四格画卷相框 + 开始关卡按钮）
 *   gameplay_basic.png     标准对局 L3（7×7 双层堆叠 + 方向箭头 + 顶部 7 格待消槽）
 *   gameplay_mechanics.png 特殊机关 L13（冰封滑块 + 齿轮 + 底部三大道具栏）
 *   gameplay_highlight.png 困难关 L6 顶部流光预警横幅
 *   metrics.json           关键元素包围盒 + 画布像素统计（自动化断言用）
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
if (!BROWSER) { console.error('showcase-shots: 未找到 Chrome/Edge'); process.exit(2); }

var OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'screenshots');
var VW = 390, VH = 844, DPR = 2;
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
  var PORT = 9800 + Math.floor(Math.random() * 150);
  var userDataDir = require('os').tmpdir() + '/stm-showcase-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--hide-scrollbars',
    /* 允许 file:// 页面读取本地贴图 —— 否则棋盘 canvas 被标记为 tainted，
     * getImageData 抛 SecurityError，黑屏体检无法取证 */
    '--allow-file-access-from-files',
    '--window-size=' + VW + ',' + VH,
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
  if (!targets) { console.error('showcase-shots: DevTools 未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  /* 移动端标准视口 + 高清 2x + 触摸模拟 */
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: VW, height: VH, deviceScaleFactor: DPR, mobile: true,
    screenWidth: VW, screenHeight: VH, screenOrientation: { type: 'portraitPrimary', angle: 0 }
  });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

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
    var r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (!r || !r.data) { console.error('  shot failed: ' + name); return false; }
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    console.log('  ✓ ' + name + '  (' + Math.round(Buffer.from(r.data, 'base64').length / 1024) + ' KB)');
    return true;
  }

  /* 局部放大取证（只写 shots/，不入库）——用于人眼核对卡牌边缘是否被裁 */
  async function shotClip(name, x, y, w, h, scale) {
    var r = await c.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
      clip: { x: x, y: y, width: w, height: h, scale: scale || 3 }
    });
    if (!r || !r.data) { console.error('  clip failed: ' + name); return; }
    var dir = path.join(__dirname, '..', 'shots', 'showcase-qa');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.from(r.data, 'base64'));
    console.log('  · qa ' + name);
  }

  /* 画布像素体检：平均亮度 / 近黑占比 / 颜色多样性 —— 防黑屏、防未绘制 */
  async function pixelStats(sel) {
    return ev('(function(){' +
      'var cv=document.querySelector(' + JSON.stringify(sel) + ');' +
      'if(!cv) return {error:"no-canvas"};' +
      'var w=Math.min(cv.width,240),h=Math.min(cv.height,520);' +
      'var tmp=document.createElement("canvas");tmp.width=w;tmp.height=h;' +
      'var tx=tmp.getContext("2d");tx.drawImage(cv,0,0,w,h);' +
      'var d=tx.getImageData(0,0,w,h).data;var sum=0,dark=0,set={};' +
      'for(var i=0;i<d.length;i+=4){var l=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114);sum+=l;' +
      'if(l<8)dark++;set[(d[i]>>4)+","+(d[i+1]>>4)+","+(d[i+2]>>4)]=1;}' +
      'var n=d.length/4;' +
      'return {w:cv.width,h:cv.height,avgLum:+(sum/n).toFixed(1),darkRatio:+(dark/n).toFixed(3),colors:Object.keys(set).length};' +
      '})()');
  }

  /* 跳到指定关卡（复用调试面板下拉的 change 通道，等效深链） */
  async function jump(id) {
    var ok = await ev('(function(){var s=document.getElementById("debug-level");' +
      'if(!s) return "no-select"; s.value="' + id + '";' +
      's.dispatchEvent(new Event("change",{bubbles:true})); return s.value;})()');
    return ok;
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
  await sleep(1200);

  /* 展示截图不需要移动端调试抽屉的悬浮按钮（🛠 会压在「撤销」道具上） */
  await ev('(function(){var s=document.createElement("style");s.id="shot-hide-chrome";' +
    's.textContent="#debug-toggle{display:none!important}";document.head.appendChild(s);return true;})()');

  var report = {};

  /* ---------- 1. 主大厅 ---------- */
  report.lobby = await ev('(function(){' +
    'function box(sel){var e=document.querySelector(sel);if(!e)return null;' +
    'var r=e.getBoundingClientRect();return {x:+r.left.toFixed(1),y:+r.top.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};}' +
    'return {vw:window.innerWidth,vh:window.innerHeight,dpr:window.devicePixelRatio,' +
    'brand:box(".lobby-brand"),portal:box(".portal"),level:box(".lobby-btn-level"),avatar:box(".lobby-avatar")};})()');
  await shot('lobby.png');

  /* ---------- 2. 标准对局 L3 ---------- */
  await ev('(function(){var b=document.querySelector(".lobby-btn-level"); if(b) b.click(); return !!b;})()');
  await sleep(1400);
  await jump(3);
  await sleep(1600);
  report.basic = {
    level: await ev('document.getElementById("hud-level-no").textContent'),
    board: await pixelStats('#board'),
    dock: await ev('document.querySelectorAll("#dock .slot").length'),
    items: await ev('document.querySelectorAll("#items .item-btn").length')
  };
  await shot('gameplay_basic.png');

  /* ---------- 3. 特殊机关 L12（冰封 ×12 / 齿轮 ×14） ----------
   * L12 同时是峰值关，进场后会先弹 1.4s 预警横幅盖住待消槽 →
   * 等横幅自然淡出后再截，保证「冰封 + 齿轮 + 7 格槽 + 三道具」同框。 */
  await jump(12);
  await sleep(4200);
  report.mechanics = {
    level: await ev('document.getElementById("hud-level-no").textContent'),
    bannerGone: await ev('(function(){var e=document.getElementById("peak-banner");' +
      'return !e || !e.classList.contains("show") || +getComputedStyle(e).opacity === 0;})()'),
    flags: await ev('(document.getElementById("debug-level")||{}).selectedOptions && document.getElementById("debug-level").selectedOptions[0].textContent')
  };
  await shot('gameplay_mechanics.png');

  /* QA 局部放大：棋盘下沿 / 冰封区（人眼核对裁切与冰层可读性） */
  var bb = await ev('(function(){var e=document.getElementById("board-wrap").getBoundingClientRect();' +
    'return {x:r0(e.left),y:r0(e.top),w:r0(e.width),h:r0(e.height)};' +
    'function r0(v){return +v.toFixed(1);}})()');
  if (bb) {
    await shotClip('qa_board_bottom.png', bb.x, bb.y + bb.h - 80, bb.w, 90, 3);
    await shotClip('qa_board_ice.png', bb.x + bb.w * 0.1, bb.y + bb.h * 0.35, bb.w * 0.8, bb.h * 0.4, 2);
    await shotClip('qa_board_edge.png', 100, 300, 160, 120, 4);
  }

  /* ---------- 4. 困难关 L6 流光预警横幅 ----------
   * 横幅生命周期仅 1.4s，而 headless 截图有 ~400~600ms 延迟 →
   * 先轮询到 .show，再注入「.hide 也保持可见」的样式钉住，最后才截。 */
  await jump(6);
  var bannerSeen = false;
  for (var b = 0; b < 40; b++) {
    await sleep(120);
    var st = await ev('(function(){var e=document.getElementById("peak-banner");' +
      'if(!e) return null; var r=e.getBoundingClientRect();' +
      'return {show:e.classList.contains("show"),w:+r.width.toFixed(1),h:+r.height.toFixed(1),' +
      'text:(e.querySelector(".peak-banner-text")||{}).textContent||""};})()');
    if (st && st.show && st.w > 0) { bannerSeen = true; break; }
  }
  await ev('(function(){var s=document.createElement("style");s.id="shot-pin-banner";' +
    's.textContent="#peak-banner{transition:none!important}#peak-banner.hide{opacity:1!important;transform:none!important}";' +
    'document.head.appendChild(s);return true;})()');
  /* 把流光扫掠钉在 700ms（扫掠正中）——否则截图落在 opacity 0 的起止帧上，横幅像块纯色板 */
  await ev('(function(){try{var as=document.getAnimations();' +
    'for(var i=0;i<as.length;i++){var a=as[i];' +
    'if(a.animationName==="peak-sheen"){a.pause();a.currentTime=700;}}return true;}catch(e){return String(e);}})()');
  await sleep(260);
  report.highlight = {
    bannerSeen: bannerSeen,
    banner: await ev('(function(){var e=document.getElementById("peak-banner");' +
      'if(!e) return null;var r=e.getBoundingClientRect();' +
      'return {x:+r.left.toFixed(1),y:+r.top.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),' +
      'opacity:getComputedStyle(e).opacity,text:(e.querySelector(".peak-banner-text")||{}).textContent||""};})()'),
    board: await pixelStats('#board')
  };
  await shot('gameplay_highlight.png');

  /* 收尾：撤掉钉住的样式（不影响后续复用） */
  await ev('(function(){var s=document.getElementById("shot-pin-banner");if(s)s.remove();return true;})()');

  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log('\n--- metrics ---');
  console.log(JSON.stringify(report, null, 2));

  console.log('\n输出目录: ' + OUT);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  proc.kill();
  process.exit(0);
}

main().catch(function (e) {
  console.error('showcase-shots: ' + (e && e.stack || e));
  process.exit(2);
});
