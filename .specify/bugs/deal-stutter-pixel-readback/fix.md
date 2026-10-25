# Bug Fix: 开局发牌与游玩卡顿（像素回读通路）

- **Slug**: `deal-stutter-pixel-readback`
- **Fixed**: 2026-10-25
- **Assessment**: ./assessment.md
- **Test**: ./test.md
- **Status**: applied（Δ25）

## Summary

根因是 **`getImageData` 的 GPU→CPU 同步回读**，不是渲染量、不是音频。默认 2D 上下文是 GPU 后备的，回读要先把整块像素从显存同步拷回内存，且这条通路**首次使用**还有一次性初始化——实测冷启动首次 `1024²` 需 **279.6ms**，而 `willReadFrequently: true`（CPU 后备）的上下文同样冷启动首次只要 **9.9ms**。

旧实现 96 格逐格回读，首张吃满初始化惩罚（实测 1011ms），把设计值 1000ms 的落牌编舞拉长到 **2883~3158ms**。修复分四步：① 回读画布全部改 WRF 上下文；② `registerSheet` 改图集批量键控（回读 `96 → 6`）；③ 大厅/局内准备推到切片就绪之后，编舞与键控彻底解耦；④ `AudioContext` 预热改确定性时机（`boot()` 后首个宏任务）。

**效果**：编舞时长 `2883~3158ms → 871~970ms`；`whiteKeySlice 3819ms/70.9% → buildSheetSlices 441ms/9.6%`，主线程 `(idle)` 回到 **82.1%**；游玩帧 `p95 17.1ms / max 24.1ms / >50ms 帧 0`。

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/render/BoardRenderer.js` | modified | 新增 `var WRF = { willReadFrequently: true }`（IIFE 顶部）；`buildSheetSlices` 的 `1024²` 图集、`whiteKeySlice` 的两处临时层、`whiteKeySliceSq` 全部改用 `getContext('2d', WRF)`；注释按实测数据重写 |
| `src/main.js` | modified | 新增 `waitIconSlices()`（`sheetCount() >= 6`，2.5s 兜底）与 `warmAudioNow()`；`startPreloadResources` 改为「预加载 → `waitIconSlices()` → `tryPrepareLobby()`」；`tryFinishSplashTransition` 追加 `lobbyPrepared` 门槛；`boot()` 末尾 `setTimeout(warmAudioNow, 0)` 预热 `AudioContext`（替换原 `requestIdleCallback` 方案） |
| `src/audio/SoundManager.js` | modified | 新增 `warmup()` 导出（`return ensureCtx()`），供 `main.js` 在编舞前预热 |
| `tools/render-selftest.js` | updated | 新增 T122（回读画布 MUST 用 WRF 上下文，且 MUST NOT 出现 `atlas.getContext('2d')` 裸调用）、T123（`registerSheet` MUST 走图集批量键控）、T124（`waitIconSlices()` MUST 早于 `tryPrepareLobby()`）三条静态护栏；`265 → 268` 项 |
| `specs/.../spec.md` | updated | Δ25 增量：新增 **FR-044 §10**（WRF 上下文）、**FR-044 §11**（键控不得压在编舞窗口上）、**FR-050 §12**（音频上下文预热）、**SC-020**（开局性能 7 条量化验收）；顺带修正 FR-044 子条款重号（原有两个 §8） |
| `specs/.../plan.md` | updated | 里程碑表新增 **Δ25** 行（含全部实测数据） |
| `specs/.../tasks.md` | updated | 新增 Δ25 行（T122~T125） |
| `specs/.../quickstart.md` | updated | 新增 A16（掐表看落牌 1s）、A17（连续快速点牌）、A18（`deal-timeline` 门禁）三条人工验收 |

## 关键实现细节

### ① WRF 只加在「要回读的中间画布」上

WRF 画布是 CPU 后备的，**不参与 GPU 合成**。因此：

- ✅ 加：`1024²` 图集、`whiteKeySlice` 的键控临时层（离线 bbox 分支 + 运行期分支）、`whiteKeySliceSq` 单张兜底
- ❌ 不加：最终产出的 16 个 `256×256` 切片——它们逐帧参与 `drawImage` 合成，用 WRF 会掉帧

### ② 图集批量键控仍保留「先缩放后键控」

键控是逐像素独立运算，先缩放后键控与先键控后缩放**视觉等价**（双线性插值只在近白区域内部插值，不会跨越阈值边界产生新色）。这一点是 `icon-bbox-audit` 7/0 与 `cards-montage.png` 观感复核共同验证的。

### ③ 为什么不用「1×1 预热」而用 WRF

Δ25 首轮试过「先做一次 1×1 `getImageData` 点亮通路」，确实能把后续 1024² 从 279.6ms 压到 14.5ms；但那次 1×1 本身在应用里要 **994ms**（与 JPEG 解码抢 CPU），而且仍依赖默认上下文。WRF 从根上消掉了这一步——**冷启动首次就是 3.3ms**，无需预热。

### ④ `waitIconSlices` 必须有兜底

任一张 sheet 404 时 `sheetCount` 永远到不了 6，若无兜底会卡死开机。故以 `2.5s` 超时放行——此时键控降级为 `darken` 合成，游戏仍完整可玩（SC-006 双兜底口径不破）。

### ⑤ `tryFinishSplashTransition` 追加 `lobbyPrepared`

大厅/局内准备被推到切片之后，遮罩必须等它完成再淡出，否则会露出空白底。`lobbyPrepared` 在 `tryPrepareLobby()` 首行置位，无死锁风险。

## 代价与残留

- WRF 画布不参与 GPU 合成——但它只是**中间画布**（图集与键控临时层），绘制完即释放（`atlas.width = 0`），不影响逐帧渲染。
- 首张图集仍与 6 张 2048² JPEG 解码竞争，实测单张 45~130ms（隔离测量只要 5~13ms）。这部分是**解码带宽竞争**，不是回读惩罚；在真机多线程解码下会显著低于 headless。
- `new AudioContext()` 在 headless 下仍会吃掉 `120~1073ms`（无音频设备 → 后端探测慢），但已完全落在开机遮罩窗口内，与编舞无关。
- `probes/` 下的取证脚本与截图按项目约定不入库。

## 门禁结果

| 门禁 | 结果 |
|------|------|
| `node tools/render-selftest.js` | all green（268 项，含新增 T122~T124） |
| `node tools/render-selftest.js --engine-selftest` | all green |
| `node tools/icon-bbox-audit.js` | 7 / 0 |
| `node tools/audio-smoke.js` | 86 / 0 |
| `node tools/deal-smoke.js` | all green |
| `node tools/lobby-smoke.js` | 83 / 0 |
| `node tools/solver.js` | 72/72 solvable，`curveGate` 全过 |
| `node tools/normalize-audio.js --check` | exit 0 |
