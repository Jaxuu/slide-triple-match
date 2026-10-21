# Bug Verification: 主大厅拼图进度脱节 + 失败结算页出口按钮失效 + 大厅中央视觉不协调

- **Slug**: lobby-fail-ui-defects
- **Tested**: 2026-10-22
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

三项缺陷**均不再复现**，且未发现回归。拼图解锁状态在 `关卡 12` 下正确显示 `3/4` 并点亮前 3 块（第 3/6/9 关）高清风景切片、仅第 4 块待解锁；失败结算界面「重新开始」与「‹ 返回主大厅」**均能正确关闭弹窗并切换场景**（前者满血重开本关、后者回到主大厅）；主大厅中央 8 个棕色长方体已彻底删除、土棕底座已换为冰晶奶油白圆角画板、`Glide Critters` 已取消绿色胶囊并改为上下双行立体叠排。

验证以**真实 Chrome（CDP）+ 真实鼠标事件**驱动，并按用户要求**真实点满 7 格触发「收集槽爆满」**，而非直接调用 `STM.Fail.show()` 伪造失败界面。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| V1 拼图解锁状态（复现 assessment 的关卡 12 存档态） | `node .specify/bugs/lobby-fail-ui-defects/verify.js` | **pass** (9/9) | 预置 `unlocked=12/last=11/clearedLevels=[3,6,9]` + `paintingProgress` 全 0 的老存档漂移态；铭牌 `3/4`、前 3 块 `is-lit`、第 4 块 `is-blind` 且标注 `第 12 关充能` |
| V2 失败弹窗交互（**真实点满 7 格**） | 同上（L15，6 花色关卡） | **pass** (16/16) | 真实 `Input.dispatchMouseEvent` 点击棋盘滑块 → `dock=7` 且无三消 → 触发 `lost_burst`；「重新开始」→ 弹窗 `hidden=true`/`display:none`、回到局内、`lives=3`、`dock=0`、`phase=READY`；「‹ 返回主大厅」→ 弹窗关闭、`scene-lobby=true`、大厅可见 |
| V3 主大厅 UI | 同上 | **pass** (16/16) | `.portal-gear` = 0；底座渐变无 `rgb(126,84,30)`；`rgba(255,255,255,.92)` 冰晶白 + 2px 白内高光边框 + `rgba(30,64,175)` 蔚蓝投影；`Critters` `border-radius:0px` / 无边框 / 无内边距；2 行叠排容器；风翼 0 个；渐变 `#FFFFFF→#FFE9A8`；描边 `rgba(24,74,150)`；昵称条 `rgba(255,255,255,.92)` + `rgb(22,56,110)` |
| 新增/更新断言组（fix.md 所列） | `node tools/lobby-smoke.js` | **pass** | 83 passed, 0 failed（含新增 D 组 7 项、L 组 5 项） |
| 渲染回归 | `node tools/render-selftest.js` | **pass** | all green（含新增 Δ20「`.portal-gear` 已删除」静态断言；Δ17 竞品元素清零七项仍零命中） |
| 通关闭环回归 | `node tools/playthrough.js` | **pass** | 24 passed, 0 failed（复活链路 / 幂等发奖 / 零倒计时全绿——确认 Bug 2 修复未误伤复活） |
| 规则引擎回归 | `node tools/solver.js --engine-selftest` | **pass** | 11/11 all green |
| 可解性铁律 | `node tools/solver.js` | **pass** | 72/72 solvable，14.32s |
| 视觉取证 | `node tools/lobby-shots.js` + `node .specify/bugs/lobby-fail-ui-defects/shot-l12.js` | **pass** | `shots/` 11 张重新取证；另存 `lobby-level12.png`（关卡 12 / `3/4` 态） |
| Lint / type-check | — | **not-run** | 本项目为 Zero-Build 纯 Web（宪章 II），无 lint / type-check 工具链 |

## Output Excerpts

**V1 拼图解锁状态（修复前 → 修复后，同一探针）**

```
修复前: 关卡按钮="关卡 12"  铭牌="0/4"  点亮块=0  规则期望点亮块=3  → ★脱节
修复后: 关卡按钮="关卡 12"  铭牌="3/4"  点亮块=3  规则期望点亮块=3  → 一致
```

**V2 失败弹窗（修复前 → 修复后）**

```
修复前 点「重新开始」后: failHidden=false  failDisplay="grid"   lobbyHidden=true   sceneLobby=false
修复后 点「重新开始」后: failHidden=true   failDisplay="none"   lobbyHidden=true   sceneLobby=false
                              lives=3  dock=0  phase=READY
修复前 点「返回主大厅」后: failHidden=false  failDisplay="grid"   sceneLobby=true
修复后 点「返回主大厅」后: failHidden=true   failDisplay="none"   sceneLobby=true  lobbyHidden=false
```

**V2 真实失败触发链**（真实鼠标点击，非伪造界面）

```
✓ V2.0 已进局内且会话存在
✓ V2.1 真实点击触发「收集槽爆满」失败界面
✓ V2.4 失败原因文案为收集槽爆满
✓ V2.8 点「重新开始」→ 本关满血重开（生命 = 3）
✓ V2.9 点「重新开始」→ Dock 清空（重开本关）
✓ V2.10 点「重新开始」→ 会话回到可玩态
✓ V2.14 点「返回主大厅」→ 成功回到主大厅
```

**V3 主大厅 UI**

```
✓ V3.1 中央框边缘 8 个长方体已彻底删除（.portal-gear = 0）
✓ V3.2 土棕色底座已去除（渐变无 rgb(126,84,30)）
✓ V3.3 底座为冰晶奶油白（高白底色 rgba(255,255,255,.9x)）
✓ V3.6 Critters 已取消绿色胶囊外框（border-radius 归零）
✓ V3.8 标题为上下双行叠排（2 行容器）
✓ V3.10 两侧白色扁三角风翼已删除
✓ V3.13 Glide 无硬投影（字形渐变不被盖暗）
```

**回归套件**

```
[lobby-smoke] 结果: 83 passed, 0 failed
render-selftest: all green
[playthrough] 结果: 24 passed, 0 failed
engine-selftest: 11/11 all green
summary: 72/72 solvable, 耗时 14.32s
[verify] 结果: 41 passed, 0 failed
```

**视觉取证**（`lobby-level12.png`，实机截取）：`关卡 12` 按钮 + 顶部铭牌 `3/4`；前三块晶片显示 `bg1` 高清风景切片（雪山/古堡/湖畔），第四块仍为锁 + `第 12 关充能 · 💎×150`；中央画板为冰晶奶白（无土棕、无长方体凸起）；`Glide` / `Critters` 上下双行白→奶油黄立体字配天蓝描边，无绿胶囊、无白色扁三角；左下昵称条为白色磨砂胶囊深蓝字。

## Residual Risks

- **未覆盖真实移动设备触控**：本次以 CDP 真实鼠标事件（`Input.dispatchMouseEvent`）驱动，**等价于 pointerdown 路径**，但未在真机触摸屏 / 移动端浏览器上实测。失败页按钮使用 `click` 监听（与 `fail.js` 既有实现一致），在真机上的触控合成事件下行为预期一致，但**建议在真机补一次人工回归**。
- **「收集槽爆满」仅在 6 花色关卡（L15）构造成功**：3 花色关卡下 Dock 满 7 格必然凑出三消（自动腾位），无法构造爆满终局——这是规则本身的约束，非缺陷。已用 L15（6 花色）覆盖该路径。
- **V2.15 断言口径为公式一致性而非固定值**：因本轮已进 L15 并失败，`progress.last` 被记为 15，`maxPassed` 变为 14 → 第一幅画卷 4 块阈值（L3/L6/L9/L12）全部 ≤ 14 → 正确显示 `4/4`。故断言改为「点亮数 == 由 maxPassed 公式推出的块数」，而非硬编码 `3/4`。**关卡 12 态的 `3/4` 由 V1.2 独立覆盖**。
- **spec 与实现存在已知口径差**（fix.md 已记录）：FR-039 §4 仍描述「琥珀金渐变 + 薄荷绿胶囊 + 两侧风翼」、§5.1 仍写「琥珀金与虹彩棱晶配色」，而 Δ20 实现已改为「双行白/奶油黄 + 蓝色描边 + 无风翼 + 冰晶白画板」。**不影响功能正确性**，但建议下一轮 refine 同步 spec 文案。
- **`progress.clearedLevels` 未做压缩**：理论最大 72 项，当前规模无性能或存储压力；关卡数大幅扩容后需另行设计压缩表示。

## Recommendation

**Close the bug — verified end-to-end.** 三项缺陷均已通过真实浏览器端到端复现路径验证修复，且全部回归套件（lobby-smoke / render-selftest / playthrough / engine-selftest / solver 72-72）保持全绿。建议在合并至 `main` 后，于真机补一次失败页触控回归，并把 FR-039 §4/§5.1 的 spec 文案同步到 Δ20 实现口径。
