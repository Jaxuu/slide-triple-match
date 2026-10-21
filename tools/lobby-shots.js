/* =========================================================
 * Slide & Triple — 外围 UI 截图取证（Δ17 原创性红线 + M5 验收佐证）
 *
 *   node tools/lobby-shots.js [outDir]
 *
 * 零 npm 依赖——Node 24 内置 WebSocket + 本机 Chrome/Edge（宪章 II 离线铁律）。
 * 产出: lobby.png / lobby-lit.png / settings.png / profile.png
 *       / result.png / board.png / fail.png —— 供 Δ17 第 ⑥ 条
 *       「竞品视觉元素清零静态核查」与 quickstart SC-009 人工验收使用。
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
if (!BROWSER) { console.error('lobby-shots: 未找到 Chrome/Edge'); process.exit(2); }

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
  var userDataDir = require('os').tmpdir() + '/stm-shots-' + Date.now();
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
  if (!targets) { console.error('lobby-shots: DevTools 未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  var indexPath = 'file:///' + path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/');
  await c.send('Page.navigate', { url: indexPath });
  await sleep(1500);
  await c.send('Runtime.evaluate', {
    expression: 'document.body.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))'
  });
  await sleep(1300);

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

  /* 1. 大厅（新档位：全盲盒态） */
  await shot('lobby.png');

  /* 2. 大厅（已点亮 2/4 —— 晶片折射图景 + 左右切换可用） */
  /* 走公开 API 点亮（Profile.set 不支持 paintingProgress 字段——
   * 用 unlockPaintingTile 递增，语义与真实通关一致） */
  await ev(`(function(){
    var P = STM.Profile;
    P.unlockPaintingTile(0); P.unlockPaintingTile(0);   /* bg1 点亮 2/4 */
    P.addShards(1640);                                  /* 200 -> 1840 */
    STM.Lobby.refresh({unlocked:7});
    return true;
  })()`);
  await sleep(900);
  await shot('lobby-lit.png');

  /* 3. 设置弹窗（奶油果冻基底） */
  await ev('document.querySelector(".lobby-btn-settings").click(); true');
  await sleep(700);
  await shot('settings.png');
  await ev('STM.Modals.close(); true'); await sleep(300);

  /* 4. 档案弹窗（45 选 1 头像网格） */
  await ev('document.querySelector(".lobby-avatar").click(); true');
  await sleep(800);
  await shot('profile.png');
  await ev('STM.Modals.close(); true'); await sleep(300);

  /* 5. 通关结算层（双风翼棱晶能量铭牌） */
  await ev('STM.Result.show({level:6,shards:60,litChip:true,paintingFull:false,firstClear:true,onContinue:function(){}}); true');
  await sleep(1100);
  await shot('result.png');

  /* 6. 传送门开启展板（4/4 触发 —— 先点亮至满充能再展示结算层） */
  await ev(`(function(){
    var P = STM.Profile;
    P.unlockPaintingTile(0); P.unlockPaintingTile(0);   /* 补满至 4/4 */
    STM.Result.show({ level: 12, shards: 310, litChip: true, paintingFull: true,
                      firstClear: true, onContinue: function(){} });
    return true;
  })()`);
  await sleep(900);
  await ev('(function(){var b=document.querySelector(".result-btn"); if(b) b.click(); return true;})()');
  await sleep(1200);
  await shot('board.png');

  /* 7. 失败页（零倒计时） */
  await ev('STM.Fail.show({kind:"lost_burst",reason:"收集槽爆满",score:320,percent:27,onRevive:function(){},onRestart:function(){},onLobby:function(){}}); true');
  await sleep(900);
  await shot('fail.png');

  console.log('\n输出目录: ' + OUT);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  proc.kill();
  process.exit(0);
}

main().catch(function (e) {
  console.error('lobby-shots: ' + (e && e.stack || e));
  process.exit(2);
});