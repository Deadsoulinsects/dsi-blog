# 固定字体资源接口

本目录提供 A1 固定资源接口。正式共享 Layout 已按 A1 角色接入；Lab 对照接口继续保留。

## 资源

`manifest.json` 固定字体包版本、上游版本、包完整性、来源提交、每个 WOFF2 的 SHA-256、真实字重/轴、实际二进制家族名、字形覆盖和许可证摘要。

- Newsreader：Brand 400，混排 Display 500/600/700；当前固定文件的真实变量轴为 wght。
- Noto Sans SC：Body 400、H3/Projects 600、UI/强调所需的真实变量字重。
- Noto Serif SC：Display 的真实变量字重。
- IBM Plex Mono：400/500/700，正常与斜体均有真实文件。
- Bricolage Grotesque：仅保留 B 实验所需对照，保持 opsz/wdth/wght。

主要资源来自固定 Fontsource 5.3.0 预分片。中文补充分片来自固定提交的 Google Fonts 完整 SC 母版；常见补充平面汉字来自同源 Noto CJK SC 母版。其二进制名称、版本与主包可能不同，逐文件记录，不伪称同一版本；CSS 映射到原字体角色，不重新选型。

源文件存为 `src/assets/fonts/**/*.woff2.b64`，构建仅解码，绝不重新下载或动态按文章生成子集。校验针对解码后的原始 WOFF2 字节。Base64 源体积约为二进制的 4/3，这是存储取舍，不是浏览器传输格式。

许可证按 UTF-8/LF 的规范文本校验；兼容 Git 在 Windows 检出时转换为 CRLF，不把换行转换误报为许可内容损坏。

## 接口

从 `resources.mjs` 获取：

- `fontStylesheetHref('a1', base)`：四个拟生产家族、实际名称，带清单摘要的 CSS URL。
- `fontStylesheetHref('lab', base)`：五个 Lab 家族、现有 DSI 别名，保留 A/B/C/A1。
- `/fonts/<字体名称和摘要>.woff2`：内容版本化的静态字体。
- `/fonts/<family>-OFL.txt`：主包及补充来源的完整许可。

正式共享 Layout 引用 `a1` CSS，使用真实字体家族名；不引用实验包装、控制条或路由重写。没有全量预加载；浏览器按 `unicode-range` 和实际字重/style 请求。Brand、Display、UI、Meta 分别由共享变量表达，文章阅读区使用独立的 40rem token，不修改全局容器宽度。

本地读取只发生在 Astro 构建/开发时，命令从仓库根目录运行。静态部署不需要 Node、Python或源文件；实际缓存响应头由托管环境决定，文件指纹负责版本失效。

## 覆盖门禁与检查

`verifyPublishedFontCoverage()` 在字体 CSS 静态路径生成时执行，检查 Blog、Docs、独立 Markdown、公开页面/布局/组件与 data。扫描源文字是保守超集，包含模板/frontmatter 固定文字；不是完整 DOM 字体角色审计，也不扫描 Admin 私有界面。

覆盖来自真实 cmap 与 CSS unicode-range 的交集，不凭 CSS 声明猜测。正文和 Display 都核查。未来不支持的字符会列出路径及 U+ 编号并阻止构建，不联网“补救”、不默默系统回退。例如所选母版没有 U+20000；“𠮷、𠀋”等常见扩展字则由补充资源提供。

平台回退是明确例外：颜色表情、排版控制/variation selector，以及既有 aria-hidden 目录装饰符号“⌄”。普通正文缺字不属于该例外。完整 IVS 变体或任意其他语言不是当前覆盖承诺。

```text
node scripts/verify-font-resources.mjs
node --test scripts/font-cmap.test.mjs scripts/font-resources.test.mjs
npm run lint
npm exec astro check
```

`scripts/font-offline-guard.cjs` 是验收用网络禁止钩子，不进入正常构建/发布流程。用 `NODE_OPTIONS=--require=...` 执行两次 `npm run build:astro`，比较 `dist/fonts` 字节摘要；不要运行会写回内容的完整 build。

## 更新资源

更新需固定新的包版本/提交并核对下载完整性，生成真实 cmap 清单及字重元数据，保留所有来源许可，重新执行覆盖、真实浏览器与离线重复构建。

补充分片的加工工具仅在隔离准备环境中使用 FontTools 4.60.1 / Brotli 1.2.0；正常构建不依赖它们。一次性脚本、输入及源字体存于本轮交付路径：

- `D:\script\字体资源工程化\prepare-font-supplement.py`
- `D:\ai-output\字体资源工程化\`

加工保持源时间戳、排序、许可与名字（不使用保留字体名），每片最多512个新增码点。完整源/处理工具不会进入静态输出。资源更新不代表授权改变生产字体角色、同步脚本或发布流程。
