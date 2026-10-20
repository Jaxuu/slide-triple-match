# Research: Slide & Triple（滑块三消）— 技术决策记录

> ⚠️ **STALE**: spec.md was refined on 2026-10-20 (Δ14: US5《万物出发！》新增——FR-033~037)。Run `/speckit.refine.propagate` to update this document.

**Feature**: `001-slide-triple-match-core` | **Phase**: 0 | **Date**: 2026-10-17

**输入**: [spec.md](spec.md)（32 条 FR、Edge Cases、SC-001~006）、[constitution.md](../../.specify/memory/constitution.md)（六大原则 + 红线清单 + 流水线工作流）、用户 plan 阶段架构指令（四里程碑、LEVELS.length 动态化、机制边界收敛、目录结构）。

**方法**: 本特性无外部依赖（零第三方库），未知项全部为「平台行为 + 算法设计」类决策，通过逐项分析 spec/宪章约束矩阵消解。无 Web 检索需求（不引入任何库/服务）。每项决策记录：决策、理由、否决的备选。

---

## D-01 脚本加载模型：classic `<script defer>` + 单全局命名空间（非 ES module import/export）

**Decision**: `index.html` 以固定顺序 `<script defer>` 加载 6 个源文件；各文件将公共 API 挂载到单一全局命名空间 `window.STM`（`STM.LEVELS`、`STM.RulesEngine`、`STM.GameState`、`STM.createBoardRenderer`、`STM.SoundManager`、`STM.main`）。

**Rationale**: spec SC-003 与宪章 II 要求「双击 index.html 即可游玩」。**ES module（`<script type="module">` / `import` 语句）在 file:// 协议下被 Chrome、Edge、Firefox、Safari 全部拦截**：模块脚本请求受 CORS 约束，file:// origin 为 `null`，控制台抛 CORS 错误且脚本不执行。用户 plan 指令明确「file:// 协议下零跨域报错」，字面 import/export 与此互斥。宪章 II 的 "Vanilla JavaScript (ES6 Modules)" 按其同条更硬性的「双击 MUST 可玩」约束解释为「原生 JS、零构建、零运行时依赖」，语言特性仍采用 ES2020+（const/let/箭头函数/类/解构/模板串）。

**Alternatives considered**:
- 真 `<script type="module">`：file:// 全灭，否决。
- 单巨型 HTML 内联全部 JS：可 file:// 运行，但违背用户指定目录结构（src/ 六模块），且丧失 Solver 复用单文件的模块边界；否决。
- 构建期拼接（cat 各模块为 bundle.js）：引入 Node 构建用途，超出宪章 II「Node 仅限 Generator/Solver」；且每次改代码需重建，评委拿到源码与运行物不一致；否决。
- SystemJS/RequireJS CDN 动态加载：外部网络依赖，违背零资源红线；否决。

## D-02 前后端共享代码：UMD 式双导出（浏览器全局 + CommonJS）

**Decision**: `src/core/RulesEngine.js`、`src/data/levels.js` 采用头部模式：

```js
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();  // Node（Solver）
  else global.STM = global.STM || {}, global.STM.RulesEngine = factory();        // 浏览器
})(typeof window !== 'undefined' ? window : globalThis, function () { /* … */ });
```

**Rationale**: FR-032 要求前端游玩与 Node 求解器口径 100% 一致——共享同一物理文件是唯一零成本保证。classic script 无模块系统，Node 侧 `require()` 需 CommonJS 导出，UMD 头是零依赖标准解法。`levels.js` 双导出使 Solver 复验交付物（FR-031）直接 `require` 前端实际数据。

**Alternatives considered**: 两份拷贝（漂移风险，违 FR-032）；npm workspace/monorepo（npm 依赖红线）；将 RulesEngine 拆为「浏览器版/Node 版」由人肉同步（同拷贝问题）；否决。

## D-03 玩家进度持久化：localStorage + 防护 + URL 深链

**Decision**: `localStorage["slide-triple:progress:v1"]` 存 `{unlockedLevel, lastLevel, scores{levelId:bestScore}, muted}`；全部访问裹 try/catch（隐私模式/禁用降级为内存会话进度）；新会话自动进 `unlockedLevel`（≤ `LEVELS.length` 钳制）；`?level=N`（1 ≤ N ≤ `LEVELS.length`）URL 深链直接加载任意关（调试面板跳关的兄弟入口，双击 file:// 时 query 同样有效）。

**Rationale**: spec Assumptions「进度以本地方式延续（手段留给 plan）」。localStorage 是唯一零依赖浏览器持久化（IndexedDB 过重；Cookie 4KB 且语义错位）。钳制与深链直接服务 Δ4「LEVELS.length 动态化」：配置扩到 100+ 关时进度对象无需迁移结构，仅数值范围自适应。

**Alternatives considered**: IndexedDB（异步复杂度不值得）；无持久化（违「进度延续」假设）；file system API（兼容性差）；否决。

## D-04 音效：Web Audio 振荡器/噪声事件驱动合成

**Decision**: `SoundManager` 持单一 `AudioContext`（首次 pointerdown 惰性创建并 resume，规避 autoplay 策略）；音效 = 振荡器（正弦/方波/三角，频率扫频）+ 白噪声 buffer + `DynamicsCompressor` 总线的短促程序合成；音色表：click(880Hz 短方波)、slide(上行扫频)、block(120Hz 三角+噪声冲击)、match(三音上行琶音)、undo(下行)、victory/defeat(和弦/下行)、unlock/break/prism/gear（各自固定扫频签名）、bot 步进 tick；静音开关持久于 D-03 存储。

**Rationale**: 宪章 III 红线禁音频文件；Web Audio 合成是唯一路径。惰性初始化是 autoplay 政策的标准解（桌面 Chrome/Safari 均要求用户手势后才能出声）。事件驱动（GameState 事件流 → 音效映射）与渲染解耦，与用户目录结构一致。

**Alternatives considered**: `new Audio(dataURI)`（base64 内嵌 wav）：仍是「二进制素材」精神的漏洞且延迟差；Web MIDI/SpeechSynthesis（荒谬）；无音效（违 FR 音效要求）；否决。

## D-05 渲染架构：单 Canvas 棋盘 + DOM/SVG 面板

**Decision**: 棋盘（格、滑块、箭头、机关、飞出/弹回/三消粒子）在一个 Canvas 2D 上以 rAF 主循环绘制（requestAnimationFrame，脏检查跳帧）；HUD、Dock 7 格、Staging 3 格、道具栏、调试面板、结算弹层为 DOM + 内联 SVG（CSS 过渡动效）；Canvas 尺寸 = 元素 clientWidth×devicePixelRatio 自适应，8×8 时格宽 ≥ 40 CSS px。

**Rationale**: 宪章 III 允许 Canvas 或内联 SVG。滑块飞出/三消粒子是高频逐帧动效，Canvas 显著省 DOM 节点（45 滑块 × 重排）；Dock/面板是低频离散 UI，DOM+CSS 更易做无障碍与响应式。混合边界清晰：**棋盘内 = Canvas，棋盘外 = DOM**。

**Alternatives considered**: 纯 DOM 棋盘（45 元素 + transform 动画可行但粒子/拖尾吃力，且 CSS 动画与逻辑时序易漂）；纯全屏 Canvas（UI 文本/无障碍/面板布局全部手绘，工程量爆炸）；SVG 整棋盘（逐帧属性更新性能弱于 Canvas）；否决。

## D-06 Hint / Auto-Play Bot：预计算解回放 + 有界 DFS 兜底

**Decision**:
- **在轨（on-rail）判定**：GameState 维护「自本关加载以来是否完全沿 `solutionMoves` 行动」。在轨时 Hint = 当前步的滑块；Bot = 按序对 session 公共动作 API 派发 tap（600 ms/步），**任何玩家 pointerdown 立即打断 Bot**。
- **偏离（off-rail）**：Hint 触发有界 DFS（节点预算 100k、时限 ~300 ms，用 RulesEngine 同一 `applyTap`），找到解则给首步高亮脉冲，否则按启发式（能飞出且降低槽压力的 tap）提示并标注「非保证」。
- **Bot 兜底**：偏离状态 Bot 优先有界搜索续解；失败则静默 reset 重放整条 `solutionMoves`（保证 FR-027「直至该关胜利」的硬承诺）。
- **进阶解合法性**：Hint 需校验解对**当前局面**仍有效（Δ3 暂存区滑块可用 tap 回 Dock，需纳入搜索动作集）。

**Rationale**: 用户指令要求「Hint 与 Auto-Play 零延迟响应」（Δ6 预计算 `solutionMoves` 内嵌 levels.js 的动机）。纯回放在玩家自行动作后即失效——Spec FR-027 的 Hint 是「下一步合法最优解」，必须对实际局面求解；全量求解在前端不可行（C-5 约束 Solver 为离线工具，前端只有静态数据），故有界搜索是唯一符合「前端不跑生成/全量求解」的折中。100k 节点预算为 M2/M3 校准项（见 level-pipeline.md §预算）。

**Alternatives considered**: 前端全量求解（违宪章 V/II 的前端零求解精神且大关会卡秒）；仅支持「从头重放」的 Bot（玩家一步后 Bot 瘫痪，评审体验差）；预计算「全状态→解」表（数据体积爆炸）；否决。

## D-07 Solver 状态规范化与搜索：迭代加深 DFS + dock 顺序无关哈希

**Decision**:
- 状态 = `(棋盘格→滑块快照、dock 花色计数向量、staging 内容、生命/扣步余量、机制动态量)`；
- **关键规范化**：dock 内滑块的排列顺序不进哈希——由规则知三消判定只依赖各花色计数（同花色归拢使「哪 3 格被占」不影响结局），Dock 状态以 `Int8Array(花色数)` 计数向量表示。同构状态（滑块集合相同、位置可由旋转/镜像映射）不合并（保守，避免漏解）；
- 搜索：迭代加深 DFS（depth = 步数上限从最优下界起递增）+ 已见状态哈希集剪枝 + 逐步 zorb：tap 可行性 O(射线长度) 预筛；求解预算：单关 2M 节点或 60 s 硬顶。
- **解路径数**：限定预算内的**不重复终局路径计数**（计数封顶 10k 后记 `">=10000"` 量级，spec 只要求可复现存在）。

**Rationale**: FR-030 回溯求解 + 指标输出。dock 顺序无关性是本游戏规则的结构红利：爆槽判定只看「7 格满且无三消」，等价于花色计数向量的线性约束（sum(count) == 7 && all count < 3 爆槽；任一 count == 3 即三消清空）。规范化后状态数从「排列」级降到「组合」级，50 关规模（≤45 滑块、≤8 花色）可行。迭代加深保证首个找到的解即最优步数解。

**Alternatives considered**: BFS（内存爆炸）；A*（无一致可采纳启发式：解长度与距离单调性弱）；IDA*（同 A* 启发式困境）；纯随机重放验证（不满足指标输出）；否决。

## D-08 Solver 结果可复现性：种子化 + 确定性遍历

**Decision**: Solver 与 Generator 全部随机源使用带种子的 xorshift128 PRNG（不依赖 Math.random）；动作展开顺序固定（行优先、列优先枚举 tap 目标）；报告含 `seed`、`nodeBudget`、`elapsedMs`、`schemaVersion`。同 commit 关卡数据 + 同 seed ⇒ 逐位一致的报告。

**Rationale**: FR-011「指标可复现」与 FR-031 变更重验需要稳定基线；调试「解路径数」波动首先怀疑非确定性来源。Node 侧实现，不进前端。

**Alternatives considered**: Math.random（不可复现）；加密随机（无必要）；否决。

## D-09 死局判定口径：前端保守谓词 + 离线穷举互证

**Decision**:
- 前端运行时死局信号（即时）：① 爆槽（7 格满且无三消可能——由 FR 知该点击内若能三消则优先结算，故爆槽仅在结算后仍满时成立）；② 生命扣完；③ **互锁保守谓词**：所有剩余滑块 tap 后均「无法飞出」（被阻挡）且：无道具可用、无冰封滑块（冰可被三消解）、无锁链滑块（钥匙在场上即有潜在解锁）、无齿轮滑块（其相邻飞出会转向——但若无人能飞出齿轮永不转，故齿轮存在本身不构成「可解救」证据）。满足 ③ 的局面进入「疑死锁」→ 触发有界 DFS（同 D-06 预算）复证，确认无解才判负。
- 离线 Solver 的死局口径 = 完全搜索无解。FR-032 一致性由「前端谓词是 Solver 无解的必要条件近似 + 复证搜索同引擎」保证：前端只在「Solver 也会判死」的超集边界上多等一步（复证），不会早杀。

**Rationale**: spec Edge Case「互锁死局检测误报」明确要求「仅在实际无合法操作或道具无法挽救时触发，且基于求解器口径或穷举口径」。纯谓词会误杀（隐藏解：先弹回触发齿轮等）；纯穷举不可行（前端性能）。分层方案把穷举压缩到「疑死锁」小局面上，预算内有界。

**Alternatives considered**: 纯保守谓词（误杀，违 Edge Case）；每步全量求解（前端不可行）；不判死局（违 FR-006）；否决。

## D-10 Generator：逆向构造 + 正向自检 + Solver 门禁三重验证

**Decision**: 每关生产流水线：
1. **逆向构造**：从清空棋盘出发反向推入三消组——按目标滑块数/花色数/机制参数取「轮」：每轮选一花色、生成 3 个同花色滑块、为每个决定「飞行方式」（直飞/经棱镜折射飞出），沿反向射线落位（若落位格被占则重试该滑块）；推入顺序即反向的最优解顺序，天然记录 `solutionMoves`；机制逆操作：齿轮滑块在构造时记录「若其十字相邻有更晚推入（= 更早飞出）者则其方向需满足旋转后对准出口」约束；锁链滑块晚于其钥匙落位；冰封滑块任意（冰厚度独立配置）。
2. **正向自检**：用 RulesEngine 正向模拟 `solutionMoves`，断言胜利且过程满足 FR-029 约束（滑块数 %3==0、开放花色 ≤5、无中途空棋盘残槽态）——镜像逻辑错误在此暴露。
3. **Solver 门禁**：D-07 全量求解，验证可解 + 输出指标（最优步数、解路径数、槽位压力峰值 = 全路径搜索中 dock 占用最大值、机制数）。失败 ⇒ 回炉：换子种子重生成（参数扰动：滑块位置/花色分配/机制位置）；连续 N 次失败 ⇒ 降档（降低滑块数/花色数至下界）并标记报告。
   
**Rationale**: FR-029 逆向生成 + FR-030 验证是宪章 V 双路径。逆向构造保证「存在解」的结构性（构造解即证），正向自检捕获镜像错误（如棱镜 `/` 与 `\` 反射方向写反），Solver 门禁独立给出指标并兜底。「三重」设计的核心理由：Generator 与 Solver 若共享同一处规则误解，门禁失效——正向自检用的是**被前端直接使用**的同一 RulesEngine 文件（D-02），而 Generator 内的逆操作是独立写法，两套推导交叉验证。

**Alternatives considered**: 纯随机 + Solver 筛（宪章 V 明令禁止纯随机；且 8 花色大关可解率极低，量产不可行）；纯逆向无门禁（镜像 bug 无法发现）；SAT/CP 求解（引入求解器依赖，违零依赖）；否决。

## D-11 单滑块单机制标记（互斥机制矩阵）

**Decision**: 一个滑块至多携带一种机制标记：`gear XOR ice XOR chainLocked XOR key`（规范数据契约校验拒绝违反者）。机制交互仍存在（冰封滑块被钥匙解锁?否——锁链是独立标记；齿轮滑块可被冰封?否），跨滑块交互（钥匙解锁他人、三消破冰全场）不受限。

**Rationale**: FR 未要求任何滑块同时持有两机制。若允许叠加（如「冰封的齿轮」），规则交互矩阵与渲染（角标叠加）复杂度双爆炸，而关卡设计收益趋零（50 关参数矩阵从不需要它）。互斥使 RulesEngine 分支线性、Generator 逆操作独立、UI 角标唯一。

**Alternatives considered**: 允许任意叠加（复杂度不可控）；允许两两组合白名单（仍需逐组合定义语义，无需求驱动）；否决。

## D-12 棋盘坐标与方向编码

**Decision**: 格坐标 `(row, col)`，`0 ≤ row,col < N`，row 0 在**顶部**（与 Canvas/SVG 自然坐标一致）；方向枚举 `'U','D','L','R'`（内部数字 0..3，顺序 U→R→D→L，**顺时针**——齿轮/扳手「顺时针 90°」= `(dir+1)%4`）；射线 = 从滑块格沿方向逐格走到边缘，遇「被占格」即受阻。棱镜反射映射：`/`：U→R、R→U、D→L、L→D；`\`：U→L、L→U、D→R、R→D（相对滑动面镜像）。出口列 = 射线终点越界格；Dock 接收方不受出口位置影响（统一飞入动画）。

**Rationale**: 方向数字按顺时针排列使「旋转 90°」成为纯加法，齿轮与扳手（FR-013/FR-024）共用；棱镜映射表用标准镜面反射几何推导，`/` `\` 各 4 条全枚举写入契约（rules-engine.md），消除实现歧义。row 顶部对齐避免 Canvas y 翻转心智负担。

**Alternatives considered**: 方向字符串直接运算（每次 switch）；row 0 在底部（数学坐标，渲染需翻转）；棱镜按「入射角=反射角」运行时计算（表驱动更防错）；否决。

## D-13 9:16 视口与响应式布局

**Decision**: 外层 `#app` 容器：`aspect-ratio: 9/16`；手机（`max-width: 720px` 或 UA 独立视口）`width:100vw; height:100dvh`（dvh 规避移动地址栏抖动，不支持则 100vh 回退）；PC `height:96vh` 居中，`@media (min-width:1024px)` 时右侧留 320px 固定侧栏放调试面板（面板在 DOM 上常驻，移动端折叠为底部抽屉，`translateY` 切换）。棋盘区占视口上部 ~62%，Dock/Staging/道具栏 ~28%，HUD ~10%。字号用 `clamp()` + 容器相对单位。

**Rationale**: FR-007 / 宪章 IV。`aspect-ratio` 与 `dvh` 为 2023+ 全 evergreen 支持的原生 CSS，零 JS 布局计算。移动抽屉 + PC 侧栏是 FR-028「可隐藏/唤出且不影响游玩」的直接实现；面板 DOM 常驻避免移动端重排棋盘。

**Alternatives considered**: JS resize 计算布局（多余）；固定 px 设计（8×8 棋盘在窄屏溢出）；iframe 套壳（无理由）；否决。

## D-14 测试策略：零框架三层验证（Solver 验证即测试基础设施）

**Decision**: 不引入任何测试框架（jest/vitest/mocha 均为 npm 依赖红线）。三层：
1. **Solver 全量验证**（`node tools/solver.js`）：数据契约校验 + 50 关可解性 + 指标输出 + 难度曲线门 + exit code 门禁（CI/合入可机判）；
2. **RulesEngine 自测**（`node tools/solver.js --engine-selftest`）：内置断言集（转向数学、棱镜 8 向映射、齿轮触发邻接、破冰双口径、原子级联序、三消优先于爆槽、终局判定、Undo 快照等价）覆盖 spec Edge Cases，断言失败 exit 1；
3. **quickstart.md 人工场景**（分 M1~M4 里程碑档）：交互手感与视觉验收（音效、动效、无障碍花色区分）无法自动断言。
前端浏览器侧不设自动化测试（webapp-testing 类技能属开发期工具不在交付物内，且本项目交互面小）。

**Rationale**: 宪章 II 禁运行时依赖、但测试框架是 devDependency——然而零构建项目连 package.json 都不该有（交付物纯净度 + SC-006 精神），Node 内置 `assert` + 自建断言已足够覆盖规则类测试；**规则正确性恰是本项目最高风险区**（50 关可解性、机制交互），而 Solver 引擎自测恰好把规则断言跑在与前端同一份 RulesEngine 上。交互层风险由 quickstart 场景 + M1 烟雾关承载。

**Alternatives considered**: 引入 vitest（npm/package.json 进入交付物，违零依赖精神）；浏览器 console 断言（不可机判门禁）；无自测（规则回归靠人肉，50 关返工成本高）；否决。

## D-15 关卡数据规模与文件格式权衡

**Decision**: `levels.js` = `STM.LEVELS` 数组，每关紧凑对象（字段名短式但契约文档化：`n, tiles, prisms, cfg, metrics, solutionMoves`，见 level-data.md schema）；目标 ≤ 200 KB（50 关上限估计：45 tiles × (4+2+1+1 chars) + 解序列 ≤ 45 步 × 3 chars + 指标 ≈ 3 KB/关 → 50 关 ≈ 150 KB 内，预算内）。**不用 JSON 文件**（level.json 需 fetch，file:// CORS 拦截——与 D-01 同根因）。

**Rationale**: 用户指令「双击 index.html 在 file:// 协议下零跨域报错」直接排除独立 JSON + fetch。JS 文件以 `<script defer>` 加载天然同步可用、且可双导出（D-02）。200 KB 预算使 SC-003「首屏 < 3 s」在 3G 模拟下也宽裕（本地文件读取 < 50 ms）。

**Alternatives considered**: `levels.json` + fetch（file:// 拦截，一票否决）；每关一文件懒加载（50 个 `<script>` 或动态注入，复杂度无收益——200KB 整体加载已达标）；JSON 字符串内嵌 `<script type="application/json">`（失去 Node require 复验能力）；否决。

---

## 决策-需求追溯矩阵

| 决策 | 直接服务的 FR / SC / 宪章 |
|---|---|
| D-01 脚本加载 | SC-003、宪章 II、用户 file:// 零报错指令 |
| D-02 双导出 | FR-032、FR-031、宪章 II Node 边界 |
| D-03 进度持久化 | spec Assumptions、Δ4 扩容自适应 |
| D-04 Web Audio | 宪章 III、SC-006、FR-003 音效 |
| D-05 渲染分层 | 宪章 III、性能目标 60fps |
| D-06 Hint/Bot | FR-027、Δ6、SC-002 |
| D-07 Solver 搜索 | FR-030、FR-011、SC-001 |
| D-08 种子可复现 | FR-011 可复现、FR-031 重验基线 |
| D-09 死局口径 | FR-006、FR-032、Edge Case 误报 |
| D-10 三重验证 | FR-029、FR-030、宪章 V |
| D-11 机制互斥 | 机制实现可控性（防御性设计） |
| D-12 坐标/方向编码 | FR-013/FR-014/FR-021 转向折射语义 |
| D-13 9:16 布局 | FR-007、FR-028、宪章 IV |
| D-14 零框架测试 | 宪章 II、FR-030/031 门禁可机判 |
| D-15 levels.js 格式 | Δ6、SC-003、file:// 零报错 |

## 未决项

无。所有 NEEDS CLARIFICATION 在 Technical Context 阶段即被消解（无第三方依赖选型问题；平台行为均已验证为 evergreen 稳定能力）。M2/M3 期间的校准项（Hint 预算、生成器重试参数）已在 level-pipeline.md 标注为「实测校准」非「未决」。
