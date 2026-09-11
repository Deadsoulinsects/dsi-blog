2026-07-23
- 已确认 `src/content/docs/intro.md` 是访客入口说明，不是维护者手册。
- 已确认根目录 `docs/` 负责 maintainer / AI 文档，`src/content/docs/` 负责 visitor-facing 文档。
- 本轮文档集合锁定为 `README.md`、`docs/README.md`、`docs/project-structure.md`、`docs/maintenance-quickstart.md`、`docs/operations-workflow.md`、`升级优化规划.md`。
- 已确认 `package.json` 要求 Node.js `>=22.12.0`，适合写入维护者快速上手文档的环境假设部分。
- 已确认日常安全验证路径应优先写成 `npm install` → `npm run dev` → `npm run links:check` → `npm run build:astro`。
- 已确认 `npm run build` 前会经过 `prebuild`，因此在维护者文档中必须明确它不是默认首选检查命令。
- 已确认 `publish` 需要维持高风险表述，同时要提醒带 `sync`、`prepare`、`apply` 含义的内容命令可能写入文件。
- 已确认 `package.json` 中维护层的关键操作命令包括 `sync:blog:dry`、`sync:origin:dry`、`content:prepare:dry`、`content:prepare`、`links:check`、`build:astro`、`build`、`preview`、`publish`。
- 已确认 `npm run build` 不是纯构建检查，它会先触发 `prebuild`，其中包含同步、预处理和 `links:apply`，因此可能改动仓库内容文件。
- 已确认 `docs/operations-workflow.md` 应承担详细操作手册职责，重点要写清 dry-run 路线、正式写入路线、纯构建验证路线，以及检查失败先停下排查的规则。
- 已确认 `升级优化规划.md` 应改写为“当前基线 + 阶段 + 主题”的结构，而不是继续堆叠功能清单。
- 已确认这份路线图需要明确三条未来专业化主线：内容与结构、交互与功能、架构与工程。
- 已确认 Astro 静态站点在文档里必须被表述为当前起步架构，而不是长期终局。
- 已确认 `src/content/docs/intro.md` 只需要保留一条短边界提示：访客看这里，维护者 / AI 去根目录 `README.md` 和 `docs/README.md`。
- 已确认 `CONTEXT.md` 可以保留术语级的“文档边界”定义，但不应扩展成操作手册。
- 已确认当前环境没有 `.md` 的 LSP server，因此 Markdown 验证需要依赖直接内容检查和 grep，而不是 `lsp_diagnostics`。

2026-09-11
- 当前文档模型可将“现在是什么”“长期规则是什么”“术语是什么”“如何维护”“工程历史是什么”“如何执行 QA”拆开，避免 README、AGENTS、CONTEXT、docs、`.omo`、Skill 相互覆盖。
- `.omo` 是 canonical append-only engineering history；`.sisyphus` 是 legacy read-only corroboration。历史核对可阅读后者，但新记录只追加到前者。
- `66aa8d51d85de57dbe64a5ca6b6ee5e1eecf9cb8` 是当前 committed implementation node。`AGENTS.md`、`.omo`、`.opencode` 的规则与记录仍属于 working-tree state，不能表述为该提交已包含的内容。
