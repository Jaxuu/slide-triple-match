> **Propagated**: 2026-10-25 — **Δ22（全景声学架构 + 5 秒连击夸赞 + 15 种开局卡牌进场编舞）** refine 传播：新增 **Phase 12 / Milestone 9（T105~T113，3 批次）** + 门禁表/依赖图/故事映射/增量追溯表同步；**已勾选的 Phase 1~Phase 11（T001~T104）任务零改动**。**三条硬边界**：① **宪章原则 III 音频红线第二次受控让位**——BGM / 事件级音效 / 三阶语音夸赞改用 `assets/audio/` 8 个本地 mp3（`HTMLAudioElement` 加载，**严禁 `fetch + decodeAudioData`**：`file://` 下 `Origin: null` 必报 CORS），交互级音效（`ber~`/`deng~`/落牌涟漪）与开机和弦**仍零文件 Web Audio 合成**；宪章需正式升 **v3.0.0**。② **连击双口径**——`GameState` 的 `comboCount`（5 秒滑动窗）与 FR-047 §2 的 IQ 乘区 `M_combo`（受阻断连）**MUST NOT 互相覆盖或隐式同步**。③ **开局编舞为纯运动学**——MUST NOT 改变卡牌花色/方向/坐标/层号，绘制排序 MUST 复用静态渲染同一比较器，MUST NOT 触碰 `RulesEngine` 或 Solver（FR-032）。**编号说明**：用户指令以「FR-051」指称编舞系统，但 FR-051 已被「风景画卷拼图进度系统」占用（9 文件引用），经用户裁定编舞占用 **FR-052**、画卷保持 FR-051 不动（见 spec Edge Cases「FR-052 编号决策」）。

> **Propagated**: 2026-10-24 — **Δ21（90 种全图鉴扩容 + 无迎头死锁 + 自动质心居中 + 无描边碎片瀑布 + 调试面板全程可用）** refine 传播：新增 **Phase 11 / Milestone 8（T096~T104，3 批次）** + 门禁表/依赖图/故事映射/增量追溯表同步；**已勾选的 Phase 1~Phase 10（T001~T095）任务零改动**。**三条硬边界**：① 图鉴 90 种 / 六画卷权威命名 / 后缀探测 / 质心居中 / 单层待消槽 / 无描边碎片均属**渲染与展示层**——MUST NOT 改写 `levels.js` 的 suit 字段与花色数 K（FR-033 §8）；② FR-045 §7/§8 属**规则防御层新增语义**——M6 新口径冻结就本轮再次解除，**T098 MUST 全量重生成/重验 72/72 后再次冻结**；③ Generator 的静态零迎头死锁门禁 MUST NOT 因运行期自愈而放宽（spec Δ21 Assumptions）。

> **Propagated**: 2026-10-23 — Δ20（核心体验与视觉规范）refine 传播：新增 Milestone 7（发牌反聚簇重塑、玉石麻将牌面与原位压暗、IQ 50-200 动态曲线、全屏白瓷碎裂瀑布与结算直通下一关）技术方案；tasks.md 新增 Phase 10（T088~T095，4 批次）。

> **Propagated**: 2026-10-22 — **Δ19（核心玩法布局重构 + 关卡生成升级 + 局内 UI 规范，US7 新增）** 传播：插入 **Phase 9 / Milestone 6（T077~T088 三批次）** + 门禁表/依赖图/故事映射/并行机会同步；**已勾选的 Phase 1~Phase 8（含 T076 Δ20 缺陷修复）任务零改动**。**三项关键让位与降级**：① FR-008 的 Δ13/Δ16 逐字节零改写铁律本轮**受控让位**（既有 72 关全量受控迁移为 v2 布局，迁移后铁律复位）；② **M2 规则冻结解除**——FR-044 同层独立射线阻挡与压制锁定改写 RulesEngine 判定语义，须全量重跑流水线重验 72 关；③ **原 FR-044（风景画卷拼图进度系统）改号为 FR-051**（内容零改动），任务描述内的 `FR-044` 引用已同步改指 FR-051。**任务编号说明**：用户指令指定 T076~T087，但 **T076 已被已交付的 Δ20 实机三缺陷修复占用**，故本阶段顺延为 **T077~T088**（三批次各 4 任务，批次边界与职责划分与用户指令完全一致）。

---
description: "Task list for feature implementation（四里程碑门禁式）"
---

# Tasks: Slide & Triple（滑块三消）— 完整 H5 游戏与 72 关递进关卡系统（Δ16 扩容后 · Δ17 原创视觉重制后 · Δ21 全图鉴 90 种后 · Δ22 全景声学与开局编舞后）

> **Propagated**: 2026-10-21 — **Δ18（US6 外围 UI 交互与视觉细节补强）** 传播：同步更新 **T068/T069/T071 任务描述**——① 徽标明确为**双层立体 3D 卡通字**（`Glide` 琥珀暖金立体字 + `Critters` 薄荷翠绿胶囊底托字）+ 两侧纯白滑行风翼 + 棱镜星芒 + 萌宠探头呼吸浮动，棱晶栏改用**七彩切面棱晶 SVG** + 余额弹跳动效；② **棱晶星盘左右切换口径放开**——由「仅已唤醒大陆」改为「**全部 6 大奇幻大陆**均可翻阅」；③ 未点亮晶片改为**逐块独立的 `第 X 关充能` 标注**（第 4 块附 `💎 ×150` 满充能大奖预览）；④ 档案弹窗底部**【确认】为落库保存点** + 补齐**右上角圆润关闭按钮**；⑤ 局内购买补齐 **`-50 💎` 飘字**与**余额不足轻晃**反馈；⑥ **修复 `STM.Backdrops.drawQuadrant` 源矩形口径缺陷**（原以缩放后尺寸当原图坐标取样，导致已点亮晶片显示放大错位条带——与 FR-035 §6 铁律相悖），改为「可见源区域换算回原图像素后取半」，4 块拼合 == 整幅 cover 裁切。**Δ18 属外围 UI 补强 + 一处渲染口径修复——已勾选的 Batch A/B/C 其余任务与 Phase 1~Phase 7（T001~T063）零改动**；关卡数据、RulesEngine 判定语义、profile v2 键结构、导航闭环与经济数值表**零改动**。

> **Propagated**: 2026-10-21 — **Δ17（US6 外围 UI 视觉载体 100% 原创重制）** 传播：同步更新 **T068/T069/T070/T072/T073/T075 任务描述**与 Batch B/C 批次标题（拼图相框 → 棱晶星盘传送门；阳光木桌兜底 → 3D 卡通云端浮空岛兜底；天蓝圆弧顶盖 → 奶油果冻软胶卡片 + 琥珀金胶囊铭牌 + 棱晶圆角拨片；彩带横幅+金色号角 → 双风翼棱晶能量铭牌；画卷解锁展板 → 新奇幻大陆传送门开启），并在 T068/T069/T072/T075 中追加**原创性红线（竞品视觉元素清零七项明文禁令）**验收条。**Δ17 属纯视觉皮肤层换肤——已勾选的 Batch A（T065/T066/T067）零改动、Phase 1~Phase 7（T001~T063）零改动**；T071（局内棱晶购买闭环）与 T074（失败复活）功能语义不变，仅 T074 标注沿用新的奶油果冻视觉基底。

> **Propagated**: 2026-10-21 — Δ16（72 关扩容 + US6 商业化外围 UI 闭环）refine 传播：插入 **Phase 8 / Milestone 5（T064~T075 三批次）** + 门禁表/依赖图/故事映射/增量追溯表同步；**已勾选的 Phase 1~Phase 7（T001~T063）任务零改动**（仅更新 Overview/Organization/Path Conventions 的 60→72 口径与背景贴图口径 bg{1..20}→bg{1..6}）。

> **Propagated**: 2026-10-20 — Δ14（US5《万物出发！》）refine 传播：插入 Phase 5.5 / Milestone 3.5（T052a~T052f 表现层任务组）+ 门禁表/依赖图/故事映射同步；**已勾选的 Phase 1~Phase 5（T001~T052）任务零改动**，Phase 6（T053~T059）与 Phase 7 顺延保留在后。原 refine 指令的 Δ7~Δ10 编号与实现期变更记录冲突，编入 Δ14a~Δ14d（见 plan.md 传播注记）。

> **Propagated**: 2026-10-20 — Δ15（空间打散 + 贴图双兜底 + 箭头重做）refine 传播：插入 Phase 5.6 / Milestone 3.6（T052h~T052k 增量任务组——**原指令建议的 T052g~T052i 顺延为 T052h~T052k，因 T052g 已被 M3.5 检查点占用（5ea6c44 已交付）**）+ 门禁表/依赖图/故事映射/增量追溯表同步；宪章 III v2.0.0、SC-006 重定义、FR-029/FR-030/FR-011/FR-033 §6/FR-034 §3/FR-035 §3 口径同步；**已勾选任务零改动**（T052a~T052g 的流光胶囊/程序化表述保留原文——其产出将由 T052i/T052j/T052k 增量改造，不由本传播改写历史）。已知状态偏差记录：T052f 复选框未勾但实现已随 5ea6c44 交付（BGM 代码在库）——勾选状态由实现者复核后归位。

**Input**: Design documents from `/specs/001-slide-triple-match-core/`

**Prerequisites**: plan.md（「四阶段 + 表现层 + 外围闭环 + 玩法重构」里程碑策略 + Δ1~Δ6 架构增量 + Δ14a~Δ14d 表现层增量 + Δ15a~Δ15c 空间打散/贴图/箭头增量 + Δ16a~Δ16g 商业化外围/72 关扩容增量 + **Δ19a~Δ19e 玩法重构增量** + **Δ21a~Δ21d 全图鉴/零死锁/质心居中/残局提示增量** + **Δ22a~Δ22c 全景声学/5 秒连击/开局编舞增量**）、spec.md（US1~US7 + Edge Cases + FR-029/FR-030/FR-033/FR-034/FR-035 Δ15 增补条款 + FR-038~FR-043 Δ16 新增条款 + **FR-044~FR-050 Δ19 新增条款** + **FR-008/FR-033/FR-044/FR-045/FR-047/FR-049 的 Δ21 就地修订** + **FR-050 的 Δ22 就地扩容（全景声学与连击反馈系统）+ FR-052（15 种开局卡牌进场编舞，Δ22 新增）** + **FR-051** 画卷拼图进度系统（Δ19 由原 FR-044 改号，Δ22 保持不动））、research.md（D-01~D-15）、data-model.md（实体/不变量/状态机；**Δ22 需补 Audio Bank / Combo Window / Deal Choreography 三实体**）、contracts/×4（rules-engine / level-data / game-session / level-pipeline）、quickstart.md（分里程碑验收场景 + 红线审计）、constitution.md（**v3.0.0（2026-10-25 已生效）——原则 III「本地可选资产 + 强制兜底」+「音频资产分层」三条；Δ15 的 v2.0.0 美术贴图放开条款继续有效**）

**Tests**: 本项目采用零测试框架三层验证（D-14，勿引入 jest/vitest 等任何 npm 依赖）：① `node tools/solver.js` 全量可解性门禁（exit code 机判）② `node tools/solver.js --engine-selftest` 规则不变量断言 ③ quickstart.md 人工验收场景。此类验证任务**非可选**——它们是 FR-030/031/SC-001 的交付物，已按里程碑融入任务清单。

**Organization**: 任务按 **plan.md「四阶段 + 表现层 + 外围闭环」里程碑**（M1→M2→M3→M3.5→M3.6→M4→M5）组织；用户故事标签映射进各里程碑：**M1=US1（核心循环）、M2=US3+US4 道具（机制/道具+规则冻结）、M3=US2（60 关量产——Δ13 扩容后，原 50 关基准批次）、M3.5=US5（万物出发表现层——45 图鉴/生态背景/横幅/BGM，纯渲染与音频层）、M3.6=US2+US5 Δ15 增量（空间打散迁移 + 贴图双兜底 + 箭头重做）、M4=US4 面板（调试面板/Bot/扩容）、M5=US2+US6（72 关尾部扩容 + 品牌开机动画 + 主大厅 + 弹窗 + 棱晶经济 + 结算/展板/复活——外壳层 Shell-Last）、M6=US7（半格错位玩法重构 + 顶部待消槽 + IQ + 三大道具）、M7=Δ20 体验与视觉规范、M8=Δ21（全图鉴 90 种 + 零死锁 + 质心居中 + 无描边碎片 + 调试面板残局提示）、M9=Δ22（混合双轨声学 + 5 秒连击语音飘字 + 15 种开局卡牌进场编舞——纯表现层，音频红线部分让位）**。里程碑间为**冻结门**关系：上一 Checkpoint 未全过，禁止开始下一阶段任务——尤其 M3 大批量量产严禁在 M1/M2 未验证前提前执行。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成任务依赖；**里程碑门禁优先于一切 [P]**）
- **[Story]**: 用户故事（US1/US2/US3/US4/US5/US6/US7；Setup/Foundational/Polish 阶段无标签）
- 任务描述内嵌契约关键数值，便于直接执行；与契约冲突时以 contracts/ 四文档为唯一真源

## Path Conventions（零构建静态 H5 + Node 离线工具）

- 前端运行时: `index.html`, `css/style.css`, `src/main.js`, `src/core/GameState.js`, `src/core/RulesEngine.js`, `src/core/profile.js`（Δ16 新增）, `src/render/BoardRenderer.js`, `src/render/bestiary.js`, `src/render/backdrops.js`, `src/audio/SoundManager.js`, `src/ui/splash.js`（Δ16 新增）, `src/ui/lobby.js`（Δ16 新增）, `src/ui/modals.js`（Δ16 新增）, `src/ui/result.js`（Δ16 新增）, `src/ui/fail.js`（Δ16 新增）, `src/data/levels.js`
- 离线工具（Node ≥18 CommonJS，前端永不引用）: `tools/level-config.js`, `tools/generator.js`, `tools/solver.js`, `tools/expand-60.js`, `tools/redisperse-60.js`（Δ15 新增）, `tools/render-selftest.js`
- 生成工件（随仓库交付）: `src/data/levels.js`（M3 起整体再生成；M3.6 起头经 redisperse-60 一次性迁移后冻结；M5 起头经 expand-60 尾部增量追加 L61~L72 后冻结）, `tools/solver-report.json`
- 可选增强资产（Δ15/宪章 III v2.0.0——**仓库不强制包含，空形态完整可玩**）: `assets/icons/{suit}.png`（**Δ21: 0~89**）+ `assets/icons/sheet{1..6}.png|jpg`（**Δ21: 六张 4×4 图集，各取前 15 格；仓库实存 sheet1~5.jpg / sheet6.png**）, `assets/bg/bg{1..6}.png|.jpg|.jpeg|.webp`（Δ16 由 bg{1..20} 收窄；**Δ21: 后缀探测链自动自适应，bg2.png / bg4.jpg 均须正常显示**）, `assets/bg/lobby_bg.png|.jpg`（Δ16 大厅背景）
- 仓库**不得出现** package.json / node_modules / 构建配置（宪章 II / level-pipeline.md §4）

## 架构增量 Δ1~Δ6 + Δ14a~Δ14d + Δ15a~Δ15c + Δ16a~Δ16g + Δ19a~Δ19e + Δ21a~Δ21d + Δ22a~Δ22c 落点追溯表

| 增量 | 口径摘要 | 落点任务 |
|---|---|---|
| Δ1 机制 A 仅齿轮滑块 | 十字相邻成功飞出触发原地顺时针 (d+1)%4；**地面转向垫载体取消** | T023, T034, T037, T046 |
| Δ2 机制 D 棱镜定型 | `/`、`\` 反射表；单次飞出至多 1 次折射；折射后受阻弹回；Generator 拒绝对射 | T026, T034, T046, T047 |
| Δ3 暂存区交互修正（**已被 Δ9 撤销**） | 原设计「道具移 Dock 前 k≤3 入暂存区+取消自动回填」——试玩发现点击暂存滑块触发复制分身 Bug 破坏花色守恒 + 视觉冗余 → **暂存区与「移出槽位」道具整体移除**（Δ9）；道具仅 Undo/Wrench；胜利=棋盘+Dock 全清空 | T030, T032, T035, T038 |
| Δ4 LEVELS.length 动态化 | 深链/进度钳制/自动进关/跳关下拉/终局判定全部动态读取，扩容零前端改动 | T020, T050, T051, T054, T059, T064, T069 |
| Δ5 参数表驱动生成 | `CHAPTERS` 可扩展数组，追加条目即新增章节 | T040, T059, T064 |
| Δ6 solutionMoves 预计算 | Solver 最优解内嵌 levels.js，Hint/Bot 零延迟回放 | T049, T055, T056, T064 |
| Δ14a 45 种图鉴池与三阶段抽样 | 渲染层阶段映射表（按 level.id 区间 **L1~24 / L25~48 / L49~72**（Δ16 重划），**严禁读 level.chapter**）+ 确定性抽样；levels.js suit 字段/花色数 K 零改写 | T052a, T052c |
| Δ14b 3D 奶油白底座 + 边缘流光角标 + Sprite 缓存 | 移除圆圈指示器与面部箭头圆圈；朝向侧边缘流光胶囊角标（**Δ15c 取代：锐利三角箭头——T052i 改造**）；45 图案离屏 Sprite 预渲染 | T052b |
| Δ14c 生态背景池 | cycleIndex=floor((id-1)/3) 绑定，同循环 3 关共享；棋盘蒙版保可读性（**Δ15b：程序化绘制降格为兜底——T052j 改造；Δ16：20 景口径收窄为 6 幅画卷——T064/T068 改造**） | T052d |
| Δ14d 治愈系 BGM + 困难关横幅 | 五声音阶循环合成器 + 开关/可见性联动；挑战位集合 L3 ∪ (id-4)%3==2 共 24 关 1.6s 绿金横幅（**Δ16：60→72 关后集合扩为 24 关**） | T052e, T052f, T064, T072 |
| Δ15a 同花色空间打散三档曲线 + 存量重打散迁移 | 三档聚散度曲线（L1~L6 / L7~L21 / **L22~L72**（Δ16 延展）三连簇归零）；Generator 花色分配打散 + Solver 聚散度指标 + redisperse-60 一次性迁移（FR-008 Δ13 铁律受控例外 + FR-031 全量重验） | T052h, T052k, T064 |
| Δ15b 外部贴图优先 + Emoji/程序化强制双兜底（宪章 III v2.0.0） | `assets/icons/{suit}.png` → Emoji 直渲染兜底（严禁 ctx.arc 手绘圆球）；`assets/bg/bg{N}` → Canvas 风景兜底；`Image` 相对路径、逐条目/逐景独立判定、空 assets 完整可玩 | T052i, T052j |
| Δ15c 方向角标重做（单枚锐利宽翼三角） | 废止流光胶囊「猪鼻子」造型；朝向边缘内侧正中单枚实心宽体三角 + 白描边；方向语义零变化 | T052i |
| **Δ16a 72 关尾部增量扩容 + 阶段重划 24/24/24** | 既有 L1~L60 逐字节零改写；仅新增 L61~L72 共 12 关；章区间 ch1[1,24]/ch2[25,48]/ch3[49,72]；Solver 报告 72/72 | **T064** |
| **Δ16b 6 幅风景画卷 × 12 关拼图节奏** | 画卷序号=floor((id-1)/12)+1 → bg1~bg6 覆盖 L1-12 / L13-24 / L25-36 / L37-48 / L49-60 / L61-72；困难位关点亮 1/4 块，12 关拼齐 1 幅；切片与局内背景同源同缓存链 | **T064, T068, T072** |
| **Δ16c localStorage v2 持久化升级** | `slide-triple:profile:v2` 键承载 shards/nickname/avatar/paintingProgress[6]/settings{bgm,sfx,haptics}；与 progress v1 并存不迁移；零回写 levels.js | **T065** |
| **Δ16d HooLey Games 开机动画** | `#14181F→#07090C` 径向渐变 + `HooLey`/`GAMES` 浮雕字 + `oo` 磁力弹跳/眨眼 + 白金流光；Web Audio 合成 ≈0.35s 和弦（零音频文件）；≈2.0s 淡入大厅；首次点击/按键可跳过 | **T066** |
| **Δ16e Glide Critters 主大厅 + 设置/档案弹窗**（**Δ17 原创重制**：中心棱晶星盘传送门 / 云端浮空岛兜底 / 奶油果冻弹窗） | 六区布局（设置⚙️/调试🛠/棱晶💎/3D 徽标/**棱晶星盘传送门**/`关卡 X` 按钮/头像昵称）；`lobby_bg` 优先 + 原创「3D 卡通云端浮空岛与发光棱晶簇」Canvas/CSS 兜底；设置三项拨片开关 + 局内「返回大厅/重新开始」；昵称 + 45 选 1 头像网格 | **T068, T069, T070** |
| **Δ16f 棱晶经济与道具购买闭环** | 产出确定性表（+25/+60/+150/+10）；道具免费次数用尽后角标 `💎 50` 点击即扣即生效；余额不足零扣费零消耗；扣费原子；无真实货币/支付/联网 | **T065, T071** |
| **Δ18 US6 外围 UI 交互与视觉细节补强** | ① 徽标双层立体 3D 卡通字（`Glide` 琥珀暖金立体字 + `Critters` 薄荷翠绿胶囊底托字）+ 两侧纯白滑行风翼 + 棱镜星芒 + 萌宠探头呼吸浮动；棱晶栏七彩切面棱晶 SVG + 余额弹跳动效；② 棱晶星盘左右切换放开为**全部 6 大奇幻大陆**可翻阅（默认落点 = 当前关归属大陆）；③ 未点亮晶片逐块独立标注 `第 X 关充能`，第 4 块附 `💎 ×150` 满充能大奖预览；④ 档案弹窗底部【确认】= 昵称与头像统一落库保存点 + 右上角圆润关闭按钮；⑤ 局内购买补齐 `-50 💎` 飘字与余额不足轻晃反馈；⑥ 修复 `STM.Backdrops.drawQuadrant` 源矩形口径缺陷（可见源区域换算回原图像素后取半 → 4 块晶片拼合 == 整幅 cover 裁切 == 局内所见背景，FR-035 §6） | **T068, T069, T071** |
| **Δ16g 结算 / 传送门开启展板 / 无倒计时失败复活**（**Δ17 原创重制**：双风翼棱晶能量铭牌 + 滑板跃起萌宠 + 星芒粒子） | 双风翼棱晶能量铭牌 + 头像乘滑板跃起 + 棱晶星芒粒子 + 20 词库赞美词 + 星盘 + 棱晶飞入；4/4 触发传送门开启展板（大陆全貌 + `关卡 X-Y` 徽章 + 手账文案 + `继续`）；失败页零倒计时 + 委屈泪滴 + `💎 100 复活`（Dock 滞留 + 板面同花色配对块成组净化消除、恢复 3 生命、续局不重置棋盘）+ `重新开始` | **T072, T073, T074** |
| **Δ21a 90 种全图鉴 × 六画卷权威体系** | `sheet{1..6}` 各取前 15 格 → Suit 0~89；每 12 关解锁 15 种（累计池 15→30→45→60→75→90）；六画卷权威主题名【晨曦雪峰庄园】/【云端飞瀑风车岛】/【碧浪椰影浅湾】/【凛冬冰川镜湖】/【云端霞彩航道】/【星穹极光之巅】+ 逐字介绍文案（`STM.Bestiary.PAINTINGS` 单一源）；Δ14/Δ16 的 45 条全量保留归位；纯渲染层零改写 `levels.js` suit/K | **T096, T102, T103** |
| **Δ21b 后缀自适应 + 切图质心居中 + 待消槽单层卡片** | `bg{1..6}` / `sheet{1..6}` 走 `.png → .jpg（→ .jpeg → .webp）` 探测链、静默失败、会话缓存；切图 9% 内缩 → 非白包围盒 `R < 248 \|\| G < 248 \|\| B < 248` → 质心对齐 256×256 `(128,128)`；`#dock .slot.is-filled` 去 border/padding/background（空槽保留内凹、相邻 ≥1px 视距） | **T096, T099, T100** |
| **Δ21c 迎头死锁零容忍 + 运行期自愈** | 同层同行 `R↔L` / 同列 `D↔U` 且无第三外向出口 → Generator/洗牌候选拒绝；`RulesEngine` 每次操作结算后自愈旋转 ≤4 次、超限洗牌兜底、MUST NOT 判负；自愈入 Undo 快照、不破花色守恒/零悬空；Generator 门禁不因自愈放宽 | **T097, T098, T104** |
| **Δ21d 无描边 Low-Poly 碎片瀑布 + 调试面板残局实时提示** | 碎片 2~3 折面、零 stroke/深色阴影、`#FFFFFF`/`#CBD5E1`/`#94A3B8`；大 18~28px≈15% / 中 8~16px≈45% / 细粉 2~6px≈40%；120~150 枚从 3 槽包围盒并集全宽向左下倾泻；`findBestNextMove(state)` 残局启发式（≤100k 节点/≤2s）；音效 checkbox 与 `muted` 同向；面板显示画卷主题名 | **T101, T102, T103, T104** |
| **Δ22a 混合双轨声学引擎 + 8 大音频资产挂载** | `assets/audio/` 8 文件经 `HTMLAudioElement`（`preload="auto"`）预加载，**严禁 `fetch+decodeAudioData`**（`file://` 下 `Origin: null` 必 CORS）；`bgm_lobby` 0.28 / `bgm_game` 0.22 循环 + `400ms` 交叉淡变；`sfx_shatter` 0ms 瞬发 + `playbackRate` 变调（`preservesPitch=false`）；`sfx_win` 延迟 250ms 且压低 BGM 50%；`sfx_lose` 槽满锁死瞬发；每音效独立实例池防掐头；单文件失败静默降级、BGM 缺失回退 FR-037 程序化合成；合成轨 `ber~`/`deng~`/落牌涟漪零延迟实时合成 | **T105, T106, T107** |
| **Δ22b 5.0 秒滑动窗连击 + 三阶语音 + `#dock` 微光飘字** | `comboCount` 以**时间戳差值**判定（`<= 5000ms` 续连否则重置为 1，每次刷新窗口，MUST NOT 用 rAF 帧计数）；速率序列 `1.00/1.06/1.12/1.18/1.25`；Combo 3/4/5+ 延迟 `120ms` 播 `sfx_voice_good/great/unbelievable`；飘字 `Combo ×2`/`Good! ×3`/`Great! ×4`/`Unbelievable! ×N`（`pointer-events:none` 不遮挡命中区域）；Combo 1 无语音无飘字；与 FR-047 §2 的 `M_combo` **双口径互不同步** | **T108, T109, T110** |
| **Δ22c 15 种开局卡牌进场编舞 + 同步落子涟漪 + 点击快进** | `0~180ms` 卡牌 `alpha=0` 仅风景底图（兼作解码/预排版窗口）；`180~820ms` 按 15 种编舞之一依次落定（`diagonal_cascade`…`starlight_scatter`，总时长 ≤640ms）；绘制排序复用静态渲染同一比较器 `(a.z-b.z)\|\|(a.r-b.r)\|\|(a.c-b.c)`、同渲染坐标高层延迟恒 `+60ms*z`（零穿模）；逐牌落定触发落牌涟漪音；相邻两次开局不重复；动画中点击 MUST 快进 100% 且正常响应本次点击；`prefers-reduced-motion` 降级淡入保留 180ms 底图停留；纯运动学不改卡牌属性 | **T111, T112, T113** |

## 里程碑门禁总览（执行纪律）

| 门 | 位置 | 核心判据 | 未过禁止 |
|---|---|---|---|
| M1 验收门 | T022 | US1-AC1~AC5 + quickstart Q1.1~Q1.7 + file:// 零控制台报错 | 开始 M2 |
| **M2 冻结门（FREEZE）** | T039 | US3-AC1~7、US4-AC1~3 + Edge Cases 复现 + `--engine-selftest` 全绿 | **开始 M3 量产（严禁提前生成大批量关卡）** |
| M3 量产门 | T052 | SC-001 60/60（Δ13 扩容后）+ SC-004 曲线门 + US2-AC1~AC5 | 开始 M3.5 |
| M3.5 表现层门 | T052g 验收 | SC-007/SC-008 + US5-AC1~AC8 + render-selftest Δ14 断言全绿 + engine-selftest 回归零漂移 + levels.js git diff 为空（M3.5 时点） | 开始 M3.6 |
| M3.6 Δ15 门 | T052k 验收 | FR-029 三档曲线 60/60 聚散度达标 + FR-031 全量重验报告更新 + SC-006 重定义（空/满 assets 双兜底双形态）+ US2-AC6 + US5-AC4/AC5 复扫 + render-selftest Δ15 断言全绿 + engine-selftest 零漂移 | 开始 M4 |
| M4 交付门 | T058 + T062/T063 | SC-002/003/006/007/008 + 宪章红线零违规 | 交付 |
| **M5 外围闭环门** | T075 验收 | SC-009/010/011 + US6-AC1~AC10 + Solver 72/72 + render-selftest Δ16 断言全绿 + engine-selftest 零漂移 + 既有 60 关逐字节零改写 | 交付（终局交付门） |
| **M6 玩法重构门** | T088 验收 | SC-012~016 + US7-AC1~AC21 + Solver 72/72（v2 布局）+ 零悬空违规 0 + 瓶颈节奏达标 + engine/render-selftest Δ19 全绿 | 开始 M7 |
| **M7 体验与视觉门** | T095 验收 | 72/72 + Spatial Anti-Clustering / Directional Interlocking 达标 + 碎片采样 120~150 + IQ 初值 50/封顶 200 + 结算按钮 `关卡 X` 直达下一关 | 开始 M8 |
| **M8 全图鉴与零死锁门** | T104 验收 | SC-017 ①~⑦ + SC-007 90 种 + FR-045 §7/§8 断言 + Solver 72/72（含自愈语义，死锁对 0）+ 90 切片质心偏差 ≤2px + render/engine-selftest Δ21 全绿 + `levels.js` suit/K 逐字节零改写 | 开始 M9 |
| **M9 声学与编舞门** | T113 验收 | SC-018 ①~⑥ + SC-019 ①~⑥ + US7-AC25~AC28 + Solver 72/72（与 M8 基线逐条一致，零漂移）+ `file://` 双击下 8 音频全 ready 且零 CORS（代码零 `decodeAudioData`）+ 连击速率序列 1.00/1.06/1.12/1.18/1.25 + 15 编舞全覆盖且相邻不重复 + 零穿模 + 点击快进 100% 且该次点击被响应 + render/engine-selftest Δ22 全绿 + **宪章 v3.0.0 已修订生效（2026-10-25，MAJOR）** | 交付（终局收口门） |

---

## Phase 1: Setup（脚手架与规范同步）

**Purpose**: 项目骨架 + 文档口径对齐

- [x] T001 Create project structure per implementation plan: 空文件占位 `index.html`, `css/style.css`, `src/main.js`, `src/core/GameState.js`, `src/core/RulesEngine.js`, `src/render/BoardRenderer.js`, `src/audio/SoundManager.js`, `src/data/levels.js`, `tools/level-config.js`, `tools/generator.js`, `tools/solver.js`（仓库不含 package.json/node_modules——宪章 II）
- [x] T002 Build index.html view skeleton per contracts/game-session.md §3: `#app`(9:16) 内 `#hud` / `#board-wrap > #board`(canvas) / `#staging`(3 格，Dock 上方) / `#dock`(7 格) / `#items`(3 键道具栏) / `#debug-panel` / `#result-overlay`；固定 classic `<script defer>` 加载序：`src/data/levels.js → src/core/RulesEngine.js → src/core/GameState.js → src/render/BoardRenderer.js → src/audio/SoundManager.js → src/main.js`；禁止 `type="module"`、动态 import()、fetch 加载代码/数据（D-01）
- [x] T003 [P] Implement 9:16 responsive shell in css/style.css (D-13): `#app` aspect-ratio 9/16；`<720px` 手机 100vw/100dvh（不支持 dvh 回退 100vh）；`≥1024px` 居中 + 右侧 320px 面板位；比例约 棋盘 62% / Dock+Staging+道具栏 28% / HUD 10%；`clamp()` 字号；HUD/Dock/Staging/道具栏/结算浮层/移动抽屉基础样式
- [x] T004 Sync spec.md wording to Δ increments in specs/001-slide-triple-match-core/spec.md: FR-014（转向垫载体取消，机制 A 仅齿轮滑块）、FR-024-3（暂存区取消自动回填，改点击自由牌）、FR-006（胜利条件扩展：棋盘+暂存区+收集槽全清空）、FR-026 保留——消除 spec/plan/契约间文档歧义（plan.md「建议」节）

---

## Phase 2: Foundational（STM 命名空间与双导出地基）

**Purpose**: 阻塞全部里程碑的共享前置——命名空间、UMD 双导出、数据 schema 活样例

**⚠️ CRITICAL**: 未完成前任何里程碑任务不可开始

- [x] T005 Implement levels.js UMD dual-export scaffold + 1 个 schema 完整占位 Level in src/data/levels.js: UMD 头（浏览器挂 `STM.LEVELS`、Node `module.exports`，level-data.md 格式选型模板）；占位关 = 4×4 / 2 花色 / 6 滑块（%3==0）/ cfg 默认值（lives:3, damageOnBlock:false, items{1,1,1}, iceMode:'triple', chains:[]）/ metrics 手工估值 / solutionMoves 手工解——作为 schema 活样例
- [x] T006 [P] Implement RulesEngine UMD scaffold + 坐标/方向/棱镜常量 in src/core/RulesEngine.js: UMD 双导出（D-02）；坐标 (r,c) row 0=顶部；方向数字 0=U,1=R,2=D,3=L（**顺时针序**，「转 90°」≡ `(d+1)%4`，D-12）；棱镜反射全枚举映射表（`/`:U→R,R→U,D→L,L→D；`\`:U→L,L→U,D→R,R→D）；API 占位导出 init/canTap/applyTap/applyItem/stageTile/terminal/deadlockSuspect/enumerateTaps/validateLevel/renderProbe/snapshot/restore；**纯函数、零 DOM/音频/存储依赖**（Node 可 require 是硬约束）
- [x] T007 [P] Implement STM mount stubs in src/core/GameState.js（`STM.GameState.createSession` 占位）、src/render/BoardRenderer.js（`STM.createBoardRenderer` 占位）、src/audio/SoundManager.js（`STM.createSoundManager` 占位）、src/main.js（DOMContentLoaded 入口占位）——共享单全局命名空间 `window.STM`

**Checkpoint**: 双击 index.html（file:// 协议）控制台零报错零跨域警告（D-01 验收核心）；`window.STM` 各挂载点就绪

---

## Phase 3: Milestone 1 — 核心循环 MVP（User Story 1，Priority: P1）🎯 MVP

**Goal**: 可玩的基础滑块三消、交互手感定型（plan.md M1 全部条目 + Δ4 架构埋点）

**Independent Test**: 烟雾关完整通关一次——点击滑块 → 观察飞出/受阻弹回 → 槽内归拢与三消 → 爆槽判负或清空棋盘判胜

### RulesEngine 核心规则（无机制版）for US1

- [x] T008 [US1] Implement `init` / `canTap` / `enumerateTaps` in src/core/RulesEngine.js: init(level)→EngineState（N×N board、tiles 深拷贝+id=TileSpec 索引、dock/staging 空、cfg/lives 应用）；canTap 谓词=滑块在棋盘/暂存区 且机制状态可点（机制谓词留 M2 扩展点；**射线畅通性不属于 canTap**——受阻滑块仍可点击，点击后弹回）；enumerateTaps 枚举可行 tap 目标 id
- [x] T009 [US1] Implement applyTap 射线行走与 blocked/fly-out 分支 in src/core/RulesEngine.js: Step1 从 (r,c) 沿 d 逐格行走到棋盘边缘，首个被占格=阻挡点；Blocked 分支→前冲动画数据（path/blockedAt）+ damage=cfg.damageOnBlock?1:0（生命扣减由 GameState 记账）；无阻挡→Fly-out（滑块移出棋盘）；TapResult 结构 per rules-engine.md §5（type/tileId/path/events，事件顺序=发生顺序）
- [x] T010 [US1] Implement Dock 归拢插入与三消结算 in src/core/RulesEngine.js: 飞入滑块插入位置=已有同花色紧邻（无同花色→dock 末尾空位，FR-004）；插入后该花色计数==3→三消结算循环（可多组同时、循环至无）→ 腾出 3 槽位 + 'match'/'remove' 事件（FR-005）；**dock 满 7 时飞入先结算三消再判负**（Edge Case「三消优先于爆槽」，rules-engine.md §3.4）
- [x] T011 [US1] Implement terminal() 基础版 in src/core/RulesEngine.js: won=棋盘滑块==0 且 dock==0（M2 将扩展 staging，Δ3）；lost_burst=dock.length==7 且无任何花色计数==3（结算后态）；lost_lives=lives≤0；deadlockSuspect 占位返回 false（M2 实现保守谓词）
- [x] T012 [US1] Implement snapshot/restore 深拷贝对 in src/core/RulesEngine.js: structuredClone{board 滑块态, dock, staging, items, combo, score, lives}（**运行时 dock 保序**——D-07 规范化仅限 Solver 哈希）；棱镜与 TileSpec 静态部分不入快照（不可变）——Undo 与 Solver 回溯共用（rules-engine.md §8）
- [x] T013 [US1] Implement validateLevel 基础校验 + renderProbe in src/core/RulesEngine.js: `LEVELS[i].id===i+1` 连续、tiles.length%3===0 且 ≥6、无 (r,c) 重复、4≤n≤8、每花色计数%3===0、solutionMoves 引用合法 tile id；renderProbe 输出 Renderer 渲染快照（§8 轻量视图，仅浏览器构建含）

### GameState / Renderer / Audio / 数据 / 集成 for US1

- [x] T014 [US1] Implement createSession 状态机 in src/core/GameState.js: LOADING→READY⇄ANIMATING→SETTLING→READY / WON|LOST_BURST|LOST_LIVES|LOST_DEADLOCK（data-model.md §7 状态机）；输入锁（ANIMATING/SETTLING 期间 tap 忽略+短提示音）；级联动画时长上限 1.2s 超时强制结算解锁；session.reset()；onEvent/onTerminal 回调契约（game-session.md §2）；**不实现任何规则**（纯编排层）
- [x] T015 [US1] Implement tap() 编排/记账/快照栈 in src/core/GameState.js: 调 RulesEngine.applyTap；每原子回合前 snapshot 入栈（Undo 基础设施）；计分=match×(comboBase+combo×comboStep)、连击窗口=连续三消间隔 <1.5s；blocked damage 写回 EngineState lives；state() 只读视图 {phase,score,combo,lives,items,dock,staging,board}；onRail()（自加载以来动作序列==solutionMoves 前缀——M4 Hint/Bot 基准）
- [x] T016 [P] [US1] Implement BoardRenderer 基础设施与 8 花色表 in src/render/BoardRenderer.js: rAF 脏检查主循环；canvas 尺寸=clientWidth×devicePixelRatio（8×8 时格宽 ≥40 CSS px）；花色固定表（颜色+图形双编码，色盲可辨）: 0 赤#E5484D▲ / 1 橙#F76B15◆ / 2 金#FFC53D★ / 3 草绿#46A758■ / 4 青#00B8D9● / 5 天蓝#3E63DD▼ / 6 紫#8E4EC6⬡ / 7 品红#D6409F✚；暗底 #1B2430 / 格线 #2A3644；每色明度差 ≥2:1 于底色（game-session.md §4 固定契约）
- [x] T017 [US1] Implement 棋盘绘制与核心动效 in src/render/BoardRenderer.js: 格线/滑块/白色箭头（指 d 方向）；飞出=沿 path 位移+缩放淡出；受阻=前冲-回弹+棋盘 CSS shake；三消=3 chip 聚合爆闪+Canvas 粒子（花色色粒子 12~20 个/次、单帧 ≤200）；订阅 session 事件驱动重绘
- [x] T018 [P] [US1] Implement SoundManager 核心音效 in src/audio/SoundManager.js: 首次 pointerdown 惰性创建 AudioContext+resume（autoplay 政策）；Web Audio 纯合成（振荡器正弦/方波/三角扫频+白噪声 buffer+DynamicsCompressor）；M1 音色: click(880Hz 短方波)/flyout(上行扫频)/blocked(120Hz 三角+噪声冲击)/match(三音上行琶音、连击数调制音高)/victory/defeat；setMuted(bool)
- [x] T019 [P] [US1] Author 3~5 手工烟雾测试关 in src/data/levels.js: schema 与最终契约完全一致（level-data.md §2 全字段含 name/chapter/theme）；4×4 起步、覆盖不同花色数；每关内嵌手工求解的 solutionMoves（回放必胜）；含 1 关花色数 ≥4（可演示 7 格爆槽——每花色未成三最多滞留 2 个，≥4 花色才可能填满 7 格）+ 全部 damageOnBlock:false（第 1 章受阻不扣命）；完成后以 validateLevel 自检（依赖 T013）
- [x] T020 [US1] Implement boot 流程与 LEVELS.length 动态化 in src/main.js: DOMContentLoaded→读 STM.LEVELS / `?level=N` 深链（1≤N≤LEVELS.length 钳制）→ createSession(LEVELS[N-1]) → 挂 Renderer/Sound；**一切关卡总数引用动态取 LEVELS.length（Δ4 架构埋点，禁止硬编码 50）**
- [x] T021 [US1] Implement HUD/Dock DOM 视图与结算浮层 in src/main.js: HUD 数值绑定（关卡名/编号、生命 ♥×3 DOM、连击/分数）；Dock 7 格 chip 渲染（同花色归拢视觉，DOM+内联 SVG）；结算浮层: won→「下一关」（id+1>LEVELS.length→终局占位提示）/「重玩」、lost→「重玩」（lives 重置）；输入统一 pointerdown/pointerup（**禁 touchstart/mousedown——宪章 IV 红线**）
- [x] T022 [US1] **Checkpoint M1（验收门）**: 逐条执行 quickstart Q1.1~Q1.7（射线畅通飞出/受阻弹回/三消/胜利结算/爆槽判负/首点 30s 内有效飞出 SC-005 路径/8 花色灰度模式下仅凭图形可辨）；US1-AC1~AC5 全过；烟雾关完整通关；file:// 双击零控制台报错；受阻不扣命。**未全过不得进入 M2**

---

## Phase 3.5: Milestone 1.5 — 核心可玩性与视觉升级（M1 试玩反馈驱动，Δ7 多层堆叠）

**Purpose**: 单层棋盘可玩性低且空旷——引入多层堆叠 + 商业化视觉质感 + 高密度强阻挡关卡

**验证**: Node 全量回放门禁（validateLevel + solutionMoves 逐关 replay 必胜 + Δ7 堆叠语义断言），exit code 机判

- [x] T-M15.1 [US1] RulesEngine 多层堆叠语义（Δ7）in src/core/RulesEngine.js: TileSpec 可选字段 z:0|1|2；board[r][c] = 栈数组（底→顶）；canTap 仅栈顶可点（isTopOfStack）；removeFromBoard 弹栈 + reveal 事件（{e:'reveal',id,r,c,z}）；栈非空即阻挡射线（castRay 格占据判定不变——栈数组真值即占格）；snapshot/restore/rebuildBoard 按 z 升序重建栈；validateLevel 校验「同格同层不重复」「堆叠深度 ≤3」；renderProbe 输出 z + stackDepth
- [x] T-M15.2 [US1] GameState/renderer 集成 Δ7 in src/core/GameState.js + src/render/BoardRenderer.js: GameState 事件流透传 reveal（events 数组原样 emit）；Renderer handleEvent 处理 reveal → revealAt 表驱动上浮动画（REVEAL_MS 380 + 延迟让位）；hitTest 仅命中该格最高 z 滑块
- [x] T-M15.3 [US1] BoardRenderer 立体奶油牌面视觉升级 in src/render/BoardRenderer.js: 牌面 #FFFDF9 渐变 + 暖棕厚度底座（堆叠越深越厚）+ 花色描边高光；8 种水果/麻将花色（草莓/甜橙/菠萝/奇异果/蓝莓/葡萄/蜜桃心/翡翠竹——贝塞尔+径向渐变+高光点，每个 ≤15 行 Canvas API）；胶囊形方向箭头徽章（花色 deep 色 + 白色人字）；堆叠错层偏移 + 左上角层角标 + 点阵格线；chipSVG 水果简化图形
- [x] T-M15.4 [US1] 重制 M1.5 高密度测试关 in src/data/levels.js: 5 关全部 5×5~6×6、填充率 72~83%（21/24/30/33/33 滑块）、中心多层堆叠（1~4 格双层 + L5 塔芯）；链式剥洋葱拓扑——初始被阻挡/不可直飞滑块占比 90~94%（远超 70% 门禁）；全部 validateLevel 通过 + solutionMoves Node 回放必胜（terminal=won）；全部 damageOnBlock:false
- [x] T-M15.5 契约同步: rules-engine.md（Δ7 堆叠语义 §0/§2/§5 reveal 事件）、level-data.md（z 枚举字面量 + schema 示例）、game-session.md（M1.5 花色表/滑块视觉契约）已更新；Node 验收脚本全绿（L1~L5 validate+replay+堆叠断言 PASS，exit 0）

### M1.6 根基修复（用户试玩验收反馈：Bug 1 死局渲染缺陷 + 底层满铺铁律 + 100% 回放自检）

**Purpose**: 用户试玩 M1.5 版本发现 3 个根基问题——①第一关剩 2 个绿块无法消除（根因=BoardRenderer reveal 动画缺陷致下层滑块隐形）；②棋盘底层出现空洞格；③关卡数据需 100% 机判回放必胜（严禁脑算手写）

**验证**: Node 机判三层——validateLevel（含新增 z=0 满铺硬校验）+ solutionMoves 逐关回放 won/零残留 + 解析不变量（pre[i]⊆{j<i}）与 2000 局对抗性随机模拟零死锁 + GameState 会话层 e2e 全管线 PASS

- [x] T-M16.1 BoardRenderer 渲染缺陷修复（Bug 1 真因）in src/render/BoardRenderer.js: ①draw() animSet 不再跳过 reveal 目标滑块（原 animSet 跳过+动画层 continue → 下层滑块 560ms 隐形且动画结束无末帧重绘 → 永久隐形=「剩 2 块绿滑块找不到」）；②tick() 动画到期置 dirty 强制末帧重绘；③tileById 增加 tileInfo 视觉缓存（removed 滑块动画仍可绘制——修复飞出/三消动画从未绘制缺陷）；④blockSet 仅弹回滑块跳过静态层（防双绘重影）；⑤reveal 延迟期下沉待命位（消除静止→跳落突跳）
- [x] T-M16.2 RulesEngine.validateLevel 底层满铺硬校验（根基规范 2）in src/core/RulesEngine.js: N×N 每格 (r,c)（除棱镜格）底层 z=0 必须 100% 铺满——空置黑洞格报错「底层 z=0 未满铺: 空洞格 (r,c)」；后续 M3 生成器沿用同一铁律
- [x] T-M16.3 关卡数据 M1.6 根基重制 in src/data/levels.js: 5 关改为满铺剥洋葱确定性构造（外圈→内圈逐环剥离；堆叠格 z 顶→底入序；方向=最近边——射线只穿更外环已清空格）：L1/L2 5×5=30 滑块（底 25+叠 5 / 底 25+塔 2+叠 3）、L3 6×6=42（底 36+叠 6）、L4 6×6=45（底 36+塔 6+叠 3）、L5 6×6=48（底 36+塔 8+叠 4）；每花色计数恒 %3===0（L1-L3/L5 花色×6、L4 花色×9）
- [x] T-M16.4 100% 回放自检（根基规范 3）: 独立 Node 机判——L1~L5 validateLevel 全过（含 z=0 满铺断言 25/25、36/36）+ solutionMoves 回放 terminal=won、棋盘残留 0、Dock 残留 0、全程 flyout 零受阻 + 解析不变量 pre[i]⊆{j<i}（任意玩法零卡死证明）+ 每关 2000 局对抗性随机模拟 stuck=0 + GameState 会话层 e2e（完整 tap 管线/动画锁/三消计数）ALL PASS

### M1.7 Δ8 分层立体阻挡（Layer-Aware Raycasting）——用户规则设计修正

**Purpose**: 多层堆叠的射线阻挡按层高 z 分层计算——高层滑块直接从低层滑块头顶凌空飞越（否则多层堆叠失去立体空间意义）；视觉上飞行动画保持层高 + 投影（「二楼牌从一楼牌头顶飞出」）

**验证**: `node tools/solver.js --engine-selftest`（含 Δ8 分层阻挡断言组）全绿 + 5 关回放必胜 + 解析零死锁证明 + 会话 e2e

- [x] T-M17.1 RulesEngine Δ8 分层射线 in src/core/RulesEngine.js: `castRay`/`buildPath` 增层高参数——前方格栈顶 `z_target < z_self`（含空格）凌空飞越不阻挡、`z_target >= z_self` 同层/高层阻挡、棱镜全层高柱体恒阻挡；`applyTap`/`tapPrism` 调用点与折射续走全部层高感知；validateLevel 新增「塔式堆叠层号连续（z=2 须有 z=1 垫底，禁悬空层）」校验
- [x] T-M17.2 BoardRenderer 凌空飞越视觉 in src/render/BoardRenderer.js: fly 动画 z>=1 保持层高——上移偏移（0.22×z cell）+ 起飞放大渐收（近镜头感）+ 地面椭圆暗影投影（随高度虚化）；block 弹回动画同带层高偏移
- [x] T-M17.3 关卡立体牌阵重制 in src/data/levels.js: 满铺 z0 底盘（剥洋葱序）+ 中央 z1/z2 塔阵——对射塔对（同层互挡，先解挡路者）+ 凌空塔（z1 顶朝最近边从底盘头顶飞越）+ z2 圣殿塔（z2 顶飞出揭示 z1 垫层再揭示 z0 基）；塔顶移除序按「同层射线依赖」拓扑排序（确定性：依赖满足者字典序最小优先）；flyOvers 实测 1/3/2/3/1（凌空飞越真实发生）；回放 reveal 5/5/6/9/12
- [x] T-M17.4 T038 自测骨架（部分实现，M2 补机制断言）in tools/solver.js: `--engine-selftest` 实装 6 组断言——转向加法全 4 向、棱镜 8 映射、Δ8 分层立体阻挡（z1 凌空 z0 行/z1 同层互挡/z0 经典阻挡保留/z2 飞 z1 塔+reveal 级联/棱镜全层高）、三消优先于爆槽、Δ3 胜利条件（staging 残留非胜）、快照/restore 等价；gear/ice/chains 断言组留 M2（T038 完成时补齐）
- [x] T-M17.5 契约同步: rules-engine.md（§0 Δ8 分层阻挡五条 + §3.1 层高口径）、level-data.md（z 字段行）、game-session.md（Δ8 凌空飞越渲染契约）；Δ8 零死锁验证——解析 pre[i]⊆{j<i} 层高感知口径成立 + 每关 2000 局对抗模拟 stuck=0 + 会话 e2e 5/5 PASS

---

## Phase 4: Milestone 2 — 四大机制与道具 + 规则冻结（User Story 3 + US4 道具，P2/P3）

⚠️ **GATE**: 依赖 T022（M1 验收门）通过。目标：完整规则语义落地、全部 Edge Cases 验证、**冻结 RulesEngine**。

**Goal**: 齿轮/冰封/锁链/棱镜四机制（Δ1/Δ2）+ 三道具与暂存区（Δ3）语义落地

**Independent Test**: 单机制测试关（L6+/L16+/L26+/L36+ 档位语义）逐个验证触发、反馈与机制交互；任意关逐个道具验证效果与次数限制

### RulesEngine 机制扩展 for US3/US4

- [x] T023 [US3] Implement 齿轮滑块（Δ1/FR-013）in src/core/RulesEngine.js: applyTap Step4a——飞出结算后对每个齿轮滑块 g，若被移除滑块 t 与 g 十字相邻（|Δr|+|Δc|==1）→ g.d=(g.d+1)%4 + {e:'gear',id,from,to}；对角滑块飞出**不**触发；**不实现地面转向垫（Δ1：机制 A 仅保留 Gear Tile）**；转向结果 UI 即时可见（事件驱动渲染）
- [x] T024 [US3] Implement 冰封滑块（FR-015/016 引擎部分）in src/core/RulesEngine.js: canTap 拒绝 ice>0（即使前方畅通）；冰封滑块照常阻挡射线（Step1 被占格判定）；Step4d 破冰联动按 cfg.iceMode——'triple'（主口径）: 每次三消全场所有 ice>0 各减 1、归 0 清冰封标记；'adjacent'（变体）: 仅与本次飞出滑块 t 十字相邻的冰封滑块 ice--；TileSpec 冰厚 x≥1（关卡可配更厚）；{e:'ice',id,from,to}
- [x] T025 [US3] Implement 钥匙与锁链（FR-018/019）in src/core/RulesEngine.js: locked 滑块固定原地不可 tap 且阻挡射线；applyTap Step4b——t 为钥匙（m=='k'）时对 cfg.chains 中每个含 t 的配对移除该钥；某锁的**任一**配对钥集全飞出 → 该锁 unlocked 解锁（或语义，一钥多锁/多钥配一锁均支持）；{e:'unlock',id,by}；chains 边表格式 [[keyTileId,[lockedTileId,...]],...]
- [x] T026 [US3] Implement 变向棱镜（Δ2/FR-021/022）in src/core/RulesEngine.js: applyTap Step1b/Step3——射线遇棱镜格: 新方向=反射表[prism.t][dir]，从棱镜格沿新方向续走；新射线畅通→prism-flyout（path 含折射折点，渲染折线动画）；新射线受阻挡（**含第二个棱镜**）→弹回原位（**单次飞出至多 1 次折射**，FR-022）；棱镜格阻挡「不折射的直行」（固定、不可移走、非滑块）
- [x] T027 [US3] Implement 原子级联管线整合 in src/core/RulesEngine.js: Step4 派生事件顺序固定 4a 齿轮→4b 钥匙→4c 入槽→4d 三消循环（三消→破冰联动，三消不产生新飞出）；**同一次 applyTap 返回前级联全部结算完毕**（Edge Case「同一点击内连环触发」的确定性解）；原子性契约=调用方以 applyTap 返回为「一回合」边界
- [x] T028 [US3] Implement deadlockSuspect 保守谓词（D-09/FR-006）in src/core/RulesEngine.js: 疑死锁当且仅当——enumerateTaps 试算无「飞出型 tap」（flyout/prism-flyout，纯谓词试算不产渲染事件）且无道具可用（wrench 可用即非疑——扳手可解互锁；stage 可用且 staging 未满同理）且非「ice>0 且 dock 内存在某花色计数 ≥2」（三消可解冻）且非「存在 locked 且场上存在钥匙」（可解锁）；**仅给谓词，复证搜索由调用方执行**（rules-engine.md §7.4）
- [x] T029 [US3] Extend validateLevel 机制不变量 in src/core/RulesEngine.js: 机制标记 m 单选互斥（D-11: 'g' XOR 'i' XOR 'c' XOR 'k'）；ice 滑块 x≥1；prisms 与 tiles 不重叠、无对射循环布局（FR-022）；cfg.chains 键指向 m=='k' 滑块、锁指向 m=='c' 滑块、无自环无空配对；iceMode∈{'triple','adjacent'}；校验失败→控制台错误+跳过该关（不静默）
- [x] T030 [US4] Implement 道具引擎语义（Δ3/FR-024/026）in src/core/RulesEngine.js: applyItem(state,'wrench',tileId)→(d+1)%4，**仅普通与齿轮滑块可用**（冰封/锁链返回 invalid，FR-024-2）；applyItem(state,'stage')→dock 内前 k 个滑块（k=min(3,staging 余量)）移入 staging、staging 满 3 时 invalid（FR-026）、**无自动回填（Δ3 取消）**、滑块保留 id/花色；stageTile(state,tileId)→staging 滑块点击飞入 dock 尾（无射线判定，「无阻挡自由牌」）；canTap 扩展：staging 内滑块恒可 tap；terminal won 扩展=棋盘==0 **且 staging.length==0 且 dock.length==0（Δ3 胜利条件）**

### GameState 道具编排 for US4 / 死局调度 for US3

- [x] T031 [US4] Implement useItem 编排与 Undo 级联回滚 in src/core/GameState.js: session.useItem('undo'|'wrench'|'stage', tileId?)；道具次数递减（cfg.items 拷贝，余量 0 禁用）；undo=弹快照栈 RulesEngine.restore + 发全量重绘事件（快照取于原子回合前→**一次回滚整条级联链**，含旋转/破冰/解锁/三消派生，FR-024-1）；扳手进入目标选择交互态
- [x] T032 [US4] Implement tapStaged 与暂存区状态 in src/core/GameState.js: session.tapStaged(tileId)（Δ3 回填 tap）；state() 视图扩展 {staging, items 余量}；暂存区满（3）时 stage 道具不可用判定（FR-026）；暂存区滑块数与内容 UI 可见
- [x] T033 [US3] Implement 死锁复证搜索器与终局调度 in src/main.js + src/core/GameState.js: 有界 DFS 搜索器（动作集=enumerateTaps ∪ tapStaged ∪ 可用道具动作——**与 Solver 动作集同构**；M2 先取保守预算，M4 按 level-pipeline.md §5 校准至 100k 节点/300ms）；GameState 疑死锁信号→触发复证，复证失败才 onTerminal({kind:'lost_deadlock'})——**防误杀**（Edge Case「互锁死局检测误报」，D-09）

### 渲染/音效/测试数据 for M2（可与引擎链并行）

- [x] T034 [P] [US3] Implement 机关视觉与机制动效 in src/render/BoardRenderer.js: 齿轮角标（滑块右上小齿轮图形+底色描边）；冰封=半透明冰蓝覆盖+冰层厚度数字/裂纹层数（FR-017）；锁链=格四角链条角标；钥匙=左上钥匙角标+（hover/选中时）链路提示线连向配对锁（FR-020）；棱镜=格内粗斜杠条（/ 或 \）+边框高亮（与滑块/普通障碍显著区分，FR-023）；动效: 齿轮 90° 旋转过渡（UI 即时可见）、破冰碎裂粒子（白蓝）、棱镜折线路径动画
- [x] T035 [P] [US4] Implement 暂存区 UI 与道具栏 in src/main.js + css/style.css: #staging 3 格（Dock 上方）——暂存滑块可 pointerdown 点击→飞入 Dock（无自动回填的交互补偿）；#items 3 键道具栏（次数角标、不可用禁用态、暂存满 3 时 stage 禁用）；Undo/扳手/暂存三道具交互流（扳手目标选择模式、取消路径）
- [x] T036 [P] [US3] Implement 机制与道具音效 in src/audio/SoundManager.js: gear/unlock/iceBreak/prism（各自固定扫频签名）+ item/undo（下行）；事件→音效映射经 GameState onEvent 转发（game-session.md §5 全表：click/flyout/blocked/match/gear/unlock/iceBreak/prism/undo/item/victory/defeat/botTick 预留）
- [x] T037 [P] [US3] Author 机制专项测试关 in src/data/levels.js: 每机制 ≥1 关（齿轮/冰封/锁链/棱镜各 ≥1）+ 级联关（飞出→齿轮转向→新路径解锁）+ 边界关: 三消优先爆槽（7 满飞入第三同花色）、破冰双口径（triple 与 adjacent 各 1 关）、一钥多锁全链解锁、折射后仍阻挡→弹回（单次折射上限）、冰封作纯阻挡、暂存满道具不可用、扣命关（damageOnBlock:true+lives 低位演示 lost_lives）——**覆盖 spec Edge Cases 清单逐条可复现**；均过 validateLevel
  * ✅ 承接口径（M3 后）: levels.js 已被流水线整体替换（T049/FR-031 禁止手改），Edge Cases 逐条可复现职责由 T038 引擎自测断言集（--engine-selftest 11/11 全绿，内嵌 fixture 覆盖齿轮十字触发/破冰双口径/chains 或语义/三消优先爆槽/原子级联/快照 restore/Δ3 胜利条件/死锁不误杀）+ M3 流水线结构性保证（对射拒绝 T047/开放花色 ≤5 Solver 门/钥匙可达 T046 逆序结构性保证）等价承接；量产 50 关本身每机制 ≥1 关（gear@L6+/ice@L11+/chain+key@L21+/prism@L31+，mech-first-appear 已验证）
- [x] T038 [US3] Implement 引擎自测模式 in tools/solver.js: `node tools/solver.js --engine-selftest`——require('../src/core/RulesEngine.js')（UMD 双导出在 Node 侧首次实证）；断言集 per rules-engine.md §9: 转向加法 (d+1)%4 全 4 向、棱镜 8 映射、齿轮十字邻接触发/对角不触发、破冰双口径、chains 或语义、三消优先于爆槽（7 满飞入第三同花色）、原子级联（飞出→齿轮→解锁→入槽→三消→破冰一次 applyTap 全结算）、快照/restore 等价、Δ3 胜利条件（staging 残留非胜）、死锁谓词不误杀（齿轮在场即疑、扳手可救即非疑）；场景 fixture 内嵌于自测代码；断言失败 exit 1
- [x] T039 [US3+US4] **Checkpoint M2（⛔ 规则冻结 FREEZE）**: quickstart Q2.1~Q2.10 逐条通过（齿轮/冰封/钥匙/棱镜/原子级联/三消优先爆槽/Undo/扳手/暂存区/引擎自测）；US3-AC1~AC7、US4-AC1~AC3 全过；spec Edge Cases 在 T037 测试关逐条复现（原子级联与整体 Undo/死锁不误杀/棱镜单次折射/暂存满）；`node tools/solver.js --engine-selftest` 全绿 exit 0；**⛔ 冻结 RulesEngine.js 语义——此后任何规则改动须全量重跑 M3 流水线并重验全部关卡（FR-031）**

> **Δ9 变更记录（试玩反馈驱动——暂存区整体移除）**: T031~T039 完成后试玩发现「点击暂存区滑块触发滑块复制分身（1→2）破坏花色守恒导致无法消除的死局 Bug」+ 双排空槽视觉冗余。决议：**彻底删除暂存区（Staging Area）与第 3 道具「移出槽位（stage）」**——T030/T032/T035 中的 staging 相关实现全部移除（tapStaged/applyStageReturn/stageTile/applyItem('stage')/STAGING_CAP/#staging DOM/item-stage 按钮/solver stage 动作与断言），道具仅剩 Undo/Wrench；胜利条件回到「棋盘+Dock 全清空」。滑块流转严格单向守恒「棋盘→Dock→三消」，或经 Undo 快照整体回滚。**FR-031 已履行**: 引擎语义变更 → 全量重跑 M3 流水线（seed 2026 重生成 + solver 全量门禁 50/50 exit 0）+ engine-selftest 11/11 全绿。

> **Δ10+Δ11 变更记录（试玩反馈驱动——无锁连点 + 大棋盘波浪架构，2026-10-19）**:
> **Δ10 无锁连点**: 试玩发现「别急，动画中…」输入锁打断 Rapid Tap 爽感。改造：① GameState 删除 ANIMATING/SETTLING 相位与 lockForAnimation（MAX_ANIM_MS 1.2s 上限锁、animTimer）——tap() 在 READY 态 0ms 瞬时结算 applyTap，级联原子结算完毕立即 judgeTerminal；② main.js 删除 input-locked Toast「别急，动画中…」与 tick 提示音、删除 onBoardDown 400ms 兜底 setTimeout——仅终态拦截棋盘点击；③ Renderer 动画本就并发非阻塞（anims 数组多动画并存）+ hitTest 恒测逻辑态栈顶。顺手修复：引擎破冰事件名 'ice' 从未被 main.js/renderer 监听（监听 'iceBreak' 恒不匹配）→ 双侧对齐（main.js/BoardRenderer 处理 e.e==='ice'，音效映射 iceBreak 键）。验证：L1/L25/L38/L50 快速连点回放 phase=WON 零 input-locked、undo/扳手道具在无锁模式下正常。
> **Δ11 大棋盘波浪架构**: 5×5 小棋盘可玩性不足。重构 level-config CHAPTERS（5 章→3 阶段章）+ waveGrid/waveTiles/waveZMax 铁律函数：L1=5×5（30 块）、L2=6×6（45 块）、L3~50 严格 3 关一循环「2 简 1 难」（L5/L8/…/L50=8×8 挑战 16 个、其余 7×7 32 个）；tiles 前期 54~78 / 中期 63~90 / 后期 72~105（恒 %3）；zMax 前期 2~3 / 中期 3~4 / 后期 4~5（z∈[0,4] 深度≤5）；花色 3~8（8×8 挑战 +1 / 7×7 简单 -1）；机制 gear L6/ice L11/chain L21/prism L31（prism 从 L31 起真实首现——ch2 mechanisms.prism 修正开启）；受阻扣命中期起。validateLevel tiles 上限 128→150。generator: 降档不再缩 n（网格铁律优先）; 棱镜对射预检改真实同行/列/斜线拒绝; ice/chain/钥匙机制滑块结构约束「组内第 2/3 位」（修复大棋盘 openSuitsMax>5 跨组交错滞留根因）。solver: expandActions 启发式优先级排序（Dock 计数 2 三消 > 钥匙 > 高层 > 凑对 > id 序）; openSuitsMax 口径修正为「最优解路径上」（首解回放统计——原搜索全程口径在大棋盘 8 花色中途试探态必然超标，与契约「最优路径开放花色≤5」不符）; curveGates 门-2 改全章斜率、门-3 改 7/7/8 波浪锯齿（8×8 位显著 > 均值×1.05、7×7 位 < ×0.95——容差校准注记：实际简/难档分离 ≈10 分 >20% 相对差，单侧 8% 带与总体递进叠加时过紧）。BoardRenderer: 8×8 及 5 层适配（底座厚度/错层偏移按格宽分级收紧、层角标深度>4 改数字角标）。验证闭环：seed 2026 重生成 50 关零降档、solver 全量门禁 50/50 exit 0（chMonotonic/slope13.5/waveZigzag 全绿、metrics 双写一致）、engine-selftest 11/11、种子逐位复现（md5 一致）、FR-031 篡改捕获（改花色→exit 1、还原→exit 0）、Q3.3 抽查 5 关参数全符、L50 e2e（105 飞出/35 三消/38 reveal/20 齿轮/5 解锁/21 破冰 → WON）。levels.js 262KB（预算 ≤300KB）。文档同步：spec.md（US2/FR-008/FR-012/SC-004/机制档位 L11/L21/L31）、quickstart（Q1.8/Q3.3/Q3.4）、contracts 四件（rules-engine z 枚举 5 层+tiles 150、level-pipeline 波浪铁律+门禁表+启发式、game-session Δ10 输入锁+ice 事件名、level-data z 枚举+规模预算）、data-model（chapter 1~3/状态机 Δ10）。

> **Δ12 变更记录（Bug 修复——blocked-slider-vanish 渲染崩溃，2026-10-19）**: 试玩发现「点击受阻滑块触发 blocked 动画后贴图永久消失、逻辑状态正常」。根因（BoardRenderer 纯渲染层确定性崩溃链）：① tileById() 的 tileInfo 视觉缓存（m16 引入，本供已移除滑块飞出动画续绘）**缺 r/c 字段**——受阻滑块未移除必命中缓存 → ② drawAnim 的 block 分支读 t.c/t.r=undefined → NaN → ③ drawTileBody 内 roundRect/createLinearGradient(NaN) 抛 TypeError → ④ draw() 在 clearRect 已清屏且静态层已按 blockSet 跳过受阻滑块后崩溃 → ⑤ frame() 末尾 rAF 重排程不可达 → **渲染主循环永久死亡**（Δ10 删 400ms 兜底重绘后无复活路径；用户再点消失滑块→再 blocked→再崩→自我续命）。同根潜伏缺陷一并修复：gear/unlock 动画同路径同崩溃（齿轮/钥匙联动时全部动画冻结）、ice 碎裂动画坐标 NaN 静默不可见（破冰特效自 T034 引入从未生效）、冰封覆层厚度读取字段名错位（t.x → 运行态 t.ice，FR-017 厚度角标恢复显示）。修复：refresh() 缓存条目补全 r/c/m/ice 全量绘制字段（一处写入收口四条路径）；drawTileBody 冰层读取改 t.ice 优先；frame() draw() 包 try/catch+finally 重排程（纵深防御——单帧异常仅丢一帧、rAF 不死，异常 console.error 留痕）。回归史：m16(63cd701) 引入缓存+blockSet（当时有 400ms 兜底，表现为闪灭）→ Δ10(490c870) 删兜底后恶化为永久消失。验证：新增 tools/render-selftest.js（零依赖 Node 冒烟——浏览器契约级 canvas 桩含渐变/路径坐标有限性校验（Chrome 同款抛错）+ 手动 rAF 泵 + 事件流复刻 main.js handleSessionEvent 语义，覆盖受阻滑块全动画窗口/连点/gear+unlock+ice+fly 并发/棱镜折射/冰层角标/逻辑态无扰，21/21 全绿）红绿双向验证（git stash 旧代码复现 4 项崩溃+红、修复后全绿）；engine-selftest 11/11 回归通过；node --check 语法通过。评估/修复报告存档 .specify/bugs/blocked-slider-vanish/（assessment.md + fix.md）。FR-031 不触发（纯渲染层，levels.js/level-config/RulesEngine 引擎语义零变更）。

> **Δ13 变更记录（关卡增量扩容 50→60 关——3×20 大阶段 + 20 个「简-简-难」循环，2026-10-19）**: 用户指令扩容并附**最高优先级铁律（严禁全量重生成）**——原 50 关 tiles/prisms/cfg/solutionMoves 100% 原封不动保留。实施：新增 **tools/expand-60.js 增量拼接工具**（新 L1/L2 = 原样复用；新 L3 = 单独新生成 7×7 新手循环 1 困难关（57 块、z0 满铺+局部 2 层、无机关、不扣命）；原 L3~L50（48 关）平移为新 L4~L51 **仅改 id(+1)/chapter(3×20 重排)/name 编号**——JSON 深比较逐位一致验证；新 L52~L60 尾部新生成 9 关（循环 18~20: 7×7/7×7/8×8，全机制 + 105 块 8×8 终极挑战），10 新关均走 Generator 三重验证（逆向构造→正向自检→Solver 门禁）+ 内嵌 Solver 最优解）。level-config Δ13: 章区间 ch1[1,20]/ch2[21,40]/ch3[41,60] + waveGrid/wavePos/waveTiles/waveZMax 锚点 (id-4)%3==2（挑战位 L6/L9/…/L51/L54/L57/L60 共 19 个 8×8——与平移数据及新增循环 18~20 精确对齐）+ mechFrom +1 平移（gear7/ice12/chain22/prism32）+ 阶段带边界 L16→17/L35→36 重排。solver: 曲线门-3 波浪锚点同步 (id-4)%3==2 + 波浪统计域 L4+（L1~L3 新手循环不计入）+ dScore 归一域注记 60 关。验证闭环：拼接后 **60/60 solvable exit 0**（chMonotonic=true 24.70/57.05/70.05 三章均值单调 + slope14=12.60 + waveZigzag=true spike 60.42/valley 48.92）+ metrics 双写一致（门 ⑦ 60 关全过）+ 平移关 48/48 JSON 深比较 bit-exact + engine-selftest 11/11 + render-selftest 21/21 + FR-031 红绿双向（篡改新 L3 花色→exit 1→还原→exit 0）+ seed 2026 逐位复现（expand-60.js 确定性）。levels.js 314.8KB（Δ13 预算放宽 ≤330KB 契约已同步）。L55 个位 5 触发 relax 蝶翼主题（FR-012 解压爽关 = 简关变体，语义符合「简」）。文档同步：spec.md（US2/FR-008/FR-027/FR-031/实体/SC-001/002/004 + Δ13 拼接铁律条款）、level-data.md（LEVELS.length=60 + 规模预算 330KB + 章节注释）、level-pipeline.md（Δ13 章表/波浪铁律/门禁表/拼接流程注记）、data-model.md（60×/chapter/damageOnBlock 注记）、quickstart.md（Q3.1/Q3.3/Q3.5/Q4.6/Q8 + 命令速查）。前端零改动（Δ4 动态 LEVELS.length 实证——HUD/进度钳制/终局判定全自适应）。

---

## Phase 5: Milestone 3 — 离线 Generator/Solver 与 50→60 关量产（User Story 2，Priority: P1）

⚠️ **冻结门**: 仅当 T039（M2 规则冻结）通过后方可开始——Generator/Solver 与前端共用同一 RulesEngine 口径（FR-032/D-02），规则未冻结即量产 = 口径漂移 → 全量返工重验。**严禁在 M1/M2 未验证前提前生成大批量关卡。**

**Goal**: 参数表驱动的可解性流水线（Δ5），产出并 100% 验证 50 个标准关（Δ6/C-5）

**Independent Test**: `node tools/generator.js --seed 2026` 量产 → `node tools/solver.js` exit 0（50/50 + 全门禁）→ solver-report.json 与 levels.js 内嵌 metrics 交叉一致

### 章节参数表（Δ5）for US2

- [x] T040 [P] [US2] Implement 章节参数矩阵 in tools/level-config.js: 导出 CHAPTERS 可扩展数组（**追加条目即新增章节，前端永不引用**，Δ5）: 第 1 章 L1-10 grid[4,5] suits[2,4] tiles[6,18] gear 于 L6-10 引入 / 第 2 章 L11-20 grid[5,6] suits[4,5] tiles[15,24] 引入 ice / 第 3 章 L21-30 grid[6,6] suits[5,6] tiles[21,30] 引入 chain、damageOnBlock=true / 第 4 章 L31-40 grid[6,7] suits[6,7] tiles[27,36] 引入 prism 与 ice/gear 混排 / 第 5 章 L41-50 grid[7,8] suits[7,8] tiles[33,45] rhythm 节奏模板（个位 4/9=挑战关: 参数取区间上界+机制密度高+冰厚上探；个位 5/0=解压爽关: 对称图案 theme 模板 ring/butterfly/diamond/heart 之一+tiles 取下界+dockPeak 目标 ≤3；其余位常规插值，FR-012）；难度评分权重 score=round(1.0·norm(minMoves)+0.8·(1-norm(solutionCount))+1.2·norm(dockPeak)+1.5·mechCount+0.5·norm(tiles)+0.7·norm(suits))×10（norm=50 关全域 min-max 归一）；Solver 预算 budget{nodes:2_000_000, ms:60_000}；加载时校验章区间无空洞无重叠

### Solver（回溯求解器 + 验证门禁）for US2

- [x] T041 [US2] Implement Solver 搜索核心 in tools/solver.js: 迭代加深 DFS（初始深度=启发下界如「tiles/3+冰封组数」）+ 状态哈希去重（**dock 顺序规范化——哈希键用花色计数向量；staging 有序保留——Δ3 回填 tap 依赖滑块身份**，D-07）+ 节点/时限预算（章级 budget，默认 2M/60s 硬顶）；迭代加深保证首解即最优步数解
- [x] T042 [US2] Implement Solver 动作集与确定性 in tools/solver.js: 动作集=enumerateTaps ∪ tapStaged ∪ 道具动作（wrench 转向任意可转滑块、stage 移出）——**仅当最优解需要道具才计入 metrics.minMoves**；动作展开顺序固定（行优先、列优先，D-08）；xorshift128 种子化 PRNG（禁 Math.random，D-08）
- [x] T043 [US2] Implement Solver 指标产出 in tools/solver.js: minMoves（首解即最优）/ solutionCount（预算内不重复终局路径数，封顶 10k 记 ">=">=10000""）/ dockPeak（搜索全程 Dock 占用最大值 1..7）/ mechCount（按 tiles/prisms/cfg 实际出现计 0~4）/ openSuitsMax（最优路径上最大开放花色数）/ difficultyScore（T040 权重）；**metrics 双写 levels.js 与 solver-report.json**
- [x] T044 [US2] Implement Solver CLI 与质量门禁 in tools/solver.js: `node tools/solver.js`（全量验证 LEVELS）+ `--level N` 单关 + `--engine-selftest`（T038 既有）；**exit code 门禁**（非零即失败，FR-031/SC-001/SC-004）: ①可解性 `LEVELS.length/LEVELS.length` 关 solvable ②每关 validateLevel().ok ③结构约束（每花色计数%3==0、openSuitsMax≤5、无对射棱镜）④曲线门-1 各章 difficultyScore 均值随章号单调不减 ⑤曲线门-2 第 1~4 章 minMoves 线性回归斜率 ≥0 ⑥曲线门-3 第 5 章个位 4/9 关显著 > 章均值、个位 5/0 显著 <（锯齿形态）⑦报告 metrics 与 levels.js 内嵌 metrics 逐字段一致；solver-report.json schema per level-pipeline.md §3（schemaVersion/generatedAt/seed/nodeBudget/levels[]/summary{total,solvable,failedIds,curveGate{chMonotonic,slope14,ch5Zigzag}}）

### Generator（逆向生成器，三重验证 D-10）for US2

- [x] T045 [US2] Implement 逆向构造核心 in tools/generator.js: 轮数=tiles/3，每轮选一花色（保证计数 %3==0 且最优路径开放花色 ≤5 的启发式花色分配）→ 生成 3 个同花色滑块逐个「反向飞行」落位（反向射线=沿 d 反向从边缘/出口外推进到落位格；落位被占则换出口或换 d 重试，受限次后该滑块重掷）；**落位逆序=solutionMoves 逆序（后推入者先飞出）**；章/关参数由 CHAPTERS 插值
- [x] T046 [US2] Implement 机制逆操作镜像 in tools/generator.js: 齿轮（落位时约束「十字相邻更晚推入者存在 ⇒ 其方向须在那些滑块飞出后经若干 +90° 对准出口」）；锁链（**仅当其配对钥匙已更晚推入（=更早飞出）才允许落位**——钥匙可达性结构性保证 FR-019）；冰封（任意落位、冰厚独立于飞行——破冰后的正向时序在逆序上无约束）；棱镜（先行布置，滑块反向飞行路径可含 1 段折射）
- [x] T047 [US2] Implement 对射拒绝与正向自检 in tools/generator.js: 棱镜布置后预检——任意两条「滑块→棱镜→棱镜」可达路径即重掷棱镜布局（FR-022/Δ2 对射拒绝）；正向自检=RulesEngine.init + 逐 applyTap 回放构造解，断言 terminal=='won' 且全程 dockPeak≤7、开放花色 ≤5、无中途空棋盘残槽（FR-029）——镜像逻辑错误在此暴露；失败→该关回炉
- [x] T048 [US2] Implement Solver 门禁集成与重试降档 in tools/generator.js: 三重验证闭环（逆向构造→正向自检→Solver 门禁，D-10）；失败→参数扰动重生成（子种子 re-roll: 位置/花色分配/机制布置）；同关连续 5 次失败→降档（tiles/suits 降 1 档至章区间下界）重试+报告标记 degraded:true；CLI: `--chapters 1,2,3,4,5` / `--seed S` / `--out src/data/levels.js` / `--dry-run`；种子化 PRNG 保证 --seed S 逐位复现（D-08）
- [x] T049 [US2] Implement 流水线导出 in tools/generator.js: 按契约写 src/data/levels.js（**solutionMoves 来自 Solver 的最优解、非构造解——Δ6；构造解仅作门禁自检**；metrics 同步内嵌；UMD 双导出、按 id 升序、LEVELS[i].id===i+1）+ tools/solver-report.json（同批次生成）；文件头显式保证注释: 初始滑块数 ≥6 且 %3==0、钥匙解锁前可达、单滑块单机制、无对射棱镜；**整体替换 M1/M2 手工测试关**（levels.js 被流水线再生成，此后禁止手改——FR-031）

### 前端进关/持久化/终局 for US2

- [x] T050 [P] [US2] Implement 进度持久化 in src/main.js: localStorage["slide-triple:progress:v1"]={v:1, unlocked, last, best:{[id]:{score,combo}}, muted}（data-model.md §8）；**全访问 try/catch，失败降级内存进度（隐私模式可玩，D-03）**；加载时 unlocked/last 钳制 ≤LEVELS.length（Δ4 扩容自适应）；新会话自动进 unlocked 关；通关 unlocked=max(unlocked,id+1)、best 分更新
- [x] T051 [US2] Implement 结果屏与全通关终局 in src/main.js: won→「下一关」（id+1>LEVELS.length ⇒ **全通关庆祝终局**，动态关数）/「重玩」；lost→「重玩」（lives 重置）；muted 状态接入 SoundManager
- [x] T052 [US2] **Checkpoint M3（量产门）**: quickstart Q3.1~Q3.7 逐条通过（`--seed 2026` 逐位复现 / 全量验证 exit 0 / 参数矩阵抽查 L1,L15,L25,L35,L45 符合 FR-008 / curveGate 三门 / 自动进关+L50 全通关 / 刷新后进度延续+localStorage 不可用降级可玩 / 手改任一关→solver exit 1 捕获并更新报告）；SC-001 50/50 可解（附验证报告）；SC-004 难度曲线量化验证；US2-AC1~AC5 全过

---

## Phase 5.5: Milestone 3.5 — 万物出发：题材、视觉、背景与 BGM 全面升级（User Story 5，Priority: P2）✨ 表现层

⚠️ **GATE**: 依赖 T052（M3 量产门）通过。**纯渲染与音频层**——RulesEngine 规则语义、Solver 口径、levels.js 关卡数据（suit/花色数/坐标/solutionMoves）**零变更**（FR-032/FR-031/Δ13 保留铁律不破；FR-033 §3 渲染层映射消解口径）；US5 题材化经用户裁定记录于 spec 假设区（宪章 I 叙事包装禁项零触碰、宪章 III 程序化红线零突破）。

**Goal**: 45 种动态生灵/载具图鉴、3D 奶油白底座与流光方向角标、20 景生态背景、挑战关激励横幅、程序化治愈系 BGM（FR-033~FR-037、SC-007/SC-008）

**Independent Test**: 逐关抽查图案来自对应阶段图鉴池（同花色恒同图案）；20 景背景与 cycleIndex 严格对应；挑战位关开局 1.6s 横幅；首次交互后 BGM 自动播放且开关同步静音；`git diff src/data/levels.js` 为空 + engine-selftest 全绿回归。

**验证**: render-selftest.js 扩展 Δ14 断言组（纯渲染层机判，Node 零依赖——延续 D-14 三层验证体系）+ engine-selftest 回归 + quickstart 人工场景

- [x] T052a [P] [US5] 编写 45 种生灵与载具全彩矢量图鉴定义及离屏 Sprite 预渲染缓存（Δ14a/FR-033）in `src/render/bestiary.js`（新增）+ `src/render/BoardRenderer.js`: 图鉴三阶段各 15 种（Suit 0~14 陆地萌宠 / 15~29 碧海飞羽 / 30~44 奇幻远航，名称与清单严格照抄 spec FR-033 §1~§3）；每图案独立 Canvas 绘制函数（贝塞尔/径向渐变/高光点语汇，纯代码零图片——宪章 III）；**离屏 Sprite 缓存**——按 (suit, 渲染尺寸档) 绘制一次缓存为 offscreenCanvas 会话内复用（8×8×5 层满载 105 滑块 60fps 预算）；导出 `STM.Bestiary`（classic script，加载序插 BoardRenderer 前）；阶段花色映射表：按 level.id 区间（1~21/22~42/43~60，**严禁读 level.chapter——chapter 分段 1-20/21-40/41-60 与图鉴阶段不重合，L21/L41/L42 错位**）+ 确定性抽样（seed = f(level.id, 阶段号)，xorshift 类 PRNG 禁 Math.random——D-08）将关卡实际花色数 K（3~8 不变）映射至池内 K 个图案，同关内 suit→图案唯一且可复现（SC-007）；图案仅是视觉标识，三消/求解/死局判定恒以 suit 整数为准（FR-032 铁律）
- [x] T052b [P] [US5] 重构 3D 奶油白正方体滑块、多层金字塔投影与边缘流光方向角标，移除旧圆圈指示器（Δ14b/FR-034）in `src/render/BoardRenderer.js`: ①底座 = 1:1 奶油白 3D 圆角正方体（底部立体厚度阴影 + 纯白高光内倒角——替代 T-M15.3 牌面+暖棕厚度底座）；②多层堆叠（1~5 层）向左上角微量阶梯偏移 + 层间阴影（金字塔式空间立体感，替代原左上角层角标与错层偏移）；③**彻底移除左上角圆圈指示器与覆盖图案面部的半透明箭头圆圈**；④方向 = 朝向侧边缘内嵌「流光胶囊」角标（程序化渐变流光动画，指 d 方向；方向语义与 FR-001/FR-002 命中判定完全一致——纯视觉替换）；⑤图案居中完整展示零遮挡（Bestiary Sprite 消费 T052a）；⑥机制标记（齿轮/冰封/锁链/钥匙/棱镜——T034 视觉）位置与新底座兼容互不遮挡；⑦hitTest/动画路径（fly/block/gear/unlock/ice/prism）坐标口径同步新底座几何（防 Δ12 类 NaN 崩溃回归——render-selftest 覆盖）；⑧8×8/5 层厚度与偏移按格宽分级缩放（沿用 Δ11 适配策略）
- [x] T052c [US5] 编写 60 关花色重映射逻辑，在不破坏现有坐标与 solutionMoves 的前提下映射至 45 种动态图鉴（Δ14a/FR-033 §3/§4）in `src/render/bestiary.js`（映射表本体）+ `tools/render-selftest.js`（断言）: 60 关逐关计算「关卡花色数 K → 阶段池 K 图案」映射并缓存映射结果（会话级）；**不写回 levels.js**（git diff 恒空——Δ13 保留铁律，SC-007 验收口径）；不触碰 tiles 坐标/solutionMoves 有效性（Hint/Bot 回放照常——Δ6 解序列与渲染层解耦）；render-selftest 新增断言组：60 关映射确定性（同 seed 二次计算结果一致）、同关同 suit 恒同图案、阶段边界正确（L21∈阶段一、L22∈阶段二、L42∈阶段三、L43∈阶段三——按 id 区间非 chapter）、K≤池大小恒真、跳关/Undo 后以当前关 id 重算阶段（Edge Case「阶段边界换装」）；engine-selftest 全量回归零漂移（证明映射纯渲染层）【实现注: 原文「L42∈阶段三」为笔误——spec FR-033 阶段二 = L22~L42（含 42）且 21+21+18=60 自洽，断言按 spec 口径 L42∈阶段二执行；引擎 suit 校验仅 %3 守恒无上限，天然兼容 Suit 0~44（无引擎改动需求）】
- [x] T052d [P] [US5] 绘制 20 套阳光治愈系生态风景背景池，并绑定至 20 个三关循环（Δ14c/FR-035）in `src/render/BoardRenderer.js` + `css/style.css`: 20 景 Canvas/内联 SVG 多层风景（每景天空/远景/中景/近景 ≥3 层 + 渐变；题材分布 Cycle 1~7 陆地（阳光牧场/花海/麦田等）/ 8~14 蔚蓝（海滩/珊瑚湾/彩虹谷/云海等）/ 15~20 远航（热气球晨光/海港/星河/云海金顶等）——具体构图清单实现期定）；绑定 `cycleIndex = Math.floor((level.id - 1) / 3)`（0~19 严格一一对应，同循环 3 关共享——跳关/Undo 均以当前关 id 实时计算）；背景层与滑块层分离渲染（背景静态化或低速重绘，滑块层 60fps 不降帧）；棋盘层半透明蒙版/暗角过渡（滑块/角标/机制标记对比度 ≥ 黑底基准——Edge Case「背景可读性」）；零外部图片（宪章 III）
- [x] T052e [P] [US5] 实现困难关（Cycle 第 3 关）开局 1.6 秒挑战横幅动效（Δ14d/FR-036）in `src/main.js` + `css/style.css`: 挑战位集合 = L3 ∪ (id-4)%3==2 位（L6/L9/…/L60，**合计 20 关 = 20 个三关循环各含 1 难关——内嵌精确集合，勿只取 (id-4)%3==2 漏 L3**）；开局（createSession 后）屏幕中央弹出 1.6s 绿金横幅「🔥 挑战关卡！只有 XX% 的玩家能一次通过这一关」；XX% = 关卡难度指标（metrics）确定性函数（同关恒定——minMoves/difficultyScore 单调映射至如 5%~95% 值域，具体函数实现期定）；**非模态**（不阻塞 PointerEvents、不冻结 rAF 与判定——Edge Case「横幅与开局输入竞态」）；1.6s 自动消散（CSS 动画 + setTimeout 清理），重开本关可再弹
- [x] T052f [US5] 实现 Web Audio API 舒缓治愈系循环 BGM 合成器与静音联动（Δ14d/FR-037）in `src/audio/SoundManager.js`: 大调五声音阶（C D E G A）柔和木琴音色（短促衰减正弦/三角波敲击 + 低通滤波）与柔和和弦 pad 循环（4~8 小节调度表驱动——Web Audio 前瞻调度，主线程零负担）；**首次交互（PointerEvent/keydown 任一）后自动播放**（autoplay 政策合规——首次交互前 MUST NOT 发声，Edge Case「BGM 自动播放策略」）；音效开关同步静音联动（setMuted(true) → BGM gain 归零——与既有 SFX mute 语义一致）；visibilitychange→hidden 暂停/恢复续播；BGM 专用 gain 节点与 SFX 链路隔离（互不串音）；纯代码实时合成零音频文件（宪章 III）
- [x] T052g [US5] **Checkpoint M3.5（表现层门 → M3.6）**: SC-007（图鉴渲染一致性——45 图案可渲染、同关同图案、跨阶段池切换仅在换章边界、levels.js git diff 为空）；SC-008（20 景 cycleIndex 对应 0 遗漏 0 冲突 + 横幅触发 20/20 + BGM autoplay 合规静音联动）；US5-AC1~AC8 逐条人工验收（quickstart Δ14 场景组）；`node tools/render-selftest.js` Δ14 断言全绿 + `node tools/solver.js --engine-selftest` 回归全绿（FR-031 不触发——levels.js/level-config/RulesEngine git diff 全空佐证）；8×8×5 层满载关卡 60fps 抽查（中端手机档）；宪章红线复核（零二进制文件、零外部资源）。**未全过不得进入 M3.6**【Δ15 注记：本门按 Δ14 口径验收成立（5ea6c44 已交付）；「levels.js git diff 为空」子项此后由 M3.6 迁移接管——T052h 前恒空、T052h 一次性变更、T052h 后恒空；「零外部资源」子项已被宪章 III v2.0.0 取代（assets 为可选增强目录）】

---

## Phase 5.6: Milestone 3.6 — Δ15 增量：同花色空间打散、贴图双兜底与箭头重做（FR-029 Δ15 / FR-033 §6 / FR-035 §3 / FR-034 §3）

⚠️ **GATE**: 依赖 T052g（M3.5 表现层门）通过。**执行顺序钉死：T052h 先行（唯一触碰 levels.js 的任务）→ T052i/T052j/T052k 并行**——levels.js 在本阶段开头经 redisperse-60 一次性变更（FR-008 Δ13 铁律受控让位 + FR-031 全量重验后恢复），此后 git diff 恒空；渲染层任务（T052i/T052j）不依赖迁移结果可并行开发但**合入顺序在 T052h 之后**（最终交付批次为重打散后数据）。

**Goal**: ① 存量 60 关花色空间重打散达标三档聚散度曲线（消灭"三连排排坐"）+ Solver 全量重验与聚散度指标落库；② 渲染链切换「本地贴图优先 + Emoji/程序化强制双兜底」（宪章 III v2.0.0，空 assets 完整可玩）；③ 方向角标重做为单枚锐利宽翼三角箭头（消灭"猪鼻子"胶囊造型）。

**Independent Test**: `node tools/redisperse-60.js` 输出 60 关聚散度报告全达标 + `node tools/solver.js` exit 0（60/60 可解 + 聚散度断言）；空 assets 目录双击 index.html 完整可玩（Emoji 卡牌 + 程序化背景）；放入贴图后刷新换装不闪烁；滑块方向角标为单枚白描边实心三角。

**验证**: redisperse-60 自检 + Solver 全量门禁（FR-031）+ render-selftest Δ15 断言组 + engine-selftest 回归 + quickstart Δ15 场景组（空/满 assets 双形态）。

- [x] T052h [US2] 实现 tools/redisperse-60.js 存量 60 关花色重打散迁移工具（Δ15a/FR-029 §1~§6）in `tools/redisperse-60.js`（新增）+ `tools/level-config.js`（三档档位参数）+ `tools/solver.js`（聚散度指标）: ① 聚散度核验函数——按邻接定义（连坐=曼哈顿距离 1 或同格相邻层；三连簇=3 块连通紧挨；双连坐=2 块紧挨+第 3 块远处；完全分散=两两曼哈顿 ≥2）逐关统计三连簇数/双连坐占比/完全分散占比/两两最小曼哈顿距离（8×8 关另测 ≥3 达标）；② 三档曲线档位参数入 level-config（L1~L6: 三连簇 ≤15%、双连坐 ≈35%、分散 ≈50% / L7~L21: 三连簇 ≤5% 且每关 ≤1 组、双连坐 30%→15%、分散 ≥80% / L22~L60: 三连簇 0%、双连坐 15%→0~5%、两两 ≥2 优先 ≥3）；③ 迁移算法——对每关保持网格/滑块总数/堆叠层数/方向/机制标记与配对/prisms/cfg 全部结构参数不变，仅重排同花色滑块的空间落位（r/c 交换分配；候选分配经打散启发式搜索：最小化三连簇 → 双连坐向档位目标靠拢 → 最大化分散度），逐关重算 solutionMoves（Solver 全量求解，非原解扰动）并验证 100% 必胜可解 + 开放花色数 ≤5 + dockPeak ≤7 + 无"空棋盘残槽"终局；④ solver.js 报告 schema 增列聚散度字段（tripleClusters/pairPct/dispersedPct/minPairDist≥3（8×8）达标布尔/档位达标布尔——向后兼容旧报告），exit code 门禁增加聚散度档位断言；⑤ CLI: `node tools/redisperse-60.js --seed 2026`（确定性种子、逐位复现）→ 导出迁移后 levels.js + 更新 solver-report.json → `node tools/solver.js` 全量门禁 exit 0 方可合入；⑥ 迁移完成后 Δ13 保留铁律恢复（此工具此后仅供历史复现，交付物不含运行依赖）。**FR-031 已触发并履行**（levels.js 变更 → 全量重验报告更新）。
- [x] T052i [P] [US5] 重做方向角标为单枚锐利宽翼三角箭头 + 图标渲染链贴图优先/Emoji 兜底（Δ15c/FR-034 §3 + Δ15b/FR-033 §6）in `src/render/BoardRenderer.js` + `src/render/bestiary.js`（Emoji 码点表）: ① **角标重做**——移除流光胶囊角标绘制路径，改为滑块朝向边缘内侧正中的单枚锐利宽翼实心三角箭头（带白色描边、干净利落绝无孔洞感；**严禁"胶囊椭圆内含两个小点/小三角"猪鼻子造型**；宽高比/描边宽度/内缩距离按 FR-034 §5 可辨识度红线实现期定，8×8 小格尺寸下限分级适配——沿用 Δ11 分级缩放策略）；方向语义与 hitTest/动画坐标零变化（纯视觉替换）；② **图标渲染链**——bestiary.js 增补 45 条目 → Emoji 码点常量表（每条目一个确定性 Emoji，如跳跳蛙→🐸、小火箭→🚀；plan 阶段固化）；BoardRenderer 图标绘制前置 Image 加载层：`assets/icons/{suit}.png`（0.png~44.png）优先，onerror/未就绪时该条目降级为原生全彩 Emoji 直渲染（`ctx.font = "bold XXpx 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"` + `ctx.fillText`；**严禁 ctx.arc 手绘圆球加黑点**）；③ 兜底纪律——贴图缺失判定逐条目独立、同关内同 suit 恒同渲染来源（不混排闪烁）；贴图就绪后惰性换装（本关内生效或下局生效——实现期定，禁加载期白屏/卡帧）；Image 相对路径保证 file:// 双击与静态服务双形态一致；④ Sprite 缓存键扩展 (suit, 尺寸档) → (suit, 尺寸档, 渲染来源)——贴图与 Emoji 两套缓存；⑤ render-selftest 增补 Δ15 断言组：Emoji 码点表 45 条全覆盖且无重复、兜底链确定性（Image 桩 onerror → Emoji 路径命中）、角标几何有限性（三角顶点坐标非 NaN——防 Δ12 类崩溃回归）。【实现注: ②~⑤图标渲染链已交付（含 4×4 精灵图集升级——sheet{1..3}.png 3 张 ×15 格离屏切片 + getImageData 白底 Alpha Keying + 圆角遮罩 + 第 16 格水印跳过 + 单张 PNG 逐条目兜底 + Dock chip 贴图出口 + render-selftest 场景 F 断言组全绿）；**①三角箭头重做已随 Δ15b3e 交付（Bug C 修复，2026-10-21）——`DIR_COLORS` 四向主题色（U #10B981 / R #F59E0B / D #EF4444 / L #3B82F6）+ 1.5px 纯白描边，实测箭头亮度跨度 126.9（原纯白实现仅 2.9，卡面上零对比），复选框已归位】】【Δ15b3e 补充（Bug A/B 修复，2026-10-21）: 切片分辨率 128→256；DPR 改 `Math.max(2, devicePixelRatio||1)` 2x 下限超采样 + 显式 `imageSmoothingQuality='high'`；棋盘位图/CSS 盒正方形锁定（消除原 1.18× 纵向拉伸）；移除 `#board` 的 `backdrop-filter` 毛玻璃与灰白雾遮罩 + 画布内径向暖白 veil（滑块对比度改由 `rgba(15,23,42,0.35)` 深色投影 + 加深厚度边承载）；Dock 图标改「DataURL `<img>` 优先 + `<canvas>` 同源兜底」双出口——`file://` 跨源污染下 `toDataURL`/`getImageData` 必抛 SecurityError，canvas 兜底消费棋盘同一张切片故双形态 100% 同源；`ensureSinglesFor` onerror 修 TOCTOU（原会把已由 sheet 覆盖的 5 条误标 emoji）；降级路径加 `console.warn` 一次性留痕（原静默失败 45 次零信号）；render-selftest 场景 G 增补 Δ15b3e 修复断言组 15 项 + `tools/verify-fix.cjs` 双形态实机探针】
- [x] T052j [P] [US5] 背景渲染链贴图优先/程序化兜底（Δ15b/FR-035 §3）in `src/render/backdrops.js` + `src/render/BoardRenderer.js`: 背景绘制前置 Image 加载层——`assets/bg/bg{cycleIndex+1}.jpg|.png|.webp`（序号 1~20 与 20 景一一对应）优先；某景文件缺失或加载失败（onerror/未就绪）时该景降级为既有 20 景程序化风景（Canvas/内联 SVG + 渐变——T052d 产出的绘制函数降格为兜底渲染源）；兜底判定逐景独立、会话内缓存结果（同景不重复探测、不闪烁）；贴图就绪后换装时机与 T052i 同口径；drawImage 覆盖 9:16 画布（cover 裁切算法实现期定）；蒙版/暗角可读性保证（FR-035 §4）对贴图与程序化两来源同样生效；Image 相对路径（file:// 双形态一致）；背景层与滑块层分层渲染策略延续（背景静态化/低速重绘不降帧）。render-selftest 增补断言：bg 编号映射 cycleIndex+1 严格一一对应、程序化兜底路径在 Image 桩失败时正确命中。【实现注（Δ15b3 升格，见 T052j2）: 6 图 → 20 循环映射口径已落地（0~3→bg1 / 4~6→bg2 / 7~10→bg3 / 11~13→bg4 / 14~16→bg5 / 17~19→bg6）；背景层由「棋盘画布内方图」升格为「#app 全视口 9:16 背景舞台」（贴图 cover 等比铺满居中不裁切），棋盘画布转为透明透出风景——原「20 景程序化 Canvas 兜底」降格为渐变底色兜底（backdrops.js PAINT 保留在库未被消费，见 T052j2 备注）】
- [x] T052j2 [P] [US5] 背景升格为「全视口 9:16 背景舞台」+ 20 循环差异化氛围滤镜与前景环境粒子（Δ15b3/FR-035 §2~§4 衍生）in `src/render/BoardRenderer.js` + `src/main.js` + `css/style.css`: ① **全视口铺满**——背景由「棋盘画布内方图」升格为 `#app` 全视口背景舞台（main.js 动态挂载 `#bg-canvas` 底图层 + `#fx-canvas` 前景粒子层，pointer-events:none 不拦截操作；贴图 9:16 源按 cover 等比铺满居中——**无裁切放大**，Image 相对路径 file:// 双形态一致）；② **格式自动兼容**——`assets/bg/bg{1..6}` 加载按 png → jpg → jpeg → webp 逐扩展探测，某张未就绪则复用 bg1，全失败降级 Canvas 渐变底色（按主题族：meadow/sea/petal/star 四套暖阳/海蓝/樱粉/星夜渐变）；③ **6 图 → 20 循环映射**——`cycleIndex = Math.floor((level.id - 1) / 3)`（0~19）：0~3→bg1 雪山城堡花海 / 4~6→bg2 金色麦田风车 / 7~10→bg3 黄金椰林海滩 / 11~13→bg4 樱花飞舞湖畔 / 14~16→bg5 漫天彩色热气球 / 17~19→bg6 奇幻星辰云海；④ **20 档差异化氛围**——同一底图在负责的 3~4 个循环中叠加互异氛围光影层（ATMOS 20 档：清透晨光/暖金午后/微醺粉霞/清凉月光/晴空麦浪/正午暖阳/金色黄昏/碧海晨汐/澄澈正午/珊瑚霞光/静谧月夜/樱映晨光/午后暖樱/暮色紫霞/气球晨光/云端暖阳/彩霞满天/银河初现/星海流光/终局星辉——含渐变罩+色温罩+暗角 veil+提亮 lift+暖偏移 warm 五参），确保每过 3 关一换气氛；⑤ **前景环境粒子 4 族**——meadow（bg1/bg2：蒲公英绒毛 + 柔和阳光光斑）/ sea（bg3：晶莹上升水泡 + 海面波光亮带）/ petal（bg4：缓缓飘落粉色樱花瓣）/ star（bg5/bg6：闪烁流光星尘 + 微光流星划过），低透明度（≤0.22）低密度（≤24 粒）分布于边缘与上下半区，**不干扰操作视线**；粒子为纯函数动画（相位由 (i,t) 决定，零状态污染），独立 rAF 循环不占棋盘 60fps 预算；⑥ **棋盘通透融合**——棋盘画布转为透明（透出背后高清风景图），CSS 底板改半透明磨砂暖白 `rgba(255,255,255,0.22)` + 柔和圆角边框 + backdrop-filter，画布内保留暖白柔光层保滑块对比度；HUD/Dock/道具栏加半透明磨砂带保浅色文字可读性。**验证**：`node tools/render-selftest.js` 场景 G 全绿（6 图映射 + 20 档氛围唯一性 + 4 族粒子 + 20 循环舞台绘制）+ `node tools/solver.js --engine-selftest` 零漂移 + Chromium 实测截图 11 关（bg1~bg6 全覆盖，贴图入画布证实、氛围名逐环互异、棋盘磨砂透出背景、Dock chip 不被模糊）。**备注**：`src/render/backdrops.js` 的 20 景程序化 PAINT 绘制器保留在库（FR-035 兜底资产，未被消费——留作程序化场景二次衍生备用），其 `drawBackdrop`/`drawBackdropAnim` 路径因背景层升格而停止被 BoardRenderer 调用。
- [x] T052k [US2+US5] **Checkpoint M3.6（Δ15 门 → M4）**: ① `node tools/redisperse-60.js --seed 2026` 迁移成功且聚散度报告 60/60 达标（L22~L60 三连簇 0、L7~L21 每关 ≤1 组、L1~L6 ≤15%；双连坐与分散占比在档位目标带内）+ `node tools/solver.js` exit 0（60/60 可解 + metrics/聚散度双写一致 + 曲线门全绿——FR-031 履行证据）；② SC-006 重定义验收——**空 assets 目录双击 index.html 完整可玩**（Emoji 卡牌 + 程序化背景兜底全链生效、SC-003 秒开不劣化）+ 满 assets 形态贴图换装正确不闪烁（双形态双验收）；③ US2-AC6（聚散度核验场景）+ US5-AC4/AC5 复扫（新口径：三角箭头一眼可辨、贴图/兜底背景正确）；④ `node tools/render-selftest.js` Δ15 断言全绿 + `node tools/solver.js --engine-selftest` 回归零漂移（FR-032 铁律佐证）；⑤ 8×8×5 层满载 60fps 抽查 + 挑战关横幅/BGM 与新渲染链共存抽查（M3.5 功能零回归）；⑥ 迁移后 `git diff src/data/levels.js` 恒空（M3.6 之后时点——Δ13 铁律恢复）。**未全过不得进入 M4**。

---

## Phase 6: Milestone 4 — 调试面板、Auto-Play Bot 与无缝扩容（User Story 4 面板部分，P3）

**Goal**: 评审效率层（FR-027/028）+ 扩容能力实证（Δ4/Δ6）

**Independent Test**: 任意关打开面板验证跳关/Hint/Bot/难度指标/机制标签/移动抽屉；Q8 钻探验证零代码扩容

- [x] T053 [P] [US4] Implement 调试面板容器 in index.html + css/style.css: PC（≥1024px）右侧 320px 侧栏常驻；移动端底部抽屉（translateY 收展，DOM 常驻避免重排棋盘）；收起不影响游玩布局（FR-028/D-13）
- [x] T054 [US4] Implement 跳关与重置 in src/main.js: 关卡下拉框 1~`LEVELS.length` **动态选项**（Δ4——配置扩至 100+ 关零代码适配）；选择即 createSession(LEVELS[N-1]) 加载；重置=session.reset()
- [x] T055 [US4] Implement Hint in src/main.js: on-rail（session.onRail()）→ 高亮 solutionMoves[stepIndex].t 滑块（脉冲描边动画，1.8s 自动清除）；off-rail → 有界 DFS（预算 100k 节点/~300ms 时限，复用 T033 搜索器 + 同形 action set）首步高亮；搜索失败→启发式建议（能飞出且降低槽压力的 tap）+「非保证」标记
- [x] T056 [US4] Implement Auto-Play Bot in src/main.js: on-rail 逐 tap 回放（450ms/步、botTick 音效）；**玩家 pointerdown（棋盘+道具）立即打断**；off-rail 有界续解→失败则兜底 reset 重放整条 solutionMoves（保证「直至该关胜利」）；终态自动停
- [x] T057 [US4] Implement 关卡信息展示 in src/main.js: metrics 全字段（minMoves/solutionCount/dockPeak/mechCount/difficultyScore/openSuitsMax）+ 机制标签动态计算（齿轮/冰封/锁链/棱镜+破冰口径，按 tiles/prisms/cfg 实际出现）+ 音效开关（SoundManager.setMuted）
- [x] T058 [US4] **Checkpoint M4（功能门）**: quickstart Q4.1~Q4.7 逐条通过（跳关/Hint 在轨与偏离两态/Bot 演示+玩家打断/指标与机制标签/移动端抽屉收展/SC-002 计时/SC-003 首屏）；US4-AC4~AC7 全过；**SC-002: 跳关+自动演示 10 分钟内遍历 60 关（Δ13 扩容后）+ ≥10 关机制深度人工验证**
- [x] T059 [US4] Execute Q8 无缝扩容钻探（**钻探配置不进入交付物**; Δ13 注记: 50→60 扩容已由 expand-60.js 增量拼接实证一次，后续钻探目标改为 60→80+）: 临时向 tools/level-config.js CHAPTERS 追加新章条目（levels:[61,80], grid:[8,8] 等）→ `node tools/generator.js --chapters N --seed 2026` 生成 80 关（或增量拼接）→ `node tools/solver.js` 全量门禁通过 → 浏览器验证: 下拉框出现 61~80 选项、通关 L60 自动进 L61、L80 通关触发全通关终局、进度对象零迁移自适应（**全部零前端代码修改——Δ4+Δ5 实证**）→ 回滚配置 → 重跑生成恢复 60 关交付物 → solver 全量重验

---

## Phase 7: Polish 与交付终验（跨故事横切）

**Purpose**: 横切质量、性能与宪章红线审计

- [x] T060 [P] Performance & size sweep 全项目: SC-003 首屏可交互 <3s（冷启动清缓存，主流桌面+手机浏览器）；src/data/levels.js ≤200KB（level-data.md §4 规模预算）；棋盘动效 60fps 抽查（中端手机档）；Hint 响应 ≤300ms 实测（level-pipeline.md §5 校准项收敛）
- [x] T061 [P] Code cleanup in src/, index.html, css/style.css: 死代码/console 噪音清零；四契约 API 逐一对齐复核（导出名/签名/加载序/UMD）；grep 复查无 touchstart/mousedown/mouseup/touchend、无 import/export 语法（classic script 约束）；变更后 quickstart 抽查回归
- [x] T062 [P] Q9 宪章红线审计 全仓库: 无 package.json/node_modules/构建配置；index.html 无 type="module"、无动态 import/fetch；文件类型扫描——核心代码路径（index.html/src/）与音频/字体零二进制命中（SC-006 Δ15 口径：assets/icons/*.png 与 assets/bg/* 为宪章 III v2.0.0 允许的可选增强贴图，豁免零二进制扫描但须单独核验空目录可玩与 Image 相对路径加载）；关卡来源=levels.js 头注释生成元数据+tools/solver-report.json 在库（宪章 V，含 Δ15 聚散度指标）；file:// 双击可玩（宪章 II 交付红线——空 assets 与满 assets 双形态各验一次）
- [x] T063 Final delivery check 全项目: quickstart Q0~Q9 全场景终扫；levels.js 与 solver-report.json 同批次 metrics 交叉一致（验收检查项——含 Δ15 聚散度字段）；SC-001~SC-008 全量勾验（含 SC-005 首点 30s 路径复核、SC-006 Δ15 双兜底口径、SC-007/008 复扫）；确认 tasks.md 全项勾选

---

## Phase 8: Milestone 5 — 商业化外围 UI 闭环与 72 关拼图经济系统（User Story 6 + US2 扩容，Priority: P2）🎬 外围闭环

⚠️ **GATE**: 依赖 T058/T059/T063（M4 功能门 + 扩容钻探 + 交付终验）通过。**Shell-Last 定位**——外围闭环依赖已就绪的关卡体系/渲染链/音频链/调试面板，避免外壳层与核心层反复互相干扰。**硬边界**：① levels.js 唯一合法变更通道是 T064（expand-60.js 尾部增量生成 L61~L72）——本阶段其余任务对关卡数据**零写入**；② 经济态/档案态/拼图进度全部落在独立 `slide-triple:profile:v2` localStorage 键，与 `progress:v1` 并存不迁移，**不回写 levels.js**（FR-041 §4 / **FR-051** §3，Δ19 改号——原 FR-044）；③ 复活净化是 RulesEngine 的**唯一新增规则语义**（成组消除恒为 3 的倍数，不改三消/射线/死局判定口径——FR-032 铁律不破）；④ 全部 UI 为表现/导航层，零网络请求、零真实货币。

**Goal**: 品牌开机动画 + Glide Critters 主大厅（Δ17 棱晶星盘传送门 + 云端浮空岛背景）+ 奶油果冻设置/档案弹窗 + 棱晶经济闭环 + 通关结算（Δ17 双风翼棱晶能量铭牌）/传送门开启展板/无倒计时复活 + 关卡扩容至 72 关与 6 幅风景画卷晶片充能节奏（FR-038~FR-043 + **FR-051**、SC-009~SC-011）

**Independent Test**: 冷启动看到 2.0s 开机动画后进入大厅 → 大厅六区齐备（中心为棱晶星盘：齿轮风翼底座 + 2×2 晶片 + 顶部 `X/4` 铭牌 + 左右切换可用）且 `关卡 X` 正确 → 通关见结算层（双风翼棱晶能量铭牌 + 滑板跃起萌宠 + 星芒粒子 + 赞美词 + 星盘棱晶飞入）→ 每满充能 12 关触发一次传送门开启展板 → 失败页无倒计时、`💎 100 复活` 后 Dock 清空且生命值回 3 → **竞品视觉元素清零静态核查七项零命中** → `node tools/solver.js` exit 0（72/72）+ 既有 60 关逐字节零改写。

**验证**: expand-60 尾部增量 + Solver 全量门禁 72/72 + render-selftest Δ16 断言组 + engine-selftest 回归（含复活净化断言）+ quickstart Δ16 场景组。

### Batch A（T064~T067）—— 72 关扩容 + 持久化 v2 + 开机动画

- [x] T064 [US2] 实现 tools/expand-60.js 尾部增量扩容 60→72（Δ16a/Δ16b/FR-008 Δ16 扩容铁律）in `tools/expand-60.js` + `tools/level-config.js` + `src/data/levels.js`: ① **既有 L1~L60 的 tiles/prisms/cfg/solutionMoves 100% 原封不动保留复用**——扩容前后逐字节 JSON 深比较断言（平移关 60/60 bit-exact，禁全量重生成）；② **仅新增生成 L61~L72 共 12 关**（三关一循环尾段：L61=7×7简, L62=7×7简, L63=8×8难 … L70=7×7简, L71=7×7简, L72=8×8难），沿用 FR-008 后期档位参数（堆叠 5 层 z=0..4、7×7 约 72~84 块 / 8×8 困难关 87~105 块、花色 5~8、机制全解锁、受阻扣命生效、道具各 1 次）；每关经 Generator 三重验证（逆向构造→正向自检→Solver 门禁，D-10）+ 内嵌 solutionMoves（Solver 最优解非构造解，Δ6）；③ `level-config.js` 章区间重划 ch1[1,24]/ch2[25,48]/ch3[49,72]（FR-033 图鉴池边界同步——**严禁读 level.chapter**，按 level.id 区间判定）；④ 波浪挑战位锚点保持 (id-4)%3==2（L63/L66/L69/L72 共 22 个 8×8）；⑤ Solver 报告升级 72/72 + 聚散度档位末档延展至 L72（FR-029 §4 三连簇 0%）；⑥ **背景贴图口径由 20 景收窄为 6 幅画卷**——`assets/bg/bg{n}`（n = floor((level.id-1)/12)+1，Δ16b，零新增美术资源），BoardRenderer/backdrops.js 的 cycleIndex→bg 映射同步改造（原 0~3→bg1/4~6→bg2/…/17~19→bg6 的 20 档映射废止）；⑦ 挑战位集合由 20 关扩为 24 关（L3/L6/…/L72，FR-036/Δ14d 同步）；⑧ CLI `node tools/expand-60.js --seed 2026` 确定性逐位复现。**FR-031 已触发并履行**（levels.js 变更 → 全量重验报告更新为 72/72）。
- [x] T065 [P] [US6] 实现 src/core/profile.js 玩家档案与经济态持久化模块（Δ16c/FR-040 §2 / FR-041 §4 / **FR-051** §3——Δ19 由原 FR-044 改号）in `src/core/profile.js`（新增）: ① 新增 localStorage 键 `slide-triple:profile:v2`（**与既有 `slide-triple:progress:v1` 并存不迁移**——v1 进度读取逻辑零改动、向后兼容；Δ16 禁止破坏既有进度）；② 结构 = {shards 余额（整数 ≥0）、nickname（字符串，空值/超长有兜底默认）、avatar（当前萌宠 Suit 编号 0~44，默认 0）、paintingProgress（6 幅画卷各自已点亮块数 0~4 的数组）、settings{bgm,sfx,haptics} 三布尔}；③ API = load/save/get/set/addShards（余额下限钳制 0，**MUST NOT 出现负值**）/grantFirstClear（幂等——同关不重复发首通奖励）/unlockPaintingTile（拼图块递增，上限 4）/setAvatar/setNickname/setSetting；④ **全访问 try/catch**（隐私模式/配额异常 → 降级为内存态照常可玩，D-03 纪律延续）；⑤ **零回写 levels.js**——本模块与关卡数据完全解耦（FR-041 §4 铁律）；⑥ 头像切片来源 = bestiary.js 已加载的 `sheet{1..3}` 高清切片（不额外加载资源）；⑦ render-selftest 增补断言组：v2 往返读写一致、余额下限钳制、首通幂等、拼图递增上限、隐私模式降级可用。
- [x] T066 [P] [US6] 实现 HooLey Games 开机动画（Δ16d/FR-038）in `src/ui/splash.js`（新增）+ `index.html` + `css/style.css` + `src/audio/SoundManager.js`: ① **全屏黑曜石径向微光渐变** `#14181F → #07090C`（径向渐变中心微光四周沉黑；**严禁纯黑 `#000000` 死黑**）；② 居中 `HooLey` 主标题（原创浮雕艺术字：多层描边 + 高光 + 微投影）与宽字距 `GAMES` 副标题（字距显著加宽）；③ **原创字母动态**——中间两个字母 `oo` 执行磁力弹跳碰撞（相向运动→接触回弹 + 挤压变形）与眨眼弧度变形（眼睑弧线开合），随后一道**白金流光**自左向右扫掠字面（clip-path/渐变遮罩，**非整体闪烁**）；④ **合成开机和弦音**（SoundManager 新增 ≈0.35s 温润空灵短促和弦，Web Audio 纯代码实时合成——**零音频文件**，宪章 III 音频红线不破）；autoplay 合规——首次交互前 MUST NOT 发声（首次点击/按键时补发）；⑤ **总时长 ≈2.0s 后平滑淡入主大厅**；⑥ **首次点击/按键可跳过**（跳过落点与自然播完一致，且 MUST NOT 跳过任何初始化步骤——进度加载/图标资源预载照常执行）；⑦ 纯表现层零持久化副作用（MUST NOT 触碰进度/棱晶/拼图态）；⑧ 性能预算：主线程占用 < 8%、纯 transform/opacity + rAF 字母变形（**零布局抖动**）；render-selftest 增补断言：动画时序常量（总时长 ≈2.0s、音频 ≈0.35s）、跳过路径落点一致。
- [x] T067 [P] [US2] 扩充离线流水线与自测断言组以覆盖 72 关与 Δ16 语义（Δ16a/Δ16g）in `tools/solver.js` + `tools/render-selftest.js`: ① `node tools/solver.js` 全量门禁口径 60/60→**72/72**（exit code 机判）+ 曲线门覆盖 L1~L72（章均值单调 + 斜率 ≥0 + L4~L72 「2 简 1 难」7/7/8 波浪锯齿形态）；② `--engine-selftest` **新增复活净化断言组**（FR-043 §4）：Dock 滞留 + 板面同花色配对块成组消除恒为 3 的倍数、槽内余数非法态零发生、生命值恢复为 3、关卡进度与步数计数不重置（棋盘未被重置）；③ render-selftest 增补 Δ16 断言组：profile v2 往返 / 棱晶扣费原子性与余额下限 / 复活净化花色守恒 / 拼图进度递增 / 开机动画时序常量；④ solver-report.json schema 升级为 72 关（含聚散度指标字段，向后兼容旧报告读取）。

### Batch B（T068~T071）—— Glide Critters 主大厅（Δ17 棱晶星盘传送门 + 云端浮空岛背景 · Δ18 交互与视觉补强）+ 奶油果冻弹窗 + 局内棱晶购买闭环

- [x] T068 [US6] 实现 Glide Critters 主大厅界面（Δ16e/FR-039，**Δ17 视觉载体原创重制**）in `src/ui/lobby.js`（新增）+ `index.html` + `css/style.css` + `src/main.js`: ① **场景切换机制**——main.js 引入应用级状态机（BOOT→SPLASH→LOBBY→GAME→RESULT），大厅与局内互斥切换（**MUST NOT 出现大厅与局内并存的叠加态**，模态弹窗除外）；② **六区严格分区布局**——顶部左【设置⚙️】【调试面板开关🛠】（与局内调试面板**共用同一开关状态**：大厅开启→局内默认展开，反之收起）、顶部右【棱晶💎 货币栏（当前余额实时反映）】、中上【`Glide Critters` **原创 3D 浮雕艺术字徽标**——融入流线型滑行风翼 + 方向星芒 + 当前萌宠头像探头装饰；**严禁抄袭外部竞品地球仪/小鸟构图或任何第三方商标**（原创性红线）】、**中心【棱晶星盘 / 时空传送门（Prism Portal）】——Δ17 重制，替代 Δ16 原定的「2×2 风景木质拼图相框」（该相框形态作废）**：① **外圈底座**——圆角八边形或环形星盘，表面带**机械齿轮刻纹**与**流线型滑行风翼纹饰**（呼应徽标风翼母题），琥珀金 + 虹彩棱晶配色；② **内部能量晶片**——星盘内以 **2×2 象限镶嵌 4 块能量晶片**，每通关 1 个困难位关点亮 1 块，进度 `1/4 ~ 4/4`（数据源仍为 **FR-051**——Δ19 由原 FR-044 改号，零改动）；③ **未点亮晶片态**——**半透明紫晶盲盒态**（内部仅见棱晶微光与几何切面，**MUST NOT 泄漏未解锁画面内容**），表面标注解锁关卡（如 `解锁 L13`）；④ **已点亮晶片态**——**折射显示对应奇幻大陆高清图景**（对应 `bg{1..6}` 的 2×2 四象限高清切片，与局内背景同源同文件同缓存链——FR-035 §6 铁律，零额外加载），带棱镜色散边缘 + 轻微呼吸辉光；⑤ **顶部悬浮胶囊铭牌**——显示当前浏览的**大陆名称**与**充能进度 `X/4`**（0/4~4/4）；⑥ **左右切换浏览**——星盘两侧提供左右切换按钮，支持在**已唤醒的大陆**之间循环浏览（切换时晶片与铭牌同步换装），当前所在关归属的大陆为默认选中项（`currentPaintingIndex` 语义由「当前查看」扩展为可循环切换）】、中下【**饱满立体的翠绿胶囊大按钮，文案严格为 `关卡 X`（X = 当前最新解锁关卡号，1~72；MUST NOT 带「开始」二字；与拼图节奏解耦——Edge Case 铁律）**】、左下【**玩家圆形头像按钮**——当前选中的 3D 萌宠头像 + 昵称角标，点击打开档案弹窗】；③ **大厅背景（Δ17 重制）**——优先加载 3D 卡通浮空岛营地贴图 `assets/bg/lobby_bg.png|.jpg|.jpeg|.webp`（**已落地为 `lobby_bg.jpeg`**；按扩展名顺序探测，Image 相对路径，file:// 与静态服务双形态一致），缺失/onerror MUST 降级为**原创「3D 卡通云端浮空岛与发光棱晶簇」插画背景**（Canvas 2D / CSS 渐变 + 内联 SVG 程序化绘制：分层云海、悬浮岛轮廓、岛缘垂落的藤蔓与发光棱晶簇；**MUST NOT 复用局内棋盘背景贴图**——与 6 幅画卷区分；**MUST NOT 使用室内场景设定——严禁浅蓝竖条纹木墙、室内盆栽、木桌**；宪章 III 双兜底不破，空 assets 形态 MUST 完整可玩）；④ 切片裁切工具落 `src/render/backdrops.js`（2×2 四象限裁切 + 与 BoardRenderer 共享已加载 Image 缓存，避免重复解码）；⑤ `关卡 X` 点击 → main.js loadLevel(X)；⑥ 大厅为纯导航层，**MUST NOT 触碰 RulesEngine 判定语义与关卡数据**；⑦ **Δ18 补强**——徽标 MUST 为**双层立体 3D 卡通字**（`Glide` 琥珀暖金渐变立体字 + `Critters` 薄荷翠绿胶囊底托字），两侧 MUST 舒展**纯白「滑行风翼」**（左右各一）、点缀**棱镜星芒**，玩家 3D 萌宠头像 MUST 自标题上方探出并随呼吸轻微浮动；顶部右棱晶栏 MUST 使用**七彩切面棱晶 SVG** 图标 + 余额变化时的**弹跳动效**；棱晶星盘左右切换 MUST 支持**全部 6 大奇幻大陆**翻阅（默认落点 = 当前关归属大陆）；未点亮晶片 MUST 标注**逐块独立的 `第 X 关充能`**（X = 每第 3 关的困难位关卡号，如第 1 大陆 `第 3/6/9/12 关充能`），**第 4 块 MUST 附 `💎 ×150` 满充能大奖预览**；⑧ **修复 `STM.Backdrops.drawQuadrant` 源矩形口径缺陷**——MUST 以「可见源区域换算回原图像素后取半」取样（FR-035 §6：4 块晶片拼合 == 整幅 cover 裁切 == 局内所见背景）；⑨ **原创性红线（Δ17）**——大厅全部视觉载体 MUST 为原创设计，**严禁出现浅蓝竖条纹木墙、室内盆栽、木桌、风景木质相框、天蓝丝带横幅、金色庆典号角、天蓝圆弧顶盖**等竞品标志性视觉载体（MUST NOT 以任何变体形式含近色系/近造型/近材质出现）；⑧ **Δ17 仅换视觉皮肤**——六区上中下分区布局、功能语义、状态机、profile v2 键结构与数据流**零改动**，T065/T066 已交付的 profile.js 与 splash.js **零回归**。
- [x] T069 [US6] 实现设置弹窗与个人信息弹窗（Δ16e/FR-040，**Δ17 奶油果冻质感重制**）in `src/ui/modals.js`（新增）+ `css/style.css` + `src/core/profile.js`: ⓪ **共用视觉基底（Δ17 新增，两个弹窗 MUST 共享同一套原创视觉）**——**3D 奶油白圆角软胶卡片**（大圆角 + 柔和内阴影 + 顶部高光，形成软胶/果冻立体质感，与棋盘滑块同系）+ **琥珀金胶囊标题铭牌**（弹窗标题置于顶部的琥珀金渐变胶囊内）+ **棱晶圆角拨片开关**（所有开关控件为带棱晶质感的圆角拨片，滑块态发出虹彩微光）；**MUST NOT 使用天蓝圆弧顶盖**（竞品视觉元素清零红线）；① **设置弹窗（Settings Modal）**——上述奶油果冻质感卡片面板内，**仅三项核心实用开关**：BGM 背景音乐开关、SFX 游戏音效开关、触觉震动开关（`navigator.vibrate`；**设备不支持时该开关 MUST 显示为不可用并保持关闭、不得报错**）；**在局内打开设置时额外提供【返回主大厅】与【重新开始】两个按钮**，在大厅打开时不显示这两项；开关状态持久化至 profile v2 且与 FR-037 的 BGM/音效静音联动口径一致（**BGM 与 SFX 独立开关粒度**——Δ16 修订）；② **个人信息弹窗（Profile Modal）**——同一奶油果冻质感卡片面板内，可编辑的玩家**昵称输入框**（空值/超长时 MUST 有合理默认值与长度兜底）+ **3D 萌宠头像选择网格**（**直接复用已加载的 `sheet1~6` 高清萌宠切片**，**90 选 1（Δ21 扩容，由 T096 落地；本任务交付时为 45 选 1）**，**选中后打勾高亮**）；③ 昵称与头像选择持久化保存至 localStorage（profile v2），且在大厅头像按钮、结算层双风翼棱晶能量铭牌、传送门开启展板、失败页等**所有引用处同步生效**（单一数据源，零副本不同步）；④ 弹窗为模态（遮罩拦截底层输入），ESC/关闭按钮可退出，退出后焦点与底层交互恢复正常；⑤ **Δ18 补强**——个人信息弹窗底部 MUST 设 **【确认】按钮作为昵称与头像的统一落库保存点**（点击后全局同步刷新大厅头像按钮 / 徽标探头 / 结算铭牌 / 失败页 / 传送门展板等所有引用处——单一数据源零副本不同步）；两个弹窗右上角 MUST 补齐**圆润关闭按钮**（与 ESC / 点遮罩并列为退出路径，退出后焦点与底层交互恢复正常）；⑥ **原创性红线（Δ17）**——弹窗全部视觉载体 MUST 为原创设计，**严禁出现天蓝圆弧顶盖**等竞品标志性载体；⑦ **Δ17 仅换视觉皮肤**——开关项集合、持久化键结构与 FR-037 联动口径**零改动**，仅 CSS 皮肤层重做。
- [x] T070 [US6] 打通通关后的导航闭环与结算入口（Δ16e/FR-042 §3 前置，**Δ17 展板载体改称「新奇幻大陆传送门开启」**）in `src/main.js` + `src/ui/lobby.js`: ① 通关 → **结算层为必经中间态**（MUST NOT 直接跳回大厅）；② 结算层底部按钮的导航分支由「**是否本次触发 4/4 满充能**」这一确定性条件驱动：满充能 → **新奇幻大陆传送门开启全屏展板**，否则 → 主大厅；③ 每次通关结算时调用 profile 层结算本次奖励（FR-041 §1 确定性表：首通普通 +25 / 首通困难 +60 / 满画卷 +150 / 重复通关 +10，**幂等——重复通关不重复发首通奖励、不重复点亮拼图块**）；④ 通关困难位关时点亮当前画卷 1 块**能量晶片**（**FR-051** §2，1/4→4/4，Δ17 载体改称、数据模型零改动——Δ19 由原 FR-044 改号）；⑤ 结算完成后大厅 `关卡 X` 刷新至下一关（= 最新解锁关卡号）；⑥ 通关进度写入既有 `progress:v1` 键（**沿用 T050 逻辑，零改动**）——与 profile v2 键分工清晰（v1 = 关卡进度，v2 = 经济与档案）。
- [x] T071 [US6] 实现局内棱晶购买道具闭环（Δ16f/FR-041 / FR-024 / FR-025）in `src/main.js` + `src/core/profile.js`: ① 局内底部【撤回（Undo）】与【扳手（Wrench）】的免费次数（每关默认各 1 次，FR-025 可被关卡配置覆盖）**用尽后，该按钮角标 MUST 自动变为 `💎 50`**（角标形态切换——不再是数字次数）；② 玩家点击即**消耗 50 棱晶购买一次并立即生效使用**（撤销/转向立即执行）；③ **余额不足时 MUST 拒绝扣费、拒绝消耗道具次数并给出明确提示**（不得静默失败、不得扣成负数、余额恒 ≥0）；④ **扣费与生效 MUST 为原子操作**（防连点竞态——Edge Case「棱晶余额不足与购买竞态」铁律：余额恰等于价格时扣费后归零、道具仍正常生效，不得因余额为 0 而误判为「不足」）；⑤ 免费次数未用尽时点击 = 正常免费使用（**不扣费**）；⑥ 购买记录与道具次数回滚（Undo 自身不产生扣费回滚需求——道具购买是一次性消费，Undo 的是棋盘状态而非消费记录）；⑦ **Δ18 补强（扣费反馈）**——扣费成功 MUST 在触发按钮处飘出 **`-50 💎` 飘字**（DOM 飘字 + CSS 动画，动画结束自动移除）；余额不足 MUST 触发该按钮**轻晃**提示（`is-denied` 动画，零扣费零消耗）；⑧ **MUST NOT 引入任何真实货币、支付渠道、账号体系或联网校验**（宪章 I：商城/付费属赛后 backlog）。

### Batch C（T072~T075）—— 通关结算（Δ17 双风翼棱晶能量铭牌）/ 传送门开启展板 / 无倒计时复活 / 文档

> **Δ19 复核（2026-10-21）**：按用户「执行更新后的 Phase 8: Batch C」要求逐条核对本批次契约正文，发现**已勾选 ≠ 已实现**——3 处载体与任务描述不符 + 复活链路存在致命引擎缺陷。已补强并新增回归断言：
> - **T072 ③**：中部原只渲染**单块象限** → 改为完整 **2×2 棱晶星盘**（已点亮显大陆图景 / 未点亮呈紫晶盲盒态 / 新点亮象限单独翻转折出）。
> - **T073 ③**：预告区原指向**刚拼齐**的那片大陆 → 改为**下一片**（`nextIdx = pi + 1`）；手账文案原为**一行** → 改为**两行**。
> - **T074 ③**：`main.js` 早已传入 `onLobby` 但 `fail.js` **从未渲染** → 补齐**右上角返回主大厅**按钮（置于覆盖层右上角，避让居中标题铭牌）。
> - **T074 ④ 致命缺陷**：`applyPurify` 用 `tiles.filter()` 压缩数组 + 未同步 `state.board[r][c]` 栈 + 候选未过滤 `removed` → 复活后**数组下标与滑块 id 脱钩**（点击命中错误滑块）、**被净化滑块残留栈内**（大量滑块变"点不动的死块"）、选中幽灵块。修复为原地置 `removed` + 同步摘除 board 栈 + 候选过滤 `removed`；**三消/射线/齿轮/冰封/锁链/棱镜/死局判定口径逐条不变**。
> - **Δ19 大陆命名**：按 `assets/bg/bg{1..6}.png` 实绘画面校正 6 幅画卷名（庄园→浮岛 / 麦浪→风车麦谷 / 椰影→果冻 / 樱云秘境→樱吹雪 / 霞彩→热气球；bg6 不变）——**画像↔关卡区间映射、点亮节奏、经济数值表零改动**。
> - 回归断言：render-selftest Δ19 组 11 项 + playthrough 2 项（`⑥g` 寻址不变量 / `⑥h` 复活后仍可操作）。

- [x] T072 [US6] 实现通关结算层（20 词库赞美词 + 晶片点亮动效 + 棱晶飞入）（Δ16g/FR-042 §1，**Δ17 原创重制为双风翼棱晶能量铭牌**）in `src/ui/result.js`（新增）+ `css/style.css`: ① 顶部**原创【双风翼棱晶能量铭牌】**——**严禁使用天蓝丝带横幅与两侧金色庆典号角**（竞品视觉元素清零红线）。其构成：①a **风翼**——两侧舒展的**纯白流线型滑行风翼**（呼应徽标风翼母题，带柔和蓝白渐层与流动光泽）；①b **棱晶簇**——风翼下方簇拥**七彩折射棱晶簇**（虹彩色散棱面）承托铭牌；①c **铭牌**——**琥珀金渐变铭牌**由风翼与棱晶簇托起、居中承载赞美词；①d **萌宠跃起**——玩家当前选中的 3D 萌宠头像**在铭牌顶端乘着发光微缩滑板欢快跃起**（滑板带辉光拖尾与落点星芒）；①e **粒子**——萌宠周围迸发**棱晶星芒与光点粒子**（原创程序化粒子，零外部资源）；② 铭牌正中从 **20 个励志赞美词库**（运筹帷幄、势如破竹、妙手连珠、行云流水、洞若观火、算无遗策 等）中**随机抽取 1 个**展示（**随机仅限此处**——不影响任何奖励金额，FR-041 §5 确定性铁律不破）；③ 中部展示**棱晶星盘**与本次获得的**棱晶飞入动效**（本次获得金额 = 本关产出表实际值）；④ **若本关为困难位关（L3/L6/L9/…/L72），播放新能量晶片翻转点亮动画**；⑤ 底部按钮点击后返回主大厅（**当本次通关触发 4/4 满充能时改为通往新奇幻大陆传送门开启全屏展板**——导航分支由确定性条件驱动，Edge Case「结算层 → 大厅 → 传送门开启展板的导航闭环」铁律）；⑥ 结算层为**必经中间态**（MUST NOT 跳过直接回大厅）；⑦ 奖励发放幂等（同一关重复通关不重复发放首通奖励）；⑧ 结算层与展板为纯表现层，MUST NOT 改变关卡判定结果；⑨ **原创性红线（Δ17）**——结算层全部视觉载体 MUST 为原创设计，**严禁出现天蓝丝带横幅、金色庆典号角、礼花筒、风景木质相框**等竞品标志性载体（MUST NOT 以任何变体形式含近色系/近造型/近材质出现）；⑩ **Δ17 仅换视觉皮肤**——20 词库赞美词随机、奖励金额确定性表、导航分支条件与幂等发放规则**零改动**，仅 CSS/DOM 载体层重做。
- [x] T073 [US6] 实现新奇幻大陆传送门开启全屏展板（每 12 关满充能 4/4 触发）（Δ16g/FR-042 §2 / **FR-051**，**Δ17 载体改称「传送门开启」**）in `src/ui/result.js` + `css/style.css`: ① 触发条件 = **本次通关点亮当前大陆第 4 块能量晶片（4/4 满充能）**（大陆 = 12 关 = 4 个三关循环，**FR-051** §2——Δ19 由原 FR-044 改号）；② 全屏展示**刚拼齐的高清奇幻大陆全貌**（对应 `bg{1..6}` 的完整大图——与局内背景、星盘晶片切片同源同文件）；③ 展示**即将开启的下一片大陆预告**——**大陆名称** + **关卡区间徽章 `关卡 X-Y`**（如「关卡 13-24」）+ **原创治愈风景手账文案**（萌宠探险手账风格的短评）；④ 底部设 **`继续`** 大按钮，点击后返回主大厅并**刷新至下一关**（下一关 = 当前最新解锁关卡号）；⑤ 最后一幅画卷（bg6 = L61-72）拼齐时，预告区显示全通关终局文案而非下一卷预告（不得显示越界的 `关卡 X-Y` 区间）；⑥ 展板为纯表现层，零规则语义变更；⑦ **Δ17 落地要求**——展板视觉 MUST 为原创「时空传送门开启」构图（棱晶光柱 / 能量涡旋 / 大陆全貌聚焦），**MUST NOT 回退为风景木质相框**；⑧ 触发条件、导航链路（`继续` → 返回大厅并刷新至下一关）与 `+150 💎` 大奖发放**零改动**。
- [x] T074 [US6] 实现无倒计时失败界面与 100 棱晶清槽复活（Δ16g/FR-043 / FR-006 复活语义扩展；**Δ17 仅需沿用 T069 奶油果冻软胶卡片视觉基底，零功能改动**）in `src/ui/fail.js`（新增）+ `src/core/RulesEngine.js` + `src/core/GameState.js` + `css/style.css`: ① **无倒计时铁律**——MUST NOT 出现任何倒计时数字、剩余时间、进度条倒计时或「限时」话术；顶部展示温和鼓励文案（如「差一点就过关了！只有 XX% 的玩家能一次通过此关」，XX% 为与 FR-036 同源的**确定性通关率暗示值**，**非倒计时进度**，禁止被实现为递减计时器）；② 中部展示玩家当前 3D 萌宠头像配**委屈泪滴动效**（泪滴生成—滑落—消散循环）；③ 底部**仅设两个大按钮、无底部多余小字**（无「提示/教程/广告」文案）——① `💎 100 棱晶复活`：扣除 100 棱晶后立即将当前 Dock 槽内**所有滞留滑块**连同棋盘上**同花色配对滑块**一并**净化消除**、**腾空 Dock**、**恢复 3 点生命值**、**无缝继续本局**（关卡进度不清零、生命值回满、步数计数从复活点继续、**不得重置棋盘**）；② `重新开始`：重置本关（返回大厅的二级分支由实现期定）；④ **RulesEngine 新增 `applyPurify(state)` 纯函数**（本次 Δ16 唯一新增规则语义）——成组消除**恒为 3 的倍数**以维持花色守恒，**MUST NOT 出现「槽内余数非 3 倍数」的非法态**；配对块不足时以该花色的全部板面配对块成组消除并按既有口径回填槽位；⑤ 余额不足时复活按钮 MUST 置为不可用并提示「棱晶不足」，**不得扣费**；⑥ **前端与 Solver 共用同一 `applyPurify` 实现**（FR-032 铁律不破）；⑦ 复活**不改变**三消/射线/齿轮/冰封/解锁/棱镜/死局判定口径（仅新增净化消除与生命值恢复）；⑧ render-selftest/engine-selftest 增补复活花色守恒断言（T067 落地）。
- [x] T075 [US6] 更新 DESIGN_THOUGHTS.md 与 ITERATION_LOG.md 并终验 M5 交付（Δ16 全量收口）in `DESIGN_THOUGHTS.md` + `ITERATION_LOG.md`: ① **DESIGN_THOUGHTS.md** 增补「Δ16 外围商业化闭环」设计思路章节——HooLey 开机动画的品牌意图与 `oo` 磁力弹跳/白金流光的原创性论证、Glide Critters 徽标的原创构图论证（**含「严禁抄袭外部竞品地球仪/小鸟构图」的自查记录**）、主大厅六区布局的视觉层级理由（Δ17 追加：**棱晶星盘传送门**替代拼图相框的视觉叙事——「充能/唤醒/盲盒」三态如何比静态拼图更贴合 12 关节奏；**双风翼棱晶能量铭牌**替代彩带横幅的理由——与徽标风翼母题形成统一的品牌运动语言；**奶油果冻软胶卡片**与棋盘滑块同系的理由——让弹窗不显突兀地嵌入 3D 卡通世界）、6 幅画卷 × 12 关拼图节奏的进度叙事设计、棱晶经济数值表（+25/+60/+150/+10 / -50 / -100）的平衡依据、无倒计时失败页的「零压迫」设计原则；② **ITERATION_LOG.md** 增补 Δ16 迭代记录——扩容（既有 60 关逐字节零改写的验证证据）、profile v2 键设计取舍（与 progress v1 并存不迁移的向后兼容理由）、开机动画 autoplay 合规与跳过路径的实现细节、复活净化的花色守恒实现与边界情形（配对块不足时的回填口径）、实测截图与验收命令输出；③ **M5 终验**——`node tools/solver.js` exit 0（**72/72**）+ `node tools/solver.js --engine-selftest` 全绿 + `node tools/render-selftest.js` Δ16 断言全绿 + quickstart Δ16 场景组（**SC-009** 外围闭环五项要素 + 零倒计时 + 复活语义 / **SC-010** 棱晶产出/消耗逐项核对 + 余额恒非负 / **SC-011** 72 关零回归）逐条人工验收 + **US6-AC1~AC10 全过**（含 Δ17 修订后的 AC2/AC3 星盘六要素、AC4/AC5 奶油果冻基底、AC8 双风翼铭牌七要素、AC9 传送门开启展板）+ **⑥ 竞品视觉元素清零静态核查（Δ17 新增）——大厅/弹窗/结算/展板/失败页全量截图中「浅蓝竖条纹木墙 / 室内盆栽 / 木桌 / 风景木质相框 / 天蓝丝带横幅 / 金色庆典号角 / 天蓝圆弧顶盖」七项零命中** + 宪章红线复核（空 assets 与满 assets **双形态**各跑通一次全流程——含新增 `lobby_bg` 缺失兜底）+ **既有 L1~L60 逐字节零改写佐证**（FR-008 Δ16 扩容铁律）+ **全库 72 关口径统一**（spec/plan/tasks/代码四处无残留 60 关/20 景引用）；④ 确认 tasks.md 全项勾选。**未全过不得交付**。

### Batch D（T076）—— Δ20 实机三缺陷修复（拼图进度脱节 / 失败页出口失效 / 大厅视觉重制）

> **Δ20（2026-10-22）**：`/speckit-bug-assess` 就「主大厅与失败结算界面实机测试问题」产出 `assessment.md`（slug: `lobby-fail-ui-defects`，verdict=valid，severity=critical），`/speckit-bug-fix` 据其根因结论修复。**三项缺陷均经真实 Chrome CDP 实机探针复现并量化**（探针留存于 `.specify/bugs/lobby-fail-ui-defects/probe.js`）。**本批次属外围 UI 层修复——关卡数据、RulesEngine 判定语义、profile v2 键结构、经济数值表零改动**。

- [x] T076 [US6] 修复实机三缺陷（Δ20 Bug 1/Bug 2/Bug 3）in `src/main.js` + `src/core/profile.js` + `src/ui/lobby.js` + `css/style.css` + `tools/lobby-smoke.js` + `tools/render-selftest.js`: ① **Bug 1（拼图解锁进度与关卡进度脱节）**——晶片点亮态改以**关卡进度为权威源反推**：`maxPassed = max(progress.unlocked - 1, currentLevel - 1, ...progress.clearedLevels)`，第 q 块晶片充能阈值 `reqLevel = range[0] + 2 + 3*q`（第 1 大陆 = L3/L6/L9/L12），凡 `reqLevel <= maxPassed` 或落在 `clearedLevels` 集合内即判定为**已解锁点亮**并折射显示对应 `bg{n}` 象限高清图景，顶部铭牌进度 `X/4` 与之一致——MUST NOT 仅依赖 `paintingProgress`（该字段只在真实通关结算时递增，跳关 / 深链 / 老存档下必然与关卡进度发散）；`progress.clearedLevels` 新字段与 profile v2 的 `firstClear` 账本**取并集**维护（boot 时并入、每次通关记入），二者**并存不迁移**（v1 键结构向后兼容）；② **Bug 2（失败页「重新开始」/「返回主大厅」点击无响应）**——根因为 `STM.Fail.hide()` **仅在 `reviveWithPrisms()` 被调用**，而 `enterGame()` / `enterLobby()` 未关闭失败层，残留的 `#fail-root`（`z-index:26` + 完全不透明底衬）盖死新场景（实测：回调确实触发、`scene-lobby` 已切换，但 `#fail-root` 恒 `hidden=false`）；修复为在**唯一场景切换入口** `enterGame()` / `enterLobby()` 开头统一 `STM.Fail.hide()`（幂等），使「场景互斥」覆盖 Lobby / Game / Result / Fail 四层；③ **Bug 3（大厅中央面板土棕 + 8 个长方体凸起 + 标题左右分家塞进绿气泡）**——**删除** `.portal-gear` 系列 8 块长方体凸起（DOM + CSS）与其土棕底座，`.portal-ring` 改为**冰晶奶油白圆角画板**（`rgba(255,255,255,.78)` 底 + 2px `rgba(255,255,255,.95)` 内高光边框 + `0 12px 32px rgba(30,64,175,.18)` 蔚蓝投影），铭牌改**天空蓝/薄荷绿渐变胶囊 + 白字**，未点亮晶片改**浅冰蓝半透明底**（去掉斜叉折线，仅留居中锁图标 + 下方文字标注）；徽标 `Glide Critters` 改为**上下双行居中紧凑叠排**（上行 GLIDE 大字 / 下行 CRITTERS 稍小），**删除** `Critters` 绿色胶囊外框与两侧白色扁三角风翼，字色改**纯白→暖奶油黄立体渐变 + 天蓝/深海蓝厚描边**（MUST NOT 用硬 `text-shadow` 偏移实色块——会盖住 `background-clip:text` 渐变填充致字形发暗，实机截图确认），萌宠头像停靠字标正上方，左下角昵称条改**纯白/浅蓝磨砂胶囊 + 深蓝文字**；④ **背景贴图 `assets/bg/lobby_bg.jpeg` 零改动**；⑤ **Δ17 原创性红线七项保持零命中**（`render-selftest` 静态核查全绿）；⑥ 回归断言落地——`lobby-smoke` 新增 D 组（Bug 1：`关卡 12` → 铭牌 `3/4` + 前 3 块点亮 + 第 4 块仍锁）与 L 组（Bug 2：点「重新开始」/「返回主大厅」后 `#fail-root` MUST `hidden=true` 且场景正确切换），B 组改双行叠排/无胶囊/无风翼断言，C4 改「8 齿凸起已删除」。

---

## Phase 9: Milestone 6 — 半格错位图形棋盘、顶部待消槽 + IQ 指数 + 三大道具、白瓷碎裂视听升级（User Story 7 + US2 关卡重塑，Priority: P1）🎮 玩法重构

⚠️ **GATE**: 依赖 T075/T076（M5 外围闭环门 + Δ20 缺陷修复）通过。**Gameplay-Refactor-Last 定位**——玩法重构依赖已就绪的关卡体系（72 关）、渲染链、音频链、调试面板与外围 UI 层，避免外壳层与核心层反复互相干扰。**三项硬边界（本阶段独有）**：① **FR-008 的 Δ13/Δ16 逐字节零改写铁律就本轮受控让位**——既有 72 关 MUST 经 `tools/migrate-layout-72.js` 全量受控迁移为 v2 布局（**迁移后铁律复位**，`src/data/levels.js` 唯一合法变更通道仍为离线工具链）；② **M2 规则冻结自本阶段起解除**——FR-044 同层独立射线阻挡与压制锁定改写 `RulesEngine` 判定语义，MUST 全量重跑 M3 流水线并重验 72 关（FR-031 铁律不破），**M6 完成后新口径重新冻结**；③ **灵犀三消与乾坤洗牌的语义 MUST NOT 进入 RulesEngine 常规 tap 判定或 Solver 动作集**（FR-032 铁律——二者仅为道具层超常能力，否则玩家实际可玩局面集合将超出求解器验证过的可解局面集合）；**扳手下线**——Solver 动作集 `k=2`（use wrench）与死局谓词「扳手可救即非疑」豁免条款相应移除。

**Goal**: 棋盘改用奇偶层半格错位堆叠 + 36 套图形掩码轮廓成型，被压滑块 32% 变暗锁定且不可穿透选中；局内改为「顶栏 + IQ 指数条 + 顶部立体 7 格待消槽 + 底部三大道具」；每次三消迸发白瓷多边形碎裂并响起清脆薄瓷声；L1/L2 提供交互式教学；既有 72 关全量重塑为 v2 布局并 100% 必胜可解（FR-044~FR-050、SC-012~SC-016）

**Independent Test**: 进入 L1 见引导卡片 + 动态手指指引 → 跳转 L2 见层叠压制引导 → L3 起零提示 → 棋盘可见奇数层半格偏移与零缝隙贴合、被压卡牌变暗且点击无响应、跨层飞行互不干扰 → 顶栏严格 `关卡 X` 无 `/72` 后缀、IQ 条初值 90 且三消跳字递增/受阻归零 combo、7 格待消槽位于棋盘上方 → 底部三键：撤销可回滚、灵犀三消无视阻挡凑同花色完成碎裂、乾坤洗牌后仍必胜可解 → 三消瞬间槽位迸发 45~60 枚白瓷多边形碎片并响起清脆声 → `node tools/solver.js` exit 0（**72/72**）+ 零悬空违规计数为 0。

**验证**: migrate-layout-72 全量迁移 + Solver 全量门禁 72/72 + 瓶颈节奏断言 + engine-selftest Δ19 断言组（半格坐标/同层射线/压制锁定/零悬空）+ render-selftest Δ19 断言组 + quickstart Δ19 场景组。

### Batch 1（T077~T080）—— 引擎与关卡重塑

- [x] T077 [US7] 升级 RulesEngine 为奇偶层半格错位 + 压制锁定 + 同层射线阻挡（Δ19a/FR-044）in `src/core/RulesEngine.js` + `src/core/GameState.js`: ① **层感知坐标模型**——Tile 承载层号 `z`，渲染实坐标按 `z` 奇偶推导（偶数层 `z=0,2,4` → 整数格 `(r,c)`；奇数层 `z=1,3` → 半格位 `(r+0.5,c+0.5)`，恰压下层 `2×2` 四格的十字交界中心）；② **射线行走改为同层坐标系推进**——仅同一层 `z` 前方滑块阻挡，**不同层级的飞行路线互不干扰**（FR-044 §5）；奇数层越界判定同样基于半格实坐标（**半格偏移 MUST NOT 造成多飞/少飞一格**）；③ **压制锁定谓词（Overlap Lock）**——某滑块上方 `z+1` 层的压角位存在任何未移除滑块时，该滑块处于被压锁定态：MUST 不可点击（点击按「受阻/锁定」语义反馈，**MUST NOT 穿透选中其下层可点滑块**）；压角位对应关系 = 奇数层压下层 `2×2` 四格 / 偶数层被上方半格交点压制；上层全部移除后自动解锁；④ **零悬空谓词**——任何 `z>0` 滑块的 `z-1` 层支撑象限 MUST 非空，非法态 MUST 被前端兜底为不可点击（**MUST NOT 渲染为可玩滑块**）；⑤ **命中判定跨层取最上层**（按渲染实坐标最接近点击点），同层内命中唯一；⑥ **棱镜语义扩展为贯穿全层**——任何层的滑块撞棱镜均触发折射（FR-021/FR-022 单次折射上限不变）；⑦ **扳手下线**——移除 `applyItem(state,'wrench',tileId)` 与 Solver 动作集 `k=2`；死局谓词移除「扳手可救即非疑」豁免条款；⑧ **M2 冻结解除**——本任务为规则语义改写，MUST 触发全量流水线重跑与 72 关重验（FR-031）。
- [x] T078 [US7] 编写 36 套图形掩码库（Shape Masks）与成型规则（Δ19b/FR-045）in `src/render/shape-masks.js`（新增）+ `tools/level-config.js`: ① **36 套高辨识度轮廓掩码模板**（蝴蝶 / 爱心 / 双岛 / 拱桥 / 金字塔 / 钥匙孔 / 十字礼盒 / 沙漏 / 风车 / 皇冠 / 四叶草 / 六芒星 / 螺旋 / 蜂巢 等），每套定义为**格点集合**（可程序化推导的轮廓点集）；② **成型规则纯函数**——给定「模板 id + 层号 + 棋盘尺寸」输出该层滑块的落位集合；**纯数据 + 纯函数，前端与离线工具共用同一份定义**（宪章 II 零构建约束不破）；③ **模板 id MUST 落库于关卡 `cfg`**（运行时 MUST NOT 随机选取）；④ `level-config.js` 增补**层数矩阵参数**——L1=1 层 / L2=2 层 / L3 起按 `2-2-3`、`2-3-4` 随进度递进至普遍 ≥3 层 / `7×7` 简单关 ≤4 层 / `8×8` 困难关 ≤5 层（**对既有「L1 2 层 / L2 2 层 / 前期 2~3 层 / 中期 3~4 层 / 后期最高 5 层」档位的受控修订，迁移后以本矩阵为准**）；⑤ 增补掩码模板 id 参数（每关底层与上层各绑定一个模板，**MUST NOT 回退为底层 100% 正方形满铺**）；⑥ 文件 MUST 挂载于 `STM` 命名空间且加载序在 BoardRenderer 之前。
- [x] T079 [US2] 升级生成器为「单线咽喉点」瓶颈节奏 + 防悬空校验（Δ19b/FR-045 §3 + FR-008 Δ19 让位条款）in `tools/generator.js` + `tools/level-config.js`: ① **按掩码轮廓成型**——每关底层与上层 MUST 按 FR-045 的 36 套模板之一成型（**MUST NOT 回退正方形满铺**）；② **零悬空拒绝校验**——生成候选后逐滑块校验其 `z-1` 层支撑象限非空，违规候选 MUST 回炉重生成（FR-044 §3）；③ **瓶颈卡点算法（Bottleneck Pacing）**——构建「窄可行域咽喉点 → 解锁破局 → 连锁爽消 → 下一咽喉点」依赖链：每个咽喉点处合法可行操作集 MUST 被收窄至极少（形成"单线咽喉点"），破局后 MUST 释放连锁爽消段，再收窄至下一咽喉点；**咽喉点 MUST 由层叠压制关系构造而非同花色聚集**（FR-029 §8——挑战期三连簇仍恒为 0%）；④ **空间打散曲线按渲染实坐标度量**——FR-029 §1~§4 三档曲线在 v2 半格坐标下改用渲染实坐标（半格错位下的紧挨亦构成连坐，跨层同渲染位视为空间相邻），**任一档位上限 MUST NOT 放宽**；⑤ 层数与花色数、机制引入档位、开放花色数 ≤5、滑块总数恒为 3 的倍数等**不可回退项逐条保持**；⑥ 每候选经 Generator 三重验证（逆向构造→正向自检→Solver 门禁，D-10），种子化可复现。
- [x] T080 [US2] 重新生成并验证 72 关（v2 布局全量受控迁移，72/72 solvable）（Δ19a/Δ19b/FR-008 Δ19 让位条款 + FR-010/FR-031）in `tools/migrate-layout-72.js`（新增）+ `tools/solver.js` + `src/data/levels.js` + `tools/solver-report.json`: ① **新增迁移器 `tools/migrate-layout-72.js`**——对既有 L1~L72 执行一次性**全量受控迁移**：`tiles`（位置/层号）与 `cfg`（层数、掩码模板 id）按 v2 布局重算、`prisms` 就地保留（棱镜为贯穿全层的固定机关，位置语义不变）、`solutionMoves` 同步重算；② **不可回退项逐条断言**——关卡总数 72、三关一循环 7×7/7×7/8×8 波浪骨架与挑战位 `(id-4)%3==2`、三大生态阶段 L1~L24 / L25~L48 / L49~L72、滑块总数恒为 3 的倍数、开放花色数 ≤5、机制引入档位（L6 齿轮 / L11 冰封 / L21 钥匙锁链 / L31 棱镜）、FR-029 空间打散三档曲线——全部保留（**MUST NOT 因迁移而放宽**）；③ **层数矩阵按 FR-045 §2 复核**（L1=1 层 / L2=2 层 / L3 起递进至普遍 ≥3 层 / 7×7 简 ≤4 层 / 8×8 难 ≤5 层）；④ **迁移后逐关经 Generator 三重验证 + Solver 全量重验证**，任一关不可解 / 聚散度不达标 / 零悬空违规 MUST 回炉重生成；⑤ **Solver 报告 schema 增列瓶颈节奏指标**（咽喉点数 / 最小咽喉点可行操作集大小 / 最长连锁爽消段长度）与**零悬空违规计数**（FR-011 Δ19 增补维度、FR-030 Δ19 增补）；⑥ **迁移后 Δ13/Δ16 逐字节零改写铁律复位**——`src/data/levels.js` 唯一合法变更通道仍为离线工具链，前端运行期 MUST NOT 写入（**本任务完成后 levels.js 再次冻结**）；⑦ `node tools/solver.js` exit 0 且报告覆盖 **72/72 必胜可解**（FR-031 交付门禁）。

### Batch 2（T081~T084）—— 渲染器重塑与白瓷碎裂视听

- [x] T081 [US7] BoardRenderer 实现 gap=1px 零缝隙排布 + 半格错位绘制 + 被压卡牌 32% 变暗遮罩 + 内嵌式方向角标（Δ19a/FR-001/FR-044 §1）in `src/render/BoardRenderer.js` + `src/render/shape-masks.js`: ① **同层紧凑贴合排布**——同层相邻滑块间距 MUST 为 `gap = 1px`（零缝隙拼合）；② **奇偶层半格错位绘制**——偶数层绘于整数格、奇数层绘于 `(r+0.5,c+0.5)` 半格位（恰压下层 `2×2` 四格十字交界中心）；多层堆叠的层间阴影与阶梯偏移与半格坐标口径对齐；③ **被压卡牌 32% 深色变暗遮罩**——被压锁定态滑块牌面 MUST 渲染 32% 深色变暗遮罩，压住它的所有上层滑块移除后 MUST 恢复 100% 亮白；④ **方向箭头内嵌式**——箭头 MUST 内嵌于滑块圆角边缘内侧且 MUST NOT 被邻牌遮挡（**沿用 Δ15c 锐利宽翼三角箭头造型，零改动**）；⑤ **命中测试** MUST 跨层取最上层且同层内命中唯一（**命中查找 MUST 维持 O(层数) 而非全盘扫描**——性能预算）；⑥ 消费 `STM.ShapeMasks` 的掩码几何与成型规则渲染轮廓成型棋盘（**MUST NOT 回退正方形满铺**）；⑦ 渲染层为纯表现层——MUST NOT 影响判定（FR-032 不破）。
- [x] T082 [US7] 实现顶部待消槽 3D 多边形白瓷碎片爆裂飞溅特效（Δ19e/FR-049 + FR-047 §3）in `src/render/BoardRenderer.js` + `css/style.css`: ① **白瓷多边形碎裂 VFX**——每次 3 张同花色卡牌在**顶部待消槽触发消除**时， MUST 在**触发槽位**爆裂迸发 **45~60 枚带高光与阴影面片的 3D 不规则多边形白瓷碎片（Polygonal Shards）**——每枚 MUST 具备可辨识的立体面（**非纯色平面圆点**）；② **运动**——碎片 MUST 向四周及**棋盘下方**抛射、翻滚，并随重力飘落消散；③ **零外部资源**——碎片 MUST 为 Canvas 2D 程序化多边形路径绘制（**零贴图**，宪章 III 双兜底不破，空 assets 形态 MUST 完整可玩）；④ **性能预算**——MUST 设粒子上限与生命周期上限，确保 8×8×5 层满载关卡棋盘动效仍稳定 60 fps（**MUST NOT 触发 GC 抖动**）；⑤ **待消槽托盘样式**——7 格待消槽迁至棋盘上方后采用**厚重立体深木色 / 银色金属内凹卡槽托盘**样式；⑥ **纯表现层**——MUST NOT 影响三消判定、计分、IQ 结算与关卡可解性（FR-032 铁律不破）。
- [x] T083 [US7] 实现 SoundManager 清脆薄瓷碎裂音效合成（Δ19e/FR-050）in `src/audio/SoundManager.js`: ① **音色**——Web Audio API 纯代码实时合成「**薄瓷 / 冰晶清脆碎裂声 + 高频愉悦泛音颗粒（ASMR Crisp Shatter）**」，MUST 清爽通透、**绝不刺耳**；② **零音频文件**——MUST NOT 依赖任何 `.mp3`/`.wav`（宪章原则 III 音频红线不破）；③ **触发同步**——MUST 与 FR-049 的碎裂动效同步触发（同一三消事件）；④ **静音联动**——MUST 受既有 SFX 开关联动（MUST NOT 绕过静音开关发声，与 FR-037 口径一致）；⑤ **纯表现层**——MUST NOT 影响游戏逻辑与判定；⑥ 与既有受阻/飞出/三消音效链路隔离（专用合成器路径，避免音色互相污染）。
- [x] T084 [US7] 扩充离线流水线与自测断言组以覆盖 v2 布局与 Δ19 语义（Δ19a/Δ19b/Δ19e）in `tools/solver.js` + `tools/render-selftest.js`: ① `--engine-selftest` **新增 Δ19 断言组**——奇偶层半格坐标换算（偶数层 `(r,c)` / 奇数层 `(r+0.5,c+0.5)`）、同层射线独立（跨层滑块 MUST NOT 阻挡本层射线）、压制锁定（被压滑块不可点击 + 上层移除后解锁）、零悬空谓词（非法态被拒绝）、半格越界不多飞/少飞一格、棱镜贯穿全层折射；② `render-selftest` **新增 Δ19 断言组**——gap=1px 排布几何、半格绘制坐标、32% 变暗遮罩存在性、碎片数落入 45~60 区间、教学触发边界（L1/L2 触发 / L3+ 零触发）、IQ 递增量 `+(3+combo×2)` 与受阻 combo 归零；③ `solver.js` 报告断言增列**零悬空违规计数恒为 0**与**瓶颈节奏达标判定**；④ **MUST NOT 引入 jest/vitest 等任何 npm 依赖**（D-14 零测试框架铁律）。

### Batch 3（T085~T088）—— 局内 UI 重构、三大道具与新手引导

- [x] T085 [US7] 局内 UI 重构为「顶栏 + IQ 指数条 + 顶部立体 7 格待消槽 + 底部三大道具」（Δ19c/Δ19d/FR-047 + FR-048）in `index.html` + `css/style.css` + `src/main.js`: ① **顶部导航栏三区**——左上角并排【↩ 返回大厅】与【⚙️ 设置】两个**圆形立体按钮**（设置弹窗 MUST 与主大厅设置功能一致）、正中央**仅显示 `关卡 X`**（**MUST NOT 带 `/72` 总关数后缀**——静态断言）、右上角【💎 棱晶数量】（实时反映 profile v2 余额）；② **IQ 指数条**——MUST 位于顶栏下方、待消槽正上方，初始值 `IQ: 90`；每次成功三消 **IQ += `+(3 + combo × 2)`** 并带**跳字动效**与**趣味头衔阶段递进**；点击受阻反弹 **MUST NOT 扣减 IQ 但 MUST 立即重置 `combo = 0`**（被压锁定点击与普通受阻均视为受阻）；③ **7 格待消槽由屏幕底部移至屏幕上方**（IQ 条正下方、棋盘上方）——**MUST NOT 留在屏幕底部**；④ **布局互斥**——顶栏 / IQ 条 / 待消槽三者包围盒 MUST 两两不相交，棋盘 MUST 保留不低于原底部槽位等效的可视高度（9:16 竖屏比例口径不破）；⑤ **命中区域互斥**——点击待消槽 MUST NOT 触发棋盘点击，反之亦然；飞入动画终点坐标 MUST 由底部改为顶部；⑥ **IQ 为纯局内表现态**——MUST NOT 持久化至 profile v2、MUST NOT 影响棱晶余额与关卡进度。
- [x] T086 [US7] 实现底部三大道具：撤销 / 灵犀三消（Magnet Auto-Triple）/ 乾坤洗牌（Shuffle）（Δ19d/FR-048 + FR-024 + FR-025 + FR-041 §2）in `src/main.js` + `src/core/GameState.js` + `src/core/profile.js` + `css/style.css`: ① **道具栏恰为 3 枚原创微改图标的大圆按钮**（**扳手下线**——原「撤回 / 扳手」两键更新为「撤销 / 灵犀三消 / 乾坤洗牌」三键）；② **撤销**——回滚上一步操作（含该步触发的三消 / IQ 递增 / 层叠解锁等派生变化一并回滚）；③ **灵犀三消**——从当前场上所有卡牌（**含待消槽与棋盘各层**）找出 3 张相同花色，**优先匹配待消槽内已有花色**、同花色**优先抽取最顶层**卡牌以防悬空，**无视方向阻挡与层叠锁定**直接吸入待消槽完成一次三消碎裂；**全场同花色不足 3 张时 MUST 拒绝使用**（按钮禁用或明确提示）且 MUST NOT 消耗次数或棱晶；移除后 MUST 校验零悬空约束，无法满足则拒绝并回滚；④ **乾坤洗牌**——将棋盘上所有剩余滑块的**花色与方向**重新随机打乱重排，**保持三元组可解性映射**（确保洗牌后 100% 可通关，每种花色总数仍为 3 的倍数），播放**卡牌洗牌翻转动画**；MUST NOT 因方向重排破坏零悬空支撑关系（必要时仅重排方向与花色、保持位置与层号不变）；⑤ **次数与购买**——三键各 1 次免费次数（可被关卡配置覆盖），耗尽后角标变为 `💎 50`，点击即扣 50 棱晶并立即生效，扣费与生效 MUST 为原子操作，余额不足 MUST 零扣费零消耗 + 明确提示（FR-041 §2 + Δ18 飘字/轻晃反馈）；⑥ **语义边界铁律**——灵犀三消与乾坤洗牌的语义 MUST 只存在于道具层，**MUST NOT 写入 RulesEngine 常规 tap 判定或 Solver 动作集**（FR-032 铁律不破）。
- [x] T087 [US7] 实现 L1/L2 交互式玩法教学引导层（Δ19e/FR-046）in `src/ui/tutorial.js`（新增）+ `src/main.js` + `css/style.css` + `index.html`: ① **第 1 关（基础玩法教学）**——开局展示简洁美观的**玩法引导卡片**与**动态手指指引**（手指 MUST 指向一个**实际可飞出**的卡牌，保证指示有效），教会玩家「点击前方无阻挡的卡牌使其沿箭头滑入**上方待消槽**，集齐 3 张相同卡牌即可碎裂消除」；② **第 2 关（层叠压制教学）**——开局展示**层叠机制引导**，说明「深色卡牌被上层压住无法移动，必须先消去压在它上面的亮色上层卡牌才能解锁下层；**不同层之间的飞行路线互不干扰**」；③ **第 3 关及以后 MUST NOT 弹出任何新手提示**；④ **可跳过性与非阻塞性**——MUST 可随时点击跳过，MUST NOT 阻塞棋盘输入（MUST NOT 冻结核心循环，与 FR-036 横幅非模态口径一致）；⑤ **纯表现层**——MUST NOT 写入 `src/data/levels.js`、MUST NOT 影响 Solver 口径与可解性结论（FR-008 / FR-032 铁律不破）；⑥ 文件 MUST 挂载于 `STM` 命名空间且加载序在 main.js 之前。
- [x] T088 [US7] 全量测试与文档同步收口（Δ19 交付终验）in `DESIGN_THOUGHTS.md` + `ITERATION_LOG.md` + `specs/001-slide-triple-match-core/*.md`: ① **M6 终验**——`node tools/solver.js` exit 0（**72/72 必胜可解** + 零悬空违规计数为 0 + 瓶颈节奏指标达标）+ `node tools/solver.js --engine-selftest` 全绿（**含 Δ19 断言组**）+ `node tools/render-selftest.js` Δ19 断言全绿 + quickstart Δ19 场景组逐条人工验收 + **US7-AC1~AC21 全过**；② **SC-012~SC-016 逐项勾验**——半格错位与零悬空/压制锁定/同层射线独立逐关静态断言、36 套掩码轮廓 + 层数矩阵 + 瓶颈咽喉点节奏、顶栏三区 + IQ 递增量 + 顶部待消槽位置与包围盒互斥、三大道具语义与次数/购买闭环 + 洗牌后必胜可解、教学触发边界 + 碎裂 VFX 数量 + 碎裂音效静音联动；③ **宪章红线复核**——空 assets 目录 MUST 仍完整可玩（白瓷碎片与掩码轮廓均为程序化、**零新增二进制依赖**）；④ **FR-044 编号重排收口**——全库（原 `FR-044` → **FR-051**）引用逐处核对无编号双指；⑤ **DESIGN_THOUGHTS.md** 增补「Δ19 半格错位玩法重构」设计思路章节——半格错位堆叠为何把平面三消升级为空间拆解、36 套掩码的辨识度取舍、压制锁定与 32% 变暗的可读性论证、IQ 指数与趣味头衔的节奏设计、顶部待消槽的信息层级理由、三大道具的容错与破局定位、白瓷碎裂 VFX 与 ASMR 脆响的质感目标；⑥ **ITERATION_LOG.md** 增补 Δ19 迭代记录——M2 冻结解除与全量重验的证据、迁移让位条款的取舍与铁律复位、扳手下线的替代方案、US7 的实现偏离记录；⑦ 确认 tasks.md 全项勾选。**未全过不得交付**。

---

## Dependencies & Execution Order

### 里程碑门禁（硬顺序，覆盖一切并行）

Phase 1 → Phase 2 → **M1（T022 验收门）** → **M2（T039 冻结门 FREEZE）** → **M3（T052 量产门）** → **M3.5（T052g 表现层门）** → **M3.6（T052k Δ15 门——T052h 迁移先行 → T052i/T052j/T052k）** → **M4（T058 功能门 + T059 扩容钻探）** → Phase 7（T063 交付门）→ **M5（T075 外围闭环门）** → **M6（T088 玩法重构门）** → **M7（T095 体验与视觉门）** → **M8（T104 全图鉴与零死锁门）** → **M9（T113 声学与编舞门）**

- **⛔ 核心纪律**: M2 冻结门前**禁止**执行 T045 及之后的量产任务——Generator/Solver 与前端共用同一 RulesEngine 物理文件（D-02/FR-032），规则未冻结即量产 = 口径漂移 → 按 FR-031 全量重跑重验
- M1/M2 手工测试关（T019/T037）允许在门内先行（小规模、schema 与最终契约一致、M3 起被流水线整体替换）
- **⛔ Δ16 纪律**: M5 阶段除 **T064** 外，**任何任务 MUST NOT 写入 `src/data/levels.js`**（FR-008 Δ16 扩容铁律）；经济/档案/拼图态 MUST NOT 回写关卡数据（FR-041 §4 / FR-051 §3）
- **⛔ Δ19 纪律（新增）**: ① M6 阶段除 **T080**（migrate-layout-72）外，**任何任务 MUST NOT 写入 `src/data/levels.js`**——T080 迁移完成后铁律复位；② **M2 冻结自 T077 起解除**（FR-044 改写 RulesEngine 判定语义），T080 MUST 完成全量 72 关重验方可交付，**M6 完成后新口径重新冻结**；③ **灵犀三消与乾坤洗牌的语义 MUST NOT 进入 RulesEngine 常规 tap 判定或 Solver 动作集**（FR-032 铁律——否则玩家实际可玩局面集合将超出求解器验证过的可解局面集合）；④ **扳手下线**——Solver 动作集 `k=2` 与死局谓词「扳手可救即非疑」豁免条款 MUST 随 T077 同步移除。
- **⛔ Δ21 纪律（新增）**: ① M8 阶段除 **T098**（generator 受控全量重生成 + Solver 重验）外，**任何任务 MUST NOT 写入 `src/data/levels.js`**——图鉴 90 种/六画卷命名/后缀探测/质心居中/单层待消槽/无描边碎片全部为渲染与展示层，`suit` 字段与花色数 K **逐字节零改写**（FR-033 §8）；② **M6 新口径冻结自 T097/T098 起再次解除**（FR-045 §8 改写 RulesEngine 回合管线），T098 MUST 在含自愈语义下完成 72/72 重验，**之后重新冻结**；③ **静态门禁不得放宽**——Generator MUST 按 FR-045 §7 产出零迎头死锁初始布局，自愈仅为运行期防御；④ **画卷名唯一源**——`STM.Bestiary.PAINTINGS` 为六画卷展示名/文案唯一常量源，旧称仅作 `aliases`，禁止 UI 各处硬编码副本；⑤ **Hint/Bot 不以预设解为唯一源**——`solutionMoves` 仅作标准解参考，任意偏离后 MUST 走 `findBestNextMove(state)` 实时搜索（FR-027 Δ21）。
- **⛔ Δ22 纪律（新增）**: ① **M9 全程 MUST NOT 写入 `src/data/levels.js`、MUST NOT 修改 `RulesEngine.js` 的判定语义**——声学、连击、编舞全部为表现层，Solver 结论 MUST 与 M8 基线逐条一致（零漂移）；② **音频加载红线**——MUST 用 `HTMLAudioElement`，**MUST NOT 使用 `fetch + decodeAudioData`**（`file://` 下 `Origin: null` 必报 CORS，违反「双击秒开」红线）；交互级音效（`ber~`/`deng~`/落牌涟漪）与开机和弦 MUST 保持零文件 Web Audio 合成；③ **连击双口径不得拉齐**——`GameState.comboCount`（5 秒滑动窗）与 FR-047 §2 的 `M_combo`（受阻断连）MUST NOT 互相覆盖或隐式同步，要对齐必须先改 FR-047 §2；④ **编舞为纯运动学**——MUST NOT 改变卡牌花色/方向/坐标/层号，绘制排序 MUST 复用静态渲染同一比较器（MUST NOT 为动画另建排序），MUST NOT 触碰 Solver；⑤ **宪章门禁**——宪章 v3.0.0（音频分层）修订完成前，M9 MUST NOT 标记为交付完成。

### Phase Dependencies

- **Setup（Phase 1）**: 无依赖，立即开始
- **Foundational（Phase 2）**: 依赖 Phase 1；**阻塞全部里程碑**
- **M1（Phase 3）**: 依赖 Phase 2 完成
- **M2（Phase 4）**: 依赖 T022（M1 验收门）
- **M3（Phase 5）**: 依赖 T039（M2 冻结门）；性能预算=Solver 单关 2M 节点、全量 60 关 <5 分钟
- **M4（Phase 6）**: 依赖 T052k（M3.6 Δ15 门——空间打散/贴图渲染层与面板 UI 互不干扰基线就绪，Hint/Bot 消费重打散后批次的 solutionMoves）；Hint/Bot 依赖 levels.js 内嵌 solutionMoves，Δ6
- **Polish（Phase 7）**: 依赖 T058/T059 完成
- **M3.6 内部顺序（Δ15 钉死）**: T052h（redisperse 迁移——唯一改 levels.js）→ T052i（箭头+图标链）/ T052j（背景链）可并行开发但合入在 T052h 后 → T052k（检查点）收口
- **M5（Phase 8）**: 依赖 T058/T059/T063 完成；**内部顺序（Δ16 钉死）**:
  - **Batch A**: T064（**唯一改 levels.js**——尾部增量生成 L61~L72 + 章区间重划 + 背景映射改造）→ T065/T066/T067 可并行开发但**合入顺序在 T064 之后**（最终交付批次为 72 关数据）；T067 扩断言组可与 T064 并行但须在 T075 验收前收口
  - **Batch B**: T068（主大厅）→ T069（弹窗，可与 T068 并行——不同文件）→ T070（导航闭环）→ T071（局内购买，可与 T068/T069 并行——不同关注点）
  - **Batch C**: T072/T073（结算层与展板——同文件 `result.js`，**顺序执行**）→ T074（失败与复活——依赖 T071 的购买链路 + T065 的余额接口）→ T075（文档与终验，最后）
  - **Batch D**: T076（Δ20 实机三缺陷修复——已交付）
- **M6（Phase 9）**: 依赖 T075/T076 完成；**内部顺序（Δ19 钉死）**:
  - **Batch 1**: T077（RulesEngine 层感知改造——**M2 冻结解除的唯一源头**，须先于 T079/T080）→ T078（掩码库 + 层数矩阵，可与 T077 并行——不同文件、纯数据契约先行）→ T079（生成器瓶颈节奏 + 防悬空，依赖 T078 的掩码定义）→ T080（全量迁移 + 72 关重验，**唯一改 levels.js**，依赖 T077/T078/T079 全部完成）
  - **Batch 2**: T081（BoardRenderer 半格渲染，依赖 T077 的坐标口径 + T078 的掩码几何）→ T082（白瓷 VFX，与 T081 同文件 `BoardRenderer.js` **顺序执行**）→ T083（SoundManager 碎裂音效，与 T081/T082 **不同文件可并行**）→ T084（断言组，收口依赖 T077~T083）
  - **Batch 3**: T085（局内 UI 重构）→ T086（三大道具，依赖 T085 的道具栏容器 + T071 的购买链路 + T065 的余额接口）→ T087（教学引导层，**可与 T085/T086 并行**——不同文件 `tutorial.js`）→ T088（终验与文档，最后）
- **M7（Phase 10）**: 依赖 T088 完成；**内部顺序（Δ20 钉死）**:
  - **Batch 1**: T088（关卡生成器反聚簇重塑，**唯一改 levels.js**）→ T089（全量重验 + 报告）
  - **Batch 2**: T090（牌面渲染）→ T091（待消槽精修，同文件 `style.css` 顺序执行）
  - **Batch 3**: T092（`#vfx-canvas` 骨架）→ T093（碎片瀑布，同文件顺序执行）
  - **Batch 4**: T094（IQ 曲线 + 结算直通）→ T095（终验与文档）
- **M8（Phase 11）**: 依赖 T095 完成；**内部顺序（Δ21 钉死）**:
  - **Batch 1**: T096（90 图鉴 + 六画卷常量 + 后缀探测——纯渲染层，可与 T097 并行）→ T097（生成器静态零死锁校验，**不写 levels.js**）→ T098（RulesEngine 自愈 + 受控全量重生成 + 72/72 重验，**唯一改 levels.js**，依赖 T096/T097 全部完成）
  - **Batch 2**: T099（质心居中切图，依赖 T096 的图集索引）→ T100（待消槽单层卡片，可与 T099 并行——不同文件）→ T101（无描边碎片瀑布，依赖 T093 的 `#vfx-canvas` 骨架 + T100 的槽位坐标）
  - **Batch 3**: T102（残局启发式，依赖 T098 的自愈后合法操作口径）→ T103（面板音效/画卷名，可与 T102 并行——不同关注点）→ T104（终验与文档，最后）
- **M9（Phase 12）**: 依赖 T104 完成；**内部顺序（Δ22 钉死）**:
  - **Batch 1**: T105（资产核对 + 外部资产加载层——纯音频层，可与 T107 并行）→ T106（双轨重构 + 双 BGM 交叉淡变 + 事件音效时序，依赖 T105 的加载层与实例池）→ T107（Web Audio 合成 `ber~`/`deng~`/落牌涟漪——与 T106 **不同关注点可并行**，但同文件 `SoundManager.js` **合入顺序在 T106 之后**）
  - **Batch 2**: T108（`GameState` 连击态——**须先于 T109/T110**，二者消费其 `comboChanged` 事件）→ T109（分级升调 + 120ms 语音，依赖 T106 的 `playbackRate` 能力 + T108 的档位）与 T110（飘字动效，依赖 T108 的档位 + `#dock` DOM 结构）**不同文件可并行**
  - **Batch 3**: T111（BoardRenderer 编舞渲染态 + 15 模式常量表，依赖 T107 的落牌涟漪音接口）→ T112（main.js 抽取/快进/降级，依赖 T111 的渲染态 API）→ T113（终验与文档 + 宪章 v3.0.0 口径复核，最后）
  - **跨批次依赖注记**: T107（落牌涟漪）被 T111 消费、T106（`playbackRate` 能力）被 T109 消费——故 **Batch 2/3 的启动 MUST 等 Batch 1 全部合入**（本阶段"批次间顺序执行"的实际原因）

### User Story Mapping

- **US1（P1 核心循环）** → M1: T008~T022
- **US2（P1 72 关系统）** → M3: T040~T052；**M5 Δ16 扩容: T064**（60→72 尾部增量 + 章区间重划 + 背景映射改造）
- **US3（P2 四大机制）** → M2: T023~T029, T033, T034, T036~T038（+T039 共享）
- **US4（P3 道具+调试面板）** → M2 道具: T030~T032, T035（+T039 共享）；M4 面板: T053~T059
- **US5（P2 万物出发表现层）** → M3.5: T052a~T052g（FR-033→T052a/T052c、FR-034→T052b、FR-035→T052d、FR-036→T052e、FR-037→T052f、SC-007/008→T052g）；Δ15 增量 → M3.6: T052i/T052j（FR-033 §6/FR-034 §3/FR-035 §3 贴图链与箭头重做）；Δ16 背景口径重排 → M5: T064
- **US2（P1 关卡系统）Δ15 增量** → M3.6: T052h（FR-029 §1~§6 空间打散迁移 + FR-030/FR-011 聚散度指标）；SC-006 重定义 → T052k
- **US6（P2 商业化外围 UI 闭环）** → M5: T064~T075（FR-038→T066 开机动画、FR-039→T068 主大厅、FR-040→T069 设置/档案弹窗、FR-041→T065+T071 棱晶经济与购买闭环、FR-042→T070+T072+T073 结算与画卷展板、FR-043→T074 失败与棱晶复活、**FR-051**→T064+T072 拼图进度系统（Δ19 改号——原 FR-044）；SC-009/010/011→T075）
- **US7（P1 核心玩法布局重构 + 局内 UI 规范，Δ19 新增）** → M6: T077~T088（FR-044→T077 半格错位+压制锁定+同层射线、FR-045→T078+T079+T080 掩码库与瓶颈节奏与 72 关重塑、FR-046→T087 前两关教学、FR-047→T085 顶栏+IQ 条+顶部待消槽、FR-048→T086 三大道具、FR-049→T082 白瓷碎裂 VFX、FR-050→T083 清脆碎裂音效；FR-001/FR-008/FR-029 修订→T077+T079+T080；SC-012~SC-016→T088）
- **Δ21 增量（跨 US2/US4/US5/US7）** → M8: T096~T104（FR-008 Δ21 六画卷表 + FR-033 §2/§7/§8/§10→T096 90 图鉴与后缀自适应；FR-045 §7→T097 静态零死锁；FR-045 §8 + FR-006 Δ21→T098 运行期自愈 + 72 关重验；FR-044 §7→T099 质心居中；FR-047 §3→T100 单层待消槽；FR-049 §2/§3/§7→T101 无描边 Low-Poly 瀑布；FR-027 Δ21 + US4 Δ21→T102 残局启发式 / T103 音效布尔与画卷名；SC-007 90 种 + SC-017→T104）
- 故事并行性受里程碑门约束（US2 依赖 US3 规则冻结——**玩法机制先于量产**，Core-First Levels-Later；US5 表现层后置于量产完成——Presentation-Last；US6 外围闭环最后——Shell-Last）
- **Δ22 增量（US7 延伸）** → M9: T105~T113（**FR-050 Δ22 全景声学与连击反馈**→T105 资产核对与加载层 / T106 双轨重构与双 BGM 时序 / T107 交互级合成音效 / T109 连击分级升调与 120ms 语音；**FR-052 开局编舞**→T111 渲染态与 15 模式 / T112 抽取·快进·降级；**连击态**→T108；**飘字**→T110；**SC-018 + SC-019**→T113）
  - 注：**FR-050 在 Δ19 时原为「单条碎裂音效」**（→T083，已在 M6 交付并保留为音色基线），Δ22 就地扩容为全景声学与连击系统，故 M6 的 T083 与 M9 的 T105~T107 为**同一条 FR 的前后两段实现**，MUST NOT 视为重复任务；**FR-051 仍为「风景画卷拼图进度系统」**（→T064/T072，Δ22 未改动），编舞系统为 **FR-052**。

### Within Each Milestone

- RulesEngine 链内任务（同文件）严格顺序执行（无 [P]）
- Renderer/Audio/levels 数据任务可 [P] 并行（契约驱动，不依赖引擎实现细节）
- 自测（T038）与检查点（T022/T039/T052/T052g/T052k/T058/T063/T075/T088/T095/T104/T113）永远最后

### Parallel Opportunities

- Phase 2: T005 / T006 / T007 三任务并行（不同文件）
- M1: T016（花色表/Canvas 基建）、T018（音效）、T019（烟雾关数据）与引擎链 T008~T013 并行
- M2: T034（机关视觉）、T035（暂存 UI）、T036（机制音效）、T037（测试关）与引擎链并行
- M3: T040（参数表）与 Solver 链 T041~T044 并行；T050/T051（前端）与 tools/ 并行
- M3.5: T052a/T052b/T052d/T052e/T052f 五任务并行（不同文件/不同关注点——bestiary.js 新文件、BoardRenderer 底座、BoardRenderer+CSS 背景、main.js+CSS 横幅、SoundManager BGM；T052b 消费 T052a 的 Sprite 接口可先行契约开发）；T052c（映射断言）依赖 T052a 完成后收口
- M3.6: T052i（BoardRenderer 角标+图标链 + bestiary.js Emoji 表）与 T052j（backdrops.js/BoardRenderer 背景链）并行（不同渲染管线；BoardRenderer 共享文件内改动点不重叠——角标绘制 vs 背景绘制层）；两者可先行契约开发但**合入顺序在 T052h 迁移之后**；T052k 检查点最后
- M4: T053（面板容器）与 main.js 链并行
- Phase 7: T060 / T061 / T062 并行
- M5: Batch A 中 T065（profile.js 新文件）/ T066（splash.js 新文件 + CSS）/ T067（tools/ 断言组）三者可并行（不同文件、不同关注点）——**但合入顺序在 T064 之后**（最终交付批次为 72 关数据）；Batch B 中 T069（modals.js）与 T071（main.js 道具栏）可与 T068（lobby.js）并行开发；Batch C 中 T072 → T073 同文件 `result.js` **顺序执行**；T075 收口永远最后
- M6: Batch 1 中 T077（RulesEngine，规则链内）与 T078（shape-masks.js 新文件 + level-config.js，**纯数据契约先行**）可并行开发但**T079/T080 合入顺序在 T077 之后**（Solver 须消费新判定口径，FR-032）；Batch 2 中 T083（SoundManager）与 T081/T082（BoardRenderer）**不同文件可并行**，T081 → T082 同文件 `BoardRenderer.js` **顺序执行**；Batch 3 中 T087（tutorial.js 新文件）可与 T085/T086 并行，T086 依赖 T085 的道具栏容器，T088 收口永远最后
- M7: Batch 1 T088 → T089（同链路顺序）；Batch 2 T090 → T091（同文件 `style.css`）；Batch 3 T092 → T093（同文件 `BoardRenderer.js`）；Batch 4 T094 → T095（收口）
- M8: Batch 1 中 T096（bestiary/backdrops/lobby/modals，纯渲染层）与 T097（generator/level-config，**不写 levels.js**）可并行开发，**T098 合入顺序在 T096/T097 之后**（唯一改 levels.js + 规则链自愈）；Batch 2 中 T099（BoardRenderer 切图）与 T100（style.css/main.js 槽位样式）**不同文件可并行**，T101（`#vfx-canvas` 碎片）依赖 T100 的槽位坐标；Batch 3 中 T103（main.js 面板修复）可与 T102（RulesEngine/main.js 启发式）并行开发但合入在 T098 之后，T104 收口永远最后
- M9: Batch 1 中 T105（`assets/audio/` 核对 + 加载层）与 T107（Web Audio 合成三音）**不同关注点可并行开发**，但 T106/T107 同文件 `SoundManager.js` **合入顺序 T105 → T106 → T107**；Batch 2 中 T109（SoundManager/main.js 升调与语音）与 T110（main.js/style.css 飘字）**不同文件可并行**，二者均依赖 T108 的 `comboChanged` 事件；Batch 3 中 T111（BoardRenderer 编舞态）→ T112（main.js 抽取/快进）**同链路顺序执行**，T113 收口永远最后（含宪章 v3.0.0 口径复核）

---

## Parallel Example: Milestone 1

```text
# 引擎链（顺序执行，同一文件）:
T008 init/canTap → T009 射线行走 → T010 Dock/三消 → T011 terminal
→ T012 snapshot → T013 validateLevel

# 同时启动（不同文件、契约驱动、可并行）:
T016 BoardRenderer 基建+8 花色表   (src/render/BoardRenderer.js)
T018 SoundManager 核心音效          (src/audio/SoundManager.js)
T019 手工烟雾关 3~5 个              (src/data/levels.js)

# 汇合与集成:
T014/T015 GameState（依赖引擎 API）→ T020/T021 main.js 集成 → T022 M1 验收门
```

---

## Implementation Strategy

### MVP First（M1 Only）

1. Phase 1 + Phase 2 → file:// 零报错的命名空间骨架
2. M1 全部任务 → T022 验收 → **可玩 MVP**（US1 完整核心循环 + 烟雾关通关）
3. **STOP and VALIDATE**: 此时即可部署/演示核心玩法

### 里程碑增量交付（严格门禁，Core-First Levels-Later, Presentation-Last, Shell-Last）

1. M1 核心循环 → 验证 → M2 四机制+道具 → `--engine-selftest` 全绿 → **⛔ 规则冻结**
2. **冻结后** M3 流水线量产 50→60 关 → Solver 门禁 60/60 + 曲线门 → 完整关卡系统交付
3. M3.5 万物出发表现层（45 图鉴/底座/生态背景/横幅/BGM）→ render-selftest + 表现层门 → 视听体验升级交付（levels.js 恒不变）
4. M3.6 Δ15 增量（T052h 花色重打散迁移 → T052i/T052j 贴图双兜底与箭头重做 → T052k 门）→ 空间打散达标 + 视觉升级交付（FR-031 重验后 levels.js 再冻结）
5. M4 调试面板/Bot → SC-002 评审效率实证 → Q8 扩容钻探 → 回滚恢复 60 关
6. Phase 7 红线审计 + 全量 SC 勾验 → 交付
7. **M5 Δ16 外围闭环**（T064 72 关尾部扩容 → T065 profile v2 + T066 开机动画 + T067 断言组 → T068 主大厅 + T069 弹窗 + T070 导航闭环 + T071 局内购买 → T072 结算 + T073 展板 + T074 失败复活 → T075 文档与终验）→ **72 关完整交付 + 商业化外围 UI 闭环**（levels.js 于 T064 后再次冻结）
8. **M6 Δ19 玩法重构**（T077 RulesEngine 层感知改造 → T078 掩码库 + T079 瓶颈生成器 → T080 v2 布局全量迁移 + 72/72 重验 → T081 半格渲染 + T082 白瓷 VFX + T083 碎裂音效 + T084 断言组 → T085 局内 UI 重构 + T086 三大道具 + T087 教学引导 + T088 终验）→ **半格错位图形棋盘 + 顶部待消槽 + IQ 指数 + 三大道具 + 白瓷碎裂视听交付**（levels.js 于 T080 后再次冻结；**M2 规则冻结自 T077 解除、T088 后按新口径重新冻结**）
9. **M7 Δ20 体验与视觉规范**（T088~T089 反聚簇发牌 → T090~T091 玉石牌面 + 待消槽精修 → T092~T093 全屏白瓷瀑布 → T094~T095 IQ 50→200 + 结算直通 + 终验）→ **核心体验与视觉规范交付**（levels.js 于 T089 后再次冻结）
10. **M8 Δ21 全图鉴与零死锁**（T096 90 图鉴 + 六画卷 + 后缀探测 → T097 防迎头死锁生成 → T098 运行期自愈 + 72 关重验 → T099 质心居中 → T100 单层待消槽 → T101 无描边碎片瀑布 → T102 残局 Hint + T103 面板修复 → T104 终验）→ **90 种全图鉴 + 零死锁 + 质心居中 + 无描边碎片 + 调试面板全程可用交付**（**唯一改 levels.js 的通道为 T098 的 generator 受控重生成，之后再次冻结；图鉴扩容本身零改写 suit/K**）
11. **M9 Δ22 声学与编舞**（T105 资产核对 + 加载层 → T106 双轨重构与双 BGM 时序 + T107 交互级合成音效 → T108 连击态 + T109 分级升调与 120ms 语音 + T110 飘字 → T111 编舞渲染态与 15 模式 + T112 抽取/快进/降级 → T113 终验与宪章 v3.0.0 口径复核）→ **全景声学 + 5 秒连击夸赞 + 15 种开局编舞交付**（**全程零写 levels.js、零改 RulesEngine 判定语义；`file://` 双击下 8 音频全发声零 CORS 为硬门禁**）

### 返工规则（FR-031 变更协议）

任何 `src/data/levels.js` / `tools/level-config.js` / `src/core/RulesEngine.js` 变更 → **必须**重跑 `node tools/generator.js` + `node tools/solver.js` 全量重验并更新 solver-report.json 方可合入（提交信息附摘要）。

---

## Notes

- [P] = 不同文件、无未完成任务依赖；**里程碑门禁优先于一切 [P]**
- [Story] 标签映射 spec.md 用户故事；Setup/Foundational/Polish 无标签（横切）
- 每任务或逻辑组完成后 commit；检查点任务须附执行证据（命令输出/场景截图）
- 测试 = D-14 三层（Solver 门禁 / --engine-selftest / quickstart 人工场景）——零测试框架、零 npm 依赖
- M3 起 `src/data/levels.js` 为生成工件，**禁止手改**（变更仅经流水线，FR-031）；M3.6 的 redisperse-60 为唯一合法一次性迁移通道（Δ13 铁律受控让位——迁移后铁律即恢复）；M5 的 expand-60 尾部增量为唯一合法追加通道（Δ16 扩容铁律——既有 L1~L60 逐字节零改写）；**M6 的 migrate-layout-72 为唯一合法 v2 布局迁移通道（Δ19 让位条款——迁移后 Δ13/Δ16 铁律复位）**；**M8 的 generator 受控全量重生成（T098，FR-045 §7 静态零死锁重塑）为唯一合法变更通道（Δ21 让位条款——重验 72/72 后再次冻结）**
- 贴图资产纪律（Δ15/宪章 III v2.0.0）: `assets/` 目录为可选增强——核心代码零强制二进制依赖（空 assets 完整可玩为交付验收红线）；Emoji 兜底严禁 ctx.arc 手绘圆球加黑点；贴图加载 MUST 用 Image 元素相对路径（file:// 与静态服务一致）；**Δ21: `sheet{1..6}` 与 `bg{1..6}` 的 `.png` / `.jpg`（背景含 `.jpeg` / `.webp`）混排 MUST 走探测链自动自适应、静默失败、会话缓存，MUST NOT 因首选后缀不存在而误降级**
- Δ16 外围层纪律: `src/ui/*` 五模块 + `src/core/profile.js` 全部属表现/导航/持久化层——**零回写关卡数据**、零规则语义变更（唯一例外：RulesEngine `applyPurify` 复活净化，成组消除恒为 3 的倍数）；UI 层崩溃 MUST 仅降级为隐藏自身 + 提示，**绝不污染 session 状态**
- **Δ19 玩法重构纪律**: ① `src/render/shape-masks.js` + `src/ui/tutorial.js` 全部属表现层——**零回写关卡数据**；掩码模板 id 由生成器/迁移器落库、运行时 MUST NOT 随机选取；② **IQ 指数为纯局内表现态——MUST NOT 持久化至 profile v2**（不污染经济与进度）；③ **灵犀三消 / 乾坤洗牌语义仅存于道具层——MUST NOT 入 RulesEngine 与 Solver 动作集**（FR-032）；④ **扳手下线**——`useItem('wrench')`、Solver 动作集 `k=2`、死局谓词「扳手可救即非疑」豁免条款 MUST 一并移除；⑤ **FR-044 编号重排**——原 FR-044（风景画卷拼图进度系统）已改号 **FR-051**，任务/契约/代码注释内的引用 MUST 逐处核对无编号双指
- **Δ21 全图鉴与零死锁纪律**: ① **90 种图鉴 / 六画卷权威命名 / 后缀探测 / 质心居中 / 单层待消槽 / 无描边碎片全部属渲染与展示层**——`levels.js` 的 `suit` 字段与花色数 K MUST 逐字节零改写（FR-033 §8），唯一例外为 T098 的 generator 受控全量重生成（重验后再次冻结）；② **静态零迎头死锁为 Generator 硬门禁**——运行期自愈（T098）MUST NOT 替代或放宽静态校验（FR-045 §7）；③ **画卷名单一源**——`STM.Bestiary.PAINTINGS` 为六画卷主题名/文案的唯一常量源，旧称仅作 `aliases`，调试面板 / 结算铭牌 / 展板 / 大厅星盘 MUST NOT 各自维护副本；④ **Hint/Bot 实时性**——`solutionMoves` 仅作标准解参考，任意偏离后 MUST 走 `findBestNextMove(state)`（≤100k 节点 / ≤2s），MUST NOT 返回空提示或卡死；⑤ **碎片零描边红线**——MUST NOT 出现深灰/黑 `stroke`、深色 `shadowColor` 或深色轮廓贴图，立体感仅由折面明暗差与高光表达（FR-049 §7）。
- **Δ22 声学与编舞纪律**: ① **音频加载红线**——`assets/audio/` 8 文件 MUST 用 `HTMLAudioElement`（`new Audio` + `preload="auto"`），**MUST NOT 使用 `fetch + decodeAudioData`**（`file://` 下 `Origin: null` 必报 CORS，直接违反「双击秒开」）；交互级音效（`ber~`/`deng~`/落牌涟漪）与开机和弦 MUST 保持**零文件 Web Audio 合成**；② **降级兜底**——空 `assets/audio/` 目录形态 MUST 完整可玩（BGM 回退 FR-037 程序化合成、音效静默、控制台零报错）；③ **连击双口径**——`GameState.comboCount`（5 秒滑动窗）与 FR-047 §2 的 `M_combo`（受阻断连）MUST NOT 互相覆盖或隐式同步；连击 MUST 用时间戳差值判定，MUST NOT 用 rAF 帧计数；④ **编舞纯运动学**——MUST NOT 改变卡牌花色/方向/坐标/层号，绘制排序 MUST 复用静态渲染同一比较器 `(a.z-b.z)||(a.r-b.r)||(a.c-b.c)`，同渲染坐标高层延迟恒 `+60ms*z`（先落底层后落顶层）；动画中点击 MUST 快进 100% 且正常响应本次点击（**MUST NOT 吞点击**）；⑤ **宪章门禁**——宪章 v3.0.0（原则 III 改为「音频分层」）修订完成前，M9 MUST NOT 标记交付完成。
- 任务描述已内嵌契约关键数值（花色表/方向编码/反射表/预算/权重/CLI 参数等）；与契约冲突时以 contracts/ 四文档为准
- 执行任何任务前先核对宪章红线清单（constitution.md「技术边界与验收红线」表）

## Phase 10: Milestone 7 — 发牌反聚簇重塑、玉石麻将牌面与原位压暗、IQ 50-200 动态曲线、全屏白瓷碎裂瀑布与结算直通下一关（Δ20，Priority: P1）🎨 核心体验与视觉规范

⚠️ **GATE**: 依赖 Phase 9（T077~T087）通过。本阶段为 Δ20 的 7 项核心体验与视觉规范落地，严格遵循 4 个小步实施批次（Batch 1~Batch 4），每批次内任务可并行但批次间顺序执行。

### Batch 1 — 关卡生成器重塑（T088~T089）

- [x] T088 [Δ20] 修改 `tools/level-config.js` 与 `tools/generator.js`：恢复 4~24 种花色梯度，实现 Spatial Anti-Clustering（L12 同层正交相邻同花色对数=2）与 Directional Interlocking（生成器已内建互锁后处理）；重新生成 `src/data/levels.js` 72 关，经 `tools/solver.js` 全量验证 72/72 可解。
- [x] T089 [Δ20] 运行 `tools/solver.js` 全量重验，更新 `tools/solver-report.json`，确认 72/72 可解、Spatial Anti-Clustering 达标（L12 正交相邻同花色对数=2）。

### Batch 2 — 棋盘卡牌渲染与待消槽填充精修（T090~T091）

- [x] T090 [Δ20] 修改 `src/render/BoardRenderer.js` 与 `css/style.css`：实现 `sheet1~3.png` 切图向内缩进裁剪 9%（`margin = 0.09 * cellW`）去内框（**Δ21：图集扩至 `sheet1~6`，并改为「9% 内缩 + 非白包围盒质心自动居中」——T099 落地**）；加厚 3D 玉石麻将底座（温润奶油白牌面 + 底部 5px `#CBD5E1` 厚度边 + 1px `#94A3B8` 轮廓线，`gap = 1px`）；恢复零偏移原位被压变暗（`RulesEngine.isCovered(state, tile)` 为 true 时在自身圆角矩形路径内叠加 `rgba(15,23,42,0.28)`，0px 偏移）。
- [x] T091 [Δ20] 修改 `css/style.css`：`#dock .slot` 零内边距 100% 占满格子（`padding: 0`），飞入卡牌带 3D 奶油白底座与圆角，严禁槽位黑框与白色卡牌之间留出黑边空隙；更新 `quickstart.md` 人工场景核对口径。

### Batch 3 — 全屏白瓷碎片瀑布与卡牌碎裂延迟（T092~T093）

- [x] T092 [Δ20] 在 `index.html` 与 `css/style.css` 中新建全屏顶层 `#vfx-canvas`（`position: fixed; inset: 0; pointer-events: none; z-index: 950`），并在 `src/render/BoardRenderer.js` 中实现 `#dock` 匹配卡牌 180ms 震颤延迟消失（伴随震颤裂纹）。
- [x] T093 [Δ20] 在 `src/main.js` 与 `src/render/BoardRenderer.js` 中实现从 3 个 `#dock .slot` 的精确屏幕坐标（`getBoundingClientRect()`）处爆发 120~150 枚 100% 不透明（alpha=1.0）3D 白瓷碎片向下方倾泻的瀑布特效（亮白受光面 `#FFFFFF` + 冷灰折面 `#CBD5E1` + 细深灰轮廓线与阴影）；3 张槽内卡牌在碎片爆开瞬间碎裂消失；更新 SC-016 采样帧计数断言为 120~150。（**Δ21：碎片改为无描边 ≤3 折面 Low-Poly、三级尺度、三槽包围盒并集全宽、向左下倾泻——T101 取代本条的描边与尺寸口径**）

### Batch 4 — IQ 50→200 动态曲线、结算直通下一关与终验（T094~T095）

- [x] T094 [Δ20] 在 `src/main.js` 与 `css/style.css` 中实现 `IQ: 50 -> 200` 三维乘区动态衰减公式（`delta = Base * M_combo * M_error * M_time`，含连击乘区 0.80~1.12、失误惩罚 `Math.pow(0.90, errorCount)`、时间衰减 1.0→0.55、IQ≥175 渐近阻尼定格 198~200），去掉通关评语的生硬橙色方框（改为无边框 3D 流光金色渐变浮雕大字 + 柔和星芒光晕托底），将结算主按钮改为 `关卡 X+1` 直接进入下一关（附 `🏠 大厅` 圆形图标按钮）。
- [x] T095 [Δ20] 完成全量测试与文档同步：72 关 solver 72/72 可解、Spatial Anti-Clustering 与 Directional Interlocking 指标全部达标、白瓷碎片采样帧计数 120~150、IQ 初值静态断言 `IQ: 50`、结算按钮文案严格 `关卡 X` 且点击直达下一关；更新 `quickstart.md`、`contracts/` 与 `spec.md` 追溯表。

---

## Phase 11: Milestone 8 — 90 图标 6 画卷扩容、质心自动居中、零死锁保障、无描边多面体白瓷瀑布与残局 AI 提示修复（Δ21，Priority: P1）🧩 全图鉴与正确性收口

⚠️ **GATE**: 依赖 Phase 10（T088~T095，Δ20）通过。本阶段为 Δ21 的 6 项规范落地，严格划分为 **3 个独立实施批次（Batch 1~3）**；批次内任务可并行，**批次间顺序执行**。

**三项硬边界（本阶段独有）**：① **图鉴 90 种 / 六画卷权威命名 / 后缀探测 / 质心居中 / 单层待消槽 / 无描边碎片均为渲染与展示层**——MUST NOT 改写 `src/data/levels.js` 的 `suit` 字段、花色数 K 与任何结构参数（FR-033 §8 消解条款），MUST NOT 影响三消判定与 Solver 可解性结论（FR-032）；② **FR-045 §7/§8 属规则防御层新增语义**——M6 完成后重新冻结的 M2 口径就本轮再次解除，**T098 MUST 全量重生成/重验 72 关后再次冻结**；③ **运行期自愈 MUST NOT 被用来放宽 Generator 的静态零迎头死锁门禁**，`findBestNextMove(state)` 为有界启发式、MUST NOT 进入 Solver 动作集。

**Goal**: 图鉴池 45→90（Suit 0~89，六画卷 × 每 12 关解锁 15 种）+ 六画卷权威主题名/文案；`bg{1..6}`/`sheet{1..6}` 的 `.png/.jpg` 后缀自适应；同行/同列迎头死锁零容忍 + 运行期自愈；切图 9% 内缩 + 非白质心自动居中；`#dock` 填充槽单层卡片；无描边 Low-Poly 三槽全宽碎片瀑布；调试面板残局实时提示与音效开关修正（FR-008/FR-033/FR-044 §7/FR-045 §7-§8/FR-047 §3/FR-049/FR-027 Δ21，SC-017）。

**Independent Test**: 玩到 L1（`sheet1`）→ L13（`sheet2`）→ L61（`sheet6`）确认滑块图案按画卷切换且 90 种全部可见、同关同花色恒同图案；断网/删图集后仍以 Emoji 完整可玩；实机确认 `bg2.png` 与 `bg4.jpg` 均正常显示；任意关玩到一半故意乱点偏离 `solutionMoves` 后点「提示下一步」/「自动演示」均 ≤2s 响应并可持续到通关；音效复选框勾选时实际有声、取消时静音；`#dock` 填充槽无双层边框；三消碎片无黑边、三级尺度、从 3 槽全宽向左下倾泻；`node tools/solver.js` exit 0（72/72）+ 死锁对计数 0。

### Batch 1 — 90 花色扩容、防相向死锁生成与动态自愈（T096~T098）

- [x] T096 [US5] 图鉴池扩容至 90 种 + 六画卷权威命名与后缀自适应（Δ21a/Δ21b · FR-008 Δ21 表 / FR-033 §2 §7 §8 §10 / FR-042 / FR-051 别名）in `src/render/bestiary.js` + `src/render/backdrops.js` + `src/render/BoardRenderer.js` + `src/ui/lobby.js` + `src/ui/modals.js`: ① **90 条图鉴定义**——`Suit 0..89`，`STAGES` 改为六画卷累计池 `15/30/45/60/75/90`，`paintingIndex = Math.floor((level.id - 1) / 12) + 1`；Δ14/Δ16 的 45 条名称与 Emoji 码点**全量保留复用**并按题材归位（陆地萌宠→画卷 1 / 飞行动物→画卷 2 / 海洋动物→画卷 3 / 冰雪生灵→画卷 4 / 奇幻载具→画卷 5 / 神话瑞兽→画卷 6），新增 45 条补足各篇 15 种（名称 + Emoji 常量表固化于本文件）；② **图集索引**——`SHEETS = {1..6}`，`suit → (sheetIndex = Math.floor(suit / 15) + 1, cellIndex = suit % 15)`，4×4 网格**仅取前 15 格**（第 16 格保留不参与映射）；③ **后缀探测**——`loadSheet(n)` 按 `.png → .jpg` 逐个尝试并**会话内缓存命中结果**，仓库实存 `sheet1~5.jpg` / `sheet6.png` MUST 100% 命中；`backdrops.js` 对 `bg{1..6}` 按 `.png → .jpg → .jpeg → .webp` 同链探测，`bg2.png` / `bg4.jpg` MUST 正常显示；探测失败 MUST 静默（`Image.onerror` 链式回退，MUST NOT 产生未捕获 404 噪音），**仅当全部候选失败才进入 Emoji / 程序化兜底**；④ **权威画卷常量**——新增 `STM.Bestiary.PAINTINGS`（6 项：序号 / 关卡区间 / 主题名【晨曦雪峰庄园】【云端飞瀑风车岛】【碧浪椰影浅湾】【凛冬冰川镜湖】【云端霞彩航道】【星穹极光之巅】/ 介绍文案逐字 / `bg` 文件名 / 累计池上界 / `aliases` 旧称），作为调试面板、结算星盘铭牌、传送门展板、大厅星盘、档案头像网格的**单一数据源**，禁止各处硬编码副本；旧画卷名保留为别名 MUST NOT 删除；⑤ **渲染源链**——`assets/icons/{suit}.png`（0~89，可选覆盖）→ 图集切片（主来源）→ 原生 Emoji（`ctx.fillText`，严禁 `ctx.arc` 手绘圆球）；同关内同 suit 恒同来源、不闪烁；⑥ **头像网格扩容**——大厅档案弹窗由 45 选 1 扩为 **90 选 1**（复用六张图集切片，选中打勾）；⑦ **纯渲染层铁律**——MUST NOT 改写 `levels.js` 的 suit 字段与花色数 K，MUST NOT 触碰 RulesEngine 判定（FR-033 §8 / FR-032）。
- [x] T097 [US2] 生成器与洗牌路径加入「同行/同列迎头死锁零容忍」校验（Δ21c/FR-045 §7 + FR-008 Δ21 排序约束）in `tools/generator.js` + `tools/level-config.js` + `src/core/GameState.js`: ① **死锁对定义**——同一层 `z` 内，同行相邻（含中间空位可穿透）的 `R` 与 `L` 相向对、同列 `D` 与 `U` 相向对，且**两者之间不存在可先离场的第三块滑块（无外向出口）**，即构成迎头死锁对；② **静态拒绝**——生成候选后逐行/逐列扫描，命中死锁对 MUST 回炉重生成（`level-config.js` 提供阈值/开关参数）；`Directional Interlocking` 的「相向交错」**仅在该行/列存在第三出口时允许**，否则 MUST 改正交交错（本约束优先于造型偏好）；③ **洗牌同规则**——乾坤洗牌（FR-048 §3）重排花色/方向后 MUST 走同一校验，禁止以洗牌引入新的迎头死锁对；④ **报告字段**——`tools/solver.js` 报告增列 `headOnDeadlockPairs`（初始局面 + 每关随机操作序列采样）与 `minLegalMoves`（每步可飞出滑块数下限）；⑤ **不误判**——存在第三块可先离场时 MUST NOT 判为死锁（spec Edge Case「迎头死锁与自愈的判定边界」）；⑥ 本任务**不写 levels.js**（重生成由 T098 统一执行）。
- [x] T098 [US7] RulesEngine 运行期死锁自愈 + 全量重生成并重验 72 关（Δ21c/FR-045 §8 / FR-006 Δ21 / FR-031）in `src/core/RulesEngine.js` + `src/core/GameState.js` + `tools/generator.js` + `tools/solver.js` + `src/data/levels.js` + `tools/solver-report.json`: ① **自愈 API**——新增 `findHeadOnDeadlocks(state)` 与 `selfHealDeadlocks(state)`（纯函数、UMD 双导出、前端与 Solver 共用）；② **触发点**——`GameState` 回合管线在**每次操作结算完成后**调用（普通飞出 / 受阻反弹 / 齿轮旋转 / 破冰 / 锁链解锁 / 三消 / 灵犀三消 / 乾坤洗牌），MUST NOT 遗漏齿轮旋转与洗牌两条路径；③ **自愈策略**——扫描同层死锁对并**原地旋转 ≤4 次**，优先保证「旋转后立即出现可飞出滑块」；达到上限仍无合法操作时触发 FR-048 §3 乾坤洗牌兜底并提示，**MUST NOT 直接判负**（FR-006「互锁死局」降级为防御性兜底）；④ **快照与守恒**——自愈引起的方向变化 MUST 进入 Undo 快照（撤销可回滚），MUST NOT 破坏花色守恒、零悬空支撑与 3 倍数不变量；⑤ **全量重生成**——`node tools/generator.js` 受控重生成 L1~L72（FR-045 §7 静态零死锁 + Δ19 掩码/瓶颈/零悬空 + Δ20 反聚簇与花色梯度全部保持），`node tools/solver.js` 在**含自愈语义**口径下 exit 0（**72/72**）+ `headOnDeadlockPairs = 0` + 自愈旋转分布 ≤4；⑥ **冻结复位**——重验证通过后 `levels.js` 再次冻结（唯一合法变更通道仍为离线工具链），M2 新口径重新生效；⑦ **断言组**——`--engine-selftest` 增补「死锁判定（第三出口不误判）/ 自愈 ≤4 次 / 自愈后必有可飞出块 / 自愈入 Undo 且守恒」。

### Batch 2 — 切图质心自动居中、待消槽去双层框与无描边多面体碎片瀑布（T099~T101）

- [x] T099 [US7] BoardRenderer 切图改为「9% 内缩 + 非白包围盒质心自动居中」（Δ21b/FR-044 §7）in `src/render/BoardRenderer.js` + `src/render/bestiary.js`: ① **串联口径**——先按 `margin = 0.09 * cellW` 内缩裁掉 AI 原图自带的浅色内嵌方框线，再在剩余区域内求非白包围盒（**MUST NOT 顺序颠倒**）；② **非白判定**——逐像素 `R < 248 || G < 248 || B < 248` 视为有效内容，求 `[minX, maxX, minY, maxY]`；③ **质心对齐**——将包围盒**几何中心等比缩放对齐到 `256×256` 离屏切片的 `(128, 128)`**（保持宽高比，MUST NOT 拉伸变形），并保留统一内边距；④ **边界兜底**——内缩后非白像素触及裁切边界（主体被切）时 MUST 退回完整单元格重求包围盒，MUST NOT 产出残缺切片；全白空单元 MUST 回退「整格居中 + 整格缩放」，MUST NOT 产出空白切片或抛错；⑤ **缓存**——切片按 `suit` 惰性生成、同图集仅解码一次、会话内复用（不重复解码/不重复扫描）；⑥ **验证**——90 个切片的包围盒中心与 `(128,128)` 偏差 ≤2px（render-selftest 断言）；⑦ **纯表现层**——MUST NOT 影响命中判定、Solver 与关卡数据（FR-032）。
- [x] T100 [US7] `#dock` 填充槽位改为单层 3D 奶油白卡片（Δ21b/FR-047 §3）in `css/style.css` + `src/main.js` + `index.html`: ① **填充态**——为已填入卡牌的槽位加 `is-filled` 状态类（或使用 `:has(.tile)`），MUST 移除 `.slot` 的 `border` / `padding` / `background`，仅显示卡牌自身的单层 3D 奶油白圆角底座；**严禁「槽框描边 + 卡牌边框」叠成双层边框**；② **空槽保留**——未填充槽位 MUST 仍呈现厚重立体深木色/银色金属内凹卡槽托盘样式（不得变成纯空白，玩家须能辨识剩余槽位数）；③ **可读性**——相邻两张卡牌的圆角与 3D 底座 MUST 可分辨、视觉间隙 ≥1px（不得与相邻槽位粘连）；槽内卡牌的花色图案与朝向箭头 MUST 保持完整可见、不被裁切；④ **一致性**——顶部待消槽的填充/空置两态在 9:16、`<720px` 与 `≥1024px` 三档布局下均不得溢出或错位；⑤ **纯表现层**——MUST NOT 改变槽位格数（7 格）、命中区域互斥与三消判定。
- [x] T101 [US7] 三消碎片重做为「无描边 Low-Poly 多面体瀑布」（Δ21d/FR-049 §2 §3 §7）in `src/render/BoardRenderer.js` + `src/main.js` + `css/style.css`: ① **零描边**——MUST 彻底移除碎片外圈深灰/黑 `stroke`、深色 `shadowColor` 描边阴影与深色轮廓贴图；立体感**仅允许**由折面明暗差与面片高光表达；② **形态**——每枚由 **2~3 个明暗折面**拼接成无描边 Low-Poly 多面体：`#FFFFFF` 亮面 + `#CBD5E1` 浅灰折面 + `#94A3B8` 冷灰暗面（单枚面数 ≤3）；③ **三级尺度**——**大块尖锐裂片 18~28px ≈15% + 中块多面体 8~16px ≈45% + 细碎白瓷粉 2~6px ≈40%**（严禁全部同尺寸纯色平面圆点）；④ **喷涌源区**——从 3 个匹配 `#dock .slot` 的 `getBoundingClientRect()` **包围盒并集全宽**喷出（MUST NOT 单点/单槽），向**屏幕左下方与正下方**倾泻飘落；总数 **120~150 枚**、100% 不透明（alpha = 1.0）；⑤ **时序**——3 张槽内卡牌保留 `180ms` 震颤裂纹后碎裂消失，碎片在同帧爆开；⑥ **性能**——禁用逐枚描边/阴影模糊，设粒子上限与生命周期上限，8×8×5 层满载仍稳定 60 fps 且无 GC 抖动；⑦ **纯表现层**——MUST NOT 影响三消判定、IQ 结算、奖励与可解性（FR-032）。

### Batch 3 — 调试面板残局提示/自动演示修复、音效开关修正与终验（T102~T104）

- [x] T102  [US4] 实现 `findBestNextMove(state)` 残局实时启发式并接入 Hint / 自动演示（Δ21d/FR-027 Δ21）in `src/main.js` + `src/core/RulesEngine.js` + `src/core/GameState.js`: ① **输入为当前状态**——以**当前棋盘 + Dock**（含层号、方向、机关、冰封/锁链、棱镜、压制锁定）为输入，MUST NOT 仅回放 `solutionMoves`；玩家中途偏离、Undo、洗牌、自愈旋转造成的偏离 MUST 全部兼容；② **启发式权重顺序**——① 优先凑齐 Dock 内已有花色的三消（避免爆槽）→ ② 解锁上层阻挡（移除压角块）→ ③ 打开可飞出通道（增加合法操作数）；③ **合法性复用引擎**——候选点击必须经 `RulesEngine` 同一判定（射线/同层/压制/冰封/锁链/棱镜），MUST NOT 自建简化规则；④ **预算**——有界搜索 ≤100k 节点、响应 ≤2s（目标 <300ms），MUST NOT 造成主线程长时间卡死；⑤ **兜底**——极端残局无法直接给出完整解时 MAY 降级「贪心步进 + 必要时乾坤洗牌」，但 MUST 返回至少一个合法点击，MUST NOT 返回空提示或卡死；⑥ **自动演示**——每步可见、循环调用直至通关（Bot 既有入口复用），中途玩家接管后再次点击仍立即生效；⑦ **语义边界**——启发式权重与预算属调试面板层，MUST NOT 进入 Solver 动作集或改变判定口径（FR-032）。
- [x] T103 [US4] 修复调试面板音效复选框布尔反转并显示画卷主题名（Δ21d/US4 Δ21 / FR-027）in `src/main.js` + `index.html` + `src/ui/modals.js` + `css/style.css`: ① **音效同向**——音效复选框 `checked` MUST 与 `SoundManager` / profile 的静音态严格同向（勾选 = 有声 `muted: false`，取消 = 静音 `muted: true`），修复 Δ20 遗留的取反逻辑；切换后 MUST 立即生效并与设置弹窗的三项开关状态同步（单一数据源，不出现两处相反）；② **画卷信息区**——面板 MUST 显示当前关卡所属画卷的**主题名 + 介绍文案**，逐字取自 `STM.Bestiary.PAINTINGS`（如 L1~L12 →【晨曦雪峰庄园】+ 对应文案）；MUST NOT 再显示「主题：—」或空占位；跳关/重新开始/进入下一关后 MUST 实时刷新；③ **标签一致**——面板内「提示下一步」「自动演示」「音效」「画卷主题」等文案与既有调试面板风格一致，移动端抽屉可隐藏/唤出且不影响布局；④ **纯调试层**——MUST NOT 影响关卡判定、进度与经济（FR-041 §4 / FR-051 §3）。
- [x] T104 全量回归测试与文档收口（Δ21 交付终验）in `quickstart.md` + `contracts/` + `data-model.md` + `spec.md` + `DESIGN_THOUGHTS.md` + `ITERATION_LOG.md`: ① **门禁**——`node tools/solver.js` exit 0（**72/72**，含自愈语义）+ `headOnDeadlockPairs = 0` + `minLegalMoves ≥ 1`；`node tools/solver.js --engine-selftest` Δ21 断言组全绿；`node tools/render-selftest.js` Δ21 断言组全绿；② **SC-017 ①~⑦ 逐条人工验收**——90 切片全部可渲染且映射零错位 / 六画卷主题名与文案在结算层·展板·调试面板逐字一致 / `bg2.png`+`bg4.jpg`+`sheet1~5.jpg`+`sheet6.png` 混排零误降级 / 72 关初始 + 每关 200 次随机操作采样死锁对 = 0 且每步可飞出 ≥1 / 90 切片质心偏差 ≤2px / `#dock` 填充槽单层卡片（border/padding/background 失效）/ 碎片零深色描边 + 三级尺度 + 三槽全宽 / 残局 Hint 与自动演示 ≤2s 且可持续到通关 / 音效复选框同向 / 面板画卷名正确；③ **SC-007 90 种口径**——同关同花色恒同图案、池切换仅在每 12 关边界（15→30→45→60→75→90）、`levels.js` suit 字段与 K 逐字节零改写（git diff 佐证）；④ **空/满 assets 双形态**——空 assets 以 Emoji + 程序化背景完整可玩（宪章 III 红线），满 assets 全流程一次通过；⑤ **全库命名一致性**——spec / plan / tasks / 代码注释 / UI 文案六画卷名称零冲突（旧称仅作 aliases）；⑥ **文档同步**——`quickstart.md` 增补 Δ21 场景组、`contracts/` 四文档清除 STALE 并同步 FR-045 §7/§8 与 FR-044 §7 口径、`data-model.md` 更新 Bestiary Entry（90）/ Deadlock Guard / Eco Background / Stage Suit Mapping、`DESIGN_THOUGHTS.md` 增补「Δ21 全图鉴与零死锁」章节（90 种节奏、后缀自适应取舍、质心居中的视觉一致性论证、无描边 Low-Poly 的质感目标、自愈为何不能替代静态门禁）、`ITERATION_LOG.md` 记录重生成/重验证据与实测截图；⑦ 确认 tasks.md 全项勾选。**未全过不得交付**。

---

## Phase 12: Milestone 9 — 全景混合声学引擎、5 秒连击语音飘字与 15 种开局卡牌进场编舞（Δ22，Priority: P1）🎵 声学与编舞收口

⚠️ **GATE**: 依赖 Phase 11（T096~T104，Δ21）通过。本阶段为 Δ22 的声学与编舞规范落地，严格划分为 **3 个独立实施批次（Batch 1~3）**；批次内任务可并行，**批次间顺序执行**。

**三项硬边界（本阶段独有）**：① **宪章原则 III 音频红线第二次受控让位**——BGM（`bgm_lobby` / `bgm_game`）、事件级音效（`sfx_win` / `sfx_lose`）与三阶语音夸赞（`sfx_voice_*`）改用 `assets/audio/` 8 个本地 mp3，MUST 经 `HTMLAudioElement` 加载，**严禁 `fetch + decodeAudioData`**（`file://` 下 `Origin: null` 必报 CORS，直接违反「双击秒开」红线）；交互级音效（`ber~` / `deng~` / 落牌涟漪）与开机和弦**仍 MUST 零文件 Web Audio 实时合成**；宪章须正式升 **v3.0.0**，修订前以 spec FR-050 §5 + Edge Cases「音频红线部分让位」为唯一有效口径。② **连击双口径并存**——`GameState.comboCount`（5 秒滑动窗，驱动音效/飘字）与 FR-047 §2 的 IQ 乘区 `M_combo`（受阻断连，驱动 IQ 结算）**MUST NOT 互相覆盖或隐式同步**；要对齐必须先改 FR-047 §2。③ **开局编舞为纯运动学**——MUST NOT 改变卡牌花色/方向/坐标/层号，绘制排序 MUST 复用静态渲染同一比较器，MUST NOT 触碰 `RulesEngine` 或 Solver（FR-032）。

**Goal**: `SoundManager` 由「纯合成」重构为**混合双轨**——`assets/audio/` 8 个 mp3 经 `HTMLAudioElement` 挂载（双 BGM 循环 + `400ms` 交叉淡变、`sfx_shatter` 支持 `playbackRate` 变调、`sfx_win` 延迟 250ms 且压低 BGM 50%、`sfx_lose` 槽满瞬发、三阶语音），叠加 Web Audio 实时合成的 `ber~`（点击飞入）/ `deng~`（受阻反弹）/ 骨牌落子音；**5.0 秒滑动窗连击**按 Combo 1~5+ 阶梯驱动碎裂升调（1.00→1.25）、延迟 `120ms` 播放三阶夸赞语音、并在 `#dock` 下方渲染微光艺术字飘字；**15 种开局卡牌进场编舞**（`0~180ms` 纯风景底图 → `180~820ms` 依次落定，同步落子涟漪音，点击即刻快进）（FR-050 Δ22 / FR-052 / SC-018 / SC-019）。

**Independent Test**: 双击 `index.html`（`file://`）确认 8 个音频全部可发声且控制台零 CORS 报错；进关听 `bgm_lobby` 淡出、`bgm_game` 淡入，返回大厅反向切换无叠音；点合法卡牌听 `ber~` + 落槽轻叩、点受阻卡牌听 `deng~`（两者盲听可区分）；5 秒内连消 5 次核对碎裂声逐级升调 + 语音延迟 120ms + 飘字文案 `Combo ×2`/`Good! ×3`/`Great! ×4`/`Unbelievable! ×N`，停 5 秒后再消恢复原速；连续进出关卡 16 次确认 15 种编舞全部出现且相邻不重复、卡牌恒「低层先落高层后落」零穿模；动画进行中点击棋盘确认立即快进到 100% 且该次点击被正常响应；临时重命名 `assets/audio/` 为空目录确认游戏完整可玩、BGM 回退程序化合成、零报错。

### Batch 1 — 混合声学引擎与 8 大音频资产挂载（T105~T107）

- [x] T105 [US7] 核对 `assets/audio/` 8 文件并落地外部资产加载层（Δ22a/FR-050 §2）in `src/audio/SoundManager.js` + `assets/audio/`: ① **资产核对**——逐项确认 `bgm_lobby.mp3` / `bgm_game.mp3` / `sfx_shatter.mp3` / `sfx_win.mp3` / `sfx_lose.mp3` / `sfx_voice_good.mp3` / `sfx_voice_great.mp3` / `sfx_voice_unbelievable.mp3` 八文件存在、可解码、时长合理（BGM 需可无缝循环）；缺失项 MUST 记录并在验收报告标注降级路径；② **加载方式红线**——MUST 使用 `new Audio(src)` + `preload = "auto"` 预加载，**MUST NOT 使用 `fetch + decodeAudioData`**（`file://` 下 `Origin: null` 必报 CORS，直接违反宪章「双击秒开」红线）；实现 MAY 在 `http://` 下额外启用 Web Audio 缓冲降延迟，但 MUST 保留 `HTMLAudioElement` 作为 `file://` 强制主路径；③ **实例池**——每个音效维护独立播放实例池（或等效多实例轮转），高频连击下同一音效连续触发 MUST 可叠放，MUST NOT 因 `currentTime = 0` 重置而互相截断（`sfx_shatter` 尤其不得被「掐头」）；`sfx_win` / `sfx_lose` 同一事件音效同时只保留一个活跃实例（防叠加成噪音）；④ **状态机与降级**——每文件维护 `idle/loading/ready/failed` 状态；单文件 `error` 事件 MUST 静默降级为「该音效不发声」并保持其余音频与全部游戏逻辑正常，MUST NOT 抛错阻塞主循环；**BGM 缺失 MUST 回退 FR-037 的 Web Audio 程序化治愈系 BGM**（空 `assets/audio/` 形态下游戏仍完整可玩、仍有 BGM）；⑤ **静音联动**——两轨共用 FR-037 的 SFX / BGM 开关与统一主音量通道，MUST NOT 出现「关掉音效开关但 BGM 仍在响」的漏网路径；静音时**已排定但未播放的延迟触发 MUST 一并取消**；⑥ **纯表现层**——MUST NOT 持久化、MUST NOT 影响判定与可解性（FR-032）。
- [x] T106 [US7] SoundManager 重构为混合双轨：双 BGM 交叉淡变 + 事件音效时序（Δ22a/FR-050 §1 §3 §4）in `src/audio/SoundManager.js` + `src/main.js` + `src/ui/lobby.js`: ① **双轨分工**——外部资产轨（BGM / 事件音效 / 语音夸赞）与 Web Audio 合成轨（交互级音效）并存，`SoundManager` 对外暴露统一 API（`playBgm('lobby'|'game')` / `playSfx(name, opts)` / `playVoice(level)` / `setMuted()`），调用方 MUST NOT 感知轨道差异；② **BGM 音量与时序**——`bgm_lobby` 循环、音量 `0.28`（极淡不抢戏）；`bgm_game` 循环、音量 `0.22`；首次用户交互（PointerEvent / keydown 任一）后自动解锁播放（autoplay 合规——首次交互前 MUST NOT 发声）；**进入关卡时 `bgm_lobby` 在 `400ms` 内平滑淡出、`bgm_game` 同步平滑淡入**；返回大厅或进入结算时反向淡变；淡变 MUST 为 `volume` 逐帧插值或 `linearRampToValueAtTime` 音量渐变，**MUST NOT 硬切**；`400ms` 淡出期间玩家快速返回大厅 MUST 平滑回切，MUST NOT 出现两首 BGM 同时可闻的叠音；③ **事件音效时序**——`sfx_win` MUST 在**棋盘最后一组三消碎裂后延迟 `250ms`** 触发，触发同时 MUST 将 `bgm_game` 音量**压低 50%**；`sfx_lose` MUST 在待消槽满 7 格锁死、失败/复活弹窗弹出瞬间触发；④ **碎裂音效口径**——`sfx_shatter` 每次三消 **0ms 瞬发**，`preservesPitch = false` + `playbackRate` 支持连击动态升调（升降调值由 T109 传入，本任务只提供能力）；音色 MUST 清爽通透绝不刺耳（薄瓷/冰晶脆响 + 高频愉悦泛音颗粒），升调至 `1.25` 时 MUST 仍通透、MUST NOT 出现尖锐啸叫或齿音过载；⑤ **页面可见性**——`visibilitychange → hidden` 时 BGM 暂停或静音，恢复可见时按开关状态续播；⑥ **场景接线**——大厅入场起 `bgm_lobby`、进关切 `bgm_game`、结算/返回大厅回切（`main.js` 状态机 `BOOT→LOBBY→GAME→RESULT` 各节点挂接）。
- [x] T107 [US7] Web Audio 实时合成交互级音效：`ber~` / `deng~` / 骨牌落子涟漪（Δ22a/FR-050 §6~§8）in `src/audio/SoundManager.js` + `src/main.js` + `src/core/GameState.js`: ① **`ber~`（Tile Tap Pop）**——合法滑块被点击起飞时合成 `0~65ms` 内从 `260Hz` **指数上滑**至 `680Hz` 的圆润正弦 / 三角波「拔塞气泡音」，MUST 在 `pointerdown` 判定为合法后**同帧**起音（不得等待飞行动画结束，MUST NOT 有可感知延迟）；并在滑块飞抵 `#dock` 落槽瞬间补一声轻巧的**软木入槽低频轻叩**（短促低频正弦 + 快衰减包络）；② **`deng~`（Blocked Bounce）**——点击受阻滑块原地微震时合成 `160ms` 内从 `220Hz` 快速下沉至 `135Hz`、带 **2 次弹性阻尼泛音**的木鱼/橡胶弹簧音，MUST 与 FR-003 的震动反馈同步触发；MUST NOT 使用与 `ber~` 相同的上扬走向（两者 MUST 一「开」一「合」、可盲听区分）；③ **落牌涟漪（Deal Domino Ticks）**——开局卡牌落定瞬间按**节流间隔 `>= 22ms`** 触发温润的马林巴/白玉骨牌轻叩声，音高 MUST 随落牌进度由低到高平滑上扬；MUST 与 T111 的进场编舞逐牌同步（每张落定即一声），节流 MUST 保证 8×8×5 层满载时不会因过密而糊成噪音；④ **零文件合成**——三类音效 MUST 由 `AudioContext` 振荡器 + 物理包络（attack/decay）现场合成，MUST NOT 依赖任何音频文件；⑤ **上下文恢复**——`AudioContext` 处于 `suspended` 时 MUST 在首次交互后 `resume()`，MUST NOT 因上下文未恢复而静默失败；⑥ **纯表现层**——MUST NOT 影响判定、计分与可解性（FR-032）。

### Batch 2 — 5 秒滑动连击系统、三阶夸赞语音与微光飘字特效（T108~T110）

- [x] T108 [US7] `GameState` 新增 5.0 秒滑动窗连击态（Δ22b/FR-050 §9）in `src/core/GameState.js`: ① **状态字段**——新增 `comboCount`（初始 `0`）、`lastMatchAt`（上次三消时间戳，`performance.now()` 口径）、派生档位（`1` / `2` / `3` / `4` / `5+`）；② **判定口径**——每次触发三消时，若 `now - lastMatchAt <= 5000` 则 `comboCount += 1`，否则重置为 `1`；**无论续连与否 MUST 刷新 `lastMatchAt`**（滑动窗口语义，MUST NOT 实现为固定周期节拍）；③ **计时实现**——MUST 以**时间戳差值**判定，**MUST NOT 依赖 `requestAnimationFrame` 帧计数**（避免切后台 / 掉帧后误判为续连）；④ **事件广播**——连击变化时广播 `comboChanged { count, tier, playbackRate }` 供音频（T109）与飘字（T110）消费，MUST NOT 让消费者各自维护副本计数；⑤ **口径分离（MUST）**——本计数为**纯表现层连击**，与 FR-047 §2 的 IQ 乘区 `M_combo`（受阻断连、无时间窗）**MUST NOT 互相覆盖或隐式同步**；MUST NOT 因「数值不一致」而修改 IQ 结算或音效升调；⑥ **复位边界**——关卡重置 / 重新开始 / 返回大厅时 `comboCount` 归零；受阻反弹 MUST NOT 重置本计数（本计数只受 5 秒窗口约束，与 IQ 的受阻归零口径不同）；⑦ **不持久化**——MUST NOT 写入 localStorage，MUST NOT 影响棱晶、进度与判定。
- [x] T109 [US7] 连击分级触发：碎裂升调 + 120ms 延迟三阶语音（Δ22b/FR-050 §9）in `src/audio/SoundManager.js` + `src/main.js`: ① **速率序列**——`sfx_shatter.playbackRate` 按档位严格取 `1.00`（Combo 1）/ `1.06`（2）/ `1.12`（3）/ `1.18`（4）/ `1.25`（>=5），并 MUST 设 `preservesPitch = false`（升调不变速失真）；② **语音触发**——Combo 3 → `sfx_voice_good`、Combo 4 → `sfx_voice_great`、Combo >= 5 → `sfx_voice_unbelievable`，MUST 相对碎裂音效**延迟 `120ms`** 播放（先碎后夸，避免掩蔽）；**Combo 1 / Combo 2 MUST NOT 播放语音**；③ **取消语义**——静音开关关闭时已排定的 `120ms` 延迟语音 MUST 一并取消（MUST NOT 在静音后仍漏出一声）；连击在 120ms 内再次升级时 MUST 取消上一档未播语音（只播最终档位，避免语音叠放成噪音）；④ **文案权威**——`Combo ×2` / `Good! ×3` / `Great! ×4` / `Unbelievable! ×N` 为产品文案**逐字锁定**，MUST NOT 改写（含标点与空格），MUST NOT 本地化；⑤ **纯表现层**——升调与语音 MUST NOT 影响三消判定、计分、IQ 与可解性（FR-032）。
- [x] T110 [US7] `#dock` 下方连击微光艺术字飘字动效（Δ22b/FR-050 §9）in `src/main.js` + `css/style.css` + `index.html`: ① **锚点位置**——飘字 MUST 自 `#dock`（顶部待消槽）**下方**浮出，MUST NOT 出现在屏幕任意位置或棋盘内部；② **分级文案与视觉**——Combo 2 `Combo ×2`（微光艺术字）/ Combo 3 `Good! ×3` / Combo 4 `Great! ×4` / Combo >= 5 `Unbelievable! ×N`（**璀璨流光**艺术字，视觉层级最高）；Combo 1 MUST NOT 飘字；③ **动效**——浮起 + 轻微放大 + 淡出消失（单次生命周期建议 700~1100ms，由实现期定），MUST 平滑无跳变；连续连击时 MUST 允许多条并存且纵向错位不重叠；④ **命中安全（MUST）**——飘字层 MUST `pointer-events: none` 且 `z-index` 位于棋盘之上但不拦截输入，MUST NOT 遮挡待消槽与棋盘的命中区域（不得造成「飘字挡住卡牌点不到」）；⑤ **布局适配**——9:16、`<720px` 与 `≥1024px` 三档下 MUST 不溢出、不与 IQ 条 / 顶栏 / 棋盘发生视觉冲突；⑥ **纯表现层**——MUST NOT 影响判定、计分与 IQ 结算（FR-032），MUST NOT 持久化。

### Batch 3 — 15 种开局卡牌进场动画编舞、同步落子涟漪音与全量终验（T111~T113）

- [ ] T111 [US7] `BoardRenderer` 新增「开局进场编舞」渲染态与 15 种模式常量表（Δ22c/FR-052 §1 §2 §4）in `src/render/BoardRenderer.js`: ① **叙事节奏**——`0 ~ 180ms` 棋盘**全部卡牌透明度为 `0`**（MUST NOT 出现半透明残影或占位方框），仅完整呈现关卡风景底图（FR-035）；该 `180ms` MUST 兼作资源解码与预排版窗口，MUST NOT 造成首帧卡顿或白屏；`180 ~ 820ms` 内全盘卡牌按抽中的编舞依次落定，动画总时长 `<= 640ms`；② **15 种模式常量表（内联本文件）**——`diagonal_cascade`（自左上 `(0,0)` 向右下 `(R,C)` 斜向波浪落下）/ `center_ripple`（自中心向四周同心圆扩散弹起）/ `outer_converge`（自四周边界向中心螺旋收拢）/ `spiral_vortex`（顺时针阿基米德螺旋线依次落位）/ `wings_clasp`（左半区自左、右半区自右滑入中央咬合）/ `sky_rain`（自上方带 `Ease-Out-Back` 微弹性错落坠落）/ `layer_stack`（严格按 `z = 0 → 4` 整层依次自上方压下）/ `zipper_interleave`（奇数行自左、偶数行自右交错咬合）/ `windmill_quadrants`（四象限分别自四角顺时针旋入）/ `v_formation`（顶部中央为领头呈 V 字波浪向下铺开）/ `checkerboard_weave`（偶格 `(r+c)%2===0` 先弹入、奇格随后填满空隙）/ `blinds_flip`（原位按列 `scaleX: 0 → 1` 翻开亮相）/ `deck_deal`（自棋盘正中央叠牌点向各自坐标极速飞散铺开）/ `tailwind_glide`（每张牌沿自身箭头方向 `U/D/L/R` 自后方滑入归位）/ `starlight_scatter`（按黄金分割伪随机序列缩放弹入）；**15 种 MUST 全部实现且逐种可辨识**，MUST NOT 只实现其中一部分；③ **层级与绘制不变量（穿模零容忍）**——动画期间全部卡牌 MUST 严格按 `(a.z - b.z) \|\| (a.r - b.r) \|\| (a.c - b.c)` **升序绘制**（MUST 复用静态渲染同一比较器，MUST NOT 为动画另建排序）；同一渲染坐标下高层 `z` 的延迟 MUST 恒比低层大 `+60ms * z`——确保**永远先落底层、后落顶层**，MUST NOT 出现上层卡牌从下层卡牌「内部」钻出的穿模；④ **落子音回调**——每张卡牌落定 MUST 回调 FR-050 §8 的落牌涟漪音（T107 提供），逐牌触发且受 `>= 22ms` 节流；⑤ **纯表现层**——编舞 MUST NOT 改变卡牌花色/方向/坐标/层号，MUST NOT 影响命中判定、射线阻挡、压制锁定（FR-044 §4 在落定后生效）与可解性（FR-032）；动画期间 MUST NOT 触发任何 Solver、关卡生成或持久化写入；⑥ **坐标口径**——卡牌起落坐标 MUST 复用 `getTileCssRect()`（含奇偶层半格偏移），MUST NOT 用逻辑坐标 `(c+0.5)*cell` 直算（Δ21 Bug 1 同族缺陷）。
- [ ] T112 [US7] `main.js` 编舞抽取、点击快进与 reduced-motion 降级（Δ22c/FR-052 §3 §5 §7）in `src/main.js` + `src/render/BoardRenderer.js` + `css/style.css`: ① **抽取规则**——开局（进入关卡 / 重置本关）时从 15 种中抽取 1 种；**同一会话内相邻两次开局 MUST NOT 为同一模式**（维护上一次抽取结果做排除）；抽取算法（纯随机 / 按 level.id 哈希 / 按画卷加权）由实现期定，但 MUST 在动画启动前确定完毕，MUST NOT 动画中改抽或中途切换；② **评委可复现**——调试面板 MAY 提供「编舞模式锁定」下拉（15 种 + 随机），供评委逐种回放验收（非强制项，但 SC-019 ③ 的逐种回放建议依赖它）；③ **点击快进（零迟滞，MUST）**——动画未结束时玩家点击棋盘，MUST 立即将动画快进至 `100%` 完成态（全部卡牌归位、透明度 `1`、压制锁定态按 FR-044 §4 生效）并**正常响应本次点击**；MUST NOT 吞掉该次点击、MUST NOT 要求二次点击、MUST NOT 以「动画中」为由禁用输入；实现须在 `pointerdown` 前置检查中完成「快进 + 继续走正常命中判定」的单次流水，MUST NOT 用「先快进、丢弃本次点击」的偷懒写法；④ **叠加层时序**——挑战横幅（FR-036 的 1.6s）与 L1/L2 教学卡片（FR-046）MUST 在编舞完成后（`>= 820ms`）再出现，或采用不遮挡棋盘命中区域的半透明叠层；横幅 1.6 秒计时 MUST 自编舞完成起算；⑤ **转场不争首帧**——大厅/结算转场淡入 MUST 在 `180ms` 底图停留期结束前完成，使底图停留期内画面已稳定；⑥ **降级**——`prefers-reduced-motion: reduce` 时 MUST 退化为一次性淡入（无位移 / 无旋转 / 无缩放），且 MUST 保留 `180ms` 底图停留节奏；⑦ **性能**——编舞 MUST NOT 造成首帧卡顿或掉帧，8×8×5 层满载仍稳定 60 fps。
- [ ] T113 全量回归测试与文档收口（Δ22 交付终验）in `quickstart.md` + `contracts/` + `data-model.md` + `spec.md` + `constitution.md` + `DESIGN_THOUGHTS.md` + `ITERATION_LOG.md`: ① **门禁**——`node tools/solver.js` exit 0（**72/72**，M9 为纯表现层，结论 MUST 与 M8 基线逐条一致、零漂移）；`node tools/solver.js --engine-selftest` 与 `node tools/render-selftest.js` 的 **Δ22 断言组全绿**（8 音频 ready 且零 CORS / 代码零 `decodeAudioData` / BGM 0.28·0.22 与 400ms 淡变曲线单调 / `sfx_win` 延迟 250ms±30ms 且 BGM 降 50% / `ber~`·`deng~` 合成参数与同帧起音 / 连击速率序列与语音延迟 120ms±20ms / 飘字文案逐字 / 5s 时间戳判定 / 15 模式全覆盖且相邻不重复 / 落定 z 升序 + 高层延迟 `60ms*z` 容差 ≤16ms / 点击快进且被响应 / reduced-motion 降级）；② **SC-018 ①~⑥ 逐条人工验收**——`file://` 双击 8 音频全 ready 零 CORS / BGM 时序无硬切无叠音 / `sfx_win`·`sfx_lose` 时序 / 交互合成音效同帧且盲听可区分 / 连击五级速率与飘字 / 静音与空 `assets/audio/` 降级；③ **SC-019 ①~⑥ 逐条人工验收**——15 模式全覆盖且相邻不重复 / `0~180ms` alpha=0 与落定完成 / 零穿模与延迟公式 / 三时点（`200ms`/`400ms`/`600ms`）点击均快进且 100% 被响应 / 编舞前后卡牌属性逐字段一致 / reduced-motion 降级；④ **US7-AC25~AC28 逐条人工验收**；⑤ **宪章修订复核（前置已完成）**——`constitution.md` 已于 **2026-10-25** 由 v2.0.0 正式升为 **v3.0.0（MAJOR）**：原则 III 由「本地可选美术资产 + 程序化双兜底」改名为「**本地可选资产 + 强制兜底**」，并新增「音频资产分层」三条（交互级音效 MUST 零文件实时合成 / BGM·事件音效·语音 MAY 本地可选资产 + 强制兜底 / 开机和弦 MUST 零文件实时合成）、`HTMLAudioElement` 唯一加载路径红线与 `assets/audio/` 位置白名单；红线清单表与 C-3 门禁行已同步，v2.0.0 的「零音频文件」原文以 HTML 注释存档。**本项在 T113 中不再是「执行修订」，而是「核对宪章与 spec/plan/contracts 三处口径无漂移」**——若发现漂移 MUST 就地修正宪章或文档并记录于 `ITERATION_LOG.md`；⑥ **文档同步**——`quickstart.md` 增补 Δ22 场景组（声学 + 编舞）、`contracts/game-session.md` 补 `SoundManager` 双轨 API 与 `comboChanged` 事件契约、`data-model.md` 补 **Audio Bank / Combo Window / Deal Choreography** 三实体、`DESIGN_THOUGHTS.md` 增补「Δ22 声学分层与开局叙事」章节（为何交互音效必须合成、为何语音必须外部资产、15 种编舞的节奏论证、点击快进为何是零迟滞的底线）、`ITERATION_LOG.md` 记录 `file://` 实测证据与连击/编舞验收截图；⑦ 确认 tasks.md 全项勾选。**未全过不得交付**。
