# Dead Soul Insects — DESIGN.md

> 本文件记录 Dead Soul Insects 已确认的项目级设计语言、视觉意图和长期设计约束。
>
> 它不是 CSS token 的镜像，也不是固定主题模板。精确实现值、组件结构和文件位置应以当前仓库代码为准。
>
> 当设计方向发生实质变化时，应更新本文件，而不是让新的视觉语言只存在于聊天记录、Preview 或单个页面中。

## 1. Design Identity

Dead Soul Insects 是一个以内容、长期记录和个人思考为核心的个人博客。

它不是：

- SaaS 营销页；
- 通用程序员作品集模板；
- Dashboard；
- 为展示 UI 技巧而存在的设计 Demo；
- 依赖大量装饰建立身份的主题皮肤。

主要内容包括：

- 博客文章；
- 技术与项目记录；
- 文档；
- Origin / About 类内容；
- Archive、Topic、Project 等长期索引。

设计的首要任务是让读者能够：

1. 看清内容是什么；
2. 理解内容之间的层级和关系；
3. 快速浏览和定位；
4. 长时间阅读；
5. 感受到稳定而非模板化的作者气质。

## 2. Design Principles

DSI 的长期设计优先级：

```text
内容与阅读
→ 信息关系
→ 导航与可发现性
→ 作者气质
→ 视觉表现
→ 装饰
```

### Content before chrome

内容本身应承担主要视觉重量。

不要因为页面显得“空”就自动增加：

- Card；
- 图标；
- Badge；
- 阴影；
- Glow；
- 背景图形；
- 动画；
- CTA。

留白不是未完成状态。

### Typography is structural

排版不是装饰层，而是主要布局工具之一。

优先通过以下方式建立层级：

- 字号与字重；
- reading measure；
- 行高；
- 对齐；
- whitespace；
- rule / divider；
- metadata 的视觉等级。

### Layout expresses relationships

布局变化必须反映内容关系。

元素大小、跨栏、位置和视觉权重，应对应真实的信息主次，而不是为了制造有趣构图。

### Restraint over completeness

不是每个区域都需要被“设计成组件”。

当更简单的方案已经能够表达关系时，不继续添加视觉层。

### Consistency without uniformity

相同信息角色应保持稳定语言。

不同类型页面可以有不同密度和节奏，但不能每次重新发明一套设计系统。

## 3. Current Visual Language

当前正式设计方向：

```text
dark / cool / editorial / archive-ledger / restrained
```

其中：

**dark**：代表当前主要生产界面的暗色基底，不代表 Gothic、Cyberpunk、霓虹或“黑色科技感”。

**cool**：用于描述整体偏冷的颜色关系，不意味着默认蓝紫渐变或高饱和光效。

**editorial**：强调文章、标题、metadata、列表和阅读节奏，而不是营销模块。

**archive-ledger**：强调长期记录、索引、条目、年份、分类和内容之间的可追踪关系。

**restrained**：意味着高存在感视觉效果只在能够说明层级、状态或气氛时使用。

当前方向是设计事实，但不是永久不可改变的身份。如果未来整体视觉方向发生变化，应明确讨论并同步修改本文件。

## 4. Information Hierarchy

DSI 页面首先表达信息关系，再表达视觉效果。

默认需要区分：

```text
Primary content
Secondary context
Metadata
Navigation
Supporting actions
Decoration
```

其中正文、文章标题、主要索引入口通常高于标签、日期、说明和装饰。

避免：

- 每个 Section 拥有完全相同的视觉权重；
- 所有内容都包装成同等级模块；
- 用容器数量代替信息层级；
- 用颜色和特效弥补结构不清。

## 5. Typography & Reading

长文阅读是 DSI 的核心场景之一。

设计时必须同时考虑：

- 中文长文；
- 英文；
- 中英文混排；
- inline code；
- code block；
- 引用；
- 标题；
- metadata；
- 长链接和长单词。

正文应保持有限 reading measure。

具体宽度、字号和行高以当前实现 token 为准；调整时应优先验证真实中文长文的连续阅读体验，而不是只看短 Demo。

代码块、表格、宽图片等可以根据内容需要突破普通正文宽度，但不应造成页面级 horizontal overflow。

标题允许拥有明显视觉重量，但不能长期压缩正文可见区域或破坏移动端首屏阅读。

Metadata 应可识别但保持次级，不应与正文标题争夺注意力。

## 6. Layout & Spatial Rhythm

页面结构优先依靠：

- alignment；
- whitespace；
- rule；
- typography；
- reading measure；
- grid relationship。

而不是默认依靠：

- 大圆角容器；
- Card 网格；
- 多层 Surface；
- 大面积背景装饰。

间距应形成稳定关系，但不需要机械地让所有 Section 使用完全相同的 spacing。

内容型页面和索引型页面可以有不同节奏：

- 阅读页面优先连续性；
- Archive / Topic / Project 等索引页面优先扫描效率；
- Docs 可以拥有更强导航结构；
- Origin / About 可以根据内容叙事适度拥有不同编排。

## 7. Cards, Surfaces & Containers

Card 是一种语义容器，不是默认页面单位。

以下情况更适合使用 Card 或明确 Surface：

- 整体可点击；
- 有独立状态；
- 需要清楚分组；
- 重复且彼此独立；
- 与周围内容需要明确边界。

如果以下方式已经足够表达关系：

```text
whitespace
typography
rule
alignment
```

则不要额外增加 Card。

避免：

- Card 套 Card；
- 普通文章列表全面卡片化；
- 正文 Section 面板化；
- 仅为了“精致”添加半透明层、阴影和边框。

Translucent surface、blur 和 shadow 可以存在，但应承担明确层级功能。

例如具有独立空间层级的 floating / scrolled Header，可以比正文区域使用更强的 Surface 语言。

## 8. Color & Visual Effects

颜色首先承担：

- 阅读；
- 层级；
- 状态；
- 导航；
- 识别。

高存在感视觉效果必须有明确理由。

默认不把以下模式作为“现代感”的捷径：

- 强 Glow；
- 大面积 gradient mesh；
- 紫蓝霓虹；
- Glassmorphism 堆叠；
- 强阴影；
- 持续漂浮背景。

不要因为站名是 Dead Soul Insects 自动引申：

- Gothic；
- 昆虫纹理；
- Horror；
- Cyberpunk；
- 荧光绿色；
- 黑红视觉。

这些只有在实际内容和用户明确方向支持时才成立。

## 9. Component Language

### Header & Navigation

Header / Navigation 属于已经形成稳定语言的全站共享结构。

修改时优先保持：

- 信息优先级；
- 导航清晰度；
- 可读性；
- 不遮挡内容；
- 桌面与移动端的一致逻辑。

共享 Header 的结构性变化属于高影响设计修改，不作为局部页面美化的一部分顺带重做。

### Archive / Topic / Project / Docs Lists

索引型页面首先服务快速扫描。

优先使用：

- 清楚的标题层级；
- metadata；
- rule；
- alignment；
- 稳定的行结构。

不要默认将每个条目做成独立大 Card。

### Article

Article 页面首先服务连续阅读。

正文区域不应被过多 UI chrome、浮动控件或视觉容器切碎。

辅助信息和导航应保持可用，但视觉优先级低于文章本身。

### Code & Technical Content

代码必须拥有足够区分度和水平空间。

代码样式应该属于文章阅读系统的一部分，而不是模拟 IDE 或 Terminal 来制造技术感。

## 10. Interaction & Motion

交互反馈用于解释：

- 什么可以操作；
- 当前状态是什么；
- 操作后发生了什么。

Motion 更适合：

- 状态变化；
- 空间关系；
- 操作反馈；
- 注意力转移；
- 降低视觉突变。

默认避免：

- 全页统一 fade-in-up；
- 大量 stagger reveal；
- Card hover 上浮；
- 无理由按钮缩放；
- 持续背景漂浮；
- mouse-follow glow；
- 打字机标题。

Hover、focus-visible 和 active 状态应形成一致语言。

必须尊重 `prefers-reduced-motion`。

## 11. Responsive Principles

响应式设计不是桌面页面的压缩版。

需要保持的是：

- 信息优先级；
- 阅读顺序；
- 内容完整性；
- 可操作性。

移动端优先自然文档流。

不要依赖以下手段强制维持桌面构图：

- fixed height；
- 大量 absolute positioning；
- `overflow: hidden`；
- 内容裁切；
- 极端缩小文字。

特别注意中间 viewport。

桌面和手机都正常，不代表 700–1100px 范围一定正常。

短日期、年份、状态、导航文字等应优先保持完整。

## 12. Accessibility

Accessibility 是设计的一部分，不是最后补充的检查。

设计和实现应根据实际功能关注：

- semantic HTML；
- keyboard navigation；
- focus-visible；
- color contrast；
- touch target；
- accessible name；
- reduced motion；
- 长内容与异常内容；
- 真实存在的 empty / disabled / error state。

静态博客没有的状态不需要为了设计系统完整度人为创建。

## 13. Anti-patterns

以下模式是 DSI 的高风险信号，不是绝对禁令：

- SaaS 式 Hero + CTA；
- Badge → headline → subtitle → CTA → Cards；
- Everything is a card；
- 无内容意义的 Bento；
- Dashboard 化信息布局；
- 每个 Section 都配图标；
- 大量 pill；
- 每个元素都有 Hover / Reveal；
- Glow / Glass / Gradient 同时堆叠；
- 为了视觉丰富而制造无意义的不对称；
- 将技术内容包装成 IDE / Terminal 视觉噱头；
- 只为了漂亮截图优化 Happy Path。

如果确实使用这些模式，应能够说明：

1. 它解决了什么问题；
2. 为什么内容需要它；
3. 为什么更简单的方案不足；
4. 为什么与 DSI 当前视觉语言兼容。

## 14. External References

外部设计资料用于研究，不是模板来源。

可以研究：

- Editorial / magazine；
- documentation；
- knowledge base；
- archive；
- developer content；
- personal publishing；
- typography systems。

`awesome-design-md` 等 DESIGN.md 集合可以帮助分析：

- Typography；
- Color roles；
- spacing；
- component states；
- responsive behavior；
- layout principles。

但不得因为某个参考站完整、知名或“高级”，直接复制：

- 品牌视觉；
- proprietary font；
- 页面骨架；
- CTA 结构；
- logo；
- illustration；
- 完整组件系统。

参考应被转译为 DSI 自己的设计理由。

## 15. Labs & Historical Experiments

Lab、Preview 和 playground 是设计研究工具，不是生产设计来源。

Field Notebook 已完成其参考实验角色。

它留下的有效经验可以继续影响 DSI，例如：

- typography-first；
- editorial hierarchy；
- reading measure；
- rule；
- metadata；
- 响应式内容重排；
- accessibility；
- 真实内容压力测试。

但 Field Notebook 本身不是 DSI 的全站设计系统。

除非用户明确要求，不应：

- 将其样式整体复制到生产页面；
- 将其组件作为生产组件默认来源；
- 因其存在而把全站设计改成 Field Notebook。

## 16. Implementation Consistency

设计修改前应先检查当前代码中的：

- design tokens；
- typography；
- colors；
- spacing；
- radius；
- border；
- shadow；
- surface；
- breakpoint；
- motion；
- shared components。

可以复用已有 token 时优先复用。

发现设计系统存在重复或分叉，可以指出，但局部任务不得自动扩大为全站重构。

`DESIGN.md` 不保存容易过时的实现镜像。

精确实现事实以仓库当前代码为准。

## 17. Implementation Mapping

本节只记录稳定、高价值的职责入口，不维护第二套仓库目录索引。

```text
Project engineering policy
→ AGENTS.md

Browser visual QA procedure
→ .opencode/skills/dsi-browser-visual-qa/SKILL.md
```

精确组件、design token、breakpoint、选择器、动画时长和实现路径应从当前代码与实际运行结果中确认，不在这里复制维护。

## 18. Design Decision Log

只记录会影响后续设计判断的重要决定。

不要记录普通 CSS 微调。

### 2026-09

- 将项目设计意图从 `AGENTS.md` 中独立为 `DESIGN.md`。
- `AGENTS.md` 负责工程规则；`DESIGN.md` 负责视觉语言。
- 当前方向为 `dark / cool / editorial / archive-ledger / restrained`。
- 减少 Card / Glass 作为默认页面单位，优先通过 typography、whitespace、rule 和 alignment 建立层级。
- Field Notebook 作为已经完成使命的设计实验保留参考价值，但不作为生产设计系统。
- 外部 DESIGN.md 集合只作为设计研究资料，不作为直接模板。
