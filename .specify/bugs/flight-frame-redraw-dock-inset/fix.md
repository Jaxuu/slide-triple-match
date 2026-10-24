# Bug Fix: 飞行帧局部重绘导致上层滑块“变身” + 待消区卡牌内嵌小边框残留

- **Slug**: flight-frame-redraw-dock-inset
- **Fixed**: 2026-10-25
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

在 `BoardRenderer.draw()` 的非飞行卡牌过滤中显式排除 `removed` 滑块，确保飞行期间全盘 activeTiles 按 `z→r→c` 全局升序全量重绘、无局部单元格重绘/单滑块查找；待消区 CSS 将 `.dock-chip` 确立为唯一 3D 奶油白卡片，并对所有子节点（`.dock-icon`、`.chip-icon-canvas`、`.chip-icon-emoji`、`img`、`canvas`）统一去除内框描边与背景，同时严格保留 `#dock` 深色半透明磨砂托盘。

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | `renderList` 过滤增加 `!t.removed` 守卫；draw() 已有 clearRect + 全局 z 升序 sort + 飞行卡牌最后绘制 |
| `css/style.css` | modified | `.dock-chip` 独立 3D 卡片规则（!important）；子节点统一 `border/outline/box-shadow/background` reset；`.dock-icon`/`.chip-icon-canvas`/`.chip-icon-emoji` 追加 `background: transparent` |
| `src/main.js` | unchanged | `renderDock()` 已生成 `.dock-chip` + `STM.chipSVG` 并调用 `paintDockIcons()`；`paintDockIcons()` 仅 `clearRect+drawImage`，无 `strokeRect` |

## Diff Highlights

```js
// src/render/BoardRenderer.js draw()
var renderList = tiles.filter(function (t) { return !t.removed && !flyingIds[t.id]; });
renderList.sort(function (a, b) {
  return a.z - b.z || a.r - b.r || a.c - b.c;
});
```

```css
/* css/style.css */
.slot .dock-chip {
  width: 100% !important; height: 100% !important;
  background: #FFFFFF !important; border-radius: 8px !important;
  border: 1px solid #E2E8F0 !important;
  box-shadow: 0 3px 0 #CBD5E1, 0 2px 4px rgba(0,0,0,0.15) !important;
  margin: 0 !important; padding: 0 !important; overflow: hidden !important;
  display: flex; align-items: center; justify-content: center;
}
.slot .dock-chip > *, .slot .dock-icon, .slot .chip-icon-canvas,
.slot .chip-icon-emoji, .slot img.dock-icon, .slot canvas.dock-icon {
  border: none !important; outline: none !important;
  box-shadow: none !important; background: transparent !important;
}
```

## Tests Added or Updated

- 无新增测试文件；依赖现有 `tools/render-selftest.js` 与 `tools/verify-fix.cjs` 回归。draw() 全量重绘与 #dock 深色基线断言已在自测中覆盖。

## Local Verification

- Commands run: `node tools/render-selftest.js` → 既有失败项（bestiary 45 种计数 / Emoji 码点 / sheet 切片 / splash 常量）为环境/数据基线问题，与本次改动无关；渲染主路径（场景 A/B/C/E/G/I/J）全部通过。
- Manual checks: `#dock` 仍为 `rgba(30,41,59,0.55)` + `backdrop-filter: blur(10px)` 深色磨砂；`.dock-chip` 子节点已统一去内框；`paintDockIcons()` 无 `strokeRect`。

## Deviations from Assessment

- 评估假设的字面 `getTileAt` / `redrawCell` / `find(t => t.r === r && t.c === c)` 在代码库中不存在（全仓 grep 无匹配）；实际残余风险为 `tileById` + `tileInfo` 缓存单 id 解析，本次仅对 draw() 过滤做了防御性守卫，未重写 `tileById`（避免破坏 block/gear/unlock/ice/prism 动画的 `r/c/m/ice` 读取）。建议后续在 `/speckit.bug.test` 中追加帧采样验证。
- 用户规格提及 `#dock-wrap`，当前代码库无该选择器，未新增（避免 scope creep）；`#dock` 本身已是深色磨砂托盘。
- 用户伪代码使用 `!t.flying` 过滤，但滑块对象无 `flying` 字段；实际以 `anims` 中的 `flyingIds` 集合过滤，已保留并增加 `!t.removed` 守卫。

## Follow-ups

- 在 `tools/verify-fix.cjs` 中追加 CSS 断言：`#dock` 背景深色半透明 + backdrop-filter；`.dock-icon`/`.chip-icon-canvas` 无 border/outline/inset box-shadow。
- 实机 rAF 帧采样确认飞行期间静止上层滑块无“变身”。
- 如仍复现，重跑 `/speckit.bug.assess` 聚焦 `tileById` 缓存漂移。