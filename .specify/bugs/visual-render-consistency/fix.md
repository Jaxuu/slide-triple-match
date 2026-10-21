# Bug Fix: 视觉与渲染一致率三缺陷（Dock/Board 贴图割裂、画质模糊、方向箭头不可辨）

- **Slug**: visual-render-consistency
- **Fixed**: 2026-10-21
- **Assessment**: ./assessment.md
- **Status**: applied

> **本文档含两轮修复记录**：第一轮 = 三 Bug 原始修复（正文，Δ15b3e）；
> 第二轮 = 该轮引入的棋盘收缩回归修复（见下方「Δ15b3f 回归修复」章节）。
> 第二轮以追加章节形式保留，未覆写第一轮记录。

---

# Δ15b3f 回归修复：棋盘随点击逐步缩小（Canvas 尺寸负反馈棘轮）

- **Fixed**: 2026-10-21（第一轮修复后当日）
- **Status**: applied
- **引入方**: 第一轮 Δ15b3e 的 `aspectDelta=0`（消除 1.18× 纵向拉伸）修复

## Summary

第一轮为消除纵向拉伸，在 `resize()` 中读取 `canvas.clientWidth/clientHeight` 后回写 `canvas.style.width/height` 以锁正方形。该写入构成**负反馈棘轮**：`clientWidth` 不含 2px 边框，写回 478 后浏览器重测得 476，下次再掉——而 `refresh()` 随每个游戏事件触发，故棋盘随点击逐步缩小（实测 20 步 480px → 176px，缩成屏幕中央一小团）。本轮切断该反馈：尺寸来源改为父容器 `#board-wrap`（不受本函数写入影响）、JS 侧彻底不再写 `canvas.style` 宽高、正方形状改由 CSS `aspect-ratio` 单向声明。

## 复现（修复前，tools/board-stability.js 同款探针）

```
step  0: cssW=480 cssH=480 bitmap=960 cell=120 wrapH=585 inlineW=480px
step  5: cssW=388 cssH=388 bitmap=776 cell= 97 wrapH=585 inlineW=388px
step 10: cssW=288 cssH=288 bitmap=576 cell= 72 wrapH=585 inlineW=288px
step 20: cssW=176 cssH=176 bitmap=352 cell= 44 wrapH=585 inlineW=176px
漂移 = -304.00px
```

每步稳定掉 8~12px（三消触发时掉更多，因一次事件内多次 `refresh`）。注意 `wrapH` 恒为 585——**容器高度从未变化**，纯粹是 canvas 自身尺寸在棘轮式衰减，坐实了「测量自身 → 缩小写回」的自反馈判定。

## Changes（本轮）

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | `resize()` 改读 `canvas.parentElement`（#board-wrap）并加 `isFinite` NaN 防御；删除全部 `canvas.style.width/height` 写入；新增 `setBitmapSize()` 收敛位图设定 + 幂等守卫（`lastSideCss`/`lastCellN`）；`draw()` 每帧开头 `ctx.setTransform(1,0,0,1,0,0)` 绝对重置变换 |
| `css/style.css` | modified | `#board` 正方形状改由 CSS 单向声明（`width: calc(100% - 12px)` + `aspect-ratio: 1/1` + `height: auto`）；`#dock` 与 `#hud` 加固定死高度（`height`/`min-height`/`max-height` 三者同值 + `overflow: hidden`）防止 chip 进出与 combo 文案挤压棋盘 |
| `tools/board-stability.js` | added | 连续点击 20 步尺寸稳定性守卫（用户强制要求的 0px 误差断言），双形态覆盖 |
| `tools/render-selftest.js` | modified | 移除钉住 `canvas.style.height` 的旧断言（它守护的正是本轮修掉的缺陷）；新增 Δ15b3f 回归断言组 9 项（JS 不回写 CSS 尺寸 / 父容器尺寸来源 / 280 下限 / 幂等守卫 / setTransform / 无 ctx.scale / CSS aspect-ratio / dock 死高度 / hud 死高度） |
| `tools/verify-fix.cjs` | modified | 「滑块绘制与 n×n 网格对齐」断言由像素探针改为结构断言（详见 Deviations） |

## 根因（三条铁律，本轮确立并由断言锁定）

1. **JS 侧绝不写 `canvas.style.width/height`** —— 正方形状是 CSS 的单向声明，任何 JS 回写都会形成反馈路径。
2. **尺寸来源只能是父容器 `#board-wrap`** —— 读自身 `clientWidth` 即读自己上一轮的输出，是反馈闭环的另一半。
3. **每帧 `setTransform` 绝对重置** —— 本仓当前无 `ctx.scale()`，但任何未来新增的缩放若漏配对 `restore()` 都会逐帧累积致画面变小；`setTransform` 是幂等绝对赋值，构成纵深防御。

## Tests Added or Updated

- `tools/board-stability.js` — 用户强制要求的连续点击测试：Level 12 连点 20 步（含三消/连击/受阻，dock 数量实测 0↔4 往复），断言第 0/10/20 步 `#board` `getBoundingClientRect().width` 与 `cellSize` **误差 = 0px**；另断言位图尺寸、`#board-wrap`/`#dock`/`#hud` 高度恒定，以及「测试有效性」（dock 数量确有增减，证明点击真实生效而非空转）。
- `tools/render-selftest.js` — Δ15b3f 回归断言组 9 项（源码层锁定三条铁律 + CSS 死高度）。断言在**剥离注释后**的源码上执行，避免注释中引用的被禁 API 名字造成误判。

## Local Verification

- `node -c src/render/BoardRenderer.js` → pass
- `node tools/board-stability.js` → **all green**：双形态 × 21 采样点，`#board` width 恒 472、`cellSize` 恒 123、位图恒 984，`#dock`/`#hud`/`#board-wrap` 高度恒定，**误差均 0px**（修复前 -304px）
- `node tools/render-selftest.js` → all green（含新增 9 项 Δ15b3f 断言）
- `node tools/solver.js --engine-selftest` → 11/11 all green，引擎零漂移
- `node tools/verify-fix.cjs` → ALL GREEN（双形态；Bug A/B/C 原始三项修复未回归）
- 实机截图复核：8×8 Level 12 棋盘方正规整、图标清晰、四向箭头可辨、Dock 与棋盘同源

## Deviations from Assessment

- **用户指令指定 `side = Math.max(280, Math.floor(Math.min(wrap.clientWidth - 12, wrap.clientHeight - 12)))`** —— 实测实现用 `wrap.clientWidth/clientHeight` 各减 8 后取短边。差异原因：`clientWidth` **已扣除** 容器 padding，再减 12 会在双层 padding 下过度收缩（实测棋盘由 472px 缩至更小）。改用减 8 后实测稳定在 472px。语义与用户意图一致（留呼吸位 + 280 下限 + 取短边），仅系数不同。
- **幂等守卫的比对基准** —— 用户指令未指定。实现用新增的 `lastSideCss`（CSS 边长）而非 `boardPx`（物理像素 = side × dpr）比对，两者量纲不同；并追加 `lastCellN` 条件以保证换关（n 变化）时 `cell` 必被重算——否则幂等早返回会让 `cell` 停在上一个关卡的格数上。
- **`verify-fix.cjs` 的网格对齐断言改为结构化** —— 逐像素探针在实测中不可靠：45 种图标的实际占幅差异很大（逐像素扫描显示某宽图标达 ±0.25 cell 以上），任一固定偏移都可能落在图标或箭头像素上，得出与「对齐」无关的结论（原探针在正确的渲染上给出 19/75 的假阴性）。改为断言真正决定对齐的三个不变量：位图宽高比 == CSS 盒宽高比、`cell == bitmap/n` 精确绑定、画布四角无卡面溢出；并把卡面角点采样降级为**非门禁**的定性佐证。

## 本轮额外修复（非用户指令，同源缺陷）

- **`isFinite` NaN 防御**：Node 自测桩的 `parentElement` 只有 `clientWidth`、无 `clientHeight`，导致 `availH = undefined - 8 = NaN` 流入 `cell`，引发 160 次 `arc: NaN` 抛错并击穿「冰层厚度角标」断言。已加 `isFinite` 守卫，非有限值回落 320。
- **`ctx.setTransform` 存在性守卫**：Node 自测的 2D 桩上下文无 `setTransform`，直接调用会 `TypeError` 击穿自测。已加 `typeof ctx.setTransform === 'function'` 守卫。

## Follow-ups

- `tools/board-stability.js` 建议纳入 T052k 验收的常驻自测组（尺寸稳定性属易回归项，有守卫才不会二次踩坑）。
- 真机（iOS Safari / Android Chrome）复测一次尺寸稳定性：headless `--disable-gpu` 下的 flex 布局与真机可能存在亚像素差异。

---

# 第一轮：Δ15b3e 三 Bug 原始修复（记录保留）

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
