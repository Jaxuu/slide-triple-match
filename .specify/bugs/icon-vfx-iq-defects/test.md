# Bug Verification: 图标裁切 / VFX 瀑布 / IQ 小数（三合一）

- **Slug**: icon-vfx-iq-defects
- **Tested**: 2026-10-23
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

自动化检查（源码结构断言 + 现有 selftest/verify-fix）全部通过：23 项新增结构断言 0 失败，`render-selftest.js` 与 `verify-fix.cjs` 均 ALL GREEN。但本环境无可用浏览器/渲染器，未实际执行 assessment 中描述的浏览器端像素/坐标/粒子验证，故按 guardrail 降级为 partial。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| 源码结构断言（23 项） | `node tools/_verify_bugfix.cjs`（临时脚本，已清理） | pass | inset 0.035、8px 安全区、slice.width/height、0.82 居中、旧 shards 禁用、VFX 150 枚/新轨迹/不透明 85%、IQ Math.round、slot-shattering class |
| 渲染自测 | `node tools/render-selftest.js` | pass | exit 0, all green |
| 交互/几何回归 | `node tools/verify-fix.cjs` | pass | exit 0, ALL GREEN |
| 语法检查 | `node --check src/render/BoardRenderer.js` / `src/main.js` | pass | 无语法错误 |
| 图标像素 4px 边界透明 | 浏览器像素采样 | not-run | 无可用浏览器/Canvas 渲染环境 |
| VFX 粒子数 ≥120 / 起点在 #dock / alpha 255 | 浏览器像素采样 | not-run | 无可用浏览器 |
| IQ 正则 `/^IQ:\s*\d+$/` | 浏览器 DOM 断言 | not-run | 无可用浏览器 |

## Output Excerpts

```
Checks: 23, pass: 23, fail: 0
render-selftest: all green
验证结果: ALL GREEN
```

## Residual Risks

- 浏览器端像素/粒子/坐标验证未执行；实际动物切边、#vfx-canvas 粒子轨迹与不透明度需在真实浏览器中复核。
- `#vfx-canvas` 粒子起点使用 `getBoundingClientRect()` 的 viewport 坐标，需在真实布局下确认与 `#dock` 重合。
- `.slot-shattering` 动画在 renderDock 立即重绘后节点被替换，槽位碎裂视觉可能短暂。

## Recommendation

自动化与回归检查全部通过，代码改动符合 fix.md 契约；但因未在浏览器中实际复现/验证像素与粒子，按 guardrail 降级为 partial。建议在具备浏览器的环境中运行 `/speckit.bug.test` 的像素断言后再最终关闭。用户要求同步推送，本次按 partial 状态执行 git add/commit/push。