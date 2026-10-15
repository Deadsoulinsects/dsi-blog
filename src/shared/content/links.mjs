/**
 * @typedef {object} ContentFile
 * @property {string} path Repository-relative POSIX path
 * @property {'blog' | 'docs'} collection
 *
 * @typedef {object} ContentIndex
 * @property {ReadonlyMap<string, string>} byFilePath
 * @property {ReadonlyMap<string, string>} bySlug
 */

/** @param {string} path */
const normalizePath = (path) => {
	const segments = [];
	for (const segment of path.replace(/\\/g, '/').split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			segments.pop();
		} else {
			segments.push(segment);
		}
	}
	return segments.join('/');
};

/** @param {string} name */
const toRouteSlug = (name) => name.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '-');

/**
 * Retain the link script's basename routes and last-match slug fallback.
 * This is deliberately not a new Astro route-generation policy.
 * @param {readonly ContentFile[]} files
 * @returns {ContentIndex}
 */
export const createContentIndex = (files) => {
	const byFilePath = new Map();
	const bySlug = new Map();
	for (const file of files) {
		const path = normalizePath(file.path);
		const basename = path.split('/').pop() ?? '';
		const slug = toRouteSlug(basename.replace(/^(.+)\.[^.]*$/, '$1'));
		const route = `/${file.collection}/${slug}/`;
		byFilePath.set(path, route);
		bySlug.set(slug, route);
	}
	return { byFilePath, bySlug };
};

/**
 * @param {string} pathname
 * @param {string} fromFile
 * @param {ContentIndex} index
 */
const resolveMarkdownFile = (pathname, fromFile, index) => {
	let decodedPathname = pathname;
	try {
		decodedPathname = decodeURIComponent(pathname);
	} catch (error) {
		if (!(error instanceof URIError)) throw error;
	}

	const directory = fromFile.slice(0, fromFile.lastIndexOf('/') + 1);
	const path = normalizePath(`${directory}${decodedPathname}`);
	for (const candidate of [path, `${path}.md`, `${path}/index.md`]) {
		const route = index.byFilePath.get(candidate);
		if (route) return route;
	}

	const lastSegment = decodedPathname.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
	if (!lastSegment) return null;
	return index.bySlug.get(toRouteSlug(lastSegment.replace(/\.md$/i, ''))) ?? null;
};

/**
 * Apply only the ordinary inline-link conversion used by the formal pipeline.
 * Images, absolute links and unsupported syntax are left untouched.
 * @param {string} content
 * @param {string} fromFile Repository-relative POSIX path
 * @param {ContentIndex} index
 */
export const normalizeMarkdownLinks = (content, fromFile, index) => {
	/** @type {{ href: string, target: string }[]} */
	const changes = [];
	/** @type {string[]} */
	const unresolvedLinks = [];
	const normalizedContent = content.replace(/(!?)\[([^\]\n]+)\]\(([^)\n]+)\)/g, (match, imagePrefix, text, rawTarget) => {
		if (imagePrefix) return match;

		const target = rawTarget.trim();
		const targetParts = target.match(/^(\S+)(\s+.+)$/);
		const rawHref = targetParts ? targetParts[1] : target;
		const suffix = targetParts ? targetParts[2] : '';
		const href = rawHref.startsWith('<') && rawHref.endsWith('>') ? rawHref.slice(1, -1) : rawHref;
		if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return match;

		const hashIndex = href.indexOf('#');
		const pathname = hashIndex === -1 ? href : href.slice(0, hashIndex);
		const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
		const route = resolveMarkdownFile(pathname, fromFile, index);
		if (!route) {
			if (/\.md$/i.test(pathname)) unresolvedLinks.push(href);
			return match;
		}

		changes.push({ href, target: `${route}${hash}` });
		return `[${text}](${route}${hash}${suffix})`;
	});

	return { content: normalizedContent, changes, unresolvedLinks };
};
