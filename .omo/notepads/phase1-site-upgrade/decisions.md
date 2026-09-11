2026-07-24
- 决定把首页升级重点放在“总入口职责”而不是继续堆大封面效果，因此新增了站点概览、入口地图和当前阶段取向区块。
- 决定不为这一步额外改正式文档文件，因为当前没有发生仓库结构、命令边界或维护职责层面的变化；阶段进度先写入内部 notepad。
- 决定把阶段 2 的列表页统一限定在页面文件内部完成，不回退去改 `Layout.astro` 或共享数据模型，以降低回归风险。
- 决定保留各列表页角色差异：分类页继续像入口，归档页继续按年份分组，专题页继续保留排序控制，而不是做成一套完全相同的复制页。
- 决定阶段 3 不再重新发散项目页结构，而是把 about/origin 收拢到同一站点语言中，让“项目 / 关于 / 起源”形成一组互相支撑的角色表达页。
- 决定阶段 4 的共享壳升级优先补齐“阅读连续性”而不是重做整套详情页视觉，因此优先把上一篇 / 下一篇导航并入 `ArticleLayout.astro`。
- 决定保留 `/categories/` 作为轻量入口页，只强化 intro 节奏与 pill 读感，不把它改造成和 `/blog/`、`/docs/` 一样的完整卡片目录。
- 决定把统一重点放在卡片半径、padding、hover/focus、日期与计数 pills、section 间距上，而不是把所有列表页做成完全相同的结构复制。
- 决定本轮做一次收口回滚：撤掉详情页上一篇 / 下一篇、撤掉当前公开表面的标签入口与标签展示，并把首页恢复为升级前的单屏封面版本。
- 决定卡片“收紧”优先通过减少 padding / gap、移除等高拉伸和删掉冗余说明来完成，不重新设计版式，也不扩散到未点名页面。
- 决定首页最终采用“旧单屏封面 + 保留关于入口”的折中版本；文档页则彻底移除分类入口条与卡片分类 pill，避免继续被感知为标签功能。

2026-09-10
- 决定把 Lab 的 2026-09-08 至 2026-09-09 探索与生产状态分开记录。Lab 只证明可探索的方向，不构成生产实现声明；正式页面语言收敛为 dark / cool / editorial / archive-ledger / restrained。
- 决定 Header 采用“顶部初始状态，滚动后 floating capsule”的行为，并让主导航只保留一个 slider。
- 决定放弃已在工作树实现的跨文档 View Transition。document-scoped snapshot 会覆盖导航文字，且不符合已确认 preview，因此由同 DOM 的 200ms pre-navigation slider 替代，继续保留 Astro MPA。
- 决定把 exact route 与 active section 分开判断：精确路由服务页面级 active state，section state 服务专题、归档等分区路径及其 nested route。
- 决定用按风险分级的 L1 / L2 / L3 QA 代替无差别全量验收，并将 targeted sweep、组件不变量、DOM / geometry 优先和显式 browser_navigate 固化为当前方法。

2026-09-11
- 决定以 `66aa8d5` 作为当前提交的生产实现节点。该节点包含最终七个生产文件；其后的 `AGENTS.md`、`.omo`、`.opencode` 内容仍是 working-tree state。
- 补记 2026-09-10 Navigation 方案演进：普通 Astro MPA 导航会销毁旧 DOM，新页面 slider 直接以目标位置创建，因此原 CSS transition 无法形成跨页面连续位移；这是当时采用 cross-document View Transition 的原因。
- 补记 2026-09-10 Navigation 取舍：View Transition 因 document-scoped snapshot 覆盖文字而被替换后，选择最小原生 JavaScript 在旧页面同一 DOM 内先移动 slider，再继续普通 MPA 导航。该效果不足以证明引入 React、SPA、新依赖、Navigation framework 或全局客户端路由系统的必要性，因此继续保持 Astro 静态 MPA 架构。
