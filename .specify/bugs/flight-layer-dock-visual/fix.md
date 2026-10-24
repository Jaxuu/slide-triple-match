# Bug Fix: 飞行期间顶层卡牌闪烁 + 待消区托盘/卡牌视觉规范倒置

- **Slug**: flight-layer-dock-visual
- **Fixed**: 2026-10-24
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

修复飞行动画期间静止上层卡牌被下层卡牌覆盖的图层闪烁，以及待消区托盘/卡牌的白色方框与非磨砂外观。BoardRenderer 绘制顺序已保证非飞行卡牌按 z→r→c 升序绘制且飞行卡牌最后绘制；tileInfo 过期缓存清理避免动画层读取过期 z。CSS 恢复 #dock 深色半透明磨砂质感，空槽深色内凹，.dock-chip 容器与棋盘卡牌一致，内部图标清除边框/内嵌阴影并占 78%。

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | 动画层：先绘制非 fly 动画，最后绘制 fly 动画（最高图层）；refresh() 清理过期 tileInfo |
| `css/style.css` | modified | #dock 深色磨砂；.slot 深色内凹；.dock-chip 容器对齐棋盘；.dock-icon 78% 无边框内阴影 |
| `tools/render-selftest.js` | modified | T085 断言更新为新配色（非功能改动） |

## Diff Highlights

```js
// BoardRenderer.js draw() 动画层
for (i = 0; i < anims.length; i++) { if (anims[i].kind === 'reveal' || anims[i].kind === 'fly') continue; drawAnim(...); }
for (i = 0; i < anims.length; i++) { if (anims[i].kind !== 'fly') continue; drawAnim(...); }
```

```css
#dock { background: rgba(30,41,59,0.55) !important; backdrop-filter: blur(10px); border: 1.5px solid rgba(255,255,255,0.22) !important; box-shadow: 0 8px 24px rgba(15,23,42,0.25); border-radius: 14px; }
.slot { background: rgba(15,23,42,0.45) !important; border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.35); }
.slot .dock-icon { width:78%; height:78%; border:none !important; outline:none !important; box-shadow:none !important; }
```

## Tests Added or Updated

- `tools/render-selftest.js` — T085 断言更新配色，仍 green。

## Local Verification

- `node -c src/render/BoardRenderer.js` → pass
- `node -c src/main.js` → pass
- `node tools/render-selftest.js` → 11 pre-existing failures (bestiary 45→90 / SHEETS 3→6 / splash timing), dock 断言 now green, no new failures introduced.

## Deviations from Assessment

- 未修改 `src/main.js`：Dock 卡牌样式与图标占比已完全由 CSS + 既有 `chipSVG`（已消费 `STM_ICON_BBOXES`）覆盖，无需额外 JS 变更；保持最小改动。

## Follow-ups

- 实机截图复核 Dock 托盘磨砂效果与卡牌 1:1 一致性。
- pre-existing render-selftest 失败（bestiary 扩容/SHEETS 6 张/splash 时序）需单独处理，不属于本 bug。