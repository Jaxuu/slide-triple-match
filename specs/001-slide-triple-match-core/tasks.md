# Tasks — Slide & Triple / Glide Critters（当前待办）

**Baseline**: 2026-10-30 · commit `15e8e4b` + **R5 落地**（Phase 19 / T210~T221 同批提交）

**Status**: 核心开发主流程**已全部完工**；**Phase 19（R5 缺陷修复）已收口**。本文件只保留**未决事项与后续优化**。

**Propagated**: 2026-10-30 — 承接 spec.md refine（FR-028 垂直雨幕 / 新增 FR-049）：① 新增 **Phase 19（T210~T221）**「本轮缺陷修复」，执行顺序**前置**于 Phase 18 —— **已全量交付**（T216 显式标记不实现并写明依据）；② `T199` / `O-4` 作废（对角波前整体下线）；③ `T196` 判据窗口 `380~450` → `380~420`；④ §0 需求基线与 §2 纪律同步 I-7。

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

**门禁基线（2026-10-30 实测，全部 exit 0）**

| 脚本 | 断言数 |
|---|---|
| `node tools/render-selftest.js` | 349 |
| `node tools/delta27-verify.js` | 112 |
| `node tools/deal-smoke.js` | 63 |
| `node tools/flight-smoke.js` | 56 |
| `node tools/audio-smoke.js` | 98 |
| `node tools/lobby-smoke.js` | 83 |
| `node tools/icon-bbox-audit.js` | 7 |
| `node tools/solver.js` | 72/72（≈43s） |

> 每轮迭代 MUST 全跑上述 8 项；断言条数**减少**必须说明删除理由。

**编号说明**：本阶段编号为 **Phase 18**。指令中的「Phase 13」在历史 tasks 中已被 Δ27（方向性飞行 + 3D 碎块）占用并已归档，为避免「一个 Phase 号指向两份内容」的编号双指，本轮顺延为 Phase 18，任务号接续 T188。

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
- [ ] **T200** 消除演出「合体瞬间」增加 ≤1 帧定格（打击感）
  - 判据：四段边界仍可观测；总时长不超 240ms；`SC-020` 全部断言通过
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
| G-2 | **三消演出零触碰**：`chip-rush/impact/flash/solo` 四段 CSS 关键帧与 `SC-020` 十一项全绿 | `delta27-verify` 像素红线（含 `!isDealing()` 前置） |
| G-3 | **方向性飞行零触碰**：`flight-smoke` 56 项零回归 | 直接跑 |
| G-4 | **横幅 / 大厅相框 / 设置弹窗零触碰**：`SC-021` 九项 + `lobby-smoke` 83 项零回归 | 直接跑 |
| G-5 | **音效参数零漂移**：`tap` / `knock` / `dealTick` / `iceBreak` 逐项不变 | `audio-smoke` 98 项参数快照 |
| G-6 | **`tiles` 数据零改写**：花色 / 方向 / 坐标 / 层号逐字段一致，`solver` 72/72 | `deal-smoke` 纯表现层断言 + `solver` |
| G-7 | **条数变化必须说明**：任一脚本断言数减少需逐条给出删除理由 | §3 纪律 2 |

---

## 2. 执行纪律

1. **一次一个 Batch**，Batch 内可并行项已标 `[P]`（改动文件互不重叠方可并行）。
2. 每完成一个任务：跑对应门禁 → 勾选 → 提交（commit message 前缀 `perf:` / `refactor:` / `feat:` / `fix:`）。
3. **反向验证**：凡新增「删除彻底性 / 不变量」类断言，MUST 临时恢复旧实现证明其会红灯（`tools/_reverse-verify.js` 模式，补丁未命中 `exit 3`）。
4. **文档同步**：架构变更改 `plan.md` 第 1 章；需求变更改 `spec.md` 并更新 `Baseline` 行；MUST NOT 追加「Δxx 增量」补丁段。
5. **不破坏不变量**：`plan.md` §1.1 的 **I-1~I-7** 为硬边界（I-7 自 Phase 19 起生效），任一任务触及即需在 PR 描述中显式声明「如何保证不破」。
6. **执行顺序**：**Phase 19（R5 缺陷修复）→ Phase 18 Batch A~D**。Phase 19 的 Batch E/F/G 必须**同批提交**（实现与门禁改写分开提交 = 假绿风险）。
