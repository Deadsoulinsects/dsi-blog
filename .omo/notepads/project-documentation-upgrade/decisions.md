2026-07-23
- 决定将 `docs/maintenance-quickstart.md` 写成“最短安全入口”文档，而不是完整运维手册，避免与 `docs/operations-workflow.md` 职责重叠。
- 决定把 `npm run build:astro` 设为默认构建验证路径，把 `npm run build` 放入谨慎命令区，并把 `npm run publish` 明确标记为高风险命令。
- 决定在快速上手文档中加入“前 10 分钟清单”，用更直接的顺序帮助日常维护者快速落地。
- 决定把 `升级优化规划.md` 重组为“当前基线事实 → 升级总方向 → 短期 / 中期 / 长期阶段 → 每阶段主题”的结构，避免它与维护流程文档职责重叠。
- 决定在路线图中明确写出：Astro 静态架构是当前起点，不是长期唯一答案，但现阶段不把任何具体迁移目标写成既定事实。

2026-09-11
- 决定以职责而非篇幅划分当前文档：`README.md` 记录 current snapshot，`AGENTS.md` 记录 stable rules，`CONTEXT.md` 只记录 terms，当前 docs 负责 structure / workflow，`.omo` records 保留 append-only engineering history，Skill 保留 current executable QA。
- 决定将 `.omo` 视为 canonical engineering record。`.sisyphus` 仅保留为 legacy read-only corroboration，不再写入或作为当前事实的主来源。
- 决定明确标注状态边界：`66aa8d5` 是 current committed implementation node；`AGENTS.md`、`.omo`、`.opencode` 是其后的 working-tree state。
