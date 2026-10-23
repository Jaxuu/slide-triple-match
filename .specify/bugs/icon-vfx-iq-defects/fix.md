# Bug Fix: 图标裁切 / VFX 瀑布 / IQ 小数（三合一）

- **Slug**: icon-vfx-iq-defects
- **Fixed**: 2026-10-23
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

按 assessment 根因结论实施：减小 sheet 切片内缩并加 8px 透明安全边距、切片源尺寸严格用 `slice.width/height` 与 0.82 居中绘制；彻底移除 `#board` 旧半透明碎片的 spawn 与绘制，重做 `#vfx-canvas` 瀑布（50 枚/槽、不透明前 85%、立体白瓷双层画法、新轨迹参数）；IQ 三处显示取整。

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | `whiteKeySlice`/`whiteKeySliceSq` 内缩 0.09→0.035 + `drawImage(..., 8, 8, 240, 240)`；`drawBestiaryIcon` 用 `slice.width/height` 源 + 居中 `dx/dy`；`drawTileBody` iconSize `w*0.85`→`Math.round(w*0.82)`；禁用旧 `shards` spawn/绘制；`spawnDockShatter` 重写（DOMRect width/height、50 枚/槽、新轨迹）；`drawVfx` 立体白瓷 + 不透明前 85%；常量 `DOCK_SHARD_PER_SLOT=50`、`TOTAL=150`、`GRAVITY=950` |
| `src/main.js` | modified | IQ 三处 `String(iqScore)`→`String(Math.round(iqScore))`；match 分支槽位 fallback 改为前 3 个非空槽；消除槽添加 `slot-shattering` class |
| `tools/render-selftest.js` | modified | iconSize 断言同步为 `Math.round(w * 0.82)` |
| `css/style.css` | unchanged | `#vfx-canvas` 与 `.slot-shattering` 已在 T092 提供，无需改动 |

## Diff Highlights (optional)

- `whiteKeySlice`: `padX = Math.round(cellW * 0.035)`，`sx = Math.round(col * cellW) + padX`，`drawImage(img, sx, sy, sw, sh, 8, 8, 240, 240)`。
- `drawBestiaryIcon`: `ctx.drawImage(slice, 0, 0, slice.width, slice.height, Math.round(cx - iconSize / 2), Math.round(cy - iconSize / 2), iconSize, iconSize)`。
- `spawnDockShatter`: `rw = rect.width || rect.w || 1`，`vx = -220 + Math.random()*280`，`vy = -120 + Math.random()*300`，`r0 = 7 + Math.random()*11`，`n = 5 + floor(rand*2)`。
- `drawVfx`: `a = ratio > 0.15 ? 1.0 : ratio/0.15`；厚度底面 `#94A3B8` 偏移 2.5px + shadow `rgba(15,23,42,0.45)` blur 5 offsetY 3；瓷面 `#FFFFFF/#F1F5F9` + stroke `#64748B` lineWidth 1.2。

## Tests Added or Updated

- `tools/render-selftest.js` — iconSize 断言更新为 `Math.round(w * 0.82)`。
- 现有 `tools/verify-fix.cjs` 通过（ALL GREEN）。
- `tools/render-selftest.js` 通过（all green）。

## Local Verification

- Commands run: `node --check src/render/BoardRenderer.js` → OK；`node --check src/main.js` → OK；`node tools/render-selftest.js` → exit 0（all green）；`node tools/verify-fix.cjs` → exit 0（ALL GREEN）。
- Manual checks: 未运行浏览器（无可用本地 HTTP 服务端点）；逻辑由自测与 verify 覆盖。

## Deviations from Assessment

- assessment 提议内缩取 0.02/0.04/0；用户 fix 指令明确要求 0.035 + 8px 透明安全边距，按用户指令执行。
- assessment 提议 `spawnShards` 禁用 + `rect.width/height` 修复；用户要求额外升级为 50 枚/槽、立体白瓷双层画法与新轨迹参数，已全部落实。
- assessment 未要求修改 `tools/render-selftest.js` 之外的测试；仅同步了 iconSize 断言。

## Follow-ups

- 建议运行 `/speckit.bug.test slug=icon-vfx-iq-defects` 进行端到端验证。
- `.slot-shattering` 动画在 renderDock 立即重绘后节点被替换，槽位碎裂视觉可能短暂；如需完整 180ms 演出，可考虑延迟 renderDock，但需评估状态同步风险。