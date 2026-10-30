# Implementation Plan — Slide & Triple / Glide Critters

**Feature Branch**: `001-slide-triple-match-core`

**Baseline**: 2026-10-30 · commit `b06fb58`（Δ33 / T115）

**Status**: **Baselined** — 本文只回答两个问题：① **现在交付了什么、它是怎么搭的**；② **下一阶段要做什么**。

**上位文件**: [spec.md](spec.md)（需求单一事实源）｜**执行清单**: [tasks.md](tasks.md)｜**历史**: [tasks-archive.md](tasks-archive.md)、`ITERATION_LOG.md`

---

## 0. 本文的定位与纪律

本文件已于 2026-10-30 执行 **Plan 重构**：删除全部「按里程碑罗列的临时实施步骤」（M1~M14 的任务级流水），重构成**双层架构**——

| 层 | 章节 | 内容性质 | 变更频率 |
|---|---|---|---|
| **L1 已交付系统基线** | 第 1 章 | 以**模块**为维度的架构设计与不变量，描述「现状」 | 仅在架构变更时更新 |
| **L2 下一阶段演进规划** | 第 2 章 | 以**优化主题**为维度的后续规划，描述「下一步」 | 每轮迭代更新 |

**纪律**：
1. L1 MUST 只描述**已在代码中生效**的设计；未落地的想法一律进 L2，MUST NOT 混入 L1。
2. 里程碑式任务流水（M1~M14 / T001~T175）不再进入本文件——已交付部分归档于 `tasks-archive.md`，未交付部分由 `tasks.md` 承载。
3. 本文件 MUST NOT 与 `spec.md` 的 FR 编号口径冲突；引用需求时使用**新编号**（映射见 spec 附录 A）。

---

## 1. 已交付系统基线（Shipped Baseline）

### 1.1 技术底座与硬约束

| 维度 | 现状 |
|---|---|
| 运行时 | 原生 HTML5 + CSS3 + ES2020 Vanilla JS，**零构建链、零运行时依赖**；单全局命名空间 `STM`，经典 `<script defer>` 按序加载（`file://` 零跨域） |
| 离线工具 | Node ≥18 + 内置模块（`fs`/`path`），零 npm 依赖：Generator / Solver / 12 个门禁脚本 |
| 交付形态 | 双击 `index.html` 可玩 + Cloudflare Pages 静态托管（`slide-triple-match.pages.dev`） |
| 资产策略 | 美术为本地可选增强（`assets/icons`、`assets/bg`，缺失走 Emoji / 程序化兜底）；音频为「8 轨资产 + Web Audio 合成」混合双轨；字体仅系统 Emoji 栈 |
| 状态持久化 | `localStorage` 双键：`slide-triple:v1`（关卡进度）/ `slide-triple:profile:v2`（昵称、头像、棱晶、画卷点亮、设置） |
| 输入模型 | 全部 PointerEvents，无 mouse/touch 分支 |

**不变量（Invariants，改动任何模块 MUST NOT 破坏）**：

- **I-1 前后端同源判定**：`RulesEngine` 为游玩与 Solver 共用纯函数模块，`玩家可玩局面集合 ≡ 求解器验证过的可解局面集合`。
- **I-2 零穿模**：所有绘制（静态 / 进场 / 飞行棋盘内段）共用同一 `(z, r, c)` 升序比较器——`(a.z-b.z) || (a.r-b.r) || (a.c-b.c)`；MUST NOT 为动画另建排序。
- **I-3 槽框冻结**：`#dock` / `.slot` 的 `border`/`padding`/`background`/`border-radius` 在飞行、消除、横幅三种演出中逐项不变；演出只作用于 `.dock-chip` 与独立叠层。
- **I-4 零杂物红线**：三消演出窗口内 `#vfx-canvas` 的 `alpha > 2` 像素数恒 0；该层只承载离场飞行段。
- **I-5 `file://` 秒开**：禁 `fetch + decodeAudioData`；贴图走 `Image` + `onerror` 降级；无模块 `import/export`。
- **I-6 纯表现层隔离**：进场、飞行、消除、横幅、飘字 MUST NOT 改变 `tiles` 的花色/方向/坐标/层号，MUST NOT 进入 Solver 动作集。

### 1.2 渲染管线（`src/render/`）

```
数据层 levels.js ──► GameState.createSession ──► BoardRenderer.draw()
                                                  │
       ┌──────────────────────────────────────────┼──────────────────────────┐
       │                     │                    │                          │
  drawBoardTile        drawTileBody        introTransformOf()        flightPos()
  (底座/箭头/机关)      (图标/压暗/厚度)     (原位对角波浪)            (U 直飞 / L·R·D 两段)
       │                     │                    │                          │
       └──────────► 统一 (z,r,c) 升序比较器 ◄─────┴──────────────────────────┘
                              │
                     #board-canvas  +  #vfx-canvas（仅离场飞行段）
```

| 子模块 | 文件 | 职责 | 关键口径 |
|---|---|---|---|
| 棋盘渲染 | `BoardRenderer.js`（2918 行） | 卡牌底座 / 箭头 / 机关标记 / 压暗 / 进场 / 飞行 / 命中测试 | 奇偶层半格坐标 `(r+0.5, c+0.5)`；压暗 `rgba(15,23,42,0.28)` 零偏移原位叠加 |
| 图鉴渲染 | `bestiary.js`（1268 行） | 96 条目定义、Emoji 码点表、程序化兜底绘制、`drawBestiaryIcon` | `tileSize × 0.93` 输出，主体长边 ≈86% 卡面 |
| 图形掩码 | `shape-masks.js`（644 行） | 36 套模板 + `build(n, z, params)` 成型规则 | 前端与离线迁移器共用同一份定义（UMD 双导出） |
| 背景 | `backdrops.js`（909 行） | 6 幅画卷贴图加载 + 程序化风景兜底 + 2×2 象限切片 | 后缀探测链 `.png → .jpg → .jpeg → .webp`，会话缓存 |
| 图标 bbox | `data/icon-bboxes.js`（96 条） | 离线扫描的 96 个正方形包围盒 | `size = max(bw,bh)`，中心扩张后夹回本格 |

**进场编舞（现行唯一口径）**：`delay = (r + c) × DIAG_STEP + z × Z_STEP`；`TILE 120 / DIAG_STEP 14~48（预算反算）/ Z_STEP 8 / TARGET 415`；`|dx| = 0`、起始缩放 `0.62`、峰值 `1.05`、`dy 12px`、`alpha 恒 1.0`、`INTRO_GATE_FRAMES = 2`（帧闸门）、`INTRO_TICK_AT = 0.85`（落牌音）。

**性能取舍记录**：编舞总时长与牌数**解耦**（`380~450ms` 恒定），代价是放弃「逐张可辨」——141 张牌保持 9ms 步长需 ≈1440ms，与预算算术互斥。零穿模不依赖步长，只依赖 I-2 比较器。

### 1.3 声学架构（`src/audio/SoundManager.js`，1168 行）

```
资产轨（HTMLAudioElement × 8）              合成轨（AudioContext）
├─ bgm_lobby  0.45  −18 LUFS                ├─ tap   提牌 12ms + 落槽 32ms（@115ms）
├─ bgm_game   0.38  −18 LUFS                ├─ knock 双叩 310/260Hz，28ms ×2
├─ sfx_shatter      −14 LUFS                ├─ dealTick 落牌涟漪 ≥45ms 节流
├─ sfx_win          −14 LUFS（延迟 250ms）   └─ iceBreak 低域水滴（禁 >1000Hz）
├─ sfx_lose         −14 LUFS
└─ sfx_voice_good|great|unbelievable  −13 LUFS
```

- **唯一参数源**：`STM.AUDIO_CONFIG`（`tap` / `knock` / `dealTickMinMs` / `bgmVolume` / `files`），门禁脚本消费同一快照，MUST NOT 在实现里另立常量。
- **预热顺序**：`sound.warmup()`（`boot()` 后首个宏任务建 `AudioContext`，`suspended`）→ 图集切片 → `startDeal()`；三者顺序是 SC-022 ⑥ 的硬门禁。
- **两套连击口径互不覆盖**：`comboCount`（表现层 5.0s 滑动窗，驱动升调与飘字）/ `iqComboActive`（IQ 乘区，受阻断连）。MUST NOT 合并或隐式同步。

### 1.4 关卡与求解器（`tools/` + `src/data/`）

| 环节 | 工具 | 产物 | 门禁 |
|---|---|---|---|
| 逆向生成 | `generator.js` | 候选布局（从清空态反推三消组） | 初始卡牌数为 3 的倍数、开放花色 ≤5 |
| 布局迁移 | `migrate-layout-72.js` + `shape-masks.js` | v2 半格错位布局（72 关全量） | 零悬空违规 = 0 |
| 求解验证 | `solver.js` | `solver-report.json` | **72/72 可解**，单关 2M 节点预算，全量 ≈43s |
| 引擎自检 | `solver.js --engine-selftest` | 规则不变量断言 | 转向 / 折射 / 级联 / 终局判定 |
| 增量扩容 | `expand-60.js` / `redisperse-60.js` | L61~L72 追加、花色空间重打散 | 既有关零改写 |

**关卡结构实测（与 spec FR-008 一致）**：72 关；L1 `5×5/K4/18 张`、L2 `6×6/K6/48 张`、L3 `7×7/K9/63 张`；L4~L72 为 `7×7` 与 `8×8`（**23 关**）交替，`K 10~24`、卡牌 `60~141` 张、层高 `zMax 1~4`；机关首现档位 齿轮 L7 / 冰封 L12 / 钥匙锁链 L22 / 棱镜 L39。

**难度指标体系**：`minMoves` / `solutionCount` / `dockPeak` / `mechCount` / `difficultyScore` / `openSuitsMax`，外加空间聚散度（三连簇 / 双连坐 / 完全分散）与瓶颈节奏（咽喉点数 / 最小可行操作集 / 最长连锁段）。

### 1.5 UI / 交互（`src/ui/` + `src/main.js`，2722 行）

| 场景 | 文件 | 设计要点 |
|---|---|---|
| 开机动画 | `splash.js` | `HooLey GAMES` 磁力弹跳 + 流光扫掠，2.0s 可跳过 |
| 主大厅 | `lobby.js`（777 行） | 六区布局；中心棱晶星盘（2×2 晶片 + 6 大陆循环浏览） |
| 弹窗 | `modals.js` | 奶油软胶卡片 + 琥珀金胶囊标题 + 棱晶拨片开关 |
| 结算 | `result.js` | 双风翼棱晶铭牌 + 头像滑板跃起 + 随机赞美词 |
| 失败 | `fail.js` | 零倒计时；`💎100` 成组净化复活 |
| 教学 | `tutorial.js` | 仅 L1/L2；闸门读 `dealRemainingMs()` |
| 调试面板 | `main.js` | 跳关 / 重置 / Hint / 自动演示 / 难度标签 / 画卷名 |

**交互契约**：进场期与横幅展示期的任意点击 MUST 被正常响应（快进而非吞掉）；`pendingShatter` → 逐张落定 → 全落定才起播消除，`700ms` 兜底。

### 1.6 线上发布与全屏 Web App

- **部署**：Cloudflare Pages 零配置静态托管（根目录即站点根，无构建命令、无环境变量），生产域名 `https://slide-triple-match.pages.dev`。
- **全屏三件套**：`apple-mobile-web-app-capable` / `mobile-web-app-capable` / `black-translucent` + `viewport-fit=cover` + `env(safe-area-inset-*)` 让位。
- **双形态一致性**：线上与 `file://` 的音频、贴图、存档行为 MUST 一致（无 fetch 依赖、无绝对路径）。

### 1.7 模块依赖地图

```
index.html
  └─ src/core/GameState.js ──► src/core/RulesEngine.js（纯函数，Solver 共用）
  └─ src/data/{levels,peak-levels,quotes,icon-bboxes}.js
  └─ src/render/{BoardRenderer,bestiary,backdrops,shape-masks}.js
  └─ src/audio/SoundManager.js
  └─ src/ui/{splash,lobby,modals,result,fail,tutorial,prism-icon}.js
  └─ src/main.js（编排层：场景机 / 事件总线 / 渲染循环 / 调试面板）
```

**边界规则**：`RulesEngine` MUST NOT 依赖 DOM 与渲染；渲染层 MUST NOT 直接改会话状态（只读 + 事件）；`main.js` 是唯一编排层，UI 模块不互相直连。

### 1.8 门禁基线（2026-10-30 实测，全部 exit 0）

| 脚本 | 断言数 | 覆盖 |
|---|---|---|
| `render-selftest.js` | **349** | 静态结构 / 常量同源 / 移除彻底性 / 样式关键帧 |
| `delta27-verify.js` | **112** | 零绘制红线（像素级）/ 纯卡牌力学轨迹 / 层次不变量 |
| `deal-smoke.js` | **63** | 帧闸门 / 对角排程 / 层序锁 / 落子音 / 快进 / 降级 |
| `flight-smoke.js` | **56** | 四向时长 / 终点精度 / 压叠零违规 / 并发 |
| `audio-smoke.js` | **98** | 参数快照 / 响度基线 / 连击分级 / 静音联动 |
| `lobby-smoke.js` | **83** | 大厅六区 / 星盘 / 经济 / 结算 / 复活 |
| `icon-bbox-audit.js` | **7** | 96 条零裁切 / 覆盖率 ≥99.5% / 占框比 ≥90% |
| `solver.js` | **72/72** | 可解性 + 难度曲线单调性（`chMonotonic` / `slope14` / `waveZigzag`） |

**反向验证纪律**：任何「删除彻底性」类断言 MUST 通过临时恢复旧实现证明其会红灯（`tools/_reverse-verify.js` 模式：从干净副本起改、补丁未命中 `exit 3`、验完 `git checkout --` 并校验 `md5sum`）。

### 1.9 需求覆盖对照（spec → plan，闭环校验）

| spec 需求 | 承载模块 | 本文件章节 |
|---|---|---|
| FR-001~FR-007 核心循环与判定 | `RulesEngine.js` + `GameState.js` | §1.4 / §1.5 |
| FR-008~FR-015 关卡与求解器 | `levels.js` + `tools/generator.js` / `solver.js` / `migrate-layout-72.js` | §1.4 |
| FR-016~FR-019 特殊机关 | `RulesEngine.js` + `BoardRenderer.js`（机关标记绘制） | §1.2 / §1.4 |
| FR-020~FR-023 道具与调试 | `main.js` + `RulesEngine.js` | §1.5 |
| FR-024~FR-030 表现层 | `BoardRenderer.js` / `bestiary.js` / `shape-masks.js` / `backdrops.js` / `style.css` | §1.2 |
| FR-031~FR-034 横幅 / 教学 / HUD / 飘字 | `main.js` + `tutorial.js` + `style.css` | §1.5 |
| FR-035~FR-038 声学 | `SoundManager.js` + `normalize-audio.js` | §1.3 |
| FR-039~FR-045 外围系统 | `splash.js` / `lobby.js` / `modals.js` / `result.js` / `fail.js` / `profile.js` | §1.5 |
| FR-046~FR-048 交付与部署 | `index.html` + 仓库结构 | §1.1 / §1.6 |

### 1.10 宪章符合性（v3.0.0）

| 原则 | 结论 | 说明 |
|---|---|---|
| I 比赛对齐 | ✅ | 两大价值轴内功能全实现；商城/成就/社交/本地化零实现，棱晶纯本地不可充值 |
| II Zero-Build | ✅ | 零框架、零构建、零 npm 运行时依赖；Node 仅限离线工具 |
| III 资产分层（v3.0.0） | ✅ | 美术本地可选 + 双兜底；音频资产轨 + 合成轨；字体零文件；`file://` 秒开不破 |
| IV 跨端自适应 | ✅ | 9:16 锁定 + PointerEvents 单一模型 + 安全区让位 |
| V 可解性铁律 | ✅ | 72/72 机判可解；自愈不替代静态门禁 |
| VI 评委调试内置 | ✅ | 跳关 / 重置 / Hint / 自动演示 / 难度标签 / 移动端可隐藏 |

---

## 2. 下一阶段演进与优化规划（Next Iteration Roadmap）

> 四条主线并行推进，按「**先减法、再提速、后手感、末扩量**」排序：R1 不解决就做 R2，等于在臃肿地基上优化。

### R1 — 代码瘦身（Code Slimming）

**目标**：在不降低门禁覆盖的前提下，压掉历史沉淀的冗余体积与隐式耦合。

| 编号 | 事项 | 判据 |
|---|---|---|
| R1-1 | `main.js`（2722 行）拆分：场景机 / 渲染循环 / 调试面板 / 经济结算四段独立 | 单文件 ≤1200 行；`index.html` 加载序仅 +2 项；`render-selftest` 零回归 |
| R1-2 | `BoardRenderer.js`（2918 行）抽出「卡牌外观绘制」与「动效编排」两组 | 绘制函数无状态；动效常量集中在文件头部常量区 |
| R1-3 | 清理历史遗留的死代码与兼容字段（`cfg.lives` / `damageOnBlock` 之外的兼容只读项） | 源码零「已废弃」注释指向的实现；`delta27-verify` 静态断言通过 |
| R1-4 | 统一常量出口：`STM.rendererTest` / `STM.AUDIO_CONFIG` 与实现同源 | 门禁读到的值 = 运行时实际值（防「只删实现不删导出」的假绿） |
| R1-5 | `levels.js`（492 KB）字段压缩：`solutionMoves` 改增量编码 | 体积 ≤380 KB；`solver.js` 72/72 结论零漂移 |

**风险**：R1-1 拆分 `main.js` 会触碰事件总线，属**高风险改动**——必须一次只搬一个模块，每搬完跑全套门禁。

### R2 — 性能进一步调优（Performance）

| 编号 | 事项 | 判据 |
|---|---|---|
| R2-1 | 棋盘绘制分帧：静态层与动效层分离，动效期只重绘变化区 | 满载 141 张时帧间隔 `p95 ≤16.7ms`（当前基线 `≤34ms`） |
| R2-2 | 图标切片缓存分级：96 张 `256²` 常驻 + LRU 淘汰 | 首屏可交互 ≤2.0s（当前 ≤3s）；内存增量 ≤24 MB |
| R2-3 | 低端机降级策略：`devicePixelRatio` 上限 + 动效帧率降档 | 中端安卓机稳定 ≥50 FPS；降档不改变总时长口径 |
| R2-4 | Solver 提速：单关节点预算剪枝 + 并行多进程 | 全量 72 关 ≤20s（当前 ≈43s） |
| R2-5 | 长任务审计：进场窗口与消除窗口内长任务计数恒 0 | `deal-smoke` 已有断言；扩展到「切关 + 结算」窗口 |

### R3 — 手感与细节打磨（Feel & Polish）

| 编号 | 事项 | 判据 |
|---|---|---|
| R3-1 | 进场编舞的「波浪可读性」微调：对角线间隔在 `n=4` 小盘上偏大 | 首末对角线间隔仍 ≥200ms；极差 ≤40ms 不破 |
| R3-2 | 消除演出的「合体瞬间」增加 ≤1 帧的定格（打击感） | 四段边界仍可观测；总时长不超 240ms |
| R3-3 | 受阻反馈分级：连续受阻 2/3 次时双叩音高轻微下沉 | 与提牌仍可盲听区分；音频参数快照同步 |
| R3-4 | 飞行的 `L/R/D` 出屏段曲线调优（当前偏直） | 时长与终点精度门禁零回归 |
| R3-5 | 触觉反馈（`navigator.vibrate`）在三消 / 受阻两处的强度分级 | 不支持设备零报错；开关关闭零调用 |
| R3-6 | 无障碍：`prefers-reduced-motion` 之外的对比度与焦点可见性核查 | 文字与卡牌对比度 ≥4.5:1 |

### R4 — 新增关卡与体验优化（Content & Experience）

| 编号 | 事项 | 判据 |
|---|---|---|
| R4-1 | 关卡扩量预案：72 → 96 关（新增 2 幅画卷） | 现有 72 关零改写；`solver` 96/96；画卷进度键向前兼容 |
| R4-2 | 新机关候选评估：传送门 / 单向门 / 变色卡（各出 1 关原型） | 原型关必须 100% 可解且不破坏 I-1；评估后择优纳入 |
| R4-3 | 每日挑战 / 周赛（纯本地确定性种子） | 零联网；同种子同局面；不引入新货币 |
| R4-4 | 图鉴收集面板（96 条目总览 + 已解锁态） | 复用已加载切片，零新增请求 |
| R4-5 | 结算层数据可视化：本局步数 / 连击峰值 / IQ 曲线 | 纯表现层，不影响奖励确定性 |

### 2.5 技术债与已知风险

| 风险 | 影响 | 处置 |
|---|---|---|
| `main.js` 单文件承载过多职责 | 改动波及面大，回归成本高 | R1-1 优先，按模块逐个搬 |
| `levels.js` 体积随扩量线性增长 | 首屏解析耗时上升 | R1-5 增量编码 + R2-2 缓存分级 |
| 门禁脚本依赖「浏览器契约级桩」 | 桩与真实浏览器行为可能漂移 | 每轮迭代保留 1 次真机抽查（`tools/browser-bugtest.js`） |
| 历史文档口径漂移 | 误导后续开发 | 已通过本次 Spec/Plan/Tasks 三重重置收敛；后续变更就地改写，禁追加补丁段 |
| 图鉴 96 条目中部分为占位复用绘制 | 视觉重复 | R4-4 时统一替换为独立绘制或贴图 |

### 2.6 优先级与进入门槛

| 顺序 | 主题 | 进入门槛 | 退出判据 |
|---|---|---|---|
| ① | R1 代码瘦身 | 全套门禁绿（8 项） | 体积目标达成 + 门禁零回归 |
| ② | R2 性能调优 | R1 完成后（避免在待拆文件上优化） | 帧率 / 首屏 / Solver 三项达标 |
| ③ | R3 手感打磨 | R2 完成后 | 每项改动配 1 条新增断言 |
| ④ | R4 内容扩量 | R1~R3 全部收口 | 扩量后 100% 可解 + 既有内容零改写 |

---

## 3. 变更纪律

1. **需求变更** → 改 `spec.md` 对应 FR 并更新 `Baseline` 行；**架构变更** → 改本文件 L1 对应模块；**任务变更** → 改 `tasks.md`。
2. 每轮迭代 MUST 跑全套门禁并记录条数变化（本文件 §1.8 表）；条数**减少**必须说明是哪条断言被删除及理由。
3. 已完成的历史任务不再回写本文——归档于 `tasks-archive.md`。
