2026-09-10
- Date: 2026-09-10
  Problem: Archive Year Marker 在中间宽度换行。
  Impact: 归档年份标记的列对齐和可读性受损。
  Cause: 流式年份 typography 与过小的固定共享 track 组合。
  Fix: 使用专用 archive year column，并采用 nowrap / intrinsic sizing。
  Verification: targeted responsive / geometry L2 QA。
  Status: resolved in the current production implementation represented by `66aa8d5`.

- Date: 2026-09-10
  Problem: Topic description fallback 在 description 为空字符串时失效。
  Impact: 专题页可显示空描述，而不是预期回退文案。
  Cause: 回退只检查 nullish 值，空字符串绕过该条件。
  Fix: 使用 trim 加 logical fallback。
  Verification: focused functional regression verification。
  Status: resolved in the current production implementation represented by `66aa8d5`.

- Date: 2026-09-10
  Problem: 跨文档 View Transition 覆盖导航文字。
  Impact: 导航可读性与已确认 preview 的体验受损，不能作为生产导航方案。
  Cause: document-scoped snapshot 将导航纳入过渡快照层。
  Fix: 在工作树中替换为保留 Astro MPA 的 same-DOM 200ms slider。
  Verification: `ses_f79470ed3ffeyJgI8gQ621Lofs` 记录了替换及 L3 targeted QA。
  Status: resolved before `66aa8d5`; View Transition was not committed.

- Date: 2026-09-10
  Problem: nested-route 中点击 active section 无法返回 section root。
  Impact: 用户在分区的嵌套路由中不能通过当前分区导航立即返回分区根路径。
  Cause: click handler 将 active section 与 exact current URL 混同，并将 active / `aria-current` 作为精确 URL 状态使用。
  Fix: 用 pathname comparison 判断 exact route，并允许当前 section 立即导航回 section root。
  Verification: session `ses_f79470ed3ffeyJgI8gQ621Lofs` 记录了 targeted QA；未重跑完整 L3。
  Status: resolved in the current production implementation represented by `66aa8d5`.

2026-09-11
- Date: 2026-09-10
  Problem: Playwright server 已报告 ready，但执行链没有立即调用 `browser_navigate`，流程停在端口已启动状态。
  Impact: 浏览器 QA 没有进入目标页面，表现为无效等待。
  Cause: server readiness 与显式浏览器导航被拆到两个回合，错误地把端口 ready 当成页面已打开。
  Fix: 将 HTTP ready 后显式且及时执行 `browser_navigate` 固化为项目 QA 流程要求。
  Verification: session `ses_f79470ed3ffeyJgI8gQ621Lofs` 记录了该失误、恢复导航和规则核对。
  Status: resolved; current `AGENTS.md` and `dsi-browser-visual-qa` Skill both require explicit navigation after readiness.
