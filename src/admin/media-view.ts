import { summarizeMedia } from './media-session';
import type { MediaManifest } from './media-session';

export const collectMediaElements = (root: HTMLElement) => {
	const section = root.querySelector<HTMLElement>('[data-admin-media]');
	const input = root.querySelector<HTMLInputElement>('[data-admin-media-input]');
	const status = root.querySelector<HTMLElement>('[data-admin-media-status]');
	const list = root.querySelector<HTMLUListElement>('[data-admin-media-list]');
	if (!section || !input || !status || !list) throw new TypeError('Admin media markup is missing.');
	return { root, section, input, status, list };
};

export const renderMediaState = (elements: ReturnType<typeof collectMediaElements>, manifest: MediaManifest | null): void => {
	const summary = summarizeMedia(manifest);
	elements.section.hidden = summary.total === 0;
	elements.input.disabled = manifest === null || summary.total === 0 || summary.loading;
	for (const key of ['total', 'matched', 'missing', 'unsupported', 'galleryImages', 'bodyImages', 'videos'] as const) {
		const output = elements.section.querySelector<HTMLElement>(`[data-media-count="${key}"]`);
		if (output) output.textContent = String(summary[key]);
	}
	elements.status.textContent = summary.loading ? '正在匹配所选目录；只读取图片头部，不上传文件。'
		: summary.unsupported > 0 ? `${summary.unsupported} 个附件路径或格式无法使用。`
			: summary.missing > 0 ? `仍缺少 ${summary.missing} 个附件。请选择包含完整引用路径的文件夹，不按文件名猜测。`
				: `${summary.matched} / ${summary.total} 已匹配；媒体仅存在于本次浏览器会话。`;
	elements.list.replaceChildren();
	for (const asset of manifest?.assets ?? []) {
		if (asset.status === 'matched') continue;
		const item = document.createElement('li');
		item.textContent = asset.reason ? `${asset.sourceRef}：${asset.reason}` : asset.sourceRef;
		elements.list.append(item);
	}
	const details = elements.list.closest<HTMLDetailsElement>('details');
	if (details) details.hidden = summary.missing + summary.unsupported === 0;
	elements.root.dispatchEvent(new CustomEvent('dsi:media-change', {
		detail: { ...summary, elapsedMs: manifest?.elapsedMs ?? 0 },
	}));
};
