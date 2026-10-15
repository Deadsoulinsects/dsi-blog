import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { classifyMediaReference } from './media.mjs';
import { parseGallery } from './gallery.mjs';
import { resolveWebMedia } from './web-media.mjs';

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const attrs = (values) => Object.entries(values)
	.filter(([, value]) => value !== undefined)
	.map(([name, value]) => ` ${name}="${escape(value)}"`).join('');
const contained = (root, path) => {
	const suffix = relative(root, path);
	return suffix !== '..' && !suffix.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
		&& !isAbsolute(suffix);
};

/**
 * Astro remark plugin. The caller validates the imported manifest at its boundary.
 * Derivative bytes and referenced assets are cached for this processor's lifetime.
 * @param {{manifest: import('./web-media.mjs').WebMediaManifest, publicDir: string, base?: string}} options
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
export function remarkWebMedia({ manifest, publicDir, base = '/' }) {
	const root = resolve(publicDir);
	const files = new Map();
	const assets = new Map();
	let canonicalRoot;
	const verifyFile = (variant) => {
		if (!files.has(variant.url)) files.set(variant.url, (async () => {
			if (variant.url !== `/media/${variant.sha256}.${variant.type === 'image/webp' ? 'webp' : 'mp4'}`)
				throw new Error(`Invalid prepared media URL: ${variant.url}`);
			const path = resolve(root, variant.url.slice(1));
			if (!contained(root, path)) throw new Error(`Prepared media escapes publicDir: ${variant.url}`);
			canonicalRoot ??= realpath(root);
			if (!contained(await canonicalRoot, await realpath(path)))
				throw new Error(`Prepared media escapes publicDir: ${variant.url}`);
			const bytes = await readFile(path);
			return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
		})());
		return files.get(variant.url).then((actual) => {
			if (actual.bytes !== variant.bytes || actual.sha256 !== variant.sha256)
				throw new Error(`Corrupt prepared media: ${variant.url}`);
		});
	};
	const verifyAsset = (id) => {
		if (!assets.has(id)) {
			const asset = manifest.assets[id];
			assets.set(id, Promise.all([...asset.variants, ...(asset.poster ? [asset.poster] : [])].map(verifyFile)));
		}
		return assets.get(id);
	};
	return async (tree, file) => {
		const id = file.data.astro?.frontmatter?.mediaId;
		const optedIn = id !== undefined;
		if (optedIn && (typeof id !== 'string' || !Object.hasOwn(manifest.documents, id)))
			throw new Error(`Unknown article mediaId: ${id}`);
		const definitions = new Map();
		const key = (value) => value.replace(/\s+/g, ' ').toUpperCase();
		const collect = (node) => {
			if (node.type === 'definition' && !definitions.has(key(node.identifier)))
				definitions.set(key(node.identifier), node);
			for (const child of node.children ?? []) collect(child);
		};
		collect(tree);
		let index = 0;
		const render = async (sourceRef, usage, alt) => {
			// Root-relative public URLs are not vault attachment identities.
			if (usage === 'body' && sourceRef.startsWith('/') && !sourceRef.startsWith('//')) {
				const path = decodeURIComponent(sourceRef.split(/[?#]/, 1)[0]).replace(/\\/g, '/');
				if (!path.split('/').includes('..')) return null;
			}
			const reference = classifyMediaReference(sourceRef, usage, alt);
			if (!reference) {
				if (usage === 'body') return null;
				throw new Error(`Gallery requires a prepared local image: ${sourceRef}`);
			}
			if (reference.diagnostic) throw new Error(`${sourceRef}: ${reference.diagnostic}`);
			const media = resolveWebMedia(manifest, id, reference, base);
			if (!media) throw new Error(`Missing prepared media mapping: ${id}/${sourceRef}`);
			if (usage === 'gallery' && media.kind !== 'image') throw new Error('Gallery items must be images.');
			await verifyAsset(media.assetId);
			const common = { class: `dsi-${media.kind}`, src: media.src, width: media.width, height: media.height };
			const html = media.kind === 'image'
				? `<img${attrs({ ...common, alt, srcset: media.srcset,
					sizes: 'auto, (max-width: 48rem) 100vw, 44rem', loading: 'lazy', decoding: 'async' })}>`
				: `<video${attrs({ ...common, controls: '', playsinline: '', preload: 'metadata',
					poster: media.poster, 'aria-label': alt || undefined })}></video>`;
			return { html, asset: manifest.assets[media.assetId], index: index++ };
		};
		const transform = async (node) => {
			if (node.type === 'code' && node.lang === 'simple-gallery') {
				if (!optedIn) throw new Error('simple-gallery requires frontmatter.mediaId.');
				const { model, diagnostics } = parseGallery(node.value);
				if (!model) throw new Error(`Invalid simple-gallery: ${diagnostics.join(' ')}`);
				const items = [];
				for (const item of model.items) {
					const media = await render(item.sourceRef, 'gallery', item.caption ?? '');
					const ratio = media.asset.source.width / media.asset.source.height;
					items.push(`<figure${attrs({ class: 'dsi-gallery-item', 'data-gallery-item': '',
						'data-media-reference': media.index, 'data-aspect-ratio': ratio, style: `--media-ratio:${ratio}` })}>`
						+ media.html + (item.caption === undefined ? ''
							: `<figcaption class="dsi-gallery-caption">${escape(item.caption)}</figcaption>`) + '</figure>');
				}
				return { type: 'html', value: `<div${attrs({ class: 'dsi-gallery', 'data-gallery': '',
					'data-target-row-height': model.targetRowHeight, 'data-gallery-gap': model.gap,
					'data-gallery-corners': model.corners,
					style: `--media-row-height:${model.targetRowHeight}px;--media-gap:${model.gap}px` })}>${items.join('')}</div>` };
			}
			if (optedIn && (node.type === 'image' || node.type === 'imageReference')) {
				const definition = node.type === 'imageReference' ? definitions.get(key(node.identifier)) : node;
				if (definition) {
					const media = await render(definition.url, 'body', node.alt ?? '');
					if (media) return { type: 'html', value: media.html };
				}
			}
			if (node.children) {
				for (let i = 0; i < node.children.length; i++) node.children[i] = await transform(node.children[i]);
			}
			return node;
		};
		await transform(tree);
	};
}
