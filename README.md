# Dead Soul Insects

Dead Soul Insects 是一个基于 Astro 的个人静态博客仓库，用来整理博客文章、项目记录、说明文档，以及与站点气质相关的起源页面。

当前默认工作方式是 **Astro + Markdown + Obsidian 同步**。正式站点采用 dark / cool / editorial / archive-ledger / restrained 的视觉语言；当前项目级设计判断以 [`DESIGN.md`](./DESIGN.md) 为准。

## 技术栈

- Astro
- TypeScript
- Markdown / Astro Content Collections
- npm
- GitHub Pages

## DSI Admin 桌面产品

仓库还包含 DSI Admin：面向本博客的 Windows 桌面文章管理程序，连接本地 Astro 工程与 Obsidian 笔记库，自动保存草稿、准备网页媒体，在明确确认后提交或发布。

- [安装、使用与开发 README](./desktop/README.md)
- [产品介绍与适用范围](./desktop/产品介绍.md)
- [版本更新记录](./desktop/CHANGELOG.md)

安装版自带运行工具，不需要用户手动启动 `astro dev`。博客网站仍采用静态架构；桌面程序的本地能力不会开放到正式网站。

## 规则与设计入口

- [`AGENTS.md`](./AGENTS.md)：工程实现、修改权限、验证和协作规则
- [`DESIGN.md`](./DESIGN.md)：项目级视觉语言、信息层级和设计原则
- [`docs/README.md`](./docs/README.md)：内部维护文档地图与详细说明入口

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
npm run lint               # 只读 Oxlint 代码静态检查
npm run lint:fix           # 用 Oxlint 修复可自动处理的问题，会写入文件
npm run links:check        # 检查 Markdown 链接
npm run sync:blog -- --file "<原笔记路径>" --dry-run # 手动预览单篇博客同步，不写入
npm run sync:origin:dry    # 预览起源同步，不写入
npm run content:prepare:dry # 预览完整内容准备流程，不写入
npm run content:prepare    # 执行内容准备流程（会写入文件）
npm run build:astro        # 只做 Astro 构建检查
npm run build              # 完整构建入口
npm run preview            # 预览构建结果
```

## 关键风险提醒

- `npm run lint` 是只读的代码静态检查。`npm run lint:fix` 会写入文件，执行后应审阅 diff，并重新运行 `npm run lint`；两者都不替代 `npm run build:astro` 对 Astro 构建与模板的验证。
- `npm run build:astro` 是**纯 Astro 构建检查**，如果你只是想确认站点能否构建，优先用它。
- `npm run build` **不是普通 build 检查**。它会先跑 `prebuild`，其中保留起源同步、frontmatter 补全和 Markdown 链接转换，因此**可能改动仓库里的 Markdown 文件**；博客同步不再进入这条链路。
- `npm run content:prepare` 也会写入文件；如果只是想先看结果，优先使用带 `:dry` 的命令。
- `npm run publish` 默认不要随意运行。它可能触发构建、提交并推送代码，不适合当作日常检查命令。
- `scripts/` 中的 Obsidian 本地 Windows 路径属于当前用户工作流；其他环境里如果源目录不存在而出现 warning，通常不代表源码本身出错。

## 维护入口与文档导航

- [`docs/README.md`](./docs/README.md)：整套维护文档的地图与职责边界
- [`docs/项目结构.md`](./docs/项目结构.md)：仓库结构、目录职责与阅读顺序
- [`docs/维护快速指南.md`](./docs/维护快速指南.md)：日常维护的最短安全上手路径
- [`docs/操作与发布流程.md`](./docs/操作与发布流程.md)：较完整的内容准备、检查与操作流程

## 当前维护建议

- 想快速理解仓库：先看本 README，再看 [`docs/README.md`](./docs/README.md)。
- 想做日常安全检查：优先参考 [`docs/维护快速指南.md`](./docs/维护快速指南.md)，按改动类型选择最低充分的检查；详细边界见 [`docs/操作与发布流程.md`](./docs/操作与发布流程.md)。
- 想了解完整内容流程：去看 [`docs/操作与发布流程.md`](./docs/操作与发布流程.md)，不要把 README 当作完整操作手册。
- 想理解目录和文件归属：去看 [`docs/项目结构.md`](./docs/项目结构.md)。
- 想做页面或浏览器 QA：先看 [`docs/维护快速指南.md`](./docs/维护快速指南.md) 的最短入口，再按 [`docs/操作与发布流程.md`](./docs/操作与发布流程.md) 的完整 QA 工作流执行。

## 当前站点快照

- 主要页面区域包括博客、公开文档、项目、起源、关于、归档与分类，详情页覆盖嵌套的博客专题和文档路由；`/lab` 路由保持隔离，仅承载实验。
- 共享 `Layout` 负责栏目级导航：它区分精确路由和当前栏目，保留原生修饰键与中键行为，并在跨栏目时先播放单一 slider，再进入目标页。
- 页面维护与浏览器验收遵循 [`dsi-browser-visual-qa`](./.opencode/skills/dsi-browser-visual-qa/SKILL.md) Skill；完整流程见 [`docs/操作与发布流程.md`](./docs/操作与发布流程.md)。

## 内容与文档边界（简版）

- `src/content/blog/`：博客、过程记录、阶段总结
- `src/content/docs/`：站点访客可阅读的公开文档
- 根目录 `docs/`：维护者 / AI 使用的内部说明文档

Markdown 内容应保持合法 frontmatter，日期使用 `YYYY-MM-DD`；保留现有中文文件名、中文路径和中文内容，不擅自改成英文或拼音。

博客以 `completion_date` 表示完成日期，用于文章展示、排序、归档和 RSS；`start_date`、`end_date` 为可选过程日期。旧博客的 `pubDate` 仅在缺少 `completion_date` 字段时迁移，新文章不自动使用当天或文件修改时间。公开 Docs 继续使用 `pubDate`。

原始 Obsidian 笔记留在自然目录中，在 Admin 里选择要公开的笔记，不再复制到“博客发布”目录。默认目录与待确认扫描排除“博客发布”和 `picture`；已有绑定仍继续使用，只有作者明确重新绑定才迁移到原笔记。迁移保留站点文件名、URL、`mediaId` 和其他技术字段，不删除私人副本。原笔记与旧副本可能各有修改，应先比较内容，再由作者选择原笔记版本，迁移过程不代替作者覆盖正文。

Admin 按规范化后的文件名或标题提示原笔记候选，忽略大小写、Unicode 表示与空白差异，排除历史“博客发布”副本；即使只有一个候选，也不自动绑定或替换现有路径。可能与已有文章重名或同标题的新导入会被拒绝，应改用显式绑定。来源目录与网站专题可以不同。

同步更新源笔记中明确提供的标题、描述、标签和日期，保留站点的 `mediaId` 等技术字段；网站专题可在 Admin 独立维护。插件 `article-header-sync` 写入的受管头部只用于笔记阅读，导入博客时移除完整的 `article-header:start/end` 区块，再由站点渲染文章头部；源笔记不被修改。缺少有效完成日期或头部标记异常时，需要修正后再准备内容。

手动兜底使用 `npm run sync:blog -- --file "<原笔记路径>"`，加 `--dry-run` 可先预览。不传 `--file` 时仅说明用法，不扫描旧发布目录，也不写入文件。本轮是源码更新，现有安装包不因此升级；使用新流程的安装版需要后续重新打包。
