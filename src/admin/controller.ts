import { createAdminDraft, updateAdminDraft } from './content';
import type { AdminDraft, AdminDraftUpdate } from './content';
import type { ContentFile } from '../shared/content/links.mjs';
import { discoverMedia } from '../shared/content/media.mjs';
import { renderMarkdownPreview } from './preview';
import { editableText, renderDraftState } from './draft-view';
import { createMediaSession } from './media-session';
import type { MediaManifest } from './media-session';
import { collectMediaElements, renderMediaState } from './media-view';
import { initializeLocalPreparation } from './local-preparation';

type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

const requiredElement = <ElementType extends Element>(root: ParentNode, selector: string): ElementType => {
	const element = root.querySelector<ElementType>(selector);
	if (!element) throw new TypeError(`Admin markup is missing ${selector}`);
	return element;
};

const collectElements = (root: HTMLElement) => ({
	dropZone: requiredElement<HTMLElement>(root, '[data-admin-drop-zone]'),
	fileInput: requiredElement<HTMLInputElement>(root, '[data-admin-file-input]'),
	workspace: requiredElement<HTMLElement>(root, '[data-admin-workspace]'),
	importStatus: requiredElement<HTMLElement>(root, '[data-admin-import-status]'),
	readiness: requiredElement<HTMLElement>(root, '[data-admin-readiness-state]'),
	readinessTitle: requiredElement<HTMLElement>(root, '[data-admin-readiness-title]'),
	readinessCopy: requiredElement<HTMLElement>(root, '[data-admin-readiness-copy]'),
	titleInput: requiredElement<HTMLInputElement>(root, '[data-admin-field="title"]'),
	descriptionInput: requiredElement<HTMLTextAreaElement>(root, '[data-admin-field="description"]'),
	dateInput: requiredElement<HTMLInputElement>(root, '[data-admin-field="completion_date"]'),
	topicInput: requiredElement<HTMLInputElement>(root, '[data-admin-field="topic"]'),
	targetFileInput: requiredElement<HTMLInputElement>(root, '[data-admin-field="targetFileName"]'),
	sourceFile: requiredElement<HTMLElement>(root, '[data-admin-source-file]'),
	slug: requiredElement<HTMLElement>(root, '[data-admin-slug]'),
	path: requiredElement<HTMLElement>(root, '[data-admin-path]'),
	blockingList: requiredElement<HTMLUListElement>(root, '[data-admin-blocking-list]'),
	requirementsList: requiredElement<HTMLUListElement>(root, '[data-admin-requirements-list]'),
	previewTitle: requiredElement<HTMLElement>(root, '[data-admin-preview-title]'),
	previewDescription: requiredElement<HTMLElement>(root, '[data-admin-preview-description]'),
	preview: requiredElement<HTMLElement>(root, '[data-admin-preview]'),
});

export type AdminElements = ReturnType<typeof collectElements>;

export const initializeAdminController = (): void => {
	const root = document.querySelector<HTMLElement>('[data-admin-page]');
	if (!root) return;

	const elements = collectElements(root);
	const filePaths: unknown = JSON.parse(root.dataset.adminContentFiles ?? '[]');
	if (!Array.isArray(filePaths) || !filePaths.every((path) => typeof path === 'string'))
		throw new TypeError('Admin content index must contain file paths.');
	const contentFiles: readonly ContentFile[] = filePaths.map((path: string) => ({
		path,
		collection: path.startsWith('src/content/blog/') ? 'blog' : 'docs',
	}));
	let draft: AdminDraft | null = null;
	let importRevision = 0;
	let renderedBody: string | null = null;
	let renderedManifest: MediaManifest | null = null;
	let disposePreview: (() => void) | null = null;
	const mediaElements = collectMediaElements(root);
	mediaElements.input.webkitdirectory = true;
	const mediaSession = createMediaSession({
		beforeRelease: () => {
			disposePreview?.();
			disposePreview = null;
			renderedBody = null;
			renderedManifest = null;
		},
		changed: (manifest) => {
			if (draft) {
				renderDraftState(elements, draft, manifest);
				if (manifest && (renderedBody !== draft.body || renderedManifest !== manifest)) {
					disposePreview?.();
					disposePreview = renderMarkdownPreview(elements.preview, manifest.document, manifest.assets);
					renderedBody = draft.body;
					renderedManifest = manifest;
				}
			}
			renderMediaState(mediaElements, manifest);
		},
	});
	mediaElements.input.addEventListener('change', () => {
		if (mediaElements.input.files) void mediaSession.selectFiles(Array.from(mediaElements.input.files));
	});
	window.addEventListener('pagehide', () => mediaSession.dispose());
	window.addEventListener('pageshow', (event) => {
		if (!event.persisted || !draft) return;
		mediaElements.input.value = '';
		mediaSession.setDocument(discoverMedia(draft.body));
	});

	const setImportStatus = (message: string, status: ImportStatus): void => {
		elements.importStatus.textContent = message;
		elements.importStatus.dataset.state = status;
	};

	const commitDraft = (update: AdminDraftUpdate): void => {
		const currentDraft = draft;
		if (!currentDraft) return;
		const nextDraft = updateAdminDraft(currentDraft, update);
		draft = nextDraft;
		if (nextDraft.titleFromFileName) elements.titleInput.value = editableText(nextDraft.metadata.title);
		if (currentDraft.body !== nextDraft.body) mediaSession.setDocument(discoverMedia(nextDraft.body), false);
		else renderDraftState(elements, nextDraft, mediaSession.getManifest());
	};

	const loadDraft = (fileName: string, sourceText: string, lastModified?: number): void => {
		const replacingDraft = draft !== null;
		const nextDraft = createAdminDraft(fileName, sourceText, { contentFiles, lastModified });
		draft = nextDraft;
		elements.titleInput.value = editableText(nextDraft.metadata.title);
		elements.descriptionInput.value = editableText(nextDraft.metadata.description);
		elements.dateInput.value = editableText(nextDraft.metadata.completion_date);
		elements.topicInput.value = editableText(nextDraft.metadata.topic);
		elements.targetFileInput.value = nextDraft.targetFileName;
		mediaElements.input.value = '';
		mediaSession.setDocument(discoverMedia(nextDraft.body));
		elements.workspace.hidden = false;
		setImportStatus(
			replacingDraft ? `已用“${fileName}”替换浏览器内草稿。` : `已导入“${fileName}”；草稿只保留在当前页面内存中。`,
			'success',
		);
	};
	const localPreparation = initializeLocalPreparation(root, (fileName, sourceText) => {
		++importRevision;
		loadDraft(fileName, sourceText);
	});

	const importFiles = (files: FileList | null): void => {
		if (!files || files.length === 0) return;
		const revision = ++importRevision;
		const unchangedMessage = draft ? '当前草稿未更改。' : '未创建草稿。';

		if (files.length !== 1) {
			setImportStatus(`一次只能导入一个 Markdown 文件；${unchangedMessage}`, 'error');
			return;
		}

		const file = files.item(0);
		if (!file) return;
		if (!file.name.toLowerCase().endsWith('.md')) {
			setImportStatus(`只接受扩展名为 .md 的文件；${unchangedMessage}`, 'error');
			return;
		}

		setImportStatus(`正在读取“${file.name}”…`, 'loading');
		void file.text().then(
			(sourceText) => {
				if (revision !== importRevision) return;
				localPreparation.invalidate();
				loadDraft(file.name, sourceText, file.lastModified);
			},
			() => {
				if (revision !== importRevision) return;
				setImportStatus(`无法读取“${file.name}”；${unchangedMessage}`, 'error');
			},
		);
	};

	elements.fileInput.addEventListener('change', () => {
		importFiles(elements.fileInput.files);
		elements.fileInput.value = '';
	});
	elements.titleInput.addEventListener('input', () => commitDraft({ metadata: { title: elements.titleInput.value } }));
	elements.descriptionInput.addEventListener('input', () => commitDraft({ metadata: { description: elements.descriptionInput.value } }));
	elements.dateInput.addEventListener('input', () => commitDraft({ metadata: { completion_date: elements.dateInput.value } }));
	elements.topicInput.addEventListener('input', () => commitDraft({ metadata: { topic: elements.topicInput.value } }));
	elements.targetFileInput.addEventListener('input', () => commitDraft({ targetFileName: elements.targetFileInput.value }));

	for (const eventName of ['dragenter', 'dragover']) {
		elements.dropZone.addEventListener(eventName, (event) => {
			event.preventDefault();
			elements.dropZone.classList.add('is-drag-active');
		});
	}
	elements.dropZone.addEventListener('dragleave', (event) => {
		if (event.relatedTarget instanceof Node && elements.dropZone.contains(event.relatedTarget)) return;
		elements.dropZone.classList.remove('is-drag-active');
	});
	elements.dropZone.addEventListener('drop', (event) => {
		event.preventDefault();
		elements.dropZone.classList.remove('is-drag-active');
		importFiles(event.dataTransfer?.files ?? null);
	});
};
