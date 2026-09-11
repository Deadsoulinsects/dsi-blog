---
name: dsi-browser-visual-qa
description: 仅用于 DSI-blog 项目内的浏览器视觉 QA、响应式验证、探索页验收和布局回归复查。按修改风险选择 L1 / L2 / L3 最低足够验证等级，避免无必要的全量 Playwright 验收。
---

# DSI 浏览器视觉与响应式 QA

## 目标

确认页面在真实浏览器中：
1. 结构安全；
2. 响应式稳定；
3. 关键组件没有非预期换行、挤压或错位；
4. 视觉仍符合 DSI 当前 editorial / archive-ledger 语言。

核心原则：

```text
先结构，后截图
按风险验证
默认使用最低足够等级
发现问题再升级
```

---

## 一、先确定 QA 等级

### L1：轻量验证

适用于：
- 文案；
- 颜色；
- 不影响布局尺寸的局部视觉调整；
- 单个 hover / focus；
- 很小的局部间距修改；
- 已有布局中的简单修补。

默认执行：
- 必要静态检查；
- 只检查直接受影响页面；
- 1 个主要 viewport；
- 如果修改可能影响移动端，再补 375px；
- 只检查与修改直接相关的 DOM / geometry / interaction；
- 不默认执行 viewport sweep；
- 不默认检查未修改页面；
- 不默认生成多张截图。

### L2：标准响应式验证

适用于：
- Grid / Flex；
- typography 尺寸；
- spacing；
- component width；
- 响应式组件；
- Archive / Topic / Project / Docs 列表结构；
- 局部 sticky / fixed；
- 已发现某个中间宽度 Bug。

默认执行：
- 受影响页面；
- 手机 + 中间/分屏 + 桌面代表点；
- 只对高风险宽度区间执行 targeted sweep；
- 检查相关 component invariant；
- 截图只保留代表点和异常点；
- 不默认全站 smoke test。

推荐代表点可从以下选择：

```text
375
768
900
1024
1280
```

不要求全部使用，应根据风险裁剪。

### L3：完整视觉验证

适用于：
- `Layout.astro`；
- Header / Navigation；
- 全局 container / typography / tokens；
- breakpoint 系统变化；
- 多页面共享组件；
- 全站视觉重构；
- 用户明确要求完整验收。

默认执行：
- 目标页面族；
- 手机 / 中间 / 桌面多个代表点；
- 必要范围 responsive sweep；
- 相关 named states；
- component invariants；
- 共享 Layout 未修改页面 smoke test；
- interaction / focus / scrolled state；
- 代表性 screenshots。

### 升级规则

- 默认选择满足当前风险的最低等级。
- L1 发现布局异常 → 升级到 L2。
- L2 发现共享 Layout / 多页面回归 → 升级到 L3。
- 不要因为“流程完整”而让一个小修改跑 L3。

---

## 二、Astro Server 与 Browser Navigate

需要本地浏览器 QA 时：

1. 用后台进程、persistent terminal 或 session 启动 `npm run dev` / `npm run preview`；
2. 不等待长期 server 自然退出；
3. 读取实际 URL / port；
4. 等待 HTTP ready，必须有限 timeout；
5. ready 后立即：

```text
browser_navigate(<实际 URL>)
```

禁止：

```text
server ready
→ 没有 browser_navigate
→ 持续等待
```

导航失败时：
- 检查 server 是否存活；
- 检查 URL / port；
- 检查 route；
- 只做有限次数重试；
- 仍失败则停止并报告未验证项。

同一轮 QA 尽量复用同一个 server 和 browser session。

---

## 三、页面选择

### 核心列表页

按修改范围选择：

```text
/blog
/archive
/projects
/docs
/origin
/about
```

### 嵌套页面

涉及 Navigation active、共享 Layout 或文章布局时，抽查：

```text
/blog/<slug>/
/blog/topics/<slug>/
/docs/<slug>/
```

### L3 Smoke Test

修改共享 `Layout.astro`、Header、Footer、全局 tokens、page shell 或全局 typography 时，额外抽查：

```text
/
/lab/
```

目标只检查明显全局回归，不重新完整测试所有页面。

---

## 四、Named State 库

Named state 是可复用状态，不代表每次都必须全部执行。

只选择与本次修改相关的状态。

### `top`
页面顶部 / Intro / Hero。

### `header-scrolled`
滚动后的 floating Header / active slider。

### `navigation-route`
嵌套路由上的所属 section active 状态，以及 section 间的 slider 导航。

### `dense-list`
Blog Posts / Projects / Docs / Topic 等高密度列表。

### `archive-ledger`
Archive Year Marker + compact date + title。

### `lower-page`
页面下部、secondary section、Footer。

### `mobile-narrow`
窄手机。

### `narrow-desktop`
半屏、三分之一屏、四分之一屏一类窄桌面窗口。

---

## 五、Responsive Sweep

### L1
默认不做 sweep。

### L2
只扫描高风险区间。

例如 Archive Year Marker 问题主要在：

```text
760–1280
```

可以先检查：

```text
800
900
1024
1100
1200
1280
```

如果某一区间出现异常，再在附近以 20–40px 间隔细扫。

### L3
根据实际 breakpoint 和 fluid layout 选择较宽范围，不要求机械从 360 扫到 1600。

优先覆盖：
- CSS breakpoint 附近；
- `clamp()` / `vw` 与固定 track 共存区间；
- narrow desktop；
- 常见桌面宽度。

### 截图原则
Sweep 主要用 DOM / geometry。
不要每个宽度都截图。

只截图：
- 代表宽度；
- 异常宽度；
- 修复前后需要对比的宽度。

---

## 六、Geometry 检查

按 QA 等级和修改范围检查：

- horizontal overflow；
- overlap / clipping；
- fixed / sticky 是否遮挡正文；
- Grid / Flex track 是否被撑破；
- container 是否异常；
- 长中文标题是否合理换行；
- mobile stacking 是否自然；
- 关键元素是否被挤压。

如果结构失败，先修结构，不继续做纯视觉判断。

---

## 七、Component Invariants

只检查与本次修改相关的不变量。

### Header / Navigation
- 主导航项完整；
- active section 由 pathname 的所属 section 决定，不要求与当前 URL 完全一致；
- 嵌套 blog、topic、archive、docs 等路由仍显示正确的 active section；
- 仅有一个同 DOM slider，始终与 active item 对齐，且不漂出容器；
- scrolled capsule 能装下内容；
- mobile Header 回 normal flow。

### Archive
- `2026` 等 Year Marker 单行；
- `05.08` 等 compact date 单行；
- Year Marker 不侵入 ledger；
- title 不被异常压缩；
- rule 起点正常。

### Blog / Topic / Docs
- 日期、count、metadata 不异常逐字换行；
- 长标题可自然换行但不碰撞 metadata。

### Projects
- `已完成`、`进行中`、`实验`、`暂停` 不异常逐字换行或裁切；
- 项目链接可触达。

### About / Contact
- 联系方式 value 可安全换行；
- 复制按钮不被挤出；
- clipboard 失败不产生未捕获异常。

---

## 八、Fluid Layout 风险

看到以下组合时提高警惕：

```css
font-size: clamp(...);
width: ...;
min-width: ...;
max-width: ...;
grid-template-columns: ...;
```

重点判断：

```text
会增长的内容
+
固定不增长的父 track
=
中间 viewport 回归
```

修复优先级：
1. 修正布局约束；
2. 独立 column / width token；
3. `minmax()` / intrinsic sizing；
4. 合理 `min-width`；
5. 对确实必须单行的短内容使用 `white-space: nowrap`；
6. 最后才缩小已确认的字体比例。

不要用 `overflow: hidden` 掩盖问题。

---

## 九、视觉检查

结构安全后再看：
- hierarchy；
- typography；
- rhythm；
- whitespace；
- rule；
- alignment；
- reading measure；
- section density；
- 是否符合 dark / cool / editorial / archive-ledger / restrained。

探索页额外判断：
- 是否真的改变 component archetype / grouping logic / opening rhythm；
- 还是只换颜色。

---

## 十、Interaction

只检查本次修改涉及的状态：

- hover；
- focus-visible；
- active；
- copied / failed；
- sticky / scrolled；
- route active。

不要求无关交互全部重测。

### Navigation

Navigation 是普通 document navigation，不使用 cross-document View Transition。

- 点击当前 exact route 不刷新文档；
- 从同一 active section 的嵌套路由点击该 section root，立即导航，不等待 slider；
- 点击不同 section 时，单一同 DOM slider 先移动 200ms，再执行一次 document navigation；
- `prefers-reduced-motion: reduce` 时立即导航，不等待 slider；
- Ctrl、Meta、Shift、Alt 修饰点击，中键、右键、外部链接、`download` 和带 `target` 的链接保留浏览器原生行为；
- 快速重复点击只允许一次 document navigation，不能产生多个跳转。

涉及 Navigation 的改动，至少回放 exact route、同 section 嵌套路由、不同 section、reduced motion、一个修饰键或中键，以及 rapid click。按风险补充 desktop scrolled、mobile narrow 和 nested route smoke。

---

## 十一、浏览器 UI 与网页 UI 分离

Chrome / Chromium 自身 toolbar、unsupported flag 提示、扩展、DevTools、系统窗口边框不属于网页 DOM。

页面 QA 主要依据：
- DOM / geometry；
- Playwright page screenshot。

不要因为浏览器 chrome UI 污染而误判站点结构。

---

## 十二、QA 产物

默认保存到：

```text
D:\ai-output
```

例如：

```text
D:\ai-output\dsi-production-qa
```

不要把 screenshots、geometry dump、debug 文件留在仓库根目录。

---

## 十三、清理

QA 完成后：
- 关闭本轮临时 browser session；
- 停止本轮启动的 Astro server；
- 不结束用户原有无关进程；
- 不留下重复端口；
- 检查仓库未被 QA 产物污染。

---

## 十四、完成标准

### L1
- 必要静态检查通过；
- 直接受影响页面 / 状态正常；
- 无明显局部回归。

### L2
- 代表 viewport 正常；
- targeted sweep 完成；
- 相关 component invariant 正常；
- 无中间 viewport 回归。

### L3
- 目标页面族正常；
- 必要 responsive sweep 完成；
- 相关 named states 正常；
- component invariants 正常；
- 共享 Layout smoke test 正常；
- 代表性 screenshot 已复核。

以下情况不得声称完整 QA 通过：
- 只做 build；
- server ready 但未实际 browser_navigate；
- 应做 L2/L3 却只看一个固定截图；
- 页面无 overflow，但关键组件发生异常换行；
- 浏览器工具失败导致关键范围未验证。

---

## 十五、报告格式

保持简洁，不输出冗长测试流水账。

### QA 等级
`L1 / L2 / L3`

### 覆盖
- 页面
- viewport / sweep 区间
- named state（如有）

### 结构结果
- overflow / clipping / overlap
- component invariant
- intermediate viewport regression

### 视觉 / 交互
只写与任务相关的结论。

### 证据
注明：
- DOM / geometry
- screenshot
- interaction test

### 未验证项
如有必须明确列出。

推荐结论：

```text
L2 通过：目标组件在代表视口和高风险区间 sweep 中结构稳定，无中间宽度回归。
```

或：

```text
L2 未通过：在 940px 附近发现 Year Marker 换行，需修复后重测该区间。
```
