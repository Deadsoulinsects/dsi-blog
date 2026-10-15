import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { parseFragment } from 'parse5';
import sharp from 'sharp';
import { classifyMediaReference, discoverMedia } from '../src/shared/content/media.mjs';
import { remarkWebMedia } from '../src/shared/content/remark-web-media.mjs';
import { parseWebMediaManifest } from '../src/shared/content/web-media.mjs';

const id = 'article-media-fixture';
const imagePath = 'attachments/横图.png';
const secondImagePath = 'attachments/竖图.png';
const videoPath = 'attachments/片段.mp4';
let manifest, imageAsset, videoAsset;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gallery = (body) => `\`\`\`simple-gallery\n${body}\n\`\`\``;
const processor = (options = {}) => createMarkdownProcessor({
	remarkPlugins: [[remarkWebMedia, { manifest, publicDir, ...options }]], smartypants: false,
});
const render = (p, text, mediaId = id) => p.render(text, {
	frontmatter: mediaId === undefined ? {} : { mediaId }, fileURL: new URL('../src/content/blog/qa.md', import.meta.url),
});
const nodes = (html, tag) => {
	const found = [];
	const walk = (node) => {
		if (node.tagName === tag) found.push(node);
		for (const child of node.childNodes ?? []) walk(child);
	};
	walk(parseFragment(html));
	return found;
};
const attr = (node, name) => node.attrs.find((item) => item.name === name)?.value;
const text = (node) => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
let passed = 0;
const check = async (name, action) => {
	await action();
	console.log(`[pass] ${name}`);
	passed++;
};
const sandbox = await mkdtemp(join(tmpdir(), 'dsi-article-media-'));
const source = join(sandbox, 'article.md');
const publicDir = join(sandbox, 'public');
const corruptPublicDir = join(sandbox, 'corrupt-public');
try {
	await mkdir(join(publicDir, 'media'), { recursive: true });
	const markdown = [
		'# Article media fixture',
		gallery(`- ![[${secondImagePath}]]\n  caption: Portrait\n- ![[${imagePath}]]`),
		`![Body](${imagePath})`,
		`![Video](${videoPath})`,
		gallery(`- ![[${imagePath}]]\n- ![[${secondImagePath}]]`),
		`![Reference][portrait]\n\n[portrait]: ${encodeURI(secondImagePath)}`,
		`![Repeated video](${videoPath})`,
	].join('\n\n');
	await writeFile(source, markdown);
	const recipeText = 'article-media-rendering-fixture-v1';
	const recipe = hash(recipeText);
	const assets = {}, resources = {};
	const variant = async (bytes, width, height, type) => {
		const sha256 = hash(bytes);
		const url = `/media/${sha256}.${type === 'image/webp' ? 'webp' : 'mp4'}`;
		await writeFile(join(publicDir, url.slice(1)), bytes);
		return { url, sha256, bytes: bytes.length, width, height, type };
	};
	for (const [path, width, height, background] of [
		[imagePath, 96, 48, '#164b70'],
		[secondImagePath, 48, 96, '#b04d32'],
	]) {
		const png = await sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
		await mkdir(join(sandbox, 'attachments'), { recursive: true });
		await writeFile(join(sandbox, path), png);
		const variants = [];
		for (const size of [width / 2, width]) {
			const { data, info } = await sharp(png).resize({ width: size }).webp().toBuffer({ resolveWithObject: true });
			variants.push(await variant(data, info.width, info.height, 'image/webp'));
		}
		const assetId = hash(png);
		resources[path] = assetId;
		assets[assetId] = {
			kind: 'image', source: { sha256: assetId, bytes: png.length, width, height, format: 'png' },
			recipe, variants,
		};
	}
	// This is deliberately not a decodable video: the remark adapter never invokes a codec.
	// It reads opaque bytes and verifies their size/hash before emitting the MP4 URL and poster.
	// Distinct ISO BMFF-shaped bytes exercise that exact I/O contract without requiring ffmpeg.
	const mp4 = Buffer.from('000000186674797069736f6d0000020069736f6d6d7034320000000c6d64617400000001', 'hex');
	await writeFile(join(sandbox, videoPath), mp4);
	const poster = await sharp({ create: {
		width: 32, height: 18, channels: 3, background: '#314229',
	} }).webp().toBuffer();
	const videoId = hash(mp4);
	resources[videoPath] = videoId;
	assets[videoId] = {
		kind: 'video', source: {
			sha256: videoId, bytes: mp4.length, width: 32, height: 18, format: 'mp4', duration: 1,
		},
		recipe, variants: [await variant(mp4, 32, 18, 'video/mp4')],
		poster: await variant(poster, 32, 18, 'image/webp'),
	};
	manifest = parseWebMediaManifest({
		schemaVersion: 1, documents: { [id]: { markdownSha256: hash(markdown), resources } },
		assets, recipes: { [recipe]: recipeText },
	});
	imageAsset = assets[resources[imagePath]];
	videoAsset = assets[resources[videoPath]];
	const main = await processor();
	await check('Fixture galleries, body images and MP4 preserve order and raw Markdown', async () => {
		const raw = await readFile(source);
		const document = discoverMedia(raw.toString('utf8'));
		assert.ok(document.galleries.length > 0);
		assert.ok(document.references.some((ref) => ref.usage === 'body' && ref.kind === 'image'));
		assert.ok(document.references.some((ref) => ref.kind === 'video'));
		assert.equal(document.galleries.length, 2);
		assert.deepEqual(document.references.map((ref) => ref.normalizedPath), [
			secondImagePath, imagePath, imagePath, videoPath, imagePath, secondImagePath, secondImagePath, videoPath,
		]);
		const result = await render(main, raw.toString('utf8'));
		const images = nodes(result.code, 'img'), videos = nodes(result.code, 'video');
		assert.equal(images.length, document.references.filter((ref) => ref.kind === 'image').length);
		assert.equal(videos.length, document.references.filter((ref) => ref.kind === 'video').length);
		assert.equal(nodes(result.code, 'div').filter((node) => attr(node, 'data-gallery') !== undefined).length,
			document.galleries.length);
		const delivered = [];
		const walk = (node) => {
			if (['img', 'video'].includes(node.tagName)) delivered.push(attr(node, 'src'));
			for (const child of node.childNodes ?? []) walk(child);
		};
		walk(parseFragment(result.code));
		assert.deepEqual(delivered, document.references.map((ref) =>
			manifest.assets[manifest.documents[id].resources[ref.normalizedPath]].variants.at(-1).url));
		assert.equal(hash(await readFile(source)), hash(raw));
		assert.equal(nodes(result.code, 'script').length, 0);
	});
	await check('Image/video delivery attrs, original gallery ratio and deployment base', async () => {
		const p = await processor({ base: '/blog/' });
		const result = await render(p, `![ALT](${imagePath})\n\n![VIDEO](${videoPath})\n\n`
			+ gallery(`min-size: 180\ngap: 5\ncorners: 0\n- ![[${imagePath}]]`));
		const image = nodes(result.code, 'img')[0], video = nodes(result.code, 'video')[0];
		assert.equal(attr(image, 'src'), `/blog${imageAsset.variants.at(-1).url}`);
		assert.equal(attr(image, 'srcset'), imageAsset.variants.map((v) => `/blog${v.url} ${v.width}w`).join(', '));
		for (const [key, value] of Object.entries({ class: 'dsi-image', loading: 'lazy', decoding: 'async',
			sizes: 'auto, (max-width: 48rem) 100vw, 44rem', width: String(imageAsset.variants.at(-1).width),
			height: String(imageAsset.variants.at(-1).height) })) assert.equal(attr(image, key), value);
		assert.equal(attr(video, 'src'), `/blog${videoAsset.variants[0].url}`);
		assert.equal(attr(video, 'poster'), `/blog${videoAsset.poster.url}`);
		assert.equal(attr(video, 'preload'), 'metadata');
		assert.equal(attr(video, 'aria-label'), 'VIDEO');
		assert.equal(attr(video, 'controls'), '');
		assert.equal(attr(video, 'playsinline'), '');
		assert.equal(attr(video, 'autoplay'), undefined);
		assert.equal(attr(video, 'loop'), undefined);
		const figure = nodes(result.code, 'figure')[0];
		assert.equal(attr(figure, 'data-media-reference'), '2');
		assert.equal(attr(figure, 'data-aspect-ratio'), String(imageAsset.source.width / imageAsset.source.height));
		const container = nodes(result.code, 'div').find((node) => attr(node, 'data-gallery') !== undefined);
		assert.equal(attr(container, 'data-target-row-height'), '180');
		assert.equal(attr(container, 'data-gallery-gap'), '5');
		assert.equal(attr(container, 'data-gallery-corners'), '0');
		assert.equal(attr(container, 'style'), '--media-row-height:180px;--media-gap:5px');
	});
	await check('Literal hostile captions/alt and reference-style images', async () => {
		const hostile = '<script>" & </script>';
		const result = await render(main, `![${hostile}][PHOTO]\n\n[photo]: ${encodeURI(imagePath)}\n\n`
			+ gallery(`- ![[${imagePath}]]\n  caption: ${hostile}`));
		assert.equal(nodes(result.code, 'img').length, 2);
		assert.equal(attr(nodes(result.code, 'img')[0], 'alt'), hostile);
		assert.equal(text(nodes(result.code, 'figcaption')[0]), hostile);
		assert.equal(nodes(result.code, 'script').length, 0);
	});
	await check('Astro headings, highlighted code and footnotes remain unchanged', async () => {
		const ordinary = '# SENTINEL\n\nText[^1]\n\n[^1]: NOTE\n\n```js\nconst sentinel = 1;\n```';
		const plain = await createMarkdownProcessor({ smartypants: false });
		const expected = await render(plain, ordinary), actual = await render(main, ordinary);
		assert.deepEqual(actual.metadata.headings, expected.metadata.headings);
		assert.equal(actual.code, expected.code);
		assert.equal(nodes(actual.code, 'h1').length, 1);
		assert.equal(nodes(actual.code, 'pre').length, 1);
		assert.ok(nodes(actual.code, 'section').some((node) => attr(node, 'data-footnotes') !== undefined));
	});
	await check('Non-opted images and public/remote images retain ordinary rendering', async () => {
		const raw = '![A](/media/a.webp)\n![B](/icons/b.svg)\n![C](https://example.invalid/c.png)';
		const plain = await createMarkdownProcessor({ smartypants: false });
		assert.equal((await render(main, raw)).code, (await render(plain, raw)).code);
		assert.equal((await main.render('![A](vault.png)')).code, (await plain.render('![A](vault.png)')).code);
	});
	await check('Missing identity/mapping, invalid paths, options and gallery kind fail', async () => {
		await assert.rejects(main.render(gallery(`- ![[${imagePath}]]`)), /requires frontmatter.mediaId/);
		await assert.rejects(render(main, 'x', 'unknown'), /Unknown article mediaId/);
		await assert.rejects(render(main, '![](unknown.png)'), /Missing prepared media mapping/);
		await assert.rejects(render(main, '![](../bad.png)'), /Parent traversal/);
		await assert.rejects(render(main, '![](C:/bad.png)'), /relative/);
		await assert.rejects(render(main, gallery(`unknown: 1\n- ![[${imagePath}]]`)), /Invalid simple-gallery/);
		await assert.rejects(render(main, gallery(`- ![[${videoPath}]]`)), /must be images/);
		const wrong = structuredClone(manifest);
		wrong.documents[id].resources[imagePath] = wrong.documents[id].resources[videoPath];
		await assert.rejects(render(await processor({ manifest: wrong }), `![](${imagePath})`), /kind differs/);
	});
	await check('Missing and hash-corrupt variants/poster fail in sandbox only', async () => {
		const variants = [...imageAsset.variants, ...videoAsset.variants, videoAsset.poster];
		await mkdir(join(corruptPublicDir, 'media'), { recursive: true });
		for (const variant of variants) await copyFile(join(publicDir, variant.url.slice(1)), join(corruptPublicDir, variant.url.slice(1)));
		for (const variant of [imageAsset.variants[0], videoAsset.poster]) {
			const path = join(corruptPublicDir, variant.url.slice(1)), original = await readFile(path);
			const markdown = `![](${variant === videoAsset.poster ? videoPath : imagePath})`;
			await rm(path);
			await assert.rejects(render(await processor({ publicDir: corruptPublicDir }), markdown), /ENOENT/);
			const corrupted = Buffer.from(original);
			corrupted[0] ^= 1;
			await writeFile(path, corrupted);
			await assert.rejects(render(await processor({ publicDir: corruptPublicDir }), markdown), /Corrupt prepared media/);
			await writeFile(path, original);
		}
	});
	await check('Shared classifier matches discovered references including diagnostics', async () => {
		const markdown = '![](a.jpg) ![](../bad.png) ![](C:/bad.png) ![](x.mp4) ![](https://x/a.jpg)';
		assert.deepEqual(discoverMedia(markdown).references,
			['a.jpg', '../bad.png', 'C:/bad.png', 'x.mp4'].map((ref) => classifyMediaReference(ref, 'body', '')));
		assert.equal(classifyMediaReference('//example.invalid/a.jpg', 'body', ''), null);
	});
	console.log(`Article media verification passed: ${passed} cases`);
} finally {
	await rm(sandbox, { recursive: true, force: true });
}
