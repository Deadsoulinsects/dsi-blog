import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createAdminLocal } from './admin/local.mjs';
import integration from './admin/integration.mjs';
import { mediaBudgetReport } from './admin/budget.mjs';
import { WEB_MEDIA_POLICY } from '../src/shared/content/web-media.mjs';
import { hashFile, readManifest } from './media/store.mjs';
import { verifyAdminHttp } from './admin/verify-http.mjs';

const qaRoot = process.platform === 'win32' ? 'D:/ai-output' : tmpdir();
await mkdir(qaRoot, { recursive: true });
const sandbox = await mkdtemp(join(qaRoot, 'dsi-admin-local-'));
let passed = 0;
async function check(name, action) {
	await action(); passed++; console.log(`[pass] ${name}`);
}
const body = '![](photo.png)\n\n```simple-gallery\n- ![[copy.png]]\n```\n\n[Other](other.md)\n';
const official = (text = body, metadata = 'title: Official\ndescription: Description\ncompletion_date: 2026-10-01\nmediaId: note') => `---\n${metadata}\n---\n${text}`;
async function fixture(name) {
	const directory = join(sandbox, name), repoRoot = join(directory, 'repo'), sourceRoot = join(directory, 'source');
	await mkdir(join(repoRoot, 'src/content/blog'), { recursive: true });
	await mkdir(sourceRoot, { recursive: true });
	const image = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#ff000080' } }).png().toBuffer();
	for (const name of ['photo.png', 'copy.png']) await writeFile(join(sourceRoot, name), image);
	const note = join(sourceRoot, 'note.md'), target = join(repoRoot, 'src/content/blog/note.md');
	await writeFile(note, body);
	await writeFile(target, official(body.replace('(other.md)', '(/blog/other/)')));
	await writeFile(join(repoRoot, 'src/content/blog/other.md'), official('OTHER'));
	const api = createAdminLocal({ repoRoot });
	return { api, repoRoot, sourceRoot, note, target, input: { note, sourceRoot, id: '', ffmpeg: '', ffprobe: '' } };
}
async function completed(api, input) {
	let job = await api.prepare(input);
	assert.equal(job.state, 'queued');
	const deadline = AbortSignal.timeout(15_000);
	while (!['succeeded', 'failed'].includes(job.state)) job = await api.waitJob(job.id, job.revision, { signal: deadline });
	return job;
}
async function filesAt(root) {
	const names = await readdir(join(root, 'public/media'));
	return Promise.all(names.map(async (name) => [name, await hashFile(join(root, 'public/media', name))]));
}

try {
	await check('Shared recipe planning, reuse, exact progress, official metadata and real Astro rendering', async () => {
		const f = await fixture('reuse');
		const sourceBefore = await readFile(f.note), targetBefore = await readFile(f.target);
		const initial = await f.api.inspect(f.input);
		assert.deepEqual(initial.resources.map((item) => item.action), ['convert', 'deduplicated']);
		assert.equal(initial.counts.galleries, 1);
		assert.equal(initial.metadata.owner, 'official');
		assert.equal(initial.metadata.values.title, 'Official');
		assert.equal(initial.formal.ready, false);
		const job = await completed(f.api, f.input);
		assert.equal(job.state, 'succeeded', job.error);
		assert.equal(job.report.formal.ready, true);
		assert.equal(job.report.formal.rendered, true);
		assert.deepEqual(job.events.filter((event) => event.state === 'running' && event.progress).map((event) => event.progress), [
			{ completed: 1, total: 2, action: 'converted', kind: 'image' },
			{ completed: 2, total: 2, action: 'deduplicated', kind: 'image' },
		]);
		assert.deepEqual(job.report.resources.map((item) => item.action), ['reused', 'deduplicated']);
		const manifest = await readManifest(join(f.repoRoot, 'src/data/media-manifest.json'));
		assert.deepEqual(job.report.resources.map((item) => item.key), Object.values(manifest.documents.note.resources));
		assert.equal((await completed(f.api, f.input)).result.preparation.manifestChanged, false);
		assert.deepEqual(await readFile(f.note), sourceBefore);
		assert.deepEqual(await readFile(f.target), targetBefore);
	});
	await check('Missing and unsafe references are fully reported and cannot prepare', async () => {
		const f = await fixture('missing');
		await writeFile(f.note, '![](missing.png)\n![](../escape.png)');
		const report = await f.api.inspect(f.input);
		assert.equal(report.canPrepare, false);
		assert.equal(report.counts.missing, 1);
		assert.equal(report.resources.length, 2);
		assert.equal(report.resources[1].status, 'error');
		assert.equal(report.resources[1].action, 'blocked');
		assert.equal((await completed(f.api, f.input)).state, 'failed');
	});
	await check('Invalid official metadata and missing official frontmatter block readiness', async () => {
		const f = await fixture('metadata');
		await completed(f.api, f.input);
		for (const metadata of ['title: 42\ndescription: x\ncompletion_date: bad\nmediaId: note', 'title: X\ncompletion_date: 2026-10-01\nmediaId: note', 'title: X\ndescription: x\ncompletion_date: 2026-02-30\nmediaId: note', 'title: X\ndescription: x\ncompletion_date: 2026-10-01\ntopic: []\nmediaId: note']) {
			await writeFile(f.target, official(body, metadata));
			const report = await f.api.inspect(f.input);
			assert.equal(report.formal.ready, false);
			assert.ok(report.metadata.requirements.length);
		}
		await writeFile(f.target, body);
		assert.equal((await f.api.inspect(f.input)).formal.ready, false);
	});
	await check('Source/manifest fingerprints, official body and derivative integrity are live readiness gates', async () => {
		const f = await fixture('stale');
		await completed(f.api, f.input);
		await writeFile(f.note, `${body}\nCHANGED`);
		assert.equal((await f.api.inspect(f.input)).formal.ready, false);
		await writeFile(f.note, body);
		await writeFile(f.target, official('DIFFERENT'));
		assert.equal((await f.api.inspect(f.input)).formal.ready, false);
		await writeFile(f.target, official(body));
		const manifestFile = join(f.repoRoot, 'src/data/media-manifest.json');
		const original = await readFile(manifestFile, 'utf8');
		const manifest = JSON.parse(original);
		manifest.documents.note.markdownSha256 = '0'.repeat(64);
		await writeFile(manifestFile, JSON.stringify(manifest));
		assert.equal((await f.api.inspect(f.input)).formal.ready, false);
		await writeFile(manifestFile, original);
		await writeFile(join(f.sourceRoot, 'photo.png'), 'replacement');
		assert.equal((await f.api.inspect(f.input)).formal.ready, false);
		const copy = await readFile(join(f.sourceRoot, 'copy.png'));
		await writeFile(join(f.sourceRoot, 'photo.png'), copy);
		const variant = Object.values(manifest.assets)[0].variants[0];
		await writeFile(join(f.repoRoot, 'public', variant.url.slice(1)), 'corrupt');
		const corrupted = await f.api.inspect(f.input);
		assert.equal(corrupted.formal.ready, false);
		assert.equal(corrupted.formal.rendered, false);
		assert.equal(corrupted.resources[0].action, 'convert');
	});
	await check('Encoding failure preserves manifest and existing asset bytes; no partial job result', async () => {
		const f = await fixture('failure');
		await completed(f.api, f.input);
		const manifestFile = join(f.repoRoot, 'src/data/media-manifest.json');
		const before = await readFile(manifestFile), assets = await filesAt(f.repoRoot);
		await writeFile(join(f.sourceRoot, 'broken.svg'), '<svg/>');
		await writeFile(f.note, '![](photo.png)\n![](broken.svg)');
		const job = await completed(f.api, f.input);
		assert.equal(job.state, 'failed');
		assert.equal(job.result, null);
		assert.equal(job.report, null);
		assert.ok(job.error);
		assert.deepEqual(await readFile(manifestFile), before);
		assert.deepEqual(await filesAt(f.repoRoot), assets);
		assert.deepEqual(await readdir(join(f.repoRoot, '.media-work')), []);
	});

	await check('Busy reservation covers asynchronous validation; exact long-poll state transitions', async () => {
		const f = await fixture('busy');
		const first = f.api.prepare(f.input);
		await assert.rejects(f.api.prepare(f.input), (error) => error.status === 409);
		let job = await first;
		const running = f.api.waitJob(job.id, job.revision, { signal: AbortSignal.timeout(15_000) });
		job = await running;
		assert.equal(job.state, 'running');
		while (!['succeeded', 'failed'].includes(job.state)) job = await f.api.waitJob(job.id, job.revision, { signal: AbortSignal.timeout(15_000) });
		assert.equal(job.state, 'succeeded');
		assert.equal((await f.api.waitJob(job.id, job.revision)).revision, job.revision);
	});
	await check('HTTP same-origin/path/content guards and browser-compatible GET long-poll', async () => {
		await verifyAdminHttp(fixture);
	});

	await check('Astro reconfiguration and module reload retain one coordinator; production has no hook', async () => {
		const f = await fixture('restart');
		const middlewares = [];
		const setup = async (factory) => {
			const addon = factory();
			assert.deepEqual(Object.keys(addon.hooks).sort(), ['astro:config:done', 'astro:server:setup']);
			await addon.hooks['astro:config:done']({ config: { root: pathToFileURL(`${f.repoRoot}/`) } });
			await addon.hooks['astro:server:setup']({ server: { middlewares: { use: (middleware) => middlewares.push(middleware) } } });
		};
		await setup(integration);
		const reloaded = await import('./admin/integration.mjs?verify-reload');
		await setup(reloaded.default);
		assert.equal(middlewares.length, 4);
		assert.equal(middlewares[0], middlewares[2]);
		assert.equal(typeof middlewares[1], 'function');
		assert.equal(typeof middlewares[3], 'function');
	});
	await check('Committed preparation stays succeeded when post-commit inspection fails explicitly', async () => {
		const f = await fixture('inspection-failure');
		await rm(f.target); await mkdir(f.target);
		const job = await completed(f.api, f.input);
		assert.equal(job.state, 'succeeded');
		assert.ok(job.result.preparation.manifest);
		assert.equal(job.report, null);
		assert.ok(job.errors.length);
		assert.ok(Object.keys((await readManifest(job.result.preparation.manifest)).assets).length);
	});
	await check('Source YAML validation and unresolved shared Markdown links block formal readiness', async () => {
		const f = await fixture('source-validation');
		await writeFile(f.note, `---
title: [
---
${body}`);
		const malformed = await f.api.inspect(f.input);
		assert.equal(malformed.metadata.owner, 'official');
		assert.equal(malformed.canPrepare, false);
		assert.equal(malformed.formal.ready, false);
		await writeFile(f.note, `${body}
[Absent](absent.md)`);
		await writeFile(f.target, official(`${body}
[Absent](absent.md)`));
		const job = await completed(f.api, f.input);
		assert.equal(job.state, 'succeeded');
		assert.equal(job.report.formal.ready, false);
		assert.ok(job.report.formal.errors.length);
	});
	await check('Shared document/file/store budgets survive reuse and count URLs only once', async () => {
		const limit = WEB_MEDIA_POLICY.budget;
		const assets = Object.fromEntries(['a', 'b', 'c'].map((key) => [key, { variants: [{ url: `${key}.webp`, bytes: 18 * 1048576 }] }]));
		const resources = ['a', 'b', 'c', 'a'].map((key) => ({ key }));
		const recommended = mediaBudgetReport({ resources, manifest: { assets }, storeBytes: 54 * 1048576 });
		assert.equal(recommended.summary.documentBytes, 54 * 1048576);
		assert.equal(recommended.summary.webFiles, 3);
		assert.equal(recommended.warnings.length, 1);
		assert.equal(recommended.errors.length, 0);
		for (const asset of Object.values(assets)) asset.variants[0].bytes = limit.fileBytes + 10 * 1048576;
		const hard = mediaBudgetReport({ resources, manifest: { assets }, storeBytes: limit.storeBytes + 1 });
		assert.equal(hard.errors.length, 3);
		const f = await fixture('budget-reuse');
		const first = await completed(f.api, f.input);
		const reused = await f.api.inspect(f.input);
		assert.equal(reused.budget.documentBytes, first.result.preparation.documentBytes);
		assert.equal(reused.budget.webFiles, first.result.preparation.webFiles);
	});
	console.log(`Admin local verification passed: ${passed} cases`);
} finally {
	sharp.cache(false);
	await rm(sandbox, { recursive: true, force: true });
}
