# Bug Fix: 受阻滑块贴图永久消失（tileInfo 缓存缺 r/c → NaN 崩溃杀死 rAF 主循环）

- **Slug**: blocked-slider-vanish
- **Fixed**: 2026-10-19
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

按评估首选方案修复：BoardRenderer `refresh()` 的 `tileInfo` 视觉缓存条目补全 `r/c/m/ice` 全量绘制字段（根因——block/gear/unlock/ice 动画经 `tileById` 缓存优先命中后读不到 `t.c`/`t.r` → NaN → canvas 抛 TypeError → rAF 主循环永久死亡），并落地评估建议的三项伴随/防御修复（冰层厚度字段名错位、`frame()` try/catch 纵深防御）与零依赖渲染回归自测（评估 Tests 节的 Playwright 替代实现——本机无 Playwright，符合宪章零外部依赖）。

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | ① `refresh()` 缓存条目补 `r/c/m/ice`（一处写入收口四条同根 NaN 路径）② `drawTileBody` 冰封覆层厚度读取 `t.x \|\| 1` → `t.ice != null ? t.ice : (t.x \|\| 1)` ③ `frame()` 的 `draw()` 包 try/catch + finally 置 `dirty=false`——单帧异常不再杀死 rAF 重排程，异常 `console.error('[STM render]')` 留痕 |
| `tools/render-selftest.js` | added | 零依赖 Node 渲染冒烟自测：浏览器契约级 canvas 桩（渐变/路径坐标有限性校验——Chrome 同款抛错行为）+ 手动 rAF 泵 + 事件流复刻 main.js handleSessionEvent 渲染语义；21 断言三场景（受阻滑块全动画窗口+连点 / gear+unlock+ice+fly 并发 / 棱镜折射） |
| `specs/001-slide-triple-match-core/tasks.md` | modified | 追加 Δ12 变更记录（根因链/回归史/修复明细/验证闭环） |
| `.specify/bugs/blocked-slider-vanish/fix.md` | added | 本报告 |

## Diff Highlights (optional)

```js
/* refresh() —— 根因修复：缓存条目补全绘制字段 */
tileInfo[t.id] = {
  id: t.id, r: t.r, c: t.c, s: t.s, d: t.d, z: t.z || 0, stackDepth: t.stackDepth || 1,
  m: t.m || null, ice: t.ice != null ? t.ice : null
};

/* frame() —— 纵深防御：单帧异常不杀 rAF 循环 */
try {
  draw();
} catch (err) {
  if (global.console && console.error) console.error('[STM render]', err);
} finally {
  dirty = false;
}
```

## Tests Added or Updated

- `tools/render-selftest.js` 场景 A — **本 bug 主路径回归锁**：受阻滑块 tap → block 动画 30 帧全程无异常 → 动画结束后同格可再次点击（rAF 存活）→ 第二次 blocked 全程无异常（复现"永久消失"的自愈式连点路径）+ 逻辑态断言（t0 仍在棋盘、hitTest 语义不变）。红绿双向验证：旧代码（git stash 还原）此场景 2 项断言红且崩溃签名与真机一致（`moveTo: The provided double value is non-finite: NaN`）。
- 场景 B — 同根缺陷路径：钥匙飞出触发 gear/unlock/ice 动画并发（旧代码 1 项红——NaN 崩溃证明齿轮/解锁动画与 blocked 同根）；冰层厚度角标 `t.ice=3` 渲染断言（旧代码红——`t.x` 字段错位致角标从不显示）；机制逻辑态断言（齿轮转向 d 1→2 / 锁链解锁≠移除 / dock 入槽）。
- 场景 C — 棱镜折射 flyout 路径动画无异常。
- 断言器风格与 `--engine-selftest`（T038）一致，进程 exit code 0/1 可接入后续门禁。

## Local Verification

- `node tools/render-selftest.js` → **21/21 all green**（固定后代码）
- 红检（`git stash push src/render/BoardRenderer.js` → 旧代码运行 → `git stash pop`）→ **4 项红**：冰层角标缺失 + block×2 NaN 崩溃 + 机制动画并发 NaN 崩溃（`[moveTo: The provided double value is non-finite: NaN]`——与评估预测的崩溃点一致，实际首个抛错点在 `roundRect`→`moveTo` 而非 `createLinearGradient`，同一 `drawTileBody` 调用链）
- `node tools/solver.js --engine-selftest` → **11/11 all green**（引擎回归无扰）
- `node --check src/render/BoardRenderer.js` → 语法通过
- FR-031 判定：**不触发**——纯渲染层修复，`levels.js`/`level-config.js`/`RulesEngine.js` 引擎与关卡语义零变更（无需重跑 M3 流水线）

## Deviations from Assessment

- 评估 Tests 节建议 Playwright 浏览器 e2e，并留有 [NEEDS CLARIFICATION]（安装许可）。本机 npx 离线不可用 Playwright；落地为零依赖 Node 冒烟方案（浏览器契约级 canvas 桩 + 手动 rAF 泵），覆盖评估列出的核心断言（无未捕获异常 / rAF 存活 / 可再次点击）并做了红绿双向验证。若后续需要像素级/真机验证，可再补 Playwright e2e（建议进入 `/speckit-bug-test` 阶段决策）。
- 崩溃签名细节：评估预测首个抛错点为 `createLinearGradient(NaN)`；实测（Node canvas 桩按 Chrome 行为校验所有坐标）首个抛错点为同函数更早的 `roundRect`→`moveTo(NaN)`。同一根因同一调用链，不影响修复方案与验证结论。
- 评估"Risks"节提示 block 动画首次真正可见需人工过目视觉效果（360ms 弹回 + 抖动叠加）——Node 冒烟无法验证视觉观感，留待 `/speckit-bug-test` 或人工确认。

## Follow-ups

- 建议将 `node tools/render-selftest.js` 纳入既有验证命令集（与 `--engine-selftest` 并列，D-14 三层测试的渲染层防线——此前渲染缺陷无任何自动防线，本 bug 即证据）。
- 玩家可见的"表现变化"需知悉：① 受阻滑块 m16 以来首次正确绘制 block 弹回动画（此前是闪崩消失）；② 齿轮转向/钥匙解锁动画首次真正播放；③ 破冰碎裂特效首次可见；④ 冰封滑块开始显示真实厚度与角标数字——均为恢复契约（FR-017 等）预期行为。
- 后续可选：为 `frame()` 捕获的渲染异常加一次性上报标记（避免同异常每帧刷屏 console）。
