# Implementation Plan: Slide & Triple（滑块三消）— 完整 H5 游戏与 60 关递进关卡系统（Δ13 扩容后）

> **Propagated**: 2026-10-20 — Δ14（US5《万物出发！》）refine 传播：新增架构增量 Δ14a~Δ14d 与 Milestone 3.5（万物出发表现层）、SC-007/008 验收口径及结构/依赖同步；既有架构描述与 M1~M4 里程碑零删除（外科手术式增量）。

**Branch**: `001-slide-triple-match-core` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-slide-triple-match-core/spec.md`，叠加用户规划指令（四阶段里程碑策略、可扩展关卡架构、机制边界收敛与交互修正、轻量级目录结构），详见「架构决策与 Spec 增量」一节；2026-10-20 增补 Δ14 refine 传播（US5 万物出发——M3.5 表现层）。

## Summary

构建零构建链的纯 Web H5 游戏《Slide & Triple》：9:16 竖屏棋盘上，玩家点击带方向箭头的滑块——射线畅通则飞出棋盘进入 7 格收集槽，同花色凑三即消；配合齿轮旋转、冰封、钥匙锁链、棱镜折射四大机制与三种局内道具，由 Node 离线流水线（逆向生成器 + 回溯求解器）量产并 100% 验证 60 个标准关卡（Δ13 增量扩容: 原 50 关 100% 保留 + 10 新关拼接; 可经参数表无缝扩容至 100+），前端运行时零生成逻辑、零外部资源、双击 index.html 即可游玩。

技术路径：前端为原生 HTML5 + CSS3 + 经典 `<script defer>` 加载的 ES2020+ 代码（单全局命名空间 `STM`，保证 file:// 协议零跨域报错，见研究决策 D-01）；规则引擎 `src/core/RulesEngine.js` 为前后端共用纯函数模块（游玩与求解口径 100% 一致）；关卡数据为带预计算最优解 `solutionMoves` 的静态 JS 配置数组。实施按 **M1 核心循环 MVP → M2 四大机制与道具（冻结规则引擎）→ M3 离线流水线量产 50→60 关（Δ13 增量扩容）→ M3.5 万物出发表现层（45 种图鉴 / 20 景背景 / 激励横幅 / BGM——纯渲染与音频层，Δ14）→ M4 调试面板 / Bot / 无缝扩容验证** 「四阶段 + 表现层」推进（Core-First, Levels-Later, Presentation-Last）。

## Technical Context

**Language/Version**: 浏览器端 JavaScript（ES2020+ 语言特性；classic script 加载，禁用 import/export 语法，见 D-01）；离线工具 Node.js ≥ 18（CommonJS，零 npm 依赖）。

**Primary Dependencies**: 运行时零第三方依赖。仅平台 API：Canvas 2D、Web Audio API、PointerEvents、localStorage、URLSearchParams、structuredClone、document.visibilityState（Δ14 BGM 失焦联动）。离线工具仅用 Node 内置模块（fs / path / process）。

**Storage**: 玩家进度 localStorage（try/catch 防护，见 D-03）；关卡数据纯静态 `src/data/levels.js`（生成工件，随仓库交付）；验证报告 `tools/solver-report.json`（生成工件）。

**Testing**: 三层、零测试框架（零构建约束，见 D-14）：
1. `node tools/solver.js` — 全量可解性验证 + 数据契约校验，exit code 门禁（FR-030/FR-031）；
2. `node tools/solver.js --engine-selftest` — RulesEngine 规则不变量断言（转向/折射/级联/终局判定）；
3. [quickstart.md](quickstart.md) 人工验收场景（按里程碑分档）。

**Target Platform**: Evergreen 桌面/移动浏览器（Chrome / Edge / Firefox / Safari，含 file:// 双击直开）；Windows / macOS / Linux + Node ≥ 18（仅离线工具）。

**Project Type**: 零构建静态 H5 游戏 + Node 离线关卡流水线（Generator / Solver）。

**Performance Goals**: 首屏可交互 < 3 s（SC-003）；棋盘动效 60 fps（中端手机）；Solver 单关验证预算 2M 节点、全量 50 关 < 5 分钟（离线）；Hint 有界搜索 ≤ 100k 节点且 < 300 ms；Δ14 表现层预算：45 图案 Sprite 预渲染 + 底座重绘不降帧（棋盘满载 8×8×5 层 105 滑块稳定 60 fps）、背景层每景实例化 ≤16 ms 且低速/静态化、BGM 合成 CPU 占用 < 1%（Web Audio 调度表驱动）。

**Constraints**: file:// 协议双击零控制台报错、零跨域；运行时零网络请求、零二进制素材（SC-006）；PointerEvents 单一输入模型；前端运行时不执行任何关卡生成/全量求解逻辑（仅 M4 Hint 的有界轻量搜索例外，见 D-06）。

**Scale/Scope**: 棋盘 ≤ 8×8、滑块 ≤ 150（Δ11 大棋盘）、花色 ≤ 8、关卡交付 60（Δ13 增量扩容; 参数表可扩至 100+）；`levels.js` ≤ 330 KB（Δ13 扩容后实测 ≈315 KB）。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | 宪章原则 | 门禁要求 | 规划方案 | 判定 |
|---|---|---|---|---|
| C-1 | I 比赛对齐 | 两大价值轴外功能拒绝/记录 backlog | 范围 = 核心循环 + 50 关 + 四机制 + 道具 + 调试面板；成就/社交/商城/本地化均未纳入 | ✅ PASS |
| C-1Δ14 | I 比赛对齐（Δ14 复核） | US5 题材化 vs「去美术化」 | **用户裁定放宽**（spec 假设区记录）：题材仅落地为程序化绘制/合成的图案/背景/音频表现层，无剧情文本/世界观叙事/角色对话——宪章 I 的叙事包装禁项仍零触碰；宪章 III 技术红线零突破（仍零外部资源） | ✅ PASS（附用户裁定注记） |
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
| Δ14a | **45 种图鉴池与三阶段单关抽样**（原 refine 指令 Δ7） | FR-033 | 三大生态阶段各 15 种（陆地萌宠 L1~21 / 碧海飞羽 L22~42 / 奇幻远航 L43~60，Suit 0~44）；**渲染层映射，不改写 levels.js 的 suit 字段与花色数 K（FR-033 §3 消解——FR-008 的 3~8 与 Δ13 保留铁律不变）**；阶段边界按关卡 id 区间判定（严禁读 level.chapter——chapter 分段 L1-20/21-40/41-60 与图鉴阶段不重合，L21/L41/L42 会错位）；确定性映射：seed = level.id + 阶段号可复现，同关内 suit→图案唯一 | M3.5 |
| Δ14b | **3D 奶油白底座 + 边缘流光角标 + 离屏 Sprite 缓存**（原 Δ8） | FR-034 | 1:1 奶油白 3D 圆角正方体底座（底部厚度阴影 + 纯白高光内倒角）+ 多层金字塔阶梯偏移投影；**移除左上角圆圈指示器与面部半透明箭头圆圈**，改为朝向侧边缘内嵌流光胶囊方向角标（图案居中零遮挡）；45 种图鉴图案离屏 canvas 预渲染成 Sprite 缓存（按需绘制一次、会话内复用，60 fps 预算）；机制标记位置与新底座兼容 | M3.5 |
| Δ14c | **20 景生态背景插画池**（原 Δ9） | FR-035 | 20 套多层 SVG/Canvas 程序化生态风景（阳光牧场/花海/麦田 → 海滩/珊瑚湾/彩虹谷/云海 → 热气球晨光/海港/星河/云海金顶）；绑定 `cycleIndex = Math.floor((level.id - 1) / 3)`（0~19 严格一一对应，同一循环 3 关共享）；背景层与棋盘层间半透明蒙版/暗角保棋盘可读性；零外部图片（宪章 III） | M3.5 |
| Δ14d | **Web Audio 治愈系 BGM 与困难关横幅**（原 Δ10） | FR-036 / FR-037 | 大调五声音阶柔和木琴/和弦循环 BGM（C D E G A，程序化合成、4~8 小节循环）；首次交互后自动播放（autoplay 政策合规）、音效开关同步静音联动、页面失焦暂停；挑战位关开局 1.6 秒绿金横幅（集合 = L3 ∪ (id-4)%3==2 位，共 20 关；XX% = 难度指标确定性函数） | M3.5 |

> **建议**：`spec.md` 应同步小修 FR-014 / FR-024-3 / FR-026 / FR-006 表述以消除文档间歧义（可经 `/speckit-clarify` 编回）。本计划与全部契约文档已按上表口径编写，`/speckit-tasks` 生成任务时以此为准。
>
> **Δ14 传播注记（2026-10-20）**: 原 refine 指令的 Δ7~Δ10 编号与实现期变更记录（Δ7 多层堆叠 / Δ8 分层阻挡 / Δ9 暂存区移除 / Δ10 无锁连点）全局命名空间冲突，四项增量顺延编入 spec Δ14 名下为 Δ14a~Δ14d（内容一一对应）。Δ14 系**纯渲染与音频层**增量：RulesEngine 规则语义、Solver 口径、levels.js 关卡数据（suit 字段/花色数/坐标/solutionMoves）**零变更**（FR-032/FR-031/Δ13 保留铁律不破）；US5 题材化对宪章原则 I「去美术化」的放宽已由用户裁定并记录于 spec 假设区（技术红线零突破——仍零外部资源、程序化绘制/合成）。

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
├── main.js                 # 应用入口：boot、PointerEvents 绑定、道具栏、调试面板控制、Bot/Hint 调度；Δ14: 挑战关激励横幅调度（1.6s 非模态）与 BGM 首次交互启动
├── core/
│   ├── GameState.js        # 会话状态机：棋盘/Dock/Staging/Undo 快照栈/胜负与死局判定调度/事件分发
│   └── RulesEngine.js      # 前后端共用纯函数规则引擎（UMD 双导出）：射线、棱镜、齿轮、破冰、解锁、三消、终局（Δ14 零变更——图鉴/背景/横幅/BGM 均不触碰）
├── render/
│   ├── BoardRenderer.js    # Canvas 2D：8 种无障碍高对比花色（颜色+图形双编码）、箭头、机关、粒子动效；Δ14: 45 种图鉴 Sprite 绘制与缓存、3D 奶油白底座与流光角标、20 景生态背景层（M3.5 落点）
│   └── bestiary.js         # Δ14（M3.5）: 45 种生灵/载具矢量图鉴定义（每图案独立绘制函数）+ 阶段花色映射表（确定性抽样）——纯数据+纯函数，BoardRenderer 消费
├── audio/
│   └── SoundManager.js     # Web Audio API 纯代码合成音效（事件驱动、惰性初始化）；Δ14: 治愈系五声音阶循环 BGM 合成器（专用 gain 节点、开关/可见性联动）
└── data/
    └── levels.js           # 生成工件：LEVELS 数组（含 metrics 与 solutionMoves）；M1/M2 为手工烟雾/机制测试关，M3 起由工具导出（Δ14 后逐字节不变——图鉴映射纯落渲染层）
tools/
├── level-config.js         # 可扩展章节参数矩阵 CHAPTERS + 预算/评分权重（前端永不引用）
├── generator.js            # 逆向发牌生成器（require solver.js；导出 levels.js）
├── solver.js               # 回溯求解器（require ../src/core/RulesEngine.js；导出 solver-report.json；--engine-selftest）
└── solver-report.json      # 生成工件：50/50 可解性验证报告（随仓库交付）
```

**Structure Decision**: 采用用户指定的轻量级单页结构（Option 1 变体）：前端 6 个运行时文件 + 1 个样式文件，无目录层级冗余；`tools/` 为宪章唯一允许的 Node 离线工具区。`levels.js` 与 `solver-report.json` 为生成工件但随仓库交付（供 file:// 直开与 FR-031 复验）。测试不设独立目录——以 Solver 验证/自测模式 + quickstart 场景承载（D-14）。Δ14 唯一新增运行时文件 `src/render/bestiary.js`（45 图案定义 + 阶段映射表——图案量使单文件膨胀，独立成模块维护；仍 classic script + `STM.Bestiary` 挂载，加载序插在 BoardRenderer 之前）。

**脚本加载顺序（index.html 内固定）**: `src/data/levels.js` → `src/core/RulesEngine.js` → `src/core/GameState.js` → `src/render/bestiary.js`（Δ14）→ `src/render/BoardRenderer.js` → `src/audio/SoundManager.js` → `src/main.js`，全部 `<script defer>`；各文件向 `window.STM` 命名空间挂载（契约见 [contracts/game-session.md](contracts/game-session.md)）。

## Milestones（「四阶段 + 表现层」实施策略：Core-First, Levels-Later, Presentation-Last）

> 阶段间为**冻结门**关系：M2 结束冻结 RulesEngine 语义（M3 的 Generator/Solver 依赖冻结口径，规则再变更须全量重跑流水线并重验 50 关）。M3.5 为纯渲染与音频层（Δ14——规则语义、Solver 口径、levels.js 关卡数据零变更），插于 M3（60 关量产完成）与 M4（调试面板）之间。

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

**验收门（→ M3.5）**：SC-001（60/60 报告——Δ13 扩容后）、SC-004（曲线量化验证）、US2-AC1~AC5 全过。

### Milestone 3.5 — 万物出发：题材、视觉、背景与 BGM 全面升级（对应 US5 + Δ14a/Δ14b/Δ14c/Δ14d，Priority: P2）

**目标**：题材与视听表现层全面升级——45 种动态生灵/载具图鉴、3D 奶油白底座与流光角标、20 景生态背景、挑战关激励横幅、程序化治愈系 BGM；**纯渲染与音频层，规则语义与关卡数据零变更**。

- **图鉴与映射（FR-033）**：45 种程序化矢量图鉴定义（三大生态阶段各 15 种，Canvas 2D 绘制、每图案独立绘制函数）；**渲染层阶段花色映射表**——按关卡 id 区间（L1~21 / L22~42 / L43~60，严禁读 `level.chapter`）+ 确定性抽样（seed = f(level.id, 阶段号)）将关卡实际花色数 K（3~8 不变）映射到图鉴池 K 个图案；同关内 suit→图案唯一、可复现；`levels.js` 的 suit 字段/坐标/solutionMoves **逐字节不变**（Δ13 保留铁律，SC-007 验收）。
- **底座与方向标识（FR-034）**：1:1 奶油白 3D 圆角正方体底座（底部立体厚度阴影 + 纯白高光内倒角）；多层堆叠（1~5 层）向左上角微量阶梯偏移 + 层间阴影（金字塔式空间立体感）；**移除左上角圆圈指示器与面部半透明箭头圆圈**，方向改为朝向侧边缘内嵌流光胶囊角标（程序化渐变流光动画），图案居中零遮挡；45 图案离屏 canvas Sprite 预渲染缓存（60 fps 预算——T016/T-M15.3 旧水果花色表与胶囊箭头徽章由本层取代，逻辑编码 suit 值不变）。
- **生态背景（FR-035）**：20 套多层程序化生态风景（Canvas/内联 SVG + 渐变；Cycle 1~7 陆地风光 / 8~14 蔚蓝天地 / 15~20 远航胜景），`cycleIndex = Math.floor((level.id - 1) / 3)` 严格绑定（同循环 3 关共享）；棋盘层半透明蒙版/暗角保可读性；背景层与渲染循环分层（背景低速重绘或静态化，滑块层照常 60 fps）。
- **激励横幅（FR-036）**：挑战位关（集合 = L3 ∪ (id-4)%3==2 位，共 20 关）开局 1.6 秒屏幕中央绿金横幅「🔥 挑战关卡！只有 XX% 的玩家能一次通过这一关」；XX% = 关卡难度指标确定性函数（同关恒定）；非模态（不阻塞输入、不冻结 rAF）。
- **治愈系 BGM（FR-037）**：SoundManager 扩展 Web Audio 大调五声音阶（C D E G A）柔和木琴/和弦循环合成器；首次交互（PointerEvent/keydown）后自动播放（autoplay 政策合规——首次交互前 MUST NOT 发声）；音效开关同步静音联动；visibilitychange 失焦暂停/恢复续播；BGM 音色与既有 SFX 振荡器链路隔离（BGM 专用 gain 节点）。
- **验证策略**：`tools/render-selftest.js` 扩展 Δ14 断言组（图鉴映射确定性/同关同图案/阶段边界正确/Sprite 缓存命中/底座几何有限性/背景 cycleIndex 绑定/横幅非模态）+ `--engine-selftest` 全量回归（规则口径零漂移证明）+ quickstart Δ14 场景组（SC-007/SC-008 人工验收）。

**验收门（→ M4）**：SC-007（图鉴渲染一致性 + levels.js 字节级不变）、SC-008（20 景对应 0 遗漏 0 冲突 + 横幅 20/20 + BGM autoplay 合规）全过；US5-AC1~AC8 全过；`--engine-selftest` 与 render-selftest 全绿；FR-031 不触发（纯渲染层，levels.js 零变更以 git diff 佐证）。

### Milestone 4 — 调试面板、Auto-Play Bot 与无缝扩容（对应 US4 面板 + Δ4/Δ6）

**目标**：评审效率层 + 扩容能力实证（M3.5 表现层完成后进行——横幅/BGM 与面板 UI 互不干扰已就绪）。

- 调试面板：1~`LEVELS.length` 动态下拉跳关、重置、Hint（高亮脉冲）、Auto-Play（600 ms/步、可被玩家输入打断）、难度评估分/量化指标/机制标签展示；移动端抽屉隐藏/唤出。
- Hint/Bot 策略（D-06）：在轨回放 `solutionMoves`；偏离时有界 DFS（预算 100k 节点）；Bot 兜底重置重放。
- **扩容验证钻探（不进入交付物）**：临时向 `CHAPTERS` 追加第 6 章条目 → 重新生成 → 验证下拉框/进度/自动进关/终局零代码自适应 → 回滚配置并恢复 50 关（quickstart Q8）。
- 终验：SC-001~SC-008 全量扫尾 + 红线审计（quickstart Q9）。

**验收门（交付）**：SC-002（10 分钟遍历 60 关 + ≥10 关机制深验——Δ13 扩容后）、SC-003、SC-006、SC-007/SC-008（Δ14 复扫）；宪章红线清单零违规。

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
- **levels.js 只读**：前端对其零写入；变更仅经流水线（FR-031）。**Δ14 边界（FR-033 §3）**：Bestiary 阶段映射表只读 levels.js（level.id 与 tiles[].suit），输出渲染图案——绝不写回关卡数据；图鉴/背景/横幅/BGM 模块均以「纯表现层」身份旁挂于事件流（消费 GameState 事件 + 渲染层数据），不反向触碰 RulesEngine/GameState 规则路径。
- **RulesEngine 零依赖渲染层**：Bestiary/背景/横幅/BGM 任何缺陷均不得影响判定（隔离方向单向——引擎→渲染）。

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
| C-3 Δ14 复核 | US5 全部素材仍程序化：45 图鉴=Canvas 矢量函数、20 背景=Canvas/SVG+渐变、BGM=Web Audio 合成；零 .png/.jpg/.mp3/.wav（SC-006 延续，SC-007 佐证）。✅ |
| C-5 可解性铁律 | [level-pipeline.md](contracts/level-pipeline.md) 定义三重验证、指标口径、报告 schema 与 FR-031 门禁；[level-data.md](contracts/level-data.md) 固定 metrics 契约。✅ |
| C-6 调试面板 | [game-session.md](contracts/game-session.md) §7 面板功能集与 `LEVELS.length` 动态化。✅ |
| 结论 | 设计后无新增违规；D-01 解释（Complexity Tracking 单行）为唯一已论证偏离，不构成实质违宪。 |

**Status**: PROPAGATED 2026-10-20（Δ14→M3.5 表现层已同步）| READY FOR `/speckit-tasks`（增量任务由 refine-propagate 直接写入 tasks.md Phase 5.5）
