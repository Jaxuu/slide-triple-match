# Bug Verification: 局内 9 项渲染 / 交互 / UI 缺陷（点击坐标分裂、错位灰黑遮罩、卡牌留白、顶栏与待消槽样式）

- **Slug**: ingame-hud-render-defects
- **Tested**: 2026-10-23
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: **verified**

## Summary

评估期记录的 9 项缺陷在修复后均不再复现。核心的点击错位（Bug 1）由新增的穷举几何工具 `tools/hit-geometry.js` 端到端证伪：**72 关 × dpr {2,3} × CSS 盒宽 {1.00, 0.95, 1.05} = 432 个关卡实例、39,438 张牌实例、238,992 条断言全部通过**，其中 **11,586 次「取绘制中心点 → hitTest」100% 返回该牌自身 id**；真实浏览器（`file://` / `http://` 双形态、dpr=1）Level 12 的 33 张可点牌同样 `miss=[] / wrong=[]`。UI 侧顶栏、待消槽、棱晶图标、棋盘外框、1px 紧贴与 84% 图标均通过计算样式/几何/DOM 断言与截图人工复核；渲染、引擎、尺寸稳定性、大厅经济链路全量回归零红。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Syntax — BoardRenderer / main / prism-icon / lobby | `node -c <file>` ×4 | pass | 4 个改动文件均无语法错误 |
| **Bug 1** — 全关卡点击几何穷举 | `node tools/hit-geometry.js` | **pass** | 432 实例 / 39,438 牌 / 238,992 断言；中心 11,586 次全中自身，`0` 失败 |
| **Bug 1** — 真实浏览器 Level 12（file://） | `node tools/verify-fix.cjs` | **pass** | `tested=33, miss=[], wrong=[], domProbeId=56→56, outside=-1` |
| **Bug 1** — 真实浏览器 Level 12（http://） | `node tools/verify-fix.cjs` | **pass** | 同上；像素可采样形态下网格结构断言 `aspectMatch/cellExact/cornerClean=true` |
| **Bug 1 / 2 / 3** — 1px 紧贴 / 无遮罩灰块 / 无内缩白边 / 84% 图标 | `node tools/render-selftest.js`（场景 I） | **pass** | T084 四项 + 本次新增「84% 图标」「drawTileBody 内零 strokeRect」两项，共 208 项全绿 |
| **Bug 1** — 真实点击链路（非合成 hitTest） | `node tools/board-stability.js` | **pass** | L12 连点 20 步，dock 数量 0→2→1→0→2 真实增减；#board/cellSize 误差 **0px** |
| **Bug 2 / 8** — 棋盘无外框 / 卡牌无伪影 | `node tools/ingame-shots.js` + 截图 | **pass** | `#board` border 0 / outline none / 背景透明；L12 截图无灰黑块、无白框 |
| **Bug 2** — 错位灰黑遮罩与点阵底纹已删除 | `node tools/render-selftest.js`（T084） | **pass** | 源码级：`0.32` 变暗遮罩 / `aboveN` 层间灰影 / `dotR` 点阵 / `layerOff` 漂移均不存在 |
| **Bug 5 / 6 / 7** — 顶栏形态 | `node tools/ingame-shots.js` | **pass** | 左侧 2 枚 42×42 纯图标圆钮（零文字、白色 SVG）；中央仅 `IQ: 90`；单行高度 ≤70px；`♥` 计数 -1；`#iq-bar` 不存在 |
| **Bug 9** — 棱晶图标与大厅同源 | `node tools/ingame-shots.js` + `render-selftest` | **pass** | 局内 `#hud-shards` 的 polygon points/fill/opacity 签名与 `STM.PrismIcon.html()` 完全一致（7 面、6 色，零 Emoji） |
| **Bug 4** — 待消槽去木纹 | `node tools/ingame-shots.js` | **pass** | `#dock` background-image `none`、底色 `rgba(30,41,59,.45)`、2px 浅银边框；槽数 7、槽底 `rgba(15,23,42,.42)`、圆角 9px |
| Render regression | `node tools/render-selftest.js` | pass | 场景 A~J 共 **208/208** 全绿，0 失败 |
| Engine regression | `node tools/solver.js --engine-selftest` | pass | **15/15**，引擎零漂移（未改引擎） |
| Lobby / economy regression | `node tools/lobby-smoke.js` | pass | **83 passed / 0 failed**，含棱晶购买闭环 N0~N11 |
| Board size stability | `node tools/board-stability.js` | pass | 双形态 × 21 采样点，#board 宽 / cellSize 误差 **0px** |
| Visual confirmation | 刷新 `./after/` 9 张截图并人工复核 | pass | 顶栏 / 待消槽 / L1~L3 / L12 实机截图；无灰块、无白框、无木纹、无文字按钮 |
| Lint / type-check | — | not-run | 项目为纯 vanilla JS，无 lint / type-check 配置（与既有 test.md 口径一致） |

## Output Excerpts

**`node tools/hit-geometry.js`（本次新增，Bug 1 穷举防线）**
```
hit-geometry: dpr 2/3 × CSS 盒 1.00/0.95/1.05 × 全关卡
  关卡实例 432 · 牌实例 39438 · 断言 238992
  中心命中 11586 · 牌内 104274 · 边缘 92688 · 画布外 2592 · 被压牌 27852
  ✓ ALL GREEN — 每一张可点击牌的中心点都精确返回自身 id
```

**`node tools/verify-fix.cjs`（file:// 与 http:// 双形态，关键行）**
```
hitTest: {"n":8,"tested":33,"miss":[],"wrong":[],"domProbeId":56,"domProbeGot":56,"outside":-1}
✓ Bug 1: 每张未被压卡牌的可视中心都能命中（无「点了没反应」）
✓ Bug 1: 命中结果包含点击点（100% 落在被点卡牌的矩形内）
✓ Bug 1: DOM 盒宽直接换算的 z=0 牌中心可命中
✓ Bug 1: 棋盘外点击返回 -1
...
验证结果: ALL GREEN
```

**`node tools/render-selftest.js`（场景 I 节选）**
```
✓ T084: 同层间距 GAP ≥ 1px
✓ T084: 牌宽 = cellStep - 1（同层 1px 细缝紧贴）
✓ T084: 奇数层半格坐标 +0.5（压 2×2 交界）
✓ T084: 变暗遮罩 / 层间灰影块 / 点阵底纹已彻底移除
✓ T084: 动物图标 iconSize = tileSize × 0.84（居中铺满）
✓ T084: 卡牌内无内缩白描边（drawTileBody 内零 strokeRect）
✓ T085: 顶栏中央为极简 IQ（无 `关卡` 文本 / 无 /72 / 无标题节点）
✓ T085: 顶栏左侧为无文字纯图标键（.hud-round-cap 已删除）
✓ T085: 棱晶图标单一来源（大厅 / 局内共用 STM.PrismIcon）
✓ T085: 棋盘无外框线（#board border:none）
✓ T085: 待消槽为简约托盘（无木纹 / 无槽内横线）
场景 J: 点击几何（绘制 / 命中同源）—— 9 项全绿

render-selftest: all green
```

**`node tools/ingame-shots.js`（本轮新增的 6 条验收断言）**
```
✓ 顶栏左 = 2 个纯图标 Q 弹圆钮（42×42 / 零文字 / 白色 SVG）
✓ 顶栏单行（高度 ≤ 70px）且三颗心 ♥ 已彻底删除
✓ 棱晶图标与大厅同源（STM.PrismIcon 多面体 + 渐变分面）
✓ 棋盘无外框（border 0 / outline none / 背景透明）
✓ 同层卡牌紧密贴合（cellStep − tileSize = 1px）
✓ 待消槽 = 浅银外框 + 7 个深色半透明圆角槽（无棕色木纹）
ingame-shots: all green（布局/教学/IQ/道具/溢出）
```

**`node tools/board-stability.js` / `node tools/lobby-smoke.js`**
```
✓ file:// 第 0→20 步 #board width 误差 = 0px
✓ file:// 第 0→20 步 cellSize 误差 = 0px
board-stability: all green（双形态 × 21 采样点误差均 0px）

[lobby-smoke] 结果: 83 passed, 0 failed
```

## 评估期基线对照（修复前 → 修复后）

| 指标 | 修复前（assessment 实测 / 源码） | 修复后（本次实测） |
|------|----------------------------------|--------------------|
| 点击坐标基准 | 绘制 `cell = boardPx / n`（位图像素），命中再按 `(boardPx/dpr)/rect.width` 归一 → 半格偏移 | 绘制/命中/教学锚点共用 `getTileCssRect`（CSS 像素）；11,586 次中心命中 **100% 自身** |
| 同层卡牌间距 | 约 16% 背景缝（`tileSize = cell`） | **1px**（`tileSize = cellStep - 1`） |
| 卡面内框 | 内缩白描边 + 72% 级别图案留白 | `drawTileBody` 内 **0 次 strokeRect**；图标 **0.84 × tileSize** 居中铺满 |
| 被压变暗 / 层间灰影 / 点阵底纹 | 三套伪影叠加，偏移 0.42~0.7 cell | **全部删除**，层次只靠卡牌自身柔和投影 |
| 棋盘外框 | 1px 白描边 | `border: none` / `outline: none` / 背景透明 |
| 顶栏 | `关卡 12` + 第二行 IQ + `♥♥♥ 30 x1` + 按钮内「大厅/设置」文字 | 2 枚 42×42 纯图标圆钮 + 中央 `IQ: 90` + 右侧棱晶胶囊；**单行** |
| 待消槽 | 棕色竖木纹 + 金属厚度边 + 槽内白横线 | 浅银圆角外框 + **7 个** `rgba(15,23,42,.42)` 深色半透明方槽 |
| 棱晶图标 | 蓝色 `💎` Emoji | 大厅同款 **7 面 6 色 SVG**（`STM.PrismIcon` 单一来源） |
| 命中回归 | — | L12 双形态 `tested=33, miss=0, wrong=0`；72 关穷举 `238,992` 断言 0 失败 |

## Residual Risks

- **dpr 覆盖为 1 / 2 / 3**：Node 穷举覆盖 dpr 2 与 3，真实浏览器覆盖 dpr=1（`verify-fix`）与 dpr=2（`ingame-shots --force-device-scale-factor=2`）；**1.25 / 1.5 / 2.75 等小数 dpr 未单独实测**。几何全部走 CSS 像素 + `setTransform(dpr,…)`，理论上与 dpr 解耦，但小数 dpr 的 0.5px 舍入仍建议真机抽查。
- **`hit-geometry` 的 CSS 盒变体是模拟值**：Node 内通过改变 `getBoundingClientRect()` 宽高/偏移模拟 `0.95×/1.05×` 盒宽，不能覆盖真实移动端安全区、页面缩放与滚动容器；真实 DOM 盒仅对 L12 做了 33 点验证。
- **`file://` 像素污染**：画布 `getImageData` 必抛 `SecurityError`，因此 Bug 2（灰黑块）/ Bug 3（内框）在该形态下只能以源码断言 + 截图人工复核证明，未做像素级 diff；`http://` 形态已做结构级像素采样。
- **`#board` 仍保留柔和投影**：`box-shadow: 0 8px 22px rgba(15,23,42,.18)` 属卡牌悬浮氛围，不是白框线；若产品对 Bug 8 的「no box-shadow」作字面要求，需再收一刀（不影响「无外围细白边框」的验收）。
- **失败页 / 结算页仍用 `💎`**：`fail.js` 的 `💎 100 棱晶复活`、`result.js` 的飞入棱晶、`lobby.js` 的 `💎 ×150` 预览未纳入本轮 9 项范围（assessment 已将其列为 Open Question）。局内顶栏与道具购买角标已 100% 无 Emoji。
- **生命反馈缺口**：`damageOnBlock` 自第 2 章起为 true，但 HUD 已无 `♥`；扣命仍发生却无视觉反馈（FR-003 风险，fix.md 已登记）。本轮按「彻底删除三颗心」执行，未加条件生命角标。
- **无 lint / type-check**：纯 vanilla JS 项目，静态检查仅 `node -c`。
- **截图体积**：`./after/` 9 张 + 修复前 1 张约 12MB 一并入库（用户要求 `git add .`），仓库体积会一次性增大。

## Recommendation

**关闭该 bug —— 端到端验证通过。** 评估期的两条核心复现路径均已在真实浏览器执行：① Level 12 逐张点击（33 张可点牌中心 100% 命中自身、越界返回 -1，另经 20 步真实连点证明 dock 真实增减）；② 顶栏 / 待消槽 / 棋盘 / 棱晶的实机截图人工复核。几何层新增的 72 关穷举（238,992 条断言）把「点上面没反应 / 点右下角飞出上面小鸡」锁成常驻回归防线；渲染、引擎、尺寸稳定性、大厅经济链路全绿，无回归。遗留项（小数 dpr、失败页 Emoji 收口、条件生命角标、spec FR-044/FR-047 冲突）均为独立跟进事项，不阻塞关闭。
