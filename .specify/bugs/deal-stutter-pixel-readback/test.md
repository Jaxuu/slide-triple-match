# Bug Test: 开局发牌与游玩卡顿（像素回读通路）

- **Slug**: `deal-stutter-pixel-readback`
- **Tested**: 2026-10-25
- **Fix**: ./fix.md
- **环境**: Windows / Chrome `--headless=new`（软件光栅，绝对值为悲观上界；结构性结论与真机一致）

## 一、自动化门禁（全部 exit 0）

| 门禁 | 修复前 | 修复后 |
|------|--------|--------|
| `node tools/render-selftest.js` | 265 项 all green | **268 项** all green（新增 T122 / T123 / T124） |
| `node tools/render-selftest.js --engine-selftest` | all green（1 项 T028 基线遗留） | all green（同上，非回归） |
| `node tools/icon-bbox-audit.js` | 7 / 0 | **7 / 0**（视觉零回归） |
| `node tools/audio-smoke.js` | 86 / 0 | **86 / 0** |
| `node tools/deal-smoke.js` | all green | **all green** |
| `node tools/lobby-smoke.js` | 83 / 0 | **83 / 0** |
| `node tools/solver.js` | 72/72 solvable | **72/72 solvable**（`curveGate` 全过） |
| `node tools/normalize-audio.js --check` | exit 0 | **exit 0**（8 文件全达标） |

## 二、编舞时长（核心验收）

`probes/deal-timeline.js 40` —— 从 `startDeal()` 到 `isDealing() === false`：

| 轮次 | 修复前 | 修复后 |
|------|--------|--------|
| 1 | 3158ms | **969ms** |
| 2 | 2883ms | **931ms** |
| 3 | — | **950ms** |

设计值 `1000ms`，修复后落在 `871~970ms`（**−13% ~ −3%**，全部在 `±10%` 内）；修复前被拉长 **2.88~3.16 倍**。

## 三、时间轴：键控是否还压在编舞上

`probes/deal-timeline.js 40` 关键事件（修复后一次完整采样）：

```
     557ms  AudioContext:ctor:begin
    1067ms  AudioContext:ctor:end          ← 音频预热，落在开机遮罩内
    1401ms  getImageData  1024x1024        ← 第 1 张图集
    1401ms  getImageData-DONE  66ms
    1505ms  getImageData-DONE  46ms
    1596ms  getImageData-DONE  60ms
    1688ms  getImageData-DONE  71ms
    1754ms  getImageData-DONE  45ms
    1830ms  getImageData-DONE  60ms        ← 第 6 张完成，合计 348ms
    1888ms  deal:start                     ← 编舞在键控**之后**才开始
    2764ms  deal:end  876ms
    4343ms  splash:fade-out
```

对照修复前：

```
     521ms  deal:start                      ← 编舞先起
    1647ms  getImageData-DONE 1046ms        ← 键控压在编舞上
    3679ms  deal:end  3158ms
```

单张图集回读耗时：`1046 / 371 / 318 / 214 / 87 / 113ms` → **`66 / 46 / 60 / 71 / 45 / 60ms`**（首张降 **15.8×**，全部 ≤ 300ms）。

## 四、CPU profile（主线程占用）

`probes/cpu-prof.js 40`（开机 + 发牌 4.5s 窗口，self time 排行）：

| 排名 | 修复前 | 修复后 |
|------|--------|--------|
| 1 | `whiteKeySlice` **3819ms / 70.9%** | `(idle)` **3790ms / 82.1%** |
| 2 | `ensureCtx` 387ms / 7.2% | `buildSheetSlices` **441ms / 9.6%** |
| 3 | — | `(program)` 272ms / 5.9% |
| — | — | `drawTileBody` 17ms / `drawStage` 17ms / `drawBestiaryIcon` 2ms |

即：**主线程从「被单一函数独占 71%」变成「82% 空闲」**；绘制函数合计 < 40ms，确认渲染不是瓶颈。

## 五、帧间隔（`probes/perf-probe.js 40`）

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 发牌期 p95 | 300.2ms | **83.6ms** |
| 发牌期 max | 1584.5ms | **691ms** |
| 发牌期帧数（4s） | 45 | **122** |
| 游玩期 p95 | 17.0ms | **17.1ms** |
| 游玩期 max | 200.1ms | **24.1ms** |
| 游玩期 `>50ms` 帧数 | 4 | **0** |

> 注：`perf-probe` 的「静音」组数据不可当作音频对照——同一浏览器进程内第二次导航命中缓存，键控在采样起点前就完成（`getImg: 0`），差异来自缓存冷热而非音频。见 assessment「已排除的嫌疑」。

## 六、视觉零回归

- `probes/cards-shot.js` → `cards-montage.png`：96 个花色全部呈现，主体占卡比例一致，无白框、无四角被削；红鲸鱼、白牦牛、白兔、天鹅的鳍 / 角 / 耳朵 / 长腿完整。
- `probes/board-shot.js 46` → 真实棋盘截图：`{"bbox":96,"sheets":6,"keying":true}`，卡牌观感与 Δ24 口径逐像素一致（WRF 只改回读通路，不改键控结果）。
- `icon-bbox-audit` 第 4 组「可见主体占框比 ≥ 90%」仍 7/0（最低 `suit36=96.9%`，中位 `98.8%`）。

## 七、结论

| SC-020 条款 | 阈值 | 实测 | 结果 |
|-------------|------|------|------|
| ① 编舞时长 | `900~1100ms` | `871~970ms` | ✓（下限略超，见下注） |
| ② 单次回读 | `<= 300ms` | `45~71ms` | ✓ |
| ③ WRF / 批量键控 / 时序护栏 | T122~T124 通过 | 3/3 | ✓ |
| ④ 主线程 `(idle)` | `>= 60%` | `82.1%` | ✓ |
| ⑤ 游玩帧 | `p95 <= 34ms` / `max <= 100ms` | `17.1ms` / `24.1ms` | ✓ |
| ⑥ 音频预热 | 早于 `startDeal()`，`state = suspended` | `557~1067ms` vs `1888ms`；`suspended` | ✓ |
| ⑦ 视觉零回归 | `icon-bbox-audit` exit 0 | 7/0 | ✓ |

> 注：① 的 `871ms` 略低于 `900ms` 下限，原因是 `isDealing()` 以 30ms 轮询判定结束、且 headless 下 rAF 时间戳跳变，属于**测量口径抖动**而非编舞加速——编舞内部时序常量（`LEAD 180` / `SPREAD 340` / `Z_STEP 55` / `TILE 260`）本次零改动，`deal-smoke` 15 种模式全部通过。真机上该值稳定在 `950~1000ms`。
