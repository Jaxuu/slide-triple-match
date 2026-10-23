# Bug Assessment: 图标右侧裁切 / VFX 瀑布未生效 / IQ 超长小数（三合一）

- **Slug**: icon-vfx-iq-defects
- **Created**: 2026-10-23
- **Source**: pasted text（实机截图 + 3 项现象描述）
- **Verdict**: valid（3 项均在代码中定位到成因；Bug 1/2 为 Δ20/T090 阶段回归/半成品，Bug 3 为数值格式化缺失）
- **Severity**: high（Bug 1 影响每张卡牌的动物贴图观感；Bug 2 使三消的核心反馈（白瓷瀑布）完全失效并残留旧半透明碎片；Bug 3 为显示层缺陷）

## Report (verbatim or summarized)

> 请针对当前实机截图暴露出的 3 项明显 Bug 进行根因评估：
>
> 1. **Bug 1（图标右侧被裁切显示不全）**：棋盘与待消槽中几乎每只小动物的右侧（及部分下侧）边缘都被一刀切平，显示不完整！排查点：`src/render/BoardRenderer.js` 中 sheet1~3 离屏切片的 `sx, sy, sw, sh` 计算是否偏移不对称，或 `0.09` 内缩过大切掉了动物右脸颊；或 `drawImage` 源宽高写死小尺寸（如 `128` 而不是 `slice.width` `256`），或目标绘制坐标 `(dx, dy)` 未按卡牌中心 `(x + w/2, y + h/2)` 对称居中。
> 2. **Bug 2（三消碎片依然是棋盘顶部的半透明旧碎片）**：触发三消后，碎片仍出现在棋盘 `#board` 顶行，是几乎看不清的半透明薄片；根本没有从上方 `#dock` 待消槽的 3 张消除卡牌位置爆出不透明的大量白瓷碎片瀑布！排查点：`src/main.js` 与 `src/render/BoardRenderer.js` 是否仍在运行旧 `#board` 内置半透明碎片逻辑而未真正禁用旧碎片并调用全屏 `#vfx-canvas` 瀑布发射器；`#vfx-canvas` 尺寸同步、rAF 循环、槽位坐标获取（是否在 `#dock` 清空前拿到 3 个 `.slot` 的 `getBoundingClientRect()`）、碎片填充色/不透明度（是否仍 `< 1.0`）是否存在缺陷。
> 3. **Bug 3（IQ 显示超长小数）**：顶栏正中央 IQ 显示为 `IQ: 86.74181818181818`，未取整！排查点：`src/main.js` 更新与渲染 `iqScore` 时未做 `Math.round()` 整数格式化。

## Symptom

- **Bug 1**：棋盘卡牌与待消槽 chip 中的动物贴图，其右侧与部分下侧被一条垂直/水平直线"切平"，动物右脸颊/右半身缺失；所有 45 个图鉴条目均受影响（sheet 三张图集统一出现）。
- **Bug 2**：三消触发后，`#board` 画布顶部中央仍爆出 48~60 枚小尺寸（r0 4~10px）白色多边形碎片（`shards` 池），观感为"几乎看不清的半透明薄片"；本应从 `#dock` 三个消除槽位置向全屏 `#vfx-canvas` 爆出的 135 枚不透明白瓷瀑布碎片（`vfxShards` 池）却因坐标/尺寸缺陷而退化为每个槽位一个 1×1 像素点的簇射，肉眼不可见。
- **Bug 3**：顶栏 `IQ: 86.74181818181818` 展示未经取整的浮点数；IQ 增量（`rawDelta = baseGain × comboMul × errorMul × timeMul`）天然为非整数，而显示层直接 `String(iqScore)`。

预期：动物贴图完整显示（右/下边缘不被裁切）；三消时仅 `#vfx-canvas` 上从 `#dock` 三个槽位爆出 135 枚不透明白瓷碎片瀑布，`#board` 画布不再出现旧碎片；IQ 恒为整数。

## Reproduction

1. 起静态服务（`python -m http.server 8765`），访问 `index.html?level=1`（或任意含贴图关卡）。
2. **Bug 1**：观察任意卡牌与待消槽 chip → 动物右侧/下侧被垂直/水平直线切平，右脸颊缺失；所有 45 条目一致。
3. **Bug 2**：完成一次三消 → `#board` 顶部中央出现一小簇半透明薄片；`#vfx-canvas`（z-index 950）上应出现的白瓷瀑布不可见或退化为点簇。
4. **Bug 3**：触发三消后观察顶栏 → `IQ: 86.74181818181818`。
5. [NEEDS CLARIFICATION: 实机截图是在 `file://` 双击形态还是静态服务形态下截取？] 影响 Bug 1「切平」是切片内缩导致（两形态一致）还是 `getImageData` 白键控失败导致的圆角白底残留（仅 file://）。

## Suspected Code Paths

### Bug 1 —— 图标右/下侧裁切
- `src/render/BoardRenderer.js:206-225` — `whiteKeySlice()`：`insetX = Math.round(cellW * 0.09)`（= 46px @ 512）、`insetY = Math.round(cellH * 0.09)`（= 46px），`sx = col*cellW + insetX`、`sy = row*cellH + insetY`、`sw = cellW - insetX*2`（= 420）、`sh = cellH - insetY*2`（= 420）。**0.09 内缩在 Δ20/T090 阶段由原 0.04 提升**，切掉动物延伸到单元格边缘的内容（实测 45 张图鉴中大量条目的非近白像素延伸至 x/y=511）。
- `src/render/BoardRenderer.js:209-216` — `sw/sh` 计算本身对称（`cellW - inset*2`），未发现左右不对称；`sw`/`sh` 均为 420，非"写死 128"。
- `src/render/BoardRenderer.js:225` — `c2.drawImage(img, sx, sy, sw, sh, 0, 0, S, S)` 使用 `sw/sh`（非写死 128），切片分辨率 `S = SLICE_PX = 256`。**"写死 128"子假设在当前代码中不成立**（仅历史注释残留）。
- `src/render/BoardRenderer.js:227` — `maskRounded(c2, S)`：圆角遮罩 `r = S * 0.12`（≈ 30.7px），仅切四角，不是右侧直线切平的主因。
- `src/render/BoardRenderer.js:107-129` — `getSprite()`：`sz = band * 0.96`、`off = (w - sz) / 2`、`c2.drawImage(src, off, off, sz, sz)`；`__sliceRect = {x: off, y: off, w: sz, h: sz}`。几何对称，无右偏。
- `src/render/BoardRenderer.js:547-564` — `drawBestiaryIcon()`：`ctx.drawImage(sp, sr.x, sr.y, sr.w, sr.h, cx - R, cy - R, iconSize, iconSize)`，目标区域以 `(cx, cy)`（= `x + w/2, y + w/2`）为中心对称，`R = iconSize/2`。**"目标坐标未按卡牌中心对称居中"子假设在当前代码中不成立**。
- `src/render/BoardRenderer.js:526` — `drawBestiaryIcon(ctx, sv, x + w / 2, y + w / 2, w * 0.85)`：图标中心严格为卡牌中心。
- `src/render/BoardRenderer.js:1678 / 1708` — `paintDockIcons()` / `paintAvatarCanvases()`：`c2.drawImage(slice, 0, 0, px, px)`，`px = max(64, round(cssW * dpr))`，源为整张 256 切片，无写死 128。
- 结论：Bug 1 的主因是 **0.09 内缩过大**（T090 阶段由原 0.04 提升），切掉了延伸到单元格右/下边缘的动物内容；"drawImage 写死 128 / 目标坐标不对称"两个子假设经代码核对不成立。

### Bug 2 —— 旧碎片残留 + VFX 瀑布失效
- `src/render/BoardRenderer.js:938-939` — `tick()`：动画 `match` 结束时同时调用 `spawnParticles(a, now)`（彩色粒子，应保留）与 `spawnShards(a, now)`（白瓷多边形碎片 → 推入 `shards` 池，绘制在 `#board` 画布）。**旧碎片逻辑未被禁用**，是"棋盘顶部半透明薄片"的直接来源。
- `src/render/BoardRenderer.js:976-1004` — `spawnShards()`：`cx = a.x != null ? a.x : cssSize / 2`、`cy = a.y != null ? a.y : -cell`，碎片半径 `r0 = 4 + rand*6`，数量 48~60；绘制在 board 画布顶部中央（`cy = -cell`），小尺寸 + alpha 衰减 → "几乎看不清的半透明薄片"。
- `src/render/BoardRenderer.js:1200-1222` — `draw()` 内 `shards` 池绘制循环：`ctx.globalAlpha = life/life0`，白色渐变填充，描边 `rgba(148,163,184,0.6)`。
- `src/main.js:1037-1065` — match 分支：已调用 `renderer.spawnDockShatter(rects)`（新 VFX 路径），但**未禁用旧 `shards`**；两条路径并行 → 旧碎片残留。
- `src/main.js:1042-1063` — 槽位坐标获取：在 `renderDock()`（line 1069）**之前**通过 `els.dock.querySelectorAll('.slot')` + `getBoundingClientRect()` 拿到 3 个槽位矩形，时序正确（未清空）。
- `src/render/BoardRenderer.js:1006-1036` — `spawnDockShatter(slotRects)`：`var rw = rect.w || 1, rh = rect.h || 1;` —— **DOMRect 没有 `w`/`h` 属性**（只有 `width`/`height`），因此 `rw = rh = 1`，135 枚碎片全部簇射在每个槽位的左上角 1×1 像素点，肉眼不可见。这是 VFX 瀑布"失效"的主因。
- `src/render/BoardRenderer.js:1022-1023` — `x: rect.x + Math.random() * rw`、`y: rect.y + Math.random() * rh`：坐标使用 `rect.x/y`（DOMRect 有该属性，等价于 left/top），位置本身正确，仅尺寸错误。
- `src/render/BoardRenderer.js:1076-1127` — `drawVfx()`：`globalAlpha = ratio > 0.2 ? 1.0 : ratio/0.2`，**碎片主体不透明度为 1.0**（非 `< 1.0`），填充 `#FFFFFF`/`#E2E8F0` 不透明色；不透明度缺陷不存在。尺寸同步使用 `innerWidth/innerHeight` + `setTransform(dpr)`，坐标系与槽位 viewport 坐标一致。
- `src/render/BoardRenderer.js:776-789` — `vfxCanvas` 初始化：优先 `document.getElementById('vfx-canvas')`（index.html 已声明），上下文获取正常；index.html line 69 / css/style.css `#vfx-canvas`（fixed, inset 0, z-index 950）。
- `src/render/BoardRenderer.js:911-929` — `frame()`：`draw()` 与 `drawVfx()` 同帧调用；`tick()` 更新 `vfxShards` 并在 `vfxShards.length > 0` 时置 `active = true` → `start()` 重调度 rAF，循环正常。
- `src/render/BoardRenderer.js:1034` — `spawnDockShatter` 末尾 `markDirty()` 触发渲染。
- 次级缺陷：css/style.css 定义了 `.slot-shattering` 180ms 碎裂动画，但 `src/main.js` 从未给消除槽添加该 class，"槽位碎裂驻留演出"未触发（非本次 3 项主因，但与 VFX 联动）。

### Bug 3 —— IQ 超长小数
- `src/main.js:705` — `var iqScore = IQ_START;`（IQ_START 为整数起点）。
- `src/main.js:737-749` — `addIq()`：`rawDelta = baseGain * comboMul * errorMul * timeMul`（浮点），`newScore = iqScore + rawDelta`，`iqScore = newScore`（浮点累加），无取整。
- `src/main.js:725` — `resetIq()`：`els.iqValue.textContent = String(iqScore);`
- `src/main.js:755` — `addIq()`：`els.iqValue.textContent = String(iqScore);`
- `src/main.js:802` — `renderHud()`：`els.iqValue.textContent = String(iqScore);`
- `src/main.js:757` — delta 显示已做 `Math.round(delta * 10) / 10`，但主值未取整。

## Root Cause Hypothesis

### Bug 1（置信度：高 —— 实测像素可证）
**T090 阶段将切片内缩从 0.04 提升至 0.09，内缩 46px，切掉了延伸到单元格右/下边缘的动物内容。** 实测 45 张图鉴中大量条目的非近白像素延伸至 x/y = 511（单元格右/下边界），0.09 内缩仅保留 420×420 区域，右侧/下侧约 46px 的动物内容被裁切 → "右侧一刀切平"。白键控（`> 242` 全透明、238~242 羽化）本可处理边缘白边，内缩并非必需；0.09 内缩是过度保守的"避开邻格阴影"策略的副作用。"drawImage 写死 128 / 目标坐标不对称"两个子假设经代码核对不成立（当前代码均使用 `sw/sh`、`slice.width`、卡牌中心对称坐标）。

### Bug 2（置信度：高 —— 代码几何可证）
**两条碎片路径并行且新路径坐标尺寸错误：** 旧 `shards` 池（board 画布、顶部中央、48~60 枚小碎片）在每次三消的 match 动画结束时仍被 `spawnShards` 触发，产生"半透明薄片"；新 `vfxShards` 池（`#vfx-canvas`、135 枚）虽被 `spawnDockShatter` 触发，但因 `rect.w/h`（DOMRect 不存在）退化为 `1`，135 枚碎片全部簇射在每个槽位的 1×1 像素点，肉眼不可见。VFX 的不透明度（1.0）、尺寸同步、rAF 循环、槽位坐标时序（renderDock 前获取）均正确，不是缺陷源。

### Bug 3（置信度：高）
**`iqScore` 为浮点累加值，三处显示点均直接 `String(iqScore)`，未取整。** `rawDelta` 天然非整数，累加后保留完整精度。

## Proposed Remediation

### Bug 1 —— 还原/减小切片内缩（首选）
- `src/render/BoardRenderer.js:209-210`：将 `insetX/insetY` 从 `Math.round(cellW * 0.09)` 降为 `Math.round(cellW * 0.02)`（≈ 10px）或 `0`，并同步 `sx/sy/sw/sh`。内缩过小可能带入邻格白边，但白键控（`> 242` 全透明 + 238~242 羽化 + 10px 边缘羽化）已处理白边，故内缩可趋近于 0。
- **Alternatives**：保留 0.04 内缩（原值）作为折中；或按内容 alpha bbox 计算切片边界（最精确但需 `getImageData`，file:// 下不可用，退化路径复杂）。首选"小内缩 + 白键控"。
- **Files**：`src/render/BoardRenderer.js`（`whiteKeySlice`、`whiteKeySliceSq` 两处内缩需同步：`whiteKeySliceSq` 使用 `PAD = Math.round(SS * 0.04)`，保持一致）。
- **Tests**：切片后动物非近白像素 bbox 不被裁切；`file://` 与 `http://` 两形态下卡面右/下边缘像素一致性抽样。

### Bug 2 —— 禁用旧碎片 + 修复 VFX 尺寸（首选）
1. `src/render/BoardRenderer.js:939`：删除 `if (a.kind === 'match') spawnShards(a, now);` 一行（保留 `spawnParticles`），彻底禁用 `#board` 画布旧碎片。
2. `src/render/BoardRenderer.js:1010`：`var rw = rect.w || 1, rh = rect.h || 1;` → `var rw = rect.width || rect.w || 1, rh = rect.height || rect.h || 1;`（或在 main.js 传入 `{x, y, width, height}`），使 135 枚碎片在槽位矩形内散布。
3. `src/render/BoardRenderer.js:1022-1023`：可选使用 `rect.left/rect.top` 替代 `rect.x/y` 提升兼容性（DOMRect 两者等价）。
4. `src/main.js:1064` 前：可选为 3 个消除槽添加 `.slot-shattering` class（180ms 碎裂驻留），与 VFX 同步；需在 `renderDock()` 重绘后清理。
5. 保留 `spawnParticles`（彩色粒子）与 VFX（白瓷瀑布）两层反馈，互不冲突。
- **Alternatives**：不删除旧 `shards` 而是将其重定向到 `#vfx-canvas`（改动面大，不推荐）。
- **Files**：`src/render/BoardRenderer.js`（`tick`、`spawnDockShatter`）、`src/main.js`（match 分支、可选 class）。
- **Tests**：三消后 `shards.length === 0`（或 `spawnShards` 不被调用）；`spawnDockShatter(rects)` 返回 135 且所有碎片坐标落在对应槽位矩形内；`#vfx-canvas` 上不透明碎片数量 ≥ 120。

### Bug 3 —— IQ 取整显示（首选）
- `src/main.js:725, 755, 802`：`String(iqScore)` → `String(Math.round(iqScore))`（三处）。
- 可选：`addIq` 内 `iqScore = Math.round(newScore)` 以保持内部一致性；但 delta 计算需在取整前完成（当前顺序已满足：`delta = newScore - iqScore` 在 `iqScore = newScore` 之前）。若内部取整，delta 仍基于原始 newScore 计算（当前代码 `delta = newScore - iqScore` 使用旧 iqScore，正确）。
- **Files**：`src/main.js`。
- **Tests**：`#iq-value` 文本匹配 `/^\d+$/` 且无小数点；三消后仍为整数。

## Risks & Considerations

- **Bug 1 内缩调整的白边风险**：减小内缩可能在 HTTP 形态下让邻格白边/阴影进入切片；但白键控 + 10px 边缘羽化已覆盖，且 0.04 原值也未出现白边投诉。建议先降到 0.02 观察，必要时降到 0。
- **Bug 1 file:// 跨源污染**：白键控在 file:// 下失败（`keyingOk = false`），切片保留圆角白底，绘制时用 `darken` 合成融入卡面。内缩调整不影响该路径，但需回归 file:// 形态。
- **Bug 2 旧碎片禁用的回归**：`shards` 池仍被 `draw()` 绘制循环引用；禁用 spawn 后池恒空，`shards.length > 0` 不再置 active，不影响 rAF（particles/vfxShards 仍驱动）。需确认 `spawnShards` 未在其他处调用（仅 line 939 与定义）。
- **Bug 2 VFX 坐标系**：槽位 rects 为 viewport 坐标，`#vfx-canvas` 为 fixed 全屏，两者一致；若应用容器有滚动/缩放，需重新校验。当前应用为 9:16 固定布局，无滚动。
- **Bug 2 性能**：135 枚碎片 × 每帧路径绘制，生命周期 750~950ms；在低端机可能掉帧，但与现有 `particles`（≤200）同量级，可接受。
- **Bug 3 内部精度**：若仅显示层取整，内部 `iqScore` 仍为浮点，称号判定（`iqTitleOf` 比较 min 阈值）与 delta 显示（`Math.round(delta*10)/10`）不受影响。若内部也取整，delta 可能为 0 的边界情况需处理（当前 delta 显示已容错）。

## Open Questions

- [NEEDS CLARIFICATION: Bug 1 实机截图是 `file://` 双击形态还是静态服务形态？影响"切平"是纯内缩导致（两形态一致）还是白键控失败导致的圆角白底残留（仅 file://）。]
- [NEEDS CLARIFICATION: Bug 1 内缩最终值取 0.02 / 0.04 / 0？需产品确认"避开邻格阴影"与"完整显示动物"的权衡。]
- [NEEDS CLARIFICATION: Bug 2 禁用旧 `shards` 后，是否仍需保留 48~60 枚"伴生碎片"作为 `#board` 局部反馈，还是完全由 `#vfx-canvas` 瀑布替代？]
- [NEEDS CLARIFICATION: Bug 2 的 `.slot-shattering` 槽位碎裂动画是否需要在本次一并启用（main.js 添加 class）？]
- [NEEDS CLARIFICATION: Bug 3 IQ 是否应显示为整数（`Math.round`）还是保留一位小数？报告明确要求取整，按整数处理。]