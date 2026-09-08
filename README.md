# Dead Soul Insects

Dead Soul Insects 是一个基于 Astro 的个人静态博客仓库，用来整理博客文章、项目记录、说明文档，以及与站点气质相关的起源页面。

当前默认工作方式仍然是 **Astro + Markdown + Obsidian 同步**。这是一套当前的起步架构，不是长期终局；未来升级方向集中记录在 [`升级优化规划.md`](./升级优化规划.md) 中。

## 技术栈

- Astro
- TypeScript
- Markdown / Astro Content Collections
- npm
- GitHub Pages

## 最小仓库结构

```text
src/
  pages/            路由页面
  layouts/          站点布局
  content/blog/     博客 Markdown 内容
  content/docs/     站点公开文档内容
  content.config.ts 内容集合 schema
scripts/            Obsidian 同步、预处理、链接转换、发布脚本
public/             静态资源
docs/               面向维护者 / AI 的深度说明文档
```

默认高风险区域：`scripts/`、`.github/workflows/`

默认不要编辑生成目录、依赖目录和 Git 内部目录：`dist/`、`.astro/`、`node_modules/`、`.git/`

## 关键命令摘要

```bash
npm install                # 安装依赖
npm run dev                # 启动本地开发服务器
npm run links:check        # 检查 Markdown 链接
npm run sync:blog:dry      # 预览博客同步，不写入
npm run sync:origin:dry    # 预览起源同步，不写入
npm run content:prepare:dry # 预览完整内容准备流程，不写入
npm run content:prepare    # 执行内容准备流程（会写入文件）
npm run build:astro        # 只做 Astro 构建检查
npm run build              # 完整构建入口
npm run preview            # 预览构建结果
```

## 关键风险提醒

- `npm run build:astro` 是**纯 Astro 构建检查**，如果你只是想确认站点能否构建，优先用它。
- `npm run build` **不是普通 build 检查**。它会先跑 `prebuild`，其中包含 Obsidian 内容同步、frontmatter 补全和 Markdown 链接转换，因此**可能改动仓库里的 Markdown 文件**。
- `npm run content:prepare` 也会写入文件；如果只是想先看结果，优先使用带 `:dry` 的命令。
- `npm run publish` 默认不要随意运行。它可能触发构建、提交并推送代码，不适合当作日常检查命令。
- `scripts/` 中的 Obsidian 本地 Windows 路径属于当前用户工作流；其他环境里如果源目录不存在而出现 warning，通常不代表源码本身出错。

## 维护入口与文档导航

- [`docs/README.md`](./docs/README.md)：整套维护文档的地图与职责边界
- [`docs/project-structure.md`](./docs/project-structure.md)：仓库结构、目录职责与阅读顺序
- [`docs/maintenance-quickstart.md`](./docs/maintenance-quickstart.md)：日常维护的最短安全上手路径
- [`docs/operations-workflow.md`](./docs/operations-workflow.md)：较完整的内容准备、检查与操作流程
- [`升级优化规划.md`](./升级优化规划.md)：未来升级、专业化演进和阶段路线图

## 当前维护建议

- 想快速理解仓库：先看本 README，再看 [`docs/README.md`](./docs/README.md)。
- 想做日常安全检查：优先参考 [`docs/maintenance-quickstart.md`](./docs/maintenance-quickstart.md)，默认路径是 `links:check` → `build:astro` → `preview`。
- 想了解完整内容流程：去看 [`docs/operations-workflow.md`](./docs/operations-workflow.md)，不要把 README 当作完整操作手册。
- 想理解目录和文件归属：去看 [`docs/project-structure.md`](./docs/project-structure.md)。
- 想减少本地端口冲突和浏览器 QA 不稳定：先看 [`docs/maintenance-quickstart.md`](./docs/maintenance-quickstart.md) 里的“本地预览与 QA 的默认分流”，再看 [`docs/operations-workflow.md`](./docs/operations-workflow.md) 里的“本地浏览器 QA 的稳定工作流”。

## 当前页面维护状态（简版）

- 正式内容页家族当前已经进入 **A 路线（低温整理）第一阶段**，主范围包括：`/blog`、`/categories`、`/archive`、`/blog/topics/[topic]`，以及共享详情布局 `src/layouts/ArticleLayout.astro`。
- `docs` 与 `projects` 已做过一轮正式页收尾，同样按 A 路线收回到统一家族里。
- 首页 `index.astro` 当前仍视为**封面 / 海报型页面**，不按内容页同一套节奏直接推进；如果以后要改首页，默认应保留“视觉封面优先”这个方向。
- 想继续维护页面视觉时，先看 [`docs/project-structure.md`](./docs/project-structure.md) 里对页面家族和关键文件的说明，再决定是改正式页、共享布局，还是只做局部 polish。

## 内容与文档边界（简版）

- `src/content/blog/`：博客、过程记录、阶段总结
- `src/content/docs/`：站点访客可阅读的公开文档
- 根目录 `docs/`：维护者 / AI 使用的内部说明文档

Markdown 内容应保持合法 frontmatter，日期使用 `YYYY-MM-DD`；保留现有中文文件名、中文路径和中文内容，不擅自改成英文或拼音。
