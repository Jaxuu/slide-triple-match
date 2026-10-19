---
description: "Task list for feature implementation（四里程碑门禁式）"
---

# Tasks: Slide & Triple（滑块三消）— 完整 H5 游戏与 50 关递进关卡系统

**Input**: Design documents from `/specs/001-slide-triple-match-core/`

**Prerequisites**: plan.md（四阶段里程碑策略 + Δ1~Δ6 架构增量）、spec.md（US1~US4 + Edge Cases）、research.md（D-01~D-15）、data-model.md（实体/不变量/状态机）、contracts/×4（rules-engine / level-data / game-session / level-pipeline）、quickstart.md（分里程碑验收场景 + 红线审计）

**Tests**: 本项目采用零测试框架三层验证（D-14，勿引入 jest/vitest 等任何 npm 依赖）：① `node tools/solver.js` 全量可解性门禁（exit code 机判）② `node tools/solver.js --engine-selftest` 规则不变量断言 ③ quickstart.md 人工验收场景。此类验证任务**非可选**——它们是 FR-030/031/SC-001 的交付物，已按里程碑融入任务清单。

**Organization**: 任务按 **plan.md 四阶段里程碑**（M1→M2→M3→M4）组织；用户故事标签映射进各里程碑：**M1=US1（核心循环）、M2=US3+US4 道具（机制/道具+规则冻结）、M3=US2（50 关量产）、M4=US4 面板（调试面板/Bot/扩容）**。里程碑间为**冻结门**关系：上一 Checkpoint 未全过，禁止开始下一阶段任务——尤其 M3 大批量量产严禁在 M1/M2 未验证前提前执行。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成任务依赖；**里程碑门禁优先于一切 [P]**）
- **[Story]**: 用户故事（US1/US2/US3/US4；Setup/Foundational/Polish 阶段无标签）
- 任务描述内嵌契约关键数值，便于直接执行；与契约冲突时以 contracts/ 四文档为唯一真源

## Path Conventions（零构建静态 H5 + Node 离线工具）

- 前端运行时: `index.html`, `css/style.css`, `src/main.js`, `src/core/GameState.js`, `src/core/RulesEngine.js`, `src/render/BoardRenderer.js`, `src/audio/SoundManager.js`, `src/data/levels.js`
- 离线工具（Node ≥18 CommonJS，前端永不引用）: `tools/level-config.js`, `tools/generator.js`, `tools/solver.js`
- 生成工件（随仓库交付）: `src/data/levels.js`（M3 起整体再生成）, `tools/solver-report.json`
- 仓库**不得出现** package.json / node_modules / 构建配置（宪章 II / level-pipeline.md §4）

## 架构增量 Δ1~Δ6 落点追溯表

| 增量 | 口径摘要 | 落点任务 |
|---|---|---|
| Δ1 机制 A 仅齿轮滑块 | 十字相邻成功飞出触发原地顺时针 (d+1)%4；**地面转向垫载体取消** | T023, T034, T037, T046 |
| Δ2 机制 D 棱镜定型 | `/`、`\` 反射表；单次飞出至多 1 次折射；折射后受阻弹回；Generator 拒绝对射 | T026, T034, T046, T047 |
| Δ3 暂存区交互修正（**已被 Δ9 撤销**） | 原设计「道具移 Dock 前 k≤3 入暂存区+取消自动回填」——试玩发现点击暂存滑块触发复制分身 Bug 破坏花色守恒 + 视觉冗余 → **暂存区与「移出槽位」道具整体移除**（Δ9）；道具仅 Undo/Wrench；胜利=棋盘+Dock 全清空 | T030, T032, T035, T038 |
| Δ4 LEVELS.length 动态化 | 深链/进度钳制/自动进关/跳关下拉/终局判定全部动态读取，扩容零前端改动 | T020, T050, T051, T054, T059 |
| Δ5 参数表驱动生成 | `CHAPTERS` 可扩展数组，追加条目即新增章节 | T040, T059 |
| Δ6 solutionMoves 预计算 | Solver 最优解内嵌 levels.js，Hint/Bot 零延迟回放 | T049, T055, T056 |

## 里程碑门禁总览（执行纪律）

| 门 | 位置 | 核心判据 | 未过禁止 |
|---|---|---|---|
| M1 验收门 | T022 | US1-AC1~AC5 + quickstart Q1.1~Q1.7 + file:// 零控制台报错 | 开始 M2 |
| **M2 冻结门（FREEZE）** | T039 | US3-AC1~7、US4-AC1~3 + Edge Cases 复现 + `--engine-selftest` 全绿 | **开始 M3 量产（严禁提前生成大批量关卡）** |
| M3 量产门 | T052 | SC-001 50/50 + SC-004 曲线门 + US2-AC1~AC5 | 开始 M4 |
| M4 交付门 | T058 + T062/T063 | SC-002/003/006 + 宪章红线零违规 | 交付 |

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

---

## Phase 5: Milestone 3 — 离线 Generator/Solver 与 50 关量产（User Story 2，Priority: P1）

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

## Phase 6: Milestone 4 — 调试面板、Auto-Play Bot 与无缝扩容（User Story 4 面板部分，P3）

**Goal**: 评审效率层（FR-027/028）+ 扩容能力实证（Δ4/Δ6）

**Independent Test**: 任意关打开面板验证跳关/Hint/Bot/难度指标/机制标签/移动抽屉；Q8 钻探验证零代码扩容

- [ ] T053 [P] [US4] Implement 调试面板容器 in index.html + css/style.css: PC（≥1024px）右侧 320px 侧栏常驻；移动端底部抽屉（translateY 收展，DOM 常驻避免重排棋盘）；收起不影响游玩布局（FR-028/D-13）
- [ ] T054 [US4] Implement 跳关与重置 in src/main.js: 关卡下拉框 1~`LEVELS.length` **动态选项**（Δ4——配置扩至 100+ 关零代码适配）；选择即 createSession(LEVELS[N-1]) 加载；重置=session.reset()
- [ ] T055 [US4] Implement Hint in src/main.js: on-rail（session.onRail()）→ 高亮 solutionMoves[stepIndex].t 滑块（脉冲描边动画）；off-rail → 有界 DFS（预算 100k 节点/~300ms 时限，复用 T033 搜索器，动作集与 Solver 同构）首步高亮；搜索失败→启发式建议（能飞出且降低槽压力的 tap）+「非保证」标记
- [ ] T056 [US4] Implement Auto-Play Bot in src/main.js: on-rail 逐 tap 回放（600 ms/步、botTick 音效）；**玩家 pointerdown 立即打断**；off-rail 有界续解→失败则兜底 reset 重放整条 solutionMoves（保证「直至该关胜利」）；终态自动停
- [ ] T057 [US4] Implement 关卡信息展示 in src/main.js: metrics 全字段（minMoves/solutionCount/dockPeak/mechCount/difficultyScore/openSuitsMax）+ 机制标签动态计算（齿轮/冰封/锁链/棱镜+破冰口径，按 tiles/prisms/cfg 实际出现）+ 音效开关（SoundManager.setMuted）
- [ ] T058 [US4] **Checkpoint M4（功能门）**: quickstart Q4.1~Q4.7 逐条通过（跳关/Hint 在轨与偏离两态/Bot 演示+玩家打断/指标与机制标签/移动端抽屉收展/SC-002 计时/SC-003 首屏）；US4-AC4~AC7 全过；**SC-002: 跳关+自动演示 10 分钟内遍历 50 关 + ≥10 关机制深度人工验证**
- [ ] T059 [US4] Execute Q8 无缝扩容钻探（**钻探配置不进入交付物**）: 临时向 tools/level-config.js CHAPTERS 追加第 6 章条目（levels:[51,60], grid:[8,8] 等）→ `node tools/generator.js --chapters 6 --seed 2026` 生成 60 关 → `node tools/solver.js` 60/60 门禁通过 → 浏览器验证: 下拉框出现 51~60 选项、通关 L50 自动进 L51、L60 通关触发全通关终局、进度对象零迁移自适应（**全部零前端代码修改——Δ4+Δ5 实证**）→ 回滚配置 → 重跑生成恢复 50 关交付物 → solver 全量重验

---

## Phase 7: Polish 与交付终验（跨故事横切）

**Purpose**: 横切质量、性能与宪章红线审计

- [ ] T060 [P] Performance & size sweep 全项目: SC-003 首屏可交互 <3s（冷启动清缓存，主流桌面+手机浏览器）；src/data/levels.js ≤200KB（level-data.md §4 规模预算）；棋盘动效 60fps 抽查（中端手机档）；Hint 响应 ≤300ms 实测（level-pipeline.md §5 校准项收敛）
- [ ] T061 [P] Code cleanup in src/, index.html, css/style.css: 死代码/console 噪音清零；四契约 API 逐一对齐复核（导出名/签名/加载序/UMD）；grep 复查无 touchstart/mousedown/mouseup/touchend、无 import/export 语法（classic script 约束）；变更后 quickstart 抽查回归
- [ ] T062 [P] Q9 宪章红线审计 全仓库: 无 package.json/node_modules/构建配置；index.html 无 type="module"、无动态 import/fetch；文件类型扫描无二进制（.png/.jpg/.mp3/.wav/.woff 等零命中，SC-006）；关卡来源=levels.js 头注释生成元数据+tools/solver-report.json 在库（宪章 V）；file:// 双击可玩（宪章 II 交付红线）
- [ ] T063 Final delivery check 全项目: quickstart Q0~Q9 全场景终扫；levels.js 与 solver-report.json 同批次 metrics 交叉一致（验收检查项）；SC-001~SC-006 全量勾验（含 SC-005 首点 30s 路径复核）；确认 tasks.md 全项勾选

---

## Dependencies & Execution Order

### 里程碑门禁（硬顺序，覆盖一切并行）

Phase 1 → Phase 2 → **M1（T022 验收门）** → **M2（T039 冻结门 FREEZE）** → **M3（T052 量产门）** → **M4（T058 功能门 + T059 扩容钻探）** → Phase 7（T063 交付门）

- **⛔ 核心纪律**: M2 冻结门前**禁止**执行 T045 及之后的量产任务——Generator/Solver 与前端共用同一 RulesEngine 物理文件（D-02/FR-032），规则未冻结即量产 = 口径漂移 → 按 FR-031 全量重跑重验
- M1/M2 手工测试关（T019/T037）允许在门内先行（小规模、schema 与最终契约一致、M3 起被流水线整体替换）

### Phase Dependencies

- **Setup（Phase 1）**: 无依赖，立即开始
- **Foundational（Phase 2）**: 依赖 Phase 1；**阻塞全部里程碑**
- **M1（Phase 3）**: 依赖 Phase 2 完成
- **M2（Phase 4）**: 依赖 T022（M1 验收门）
- **M3（Phase 5）**: 依赖 T039（M2 冻结门）；性能预算=Solver 单关 2M 节点、全量 50 关 <5 分钟
- **M4（Phase 6）**: 依赖 T052（M3 量产门——Hint/Bot 依赖 levels.js 内嵌 solutionMoves，Δ6）
- **Polish（Phase 7）**: 依赖 T058/T059 完成

### User Story Mapping

- **US1（P1 核心循环）** → M1: T008~T022
- **US2（P1 50 关系统）** → M3: T040~T052
- **US3（P2 四大机制）** → M2: T023~T029, T033, T034, T036~T038（+T039 共享）
- **US4（P3 道具+调试面板）** → M2 道具: T030~T032, T035（+T039 共享）；M4 面板: T053~T059
- 故事并行性受里程碑门约束（US2 依赖 US3 规则冻结——**玩法机制先于量产**，Core-First Levels-Later）

### Within Each Milestone

- RulesEngine 链内任务（同文件）严格顺序执行（无 [P]）
- Renderer/Audio/levels 数据任务可 [P] 并行（契约驱动，不依赖引擎实现细节）
- 自测（T038）与检查点（T022/T039/T052/T058）永远最后

### Parallel Opportunities

- Phase 2: T005 / T006 / T007 三任务并行（不同文件）
- M1: T016（花色表/Canvas 基建）、T018（音效）、T019（烟雾关数据）与引擎链 T008~T013 并行
- M2: T034（机关视觉）、T035（暂存 UI）、T036（机制音效）、T037（测试关）与引擎链并行
- M3: T040（参数表）与 Solver 链 T041~T044 并行；T050/T051（前端）与 tools/ 并行
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

### 里程碑增量交付（严格门禁，Core-First Levels-Later）

1. M1 核心循环 → 验证 → M2 四机制+道具 → `--engine-selftest` 全绿 → **⛔ 规则冻结**
2. **冻结后** M3 流水线量产 50 关 → Solver 门禁 50/50 + 曲线门 → 完整关卡系统交付
3. M4 调试面板/Bot → SC-002 评审效率实证 → Q8 扩容钻探 → 回滚恢复 50 关
4. Phase 7 红线审计 + 全量 SC 勾验 → 终交付

### 返工规则（FR-031 变更协议）

任何 `src/data/levels.js` / `tools/level-config.js` / `src/core/RulesEngine.js` 变更 → **必须**重跑 `node tools/generator.js` + `node tools/solver.js` 全量重验并更新 solver-report.json 方可合入（提交信息附摘要）。

---

## Notes

- [P] = 不同文件、无未完成任务依赖；**里程碑门禁优先于一切 [P]**
- [Story] 标签映射 spec.md 用户故事；Setup/Foundational/Polish 无标签（横切）
- 每任务或逻辑组完成后 commit；检查点任务须附执行证据（命令输出/场景截图）
- 测试 = D-14 三层（Solver 门禁 / --engine-selftest / quickstart 人工场景）——零测试框架、零 npm 依赖
- M3 起 `src/data/levels.js` 为生成工件，**禁止手改**（变更仅经流水线，FR-031）
- 任务描述已内嵌契约关键数值（花色表/方向编码/反射表/预算/权重/CLI 参数等）；与契约冲突时以 contracts/ 四文档为准
- 执行任何任务前先核对宪章红线清单（constitution.md「技术边界与验收红线」表）
