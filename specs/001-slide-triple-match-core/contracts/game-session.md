# Contract: Game Session / UI / Rendering / Audio / Debug（前端运行时接口）

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

**输入锁**: ANIMATING/SETTLING 期间 tap 入队或忽略（不丢玩家意图的策略：忽略 + 短提示音）。级联动画时长上限 1.2 s（超时强制结算解锁，防卡死）。

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

**滑块视觉契约（M1.5 立体奶油麻将牌面）**：牌面 `#FFFDF9` 渐变 + 深色暖棕厚度底座（堆叠层数越多底座越厚）+ 花色描边与内侧高光；方向箭头 = 花色深色胶囊徽章 + 白色人字箭头，置于牌面中心偏 `d` 侧。**Δ7 堆叠渲染**：非顶层滑块向左上错层偏移；左上角层角标（每层一点，白点=顶层）预告下层；顶层飞出发 `reveal` 事件 → 次顶层上浮动画（REVEAL_MS ≈380ms）。**Δ8 凌空飞越渲染**：`z >= 1` 高层滑块飞出动画保持层高——上移偏移（每层 ≈0.22 cell）+ 起飞放大（近镜头感，渐收）+ 地面椭圆暗影投影（随高度虚化）；受阻弹回动画同带层高偏移。暗底 #1B2430 / 点阵格线 #26313E；每色明度差 ≥2:1 于底色、图形互异（色盲可辨）。

**机关绘制契约**: 齿轮角标 = 滑块右上角小齿轮图形 + 滑块底色描边；冰封 = 半透明冰蓝覆盖 + 厚度数字/裂纹层数（FR-017）；锁链 = 格四角链条 SVG 角标；钥匙 = 滑块左上钥匙角标 +（hover/选中时）链路提示线连向配对锁（FR-020）；棱镜 = 格内粗斜杠条（/ 或 \）+ 边框高亮，与滑块/障碍显著区分（FR-023）。

**粒子**: 三消爆裂（花色色粒子 12~20 个，重力+衰减）、破冰碎屑（白蓝）、飞出拖尾。单帧粒子 ≤ 200。

## 5. SoundManager（`STM.createSoundManager()`）

Web Audio 事件驱动合成（D-04）。事件→音效映射（GameState onEvent 转发）：click / flyout / blocked / match(连击数调制音高) / gear / unlock / iceBreak / prism / undo / item / victory / defeat / botTick。`setMuted(bool)` 持久于 Progress。AudioContext 于首次 pointerdown 惰性创建（autoplay 政策）。

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
