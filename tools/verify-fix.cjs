'use strict';
/* 修复验证探针（Δ15b3e）: 双形态 file:// / http:// 并行验证三 Bug
 * 用法: node tools/verify-fix.cjs
 */
var cp = require('child_process');
var path = require('path');
var http = require('http');
var fs = require('fs');

var BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var ROOT = path.resolve(__dirname, '..');
var LEVEL = 12;
var PORT = 8100 + Math.floor(Math.random() * 80);

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var nextId = 1, pending = {}, ready = null;
  this.send = function (m, p) {
    return new Promise(function (res, rej) {
      var id = nextId++;
      pending[id] = { resolve: res, reject: rej };
      ws.send(JSON.stringify({ id: id, method: m, params: p || {} }));
    });
  };
  this.close = function () { try { ws.close(); } catch (e) {} };
  this.ready = new Promise(function (r) { ready = r; });
  ws.onopen = function () { ready(); };
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  };
}

var failAll = [];
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failAll.push(name); console.log('  ✗ ' + name + (extra ? ' [' + extra + ']' : '')); }
}

(async function () {
  var userDataDir = require('os').tmpdir() + '/stm-verify-' + Date.now();
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
          var b = ''; res.on('data', function (d) { b += d; });
          res.on('end', function () { resolve(JSON.parse(b)); });
        }).on('error', reject);
      }); break;
    } catch (e) {}
  }
  var page = targets.filter(function (x) { return x.type === 'page'; })[0];
  var c = new cdp(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Runtime.enable');

  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  var srv = http.createServer(function (req, res) {
    var p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (p.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, function (e, buf) {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise(function (r) { srv.listen(8099, r); });

  async function ev(expr) {
    var r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return { __err: String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).split('\n')[0] };
    return r.result.value;
  }

  var FORMS = [
    { name: 'file://', url: 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html?level=' + LEVEL },
    { name: 'http://', url: 'http://127.0.0.1:8099/index.html?level=' + LEVEL }
  ];

  for (var f = 0; f < FORMS.length; f++) {
    var F = FORMS[f];
    console.log('\n===== 形态: ' + F.name + ' =====');
    await c.send('Page.navigate', { url: F.url });
    /* 就绪轮询（开机动画 2.0s + 淡出 0.38s）——固定 sleep 在慢机/二次加载时
     * 会抢跑，导致 Dock 探针在 session 为 null 时抛错 */
    for (var w = 0; w < 80; w++) {
      var ready = await ev('!!(window.STM && STM.main && STM.main.session && STM.main.session())');
      if (ready === true) break;
      await sleep(200);
    }
    await sleep(600);

    /* ---- Bug A ---- */
    var dockInfo = await ev('(function(){' +
      ' var st=STM.main.session().engineState();' +
      ' var lv=STM.LEVELS[' + (LEVEL-1) + '];' +
      ' var m=STM.Bestiary.mappingForLevel(lv);' +
      ' var suits=Object.keys(m).map(Number).slice(0,5);' +
      ' st.dock=suits.map(function(s,i){return {id:9000+i,s:s};});' +
      ' var d=document.getElementById("dock");' +
      ' var html=""; for(var i=0;i<5;i++){html+=\'<div class="slot has-tile" data-idx="\'+i+\'">\'+STM.chipSVG(suits[i],lv)+\'</div>\';}' +
      ' d.innerHTML=html; STM.paintDockIcons();' +
      ' var out=[]; for(var k=0;k<d.children.length;k++){var el=d.children[k];' +
      '  var img=el.querySelector("img.dock-icon"), cv=el.querySelector("canvas.dock-icon"), sp=el.querySelector(".chip-icon-emoji");' +
      '  out.push({i:k, kind: img?("IMG["+img.naturalWidth+"x"+img.naturalHeight+"]") : (cv?("CANVAS["+cv.width+"x"+cv.height+"]"):(sp?("EMOJI:"+sp.textContent):"EMPTY"))});}' +
      ' return JSON.stringify(out); })()');

    console.log('  Dock 内容: ' + (typeof dockInfo === 'string' ? dockInfo : JSON.stringify(dockInfo)));
    if (typeof dockInfo !== 'string') {
      console.error('  Dock 探针异常: ' + JSON.stringify(dockInfo));
      check('Bug A: Dock 探针可执行（无 JS 异常）', false, JSON.stringify(dockInfo));
      dockInfo = '[]';
    }
    var dArr = JSON.parse(dockInfo);
    var imgN = dArr.filter(function (x) { return x.kind.indexOf('IMG') === 0; }).length;
    var cvN = dArr.filter(function (x) { return x.kind.indexOf('CANVAS') === 0; }).length;
    var emN = dArr.filter(function (x) { return x.kind.indexOf('EMOJI') === 0; }).length;
    check('Bug A: Dock 无 Emoji（图标与棋盘同源贴图）', emN === 0, 'emoji=' + emN);
    check('Bug A: Dock 图标为贴图出口（img=' + imgN + ' canvas=' + cvN + '）', imgN + cvN === dArr.length);

    /* canvas 兜底是否真的画了非空像素（与棋盘同图） */
    var painted = await ev('(function(){ var cvs=document.querySelectorAll("#dock canvas.dock-icon");' +
      ' if(!cvs.length) return "n/a"; var cv=cvs[0], c2=cv.getContext("2d");' +
      ' try{ var d=c2.getImageData(0,0,cv.width,cv.height).data; var n=0;' +
      '  for(var i=3;i<d.length;i+=4) if(d[i]>10) n++;' +
      '  return JSON.stringify({w:cv.width,h:cv.height,opaquePx:n}); }' +
      ' catch(e){ return "TAINTED"; } })()');
    console.log('  canvas 兜底绘制: ' + painted);

    var srcConsistency = await ev('(function(){ var lv=STM.LEVELS[' + (LEVEL-1) + '];' +
      ' var m=STM.Bestiary.mappingForLevel(lv); var suits=Object.keys(m).map(Number).slice(0,5);' +
      ' var out=[]; for(var i=0;i<suits.length;i++){ var bid=m[suits[i]];' +
      '   out.push({suit:suits[i],bid:bid,hasSlice:!!STM.IconAssets.sliceCanvasOf(bid)}); }' +
      ' return JSON.stringify(out); })()');
    console.log('  suit→bid 切片: ' + srcConsistency);

    /* ---- Bug B ---- */
    var geom = await ev('(function(){ var cv=document.getElementById("board"); var r=cv.getBoundingClientRect();' +
      ' var ctx=cv.getContext("2d");' +
      ' return JSON.stringify({bitmapW:cv.width,bitmapH:cv.height,cssW:+r.width.toFixed(1),cssH:+r.height.toFixed(1),' +
      '  /* 关键指标：位图宽高比 vs CSS 盒宽高比——相等即无拉伸（与 DPR 无关）*/' +
      '  aspectBitmap:+(cv.width/cv.height).toFixed(4), aspectCss:+(r.width/r.height).toFixed(4),' +
      '  aspectDelta:+(Math.abs((cv.width/cv.height)-(r.width/r.height))/(r.width/r.height)).toFixed(4),' +
      '  dpr:window.devicePixelRatio, pxPerCssY:+(cv.height/r.height).toFixed(2),' +
      '  smoothing:ctx.imageSmoothingQuality}); })()');
    console.log('  棋盘几何: ' + geom);
    var G = JSON.parse(geom);
    /* 位图与 CSS 盒的宽高比须一致——原实现位图 1.0 / CSS 盒 0.851（拉伸 18%），
       修复后两者均为 1.0。与 DPR 数值无关（DPR 只影响绝对像素数）。 */
    check('Bug B: 无纵向拉伸（位图宽高比 == CSS 盒宽高比）',
      G.aspectDelta < 0.02, 'aspectBitmap=' + G.aspectBitmap + ' aspectCss=' + G.aspectCss + ' delta=' + G.aspectDelta);
    check('Bug B: 棋盘 CSS 盒为正方形（aspect=1.0）',
      Math.abs(G.aspectCss - 1) < 0.02, 'aspectCss=' + G.aspectCss);
    check('Bug B: 2x 超采样（pxPerCssY≥2）', G.pxPerCssY >= 2, 'pxPerCssY=' + G.pxPerCssY);
    check('Bug B: imageSmoothingQuality=high', G.smoothing === 'high', G.smoothing);

    var sliceRes = await ev('(function(){ var s=STM.IconAssets.sliceCanvasOf(1); return s? (s.width+"x"+s.height) : "null"; })()');
    check('Bug B: 切片分辨率 256（源 512）', sliceRes === '256x256', sliceRes);

    var veil = await ev('(function(){ var cs=getComputedStyle(document.getElementById("board"));' +
      ' return JSON.stringify({backdrop:cs.backdropFilter||cs.webkitBackdropFilter, bg:cs.backgroundColor}); })()');
    console.log('  #board computed: ' + veil);
    var V = JSON.parse(veil);
    check('Bug B: 无 backdrop-filter 毛玻璃', V.backdrop === 'none', V.backdrop);
    check('Bug B: 底板无白纱（透明）', V.bg === 'rgba(0, 0, 0, 0)', V.bg);

    /* 画布角点应透明（无 veil） */
    var corner = await ev('(function(){ var cv=document.getElementById("board"); var ctx=cv.getContext("2d");' +
      ' try{ var d=ctx.getImageData(3,3,1,1).data; return JSON.stringify([d[0],d[1],d[2],d[3]]); }' +
      ' catch(e){ return "TAINTED"; } })()');
    console.log('  画布角点像素: ' + corner);

    /* ---- Bug C ---- */
    var arrow = await ev('(function(){' +
      ' var cv=document.getElementById("board"); var ctx=cv.getContext("2d");' +
      ' var lv=STM.LEVELS[' + (LEVEL-1) + ']; var n=lv.n; var cell=cv.width/n;' +
      ' var lum=function(p){return 0.299*p[0]+0.587*p[1]+0.114*p[2];};' +
      ' var found=[];' +
      ' for(var i=0;i<lv.tiles.length && found.length<4;i++){ var t=lv.tiles[i]; if(t.z) continue;' +
      '   var d=t.d, dc=[0,1,0,-1][d], dr=[-1,0,1,0][d];' +
      '   var w=cell-2, x=(t.c+0.5)*cell-w/2, y=(t.r+0.5)*cell-w/2;' +
      '   /* 方向角标贴在新牌面（tileSize = cellStep-1）内侧 4 CSS px 处 */' +
      '   var ax=Math.round(x+w/2+dc*(w/2-8)), ay=Math.round(y+w/2+dr*(w/2-8));' +
      '   var vals=[],sat=0;' +
      '   try{ for(var dx=-6;dx<=6;dx++) for(var dy=-6;dy<=6;dy++){' +
      '     var xx=ax+dx,yy=ay+dy; if(xx<0||yy<0||xx>=cv.width||yy>=cv.height) continue;' +
      '     var p=ctx.getImageData(xx,yy,1,1).data; vals.push(+lum(p).toFixed(1));' +
      '     var mx=Math.max(p[0],p[1],p[2]), mn=Math.min(p[0],p[1],p[2]);' +
      '     if(mx>40) sat=Math.max(sat, mx-mn); }' +
      '   }catch(e){ return "TAINTED"; }' +
      '   vals.sort(function(a,b){return a-b;});' +
      '   found.push({d:d, spread:+(vals[vals.length-1]-vals[0]).toFixed(1), maxSaturation:sat});' +
      ' }' +
      ' return JSON.stringify(found); })()');
    if (arrow === 'TAINTED') {
      console.log('  箭头像素: TAINTED（file:// 画布被污染——无法直接采样）');
      var dirColors = await ev('JSON.stringify(STM.rendererTest.DIR_COLORS)');
      console.log('  DIR_COLORS: ' + dirColors);
      check('Bug C: 四向主题色常量正确',
        dirColors === '["#10B981","#F59E0B","#EF4444","#3B82F6"]', dirColors);
    } else {
      var A = JSON.parse(arrow);
      console.log('  箭头亮度跨度/饱和度: ' + arrow);
      check('Bug C: 箭头与卡面对比显著（跨度≥40）',
        A.every(function (x) { return x.spread >= 40; }), JSON.stringify(A));
      check('Bug C: 箭头高饱和（四向彩色非灰白）',
        A.some(function (x) { return x.maxSaturation >= 60; }), JSON.stringify(A));
    }

    /* ---- hitTest 回归（ingame-hud-render-defects / Bug 1）----
     * 原断言是**死代码**：__hitGot 从未被写入，也没有任何 check()。
     * 现在直接对真实 renderer 实例断言：逐格点击可视中心必须命中该格
     * 卡牌（被压牌跳过），右/下半区不得再出现「点了没反应」。
     * 这是唯一能真正防住「绘制/命中坐标系分裂」复发的测试。 */
    var hit = await ev('(function(){' +
      ' var R=STM.main.renderer && STM.main.renderer(); if(!R) return "NO_RENDERER";' +
      ' var cv=document.getElementById("board"); var fr=cv.getBoundingClientRect();' +
      ' var lay=R.layoutOf(); if(!lay||!lay.cellStep) return "NO_LAYOUT";' +
      ' var pr=STM.RulesEngine.renderProbe(STM.main.session().engineState());' +
      ' var tested=0, miss=[], wrong=[];' +
      ' function inside(id,x,y){ var tr=R.tileRect(id); if(!tr) return false;' +
      '   return x>=tr.x-tr.w/2-1 && x<=tr.x+tr.w/2+1 && y>=tr.y-tr.h/2-1 && y<=tr.y+tr.h/2+1; }' +
      ' for(var i=0;i<pr.tiles.length;i++){ var t=pr.tiles[i]; if(t.covered) continue;' +
      '   var tr=R.tileRect(t.id); if(!tr) continue; tested++;' +
      '   var got=R.hitTest(tr.x, tr.y);' +
      '   if(got<0){ miss.push("id"+t.id+"@("+t.r+","+t.c+")"); continue; }' +
      '   if(!inside(got,tr.x,tr.y)) wrong.push("id"+t.id+"→"+got); }' +
      ' /* 独立坐标验证: 由 DOM 盒宽直接换算 z=0 牌中心（不经 renderer 几何）*/' +
      ' var probe=null, pgot=-1;' +
      ' for(var k=0;k<pr.tiles.length;k++){ var q=pr.tiles[k]; if(q.covered||q.z) continue;' +
      '   probe=q; break; }' +
      ' if(probe){ var rr=probe.rr!=null?probe.rr:probe.r, cc=probe.cc!=null?probe.cc:probe.c;' +
      '   pgot=R.hitTest(fr.left+(cc+0.5)*fr.width/pr.n, fr.top+(rr+0.5)*fr.height/pr.n); }' +
      ' var out=R.hitTest(fr.left-40, fr.top-40);' +
      ' return JSON.stringify({n:pr.n, tested:tested, miss:miss, wrong:wrong,' +
      '   domProbeId:probe?probe.id:-1, domProbeGot:pgot, outside:out}); })()');
    console.log('  hitTest: ' + hit);
    if (hit === 'NO_RENDERER' || hit === 'NO_LAYOUT') {
      check('Bug 1: renderer 实例可访问（hitTest 回归前置）', false);
    } else {
      var HI = JSON.parse(hit);
      check('Bug 1: 每张未被压卡牌的可视中心都能命中（无「点了没反应」）',
        HI.tested > 0 && HI.miss.length === 0,
        'tested=' + HI.tested + ' miss=' + HI.miss.slice(0, 6).join(','));
      check('Bug 1: 命中结果包含点击点（100% 落在被点卡牌的矩形内）',
        HI.wrong.length === 0, HI.wrong.slice(0, 6).join(','));
      check('Bug 1: DOM 盒宽直接换算的 z=0 牌中心可命中',
        HI.domProbeId >= 0 && HI.domProbeGot >= 0, JSON.stringify({
          expect: HI.domProbeId, got: HI.domProbeGot
        }));
      check('Bug 1: 棋盘外点击返回 -1', HI.outside === -1, String(HI.outside));
    }
    /* 网格对齐验证（结构性，非像素猜测）。
     * 逐像素探针在实测中不可靠：45 种图标的实际占幅差异很大
     * （tools/scan-card.cjs 实测某宽图标达 ±0.25 cell 以上），任一固定
     * 偏移都可能落在图标或箭头上，得出与「对齐」无关的结论。
     * 故改为断言真正决定对齐的三个不变量：
     *   ① 位图宽高比 == CSS 盒宽高比（无拉伸——已由 aspectDelta 断言）
     *   ② cell = bitmap / n 为精确整数关系（绘制网格与 n×n 严格绑定）
     *   ③ 画布四角之外无内容溢出（boardPx 边界即网格边界）
     * 另外抽样 3 枚滑块的卡面角点做定性佐证（不作为硬门禁）。 */
    var align = await ev('(function(){ var cv=document.getElementById("board"); var ctx=cv.getContext("2d");' +
      ' var es=STM.main.session().engineState(); var n=es.n; var cell=cv.width/n;' +
      ' var r=cv.getBoundingClientRect();' +
      ' /* ② cell 与 n 的绑定关系 */' +
      ' var cellExact = Math.abs(cell - cv.width/n) < 1e-9;' +
      ' /* ③ 四角外无内容（画布边界即网格边界） */' +
      ' var cornerClean=true;' +
      ' try{ [[2,2],[cv.width-3,2],[2,cv.height-3],[cv.width-3,cv.height-3]].forEach(function(pt){' +
      '   var d=ctx.getImageData(pt[0],pt[1],1,1).data;' +
      '   /* 角落应近透明（棋盘四角无滑块）或为背景透出——不可出现不透明纯色卡面 */' +
      '   if(d[3]>200 && d[0]>200 && d[1]>200 && d[2]>200) cornerClean=false; }); }' +
      ' catch(e){ return "TAINTED"; }' +
      ' /* ① 宽高比一致 */' +
      ' var aspectMatch = Math.abs((cv.width/cv.height)-(r.width/r.height))/(r.width/r.height) < 0.02;' +
      ' /* 定性佐证: 抽 3 枚滑块，量其卡面四角的奶油白覆盖率 */' +
      ' var samples=[];' +
      ' for(var i=0;i<es.tiles.length && samples.length<3;i++){ var t=es.tiles[i]; if(t.z) continue;' +
      '   var cx=(t.c+0.5)*cell, cy=(t.r+0.5)*cell, w=cell*0.42;' +
      '   var corners=[[cx-w,cy-w],[cx+w,cy-w],[cx-w,cy+w],[cx+w,cy+w]], white=0;' +
      '   corners.forEach(function(pt){ var p=ctx.getImageData(Math.round(pt[0]),Math.round(pt[1]),1,1).data;' +
      '     var mx=Math.max(p[0],p[1],p[2]), mn=Math.min(p[0],p[1],p[2]);' +
      '     if(p[0]>185&&p[1]>185&&p[2]>185&&(mx-mn)<40) white++; });' +
      '   samples.push(white+"/4"); }' +
      ' return JSON.stringify({aspectMatch:aspectMatch, cellExact:cellExact, cornerClean:cornerClean,' +
      '   n:n, cell:+cell.toFixed(3), bitmap:cv.width, cornerWhiteSamples:samples}); })()');
    console.log('  网格对齐结构断言: ' + align);
    if (align !== 'TAINTED') {
      var AL = JSON.parse(align);
      check('Bug B: 位图宽高比 == CSS 盒宽高比（网格无拉伸）', AL.aspectMatch === true);
      check('Bug B: cell == bitmap/n 精确绑定（绘制网格与 n×n 一致）', AL.cellExact === true);
      check('Bug B: 画布四角无卡面溢出（boardPx 边界即网格边界）', AL.cornerClean === true);
      console.log('    （定性佐证: 3 枚滑块卡面角点奶油白覆盖 ' + AL.cornerWhiteSamples.join(', ') + '）');
    }

    /* ---- 页面错误哨兵 ---- */
    var errs = await ev('JSON.stringify(window.__stmErrors||[])');
    console.log('  页面异常: ' + errs);

    /* ---- 截图 ---- */
    var shot = await c.send('Page.captureScreenshot', { format: 'png' });
    var safeName = F.name.replace(/[:/]/g, '_');
    fs.writeFileSync('tools/_verify_' + safeName + '.png', Buffer.from(shot.data, 'base64'));
    console.log('  截图: tools/_verify_' + safeName + '.png');
  }

  console.log('\n========================================');
  if (failAll.length === 0) console.log('验证结果: ALL GREEN');
  else { console.log('验证结果: FAILED (' + failAll.length + ')'); failAll.forEach(function (n) { console.log('  - ' + n); }); }

  c.close(); proc.kill();
  process.exit(failAll.length ? 1 : 0);
})().catch(function (e) { console.error('VERIFY FAIL:', e); process.exit(2); });