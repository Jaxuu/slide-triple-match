# Bug Verification: 飞行中途相邻卡牌不再"变身" + 待消区卡牌内嵌小方框彻底消失

- **Slug**: flight-neighbor-morph-dock-inset
- **Tested**: 2026-10-25
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

> Slug 解析路径：**from context**（本会话刚执行 `speckit.bug.fix`，且 `BUG_DIR/fix.md` 存在）。

## Summary

两个 Bug 在**真实渲染画面**层面均已消失，且都有"同一探针能抓到原缺陷"的负向对照：

- **Bug 1**：`L11 r0c1` 点击飞出的**全流程 728 帧**采样中，5 个相邻格的最大像素变化率仅 **0.71%**（阈值 2%），
  相邻格顶层卡牌 `id/z/suit` **0 处变化**；`t=30/60/90ms` 三个关键时间点同样达标。
  把修复回退后，同一探针在 `t=66ms` 立刻抓到齿轮格 **80.63%** 的整牌替换 → 证明探针有效。
- **Bug 2**：`file://` 下槽内卡牌留白区 `marginNonWhite = 0 / 4746`、`maxDeviation = 0`、`bbox = null`
  （即整片留白纯白），图标矩形内侧 1~4px 环带 `min = 255`；同一度量下修复前为 **973 / 205 / 217**。
  `#dock` 托盘 `rgba(30,41,59,0.55)` + `backdrop-filter: blur(10px)` **一行未改**。

无新增回归：`render-selftest` 的 11 项失败与 `playthrough` 的 1 项失败与修复前**逐条一致**（既有失败，已用 `git stash` 回退复跑确认）。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| 复现（修复后）· Bug 1 | `node .specify/bugs/.../probes/bug-verify-bug1.js 11 r0c1` | **pass** | 728 帧，最大变化率 0.71%，状态层 0 变化，`RESULT: PASS` |
| 复现（修复后）· Bug 2 | `node .specify/bugs/.../probes/bug-verify-bug2.js 3 5` | **pass** | 13/13 断言通过，`RESULT: PASS` |
| 负向对照 · Bug 1 | `git stash push -- src/render/BoardRenderer.js` 后复跑同一探针 | **fail（预期）** | 齿轮格 `1:1` 在 `t=66ms` 达 **80.63%**、`1:2` 2.8% → 探针确能抓到原缺陷 |
| 负向对照 · Bug 2 | `git stash push -- css/style.css` 后以 `baseline` 模式跑同一探针 | **fail（预期）** | 同口径：`marginNonWhite = 973`、`minChannel = 205`、`innerBand = 217`、`iconFilter = drop-shadow(...)` |
| 新增测试 | `node tools/render-selftest.js`（场景 K） | **pass** | `scenarioAnimLayerZOrder()` 15/15 全绿（源码结构 + 真实 20 帧 `drawImage` 轨迹 + CSS 口径） |
| 回归套件 · selftest | `node tools/render-selftest.js` | **fail（既有）** | `FAILED — 11 失败项`，与修复前逐条相同（图鉴 45→90、SHEETS 3→6、splash 2000ms/背景色） |
| 回归套件 · 通关 | `node tools/playthrough.js` | **fail（既有）** | `23 passed, 1 failed`，失败项 `⑥d 板面成组消除 — 18 -> 18`；`git stash` 回退三处改动后结果完全一致 |
| Lint / type-check | — | not-run | 项目未配置 lint / tsc |

## Output Excerpts

### Bug 1 —— 逐帧像素 + 状态（`bug-verify-bug1.js 11 r0c1`，修复后）

```
keyingAvailable = true
L11 n=7 cell=70.29 dpr=2.00 tapped=0:1
相邻格: 0:0 | 0:2 | 1:0 | 1:1 | 1:2
点击: {"id":17,"r":0,"c":1,"z":0,"s":2,"gear":{"id":37,"cell":"1:1"}}
联动齿轮格: {"id":37,"cell":"1:1"}  在相邻格内 = true
采样帧数 = 728

--- 噪声基线（点击前连拍两帧，无动画）---
  0:0/0:2/1:0/1:1/1:2  ratio 全为 0%

--- 像素层：飞行全程单格最大变化率（阈值 2%）---
  0:0  maxRatio=0.59%  changed=118/19881  PASS
  0:2  maxRatio=0%     changed=0/19881    PASS
  1:0  maxRatio=0.23%  changed=45/19881   PASS
  1:1  [齿轮格·对稳定态·金环已掩码] maxRatio=0%   PASS
  1:2  maxRatio=0.71%  changed=141/19881  PASS

--- 关键时间点（30/60/90ms）---
  t≈30ms（实际 27ms）: 0:0=0.59%  0:2=0%  1:0=0.23%  1:1=6.37%(原始值,含金环)  1:2=0.12%
  t≈60ms（实际 55ms）: 0:0=0.59%  0:2=0%  1:0=0.23%  1:1=6.37%(原始值,含金环)  1:2=0.58%
  t≈90ms（实际 95ms）: 0:0=0.59%  0:2=0%  1:0=0.23%  1:1=6.37%(原始值,含金环)  1:2=0%

--- 状态层：相邻格顶层卡牌 id/z/suit ---
  全部一致（0 处变化）PASS

=== RESULT: PASS  (像素异常格=0, 状态异常=0) ===
```

> **关于 `1:1 = 6.37%`**：该格是联动齿轮格，6.37% 是**未扣除金色脉冲环**的原始值，
> 而金环是 `gear` 动画的**合法特效**（本就该动）。权威口径是"扣除金环 + 与动画结束后稳定态比对"，
> 该口径下为 **0%**。其余各格残余的 0.2~0.7% 经 bbox 定位均在卡片右/下边缘 2px 窄条内
> （飞行卡自身越过 1px 接缝），**动物图案区域像素完全一致**。

### Bug 1 —— 负向对照（回退 `BoardRenderer.js` 后同一探针）

```
1:1  maxRatio=80.63%  @t=66ms    ← 整牌被低层齿轮牌覆盖重绘
1:2  maxRatio=2.80%   @t=66ms
=== RESULT: FAIL ===
```

### Bug 2 —— 槽内卡牌 vs 棋盘卡牌（`bug-verify-bug2.js 3 5`，修复后）

```
形态: file://   keyingAvailable = false
dock 内牌数 = 5

--- ① computedStyle ---
  dockClass    = no-keying
  dockBg       = rgba(30, 41, 59, 0.55)      ← 托盘仍深色半透明（硬约束）
  dockBackdrop = blur(10px)                  ← 磨砂仍在
  slotBg       = rgba(0, 0, 0, 0)            ← 空槽透明，保留托盘深色
  chipBg       = rgb(255, 255, 255)   chipRadius = 8px
  iconFilter   = none                        ← 画方框的元凶已断
  iconBlend    = darken                      ← file:// 下白底融进白卡面

--- ② dock 槽内卡牌（4x）---
  marginNonWhite = 0 / 4746   minChannel = 254   maxDeviation = 0   bbox = null
  图标内侧环带最暗: 255

--- ③ 棋盘卡牌（同口径对照，已扣除方向角标区）---
  marginNonWhite = 0 / 3660   maxDeviation = 0   bbox = null

--- ④ 机制 A/B：临时把 drop-shadow 加回去 ---
  marginNonWhite = 973 / 4746   maxDeviation = 50   bbox = [37,156,138,166]
  图标内侧环带最暗: 217

=== RESULT: PASS  (失败 0 / 13) ===
```

### Bug 2 —— 负向对照（`git stash push -- css/style.css` 后同口径重测）

```
iconFilter     = drop-shadow(rgba(15, 23, 42, 0.38) 0px 2px 3px)
iconBlend      = normal
marginNonWhite = 973 / 4746   minChannel = 205   maxDeviation = 50   bbox = [37,156,138,166]
图标内侧环带最暗: 217
[baseline 模式] 已写入基线: marginNonWhite = 973
=== RESULT: FAIL  (失败 5 / 12) ===
```

**同口径对比表**（这是判定"方框消失"的核心证据）：

| 指标 | 修复前 | 修复后 | 含义 |
|------|--------|--------|------|
| `marginNonWhite`（图标外侧卡片留白） | **973 / 4746** | **0 / 4746** | 留白区从 973 个非白像素降到**整片纯白** |
| `maxDeviation` | 50 | **0** | 最深灰像素与纯白之差归零 |
| `bbox`（非白像素包围盒） | `[37,156,138,166]` | **`null`** | 连"框的位置"都不存在了 |
| 图标内侧 1~4px 环带 `min` | 217 | **255** | 内圈也彻底纯白 |
| `minChannel` | 205 | 254 | 最暗像素从浅灰回到近纯白 |

### 8x 放大截图（人工可复核）

- `frames/profile-dock-chip-8x-fixed.png`（修复后）：白卡内**只有居中狐狸**，无任何框线
- `frames/profile-dock-chip-8x-filterback.png`（A/B 加回投影）：可见一圈清晰的灰色矩形描边
- `frames/verify-dock-chip-4x.png` / `verify-dock-chip-filterback-4x.png`：4x 同款对照
- `frames/verify-dock-full-5x.png`：`#dock` 整体 5x，托盘仍为深色半透明磨砂
- `frames/file-dock-L3-multi-zoom.png`：file:// 下 5 个 chip 并排，全部零内框、空槽仍深色

### 回归套件

```
render-selftest: FAILED — 11 失败项: 图鉴总量 45 种（Suit 0~44）; 三阶段各 15 种; Δ16a 阶段边界;
72 关图案均落在对应阶段池内; L21 图案全在陆地萌宠池（0~14）; Emoji 码点表 45 条全覆盖;
sheet 切片: 15 格注册 + 第 16 格跳过; SHEETS 配置: 3 张 × 基址 0/15/30 × 15 格;
Δ16d: 开机动画总时长 ≈2.0s; Δ16d: 开机背景为高级黑径向渐变; Δ16d: 开机背景含黑曜石微光口径

[playthrough] 结果: 23 passed, 1 failed
```

> 两组失败均**不是本次修复引入**：`git stash` 回退本次三个改动文件后复跑，结果逐条完全一致。
> 成因是测试仍按「3 张图集 × 15 格 / 45 图鉴 / splash 2.0s」断言，而实现已扩到 6 张 × 16 格 / 90 图鉴。

## Residual Risks

1. **真机未覆盖**：验证全部在 Chrome 无头（`file://` 与 `http://` 两种形态）完成。
   `mix-blend-mode: darken` 与 `#dock` 的 `backdrop-filter: blur(10px)` 在 iOS Safari / 微信内置浏览器上
   是否共存正常，仍需真机跑一次。若真机上 `darken` 与 `backdrop-filter` 冲突，表现会是"卡片白底重新露出来"，
   可回退到"给 canvas 贴图预乘 alpha"方案。
2. **无头软件渲染的帧密度**：Bug 1 的 728 帧依赖时间膨胀（`k=0.25`）才采到 `t=30/60/90ms`。
   时间膨胀只拉伸动画时间轴与画面一致推进，不改渲染路径；但真机 GPU 渲染下的**合成时机**仍可能不同
   （尤其 `backdrop-filter` 的合成层）。建议真机复测时用同一探针再跑一次。
3. **`1:1` 的 6.37% 原始值**：若后续把金环掩码逻辑改坏，这条会被误读为回归。判定口径已写进探针注释与本文。
4. **`reveal` 分支仍为死代码**（评估附带发现）：本次未动，动画层循环里的 `a2.kind === 'reveal'` 跳过分支
   实际永不触发。属既有技术债，不影响本 Bug。
5. **测试基线未治理**：`render-selftest` 的 11 项 + `playthrough` 的 1 项既有失败仍会持续掩盖真实回归。

## Recommendation

**关闭该 Bug —— 已在真实渲染画面层面端到端验证通过，且每个结论都有负向对照支撑。**

两条修复都符合"仅表现层变更"边界（未动 `RulesEngine` / `levels.js` / `main.js`），
`#dock` 托盘的深色半透明磨砂硬约束一行未改。

建议后续单独立项处理两件事：
1. **测试基线治理**（把 selftest/playthrough 的既有失败修掉或按新数据更新断言），否则下一轮回归仍无法判读；
2. **真机复核**（iOS Safari / 微信内置浏览器下 `darken` + `backdrop-filter` 的共存表现）。
