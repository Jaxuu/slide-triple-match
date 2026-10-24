# Bug Assessment: 飞出瞬间相邻卡牌"变身"（动画层越过 z 序重绘卡体） + 待消区卡牌内嵌小方框（切片白底 + drop-shadow 描出方框）

- **Slug**: flight-neighbor-morph-dock-inset
- **Created**: 2026-10-25
- **Source**: pasted text（用户实机连续截图复现）
- **Verdict**: valid（两个缺陷均已在无头 Chrome 中**逐帧实测复现**，并取得调用栈级证据）
- **Severity**: high（Bug 1：核心操作瞬间的画面错乱，直接破坏"看图识花色"的判定前提；Bug 2：跨形态视觉不一致，影响作品观感评分）

> 本评估不做任何源码修改，仅写入 `.specify/bugs/flight-neighbor-morph-dock-inset/`。
> 取证脚本与截图已归档在同目录 `probes/` 与 `frames/`，可复跑。

---

## Report (verbatim or summarized)

用户报告两个"反复未能解决"的缺陷：

1. **Bug 1**：点击卡牌飞出瞬间，旁边**未被点击**的卡牌会短暂变成另一张卡牌，飞行结束后又变回。例一：第一行第 4 列蓝鹦鹉飞出时，其正下方（第二行第 4 列）静止的**黑色大嘴鸟**变成**红色鲸鱼**，且右上角带一个**闪烁圆圈**。例二：点击某张牌飞出时，相邻的**黄色玄凤鹦鹉**在飞行期间变成**底层的蓝色海豚**，飞完又变回。
2. **Bug 2**：棋盘卡牌是"纯白圆角底座 + 居中动物"，无内框；但飞入顶部 `#dock` 后，同一张白卡内部多出一圈**灰/蓝色内嵌小方框**。约束：`#dock` 外层大托盘必须保持现有深色半透明磨砂，**严禁**改成白色背景。

历史背景：`blocked-slider-vanish`、`flight-frame-redraw-dock-inset`、`flight-layer-dock-visual`、`ingame-hud-render-defects` 等历史评估对这两个现象均给出"代码路径推断"，其中 `flight-frame-redraw-dock-inset/assessment.md:29` 明确写着
`[NEEDS CLARIFICATION: 截图像素级帧采样不可在本环境复现；以上为用户描述 + 代码路径推断。]`
——**即此前所有修复都在未复现的前提下进行**。本次评估补上了这一步。

## Symptom

- **Bug 1**：一次成功的飞出（`flyout`）会在同一帧派生一个 `gear` 联动事件；`gear` 动画在**整张静态层之后**重绘该齿轮牌**整块卡体**，且重绘时丢失"被压暗"状态，于是把**更高层（z 更大）的静止卡牌**盖掉一部分 → 观感即"未动的卡牌变成另一张卡牌，右上角出现闪烁金圈"，320ms 后动画结束、静态层重画 → 复原。
- **Bug 2**：`file://` 形态下 `getImageData` 抛错 → 贴图切片**保留不透明白底**；棋盘用 `globalCompositeOperation='darken'` 把白底"融"进白卡（隐形），而 `#dock` 内的 `<canvas class="dock-icon">` 直接 `source-over` 直绘，再叠加 CSS `filter: drop-shadow(...)`——阴影按**切片自身的 alpha 轮廓（一个不透明圆角方块）**投射 → 形成"白卡里又贴了一张带边框的小方块"。

## Reproduction

### Bug 1（已实测，可重复）

环境：无头 Chrome（`--headless=new --window-size=420,900`），http 静态服务打开 `index.html`（`keying=true`，与 file:// 无关）。

1. `STM.main.enterGame(11)`（第 11 关，n=7，cell=70.29px）。
2. 点击 `r0c1`（tile #17，z=0，suit2，方向 d=0 向上）。
3. 该关在 `r1c1` 同时存在：齿轮牌 #37（z=0，suit0 → bestiaryId 0）与上层牌 #0（z=1，suit6 → bestiaryId 8）。
4. 点击后事件序列实测为：
   ```
   gear  id=37  dir 2→3
   dock  id=17  slot=0
   flyout path=[{r:0,c:1,z:0},{r:-1,c:1,z:0}]
   ```
   `gear` 与 `flyout` 同帧派生 → 与用户描述的"飞出瞬间"完全一致。
5. 130ms 后对 `r0..r3 × c0..c3` 区域做 3× 放大裁剪（`frames/L11-zoom-before.png` / `-during130.png` / `-after.png`）：
   - before：`r1c1` 的 z=0 熊猫牌**被压暗**（`covered` 深色遮罩），上层狐狸牌压在其右下；
   - during：熊猫牌**变亮、且盖到上层狐狸牌之上**，右上角出现**金色圆环**（齿轮脉冲）；
   - after：与 before 完全一致。

### Bug 2（已实测，可重复）

环境：无头 Chrome **直接 `file:///.../index.html`**（等价用户双击运行）。

1. `STM.main.enterGame(3)`，点任意可点牌使其入槽。
2. 实测 `STM.IconAssets.keyingAvailable() === false`、`sheetCount === 6`。
3. `#dock` 内有牌槽的 DOM：`<div class="dock-chip"><canvas class="dock-icon" width="64" height="64" data-bid="8"></canvas></div>`。
4. computedStyle：`.dock-chip` 44×44、`background: rgb(255,255,255)`；`.dock-icon` 32.75×32.75（= 内容盒 42px × 78%）、`filter: drop-shadow(rgba(15,23,42,0.38) 0px 2px 3px)`。
5. 5× 放大截图 `frames/file-dock-L3-zoom.png`：白卡内部可见一圈灰蓝内嵌方框。
6. 对照：http 形态（`keying=true`）下同一位置**无内框**（`frames/L11-dock-zoom.png`）——这解释了为什么开发/自测阶段"看不见"该缺陷。

## Evidence（逐帧 / 调用栈级实测）

### Bug 1

对每次 `CanvasRenderingContext2D.drawImage` 做钩子（切片画布预先打 `__bid` 标记），记录**目标矩形 + 调用栈**，逐 rAF 帧分组，再做两类判定：`ORPHAN`（某动物的贴图画到了非它家的格心）与 `ZINVERT`（同帧后画的贴图属于更低层且与先画的重叠）。

复跑两次结果一致：

```
=== ORPHAN: 0 次 ===
=== ZINVERT: 6~7 次 ===
  上层牌 #0 (z1 r1c1 bid8) 被下层 #37 (z0 r1c1 bid0) 覆盖 15~16%  ×5  608~834ms
    下层绘制调用栈: drawBestiaryIcon < drawTileBody < drawAnim
```

- 15~16% 是**图标矩形**（0.82×cell）的重叠比；换成**卡牌矩形**（69.29px，层间错位 0.5×cell=35.1px）重叠约 **50%**——正好是用户看到"半张牌换了动物"的量级。
- 调用栈 `… < drawTileBody < drawAnim` 把责任唯一地钉在**动画层**，而不是静态层排序（静态层 `renderList.sort` 的 z 序是对的）。
- 时间窗 552~863ms ≈ `gear` 动画 320ms + 采样误差，与"飞完又变回"一致（`FLY_MS=420` 亦在此窗口内）。

### Bug 2

A/B 隔离实验（`frames/dock-ab-*.png`，全部在 file:// 形态下）：

| 步骤 | 干预 | 结果 |
|---|---|---|
| 0 | 原始 | 内框可见 |
| 1 | 仅 `.slot .dock-icon { filter: none }` | **内框消失**（白底白卡不可见） |
| 2 | 仅 `mix-blend-mode: darken` | 内框消失，但切片近白区域被压到卡面白 |
| 3 | `filter:none + mix-blend-mode:darken` | 最干净 |
| 5 | 撤销全部 CSS，仅让 `ctx.globalCompositeOperation='darken'` 在 canvas 内直绘 | **内框仍在** |

步骤 5 是关键：**canvas 内部用 `darken` 无效**。因为 `darken` 是"源与背景逐通道取小"，而 `<canvas class="dock-icon">` 的背景是**透明**（alpha=0）——按规范背景透明处结果取源色，白底照旧画成不透明白。棋盘之所以有效，是因为它直接画在**已不透明的白卡面**上（`drawTileBody` 先 `fill` 了 `#FFFFFF`）。这解释了为什么"照搬棋盘的 darken 写法"到 dock 会失败（历史上很可能就是在这里踩空）。

## Suspected Code Paths

### Bug 1 — 动画层越过 z 序重绘整块卡体

- `src/core/RulesEngine.js:431-442` `cascadeOnFlyout()` 4a 分支——飞出牌同层十字相邻的齿轮牌 `d=(d+1)%4` 并 `events.push({e:'gear', id:g.id, from, to})`。实测本关 `gear id=37` 即由此产生。
- `src/render/BoardRenderer.js:1575-1577` `handleEvent` 的 `gear` 分支——`anims.push({kind:'gear', tileId:e.id, t0:now, dur:320})`。
- `src/render/BoardRenderer.js:1329-1335` 静态层：`renderList` 按 `z → r → c` 升序绘制（**此段排序本身正确**）。
- `src/render/BoardRenderer.js:1339-1350` 动画层：**在整张静态层之后**统一绘制 `anims`，不做任何 z 交错。← **根因位置 A**
- `src/render/BoardRenderer.js:1466-1474` `drawAnim` 的 `gear` 分支：
  - `:1469` `drawTileBody(ctx, cell, (t.c+0.5)*cell, (t.r+0.5)*cell, t, 1+0.12*gp, 1, now)` —— **把 z=0 齿轮牌的整块卡体重画一遍**；
  - `:1470-1474` `ctx.arc(...+cell*0.34, ...-cell*0.34, cell*0.14*(1+gp))` 金色脉冲圆环（即用户所说"右上角闪烁圆圈"）。
- `src/render/BoardRenderer.js:1618-1621` `refresh()` 内 `tileInfo[t.id] = { id, r, c, s, d, z, stackDepth, m, ice }` —— **不含 `covered`**。← **根因位置 B**
- `src/render/BoardRenderer.js:616-623` `drawTileBody` 的压暗遮罩：`var covered = (t && t.covered === true)` 才叠 `rgba(15,23,42,0.28)`。动画层拿到的 `t` 来自 `tileById()`→`tileInfo`，`covered` 恒 `undefined` → **重绘出的是"没被压暗的亮牌"**（截图 before 的暗熊猫 → during 的亮熊猫）。
- `src/render/BoardRenderer.js:1532-1540` `tileById()` —— 动画层解析 `t` 的唯一入口（缓存优先）。
- `src/render/BoardRenderer.js:1458-1463` `drawAnim` 的 `block` 分支、`:1475-1482` 的 `unlock` 分支——**同一家族缺陷**：也用 `(t.c+0.5)*cell / (t.r+0.5)*cell`（**逻辑坐标**）而非 `getTileCssRect()` 的 `rr/cc`（**渲染坐标**）。对奇数层（z=1/3）整卡错位半格。

### Bug 2 — 切片白底 + drop-shadow 描边

- `src/render/BoardRenderer.js:206-345` `whiteKeySlice()`：`maskRounded()` 只把**四角**清成透明，中间仍是**不透明白底**；`:236-249` 与 `:281-310` 的 `getImageData` 在 file:// 跨源污染下抛错 → `keyingOk=false`，白底**原样保留**。
- `src/render/BoardRenderer.js:347-359` `maskRounded()`：`destination-in` 圆角矩形 → 得到的是**圆角方形的 alpha 轮廓**。
- `src/render/BoardRenderer.js:641-648` 棋盘侧 `drawBestiaryIcon()`：`if (noKeyS) { ctx.save(); ctx.globalCompositeOperation = 'darken'; }` → 白底"隐形"。
- `src/render/BoardRenderer.js:1728-1757` `chipSVG()`：file:// 下 `dockIconDataURL()` 返回 `null`（`toDataURL` 抛 SecurityError）→ 输出 `<canvas class="dock-icon" data-bid>`。
- `src/render/BoardRenderer.js:1802-1827` `paintDockIcons()`：`:1823` `c2.drawImage(slice, 0, 0, px, px)` —— **没有 darken，也没有先铺白底**，与棋盘路径的差异正在这里。
- `css/style.css:440-453` `.slot .dock-chip`：44px 白卡（`background:#FFFFFF`）。
- `css/style.css:466-479` `.slot .dock-icon`：`:466` `width/height:78%`（内缩 5px，让方框有"内嵌"感）+ `:472` `filter: drop-shadow(0 2px 3px rgba(15,23,42,.38))` ← **直接画出方框的一行**。注意 `:455-465` 的"去内框"分组只清了 `border/outline/box-shadow/background`，**没清 `filter`**，所以 472 行的阴影照样生效。
- `css/style.css:342-362` `#dock`：深色半透明磨砂（`rgba(30,41,59,0.55)` + `backdrop-filter: blur(10px)`）——**本次修复不得触碰**。

## Root Cause Hypothesis

**Bug 1（置信度：高，已实测）**
`draw()` 把画面分两段：先按 `z` 升序画完整张静态层，再把 `anims` **整体**画在静态层之上。`gear`（以及 `unlock`/`block`）动画却会调用 `drawTileBody()` 重绘**整块卡体**，而不是只画特效。于是当被联动的齿轮牌处于**低层**（本作 590 张齿轮牌全部 `z=0`）、而它所在格心又被**更高层**卡牌压角覆盖（奇数层半格错位，重叠 50%）时，低层卡体就被画到了高层卡牌身上——层次反转。雪上加霜的是 `tileInfo` 缓存不带 `covered`，重绘出来的是一张**没有压暗的亮牌**，与周边被压暗的牌反差极大，视觉上就像"整张牌换了"。320ms 后动画出栈，静态层重画，画面复原。用户描述的"黑色大嘴鸟 → 红色鲸鱼 + 右上角闪烁圆圈"完全对应：黑色 = `covered` 压暗态，红色鲸鱼 = 该格 z=0 齿轮牌（另一花色），闪烁圆圈 = `:1470` 的金色脉冲环。

**Bug 2（置信度：高，已实测）**
同一条"棋盘能、dock 不能"的分叉：棋盘把不透明白底用 `darken` 融进白卡面；dock 的 `<canvas class="dock-icon">` 是**透明背景**直绘，`darken` 无效（A/B 步骤 5 已证），白底照旧存在；而 CSS 又给这个 canvas 加了 `drop-shadow`，阴影严格按 canvas 的 **alpha 轮廓**（= `maskRounded` 造出的圆角方块）投射，于是白卡内部出现一圈 78% 尺寸、圆角、灰蓝色的"内嵌小方框"。http 形态下 keying 成功、轮廓变成动物本体 → 阴影贴合动物 → 看不见该缺陷。

**附带发现（同一根因家族，建议同批修）**
`drawAnim` 的 `block`/`gear`/`unlock`/`ice` 分支一律用逻辑坐标 `(t.c+0.5)*cell`，而静态层用 `getTileCssRect()` 的 `rr/cc`（奇数层 +0.5）。因此 z=1 的牌在**受阻弹回**时会整卡跳半格再弹回（实测扫描在 L4/L5 捕捉到"点击格自身瞬时变样后复原"，峰值偏差 maxD=57~78）。当前齿轮全在 z=0 故未暴露，但一旦关卡数据把齿轮放到奇数层就会立刻显形。
另：`removeFromBoard()`（`RulesEngine.js:562-575`）返回 `cell[cell.length-1]`，而 72 关数据中**不存在重复 `(z,r,c)`**（实测 0 例），故 `revealed` 恒为 `null`，`reveal` 上浮动画实际是**死代码**——修复时不要把责任推给它。

## Proposed Remediation

### Bug 1（首选：动画层只画"特效"，不画"卡体"）

1. **`drawAnim` 的 `gear` 分支（:1466-1474）删除 `drawTileBody` 调用**，只保留金色脉冲环。理由：齿轮联动的唯一语义变化是 `d`（方向），而 `refresh()` 后的 `lastProbe` 已把新方向交给静态层，静态层那张牌本来就是最新的；再画一遍卡体纯属多余。
2. **`unlock` 分支（:1475-1482）同样删除 `drawTileBody`**，只保留金色描边闪光。
3. **`block` 分支**不能简单删除（`:1316` 的 `blockSet` 会让静态层跳过它，删了牌就消失）。建议改为**把抖动位移下放到静态层**：`draw()` 静态循环前先算出 `blockDx[tileId]`，`drawBoardTile()` 取用并加到 `px` 上，然后从 `drawAnim` 中移除 `block` 分支与 `blockSet` 过滤。这样弹回动画天然遵守 z 序。
4. **所有动画坐标统一走 `getTileCssRect(t, layout)`**（`rr/cc` + `cellStep`），彻底消除"逻辑坐标 vs 渲染坐标"的双口径；`fly` 分支的起点也要用 `rr/cc`，否则 z=1 的牌起飞瞬间会跳半格。
5. **`tileInfo` 补 `covered`**（:1618-1621 增加 `covered: t.covered === true`），保证任何残留的卡体重绘都保持压暗态（防御性，配合 1~3 后应无实际调用者）。

> 关键不变量：**同一帧内，任何 z 更大的卡牌都必须画在任何 z 更小的卡牌之后**。静态层已满足；修复后动画层不再产生卡体，故整体满足。

**备选**：保留卡体重绘，但把动画层改为"按 z 插入静态层之间"（构建一个 `{z, drawFn}` 合并队列后统一排序）。改动面更大、回归风险更高，仅在确实需要"动画期间卡体变形"时采用。

### Bug 2（首选：只改 dock 的图标层，托盘一动不动）

1. **`css/style.css:472` 删除 `filter: drop-shadow(...)`**（这是画出方框的那一行）。若希望 keying 成功时保留一点投影，可改为仅在 `#dock.keying-ok` 下生效。
2. **新增"无键控"降级规则**（仅在 file:// 生效，避免影响 http 形态的近白像素）：
   ```css
   #dock.no-keying .slot .dock-icon { mix-blend-mode: darken; }
   ```
   在 `main.js renderDock()`（:958-975）或 `paintDockIcons()` 内按 `STM.IconAssets.keyingAvailable()` 给 `#dock` 增删 `no-keying` 类。
3. **不要**在 `paintDockIcons()` 里用 `ctx.globalCompositeOperation='darken'`（实测无效，见 A/B 步骤 5）。若坚持走 canvas 路线，必须先 `fillStyle='#FFFFFF'; fillRect(...)` 铺满白底再 `darken` 直绘——但那等于把卡片底板搬进 canvas，与 `.dock-chip` 的 CSS 白卡重复，不推荐。
4. **`#dock` 托盘样式（:342-362）保持原样**：深色半透明 + `backdrop-filter` 一行都不改。

**备选**：在 file:// 下把切片预先"合成为白底卡面"（canvas 内先铺白再 darken），再以 `<img>` 输出。可行但多一层合成，且仍要去掉 CSS `filter`，收益不大。

### Files likely to change

- `src/render/BoardRenderer.js`（`draw()`、`drawAnim()`、`drawBoardTile()`、`refresh()/tileInfo`、`paintDockIcons()`）
- `css/style.css`（`.slot .dock-icon` 的 `filter`；新增 `#dock.no-keying` 规则；**`#dock` 本身不改**）
- `src/main.js`（`renderDock()` 内同步 `no-keying` 类，可选）

### Tests to add or update

- `tools/render-selftest.js`：新增不变量断言——构造"低层齿轮 + 高层压角牌"的关卡快照，跑一帧含 `gear` 动画的 `draw()`，断言**不存在** z 序反转（可用 `drawImage` 钩子，或把 `drawTileBody` 的调用参数记录成可断言的轨迹）。
- 新增像素回归：`file://` 下 dock 有牌槽的图标区域，断言其**内部 3~5px 内缩环带**与卡片中心白底同色（无灰蓝描边），同时断言 `#dock` 的 computed `background-color` 仍为 `rgba(30,41,59,0.55)`。
- 现有 `tools/verify-fix.cjs` 增加双形态（file:// / http）并行的 dock 截图对比。

## Risks & Considerations

- 删除 `gear`/`unlock` 的卡体重绘后，这两个动画只剩"环/描边"特效。若美术上确实需要"牌体轻微放大回弹"，必须改为在静态层施加缩放（类似 `block` 的处理），否则会丢失动感——**这是本修复唯一的表现层取舍，需要试玩确认**。
- `mix-blend-mode` 会创建层叠上下文；`#dock` 有 `backdrop-filter`，需在真机（尤其 iOS Safari）复核一次，确认不会让托盘磨砂失效。
- `no-keying` 只在 `keyingAvailable()===false` 时挂上，但该标志是**全局**的（首张切片 `getImageData` 失败即置 false）。若将来改为逐切片判定，需要同步该类名的判定口径。
- 72 关全部 590 张齿轮牌都在 z=0；本次修复不改变关卡数据，`levels.js` 无需重跑 `generator/solver`（符合 FR-031 的"仅表现层变更"边界）。
- 无 lint/type-check，回归依赖 `node tools/render-selftest.js` 与双形态截图。

## Open Questions

- [NEEDS CLARIFICATION: `gear` 动画是否必须保留"牌体放大回弹"？若必须，修复需改为静态层缩放（工作量略增，但可保住动感）。]
- [NEEDS CLARIFICATION: 真机（iOS Safari / 微信内置浏览器）上 `mix-blend-mode: darken` 与 `backdrop-filter` 共存是否需要降级方案（例如 file:// 场景直接改用"铺白 + darken"的 canvas 合成）。]
