/**
 * @typedef {object} FrontmatterOptions
 * @property {string} fileName
 * @property {string} [pubDate] Docs default only.
 * @property {'blog' | 'docs'} collection
 */

/** @param {string} content */
export const hasFrontmatter = (content) => content.startsWith('---\n') || content.startsWith('---\r\n');

/** Split source syntax identically for browser import and local resource preparation. */
export function splitMarkdownSource(source) {
	const normalized = source.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
	const lines = normalized.split('\n');
	if (lines[0] !== '---') return { normalized, frontmatter: null, body: normalized, closed: true };
	const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
	return {
		normalized,
		frontmatter: closingIndex < 0 ? '' : lines.slice(1, closingIndex).join('\n'),
		body: closingIndex < 0 ? '' : lines.slice(closingIndex + 1).join('\n'),
		closed: closingIndex >= 0,
	};
}

/** @param {Date} date */
export const formatLocalDate = (date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** @param {string} fileName */
export const getFileTitle = (fileName) =>
	(fileName.replace(/\\/g, '/').split('/').pop() ?? '').replace(/\.md$/i, '');

/** @param {unknown} title */
export const isValidTitle = (title) => typeof title === 'string' && title.trim() !== '';

/** @param {unknown} value */
export const isValidPubDate = (value) => {
	if (!(typeof value === 'string' || typeof value === 'number' || value instanceof Date)) return false;
	if (typeof value === 'string' && value.trim() === '') return false;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return false;
	return typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())
		|| date.toISOString().slice(0, 10) === value.trim();
};

/** @param {unknown} value */
export const isValidCompletionDate = (value) =>
	typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidPubDate(value);

/** Canonical YYYY-MM-DD from either YYYY-MM-DD or YYYY/MM/DD input; null when unrecognized. @param {unknown} value */
export const normalizeCompletionDate = (value) => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	const slashed = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(trimmed);
	const candidate = slashed ? `${slashed[1]}-${slashed[2]}-${slashed[3]}` : trimmed;
	return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && isValidPubDate(candidate) ? candidate : null;
};

/** Normalize optional date fields: recognized YYYY-MM-DD / YYYY/MM/DD strings become canonical; null, empty and other values pass through. @param {unknown} value */
export const normalizeOptionalDate = (value) =>
	typeof value === 'string' ? normalizeCompletionDate(value) ?? value : value;

/** Remove only the plugin-owned header at the beginning of the article body. */
export const stripArticleHeader = (body) => {
	const start = '<!-- article-header:start -->';
	const end = '<!-- article-header:end -->';
	if (!body.includes(start) && !body.includes(end)) return body;
	const match = body.match(/^\s*<!-- article-header:start -->\r?\n([\s\S]*?)^<!-- article-header:end -->[ \t]*(?:\r?\n|$)/m);
	if (!match || match.index !== 0 || match[1].includes(start) || body.indexOf(end) !== body.lastIndexOf(end)
		|| body.indexOf(start) !== body.lastIndexOf(start)) {
		throw new TypeError('文章头部同步标记不完整、重复或不在正文开头，请检查源笔记。');
	}
	return body.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '');
};

/** Refresh author-owned properties while retaining site-owned identifiers and custom fields. */
export const mergeBlogSource = (source, destination, fileName) => {
	const sourceParts = splitMarkdownSource(source);
	const targetParts = splitMarkdownSource(normalizeFrontmatter(destination || source, { fileName, collection: 'blog' }));
	if (!sourceParts.closed || !targetParts.closed) throw new TypeError('Markdown frontmatter 未关闭。');
	const sourceDocument = parseDocument(sourceParts.frontmatter || '', { strict: true, uniqueKeys: true });
	const targetDocument = parseDocument(targetParts.frontmatter || '', { strict: true, uniqueKeys: true });
	for (const document of [sourceDocument, targetDocument]) {
		if (document.errors.length || document.warnings.length || !isMap(document.contents)) {
			if (document.contents === null && !document.errors.length && !document.warnings.length) continue;
			throw new TypeError('frontmatter 必须是有效的 YAML 字段映射。');
		}
	}
	for (const field of ['title', 'description', 'topic', 'topicPath', 'tags', 'start_date', 'end_date', 'completion_date']) {
		if (sourceDocument.has(field)) targetDocument.set(field, sourceDocument.get(field));
	}
	if (!sourceDocument.has('completion_date') && sourceDocument.has('pubDate')) {
		const legacy = sourceDocument.get('pubDate');
		if (!isValidPubDate(legacy)) throw new TypeError('源笔记的历史 pubDate 无效。');
		targetDocument.set('completion_date', new Date(legacy).toISOString().slice(0, 10));
	}
	if (sourceDocument.has('topic') && !sourceDocument.has('topicPath')) targetDocument.delete('topicPath');
	targetDocument.delete('pubDate');
	const rawCompletionDate = targetDocument.get('completion_date');
	const completionDate = normalizeCompletionDate(rawCompletionDate);
	if (!completionDate) throw new TypeError(`${fileName}: completion_date 必须是 YYYY-MM-DD 或 YYYY/MM/DD 的有效完成日期。`);
	if (completionDate !== rawCompletionDate) targetDocument.set('completion_date', completionDate);
	for (const field of ['start_date', 'end_date']) {
		const raw = targetDocument.get(field);
		const normalized = normalizeOptionalDate(raw);
		if (normalized !== raw) targetDocument.set(field, normalized);
	}
	return `---\n${targetDocument.toString({ lineWidth: 0 })}---\n\n${stripArticleHeader(sourceParts.body).replace(/^\n+/, '')}`;
};

/** @param {string} value */
const escapeYamlString = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Migrate blog metadata and remove the plugin-managed header, without inventing dates.
 * Invalid YAML is left for the caller's validation; docs retain their existing rules.
 * @param {string} content BOM-free Markdown
 * @param {FrontmatterOptions} options
 */
export const normalizeFrontmatter = (content, { fileName, pubDate, collection }) => {
	if (hasFrontmatter(content)) {
		if (collection !== 'blog') return content;

		const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
		const closeIndex = content.indexOf(`${lineEnding}---`, 3);
		if (closeIndex === -1) return content;

		const document = parseDocument(content.slice(3 + lineEnding.length, closeIndex), {
			strict: true, uniqueKeys: true,
		});
		if (document.errors.length > 0 || document.warnings.length > 0 || !isMap(document.contents)) return content;
		/** @type {Record<string, unknown>} */
		let metadata;
		try {
			metadata = document.toJS({ maxAliasCount: 50 });
		} catch (error) {
			if (!(error instanceof ReferenceError)) throw error;
			return content;
		}
		let changed = false;
		if (!isValidTitle(metadata.title)) {
			document.set('title', getFileTitle(fileName));
			changed = true;
		}
		if (!document.has('completion_date') && isValidPubDate(metadata.pubDate)) {
			const legacy = metadata.pubDate instanceof Date ? metadata.pubDate : new Date(metadata.pubDate);
			document.set('completion_date', legacy.toISOString().slice(0, 10));
			changed = true;
		}
		if (document.has('completion_date')) {
			const rawCompletionDate = document.get('completion_date');
			const completionDate = normalizeCompletionDate(rawCompletionDate);
			if (completionDate && completionDate !== rawCompletionDate) {
				document.set('completion_date', completionDate);
				changed = true;
			}
		}
		for (const field of ['start_date', 'end_date']) {
			const raw = document.get(field);
			const normalized = normalizeOptionalDate(raw);
			if (normalized !== raw) {
				document.set(field, normalized);
				changed = true;
			}
		}
		if (document.has('pubDate')) {
			document.delete('pubDate');
			changed = true;
		}
		for (const field of ['description', 'topic']) {
			if (!document.has(field)) {
				document.set(field, '');
				changed = true;
			}
		}
		const body = content.slice(closeIndex + lineEnding.length + 3);
		const nextBody = stripArticleHeader(body);
		if (!changed && nextBody === body) return content;

		const yaml = document.toString({ lineWidth: 0 }).replace(/\n/g, lineEnding);
		return `---${lineEnding}${yaml}---${nextBody === body ? body : `${lineEnding}${lineEnding}${nextBody}`}`;
	}

	const basename = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
	const title = collection === 'blog' ? getFileTitle(fileName) : basename.replace(/^(.+)\.[^.]*$/, '$1');
	const fields = [
		'---',
		`title: "${escapeYamlString(title)}"`,
		'description: ""',
		...(collection === 'docs' ? [`pubDate: ${pubDate}`] : []),
		...(collection === 'docs' ? ['category: "未分类"'] : []),
		...(collection === 'docs' ? ['tags: []'] : []),
		...(collection === 'blog' ? ['topic: ""'] : []),
		'---',
		'',
	].join('\n');

	return content.length > 0 ? `${fields}\n${content}` : fields;
};
import { isMap, parseDocument } from 'yaml';

