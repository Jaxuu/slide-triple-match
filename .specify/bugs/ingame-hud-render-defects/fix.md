# Bug Fix: 局内 HUD / 棋盘渲染九项缺陷（点击无响应、灰黑遮罩、内嵌方框、顶栏与待消槽过时样式）

- **Slug**: ingame-hud-render-defects
- **Fixed**: 2026-10-23
- **Assessment**: ./assessment.md
- **Status**: applied

> **证据**：修复后实机截图见 `./after/`（`ingame-l1.png`、`ingame-level12-after.png`、
> `ingame-level12-hud.png` 等，headless Chrome `--force-device-scale-factor=2`）；
> 修复前对照 `./ingame-level12-before.png`。截图目录为验证产物，不参与运行时。

## Summary

九项缺陷实际是三条独立链路叠加的结果：（1）绘制用位图像素、命中用 CSS 像素再乘 dpr，**同一张牌存在两套几何**，导致右/下半区与奇偶层卡牌「点了没反应」；（2）九层「立体感」效果（被压变暗遮罩、层间灰黑投影块、点阵底纹、内嵌双层描边、堆叠双偏移）互相叠加，在牌与牌之间留下灰黑方块与内嵌小方框；（3）顶栏 / 待消槽 / 左键 / 棱晶图标停留在旧设计（生命+分数+连击次级栏、`关卡 X` 占中、带文字小按钮、💎 Emoji、木纹厚重托盘）。本轮把绘制、命中、教学锚点统一到**唯一纯函数** `getTileCssRect()`，删净全部覆盖层，按目标稿重建顶栏与待消槽，并把棱晶 SVG 抽成单一来源模块。

## 逐项修复

| # | 症状（用户口径） | 修法 | 锁定断言 |
|---|------------------|------|----------|
| 1 | 点卡牌无响应 / 只有右上角能点 | 绘制坐标系改为 **CSS 像素**（`setTransform(dpr,...)`，`RENDER_DPR=1`）；新增 `tileGridOf()` + `getTileCssRect()` 为唯一几何；`hitTest` / `tileRect` / `drawBoardTile` / Hint 高亮全部消费同一函数；`hitTest` **不再乘除 dpr**，按 z=4→0 逐层、跳过 `covered` | `render-selftest` 场景 J（9 项：偶数层原点、奇数层半格、5×5/8×8 逐格中心 100% 命中、层叠半格、外部 -1、covered 跳过、tileRect 回投）；`verify-fix` 双形态实测 `33/33` 命中 |
| 2 | 卡牌之间灰色 / 黑色方块，像没对齐的脏图层 | 删除被压卡牌 32% 变暗遮罩、层间环境阴影矩形、点阵底纹、`z>0` 的 shadow 状态泄漏、`layerOff` 双偏移；层次只由每张牌自身的 3px 底厚 + 柔和投影表达 | `T084: 变暗遮罩 / 层间灰影块 / 点阵底纹已彻底移除` |
| 3 | 卡牌内部还有一个小方框；图标太小 | 删除内嵌白描边（`strokeRect` 双框）；牌宽 `tileSize = cellStep - 1`（同层 1px 缝）；图标 `iconSize = tileSize × 0.84`，并按切片内容框 `__sliceRect` 裁剪后铺满；`file://` 白键控失败时改用 `darken` 合成把白底融进卡面 | `T084: 牌宽 = cellStep - 1`；`T085: file:// 白键控失败时用 darken 合成消除内嵌白框` |
| 4 | 棋盘四周有框线 | `#board { border:none; outline:none; }`，投影收弱为 `0 8px 22px rgba(15,23,42,.18)`；`#board-wrap` 保持透明无阴影 | `T085: 棋盘无外框线`；实机 `border-width = 0px` |
| 5 | 待消槽木纹、厚重、槽内横线 | `#dock` 改浅银灰/冰白 2px 圆角托盘（内 `rgba(30,41,59,.45)`，无 `::before` 木纹、无 5px 厚边）；7 个 `rgba(15,23,42,.42)` 圆角方槽，`.slot.empty::after { content:none }` | `T085: 待消槽为简约托盘`；实机 7 槽 + `::after = none` |
| 6 | `♥♥♥ 30 x1` 次级栏 | 删除整个 `#iq-bar` 次级栏（生命 / 分数 / 连击）与 `els.hudLives/hudCombo/hudScore` 写入；分数与连击的**逻辑**保留（结算页仍在用） | `T085: 生命/分数/连击次级栏彻底移除` |
| 7 | 顶栏中央 `关卡 X` 挤占 IQ | 中央改为极简深色半透明胶囊 `IQ: XX`（无大脑图标 / 无称号 / 无关号标题），`#hud-level-no` 保留为 `hidden` 节点供 a11y 与断言，关号写进 `#hud` 的 `aria-label` | `T085: 顶栏中央为极简 IQ`；实机 `hudText` 无「关卡」 |
| 8 | 左上角按钮是带文字的小图标 | 删除 `.hud-round-cap`，改 **42×42** Q 弹圆形键：内联 SVG（白色粗描边圆弧返回箭头 / 六齿齿轮），`:active` 下沉 + 过冲回弹 | `T085: 顶栏左侧为无文字纯图标键`；实机 `2 × [42,42]`、`innerText = ''` |
| 9 | 棱晶图标与大厅不同源（局内是 💎） | 新建 `src/ui/prism-icon.js`（7 个 polygon 原样搬移），`lobby.js` 删除私有 `GEM_SVG` 改调 `STM.PrismIcon`；顶栏胶囊与道具购买角标均写 SVG；文案类 `💎` 改「棱晶」 | `T085: 棱晶图标单一来源` + `局内零 💎 Emoji`；`T086: 免费次数 0 时角标显示「棱晶图标 + 50」` |

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | 新增 `tileGridOf/getTileCssRect/computeLayout`；绘制改 CSS 空间（`setTransform(dpr)`、`clearRect(cssSize)`）；`drawTileBody` 重写（单底厚、单外缘描边、`iconSize=0.84w`）；`drawBestiaryIcon` 按 `__sliceRect` 裁剪；删除 covered 遮罩 / 环境阴影 / 点阵 / 内嵌白框 / `layerOff` 双偏移；粒子与碎片重力改 CSS 单位；`hitTest/tileRect` 共用几何且不再过 dpr；`IconAssets.keyingAvailable()` + file:// `darken` 回退；`layoutOf()` 与 `STM.rendererTest.getTileCssRect/tileGridOf` 导出 |
| `src/main.js` | modified | `cacheEls` 精简；`renderHud` 只写棱晶 SVG + 余额 + `IQ`（删除生命/分数/连击/称号 DOM 写入）；`renderItemBadge` 购买态写 `棱晶 SVG + 50`；`ITEM_PRICE_LABEL` 删除；toast/飘字去 Emoji；新增 `prismHtml()` 与只读 `STM.main.renderer()` |
| `index.html` | modified | 顶栏重建（两个纯图标按钮 + `#hud-level-no[hidden]` + `#iq-pill` + `#hud-shards`），删除 `#iq-bar`/`#hud-title`；新增 `src/ui/prism-icon.js` 且置于 `lobby.js` 之前 |
| `css/style.css` | modified | `.hud-round-btn` 42px Q 弹 + 白色 SVG；`.hud-center` 绝对居中；`.iq-pill` 深色胶囊（去 shimmer）；删除 `.hud-round-cap`/`#hud-title`/`#iq-bar`/`.iq-brain`/`.iq-dot`/`#iq-title`/`.iq-side`/`#hud-lives`/`#hud-score`/`#hud-combo`；`#board` 去边框；`#dock` 简约托盘、`.slot` 深色方槽无横线；`.prism-gem(-sm)` 尺寸 |
| `src/ui/prism-icon.js` | **added** | `STM.PrismIcon.html(cls)` / `SVG` / `MARKUP`；7 polygon 与大厅原样一致（切面配色不得分叉） |
| `src/ui/lobby.js` | modified | 删除私有 `GEM_SVG`，改 `gemSvg()` → `STM.PrismIcon.html('lobby-gem')` |
| `tools/render-selftest.js` | modified | 新增场景 J（点击几何 9 项）；T084 改为「牌宽 `cellStep-1` / 半格 / 无遮罩层」；T085 重写为 DOM 顺序、极简 IQ、次级栏移除、纯图标键、棱晶同源、💎 清零、无框线、托盘、darken 回退；T086 改购买价口径；Δ15b3f 断言改 `setTransform(dpr)` 矩阵 |
| `tools/verify-fix.cjs` | modified | 填掉原先的死代码 `__hitGot`：改为真实 `hitTest/tileRect` 断言（33 格中心、命中点含于被点矩形、DOM 盒宽独立换算、外部 -1）；箭头像素探针改新牌宽几何；就绪改为轮询，消除二次加载抢跑 |
| `tools/ingame-shots.js` | modified | 指标换成 `#iq-pill`/`iqText`/`hudText`/`boardBorder`/`slotLine`/棱晶 SVG；断言改为「无关卡标题 / 无极简外次级栏 / 无框线 / 无槽内线 / 棱晶 SVG」；三消改断言引擎分数与 IQ |
| `tools/lobby-smoke.js` | modified | N2/N6 改为断言「棱晶 SVG + 50 / `-50 棱晶`」且不得出现 💎（原先只匹配 `50`，改后仍是绿但不锁新行为） |

## Diff Highlights

```js
/* 唯一几何：绘制 / 命中 / 教学锚点 / tileRect 共用（CSS 像素） */
function tileGridOf(t) {
  var z = t.z || 0;
  return { rr: (t.rr != null ? t.rr : (z % 2 === 1 ? t.r + 0.5 : t.r)),
           cc: (t.cc != null ? t.cc : (z % 2 === 1 ? t.c + 0.5 : t.c)) };
}
function getTileCssRect(tile, layout) {
  var g = tileGridOf(tile), s = layout.cellStep;
  return { x: layout.originX + g.cc * s, y: layout.originY + g.rr * s,
           w: layout.tileSize, h: layout.tileSize };
}
```

```js
/* 命中：盒宽归一（纯 CSS 比例，严禁再乘除 dpr） */
var kx = cssSize / rect.width, ky = cssSize / rect.height;
var cx = (clientX - rect.left) * kx, cy = (clientY - rect.top) * ky;
for (var zi = 4; zi >= 0; zi--) { /* 顶层优先，跳过 covered */ }
```

```js
/* 牌面：一个底厚 + 一层奶油白 + 一条外缘描边 + 0.84 图标 */
var w = Math.max(1, cell - GAP);           /* GAP = 1 */
roundRect(ctx, x, y + 3, w, w, r);          /* #C3CEDC 底厚，自带柔和投影 */
roundRect(ctx, x, y, w, w, r);              /* #FFFFFF → #F4F7FB 微渐变 */
ctx.strokeStyle = hexA(sv.fill, 0.55);      /* 唯一一道缘线，无内缩白框 */
drawBestiaryIcon(ctx, sv, x + w / 2, y + w / 2, w * 0.84);
```

```js
/* file://：getImageData 被污染 → 切片带白底。darken 让纯白退化为卡面本色，
 * 白底「隐形」；http 正常态仍走 source-over，零行为漂移。 */
var noKey = !IconAssets.keyingAvailable();
if (noKey) { ctx.save(); ctx.globalCompositeOperation = 'darken'; }
ctx.drawImage(sp, sr.x, sr.y, sr.w, sr.h, cx - R, cy - R, iconSize, iconSize);
if (noKey) ctx.restore();
```

## Tests Added or Updated

- `tools/render-selftest.js::scenarioHitGeometry`（场景 J）— `getTileCssRect` 纯函数性、偶数层 `(c·step, r·step)`、奇数层半格、**5×5 / 8×8 全盘逐格中心命中自己**（25/64 格）、层叠半格中心可命中、棋盘外 `-1`、`covered` 不可命中、`tileRect` 锚点回投命中同一张牌。
- `tools/render-selftest.js::T084` — 牌宽 `cellStep-1`、奇数层 `+0.5`、覆盖层（变暗/灰影/点阵）源码清零、碎片数区间。
- `tools/render-selftest.js::T085` — HUD DOM 顺序、中央仅 IQ（无「关卡」/`/72`/标题节点）、次级栏三件套删除、纯图标键、棱晶单一来源（7 polygon 同源 + 脚本序）、局内零 💎、`#board` 无边框、托盘无木纹/无槽内线、**file:// darken 回退**。
- `tools/render-selftest.js::T086` — 免费次数用尽角标 = 棱晶 SVG + 50。
- `tools/render-selftest.js::Δ15b3f` — `draw()` 每帧 `setTransform(dpr,0,0,dpr,0,0)`（不再是 identity），JS 仍不回写 `canvas.style`。
- `tools/verify-fix.cjs` — Bug 1 真实回归：`tested=33 / miss=[] / wrong=[] / domProbeId=56 → 56 / outside=-1`，双形态（`file://` + `http://`）。
- `tools/ingame-shots.js` — HUD/托盘/棱晶/边框/溢出 + L1/L2/L3 教学 + 三消引擎口径，9 张截图。
- `tools/lobby-smoke.js` — N2/N6 购买角标与扣费飘字改为「同源 SVG + 无 Emoji」断言。

## Local Verification

- `node --check src/render/BoardRenderer.js` / `src/main.js` / `src/ui/lobby.js` / `src/ui/prism-icon.js` / 三个 tools → 全部通过。
- `node tools/render-selftest.js` → **all green**（含场景 J 全部几何断言；Node 桩下 `file://` 白键控不可用属预期，走 darken 分支）。
- `node tools/ingame-shots.js .specify/bugs/ingame-hud-render-defects/after` → **all green**；产物 `ingame-l1.png` / `ingame-l1-top.png` / `ingame-l2.png` / `ingame-l3.png`（2× DPR）。实测：顶栏无「关卡」、无 `#iq-bar`、棱晶为 7 polygon SVG、`#board` border=0、空槽无内线、按钮 2×42px 无文字。
- `node tools/verify-fix.cjs` → **ALL GREEN（双形态）**；`hitTest {"n":8,"tested":33,"miss":[],"wrong":[],"domProbeId":56,"domProbeGot":56,"outside":-1}`；网格对齐 `cellExact=true / cornerClean=true`。
- `node tools/board-stability.js` → **all green**：双形态 × 21 采样点，`#board` 恒 472px、`cellSize` 恒 123、位图恒 984，**连续点击 20 步漂移 0px**（Δ15b3f 铁律未被本轮坐标改动静默破坏）。
- `node tools/lobby-smoke.js` → **83 passed / 0 failed**（含 N2/N6 新断言）。
- 实机 L12 交互审计（临时 headless 脚本，未入库）：`n=8 / 102 牌（z0=44, z1=37, z2=21）/ 33 张可点` → **33/33 中心命中自己、0 漏点、DOM 盒宽独立换算 0 漏点、外部 -1**；随后 6 次**真实 `Input.dispatchMouseEvent`**：`dock 0→1→2→0`、`IQ 90→95→102`、`lives` 不变——证明点击链路（canvas pointerdown → hitTest → 入槽 → 三消）全程真实生效。
- 像素抽查：http 形态 `keyingAvailable()=true`（走 source-over，渲染不变）；`file://` 形态 `keyingAvailable()=false`（darken 生效），同一区域前后对比 75% 像素完全一致、平均差 0.89/765，无可见色偏。

### 与本轮无关的既有工具红灯（未改）

- `node tools/browser-bugtest.js`（默认 `--level 1`）与 `node tools/m4-sanity.js`（`?level=1`）：深链 `level=1` 按设计进**大厅**（`src/main.js:330` `if (deepId > 1) enterGame(...) else enterLobby(...)`），二者却以 `session()` 真值判断「就绪」→ `NOT_READY`。此判定不在本次 diff 内（`git diff` 未触及该段）。
- `node tools/browser-bugtest.js --level 12`：就绪后在第 4 步像素采样处 `SecurityError`（`file://` 画布被贴图污染，工具未走 http 形态）。与本轮改动无关，file:// 下 `getImageData` 历来不可用。
- `node tools/responsive-check.js` → 33 passed / 10 failed：失败全部是**大厅** `plaqueName` / `prog` 对比度 1.41:1（5 个视口 × 2 项），相关选择器未被本轮 CSS 触碰。

## Deviations from Assessment

1. **坐标空间选了「备选」而非首选**：评估首选「只改 `hitTest` 换算、`cell` 保持位图像素」，并明确警告「把绘制空间改回 CSS 像素改动面大」。本轮按用户**明确指令**（绘制与命中同用 CSS px、`hitTest` 严禁乘除 dpr）执行了备选方案：`RENDER_DPR=1`（`dprSafe(v)=v`）、`draw()` 每帧 `setTransform(dpr,...)`、`cell = cssSize/n` 全为 CSS px。评估担心的连带面（粒子速度、碎片重力、飞行终点）已逐一换算为 CSS 单位并复跑 `board-stability`（0px 漂移）与 `render-selftest`（Δ15b3f 组全绿）。
2. **`hitTest` 用盒宽归一而非字面 `clientX - rect.left`**：画布**逻辑**边长来自父容器测量（`#board-wrap` 内容区 −8），而 `#board` 的 CSS 盒是 `calc(100% - 12px)`，两者实测差 5.7%（370 vs 350）。因此保留 `kx = cssSize/rect.width`（纯 CSS 比例，与 dpr 无关），否则 5.7% 的系统性偏移会把边缘点击再次打偏。若要让字面减法成立，需另修 `resize()` 的尺寸来源（见 Follow-ups）。
3. **Bug 3 图标归一化没用 alpha bbox / 0.78**：评估建议在 `getImageData` 阶段算内容 bbox、按 `0.78w` 缩放，并在 tainted 时回退 `0.62w`。本轮按用户「图标占卡面 84%」的硬指标实现 `0.84 × tileSize`，并改为**裁剪到已记录的切片内容框** `__sliceRect`（去掉 sprite 画布的透明边距，不新增每帧 `getImageData`，不引入性能风险）。副作用：`file://` 下白底片会随图标一起放大，故补了 `darken` 回退（见下条），但**真正的 1:1 双形态一致**仍需离线预处理图集（评估首选方案，见 Follow-ups）。
4. **新增 file:// 白底回退（评估未列）**：`getImageData` 被污染时切片保留不透明白底，0.84 尺寸会让「内嵌白方框」比修复前更明显。新增 `IconAssets.keyingAvailable()`；不可用时该次 `drawImage` 置 `globalCompositeOperation='darken'`，纯白像素与卡面取 min 后退化为卡面色（白底隐形），彩色主体色差 < 1/255（实测平均 0.89/765）。http 正常态不进入该分支。
5. **Bug 6 未采用「仅 `damageOnBlock` 关卡显示 ♥ n」的条件兜底**：用户要求「整条次级栏（含生命）删除」，故 `#hud-lives` 彻底移除、`renderHud` 不再读 `session.lives`。`damageOnBlock: true`（第 2 章起）因此失去可见扣命反馈——这是对 **FR-003** 的已知风险，列入 Follow-ups 由产品裁决。
6. **Bug 2 未做「同路径内烘焙降亮度」**：按用户决定「彻底移除变暗」，不做任何被压牌降亮/降饱和。若日后产品要求「不可点」提示，应作为新需求立项（评估的 Alternatives 未被采纳）。
7. **未保留 `layerOff`**：评估首选几何里 `hitTest` 与绘制都含 `layerOff`；本轮直接删除了 `layerOff`（层间视觉错位），因为「同层 1px 紧贴 + 无覆盖层」的最终形态里它只剩双重偏移的副作用。奇数层的半格错位由 `tileGridOf()` 的 `+0.5` 唯一表达。
8. **测试口径**：评估要求「拦截/包装 `session.tap` 记录实际 id、四象限各 3 格」。本轮改为断言**纯几何**（`hitTest(中心) === id`、命中点落在被点矩形内、DOM 盒宽独立换算）+ 6 次真实 pointer 点击的端到端审计，覆盖 33 张可点牌（8×8 全量）而非 12 格；理由是 `session.tap` 只记录状态变化、无法直接证明「点击落在哪张牌」，包装它反而更脆。
9. **几何矩阵未跑满**：评估要 `n∈{5,6,7,8} × dpr∈{1,2,3} × rect 宽×{1,0.95,1.05}`。Node 桩覆盖 `n∈{5,8}`、dpr=1；浏览器在 dpr=2 下实测；`rect.width` 的 ×0.95 场景由实机 5.7% 差异（0.946/0.959）真实覆盖。dpr=3 未实机验证。
10. **保留一条主题色外缘描边**（1.5px, 55%）：评估原文允许「只保留一条主题色细描边」；被删除的是「内嵌白描边」。同时底厚由原来的「4px + 2px 双层」收敛为单层 3px。
11. **按钮配色为自定**：评估只要求放大图标 + Q 弹，未定颜色；为让白色 SVG 在浅色奶油背景上有足够对比，取中蓝灰渐变（`#9DB2CA → #7E93AD → #64798F`），`#hud` 高度上调至 `clamp(54px, 8.6%, 70px)` 以容纳 42px 键。
12. **范围扩展**：`src/ui/lobby.js` 与新增 `src/ui/prism-icon.js` 属评估 Bug 9 明确列出的文件；`tools/lobby-smoke.js`（N2/N6 断言）与 `tools/verify-fix.cjs` 的就绪轮询属测试侧必要更新，未改任何业务模块。

## Follow-ups

- **规格同步（最高优先）**：`FR-044 §4`（32% 变暗已作废）、`FR-047 §1`（顶栏 `关卡 X`）、`§2`（IQ 条位置）、`§3`（厚重木/金属托盘）与新 UI 冲突；建议 `/speckit.refine.update` + `/speckit.refine.propagate` 同步 `specs/001-slide-triple-match-core/spec.md` 与 `tasks.md` 的 T084/T085 断言。同时确认 `FR-046 §2` 教学文案是否仍以「深色卡牌被压住」表述（变暗已移除）。
- **生命反馈缺口**：`damageOnBlock: true` 的关卡（第 2 章起）扣命当前无任何可见反馈。建议产品裁决：要么复用顶栏棱晶胶囊左侧的极简 `♥ n`（仅这些关卡出现），要么在规格中承认「无反馈」。
- **离线图集预处理（彻底消除 file:// 白底）**：用 Node 工具把 `sheet{1..3}.png` 预扣白底成真 RGBA 图集，运行时纯 `drawImage`；这样 `darken` 回退与 `getImageData` 依赖都可删除，file:// / http:// 100% 一致（评估首选方案）。
- **`#board` 逻辑尺寸与 CSS 盒对齐**：`side = wrap.clientWidth - 8` 与 CSS `calc(100% - 12px)` 相差 5.7%（370 vs 350），当前由 `hitTest` 的盒宽归一吸收。若想恢复「字面 `clientX - rect.left`」的简洁换算，应让两处尺寸同源（需在 Δ15b3f 铁律内改造，勿回写 `canvas.style`）。
- **方向角标越界**：`drawWingBadge` 中心距边 4px，三角高 `0.2·cell`，在最外层牌的朝上/朝左方向会伸出牌面约 8px、压到相邻牌缝。属既有美术取向（评估未列），若用户觉得「箭头浮在缝里」可把中心内移到 `hgt/2 + 2`。
- **既有工具红灯**：`browser-bugtest.js` / `m4-sanity.js` 的 `?level=1 → 大厅` 就绪判定、`browser-bugtest` 的 `file://` 像素采样、`responsive-check` 的大厅对比度 1.41:1，均与本次修复无关，建议另立 bug 单处理。
