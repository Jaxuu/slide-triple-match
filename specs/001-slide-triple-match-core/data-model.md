# Data Model: Slide & Triple（滑块三消）

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

## 10. 增量实体（Δ16 / Δ19 / Δ21 / Δ22 / Δ27）

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
| **Audio Bank**（声学资产库） | **Δ22 / Δ23** | `src/audio/SoundManager.js` 运行时态 | 外部轨：`assets{}`（8 文件的 `idle/loading/ready/failed` 状态）、`pools{}`（每音效实例池）、`bgmVolume{lobby: 0.45, game: 0.38}`（Δ23 由 `0.26/0.20` 修订）、素材响度基线（loudnorm 后 BGM `−18` / 音效 `−14` / 语音 `−13` LUFS）、`fadeProgress`、`shatterRate`；合成轨：`audioCtx`、`masterGain`（压缩总线 `−12dB / 5:1`）、三类合成参数（落牌涟漪节流 `45ms` / 单声 `15~22ms`） | 受 FR-037 的 SFX/BGM 开关与页面可见性统一调度；静音时**已排定的延迟触发 MUST 一并取消**；BGM 缺失回退程序化合成；`document` 级常驻手势兜底 `kickBgm()` 幂等拉回播放态。**纯表现层，MUST NOT 持久化、MUST NOT 进 RulesEngine / Solver** |
| **Combo Window**（连击时间窗） | **Δ22** | `Session` 内纯表现态 | `comboCount`（初值 0）、`lastMatchAt`（`performance.now()` 时间戳）、`tier`（1/2/3/4/5+）、`pendingVoice`、`pendingFloat` | 每次三消：`now - lastMatchAt <= 5000` 则 `+1`，否则重置为 `1`；**无论续连与否刷新窗口**；MUST 用时间戳差值、**MUST NOT 用 rAF 帧计数**；受阻**不重置**（与 IQ 口径不同）。驱动 `sfx_shatter` 升调（1.00/1.06/1.12/1.18/1.25）、延迟 120ms 语音与飘字。**MUST NOT 持久化** |
| **Deal Choreography**（开局编舞） | **Δ22**（Δ27 修订） | `BoardRenderer` 表现态 + `main.js` 调度 | `modeId`（15 种之一）、`prevModeId`（相邻去重）、`offsets{}`（逐牌起飞向量/旋转/缩放初值）、`delayOf(tile)`、**`stepMs`（逐牌错峰步长，MUST `>= 12ms`）**、**`inFlightPeak`（单帧在途峰值，MUST `<= 22`）**、**`zLock`（同坐标层序锁：同 `(r,c)` 组内槽位按 `z` 升序重排）**、**`totalMs`（Δ27 修订：`180 + max(260, (N-1) × 12) + 260 + 55 × zMax`，原 `<= 1000ms` 固定上限作废）**、`fastForwarded`（点击快进标记） | `0~180ms` 卡牌 `alpha = 0` 仅风景底图；`180~totalMs` 依次落定并逐牌触发落牌涟漪音；绘制排序 MUST 复用静态比较器 `(a.z-b.z)\|\|(a.r-b.r)\|\|(a.c-b.c)`，同渲染坐标高层延迟恒 `+55ms*z`（层高补偿**只进排序键、不直接叠加 `delay`**，否则 `gcd(12,55)=1` 会把相邻落点挤到 `2ms`）；入场 `a0 >= 0.62`、进度 `35%` 内 alpha 达 `1.0`、缩放 `<= 1.15`、非等比较小轴 `>= 0.55`（`blinds_flip` 走遮罩揭示而非 `scaleX` 压缩）；点击 MUST 快进 100% 且正常响应。**MUST NOT 改卡牌花色/方向/坐标/层号，MUST NOT 持久化** |
| **Tile Flight**（卡牌飞行轨迹） | **Δ27** | `BoardRenderer` 表现态（`flights[]` + `tileInfo` 几何缓存）+ `main.js` 槽位配对（`pendingDock{}`） | `tileId`、`dir`（`U/L/R/D`，取自卡牌自身方向）、`from`（起点渲染实坐标，含奇数层半格偏移）、`to`（目标 `.slot[i]` 的**实时** `getBoundingClientRect()` 中心，窗口变化时重算）、`slotIndex`（由引擎 `dock` 事件给定，MUST NOT 由表现层推测）、`t0`/`dur`（`U` 单段 `<= 240ms`；`L/R/D` 两段：滑出 `<= 140ms` + 落入，总 `<= 320ms`）、`seg`（`board` 棋盘内段 / `offboard` 离场段，以「卡牌中心是否越出棋盘可视矩形」判定）、`ease`、`alpha0`（`>= 0.55`）、`scaleEnd`（`0.82`） | **绘制序铁律**：`seg === 'board'` MUST 与静止牌共用同一 `(z, r, c)` 升序比较器（飞行牌经 `tileInfo` 合成回 `renderList`，位移/缩放/alpha 由 `drawBoardTile` 内 `flightOf()` 施加，归位/离场即返回 `null` 走静态路径）；仅 `seg === 'offboard'` 才退出该序单独绘制，越界部分由既有 `#vfx-canvas` even-odd 互补裁剪接续（**零新增 canvas**）。揭示门控：`dock` 到达时目标槽保持 `.slot.empty`，落定回调**先出表再回调**并同帧切 `has-tile`（`<= 400ms` 兜底定时器）。MUST NOT 改动 `.slot` 的 DOM 与样式、MUST NOT 增删 `.slot` 的 class、MUST NOT 影响归拢顺序/命中判定/可解性、MUST NOT 持久化 |
| **Shard Atlas**（碎块图集） | **Δ27** | `BoardRenderer` 内 `ShardAtlas` 运行时态（`assets/icons/shards.jpg`） | `src`（权威路径 `assets/icons/shards.jpg`，MAY 兼容同名 `.png`）、`size`（`2048×2048`）、`grid`（`3×3`，格宽 `2048/3 ≈ 682.67`，允许小数边界）、`slices[9]`（键控后 `256×256` 正方形切片）、`bbox[9]`（可见包围盒）、`keyState`（`idle` / `ready` / `failed`）、`keyMs`（单次回读，MUST `<= 300ms` 且早于 `startDeal()`）、`kinds`（同帧命中种类，MUST `>= 6`） | 键控双阈值：`max(R,G,B) <= 24` → alpha `0`；`24~40` → alpha 线性渐变 + RGB 提亮消暗边；`> 40` → alpha `255`（`shards-audit` 实测近黑 < `2%`、键控 `114~124ms`）。发射：每次三消 `120~150` 枚、重力 `>= 2600 px/s²`、向下初速 `>= 300 px/s`、生命 `420~620ms`、角速度 `>= 4 rad/s`、单枚一次 `drawImage`（禁 `ctx.filter` / 逐枚 `clip`）。素材缺失或键控失败 MUST 降级 FR-049 §3 程序化 Low-Poly 兜底；**纯表现层，MUST NOT 进入 RulesEngine / Solver / Undo 快照** |

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
