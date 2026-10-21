/* =========================================================
 * Slide & Triple — 设置弹窗与个人信息弹窗（Δ16e / T069 / FR-040；
 * Δ17 奶油果冻质感原创重制）
 * classic script；向 window.STM 挂载 STM.Modals（D-01；禁 import/export 语法）
 *
 * Δ17 共用视觉基底（FR-040 §0）——两个弹窗共享同一套原创皮肤:
 *   · 3D 奶油白圆角软胶卡片（大圆角 + 柔和内阴影 + 顶部高光）
 *   · 琥珀金胶囊标题铭牌（标题置于顶部琥珀金渐变胶囊内）
 *   · 棱晶圆角拨片开关（滑块态发出虹彩微光）
 *
 * 原创性红线: MUST NOT 使用天蓝圆弧顶盖等竞品标志性载体
 * （Edge Cases「外围 UI 竞品视觉元素清零红线」）。
 *
 * 铁律:
 *   ① 设置弹窗仅三项：BGM / SFX / 触觉震动（FR-040 §1）
 *   ② 局内打开设置时额外提供【返回主大厅】【重新开始】（大厅打开时不显示）
 *   ③ 触觉震动开关在设备不支持时 MUST 显示为不可用并保持关闭、不报错
 *   ④ 昵称与头像持久化至 profile v2，且所有引用处同步生效（单一数据源）
 *   ⑤ 模态：遮罩拦截底层输入，ESC/关闭按钮可退出，退出后焦点恢复
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  var root = null;   /* 模态遮罩容器 */
  var openState = null; /* { kind, onClose } —— 单例，模态互斥 */

  /* ---------- 骨架 ---------- */
  function ensureRoot() {
    var d = global.document;
    if (root && root.parentNode) return root;
    root = d.getElementById('modal-root');
    if (!root) {
      root = d.createElement('div');
      root.id = 'modal-root';
      root.hidden = true;
      var app = d.getElementById('app');
      if (app) app.appendChild(root);
      else d.body.appendChild(root);
    }
    return root;
  }

  /* 构建奶油果冻卡片外壳（Δ17 §0 共用视觉基底） */
  function buildCard(kind, title, subtitle) {
    var r = ensureRoot();
    r.innerHTML = '';
    /* 先解除 hidden 再构建——hidden 态下布局盒为 0，
     * .jelly-card 的居中与圆角度量会全部失效（FR-040 §5） */
    r.hidden = false;

    var scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.addEventListener('pointerdown', onScrimDown);
    r.appendChild(scrim);

    var card = document.createElement('div');
    card.className = 'jelly-card jelly-card-' + kind;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);

    /* 琥珀金胶囊标题铭牌（替代天蓝圆弧顶盖） */
    var plaque = document.createElement('div');
    plaque.className = 'jelly-plaque';
    plaque.textContent = title;
    card.appendChild(plaque);
    if (subtitle) {
      var sub = document.createElement('p');
      sub.className = 'jelly-subtitle';
      sub.textContent = subtitle;
      card.appendChild(sub);
    }

    var body = document.createElement('div');
    body.className = 'jelly-body';
    card.appendChild(body);

    r.appendChild(card);
    return { root: r, scrim: scrim, card: card, body: body };
  }

  function onScrimDown() { close(); } /* 点遮罩 = 关闭（模态拦截底层输入） */
  function onKeyDown(ev) { if (ev.key === 'Escape') close(); }

  function close() {
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
    global.removeEventListener('keydown', onKeyDown, true);
    var cb = openState ? openState.onClose : null;
    openState = null;
    /* 退出后焦点与底层交互恢复正常——归还到触发前的活动元素 */
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { } }
    lastFocus = null;
    if (cb) cb();
  }
  var lastFocus = null;

  function captureFocus() {
    var d = global.document;
    lastFocus = d.activeElement;
    global.addEventListener('keydown', onKeyDown, true);
  }

  /* 棱晶圆角拨片开关（Δ17 §0）——on 态发出虹彩微光 */
  function buildToggle(body, label, checked, disabled, onToggle) {
    var row = document.createElement('label');
    row.className = 'jelly-row' + (disabled ? ' is-disabled' : '');

    var name = document.createElement('span');
    name.className = 'jelly-row-label';
    name.textContent = label;
    row.appendChild(name);

    var sw = document.createElement('span');
    sw.className = 'prism-toggle';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.disabled = !!disabled;
    sw.classList.toggle('is-on', !!checked && !disabled);
    sw.appendChild(input);
    var knob = document.createElement('i');
    knob.className = 'prism-toggle-knob';
    sw.appendChild(knob);
    row.appendChild(sw);

    if (disabled) {
      /* 设备不支持 → 显示为不可用并保持关闭，不报错（FR-040 §1） */
      input.checked = false;
      sw.classList.remove('is-on');
      var hint = document.createElement('span');
      hint.className = 'jelly-row-hint';
      hint.textContent = '当前设备不支持';
      row.appendChild(hint);
    } else {
      input.addEventListener('change', function () {
        sw.classList.toggle('is-on', input.checked);
        if (onToggle) onToggle(input.checked);
      });
    }
    body.appendChild(row);
    return input;
  }

  function buildButton(body, label, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'jelly-btn ' + (cls || '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    body.appendChild(b);
    return b;
  }

  /* ---------- 设置弹窗（Settings Modal，FR-040 §1） ----------
   * 仅三项核心实用开关；局内打开时额外提供【返回主大厅】【重新开始】。 */
  function openSettings(inGame, handlers) {
    handlers = handlers || {};
    var P = STM.Profile;
    if (!P) return null;
    var ui = buildCard('settings', '设置',
      inGame ? null : '声音与触感偏好');
    captureFocus();
    openState = { kind: 'settings', onClose: handlers.onClose };
    var s = P.get().settings;

    /* ① BGM 背景音乐开关（FR-037 联动口径） */
    buildToggle(ui.body, '背景音乐 BGM', s.bgm, false, function (on) {
      P.setSetting('bgm', on);
      if (handlers.onAudio) handlers.onAudio();
    });
    /* ② SFX 游戏音效开关 */
    buildToggle(ui.body, '游戏音效 SFX', s.sfx, false, function (on) {
      P.setSetting('sfx', on);
      if (handlers.onAudio) handlers.onAudio();
    });
    /* ③ 触觉震动开关（设备不支持 → 不可用并保持关闭、不报错） */
    buildToggle(ui.body, '触觉震动', s.haptics, !P.hapticsSupported(), function (on) {
      P.setSetting('haptics', on);
    });

    /* 局内额外两项（大厅打开时不显示——FR-040 §1） */
    if (inGame) {
      buildButton(ui.body, '返回主大厅', 'jelly-btn-secondary', function () {
        close();
        if (handlers.onBackToLobby) handlers.onBackToLobby();
      });
      buildButton(ui.body, '重新开始', 'jelly-btn-secondary', function () {
        close();
        if (handlers.onRestart) handlers.onRestart();
      });
    }
    buildButton(ui.body, '完成', 'jelly-btn-primary', close);
    return ui;
  }

  /* ---------- 个人信息弹窗（Profile Modal，FR-040 §2） ----------
   * 昵称输入框（空值/超长兜底）+ 45 选 1 萌宠头像网格（复用 sheet1~3）。 */
  function openProfile(handlers) {
    handlers = handlers || {};
    var P = STM.Profile;
    if (!P) return null;
    var ui = buildCard('profile', '个人信息', '选择你的探险搭档');
    captureFocus();
    openState = { kind: 'profile', onClose: handlers.onClose };
    var prof = P.get();

    /* ① 昵称输入框（空值/超长 MUST 有合理默认值与长度兜底） */
    var nickWrap = document.createElement('div');
    nickWrap.className = 'jelly-field';
    var nickLabel = document.createElement('span');
    nickLabel.className = 'jelly-field-label';
    nickLabel.textContent = '昵称';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'jelly-input';
    input.maxLength = P.NICK_MAX;
    input.value = prof.nickname;
    input.placeholder = P.NICK_DEFAULT;
    var commit = function () {
      /* setNickname 内含 sanitizeNickname——空值/超长自动兜底 */
      var v = P.setNickname(input.value);
      input.value = v; /* 回写兜底后的真实值（单一数据源） */
      if (handlers.onChange) handlers.onChange();
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    nickWrap.appendChild(nickLabel);
    nickWrap.appendChild(input);
    ui.body.appendChild(nickWrap);

    /* ② 萌宠头像选择网格（45 选 1，选中打勾高亮） */
    var grid = document.createElement('div');
    grid.className = 'avatar-grid';
    var cur = prof.avatar;
    for (var bid = 0; bid <= 44; bid++) {
      (function (id) {
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'avatar-cell' + (id === cur ? ' is-selected' : '');
        cell.setAttribute('aria-label', '头像 ' + (id + 1));
        /* 复用已加载的 sheet1~3 切片（与大厅头像按钮/结算铭牌同源） */
        cell.innerHTML = STM.petAvatarHTML ? STM.petAvatarHTML(id) : '';
        var tick = document.createElement('i');
        tick.className = 'avatar-tick';
        tick.textContent = '✓';
        cell.appendChild(tick);
        cell.addEventListener('click', function () {
          cur = P.setAvatar(id);
          var all = grid.querySelectorAll('.avatar-cell');
          for (var i = 0; i < all.length; i++) {
            all[i].classList.toggle('is-selected', all[i] === cell);
          }
          if (handlers.onChange) handlers.onChange();
        });
        grid.appendChild(cell);
      })(bid);
    }
    ui.body.appendChild(grid);
    /* Δ17: file:// 下 canvas 占位需补绘（否则头像网格全空白） */
    if (STM.paintAvatarCanvases) STM.paintAvatarCanvases(grid);

    buildButton(ui.body, '完成', 'jelly-btn-primary', close);
    return ui;
  }

  STM.Modals = {
    openSettings: openSettings,
    openProfile: openProfile,
    close: close,
    isOpen: function () { return !!openState; }
  };
})(typeof window !== 'undefined' ? window : globalThis);