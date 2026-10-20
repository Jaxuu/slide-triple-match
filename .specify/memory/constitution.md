<!--
=== Sync Impact Report (temporary review material — remove before commit) ===
Version change: 1.0.0 → 2.0.0 (Δ15 amendment)
Rationale: 用户裁定放开外部美术贴图限制（试玩反馈：程序化图案表现力不足）。
Modified principles:
  - III: MAJOR 重新定义——"程序化资源：零外部静态资源依赖" → "本地可选美术
    资产 + 程序化双兜底"；音频/字体红线与双击秒开红线原样保留。
  - I: MINOR 注记——"去美术化"范围禁令澄清为仅约束叙事包装类工作。
Bundled sync (PATCH, 随 Δ13 拖欠同步):
  - 原则 V/VI 与交付红线/流水线中的 "50 关" 口径同步为 "60 关（Δ13 扩容后）"。
Added:
  - 红线表新增"图片素材（核心代码）"双兜底行与"字体素材"行；交付验收新增
    空 assets 目录可玩性与双兜底验收条款。
Removed: none (原则 III 原 v1.0.0 措辞以注释形式存档)。
Deferred TODOs: none.
=== End Sync Impact Report ===
-->

# Slide & Triple（滑块三消）Constitution

## Core Principles

### I. 比赛对齐的产品定位（Competition-Aligned Focus）

本项目是参加“乐信圣文 AI Native 休闲游戏创作大赛”的 H5 轻度休闲游戏
《Slide & Triple（滑块三消）》。

- 所有功能与范围决策 MUST 以“玩法融合微创新”与“50 个关卡的难度递进设计”
  为唯二核心价值轴。
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
  （Generator，60 关口径——Δ13 扩容后）与自动回溯求解验证器
  （Solver）。
- 关卡数据 MUST 导出为纯静态 JSON/JS 配置文件，由前端直接读取；
  前端运行时 MUST NOT 依赖任何 Node.js 代码、npm 包或安装步骤。

**理由**：零构建链保证评委在任意环境（双击文件、任意静态托管）都能秒开
游戏，同时把工程复杂度集中在关卡算法这一核心竞争力上。

### III. 本地可选美术资产 + 程序化双兜底（Local Assets Optional with Mandatory Fallback）
<!-- Δ15 修订（v2.0.0）：原"程序化资源：零外部静态资源依赖（Procedural Assets Only）"原则被重新定义——允许本地美术贴图，但强制双兜底，核心交付形态不变。 -->

- **图片资产（Δ15 放开）**：允许并优先从本地目录加载高清美术贴图：卡牌图标
  `assets/icons/{suit}.png`（Suit 0~44 → `0.png` ~ `44.png`）、背景图
  `assets/bg/bg{1..20}.jpg`（或 `.png`/`.webp`）。
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
- 点击、滑动、消除、胜负等全部音效与 BGM 仍 MUST 通过浏览器原生 Web Audio
  API 纯代码实时合成（零音频文件，此红线不变）。

**理由**：外部高清贴图显著提升美术表现上限（AI 生成资产），而强制双兜底 +
核心代码零强制依赖保证"空 assets 目录 = 程序化完整可玩版"的交付底线永不
破——评审在任意环境（双击文件、任意静态托管、assets 缺失）都能秒开完整
游戏，加载体积与零构建链特性不因贴图缺失而劣化。

<!-- III（原 v1.0.0 措辞存档）："严禁加载外部图片（.png/.jpg）与外部音频文件
（.mp3/.wav）等二进制素材。棋盘、图块花色、方向箭头、特效粒子 MUST 通过
Canvas 2D 或内联 SVG + CSS 渐变程序化绘制。……" —— Δ15 起由上述条款取代
（音频红线原样保留）。 -->

### IV. 跨端自适应与统一交互（Mobile-First & Desktop-Ready）

- 视图容器 MUST 锁定 9:16 移动端竖屏比例：在手机浏览器占满视口；
  在 PC 浏览器居中显示并预留侧边调试面板。
- 输入交互 MUST 统一使用原生 PointerEvents（pointerdown / pointerup 等），
  严禁混用 touchstart/touchend 与 mousedown/mouseup。

**理由**：PointerEvents 是统一鼠标/触控/触笔的标准事件模型，
单一代码路径同时覆盖 PC 鼠标与手机触控，避免双事件分支的状态不同步缺陷。

### V. 关卡数据可解性铁律（100% Solvable Guarantee, NON-NEGOTIABLE）

- 50 个关卡严禁纯随机生成。每一关 MUST 满足以下条件之一：
  1. 由逆向生成算法构建（从清空状态反向推入三消图块组），或
  2. 经自动求解器（Solver）回溯验证存在必胜通关路径。
- 每一关在 7 格底部槽位限制下 MUST 100% 存在至少一条必胜通关路径；
  未经可解性验证的关卡数据 MUST NOT 合入主分支。
- 每一关 MUST 附带量化难度指标（如最优解步数、解路径数、槽位压力峰值、
  启用机制数），支撑 1~60 关的难度递进曲线设计（含 Δ15 空间聚散度指标）。

**理由**：死关卡对休闲游戏是致命差评来源；量化难度指标是“难度递进设计”
这一核心赛点的可验证交付物。

### VI. 评委友好型调试内置（Debug & Telemetry Built-in）

界面 MUST 内置轻量级调试栏，最低功能集包括：

- 一键任意跳关（1~60 关，LEVELS.length 动态口径）
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
| 音频素材 | .mp3 / .wav 等音频文件（红线不变） | Web Audio API 实时合成 |
| 字体素材 | 字体文件（红线不变） | 浏览器系统 Emoji 字体栈（Segoe UI Emoji / Apple Color Emoji / Noto Color Emoji） |
| 输入事件 | touchstart、mousedown 等分端事件 | 原生 PointerEvents |
| 关卡来源 | 纯随机生成 | 逆向生成或 Solver 验证 |

交付验收红线：

- 交付物 MUST 满足“双击 index.html 即可游玩”或“单条静态服务命令即可游玩”。
- **空 assets 目录形态 MUST 完整可玩**（Emoji 卡牌 + 程序化背景兜底生效，双兜
  底验收：空/满 assets 目录各跑通一次全流程）。
- 音频与字体红线不变：仓库内 MUST NOT 存在任何音频文件与字体文件（图片贴图
  为本地可选增强资产，不受此条限制）。
- 60 关数据 MUST 附带由 Solver 生成的可解性验证报告（含 Δ15 空间聚散度指标）。

## 关卡数据流水线与开发工作流

关卡数据的生产与变更 MUST 遵循固定流水线：

1. **Generator（Node.js 离线工具）**：按目标难度参数逆向生成关卡候选数据。
2. **Solver（Node.js 离线工具）**：对候选关卡做回溯求解验证，
   输出可解性与量化难度指标；不通过的候选回炉重生成。
3. **导出**：验证通过的关卡数据（60 关口径——Δ13 扩容后）导出为纯静态
   JSON/JS 配置文件，前端直接读取。
4. **前端**：读取静态配置渲染关卡，运行时不执行关卡生成逻辑。

质量门禁：

- 任何关卡数据文件变更 MUST 触发 Solver 全量重验证并更新验证报告。
- 前端代码评审 MUST 核对红线清单（框架、素材、事件模型）零违规。
- 引入新关卡机制时 MUST 同步更新调试栏的机制标签展示。

## Governance

- 本宪章是本项目最高工程准则；与其他文档或实践冲突时，以本宪章为准。
- 修订流程：提出修订动机 → 评估对既有关卡数据（60 关口径）与前端架构的影响 →
  更新本文档并按语义化版本递增版本号 → 在提交信息中说明变更范围。
- 版本策略：MAJOR = 删除或重新定义既有原则；MINOR = 新增原则或实质扩写；
  PATCH = 措辞澄清与笔误修正。
- 合规审查：每次关卡数据合入必须附带 Solver 验证报告；每次前端代码合入
  必须核对红线清单。
- 运行期开发指引由 `.specify/` 各工作流命令（specify → plan → tasks →
  implement）维护，宪章不承载具体实现细节。

**Version**: 2.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-20（Δ15：原则 III 由“零外部静态资源依赖”重新定义为“本地可选美术资产 + 程序化双兜底”——MAJOR 修订；其余原则零改动。同步放开项：卡牌图标本地贴图 `assets/icons/{suit}.png`（0~44）、背景贴图 `assets/bg/bg{1..20}.jpg|png|webp`，缺失时强制 Emoji / 程序化双兜底；配套新增强制双兜底与空 assets 可玩性验收红线。）
