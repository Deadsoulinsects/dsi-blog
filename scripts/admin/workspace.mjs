import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { parseDocument, isMap } from 'yaml';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { discoverMedia } from '../../src/shared/content/media.mjs';
import { createSourceResolver } from '../../src/shared/content/source-resolver.mjs';
import { createContentIndex, normalizeMarkdownLinks } from '../../src/shared/content/links.mjs';
import { isValidCompletionDate, isValidPubDate, splitMarkdownSource } from '../../src/shared/content/frontmatter.mjs';
import { remarkWebMedia } from '../../src/shared/content/remark-web-media.mjs';
import { parseWebMediaManifest, WEB_MEDIA_POLICY } from '../../src/shared/content/web-media.mjs';
import { prepareWebMedia } from '../media/prepare.mjs';
import { assetFiles, assetIntact, hashFile, inventory, manifestText, readManifest } from '../media/store.mjs';
import { createRepositoryGit } from './workspace-git.mjs';
import { createWorkspaceTopics } from './workspace-topics.mjs';
import { committedWorkspaceTree, validateWorkspaceTree } from './workspace-validation.mjs';
import {
	hash, contains, unix, isPublishingCopy, optionalBytes, atomicJson, parseArticle, articleMarkdown, applySourceArticle, sourceMatchesArticle,
	command, markdownFiles, codeFingerprint, snapshotRepository,
} from './workspace-io.mjs';

const terminal = (state) => ['succeeded', 'failed', 'cancelled'].includes(state);
const metadataFields = ['title', 'description', 'completion_date', 'topicPath'];
const escape = (text) => text.replace(/[&<>"]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[value]);
const input = (value, allowed) => {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((field) => !allowed.includes(field))) {
		throw new Error('操作包含不支持的参数。');
	}
	return value;
};
const publicArticle = (article) => Object.fromEntries([
	'id', 'revision', 'sourcePath', 'targetPath', 'targetFileName', 'mediaId', 'title', 'description',
	'completion_date', 'topic', 'topicPath', 'tags', 'start_date', 'end_date', 'body', 'sourceMissing', 'status', 'preparation',
].map((field) => [field, structuredClone(article[field])]));

/** Persistent workspace. Only commit and an explicitly confirmed publish may mutate the real repository. */
export async function createAdminWorkspace(options) {
	const dataRoot = path.resolve(options.dataRoot);
	const runtimeRoot = path.resolve(options.runtimeRoot || process.cwd());
	for (const name of ['config', 'drafts', 'cache', 'staging', 'logs']) await fs.mkdir(path.join(dataRoot, name), { recursive: true });
	const stateFile = path.join(dataRoot, 'config', 'workspace.json');
	const stored = await optionalBytes(stateFile);
	const state = stored ? JSON.parse(stored) : {
		schemaVersion: 1,
		configuration: { repoRoot: options.repoRoot || '', sourceRoot: options.sourceRoot || '', siteUrl: '', authorName: '', authorEmail: '' },
		articles: [], jobs: [], pending: [], publication: { state: 'idle' }, recovery: [],
	};
	if (state.schemaVersion !== 1) throw new Error('工作区数据版本不受当前程序支持。');
	const topics = createWorkspaceTopics(state);
	const events = new EventEmitter();
	const plans = new Map();
	const queue = [];
	const controllers = new Map();
	const activePreparations = new Map();
	let worker;
	let git;
	let watcher;
	let syncTimer;
	let saving = Promise.resolve();
	let closing = false;
	let critical = false;
	let toolAvailability;
	const changedSources = new Set();
	let contentIndex = createContentIndex([]);
	const tools = { node: process.execPath, git: 'git', ...options.tools };

	function notify(job) {
		events.emit('change', job ? { job: structuredClone(job) } : undefined);
	}
	function persist() {
		const snapshot = structuredClone(state);
		saving = saving.then(() => atomicJson(stateFile, snapshot));
		return saving;
	}
	function select(id) {
		const article = state.articles.find((entry) => entry.id === id);
		if (!article) throw new Error('文章不存在，请刷新列表。');
		return article;
	}
	function selected(ids) {
		if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
			throw new Error('请选择不重复的文章。');
		}
		return ids.map(select);
	}
	function configured() {
		if (!git) throw new Error('请先选择博客仓库。');
	}
	function sourceTopics(file) {
		const directory = path.dirname(file);
		const relative = path.relative(state.configuration.sourceRoot, directory);
		return relative ? relative.split(path.sep).filter(Boolean) : [];
	}
	function normalized(article) {
		const result = normalizeMarkdownLinks(article.body, article.targetPath, contentIndex);
		return { text: articleMarkdown(article, result.content), unresolved: result.unresolvedLinks };
	}
	async function refreshIndex() {
		const files = [];
		for (const collection of ['blog', 'docs']) {
			const root = path.join(state.configuration.repoRoot, 'src/content', collection);
			if (!await fs.stat(root).catch((error) => {
				if (error.code === 'ENOENT') return null;
				throw error;
			})) continue;
			for (const file of await markdownFiles(root)) files.push({ path: unix(path.relative(state.configuration.repoRoot, file)), collection });
		}
		for (const article of state.articles) {
			if (!files.some((file) => file.path === article.targetPath)) files.push({ path: article.targetPath, collection: 'blog' });
		}
		contentIndex = createContentIndex(files);
	}
	async function updateStatuses() {
		if (!git) return;
		const head = await git.revision('HEAD');
		const branch = (await git.run(['symbolic-ref', '--short', 'HEAD'], { allowFailure: true })).stdout.trim();
		const remote = branch ? await git.revision(`refs/remotes/origin/${branch}`) : null;
		const manifestAt = async (revision) => {
			const bytes = await git.blob(revision, 'src/data/media-manifest.json');
			return bytes ? JSON.parse(bytes).documents || {} : {};
		};
		const localDocuments = await manifestAt(head);
		const pushedDocuments = await manifestAt(remote);
		for (const article of state.articles) {
			const candidate = article.outputText;
			const local = await git.blob(head, article.targetPath);
			const pushed = await git.blob(remote, article.targetPath);
			const resourcesMatch = (documents) => article.candidateResources === undefined
				|| JSON.stringify(article.candidateResources) === JSON.stringify(documents[article.mediaId]?.resources || {});
			article.status = article.resourceDirty || !local || hash(local) !== hash(candidate) || !resourcesMatch(localDocuments) ? 'uncommitted'
				: pushed && hash(pushed) === hash(candidate) && resourcesMatch(pushedDocuments) ? 'pushed' : 'committed';
		}
	}
	async function loadRepository() {
		const repoRoot = state.configuration.repoRoot;
		if (!repoRoot) return;
		state.configuration.repoRoot = await fs.realpath(repoRoot);
		if (contains(state.configuration.repoRoot, dataRoot) || contains(dataRoot, state.configuration.repoRoot)) {
			throw new Error(`程序数据目录必须与正式博客仓库分离。\n博客仓库：${state.configuration.repoRoot}\n程序数据：${dataRoot}\n请将 DSI Admin 安装在仓库之外的独立目录，例如 D:\\Apps\\DSI Admin；保留原 data 后再迁移。`);
		}
		await fs.access(path.join(repoRoot, 'astro.config.mjs'));
		await fs.access(path.join(repoRoot, 'src/content/blog'));
		if (!state.configuration.siteUrl) {
			const config = await fs.readFile(path.join(repoRoot, 'astro.config.mjs'), 'utf8');
			const literal = config.match(/\bsite\s*:\s*(['"])(https:\/\/[^'"]+)\1/);
			if (literal) state.configuration.siteUrl = new URL(literal[2]).href;
		}
		git = createRepositoryGit({
			repoRoot, dataRoot, executable: tools.git, getToken: options.getToken,
			author: { name: state.configuration.authorName, email: state.configuration.authorEmail },
		});
		await git.run(['rev-parse', '--show-toplevel']);
		state.recovery = await git.recover();
		for (const file of await markdownFiles(path.join(repoRoot, 'src/content/blog'))) {
			const targetPath = unix(path.relative(repoRoot, file));
			if (state.articles.some((article) => article.targetPath === targetPath)) continue;
			const text = await fs.readFile(file, 'utf8');
			const parsed = parseArticle(text, path.basename(file));
			state.articles.push({
				...parsed, id: randomUUID(), revision: 1, sourcePath: null, sourceHash: null, sourceMissing: false,
				targetPath, targetFileName: path.basename(file), mediaId: parsed.mediaId || `article-${hash(targetPath).slice(0, 16)}`,
				outputText: text, targetHash: hash(text), status: 'uncommitted',
				preparation: { state: 'unchecked', errors: [], warnings: [] }, prepared: null,
			});
		}
		await refreshIndex();
		await updateStatuses();
	}
	function invalidate(article) {
		article.prepared = null;
		article.previewHtml = '';
		article.preparation = { state: 'unchecked', errors: [], warnings: [] };
		plans.clear();
	}
	function startWatcher() {
		watcher?.close();
		clearTimeout(syncTimer);
		if (!state.configuration.sourceRoot) return;
		watcher = watch(state.configuration.sourceRoot, { recursive: true }, (_event, file) => {
			if (file) changedSources.add(path.resolve(state.configuration.sourceRoot, file));
			clearTimeout(syncTimer);
			syncTimer = setTimeout(() => {
				sync().catch(async (error) => {
					state.recovery.push(`来源同步失败：${error.message}`);
					await persist();
					notify();
				});
			}, 100);
		});
		watcher.on('error', (error) => {
			state.recovery.push(`来源监听停止：${error.message}`);
			notify();
		});
	}
	async function validatedSource(file) {
		if (!state.configuration.sourceRoot) throw new Error('请先选择 Obsidian 来源根目录。');
		if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.(md|markdown)$/i.test(file)) throw new Error('请选择绝对路径的 Markdown 文件。');
		const stat = await fs.lstat(file);
		if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw new Error('来源必须是 4 MiB 以内的普通 Markdown 文件。');
		const canonical = await fs.realpath(file);
		if (!contains(state.configuration.sourceRoot, canonical) || contains(state.configuration.repoRoot, canonical)) {
			throw new Error('文章必须位于已授权的 Obsidian 来源目录，而不是正式仓库。');
		}
		if (path.relative(state.configuration.sourceRoot, canonical).split(path.sep).some((part) => part.toLowerCase() === 'picture')) {
			throw new Error('picture 只作为附件目录，不纳入文章。');
		}
		return canonical;
	}

	async function prepareArticle(article, { job, stageRoot, signal }) {
		const candidate = structuredClone(article);
		const revision = article.revision;
		const sourceHash = article.sourceHash;
		job.progress = { phase: 'prepare', articleId: article.id };
		notify(job);
		const sourceFile = article.sourcePath || path.join(state.configuration.repoRoot, article.targetPath);
		if (article.sourceMissing) throw new Error('源文件已经不存在，请重新绑定来源。');
		if (article.sourceError) throw new Error(article.sourceError);
		const document = discoverMedia(candidate.body);
		if (document.diagnostics.length) throw new Error(document.diagnostics.join('\n'));
		const resolveSource = article.sourcePath
			? await createSourceResolver({ note: article.sourcePath, sourceRoot: state.configuration.sourceRoot })
			: null;
		if (resolveSource) {
			const inputs = [];
			for (const reference of new Map(document.references.map((entry) => [entry.normalizedPath, entry])).values()) {
				const file = await resolveSource(reference.normalizedPath);
				inputs.push({ file, hash: (await hashFile(file)).sha256 });
			}
			if (article.revision === revision) article.sourceAssets = inputs;
		}
		const generated = normalized(candidate);
		const noteRoot = path.join(dataRoot, 'drafts', article.id, job.id);
		signal.throwIfAborted();
		const metadataErrors = [];
		if (!candidate.title.trim()) metadataErrors.push('请填写文章标题。');
		if (!candidate.description.trim()) metadataErrors.push('请填写文章描述。');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.completion_date) || !isValidCompletionDate(candidate.completion_date)) metadataErrors.push('完成日期无效，请使用 YYYY-MM-DD 的有效日期。');
		if (!candidate.body.trim()) metadataErrors.push('正文为空，请先在 Obsidian 补充正文。');
		metadataErrors.push(...generated.unresolved.map((link) => `文章链接未解析：${link}`));
		if (metadataErrors.length) {
			if (article.revision === revision) article.preparation = { state: 'blocked', errors: metadataErrors, warnings: [] };
			return null;
		}
		await fs.mkdir(noteRoot, { recursive: true });
		const note = path.join(noteRoot, article.targetFileName);
		await fs.writeFile(note, generated.text);
		const manifestFile = path.join(stageRoot, 'src/data/media-manifest.json');
		const existingManifest = await readManifest(manifestFile);
		// Seed only cached assets, never unrelated draft documents or their Markdown.
		if (article.previewRoot && article.previewRoot !== stageRoot) {
			const cached = await readManifest(path.join(article.previewRoot, 'src/data/media-manifest.json'));
			for (const key of new Set(Object.values(cached.documents[article.mediaId]?.resources || {}))) {
				const asset = cached.assets[key];
				if (!await assetIntact(article.previewRoot, asset)) continue;
				for (const variant of assetFiles(asset)) {
					const target = path.join(stageRoot, 'public', variant.url.slice(1));
					await fs.mkdir(path.dirname(target), { recursive: true });
					await fs.copyFile(path.join(article.previewRoot, 'public', variant.url.slice(1)), target);
				}
				existingManifest.assets[key] = asset;
				existingManifest.recipes[asset.recipe] = cached.recipes[asset.recipe];
			}
			await fs.writeFile(manifestFile, manifestText(existingManifest));
		}
		let mediaReport;
		if (resolveSource || !document.references.length) {
			mediaReport = await prepareWebMedia({
				id: article.mediaId, note, sourceRoot: article.sourcePath ? path.dirname(article.sourcePath) : state.configuration.repoRoot,
				storeRoot: stageRoot, ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe, signal, resolveSource,
				onProgress(progress) {
					job.progress = { phase: 'media', articleId: article.id, ...progress };
					article.preparation.progress = job.progress;
					notify(job);
				},
			});
		} else {
			const existing = existingManifest.documents[article.mediaId];
			if (!existing) throw new Error('该文章的附件来源尚未绑定，请选择原始 Markdown。');
			for (const reference of document.references) {
				const key = existing.resources[reference.normalizedPath];
				if (!key || !await assetIntact(stageRoot, existingManifest.assets[key])) throw new Error('现有网页资源不完整，请绑定原始 Markdown 后准备。');
			}
			existing.markdownSha256 = hash(generated.text);
			await fs.writeFile(manifestFile, manifestText(existingManifest));
		}
		const manifest = await readManifest(manifestFile);
		if (article.revision === revision) {
			article.candidateResources = manifest.documents[article.mediaId].resources;
			article.resourceDirty = false;
		}
		const processor = await createMarkdownProcessor({
			remarkPlugins: [[remarkWebMedia, { manifest, publicDir: path.join(stageRoot, 'public'), base: `/__admin-workspace/media/${article.id}/` }]],
		});
		const rendered = await processor.render(normalizeMarkdownLinks(candidate.body, article.targetPath, contentIndex).content, {
			frontmatter: { mediaId: article.mediaId }, fileURL: pathToFileURL(path.join(stageRoot, article.targetPath)),
		});
		if (article.revision === revision) {
			article.previewRoot = stageRoot;
			article.previewHtml = rendered.code;
		}
		const assets = Object.values(manifest.documents[article.mediaId]?.resources || {}).map((key) => manifest.assets[key]);
		const assetProof = [];
		if (resolveSource) {
			for (const reference of new Map(document.references.map((entry) => [entry.normalizedPath, entry])).values()) {
				const file = await resolveSource(reference.normalizedPath);
				const expected = manifest.assets[manifest.documents[article.mediaId].resources[reference.normalizedPath]].source.sha256;
				if ((await hashFile(file)).sha256 !== expected) throw new Error('原始附件在检查期间变化，请重新准备。');
				assetProof.push({ file, hash: expected });
			}
		}
		for (const asset of assets) if (!await assetIntact(stageRoot, asset)) throw new Error('准备后的网页资源校验失败。');
		signal.throwIfAborted();
		await fs.mkdir(path.dirname(path.join(stageRoot, article.targetPath)), { recursive: true });
		await fs.writeFile(path.join(stageRoot, article.targetPath), generated.text);
		return { article, revision, sourceHash, sourceFile, text: generated.text, assetProof, preparation: {
			state: 'ready', errors: [], warnings: mediaReport?.warnings || [],
			summary: mediaReport ? { converted: mediaReport.converted, reused: mediaReport.reused, documentBytes: mediaReport.documentBytes } : {},
		} };
	}

	async function runQueue() {
		if (worker || critical) return;
		worker = true;
		try {
			while (queue.length) {
				const task = queue.shift();
				const job = state.jobs.find((entry) => entry.id === task.id);
				if (job.state === 'cancelled') continue;
				const controller = new AbortController();
				const preparationRoots = new Set();
				controllers.set(job.id, controller);
				job.state = 'running';
				await persist();
				notify();
				try {
					if (task.kind === 'publication') {
						const root = path.join(dataRoot, 'staging', `publish-${job.id}`);
						try {
							job.progress = { phase: 'snapshot', sha: task.plan.head };
							notify(job);
							await committedWorkspaceTree({ git, sha: task.plan.head, root, runtimeRoot, signal: controller.signal });
							await validateWorkspaceTree({
								root, runtimeRoot, node: tools.node, signal: controller.signal,
								onPhase(phase) { job.progress = { phase, sha: task.plan.head }; notify(job); },
							});
						} finally {
							await fs.rm(root, { recursive: true, force: true });
						}
						controller.signal.throwIfAborted();
						state.publication = { state: 'pushing', sha: task.plan.head, message: '正在推送已确认的提交。' };
						notify();
						await git.push(task.plan);
						state.publication = { state: 'pushed', sha: task.plan.head, message: '推送成功，上线结果仍需确认。' };
						await persist();
						await updateStatuses();
						notify();
						const result = await git.deployment(task.plan, state.configuration.siteUrl, {
							signal: controller.signal, request: options.request,
							onProgress(progress) { state.publication = progress; notify(); },
						});
						state.publication = result;
						if (result.state === 'failed') job.errors.push(result.message);
					} else {
						for (const file of ['astro/templates/content/types.d.ts', 'typescript/lib/lib.es2022.d.ts']) {
							try { await fs.access(path.join(runtimeRoot, 'node_modules', file)); }
							catch (error) {
								if (error.code !== 'ENOENT') throw error;
								throw new Error(`程序安装文件不完整：缺少 ${file}。请更新或重新安装 DSI Admin 并保留 data；这不是文章内容错误。`);
							}
						}
						const stageRoot = path.join(dataRoot, 'staging', `prepare-${job.id}`);
						preparationRoots.add(stageRoot);
						const codeHash = await codeFingerprint(state.configuration.repoRoot);
						job.progress = { phase: 'snapshot' };
						notify(job);
						await snapshotRepository(state.configuration.repoRoot, stageRoot, runtimeRoot);
						const baselineManifest = await readManifest(path.join(stageRoot, 'src/data/media-manifest.json'));
						const candidates = [];
						for (const id of job.articleIds) {
							controller.signal.throwIfAborted();
							const article = select(id);
							const revision = article.revision;
							const title = article.title;
							job.revisions[id] = revision;
							const preparation = new AbortController();
							activePreparations.set(id, { revision, controller: preparation });
							article.prepared = null;
							article.preparation = { state: 'running', errors: [], warnings: [] };
							notify();
							try {
								if (article.previewRoot) preparationRoots.add(article.previewRoot);
								const candidate = await prepareArticle(article, { job, stageRoot, signal: AbortSignal.any([controller.signal, preparation.signal]) });
								if (candidate) candidates.push(candidate);
								else {
									job.results.push({ articleId: id, title, revision,
										state: article.revision !== revision ? 'superseded' : article.preparation.state,
										message: article.revision !== revision ? '已由新版本替代。' : article.preparation.errors.join('\n') });
									activePreparations.delete(id);
								}
							}
							catch (error) {
								if (controller.signal.aborted) throw error;
								const superseded = article.revision !== revision;
								job.results.push({ articleId: id, title, revision, state: superseded ? 'superseded' : 'failed', message: error.message });
								if (!superseded) {
									job.errors.push(`${title}：${error.message}`);
									article.preparation = { state: 'failed', errors: [error.message], warnings: [] };
								}
								activePreparations.delete(id);
								// A failed draft must not replace the formal article in the batch tree.
								const target = path.join(stageRoot, article.targetPath);
								const original = await optionalBytes(path.join(state.configuration.repoRoot, article.targetPath));
								if (original) await fs.writeFile(target, original);
								else await fs.rm(target, { force: true });
								const manifestFile = path.join(stageRoot, 'src/data/media-manifest.json');
								const manifest = await readManifest(manifestFile);
								const document = baselineManifest.documents[article.mediaId];
								if (document) {
									manifest.documents[article.mediaId] = document;
									for (const key of Object.values(document.resources)) {
										const asset = baselineManifest.assets[key];
										manifest.assets[key] = asset;
										manifest.recipes[asset.recipe] = baselineManifest.recipes[asset.recipe];
									}
								} else delete manifest.documents[article.mediaId];
								await fs.writeFile(manifestFile, manifestText(manifest));
							}
						}
						if (candidates.length) {
							await validateWorkspaceTree({
								root: stageRoot, runtimeRoot, node: tools.node, signal: controller.signal,
								onPhase(phase) {
									job.progress = { phase, articleIds: candidates.map(({ article }) => article.id) };
									notify(job);
								},
							});
							if (await codeFingerprint(state.configuration.repoRoot) !== codeHash) throw new Error('准备期间工程代码发生变化，请重新准备。');
							const manifest = await readManifest(path.join(stageRoot, 'src/data/media-manifest.json'));
							for (const candidate of candidates) {
								const { article, revision, sourceHash, sourceFile, text, assetProof, preparation } = candidate;
								const superseded = article.revision !== revision;
								try {
									if (!superseded) {
										if (article.sourceHash !== sourceHash || sourceHash && hash(await fs.readFile(sourceFile)) !== sourceHash) throw new Error('准备期间原文发生变化，请同步后重新准备。');
										for (const asset of assetProof) if ((await hashFile(asset.file)).sha256 !== asset.hash) throw new Error('准备期间原始附件发生变化，请重新准备。');
										for (const key of new Set(Object.values(manifest.documents[article.mediaId].resources))) {
											if (!await assetIntact(stageRoot, manifest.assets[key])) throw new Error('准备后的网页资源校验失败。');
										}
										if (article.revision !== revision) throw new Error('准备期间草稿发生变化，请重新准备。');
										article.outputText = text;
										article.sourceAssets = assetProof;
										article.prepared = { revision, sourceHash, codeHash, textHash: hash(text), stageRoot, assetProof };
										article.preparation = preparation;
									}
									job.results.push({ articleId: article.id, title: article.title, revision,
										state: superseded ? 'superseded' : 'ready', message: superseded ? '已由新版本替代。' : '' });
								} catch (error) {
									const state = article.revision !== revision ? 'superseded' : 'failed';
									job.results.push({ articleId: article.id, title: article.title, revision, state, message: error.message });
									if (state === 'failed') {
										job.errors.push(`${article.title}：${error.message}`);
										article.preparation = { state, errors: [error.message], warnings: [] };
									}
								}
							}
						}
					}
					job.superseded = job.results.length > 0 && job.results.every((result) => result.state === 'superseded');
					job.state = job.errors.length ? 'failed' : 'succeeded';
				} catch (error) {
					job.state = controller.signal.aborted ? 'cancelled' : 'failed';
					job.errors.push(error.message);
					for (const id of job.articleIds) {
						const article = select(id);
						if (job.revisions[id] === article.revision && ['running', 'queued'].includes(article.preparation.state)) {
							article.preparation = { state: job.state, errors: [error.message], warnings: [] };
						}
						if (!job.results.some((result) => result.articleId === id)) {
							job.results.push({ articleId: id, title: article.title, revision: job.revisions[id],
								state: article.revision !== job.revisions[id] ? 'superseded' : job.state, message: error.message });
						}
					}
					if (task.kind === 'publication') {
						state.publication = { ...state.publication, state: state.publication.state === 'pushed' || state.publication.state === 'deploying' ? 'unverified' : 'failed', message: error.message };
					}
				} finally {
					for (const id of job.articleIds) activePreparations.delete(id);
					job.finishedAt = new Date().toISOString();
					controllers.delete(job.id);
					await persist();
					for (const root of preparationRoots) {
						if (path.dirname(root) === path.join(dataRoot, 'staging') && path.basename(root).startsWith('prepare-')
							&& !state.articles.some((article) => article.previewRoot === root || article.prepared?.stageRoot === root)) {
							await fs.rm(root, { recursive: true, force: true });
						}
					}
					notify();
				}
			}
		} finally {
			worker = false;
			events.emit('idle');
		}
	}
	function enqueue(ids, kind = 'preparation', plan, reason = 'manual') {
		if (closing) throw new Error('程序正在退出，不接受新任务。');
		if (kind === 'preparation') {
			let reused;
			const fresh = ids.filter((id) => {
				const article = select(id);
				const active = activePreparations.get(id);
				if (active && active.revision !== article.revision) active.controller.abort(new Error('该次准备已由最新输入替代。'));
				const pending = state.jobs.find((job) => ['queued', 'running'].includes(job.state)
					&& job.articleIds.includes(id) && !job.results.some((result) => result.articleId === id)
					&& (job.state === 'queued' || !activePreparations.has(id) || job.revisions[id] === article.revision));
				if (!pending) return true;
				pending.revisions[id] = article.revision;
				pending.reason = reason;
				reused = pending.id;
				if (!activePreparations.has(id)) article.preparation = { state: 'queued', errors: [], warnings: [] };
				return false;
			});
			if (ids.length && !fresh.length) return { jobId: reused };
			ids = fresh;
		}
		const articles = ids.map(select);
		const job = {
			id: randomUUID(), state: 'queued', articleIds: ids, progress: {}, errors: [],
			createdAt: new Date().toISOString(), reason: kind === 'publication' ? 'publication' : reason,
			revisions: Object.fromEntries(articles.map((article) => [article.id, article.revision])), results: [],
		};
		state.jobs.push(job);
		for (const article of articles) article.preparation = { state: 'queued', errors: [], warnings: [] };
		queue.push({ id: job.id, kind, plan });
		setImmediate(() => runQueue().catch((error) => { state.recovery.push(`任务引擎异常：${error.message}`); notify(); }));
		notify();
		return { jobId: job.id };
	}
	async function sync() {
		if (closing) return structuredClone(state);
		configured();
		let changed = false;
		const changedArticles = [];
		const affected = [...changedSources];
		changedSources.clear();
		for (const article of state.articles.filter((entry) => entry.sourcePath)) {
			const bytes = await optionalBytes(article.sourcePath);
			if (!bytes) {
				if (!article.sourceMissing) { article.sourceMissing = true; invalidate(article); changed = true; }
				continue;
			}
			const references = discoverMedia(article.body).references;
			let mediaChanged = false;
			for (const file of affected.length ? affected : article.sourceAssets?.map((entry) => entry.file) || []) {
				const proof = article.sourceAssets?.find((entry) => entry.file === file || contains(file, entry.file));
				if (proof) {
					const fingerprint = await hashFile(proof.file).catch((error) => {
						if (error.code === 'ENOENT') return null;
						throw error;
					});
					if (fingerprint?.sha256 !== proof.hash) mediaChanged = true;
				} else if (['failed', 'blocked'].includes(article.preparation.state) && references.some((reference) => reference.normalizedPath && (
					unix(path.relative(state.configuration.sourceRoot, file)) === reference.normalizedPath
					|| contains(path.dirname(article.sourcePath), file) && path.basename(file) === path.posix.basename(reference.normalizedPath)))) {
					mediaChanged = true;
				}
			}
			if (article.sourceHash === hash(bytes) && !article.sourceMissing && !article.sourceError && !mediaChanged) continue;
			try {
				applySourceArticle(article, parseArticle(bytes.toString('utf8'), article.targetFileName));
			} catch (error) {
				invalidate(article);
				article.sourceError = error.message;
				article.preparation = { state: 'blocked', errors: [error.message], warnings: [] };
				changed = true;
				continue;
			}
			article.sourceHash = hash(bytes);
			article.sourceMissing = false;
			delete article.sourceError;
			if (mediaChanged) article.resourceDirty = true;
			article.revision += 1;
			article.outputText = normalized(article).text;
			invalidate(article);
			changedArticles.push(article.id);
			changed = true;
		}
		if (changedArticles.length) enqueue(changedArticles, 'preparation', undefined, 'source');
		if (state.configuration.sourceRoot) {
			const files = await markdownFiles(state.configuration.sourceRoot, { excludePicture: true, excludePublishingCopies: true });
			state.pending = files.filter((file) => !state.articles.some((article) => article.sourcePath === file))
				.map((file) => ({ path: file, relativePath: unix(path.relative(state.configuration.sourceRoot, file)), topicPath: sourceTopics(file) }));
		}
		await updateStatuses();
		await persist();
		if (changed) plans.clear();
		notify();
		return structuredClone(state);
	}
	async function stateView() {
		await updateStatuses();
		if (!toolAvailability) {
			toolAvailability = {};
			for (const key of ['git', 'ffmpeg', 'ffprobe']) {
				try { await command(tools[key] || key, key === 'git' ? ['--version'] : ['-version'], { timeout: 10000 }); toolAvailability[key] = true; }
				catch { toolAvailability[key] = false; }
			}
		}
		return {
			configured: Boolean(git), configuration: structuredClone(state.configuration),
			articles: state.articles.map(publicArticle), pending: structuredClone(state.pending),
			topics: await topics.view(state.articles),
			jobs: structuredClone(state.jobs.slice(-100)), tools: structuredClone(toolAvailability),
			publication: structuredClone(state.publication), recovery: structuredClone(state.recovery),
		};
	}
	async function currentProof(article) {
		const prepared = article.prepared;
		if (!prepared || article.preparation.state !== 'ready' || prepared.revision !== article.revision
			|| prepared.textHash !== hash(article.outputText)
			|| prepared.codeHash !== await codeFingerprint(state.configuration.repoRoot)) {
			throw new Error(`${article.title}尚未通过当前版本检查，请重新准备。`);
		}
		if (article.sourcePath && prepared.sourceHash !== hash(await fs.readFile(article.sourcePath))) throw new Error('源文件已经变化，请先同步。');
		for (const asset of prepared.assetProof) if ((await hashFile(asset.file)).sha256 !== asset.hash) throw new Error('原始附件已经变化，请重新准备。');
		if (article.prepared !== prepared || article.revision !== prepared.revision) throw new Error('文章在检查期间变化，请重新确认。');
	}
	async function closure(articles) {
		const committed = (await git.run(['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', 'src/content/blog', 'src/content/docs'])).stdout.split('\0').filter(Boolean);
		const available = new Set([...committed, ...articles.map((article) => article.targetPath)]);
		const closedIndex = createContentIndex([...available].filter((file) => /\.md$/i.test(file)).map((file) => ({
			path: file, collection: file.startsWith('src/content/docs/') ? 'docs' : 'blog',
		})));
		const manifestFile = path.join(state.configuration.repoRoot, 'src/data/media-manifest.json');
		const manifest = await readManifest(manifestFile);
		const files = new Map();
		for (const article of articles) {
			await currentProof(article);
			const links = normalizeMarkdownLinks(article.body, article.targetPath, closedIndex);
			if (links.unresolvedLinks.length) throw new Error(`文章引用了尚未提交且未包含在本次选择中的笔记：${links.unresolvedLinks.join('、')}。请一并选择关联文章。`);
			const stage = await readManifest(path.join(article.prepared.stageRoot, 'src/data/media-manifest.json'));
			manifest.documents[article.mediaId] = stage.documents[article.mediaId];
			files.set(article.targetPath, { kind: 'article', bytes: Buffer.from(article.outputText) });
			for (const key of Object.values(stage.documents[article.mediaId].resources)) {
				const asset = stage.assets[key];
				if (!await assetIntact(article.prepared.stageRoot, asset)) throw new Error('网页派生资源已经变化。');
				manifest.assets[key] = asset;
				manifest.recipes[asset.recipe] = stage.recipes[asset.recipe];
				for (const variant of assetFiles(asset)) {
					files.set(`public${variant.url}`, { kind: 'media', bytes: await fs.readFile(path.join(article.prepared.stageRoot, 'public', variant.url.slice(1))) });
				}
			}
		}
		const reachable = new Set(Object.values(manifest.documents).flatMap((document) => Object.values(document.resources)));
		manifest.assets = Object.fromEntries([...reachable].map((key) => [key, manifest.assets[key]]));
		const recipes = new Set(Object.values(manifest.assets).map((asset) => asset.recipe));
		manifest.recipes = Object.fromEntries([...recipes].map((key) => [key, manifest.recipes[key]]));
		parseWebMediaManifest(manifest);
		files.set('src/data/media-manifest.json', { kind: 'manifest', bytes: Buffer.from(manifestText(manifest)) });
		const changed = [];
		for (const [relative, value] of files) {
			const before = await optionalBytes(path.join(state.configuration.repoRoot, relative));
			if (before && hash(before) === hash(value.bytes)) continue;
			if (value.kind === 'media' && before) throw new Error('同名内容哈希资源已损坏，不能覆盖现有文件。');
			changed.push({ path: relative, ...value, beforeHash: before ? hash(before) : null, before });
		}
		const { storeBytes } = await inventory(state.configuration.repoRoot, manifest);
		const addedBytes = changed.filter((file) => file.kind === 'media').reduce((total, file) => total + file.bytes.length, 0);
		if (storeBytes + addedBytes > WEB_MEDIA_POLICY.budget.storeBytes) throw new Error('合并后的网页媒体库超过共享存储预算。');
		return changed;
	}

	const api = {
		state: stateView,
		subscribe(callback) { events.on('change', callback); return () => events.off('change', callback); },
		async configure(values) {
			input(values, ['repoRoot', 'sourceRoot', 'siteUrl', 'authorName', 'authorEmail']);
			if (critical || worker) throw new Error('任务进行中不能切换来源或仓库。');
			if (typeof values.repoRoot !== 'string' || !path.isAbsolute(values.repoRoot)) throw new Error('请选择博客仓库绝对路径。');
			const repoRoot = await fs.realpath(values.repoRoot);
			const sourceRoot = values.sourceRoot ? await fs.realpath(values.sourceRoot) : '';
			if (contains(repoRoot, dataRoot) || contains(dataRoot, repoRoot)) {
				throw new Error(`无法连接：博客仓库与程序数据目录互相包含。\n博客仓库：${repoRoot}\n程序数据：${dataRoot}\n请把 DSI Admin 安装到仓库以外，例如 D:\\Apps\\DSI Admin，再保存配置。`);
			}
			if (sourceRoot && (contains(repoRoot, sourceRoot) || contains(sourceRoot, repoRoot) || contains(sourceRoot, dataRoot) || contains(dataRoot, sourceRoot))) throw new Error('来源、正式仓库与程序数据目录必须分离。');
			if (values.siteUrl && new URL(values.siteUrl).protocol !== 'https:') throw new Error('正式站地址必须是 HTTPS。');
			await fs.access(path.join(repoRoot, 'astro.config.mjs'));
			await fs.access(path.join(repoRoot, 'src/content/blog'));
			await command(tools.git, ['rev-parse', '--show-toplevel'], { cwd: repoRoot });
			if (critical || worker) throw new Error('准备任务已启动，请完成后再切换仓库。');
			if (state.configuration.repoRoot && repoRoot !== state.configuration.repoRoot && state.articles.some((article) => article.status === 'uncommitted' && (article.sourcePath || article.revision > 1))) {
				throw new Error('仍有未提交草稿，请先处理后再切换仓库。');
			}
			if (repoRoot !== state.configuration.repoRoot) { state.articles = []; delete state.topics; }
			state.configuration = { ...state.configuration, ...values, repoRoot, sourceRoot };
			await loadRepository();
			startWatcher();
			await sync();
			return stateView();
		},
		async scan(values) {
			configured();
			input(values, ['path']);
			if (!state.configuration.sourceRoot || !contains(state.configuration.sourceRoot, path.resolve(values.path))) throw new Error('目录不在已授权来源根内。');
			const root = await fs.realpath(values.path);
			const rootStat = await fs.lstat(values.path);
			if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !contains(state.configuration.sourceRoot, root)) throw new Error('只能扫描授权根内的普通目录，不允许符号链接。');
			if (isPublishingCopy(root)) throw new Error('“博客发布”是历史发布副本目录，请选择实际写作目录的原文。');
			const entries = [];
			const walk = async (directory) => {
				entries.push({ path: directory, relativePath: unix(path.relative(root, directory)), type: 'directory', topicPath: sourceTopics(path.join(directory, '_')), included: false });
				for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
					if (entry.isSymbolicLink()) throw new Error(`导入目录不允许符号链接：${entry.name}`);
					if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'picture' || entry.name === '博客发布') continue;
					const file = path.join(directory, entry.name);
					if (entry.isDirectory()) await walk(file);
					else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) entries.push({ path: file, relativePath: unix(path.relative(root, file)), type: 'markdown', topicPath: sourceTopics(file), included: false });
				}
			};
			await walk(root);
			return { root, entries };
		},
		async importNotes(values) {
			configured();
			input(values, ['paths']);
			if (!Array.isArray(values.paths) || values.paths.length > 1000) throw new Error('请选择最多 1000 篇文章。');
			const articles = [], errors = [], newIds = [];
			for (const requested of new Set(values.paths)) {
				try {
					const file = await validatedSource(requested);
					const existing = state.articles.find((article) => article.sourcePath === file);
					if (existing) { await sync(); articles.push(publicArticle(existing)); continue; }
					if (isPublishingCopy(file)) throw new Error('“博客发布”中的历史副本不再作为新文章纳入，请选择实际原文；旧文章请从文章面板明确改绑。');
					const targetFileName = `${path.basename(file).replace(/\.(md|markdown)$/i, '')}.md`;
					const bytes = await fs.readFile(file);
					const parsed = parseArticle(bytes.toString('utf8'), targetFileName);
					const matching = state.articles.filter((article) => sourceMatchesArticle(article, targetFileName, parsed.title));
					if (matching.length) {
						throw new Error(`存在可能对应的文章：${matching.map((article) => article.targetFileName).join('、')}。请从现有文章面板核对并显式绑定原文，不要重复纳入。`);
					}
					const id = randomUUID();
					const article = {
						...parsed, id, revision: 1, sourcePath: file, sourceHash: hash(bytes), sourceMissing: false,
						targetFileName, targetPath: `src/content/blog/${targetFileName}`,
						mediaId: `article-${id}`, topicPath: parsed.topicFromSource ? parsed.topicPath : sourceTopics(file),
						topic: parsed.topicFromSource ? parsed.topic : sourceTopics(file)[0] || '',
						preparation: { state: 'unchecked', errors: [], warnings: [] }, prepared: null, status: 'uncommitted', targetHash: null,
					};
					state.articles.push(article);
					await refreshIndex();
					article.outputText = normalized(article).text;
					newIds.push(id);
					articles.push(publicArticle(article));
				} catch (error) { errors.push({ path: requested, message: error.message }); }
			}
			if (newIds.length) {
				enqueue(newIds, 'preparation', undefined, 'import');
				for (const article of articles) article.preparation = structuredClone(select(article.id).preparation);
			}
			await persist();
			notify();
			return { articles, errors };
		},
		async bindingCandidates(values) {
			configured();
			input(values, ['id']);
			const article = select(values.id);
			const sourceRoot = state.configuration.sourceRoot;
			if (!sourceRoot) throw new Error('请先选择 Obsidian 来源根目录。');
			const candidates = [];
			for (const file of await markdownFiles(sourceRoot, { excludePicture: true, excludePublishingCopies: true })) {
				if ((await fs.stat(file)).size > 4 * 1024 * 1024) continue;
				const canonical = await validatedSource(file);
				if (state.articles.some((entry) => entry.id !== article.id && entry.sourcePath === canonical)) continue;
				if (!sourceMatchesArticle(article, path.basename(file))) {
					const parts = splitMarkdownSource(await fs.readFile(file, 'utf8'));
					const document = parseDocument(parts.frontmatter || '');
					const title = parts.closed && !document.errors.length && isMap(document.contents) ? document.get('title') : undefined;
					if (typeof title !== 'string' || !sourceMatchesArticle(article, path.basename(file), title)) continue;
				}
				candidates.push({ path: canonical, relativePath: unix(path.relative(sourceRoot, canonical)) });
			}
			return { candidates };
		},
		async bindSource(values) {
			input(values, ['id', 'path']);
			const article = select(values.id);
			const file = await validatedSource(values.path);
			if (state.articles.some((entry) => entry.id !== article.id && entry.sourcePath === file)) throw new Error('此来源已经绑定其他文章。');
			const bytes = await fs.readFile(file);
			applySourceArticle(article, parseArticle(bytes.toString('utf8'), article.targetFileName));
			article.sourcePath = file;
			article.sourceHash = hash(bytes);
			article.sourceMissing = false;
			delete article.sourceError;
			article.revision += 1;
			article.outputText = normalized(article).text;
			invalidate(article);
			enqueue([article.id], 'preparation', undefined, 'binding');
			await persist();
			return publicArticle(article);
		},
		async updateArticle(values) {
			input(values, ['id', 'revision', 'metadata']);
			input(values.metadata, metadataFields);
			const article = select(values.id);
			if (values.revision !== article.revision) throw new Error('文章版本已变化，请刷新后重试；你的输入仍应保留。');
			for (const field of ['title', 'description', 'completion_date']) if (typeof values.metadata[field] !== 'string') throw new Error(`${field} 必须是文本。`);
			if (!Array.isArray(values.metadata.topicPath) || values.metadata.topicPath.some((part) => typeof part !== 'string' || !part.trim() || /[\\/]/.test(part) || ['.', '..', 'picture'].includes(part.toLowerCase()))) {
				throw new Error('专题路径必须由有效的文件夹名称组成，不包含 picture。');
			}
			if (metadataFields.every((field) => JSON.stringify(article[field]) === JSON.stringify(values.metadata[field]))) return publicArticle(article);
			Object.assign(article, values.metadata, { topic: values.metadata.topicPath[0] || '', revision: article.revision + 1 });
			article.outputText = normalized(article).text;
			invalidate(article);
			enqueue([article.id], 'preparation', undefined, 'metadata');
			await persist();
			await updateStatuses();
			return publicArticle(article);
		},
		async getArticle(values) {
			input(values, ['id']);
			const article = select(values.id);
			let previewHtml = article.previewHtml;
			if (!previewHtml) {
				try {
					const publicRoot = article.previewRoot || state.configuration.repoRoot;
					const manifest = await readManifest(path.join(publicRoot, 'src/data/media-manifest.json'));
					const processor = await createMarkdownProcessor({ remarkPlugins: [[remarkWebMedia, {
						manifest, publicDir: path.join(publicRoot, 'public'), base: `/__admin-workspace/media/${article.id}/`,
					}]] });
					const rendered = await processor.render(article.body, {
						frontmatter: manifest.documents[article.mediaId] ? { mediaId: article.mediaId } : {},
						fileURL: pathToFileURL(path.join(publicRoot, article.targetPath)),
					});
					previewHtml = rendered.code;
				} catch (error) { previewHtml = `<p>预览尚未准备完成：${escape(error.message)}</p>`; }
			}
			return { article: publicArticle(article), previewHtml };
		},
		async prepare(values) {
			input(values, ['ids']);
			selected(values.ids);
			const result = enqueue(values.ids);
			await persist();
			return result;
		},
		async updateTopic(values) {
			configured();
			input(values, ['path', 'description', 'revision', 'pinned']);
			if (critical) throw new Error('提交或差异确认进行中，请稍后保存专题描述。');
			await topics.update(values, state.articles);
			plans.clear();
			await persist();
			notify();
			return topics.view(state.articles);
		},
		async resetTopics(values) {
			configured();
			input(values, []);
			if (critical) throw new Error('提交或差异确认进行中，请稍后读取专题描述。');
			await topics.reset();
			plans.clear();
			await persist();
			notify();
			return topics.view(state.articles);
		},
		job(values) {
			input(values, ['id']);
			const job = state.jobs.find((entry) => entry.id === values.id);
			if (!job) throw new Error('任务不存在。');
			return structuredClone(job);
		},
		async changes(values) {
			configured();
			input(values, ['ids']);
			if (worker || critical) throw new Error('检查任务仍在进行，请完成后再确认提交差异。');
			if (!Array.isArray(values.ids)) throw new Error('请选择文章或保存专题描述草稿。');
			const articles = values.ids.length ? selected(values.ids) : [];
			const revisions = articles.map((article) => article.revision);
			const head = await git.revision('HEAD');
			critical = true;
			try {
				const topicFile = await topics.change();
				if (!articles.length && !topicFile) throw new Error('请选择文章或保存专题描述草稿。');
				const files = articles.length ? await closure(articles) : [];
				if (topicFile) files.push(topicFile);
				for (const [position, article] of articles.entries()) {
					if (article.revision !== revisions[position]) throw new Error('生成差异期间草稿变化，请重新确认。');
					await currentProof(article);
				}
				if (await git.revision('HEAD') !== head) throw new Error('生成差异期间本地提交变化，请重新确认。');
				await topics.proof(topicFile);
				const topicState = await topics.view(state.articles);
				const token = randomUUID();
				plans.set(token, { kind: 'commit', head, ids: values.ids, revisions, files, topicFile });
				return {
					token, head, ids: values.ids,
					topics: topicFile ? topicState.dirtyPaths : [], topicRevision: topicState.revision,
					files: files.map((file) => ({
						path: file.path, kind: file.kind, before: file.kind === 'media' ? null : file.before?.toString('utf8') ?? '',
						after: file.kind === 'media' ? `${file.bytes.length} bytes · ${hash(file.bytes)}` : file.bytes.toString('utf8'),
					})),
				};
			} finally {
				critical = false;
				events.emit('idle');
				if (queue.length) setImmediate(() => runQueue().catch((error) => { state.recovery.push(error.message); notify(); }));
			}
		},
		async commit(values) {
			input(values, ['token', 'message']);
			if (critical || worker) throw new Error('已有检查、提交或推送操作正在进行。');
			const plan = plans.get(values.token);
			if (!plan || plan.kind !== 'commit') throw new Error('提交差异已失效，请重新确认。');
			critical = true;
			try {
				const articles = plan.ids.length ? selected(plan.ids) : [];
				for (const [position, article] of articles.entries()) {
					if (article.revision !== plan.revisions[position]) throw new Error('草稿已变化，请重新确认差异。');
					await currentProof(article);
				}
				await topics.proof(plan.topicFile);
				const sha = await git.commit({ files: plan.files, head: plan.head, message: values.message });
				topics.committed(plan.topicFile);
				for (const article of articles) {
					const committed = plan.files.find((file) => file.path === article.targetPath);
					if (committed) article.targetHash = hash(committed.bytes);
				}
				plans.clear();
				await updateStatuses();
				await persist();
				notify();
				return { sha, articles: articles.map(publicArticle) };
			} finally {
				critical = false;
				events.emit('idle');
				if (queue.length) setImmediate(() => runQueue().catch((error) => { state.recovery.push(error.message); notify(); }));
			}
		},
		async publication() {
			configured();
			const plan = await git.pending();
			const token = randomUUID();
			plans.set(token, { kind: 'publish', ...plan });
			return { token, ...plan, uncommittedCount: state.articles.filter((article) => article.status === 'uncommitted').length };
		},
		async publish(values) {
			input(values, ['token']);
			const plan = plans.get(values.token);
			if (!plan || plan.kind !== 'publish') throw new Error('发布清单已失效，请重新确认。');
			if (critical || state.jobs.some((job) => job.state === 'running' && job.articleIds.length === 0)) throw new Error('正在执行其他关键发布操作。');
			plans.clear();
			const result = enqueue([], 'publication', plan);
			await persist();
			return { sha: plan.head, ...result };
		},
		async cancel(values = {}) {
			input(values, ['id']);
			const cancelled = [];
			for (const job of state.jobs) {
				if (values.id && values.id !== job.id || terminal(job.state)) continue;
				if (job.state === 'queued') {
					job.state = 'cancelled';
					job.finishedAt = new Date().toISOString();
					for (const id of job.articleIds) {
						const article = select(id);
						if (job.revisions[id] === article.revision) article.preparation = { state: 'cancelled', errors: [], warnings: [] };
						job.results.push({ articleId: id, title: article.title, revision: job.revisions[id], state: 'cancelled', message: '用户取消了等待中的任务。' });
					}
				}
				controllers.get(job.id)?.abort(new Error('任务已由用户取消。'));
				cancelled.push(job.id);
			}
			await persist();
			notify();
			return { cancelled };
		},
		sync,
		async readMedia(values) {
			input(values, ['path']);
			const match = /^([^/]+)\/media\/([a-f\d]+\.(?:webp|mp4))$/u.exec(values.path);
			if (!match) throw new Error('网页资源路径无效。');
			const article = select(match[1]);
			const root = article.previewRoot || state.configuration.repoRoot;
			const manifest = await readManifest(path.join(root, 'src/data/media-manifest.json'));
			const resources = Object.values(manifest.documents[article.mediaId]?.resources || {});
			const variant = resources.flatMap((key) => assetFiles(manifest.assets[key])).find((file) => file.url === `/media/${match[2]}`);
			if (!variant) throw new Error('该资源不属于当前文章。');
			const file = await fs.realpath(path.join(root, 'public/media', match[2]));
			if (!contains(await fs.realpath(path.join(root, 'public/media')), file) || hash(await fs.readFile(file)) !== variant.sha256) throw new Error('网页资源完整性校验失败。');
			return { path: file, mime: variant.type };
		},
		whenIdle(signal) {
			if (!worker && !queue.length && !critical) return Promise.resolve();
			return new Promise((resolve, reject) => {
				const done = () => {
					if (worker || queue.length || critical) return;
					cleanup(); resolve();
				};
				const abort = () => { cleanup(); reject(signal.reason); };
				const cleanup = () => { events.off('idle', done); signal?.removeEventListener('abort', abort); };
				signal?.throwIfAborted();
				events.on('idle', done);
				signal?.addEventListener('abort', abort, { once: true });
			});
		},
		async close() {
			closing = true;
			watcher?.close();
			clearTimeout(syncTimer);
			await api.whenIdle();
			await saving;
			events.removeAllListeners();
		},
	};
	for (const article of state.articles) {
		if (!Object.hasOwn(article, 'pubDate')) continue;
		if (!Object.hasOwn(article, 'completion_date')) {
			article.completion_date = isValidPubDate(article.pubDate)
				? new Date(article.pubDate).toISOString().slice(0, 10) : article.pubDate ?? '';
		}
		const parsed = parseArticle(`---\n${article.baseFrontmatter || ''}\n---\n${article.body}`, article.targetFileName);
		for (const field of ['tags', 'start_date', 'end_date']) {
			if (!Object.hasOwn(article, field)) article[field] = parsed[field];
		}
		article.body = parsed.body;
		delete article.pubDate;
		article.outputText = articleMarkdown(article);
		invalidate(article);
	}
	for (const job of state.jobs.filter((entry) => !terminal(entry.state))) {
		job.state = 'cancelled';
		job.errors.push('上次任务中断，需要按实际结果重新准备或检查，不自动重复操作。');
		for (const id of job.articleIds) {
			const article = state.articles.find((entry) => entry.id === id);
			if (article) { article.prepared = null; article.preparation = { state: 'unchecked', errors: [job.errors.at(-1)], warnings: [] }; }
		}
	}
	await loadRepository();
	if (git && state.configuration.sourceRoot) await sync();
	startWatcher();
	await persist();
	return api;
}
