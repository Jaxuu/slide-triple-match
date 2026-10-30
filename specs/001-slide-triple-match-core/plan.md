# Implementation Plan — Slide & Triple / Glide Critters

**Feature Branch**: `001-slide-triple-match-core`

**Baseline**: 2026-10-30 · commit `15e8e4b` + R5 落地（Phase 19 / T210~T221，同批提交）

**Status**: **Baselined** — 本文只回答两个问题：① **现在交付了什么、它是怎么搭的**；② **下一阶段要做什么**。

**Propagated**: 2026-10-30 — 承接 spec.md refine（FR-028 垂直雨幕 + 新增 FR-049）并**已全量落地**：① §1.1 不变量 **I-7**（点击链路唯一音源）**已生效**；② §1.2 进场编舞改写为「垂直雨幕下落 + 微弹定格」（`DIAG_STEP` / 缩放弹入曲线已下线）；③ §1.3 `SFX` 表瘦身至 4 项、机制事件零独立音色；④ §R5 保留为**变更留档**（根因链 + 位移方程 + 门禁改造，均标注「已落地」）；⑤ §1.8 门禁条数按实测重定；⑥ §1.9 补 FR-049 追溯行；⑦ §2.6 优先级表 R5 行置为已完成。

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
- **I-7 点击链路唯一音源**（**R5-1 已落地，强制生效**）：一次 `pointerdown` 派生的全部事件（`flyout` / `blocked` / 级联的 `gear` / `unlock` / `prism` / `comboChanged`）中，交互反馈音只来自 `tap` / `knock`；机制事件 MUST NOT 起独立音色；源码零 `square` / `sawtooth` 一次性交互音。

### 1.2 渲染管线（`src/render/`）

```
数据层 levels.js ──► GameState.createSession ──► BoardRenderer.draw()
                                                  │
       ┌──────────────────────────────────────────┼──────────────────────────┐
       │                     │                    │                          │
  drawBoardTile        drawTileBody        introTransformOf()        flightPos()
  (底座/箭头/机关)      (图标/压暗/厚度)     (垂直雨幕下落 + 微弹)     (U 直飞 / L·R·D 两段)
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

**进场编舞（R5-2 已落地 · 唯一口径）**：`delay = r × ROW_STEP + c × COL_STEP + z × Z_STEP`（`r/c` 取 `Math.floor` 归一后的逻辑格）；`TILE 200 / IMPACT_AT 0.78 / FALL_CELL 1.0 / SQUASH_PX 5 / DAMP 4 / COL_STEP 4 / Z_STEP 6 / ROW_STEP 16~64（预算反算）/ TARGET 400 / GATE_FRAMES 2`；`dx ≡ 0`、角度 `0°`、零缩放弹入（`sx/sy` 只在挤压段微动）、触底 `5px` 纵向挤压 + 单次微回弹（`≈0.18px`）、`alpha 恒 1.0`、落牌音同源于 `IMPACT_AT`。四档（`5/0`·`6/1`·`7/2`·`8/4`）实测 `total` 恒 `400.000ms`，极差 **0**；`n=8/zMax=4` 触发预算回退（`COL 4→3` / `Z 6→4`），首末排差 `163ms`。

**性能取舍记录**：编舞总时长与牌数**解耦**（`380~420ms` 恒定），代价是放弃「逐张可辨」——141 张牌保持 9ms 步长需 ≈1440ms，与预算算术互斥。零穿模不依赖步长，只依赖 I-2 比较器。

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
- **点击链路唯一音源（R5-1 已落地）**：`SFX` 表瘦身至 **4 项**——`match`（噪声 + 正弦/三角泛音）/ `victory` / `defeat` / `iceBreak`；`click` / `gear` / `unlock` / `prism` / `undo` / `item` / `botTick` / `tick` 八项**全部删除**，`play(name)` 的 `switch` 结构不动（`default` 取不到即静默，零异常）。机制事件（`gear` / `unlock` / `prism`）在 `main.js` 只保留 `renderer.handleEvent(e)` + `refresh()`，零 `sound.play`；其余调用点同源改派：洗牌 `gear→knock`、撤销 `undo→knock`、灵犀三消 `prism→match`、Hint `click→knock`、自动演示 `botTick→tap`。改造后 `main.js` 的 `sound.play()` 调用面 = `blocked×6 / flyout×1 / iceBreak×1 / knock×4 / match×1 / tap×5`。根因链见 **§R5-1**。

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

### 1.8 门禁基线（2026-10-30 R5 落地后实测，全部 exit 0）

| 脚本 | 断言数 | 相对 R5 前 | 覆盖 |
|---|---|---|---|
| `render-selftest.js` | **367** | 349 → 367（+18） | 静态结构 / 常量同源 / 移除彻底性 / 样式关键帧 |
| `delta27-verify.js` | **120** | 112 → 120（+8） | 零绘制红线（像素级）/ 纯卡牌力学轨迹 / 层次不变量 |
| `deal-smoke.js` | **70** | 63 → 70（+7） | 帧闸门 / 行波排程 / 层序锁 / 落子音 / 快进 / 降级 |
| `flight-smoke.js` | **56** | 零改动 | 四向时长 / 终点精度 / 压叠零违规 / 并发 |
| `audio-smoke.js` | **120** | 98 → 120（+22） | 参数快照 / 响度基线 / 连击分级 / 静音联动 / **点击链路唯一音源** |
| `lobby-smoke.js` | **83** | 零改动 | 大厅六区 / 星盘 / 经济 / 结算 / 复活 |
| `icon-bbox-audit.js` | **7** | 零改动 | 96 条零裁切 / 覆盖率 ≥99.5% / 占框比 ≥90% |
| `solver.js` | **72/72** | 零改动 | 可解性 + 难度曲线单调性（`chMonotonic` / `slope14` / `waveZigzag`） |

> **R5 条数变化说明（§3 纪律 2）**：四项增量全部来自**改写 + 新增**，无一条断言被删除——`render-selftest` 的 `scenarioDelta22Intro()` 整段重写为 `[FR-028] 开局垂直雨幕下落 + 微弹定格`（覆盖常量表 / 四档恒等 / `ROW_STEP` 反算 / 预算回退 / 行波时序 / 速度剖面 4 项 / 挤压单半周期 / 姿态曲线 / 帧闸门 / 落子音 / 接缝 / 快进 / 降级 / 纯表现层）；`deal-smoke` 全程重写为 10 章；`delta27-verify` 的 `__D27.dealStructure` 改行波判据（`cellGroups` / `byRow` / `perRowCol` / `lockPairs`）；`audio-smoke` 新增 `[8] FR-049 点击链路唯一音源` 22 条。
>
> **两处判据口径变更（非放宽）**：① `delta27-verify` ⑦ 的「帧差 > 5%」→「`0/100/200ms` 至少一帧差 > 2%」——旧阈值针对 `0.62→1.05` 缩放弹入（会改变像素占比），雨幕只做 ≤1 格纯平移，5% 口径物理上不可达；② 首末排差判据由「`byRow` 实测量 ≥150ms」改为**预算构造性** `(n−1) × ROW_STEP >= 150`——真实关卡不一定铺满 `0..n−1` 行（L33 实测只铺 7 行，实测量 `142.7ms`），构造值 `163ms` 才反映设计意图；`realizedRowSpan` 仅作数据记录。
>
> **基线遗留勿当回归**：`render-selftest` 11 项 Δ14/Δ16 陈旧断言、`--engine-selftest` 1 项 T028；`playthrough` 23-1（⑥d 基线遗留）。

**真机抽查（非门禁，T220 第二半）**：`node tools/browser-bugtest.js [--level N]`——真 Chrome（CDP）下验证受阻点击贴图存活 / rAF 存活 / 零未捕获异常，并给 `createOscillator` / `createBufferSource` 挂探针做 **SC-024 真机音源计数**（受阻 = `2 osc + 2 瞬态 buf`；齿轮级联飞出 = `4 osc + 2 瞬态 buf`，且与普通飞出牌**逐项相同**；零 `square`/`sawtooth`）。默认 L3（12 项），`--level 12` 可覆盖齿轮联动路径（17 项）。R5 顺带修掉该工具三处缺陷：深链关卡默认值、`file://` 画布 taint、奇数层半格点击偏移（详见 `ITERATION_LOG.md` R5 §5）。

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
| **FR-049 点击链路音效唯一性** | `SoundManager.js`（`SFX` 表瘦身）+ `main.js`（机制事件去音） | §1.3 / **§R5-1** |
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

> 五条主线推进：**R5 缺陷修复（前置）→ R1 减法 → R2 提速 → R3 手感 → R4 扩量**。R5 修的是玩家可感知缺陷，先于一切优化；R1 不解决就做 R2，等于在臃肿地基上优化。

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
| ~~R3-1~~ | ~~进场编舞的「波浪可读性」微调：对角线间隔在 `n=4` 小盘上偏大~~ **（2026-10-30 作废：对角波前整体下线，由 R5-2 垂直雨幕取代，本条前提不再存在）** | ~~首末对角线间隔仍 ≥200ms；极差 ≤40ms 不破~~ |
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

### R5 — 本轮变更（2026-10-30 spec refine 落地 · **已全量交付**）

> **状态：已收口**。R5 修的是**可感知缺陷**（点击声被盖掉 / 进场观感不对），已先于 R1~R4 完成。下方三小节保留为**变更留档**（根因链、位移方程、门禁改造），供后续排查与反向验证引用；结论性口径已回写 §1.1 / §1.2 / §1.3 / §1.8。

#### R5-1 点击链路音效抢占（FR-049 / SC-024）— **已落地**

**根因链（已定位，逐跳可复现）**

| 跳 | 位置 | 事实 |
|---|---|---|
| ① 触发 | `RulesEngine.js:434-442 cascadeOnFlyout()` | 被点击卡牌与**同层齿轮**十字相邻（`\|Δr\| + \|Δc\| === 1`）→ 每个齿轮 push `{e:'gear', id, from, to}` |
| ② 转发 | `main.js:2033` | `if (e.e === 'gear') { sound.play('gear'); … }` |
| ③ 发声 | `SoundManager.js:986` | `gear: tone('square', 300, 420, 0.16, 0.12)` —— 方波 300→420Hz、**160ms** |
| ④ 冲突 | `main.js:1950` → `SoundManager.js:627 playTap()` | 同一次点击先起 `tap`（12ms 脆响 + 45ms 共鸣），`gear` 紧随其后**同帧**起音，方波 160ms 拖尾把提牌声整段掩蔽 |

**为什么用户称它「目标标记」**：口述的「右上角黑圆底 + 金色菱形星芒」= `BoardRenderer.js:865 drawGearBadge()`（`rgba(52,58,64,.85)` 圆底 + `#E8D9A0` 八角星，锚点 `x + w − 0.10·cell`, `y + 0.10·cell`）。全仓无第二个角标符合该描述——**它是齿轮机关角标，不是目标/Goal 系统**。用户反馈「点它的邻牌也响」，正是 ① 的十字相邻规则。

**修复方案（三层，自上而下）**

1. **音色表瘦身（`SoundManager.js`）**：删除 `click` / `gear` / `unlock` / `prism` / `item` / `botTick` / `tick` 七项；`SFX` 只留 `match`（噪声 + 正弦泛音，非方波）/ `victory` / `defeat` / `iceBreak`。`play(name)` 的 `switch` 结构不动（`default` 取不到即静默，零异常）。
2. **机制事件去音（`main.js`）**：`gear` / `unlock` / `prism` 三个分支只保留 `renderer.handleEvent(e)` + `refresh()`，删除 `sound.play(...)`。视觉反馈（角标脉冲 / 金色描边 / 折线光条）已在 `drawAnim()` 内，无需补。
3. **同源改派（`main.js` 其余调用点）**：
   - 乾坤洗牌 `sound.play('gear')`（L1810 / L1914）→ `sound.play('knock')`（木质双叩，语义「机关重排」）
   - 撤销 `sound.play('undo')`（L1868）→ `sound.play('knock')`
   - 灵犀三消 `sound.play('prism')`（L1890）→ `sound.play('match')`（该道具本就直接消除）
   - IQ 头衔解锁 `sound.play('unlock')`（L1337）→ `sound.play('knock')`
   - Hint `sound.play('click')`（L2417）→ `sound.play('knock')`
   - 自动演示 `botTick`（L2518 / L2561 / L2565 / L2619 / L2626）→ `sound.play('tap')`（与玩家操作同源，演示听感一致）

**不做的事**：不改 `tap` / `knock` / `dealTick` / `iceBreak` 的任何声学参数（`audio-smoke` 参数快照逐项零漂移，实测 120 项全绿）；不新增音色。

**落地验证**：`audio-smoke` 新增 `[8] FR-049 点击链路唯一音源` 22 条——`SFX` 段零 `square`/`sawtooth`、8 个退役键全下线、只留 4 项、`main.js` 零退役调用、`gear`/`unlock`/`prism` 零音源、`ice` 保留 `iceBreak`、一次合法点击 = 4 个振荡器（全正弦/三角）、8 个退役音色逐个完全静默、点击 + 齿轮级联仍 = 1 音源、受阻 = 2 个振荡器。

#### R5-2 垂直雨幕下落 + 微弹定格（FR-028 / SC-018）— **已落地**

**A. 位移方程（逐牌，纯函数，零分支）**

设单牌归一化时间 `u = clamp01((now − t0 − delay) / TILE)`，`TILE = 200ms`，`IMPACT_AT = 0.78`。

| 段 | 区间 | 位移 `dy` | 缩放 |
|---|---|---|---|
| 下落 | `u ∈ [0, IMPACT_AT)` | `dy = −fallPx × (1 − f(p))`，`p = u / IMPACT_AT` | `sx = sy = 1` |
| 挤压 | `u ∈ [IMPACT_AT, 1)` | `dy = +sq(τ)/2`（**底边贴地**，牌心随压缩**下移**半挤压量） | `sy = 1 − sq(τ)/tileSize`；`sx = 1 + clamp(−0.015, 0.015, sq(τ)/(2·tileSize))` |
| 定格 | `u ≥ 1` | 走静态路径（返回 `null`，零残留偏移） | `1.00` |

> **spec 内部矛盾的裁定（已记录于代码注释）**：FR-028 正文括注「牌心随压缩上移 squash/2」与同句可测判据「底边 MUST 贴地不动（`|Δy| ≤ 0.5px`）」互斥。**以可测判据为准**取 `dy = +sq/2`——牌心下移、底边恒贴地。实测底边 `dy + tileSize·sy/2` 全程恒 `20.000px`，零漂移。

**下落缓动 `f(p)`**：要求「先重力加速、末段强刹」且峰值速度落在 25%~45%。取**速度剖面 `v(p) ∝ p(1−p)²`**（Beta(1,2)，峰在 `p = 1/3`）积分归一，得**四次多项式闭式解**：

```
f(p) = 6p² − 8p³ + 3p⁴        f(0)=0, f(1)=1, f'(p) = 12p(1−p)² ≥ 0（恒单调）
```

三条性质逐条命中 SC-018 ⑤，**无需查表、无需贝塞尔求根**：

| 指标 | 解析值 | SC-018 ⑤ 要求 |
|---|---|---|
| 速度峰值位置 | `p = 1/3`（33.3%） | `25%~45%` ✓ |
| 峰值 / 平均速度 | `1.78×` | `≥1.3×` ✓ |
| 触底前（`p = 0.92`）速度 | 峰值的 `4.0%` | `≤15%` ✓ |
| 末段 10% 位移占比 | `0.37%` | `≤3%` ✓ |

> **为什么不选常见曲线**：`smoothstep`（峰在 50%）越界；`easeOutCubic`（峰在 `p = 0`，起始即最快、无加速段）正是当前对角波浪的观感来源——两者都不满足「单峰且峰在 25~45%」。

**挤压 / 回弹 `sq(τ)`**：`τ = (u − IMPACT_AT)/(1 − IMPACT_AT) ∈ [0,1]`，`SQ = 5px`（4~6 窗口）。

```
sq(τ) = SQ · e^(−4τ) · cos(πτ)
```

单次半周期：`τ=0 → 1.00·SQ`（触底压到底）→ `τ=1/3 → 0.13·SQ` → `τ=2/3 → −0.035·SQ`（轻微拉伸＝微回弹，约 `0.18px`）→ `τ=1` 强制归零并锁死。**零二次弹跳**（只一个半周期）、**零 `back`/`elastic` 关键字**。

**B. 时序方程**

```
delay     = r × ROW_STEP + c × COL_STEP + z × Z_STEP      （r/c 取 Math.floor 归一后的逻辑格）
ROW_STEP  = clamp(16, 64, (TARGET − TILE − (n−1)·COL_STEP − zMax·Z_STEP) / (n−1))
TARGET = 400ms, TILE = 200ms, COL_STEP = 4ms, Z_STEP = 6ms
```

预算冲突优先级（spec FR-028）：`n = 8 / zMax = 4` 时若 `(n−1)·ROW_STEP < 150`，先把 `COL_STEP` / `Z_STEP` 压到下限 `3` / `4` 再反算。四档验算（`total` 全为 `400ms`，首末排差均 `≥150ms`）：

| n / zMax | ROW_STEP | 首末排差 | total | 备注 |
|---|---|---|---|---|
| 5 / 0 | 46.0 | 184ms | 400ms | 默认 `COL=4 / Z=6` |
| 6 / 1 | 34.8 | 174ms | 400ms | 默认 |
| 7 / 2 | 27.3 | 164ms | 400ms | 默认 |
| 8 / 4 | 23.3 | 163ms | 400ms | **唯一触发冲突回退**：默认参数下首末排差仅 `148ms < 150ms` → 压到 `COL=3 / Z=4` 后回到 `163ms` |

**辐射变体（spec 为「允许」而非「必须」，本轮未实现）**：`delay = (|r − rc| + |c − cc|) × RAD_STEP + z × Z_STEP`，`rc = cc = (n−1)/2`，`RAD_STEP` 同预算反算。本轮只交付**行波**单一波前（`variant ≡ 'rows'`），因此 SC-018 ⑩「同关重开波前完全一致」**构造性成立**（零随机源、零模式抽取标识 `pickIntroMode` / `introSpecOf` / `dealModeLock` 已随改造删除）。后续若要补辐射波前，MUST 仍由关卡静态配置（`maskBase` / `maskUpper ∈ {ring, sym}`）确定性选取，且 MUST NOT 触碰位移轴向、`TILE`、总时长窗口。

**C. 落地路径（6 处改动，5 处在 `BoardRenderer.js` 内）**

| # | 位置 | 动作（**已按此落地**） |
|---|---|---|
| 1 | 常量区（`BoardRenderer.js:1003~1020`） | `INTRO_*` 常量组整体替换：`TILE_MS 200 / IMPACT_AT 0.78 / FALL_CELL 1.0 / SQUASH_PX 5 / DAMP 4 / COL_STEP 4 / Z_STEP_MS 6 / ROW_STEP_MIN 16 / ROW_STEP_MAX 64 / TARGET_MS 400 / GATE_FRAMES 2`，另加 `ROW_SPAN_MIN 150`（首末排差下限）/ `COL_STEP_FLOOR 3` / `Z_STEP_FLOOR 4`（预算冲突回退下限）/ `POSE_REF_TILE 40`（`introPoseOf` 离线兜底卡面）；`INTRO_S0 / OVERSHOOT / PEAK_AT / DY0 / DIAG_STEP_* / INTRO_TICK_AT` 全删 |
| 2 | 纯函数区（**模块级**） | `introFallEase(p)`（四次式）、`introSquashOf(τ)`、`introPoseOf(u, fallPx, tileSize)`、`introStepsOf(n, zMax)`（含预算冲突回退，返回 `{row, col, z}`）、`introRowStepOf(n, zMax)`、`introDelayOf(rr, cc, z, n, zMax)`、`introDealTotalMs(n, zMax)`——MUST 放**模块作用域**，否则 `STM.rendererTest` 取不到（`loadLevel` 会重建 renderer） |
| 3 | `buildIntroPlan()` | 每条记录加 `fallPx`；`fallPx = (rr === 0) ? 0.5·tileSide : min(FALL_CELL·cell, rr·cell + 0.5·tileSide)`（**`+` 而非 `−`**：`0.5·tileSide` 是卡面半高，起点要整张卡露出画布外才只越界半格）；`totalMs = max(maxDelay + TILE, introDealTotalMs(n, zMax))` |
| 4 | `introTransformOf()` | 由「`p` → 姿态」改为「`u` → 姿态」，透传 `rec.fallPx` 与 `layout.tileSize`；下落段 `dy` 为**负值（向上）**，挤压段 `dy = +sq/2`（牌心下移、底边贴地）；`u ≥ 1` 返回 `null` |
| 5 | `drawBoardTile()` | 已支持 `scaleX/scaleY` 透传（`drawTileBody(..., itr.sx, itr.sy)`），**无需改动**——这是本轮唯一「零成本」环节，因为非等比通道早在 Δ22c 就为百叶窗预留 |
| 6 | `tickIntro()` | 落牌音触发点由 `p ≥ 0.85` 改为 `el ≥ INTRO_TILE_MS × INTRO_IMPACT_AT`；`progress` 仍取 `(delay − LEAD)/(maxDelay − LEAD)`（`LEAD = 0`） |
| 7 | **新增** `drawIntroOutside()` | 首排越界段接缝（见 §D），由 `drawVfx(atMs)` 在 `drawFlightsOutside()` 之后串联；`vfxLive` 判据并入 `introAnim.active` |

**D. 越界接缝（唯一高风险点）**

`#board` 画布**就是棋盘正方形**（`originX/Y = 0`，`cell = cssSize / n`），卡牌任何向上位移都直接被位图边界裁切。以 `FALL_CELL = 1.0` 计：

- `r ≥ 1`：起点 `y = r·cell − fallPx ≥ 0.5·tileSide`（`fallPx` 按 `r·cell + 0.5·tileSide` 夹紧，即落距最多让卡面顶端刚好贴画布顶边）→ **恒不越界**；
- `r = 0`：起点 `y = −0.5·tileSize`（`fallPx` 按 spec 收缩为半格）→ 越界 `0.5` 格，用 `#vfx-canvas` 接续这半格露出段。

> 只有**首排**（≤8 张）需要接缝，`r ≥ 1` 全部在画布内完成——这是选择 `FALL_CELL ≈ 1.0` 而非更大落距的直接原因：落距再大一档，接缝就从「首排」扩到「前两排」，收益不抵复杂度。

**接缝实现**：复用 `drawFlightsOutside()` 的现成模式（棋盘 canvas 画矩形内部分、`#vfx-canvas` 画矩形外部分，同一变换、互补裁剪），新增 `drawIntroOutside()`，**MUST NOT 新增第三块 canvas**。

**必须同步处理的两处守卫**（**均已落地**）：

1. `vfxWasLive` 的「有→空补清屏」当前只判 `flights.length`；进场接缝也占用该层 → 已并入同一判据（`var vfxLive = (flights.length > 0) || !!(introAnim && introAnim.active);`），否则进场结束后**首排越界残影会永久冻结**在 `#vfx-canvas` 上（与 Δ28d 同一类缺陷）。
2. I-4 的「三消窗口 `alpha > 2` 像素恒 0」断言（`delta27-verify`）**采样窗必须排除进场期**，否则进场接缝被误判违规。已改为断言前置 `!renderer.isDealing()`（并在帧循环内 `if (r.isDealing()) { sawDealing = true; requestAnimationFrame(step); return; }`），**不是**放宽阈值。

> **替代方案（不推荐，记录备查）**：把 `FALL_CELL` 压到 `0.45` 且首排不落 —— 省掉接缝，但违反 spec「MUST NOT 出现首排完全不下落」，且首末排观感割裂。若接缝实机出现 1px 缝，退路是把 `#board` 的 `originY` 下移半格并同步 `hitTest`（改动面大，**仅作最后手段**）。

**E. 零回归边界**

- `(z,r,c)` 升序比较器**一行不改**——`draw()` 与 `renderList` 构造完全不动，下落期重叠遮挡由同一比较器自然成立（同层下方牌盖上方牌、`z` 大者恒盖）。
- 三消磁吸坍缩（`chip-rush/impact/flash/solo` 四段 CSS 关键帧）、方向性飞行（`flightPos`）、预警横幅、大厅相框、设置弹窗**零触碰**。
- `prefers-reduced-motion` 分支保留（一次性淡入、总时长不变、同样过帧闸门）。

#### R5-3 门禁改造清单（与实现同批提交 · **已全部完成**）

| 脚本 | 受影响断言 | 实际处理结果 |
|---|---|---|
| `deal-smoke.js` | 「四档 380~450ms」「同对角线同起 ≤2ms」「半格 floor 归一」「首末对角线 ≥200ms」「`INTRO` 常量表」 | 全程重写为 10 章（常量与公式 / 四档 400ms 恒等 / 行波时序 / 运行时 plan 含 `fallPx` / 帧闸门 / 落子涟漪音同源 / 快进 / 单模式确定性 / reduced-motion / 纯表现层）→ **70 项** |
| `delta27-verify.js` | ⑥ 多规模 `totalMs ∈ [380,450]`、⑦ 计划就绪 | 窗口改 `[380,420]`；`__D27.dealStructure` 改行波判据（`cellGroups` / `byRow` / `perRowCol` / `lockPairs`）；首末排差改**预算构造性** `(n−1)×ROW_STEP >= 150`；列差/层差取**生效值** `steps.col` / `steps.z`（`n=8` 回退 3/4，不可拿常量 4/6 比）；⑦ 阈值改「`0/100/200ms` 至少一帧差 > 2%」；像素红线前置 `!isDealing()` → **120 项** |
| `render-selftest.js` | L1615~1850（时长 / 对角 / 姿态曲线 / 移除彻底性）、L2139 静态断言 | `scenarioDelta22Intro()` 整段重写为 `[FR-028] 开局垂直雨幕下落 + 微弹定格`；同步修 3 处：`Δ31a 清屏守卫` 正则放宽（`vfxLive` 追加 `introAnim.active`）、`dy 单调` 初值改 `null`、`<canvas>` 计数改读 `index.html` → **367 项** |
| `audio-smoke.js` | 现有 98 项 | **零改动**（参数快照逐项零漂移），追加 `[8] FR-049 点击链路唯一音源` 22 条 → **120 项** |
| `flight-smoke.js` / `lobby-smoke.js` / `icon-bbox-audit` / `solver` | — | 零回归：**56 / 83 / 7 / 72-72** |

**验证顺序（已按序执行）**：`render-selftest` → `deal-smoke` → `delta27-verify` → `audio-smoke` → 其余四项，全部 exit 0。

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
| ⓪ | ~~**R5 本轮缺陷修复**~~ **（✅ 2026-10-30 已收口）** | ~~spec refine 已完成（FR-028 / FR-049）~~ | `SC-018` + `SC-024` 全绿；§R5-3 门禁改写同批提交；条数变化逐条说明 —— **8 项门禁全 exit 0，条数变化见 §1.8** |
| ① | R1 代码瘦身 | R5 收口 + 全套门禁绿（8 项） | 体积目标达成 + 门禁零回归 |
| ② | R2 性能调优 | R1 完成后（避免在待拆文件上优化） | 帧率 / 首屏 / Solver 三项达标 |
| ③ | R3 手感打磨 | R2 完成后 | 每项改动配 1 条新增断言 |
| ④ | R4 内容扩量 | R1~R3 全部收口 | 扩量后 100% 可解 + 既有内容零改写 |

---

## 3. 变更纪律

1. **需求变更** → 改 `spec.md` 对应 FR 并更新 `Baseline` 行；**架构变更** → 改本文件 L1 对应模块；**任务变更** → 改 `tasks.md`。
2. 每轮迭代 MUST 跑全套门禁并记录条数变化（本文件 §1.8 表）；条数**减少**必须说明是哪条断言被删除及理由。
3. 已完成的历史任务不再回写本文——归档于 `tasks-archive.md`。
