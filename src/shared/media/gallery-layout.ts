export interface JustifiedRow {
	readonly start: number;
	readonly count: number;
	readonly height: number;
	readonly widths: readonly number[];
	readonly complete: boolean;
}

export function computeJustifiedRows(
	ratios: readonly number[],
	containerWidth: number,
	targetRowHeight: number,
	gap: number,
): readonly JustifiedRow[] {
	if (containerWidth <= 0) return [];

	const rows: JustifiedRow[] = [];
	let start = 0;

	while (start < ratios.length) {
		let end = start;
		let totalRatio = 0;

		while (end < ratios.length) {
			const count = end - start + 1;
			const availableWidth = containerWidth - gap * (count - 1);
			if (count > 1 && availableWidth <= 0) break;

			const nextRatio = totalRatio + ratios[end];
			const nextHeight = availableWidth / nextRatio;
			if (count > 1 && nextHeight <= targetRowHeight) {
				const previousHeight = (containerWidth - gap * (count - 2)) / totalRatio;
				if (previousHeight - targetRowHeight < targetRowHeight - nextHeight) break;
			}

			totalRatio = nextRatio;
			end += 1;
			if (nextHeight <= targetRowHeight) break;
		}

		const count = end - start;
		const fittedHeight = (containerWidth - gap * (count - 1)) / totalRatio;
		const complete = end < ratios.length || fittedHeight <= targetRowHeight;
		// Round inward together, keeping every image's original aspect ratio.
		const height = (complete ? fittedHeight : Math.min(targetRowHeight, fittedHeight))
			* (1 - Number.EPSILON * count);
		const widths = ratios.slice(start, end).map((ratio) => ratio * height);
		rows.push({ start, count, height, widths, complete });
		start = end;
	}

	return rows;
}

interface GalleryLayout {
	readonly element: HTMLElement;
	readonly items: readonly HTMLElement[];
	readonly ratios: number[];
	readonly targetRowHeight: number;
	readonly gap: number;
	readonly corners: number;
	width: number;
}

export function mountGalleryLayouts(root: HTMLElement): () => void {
	const layouts = Array.from(root.querySelectorAll<HTMLElement>('[data-gallery]'), (element): GalleryLayout => {
		const items = Array.from(element.querySelectorAll<HTMLElement>(':scope > [data-gallery-item]'));
		return {
			element,
			items,
			ratios: items.map((item) => Number(item.dataset.aspectRatio ?? 1)),
			targetRowHeight: Number(element.dataset.targetRowHeight),
			gap: Number(element.dataset.galleryGap),
			corners: Number(element.dataset.galleryCorners),
			width: -1,
		};
	});
	const byElement = new Map<Element, GalleryLayout>(layouts.map((layout) => [layout.element, layout]));
	const pending = new Map<GalleryLayout, number>();
	let frame = 0;

	const flush = () => {
		frame = 0;
		for (const [layout, width] of pending) {
			layout.width = width;
			layout.element.style.gap = `${layout.gap}px`;
			for (const item of layout.items) item.style.borderRadius = `${layout.corners}px`;
			const rows = computeJustifiedRows(layout.ratios, width, layout.targetRowHeight, layout.gap);
			for (const row of rows) {
				row.widths.forEach((itemWidth, index) => {
					const item = layout.items[row.start + index];
					item.style.width = `${itemWidth}px`;
					item.style.height = `${row.height}px`;
				});
			}
		}
		pending.clear();
	};

	const schedule = () => {
		if (frame === 0 && pending.size > 0) frame = requestAnimationFrame(flush);
	};
	const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver((entries) => {
		for (const entry of entries) {
			const layout = byElement.get(entry.target)!;
			const width = entry.contentRect.width;
			if (width === layout.width) pending.delete(layout);
			else pending.set(layout, width);
		}
		schedule();
	});

	const updateLoadedImage = (image: HTMLImageElement) => {
		const item = image.closest<HTMLElement>('[data-gallery-item]');
		if (!item || item.dataset.aspectRatio !== undefined || image.naturalWidth === 0 || image.naturalHeight === 0) return;

		const layout = byElement.get(item.parentElement!)!;
		const ratio = image.naturalWidth / image.naturalHeight;
		item.dataset.aspectRatio = String(ratio);
		layout.ratios[layout.items.indexOf(item)] = ratio;
		const width = pending.get(layout) ?? layout.width;
		layout.width = -1;
		pending.set(layout, width);
		schedule();
	};
	const onImageLoad = (event: Event) => {
		if (event.target instanceof HTMLImageElement) updateLoadedImage(event.target);
	};
	root.addEventListener('load', onImageLoad, true);

	// All initial measurements precede the first animation-frame DOM writes.
	for (const layout of layouts) pending.set(layout, layout.element.getBoundingClientRect().width);
	for (const layout of layouts) {
		observer?.observe(layout.element);
		for (const item of layout.items) {
			const image = item.querySelector<HTMLImageElement>('img');
			if (image?.complete) updateLoadedImage(image);
		}
	}
	schedule();

	return () => {
		root.removeEventListener('load', onImageLoad, true);
		observer?.disconnect();
		cancelAnimationFrame(frame);
		frame = 0;
		pending.clear();
	};
}
