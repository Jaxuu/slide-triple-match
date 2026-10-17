<!--
=== Sync Impact Report (temporary review material — remove before commit) ===
Version change: (unresolved scaffold, no prior ratified version) → 1.0.0
Rationale: first ratification. The previous .specify/memory/constitution.md
  contained only unresolved template placeholders with no project-specific
  values, so nothing needed to be preserved or migrated.
Modified principles: none (initial adoption).
Added:
  - Core Principles I–VI (user input specifies 6 principles; the template
    scaffold defines 5 slots, so the principle list was extended to 6)
  - Section "技术边界与验收红线" (Additional Constraints)
  - Section "关卡数据流水线与开发工作流" (Development Workflow)
  - Governance rules (amendment procedure, versioning policy, compliance review)
Removed: none.
Deferred TODOs: none — all template placeholders resolved.
=== End Sync Impact Report ===
-->

# Slide & Triple（滑块三消）Constitution

## Core Principles

### I. 比赛对齐的产品定位（Competition-Aligned Focus）

本项目是参加“乐信圣文 AI Native 休闲游戏创作大赛”的 H5 轻度休闲游戏
《Slide & Triple（滑块三消）》。

- 所有功能与范围决策 MUST 以“玩法融合微创新”与“50 个关卡的难度递进设计”
  为唯二核心价值轴。
- 项目 MUST 保持完全去美术化、去叙事化：不引入角色设定、剧情文本、
  世界观包装等范围外工作。
- 与两大核心无关的功能提议（成就系统、社交分享、商城等）MUST 被拒绝或
  记录为赛后 backlog，不得进入当前迭代。

**理由**：大赛评审聚焦玩法与关卡设计深度，范围蔓延会稀释有限开发周期内
的核心质量。

### II. 极简技术栈：Zero-Build & Pure Web（NON-NEGOTIABLE）

游戏本体 MUST 采用原生 HTML5 + CSS3 + Vanilla JavaScript（ES6 Modules）开发。

- 双击 `index.html` 或使用最简单的本地静态服务 MUST 能直接运行游戏；
  严禁引入 React/Vue/Webpack/Vite 等重型前端框架或构建链。
- Node.js 命令行工具 ONLY 允许用于两个离线工具：50 关逆向关卡生成器
  （Generator）与自动回溯求解验证器（Solver）。
- 关卡数据 MUST 导出为纯静态 JSON/JS 配置文件，由前端直接读取；
  前端运行时 MUST NOT 依赖任何 Node.js 代码、npm 包或安装步骤。

**理由**：零构建链保证评委在任意环境（双击文件、任意静态托管）都能秒开
游戏，同时把工程复杂度集中在关卡算法这一核心竞争力上。

### III. 程序化资源：零外部静态资源依赖（Procedural Assets Only）

- 严禁加载外部图片（.png/.jpg）与外部音频文件（.mp3/.wav）等二进制素材。
- 棋盘、图块花色、方向箭头、特效粒子 MUST 通过 Canvas 2D 或
  内联 SVG + CSS 渐变程序化绘制。
- 点击、滑动、消除、胜负等全部音效 MUST 通过浏览器原生 Web Audio API
  纯代码实时合成。

**理由**：消除全部二进制资产依赖，交付物保持纯文本代码集合，
加载体积最小化，且与“去美术化”定位一致。

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
  启用机制数），支撑 1~50 关的难度递进曲线设计。

**理由**：死关卡对休闲游戏是致命差评来源；量化难度指标是“难度递进设计”
这一核心赛点的可验证交付物。

### VI. 评委友好型调试内置（Debug & Telemetry Built-in）

界面 MUST 内置轻量级调试栏，最低功能集包括：

- 一键任意跳关（1~50 关）
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
| 图片素材 | .png / .jpg 等外部图片文件 | Canvas 2D / 内联 SVG / CSS 渐变 |
| 音频素材 | .mp3 / .wav 等音频文件 | Web Audio API 实时合成 |
| 输入事件 | touchstart、mousedown 等分端事件 | 原生 PointerEvents |
| 关卡来源 | 纯随机生成 | 逆向生成或 Solver 验证 |

交付验收红线：

- 交付物 MUST 满足“双击 index.html 即可游玩”或“单条静态服务命令即可游玩”。
- 仓库内 MUST NOT 存在任何二进制素材文件（图片/音频/字体）。
- 50 关数据 MUST 附带由 Solver 生成的可解性验证报告。

## 关卡数据流水线与开发工作流

关卡数据的生产与变更 MUST 遵循固定流水线：

1. **Generator（Node.js 离线工具）**：按目标难度参数逆向生成关卡候选数据。
2. **Solver（Node.js 离线工具）**：对候选关卡做回溯求解验证，
   输出可解性与量化难度指标；不通过的候选回炉重生成。
3. **导出**：验证通过的 50 关数据导出为纯静态 JSON/JS 配置文件，
   前端直接读取。
4. **前端**：读取静态配置渲染关卡，运行时不执行关卡生成逻辑。

质量门禁：

- 任何关卡数据文件变更 MUST 触发 Solver 全量重验证并更新验证报告。
- 前端代码评审 MUST 核对红线清单（框架、素材、事件模型）零违规。
- 引入新关卡机制时 MUST 同步更新调试栏的机制标签展示。

## Governance

- 本宪章是本项目最高工程准则；与其他文档或实践冲突时，以本宪章为准。
- 修订流程：提出修订动机 → 评估对既有 50 关数据与前端架构的影响 →
  更新本文档并按语义化版本递增版本号 → 在提交信息中说明变更范围。
- 版本策略：MAJOR = 删除或重新定义既有原则；MINOR = 新增原则或实质扩写；
  PATCH = 措辞澄清与笔误修正。
- 合规审查：每次关卡数据合入必须附带 Solver 验证报告；每次前端代码合入
  必须核对红线清单。
- 运行期开发指引由 `.specify/` 各工作流命令（specify → plan → tasks →
  implement）维护，宪章不承载具体实现细节。

**Version**: 1.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-17
