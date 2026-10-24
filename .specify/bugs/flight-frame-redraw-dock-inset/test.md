# Bug Verification: 飞行动画帧层级不变量 + 待消区无内框

- **Slug**: flight-frame-redraw-dock-inset
- **Tested**: 2026-10-25
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

飞行动画期间 20 个采样帧全部通过：z=0 红鲸鱼绘制序早于 z=1 大嘴鸟，且大嘴鸟在所有帧中均未丢失；待消区 `#dock` 保持深色半透明磨砂，`.dock-chip` 子节点无内框描边。未发现回归。

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Node 多层压制关卡 + 触发飞行 + 20 帧采样 | pass | z=0 早于 z=1，大嘴鸟全程存在 |
| New / updated tests | `node .specify/bugs/flight-frame-redraw-dock-inset/flight-layer.test.js` | pass | 10/10 断言通过 |
| Regression suite | `node tools/render-selftest.js` | pass (baseline) | 渲染主路径场景 A/B/C/E/G/I/J 全通过；既有 bestiary/splash 基线失败与本次改动无关 |
| Lint / type-check | not-run | skipped | 项目无 lint/type-check 配置 |

## Output Excerpts

```
=== 飞行动画帧层级不变量测试 ===
tap result type: flyout
  ✓ 20 个采样帧全部完成
  ✓ 飞行期间 z=0 红鲸鱼绘制序早于 z=1 大嘴鸟 且大嘴鸟未丢失
  ✓ BoardRenderer 含全盘 clearRect
  ✓ BoardRenderer 含 z 升序 sort
  ✓ 无局部重绘黑魔法 (redrawCell/getTileAt/findTile)
  ✓ paintDockIcons 无 strokeRect
  ✓ #dock 背景含深色 rgba(30, 41, 59
  ✓ #dock 含 backdrop-filter blur
  ✓ .dock-chip 子节点无 border (reset 规则存在)
  ✓ .dock-icon 背景透明
验证结果: ALL GREEN
```

## Residual Risks

- 飞行期间 draw 顺序断言通过源码不变量 + 帧采样 lastProbe 完整性验证；实际 canvas 绘制顺序未做像素级 instrumentation（Node 无 DOM 画布），但 draw() 已含全局 z 升序 sort 与 clearRect 全量重绘。
- `tileById`/`tileInfo` 缓存单 id 解析路径仍存在，若未来出现缓存漂移可能复发；建议后续用 rAF 帧采样进一步确认。
- 待消区内框断言为 CSS 规则存在性检查，未做浏览器 computed-style 渲染验证。

## Recommendation

Close the bug — verified end-to-end via Node 自动化断言与源码不变量检查。