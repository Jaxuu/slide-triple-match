# Contract: RulesEngine（前后端共用纯函数规则引擎）

**Feature**: `001-slide-triple-match-core` | **文件**: `src/core/RulesEngine.js` | **加载方**: 浏览器（classic script → `STM.RulesEngine`）+ Node（`require`，UMD 双导出，D-02）

**定位**: 本项目唯一规则语义源（FR-032）。前端游玩、Hint 有界搜索、Auto-Play Bot、离线 Solver 全部调用本模块同一实现。**纯函数、无 DOM / 无音频 / 无存储依赖**——Node 可 require 是硬约束。

**坐标与方向约定**（D-12）: 格 `(r,c)`，row 0 = 顶部；方向数字 `0=U, 1=R, 2=D, 3=L`（顺时针序）；「顺时针转 90°」≡ `(d+1) % 4`。棱镜反射全枚举映射：

| 棱镜型 | U | R | D | L |
|---|---|---|---|---|
| `/` | R | U | L | D |
| `\` | L | D | R | U |

**多层堆叠（M1.5 Δ7 → M1.7 Δ8 分层立体阻挡; Δ11 扩容至 5 层）**: `TileSpec` 可选字段 `z: 0|1|2|3|4`（0 最底层；同格堆叠深度 ≤5；层号连续无悬空层；省略 z 等价 z=0；validateLevel 校验 tiles ≤150）。运行态 `board[r][c]` = 该格滑块栈数组（底→顶，按 z 升序）：

1. **栈顶可交互**: 仅当前格栈顶（栈数组末位）滑块可 tap / 受齿轮作用 / 触发飞出；下层滑块 `canTap == false`（被压住）。
2. **reveal 暴露**: 顶层滑块成功飞出后，其正下方次顶层滑块立即暴露为新顶层（`applyTap` 发 `{e:'reveal', id, r, c, z}` 事件，渲染侧驱动上浮动画）。
3. **射线阻挡（Δ8 分层立体阻挡——关键）**: 射线阻挡按层高 `z` 分层计算，**高层滑块从低层滑块头顶凌空飞越**。设飞行滑块层高 `z_self`、前方格 `(nr,nc)` 当前栈顶滑块层高 `z_target`：
   - `z_target < z_self`（含该格为空、或只剩底层）→ **不阻挡**——凌空飞越（`castRay`/`buildPath` 照常把该格记入路径，渲染保持高层 + 投影）；
   - `z_target >= z_self`（同层/高层滑块）→ 有效阻挡；
   - 棱镜 = **全层高柱体**——任意层高射线均视为阻挡（并触发折射）。
   底层滑块对高层射线而言不再是障碍——「埋藏资产」不等于「静态障碍」。
4. **齿轮/破冰层高对齐**: 滑块 `t`（层高 `z_self`）成功飞出时，触发十字相邻格 `(nr,nc)` **当前栈顶**滑块的齿轮旋转 / 邻接破冰（机制作用对象恒为该格栈顶——与 Δ7 可交互口径一致）。
5. **snapshot/restore**: 快照含 `z`；`rebuildBoard` 按同格 z 升序重建栈数组（restore 后栈序不变）。

## 1. 模块导出（`STM.RulesEngine.*` / `module.exports`）

| API | 签名 | 说明 |
|---|---|---|
| `init(level, opts?)` | `(Level) → EngineState` | 由静态 Level 构造可演化运行态（含 board/dock/机制动态量；Δ9: staging 已移除）。**所有演化函数的第一个参数是 EngineState，全部返回新对象或原地演化并返回自身**——语义为「确定性状态机」，前端 GameState 与 Solver 各自持有独立实例。opts 仅 Node 侧注入（如 PRNG 种子），浏览器调用不传。 |
| `canTap(state, tileId)` | `(EngineState, int) → bool` | 点击可行性谓词（§2） |
| `applyTap(state, tileId)` | `(EngineState, int) → TapResult` | **核心**: 原子回合结算（§3 管线），返回结果对象（§5） |
| `applyItem(state, item, target?)` | `(EngineState, 'undo' 无法定义于此*, 'wrench', tileId?) → TapResult` | 道具语义（§6）；undo 由 GameState 快照栈承载（规则引擎无历史）；Δ9: 'stage' 已移除（恒 invalid） |
| `terminal(state)` | `(EngineState) → 'playing'\|'won'\|'lost_burst'\|'lost_lives'\|'lost_deadlock'` | 终局判定（§7）。**死锁的复证搜索不在此 API 内**——`deadlockSuspect(state)` 只给谓词，复证由调用方（前端 Hint/Bot 搜索器、离线 Solver）执行（D-09） |
| `deadlockSuspect(state)` | `(EngineState) → bool` | 疑死锁保守谓词（§7.4） |
| `enumerateTaps(state)` | `(EngineState) → int[]` | 可行 tap 目标 id 列表（Solver/Hint 动作枚举） |
| `validateLevel(level)` | `(Level) → {ok, errors: string[]}` | 数据契约校验（不变量表见 [data-model.md](../data-model.md) §10） |
| `renderProbe(state)` | `(EngineState) → 轻量视图`（仅浏览器构建含） | 为 Renderer 提供渲染快照（§8） |

## 2. `canTap` 可行性谓词

滑块可被点击飞出，当且仅当：

1. 滑块在棋盘上（Δ9: 暂存区已移除——不再有 staging 滑块）；且
2. `机制状态 ∉ {冰封(ice>0), 锁链(locked)}`（FR-015/FR-018）；且
3. **Δ7**: 滑块位于其所在格的**栈顶**（下层滑块被顶层压住，不可交互）。

注意：**射线是否畅通不属于 canTap**——受阻滑块仍可点击（点击后弹回，FR-002）。受阻是否扣命在 applyTap 结算（cfg.damageOnBlock）。

## 3. `applyTap` 原子回合管线（单一事实源）

对棋盘滑块 `t` 点击的结算步骤（顺序固定，Edge Case「同一点击内连环触发」的确定性解）：

```text
Step 0  前置: canTap(t) == false → 无操作返回 {type:'invalid'}
Step 1  射线行走: 从 (r,c) 沿 dir 逐格 → 首个被占格 = 阻挡点
        1a. 阻挡格是滑块/冰封/锁链滑块 → Blocked 分支（§3.1）
        1b. 阻挡格是棱镜 → 折射判定（§3.2）
        1c. 无阻挡直达边缘 → Fly-out（§3.3）
Step 2  [Blocked] 滑块前冲动画数据 + 返回 {type:'blocked', damage: cfg.damageOnBlock?1:0}
        （生命扣减由 GameState 记账；引擎返回伤害量）
Step 3  [Prism] 新方向 = 反射表[prism.t][dir]；从棱镜格沿新方向续走：
        3a. 新射线畅通 → 沿新方向飞出（折射标志 → 渲染折线动画）
        3b. 新射线受阻挡 → Blocked 分支（弹回原位，不二段折射，FR-022）
        （折射后射线遇第二个棱镜 = 受阻挡处理——单次折射上限）
Step 4  [Fly-out] 滑块从棋盘移除 → 派生事件收集阶段（顺序执行）：
        4a. 齿轮联动: 对每个齿轮滑块 g，若被移除滑块 t 与 g 十字相邻
            (|Δr|+|Δc| == 1) → g.d = (g.d+1)%4（Δ1/FR-013）
        4b. 钥匙解锁: 若 t 是钥匙 → 对 cfg.chains 中每个含 t 的配对，
            将配对剩余钥匙集合移除 t；某锁的所有配对钥全飞出 → 该锁 unlocked=false→true 解锁（FR-019 或语义）
        4c. 入槽: t 按「同花色归拢」插入 dock（§3.4）
        4d. 三消循环: 若 dock 内任一花色计数 == 3 → 结算：
            - 移除该 3 滑块（可多组同时结算，循环至无）
            - 连击/分数事件（数据由 GameState 记账，引擎发 'match' 事件）
            - 破冰联动（按 cfg.iceMode）:
              'triple'   → 场上所有 ice>0 滑块 ice--，归 0 清除冰封标记（FR-016 主口径）
              'adjacent' → 仅与被消除…不适用——十字相邻口径是「相邻有滑块飞出时」：对场上每个冰封滑块，
                           若本次飞出滑块 t 与其十字相邻 → ice--（变体口径）
            - 三消可级联再触发 4a/4b 吗？——不会（三消不产生新飞出），但破冰/解锁改变后续
              可行性；级联在**同一 applyTap 返回前**全部结算完毕
Step 5  返回 TapResult（§5）
```

**原子性契约**: 调用方（GameState）以 applyTap 返回为「一回合」边界——Undo 快照取调用前状态，一次 Undo 回滚整条级联链（FR-024-1）。

### 3.1 阻挡判定细节

「被占格」（Δ8 层高口径）= 该格当前栈顶滑块层高 `z_target >= z_self`（含冰封、锁链、齿轮、钥匙——**机制滑块全部照常阻挡**，FR-015/FR-018）或棱镜格（全层高柱体）。`z_target < z_self` 或空格 → 凌空飞越不阻挡。棋盘外即边缘（飞出）。

### 3.4 Dock 归拢插入

飞入滑块插入位置 = 已有同花色滑块的紧邻（无同花色则 dock 末尾空位）。三消判定 = 插入后该花色计数 == 3（不依赖位置，但位置维持视觉归拢，FR-004/005）。**dock 满（7）时飞入**：先执行 4d 三消结算——若三消发生则爆槽判定解除（Edge Case「三消优先于爆槽」）；若无三消则本回合结束后 terminal() 返回 lost_burst。

## 4. 棱镜折射语义（机制 D 定型，Δ2）

- 棱镜固定于格（不可移走、非滑块、非普通障碍——即：它阻挡「不折射的直行」，但沿滑块射向它时触发折射而非弹回）。
- 折射 = 滑块从撞击棱镜格起，以新方向继续行走（上表）。
- **单次飞出至多 1 次折射**：新射线若遇阻挡（含第二个棱镜）→ 弹回原位。
- 出口 = 最终越界格（渲染与 Solver 一致取该格）。

## 5. TapResult（事件载体）

```js
{
  type: 'invalid' | 'blocked' | 'flyout' | 'prism-flyout',
  tileId,                       // 主体滑块
  path: [{r,c}, ...],           // 飞出/弹回路径（渲染动画用；含折射折点）
  blockedAt?: {r,c},            // blocked 时的阻挡格
  damage?: 0|1,                 // blocked 时的扣命量
  events: [                     // 派生事件（顺序 = 发生顺序）
    {e:'reveal', id, r, c, z}, // Δ7 堆叠：顶层飞出后次顶层暴露
    {e:'gear', id, from, to},   // 齿轮转向
    {e:'unlock', id, by},       // 锁链解开
    {e:'ice', id, from, to},    // 破冰减层
    {e:'dock', id, slotIndex},  // 入槽
    {e:'match', suit, ids:[...], combo}, // 三消（GameState 计连击分）
    {e:'remove', ids:[...]}     // 三消移除
  ],
}
```

## 6. 道具语义（FR-024；Δ9: 暂存区/「移出槽位」已移除）

| 道具 | 引擎 API | 语义 |
|---|---|---|
| Undo | （GameState 层，非本引擎） | 弹快照栈整体恢复（含级联派生），一次一回合 |
| 扳手 | `applyItem(state,'wrench',tileId)` | 目标滑块 `(d+1)%4`；**仅普通与齿轮滑块可用**（冰封/锁链返回 invalid，FR-024-2）；计入 Solver 动作集（k=2 的一种：`wrench`） |

**胜利条件（Δ9 修正）**: `terminal()` 的 won = 棋盘滑块数 == 0 **且** dock.length == 0。

## 7. 终局与死锁

1. `won`: 如上。
2. `lost_burst`: dock.length == 7 且无任何花色计数 == 3（结算后态）。
3. `lost_lives`: lives ≤ 0（GameState 记账后传入引擎状态或由 GameState 判定——**契约: lives 存于 EngineState，blocked 返回 damage，GameState 将扣减写回引擎**）。
4. `lost_deadlock`: `deadlockSuspect(state) == true` 且调用方复证搜索失败：
   - `deadlockSuspect` 谓词（保守，D-09）: `enumerateTaps(state)` 中不存在「飞出型 tap」（applyTap 试算 type 含 flyout/prism-flyout——纯谓词试算不产生渲染事件）且无道具可用（wrench 可用即非死锁候选——扳手可转向解互锁；stage 可用且 staging 未满同理）且场上无 ice>0（三消可解冻——但若 dock 无 2/3 同花色则三消不可能……谓词从简：ice>0 且 dock 内存在某花色计数 ≥2 才计「可救」）且无 locked（存在钥匙在场即「可救」）。
   - 复证: 前端 Hint 搜索器 / Solver 以同一 applyTap 做 DFS（预算内），无解 → lost_deadlock。

## 8. 性能契约

- `applyTap` O(n)（射线 ≤ 8 步 + 归拢插入 O(7) + 事件 O(tiles)）——前端 60fps 与 Solver 2M 节点预算的基础。
- `validateLevel` O(tiles + prisms + chains)。
- EngineState 不可序列化（含 Set/Map 优化结构），`snapshot(state)` / `restore(state, snap)` 提供深拷贝对（Undo 与 Solver 回溯共用）。

## 9. 自测契约（`tools/solver.js --engine-selftest` 调用）

断言集（exit code 门禁）覆盖：转向加法 `(d+1)%4` 全 4 向；棱镜 8 映射；齿轮十字邻接触发与对角不触发；破冰双口径；chains 或语义；三消优先于爆槽（7 满飞入第三同花色）；原子级联（飞出→齿轮→解锁→入槽→三消→破冰一次 applyTap 全结算）；Undo 快照等价；Δ3 胜利条件（staging 残留非胜）；死锁谓词不误杀（齿轮在场即疑、扳手可救即非疑）。场景 fixture 直接内嵌于自测代码。
