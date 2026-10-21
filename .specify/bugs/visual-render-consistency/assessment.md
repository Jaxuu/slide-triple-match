# Bug Assessment: 视觉与渲染一致率三缺陷（Dock/Board 贴图割裂、画质模糊、方向箭头不可辨）

- **Slug**: visual-render-consistency
- **Created**: 2026-10-21
- **Source**: pasted text（Level 12 实机截图暴露的 3 个视觉 Bug）
- **Verdict**: valid（三项均经实机 CDP 探针复现并量化，根因确定）
- **Severity**: critical

## Report (verbatim)

> 请对当前版本（Level 12 实机截图）暴露出的 3 个严重视觉与渲染一致率 Bug 进行根因评估，并生成 assessment.md：
>
> 1. **Bug A（严重不一致）：底部 7 格收集槽（Dock）与棋盘（Board）的图标不是同一套贴图！**
>    - 现象：棋盘 Canvas 中渲染的是 `assets/icons/sheet{1..3}.png` 切出的 3D 黏土盲盒图标，但当滑块飞入底部 `#dock` 槽位后，显示的却是系统扁平 Emoji 字符（如 🐤🐮🐑🦔），上下视觉严重割裂。
>    - 排查点：检查 `BoardRenderer.js` 的 `chipSVG(suit)` / 切片缓存导出接口，以及 `main.js` 中 `renderDock()` 的实现与图片异步加载完成后的重绘回调机制。
>
> 2. **Bug B（画质模糊）：棋盘图标与背景画面整体显得模糊发虚、雾蒙蒙！**
>    - 现象与排查点：
>      a) **离屏切片分辨率过低与 DPR 缺失**：原图集 `sheet{1..3}.png` 单格分辨率高达 512×512，但离屏切片 Canvas 被缩小到了低像素（如 128×128），且主 Canvas 绘制时未强制保证至少 2x 超采样（`Math.max(window.devicePixelRatio || 1, 2)`）及 `ctx.imageSmoothingQuality = 'high'`，导致图标边缘锯齿发糊。
>      b) **棋盘区域 `backdrop-filter: blur` 导致画面发雾**：`#board-wrap` 或棋盘底板使用了毛玻璃模糊与灰白半透明遮罩，将原本高清锐利的背景插画糊成了一团雾气，严重降低画面通透度。
>
> 3. **Bug C（可读性缺陷）：滑块边缘的方向三角箭头为纯白色，与白色卡片底座融为一体几乎看不见！**
>    - 现象：白色卡片边缘凸起的小三角箭头也是白色，极难辨认朝向。

## Symptom

**Bug A**：棋盘上滑块显示 `sheet{1..3}.png` 切出的 3D 黏土盲盒图标，但同一花色的滑块飞入底部 `#dock` 槽位后显示为系统扁平 Emoji（🐥🐑🐮🐹🦔），棋盘与收集槽视觉割裂。预期：Dock 槽位显示与棋盘同一套 3D 贴图。

**Bug B**：整体画面模糊发虚。根因有二：① 离屏切片被固定降采样到 128×128，且主画布绘制未强制 ≥2x 超采样与 `imageSmoothingQuality='high'`（实测当前为 `'low'`）；② `#board` 底板叠加 `backdrop-filter: blur(3px) saturate(1.05)` + `rgba(255,255,255,0.22)` 白纱 + 画布内径向暖白 veil（0.10~0.18），把高清背景插画糊成雾气。

**Bug C**：滑块朝向边缘的三角箭头以 `#FFFFFF` 纯白填充 + `rgba(255,255,255,1)` 纯白描边绘制，而卡面本身是 `#FFFFFF→#F4F7FB` 奶油白渐变——箭头与底座零对比。实测箭头区域亮度跨度仅 **1.9**（对比卡面亮度 255），肉眼不可辨。

## Reproduction

1. 双击 `index.html`（`file://` 形态）或起静态服务后访问 `index.html?level=12`（Level 12 为 8×8 关，5 种花色 → bestiaryId 1/2/3/10/12）。
2. **Bug A**：等待棋盘贴图加载完毕（棋盘已显示 3D 黏土图标），随后让任意滑块飞入底部收集槽——Dock 槽位显示扁平 Emoji 而非贴图。
3. **Bug B**：观察棋盘：背景插画（bg1 花海）透过棋盘底板后细节丢失、边缘发软；`#board` 的 computed `backdrop-filter` 为 `blur(3px) saturate(1.05)`，`background` 为 `rgba(255,255,255,0.22)`。
4. **Bug C**：观察任一滑块的朝向边缘内侧 3px 处——白色三角箭头在奶油白卡面上完全不可见。

## Suspected Code Paths

### Bug A —— Dock 与 Board 贴图来源分叉
- [src/render/BoardRenderer.js:1114-1146](src/render/BoardRenderer.js#L1114-L1146) — `chipSVG(s, level)`：`IconAssets.sliceCanvasOf(bid)` 命中后走 `slice.toDataURL('image/png')` 生成 `<img>`；**`toDataURL` 抛异常时被 `catch (err) { url = null; }` 静默吞掉**，随后落入 Emoji 分支（`Bestiary.emojiOf(bid)`）。这是 Dock 退化为 Emoji 的直接触发点。
- [src/render/BoardRenderer.js:193-215](src/render/BoardRenderer.js#L193-L215) — `whiteKeySlice()`：`getImageData` 白底 Alpha Keying 在 `file://` 下抛 `SecurityError`，被 `catch (err) { /* getImageData 安全异常 */ }` **整段跳过** → 切片保留完整不透明白底（且圆角遮罩已被 `destination-in` 应用，白底被裁成圆角矩形）。
- [src/render/BoardRenderer.js:1084-1090](src/render/BoardRenderer.js#L1084-L1090) — 贴图就绪回调：`onSpritesReady` → `renderer.refresh()`；Dock 侧由 [src/main.js:286-292](src/main.js#L286-L292) 同步 `renderDock()`。
- [src/main.js:373-385](src/main.js#L373-L385) — `renderDock()`：`STM.chipSVG(s.dock[i].s, currentLevel)`，与棋盘共用同一 `chipSVG`，**说明分叉不在调用方，而在 `chipSVG` 内部的两个数据出口**（Canvas 直绘 vs DataURL）。
- [src/render/BoardRenderer.js:96-148](src/render/BoardRenderer.js#L96-L148) — `getSprite()`：棋盘侧直接 `ctx.drawImage(sliceCanvas, ...)`（**不读像素、不导出**）→ 棋盘始终显示贴图；这解释了"棋盘是贴图、Dock 是 Emoji"的割裂。
- [src/render/BoardRenderer.js:271-292](src/render/BoardRenderer.js#L271-L292) — `ensureSinglesFor()`：单张 PNG 逐条目探测，`onerror` 时 `source[bid] = 'emoji'`。

### Bug B —— 画质模糊
- [src/render/BoardRenderer.js:193-197](src/render/BoardRenderer.js#L193-L197) — `whiteKeySlice()`：`cv.width = 128; cv.height = 128;` 硬编码降采样（原 512×512 单格 → 128×128，**丢弃 87.5% 像素**）。
- [src/render/BoardRenderer.js:626-641](src/render/BoardRenderer.js#L626-L641) — `createBoardRenderer()`：`var dpr = Math.max(1, global.devicePixelRatio || 1);` —— **无 2x 下限**；`resize()` 中 `boardPx = Math.round(cssW * dpr)` 且 `canvas.width = canvas.height = boardPx`（强制正方形位图）。
- [src/render/BoardRenderer.js:341-352](src/render/BoardRenderer.js#L341-L352) — 全文**无 `imageSmoothingQuality` 赋值**（实测浏览器默认值 `'low'`）。
- [css/style.css:177-194](css/style.css#L177-L194) — `#board`：`aspect-ratio: 1/1` + `max-height: 100%` + `backdrop-filter: blur(3px) saturate(1.05)` + `background: rgba(255,255,255,0.22)`。因 `aspect-ratio:1/1` 与 `max-height:100%` 冲突，实测 **CSS 盒退化为 484×569（非正方形）而位图仍是 482×482（正方形）** → 浏览器纵向拉伸 **1.18×**。
- [src/render/BoardRenderer.js:750-756](src/render/BoardRenderer.js#L750-L756) — `draw()` 内的径向暖白 veil（`rgba(255,252,246,0.10)` → `rgba(240,232,220,0.18)`）与 CSS 底板白纱叠加 → 背景对比度进一步被压低。

### Bug C —— 方向箭头不可辨
- [src/render/BoardRenderer.js:481-506](src/render/BoardRenderer.js#L481-L506) — `drawWingBadge()`：`ctx.fillStyle = '#FFFFFF'; ctx.fill();` + `ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.stroke();` —— **纯白填充 + 纯白描边**，落在同色系卡面上。
- [src/render/BoardRenderer.js:410-425](src/render/BoardRenderer.js#L410-L425) — `drawTileBody()` 卡面：`#FFFFFF → #FBFCFE → #F4F7FB` 渐变 + `rgba(255,255,255,0.9)` 内高光描边 —— 与箭头同色。
- [specs/001-slide-triple-match-core/spec.md:239-241](specs/001-slide-triple-match-core/spec.md#L239-L241) — FR-034 §3/§5：要求"带白色描边"且"须一眼可辨（对比度、尺寸下限）"——当前实现满足"白描边"字面要求，但**违反 §5 可辨识度红线**（无与卡面的对比度保障）。

## Root Cause Hypothesis

### Bug A（置信度：高 —— 实机复现，file:// 与 http:// 行为分歧已定位）

**`file://` 下的 canvas 污染（tainting）击穿了白键控与 DataURL 两条链路，触发了 Dock→Emoji 降级。**

实测（Chrome 142 headless，`file://` 形态）：`assets/icons/sheet{1..3}.png` 虽名为 `.png`，**实为 JPEG 字节流**（文件头 `FF D8 FF E0`；实测 JPEG SOF 尺寸 2048×2048，即单格 512×512）；`assets/bg/bg1.png` 是真 PNG。无论真 PNG 还是 JPEG-in-png，**在 `file://` 下 `drawImage` 到 canvas 后 `getImageData` 与 `toDataURL` 一律抛 `SecurityError: Tainted canvases may not be exported`**（探针实测 `bg1_true_png` 与 `sheet1_png_ext_jpeg_bytes` 同为 TAINTED——**故污染源是 `file://` 协议本身，而非文件格式**）。

级联链条：
1. `whiteKeySlice()` 内 `getImageData` 抛 `SecurityError` → 被 `catch` 吞掉 → **白底 Alpha Keying 完全失效**，切片保留不透明白底（实测 http:// 下角像素为 `[0,0,0,0]` 透明，file:// 下白键控未执行）。
2. `chipSVG()` 内 `slice.toDataURL('image/png')` 抛同一 `SecurityError` → 被 `catch { url = null; }` 吞掉 → 落入 Emoji 分支返回 `<span class="chip-icon-emoji">🐥</span>`。
3. 棋盘侧 `getSprite()` 走 `ctx.drawImage(slice, ...)` —— **只读不导出，不触发污染检查** → 棋盘照常显示 3D 贴图。

→ 同一花色在棋盘（Canvas 直绘贴图）与 Dock（DataURL 贴图）走两条出口，file:// 下后者被污染击穿，**产生"上贴图下 Emoji"的割裂**。

**同一 `file://` 场景下另有一处独立竞态缺陷**：`ensureSinglesFor()` 对无 sheet 覆盖的条目探测单张 `assets/icons/{bid}.png`，其 `onerror` 分支执行 `source[bid] = 'emoji'`。而 Level 12 的 5 个 bestiaryId（1/2/3/10/12）**本就由 sheet1 覆盖**（`hasSlice: true`），却被单张探测的 `onerror` 覆写为 `'emoji'`——实测 `source` 表 45 条中 **40 条 `'sheet'` / 5 条 `'emoji'`，而这 5 条 `'emoji'` 全部 `hasSlice: true`（source 与 slices 不一致，5/45）**。即 `ensureSinglesFor` 的守卫 `if (source[bid] === 'sheet' || source[bid] === 'single') return;` 存在 TOCTOU 窗口（sheet 尚未 onload 时被先行探测覆写）。该状态不影响当前 Dock 输出（`chipSVG` 依据 `sliceCanvasOf` 而非 `statusOf`），但会误导 `statusOf()` 与后续兜底判定。

**对照验证**：`http://` 静态服务形态下，`toDataURL` 全部成功（实测长度 30334~45006 字节），`chipSVG` 全部返回 `<img class="chip-icon-canvas" src="data:image/png;base64,…">` —— **Bug A 仅存在于 `file://` 形态**。这解释了为何实机（双击打开）必现、而某些验证流程未暴露。

**影响范围**：SC-006 明文要求"空 assets 目录双击 index.html 完整可玩"且"file:// 双击与静态服务两种形态下 Image 相对路径加载行为一致"（spec.md:139 Edge Case）。当前形态**不一致**，违反该契约。

### Bug B（置信度：高 —— 三项成因均经实测量化）

实测数据：
- **切片降采样**：原单格 512×512 → 硬编码 128×128（[BoardRenderer.js:195](src/render/BoardRenderer.js#L195)），丢弃 87.5% 像素。实测 8×8 关卡格宽 60.3px、图标绘制尺寸 37.4px，128px 切片**放大至此尚有余量**——故 128 本身在 8×8 档并非主因，但它是**源信息不可逆损失**，且在 DPR≥2 的真机上（图标绘制像素翻倍至 ~75px）逼近切片源分辨率，放大插值不可避免。
- **DPR 缺失 + 无 2x 下限**：[BoardRenderer.js:626](src/render/BoardRenderer.js#L626) `dpr = Math.max(1, devicePixelRatio || 1)`，DPR=1 屏上 1 CSS px = 1 位图像素，无任何超采样余量。
- **无 `imageSmoothingQuality='high'`**：实测 `ctx.imageSmoothingQuality === 'low'`（浏览器默认值）。所有 `drawImage`（切片→Sprite→棋盘）走低质量缩放 → 边缘锯齿发糊。**这是"图标发糊"的最直接成因**。
- **纵向 1.18× 拉伸（报告未预见的额外成因）**：`#board` 的 `aspect-ratio: 1/1` 与 `max-height: 100%` 冲突 → 实测 **CSS 盒 484×569（纵横比 0.851）而位图 482×482（正方形）**，`resize()` 又强制 `canvas.width = canvas.height = boardPx`。浏览器遂把正方形位图**纵向拉伸 18.05%** 贴进非正方形 CSS 盒——图标随之被拉长（黏土图标变胖/变形），且叠加 `imageSmoothingQuality='low'` 的双线性插值 → 明显发虚。横向则几乎无拉伸（1.004×）。
- **迷雾层（Bug B(b) 属实，但机理与报告描述略有出入）**：`backdrop-filter: blur(3px) saturate(1.05)` 确实作用于 `#board`（实测 computed 值一致；`#board-wrap` 无 backdrop-filter——报告称"或"二选一，实为 `#board` 自身）。但真正的"雾"来自**三重叠加**：CSS `rgba(255,255,255,0.22)` 白纱 + `blur(3px)` 背景模糊 + 画布内径向暖白 veil（0.10→0.18）。实测棋盘画布角点像素 `[243,237,225,42]`（alpha 仅 42/255，即画布自身近透明，靠 CSS 白纱 + backdrop-filter 出效果）→ 背景透过白纱后与画布 veil 叠加，**背景饱和度与对比度被双杀**，观感即"雾蒙蒙"。实测背景画布同区域亮度 201.6，而棋盘画布覆盖后该区域亮度升至 240.5 —— 背景被显著"提白"。

### Bug C（置信度：高 —— 像素级实测量化）

`drawWingBadge()` 用 `#FFFFFF` 填充 + `rgba(255,255,255,1)` 描边绘制三角，而卡面是 `#FFFFFF→#F4F7FB` 奶油白渐变。**实测（http:// 形态下棋盘画布像素采样）**：箭头区域 9×9 邻域亮度 min 252.1 / max 255 / **跨度仅 2.9**；卡面亮度 255。箭头区域与卡面**在数值上几乎完全相同**——不是"难辨认"，而是**在像素层面根本不存在任何对比**。这与报告"纯白色与白色底座融为一体"的判断完全吻合，并量化确认。

补充：spec FR-034 §3 字面要求"带白色描边"，实现照字面执行；但 §5 的"可辨识度红线（对比度、尺寸下限）"未被满足——**白描边本身是自相矛盾的规格**（在奶油白底座上白描边等价于无描边）。修复须同时调整实现与规格口径（描边改深色，或填充改主题色 + 深色描边）。

**另需注意（影响修复方案）**：T052i 任务复选框虽已勾选 `[x]`，其实现注记明确写明"**①三角箭头重做未实施——复选框待角标部分完成后归位**"，而 T052k（Δ15 门）仍未勾选。即 Bug C 属**已登记未交付**的欠账，非新缺陷。

## Proposed Remediation

### Bug A 修复（首选：Dock 改为复用棋盘同源的 Canvas 渲染，绕开 DataURL 导出）

**Preferred**：Dock 不再通过 `toDataURL` 导出切片，改为**每槽一个 `<canvas>` 元素**，由 `chipSVG` 直接绘制 `IconAssets.sliceCanvasOf(bid)`（与棋盘 `getSprite` 同源、同一条 `drawImage` 路径）。此举一次性消除污染依赖：**不需要 `getImageData`（白键控）、不需要 `toDataURL`（导出）**——两者在 `file://` 下都会被污染击穿。配套需：
- 白键控改为**不依赖 `getImageData`** 的方案：在切片阶段用 `globalCompositeOperation` 做**颜色键抠图**不可行（Canvas 无逐像素操作），因此白键控须换方案——推荐**在源图集侧预处理**：用 Node 离线工具把 3 张 sheet 转成**真 PNG 且已抠好透明底**的 4×4 图集（去掉 JPEG 压缩噪点与白底），运行时仅做 `drawImage` 切片，无需任何像素读回。此方案同时解决白键控失效与 128px 降采样两个问题（可保留 512px 源精度）。
- 修正 `ensureSinglesFor` 的 TOCTOU：`onerror` 分支改为 `if (source[bid] !== 'sheet' && source[bid] !== 'single') source[bid] = 'emoji';`（仅在无更优来源时降级）。
- `chipSVG` 的 `catch (err) { url = null; }` **不得静默吞异常**——至少 `console.warn` 留痕（当前 `file://` 下 45 次静默失败，无任何可观测信号，这正是缺陷长期未被发现的直接原因）。

**Alternatives**:
- **最小改动方案**：仅在 `chipSVG` 中，当 `toDataURL` 失败时**回退为内联 SVG/Canvas 直绘**而非 Emoji（棋盘仍用 `drawImage` 切片）——Dock 与棋盘即刻恢复同源，代码改动约 20 行，且不需要离线预处理工具。但白底残留（file:// 下白键控失效）会让 Dock 出现白色圆角方块，需一并处理（例如给切片 Canvas 预先 `destination-in` 一个径向/圆角遮罩并让白底不显眼，或接受白底方块但用 CSS `mix-blend-mode: multiply` 融合——后者会污染美术原色，不推荐）。
- **规避 file:// 限制**：要求以静态服务访问。但这**违反 SC-003**（双击 index.html 即可游玩）与 spec Edge Case"file:// 双击与静态服务两种形态行为一致"，不可作为产品口径，仅可作为开发期临时规避手段。

**Files likely to change**:
- `src/render/BoardRenderer.js` — `chipSVG()` 改 Canvas 直绘；`whiteKeySlice()` 去除 `getImageData` 依赖；`ensureSinglesFor()` 修 TOCTOU；切片分辨率由 128 提升至 256/512；`getSprite()` 与 `chipSVG` 共用统一贴图出口。
- `src/main.js` — `renderDock()` 适配 Canvas 形态 chip（`chipSVG` 返回值结构变化）。
- `css/style.css` — `.chip-icon-canvas` 尺寸规则适配 `<canvas>`（现有规则同时作用于 `img` 与 `svg`，需增 `canvas` 选择器）。
- `tools/` — 新增离线图集预处理工具（真 PNG + 抠底 + 保 512 精度），产出替换 `assets/icons/sheet{1..3}.png`。

### Bug B 修复

**Preferred（按收益排序，四处并行）**：
1. **消除纵向拉伸**：修 `#board` 的尺寸口径——`resize()` 中按 CSS 盒的真实宽高分别设置 `canvas.width/height`（而非强制正方形），并同步 `cell` 计算；或调整 CSS 让 `#board` 恒为正方形（`aspect-ratio:1/1` + `max-width` 与 `max-height` 同时约束、`height:auto`）。**这是"图标变形发虚"的最直接修复**。注意 `hitTest` 已按 `rect.width/height` 归一化计算（[BoardRenderer.js:1061-1062](src/render/BoardRenderer.js#L1061-L1062)），**保持非正方形时命中判定不受影响**（此点须在改动中以测试锁定）。
2. **提升采样质量**：`createBoardRenderer()` 中 `ctx.imageSmoothingQuality = 'high'`（须在每次 `resize()`/context 重置后重设）；DPR 采用 `Math.max(2, devicePixelRatio || 1)` 的 2x 下限（按报告建议），并评估 8×8×5 层满载下的 60fps 预算（位图面积 ×4，需纳入 T052k 的性能抽查）。
3. **切片提分辨率**：切片尺寸由固定 128 提升为 `Math.min(512, cell*dpr*2)` 档位或直接 256/512；并**缓存键带尺寸档**（现 `sliceCanvasOf(bid)` 无档位概念，提升分辨率后需按档缓存，否则 8×8 与 4×4 共用一档会失配）。
4. **祛雾**：降低 `#board` 的 `backdrop-filter` 模糊半径与白纱不透明度（`blur(3px)`→`blur(0)` 或移除、底板 `rgba(255,255,255,0.22)`→`0.10~0.12`），并相应下调画布内径向 veil 的上限（`0.18`→`0.10`）。**注意可读性红线**：spec.md:135 要求"背景层与棋盘层间设半透明蒙版/暗角过渡"以保滑块对比度——降透明度时须同步验证滑块/方向角标/机制标记的对比度不低于黑底基准，不可简单归零。

**Alternatives**:
- 保持 128px 切片但仅做 1+2+4（不预处理图集）：可显著改善拉伸与插值质量，但**白键控在 file:// 下的失效仍未解决**（白底残留）——故此方案必须与 Bug A 的 Canvas 直绘方案同做。
- 全程采用 `image-rendering: auto` + 预放大整数倍切片（nearest 邻接）：像素风观感，与"3D 黏土"美术风格不符，不推荐。

**Files likely to change**:
- `src/render/BoardRenderer.js` — `resize()` 位图尺寸口径、`imageSmoothingQuality`、切片分辨率与缓存键、`getSprite` 绘制尺寸。
- `css/style.css` — `#board` 尺寸/宽高比、`backdrop-filter` 与底板透明度。

### Bug C 修复

**Preferred**：把箭头从"纯白填充 + 纯白描边"改为**主题色填充 + 深色描边**（或**深色填充 + 白描边**，二者择一，须保证在奶油白卡面与彩色背景上均有 ≥3:1 对比）。`drawWingBadge` 已接收 `sv`（含 `fill`/`deep`），可直接取 `sv.deep` 或 `sv.fill` 作为填充色，并配 `rgba(52,58,64,0.9)` 一类深色描边（与既有 `drawGearBadge` 的深色底块口径一致）。同时**在箭头下方加一圈深色底衬**（类似齿轮角标的 `rgba(52,58,64,0.85)` 圆底），确保在任何背景/叠层上均可辨。

**Alternatives**:
- 保留纯白箭头但**加深卡面**（把卡面渐变改深一档）——影响 60 关全部滑块观感，改动面大，不推荐。
- 箭头改为"白填充 + 深色 1.5px 描边"（最小视觉变更，保留"白色箭头"既有美术意图）——**推荐**：仅改 `strokeStyle` 一行即可获得对比度，spec FR-034 §3 的"带白色描边"字面要求需同步在 spec 中消解（白描边在白底座上不可辨，条款本身不自洽）。

**Files likely to change**:
- `src/render/BoardRenderer.js` — `drawWingBadge()` 的 `fillStyle`/`strokeStyle`/底衬绘制。
- `specs/001-slide-triple-match-core/spec.md` — FR-034 §3/§5 口径消解（白描边条款与可辨识度红线的冲突）。
- `specs/001-slide-triple-match-core/tasks.md` — T052i 复选框归位注记（其实现注记已声明三角箭头部分未实施）、T052k 验收项补三角箭头可辨识度断言。

**Tests to add or update**:
- **形态一致性回归测试（新增，最关键）**：同一断言集在 `file://` 与 `http://` 双形态下运行且结果一致——① `chipSVG` 返回贴图型 chip（非 Emoji）；② 切片角点 alpha = 0（白键控生效）；③ `toDataURL`/`getImageData` 不抛 SecurityError。现有 `tools/browser-bugtest.js` 已具备 CDP 驱动能力（可扩展 `--mode file|http`），是天然落点。
- **像素级断言**：棋盘画布上取一枚滑块朝向边缘 9×9 邻域，断言**亮度跨度 ≥ 某阈值**（当前实测 2.9，修复后应 ≥ 40），锁死 Bug C 回归。
- **几何断言**：棋盘 canvas 位图宽高比与 CSS 盒宽高比一致（|差值| < 1%），锁死纵向拉伸回归；`hitTest` 在非正方形棋盘上的命中准确性同步断言（点击各格中心应命中对应格）。
- **清晰度断言**：棋盘区域拉普拉斯方差（实测当前 1321.5）设下限阈值，防 `imageSmoothingQuality` 回退为 `'low'`。
- **Node 侧**：扩展 `tools/render-selftest.js` 场景 F（现有 15 格注册/水印跳过/Emoji 表断言）为——切片分辨率档位断言、`ensureSinglesFor` TOCTOU 不覆写已有 sheet 来源的断言（当前 5/45 不一致）。
- **SC-006 复验**：空 assets 目录 + 满 assets 目录 × `file://`/`http://` **四形态**完整跑通（现仅两形态）。

## Risks & Considerations

- **Bug A 修复涉及离线预处理流水线**：图集需从"JPEG-in-png"转为"真 PNG + 抠底"，须新增 Node 工具并重新产出 `assets/icons/sheet{1..3}.png`——会改变仓库二进制资产，且需复核宪章 III v2.0.0"核心代码零强制二进制依赖"（assets 为可选增强目录，改动不触宪章）。
- **`file://` 污染是浏览器安全模型的硬约束**：只要走 `getImageData`/`toDataURL`/`toBlob` 就必然受限。**修复方向必须是"不导出像素"（Canvas 直绘）或"预处理好源图"（离线抠底）**，任何"在 file:// 下想办法导出"的方案都不可行——这是本次评估最关键的约束。
- **DPR 2x 下限的性能代价**：位图面积 ×4，8×8×5 层满载 60fps 预算需重新实测（T052k 第⑤项已含此抽查）。必要时改为"按格宽自适应切片档 + 仅图标层 2x，背景层 1x"的折中。
- **`resize()` 位图口径改动会波及 `hitTest`/`cell`/动画坐标**：`cell = boardPx / n` 的前提是正方形。改为非正方形位图后 `cell` 必须取 `min(width,height)/n` 或分别计算横纵 cell，且 `draw()` 内所有 `cell` 乘法、`drawAnim` 的坐标、`hitTest` 的归一化**须同步复核**——这是本轮改动中**回归风险最高**的一处，务必由"点击命中准确性"像素级断言锁死。
- **降低白纱/模糊会削弱滑块对比度**：spec.md:135 的可读性红线与 Δ14 "背景层与棋盘层间设半透明蒙版/暗角过渡"是硬要求。祛雾与保对比是**此消彼长**关系，须以"滑块/方向角标/机制标记对比度不低于黑底基准"为验收口径做取舍，不可单纯把 opacity 归零。
- **Bug C 改动会偏离既有美术意图**："白色箭头"是 Δ15c 明确指定的视觉（消灭猪鼻子造型）。改深色描边属**对已锁定规格的偏离**，须同步修订 spec FR-034 §3/§5 并在 tasks.md 记录，避免 spec 与实现再次漂移（本次三 Bug 全部源于此类漂移）。
- **三角箭头是"已登记未交付"欠账**（T052i 实现注记明写未实施、T052k 未勾选），修复应在 M3.6 门（T052k）内收口，而非新增独立里程碑，否则 Δ15 验收门形同虚设。
- **无头浏览器探针已验证可行**（本评估即以 CDP 实机探针完成），可复用于 `/speckit-bug-test` 的修复验证；但注意 `--disable-gpu` 下的 `imageSmoothingQuality` 行为与真机可能存在差异，**清晰度类断言建议在真机或开启 GPU 的 headless 复测一次**。

## Open Questions

- [NEEDS CLARIFICATION: 是否有真机（iOS Safari / Android Chrome）截图可交叉验证？本评估全部基于 Chromium 142 headless，`file://` 污染行为在 Safari 上同样成立，但 `imageSmoothingQuality` 与 `backdrop-filter` 的渲染差异可能导致 Bug B 的主观观感分级不同]
- [NEEDS CLARIFICATION: `assets/icons/sheet{1..3}.png` 为 JPEG 字节流命名 .png——是产出方的既定规范（后续仍走 JPEG）还是需要转为真 PNG？这决定 Bug A 修复走"离线转真 PNG"还是"保留 JPEG 但离线抠底+转 PNG 容器"（JPEG 有损压缩噪点会干扰白键控阈值判定，实测 242/242/242 的白键控阈值对 JPEG 噪点敏感）]
- [NEEDS CLARIFICATION: Bug C 的白描边是 FR-034 §3 的硬性字面要求还是可由 §5 可辨识度红线覆盖？若以 §5 优先，需正式记录 spec 消解条款（参照 Δ13/Δ15 的"受控消解"写法）]
- [NEEDS CLARIFICATION: 切片提分辨率后，8×8 与 4×4 关卡是否需分档缓存？（现 `sliceCanvasOf(bid)` 无档位概念，提升分辨率需引入尺寸档以免小关卡浪费内存）]
- [NEEDS CLARIFICATION: 是否接受为降低雾感而调整 `#board` 白纱不透明度（0.22 → 0.10~0.12）？该值影响 60 关全部背景观感与 FR-035 §4 可读性，需产品侧确认视觉取向]
