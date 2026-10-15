import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { prepareWebMedia } from './media/prepare.mjs';
import { hashFile, inventory, readManifest, sourceFile } from './media/store.mjs';
import { discoverMedia } from '../src/shared/content/media.mjs';
import { resolveWebMedia, parseWebMediaManifest } from '../src/shared/content/web-media.mjs';
import { splitMarkdownSource } from '../src/shared/content/frontmatter.mjs';

const qaRoot = process.env.DSI_QA_ROOT || (process.platform === 'win32'
	? 'D:/ai-output/DSI-管理后台/网页资源准备' : join(tmpdir(), 'dsi-media-qa'));
await mkdir(qaRoot, { recursive: true });
const sandbox = await mkdtemp(join(qaRoot, 'verify-'));
let passed = 0;

async function check(name, action) {
	await action();
	passed += 1;
	console.log(`[pass] ${name}`);
}

async function fixture(name) {
	const directory = join(sandbox, name);
	const sourceRoot = join(directory, 'source'), storeRoot = join(directory, 'store');
	await mkdir(sourceRoot, { recursive: true });
	const image = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#ff000080' } })
		.png({ compressionLevel: 0 }).toBuffer();
	await writeFile(join(sourceRoot, '照片.png'), image);
	await writeFile(join(sourceRoot, '同内容.png'), image);
	const note = join(sourceRoot, '测试.md');
	await writeFile(note, '![403](照片.png)\n![320x240](同内容.png)\n');
	const options = { id: '测试', note, sourceRoot, storeRoot };
	return { ...options, options, file: join(sourceRoot, '照片.png') };
}

try {
	await check('Shared source splitter excludes frontmatter examples', async () => {
		const split = splitMarkdownSource('\uFEFF---\r\ndescription: "![example](missing.png)"\r\n---\r\n![alt](real.png)');
		assert.equal(discoverMedia(split.body).references[0].normalizedPath, 'real.png');
		assert.equal(discoverMedia(split.body).references.length, 1);
		assert.equal(splitMarkdownSource('---\ntitle: x').closed, false);
	});
	await check('One content hash serves two different source identities', async () => {
		const f = await fixture('dedup');
		const result = await prepareWebMedia(f.options);
		const manifest = await readManifest(result.manifest);
		assert.equal(result.converted, 1);
		assert.equal(result.deduplicated, 1);
		assert.equal(new Set(Object.values(manifest.documents.测试.resources)).size, 1);
		const asset = Object.values(manifest.assets)[0];
		assert.equal(asset.variants.length, 1);
		const meta = await sharp(join(f.storeRoot, 'public', asset.variants[0].url.slice(1))).metadata();
		assert.equal(meta.width, 32);
		assert.equal(meta.height, 24);
		assert.equal(meta.hasAlpha, true);
		assert.equal(meta.exif, undefined);
	});
	await check('No-op rerun reuses assets without rewriting the manifest', async () => {
		const f = await fixture('noop');
		const initial = await prepareWebMedia(f.options);
		const before = await stat(initial.manifest);
		const result = await prepareWebMedia(f.options);
		assert.equal(result.converted, 0);
		assert.equal(result.reused, 1);
		assert.equal(result.manifestChanged, false);
		assert.equal((await stat(initial.manifest)).mtimeMs, before.mtimeMs);
	});
	await check('Source hash detects replacement with the same size and timestamp', async () => {
		const f = await fixture('replacement');
		const date = new Date('2001-01-01T00:00:00Z');
		await utimes(f.file, date, date);
		const initial = await prepareWebMedia(f.options);
		const before = await readManifest(initial.manifest);
		const oldSize = (await stat(f.file)).size;
		const replacement = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#0000ff80' } })
			.png({ compressionLevel: 0 }).toBuffer();
		await writeFile(f.file, replacement);
		await utimes(f.file, date, date);
		assert.equal((await stat(f.file)).size, oldSize);
		const result = await prepareWebMedia(f.options);
		const after = await readManifest(result.manifest);
		assert.notEqual(after.documents.测试.resources['照片.png'], before.documents.测试.resources['照片.png']);
		assert.equal(after.documents.测试.resources['同内容.png'], before.documents.测试.resources['同内容.png']);
		assert.equal(result.converted, 1);
	});
	await check('Missing derivative is regenerated', async () => {
		const f = await fixture('missing');
		const initial = await prepareWebMedia(f.options);
		const manifest = await readManifest(initial.manifest);
		const variant = Object.values(manifest.assets)[0].variants[0];
		const path = join(f.storeRoot, 'public', variant.url.slice(1));
		await rm(path);
		const result = await prepareWebMedia(f.options);
		assert.equal(result.converted, 1);
		assert.equal((await hashFile(path)).sha256, variant.sha256);
	});
	await check('Corrupt derivative is repaired using its immutable content identity', async () => {
		const f = await fixture('corrupt');
		const initial = await prepareWebMedia(f.options);
		const manifest = await readManifest(initial.manifest);
		const variant = Object.values(manifest.assets)[0].variants[0];
		const path = join(f.storeRoot, 'public', variant.url.slice(1));
		await writeFile(path, 'corrupt');
		const result = await prepareWebMedia(f.options);
		assert.equal(result.converted, 1);
		assert.equal((await hashFile(path)).sha256, variant.sha256);
	});
	await check('Failed encoding leaves the previous manifest unchanged', async () => {
		const f = await fixture('atomic');
		const initial = await prepareWebMedia(f.options);
		const before = await readFile(initial.manifest, 'utf8');
		await writeFile(join(f.sourceRoot, 'vector.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
		await writeFile(f.note, '![](vector.svg)');
		await assert.rejects(prepareWebMedia(f.options));
		assert.equal(await readFile(initial.manifest, 'utf8'), before);
		assert.deepEqual(await readdir(join(f.storeRoot, '.media-work')), []);
	});
	await check('Removed references become reported orphans, never deletions', async () => {
		const f = await fixture('orphan');
		const initial = await prepareWebMedia(f.options);
		const before = await inventory(f.storeRoot, await readManifest(initial.manifest));
		await writeFile(f.note, '# No attachments');
		const result = await prepareWebMedia(f.options);
		assert.equal(result.orphaned.length, 1);
		assert.deepEqual(result.files, before.files);
		assert.deepEqual((await readManifest(result.manifest)).assets, {});
	});
	await check('Another document protects a shared asset from orphan classification', async () => {
		const f = await fixture('multi');
		await prepareWebMedia(f.options);
		await prepareWebMedia({ ...f.options, id: '另一篇' });
		await writeFile(f.note, '# No attachments');
		const result = await prepareWebMedia(f.options);
		assert.equal(result.orphaned.length, 0);
		assert.equal(Object.keys((await readManifest(result.manifest)).assets).length, 1);
	});
	await check('Filesystem adapter rejects wrong case, traversal and NFC collisions', async () => {
		const f = await fixture('paths');
		await writeFile(join(f.sourceRoot, 'A.png'), 'x');
		await assert.rejects(sourceFile(f.sourceRoot, 'a.png'));
		await assert.rejects(sourceFile(f.sourceRoot, '../A.png'));
		await writeFile(join(f.sourceRoot, 'é.png'), 'x');
		await writeFile(join(f.sourceRoot, 'e\u0301.png'), 'y');
		await assert.rejects(sourceFile(f.sourceRoot, 'é.png'));
	});
	await check('Resolver uses exact decoded paths and supports an Astro subpath', async () => {
		const f = await fixture('resolver');
		const result = await prepareWebMedia(f.options);
		const manifest = await readManifest(result.manifest);
		const reference = discoverMedia('![403](%E7%85%A7%E7%89%87.png)').references[0];
		const resolved = resolveWebMedia(manifest, '测试', reference, '/blog/');
		assert.ok(resolved.src.startsWith('/blog/media/'));
		assert.equal(resolved.srcset, `${resolved.src} 32w`);
		assert.equal(resolveWebMedia(manifest, 'missing', reference), null);
		const altered = structuredClone(manifest);
		Object.values(altered.assets)[0].variants[0].url = 'https://remote.invalid/x.webp';
		assert.throws(() => parseWebMediaManifest(altered));
	});
	await check('EXIF orientation is baked into output dimensions and removed', async () => {
		const f = await fixture('orientation');
		await sharp({ create: { width: 40, height: 24, channels: 3, background: '#22aa66' } })
			.jpeg().withMetadata({ orientation: 6 }).toFile(join(f.sourceRoot, 'rotated.jpg'));
		await writeFile(f.note, '![](rotated.jpg)');
		const result = await prepareWebMedia(f.options);
		const asset = Object.values((await readManifest(result.manifest)).assets)[0];
		assert.equal(asset.source.width, 24);
		assert.equal(asset.source.height, 40);
		assert.equal(asset.variants[0].width, 24);
		assert.equal(asset.variants[0].height, 40);
		const metadata = await sharp(join(f.storeRoot, 'public', asset.variants[0].url.slice(1))).metadata();
		assert.equal(metadata.orientation, undefined);
	});
	console.log(`Media verification passed: ${passed} cases`);
} finally {
	sharp.cache(false);
	await rm(sandbox, { recursive: true, force: true });
}
