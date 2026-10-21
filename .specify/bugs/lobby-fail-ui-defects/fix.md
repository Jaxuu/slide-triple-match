# Bug Fix: 主大厅拼图进度脱节 + 失败结算页出口按钮失效 + 大厅中央视觉不协调

- **Slug**: lobby-fail-ui-defects
- **Fixed**: 2026-10-22
- **Verified**: 2026-10-22（见 ./test.md — **Result: verified**，41/41 端到端断言 + 全套回归绿）
- **Assessment**: ./assessment.md
- **Status**: applied → **verified**

## Summary

按 `assessment.md` 的根因结论修复三项实机缺陷：**Bug 1** 将大厅晶片点亮态从「只读 `profile.paintingProgress`」改为**以关卡进度为权威源反推**（`maxPassed = max(unlocked-1, currentLevel-1, ...clearedLevels)`），消除「关卡 12 却拼图 0/4」的脱节；**Bug 2** 在唯一场景切换入口 `enterGame()` / `enterLobby()` 统一关闭失败层，根除「按钮点了没反应」的残留遮罩软锁；**Bug 3** 删除 8 块土棕长方体凸起与绿色胶囊标题，重制为冰晶奶油白画板 + 上下双行叠排立体字标。关卡数据、RulesEngine 判定语义、profile v2 键结构、经济数值表与大厅背景贴图**零改动**。

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/main.js` | modified | Bug 1：`progress.clearedLevels` 新字段 + `normalizeCleared()` / `markCleared()` / `syncClearedFromProfile()` / `maxPassedLevel()`；`recordWin()` 记入已通关关卡；boot 时并入 profile v2 `firstClear` 账本。Bug 2：`enterGame()` / `enterLobby()` 开头统一 `STM.Fail.hide()`。大厅 `show`/`refresh` 透传 `clearedLevels`。 |
| `src/core/profile.js` | modified | 新增 `maxPassedLevel(ctx)` / `chargeLevelOf(idx, quad)` / `pieceUnlockFlags(idx, ctx)` —— 晶片解锁态的**纯计算**推导（零持久化写入）。 |
| `src/ui/lobby.js` | modified | `paintingState()` 改用 `pieceUnlockFlags()` 逐块判定点亮；`renderChips()` 按 `flags[q]` 渲染；新增 `progressCtx` + `setProgressCtx()`（合并式更新）；`show()`/`refresh()` 注入进度上下文。Bug 3：DOM 删除 `.portal-gear` ×8 与 `.lobby-brand-wing` ×2，徽标改为 `.lobby-brand-row` 上下双行；`drawChip()` 未点亮态改浅冰蓝半透明底（去斜叉折线）。 |
| `css/style.css` | modified | Bug 3：`.portal-ring` 改冰晶奶油白画板；删除 `.portal-gears` / `.portal-gear-*` / `.lobby-brand-wing*` 样式；`.portal-plaque` 改天空蓝渐变胶囊白字；`.lobby-brand-name` 改双行叠排、`.lobby-brand-glide` / `.lobby-brand-critters` 改纯白→暖奶油黄渐变 + 天蓝厚描边（去硬 `text-shadow`）；`.lobby-nick` 改纯白/浅蓝磨砂胶囊 + 深蓝文字；`.portal-chip` 内描边提亮。 |
| `tools/lobby-smoke.js` | modified | 新增 **D 组**（Bug 1 七项断言）与 **L 组**（Bug 2 五项断言）；B 组改双行叠排/无胶囊/无风翼断言；C4 改「8 齿凸起已删除」。 |
| `tools/render-selftest.js` | modified | Δ17 星盘载体断言去除 `portal-gear` 依赖；新增「`.portal-gear` 已删除」静态断言。 |
| `specs/001-slide-triple-match-core/tasks.md` | modified | 新增 Batch D（T076）任务条目与 Δ20 传播说明，复选框已勾选。 |
| `shots/*.png` | regenerated | `lobby.png` / `lobby-brand.png` / `lobby-portal.png` 等 11 张实机截图重新取证。 |

## Diff Highlights

**Bug 1 —— 点亮态反推（`src/core/profile.js`）**

```js
function pieceUnlockFlags(paintingIdx, ctx) {
  var maxPassed = maxPassedLevel(ctx);
  for (var q = 0; q < PIECES_PER_PAINTING; q++) {
    var req = chargeLevelOf(idx, q);          // 第 1 大陆 = L3/L6/L9/L12
    var inCleared = cleared.indexOf(req) >= 0;
    flags.push(req <= maxPassed || inCleared);
  }
  return { flags: flags, litCount: litCount, maxPassed: maxPassed, index: idx };
}
```

**Bug 2 —— 场景入口统一 teardown（`src/main.js`）**

```js
function enterLobby(opts) {
  opts = opts || {};
  if (STM.Fail) STM.Fail.hide();   // Δ20 Bug 2：关闭残留失败层（幂等）
  ...
}
function enterGame(id) {
  if (STM.Fail) STM.Fail.hide();   // 同上
  ...
}
```

**Bug 3 —— 徽标双行叠排 + 去胶囊（`src/ui/lobby.js` / `css/style.css`）**

```js
var nameWrap = h('span', 'lobby-brand-name', brand);
var rowTop = h('span', 'lobby-brand-row lobby-brand-row-top', nameWrap);
h('i', 'lobby-brand-glide', rowTop).textContent = 'Glide';
var rowBottom = h('span', 'lobby-brand-row lobby-brand-row-bottom', nameWrap);
h('i', 'lobby-brand-critters', rowBottom).textContent = 'Critters';
```

```css
.lobby-brand-glide {
  background: linear-gradient(180deg, #FFFFFF 0%, #FFFBEE 34%, #FFE9A8 74%, #FFD97A 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  -webkit-text-stroke: 2px rgba(24, 74, 150, .85);
  paint-order: stroke fill;
  filter: drop-shadow(0 4px 8px rgba(20, 50, 110, .40));  /* 禁用硬 text-shadow */
}
```

## Tests Added or Updated

- `tools/lobby-smoke.js::D1~D7` — Bug 1 回归：`关卡 12` 时 `maxPassed=11`、前 3 块点亮、第 4 块仍锁、铭牌 `3/4`、已点亮块标注清空、未点亮块标注 `第 12 关`。
- `tools/lobby-smoke.js::L1~L5` — Bug 2 回归：失败层可见 → 点「重新开始」后 `#fail-root.hidden === true` 且进入局内 → 点「‹ 返回主大厅」后失败层关闭且大厅可见。
- `tools/lobby-smoke.js::B9b/B10/B11/B12` — Bug 3 回归：双行叠排容器（2 行）、`Critters` 的 `border-radius === '0px'`（无绿胶囊）、两词上下叠排（`crittersTop >= glideBottom - 2`）、白色扁三角风翼数 = 0。
- `tools/lobby-smoke.js::C4` — `.portal-gear` 数量 = 0（8 齿凸起已删除）。
- `tools/render-selftest.js::Δ20` — 静态核查 `lobby.js` 中 MUST NOT 残留 `portal-gear` 构造。

## Local Verification

| 命令 | 结果 |
|------|------|
| `node tools/lobby-smoke.js` | **83 passed, 0 failed**（修复前为 79 passed / 4 failed，含本次新增 D/L 组） |
| `node tools/render-selftest.js` | **all green**（含新增 Δ20 断言；Δ17 竞品元素清零七项仍零命中） |
| `node tools/playthrough.js` | **24 passed, 0 failed**（复活链路、幂等发奖、零倒计时全绿——确认 Bug 2 修复未误伤复活） |
| `node tools/solver.js` | **72/72 solvable**，耗时 12.28s（关卡数据零改动，可解性铁律未破） |
| `node tools/solver.js --engine-selftest` | **11/11 all green**（规则语义零漂移） |
| `node tools/lobby-shots.js` | 11 张截图重新取证（`shots/lobby.png` 等） |

**实机探针复验（`.specify/bugs/lobby-fail-ui-defects/probe.js`，修复前同一探针的失败输出）**

| 缺陷 | 修复前 | 修复后 |
|------|--------|--------|
| Bug 1 | `关卡 12` / 铭牌 `0/4` / 点亮 0 块（期望 3） | `关卡 12` / 铭牌 **`3/4`** / 点亮 **3** 块 → **一致** |
| Bug 2 | 点「重新开始」后 `failHidden:false` / `failDisplay:"grid"` | `failHidden:**true**` / `failDisplay:"none"`；点「返回主大厅」同 |
| Bug 3 | `gearCount:8`（51×24px 棕色块）/ 底座 `rgba(126,84,30,.82)` 土棕 / `Critters` 绿胶囊 `radius:999px` / 白色风翼 2 个 | `gearCount:**0**` / 底座 `rgba(255,255,255,.92)` 冰晶白 / `Critters` `radius:**0px**`、渐变 `linear-gradient(#FFFFFF→#FFEFC0)` / 风翼 **0** 个 |

**人工视觉核对**：`shots/lobby.png` + `shots/lobby-brand.png` 实拍确认——中央画板为冰晶奶白（无土棕、无长方体凸起）、铭牌为天空蓝胶囊白字、徽标为上下双行白→奶油黄立体字配天蓝描边、左侧昵称条为纯白磨砂胶囊深蓝字；**背景贴图 `assets/bg/lobby_bg.jpeg` 保持原样未动**。

## Deviations from Assessment

1. **反推逻辑落在 `src/core/profile.js` 而非仅 `src/ui/lobby.js`**（assessment 列 `src/ui/lobby.js` 为主）。理由：`PAINTING_RANGES`（画卷 → 关卡区间）与 `firstClear`（已通关账本）均由 profile 模块持有，把 `pieceUnlockFlags` 放在那里可让「充能阈值」口径与 `PAINTING_RANGES` **同源**，避免在大厅层重复硬编码 `range[0] + 2 + 3*q`。`src/ui/lobby.js` 仍保留本地 `chargeLevelOf(st, quad)`（未标注文案用），两者口径一致。
2. **新增 `progress.clearedLevels` 持久化字段**（assessment 推荐「以关卡进度为权威源 + `clearedLevels` 并集」）。实现细节：`progress.clearedLevels` 与 profile v2 的 `firstClear` **取并集**维护——boot 时 `syncClearedFromProfile()` 把 `firstClear` 并入 `clearedLevels`，每次真实通关 `recordWin()` 再记入。二者**并存不迁移**（v1 键仅新增一个可选字段，旧存档缺省时回落空数组，读取逻辑向后兼容，不触发任何迁移写入）。
3. **Bug 2 采用「入口级统一 teardown」**（assessment 的**首选方案**，同时亦为 assessment 中标注的「最小热修」的加固版）——未在 `onRestart` / `onLobby` 回调内单独补 `STM.Fail.hide()`，因入口级修法覆盖未来任何新增出口。
4. **Bug 3 额外移除了硬 `text-shadow`**（assessment 未提及）。实机截图显示：`-webkit-text-stroke` + 偏移实色 `text-shadow` 会覆盖在 `background-clip:text` 的渐变填充之上，使字形整体发暗发蓝（「暗棕色」诉求未达成）。经 6 组变体对比渲染（留存于 `.specify/bugs/lobby-fail-ui-defects/brand-variants.png`）后改为「描边 + 柔和 `drop-shadow`」，字形恢复白→奶油黄渐变。此为达成 assessment 中「纯白到暖奶油黄立体渐变字」目标的必要调整。
5. **`.portal-gear` 8 齿长方体改为「删除」而非「改造为真实齿形」**（assessment 的 Open Questions 曾建议改造）。依据用户本次明确指令「**删除**拼图框外围那 8 个像创可贴一样的棕色矩形伪元素/子节点」。「机械齿轮刻纹」语义由 `.portal-ring` 的内描边 + 角部棱晶高光承载，FR-039 §5.1 的结构语义未破坏（该条要求的是**底座表面带刻纹**，非要求特定 DOM 齿数）。
6. **`.lobby-brand-wing` 白色扁三角风翼删除**（用户明确指令）。assessment 曾提议「改为挂在 `.lobby-brand` 居中对称」，本次按用户指令直接删除，双行叠排后由棱镜星芒统一点缀。

## Follow-ups

- **`spec.md` / `plan.md` 口径同步**（本次未改，按 assessment 范围仅更新 `tasks.md`）：FR-039 §4 徽标条文仍写「`Glide` 琥珀暖金渐变立体字 + `Critters` 薄荷翠绿胶囊底托字 + 两侧纯白滑行风翼」，而 Δ20 已改为「上下双行叠排 + 白→奶油黄渐变 + 蓝色厚描边 + 无风翼」。建议下一轮 refine 时把 FR-039 §4 与 FR-039 §5.1（星盘底座「琥珀金与虹彩棱晶配色」→ 冰晶奶油白）的描述同步到实现口径，避免 spec 与实现脱节。
- **`progress.clearedLevels` 的容量**：现为无上限数组（理论最大 72 项）。若未来关卡数扩容到千级，建议改为「已通关区间的压缩表示」，当前 72 关规模无需优化。
- **`STM.Result` 结算层的同类 teardown 风险**：本次核查 `enterResult` → `STM.Result.show()` 会重建并覆盖、`showBoard` 的「继续」按钮自带 `hide()`，**当前无 Bug 2 同类缺陷**；但 `STM.Modals`（设置/档案弹窗）的关闭路径未逐条核查，建议后续一并验证。
- **`shots/` 旧基线已更新**：`shots/lobby.png` 现为修复后形态，修复前的缺陷态基线仅保留在 git 历史中（commit `44e2bdb`）。
- **建议补跑 `/speckit-bug-test slug=lobby-fail-ui-defects`** 形成完整闭环（assess → fix → test），并产出 `test.md`。
