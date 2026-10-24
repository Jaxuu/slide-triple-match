# Bug Assessment: 飞行期间顶层卡牌闪烁露出底层卡牌 + 待消区托盘/卡牌视觉规范倒置

- **Slug**: flight-layer-dock-visual
- **Created**: 2026-10-24
- **Source**: pasted text（实机截图复现）
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

实机截图复现两个顽疾：

1. **Bug 1（飞行帧层级覆盖漏洞）**：点击任意卡牌起飞时，棋盘其他未点击位置的顶层卡牌（如玄凤鹦鹉）在飞行过程中会变成底层卡牌（如海豚），飞行结束动画停止后又变回。排查点：`src/render/BoardRenderer.js` 的 rAF 动画循环——绘制剩余卡牌时是否直接遍历 `state.tiles` 而漏掉基于 `z` 的全局升序排序；是否存在局部脏区重绘、分层图层合并缓存、按数组下标索引取缓存导致的图层遮挡错乱。修复原则：统一为单轨全量绘制，每帧绘制非飞行卡牌时必须强制按 `(a.z - b.z) || (a.r - b.r) || (a.c - b.c)` 升序排序，确保 z=0 先画、z>0 后画覆盖在上。

2. **Bug 2（待消区托盘与卡牌视觉规范倒置）**：待消区卡牌内部仍有一圈内嵌小方框，且此前整个待消区托盘被错误改为全白背景。排查点：`css/style.css` 与 `src/main.js` 的 `renderDock()`——`#dock` 容器需恢复深色半透明磨砂质感，严禁给 `#dock`/`#dock-wrap` 设纯白背景；槽内 `.dock-chip` 或其子元素是否存在多余的 `border`/`outline`/`box-shadow: inset`；槽内动物图标需统一调用棋盘同款 `STM_ICON_BBOXES` 纯净去边居中绘制。

## Symptom

- **Bug 1**：飞行动画期间，静止的上层滑块（z>0）被下层滑块（z=0）覆盖/闪烁，飞行结束后恢复。期望：静止上层滑块在飞行全程始终保持在下层滑块之上。
- **Bug 2**：待消槽托盘/卡牌显示白底方框内嵌，与棋盘奶油白 3D 卡牌视觉不一致。期望：托盘深色半透明磨砂；槽内卡牌与棋盘卡牌 1:1 一致，无内嵌方框。

## Reproduction

1. 启动游戏，进入任意含多层堆叠的关卡（如 Level 12）。
2. 点击一个可飞出的顶层滑块，观察飞行过程中其他顶层滑块是否短暂显示为底层滑块。
3. 观察顶部待消槽：托盘背景与槽内卡牌是否存在白色方框/内嵌边框。

## Suspected Code Paths

### Bug 1 — BoardRenderer.js rAF 绘制
- [src/render/BoardRenderer.js:1007-1025](src/render/BoardRenderer.js#L1007-L1025) — `frame()`：rAF 主循环，`tick()` 推进动画，`draw()` 全量重绘。
- [src/render/BoardRenderer.js:1280-1365](src/render/BoardRenderer.js#L1280-L1365) — `draw()`：`ctx.clearRect` + `renderList = tiles.filter(!flyingIds)` + `renderList.sort(z→r→c)` + 绘制非飞行卡牌 + 动画层绘制飞行卡牌。
- [src/render/BoardRenderer.js:915](src/render/BoardRenderer.js#L915) — `lastProbe` 缓存；[src/render/BoardRenderer.js:1603-1614](src/render/BoardRenderer.js#L1603-L1614) — `refresh()` 重算 `lastProbe` 与 `tileInfo` 缓存。
- [src/render/BoardRenderer.js:916](src/render/BoardRenderer.js#L916) — `tileInfo` 视觉缓存（id→{r,c,s,d,z,...}），动画层 `tileById` 优先读取，可能携带过期 z。
- [src/render/BoardRenderer.js:1314-1321](src/render/BoardRenderer.js#L1314-L1321) — `flyingIds`/`flyingTiles` 计算；`flyingTiles` 当前未消费（动画层遍历全部 `anims`）。

### Bug 2 — Dock 样式与 renderDock
- [css/style.css:342-362](css/style.css#L342-L362) — `#dock`：`background: rgba(30,41,59,.45)` + 边框/阴影，无 `backdrop-filter` 磨砂。
- [css/style.css:418-435](css/style.css#L418-L435) — `.slot .dock-chip, ...`：`background: #FFFFFF` + `border: 1px solid #E2E8F0` + `box-shadow` → 内嵌白方框。
- [src/main.js:958-975](src/main.js#L958-L975) — `renderDock()`：生成 `.dock-chip` + `STM.chipSVG(...)`；调用 `paintDockIcons()`。
- [src/render/BoardRenderer.js:1711-1757](src/render/BoardRenderer.js#L1711-L1757) — `chipSVG()`：切片 DataURL 出口 + canvas 兜底 + Emoji 兜底；切片由 `whiteKeySlice()` 使用 `STM_ICON_BBOXES` 裁切。

## Root Cause Hypothesis

### Bug 1（置信度：中）
当前 `draw()` 已对非飞行卡牌执行 `renderList.sort(z→r→c)`，但 `tileInfo` 视觉缓存不会在 `refresh()` 中清理已移除/飞行卡牌的过期条目，动画层 `tileById()` 优先命中缓存可能返回过期 `z`；同时 `flyingTiles` 数组计算后未用于图层收尾，飞行卡牌与静止卡牌的最终绘制顺序依赖 `anims` 数组顺序而非 z 排序。在飞行期间多次 `refresh()`（dock/match 事件）与 `lastProbe` 重算下，若某帧 `flyingIds` 未正确 populated（例如 `anims` 中 fly 条目 tileId 与 probe tile id 不一致），非飞行集合的 z 排序仍成立，但飞行卡牌可能被绘制在错误层级，造成"顶层变底层"的闪烁。需统一为单轨全量绘制：每帧 `clearRect` → 收集 `!flying && !removed` → 强制 sort → 绘制 → 最后绘制飞行卡牌于最顶层。

### Bug 2（置信度：高）
`#dock` 托盘缺少磨砂 `backdrop-filter`；`.dock-chip` 容器强制白底 + 边框 + 阴影，叠加切片的圆角白底，形成内嵌白方框。切片已通过 `STM_ICON_BBOXES` 裁切，但 CSS 容器样式未对齐棋盘卡牌（棋盘卡牌为奶油白 3D 底板 + 82% 图标 + 无内嵌方框）。

## Proposed Remediation

### Bug 1
- `draw()` 每帧：`ctx.clearRect(0,0,cssSize,cssSize)` → `activeTiles = lastProbe.tiles.filter(t => !flyingIds[t.id] && !removed)` → `activeTiles.sort((a,b)=>(a.z-b.z)||(a.r-b.r)||(a.c-b.c))` → 依次 `drawBoardTile`（含 covered 暗影）→ 最后遍历 `flyingTiles`（或 flying anims）绘制飞行卡牌于最顶层。
- 清理 `tileInfo` 中已移除条目，避免动画层读取过期 z；或在 `tileById` 中对飞行卡牌仍从 `lastProbe`/缓存读取但仅取 suit/color，位置由 path 决定。
- 移除任何局部缓存/跳过排序的快速路径。

### Bug 2
- CSS：`#dock` 恢复深色半透明 + `backdrop-filter: blur(10px)` + 边框/阴影；空槽 `.slot` 深色内凹。
- `.dock-chip` 容器与棋盘卡牌一致：白底 + 圆角 + 1px 边框 + 底部投影，无内嵌方框；内部 `.dock-icon`/canvas/img 清除 border/outline/inset shadow，图标占 78% 居中。
- `renderDock()`：保持 `chipSVG`（已消费 `STM_ICON_BBOXES`），确保图标与棋盘同源。

## Risks & Considerations

- Bug 1 修改绘制顺序可能影响 reveal 上浮动画与 hint 高亮层；需保持粒子/高亮在飞行卡牌之后或之前的一致性。
- Bug 2 CSS 改动影响 72 关全部 Dock 观感；需确保不破坏 `.slot.has-tile` 的 concave 镶嵌动画。
- 无 lint/type-check；依赖 `node tools/render-selftest.js` 与 `verify-fix.cjs` 回归。

## Open Questions

- [NEEDS CLARIFICATION: Bug 1 的闪烁是否在当前代码中已部分缓解（draw() 已 sort）？需实机 rAF 帧采样确认 tileInfo 过期缓存是否为根因]
- [NEEDS CLARIFICATION: #dock 的"全白背景"是否指 `.dock-chip` 容器而非 `#dock` 本身（当前 `#dock` 已为深色半透明）]
EOF
echo "written"