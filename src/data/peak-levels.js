/* =========================================================
 * Slide & Triple — 峰值困难关集合与险境预警横幅主题表（Δ29a / FR-036）
 * classic script；向 window.STM 挂载 STM.PEAK_LEVELS / STM.PeakBanner（D-01）
 *
 * 为什么单独成模块（而不是写在 main.js 里）：
 *   ① **单一源铁律**——「哪些关是困难关」只允许一处定义。散落在 UI 层 /
 *      样式层 / 埋点层各写一份 `(id-4)%3==2` 会让验收无法穷举（Δ29 的根因
 *      之一就是旧判定 `id===3 || (id-4)%3===2` 判出 24 关，每 3 关一次）。
 *   ② **可离线断言**——Node 侧门禁（render-selftest / banner 专项）可直接
 *      require 本模块，对 1..72 全量遍历，无需真实 DOM。
 *
 * 集合口径（FR-036 §1）：
 *   PEAK_LEVELS = L(12k+6) ∪ L(12k+12)，k = 0..5
 *                = 每幅画卷（12 关）的**峰值关**（第 6 关）与**压轴关**（第 12 关）
 *                = 6 × 2 = 12 关；其余 60 关（含 L3）零横幅。
 *   L3 被明确排除：它属 FR-046 引导期，横幅会与教学语义打架。
 *
 * 主题色（FR-036 §3）：
 *   六幅画卷各一套「主色相 / 副色相 / 辉光色相」，**唯一常量表**。
 *   `ref` = 该画卷的主色相（人工标定值，用于门禁断言「横幅主色相偏差 <= 30°」）。
 *   横幅只经 CSS 变量（--banner-hue-a / --banner-hue-b / --banner-glow）
 *   一次性写入，**MUST NOT 逐帧改样式、MUST NOT 起 rAF 驱动**。
 * ========================================================= */
(function (global) {
  'use strict';

  var STM = global.STM = global.STM || {};

  /* ---------- 峰值困难关（12 关，唯一源） ---------- */
  var PEAK_LEVELS = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72];

  /* 判定唯一出口。MUST NOT 在别处再写一份区间/取模判定。 */
  function isPeakLevel(id) {
    var v = Number(id);
    if (!isFinite(v)) return false;
    return PEAK_LEVELS.indexOf(v | 0) >= 0;
  }

  /* ---------- 六画卷预警主题（唯一源） ----------
   * hue 单位 = 度（0~359）。a = 主色相（横幅底 + 左段），b = 副色相（右段 / 流光），
   * glow = 边框与辉光。ref = 画卷主色相（标定值，门禁用）。
   *
   * 禁令：MUST NOT 出现「墨绿底 + 黄边」（旧 #challenge-banner 的识别特征——
   * #2E5E3E 色相 ≈ 140°、#FFC53D 色相 ≈ 42° + 10×46px 金色卷轴端饰）。
   * 故主色相 MUST NOT 落在 140° ± 25° 内。 */
  var PEAK_BANNER_THEMES = [
    /* 画卷一 · 晨曦雪峰庄园 —— 冰晶蓝 / 雪白 */
    { id: 1, name: '晨曦雪峰庄园', ref: 205, a: 205, b: 196, glow: 198 },
    /* 画卷二 · 云端飞瀑风车岛 —— 天青 / 薄荷青 */
    { id: 2, name: '云端飞瀑风车岛', ref: 186, a: 186, b: 166, glow: 172 },
    /* 画卷三 · 碧浪椰影浅湾 —— 海蓝 / 珊瑚粉 */
    { id: 3, name: '碧浪椰影浅湾', ref: 198, a: 198, b: 12, glow: 188 },
    /* 画卷四 · 凛冬冰川镜湖 —— 冰蓝 / 银白 */
    { id: 4, name: '凛冬冰川镜湖', ref: 212, a: 212, b: 226, glow: 218 },
    /* 画卷五 · 云端霞彩航道 —— 霞粉 / 暖金 */
    { id: 5, name: '云端霞彩航道', ref: 340, a: 340, b: 40, glow: 350 },
    /* 画卷六 · 星穹极光之巅 —— 星穹紫 / 极光青 */
    { id: 6, name: '星穹极光之巅', ref: 265, a: 265, b: 176, glow: 252 }
  ];

  /* 画卷序号 = floor((levelId - 1) / 12) + 1（1~6），与 STM.Bestiary.PAINTINGS 同口径 */
  function paintingIndexOf(levelId) {
    var v = Number(levelId);
    if (!isFinite(v) || v < 1) v = 1;
    var idx = Math.floor((v - 1) / 12) + 1;
    if (idx < 1) idx = 1;
    if (idx > PEAK_BANNER_THEMES.length) idx = PEAK_BANNER_THEMES.length;
    return idx;
  }

  function themeOf(levelId) {
    return PEAK_BANNER_THEMES[paintingIndexOf(levelId) - 1];
  }

  /* ---------- 时序常量（FR-036 §7） ----------
   * SHOW_MS：展示时长（1.4s）；DISMISS_MS：被打断时的即时淡出（<= 100ms 内不可见）；
   * FADE_MS：自然消散的淡出时长（淡出 + 轻微下沉，MUST NOT 硬切）。 */
  var PeakBanner = {
    PEAK_LEVELS: PEAK_LEVELS,
    isPeakLevel: isPeakLevel,
    THEMES: PEAK_BANNER_THEMES,
    paintingIndexOf: paintingIndexOf,
    themeOf: themeOf,
    SHOW_MS: 1400,
    DISMISS_MS: 80,
    FADE_MS: 260,
    /* 文案契约（FR-036 §5）——单行可读，窄屏允许折两行，MUST NOT 截断/省略号 */
    TEXT: function (percent) {
      return '\u2726 险境预警 \u00b7 仅 ' + percent + '% 探险家一次突破 \u2726';
    }
  };

  STM.PEAK_LEVELS = PEAK_LEVELS;
  STM.isPeakLevel = isPeakLevel;
  STM.PEAK_BANNER_THEMES = PEAK_BANNER_THEMES;
  STM.PeakBanner = PeakBanner;
})(typeof window !== 'undefined' ? window : globalThis);
