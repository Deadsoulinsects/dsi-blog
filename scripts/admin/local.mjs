import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { slug } from 'github-slugger';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { splitMarkdownSource, stripArticleHeader, normalizeFrontmatter, isValidTitle, isValidCompletionDate } from '../../src/shared/content/frontmatter.mjs';
import { createContentIndex, normalizeMarkdownLinks } from '../../src/shared/content/links.mjs';
import { discoverMedia } from '../../src/shared/content/media.mjs';
import { WEB_MEDIA_POLICY } from '../../src/shared/content/web-media.mjs';
import { remarkWebMedia } from '../../src/shared/content/remark-web-media.mjs';
import { prepareWebMedia } from '../media/prepare.mjs';
import { hashFile, inventory, readOptional, readManifest, sha256, sourceFile } from '../media/store.mjs';
import { planResources } from './plan.mjs';
import { selectLocalSource } from './selection.mjs';
import { blogSchema, metadataOf } from './metadata.mjs';
import { mediaBudgetReport } from './budget.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const terminal = (job) => ['succeeded', 'failed'].includes(job.state);
const loopback = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

async function contentFiles(root) {
	const files = [];
	for (const collection of ['blog', 'docs']) {
		const walk = async (directory) => {
			let entries;
			try { entries = await readdir(join(root, directory), { withFileTypes: true }); }
			catch (error) { if (error.code === 'ENOENT') return; throw error; }
			for (const entry of entries) {
				const path = `${directory}/${entry.name}`;
				if (entry.isDirectory()) await walk(path);
				else if (entry.isFile() && entry.name.endsWith('.md')) files.push({ path, collection });
			}
		};
		await walk(`src/content/${collection}`);
	}
	return files;
}

/** Sandboxable factory. Request bodies can never select a store, destination or command arguments. */
export function createAdminLocal({ repoRoot = process.cwd(), waitTimeoutMs = 25_000, resolveSource } = {}) {
	const storeRoot = resolve(repoRoot);
	const events = new EventEmitter();
	const jobs = new Map();
	let active = null;

	const selection = (input) => selectLocalSource(input, storeRoot);

	async function inspectSelected(selected, ignoreBusy = false) {
		const { id, name, note, sourceRoot } = selected;
		const sourceText = await readFile(note, 'utf8');
		const source = splitMarkdownSource(sourceText);
		source.body = stripArticleHeader(source.body);
		const document = discoverMedia(source.body);
		const errors = [...document.diagnostics];
		const warnings = [];
		const readinessErrors = [];
		const targetPath = `src/content/blog/${name}`;
		let officialText = null;
		try { officialText = await readFile(await sourceFile(storeRoot, targetPath), 'utf8'); }
		catch (error) {
			if (/Missing or ambiguous attachment/u.test(error.message) || error.code === 'ENOENT')
				readinessErrors.push('Official article is absent. Run explicit sync:blog -- --file <note>, then content preparation; this backend never writes articles.');
			else throw error;
		}
		const target = officialText === null ? null : splitMarkdownSource(officialText);
		if (target) target.body = stripArticleHeader(target.body);
		if (target && target.frontmatter === null) readinessErrors.push('Official article requires its own frontmatter; run content preparation and set mediaId.');
		let metadata = {};
		const owner = target?.frontmatter !== null && target ? 'official' : 'source';
		try { metadata = metadataOf(owner === 'official' ? target : source); }
		catch (error) { errors.push(error.message); }
		if (owner === 'official') {
			try { metadataOf(source); }
			catch (error) { errors.push(`Source frontmatter: ${error.message}`); }
		}
		const schemaResult = blogSchema.safeParse(metadata);
		const requirements = schemaResult.success ? [] : schemaResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
		if (!isValidTitle(metadata.title)) requirements.push('title must be nonempty text');
		if (typeof metadata.description !== 'string' || !metadata.description.trim()) requirements.push('description must be nonempty text');
		if (!isValidCompletionDate(metadata.completion_date)) requirements.push('completion_date must be a valid date');
		if (typeof metadata.completion_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(metadata.completion_date.trim()))
			requirements.push('completion_date must use YYYY-MM-DD.');
		if (metadata.topic !== undefined && typeof metadata.topic !== 'string') requirements.push('topic must be text');
		if (metadata.mediaId !== undefined && (typeof metadata.mediaId !== 'string' || !metadata.mediaId.length))
			requirements.push('mediaId must be nonempty text');
		if (metadata.mediaId !== id) readinessErrors.push(`Set mediaId: ${id} in official frontmatter (owned by the official article).`);
		readinessErrors.push(...requirements);
		if (!source.body.trim()) readinessErrors.push('Selected article body must be nonempty.');
		if (!source.closed) errors.push('Unclosed source frontmatter.');
		const normalizedDraftText = normalizeFrontmatter(source.normalized, {
			fileName: name, collection: 'blog',
		});
		const manifestFile = join(storeRoot, 'src/data/media-manifest.json');
		const manifestText = await readOptional(manifestFile);
		const manifest = await readManifest(manifestFile);
		const resources = await planResources({ document, sourceRoot, storeRoot, manifest, ...selected, resolveSource });
		for (const resource of resources) {
			if (resource.error) errors.push(`${resource.path}: ${resource.error}`);
			if (!resource.intact || manifest.documents[id]?.resources[resource.path] !== resource.key)
				readinessErrors.push(`Prepare current media: ${resource.path}`);
		}
		const budget = mediaBudgetReport({ resources, manifest, storeBytes: (await inventory(storeRoot, manifest)).storeBytes });
		warnings.push(...budget.warnings);
		errors.push(...budget.errors);
		const snapshot = sha256(sourceText);
		if (manifest.documents[id]?.markdownSha256 !== snapshot)
			readinessErrors.push('Source snapshot differs from manifest. Prepare this selected note again.');
		if (Object.keys(manifest.documents[id]?.resources ?? {}).length !== resources.length)
			readinessErrors.push('Manifest reference set differs from the selected note. Prepare again.');
		const files = await contentFiles(storeRoot);
		if (!files.some((file) => file.path === targetPath)) files.push({ path: targetPath, collection: 'blog' });
		const index = createContentIndex(files);
		const normalizedSource = normalizeMarkdownLinks(source.body, targetPath, index);
		readinessErrors.push(...normalizedSource.unresolvedLinks.map((link) => `Unresolved Markdown link: ${link}`));
		if (target && normalizeMarkdownLinks(target.body, targetPath, index).content.trim() !== normalizedSource.content.trim())
			readinessErrors.push('Official body differs from selected source. Run explicit sync:blog -- --file <note>, then content preparation.');
		let rendered = false;
		if (target) {
			try {
				const processor = await createMarkdownProcessor({
					remarkPlugins: [[remarkWebMedia, { manifest, publicDir: join(storeRoot, 'public') }]],
				});
				await processor.render(target.body, { frontmatter: metadata, fileURL: pathToFileURL(join(storeRoot, targetPath)) });
				rendered = true;
			} catch (error) { readinessErrors.push(`Official Astro rendering failed: ${error.message}`); }
		}
		if (await readFile(note, 'utf8') !== sourceText || await readOptional(manifestFile) !== manifestText
			|| (target && await readFile(join(storeRoot, targetPath), 'utf8') !== officialText))
			readinessErrors.push('Files changed during inspection. Inspect again.');
		for (const resource of resources.filter((item) => item.file)) {
			if ((await hashFile(resource.file)).sha256 !== resource.sha256)
				readinessErrors.push(`Source changed during inspection: ${resource.path}`);
		}
		if (active && !ignoreBusy) readinessErrors.push('Preparation is active; readiness is invalid until the fresh job inspection.');
		return {
			id, note, sourceRoot, sourceText, body: source.body, normalizedDraftText, snapshot,
			metadata: { owner, values: metadata, requirements },
			references: document.references, resources,
			counts: { references: document.references.length, resources: resources.length,
				galleries: document.galleries.length, videos: document.references.filter((ref) => ref.kind === 'video').length,
				matched: resources.filter((ref) => ref.status === 'matched').length,
				missing: resources.filter((ref) => ref.status === 'missing').length },
			budget: budget.summary, warnings, errors, canPrepare: errors.length === 0,
			instructions: { sync: `npm run sync:blog -- --file ${JSON.stringify(note)}`, normalize: 'npm run content:prepare', build: 'npm run build:astro' },
			formal: { path: targetPath, url: `/blog/${slug(name.slice(0, -3))}/`, rendered,
				ready: errors.length === 0 && readinessErrors.length === 0, errors: readinessErrors },
		};
	}

	const snapshotJob = (job) => structuredClone(job);
	const update = (job, values) => {
		Object.assign(job, values, { revision: job.revision + 1 });
		job.events.push({ revision: job.revision, state: job.state, progress: structuredClone(job.progress) });
		events.emit(job.id, snapshotJob(job));
	};
	async function prepare(input) {
		if (active) throw fail(409, 'A preparation job is already active.');
		active = 'validating';
		let selected;
		try { selected = await selection(input); }
		catch (error) { active = null; throw error; }
		for (const [key, job] of jobs) if (jobs.size >= 100 && terminal(job)) jobs.delete(key);
		const job = { id: randomUUID(), state: 'queued', revision: 0, progress: null, result: null, report: null, error: null, errors: [], events: [{ revision: 0, state: 'queued', progress: null }] };
		jobs.set(job.id, job);
		active = job.id;
		setImmediate(async () => {
			update(job, { state: 'running' });
			try {
				metadataOf(splitMarkdownSource(await readFile(selected.note, 'utf8')));
				const result = await prepareWebMedia({ ...selected, storeRoot,
					onProgress: (progress) => update(job, { progress }) });
				let inspection = null;
				try { inspection = await inspectSelected(selected, true); }
				catch (error) { job.errors.push(`Media committed; fresh inspection failed. Inspect again: ${error.message}`); }
				update(job, { state: 'succeeded', report: inspection, result: { preparation: result, inspection } });
			} catch (error) { update(job, { state: 'failed', result: null, report: null, error: error.message, errors: [error.message] }); }
			finally { active = null; }
		});
		return snapshotJob(job);
	}
	function getJob(id) {
		const job = jobs.get(id);
		if (!job) throw fail(404, 'Unknown or expired job.');
		return snapshotJob(job);
	}
	function waitJob(id, after, { signal } = {}) {
		const current = getJob(id);
		if (current.revision > after || terminal(current)) return Promise.resolve(current);
		return new Promise((resolvePromise, reject) => {
			const cleanup = () => { clearTimeout(timer); events.off(id, changed); signal?.removeEventListener('abort', aborted); };
			const changed = (job) => { cleanup(); resolvePromise(job); };
			const aborted = () => { cleanup(); reject(fail(499, 'Request disconnected.')); };
			const timer = setTimeout(() => changed(getJob(id)), waitTimeoutMs);
			events.once(id, changed);
			signal?.addEventListener('abort', aborted, { once: true });
			if (signal?.aborted) aborted();
		});
	}
	async function middleware(req, res, next) {
		if (!req.url?.startsWith('/__admin-local')) return next();
		const send = (status, data) => {
			if (res.destroyed) return;
			res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff' });
			res.end(JSON.stringify(data));
		};
		try {
			const host = req.headers.host;
			const base = new URL(`http://${host}`);
			const peer = req.socket.remoteAddress;
			const origin = req.headers.origin;
			const sameOrigin = origin === base.origin || (req.method === 'GET' && origin === undefined
				&& req.headers['sec-fetch-site'] === 'same-origin');
			if (!loopback(base.hostname) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
				|| base.host !== host || !sameOrigin)
				throw fail(403, 'Exact same-origin localhost requests only.');
			const url = new URL(req.url, base);
			if (url.origin !== base.origin) throw fail(403, 'Invalid request path.');
			if (req.method === 'GET' && url.pathname === '/__admin-local/capabilities') {
				return send(200, { available: true, devOnly: true, readOnlySource: true,
					canInspect: true, canPrepare: true, canSync: false, canPublish: false,
					jobTransport: 'long-poll', policy: WEB_MEDIA_POLICY, busy: !!active });
			}
			const match = url.pathname.match(/^\/__admin-local\/jobs\/([a-f0-9-]{36})$/u);
			if (req.method === 'GET' && match) {
				const after = url.searchParams.get('after');
				if (after !== null && !/^\d{1,10}$/u.test(after)) throw fail(400, 'after must be a nonnegative revision.');
				const abort = new AbortController();
				const close = () => abort.abort();
				res.once('close', close);
				try { return send(200, after === null ? getJob(match[1]) : await waitJob(match[1], Number(after), { signal: abort.signal })); }
				finally { res.off('close', close); }
			}
			if (req.method !== 'POST' || !['/__admin-local/inspect', '/__admin-local/prepare'].includes(url.pathname))
				throw fail(404, 'Unknown local admin endpoint.');
			if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] ?? ''))
				throw fail(415, 'application/json is required.');
			if (Number(req.headers['content-length']) > 16_384) throw fail(413, 'JSON request exceeds 16 KiB.');
			const chunks = [];
			let bytes = 0;
			for await (const chunk of req) {
				bytes += chunk.length;
				if (bytes > 16_384) throw fail(413, 'JSON request exceeds 16 KiB.');
				chunks.push(chunk);
			}
			let input;
			try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
			catch { throw fail(400, 'Invalid JSON.'); }
			if (url.pathname.endsWith('/inspect')) send(200, await inspectSelected(await selection(input)));
			else send(202, await prepare(input));
		} catch (error) { send(error.status ?? (['ENOENT', 'ENOTDIR'].includes(error.code) ? 400 : 500), { error: error.message }); }
	}
	return { middleware, inspect: async (input) => inspectSelected(await selection(input)), prepare, getJob, waitJob };
}
