<!--
=== Sync Impact Report (temporary review material — remove before commit) ===
Version change: 2.0.0 → 3.0.0 (Δ22 amendment)
Rationale: 用户裁定音频素材分层放开——程序化合成无法达成拟人化情绪表现力
（语音夸赞 Good/Great/Unbelievable），且 8 个音频资产已实际置备。
Modified principles:
  - III: MAJOR 重新定义——"本地可选美术资产 + 程序化双兜底" → "本地可选资产
    + 强制兜底"（音频由"零音频文件"改为"按轨道分层"，见下）。
  - V / VI: PATCH 口径同步——"50 关 / 1~60 关" → "72 关 / 1~72 关"（Δ16 扩容后
    拖欠同步，实际交付早已 72 关）。
Bundled sync (PATCH, 随 Δ16/Δ21 拖欠同步):
  - 原则 II Generator 口径 "60 关" → "72 关"；流水线导出与 Governance 修订流程
    中的 "60 关口径" → "72 关口径"；交付验收红线 "60 关数据" → "72 关数据"。
  - 原则 III 图片资产条款的 Suit 区间 0~44 → 0~89、背景 bg{1..20} → bg{1..6}
    （Δ21 全图鉴 90 种 + Δ16 六画卷口径，原文已与实现脱节）。
Added:
  - 原则 III 新增"音频资产分层"三条子规则；红线表"音频素材"行改写；
    交付验收红线新增"音频文件仅限 assets/audio/ 白名单 + 交互音效零文件"条款。
Removed: none (原则 III 原 v2.0.0 音频措辞以注释形式存档)。
Deferred TODOs: none.
=== End Sync Impact Report ===
-->

# Slide & Triple（滑块三消）Constitution

## Core Principles

### I. 比赛对齐的产品定位（Competition-Aligned Focus）

本项目是参加“乐信圣文 AI Native 休闲游戏创作大赛”的 H5 轻度休闲游戏
《Slide & Triple（滑块三消）》。

- 所有功能与范围决策 MUST 以“玩法融合微创新”与“72 个关卡的难度递进设计”
  为唯二核心价值轴。（Δ22 同步：原“50 个关卡”为 v1.0.0 口径，Δ13 扩至 60、
  Δ16 扩至 72，本条按实际交付口径修正。）
- 项目 MUST 保持去叙事化（Δ15 澄清：美术表现层〔本地可选贴图/背景/程序化
  绘制/合成音频〕经原则 III v2.0.0 放开，"去美术化"不再约束美术表现本身）：
  不引入角色设定、剧情文本、
  世界观包装等范围外工作。
- 与两大核心无关的功能提议（成就系统、社交分享、商城等）MUST 被拒绝或
  记录为赛后 backlog，不得进入当前迭代。

**理由**：大赛评审聚焦玩法与关卡设计深度，范围蔓延会稀释有限开发周期内
的核心质量。

### II. 极简技术栈：Zero-Build & Pure Web（NON-NEGOTIABLE）

游戏本体 MUST 采用原生 HTML5 + CSS3 + Vanilla JavaScript（ES6 Modules）开发。

- 双击 `index.html` 或使用最简单的本地静态服务 MUST 能直接运行游戏；
  严禁引入 React/Vue/Webpack/Vite 等重型前端框架或构建链。
- Node.js 命令行工具 ONLY 允许用于两个离线工具：关卡逆向生成器
  （Generator，72 关口径——Δ16 扩容后）与自动回溯求解验证器
  （Solver）。
- 关卡数据 MUST 导出为纯静态 JSON/JS 配置文件，由前端直接读取；
  前端运行时 MUST NOT 依赖任何 Node.js 代码、npm 包或安装步骤。

**理由**：零构建链保证评委在任意环境（双击文件、任意静态托管）都能秒开
游戏，同时把工程复杂度集中在关卡算法这一核心竞争力上。

### III. 本地可选资产 + 强制兜底（Local Assets Optional with Mandatory Fallback）
<!-- Δ15 修订（v2.0.0）：原"程序化资源：零外部静态资源依赖（Procedural Assets Only）"原则被重新定义——允许本地美术贴图，但强制双兜底，核心交付形态不变。 -->
<!-- Δ22 修订（v3.0.0）：音频由"零音频文件"改为"按轨道分层"——BGM/事件音效/语音夸赞允许本地音频资产 + 强制兜底；交互级音效与开机和弦仍 MUST 零文件实时合成。file:// 双击秒开红线不变。 -->

- **图片资产（Δ15 放开，Δ21 口径同步）**：允许并优先从本地目录加载高清美术贴图：
  卡牌图标 `assets/icons/{suit}.png`（Suit 0~89 → `0.png` ~ `89.png`）、
  六张 4×4 图集 `assets/icons/sheet{1..6}.png|jpg`（每张取前 15 格有效图标）、
  背景图 `assets/bg/bg{1..6}.png|jpg|jpeg|webp`（6 幅画卷）。
- **强制双兜底（NON-NEGOTIABLE）**：任一外部图片缺失或加载失败（onerror）时，
  系统必须优雅降级且完整可玩——卡牌图标降级为浏览器原生全彩 Emoji 字体直渲染
  （`ctx.fillText` + 系统 Emoji 字体栈 `Segoe UI Emoji / Apple Color Emoji /
  Noto Color Emoji`，严禁 `ctx.arc` 手绘简笔画圆球加黑点），背景降级为
  Canvas 2D / 内联 SVG + CSS 渐变程序化绘制风景插画。
- **核心代码零强制二进制依赖**：`index.html` 与 `src/` 核心代码路径 MUST NOT
  依赖任何二进制素材文件的存在——assets 目录为空/缺失时游戏 MUST 保持
  100% 完整可玩（双击 index.html 秒开红线不变）；贴图加载 MUST 使用
  `Image` 元素相对路径（file:// 与静态服务双形态一致）。
- 棋盘底座、方向角标、特效粒子等其余视觉元素仍 MUST 通过 Canvas 2D 或
  内联 SVG + CSS 渐变程序化绘制。

**音频资产分层（Δ22 放开，按轨道划分）**——音频 MUST 按下列三层各遵其道：

1. **交互级音效（MUST 零文件实时合成）**：点击飞出（`ber~`）、受阻反弹
   （`deng~`）、开局落牌涟漪等**直接绑定玩家操作、对延迟敏感**的音效，
   MUST 由 Web Audio API 振荡器 + 物理包络现场合成，MUST NOT 依赖任何
   音频文件（外部文件必然引入解码与预载延迟，破坏操作手感）。
2. **背景音乐 / 事件级音效 / 语音夸赞（MAY 为本地可选音频资产 + 强制兜底）**：
   BGM、通关/失败音效、连击夸赞语音 MAY 从 `assets/audio/` 加载本地音频文件；
   任一文件缺失或解码失败时 MUST 优雅降级且完整可玩（BGM 回退为 Web Audio
   程序化合成，音效静默不报错），**空 `assets/audio/` 目录 MUST 完整可玩**。
3. **开机和弦（MUST 零文件实时合成）**：开机动画须在音频资产预载完成前即可
   发声，故 MUST 保持纯代码合成。

- **`file://` 兼容红线（NON-NEGOTIABLE）**：音频资产 MUST 通过
  `HTMLAudioElement`（`new Audio` + `preload`）加载，**MUST NOT 使用
  `fetch + decodeAudioData`**——该路径在 `file://` 下因 `Origin: null`
  触发 CORS 报错、导致音频全线失效，直接违反双击秒开红线。
- **音频文件位置白名单**：仓库内音频文件 ONLY 允许位于 `assets/audio/`；
  其余任何目录 MUST NOT 存放音频文件。字体文件红线不变（零字体文件）。

**理由**：外部高清贴图与高质量音频显著提升表现力上限（AI 生成资产），而强制
兜底 + 核心代码零强制依赖保证"空 assets 目录 = 程序化完整可玩版"的交付底线
永不破——评审在任意环境（双击文件、任意静态托管、assets 缺失）都能秒开完整
游戏。音频按轨道分层是因为两类需求本质冲突：交互音效要**零延迟**（只能现场
合成），语音夸赞要**情绪表现力**（程序合成做不到），分层后各取所需、互不牺牲。

<!-- III（原 v1.0.0 措辞存档）："严禁加载外部图片（.png/.jpg）与外部音频文件
（.mp3/.wav）等二进制素材。棋盘、图块花色、方向箭头、特效粒子 MUST 通过
Canvas 2D 或内联 SVG + CSS 渐变程序化绘制。……" —— Δ15 起由上述条款取代
（音频红线原样保留）。 -->
<!-- III 音频条款（v2.0.0 措辞存档）："点击、滑动、消除、胜负等全部音效与 BGM
仍 MUST 通过浏览器原生 Web Audio API 纯代码实时合成（零音频文件，此红线不变）。"
—— Δ22 起由上述"音频资产分层"条款取代（交互级音效与开机和弦的合成要求保留）。 -->

### IV. 跨端自适应与统一交互（Mobile-First & Desktop-Ready）

- 视图容器 MUST 锁定 9:16 移动端竖屏比例：在手机浏览器占满视口；
  在 PC 浏览器居中显示并预留侧边调试面板。
- 输入交互 MUST 统一使用原生 PointerEvents（pointerdown / pointerup 等），
  严禁混用 touchstart/touchend 与 mousedown/mouseup。

**理由**：PointerEvents 是统一鼠标/触控/触笔的标准事件模型，
单一代码路径同时覆盖 PC 鼠标与手机触控，避免双事件分支的状态不同步缺陷。

### V. 关卡数据可解性铁律（100% Solvable Guarantee, NON-NEGOTIABLE）

- 72 个关卡严禁纯随机生成。每一关 MUST 满足以下条件之一：
  1. 由逆向生成算法构建（从清空状态反向推入三消图块组），或
  2. 经自动求解器（Solver）回溯验证存在必胜通关路径。
- 每一关在 7 格底部槽位限制下 MUST 100% 存在至少一条必胜通关路径；
  未经可解性验证的关卡数据 MUST NOT 合入主分支。
- 每一关 MUST 附带量化难度指标（如最优解步数、解路径数、槽位压力峰值、
  启用机制数），支撑 1~72 关的难度递进曲线设计（含 Δ15 空间聚散度指标）。

**理由**：死关卡对休闲游戏是致命差评来源；量化难度指标是“难度递进设计”
这一核心赛点的可验证交付物。

### VI. 评委友好型调试内置（Debug & Telemetry Built-in）

界面 MUST 内置轻量级调试栏，最低功能集包括：

- 一键任意跳关（1~72 关，LEVELS.length 动态口径）
- 重置当前关
- AI 提示下一步合法最优解（Hint）
- 显示当前关卡机制标签与难度参数

调试栏在移动端 MUST 可隐藏/唤出，且不影响正常游玩布局。

**理由**：评委时间有限，跳关与 Hint 能让其在数分钟内遍历关卡设计
并验证玩法深度，直接服务评审效率。

## 技术边界与验收红线

技术栈与资源约束红线清单：

| 类别 | 禁止项 | 必须替代方案 |
| --- | --- | --- |
| 前端框架/构建 | React、Vue、Webpack、Vite、前端 npm 运行时依赖 | 原生 HTML5 + CSS3 + ES6 Modules |
| 图片素材（核心代码） | 核心代码路径对二进制图片的**强制依赖**（无贴图即不可用/不可玩） | 本地可选贴图 `assets/icons/*.png`、`assets/bg/bg*.jpg|png|webp` + 原生全彩 Emoji / Canvas / 内联 SVG 程序化**强制双兜底**（卡牌 Emoji 兜底严禁 ctx.arc 手绘圆球） |
| 音频素材 | ① 交互级音效（点击/受阻/落牌）与开机和弦使用音频文件；② 在 `assets/audio/` 之外存放任何音频文件；③ 用 `fetch + decodeAudioData` 加载音频（`file://` 必报 CORS） | 交互级音效与开机和弦 → Web Audio API 实时合成（零文件）；BGM / 事件音效 / 语音夸赞 → `assets/audio/` 本地可选资产 + **强制兜底**（缺失时 BGM 回退合成、音效静默），经 `HTMLAudioElement` 加载 |
| 字体素材 | 字体文件（红线不变） | 浏览器系统 Emoji 字体栈（Segoe UI Emoji / Apple Color Emoji / Noto Color Emoji） |
| 输入事件 | touchstart、mousedown 等分端事件 | 原生 PointerEvents |
| 关卡来源 | 纯随机生成 | 逆向生成或 Solver 验证 |

交付验收红线：

- 交付物 MUST 满足“双击 index.html 即可游玩”或“单条静态服务命令即可游玩”。
- **空 assets 目录形态 MUST 完整可玩**（Emoji 卡牌 + 程序化背景 + 程序化 BGM
  兜底生效，双兜底验收：空/满 assets 目录各跑通一次全流程）。
- **音频资产白名单（Δ22）**：音频文件 ONLY 允许位于 `assets/audio/`，且仅限
  BGM / 事件音效 / 语音夸赞三类；交互级音效与开机和弦 MUST 保持零文件实时
  合成。**`file://` 双击 `index.html` 下全部音频 MUST 正常发声、控制台零 CORS
  报错**（代码中 MUST NOT 出现 `decodeAudioData`）。字体红线不变（零字体文件）。
- 72 关数据 MUST 附带由 Solver 生成的可解性验证报告（含 Δ15 空间聚散度指标）。

## 关卡数据流水线与开发工作流

关卡数据的生产与变更 MUST 遵循固定流水线：

1. **Generator（Node.js 离线工具）**：按目标难度参数逆向生成关卡候选数据。
2. **Solver（Node.js 离线工具）**：对候选关卡做回溯求解验证，
   输出可解性与量化难度指标；不通过的候选回炉重生成。
3. **导出**：验证通过的关卡数据（72 关口径——Δ16 扩容后）导出为纯静态
   JSON/JS 配置文件，前端直接读取。
4. **前端**：读取静态配置渲染关卡，运行时不执行关卡生成逻辑。

质量门禁：

- 任何关卡数据文件变更 MUST 触发 Solver 全量重验证并更新验证报告。
- 前端代码评审 MUST 核对红线清单（框架、素材、事件模型）零违规。
- 引入新关卡机制时 MUST 同步更新调试栏的机制标签展示。

## Governance

- 本宪章是本项目最高工程准则；与其他文档或实践冲突时，以本宪章为准。
- 修订流程：提出修订动机 → 评估对既有关卡数据（72 关口径）与前端架构的影响 →
  更新本文档并按语义化版本递增版本号 → 在提交信息中说明变更范围。
- 版本策略：MAJOR = 删除或重新定义既有原则；MINOR = 新增原则或实质扩写；
  PATCH = 措辞澄清与笔误修正。
- 合规审查：每次关卡数据合入必须附带 Solver 验证报告；每次前端代码合入
  必须核对红线清单。
- 运行期开发指引由 `.specify/` 各工作流命令（specify → plan → tasks →
  implement）维护，宪章不承载具体实现细节。

**Version**: 3.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-25（Δ22：原则 III 由“本地可选美术资产 + 程序化双兜底”重新定义为“本地可选资产 + 强制兜底”——**MAJOR 修订**。核心变更：音频由“零音频文件”改为**按轨道分层**，即交互级音效（点击/受阻/落牌）与开机和弦 MUST 保持 Web Audio 零文件实时合成，BGM / 事件级音效 / 语音夸赞 MAY 从 `assets/audio/` 加载本地音频并强制兜底；新增 `file://` 兼容红线（MUST 用 `HTMLAudioElement`，MUST NOT 用 `fetch + decodeAudioData`）与音频文件位置白名单。同步拖欠口径：原则 I/V/VI 与红线表、交付红线、流水线、Governance 中的“50 关 / 60 关”统一为 **72 关**（Δ16 扩容后）；原则 III 图片条款的 Suit 区间 0~44 → **0~89**、背景 `bg{1..20}` → **`bg{1..6}`**（Δ21 全图鉴 90 种 + Δ16 六画卷）。字体红线与双击秒开红线不变。）
