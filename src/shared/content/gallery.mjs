/**
 * @typedef {object} GalleryItem
 * @property {string} sourceRef Raw Unicode attachment path.
 * @property {string} [caption]
 *
 * @typedef {object} GalleryModel
 * @property {'justified'} layout
 * @property {number} targetRowHeight
 * @property {number} gap
 * @property {number} corners
 * @property {GalleryItem[]} items
 *
 * @typedef {object} GalleryResult
 * @property {GalleryModel | null} model
 * @property {string[]} diagnostics
 */

/**
 * Parse the supported simple-gallery subset, without recovering ambiguous syntax.
 * Captions are literal text, not YAML or Markdown.
 * @param {string} source
 * @returns {GalleryResult}
 */
export function parseGallery(source) {
	/** @type {GalleryModel} */
	const model = { layout: 'justified', targetRowHeight: 240, gap: 8, corners: 0, items: [] };
	/** @type {string[]} */
	const diagnostics = [];
	const configured = new Set();
	const lines = source.split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		if (!line.trim()) continue;
		const fail = (/** @type {string} */ message) => diagnostics.push(`Line ${index + 1}: ${message}`);
		const item = /^- !\[\[([^\]|\r\n[]+)\]\][ \t]*$/.exec(line);
		if (item) {
			if (!item[1].trim()) fail('Empty attachment path.');
			else model.items.push({ sourceRef: item[1] });
			continue;
		}
		const caption = /^[ \t]+caption:[ \t]*(.*)$/.exec(line);
		if (caption) {
			const previous = model.items.at(-1);
			if (!previous) fail('Caption requires a preceding item.');
			else if (previous.caption !== undefined) fail('Duplicate caption.');
			else previous.caption = caption[1].trimEnd();
			continue;
		}
		const config = /^([a-z][a-z-]*):[ \t]*(.*?)[ \t]*$/.exec(line);
		if (!config) {
			fail('Unsupported gallery item or syntax.');
			continue;
		}
		const [, key, value] = config;
		if (!['layout', 'min-size', 'gap', 'corners'].includes(key)) {
			fail(`Unknown configuration "${key}".`);
			continue;
		}
		if (model.items.length) fail('Configuration must precede items.');
		if (configured.has(key)) fail(`Duplicate configuration "${key}".`);
		configured.add(key);
		if (key === 'layout') {
			if (value !== 'justified') fail('Only layout: justified is supported.');
			continue;
		}
		const number = Number(value);
		if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(number)
			|| (key === 'min-size' && number <= 0) || (key === 'corners' && number !== 0)) {
			fail(`Invalid numeric value for "${key}".`);
			continue;
		}
		if (key === 'min-size') model.targetRowHeight = number;
		else if (key === 'gap') model.gap = number;
		else model.corners = number;
	}
	if (!model.items.length) diagnostics.push('Gallery requires at least one item.');
	return { model: diagnostics.length ? null : model, diagnostics };
}
