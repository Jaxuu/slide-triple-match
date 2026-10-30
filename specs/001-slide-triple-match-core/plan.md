# Implementation Plan — Slide & Triple / Glide Critters

**Feature Branch**: `001-slide-triple-match-core`

**Baseline**: 2026-10-30 · commit `13f302b`（R5 落地后）· **R6 设计定稿（未实施）**

**Status**: **Baselined** — 本文只回答两个问题：① **现在交付了什么、它是怎么搭的**；② **下一阶段要做什么**。

**Propagated**: 2026-10-30 — 承接 spec.md refine（FR-028 垂直雨幕 + 新增 FR-049）并**已全量落地**：① §1.1 不变量 **I-7**（点击链路唯一音源）**已生效**；② §1.2 进场编舞改写为「垂直雨幕下落 + 微弹定格」（`DIAG_STEP` / 缩放弹入曲线已下线）；③ §1.3 `SFX` 表瘦身至 4 项、机制事件零独立音色；④ §R5 保留为**变更留档**（根因链 + 位移方程 + 门禁改造，均标注「已落地」）；⑤ §1.8 门禁条数按实测重定；⑥ §1.9 补 FR-049 追溯行；⑦ §2.6 优先级表 R5 行置为已完成。

**Propagated**: 2026-10-30（R6）— 承接 spec.md 第二次 refine（**FR-030 重写**：槽间横向磁吸 → 原位微跃 + 柔光升华，`200ms` 三段；**FR-028 改写**：`FALL_H 0.7~1.4` → `2.6~3.4` 统一落距 + 帧闸门四条件与「`1200ms` 复查 + `8000ms` 总预算」看门狗）：① 新增 **§R6-1**「三消原位微跃」技术改造方案（含逐跳根因 + 5 处改动 + 新关键帧 + 顺带修掉的一处 FLIP 几何缺陷）；② 新增 **§R6-2**「开局防偷跑 + 高落差雨幕」（含**偷跑根因链定位到 `tryPrepareLobby()` 与 `frame()` 的具体行**、四条件闸门、HUD 安全线几何）；③ 新增 **§R6-3** 门禁改造清单与 **§R6-4** 零回归边界；④ §1.2 / §1.5 / §1.8 / §1.9 已按 R6 实测**就地回写**（不再是前向引用；门禁表与命令速查同步到 `377 / 129 / 98 / 62`）；⑤ R3-2 作废、R5-2 §D/§E 的两处前提被推翻并就地标注；⑥ §2.6 优先级表新增 ⓪' R6 行。

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
- **I-8 计时起点绑定真实可见帧**（**R6 新增，强制生效**）：任何**有观赏价值且不可重播**的时间轴（开局编舞，以及后续任何同类演出）的 `t0` MUST 在「遮挡层全部不可见 + 页面可见 + 之后真实画完 ≥2 帧」之后才记录；遮挡 / 切后台 MUST 复位闸门。收口 MUST 用「**`1200ms` 复查 + `8000ms` 总预算**」的看门狗——遮挡期**重挂复查**（不许静置），只有累计超总预算才 `skipDeal()` 整盘静置。**「画完的帧」≠「玩家看到的帧」**——这条不变量正是 R6 修掉的缺陷类别。
- **I-9 原位优先**（**R6 新增**）：槽内演出 MUST NOT 让卡牌跨越**非本组**的槽位做横向位移。需要「合体感」时，用同槽内的形变 / 亮度 / 缩放表达，MUST NOT 用跨槽位移表达——跨槽位移必然引出「穿槽框」与「跨牌穿模」两个结构问题（详见 §R6-1 B）。

### 1.2 渲染管线（`src/render/`）

```
数据层 levels.js ──► GameState.createSession ──► BoardRenderer.draw()
                                                  │
       ┌──────────────────────────────────────────┼──────────────────────────┐
       │                     │                    │                          │
  drawBoardTile        drawTileBody        introTransformOf()        flightPos()
  (底座/箭头/机关)      (图标/压暗/厚度)     (高落差垂直雨幕 + 触底微弹)  (U 直飞 / L·R·D 两段)
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

**进场编舞（R6 已落地 · 唯一口径）**：`delay = r × ROW_STEP + c × COL_STEP + z × Z_STEP`（`r/c` 取 `Math.floor` 归一后的逻辑格）；`TILE 200 / IMPACT_AT 0.78 / FALL_CELL 3.0（窗口 2.6~3.4）/ SQUASH_PX 5 / DAMP 4 / COL_STEP 4 / Z_STEP 6 / ROW_STEP 16~64（预算反算）/ TARGET 400 / GATE_FRAMES 2 / GATE_WATCHDOG 1200（复查间隔）/ GATE_WATCHDOG_MAX 8000（总预算）`；`dx ≡ 0`、角度 `0°`、零缩放弹入（`sx/sy` 只在挤压段微动）、触底 `5px` 纵向挤压 + 单次微回弹（`≈0.18px`）、`alpha 恒 1.0`、落牌音同源于 `IMPACT_AT`。四档（`5/0`·`6/1`·`7/2`·`8/4`）`total` 恒 `400.000ms`，极差 **0**；`n=8/zMax=4` 触发预算回退（`COL 4→3` / `Z 6→4`），首末排差 `163ms`。

**R6 落地的三处实测修正**：① `FALL_CELL 1.0 → 3.0` 且**取消首排收缩**，全盘统一落距（`fallPx = FALL_CELL × 卡面边长`，极差 ≤`0.5px`）；② 帧闸门加「遮挡解除 + `visibilityState === 'visible'`」两项前置，且看门狗改为「**复查 + 重挂**」——深链 `?level=N` 的 `#splash-screen` 实测要到 **≈4.6s** 才移除，而 `startDeal()` 在 ≈0.6s 就被 `tryPrepareLobby()` 触发；单次 `1200ms` 到期即 `skipDeal()` 会把整段雨幕吞掉（探针实测 `act=false`、`tot=400` 却一帧未渲染），故遮挡期改为重新挂起、累计超 `8000ms` 才静置；③ `drawIntroOutside()` 越界上限 `0.5 → 3.4` 卡面边长，并加 HUD 安全线裁剪（`y ≥ #hud` 下沿）。

> **实测口径差（R6 记录，非遗留缺陷）**：`totalMs = max(实际 maxDelay + TILE, 公式值)`，公式按「底排满排 + 右下角取到 zMax」估算。真机实测实际编舞终点为 L3 `363.7ms` / L33 `361.7ms` / L72 `375.0ms`（公式 `400ms`），差值 25~38ms 来自底排未占满，属**保守高估**（`dealRemainingMs()` 只会偏长，不会提前放行）。门禁据此把「墙钟落定」拆成两条：预算 `totalMs ∈ [380,420]`、实际终点 `maxDelay + TILE ∈ [360,420]` 且预算高估 ≤`40ms`。

**三消演出（R6 已落地 · 唯一口径）**：`#dock` 内 3 张真实卡牌**各自留在本槽**，同跑 `chip-hop`（`200ms`，`0/10/22/40/100` 五段：预压 → 起跳 `-6px`/`scale 1.06` → 回落 `-1px` → 原地缩小淡出 `scale(0,0)`）+ `chip-flash`（`::after` 纯白柔光，`40%` 前恒 `0` → `55%` 峰 `.70` → `0`）；零错峰（三张 `animation-delay` 完全一致）、零横向分量（`|tx| ≤ 0.5px`）、零角色分派（`data-collapse-role` 只在可用槽不足 3 的 `solo` 退化路径出现）。**`chip-rush` / `chip-impact` / `--suck-dx` 三条横向通道整段删除**（I-9 原位优先）。

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

**交互契约**：进场期与横幅展示期的任意点击 MUST 被正常响应（快进而非吞掉）；`pendingShatter` → 逐张落定 → 全落定才起播消除，`700ms` 兜底。**R6 追加**：`afterIntro()` 的放行判据必须从「一次性定时」改为「`isDealing()` 仍为真就继续等待」（见 §R6-2 D-4），否则闸门推迟期间横幅会压在落子上。

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

### 1.8 门禁基线（2026-10-30 R6 落地后实测，全部 exit 0）

| 脚本 | 断言数 | 相对 R5 | 覆盖 |
|---|---|---|---|
| `render-selftest.js` | **377** | 367 → 377（+10） | 静态结构 / 常量同源 / 移除彻底性 / 样式关键帧（含 `chip-hop` 逐段零横向分量、看门狗复查重挂） |
| `delta27-verify.js` | **129** | 120 → 129（+9） | 零绘制红线（像素级）/ 纯卡牌力学轨迹 / 层次不变量 / R6 静态语义 14 条 / HUD 安全线 |
| `deal-smoke.js` | **98** | 70 → 98（+28） | 帧闸门四条件 / 看门狗「复查 + 重挂 + 8000ms 总预算」/ 行波排程 / 层序锁 / 落子音 / 快进 / 降级 |
| `flight-smoke.js` | **62** | 56 → 62（+6） | 四向时长 / 终点精度 / 压叠零违规 / 并发 / **FLIP 补位起点按 `data-tile-id` 配对** |
| `audio-smoke.js` | **120** | 零改动 | 参数快照 / 响度基线 / 连击分级 / 静音联动 / **点击链路唯一音源** |
| `lobby-smoke.js` | **83** | 零改动 | 大厅六区 / 星盘 / 经济 / 结算 / 复活 |
| `icon-bbox-audit.js` | **7** | 零改动 | 96 条零裁切 / 覆盖率 ≥99.5% / 占框比 ≥90% |
| `solver.js` | **72/72** | 零改动 | 可解性 + 难度曲线单调性（`chMonotonic` / `slope14` / `wavezigzag`） |

> **R6 条数变化说明（§3 纪律 2，条数只增不减）**：四项增量全部来自**改写 + 新增**，无一条断言被删除——`render-selftest` +10（`INTRO` 看门狗常量同源 1 条、`armIntroWatchdog()` 自调用与 `introWatchdogRearms += 1` 存在性 2 条、旧「单次到期即 `skipDeal`」零残留 1 条、`chip-hop` 五段逐段零横向 6 条）；`deal-smoke` +28（⑪ 段整段重写为三段拍：遮挡期三恒 / 解除后开闸 / 超预算收口，另加 `GATE_WATCHDOG_MAX_MS === 8000`）；`delta27-verify` +9（③b 段 14 条 R6 静态 CSS 语义断言新增，同期 ③ 段 Δ31a 磁吸语义 43→32 精简——其中**槽框 `background` 冻结此前完全无覆盖**，本轮补上）；`flight-smoke` +6（`dockFlipDxOf` 起点配对 5 条 + 反向证据 1 条）。
>
> **两处判据口径变更（非放宽）**：① `delta27-verify` ⑥ 的墙钟断言改为**从开闸帧 `startTime` 起算**（旧口径从 `startDeal()` 起算，量到的是"等 splash 消失"的 4.3s，且旧口径恒绿是因为单次 1200ms 看门狗把编舞 `skipDeal()` 掉了——**长期假绿**）；② ⑧ 的 HUD 反向证据由 `maxBelow > 0` 改为「**成片**像素 ≥2% 带宽面积」（`> 0` 会被 1px 抗锯齿边界满足，同属长期假绿）。
>
> **R5 条数变化（留档）**：`render-selftest 349→367` / `deal-smoke 63→70` / `delta27-verify 112→120` / `audio-smoke 98→120`；`flight-smoke 56` / `lobby-smoke 83` / `icon-bbox-audit 7` / `solver 72-72` 零回归。
>
> **R5 两处判据口径变更（留档）**：① `delta27-verify` ⑦ 的「帧差 > 5%」→「`0/100/200ms` 至少一帧差 > 2%」——旧阈值针对 `0.62→1.05` 缩放弹入（会改变像素占比），雨幕只做 ≤1 格纯平移，5% 口径物理上不可达；② 首末排差判据由「`byRow` 实测量 ≥150ms」改为**预算构造性** `(n−1) × ROW_STEP >= 150`——真实关卡不一定铺满 `0..n−1` 行（L33 实测只铺 7 行，实测量 `142.7ms`），构造值 `163ms` 才反映设计意图；`realizedRowSpan` 仅作数据记录。
>
> **基线遗留勿当回归**：`render-selftest` 11 项 Δ14/Δ16 陈旧断言、`--engine-selftest` 1 项 T028；`playthrough` 23-1（⑥d 基线遗留）。

> **R6 预告（条数必然变化，落地时按实测回写本表）**：`deal-smoke` 需新增「闸门可见性复位 / 看门狗 / 统一落距」约 +6 项；`delta27-verify` 的越界上限（`0.5 → 3.4`）与三消像素红线判据需改写（净变化 ≈0）；`render-selftest` 需整段重写三消关键帧断言（`chip-rush/impact` → `chip-hop`）并新增「零横向分量」静态断言；`flight-smoke` 需验证 FLIP 修复后的落定精度（见 §R6-1 E）。**MUST NOT 出现任何断言条数下降而未说明理由。**

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
| **FR-028 进场编舞（R6 改写）** | `BoardRenderer.js`（常量 / `buildIntroPlan` / `frame` 闸门 / `drawIntroOutside`）+ `main.js`（`dealVisibleProbe` / `afterIntro`） | §1.2 / **§R6-2** |
| **FR-030 三消演出（R6 重写）** | `css/style.css`（关键帧）+ `main.js`（`applyCollapseDom` / `fireDockShatter` / `finishCollapseGroup` / `renderDockWithFlip`） | §1.2 / **§R6-1** |
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

> 五条主线推进：**R6 二次落地（前置）→ R5 缺陷修复（已收口）→ R1 减法 → R2 提速 → R3 手感 → R4 扩量**。R6 与 R5 同属「玩家可感知缺陷」，修完才谈优化；R1 不解决就做 R2，等于在臃肿地基上优化。

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
| ~~R3-2~~ | ~~消除演出的「合体瞬间」增加 ≤1 帧的定格（打击感）~~ **（2026-10-30 R6 作废：「合体」这一形态已不存在——三张牌不再汇合到同一槽，改为各自原位微跃；定格需求由新时序的 `80ms` 跳跃峰值回落段自然承担）** | ~~四段边界仍可观测；总时长不超 240ms~~ |
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
>
> **⚠ R6 已推翻上述前提（记录备查，勿再引用）**：玩家反馈「落差太小 = 原地凭空出现」，spec FR-028 的 `FALL_H` 因此上调到 `2.6~3.4`。代价是接缝从「首排」扩到「前三排」（`r = 0..2` 在 7×7 盘上都会起始于画布之上），复杂度已由 R6 承接：`drawIntroOutside()` 本身是**逐牌判 `py − hh < 0`** 的通用实现（`BoardRenderer.js:1862-1892`），扩大越界范围**不需要改绘制逻辑**，只需①放宽 spec 上限、②补一条 HUD 安全线裁剪（见 §R6-2 C）。

**接缝实现**：复用 `drawFlightsOutside()` 的现成模式（棋盘 canvas 画矩形内部分、`#vfx-canvas` 画矩形外部分，同一变换、互补裁剪），新增 `drawIntroOutside()`，**MUST NOT 新增第三块 canvas**。

**必须同步处理的两处守卫**（**均已落地**）：

1. `vfxWasLive` 的「有→空补清屏」当前只判 `flights.length`；进场接缝也占用该层 → 已并入同一判据（`var vfxLive = (flights.length > 0) || !!(introAnim && introAnim.active);`），否则进场结束后**首排越界残影会永久冻结**在 `#vfx-canvas` 上（与 Δ28d 同一类缺陷）。
2. I-4 的「三消窗口 `alpha > 2` 像素恒 0」断言（`delta27-verify`）**采样窗必须排除进场期**，否则进场接缝被误判违规。已改为断言前置 `!renderer.isDealing()`（并在帧循环内 `if (r.isDealing()) { sawDealing = true; requestAnimationFrame(step); return; }`），**不是**放宽阈值。

> **替代方案（不推荐，记录备查）**：把 `FALL_CELL` 压到 `0.45` 且首排不落 —— 省掉接缝，但违反 spec「MUST NOT 出现首排完全不下落」，且首末排观感割裂。若接缝实机出现 1px 缝，退路是把 `#board` 的 `originY` 下移半格并同步 `hitTest`（改动面大，**仅作最后手段**）。

**E. 零回归边界**

- `(z,r,c)` 升序比较器**一行不改**——`draw()` 与 `renderList` 构造完全不动，下落期重叠遮挡由同一比较器自然成立（同层下方牌盖上方牌、`z` 大者恒盖）。
- ~~三消磁吸坍缩（`chip-rush/impact/flash/solo` 四段 CSS 关键帧）、方向性飞行（`flightPos`）、预警横幅、大厅相框、设置弹窗**零触碰**。~~
  **（R6 修正：三消四段关键帧整段替换为 `chip-hop` + 新 `chip-flash`，见 §R6-1；其余三项仍零触碰。）**
- `prefers-reduced-motion` 分支保留（一次性淡入、总时长不变、同样过帧闸门）。

#### R5-3 门禁改造清单（与实现同批提交 · **已全部完成**）

| 脚本 | 受影响断言 | 实际处理结果 |
|---|---|---|
| `deal-smoke.js` | 「四档 380~450ms」「同对角线同起 ≤2ms」「半格 floor 归一」「首末对角线 ≥200ms」「`INTRO` 常量表」 | 全程重写为 10 章（常量与公式 / 四档 400ms 恒等 / 行波时序 / 运行时 plan 含 `fallPx` / 帧闸门 / 落子涟漪音同源 / 快进 / 单模式确定性 / reduced-motion / 纯表现层）→ **70 项** |
| `delta27-verify.js` | ⑥ 多规模 `totalMs ∈ [380,450]`、⑦ 计划就绪 | 窗口改 `[380,420]`；`__D27.dealStructure` 改行波判据（`cellGroups` / `byRow` / `perRowCol` / `lockPairs`）；首末排差改**预算构造性** `(n−1)×ROW_STEP >= 150`；列差/层差取**生效值** `steps.col` / `steps.z`（`n=8` 回退 3/4，不可拿常量 4/6 比）；⑦ 阈值改「`0/100/200ms` 至少一帧差 > 2%」；像素红线前置 `!isDealing()` → **120 项** |
| `render-selftest.js` | L1615~1850（时长 / 对角 / 姿态曲线 / 移除彻底性）、L2139 静态断言 | `scenarioDelta22Intro()` 整段重写为 `[FR-028] 开局垂直雨幕下落 + 微弹定格`；同步修 3 处：`Δ31a 清屏守卫` 正则放宽（`vfxLive` 追加 `introAnim.active`）、`dy 单调` 初值改 `null`、`<canvas>` 计数改读 `index.html` → **367 项**（R6 后 **377 项**） |
| `audio-smoke.js` | 现有 98 项 | **零改动**（参数快照逐项零漂移），追加 `[8] FR-049 点击链路唯一音源` 22 条 → **120 项** |
| `flight-smoke.js` / `lobby-smoke.js` / `icon-bbox-audit` / `solver` | — | 零回归：**56 / 83 / 7 / 72-72** |

**验证顺序（已按序执行）**：`render-selftest` → `deal-smoke` → `delta27-verify` → `audio-smoke` → 其余四项，全部 exit 0。

### R6 — 本轮变更（2026-10-30 spec refine 二次落地 · **设计定稿，代码未动**）

> **状态：待实施**。R6 承接 spec.md 的第二次 refine（FR-030 重写 / FR-028 改写），修两类**玩家可感知缺陷**：
> ① 三消的「槽间横向磁吸」导致穿槽框与跨牌穿模；② 开局落子在遮挡层背后偷跑 + 落差过小读作「原地凭空出现」。
> **纪律**：本节属 L2（未落地），落地后结论性口径回写 §1.2 / §1.5 / §1.8；落地前 L1 仍描述 R5 现状（已加前向引用）。

#### R6-1 三消：原位微跃 + 柔光升华（FR-030 / SC-020）

**A. 现状链路（逐跳，已核对源码）**

| 跳 | 位置 | 事实 |
|---|---|---|
| ① 事件 | `main.js:2017` | 第 3 张牌落定后引擎发 `match`；**不直接起演**，先置 `pendingShatter = {slots, suits, ids}` |
| ② 等落定 | `main.js:1503 advancePendingShatter()` / `1518 flushPendingShatter()` | 逐张刷 ghost；`renderer.dockPending(id)` 仍为真就继续等，`700ms` 兜底强制 flush |
| ③ 槽位定位 | `main.js:1469 shatterSlotsOf(ids)` | 用 `dockMirror`（按事件序重放 `dock`/`remove`）查槽序号——**不能读当前 dock**（会退化成最左 3 槽） |
| ④ 采几何 | `main.js:1628-1651` | 逐槽 `getBoundingClientRect()`，再用 `offsetWidth/offsetHeight` 反推未缩放左上角（规避 `dock-seat` 的 `scale(.72)`）；算 `dx = midRect.left − rect.left` |
| ⑤ 写 ghost | `main.js:1658-1667` | `dockGhost.map[slotIdx] = { suit, gid, dx }`——只影响 `renderDock()` 拼的 HTML |
| ⑥ 改 DOM | `main.js:1545 applyCollapseDom()` | 三槽 → `slot has-tile is-filled filled slot-shattering`；`data-collapse-role = center｜side｜solo`；`style.zIndex = 3｜1`；`innerHTML` 重写为 `.dock-chip` + 内联 `--suck-dx` |
| ⑦ 动画 | `css/style.css:1-190` | `.slot{overflow:hidden}` → `.slot-shattering{overflow:visible}`；`chip-rush`（side）/ `chip-impact`（center）/ `chip-flash`（`::after`）/ `chip-solo` / `dock-hit` |
| ⑧ 收尾 | `main.js:1692 finishCollapseGroup()` | 清本组 ghost → 无活跃组时 `dockFreezeUntil=0` + `clearCollapseRoles()` + `renderDockWithFlip()` |
| ⑨ 补位 | `main.js:1587 renderDockWithFlip()` | 记旧 `.slot` left → 重建 → 对 `.dock-chip` 写 `translateX(old−new)`，强制一次重排后过渡回 0 |

**B. 根因：横向通道没有「安全的小幅度」版本**

`dx` 的语义是「本槽 left → 中间槽 left」，它把三张牌**物理搬到同一个格子**，由此必然产生三个结构问题：

1. **跨槽穿越**：中间的牌可能隔着 1~2 个**不属于本组**的槽，滑行时直接压过别人的槽框与卡面——即用户报的「非相邻状态跨越其他卡牌穿模」。
2. **槽框裁剪**：`#dock .slot{overflow:hidden}` 是常态，全靠 `.slot-shattering` 临时改 `visible` 才让滑行可见；一旦某帧类没挂上（并发组 / 重建竞争 / 重置时序），滑行就被裁成「牌突然消失」——即用户报的「穿透槽位边框」。
3. **层叠上下文脆弱**：汇合后要靠 `.slot` 的 `z-index:3` 压住两侧，而 `dock-seat` 的 `transform` 会在 `.slot` 上重建层叠上下文，`z-index` 跨不了槽。

**结论**：只要 `dx ≠ 0`，就必须同时解决「跨槽穿越」与「槽框裁剪」两个结构问题；把它们都修好的成本远高于「原位演出」。**原位是唯一零成本正解**，这也正是 spec FR-030 的裁定。

**C. 改造清单（5 处）**

| # | 文件 / 位置 | 动作 |
|---|---|---|
| C-1 | `css/style.css:7-190` | 删 `chip-rush` / `chip-impact` / `--suck-dx` / `[data-collapse-role="side"]` / `["center"]` 三段；**保留** `.slot-shattering{overflow:visible}`（跳跃需要越界可见）、`#dock .slot{padding:0;overflow:hidden;border-radius:10px}`、`chip-solo`（退化）、`dock-hit`；**新增** `chip-hop`（`200ms`，跳跃 + 消散两段）并**重写** `chip-flash`（`::after` 纯白柔光） |
| C-2 | `main.js:1441-1445` 常量 | `COLLAPSE_TOTAL_MS 210→200`；`COLLAPSE_SHUDDER_AT_MS 130→100`（与柔光达峰同帧）；`DOCK_FREEZE_MS = 200`；`DOCK_FLIP_MS 200→60` |
| C-3 | `main.js:1628-1667` `fireDockShatter()` | **整段删除** rects / midRect / `dx` 采集（≈24 行，`offsetWidth` 反推一并下线）；ghost 条目降为 `{ suit, gid }`；`groupEndAt` / `dockFreezeUntil` / 两个计时器**不动** |
| C-4 | `main.js:1545 applyCollapseDom()` | 去掉 `center/side` 分支与 `style.zIndex` 写入（仅 `solo` 仍打属性）；`innerHTML` 不再写内联 `--suck-dx` |
| C-5 | `main.js:1373 renderDock()` | ghost 分支不再拼 `--suck-dx` 内联样式；`gLive` 判据不变 |

**D. 新时序与关键帧（与 spec FR-030 三段一一对应）**

`chip-hop`（`200ms`，`transform-origin: 50% 50%`，作用于 `.slot-shattering .dock-chip`）：

| 关键帧 | 时刻 | `transform` | 对应 spec 判据 |
|---|---|---|---|
| `0%` | `0ms` | `translateY(0) scale(1.00, 1.00)` | 起跳前 |
| `10%` | `20ms` | `translateY(0) scale(1.03, 0.94)` | 起跳前**预压** `0.94~0.97` ✓ |
| `22%` | `44ms` | `translateY(-6px) scale(1.06, 1.06)` | 峰值 `4~7px` / 时刻 `40~55ms` / 缩放 `1.04~1.08` ✓ |
| `40%` | `80ms` | `translateY(-1px) scale(1.00, 1.00)` | `80ms` 回 `1.00±0.02` ✓ |
| `100%` | `200ms` | `translateY(0) scale(0.00, 0.00)` | 完全不可见 ✓ |

`chip-flash`（`.dock-chip::after`，`200ms`）：`0~40%` `opacity: 0` → `55%`（`110ms`）峰值 `0.70` → `80%`（`160ms`）`0.15` → `100%` `0`。

**两条硬约束**：① 关键帧内**一个 `translateX` 都不出现**（门禁静态断言：`.dock-chip` 的 `@keyframes` 内零 `translateX` / 零 `translate3d(x,…)`）；② 三张牌**零错峰**（同一 `animation-delay`，不按槽序分级）——错峰会破坏「同时欢呼」的语义。

**E. 顺带修掉的一处几何缺陷（FLIP 按 id 配对，而非按下标）**

`renderDockWithFlip()` 现在**按下标配对**：`oldLeft[dockArr[i].id] = nodes[i].getBoundingClientRect().left`。`dockArr` 是**移除后**的新数组，`nodes` 是**移除前**的旧 DOM——只要被消除的槽不在末尾（如第 1/3/6 格），下标立刻错位：新数组第 1 项拿到的是「旧第 1 格（已被消除）」的 left，**补位起点算错**。

当前门禁只验「终态 `|Δx| ≤0.5px`」，而过渡最终必然归零 → **起点错了照样绿**。这是典型的「门禁看不见的缺陷」，R6 顺带修掉：

```
renderDock()          → .slot 补 data-tile-id（已有 data-idx）
renderDockWithFlip()  → oldLeftById[tileId] = 旧 .slot rect.left
                        renderDock()
                        newLeftById[tileId] = 新 .slot rect.left
                        dx = oldLeftById[id] − newLeftById[id]
```
判据：受控槽序（消除槽 = `1/3/6`）下，每张剩余牌的 `dx` 起点必须等于「该牌旧槽 left − 新槽 left」（±0.5px）——**只验终态不算通过**。

#### R6-2 开局：计时起点绑定可见首帧 + 高落差雨幕（FR-028 / SC-018）

**A. 「偷跑」根因链（已定位到具体行，逐跳可复现）**

| 跳 | 位置 | 事实 |
|---|---|---|
| ① 建局 | `main.js:439-448 tryPrepareLobby()` | 注释原文「在遮罩仍 100% 时后台完整准备大厅/局内 DOM 与 Canvas」→ 直接 `enterGame(deepIdGlobal)` |
| ② 起播 | `main.js:943` → `1086 startDealChoreography()` | `loadLevel()` 末尾**同步**调 `renderer.startDeal()`——此时 `#splash-screen` 仍是 `opacity: 1` |
| ③ 闸门 | `BoardRenderer.js:1430-1437` | `if (drawnOk && introAnim && introAnim.armed) { introGateFrames += 1; … }`——**只数「画完的帧」，不验「是否被遮挡 / 页面是否可见」** |
| ④ t0 | `BoardRenderer.js:1433` | 2 帧后写 `introAnim.startTime = now`，时间轴开始走 |
| ⑤ 遮罩 | `main.js:450-462 tryFinishSplashTransition()` | 要等 `preloadDone && splashStageReached && progressAnimationDone && lobbyPrepared` 才 `setTimeout(150)` 加 `.fade-out`（`transition: opacity .5s`），再 `+500ms` 才移除节点 |
| ⑥ 结果 | — | 落子 `400ms` **整段**跑在遮罩背后；玩家看到棋盘时牌已全部落定 → 读作「瞬间出现 / 生硬」 |

**同源旁证**：`showChallengeBanner()`（`main.js:1092-1112`）早就为同一问题打了补丁——轮询 `#splash-screen` 是否被移除（`160ms × 40`）才开播横幅。**只有落子没打这个补丁。**

**设置弹窗路径今天为何不炸**：`modals.js:96 close()` 是同步 `root.hidden = true; root.innerHTML = ''`，`onRestart` 在其后调用 → 弹窗在 `startDeal()` 之前就已不可见。但它与遮罩路径**共用同一个「不可见窗口」缺陷类别**——一旦给弹窗加退场动画、或玩家在慢机上遇到样式重算延迟，立刻复现。所以修的是**闸门的可见性判据**，不是「给某个弹窗加延时」。

**B. 四条件闸门 + 看门狗（`BoardRenderer.js`）**

1. **新增可选注入** `opts.dealVisibleProbe`：`main.js` 注入；缺省 `() => true`（Node 桩 / `render-selftest` 零影响）。
2. `frame(now)` 闸门改为：
   ```
   if (introAnim && introAnim.armed) {
     if (!dealVisible()) { introGateFrames = 0; }              // 遮挡 → 复位，t0 作废
     else if (drawnOk) {
       introGateFrames += 1;
       if (introGateFrames >= INTRO_GATE_FRAMES) { introAnim.startTime = now; introAnim.armed = false; }
     }
     dirty = true;                                             // 闸门期每帧都重绘
   }
   ```
3. `startDeal()` 记 `armedAt = nowMs()` 并起 `INTRO_GATE_WATCHDOG_MS = 1200` 计时器：到期时若仍 `armed` —— `dealVisible()` 为真则立即开闸（`startTime = nowMs()`）；**否则重挂下一轮复查**（`introWatchdogRearms += 1`，MUST NOT 静置）；累计 `armedAt` 起超过 `INTRO_GATE_WATCHDOG_MAX_MS = 8000` 才 `skipDeal()` 收口。`skipDeal()` / 开闸 / 重新 `startDeal()` 三处 MUST `clearTimeout`。
   > **R6 实测修正**：原设计「单次 `1200ms` 到期即 `skipDeal()`」在深链 `?level=N` 下会把整段雨幕吞掉——`#splash-screen` 实测要到 ≈`4.6s` 才移除，而 `startDeal()` 在 ≈`0.6s` 就被 `tryPrepareLobby()` 触发（探针实测 `act=false`、`tot=400` 却一帧未渲染）。改为「复查 + 重挂」后复测：`#202 blk="" st=null gf=1` → `#204 st=4810.2 armed=false` → `#218 act=false`（正确）。
4. `dealRemainingMs()` 在 `startTime == null` 时返回整段（现状已如此），但**闸门推迟期间返回的是「尚未开始的整段」**→ `afterIntro()` 必须改（见 D-8）。

`main.js` 侧新增 `dealVisibleNow()`：

```
function dealVisibleNow() {
  if (document.visibilityState !== 'visible') return false;
  var ids = ['modal-root', 'lobby', 'splash-screen', 'result-root', 'fail-root'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (!el || el.hidden) continue;
    var cs = getComputedStyle(el);
    if (cs.display !== 'none' && parseFloat(cs.opacity) > 0.02) return false;   // 淡出中（0.98→0.02）仍算遮挡
  }
  var c = els.board;
  if (!c) return false;
  var r = c.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
```

**成本**：闸门只有 2 帧（≈33ms），期间最多 5 次 `getElementById` + 5 次 `getComputedStyle`，且此窗口内无其它布局读取 → 可接受。若需更省，可在 `cacheEls()` 里缓存这 5 个节点引用，只在闸门期查计算样式。

**C. 高落差几何（统一落距 + HUD 安全线）**

`buildIntroPlan()` 改为：

```
fallPx = INTRO_FALL_CELL × tileSide          // 全盘统一，3.0（窗口 2.6~3.4）
```

删除 `(rr === 0) ? 0.5·tileSide : min(FALL_CELL·cell, rr·cell + 0.5·tileSide)` 整段。

**几何实测（390×844 视口 / L3 `n=7`，取自 CSS 常量推算）**：

| 量 | 值 | 来源 |
|---|---|---|
| `#hud` 高 | `70px` | `clamp(54px, 8.6%, 70px)`；`8.6% × 844 = 72.6` → 夹到 `70` |
| `#dock` 高 | `76px` | `clamp(58px, 9.2%, 76px)`；`9.2% × 844 = 77.6` → 夹到 `76` |
| 棋盘上沿 | ≈`158px` | `70 + 1 + 76 + 3 + #board-wrap padding 8` |
| 卡面边长 | ≈`50px` | 棋盘 ≈`356px` / 7 − 1 |
| 首排牌心落定 `y` | ≈`183px` | `158 + 25.5` |
| `FALL_H = 3.0` 起始 `y` | **≈`33px`** | `183 − 150` → **落在 HUD 内** |
| 末排牌心起始 `y` | ≈`339px` | `489 − 150`（仍在棋盘内） |

→ **统一落距 `3.0` 必然把首排推到 HUD 之后**，这是「高落差」与「HUD 可读」的物理冲突。**解法不是缩小落距**（缩到不压 HUD 只剩 ≈`1.1` 卡面，等于没改），而是给接缝加一条 **HUD 安全线**：

`drawIntroOutside()` 的裁剪路径由「视口 − 棋盘矩形」改为「(视口 ∩ `y ≥ hudBottom`) − 棋盘矩形」：

```
var hud = document.getElementById('hud');
var hudBottom = hud ? hud.getBoundingClientRect().bottom : 0;
v.rect(-br.left / k - cell, (hudBottom - br.top) / k - cell, (viewW + 2 * cell) / k, (viewH + 2 * cell) / k);
v.rect(0, 0, cssSize, cssSize);
v.clip('evenodd');
```

→ 牌「从 HUD 下沿钻出」，HUD 文字与按钮永不被盖住。`#vfx-canvas`（`z-index: 950`）虽在 `#dock`（`z-index: 2`）之上，但**开局时待消槽是空的**，压过它是预期效果（「从待消区上方落下」）。

**视口硬裁剪是结构性的**：`#vfx-canvas` 为 `position: fixed; inset: 0; width: 100vw; height: 100vh`（`style.css:289-296`），画布本身画不出视口外 → spec 的「MUST NOT 画出视口外」自动成立，无需额外代码。

**D. 改造清单（9 处）**

| # | 文件 / 位置 | 动作 |
|---|---|---|
| D-1 | `BoardRenderer.js:1003-1020` 常量 | `INTRO_FALL_CELL 1.0 → 3.0`；新增 `INTRO_GATE_WATCHDOG_MS = 1200`、`INTRO_FALL_CELL_MIN/MAX = 2.6/3.4`（门禁断言用） |
| D-2 | `BoardRenderer.js:1508-1538 buildIntroPlan()` | `fallPx` 改统一值（删首排收缩分支）；`totalMs` 公式不变 |
| D-3 | `BoardRenderer.js:1408-1440 frame()` | 闸门加 `dealVisible()` 前置与复位 |
| D-4 | `BoardRenderer.js:1449-1473 startDeal/skipDeal` | 起 / 清看门狗；`skipDeal` 一并 `clearTimeout` |
| D-5 | `BoardRenderer.js:1862-1892 drawIntroOutside()` | 裁剪路径加 HUD 安全线（见 C） |
| D-6 | `BoardRenderer.js:2396-2410` 导出 | `STM.rendererTest` 增 `FALL_CELL` / `GATE_WATCHDOG_MS` / 探针读取口；**退役常量同步删导出**（只删实现不删导出 = 门禁读旧值 = 假绿） |
| D-7 | `main.js:922-938 createBoardRenderer` | 传 `dealVisibleProbe: dealVisibleNow` |
| D-8 | `main.js:1077-1082 afterIntro()` | 改为「`isDealing()` 仍为真就 `32ms` 后重试」；`flushIntroGate()` 内同样前置判 `isDealing()` |
| D-9 | `main.js`（`startDealChoreography` 附近） | 新增 `dealVisibleNow()`（见 B） |

**E. 为什么不改成「遮罩移除后再 `startDeal()`」（备选方案留档）**

可行且更简单，但会引入两个新时序洞：① `enterGame` → `loadLevel` 是同步的，把 `startDeal` 推迟到遮罩移除后，`afterIntro` 队列、教学卡、横幅三条链都要跟着改（1 处改动变 4 处）；② 遮罩若因异常永不移除（preload 失败），`startDeal` 永不执行 → 棋盘停在起始态（比偷跑更糟）。**闸门 + 看门狗在渲染层一处收口，且自带「`1200ms` 复查 + `8000ms` 总预算」兜底，风险面更小。**

#### R6-3 门禁改造清单（R6 已全部落地；实测条数见 §1.8）

| 脚本 | 受影响断言 | 处理（✅ = 已落地） |
|---|---|---|
| `render-selftest.js` | 三消关键帧静态断言（`chip-rush` / `chip-impact` / `--suck-dx`）、`INTRO.FALL_CELL` | ✅ 改断言 `chip-hop` 的关键帧百分比与 `translateY` 峰值、`.dock-chip` 关键帧内零横向分量、零 `chip-rush`/`chip-impact`/`--suck-dx`；`FALL_CELL` 改断言落 `2.6~3.4`；另加看门狗常量同源 + `armIntroWatchdog()` 自调用 + 旧单次收口零残留 → **367 → 377** |
| `deal-smoke.js` | 帧闸门 / 越界 / 落距 | ✅ ⑪ 段整段重写为**三段拍**：① 1400ms 后仍遮挡 → `isDealing()` 真 / `armed` 真 / `watchdogRearms >= 1` / `startTime === null` / `gateFrames === 0`；② 解除遮挡 → 开闸；③ 假时钟 `+8500ms` → `skipDeal` 收口。另加 `GATE_WATCHDOG_MAX_MS === 8000`、全盘 `fallPx` 极差 ≤`0.5px`、首排起始牌心 `y ≤ #dock` 上沿 `+1px` → **70 → 98** |
| `delta27-verify.js` | ⑧ 越界高度 `≤0.5` 卡面 | ✅ 改 `≤3.4`；像素红线前置 `!isDealing()` 保留；新增「HUD 安全线以上零绘制」采样（`hudProbe` 自己 `skipDeal()` + `startDeal()` 再采样，避免 CDP 往返错过编舞）+ ③b 段 14 条 R6 静态 CSS 语义断言 → **120 → 129** |
| `flight-smoke.js` | 落定偏差 ≤2px | ✅ 原断言零改动；新增 6 条：受控槽序（消除槽 `1/3/6`）下 FLIP 起点 `dx` = 旧 left − 新 left（±0.5px）、被消除槽零条目、位移项数 = 实际移动牌数、旧「按下标配对」确会算错的反向证据、亚像素剔除、缺项/非数值跳过 → **56 → 62** |
| `browser-bugtest.js` | 真机抽查 | ✅ 新增 `--deep-link`（3 档 × 15 项）+ `--strict-fps`：遮罩期 `st/armed/gf` 三恒、`watchdogRearms >= 1`、开闸首帧相位 0、`total ∈ [380,420]` 且实际终点 `maxDelay+TILE ∈ [360,420]`、逐帧渲染样本 ≥3 且无 250ms 冻结、穿模帧 = 0、vfx 空闲帧零像素 + 飞行帧有像素、`.slot` 盒几何零改形；相位取证帧走页面内 `canvas.toDataURL`（CDP 截图往返 200ms+ 抓不到 400ms 落距） |

**反向验证（已执行 6/6 全绿）**：三消「零横向分量」与「闸门复位 / 看门狗重挂」、HUD 安全线两侧各一类断言，全部用 `tools/_reverse-verify.js` 模式临时改坏一次证明门禁会红灯（补丁未命中 `exit 3` 报 `PATCH-NOOP`；验完 `git checkout --` + `md5sum` 校验）。用例：RV-1 `chip-hop` 40% 加 `translate(-8px,-1px)` → `render-selftest` 红灯；RV-2 ghost chip 写回 `--suck-dx` → 红灯；RV-3 `if (!dealVisible())` 改 `if (false)` → `deal-smoke` 红灯；RV-4 重挂改回 `skipDeal()` → 红灯；RV-5 裁剪上沿 `hudY` → `0` → `delta27-verify` 红灯；RV-6 裁剪上沿 `hudY - 400` → 红灯。

**一条判据口径说明（不是放宽）**：SC-018 ① 的「可见牌数 = 全盘数」在 `FALL_H = 3.0` 下**字面不可达**——首排起始点已在 HUD 之后、部分牌甚至起始于视口之上。改读为「**处于起始姿态的牌数 = 全盘数**（允许被 HUD 安全线 / 视口上沿裁剪）」，并新增 ④ 的 `Δy ∈ [−FALL_H, 0)` 与「全盘 `fallPx` 极差 ≤0.5px」两条硬判据替代。已在 spec SC-018 ① 预留「起始态」措辞，实施时按此口径落断言。

#### R6-4 零回归边界

| # | 红线 | 验证方式 |
|---|---|---|
| R6-G1 | `(z,r,c)` 比较器一行不改；下落重叠期遮挡语义不变 | `render-selftest` 比较器断言 + `delta27-verify` 层次不变量 |
| R6-G2 | 方向性飞行零触碰（`flightPos` / 终点实时 rect / 在途并发 ≥3） | `flight-smoke` 56 项 |
| R6-G3 | 预警横幅 12/12、大厅相框、设置弹窗布局零触碰 | `SC-021` 九项 + `lobby-smoke` 83 项 |
| R6-G4 | 连击与音效零漂移：`comboCount` 5s 窗 / `comboChanged` / 飘字 `120±20ms` / `sfx_shatter` 升调 `1.00/1.06/1.12/1.18/1.25` | `audio-smoke` 120 项 + `SC-017 ⑤` |
| R6-G5 | `tiles` 数据零改写；`levels.js` `git diff` 恒空 | `deal-smoke` 纯表现层断言 + `solver` 72/72 |
| R6-G6 | `#dock` / `.slot` 的 `border`/`padding`/`background`/`border-radius` 逐项不变；`.slot` 零位移零改形 | `SC-020 ⑦` 计算样式快照 |
| R6-G7 | 断言条数只增不减；减少必须逐条说明 | §3 纪律 2 |

**实施顺序（强制）**：R6-1（CSS → `main.js` → 门禁）→ R6-2（常量 → `buildIntroPlan` → 闸门 → 接缝 → 门禁）→ 真机抽查 → 文档回写 §1.2 / §1.5 / §1.8。**两项 MUST 同批提交**（实现与门禁分开提交 = 假绿风险）。

### 2.5 技术债与已知风险

| 风险 | 影响 | 处置 |
|---|---|---|
| `main.js` 单文件承载过多职责 | 改动波及面大，回归成本高 | R1-1 优先，按模块逐个搬 |
| `levels.js` 体积随扩量线性增长 | 首屏解析耗时上升 | R1-5 增量编码 + R2-2 缓存分级 |
| 门禁脚本依赖「浏览器契约级桩」 | 桩与真实浏览器行为可能漂移 | 每轮迭代保留 1 次真机抽查（`tools/browser-bugtest.js`） |
| **门禁只验终态、不验过程起点**（R6 发现） | 例如 FLIP 补位的 `dx` 起点算错也能全绿（过渡终态恒归零）→ 缺陷长期潜伏 | R6 起：凡「过渡 / 补位 / 复位」类断言 MUST 同时断言**起点与终点**（见 §R6-1 E）；新增断言 MUST 走反向验证 |
| 历史文档口径漂移 | 误导后续开发 | 已通过本次 Spec/Plan/Tasks 三重重置收敛；后续变更就地改写，禁追加补丁段 |
| 图鉴 96 条目中部分为占位复用绘制 | 视觉重复 | R4-4 时统一替换为独立绘制或贴图 |

### 2.6 优先级与进入门槛

| 顺序 | 主题 | 进入门槛 | 退出判据 |
|---|---|---|---|
| **⓪′** | **R6 二次落地（三消原位微跃 + 开局防偷跑/高落差）** | spec.md R6 refine 已完成（FR-030 / FR-028 / SC-018 / SC-020） | `SC-018` + `SC-020` 全绿；§R6-3 门禁改造同批提交；真机抽查 `?level=12` 深链首帧相位 ≤1%；§1.2 / §1.5 / §1.8 回写 |
| ⓪ | ~~**R5 本轮缺陷修复**~~ **（✅ 2026-10-30 已收口）** | ~~spec refine 已完成（FR-028 / FR-049）~~ | `SC-018` + `SC-024` 全绿；§R5-3 门禁改写同批提交；条数变化逐条说明 —— **8 项门禁全 exit 0，条数变化见 §1.8** |
| ① | R1 代码瘦身 | R6 + R5 收口 + 全套门禁绿（8 项） | 体积目标达成 + 门禁零回归 |
| ② | R2 性能调优 | R1 完成后（避免在待拆文件上优化） | 帧率 / 首屏 / Solver 三项达标 |
| ③ | R3 手感打磨 | R2 完成后 | 每项改动配 1 条新增断言 |
| ④ | R4 内容扩量 | R1~R3 全部收口 | 扩量后 100% 可解 + 既有内容零改写 |

---

## 3. 变更纪律

1. **需求变更** → 改 `spec.md` 对应 FR 并更新 `Baseline` 行；**架构变更** → 改本文件 L1 对应模块；**任务变更** → 改 `tasks.md`。
2. 每轮迭代 MUST 跑全套门禁并记录条数变化（本文件 §1.8 表）；条数**减少**必须说明是哪条断言被删除及理由。
3. 已完成的历史任务不再回写本文——归档于 `tasks-archive.md`。
