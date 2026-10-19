# Bug Assessment: 受阻滑块点击后贴图永久消失（blocked 动画 NaN 崩溃致 rAF 主循环死亡）

- **Slug**: blocked-slider-vanish
- **Created**: 2026-10-19
- **Source**: pasted text（"点击受阻滑块触发 blocked 动画后，贴图永久消失，逻辑状态正常"）
- **Verdict**: valid（代码路径确定性复现，无需运行时旁证）
- **Severity**: high

## Report (verbatim)

> 点击受阻滑块触发 blocked 动画后，贴图永久消失，逻辑状态正常

## Symptom

点击一枚滑动射线被阻挡的滑块（触发 blocked 弹回动画：受阻音效 + 棋盘抖动）后，该滑块的贴图立即从画布上消失且不再恢复；引擎逻辑状态完全正常（滑块仍在棋盘、可再次命中点击、受阻音效/抖动反馈照常）。预期行为：滑块播放 ~360ms 弹回动画后回到原位继续显示。

## Reproduction

1. 打开 index.html 进入任意关卡（早期关卡即可；需要一枚滑动方向被同层/高层滑块或棱镜阻挡的滑块）。
2. 点击该受阻滑块 → 听到 blocked 音效、棋盘抖动（"blocked 动画"反馈正常）→ **该滑块贴图立即消失**。
3. 在原格再次点击（滑块逻辑上仍在）：blocked 音效 + 抖动再次出现，贴图仍然缺失——证明逻辑/命中检测正常，仅渲染丢失。
4. 打开 DevTools Console：可见未捕获异常 `TypeError: The provided double value is non-finite.`（源自 BoardRenderer `drawTileBody` 内 `createLinearGradient(NaN, ...)`）。
5. 唯一恢复途径：点击另一枚能飞出的滑块 / 使用撤销道具 / 触发窗口 resize——任何引发 `refresh()→markDirty()→start()` 的交互；而反复点击消失的滑块本身只会再次触发 blocked → 再次崩溃 → 视觉上"永久消失"。

## Suspected Code Paths

- [src/render/BoardRenderer.js:764-772](src/render/BoardRenderer.js#L764-L772) — `tileById()`：`tileInfo` 视觉缓存**优先于** live probe 命中。m16(63cd701) 起，`refresh()` 为所有未移除滑块写入缓存条目，故受阻滑块（未移除）必然命中缓存。
- [src/render/BoardRenderer.js:819-824](src/render/BoardRenderer.js#L819-L824) — `refresh()` 写入的缓存条目仅含 `{id, s, d, z, stackDepth}`，**缺 `r`/`c`**（也缺 `m`/`ice`/`x`）。
- [src/render/BoardRenderer.js:689-695](src/render/BoardRenderer.js#L689-L695) — `drawAnim` 的 `block` 分支用 `t.c`/`t.r` 计算绘制坐标 → `undefined` 参与算术 → `px`/`py` = NaN。
- [src/render/BoardRenderer.js:249-250](src/render/BoardRenderer.js#L249-L250) — `drawTileBody` 内 `ctx.createLinearGradient(x, fz, ...)` 收到 NaN → 浏览器抛 `TypeError`（非有限双精度值）→ `draw()` 中途崩溃。
- [src/render/BoardRenderer.js:573-589](src/render/BoardRenderer.js#L573-L589) — 静态层 `blockSet` 跳过受阻滑块（m16 防重影护栏），且 `draw()` 开头已 `clearRect`（[L545](src/render/BoardRenderer.js#L545)）→ 崩溃帧留下的画面 = 全棋盘减去该滑块。
- [src/render/BoardRenderer.js:492-500](src/render/BoardRenderer.js#L492-L500) — `frame()` 中 `start()`（rAF 重排程）位于 `draw()` 之后；`draw()` 抛异常 → `start()` 永不执行 → **rAF 主循环永久死亡**。
- [src/main.js:305-309](src/main.js#L305-L309) — blocked 事件流：`handleEvent`（推入 block 动画）→ `refresh()`。
- [src/core/RulesEngine.js:269-283](src/core/RulesEngine.js#L269-L283) — 引擎 blocked 分支：滑块不移除、留在棋盘 → "逻辑状态正常"的原因。
- 回归史：`63cd701`(m16) 同时引入 `tileInfo` 缓存与 `blockSet`；`490c870`(Δ10) 移除了 400ms 兜底重绘 setTimeout → 此前表现为 ~400ms 闪灭，此后无任何定时器复活主循环（已核查当前 main.js 全文，仅 toast 有 setTimeout）→ 变为"永久消失"。

## Root Cause Hypothesis

**置信度：高（确定性代码路径，纯渲染层，无环境依赖）。**

`tileById()` 对未移除滑块恒返回 `tileInfo` 缓存条目（m16 引入，供已移除滑块的飞出/三消动画续绘），而该缓存条目**不含 `r`/`c` 坐标**。`drawAnim` 的 `block` 分支从返回对象读取 `t.c`/`t.r` 计算绘制位置 → NaN → `drawTileBody` 内 `createLinearGradient(NaN,...)` 抛 TypeError → `draw()` 在静态层跳过该滑块（blockSet 防重影）且 `clearRect` 已清屏之后崩溃 → `frame()` 末尾的 rAF 重排程 `start()` 不可达 → 渲染主循环永久死亡，画布冻结为"全棋盘减去受阻滑块"。Δ10 删除兜底重绘定时器后无自动复活路径；用户再次点击消失的滑块（最自然的反应）→ 再次 blocked → 新动画再次 NaN 崩溃 → 自我续命，视觉上永久消失。逻辑层（引擎/probe/hitTest/音效/DOM 抖动）完全不经由崩溃路径，故"逻辑状态正常"。

**同类潜伏缺陷（同一根因，修复应一并覆盖）**：`gear`(L698-706)/`unlock`(L707-714) 动画分支同样经 `tileById` 读 `t.c`/`t.r` → 同样 NaN 崩溃（表现为齿轮/钥匙联动时飞行动画冻结）；`ice`(L715-731) 分支坐标 NaN 但无渐变调用 → 静默不可见（破冰碎裂特效从未生效）。另有一处相邻字段名错位：`drawTileBody` L271 冰封覆层读 `t.x`，而 probe/缓存对象上字段名为 `ice`/`m`（见 [RulesEngine.js:760](src/core/RulesEngine.js#L760)）→ 冰层厚度恒按 1 层绘制、厚度角标从不显示。

## Proposed Remediation

**Preferred**：补全 `tileInfo` 缓存条目的渲染字段——在 `refresh()`（BoardRenderer.js:822）的写入处增加 `r: t.r, c: t.c, m: t.m || null, ice: t.ice != null ? t.ice : null`。一处写入即可同时修复：① block 弹回动画（活滑块，缓存随每次 refresh 更新到最新坐标）；② gear/unlock 动画崩溃与 ice 特效不可见（同一读取路径）；③ 已移除滑块飞出动画的机制角标缺失（缓存保留移除前最后坐标/机制态，正是飞出动画所需）。注意保持 `handleEvent → refresh` 的调用序不变（现序已正确：先推动画后刷新缓存，移除滑块的 stale 条目恰为其最终棋盘位）。

**Alternatives**:
- `tileById()` 改为 probe 优先、缓存兜底（未移除滑块用 probe 完整对象，已移除才查缓存）：同样修复活滑块动画，但已移除滑块的机制角标仍缺失，且两处数据源语义分裂；不如补全缓存字段一处收口。
- 纵深防御（建议与 Preferred 并做，非替代）：`frame()` 内将 `draw()` 包入 try/catch，并保证 rAF 重排程在 finally 中执行（单帧绘制异常不再杀死主循环）；异常时剔除肇事动画条目。修复 NaN 根因后此为保险层。

**Files likely to change**:
- [src/render/BoardRenderer.js](src/render/BoardRenderer.js)（refresh 缓存字段补全；可选 frame() try/catch 兜底；顺手修复 `t.x || 1` → `t.ice || t.x || 1` 冰层厚度读取）

**Tests to add or update**:
- 浏览器级 e2e（Playwright，可用 webapp-testing skill 驾驭）：进入关卡 → 引擎侧枚举一枚 blocked 滑块 → 点击 → 断言 ① Console 无未捕获 TypeError；② ≥600ms 后该格画布像素非背景色（滑块已回到静态层）；③ 再次点击同格仍有 blocked 反馈且贴图持续在。现有 `node tools/solver.js --engine-selftest`（T038）只覆盖引擎不变量，不覆盖渲染器——渲染缺陷无既有防线，本 bug 即证据。
- 附带回归断言：触发 gear/unlock/ice 事件后画布持续重绘（rAF 存活）。
- 注意：本机当前未安装 Playwright（npx 离线不可用），e2e 需先解决运行环境（[NEEDS CLARIFICATION: 是否允许安装 playwright 依赖用于验证，或降级为手工验证清单]）。

## Risks & Considerations

- 缓存字段补全为纯增量改动，风险极低；`tileInfo` 为 per-renderer 实例级 Map（loadLevel 每关新建 renderer），无跨关内存累积问题（单关 tile id ≤150）。
- frame() try/catch 兜底会掩盖未来真异常——异常仍应 console.error 留痕，仅阻断"主循环死亡"这一放大器。
- 修复后 block 动画首次真正可见（m16 以来从未正确绘制过），需人工过目 360ms 弹回视觉（幅度 0.38 格）是否与抖动反馈叠加过强。
- 伴随修复 ice 厚度读取（`t.x` → `t.ice`）会改变现有视觉（冰封滑块开始显示真实厚度/角标）——属回归到 FR-017 契约行为，非破坏。

## Open Questions

- [NEEDS CLARIFICATION: 观测环境（浏览器/关卡号）——非修复必需，仅用于核对崩溃签名]
- [NEEDS CLARIFICATION: e2e 验证工具链（Playwright 安装许可）——见 Tests 节]
