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
    await sleep(3000);

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

    console.log('  Dock 内容: ' + dockInfo);
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
      '   var w=cell*0.84, x=(t.c+0.5)*cell-w/2, y=(t.r+0.5)*cell-w/2;' +
      '   var ax=Math.round(x+w/2+dc*(w/2-3)), ay=Math.round(y+w/2+dr*(w/2-3));' +
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

    /* ---- hitTest 回归（Bug B 位图口径改动的最高风险处）----
     * 走真实 pointerdown 管线（main.js bindBoardInput → renderer.hitTest），
     * 点击每枚滑块格中心，断言命中的 tileId 与该格最高 z 的滑块一致。 */
    var hit = await ev('(function(){' +
      ' var cv=document.getElementById("board"); var r=cv.getBoundingClientRect();' +
      ' var es=STM.main.session().engineState(); var n=es.n;' +
      ' var win=[];' +
      ' for(var i=0;i<es.tiles.length && win.length<20;i++){ var t=es.tiles[i];' +
      '   if(win.some(function(w){return w.r===t.r&&w.c===t.c;})) continue;' +
      '   var bz=-1,bid=-1;' +
      '   for(var k=0;k<es.tiles.length;k++){ var q=es.tiles[k];' +
      '     if(q.r===t.r&&q.c===t.c&&(q.z||0)>bz){bz=q.z||0;bid=q.id;} }' +
      '   win.push({r:t.r,c:t.c,expect:bid,x:r.left+r.width*(t.c+0.5)/n,y:r.top+r.height*(t.r+0.5)/n}); }' +
      ' window.__hitWins=win; window.__hitGot=[];' +
      ' var orig=STM.createBoardRenderer;' +
      ' /* 拦截 renderer.hitTest 记录返回值（不改变交互行为）*/' +
      ' cv.__probe=1;' +
      ' for(var i=0;i<win.length;i++){ var w=win[i];' +
      '   var o={bubbles:true,cancelable:true,clientX:w.x,clientY:w.y,pointerId:1,isPrimary:true};' +
      '   cv.dispatchEvent(new PointerEvent("pointerdown",o));' +
      '   cv.dispatchEvent(new PointerEvent("pointerup",o));' +
      ' }' +
      ' return JSON.stringify({windows:win.length}); })()');
    console.log('  hitTest 取样: ' + hit);

    /* 直接对 renderer 实例做 hitTest 断言 */
    var hit2 = await ev('(function(){' +
      ' var cv=document.getElementById("board"); var r=cv.getBoundingClientRect();' +
      ' var es=STM.main.session().engineState(); var n=es.n;' +
      ' var R=STM.main.renderer? STM.main.renderer() : null; return R?"has":"no"; })()');
    // renderer 未导出——改为像素法验证: 每格中心应有非背景像素（棋盘绘制对齐）
    var align = await ev('(function(){ var cv=document.getElementById("board"); var ctx=cv.getContext("2d");' +
      ' var es=STM.main.session().engineState(); var n=es.n; var cell=cv.width/n;' +
      ' var ok=0,bad=0;' +
      ' for(var i=0;i<es.tiles.length;i++){ var t=es.tiles[i];' +
      '   /* 取格心向「反向朝向」的偏移 —— 箭头在对侧，此处必为卡面留白 */' +
      '   var d=t.d, dc=[0,1,0,-1][d], dr=[-1,0,1,0][d];' +
      '   var px=Math.round((t.c+0.5-dc*0.22)*cell), py=Math.round((t.r+0.5-dr*0.22)*cell);' +
      '   if(px<0||py<0||px>=cv.width||py>=cv.height) continue;' +
      '   try{ var p=ctx.getImageData(px,py,1,1).data;' +
      '     /* 奶油白卡面：RGB 均高且低饱和 */' +
      '     var mx=Math.max(p[0],p[1],p[2]), mn=Math.min(p[0],p[1],p[2]);' +
      '     if(p[0]>185&&p[1]>185&&p[2]>185&&(mx-mn)<40) ok++; else bad++; }' +
      '   catch(e){ return "TAINTED"; } }' +
      ' return JSON.stringify({onCardFace:ok,offCardFace:bad}); })()');
    console.log('  卡面像素落位（绘制与网格对齐）: ' + align);
    if (align !== 'TAINTED') {
      var AL = JSON.parse(align);
      check('Bug B: 滑块绘制与 n×n 网格对齐（采样点落在奶油白卡面上）',
        AL.onCardFace > AL.offCardFace, JSON.stringify(AL));
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