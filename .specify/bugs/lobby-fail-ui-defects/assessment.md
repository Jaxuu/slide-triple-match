# Bug Assessment: 主大厅拼图进度脱节 + 失败结算页出口按钮失效 + 大厅中央视觉不协调

- **Slug**: lobby-fail-ui-defects
- **Created**: 2026-10-22
- **Source**: pasted text（实机测试三缺陷报告，含 Bug 1/2/3 描述与 `effectiveCleared` 整改口径）
- **Verdict**: valid（三项均经真实 Chrome CDP 实机探针复现并量化，根因确定）→ **已修复并验证（2026-10-22，见 ./fix.md + ./test.md，Result: verified）**
- **Severity**: critical（三项分列——Bug 1: high；Bug 2: **critical（硬性软锁）**；Bug 3: medium）

## Report (verbatim)

> 1. **Bug 1（逻辑缺陷）：拼图解锁进度与当前关卡进度脱节（显示关卡 12，但拼图却是 0/4 全锁）！**
>    - 现象：玩家当前已经到达 `关卡 12`（无论是之前存档打过来的，还是通过跳关到达的），按规则前 11 关已通过，第 3、6、9 关对应的前 3 块拼图应该全部处于点亮状态（显示 `3/4`），但界面上 4 块全部锁死显示 `0/4`。
>    - 排查点：检查拼图解锁状态的计算逻辑——不能仅依赖新加的 `clearedLevels` 数组（会导致旧进度或跳关后前面的拼图不亮），必须基于 **`effectiveCleared = Math.max(progress.unlocked - 1, currentLevel - 1)`**（以及 `clearedLevels` 并集）来判定：凡是解锁阈值 `<= effectiveCleared` 的拼图块必须全部点亮显示高清风景切片！
>
> 2. **Bug 2（交互失效）：失败结算界面点击"重新开始"和右上角"返回主大厅"完全无响应！**
>    - 现象：在失败界面（收集槽爆满）中，只有点击"💎 100 棱晶复活"有效，点击下方的"重新开始"按钮和右上角的"< 返回主大厅"按钮毫无反应。
>    - 排查点：检查失败弹窗渲染时的 DOM 事件绑定（是否在动态改写 `innerHTML` 后漏绑了"重新开始"和"返回主大厅"的 `pointerdown` / `click` 监听器，或被顶层遮罩 `z-index` / `pointer-events` 拦截，或重启会话时未关闭 `#result-overlay` 弹窗）。
>
> 3. **Bug 3（UI 审美缺陷）：主大厅中央面板的"土棕色 + 边缘 8 个长方体凸起"以及标题"左右分家塞进绿气泡"极不协调！**
>    - 现象：背景是清爽唯美的蓝天雪山樱花湖畔，但中央拼图外框却是浑浊的土棕色，且四周贴了 8 个莫名其妙的棕色长方体块；上方标题 `Glide` 是暗棕色，`Critters` 被塞进右边的绿色胶囊气泡里，两侧还有生硬的白色小三角，整体显得笨重怪异。

## Symptom

**Bug 1**：主大厅星盘铭牌显示 `0/4`、4 块晶片全部呈紫晶盲盒态（🔒），而同屏的 `关卡 12` 大按钮表明玩家已推进到第 12 关——按「每第 3 关点亮 1 块」的规则，此时第 3/6/9 关对应的前 3 块应已点亮、铭牌应为 `3/4`。**预期**：铭牌进度与当前关卡进度一致，凡解锁阈值 `<= effectiveCleared` 的晶片均点亮。

**Bug 2**：失败结算页上「💎 100 棱晶复活」可正常生效，但「重新开始」与右上角「‹ 返回主大厅」两个按钮点击后**画面毫无变化**——失败层仍完整覆盖全屏。**预期**：点击后失败层关闭并切换到局内 / 主大厅。

**Bug 3**：主大厅中央棱晶星盘底座呈浑浊土棕色且四周贴有 8 块生硬长方体凸起；顶部徽标 `Glide`（41px 暗棕描边）与 `Critters`（23px 薄荷绿胶囊）字号悬殊、基线错位 13px，视觉上「左右分家」，两侧白色 clip-path 三角翼亦显生硬。**预期**：底座配色与「琥珀金 + 虹彩棱晶」品牌语汇一致，齿轮呈机械刻纹而非长方块，徽标两词构成连贯的双层字标。

## Reproduction

### Bug 1（拼图进度脱节）

1. 在 `localStorage` 写入「旧存档态」：`slide-triple:progress:v1` = `{v:1, unlocked:12, last:11, ...}`，且 `slide-triple:profile:v2` 的 `paintingProgress` 全为 `[0,0,0,0,0,0]`（老存档无该字段时即为此态）。
   *等价的自然复现路径*：用调试面板「跳关」下拉直接选 L12（`src/main.js:1014-1020` `onJumpLevel` → `loadLevel(id)`，**不经 `settleWin`**，故不写 `firstClear`、不写 `paintingProgress`）；或以 `?level=12` 深链进入（`src/main.js:169-175`）。
2. 进入主大厅（开机动画播完 / 结算层「返回主大厅」）。
3. 观察：大按钮为 `关卡 12`，星盘铭牌为 `0/4`，4 块晶片全部 `is-blind` + 🔒，且第 1 块标注 `第 3 关充能`。

**已量化（实机探针 `.specify/bugs/lobby-fail-ui-defects/probe.js` 输出）**：

```
unlocked=12  last=11  levelBtn="关卡 12"  plaqueProg="0/4"
paintingProgress=[0,0,0,0,0,0]  litChips=0  blindChips=4
thresholds=[3,6,9,12]  effectiveCleared=11  expectedLit=3   → ★脱节
```

### Bug 2（失败页出口按钮失效）

1. 进入任意关卡（如 `?level=1`），把收集槽填满至 7 格且无任何花色凑够 3 张 → 触发 `lost_burst`（`src/core/RulesEngine.js:488-498`）。
2. 失败层弹出，点击底部「重新开始」→ **画面无变化**，失败层仍覆盖全屏。
3. 点击右上角「‹ 返回主大厅」→ **画面无变化**。

**已量化（实机探针，注入与 `src/main.js:884-892` 同构的 handlers）**：

```
点「重新开始」后: fired={restart:1}  failHidden=false  failDisplay="grid"  lobbyHidden=true   sceneLobby=false
点「返回主大厅」后: fired={lobby:1}   failHidden=false  failDisplay="grid"  lobbyHidden=false  sceneLobby=true
```

→ **回调确实被触发了**（`restart`/`lobby` 计数均 +1，且 `enterGame`/`enterLobby` 已执行——`sceneLobby` 由 false 变 true、`lobbyHidden` 由 true 变 false），**但 `#fail-root` 始终 `hidden=false` / `display:grid`**，不透明底衬（`css/style.css:1648-1656`，`z-index:26`）继续覆盖全部场景 → 用户观感为「毫无反应」。

### Bug 3（中央面板与徽标视觉）

1. 进入主大厅。
2. 观察中央星盘底座（浑浊土棕）与四周 8 块长方体凸起；观察顶部 `Glide` / `Critters` 徽标。

**已量化（实机探针几何/计算样式实测）**：

```
Glide    : font-size 41px  box{left:126, top:95,  w:109, h:52}  描边 rgba(120,78,20,.55) 渐变 #FFF6DC→#E8A33D→#B4701A
Critters : font-size 23px  box{left:245, top:108, w:129, h:41}  绿胶囊 linear-gradient(#A8F0C8→#6FD8A4→#2E9A6E)  radius 999px
基线错位  : topDelta=13px  bottomDelta=2px          ← 两词非同一基线、字号比 41:23 ≈ 1.8:1
风翼      : wingL{left:79, w:35, h:17}  wingR{left:386, w:35, h:17}  ← 紧贴 Glide 左侧 / Critters 右侧
星盘底座  : radial-gradient(circle at 34% 28%, rgba(255,236,190,.95), rgba(232,163,61,.70) 42%, rgba(126,84,30,.82) 100%)
齿轮      : count=8  单块尺寸 51×24px  渐变 linear-gradient(#FFE9B8, #B07C2E)  border-radius:3px
```

## Suspected Code Paths

### Bug 1 —— 拼图进度只读 `paintingProgress`，与关卡进度完全脱钩

- `src/ui/lobby.js:527-539` `paintingState(paintingIdx)` —— **缺陷核心**。该函数是星盘进度的唯一来源，其 `progress` 仅取自 `P.get().paintingProgress[idx-1]`，**完全不考虑 `progress.unlocked` / `progress.last`**。`paintingProgress` 只在 `settleWin()` 里经 `STM.Profile.unlockPaintingTile(pi)` 递增（`src/main.js:841-843`），而 `settleWin` 只在**真实通关**路径上触发。
- `src/main.js:1014-1020` `onJumpLevel()` → `loadLevel(id)` —— 跳关路径**不经过 `settleWin`**，因此既不写 `firstClear` 也不写 `paintingProgress`；`src/main.js:169-175` 的 `?level=N` 深链同理（`enterGame(deepId)` → `loadLevel`）。
- `src/main.js:50-57` `recordWin()` —— 只更新 `progress.unlocked` / `progress.best` / `progress.last`，**不同步 `paintingProgress`**。
- `src/core/profile.js:273-281` `unlockPaintingTile()` —— 唯一的 `paintingProgress` 写入点，只由 `settleWin` 调用。
- `src/core/profile.js:141-144` `normalize()` —— `paintingProgress` 缺失时回落 `[0,0,0,0,0,0]`；**老存档（v2 键在 Δ16c 之前不存在，或玩家此前一直用跳关）即落入该态**。
- `src/ui/lobby.js:554-581` `renderChips()` —— `var lit = q < st.progress;`（象限顺序点亮），铭牌文案 `st.progress + '/4'`。
- `src/ui/lobby.js:544-546` `chargeLevelOf()` —— 充能阈值 `st.range[0] + 2 + 3*quad`（第 1 大陆 = L3/L6/L9/L12），即「每第 3 关点亮 1 块」。
- `src/main.js:24-42` `loadProgress()` / `PROGRESS_KEY` —— 关卡进度 v1 键与 profile v2 键**并存不迁移**（`src/core/profile.js:5-8` 铁律 ①），两者本应互相派生却无派生逻辑。

### Bug 2 —— 失败层从未在「重新开始 / 返回大厅」路径上关闭

- `src/main.js:877-893` `enterFail()` —— 注入 `onRestart: enterGame(currentId)`、`onLobby: enterLobby(...)`；**两个回调体内均未调用 `STM.Fail.hide()`**。
- `src/main.js:96-103` `enterGame(id)` —— 只做 `app.classList.remove('scene-lobby')` + `STM.Lobby.hide()` + `loadLevel(id)`，**不关闭失败层**。
- `src/main.js:79-94` `enterLobby(opts)` —— 只做 `app.classList.add('scene-lobby')` + `STM.Lobby.hide()` + `STM.Lobby.show()`，**不关闭失败层**。
- `src/ui/fail.js:126-131` `STM.Fail.hide()` —— 存在且可用，但**唯一的生产调用点是 `reviveWithPrisms()`**（`src/main.js:911`）。`重新开始` / `返回大厅` 两条路径均遗漏。
- `src/ui/fail.js:52-53` `r.innerHTML = ''; r.hidden = false;` —— `show()` 每次重建 DOM 并置 `hidden=false`；失败层 `z-index:26`（`css/style.css:1651`）高于大厅 `z-index:3`（`css/style.css:730`）、局内层 `z-index:2`（`css/style.css:47`）、模态层 `z-index:20`（`css/style.css:1131`），且带**完全不透明底衬**（`css/style.css:1654-1655`）→ 失败层一旦残留，全屏场景被彻底盖死。
- `src/ui/fail.js:99-101`（`onRevive`）—— 复活按钮有效，恰恰因为 `reviveWithPrisms()` 内含 `STM.Fail.hide()`（`src/main.js:911`）。**「复活有效、另两个无效」正是本缺陷的判别指纹**，与报告描述完全吻合。
- `src/ui/fail.js:65-67` / `src/ui/fail.js:112-114` —— 三个按钮的 `click` 监听器绑定均正确，**并非报告猜测的「innerHTML 重写后漏绑」**（探针已证：`restart`/`lobby`/`revive` 回调计数均 +1）。

### Bug 3 —— 星盘底座配色/齿轮形态 + 徽标双词字级失衡

- `css/style.css:939-948` `.portal-ring` —— 底座 `radial-gradient(circle at 34% 28%, rgba(255,236,190,.95), rgba(232,163,61,.70) 42%, rgba(126,84,30,.82) 100%)`，末端 `rgba(126,84,30,.82)` 即**土棕色**，与「琥珀金 + 虹彩棱晶」品牌语汇（`--amber:#E8A33D`、`--prism-violet:#8F6FD6`、`--prism-glow:#C9AEFF`，`css/style.css:713-717`）脱节。
- `css/style.css:950-965` `.portal-gears` / `.portal-gear` / `.portal-gear-0..7` —— **8 块 15%×7% 的圆角矩形**（实测 51×24px，`border-radius:3px`），渐变 `linear-gradient(#FFE9B8, #B07C2E)`（棕调），靠 `top/left/right/bottom` + `rotate()` 贴边摆放 → 视觉上就是报告所述「8 个莫名其妙的棕色长方体凸起」，而非 spec 所要求的「机械齿轮刻纹」。
- `css/style.css:828-834` `.lobby-brand-name` —— `display:inline-flex; align-items:baseline; gap:10px`：**baseline 对齐**导致 41px 与 23px 两词基线勉强对齐（实测 `bottomDelta=2px`），但字高悬殊（`topDelta=13px`）造成「Glide 大 / Critters 小且被绿胶囊包裹」的**左右分家**观感。
- `css/style.css:836-850` `.lobby-brand-glide` —— 41px 琥珀渐变 + `rgba(120,78,20,.55)` 描边 → 在明亮天空背景上整体偏暗棕。
- `css/style.css:852-867` `.lobby-brand-critters` —— 23px、`border-radius:999px` 绿胶囊 + 2px 白边 → 读作「独立气泡」而非字标的第二层。
- `css/style.css:871-880` `.lobby-brand-wing` / `-l` / `-r` —— 纯白 `clip-path` 三角，实测 35×17px，贴附于 `Glide` 左侧 / `Critters` 右侧 → 因两词分家，风翼被拉扯为不均衡的两端。
- `src/ui/lobby.js:149-167` —— DOM 构建：`.lobby-brand-burst`（星芒）+ `.lobby-brand-wing-l` + `.lobby-brand-pet` + `.lobby-brand-name`（含 `<i class="lobby-brand-glide">Glide</i>` 与 `<i class="lobby-brand-critters">Critters</i>`）+ `.lobby-brand-wing-r`。
- 规范对照：`specs/001-slide-triple-match-core/spec.md:324-343` FR-039 §4/§5 —— 要求徽标为「**双层立体 3D 卡通字**」、星盘为「**圆角八边形或环形星盘底座，表面带机械齿轮刻纹与流线型滑行风翼纹饰，琥珀金与虹彩棱晶配色**」。**Bug 3 是对 FR-039 的实现偏离，不违反 Δ17 原创性红线**（七项竞品元素仍为零命中）。

## Root Cause Hypothesis

**Bug 1（置信度：高）**：`paintingProgress`（profile v2）与关卡进度（progress v1）是**两套各自独立写入、彼此无派生关系的状态**。前者只在真实通关结算（`settleWin`）时递增，后者则由通关、跳关、深链三条路径共同推进。凡不经真实通关的推进路径（跳关 / 深链 / 老存档 / 手工改档），两者必然发散——拼图永远是 `0/4`。修法不是新增 `clearedLevels` 数组（那只是把发散从一处搬到两处，且对「已通关但未点亮」的历史关卡仍判不出），而是以**关卡进度为权威源**反推：`effectiveCleared = Math.max(progress.unlocked - 1, currentLevel - 1)`，再与 `clearedLevels`（`profile.firstClear` 的键集）取并集，凡充能阈值 `<= effectiveCleared` 的晶片一律判定为已点亮。

**Bug 2（置信度：高，实机探针已证）**：**失败层缺少「退出即关闭」的生命周期契约**。`STM.Fail.hide()` 只在复活路径被调用，`重新开始` 与 `返回大厅` 两条出口都只切换了底层场景（`enterGame` / `enterLobby`），没有关闭 `#fail-root`。由于失败层 `z-index:26` 且底衬完全不透明，残留的失败层会盖死新场景——用户看到的就是「点击毫无反应」。**这不是事件绑定缺失，也不是 `pointer-events` 拦截**：探针 hit-test 显示三个按钮的 `elementFromPoint` 均命中自身、回调计数均 +1、`scene-lobby` 类亦已正确切换。故修复点是**补齐 `enterFail` 注入的两个回调中的 `STM.Fail.hide()`**（或在 `enterGame` / `enterLobby` 内统一关闭失败层，后者更稳健——可覆盖未来任何新增出口）。

**Bug 3（置信度：高，实测支撑）**：非「实现缺失」而是**已实现但设计选型与背景语汇冲突**。星盘底座末端色 `rgba(126,84,30,.82)`（土棕）+ 8 块 15%×7% 圆角长方体（棕调渐变），在蓝天雪山樱花的高明度背景上呈现浑浊、笨重的「木色齿轮」观感；徽标则因 41px 与 23px 的极端字号比 + `align-items:baseline` + `Critters` 的 `border-radius:999px` 绿胶囊底托，组合成「两个独立元素」而非「双层字标」，两侧纯白 `clip-path` 三角翼随之被拉成不均衡两端。

## Proposed Remediation

### Bug 1 —— 以关卡进度为权威源反推晶片点亮态

**Preferred**：在 `src/ui/lobby.js` 新增「有效已通关关卡集合」推导，`paintingState()` 由其驱动。

1. 新增判定源（建议置于 `src/ui/lobby.js` 内部，暴露给 `STM.Lobby` 供测试）：
   - `effectiveCleared = Math.max(progress.unlocked - 1, currentLevel - 1)` —— `progress.unlocked` = 最新解锁关卡（= 已通关最高关 + 1），`currentLevel` = 当前所处关卡号；两者取 max，覆盖「存档推进」「跳关到更高关」「深链」三种情形。
   - `clearedLevels` = `STM.Profile.get().firstClear` 的键集（`src/core/profile.js:268-271` `hasCleared` 已封装单点查询，`firstClear` 键集即已通关集合）—— 与 `effectiveCleared` **取并集**，确保「已通关但当时未点亮晶片」的历史关卡也能点亮。
2. `paintingState(paintingIdx)` 中，晶片 q 的点亮判定改为：**阈值 `<= effectiveCleared`（该阈值落在本画卷区间内）**，**或** 该阈值对应的关卡在 `clearedLevels` 中 → `lit = true`。
3. `renderChips()` 的铭牌 `X/4` 随之由「实际点亮块数」派生（而非直接读 `st.progress`），保证铭牌与晶片态永不脱节。
4. `src/main.js` 需把 `progress.unlocked` / `progress.last` / `currentId` 透传给大厅：现有 `STM.Lobby.show({ unlocked, level })` 已传 `level`，但 `show()` 内部只用于**默认落点选择**（`src/ui/lobby.js:696-700`），未被 `paintingState` 消费——需将其存入模块级变量并在 `refresh()` 中同步刷新。

**Alternatives**：
- *在 `recordWin` / `loadProgress` 时「回填」`paintingProgress`* —— 看似省事，但**无法修复已存在的发散存档**（历史数据不会自动回溯），且把推导逻辑塞进写路径，破坏 profile v2「纯经济与档案态」的职责边界。**不推荐**。
- *新增 `clearedLevels` 数组持久化* —— 报告已明确排除：该方案对「老存档 / 跳关后前面的拼图」同样判不出（`clearedLevels` 只记录新增通关，不含跳关经过的关卡），且会引入第三份进度状态。**不推荐**。

**Files likely to change**：
- `src/ui/lobby.js` —— `paintingState()` / `renderChips()` / `show()` / `refresh()`（新增有效进度推导）
- `src/main.js` —— `enterLobby()` / `lobbyHandlers()` 中的 `STM.Lobby.show|refresh` 传参（`unlocked` / `level` / `currentId`）
- `src/core/profile.js` —— 仅在需要暴露 `clearedLevels` 便捷访问器时补一个只读 getter（可选）

**Tests to add or update**：
- `tools/lobby-smoke.js`：新增断言组——预置「`unlocked=12` + `paintingProgress` 全 0」存档 → 断言星盘 `lit=3`、铭牌 `3/4`、第 1/2/3 块 `is-lit`、第 4 块 `is-blind` 且标注 `第 12 关充能`。
- 断言 `关卡 X` 按钮与铭牌进度的一致性不变式：`expectedLit === Math.min(4, countOfThresholdsLE(effectiveCleared))`。
- 断言「跳关到 L12 后返回大厅」同样点亮前 3 块（覆盖 `onJumpLevel` 路径）。

### Bug 2 —— 补齐失败层「退出即关闭」契约

**Preferred**：在 `src/main.js` 的 `enterGame()` 与 `enterLobby()` **入口处统一关闭失败层**（而非只在 `enterFail` 注入的回调里补）。

1. `enterGame(id)` 开头：`if (STM.Fail) STM.Fail.hide();`
2. `enterLobby(opts)` 开头：`if (STM.Fail) STM.Fail.hide();`

**为何选入口而非回调内**：回调内补（`onRestart` / `onLobby` 里各加一行 `STM.Fail.hide()`）能修当前症状，但**任何未来新增的出口**（设置弹窗里的「返回大厅」、ESC 键、深链跳关）都会重蹈覆辙；且 `enterGame` / `enterLobby` 是**唯一的场景切换入口**（`src/main.js:69-73` 注释明载「本函数是唯一的场景切换入口」），在入口处关闭即等价于「场景互斥」铁律的一次性落实——与 `STM.Lobby.hide()` / `app.classList` 切换并列，形成 `Lobby / Game / Result / Fail` 四层的统一 teardown 语义。

3. **可选加固**：在 `src/ui/fail.js` 内把 `hide()` 抽为幂等（现已是幂等——`root.hidden = true; root.innerHTML = ''`），并在 `src/ui/fail.js` 的 `show()` 中断言 `hidden=false` 前先 `hide()` 旧层，防止重复 `show()` 叠加。

**Alternatives**：
- *仅在 `onRestart` / `onLobby` 回调内加 `STM.Fail.hide()`* —— 改动最小，但如上所述脆弱。**可作为最小热修，但推荐入口级修法**。
- *给 `#fail-root` 加 `pointer-events:none` 并让底层可点* —— **错误**：失败层底衬不透明，底层不可见；且会破坏「复活」等失败层自身的交互。**不可行**。

**Files likely to change**：
- `src/main.js` —— `enterGame()` / `enterLobby()`（各加一行 `STM.Fail.hide()`）
- `src/ui/fail.js` —— 可选：`show()` 开头幂等 `hide()`

**Tests to add or update**：
- `tools/lobby-smoke.js`：新增断言组——真实触发 `lost_burst` → 点「重新开始」→ 断言 `#fail-root.hidden === true` 且 `getComputedStyle(#fail-root).display === 'none'`、局内 HUD 可见；点「‹ 返回主大厅」→ 断言 `#fail-root.hidden === true`、`#app.classList.contains('scene-lobby') === true`、`#lobby.hidden === false`。
- 回归断言：**复活路径仍有效**（`STM.Fail.hide()` 后 `scene === GAME`、Dock 已腾空、生命回 3）——防止入口级 `hide()` 误伤复活链路。
- 静态断言：`src/main.js` 中 `STM.Fail.hide()` 的调用点 ≥3（复活 + `enterGame` + `enterLobby`）。

### Bug 3 —— 星盘底座与徽标视觉重制

**Preferred**：**只改 CSS 视觉层，不动 DOM 结构与交互契约**（遵循 Δ17「仅换视觉皮肤」的既定做法，`specs/001-slide-triple-match-core/tasks.md:351` T072 ⑩）。

**B3-a 星盘底座（去土棕 + 齿轮去长方块）**：
1. `.portal-ring`（`css/style.css:939-948`）末端色由 `rgba(126,84,30,.82)` 改为**虹彩棱晶紫/青**（如 `rgba(142,107,214,.88)` / `rgba(76,200,245,.85)`），整体改为**琥珀金 → 棱晶紫**的双色渐变，呼应 `--prism-violet` / `--prism-glow`；保留顶部高光与底部暗边以维持立体感。
2. `.portal-gear`（`css/style.css:951-965`）**由圆角长方体改为真正的齿形**：用 `clip-path` 多边形绘制「齿轮齿」轮廓（或保留矩形但改为**极窄的刻纹条**，宽 15%→4~6%、高 7%→3%，`border-radius` 取消），并把渐变由棕调 `linear-gradient(#FFE9B8, #B07C2E)` 改为**金白高光**（`linear-gradient(#FFF6DC, #E8A33D)`）；8 齿沿用既有 `rotate()` 摆放位（保留 FR-039 §5.1 的「机械齿轮刻纹」语义）。
3. 可选：`.portal-wing`（`css/style.css:968-975`）的白色三角翼在底座上「悬浮」感偏弱，可加柔光/降低不透明度，避免与齿轮抢戏。

**B3-b 徽标（消除左右分家）**：
1. **字号对齐**：`.lobby-brand-glide` `clamp(26px, 8.2vw, 44px)` → 与 `.lobby-brand-critters` `clamp(15px, 4.6vw, 25px)` 的比值从 1.8:1 收敛至约 **1.15~1.25:1**（例如 Glide 收到 `clamp(22px, 6.6vw, 34px)`），使「双层字」读作一个整体。
2. **去掉胶囊底托**：`.lobby-brand-critters` 的 `border-radius:999px` + `padding:4px 16px` + 2px 白边 + 绿胶囊渐变 → 改为**与 Glide 同族的无底托立体字**（保留薄荷绿渐变作为第二层的色相区分，但改为与 Glide 相同的描边/投影/高光构造），使两词共享一套「立体字」语言；`border-radius` 与 `padding` 归零。
3. **对齐与间距**：`.lobby-brand-name`（`css/style.css:828-834`）的 `align-items:baseline` → `align-items:center`，`gap:10px` → `gap:4~6px`，消除 13px 顶缘错位带来的断裂感。
4. **风翼对称**：两翼现紧贴 `Glide` 左缘与 `Critters` 右缘，字号收敛后自然对称；若仍不平衡，改为**两翼均以整个字标容器为中心对称摆放**（挂在 `.lobby-brand` 而非字标两侧），并降低白色不透明度（实心纯白在亮背景上过于生硬），改用蓝白半透明渐层 + 极细冷灰描边。

**Alternatives**：
- *整体改用 Canvas 绘制徽标* —— 视觉自由度最高，但违反「零外部资源 + DOM/CSS 可维护」的项目纪律，且需重做无障碍与响应式。**不推荐**。
- *仅调色不改几何* —— 成本最低，但**不能解决「左右分家」的主观症状**（字号比与胶囊底托才是主因）。**不足**。

**Files likely to change**：
- `css/style.css` —— `.portal-ring` / `.portal-gears` / `.portal-gear` / `.portal-gear-0..7` / `.portal-wing`；`.lobby-brand-name` / `.lobby-brand-glide` / `.lobby-brand-critters` / `.lobby-brand-wing`
- `src/ui/lobby.js` —— **无需改动**（DOM 结构与事件契约保持不变；仅当需要为齿轮加 `aria-hidden` 时微调）

**Tests to add or update**：
- `tools/lobby-shots.js` 截图取证：大厅全图 + 徽标特写 + 星盘特写，纳入 `shots/` 供人工核对（**B3 为审美缺陷，须以实图判定，不宜仅靠静态断言**）。
- 静态断言：星盘底座计算样式**不含**土棕色系（`rgb(126,84,30)` / `rgb(176,124,46)` 等）。
- 几何断言：`.lobby-brand-glide` 与 `.lobby-brand-critters` 的**字号比 ∈ [1.1, 1.3]**，且两词 `top` 差 ≤ 6px（消除断裂感）。
- 保留既有断言组 B9~B14（双层字 / 双风翼 / 星芒 / 萌宠探头 / 棱晶 SVG）**全绿**——本次为视觉微调，不得破坏 FR-039 §4 的结构要素。

## Risks & Considerations

- **Bug 1 风险：点亮态与首通账本语义混淆。** 由关卡进度反推点亮态，会使「点亮」不再等价于「结算时实际发放过 `+150` 大奖」。须保证**点亮态（展示）与奖励发放（结算）解耦**：`settleWin()` 仍严格按 `firstClear` 幂等发放（`src/main.js:832-850`），反推只作用于**展示层**。反之，若误把反推结果写回 `paintingProgress`，会让「跳关刷到 L12」白嫖 `+150` 大奖——**必须在 `paintingState()` 内纯计算、绝不写 profile**（FR-041 §4 铁律：MUST NOT 回写关卡数据/经济态口径）。
- **Bug 1 风险：口径需与 `FR-044 §5` 对齐。** spec 定义「当前画卷 = 当前最新解锁关卡所归属的画卷」。反推后，跨大陆浏览时各大陆的 `X/4` 会因 `effectiveCleared` 全局阈值而不同（例如 `effectiveCleared=11` 时，第 2 大陆 L13/L16 阈值均 > 11 → 仍 `0/4`）——这与 spec 的「12 关满充能」节奏一致，无需改动，但**须在实现时确认 `chargeLevelOf` 的阈值与 `effectiveCleared` 同尺度（均为 1-based 关卡号）**。
- **Bug 1 风险：`unlocked` 语义。** `progress.unlocked` 是「最新**解锁**关卡号」= 已通关最高关 + 1（`recordWin`，`src/main.js:51`），故 `unlocked - 1` = 已通关最高关，**`effectiveCleared = Math.max(unlocked - 1, currentLevel - 1)` 成立**；但若未来 `unlocked` 语义改为「已通关最高关本身」，公式需同步调整——建议在实现时**加注释锁定该语义**。
- **Bug 2 风险：入口级 `hide()` 误伤复活链路。** `reviveWithPrisms()` 内部调用 `STM.Fail.hide()` 后设 `scene = SCENE.GAME`（`src/main.js:911-912`）。若把 `hide()` 放进 `enterGame()`，而 `reviveWithPrisms` 恰好也走 `enterGame`（当前**不走**——复活是原地续局，不重载关卡），则可能出现重复 `hide()`；`hide()` 幂等（`root.hidden = true; root.innerHTML=''`），**无副作用**，但仍须确认复活**不经过** `enterGame`（当前实现正确：`reviveWithPrisms` 只调 `session.purify()` + `renderer.refresh()`，不调 `enterGame`）。
- **Bug 2 风险：场景互斥铁律一致性。** `src/main.js:69-73` 声明 `enterLobby` / `enterGame` 是唯一场景切换入口。补齐 `STM.Fail.hide()` 后，`Lobby / Game / Result / Fail` 四层应有**统一的 teardown 语义**；建议同时审视 `STM.Result.hide()` 的调用点（现仅 `src/main.js` 无生产调用点——`onContinue` 经 `enterLobby` 关闭；展板 `继续` 按钮在 `src/ui/result.js:271-274` 内自带 `hide()`）。**结算层目前不存在同类残留缺陷**（`enterResult` → `STM.Result.show()` 会重建并覆盖，`src/ui/result.js:106-108` 先 `innerHTML=''`），但**建议一并纳入回归断言**，防止将来重蹈。
- **Bug 3 风险：视觉调整须保持 Δ17 原创性红线。** 七项竞品元素（浅蓝竖条纹木墙 / 室内盆栽 / 木桌 / 风景木质相框 / 天蓝丝带横幅 / 金色庆典号角 / 天蓝圆弧顶盖）须**保持零命中**——尤其是齿轮重制时**不得**引入「木质相框」语汇（本次是把土棕**去掉**，方向正确）。既有 `tools/lobby-smoke.js` J 组（竞品元素清零静态核查）**必须保持全绿**。
- **Bug 3 风险：实机视觉判定不可替代静态断言。** B3 是审美缺陷，`0/4` 与 `3/4` 之类的数值断言无法覆盖——须以 `tools/lobby-shots.js` 的**新截图人工核对**为准（`shots/lobby.png` 当前即为缺陷态基线，修复后应重新取证）。
- **跨缺陷共同影响：Bug 1 与 Bug 2 叠加会放大为「关卡推进不了 + 出口全堵」的硬性软锁**——玩家在失败页既出不去、回来又见拼图全锁，感知为游戏「坏了」。故 **Bug 2 应优先修复**（critical），Bug 1 次之（high），Bug 3 可与前两者同批交付（medium，纯视觉层，回归面最窄）。
- **流程门禁**：按 `CLAUDE.md` 的「Git 提交与远程推送门禁」，修复须先更新 `specs/001-slide-triple-match-core/tasks.md` 复选框，再 `git add . && git commit && git push`，且 **push 成功（exit 0）后**方可进入下一个功能模块。三个缺陷建议拆为 **3 个独立 commit**（Bug 2 先行），以便单独回滚与定位。

## Open Questions

- [NEEDS CLARIFICATION: Bug 1 —— 反推点亮态后，「点亮」是否仅用于**展示**，还是也应当**回写** `profile.paintingProgress` 以使 `+150` 满充能大奖的发放与星盘显示一致？本评估建议**不回写**（展示层纯计算，奖励发放仍走 `firstClear` 幂等账本），但这需要确认——若产品口径要求「点亮即发放」，则需要另一套幂等发奖账本。]
- [NEEDS CLARIFICATION: Bug 1 —— `effectiveCleared` 中的 `currentLevel` 指的是「当前**所处**关卡」还是「**最新解锁**关卡」？本评估按报告原文取 `Math.max(progress.unlocked - 1, currentLevel - 1)`，其中 `unlocked - 1` 已是最新已通关关卡；`currentLevel` 作为**下界**参与 max（即跳关到更高关时以跳关目标为准），语义等价。需确认这与「跳关后前面的拼图应点亮」的报告意图一致。]
- [NEEDS CLARIFICATION: Bug 2 —— 是否存在**除失败页外**的其他残留覆盖层风险？本评估已核查 `STM.Result` 无同类缺陷（`show()` 重建 + 展板自带 `hide()`），但 `STM.Modals`（设置/档案弹窗，`src/ui/modals.js`）的关闭路径未在本次范围内逐条核查，建议在 `/speckit-bug-fix` 时顺带验证。]
- [NEEDS CLARIFICATION: Bug 3 —— 徽标重制时，是否允许**同时**调整 `Glide` / `Critters` 的**文案配色**（当前为琥珀金 + 薄荷绿）？FR-039 §4 只约束「双层立体 3D 卡通字 + 琥珀暖金 / 薄荷翠绿胶囊底托」的结构与色相家族，若去掉胶囊底托，需确认仍在 spec 容许范围内（**去掉胶囊 ≠ 去掉薄荷绿**）。]
- [NEEDS CLARIFICATION: Bug 3 —— 「8 个长方体凸起」是**删除**还是**改造为真实齿形**？FR-039 §5.1 明确要求「表面带**机械齿轮刻纹**」，故**改造为齿形**更贴合 spec；纯删除则与 spec 条文相悖。需确认取「改造」而非「删除」。]

