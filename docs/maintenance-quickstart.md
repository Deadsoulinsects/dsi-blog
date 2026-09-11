# 维护者快速上手

这份文档只回答一件事：第一次接手这个仓库，怎样用最短、最安全的路径确认它能正常工作。

如果你想看完整操作流、内容准备关系和发布边界，请去 `docs/operations-workflow.md`。这里不展开深层流程。

## 环境假设

- 你在仓库根目录运行命令
- 你使用 npm
- Node.js 版本应满足 `>=22.12.0`
- 这是一个 **Astro + Markdown + Obsidian 同步** 的静态博客仓库

## 最短安全启动路径

按这个顺序走，默认最稳：

```bash
npm install
npm run dev
npm run links:check
npm run build:astro
```

这条路径的目标很简单：

1. `npm install`，安装依赖
2. `npm run dev`，确认本地开发服务器能启动
3. `npm run links:check`，先检查 Markdown 链接
4. `npm run build:astro`，做默认的构建验证

补充两个很容易误判的小点：

- `npm run dev` 是**常驻开发服务器**，正常情况下不会自己退出；看到它一直挂着，不等于卡死。
- 如果 `4321` 端口已被之前残留的开发服务器占用，Astro 可能自动切到 `4322` 或其他端口。判断是否启动成功时，应以终端里实际显示的 `Local` 地址为准，不要只凭默认端口猜测。

## 为什么默认不是 `npm run build`

`npm run build` **不是日常第一检查命令**。

虽然它表面上看起来也是 build，但这个仓库里它会先经过 `prebuild`。那一步会触发内容同步、内容准备和链接写回流程，可能改动仓库里的 Markdown 文件。

所以，**第一次验证、日常快速检查、只是想确认站点能不能构建时，默认用 `npm run build:astro`，不要先用 `npm run build`**。

## 前 10 分钟清单

你可以把前 10 分钟理解成一个短清单：

- 看一眼 `README.md`，确认仓库用途和高风险区域
- 运行 `npm install`
- 运行 `npm run dev`，确认开发服务器能启动
- 运行 `npm run links:check`
- 运行 `npm run build:astro`
- 如果前面都正常，再决定是否需要 `npm run preview`

如果你只是想人工确认已经构建好的结果，而不想让终端长期挂着开发服务器，可以优先把 `npm run preview` 当成补充查看手段。

`npm run preview` 用来预览已经构建出来的站点结果，不是最先必须做的动作，但当前面检查通过后，它是一个安全的补充确认手段。

```bash
npm run preview
```

## 页面与浏览器 QA

改动页面、布局或样式时，先执行 `npm run build:astro`，再按 [`dsi-browser-visual-qa`](../.opencode/skills/dsi-browser-visual-qa/SKILL.md) Skill 选择最低足够的 L1、L2 或 L3 验收。Skill 会规定实际 QA 步骤；不要在这里自行补设不存在的辅助命令。

启动 `dev` 或 `preview` 后，以终端输出的实际 Local URL 为准。它们都是常驻进程，完成本轮查看或 QA 后关闭自己启动的进程。

## 命令风险分级

### 默认安全命令

```bash
npm install
npm run dev
npm run links:check
npm run build:astro
```

这些命令适合作为日常进入仓库时的默认入口。

### 需要更谨慎的命令

```bash
npm run build
npm run publish
```

- `npm run build`：**不是默认第一验证路径**。它可能因为前置流程而改写内容文件。
- `npm run publish`：**高风险命令**。它可能触发构建、提交、推送，应该只在你明确知道自己要发布时才运行。
- 任何带有 `sync`、`prepare`、`apply` 含义的内容处理命令，也应先假设它们**可能写入文件**，不要把它们当成普通只读检查命令。

## 什么时候才考虑 `publish`

只有在下面几件事都已经明确后，再考虑运行 `npm run publish`：

- 你已经完成内容或代码修改
- 你知道本次变更是否允许写回文件
- 你已经做过基础检查，至少包含 `npm run links:check` 和 `npm run build:astro`
- 你清楚这个命令可能进入发布动作，而不只是本地验证

```bash
npm run publish
```

如果你现在的目标只是“看一下仓库能不能跑起来”，那就停在 `build:astro` 或 `preview`，不要直接碰 `publish`。

## 一句话版本

第一次进仓库，先跑：`npm install` → `npm run dev` → `npm run links:check` → `npm run build:astro`。涉及页面时，再按 `dsi-browser-visual-qa` Skill 验收。

记住两件事：`npm run build` 不是默认首选检查命令，`npm run publish` 是高风险命令。
