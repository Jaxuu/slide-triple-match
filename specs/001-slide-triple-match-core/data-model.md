# Data Model: Slide & Triple（滑块三消）

> ⚠️ **STALE**: spec.md was refined on 2026-10-21 (Δ16: 新增实体 Painting Progress / Prism Balance / Player Profile；Level 与 Solver Report 实体口径由 60 关改为 72 关；Eco Background 实体由 20 景重排为 6 幅画卷 × 12 关；Stage Suit Mapping 阶段边界重划为 L1~24 / L25~48 / L49~72；Spatial Dispersion Profile 末档延展至 L72)。Run `/speckit.refine.propagate` to update this document.

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

## 10. 关键不变量汇总（校验责任方）

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
