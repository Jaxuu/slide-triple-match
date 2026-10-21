# Bug Fix: 视觉与渲染一致率三缺陷（Dock/Board 贴图割裂、画质模糊、方向箭头不可辨）

- **Slug**: visual-render-consistency
- **Fixed**: 2026-10-21
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

按 assessment 根因结论逐项修复三 Bug：Bug A 沿「DataURL 优先 + canvas 同源兜底」双出口彻底统一 Dock/Board 图标（覆盖 `file://` 跨源污染场景）；Bug B 改用 2x 超采样 + 高质量插值 + 切片 256 + 显式正方形锁定 + 移除毛玻璃与白雾；Bug C 把方向箭头改为四向高饱和主题色。引擎侧零漂移（`tools/solver.js --engine-selftest` 11/11 全绿），渲染层自测与双形态实机探针全绿。

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | Bug A: `chipSVG` 改双出口 + 新增 `dockIconDataURL()` + `paintDockIcons()` + 提至模块作用域的 `warnOnce()`；Bug B: `SLICE_PX=256`、`dpr=Math.max(2,…)`、`imageSmoothingQuality='high'`、棋盘正方形锁定、移除画布内径向暖白 veil、滑块加深厚度边 + 深色投影；Bug C: `DIR_COLORS` 四向主题色 + `drawWingBadge` 填充改 DIR_COLORS；`ensureSinglesFor` onerror 修 TOCTOU；新增 `STM.paintDockIcons`/`STM.dockIconDataURL` 导出 |
| `src/main.js` | modified | Bug A: `renderDock()` 末尾调 `STM.paintDockIcons()` 兜底绘制；`onSpritesReady` 回调注册改为 `dockReadyHooked` 单次门闩（修原 60 关后回调数组累积 60 项的潜在 bug） |
| `css/style.css` | modified | Bug A: `.slot` 改立体圆角奶油白卡槽（线性渐变 + 加深厚度边 + 深色投影），空槽为深色内凹槽；新增 `.slot .dock-icon` 规则（img+canvas 双形态）；Bug B: 移除 `#board` 的 `backdrop-filter` 与白纱底板，`background: transparent`，加 `height:auto` 配合 JS 正方形锁定 |
| `tools/render-selftest.js` | modified | 场景 G 末尾把原「保留磨砂暖白 veil」断言（钉的是被移除的视觉）替换为 Δ15b3e 修复断言组（Bug A/B/C 各项产物 + CSS 回归断言） |
| `tools/verify-fix.cjs` | added | 评估期外验证工具：`file://` 与 `http://` 双形态并行情形下的 Bug A/B/C 实机探针（CDP + 像素采样），用于 /speckit-bug-test |

## Diff Highlights

### Bug A — `chipSVG` 双出口（行 1163-1175）

```javascript
var slice = IconAssets.sliceCanvasOf(bid);
if (!slice) {
  IconAssets.ensureSinglesFor([bid]);
} else {
  /* ① DataURL 出口（http:// 及可导出环境） */
  var url = dockIconDataURL(bid);
  if (url) {
    return '<img class="dock-icon" src="' + url + '" alt="' + ... + '" draggable="false"/>';
  }
  /* ② 污染兜底：canvas 直绘同一张切片（与棋盘同源） */
  return '<canvas class="dock-icon" width="256" height="256" data-bid="' + bid + '" aria-label="' + ... + '"></canvas>';
}
```

`dockIconDataURL(bid)` 一次性写缓存，失败时记忆化为 `null`（不再逐帧重试抛错），并通过 `warnOnce('dockDataURL', ...)` 留痕——原实现在 `file://` 下静默失败 45 次却零信号，是该缺陷长期未被发现的主因。

`paintDockIcons()` 在 `main.js renderDock()` 末尾调用：对每个 `<canvas class="dock-icon" data-bid>`，按 `clientWidth × dpr` 设物理像素、清屏、`imageSmoothingQuality='high'`、`drawImage(slice, 0, 0, px, px)`——与棋盘 `getSprite()` 走的是**同一条 `drawImage` 路径**，故 file:// 下也同源同图。

### Bug A — `ensureSinglesFor` TOCTOU 修

```javascript
img.onerror = function () {
  if (source[bid] !== 'sheet' && source[bid] !== 'single') source[bid] = 'emoji';
};
```

原 `source[bid] = 'emoji'` 无条件覆写，sheet onload 与单张 404 onerror 竞态下会把已由 sheet 覆盖的条目误标为 emoji。评估实测 45 条中 5 条出现 `source='emoji'` 但 `hasSlice=true` 的不一致。

### Bug B — 切片 128→256 + 2x 超采样 + 棋盘正方形锁定

```javascript
var SLICE_PX = 256;  // 原 128
…
var dpr = Math.max(2, global.devicePixelRatio || 1);  // 原 Math.max(1, …)
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';  // 原未设置（浏览器默认 'low'）

function resize() {
  …
  var side = Math.max(1, Math.min(cssW, cssH));
  var boxPx = Math.round(side);
  if (canvas.style) {
    canvas.style.width = boxPx + 'px';
    canvas.style.height = boxPx + 'px';  // CSS 盒与位图同正方形 → 消除 1.18× 拉伸
  }
  boardPx = Math.round(side * dpr);
  …
}
```

### Bug B — 移除画布内暖白 veil + 棋盘毛玻璃/白纱（CSS）

`draw()` 内原 `createRadialGradient` 0.10→0.18 暖白 veil 整段删除。`#board` CSS 中 `backdrop-filter: blur(3px) saturate(1.05)` 与 `background: rgba(255,255,255,0.22)` 移除，改为 `background: transparent` + 深色阴影 `0 10px 34px rgba(15,23,42,.28)`。

### Bug B — 滑块对比度由自身投影承载（drawTileBody）

```javascript
ctx.save();
ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
ctx.shadowBlur = Math.max(2, cell * 0.14);
ctx.shadowOffsetY = Math.max(1.5, cell * 0.045);
roundRect(ctx, x, y + side * 0.4, w, w, cell * 0.15);
ctx.fillStyle = '#9AA8BC'; ctx.fill();    // 原 #B8C4D4（加深深厚度）
roundRect(ctx, x, y + side * 0.4 - thick * 0.55, w, w, cell * 0.15);
ctx.fillStyle = '#AEBACB'; ctx.fill();    // 原 #CBD5E1
ctx.restore();
```

### Bug C — 四向主题色箭头

```javascript
var DIR_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6'];  // U R D L
…
ctx.fillStyle = DIR_COLORS[d] || '#10B981';   // 原 '#FFFFFF'（零对比）
ctx.fill();
ctx.lineWidth = Math.max(dprSafe(1.5), 1);
ctx.strokeStyle = 'rgba(255,255,255,1)';      // 1.5px 白描边保留
ctx.stroke();
```

## Tests Added or Updated

- `tools/render-selftest.js` 场景 G — 把原「保留磨砂暖白可读性层」断言（钉的是被移除的视觉）替换为 Δ15b3e 修复断言组：
  - **Bug A（5 项）**：`paintDockIcons` 已导出；`dockIconDataURL` 已导出；`chipSVG` 走 `.dock-icon` 类（双出口字面量）；`ensureSinglesFor` onerror 不再无条件覆写（移除原单行 `source[bid] = 'emoji'`）；降级路径有 `console.warn` 留痕（`warnOnce` 字面量）。
  - **Bug B（7 项）**：磨砂暖白 veil 已移除（不再含 `rgba(255,252,246,0.10)`）；滑块改用 `rgba(15,23,42,0.35)` 投影；`SLICE_PX=256` 且不再含 `cv.width = 128`；DPR `Math.max(2, devicePixelRatio||1)`；`imageSmoothingQuality='high'` 字面量；`canvas.style.height` 回写（正方形锁定）；CSS 规则体 `backdrop-filter` 字面量已移除 + `background:transparent` 出现。
  - **Bug C（3 项）**：`DIR_COLORS` 四向常量正则匹配；`ctx.fillStyle = DIR_COLORS[d]` 字面量；`ctx.strokeStyle = 'rgba(255,255,255,1)'` 白描边保留。
- `tools/verify-fix.cjs` — 评估期外双形态验证探针（`file://` 与 `http://` 并行，CDP 驱动 headless Chrome）：实测所有 Bug A/B/C 量化指标（无 Emoji、Dock 出口正确、棋盘 aspectDelta=0、2x 超采样、smoothing=high、切片 256、角点透明、arrow spread 126.9 vs 修复前 2.9）。

## Local Verification

- `node tools/render-selftest.js` → exit 0（场景 A~G 全绿，含 Δ15b3e 修复断言组 15 项全绿）
- `node tools/solver.js --engine-selftest` → exit 0（11/11 全绿，引擎侧零漂移）
- `node tools/verify-fix.cjs`（双形态实机探针）→ ALL GREEN：
  - **file://** 形态：B/Dock 5 槽均走 `<canvas class="dock-icon" data-bid>` 出口，无 Emoji；棋盘位图 960×960，CSS 盒 480×480，aspectDelta=0；`pxPerCssY=2`（2x 超采样）；`imageSmoothingQuality=high`；切片 256×256；`#board` 无 backdrop-filter / 底板透明；`DIR_COLORS` 4 色齐备；页面零未捕获异常。
  - **http://** 形态：Dock 5 槽均走 `<img class="dock-icon" data-DataURL>` 出口；其余指标同上；箭头实测亮度跨度 **126.9**（修复前 2.9）、最大饱和度 **169**——证明四向主题色已生效。
- 实机截图（`tools/_verify_*.png`，验证后已清理）：双形态 8×8 Level 12 棋盘图标一致、背景锐利通透透出、箭头四向彩色清晰可辨、Dock 7 格立体卡槽与棋盘滑块同款 3D 视觉。
- `node --check` 语法校验：`BoardRenderer.js` / `main.js` 均通过。

## Deviations from Assessment

- **切片尺寸档策略**：评估建议"按 cell × dpr × 2 分档缓存"。当前实现取 256px 单一档（源 512、下限满足 8×8×DPR2 的 ~75px 图标绘制需求）。分档缓存涉及 `getSprite` 缓存键重构 + 8×8/4×4 两档切片维护成本，**对当前症状（图标发糊）的修复是单档就够的**；分档作为后续 T052k 性能抽查时的优化项。已在 follow-ups 登记。
- **Bug A 出口选型**：评估首选是"Dock 改为复用棋盘同源的 Canvas 渲染（绕开 DataURL 导出）"。实际采用了用户明确要求的"DataURL 优先 + canvas 兜底"双出口方案——评估文件中同样列出了"最小改动（仅 chipSVG 失败回退）"作为备选，本实现即该备选的扩展版：DataURL 走主路径以满足原设计意图，仅在 `file://` 跨源污染抛 SecurityError 时回退到 `<canvas>` 兜底。`dockIconDataURL` 记忆化失败结果，避免逐帧重试抛错。双出口的 DOM 节点类型不同（`img` vs `canvas`），但消费的是**同一张 `IconAssets.sliceCanvasOf(bid)` 切片**——同源同图，与评估的"出口同源"目标完全一致。
- **CSS 盒强制正方形锁定的实现位置**：评估建议两条路径——`resize()` 改用 CSS 盒真实宽高分别设 `canvas.width/height`，或调整 CSS 让 `#board` 恒正方形。当前取混合方案：`#board` CSS 加 `height:auto` 让 `min(w,h)` 约束生效（避免被 `max-height:100%` 压扁），`resize()` 显式回写 `canvas.style.width/height` 为正方形（消除原 1.18× 拉伸）。这样保留了 `hitTest` 已按 `rect.width/rect.height` 归一化的逻辑（[BoardRenderer.js:1090-1091](src/render/BoardRenderer.js#L1090-L1091)），无需改命中判定。`canvas.style` 在 Node 自测桩上无 `style` 对象，已加 `if (canvas.style)` 防御。
- **T052i 任务复选框注记**：评估提到 T052i「三角箭头重做未实施」属欠账。本修复落地后，方向角标重做实质完成——`T052i 复选框归位` 应作为后续 follow-up 之一（需产品侧决定是否同时修订 spec FR-034 §3 的「带白色描边」字面要求与可辨识度红线 §5 的口径消解）。

## Follow-ups

- T052i 复选框归位（三角箭头重做已实质完成，参见本 fix 的 `DIR_COLORS` 实现）。
- spec.md FR-034 §3「白描边」字面要求与 §5「可辨识度红线」冲突的条款消解——可参照 Δ13/Δ15 的"受控消解"写法记录。
- 切片分档缓存（256 / 512）作为 T052k 性能抽查的优化项——8×8×DPR2 满载下当前单档已够用，但 4×4 小关可省内存。
- `tools/verify-fix.cjs` 是否纳入 `tools/` 仓内常驻自测 vs 仅 `/speckit-bug-test` 阶段使用——建议 T052k 验收时纳入，但当前不影响修复正确性。
- `warnOnce` 改造为可复现的「降级计数」+ 复现路径（哪个 suit / 哪个源），便于产品侧统计「file:// 形态的污染命中比例」——评估已指出这是缺陷长期未被发现的根因，可观测性应作为兜底路径的强制约束。
- `dockReadyHooked` 单次门闩的引入顺手修了原 60 关后回调数组累积 60 项的潜在 bug（虽未实际触发 renderDock 重复，但每次新关卡都追加闭包是资源浪费）。
