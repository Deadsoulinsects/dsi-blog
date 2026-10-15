import DOMPurify from 'dompurify';
import { marked, Renderer } from 'marked';
import type { MediaDocument } from '../shared/content/media.mjs';
import type { MediaAsset } from './media-session';
import { mountGalleryLayouts } from '../shared/media/gallery-layout';

// Source HTML cannot supply blob URLs. Trusted media elements are created after sanitization.
DOMPurify.addHook('uponSanitizeAttribute', (_node, attribute) => {
	if (['src', 'href', 'poster'].includes(attribute.attrName) && /^\s*blob:/iu.test(attribute.attrValue))
		attribute.keepAttr = false;
});

const missingMedia = (asset: MediaAsset | undefined, kind: 'image' | 'video'): HTMLElement => {
	const placeholder = document.createElement('div');
	placeholder.className = 'dsi-media-missing';
	placeholder.dataset.mediaStatus = asset?.status ?? 'missing';
	const text = document.createElement('span');
	text.textContent = asset?.status === 'unsupported' ? asset.reason ?? '本地附件无法使用。'
		: kind === 'video' ? '本地视频尚未提供' : '本地图片尚未提供';
	const path = document.createElement('small');
	path.textContent = asset?.sourceRef ?? '';
	placeholder.append(text, path);
	return placeholder;
};

const mediaElement = (asset: MediaAsset | undefined, alt: string, kind: 'image' | 'video'): HTMLElement => {
	if (asset?.status !== 'matched' || !asset.objectUrl) return missingMedia(asset, kind);
	if (kind === 'video') {
		const video = document.createElement('video');
		video.className = 'dsi-local-video';
		video.controls = true;
		video.preload = 'metadata';
		video.playsInline = true;
		video.src = asset.objectUrl;
		if (asset.poster) video.poster = asset.poster;
		if (asset.width && asset.height) {
			video.width = asset.width;
			video.height = asset.height;
		}
		if (alt) video.setAttribute('aria-label', alt);
		return video;
	}
	const image = document.createElement('img');
	image.className = 'dsi-local-image';
	image.alt = alt;
	image.loading = 'lazy';
	image.decoding = 'async';
	if (asset.srcset) {
		image.srcset = asset.srcset;
		image.sizes = 'auto, 100vw';
	}
	if (asset.width && asset.height) {
		image.width = asset.width;
		image.height = asset.height;
	}
	image.src = asset.objectUrl;
	return image;
};

export const renderMarkdownPreview = (root: HTMLElement, source: MediaDocument, assets: readonly MediaAsset[]): (() => void) => {
	const renderer = new Renderer();
	const defaultImage = renderer.image.bind(renderer);
	const defaultCode = renderer.code.bind(renderer);
	const slots = new Map<string, () => HTMLElement>();
	const nonce = crypto.randomUUID();
	const slot = (create: () => HTMLElement) => {
		const key = `${nonce}-${slots.size}`;
		slots.set(key, create);
		return `<span data-dsi-media-slot="${key}"></span>`;
	};
	renderer.image = (token) => {
		const index = source.imageReferences.get(token);
		if (index === undefined) return defaultImage(token);
		const reference = source.references[index];
		if (!reference) throw new TypeError('Media reference is missing.');
		return slot(() => mediaElement(assets[index], reference.alt, reference.kind));
	};
	const galleries = new Map(source.galleries.map((gallery) => [gallery.token, gallery]));
	renderer.code = (token) => {
		const gallery = galleries.get(token);
		if (!gallery) return defaultCode(token);
		return slot(() => {
			if (!gallery.model) {
				const error = document.createElement('p');
				error.className = 'dsi-media-missing';
				error.textContent = `图库内容无法解析：${gallery.diagnostics.join('；')}`;
				return error;
			}
			const container = document.createElement('div');
			container.className = 'dsi-gallery';
			container.dataset.gallery = '';
			container.dataset.targetRowHeight = String(gallery.model.targetRowHeight);
			container.dataset.galleryGap = String(gallery.model.gap);
			container.dataset.galleryCorners = String(gallery.model.corners);
			container.style.setProperty('--media-row-height', `${gallery.model.targetRowHeight}px`);
			container.style.setProperty('--media-gap', `${gallery.model.gap}px`);
			gallery.model.items.forEach((item, itemIndex) => {
				const index = gallery.referenceIndexes[itemIndex];
				if (index === undefined) throw new TypeError('Gallery reference is missing.');
				const asset = assets[index];
				const figure = document.createElement('figure');
				figure.className = 'dsi-gallery-item';
				figure.dataset.galleryItem = '';
				figure.dataset.mediaReference = String(index);
				if (asset?.width && asset.height) figure.dataset.aspectRatio = String(asset.width / asset.height);
				else if (asset?.status !== 'matched') figure.dataset.aspectRatio = '1';
				figure.style.setProperty('--media-ratio', figure.dataset.aspectRatio ?? '1');
				figure.append(mediaElement(asset, item.caption ?? '', 'image'));
				if (item.caption) {
					const caption = document.createElement('figcaption');
					caption.className = 'dsi-gallery-caption';
					caption.textContent = item.caption;
					figure.append(caption);
				}
				container.append(figure);
			});
			return container;
		});
	};
	const rendered = marked.parser(source.tokens, { renderer, gfm: true });
	root.innerHTML = DOMPurify.sanitize(rendered, {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ['style', 'video', 'audio', 'source'],
		FORBID_ATTR: ['style'],
		ALLOW_UNKNOWN_PROTOCOLS: false,
	});
	for (const [key, create] of slots) root.querySelector(`[data-dsi-media-slot="${key}"]`)?.replaceWith(create());
	root.dataset.empty = String(root.textContent?.trim() === '' && !root.querySelector('img,video'));
	for (const link of root.querySelectorAll<HTMLAnchorElement>('a')) {
		link.target = '_blank';
		link.rel = 'noreferrer noopener';
	}
	const disposeLayout = mountGalleryLayouts(root);
	root.dispatchEvent(new CustomEvent('dsi:preview-render'));
	return () => {
		disposeLayout();
		for (const video of root.querySelectorAll<HTMLVideoElement>('video')) {
			video.pause();
			video.removeAttribute('src');
			video.load();
		}
		root.replaceChildren();
	};
};
