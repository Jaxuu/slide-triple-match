# Bug Assessment: 飞行帧局部重绘导致上层滑块“变身” + 待消区卡牌内嵌小边框残留

- **Slug**: flight-frame-redraw-dock-inset
- **Created**: 2026-10-25
- **Source**: pasted text（实机连续截图复现）
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

实机连续截图（点击前 / 点击飞出瞬间）复现两个顽疾：

1. **Bug 1（飞行帧局部重绘只取单层导致的“变身”漏洞）**：点击蓝鸟起飞瞬间，第 1 行第 3 列的大嘴鸟（z=1）突然变成了下层 z=0 的红鲸鱼，飞行结束后又变回。根因怀疑 `src/render/BoardRenderer.js` 飞行动画循环中存在“局部单元格重绘（redrawCell / dirty rects）”或 `getTileAt(r,c)` / `find(t => t.r === r && t.c === c)` 一类单滑块查找，仅返回该坐标在底层 z=0 的首个滑块（红鲸鱼），漏掉上层 z=1 滑块（大嘴鸟），导致动画期间上层被下层覆盖穿透。根治：彻底废除局部单元格重绘与单滑块查找，每帧对全盘 activeTiles 按 `z` 升序全局遍历绘制。

2. **Bug 2（待消区卡牌内部仍套内嵌小方框）**：待消区卡牌内部仍有一圈浅灰/浅蓝色内嵌小边框；必须保持待消区托盘整体为高级深色半透明磨砂，严禁再次将整个待消区改成纯白色。根因怀疑 `src/main.js` 的 `renderDock()` 与 `css/style.css` 中 `.dock-chip` / `.dock-icon` / `<canvas>` 残留 `border` / `outline` / `box-shadow: inset` / `strokeRect`。根治：`#dock` 保持深色半透明磨砂托盘；槽内卡牌仅由单层 3D 奶油白卡片构成，彻底去除内部所有子元素的内框描边。

## Symptom

- **Bug 1**：飞行动画期间，静止的上层滑块（z>0）被下层滑块（z=0）覆盖/闪烁，飞行结束后恢复。期望：静止上层滑块在飞行全程始终保持在下层滑块之上，无“变身”。
- **Bug 2**：待消槽卡牌内部仍可见浅灰/浅蓝色内嵌小方框，观感与棋盘奶油白 3D 卡牌不一致。期望：托盘深色半透明磨砂；槽内卡牌与棋盘卡牌 1:1 一致，无内嵌方框；托盘不得变为纯白。

## Reproduction

1. 启动游戏，进入含多层堆叠的关卡（如 Level 12），确保某坐标同时存在 z=0 与 z=1 滑块（例：第 1 行第 3 列红鲸鱼 z=0 + 大嘴鸟 z=1）。
2. 点击一个可飞出的顶层滑块（蓝鸟），观察飞行过程中第 1 行第 3 列大嘴鸟是否短暂显示为红鲸鱼。
3. 飞行结束后确认该位置恢复为大嘴鸟。
4. 观察顶部待消槽：托盘是否为深色半透明磨砂；槽内卡牌是否内部仍有一圈浅灰/浅蓝色小方框。

[NEEDS CLARIFICATION: 截图像素级帧采样不可在本环境复现；以上为用户描述 + 代码路径推断。]

## Suspected Code Paths

### Bug 1 — 飞行帧绘制与单滑块查找

- `src/render/BoardRenderer.js:1281` `draw()` — `ctx.clearRect` → `tiles = lastProbe.tiles` → `renderList = tiles.filter(!flyingIds)` → `renderList.sort(z→r→c)` → 静态层绘制 → 动画层（非 fly 先、fly 最后）。当前已存在全局 z 升序排序。
- `src/render/BoardRenderer.js:1314-1334` — `flyingIds` / `flyingTiles` 计算与非飞行过滤；`flyingTiles` 数组当前未消费，动画层遍历全部 `anims`。
- `src/render/BoardRenderer.js:1531` `tileById(id)` — **残余单滑块查找**：优先命中 `tileInfo[id]` 缓存，未命中再线性扫描 `lastProbe.tiles`。动画层（`:1426` `drawAnim`）与 magnet-absorb 路径（`:1552` `tileInfo[e.id]`）均经此单 id 解析，可能读取过期 `z/r/c`。
- `src/render/BoardRenderer.js:915-916` — `lastProbe` / `tileInfo` 视觉缓存（id→{r,c,s,d,z,stackDepth,...}）；`:1603-1627` `refresh()` 全量重写 `tileInfo` 并清理已移除条目（飞行中条目保留）。
- `src/render/BoardRenderer.js:1424-1456` — fly 分支 `drawAnim` 用 `tileById(a.tileId)` 取 `t.z/t.s` 绘制飞行卡牌；若缓存漂移则飞行卡牌/静止卡牌身份错乱。
- `src/core/RulesEngine.js:1304` `renderProbe(state)` — 输出 `tiles`（含 `removed` 过滤、`z`、`covered`、`rr/cc`）；`:1318-1328` 堆叠深度表按 `z:r:c` 聚合。

代码库中未发现用户假设的字面 `redrawCell` / `getTileAt` / `find(t => t.r === r && t.c === c)` 实现（全仓 grep 无匹配）；等价的单滑块解析残余为 `tileById` + `tileInfo` 缓存读取，以及 `covered` 状态在飞行期间的切换。

### Bug 2 — 待消区托盘与卡牌内框

- `css/style.css:342-362` `#dock` — 当前为深色半透明 `rgba(30,41,59,0.55)` + `backdrop-filter: blur(10px)` + 边框/阴影（磨砂托盘，正确基线，必须保留）。
- `css/style.css:364-398` `.slot` / `.slot.has-tile` — 空槽深色内凹 + `inset` 阴影；有牌槽 `background: transparent` / `border: none` / `box-shadow: none`。
- `css/style.css:418-436` `.slot .dock-chip`（含 `.dock-icon` 容器） — `background: #FFFFFF !important` + `border: 1px solid #E2E8F0 !important` + `box-shadow: 0 3px 0 #CBD5E1, 0 2px 5px ... !important`；容器圆角 8px。内层 `.dock-icon`（`:437-450`）已设 `border/outline/box-shadow: none`，但容器边框与立体投影仍构成可见内框。
- `css/style.css:452-462` `.chip-icon-canvas` / `.chip-icon-emoji`（`:464-468`）— 子元素样式，需统一无内框。
- `src/main.js:958-975` `renderDock()` — 生成 7 格 HTML，有牌格 `<div class="dock-chip">` + `STM.chipSVG(...)`，随后调用 `STM.paintDockIcons()`。
- `src/render/BoardRenderer.js:1727` `chipSVG(s, level)` — DataURL `<img class="dock-icon">` / 污染兜底 `<canvas class="dock-icon" data-bid>` / Emoji 兜底；`:1801` `paintDockIcons()` 仅 `clearRect + drawImage`，无 `strokeRect`。

## Root Cause Hypothesis

**Bug 1（置信度：中）**：当前 `draw()` 静态层已执行 `renderList.sort(z→r→c)`，但动画层与 magnet 路径仍经 `tileById()` 单 id 解析，优先命中 `tileInfo` 缓存；飞行过程中 `refresh()`（dock/match/blocked 等事件）会重写缓存，若缓存与 `lastProbe.tiles` 在某一帧短暂不一致（或飞行卡牌 id 未正确从 `anims` 收集到 `flyingIds`），`drawAnim('fly')` 可能用到过期/错配的 `t`（含 `z` 与 `s`），而静止上层卡牌的绘制又依赖 `covered` 状态在飞行期间的切换，最终呈现为“上层滑块短暂显示为下层滑块”。字面的局部单元格重绘/`.find()` 单滑块查找在当前代码中不存在，但其等价的单 id 缓存读取路径是残余风险点。建议根治为：每帧仅以 `lastProbe.tiles` 为唯一数据源，过滤 removed/flying，强制全局 z→r→c 排序全量重绘，动画层飞行卡牌的 `t` 也必须从当帧 `lastProbe`/缓存按 id 解析但只取 `s/m/ice` 等视觉字段，位置完全由 path 决定；移除任何按坐标 `.find()`/局部 dirty-cell 重绘快速路径。

**Bug 2（置信度：高）**：`#dock` 托盘本身已为深色半透明磨砂（正确），但 `.dock-chip` 容器的 `border: 1px solid #E2E8F0` + `box-shadow`（含立体投影）在白色卡片内形成可见的内嵌小方框/台阶，叠加 `.slot` 的 `inset` 阴影与容器圆角，观感上出现“内嵌小方框”。子元素 `.dock-icon` 已去边，但 `.chip-icon-canvas` / Emoji 兜底及容器本身仍残留样式不一致。`paintDockIcons()` 无 `strokeRect`，故内框来自 CSS 而非 canvas 绘制。

## Proposed Remediation

**Bug 1 — 首选**：
- `draw()` 每帧：`ctx.clearRect` → `activeTiles = lastProbe.tiles.filter(t => !removed && !flyingIds[t.id])` → `activeTiles.sort((a,b)=>(a.z-b.z)||(a.r-b.r)||(a.c-b.c))` → 依次 `drawBoardTile`（含 covered 暗影）→ 最后遍历 flying anims 绘制飞行卡牌于最顶层。
- 废除/内联 `tileById` 在绘制路径中的缓存优先读取：动画层对飞行卡牌仅从 `lastProbe` 解析 `s/m/ice` 等视觉字段，位置由 path 决定；或在 `refresh()` 中保证 `tileInfo` 与 `lastProbe` 同步且飞行条目 `z` 不漂移。
- 移除任何局部单元格重绘 / dirty-rect / 按坐标 `.find()` 单滑块查找快速路径；全盘每帧全量重绘。
- 清理 `tileInfo` 中已移除且非飞行条目（已存在，保留）；新增断言：飞行期间静止上层滑块的绘制顺序与 z 一致。

**Bug 1 — 备选**：
- 保留当前 sort，但新增 `flyingIds` 一致性校验与 `tileInfo` 过期条目清理的更强不变量；风险较低但无法根除缓存漂移。

**Bug 2 — 首选**：
- 保持 `#dock` 深色半透明磨砂（`rgba(30,41,59,0.55)` + `backdrop-filter: blur(10px)`）与边框/阴影，严禁改回纯白。
- `.dock-chip` 作为唯一 3D 奶油白卡片：保留白底 + 圆角 + 底部立体投影（3D 卡片），但去除其 `border: 1px solid #E2E8F0`（或改为与卡片底色一致的无视觉内框），避免内嵌小方框。
- 所有子元素（`.dock-icon`、`.chip-icon-canvas`、`.chip-icon-emoji`、`canvas`、`img`、`span`）统一 `border: none !important; outline: none !important; box-shadow: none !important;`，图标占 78% 居中，无内框。
- `renderDock()` 与 `paintDockIcons()` 保持切片同源（`STM_ICON_BBOXES`），不新增 `strokeRect`。

**Bug 2 — 备选**：
- 仅对子元素追加去边样式，不动 `.dock-chip` 容器边框；风险是内框仍可见，不满足“彻底去除”。

**Files likely to change**：
- `src/render/BoardRenderer.js`（`draw()`、`tileById()`、`drawAnim()`、`refresh()`）
- `src/main.js`（`renderDock()`）
- `css/style.css`（`#dock` 保持；`.slot .dock-chip` / `.dock-icon` / `.chip-icon-canvas` / `.chip-icon-emoji` 去内框）

**Tests to add or update**：
- `tools/render-selftest.js`：新增场景断言飞行期间静止上层滑块绘制顺序与 z 一致（全量重绘、无局部 cell 重绘）；断言 `tileInfo` 不含过期条目。
- `tools/verify-fix.cjs`：新增 CSS 断言 `#dock` 背景仍为深色半透明 + backdrop-filter；`.dock-icon`/`.chip-icon-canvas` 无 border/outline/inset box-shadow；截图人工复核无内框。

## Risks & Considerations

- Bug 1 全量重绘每帧可能小幅增加渲染开销；但棋盘 ≤8×8，且当前已全量 clearRect + sort，风险可控。
- 移除 `tileById` 缓存优先读取需确认 block/gear/unlock/ice/prism 动画仍能读取 `r/c/m/ice`（当前缓存补齐这些字段以避 NaN）；建议缓存仍保留供动画层读视觉字段，但绘制顺序与身份以 `lastProbe` 为准。
- Bug 2 CSS 改动影响全部 72 关 Dock 观感；需确保 `.slot.has-tile` 的 concave 镶嵌动画与 `dock-seat` 不回归。
- 无 lint/type-check；依赖 `node tools/render-selftest.js` 与 `tools/verify-fix.cjs` 回归。

## Open Questions

- [NEEDS CLARIFICATION: 实机截图中“变身”是否在当前代码（已全局 sort）下仍稳定复现，还是仅在特定刷新时序（dock/match 事件并发）下出现？需 rAF 帧采样确认。]
- [NEEDS CLARIFICATION: 待消区“内嵌小方框”具体来自 `.dock-chip` 容器边框还是 `.slot` 的 inset 阴影/圆角叠加？需 DevTools computed style 与截图对照确认。]
- [NEEDS CLARIFICATION: 是否应将本评估合并回 `flight-layer-dock-visual` 还是作为独立 slug `flight-frame-redraw-dock-inset`？当前按独立 slug 落盘。]