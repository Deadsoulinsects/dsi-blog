import DOMPurify from 'dompurify';
import { mountGalleryLayouts } from '../shared/media/gallery-layout';
import { mountArticleLightbox } from '../shared/media/lightbox';
import { workspacePrefix } from './workspace-api';

export function mountWorkspacePreview(
	root: HTMLElement,
	dialog: HTMLDialogElement,
	html: string,
): () => void {
	root.innerHTML = DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'button', 'select', 'audio'],
		FORBID_ATTR: ['style', 'autoplay'],
		ALLOW_UNKNOWN_PROTOCOLS: false,
		SANITIZE_NAMED_PROPS: true,
	});
	for (const media of root.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLSourceElement>('img,video,source')) {
		for (const attribute of ['src', 'poster', 'data-lightbox-src']) {
			const value = media.getAttribute(attribute);
			if (!value) continue;
			const url = new URL(value, window.location.href);
			if (url.origin === window.location.origin && url.pathname.startsWith(`${workspacePrefix}/media/`)) continue;
			if (url.protocol === 'https:' && url.origin !== window.location.origin) continue;
			media.removeAttribute(attribute);
		}
		media.removeAttribute('srcset');
	}
	for (const video of root.querySelectorAll<HTMLVideoElement>('video')) {
		video.controls = true;
		video.preload = 'metadata';
		video.playsInline = true;
	}
	for (const link of root.querySelectorAll<HTMLAnchorElement>('a')) {
		if (link.getAttribute('href')?.startsWith('#')) {
			link.setAttribute('href', `#user-content-${link.getAttribute('href')!.slice(1)}`);
		} else {
			link.target = '_blank';
			link.rel = 'noreferrer noopener';
		}
	}
	root.dataset.empty = String(!root.textContent?.trim() && !root.querySelector('img,video'));
	const shell = root.closest<HTMLElement>('.article-shell')!;
	const headings = [...root.querySelectorAll<HTMLElement>('h2,h3')];
	const toc = shell.querySelector<HTMLDetailsElement>('[data-workspace-preview-toc]')!;
	const tocLinks = shell.querySelector<HTMLElement>('[data-workspace-preview-toc-links]')!;
	const navigate = (event: Event) => {
		const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a') : null;
		if (!link?.hash || link.origin !== window.location.origin || link.pathname !== window.location.pathname) return;
		let id: string;
		try { id = decodeURIComponent(link.hash.slice(1)); }
		catch { return; }
		const target = root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
		if (!target) return;
		event.preventDefault();
		target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	};
	tocLinks.replaceChildren(...headings.map((heading, index) => {
		if (!heading.id) heading.id = `user-content-preview-section-${index}`;
		const item = document.createElement('li');
		item.classList.toggle('nested', heading.tagName === 'H3');
		const link = document.createElement('a');
		link.href = `#${heading.id}`;
		link.textContent = heading.textContent;
		item.append(link);
		return item;
	}));
	toc.hidden = headings.length === 0;
	shell.querySelector('[data-workspace-preview-grid]')!.classList.toggle('has-toc', headings.length > 0);
	shell.querySelector('[data-workspace-preview-headings]')!.textContent = String(headings.length);
	shell.querySelector('[data-workspace-preview-toc-count]')!.textContent = `${headings.length} 节`;
	root.addEventListener('click', navigate);
	tocLinks.addEventListener('click', navigate);
	const disposeLayout = mountGalleryLayouts(root);
	const disposeLightbox = mountArticleLightbox(root, dialog);
	return () => {
		disposeLightbox();
		disposeLayout();
		root.removeEventListener('click', navigate);
		tocLinks.removeEventListener('click', navigate);
		for (const video of root.querySelectorAll<HTMLVideoElement>('video')) {
			video.pause();
			video.removeAttribute('src');
			video.querySelectorAll('source').forEach((source) => source.removeAttribute('src'));
			video.load();
		}
		root.replaceChildren();
	};
}
