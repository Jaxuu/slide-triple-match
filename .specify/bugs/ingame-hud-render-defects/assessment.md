# Bug Assessment: 局内 9 项渲染 / 交互 / UI 缺陷（点击坐标分裂、错位灰黑遮罩、卡牌留白、顶栏与待消槽样式）

- **Slug**: ingame-hud-render-defects
- **Created**: 2026-10-22
- **Source**: pasted text（Level 12 实机截图 + 9 项现象描述；本地复核截图见同目录 `ingame-level12-before.png`）
- **Verdict**: valid（9 项全部在代码中定位到成因；Bug 1 经实机 CDP 探针复现并量化）
- **Severity**: critical（Bug 1 使棋盘右半 / 下半区完全不可点、左上半区点击错位到「一半坐标」的卡牌——核心操作循环在 8×8 关直接不可玩；Bug 2 为全盘级视觉损坏）

## Report (verbatim or summarized)

> 请针对当前局内界面（实机截图）暴露出的 9 项渲染、交互与 UI 缺陷进行根因评估：
>
> 1. **Bug 1（致命交互错位）**：点击最上方的小鸡无反应，点击右下角的卡牌却触发上方第一层的小鸡飞出。疑似 `hitTest()` 的点击坐标换算与实际渲染坐标分裂（`dpr=2` 超采样或 `boardOrigin` / `cellStep` 不一致）。
> 2. **Bug 2（渲染伪影）**：棋盘上出现大量错位漂移的灰黑色半透明阴影块。决定**彻底移除「被压卡牌变暗遮罩」机制**。
> 3. **Bug 3**：同层卡牌依然分散未紧贴，且每张卡牌内部有一个多余的内嵌小方框，导致动物图标过小、留白过多。
> 4. **Bug 4**：棋盘区域四周有一圈细白色边框线。
> 5. **Bug 5**：待消区 `#dock` 使用了花哨的竖条纹棕色木板背景与槽内横线，需改为简约外框 + 7 个深色半透明圆角方框。
> 6. **Bug 6**：待消区右上方出现多余的 `♥♥♥ 30 x1`（生命 + 旧分数连击），需彻底删除。
> 7. **Bug 7**：去掉顶栏正中央的 `关卡 12`，把 `IQ` 移到顶栏正中央，仅保留极简 `IQ: XX`（去掉大脑图标与 `· 敏锐直觉` 称号）。
> 8. **Bug 8**：左上角「大厅」「设置」按钮内部带文字且图标偏小，需改为 Q 弹纯图标按钮。
> 9. **Bug 9**：局内右上角及道具购买角标的棱晶图标为蓝钻石 `💎`，与大厅右上角七彩棱晶 SVG 不一致，需统一。

## Symptom

局内（Level 12，8×8）界面整体可用性受损：**棋盘点击判定与绘制坐标系不一致**（点击右下角卡牌却让左上方卡牌飞出，大量区域点了没反应）；**棋盘上覆盖着成片错位的灰黑半透明方块**；**卡牌之间留有约 16% 的背景缝隙**且卡面内套一层多余边框，图案显小；棋盘四周有一圈白线；顶部待消槽是厚木纹 + 金属框 + 槽内横线；待消槽右上角挂着 `♥♥♥ 分数 连击`；顶栏中央是 `关卡 12` 而 IQ 独占第二行；左上角两个圆形按钮内塞了「大厅」「设置」小字；右上角棱晶是蓝色 💎 Emoji，与大厅的七彩切面棱晶 SVG 不同源。

预期：点击哪张牌就让哪张牌飞出；棋盘无任何遮罩伪影；同层卡牌 1px 紧贴、卡面单一干净边框、图案占满卡面；棋盘无外框线；待消槽为简约深色半透明 7 槽；次级信息栏与冗余生命/分数/连击全部移除；`IQ: XX` 居中于顶栏；左上是两枚无文字大图标圆按钮；棱晶图标与大厅完全同源。

### 逐项判定

| # | 现象 | 判定 | 严重度 | 复现方式 |
|---|---|---|---|---|
| 1 | 点击坐标与渲染坐标分裂 | **valid**（实机探针量化） | critical | 8×8 关，点击右下/右半区 |
| 2 | 错位灰黑半透明块 | **valid** | high | 任意含 2 层以上堆叠的关卡 |
| 3 | 卡牌缝隙 + 内嵌小方框 + 图标偏小 | **valid** | high | 任意关卡目视 |
| 4 | 棋盘外围 1px 白线 | **valid** | low | 任意关卡目视 |
| 5 | 待消槽木纹/金属/槽内横线 | **valid**（但与 FR-047 §3 冲突，见风险） | medium | 任意关卡目视 |
| 6 | 生命/分数/连击次级栏 | **valid**（但与 FR-003 生命反馈口径冲突） | medium | 任意关卡目视 |
| 7 | 顶栏中央 `关卡 X` + 独立 IQ 条 | **valid**（但与 FR-047 §1/§2 冲突） | medium | 任意关卡目视 |
| 8 | 圆按钮带文字、图标偏小 | **valid** | low | 任意关卡目视 |
| 9 | 棱晶图标与大厅不一致 | **valid** | low | 局内右上角 / 道具次数耗尽后角标 |

## Reproduction

1. 在仓库根目录起静态服务（`python -m http.server 8765`）或直接双击 `index.html`，访问 `index.html?level=12`（Level 12 为 8×8、含 5 层堆叠，是本次实机截图对应关卡）。
2. **Bug 1**：等棋盘出现后，点击视觉上「右下角」的卡牌 → 无任何反应；点击视觉「左上方」的卡牌 → 实际飞出的可能是另一张牌。
3. **Bug 2**：观察棋盘中部偏右区域 → 成片灰黑色半透明矩形，边缘与任何卡牌边界都不重合，且随着卡牌移除而移位。
4. **Bug 3/4**：观察任一卡牌 → 卡牌之间露出背景、卡面内还有一圈明显的内框、动物图案四周留白大；棋盘矩形四周有一条 1px 浅白描边。
5. **Bug 5/6/7/8/9**：观察顶部区域 → 木纹条纹托盘 + 槽内白色横线；IQ 条右侧 `♥♥♥ 分数 连击`；顶栏中央 `关卡 12`；左上两枚按钮内有「大厅」「设置」小字；右上角为蓝色 💎。
6. **[NEEDS CLARIFICATION: 实机截图是在 `file://` 双击形态还是静态服务形态下截取？]** 这一项影响 Bug 3「内嵌小方框」的表现强度（见根因 §3）。

### 实机探针（本次评估实测，Chrome 视口 800×856，`devicePixelRatio = 1`）

```
#board.getBoundingClientRect() = { x: 182.875, y: 242.047, w: 434.234, h: 434.234 }
canvas.width = canvas.height     = 908          // renderer 强制 dpr = max(2, devicePixelRatio)
cell = boardPx / n               = 908 / 8 = 113.5   // 绘制坐标系 = 位图像素
hitTest.scaleX = (boardPx / dpr) / rect.width = 454 / 434.234 = 1.0456
```

对「顶行 4 张未被压卡牌」的可视中心逐一点击（`pointerdown` 走 `main.js:onBoardDown` → `renderer.hitTest`），并拦截 `session.tap` 记录实际命中 id：

| 点击的可视卡牌（r,c,z） | 点击屏幕坐标 | 期望命中 | 实际命中 |
|---|---|---|---|
| (0,0,1) | (237, 296) | id 2 | **id 2** ✅（x 偏移为 0，恰好重合） |
| (0,1,1) | (291, 296) | id 5 | **无** |
| (0,5,1) | (509, 296) | id 3 | **无** |
| (0,6,1) | (563, 296) | id 0 | **无** |

另一次「右下角」点击 (552, 624)（可视 85% / 88% 位置）同样**无任何反应**。

换算关系：可视归一化位置 `u` 被映射到绘制归一化位置 `v = u / 2`（`boardPx/dpr` 与 `cell = boardPx/n` 之间差了一个 `dpr`，再叠加 `side(454) / rect.width(434.23)` 的 4.5% 误差）。**即：整块棋盘只有左上 1/2 × 1/2 区域能被命中，且该区域内的点击会被映射到「一半偏移」处的卡牌。**

## Suspected Code Paths

### Bug 1 —— 点击坐标与绘制坐标分裂
- `src/render/BoardRenderer.js:690` — `var dpr = Math.max(2, global.devicePixelRatio || 1);` 强制 2x 超采样（DPR=1 屏也会得到 `boardPx = 2 × CSS 边长`）。
- `src/render/BoardRenderer.js:789` — `cell = boardPx / (lastProbe ? lastProbe.n : 5);` **`cell` 的单位是位图像素**。
- `src/render/BoardRenderer.js:943` — `if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);` **每帧把变换重置为 identity**，因此 `draw()` 全程以位图像素为坐标单位（0..908）。
- `src/render/BoardRenderer.js:797-806` — `setBitmapSize()` 里虽然设过 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`，但 `draw()` 首行就把矩阵改回 identity（只有「未进入 `draw()`」时才残留 dpr 矩阵）。
- `src/render/BoardRenderer.js:1347-1348` — `hitTest()` 里 `scaleX = (boardPx / dpr) / rect.width`，**把点击换算回 CSS 像素（0..454）**，与 `draw()` 的位图像素口径（0..908）差 `dpr` 倍。
- `src/render/BoardRenderer.js:1361-1364` — 命中矩形 `tileX = cc * cell`（位图像素），进一步坐实「命中空间 = 绘制空间，但输入点被换算错了」。
- `src/render/BoardRenderer.js:1375-1390` — `tileRect()`（教学小手锚点）却用 `k = rect.width / boardPx`，**换算方向是对的**——同一份几何存在两套换算，说明是 `hitTest` 单点退化，而非坐标系设计如此。
- `src/render/BoardRenderer.js:1101-1103` — `layerOff = -cell * offK * Math.max(0, stackN - 1 - (t.z || 0))`：绘制时下层牌有堆叠错层偏移，而 `hitTest` 完全没有叠加该偏移（次级错位，最多 `0.28 cell`）。
- `src/render/BoardRenderer.js:1357` — `if (t.covered) continue;`：被压牌直接跳过（行为正确），但一旦坐标映射错误，落点很容易落在被压牌上 → 表现为「点了没反应」。

### Bug 2 —— 错位漂移的灰黑半透明块
- `src/render/BoardRenderer.js:1129-1136` — **被压变暗遮罩**：
  ```js
  if (t.covered) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
    roundRect(ctx, px + layerOff, py + lift - (cell * 0.84 * 0.15), cell * 0.84, cell * 0.84, cell * 0.15);
    ctx.fill();
  }
  ```
  `px/py` 是**牌中心**，但 `roundRect` 需要**左上角**；且遮罩的纵向锚点是 `py + lift - cell*0.126`，而卡面实际顶边是 `fz = y - thick * 0.85`（见 `drawTileBody:460`）。两处口径都不同 → 遮罩相对卡面向**右下**偏移约 `0.42 cell`，并随 `layerOff` 继续漂移。
- `src/render/BoardRenderer.js:1128` + `436-437` — **`layerOff` 被叠加两次**：调用 `drawTileBody(..., px + layerOff, py + lift, ..., layerOff, now)`，而 `drawTileBody` 内部又执行 `x = px - w / 2 + layerOff`。堆叠层的卡面被额外推开 `1×layerOff`，遮罩只偏移 `1×layerOff` → 两者必然错位。
- `src/render/BoardRenderer.js:1116-1126` — **层间环境阴影**同样以牌中心 `px/py` 当左上角绘制：`roundRect(ctx, px + layerOff + cell * 0.05, py + lift + layerOff + cell * 0.05, w, w, ...)`，再叠加 `globalAlpha = 0.16 * aboveN` → 与卡面错开约半格的大块灰影。
- `src/render/BoardRenderer.js:994-1009` — 给 `z > 0` 的牌在 `drawBoardTile` 外层设置 `ctx.shadowColor/shadowBlur`，该状态会作用于 `drawTileBody` 内**每一次 fill/stroke**（包括上述遮罩与阴影矩形），放大成矩形暗晕。
- `tools/render-selftest.js:1093-1094` — 现有自测只断言源码里「存在 `if (t.covered)` 与 `rgba(15, 23, 42, 0.32)`」，**从不校验其几何是否与卡面对齐**，因此该伪影长期通过测试。

### Bug 3 —— 卡牌分散 / 内嵌小方框 / 图标偏小
- `src/render/BoardRenderer.js:435` — `var w = Math.min(cell * 0.84, cell - GAP) * scale;`：`0.84 * cell` 恒小于 `cell - 1`，所以实际牌宽永远是 **0.84 cell → 同层相邻牌之间留 16% 背景缝隙**，与 `GAP = 1` 的「零缝隙」意图（`392` 行注释、FR-044 §1）相反。
- `src/render/BoardRenderer.js:468-476` — 卡面连续画两条描边：主题色描边（`lineWidth = dprSafe(1.8)`）+ **内缩 `dprSafe(1.5)` 的纯白描边**（半径从 `0.15` 收到 `0.13`）。在 `#FFFFFF→#F4F7FB` 卡面上，这条内白线 + 双层圆角半径差就是肉眼可见的「内嵌小方框」。
- `src/render/BoardRenderer.js:478` + `500-504` — 图标半径 `R = cell * 0.31`；sprite 实际绘制尺寸 `R * 2 * SPRITE_PAD`（`SPRITE_PAD = 1.55`，`93` 行）,而 sprite 内部切片只占 `band * 0.96 / (band * 1.55) = 62%`，图标内容又只占切片的 `63% × 58%`（本次实测 bbox）→ **最终动物仅占牌宽约 0.60 cell（≈ 68% 牌宽），且在 `file://` 下还会退化为白底方块**。
- `src/render/BoardRenderer.js:122-126` — `getSprite()` 用 `drawImage(src, off, off, sz, sz)` 把 256×256 切片画进加过 `maskRounded()` 的 sprite（`whiteKeySlice:216-217`）。**`file://` 下 `getImageData` 抛 `SecurityError`（`238-241` 行显式 catch），白底不会被扣掉，于是这张「圆角白底切片」被原样画进卡面 → 就是截图里那块内嵌小方框**（代码注释自己写明「贴图保留圆角白底」）。
- `src/render/BoardRenderer.js:199-243` — `whiteKeySlice()` 的白键控阈值 `> 242` 只对近纯白生效；图集是白底 3D 渲染，阴影/灰白渐变区域（238~242）会残留为浅灰边，即使 http 形态也会留下淡淡的方形边。

### Bug 4 —— 棋盘外框白线
- `css/style.css:340` — `#board { border: 1px solid rgba(255, 255, 255, 0.22); }`（`box-sizing: border-box`，见 `css/style.css:19`）。
- `css/style.css:341` — 同时有 `box-shadow: 0 10px 34px rgba(15, 23, 42, .28)`（报告未提，但同属「通透感」问题，建议一并收弱）。

### Bug 5 —— 待消区木纹 / 金属 / 槽内横线
- `css/style.css:373-381` — `#dock` 的银白金属渐变 + `0 5px 0 #6E7C90` 厚度边 + 内阴影。
- `css/style.css:383-399` — `#dock::before` 的 `repeating-linear-gradient(92deg, ...)` **竖条纹棕色木板** + `linear-gradient(#6E4728 → #34200F)` 内凹槽。
- `css/style.css:401-420` — `.slot` 的深色径向渐变 + 三重内阴影（厚重凹坑感）。
- `css/style.css:437-444` — `.slot.empty::after` 在空槽中央画一条 `42% × 3px` 的白色横线（报告所称「槽内横线」）。
- `index.html:64` / `src/main.js:804-820` — 槽位 DOM 与 7 格渲染逻辑本身无需改动，仅样式层重做。

### Bug 6 —— 多余的生命值 / 分数 / 连击
- `index.html:56-60` — `<div class="iq-side">` 内 `#hud-lives` / `#hud-score` / `#hud-combo`。
- `src/main.js:784-799` — `renderHud()` 每帧写入 `♥` DOM、`s.score`、`x{combo}` 并加 `bump` 动画。
- `src/main.js:364-366` — `els.hudLives / hudCombo / hudScore` 缓存。
- `css/style.css:239-258` — `.iq-side` 与 `#hud-lives .life` / `#hud-score` / `#hud-combo` 样式。
- `src/main.js:787` / `src/data/levels.js:52` 等 — 生命机制真实存在（`cfg.lives = 3`），且从第 2 章起 `damageOnBlock: true`（`levels.js:4274` 起）会真实扣命。

### Bug 7 —— 顶栏中央 `关卡 X` 与独立 IQ 条
- `index.html:38-40` — `.hud-center` 内 `#hud-title`（`关卡 <span id="hud-level-no">`）。
- `index.html:46-61` — 独立的 `#iq-bar`（含 `.iq-pill` 与 `.iq-side`）。
- `index.html:49` / `52-53` — `🧠` 图标、`·` 分隔、`#iq-title` 称号。
- `src/main.js:773-802` — `renderHud()` 写 `#hud-level-no` / `#hud-title` / `#iq-value` / `#iq-title`。
- `css/style.css:114-130`（`#hud-title` 立体白字）、`154-162`（`#iq-bar` 独立行）、`163-238`（`.iq-pill` 流光胶囊 + `.iq-brain/.iq-word/.iq-dot/#iq-title`）。
- `src/main.js:702-718, 720-760` — `IQ_TITLES` / `iqTitleOf` / `resetIq` / `addIq`：称号仅用于展示与升段音效，移除文本展示不影响数值逻辑。

### Bug 8 —— 左上角按钮文字与图标尺寸
- `index.html:29-36` — 两个 `.hud-round-btn` 内的 `.hud-round-ico` + `.hud-round-cap`（「大厅」「设置」）。
- `css/style.css:102-103` — 图标 `font-size: clamp(15px, 4cqw, 18px)`（设置键更小 `13~16px`）。
- `css/style.css:104-112` — `.hud-round-cap` 小字（`7~9px`）。
- `css/style.css:97-100` — `:active` 只有 `translateY(2px)`，无 Q 弹回弹。

### Bug 9 —— 棱晶图标不同源
- `src/ui/lobby.js:37-47` — `GEM_SVG`（七彩切面棱晶，**IIFE 内部私有常量**，`STM.Lobby` 导出清单 `782-790` 未包含它）。
- `index.html:42` — `#hud-shards` 初始文本为 `💎 0`。
- `src/main.js:779-783` — `els.hudShards.textContent = '💎 ' + bal;`（覆盖掉任何图标 HTML）。
- `src/main.js:862` — `var ITEM_PRICE_LABEL = '💎 50';`，`src/main.js:841` 写入 `.item-count`。
- `src/main.js:872 / 894 / 895` — 余额不足 toast、扣费飘字、消耗提示里的 `💎`。
- 其他同源不一致点（可一并收口）：`src/ui/fail.js:98`（`💎 100 棱晶复活`）、`src/ui/result.js:179`（`fly.textContent = '💎'`）、`src/ui/lobby.js:598`（`💎 ×150` 大奖预览）。

## Root Cause Hypothesis

### Bug 1（置信度：高 —— 实机探针复现 + 数学可证）

**绘制坐标系是「位图像素」，`hitTest` 却按「CSS 像素」解释点击点，两者相差 `dpr`（= 2）倍，再叠加 `side/rect.width` 的 4.5% 误差。**

`Δ15b3f`（commit `8bbef96`）为切断「测量自身→缩小写回」负反馈，改为 `draw()` 每帧 `setTransform(identity)` 且「尺寸只读父容器」；随后 `T081`（commit `12c20ad`）把 `cell` 改成 `boardPx / n`（位图像素）并在 `drawTileBody`/`draw()` 全量以位图像素作画，但 `hitTest` 保留了更早版本「除以 dpr 换算回 CSS 像素」的写法。于是：

- 可视点 `mx`（0..434）→ `cx = 1.0456 × mx`（0..454）；
- 而卡牌占据的是 `0..908` 的位图像素坐标；
- 结果：命中空间只有绘制空间的左上一半，且点击被映射到 `u/2` 处。

这与报告「点右下角 → 上方小鸡飞出」「点最上方小鸡 → 无反应」完全一致（`u>0.5` 时落点 `v>0.25`，通常落在被压牌或空隙上 → `hitTest` 返回 -1）。同一份几何在 `tileRect()` 中使用了正确方向的换算，说明这是 `hitTest` 的**单点回归**。

**为什么没被测出来**：`tools/verify-fix.cjs:211-234` 的「hitTest 回归」段落只声明了 `window.__hitGot = []` 并对每格派发 `pointerdown`，但**从未把命中结果写回 `__hitGot`，也没有任何 `check()` 断言**——段落注释声称「断言命中的 tileId 与该格最高 z 的滑块一致」，实际是死代码。`render-selftest.js` 只做源码字符串匹配，不执行真实几何。

### Bug 2（置信度：高 —— 代码几何可证，截图可见）

被压变暗遮罩与层间阴影都用**牌中心坐标当矩形左上角**，并且 `layerOff` 在 `drawTileBody` 内外各叠加一次；再叠加外层 `ctx.shadow*` 状态泄漏，于是每块遮罩/阴影相对卡面向右下偏移约 0.42~0.7 cell，且堆叠越深漂移越大——正是「大量错位漂移的灰黑色半透明阴影块」。

这条伪影不是贴图或浏览器问题，是纯几何口径分裂；报告要求的「彻底移除变暗遮罩」能消除最主要的一类块，但**层间环境阴影矩形（1116-1126）与 `layerOff` 双叠加必须同时处理**，否则移除遮罩后仍会留下半透明灰块。

### Bug 3（置信度：高 —— 三项独立成因，其中「内嵌方框」分形态）

1. **缝隙**：`Math.min(cell * 0.84, cell - GAP)` 让 `0.84cell` 恒生效 → 16% 缝。与 FR-044 §1「gap = 1px」直接冲突。
2. **内嵌小方框**：`file://` 形态下 `getImageData` 被跨源污染拦截（代码 `238-241` 显式降级），白键控整段跳过 → 256px 切片保留**圆角白底**，被 `drawImage` 原样画进卡面，形成一圈内嵌白色圆角方框；`http://` 形态下白键控生效，方框主要由「主题色描边 + 内缩白描边」的双层框线造成（`468-476`）。
3. **图标偏小**：图集单格中动物本体只占约 `63% × 58%`，再被 `SPRITE_PAD = 1.55` + `sz = band × 0.96` + `R = 0.31cell` 层层缩小，最终约 `0.60 cell`；若白底未扣（file://），观感进一步被白框挤压 → 「留白过多、动物太小」。

### Bug 4（置信度：高）

`#board` 自带 `1px rgba(255,255,255,0.22)` 描边。它同时是「棋盘矩形与位图边长不一致」的 2px 来源之一（`rect.width` 含边框），但**不是** Bug 1 的主因；修 Bug 1 必须用 `boardPx / rect.width` 做换算，不能依赖「边框被移除后尺寸刚好相等」。

### Bug 5 / 6 / 7 / 8（置信度：高 —— 纯 DOM/CSS 层）

分别为：`#dock::before` 木纹 + `#dock` 金属渐变 + `.slot.empty::after` 横线；`.iq-side` 三元素及其 `renderHud` 写入；`#hud-title` + 独立 `#iq-bar` 的信息层级；`.hud-round-cap` 文本 + 偏小的图标 `font-size`。

需要强调的是：**Bug 5、6、7 与现行 spec 文本冲突**，不是「实现偏离规格」，而是**用户对规格的再次修订**：
- FR-047 §3 明文要求待消槽为「厚重的立体深木色 / 银色金属内凹卡槽托盘」——Bug 5 要求改成简约深色半透明方框。
- FR-047 §1 明文要求顶栏正中央 `关卡 X`、右上角 `💎 棱晶数量`；§2 明文要求 IQ 条「位于顶栏下方」——Bug 7 要求去掉关卡、把 IQ 移进顶栏中央。
- FR-044 §4 明文要求被压牌「MUST 渲染 32% 深色变暗遮罩」——Bug 2 要求彻底移除。
- Bug 6 删除生命显示：FR-003 规定第 2/3 章受阻扣命，当前 `levels.js` 自第 2 章起 `damageOnBlock: true`，删掉后玩家在扣命关卡将**失去唯一的生命反馈**。

### Bug 9（置信度：高 —— 数据源私有化）

大厅用 `GEM_SVG`（`lobby.js:38-47`，七彩多边形），但该常量在 IIFE 内、未导出；局内只能用 `💎` 文本（`main.js:782`、`862`）。两个视图各自持有图标来源 → 必然不一致。`renderHud` 用 `textContent` 覆盖，即使 `index.html` 里写 SVG 也会被冲掉。

## Proposed Remediation

### Bug 1 —— 统一「绘制 / 命中 / 教学锚点」三处几何（首选）

在 `createBoardRenderer` 内新增唯一换算入口，并让 `hitTest`、`tileRect`、`drawBoardTile` 共用：

```js
/* 客户端坐标 → 位图坐标（与 draw() 的 identity 变换、cell = boardPx/n 完全同源） */
function toBoardPoint(clientX, clientY) {
  var rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { x: (clientX - rect.left) * (boardPx / rect.width),
           y: (clientY - rect.top)  * (boardPx / rect.height) };
}
```

`hitTest()` 改用该函数，并把命中矩形改成与绘制完全相同的表达式（含 `layerOff`）：

```js
var g = tileGeom(t);              // { rr, cc, w, layerOff }
var left = g.cc * cell + g.layerOff - g.w / 2;   // 与 drawTileBody 的 x 同式
var top  = g.rr * cell + g.layerOff - g.w / 2;
```

`tileRect()` 反向换算 `k = rect.width / boardPx` 保持不变（它本来就是对的），但应改为调用同一个 `tileGeom()`，避免第三套几何。

**Alternatives**：
- 把绘制空间改回 CSS 像素：`draw()` 里 `setTransform(dpr,0,0,dpr,0,0)` + `cell = (boardPx/dpr)/n`，同时**必须移除全部 `dprSafe()` 调用**（否则线宽/内缩会被二次放大）。改动面大，且直接触碰 `Δ15b3f` 的负反馈回归区（严禁再写 `canvas.style.width`），风险高于首选方案。
- 只在 `hitTest` 里乘 `dpr`：能修 90%，但仍留下 `side(454) vs rect.width(434)` 的 4.5% 残余误差（边框 + `calc(100% - 12px)` 造成），在大屏/横屏下会再次表现为「边缘点不中」。不推荐。

**Files likely to change**：`src/render/BoardRenderer.js`（`hitTest` / `tileRect` / `drawBoardTile` / 新增 `tileGeom` + `toBoardPoint`）
**Tests to add**：见下方「测试锁定」。

### Bug 2 —— 移除变暗遮罩（按产品决定）+ 清理全部重复几何

1. 删除 `1129-1136` 的 `if (t.covered)` 遮罩块。
2. `1128` 改为只传一次偏移：`drawTileBody(ctx, cell, px, py + lift, t, 1, 1, layerOff, now);`
3. 删除 `1116-1126` 的层间环境阴影矩形（卡体自带投影已足够表达立体），或改为复用 `tileGeom()` 的牌面矩形。
4. 删除 `draw()` 中 `z > 0` 分支的 `ctx.shadowColor/Blur/OffsetY` 设置（`994-1009`），只保留 `drawTileBody` 内部 `save/restore` 的局部投影，避免状态泄漏放大每次 fill。
5. 若后续仍需表达「被压不可点」，改用**同一路径内**的降亮度（把 `dim` 作为 `drawTileBody` 参数烘焙进牌面渐变与图标 alpha），而非另算一个矩形。

**Alternatives**：保留 32% 遮罩但用 `tileGeom()` 计算矩形（与卡面 100% 对齐）。技术上可满足 FR-044 §4，但与本次「彻底移除」决定相悖；若选此项必须同时补几何单测。

**Files**：`src/render/BoardRenderer.js`
**Tests**：`tools/render-selftest.js:1093-1094` 需改为断言「源码中不存在 covered 遮罩绘制」；新增「同层/跨层任意卡牌的遮罩矩形与牌面矩形零偏移」的几何单测（若保留遮罩）。

### Bug 3 —— 1px 紧贴 + 去掉双层框 + 图标按内容 bbox 归一

1. **紧贴**：`w = Math.min(cell - GAP, cell * 0.98) * scale;`（8×8 时 = `cell - 1`）。同步更新 `hitTest` 命中矩形与 `render-selftest.js:1088-1089` 的字符串断言。
2. **去内框**：删除 `473-476` 的白色内描边；只保留一条主题色细描边（`1.5px`），必要时用 `roundRect(x+1, fz+1, w-2, w-2, r-1)` 画一条 `rgba(255,255,255,0.35)` 的**单像素顶高光**而非整圈框。
3. **图标归一**：在 `whiteKeySlice()` 的 `getImageData` 阶段顺带算出内容 alpha bbox 并缓存到 `slices[bid].__bbox`；`drawBestiaryIcon()` 改为绘制 sprite 的 bbox 子矩形，缩放到 `w * 0.78`（受 `w` 约束，避免压到方向角标）。`file://`（tainted）下 bbox 不可得 → 回退到固定 `0.62 * w`，并在 `warnOnce` 里留痕。
4. **file:// 白底**（真正的「内嵌方框」）：建议**离线预处理图集**——用 Node 工具把 `sheet{1..3}.png` 转成「已扣白底、真 RGBA PNG」的 4×4 图集（512/格）。运行时只 `drawImage`，不需要 `getImageData`，`file://` 与 `http://` 表现一致，同时彻底消除白框与白键控阈值残留。若不做预处理，次选是把 `getImageData` 失败时的降级改为「绘制一层与卡面同色的圆角底 + `mix-blend-mode` 近似」——但 canvas 内无逐像素混合，视觉仍会有边。

**Files**：`src/render/BoardRenderer.js`（`drawTileBody` / `drawBestiaryIcon` / `getSprite` / `whiteKeySlice`）、`assets/icons/sheet{1..3}.png`（若采用预处理）、新增 `tools/icon-sheet-prep.js`
**Tests**：卡面宽度 == `cell - 1 ± 0.5px`；图标不透明 bbox 宽度 ≥ `0.55 * cell`；`file://` 与 `http://` 两种形态下卡面角点像素一致性抽样。

### Bug 4 —— 去掉棋盘外框线

`css/style.css:340` 删除 `border`（或 `border-color: transparent`）；`341` 的 `box-shadow` 收弱为 `0 8px 22px rgba(15,23,42,.18)`，保留轻微悬浮感但不再有明显暗边。

注意：**不要**把「移除边框」当作修 Bug 1 的手段——坐标换算必须与 `rect.width` 解耦。

### Bug 5 —— 简约外框 + 7 个深色半透明圆角方框

```css
#dock {
  background: rgba(10, 16, 24, 0.26);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(8, 15, 24, 0.18);
  /* 删除 #dock::before 木纹层与 0 5px 0 厚度边 */
}
.slot {
  border-radius: 10px;
  background: rgba(8, 14, 22, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.slot.empty::after { content: none; }       /* 删除槽内横线 */
.slot.has-tile { box-shadow: 0 0 10px rgba(126, 220, 255, 0.32); }
```

`renderDock()` / 7 格 DOM 结构不变。同步修订 **FR-047 §3** 的口径（见风险）。

### Bug 6 —— 删除次级栏（含生命/分数/连击）

1. `index.html:56-60` 删除 `.iq-side` 整块。
2. `src/main.js`：删除 `els.hudLives / hudCombo / hudScore` 及 `renderHud()` 中 `784-799` 的写入（保留 `s.score/s.combo` 逻辑本身，结算页仍在使用）。
3. `css/style.css:239-258` 删除 `.iq-side` 与 `#hud-lives / #hud-score / #hud-combo` 规则。

**为 FR-003 兜底的建议（首选带条件）**：仅在 `currentLevel.cfg.damageOnBlock === true` 的关卡，于棱晶胶囊左侧渲染一枚极简 `♥ n`（无动画、无分数、无连击）；`damageOnBlock === false` 的关卡（含 Level 12）完全不出现——既满足「待消区右上角不再有 ♥♥♥ 30 x1」，又不会让第 2/3 章的扣命变成「无反馈的暗改」。若产品确认后期关卡也不需要，则直接删净并在 spec 中注明。

### Bug 7 —— 顶栏中央改为极简 IQ

1. `index.html`：`.hud-center` 内放 `#iq-pill`，内容仅 `<span class="iq-word">IQ:</span><b id="iq-value">90</b>`；删除 `#hud-title`、`#iq-bar` 整块、`🧠`、`·`、`#iq-title`。
2. 保留 `<span id="hud-level-no" hidden>1</span>`（a11y / 自动化断言 / 调试需要），`renderHud()` 继续写它，但不再可见；同时把 `#hud` 的 `aria-label` 设为「关卡 X」。
3. `renderHud()` 中 `els.iqTitle` 写入改为空守卫（元素已不存在），`IQ_TITLES` 仅保留给升段音效/动画判定。
4. CSS：删除 `#hud-title`、`#iq-bar`、`.iq-brain`、`.iq-dot`、`#iq-title`、`.iq-side`；`.iq-pill` 去掉 `animation: iq-shimmer`（顶栏内持续扫光会干扰阅读），保留 `level-up` / `iq-broken` 反馈。
5. `#app.scene-lobby #iq-bar` 选择器随元素删除一并清理。

### Bug 8 —— 无文字 Q 弹图标按钮

1. `index.html:31 / 35` 删除 `.hud-round-cap` 两个 span。
2. `css/style.css:102-103` 图标放大：`font-size: clamp(20px, 5.6cqw, 26px)`，设置键与大厅键同尺寸。
3. 删除 `.hud-round-cap` 规则（`104-112`）。
4. `:active` 增加回弹：`transform: translateY(2px) scale(.94); transition: transform .16s cubic-bezier(.2,1.6,.4,1)`（松手回到 1 时有过冲 = Q 弹）。
5. 可选但推荐：`↩` 与 `⚙️` 换成内联 SVG（与 Bug 9「去 Emoji 化」口径一致，避免各平台 Emoji 字形差异）；`aria-label` / `title` 已存在，删文字不损失可访问性。

### Bug 9 —— 棱晶图标单一来源

新建 `src/ui/prism-icon.js`（置于 `lobby.js` 之前加载）：

```js
(function (global) {
  var STM = global.STM = global.STM || {};
  var SVG =
    '<svg class="prism-gem" viewBox="0 0 32 32" aria-hidden="true">' + /* 现 GEM_SVG 的 7 个 polygon，原样搬移 */ '</svg>';
  STM.PrismIcon = { SVG: SVG, html: function (cls) { return SVG.replace('class="prism-gem"', 'class="' + (cls || 'prism-gem') + '"'); } };
})(typeof window !== 'undefined' ? window : globalThis);
```

- `src/ui/lobby.js`：删除私有 `GEM_SVG`，改用 `STM.PrismIcon.html('lobby-gem')`（保持 `.lobby-gem` 的 `width/height:100%` 规则不变）。
- `src/main.js`：`renderHud()` 改为
  `els.hudShards.innerHTML = STM.PrismIcon.SVG + '<b>' + bal + '</b>';`
- `src/main.js`：`renderItemBadge()` 在 `!hasFree` 时写入
  `cnt.innerHTML = STM.PrismIcon.html('prism-gem-sm') + '<span>50</span>';`
- 文案类（`toast` 用 `textContent`，无法放 SVG）：把 `'棱晶不足，需要 50 💎'` → `'棱晶不足，需要 50 棱晶'`；`spawnShardFloat('-50 💎')` → `'-50 棱晶'`（或把 float 改成 `innerHTML` 并内嵌小图标）。
- CSS：`.prism-gem { width: 1.08em; height: 1.08em; display: block; flex: none; }`、`.prism-gem-sm { width: 11px; height: 11px; display: block; }`、`#hud-shards { display: inline-flex; align-items: center; gap: 4px; }`、`#items .item-count { display: inline-flex; align-items: center; gap: 3px; }`。
- 可选同族收口：`fail.js:98`、`result.js:179`、`lobby.js:598`。

**Files**：新增 `src/ui/prism-icon.js`；`index.html`（脚本序，`lobby.js` 之前）；`src/ui/lobby.js`；`src/main.js`；`css/style.css`。

### 测试锁定（跨 Bug）

1. **几何单测（最高优先）**——Node + 2D 桩：对 `n ∈ {5,6,7,8}`、`dpr ∈ {1,2,3}`、`rect.width ∈ {sideCss, sideCss×0.95, sideCss×1.05}`，断言 `hitTest(卡牌可视中心) === 该卡牌 id`（含奇偶层半格偏移、含 `layerOff`、含 `covered` 跳过），并断言四角外点击返回 -1。
2. **浏览器 E2E 命中回归**——修好并启用 `tools/verify-fix.cjs:211-234` 的**死断言**：拦截/包装 `session.tap` 记录实际 id，逐格断言 `tapId === 预期顶层 id`；对 8×8 关至少覆盖 4 个象限各 3 格。这是唯一能真正防住 Bug 1 复发的测试。
3. **像素断言**——棋盘无「非卡牌矩形」的灰黑半透明块：对已知被压牌位置采样，断言其亮度不低于同层未被压牌的 85%（若保留变暗），或断言不存在 `alpha > 0.2` 且色相为中性灰的连片像素（若移除）。
4. **布局断言**——`#board` 的 `border-width === 0`；相邻同层牌间距 == 1px；单张牌内不存在「内框」（沿牌中心横线采样，只允许一条描边色阶突变）。
5. **HUD 断言**——`#hud` 内文本包含 `IQ:` 且不含 `关卡`；`#hud-lives / #hud-score / #hud-combo / #iq-bar / #hud-title` 均不存在；`.hud-round-cap` 不存在。
6. **图标同源断言**——`#hud-shards svg`、`.item-count svg` 与 `.lobby-shards-icon svg` 的 `polygon` 数量与 `points` 完全一致；`document.body.innerText` 中不再出现 `💎`（局内）。

## Risks & Considerations

- **规格冲突（必须先裁决）**：本报告的 Bug 2 / 5 / 6 / 7 直接改写 FR-044 §4、FR-047 §1/§2/§3 的明文要求。若只改代码不改 spec，`/speckit.analyze` 与契约检查会把修复判为「违约」；且后续 Solver/文档会以旧口径回归。建议在 fix 阶段同步执行 `/speckit.refine.update` + `/speckit.refine.propagate`，把 FR-044 §4（变暗）、FR-047 §1（关卡 X）、§2（IQ 条位置）、§3（厚重木/金属托盘）改写为本次口径，并更新 `specs/001-slide-triple-match-core/tasks.md` 的 T084/T085 断言。
- **教学文案联动**：`spec FR-046 §2` 与 L2 教学文案明确用「深色卡牌被上层压住」教学；移除变暗后必须改写为「被上层压住的卡牌不可点（观察层叠关系）」，并让 `tutorial.js` 的高亮/小手仍指向可操作牌。
- **生命反馈缺口**：`damageOnBlock` 自第 2 章起为 true。彻底删除 `#hud-lives` 会让扣命变成无反馈（FR-003 的「明确反馈」受损）。建议采用「仅扣命关卡显示极简 ♥ n」的条件方案。
- **坐标系修复的回归面**：`cell` 同时被 `drawBoardTile` / `anim` / `particles` / `shards` / `tileRect` / `hitTest` 使用，任何「顺手把 cell 改成 CSS 单位」的改动都会连带影响粒子速度、碎片重力（`0.12 * dpr`、`0.22 * dpr`）与飞行终点（`slotX = ... / 7 * boardPx`）。**首选方案只改点击换算，不动 `cell`**，把风险收敛到一个函数。
- **`Δ15b3f` 铁律**：任何修复都不得恢复 `canvas.style.width/height` 回写；`resize()` 必须保持幂等（`lastSideCss` 与位图比对）。Bug 3 改牌宽/外框后尺寸会变化，务必回归「连续点击不缩小」用例。
- **file:// 跨源污染**：白键控与 DataURL 两条链在 `file://` 下都被击穿（历史 bug `visual-render-consistency` 已实测）。Bug 3 若依赖 `getImageData` 做 bbox，必须保留 tainted 降级路径；否则双击形态会出现「图标消失 / 白框」。
- **性能**：`getSprite` 已按 `bid × 尺寸档` 缓存；改牌宽会把尺寸档从 `cell×0.31` 变为 `w×0.39` 左右，缓存键数量不增。但 bbox 归一化若在每帧 `getImageData` 会直接掉帧——**只能在切片阶段算一次**。
- **测试口径漂移**：`tools/render-selftest.js` 目前是字符串匹配（`1088-1094`、`1103-1106`），会把「实现写法」当契约。改实现必然要改这些断言；建议同时把关键项升级为行为断言（见测试锁定）。
- **未验证项**：本次实测为桌面 Chrome（DPR=1，视口 800×856）。真机 DPR=2/3、安全区、横屏下的比例需在 Bug 1 修复后复跑（`tools/responsive-check.js` 已有骨架）。

## Open Questions

- [NEEDS CLARIFICATION: FR-044 §4「32% 变暗」是正式作废（改由层叠错位 + 牌体投影表达「被压」），还是保留语义但改为「同一路径内降亮度」？这决定 Bug 2 的最小实现与教学文案。]
- [NEEDS CLARIFICATION: 关掉变暗后，被压牌是否需要另一种「不可点」提示（例如牌面图标降饱和 15%、或方向角标变灰）？]
- [NEEDS CLARIFICATION: 生命值显示是否按「仅 `damageOnBlock` 关卡显示 `♥ n`」保留？若坚持全删，第 2/3 章扣命是否需要替代反馈？]
- [NEEDS CLARIFICATION: `关卡 X` 从顶栏移除后，玩家是否还有其他地方能看到当前关号（大厅按钮 / 结算页 / 失败页）？是否需要保留一个不显眼的位置？]
- [NEEDS CLARIFICATION: 棱晶图标统一的收口范围仅限局内顶栏 + 道具角标，还是连同失败页 `💎 100 棱晶复活`、结算飞入棱晶、大厅 `💎 ×150` 奖励预览一并替换？]
- [NEEDS CLARIFICATION: 实机截图是 `file://` 双击形态还是静态服务形态？（影响 Bug 3「内嵌方框」是白底残留还是双层描边）]
