import type { AdminDraft } from './content';
import type { AdminElements } from './controller';
import { summarizeMedia } from './media-session';
import type { MediaManifest } from './media-session';

export const editableText = (value: unknown): string => {
	if (value === undefined) return '';
	if (typeof value === 'string') return value;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
	try {
		return JSON.stringify(value) ?? String(value);
	} catch (error) {
		if (error instanceof TypeError) return String(value);
		throw error;
	}
};

const renderMessages = (list: HTMLUListElement, messages: readonly string[], emptyMessage: string): void => {
	list.replaceChildren();
	for (const message of messages.length > 0 ? messages : [emptyMessage]) {
		const item = document.createElement('li');
		item.textContent = message;
		list.append(item);
	}
};

export const renderDraftState = (elements: AdminElements, draft: AdminDraft, manifest: MediaManifest | null): void => {
	elements.sourceFile.textContent = draft.sourceFileName;
	elements.slug.textContent = draft.target?.slug ?? '无法生成';
	elements.path.textContent = draft.target?.path ?? '目标文件名无效';
	elements.previewTitle.textContent = editableText(draft.metadata.title).trim() || '尚未填写标题';
	elements.previewDescription.textContent = editableText(draft.metadata.description).trim() || '尚未填写描述。';
	const diagnostics = manifest?.document.diagnostics ?? [];
	renderMessages(elements.blockingList, [...draft.blockingIssues.map((issue) => issue.message), ...diagnostics], '没有阻止准备的错误。');
	renderMessages(elements.requirementsList, draft.publishingRequirements.map((requirement) => requirement.message), '发布准备要求已满足。');
	const issueFields = new Set([...draft.blockingIssues, ...draft.publishingRequirements].flatMap((issue) => issue.field ? [issue.field] : []));
	for (const [field, input] of [
		['title', elements.titleInput], ['description', elements.descriptionInput],
		['completion_date', elements.dateInput], ['topic', elements.topicInput],
	] as const) input.setAttribute('aria-invalid', String(issueFields.has(field)));
	elements.targetFileInput.setAttribute('aria-invalid', String(draft.target === null));

	const media = summarizeMedia(manifest);
	const metadataReady = draft.blockingIssues.every((issue) => issue.code === 'unresolved_markdown_link')
		&& draft.publishingRequirements.every((requirement) => requirement.code === 'empty_body');
	const linksReady = !draft.blockingIssues.some((issue) => issue.code === 'unresolved_markdown_link')
		&& diagnostics.length === 0 && !draft.publishingRequirements.some((requirement) => requirement.code === 'empty_body');
	const mediaReady = !media.loading && media.missing === 0 && media.unsupported === 0;
	for (const [dimension, ready] of [['metadata', metadataReady], ['links', linksReady], ['media', mediaReady]] as const) {
		const output = elements.readiness.querySelector<HTMLElement>(`[data-readiness-dimension="${dimension}"]`);
		if (output) {
			output.textContent = ready ? '已准备' : dimension === 'media' ? '资源尚未提供或无法使用' : '尚未准备';
			output.dataset.ready = String(ready);
		}
	}
	const blocked = draft.blockingIssues.length > 0 || diagnostics.length > 0;
	const state = blocked ? 'blocked' : !draft.ready ? 'requirements' : !mediaReady ? 'media' : 'ready';
	elements.readiness.dataset.adminReadinessState = state;
	elements.readinessTitle.textContent = state === 'blocked' ? '草稿仍有错误'
		: state === 'requirements' ? '还需补齐发布要求' : state === 'media' ? '还需提供附件' : '草稿已准备';
	elements.readinessCopy.textContent = state === 'blocked' ? '请先解决内容检查中的错误；缺少附件另行显示，不视为 Markdown 解析错误。'
		: state === 'requirements' ? '结构已可检查，请补齐发布要求；媒体准备状态单独列出。'
			: state === 'media' ? `媒体已匹配 ${media.matched} / ${media.total}。请选择正确附件目录；本阶段不上传或保存媒体。`
				: '元数据、正文链接和媒体均已准备。媒体只保留在当前浏览器会话，不代表已经发布。';
};
