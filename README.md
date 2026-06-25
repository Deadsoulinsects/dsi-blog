# Dead Soul Insects

Dead Soul Insects 是一个基于 Astro 的个人静态博客，用来整理博客文章、项目记录、说明文档，以及与站点气质相关的起源页面。

项目默认保持 Astro + Markdown + Obsidian 同步工作流，不主动升级为更复杂的架构。

## 技术栈

- Astro
- TypeScript
- Markdown / Astro Content Collections
- npm
- GitHub Pages

## 目录结构

```text
src/
  pages/            路由页面
  layouts/          站点布局
  content/blog/     博客 Markdown 内容
  content/docs/     文档 Markdown 内容
  content.config.ts 内容集合 schema
scripts/            Obsidian 同步、预处理、链接转换、发布脚本
public/             静态资源
```

高风险目录默认不要随意修改：

- `scripts/`
- `.github/workflows/`

生成目录、依赖目录和 Git 内部目录不要编辑：

- `dist/`
- `.astro/`
- `node_modules/`
- `.git/`

## 常用命令

```bash
npm install         # 安装依赖
npm run dev         # 启动本地开发服务器
npm run links:check # 检查 Markdown 链接是否需要转换
npm run sync:blog:dry      # 预览博客同步，不写入
npm run sync:origin:dry    # 预览起源同步，不写入
npm run prepare:content:dry # 预览内容 frontmatter 补全，不写入
npm run prepare:origin:dry  # 预览起源 frontmatter 补全，不写入
npm run content:prepare:dry # 预览完整内容准备流程，不写入
npm run content:prepare     # 执行完整内容准备流程
npm run build:astro # 只执行 Astro 构建，不触发内容同步
npm run build       # 执行完整构建流程
npm run preview     # 预览构建结果
```

## 关于构建命令的重要说明

`npm run build` 不是“纯构建检查”。

它会先执行 `prebuild`，包括：

1. 同步 Obsidian 博客内容
2. 同步 Obsidian 起源内容
3. 为缺少 frontmatter 的内容补默认 frontmatter
4. 为起源详情页补布局 frontmatter
5. 自动转换 Markdown 内部链接

也就是说，`npm run build` 可能会改动仓库里的 Markdown 文件。

如果只是想验证 Astro 站点本身能否成功构建，请优先使用：

```bash
npm run build:astro
```

## Obsidian 同步工作流

项目包含本地 Obsidian 同步脚本，源路径写在 `scripts/` 中，属于当前用户的个人工作流。

默认规则：

1. 不主动修改这些本地 Windows 路径。
2. 如果别的环境里源目录不存在，脚本出现 warning，通常不是源码错误。
3. 博客同步会保留目标文件的 frontmatter，只刷新正文。
4. 起源详情页会忽略来源 frontmatter，由站点维护页面 frontmatter。
5. 如果只想预览同步或 frontmatter 处理结果，优先使用带 `:dry` 的命令。

## 内容工作流命令说明

```bash
npm run sync:blog:dry       # 只预览博客同步结果
npm run sync:origin:dry     # 只预览起源同步结果
npm run prepare:content:dry # 只预览内容 frontmatter 补全
npm run prepare:origin:dry  # 只预览起源页 frontmatter 补全
npm run content:prepare:dry # 只预览完整内容准备流程
npm run content:prepare     # 实际执行内容准备流程
```

内容流的大致顺序是：

1. 从 Obsidian 来源同步博客或起源 Markdown。
2. 为缺少 frontmatter 的内容补默认 metadata。
3. 为起源详情页补布局 frontmatter。
4. 规范化 Markdown 内部链接。

## 内容规则

博客文章放在：`src/content/blog/`

文档页面放在：`src/content/docs/`

Markdown 内容应保持合法 frontmatter，日期使用 `YYYY-MM-DD`。

默认不要删除这些元数据，除非确有理由：

- `title`
- `description`
- `pubDate`
- `category`（文档）
- `tags`

保留现有中文文件名、中文路径和中文内容，不擅自改成英文或拼音。

## UI 与样式方向

当前站点视觉方向需要保持一致：

- 深色背景
- 冷色调
- 半透明面板
- 圆角卡片
- 微弱发光
- 克制动画

默认不要引入 Tailwind、React 或大型 UI 依赖。

## 发布注意事项

默认不要运行：

```bash
npm run publish
```

这个命令可能会构建、提交并推送代码。

## 临时输出与工具缓存

使用 Playwright MCP、浏览器截图、沙盒验证或其他自动化工具时，不要把临时截图、沙盒页面和验证输出留在仓库根目录。

默认规则：

1. 临时截图和沙盒文件优先放到 `D:\ai-output`。
2. 任务结束后删除不需要提交的临时文件。
3. 本地备份目录 `备份/` 不提交到 GitHub。
4. 如果确实需要保留验证产物，应放在清晰命名的外部输出目录，而不是混入项目源码。

## 推荐维护顺序

日常维护时，建议按下面顺序操作：

1. 先修改页面、内容或样式。
2. 运行 `npm run links:check`。
3. 运行 `npm run build:astro` 做纯构建检查。
4. 如果明确需要验证完整内容工作流，再运行 `npm run build`。
5. 如需上线，再单独处理发布动作。

## 当前升级说明

本仓库当前还包含一份升级目标文档：

```text
D:\DSI-blog\升级优化规划.md
```

后续升级需要严格遵守项目 `AGENTS.md` 与该规划文档中的限制，不提交 GitHub，并在每项大改动后进行备份。
