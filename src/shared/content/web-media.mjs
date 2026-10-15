import { normalizeMediaPath } from './media.mjs';

// The only delivery policy. Node preparation and future renderers import this module.
export const WEB_MEDIA_POLICY = Object.freeze({
	version: 1,
	image: Object.freeze({
		widths: Object.freeze([480, 960, 1600]),
		maxHeight: 2400,
		format: 'webp', quality: 82, effort: 5,
		colourspace: 'srgb', autoOrient: true, metadata: 'strip',
		losslessFormats: Object.freeze(['png']),
	}),
	video: Object.freeze({
		width: 1920, height: 1080, maxFps: 30,
		codec: 'h264', pixelFormat: 'yuv420p', crf: 23, preset: 'medium',
		audioCodec: 'aac', audioBitrate: '128k',
		faststart: true, posterWidth: 960,
	}),
	budget: Object.freeze({
		fileBytes: 20 * 1024 * 1024,
		recommendedDocumentBytes: 50 * 1024 * 1024,
		documentBytes: 80 * 1024 * 1024,
		storeBytes: 500 * 1024 * 1024,
	}),
});

/**
 * @typedef {{url:string, sha256:string, bytes:number, width:number, height:number, type:string}} WebVariant
 * @typedef {{kind:'image'|'video', source: {sha256:string, bytes:number, width:number, height:number, format:string, duration?:number}, recipe:string, variants:WebVariant[], poster?:WebVariant}} WebAsset
 * @typedef {{markdownSha256:string, resources:Record<string,string>}} PreparedDocument
 * @typedef {{schemaVersion:1, documents:Record<string,PreparedDocument>, assets:Record<string,WebAsset>, recipes:Record<string,string>}} WebMediaManifest
 */

const hash = /^[a-f0-9]{64}$/;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;

/** Parse the persisted manifest once, at the file/import boundary. */
export function parseWebMediaManifest(value) {
	if (!record(value) || value.schemaVersion !== 1 || !record(value.documents) || !record(value.assets)
		|| !record(value.recipes))
		throw new TypeError('Invalid web media manifest.');
	for (const [id, asset] of Object.entries(value.assets)) {
		if (!hash.test(id) || !record(asset) || !['image', 'video'].includes(asset.kind)
			|| !record(asset.source) || !hash.test(asset.source.sha256) || !positive(asset.source.bytes)
			|| !positive(asset.source.width) || !positive(asset.source.height)
			|| typeof asset.source.format !== 'string' || !hash.test(asset.recipe)
			|| typeof value.recipes[asset.recipe] !== 'string'
			|| !Array.isArray(asset.variants) || asset.variants.length === 0)
			throw new TypeError(`Invalid web media asset: ${id}`);
		const variants = [...asset.variants, ...(asset.poster ? [asset.poster] : [])];
		for (const variant of variants) {
			if (!record(variant) || !hash.test(variant.sha256)
				|| !positive(variant.bytes) || !positive(variant.width) || !positive(variant.height)
				|| !['image/webp', 'video/mp4'].includes(variant.type)
				|| variant.url !== `/media/${variant.sha256}.${variant.type === 'image/webp' ? 'webp' : 'mp4'}`)
				throw new TypeError(`Invalid web media variant: ${id}`);
		}
		if (asset.kind === 'image' && asset.variants.some((v) => v.type !== 'image/webp'))
			throw new TypeError(`Invalid image variants: ${id}`);
		if (asset.kind === 'image' && asset.variants.some((v, index) => index > 0
			&& v.width <= asset.variants[index - 1].width))
			throw new TypeError(`Image variants must have distinct ascending widths: ${id}`);
		if (asset.kind === 'video' && (asset.variants.length !== 1
			|| asset.variants[0].type !== 'video/mp4' || asset.poster?.type !== 'image/webp'
			|| !Number.isFinite(asset.source.duration) || asset.source.duration <= 0))
			throw new TypeError(`Invalid video variants: ${id}`);
	}
	for (const [id, doc] of Object.entries(value.documents)) {
		if (!record(doc) || !hash.test(doc.markdownSha256) || !record(doc.resources))
			throw new TypeError(`Invalid prepared document: ${id}`);
		for (const [path, assetId] of Object.entries(doc.resources)) {
			if (normalizeMediaPath(path).path !== path || !Object.hasOwn(value.assets, assetId))
				throw new TypeError(`Invalid prepared reference: ${id}/${path}`);
		}
	}
	return /** @type {WebMediaManifest} */ (value);
}

/**
 * Exact identity lookup shared by Admin/QA and the future Astro renderer.
 * base is Astro's BASE_URL; persisted URLs never contain a deployment domain.
 * @param {WebMediaManifest} manifest
 * @param {string} documentId
 * @param {import('./media.mjs').MediaReference} reference
 * @param {string} [base='/']
 */
export function resolveWebMedia(manifest, documentId, reference, base = '/') {
	if (!/^\/(?:[^?#\\]*\/)?$/.test(base)) throw new TypeError('Invalid site base.');
	if (!Object.hasOwn(manifest.documents, documentId) || reference.normalizedPath === null) return null;
	const resources = manifest.documents[documentId].resources;
	if (!Object.hasOwn(resources, reference.normalizedPath)) return null;
	const asset = manifest.assets[resources[reference.normalizedPath]];
	if (asset.kind !== reference.kind) throw new TypeError('Prepared media kind differs from the source.');
	const url = (path) => `${base}${path.slice(1)}`;
	const largest = asset.variants.at(-1);
	return {
		assetId: resources[reference.normalizedPath], kind: asset.kind,
		src: url(largest.url), width: largest.width, height: largest.height,
		...(asset.kind === 'image' ? {
			srcset: asset.variants.map((v) => `${url(v.url)} ${v.width}w`).join(', '),
		} : { poster: url(asset.poster.url) }),
	};
}
