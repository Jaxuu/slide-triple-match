# Implementation Plan: Slide & Triple（滑块三消）— 完整 H5 游戏与 50 关递进关卡系统

**Branch**: `001-slide-triple-match-core` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-slide-triple-match-core/spec.md`，叠加用户规划指令（四阶段里程碑策略、可扩展关卡架构、机制边界收敛与交互修正、轻量级目录结构），详见「架构决策与 Spec 增量」一节。

## Summary

构建零构建链的纯 Web H5 游戏《Slide & Triple》：9:16 竖屏棋盘上，玩家点击带方向箭头的滑块——射线畅通则飞出棋盘进入 7 格收集槽，同花色凑三即消；配合齿轮旋转、冰封、钥匙锁链、棱镜折射四大机制与三种局内道具，由 Node 离线流水线（逆向生成器 + 回溯求解器）量产并 100% 验证 50 个标准关卡（可经参数表无缝扩容至 100+），前端运行时零生成逻辑、零外部资源、双击 index.html 即可游玩。

技术路径：前端为原生 HTML5 + CSS3 + 经典 `<script defer>` 加载的 ES2020+ 代码（单全局命名空间 `STM`，保证 file:// 协议零跨域报错，见研究决策 D-01）；规则引擎 `src/core/RulesEngine.js` 为前后端共用纯函数模块（游玩与求解口径 100% 一致）；关卡数据为带预计算最优解 `solutionMoves` 的静态 JS 配置数组。实施按 **M1 核心循环 MVP → M2 四大机制与道具（冻结规则引擎）→ M3 离线流水线量产 50 关 → M4 调试面板 / Bot / 无缝扩容验证** 四阶段推进（Core-First, Levels-Later）。

## Technical Context

**Language/Version**: 浏览器端 JavaScript（ES2020+ 语言特性；classic script 加载，禁用 import/export 语法，见 D-01）；离线工具 Node.js ≥ 18（CommonJS，零 npm 依赖）。

**Primary Dependencies**: 运行时零第三方依赖。仅平台 API：Canvas 2D、Web Audio API、PointerEvents、localStorage、URLSearchParams、structuredClone。离线工具仅用 Node 内置模块（fs / path / process）。

**Storage**: 玩家进度 localStorage（try/catch 防护，见 D-03）；关卡数据纯静态 `src/data/levels.js`（生成工件，随仓库交付）；验证报告 `tools/solver-report.json`（生成工件）。

**Testing**: 三层、零测试框架（零构建约束，见 D-14）：
1. `node tools/solver.js` — 全量可解性验证 + 数据契约校验，exit code 门禁（FR-030/FR-031）；
2. `node tools/solver.js --engine-selftest` — RulesEngine 规则不变量断言（转向/折射/级联/终局判定）；
3. [quickstart.md](quickstart.md) 人工验收场景（按里程碑分档）。

**Target Platform**: Evergreen 桌面/移动浏览器（Chrome / Edge / Firefox / Safari，含 file:// 双击直开）；Windows / macOS / Linux + Node ≥ 18（仅离线工具）。

**Project Type**: 零构建静态 H5 游戏 + Node 离线关卡流水线（Generator / Solver）。

**Performance Goals**: 首屏可交互 < 3 s（SC-003）；棋盘动效 60 fps（中端手机）；Solver 单关验证预算 2M 节点、全量 50 关 < 5 分钟（离线）；Hint 有界搜索 ≤ 100k 节点且 < 300 ms。

**Constraints**: file:// 协议双击零控制台报错、零跨域；运行时零网络请求、零二进制素材（SC-006）；PointerEvents 单一输入模型；前端运行时不执行任何关卡生成/全量求解逻辑（仅 M4 Hint 的有界轻量搜索例外，见 D-06）。

**Scale/Scope**: 棋盘 ≤ 8×8、滑块 ≤ 45、花色 ≤ 8、关卡默认 50（参数表可扩至 100+）；`levels.js` ≤ 200 KB。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | 宪章原则 | 门禁要求 | 规划方案 | 判定 |
|---|---|---|---|---|
| C-1 | I 比赛对齐 | 两大价值轴外功能拒绝/记录 backlog | 范围 = 核心循环 + 50 关 + 四机制 + 道具 + 调试面板；成就/社交/商城/本地化均未纳入 | ✅ PASS |
| C-2 | II Zero-Build（NON-NEGOTIABLE） | 原生 HTML5+CSS3+Vanilla JS、双击可玩、Node 仅限 Generator/Solver、前端零 Node/npm 依赖 | 无框架、无构建链、无运行时依赖；classic script + 单全局命名空间（字面 "ES6 Modules" 的解释见 Complexity Tracking）；Node 仅 `tools/generator.js` + `tools/solver.js`；levels.js 为纯静态配置 | ✅ PASS（含 1 项已论证解释） |
| C-3 | III 程序化资源 | 零图片/音频/字体文件 | 棋盘/花色/箭头/机关/粒子 = Canvas 2D + 内联 SVG + CSS 渐变；音效 = Web Audio 实时合成（D-04） | ✅ PASS |
| C-4 | IV 跨端自适应 | 9:16 锁定 + PointerEvents 单一模型 | CSS aspect-ratio 容器（D-13）；全部输入仅 pointerdown/pointerup/pointermove | ✅ PASS |
| C-5 | V 可解性铁律（NON-NEGOTIABLE） | 逆向生成或 Solver 验证、50 关 100% 可解、量化难度指标 | M3 流水线：逆向构造 → 正向自检 → Solver 门禁三重验证（D-10）；levels.js 内嵌 metrics + solver-report.json 交付 | ✅ PASS（M3 落地） |
| C-6 | VI 评委调试内置 | 跳关/重置/Hint/机制标签/难度参数、移动端可隐藏 | M4 调试面板，下拉框动态读 `LEVELS.length` | ✅ PASS |
| C-7 | 红线清单 | 框架/素材/事件模型/关卡来源四类禁项 | 见 quickstart.md 红线审计场景（Q9）；关卡来源 = 生成器 + 求解器 | ✅ PASS |

**Phase 0 结论**：无未决 NEEDS CLARIFICATION，全部经 [research.md](research.md) 决策 D-01~D-15 解决。

## Architecture Decisions & Spec Deltas（用户规划指令落地）

### Spec 增量（用户在 plan 阶段明确的架构决策，本计划及后续 tasks 以此为准）

| # | 增量 | 取代/细化的 FR | 新口径 | 实施里程碑 |
|---|---|---|---|---|
| Δ1 | **机制 A 收敛为齿轮滑块** | FR-013（保留）、FR-014（地面转向垫载体取消） | 机制 A（L6+）仅保留 Gear Tile：当其十字相邻有其他滑块**成功飞出**时原地顺时针旋转 90°；不再单独设置地面转向垫。统一「顺时针 90°」转向规则与 UI 即时可见由齿轮滑块承载 | M2 |
| Δ2 | **机制 D 定型为变向棱镜** | FR-021 / FR-022（细化，无语义冲突） | 固定格斜面反射块 `/` 与 `\` 两型；滑块冲向棱镜折射 90° 飞出；单次飞出最多 1 次折射；折射后仍有阻挡则弹回原位；Generator 拒绝对射布局 | M2 |
| Δ3 | **道具③暂存区（已被 Δ9 撤销）** | 原 FR-024-3/FR-006 扩展 | 试玩发现点击暂存滑块触发复制分身 Bug 破坏花色守恒 + 双排空槽视觉冗余 → **暂存区与「移出槽位」道具整体移除**（Δ9）；道具仅剩 Undo/Wrench 两种；胜利 = 棋盘 + Dock 全空 |清空。FR-026（暂存满道具不可用、内容可见）保留 | M2 |
| Δ4 | **LEVELS.length 动态化** | FR-027、US2-AC3 | 前端状态机、跳关下拉框、进度保存/钳制、自动进关、终局判定全部动态读取 `LEVELS.length`，默认 50、追加章节至 100+ 零代码修改 | M1（架构）+ M4（验证钻探） |
| Δ5 | **参数表驱动生成** | FR-008 / FR-009 | `tools/level-config.js` 将章节难度参数矩阵（网格、花色、滑块数、启用机制、扣命、道具、节奏模板）抽离为可扩展数组 `CHAPTERS`，新增条目即一键扩展新章节 | M3 |
| Δ6 | **solutionMoves 预计算内置** | FR-027（Hint/Auto-Play 零延迟） | `levels.js` 每关内嵌求解器输出的最优解 tap 序列；file:// 下零请求、Hint/Bot 即时响应 | M3 |

> **建议**：`spec.md` 应同步小修 FR-014 / FR-024-3 / FR-026 / FR-006 表述以消除文档间歧义（可经 `/speckit-clarify` 编回）。本计划与全部契约文档已按上表口径编写，`/speckit-tasks` 生成任务时以此为准。

### 核心架构决策（详见 research.md）

- **D-01 脚本加载**：经典 `<script defer>` + 单全局命名空间 `STM` + 共享文件 UMD 双导出 —— file:// 双击零跨域的必要条件（ES module 的 file:// 加载被 Chrome/Edge/Firefox/Safari 以 CORS 拦截）。
- **D-05 渲染分层**：棋盘单 Canvas 2D（含粒子动效）；HUD / Dock / Staging / 调试面板为 DOM + 内联 SVG。
- **D-06 Hint/Bot**：在轨状态回放预计算解；偏离状态有界 DFS（RulesEngine 同口径）；Bot 兜底重置重放，保证「直至该关胜利」。
- **D-07 Solver 规范化**：dock 顺序不参与状态哈希（tap 结局仅依赖花色计数），搜索空间大幅压缩。
- **D-10 生成器**：逆向构造 → 正向自检 → Solver 门禁三重验证，镜像逻辑错误由验证兜底。
- **D-11 单滑块单机制**：gear XOR ice XOR lock XOR key，规避规则交互矩阵爆炸。

## Project Structure

### Documentation (this feature)

```text
specs/001-slide-triple-match-core/
├── plan.md              # 本文件（/speckit-plan 输出）
├── research.md          # Phase 0 输出：15 项技术决策（D-01~D-15）
├── data-model.md        # Phase 1 输出：实体、不变量、状态机
├── quickstart.md        # Phase 1 输出：分里程碑验收场景 + 红线审计
├── contracts/
│   ├── level-data.md    # src/data/levels.js 数据契约（schema、不变量、双导出）
│   ├── rules-engine.md  # 纯函数规则引擎 API、回合管线、机制精确语义
│   ├── game-session.md  # 会话/UI/渲染/音频/调试面板/持久化接口
│   └── level-pipeline.md# 章节参数表、Generator/Solver CLI、报告 schema、质量门禁
└── tasks.md             # /speckit-tasks 输出（本命令不生成）
```

### Source Code (repository root)

```text
index.html                  # 9:16 主视口 + 调试面板骨架；按序 defer 加载全部 classic script
css/
└── style.css               # 纯 CSS 样式与动效（布局、HUD、Dock/Staging、面板、抽屉）
src/
├── main.js                 # 应用入口：boot、PointerEvents 绑定、道具栏、调试面板控制、Bot/Hint 调度
├── core/
│   ├── GameState.js        # 会话状态机：棋盘/Dock/Staging/Undo 快照栈/胜负与死局判定调度/事件分发
│   └── RulesEngine.js      # 前后端共用纯函数规则引擎（UMD 双导出）：射线、棱镜、齿轮、破冰、解锁、三消、终局
├── render/
│   └── BoardRenderer.js    # Canvas 2D：8 种无障碍高对比花色（颜色+图形双编码）、箭头、机关、粒子动效
├── audio/
│   └── SoundManager.js     # Web Audio API 纯代码合成音效（事件驱动、惰性初始化）
└── data/
    └── levels.js           # 生成工件：LEVELS 数组（含 metrics 与 solutionMoves）；M1/M2 为手工烟雾/机制测试关，M3 起由工具导出
tools/
├── level-config.js         # 可扩展章节参数矩阵 CHAPTERS + 预算/评分权重（前端永不引用）
├── generator.js            # 逆向发牌生成器（require solver.js；导出 levels.js）
├── solver.js               # 回溯求解器（require ../src/core/RulesEngine.js；导出 solver-report.json；--engine-selftest）
└── solver-report.json      # 生成工件：50/50 可解性验证报告（随仓库交付）
```

**Structure Decision**: 采用用户指定的轻量级单页结构（Option 1 变体）：前端 6 个运行时文件 + 1 个样式文件，无目录层级冗余；`tools/` 为宪章唯一允许的 Node 离线工具区。`levels.js` 与 `solver-report.json` 为生成工件但随仓库交付（供 file:// 直开与 FR-031 复验）。测试不设独立目录——以 Solver 验证/自测模式 + quickstart 场景承载（D-14）。

**脚本加载顺序（index.html 内固定）**: `src/data/levels.js` → `src/core/RulesEngine.js` → `src/core/GameState.js` → `src/render/BoardRenderer.js` → `src/audio/SoundManager.js` → `src/main.js`，全部 `<script defer>`；各文件向 `window.STM` 命名空间挂载（契约见 [contracts/game-session.md](contracts/game-session.md)）。

## Milestones（四阶段实施策略：Core-First, Levels-Later）

> 阶段间为**冻结门**关系：M2 结束冻结 RulesEngine 语义（M3 的 Generator/Solver 依赖冻结口径，规则再变更须全量重跑流水线并重验 50 关）。

### Milestone 1 — 核心循环 MVP（对应 US1 + Δ4 架构）

**目标**：可玩的基础滑块三消；交互手感定型。

- 9:16 响应式外壳（手机满视口 / PC 居中 + 预留侧栏位）、HUD（关卡、生命、连击、分数）、7 格 Dock（同花色归拢）。
- `RulesEngine`：无机关版 —— 射线行走、飞出/弹回、Dock 分组插入、三消结算、胜负/爆槽判定；`GameState`：会话状态机 + 历史快照栈（Undo 基础设施）+ 事件流。
- `BoardRenderer`：Canvas 棋盘、**全部 8 种花色**的颜色+图形双编码设计、箭头、飞出/弹回/三消动效；`SoundManager`：核心音效（点击/飞出/受阻/三消/胜负）。
- `levels.js`：3~5 个手工烟雾测试关（含 `solutionMoves`，schema 与最终契约一致）。
- 架构埋点：`LEVELS.length` 动态化（自动进关 / 进度钳制）、`?level=N` 深链。

**验收门（→ M2）**：spec US1-AC1~AC5 全过；烟雾关完整通关；file:// 双击零控制台报错；首点 30 s 内完成首次有效飞出（SC-005 路径）。

### Milestone 2 — 四大微创新机制与道具（对应 US3 + US4 道具 + Δ1/Δ2/Δ3）

**目标**：完整规则语义落地并通过全部 Edge Cases，**冻结规则引擎**。

- `RulesEngine`：齿轮旋转（十字相邻成功飞出触发）、冰封（双破冰口径 `triple`/`adjacent`）、钥匙/锁链（一钥多锁）、棱镜（`/`、`\` 折射映射表、单次折射上限、受阻弹回）；扳手/暂存区道具语义；死锁保守谓词（含道具可救性）；`validateLevel` 数据契约校验。
- `GameState`：道具次数、Undo 回滚派生变化（旋转/破冰/解锁/三消原子回滚）。（暂存区已移除——Δ9）
- 渲染：齿轮角标、冰层厚度视觉、锁链/钥匙角标、棱镜显著区分视觉、道具栏激活；（暂存区 UI 已移除——Δ9）；音效：解锁/破冰/棱镜/道具。
- `levels.js`：追加机制专项测试关（每机制 ≥1 关 + 级联/边界关，覆盖 spec Edge Cases 清单）。

**验收门（→ M3，规则冻结 FREEZE）**：spec US3-AC1~AC7、US4-AC1~AC3 全过；Edge Cases 逐条在测试关复现验证（三消优先于爆槽、原子级联与整体 Undo、死零误报等）；`--engine-selftest` 断言全绿。

### Milestone 3 — 离线 Generator/Solver 与 50 关量产（对应 US2 + Δ5/Δ6 + C-5）

**目标**：参数表驱动的可解性流水线，产出并验证 50 个标准关。

- `tools/solver.js`：迭代加深 DFS + 规范化状态去重（D-07）、最优解/解路径数/槽位压力峰值/机制数指标、`--engine-selftest`、exit code 门禁。
- `tools/level-config.js`：5 章参数矩阵（FR-008 全量数值）+ 难度评分权重 + 求解预算 + 第 5 章节奏规则（个位 4/9 挑战、5/0 解压 + 对称图案模板）。
- `tools/generator.js`：逆向构造（含机制逆操作镜像）→ 正向自检 → Solver 门禁 → 重试/降档策略（D-10）；导出 `src/data/levels.js`（含 `solutionMoves` 与 `metrics`）+ `tools/solver-report.json`；种子化可复现。
- 前端：本地进度持久化（D-03）、结果屏「下一关/重玩」、全通关庆祝终局（L=LEVELS.length 动态）。
- 质量门禁：50/50 可解；每花色计数 %3==0；最优路径开放花色 ≤5；难度曲线门（章均值不减 + 1~4 章步数回归斜率 ≥0 + 第 5 章锯齿形态）；FR-031 变更触发全量重验。

**验收门（→ M4）**：SC-001（50/50 报告）、SC-004（曲线量化验证）、US2-AC1~AC5 全过。

### Milestone 4 — 调试面板、Auto-Play Bot 与无缝扩容（对应 US4 面板 + Δ4/Δ6）

**目标**：评审效率层 + 扩容能力实证。

- 调试面板：1~`LEVELS.length` 动态下拉跳关、重置、Hint（高亮脉冲）、Auto-Play（600 ms/步、可被玩家输入打断）、难度评估分/量化指标/机制标签展示；移动端抽屉隐藏/唤出。
- Hint/Bot 策略（D-06）：在轨回放 `solutionMoves`；偏离时有界 DFS（预算 100k 节点）；Bot 兜底重置重放。
- **扩容验证钻探（不进入交付物）**：临时向 `CHAPTERS` 追加第 6 章条目 → 重新生成 → 验证下拉框/进度/自动进关/终局零代码自适应 → 回滚配置并恢复 50 关（quickstart Q8）。
- 终验：SC-001~SC-006 全量扫尾 + 红线审计（quickstart Q9）。

**验收门（交付）**：SC-002（10 分钟遍历 50 关 + ≥10 关机制深验）、SC-003、SC-006；宪章红线清单零违规。

## Data Flow & Module Boundaries

```text
[离线] tools/level-config.js ──(CHAPTERS 参数)→ tools/generator.js ──候选──→ tools/solver.js
                                        ↑ require RulesEngine（口径一致）│
                                        └──────── 验证通过 ←────────────┘
   导出: src/data/levels.js（LEVELS + metrics + solutionMoves）、tools/solver-report.json

[运行时] index.html ─defer→ levels.js → STM.LEVELS
   main.js ─(levelDef)→ GameState/GameSession ─(纯函数调用)→ RulesEngine（无状态、无 DOM/音频）
                 │                                    ↑
                 ├─ events 流 → BoardRenderer（Canvas+DOM）、SoundManager（Web Audio）
                 ├─ 快照栈 → Undo；localStorage → 进度
                 └─ 调试面板 → Hint（RulesEngine 有界搜索）/ Bot（session 公共动作 API 回放）
```

- **RulesEngine 是唯一语义源**：前端游玩、Hint、Bot 与离线 Solver 全部经由同一纯函数集合（FR-032 口径一致的实现保证）。
- **GameState 不实现规则**：只做编排（快照、次数、输入锁、事件分发、终局调度）。
- **levels.js 只读**：前端对其零写入；变更仅经流水线（FR-031）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 宪章 II 字面 "ES6 Modules"（import/export 语法）→ 采用 ES2020+ 语法 + classic script + `STM` 全局命名空间 | 宪章 II 同条同时要求「双击 index.html MUST 能直接运行」；ES module 的 file:// 加载在 Chrome/Edge/Firefox/Safari 均被 CORS 策略拦截（origin `null`），两条字面要求互斥。用户规划指令明确「file:// 协议下零跨域报错」 | 真正的 `import/export` + 强制本地静态服务：违背「双击直开」与用户 file:// 零报错要求；构建/拼接脚本：引入 Node 第三用途，违背宪章 II 的 Node 仅限 Generator/Solver |

## Phase 1 Post-Design Constitution Re-check

Phase 1 设计工件（data-model / contracts×4 / quickstart）完成后复核：

| 原则 | 复核结论 |
|---|---|
| C-2 Zero-Build | 契约 [game-session.md](contracts/game-session.md) §1 固定 classic script 加载序与 `STM` 命名空间；[level-data.md](contracts/level-data.md) 固定 levels.js 双导出（浏览器全局 + CommonJS，供 Solver 复验），前端运行时零 fetch/import 动态加载。✅ |
| C-3 程序化资源 | [game-session.md](contracts/game-session.md) §4 花色=Canvas 图形+色板、§5 音效=振荡器/噪声合成；仓库无二进制工件位。✅ |
| C-5 可解性铁律 | [level-pipeline.md](contracts/level-pipeline.md) 定义三重验证、指标口径、报告 schema 与 FR-031 门禁；[level-data.md](contracts/level-data.md) 固定 metrics 契约。✅ |
| C-6 调试面板 | [game-session.md](contracts/game-session.md) §7 面板功能集与 `LEVELS.length` 动态化。✅ |
| 结论 | 设计后无新增违规；D-01 解释（Complexity Tracking 单行）为唯一已论证偏离，不构成实质违宪。 |

**Status**: READY FOR `/speckit-tasks`
