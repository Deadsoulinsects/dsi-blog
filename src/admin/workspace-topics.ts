import { workspaceRequest } from './workspace-api';
import type { WorkspaceTopics } from './workspace-types';

interface TopicEditorOptions {
	readonly topics: () => WorkspaceTopics | undefined;
	readonly selectedPath: () => readonly string[] | null;
	readonly canWrite: () => boolean;
	readonly refresh: () => Promise<void>;
	readonly run: (action: () => Promise<void>) => Promise<void>;
	readonly changed: () => void;
}

export function initializeTopicEditor(root: HTMLElement, options: TopicEditorOptions) {
	const get = <ElementType extends Element>(name: string): ElementType => {
		const element = root.querySelector<ElementType>(`[data-workspace-${name}]`);
		if (!element) throw new TypeError(`Admin topic editor is missing ${name}`);
		return element;
	};
	const dialog = get<HTMLDialogElement>('topic-dialog');
	const field = get<HTMLTextAreaElement>('topic-description');
	const pinned = get<HTMLInputElement>('topic-pinned');
	const status = get<HTMLElement>('topic-save-status');
	let edit: { path: readonly string[]; revision: number; saved: string; savedPinned: boolean } | null = null;
	let saving: Promise<void> | null = null;
	const dirty = () => Boolean(edit && (field.value !== edit.saved || pinned.checked !== edit.savedPinned));

	function render() {
		const topics = options.topics();
		const selected = options.selectedPath();
		const conflict = Boolean(topics?.conflict || dirty() && edit && topics?.revision !== edit.revision);
		get<HTMLButtonElement>('edit-topic').disabled = !options.canWrite() || !selected?.length;
		get<HTMLElement>('topic-draft-count').textContent = `专题设置待提交 ${topics?.dirtyPaths.length ?? 0} 项`;
		get<HTMLElement>('pinned-topic').textContent = topics?.pinnedPath
			? `文章页置顶：${topics.pinnedPath.join(' / ')}` : '未置顶 · 文章页自动展示最近两个专题';
		get<HTMLElement>('topic-pin-field').hidden = edit?.path.length !== 1;
		pinned.disabled = !options.canWrite() || edit?.path.length !== 1;
		get<HTMLElement>('topic-conflict').hidden = !conflict;
		get<HTMLButtonElement>('reset-topics').disabled = !options.canWrite();
		get<HTMLButtonElement>('save-topic').disabled = !options.canWrite() || !dirty() || conflict;
		get<HTMLButtonElement>('close-topic').disabled = !options.canWrite();
		if (!edit) return;
		const current = edit;
		const latest = topics?.entries.find((entry) => JSON.stringify(entry.path) === JSON.stringify(current.path));
		if (!dirty() && latest && topics) {
			field.value = latest.description;
			edit.saved = latest.description;
			edit.revision = topics.revision;
			edit.savedPinned = JSON.stringify(topics.pinnedPath) === JSON.stringify(edit.path);
			pinned.checked = edit.savedPinned;
		}
		status.textContent = dirty() ? '输入尚未保存；关闭时会先保存本地草稿。'
			: topics?.dirtyPaths.some((path) => JSON.stringify(path) === JSON.stringify(edit?.path))
				? '已保存本地草稿 · 确认提交后才写入仓库。' : '与仓库专题设置一致。';
	}

	async function flush(): Promise<void> {
		if (saving) return saving;
		if (!edit || !dirty()) return;
		const current = edit;
		const description = field.value;
		const pin = pinned.checked;
		saving = (async () => {
			const result = await workspaceRequest<WorkspaceTopics>('update-topic', {
				path: current.path, revision: current.revision, description,
				...(current.path.length === 1 ? { pinned: pin } : {}),
			});
			current.revision = result.revision;
			const saved = result.entries.find((entry) => JSON.stringify(entry.path) === JSON.stringify(current.path))?.description ?? '';
			current.saved = saved;
			current.savedPinned = JSON.stringify(result.pinnedPath) === JSON.stringify(current.path);
			if (field.value === description) field.value = saved;
			await options.refresh();
		})().catch(async (error: unknown) => {
			await options.refresh();
			throw error;
		}).finally(() => {
			saving = null;
			options.changed();
			render();
		});
		return saving;
	}

	get<HTMLButtonElement>('edit-topic').addEventListener('click', () => {
		void options.run(async () => {
			await flush();
			const selected = options.selectedPath();
			const topics = options.topics();
			const entry = topics?.entries.find((item) => JSON.stringify(item.path) === JSON.stringify(selected));
			if (!entry || !topics) throw new Error('请选择有效专题后编辑描述。');
			edit = {
				path: entry.path, revision: topics.revision, saved: entry.description,
				savedPinned: JSON.stringify(topics.pinnedPath) === JSON.stringify(entry.path),
			};
			field.value = entry.description;
			pinned.checked = edit.savedPinned;
			get<HTMLElement>('topic-path').textContent = entry.path.join(' / ');
			const notice = dialog.querySelector<HTMLElement>('[data-workspace-dialog-status]');
			if (notice) notice.textContent = '';
			render();
			dialog.showModal();
		});
	});
	field.addEventListener('input', () => { options.changed(); render(); });
	pinned.addEventListener('change', () => { options.changed(); render(); });
	get<HTMLFormElement>('topic-form').addEventListener('submit', (event) => {
		event.preventDefault();
		void options.run(flush);
	});
	get<HTMLButtonElement>('close-topic').addEventListener('click', () => {
		void options.run(async () => { await flush(); dialog.close(); });
	});
	dialog.addEventListener('cancel', (event) => {
		event.preventDefault();
		void options.run(async () => { await flush(); dialog.close(); });
	});
	get<HTMLButtonElement>('reset-topics').addEventListener('click', () => {
		void options.run(async () => {
			await workspaceRequest('reset-topics', {});
			if (edit) { edit.saved = field.value; edit.savedPinned = pinned.checked; }
			await options.refresh();
			render();
		});
	});
	return { dirty, flush, render };
}
