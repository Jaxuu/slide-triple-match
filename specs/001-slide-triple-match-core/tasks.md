---
description: "Task list for feature implementation（四里程碑门禁式）"
---

# Tasks: Slide & Triple（滑块三消）— 完整 H5 游戏与 60 关递进关卡系统（Δ13 扩容后）

> **Propagated**: 2026-10-20 — Δ14（US5《万物出发！》）refine 传播：插入 Phase 5.5 / Milestone 3.5（T052a~T052f 表现层任务组）+ 门禁表/依赖图/故事映射同步；**已勾选的 Phase 1~Phase 5（T001~T052）任务零改动**，Phase 6（T053~T059）与 Phase 7 顺延保留在后。原 refine 指令的 Δ7~Δ10 编号与实现期变更记录冲突，编入 Δ14a~Δ14d（见 plan.md 传播注记）。

> **Propagated**: 2026-10-20 — Δ15（空间打散 + 贴图双兜底 + 箭头重做）refine 传播：插入 Phase 5.6 / Milestone 3.6（T052h~T052k 增量任务组——**原指令建议的 T052g~T052i 顺延为 T052h~T052k，因 T052g 已被 M3.5 检查点占用（5ea6c44 已交付）**）+ 门禁表/依赖图/故事映射/增量追溯表同步；宪章 III v2.0.0、SC-006 重定义、FR-029/FR-030/FR-011/FR-033 §6/FR-034 §3/FR-035 §3 口径同步；**已勾选任务零改动**（T052a~T052g 的流光胶囊/程序化表述保留原文——其产出将由 T052i/T052j/T052k 增量改造，不由本传播改写历史）。已知状态偏差记录：T052f 复选框未勾但实现已随 5ea6c44 交付（BGM 代码在库）——勾选状态由实现者复核后归位。

**Input**: Design documents from `/specs/001-slide-triple-match-core/`

**Prerequisites**: plan.md（「四阶段 + 表现层」里程碑策略 + Δ1~Δ6 架构增量 + Δ14a~Δ14d 表现层增量 + Δ15a~Δ15c 空间打散/贴图/箭头增量）、spec.md（US1~US5 + Edge Cases + FR-029/FR-030/FR-033/FR-034/FR-035 Δ15 增补条款）、research.md（D-01~D-15）、data-model.md（实体/不变量/状态机）、contracts/×4（rules-engine / level-data / game-session / level-pipeline）、quickstart.md（分里程碑验收场景 + 红线审计）、constitution.md（**v2.0.0——宪章 III 放开本地贴图 + 强制双兜底**）

**Tests**: 本项目采用零测试框架三层验证（D-14，勿引入 jest/vitest 等任何 npm 依赖）：① `node tools/solver.js` 全量可解性门禁（exit code 机判）② `node tools/solver.js --engine-selftest` 规则不变量断言 ③ quickstart.md 人工验收场景。此类验证任务**非可选**——它们是 FR-030/031/SC-001 的交付物，已按里程碑融入任务清单。

**Organization**: 任务按 **plan.md「四阶段 + 表现层」里程碑**（M1→M2→M3→M3.5→M3.6→M4）组织；用户故事标签映射进各里程碑：**M1=US1（核心循环）、M2=US3+US4 道具（机制/道具+规则冻结）、M3=US2（60 关量产——Δ13 扩容后，原 50 关基准批次）、M3.5=US5（万物出发表现层——45 图鉴/20 景背景/横幅/BGM，纯渲染与音频层）、M3.6=US2+US5 Δ15 增量（空间打散迁移 + 贴图双兜底 + 箭头重做）、M4=US4 面板（调试面板/Bot/扩容）**。里程碑间为**冻结门**关系：上一 Checkpoint 未全过，禁止开始下一阶段任务——尤其 M3 大批量量产严禁在 M1/M2 未验证前提前执行。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成任务依赖；**里程碑门禁优先于一切 [P]**）
- **[Story]**: 用户故事（US1/US2/US3/US4/US5；Setup/Foundational/Polish 阶段无标签）
- 任务描述内嵌契约关键数值，便于直接执行；与契约冲突时以 contracts/ 四文档为唯一真源

## Path Conventions（零构建静态 H5 + Node 离线工具）

- 前端运行时: `index.html`, `css/style.css`, `src/main.js`, `src/core/GameState.js`, `src/core/RulesEngine.js`, `src/render/BoardRenderer.js`, `src/render/bestiary.js`, `src/render/backdrops.js`, `src/audio/SoundManager.js`, `src/data/levels.js`
- 离线工具（Node ≥18 CommonJS，前端永不引用）: `tools/level-config.js`, `tools/generator.js`, `tools/solver.js`, `tools/expand-60.js`, `tools/redisperse-60.js`（Δ15 新增）, `tools/render-selftest.js`
- 生成工件（随仓库交付）: `src/data/levels.js`（M3 起整体再生成；M3.6 起头经 redisperse-60 一次性迁移后冻结）, `tools/solver-report.json`
- 可选增强资产（Δ15/宪章 III v2.0.0——**仓库不强制包含，空形态完整可玩**）: `assets/icons/{suit}.png`（0~44）, `assets/bg/bg{1..20}.jpg|.png|.webp`
- 仓库**不得出现** package.json / node_modules / 构建配置（宪章 II / level-pipeline.md §4）

## 架构增量 Δ1~Δ6 + Δ14a~Δ14d + Δ15a~Δ15c 落点追溯表

| 增量 | 口径摘要 | 落点任务 |
|---|---|---|
| Δ1 机制 A 仅齿轮滑块 | 十字相邻成功飞出触发原地顺时针 (d+1)%4；**地面转向垫载体取消** | T023, T034, T037, T046 |
| Δ2 机制 D 棱镜定型 | `/`、`\` 反射表；单次飞出至多 1 次折射；折射后受阻弹回；Generator 拒绝对射 | T026, T034, T046, T047 |
| Δ3 暂存区交互修正（**已被 Δ9 撤销**） | 原设计「道具移 Dock 前 k≤3 入暂存区+取消自动回填」——试玩发现点击暂存滑块触发复制分身 Bug 破坏花色守恒 + 视觉冗余 → **暂存区与「移出槽位」道具整体移除**（Δ9）；道具仅 Undo/Wrench；胜利=棋盘+Dock 全清空 | T030, T032, T035, T038 |
| Δ4 LEVELS.length 动态化 | 深链/进度钳制/自动进关/跳关下拉/终局判定全部动态读取，扩容零前端改动 | T020, T050, T051, T054, T059 |
| Δ5 参数表驱动生成 | `CHAPTERS` 可扩展数组，追加条目即新增章节 | T040, T059 |
| Δ6 solutionMoves 预计算 | Solver 最优解内嵌 levels.js，Hint/Bot 零延迟回放 | T049, T055, T056 |
| Δ14a 45 种图鉴池与三阶段抽样 | 渲染层阶段映射表（按 level.id 区间 L1~21/22~42/43~60，**严禁读 level.chapter**）+ 确定性抽样；levels.js suit 字段/花色数 K 零改写 | T052a, T052c |
| Δ14b 3D 奶油白底座 + 边缘流光角标 + Sprite 缓存 | 移除圆圈指示器与面部箭头圆圈；朝向侧边缘流光胶囊角标（**Δ15c 取代：锐利三角箭头——T052i 改造**）；45 图案离屏 Sprite 预渲染 | T052b |
| Δ14c 20 景生态背景池 | cycleIndex=floor((id-1)/3) 严格绑定，同循环 3 关共享；棋盘蒙版保可读性（**Δ15b：程序化绘制降格为兜底——T052j 改造**） | T052d |
| Δ14d 治愈系 BGM + 困难关横幅 | 五声音阶循环合成器 + 开关/可见性联动；挑战位集合 L3 ∪ (id-4)%3==2 共 20 关 1.6s 绿金横幅 | T052e, T052f |
| Δ15a 同花色空间打散三档曲线 + 存量重打散迁移 | 三档聚散度曲线（L1~L6 / L7~L21 / L22~L60 三连簇归零）；Generator 花色分配打散 + Solver 聚散度指标 + redisperse-60 一次性迁移（FR-008 Δ13 铁律受控例外 + FR-031 全量重验） | T052h, T052k |
| Δ15b 外部贴图优先 + Emoji/程序化强制双兜底（宪章 III v2.0.0） | `assets/icons/{suit}.png` → Emoji 直渲染兜底（严禁 ctx.arc 手绘圆球）；`assets/bg/bg{N}` → Canvas 风景兜底；`Image` 相对路径、逐条目/逐景独立判定、空 assets 完整可玩 | T052i, T052j |
| Δ15c 方向角标重做（单枚锐利宽翼三角） | 废止流光胶囊「猪鼻子」造型；朝向边缘内侧正中单枚实心宽体三角 + 白描边；方向语义零变化 | T052i |

## 里程碑门禁总览（执行纪律）

| 门 | 位置 | 核心判据 | 未过禁止 |
|---|---|---|---|
| M1 验收门 | T022 | US1-AC1~AC5 + quickstart Q1.1~Q1.7 + file:// 零控制台报错 | 开始 M2 |
| **M2 冻结门（FREEZE）** | T039 | US3-AC1~7、US4-AC1~3 + Edge Cases 复现 + `--engine-selftest` 全绿 | **开始 M3 量产（严禁提前生成大批量关卡）** |
| M3 量产门 | T052 | SC-001 60/60（Δ13 扩容后）+ SC-004 曲线门 + US2-AC1~AC5 | 开始 M3.5 |
| M3.5 表现层门 | T052g 验收 | SC-007/SC-008 + US5-AC1~AC8 + render-selftest Δ14 断言全绿 + engine-selftest 回归零漂移 + levels.js git diff 为空（M3.5 时点） | 开始 M3.6 |
| M3.6 Δ15 门 | T052k 验收 | FR-029 三档曲线 60/60 聚散度达标 + FR-031 全量重验报告更新 + SC-006 重定义（空/满 assets 双兜底双形态）+ US2-AC6 + US5-AC4/AC5 复扫 + render-selftest Δ15 断言全绿 + engine-selftest 零漂移 | 开始 M4 |
| M4 交付门 | T058 + T062/T063 | SC-002/003/006/007/008 + 宪章红线零违规 | 交付 |

---

## Phase 1: Setup（脚手架与规范同步）

**Purpose**: 项目骨架 + 文档口径对齐

- [x] T001 Create project structure per implementation plan: 空文件占位 `index.html`, `css/style.css`, `src/main.js`, `src/core/GameState.js`, `src/core/RulesEngine.js`, `src/render/BoardRenderer.js`, `src/audio/SoundManager.js`, `src/data/levels.js`, `tools/level-config.js`, `tools/generator.js`, `tools/solver.js`（仓库不含 package.json/node_modules——宪章 II）
- [x] T002 Build index.html view skeleton per contracts/game-session.md §3: `#app`(9:16) 内 `#hud` / `#board-wrap > #board`(canvas) / `#staging`(3 格，Dock 上方) / `#dock`(7 格) / `#items`(3 键道具栏) / `#debug-panel` / `#result-overlay`；固定 classic `<script defer>` 加载序：`src/data/levels.js → src/core/RulesEngine.js → src/core/GameState.js → src/render/BoardRenderer.js → src/audio/SoundManager.js → src/main.js`；禁止 `type="module"`、动态 import()、fetch 加载代码/数据（D-01）
- [x] T003 [P] Implement 9:16 responsive shell in css/style.css (D-13): `#app` aspect-ratio 9/16；`<720px` 手机 100vw/100dvh（不支持 dvh 回退 100vh）；`≥1024px` 居中 + 右侧 320px 面板位；比例约 棋盘 62% / Dock+Staging+道具栏 28% / HUD 10%；`clamp()` 字号；HUD/Dock/Staging/道具栏/结算浮层/移动抽屉基础样式
- [x] T004 Sync spec.md wording to Δ increments in specs/001-slide-triple-match-core/spec.md: FR-014（转向垫载体取消，机制 A 仅齿轮滑块）、FR-024-3（暂存区取消自动回填，改点击自由牌）、FR-006（胜利条件扩展：棋盘+暂存区+收集槽全清空）、FR-026 保留——消除 spec/plan/契约间文档歧义（plan.md「建议」节）

---

## Phase 2: Foundational（STM 命名空间与双导出地基）

**Purpose**: 阻塞全部里程碑的共享前置——命名空间、UMD 双导出、数据 schema 活样例

**⚠️ CRITICAL**: 未完成前任何里程碑任务不可开始

- [x] T005 Implement levels.js UMD dual-export scaffold + 1 个 schema 完整占位 Level in src/data/levels.js: UMD 头（浏览器挂 `STM.LEVELS`、Node `module.exports`，level-data.md 格式选型模板）；占位关 = 4×4 / 2 花色 / 6 滑块（%3==0）/ cfg 默认值（lives:3, damageOnBlock:false, items{1,1,1}, iceMode:'triple', chains:[]）/ metrics 手工估值 / solutionMoves 手工解——作为 schema 活样例
- [x] T006 [P] Implement RulesEngine UMD scaffold + 坐标/方向/棱镜常量 in src/core/RulesEngine.js: UMD 双导出（D-02）；坐标 (r,c) row 0=顶部；方向数字 0=U,1=R,2=D,3=L（**顺时针序**，「转 90°」≡ `(d+1)%4`，D-12）；棱镜反射全枚举映射表（`/`:U→R,R→U,D→L,L→D；`\`:U→L,L→U,D→R,R→D）；API 占位导出 init/canTap/applyTap/applyItem/stageTile/terminal/deadlockSuspect/enumerateTaps/validateLevel/renderProbe/snapshot/restore；**纯函数、零 DOM/音频/存储依赖**（Node 可 require 是硬约束）
- [x] T007 [P] Implement STM mount stubs in src/core/GameState.js（`STM.GameState.createSession` 占位）、src/render/BoardRenderer.js（`STM.createBoardRenderer` 占位）、src/audio/SoundManager.js（`STM.createSoundManager` 占位）、src/main.js（DOMContentLoaded 入口占位）——共享单全局命名空间 `window.STM`

**Checkpoint**: 双击 index.html（file:// 协议）控制台零报错零跨域警告（D-01 验收核心）；`window.STM` 各挂载点就绪

---

## Phase 3: Milestone 1 — 核心循环 MVP（User Story 1，Priority: P1）🎯 MVP

**Goal**: 可玩的基础滑块三消、交互手感定型（plan.md M1 全部条目 + Δ4 架构埋点）

**Independent Test**: 烟雾关完整通关一次——点击滑块 → 观察飞出/受阻弹回 → 槽内归拢与三消 → 爆槽判负或清空棋盘判胜

### RulesEngine 核心规则（无机制版）for US1

- [x] T008 [US1] Implement `init` / `canTap` / `enumerateTaps` in src/core/RulesEngine.js: init(level)→EngineState（N×N board、tiles 深拷贝+id=TileSpec 索引、dock/staging 空、cfg/lives 应用）；canTap 谓词=滑块在棋盘/暂存区 且机制状态可点（机制谓词留 M2 扩展点；**射线畅通性不属于 canTap**——受阻滑块仍可点击，点击后弹回）；enumerateTaps 枚举可行 tap 目标 id
- [x] T009 [US1] Implement applyTap 射线行走与 blocked/fly-out 分支 in src/core/RulesEngine.js: Step1 从 (r,c) 沿 d 逐格行走到棋盘边缘，首个被占格=阻挡点；Blocked 分支→前冲动画数据（path/blockedAt）+ damage=cfg.damageOnBlock?1:0（生命扣减由 GameState 记账）；无阻挡→Fly-out（滑块移出棋盘）；TapResult 结构 per rules-engine.md §5（type/tileId/path/events，事件顺序=发生顺序）
- [x] T010 [US1] Implement Dock 归拢插入与三消结算 in src/core/RulesEngine.js: 飞入滑块插入位置=已有同花色紧邻（无同花色→dock 末尾空位，FR-004）；插入后该花色计数==3→三消结算循环（可多组同时、循环至无）→ 腾出 3 槽位 + 'match'/'remove' 事件（FR-005）；**dock 满 7 时飞入先结算三消再判负**（Edge Case「三消优先于爆槽」，rules-engine.md §3.4）
- [x] T011 [US1] Implement terminal() 基础版 in src/core/RulesEngine.js: won=棋盘滑块==0 且 dock==0（M2 将扩展 staging，Δ3）；lost_burst=dock.length==7 且无任何花色计数==3（结算后态）；lost_lives=lives≤0；deadlockSuspect 占位返回 false（M2 实现保守谓词）
- [x] T012 [US1] Implement snapshot/restore 深拷贝对 in src/core/RulesEngine.js: structuredClone{board 滑块态, dock, staging, items, combo, score, lives}（**运行时 dock 保序**——D-07 规范化仅限 Solver 哈希）；棱镜与 TileSpec 静态部分不入快照（不可变）——Undo 与 Solver 回溯共用（rules-engine.md §8）
- [x] T013 [US1] Implement validateLevel 基础校验 + renderProbe in src/core/RulesEngine.js: `LEVELS[i].id===i+1` 连续、tiles.length%3===0 且 ≥6、无 (r,c) 重复、4≤n≤8、每花色计数%3===0、solutionMoves 引用合法 tile id；renderProbe 输出 Renderer 渲染快照（§8 轻量视图，仅浏览器构建含）

### GameState / Renderer / Audio / 数据 / 集成 for US1

- [x] T014 [US1] Implement createSession 状态机 in src/core/GameState.js: LOADING→READY⇄ANIMATING→SETTLING→READY / WON|LOST_BURST|LOST_LIVES|LOST_DEADLOCK（data-model.md §7 状态机）；输入锁（ANIMATING/SETTLING 期间 tap 忽略+短提示音）；级联动画时长上限 1.2s 超时强制结算解锁；session.reset()；onEvent/onTerminal 回调契约（game-session.md §2）；**不实现任何规则**（纯编排层）
- [x] T015 [US1] Implement tap() 编排/记账/快照栈 in src/core/GameState.js: 调 RulesEngine.applyTap；每原子回合前 snapshot 入栈（Undo 基础设施）；计分=match×(comboBase+combo×comboStep)、连击窗口=连续三消间隔 <1.5s；blocked damage 写回 EngineState lives；state() 只读视图 {phase,score,combo,lives,items,dock,staging,board}；onRail()（自加载以来动作序列==solutionMoves 前缀——M4 Hint/Bot 基准）
- [x] T016 [P] [US1] Implement BoardRenderer 基础设施与 8 花色表 in src/render/BoardRenderer.js: rAF 脏检查主循环；canvas 尺寸=clientWidth×devicePixelRatio（8×8 时格宽 ≥40 CSS px）；花色固定表（颜色+图形双编码，色盲可辨）: 0 赤#E5484D▲ / 1 橙#F76B15◆ / 2 金#FFC53D★ / 3 草绿#46A758■ / 4 青#00B8D9● / 5 天蓝#3E63DD▼ / 6 紫#8E4EC6⬡ / 7 品红#D6409F✚；暗底 #1B2430 / 格线 #2A3644；每色明度差 ≥2:1 于底色（game-session.md §4 固定契约）
- [x] T017 [US1] Implement 棋盘绘制与核心动效 in src/render/BoardRenderer.js: 格线/滑块/白色箭头（指 d 方向）；飞出=沿 path 位移+缩放淡出；受阻=前冲-回弹+棋盘 CSS shake；三消=3 chip 聚合爆闪+Canvas 粒子（花色色粒子 12~20 个/次、单帧 ≤200）；订阅 session 事件驱动重绘
- [x] T018 [P] [US1] Implement SoundManager 核心音效 in src/audio/SoundManager.js: 首次 pointerdown 惰性创建 AudioContext+resume（autoplay 政策）；Web Audio 纯合成（振荡器正弦/方波/三角扫频+白噪声 buffer+DynamicsCompressor）；M1 音色: click(880Hz 短方波)/flyout(上行扫频)/blocked(120Hz 三角+噪声冲击)/match(三音上行琶音、连击数调制音高)/victory/defeat；setMuted(bool)
- [x] T019 [P] [US1] Author 3~5 手工烟雾测试关 in src/data/levels.js: schema 与最终契约完全一致（level-data.md §2 全字段含 name/chapter/theme）；4×4 起步、覆盖不同花色数；每关内嵌手工求解的 solutionMoves（回放必胜）；含 1 关花色数 ≥4（可演示 7 格爆槽——每花色未成三最多滞留 2 个，≥4 花色才可能填满 7 格）+ 全部 damageOnBlock:false（第 1 章受阻不扣命）；完成后以 validateLevel 自检（依赖 T013）
- [x] T020 [US1] Implement boot 流程与 LEVELS.length 动态化 in src/main.js: DOMContentLoaded→读 STM.LEVELS / `?level=N` 深链（1≤N≤LEVELS.length 钳制）→ createSession(LEVELS[N-1]) → 挂 Renderer/Sound；**一切关卡总数引用动态取 LEVELS.length（Δ4 架构埋点，禁止硬编码 50）**
- [x] T021 [US1] Implement HUD/Dock DOM 视图与结算浮层 in src/main.js: HUD 数值绑定（关卡名/编号、生命 ♥×3 DOM、连击/分数）；Dock 7 格 chip 渲染（同花色归拢视觉，DOM+内联 SVG）；结算浮层: won→「下一关」（id+1>LEVELS.length→终局占位提示）/「重玩」、lost→「重玩」（lives 重置）；输入统一 pointerdown/pointerup（**禁 touchstart/mousedown——宪章 IV 红线**）
- [x] T022 [US1] **Checkpoint M1（验收门）**: 逐条执行 quickstart Q1.1~Q1.7（射线畅通飞出/受阻弹回/三消/胜利结算/爆槽判负/首点 30s 内有效飞出 SC-005 路径/8 花色灰度模式下仅凭图形可辨）；US1-AC1~AC5 全过；烟雾关完整通关；file:// 双击零控制台报错；受阻不扣命。**未全过不得进入 M2**

---

## Phase 3.5: Milestone 1.5 — 核心可玩性与视觉升级（M1 试玩反馈驱动，Δ7 多层堆叠）

**Purpose**: 单层棋盘可玩性低且空旷——引入多层堆叠 + 商业化视觉质感 + 高密度强阻挡关卡

**验证**: Node 全量回放门禁（validateLevel + solutionMoves 逐关 replay 必胜 + Δ7 堆叠语义断言），exit code 机判

- [x] T-M15.1 [US1] RulesEngine 多层堆叠语义（Δ7）in src/core/RulesEngine.js: TileSpec 可选字段 z:0|1|2；board[r][c] = 栈数组（底→顶）；canTap 仅栈顶可点（isTopOfStack）；removeFromBoard 弹栈 + reveal 事件（{e:'reveal',id,r,c,z}）；栈非空即阻挡射线（castRay 格占据判定不变——栈数组真值即占格）；snapshot/restore/rebuildBoard 按 z 升序重建栈；validateLevel 校验「同格同层不重复」「堆叠深度 ≤3」；renderProbe 输出 z + stackDepth
- [x] T-M15.2 [US1] GameState/renderer 集成 Δ7 in src/core/GameState.js + src/render/BoardRenderer.js: GameState 事件流透传 reveal（events 数组原样 emit）；Renderer handleEvent 处理 reveal → revealAt 表驱动上浮动画（REVEAL_MS 380 + 延迟让位）；hitTest 仅命中该格最高 z 滑块
- [x] T-M15.3 [US1] BoardRenderer 立体奶油牌面视觉升级 in src/render/BoardRenderer.js: 牌面 #FFFDF9 渐变 + 暖棕厚度底座（堆叠越深越厚）+ 花色描边高光；8 种水果/麻将花色（草莓/甜橙/菠萝/奇异果/蓝莓/葡萄/蜜桃心/翡翠竹——贝塞尔+径向渐变+高光点，每个 ≤15 行 Canvas API）；胶囊形方向箭头徽章（花色 deep 色 + 白色人字）；堆叠错层偏移 + 左上角层角标 + 点阵格线；chipSVG 水果简化图形
- [x] T-M15.4 [US1] 重制 M1.5 高密度测试关 in src/data/levels.js: 5 关全部 5×5~6×6、填充率 72~83%（21/24/30/33/33 滑块）、中心多层堆叠（1~4 格双层 + L5 塔芯）；链式剥洋葱拓扑——初始被阻挡/不可直飞滑块占比 90~94%（远超 70% 门禁）；全部 validateLevel 通过 + solutionMoves Node 回放必胜（terminal=won）；全部 damageOnBlock:false
- [x] T-M15.5 契约同步: rules-engine.md（Δ7 堆叠语义 §0/§2/§5 reveal 事件）、level-data.md（z 枚举字面量 + schema 示例）、game-session.md（M1.5 花色表/滑块视觉契约）已更新；Node 验收脚本全绿（L1~L5 validate+replay+堆叠断言 PASS，exit 0）

### M1.6 根基修复（用户试玩验收反馈：Bug 1 死局渲染缺陷 + 底层满铺铁律 + 100% 回放自检）

**Purpose**: 用户试玩 M1.5 版本发现 3 个根基问题——①第一关剩 2 个绿块无法消除（根因=BoardRenderer reveal 动画缺陷致下层滑块隐形）；②棋盘底层出现空洞格；③关卡数据需 100% 机判回放必胜（严禁脑算手写）

**验证**: Node 机判三层——validateLevel（含新增 z=0 满铺硬校验）+ solutionMoves 逐关回放 won/零残留 + 解析不变量（pre[i]⊆{j<i}）与 2000 局对抗性随机模拟零死锁 + GameState 会话层 e2e 全管线 PASS

- [x] T-M16.1 BoardRenderer 渲染缺陷修复（Bug 1 真因）in src/render/BoardRenderer.js: ①draw() animSet 不再跳过 reveal 目标滑块（原 animSet 跳过+动画层 continue → 下层滑块 560ms 隐形且动画结束无末帧重绘 → 永久隐形=「剩 2 块绿滑块找不到」）；②tick() 动画到期置 dirty 强制末帧重绘；③tileById 增加 tileInfo 视觉缓存（removed 滑块动画仍可绘制——修复飞出/三消动画从未绘制缺陷）；④blockSet 仅弹回滑块跳过静态层（防双绘重影）；⑤reveal 延迟期下沉待命位（消除静止→跳落突跳）
- [x] T-M16.2 RulesEngine.validateLevel 底层满铺硬校验（根基规范 2）in src/core/RulesEngine.js: N×N 每格 (r,c)（除棱镜格）底层 z=0 必须 100% 铺满——空置黑洞格报错「底层 z=0 未满铺: 空洞格 (r,c)」；后续 M3 生成器沿用同一铁律
- [x] T-M16.3 关卡数据 M1.6 根基重制 in src/data/levels.js: 5 关改为满铺剥洋葱确定性构造（外圈→内圈逐环剥离；堆叠格 z 顶→底入序；方向=最近边——射线只穿更外环已清空格）：L1/L2 5×5=30 滑块（底 25+叠 5 / 底 25+塔 2+叠 3）、L3 6×6=42（底 36+叠 6）、L4 6×6=45（底 36+塔 6+叠 3）、L5 6×6=48（底 36+塔 8+叠 4）；每花色计数恒 %3===0（L1-L3/L5 花色×6、L4 花色×9）
- [x] T-M16.4 100% 回放自检（根基规范 3）: 独立 Node 机判——L1~L5 validateLevel 全过（含 z=0 满铺断言 25/25、36/36）+ solutionMoves 回放 terminal=won、棋盘残留 0、Dock 残留 0、全程 flyout 零受阻 + 解析不变量 pre[i]⊆{j<i}（任意玩法零卡死证明）+ 每关 2000 局对抗性随机模拟 stuck=0 + GameState 会话层 e2e（完整 tap 管线/动画锁/三消计数）ALL PASS

### M1.7 Δ8 分层立体阻挡（Layer-Aware Raycasting）——用户规则设计修正

**Purpose**: 多层堆叠的射线阻挡按层高 z 分层计算——高层滑块直接从低层滑块头顶凌空飞越（否则多层堆叠失去立体空间意义）；视觉上飞行动画保持层高 + 投影（「二楼牌从一楼牌头顶飞出」）

**验证**: `node tools/solver.js --engine-selftest`（含 Δ8 分层阻挡断言组）全绿 + 5 关回放必胜 + 解析零死锁证明 + 会话 e2e

- [x] T-M17.1 RulesEngine Δ8 分层射线 in src/core/RulesEngine.js: `castRay`/`buildPath` 增层高参数——前方格栈顶 `z_target < z_self`（含空格）凌空飞越不阻挡、`z_target >= z_self` 同层/高层阻挡、棱镜全层高柱体恒阻挡；`applyTap`/`tapPrism` 调用点与折射续走全部层高感知；validateLevel 新增「塔式堆叠层号连续（z=2 须有 z=1 垫底，禁悬空层）」校验
- [x] T-M17.2 BoardRenderer 凌空飞越视觉 in src/render/BoardRenderer.js: fly 动画 z>=1 保持层高——上移偏移（0.22×z cell）+ 起飞放大渐收（近镜头感）+ 地面椭圆暗影投影（随高度虚化）；block 弹回动画同带层高偏移
- [x] T-M17.3 关卡立体牌阵重制 in src/data/levels.js: 满铺 z0 底盘（剥洋葱序）+ 中央 z1/z2 塔阵——对射塔对（同层互挡，先解挡路者）+ 凌空塔（z1 顶朝最近边从底盘头顶飞越）+ z2 圣殿塔（z2 顶飞出揭示 z1 垫层再揭示 z0 基）；塔顶移除序按「同层射线依赖」拓扑排序（确定性：依赖满足者字典序最小优先）；flyOvers 实测 1/3/2/3/1（凌空飞越真实发生）；回放 reveal 5/5/6/9/12
- [x] T-M17.4 T038 自测骨架（部分实现，M2 补机制断言）in tools/solver.js: `--engine-selftest` 实装 6 组断言——转向加法全 4 向、棱镜 8 映射、Δ8 分层立体阻挡（z1 凌空 z0 行/z1 同层互挡/z0 经典阻挡保留/z2 飞 z1 塔+reveal 级联/棱镜全层高）、三消优先于爆槽、Δ3 胜利条件（staging 残留非胜）、快照/restore 等价；gear/ice/chains 断言组留 M2（T038 完成时补齐）
- [x] T-M17.5 契约同步: rules-engine.md（§0 Δ8 分层阻挡五条 + §3.1 层高口径）、level-data.md（z 字段行）、game-session.md（Δ8 凌空飞越渲染契约）；Δ8 零死锁验证——解析 pre[i]⊆{j<i} 层高感知口径成立 + 每关 2000 局对抗模拟 stuck=0 + 会话 e2e 5/5 PASS

---

## Phase 4: Milestone 2 — 四大机制与道具 + 规则冻结（User Story 3 + US4 道具，P2/P3）

⚠️ **GATE**: 依赖 T022（M1 验收门）通过。目标：完整规则语义落地、全部 Edge Cases 验证、**冻结 RulesEngine**。

**Goal**: 齿轮/冰封/锁链/棱镜四机制（Δ1/Δ2）+ 三道具与暂存区（Δ3）语义落地

**Independent Test**: 单机制测试关（L6+/L16+/L26+/L36+ 档位语义）逐个验证触发、反馈与机制交互；任意关逐个道具验证效果与次数限制

### RulesEngine 机制扩展 for US3/US4

- [x] T023 [US3] Implement 齿轮滑块（Δ1/FR-013）in src/core/RulesEngine.js: applyTap Step4a——飞出结算后对每个齿轮滑块 g，若被移除滑块 t 与 g 十字相邻（|Δr|+|Δc|==1）→ g.d=(g.d+1)%4 + {e:'gear',id,from,to}；对角滑块飞出**不**触发；**不实现地面转向垫（Δ1：机制 A 仅保留 Gear Tile）**；转向结果 UI 即时可见（事件驱动渲染）
- [x] T024 [US3] Implement 冰封滑块（FR-015/016 引擎部分）in src/core/RulesEngine.js: canTap 拒绝 ice>0（即使前方畅通）；冰封滑块照常阻挡射线（Step1 被占格判定）；Step4d 破冰联动按 cfg.iceMode——'triple'（主口径）: 每次三消全场所有 ice>0 各减 1、归 0 清冰封标记；'adjacent'（变体）: 仅与本次飞出滑块 t 十字相邻的冰封滑块 ice--；TileSpec 冰厚 x≥1（关卡可配更厚）；{e:'ice',id,from,to}
- [x] T025 [US3] Implement 钥匙与锁链（FR-018/019）in src/core/RulesEngine.js: locked 滑块固定原地不可 tap 且阻挡射线；applyTap Step4b——t 为钥匙（m=='k'）时对 cfg.chains 中每个含 t 的配对移除该钥；某锁的**任一**配对钥集全飞出 → 该锁 unlocked 解锁（或语义，一钥多锁/多钥配一锁均支持）；{e:'unlock',id,by}；chains 边表格式 [[keyTileId,[lockedTileId,...]],...]
- [x] T026 [US3] Implement 变向棱镜（Δ2/FR-021/022）in src/core/RulesEngine.js: applyTap Step1b/Step3——射线遇棱镜格: 新方向=反射表[prism.t][dir]，从棱镜格沿新方向续走；新射线畅通→prism-flyout（path 含折射折点，渲染折线动画）；新射线受阻挡（**含第二个棱镜**）→弹回原位（**单次飞出至多 1 次折射**，FR-022）；棱镜格阻挡「不折射的直行」（固定、不可移走、非滑块）
- [x] T027 [US3] Implement 原子级联管线整合 in src/core/RulesEngine.js: Step4 派生事件顺序固定 4a 齿轮→4b 钥匙→4c 入槽→4d 三消循环（三消→破冰联动，三消不产生新飞出）；**同一次 applyTap 返回前级联全部结算完毕**（Edge Case「同一点击内连环触发」的确定性解）；原子性契约=调用方以 applyTap 返回为「一回合」边界
- [x] T028 [US3] Implement deadlockSuspect 保守谓词（D-09/FR-006）in src/core/RulesEngine.js: 疑死锁当且仅当——enumerateTaps 试算无「飞出型 tap」（flyout/prism-flyout，纯谓词试算不产渲染事件）且无道具可用（wrench 可用即非疑——扳手可解互锁；stage 可用且 staging 未满同理）且非「ice>0 且 dock 内存在某花色计数 ≥2」（三消可解冻）且非「存在 locked 且场上存在钥匙」（可解锁）；**仅给谓词，复证搜索由调用方执行**（rules-engine.md §7.4）
- [x] T029 [US3] Extend validateLevel 机制不变量 in src/core/RulesEngine.js: 机制标记 m 单选互斥（D-11: 'g' XOR 'i' XOR 'c' XOR 'k'）；ice 滑块 x≥1；prisms 与 tiles 不重叠、无对射循环布局（FR-022）；cfg.chains 键指向 m=='k' 滑块、锁指向 m=='c' 滑块、无自环无空配对；iceMode∈{'triple','adjacent'}；校验失败→控制台错误+跳过该关（不静默）
- [x] T030 [US4] Implement 道具引擎语义（Δ3/FR-024/026）in src/core/RulesEngine.js: applyItem(state,'wrench',tileId)→(d+1)%4，**仅普通与齿轮滑块可用**（冰封/锁链返回 invalid，FR-024-2）；applyItem(state,'stage')→dock 内前 k 个滑块（k=min(3,staging 余量)）移入 staging、staging 满 3 时 invalid（FR-026）、**无自动回填（Δ3 取消）**、滑块保留 id/花色；stageTile(state,tileId)→staging 滑块点击飞入 dock 尾（无射线判定，「无阻挡自由牌」）；canTap 扩展：staging 内滑块恒可 tap；terminal won 扩展=棋盘==0 **且 staging.length==0 且 dock.length==0（Δ3 胜利条件）**

### GameState 道具编排 for US4 / 死局调度 for US3

- [x] T031 [US4] Implement useItem 编排与 Undo 级联回滚 in src/core/GameState.js: session.useItem('undo'|'wrench'|'stage', tileId?)；道具次数递减（cfg.items 拷贝，余量 0 禁用）；undo=弹快照栈 RulesEngine.restore + 发全量重绘事件（快照取于原子回合前→**一次回滚整条级联链**，含旋转/破冰/解锁/三消派生，FR-024-1）；扳手进入目标选择交互态
- [x] T032 [US4] Implement tapStaged 与暂存区状态 in src/core/GameState.js: session.tapStaged(tileId)（Δ3 回填 tap）；state() 视图扩展 {staging, items 余量}；暂存区满（3）时 stage 道具不可用判定（FR-026）；暂存区滑块数与内容 UI 可见
- [x] T033 [US3] Implement 死锁复证搜索器与终局调度 in src/main.js + src/core/GameState.js: 有界 DFS 搜索器（动作集=enumerateTaps ∪ tapStaged ∪ 可用道具动作——**与 Solver 动作集同构**；M2 先取保守预算，M4 按 level-pipeline.md §5 校准至 100k 节点/300ms）；GameState 疑死锁信号→触发复证，复证失败才 onTerminal({kind:'lost_deadlock'})——**防误杀**（Edge Case「互锁死局检测误报」，D-09）

### 渲染/音效/测试数据 for M2（可与引擎链并行）

- [x] T034 [P] [US3] Implement 机关视觉与机制动效 in src/render/BoardRenderer.js: 齿轮角标（滑块右上小齿轮图形+底色描边）；冰封=半透明冰蓝覆盖+冰层厚度数字/裂纹层数（FR-017）；锁链=格四角链条角标；钥匙=左上钥匙角标+（hover/选中时）链路提示线连向配对锁（FR-020）；棱镜=格内粗斜杠条（/ 或 \）+边框高亮（与滑块/普通障碍显著区分，FR-023）；动效: 齿轮 90° 旋转过渡（UI 即时可见）、破冰碎裂粒子（白蓝）、棱镜折线路径动画
- [x] T035 [P] [US4] Implement 暂存区 UI 与道具栏 in src/main.js + css/style.css: #staging 3 格（Dock 上方）——暂存滑块可 pointerdown 点击→飞入 Dock（无自动回填的交互补偿）；#items 3 键道具栏（次数角标、不可用禁用态、暂存满 3 时 stage 禁用）；Undo/扳手/暂存三道具交互流（扳手目标选择模式、取消路径）
- [x] T036 [P] [US3] Implement 机制与道具音效 in src/audio/SoundManager.js: gear/unlock/iceBreak/prism（各自固定扫频签名）+ item/undo（下行）；事件→音效映射经 GameState onEvent 转发（game-session.md §5 全表：click/flyout/blocked/match/gear/unlock/iceBreak/prism/undo/item/victory/defeat/botTick 预留）
- [x] T037 [P] [US3] Author 机制专项测试关 in src/data/levels.js: 每机制 ≥1 关（齿轮/冰封/锁链/棱镜各 ≥1）+ 级联关（飞出→齿轮转向→新路径解锁）+ 边界关: 三消优先爆槽（7 满飞入第三同花色）、破冰双口径（triple 与 adjacent 各 1 关）、一钥多锁全链解锁、折射后仍阻挡→弹回（单次折射上限）、冰封作纯阻挡、暂存满道具不可用、扣命关（damageOnBlock:true+lives 低位演示 lost_lives）——**覆盖 spec Edge Cases 清单逐条可复现**；均过 validateLevel
  * ✅ 承接口径（M3 后）: levels.js 已被流水线整体替换（T049/FR-031 禁止手改），Edge Cases 逐条可复现职责由 T038 引擎自测断言集（--engine-selftest 11/11 全绿，内嵌 fixture 覆盖齿轮十字触发/破冰双口径/chains 或语义/三消优先爆槽/原子级联/快照 restore/Δ3 胜利条件/死锁不误杀）+ M3 流水线结构性保证（对射拒绝 T047/开放花色 ≤5 Solver 门/钥匙可达 T046 逆序结构性保证）等价承接；量产 50 关本身每机制 ≥1 关（gear@L6+/ice@L11+/chain+key@L21+/prism@L31+，mech-first-appear 已验证）
- [x] T038 [US3] Implement 引擎自测模式 in tools/solver.js: `node tools/solver.js --engine-selftest`——require('../src/core/RulesEngine.js')（UMD 双导出在 Node 侧首次实证）；断言集 per rules-engine.md §9: 转向加法 (d+1)%4 全 4 向、棱镜 8 映射、齿轮十字邻接触发/对角不触发、破冰双口径、chains 或语义、三消优先于爆槽（7 满飞入第三同花色）、原子级联（飞出→齿轮→解锁→入槽→三消→破冰一次 applyTap 全结算）、快照/restore 等价、Δ3 胜利条件（staging 残留非胜）、死锁谓词不误杀（齿轮在场即疑、扳手可救即非疑）；场景 fixture 内嵌于自测代码；断言失败 exit 1
- [x] T039 [US3+US4] **Checkpoint M2（⛔ 规则冻结 FREEZE）**: quickstart Q2.1~Q2.10 逐条通过（齿轮/冰封/钥匙/棱镜/原子级联/三消优先爆槽/Undo/扳手/暂存区/引擎自测）；US3-AC1~AC7、US4-AC1~AC3 全过；spec Edge Cases 在 T037 测试关逐条复现（原子级联与整体 Undo/死锁不误杀/棱镜单次折射/暂存满）；`node tools/solver.js --engine-selftest` 全绿 exit 0；**⛔ 冻结 RulesEngine.js 语义——此后任何规则改动须全量重跑 M3 流水线并重验全部关卡（FR-031）**

> **Δ9 变更记录（试玩反馈驱动——暂存区整体移除）**: T031~T039 完成后试玩发现「点击暂存区滑块触发滑块复制分身（1→2）破坏花色守恒导致无法消除的死局 Bug」+ 双排空槽视觉冗余。决议：**彻底删除暂存区（Staging Area）与第 3 道具「移出槽位（stage）」**——T030/T032/T035 中的 staging 相关实现全部移除（tapStaged/applyStageReturn/stageTile/applyItem('stage')/STAGING_CAP/#staging DOM/item-stage 按钮/solver stage 动作与断言），道具仅剩 Undo/Wrench；胜利条件回到「棋盘+Dock 全清空」。滑块流转严格单向守恒「棋盘→Dock→三消」，或经 Undo 快照整体回滚。**FR-031 已履行**: 引擎语义变更 → 全量重跑 M3 流水线（seed 2026 重生成 + solver 全量门禁 50/50 exit 0）+ engine-selftest 11/11 全绿。

> **Δ10+Δ11 变更记录（试玩反馈驱动——无锁连点 + 大棋盘波浪架构，2026-10-19）**:
> **Δ10 无锁连点**: 试玩发现「别急，动画中…」输入锁打断 Rapid Tap 爽感。改造：① GameState 删除 ANIMATING/SETTLING 相位与 lockForAnimation（MAX_ANIM_MS 1.2s 上限锁、animTimer）——tap() 在 READY 态 0ms 瞬时结算 applyTap，级联原子结算完毕立即 judgeTerminal；② main.js 删除 input-locked Toast「别急，动画中…」与 tick 提示音、删除 onBoardDown 400ms 兜底 setTimeout——仅终态拦截棋盘点击；③ Renderer 动画本就并发非阻塞（anims 数组多动画并存）+ hitTest 恒测逻辑态栈顶。顺手修复：引擎破冰事件名 'ice' 从未被 main.js/renderer 监听（监听 'iceBreak' 恒不匹配）→ 双侧对齐（main.js/BoardRenderer 处理 e.e==='ice'，音效映射 iceBreak 键）。验证：L1/L25/L38/L50 快速连点回放 phase=WON 零 input-locked、undo/扳手道具在无锁模式下正常。
> **Δ11 大棋盘波浪架构**: 5×5 小棋盘可玩性不足。重构 level-config CHAPTERS（5 章→3 阶段章）+ waveGrid/waveTiles/waveZMax 铁律函数：L1=5×5（30 块）、L2=6×6（45 块）、L3~50 严格 3 关一循环「2 简 1 难」（L5/L8/…/L50=8×8 挑战 16 个、其余 7×7 32 个）；tiles 前期 54~78 / 中期 63~90 / 后期 72~105（恒 %3）；zMax 前期 2~3 / 中期 3~4 / 后期 4~5（z∈[0,4] 深度≤5）；花色 3~8（8×8 挑战 +1 / 7×7 简单 -1）；机制 gear L6/ice L11/chain L21/prism L31（prism 从 L31 起真实首现——ch2 mechanisms.prism 修正开启）；受阻扣命中期起。validateLevel tiles 上限 128→150。generator: 降档不再缩 n（网格铁律优先）; 棱镜对射预检改真实同行/列/斜线拒绝; ice/chain/钥匙机制滑块结构约束「组内第 2/3 位」（修复大棋盘 openSuitsMax>5 跨组交错滞留根因）。solver: expandActions 启发式优先级排序（Dock 计数 2 三消 > 钥匙 > 高层 > 凑对 > id 序）; openSuitsMax 口径修正为「最优解路径上」（首解回放统计——原搜索全程口径在大棋盘 8 花色中途试探态必然超标，与契约「最优路径开放花色≤5」不符）; curveGates 门-2 改全章斜率、门-3 改 7/7/8 波浪锯齿（8×8 位显著 > 均值×1.05、7×7 位 < ×0.95——容差校准注记：实际简/难档分离 ≈10 分 >20% 相对差，单侧 8% 带与总体递进叠加时过紧）。BoardRenderer: 8×8 及 5 层适配（底座厚度/错层偏移按格宽分级收紧、层角标深度>4 改数字角标）。验证闭环：seed 2026 重生成 50 关零降档、solver 全量门禁 50/50 exit 0（chMonotonic/slope13.5/waveZigzag 全绿、metrics 双写一致）、engine-selftest 11/11、种子逐位复现（md5 一致）、FR-031 篡改捕获（改花色→exit 1、还原→exit 0）、Q3.3 抽查 5 关参数全符、L50 e2e（105 飞出/35 三消/38 reveal/20 齿轮/5 解锁/21 破冰 → WON）。levels.js 262KB（预算 ≤300KB）。文档同步：spec.md（US2/FR-008/FR-012/SC-004/机制档位 L11/L21/L31）、quickstart（Q1.8/Q3.3/Q3.4）、contracts 四件（rules-engine z 枚举 5 层+tiles 150、level-pipeline 波浪铁律+门禁表+启发式、game-session Δ10 输入锁+ice 事件名、level-data z 枚举+规模预算）、data-model（chapter 1~3/状态机 Δ10）。

> **Δ12 变更记录（Bug 修复——blocked-slider-vanish 渲染崩溃，2026-10-19）**: 试玩发现「点击受阻滑块触发 blocked 动画后贴图永久消失、逻辑状态正常」。根因（BoardRenderer 纯渲染层确定性崩溃链）：① tileById() 的 tileInfo 视觉缓存（m16 引入，本供已移除滑块飞出动画续绘）**缺 r/c 字段**——受阻滑块未移除必命中缓存 → ② drawAnim 的 block 分支读 t.c/t.r=undefined → NaN → ③ drawTileBody 内 roundRect/createLinearGradient(NaN) 抛 TypeError → ④ draw() 在 clearRect 已清屏且静态层已按 blockSet 跳过受阻滑块后崩溃 → ⑤ frame() 末尾 rAF 重排程不可达 → **渲染主循环永久死亡**（Δ10 删 400ms 兜底重绘后无复活路径；用户再点消失滑块→再 blocked→再崩→自我续命）。同根潜伏缺陷一并修复：gear/unlock 动画同路径同崩溃（齿轮/钥匙联动时全部动画冻结）、ice 碎裂动画坐标 NaN 静默不可见（破冰特效自 T034 引入从未生效）、冰封覆层厚度读取字段名错位（t.x → 运行态 t.ice，FR-017 厚度角标恢复显示）。修复：refresh() 缓存条目补全 r/c/m/ice 全量绘制字段（一处写入收口四条路径）；drawTileBody 冰层读取改 t.ice 优先；frame() draw() 包 try/catch+finally 重排程（纵深防御——单帧异常仅丢一帧、rAF 不死，异常 console.error 留痕）。回归史：m16(63cd701) 引入缓存+blockSet（当时有 400ms 兜底，表现为闪灭）→ Δ10(490c870) 删兜底后恶化为永久消失。验证：新增 tools/render-selftest.js（零依赖 Node 冒烟——浏览器契约级 canvas 桩含渐变/路径坐标有限性校验（Chrome 同款抛错）+ 手动 rAF 泵 + 事件流复刻 main.js handleSessionEvent 语义，覆盖受阻滑块全动画窗口/连点/gear+unlock+ice+fly 并发/棱镜折射/冰层角标/逻辑态无扰，21/21 全绿）红绿双向验证（git stash 旧代码复现 4 项崩溃+红、修复后全绿）；engine-selftest 11/11 回归通过；node --check 语法通过。评估/修复报告存档 .specify/bugs/blocked-slider-vanish/（assessment.md + fix.md）。FR-031 不触发（纯渲染层，levels.js/level-config/RulesEngine 引擎语义零变更）。

> **Δ13 变更记录（关卡增量扩容 50→60 关——3×20 大阶段 + 20 个「简-简-难」循环，2026-10-19）**: 用户指令扩容并附**最高优先级铁律（严禁全量重生成）**——原 50 关 tiles/prisms/cfg/solutionMoves 100% 原封不动保留。实施：新增 **tools/expand-60.js 增量拼接工具**（新 L1/L2 = 原样复用；新 L3 = 单独新生成 7×7 新手循环 1 困难关（57 块、z0 满铺+局部 2 层、无机关、不扣命）；原 L3~L50（48 关）平移为新 L4~L51 **仅改 id(+1)/chapter(3×20 重排)/name 编号**——JSON 深比较逐位一致验证；新 L52~L60 尾部新生成 9 关（循环 18~20: 7×7/7×7/8×8，全机制 + 105 块 8×8 终极挑战），10 新关均走 Generator 三重验证（逆向构造→正向自检→Solver 门禁）+ 内嵌 Solver 最优解）。level-config Δ13: 章区间 ch1[1,20]/ch2[21,40]/ch3[41,60] + waveGrid/wavePos/waveTiles/waveZMax 锚点 (id-4)%3==2（挑战位 L6/L9/…/L51/L54/L57/L60 共 19 个 8×8——与平移数据及新增循环 18~20 精确对齐）+ mechFrom +1 平移（gear7/ice12/chain22/prism32）+ 阶段带边界 L16→17/L35→36 重排。solver: 曲线门-3 波浪锚点同步 (id-4)%3==2 + 波浪统计域 L4+（L1~L3 新手循环不计入）+ dScore 归一域注记 60 关。验证闭环：拼接后 **60/60 solvable exit 0**（chMonotonic=true 24.70/57.05/70.05 三章均值单调 + slope14=12.60 + waveZigzag=true spike 60.42/valley 48.92）+ metrics 双写一致（门 ⑦ 60 关全过）+ 平移关 48/48 JSON 深比较 bit-exact + engine-selftest 11/11 + render-selftest 21/21 + FR-031 红绿双向（篡改新 L3 花色→exit 1→还原→exit 0）+ seed 2026 逐位复现（expand-60.js 确定性）。levels.js 314.8KB（Δ13 预算放宽 ≤330KB 契约已同步）。L55 个位 5 触发 relax 蝶翼主题（FR-012 解压爽关 = 简关变体，语义符合「简」）。文档同步：spec.md（US2/FR-008/FR-027/FR-031/实体/SC-001/002/004 + Δ13 拼接铁律条款）、level-data.md（LEVELS.length=60 + 规模预算 330KB + 章节注释）、level-pipeline.md（Δ13 章表/波浪铁律/门禁表/拼接流程注记）、data-model.md（60×/chapter/damageOnBlock 注记）、quickstart.md（Q3.1/Q3.3/Q3.5/Q4.6/Q8 + 命令速查）。前端零改动（Δ4 动态 LEVELS.length 实证——HUD/进度钳制/终局判定全自适应）。

---

## Phase 5: Milestone 3 — 离线 Generator/Solver 与 50→60 关量产（User Story 2，Priority: P1）

⚠️ **冻结门**: 仅当 T039（M2 规则冻结）通过后方可开始——Generator/Solver 与前端共用同一 RulesEngine 口径（FR-032/D-02），规则未冻结即量产 = 口径漂移 → 全量返工重验。**严禁在 M1/M2 未验证前提前生成大批量关卡。**

**Goal**: 参数表驱动的可解性流水线（Δ5），产出并 100% 验证 50 个标准关（Δ6/C-5）

**Independent Test**: `node tools/generator.js --seed 2026` 量产 → `node tools/solver.js` exit 0（50/50 + 全门禁）→ solver-report.json 与 levels.js 内嵌 metrics 交叉一致

### 章节参数表（Δ5）for US2

- [x] T040 [P] [US2] Implement 章节参数矩阵 in tools/level-config.js: 导出 CHAPTERS 可扩展数组（**追加条目即新增章节，前端永不引用**，Δ5）: 第 1 章 L1-10 grid[4,5] suits[2,4] tiles[6,18] gear 于 L6-10 引入 / 第 2 章 L11-20 grid[5,6] suits[4,5] tiles[15,24] 引入 ice / 第 3 章 L21-30 grid[6,6] suits[5,6] tiles[21,30] 引入 chain、damageOnBlock=true / 第 4 章 L31-40 grid[6,7] suits[6,7] tiles[27,36] 引入 prism 与 ice/gear 混排 / 第 5 章 L41-50 grid[7,8] suits[7,8] tiles[33,45] rhythm 节奏模板（个位 4/9=挑战关: 参数取区间上界+机制密度高+冰厚上探；个位 5/0=解压爽关: 对称图案 theme 模板 ring/butterfly/diamond/heart 之一+tiles 取下界+dockPeak 目标 ≤3；其余位常规插值，FR-012）；难度评分权重 score=round(1.0·norm(minMoves)+0.8·(1-norm(solutionCount))+1.2·norm(dockPeak)+1.5·mechCount+0.5·norm(tiles)+0.7·norm(suits))×10（norm=50 关全域 min-max 归一）；Solver 预算 budget{nodes:2_000_000, ms:60_000}；加载时校验章区间无空洞无重叠

### Solver（回溯求解器 + 验证门禁）for US2

- [x] T041 [US2] Implement Solver 搜索核心 in tools/solver.js: 迭代加深 DFS（初始深度=启发下界如「tiles/3+冰封组数」）+ 状态哈希去重（**dock 顺序规范化——哈希键用花色计数向量；staging 有序保留——Δ3 回填 tap 依赖滑块身份**，D-07）+ 节点/时限预算（章级 budget，默认 2M/60s 硬顶）；迭代加深保证首解即最优步数解
- [x] T042 [US2] Implement Solver 动作集与确定性 in tools/solver.js: 动作集=enumerateTaps ∪ tapStaged ∪ 道具动作（wrench 转向任意可转滑块、stage 移出）——**仅当最优解需要道具才计入 metrics.minMoves**；动作展开顺序固定（行优先、列优先，D-08）；xorshift128 种子化 PRNG（禁 Math.random，D-08）
- [x] T043 [US2] Implement Solver 指标产出 in tools/solver.js: minMoves（首解即最优）/ solutionCount（预算内不重复终局路径数，封顶 10k 记 ">=">=10000""）/ dockPeak（搜索全程 Dock 占用最大值 1..7）/ mechCount（按 tiles/prisms/cfg 实际出现计 0~4）/ openSuitsMax（最优路径上最大开放花色数）/ difficultyScore（T040 权重）；**metrics 双写 levels.js 与 solver-report.json**
- [x] T044 [US2] Implement Solver CLI 与质量门禁 in tools/solver.js: `node tools/solver.js`（全量验证 LEVELS）+ `--level N` 单关 + `--engine-selftest`（T038 既有）；**exit code 门禁**（非零即失败，FR-031/SC-001/SC-004）: ①可解性 `LEVELS.length/LEVELS.length` 关 solvable ②每关 validateLevel().ok ③结构约束（每花色计数%3==0、openSuitsMax≤5、无对射棱镜）④曲线门-1 各章 difficultyScore 均值随章号单调不减 ⑤曲线门-2 第 1~4 章 minMoves 线性回归斜率 ≥0 ⑥曲线门-3 第 5 章个位 4/9 关显著 > 章均值、个位 5/0 显著 <（锯齿形态）⑦报告 metrics 与 levels.js 内嵌 metrics 逐字段一致；solver-report.json schema per level-pipeline.md §3（schemaVersion/generatedAt/seed/nodeBudget/levels[]/summary{total,solvable,failedIds,curveGate{chMonotonic,slope14,ch5Zigzag}}）

### Generator（逆向生成器，三重验证 D-10）for US2

- [x] T045 [US2] Implement 逆向构造核心 in tools/generator.js: 轮数=tiles/3，每轮选一花色（保证计数 %3==0 且最优路径开放花色 ≤5 的启发式花色分配）→ 生成 3 个同花色滑块逐个「反向飞行」落位（反向射线=沿 d 反向从边缘/出口外推进到落位格；落位被占则换出口或换 d 重试，受限次后该滑块重掷）；**落位逆序=solutionMoves 逆序（后推入者先飞出）**；章/关参数由 CHAPTERS 插值
- [x] T046 [US2] Implement 机制逆操作镜像 in tools/generator.js: 齿轮（落位时约束「十字相邻更晚推入者存在 ⇒ 其方向须在那些滑块飞出后经若干 +90° 对准出口」）；锁链（**仅当其配对钥匙已更晚推入（=更早飞出）才允许落位**——钥匙可达性结构性保证 FR-019）；冰封（任意落位、冰厚独立于飞行——破冰后的正向时序在逆序上无约束）；棱镜（先行布置，滑块反向飞行路径可含 1 段折射）
- [x] T047 [US2] Implement 对射拒绝与正向自检 in tools/generator.js: 棱镜布置后预检——任意两条「滑块→棱镜→棱镜」可达路径即重掷棱镜布局（FR-022/Δ2 对射拒绝）；正向自检=RulesEngine.init + 逐 applyTap 回放构造解，断言 terminal=='won' 且全程 dockPeak≤7、开放花色 ≤5、无中途空棋盘残槽（FR-029）——镜像逻辑错误在此暴露；失败→该关回炉
- [x] T048 [US2] Implement Solver 门禁集成与重试降档 in tools/generator.js: 三重验证闭环（逆向构造→正向自检→Solver 门禁，D-10）；失败→参数扰动重生成（子种子 re-roll: 位置/花色分配/机制布置）；同关连续 5 次失败→降档（tiles/suits 降 1 档至章区间下界）重试+报告标记 degraded:true；CLI: `--chapters 1,2,3,4,5` / `--seed S` / `--out src/data/levels.js` / `--dry-run`；种子化 PRNG 保证 --seed S 逐位复现（D-08）
- [x] T049 [US2] Implement 流水线导出 in tools/generator.js: 按契约写 src/data/levels.js（**solutionMoves 来自 Solver 的最优解、非构造解——Δ6；构造解仅作门禁自检**；metrics 同步内嵌；UMD 双导出、按 id 升序、LEVELS[i].id===i+1）+ tools/solver-report.json（同批次生成）；文件头显式保证注释: 初始滑块数 ≥6 且 %3==0、钥匙解锁前可达、单滑块单机制、无对射棱镜；**整体替换 M1/M2 手工测试关**（levels.js 被流水线再生成，此后禁止手改——FR-031）

### 前端进关/持久化/终局 for US2

- [x] T050 [P] [US2] Implement 进度持久化 in src/main.js: localStorage["slide-triple:progress:v1"]={v:1, unlocked, last, best:{[id]:{score,combo}}, muted}（data-model.md §8）；**全访问 try/catch，失败降级内存进度（隐私模式可玩，D-03）**；加载时 unlocked/last 钳制 ≤LEVELS.length（Δ4 扩容自适应）；新会话自动进 unlocked 关；通关 unlocked=max(unlocked,id+1)、best 分更新
- [x] T051 [US2] Implement 结果屏与全通关终局 in src/main.js: won→「下一关」（id+1>LEVELS.length ⇒ **全通关庆祝终局**，动态关数）/「重玩」；lost→「重玩」（lives 重置）；muted 状态接入 SoundManager
- [x] T052 [US2] **Checkpoint M3（量产门）**: quickstart Q3.1~Q3.7 逐条通过（`--seed 2026` 逐位复现 / 全量验证 exit 0 / 参数矩阵抽查 L1,L15,L25,L35,L45 符合 FR-008 / curveGate 三门 / 自动进关+L50 全通关 / 刷新后进度延续+localStorage 不可用降级可玩 / 手改任一关→solver exit 1 捕获并更新报告）；SC-001 50/50 可解（附验证报告）；SC-004 难度曲线量化验证；US2-AC1~AC5 全过

---

## Phase 5.5: Milestone 3.5 — 万物出发：题材、视觉、背景与 BGM 全面升级（User Story 5，Priority: P2）✨ 表现层

⚠️ **GATE**: 依赖 T052（M3 量产门）通过。**纯渲染与音频层**——RulesEngine 规则语义、Solver 口径、levels.js 关卡数据（suit/花色数/坐标/solutionMoves）**零变更**（FR-032/FR-031/Δ13 保留铁律不破；FR-033 §3 渲染层映射消解口径）；US5 题材化经用户裁定记录于 spec 假设区（宪章 I 叙事包装禁项零触碰、宪章 III 程序化红线零突破）。

**Goal**: 45 种动态生灵/载具图鉴、3D 奶油白底座与流光方向角标、20 景生态背景、挑战关激励横幅、程序化治愈系 BGM（FR-033~FR-037、SC-007/SC-008）

**Independent Test**: 逐关抽查图案来自对应阶段图鉴池（同花色恒同图案）；20 景背景与 cycleIndex 严格对应；挑战位关开局 1.6s 横幅；首次交互后 BGM 自动播放且开关同步静音；`git diff src/data/levels.js` 为空 + engine-selftest 全绿回归。

**验证**: render-selftest.js 扩展 Δ14 断言组（纯渲染层机判，Node 零依赖——延续 D-14 三层验证体系）+ engine-selftest 回归 + quickstart 人工场景

- [x] T052a [P] [US5] 编写 45 种生灵与载具全彩矢量图鉴定义及离屏 Sprite 预渲染缓存（Δ14a/FR-033）in `src/render/bestiary.js`（新增）+ `src/render/BoardRenderer.js`: 图鉴三阶段各 15 种（Suit 0~14 陆地萌宠 / 15~29 碧海飞羽 / 30~44 奇幻远航，名称与清单严格照抄 spec FR-033 §1~§3）；每图案独立 Canvas 绘制函数（贝塞尔/径向渐变/高光点语汇，纯代码零图片——宪章 III）；**离屏 Sprite 缓存**——按 (suit, 渲染尺寸档) 绘制一次缓存为 offscreenCanvas 会话内复用（8×8×5 层满载 105 滑块 60fps 预算）；导出 `STM.Bestiary`（classic script，加载序插 BoardRenderer 前）；阶段花色映射表：按 level.id 区间（1~21/22~42/43~60，**严禁读 level.chapter——chapter 分段 1-20/21-40/41-60 与图鉴阶段不重合，L21/L41/L42 错位**）+ 确定性抽样（seed = f(level.id, 阶段号)，xorshift 类 PRNG 禁 Math.random——D-08）将关卡实际花色数 K（3~8 不变）映射至池内 K 个图案，同关内 suit→图案唯一且可复现（SC-007）；图案仅是视觉标识，三消/求解/死局判定恒以 suit 整数为准（FR-032 铁律）
- [x] T052b [P] [US5] 重构 3D 奶油白正方体滑块、多层金字塔投影与边缘流光方向角标，移除旧圆圈指示器（Δ14b/FR-034）in `src/render/BoardRenderer.js`: ①底座 = 1:1 奶油白 3D 圆角正方体（底部立体厚度阴影 + 纯白高光内倒角——替代 T-M15.3 牌面+暖棕厚度底座）；②多层堆叠（1~5 层）向左上角微量阶梯偏移 + 层间阴影（金字塔式空间立体感，替代原左上角层角标与错层偏移）；③**彻底移除左上角圆圈指示器与覆盖图案面部的半透明箭头圆圈**；④方向 = 朝向侧边缘内嵌「流光胶囊」角标（程序化渐变流光动画，指 d 方向；方向语义与 FR-001/FR-002 命中判定完全一致——纯视觉替换）；⑤图案居中完整展示零遮挡（Bestiary Sprite 消费 T052a）；⑥机制标记（齿轮/冰封/锁链/钥匙/棱镜——T034 视觉）位置与新底座兼容互不遮挡；⑦hitTest/动画路径（fly/block/gear/unlock/ice/prism）坐标口径同步新底座几何（防 Δ12 类 NaN 崩溃回归——render-selftest 覆盖）；⑧8×8/5 层厚度与偏移按格宽分级缩放（沿用 Δ11 适配策略）
- [x] T052c [US5] 编写 60 关花色重映射逻辑，在不破坏现有坐标与 solutionMoves 的前提下映射至 45 种动态图鉴（Δ14a/FR-033 §3/§4）in `src/render/bestiary.js`（映射表本体）+ `tools/render-selftest.js`（断言）: 60 关逐关计算「关卡花色数 K → 阶段池 K 图案」映射并缓存映射结果（会话级）；**不写回 levels.js**（git diff 恒空——Δ13 保留铁律，SC-007 验收口径）；不触碰 tiles 坐标/solutionMoves 有效性（Hint/Bot 回放照常——Δ6 解序列与渲染层解耦）；render-selftest 新增断言组：60 关映射确定性（同 seed 二次计算结果一致）、同关同 suit 恒同图案、阶段边界正确（L21∈阶段一、L22∈阶段二、L42∈阶段三、L43∈阶段三——按 id 区间非 chapter）、K≤池大小恒真、跳关/Undo 后以当前关 id 重算阶段（Edge Case「阶段边界换装」）；engine-selftest 全量回归零漂移（证明映射纯渲染层）【实现注: 原文「L42∈阶段三」为笔误——spec FR-033 阶段二 = L22~L42（含 42）且 21+21+18=60 自洽，断言按 spec 口径 L42∈阶段二执行；引擎 suit 校验仅 %3 守恒无上限，天然兼容 Suit 0~44（无引擎改动需求）】
- [x] T052d [P] [US5] 绘制 20 套阳光治愈系生态风景背景池，并绑定至 20 个三关循环（Δ14c/FR-035）in `src/render/BoardRenderer.js` + `css/style.css`: 20 景 Canvas/内联 SVG 多层风景（每景天空/远景/中景/近景 ≥3 层 + 渐变；题材分布 Cycle 1~7 陆地（阳光牧场/花海/麦田等）/ 8~14 蔚蓝（海滩/珊瑚湾/彩虹谷/云海等）/ 15~20 远航（热气球晨光/海港/星河/云海金顶等）——具体构图清单实现期定）；绑定 `cycleIndex = Math.floor((level.id - 1) / 3)`（0~19 严格一一对应，同循环 3 关共享——跳关/Undo 均以当前关 id 实时计算）；背景层与滑块层分离渲染（背景静态化或低速重绘，滑块层 60fps 不降帧）；棋盘层半透明蒙版/暗角过渡（滑块/角标/机制标记对比度 ≥ 黑底基准——Edge Case「背景可读性」）；零外部图片（宪章 III）
- [x] T052e [P] [US5] 实现困难关（Cycle 第 3 关）开局 1.6 秒挑战横幅动效（Δ14d/FR-036）in `src/main.js` + `css/style.css`: 挑战位集合 = L3 ∪ (id-4)%3==2 位（L6/L9/…/L60，**合计 20 关 = 20 个三关循环各含 1 难关——内嵌精确集合，勿只取 (id-4)%3==2 漏 L3**）；开局（createSession 后）屏幕中央弹出 1.6s 绿金横幅「🔥 挑战关卡！只有 XX% 的玩家能一次通过这一关」；XX% = 关卡难度指标（metrics）确定性函数（同关恒定——minMoves/difficultyScore 单调映射至如 5%~95% 值域，具体函数实现期定）；**非模态**（不阻塞 PointerEvents、不冻结 rAF 与判定——Edge Case「横幅与开局输入竞态」）；1.6s 自动消散（CSS 动画 + setTimeout 清理），重开本关可再弹
- [ ] T052f [US5] 实现 Web Audio API 舒缓治愈系循环 BGM 合成器与静音联动（Δ14d/FR-037）in `src/audio/SoundManager.js`: 大调五声音阶（C D E G A）柔和木琴音色（短促衰减正弦/三角波敲击 + 低通滤波）与柔和和弦 pad 循环（4~8 小节调度表驱动——Web Audio 前瞻调度，主线程零负担）；**首次交互（PointerEvent/keydown 任一）后自动播放**（autoplay 政策合规——首次交互前 MUST NOT 发声，Edge Case「BGM 自动播放策略」）；音效开关同步静音联动（setMuted(true) → BGM gain 归零——与既有 SFX mute 语义一致）；visibilitychange→hidden 暂停/恢复续播；BGM 专用 gain 节点与 SFX 链路隔离（互不串音）；纯代码实时合成零音频文件（宪章 III）
- [x] T052g [US5] **Checkpoint M3.5（表现层门 → M3.6）**: SC-007（图鉴渲染一致性——45 图案可渲染、同关同图案、跨阶段池切换仅在换章边界、levels.js git diff 为空）；SC-008（20 景 cycleIndex 对应 0 遗漏 0 冲突 + 横幅触发 20/20 + BGM autoplay 合规静音联动）；US5-AC1~AC8 逐条人工验收（quickstart Δ14 场景组）；`node tools/render-selftest.js` Δ14 断言全绿 + `node tools/solver.js --engine-selftest` 回归全绿（FR-031 不触发——levels.js/level-config/RulesEngine git diff 全空佐证）；8×8×5 层满载关卡 60fps 抽查（中端手机档）；宪章红线复核（零二进制文件、零外部资源）。**未全过不得进入 M3.6**【Δ15 注记：本门按 Δ14 口径验收成立（5ea6c44 已交付）；「levels.js git diff 为空」子项此后由 M3.6 迁移接管——T052h 前恒空、T052h 一次性变更、T052h 后恒空；「零外部资源」子项已被宪章 III v2.0.0 取代（assets 为可选增强目录）】

---

## Phase 5.6: Milestone 3.6 — Δ15 增量：同花色空间打散、贴图双兜底与箭头重做（FR-029 Δ15 / FR-033 §6 / FR-035 §3 / FR-034 §3）

⚠️ **GATE**: 依赖 T052g（M3.5 表现层门）通过。**执行顺序钉死：T052h 先行（唯一触碰 levels.js 的任务）→ T052i/T052j/T052k 并行**——levels.js 在本阶段开头经 redisperse-60 一次性变更（FR-008 Δ13 铁律受控让位 + FR-031 全量重验后恢复），此后 git diff 恒空；渲染层任务（T052i/T052j）不依赖迁移结果可并行开发但**合入顺序在 T052h 之后**（最终交付批次为重打散后数据）。

**Goal**: ① 存量 60 关花色空间重打散达标三档聚散度曲线（消灭"三连排排坐"）+ Solver 全量重验与聚散度指标落库；② 渲染链切换「本地贴图优先 + Emoji/程序化强制双兜底」（宪章 III v2.0.0，空 assets 完整可玩）；③ 方向角标重做为单枚锐利宽翼三角箭头（消灭"猪鼻子"胶囊造型）。

**Independent Test**: `node tools/redisperse-60.js` 输出 60 关聚散度报告全达标 + `node tools/solver.js` exit 0（60/60 可解 + 聚散度断言）；空 assets 目录双击 index.html 完整可玩（Emoji 卡牌 + 程序化背景）；放入贴图后刷新换装不闪烁；滑块方向角标为单枚白描边实心三角。

**验证**: redisperse-60 自检 + Solver 全量门禁（FR-031）+ render-selftest Δ15 断言组 + engine-selftest 回归 + quickstart Δ15 场景组（空/满 assets 双形态）。

- [x] T052h [US2] 实现 tools/redisperse-60.js 存量 60 关花色重打散迁移工具（Δ15a/FR-029 §1~§6）in `tools/redisperse-60.js`（新增）+ `tools/level-config.js`（三档档位参数）+ `tools/solver.js`（聚散度指标）: ① 聚散度核验函数——按邻接定义（连坐=曼哈顿距离 1 或同格相邻层；三连簇=3 块连通紧挨；双连坐=2 块紧挨+第 3 块远处；完全分散=两两曼哈顿 ≥2）逐关统计三连簇数/双连坐占比/完全分散占比/两两最小曼哈顿距离（8×8 关另测 ≥3 达标）；② 三档曲线档位参数入 level-config（L1~L6: 三连簇 ≤15%、双连坐 ≈35%、分散 ≈50% / L7~L21: 三连簇 ≤5% 且每关 ≤1 组、双连坐 30%→15%、分散 ≥80% / L22~L60: 三连簇 0%、双连坐 15%→0~5%、两两 ≥2 优先 ≥3）；③ 迁移算法——对每关保持网格/滑块总数/堆叠层数/方向/机制标记与配对/prisms/cfg 全部结构参数不变，仅重排同花色滑块的空间落位（r/c 交换分配；候选分配经打散启发式搜索：最小化三连簇 → 双连坐向档位目标靠拢 → 最大化分散度），逐关重算 solutionMoves（Solver 全量求解，非原解扰动）并验证 100% 必胜可解 + 开放花色数 ≤5 + dockPeak ≤7 + 无"空棋盘残槽"终局；④ solver.js 报告 schema 增列聚散度字段（tripleClusters/pairPct/dispersedPct/minPairDist≥3（8×8）达标布尔/档位达标布尔——向后兼容旧报告），exit code 门禁增加聚散度档位断言；⑤ CLI: `node tools/redisperse-60.js --seed 2026`（确定性种子、逐位复现）→ 导出迁移后 levels.js + 更新 solver-report.json → `node tools/solver.js` 全量门禁 exit 0 方可合入；⑥ 迁移完成后 Δ13 保留铁律恢复（此工具此后仅供历史复现，交付物不含运行依赖）。**FR-031 已触发并履行**（levels.js 变更 → 全量重验报告更新）。
- [x] T052i [P] [US5] 重做方向角标为单枚锐利宽翼三角箭头 + 图标渲染链贴图优先/Emoji 兜底（Δ15c/FR-034 §3 + Δ15b/FR-033 §6）in `src/render/BoardRenderer.js` + `src/render/bestiary.js`（Emoji 码点表）: ① **角标重做**——移除流光胶囊角标绘制路径，改为滑块朝向边缘内侧正中的单枚锐利宽翼实心三角箭头（带白色描边、干净利落绝无孔洞感；**严禁"胶囊椭圆内含两个小点/小三角"猪鼻子造型**；宽高比/描边宽度/内缩距离按 FR-034 §5 可辨识度红线实现期定，8×8 小格尺寸下限分级适配——沿用 Δ11 分级缩放策略）；方向语义与 hitTest/动画坐标零变化（纯视觉替换）；② **图标渲染链**——bestiary.js 增补 45 条目 → Emoji 码点常量表（每条目一个确定性 Emoji，如跳跳蛙→🐸、小火箭→🚀；plan 阶段固化）；BoardRenderer 图标绘制前置 Image 加载层：`assets/icons/{suit}.png`（0.png~44.png）优先，onerror/未就绪时该条目降级为原生全彩 Emoji 直渲染（`ctx.font = "bold XXpx 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"` + `ctx.fillText`；**严禁 ctx.arc 手绘圆球加黑点**）；③ 兜底纪律——贴图缺失判定逐条目独立、同关内同 suit 恒同渲染来源（不混排闪烁）；贴图就绪后惰性换装（本关内生效或下局生效——实现期定，禁加载期白屏/卡帧）；Image 相对路径保证 file:// 双击与静态服务双形态一致；④ Sprite 缓存键扩展 (suit, 尺寸档) → (suit, 尺寸档, 渲染来源)——贴图与 Emoji 两套缓存；⑤ render-selftest 增补 Δ15 断言组：Emoji 码点表 45 条全覆盖且无重复、兜底链确定性（Image 桩 onerror → Emoji 路径命中）、角标几何有限性（三角顶点坐标非 NaN——防 Δ12 类崩溃回归）。【实现注: ②~⑤图标渲染链已交付（含 4×4 精灵图集升级——sheet{1..3}.png 3 张 ×15 格离屏切片 + getImageData 白底 Alpha Keying + 圆角遮罩 + 第 16 格水印跳过 + 单张 PNG 逐条目兜底 + Dock chip 贴图出口 + render-selftest 场景 F 断言组全绿）；**①三角箭头重做已随 Δ15b3e 交付（Bug C 修复，2026-10-21）——`DIR_COLORS` 四向主题色（U #10B981 / R #F59E0B / D #EF4444 / L #3B82F6）+ 1.5px 纯白描边，实测箭头亮度跨度 126.9（原纯白实现仅 2.9，卡面上零对比），复选框已归位】】【Δ15b3e 补充（Bug A/B 修复，2026-10-21）: 切片分辨率 128→256；DPR 改 `Math.max(2, devicePixelRatio||1)` 2x 下限超采样 + 显式 `imageSmoothingQuality='high'`；棋盘位图/CSS 盒正方形锁定（消除原 1.18× 纵向拉伸）；移除 `#board` 的 `backdrop-filter` 毛玻璃与灰白雾遮罩 + 画布内径向暖白 veil（滑块对比度改由 `rgba(15,23,42,0.35)` 深色投影 + 加深厚度边承载）；Dock 图标改「DataURL `<img>` 优先 + `<canvas>` 同源兜底」双出口——`file://` 跨源污染下 `toDataURL`/`getImageData` 必抛 SecurityError，canvas 兜底消费棋盘同一张切片故双形态 100% 同源；`ensureSinglesFor` onerror 修 TOCTOU（原会把已由 sheet 覆盖的 5 条误标 emoji）；降级路径加 `console.warn` 一次性留痕（原静默失败 45 次零信号）；render-selftest 场景 G 增补 Δ15b3e 修复断言组 15 项 + `tools/verify-fix.cjs` 双形态实机探针】
- [x] T052j [P] [US5] 背景渲染链贴图优先/程序化兜底（Δ15b/FR-035 §3）in `src/render/backdrops.js` + `src/render/BoardRenderer.js`: 背景绘制前置 Image 加载层——`assets/bg/bg{cycleIndex+1}.jpg|.png|.webp`（序号 1~20 与 20 景一一对应）优先；某景文件缺失或加载失败（onerror/未就绪）时该景降级为既有 20 景程序化风景（Canvas/内联 SVG + 渐变——T052d 产出的绘制函数降格为兜底渲染源）；兜底判定逐景独立、会话内缓存结果（同景不重复探测、不闪烁）；贴图就绪后换装时机与 T052i 同口径；drawImage 覆盖 9:16 画布（cover 裁切算法实现期定）；蒙版/暗角可读性保证（FR-035 §4）对贴图与程序化两来源同样生效；Image 相对路径（file:// 双形态一致）；背景层与滑块层分层渲染策略延续（背景静态化/低速重绘不降帧）。render-selftest 增补断言：bg 编号映射 cycleIndex+1 严格一一对应、程序化兜底路径在 Image 桩失败时正确命中。【实现注（Δ15b3 升格，见 T052j2）: 6 图 → 20 循环映射口径已落地（0~3→bg1 / 4~6→bg2 / 7~10→bg3 / 11~13→bg4 / 14~16→bg5 / 17~19→bg6）；背景层由「棋盘画布内方图」升格为「#app 全视口 9:16 背景舞台」（贴图 cover 等比铺满居中不裁切），棋盘画布转为透明透出风景——原「20 景程序化 Canvas 兜底」降格为渐变底色兜底（backdrops.js PAINT 保留在库未被消费，见 T052j2 备注）】
- [x] T052j2 [P] [US5] 背景升格为「全视口 9:16 背景舞台」+ 20 循环差异化氛围滤镜与前景环境粒子（Δ15b3/FR-035 §2~§4 衍生）in `src/render/BoardRenderer.js` + `src/main.js` + `css/style.css`: ① **全视口铺满**——背景由「棋盘画布内方图」升格为 `#app` 全视口背景舞台（main.js 动态挂载 `#bg-canvas` 底图层 + `#fx-canvas` 前景粒子层，pointer-events:none 不拦截操作；贴图 9:16 源按 cover 等比铺满居中——**无裁切放大**，Image 相对路径 file:// 双形态一致）；② **格式自动兼容**——`assets/bg/bg{1..6}` 加载按 png → jpg → jpeg → webp 逐扩展探测，某张未就绪则复用 bg1，全失败降级 Canvas 渐变底色（按主题族：meadow/sea/petal/star 四套暖阳/海蓝/樱粉/星夜渐变）；③ **6 图 → 20 循环映射**——`cycleIndex = Math.floor((level.id - 1) / 3)`（0~19）：0~3→bg1 雪山城堡花海 / 4~6→bg2 金色麦田风车 / 7~10→bg3 黄金椰林海滩 / 11~13→bg4 樱花飞舞湖畔 / 14~16→bg5 漫天彩色热气球 / 17~19→bg6 奇幻星辰云海；④ **20 档差异化氛围**——同一底图在负责的 3~4 个循环中叠加互异氛围光影层（ATMOS 20 档：清透晨光/暖金午后/微醺粉霞/清凉月光/晴空麦浪/正午暖阳/金色黄昏/碧海晨汐/澄澈正午/珊瑚霞光/静谧月夜/樱映晨光/午后暖樱/暮色紫霞/气球晨光/云端暖阳/彩霞满天/银河初现/星海流光/终局星辉——含渐变罩+色温罩+暗角 veil+提亮 lift+暖偏移 warm 五参），确保每过 3 关一换气氛；⑤ **前景环境粒子 4 族**——meadow（bg1/bg2：蒲公英绒毛 + 柔和阳光光斑）/ sea（bg3：晶莹上升水泡 + 海面波光亮带）/ petal（bg4：缓缓飘落粉色樱花瓣）/ star（bg5/bg6：闪烁流光星尘 + 微光流星划过），低透明度（≤0.22）低密度（≤24 粒）分布于边缘与上下半区，**不干扰操作视线**；粒子为纯函数动画（相位由 (i,t) 决定，零状态污染），独立 rAF 循环不占棋盘 60fps 预算；⑥ **棋盘通透融合**——棋盘画布转为透明（透出背后高清风景图），CSS 底板改半透明磨砂暖白 `rgba(255,255,255,0.22)` + 柔和圆角边框 + backdrop-filter，画布内保留暖白柔光层保滑块对比度；HUD/Dock/道具栏加半透明磨砂带保浅色文字可读性。**验证**：`node tools/render-selftest.js` 场景 G 全绿（6 图映射 + 20 档氛围唯一性 + 4 族粒子 + 20 循环舞台绘制）+ `node tools/solver.js --engine-selftest` 零漂移 + Chromium 实测截图 11 关（bg1~bg6 全覆盖，贴图入画布证实、氛围名逐环互异、棋盘磨砂透出背景、Dock chip 不被模糊）。**备注**：`src/render/backdrops.js` 的 20 景程序化 PAINT 绘制器保留在库（FR-035 兜底资产，未被消费——留作程序化场景二次衍生备用），其 `drawBackdrop`/`drawBackdropAnim` 路径因背景层升格而停止被 BoardRenderer 调用。
- [ ] T052k [US2+US5] **Checkpoint M3.6（Δ15 门 → M4）**: ① `node tools/redisperse-60.js --seed 2026` 迁移成功且聚散度报告 60/60 达标（L22~L60 三连簇 0、L7~L21 每关 ≤1 组、L1~L6 ≤15%；双连坐与分散占比在档位目标带内）+ `node tools/solver.js` exit 0（60/60 可解 + metrics/聚散度双写一致 + 曲线门全绿——FR-031 履行证据）；② SC-006 重定义验收——**空 assets 目录双击 index.html 完整可玩**（Emoji 卡牌 + 程序化背景兜底全链生效、SC-003 秒开不劣化）+ 满 assets 形态贴图换装正确不闪烁（双形态双验收）；③ US2-AC6（聚散度核验场景）+ US5-AC4/AC5 复扫（新口径：三角箭头一眼可辨、贴图/兜底背景正确）；④ `node tools/render-selftest.js` Δ15 断言全绿 + `node tools/solver.js --engine-selftest` 回归零漂移（FR-032 铁律佐证）；⑤ 8×8×5 层满载 60fps 抽查 + 挑战关横幅/BGM 与新渲染链共存抽查（M3.5 功能零回归）；⑥ 迁移后 `git diff src/data/levels.js` 恒空（M3.6 之后时点——Δ13 铁律恢复）。**未全过不得进入 M4**。

---

## Phase 6: Milestone 4 — 调试面板、Auto-Play Bot 与无缝扩容（User Story 4 面板部分，P3）

**Goal**: 评审效率层（FR-027/028）+ 扩容能力实证（Δ4/Δ6）

**Independent Test**: 任意关打开面板验证跳关/Hint/Bot/难度指标/机制标签/移动抽屉；Q8 钻探验证零代码扩容

- [ ] T053 [P] [US4] Implement 调试面板容器 in index.html + css/style.css: PC（≥1024px）右侧 320px 侧栏常驻；移动端底部抽屉（translateY 收展，DOM 常驻避免重排棋盘）；收起不影响游玩布局（FR-028/D-13）
- [ ] T054 [US4] Implement 跳关与重置 in src/main.js: 关卡下拉框 1~`LEVELS.length` **动态选项**（Δ4——配置扩至 100+ 关零代码适配）；选择即 createSession(LEVELS[N-1]) 加载；重置=session.reset()
- [ ] T055 [US4] Implement Hint in src/main.js: on-rail（session.onRail()）→ 高亮 solutionMoves[stepIndex].t 滑块（脉冲描边动画）；off-rail → 有界 DFS（预算 100k 节点/~300ms 时限，复用 T033 搜索器，动作集与 Solver 同构）首步高亮；搜索失败→启发式建议（能飞出且降低槽压力的 tap）+「非保证」标记
- [ ] T056 [US4] Implement Auto-Play Bot in src/main.js: on-rail 逐 tap 回放（600 ms/步、botTick 音效）；**玩家 pointerdown 立即打断**；off-rail 有界续解→失败则兜底 reset 重放整条 solutionMoves（保证「直至该关胜利」）；终态自动停
- [ ] T057 [US4] Implement 关卡信息展示 in src/main.js: metrics 全字段（minMoves/solutionCount/dockPeak/mechCount/difficultyScore/openSuitsMax）+ 机制标签动态计算（齿轮/冰封/锁链/棱镜+破冰口径，按 tiles/prisms/cfg 实际出现）+ 音效开关（SoundManager.setMuted）
- [ ] T058 [US4] **Checkpoint M4（功能门）**: quickstart Q4.1~Q4.7 逐条通过（跳关/Hint 在轨与偏离两态/Bot 演示+玩家打断/指标与机制标签/移动端抽屉收展/SC-002 计时/SC-003 首屏）；US4-AC4~AC7 全过；**SC-002: 跳关+自动演示 10 分钟内遍历 60 关（Δ13 扩容后）+ ≥10 关机制深度人工验证**
- [ ] T059 [US4] Execute Q8 无缝扩容钻探（**钻探配置不进入交付物**; Δ13 注记: 50→60 扩容已由 expand-60.js 增量拼接实证一次，后续钻探目标改为 60→80+）: 临时向 tools/level-config.js CHAPTERS 追加新章条目（levels:[61,80], grid:[8,8] 等）→ `node tools/generator.js --chapters N --seed 2026` 生成 80 关（或增量拼接）→ `node tools/solver.js` 全量门禁通过 → 浏览器验证: 下拉框出现 61~80 选项、通关 L60 自动进 L61、L80 通关触发全通关终局、进度对象零迁移自适应（**全部零前端代码修改——Δ4+Δ5 实证**）→ 回滚配置 → 重跑生成恢复 60 关交付物 → solver 全量重验

---

## Phase 7: Polish 与交付终验（跨故事横切）

**Purpose**: 横切质量、性能与宪章红线审计

- [ ] T060 [P] Performance & size sweep 全项目: SC-003 首屏可交互 <3s（冷启动清缓存，主流桌面+手机浏览器）；src/data/levels.js ≤200KB（level-data.md §4 规模预算）；棋盘动效 60fps 抽查（中端手机档）；Hint 响应 ≤300ms 实测（level-pipeline.md §5 校准项收敛）
- [ ] T061 [P] Code cleanup in src/, index.html, css/style.css: 死代码/console 噪音清零；四契约 API 逐一对齐复核（导出名/签名/加载序/UMD）；grep 复查无 touchstart/mousedown/mouseup/touchend、无 import/export 语法（classic script 约束）；变更后 quickstart 抽查回归
- [ ] T062 [P] Q9 宪章红线审计 全仓库: 无 package.json/node_modules/构建配置；index.html 无 type="module"、无动态 import/fetch；文件类型扫描——核心代码路径（index.html/src/）与音频/字体零二进制命中（SC-006 Δ15 口径：assets/icons/*.png 与 assets/bg/* 为宪章 III v2.0.0 允许的可选增强贴图，豁免零二进制扫描但须单独核验空目录可玩与 Image 相对路径加载）；关卡来源=levels.js 头注释生成元数据+tools/solver-report.json 在库（宪章 V，含 Δ15 聚散度指标）；file:// 双击可玩（宪章 II 交付红线——空 assets 与满 assets 双形态各验一次）
- [ ] T063 Final delivery check 全项目: quickstart Q0~Q9 全场景终扫；levels.js 与 solver-report.json 同批次 metrics 交叉一致（验收检查项——含 Δ15 聚散度字段）；SC-001~SC-008 全量勾验（含 SC-005 首点 30s 路径复核、SC-006 Δ15 双兜底口径、SC-007/008 复扫）；确认 tasks.md 全项勾选

---

## Dependencies & Execution Order

### 里程碑门禁（硬顺序，覆盖一切并行）

Phase 1 → Phase 2 → **M1（T022 验收门）** → **M2（T039 冻结门 FREEZE）** → **M3（T052 量产门）** → **M3.5（T052g 表现层门）** → **M3.6（T052k Δ15 门——T052h 迁移先行 → T052i/T052j/T052k）** → **M4（T058 功能门 + T059 扩容钻探）** → Phase 7（T063 交付门）

- **⛔ 核心纪律**: M2 冻结门前**禁止**执行 T045 及之后的量产任务——Generator/Solver 与前端共用同一 RulesEngine 物理文件（D-02/FR-032），规则未冻结即量产 = 口径漂移 → 按 FR-031 全量重跑重验
- M1/M2 手工测试关（T019/T037）允许在门内先行（小规模、schema 与最终契约一致、M3 起被流水线整体替换）

### Phase Dependencies

- **Setup（Phase 1）**: 无依赖，立即开始
- **Foundational（Phase 2）**: 依赖 Phase 1；**阻塞全部里程碑**
- **M1（Phase 3）**: 依赖 Phase 2 完成
- **M2（Phase 4）**: 依赖 T022（M1 验收门）
- **M3（Phase 5）**: 依赖 T039（M2 冻结门）；性能预算=Solver 单关 2M 节点、全量 60 关 <5 分钟
- **M4（Phase 6）**: 依赖 T052k（M3.6 Δ15 门——空间打散/贴图渲染层与面板 UI 互不干扰基线就绪，Hint/Bot 消费重打散后批次的 solutionMoves）；Hint/Bot 依赖 levels.js 内嵌 solutionMoves，Δ6
- **Polish（Phase 7）**: 依赖 T058/T059 完成
- **M3.6 内部顺序（Δ15 钉死）**: T052h（redisperse 迁移——唯一改 levels.js）→ T052i（箭头+图标链）/ T052j（背景链）可并行开发但合入在 T052h 后 → T052k（检查点）收口

### User Story Mapping

- **US1（P1 核心循环）** → M1: T008~T022
- **US2（P1 60 关系统）** → M3: T040~T052
- **US3（P2 四大机制）** → M2: T023~T029, T033, T034, T036~T038（+T039 共享）
- **US4（P3 道具+调试面板）** → M2 道具: T030~T032, T035（+T039 共享）；M4 面板: T053~T059
- **US5（P2 万物出发表现层）** → M3.5: T052a~T052g（FR-033→T052a/T052c、FR-034→T052b、FR-035→T052d、FR-036→T052e、FR-037→T052f、SC-007/008→T052g）；Δ15 增量 → M3.6: T052i/T052j（FR-033 §6/FR-034 §3/FR-035 §3 贴图链与箭头重做）
- **US2（P1 60 关系统）Δ15 增量** → M3.6: T052h（FR-029 §1~§6 空间打散迁移 + FR-030/FR-011 聚散度指标）；SC-006 重定义 → T052k
- 故事并行性受里程碑门约束（US2 依赖 US3 规则冻结——**玩法机制先于量产**，Core-First Levels-Later；US5 表现层后置于量产完成——Presentation-Last）

### Within Each Milestone

- RulesEngine 链内任务（同文件）严格顺序执行（无 [P]）
- Renderer/Audio/levels 数据任务可 [P] 并行（契约驱动，不依赖引擎实现细节）
- 自测（T038）与检查点（T022/T039/T052/T052g/T052k/T058）永远最后

### Parallel Opportunities

- Phase 2: T005 / T006 / T007 三任务并行（不同文件）
- M1: T016（花色表/Canvas 基建）、T018（音效）、T019（烟雾关数据）与引擎链 T008~T013 并行
- M2: T034（机关视觉）、T035（暂存 UI）、T036（机制音效）、T037（测试关）与引擎链并行
- M3: T040（参数表）与 Solver 链 T041~T044 并行；T050/T051（前端）与 tools/ 并行
- M3.5: T052a/T052b/T052d/T052e/T052f 五任务并行（不同文件/不同关注点——bestiary.js 新文件、BoardRenderer 底座、BoardRenderer+CSS 背景、main.js+CSS 横幅、SoundManager BGM；T052b 消费 T052a 的 Sprite 接口可先行契约开发）；T052c（映射断言）依赖 T052a 完成后收口
- M3.6: T052i（BoardRenderer 角标+图标链 + bestiary.js Emoji 表）与 T052j（backdrops.js/BoardRenderer 背景链）并行（不同渲染管线；BoardRenderer 共享文件内改动点不重叠——角标绘制 vs 背景绘制层）；两者可先行契约开发但**合入顺序在 T052h 迁移之后**；T052k 检查点最后
- M4: T053（面板容器）与 main.js 链并行
- Phase 7: T060 / T061 / T062 并行

---

## Parallel Example: Milestone 1

```text
# 引擎链（顺序执行，同一文件）:
T008 init/canTap → T009 射线行走 → T010 Dock/三消 → T011 terminal
→ T012 snapshot → T013 validateLevel

# 同时启动（不同文件、契约驱动、可并行）:
T016 BoardRenderer 基建+8 花色表   (src/render/BoardRenderer.js)
T018 SoundManager 核心音效          (src/audio/SoundManager.js)
T019 手工烟雾关 3~5 个              (src/data/levels.js)

# 汇合与集成:
T014/T015 GameState（依赖引擎 API）→ T020/T021 main.js 集成 → T022 M1 验收门
```

---

## Implementation Strategy

### MVP First（M1 Only）

1. Phase 1 + Phase 2 → file:// 零报错的命名空间骨架
2. M1 全部任务 → T022 验收 → **可玩 MVP**（US1 完整核心循环 + 烟雾关通关）
3. **STOP and VALIDATE**: 此时即可部署/演示核心玩法

### 里程碑增量交付（严格门禁，Core-First Levels-Later, Presentation-Last）

1. M1 核心循环 → 验证 → M2 四机制+道具 → `--engine-selftest` 全绿 → **⛔ 规则冻结**
2. **冻结后** M3 流水线量产 50→60 关 → Solver 门禁 60/60 + 曲线门 → 完整关卡系统交付
3. M3.5 万物出发表现层（45 图鉴/底座/20 景背景/横幅/BGM）→ render-selftest + 表现层门 → 视听体验升级交付（levels.js 恒不变）
4. M3.6 Δ15 增量（T052h 花色重打散迁移 → T052i/T052j 贴图双兜底与箭头重做 → T052k 门）→ 空间打散达标 + 视觉升级交付（FR-031 重验后 levels.js 再冻结）
5. M4 调试面板/Bot → SC-002 评审效率实证 → Q8 扩容钻探 → 回滚恢复 60 关
6. Phase 7 红线审计 + 全量 SC 勾验 → 终交付

### 返工规则（FR-031 变更协议）

任何 `src/data/levels.js` / `tools/level-config.js` / `src/core/RulesEngine.js` 变更 → **必须**重跑 `node tools/generator.js` + `node tools/solver.js` 全量重验并更新 solver-report.json 方可合入（提交信息附摘要）。

---

## Notes

- [P] = 不同文件、无未完成任务依赖；**里程碑门禁优先于一切 [P]**
- [Story] 标签映射 spec.md 用户故事；Setup/Foundational/Polish 无标签（横切）
- 每任务或逻辑组完成后 commit；检查点任务须附执行证据（命令输出/场景截图）
- 测试 = D-14 三层（Solver 门禁 / --engine-selftest / quickstart 人工场景）——零测试框架、零 npm 依赖
- M3 起 `src/data/levels.js` 为生成工件，**禁止手改**（变更仅经流水线，FR-031）；M3.6 的 redisperse-60 为唯一合法一次性迁移通道（Δ13 铁律受控让位——迁移后铁律即恢复）
- 贴图资产纪律（Δ15/宪章 III v2.0.0）: `assets/` 目录为可选增强——核心代码零强制二进制依赖（空 assets 完整可玩为交付验收红线）；Emoji 兜底严禁 ctx.arc 手绘圆球加黑点；贴图加载 MUST 用 Image 元素相对路径（file:// 与静态服务一致）
- 任务描述已内嵌契约关键数值（花色表/方向编码/反射表/预算/权重/CLI 参数等）；与契约冲突时以 contracts/ 四文档为准
- 执行任何任务前先核对宪章红线清单（constitution.md「技术边界与验收红线」表）
