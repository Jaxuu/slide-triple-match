/* =========================================================
 * Slide & Triple — Glide Critters 主大厅（Δ16e / T068 / FR-039；
 * Δ17 视觉载体 100% 原创重制）
 * classic script；向 window.STM 挂载 STM.Lobby（D-01；禁 import/export 语法）
 *
 * 上中下六区分区布局 100% 保留（Δ17 仅换视觉皮肤，位置与功能语义不变）:
 *   顶部左  设置⚙️ / 调试面板🛠（与局内共用同一开关状态）
 *   顶部右  棱晶 货币栏（余额实时反映 profile v2）
 *   中上    `Glide Critters` 原创 3D 浮雕徽标（风翼 + 星芒 + 萌宠探头）
 *   中心    【棱晶星盘 / 时空传送门】← Δ17 替代原「2×2 拼图相框」
 *   中下    翠绿胶囊大按钮，文案严格 `关卡 X`（MUST NOT 带「开始」二字）
 *   左下    玩家圆形头像 + 昵称角标
 *
 * Δ17 原创性红线（Edge Cases「外围 UI 竞品视觉元素清零红线」）:
 *   MUST NOT 出现浅蓝竖条纹木墙 / 室内盆栽 / 木桌 / 风景木质相框 /
 *   天蓝丝带横幅 / 金色庆典号角 / 天蓝圆弧顶盖（含任何变体形态）。
 *
 * 铁律:
 *   ① 大厅背景优先 assets/bg/lobby_bg.png|jpg|jpeg|webp；缺失/onerror
 *      MUST 降级为原创「3D 卡通云端浮空岛与发光棱晶簇」Canvas 插画
 *      （宪章 III 双兜底——空 assets 形态 MUST 完整可玩，SC-006）
 *   ② 纯导航层：MUST NOT 触碰 RulesEngine 判定语义与关卡数据（FR-032）
 *   ③ 晶片切片复用 STM.Backdrops 会话级 Image 缓存（FR-035 §6——
 *      MUST NOT 新建 Image、零额外网络/解码开销）
 *   ④ 未点亮晶片 = 半透明紫晶盲盒态，MUST NOT 泄漏未解锁画面内容
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* ---------- 常量 ---------- */
  var LOBBY_EXT = ['png', 'jpg', 'jpeg', 'webp']; /* 大厅背景扩展序探测 */
  var STAR_TICK_MS = 120;   /* 星盘辉光呼吸节拍 */
  var BUDGET_LETTERS = 24;  /* 预算提示（实现期自检用） */

  /* 七彩切面棱晶 SVG —— 图标本体见 src/ui/prism-icon.js（单一来源，
   * 局内顶栏 / 道具角标 / 大厅货币栏共用；本文件不得再持有私有副本） */
  function gemSvg(cls) {
    return STM.PrismIcon ? STM.PrismIcon.html(cls || 'lobby-gem') : '';
  }

  /* ---------- 运行时状态 ---------- */
  var root = null;          /* #lobby 根节点 */
  var bgCanvas = null;      /* 大厅背景画布（贴图或程序化兜底） */
  var bgCtx = null;
  var chipCanvases = [];    /* 星盘 4 块晶片 canvas（已绘制的缓存层） */
  var el = {};              /* DOM 缓存 */
  var bgRec = { state: 'idle', img: null, ext: null }; /* 大厅背景探测态 */
  var rafId = 0;
  var visible = false;      /* 大厅是否处于显示态（后台 rAF 自动停） */
  var t0 = 0;               /* 进入大厅时刻（辉光呼吸相位） */

  /* 当前浏览的画卷索引（Δ17 新增左右切换语义：0-based） */
  var browsingIdx = 0;

  /* ---------- DOM 构建 ---------- */
  function h(tag, cls, parent) {
    var d = global.document;
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function ensureRoot() {
    var d = global.document;
    if (root && root.parentNode) return root;
    root = d.getElementById('lobby');
    if (!root) {
      root = d.createElement('div');
      root.id = 'lobby';
      root.hidden = true;
      /* 运行时兜底创建（静态 HTML 骨架优先——缺失时不报错） */
      var app = d.getElementById('app');
      if (app) app.appendChild(root);
      else d.body.appendChild(root);
    }
    cacheEls();
    return root;
  }

  function cacheEls() {
    el.bgCanvas = root.querySelector('.lobby-bg');
    el.btnSettings = root.querySelector('.lobby-btn-settings');
    el.btnDebug = root.querySelector('.lobby-btn-debug');
    el.shardsValue = root.querySelector('.lobby-shards-value');
    el.portalName = root.querySelector('.portal-plaque-name');
    el.portalProg = root.querySelector('.portal-plaque-prog');
    el.btnPrev = root.querySelector('.portal-nav-prev');
    el.btnNext = root.querySelector('.portal-nav-next');
    el.btnLevel = root.querySelector('.lobby-btn-level');
    el.btnLevelText = root.querySelector('.lobby-btn-level-text');
    el.btnAvatar = root.querySelector('.lobby-avatar');
    el.nick = root.querySelector('.lobby-nick');
    el.brandPet = root.querySelector('.lobby-brand-pet');
    el.chips = Array.prototype.slice.call(root.querySelectorAll('.portal-chip'));
    chipCanvases = [];
    for (var i = 0; i < el.chips.length; i++) {
      chipCanvases.push(el.chips[i].querySelector('canvas'));
    }
  }
  /* ---------- 六区骨架构建（FR-039 §2~§7 上中下分区布局 100% 保留） ----------
   * 骨架只构建一次（built 门禁）——否则 innerHTML 重写会丢失已绑定的事件
   * 监听器（绑定仅做一次，见 bindEvents）。 */
  var built = false;
  function buildSkeleton() {
    var d = global.document;
    var r = ensureRoot();
    if (built && root.children.length) return r;
    r.innerHTML = '';

    /* ① 背景层（Canvas——贴图或程序化兜底） */
    bgCanvas = h('canvas', 'lobby-bg', r);

    /* ② 顶部左区: 设置 + 调试面板开关 */
    var topL = h('div', 'lobby-zone lobby-zone-topleft', r);
    var bSettings = h('button', 'lobby-round-btn lobby-btn-settings', topL);
    bSettings.type = 'button';
    bSettings.setAttribute('aria-label', '设置');
    bSettings.textContent = '⚙️';

    /* ③ 顶部右区: 棱晶货币栏（深色磨砂胶囊 + 七彩切面棱晶 SVG） */
    var topR = h('div', 'lobby-zone lobby-zone-topright', r);
    var shardBar = h('div', 'lobby-shards', topR);
    shardBar.setAttribute('aria-label', '棱晶余额');
    var gemWrap = h('span', 'lobby-shards-icon', shardBar);
    gemWrap.innerHTML = gemSvg('lobby-gem');
    h('span', 'lobby-shards-value', shardBar).textContent = '0';

    /* ④ 中上区: Glide Critters 原创 3D 浮雕徽标
     *    Δ20 Bug 3：改为**上下双行居中紧凑叠排**（上行 GLIDE 大字 /
     *    下行 CRITTERS 稍小），纯白→暖奶油黄立体渐变字 + 天蓝/深海蓝厚描边；
     *    删除两侧白色扁三角风翼与 Critters 的绿色胶囊外框；
     *    玩家萌宠头像停靠在标题正上方并随呼吸浮动。 */
    var midT = h('div', 'lobby-zone lobby-zone-midtop', r);
    var brand = h('div', 'lobby-brand', midT);
    /* 棱镜星芒（徽标背后的方向星芒装饰） */
    h('span', 'lobby-brand-burst', brand).setAttribute('aria-hidden', 'true');
    /* 玩家萌宠从标题上方探出（呼吸浮动） */
    var pet = h('span', 'lobby-brand-pet', brand);
    pet.setAttribute('aria-hidden', 'true');
    /* 双行字标容器（文案 = "Glide Critters"） */
    var nameWrap = h('span', 'lobby-brand-name', brand);
    var rowTop = h('span', 'lobby-brand-row lobby-brand-row-top', nameWrap);
    var wordGlide = h('i', 'lobby-brand-glide', rowTop);
    wordGlide.textContent = 'Glide';
    /* 词间空格（纯空白文本节点——flex 布局忽略其渲染，但保持整体文案
     * = "Glide Critters"，与 Δ18 徽标文案口径一致） */
    nameWrap.appendChild(d.createTextNode(' '));
    var rowBottom = h('span', 'lobby-brand-row lobby-brand-row-bottom', nameWrap);
    var wordCritters = h('i', 'lobby-brand-critters', rowBottom);
    wordCritters.textContent = 'Critters';

    /* ⑤ 中心区: 【棱晶星盘 / 时空传送门】(Δ17) —— 齿轮+风翼纹饰底座
     *    + 2×2 能量晶片 + 顶部悬浮胶囊铭牌 + 左右切换 */
    var center = h('div', 'lobby-zone lobby-zone-center', r);
    var portal = h('div', 'portal', center);
    var plaque = h('div', 'portal-plaque', portal);
    h('span', 'portal-plaque-name', plaque).textContent = '';
    h('span', 'portal-plaque-prog', plaque).textContent = '0/4';
    var ring = h('div', 'portal-ring', portal);
    ring.setAttribute('aria-hidden', 'true');
    /* Δ20 Bug 3：删除外围 8 块「创可贴」式棕色长方体凸起（.portal-gear）——
     * 改为冰晶奶油白圆角画板 + 内嵌棱晶描边；机械齿轮刻纹语义由
     * .portal-ring 的内描边 + 角部棱晶装饰承载（FR-039 §5.1 结构不变）。 */
    var wings = h('div', 'portal-wings', ring);
    h('i', 'portal-wing portal-wing-l', wings);
    h('i', 'portal-wing portal-wing-r', wings);
    /* 2×2 能量晶片（象限 0=左上 1=右上 2=左下 3=右下） */
    var grid = h('div', 'portal-grid', portal);
    for (var q = 0; q < 4; q++) {
      var chip = h('div', 'portal-chip portal-chip-' + q, grid);
      chip.setAttribute('data-quad', String(q));
      h('canvas', 'portal-chip-cv', chip);
      var lock = h('span', 'portal-chip-lock', chip);   /* 紫晶盲盒态标记 */
      lock.textContent = '🔒';
      var cap = h('span', 'portal-chip-caption', chip); /* 解锁关卡标注 */
      cap.textContent = '';
      var shine = h('span', 'portal-chip-shine', chip); /* 已点亮色散边缘 */
      shine.setAttribute('aria-hidden', 'true');
    }
    var nav = h('div', 'portal-nav', portal);
    var bPrev = h('button', 'portal-nav-btn portal-nav-prev', nav);
    bPrev.type = 'button';
    bPrev.setAttribute('aria-label', '上一片大陆');
    bPrev.textContent = '‹';
    var bNext = h('button', 'portal-nav-btn portal-nav-next', nav);
    bNext.type = 'button';
    bNext.setAttribute('aria-label', '下一片大陆');
    bNext.textContent = '›';

    /* ⑥ 中下区: 翠绿胶囊大按钮（文案严格 `关卡 X`） */
    var midB = h('div', 'lobby-zone lobby-zone-midbottom', r);
    var bLevel = h('button', 'lobby-btn-level', midB);
    bLevel.type = 'button';
    h('span', 'lobby-btn-level-text', bLevel).textContent = '关卡 1';

    /* ⑦ 左下角: 玩家圆形头像 + 昵称角标 */
    var botL = h('div', 'lobby-zone lobby-zone-bottomleft', r);
    var bAvatar = h('button', 'lobby-avatar', botL);
    bAvatar.type = 'button';
    bAvatar.setAttribute('aria-label', '个人信息');
    h('span', 'lobby-avatar-img', bAvatar);
    var nickTag = h('span', 'lobby-nick', botL);
    nickTag.textContent = '';

    cacheEls();
    built = true;
    return r;
  }

  /* ---------- 大厅背景（Δ17 §3） ----------
   * 优先 assets/bg/lobby_bg.png|jpg|jpeg|webp（3D 卡通浮空岛营地贴图）；
   * 缺失/onerror MUST 降级为原创「3D 卡通云端浮空岛与发光棱晶簇」Canvas
   * 程序化插画。铁律：MUST NOT 使用室内场景设定（无木墙/盆栽/木桌），
   * MUST NOT 复用局内棋盘背景贴图（与 6 幅画卷区分）。 */
  function probeLobbyBg() {
    if (bgRec.state !== 'idle') return bgRec;
    bgRec.state = 'loading';
    if (typeof global.Image !== 'function') { bgRec.state = 'failed'; return bgRec; }
    var seq = 0;
    function tryNext() {
      if (seq >= LOBBY_EXT.length) { bgRec.state = 'failed'; return; }
      var ext = LOBBY_EXT[seq++];
      var img = new global.Image();
      img.onload = function () {
        bgRec.state = 'ready'; bgRec.img = img; bgRec.ext = ext;
        paintBackground(); /* 惰性换装——先程序化铺底，不闪烁 */
      };
      img.onerror = tryNext; /* 扩展序逐个探测 */
      img.src = 'assets/bg/lobby_bg.' + ext;
    }
    tryNext();
    return bgRec;
  }

  function sizeBg() {
    if (!bgCanvas) return;
    var w = Math.max(1, Math.round((root.clientWidth || 360) * dpr()));
    var hh = Math.max(1, Math.round((root.clientHeight || 640) * dpr()));
    if (bgCanvas.width !== w || bgCanvas.height !== hh) {
      bgCanvas.width = w; bgCanvas.height = hh;
    }
    bgCtx = bgCanvas.getContext ? bgCanvas.getContext('2d') : null;
  }

  /* 布局就绪后重排背景并重绘——show() 当帧的 clientWidth 可能仍为 0
   * （CSS 尚未完成布局），必须在下一帧补一次，否则画布停留在 300x150
   * 默认尺寸且无可视绘制。 */
  function repaintAfterLayout() {
    var go = function () {
      if (!visible) return;
      sizeBg();
      paintBackground();
      /* 晶片切片同样依赖 chip 的 clientWidth → 一并重绘 */
      renderChips();
      /* 头像 canvas 依赖布局盒 → 布局就绪后补绘（Δ17 file:// 兜底） */
      renderTopBar();
    };
    if (global.requestAnimationFrame) global.requestAnimationFrame(go);
    else global.setTimeout(go, 16);
  }

  function dpr() { return Math.max(1, global.devicePixelRatio || 1); }

  /* 原创兜底插画：3D 卡通云端浮空岛 + 发光棱晶簇（分层云海 / 悬浮岛
   * 轮廓 / 岛缘垂落藤蔓 / 岛面棱晶簇）。纯程序化，零外部资源。 */
  function drawCloudIslands(ctx, W, H) {
    /* 天空渐变（黄昏→高空蓝紫，营造奇幻氛围） */
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1B2A5E');
    sky.addColorStop(0.42, '#3C5BA0');
    sky.addColorStop(0.72, '#7FA6D8');
    sky.addColorStop(1, '#BFD9EE');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* 远景暖光（黄昏日轮） */
    var sunG = ctx.createRadialGradient(W * 0.74, H * 0.26, 0, W * 0.74, H * 0.26, W * 0.42);
    sunG.addColorStop(0, 'rgba(255,214,140,0.55)');
    sunG.addColorStop(0.45, 'rgba(255,186,120,0.20)');
    sunG.addColorStop(1, 'rgba(255,186,120,0)');
    ctx.fillStyle = sunG;
    ctx.fillRect(0, 0, W, H);

    /* 分层云海（3 层，越远越淡越高） */
    var layers = [
      { y: 0.60, h: 0.13, col: 'rgba(255,255,255,0.20)', n: 5, s: 1.00 },
      { y: 0.72, h: 0.16, col: 'rgba(255,255,255,0.32)', n: 6, s: 1.25 },
      { y: 0.86, h: 0.20, col: 'rgba(255,255,255,0.46)', n: 7, s: 1.55 }
    ];
    for (var li = 0; li < layers.length; li++) {
      var L = layers[li];
      ctx.fillStyle = L.col;
      var baseY = H * L.y;
      for (var k = 0; k < L.n; k++) {
        /* 确定性分布（无 Math.random——渲染幂等，selftest 可复现） */
        var fx = ((k + 1) / (L.n + 1)) + (li * 0.07 % 0.18) - 0.09;
        var cx = fx * W;
        var cy = baseY + (k % 2 ? L.h * W * 0.18 : 0);
        var cw = W * 0.30 * L.s;
        var chh = cw * 0.30;
        /* 云朵 = 三个交叠圆 + 底边圆角矩形 */
        ctx.beginPath();
        ctx.arc(cx - cw * 0.22, cy, chh * 0.72, 0, Math.PI * 2);
        ctx.arc(cx, cy - chh * 0.18, chh * 0.92, 0, Math.PI * 2);
        ctx.arc(cx + cw * 0.24, cy, chh * 0.66, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - cw * 0.46, cy, cw * 0.92, chh * 0.62);
      }
    }

    /* 悬浮岛（2 座：主岛居中偏左 + 远景小岛） */
    drawFloatingIsland(ctx, W * 0.30, H * 0.60, W * 0.30, true);
    drawFloatingIsland(ctx, W * 0.82, H * 0.44, W * 0.14, false);
  }

  /* 单座 3D 卡通浮空岛：草顶椭圆 + 悬垂岩体锥 + 岛缘藤蔓 + 发光棱晶簇 */
  function drawFloatingIsland(ctx, cx, cy, size, withPet) {
    var rx = size, ry = size * 0.34;

    /* 岩体（向下收窄的锥，构成「悬浮」感） */
    var rock = ctx.createLinearGradient(0, cy, 0, cy + size * 1.5);
    rock.addColorStop(0, '#8A6B52');
    rock.addColorStop(0.5, '#6B5040');
    rock.addColorStop(1, '#4A3628');
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy);
    ctx.quadraticCurveTo(cx - rx * 0.42, cy + size * 1.05, cx, cy + size * 1.42);
    ctx.quadraticCurveTo(cx + rx * 0.42, cy + size * 1.05, cx + rx, cy);
    ctx.closePath();
    ctx.fill();

    /* 草顶椭圆 */
    var grass = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    grass.addColorStop(0, '#8FD98A');
    grass.addColorStop(0.5, '#6FC46B');
    grass.addColorStop(1, '#4EA35A');
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    /* 草顶高光（3D 立体感） */
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.22, cy - ry * 0.28, rx * 0.52, ry * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    /* 岛缘垂落藤蔓（原创有机曲线，2~3 条） */
    ctx.strokeStyle = '#4E8F52';
    ctx.lineWidth = Math.max(1.5, size * 0.035);
    ctx.lineCap = 'round';
    for (var v = 0; v < 3; v++) {
      var vx = cx + (v - 1) * rx * 0.46;
      ctx.beginPath();
      ctx.moveTo(vx, cy + ry * 0.55);
      ctx.quadraticCurveTo(vx + (v - 1) * size * 0.10, cy + size * 0.62, vx + (v - 1) * size * 0.05, cy + size * 0.92);
      ctx.stroke();
    }

    /* 发光棱晶簇（岛面，彩虹折射 + 外发光） */
    drawPrismCluster(ctx, cx + rx * 0.18, cy - ry * 0.35, size * 0.30);
    drawPrismCluster(ctx, cx - rx * 0.34, cy - ry * 0.12, size * 0.18);

    /* 主岛加一座小风翼图腾（呼应徽标母题） */
    if (withPet) {
      ctx.strokeStyle = 'rgba(255,255,255,0.80)';
      ctx.lineWidth = Math.max(2, size * 0.045);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.10, cy - ry * 0.85);
      ctx.quadraticCurveTo(cx - size * 0.42, cy - ry * 1.55, cx - size * 0.02, cy - ry * 1.30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + size * 0.10, cy - ry * 0.85);
      ctx.quadraticCurveTo(cx + size * 0.42, cy - ry * 1.55, cx + size * 0.02, cy - ry * 1.30);
      ctx.stroke();
    }
  }

  /* 七彩折射棱晶簇：三角棱面 + 虹彩填充 + 外发光 */
  function drawPrismCluster(ctx, cx, cy, s) {
    var hues = ['#FF6B9D', '#FFC53D', '#7AE582', '#4CC8F5', '#A78BFA', '#FF9F45'];
    for (var i = 0; i < 3; i++) {
      var ang = -Math.PI / 2 + (i - 1) * 0.42;
      var hgt = s * (1 - Math.abs(i - 1) * 0.28);
      var bx = cx + Math.cos(ang) * s * 0.42;
      var by = cy + Math.sin(ang) * s * 0.16;
      var tipX = bx + Math.cos(ang) * hgt * 0.30;
      var tipY = by - hgt;
      var col = hues[(i * 2 + 1) % hues.length];

      /* 外发光 */
      ctx.fillStyle = col + '33';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bx + s * 0.26, by + s * 0.14);
      ctx.closePath();
      ctx.fill();

      /* 棱面主体 */
      var g = ctx.createLinearGradient(bx, by, tipX, tipY);
      g.addColorStop(0, col);
      g.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx - s * 0.18, by);
      ctx.lineTo(bx, by - hgt);
      ctx.lineTo(bx + s * 0.18, by);
      ctx.closePath();
      ctx.fill();
      /* 棱面暗侧（3D 感） */
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(bx, by - hgt);
      ctx.lineTo(bx + s * 0.18, by);
      ctx.lineTo(bx + s * 0.02, by);
      ctx.closePath();
      ctx.fill();
    }
  }

  function paintBackground() {
    if (!bgCtx) { sizeBg(); if (!bgCtx) return; }
    var W = bgCanvas.width, H = bgCanvas.height;
    var rec = probeLobbyBg();
    if (rec.state === 'ready' && rec.img) {
      try {
        var iw = rec.img.naturalWidth || rec.img.width;
        var ih = rec.img.naturalHeight || rec.img.height;
        if (iw > 0 && ih > 0) {
          /* cover 铺满（短边铺满 + 居中裁切） */
          var scale = Math.max(W / iw, H / ih);
          bgCtx.drawImage(rec.img, (W - iw * scale) / 2, (H - ih * scale) / 2, iw * scale, ih * scale);
          return;
        }
      } catch (errB) { rec.state = 'failed'; } /* 绘制异常 → 兜底 */
    }
    /* 兜底：原创云端浮空岛插画（空 assets 形态 MUST 完整可玩） */
    drawCloudIslands(bgCtx, W, H);
  }

  /* ---------- 棱晶星盘 / 时空传送门（Δ17 FR-039 §5） ----------
   * 2×2 能量晶片：每通关 1 个困难位关点亮 1 块（进度 X/4）。
   *   · 已点亮 → 折射显示对应奇幻大陆高清图景（bg{n} 2×2 四象限切片，
   *     与局内背景同源同文件同缓存链——FR-035 §6，零额外加载）
   *   · 未点亮 → 半透明紫晶盲盒态 + 标注解锁关卡（不泄漏画面内容）
   * 顶部悬浮胶囊铭牌显示当前浏览的大陆名称与充能进度；
   * 左右切换在**已唤醒的大陆**之间循环浏览。 */
  function drawChip(cv, paintingIdx, quad, lit) {
    if (!cv || !cv.getContext) return;
    var d = cv.ownerDocument || global.document;
    var cssW = cv.parentNode ? cv.parentNode.clientWidth : 0;
    var cssH = cv.parentNode ? cv.parentNode.clientHeight : 0;
    if (!(cssW > 0) || !(cssH > 0)) return; /* 布局未就绪 → 跳过本帧 */
    var w = Math.round(cssW * dpr()), hh = Math.round(cssH * dpr());
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, hh);

    if (lit) {
      /* 已点亮：贴图切片（drawQuadrant 内部已做 cover 裁切） */
      var drew = false;
      try {
        drew = STM.Backdrops.drawQuadrant(ctx, paintingIdx, quad, 0, 0, w, hh);
      } catch (errQ) { drew = false; }
      if (drew) {
        /* 棱镜色散边缘（虹彩内描边）——原创折射质感 */
        var eg = ctx.createLinearGradient(0, 0, w, hh);
        eg.addColorStop(0, 'rgba(255,120,190,0.55)');
        eg.addColorStop(0.5, 'rgba(255,210,90,0.28)');
        eg.addColorStop(1, 'rgba(120,200,255,0.55)');
        ctx.strokeStyle = eg;
        ctx.lineWidth = Math.max(2, w * 0.035);
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, hh - ctx.lineWidth);
        return;
      }
    }

    /* 未点亮 = 浅冰蓝半透明盲盒态（Δ20 Bug 3：去掉斜叉线，仅保留
     * 干净的浅冰蓝底 + 居中精致锁图标位 + 下方文字标注——不泄漏图景） */
    var bgGrad = ctx.createRadialGradient(w * 0.5, hh * 0.38, 0, w * 0.5, hh * 0.5, w * 0.78);
    bgGrad.addColorStop(0, 'rgba(214, 238, 252, 0.72)');
    bgGrad.addColorStop(0.55, 'rgba(186, 220, 244, 0.62)');
    bgGrad.addColorStop(1, 'rgba(150, 192, 226, 0.68)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, hh);

    /* 柔和内高光（冰晶质感——替代原斜叉折线） */
    var hl = ctx.createLinearGradient(0, 0, 0, hh);
    hl.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    hl.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, 0, w, hh);
  }

  /* ---------- 有效已通关进度（Δ20 Bug 1） ----------
   * 权威源 = 关卡进度，而非仅 profile 的 paintingProgress：
   *   maxPassed = max(unlocked-1, currentLevel-1, ...clearedLevels)
   * 大厅持有这些上下文，由 main.js 在 show()/refresh() 时注入。 */
  var progressCtx = { unlocked: 1, currentLevel: 1, clearedLevels: [] };

  /* 合并式更新进度上下文——仅覆盖**显式提供**的字段，
   * 避免部分刷新（如 refresh({unlocked:7})）把已知的
   * currentLevel / clearedLevels 抹成默认值。 */
  function setProgressCtx(ctx) {
    if (!ctx) return;
    progressCtx = {
      unlocked: ctx.unlocked != null ? ctx.unlocked : progressCtx.unlocked,
      currentLevel: ctx.currentLevel != null ? ctx.currentLevel : progressCtx.currentLevel,
      clearedLevels: ctx.clearedLevels != null ? ctx.clearedLevels : progressCtx.clearedLevels
    };
  }

  /* 计算某画卷的已点亮晶片数与下一块的解锁关卡 */
  function paintingState(paintingIdx) {
    var P = STM.Profile;
    /* 内部一律 1-based（与 PAINTING_NAMES / PAINTING_RANGES 对齐）；
     * 0 或越界 MUST 钳回 1，否则 PP[idx-1] = undefined → 下游 [0] 抛错 */
    var idx = Math.min(6, Math.max(1, paintingIdx | 0 || 1));
    var range = (P && P.PAINTING_RANGES && P.PAINTING_RANGES[idx - 1]) || [1, 12];
    /* Δ20 Bug 1：点亮态以**关卡进度反推**为准（不再是 paintingProgress 单源）——
     * 跳关 / 深链 / 老存档下 paintingProgress 与关卡进度会发散，
     * 故凡充能关卡 <= maxPassed（或已通关集合含之）即判定为已点亮。 */
    var prog = 0, flags = null;
    if (P && P.pieceUnlockFlags) {
      var un = P.pieceUnlockFlags(idx, progressCtx);
      flags = un.flags;
      prog = un.litCount;
    } else {
      var pp = P ? (P.get().paintingProgress || []) : [];
      prog = pp[idx - 1] || 0;
    }
    return { progress: prog, range: range, index: idx, flags: flags };
  }

  /* 第 q 块晶片的充能关卡（逐块独立——各晶片标注自己的充能关卡）。
   * 困难位关 = 每第 3 关（L3/L6/L9/L12…）→ 第 q 块 = range[0] + 2 + 3*q
   * 例：第 1 大陆 → L3 / L6 / L9 / L12 */
  function chargeLevelOf(st, quad) {
    return st.range[0] + 2 + 3 * quad;
  }

  /* 可翻阅的大陆索引列表——Δ18: 全部 6 大奇幻大陆均可翻阅
   * （旧口径为「仅已唤醒的大陆」，本轮按最新需求放开为全量 6 大陆） */
  function browsableList() {
    return [1, 2, 3, 4, 5, 6];
  }

  function renderChips() {
    var st = paintingState(browsingIdx);
    for (var q = 0; q < el.chips.length; q++) {
      var chip = el.chips[q];
      /* Δ20 Bug 1：逐块独立判定（flags 优先），回退到象限顺序计数 */
      var lit = st.flags ? st.flags[q] : (q < st.progress);
      chip.classList.toggle('is-lit', lit);
      chip.classList.toggle('is-blind', !lit);
      /* 第 4 块（q === 3）= 满充能大奖位——额外挂 is-bonus 标记 */
      chip.classList.toggle('is-bonus', q === 3);
      drawChip(chipCanvases[q], browsingIdx, q, lit);
      var cap = chip.querySelector('.portal-chip-caption');
      if (cap) {
        /* 未点亮标注充能关卡；已点亮留空（不遮挡图景） */
        cap.innerHTML = lit ? '' : chipCaption(q, st);
      }
    }
    /* 顶部悬浮胶囊铭牌：大陆名称 + 充能进度 */
    var P = STM.Profile;
    var name = (P && P.PAINTING_NAMES) ? P.PAINTING_NAMES[browsingIdx - 1] : ('大陆 ' + browsingIdx);
    if (el.portalName) el.portalName.textContent = name;
    if (el.portalProg) el.portalProg.textContent = st.progress + '/4';

    /* 左右切换可用性：Δ18 起 6 大大陆恒可翻阅 → 箭头恒可用 */
    var list = browsableList();
    var canSwitch = list.length > 1;
    if (el.btnPrev) el.btnPrev.disabled = !canSwitch;
    if (el.btnNext) el.btnNext.disabled = !canSwitch;
  }

  /* 未点亮晶片的标注文案（逐块独立——各晶片标注自己的充能关卡）：
   *   · 第 q 块 → `第 X 关充能`（X = 点亮该块的困难位关卡号）
   *   · 第 4 块（q=3）→ 额外追加满充能大奖预览 `棱晶 ×150` */
  function chipCaption(quad, st) {
    var lv = chargeLevelOf(st, quad);
    if (quad === 3) return '第 ' + lv + ' 关充能 · ' + (STM.PrismIcon ? STM.PrismIcon.html('prism-gem-sm') : '') + ' ×150';
    return '第 ' + lv + ' 关充能';
  }

  /* 左右切换：在已唤醒大陆之间循环（Δ17 新增浏览语义） */
  function stepPainting(dir) {
    var list = browsableList();
    if (list.length <= 1) return;
    var pos = list.indexOf(browsingIdx);
    if (pos < 0) { browsingIdx = list[0]; renderChips(); return; }
    browsingIdx = list[(pos + dir + list.length) % list.length];
    renderChips();
  }

  /* 后续子函数：renderTopBar / renderLevelButton / bindEvents / show / hide
     / frame —— 分批增量补入 */
  /* ---------- 顶部区（棱晶余额 / 调试开关态） ---------- */
  /* 调试面板开关态由 main.js 持有（单一真源——与局内面板共用同一份状态，
   * Edge Case「调试面板与主大厅的层级冲突」铁律）；本模块只读 + 回抛意图。 */
  var debugOpenState = false;

  function renderTopBar() {
    var P = STM.Profile;
    if (!P) return;
    var prof = P.get();
    if (el.btnDebug) el.btnDebug.classList.toggle('is-on', debugOpenState);
    if (el.nick) el.nick.textContent = prof.nickname;
    /* 棱晶余额 + 数量弹跳动效（余额变化时触发一次——纯 CSS 动画，零 JS 计时器） */
    if (el.shardsValue) {
      var cur = String(prof.shards);
      el.shardsValue.textContent = cur;
      if (el.shardsValue.getAttribute('data-val') !== cur) {
        el.shardsValue.setAttribute('data-val', cur);
        el.shardsValue.classList.remove('is-bump');
        /* 强制重排以重启动画（改 class 不生效时用偏移量触发） */
        void el.shardsValue.offsetWidth;
        el.shardsValue.classList.add('is-bump');
      }
    }
    /* 徽标处萌宠探头（当前选中的 3D 萌宠切片——与头像按钮同源） */
    if (el.brandPet && STM.petAvatarHTML) {
      el.brandPet.innerHTML = STM.petAvatarHTML(prof.avatar);
      /* Δ17: file:// 下 toDataURL 不可用 → canvas 占位需补绘（否则空白） */
      if (STM.paintAvatarCanvases) STM.paintAvatarCanvases(el.brandPet);
    }
    if (el.btnAvatar) {
      var img = el.btnAvatar.querySelector('.lobby-avatar-img');
      /* 头像切片复用已加载的 sheet1~3（FR-040 §2）——与档案弹窗同源 */
      if (img && STM.petAvatarHTML) {
        img.innerHTML = STM.petAvatarHTML(prof.avatar);
        /* Δ17: file:// 下 toDataURL 不可用 → canvas 占位需补绘（否则空白） */
        if (STM.paintAvatarCanvases) STM.paintAvatarCanvases(img);
      }
      el.btnAvatar.setAttribute('title', prof.nickname);
    }
  }

  /* ---------- 中下区: `关卡 X`（文案严格，MUST NOT 带「开始」二字） ----------
   * X = 当前最新解锁关卡号（= 已通关最高关 + 1，上限 LEVELS.length）；
   * MUST NOT 跳到下一个困难位或下一片大陆起点（与充能节奏解耦）。 */
  function renderLevelButton(unlocked) {
    var total = (STM.LEVELS || []).length || 72;
    var x = Math.min(total, Math.max(1, unlocked || 1));
    if (el.btnLevelText) el.btnLevelText.textContent = '关卡 ' + x;
    if (el.btnLevel) el.btnLevel.setAttribute('data-level', String(x));
    return x;
  }

  /* ---------- 事件绑定（仅绑定一次） ----------
   * handlers 以闭包外的可变引用持有——首次 show() 可能早于 main.js 完成
   * 注入（开机动画路径），若把当时的 handlers 固化进监听器闭包，后续
   * onSettings 等回调将永久为空。故每次 show() 更新 latestHandlers，
   * 监听器统一读它。 */
  var bound = false;
  var latestHandlers = {};
  function bindEvents(handlers) {
    latestHandlers = handlers || {};
    if (bound) return;
    bound = true;
    if (el.btnSettings) el.btnSettings.addEventListener('click', function () {
      if (latestHandlers.onSettings) latestHandlers.onSettings();
    });
    /* 锤子扳手按钮已删除——仅保留设置按钮 */
    if (el.btnLevel) el.btnLevel.addEventListener('click', function () {
      var lv = parseInt(el.btnLevel.getAttribute('data-level'), 10) || 1;
      if (latestHandlers.onPlay) latestHandlers.onPlay(lv);
    });
    if (el.btnAvatar) el.btnAvatar.addEventListener('click', function () {
      if (latestHandlers.onProfile) latestHandlers.onProfile();
    });
    if (el.btnPrev) el.btnPrev.addEventListener('click', function () { stepPainting(-1); });
    if (el.btnNext) el.btnNext.addEventListener('click', function () { stepPainting(1); });
  }

  /* ---------- 显示 / 隐藏（Shell-Last：大厅与局内互斥，禁止叠加态） ---------- */
  function show(opts) {
    opts = opts || {};
    var r = ensureRoot();
    if (!buildSkeleton()) return false;
    /* 先解除 hidden 再做布局相关测量——sizeBg/paintBackground 依赖
     * clientWidth/Height；hidden 态下布局盒为 0，画布无从绘制。 */
    r.hidden = false;
    visible = true;
    /* Δ20 Bug 1：注入关卡进度上下文（unlocked / currentLevel / clearedLevels）
     * ——晶片点亮态据此反推，避免与 `关卡 X` 按钮脱节 */
    setProgressCtx({
      unlocked: opts.unlocked,
      currentLevel: opts.level,
      clearedLevels: opts.clearedLevels
    });
    /* 默认选中当前关归属的大陆（FR-044 §5）——Δ18 起左右可翻阅全部 6 大陆，
     * 默认落点仍为「当前所在关归属的大陆」 */
    var cur = paintingState(browsingIdx);
    if (cur.progress === 0) {
      var want = STM.Backdrops && STM.Backdrops.paintingOf ? STM.Backdrops.paintingOf(opts.level || 1) : 1;
      browsingIdx = Math.min(6, Math.max(1, want));
    }
    bindEvents(opts.handlers);
    if (typeof opts.debugOpen === 'boolean') debugOpenState = opts.debugOpen;
    renderTopBar();
    renderLevelButton(opts.unlocked);
    renderChips();
    sizeBg();
    paintBackground();
    /* 贴图惰性换装（bg{n} 就绪后重绘晶片，不闪烁） */
    if (STM.Backdrops && STM.Backdrops.onBgReady) {
      STM.Backdrops.onBgReady(function () { if (visible) renderChips(); });
    }
    t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    repaintAfterLayout(); /* CSS 布局完成后的首帧补绘（背景 + 晶片） */
    startLoop();
    return true;
  }

  function hide() {
    if (root) root.hidden = true;
    visible = false;
    if (rafId) { cancelAnimation(rafId); rafId = 0; }
  }

  function cancelAnimation(id) {
    if (global.cancelAnimationFrame) global.cancelAnimationFrame(id);
    else clearTimeout(id);
  }

  /* ---------- 帧循环：仅做低开销的晶片呼吸辉光（STAR_TICK 节流） ---------- */
  function startLoop() {
    if (rafId) return;
    var last = 0;
    function frame(now) {
      if (!visible) { rafId = 0; return; }
      rafId = (global.requestAnimationFrame) ? global.requestAnimationFrame(frame) : 0;
      if (!rafId) { /* 无 rAF 环境（selftest）：一次性收尾即可 */
        last = 0; return;
      }
      if (now - last < STAR_TICK_MS) return;
      last = now;
      /* 相位驱动的辉光强度（CSS 自定义属性——不逐帧重绘 Canvas） */
      var phase = ((now - t0) % 2400) / 2400;
      var glow = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
      if (root) root.style.setProperty('--portal-glow', glow.toFixed(3));
    }
    rafId = (global.requestAnimationFrame) ? global.requestAnimationFrame(frame) : 0;
  }

  /* ---------- 外部同步入口（结算后余额/进度变化时刷新大厅显示） ---------- */
  function refresh(opts) {
    if (!visible) return false;
    opts = opts || {};
    /* Δ20 Bug 1：进度变化时同步上下文，再重绘晶片 */
    setProgressCtx({
      unlocked: opts.unlocked,
      currentLevel: opts.level,
      clearedLevels: opts.clearedLevels
    });
    renderTopBar();
    if (opts.unlocked) renderLevelButton(opts.unlocked);
    renderChips();
    return true;
  }

  STM.Lobby = {
    show: show,
    hide: hide,
    refresh: refresh,
    isVisible: function () { return visible; },
    paintingState: paintingState,
    browsableList: browsableList,
    setProgressCtx: setProgressCtx
  };
})(typeof window !== 'undefined' ? window : globalThis);