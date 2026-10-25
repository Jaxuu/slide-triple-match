'use strict';
/* =========================================================
 * normalize-sheets —— 【已废弃 · Δ23/Bug2】
 *
 * 本脚本的旧口径是「16 格 / 5% 内缩 / 非白阈值 242」：
 *   · 5% 内缩（每侧 25px）会把贴边的耳朵/尾鳍/角直接切掉；
 *   · 阈值 242 会漏掉 243~250 的浅色绒毛（白兔/白牦牛/北极熊/白仙鹤）；
 *   · 与 BoardRenderer 的 base 步进口径互相矛盾，导致花色取到错格包围盒。
 *
 * 逻辑已统一到 `tools/gen-icon-bboxes.js`（纯 Node + ffmpeg，无 PIL 依赖）：
 *   16 格 × 6 张 = 96 条 · 只忽略最外圈 2px · 阈值 246 · 外扩 8px · 正方形。
 *
 * 保留本文件名仅为兼容旧引用/旧文档链接，实际行为已转调新工具。
 * 直接运行 `node tools/gen-icon-bboxes.js` 即可。
 * ========================================================= */
console.warn('[normalize-sheets] 已废弃 → 转调 tools/gen-icon-bboxes.js（Δ23/Bug2 口径修正）');
require('./gen-icon-bboxes.js');
