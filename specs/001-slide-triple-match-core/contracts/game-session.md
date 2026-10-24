# Contract: Game Session / UI / Rendering / Audio / Debug（前端运行时接口）

> ⚠️ **STALE**: spec.md was refined on 2026-10-24 (Δ21: 调试面板 `findBestNextMove(state)` 残局启发式求解与音效复选框布尔修正、`#dock .slot` 单层卡牌、FR-049 无描边 Low-Poly 碎片参数、画卷主题名显示、图集质心居中切片、`bg`/`sheet` 扩展名自适应)。Run `/speckit.refine.propagate` to update this document.

> ⚠️ **STALE**: spec.md was refined on 2026-10-22 (Δ19: **本契约为主要传播落点**——① FR-046 前两关**交互式教学**（L1 玩法引导卡片+动态手指指引 / L2 层叠压制引导 / L3 起零提示，可跳过、非阻塞）；② FR-047 **顶部导航栏**（左上并排【↩ 返回大厅】【⚙️ 设置】圆形立体按钮、正中央严格 `关卡 X` 无 `/72` 后缀、右上【💎 棱晶数量】）+ **IQ 指数条**（初始 `IQ: 90`、三消 `+(3+combo×2)`、跳字动效与趣味头衔、受阻不扣 IQ 但 combo 归零）+ **7 格待消槽上移**至 IQ 条正下方/棋盘上方（立体深木色/银色金属内凹托盘样式，含命中区域互斥与飞入动画终点坐标改向）；③ FR-048 **三大道具**（撤销/灵犀三消/乾坤洗牌）——灵犀三消无视阻挡与锁定、优先匹配待消槽花色、同花色取最顶层防悬空、全场同花色不足 3 张时拒绝；乾坤洗牌重排花色与方向且保持必胜可解 + 翻转动画；④ FR-049 **白瓷多边形碎裂 VFX**（45~60 枚带高光与阴影面片、抛射翻滚重力飘落）；⑤ FR-050 **清脆碎裂音效**（Web Audio 合成、受 SFX 开关联动）；⑥ **扳手下线**——道具栏固定三键、`useItem('wrench')` 与目标选择交互态移除；⑦ **原 FR-044 改号 FR-051**)。Run `/speckit.refine.propagate` to update this document.

> ⚠️ **STALE**: spec.md was refined on 2026-10-21 (Δ16: **本契约为主要传播落点**——① FR-038 开机动画、FR-039 主大厅（Glide Critters 六区布局）、FR-040 设置/个人信息弹窗、FR-041 棱晶经济与局内道具购买闭环、FR-042 通关结算与画卷解锁展板、FR-043 失败与棱晶复活界面（含"净化消除"语义）、FR-044 画卷拼图进度系统——全部为新增前端运行时契约；② FR-035 §6 拼图切片与局内背景同源；③ 关卡总数 60→72、背景贴图口径 bg{1..20}→bg{1..6})。Run `/speckit.refine.propagate` to update this document.

> ⚠️ **STALE**: spec.md was refined on 2026-10-20 (Δ14: US5——BoardRenderer 底座/角标/背景/图鉴渲染、SoundManager BGM、挑战关横幅均有新契约需求 FR-033~037；本契约为主要传播落点)；Δ15: ① FR-033 §6/FR-035 §3 贴图加载 + Emoji/程序化双兜底渲染链入 BoardRenderer 契约；② FR-034 §3 方向角标重做为锐利宽翼三角（猪鼻子禁令）；③ FR-029 聚散度指标进调试面板难度展示复核。Run `/speckit.refine.propagate` to update this document.

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

## 5. SoundManager（`STM.createSoundManager()`）

Web Audio 事件驱动合成（D-04）。事件→音效映射（GameState onEvent 转发）: click / flyout / blocked / match(连击数调制音高) / gear / unlock / **ice（引擎破冰事件名——映射音效键 'iceBreak'）** / prism / undo / item / victory / defeat / botTick。`setMuted(bool)` 持久于 Progress。AudioContext 于首次 pointerdown 惰性创建（autoplay 政策）。

## 6. main.js（入口与编排）

- `DOMContentLoaded` → 读 `LEVELS` / Progress / `?level=N` 深链（1 ≤ N ≤ `LEVELS.length` 钳制）→ `createSession(LEVELS[N-1])` → 挂 Renderer/Sound。
- 结算交互：won → 「下一关」（`id+1 > LEVELS.length` ⇒ 全通关庆祝终局，动态关数）或重玩；lost → 重玩（lives 重置）。
- 进度写入：通关 `unlocked = max(unlocked, id+1)`（≤ LEVELS.length）、best 分更新（D-03）。

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
