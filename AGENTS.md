# AGENTS.md

> 用途：为 OpenCode / AI coding agent 提供短、稳定、低上下文占用的 DSI-blog 项目规则。动态事实以当前仓库文件和实际执行结果为准。

## 项目概览

这是 **Dead Soul Insects** 的 Astro 个人静态博客，主要发布博客文章、文档、项目记录、起源与关于页面，并包含从本地 Obsidian 工作区整理内容的脚本。

当前默认架构：

- Astro
- TypeScript
- Markdown / Astro Content Collections
- npm
- GitHub Pages

默认保持 Astro 静态站点架构。不要为了追逐新技术增加复杂度。涉及架构升级、新依赖、部署变化、内容系统变化或大范围重构时，先说明目标、收益、成本、影响文件、风险和回退路径，再执行。

## 设计文档

仓库根目录的 `DESIGN.md` 是 Dead Soul Insects 当前设计语言与视觉意图的项目级来源。

涉及以下任务时，修改前必须先读取 `DESIGN.md`：

- 页面视觉、布局或信息层级；
- Typography、颜色、surface、spacing 或视觉 token；
- Header / Navigation / Archive / Article / Docs / Project 等界面组件；
- 响应式结构；
- 交互反馈和动效；
- 新页面或现有页面的重要视觉调整。

职责边界：

- `DESIGN.md` 决定设计意图、视觉语言、信息层级和设计约束；
- `AGENTS.md` 决定工程实现、修改边界、验证和协作流程；
- 当前用户明确要求高于既有设计文档；
- 用户要求与既有设计语言发生实质变化时，不要静默改写整个设计体系，应说明影响并判断是否需要同步更新 `DESIGN.md`；
- 精确颜色值、尺寸、breakpoint、组件路径等动态实现事实，优先以当前代码和 design tokens 为准，不得用过期文档覆盖当前仓库事实。

## 常用命令

```bash
npm run dev
npm run lint
npm run lint:fix
npm run build:astro
npm run preview
npm run links:check
```

除非用户明确要求，不得执行：

```bash
npm run publish
```

`publish` 可能包含构建、提交和推送行为。

## 工作模式

### 维护模式

适用于 Bug、文本、样式、页面、文章和小范围交互调整。

- 优先最小修改。
- 保持无关行为不变。
- 不做无关重构。

### 建议模式

用户没有明确方案、询问优化或长期方向时，可以主动提出 UI、SEO、性能、内容工作流或结构建议。

重大修改先给方案，不直接实施。

### 架构评估模式

涉及新框架、新依赖、复杂功能、部署变化、目录重构或内容系统变化时：

- 先理解真实目标；
- 评估当前 Astro 架构是否仍然合理；
- 说明替代方案、迁移成本、主要风险和回退方式；
- 未经明确授权，不执行高影响迁移。

## 目录规则

- `src/pages/`：路由页面。
- `src/layouts/`：共享布局，修改会影响多个页面，需谨慎。
- `src/content/blog/`：公开博客 Markdown。
- `src/content/docs/`：公开文档 Markdown。
- `src/content.config.ts`：Content Collections schema，谨慎修改。
- `scripts/`：同步、预处理、发布相关脚本，高风险区域。
- `public/`：静态资源；新增通常低风险，删除需谨慎。
- `.github/workflows/`：部署配置，默认不修改。

临时 Preview、Playwright 截图、DOM geometry、浏览器调试文件、QA 报告等默认放到：

```text
D:\ai-output
```

不得修改：

- `dist/`
- `.astro/`
- `node_modules/`
- `.git/`

## 内容规则

博客文章放在 `src/content/blog/`，公开文档放在 `src/content/docs/`。

编辑 Markdown 时：

- 保持有效 frontmatter；
- 日期使用 `YYYY-MM-DD`；
- 不无理由删除 title、description、category、tags 等 metadata；
- 不把 Obsidian 私人原始笔记直接发布到公开内容目录；
- 保留中文文件名、中文路径和现有中文内容；
- 不擅自改成拼音、英文或转义路径。

## Obsidian 同步规则

- 脚本中的本地 Windows 路径属于用户个人工作流，默认不要修改。
- 非用户环境中源目录不存在的 warning 通常不代表源码错误。
- 不要为了消除环境 warning 就重写同步脚本。
- 如果修改可能被后续同步覆盖，应先判断应修改源内容、同步逻辑还是目标文件。

## 视觉探索流程

当视觉或交互方向尚未确认时：

- 先在 `D:\ai-output` 做独立 Preview / playground；
- 用户确认方向后再同步到正式页面；
- 不把探索文件放在仓库根目录；
- 不因为探索方案存在，就默认它已经成为正式设计语言；
- 已完成使命的 Lab / Preview 只作为历史参考，除非用户明确要求，不应自动成为生产设计来源。

## CSS 与前端实现规则

- 优先复用现有 design tokens，避免重复硬编码视觉值。
- 重复样式优先共享规则。
- `:is()` 用于合并相似 hover / focus / active 状态。
- `:where()` 只用于低 specificity 基础规则。
- 组件自身随容器宽度变化时优先考虑 container query；页面级布局切换使用 viewport media query。
- 移动端优先 normal flow / natural reflow，避免固定高度和绝对定位强塞内容。
- 不使用 `overflow: hidden` 掩盖真实布局问题。
- 表现层优先 CSS-first；CSS 能稳定完成的视觉状态不要无必要加 JavaScript。
- 使用 `clamp()` / `vw` 与固定 Grid track、固定宽度、`min-width` / `max-width` 组合时，必须意识到中间 viewport 风险。
- 必须保持完整的短内容（年份、紧凑日期、状态、导航项等）优先通过合理 sizing / `minmax()` / intrinsic sizing / `white-space` 约束解决，而不是依赖事后补丁。

默认不新增 React、Tailwind、UI framework 或大型依赖。确有长期价值时先说明用途、替代方案、必要性和影响。

## 浏览器与视觉 QA

DSI-blog 的视觉 QA 使用项目专属 Skill：

```text
dsi-browser-visual-qa
```

涉及页面布局、CSS、Header / Navigation、Grid / Flex、Typography、响应式、sticky/fixed、Archive / Topic / Project / Docs 列表、探索页或截图验收时，优先加载该 Skill。

项目层只保留以下硬规则：

- build 成功不等于视觉 QA 通过；
- 必须先 DOM / geometry，再 screenshot；
- 根据修改风险选择**最低但足够**的 QA 等级，不默认全量验收；
- 中间 viewport 是否需要检查、检查多少，由 Skill 按风险决定；
- 页面无 horizontal overflow 不代表关键组件没有异常换行；
- 修改共享 `Layout` / Header / Footer / 全局 tokens 时，应提高 QA 等级并抽查未修改页面；
- 浏览器 QA 使用非阻塞 Astro server，HTTP ready 后必须显式 `browser_navigate`；
- 所有等待必须有限 timeout；
- QA 产物放 `D:\ai-output`。

具体 L1 / L2 / L3 分级、viewport、named state、component invariant、sweep 和报告格式由 `dsi-browser-visual-qa` Skill 定义。

## 代码修改边界

修改前先读相关文件，不要猜。

默认不得进行以下高影响操作，除非用户明确要求或任务确实需要且已说明影响：

- 修改站点域名或部署配置；
- 修改 GitHub Actions；
- 修改发布脚本；
- 改变现有路由；
- 批量重命名；
- 删除既有中文内容；
- 新增或移除重要依赖；
- 批量删除、移动文件；
- 改变内容系统；
- 改变 Obsidian 工作流。

新增依赖前说明用途、替代方案、必要性和维护影响。

小功能优先 Astro、原生 CSS 和原生 JavaScript。

## 验证

代码、样式、内容结构或配置修改后，按改动类型选择最低充分的验证，不设统一命令链。

- 仅修改维护文档或其他文字说明时，通常审阅本次 scoped diff 即可；只有链接或目标路径变动时才运行 `npm run links:check`。
- 修改 JavaScript、TypeScript 或可由 Oxlint 覆盖的代码时，运行只读静态检查 `npm run lint`。`npm run lint:fix` 是显式修复命令，会写入文件；使用后必须审阅其 diff，并重新运行 `npm run lint`。
- 修改 Astro 页面、组件、布局、内容集合或可能影响模板构建的内容时，按需要运行 `npm run build:astro`。Oxlint 不替代 `npm run build:astro`，也不完整验证 Astro 构建或模板。
- 修改 Markdown 链接或移动链接目标时，运行 `npm run links:check`。
- `npm run build` 属于完整构建 / 全链路验证。当前 npm 生命周期会先执行 `prebuild`，其中包含 Obsidian 内容同步、内容预处理和 Markdown 链接写回，因此可能修改仓库内容文件。
- 只有任务确实需要验证完整内容流水线时才运行 `npm run build`；不要为了验证普通 UI 或文档修改无必要地产生内容写入。

如果仓库已有 Astro 静态检查命令，也应按任务需要执行。

验证失败时：

- 报告准确命令和错误；
- 区分源码问题与已知环境 warning；
- 不为了让验证“变绿”擅自安装未授权依赖；
- 不得在关键验证失败时声称完成。

视觉相关修改按 `dsi-browser-visual-qa` 的风险等级执行浏览器验证。

## 初学者协作

非简单修改应简要说明：

- 为什么需要这样改；
- 修改了哪些文件；
- 会产生什么效果；
- 主要风险；
- 如何验证。

## 已知说明

如果完整构建提示 Obsidian 源目录不存在，应先判断是否属于当前环境下的已知 warning。不要仅凭这一 warning 修改同步脚本。

如果构建出现 `Permission denied` 且指向 `node_modules/.bin/*`，可能与压缩包权限或跨平台依赖有关；优先检查 / 重装依赖，不要先改源码。

## 完成后报告

修改类任务结束时简要报告：

1. 做了什么；
2. 修改了哪些文件；
3. 执行了哪些验证及结果；
4. 浏览器 QA 等级与覆盖范围（如适用）；
5. 未验证项；
6. 剩余风险；
7. 当前 Git 状态（如任务涉及仓库修改）。

未经明确授权，不要把“修改完成”自动延伸为 commit、push、merge 或 publish。
