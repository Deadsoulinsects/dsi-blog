import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import {
	fontBytes, fontLicense, fontManifest, fontRevision, fontStylesheet,
	fontStylesheetHref, missingFontCharacters, verifyPublishedFontCoverage,
} from '../src/fonts/resources.mjs';

test('all pinned resources have valid bytes and no HTTP acquisition', () => {
	for (const face of fontManifest.faces) assert.equal(fontBytes(face.id).length, face.bytes);
	assert.throws(() => fontBytes('not-a-font'), /Unknown font resource/);
});
test('CSS has revisioned local resources and actual Mono weights', () => {
	const css = fontStylesheet('a1', '/blog/');
	assert.ok(!css.includes('https:'));
	assert.ok(!css.includes('DSI Bricolage'));
	assert.ok(css.includes("font-family:'IBM Plex Mono';font-style:normal;font-weight:700;"));
	assert.ok(css.includes('/blog/fonts/'));
	assert.equal(fontStylesheetHref('a1', '/blog/'), `/blog/fonts/a1-${fontRevision}.css`);
	assert.ok(fontStylesheet('lab').includes("font-family:'DSI Bricolage'"));
});
test('common extensions, fullwidth punctuation and accents have real font glyphs', () => {
	assert.deepEqual(missingFontCharacters('𠮷𠀋Ａａｚ，。éΩ中文', ['noto-sans-sc']), []);
	assert.deepEqual(missingFontCharacters('𠮷𠀋Ａａｚ，。éΩ中文', ['noto-serif-sc']), []);
});
test('future unsupported glyphs fail instead of silently becoming system fallback', () => {
	assert.deepEqual(missingFontCharacters('\u{10ffff}', ['noto-sans-sc']), ['\u{10ffff}']);
	// U+20000 is not in the chosen Noto masters; reject rather than pretend a glyph exists.
	assert.deepEqual(missingFontCharacters('𠀀', ['noto-sans-sc']), ['𠀀']);
});
test('emoji and shaping controls are explicitly platform-owned', () => {
	assert.deepEqual(missingFontCharacters('🌟\u200d\ufe0f\n', ['noto-sans-sc']), []);
});
test('license integrity tolerates Windows checkout line endings, not content changes', (t) => {
	const read = fs.readFileSync;
	t.mock.method(fs, 'readFileSync', (...args) => {
		const result = read(...args);
		return typeof result === 'string' && String(args[0]).endsWith('OFL.txt')
			? result.replace(/\r?\n/g, '\r\n') : result;
	});
	syncBuiltinESMExports();
	t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
	assert.match(fontLicense('noto-sans-sc'), /SIL OPEN FONT LICENSE/);
});
test('all current published content and UI sources pass the conservative build gate', () => {
	assert.equal(verifyPublishedFontCoverage().covered, true);
});
test('a newly published unsupported character blocks the actual build gate', (t) => {
	const root = mkdtempSync(join(tmpdir(), 'dsi-font-coverage-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const path of ['src/content/blog', 'src/content/docs', 'src/pages', 'src/layouts', 'src/components', 'src/data']) {
		mkdirSync(join(root, path), { recursive: true });
	}
	writeFileSync(join(root, 'src/content/blog/new.md'), '未来新增𠀀', 'utf8');
	t.mock.method(process, 'cwd', () => root);
	assert.throws(() => verifyPublishedFontCoverage(), /Published font coverage failed:[\s\S]*U\+20000/);
});
