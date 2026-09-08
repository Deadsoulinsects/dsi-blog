# 项目结构说明

这份文档写给维护者与 AI 协作者，用来回答两个问题：

1. 这个仓库的目录分别负责什么。
2. 当你要改某一类内容时，默认应该先看哪里。

它是结构说明，不是完整操作手册。涉及内容准备、检查、发布顺序时，应转去 `docs/operations-workflow.md`。

## 先记住的结构边界

- 根目录 `docs/`：维护者 / AI 的内部说明文档区。
- `src/content/blog/`：博客内容区，放过程记录、踩坑、阶段总结、个人思考。
- `src/content/docs/`：站点公开文档区，放访客可阅读的教程、使用说明、配置说明。
- 项目记录风格内容：当前不是独立内容集合，短期主要体现在 `src/pages/projects.astro` 的项目页表达，以及相关博客或总结内容中。

如果你拿不准一段 Markdown 应该放哪，先判断它主要回答谁的问题：

- 回答“访客怎么理解或使用某件事”，优先考虑 `src/content/docs/`。
- 回答“我做了什么、踩了什么坑、阶段上学到了什么”，优先考虑 `src/content/blog/`。
- 回答“维护者或 AI 该怎么理解仓库、目录、流程边界”，写到根目录 `docs/`。

## 顶层目录地图

```text
.
├─ src/                 站点源码，页面、布局、内容集合、组件、工具函数都在这里
├─ public/              直接作为静态资源输出的文件
├─ scripts/             内容同步、预处理、链接转换、发布脚本，高风险区
├─ docs/                面向维护者 / AI 的深度说明文档
├─ .github/workflows/   部署与自动化工作流配置，高风险区
├─ .sisyphus/           本地 AI 协作计划、notepad、草稿与续跑状态
├─ .vscode/             VS Code 工作区建议配置
├─ 备份/                本地备份文件与备份目录
├─ dist/                构建产物，生成目录，不要手改
├─ .astro/              Astro 生成缓存，生成目录，不要手改
├─ node_modules/        依赖目录，不要手改
└─ .git/                Git 内部目录，不要手改
```

## 顶层文件与目录职责

### `README.md`

仓库总入口。适合先快速了解项目定位、技术栈、关键命令摘要、基础风险提醒，以及应该继续读哪份文档。

### `AGENTS.md`

项目级协作规则。AI 协作者在改代码、改样式、改文档前，应先遵守这里的项目约束。

### `CONTEXT.md`

项目术语表。这里定义“博客”“文档”“项目记录”“发文流程”等稳定词义，避免维护过程中把不同内容类型混写。

### `astro.config.mjs`、`tsconfig.json`、`package.json`

这三类文件分别控制 Astro 配置、TypeScript 配置、项目脚本与依赖。它们会影响全局行为，修改前应明确自己是在做局部维护，还是在做架构层调整。

### `升级优化规划.md`

记录中长期升级方向。它不是当前结构事实本身，而是未来可能的演进路线。

## `src/` 结构

`src/` 是站点的主要工作区，当前包含以下子区域：

```text
src/
├─ assets/          站内使用的静态素材源文件
├─ components/      可复用 Astro 组件
├─ content/         Markdown 内容集合根目录
├─ content.config.ts 内容集合 schema 与加载入口
├─ data/            轻量数据文件
├─ layouts/         页面和文章布局
├─ pages/           路由页面
└─ utils/           内容与路径相关工具函数
```

### `src/pages/`

这里定义站点路由，是理解公开页面结构的第一入口。

当前可见的页面与路由相关区域包括：

- `index.astro`：首页
- `blog.astro`、`blog/`：博客列表与博客详情相关路由
- `docs.astro`、`docs/`：公开文档列表与文档详情相关路由
- `projects.astro`：项目页
- `origin.astro`、`origin/`：起源相关页面与详情页目录
- `about.astro`：关于页
- `archive.astro`：归档页
- `categories/`、`tags/`：分类与标签相关页面
- `rss.xml.ts`：RSS 输出入口
- `404.astro`：404 页面

如果你要改公开页面的结构、文案承载位置或页面组合关系，通常先从 `src/pages/` 开始看。

#### 当前正式内容页家族状态

当前站点的正式内容页已经收敛到一条稳定的视觉主线：**A 路线（低温整理）**。

这一条主线当前主要覆盖：

- `src/pages/blog.astro`
- `src/pages/categories/index.astro`
- `src/pages/archive.astro`
- `src/pages/blog/topics/[topic].astro`
- `src/pages/docs.astro`
- `src/pages/projects.astro`
- `src/layouts/ArticleLayout.astro`

理解这组文件时，可以先把它们视为同一个“正式内容页家族”：

- 目标不是做首页那种封面 / 海报感，而是强调冷静、秩序、内容优先
- 共同语言主要体现在 intro、index、note、section heading、list/card 节奏，以及共享详情布局上
- 如果后续继续做正式页 polish，默认先沿着这条家族语言补细节，而不是重新发散出第二套主风格

如果后续继续扩页或做视觉调整，默认按下面这套层级理解路线关系：

- **A 路线**：正式生产主线
- **C 路线**：A 的秩序增强支线，只适合借结构手法，不再并列竞争正式位
- **B 路线**：局部效果素材池，只适合少量修辞，不用于决定页面骨架
- **过渡方案**：旧页面向 A 收敛时的迁移策略，不算独立路线

过渡方案默认分三层：

1. **壳层对齐**：先统一 page shell、panel/card、边框、阴影、圆角和基础间距
2. **信息节奏对齐**：再统一 intro、index、note、section heading、元信息角色和列表/卡片节奏
3. **页面语义重构**：只有当页面的信息组织本身不适合当前目标时，才进入高成本重构

与这组页面相对的是 `src/pages/index.astro`。首页当前仍属于封面型页面，维护时不要默认把它和内容页家族强行做成完全同构。

### `src/layouts/`

这里放跨页面复用的布局骨架，例如通用布局、文章布局、起源详情布局。改动这里往往会影响多个页面，所以虽然不属于脚本级高风险区，但依然要谨慎。

当前与正式内容页家族关系最紧密的共享布局是 `src/layouts/ArticleLayout.astro`。如果博客详情页或文档详情页的层次、目录、头部信息区、正文承载方式需要统一调整，默认应先检查这里，而不是只改单一路由入口文件。

### `src/components/`

放较小粒度的复用组件。当前组件数量不多，说明这个仓库仍以 Astro 页面与布局为主，而不是复杂组件树驱动。

### `src/content/`

这是 Markdown 内容集合根目录，当前只有两个公开内容区：

- `src/content/blog/`
- `src/content/docs/`

不要把维护者内部说明文档写进这里。

### `src/content.config.ts`

这里是内容集合的单一入口。当前只定义了 `blog` 和 `docs` 两个 collection，说明仓库现在没有独立的“项目记录 collection”。

这也意味着：

- 想新增博客型 Markdown，通常落到 `src/content/blog/`
- 想新增公开文档型 Markdown，通常落到 `src/content/docs/`
- 想表达项目记录，不要先假设要新建第三个 collection，先看当前 `projects` 页面与已有内容是否足够承载

### `src/data/` 与 `src/utils/`

这两个目录承载轻量数据与工具函数。一般在你发现某些页面逻辑不是纯静态文案，而是需要共享映射、路径处理、内容读取辅助时再进入这里。

### `src/assets/`

这里是源码侧素材区。和 `public/` 的区别是，`src/assets/` 更接近被源码引用的素材源文件，而 `public/` 更接近直接对外提供的静态文件。

## 内容边界，最容易放错的地方

### `src/content/blog/`

适合放：

- 过程记录
- 踩坑总结
- 阶段性复盘
- 带个人思路和时间痕迹的文章

不适合放：

- 维护者内部流程说明
- 站点公开文档索引页本身
- 只为项目管理存在的内部记录

### `src/content/docs/`

适合放：

- 面向站点访客的教程
- 使用说明
- 配置说明
- 稳定、可复用、公开可读的文档内容

不适合放：

- 维护者操作流程
- 仓库治理规则
- AI 协作约束
- 仅服务项目内部维护的结构说明

`src/content/docs/intro.md` 当前是访客入口说明，它不是维护手册。

### 项目记录风格内容

项目记录和博客、公开文档不完全一样。按当前仓库约定，它更偏向回答：

- 这个项目是什么
- 现在做到什么程度
- 为什么值得留下
- 相关链接和去向是什么

当前这类信息主要集中在 `src/pages/projects.astro` 的项目页表达中，再由博客文章或总结内容补充背景。换句话说，项目记录现在更像“页面组织方式 + 相关内容支撑”，而不是一个独立 Markdown 集合。

## 其他关键目录

### `public/`

放直接输出的静态资源，例如 favicon、图标、`robots.txt`、`CNAME`。新增资源通常是安全的，但删除要注意它是否仍被页面或部署配置引用。

### `scripts/`

这是高风险区。这里的脚本会参与：

- Obsidian 内容同步
- 内容准备与预处理
- Markdown 链接转换 / 检查
- 发布流程

它们不只是“工具文件”，而是会影响仓库内容写入结果和发布行为。尤其要注意 `publish.ps1` 与内容准备类脚本，不要把这里当普通杂项目录随手改。

### `.github/workflows/`

这是部署与自动化工作流配置区，当前可见文件是 `deploy.yml`。这里的变动可能直接影响 GitHub Pages 部署结果，默认视为高风险改动。

### `.sisyphus/`

这是 AI 协作辅助目录，包含 plan、notepad、草稿与续跑状态。它不是站点公开内容区，也不是网站构建入口区，但对 AI 执行过程有辅助作用。

### `备份/`

这里存放本地备份压缩包和备份目录。它不是源码主工作区，通常只在回滚、对照、人工留档时才需要关注。

## 默认不要编辑的生成目录

以下目录默认视为生成物、依赖物或 Git 内部数据，不应直接手改：

- `dist/`
- `.astro/`
- `node_modules/`
- `.git/`

如果你发现问题出现在这些目录里，通常应回到源码、配置或依赖安装层解决，而不是直接在目录内部补丁式修改。

## 高风险区域清单

默认需要提高警惕的区域：

1. `scripts/`
2. `.github/workflows/`
3. `src/content.config.ts`
4. `src/layouts/`
5. `package.json`
6. `astro.config.mjs`

原因不是这些地方不能改，而是它们通常影响范围更大：要么会改写内容，要么会改变构建与部署行为，要么会同时影响多页渲染。

## How to read this repo

按目标选择入口，不要一上来全仓库乱翻。

### 想理解项目是什么

先读：

1. `README.md`
2. `CONTEXT.md`
3. 本文档

这样可以先建立项目定位、术语和结构感，再决定是否深入页面、内容或脚本。

### 想改公开页面或页面结构

先读：

1. `src/pages/`
2. `src/layouts/`
3. `src/components/`

如果改动涉及内容来源，再回头看 `src/content/` 和 `src/content.config.ts`。

### 想新增或修改博客文章

先读：

1. `src/content/blog/`
2. `src/content.config.ts`
3. `src/pages/blog.astro` 与 `src/pages/blog/`

重点确认这是“博客型内容”，而不是公开文档或内部维护说明。

### 想新增或修改公开文档

先读：

1. `src/content/docs/`
2. `src/content/docs/intro.md`
3. `src/content.config.ts`
4. `src/pages/docs.astro` 与 `src/pages/docs/`

如果内容其实是写给维护者或 AI 的，不要放进这里，应回到根目录 `docs/`。

### 想整理项目记录或项目页

先读：

1. `CONTEXT.md` 里“项目记录”“项目页”“项目状态”相关定义
2. `src/pages/projects.astro`
3. 相关博客或总结内容

当前项目记录不是独立 content collection，默认先沿用现有页面承载方式。

### 想改内容同步、预处理、发布相关逻辑

先读：

1. `package.json`
2. `scripts/`
3. `docs/operations-workflow.md`

这属于高风险区域。先确认改动会不会写文件、改链接或影响发布，再动手。

### 想理解部署位置

先读：

1. `.github/workflows/deploy.yml`
2. `astro.config.mjs`
3. `public/CNAME`

部署相关改动默认不应顺手调整，除非任务本身就是部署或域名配置。

## 一句话判断法

如果你只记一个原则，那就是：

- 公开给访客看的内容，多半在 `src/pages/`、`src/content/`、`public/`
- 写给维护者和 AI 的说明，多半在根目录 `docs/`、`README.md`、`CONTEXT.md`
- 会影响同步、生成、部署和全局行为的东西，多半在 `scripts/`、`.github/workflows/`、配置文件里
