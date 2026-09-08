# 操作流程手册

这份文档是本仓库当前的详细操作手册，面向维护者与 AI 协作者。它回答的不是“仓库是什么”，而是“日常准备内容、做检查、确认构建、预览结果，以及接近发布时该怎么安全操作”。

这里的单一事实来源以当前仓库文件为准，尤其是 `package.json` 里的 scripts。不要凭习惯假设这是一个“普通静态站点 build 流程”，因为这个仓库的 `build` 前面挂了内容同步和内容预处理步骤。

## 先记住的总原则

1. 日常检查默认走安全路径，先用 dry-run 和只检查不写入的命令。
2. `npm run content:prepare` 会写入文件，`npm run build` 也可能写入文件，不适合当成“随手试一下”的纯检查命令。
3. 如果 `links:check`、`content:prepare:dry`、`build:astro` 或其他检查步骤失败，先停下来排查原因，不要带着报错继续执行 `publish`。
4. `npm run publish` 不是日常验证命令。它属于接近发布时才考虑的高风险操作。

## 命令矩阵

下表是日常维护最常碰到的命令。`是否写文件` 不只是看终端输出，还包括是否会改动仓库内容、生成构建产物，或触发会落盘的预处理。

| 命令 | 用途 | 是否写文件 | 默认使用时机 | 风险级别 |
| --- | --- | --- | --- | --- |
| `npm run sync:blog:dry` | 预览博客同步结果，确认 Obsidian 博客内容会怎么进入仓库 | 否 | 想先看博客同步会发生什么时 | 低 |
| `npm run sync:origin:dry` | 预览起源页同步结果，确认起源内容同步效果 | 否 | 想先看起源内容同步会发生什么时 | 低 |
| `npm run content:prepare:dry` | 预览完整内容准备流程，内部会跑 `prepare:content:dry`、`prepare:origin:dry`、`links:check` | 否 | 想先做完整内容检查，但不希望落盘时 | 低 |
| `npm run links:check` | 检查 Markdown 链接是否需要修正，仅读取并报告问题 | 否 | 改了内容、移动了文件、怀疑链接失效时 | 低 |
| `npm run content:prepare` | 执行完整内容准备流程，内部会跑 `prepare:content`、`prepare:origin`、`links:apply` | 是，会改动内容文件 | 确认需要正式写入 frontmatter、起源页准备结果和链接修正时 | 中 |
| `npm run build:astro` | 只执行 Astro 构建检查，验证站点能否构建 | 是，会生成构建产物到 `dist/`，但不会触发仓库内容预处理写回 | 做“纯构建验证”时的默认命令 | 中 |
| `npm run build` | 完整构建入口。执行 `astro build` 前会先跑 `prebuild`，而 `prebuild` 会执行同步、预处理和 `links:apply` | 是，既会生成 `dist/`，也可能改动仓库里的 Markdown 与相关内容文件 | 只有在你明确需要完整内容链路加完整构建一起验证时 | 高 |
| `npm run preview` | 预览已经构建好的站点结果 | 否，命令本身不负责改内容，前提是已有可预览的构建结果 | 完成构建后，想人工浏览页面时 | 低 |
| `npm run publish` | 调用发布脚本，可能触发构建、提交、推送等发布动作 | 是，高风险外部写入 | 只在检查全部通过、并且你明确准备发布时 | 高 |

## 仓库里的真实流程关系

只看命令名很容易误判，下面把仓库里实际存在的组合关系写清楚。

### 1. dry-run 内容路径

`npm run content:prepare:dry`

内部实际执行的是：

1. `npm run prepare:content:dry`
2. `npm run prepare:origin:dry`
3. `npm run links:check`

这条路径适合在“准备发内容，但还不想写入仓库文件”时先跑一遍。它的价值是先暴露问题，再决定是否真的落盘。

### 2. 正式内容准备路径

`npm run content:prepare`

内部实际执行的是：

1. `npm run prepare:content`
2. `npm run prepare:origin`
3. `npm run links:apply`

这条路径会真的写文件。简单理解：它不是“看看结果”，而是“把结果写进仓库”。如果你只是想知道会不会改东西，先不要直接跑它，先跑 dry 版本。

### 3. 纯构建验证路径

`npm run build:astro`

这个命令只做 Astro 构建本身，适合回答一个比较纯的问题：**站点在当前文件状态下能不能成功构建。**

它不会像 `npm run build` 那样先跑同步和内容准备，所以日常验证默认优先它。

### 4. 完整构建路径

`npm run build`

虽然 `package.json` 里 `build` 的命令文本是 `astro build`，但要注意 npm 的 `prebuild` 会先自动执行。当前仓库的 `prebuild` 是：

1. `npm run sync:blog`
2. `npm run sync:origin`
3. `npm run prepare:content`
4. `npm run prepare:origin`
5. `npm run links:apply`

然后才进入 `astro build`。

所以 `npm run build` 不能被理解成普通的“只编译一下”。它实际是“先同步和写内容，再构建”。这也是为什么它属于高风险命令。

## 推荐的详细操作顺序

下面这套顺序适合日常维护、发文前自检、或者 AI 协作时做安全验证。

## 本地浏览器 QA 的稳定工作流

最近如果反复遇到端口冲突、旧进程残留、浏览器打不开本地预览页，优先把问题理解成**本地预览工作流不稳定**，而不是立刻怀疑页面代码本身出错。

这里建议把本地工作明确分流成两种模式：

### 模式 A：编辑模式

命令：

```bash
npm run dev
```

用途：改页面、改样式、改文案时看热更新。

注意：

- `dev` 是长驻进程，会持续占用端口，这本来就是正常行为。
- 如果你已经开着一个 `dev`，不要再重复开第二个；很多“端口问题”本质上只是旧的 `dev` 没关。
- `dev` 可以自动换端口，因此它不适合当最终浏览器验收基准。

### 模式 B：QA 模式

命令：

```bash
npm run build:astro
npm run preview
```

用途：做截图、视觉检查、结构验收，或者确认构建后的真实输出。

注意：

- `preview` 更接近最终构建结果，默认应作为浏览器 QA 的主要入口。
- 最稳的做法是：开始 QA 前先确认旧的 `dev / preview` 终端已经关闭；然后开一次 `preview`，做完这轮检查后再关掉。
- 如果浏览器打不开 `preview` 地址，先确认预览服务是否真的已经启动成功，而不是直接假设页面报错。

### 不推荐作为默认方案的做法

不建议把外部临时静态服务（例如 `python -m http.server`）当作日常默认 QA 入口。它可以临时救急，但在这个仓库里更容易带来：

- 额外端口混用
- 后台进程残留
- 看起来“服务启动了”，其实并没有真正监听端口

既然 Astro 已经提供 `preview`，优先统一到仓库自身的链路里更稳。

### 第 1 步，先决定你现在要的是“预览变化”还是“正式写入”

如果你还在整理内容，或者只是想知道同步和预处理会发生什么，先走 dry-run：

```bash
npm run sync:blog:dry
npm run sync:origin:dry
npm run content:prepare:dry
```

什么时候用：

- 新写完内容，想先看同步范围
- 不确定 frontmatter 或链接会不会被改
- 当前环境不是日常主环境，担心误写文件

看到什么算正常：

- 终端给出预览结果、检查信息或差异提示
- 没有把修正直接写回仓库内容

这一步失败怎么办：

- 先停下来
- 看报错是源文件缺失、frontmatter 问题、链接问题，还是本地同步路径问题
- 没定位原因前，不要继续跑 `content:prepare` 或 `build`

### 第 2 步，做内容准备前先确认你接受写入

当 dry-run 结果合理，并且你就是要把内容规范化、应用链接修正、生成正式可构建内容时，再执行：

```bash
npm run content:prepare
```

这个命令会写文件，重点包括：

- 内容预处理结果写回内容文件
- 起源页准备结果写回相关文件
- `links:apply` 把 Markdown 链接修正真正落盘

什么时候用：

- 你已经确认 dry-run 没有异常
- 你准备把本次内容修改正式纳入仓库状态

不适合什么时候用：

- 只是想做安全检查
- 只是想知道会不会有改动
- 当前工作区里还有不想被自动修正碰到的内容

### 第 3 步，先做链接检查，再做纯构建验证

即使前面已经跑过 `content:prepare:dry`，单独保留这两个步骤仍然有意义，因为它们分别回答两个不同问题。

```bash
npm run links:check
npm run build:astro
```

各自回答的问题：

- `npm run links:check`：当前 Markdown 链接是否仍然一致、是否存在需要修正的链接
- `npm run build:astro`：站点本身是否能完成 Astro 构建

为什么默认不直接用 `npm run build`：

- `build` 会触发 `prebuild`
- `prebuild` 会再次同步和写内容
- 你可能本来只想查构建问题，却顺手改了仓库文件

### 第 4 步，构建通过后再预览站点结果

当 `npm run build:astro` 成功后，再执行：

```bash
npm run preview
```

这一步的目的不是再做写入，而是人工确认构建结果是否符合预期，比如：

- 页面能否正常打开
- 文章、文档、起源页是否能访问
- 链接跳转是否正常
- 构建后的视觉和内容顺序是否明显异常

如果预览时发现问题，但前面的检查没报错，也要停下来排查。能构建成功，不等于内容一定正确。

## 什么时候才考虑 `npm run build`

`npm run build` 只应该在你明确知道自己需要完整链路验证时再用。

例如：

- 你要确认 `prebuild` 里的同步、预处理、链接应用和构建串起来是否都能跑通
- 你准备做接近发布前的完整演练

执行前要先知道两件事：

1. 它可能改仓库内容文件，不只是生成 `dist/`
2. 如果你的环境缺少同步依赖的本地源目录，失败原因可能是环境问题，不一定是源码本身坏了

## 发布前的停手规则

这是这份手册里最重要的约束之一。

只要以下任何一步失败，都应该先停下来排查，不要继续执行 `npm run publish`：

- `npm run sync:blog:dry`
- `npm run sync:origin:dry`
- `npm run content:prepare:dry`
- `npm run links:check`
- `npm run content:prepare`
- `npm run build:astro`
- `npm run build`
- `npm run preview` 期间发现明显异常

这里的“停下来排查”意思是：

1. 先看终端报错具体指向哪一步
2. 判断是内容问题、链接问题、环境路径问题，还是构建问题
3. 修复后，从最接近出错位置的安全步骤重新验证
4. 在没有重新通过检查前，不要发布

不要把 `publish` 当成“试试看能不能顺便过”的命令。它的职责是发布，不是诊断。

## 一条适合日常维护的默认路线

如果你只是做日常内容维护，默认建议按下面顺序走：

```bash
npm run sync:blog:dry
npm run sync:origin:dry
npm run content:prepare:dry
npm run links:check
npm run build:astro
npm run preview
```

只有在你确认需要正式写入时，再插入：

```bash
npm run content:prepare
```

只有在你明确需要完整链路验证时，再考虑：

```bash
npm run build
```

`npm run publish` 不属于这条普通日常路线。

## 最小辅助命令设计方案（先设计，不实现）

如果以后端口与预览问题仍然反复出现，可以考虑加两个非常小的辅助命令，但当前先只记录设计，不直接实现。

### `npm run qa:preview`

目标：把 QA 模式标准化。

理想流程：

1. 执行 `npm run build:astro`
2. 启动 `npm run preview`
3. 明确输出当前可访问的预览地址

它只负责稳定开启“用于 QA 的构建预览”，不负责自动截图，不负责浏览器脚本。

### `npm run port:check`

目标：快速判断本地端口冲突到底是不是旧进程残留。

理想流程：

1. 检查常用本地端口（例如 `4321`、`4322`、`4173`）
2. 输出监听状态和占用进程信息
3. 默认只报告，不直接结束进程

这样能把“页面坏了”和“服务没起来 / 旧服务没关”这两类问题区分开。

## 补充说明，关于内部脚本名和维护层命令名

你会在 `package.json` 里同时看到两类名字：

- 维护层常用入口，比如 `content:prepare`、`content:prepare:dry`、`build:astro`
- 底层内部步骤，比如 `prepare:content`、`prepare:origin`、`links:apply`

日常维护时，优先记维护层入口命令，因为它们更符合实际操作顺序。需要排查为什么某个聚合命令失败时，再回头看底层脚本链路。

如果以后 `package.json` 里的 scripts 改了，这份文档也要一起更新，避免文档和真实命令脱节。
