# Phase 1 站点全面升级计划

## 目标

在不改变当前 Astro + Markdown + Obsidian 基线架构的前提下，完成一轮面向当前站点的全面升级：

1. 强化首页作为全站总入口的结构与视觉层级
2. 统一博客 / 文档 / 分类 / 专题 / 归档页面的列表系统
3. 升级项目页 / 关于页 / 起源页，收紧角色表达和站点整体叙事
4. 打磨文章详情页共享阅读壳与阅读体验
5. 在每个阶段完成后同步维护文档，记录已完成进度与边界变化

## 本轮范围

### In Scope
- `src/layouts/Layout.astro`
- `src/layouts/ArticleLayout.astro`
- `src/pages/index.astro`
- `src/pages/blog.astro`
- `src/pages/docs.astro`
- `src/pages/categories/index.astro`
- `src/pages/categories/[category].astro`
- `src/pages/archive.astro`
- `src/pages/blog/topics/[topic].astro`
- `src/pages/projects.astro`
- `src/pages/about.astro`
- `src/pages/origin.astro`
- 需要时联动少量共享工具与文档文件

### Out of Scope
- 不做框架迁移
- 不恢复独立搜索页
- 不改 GitHub Actions / 部署流 / 发布脚本
- 不新增大型依赖
- 不把项目页升级成独立内容集合
- 不改变 Obsidian 同步工作流本质

## 分阶段实施

### 阶段 1：全站壳与首页
- 调整 `Layout.astro` 的全站导航、容器节奏、共享视觉变量和状态细节
- 升级 `index.astro`，让首页更清楚承担博客 / 项目 / 文档 / 起源 / 关于的总入口职责
- 验证首页与导航在桌面 / 移动端的可读性和节奏
- 文档更新：在阶段完成后回写升级进度和新边界

### 阶段 2：列表页系统统一
- 统一 `blog.astro`、`docs.astro`、`categories/*`、`archive.astro`、`blog/topics/[topic].astro` 的列表卡片、pill、meta 和 section 节奏
- 收紧各列表页之间的视觉一致性，同时保留页面角色差异
- 文档更新：记录列表页系统统一结果与相关维护说明

### 阶段 3：项目页 / 关于页 / 起源页
- 在已升级项目页基础上继续统一站点叙事与入口层级
- 升级 `about.astro`、`origin.astro`，让它们与首页和项目页语气、结构更一致
- 文档更新：记录项目页与角色表达相关变更

### 阶段 4：文章详情页阅读体验
- 升级 `ArticleLayout.astro` 及相关详情页入口文件
- 打磨目录、meta、代码块、返回顶部、上一篇下一篇、长文阅读节奏
- 文档更新：记录阅读壳升级和验证方式

## 验证策略

每阶段完成后至少执行：

- `npm run links:check`
- `npm run build:astro`

最终执行：

- Playwright 人工检查：`/`、`/blog/`、`/docs/`、`/projects/`、`/origin/`、`/about/`
- 检查控制台错误、移动端溢出、导航可用性、页面层级是否清楚

### 阶段 2 列表页固定 QA 路由

为避免列表页统一后“只看了 blog/docs 没看其他列表页”，阶段 2 必须至少检查以下页面：

- `/blog/`
- `/docs/`
- `/categories/`
- `/categories/%E6%8C%87%E5%8D%97/`（即“指南”分类页）
- `/archive/`
- `/blog/topics/obsidian/`

每个页面至少检查：

1. 页面标题与主 heading 正确出现
2. 列表项 / pill / intro 区块在桌面端结构正常
3. 控制台无 error
4. `390x844` 视口下无横向溢出

### 阶段 4 文章详情固定回归样本

为避免详情页升级后 TOC / 返回顶部 / 阅读壳无法验收，阶段 4 固定使用以下样本：

- 博客详情样本 A：`/blog/sbti20总结/`
- 博客详情样本 B：`/blog/sbti20的设计思路/`
- 文档详情样本：`/docs/intro/`

至少检查：

1. 返回入口按钮存在且可用
2. 文章头部标题、描述、meta 行存在
3. 博客详情样本中至少一个页面必须生成 TOC，并验证 TOC 可展开、可点击、可高亮
4. 返回顶部按钮存在并可点击
5. 若本阶段补上上一篇 / 下一篇导航，则必须检查相邻文章入口存在，点击后 URL 和标题发生正确变化
6. 控制台无 error
7. 移动端无横向溢出

### 代码块相关说明

当前公开内容里没有稳定的 fenced code block 详情样本可直接作为阶段 4 固定回归页。

因此本轮 Phase 1 的详情页升级会：

1. 保持 `ArticleLayout.astro` 中现有代码复制逻辑稳定
2. 在没有明确代码块样本前，不把“代码块视觉系统重做”列为阶段 4 的强制验收项
3. 若阶段 4 涉及上一篇 / 下一篇功能补齐，则 QA 必须把它纳入固定详情样本回归，而不是只做静态视觉检查
4. 若后续新增带代码块的公开文章，再把它补进详情页回归样本

## 文档维护要求

每完成一个阶段，都要同步更新以下至少一项：

- `README.md`（如果入口或维护理解发生变化）
- `docs/project-structure.md`
- `docs/maintenance-quickstart.md`
- `docs/operations-workflow.md`
- `升级优化规划.md`（仅记录阶段进展，不回退成操作手册）

## 风险控制

- 保持小步、可验证、可回退
- 不把 `npm run build` 当成默认验证命令
- 不让视觉升级破坏当前“暗色、冷调、微光、克制”的站点气质
- 不把访客文档和维护文档混写

## 后续历史追记

### 2026-09-10 working-tree iterations

- 早期 Phase 1 的实施与回滚仍以本计划前文及同名 notepad 的 2026-07-24 记录为准，本节不改写其历史。
- 随后的 Lab 探索发生在 2026-09-08 至 2026-09-09，属于隔离实验，不应表述为生产实现；正式方向收敛为 dark / cool / editorial / archive-ledger / restrained。
- Header 从顶部常驻形态收敛为滚动后的 floating capsule。主导航只保留一个 slider，用于在实际路由变更前提供 200ms 的同 DOM 反馈。
- 2026-09-10 曾在工作树实现跨文档 View Transition。该实现随后被替换，不是提交历史的一部分：document-scoped snapshot 会覆盖导航文字，且视觉结果不符合已确认 preview。
- 替换后的当前路径保持 Astro MPA，以同 DOM 的 200ms pre-navigation slider 反馈导航。活动状态按 exact route 与 active section 区分，避免将专题、归档等分区路由误判为单一精确页面。
- 本轮完成 Archive Year Marker 的中间宽度修复并接受 targeted responsive / geometry L2 QA；Topic fallback 作为 focused functional regression fix 验证。导航的 same-DOM replacement 接受 L3 targeted QA；后续 nested-route exact-vs-section 修复另行接受 targeted QA，未重跑完整 L3。
- QA 方法收敛为按改动风险选择最低足够的 L1、L2 或 L3，以 targeted viewport sweep 和组件不变量补足固定 viewport 检查。先检查 DOM / geometry，再查看截图；本地 server ready 后必须明确执行 browser_navigate。

### 2026-09-11 committed node and current working tree

- `66aa8d51d85de57dbe64a5ca6b6ee5e1eecf9cb8`，简称 `66aa8d5`，是当前生产实现的提交节点，包含最终七个生产文件。
- `AGENTS.md`、`.omo` 与 `.opencode` 的后续规则和记录属于当前 working-tree state，不应倒推为 `66aa8d5` 已提交的内容。
