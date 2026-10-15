import { workspacePrefix, workspaceRequest } from './workspace-api';
import { mountWorkspacePreview } from './workspace-preview';
import { slug as githubSlug } from 'github-slugger';
import { withBase } from '../utils/paths';
import { getTopicPath, getTopicSlug } from '../utils/topics';
import type {
	WorkspaceArticle, WorkspaceBindingCandidates, WorkspaceChanges, WorkspaceJob, WorkspaceMetadata, WorkspacePublication,
	WorkspaceScan, WorkspaceState,
} from './workspace-types';
import { initializeTopicEditor } from './workspace-topics';

const articleStates = { uncommitted: '未提交', committed: '已提交 · 未推送', pushed: '已推送' };
const preparationStates = {
	unchecked: '未检查', queued: '准备排队中', running: '正在准备',
	ready: '准备就绪', blocked: '条件未满足', failed: '准备失败', cancelled: '准备已取消',
};
const jobStates = { queued: '排队中', running: '进行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' };
const publicationStates: Record<string, string> = {
	idle: '尚未执行发布', pushing: '正在推送', pushed: '已推送 · 上线未确认',
	deploying: '正在确认部署', deployed: '已确认上线', failed: '发布失败', unverified: '已推送 · 上线未确认',
};
const phaseNames: Record<string, string> = {
	snapshot: '创建隔离检查工作区', media: '准备网页附件', check: 'Astro 静态检查',
	build: 'Astro 构建验证', convert: '转换附件', prepare: '准备资源',
};
const reasonNames = {
	import: '纳入新笔记', metadata: '文章信息变化', source: 'Obsidian 原文变化',
	manual: '手动准备', binding: '绑定或更换原文', publication: '确认推送与部署',
};
const resultNames = { ready: '就绪', blocked: '条件未满足', failed: '失败', cancelled: '取消', superseded: '已由新版本替代' };
const stripAnsi = (value: string) => value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g'), '');
const friendlyError = (value: string) => {
	const clean = stripAnsi(value);
	if (/程序安装文件不完整|ERR_MODULE_NOT_FOUND|Cannot find module|(?:ENOENT|not found).*(?:runtime|node_modules|astro|typescript)|lib\.es\d.*\.d\.ts/i.test(clean)) {
		return '程序环境问题：运行文件缺失或安装不完整。请更新或重新安装 DSI Admin 并保留 data；这不是文章语法错误。';
	}
	return clean.split(/\r?\n/).find((line) => line.trim() && !/^\s*at\s/.test(line))?.trim() || '任务失败，请展开技术详情查看原始记录。';
};
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const node = <Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className = '', text?: string) => {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
};
const metadataOf = (article: WorkspaceArticle): WorkspaceMetadata => ({
	title: article.title, description: article.description, completion_date: article.completion_date, topicPath: [...article.topicPath],
});
const sameMetadata = (left: WorkspaceMetadata, right: WorkspaceMetadata) => JSON.stringify(left) === JSON.stringify(right);

interface Edit {
	baseRevision: number;
	metadata: WorkspaceMetadata;
	dirty: boolean;
	generation: number;
	saving: Promise<boolean> | null;
	conflict: boolean;
	error: string;
	timer?: number;
}

export function initializeWorkspace(): void {
	const root = document.querySelector<HTMLElement>('[data-workspace-page]');
	if (!root) return;
	const get = <Type extends Element = HTMLElement>(name: string): Type => {
		const element = root.querySelector<Type>(`[data-workspace-${name}]`);
		if (!element) throw new TypeError(`Admin markup is missing data-workspace-${name}`);
		return element;
	};
	const bridge = window.dsiDesktop;
	const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
	const localAllowed = localHost && (Boolean(bridge) || root.dataset.development === 'true');
	const fields = {
		title: get<HTMLInputElement>('field-title'),
		description: get<HTMLTextAreaElement>('field-description'),
		completion_date: get<HTMLInputElement>('field-date'),
		topicPath: get<HTMLInputElement>('field-topic'),
	};
	const configurationForm = get<HTMLFormElement>('configuration-form');
	const configurationFields = {
		repoRoot: get<HTMLInputElement>('config-repo'),
		sourceRoot: get<HTMLInputElement>('config-source'),
		siteUrl: get<HTMLInputElement>('config-site'),
		authorName: get<HTMLInputElement>('config-author'),
		authorEmail: get<HTMLInputElement>('config-email'),
	};
	const dialogs = {
		import: get<HTMLDialogElement>('import-dialog'),
		tree: get<HTMLDialogElement>('tree-dialog'),
		bind: get<HTMLDialogElement>('bind-dialog'),
		commit: get<HTMLDialogElement>('commit-dialog'),
		publish: get<HTMLDialogElement>('publish-dialog'),
		topic: get<HTMLDialogElement>('topic-dialog'),
	};
	const lightbox = get<HTMLDialogElement>('lightbox');
	const edits = new Map<string, Edit>();
	const selection = new Set<string>();
	const pendingSelection = new Set<string>();
	const scanSelection = new Set<string>();
	const sectionStates = new Map<string, boolean>();
	for (const details of root.querySelectorAll<HTMLDetailsElement>('details[data-workspace-section]')) {
		sectionStates.set(details.dataset.workspaceSection!, details.open);
	}
	root.addEventListener('toggle', (event) => {
		const details = event.target;
		if (details instanceof HTMLDetailsElement && details.dataset.workspaceSection) {
			sectionStates.set(details.dataset.workspaceSection, details.open);
		}
	}, true);
	const preservedDetails = (key: string, className: string, defaultOpen = false) => {
		const details = node('details', className);
		details.dataset.workspaceSection = key;
		details.open = sectionStates.get(key) ?? defaultOpen;
		return details;
	};
	let state: WorkspaceState | null = null;
	let selectedId: string | null = null;
	let available = false;
	let connected = false;
	let busy = false;
	let flushing = false;
	let flushTask: Promise<void> | null = null;
	let configurationDirty = false;
	let events: EventSource | null = null;
	let refreshTask: Promise<void> | null = null;
	let refreshAgain = false;
	let previewKey = '';
	let previewHtml = '';
	let previewArticleId = '';
	let disposePreview: (() => void) | null = null;
	let scan: WorkspaceScan | null = null;
	let bindingId: string | null = null;
	let changes: WorkspaceChanges | null = null;
	let publication: WorkspacePublication | null = null;
	let commitStale = false;
	let publicationStale = false;
	let disposed = false;
	let selectedTopic: string[] | null = null;
	let page = 1;
	let pageSize = 12;

	const current = () => state?.articles.find((article) => article.id === selectedId);
	const selectedArticles = () => state?.articles.filter((article) => selection.has(article.id)) ?? [];
	const pendingNotes = () => state?.pending.filter((entry) => !state?.articles.some((article) => article.sourcePath === entry.path)) ?? [];
	const canWrite = () => available && connected && !busy && !flushing;
	const topicEditor = initializeTopicEditor(root, {
		topics: () => state?.topics, selectedPath: () => selectedTopic,
		canWrite, refresh, run, changed: syncControls,
	});
	const hasUnsaved = () => [...edits.values()].some((edit) => edit.dirty || edit.saving) || topicEditor.dirty();
	const announce = (message: string, failed = false) => {
		const status = get('notice');
		status.textContent = message;
		status.dataset.state = failed ? 'error' : 'success';
		for (const dialog of Object.values(dialogs)) {
			if (!dialog.open) continue;
			const output = dialog.querySelector<HTMLElement>('[data-workspace-dialog-status]');
			if (output) {
				output.textContent = message;
				output.dataset.state = failed ? 'error' : 'success';
			}
		}
	};
	const showDialog = (dialog: HTMLDialogElement) => {
		const output = dialog.querySelector<HTMLElement>('[data-workspace-dialog-status]');
		if (output) output.textContent = '';
		dialog.showModal();
	};
	const replaceIssues = (element: HTMLElement, messages: string[]) => {
		element.replaceChildren(...messages.map((message) => node('li', '', message)));
		element.hidden = messages.length === 0;
	};
	const mergeArticle = (article: WorkspaceArticle) => {
		if (!state) return;
		const index = state.articles.findIndex((entry) => entry.id === article.id);
		if (index === -1) state.articles.push(article);
		else if (state.articles[index]!.revision <= article.revision) state.articles[index] = article;
	};
	const getEdit = (article: WorkspaceArticle) => {
		let edit = edits.get(article.id);
		if (!edit) {
			edit = {
				baseRevision: article.revision, metadata: metadataOf(article), dirty: false,
				generation: 0, saving: null, conflict: false, error: '',
			};
			edits.set(article.id, edit);
		}
		return edit;
	};

	function syncControls(): void {
		for (const control of root!.querySelectorAll<HTMLButtonElement>('[data-workspace-local]')) control.disabled = !canWrite();
		for (const control of root!.querySelectorAll<HTMLButtonElement>('[data-workspace-close-dialog]')) control.disabled = busy;
		for (const control of root!.querySelectorAll<HTMLElement>('[data-workspace-native]')) control.hidden = !bridge;
		for (const fieldset of root!.querySelectorAll<HTMLFieldSetElement>('[data-workspace-local-fields]')) fieldset.disabled = !canWrite();
		const article = current();
		get<HTMLFieldSetElement>('metadata-fields').disabled = !canWrite() || !article;
		get<HTMLButtonElement>('bind-source').disabled = !canWrite() || !article || hasUnsaved();
		get<HTMLButtonElement>('open-source').disabled = !canWrite() || !bridge || !article?.sourcePath || article.sourceMissing;
		const selected = selectedArticles();
		get<HTMLButtonElement>('prepare-selection').disabled = !canWrite() || !selected.length || hasUnsaved()
			|| selected.some((entry) => entry.sourceMissing || ['running', 'queued'].includes(entry.preparation.state));
		get<HTMLButtonElement>('review-commit').disabled = !canWrite() || (!selected.length && !state?.topics.dirtyPaths.length) || hasUnsaved()
			|| Boolean(state?.topics.conflict)
			|| selected.some((entry) => entry.status !== 'uncommitted' || entry.preparation.state !== 'ready' || entry.sourceMissing);
		get<HTMLButtonElement>('review-publication').disabled = !canWrite()
			|| Boolean(state?.jobs.some((job) => !job.articleIds.length && ['queued', 'running'].includes(job.state)));
		get<HTMLButtonElement>('import-pending').disabled = !canWrite() || !pendingSelection.size;
		get<HTMLButtonElement>('confirm-tree').disabled = !canWrite() || !scanSelection.size;
		get<HTMLButtonElement>('configuration-save').disabled = !canWrite()
			|| Boolean(state?.jobs.some((job) => ['queued', 'running'].includes(job.state)));
		get<HTMLButtonElement>('confirm-commit').disabled = !canWrite() || !changes?.files.length || commitStale
			|| !get<HTMLInputElement>('commit-reviewed').checked || !get<HTMLInputElement>('commit-message').value.trim();
		get<HTMLButtonElement>('confirm-publication').disabled = !canWrite() || !publication?.ahead.length
			|| Boolean(publication.errors.length) || publicationStale || !get<HTMLInputElement>('publication-reviewed').checked;
		get('selection-count').textContent = `已选 ${selected.length} 篇`;
		if (state) {
			const issues = state.articles.filter((entry) => entry.sourceMissing || ['blocked', 'failed'].includes(entry.preparation.state)).length;
			get('article-count').replaceChildren(...[
				`${state.articles.length} 篇文章`, `已选 ${selected.length} 篇`, `${issues} 篇需处理`,
			].map((text) => node('span', 'workspace-count', text)));
			get('article-count').classList.toggle('workspace-error-text', issues > 0);
		}
		const visible = pagedArticles();
		get('visible-selection').textContent = `本页已选 ${visible.filter((article) => selection.has(article.id)).length} / ${visible.length} 篇`;
		get<HTMLButtonElement>('select-page').disabled = !available || !visible.length;
		get<HTMLButtonElement>('clear-selection').disabled = !selection.size;
		get('pending-selection-count').textContent = `已选 ${pendingSelection.size} 篇`;
		get('tree-selection-count').textContent = `将纳入 ${scanSelection.size} 篇新笔记`;
		get('commit-stale').hidden = !commitStale;
		get('publication-stale').hidden = !publicationStale;
		get('reconnect').hidden = !localAllowed || connected;
		topicEditor.render();
	}

	function filteredArticles(): WorkspaceArticle[] {
		const query = get<HTMLInputElement>('search').value.trim().toLocaleLowerCase();
		const filter = get<HTMLSelectElement>('filter').value;
		return state?.articles.filter((article) =>
			(filter === 'all' || article.status === filter)
			&& (selectedTopic === null || (selectedTopic.length
				? selectedTopic.every((part, index) => getTopicPath(article)[index] === part)
				: getTopicPath(article).length === 0))
			&& `${article.title} ${article.targetPath} ${article.topicPath.join('/')} ${article.sourcePath || ''}`.toLocaleLowerCase().includes(query),
		) ?? [];
	}

	function pagedArticles(): WorkspaceArticle[] {
		return filteredArticles().slice((page - 1) * pageSize, page * pageSize);
	}

	function topicGroups() {
		const groups = new Map<string, { path: string[]; articles: WorkspaceArticle[] }>();
		for (const entry of state?.topics.entries ?? []) {
			for (let depth = 1; depth <= entry.path.length; depth++) {
				const path = entry.path.slice(0, depth);
				groups.set(JSON.stringify(path), { path: [...path], articles: [] });
			}
		}
		for (const article of state?.articles ?? []) {
			const path = getTopicPath(article);
			for (let depth = 1; depth <= path.length; depth++) {
				const prefix = path.slice(0, depth);
				const key = JSON.stringify(prefix);
				if (!groups.has(key)) groups.set(key, { path: prefix, articles: [] });
				groups.get(key)!.articles.push(article);
			}
		}
		return [...groups.values()].sort((left, right) => left.path.join('/').localeCompare(right.path.join('/'), 'zh-CN'));
	}

	function renderTopics(): void {
		const tree = get('topics');
		const groups = topicGroups();
		const makeChoice = (path: string[] | null, title: string, count: number) => {
			const button = node('button', 'workspace-topic-choice');
			button.type = 'button';
			button.append(node('span', '', title), node('span', 'workspace-count', `${count} 篇`));
			button.setAttribute('aria-pressed', String(JSON.stringify(path) === JSON.stringify(selectedTopic)));
			button.addEventListener('click', (event) => {
				event.stopPropagation();
				selectedTopic = path;
				page = 1;
				renderList();
			});
			return button;
		};
		const all = node('li');
		all.append(makeChoice(null, '全部文章', state?.articles.length ?? 0));
		const unclassified = node('li');
		unclassified.append(makeChoice([], '未分类', state?.articles.filter((article) => !getTopicPath(article).length).length ?? 0));
		const children = (parent: string[]): HTMLLIElement[] => groups
			.filter((group) => group.path.length === parent.length + 1 && parent.every((part, index) => group.path[index] === part))
			.map((group) => {
				const row = node('li');
				const descendants = children(group.path);
				const choice = makeChoice(group.path, group.path.at(-1)!, group.articles.length);
				if (descendants.length) {
					const details = preservedDetails(`topic:${JSON.stringify(group.path)}`, '');
					const summary = node('summary');
					summary.append(choice);
					const list = node('ul');
					list.append(...descendants);
					details.append(summary, list);
					row.append(details);
				} else row.append(choice);
				return row;
			});
		tree.replaceChildren(all, ...children([]), unclassified);
	}

	function renderList(): void {
		const list = get('articles');
		const articles = filteredArticles();
		const pages = Math.max(1, Math.ceil(articles.length / pageSize));
		page = Math.min(page, pages);
		renderTopics();
		list.replaceChildren();
		for (const article of pagedArticles()) {
			const row = node('li', 'workspace-article-row');
			row.dataset.active = String(article.id === selectedId);
			const checkbox = node('input');
			checkbox.type = 'checkbox';
			checkbox.checked = selection.has(article.id);
			checkbox.disabled = !available;
			checkbox.setAttribute('aria-label', `选择文章：${article.title || article.targetFileName}`);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) selection.add(article.id);
				else selection.delete(article.id);
				syncControls();
			});
			const button = node('button', 'workspace-article-open');
			button.type = 'button';
			button.setAttribute('aria-current', article.id === selectedId ? 'true' : 'false');
			button.append(node('strong', '', article.title || article.targetFileName));
			const details = node('span', 'workspace-article-meta', `${article.completion_date || '日期未填写'} · ${article.topicPath.join(' / ') || '未分类'}`);
			const states = node('span', 'workspace-article-states');
			const status = node('span', 'workspace-state', articleStates[article.status]);
			status.dataset.status = article.status;
			const preparation = node('span', 'workspace-state', preparationStates[article.preparation.state]);
			preparation.dataset.preparation = article.preparation.state;
			states.append(status, preparation);
			if (article.sourceMissing) states.append(node('span', 'workspace-error-text', '源文件已丢失'));
			if (edits.get(article.id)?.dirty) states.append(node('span', 'workspace-warning-text', '输入尚未保存'));
			button.append(details, states);
			button.addEventListener('click', () => {
				void run(() => openArticle(article.id));
			});
			row.append(checkbox, button);
			list.append(row);
		}
		get('list-empty').hidden = articles.length > 0;
		get('list-empty').textContent = state?.articles.length ? '没有符合搜索或状态条件的文章。' : '工作区尚无文章。选择来源笔记，或在配置中指定已有博客仓库。';
		get('article-count').textContent = state ? `${state.articles.length} 篇文章` : '尚未连接工作区';
		get('list-scope').textContent = `${selectedTopic === null ? '全部专题' : selectedTopic.join(' / ') || '未分类'} · 符合条件 ${articles.length} 篇。打开后在下方编辑；页面不会自动滚动。`;
		get('page-count').textContent = `第 ${page} / ${pages} 页 · ${articles.length} 篇`;
		get<HTMLButtonElement>('page-previous').disabled = page === 1;
		get<HTMLButtonElement>('page-next').disabled = page === pages;
		syncControls();
	}

	async function openArticle(id: string): Promise<void> {
		if (selectedId === id) return;
		if (selectedId && !await saveEdit(selectedId)) throw new Error('当前输入尚未保存，请先处理保存错误或版本冲突。');
		selectedId = id;
		renderList();
		renderEditor();
		await loadPreview();
	}

	function articleRoute(article: WorkspaceArticle): string | null {
		if (!article.targetFileName.endsWith('.md') || /[/\\]/.test(article.targetFileName)) return null;
		const slug = githubSlug(article.targetFileName.slice(0, -3));
		return slug ? withBase(import.meta.env.BASE_URL, `/blog/${slug}/`) : null;
	}

	function renderStructure(): void {
		const articles = state?.articles ?? [];
		const paths = new Map<string, WorkspaceArticle[]>();
		const issues: { article: WorkspaceArticle; message: string }[] = [];
		const notices: { article: WorkspaceArticle; message: string }[] = [];
		for (const article of articles) {
			const route = articleRoute(article);
			if (route) paths.set(route, [...paths.get(route) ?? [], article]);
			else issues.push({ article, message: '目标文件名无法形成公开文章路径，请整理目标文件名后重新准备。' });
			if (article.topicPath.some((part) => !part.trim() || !getTopicSlug([part]) || /[/\\?#%]/.test(part)
				|| [...part].some((character) => character.charCodeAt(0) < 32))) {
				issues.push({ article, message: '专题包含空层级或非法路径字符，请修正文章信息中的专题字段。' });
			}
			if (article.sourceMissing) issues.push({ article, message: '源文件已丢失，请绑定有效 Obsidian 原文。' });
			else if (!article.sourcePath) notices.push({ article, message: '尚未绑定来源，不能自动同步 Obsidian 正文；需要编辑原文时请明确绑定。' });
		}
		for (const [path, duplicates] of paths) {
			if (duplicates.length > 1) for (const article of duplicates) {
				issues.push({ article, message: `重复目标路径 ${path}，与 ${duplicates.length - 1} 篇文章冲突。请整理重名目标；修改标题不会改变路径。` });
			}
		}
		get('structure-summary').textContent = `${articles.length} 篇文章 · ${topicGroups().length} 个专题 · ${issues.length} 项问题 · ${notices.length} 项来源提示`;
		get('structure-summary').classList.toggle('workspace-error-text', issues.length > 0);
		const openButton = (article: WorkspaceArticle) => {
			const button = node('button', 'workspace-structure-open', article.title || article.targetFileName);
			button.type = 'button';
			button.addEventListener('click', () => { void run(() => openArticle(article.id)); });
			return button;
		};
		get('structure-issues').replaceChildren(...issues.map(({ article, message }) => {
			const item = node('li');
			item.append(openButton(article), node('span', 'workspace-error-text', message));
			return item;
		}));
		get('structure-notices').replaceChildren(...notices.map(({ article, message }) => {
			const item = node('li');
			item.append(openButton(article), node('span', 'workspace-help', message));
			return item;
		}));
		const articleRows = (path: string[]) => articles.filter((article) => JSON.stringify(getTopicPath(article)) === JSON.stringify(path)).map((article) => {
			const item = node('li', 'workspace-structure-article');
			item.append(openButton(article), node('code', '', articleRoute(article) || '无法生成路由'), node('span', 'workspace-state', articleStates[article.status]));
			return item;
		});
		const groups = topicGroups();
		const children = (parent: string[]): HTMLLIElement[] => groups
			.filter((group) => group.path.length === parent.length + 1 && parent.every((part, index) => group.path[index] === part))
			.map((group) => {
				const item = node('li');
				const details = preservedDetails(`structure:${JSON.stringify(group.path)}`, '');
				const summary = node('summary', 'workspace-structure-heading');
				summary.append(node('strong', '', group.path.at(-1)!), node('span', 'workspace-count', `${group.articles.length} 篇`), node('code', '', withBase(import.meta.env.BASE_URL, `/blog/topics/${getTopicSlug(group.path)}/`)));
				const list = node('ul');
				list.append(...children(group.path), ...articleRows(group.path));
				details.append(summary, list);
				item.append(details);
				return item;
			});
		const unclassified = node('li');
		const loose = articleRows([]);
		if (loose.length) {
			const details = preservedDetails('structure:unclassified', '');
			const list = node('ul');
			list.append(...loose);
			details.append(node('summary', 'workspace-structure-heading', `未分类 · ${loose.length} 篇`), list);
			unclassified.append(details);
		}
		get('structure').replaceChildren(...children([]), ...(loose.length ? [unclassified] : []));
		get('structure-empty').hidden = articles.length > 0;
	}

	function renderEditor(): void {
		const article = current();
		get('editor').hidden = !article;
		get('editor-empty').hidden = Boolean(article);
		if (!article) return syncControls();
		const edit = getEdit(article);
		if (!edit.dirty && !edit.saving) {
			edit.baseRevision = article.revision;
			edit.metadata = metadataOf(article);
			edit.conflict = false;
		}
		const values = { ...edit.metadata, topicPath: edit.metadata.topicPath.join(' / ') };
		for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
			if (fields[key].value !== values[key]) fields[key].value = values[key];
		}
		get('editor-title').textContent = article.title || article.targetFileName;
		get('article-status').textContent = articleStates[article.status];
		get('article-status').dataset.status = article.status;
		get('preparation-status').textContent = preparationStates[article.preparation.state];
		get('preparation-status').dataset.preparation = article.preparation.state;
		get('article-revision').textContent = `版本 ${article.revision}`;
		get('source-path').textContent = article.sourcePath || '尚未绑定 Obsidian 原文';
		const publishingCopy = article.sourcePath?.split(/[\\/]/).includes('博客发布');
		get('source-warning').hidden = !article.sourceMissing && !publishingCopy;
		get('source-warning').textContent = article.sourceMissing ? '原文已丢失。重新绑定有效来源后才能准备或提交。'
			: '当前绑定的是“博客发布”历史副本。比较内容后，可改绑实际写作目录中的原文；当前绑定不会自动替换。';
		get('source-summary').textContent = article.sourceMissing ? '源文件已丢失 · 请重新绑定'
			: publishingCopy ? '已绑定历史副本 · 建议改绑原文' : article.sourcePath ? '已绑定原文' : '未绑定来源 · 不自动同步 Obsidian';
		get('source-summary').classList.toggle('workspace-error-text', article.sourceMissing);
		get('target-path').textContent = article.targetPath;
		get('article-route').textContent = articleRoute(article) || '无法生成公开路由';
		get('media-id').textContent = article.mediaId;
		get('save-status').textContent = edit.saving ? '正在保存到本地工作区…'
			: edit.conflict ? '检测到版本变化。你的输入已保留，请选择如何处理。'
				: edit.error ? `尚未保存：${edit.error}`
					: edit.dirty ? '输入尚未保存，停止输入后自动保存。' : `已保存在本地工作区 · 版本 ${edit.baseRevision}`;
		get('save-status').dataset.state = edit.error || edit.conflict ? 'error' : edit.dirty || edit.saving ? 'pending' : 'success';
		get('metadata-summary').textContent = get('save-status').textContent;
		get('metadata-summary').dataset.state = get('save-status').dataset.state;
		get('conflict').hidden = !edit.conflict;
		get('conflict-current').textContent = `工作区版本 ${article.revision}：${article.title} · ${article.completion_date} · ${article.topicPath.join(' / ') || '未分类'}`;
		replaceIssues(get('article-errors'), [...new Set(article.preparation.errors.map(friendlyError))]);
		replaceIssues(get('article-warnings'), article.preparation.warnings.map(stripAnsi));
		get('article-technical').textContent = [...article.preparation.errors, ...article.preparation.warnings].map(stripAnsi).join('\n\n') || '没有原始错误或警告记录。';
		get('check-summary').textContent = `${preparationStates[article.preparation.state]} · ${article.preparation.errors.length} 个错误 / ${article.preparation.warnings.length} 个警告`;
		get('check-summary').classList.toggle('workspace-error-text', article.preparation.errors.length > 0);
		get('article-issues-empty').hidden = article.preparation.errors.length + article.preparation.warnings.length > 0;
		get('article-issues-empty').textContent = article.preparation.state === 'ready' ? '本次准备没有错误或警告。' : '尚无检查问题记录；只有准备就绪的当前版本才可提交。';
		get('preview-title').textContent = article.title || article.targetFileName;
		get('preview-description').textContent = article.description;
		get('preview-description').hidden = !article.description;
		get('preview-topic').replaceChildren(...getTopicPath(article).map((part, index) => {
			const segment = node('span', '', `${index ? ' / ' : ''}${part}`);
			return segment;
		}));
		const date = get<HTMLTimeElement>('preview-date');
		date.textContent = article.completion_date || '日期未填写';
		date.dateTime = article.completion_date;
		const dateText = (value: unknown) => typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value);
		const startDate = dateText(article.start_date);
		const endDate = dateText(article.end_date);
		get('range-value').textContent = startDate && endDate ? `${startDate} — ${endDate}` : startDate || endDate || '源笔记未提供';
		get('preview-range').hidden = !startDate && !endDate;
		get('preview-range-label').textContent = startDate && endDate ? '起止时间' : startDate ? '开始时间' : '结束时间';
		const rangeStart = get<HTMLTimeElement>('preview-start');
		rangeStart.textContent = startDate;
		rangeStart.dateTime = startDate;
		rangeStart.hidden = !startDate;
		const rangeEnd = get<HTMLTimeElement>('preview-end');
		rangeEnd.textContent = endDate;
		rangeEnd.dateTime = endDate;
		rangeEnd.hidden = !endDate;
		get('preview-range-dash').hidden = !(startDate && endDate);
		get('source-body').textContent = article.body;
		syncControls();
	}

	async function loadPreview(): Promise<void> {
		const article = current();
		if (!article) {
			disposePreview?.();
			disposePreview = null;
			previewKey = '';
			return;
		}
		const key = `${article.id}:${article.revision}:${article.preparation.state}`;
		if (previewKey === key) return;
		const preview = get('preview');
		preview.setAttribute('aria-busy', 'true');
		try {
			const result = await workspaceRequest<{ article: WorkspaceArticle; previewHtml: string }>('article', undefined, { id: article.id });
			if (disposed || selectedId !== article.id || (current()?.revision ?? 0) > result.article.revision) return;
			mergeArticle(result.article);
			if (previewHtml !== result.previewHtml || previewArticleId !== result.article.id) {
				disposePreview?.();
				disposePreview = mountWorkspacePreview(preview, lightbox, result.previewHtml);
				previewHtml = result.previewHtml;
				previewArticleId = result.article.id;
			}
			previewKey = `${result.article.id}:${result.article.revision}:${result.article.preparation.state}`;
			get('preview-error').hidden = true;
			get('preview-summary').textContent = '本地只读 · 非上线页面';
			get('preview-summary').classList.remove('workspace-error-text');
			renderEditor();
		} catch (error) {
			if (selectedId !== article.id) return;
			get('preview-error').hidden = false;
			get('preview-error').textContent = `正文预览未能读取：${errorText(error)}`;
			get('preview-summary').textContent = '预览读取失败 · 请检查本地连接';
			get('preview-summary').classList.add('workspace-error-text');
		} finally {
			preview.removeAttribute('aria-busy');
		}
	}

	function renderPending(): void {
		const pending = pendingNotes();
		for (const path of pendingSelection) if (!pending.some((entry) => entry.path === path)) pendingSelection.delete(path);
		get('pending-count').textContent = String(pending.length);
		if (!get('import-errors').children.length) get('intake-summary').textContent = `${pending.length} 篇新笔记待确认`;
		get('pending-empty').hidden = pending.length > 0;
		get('pending-list').replaceChildren(...pending.map((entry) => {
			const row = node('li', 'workspace-note-row');
			const label = node('label');
			const checkbox = node('input');
			checkbox.type = 'checkbox';
			checkbox.checked = pendingSelection.has(entry.path);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) pendingSelection.add(entry.path);
				else pendingSelection.delete(entry.path);
				syncControls();
			});
			label.append(checkbox, node('span', '', entry.relativePath));
			row.append(label, node('small', '', entry.topicPath.join(' / ') || '来源根目录'));
			return row;
		}));
	}

	function renderJobs(): void {
		const jobs = [...state?.jobs ?? []].reverse();
		get('jobs-empty').hidden = jobs.length > 0;
		const active = jobs.filter((job) => ['queued', 'running'].includes(job.state));
		const failures = jobs.filter((job) => job.state === 'failed' || job.errors.length || job.results?.some((result) => result.state === 'failed'));
		const blocked = jobs.reduce((count, job) => count + (job.results?.filter((result) => result.state === 'blocked').length ?? 0), 0);
		get('jobs-summary').replaceChildren(...[
			`${active.length} 项进行中`, `历史记录含 ${failures.length} 项失败`,
			`历史记录含 ${blocked} 条条件未满足`, `${jobs.filter((job) => job.state === 'cancelled' && !job.superseded).length} 项取消`,
			...(jobs.some((job) => job.superseded) ? [`${jobs.filter((job) => job.superseded).length} 项已替代`] : []),
		].map((text) => node('span', 'workspace-count', text)));
		get('jobs-summary').classList.toggle('workspace-error-text', failures.length > 0 || blocked > 0);
		const recent = new Set(jobs.filter((job) => !active.includes(job)).slice(0, 3));
		const latestByArticle = new Map<string, WorkspaceJob>();
		for (const job of jobs) for (const id of job.articleIds) {
			if (!latestByArticle.has(id)) latestByArticle.set(id, job);
		}
		const primary = jobs.filter((job) => active.includes(job) || recent.has(job)
			|| job.articleIds.some((id) => latestByArticle.get(id) === job
				&& state?.articles.some((article) => article.id === id && ['failed', 'blocked'].includes(article.preparation.state))));
		primary.sort((left, right) => Number(active.includes(right)) - Number(active.includes(left)));
		const history = jobs.filter((job) => !primary.includes(job));
		const jobArticleTitle = (job: WorkspaceJob, id: string) => job.results?.find((result) => result.articleId === id)?.title
			|| state?.articles.find((article) => article.id === id)?.title || '文章已不在当前工作区';
		const dateLabel = (value?: string) => {
			if (!value) return '旧任务未记录';
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? '时间记录无效' : date.toLocaleString('zh-CN', { hour12: false });
		};
		const renderJob = (job: WorkspaceJob) => {
			const item = node('li', 'workspace-job');
			const heading = node('div', 'workspace-actions');
			const title = job.articleIds.length === 1 ? `准备：${jobArticleTitle(job, job.articleIds[0]!)}`
				: job.articleIds.length ? `准备 ${job.articleIds.length} 篇文章` : '推送与部署确认';
			const status = node('span', 'workspace-state', job.superseded ? '旧版本已由新任务替代' : jobStates[job.state]);
			status.dataset.jobState = job.state;
			heading.append(node('h3', '', title), status);
			if (['queued', 'running'].includes(job.state)) {
				const cancel = node('button', 'workspace-button', '取消任务');
				cancel.type = 'button';
				cancel.dataset.workspaceLocal = '';
				cancel.addEventListener('click', () => {
					void run(async () => {
						await workspaceRequest('cancel', { id: job.id });
						announce('已请求取消任务；若 Git 关键操作已完成，将按实际结果显示。');
						await refresh();
					});
				});
				heading.append(cancel);
			}
			item.append(heading);
			item.append(node('p', 'workspace-help', `创建：${dateLabel(job.createdAt)} · 原因：${job.reason ? reasonNames[job.reason] : '旧任务未记录触发原因'}${job.finishedAt ? ` · 结束：${dateLabel(job.finishedAt)}` : ''}`));
			if (job.articleIds.length > 1) {
				item.append(node('p', 'workspace-job-articles', `${job.articleIds.slice(0, 3).map((id) => jobArticleTitle(job, id)).join('、')}${job.articleIds.length > 3 ? ` 等 ${job.articleIds.length} 篇` : ''}`));
			}
			const resultCounts = node('dl', 'workspace-job-counts');
			if (job.results) {
				for (const [key, label] of Object.entries(resultNames)) {
					const entry = node('div');
					entry.append(node('dt', '', label), node('dd', '', String(job.results.filter((result) => result.state === key).length)));
					resultCounts.append(entry);
				}
				if (active.includes(job)) {
					const pending = node('div');
					pending.append(node('dt', '', '未结束'), node('dd', '', String(Math.max(0, job.articleIds.length - job.results.length))));
					resultCounts.append(pending);
				}
				item.append(resultCounts);
			} else item.append(node('p', 'workspace-help', '旧任务未记录逐篇结果，不能核定文章就绪数；请查看文章当前版本的检查状态。'));
			const phase = String(job.progress.phase || '');
			const phaseLabel = phaseNames[phase] || (phase ? '其他阶段，见技术详情' : job.state === 'queued' ? '等待前一项任务安全完成' : '没有阶段记录');
			const currentTitle = job.progress.articleId ? jobArticleTitle(job, String(job.progress.articleId)) : '';
			item.append(node('p', 'workspace-help', `${active.includes(job) ? '当前阶段' : '最后记录阶段'}：${phaseLabel}${currentTitle ? ` · 当前文章：${currentTitle}` : ''}`));
			const completed = Number(job.progress.completed);
			const total = Number(job.progress.total);
			if (active.includes(job)) {
				const progress = node('progress', 'workspace-progress');
				progress.max = 1;
				progress.setAttribute('aria-label', phase === 'media' ? '当前文章网页附件进度' : `当前阶段：${phaseLabel}`);
				if (phase === 'media' && Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
					progress.value = Math.min(1, completed / total);
					item.append(node('p', 'workspace-help', `当前文章网页附件：${completed} / ${total} 个，不是整批文章完成数。`));
				}
				item.append(progress);
			}
			const errors = node('ul', 'workspace-messages');
			replaceIssues(errors, [...new Set([
				...job.errors.map(friendlyError),
				...job.results?.filter((result) => result.state === 'failed').map((result) => {
					const message = friendlyError(result.message || '准备失败。');
					return message.startsWith('程序环境问题') ? message : `${result.title}：${message}`;
				}) ?? [],
			])]);
			item.append(errors);
			if (job.results?.length) {
				const results = preservedDetails(`job-results:${job.id}`, 'workspace-section');
				results.append(node('summary', '', `逐篇结果 · ${job.results.length} 条`));
				const list = node('ul', 'workspace-job-results');
				list.append(...job.results.map((result) => {
					const row = node('li');
					row.append(node('strong', '', result.title || jobArticleTitle(job, result.articleId)), node('span', 'workspace-state', `版本 ${result.revision} · ${resultNames[result.state]}`));
					if (result.message) row.append(node('p', result.state === 'failed' || result.state === 'blocked' ? 'workspace-error-text' : 'workspace-help', friendlyError(result.message)));
					return row;
				}));
				results.append(list);
				item.append(results);
			}
			const technical = preservedDetails(`job-technical:${job.id}`, 'workspace-raw');
			technical.append(node('summary', '', '技术详情 · 任务编号、原始进度与错误'));
			technical.append(node('pre', '', JSON.stringify({
				id: job.id, state: job.state, revisions: job.revisions, progress: job.progress,
				errors: job.errors, results: job.results, superseded: job.superseded,
			}, (_key, value) => typeof value === 'string' ? stripAnsi(value) : value, 2)));
			item.append(technical);
			return item;
		};
		get('jobs').replaceChildren(...primary.map(renderJob));
		get('jobs-history').replaceChildren(...history.map(renderJob));
		get('jobs-history-count').textContent = `${history.length} 项 · 含 ${history.filter((job) => failures.includes(job)).length} 项历史失败；上方显示当前、最近及仍需处理的任务`;
		const publicationState = state?.publication;
		get('publication-state').textContent = publicationState ? publicationStates[publicationState.state] || publicationState.state : '尚未读取发布状态';
		get('publication-state').classList.toggle('workspace-error-text', publicationState?.state === 'failed');
		get('publication-message').textContent = publicationState?.message || '';
		get('publication-sha').textContent = publicationState?.sha || '';
		const link = get<HTMLAnchorElement>('publication-link');
		link.hidden = !publicationState?.url;
		if (publicationState?.url) link.href = publicationState.url;
	}

	function renderState(): void {
		if (!state) return;
		for (const id of selection) if (!state.articles.some((article) => article.id === id)) selection.delete(id);
		if (!state.articles.some((article) => article.id === selectedId)) selectedId = null;
		if (!configurationDirty) {
			for (const key of Object.keys(configurationFields) as (keyof typeof configurationFields)[]) configurationFields[key].value = state.configuration[key] ?? '';
		}
		get('configuration-summary').textContent = state.configured ? '工作区配置' : '先配置博客仓库与 Obsidian 来源';
		if (!state.tools.git) get('configuration-summary').textContent += ' · Git 不可用';
		get('configuration-path').textContent = state.configuration.repoRoot || '尚未配置';
		get('tools').textContent = `Git ${state.tools.git ? '可用' : '不可用'} · FFmpeg ${state.tools.ffmpeg ? '可用' : '不可用'} · ffprobe ${state.tools.ffprobe ? '可用' : '不可用'}`;
		get('configuration-needed').hidden = state.configured;
		get('local-content').hidden = !state.configured;
		renderList();
		renderStructure();
		renderEditor();
		renderPending();
		renderJobs();
		syncControls();
	}

	async function refresh(): Promise<void> {
		if (refreshTask) {
			refreshAgain = true;
			return refreshTask;
		}
		refreshTask = (async () => {
			do {
				refreshAgain = false;
				const next = await workspaceRequest<WorkspaceState>('state');
				if (disposed) return;
				next.articles = next.articles.map((article) => {
					const previous = state?.articles.find((entry) => entry.id === article.id);
					return previous && previous.revision > article.revision ? previous : article;
				});
				for (const article of next.articles) {
					const edit = edits.get(article.id);
					if (edit?.dirty && !edit.saving && edit.baseRevision !== article.revision) edit.conflict = true;
				}
				if (changes && (changes.topicRevision !== next.topics.revision || next.topics.conflict || changes.ids.some((id) => {
					const previous = state?.articles.find((article) => article.id === id);
					const article = next.articles.find((entry) => entry.id === id);
					return !article || previous?.revision !== article.revision || article.preparation.state !== 'ready' || article.status !== 'uncommitted';
				}))) commitStale = true;
				if (publication && state && (state.topics.revision !== next.topics.revision
					|| JSON.stringify(state.articles.map((article) => [article.id, article.revision, article.status]))
						!== JSON.stringify(next.articles.map((article) => [article.id, article.revision, article.status])))) publicationStale = true;
				state = next;
				available = true;
				get('unavailable').hidden = true;
				get('configuration').hidden = false;
				get('connection').textContent = connected ? bridge ? '本机工作区 · 桌面版' : '本机工作区 · 开发服务' : '工作区已读取 · 等待实时连接';
				renderState();
				await loadPreview();
			} while (refreshAgain && !disposed);
		})().finally(() => { refreshTask = null; });
		return refreshTask;
	}

	async function saveEdit(id: string): Promise<boolean> {
		const edit = edits.get(id);
		if (!edit) return true;
		if (edit.saving) {
			if (!await edit.saving) return false;
			return saveEdit(id);
		}
		if (!edit.dirty) return true;
		if (edit.conflict || !available || !connected) return false;
		window.clearTimeout(edit.timer);
		const generation = edit.generation;
		const metadata = structuredClone(edit.metadata);
		const revision = edit.baseRevision;
		edit.error = '';
		const saving = (async () => {
			try {
				const article = await workspaceRequest<WorkspaceArticle>('update', { id, revision, metadata });
				mergeArticle(article);
				edit.baseRevision = article.revision;
				if (generation === edit.generation) {
					edit.metadata = metadataOf(article);
					edit.dirty = false;
				} else edit.dirty = !sameMetadata(edit.metadata, metadataOf(article));
				if (changes?.ids.includes(id)) commitStale = true;
				if (publication) publicationStale = true;
				return true;
			} catch (error) {
				edit.error = errorText(error);
				try {
					const latest = await workspaceRequest<{ article: WorkspaceArticle }>('article', undefined, { id });
					mergeArticle(latest.article);
					edit.conflict = latest.article.revision !== revision;
				} catch {
					// Keep the user's fields when the service cannot be reached.
				}
				return false;
			} finally {
				edit.saving = null;
				renderList();
				renderEditor();
			}
		})();
		edit.saving = saving;
		renderEditor();
		const saved = await saving;
		if (saved && edit.dirty && !edit.conflict) return saveEdit(id);
		if (saved) {
			void refresh().catch((error) => announce(`字段已保存，但刷新失败：${errorText(error)}`, true));
		}
		return saved;
	}

	window.dsiWorkspaceFlush = (): Promise<void> => {
		if (flushTask) return flushTask;
		flushing = true;
		for (const edit of edits.values()) window.clearTimeout(edit.timer);
		syncControls();
		flushTask = (async () => {
			const failures: string[] = [];
			for (const [id, edit] of edits) {
				const article = state?.articles.find((entry) => entry.id === id);
				const title = article?.title || article?.targetFileName || id;
				if (edit.conflict || edit.error) {
					failures.push(`${title}：${edit.conflict ? '版本冲突未处理，你的输入仍已保留。' : edit.error}`);
					continue;
				}
				if (!edit.dirty && !edit.saving) continue;
				const saved = !disposed && await saveEdit(id);
				if (!saved || edit.dirty || edit.saving || edit.conflict || edit.error) {
					failures.push(`${title}：${edit.error || (edit.conflict ? '版本冲突未处理。' : '字段尚未保存，请检查本地服务连接后重试。')}`);
				}
			}
			try { await topicEditor.flush(); }
			catch (error) { failures.push(`专题设置：${errorText(error)}`); }
			if (failures.length) throw new Error(`关闭前保存未完成，窗口将保持打开：\n${failures.join('\n')}`);
		})().catch((error: unknown) => {
			announce(errorText(error), true);
			throw error;
		}).finally(() => {
			flushing = false;
			flushTask = null;
			syncControls();
		});
		return flushTask;
	};

	async function run(action: () => Promise<void>): Promise<void> {
		if (busy || disposed) return;
		busy = true;
		syncControls();
		try { await action(); }
		catch (error) { announce(errorText(error), true); }
		finally {
			busy = false;
			syncControls();
		}
	}

	async function importPaths(paths: string[]): Promise<void> {
		const existingIds = new Set(state?.articles.map((article) => article.id));
		const result = await workspaceRequest<{ articles: WorkspaceArticle[]; errors: { path: string; message: string }[] }>('import', { paths });
		const fresh = result.articles.filter((article) => !existingIds.has(article.id)).length;
		const existing = result.articles.length - fresh;
		announce(`已纳入 ${fresh} 篇新笔记${fresh ? '并自动排队准备' : ''}${existing ? `；${existing} 篇已存在于工作区` : ''}${result.errors.length ? `；${result.errors.length} 篇未能纳入` : ''}。`, result.errors.length > 0);
		replaceIssues(get('import-errors'), result.errors.map((error) => `${error.path}：${error.message}`));
		get('intake-summary').textContent = result.errors.length ? `${result.errors.length} 篇纳入失败` : '来源只读 · 草稿留在本机';
		get('intake-summary').classList.toggle('workspace-error-text', result.errors.length > 0);
		if (result.articles[0]) selectedId = result.articles[0].id;
		await refresh();
	}

	function scanNotes() {
		return scan?.entries.filter((entry) => entry.type === 'markdown' && !state?.articles.some((article) => article.sourcePath === entry.path)) ?? [];
	}
	function updateTree(): void {
		if (!scan) return;
		for (const checkbox of get('tree').querySelectorAll<HTMLInputElement>('input[data-note-path]')) checkbox.checked = checkbox.disabled || scanSelection.has(checkbox.dataset.notePath!);
		for (const checkbox of get('tree').querySelectorAll<HTMLInputElement>('input[data-directory-path]')) {
			const relative = checkbox.dataset.directoryPath!;
			const notes = scanNotes().filter((entry) => !relative || entry.relativePath.startsWith(`${relative}/`));
			const descendants = scan.entries.filter((entry) => entry.type === 'markdown' && (!relative || entry.relativePath.startsWith(`${relative}/`)));
			const count = descendants.filter((entry) => scanSelection.has(entry.path) || state?.articles.some((article) => article.sourcePath === entry.path)).length;
			checkbox.checked = descendants.length > 0 && count === descendants.length;
			checkbox.indeterminate = count > 0 && count < descendants.length;
			checkbox.disabled = !notes.length;
			const countLabel = checkbox.closest('summary')?.querySelector<HTMLElement>('[data-directory-count]');
			if (countLabel) countLabel.textContent = `已选 ${count} / ${descendants.length} 篇${descendants.length > notes.length ? ` · 已纳入 ${descendants.length - notes.length}` : ''}`;
		}
		syncControls();
	}
	function renderTree(): void {
		if (!scan) return;
		const tree = get('tree');
		tree.replaceChildren();
		scanSelection.clear();
		const directories = new Map<string, HTMLElement>();
		for (const entry of scan.entries) {
			const row = node('li', 'workspace-tree-entry');
			const label = node('label', 'workspace-tree-label');
			const checkbox = node('input');
			checkbox.type = 'checkbox';
			const display = entry.relativePath.split('/').at(-1) || scan.root;
			label.append(checkbox, node('span', '', display));
			checkbox.addEventListener('click', (event) => event.stopPropagation());
			label.addEventListener('click', (event) => event.stopPropagation());
			if (entry.type === 'directory') {
				const details = node('details');
				details.open = entry.relativePath === '';
				const summary = node('summary');
				const count = node('small', 'workspace-count');
				count.dataset.directoryCount = '';
				summary.append(label, count);
				const children = node('ul');
				details.append(summary, children);
				row.append(details);
				directories.set(entry.relativePath, children);
				checkbox.dataset.directoryPath = entry.relativePath;
				checkbox.setAttribute('aria-label', `选择整个目录：${display}`);
				checkbox.addEventListener('change', () => {
					for (const note of scanNotes().filter((note) => !entry.relativePath || note.relativePath.startsWith(`${entry.relativePath}/`))) {
						if (checkbox.checked) scanSelection.add(note.path);
						else scanSelection.delete(note.path);
					}
					updateTree();
				});
			} else {
				const included = Boolean(state?.articles.some((article) => article.sourcePath === entry.path));
				checkbox.dataset.notePath = entry.path;
				checkbox.disabled = included;
				checkbox.setAttribute('aria-label', `纳入笔记：${entry.relativePath}`);
				label.append(node('small', '', included ? '已纳入' : entry.topicPath.join(' / ') || '来源根目录'));
				row.append(label);
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) scanSelection.add(entry.path);
					else scanSelection.delete(entry.path);
					updateTree();
				});
			}
			const parent = entry.relativePath.includes('/') ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/')) : '';
			if (entry.relativePath) (directories.get(parent) ?? tree).append(row);
			else tree.append(row);
		}
		get('tree-root').textContent = scan.root;
		get('tree-empty').hidden = scan.entries.some((entry) => entry.type === 'markdown');
		updateTree();
	}

	async function reviewChanges(): Promise<void> {
		const ids = changes?.ids ?? [...selection];
		changes = await workspaceRequest<WorkspaceChanges>('changes', { ids });
		commitStale = false;
		get<HTMLInputElement>('commit-reviewed').checked = false;
		get('commit-head').textContent = changes.head;
		get('commit-articles').textContent = changes.ids.map((id) => state?.articles.find((article) => article.id === id)?.title || id).join('、') || '无（仅专题设置）';
		get('commit-topics').textContent = changes.topics.map((path) => path.join(' / ')).join('、') || '无';
		get('commit-file-count').textContent = `${changes.files.length} 个文件`;
		get('diffs').replaceChildren(...changes.files.map((file) => {
			const details = node('details', 'workspace-diff');
			details.open = file.kind === 'article';
			details.append(node('summary', '', `${file.path} · ${file.kind}`));
			const columns = node('div', 'workspace-diff-columns');
			const before = node('section');
			before.append(node('h3', '', '提交前'), node('pre', '', file.before === null ? '二进制资源；不包含原图。' : file.before));
			const after = node('section');
			after.append(node('h3', '', '本次提交内容'), node('pre', '', file.after));
			columns.append(before, after);
			details.append(columns);
			return details;
		}));
		get('commit-no-files').hidden = changes.files.length > 0;
		syncControls();
	}

	async function reviewPublication(): Promise<void> {
		publication = await workspaceRequest<WorkspacePublication>('publication');
		publicationStale = false;
		get<HTMLInputElement>('publication-reviewed').checked = false;
		get('publish-head').textContent = publication.head;
		get('publish-branch').textContent = publication.branch;
		get('publish-remote').textContent = publication.remote;
		get('publish-uncommitted').textContent = `${publication.uncommittedCount} 篇未提交文章、${state?.topics.dirtyPaths.length ?? 0} 项专题设置草稿不会加入本次发布。`;
		replaceIssues(get('publish-errors'), publication.errors);
		get('publish-empty').hidden = publication.ahead.length > 0;
		get('publish-commits').replaceChildren(...publication.ahead.map((commit) => {
			const item = node('li', 'workspace-publication-commit');
			item.append(node('code', '', commit.sha), node('pre', 'workspace-commit-message', commit.message));
			const paths = node('ul', 'workspace-commit-paths');
			paths.append(...commit.paths.map((path) => node('li', '', path)));
			item.append(paths);
			return item;
		}));
		syncControls();
	}

	for (const field of Object.values(fields)) field.addEventListener('input', () => {
		const article = current();
		if (!article) return;
		const edit = getEdit(article);
		edit.metadata = {
			title: fields.title.value, description: fields.description.value,
			completion_date: fields.completion_date.value, topicPath: fields.topicPath.value.trim() ? fields.topicPath.value.split('/').map((part) => part.trim()) : [],
		};
		edit.generation += 1;
		edit.dirty = edit.conflict || Boolean(edit.saving) || !sameMetadata(edit.metadata, metadataOf(article));
		edit.error = '';
		window.clearTimeout(edit.timer);
		if (edit.dirty && !edit.conflict) edit.timer = window.setTimeout(() => { void saveEdit(article.id); }, 450);
		renderList();
		get('save-status').textContent = edit.conflict ? '版本冲突尚未解决；你的输入已保留。' : '输入尚未保存…';
		get('metadata-summary').textContent = get('save-status').textContent;
		get('metadata-summary').dataset.state = edit.conflict ? 'error' : 'pending';
		syncControls();
	});
	get<HTMLFormElement>('metadata-form').addEventListener('submit', (event) => {
		event.preventDefault();
		if (selectedId) void saveEdit(selectedId);
	});
	get('conflict-reload').addEventListener('click', () => {
		const article = current();
		if (!article) return;
		const edit = getEdit(article);
		edit.dirty = false;
		edit.conflict = false;
		edit.error = '';
		renderEditor();
		announce('已放弃尚未保存的输入，采用工作区最新字段。');
	});
	get('conflict-save').addEventListener('click', () => {
		const article = current();
		if (!article) return;
		const edit = getEdit(article);
		edit.baseRevision = article.revision;
		edit.conflict = false;
		void saveEdit(article.id);
	});
	get('search').addEventListener('input', () => { page = 1; renderList(); });
	get('filter').addEventListener('change', () => { page = 1; renderList(); });
	get('page-previous').addEventListener('click', () => { page -= 1; renderList(); });
	get('page-next').addEventListener('click', () => { page += 1; renderList(); });
	get('page-size').addEventListener('change', () => {
		pageSize = Number(get<HTMLSelectElement>('page-size').value);
		page = 1;
		renderList();
	});
	get('select-page').addEventListener('click', () => {
		for (const article of pagedArticles()) selection.add(article.id);
		renderList();
	});
	get('clear-selection').addEventListener('click', () => {
		selection.clear();
		renderList();
	});
	for (const destination of ['editor', 'preview']) get(`jump-${destination}`).addEventListener('click', () => {
		const details = root.querySelector<HTMLDetailsElement>(`[data-workspace-section="${destination === 'editor' ? 'metadata' : 'preview'}"]`)!;
		details.open = true;
		details.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		if (destination === 'editor') fields.title.focus({ preventScroll: true });
		else details.querySelector('summary')?.focus({ preventScroll: true });
	});
	get('refresh').addEventListener('click', () => {
		void run(async () => {
			await workspaceRequest('sync', {});
			await refresh();
			announce('已重新检查源文件与新笔记。');
		});
	});
	get('prepare-selection').addEventListener('click', () => {
		void run(async () => {
			await workspaceRequest('prepare', { ids: [...selection] });
			announce('所选文章已排队准备；正式仓库不会被准备操作改写。');
			await refresh();
		});
	});
	get('review-commit').addEventListener('click', () => {
		void run(async () => {
			changes = null;
			get<HTMLInputElement>('commit-message').value = '';
			await reviewChanges();
			showDialog(dialogs.commit);
		});
	});
	get('review-publication').addEventListener('click', () => {
		void run(async () => {
			await reviewPublication();
			showDialog(dialogs.publish);
		});
	});
	get('reread-diffs').addEventListener('click', () => { void run(reviewChanges); });
	get('reread-publication').addEventListener('click', () => { void run(reviewPublication); });
	for (const name of ['commit-reviewed', 'commit-message', 'publication-reviewed']) get(name).addEventListener('input', syncControls);
	get<HTMLFormElement>('commit-form').addEventListener('submit', (event) => {
		event.preventDefault();
		if (!changes || commitStale || !get<HTMLInputElement>('commit-reviewed').checked) return;
		void run(async () => {
			let result: { sha: string };
			try {
				result = await workspaceRequest<{ sha: string }>('commit', { token: changes!.token, message: get<HTMLInputElement>('commit-message').value.trim() });
			} catch (error) {
				commitStale = true;
				get<HTMLInputElement>('commit-reviewed').checked = false;
				throw error;
			}
			dialogs.commit.close();
			changes = null;
			selection.clear();
			announce(`已创建本地提交 ${result.sha}；尚未推送。`);
			await refresh();
		});
	});
	get<HTMLFormElement>('publication-form').addEventListener('submit', (event) => {
		event.preventDefault();
		if (!publication || publicationStale || !get<HTMLInputElement>('publication-reviewed').checked) return;
		void run(async () => {
			let result: { sha: string; jobId: string };
			try {
				result = await workspaceRequest<{ sha: string; jobId: string }>('publish', { token: publication!.token });
			} catch (error) {
				publicationStale = true;
				get<HTMLInputElement>('publication-reviewed').checked = false;
				throw error;
			}
			dialogs.publish.close();
			publication = null;
			announce(`已确认发布提交 ${result.sha}；后台将执行非强制推送并确认部署。`);
			await refresh();
		});
	});

	for (const field of Object.values(configurationFields)) field.addEventListener('input', () => { configurationDirty = true; });
	configurationForm.addEventListener('submit', (event) => {
		event.preventDefault();
		void run(async () => {
			const values = Object.fromEntries(Object.entries(configurationFields).map(([key, field]) => [key, field.value.trim()]));
			state = await workspaceRequest<WorkspaceState>('configure', values);
			configurationDirty = false;
			announce('工作区配置已保存；已绑定原文会自动同步，新笔记等待确认。');
			renderState();
			await refresh();
		});
	});
	for (const button of root.querySelectorAll<HTMLButtonElement>('[data-workspace-pick-directory]')) button.addEventListener('click', () => {
		void run(async () => {
			if (!bridge) throw new Error('系统目录选择器仅在 DSI Admin 桌面版提供。');
			const path = await bridge.chooseDirectory();
			if (!path) return;
			const key = button.dataset.workspacePickDirectory as keyof typeof configurationFields;
			configurationFields[key].value = path;
			configurationDirty = true;
		});
	});
	get<HTMLFormElement>('credential-form').addEventListener('submit', (event) => {
		event.preventDefault();
		void run(async () => {
			if (!bridge) throw new Error('凭据只能由桌面版加密保存。');
			const field = get<HTMLInputElement>('credential');
			await bridge.setCredential(field.value.trim());
			field.value = '';
			announce('GitHub 凭据已由 Windows 加密保存在本机；界面不会回读凭据。');
		});
	});
	get('open-source').addEventListener('click', () => {
		void run(async () => {
			if (!bridge || !selectedId) throw new Error('打开原文需要桌面版与已绑定来源。');
			await bridge.openSource(selectedId);
		});
	});
	get('bind-source').addEventListener('click', () => {
		const article = current();
		if (!article) return;
		bindingId = article.id;
		const initialPath = article.sourceMissing ? '' : article.sourcePath || '';
		get<HTMLInputElement>('binding-path').value = initialPath;
		get('binding-title').textContent = article.title || article.targetFileName;
		get('binding-candidates-field').hidden = true;
		get<HTMLSelectElement>('binding-candidates').replaceChildren();
		get('binding-match-status').textContent = '正在查找文件名或标题对应的原文（忽略空格差异）…';
		showDialog(dialogs.bind);
		void run(async () => {
			const { candidates } = await workspaceRequest<WorkspaceBindingCandidates>('binding-candidates', undefined, { id: article.id })
				.catch((error: unknown) => {
					get('binding-match-status').textContent = '自动匹配未完成，可手动选择原文。';
					throw error;
				});
			if (!dialogs.bind.open || bindingId !== article.id) return;
			const field = get<HTMLInputElement>('binding-path');
			const select = get<HTMLSelectElement>('binding-candidates');
			const matchStatus = get('binding-match-status');
			const candidate = candidates[0];
			if (candidates.length > 1 || candidate && article.sourcePath && !article.sourceMissing && candidate.path !== article.sourcePath) {
				const placeholder = node('option', '', '请选择原文');
				placeholder.value = '';
				select.replaceChildren(placeholder, ...candidates.map((entry) => {
					const option = node('option', '', entry.relativePath);
					option.value = entry.path;
					return option;
				}));
				select.value = !article.sourceMissing && candidates.some((entry) => entry.path === article.sourcePath)
					? article.sourcePath || '' : '';
				get('binding-candidates-field').hidden = false;
				matchStatus.textContent = `找到 ${candidates.length} 个原文候选，请核对内容和目录后选择；当前绑定不会自动替换。`;
			} else if (candidate) {
				if ((!article.sourcePath || article.sourceMissing) && field.value === initialPath) field.value = candidate.path;
				matchStatus.textContent = `找到原文候选：${candidate.relativePath}。匹配不代表内容相同，请核对后确认绑定。`;
			} else {
				matchStatus.textContent = '没有可用的同名原文，请手动选择。选择器默认打开已绑定原文目录或配置的来源根目录。';
			}
		});
	});
	get('binding-candidates').addEventListener('change', () => {
		const path = get<HTMLSelectElement>('binding-candidates').value;
		if (path) get<HTMLInputElement>('binding-path').value = path;
	});
	get('pick-binding').addEventListener('click', () => {
		void run(async () => {
			const path = await bridge?.chooseMarkdown(bindingId ?? undefined);
			if (path) get<HTMLInputElement>('binding-path').value = path;
		});
	});
	get<HTMLFormElement>('binding-form').addEventListener('submit', (event) => {
		event.preventDefault();
		if (!bindingId) return;
		void run(async () => {
			await workspaceRequest('bind', { id: bindingId, path: get<HTMLInputElement>('binding-path').value.trim() });
			dialogs.bind.close();
			announce('来源已绑定，正文与来源元数据已同步；站点技术字段保留并自动重新准备。');
			await refresh();
		});
	});
	get('import-single').addEventListener('click', () => {
		get<HTMLInputElement>('import-path').value = '';
		showDialog(dialogs.import);
	});
	get('pick-markdown').addEventListener('click', () => {
		void run(async () => {
			const path = await bridge?.chooseMarkdown();
			if (path) get<HTMLInputElement>('import-path').value = path;
		});
	});
	get<HTMLFormElement>('import-form').addEventListener('submit', (event) => {
		event.preventDefault();
		void run(async () => {
			await importPaths([get<HTMLInputElement>('import-path').value.trim()]);
			dialogs.import.close();
		});
	});
	const drop = get('drop');
	for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, (event) => {
		event.preventDefault();
		if (bridge && canWrite()) drop.classList.add('is-drag-active');
	});
	drop.addEventListener('dragleave', (event) => {
		if (!(event.relatedTarget instanceof Node) || !drop.contains(event.relatedTarget)) drop.classList.remove('is-drag-active');
	});
	drop.addEventListener('drop', (event) => {
		event.preventDefault();
		drop.classList.remove('is-drag-active');
		void run(async () => {
			if (!bridge || !available || !connected) throw new Error('拖入真实源路径仅在桌面版可用；开发服务请使用目录树或填写完整路径。');
			const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
			if (!files.length || files.some((file) => !/\.(md|markdown)$/i.test(file.name))) throw new Error('请只拖入 Markdown 笔记；picture 附件无需单独纳入。');
			const paths = files.map((file) => bridge.pathForFile(file));
			if (paths.some((path) => !path)) throw new Error('未取得真实本机源路径，请使用系统文件选择器。');
			await importPaths(paths);
		});
	});
	get('scan-directory').addEventListener('click', () => {
		get<HTMLInputElement>('scan-path').value = state?.configuration.sourceRoot || '';
		scan = null;
		scanSelection.clear();
		get('tree').replaceChildren();
		get('tree-root').textContent = '';
		get('tree-empty').hidden = true;
		showDialog(dialogs.tree);
		syncControls();
	});
	get('pick-scan-directory').addEventListener('click', () => {
		void run(async () => {
			const path = await bridge?.chooseDirectory();
			if (path) get<HTMLInputElement>('scan-path').value = path;
		});
	});
	get<HTMLFormElement>('scan-form').addEventListener('submit', (event) => {
		event.preventDefault();
		void run(async () => {
			scan = await workspaceRequest<WorkspaceScan>('scan', { path: get<HTMLInputElement>('scan-path').value.trim() });
			renderTree();
			announce('目录已扫描。选择整个目录后仍可取消单篇笔记；picture 仅作为附件，不会纳入文章。');
		});
	});
	get('confirm-tree').addEventListener('click', () => {
		void run(async () => {
			await importPaths([...scanSelection]);
			dialogs.tree.close();
		});
	});
	for (const action of ['expand', 'collapse']) get(`tree-${action}`).addEventListener('click', () => {
		for (const details of get('tree').querySelectorAll<HTMLDetailsElement>('details')) details.open = action === 'expand';
	});
	get('select-pending').addEventListener('click', () => {
		for (const entry of pendingNotes()) pendingSelection.add(entry.path);
		renderPending();
		syncControls();
	});
	get('clear-pending').addEventListener('click', () => {
		pendingSelection.clear();
		renderPending();
		syncControls();
	});
	get('import-pending').addEventListener('click', () => {
		void run(async () => {
			await importPaths([...pendingSelection]);
			pendingSelection.clear();
			renderPending();
		});
	});
	for (const button of root.querySelectorAll<HTMLButtonElement>('[data-workspace-close-dialog]')) button.addEventListener('click', () => {
		button.closest('dialog')?.close();
	});
	for (const dialog of Object.values(dialogs)) dialog.addEventListener('cancel', (event) => {
		if (busy) event.preventDefault();
	});
	get<HTMLAnchorElement>('publication-link').addEventListener('click', (event) => {
		if (!bridge) return;
		event.preventDefault();
		void run(async () => { await bridge.openExternal(get<HTMLAnchorElement>('publication-link').href); });
	});
	get('preview').addEventListener('click', (event) => {
		const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a') : null;
		if (!bridge || !link || link.hash && link.origin === window.location.origin && link.pathname === window.location.pathname) return;
		event.preventDefault();
		void run(async () => { await bridge.openExternal(new URL(link.getAttribute('href')!, state?.configuration.siteUrl || window.location.href).href); });
	});

	function connect(): void {
		if (!localAllowed || disposed) return;
		events?.close();
		connected = false;
		events = new EventSource(`${workspacePrefix}/events`);
		get('connection').textContent = '正在连接本地工作区…';
		events.addEventListener('open', () => {
			connected = true;
			get('connection').textContent = bridge ? '本机工作区 · 桌面版' : '本机工作区 · 开发服务';
			void refresh().then(() => {
				for (const [id, edit] of edits) if (edit.dirty && !edit.conflict && !edit.error) void saveEdit(id);
			}).catch((error) => announce(errorText(error), true));
			syncControls();
		});
		events.addEventListener('change', () => {
			void refresh().catch((error) => announce(`工作区刷新失败：${errorText(error)}`, true));
		});
		events.addEventListener('error', () => {
			connected = false;
			get('connection').textContent = '实时连接已中断 · 等待服务恢复';
			syncControls();
		});
		void refresh().catch((error) => {
			events?.close();
			available = false;
			connected = false;
			get('connection').textContent = '本地服务不可用';
			get('unavailable').hidden = false;
			get('unavailable-message').textContent = errorText(error);
			syncControls();
		});
	}
	get('reconnect').addEventListener('click', connect);
	window.addEventListener('beforeunload', (event) => {
		if (!hasUnsaved()) return;
		event.preventDefault();
	});
	window.addEventListener('pagehide', () => {
		disposed = true;
		events?.close();
		disposePreview?.();
		for (const edit of edits.values()) window.clearTimeout(edit.timer);
	});
	window.addEventListener('pageshow', (event) => {
		if (!event.persisted) return;
		disposed = false;
		previewKey = '';
		previewHtml = '';
		connect();
	});
	syncControls();
	if (localAllowed) connect();
	else {
		get('connection').textContent = '静态 Admin · 无本地工作区能力';
		get('unavailable').hidden = false;
		get('unavailable-message').textContent = '这是静态站点中的 Admin 页面。导入、保存、文件选择、提交与发布需要 DSI Admin 安装版；本站不会访问你的本机目录或提供本地写入。';
	}
}
