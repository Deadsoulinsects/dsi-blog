import { marked } from 'marked';
import { parseGallery } from './gallery.mjs';

/**
 * @typedef {object} MediaPathResult
 * @property {string | null} path
 * @property {string} [diagnostic]
 *
 * @typedef {object} MediaReference
 * @property {string} sourceRef
 * @property {string | null} normalizedPath
 * @property {'image' | 'video'} kind
 * @property {'gallery' | 'body'} usage
 * @property {string} alt
 * @property {string} [diagnostic]
 *
 * @typedef {object} MediaGallery
 * @property {import('marked').Tokens.Code} token Original lexer token.
 * @property {import('./gallery.mjs').GalleryModel | null} model
 * @property {string[]} diagnostics
 * @property {number[]} referenceIndexes
 *
 * @typedef {object} MediaDocument
 * @property {import('marked').TokensList} tokens Pass these same tokens to marked.parser.
 * @property {MediaReference[]} references Ordered occurrences, including duplicates.
 * @property {MediaGallery[]} galleries
 * @property {Map<import('marked').Tokens.Image, number>} imageReferences
 * @property {string[]} diagnostics
 */

/**
 * Normalize a relative filesystem identity; never decode file-picker paths.
 * URI suffixes are removed by the Markdown caller, not this filesystem function.
 * @param {string} raw
 * @param {boolean} [encoded=false] Decode a Markdown href exactly once.
 * @returns {MediaPathResult}
 */
export function normalizeMediaPath(raw, encoded = false) {
	let path = raw;
	if (encoded) {
		try {
			path = decodeURIComponent(path);
		} catch {
			return { path: null, diagnostic: 'Invalid URL encoding in media path.' };
		}
	}
	path = path.replace(/\\/g, '/').normalize('NFC');
	if ([...path].some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || (code >= 127 && code <= 159);
	})) {
		return { path: null, diagnostic: 'Control characters are not allowed in media paths.' };
	}
	if (path.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
		return { path: null, diagnostic: 'Media paths must be relative, without a drive or protocol.' };
	}
	const segments = path.split('/');
	if (segments.includes('..')) {
		return { path: null, diagnostic: 'Parent traversal is not allowed in media paths.' };
	}
	path = segments.filter((segment) => segment !== '' && segment !== '.').join('/');
	return path ? { path } : { path: null, diagnostic: 'Media path is empty.' };
}

const imageExtension = /\.(?:jpe?g|png|gif|webp|avif|svg)$/i;
const protocol = /^[a-z][a-z\d+.-]*:/i;

/**
 * Classify a source reference without filesystem access.
 * @param {string} sourceRef
 * @param {'gallery' | 'body'} usage
 * @param {string} alt
 * @returns {MediaReference | null}
 */
export function classifyMediaReference(sourceRef, usage, alt) {
	// Only Markdown hrefs have URI suffixes or URL encoding. Wiki paths are raw.
	const rawPath = usage === 'body' ? sourceRef.split(/[?#]/, 1)[0] : sourceRef;
	if (protocol.test(rawPath) && !/^[a-z]:/i.test(rawPath)) return null;
	if (rawPath.startsWith('//')) return null;
	const normalized = normalizeMediaPath(rawPath, usage === 'body');
	let diagnostic = normalized.diagnostic;
	const kind = normalized.path && /\.mp4$/i.test(normalized.path) ? 'video' : 'image';
	if (normalized.path && kind === 'image' && !imageExtension.test(normalized.path)) {
		diagnostic = 'Unsupported image attachment extension.';
	}
	return {
		sourceRef, normalizedPath: diagnostic ? null : normalized.path, kind, usage, alt,
		...(diagnostic ? { diagnostic } : {}),
	};
}

/**
 * Discover resources only from semantic lexer tokens, never code or literal examples.
 * No filesystem access or basename fallback is performed.
 * @param {string} markdown
 * @returns {MediaDocument}
 */
export function discoverMedia(markdown) {
	/** @type {MediaDocument} */
	const document = {
		tokens: marked.lexer(markdown), references: [], galleries: [],
		imageReferences: new Map(), diagnostics: [],
	};
	/**
	 * @param {string} sourceRef
	 * @param {'gallery' | 'body'} usage
	 * @param {string} alt
	 * @returns {number | null}
	 */
	const reference = (sourceRef, usage, alt) => {
		const classified = classifyMediaReference(sourceRef, usage, alt);
		if (classified === null) return null;
		const index = document.references.length;
		document.references.push(classified);
		if (classified.diagnostic) document.diagnostics.push(`${sourceRef}: ${classified.diagnostic}`);
		return index;
	};
	marked.walkTokens(document.tokens, (token) => {
		if (token.type === 'code' && token.lang === 'simple-gallery') {
			const code = /** @type {import('marked').Tokens.Code} */ (token);
			const parsed = parseGallery(code.text);
			/** @type {MediaGallery} */
			const gallery = { token: code, ...parsed, referenceIndexes: [] };
			document.galleries.push(gallery);
			document.diagnostics.push(...parsed.diagnostics);
			for (const item of parsed.model?.items ?? []) {
				const index = reference(item.sourceRef, 'gallery', item.caption ?? '');
				if (index !== null) gallery.referenceIndexes.push(index);
			}
		} else if (token.type === 'image') {
			const image = /** @type {import('marked').Tokens.Image} */ (token);
			const index = reference(image.href, 'body', image.text);
			if (index !== null) document.imageReferences.set(image, index);
		}
	});
	return document;
}
