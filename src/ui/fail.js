/* =========================================================
 * Slide & Triple — 无倒计时失败界面与棱晶复活（Δ16g / T074 / FR-043）
 * classic script；向 window.STM 挂载 STM.Fail（D-01；禁 import/export 语法）
 *
 * 铁律:
 *   ① **无倒计时红线**: MUST NOT 出现任何倒计时数字、剩余时间、进度条
 *      倒计时或「限时」话术。「只有 XX% 的玩家能一次通过此关」中的 XX%
 *      是与 FR-036 同源的**通关率统计暗示文案**（确定性函数值），非倒计时
 *      进度，禁止被实现为递减计时器。
 *   ② 中部: 当前 3D 萌宠头像配委屈泪滴动效（生成—滑落—消散循环）
 *   ③ 底部**仅两个大按钮、无多余小字**（无「提示/教程/广告」文案）
 *   ④ 沿用 Δ17 奶油果冻软胶卡片视觉基底（与设置/档案弹窗同系）
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  var root = null;
  var visible = false;
  var tearTimer = 0;
  var optsRef = null;

  function ensureRoot() {
    var d = global.document;
    if (root && root.parentNode) return root;
    root = d.getElementById('fail-root');
    if (!root) {
      root = d.createElement('div');
      root.id = 'fail-root';
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

  /* ---------- 失败页（FR-043 §1~§3） ---------- */
  function show(opts) {
    opts = opts || {};
    optsRef = opts;
    var r = ensureRoot();
    r.innerHTML = '';
    r.hidden = false;
    visible = true;

    /* 奶油果冻软胶卡片（Δ17 共用视觉基底） */
    var card = h('div', 'jelly-card fail-card', r);

    /* ① 顶部: 温和鼓励文案（零倒计时——XX% 为通关率暗示值） */
    var plaque = h('div', 'jelly-plaque', card, '差一点就过关了！');
    plaque.classList.add('fail-plaque');
    h('p', 'fail-encourage', card,
      '只有 ' + (opts.percent == null ? 30 : opts.percent) + '% 的玩家能一次通过此关');
    var reason = h('p', 'fail-reason', card, opts.reason || '');
    reason.classList.add('jelly-subtitle');

    /* ② 中部: 萌宠头像 + 委屈泪滴动效 */
    var petBox = h('div', 'fail-pet', card);
    var face = h('div', 'fail-pet-face', petBox);
    var P = STM.Profile;
    if (P && STM.petAvatarHTML) {
      face.innerHTML = STM.petAvatarHTML(P.get().avatar);
    }
    /* 泪滴（生成—滑落—消散循环） */
    if (tearTimer) { clearInterval(tearTimer); tearTimer = 0; }
    tearTimer = setInterval(function () {
      if (!visible) return;
      var tear = h('i', 'fail-tear', petBox);
      setTimeout(function () { if (tear.parentNode) tear.parentNode.removeChild(tear); }, 1600);
    }, 900);

    /* ③ 底部: 仅两个大按钮，无多余小字 */
    var foot = h('div', 'fail-foot', card);
    var revive = h('button', 'jelly-btn jelly-btn-primary fail-revive', foot);
    revive.type = 'button';
    revive.textContent = '💎 100 棱晶复活';
    revive.addEventListener('click', function () {
      if (opts.onRevive) opts.onRevive();
    });
    /* 余额不足 → 置为不可用（FR-041 §3） */
    var balance = P ? P.get().shards : 0;
    if (balance < 100) {
      revive.disabled = true;
      revive.classList.add('is-poor');
      revive.title = '棱晶不足';
    }
    var restart = h('button', 'jelly-btn jelly-btn-secondary', foot);
    restart.type = 'button';
    restart.textContent = '重新开始';
    restart.addEventListener('click', function () {
      if (opts.onRestart) opts.onRestart();
    });
    return card;
  }

  /* 余额不足提示（FR-041 §3：明确提示，不扣费） */
  function notifyInsufficient() {
    if (!visible) return;
    var r = root;
    if (!r) return;
    var t = h('div', 'fail-toast', r, '棱晶不足');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
  }

  function hide() {
    if (root) { root.hidden = true; root.innerHTML = ''; }
    visible = false;
    if (tearTimer) { clearInterval(tearTimer); tearTimer = 0; }
    optsRef = null;
  }

  STM.Fail = {
    show: show,
    hide: hide,
    notifyInsufficient: notifyInsufficient,
    isVisible: function () { return visible; }
  };
})(typeof window !== 'undefined' ? window : globalThis);