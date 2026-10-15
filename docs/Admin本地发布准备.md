# Admin 本地发布准备

本文记录早期资源准备面板，不是当前 Admin 工作区的日常操作指南。当前流程直接纳入 Obsidian 原文，旧文章通过明确绑定迁移，准备后查看差异并确认提交；使用步骤见 `desktop/README.md`。下述单文件命令仅保留为手动兜底，不再自动扫描“博客发布”目录。

## 本地执行边界

运行 `npm run dev`，打开启动输出中的本机地址 `/admin/`。Admin 的本地执行入口仅注册到 Astro 开发服务器；`build:astro` 仍生成静态站点，`preview` 与线上 Admin 只保留浏览器导入、检查和预览。

选择一篇 Obsidian Markdown，填写完整文件路径、附件引用根目录和稳定 `mediaId`。这三个值对应现有 `media:prepare` 参数；浏览器文件选择不会提供可信完整路径，因此本地准备需要明确填写路径。

视频检查和准备使用本机 FFmpeg。可填写完整工具路径，也可设置 `FFMPEG_BIN` / `FFPROBE_BIN` 或使用 PATH。工具版本是转换配方的一部分：更换版本可能使已有资源需要重新转换，请先看检查结果。

## 数据流

1. 检查所选文章：Node 读取原文，使用共享 frontmatter、链接规范化、Media 与 Gallery 逻辑；严格匹配完整附件路径。
2. 检查资源计划：源 SHA-256、转换配方与已有网页产物完整性决定复用或转换，不只比较文件大小或时间。
3. 准备网页资源：调用现有 `prepareWebMedia`，显示实际进度；暂存转换、确认源快照、检查预算，最后提交 manifest。
4. 正式 readiness：检查仓库文章的 metadata、`mediaId`、正文与源一致性、manifest 和资源完整性，并通过正式 Astro Markdown renderer。
5. Ready：所有阻止条件清除后的本地快照。warning 仍需审阅；这不是部署结果。

Obsidian 原文与附件不写入公开 URL。Admin 不覆盖现有正式文章、手动 metadata 或其他 working tree 修改；网页资源写入 `public/media`，映射写入 `src/data/media-manifest.json`。历史资源只报告，不自动删除。

## 正式文章尚未就绪

如果文章还未同步，或正文与 Obsidian 不一致，按 Admin 的下一步提示协调现有同步流程：

```powershell
npm run sync:blog -- --file "所选原文完整路径" --dry-run
```

审阅现有 working tree 后，再自行去掉 `--dry-run` 同步该篇文章。同步以源笔记明确提供的作者元信息为准，保留仓库中的 `mediaId` 等技术字段；博客日期使用 `completion_date`（`YYYY-MM-DD`），缺失时不自动填当天。插件生成的受管头部在导入时移除，由站点单独渲染。

不要把浏览器草稿字段误当作已经保存的正式 metadata。文件导入、字段编辑和原始附件预览仍只存在于当前页面内存。下一步提示中的动作不会被 Admin 自动执行。

资源或正式文章变动后，重新点击检查，随后运行：

```powershell
npm run lint
npx tsc --noEmit
npm run astro -- check
npm run build:astro
npm run media:verify
npm run media:verify-article
```

普通准备不需要运行带全量同步与链接写回的 `npm run build`。

## 失败与重新检查

进行中不显示 Ready；失败清除本次成功结论，显示具体 error。网络中断并不表示 Node 任务已取消：重新检查实际文件状态，不重复点击启动转换。媒体存储锁排除并发写入，不能自动抢占遗留锁。

源、附件或工具路径改变后，旧检查结果失效。Ready 只描述最近一次检查快照；外部修改需要重新检查。失败不会删除已有资源，也不会把未完成转换写入有效 manifest。

## 未进入的范围

本阶段没有 GitHub OAuth、GitHub App、Worker、Repository Contents API、commit、push、远端发布、生产后端或浏览器 FFmpeg WASM。
