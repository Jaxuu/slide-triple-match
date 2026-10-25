# Bug Assessment: 大厅 BGM 无声 · 图标裁切缺损 · 落子音效拖尾 · 交互音效响度失衡

- **Slug**: `lobby-audio-and-icon-clip`
- **Created**: 2026-10-25
- **Source**: pasted text（实机测试反馈 4 条，无 URL）
- **Verdict**: **valid**（4 条全部在代码/素材层面证实；其中 Bug 1 用户怀疑的「接线/autoplay 漏接」**不成立**，真实成因是素材响度）
- **Severity**: **high**（Bug 1、Bug 2 —— 直接击穿 SC-018「8 个音频正常发声」与图标可辨识性）；**medium**（Bug 3、Bug 4 —— 听感品质问题，不影响可玩）

## 总览

| # | 现象 | 结论 | 根因层级 | 关键位置 |
|---|---|---|---|---|
| 1 | 大厅完全无 BGM，设置开关「无效」 | **成立**（但成因不是接线） | 素材响度 + 配置增益错配 | `assets/audio/bgm_lobby.mp3` 母带峰值 **-18.1 dBFS**、`SoundManager.js:38` `volume: 0.26` |
| 2 | 红鲸鱼左头竖直切平 / 粉耳罩白兔左脸缺块 / 白牦牛左身缺块 | **成立** | 包围盒**索引口径错位**（75/90 花色错格）+ 生成脚本 5% 内缩 + `<242` 阈值 + 运行期 `>244` 白键控 | `BoardRenderer.js:223`、`icon-bboxes.js`(96 条)、`tools/normalize-sheets.js:22-28`、`BoardRenderer.js:247` |
| 3 | 开局落子音效「假、刻意、尾音长」 | **成立** | 逐牌发声 + 节流仅 22ms → 37 声叠成 0.8s 连续扫频；2.4× 三角泛音 | `SoundManager.js:54,623-659`、`BoardRenderer.js:1370-1404` |
| 4 | 点击/反弹/三消偏轻，破冰刺耳偏响 | **成立** | 合成轨走 -18dB/8:1 压缩器、资产轨走 `element.volume` 完全绕过压缩器，两轨无响度对齐；`iceBreak` 用 1800Hz 高通噪声且零起音 | `SoundManager.js:428-434,498-511,833` |

---

## Bug 1 — 大厅 BGM 完全无声，设置开关也无效

### 报告（摘要）

进入主大厅后没有任何背景音乐；打开设置面板反复开关「背景音乐 BGM / 游戏音效 SFX」也完全没有声音。用户怀疑：`bgm_lobby` 路径错误？autoplay 拦截后未在点击时重新 `play()`？设置开关未接到 `SoundManager`？

### 症状

预期：首次用户交互后 `bgm_lobby` 以 0.26 音量循环起播（FR-050 §3 / quickstart A2）。
实际：交互后仍无任何可闻声音；开关切换无任何可闻变化。

### 复现

1. `file://` 双击 `index.html`，等 splash 过渡进大厅（约 7s）。
2. 点击大厅任意位置（触发 unlock）。
3. 观察：无 BGM。
4. 点右上齿轮 → 反复切换 BGM / SFX → 仍无任何声音。

### 实测（headless Chrome + CDP，探针 `probes/audio-probe.js`）

```
首次交互前： bgm_lobby.mp3  paused=true  vol=0     ready=4  dur=60.5  err=0
首次交互后： bgm_lobby.mp3  paused=false vol=0.26  t=3.65  → 2s 后 t=5.66（currentTime 在推进）
AudioContext state = "running"  页面零报错
```

**结论：接线完全正确。** 文件路径正确、预加载成功（`readyState=4`）、autoplay 解锁链路（`bindUnlockOnce` → `unlock()` → `startBgmKey`）正常、设置开关确实调到了 `SoundManager`（`element.paused` 由 true 变 false，`volume` 由 0 爬到 0.26）。

### 疑似代码路径

- `src/audio/SoundManager.js:38` — `bgm_lobby.volume = 0.26`（配置增益）
- `src/audio/SoundManager.js:279-292` `playBgm()` / `242-276` `startBgmKey()` / `449-461` `unlock()` — 起播链路（**均正确**）
- `src/main.js:157` — `enterLobby()` 调 `sound.playBgm('lobby')`（正确）
- `src/main.js:203-212` `onAudio()` — 设置开关 → `setBgmMute/setSfxMute`（正确）
- `src/ui/modals.js:179-188` — BGM/SFX 两个 toggle 的回调（正确，但**无任何可听反馈**）
- `assets/audio/bgm_lobby.mp3` — **母带电平（真正的缺陷所在）**

### 根因（置信度：高）

**两首 BGM 素材没有做过响度对齐，`bgm_lobby` 比 `bgm_game` 低约 16 dB，再乘 0.26 后落到人耳阈值以下。**

ffmpeg `volumedetect` 实测（整曲）：

| 素材 | 时长 | mean_volume | max_volume |
|---|---|---|---|
| `bgm_lobby.mp3` | 60.45s | **-34.7 dB** | **-18.1 dB** |
| `bgm_game.mp3` | 60.03s | -19.4 dB | -1.5 dB |

叠加配置增益后的**实际输出峰值**：

- `bgm_lobby`：-18.1 + 20·log10(0.26) = -18.1 − 11.7 = **-29.8 dBFS**（均值约 **-46 dBFS**）
- `bgm_game`：-1.5 + 20·log10(0.20) = -1.5 − 14.0 = **-15.5 dBFS**

两者相差 **14.3 dB**。笔记本/手机外放 + 30% 系统音量下，-46 dBFS 均值的持续音乐**在环境噪声中不可闻**——这就是「完全没有背景音乐」。

配置本身也是**反的**：素材更轻的 lobby 给了更高的 element volume（0.26 > 0.20），说明 0.26/0.20 是按「已归一化素材」设定的相对增益（spec FR-050 §3「极淡不抢戏」），而素材实际未归一化。

「开关也无效」是同一根因的下游表现：开关确实在起停 BGM，但**起停一个 -46 dBFS 的声音，人耳分辨不出**；且 `modals.js` 的 toggle 回调**没有播放任何确认音**（`buildToggle` 的 `onToggle` 只写 profile），所以用户得到「按了没反应」的完整体验。

### 修复方案

**首选（推荐）——归一化素材，保留 spec 的 0.26/0.20 口径：**

```bash
ffmpeg -i assets/audio/bgm_lobby.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a libmp3lame -b:a 192k out.mp3
```

- 目标：两首 BGM 统一到 `I=-16 LUFS / TP=-1.5 dBTP`（差 ≤1 dB）。
- 归一化后 `bgm_lobby` 0.26 ≈ -27.7 LUFS 背景层，符合「极淡」；`bgm_game` 0.20 ≈ -30 LUFS，进关时仍明显更「贴身」。
- `quickstart A2/A3` 与 `audio-smoke` 现有的 0.26/0.20 断言**不需要改**。

**次选——不动素材，只改配置：** `bgm_lobby.volume` 提到 1.0（-18.1 dBFS），仍比 `bgm_game` 低 2.6 dB，可接受但上限被锁死，且违反 spec 的 0.26 验收口径，需同步改 4 处文档。**不推荐**。

**补充（无论选哪条都该做）：**

1. `src/ui/modals.js:180-188` — 两个 toggle 的 `onToggle` 里加一声确认音（`STM` 侧暴露 `sound.playTap()` 或新增 `playToggle()`），让「开关生效」可听。
2. `src/audio/SoundManager.js:152-160` `onLoaded()` — 加一条 `console.info('[audio] bgm_lobby ready, want=%s unlocked=%s muted=%s')`，实机排查时不用再靠猜。
3. `src/audio/SoundManager.js:57-68` `AUDIO_CONFIG` — 增加 `expectedPeakDb` 字段，供 `audio-smoke` 做响度回归。

**可能改动的文件**：`assets/audio/bgm_lobby.mp3`、`src/ui/modals.js`、`src/audio/SoundManager.js`
**需新增/更新的测试**：`tools/audio-smoke.js` 增加「BGM 双轨峰值差 ≤3 dB」「有效峰值 = 素材峰值 + 20log10(volume) 落在 -30±3 dBFS」两条断言。

---

## Bug 2 — 部分卡牌动物图案被裁切缺损

### 报告（摘要）

红鲸鱼左侧头部被竖直切平；戴粉色耳罩的白兔左脸被切掉一块；雪山白牦牛左侧身体被切掉一块。用户怀疑：(a) 单元格内缩（margin/inset）过大；(b) 非白判定阈值（如 `R<242`）过严，把 242~252 的浅色绒毛当成白底裁掉。

### 症状

预期：每个花色裁出「完整动物」。
实际：动物一侧出现**竖直硬切边**，且不同花色被切的部位不同。

### 复现

1. 打开「个人信息」弹窗 → 90 格头像网格（`modals.js:252` 遍历 `bid 0..89`，经 `petAvatarHTML` → `IconAssets.sliceCanvasOf(bid)`）。
2. 观察 `bid 45`（粉耳罩白兔）、`bid 47`（白牦牛）、`bid 30`（红鲸鱼）。
3. 关卡内同样成立——棋盘图标走同一条 `slices[bid]` 链（`bid` 由 `Bestiary.mappingForLevel(level)` 从 `t.s` 映射而来），故棋盘与头像网格是同一个缺陷的两个出口。

### 实测（走**生产代码** `STM.IconAssets`；上排 = 真实切片，下排 = 该 bid 的源格）

| bid | 该 bid 的源格 | 实际渲染出的动物 | 用户对应症状 |
|---|---|---|---|
| 30 | sheet3 c0 | 红鲸鱼（**左头竖直切平**）※ | 「红鲸鱼左侧头部被竖直切平」 |
| 44 | sheet3 c14（红鲸鱼） | 海星（完整） | — |
| 45 | sheet4 c13 | 粉耳罩白兔（**左侧硬切**）※ | 「戴粉色耳罩的白兔左脸被切掉一块」 |
| 46 | sheet4 c14 | 蓝角白羊（**左侧硬切**） | — |
| 47 | sheet4 c15（白牦牛） | 白牦牛（**左身硬切**） | 「雪山白牦牛左侧身体被切掉一块」 |
| 58 | sheet4 c13（白兔） | 小熊猫（完整） | — |

※ 这两条受「双注册竞态」影响（见下文），两次探针分别命中了不同结果。

量化（`probes/bbox-audit2.js` 逐像素重算）：

| 动物 | 运行期实际用的 bbox | 该格真实内容 bbox（thr 250 / 无内缩 / 最大连通域） | 被切掉 |
|---|---|---|---|
| 红鲸鱼 sheet3 c14 | `bid 30` 用 `{1141,1573,360,421}`（取自 sheet2 c14） | `{1064,1568,442,343}` | 左 **77px** |
| 粉耳罩白兔 sheet4 c13 | `bid 45` 用 `{669,1561,264,379}`（取自 sheet3 c13 海马） | `{512,1546,510,502}`（**贴左格边**） | 左 **157px** + 右 89px |
| 白牦牛 sheet4 c15 | `bid 47` 用 `{1601,1561,367,376}`（取自 sheet3 c15） | `{1536,1584,432,464}`（**贴左格边**） | 左 **65px** + 下 88px |

**索引口径核对：90 个 bid 里有 75 个取错格**（bid 0~14 正确；bid 15 起逐张漂移 1 格，sheet6 漂移 5 格）。

**附带实测：bid 15/30/45/60/75 的结果不稳定。** `registerSheet` 对每张 sheet 注册 16 格、`base` 步进 15，导致这 5 个 bid 被相邻两张 sheet 各写一次，**谁后完成加载谁生效**。同一份代码连跑两次探针：bid 45 一次是「粉耳罩白兔」、一次是「青绿海马」；bid 30 一次是「红鲸鱼」、一次是「戴冠黄鸟」。这解释了该缺陷在实机上「时隐时现、说不清是哪张牌」的观感。

### 疑似代码路径

1. **`src/render/BoardRenderer.js:223`** — `var _suit = (base || 0) + (cellIndex || 0);` 用 `_suit` 去索引 `STM_ICON_BBOXES`
2. **`src/render/BoardRenderer.js:196-201`** — `SHEETS` 的 `base` 为 `0/15/30/45/60/75`（**15 格/张**口径）
3. **`src/render/BoardRenderer.js:367-374`** — `registerSheet()` 逐张注册 16 格，`base` 步进 15
4. **`src/data/icon-bboxes.js`** — 产物为 **96 条**，按 **16 格/张**排列（`[sheet-1]*16 + cell`）
5. **`tools/normalize-sheets.js:22-28`** — 产物真正的生成脚本：`mx = int(cw*0.05)`（**5% 内缩 = 每侧 25px**）+ `mask = R<242 | G<242 | B<242`（**242 及以上全部视为白底**）
6. **`tools/gen-icon-bboxes.js:20-24`** — 另一个生成脚本：`for cell in range(15)`、`base=(sheet-1)*15`、阈值 `<248`、**无内缩**（口径正确，但**从未被应用**）
7. **`src/render/BoardRenderer.js:244-248`** — 离线 bbox 分支的白键控 `rr>244 && gg>244 && bb>244 → alpha=0`（裁完之后**再把近白绒毛抹掉**）
8. **`src/render/BoardRenderer.js:263-323`** — bbox 缺失时的运行期兜底 `process(0.09)`（**9% 内缩**，比生成脚本更狠）

### 根因（置信度：高）

三层缺陷叠加，**用户的 (a) 和 (b) 两个怀疑都真实存在，但都不是主因**：

**主因（A）索引口径错位 —— 75/90 个 bid 取到了邻居的包围盒。**
渲染侧 `_suit = base + cellIndex` 等价于「每张 15 格」，而产物 `icon-bboxes.js` 按「每张 16 格」排列。二者只在 sheet1 一致；sheet2 起每张多漂 1 格。于是：

- `bid 44`（源格是红鲸鱼）→ 用 `bbox[44]`（海星格）→ 渲染出**海星**；
- `bid 30`（源格是蓝豚）→ 用 `bbox[30]`（sheet2 c14 的坐标）→ 落在 sheet3 的**红鲸鱼格**上，但 bbox 左缘 `x=1141` 晚于鲸鱼真实左缘 `x=1064` → **头部被竖直切掉 77px**。这就是「红鲸鱼左头竖直切平」；
- `bid 45` → 用 `bbox[45]`（海马的 264px 窄框）去裁白兔（真实 510px）→ **左切 157px、右切 89px**，即「白兔左脸被切掉一块」；
- `bid 47` → 用 `bbox[47]`（sheet3 c15）去裁白牦牛 → **左切 65px、下切 88px**，即「白牦牛左侧身体被切掉一块」。

**（A2）双注册竞态 —— 同一 bid 在不同次加载里会给出不同动物。**
`registerSheet` 每张注册 16 格、`base` 步进 15，于是 bid 15/30/45/60/75 被相邻两张 sheet 各写一次，**后完成加载者生效**。这是「实机上时隐时现」的直接成因，也是为什么同一份代码两次探针结果不同。修 bbox 索引时必须一并把注册格数收敛到 15。

**次因（B）生成脚本的 5% 内缩 + `<242` 阈值 —— 即使索引修好，白兔/牦牛仍会被切。**
两者都贴格子左边界（真实内容 `x=0`），5% 内缩直接把左边界推到 `x=25`；`<242` 又把 242~252 的受光绒毛判成背景。按正确格重算：白兔丢 115px、白牦牛丢 112px、红鲸鱼丢 6px。**用户的两个怀疑 (a)(b) 都成立，只是被 (A) 放大成了「整块缺失」。**

**第三层（C）运行期白键控 `>244` —— 裁完之后再抹一遍。**
`BoardRenderer.js:247` 在裁剪结果上把「三通道都 >244」的像素 alpha 置 0，白兔/白牦牛的受光面（245~252）会在**已经裁好的图里再被吃掉一圈**，边缘因此呈现硬切而非柔边。

**附带发现（D）：两个生成脚本口径冲突，且正确那个跑不起来。**
`tools/gen-icon-bboxes.js` 的口径（90 条、索引=suit、无内缩、`<248`）是对的，但依赖 `python` + PIL/numpy，而当前环境的 `python` 没有 PIL（`ModuleNotFoundError: No module named 'PIL'`）——这解释了为什么它写于 10-24 17:36 却从未产出。实际入库的产物来自更早的 `tools/normalize-sheets.js`。

**附带发现（E）：`assets/icons/sheet1~5.png` 其实是 JPEG**（`ffprobe` 报 `yuvj420p`，`sheet1.png` 与 `sheet1.jpg` md5 完全相同）。JPEG 振铃会让「白底」落在 250~254 而非 255，这是阈值必须放宽到 250+ 的物理原因。

### 修复方案

**首选（一次改到位）：**

1. **重新生成包围盒**，口径与 `gen-icon-bboxes.js` 一致并放宽：
   - 条数 90，索引 = suit（`(sheet-1)*15 + cell`）；
   - **去掉 5% 内缩**，扫描窗口取整格，并额外向四邻格外扩 16px（允许艺术越界）；
   - 阈值 `248 → 250`，保留「≥3px 连通域」过滤以剔除 JPEG 噪点；
   - 对「内容触格边」的格子（真实 bbox 距边 ≤2px）直接取整格宽度。
   - 把该逻辑从 Python 迁到 Node（ffmpeg `rawvideo` 解码 + 原生 TypedArray，零 npm 依赖），避开 PIL 缺失。
2. **收敛注册格数，消灭双注册竞态**：`registerSheet()`（`BoardRenderer.js:367-374`）的循环 `i < 16` 改为 `i < 15`，与 `SHEETS.base` 的 15 步进一致；此后 bid 15/30/45/60/75 只被一张 sheet 写入，图标不再随加载顺序变化。
3. **删除 `tools/normalize-sheets.js`**（它的 5% 内缩 + 242 是缺陷源头，且期望 96 条），或改为转调新生成器。
4. **运行期白键控阈值 `244 → 252`**，并把硬切改成 2px alpha 羽化（`BoardRenderer.js:244-248`）。
5. **兜底路径 `process(0.09)` → `process(0.02)`**（`BoardRenderer.js:319`），避免 bbox 文件缺失时二次踩坑。

**备选（只消除裁切、保持现有错位外观）：** 保留 96 条产物，把 `_suit` 改成 `(base/15)*16 + cellIndex`。改动 1 行、外观零变化，但**等于把错位固化成契约**，与 `SHEETS.base` 和生成器口径永久冲突，且双注册竞态仍在。**不推荐**。

**可能改动的文件**：`tools/gen-icon-bboxes.js`（重写）、`src/data/icon-bboxes.js`（重生成）、`src/render/BoardRenderer.js:223,247,319,367-374`、`tools/normalize-sheets.js`（删）
**需新增/更新的测试**：
- 新 `tools/icon-bbox-audit.js`：① 断言 90 条；② 每个 bid 的 bbox 落在自身格内（越界 ≤16px）；③ bbox 覆盖「真实内容」≥98%；④ **相邻 bid 的 bbox 不得逐字相同**（错格的直接指纹）。
- `tools/render-selftest.js`：新增断言 `slices[n]` 与 `slices[n-1]` 的像素差 > 阈值（防错格回归），以及「同一 bid 连续两次 `ensureLoaded` 结果一致」（防双注册竞态）。

### 风险

- **修复后 75/90 个 bid 的图案会变**：bid 44 由「海星」变「红鲸鱼」、bid 58 由「小熊猫」变「白兔」……这是「改对」的必然结果，但需要用户确认能接受。
- **白牦牛会消失**：它是 sheet4 的第 16 格，在 15 格/张的口径下不属于任何 bid（当前能出现纯属错格的副作用）。若想保留，需把 `SHEETS` 改成 16 格/张并把 bid 扩到 96。
- 图鉴名与 sheet 图案本来就不对应（`bestiary.js` 的 90 个名字是程序化绘制用的），修 bbox 不会让名字对上，属既有内容债。

---

## Bug 3 — 开局落子音效「太刻意、尾音太长」

### 报告（摘要）

开局卡牌进场动画很好，但配套落子音效很假很刻意，且拉了很长的尾音。

### 症状

预期：一串轻盈、随机、短促的「落子」点缀。
实际：一整段约 0.8s 的连续上行扫频，带金属味泛音，末尾拖尾。

### 实测（代码推演 + 参数核算）

单声 `playDealTick` 只有 28ms，本身不「长」。长尾来自**声数**：

- 单关最多 **141 张牌**（72 关实测中位数 84、最少 18，最深 5 层），`tickIntro()`（`BoardRenderer.js:1382`）对**每一张牌**在 `INTRO_TILE_MS(260) × 0.85` 时刻发一次 `onDealTick`；
- 节流只有 `DEAL_TICK_MIN_MS = 22`（`SoundManager.js:54`）→ 上限约 **45 声/秒**；
- 落定窗口 = 延迟 180~1000ms + 221ms ≈ **400~1220ms**，即 **0.8s 内约 37 声**，每声 28ms + 20ms 泛音 → **连续叠成一条不间断的音带**，且音高随进度从 380Hz 单调爬到 760Hz（`SoundManager.js:632`）。

「很假」来自 `o2.type='triangle'` 的 **2.4× 泛音**（912→1824Hz，`SoundManager.js:650-654`）：三角波在 1~2kHz 的奇次谐波很突出，叠在正弦基音上就是「电子提示音」的塑料感。

### 疑似代码路径

- `src/audio/SoundManager.js:54` — `DEAL_TICK_MIN_MS = 22`
- `src/audio/SoundManager.js:623-659` — `playDealTick()`：28ms、gain 0.12、2.4× 三角泛音
- `src/render/BoardRenderer.js:1370-1404` — `tickIntro()` 逐牌触发（同帧多牌才排序合并）
- `src/main.js:814` — `onDealTick` 直连 `sound.playDealTick`

### 根因（置信度：高）

**节流阈值是按「防爆音」设计的（22ms），不是按「音乐密度」设计的。** 84~141 张牌的编舞需要的是 10~12 声点缀，而不是 37 声连续扫频；再叠加 2.4× 三角泛音，就同时命中「刻意」和「拖尾」两个听感。

### 修复方案

**首选：**

1. `DEAL_TICK_MIN_MS: 22 → 70`（141 张牌 → 约 11 声，落在 400~1220ms 内，间距 70~80ms，形成「疏密有致」的骨牌感）。
2. 单声参数：时长 `0.028 → 0.014`；泛音 `f*2.4 → f*1.5`、`0.030 → 0.014`、时长 `0.020 → 0.010`；主音 `0.12 → 0.09`。
3. 加 ±3% 随机失谐（`f * (0.97 + Math.random()*0.06)`），去掉「音阶」的刻意感。
4. 同帧多牌**只发 1 声**（现在是最多 3~4 声），在 `tickIntro` 里把 `pending` 折叠成其平均值。

**备选**：把整场编舞的发声预算写死为 `MAX_TICKS = 12`，按 `progress` 分桶触发（音高连续、密度恒定），代价是牌数少的小关卡也要跑满 12 声，需要按牌数线性缩放。

**可能改动的文件**：`src/audio/SoundManager.js:54,623-659`、`src/render/BoardRenderer.js:1398-1404`
**需新增/更新的测试**：`tools/audio-smoke.js` 增加「节流 ≥60ms」「单场声数 ≤12」「单声时长 ≤16ms」「泛音倍频 ≤1.6」四条静态断言；`tools/deal-smoke.js` 增加「141 牌编舞的发声次数 ≤12」用例。

---

## Bug 4 — 核心交互音效偏轻，破冰音效刺耳偏响

### 报告（摘要）

点击飞入 `ber~`、受阻反弹 `deng~`、三消碎裂 `sfx_shatter` 都太轻；冰封牌破冰/解冻音效极其尖锐刺耳、音量过大。

### 实测（素材电平 + 代码增益核算）

**素材母带电平（ffmpeg volumedetect）：**

| 素材 | mean | max |
|---|---|---|
| `sfx_shatter.mp3` | -29.0 dB | **-16.1 dB** |
| `sfx_win.mp3` | -23.6 dB | -7.1 dB |
| `sfx_lose.mp3` | -31.4 dB | -13.4 dB |
| `sfx_voice_good.mp3` | -21.6 dB | -8.9 dB |
| `sfx_voice_great.mp3` | -19.0 dB | -4.8 dB |
| `sfx_voice_unbelievable.mp3` | -14.5 dB | -0.6 dB |

**8 个素材的峰值跨 15.5 dB、均值跨 20 dB —— 没有做过任何响度归一化。**

**合成轨（走 `master` 压缩器，threshold -18dB / ratio 8:1）：**

| 音效 | 代码峰值 | 压缩后约 | 主频 |
|---|---|---|---|
| `playTap`（ber~） | 0.30（-10.5 dBFS） | ≈ **-15 ~ -16 dBFS** | 260→680Hz |
| `playBlock`（deng~） | 0.26（-11.7 dBFS） | ≈ **-16 dBFS** | 210→135Hz |
| `SFX.iceBreak` | 噪声 0.16 + 正弦 0.08 | ≈ **-16 dBFS**，但能量全在 1.8k~10kHz | **1800Hz+ 高通**、1400Hz 正弦 |

**资产轨（`element.volume`，完全绕过压缩器）：**

| 音效 | volume | 素材 max | 实际峰值 |
|---|---|---|---|
| `shatter` | 0.55 | -16.1 dB | **-21.3 dBFS**（全表最轻） |
| `win` | 0.70 | -7.1 dB | -10.2 dBFS |

### 疑似代码路径

- `src/audio/SoundManager.js:428-434` — `master` 压缩器 `threshold -18 / ratio 8`（把交互音效压掉 4~6 dB）
- `src/audio/SoundManager.js:304-328` `fireSfx()` — 资产轨用 `el.volume`，**不经过 `master`**
- `src/audio/SoundManager.js:521-564` `playTap`（0.30 / 8ms 起音 / 75ms）
- `src/audio/SoundManager.js:584-617` `playBlock`（0.26 / 150ms + 2 次泛音 0.075/0.055）
- `src/audio/SoundManager.js:833` — `iceBreak: noise(0.2, 0.16, 0, 1800); tone('sine',1400,900,0.16,0.08)`
- `src/audio/SoundManager.js:498-511` `noise()` — **`g.gain.setValueAtTime(vol, t0)`，零起音 → 数字爆点**
- `src/main.js:1380` — 引擎 `ice` 事件 → `sound.play('iceBreak')`
- `src/audio/SoundManager.js:40-42` — 资产 volume 表（0.55 / 0.70 / 0.62）

### 根因（置信度：高）

**结构性：两条轨之间没有任何响度对齐。** 合成轨统一经过一个 -18dB/8:1 的压缩器（为防多声叠放爆音而设），资产轨走 `element.volume` 完全绕开它。于是：

- 设计意图最「轻」的三消碎裂（`shatter`）实际是**全表最轻**（-21.3 dBFS）；
- 设计意图最「重」的破冰（`iceBreak`）因为用**1800Hz 高通白噪声**，能量集中在人耳最敏感的 2~5kHz（等响曲线比 200~400Hz 高 10~15 dB），**感知响度反超点击音约 20~25 dB**；
- `noise()` 零起音（`setValueAtTime(vol, t0)`，无 attack ramp）在 t0 处产生一个满幅阶跃 → 额外的高频「咔」声，进一步加重刺耳。

**素材侧**：8 个 mp3 峰值跨 15.5 dB 且未归一化，`shatter` 本身就只有 -16.1 dBFS，再乘 0.55 → 无论如何调代码增益都「扶不起来」。

### 修复方案

**首选（结构 + 素材双管）：**

1. **素材归一化**：`sfx_*` 统一到 `I=-14 LUFS / TP=-1.0 dBTP`（`ffmpeg -af loudnorm=I=-14:TP=-1`）。这一步解决 `shatter` 的先天不足。
2. **拆出 SFX 专用总线**：`ensureCtx()` 里新增 `sfxGain`（0.9），压缩器改为 `threshold -8 / ratio 3 / knee 6`——从「限幅器」回归「防爆音」，不再把交互音效压死。
3. **抬升交互音效**：`playTap` 0.30 → 0.50、`playBlock` 0.26 → 0.42、`bounce` 0.075/0.055 → 0.11/0.08（压缩器改后实际提升约 8 dB）。
4. **重做破冰**（`SoundManager.js:833`）：
   ```js
   iceBreak: function () {
     noise(0.12, 0.05, 0, 0, { band: [900, 2600], attack: 0.008 });
     tone('sine', 700, 520, 0.14, 0.06);
   }
   ```
   —— 带通 900~2600Hz（去掉 2.6k 以上的嘶声）、gain 0.16 → 0.05、时长 0.2 → 0.12、正弦从 1400Hz 降到 700Hz。
5. **`noise()` 补起音**：`g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.006);`（消除数字爆点）。

**备选**：只调数值不重构（`iceBreak` gain → 0.04、`playTap` → 0.45、`shatter.volume` → 1.0），改动最小但「两轨无对齐」的结构问题仍在，下一批音效还会复现同类失衡。**不推荐单独使用。**

**可能改动的文件**：`src/audio/SoundManager.js:40-45,428-434,498-511,521-564,584-617,833`、`assets/audio/sfx_*.mp3`
**需新增/更新的测试**：
- `tools/audio-smoke.js`：① 8 个素材峰值差 ≤4 dB；② `iceBreak` 增益 ≤0.06 且滤波器不是 `highpass@1800`；③ `noise()` 必须含 attack ramp（源码静态断言）；④ 核心交互（tap/block/shatter）有效峰值落在 -16±4 dBFS。
- `tools/ingame-shots.js`：破冰关卡截帧 + 音频事件序列断言（`ice` 事件只触发 1 次 `iceBreak`）。

---

## 优先级与建议顺序

1. **Bug 1（BGM 素材归一化）** —— 30 分钟，一次 ffmpeg，直接消掉「大厅死寂」这条最刺眼的验收失败。
2. **Bug 4 的破冰部分** —— 10 分钟改 3 个数值，先把「刺耳」压下去。
3. **Bug 2（bbox 重生成 + 索引口径统一）** —— 半天，涉及 75 个花色外观变化，需要用户先拍板。
4. **Bug 3（落子节流）** —— 1 小时，纯参数。
5. **Bug 4 的结构部分（SFX 总线）** —— 与 Bug 3 一起做，避免两次回归。

## Risks & Considerations

- 修 Bug 2 会**改变 75/90 个花色的外观**，且白牦牛（sheet4 第 16 格）会消失——这不是回归，是「把错位改对」的必然结果，但必须事先确认。
- 重新归一化 `assets/audio/*.mp3` 会产生二进制 diff（体积基本不变），与「宪章 III 音频分层」不冲突，但需在 ITERATION_LOG 留痕。
- 抬高压缩器阈值后，`shatter`（pool=4）+ 语音（120ms 延迟）叠放时存在削波风险，需要串联一个 `threshold -1 / ratio 20` 的限幅级。
- `tools/gen-icon-bboxes.js` 依赖的 PIL 缺失是**流程级**隐患：任何「重新生成资产」的脚本都应改为 Node + ffmpeg，否则下次还会静默失败。
- `assets/icons/sheet1~5.png` 实为 JPEG，阈值放宽到 250 是必要前提；若将来换成真 PNG，可回调到 248。

## Open Questions

- [NEEDS CLARIFICATION] 白牦牛（`sheet4` 第 16 格）是否应作为正式花色？若是，需把 `SHEETS` 改为 16 格/张、花色扩到 96，并重生成 96 条 bbox。
- [NEEDS CLARIFICATION] 接受「修复后 75/90 个花色图案变化」吗？还是只消除裁切、保留现有错位外观（1 行改动方案）？
- [NEEDS CLARIFICATION] 允许把 `assets/audio/*.mp3` 重新做响度归一化（二进制变更）吗？
- [NEEDS CLARIFICATION] 大厅 BGM 的期望响度：维持「极淡」（-16 LUFS × 0.26 ≈ -27.7 LUFS）还是提到更明显（-14 LUFS × 0.32）？

---

## 附：本次取证脚本（均位于 `probes/`，已被 `.gitignore` 排除，不入库）

| 脚本 | 用途 |
|---|---|
| `audio-probe.js` | CDP 真机核对 14 个 `HTMLAudioElement` 的 `paused/volume/currentTime`，证明 Bug 1 接线正确 |
| `slice-focus.html` + `focus-shots.js` | 用**生产代码** `STM.IconAssets` 渲染指定花色切片，与源格并排比对（Bug 2 直接证据） |
| `slices.html` + `slice-shots.js` | 90 个 bid 全量 montage（错格全貌） |
| `bbox-audit.js` / `bbox-audit2.js` | 逐像素重算包围盒，量化「索引错位」与「5% 内缩 + 242 阈值」的裁切量 |
| `board-shot.js` | 打开 `?level=N` 截真实棋盘，验证棋盘与头像网格同源同缺陷 |
