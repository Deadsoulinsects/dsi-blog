import type { LocalInspection } from '../../scripts/admin/local.mjs';

export const localElement = <T extends Element>(root: ParentNode, selector: string): T => {
	const element = root.querySelector<T>(selector);
	if (!element) throw new TypeError(`Local preparation markup is missing ${selector}`);
	return element;
};

export const localMessages = (root: HTMLElement, name: string, messages: readonly string[]): void => {
	const list = localElement<HTMLUListElement>(root, `[data-local-${name}]`);
	list.replaceChildren(...(messages.length ? messages : ['无。']).map((message) => {
		const li = document.createElement('li');
		const text = document.createElement('span');
		text.textContent = message;
		li.dataset.state = messages.length ? name : 'empty';
		li.append(text);
		return li;
	}));
};

export const localValue = (root: HTMLElement, name: string, value: string): void => {
	localElement<HTMLElement>(root, `[data-local-value="${name}"]`).textContent = value;
};

export const renderInspection = (root: HTMLElement, report: LocalInspection): void => {
	localElement<HTMLElement>(root, '[data-local-result]').hidden = false;
	const verdict = localElement<HTMLElement>(root, '[data-local-verdict]');
	verdict.textContent = report.formal.ready
		? report.warnings.length ? 'Ready · 有 warning，需审阅' : 'Ready · 本地正式文章已就绪'
		: '尚未 Ready · 请处理下方阻止项';
	root.dataset.localState = report.formal.ready ? 'ready' : 'blocked';
	localValue(root, 'article', `${report.id} · ${report.note}`);
	localValue(root, 'metadata', `${report.metadata.requirements.length ? '未满足要求' : '满足要求'}（${report.metadata.owner === 'official' ? '正式文章' : '源文件'}）`);
	localValue(root, 'matched', `${report.counts.references} 个引用 · ${report.counts.matched} / ${report.counts.resources} 路径匹配 · 缺少 ${report.counts.missing}`);
	const bodyImages = report.references.filter((ref) => ref.usage === 'body' && ref.kind === 'image').length;
	localValue(root, 'semantics', `${report.counts.galleries} / ${bodyImages} / ${report.counts.videos}`);
	const reused = report.resources.filter((resource) => resource.action === 'reused').length;
	const convert = report.resources.filter((resource) => resource.action === 'convert').length;
	const deduplicated = report.resources.filter((resource) => resource.action === 'deduplicated').length;
	localValue(root, 'plan', `${reused} / ${convert} · 同内容合并 ${deduplicated}`);
	localValue(root, 'prepared', report.formal.ready ? '已有资源完整，正式渲染通过' : '检查完成；是否 Ready 以正式渲染结论为准');
	localMessages(root, 'errors', [...new Set([...report.errors, ...report.metadata.requirements, ...report.formal.errors])]);
	localMessages(root, 'warnings', report.warnings);
	const next: string[] = [];
	if (!report.formal.ready) {
		if (report.canPrepare) next.push('可准备网页资源；准备成功后仍会重新检查正式文章，不以“转换成功”替代 Ready。');
		if (report.formal.errors.length) next.push(
			`正式目标：${report.formal.path}。需要同步时先审阅 working tree，使用既有单篇同步；本页面不覆盖正式文章：\n${report.instructions.sync} --dry-run`,
			`按阻止项补齐正式 metadata / mediaId，协调现有内容规范化后重新检查。构建命令：\n${report.instructions.build}`,
		);
	} else next.push('本地 Ready。源、附件或正式文章变化后重新检查；可打开正式文章核对。此处不执行远端发布。');
	localMessages(root, 'next', next);
	const resources = localElement<HTMLUListElement>(root, '[data-local-resources]');
	resources.replaceChildren(...report.resources.map((resource) => {
		const li = document.createElement('li');
		const action = { reused: '复用', convert: '需要转换', deduplicated: '同内容合并', blocked: '阻止准备' }[resource.action];
		li.textContent = `${resource.path} · ${resource.kind} · ${resource.status === 'matched' ? '已匹配' : resource.status === 'missing' ? '缺少附件' : 'error'} · ${action}${resource.message ? ` · ${resource.message}` : ''}`;
		return li;
	}));
	const article = localElement<HTMLAnchorElement>(root, '[data-local-article]');
	article.href = report.formal.url;
	article.hidden = !report.formal.ready;
};
