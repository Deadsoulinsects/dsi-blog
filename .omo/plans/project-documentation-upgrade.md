# 项目说明文档升级计划

## TL;DR
> **摘要**：把目前分散的项目说明整理成分层文档系统：`README.md` 作为简洁的全局入口，仓库根目录 `docs/` 存放面向维护者 / AI 的深度说明，`升级优化规划.md` 改造成按阶段与主题组织的可执行路线图，并明确说明 Astro 静态站只是当前起步架构，未来会沿内容、功能、架构三条线持续专业化升级。
> **交付物**：
> - 精简版 `README.md`，提供导航、关键命令和风险提醒
> - 面向维护者 / AI 的详细文档，覆盖结构、上手和操作流程
> - 改造后的路线图文档，包含短 / 中 / 长期阶段、主题分组，以及未来专业化升级方向
> - 访客文档与内部维护文档之间的清晰边界
> **工作量**：中等
> **可并行**：YES - 2 个波次
> **关键路径**：1 → (2,3,4,5) → (6,7) → 8

## 背景
### 原始需求
评估当前项目说明是否不够全面，并规划补充以下内容：1）项目结构说明，2）操作步骤，3）后续升级规划，包括转型升级和结构升级。

### 沟通结论
- 当前并不是完全没有文档，而是信息分散，缺少单一清晰入口。
- 目标结构：`README.md` 负责总览，详细说明拆到单独文档。
- 主要读者：需要快速理解全局项目的 AI，以及需要查看具体工作流的人类维护者。
- 路线图结构：采用“短 / 中 / 长期 + 主题分组”的混合形式。
- Astro 静态站是当前起步方案，不是最终目标；未来会向更专业的个人站架构升级。
- “专业化”范围同时包括：内容与结构、交互与功能、架构层演进。

### Metis 审查结果（已吸收）
- 已定义单一事实来源（single source of truth）边界，避免 README / 详细文档 / 路线图 / 访客文档之间重复。
- 默认把维护者深度文档放到仓库根目录 `docs/`，而不是 `src/content/docs/`，避免和站内公开文档混在一起。
- 默认把路线图写成“当前认可、可执行”的版本，而不是开放式愿望清单。
- 默认语言策略为中文优先，仅在需要提高精确度时补充英文术语。

## 工作目标
### 核心目标
产出一份决策完整（decision-complete）的文档重组方案，让仓库对 AI 和人类维护者都有一个清晰统一的入口，同时保留现有 Astro + Markdown + Obsidian 工作流，并继续把公开访客文档与内部维护文档分开；此外，还要在路线图中明确记录：当前 Astro 静态站只是阶段性起点，未来会沿内容、功能、架构三条线走向更专业的形态。

### 交付物
- 更新后的 `README.md`：简洁总览、文档地图、命令索引、风险提醒
- 新的根目录 `docs/` 文档集：项目结构、维护者快速上手、操作流程
- 重组后的 `升级优化规划.md`：按阶段 + 主题组织，并包含未来专业化升级路径
- 如有必要，对公开访客文档做最小边界说明，避免职责重叠
- 验证证据，证明文档结构、链接和构建状态正常

### 完成定义（可验证）
- `README.md` 包含指向每份维护文档和 `升级优化规划.md` 的链接
- 根目录 `docs/` 存在，且包含计划中的文件和要求的标题结构
- `README.md` 不再重复深度文档已经承担的完整流程正文
- `升级优化规划.md` 明确包含短 / 中 / 长期阶段和主题分组
- `升级优化规划.md` 明确写出当前 Astro 阶段定位，以及未来内容 / 功能 / 架构三条专业化升级线
- 访客文档和维护者文档保持职责分离
- 验证命令和内容断言通过，并保留证据

### 必须有
- 保持 Astro 静态站架构不变
- 保留 `package.json` 和当前 README 中已经确认的真实操作事实
- 明确说明 `build` 与 `build:astro` 的区别
- 明确说明 Obsidian 同步、dry-run 用法和 publish 风险
- 分开“站点访客文档”和“仓库维护 / AI 文档”
- 明确说明“当前 Astro 是起步阶段，不是长期终局架构”
- 在路线图中明确未来专业化升级的三个维度：内容、功能、架构
- 以中文为主，必要时补英文术语提升精度

### 绝不能有（边界 / 护栏 / 防 AI 跑偏）
- 不做架构升级、依赖改动、部署改动、工作流重写
- 不把公开站点文档改造成内部维护手册
- 不允许同一详细流程在多个文件里重复作为主说明存在
- 不得弱化 `npm run publish` 或 `npm run build` 的风险表述
- 不得产生没有阶段归属和主题归属的空泛路线图愿望项
- 不得擅自预设未来一定迁移到某个具体框架（如 Next.js / Nuxt / 自建后端），除非路线图中明确把它写成候选方向而非已定结论

## 验证策略
> ZERO HUMAN INTERVENTION - 所有验证都必须可由代理自动执行。
- 测试决策：不做单元 / 集成测试；本次主要使用 markdown 断言 + 命令验证
- QA 政策：每个任务都要带可执行的内容检查或命令检查
- 证据目录：`.sisyphus/evidence/task-{N}-{slug}.{ext}`

## 执行策略
### 并行波次
> 目标：每波 5-8 个任务。除最终波外，低于 3 个任务属于拆分不足。
> 先抽出共享依赖，作为 Wave 1 基础任务，提高并行度。

Wave 1：先做任务 1 打基础；然后任务 2-5 并行完成文档重写 / 新建

Wave 2：任务 6-8 负责边界修正、交叉链接和完整验证

### 依赖矩阵（全量）
- 1 阻塞 2、3、4、5、6
- 2 阻塞 8
- 3 阻塞 8
- 4 阻塞 8
- 5 阻塞 8
- 6 阻塞 8
- 7 依赖 2、3、4、5
- 8 依赖 2、3、4、5、6、7

### Agent 分派摘要（波次 → 任务数 → 分类）
- Wave 1 → 5 个任务 → `writing` / `deep` / `quick`
- Wave 2 → 3 个任务 → `writing` / `quick` / `unspecified-high`

## TODOs
> 实现 + 测试 = 一个任务，不能拆开。
> 每个任务都必须包含：Agent Profile + Parallelization + QA Scenarios。

- [x] 1. 建立文档信息架构

  **What to do**：先定义目标文档地图，再重写正文内容。新增根目录 `docs/README.md`，用于定义整套文档、目标读者，以及每个文件的单一事实来源职责。将目标文件集固定为：`README.md`、`docs/README.md`、`docs/project-structure.md`、`docs/maintenance-quickstart.md`、`docs/operations-workflow.md`、`升级优化规划.md`。在 `docs/README.md` 中加入一张表，字段为：file、audience、purpose、must contain、must not contain。
  **Must NOT do**：不要把详细操作步骤重新塞回根目录 `README.md`；不要把维护说明迁移到 `src/content/docs/`；不要新增未经批准的猜测性文档。

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: 这是信息架构与文档职责边界任务。
  - Skills: `[]` - 不需要额外技能，只需要精确写作和基于仓库事实的整理能力。
  - Omitted: `["domain-modeling"]` - 因为术语基础已经在 `CONTEXT.md` 中存在。

  **Parallelization**：Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 6 | Blocked By: none

  **References**（执行者没有访谈上下文，必须写全）:
  - Pattern: `README.md:15-26` - 当前轻量结构说明，应保留为摘要，而不是继续在 README 扩写。
  - Pattern: `README.md:40-55` - 当前命令列表证明 README 已经在承担顶层入口作用。
  - Pattern: `README.md:242-250` - 当前 README 已指向路线图文档，但还没有完整文档地图。
  - API/Type: `package.json:8-27` - 命令清单的权威来源；所有文档职责决定都必须与真实脚本一致。
  - Pattern: `src/content/docs/intro.md:8-19` - 这是访客向说明，应继续保持公开、轻量。
  - External: none

  **Acceptance Criteria**（仅限可自动执行）:
  - [ ] `docs/README.md` 存在，并包含 audience、file map、source-of-truth boundary 等标题或等价结构。
  - [ ] `grep` 能在 `docs/README.md` 中找到所有计划文件名。
  - [ ] `read` 可确认 `docs/README.md` 明确写出：维护者 / AI 文档位于根目录 `docs/`，而不是 `src/content/docs/`。

  **QA Scenarios**（强制，缺失则任务不完整）:
  ```
  Scenario: 文档地图创建正确
    Tool: grep
    Steps: 搜索 `docs/README.md` 中的 `README.md`、`docs/project-structure.md`、`docs/maintenance-quickstart.md`、`docs/operations-workflow.md` 和 `升级优化规划.md`。
    Expected: 所有文件名都在文件地图区域中出现，且归属正确。
    Evidence: .sisyphus/evidence/task-1-doc-ia.txt

  Scenario: 公共 / 内部边界混淆
    Tool: read
    Steps: 读取 `docs/README.md`，检查职责表中是否把 `src/content/docs/intro.md` 当成维护手册。
    Expected: 不存在这种说法；访客文档与维护 / AI 文档边界明确。
    Evidence: .sisyphus/evidence/task-1-doc-ia-error.txt
  ```

  **Commit**: NO | Message: `docs(ia): define documentation boundaries` | Files: `docs/README.md`

- [x] 2. 把根 README 重写为简洁项目入口

  **What to do**：把 `README.md` 重构为面向 AI 和人类的精简总览文档。保留：项目用途、技术栈、最小仓库结构图、命令摘要、风险提醒，以及通往各深度文档的明确链接。删除那些会迁移到深度文档中的长篇流程正文。关键的 build / publish 风险提醒必须仍然保留在 README 中，但冗长检查清单应改为摘要 + 链接，指向 `docs/maintenance-quickstart.md` 和 `docs/operations-workflow.md`。
  同时新增一个非常短的“当前阶段 / 未来方向”说明：明确当前站点基于 Astro 静态架构起步，未来专业化升级方向详见 `升级优化规划.md`，但 README 本身不展开写具体升级方案。
  **Must NOT do**：不要删除核心安全提醒；不要让 README 失去到新文档的链接；不要在深度文档建立后，继续保留完整重复流程正文。

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: 需要高压缩率但高精确度的文档重写。
  - Skills: `[]` - 普通文档改写即可。
  - Omitted: `["beginner-explain"]` - 读者包括 AI 和维护者，风格应保持精准而非过度教程化。

  **Parallelization**：Can Parallel: YES | Wave 1 | Blocks: 8 | Blocked By: 1

  **References**:
  - Pattern: `README.md:1-14` - 保留项目身份和技术栈描述。
  - Pattern: `README.md:57-75` - `build` 与 `build:astro` 的区别必须继续显眼。
  - Pattern: `README.md:77-106` - 保留 Obsidian 同步的真实规则，但把细节迁到深度文档。
  - Pattern: `README.md:107-148` - 当前发文检查流程，是快速上手 / 操作文档的来源。
  - Pattern: `README.md:232-250` - 当前维护顺序和路线图指针，应被压缩成导航信息。
  - API/Type: `package.json:8-27` - 使用真实脚本名，不得杜撰命令。
  - External: none

  **Acceptance Criteria**:
  - [ ] `README.md` 包含指向 `docs/README.md`、`docs/project-structure.md`、`docs/maintenance-quickstart.md`、`docs/operations-workflow.md` 和 `升级优化规划.md` 的链接。
  - [ ] `grep` 可确认 `README.md` 仍明确提到 `build:astro`、`build` 和 `publish` 风险。
  - [ ] `read` 可确认 README 不再保留完整 9 步发文检查正文。
  - [ ] `read` 可确认 README 用简短表述说明当前 Astro 阶段定位，并把未来升级指向 `升级优化规划.md`。

  **QA Scenarios**:
  ```
  Scenario: README 成为干净的导航入口
    Tool: grep
    Steps: 搜索 `README.md` 中的各新文档链接，以及 `build:astro` 和 `publish` 字样。
    Expected: 所有链接和风险术语都存在。
    Evidence: .sisyphus/evidence/task-2-readme-entry.txt

  Scenario: README 仍重复详细流程
    Tool: read
    Steps: 读取 README 中原先放发文清单的部分，检查是否仍是完整步骤，而不是摘要 + 链接。
    Expected: 详细步骤已被压缩，并跳转到深度文档。
    Evidence: .sisyphus/evidence/task-2-readme-entry-error.txt
  ```

  **Commit**: NO | Message: `docs(readme): slim root overview` | Files: `README.md`

- [x] 3. 创建详细项目结构说明

  **What to do**：新增 `docs/project-structure.md`，面向 AI 和维护者说明仓库布局。覆盖顶层目录、`src/` 子区域、内容边界（`blog` / `docs` / project records）、高风险目录、生成目录，以及部署 / 工作流相关文件位置。加入一个 `How to read this repo` 小节，告诉 AI 或新维护者根据不同目标从哪里开始读。
  **Must NOT do**：不要把站点访客导航当作主内容；不要把命令操作步骤写进这个结构文档；不要发明仓库里不存在的目录或流程。

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: 这是基于真实路径的结构化技术说明文档。
  - Skills: `[]` - 不需要特殊技能。
  - Omitted: `["single-topic"]` - 该文件天然包含多个结构子话题。

  **Parallelization**：Can Parallel: YES | Wave 1 | Blocks: 8 | Blocked By: 1

  **References**:
  - Pattern: `README.md:15-38` - 当前顶层结构和受保护目录。
  - Pattern: `README.md:150-196` - 内容边界和元数据规则。
  - Pattern: `src/content/docs/intro.md:8-19` - 站点公开栏目可作为背景，但不能替代维护者结构说明。
  - API/Type: `CONTEXT.md:35-49` - blog、docs、project records 的定义。
  - API/Type: `package.json:8-27` - 证明 `scripts/` 工作流确实存在，结构说明必须指向真实命令来源。
  - External: none

  **Acceptance Criteria**:
  - [ ] `docs/project-structure.md` 包含顶层布局、`src/` 结构、内容边界、高风险区域、读仓库指南等标题。
  - [ ] `grep` 能找到 `src/pages/`、`src/layouts/`、`src/content/blog/`、`src/content/docs/`、`scripts/`、`.github/workflows/`。
  - [ ] `read` 可确认文档明确区分 blog / docs / project-record，而不是混为一谈。

  **QA Scenarios**:
  ```
  Scenario: 结构说明覆盖真实仓库区域
    Tool: grep
    Steps: 搜索 `docs/project-structure.md` 中的关键路径和标题。
    Expected: 所有关键区域和标题都存在。
    Evidence: .sisyphus/evidence/task-3-project-structure.txt

  Scenario: 内容类型边界被写糊了
    Tool: read
    Steps: 读取内容边界部分，检查 blog、docs、project records 是否被清楚区分。
    Expected: 每种内容类型的职责都与当前项目事实一致。
    Evidence: .sisyphus/evidence/task-3-project-structure-error.txt
  ```

  **Commit**: NO | Message: `docs(structure): add repository guide` | Files: `docs/project-structure.md`

- [x] 4. 创建维护者快速上手文档

  **What to do**：新增 `docs/maintenance-quickstart.md`，提供“最安全、最快速”的理解与接触仓库入口。包括环境假设、安装 / 启动命令、安全验证路径、`first 10 minutes` 清单，以及决策捷径，例如“纯构建验证优先 `build:astro`；除非明确要发布，否则不要运行 `publish`”。它应比操作流程文档更短，并链接到更深说明。
  **Must NOT do**：不要把完整工作流理论全塞进这个文件；不要把 `npm run build` 作为默认检查命令；不要遗漏风险提醒。

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: 快速上手文档需要短、准、能直接执行。
  - Skills: `[]` - 普通文档工作即可。
  - Omitted: `["minimal-fix"]` - 这不是修 bug。

  **Parallelization**：Can Parallel: YES | Wave 1 | Blocks: 8 | Blocked By: 1

  **References**:
  - Pattern: `README.md:40-75` - 当前安全命令和构建注意事项。
  - Pattern: `README.md:107-148` - 当前发文检查流程，可压缩为快速上手清单。
  - Pattern: `README.md:232-240` - 当前推荐维护顺序。
  - API/Type: `package.json:8-27` - 精确命令与脚本名称。
  - External: none

  **Acceptance Criteria**:
  - [ ] `docs/maintenance-quickstart.md` 包含 setup、first checks、safe commands、risky commands 等结构。
  - [ ] `grep` 能找到 `npm install`、`npm run dev`、`npm run links:check`、`npm run build:astro`、`npm run publish`。
  - [ ] `read` 可确认文档明确指出：`npm run build` 不是默认验证路径。

  **QA Scenarios**:
  ```
  Scenario: 快速上手包含安全命令路径
    Tool: grep
    Steps: 搜索 `docs/maintenance-quickstart.md` 中的安装、开发、links check、build:astro 与 publish 警告命令。
    Expected: 所有命令均存在且名称正确。
    Evidence: .sisyphus/evidence/task-4-quickstart.txt

  Scenario: 快速上手推荐了错误的 build 命令
    Tool: read
    Steps: 读取验证部分，检查是否把 `npm run build` 写成标准第一步。
    Expected: 文档优先推荐 `npm run build:astro`，并把 `npm run build` 标成更特殊 / 更高风险。
    Evidence: .sisyphus/evidence/task-4-quickstart-error.txt
  ```

  **Commit**: NO | Message: `docs(quickstart): add maintainer entry` | Files: `docs/maintenance-quickstart.md`

- [x] 5. 创建详细操作流程文档

  **What to do**：新增 `docs/operations-workflow.md`，作为权威详细流程文档。覆盖完整内容管线：dry-run 同步、内容准备、链接检查、纯构建验证、预览、发布警告。需要写清楚每个命令的用途、是否会改文件、什么时候使用，以及“如果检查失败，就先停下来排查，不要继续 publish”的规则。加入命令矩阵，字段为：command、purpose、writes files?、default use?、risk level。
  **Must NOT do**：不要发明 `package.json` 里没有的自动化步骤；不要把 `npm run publish` 写成日常验证的一部分；不要淡化 `content:prepare` 或 `build` 可能改文件这一事实。

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: 这是详细流程手册。
  - Skills: `[]` - 不需要额外技能。
  - Omitted: `["analyze-first"]` - 前置分析已经完成，现在是文档综合整理。

  **Parallelization**：Can Parallel: YES | Wave 1 | Blocks: 8 | Blocked By: 1

  **References**:
  - Pattern: `README.md:57-75` - `build` 会通过 prebuild 触发改动；`build:astro` 才是纯构建检查。
  - Pattern: `README.md:77-106` - Obsidian 同步规则与 dry-run 优先策略。
  - Pattern: `README.md:107-148` - 当前顺序化发文 / 验证流程。
  - Pattern: `README.md:211-240` - publish 警告和推荐维护顺序。
  - API/Type: `package.json:8-27` - 精确命令、dry-run 变体和脚本链路。
  - API/Type: `CONTEXT.md:27-33` - 当前发文流程和检查清单的定义要求。
  - External: none

  **Acceptance Criteria**:
  - [ ] `docs/operations-workflow.md` 包含 sync、prepare、link check、build verification、preview、release caution 等章节。
  - [ ] `grep` 能找到 `sync:blog:dry`、`sync:origin:dry`、`content:prepare`、`links:check`、`build:astro`、`build`、`preview`、`publish`。
  - [ ] `read` 可确认其中存在命令矩阵，并明确写出是否改文件 / 风险级别。

  **QA Scenarios**:
  ```
  Scenario: 操作文档覆盖真实命令链路
    Tool: grep
    Steps: 搜索 `docs/operations-workflow.md` 中的关键命令和章节标题。
    Expected: 所有核心命令和流程章节都存在。
    Evidence: .sisyphus/evidence/task-5-operations.txt

  Scenario: 操作文档隐藏了改文件行为
    Tool: read
    Steps: 读取命令矩阵，检查 `content:prepare` 和 `build` 是否被清楚标记为可能写入 / 改动文件。
    Expected: 改文件行为和风险级别都写得很明确。
    Evidence: .sisyphus/evidence/task-5-operations-error.txt
  ```

  **Commit**: NO | Message: `docs(ops): add operations workflow` | Files: `docs/operations-workflow.md`

- [x] 6. 把升级路线图重组为“阶段 + 主题”格式

  **What to do**：重写 `升级优化规划.md`，让它从一份较长、连续的规划文档，变成边界明确、可执行的路线图。保留已经验证过的意图，但重组为：路线图目的、非目标 / 护栏、短期、中期、长期，以及每个阶段内的主题区块，例如 documentation、structure、UX/UI、content workflow、performance/accessibility、maintenance/deployment。那些延期项要明确写成“当前不优先”，而不是正在承诺实施。
  此外，必须新增一段清晰说明：当前 Astro 静态站是“先从小做起”的起步架构，不代表长期终局；未来路线图需要同时覆盖三条专业化升级线——内容 / 结构专业化、交互 / 功能专业化、架构层专业化。路线图可以定义升级触发条件、候选方向和阶段目标，但不能把未来框架迁移写成已经拍板的事实。
  **Must NOT do**：不要引入新的架构升级想法；不要删掉关于备份、publish、GitHub push 的安全限制；不要把延期项写成当前承诺交付。

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: 这是对现有规划文档的结构化重写。
  - Skills: `[]` - 常规文档重组即可。
  - Omitted: `["domain-modeling"]` - 这里是路线图整理，不是术语体系设计。

  **Parallelization**：Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 1

  **References**:
  - Pattern: `升级优化规划.md:1-17` - 需保留严格执行约束的原始精神。
  - Pattern: `升级优化规划.md:26-59` - 保留当前状态优先级和延期项。
  - Pattern: `升级优化规划.md:60-72` - 已有的项目基线文档目标。
  - Pattern: `升级优化规划.md:158-174` - 现有内容工作流优化项。
  - Pattern: `升级优化规划.md:207-235` - 现有部署 / 维护限制和验收信号。
  - Pattern: `README.md:242-250` - README 当前把这里当作升级文档入口，重组后它仍应是唯一路线图目标。
  - External: none

  **Acceptance Criteria**:
  - [ ] `升级优化规划.md` 包含 short-term、mid-term、long-term 或等价的短 / 中 / 长期标题。
  - [ ] `grep` 能找到 documentation、content workflow、UI/UX 或 visual、performance/accessibility、maintenance/deployment 等主题分组。
  - [ ] `read` 可确认 backup / publish / no-push 等约束仍然存在。
  - [ ] `read` 可确认文档明确写出：Astro 是当前起步架构；未来升级覆盖内容、功能、架构三个维度；但未擅自锁定具体迁移框架。

  **QA Scenarios**:
  ```
  Scenario: 路线图完成“阶段 + 主题”重组
    Tool: grep
    Steps: 搜索 `升级优化规划.md` 中的阶段标题和要求的主题区块。
    Expected: 所有要求的阶段和主题标记都存在。
    Evidence: .sisyphus/evidence/task-6-roadmap.txt

  Scenario: 路线图在重写时丢失安全护栏
    Tool: read
    Steps: 读取路线图前言 / 约束部分，检查 no-push、publish caution 和 backup 规则是否仍然明确存在。
    Expected: 护栏完整保留，而且足够醒目。
    Evidence: .sisyphus/evidence/task-6-roadmap-error.txt
  ```

  **Commit**: NO | Message: `docs(roadmap): reorganize upgrade plan` | Files: `升级优化规划.md`

- [x] 7. 澄清访客文档、维护文档与 AI 上下文的边界

  **What to do**：做最小边界修正，让不同读者知道该去哪里看。保持 `src/content/docs/intro.md` 为访客向；如果需要，只增加一句话，告诉维护者去看仓库文档，不要把它改成内部手册。仅在必要时更新 `CONTEXT.md`，说明它负责稳定术语，不是主要操作手册。确保 README 和 `docs/README.md` 使用一致的边界表述。
  **Must NOT do**：不要把维护流程塞进 `src/content/docs/intro.md`；不要把 `CONTEXT.md` 扩写成长操作清单；不要出现互相矛盾的职责说明。

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 这是一个小改动，但要求边界表达高度精确。
  - Skills: `[]` - 不需要特殊技能。
  - Omitted: `["beginner-explain"]` - 重点是职责边界，不是科普解释。

  **Parallelization**：Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 2, 3, 4, 5

  **References**:
  - Pattern: `src/content/docs/intro.md:8-19` - 必须保持访客导向。
  - API/Type: `CONTEXT.md:1-49` - 术语 / 上下文文档，不应扩展成工作流手册。
  - Pattern: `README.md:1-250` - 根 README 应继续负责跳转到更深文档。
  - External: none

  **Acceptance Criteria**:
  - [ ] `src/content/docs/intro.md` 仍是轻量访客说明，不会新增维护者清单章节。
  - [ ] `grep` 可确认边界提示语把维护者引向仓库文档，而不是把流程直接写在这里。
  - [ ] `read` 可确认如果编辑了 `CONTEXT.md`，它仍以术语为主。

  **QA Scenarios**:
  ```
  Scenario: 多个文件中的边界说明一致
    Tool: read
    Steps: 读取 `README.md`、`docs/README.md`、`src/content/docs/intro.md`，对比它们的职责描述。
    Expected: 三者都明确：访客文档继续公开导向，维护 / AI 文档位于仓库 docs。
    Evidence: .sisyphus/evidence/task-7-boundaries.txt

  Scenario: 访客说明被误改成内部手册
    Tool: grep
    Steps: 搜索 `src/content/docs/intro.md` 中是否出现 `快速上手`、`操作流程` 或大段命令清单。
    Expected: 不出现这类维护手册结构。
    Evidence: .sisyphus/evidence/task-7-boundaries-error.txt
  ```

  **Commit**: NO | Message: `docs(boundary): separate audiences` | Files: `src/content/docs/intro.md`, `CONTEXT.md` (only if needed)

- [x] 8. 交叉链接、审计并验证整套文档

  **What to do**：做最终文档完整性检查。确认 `README.md`、`docs/README.md`、详细文档、`升级优化规划.md` 之间的链接一致。运行适合本次改动的 markdown / link / 构建验证命令。除非有非常明确的需要，否则优先 `npm run build:astro`，不要默认跑 `npm run build`；如果确实故意运行了完整 `build`，必须记录它可能改文件，并保存 diff。所有证据都放到 `.sisyphus/evidence/`。
  **Must NOT do**：不要运行 `npm run publish`；不要在未检查交叉链接时就宣告完成；不要在没说明原因时运行高风险命令。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 这是文档审计 + 仓库安全验证的组合任务。
  - Skills: `[]` - 不需要额外技能。
  - Omitted: `["git-master"]` - 不涉及 git 历史操作。

  **Parallelization**：Can Parallel: NO | Wave 2 | Blocks: none | Blocked By: 2, 3, 4, 5, 6, 7

  **References**:
  - Pattern: `README.md:40-75` - 验证时必须保留这里定义的安全命令认知。
  - API/Type: `package.json:8-27` - 所有验证命令的真实来源。
  - Pattern: `README.md:211-240` - 与 publish / build 风险、维护顺序相关的现有边界。
  - External: none

  **Acceptance Criteria**:
  - [ ] `grep` 可确认 README 和 `docs/README.md` 都链接到了预期详细文档。
  - [ ] `npm run links:check` 成功退出；如果失败，必须记录精确失败原因。
  - [ ] `npm run build:astro` 成功退出；如果失败，必须记录精确失败原因。
  - [ ] `read` 可确认 README 与深度文档之间不存在整段逐字重复的维护流程说明。

  **QA Scenarios**:
  ```
  Scenario: 整套文档交叉链接正常且验证通过
    Tool: bash
    Steps: 运行 `npm run links:check`；若成功，再运行 `npm run build:astro` 并保存输出。同时使用 `grep` 检查 README 和 docs 索引中的交叉链接。
    Expected: 命令成功退出，且预期链接存在。
    Evidence: .sisyphus/evidence/task-8-validation.txt

  Scenario: 验证暴露坏链接或重复说明
    Tool: read
    Steps: 检查 README 和详细文档是否仍保留重复的长流程块；检查 `links:check` 或 `build:astro` 输出里是否有失败。
    Expected: 没有未解决的重复；如果命令失败，失败信息被明确记录，任务不能标完成。
    Evidence: .sisyphus/evidence/task-8-validation-error.txt
  ```

  **Commit**: YES | Message: `docs(readme): reorganize project documentation map` | Files: `README.md`, `docs/README.md`, `docs/project-structure.md`, `docs/maintenance-quickstart.md`, `docs/operations-workflow.md`, `升级优化规划.md`, `src/content/docs/intro.md`, `CONTEXT.md` (only if changed)

## 最终验证波（强制，必须在全部实现任务之后）
> 4 个审查代理并行执行。必须全部 APPROVE。向用户汇总结果并拿到明确 “okay” 后才能算完成。
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** 用户拒绝或提出反馈 → 修复 → 重跑 → 再汇报 → 再等待 okay。
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## 提交策略
- 优先在全部文档与验证完成后，一次性提交最终文档改动。
- 推荐提交信息：`docs(readme): reorganize project documentation map`
- 如果执行者必须拆分提交，最多允许两个 commit：一个用于信息架构 + 详细文档，一个用于路线图 + 验证修正。

## 成功标准
- AI 打开 `README.md` 后，能立刻知道项目结构、操作流程和路线图的事实来源在哪。
- 人类维护者无需翻散落的博客复盘，就能依靠 quickstart 和 operations docs 理解风险和流程。
- 公开站点文档继续面向访客，而不是被内部流程污染。
- 路线图变成有边界、可执行的规划，而不是大而空的 wishlist。
- 路线图能同时表达“当前先用 Astro 起步”和“未来会逐步升级到更专业形态”这两个阶段事实，而不会把它们混成一句模糊口号。

## 后续历史追记

### 2026-09-11 current documentation model

- 当前文档职责模型为：`README.md` 记录 current snapshot；`AGENTS.md` 记录 stable rules；`CONTEXT.md` 仅记录 terms；根目录当前 docs 说明 structure / workflow；`.omo` records 记录 append-only engineering history；Skill 记录 current executable QA。
- `.omo` 是此模型中的 canonical engineering record。`.sisyphus` 只作为 legacy read-only corroboration，不再作为更新目标。
- `66aa8d51d85de57dbe64a5ca6b6ee5e1eecf9cb8`，简称 `66aa8d5`，是当前 committed implementation node。`AGENTS.md`、`.omo`、`.opencode` 的当前内容是该节点之后的 working-tree state，必须与提交状态分开陈述。
