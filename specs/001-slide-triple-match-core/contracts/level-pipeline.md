# Contract: Level Pipeline（离线关卡流水线）

**Feature**: `001-slide-triple-match-core` | **文件**: `tools/level-config.js`, `tools/generator.js`, `tools/solver.js` | **运行环境**: Node ≥ 18（CommonJS，零 npm 依赖——宪章 II：Node 仅限此二工具 + 配置）

**流水线**: `level-config.js`（参数）→ `generator.js`（逆向构造）→ `solver.js`（验证门禁）→ 导出 `src/data/levels.js` + `tools/solver-report.json`。**规则口径**：Solver 直接 `require('../src/core/RulesEngine.js')`（D-02 双导出）——与前端游玩 100% 同源（FR-032）。

## 1. level-config.js（章节参数表，Δ5 可扩展；Δ11 大棋盘波浪架构 + Δ13 60 关/3×20 大阶段）

导出 `CHAPTERS: ChapterConfig[]` —— **追加条目即新增章节**（默认 3 章；扩容 = 数组加对象，generator/solver/前端零代码改动，Δ4+Δ5）：

```js
{
  id: 1,                          // 章号（展示与统计; Δ13 阶段章 = 前期[1,20]/中期[21,40]/后期[41,60]）
  levels: [1, 20],                // 关号区间（含端点; 与前章无空洞无重叠——加载时校验）
  grid: [5, 6],                   // 兼容字段; 实际网格由 waveGrid() 铁律决定（见下）
  suits: [3, 5],                  // 花色数区间（波浪调制: 8×8 挑战 +1 / 7×7 简单 -1）
  tiles: [27, 63],                // 兼容字段; 实际由 waveTiles() 按棋盘+阶段算（恒 %3==0）
  zMax: [2, 3],                   // 堆叠层数区间（waveZMax: 前期 2~3 / 中期 3~4 / 后期 4~5）
  mechanisms: {                    // 引入档位（FR-008; Δ13 +1 平移）: gear L7+ / ice L12+ / chain L22+ / prism L32+
    gear: true, ice: true, chain: false, prism: false
  },
  mechDensity: { ... },           // 各机制滑块/格占比区间（引入后逐关爬升）
  damageOnBlock: false,           // 受阻扣命（中期章 true，FR-003）
  lives: 3, items: {undo:1, wrench:1},
  iceMode: 'triple',              // 'triple' | 'adjacent'（FR-016 变体档）
  rhythm: null,                   // 后期章专用节奏模板（见下）
  budget: { nodes: 2_000_000, ms: 60_000 }  // Solver 单关预算（可按章覆盖）
}
```

**Δ13 网格排布铁律（`waveGrid(levelId)`）**: L1 = 5×5（27/30 块）；L2 = 6×6（42/45 块）；L3 = 7×7 新手循环 1 困难关（57 块，无机关）；L4~60 = 3 关一循环「2 简 1 难」——挑战位 `(levelId-4) % 3 === 2` → 8×8 困难挑战关，否则 7×7 简单关（L6/L9/…/L51/L54/L57/L60 共 19 个 8×8 + 38 个 7×7）。**tiles/zMax 由 `waveTiles`/`waveZMax` 按阶段双轨计算**: 前期 L4~16（7×7 54~63 / 8×8 69~78 / z 2~3）、中期 L17~36（63~75 / 78~90 / z 3~4）、后期 L37~60（72~84 / 87~105 / z 4~5）；挑战关取区间高位、简单关低位（波浪锯齿的参数分离）。

**Δ13 增量扩容拼接（tools/expand-60.js，2026-10-19）**: 50→60 扩容采用增量迁移而非全量重生成——① 新 L1/L2 = 原 L1/L2 原样复用；② 新 L3 单独新生成（7×7 新手循环 1 困难关）；③ 原 L3~L50（48 关）平移为新 L4~L51，**仅改 id(+1)/chapter(3×20 重排)/name（tiles/prisms/cfg/solutionMoves 100% 原封不动）**；④ 新 L52~L60 尾部新生成（循环 18~20: 7×7/7×7/8×8）。新增 10 关均经 Generator 三重验证（逆向构造 → 正向自检 → Solver 门禁）+ 内嵌 solutionMoves；difficultyScore 以 60 关全域归一重算（平移关除 dScore 外 metrics 原样）。验证：60/60 solvable exit 0 + 曲线门全绿 + 平移关 JSON 深比较逐位一致。

**后期章节奏模板**（`rhythm`，FR-012）: 挑战节奏仅在 8×8 挑战位叠加（个位 4/9 且 wavePos=2）；个位 5/0 且 7×7 位 → 解压爽关（对称图案 `theme` 模板库：`ring/butterfly/diamond/heart` 之一 + tiles 取阶段下界）；其余位常规插值。

**难度评分权重**（difficultyScore，FR-011/SC-004）：

```text
score = round( 1.0·norm(minMoves) + 0.8·(1 - norm(solutionCount)) + 1.2·norm(dockPeak)
             + 1.5·mechCount + 0.5·norm(tiles) + 0.7·norm(suits) ) × 10
```

（norm = 相对 60 关全域 min-max 归一（Δ13 扩容后）；权重集中定义于此，报告与前端展示共用。）

## 2. generator.js（逆向生成器）

**CLI**: `node tools/generator.js [--chapters 1,2,3,4,5] [--seed S] [--out src/data/levels.js] [--dry-run]`

**算法**（D-10 逆向三重验证）：

1. **逆向构造**（从清空棋盘反向推入三消组）：按章/关参数确定轮数 = tiles/3；每轮选一花色（保证计数 %3==0 且最优路径开放花色 ≤5 的启发式花色分配）、生成 3 滑块并逐个「反向飞行」落位（反向射线 = 沿 d 反向从边缘/出口外推进到落位格；落位被占则换出口或换 d 重试，受限次后该滑块重掷）。落位逆序 = solutionMoves 逆序（后推入者先飞出）。
   - **机制逆操作镜像**：齿轮滑块落位时约束「十字相邻更晚推入者存在 ⇒ 记录其方向须在那些滑块飞出后经若干 +90° 对准出口」；锁链滑块仅当其配对钥匙已更晚推入（= 更早飞出）才允许落位（钥匙可达性结构性保证，FR-019）；冰封滑块任意落位、冰厚独立于飞行（冰封滑块照常反向飞行落位——它飞出发生在破冰后的正向时序，逆序上无约束）；棱镜格先行布置，滑块反向飞行路径可含 1 段折射（对应正向 1 次折射出口）。
   - **对射布局拒绝**（FR-022）：棱镜布置后预检——任意两条「滑块→棱镜→棱镜」可达路径即重掷棱镜布局。
2. **正向自检**：`RulesEngine.init` + 逐 `applyTap` 回放构造解，断言 `terminal == 'won'` 且全程 `dockPeak ≤7`、开放花色 ≤5、无中途空棋盘残槽（FR-029）。失败 → 该关回炉。
3. **Solver 门禁**：调用 solver 验证与指标产出（见 §3）。失败 → 参数扰动重生成（子种子 re-roll：位置/花色分配/机制布置）；同关连续 5 次失败 → 降档（tiles/suits 降 1 档至章区间下界）重试，并在报告中标记 `degraded: true`。

**导出**: 按契约 [level-data.md](level-data.md) 写 `src/data/levels.js`（含 metrics 与 solutionMoves——**solutionMoves 来自 Solver 的最优解**，非构造解；构造解仅作门禁自检）。种子化 PRNG（D-08）保证 `--seed S` 逐位复现。

**显式保证**（写入文件头注释）: 初始滑块数 ≥6 且 %3==0；钥匙解锁前可达；单滑块单机制；无对射棱镜。

## 3. solver.js（回溯求解器 + 验证门禁）

**CLI**:

```text
node tools/solver.js                    # 全量验证 LEVELS（60 关，Δ13 扩容后）+ 指标 + 曲线门 → solver-report.json
node tools/solver.js --level 7          # 单关验证（调试用，仍写报告单条目）
node tools/solver.js --engine-selftest  # RulesEngine 规则不变量断言（exit 1 失败）
```

**搜索**（D-07; Δ11 启发式加速）: 迭代加深 DFS（初始深度 = 启发下界，如「tiles/3 + 冰封组数」）+ 状态哈希去重（**dock 顺序规范化**——哈希键用花色计数向量；Δ9: staging 已移除）+ 节点预算（章级 budget，默认 2M/60s）。Δ11 大棋盘（7×7/8×8，50~105 块）动作展开按启发式优先级排序: ① Dock 已有花色计数 2 的 tap（立即三消腾槽）→ ② 钥匙滑块（解锁扩大动作集）→ ③ 高层 z≥2 滑块（塔顶通常无阻挡）→ ④ Dock 计数 1（凑对）→ ⑤ 其余 id 序（D-08 确定性兜底）。注意结构性事实: 无道具必胜路径步数 `minMoves` 恒等于 `tiles.length`（每次成功 tap 恰移除 1 滑块）。

**动作集**（与前端 Hint/Bot 一致，[game-session.md](game-session.md) §7）: `enumerateTaps` ∪ 道具动作（wrench 转向任意可转滑块；Δ9: stage/tapStaged 已移除）——**仅当最优解需要道具时才计入 metrics.minMoves**（正常关卡 Solver 会证明无道具解更短）。

**输出指标**（FR-030，双写 levels.js 与报告）: `minMoves`（首解即最优; 结构性 = tiles.length）、`solutionCount`（预算内不重复终局路径数，封顶 10k 记 `">=10000"`）、`dockPeak`（搜索全程 Dock 占用最大值）、`mechCount`、`openSuitsMax`（**最优解路径上**最大开放花色数——首解回放统计，Δ11 口径修正）、`difficultyScore`（权重 §1）。

**质量门禁**（exit code 非零即失败，FR-031/SC-001/SC-004）:

| 门 | 判据 |
|---|---|
| 可解性 | 60/60（实际 = `LEVELS.length`/`LEVELS.length`）关 `solvable == true` |
| 数据契约 | 每关 `RulesEngine.validateLevel().ok == true`（Δ11: tiles ≤150、z ∈ [0,4]、堆叠深度 ≤5） |
| 结构约束 | 每花色计数 %3==0；`openSuitsMax ≤ 5`（**最优解路径上**口径——首解回放统计）；无对射棱镜 |
| 曲线门-1 | 各章（Δ13 3×20 大阶段章）`difficultyScore` 均值随章号单调不减 |
| 曲线门-2 | 全章 `minMoves` 线性回归斜率 ≥ 0（章内允许局部波动） |
| 曲线门-3 | Δ13 波浪锯齿: L4+ 中 8×8 挑战位（(id-4)%3==2）均值显著 > 全程均值 ×1.05、7×7 简单位 < ×0.95 |
| 报告一致 | 报告 metrics 与 levels.js 内嵌 metrics 逐字段一致 |

**solver-report.json schema**（数据模型详见 [data-model.md](../data-model.md) §9）: `{schemaVersion, generatedAt, seed, nodeBudget, levels:[{id, solvable, minMoves, solutionCount, dockPeak, mechCount, openSuitsMax, elapsedMs, degraded?}], summary:{total, solvable, failedIds, curveGate:{chMonotonic, slope14, ch5Zigzag}}}`。

**变更协议**（FR-031）: `levels.js` / `level-config.js` / `RulesEngine.js` 任何变更 → 必跑全量 `node tools/solver.js` 并重新生成报告方可合入（提交信息附摘要；宪章「关卡数据流水线」节）。

## 4. 前端零耦合保证

`tools/*` 三文件前端永不引用（无 `<script src="tools/...">`）；`level-config.js` 前端永不加载（章节数据已烘焙进 levels.js 的 `chapter`/`cfg` 字段）；反向地，前端唯一被 Node require 的文件是 `RulesEngine.js` 与 `levels.js`（双导出，D-02）。交付物运行时不含 package.json / node_modules（工具即装即用，零安装步骤——SC-003）。

## 5. 实测校准项（非未决，M3 期间以报告数据收敛）

- Hint/Bot 有界搜索预算（100k 节点 / 300 ms）与大关实际状态空间的对齐；
- 生成器重试与降档参数（5 次回炉 / 降档步长）按回炉率 <10% 目标调；
- `solutionCount` 封顶值（10k）与报告体积的权衡。
