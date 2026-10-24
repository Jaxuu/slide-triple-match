# Bug Verification: 飞行期间顶层卡牌闪烁 + 待消区托盘/卡牌视觉规范倒置

- **Slug**: flight-layer-dock-visual
- **Tested**: 2026-10-24
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Bug 1：Level 40 多层棋盘触发飞行后，8 个采样帧内所有同格堆叠滑块的绘制顺序均满足 `renderOrderIndex(lowerZ) < renderOrderIndex(upperZ)`，顶层卡牌全程未被下层覆盖。Bug 2：`#dock` 背景为 `rgba(30,41,59,0.55)` 深色半透明 + `backdrop-filter: blur(10px)`；`.dock-chip` 容器白底 + 1px 边框 + 底部投影，内部 `.dock-icon` 78% 居中且无 border/outline/inset shadow。render-selftest 与语法检查通过，无新回归。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Syntax — BoardRenderer.js | `node -c src/render/BoardRenderer.js` | pass | 无语法错误 |
| Syntax — main.js | `node -c src/main.js` | pass | 无语法错误 |
| Layer order stability | Node 脚本：Level 40 多层棋盘 + 飞行触发 + 8 帧采样 | pass | `renderOrderIndex(lowerTile) < renderOrderIndex(upperTile)` 恒成立 |
| Dock style | CSS 源码检查 `#dock` / `.slot` / `.dock-chip` / `.dock-icon` | pass | 深色磨砂托盘；无内嵌方框；图标 78% 居中 |
| Render regression | `node tools/render-selftest.js` | pass (no new) | 11 项 pre-existing 失败（bestiary 扩容/SHEETS/splash），dock 断言 green |

## Output Excerpts

```
Layer order stable across frames: true
render-selftest: 11 pre-existing failures, dock assertion green
```

## Residual Risks

- 无头浏览器/真机截图未在本会话执行；CSS 视觉效果以源码与既有 verify-fix 为准。
- bestiary 扩容导致的 11 项 pre-existing 失败未在本 bug 范围内处理。

## Recommendation

Close the bug — verified. flight-layer-dock-visual 修复已锁定图层顺序与 Dock 视觉规范。
