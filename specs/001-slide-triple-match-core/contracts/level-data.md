# Contract: Level Data（`src/data/levels.js` 数据契约）

> ⚠️ **STALE**: spec.md was refined on 2026-10-20 (Δ14: US5——FR-033 §3/§4 明确图鉴映射不改写 levels.js 的 suit 字段与花色数 K，Δ13 保留铁律延续；预期无 schema 变更，propagate 时复核)；Δ15: FR-029 §6 存量 60 关花色重打散迁移将改写 levels.js 同花色落位与 solutionMoves（结构字段不变、Solver 全量重验证后交付）——Δ13 逐字节保留预期就此受控让位。Run `/speckit.refine.propagate` to update this document.

**Feature**: `001-slide-triple-match-core` | **文件**: `src/data/levels.js` | **生产者**: `tools/generator.js`（M3）/ 手工（M1~M2 测试关） | **消费者**: 前端运行时（classic script）、`tools/solver.js`（CommonJS require）

**格式选型**: JS 文件（非独立 JSON——file:// 下 fetch 被 CORS 拦截，D-01/D-15）；UMD 双导出：

```js
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (global.STM = global.STM || {}).LEVELS = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return [ /* Level, Level, ... */ ];
});
```

## 1. 顶层导出

`STM.LEVELS`: `Level[]`，按 `id` 升序（`LEVELS[i].id === i+1`）。**`LEVELS.length` 是关卡总数唯一真源**（Δ4：前端跳关下拉、进度钳制、自动进关、终局判定均动态读取；交付 60 关（Δ13 增量扩容），配置扩容至 100+ 零前端改动）。

## 2. Level schema

```js
{
  id: 7,                      // int ≥1 连续
  chapter: 1,                 // int 1~3（展示/统计; Δ13 3×20 大阶段: ch1 L1-20/ch2 L21-40/ch3 L41-60）
  name: "Level 7 · 齿轮初鸣",  // string 展示名
  n: 5,                       // int 4..8 网格边长
  tiles: [                    // TileSpec[]（见 data-model.md §2.1；M1.5 Δ7 支持 z 堆叠）
    { r:0, c:1, s:2, d:0 },               // 普通滑块: 花色2 方向U（z 省略 = 0）
    { r:0, c:3, s:2, d:0, m:'g' },        // 齿轮滑块
    { r:2, c:0, s:0, d:3, m:'i', x:2 },   // 冰封 厚度2
    { r:2, c:2, s:1, d:2, m:'c' },        // 锁链滑块（配对见 cfg.chains）
    { r:2, c:2, s:1, d:2, z:1 },          // Δ7: 同格上层滑块（堆叠顶层，z 0..2）
    { r:3, c:4, s:1, d:1, m:'k' }         // 钥匙滑块
  ],
  prisms: [                   // PrismSpec[] 可空
    { r:1, c:2, t:'/' }
  ],
  cfg: {                      // LevelConfig（默认值可省略——消费方补默认）
    lives: 3,
    damageOnBlock: false,
    items: { undo:1, wrench:1 },
    iceMode: 'triple',
    chains: [ [4, [3]] ],     // [keyTileId, [lockedTileId,...]] 边表
    scoring: { comboBase:10, comboStep:5 }
  },
  metrics: {                  // LevelMetrics（Solver 产出，前端只读）
    minMoves: 6,
    solutionCount: 3,
    dockPeak: 4,
    mechCount: 1,
    difficultyScore: 38,
    openSuitsMax: 3
  },
  solutionMoves: [            // MoveSpec[] 最优解（预计算，Δ6）
    { k:0, t:4 }, { k:0, t:1 }, { k:0, t:0 }
  ],
  theme: "ring"               // string? 可选视觉主题
}
```

字段语义、校验不变量（滑块数 %3==0 且 ≥6、机制互斥、棱镜不叠滑块、无对射循环、solutionMoves 回放必胜、开放花色 ≤5 等）见 [data-model.md](../data-model.md) §1~§6、§10；运行时由 `STM.RulesEngine.validateLevel(level)` 强校验（加载失败 → 控制台错误 + 跳过该关，不静默）。

## 3. 枚举字面量表（单点定义）

| 枚举 | 值域 | 语义 |
|---|---|---|
| 方向 `d` | 0/1/2/3 | U/R/D/L（顺时针序，`(d+1)%4` = 顺时针 90°） |
| 花色 `s` | 0..7 | BoardRenderer 花色表索引（[game-session.md](game-session.md) §4；8 种颜色+图形双编码） |
| 堆叠层 `z`（M1.5 Δ7 / M1.7 Δ8 / Δ11 扩容 5 层） | 0..4/省略 | 同格垂直堆叠层号（0 最底、数字大者为顶层；同格深度 ≤5；层号连续无悬空层；省略 = z0）。仅栈顶可交互；射线阻挡层高感知——前方格栈顶 `z_target >= z_self` 才阻挡（高层凌空飞越低层），棱镜全层高阻挡 |
| 机制标记 `m` | `'g'` \| `'i'` \| `'c'` \| `'k'` \| undefined | 齿轮/冰封/锁链/钥匙/无（互斥） |
| 棱镜型 `t` | `'/'` \| `'\\'` | 斜面反射方向 |
| 破冰口径 `cfg.iceMode` | `'triple'` \| `'adjacent'` | 三消全场 -1 / 十字相邻飞出 -1 |
| 动作类型 `solutionMoves[].k` | 0/2 | tap 棋盘滑块 / 使用道具（`t` 字段此时为 `tileId`——扳手目标；Δ9: k=1 暂存区回填已移除，正常解不出现 k=2） |

## 4. 规模预算

- 文件总大小 ≤ 330 KB（Δ13 扩容 60 关实测 ≈315 KB——48 平移关 + 10 新增大棋盘关; 静态本地 `<script defer>` 加载 <50 ms，SC-003 不受影响。Δ11 时预算 300 KB/50 关 ≈262 KB，Δ13 按 +10 关后期大关折算放宽至 330 KB）。
- 每关 tiles ≤ 150、prisms ≤ 6、solutionMoves 长度 = `metrics.minMoves` ≤ 150（Δ11 大棋盘: 8×8×5 层 105 块上限 + 验证余量）。

## 5. 变更与门禁（FR-031）

- 本文件任何内容变更 MUST 由 `node tools/generator.js` 重新导出（**禁止手改生成物**——M1/M2 手工测试关例外，M3 起被流水线整体替换）、经 `node tools/expand-60.js` 增量迁移（Δ13：旧关 100% 保留 + 新关经同一 Generator 三重验证）或经 `node tools/solver.js` 全量重验证通过。
- 交付仓库内含与 `levels.js` 同批次生成的 `tools/solver-report.json`（双 metrics 交叉一致是验收检查项）。
