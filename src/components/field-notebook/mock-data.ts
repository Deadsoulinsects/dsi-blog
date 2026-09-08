import type { FieldEntry, FieldProject, FieldTocItem } from './types';

export const articleEntry = {
	slug: 'deployment-field-map',
	title: 'Astro Islands 与构建边界：把一次失败部署写成可复用的排错地图',
	summary: '从现象、证据到决策，把零散排查过程整理成下一次可以直接使用的路径。',
	date: '2026-08-18',
	readTime: '11 min',
	tags: ['部署', '排错', '复盘'],
	category: '系统实践',
	type: 'essay',
	href: '/lab/field-notebook/article/',
} as const satisfies FieldEntry;

export const fieldEntries: readonly FieldEntry[] = [
	{
		slug: 'stack-notes',
		title: '栈',
		summary: '一份关于调用顺序、状态边界与错误回溯的虚构短记录。',
		date: '2026-08-24',
		readTime: '4 min',
		tags: [],
		category: '工程札记',
		type: 'note',
		href: '/lab/field-notebook/article/',
	},
	articleEntry,
	{
		slug: 'long-boundary-observation',
		title: '当一条看似普通的构建命令穿过缓存、内容管线与部署边界之后，我们究竟应该在哪里开始观察',
		summary: '用于检验超长中文标题与复杂摘要在窄屏下能否保持清晰层级的虚构条目。',
		date: '2026-08-09',
		readTime: '18 min',
		tags: ['Build Pipeline', '这个标签故意很长以验证连续混合文字在狭窄空间中的自然换行能力', 'Observability'],
		category: '研究记录',
		type: 'reference',
		href: '/lab/field-notebook/article/',
	},
	{
		slug: 'html-first-islands',
		title: 'HTML First / Astro Islands：从静态骨架到渐进增强的边界记录',
		summary: '用中英混合标题检验索引页的扫描效率。',
		date: '2026-07-31',
		readTime: '9 min',
		tags: ['Astro', 'HTML First'],
		category: '前端研究',
		type: 'essay',
		href: '/lab/field-notebook/article/',
	},
	{
		slug: 'summary-absent',
		title: '没有摘要时，标题能否独立成立',
		date: '2026-07-22',
		readTime: '6 min',
		tags: ['内容结构'],
		category: '编辑方法',
		type: 'note',
		href: '/lab/field-notebook/article/',
	},
	{
		slug: 'reading-measure',
		title: '阅读宽度不是一个固定数字 / Measure Is Context',
		summary: '正文、代码、表格和边注需要不同的宽度策略。',
		date: '2025-12-14',
		readTime: '14 min',
		tags: ['Typography', 'CSS'],
		category: '设计系统',
		type: 'reference',
		href: '/lab/field-notebook/article/',
	},
] as const;

export const fieldYears = [
	{ year: '2026', count: 12 },
	{ year: '2025', count: 9 },
	{ year: '2024', count: 5 },
	{ year: '2023', count: 2 },
] as const;

export const fieldTopics = [
	{ name: '系统实践', count: 8 },
	{ name: '前端研究', count: 7 },
	{ name: '设计系统与长期维护策略', count: 5 },
	{ name: '编辑方法', count: 4 },
] as const;

export const referenceCollections = [
	{ label: '构建手册', target: 'reference-01' },
	{ label: '前端参考', target: 'reference-02' },
	{ label: '写作方法', target: 'reference-03' },
] as const;

export const fieldProjects = [
	{ code: 'P-01', status: 'ACTIVE', title: '离线文章索引器', note: '验证静态索引与无脚本浏览路径的虚构实验。', href: '/lab/field-notebook/article/' },
	{ code: 'P-02', status: 'ACTIVE', title: '构建边界观察台', note: '记录输入、输出和失败边界的虚构工作台。', href: '/lab/field-notebook/article/' },
	{ code: 'P-03', status: 'PAUSED', title: '小型设计令牌册', note: '将排版、间距与规则线整理成可复查的字段。', href: '/lab/field-notebook/article/' },
	{ code: 'P-04', status: 'ARCHIVED', title: '静态站发布清单', note: '用于检验归档状态与长说明并置时的扫描节奏。', href: '/lab/field-notebook/article/' },
] as const satisfies readonly FieldProject[];

export const articleToc = [
	{ id: 'question', label: '问题从哪里开始', depth: 2 },
	{ id: 'signals', label: '先收集信号', depth: 2 },
	{ id: 'build-log', label: '构建日志', depth: 3 },
	{ id: 'runtime', label: '运行时边界', depth: 3 },
	{ id: 'map', label: '画出排错地图', depth: 2 },
	{ id: 'after', label: '把结论留给下一次', depth: 2 },
] as const satisfies readonly FieldTocItem[];

export const articleCode = `export function tracePipeline(stages: readonly PipelineStage[]) {
  return stages.map((stage, index) => ({
    order: index + 1,
    name: stage.name,
    evidence: stage.logs ?? [],
    next: stage.status === 'failed' ? 'inspect-boundary' : 'continue',
  }));
}

const intentionallyLongLine = 'https://example.invalid/fictional/a/very/long/path/that/keeps/going/to/test/local-horizontal-overflow/without-breaking/the-article-layout-or-the-mobile-viewport';`;
