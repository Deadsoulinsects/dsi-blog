import { normalizeMediaPath } from '../shared/content/media.mjs';
import type { MediaDocument, MediaReference } from '../shared/content/media.mjs';
import { readImageSize } from './image-size';

export type MediaAsset = {
	readonly sourceRef: string;
	readonly normalizedPath: string | null;
	readonly kind: 'image' | 'video';
	readonly status: 'missing' | 'matched' | 'unsupported';
	readonly file?: File;
	readonly objectUrl?: string;
	readonly width?: number;
	readonly height?: number;
	readonly srcset?: string;
	readonly poster?: string;
	readonly reason?: string;
};

export type MediaManifest = {
	readonly document: MediaDocument;
	readonly assets: readonly MediaAsset[];
	readonly loading: boolean;
	readonly elapsedMs: number;
};

export const summarizeMedia = (manifest: MediaManifest | null) => {
	const references = manifest?.document.references ?? [];
	const assets = manifest?.assets ?? [];
	return {
		total: references.length,
		matched: assets.filter((asset) => asset.status === 'matched').length,
		missing: assets.filter((asset) => asset.status === 'missing').length,
		unsupported: assets.filter((asset) => asset.status === 'unsupported').length,
		galleryImages: references.filter((ref) => ref.usage === 'gallery' && ref.kind === 'image').length,
		bodyImages: references.filter((ref) => ref.usage === 'body' && ref.kind === 'image').length,
		videos: references.filter((ref) => ref.kind === 'video').length,
		loading: manifest?.loading ?? false,
	};
};

const absentAsset = (reference: MediaReference): MediaAsset => ({
	sourceRef: reference.sourceRef,
	normalizedPath: reference.normalizedPath,
	kind: reference.kind,
	status: reference.normalizedPath === null ? 'unsupported' : 'missing',
	...(reference.diagnostic ? { reason: reference.diagnostic } : {}),
});

export const createMediaSession = (callbacks: {
	readonly beforeRelease: () => void;
	readonly changed: (manifest: MediaManifest | null) => void;
}) => {
	let document: MediaDocument | null = null;
	let manifest: MediaManifest | null = null;
	let generation = 0;
	let files: readonly File[] = [];
	const activeUrls = new Set<string>();

	const release = () => {
		callbacks.beforeRelease();
		for (const url of activeUrls) URL.revokeObjectURL(url);
		activeUrls.clear();
	};

	const notify = () => callbacks.changed(manifest);

	const selectFiles = async (selected: readonly File[]): Promise<void> => {
		if (!document) return;
		const currentDocument = document;
		const request = ++generation;
		const started = performance.now();
		release();
		files = selected;
		manifest = { document, assets: document.references.map(absentAsset), loading: true, elapsedMs: 0 };
		notify();

		const byPath = new Map<string, File>();
		const duplicatePaths = new Set<string>();
		for (const file of selected) {
			const { path } = normalizeMediaPath(file.webkitRelativePath);
			if (path === null) continue;
			if (byPath.has(path)) duplicatePaths.add(path);
			byPath.set(path, file);
		}
		const unique = new Map<string, MediaReference>();
		for (const reference of currentDocument.references) {
			if (reference.normalizedPath !== null) unique.set(reference.normalizedPath, reference);
		}
		const entries = [...unique];
		const matched = new Map<string, MediaAsset>();
		let cursor = 0;
		const worker = async () => {
			while (cursor < entries.length && request === generation) {
				const entry = entries[cursor++];
				if (!entry) return;
				const [path, reference] = entry;
				const file = byPath.get(path);
				if (!file) continue;
				if (duplicatePaths.has(path)) {
					matched.set(path, { ...absentAsset(reference), status: 'unsupported', reason: '所选目录中存在规范化路径冲突。' });
					continue;
				}
				try {
					const size = reference.kind === 'image' ? await readImageSize(file) : undefined;
					if (request !== generation) return;
					matched.set(path, {
						sourceRef: reference.sourceRef, normalizedPath: path, kind: reference.kind,
						status: 'matched', file, ...size,
					});
				} catch (error) {
					if (!(error instanceof DOMException)) throw error;
					matched.set(path, { ...absentAsset(reference), status: 'unsupported', reason: `附件无法读取：${error.message}` });
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
		if (request !== generation) return;
		for (const [path, asset] of matched) {
			if (asset.status !== 'matched' || !asset.file) continue;
			const objectUrl = URL.createObjectURL(asset.file);
			activeUrls.add(objectUrl);
			matched.set(path, { ...asset, objectUrl });
		}
		manifest = {
			document: currentDocument,
			assets: currentDocument.references.map((reference) =>
				reference.normalizedPath === null ? absentAsset(reference) : matched.get(reference.normalizedPath) ?? absentAsset(reference)),
			loading: false,
			elapsedMs: performance.now() - started,
		};
		notify();
	};

	return {
		getManifest: () => manifest,
		setDocument: (next: MediaDocument, resetFiles = true) => {
			generation += 1;
			document = next;
			if (!resetFiles) {
				void selectFiles(files);
				return;
			}
			release();
			files = [];
			manifest = { document, assets: document.references.map(absentAsset), loading: false, elapsedMs: 0 };
			notify();
		},
		selectFiles,
		dispose: () => {
			generation += 1;
			release();
			files = [];
			document = null;
			manifest = null;
		},
	};
};
