import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import manifest from './manifest.json' with { type: 'json' };

export const fontManifest = manifest;
export const fontRevision = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16);
const cache = new Map();
const root = join(process.cwd(), 'src/assets/fonts');

/** @param {string} id */
export function fontBytes(id) {
	const face = manifest.faces.find((item) => item.id === id);
	if (!face) throw new Error(`Unknown font resource: ${id}`);
	if (!cache.has(id)) {
		const encoded = readFileSync(join(root, face.file), 'utf8').trim();
		if (encoded.length % 4 || /[^A-Za-z0-9+/=]/.test(encoded)) {
			throw new Error(`Invalid font encoding: ${face.file}`);
		}
		const bytes = Buffer.from(encoded, 'base64');
		if (bytes.toString('base64') !== encoded || bytes.length !== face.bytes
			|| createHash('sha256').update(bytes).digest('hex') !== face.sha256) {
			throw new Error(`Font integrity mismatch: ${face.file}`);
		}
		cache.set(id, bytes);
	}
	return cache.get(id);
}

/** @param {string} family */
export function fontLicense(family) {
	const item = manifest.families.find((entry) => entry.id === family);
	if (!item) throw new Error(`Unknown font family: ${family}`);
	const text = readFileSync(join(root, item.licensePath), 'utf8').replace(/\r\n/g, '\n');
	if (createHash('sha256').update(text).digest('hex') !== item.licenseSha256) {
		throw new Error(`Font license integrity mismatch: ${family}`);
	}
	const additional = (item.additionalLicenses ?? []).map((license) => {
		const value = readFileSync(join(root, license.path), 'utf8').replace(/\r\n/g, '\n');
		if (createHash('sha256').update(value).digest('hex') !== license.sha256) {
			throw new Error(`Supplement license integrity mismatch: ${license.path}`);
		}
		return `\n\nSource: ${license.source}\n${value}`;
	});
	return text + additional.join('');
}

/** @param {'lab' | 'a1'} variant @param {string} [base] */
export function fontStylesheetHref(variant, base = '/') {
	return `${base.replace(/\/$/, '')}/fonts/${variant}-${fontRevision}.css`;
}

/** @param {'lab' | 'a1'} variant @param {string} [base] */
export function fontStylesheet(variant, base = '/') {
	return manifest.faces.filter((face) => variant === 'lab' || face.family !== 'bricolage-grotesque').map((face) => {
		const family = manifest.families.find((item) => item.id === face.family);
		const name = variant === 'lab' ? family.alias : family.cssFamily;
		const url = `${base.replace(/\/$/, '')}/fonts/${face.id}.woff2`;
		return `@font-face{font-family:'${name}';font-style:${face.style};font-weight:${face.weight};font-display:swap;src:url('${url}') format('woff2');unicode-range:${face.unicodeRange};}`;
	}).join('\n');
}

/** @param {string} family @param {number} codepoint */
export function hasFontCharacter(family, codepoint) {
	const record = manifest.families.find((item) => item.id === family);
	if (!record) throw new Error(`Unknown font family: ${family}`);
	return record.coverage.some(([start, end]) => codepoint >= start && codepoint <= end);
}

/** Emoji/control shaping characters intentionally use platform shaping and color emoji. @param {string} char */
export function usesPlatformGlyph(char) {
	return /[\p{Emoji_Presentation}\p{Format}\p{Control}\p{White_Space}]/u.test(char)
		|| char === '\ufe0e' || char === '\ufe0f' || char === '\u20e3'
		// Existing aria-hidden TOC chevron is a platform UI symbol, not reading text.
		|| char === '\u2304';
}

/** @param {string} text @param {string[]} families */
export function missingFontCharacters(text, families) {
	return [...new Set(text)].filter((char) => !usesPlatformGlyph(char)
		&& !families.some((family) => hasFontCharacter(family, char.codePointAt(0))));
}

/**
 * Conservative build gate: published content plus public UI sources.
 * Source text is a superset (including labels in frontmatter), not a claim that comments render.
 */
export function verifyPublishedFontCoverage() {
	const paths = ['src/content/blog', 'src/content/docs', 'src/pages', 'src/layouts', 'src/components', 'src/data'];
	const missing = [];
	let files = 0;
	/** @param {string} dir */
	const visit = (dir) => {
		for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			const path = join(dir, item.name);
			if (item.isDirectory()) {
				if (dir === join(process.cwd(), 'src/pages') && ['admin', 'lab', 'api'].includes(item.name)) continue;
				visit(path);
			} else if (/\.(?:md|mdx|astro|json|[cm]?[jt]s)$/.test(item.name) && !item.name.startsWith('Admin')) {
				files++;
				const text = readFileSync(path, 'utf8');
				const chars = [...new Set([
					...missingFontCharacters(text, ['noto-sans-sc']),
					...missingFontCharacters(text, ['newsreader', 'noto-serif-sc']),
				])];
				if (chars.length) missing.push({ path, chars });
			}
		}
	};
	for (const path of paths) visit(join(process.cwd(), path));
	if (missing.length) {
		throw new Error(`Published font coverage failed:\n${missing.map(({ path, chars }) =>
			`${path}: ${chars.map((char) => `${char} U+${char.codePointAt(0).toString(16).toUpperCase()}`).join(', ')}`).join('\n')}`);
	}
	return { files, covered: true };
}
