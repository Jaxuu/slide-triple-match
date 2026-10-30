> **Propagated**: 2026-10-30 — **R5（FR-028 垂直雨幕 + 新增 FR-049 点击链路音效唯一性 / SC-024）已全量落地**：① §10 **废除 `In-Place Diagonal Cascade`**（`DIAG_STEP` / 缩放弹入 / 峰值超调 / 12px 微落 / 半格 floor 归一整体下线），**新增 `Vertical Rain Drop`**（`TILE 200 / IMPACT_AT 0.78 / FALL_CELL 1.0 / SQUASH_PX 5 / TARGET 400 / ROW_STEP 预算反算`，`f(p) = 6p² − 8p³ + 3p⁴` 速度峰在 `1/3`，`sq(τ) = SQ·e^(−4τ)·cos(πτ)` 单半周期；`dx ≡ 0`、底边恒贴地、首排越界半格由 `#vfx-canvas` 接续）；② **Audio Bank 瘦身**——`SFX` 表只剩 `match` / `victory` / `defeat` / `iceBreak` 四项，八个方波/滑音一次性音键 MUST NOT 恢复。**边界不变**：两处均为**纯表现层**，MUST NOT 进入 `RulesEngine` / Solver / Undo 快照 / `levels.js`（`levels.js` `git diff` 恒空为硬门禁）。

# Data Model: Slide & Triple（滑块三消）

> **Propagated**: 2026-10-28 — **Δ30（三消碎块掉落整体废除 → 三合一磁吸碰撞 + 闪白高光微震坍缩；开局进场零延迟 + `360~420ms` 锁死）** refine 传播：§10 **废除 Shard Atlas**（图集 / 27 张染色切片 / 泛洪键控 / 染色 LUT / 方向光 / `vfxShards` 池 / 抛物线物理 / 爆心辉光 / 挤压闪白前摇**整体下线**）、**新增 Collapse Impact**（双环 + 四角星芒 + `dockGhost` 按槽位映射 + 冻结 `220ms` / FLIP `140ms`，纯表现层）、**Deal Choreography 属性重算**（`totalMs` 由 `180 + max(260,(N-1)×12) + 260 + 55×zMax` 改为 `(W−1) × waveStep + TILE + zStep × zMax`，`stepMs` / `inFlightPeak` 两字段由 `waves` / `waveStep` / `zStep` / `maxDelay` 取代）。**边界不变**：两个实体均为**纯表现层**，MUST NOT 进入 `RulesEngine` / Solver / Undo 快照 / `levels.js`（`levels.js` `git diff` 恒空为硬门禁）；`Collapse Impact` 的 `dockGhost` 只影响 `renderDock()` 的 HTML 拼接，MUST NOT 写回 `session.state().dock` / 参与命中判定 / 改变归拢顺序。
>
> **Propagated**: 2026-10-27 — **Δ29（困难关顶部待消区流光预警横幅 + 三消 3D 碎块质感重塑）** refine 传播：§10 **新增实体 Peak Warning Banner**（`PEAK_LEVELS` 12 关常量表 + 六画卷主题色 + 横幅时序，纯表现层）；**Shard Atlas 就地修订**——键控改**边界连通域泛洪**（暗面保留，暗部占比 `>= 15% → >= 25%`）、发射口径 `120~150 枚/重力 2600/径向迸射/alpha 0.84~0.96` → **`36~54` 枚 / 重力 `6400` / 微跳 `-480~-300` / alpha 恒 `1.0`**。**边界**：两个实体均为**纯表现层**，MUST NOT 进入 `RulesEngine` / Solver / Undo 快照 / `levels.js`（`levels.js` `git diff` 恒空为硬门禁）。**（Δ30 注：本段的 Shard Atlas 修订已随实体整体废除；Peak Warning Banner 不受影响，仍然有效。）**
>
> **Propagated**: 2026-10-26 — **Δ28（三消碎裂两处返修：爆发时序 + 材质质感）** refine 传播：**不新增实体**，就地修订 **§10 的 Shard Atlas**（补 `themes` / `rampMid` / `rampGamma` / `shadeAlpha` / `normLo` / `normSpan` / `themeOf(i)` 字段与「暗部占比 `>= 15%`」不变量）与新增 **Pending Shatter / Dock Ghost** 两个**会话级表现态**（`main.js` 作用域，**不入 §10 实体表**——它们不是模型，是一次三消的生命周期中间态，MUST NOT 持久化、MUST NOT 参与判定）。**边界**：`pendingShatter` / `dockGhost` 只影响 `renderDock()` 的 HTML 拼接与碎裂触发时机，MUST NOT 写回 `session.state().dock` / 参与命中判定 / 改变归拢顺序；`dockGhost` 的生命周期与既有 `dockFreezeUntil` 冻结窗口绑定（`180ms` 后清空并重渲染），换关 / 重置 MUST 立即清空（含 `pendingShatterTimer`）。

> **Propagated**: 2026-10-25 — **Δ22（全景声学 + 5 秒连击 + 15 种开局编舞）** refine 传播：新增 **§10 增量实体** 章节，补齐 **Δ16 / Δ19 / Δ21 / Δ22 四轮累计拖欠的 10 个实体**——Δ16（Painting Progress / Prism Balance / Player Profile）、Δ19（Shape Mask / Bottleneck Chain / IQ Meter / Top Dock Tray）、Δ21（Deadlock Guard）、**Δ22（Audio Bank / Combo Window / Deal Choreography）**。此前三条 STALE 警告（Δ16/Δ19/Δ21）一并清除——本次为**一次性补齐**，非仅加 Δ22 三实体。**边界**：新增实体全部为**表现层 / 持久化层 / 防御层**，MUST NOT 改变 `levels.js` 的关卡数据契约与 `RulesEngine` 的判定语义（FR-032）；其中 **Combo Window 与 IQ Meter 的连击口径相互独立、MUST NOT 合并**（见 §10 表末注记）。

> **Propagated**: 2026-10-26 — **Δ27（方向性飞行轨迹 + 进场清晰度与逐张节奏 + `shards` 3D 碎块）** refine 传播：§10 新增 **Tile Flight**（FR-053 运行时载体）与 **Shard Atlas**（FR-049 §8~§13 载体）两实体；**Deal Choreography 就地修订**——`totalMs` 由固定 `<= 1000ms` 改为按 FR-052 §10 公式自适应（`180 + max(260, (N-1) × 12) + 260 + 55 × zMax`），并补 `stepMs`（`>= 12ms`）/ `inFlightPeak`（`<= 22`）/ `zLock`（同坐标层序锁）三字段。**边界不变**：两新实体均为**纯表现层**，MUST NOT 进入 `RulesEngine` / Solver / Undo 快照 / `levels.js`；Tile Flight 的 `board` 段 MUST 参与既有 `(z, r, c)` 升序绘制序（这是「飞行时旁边卡牌变底层」的修复要点），Shard Atlas 的键控 MUST 早于 `startDeal()` 且失败时降级 FR-049 §3 程序化兜底。

**Feature**: `001-slide-triple-match-core` | **Phase**: 1 | **Date**: 2026-10-17

**来源**: [spec.md](spec.md) Key Entities + [plan.md](plan.md) 架构决策（Δ1~Δ6、D-02/07/11/12/15）。字段命名遵循 [level-data.md](contracts/level-data.md) 的持久化 schema（紧凑名）；本文档用全称注释。

## 实体总览

```text
Level (静态配置, 60×·Δ13 扩容) ──加载──→ Session (运行时会话, 1..1)
  ├─ TileSpec[] (初始布局)          ├─ BoardCell[N×N] (含 Tile 运行态)
  ├─ PrismSpec[] (棱镜格)           ├─ DockSlot[7]
  ├─ LevelConfig (关卡参数)         ├─ StagingSlot[3]
  ├─ LevelMetrics (量化指标)        ├─ ItemCharges (道具次数)
  └─ solutionMoves (最优解)         ├─ HistoryStack (Undo 快照)
                                    └─ Outcome (胜负/死局)
SolverReport (流水线工件, 1)  ←验证── 60×Level
```

## 1. Level（关卡静态配置）

**载体**: `src/data/levels.js` 中 `STM.LEVELS` 数组的元素；由 `tools/generator.js` 导出（M1/M2 为手工测试关，schema 相同）。前端只读。

| 字段 | 类型 | 约束 / 校验规则（`RulesEngine.validateLevel` 执行） |
|---|---|---|
| `id` | int | 1 起连续；`LEVELS[i].id === i+1`（索引=关卡号-1，跳关/进度以此为界） |
| `chapter` | int | 1~3（默认交付; Δ11 阶段章 = 前期/中期/后期），由参数表派生；仅展示与统计用 |
| `name` | string | 展示名（如 "Level 7 · 齿轮初鸣"），非机制判据 |
| `n` | int | 网格边长，4 ≤ n ≤ 8（FR-008 矩阵） |
| `tiles` | `TileSpec[]` | 见 §2；长度 = 滑块总数，`tiles.length % 3 === 0 && ≥ 6`（FR-029）；无重复 `(r,c)`；无滑块占据棱镜格 |
| `prisms` | `PrismSpec[]` | 见 §3；可空数组（L1~35 多数关卡）；无对射循环布局（FR-022，Generator 拒绝 + validate 校验） |
| `cfg` | `LevelConfig` | 见 §4 |
| `metrics` | `LevelMetrics` | 见 §5；由 Solver 产出、前端只读展示（调试面板/难度分） |
| `solutionMoves` | `MoveSpec[]` | 见 §6；Solver 产出的最优解 tap 序列（含暂存区回填 tap）；首元素即 Hint 基准 |
| `theme` | string? | 可选视觉主题（如对称图案关 "butterfly"/"ring"），仅渲染参考 |

**关系**: `Session` 按 `id` 加载构造运行态；`SolverReport` 每关一条验证记录以 `id` 对应。

## 2. TileSpec / Tile（滑块：静态与运行态）

### 2.1 TileSpec（levels.js 内静态）

| 字段 | 类型 | 约束 |
|---|---|---|
| `r, c` | int | 0 ≤ r,c < n |
| `s` | int (0..7) | 花色符号索引，映射 [BoardRenderer 花色表](contracts/game-session.md) §4（8 种颜色+图形双编码） |
| `d` | int (0..3) | 方向，`0=U, 1=R, 2=D, 3=L`（**数字顺序即顺时针序**，「旋转 90°」= `(d+1)%4`，D-12） |
| `m` | string? | 机制标记，单选：`'g'`(gear) / `'i'`(ice) / `'c'`(chainLocked) / `'k'`(key)；**互斥**（D-11），null = 普通滑块 |
| `x` | int? | 机制参数：ice = 冰层厚度 ≥1；key = 配对的锁链滑块 id 列表长度的锚（详见链表字段）；其余 null |

> 键与锁链配对不内嵌 TileSpec（避免数组内指针），改用 `cfg.chains` 显式边表（见 §4）——数据校验与 Generator 逆操作都更简单。

### 2.2 Tile（运行态，GameState 内）

| 字段 | 类型 | 说明 / 状态转移 |
|---|---|---|
| `id` | int | 滑块实例号（= 加载时 TileSpec 索引，锁链配对引用它） |
| 上述静态字段 | — | 加载时深拷贝 |
| `ice` | int | 当前冰层厚度；`--` 于每次三消（口径 `triple`）或十字相邻飞出（口径 `adjacent`）；归 0 → 机制标记清除、变普通滑块（FR-015/016） |
| `locked` | bool | 锁链状态；配对钥匙全部飞出 → false（FR-018/019，一钥多锁见 cfg.chains） |
| `d` | int | **可变**：齿轮旋转/扳手道具 `(d+1)%4`（FR-013/Δ1/FR-024-2） |
| `_fly` | enum? | 渲染态（idle/flying/blocked），RulesEngine 输出，渲染消费 |

**Tile 状态转移（机制轴）**:

```text
普通 ──扳手──→ (d+1)%4（不变机制）
冰封(ice=k) ──k次破冰事件──→ 普通      [不可 tap、可阻挡]
锁链(locked) ──钥匙飞出──→ 普通        [不可 tap、可阻挡]
齿轮 ──十字相邻飞出──→ (d+1)%4         [可 tap]
```

**点击可飞出（tap 可行）谓词**（RulesEngine `canTap`，全部机制的统一入口）:
`tile 机制状态 ∉ {冰封(ice>0), 锁链(locked)}` 且（棋盘滑块：射线判定见 [rules-engine.md](contracts/rules-engine.md) §3；Δ9: 暂存区已移除——不再有 staging 滑块）。

## 3. PrismSpec（变向棱镜，机制 D）

| 字段 | 类型 | 约束 |
|---|---|---|
| `r, c` | int | 0 ≤ r,c < n；不与任何 tiles 重叠 |
| `t` | `'/'` 或 `'\\'` | 棱镜型 |

**运行态**：不可变（固定、不可移走、非滑块、非普通障碍——FR-021）。反射映射表（8 条全枚举，D-12）见 [rules-engine.md](contracts/rules-engine.md) §4。**单次飞出折射上限 1**（FR-022）：滑块经折射后若新射线遇阻挡 → 整体弹回原位（不「折射一半」）。

## 4. LevelConfig（`cfg`：关卡级参数）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `lives` | int | 3 | 生命值（FR-003）；≤0 判负 |
| `damageOnBlock` | bool | 见章 | 受阻扣命开关：第 1、2 章 false，第 3 章起 true（FR-003/Edge Case） |
| `items` | `{undo, wrench}` : int | 1/1 | 道具次数（FR-025，可被关卡覆盖；Δ9: stage 已移除） |
| `iceMode` | `'triple'` \| `'adjacent'` | `'triple'` | 破冰口径（FR-016 变体） |
| `chains` | `[keyTileId, [lockedTileId,...]][]` | `[]` | 钥匙→锁链配对边表（FR-019，一钥多锁）；keyId 必须指向 `m==='k'` 滑块，lockedId 指向 `m==='c'` 滑块；锁链滑块可被多钥配对（任一配对钥全飞出即解锁该锁——**取或**语义，validate 校验无自环/无空配对） |
| `scoring` | `{comboBase, comboStep}` | 10/5 | 计分参数（连击） |

## 5. LevelMetrics（`metrics`：量化难度指标，FR-011）

| 字段 | 类型 | 定义（Solver 口径，可复现 D-08） |
|---|---|---|
| `minMoves` | int | 最优解步数（迭代加深 DFS 首解即最优，D-07） |
| `solutionCount` | int \| `">=10000"` | 预算内不重复终局路径数（封顶标记，spec 只要求可复现存在） |
| `dockPeak` | int | 求解搜索全路径中 Dock 占用数最大值（槽位压力峰值，1..7） |
| `mechCount` | int | 启用机制数（0~4：按 tiles/prisms/cfg 实际出现计） |
| `difficultyScore` | int | 难度评估分 = 加权（`minMoves`、`solutionCount` 逆、`dockPeak`、`mechCount`、`tiles.length`、花色数）——权重在 level-config.js §评分，曲线门按它校验（SC-004） |
| `openSuitsMax` | int | 最优路径上最大开放花色数（生成器约束 ≤5 的验证值，FR-029/Edge Case） |

## 6. MoveSpec（`solutionMoves` 元素）

| 字段 | 类型 | 约束 |
|---|---|---|
| `k` | int | 动作类型：`0` = tap 棋盘滑块，`2` = 使用扳手道具（`t` = 目标滑块 id；极端最优解可能需要道具——Solver 动作集含扳手，见 level-pipeline.md §动作集；Δ9: k=1 暂存回填已移除） |
| `t` | int | 目标滑块 id（k=0/1）；k=2 时省略 |

**不变量**: 回放 `solutionMoves` 于初始局面必达胜利（Solver 产出保证 + Generator 正向自检二次验证，D-10）；长度 = `metrics.minMoves`。

## 7. Session（运行时会话，GameState 产物）

| 组成 | 说明 |
|---|---|
| `board: (Tile\|null\|PrismRef)[][]` | n×n 运行棋盘；棱镜格常驻（不可覆盖） |
| `dock: Tile[]` | ≤7；**插入规则**：同花色相邻归拢（`[s s s]` 相邻排列，FR-004）；三消判定只依赖花色计数（D-07 规范化的运行时体现）；Δ9: staging 已移除——滑块只在「棋盘 → Dock → 三消」单向守恒 |
| `items` | 道具余量（cfg.items 拷贝递减） |
| `history: Snapshot[]` | 每原子回合前快照（Undo 弹栈恢复，FR-024-1/Edge Case 级联整体回滚） |
| `combo, score` | 连击窗口（连续飞出三消间隔）与分数 |
| `lives` | 当前生命 |
| `phase` | 会话状态机（下节） |

### Session 状态机

```text
LOADING → READY → WON | LOST_BURST | LOST_LIVES | LOST_DEADLOCK
WON/LOST ──结算交互──→ (下一关: id+1>LEVELS.length ⇒ ALL_CLEAR 终局 | 重玩: 同 id 重载)
```

- **Δ10 无锁连点**: 无 ANIMATING/SETTLING 态——`tap()` 在 READY 态 0ms 瞬时结算（级联链在 applyTap 返回前原子结算完毕，Edge Case「同一点击内连环触发」的确定性保持）；动画纯视觉异步并发，不阻塞下一次点击（「别急，动画中…」输入锁已删除）。
- 判定调度（每原子回合末——tap 返回前，顺序固定）: ① 棋盘+dock 全空 → WON（Δ9: 暂存区已移除）；② dock 满且无三消 → LOST_BURST；③ lives ≤0 → LOST_LIVES；④ 疑死锁谓词 + 有界复证 → LOST_DEADLOCK（D-09）。
- **三消优先于爆槽**（Edge Case）：第 7 格飞入同 tap 内先结算三消再判负。

### Snapshot（Undo 快照）

`structuredClone`-深拷贝 `{board 滑块态, dock, items, combo, score, lives}`（D-07 的 dock 计数规范化仅限 Solver 哈希；**运行时 dock 保序**以便 Undo/渲染精确还原；Δ9: staging 已移除）。棱镜与 TileSpec 静态部分不入快照（不可变）。

## 8. Progress（玩家进度，localStorage）

| 字段 | 类型 | 说明 |
|---|---|---|
| `v` | int | schema 版本 = 1 |
| `unlocked` | int | 已解锁最高关（1 ≤ ≤ LEVELS.length，加载时钳制——Δ4 扩容自适应） |
| `last` | int | 上次游玩关 |
| `best` | `{[id]: {score, combo}}` | 每关最佳分 |
| `muted` | bool | 音效开关 |

## 9. SolverReport（`tools/solver-report.json`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `schemaVersion` | int | 1 |
| `generatedAt` / `seed` / `nodeBudget` | — | 可复现基线（D-08） |
| `levels[]` | `{id, solvable, minMoves, solutionCount, dockPeak, mechCount, openSuitsMax, elapsedMs}` | 每关验证记录（metrics 双写：levels.js 与本报告，前端用前者、评审看后者） |
| `summary` | `{total, solvable, failedIds[], curveGate: {monotonic, ch5Zigzag, slope}}` | 50/50 与难度曲线门结论（SC-001/SC-004） |

## 10. 增量实体（Δ16 / Δ19 / Δ21 / Δ22 / Δ27 / Δ30）

> 本节为 **Δ16 起各轮增量的累计补齐**（此前仅散见于 spec.md 的 Key Entities，未落入本数据模型）。所有实体均为**表现层 / 持久化层 / 防御层**，不改变 §1~§9 的关卡数据契约与判定语义。

| 实体 | 增量 | 载体 | 关键字段 | 关系与不变量 |
|---|---|---|---|---|
| **Painting Progress**（画卷拼图进度） | Δ16（Δ17 载体改称晶片） | `profile.paintingProgress[6]`（localStorage v2） | `paintingIndex`（1~6）、`lit`（0~4 已点亮块数）、`litBy[]`（点亮来源的困难位关 id）、`browsingIndex`（当前浏览画卷，Δ17 左右切换） | 每通关 1 个困难位关（L3/L6/…/L72）点亮当前画卷 1 块；每 12 关拼齐 1 幅（FR-051 §2）。重复通关不重复点亮、不重复发奖。**零回写 levels.js**（FR-041 §4） |
| **Prism Balance**（棱晶余额） | Δ16 | `profile.shards` | `balance`（≥0 整数）、`earnedTotal` | 产出：首通普通 +25 / 首通困难 +60 / 满画卷 +150 / 重复通关 +10；消耗：道具 −50、复活 −100。扣费与生效 MUST 原子；余额 MUST NOT 为负 |
| **Player Profile**（玩家档案） | Δ16（Δ21 扩容） | `slide-triple:profile:v2` | `nickname`、`avatar`（Suit 0~89）、`settings{bgm, sfx, haptics}`、`debugPanel` | 头像切片复用 `sheet1~6`；【确认】为统一落库点（Δ18）；`settings.sfx` MUST 与音效复选框 `checked` **严格同向**（Δ21 修布尔反转） |
| **Shape Mask**（图形掩码模板） | Δ19 | `src/render/shape-masks.js` 常量表 | `maskId`（36 套之一）、`cells`（该层格点集合）、`layer`（底层/上层） | 每关底层与上层各绑定一个模板，落库于 `cfg`；**运行时 MUST NOT 随机选取**；Generator 与 `migrate-layout-72.js` 共用同一份定义 |
| **Bottleneck Chain**（瓶颈依赖链） | Δ19 | Solver Report 输出 | `chokePoints[]`（咽喉点位置 + 可行操作集大小）、`chainSegments[]`（连锁爽消段长度）、`singlePath`（是否唯一解） | 生成器按 FR-045 §3 构建；每关 MUST ≥2 个咽喉点（可行操作集 ≤3）且咽喉点间 ≥5 连可操作；MUST NOT 以牺牲可解性为代价 |
| **IQ Meter**（IQ 指数计） | Δ19（Δ20 改曲线） | `Session` 内纯表现态 | `iq`（初值 **50**、封顶 **200**）、`errorCount`、`elapsedMs` | 每三消 `delta = Base × M_combo × M_error × M_time`；受阻**不扣 IQ**但 `combo` 归零且 `errorCount += 1`。**MUST NOT 持久化**、不影响棱晶与进度 |
| **Top Dock Tray**（顶部待消槽） | Δ19 | DOM `#dock` | `slots[7]`、`filled` 状态类、托盘样式 | 由屏幕底部迁至**棋盘上方**（IQ 条正下方）；填充槽 MUST 去 `border/padding/background`（单层卡片，Δ21）；**Δ22：亦为连击飘字锚点**（飘字自其下方浮出） |
| **Deadlock Guard**（死锁自愈器） | Δ21 | `RulesEngine.findHeadOnDeadlocks / selfHealDeadlocks` | `headOnPairs[]`、`legalMoves[]`、`healRotations`（≤4）、`healLog[]`（入 Undo） | 每次操作结算后自检；优先旋转出「可立即飞出」；超限走乾坤洗牌兜底、**MUST NOT 判负**；MUST NOT 破花色守恒与零悬空；**MUST NOT 放宽 Generator 静态门禁** |
| **Audio Bank**（声学资产库） | **Δ22 / Δ23 → R5-1 瘦身** | `src/audio/SoundManager.js` 运行时态 | 外部轨：`assets{}`（8 文件的 `idle/loading/ready/failed` 状态）、`pools{}`（每音效实例池）、`bgmVolume{lobby: 0.45, game: 0.38}`（Δ23 由 `0.26/0.20` 修订）、素材响度基线（loudnorm 后 BGM `−18` / 音效 `−14` / 语音 `−13` LUFS）、`fadeProgress`、`shatterRate`；合成轨：`audioCtx`、`masterGain`（压缩总线 `−12dB / 5:1`）、三类合成参数（落牌涟漪节流 `45ms` / 单声 `15~22ms`）；**`SFX` 音色表（R5-1 后只剩 4 项）**：`match`（噪声带通 + 正弦/三角泛音）/ `victory` / `defeat` / `iceBreak` | 受 FR-037 的 SFX/BGM 开关与页面可见性统一调度；静音时**已排定的延迟触发 MUST 一并取消**；BGM 缺失回退程序化合成；`document` 级常驻手势兜底 `kickBgm()` 幂等拉回播放态。**FR-049 / I-7**：`click` / `gear` / `unlock` / `prism` / `undo` / `item` / `botTick` / `tick` 八键 MUST NOT 恢复（源码零 `square` / `sawtooth` 一次性交互音）；一次 `pointerdown` 派生的链路内交互反馈音只来自 `tap` / `knock`。**纯表现层，MUST NOT 持久化、MUST NOT 进 RulesEngine / Solver** |
| **Combo Window**（连击时间窗） | **Δ22** | `Session` 内纯表现态 | `comboCount`（初值 0）、`lastMatchAt`（`performance.now()` 时间戳）、`tier`（1/2/3/4/5+）、`pendingVoice`、`pendingFloat` | 每次三消：`now - lastMatchAt <= 5000` 则 `+1`，否则重置为 `1`；**无论续连与否刷新窗口**；MUST 用时间戳差值、**MUST NOT 用 rAF 帧计数**；受阻**不重置**（与 IQ 口径不同）。驱动 `sfx_shatter` 升调（1.00/1.06/1.12/1.18/1.25）、延迟 120ms 语音与飘字。**MUST NOT 持久化** |
| ~~**Deal Choreography**（开局编舞）~~ **（Δ31b 废除：15 种模式整体下线，由 `In-Place Diagonal Cascade` 取代）** | ~~Δ22（Δ27 修订 → Δ30b 重算）~~ | `BoardRenderer` 表现态 + `main.js` 调度 | `modeId`（15 种之一）、`prevModeId`（相邻去重）、`offsets{}`（逐牌起飞向量/旋转/缩放初值，**全部按 `cell` 换算**）、`delayOf(tile)`、**`waves`（`6~12`）**、**`waveStep`（`>= 14ms`，预算派生）**、**`zStep`（`8~24ms`，预算派生）**、**`tileMs = 140`**、**`totalMs`（Δ30b：`(W−1) × waveStep + TILE + zStep × zMax`，MUST 落 `360~420ms` 且**与牌数无关**；旧式 `180 + max(260,(N-1)×12) + 260 + 55×zMax` 作废）**、`maxDelay`（末波起跑，落子音时间轴分母）、`zLock`（同坐标层序锁：同 `(r,c)` 组内低 `z` 的 `delay` 恒严格更小）、`fastForwarded`（点击快进标记） | `LEAD = 0`——**取消 `0~180ms` 留白**，`startDeal()` 后第 1 个 rAF 采样帧 MUST 已有 `>= 1` 张处于进场变换态（MUST NOT 出现"棋盘全空"帧）；**波内 `delay` 完全相同（同起同落）**、波间恒差 `>= waveStep`；波次切分**层带优先**（按 `z` 升序分层带 → 层内按编舞序切空间连续块），故同 `(r,c)` 的层叠牌必然落在不同波次且低层在前；绘制排序 MUST 复用静态比较器 `(a.z-b.z)\|\|(a.r-b.r)\|\|(a.c-b.c)`——**Δ30b 后这是零穿模的唯一保证**（`zStep` 只负责"先底后上"的节拍）；入场 `a0 >= 0.62`、进度 `35%` 内 alpha 达 `1.0`、缩放 `<= 1.15`、非等比较小轴 `>= 0.55`（`blinds_flip` 走遮罩揭示而非 `scaleX` 压缩）；单卡初始位移 `0.3~1.4 × cell`、缓动统一 `quart`（**禁 `back` / `elastic` 过冲**）、末段 `10%` 时长内位移 `<= 2%`；落子音 `progress = delay / maxDelay`（**MUST NOT 用 `ord`**，同帧多牌先排序再发声）；点击 MUST 快进 100% 且正常响应。**MUST NOT 改卡牌花色/方向/坐标/层号，MUST NOT 持久化** |
| **Tile Flight**（卡牌飞行轨迹） | **Δ27** | `BoardRenderer` 表现态（`flights[]` + `tileInfo` 几何缓存）+ `main.js` 槽位配对（`pendingDock{}`） | `tileId`、`dir`（`U/L/R/D`，取自卡牌自身方向）、`from`（起点渲染实坐标，含奇数层半格偏移）、`to`（目标 `.slot[i]` 的**实时** `getBoundingClientRect()` 中心，窗口变化时重算）、`slotIndex`（由引擎 `dock` 事件给定，MUST NOT 由表现层推测）、`t0`/`dur`（`U` 单段 `<= 240ms`；`L/R/D` 两段：滑出 `<= 140ms` + 落入，总 `<= 320ms`）、`seg`（`board` 棋盘内段 / `offboard` 离场段，以「卡牌中心是否越出棋盘可视矩形」判定）、`ease`、`alpha0`（`>= 0.55`）、`scaleEnd`（`0.82`） | **绘制序铁律**：`seg === 'board'` MUST 与静止牌共用同一 `(z, r, c)` 升序比较器（飞行牌经 `tileInfo` 合成回 `renderList`，位移/缩放/alpha 由 `drawBoardTile` 内 `flightOf()` 施加，归位/离场即返回 `null` 走静态路径）；仅 `seg === 'offboard'` 才退出该序单独绘制，越界部分由既有 `#vfx-canvas` even-odd 互补裁剪接续（**零新增 canvas**）。揭示门控：`dock` 到达时目标槽保持 `.slot.empty`，落定回调**先出表再回调**并同帧切 `has-tile`（`<= 400ms` 兜底定时器）。MUST NOT 改动 `.slot` 的 DOM 与样式、MUST NOT 增删 `.slot` 的 class、MUST NOT 影响归拢顺序/命中判定/可解性、MUST NOT 持久化 |
| ~~**Shard Atlas**（碎块图集）~~ **（Δ30a 废除）** | Δ27（Δ28/Δ29 修订）→ **Δ30a 下线** | ~~`BoardRenderer` 内 `ShardAtlas` 运行时态（`assets/icons/shards.jpg`）~~ **已删除** | ~~`src` / `size 2048²` / `grid 3×3` / `slices[27]` / `bbox[9]` / `keyState` / `themes[3]` / `rampGamma` / `shadeAlpha` / `normLo` / `normSpan`~~ **全部不再存在** | **本实体整体废除**：碎块图集、27 张染色切片、边界泛洪键控、三段 ramp 染色、`source-atop` 方向光、`vfxShards` 池、抛物线物理（微跳 / 强重力 / 2.5D 翻滚）、爆心辉光 `vfxFlash`、挤压闪白前摇 **全部随特效下线**（MUST NOT 以注释、死代码或 `if (false)` 开关形式保留）。`assets/icons/shards.*` 文件 MAY 留在仓库，但**运行期 MUST NOT 加载 / 切片 / 键控**（验收：源码无 `shards.` 字面量、网络面板无该请求）。其验收职责由 **Collapse Impact**（本表下一行）与 SC-025 接管；`tools/shards-audit.js` / `tools/shard-vfx-smoke.js` 两道门禁**整份删除**（留空壳 = 永远 pass = 掩盖回归） |
| ~~**Collapse Impact**（三消坍缩演出）~~ **（Δ31a 废除：绘制型光环/星芒整体下线，由 `Pure-Card Collapse` 取代）** | ~~Δ30a~~ | `BoardRenderer` 表现态（`collapseRings[]` + `ringPool[]`）+ `main.js` 编排（`dockGhost` / `groupEndAt` / `collapseTimers`）+ `css/style.css` 关键帧 | **光环记录**：`kind`（`outer` / `inner` / `ray`）、`x` / `y`（视口 CSS 像素圆心）、`w`（槽宽，半径基准）、`t0`（绝对起跑时刻）、`dur`（外环 `80` / 内环 `48` / 星芒 `64`）、`r0 = 0.45`、`r1`（外环 `2.0` / 内环 `1.6`）、`color`（`#FFFFFF` / `hsl(205, 90%, 72%)`）、`lw0 = 2.5` / `lw1 = 1.5`、`ang` / `size`（星芒）、`spin`；**编排态**：`dockGhost = { map: { slotIndex: { suit, gid, dx } } }`、`groupEndAt{ gid: endAt }`、`collapseTimers[]`、`collapseGroupSeq`、`dockFreezeUntil`；**常量**：`COLLAPSE_TOTAL_MS = 220`、`COLLAPSE_RING_AT_MS = 140`、`DOCK_FREEZE_MS = 220`、`DOCK_FLIP_MS = 140`、`RING_*`（见 `STM.rendererTest.COLLAPSE`） | **三段时序（总 `220ms`）**：`0~80ms` 磁吸聚拢（`.dock-chip` 的 `translate3d(var(--suck-dx))`，`dx = 中心槽 left − 本槽 left`，**一次性**内联写入，MUST NOT 逐帧改样式）→ `80~140ms` 闪白膨胀（`scale 1.12→1.30` + `brightness >= 1.6` + 微震 `<= 1.5px`）→ `140~220ms` 坍缩（`scale → 0` + `opacity → 0`）；**光环起始帧 == 坍缩段首帧（`140ms`）**，双环错峰 `32ms`、`(1-p)^1.7` 单调衰减、全部在 `220ms` 前归零。**零掉落物**：`#vfx-canvas` 上除同心圆环与四角星芒外 MUST NOT 出现任何其他绘制物（`y` 方向持续增大的对象数 `= 0`）。**几何采集**：基准 MUST 取 `offsetWidth/offsetHeight`（不含 transform）——`.slot.has-tile` 的 `dock-seat` 入场缩放（`scale(.72)` 首帧）会把 `getBoundingClientRect()` 的槽宽从 `44` 缩到 `31.68`（实测），直接导致光环半径与磁吸位移缩水 `28%`。**并发**：`220ms` 窗口内第二次三消 MUST NOT 覆盖第一组（按槽位映射 + `gid`）；冻结窗与补位以最晚结束组为准，解除时 FLIP 补位 `140ms`（`120~160`）连续位移。**样式冻结**：`.slot` 的 `border`/`padding`/`background`/`border-radius` 计算值逐项不变，位移/闪白/坍缩只作用于 `.dock-chip`。**清屏守卫**：`tick` 尾部的 `vfxWasLive`（池「有→空」强制 `dirty = true`）MUST 保留。**纯表现层，MUST NOT 写回 session / 参与判定 / 持久化 / 进入 RulesEngine / Solver / Undo 快照** |

| **Pure-Card Collapse**（纯卡牌力学坍缩，Δ31） | **Δ31a** | `main.js` 编排（`dockGhost` / `groupEndAt` / `collapseTimers` / `data-collapse-role`）+ `css/style.css` 关键帧（`chip-rush` / `chip-impact` / `dock-hit`） | **四段时序**：`phaseRush = 70ms`（`0~70`）、`phaseImpact = 60ms`（`70~130`）、`phaseCollapse = 80ms`（`130~210`）、`phaseRefill = 200ms`（`210` 起，欠阻尼）；`COLLAPSE_TOTAL_MS = 210`、`COLLAPSE_SHUDDER_AT_MS = 130`、`DOCK_FREEZE_MS = 210`、`DOCK_FLIP_MS = 200`；**ghost 记录**：`{ slotIndex: { suit, gid, dx } }` + `groupEndAt{gid → ts}`（纯渲染态，不写回 `session`）；**形变参数**：`squashSx 0.90~0.95` / `squashSy 1.05~1.10`（`<= 25ms`）、`peakScale 1.30~1.35`（`115~130ms`）、`brightness 1.8~2.4×`、`whiteOverlay 0.55~0.80`、`patternContrast >= 20%`；**微震**：`dockShake 2.0px`（仅纵向）/ `1~2` 来回 / `<= 90ms`；**补位**：`ζ ≈ 0.7~0.85` / 过冲 `<= 6%` 槽宽 / 末段 `abs(Δx) <= 0.5px` | **零绘制红线（像素级）**：三消窗口内 `#vfx-canvas` 上 `alpha > 2` 的像素数 MUST `= 0`，且棋盘 canvas 与静态帧逐像素差异 `= 0`；`#dock` 内 MUST NOT 新增非 `.slot` / `.dock-chip` 节点。**约束**：MUST 只作用于 `.dock-chip` 的 `transform`/`filter`/`opacity`（`.slot` 的 `border`/`padding`/`background`/`border-radius` 冻结）；中心牌层级 MUST 设在 `.slot` 的 `z-index`（`dock-seat` 的 `transform` 会形成层叠上下文）；**MUST NOT** 保留任何绘制型特效实体（`collapseRings` / `ringPool` / `RING_*` / `RAY_*` / `particles` / `PARTICLE_LIFE` / `kind:match` 全部删除）。 |
| ~~**In-Place Diagonal Cascade**（原位对角波浪进场，Δ31b）~~ **（R5-2 废除：对角波前 + 缩放弹入整体下线，由 `Vertical Rain Drop` 取代）** | ~~Δ31b~~ | ~~`BoardRenderer` 表现态（`introAnim` / `introPlan`）~~ **已删除** | ~~`TILE 120` / `DIAG_STEP 14~48` / `Z_STEP 6~12` / `TARGET 415` / `sx0 0.55~0.70` / `dy0 10~14px` / `OVERSHOOT 1.05` / `PEAK_AT 0.72`~~ **全部不再存在** | **本实体整体废除**：`DIAG_STEP` / 缩放弹入曲线 / 峰值超调 / 12px 微落 / 半格 floor 归一 **全部随改造下线**（MUST NOT 以注释、死代码或 `if (false)` 开关形式保留）。验收职责由 **Vertical Rain Drop**（本表下一行）与 SC-018 接管 |
| **Vertical Rain Drop**（垂直雨幕下落 + 微弹定格，R5-2） | **R5-2（2026-10-30）** | `BoardRenderer` 表现态（`introAnim` / `introPlan`）+ `#vfx-canvas` 首排越界接缝（`drawIntroOutside()`） | `t0`（帧闸门后记录的起点，MUST 晚于「数据构建 + DOM 切换 + `INTRO_GATE_FRAMES = 2` 个已绘制 rAF 帧」，取自该帧 rAF 时间戳）、`armed`、`introGateFrames`；**常量组**（`STM.rendererTest.INTRO`，唯一参数源）：`TILE_MS = 200`、`IMPACT_AT = 0.78`、`FALL_CELL = 1.0`、`SQUASH_PX = 5`、`DAMP = 4`、`COL_STEP = 4`、`Z_STEP = 6`、`ROW_STEP_MIN = 16`、`ROW_STEP_MAX = 64`、`TARGET_MS = 400`、`ROW_SPAN_MIN = 150`、`COL_STEP_FLOOR = 3`、`Z_STEP_FLOOR = 4`；**逐牌记录**：`{ id → { delay, fallPx } }`，其中 `delay = r × ROW_STEP + c × COL_STEP + z × Z_STEP`、`fallPx = (rr === 0) ? 0.5·tileSide : min(FALL_CELL·cell, rr·cell + 0.5·tileSide)`；**姿态（纯函数 `introPoseOf(u, fallPx, tileSize)`）**：`u = clamp01((now − t0 − delay) / TILE_MS)`，下落段 `u < IMPACT_AT` 时 `dy = −fallPx·(1 − f(p))`（`p = u/IMPACT_AT`、`dx ≡ 0`、`sx = sy = 1`），挤压段 `dy = +sq(τ)/2`、`sy = 1 − sq(τ)/tileSize`、`sx = 1 + clamp(−0.015, 0.015, sq(τ)/(2·tileSize))`，`u ≥ 1` 返回 `null` 走静态路径 | **总时长**：`total = max(maxDelay + TILE_MS, introDealTotalMs(n, zMax))`，MUST 落 `380~420ms` 且**与牌数无关**（四档 `n/zMax = 5/0 · 6/1 · 7/2 · 8/4` 实测恒 `400.000ms`，极差 **0**）；`ROW_STEP = clamp(16, 64, (TARGET − TILE − (n−1)·COL − zMax·Z)/(n−1))`，若 `(n−1)·ROW_STEP < 150` 则先压 `COL → COL_STEP_FLOOR` / `Z → Z_STEP_FLOOR` 再反算（`n=8/zMax=4` 唯一触发，首末排差 `163ms`）。**缓动**：`f(p) = 6p² − 8p³ + 3p⁴`、`f'(p) = 12p(1−p)²`（速度峰 `p = 1/3`、峰值/平均 `1.778×`、末段 10% 位移 `0.37%`）；**挤压**：`sq(τ) = SQ·e^(−4τ)·cos(πτ)`，单半周期、`τ = 1` 强制归零、零二次弹跳、零 `back`/`elastic`。**约束**：`abs(dx) = 0`（硬断言）、角度恒 `0°`、`alpha` 恒 `1.0`、零缩放弹入（`sx/sy` 只在挤压段微动）、中心锚点（`drawTileBody` 的 `x = px - w/2` 由构造保证，MUST NOT 引入 `ctx.scale`）、`px`/`py` 全程浮点（MUST NOT `Math.round` / `Math.trunc` 一类整数截断）、底边恒贴地（`dy + tileSize·sy/2` 全程不变）。**越界接缝**：仅首排（`r = 0`）越界半格，由既有 `#vfx-canvas` even-odd 互补裁剪接续（**零新增 canvas**）；`vfxLive` 判据 MUST 并入 `introAnim.active`（否则首排残影永久冻结）。**MUST NOT** 保留 `INTRO_MODES` / `introSpecOf` / `introBudgetOf` / `pickIntroMode` / `dealModeLock*` / `INTRO_WAVE_*` / `wipe` / `DIAG_STEP` / `INTRO_S0` / `OVERSHOOT` / `PEAK_AT` / `DY0`。**纯表现层，MUST NOT 改卡牌花色/方向/坐标/层号，MUST NOT 持久化，MUST NOT 进入 RulesEngine / Solver / Undo 快照** |
| **Peak Warning Banner**（困难关预警横幅） | **Δ29a** | `src/data/peak-levels.js`（常量表）+ `main.js`（`#peak-banner` 表现态） | `PEAK_LEVELS[12]`、`isPeakLevel(id)`、`THEMES[6]`（`{id,name,ref,a,b,glow}`）、`SHOW_MS = 1400`、`DISMISS_MS = 80`、`FADE_MS = 260`、`TEXT(pct)`、`themeOf(id)`、`paintingIndexOf(id)`；运行态 `bannerShownForLevel` / `bannerTimer` / `bannerFadeTimer` / `bannerSplashTimer` / `bannerSplashTries` | 触发集合 = `[6,12,18,24,30,36,42,48,54,60,66,72]`（`L(12k+6)` ∪ `L(12k+12)`），其余 60 关（含 L3）零横幅；节点为 `#dock` 兄弟、`pointer-events:none`、矩形由 `#dock` 反算 → 与 `#board-wrap` **构造性零相交**；色相经 `--banner-hue-a/-b/--banner-glow` 一次性写入，主色相偏差 `<= 30°` 且 MUST NOT 落墨绿带；`XX%` 复用 `challengePercent(id)`（`12%~49%`）；`#splash-screen` 未移除时延后开播；点击捕获阶段旁观不消费；换关/重置/复活 MUST `resetPeakBanner()`。**纯表现层，MUST NOT 进入 RulesEngine / Solver / Undo 快照 / `levels.js`** |

**双连击口径注记（Δ22，MUST）**：**Combo Window**（5 秒滑动窗，驱动音效与飘字）与 **IQ Meter** 的 `M_combo` 乘区（受阻断连，驱动 IQ 结算）为**两套独立计数**，MUST NOT 互相覆盖或隐式同步；若需统一，MUST 先修订 FR-047 §2。

## 11. 关键不变量汇总（校验责任方）

| 不变量 | 校验方 |
|---|---|
| `tiles.length % 3 === 0 && ≥ 6`；花色计数各 %3==0 | `validateLevel`（运行时+Solver） |
| 单滑块单机制（`m` 互斥） | `validateLevel`（D-11） |
| 棱镜格与滑块不重叠；无对射循环 | `validateLevel` + Generator 拒绝 |
| `solutionMoves` 回放必胜 | Generator 正向自检 + Solver 门禁（D-10 双验） |
| 最优路径开放花色 ≤ 5 | Generator 约束 + Solver `openSuitsMax` 复验 |
| 钥匙解锁前自身可达 | Generator 逆操作保证（钥匙晚于锁链落位 = 逆序先飞）+ Solver 门禁兜底 |
| 每花色计数 %3==0 ⇒ 不存在「棋盘空但槽残留」终局 | 结构性保证（三消按 3 消耗；空棋盘时 dock+staging 总数 %3==0 且 <3 的花色计数为 0——Generator 构造即三消组逆推，无残组） |
| `id` 连续、进度钳制 ≤ LEVELS.length | `validateLevel` + Session 加载钳制（Δ4） |
