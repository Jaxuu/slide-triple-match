# Quickstart: Slide & Triple（滑块三消）验收指南

**Feature**: `001-slide-triple-match-core` | **Date**: 2026-10-17

**用途**: 端到端可运行验证场景（按里程碑分档）+ 宪章红线审计。每场景给出操作、命令与预期结果——通过即证明对应 spec 验收标准成立。实现细节见 [plan.md](plan.md)、契约 [level-data.md](contracts/level-data.md) / [rules-engine.md](contracts/rules-engine.md) / [game-session.md](contracts/game-session.md) / [level-pipeline.md](contracts/level-pipeline.md)。

**前置条件**: Evergreen 浏览器（Chrome/Edge/Firefox/Safari）；Node ≥ 18（仅离线工具场景）。**零安装步骤**——无 npm install、无构建（SC-003）。

## 0. 环境启动（全部场景共用）

```text
A. 双击 index.html（file:// 协议直开）     ← 交付主路径
B. （可选）任意静态服务: npx serve . 或 python -m http.server
```

预期：9:16 视图容器渲染（手机满视口 / PC 居中）；**file:// 下控制台零错误零跨域警告**（D-01 验收核心）；首次 pointerdown 后音效可闻（autoplay 政策）。

## 1. 里程碑验收场景

### Milestone 1 — 核心循环 MVP（US1-AC1~5）

| # | 场景 | 操作 | 预期 |
|---|---|---|---|
| Q1.1 | 射线畅通飞出 | 烟雾关中点击箭头前方无阻挡的滑块 | 滑块沿箭头滑出棋盘、飞入 Dock，同花色相邻归拢（AC1） |
| Q1.2 | 受阻弹回 | 点击前方有滑块的滑块 | 前冲碰撞弹回原位、震动动画、受阻音效、不进 Dock（AC2） |
| Q1.3 | 三消 | 使 3 个同花色入槽 | 聚合消除动效、3 格腾空、连击+1（AC3） |
| Q1.4 | 胜利 | 清空烟雾关 | 结算浮层显示（AC4）；「下一关」进入 id+1 |
| Q1.5 | 爆槽判负 | 故意凑 7 格无三消 | lost_burst 结算（AC5）；第 1 章关卡受阻**不**扣命（FR-003 分档） |
| Q1.6 | 手感与首点 | 新会话第 1 关 | 30 s 内可完成首次有效飞出（SC-005 路径）；60fps 动效 |
| Q1.7 | 花色无障碍 | 观察棋盘 | 8 花色颜色+图形双编码可辨（灰度模式下仅凭图形可区分） |

### Milestone 2 — 机制与道具（US3-AC1~7、US4-AC1~3、Edge Cases）

| # | 场景 | 操作 | 预期 |
|---|---|---|---|
| Q2.1 | 齿轮旋转（Δ1） | 机制测试关：点击齿轮滑块十字相邻滑块使其飞出 | 齿轮滑块立即顺时针转 90°，UI 即时可见（AC1）；对角滑块飞出**不**触发 |
| Q2.2 | 冰封阻挡与破冰 | 点击前方畅通的冰封滑块 → 不可飞出但阻挡他人；触发一次三消 | 冰封不可 tap（AC3）；三消后全场冰层 -1，归零破冰变普通（AC4）；冰层厚度可见（FR-017） |
| Q2.3 | 钥匙解锁 | 让钥匙滑块飞出 | 配对锁链（一钥多锁全链）自动解开、恢复可点击（AC5）；角标/链路提示可辨识（FR-020） |
| Q2.4 | 棱镜折射（Δ2） | 点击箭头指向 `/` 棱镜的滑块 | 折射 90° 从另一侧飞出入槽（AC6）；构造折射后仍阻挡的布局 → 弹回原位（单次折射上限） |
| Q2.5 | 原子级联 | 触发「飞出→齿轮转向→新路径解锁」链 | 同一回合内全部结算，动画有序完成（Edge Case） |
| Q2.6 | 三消优先爆槽 | 7 格满时飞入第三同花色 | 先三消结算、不判负（Edge Case） |
| Q2.7 | Undo | 级联回合后撤回 | 棋盘/槽/暂存完整回滚（含旋转/破冰/解锁派生，US4-AC1） |
| Q2.8 | 扳手 | 对普通/齿轮滑块使用 | 顺时针 90°；对冰封/锁链不可用（US4-AC2） |
| Q2.9 | 暂存区（Δ3） | 使用「移出槽位」→ 点击暂存区滑块 | Dock 前 3 个移至上方暂存区（US4-AC3）；暂存滑块点击即飞回 Dock 尾；**无自动回填**；暂存满 3 时道具禁用（FR-026）；通关须暂存也清空 |
| Q2.10 | 引擎自测 | `node tools/solver.js --engine-selftest` | 全部断言通过、exit 0 |

### Milestone 3 — 量产与可解性（US2-AC1~5、SC-001/004）

| # | 场景 | 操作 | 预期 |
|---|---|---|---|
| Q3.1 | 流水线量产 | `node tools/generator.js --seed 2026` | 生成 50 关 `src/data/levels.js` + `solver-report.json`；同 seed 逐位复现（D-08） |
| Q3.2 | 全量验证门禁 | `node tools/solver.js` | exit 0；报告 50/50 solvable（SC-001）；指标齐全 |
| Q3.3 | 参数矩阵核对 | 抽查 L1/L15/L25/L35/L45 配置 | 网格/花色/滑块数/机制档位符合 FR-008 矩阵（AC1） |
| Q3.4 | 难度曲线 | 读报告 curveGate | 章均值单调不减、1~4 章步数斜率 ≥0、第 5 章锯齿（AC/SC-004） |
| Q3.5 | 进关与终局 | 连续通关 | 自动进 N+1；L50（=LEVELS.length）通关进入全通关庆祝（AC3） |
| Q3.6 | 进度延续 | 通关几关后刷新页面 | 自动进入 unlocked 关；进度持久（localStorage 不可用时降级内存仍可玩） |
| Q3.7 | 变更重验 | 手改任一关卡数据 → 重跑 solver | 门禁捕获不一致（exit 1），报告更新（FR-031） |

### Milestone 4 — 调试面板与扩容（US4-AC4~7、SC-002/003/006）

| # | 场景 | 操作 | 预期 |
|---|---|---|---|
| Q4.1 | 跳关 | 面板下拉选任意关 | 立即加载该关（AC4） |
| Q4.2 | Hint | 点击 Hint（在轨/偏离两态各测） | 在轨高亮解下一步；偏离时搜索给首步或「非保证」标记（AC6） |
| Q4.3 | Auto-Play | 点击自动演示 | Bot 沿最优解逐步点击直至胜利；玩家点击即打断（AC5） |
| Q4.4 | 指标与标签 | 查看关卡信息 | 难度评估分 + 全部量化指标 + 机制标签动态正确（AC6） |
| Q4.5 | 移动端面板 | 窄屏收起/唤出 | 抽屉隐藏/唤出，游玩布局不受影响（AC7） |
| Q4.6 | SC-002 计时 | 跳关+自动演示遍历 50 关 | 10 分钟内完成 + ≥10 关人工机制深验 |
| Q4.7 | 首屏性能 | 冷启动（清缓存） | 可交互 < 3 s（SC-003）；levels.js ≤ 200 KB |

### Q8 — 无缝扩容钻探（M4，Δ4+Δ5 验证；**钻探配置不进入交付物**）

```text
1. 临时向 tools/level-config.js 的 CHAPTERS 追加第 6 章条目（如 levels:[51,60], grid:[8,8] …）
2. node tools/generator.js --chapters 6 --seed 2026 → 生成 60 关 levels.js
3. node tools/solver.js → 60/60 门禁通过
4. 浏览器验证：下拉框出现 51~60 选项、通关 L50 自动进 L51、L60 通关触发全通关终局、
   进度对象无需迁移即自适应（全部零前端代码修改）
5. 回滚：git checkout 配置 → 重跑生成恢复 50 关交付物 → solver 全量重验
```

预期：步骤 4 全部成立——**扩容 = 配置数组加条目 + 重跑两条命令**。

### Q9 — 宪章红线审计（交付前终验）

| 红线 | 检查 | 预期 |
|---|---|---|
| 零框架/零构建 | 仓库无 package.json / node_modules / 构建配置；index.html 无 type="module"、无动态 import/fetch | 全部成立（宪章 II） |
| 零二进制素材 | 仓库文件类型扫描 | 无 .png/.jpg/.mp3/.wav/.woff 等二进制（SC-006，宪章 III） |
| PointerEvents 唯一 | 源码 grep 无 touchstart/mousedown/mouseup/touchend | 零命中（宪章 IV） |
| 关卡来源 | levels.js 头注释生成元数据 + solver-report.json 在库 | 逆向生成 + Solver 验证（宪章 V） |
| 双击可玩 | Q0 场景 | file:// 零报错可玩（宪章 II 交付红线） |
| 调试面板 | Q4.1~4.5 | 功能集齐全（宪章 VI） |

## 2. 一键命令速查

```text
游玩:        双击 index.html
引擎自测:    node tools/solver.js --engine-selftest
量产 50 关:  node tools/generator.js --seed 2026
全量验证:    node tools/solver.js        （exit 0 = 50/50 可解 + 全门禁通过）
单关调试:    node tools/solver.js --level 7
```
