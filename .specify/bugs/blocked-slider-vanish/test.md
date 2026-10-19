# Bug Verification: 受阻滑块贴图永久消失（真机 Chrome 红绿双向 + Node 全量回归）

- **Slug**: blocked-slider-vanish
- **Tested**: 2026-10-19
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: **verified**（真机复现执行完毕——非仅测试推断）

## Summary

在真实 Chrome（CDP 无头驱动，加载项目 index.html 原始页面、真实 pointer 事件、真实 canvas 像素采样）中双向验证：修复前代码受阻滑块点击后格中心像素变为精确背景色 `27,36,48,255`（贴图消失）且抛出未捕获 `TypeError: createLinearGradient non-finite`；修复后代码同一滑块贴图颜色 `245,238,227,255` 在受阻点击、二次受阻点击（复现路径「再点消失滑块」）、齿轮级联点击全程存活，页面零未捕获异常。Node 侧全量回归（引擎自测/50 关求解门禁/渲染自测）全绿，无任何新回归。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| **Reproduction (pre-fix, real browser)** | `node tools/browser-bugtest.js --level 1`（工作区临时换入 HEAD~1 渲染器后运行，运行毕还原） | **fail = 症状复现** ✅ | 格中心色 `245,238,227,255` → `27,36,48,255`（=背景色，贴图消失）；2 项存活断言红；页面 2 个未捕获 Script error |
| Forensic error capture (pre-fix, real browser) | CDP `Runtime.exceptionThrown` 捕获（临时探针，已删） | 崩溃原文捕获 | `TypeError: Failed to execute 'createLinearGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite.`（与 assessment 预测的崩溃点完全一致） |
| **Reproduction (post-fix, real browser)** | `node tools/browser-bugtest.js --level 1` | **pass** | 12/12 断言绿：贴图存活（颜色前后一致且 ≠ 背景）+ rAF 600ms≥30 帧 + 二次点击存活 + 齿轮路径 + 零未捕获异常 |
| Real browser on gear level (post-fix) | `node tools/browser-bugtest.js --level 6` | **pass** | 齿轮联动动画路径 rAF 存活 + 零异常（同根缺陷回归）。注：L6 目标格读数 `0,0,0,0`（7×7 边缘格探针局限，像素断言在该关不作判据——L1 已提供像素级证据） |
| New / updated tests | `node tools/render-selftest.js` | **pass** | 21/21 绿（Δ12 新增渲染回归防线） |
| Red-check of new tests (pre-fix code) | `git show HEAD~1` 换入渲染器后运行 | **4 项红** | 崩溃签名一致（`moveTo: non-finite NaN`——Node 桩全坐标校验先命中路径调用，Chrome 实机先命中渐变构造；同一调用链） |
| Regression suite (engine) | `node tools/solver.js --engine-selftest` | **pass** | 11/11 绿 |
| Regression suite (full 50-level gate) | `node tools/solver.js` | **pass** | 50/50 solvable，curveGate 全绿（chMonotonic/slope14=13.50/waveZigzag），exit 0；solver-report.json 仅 elapsedMs/时间戳漂移（已还原，工作区零残留） |
| Lint / type-check | `node --check`（src 全 6 文件 + tools 2 文件） | **pass** | 无 lint 工具链（宪章零依赖），语法全过 |

## Output Excerpts

```
# 真机修复前（症状复现）:
✗ 受阻滑块贴图存活（格中心非背景色） [color=27,36,48,255 vs BG 27,36,48]
✗ 贴图颜色与点击前一致（回到原位） [245,238,227,255 → 27,36,48,255]
✗ 全程零未捕获异常（崩溃哨兵） [["Script error.","Script error."]]
EXCEPTION: TypeError: Failed to execute 'createLinearGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite.

# 真机修复后（L1）:
目标滑块: id=18 格(1,2) 5×5
✓ rAF 主循环存活（600ms 内 ≥30 帧渲染管线持续）
✓ 受阻滑块贴图存活（格中心非背景色）  [245,238,227,255 不变]
✓ 贴图颜色与点击前一致（回到原位）
✓ 二次点击后 rAF 仍存活 / ✓ 二次点击后贴图仍存活
✓ 全程零未捕获异常（崩溃哨兵）
browser-bugtest: all green

# Node 回归:
render-selftest: all green | engine-selftest: 11/11 all green
summary: 50/50 solvable, 耗时 7.93s | curveGate: chMonotonic=true slope14=13.50 waveZigzag=true
```

## Residual Risks

- **视觉观感（非阻断）**：Node/像素探针证明贴图存活与回位，但 360ms 弹回动画的动态观感（幅度 0.38 格 + 棋盘抖动叠加）未做人工审美确认——建议玩家视角试玩一次受阻反馈手感。
- **冰封/破冰/齿轮视觉首次生效**：修复使 T034 以来从未真正绘制过的机制特效开始显示（含冰层厚度角标），属契约预期回归，但视觉上对老玩家是"变化"，建议过目 L12（4 冰）/L6（齿轮）确认观感。
- 本验证为无头模式（`--disable-gpu` 软件渲染）；有 GPU 加速环境的 canvas 像素取值路径相同（2D canvas 语义一致），风险可忽略。
- `tools/browser-bugtest.js` 为新验证资产（未提交——本命令不改动已提交代码；若纳入 D-14 门禁建议随下次提交入库）。

## Recommendation

**关闭本 bug——端到端 verified。** 评估的复现步骤已在真实浏览器完整执行：修复前症状精确复现（贴图变背景色消失 + 评估预测的原版 TypeError 崩溃签名），修复后全流程存活、零异常，50 关求解门禁与引擎自测全量回归无扰。建议：① 将 `tools/browser-bugtest.js` 与 `tools/render-selftest.js` 一并纳入 D-14 验证命令集（渲染层此前零防线，本 bug 即代价）；② 安排一次人工试玩（受阻反馈手感 + 机制特效首见观感）作为收尾确认。
