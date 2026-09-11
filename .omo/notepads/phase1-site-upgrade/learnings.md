2026-07-24
- 阶段 1 第一批已落地：`src/layouts/Layout.astro` 与 `src/pages/index.astro` 完成首轮升级。
- 首页已从“纯封面页”升级为“封面 + 站点概览 + 入口地图 + 当前阶段取向”的总入口页。
- `Layout.astro` 的共享壳升级保持克制，只强化了粘性头部、导航节奏、共享背景与容器细节，没有改变全站信息架构。
- 首页当前真实统计可直接使用：博客 3 篇、文档 1 篇、专题 2 个、文档分类 1 个。
- 首页移动端在 `390x844` 视口下无横向溢出，控制台 0 error，`npm run build:astro` 通过。
- 阶段 2 列表页统一已落地：`blog.astro`、`docs.astro`、`categories/index.astro`、`categories/[category].astro`、`archive.astro`、`blog/topics/[topic].astro` 现在共享更一致的 intro / pill / list-card / meta 节奏。
- 阶段 2 固定 QA 路由全部通过：`/blog/`、`/docs/`、`/categories/`、`/categories/指南/`、`/archive/`、`/blog/topics/obsidian/` 均在桌面和 `390x844` 视口下无横向溢出、控制台无 error。
- 阶段 3 已落地：`projects.astro` 作为项目入口页继续保留，`about.astro` 与 `origin.astro` 已收拢到和首页 / 项目页一致的角色说明页语言。
- 阶段 3 路由 QA 通过：`/projects/`、`/about/`、`/origin/` 在桌面和 `390x844` 视口下均无横向溢出，控制台 0 error。
- 阶段 4 已落地：`ArticleLayout.astro` 现在补齐了共享的上一篇 / 下一篇导航，`blog/[slug].astro` 与 `docs/[slug].astro` 已接入。
- 阶段 4 固定样本 QA 通过：`/blog/sbti20总结/`、`/blog/sbti20的设计思路/` 均生成 TOC，点击目录后可用；上一篇 / 下一篇导航可跳转；`/docs/intro/` 维持无 TOC 但阅读壳正常。
- 阶段 1 第二批开始统一列表页系统：6 个列表页统一采用“intro card + meta pills + compact glass cards / grouped list”的基础语言，但仍保留博客、文档、分类、归档、专题各自的页面职责。
- 这一步没有抽 shared utility，而是把统一规则留在页面本地 CSS，目的是先完成站点家族感收敛，同时避免提前改动共享布局或内容模型。
- 本轮回滚已把 `src/pages/index.astro` 恢复为较早的单屏封面首页，撤掉 overview / entry-map / direction 三个总入口区块。
- `ArticleLayout.astro`、`blog/[slug].astro`、`docs/[slug].astro` 已移除上一篇 / 下一篇数据接线与 UI；`blog.astro`、`blog/topics/[topic].astro` 已移除当前公开标签入口与卡片标签展示。
- `about.astro` 与 `origin.astro` 已去掉顶部 pills，并把说明文案收成更面向访客的版本；博客与专题卡片也去掉等高拉伸并缩小 padding / gap，空旷感减弱。
- 后续补充修整：首页单屏封面版重新保留了 `关于` 入口；`docs.astro` 已移除分类入口条与卡片分类 pill，文档页不再保留这轮公开标签/分类展示。

2026-09-10
- session `ses_f79470ed3ffeyJgI8gQ621Lofs` 记录了跨文档 View Transition 的工作树实现、Archive / Topic 修复、改用 same-DOM slider 的替换，以及后续 nested-route 定向修复。
- 该 View Transition 是已实施后又被替换的 working-tree iteration，不是已提交功能。问题出在 document-scoped snapshot 覆盖导航文字，并且与确认过的 preview 不一致。
- 保留下来的导航路径是 Astro MPA 加同 DOM 200ms pre-navigation slider。单一 slider 可避免并行导航指示器造成的状态竞争。
- active section 的 server-side 前缀匹配是预期行为；click handler 的问题在于把 active / `aria-current` 当作精确 current URL。修复后以 pathname 判断 exact route，并允许当前 section 立即导航回其 section root。
- Archive Year Marker 的修复接受 targeted responsive / geometry L2 QA；Topic fallback 使用 focused functional regression verification。same-DOM slider replacement 接受 L3 targeted QA；nested-route 修复只接受自己的 targeted QA，未重跑完整 L3。
- 响应式验证不应只看桌面和手机两个端点。根据风险选 L1 / L2 / L3，必要时做 targeted sweep，并先以 DOM / geometry 验证组件不变量，再用截图确认视觉结果；server ready 之后仍需要显式 browser_navigate。

2026-09-11
- `66aa8d51d85de57dbe64a5ca6b6ee5e1eecf9cb8` 是当前 committed implementation node，包含最终七个生产文件。Lab 提交属于 2026-09-08 至 2026-09-09 的隔离实验，不能混入生产历史。
- `AGENTS.md`、`.omo`、`.opencode` 是该提交之后的 working-tree state；它们说明当前规则与记录，不改变 `66aa8d5` 的提交边界。
