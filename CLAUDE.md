# Project Context & Agent Instructions

本项目采用 GitHub Spec-Kit (Spec-Driven Development) 规范驱动工作流开发。

## 核心准则与文档索引 (Single Source of Truth)
1. **工程宪章 (最高优先级)**：任何代码生成与修改必须严格遵守 .specify/memory/constitution.md 中的技术栈、零外部资源依赖与可解性铁律。
2. **产品需求规范 (PRD)**：参阅 specs/ 目录下对应特性分支的 spec.md。
3. **技术架构与任务进度**：参阅 specs/ 目录下对应特性分支的 plan.md 与 	asks.md。

## 开发交互纪律
- 修改代码前，请先核对 specs/ 下的当前任务状态。
- 回答与分析请保持结构化、客观严谨，优先保证算法（尤其是50关逆向生成与求解验证）的严密性。

## Git 提交与远程推送门禁 (Git Commit & Push Gate - MANDATORY)
在执行任务实现（Implementation）过程中，你必须严格遵守以下版本控制闭环：
1. **触发时机**：每完成一个独立的功能模块/逻辑组，必须先在 specs/001-slide-triple-match-core/tasks.md 中将已完成的任务复选框从 [ ] 更新为 [x]。
2. **强制动作**：完成代码自检与 	asks.md 状态更新后，必须立即在终端依次执行：
   - git add .
   - git commit -m "<type>(<scope>): <清晰描述本模块完成的任务编号与功能>"
   - git push
3. **门禁约束**：只有当 git push 成功将当前功能推送到 GitHub 远程仓库（exit code 0）后，才允许继续编写下一个功能模块的代码！若 push 失败，必须立即暂停并向用户报告原因。

## 双分支管理与里程碑合并规范 (Branching & Milestone Merge)
- **日常开发分支**：所有子任务与功能逻辑组的日常 commit 与 push 均在特性分支 `001-slide-triple-match-core` 上进行。
- **主干合并时机（Milestone Gate Merge）**：每当完成一个完整里程碑的 Checkpoint 验收门（即完成 T022、T039、T052、T063 时），在特性分支 push 成功后，必须依次执行以下命令将稳定成果同步合并至 `main` 主干分支，随后切回特性分支继续开发：
1. `git checkout main`
2. `git merge 001-slide-triple-match-core --no-ff -m "chore(release): merge milestone checkpointinto main"`
3. `git push origin main`
4. `git checkout 001-slide-triple-match-core`

## 防 Token 超限与文件写入规范 (Anti-Truncation Rules)
1. **严禁使用 Bash 重定向写代码**：禁止使用 `cat >>`、`echo` 或 PowerShell `Set-Content` 在 Bash 工具中拼接源码文件，必须始终使用原生 `Write` 或 `Edit` 工具。
2. **控制单次输出体量**：编写超过 250 行的模块（如渲染器或生成器）时，先用 `Write` 写入核心骨架与基础函数，再分 2~3 次使用 `Edit` 增量补充子函数，每次工具调用输出代码控制在 150 行以内，防止触发 API max_tokens 截断。