# Bug Fix: 飞出瞬间相邻卡牌"变身"（动画层越过 z 序重绘卡体） + 待消区卡牌内嵌小方框（切片白底 + drop-shadow 描出方框）

- **Slug**: flight-neighbor-morph-dock-inset
- **Fixed**: 2026-10-25
- **Assessment**: ./assessment.md
- **Verification**: ./test.md — `Result: verified`（2026-10-25）
- **Status**: verified

## Summary

`draw()` 的动画层整体叠在静态层之后且不做 z 交错，而 `drawAnim` 的 `gear`/`unlock` 分支会调用
`drawTileBody()` 重绘**整块卡体**——低层齿轮牌因此盖住压在其格心上的高层牌，加上 `tileInfo`
缓存缺 `covered` 而重绘成"未压暗的亮牌"，观感就是"未点击的相邻卡牌瞬间变成另一张"。
本次把动画层彻底收敛为**只画特效、不画卡体**，受阻微震下放到静态层按 z 序施加，
并给 `tileInfo` 补上 `covered` 防御位。
Bug 2 则是 `css/style.css` 给 `.slot .dock-icon` 加了 `filter: drop-shadow(...)`，
阴影严格按切片 alpha 轮廓（file:// 下是不透明圆角方块）投射，于是白卡内多出一圈灰蓝内嵌方框；
现删除该行、把投影只留给 keying 成功的 `<img>`，并在 file:// 下用 `mix-blend-mode: darken`
把切片白底融进白卡面。**`#dock` 托盘样式一行未改。**

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | `drawAnim` 的 `gear`/`unlock` 分支删除 `drawTileBody`；`block` 分支整体移出动画层；动画坐标统一 `getTileCssRect()`；`tileInfo` 补 `covered`；`paintDockIcons` 同步 `no-keying` 类 |
| `css/style.css` | modified | 删除 `.slot .dock-icon` 的 `filter`；新增 `.slot img.dock-icon` 投影；新增 `#dock.no-keying .slot canvas.dock-icon { mix-blend-mode: darken }` |
| `tools/render-selftest.js` | added test | 新增 `scenarioAnimLayerZOrder()`（场景 K，15 条断言） |
| `.specify/bugs/.../probes/bug-dock-multi.js` | added | 新增多槽位 dock 取证脚本（5 个 chip 并排验证） |

> 未改动：`src/core/RulesEngine.js`、`src/data/levels.js`、`src/main.js`。
> 关卡数据与逻辑层零改动（符合 FR-031「仅表现层变更」边界）。

## Diff Highlights

### Bug 1 — 动画层只画特效（`drawAnim`）

```diff
       } else if (a.kind === 'gear') {
-        /* T034 齿轮旋转脉冲: 牌体原地放大回弹 + 角标区高亮圈 */
+        /* T034 齿轮旋转脉冲：**只画角标区高亮环，绝不重绘卡体**。 */
         var gp = prog < 0.5 ? prog / 0.5 : (1 - (prog - 0.5) / 0.5);
-        drawTileBody(ctx, cell, (t.c + 0.5) * cell, (t.r + 0.5) * cell, t, 1 + 0.12 * gp, 1, now);
+        var gr = getTileCssRect(t, layout);
+        var gcx = gr.x + gr.w / 2;
+        var gcy = gr.y + gr.h / 2;
         ctx.beginPath();
-        ctx.arc((t.c + 0.5) * cell + cell * 0.34, (t.r + 0.5) * cell - cell * 0.34, cell * 0.14 * (1 + gp), 0, Math.PI * 2);
+        ctx.arc(gcx + cell * 0.34, gcy - cell * 0.34, cell * 0.14 * (1 + gp), 0, Math.PI * 2);
```

`unlock` 分支同款处理（删 `drawTileBody`，描边改走 `getTileCssRect`）。

### Bug 1 — 受阻微震下放静态层

```diff
-      var blockSet = {};
-      for (i = 0; i < anims.length; i++) if (anims[i].kind === 'block') blockSet[anims[i].tileId] = true;
+      blockDx = {};
+      for (i = 0; i < anims.length; i++) {
+        var ab = anims[i];
+        if (ab.kind !== 'block') continue;
+        var bp = Math.min(1, (now - ab.t0) / ab.dur);
+        blockDx[ab.tileId] = Math.sin(bp * Math.PI * 6) * 3 * (1 - bp);
+      }
...
       for (i = 0; i < renderList.length; i++) {
-        if (blockSet[renderList[i].id]) continue;
...
     function drawBoardTile(t, now) {
       var rect = getTileCssRect(t, layout);
-      var px = rect.x + rect.w / 2;
+      var px = rect.x + rect.w / 2 + (blockDx[t.id] || 0);
```

动画层循环同时显式跳过 `block`：`if (a2.kind === 'reveal' || a2.kind === 'fly' || a2.kind === 'block') continue;`

### Bug 2 — 删掉画方框的那一行

```diff
 .slot .dock-icon {
   ...
-  filter: drop-shadow(0 2px 3px rgba(15, 23, 42, .38));
+  /* 此处**严禁**加 filter（file:// 下 alpha 轮廓是不透明圆角方块） */
 }
+/* keying 成功 → 切片 alpha 轮廓就是动物本体，投影贴合 */
+.slot img.dock-icon {
+  filter: drop-shadow(0 2px 3px rgba(15, 23, 42, .38));
+}
+/* keying 失败（file://）→ 用 darken 把切片纯白融进 .dock-chip 白卡面 */
+#dock.no-keying .slot canvas.dock-icon {
+  mix-blend-mode: darken;
+}
```

`paintDockIcons()` 内按 `IconAssets.keyingAvailable()` 给 `#dock` 增删 `no-keying` 类。

## Tests Added or Updated

`tools/render-selftest.js` 新增场景 K `scenarioAnimLayerZOrder()`，15 条断言：

| 断言 | 钉住什么 |
|------|----------|
| `Bug1: gear 分支不再重绘卡体` | `drawAnim` 的 gear 分支内零 `drawTileBody` |
| `Bug1: unlock 分支不再重绘卡体` | 同上（unlock） |
| `Bug1: block 分支已移出动画层` | `drawAnim` 中不再存在 block 分支 |
| `Bug1: 动画层循环显式跳过 block` | 动画层不会重复绘制受阻牌 |
| `Bug1: 静态层施加受阻微震位移` | `blockDx[t.id]` 确实被 `drawBoardTile` 取用 |
| `Bug1: 动画坐标改走 getTileCssRect` | 无 `(t.c + 0.5) * cell` 逻辑坐标直乘卡体 |
| `Bug1: tileInfo 补 covered` | 缓存带上压暗态（防御位） |
| `Bug1(行为): 关卡含「低层齿轮 + 高层压角」` | 行为用例的前置条件真实成立（z=0 且 covered） |
| `Bug1(行为): gear 动画全程零 z 序反转` | **真实跑 20 帧**，记录 `drawImage` 轨迹，逐帧判定高层牌是否被低层牌覆盖 >8% |
| `Bug1(行为): block 微震仍产生水平位移` | 防「下放到静态层后静默失去动感」的表现层回归 |
| `Bug2: .slot .dock-icon 不再带 filter` | 画方框的元凶不得回归 |
| `Bug2: 投影只给 img.dock-icon` | keying 成功时仍保留贴合动物轮廓的投影 |
| `Bug2: #dock.no-keying 用 darken` | file:// 降级规则存在且只作用于 canvas 直绘形态 |
| `Bug2: #dock 托盘仍为深色半透明磨砂` | 断言 `rgba(30,41,59,0.55)` + `backdrop-filter: blur(10px)`（**用户硬约束**） |
| `Bug2: paintDockIcons 同步 no-keying 类` | 类名增删成对存在 |

## Local Verification

### 单元/集成自测

- `node tools/render-selftest.js` → **场景 K 15/15 全绿**；
  总失败项仍为 **11 项**，与改动前**逐条一致**（见下「既有失败基线」）。
- `node tools/playthrough.js` → `23 passed, 1 failed`；失败项 `⑥d 板面成组消除 — 18 -> 18`。
  **已用 `git stash` 把本次三个改动文件全部暂存后复跑，结果完全一致（23 passed, 1 failed）**
  → 属既有失败，与本次修复无关。

### 既有失败基线（改动前后完全相同，未新增回归）

1. 图鉴总量 45 种 / 三阶段各 15 种 / Δ16a 阶段边界 / 72 关图案落池 / L21 图案池
2. Emoji 码点表 45 条 / sheet 切片 15 格 / SHEETS 配置 3 张 × 15 格
3. Δ16d 开机动画总时长 / 开机背景渐变（3 条）

> 这些失败源于测试仍按「3 张图集 × 15 格 / 45 图鉴」断言，而 `SHEETS` 已扩展为 6 张 × 16 格、
> 图鉴已扩到 90 种；属测试与数据脱节，非本次修复引入。

### 逐帧取证（Bug 1）

- `node .specify/bugs/flight-neighbor-morph-dock-inset/probes/bug-instrument2.js 11 r0c1`
  - **修复前**：`ZINVERT: 6~7 次`（上层牌 #0 z1 被下层 #37 z0 覆盖 15~16%，调用栈 `drawBestiaryIcon < drawTileBody < drawAnim`）
  - **修复后**：`ORPHAN: 0 次` / `ZINVERT: 0 次`（11 帧采样，事件链仍为 `gear id=37` + `flyout id=17`）
- `node .../probes/bug-zoom.js 11 r0c1` → 三态放大截图（`frames/L11-zoom-before/during130/during260/after.png`）
  - `r1c1` 的 z=0 熊猫牌**全程保持被压暗**，上层狐狸牌**全程压在其上**；
  - 飞行期间只多出一个金色脉冲环（`gear` 特效），**卡体与动物图案零变化**；
  - `during260` 与 `after` 画面完全一致。

### 双形态 dock 取证（Bug 2）

`file://`（等价用户双击运行，`keyingAvailable() === false`）：

| 脚本 | 结果 |
|------|------|
| `probes/bug-dock.js 3` | `icon.filter = none`、`icon.blend = darken`、`#dock` bg 仍为 `rgba(30,41,59,0.55)` + `blur(10px)`；截图内框消失 |
| `probes/bug-dock-multi.js 3 5` | 5 个 chip 并排（花色 s6/s2/s0/s8/s5，`dock.length = 5`），全部 `filter:none` / `blend:darken`，截图 **5 张白卡均为「圆角纯白底座 + 居中动物」，零内嵌方框**，空槽仍为深色 |

`http://`（`keyingAvailable() === true`）：

- `probes/bug-zoom.js 11 r0c1` → `frames/L11-dock-zoom.png`：chip 为 `<img>`，投影贴合动物本体，无方框。

**用户硬约束复核**：`#dock` 的 `background: rgba(30, 41, 59, 0.55)`、`backdrop-filter: blur(10px)`、
`border` / `box-shadow` / `border-radius` 一行未改；`.slot` 空槽样式亦未触碰（多槽位截图可见深色空槽）。

## Deviations from Assessment

1. **`block` 抖动改为静态层施加，而非仅"移到静态层循环"**
   评估建议"算出 `blockDx[tileId]`，`drawBoardTile()` 取用并加到 `px` 上"——已照此实现。
   实现细节上把位移表做成模块级 `blockDx`（每次 `draw()` 重建），避免把参数穿透到
   `drawBoardTile` 的签名里（该函数仅一个调用点，改动面最小）。

2. **`#dock.no-keying` 的 CSS 选择器收窄为 `canvas.dock-icon`**
   评估原文写 `.dock-icon`。实测发现若选择器覆盖 `<img>`，在极少数"类已挂上但 chip 仍是
   keying 成功产物"的时序下会给透明 PNG 也套 `darken`（浅色像素被轻微压暗）。
   收窄到 `canvas.dock-icon`（keying 失败时 `chipSVG` 的唯一出口）后语义精确、零副作用。

3. **额外修了 `ice` 分支的牌心坐标**
   评估把它列在"同一家族缺陷"里（附带领会），本次顺手改为 `getTileCssRect()`。
   属同批同类缺陷，不扩大范围（未动 `prism` 分支——棱镜是独立网格，与 `drawPrisms` 口径一致）。

4. **未按评估"可选"项改 `src/main.js`**
   `no-keying` 类改在 `paintDockIcons()` 内同步——该函数本来就由 `renderDock()` 在写完
   `innerHTML` 后调用，天然拿到 `#dock` 元素，无需再改 `main.js`。

5. **表现层取舍（评估已预告的唯一取舍）**
   `gear` 动画不再有"牌体放大回弹"，只剩金色脉冲环。已试玩确认动感可接受：
   齿轮方向变化本身由静态层的箭头角标即时呈现，脉冲环提供足够反馈。
   若后续美术要求回弹，需改为"静态层缩放"方案（评估 **Open Questions** 第 1 条）。

## Follow-ups

- **真机复核（评估 Risks 第 2 条）**：`mix-blend-mode: darken` 与 `#dock` 的 `backdrop-filter`
  在 iOS Safari / 微信内置浏览器上是否共存正常，需真机跑一次 file:// 或等价形态。
- **测试基线治理**：`render-selftest` 的 11 项既有失败（图鉴 45→90、SHEETS 3→6 张、
  splash 时长/背景色）与 `playthrough` 的 `⑥d 板面成组消除` 应单独立项修测试或修实现，
  否则会持续掩盖真实回归。
- **`reveal` 死代码**：评估附带发现 `removeFromBoard()` 恒返回 `null`（72 关无重复
  `(z,r,c)`），`reveal` 上浮动画实际永不触发。本次未动，建议后续单独清理或补关卡数据。
- 建议下一步：已完成 `/speckit.bug.test slug=flight-neighbor-morph-dock-inset` → 见 `./test.md`（`Result: verified`）。
