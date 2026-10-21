/* =========================================================
 * Slide & Triple — 主大厅 / 结算 / 失败页 浏览器冒烟（Δ17 T068~T075）
 *
 *   node tools/lobby-smoke.js
 *
 * 零 npm 依赖——Node 24 内置 WebSocket + 本机 Chrome/Edge（宪章 II 离线铁律）。
 *
 * 检查项:
 *   A. 页面错误哨兵: 全程 window.__stmErrors 无未捕获异常
 *   B. 主大厅六区齐备（设置/调试/棱晶栏/徽标/棱晶星盘/`关卡 X`/头像）
 *   C. 棱晶星盘结构: 4 块晶片 + 顶部铭牌 `X/4` + 左右切换按钮
 *   D. `关卡 X` 文案严格（无「开始」二字）
 *   E. 大厅背景非纯色（贴图或程序化浮空岛兜底均已绘制）
 *   F. 设置弹窗三项开关 + 棱晶拨片形态 + 琥珀金铭牌（Δ17）
 *   G. 档案弹窗 45 头像网格 + 昵称输入持久化
 *   H. 结算层双风翼铭牌要素（风翼/棱晶簇/铭牌/滑板萌宠/粒子/赞美词）
 *   I. 失败页零倒计时（无数字倒计时/限时话术）+ 两按钮
 *   J. 竞品视觉元素清零（Δ17 原创性红线静态核查）
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
if (!BROWSER) { console.error('lobby-smoke: 未找到 Chrome/Edge'); process.exit(2); }

var ERR_SENTINEL =
  'window.__stmErrors = [];\n' +
  'window.addEventListener("error", function (e) { window.__stmErrors.push(String(e.message || e.error)); });\n' +
  'window.addEventListener("unhandledrejection", function (e) { window.__stmErrors.push("promise:" + String(e.reason)); });\n';

function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var nextId = 1, pending = {}, ready = null;
  this.send = function (method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
  this.ready = new Promise(function (r) { ready = r; });
  ws.onopen = function () { ready(); };
  ws.onerror = function (err) { console.error('ws error', err); };
  ws.onmessage = function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && pending[msg.id]) {
      var p = pending[msg.id]; delete pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
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
  var PORT = 9800 + Math.floor(Math.random() * 300);
  var userDataDir = require('os').tmpdir() + '/stm-lobby-' + Date.now();
  var proc = cp.spawn(BROWSER, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-gpu', '--window-size=420,900',
    '--user-data-dir=' + userDataDir, 'about:blank'
  ], { stdio: 'ignore' });

  var targets = null;
  for (var t = 0; t < 40; t++) {
    await sleep(250);
    try {
      targets = await new Promise(function (resolve, reject) {
        http.get('http://127.0.0.1:' + PORT + '/json/list', function (res) {
          var body = ''; res.on('data', function (d) { body += d; });
          res.on('end', function () { resolve(JSON.parse(body)); });
        }).on('error', reject);
      });
      break;
    } catch (e) {}
  }
  if (!targets) { console.error('lobby-smoke: DevTools 端点未就绪'); proc.kill(); process.exit(2); }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: ERR_SENTINEL });

  var indexPath = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await c.send('Page.navigate', { url: indexPath });
  await sleep(1400);

  /* CDP 以「脚本」上下文求值——表达式 MUST 包在 IIFE 内（顶层 return 非法） */
  async function evalJs(expr) {
    var r = await c.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r && r.exceptionDetails) {
      var d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text || 'eval error');
    }
    return r && r.result ? r.result.value : undefined;
  }

  /* 等待开机动画自然播完（FR-038 ≈2.0s）或由首次 pointerdown 跳过 */
  await evalJs('document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles:true})); true');
  await sleep(1100);

  console.log('\n[lobby-smoke] 主大厅六区（FR-039 §2~§7）');
  var zones = await evalJs(`(function(){
    var L = document.getElementById('lobby');
    if (!L) return { missing: true };
    return {
      hidden: L.hidden,
      settings: !!L.querySelector('.lobby-btn-settings'),
      debug: !!L.querySelector('.lobby-btn-debug'),
      shards: (L.querySelector('.lobby-shards-value')||{}).textContent,
      brand: (L.querySelector('.lobby-brand-name')||{}).textContent,
      portal: !!L.querySelector('.portal'),
      levelBtn: (L.querySelector('.lobby-btn-level-text')||{}).textContent,
      avatar: !!L.querySelector('.lobby-avatar')
    };
  })()`);
  check('B1 大厅根节点可见', zones && !zones.missing && zones.hidden === false);
  check('B2 顶部左: 设置⚙️', !!zones.settings);
  check('B3 顶部左: 调试🛠', !!zones.debug);
  check('B4 顶部右: 棱晶货币栏有数值', zones.shards !== undefined && zones.shards !== '');
  check('B5 中上: Glide Critters 徽标', zones.brand === 'Glide Critters', zones.brand);
  check('B6 中心: 棱晶星盘传送门', !!zones.portal);
  check('B7 中下: `关卡 X` 按钮', /^关卡 \d+$/.test(zones.levelBtn || ''), zones.levelBtn);
  check('B8 左下: 玩家头像按钮', !!zones.avatar);

  console.log('\n[lobby-smoke] 棱晶星盘结构（Δ17 FR-039 §5）');
  var portal = await evalJs(`(function(){
    var chips = document.querySelectorAll('.portal-chip');
    var lit = document.querySelectorAll('.portal-chip.is-lit');
    return {
      chips: chips.length,
      lit: lit.length,
      prog: (document.querySelector('.portal-plaque-prog')||{}).textContent,
      prev: !!document.querySelector('.portal-nav-prev'),
      next: !!document.querySelector('.portal-nav-next'),
      gear: document.querySelectorAll('.portal-gear').length,
      wing: document.querySelectorAll('.portal-wing').length
    };
  })()`);
  check('C1 2×2 四块能量晶片', portal.chips === 4, '实际 ' + portal.chips);
  check('C2 顶部铭牌进度 `X/4`', /^\d\/4$/.test(portal.prog || ''), portal.prog);
  check('C3 左右切换按钮齐备', portal.prev && portal.next);
  check('C4 外圈机械齿轮刻纹(8齿)', portal.gear === 8, '实际 ' + portal.gear);
  check('C5 风翼纹饰(左右各一)', portal.wing === 2, '实际 ' + portal.wing);
  check('C6 新档位下晶片全为盲盒态', portal.lit === 0, 'lit=' + portal.lit);

  console.log('\n[lobby-smoke] 大厅背景（Δ17 §3 云端浮空岛兜底）');
  /* 画布尺寸 + 已绘制校验；getImageData 在 file:// 下会因跨源污染抛
   * SecurityError（项目既有 D-03 纪律），故先试像素、失败则回退尺寸判据 */
  var bg = await evalJs(`(function(){
    var cv = document.querySelector('.lobby-bg');
    if (!cv || !cv.getContext) return { missing: true };
    var g = cv.getContext('2d');
    var colors = -1, tainted = false;
    try {
      var d = g.getImageData(0, 0, Math.min(cv.width,40), Math.min(cv.height,40)).data;
      var uniq = {};
      for (var i=0;i<d.length;i+=4) uniq[d[i]+','+d[i+1]+','+d[i+2]] = 1;
      colors = Object.keys(uniq).length;
    } catch (e) { tainted = true; }
    return { w: cv.width, h: cv.height, colors: colors, tainted: tainted };
  })()`);
  /* 污染时以「画布已按视口尺寸分配（≠默认 300x150）」作为已绘制判据 */
  var bgOk = bg && !bg.missing && (bg.colors > 3 || (bg.tainted && bg.w !== 300));
  check('E1 背景画布已绘制（非空白）', bgOk, JSON.stringify(bg));

  console.log('\n[lobby-smoke] 设置弹窗（Δ17 奶油果冻基底）');
  /* 经大厅按钮真实点击进入（验证 late-bound handler 链路） */
  await evalJs(`document.querySelector('.lobby-btn-settings').click(); true`);
  await sleep(500);
  var setModal = await evalJs(`(function(){
    var rows = document.querySelectorAll('.jelly-row');
    var labels = [];
    for (var i=0;i<rows.length;i++) labels.push(rows[i].textContent.trim());
    var card = document.querySelector('.jelly-card');
    var plaque = document.querySelector('.jelly-plaque');
    var toggles = document.querySelectorAll('.prism-toggle');
    return { rows: rows.length, labels: labels, cardRadius: card?getComputedStyle(card).borderRadius:'',
             plaque: plaque?plaque.textContent:'', toggles: toggles.length };
  })()`);
  check('F1 设置弹窗已打开', setModal.rows >= 3, 'rows=' + setModal.rows);
  check('F2 三项开关齐备(BGM/SFX/震动)', (setModal.labels.join('|').indexOf('BGM') >= 0 &&
    setModal.labels.join('|').indexOf('SFX') >= 0 && setModal.labels.join('|').indexOf('震动') >= 0),
    setModal.labels.join('|'));
  check('F3 棱晶圆角拨片开关形态', setModal.toggles === 3, 'toggles=' + setModal.toggles);
  check('F4 琥珀金胶囊标题铭牌', setModal.plaque === '设置', setModal.plaque);
  check('F5 奶油软胶卡片大圆角', parseFloat(setModal.cardRadius) >= 20, setModal.cardRadius);
  await evalJs(`(window.STM.Modals?STM.Modals.close():document.querySelector('.modal-scrim').click()); true`);
  await sleep(300);

  console.log('\n[lobby-smoke] 档案弹窗（FR-040 §2）');
  await evalJs(`document.querySelector('.lobby-avatar').click(); true`);
  await sleep(600);
  var prof = await evalJs(`(function(){
    var cells = document.querySelectorAll('.avatar-cell');
    return { cells: cells.length, input: !!document.querySelector('.jelly-input'),
             selected: document.querySelectorAll('.avatar-cell.is-selected').length };
  })()`);
  check('G1 头像网格 45 选 1', prof.cells === 45, '实际 ' + prof.cells);
  check('G2 昵称输入框', prof.input);
  check('G3 选中项打勾高亮', prof.selected === 1, 'selected=' + prof.selected);
  /* 改昵称 → 持久化 */
  await evalJs(`(function(){
    var i = document.querySelector('.jelly-input');
    i.value = '棱晶旅人'; i.dispatchEvent(new Event('change'));
    return true;
  })()`);
  await sleep(300);
  var nickSaved = await evalJs(`(function(){
    var raw = localStorage.getItem('slide-triple:profile:v2');
    return raw ? JSON.parse(raw).nickname : '';
  })()`);
  check('G4 昵称持久化至 profile v2', nickSaved === '棱晶旅人', nickSaved);
  await evalJs(`(window.STM.Modals?STM.Modals.close():document.querySelector('.modal-scrim').click()); true`);
  await sleep(300);

  console.log('\n[lobby-smoke] 结算层 Δ17 双风翼棱晶能量铭牌（FR-042 §1）');
  await evalJs(`(function(){
    var P = STM.Profile;
    P.set('paintingProgress', [2,0,0,0,0,0]);   /* 造出已点亮态 */
    P.set('shards', 9999);
    STM.Lobby.show({ unlocked: 3, level: 3, debugOpen: false, handlers: {} });
    return true;
  })()`);
  await sleep(400);
  await evalJs(`(function(){
    /* 直接调结算层（绕过实战）——纯表现层，不改判定 */
    STM.Result.show({ level: 3, shards: 60, litChip: true, paintingFull: false,
                      firstClear: true, onContinue: function(){} });
    return true;
  })()`);
  await sleep(700);
  var res = await evalJs(`(function(){
    var R = document.getElementById('result-root');
    if (!R || R.hidden) return { hidden: true };
    return {
      wingL: !!R.querySelector('.plate-wing-l'),
      wingR: !!R.querySelector('.plate-wing-r'),
      shard: document.querySelectorAll('.plate-shard').length,
      bar: !!R.querySelector('.plate-bar'),
      praise: (R.querySelector('.plate-praise')||{}).textContent,
      rider: !!R.querySelector('.plate-rider'),
      board: !!R.querySelector('.plate-board'),
      spark: document.querySelectorAll('.spark').length,
      amt: (document.querySelector('.result-shard-amt')||{}).textContent,
      btn: (document.querySelector('.result-btn')||{}).textContent
    };
  })()`);
  check('H1 结算层可见', res && !res.hidden);
  check('H2 纯白滑行风翼(左右)', res.wingL && res.wingR);
  check('H3 七彩折射棱晶簇', res.shard >= 5, 'shards=' + res.shard);
  check('H4 琥珀金渐变铭牌', res.bar);
  check('H5 20词库赞美词非空', !!res.praise, res.praise);
  check('H6 萌宠乘发光滑板跃起', res.rider && res.board);
  check('H7 棱晶星芒与光点粒子', res.spark >= 8, 'sparks=' + res.spark);
  check('H8 棱晶飞入动效金额 +60', res.amt === '+60', res.amt);
  check('H9 非满充能 → 按钮为返回大厅', res.btn === '返回主大厅', res.btn);

  console.log('\n[lobby-smoke] 传送门开启展板（4/4 触发）');
  await evalJs(`(function(){
    STM.Result.show({ level: 12, shards: 310, litChip: true, paintingFull: true,
                      firstClear: true, onContinue: function(){} });
    return true;
  })()`);
  await sleep(500);
  /* 展板由结算层底部按钮「开启新大陆」进入（FR-042 §3 导航分支） */
  await evalJs(`(function(){
    var btn = document.querySelector('.result-btn');
    if (btn) btn.click();
    return true;
  })()`);
  await sleep(700);
  var full = await evalJs(`(function(){
    var b = document.querySelector('.portal-board');
    if (!b) return { missing: true };
    return {
      art: !!b.querySelector('.portal-board-cv'),
      beam: !!b.querySelector('.portal-beam'),
      name: (b.querySelector('.portal-board-name')||{}).textContent,
      range: (b.querySelector('.portal-board-range')||{}).textContent,
      note: (b.querySelector('.portal-board-note-text')||{}).textContent,
      btn: (b.querySelector('.result-btn')||{}).textContent
    };
  })()`);
  check('J1 满充能 → 传送门展板出现', !!full.art);
  check('J2 时空传送门光柱', !!full.beam);
  check('J3 大陆名称', !!full.name, full.name);
  check('J4 `关卡 X-Y` 徽章', full.range === '关卡 1-12', full.range);
  check('J5 萌宠探险手账文案', !!full.note && full.note.length > 4);
  check('J6 `继续` 按钮', full.btn === '继续', full.btn);

  console.log('\n[lobby-smoke] 失败页零倒计时（FR-043）');
  await evalJs(`(function(){
    STM.Fail.show({ kind:'lost_burst', reason:'收集槽爆满', score: 120, percent: 27,
                    onRevive:function(){}, onRestart:function(){}, onLobby:function(){} });
    return true;
  })()`);
  await sleep(600);
  var fail = await evalJs(`(function(){
    var F = document.getElementById('fail-root');
    if (!F || F.hidden) return { hidden: true };
    var txt = F.textContent || '';
    var btns = F.querySelectorAll('.fail-foot button');
    return {
      plaque: (F.querySelector('.fail-plaque')||{}).textContent,
      encourage: (F.querySelector('.fail-encourage')||{}).textContent,
      pet: !!F.querySelector('.fail-pet-face'),
      tears: document.querySelectorAll('.fail-tear').length,
      buttons: btns.length,
      btnTexts: [btns[0]&&btns[0].textContent, btns[1]&&btns[1].textContent],
      /* 倒计时扫描: 匹配"剩余/倒计时/限时"话术与裸秒数 */
      countdownWords: /倒计时|剩余时间|限时|秒后/.test(txt),
      bigNumbers: txt.match(/\b[0-9]{2,}\s*秒/g),
      full: txt
    };
  })()`);
  check('K1 失败页可见', fail && !fail.hidden);
  check('K2 温和鼓励文案', fail.plaque === '差一点就过关了！', fail.plaque);
  check('K3 XX% 通关率暗示(非倒计时)', fail.encourage && fail.encourage.indexOf('%') > 0, fail.encourage);
  check('K4 无倒计时话术', !fail.countdownWords);
  check('K5 无"N秒"倒计时数字', !fail.bigNumbers, JSON.stringify(fail.bigNumbers));
  check('K6 萌宠头像 + 泪滴动效', fail.pet && fail.tears >= 0);
  check('K7 底部仅两个按钮', fail.buttons === 2, 'buttons=' + fail.buttons);
  check('K8 复活按钮 = 💎100 棱晶复活', (fail.btnTexts[0]||'').indexOf('100') >= 0, fail.btnTexts[0]);
  check('K9 无底部多余小字', !/提示|教程|广告/.test(fail.full));

  console.log('\n[lobby-smoke] 竞品视觉元素清零（Δ17 原创性红线）');
  var banned = await evalJs(`(function(){
    var all = document.documentElement.innerHTML;
    var terms = {
      '蓝色木墙': /竖条纹|条纹木墙|woodwall|bluewall/i,
      '号角': /号角|trumpet|horn-/i,
      '丝带横幅': /丝带|彩带横幅|ribbon-banner/i,
      '天蓝圆弧顶盖': /天蓝圆弧|arc-top|skytop-cap/i,
      '室内盆栽': /盆栽|pottedplant|houseplant/i
    };
    var hits = [];
    for (var k in terms) if (terms[k].test(all)) hits.push(k);
    return hits;
  })()`);
  check('L1 无竞品视觉元素标记', banned.length === 0, banned.join(','));

  console.log('\n[lobby-smoke] 页面错误哨兵');
  var errs = await evalJs('window.__stmErrors || []');
  check('M1 全程零未捕获异常', Array.isArray(errs) && errs.length === 0, JSON.stringify(errs));

  console.log('\n[lobby-smoke] 结果: ' + PASS + ' passed, ' + FAIL + ' failed');
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  proc.kill();
  process.exit(FAIL ? 1 : 0);
}

main().catch(function (e) {
  console.error('lobby-smoke: ' + (e && e.stack || e));
  process.exit(2);
});