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
      /* 测试口径修正：大厅顶部左区的 🛠 已于 a29bd26 下线（原「lobby wrench」
       * 缺陷根因是它与局内面板抢同一开关态，且挤压设置按钮命中区）。
       * 调试面板现行入口 = main.js ensureDebugToggle() 注入的全局
       * #debug-toggle（移动端显示，PC 端面板默认展开）。
       * 故此处改为**双向护栏**：大厅内不得再出现 🛠，且全局入口必须存在。 */
      debug: !!L.querySelector('.lobby-btn-debug'),
      debugToggle: !!document.getElementById('debug-toggle'),
      shards: (L.querySelector('.lobby-shards-value')||{}).textContent,
      brand: (L.querySelector('.lobby-brand-name')||{}).textContent,
      portal: !!L.querySelector('.portal'),
      levelBtn: (L.querySelector('.lobby-btn-level-text')||{}).textContent,
      avatar: !!L.querySelector('.lobby-avatar'),
      /* Δ18: 双层立体字 + 两侧风翼 + 棱镜星芒 + 徽标萌宠探头 */
      glide: !!L.querySelector('.lobby-brand-glide'),
      critters: !!L.querySelector('.lobby-brand-critters'),
      wings: L.querySelectorAll('.lobby-brand-wing').length,
      rows: L.querySelectorAll('.lobby-brand-row').length,
      burst: !!L.querySelector('.lobby-brand-burst'),
      brandPet: !!L.querySelector('.lobby-brand-pet'),
      gem: !!L.querySelector('.lobby-shards-icon svg')
    };
  })()`);
  check('B1 大厅根节点可见', zones && !zones.missing && zones.hidden === false);
  check('B2 顶部左: 设置⚙️', !!zones.settings);
  check('B3 顶部左仅设置⚙️（🛠 已迁至全局 #debug-toggle）',
    zones.debug === false && zones.debugToggle === true,
    'lobbyDebug=' + zones.debug + ' globalToggle=' + zones.debugToggle);
  check('B4 顶部右: 棱晶货币栏有数值', zones.shards !== undefined && zones.shards !== '');
  check('B5 中上: Glide Critters 徽标', zones.brand === 'Glide Critters', zones.brand);
  check('B6 中心: 棱晶星盘传送门', !!zones.portal);
  check('B7 中下: `关卡 X` 按钮', /^关卡 \d+$/.test(zones.levelBtn || ''), zones.levelBtn);
  check('B8 左下: 玩家头像按钮', !!zones.avatar);

  console.log('\n[lobby-smoke] Δ18 徽标双层立体字 + 双风翼 + 棱晶图标');
  check('B9 two-layer wordmark (Glide + Critters)',
    zones.glide && zones.critters);
  check('B9b two-row stack container', zones.rows === 2, 'rows=' + zones.rows);
  var brandGeo = await evalJs(`(function(){
    var b = document.querySelector('.lobby-brand');
    if (!b) return null;
    var wl = b.querySelector('.lobby-brand-wing-l');
    var wr = b.querySelector('.lobby-brand-wing-r');
    var nw = b.querySelector('.lobby-brand-name');
    if (!nw) return { missing: true };    var a = wl ? wl.getBoundingClientRect() : null;    var c = wr ? wr.getBoundingClientRect() : null;
    var n = nw.getBoundingClientRect();
    return { wingL: a ? Math.round(a.left) : 0, wingR: c ? Math.round(c.left) : 0,
             nameL: Math.round(n.left), nameR: Math.round(n.right),
             lw: a ? Math.round(a.width) : 0, rw: c ? Math.round(c.width) : 0,
             glideBottom: (function(){ var g = document.querySelector('.lobby-brand-glide');
               if (!g) return 0; return Math.round(g.getBoundingClientRect().bottom); })(),
             crittersTop: (function(){ var c2 = document.querySelector('.lobby-brand-critters');
               if (!c2) return 0; return Math.round(c2.getBoundingClientRect().top); })(),
             cRadius: (function(){ var c2 = document.querySelector('.lobby-brand-critters');
               if (!c2) return '?'; return getComputedStyle(c2).borderRadius; })(),
             wings: document.querySelectorAll('.lobby-brand-wing').length };
  })()`);
  check('B10 Critters no capsule frame',
    brandGeo && brandGeo.cRadius === '0px', brandGeo && brandGeo.cRadius);
  check('B11 two words stacked vertically',
    brandGeo && !brandGeo.missing && brandGeo.crittersTop >= brandGeo.glideBottom - 2,
    JSON.stringify(brandGeo));
  check('B12 side white triangles removed',
    brandGeo && brandGeo.wings === 0, 'wings=' + (brandGeo && brandGeo.wings));
  check('B12 棱镜星芒装饰在位', zones.burst);
  check('B13 徽标萌宠探头在位', zones.brandPet);
  check('B14 棱晶栏七彩切面棱晶 SVG', zones.gem);

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
  check('C4 gear teeth removed', portal.gear === 0, 'actual ' + portal.gear);
  check('C5 风翼纹饰(左右各一)', portal.wing === 2, '实际 ' + portal.wing);
  check('C6 新档位下晶片全为盲盒态', portal.lit === 0, 'lit=' + portal.lit);

  console.log('\n[lobby-smoke] Δ20 Bug 1: 拼图解锁进度与关卡进度一致');
  /* 模拟「关卡 12 但拼图 0/4」的老存档/跳关态：
     * progress v1 = unlocked 12；profile v2 的 paintingProgress 全 0 */
  await evalJs(`(function(){
    try {
      localStorage.setItem('slide-triple:progress:v1', JSON.stringify({
        v:1, unlocked:12, last:11, best:{}, muted:false, clearedLevels:[3,6,9]
      }));
    } catch (e) {}
    return true;
  })()`);
  /* 重载进度 → 重进大厅 */
  await evalJs(`(function(){
    STM.Lobby.setProgressCtx({ unlocked: 12, currentLevel: 11, clearedLevels: [3,6,9] });
    STM.Lobby.refresh({ unlocked: 12, level: 11, clearedLevels: [3,6,9] });
    return true;
  })()`);
  await sleep(400);
  var bug1 = await evalJs(`(function(){
    var L = document.getElementById('lobby');
    var st = STM.Lobby.paintingState(1);
    var chips = L.querySelectorAll('.portal-chip');
    var litFlags = [];
    for (var i=0;i<chips.length;i++) litFlags.push(chips[i].classList.contains('is-lit'));
    return {
      levelBtn: (L.querySelector('.lobby-btn-level-text')||{}).textContent,
      prog: (L.querySelector('.portal-plaque-prog')||{}).textContent,
      lit: L.querySelectorAll('.portal-chip.is-lit').length,
      blind: L.querySelectorAll('.portal-chip.is-blind').length,
      flags: litFlags,
      stateProgress: st.progress,
      maxPassed: STM.Profile.maxPassedLevel({ unlocked: 12, currentLevel: 11, clearedLevels: [3,6,9] }),
      cap0: (L.querySelector('.portal-chip-0 .portal-chip-caption')||{}).textContent,
      cap3: (L.querySelector('.portal-chip-3 .portal-chip-caption')||{}).textContent
    };
  })()`);
  check('D1 level button shows level 12', bug1.levelBtn === '关卡 12', bug1.levelBtn);
  check('D2 maxPassed = 11', bug1.maxPassed === 11, 'maxPassed=' + bug1.maxPassed);
  check('D3 first 3 pieces lit', bug1.lit === 3, 'lit=' + bug1.lit);
  check('D4 4th piece still blind', bug1.flags[3] === false, JSON.stringify(bug1.flags));
  check('D5 plaque shows 3/4', bug1.prog === '3/4', bug1.prog);
  check('D6 lit chip caption cleared', !bug1.cap0, bug1.cap0);
  check('D7 blind chip caption shows level 12', /12/.test(bug1.cap3 || ''), bug1.cap3);

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
  /* 测试口径修正：45 → 90。头像网格取 `bid <= 89`（见 src/ui/modals.js），
   * 与 spec FR-040 §2「90 选 1」一致；45 是 Δ14 前的旧图鉴基数。 */
  check('G1 头像网格 90 选 1', prof.cells === 90, '实际 ' + prof.cells);
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
  /* 测试口径修正：非满充能时底部按钮文案已改为**下一关号**（`关卡 N+1`），
   * 点击即 `enterGame(nextLevelId)` 直进下一关（src/ui/result.js:197 /
   * src/main.js:1496），不再是旧文案「返回主大厅」。
   * 满充能分支 → `继续` 由下方「传送门开启展板」组覆盖。 */
  check('H9 非满充能 → 按钮指向下一关', res.btn === '关卡 4', res.btn);

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
      noteLines: b.querySelectorAll('.portal-board-note-text').length,
      btn: (b.querySelector('.result-btn')||{}).textContent
    };
  })()`);
  check('J1 满充能 → 传送门展板出现', !!full.art);
  check('J2 时空传送门光柱', !!full.beam);
  check('J3 大陆名称', !!full.name, full.name);
  /* Δ19：预告区指向**下一片**大陆（本次刚拼齐的是 bg1 = L1-12，
   * 故预告徽章 MUST 为下一片的 `关卡 13-24`，而非刚完成的那一片） */
  check('J4 `关卡 X-Y` 徽章指向下一片大陆', full.range === '关卡 13-24', full.range);
  check('J5b 手账文案为两行', full.noteLines === 2, 'lines=' + full.noteLines);
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
  check('K8 复活按钮 = 棱晶 SVG + 100 棱晶复活', (fail.btnTexts[0]||'').indexOf('100') >= 0, fail.btnTexts[0]);
  check('K9 无底部多余小字', !/提示|教程|广告/.test(fail.full));

  console.log('\n[lobby-smoke] Δ20 Bug 2: 失败页出口按钮必须关闭失败层并切场景');
  /* 真实场景切换入口：enterGame / enterLobby 必须关闭 #fail-root，
   * 否则 z-index:26 的不透明失败层会盖死新场景（表现为「点击无反应」） */
  await evalJs(`(function(){
    STM.Fail.show({ kind:'lost_burst', reason:'收集槽爆满', score:120, percent:27,
                    onRevive:function(){}, onRestart:function(){}, onLobby:function(){} });
    return true;
  })()`);
  await sleep(400);
  var beforeBtn = await evalJs(`(function(){
    var F = document.getElementById('fail-root');
    return { hidden: F.hidden, display: getComputedStyle(F).display };
  })()`);
  check('L1 fail layer visible before click', beforeBtn.hidden === false, JSON.stringify(beforeBtn));

  /* 「重新开始」→ enterGame → 失败层 MUST 已关闭 */
  await evalJs(`(function(){
    STM.Fail.show({ kind:'lost_burst', reason:'收集槽爆满', score:120, percent:27,
      onRevive:function(){},
      onRestart:function(){ STM.main.enterGame(1); },
      onLobby:function(){} });
    return true;
  })()`);
  await sleep(300);
  var restartBtn = await evalJs(`(function(){
    var e = document.querySelector('.fail-foot button.jelly-btn-secondary');
    if (!e) return null; var r = e.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  })()`);
  await c.send('Input.dispatchMouseEvent', { type:'mousePressed', x:restartBtn.x, y:restartBtn.y, button:'left', clickCount:1 });
  await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:restartBtn.x, y:restartBtn.y, button:'left', clickCount:1 });
  await sleep(600);
  var afterRestart = await evalJs(`(function(){
    var F = document.getElementById('fail-root');
    return { hidden: F.hidden, display: getComputedStyle(F).display,
             sceneLobby: document.getElementById('app').classList.contains('scene-lobby') };
  })()`);
  check('L2 restart closes fail layer', afterRestart.hidden === true, JSON.stringify(afterRestart));
  check('L3 restart enters game scene', afterRestart.sceneLobby === false, JSON.stringify(afterRestart));

  /* 「返回主大厅」→ enterLobby → 失败层 MUST 已关闭且大厅可见 */
  await evalJs(`(function(){
    STM.Fail.show({ kind:'lost_burst', reason:'收集槽爆满', score:120, percent:27,
      onRevive:function(){}, onRestart:function(){},
      onLobby:function(){ STM.main.enterLobby({ unlocked:12, level:11 }); } });
    return true;
  })()`);
  await sleep(300);
  var backBtn = await evalJs(`(function(){
    var e = document.querySelector('.fail-back-lobby');
    if (!e) return null; var r = e.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  })()`);
  await c.send('Input.dispatchMouseEvent', { type:'mousePressed', x:backBtn.x, y:backBtn.y, button:'left', clickCount:1 });
  await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:backBtn.x, y:backBtn.y, button:'left', clickCount:1 });
  await sleep(600);
  var afterBack = await evalJs(`(function(){
    var F = document.getElementById('fail-root');
    var L = document.getElementById('lobby');
    return { hidden: F.hidden, display: getComputedStyle(F).display,
             lobbyHidden: L.hidden,
             sceneLobby: document.getElementById('app').classList.contains('scene-lobby') };
  })()`);
  check('L4 back-to-lobby closes fail layer', afterBack.hidden === true, JSON.stringify(afterBack));
  check('L5 back-to-lobby shows lobby', afterBack.lobbyHidden === false && afterBack.sceneLobby === true,
    JSON.stringify(afterBack));


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

  console.log('\n[lobby-smoke] 局内棱晶购买道具闭环（Δ18 T071 / FR-041 §2）');
  /* 进关 → 耗尽免费次数 → 角标切换「棱晶 SVG + 50」→ 点击扣费生效 → 余额不足拒绝 */
  /* 先关掉失败页并回到大厅（失败层为全屏模态，会拦截底层点击） */
  await evalJs(`(function(){
    if (window.STM.Fail && STM.Fail.hide) STM.Fail.hide();
    if (window.STM.Result && STM.Result.hide) STM.Result.hide();
    return true;
  })()`);
  await sleep(500);
  var backLobby = await evalJs(`(function(){
    var app = document.getElementById('app');
    return { lobbyHidden: document.getElementById('lobby') ? document.getElementById('lobby').hidden : null,
             sceneLobby: app ? app.classList.contains('scene-lobby') : null };
  })()`);
  check('N0 回到大厅（scene-lobby 生效）', backLobby && backLobby.lobbyHidden === false,
    JSON.stringify(backLobby));
  await evalJs('(function(){ STM.Profile.set("shards", 200); return true; })()');
  /* 经场景入口进关（大厅的 `关卡 X` 点击链路已在 B 组覆盖） */
  await evalJs('(function(){ STM.main.enterGame(1); return true; })()');
  await sleep(1400);

  var buySetup = await evalJs(`(function(){
    var s = STM.main.session();
    if (!s) return { noSession: true };
    var st = s.state();
    return { undo: st.items.undo, wrench: st.items.wrench, shards: STM.Profile.get().shards };
  })()`);
  check('N1 已进局内（会话存在）', buySetup && !buySetup.noSession, JSON.stringify(buySetup));

  /* 耗尽撤回免费次数 → 角标 MUST 自动切换为「棱晶 SVG + 50」
   * 注意：撤回依赖快照栈（需至少一步有效棋盘操作）——先做一次真实移动 */
  await evalJs(`(function(){
    var s = STM.main.session();
    if (!s) return false;
    var st = s.state();
    var tiles = st.board || [];
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i] && tiles[i].id != null) { s.tap(tiles[i].id); return true; }
    }
    return false;
  })()`);
  await sleep(700);
  await evalJs(`(function(){
    var s = STM.main.session();
    /* 连续使用撤回直到次数归零（免费次数用尽 → 购买态） */
    for (var i = 0; i < 8; i++) {
      var st = s.state();
      if ((st.items.undo || 0) <= 0) break;
      s.useItem('undo');
    }
    return true;
  })()`);
  await sleep(400);
  var badge = await evalJs(`(function(){
    var b = document.getElementById('item-undo');
    var c = b ? b.querySelector('.item-count') : null;
    return { text: c ? c.textContent : '', buyable: b ? b.classList.contains('is-buyable') : false,
             disabled: b ? b.disabled : false,
             svg: !!(c && c.querySelector('svg polygon')) };
  })()`);
  check('N2 免费次数用尽后角标 = 棱晶 SVG + 50（无 Emoji）',
    /50/.test(badge.text || '') && badge.svg === true && !/💎/.test(badge.text || ''),
    badge.text + ' svg=' + badge.svg);
  check('N3 角标进入购买态（is-buyable）', badge.buyable === true);
  check('N4 购买态按钮仍可点击（不得禁用）', badge.disabled === false);

  /* 点击撤回 → 扣 50 棱晶 + 飘字 `-50 💎` + 立即生效
   * 前置：撤回需快照栈非空——先做一步真实移动（购买后即产生新快照） */
  var beforeBuy = await evalJs('STM.Profile.get().shards');
  await evalJs(`(function(){
    var s = STM.main.session();
    var st = s.state();
    var tiles = st.board || [];
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i] && tiles[i].id != null) { s.tap(tiles[i].id); break; }
    }
    var b = document.getElementById('item-undo');
    b.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    return true;
  })()`);
  await sleep(400);
  var afterBuy = await evalJs(`(function(){
    return { shards: STM.Profile.get().shards,
             float: (document.querySelector('.shard-float')||{}).textContent || '',
             toast: (document.getElementById('toast')||{}).textContent || '' };
  })()`);
  check('N5 购买后扣除 50 棱晶', afterBuy.shards === beforeBuy - 50,
    beforeBuy + ' -> ' + afterBuy.shards);
  check('N6 扣费飘字 `-50 棱晶` 出现（无 Emoji）',
    /-50/.test(afterBuy.float) && !/💎/.test(afterBuy.float), afterBuy.float);
  check('N7 购买即生效（提示已消耗）', /消耗/.test(afterBuy.toast), afterBuy.toast);

  /* 余额不足 → 零扣费零消耗 + 轻晃提示 */
  await evalJs('(function(){ STM.Profile.set("shards", 10); return true; })()');
  await sleep(200);
  var beforeDeny = await evalJs('STM.Profile.get().shards');
  await evalJs(`(function(){
    var b = document.getElementById('item-undo');
    b.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    return true;
  })()`);
  await sleep(250);
  var afterDeny = await evalJs(`(function(){
    var b = document.getElementById('item-undo');
    return { shards: STM.Profile.get().shards,
             denied: b ? b.classList.contains('is-denied') : false,
             toast: (document.getElementById('toast')||{}).textContent || '' };
  })()`);
  check('N8 余额不足时零扣费（余额不变且 ≥0）', afterDeny.shards === beforeDeny && afterDeny.shards >= 0,
    beforeDeny + ' -> ' + afterDeny.shards);
  check('N9 余额不足给出明确提示', /不足/.test(afterDeny.toast), afterDeny.toast);
  check('N10 余额不足触发轻晃（is-denied）', afterDeny.denied === true);

  /* 余额恰等于价格 → 扣至 0 且道具仍正常生效（Edge Case 竞态铁律） */
  await evalJs('(function(){ STM.Profile.set("shards", 50); return true; })()');
  await sleep(200);
  var exactBefore = await evalJs('STM.Profile.get().shards');
  await evalJs(`(function(){
    var s = STM.main.session();
    var st = s.state();
    var tiles = st.board || [];
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i] && tiles[i].id != null) { s.tap(tiles[i].id); break; }
    }
    var b = document.getElementById('item-undo');
    b.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    return true;
  })()`);
  await sleep(400);
  var exactAfter = await evalJs(`(function(){
    return { shards: STM.Profile.get().shards,
             toast: (document.getElementById('toast')||{}).textContent || '' };
  })()`);
  check('N11 余额恰等于价格 → 扣至 0 且道具正常生效',
    exactAfter.shards === 0 && /消耗/.test(exactAfter.toast),
    exactBefore + ' -> ' + exactAfter.shards + ' / ' + exactAfter.toast);

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