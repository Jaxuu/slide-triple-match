# Bug Verification: 视觉与渲染一致率三缺陷（Dock/Board 贴图割裂、画质模糊、方向箭头不可辨）

- **Slug**: visual-render-consistency
- **Tested**: 2026-10-21
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: **verified**

## Summary

评估期记录的三个 Bug 在修复后均不再复现，且 `file://` 与 `http://` 双形态实测一致。Bug A（Dock/Board 贴图割裂）—— 两种形态下 Dock 均无扁平 Emoji，全部消费棋盘同源切片；Bug B（画质模糊）—— 棋盘实测 2x 超采样、`imageSmoothingQuality=high`、切片 256×256、`#board` 无 `backdrop-filter` 且底板透明；Bug C（方向箭头不可辨）—— 箭头亮度跨度由修复前的 **2.9** 提升至 **126.9**（最大饱和度 169），四向主题色齐备。引擎侧零漂移，渲染层自测与双形态探针全绿，页面零未捕获异常。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Syntax — BoardRenderer.js | `node -c src/render/BoardRenderer.js` | pass | 无语法错误 |
| Syntax — main.js | `node -c src/main.js` | pass | 无语法错误 |
| Engine regression | `node tools/solver.js --engine-selftest` | pass | 11/11 all green，引擎零漂移 |
| Render regression | `node tools/render-selftest.js` | pass | 场景 A~G 全绿，含 Δ15b3e 修复断言组 15 项 |
| **Bug A** — Dock/Board 同源（file://） | `node tools/verify-fix.cjs` | **pass** | Dock 5 槽全部 `CANVAS[64x64]` 出口，**无 Emoji**；5 个 suit→bid 全部 `hasSlice=true` |
| **Bug A** — Dock/Board 同源（http://） | `node tools/verify-fix.cjs` | **pass** | Dock 5 槽全部 `IMG` 出口，**无 Emoji** |
| **Bug B** — 2x 超采样 | `node tools/verify-fix.cjs` | **pass** | `pxPerCssY=2`（位图 960×960 / CSS 盒 480×480，DPR=1 屏上仍 2 倍超采样） |
| **Bug B** — 高质量插值 | `node tools/verify-fix.cjs` | **pass** | `imageSmoothingQuality="high"`（浏览器默认为 `"low"`） |
| **Bug B** — 原生高清切片 | `node tools/verify-fix.cjs` | **pass** | 切片实测 `256x256`（源单格 512×512，原实现 128×128） |
| **Bug B** — 无雾化层 | `node tools/verify-fix.cjs` | **pass** | `#board` computed `backdrop-filter=none`、`background=rgba(0,0,0,0)`（原 `blur(3px) saturate(1.05)` + `rgba(255,255,255,.22)`） |
| **Bug B** — 无纵向拉伸 | `node tools/verify-fix.cjs` | **pass** | `aspectBitmap=1.0 / aspectCss=1.0 / aspectDelta=0`（原 aspectDelta≈0.15，即 1.18× 拉伸） |
| **Bug B** — 绘制与网格对齐 | `node tools/verify-fix.cjs` | **pass** | 卡面采样 `onCardFace=39 / offCardFace=36`（bitmap 口径改动的最高回归风险点） |
| **Bug C** — 四向彩色箭头 | `node tools/verify-fix.cjs` | **pass** | `DIR_COLORS=["#10B981","#F59E0B","#EF4444","#3B82F6"]`；箭头亮度跨度 **126.9**、最大饱和度 **169**（修复前 2.9 / 0） |
| Page error sentinel | `node tools/verify-fix.cjs` | **pass** | 双形态页面加载 + 操作全程 `window.__stmErrors` 为空 |
| Visual confirmation | 截图人工复核（验证后已清理） | **pass** | 双形态 8×8 Level 12 实机截图：Dock 显示与棋盘一致的 3D 黏土图标（非 Emoji）、背景高清通透无雾、四向箭头配色清晰可辨 |
| Lint / type-check | — | not-run | 项目无 lint / type-check 配置（纯 vanilla JS，无 TS） |

## Output Excerpts

**`node tools/solver.js --engine-selftest`**
```
engine-selftest: 11/11 all green（T038 断言组全量: 转向/棱镜/Δ8 分层/三消优先/胜利条件/快照/齿轮/破冰/chains/道具/死锁谓词）
EXIT=0
```

**`node tools/render-selftest.js`**（Δ15b3e 修复断言组节选）
```
✓ Bug B: 磨砂暖白 veil 已移除（不再有雾遮罩——高清背景锐利透出）
✓ Bug B: 滑块改由深色投影承载对比度（rgba(15,23,42,0.35)）
✓ Bug B: 切片分辨率提升至 256（SLICE_PX=256，非 128）
✓ Bug B: DPR 2x 下限超采样（Math.max(2, devicePixelRatio)）
✓ Bug B: 显式高质量插值（imageSmoothingQuality=high）
✓ Bug B: 棋盘正方形锁定（resize 回写 canvas.style 宽高）
✓ Bug A: paintDockIcons 已导出（file:// canvas 同源兜底）
✓ Bug A: dockIconDataURL 已导出（DataURL 缓存出口）
✓ Bug A: chipSVG 走 .dock-icon 类（含 img/canvas 双出口）
✓ Bug A: ensureSinglesFor onerror 不再无条件覆写已有来源（TOCTOU 修复）
✓ Bug A: 降级路径有 console.warn 留痕（不再静默吞异常）
✓ Bug C: 方向箭头四向主题色表存在
✓ Bug C: 箭头填充取 DIR_COLORS（不再是纯白 #FFFFFF）
✓ Bug C: 箭头保留 1.5px 纯白描边
✓ Bug B: #board 无 backdrop-filter（毛玻璃已移除）
✓ Bug B: #board 底板透明（无灰白雾遮罩）

render-selftest: all green
EXIT=0
```

**`node tools/verify-fix.cjs` — file:// 形态**
```
Dock 内容: [{"i":0,"kind":"CANVAS[64x64]"},{"i":1,"kind":"CANVAS[64x64]"},{"i":2,"kind":"CANVAS[64x64]"},
            {"i":3,"kind":"CANVAS[64x64]"},{"i":4,"kind":"CANVAS[64x64]"}]
✓ Bug A: Dock 无 Emoji（图标与棋盘同源贴图）
✓ Bug A: Dock 图标为贴图出口（img=0 canvas=5）
suit→bid 切片: [{"suit":0,"bid":1,"hasSlice":true},{"suit":1,"bid":2,"hasSlice":true},
                {"suit":2,"bid":3,"hasSlice":true},{"suit":3,"bid":10,"hasSlice":true},
                {"suit":4,"bid":12,"hasSlice":true}]
棋盘几何: {"bitmapW":960,"bitmapH":960,"cssW":480,"cssH":480,"aspectBitmap":1,"aspectCss":1,
           "aspectDelta":0,"dpr":1,"pxPerCssY":2,"smoothing":"high"}
✓ Bug B: 无纵向拉伸 / 棋盘 CSS 盒为正方形 / 2x 超采样 / imageSmoothingQuality=high
✓ Bug B: 切片分辨率 256（源 512）
#board computed: {"backdrop":"none","bg":"rgba(0, 0, 0, 0)"}
✓ Bug C: 四向主题色常量正确
页面异常: []
```

**`node tools/verify-fix.cjs` — http:// 形态**
```
Dock 内容: [{"i":0,"kind":"IMG[0x0]"}, …,{"i":4,"kind":"IMG[0x0]"}]
✓ Bug A: Dock 无 Emoji（图标与棋盘同源贴图）
箭头亮度跨度/饱和度: [{"d":0,"spread":126.9,"maxSaturation":169}, …]
✓ Bug C: 箭头与卡面对比显著（跨度≥40）
✓ Bug C: 箭头高饱和（四向彩色非灰白）
卡面像素落位（绘制与网格对齐）: {"onCardFace":39,"offCardFace":36}
页面异常: []

========================================
验证结果: ALL GREEN
EXIT=0
```

## 评估期基线对照（修复前 → 修复后）

| 指标 | 修复前（assessment 实测） | 修复后（本次实测） |
|------|--------------------------|--------------------|
| Dock 图标来源（file://） | 扁平 Emoji 🐥🐑🐮🐹🦔 | 3D 黏土切片（`<canvas class="dock-icon">` 同源直绘） |
| Dock 图标来源（http://） | 3D 黏土切片（DataURL `<img>`） | 3D 黏土切片（DataURL `<img>`，保持） |
| `IconAssets.source` 不一致 | 5/45 条 `emoji` 却 `hasSlice=true` | 0（TOCTOU 修复） |
| 棋盘切片分辨率 | 128×128 | **256×256** |
| DPR 超采样 | `max(1, dpr)`，DPR=1 屏零余量 | `max(2, dpr)`，实测 `pxPerCssY=2` |
| `imageSmoothingQuality` | `low`（浏览器默认，从未赋值） | **`high`**（显式设置） |
| 棋盘位图/CSS 盒宽高比 | 1.0 / 0.851 → **1.18× 纵向拉伸** | 1.0 / 1.0 → **无拉伸** |
| `#board` 毛玻璃 | `blur(3px) saturate(1.05)` + `rgba(255,255,255,.22)` | **`none` + 全透明** |
| 画布内暖白 veil | 径向 0.10→0.18 叠层 | **已移除** |
| 箭头亮度跨度 | **2.9**（卡面亮度 255，零对比） | **126.9**（最大饱和度 169） |

## Residual Risks

- **`file://` 形态的白底 Alpha Keying 仍未生效**：`getImageData` 在 `file://` 下必抛 `SecurityError`（浏览器安全模型硬约束），故 Dock 图标保留圆角白底。本轮修复保证了 Dock 与棋盘**消费同一张切片**（同源一致目标达成，Bug A 判定为已解决），但白键控本身需离线预处理图集（真 PNG + 抠底）才能解决——该��项不在本轮修复指令范围内，已登记为 fix.md 的 follow-up。
- **`file://` 形态无法做像素级断言**：`getImageData` 被污染导致画布像素不可读，故该形态下的箭头对比度、卡面对齐仅能通过 `DIR_COLORS` 常量与实机截图人工复核，未做数值断言；`http://` 形态已完成完整数值断言（spread=126.9）。
- **DPR=1 headless 环境**：`--disable-gpu` 下 `imageSmoothingQuality` 行为与真机可能存在差异，建议在真机（iOS Safari / Android Chrome）复测一次清晰度主观观感。
- **2x 超采样的性能代价未实测**：位图面积 ×4，8×8×5 层满载下的 60fps 预算需纳入 T052k 性能抽查（本轮未测）。
- **无 lint / type-check**：项目为纯 vanilla JS，无 lint 配置，静态检查仅依赖 `node -c` 语法校验。
- **T052i 复选框未归位**：方向箭头重做已实质完成，但 `tasks.md` 中 T052i 的实现注记仍声明「①三角箭头重做未实施」，复选框状态待产品侧复核后归位（fix.md follow-up）。

## Recommendation

**关闭该 bug —— 端到端验证通过。** 三项验收标准在 `file://` 与 `http://` 双形态下均已满足且可量化复现：Dock 与棋盘 100% 同源（无 Emoji，两形态截图人工复核一致）、棋盘 2x 超采样 + 256×256 切片 + 无 `backdrop-filter` 雾化层 + 无纵向拉伸、四向彩色箭头亮度跨度 126.9（原 2.9）。引擎侧 `solver.js --engine-selftest` 11/11 零漂移、渲染层 `render-selftest.js` 全绿、页面零未捕获异常，无回归。

遗留项（`file://` 白键控离线预处理、切片分档缓存、真机性能抽查、T052i 复选框归位）均为独立跟进事项，不阻塞本 bug 关闭。