/* =========================================================
 * Slide & Triple — 通关结算层与新奇幻大陆传送门开启展板
 *   （Δ16g / T072+T073 / FR-042；Δ17 视觉载体原创重制）
 * classic script；向 window.STM 挂载 STM.Result（D-01；禁 import/export 语法）
 *
 * Δ17【双风翼棱晶能量铭牌】（替代 Δ16 的「天蓝丝带横幅 + 金色庆典号角」）
 *   ① 风翼: 两侧纯白流线型滑行风翼（呼应大厅徽标母题）
 *   ② 棱晶簇: 风翼下方七彩折射棱晶簇，承托铭牌
 *   ③ 铭牌: 琥珀金渐变铭牌，居中承载 20 词库随机赞美词
 *   ④ 萌宠跃起: 当前 3D 萌宠头像乘发光微缩滑板在铭牌顶端欢快跃起
 *   ⑤ 粒子: 棱晶星芒与光点粒子（原创程序化，零外部资源）
 *
 * 原创性红线: MUST NOT 出现天蓝丝带横幅 / 金色庆典号角 / 礼花筒 /
 * 风景木质相框等竞品标志性载体（含任何变体形态）。
 *
 * 铁律:
 *   ① 结算层为**必经中间态**——MUST NOT 跳过直接回大厅（FR-042 §3）
 *   ② 随机仅限赞美词抽取；奖励金额 MUST NOT 依赖随机数（FR-041 §5）
 *   ③ 纯表现层: MUST NOT 改变关卡判定结果；奖励发放幂等
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* 20 个励志赞美词库（FR-042 §1.6）——随机仅限此处 */
  var PRAISE = [
    '运筹帷幄', '势如破竹', '妙手连珠', '行云流水', '洞若观火',
    '算无遗策', '一气呵成', '挥洒自如', '游刃有余', '水到渠成',
    '心想事成', '得心应手', '熟能生巧', '厚积薄发', '轻车熟路',
    '稳扎稳打', '一蹴而就', '无往不利', '如有神助', '技高一筹'
  ];

  var root = null;
  var rafId = 0;
  var visible = false;
  var petTimer = 0;

  function ensureRoot() {
    var d = global.document;
    if (root && root.parentNode) return root;
    root = d.getElementById('result-root');
    if (!root) {
      root = d.createElement('div');
      root.id = 'result-root';
      root.hidden = true;
      var app = d.getElementById('app');
      if (app) app.appendChild(root);
      else d.body.appendChild(root);
    }
    return root;
  }

  function h(tag, cls, parent, text) {
    var e = global.document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  /* 双风翼棱晶能量铭牌（Δ17 原创构图） */
  function buildNameplate(opts, parent) {
    var P = STM.Profile;
    var plate = h('div', 'nameplate');
    /* 必须挂进结算卡片——否则整块铭牌游离于 DOM 之外不可见 */
    if (parent) parent.appendChild(plate);

    /* ② 七彩折射棱晶簇（风翼下方承托） */
    var cluster = h('div', 'plate-cluster', plate);
    for (var c = 0; c < 7; c++) {
      var hue = ['#FF6B9D', '#FFC53D', '#7AE582', '#4CC8F5', '#A78BFA', '#FF9F45', '#F5F0E6'][c];
      var shard = h('i', 'plate-shard plate-shard-' + c, cluster);
      shard.style.background = 'linear-gradient(170deg, ' + hue + ', #FFFFFF)';
      shard.style.setProperty('--h', (hue));
    }

    /* ① 纯白流线型滑行风翼（两侧） */
    var wingL = h('i', 'plate-wing plate-wing-l', plate);
    wingL.setAttribute('aria-hidden', 'true');
    var wingR = h('i', 'plate-wing plate-wing-r', plate);
    wingR.setAttribute('aria-hidden', 'true');

    /* ③ 琥珀金渐变铭牌 + 20 词库随机赞美词 */
    var bar = h('div', 'plate-bar', plate);
    /* 随机仅限赞美词；不影响任何奖励金额（FR-041 §5 确定性铁律） */
    var praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    h('span', 'plate-praise', bar, praise);

    /* ④ 萌宠乘发光微缩滑板跃起 */
    if (P && STM.petAvatarHTML) {
      var rider = h('div', 'plate-rider', plate);
      var board = h('i', 'plate-board', rider);
      board.setAttribute('aria-hidden', 'true');
      var pet = h('span', 'plate-pet', rider);
      pet.innerHTML = STM.petAvatarHTML(P.get().avatar);
      /* Δ17: file:// 下 canvas 占位需补绘（否则铭牌萌宠空白） */
      if (STM.paintAvatarCanvases) STM.paintAvatarCanvases(pet);
    }
    return plate;
  }

  /* ---------- 通关结算层（FR-042 §1） ---------- */
  function show(opts) {
    opts = opts || {};
    var r = ensureRoot();
    r.innerHTML = '';
    r.hidden = false;
    visible = true;

    var card = h('div', 'result-card-celebrate', r);
    var homeBtn = h('button', 'result-home-btn', card, '\uD83C\uDFE0');
    homeBtn.type = 'button';
    homeBtn.setAttribute('aria-label', 'return lobby');
    homeBtn.addEventListener('click', function () {
      hide();
      if (opts.onHome) opts.onHome();
      else if (opts.onContinue) opts.onContinue();
    });

    /* ⑤ 棱晶星芒与光点粒子（原创程序化粒子层） */
    var spark = h('div', 'plate-sparks', card);
    for (var i = 0; i < 14; i++) {
      var s = h('i', 'spark spark-' + (i % 4), spark);
      s.style.setProperty('--dx', ((i * 37) % 100) + '%');
      s.style.setProperty('--dy', ((i * 53) % 100) + '%');
      s.style.animationDelay = ((i * 137) % 900) + 'ms';
    }

    buildNameplate(opts, card);

    /* 中部：棱晶星盘（2×2 能量晶片）+ 本次获得的棱晶飞入动效 */
    var mid = h('div', 'result-mid', card);
    var chips = h('div', 'result-chips', mid);
    var P = STM.Profile;
    var pi = P ? P.paintingIndexOfLevel(opts.level || 1) : 0;
    var st = P ? (P.get().paintingProgress[pi] || 0) : 0;
    /* 已点亮晶片显示对应大陆高清图景（与星盘同源同缓存链，FR-035 §6） */
    /* 布局就绪后（rAF 下一帧）绘制——当帧 clientWidth 仍为 0，
     * 直接绘制会退化为紫色兜底而非大陆切片 */
    var chipCanvases = [];
    for (var q = 0; q < 4; q++) {
      var cell = h('div', 'result-chip result-chip-' + q, chips);
      cell.setAttribute('data-quad', String(q));
      var ccv = h('canvas', 'result-chipcv', cell);
      chipCanvases.push(ccv);
      /* 未点亮象限 = 半透明紫晶盲盒态（仅棱晶微光 + 几何切面，
       * MUST NOT 泄漏未解锁画面内容——FR-044 §4） */
      if (q >= st) cell.classList.add('is-blind');
      /* 本次新点亮的象限 = 翻转点亮动画（困难位关） */
      if (opts.litChip && q === st - 1) cell.classList.add('just-lit');
    }
    var paintChip = function () {
      for (var i = 0; i < 4; i++) {
        var cv = chipCanvases[i];
        if (!cv || !cv.getContext) continue;
        var w = cv.clientWidth, hh = cv.clientHeight;
        if (!(w > 0) || !(hh > 0)) continue;
        var d = Math.max(1, global.devicePixelRatio || 1);
        cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
        var ctx = cv.getContext('2d');
        if (i < st) {
          /* 已点亮：对应大陆高清图景的 2×2 象限切片 */
          var drew = false;
          try { drew = STM.Backdrops.drawQuadrant(ctx, pi + 1, i, 0, 0, cv.width, cv.height); } catch (e) { drew = false; }
          if (!drew) {
            ctx.fillStyle = 'rgba(150,110,225,0.42)';
            ctx.fillRect(0, 0, cv.width, cv.height);
          }
        } else {
          /* 未点亮：紫晶盲盒态 */
          var bgGrad = ctx.createRadialGradient(cv.width * 0.5, cv.height * 0.38, 0, cv.width * 0.5, cv.height * 0.5, cv.width * 0.78);
          bgGrad.addColorStop(0, 'rgba(150,110,225,0.55)');
          bgGrad.addColorStop(0.55, 'rgba(108,76,190,0.42)');
          bgGrad.addColorStop(1, 'rgba(66,44,124,0.60)');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, cv.width, cv.height);
        }
      }
    };
    if (global.requestAnimationFrame) global.requestAnimationFrame(paintChip);
    else global.setTimeout(paintChip, 16);

    /* 棱晶飞入动效（本次获得金额 = 本关产出表实际值） */
    var gain = h('div', 'result-shards', mid);
    var fly = h('i', 'shard-fly', gain);
    fly.innerHTML = STM.PrismIcon ? STM.PrismIcon.html('prism-gem') : '';
    var amt = h('span', 'result-shard-amt', gain, '+' + (opts.shards || 0));
    amt.classList.add('is-flying');
    setTimeout(function () { amt.classList.remove('is-flying'); }, 900);

    /* 底部按钮：满充能 → 传送门开启展板；否则 → 主大厅（FR-042 §3） */
    var foot = h('div', 'result-foot', card);
    var btn = h('button', 'result-btn', foot);
    btn.type = 'button';
    var nextLevelId = Math.min((STM.LEVELS && STM.LEVELS.length) ? STM.LEVELS.length : 1, (opts.level || 1) + 1);
    btn.textContent = '\u5173\u5361 ' + nextLevelId;
    btn.addEventListener('click', function () {
      if (opts.paintingFull) { buildBoard(opts); }
      else { hide(); if (opts.onContinue) opts.onContinue(); }
    });
    return card;
  }

  /* ---------- 新奇幻大陆传送门开启展板（T073 / FR-042 §2） ----------
   * 每 12 关满充能 4/4 触发：全屏高清大陆全貌 + 大陆名称 +
   * `关卡 X-Y` 徽章 + 萌宠探险手账文案 + `继续` 按钮。 */
  /* 萌宠探险手账文案——每个大陆两行（FR-042 §2「原创治愈风景手账文案」，
   * T073 ③「两行温暖的萌宠探险手账文案」）。索引 = 大陆序号 0~5。
   * Δ19：文案随大陆名同步校正，与 bg{1..6} 实绘画面元素对应。 */
  var BOARD_NOTES = [
    ['晨雾漫过雪线，风把城堡的钟声送到了云端。', '第一片浮岛醒来时，湖畔的白鹅正数着天上的星星。'],
    ['浮空云岛上飞瀑流泻，纯白风车随微风轻转，', '飞羽萌鸟们乘着阳光气流展翅翱翔。'],
    ['潮水退去时，椰影在浅湾留下了一串绿宝石。', '果冻般的水色晃了晃，把贝壳和小鱼一起推上了岸。'],
    ['澄澈阳光穿透万年冰川，如镜的冰湖倒映着蔚蓝苍穹，', '蓬松软萌的极地生灵在此嬉戏。'],
    ['霞光铺成航道，热气球一路把星星带到了天边。', '云海替风翼让开了整条路，飞船的铃铛响了一路。'],
    ['极光垂落星穹，风翼划过之处皆是新的起点。', '银河倾斜在城塔之上，最后一束光收进了棱晶簇。']
  ];

  function buildBoard(opts) {
    var r = ensureRoot();
    r.innerHTML = '';
    var P = STM.Profile;
    var pi = P ? P.paintingIndexOfLevel(opts.level || 1) : 0;
    /* pi = 刚拼齐的那片大陆（0-based）——全屏画布展示它的全貌 */
    var isLast = pi >= 5; /* bg6 = L61-72 拼齐 → 终局文案，不显示越界区间 */
    /* 预告区 = **下一片**大陆（T073 ③ / FR-042 §2「即将开启的下一片大陆预告」） */
    var nextIdx = pi + 1;
    var range = (P && P.PAINTING_RANGES) ? P.PAINTING_RANGES[nextIdx] : null;
    var name = (P && P.PAINTING_NAMES) ? P.PAINTING_NAMES[nextIdx] : '';

    var board = h('div', 'portal-board', r);
    /* 全屏高清大陆全貌（与局内背景、星盘切片同源同文件） */
    var art = h('div', 'portal-board-art', board);
    var cv = h('canvas', 'portal-board-cv', art);
    var paintArt = function () {
      if (!cv || !cv.getContext) return;
      var w = cv.clientWidth, hh = cv.clientHeight;
      if (!(w > 0) || !(hh > 0)) return;
      var d = Math.max(1, global.devicePixelRatio || 1);
      cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
      var ctx = cv.getContext('2d');
      /* 整幅大陆全貌（drawWhole —— cover 铺满，与局内背景同源同文件） */
      var ok = true;
      try { ok = STM.Backdrops.drawWhole(ctx, pi + 1, 0, 0, cv.width, cv.height); } catch (e) { ok = false; }
      if (!ok) {
        var g = ctx.createLinearGradient(0, 0, 0, cv.height);
        g.addColorStop(0, '#1B2A5E'); g.addColorStop(1, '#BFD9EE');
        ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
      }
    };
    if (global.requestAnimationFrame) global.requestAnimationFrame(paintArt);
    else global.setTimeout(paintArt, 16);
    /* 时空传送门光柱（Δ17 原创构图） */
    h('div', 'portal-beam', art);

    var info = h('div', 'portal-board-info', board);
    if (!isLast) {
      /* 即将开启的下一片大陆：名称 + `关卡 X-Y` 徽章 */
      h('h2', 'portal-board-name', info, name);
      var badge = h('div', 'portal-board-badge', info);
      h('span', 'portal-board-range', badge, '关卡 ' + range[0] + '-' + range[1]);
    } else {
      /* 终局：全通关文案——MUST NOT 显示越界的 `关卡 X-Y` 区间（T073 ⑤） */
      h('h2', 'portal-board-name', info, '全境点亮');
    }
    /* 萌宠探险手账文案（两行） */
    var note = h('div', 'portal-board-note', info);
    if (isLast) {
      h('p', 'portal-board-note-text', note, '全部大陆已点亮——风翼载着你回到最初那片浮空岛。');
    } else {
      var lines = BOARD_NOTES[nextIdx] || ['', ''];
      h('p', 'portal-board-note-text', note, lines[0]);
      h('p', 'portal-board-note-text', note, lines[1]);
    }

    var foot = h('div', 'portal-board-foot', board);
    var btn = h('button', 'result-btn', foot, '继续');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      hide();
      if (opts.onContinue) opts.onContinue();
    });
    return board;
  }

  function hide() {
    if (root) { root.hidden = true; root.innerHTML = ''; }
    visible = false;
    if (rafId) { (global.cancelAnimationFrame ? global.cancelAnimationFrame(rafId) : clearTimeout(rafId)); rafId = 0; }
    if (petTimer) { clearTimeout(petTimer); petTimer = 0; }
  }

  STM.Result = {
    PRAISE: PRAISE,
    show: show,
    hide: hide,
    isVisible: function () { return visible; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
