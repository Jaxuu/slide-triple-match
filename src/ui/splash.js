/* =========================================================
 * Slide & Triple — HooLey Games 品牌开机动画（Δ16d / T066 / FR-038）
 * classic script；向 window.STM 挂载 STM.Splash（D-01；禁 import/export 语法）
 *
 * 铁律（FR-038）:
 *   ① 全屏黑曜石径向微光渐变（绝不用纯黑 #000000 死黑）——CSS #splash-screen
 *   ② 居中 `HooLey` 浮雕主标题 + 宽字距 `GAMES` 副标题（HTML 静态骨架）
 *   ③ 中间两个 `oo` 双环几何造型（内含高光眼神点），开场自两侧弹性碰撞吸附、
 *      俏皮地上下眨动一次并泛起七彩棱镜光晕；随后白金流光自左向右扫过字面
 *      （clip-path + 渐变遮罩扫掠，非整体闪烁）
 *   ④ 开机和弦音 playBootChime()（SoundManager 纯合成 ≈0.35s，零音频文件）
 *      autoplay 合规: 首次 pointerdown/keydown 之前 MUST NOT 发声，
 *      由 splash 监听首次交互后补发
 *   ⑤ 总时长 ≈2.0s 后平滑淡出并卸载；玩家首次点击/按键可跳过（落点一致）
 *   ⑥ 纯表现层: MUST NOT 触碰进度 / 棱晶 / 拼图态（MUST NOT 调 profile）
 *   ⑦ 性能: 纯 transform/opacity + rAF 字母变形（零布局抖动）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* 时序常量（FR-038 §5 ≈2.0s；rAF 动画分帧，末帧淡出卸载） */
  var TOTAL_MS = 2000;      /* 开机动画总时长 */
  var FADE_MS = 380;        /* 末尾淡出时长 */
  var CHIME_AT = 260;       /* 和弦音触发时刻（动画中段，视觉已成型） */

  var el = null;
  var running = false;
  var rafId = 0;
  var timer = 0;
  var chimeDone = false;
  var doneCb = null;
  var startTs = 0;
  var soundRef = null; /* SoundManager 实例（show({sound}) 注入） */

  /* ---------- 骨架（HTML 静态优先；缺运行时由本模块兜底创建） ---------- */
  function ensureEl() {
    if (el && el.parentNode) return el;
    var d = global.document;
    el = d.getElementById('splash-screen');
    if (el) return el;
    /* 兜底: index.html 未含骨架时按 FR-038 契约构建 */
    el = d.createElement('div');
    el.id = 'splash-screen';
    el.className = 'splash-screen';
    el.setAttribute('aria-label', 'HooLey Games');
    var wrap = d.createElement('div');
    wrap.className = 'splash-brand';
    wrap.innerHTML =
      '<div class="splash-title" aria-label="HooLey">' +
      '<span class="splash-ch" data-ch="0">H</span>' +
      '<span class="splash-ch splash-oo" data-ch="1"><i class="oo-ring"></i><i class="oo-eye"></i></span>' +
      '<span class="splash-ch splash-oo" data-ch="2"><i class="oo-ring"></i><i class="oo-eye"></i></span>' +
      '<span class="splash-ch" data-ch="3">l</span>' +
      '<span class="splash-ch" data-ch="4">e</span>' +
      '<span class="splash-ch" data-ch="5">y</span>' +
      '</div>' +
      '<div class="splash-sub">GAMES</div>';
    el.appendChild(wrap);
    var app = d.getElementById('app');
    if (app && app.parentNode) app.parentNode.insertBefore(el, app);
    else d.body.appendChild(el);
    return el;
  }

  function letters() {
    var root = ensureEl();
    return root.querySelectorAll ? root.querySelectorAll('.splash-ch') : [];
  }

  /* ---------- 字母级 rAF 变形（纯 transform/opacity——零布局抖动） ----------
   * 阶段划分（t = 0..TOTAL_MS 归一化进度）:
   *   0.00~0.34  两个 o 自两侧相向运动 + 轻微回弹（磁力碰撞吸附）
   *   0.34~0.62  俏皮地上下眨动一次（眼睑弧线由 scaleY 收放驱动）
   *   0.34~0.86  七彩棱镜光晕（hue-rotate + 外发光呼吸）
   *   0.55~0.95  白金流光扫掠（字面渐变遮罩位移） */
  function easeOutBack(x) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function frame(now) {
    if (!running) return;
    var t = now - startTs;
    var p = Math.max(0, Math.min(1, t / TOTAL_MS));

    var ls = letters();
    for (var i = 0; i < ls.length; i++) {
      var isO = ls[i].classList.contains('splash-oo');
      var tr = '';
      var op = 1;
      if (isO) {
        /* 相向运动 + 吸附回弹（0~0.34） */
        var k = Math.max(0, Math.min(1, p / 0.34));
        var e = easeOutBack(k);
        var side = (i === 1) ? -1 : 1;   /* 第 1 个 o 从左来，第 2 个从右来 */
        var dx = side * (1 - e) * 26;
        /* 眨眼（0.34~0.62）: 一次快速的上下眨动 */
        var blink = 0;
        var bp = (p - 0.34) / 0.28;
        if (bp >= 0 && bp <= 1) {
          blink = Math.sin(bp * Math.PI) * 1.6; /* 上挑幅度 → 下沉幅度 */
        }
        var dy = blink;
        /* 七彩棱镜光晕呼吸（0.34~0.86） */
        var hp = Math.max(0, Math.min(1, (p - 0.34) / 0.52));
        var glow = Math.sin(hp * Math.PI) * 10;
        tr = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)';
        ls[i].style.transform = tr;
        ls[i].style.filter = 'drop-shadow(0 0 ' + glow.toFixed(1) + 'px rgba(140,190,255,' + (hp).toFixed(2) + ')) hue-rotate(' + (hp * 40).toFixed(1) + 'deg)';
      }
      /* 整行字母淡入（0~0.2） */
      if (p < 0.2) op = p / 0.2;
      ls[i].style.opacity = op;
    }

    /* 白金流光扫掠（0.55~0.95）—— 遮罩位移经 CSS 变量驱动 */
    var root = ensureEl();
    var sweep = Math.max(0, Math.min(1, (p - 0.55) / 0.40));
    root.style.setProperty('--sweep', (sweep * 100).toFixed(1) + '%');

    if (!chimeDone && t >= CHIME_AT) {
      chimeDone = true;
      try {
        if (soundRef && soundRef.playBootChime) soundRef.playBootChime();
      } catch (err) { /* 合成失败静默降级 */ }
    }

    if (p >= 1) { finish(); return; }
    rafId = global.requestAnimationFrame(frame);
  }

  /* ---------- 淡出卸载 ---------- */
  function finish() {
    if (!running) return;
    running = false;
    if (rafId) { global.cancelAnimationFrame(rafId); rafId = 0; }
    if (timer) { global.clearTimeout(timer); timer = 0; }
    var root = ensureEl();
    /* 平滑淡出 → 卸载（移除 DOM + 事件解绑） */
    root.classList.add('splash-fading');
    global.setTimeout(function () {
      try {
        root.parentNode && root.parentNode.removeChild(root);
      } catch (err) { /* 已移除 */ }
      el = null;
      detachSkip();
      var cb = doneCb; doneCb = null;
      if (typeof cb === 'function') { try { cb(); } catch (err2) { /* 调用方异常隔离 */ } }
    }, FADE_MS);
  }

  /* ---------- 首次交互跳过（落点与自然播完一致：均走 finish()） ---------- */
  function onSkip(e) {
    /* 点击/触摸/按键任一 → 立即进入淡出（不跳过任何初始化——初始化由
     * main.js 在启动时已并行完成，本模块不持有任何持久化副作用） */
    if (!running) return;
    if (e && e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') {
      /* 任意键均可跳过——此处不做键位过滤，简化并保证响应一致 */
    }
    chimeDone = true; /* 跳过后不再补发和弦（已在跑则可发可不发） */
    finish();
  }

  function attachSkip() {
    var d = global.document;
    d.addEventListener('pointerdown', onSkip, true);
    d.addEventListener('keydown', onSkip, true);
  }

  function detachSkip() {
    var d = global.document;
    d.removeEventListener('pointerdown', onSkip, true);
    d.removeEventListener('keydown', onSkip, true);
  }

  /* ---------- 对外 API ----------
   * show(opts) → 播放开机动画，约 2.0s 后（可跳过）平滑淡出并调用
   *   opts.onDone（落入大厅）。纯表现层：不触碰进度 / 棱晶 / 拼图态。
   * sound —— 可选 SoundManager 实例（提供 playBootChime）。 */
  function show(opts) {
    opts = opts || {};
    var d = global.document;
    if (!d || running) return;
    var root = ensureEl();
    /* 显示（若已 fade 残留则重置类） */
    root.classList.remove('splash-fading', 'splash-hide');
    root.style.display = '';
    running = true;
    chimeDone = false;
    doneCb = opts.onDone;
    soundRef = opts.sound || null;
    startTs = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    attachSkip();
    if (global.requestAnimationFrame) {
      rafId = global.requestAnimationFrame(frame);
    } else {
      /* 无 rAF 环境的降级: 直接定时收尾（Node 自测路径） */
      timer = global.setTimeout(finish, TOTAL_MS);
    }
  }

  STM.Splash = {
    show: show,
    TOTAL_MS: TOTAL_MS,
    FADE_MS: FADE_MS,
    CHIME_AT: CHIME_AT
  };
})(typeof window !== 'undefined' ? window : globalThis);