export interface ListMasterVariant {
	slug: string;
	name: string;
	shortName: string;
	thesis: string;
	tone: string;
	opening: string;
	cardArchetype: string;
	grouping: string;
	metadataRole: string;
	spacing: string;
	paletteNote: string;
	layout: 'order' | 'spirit' | 'catalog';
	tokens: Record<string, string>;
}

export const listMasterVariants: ListMasterVariant[] = [
	{
		slug: 'low-temperature-order',
		name: '低温整理',
		shortName: '母版 A',
		thesis: '让列表页先拥有真正的秩序与呼吸，而不是先拥有新颜色。',
		tone: '冷静、克制、安静，但比正式版更有章法。',
		opening: '像一页被重新编排过的目录开场，而不是情绪化 hero。',
		cardArchetype: '阅读条目板：边界清楚、信息稳定、摘要和元信息像被整理过。',
		grouping: '中等分组，像阅读路径里的停顿与章节，不靠大块装饰取胜。',
		metadataRole: '低温索引件：日期、分类、专题更像结构标记，而不是漂浮装饰。',
		spacing: '偏收，但有呼吸；让页面看起来稳，而不是挤或空。',
		paletteNote: '仍然是冷色夜底，但重点靠表面层级拉开，不靠夸张新色。',
		layout: 'order',
		tokens: {
			'--master-bg': '#070a12',
			'--master-bg-soft': '#0d1320',
			'--master-surface': 'rgba(13, 18, 30, 0.82)',
			'--master-surface-strong': 'rgba(18, 25, 39, 0.94)',
			'--master-line': 'rgba(139, 161, 213, 0.18)',
			'--master-line-strong': 'rgba(170, 191, 241, 0.28)',
			'--master-text': '#eef3ff',
			'--master-text-soft': '#aeb9d4',
			'--master-accent': '#9eb0ff',
			'--master-accent-soft': '#dfe7ff',
			'--master-glow': 'rgba(128, 152, 255, 0.12)',
			'--master-shadow': '0 24px 60px rgba(0, 0, 0, 0.24)',
		},
	},
	{
		slug: 'floating-spirit',
		name: '漂浮灵体',
		shortName: '母版 B',
		thesis: '让内容像夜里慢慢浮现的魂光层，形成灵性，而不是只换成青绿色。',
		tone: '幽冷、轻悬、柔和、像有微弱生命感。',
		opening: '不是目录，不是展厅，而是像内容在雾里慢慢露头。',
		cardArchetype: '漂浮条目：块与块之间轻微错位、轻悬、带气流般的呼吸。',
		grouping: '层层浮现的分组，主次不均，阅读线更像漂流中的停靠点。',
		metadataRole: '漂浮注记：像附着在条目周边的灵体标记，而不是统一角标。',
		spacing: '比正式版更松，但不是展览白墙；要像空气在托内容。',
		paletteNote: '冷青、雾白、暗海墨绿只是辅助，关键是背景与前景的轻悬关系。',
		layout: 'spirit',
		tokens: {
			'--master-bg': '#05090d',
			'--master-bg-soft': '#091218',
			'--master-surface': 'rgba(10, 18, 24, 0.72)',
			'--master-surface-strong': 'rgba(13, 26, 34, 0.9)',
			'--master-line': 'rgba(133, 199, 192, 0.18)',
			'--master-line-strong': 'rgba(176, 237, 230, 0.3)',
			'--master-text': '#effcf9',
			'--master-text-soft': '#a5c2bc',
			'--master-accent': '#9fe1d3',
			'--master-accent-soft': '#dbfff6',
			'--master-glow': 'rgba(131, 232, 213, 0.14)',
			'--master-shadow': '0 24px 60px rgba(0, 0, 0, 0.28)',
		},
	},
	{
		slug: 'quiet-catalog',
		name: '静态陈列',
		shortName: '母版 C',
		thesis: '把列表页做成被整理、编号、封签和陈列起来的内容世界。',
		tone: '庄重、平静、有编排感，但不做神神叨叨的祭坛。',
		opening: '像一个章节前言或展区引导，而不是普通列表开头。',
		cardArchetype: '展签板 / 档案条目：条目更像被安放在框架里的内容。',
		grouping: '三条里分组最强，每组都像一个有身份的章节区。',
		metadataRole: '展签与编目：元信息直接成为版式系统的一部分。',
		spacing: '条目不挤，但更有边界和编号秩序。',
		paletteNote: '不是古铜复古，而是冷灰、骨白、墨蓝灰的陈列感。',
		layout: 'catalog',
		tokens: {
			'--master-bg': '#0a0b10',
			'--master-bg-soft': '#131720',
			'--master-surface': 'rgba(19, 21, 28, 0.84)',
			'--master-surface-strong': 'rgba(25, 28, 37, 0.95)',
			'--master-line': 'rgba(188, 194, 208, 0.18)',
			'--master-line-strong': 'rgba(223, 229, 240, 0.28)',
			'--master-text': '#f3f4f8',
			'--master-text-soft': '#b8bcc9',
			'--master-accent': '#cdd3e2',
			'--master-accent-soft': '#ffffff',
			'--master-glow': 'rgba(214, 220, 236, 0.08)',
			'--master-shadow': '0 24px 60px rgba(0, 0, 0, 0.26)',
		},
	},
];

export const listMasterVariantMap = new Map(listMasterVariants.map((variant) => [variant.slug, variant]));
