# Bug Assessment: 开局发牌与游玩卡顿

- **Slug**: `deal-stutter-pixel-readback`
- **Assessed**: 2026-10-25
- **Reported by**: 用户实机反馈（Δ24 修复后）

## 现象（用户原话）

> 「卡牌大小修好了，但是现在开局卡牌落子和游玩的时候都感觉很卡，找到问题根因并修复这个问题。。」

两个可复现的症状：
1. **开局落牌卡顿** —— 15 种进场编舞（FR-052）本该 1 秒内播完，实际明显拖沓、掉帧；
2. **游玩卡顿** —— 局内点牌、连锁消除时有可感知的顿挫。

## 取证方法

全部用 CDP 直连真机（Chrome `--headless=new`，零 npm），脚本在 `probes/` 下：

| 脚本 | 作用 |
|------|------|
| `probes/deal-timeline.js` | 把「主线程长任务 / 每次 `getImageData` 起止 / `AudioContext` 构造 / 发牌编舞起止 / 遮罩淡出」放在同一条时间轴上，并分段统计帧间隔 |
| `probes/getimg-cost.js` | 隔离测量 `getImageData` 的成本构成（冷启动 / 预热后 / `willReadFrequently` 三组对照） |
| `probes/perf-probe.js` | 标准对照：发牌期与游玩期的帧间隔 p50/p95/max（正常 vs 静音） |
| `probes/cpu-prof.js` | `Profiler.start/stop` + `timeDeltas` 聚合，按 self time 排行热点函数 |

## 根因 1（主因）：`getImageData` 的 GPU→CPU 同步回读

默认 2D 上下文是 **GPU 后备**的，`getImageData` 必须先把整块像素从显存**同步**拷回内存；这条通路**首次使用**还有一次性初始化。

`probes/getimg-cost.js` 隔离测量（同一会话内，1024×1024）：

| 组 | 上下文 | get | loop | put | 合计 |
|----|--------|-----|------|-----|------|
| A | 默认 · 冷启动首次 | 260.5ms | 16.0ms | 3.1ms | **279.6ms** |
| B | 默认 · 先做一次 1×1 回读后 | 7.7ms | 5.8ms | 1.0ms | 14.5ms |
| C | 默认 · 同会话第二次 | 14.7ms | 4.5ms | 2.0ms | 21.2ms |
| **D** | **`willReadFrequently` · 冷启动首次** | **3.3ms** | 4.6ms | 2.0ms | **9.9ms** |
| **E** | **`willReadFrequently` · 连做 6 张** | — | — | — | **78.6ms** |

结论：**大头不是像素量，而是回读通路的懒初始化**——冷启动首次比预热后慢 **19 倍**，而 `willReadFrequently`（CPU 后备画布）连初始化都不存在。

在应用里这条惩罚被进一步放大，因为键控正好与 6 张 2048² JPEG 解码抢 CPU。`deal-timeline.js` 实测（修复前）：

```
   521ms  deal:start
  1647ms  getImageData 1024x1024   ← 首张
  1647ms  getImageData-DONE  1046ms   ← 吃满一次性初始化
  2621ms  getImageData-DONE   371ms
  3019ms  getImageData-DONE   318ms
  3262ms  getImageData-DONE   214ms
  3415ms  getImageData-DONE    87ms
  3563ms  getImageData-DONE   113ms
  3679ms  deal:end  3158ms   ← 设计值 1000ms，被拉长 3.16 倍
```

`cpu-prof.js` 同一窗口的 self time 排行：

```
   3819ms  70.9%  whiteKeySlice  @render/BoardRenderer.js
    387ms   7.2%  ensureCtx     @audio/SoundManager.js
```

即 **96 格逐格 `getImageData` + `putImageData` = 96 次同步回读**，主线程被单一函数独占 71%。

## 根因 2：`ensureCtx()` 惰性创建落在第一声落牌上

`new AudioContext()` 隔离测量冷启动 **180.5ms**（第二次 45.2ms、第三次 15.5ms）；与 JPEG 解码竞争时实测放大到 **120~1073ms**。旧实现由 `ensureCtx()` 惰性创建，首次调用点正是**第一声落牌**的 `playDealTick`，直接把编舞顶出约 300ms。

> Δ25 首轮曾用 `requestIdleCallback(warmAudio, { timeout: 1500 })` 预热，但实测触发点会漂到 **1.5~2.1s**——正好撞在编舞上（把落牌又顶出 1073ms）。该方案已废弃。

## 根因 3：编舞与键控在时间轴上重叠

`enterGame → loadLevel → startDealChoreography` 在 **~520ms** 就跑起来了（`preloadDone` 一到就进），而 6 张 sheet 的键控要到 **~1.7s** 才陆续到达（`new Image()` 的 2048² JPEG 解码耗时）。两者天然重叠。

## 已排除的嫌疑

| 嫌疑 | 排除依据 |
|------|----------|
| 音频编码退化 | 归一化前后 `sample_rate` / `bit_rate` 一致或更低 |
| 逐帧绘制太重 | CPU profile 里 `drawTileBody` 17ms、`drawStage` 17ms、`drawBestiaryIcon` 2ms——合计不到 40ms，不是瓶颈 |
| `IconAssets` 每关重建 | 是模块级会话缓存，`sheetLoadStarted` 一次性守卫 |
| 静音对照差异 = 音频问题 | 实为**缓存冷热差异**：同一浏览器进程内第二次导航命中缓存，键控在采样起点前就完成（`getImg: 0`）。故「静音」组数据不可直接当作音频对照 |

## 修复方向

1. 所有**要回读像素**的画布改用 `{ willReadFrequently: true }`（图集 / 键控临时层 / 单张兜底切片）；成品 256 切片**保持默认上下文**（WRF 画布不参与 GPU 合成）。
2. `registerSheet` 由「16 格逐个 `whiteKeySlice`」改为「16 格先拼 `1024²` 图集 → **一次**键控 → 拆回 16 切片」，回读次数 `96 → 6`。
3. 把 `tryPrepareLobby()` 推到图标切片就绪之后，编舞不再与键控重叠。
4. `sound.warmup()` 在 `boot()` 之后的首个宏任务预热 `AudioContext`（确定性时机，弃用 `requestIdleCallback`）。

详见 `./fix.md`。
