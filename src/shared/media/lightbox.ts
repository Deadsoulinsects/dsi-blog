export function mountArticleLightbox(root: HTMLElement, dialog: HTMLDialogElement): () => void {
	const stage = dialog.querySelector<HTMLElement>('[data-lightbox-stage]');
	const image = dialog.querySelector<HTMLImageElement>('[data-lightbox-image]');
	const caption = dialog.querySelector<HTMLElement>('[data-lightbox-caption]');
	const counter = dialog.querySelector<HTMLElement>('[data-lightbox-counter]');
	const zoomLabel = dialog.querySelector<HTMLElement>('[data-lightbox-zoom]');
	const status = dialog.querySelector<HTMLElement>('[data-lightbox-status]');
	const previous = dialog.querySelector<HTMLButtonElement>('[data-lightbox-previous]');
	const next = dialog.querySelector<HTMLButtonElement>('[data-lightbox-next]');
	const reset = dialog.querySelector<HTMLButtonElement>('[data-lightbox-reset]');
	const close = dialog.querySelector<HTMLButtonElement>('[data-lightbox-close]');
	if (!stage || !image || !caption || !counter || !zoomLabel || !status || !previous || !next || !reset || !close)
		return () => {};

	const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
	const controller = new AbortController();
	const { signal } = controller;
	let index = 0;
	let zoom = 1;
	let x = 0;
	let y = 0;
	let width = 0;
	let height = 0;
	let trigger: HTMLImageElement | null = null;
	let scrollOverflow = '';
	let drag: { readonly id: number; readonly x: number; readonly y: number } | null = null;

	const paint = () => {
		const limitX = Math.max(0, (width * zoom - stage.clientWidth) / 2);
		const limitY = Math.max(0, (height * zoom - stage.clientHeight) / 2);
		x = Math.min(limitX, Math.max(-limitX, x));
		y = Math.min(limitY, Math.max(-limitY, y));
		image.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${zoom})`;
		stage.dataset.pannable = String(limitX > 0 || limitY > 0);
		zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
	};
	const restore = () => {
		zoom = 1;
		x = 0;
		y = 0;
		paint();
	};
	const fit = () => {
		if (image.hidden || !image.naturalWidth || !dialog.open) return;
		const scale = Math.min(1, stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight);
		width = image.naturalWidth * scale;
		height = image.naturalHeight * scale;
		image.style.width = `${width}px`;
		image.style.height = `${height}px`;
		restore();
	};
	const finishDrag = () => {
		if (drag && stage.hasPointerCapture(drag.id)) stage.releasePointerCapture(drag.id);
		drag = null;
		stage.dataset.dragging = 'false';
	};
	const showImage = (selected: number) => {
		const source = images[selected];
		if (!source) return;
		index = selected;
		finishDrag();
		restore();
		image.hidden = true;
		status.textContent = '正在加载图片…';
		caption.textContent = source.closest('figure')?.querySelector('figcaption')?.textContent?.trim()
			|| source.title.trim() || source.alt.trim();
		caption.hidden = !caption.textContent;
		counter.textContent = `${index + 1} / ${images.length}`;
		previous.disabled = index === 0;
		next.disabled = index === images.length - 1;
		image.alt = source.alt;
		// Prepared media's src is the largest web derivative, unlike currentSrc's thumbnail.
		image.src = source.dataset.lightboxSrc || source.src;
	};
	const open = (selected: number) => {
		trigger = images[selected] ?? null;
		scrollOverflow = document.documentElement.style.overflow;
		dialog.showModal();
		document.documentElement.style.overflow = 'hidden';
		showImage(selected);
	};

	image.addEventListener('load', () => {
		image.hidden = false;
		status.textContent = '';
		fit();
	}, { signal });
	image.addEventListener('error', () => {
		image.hidden = true;
		status.textContent = '图片加载失败，请切换图片或关闭后重试。';
	}, { signal });
	close.addEventListener('click', () => dialog.close(), { signal });
	dialog.addEventListener('close', () => {
		finishDrag();
		document.documentElement.style.overflow = scrollOverflow;
		trigger?.focus({ preventScroll: true });
	}, { signal });
	reset.addEventListener('click', restore, { signal });
	stage.addEventListener('dblclick', restore, { signal });
	previous.addEventListener('click', () => showImage(index - 1), { signal });
	next.addEventListener('click', () => showImage(index + 1), { signal });
	dialog.addEventListener('keydown', (event) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === 'Tab') {
			const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
			const first = controls[0];
			const last = controls.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		}
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			showImage(index + (event.key === 'ArrowLeft' ? -1 : 1));
		}
	}, { signal });
	stage.addEventListener('wheel', (event) => {
		event.preventDefault();
		if (image.hidden) return;
		const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
		const nextZoom = Math.min(8, Math.max(1, zoom * Math.exp(-delta * 0.002)));
		const bounds = stage.getBoundingClientRect();
		const pointerX = event.clientX - bounds.left - bounds.width / 2;
		const pointerY = event.clientY - bounds.top - bounds.height / 2;
		x = pointerX - (pointerX - x) * nextZoom / zoom;
		y = pointerY - (pointerY - y) * nextZoom / zoom;
		zoom = nextZoom;
		paint();
	}, { passive: false, signal });
	stage.addEventListener('pointerdown', (event) => {
		if (event.button !== 0 || !event.isPrimary || stage.dataset.pannable !== 'true') return;
		event.preventDefault();
		drag = { id: event.pointerId, x: event.clientX - x, y: event.clientY - y };
		stage.setPointerCapture(event.pointerId);
		stage.dataset.dragging = 'true';
	}, { signal });
	stage.addEventListener('pointermove', (event) => {
		if (!drag || drag.id !== event.pointerId) return;
		x = event.clientX - drag.x;
		y = event.clientY - drag.y;
		paint();
	}, { signal });
	stage.addEventListener('pointerup', finishDrag, { signal });
	stage.addEventListener('pointercancel', finishDrag, { signal });
	stage.addEventListener('lostpointercapture', () => {
		drag = null;
		stage.dataset.dragging = 'false';
	}, { signal });
	const observer = new ResizeObserver(fit);
	observer.observe(stage);

	const attributes = ['role', 'tabindex', 'aria-haspopup', 'aria-label', 'data-lightbox-trigger'] as const;
	const originals = images.map((source) => attributes.map((name) => source.getAttribute(name)));
	for (const [selected, source] of images.entries()) {
		source.setAttribute('role', 'button');
		source.setAttribute('tabindex', '0');
		source.setAttribute('aria-haspopup', 'dialog');
		source.setAttribute('aria-label', `放大图片${source.alt ? `：${source.alt}` : ''}`);
		source.dataset.lightboxTrigger = '';
		source.addEventListener('click', (event) => {
			if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
			event.preventDefault();
			open(selected);
		}, { signal });
		source.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			event.stopPropagation();
			open(selected);
		}, { signal });
	}
	return () => {
		if (dialog.open) {
			dialog.close();
			document.documentElement.style.overflow = scrollOverflow;
		}
		finishDrag();
		controller.abort();
		observer.disconnect();
		for (const [selected, source] of images.entries()) {
			for (const [position, name] of attributes.entries()) {
				const value = originals[selected]?.[position];
				if (value === null || value === undefined) source.removeAttribute(name);
				else source.setAttribute(name, value);
			}
		}
	};
}
