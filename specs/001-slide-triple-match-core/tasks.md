# Tasks — Slide & Triple / Glide Critters（当前待办）

**Baseline**: 2026-10-30 · commit `13f302b`（R5 落地后）· **R6 待实施**

**Status**: 核心开发主流程**已全部完工**；**Phase 19（R5 缺陷修复）已收口**；**Phase 20（R6 二次落地）待执行且优先级最高**。本文件只保留**未决事项与后续优化**。

**Propagated**: 2026-10-30 — 承接 spec.md refine（FR-028 垂直雨幕 / 新增 FR-049）：① 新增 **Phase 19（T210~T221）**「本轮缺陷修复」，执行顺序**前置**于 Phase 18 —— **已全量交付**（T216 显式标记不实现并写明依据）；② `T199` / `O-4` 作废（对角波前整体下线）；③ `T196` 判据窗口 `380~450` → `380~420`；④ §0 需求基线与 §2 纪律同步 I-7。

**Propagated**: 2026-10-30（R6）— 承接 spec.md 第二次 refine（**FR-030 重写**：槽间横向磁吸 → 原位微跃 + 柔光升华，`200ms` 三段；**FR-028 改写**：`FALL_H 0.7~1.4` → `2.6~3.4` 统一落距 + 帧闸门四条件与 `1200ms` 看门狗）：① 新增 **Phase 20（T222~T237）**「R6 二次落地」，执行顺序**前置**于 Phase 19 与 Phase 18；② 新增 **O-9 / O-10** 两条未决事项；③ §0 门禁基线按 R5 实测重定（`349/112/63/98` → `367/120/70/120`，旧值与 `plan.md` §1.8 不一致）；④ §2 执行顺序改为「Phase 20 → Phase 19 → Phase 18」。设计依据见 `plan.md` **§R6-1**（三消逐跳根因 + 5 处改动 + FLIP 缺陷）/ **§R6-2**（偷跑根因链 + 四条件闸门 + HUD 安全线几何）/ **§R6-3**（门禁改造清单）/ **§R6-4**（零回归边界）。

---

## 0. 基准状态声明

**Phase 1 ~ Phase 17（T001 ~ T188）全部已交付，完整归档于 [tasks-archive.md](tasks-archive.md)。**

| 维度 | 基准 |
|---|---|
| 代码基线 | `index.html` + `src/`（20 文件）+ `css/style.css` + `assets/` + `tools/`（28 脚本） |
| 需求基线 | [spec.md](spec.md)（FR-001~FR-049 / SC-001~SC-024） |
| 架构基线 | [plan.md](plan.md) 第 1 章（Shipped Baseline） |
| 关卡基线 | 72 关 · 100% 机判可解 · `tools/solver-report.json` 72/72 |
| 线上基线 | `https://slide-triple-match.pages.dev` |

**门禁基线（2026-10-30 R5 落地后实测，全部 exit 0）**

| 脚本 | 断言数 |
|---|---|
| `node tools/render-selftest.js` | **367** |
| `node tools/delta27-verify.js` | **120** |
| `node tools/deal-smoke.js` | **70** |
| `node tools/flight-smoke.js` | **56** |
| `node tools/audio-smoke.js` | **120** |
| `node tools/lobby-smoke.js` | **83** |
| `node tools/icon-bbox-audit.js` | **7** |
| `node tools/solver.js` | **72/72**（≈43s） |

> 每轮迭代 MUST 全跑上述 8 项；断言条数**减少**必须说明删除理由。
> **R6 预告**：Phase 20 会让 `render-selftest` / `deal-smoke` / `delta27-verify` / `flight-smoke` 的条数上浮（见 §R6-3），落地后按实测重定本表。

**编号说明**：Phase 19 的任务号接续 T209（T210~T221）。**Phase 20（R6）接续 T221，编号 T222~T237**，虽写在文件末尾，**优先级高于全部既有 Phase**（缺陷修复先于优化）。

> 历史编号沿革（保留备查）：Phase 18 的编号原为「本阶段编号为 Phase 18；指令中的「Phase 13」在历史 tasks 中已被 Δ27（方向性飞行 + 3D 碎块）占用并已归档，为避免「一个 Phase 号指向两份内容」的编号双指，顺延为 Phase 18，任务号接续 T188」。

---

## 1. 当前未决事项（Open Issues）

| 编号 | 事项 | 现状 | 处置 |
|---|---|---|---|
| O-1 | 图鉴 96 条目中后 51 条为前 45 条的绘制/Emoji 复用占位 | 视觉重复，玩家可感知 | 归入 T206 |
| O-2 | `main.js` 2722 行、`BoardRenderer.js` 2918 行，职责偏重 | 改动波及面大 | 归入 T189 / T190 |
| O-3 | `levels.js` 492 KB，随扩量线性增长 | 首屏解析耗时上升 | 归入 T193 |
| O-4 | ~~进场编舞在 `n=4` 小盘上对角线间隔偏大（`DIAG_STEP` 夹到 48ms 上限）~~ **（2026-10-30 作废：对角波前下线，由 Phase 19 / T213 取代）** | ~~观感略「一波到底」~~ | 随 T199 一并作废 |
| O-5 | `L/R/D` 向飞行的出屏段曲线偏直 | 手感略生硬 | 归入 T202 |
| O-6 | 门禁脚本依赖浏览器桩，与真机可能漂移 | 潜在假绿 | 归入 T198 |
| O-7 | 点击**齿轮角标牌或其十字邻牌**时，`gear` 方波扫频音（300→420Hz / 160ms）与 `tap` 同帧起音并盖掉提牌声（用户报「奇怪/突兀」） | 可感知音频缺陷（FR-049） | 归入 T210 / T211 |
| O-8 | 进场为「原位缩放弹入 + 12px 微落 + 对角波前」，与《Tile Explorer》的「垂直砸落」手感不符（FR-028） | 开局观感缺陷 | 归入 T213~T217 |
| O-9 | 三消为「三张牌滑向中间槽合体」：中间的牌可能隔着不属于本组的槽 → 滑行时压过别人的槽框与卡面（穿模），且依赖 `.slot-shattering` 临时改 `overflow` 才可见，类没挂上就被裁成「突然消失」（FR-030） | 可感知表现缺陷 + 结构脆弱 | 归入 **T222~T225** |
| O-10 | 开局落子会在遮挡层背后「偷跑」：`tryPrepareLobby()` 在 `#splash-screen` 仍 `opacity:1` 时就 `enterGame` → `startDeal`，而 `frame()` 的闸门只数「画完的帧」不验可见性 → 玩家看到棋盘时牌已全部落定（FR-028） | 开局观感缺陷（瞬移/生硬） | 归入 **T226~T231** |
| O-11 | `renderDockWithFlip()` 的 FLIP 按下标配对旧/新 DOM，被消除的槽不在末尾时补位起点算错；门禁只验终态（恒归零）故长期假绿 | 潜在视觉跳变 + 门禁盲区 | 归入 **T225** |

---

## Phase 18: 深度优化与体验打磨（R1~R4）

> 顺序不可颠倒：**先减法（R1）→ 再提速（R2）→ 后手感（R3）→ 末扩量（R4）**。
> 在待拆文件上做性能优化等于返工。

### Batch A — 代码瘦身（R1）

- [ ] **T189** [P] 拆分 `src/main.js`：场景机 / 渲染循环 / 调试面板 / 经济结算四段独立
  - 判据：单文件 ≤1200 行；`index.html` 加载序仅 +2 项；`render-selftest` 349 项零回归
  - 风险：触碰事件总线，**一次只搬一个模块**，每搬完跑全套门禁
- [ ] **T190** [P] 拆分 `src/render/BoardRenderer.js`：抽出「卡牌外观绘制」与「动效编排」两组
  - 判据：绘制函数无状态；动效常量集中在文件头常量区；`deal-smoke` / `delta27-verify` 零回归
- [ ] **T191** 清理历史死代码与兼容只读字段（`cfg.lives` 之外的遗留项）
  - 判据：源码零「已废弃」注释指向的实现；`delta27-verify` 静态断言通过
- [ ] **T192** 统一常量出口：`STM.rendererTest` / `STM.AUDIO_CONFIG` 与实现同源
  - 判据：门禁读到的值 = 运行时实际值（防「只删实现不删导出」的假绿，Δ29 踩过一次）
- [ ] **T193** `levels.js` 字段压缩：`solutionMoves` 改增量编码
  - 判据：体积 ≤380 KB；`solver.js` 72/72 结论逐条零漂移

### Batch B — 性能进一步调优（R2）

- [ ] **T194** 棋盘绘制分帧：静态层与动效层分离，动效期只重绘变化区
  - 判据：满载 141 张时帧间隔 `p95 ≤16.7ms`（当前基线 ≤34ms）
- [ ] **T195** [P] 图标切片缓存分级：96 张 `256²` 常驻 + LRU 淘汰
  - 判据：首屏可交互 ≤2.0s（当前 ≤3s）；内存增量 ≤24 MB
- [ ] **T196** 低端机降级策略：`devicePixelRatio` 上限 + 动效帧率降档
  - 判据：中端安卓机稳定 ≥50 FPS；降档不改变总时长口径（进场 `380~420ms` / 消除 `200~240ms`）
- [ ] **T197** [P] Solver 提速：节点预算剪枝 + 多进程并行
  - 判据：全量 72 关 ≤20s（当前 ≈43s）；结论零漂移
- [ ] **T198** 长任务审计扩展到「切关 + 结算」窗口；每轮保留 1 次真机抽查（`tools/browser-bugtest.js`）
  - 判据：两个窗口内长任务（>50ms）计数 = 0；真机抽查记录入 `ITERATION_LOG.md`

### Batch C — 手感与细节打磨（R3）

- ~~[ ] **T199** 进场编舞波浪可读性微调（`n=4` 小盘 `DIAG_STEP` 触上限问题）~~
  - ~~判据：首末对角线间隔仍 ≥200ms；跨盘面极差 ≤40ms 不破~~
  - **（2026-10-30 作废：对角波前整体下线，前提消失；由 T213「行波时序」取代）**
- ~~[ ] **T200** 消除演出「合体瞬间」增加 ≤1 帧定格（打击感）~~
  - ~~判据：四段边界仍可观测；总时长不超 240ms；`SC-020` 全部断言通过~~
  - **（2026-10-30 R6 作废：「合体」形态已不存在——三张牌不再汇合到同一槽，改为各自原位微跃；「打击感」由新时序的 `80ms` 跳跃峰值回落段承担。见 Phase 20 / T222）**
- [ ] **T201** 受阻反馈分级：连续受阻 2/3 次时双叩音高轻微下沉
  - 判据：与提牌仍可盲听区分；`STM.AUDIO_CONFIG` 快照同步；`audio-smoke` 零回归
- [ ] **T202** `L/R/D` 出屏段曲线调优
  - 判据：`flight-smoke` 56 项零回归（时长 / 终点精度 / 压叠零违规）
- [ ] **T203** 触觉反馈（`navigator.vibrate`）在三消 / 受阻两处强度分级
  - 判据：不支持设备零报错；开关关闭零调用
- [ ] **T204** 无障碍核查：文字与卡牌对比度 ≥4.5:1、焦点可见性
  - 判据：`prefers-reduced-motion` 之外的对比度抽检通过

### Batch D — 内容与体验扩量（R4）

- [ ] **T205** 关卡扩量预案：72 → 96 关（新增 2 幅画卷）
  - 判据：现有 72 关零改写；`solver` 96/96；画卷进度键向前兼容
- [ ] **T206** 图鉴后 51 条占位条目替换为独立绘制或贴图（解 O-1）
  - 判据：96 条目视觉互不重复；`icon-bbox-audit` exit 0（96 条零裁切）
- [ ] **T207** [P] 新机关原型评估：传送门 / 单向门 / 变色卡（各 1 关原型）
  - 判据：原型关 100% 可解且不破坏 I-1（前后端同源判定）；评估后择优纳入
- [ ] **T208** 每日挑战（纯本地确定性种子）
  - 判据：零联网；同种子同局面；不引入新货币
- [ ] **T209** [P] 结算层数据可视化：本局步数 / 连击峰值 / IQ 曲线
  - 判据：纯表现层，不影响奖励确定性（`SC-010` 零回归）

---

## Phase 19: 本轮缺陷修复（R5 — FR-028 / FR-049）

> ⚠ **执行顺序前置**：本 Phase 的编号接续 T209，但**优先级高于 Phase 18 全部批次**（缺陷修复先于优化）。
> 设计依据见 `plan.md` **§R5-1**（音效根因链与修复方案）/ **§R5-2**（位移方程与缓动曲线）/ **§R5-3**（门禁改造清单）。

### Batch E — 点击链路音效唯一性（FR-049 / SC-024）

- [x] **T210** [P] `SoundManager.js` 音色表瘦身：删除 `click` / `gear` / `unlock` / `prism` / `undo` / `item` / `botTick` / `tick` 八项
  - 判据：`SFX` 仅剩 `match`（噪声 + 正弦泛音）/ `victory` / `defeat` / `iceBreak`；源码零 `square` / `sawtooth` 的一次性交互音
  - 判据：`tap` / `knock` / `dealTick` / `iceBreak` 的声学参数**逐项零漂移**（`audio-smoke` 120 项全绿）
- [x] **T211** 机制事件去音 + 同源改派（`main.js`）
  - `gear` / `unlock` / `prism` 三个分支删除 `sound.play(...)`，只留 `handleEvent` + `refresh`
  - 改派：洗牌 L1810 / L1914 → `knock`；撤销 L1868 → `knock`；磁吸 L1890 → `match`；IQ 头衔 L1337 → `knock`；Hint L2417 → `knock`；自动演示 L2518 / L2561 / L2565 / L2619 / L2626 → `tap`
  - 判据：L7 齿轮牌及其**十字邻牌**各点 5 次，每次链路内音频节点组数 `= 1`；60ms 起音窗内零第二音源
  - 判据：普通牌 / 角标牌 / 角标邻牌三类点击的 `tap` 参数逐项相同（同一 `STM.AUDIO_CONFIG.tap` 引用，零按机制分流）
- [x] **T212** [P] `audio-smoke.js` 追加 `[8] FR-049 点击链路唯一音源` 22 条断言（依赖 T210 / T211）
  - ① 源码正则：`SFX` 表零 `square` / `sawtooth` 项；② 点击链路单音源（节点组数 = 1）；③ 8 个退役音色逐个完全静默
  - 判据：**反向验证**——临时恢复 `SFX.gear` 必须红灯（`tools/_reverse-verify.js` 模式，验完 `git checkout --` + `md5sum` 校验）
  - 实测：`98 → 120` 项，exit 0

### Batch F — 垂直雨幕下落 + 微弹定格（FR-028 / SC-018）

- [x] **T213** [P] `BoardRenderer.js` 常量组与纯函数替换
  - 常量：`TILE_MS 200 / IMPACT_AT 0.78 / FALL_CELL 1.0 / SQUASH_PX 5 / DAMP 4 / COL_STEP 4 / Z_STEP 6 / ROW_STEP_MIN 16 / ROW_STEP_MAX 64 / TARGET_MS 400 / GATE_FRAMES 2` + `ROW_SPAN_MIN 150` / `COL_STEP_FLOOR 3` / `Z_STEP_FLOOR 4` / `POSE_REF_TILE 40`
  - 纯函数（**必须模块作用域**，`loadLevel` 会重建 renderer）：`introFallEase(p) = 6p² − 8p³ + 3p⁴`、`introSquashOf(τ) = SQ·e^(−4τ)·cos(πτ)`、`introPoseOf(u, fallPx, tileSize)`、`introStepsOf(n, zMax)`、`introRowStepOf(n, zMax)`、`introDelayOf(rr, cc, z, n, zMax)`、`introDealTotalMs(n, zMax)`
  - 判据：`f'(p) = 12p(1−p)²` 在 `p = 1/3` 取速度峰（33.3%）、峰值/平均 `= 1.778×`、末段 10% 位移占比 `0.370%`；`sq` 单半周期且 `τ = 1` 强制归零
  - 判据：零 `INTRO_S0` / `OVERSHOOT` / `PEAK_AT` / `DY0` / `DIAG_STEP` / `INTRO_TICK_AT`；`STM.rendererTest` 导出与实现同源
- [x] **T214** `buildIntroPlan()` 增 `fallPx`；`introTransformOf()` 改 `u` 轴（依赖 T213）
  - `fallPx = (rr === 0) ? 0.5·tileSide : min(FALL_CELL·cell, rr·cell + 0.5·tileSide)`；`dy` 现为负值（向上）
  - 判据：四档（`n=5~8` / `zMax=0~4`）`total ∈ [380,420]` 且极差 ≤25ms（实测恒 `400.000ms`、极差 **0**）；`dx` 恒 0、角度 0°
  - 判据：落定帧与静态帧**逐像素一致**；`prefers-reduced-motion` 降级仍过帧闸门、总时长不变
- [x] **T215** 首排越界接缝：`drawIntroOutside()` + `vfxWasLive` 守卫扩展（依赖 T214）
  - 复用 `drawFlightsOutside()` 的互补裁剪模式，**MUST NOT 新增第三块 canvas**（`index.html` 仍 2 块）
  - 判据：越界高度 ≤0.5 卡面边长；任一帧每牌可见面积 ≥95%（无「半张牌从边缘挤入」帧）
  - 判据：进场结束 `#vfx-canvas` 零残留（残影冻结帧数 = 0）——`vfxLive` 判据并入 `introAnim.active`
- [x] ~~**T216** [P] 辐射变体确定性选型~~ **（2026-10-30 不实现，理由见下）**
  - spec FR-028 措辞为「**允许**一个只改时序波前的辐射变体」，SC-018 ⑩ 判据为「行波 / 辐射**二者之一**，零随机」——非必须
  - 本轮只交付行波单一波前，⑩ 的确定性**构造性成立**（零随机源；`pickIntroMode` / `introSpecOf` / `dealModeLock` 已随改造删除，门禁断言零残留）
  - 不做的依据：辐射要按 `cfg.maskBase ∈ {ring, sym}` 分派，会打穿 `delta27-verify` 的全套行波断言（`byRow` / `rowMonoBad` / `lockPairs`），收益仅为「换波前方向」，与本轮「垂直急坠」诉求无关。**宁可显式标记不实现，也不留半成品开关**
- [x] **T217** 落牌涟漪改与 `IMPACT_AT` 同源（依赖 T214）
  - 判据：触底时刻起音（`el >= INTRO_TILE_MS × INTRO_IMPACT_AT`，±1 帧）；`progress = (delay − LEAD)/(maxDelay − LEAD)` 单调不减；45ms 节流不变；编舞期零 `>60ms` 持续音

### Batch G — 门禁改写与取证（与 Batch E/F 同批提交）

- [x] **T218** [P] `deal-smoke.js` 改写：四档 `380~420ms` / 极差 ≤25ms、同排起跑差 ≤8ms、首末排 ≥150ms、`Math.floor` 归一、新常量表
  - 实测：全程重写为 10 章，`63 → 70` 项，exit 0
- [x] **T219** [P] `delta27-verify.js` + `render-selftest.js` 进场段改写
  - ⑥ 多规模窗口 `[380,450]` → `[380,420]`；姿态曲线断言换为速度峰 / 末段占比 / 单半周期
  - **像素红线断言前置 `assert(!renderer.isDealing())`**（不得放宽阈值）
  - 移除彻底性断言改为零 `DIAG_STEP` / `INTRO_S0` / `OVERSHOOT` / `PEAK_AT` / `DY0`
  - 实测：`delta27-verify 112 → 120`、`render-selftest 349 → 367`，均 exit 0
- [x] **T220** 取证：60fps 帧序列录屏（L3 / L33 / L72 三档）+ 真机抽查 `tools/browser-bugtest.js`
  - 判据：三档实测 `total` 落 `380~420ms`（实测恒 `400ms`，极差 0）；帧间隔 `p95 ≤20ms` / `max ≤34ms`；穿模帧 = 0
  - 实测：`delta27-verify` ⑥ 三档（L3 / L33 / L72）与 ⑦ 三档（L2-n6 / L3-n7 / L33-n8）全绿；`browser-bugtest` exit 0
- [x] **T221** 文档转正：`plan.md` §1.2 就地改写为垂直雨幕、`data-model.md` Deal Choreography 实体重写、`quickstart.md` Q14-B 重写、`ITERATION_LOG.md` 补记
  - 已完成：`plan.md`（§1.1 I-7 / §1.2 / §1.3 / §1.8 / §1.9 / §R5-1~3 / §2.6）、`data-model.md`（废除 `In-Place Diagonal Cascade` + 新增 `Vertical Rain Drop` + Audio Bank 瘦身）、`quickstart.md`（Q14-B 重写 + 新增 Q15-A + 命令速查项数重定）、`ITERATION_LOG.md`（新增「R5 缺陷修复」章）

### 防回归红线（Phase 19 全批次适用）

| # | 红线 | 验证方式 |
|---|---|---|
| G-1 | **零穿模**：`(z,r,c)` 升序比较器一行不改；下落期重叠遮挡 = 高层压低层、同层下方牌盖上方牌 | `render-selftest` 比较器静态断言 + `delta27-verify` 层次不变量 |
| G-2 | ~~**三消演出零触碰**：`chip-rush/impact/flash/solo` 四段 CSS 关键帧与 `SC-020` 十一项全绿~~ **（2026-10-30 R6 修正：本红线只约束 Phase 19 的施工范围；Phase 20 / T222 已把四段关键帧整段替换为 `chip-hop`，`SC-020` 判据同步重写。**Phase 20 之后以 R6-G1~G8 为准**）** | `delta27-verify` 像素红线（含 `!isDealing()` 前置） |
| G-3 | **方向性飞行零触碰**：`flight-smoke` 56 项零回归 | 直接跑 |
| G-4 | **横幅 / 大厅相框 / 设置弹窗零触碰**：`SC-021` 九项 + `lobby-smoke` 83 项零回归 | 直接跑 |
| G-5 | **音效参数零漂移**：`tap` / `knock` / `dealTick` / `iceBreak` 逐项不变 | `audio-smoke` 98 项参数快照 |
| G-6 | **`tiles` 数据零改写**：花色 / 方向 / 坐标 / 层号逐字段一致，`solver` 72/72 | `deal-smoke` 纯表现层断言 + `solver` |
| G-7 | **条数变化必须说明**：任一脚本断言数减少需逐条给出删除理由 | §3 纪律 2 |

---

## Phase 20: R6 二次落地（三消原位微跃 + 开局防偷跑/高落差）

> ⚠ **优先级最高**：本 Phase 编号接续 T221，但**执行顺序前置于 Phase 19 与 Phase 18 全部批次**。
> 设计依据：`plan.md` **§R6-1**（三消逐跳根因 + 5 处改动 + FLIP 几何缺陷）/ **§R6-2**（偷跑根因链 + 四条件闸门 + HUD 安全线）/ **§R6-3**（门禁改造）/ **§R6-4**（零回归）。
> 对应需求：spec.md **FR-030 / FR-028 / SC-020 / SC-018**。
> **同批提交纪律**：Batch H / I 的实现与其对应门禁改写（Batch J）**MUST 同批提交**，分开提交 = 假绿风险。

### Batch H — 三消：原位微跃 + 柔光升华（FR-030 / SC-020）

- [x] **T222** [P] `css/style.css` 关键帧整段替换：删 `chip-rush` / `chip-impact` / `--suck-dx` / `[data-collapse-role="side"]` / `["center"]`，新增 `chip-hop`、重写 `chip-flash`
  - 保留：`.slot-shattering{overflow:visible}`（跳跃需越界可见）、`#dock .slot{padding:0;overflow:hidden;border-radius:10px}`、`chip-solo`（退化）、`dock-hit`（`≤2.5px` 纵向）
  - `chip-hop`（`200ms`）：`0% translateY(0) scale(1)` → `10% translateY(0) scale(1.03,.94)` → `22% translateY(-6px) scale(1.06)` → `40% translateY(-1px) scale(1)` → `100% translateY(0) scale(0)`
  - `chip-flash`（`::after`）：`0~40% opacity 0` → `55% 0.70` → `80% 0.15` → `100% 0`
  - 判据：`.dock-chip` 的任一 `@keyframes` 内**零 `translateX` / 零横向 `translate3d` 分量**；三张牌 `animation-delay` 完全相同（零错峰）
  - 实机验收：L3 三消时三张牌**各自留在原槽**向上跳起、纯白柔光后缩小消失；槽框左右边界零穿透；`#vfx-canvas` 零亮像素
- [x] **T223** `main.js` 常量与 `fireDockShatter()` 去横向通道（依赖 T222）
  - 常量：`COLLAPSE_TOTAL_MS 210→200`、`COLLAPSE_SHUDDER_AT_MS 130→100`、`DOCK_FREEZE_MS = 200`、`DOCK_FLIP_MS 200→60`
  - 删除 `main.js:1628-1667` 的 rects / `midRect` / `dx` 采集（含 `offsetWidth` 反推）；ghost 条目降为 `{ suit, gid }`
  - 判据：源码零 `--suck-dx` / 零 `midRect` / 零 `dx`（`shatterSlotsOf` 的槽位定位逻辑**不动**）
  - 判据：`pendingShatter` → `onFlightLand` 逐张 → 全落定才起演、`700ms` 兜底三条时序不变量零改动
- [x] **T224** `applyCollapseDom()` / `renderDock()` 收口（依赖 T223）
  - `applyCollapseDom`：去掉 `center/side` 分支与 `style.zIndex` 写入（仅 `solo` 仍打 `data-collapse-role`）；`innerHTML` 不再写内联样式
  - `renderDock`：ghost 分支不再拼 `--suck-dx`；`gLive` 判据不变
  - 判据：`#dock` 子节点仅 `.slot` / `.dock-chip`；演出结束后零残留（节点 / 内联样式 / `--*` 变量 / `animation-name` 全部清除）
  - 判据：`clearCollapseRoles()` 仍能在换关 / 重置 / Undo 后清干净（含历史遗留的 `z-index`）
- [x] **T225** FLIP 补位改「按 tile id 配对」并补起点断言（依赖 T223，解 O-11）
  - `renderDock()` 给 `.slot` 补 `data-tile-id`；`renderDockWithFlip()` 改 `oldLeftById[id] − newLeftById[id]`
  - 判据：受控槽序（消除槽 = `1/3/6`）下，每张剩余牌 FLIP 的 `dx` 起点 = 该牌「旧槽 left − 新槽 left」（±0.5px）——**只验终态不算通过**
  - 实机验收：`1/3/6` 槽三消后，剩余 4 张牌各自沿本槽平滑左移一格，无横向乱窜、无「先跳后补」
  - 判据：补位时长 `60ms`（`200~260ms` 窗口）、过冲 ≤`6%` 槽宽、`|Δx| ≤0.5px` 归零

### Batch I — 开局：防偷跑 + 高落差垂直雨幕（FR-028 / SC-018）

- [x] **T226** [P] `BoardRenderer.js` 常量与导出（无依赖，可并行）
  - `INTRO_FALL_CELL 1.0 → 3.0`；新增 `INTRO_GATE_WATCHDOG_MS = 1200`、`INTRO_GATE_WATCHDOG_MAX_MS = 8000`、`INTRO_FALL_CELL_MIN/MAX = 2.6/3.4`
  - `STM.rendererTest` 同步导出（**退役常量同步删导出**，防「只删实现不删导出 = 门禁读旧值 = 假绿」）
  - 判据：门禁读到的 `FALL_CELL` = 运行时实际值；`rendererTest` 零「已删实现仍导出」的键
- [x] **T227** `buildIntroPlan()` 改统一落距（依赖 T226）
  - `fallPx = INTRO_FALL_CELL × tileSide`（全盘一致），删除 `(rr === 0) ? 0.5·tileSide : min(FALL_CELL·cell, rr·cell + 0.5·tileSide)` 整段
  - 判据：全盘 `fallPx` 极差 ≤`0.5px`；`totalMs` 仍恒 `400.000ms`（四档极差 0）；`dx ≡ 0`、角度 `0°`
  - 判据：首排起始牌心 `y ≤ #dock` 上沿 +`1px`（桩 rect 注入）；末排起始点仍在棋盘内（不越下边界）
  - 实机验收：L3 / L33 开局时整盘像一堵牌墙**整体下移 3 个卡面高度**，前排先落、后排紧随，`380~420ms` 内齐刷刷入场
- [x] **T228** 帧闸门四条件 + 复位 + 看门狗（依赖 T226）
  - `frame()` 闸门前置 `dealVisible()`；遮挡时 `introGateFrames = 0`（`t0` 作废）；`startDeal()` 记 `armedAt` 并起 `1200ms` 看门狗（可见 → 立即开闸；**不可见 → 重挂下一轮复查** `introWatchdogRearms += 1`；累计超 `8000ms` → `skipDeal()` 收口）
  - `skipDeal()` / 开闸 / 重新 `startDeal()` 三处 MUST `clearTimeout`
  - 判据：探针 `false` 期间 `introGateFrames` 恒 `0`、`startTime` 恒 `null`；`false→true` 后必须**再过 2 帧**才记 `t0`
  - 判据：遮挡 1400ms 仍不开闸 → `watchdogRearms >= 1` 且 `isDealing()` 仍为真（**遮挡期 MUST NOT 静置**）；累计超 `8000ms` 必须收口（`isDealing()` 变假且棋盘不停在起始态）——**开局 MUST NOT 卡死**
  - 判据：`dealVisibleProbe` 缺省时行为与 R5 完全一致（`render-selftest` 桩环境零影响）
- [x] **T229** `main.js` 注入 `dealVisibleNow()`（依赖 T228）
  - 判据：`#modal-root` / `#lobby` / `#splash-screen` / `#result-root` / `#fail-root` 任一可见（`display ≠ none` 且 `opacity > 0.02`）即返回 `false`；`visibilityState !== 'visible'` 返回 `false`；棋盘 rect 宽高为 0 返回 `false`
  - 判据：闸门期每帧最多 5 次 `getElementById` + 5 次 `getComputedStyle`（可缓存节点引用），**MUST NOT 每帧 `querySelectorAll` 全表扫**
- [x] **T230** `afterIntro()` 改「`isDealing()` 未结束就重试」（依赖 T228）
  - 判据：闸门推迟 650ms 的场景下，横幅 / 教学卡 MUST 在落子**完成之后**才出现（不得压在落子上）
  - 判据：`32ms` 重试粒度，最多等到看门狗收口；不引入无限轮询（`isDealing()` 变假即放行）
- [x] **T231** `drawIntroOutside()` 加 HUD 安全线裁剪（依赖 T227）
  - 裁剪路径：「视口 − 棋盘矩形」→「(视口 ∩ `y ≥ hudBottom`) − 棋盘矩形」
  - 判据：HUD 区域（`y < #hud` 下沿）内进场牌像素恒 `= 0`——导航按钮与 IQ 读数**永不被盖住**
  - 判据：越界高度 ≤`3.4` 卡面边长；`#vfx-canvas` 零残留（`vfxLive` 判据仍并入 `introAnim.active`）；`index.html` 仍 **2 块 canvas**
  - 实机验收：`?level=12` 深链首屏，牌从 HUD 下沿「钻出」而非从视口外凭空冒出；`#dock` 面板可被牌短暂压过（开局槽位为空，属预期）

### Batch J — 门禁改写与取证（与 Batch H / I 同批提交）

- [x] **T232** [P] `render-selftest.js` 三消段重写（依赖 T222 / T224）
  - 断言 `chip-hop` 关键帧百分比与 `translateY` 峰值、`chip-flash` 峰值与回落时刻、`.dock-chip` 关键帧零横向分量、零 `chip-rush`/`chip-impact`/`--suck-dx`/`data-collapse-role="side|center"`
  - 断言 `INTRO.FALL_CELL ∈ [2.6, 3.4]`、`GATE_WATCHDOG_MS = 1200`、`GATE_WATCHDOG_MAX_MS = 8000`
  - 判据：条数只增不减；新增「零横向分量」断言 MUST 走**反向验证**（临时恢复 `chip-rush` 必须红灯）
- [x] **T233** [P] `deal-smoke.js` 新增 5 条闸门/落距断言（依赖 T227 / T228 / T229）
  - ① 探针 `false` → `introGateFrames ≡ 0`、`startTime ≡ null`；② `false→true` 后必须再过 2 帧才记 `t0`；③ 看门狗三段拍（遮挡 1400ms 仍重挂 → 解除后开闸 → 假时钟 `+8500ms` 收口）；④ 全盘 `fallPx` 极差 ≤`0.5px`；⑤ 首排起始牌心 `y ≤ #dock` 上沿 +`1px`
  - 判据：`70 → ≥76` 项（实测 **98**），exit 0；**反向验证**「删掉可见性前置」与「重挂改回 `skipDeal()`」必须各自红灯
- [x] **T234** [P] `delta27-verify.js` 越界上限与 HUD 采样（依赖 T231）
  - ⑧ 越界高度 `≤0.5` → `≤3.4` 卡面边长；像素红线前置 `!isDealing()` 保留
  - 新增「HUD 安全线以上零绘制」采样（局部窗口读像素，**禁全画布 `getImageData`**——150 万像素 100ms+ 会跳过窗口）
  - 判据：净条数不变或上浮，exit 0
- [x] **T235** [P] `flight-smoke.js` 新增 FLIP 起点断言（依赖 T225）
  - 受控槽序（消除槽 `1/3/6`）下 FLIP 起点 `dx` = 旧 left − 新 left（±0.5px）
  - 判据：`56 → 62` 项（实测 **62**，起点配对 5 条 + 反向证据 1 条），exit 0；既有「落定偏差 ≤2px」零回归
- [x] **T236** 真机取证：`tools/browser-bugtest.js` 增「深链首帧」场景 + 三档截图
  - 场景：`?level=12` 首帧采样——遮罩仍可见时棋盘必须处于起始态且 `t0` 未记；遮罩移除后逐帧采样，首帧相位 ≤`1%`
  - 判据：L3 / L33 / L72 三档 `total` 落 `380~420ms`（实测实际终点 `363.7 / 361.7 / 375.0ms` 为 `maxDelay + TILE`，公式值 `400ms` 属保守高估）；帧间隔默认断言「样本 ≥3 且无 250ms 冻结」，`--strict-fps` 才硬断言 `p95 ≤20ms` / `max ≤34ms`；穿模帧 `= 0`
  - 判据：三消窗口内 `#vfx-canvas` `alpha>2` 像素数恒 `0`；`.slot` 计算样式逐项不变
  - 产物：截图与 JSON 存 `shots/`（**不入库**，`.gitignore` 已覆盖）
- [x] **T237** 文档回写：`plan.md` §1.2 / §1.5 / §1.8 按实测重定、`data-model.md` §10（`Vertical Rain Drop` 的 `FALL_CELL` 与 `Pure-Card Collapse` → `In-Place Hop Collapse`）、`quickstart.md` Q14-A/Q14-B 重写、`ITERATION_LOG.md` 补记 R6 章
  - 判据：四份文档零 `⚠️ STALE` 残留；`data-model.md` 零 `FALL_CELL 1.0` / 零 `chip-rush`；`quickstart.md` 命令速查项数与实测一致

### 防回归红线（Phase 20 全批次适用）

| # | 红线 | 验证方式 |
|---|---|---|
| R6-G1 | **零穿模**：`(z,r,c)` 升序比较器一行不改；下落重叠期遮挡 = 高层压低层、同层下方牌盖上方牌 | `render-selftest` 比较器静态断言 + `delta27-verify` 层次不变量 |
| R6-G2 | **方向性飞行零触碰**：`flightPos` / 终点实时 rect / 在途并发 ≥3 | `flight-smoke` 57 项 |
| R6-G3 | **横幅 12/12 + 大厅相框 + 设置弹窗布局零触碰** | `SC-021` 九项 + `lobby-smoke` 83 项 |
| R6-G4 | **连击与音效零漂移**：`comboCount` 5s 窗 / `comboChanged` / 飘字 `120±20ms` / `sfx_shatter` 升调 `1.00/1.06/1.12/1.18/1.25` | `audio-smoke` 120 项 + `SC-017 ⑤` |
| R6-G5 | **`tiles` 数据零改写**：花色/方向/坐标/层号逐字段一致；`levels.js` `git diff` 恒空 | `deal-smoke` 纯表现层断言 + `solver` 72/72 |
| R6-G6 | **槽框冻结**：`.slot` 的 `border`/`padding`/`background`/`border-radius` 逐项不变，零位移零改形 | `SC-020 ⑦` 计算样式快照 |
| R6-G7 | **过渡类断言必须验起点**（不止终态） | T225 / T235 的 FLIP 起点断言；新增断言走反向验证 |
| R6-G8 | **条数只增不减**，减少必须逐条说明理由 | §2 纪律 2 |

---

## 2. 执行纪律

1. **一次一个 Batch**，Batch 内可并行项已标 `[P]`（改动文件互不重叠方可并行）。
2. 每完成一个任务：跑对应门禁 → 勾选 → 提交（commit message 前缀 `perf:` / `refactor:` / `feat:` / `fix:`）。
3. **反向验证**：凡新增「删除彻底性 / 不变量」类断言，MUST 临时恢复旧实现证明其会红灯（`tools/_reverse-verify.js` 模式，补丁未命中 `exit 3`）。
4. **文档同步**：架构变更改 `plan.md` 第 1 章；需求变更改 `spec.md` 并更新 `Baseline` 行；MUST NOT 追加「Δxx 增量」补丁段。
5. **不破坏不变量**：`plan.md` §1.1 的 **I-1~I-9** 为硬边界（I-7 自 Phase 19 起生效；**I-8「计时起点绑定真实可见帧」/ I-9「原位优先」自 Phase 20 起生效**），任一任务触及即需在 PR 描述中显式声明「如何保证不破」。
6. **执行顺序**：**Phase 20（R6 二次落地）→ Phase 19（R5，已收口）→ Phase 18 Batch A~D**。Phase 20 的 Batch H/I 与 Batch J **必须同批提交**（实现与门禁改写分开提交 = 假绿风险）。
