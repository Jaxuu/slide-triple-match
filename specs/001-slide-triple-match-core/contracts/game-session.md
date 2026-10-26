# Contract: Game Session / UI / Rendering / Audio / Debug（前端运行时接口）

> **Propagated**: 2026-10-25 — **Δ22（全景声学 + 5 秒连击 + 15 种开局编舞）** refine 传播：**§5 SoundManager 全节重写**（混合双轨架构 + 统一 API + `comboChanged` 事件契约 + 事件→音效映射的轨道归属）；**§4 BoardRenderer 新增「开局进场编舞」契约**（15 种模式 + `180/1000ms` 时序 + 层级不变量 + 点击快进）；§6 main.js 补连击飘字与编舞调度职责。**四条 STALE 警告（Δ14/Δ16/Δ19/Δ21）一并清除**——但请注意下方「仍未同步项」，勿误认为该四轮增量已全部落入本契约。
>
> **仍未同步项（明确记录，勿误认为已补齐）**：本契约仍未覆盖 ① **Δ16** 的 `src/ui/*` 五模块（`splash.js` / `lobby.js` / `modals.js` / `result.js` / `fail.js`）与 `src/core/profile.js` 的接口契约；② **Δ19** 的 `src/render/shape-masks.js` 掩码契约、`RulesEngine` 自愈 API（`findHeadOnDeadlocks` / `selfHealDeadlocks`）、顶部导航栏与 IQ 条 DOM 契约、三大道具 `useItem` 签名变更（`wrench` 已下线）；③ **Δ21** 的 `#vfx-canvas` 碎片渲染契约与 `findBestNextMove(state)` 完整签名。上述三项在 [plan.md](../plan.md) 的「Project Structure」与 [tasks.md](../tasks.md) 的 T064~T104 中已有权威定义，**实现期以那里为准**；本契约待后续 `refine.propagate` 补齐。

> **Propagated**: 2026-10-26 — **Δ27（方向性飞行轨迹 + 进场清晰度与逐张节奏 + `shards` 3D 碎块）** refine 传播：§4 编舞契约表**就地修订**（时序改按 `180 + max(260,(N-1)×12) + 260 + 55×zMax` 自适应，原 `<= 1000ms` 上限作废；新增「逐牌节奏」「同坐标层序锁」「入场清晰度」三行）；新增 **§4.1 卡牌飞行轨迹契约**（`startFlight` / `flightOf` / `dockPending` / `flightsOf` / `cancelFlights` / `invalidateDockGeometry` / `dockSlotCentersOf` / `drawOrderOf` + 四向轨迹 + **绘制序铁律** + 落定回调顺序）与 **§4.2 碎块图集与三消碎裂契约**（`STM.spawnDockShatter` / `vfxShardsOf` / `ShardAtlas` + 键控双阈值 + 发射参数 + 降级 + 槽内 `180ms` 保留期）；§6 main.js 补 `pendingDock` 配对与 `onFlightLand` 揭示门控职责。**边界不变**：飞行与碎块均为**纯表现层**，MUST NOT 触碰规则语义、关卡数据与持久化。

**Feature**: `001-slide-triple-match-core` | **文件**: `index.html`, `css/style.css`, `src/main.js`, `src/core/GameState.js`, `src/render/BoardRenderer.js`, `src/audio/SoundManager.js`

**用户可见行为契约**以 [spec.md](../spec.md) FR-001~008、FR-013~028 为准；本文档定义模块间接口与 UI 契约。规则语义（FR 引擎侧）见 [rules-engine.md](rules-engine.md)，本文件不重复。

## 1. 脚本加载序与命名空间（index.html）

classic script、固定顺序、全部 `defer`（D-01）：

```html
<script defer src="src/data/levels.js"></script>       <!-- → STM.LEVELS -->
<script defer src="src/core/RulesEngine.js"></script>  <!-- → STM.RulesEngine -->
<script defer src="src/core/GameState.js"></script>    <!-- → STM.GameState -->
<script defer src="src/render/BoardRenderer.js"></script> <!-- → STM.createBoardRenderer -->
<script defer src="src/audio/SoundManager.js"></script>   <!-- → STM.createSoundManager -->
<script defer src="src/main.js"></script>              <!-- → 应用入口（DOMContentLoaded boot） -->
```

共享单全局命名空间 `window.STM`。禁止：动态 import()、fetch 加载代码/数据、任何 `<script type="module">`。

## 2. GameSession（`STM.GameState`，会话编排层）

**职责**: 持有 EngineState 与快照栈，编排引擎调用、输入锁、动效时序、计分记账、事件分发（Renderer/SoundManager 订阅）。**不实现任何规则**。

```js
const session = STM.GameState.createSession(levelDef, {
  onEvent(e) {...},     // 引擎 TapResult.events + 会话级事件(phase/score/combo/lives/item)
  onTerminal(o) {...},  // {kind:'won'|'lost_burst'|'lost_lives'|'lost_deadlock'}
});

session.tap(tileId);        // 公共动作 API（Bot/Hint 与玩家输入同一入口）
session.useItem(item, tileId?); // 'undo'|'wrench'（Δ9: 'stage' 已移除）
session.reset();            // 重置当前关（调试面板/败局重玩）
session.state();            // 只读视图 {phase, score, combo, lives, items, dock, board}
session.onRail();           // bool: 自加载以来动作序列 == solutionMoves 前缀（D-06 Bot/Hint 基准）
```

**输入锁（Δ10 无锁连点）**: 已彻底移除 ANIMATING/SETTLING 动画锁与「别急，动画中…」提示——`tap()` 在 READY 态 0ms 瞬时结算（applyTap 同步执行），飞出滑块所在格子立即腾空（下层滑块可被紧接的下一次点击命中）；动画为纯视觉异步并发（飞向 Dock / 回弹 / 三消粒子同时在场互不阻塞），`hitTest` 始终检测逻辑态当前栈顶滑块。仅终态（won/lost_*）拦截棋盘点击；扳手目标选择期间棋盘点击优先派发给道具。

**计分**: match 事件 × (comboBase + combo × comboStep)；连击窗口 = 连续三消间隔 < 1.5 s。best 分写 Progress（D-03）。

**Undo**: 每原子回合（applyTap/applyItem 一次）前 `RulesEngine.snapshot` 入栈；`useItem('undo')` 弹栈 `restore` + 发全量重绘事件。栈深 = 引擎快照（级联整体回滚天然成立，FR-024-1）。

## 3. 视图结构（index.html / css/style.css）

```text
#app (9:16, aspect-ratio, D-13)
├── header #hud          关卡名/编号 · 生命(♥×3 DOM) · 连击/分数
├── #board-wrap           Canvas #board（BoardRenderer 全权）+ 层叠的动效层
├── #dock                 7 格收集槽（DOM 格子 + 滑块 chip SVG；Δ9: #staging 已移除，垂直空间并入棋盘与 Dock）
├── #items                道具栏 2 键居中（Undo/Wrench，次数角标；不可用时禁用态；Δ9: item-stage 已移除）
└── #debug-panel          评委调试面板（PC 侧栏 / 移动抽屉，§7）
    #result-overlay       胜/负结算浮层（DOM 弹层）
```

- 响应式断点：`< 720px` 手机满视口（100dvh）；`≥ 1024px` PC 居中 + 右侧 320px 面板（宪章 IV / FR-007）。棋盘 Canvas 自适应 `clientWidth × devicePixelRatio`。
- **PointerEvents 唯一输入模型**（宪章 IV 红线）：canvas/DOM 目标统一绑 `pointerdown`（tap 判定）/`pointerup`（拖动取消语义不需要——本游戏无拖动；仅点击）。禁止出现 touchstart/mousedown。
- 动效：飞出 = 沿 path 位移 + 缩放淡出；受阻 = 前冲-回弹 + 棋盘震动（CSS transform shake）；三消 = 3 chip 聚合爆闪 + Canvas 粒子；齿轮转向 = 90° 旋转过渡（UI 即时可见，FR-013）；破冰 = 冰层碎裂粒子；棱镜 = 折线路径动画。

## 4. BoardRenderer（`STM.createBoardRenderer(canvas, session, opts)`）

**职责**: Canvas 2D 绘制棋盘/滑块/箭头/机关/粒子（rAF 脏检查循环，60fps 目标）。

**花色表（8 种，颜色 + 图形双编码，无障碍）**——固定契约（M1.5 升级为鲜艳水果/麻将主题，纯 Canvas 程序化绘制）：

| s | 花色名 | 主色 fill | 徽章深色 deep | 图形（Canvas path） |
|---|---|---|---|---|
| 0 | 草莓 | #FF4D6D | #B01739 | 倒心形果身+叶冠+籽点 |
| 1 | 甜橙 | #FF8A00 | #B35A00 | 圆果身+小叶+高光 |
| 2 | 菠萝 | #FFC531 | #A87A00 | 网纹椭圆+放射冠叶 |
| 3 | 奇异果 | #7CB342 | #4E7526 | 果肉+浅芯+放射黑籽 |
| 4 | 蓝莓 | #4A6CF7 | #2438A0 | 深蓝圆果+五瓣冠口 |
| 5 | 葡萄 | #9B4DE0 | #5F22A0 | 三簇紫珠+茎 |
| 6 | 蜜桃心 | #FF7EAB | #C74B78 | 心形粉果+对缝线 |
| 7 | 翡翠竹 | #00A878 | #00674B | 翡翠牌+三段白竹节 |

**滑块视觉契约（M1.5 立体奶油麻将牌面）**：牌面 `#FFFDF9` 渐变 + 深色暖棕厚度底座（堆叠层数越多底座越厚；Δ11: 厚度系数按格宽分级收紧——8×8 小格 5 层不越界）+ 花色描边与内侧高光；方向箭头 = 花色深色胶囊徽章 + 白色人字箭头，置于牌面中心偏 `d` 侧。**Δ7 堆叠渲染**：非顶层滑块向左上错层偏移（Δ11: 偏移系数按格宽分级——小格收紧）；左上角层角标（每层一点，白点=顶层；**深度 >4 时改为数字角标**——5 层 5 点在小格越界）预告下层；顶层飞出发 `reveal` 事件 → 次顶层上浮动画（REVEAL_MS ≈380ms）。**Δ8 凌空飞越渲染**：`z >= 1` 高层滑块飞出动画保持层高——上移偏移（每层 ≈0.22 cell）+ 起飞放大（近镜头感，渐收）+ 地面椭圆暗影投影（随高度虚化）；受阻弹回动画同带层高偏移。暗底 #1B2430 / 点阵格线 #26313E；每色明度差 ≥2:1 于底色、图形互异（色盲可辨）。

**机关绘制契约**: 齿轮角标 = 滑块右上角小齿轮图形 + 滑块底色描边；冰封 = 半透明冰蓝覆盖 + 厚度数字/裂纹层数（FR-017）；锁链 = 格四角链条 SVG 角标；钥匙 = 滑块左上钥匙角标 +（hover/选中时）链路提示线连向配对锁（FR-020）；棱镜 = 格内粗斜杠条（/ 或 \）+ 边框高亮，与滑块/障碍显著区分（FR-023）。

**粒子**: 三消爆裂（花色色粒子 12~20 个，重力+衰减）、破冰碎屑（白蓝）、飞出拖尾。单帧粒子 ≤ 200。

**开局进场编舞契约（Δ22 / FR-052）**：

| 项 | 契约 |
|---|---|
| `startDeal(modeId)` | 启动进场编舞；`modeId` 为 15 种之一（缺省由 `main.js` 抽取后传入）；重复调用 MUST 幂等（先快进上一次） |
| `skipDeal()` | 立即快进至 `100%`（全部卡牌归位、`alpha = 1`、压制锁定按 FR-044 §4 生效），返回后棋盘立即可交互 |
| `isDealing()` | 返回 `boolean`；`main.js` 的 `pointerdown` 前置检查据此决定是否先 `skipDeal()` 再走正常命中判定（**MUST NOT 吞掉该次点击**） |
| 时序 | `0 ~ 180ms`：全部卡牌 `alpha = 0`，仅绘制风景底图；`180 ~ totalMs`：逐牌落定。**Δ27 修订**：`totalMs = 180 + max(260, (N-1) × 12) + 260 + 55 × zMax`（`N` = 卡牌数、`zMax` = 最高层号），原「动画总时长 `<= 1000ms`」固定上限**作废**（`260/(1000-180-260) × 141 ≈ 69` 张在途，与「逐张可辨」算术上不可兼得）；实测三档：`L1(N=18,z=0) = 700ms` / `L46(N=84,z=2) = 1546ms` / `L33(N=141,z=4) = 2340ms` |
| **逐牌节奏（Δ27 / FR-052 §9，MUST）** | 逐牌错峰步长 `>= 12ms`；任一帧在途卡牌数 `<= 22`。实现要点：层高补偿 `+55ms*z` **只进排序键、不直接叠加到 `delay`**——`gcd(12, 55) = 1` 会把相邻落点挤到 `2ms`（旧实现实测满载在途 `35` 张）；`introSchedule()` 按最终名次**均分** `spread = max(260, (N-1)×12) + zMax×55` |
| **同坐标层序锁（Δ27，MUST）** | 同一 `(r, c)` 渲染坐标下的多张卡牌，其落定槽位 MUST 按 `z` 升序重排（组内取用同一批槽位）——使「先底层后顶层」从启发式变为**硬保证**；实测最差层间间隔 `13.571ms > step` |
| **入场清晰度（Δ27 / FR-052 §8，MUST）** | `a0 >= 0.62` 且 alpha 在进度 `35%` 内达 `1.0`；等比缩放 `<= 1.15`、下限 `0.2`；非等比压缩（`\|sx-sy\| > 0.1`）较小轴 `>= 0.55`；`blinds_flip` MUST 走水平 `ctx.clip` **遮罩揭示**（旧式 `scaleX → 0.05` 会把图案压扁 = 用户报告的"糊"）；MUST NOT 用 `ctx.filter` 模糊；同一卡牌同一帧 MUST 只绘制一次（禁残影叠层）；落定即回静态路径（零残余缩放 / 亚像素偏移） |
| 逐牌回调 | 每张卡牌落定触发 `onDealTick(tile)` → `SoundManager.playDealTick(progress)`（节流 `>= 45ms`，单声 `15~22ms` 木质微触，音高随进度**由高到低**收敛 `320→180Hz`） |
| **绘制排序（MUST）** | 动画期间 MUST 复用静态渲染**同一比较器** `(a.z - b.z) \|\| (a.r - b.r) \|\| (a.c - b.c)` 升序；MUST NOT 为动画另建排序 |
| **层级延迟（MUST）** | 同一渲染坐标下高层 `z` 的落定时刻恒比低层晚 `+55ms * z`——**先落底层、后落顶层，零穿模** |
| 坐标口径 | 起落坐标 MUST 复用 `getTileCssRect()`（含奇偶层半格偏移），MUST NOT 用逻辑坐标 `(c+0.5)*cell` 直算 |
| 降级 | `prefers-reduced-motion: reduce` → 一次性淡入（无位移 / 旋转 / 缩放），**保留 `180ms` 底图停留** |
| 纯表现层 | MUST NOT 改变卡牌花色/方向/坐标/层号；MUST NOT 触发 Solver、关卡生成或持久化 |

**15 种 `modeId` 枚举**（逐字锁定）：`diagonal_cascade` / `center_ripple` / `outer_converge` / `spiral_vortex` / `wings_clasp` / `sky_rain` / `layer_stack` / `zipper_interleave` / `windmill_quadrants` / `v_formation` / `checkerboard_weave` / `blinds_flip` / `deck_deal` / `tailwind_glide` / `starlight_scatter`。

### 4.1 卡牌飞行轨迹契约（Δ27 / FR-053）

**职责**：把「点击 → 卡牌飞向待消槽」补成连续可见的一段，并保证飞行期间**棋盘其余卡牌图层绝对稳定**。

| 项 | 契约 |
|---|---|
| `startFlight(tileId, slotIndex, dirHint)` | 启动单张飞行，返回飞行记录或 `null`（无几何缓存等异常路径 → 不飞，直接落定）。`slotIndex` 缺省时依次回退 `pendingDock[tileId]` → `lastDockSlot`；`dirHint` 缺省取卡牌自身 `t.d` |
| `flightOf(tileId)` | 在途则返回记录 `{ tileId, dir, slotIndex, seg, t0, dur, dur1, dur2, fromX, fromY, toX, toY, dropH, eased }`，否则 `null`。**`drawBoardTile` 内按此施加 `dx/dy/sx/sy/alpha`（与 `blockDx` / `introTransformOf` 完全同构：归位或离场即返回 `null` 走静态路径）** |
| `dockPending(tileId)` | `true` = 该牌已入槽但尚未落定 → `main.js` 的 `renderDock()` MUST 输出 `<div class="slot empty"></div>`（保持空槽态，不提前露出卡牌） |
| `flightsOf()` / `cancelFlights()` | 只读快照 / 清空在途（`reset` / Undo / 换关时 MUST 调用） |
| `invalidateDockGeometry()` / `dockSlotCentersOf()` | 窗口尺寸变化时重算并失效槽位几何缓存；后者返回 7 个槽位中心的实时 `getBoundingClientRect()` 结果（border-box 中心，与 `.slot.empty` 同框） |
| `drawOrderOf()` | 返回上一帧实际绘制序（卡牌 id 数组），供 `flight-smoke` / `delta27-verify` 断言「升序未被破坏」 |
| **四向轨迹（MUST）** | `U`（`d === 0`）单段直飞 `220ms`；`L`/`R`/`D` 两段——先沿自身箭头方向滑出棋盘边界（`80~140ms`，`FLIGHT_EXIT_SPEED = 1.9`），再自槽位上沿落入（`170ms`，`0.92 → 0.82` 缩放）。总时长 `<= 320ms`，全程 alpha `>= 0.55` |
| **绘制序铁律（MUST，本增量最高优先级）** | 飞行牌 MUST 经 `tileInfo` 合成回**同一份** `renderList` 并共用未改动的 `(a.z-b.z)\|\|(a.r-b.r)\|\|(a.c-b.c)` 升序比较器；**MUST NOT 把飞行牌统一置于最顶层**（旧实现即如此 → 低层飞行牌盖住高层静止牌 = 「旁边卡牌短暂变成底层」的根因）。仅 `seg === 'offboard'`（卡牌中心越出棋盘可视矩形）才退出该序单独绘制，越界部分由既有 `#vfx-canvas` 用 even-odd 互补裁剪接续（**零新增 canvas 元素**） |
| **槽位归属（MUST）** | 由 `pendingDock[tileId]` 与引擎 `dock` 事件 1:1 精确配对（`dock` 先于 `flyout` 下发）；**MUST NOT** 用 `lastDockSlot` 之类的全局推测（连点会错配） |
| **落定回调顺序（MUST）** | `tick()` 内 MUST **先 `flights.splice()` 再 `landFlight()`**——否则回调里 `dockPending` 仍为真 → 槽位永不揭示（`flight-smoke` C⑫b / D⑦ 为常驻护栏）。回调 `onFlightLand(tileId, slotIndex)` → `main.js: renderDock()` |
| 槽位冻结 | 飞行期间 MUST NOT 增删 `.slot` 的 `class` / 子节点；`has-tile` 只许在落定后切换；`#dock` 托盘与 `.slot` 的 `border`/`padding`/`background`/内凹高光 MUST NOT 变更 |
| 兜底 | `<= 400ms` 兜底定时器防异常滞留；`prefers-reduced-motion: reduce` → 零位移直接落定（`90ms`，保留落槽音与槽位揭示） |
| 纯表现层 | MUST NOT 影响归拢顺序、命中判定与可解性；MUST NOT 触发 Solver / 持久化；MUST NOT 持久化飞行态 |

### 4.2 碎块图集与三消碎裂契约（Δ27 / FR-049 §8~§13）

| 项 | 契约 |
|---|---|
| `STM.spawnDockShatter(slotRects)` | 全局入口；`slotRects` = 3 个消除槽的 `DOMRect` 数组。委托给最近一次 `createBoardRenderer` 的实例方法 |
| `vfxShardsOf()` | 返回当前存活碎片数组（`{ x, y, vx, vy, rot, vr, life, maxLife, size, kind }`），供 `shard-vfx-smoke` / `delta27-verify` 断言数量、配比与物理 |
| `ShardAtlas` | `{ src, size: 2048, grid: 3, cellPx: 2048/3, slices[9], bbox[9], keyState: 'idle'\|'ready'\|'failed', keyMs }`；`rendererTest.ShardAtlas` 外露只读视图 |
| 素材与路径 | 权威路径 **`assets/icons/shards.jpg`**（用户确认的唯一素材：`2048×2048`、3×3 = 9 枚白瓷 3D 碎块、纯黑底、无 alpha）；按 `.png → .jpg` 探测链加载；`.png` 仅作可选增强 |
| 键控（MUST） | 双阈值：`max(R,G,B) <= 24` → alpha `0`；`24 < max <= 40` → alpha 线性渐变 + RGB 提亮消暗边；`> 40` → alpha `255`。MUST 用 `{ willReadFrequently: true }` 上下文做**单次**回读，MUST 早于 `startDeal()`（实测 `114~124ms`，近黑残留 `< 2%`） |
| 九宫格边界 | 格宽 `2048/3 ≈ 682.67`，取格 MUST 允许小数边界（`Math.floor/ceil`），**MUST NOT 向下取整丢边缘**；9 枚 MUST 全部可用 |
| 发射（MUST） | 每次三消 `120~150` 枚（旧实现固定 `90` 枚，不符）；同帧 `>= 6` 种切片；重力 `>= 2600 px/s²`、向下初速 `>= 300 px/s`、水平 `120~520 px/s`、角速度 `>= 4 rad/s`、生命 `420~620ms` 随机；MUST NOT 加阻力或终速限制（「纸片慢飘」的成因是低重力 + 恒定 `480ms`） |
| 性能（MUST） | 单枚一次 `drawImage`；MUST NOT 用 `ctx.filter`、MUST NOT 逐枚 `clip`；三消峰值帧 `p95 <= 20ms / max <= 34ms` |
| 降级 | 素材缺失或键控失败（`keyState === 'failed'`）→ 回退 FR-049 §3 程序化 Low-Poly 碎片（`makeVerts` 路径保留），游戏完整可玩、控制台零报错 |
| 槽内保留期（Δ27 新增） | `match` 事件到达后 3 张匹配卡牌先在槽内停留 `180ms` 并播放震颤裂纹（`.slot-shattering`），随后碎裂消失并由 `spawnDockShatter` 接管；`main.js` 用 `dockFreezeUntil` 冻结该窗口内的 `renderDock()` 重绘 |


## 5. SoundManager（`STM.createSoundManager(opts)`）

**Δ22：由「纯合成」重构为混合双轨（Hybrid Dual-Track）。** 对外 API 统一，**调用方 MUST NOT 感知轨道差异**。

### 5.1 双轨分工

| 轨道 | 承载 | 加载 / 合成方式 | 硬红线 |
|---|---|---|---|
| **外部资产轨** | `bgm_lobby` / `bgm_game` / `sfx_shatter` / `sfx_win` / `sfx_lose` / `sfx_voice_good` / `sfx_voice_great` / `sfx_voice_unbelievable`（共 8 个，`assets/audio/`） | `new Audio('assets/audio/x.mp3')` + `preload = "auto"`；每音效**独立实例池** | **MUST NOT 用 `fetch + decodeAudioData`**（`file://` 下 `Origin: null` 必 CORS）；单文件 `error` 静默降级；BGM 缺失回退程序化合成 |
| **合成轨** | `tap`（`ber~`）/ `blocked`（`deng~`）/ `dealTick`（落牌涟漪）/ `splashChord`（开机和弦） | `AudioContext` 振荡器 + 物理包络（attack / decay） | **MUST 零文件依赖**（延迟敏感 / 首帧可用性） |

### 5.2 统一 API

| 方法 | 参数 | 行为与约束 |
|---|---|---|
| `preload()` | — | 预载 8 个外部资产，返回 `Promise<{ready: string[], failed: string[]}>`；失败不抛错 |
| `playBgm(which)` | `'lobby' \| 'game' \| null` | `lobby` → 音量 `0.45`；`game` → `0.38`（**Δ23 由 `0.26` / `0.20` 修订**，配套 `assets/audio/` 8 文件 loudnorm 归一至 BGM `−18 LUFS` / 音效 `−14 LUFS` / 语音 `−13 LUFS`）；切换时 **`350ms` 交叉淡变**（音量渐变，非硬切）；`null` = 全部淡出。快速回切 MUST 平滑、**MUST NOT 叠音** |
| `kickBgm()` | — | **Δ23 新增**。幂等兜底：`!bgmMuted && unlocked` 且当前场景轨 `paused` 时立即 `play()` 并复位到目标音量；正在播放时为零开销空操作（MUST NOT 重播/叠音）。由 `document` 级**常驻** `pointerdown` / `click` / `keydown` 自动调用，覆盖「`play()` 被 autoplay 策略 reject」「切后台回来被系统暂停」「设置里刚打开开关」三类场景 |
| `playSfx(name, opts)` | `name`（外部轨音效名）, `opts = {rate = 1.0, delay = 0}` | 瞬发（`sfx_shatter` 为 0ms）；`rate` 写入 `playbackRate` 并设 `preservesPitch = false`；`delay` 为毫秒延迟（**静音时 MUST 一并取消**） |
| `playVoice(tier)` | `'good' \| 'great' \| 'unbelievable'` | 内部固定延迟 **`120ms`** 播放；连击升级时**取消上一档未播语音**（只播最终档） |
| `playSynth(name, opts)` | `name` = `'tap' \| 'blocked' \| 'dealTick' \| 'splashChord'`, `opts` | **同帧起音**（`pointerdown` 判合法后立即，不等动画）；`dealTick` 受 `>= 45ms` 节流（**Δ23 由 `>= 22ms` 修订**），单声总时长 `15~22ms`、`320→180Hz`、`800Hz` 低通、单振荡器零泛音 |
| `duckGameBgm(ratio)` | `ratio = 0.5` | `sfx_win` 触发时压低 `bgm_game` 至 50% |
| `setMuted(bool)` | — | **两轨同静默** + 取消所有已排定延迟触发；持久于 Progress / Profile |
| `setSfxMuted(bool)` / `setBgmMuted(bool)` | — | 分轨开关（FR-040 三项开关粒度）；**`settings.sfx` MUST 与复选框 `checked` 严格同向**（Δ21 修布尔反转） |
| `dispose()` | — | 释放实例池与 `AudioContext` |

### 5.3 `comboChanged` 事件契约（Δ22，GameState → 音频 / 飘字层）

`GameState` 每次三消结算后广播 `comboChanged`，**消费方 MUST NOT 各自维护副本计数**：

| 字段 | 类型 | 取值 / 说明 |
|---|---|---|
| `count` | int | 当前连击数（窗口内递增，超窗重置为 1） |
| `tier` | `1\|2\|3\|4\|5` | 档位（`count >= 5` 归 5） |
| `playbackRate` | number | `1.00` / `1.06` / `1.12` / `1.18` / `1.25`（写入 `sfx_shatter`） |
| `voice` | `string \| null` | `null`（tier 1/2）/ `'good'`（3）/ `'great'`（4）/ `'unbelievable'`（5） |
| `floatText` | `string \| null` | `null`（tier 1）/ `'Combo ×2'` / `'Good! ×3'` / `'Great! ×4'` / `'Unbelievable! ×N'`（**逐字锁定**） |

**窗口语义**：`now - lastMatchAt <= 5000` 则 `count += 1`，否则重置为 `1`；**无论续连与否刷新窗口**；MUST 用时间戳差值、**MUST NOT 用 rAF 帧计数**；受阻反弹**不重置本计数**。
**双口径铁律**：本计数与 IQ Meter 的 `M_combo`（受阻断连）**MUST NOT 互相覆盖或隐式同步**（见 [data-model.md](../data-model.md) §10 表末注记）。

### 5.4 事件 → 音效映射（GameState onEvent 转发）

| 游戏事件 | 音效 | 轨道 |
|---|---|---|
| `click` / `flyout` | `tap`（`ber~` 上滑 + 落槽软木轻叩） | 合成轨 |
| `blocked` | `blocked`（`deng~` 下沉 + 2 次阻尼泛音） | 合成轨 |
| `dealTick`（开局逐牌落定，FR-052） | `dealTick`（马林巴/骨牌轻叩，音高上扬） | 合成轨 |
| `match`（三消，连击数调制音高） | `sfx_shatter` + `playbackRate = comboChanged.playbackRate` | 外部轨 |
| `victory` | `sfx_win`（延迟 250ms + BGM 压低 50%） | 外部轨 |
| `defeat` | `sfx_lose`（槽满锁死/弹窗瞬间） | 外部轨 |
| `gear` / `unlock` / `ice`（引擎事件名，映射音效键 `iceBreak`）/ `prism` / `undo` / `item` / `botTick` | 合成轨合成音（既有实现保留） | 合成轨 |
| `splash`（开机） | `splashChord` | 合成轨 |

`AudioContext` 于首次 `pointerdown` 惰性创建并 `resume()`（autoplay 政策）；页面 `visibilitychange → hidden` 时 BGM 暂停、恢复可见按开关续播。

## 6. main.js（入口与编排）

- `DOMContentLoaded` → 读 `LEVELS` / Progress / `?level=N` 深链（1 ≤ N ≤ `LEVELS.length` 钳制）→ `createSession(LEVELS[N-1])` → 挂 Renderer/Sound。
- 结算交互：won → 「下一关」（`id+1 > LEVELS.length` ⇒ 全通关庆祝终局，动态关数）或重玩；lost → 重玩（lives 重置）。
- 进度写入：通关 `unlocked = max(unlocked, id+1)`（≤ LEVELS.length）、best 分更新（D-03）。
- **（Δ22）连击飘字调度**：订阅 `comboChanged` → 当 `floatText !== null` 时在 `#dock` **下方**渲染微光艺术字（浮起 → 放大 → 淡出，生命周期 700~1100ms）；飘字层 `pointer-events: none`，MUST NOT 遮挡待消槽与棋盘命中区域；连续连击允许多条并存且纵向错位不重叠。
- **（Δ22）开局编舞调度**：开局（进关 / 重置）时从 15 种中抽取 `modeId`（**相邻两次开局 MUST NOT 重复**），调用 `renderer.startDeal(modeId)`；`pointerdown` 前置检查 `renderer.isDealing()` → 先 `skipDeal()` 再继续走正常命中判定（**MUST NOT 吞点击**）；挑战横幅（FR-036 的 1.6s）与 L1/L2 教学卡片（FR-046）MUST 在编舞完成后（**Δ27 修订**：`>= renderer.dealRemainingMs()` 归零，即该关按公式算出的 `totalMs`，不再是固定 `1000ms`）再出现。
- **（Δ27）飞行槽位配对与揭示门控**：`dock` 事件到达时 `main.js` MUST 记 `pendingDock[tileId] = slotIndex`（**1:1 精确配对**，废弃 `lastDockSlot` 全局推测）；`renderDock()` MUST 对 `renderer.dockPending(id)` 为真的槽位输出 `<div class="slot empty"></div>`（保持空槽态）；`flyout` 事件里用 `pendingDock[tileId]` 查目标槽并调 `renderer.startFlight(tileId, slotIndex, dir)`；`onFlightLand` 回调 MUST 立即 `renderDock()` 切 `has-tile`（回调时飞行记录**已出表**，`dockPending` 为 `false`）。换关 / 重置 / Undo MUST 调用 `renderer.cancelFlights()` 并清空 `pendingDock`；窗口 `resize` MUST 调 `renderer.invalidateDockGeometry()`。
- **（Δ27）三消槽内保留期**：`match` 事件到达时 MUST NOT 同帧清槽——先给 3 个槽加 `.slot-shattering`、置 `dockFreezeUntil = now + 180`（冻结窗口内 `renderDock()` 直接 return），`180ms` 后重绘并调 `STM.spawnDockShatter(三个槽的 DOMRect)`。
- **（Δ22）BGM 场景接线**：`BOOT → LOBBY` 起 `playBgm('lobby')`；`LOBBY → GAME` 切 `playBgm('game')`；`GAME → RESULT` 与返回大厅回切 `playBgm('lobby')`。

## 7. 评委调试面板（FR-027/028，M4）

**功能集**（PC 侧栏常驻 / 移动底部抽屉 `translateY` 收展，游玩布局不受影响）：

| 控件 | 行为 |
|---|---|
| 关卡下拉 | 1 ~ `LEVELS.length` 动态选项（Δ4——配置扩至 100+ 关零代码适配）；选择即 `createSession(LEVELS[N-1])` 加载 |
| 重置 | `session.reset()` |
| Hint | on-rail → 高亮 `solutionMoves[stepIndex].t` 滑块（脉冲描边动画）；off-rail → 有界 DFS（D-06 预算）首步高亮，失败 → 启发式建议 +「非保证」标记 |
| Auto-Play | Bot：on-rail 逐 tap 回放（600 ms/步，`botTick` 音效）；玩家 pointerdown 打断；off-rail 有界续解 → 兜底 reset 重放整解（保证直至胜利）；终态自动停 |
| 关卡信息 | 展示 `metrics`（minMoves / solutionCount / dockPeak / mechCount / difficultyScore / openSuitsMax）、机制标签（按 tiles/prisms/cfg 实际出现动态计算：齿轮/冰封/锁链/棱镜 + 破冰口径） |
| 音效开关 | SoundManager.setMuted |

**Hint/Bot 搜索器**（main.js 内实现，规则调 RulesEngine）: 有界 DFS，节点预算 100k / ~300 ms、时限超即返失败；动作集 = enumerateTaps ∪ tapStaged ∪ 可用道具动作（与 Solver 动作集同构，见 [level-pipeline.md](level-pipeline.md) §3）。

## 8. 持久化（Progress）

`localStorage["slide-triple:progress:v1"]`（schema 见 [data-model.md](../data-model.md) §8）；全访问 try/catch，失败降级内存进度（隐私模式可玩）。加载时 `unlocked/last` 钳制 ≤ `LEVELS.length`（扩容自适应）。
