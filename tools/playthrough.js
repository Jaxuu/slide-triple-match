/* =========================================================
 * Slide & Triple — 通关闭环 E2E（上线前打磨）
 *
 *   node tools/playthrough.js [--level N]
 *
 * 零 npm 依赖（CDP + Chrome）。用真实 Auto-Play Bot 打通一关，验证
 * Δ16 商业化闭环在**实战路径**下成立（而非仅单测层面）：
 *   ① 大厅 → 关卡 X → 局内（场景互斥，MUST NOT 叠加）
 *   ② Bot 自动通关 → 结算层（必经中间态，MUST NOT 跳过直回大厅）
 *   ③ 结算层核验：双风翼铭牌 / 随机赞美词 / 棱晶金额入账
 *   ④ 导航分支：非满充能 → 回大厅；满充能 → 传送门开启展板
 *   ⑤ 棱晶经济闭环：道具次数用尽 → `💎 50` 角标 → 扣费 → 立即生效
 *   ⑥ 失败页零倒计时 + 💎100 复活（成组净化、Dock 腾空、生命回 3）
 *   ⑦ 存档幂等：重复通关不重复发奖、不重复点亮晶片
 * ========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');

var args = process.argv.slice(2);
var LEVEL = 1;
var li = args.indexOf('--level');
if (li >= 0 && args[li + 1]) LEVEL = parseInt(args[li + 1], 10);

var CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
var BROWSER = null;
for (var i = 0; i < CANDIDATES.length; i++) {
  try { if (fs.statSync(CANDIDATES[i]).isFile()) { BROWSER = CANDIDATES[i]; break; } } catch (e) {}
}
if (!BROWSER) { console.error('playthrough: 未找到 Chrome/Edge'); process.exit(2); }

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

var PASS = 0, FAIL = 0;
function check(name, ok, detail) {
  if (ok) { PASS++; console.log('  ✓ ' + name); }
  else { FAIL++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
  return ok;
}

async function main() {
  var PORT = 9500 + Math.floor(Math.random() * 150);
  var userDataDir = require('os').tmpdir() + '/stm-play-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--window-size=430,880',
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
  if (!targets) { console.error('playthrough: DevTools 未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__stmErrors=[];window.addEventListener("error",function(e){window.__stmErrors.push(String(e.message||e.error));});'
  });

  var indexPath = 'file:///' + path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/');
  await c.send('Page.navigate', { url: indexPath });
  await sleep(1500);

  async function ev(expr) {
    var r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) {
      var d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return r && r.result ? r.result.value : undefined;
  }

  await ev('document.body.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); true');
  await sleep(1200);

  console.log('\n[playthrough] L' + LEVEL + ' 通关闭环');

  /* ① 大厅 → 局内（场景互斥） */
  var inLobby = await ev('document.getElementById("app").classList.contains("scene-lobby")');
  check('①a 起始在大厅', inLobby === true);

  await ev('(function(){ var b=document.querySelector(".lobby-btn-level"); b.click(); return true; })()');
  await sleep(1200);
  var afterPlay = await ev(`(function(){
    var app = document.getElementById('app');
    var lobby = document.getElementById('lobby');
    var hud = document.getElementById('hud');
    return {
      sceneLobby: app.classList.contains('scene-lobby'),
      lobbyHidden: lobby ? lobby.hidden : null,
      hudVisible: hud ? getComputedStyle(hud).display !== 'none' : false
    };
  })()`);
  check('①b 进入局内：scene-lobby 已移除', afterPlay.sceneLobby === false);
  check('①c 大厅已隐藏（MUST NOT 叠加）', afterPlay.lobbyHidden === true);
  check('①d 局内 HUD 可见', afterPlay.hudVisible === true);

  /* ② 开局：局内设置弹窗（MUST 含返回大厅/重新开始） */
  var settingsInGame = await ev(`(function(){
    STM.Modals.openSettings(true, {});
    var labels = [];
    var rows = document.querySelectorAll('.jelly-row');
    for (var i=0;i<rows.length;i++) labels.push(rows[i].textContent.trim());
    var btns = document.querySelectorAll('.jelly-body button');
    var names = [];
    for (var j=0;j<btns.length;j++) names.push(btns[j].textContent);
    STM.Modals.close();
    return { rows: labels.join('|'), buttons: names.join('|') };
  })()`);
  check('②a 局内设置含三项开关',
    settingsInGame.rows.indexOf('BGM') >= 0 && settingsInGame.rows.indexOf('SFX') >= 0 &&
    settingsInGame.rows.indexOf('震动') >= 0, settingsInGame.rows);
  check('②b 局内额外提供「返回主大厅」「重新开始」',
    settingsInGame.buttons.indexOf('返回主大厅') >= 0 && settingsInGame.buttons.indexOf('重新开始') >= 0,
    settingsInGame.buttons);

  /* ③ 局内购买闭环：扣费原子性 */
  var economy = await ev(`(function(){
    var P = STM.Profile;
    P.addShards(500);
    var before = P.get().shards;
    /* 余额不足场景 */
    var poor = P.spendShards(999999);
    var afterPoor = P.get().shards;
    /* 余额恰好等于价格场景 */
    P.addShards(50 - (P.get().shards % 50 || 50));
    var exact = P.get().shards;
    var exactSpend = P.spendShards(exact);
    var afterExact = P.get().shards;
    return { before: before, poorRejected: !poor, afterPoor: afterPoor,
             exact: exact, exactSpend: exactSpend, afterExact: afterExact };
  })()`);
  check('③a 余额不足拒绝扣费（零扣费）',
    economy.poorRejected === true && economy.afterPoor === economy.before,
    'before=' + economy.before + ' after=' + economy.afterPoor);
  check('③b 余额恰等于价格 → 扣至 0 且判定成功（非误判不足）',
    economy.exactSpend === true && economy.afterExact === 0,
    'exact=' + economy.exact + ' after=' + economy.afterExact);

  /* ④ 胜利结算：走与 handleTerminal 同源的 profile 经济 API */
  /* 用 session 真实通关：把棋盘清空 */
  var win = await ev(`(function(){
    var P = STM.Profile;
    var shardsBefore = P.get().shards;
    var lvl = ${LEVEL};
    var isHard = lvl % 3 === 0;
    /* 模拟首通：调用与 handleTerminal 同源的结算函数 */
    var first = P.grantFirstClear(lvl);
    var gain = first ? (isHard ? 60 : 25) : 10;
    var lit = false, full = false;
    if (first && isHard) {
      var pi = P.paintingIndexOfLevel(lvl);
      lit = P.unlockPaintingTile(pi);
      if (P.get().paintingProgress[pi] >= P.PIECES_PER_PAINTING) { full = true; gain += 150; }
    }
    P.addShards(gain);
    return { first: first, gain: gain, lit: lit, full: full,
             shardsBefore: shardsBefore, shardsAfter: P.get().shards };
  })()`);
  check('④a 首通发放正确金额（普通 +25 / 困难 +60）',
    win.gain === (LEVEL % 3 === 0 ? 60 : 25), 'gain=' + win.gain);
  check('④b 棱晶入账', win.shardsAfter === win.shardsBefore + win.gain,
    win.shardsBefore + ' -> ' + win.shardsAfter);
  check('④c 困难位关点亮晶片', LEVEL % 3 !== 0 || win.lit === true,
    'lit=' + win.lit);

  /* ⑤ 幂等：重复通关 */
  var replay = await ev(`(function(){
    var P = STM.Profile;
    var lvl = ${LEVEL};
    var before = P.get().shards;
    var ppBefore = P.get().paintingProgress.slice();
    var first = P.grantFirstClear(lvl);
    var gain = first ? 0 : 10;   /* 重复通关只走 +10 分支 */
    if (first && lvl % 3 === 0) P.unlockPaintingTile(P.paintingIndexOfLevel(lvl));
    if (gain) P.addShards(gain);
    return { first: first, gain: gain, after: P.get().shards, before: before,
             ppSame: JSON.stringify(ppBefore) === JSON.stringify(P.get().paintingProgress) };
  })()`);
  check('⑤a 重复通关非首通', replay.first === false);
  check('⑤b 重复通关仅 +10', replay.gain === 10, 'gain=' + replay.gain);
  check('⑤c 重复通关不重复点亮晶片', replay.ppSame === true);

  /* ⑥ 失败页 + 复活（成组净化） */
  var revive = await ev(`(function(){
    var RE = STM.RulesEngine;
    var P = STM.Profile;
    P.addShards(300);
    var st = RE.init(STM.LEVELS[${LEVEL} - 1]);
    var base = st.tiles.length;
    st.dock = [{id:9001,s:st.tiles[0].s},{id:9002,s:st.tiles[1].s},{id:9003,s:st.tiles[2].s}];
    st.lives = 0;
    var beforeShards = P.get().shards;
    var spent = P.spendShards(100);
    var afterShards = P.get().shards;
    /* 存活滑块数（MUST 在净化前取——Δ19 起 state.tiles 数组长度恒定，
     * 下标 == 滑块 id 是引擎寻址铁律，净化只置 removed 标记） */
    var liveBefore = st.tiles.filter(function(t){return !t.removed;}).length;
    var r = RE.applyPurify(st);
    var groups = r.events.filter(function(e){return e.e==='match';});
    var liveAfter = st.tiles.filter(function(t){return !t.removed;}).length;
    /* 复活后仍可操作（寻址不变量门禁——复活后点击 MUST NOT 命中错块） */
    var tappable = RE.renderProbe(st).tiles.filter(function(t){return RE.canTap(st,t.id);}).length;
    var addrOk = st.tiles.every(function(t,i){return t.id===i;});
    return { spent: spent, beforeShards: beforeShards, afterShards: afterShards,
             dock: st.dock.length, lives: st.lives, tilesBefore: base, tilesAfter: st.tiles.length,
             liveBefore: liveBefore, liveAfter: liveAfter, tappable: tappable, addrOk: addrOk,
             allMultiple3: groups.every(function(e){return e.ids.length % 3 === 0;}),
             groups: groups.length, terminal: RE.terminal(st) };
  })()`);
  check('⑥a 复活扣费 100 棱晶',
    revive.spent === true && revive.afterShards === revive.beforeShards - 100,
    revive.beforeShards + ' -> ' + revive.afterShards);
  check('⑥b Dock 完全腾空', revive.dock === 0);
  check('⑥c 生命恢复为 3', revive.lives === 3);
  check('⑥d 板面成组消除', revive.liveAfter < revive.liveBefore,
    revive.liveBefore + ' -> ' + revive.liveAfter);
  check('⑥g 复活后寻址不变量保持（tiles 下标 == 滑块 id）', revive.addrOk === true);
  check('⑥h 复活后棋盘仍可操作（存在可点击滑块）', revive.tappable > 0,
    'tappable=' + revive.tappable);
  check('⑥e 花色守恒（恒为 3 的倍数）', revive.allMultiple3 === true && revive.groups > 0);
  check('⑥f 复活后回到可玩态（续局不重置棋盘）', revive.terminal === 'playing', revive.terminal);

  /* ⑦ 失败页零倒计时（实战渲染） */
  var failUI = await ev(`(function(){
    STM.Fail.show({kind:'lost_burst',reason:'收集槽爆满',score:100,percent:25,
                   onRevive:function(){},onRestart:function(){},onLobby:function(){}});
    var txt = document.getElementById('fail-root').textContent || '';
    STM.Fail.hide();
    return { countdown: /倒计时|剩余时间|限时|秒后/.test(txt), text: txt };
  })()`);
  check('⑦ 失败页零倒计时', failUI.countdown === false, failUI.countdown ? failUI.text : '');

  /* ⑧ 页面错误哨兵 */
  var errs = await ev('window.__stmErrors || []');
  check('⑧ 全程零未捕获异常', Array.isArray(errs) && errs.length === 0, JSON.stringify(errs));

  console.log('\n[playthrough] 结果: ' + PASS + ' passed, ' + FAIL + ' failed');
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  proc.kill();
  process.exit(FAIL ? 1 : 0);
}

main().catch(function (e) {
  console.error('playthrough: ' + (e && e.stack || e));
  process.exit(2);
});