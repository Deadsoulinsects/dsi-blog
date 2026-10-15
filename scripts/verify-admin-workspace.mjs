import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import sharp from 'sharp';
import { createAdminWorkspace } from './admin/workspace.mjs';
import { command, hash, parseArticle, articleMarkdown, applySourceArticle } from './admin/workspace-io.mjs';
import { splitMarkdownSource } from '../src/shared/content/frontmatter.mjs';
import { createSourceResolver } from '../src/shared/content/source-resolver.mjs';
import { createRepositoryGit } from './admin/workspace-git.mjs';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.DSI_QA_ROOT || (process.platform === 'win32' ? 'D:/ai-output/DSI Admin开发/回归' : os.tmpdir());
await fs.mkdir(output, { recursive: true });
const root = await fs.mkdtemp(path.join(output, 'workspace-'));
const repoRoot = path.join(root, 'repo');
const sourceRoot = path.join(root, '思考与实践');
const dataRoot = path.join(root, '安装目录', 'data');
const gitExecutable = process.env.GIT_BIN || 'git';
let workspace;
const write = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
const git = (args, cwd = repoRoot) => command(gitExecutable, args, { cwd });
const idle = () => workspace.whenIdle(AbortSignal.timeout(180_000));
const frontmatter = (text) => parse(splitMarkdownSource(text).frontmatter);

async function trackedBytes() {
	const result = {};
	const walk = async (directory) => {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			if (entry.name === '.git' || entry.name === 'node_modules') continue;
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) await walk(file);
			else result[path.relative(repoRoot, file)] = hash(await fs.readFile(file));
		}
	};
	await walk(repoRoot);
	return result;
}

async function nextState(predicate, action) {
	let unsubscribe;
	const observed = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => { unsubscribe(); reject(new Error('状态事件超时')); }, 15000);
		unsubscribe = workspace.subscribe(() => {
			workspace.state().then((state) => {
				if (!predicate(state)) return;
				clearTimeout(timeout);
				unsubscribe();
				resolve(state);
			}, (error) => { clearTimeout(timeout); unsubscribe(); reject(error); });
		});
	});
	await action();
	return observed;
}

try {
	assert.equal(parseArticle('正文', '新文.md').description, '');
	assert.equal(parseArticle('正文', '新文.md').completion_date, '');
	const noHeader = parseArticle('旧草稿正文', '无元信息.md');
	const noHeaderText = articleMarkdown({
		...noHeader, title: '旧草稿标题', description: '旧草稿描述',
		completion_date: '2024-05-06', mediaId: 'legacy-draft',
	});
	assert.equal(frontmatter(noHeaderText).completion_date, '2024-05-06');
	assert.equal(frontmatter(noHeaderText).title, '旧草稿标题');
	assert.equal(splitMarkdownSource(noHeaderText).body, '旧草稿正文');
	for (const date of ['', 'null', '2026-02-30', 'bad']) {
		const parsed = parseArticle(`---\ncompletion_date: ${date}\npubDate: 2024-01-02\n---\n正文`, '日期.md');
		assert.equal(parsed.completion_date, date === 'null' ? '' : date);
		assert.equal(frontmatter(articleMarkdown({ ...parsed, mediaId: 'test' })).pubDate, undefined);
	}
	assert.equal(parseArticle('---\ncompletion_date: 2024/05/06\n---\n正文', '日期.md').completion_date, '2024-05-06');
	assert.equal(parseArticle('---\ncompletion_date: 2024/13/06\n---\n正文', '日期.md').completion_date, '2024/13/06');
	const bounds = parseArticle('---\ncompletion_date: 2024-05-06\nstart_date: 2024/04/01\nend_date: null\n---\n正文', '日期.md');
	assert.equal(bounds.start_date, '2024-04-01');
	assert.equal(bounds.end_date, null);
	const legacy = parseArticle('---\npubDate: 2024-01-02T12:00:00Z\n---\n正文', '旧日期.md');
	assert.equal(legacy.completion_date, '2024-01-02');
	const sourceMetadata = parseArticle('---\ntitle: 来源\ndescription: 描述\ncompletion_date: 2024-01-02\ntags: [测试]\nstart_date: null\nend_date: ""\ncustom: 保留\n---\n<!-- article-header:start -->\n插件头部\n<!-- article-header:end -->\n正文', '元数据.md');
	const roundTrip = frontmatter(articleMarkdown({ ...sourceMetadata, title: '已编辑', mediaId: 'test' }));
	assert.deepEqual(roundTrip.tags, ['测试']);
	assert.equal(roundTrip.start_date, null);
	assert.equal(roundTrip.end_date, '');
	assert.equal(roundTrip.custom, '保留');
	assert.equal(sourceMetadata.body, '正文');
	const draft = { ...sourceMetadata, mediaId: 'technical-id', targetFileName: '元数据.md' };
	applySourceArticle(draft, parseArticle('---\ntitle: 重导入\nstart_date: ""\n---\n更新正文', '元数据.md'));
	assert.equal(draft.completion_date, '2024-01-02');
	assert.equal(draft.description, '描述');
	assert.equal(draft.mediaId, 'technical-id');
	assert.deepEqual(draft.tags, ['测试']);
	assert.equal(draft.start_date, '');
	assert.equal(frontmatter(articleMarkdown(draft)).custom, '保留');
	for (const date of ['""', 'null', '2026-02-30']) {
		assert.throws(() => applySourceArticle(draft, parseArticle(`---\ncompletion_date: ${date}\n---\n无效日期`, '元数据.md')), /completion_date/);
		assert.equal(draft.completion_date, '2024-01-02');
	}
	applySourceArticle(draft, parseArticle('---\ncompletion_date: 2025/03/04\nstart_date: 2025/06/07\nend_date: 2025/07/08\n---\n更新正文', '元数据.md'));
	assert.equal(draft.completion_date, '2025-03-04');
	assert.equal(draft.start_date, '2025-06-07');
	assert.equal(draft.end_date, '2025-07-08');
	await write(path.join(repoRoot, 'package.json'), JSON.stringify({ name: 'dsi-blog-fixture', type: 'module', dependencies: { astro: '^6.2.2' } }));
	await write(path.join(repoRoot, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { remarkWebMedia } from ${JSON.stringify(pathToImport('src/shared/content/remark-web-media.mjs'))};
import { parseWebMediaManifest } from ${JSON.stringify(pathToImport('src/shared/content/web-media.mjs'))};
const manifestFile = new URL('./src/data/media-manifest.json', import.meta.url);
const manifest = parseWebMediaManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
export default defineConfig({ markdown: { remarkPlugins: [[remarkWebMedia, { manifest, publicDir: fileURLToPath(new URL('./public', import.meta.url)) }]] } });
`);
	await write(path.join(repoRoot, 'tsconfig.json'), JSON.stringify({ extends: 'astro/tsconfigs/strict', include: ['.astro/types.d.ts', 'src/**/*'] }));
	await write(path.join(repoRoot, 'src/content.config.ts'), `
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const blog = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/blog' }), schema: z.object({
 title: z.string(), description: z.string(), completion_date: z.coerce.date(), topic: z.string().optional(),
 topicPath: z.array(z.string()).optional(), mediaId: z.string().optional()
}) });
export const collections = { blog };
`);
	await write(path.join(repoRoot, 'src/pages/blog/[...slug].astro'), `---
import { getCollection, render } from 'astro:content';
export async function getStaticPaths(){ return (await getCollection('blog')).map(entry=>({params:{slug:entry.id},props:{entry}})); }
const { entry } = Astro.props;
const { Content } = await render(entry);
---
<html lang="zh-CN"><body><h1>{entry.data.title}</h1><div class="article-prose"><Content /></div></body></html>
`);
	await write(path.join(repoRoot, 'src/data/media-manifest.json'), JSON.stringify({ schemaVersion: 1, documents: {}, assets: {}, recipes: {} }));
	await write(path.join(repoRoot, 'src/data/topics.json'), JSON.stringify({ Obsidian: { description: 'baseline-topic-fixture' } }));
	for (const relative of ['src/data/topics.ts', 'src/utils/topics.ts', 'src/utils/paths.ts']) {
		await write(path.join(repoRoot, relative), await fs.readFile(path.join(runtimeRoot, relative), 'utf8'));
	}
	await write(path.join(repoRoot, 'src/pages/blog/topics/[...topic].astro'), `---
import { getCollection } from 'astro:content';
import { getTopicGroups } from '../../../utils/topics';
export async function getStaticPaths() { return getTopicGroups(await getCollection('blog')).map(group => ({ params: { topic: group.slug }, props: { group } })); }
const { group } = Astro.props;
---
<html lang="zh-CN"><body><h1>{group.name}</h1><p data-topic-description>{group.description}</p></body></html>
`);
	await fs.mkdir(path.join(repoRoot, 'public'), { recursive: true });
	await write(path.join(repoRoot, 'src/content/blog/正式.md'), '---\ntitle: 正式标题\ndescription: 已有描述\ncompletion_date: 2021-03-04\ncategory: 教程\ncustom:\n  owner: retained\n---\n原始正文\n');
	for (const name of ['待匹配.md', 'Café.md']) {
		await write(path.join(repoRoot, 'src/content/blog', name), '---\ntitle: 匹配检查\ndescription: 候选检查\ncompletion_date: 2024-05-06\n---\n正文\n');
	}
	await write(path.join(repoRoot, 'src/content/blog/SBTI2.0总结.md'), '---\ntitle: SBTI 2.0 总结\ndescription: 旧版描述\ncompletion_date: 2024-05-06\nmediaId: stable-summary-media\ntopicPath: [SBTI]\ncustom: preserved\n---\n正式旧正文\n');
	await write(path.join(repoRoot, 'src/content/blog/旧路径.md'), '---\ntitle: 独立标题\ndescription: 标题匹配\ncompletion_date: 2024-05-06\n---\n正文\n');
	await write(path.join(repoRoot, 'unrelated.txt'), 'initial');
	await git(['init', '--initial-branch=master']);
	await git(['config', 'user.name', 'DSI Fixture']);
	await git(['config', 'user.email', 'fixture@example.invalid']);
	await git(['add', '--', '.']);
	await git(['commit', '-m', 'fixture baseline']);
	await write(path.join(sourceRoot, 'Obsidian/云存储/GitHub/新文.md'), '---\ntitle: 新文\ntags: [初始]\nstart_date: null\nend_date: ""\n---\n第一版正文\n');
	await write(path.join(sourceRoot, 'Obsidian/picture/附件说明.md'), '不应被扫描为文章');
	await write(path.join(sourceRoot, 'Obsidian/正式.md'), '---\ntitle: 源标题\ndescription: 来源描述\ncompletion_date: 2000-01-01\n---\n源正文一\n');
	const slashNote = path.join(sourceRoot, 'Obsidian/斜杠日期.md');
	await write(slashNote, '---\ntitle: 斜杠日期\ndescription: 斜杠格式来源\ncompletion_date: 2024/07/08\nstart_date: 2024/07/01\nend_date: 2024/07/10\n---\n斜杠正文\n');
	const otherFormal = path.join(sourceRoot, '其他/正式.MARKDOWN');
	await write(otherFormal, '---\ntitle: 另一个原文\ndescription: 同名候选\ncompletion_date: 2024-05-06\n---\n另一个正文\n');
	await write(path.join(sourceRoot, 'Obsidian/picture/正式.md'), '附件说明');
	await write(path.join(sourceRoot, '.hidden/正式.md'), '隐藏笔记');
	await write(path.join(sourceRoot, '过大/正式.md'), 'x'.repeat(4 * 1024 * 1024 + 1));
	const unicodeSource = path.join(sourceRoot, '专题/CAFE\u0301.MARKDOWN');
	await write(unicodeSource, '正文');
	const summaryOriginal = path.join(sourceRoot, 'AI项目/SBTI2.0/SBTI 2.0 总结.md');
	const summaryCopy = path.join(sourceRoot, 'AI项目/博客发布/SBTI2.0总结.md');
	const titleSource = path.join(sourceRoot, '其他/另一命名.md');
	await write(summaryOriginal, '---\ntitle: SBTI 2.0 总结\ndescription: 原文描述\ncompletion_date: 2024-05-06\nmediaId: source-id-must-not-replace\n---\n真实原文一\n');
	await write(summaryCopy, '---\ntitle: SBTI 2.0 总结\ndescription: 副本描述\ncompletion_date: 2024-05-06\n---\n旧发布副本\n');
	await write(titleSource, '---\ntitle: 独立 标题\ndescription: 原文标题匹配\ncompletion_date: 2024-05-06\n---\n正文\n');
	await write(path.join(sourceRoot, '其他/无效笔记.md'), '---\ntitle: [invalid\n---\n不应阻断其他候选\n');
	const note = path.join(sourceRoot, 'Obsidian/云存储/GitHub/新文.md');
	await fs.utimes(note, new Date('2000-01-01'), new Date('2000-01-01'));
	const before = await trackedBytes();
	workspace = await createAdminWorkspace({ dataRoot, runtimeRoot, tools: { node: process.execPath, git: gitExecutable } });
	await workspace.configure({ repoRoot, sourceRoot });
	const initialState = await workspace.state();
	const formalId = initialState.articles.find((entry) => entry.targetFileName === '正式.md').id;
	const unmatchedId = initialState.articles.find((entry) => entry.targetFileName === '待匹配.md').id;
	const unicodeId = initialState.articles.find((entry) => entry.targetFileName === 'Café.md').id;
	const summaryId = initialState.articles.find((entry) => entry.targetFileName === 'SBTI2.0总结.md').id;
	const titleId = initialState.articles.find((entry) => entry.targetFileName === '旧路径.md').id;
	assert.deepEqual(await workspace.bindingCandidates({ id: formalId }), { candidates: [
		{ path: path.join(sourceRoot, 'Obsidian/正式.md'), relativePath: 'Obsidian/正式.md' },
		{ path: otherFormal, relativePath: '其他/正式.MARKDOWN' },
	] });
	assert.deepEqual(await workspace.bindingCandidates({ id: unmatchedId }), { candidates: [] });
	assert.deepEqual(await workspace.bindingCandidates({ id: unicodeId }), { candidates: [
		{ path: unicodeSource, relativePath: '专题/CAFE\u0301.MARKDOWN' },
	] });
	assert.deepEqual(await workspace.bindingCandidates({ id: summaryId }), { candidates: [
		{ path: summaryOriginal, relativePath: 'AI项目/SBTI2.0/SBTI 2.0 总结.md' },
	] }, '忽略文件名空格差异，旧发布副本不作为原文候选');
	assert.deepEqual(await workspace.bindingCandidates({ id: titleId }), { candidates: [
		{ path: titleSource, relativePath: '其他/另一命名.md' },
	] }, '文件改名后按源标题提示候选，不能自动绑定');
	assert.deepEqual(await workspace.state(), initialState, '候选查询不得绑定来源、改变文章或启动准备');
	await assert.rejects(workspace.bindingCandidates({ id: 'unknown' }), /文章不存在/);
	const scanned = await workspace.scan({ path: path.join(sourceRoot, 'Obsidian') });
	assert(!scanned.entries.some((entry) => entry.relativePath.includes('picture')));
	const projectScan = await workspace.scan({ path: path.join(sourceRoot, 'AI项目') });
	assert(projectScan.entries.some((entry) => entry.path === summaryOriginal));
	assert(!projectScan.entries.some((entry) => entry.relativePath.includes('博客发布')));
	assert(!initialState.pending.some((entry) => entry.path === summaryCopy));
	await assert.rejects(workspace.scan({ path: path.dirname(summaryCopy) }), /历史发布副本/);
	const duplicateOriginal = await workspace.importNotes({ paths: [summaryOriginal, titleSource, summaryCopy] });
	assert.equal(duplicateOriginal.articles.length, 0);
	assert.equal(duplicateOriginal.errors.length, 3);
	assert.equal((await workspace.state()).articles.length, initialState.articles.length);
	assert.equal((await workspace.state()).jobs.length, initialState.jobs.length);
	await workspace.bindSource({ id: summaryId, path: summaryCopy });
	await idle();
	const oldSummary = (await workspace.getArticle({ id: summaryId })).article;
	assert.equal(oldSummary.sourcePath, summaryCopy);
	await workspace.sync();
	assert.equal((await workspace.getArticle({ id: summaryId })).article.sourcePath, summaryCopy, '历史绑定保留，不能自动迁移');
	await workspace.bindingCandidates({ id: summaryId });
	assert.equal((await workspace.getArticle({ id: summaryId })).article.sourcePath, summaryCopy);
	await workspace.bindSource({ id: summaryId, path: summaryOriginal });
	await idle();
	const rebound = (await workspace.getArticle({ id: summaryId })).article;
	assert.equal(rebound.id, oldSummary.id);
	assert.equal(rebound.targetPath, oldSummary.targetPath);
	assert.equal(rebound.targetFileName, 'SBTI2.0总结.md');
	assert.equal(rebound.mediaId, 'stable-summary-media');
	assert.deepEqual(rebound.topicPath, ['SBTI']);
	assert.equal(rebound.body, '\n真实原文一\n');
	assert.equal(rebound.preparation.state, 'ready');
	const summaryChanges = await workspace.changes({ ids: [summaryId] });
	assert.equal(frontmatter(summaryChanges.files.find((file) => file.kind === 'article').after).custom, 'preserved');
	await write(summaryCopy, (await fs.readFile(summaryCopy, 'utf8')).replace('旧发布副本', '旧副本之后变更'));
	await workspace.sync();
	assert.equal((await workspace.getArticle({ id: summaryId })).article.revision, rebound.revision, '迁移后旧副本不再影响文章');
	assert.equal((await workspace.getArticle({ id: summaryId })).article.body, rebound.body);
	await nextState((state) => state.articles.some((entry) => entry.id === summaryId && entry.body.includes('真实原文二')),
		async () => write(summaryOriginal, (await fs.readFile(summaryOriginal, 'utf8')).replace('真实原文一', '真实原文二')));
	await idle();
	assert.equal((await workspace.getArticle({ id: summaryId })).article.preparation.state, 'ready');
	assert.deepEqual(await trackedBytes(), before, '改绑和原文同步只更新本地草稿及隔离准备');
	const imported = await workspace.importNotes({ paths: [note] });
	assert.equal(imported.errors.length, 0);
	const id = imported.articles[0].id;
	assert.deepEqual(imported.articles[0].topicPath, ['Obsidian', '云存储', 'GitHub']);
	assert.equal(imported.articles[0].description, '');
	assert.equal(imported.articles[0].completion_date, '');
	assert.deepEqual(imported.articles[0].tags, ['初始']);
	assert.equal(imported.articles[0].start_date, null);
	assert.equal(imported.articles[0].end_date, '');
	await idle();
	assert.equal((await workspace.getArticle({ id })).article.preparation.state, 'blocked');
	await assert.rejects(workspace.changes({ ids: [id] }), /尚未通过当前版本检查/);
	assert.deepEqual(await trackedBytes(), before, '导入和准备不得修改真实仓库');
	let article = (await workspace.getArticle({ id })).article;
	await workspace.updateArticle({ id, revision: article.revision, metadata: {
		title: article.title, description: '自定义描述', completion_date: '2024-05-06', topicPath: article.topicPath,
	} });
	await idle();
	article = (await workspace.getArticle({ id })).article;
	assert.equal(article.preparation.state, 'ready', JSON.stringify(article.preparation));
	assert.deepEqual(await trackedBytes(), before, '检查和 Astro 构建必须隔离');
	const slashImport = await workspace.importNotes({ paths: [slashNote] });
	assert.equal(slashImport.errors.length, 0);
	assert.equal(slashImport.articles[0].completion_date, '2024-07-08');
	assert.equal(slashImport.articles[0].start_date, '2024-07-01');
	assert.equal(slashImport.articles[0].end_date, '2024-07-10');
	await idle();
	assert.equal((await workspace.getArticle({ id: slashImport.articles[0].id })).article.preparation.state, 'ready');
	assert.deepEqual(await trackedBytes(), before, '斜杠日期来源的准备不得改写真实仓库');
	await workspace.close();
	const stateFile = path.join(dataRoot, 'config/workspace.json');
	const oldState = JSON.parse(await fs.readFile(stateFile, 'utf8'));
	const oldArticle = oldState.articles.find((entry) => entry.id === id);
	oldArticle.pubDate = oldArticle.completion_date;
	oldArticle.baseFrontmatter = '';
	delete oldArticle.completion_date;
	await write(stateFile, JSON.stringify(oldState));
	workspace = await createAdminWorkspace({ dataRoot, runtimeRoot, tools: { node: process.execPath, git: gitExecutable } });
	article = (await workspace.getArticle({ id })).article;
	assert.equal(article.description, '自定义描述');
	assert.equal(article.completion_date, '2024-05-06');
	assert.deepEqual(article.tags, ['初始']);
	await workspace.prepare({ ids: [id] });
	await idle();
	assert.equal(article.status, 'uncommitted');
	const duplicate = await workspace.importNotes({ paths: [note] });
	assert.equal(duplicate.articles[0].id, id);
	const readyState = await workspace.state();
	const reviewPhases = [];
	const stopReview = workspace.subscribe((event) => {
		if (event?.job) reviewPhases.push(event.job.progress.phase);
	});
	const diff = await workspace.changes({ ids: [id] });
	const reread = await workspace.changes({ ids: [id] });
	stopReview();
	assert.deepEqual(reread.files, diff.files, '重新读取差异应复用当前就绪版本');
	assert.deepEqual(reviewPhases, [], '就绪文章打开提交差异不得再次执行准备、检查或构建');
	assert.deepEqual((await workspace.state()).jobs, readyState.jobs, '差异预览不得新增准备任务');
	assert.deepEqual(await trackedBytes(), before, '差异预览不得改写正式仓库');
	const configFile = path.join(repoRoot, 'astro.config.mjs');
	const preparedConfig = await fs.readFile(configFile, 'utf8');
	await write(configFile, `${preparedConfig}\n`);
	try {
		await assert.rejects(workspace.changes({ ids: [id] }), /尚未通过当前版本检查/);
		await assert.rejects(workspace.commit({ token: diff.token, message: '不能提交失效的检查结果' }), /尚未通过当前版本检查/);
	} finally {
		await write(configFile, preparedConfig);
	}
	assert.deepEqual((await workspace.state()).jobs, readyState.jobs, '失效差异应拒绝而非自动重新准备');
	await assert.rejects(workspace.commit({ token: diff.token, message: ' ' }), /提交信息/);
	await write(path.join(repoRoot, 'unrelated.txt'), '外部修改');
	await git(['add', '--', 'unrelated.txt']);
	await assert.rejects(workspace.commit({ token: diff.token, message: '不得夹带暂存' }), /暂存区/);
	await git(['restore', '--staged', '--', 'unrelated.txt']);
	const completed = await workspace.commit({ token: diff.token, message: '测试自定义标题\n\n测试自定义正文' });
	assert(completed.sha);
	assert((await git(['show', '-s', '--format=%B', completed.sha])).stdout.includes('测试自定义标题'));
	assert.equal((await fs.readFile(path.join(repoRoot, 'unrelated.txt'), 'utf8')), '外部修改');
	const changedPaths = (await git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', completed.sha])).stdout.split('\0').filter(Boolean);
	assert(changedPaths.every((file) => file === 'src/content/blog/新文.md' || file === 'src/data/media-manifest.json'));
	assert.equal((await workspace.getArticle({ id })).article.status, 'committed');
	const pushedRoot = path.join(root, 'remote.git');
	await fs.mkdir(pushedRoot);
	await git(['init', '--bare', pushedRoot], root);
	await git(['remote', 'add', 'origin', pushedRoot]);
	const plan = await workspace.publication();
	assert(plan.ahead.length);
	await workspace.publish({ token: plan.token });
	await idle();
	assert.equal((await workspace.getArticle({ id })).article.status, 'pushed');
	assert.equal((await workspace.state()).publication.state, 'pushed');
	await nextState((state) => state.articles.some((entry) => entry.id === id && entry.body.includes('第二版正文')),
		() => write(note, '---\ntitle: 来源改名\ndescription: 来源新描述\ntopic: 来源专题\ntags: [来源标签]\nstart_date: 2024-04-01\nend_date: null\ncompletion_date: 2024-06-07\nmediaId: 不应覆盖技术标识\n---\n<!-- article-header:start -->\n受管标题\n<!-- article-header:end -->\n第二版正文\n'));
	await idle();
	article = (await workspace.getArticle({ id })).article;
	assert.equal(article.title, '来源改名');
	assert.equal(article.description, '来源新描述');
	assert.equal(article.completion_date, '2024-06-07');
	assert.deepEqual(article.topicPath, ['来源专题']);
	assert.deepEqual(article.tags, ['来源标签']);
	assert.equal(article.start_date, '2024-04-01');
	assert.equal(article.end_date, null);
	assert.equal(article.mediaId, imported.articles[0].mediaId);
	assert(!article.body.includes('article-header'));
	assert.equal(article.status, 'uncommitted');
	const validSource = await fs.readFile(note, 'utf8');
	await nextState((state) => state.articles.some((entry) => entry.id === id && entry.preparation.state === 'blocked'
		&& entry.preparation.errors.some((error) => error.includes('completion_date'))),
		() => write(note, validSource.replace('completion_date: 2024-06-07', 'completion_date: ""')));
	await workspace.prepare({ ids: [id] });
	await idle();
	assert.notEqual((await workspace.getArticle({ id })).article.preparation.state, 'ready');
	const invalidRevision = (await workspace.getArticle({ id })).article.revision;
	await nextState((state) => state.articles.some((entry) => entry.id === id && entry.revision > invalidRevision),
		() => write(note, validSource));
	await idle();
	assert.equal((await workspace.getArticle({ id })).article.preparation.state, 'ready');
	const formal = (await workspace.state()).articles.find((entry) => entry.targetFileName === '正式.md');
	await workspace.bindSource({ id: formal.id, path: path.join(sourceRoot, 'Obsidian/正式.md') });
	await idle();
	const bound = (await workspace.getArticle({ id: formal.id })).article;
	assert.equal(bound.title, '源标题');
	assert.equal(bound.description, '来源描述');
	assert.equal(bound.completion_date, '2000-01-01');
	await workspace.bindSource({ id: unmatchedId, path: otherFormal });
	await idle();
	assert.deepEqual(await workspace.bindingCandidates({ id: formal.id }), { candidates: [
		{ path: path.join(sourceRoot, 'Obsidian/正式.md'), relativePath: 'Obsidian/正式.md' },
	] }, '排除已绑定其他文章的原文，但保留当前文章的原文');
	const formalChanges = await workspace.changes({ ids: [formal.id] });
	const markdown = formalChanges.files.find((file) => file.kind === 'article').after;
	assert.equal(frontmatter(markdown).custom.owner, 'retained');
	const pendingFile = path.join(sourceRoot, 'Obsidian/新增.md');
	await nextState((state) => state.pending.some((entry) => entry.path === pendingFile), () => write(pendingFile, '新增待确认\n'));
	assert(!(await workspace.state()).articles.some((entry) => entry.sourcePath === pendingFile));

	const pictureRoot = path.join(sourceRoot, 'Obsidian/云存储/GitHub/picture');
	await fs.mkdir(path.join(pictureRoot, '子目录'), { recursive: true });
	await sharp({ create: { width: 16, height: 12, channels: 3, background: '#456789' } }).png().toFile(path.join(pictureRoot, '子目录', 'photo.png'));
	const resolver = await createSourceResolver({ note, sourceRoot });
	assert.equal(await resolver('子目录/photo.png'), path.join(pictureRoot, '子目录', 'photo.png'));
	assert.equal(await resolver('photo.png'), path.join(pictureRoot, '子目录', 'photo.png'));
	await fs.mkdir(path.join(pictureRoot, '另一目录'));
	await fs.copyFile(path.join(pictureRoot, '子目录/photo.png'), path.join(pictureRoot, '另一目录/photo.png'));
	const ambiguous = await createSourceResolver({ note, sourceRoot });
	await assert.rejects(ambiguous('photo.png'), /多个候选/);
	await assert.rejects(ambiguous('../photo.png'), /traversal/);
	const explicit = await ambiguous('子目录/photo.png');
	assert.equal(explicit, path.join(pictureRoot, '子目录/photo.png'));

	const repositoryBeforeMedia = await trackedBytes();
	const photoNote = path.join(path.dirname(note), '图片.md');
	await write(photoNote, '---\ntitle: 图片\ndescription: 图片检查\ncompletion_date: 2024-05-06\n---\n![图片说明](子目录/photo.png)\n');
	const photoImport = await workspace.importNotes({ paths: [photoNote] });
	assert.equal(photoImport.errors.length, 0);
	const photoId = photoImport.articles[0].id;
	await idle();
	let photo = (await workspace.getArticle({ id: photoId })).article;
	assert.equal(photo.preparation.state, 'ready', JSON.stringify(photo.preparation));
	assert.equal(photo.preparation.summary.converted, 1);
	assert((await workspace.getArticle({ id: photoId })).previewHtml.includes(`/__admin-workspace/media/${photoId}/media/`));
	await workspace.updateArticle({ id: photoId, revision: photo.revision, metadata: {
		title: '图片新标题', description: photo.description, completion_date: photo.completion_date, topicPath: photo.topicPath,
	} });
	await idle();
	photo = (await workspace.getArticle({ id: photoId })).article;
	assert.equal(photo.preparation.summary.converted, 0);
	assert.equal(photo.preparation.summary.reused, 1);
	await nextState((state) => state.articles.some((entry) => entry.id === photoId && entry.revision > photo.revision),
		async () => {
			const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#987654' } }).png().toBuffer();
			await fs.writeFile(explicit, png);
		});
	await idle();
	photo = (await workspace.getArticle({ id: photoId })).article;
	assert.equal(photo.preparation.state, 'ready', JSON.stringify(photo.preparation));
	assert.equal(photo.preparation.summary.converted, 1);
	assert.equal(photo.status, 'uncommitted');

	const failedNote = path.join(path.dirname(note), '缺失附件.md');
	const validNote = path.join(path.dirname(note), '批量有效.md');
	const blockedNote = path.join(path.dirname(note), '批量缺少信息.md');
	const sharedNotes = ['批量共享图片一', '批量共享图片二'].map((title) => path.join(path.dirname(note), `${title}.md`));
	await write(failedNote, '---\ntitle: 缺失附件\ndescription: 失败隔离\ncompletion_date: 2024-05-06\n---\n![缺失](missing.png)\n');
	await write(validNote, '---\ntitle: 批量有效\ndescription: 不受失败影响\ncompletion_date: 2024-05-06\n---\n有效正文\n');
	await write(blockedNote, '---\ntitle: 批量缺少信息\n---\n无完整元信息正文\n');
	for (const shared of sharedNotes) {
		await write(shared, `---\ntitle: ${path.basename(shared, '.md')}\ndescription: 批次附件去重\ncompletion_date: 2024-05-06\n---\n![共享图片](子目录/photo.png)\n[同批文章](批量有效.md)\n`);
	}
	const batchPhases = [];
	const stopBatch = workspace.subscribe((event) => {
		if (event?.job) batchPhases.push({ id: event.job.id, ...event.job.progress });
	});
	const batch = await workspace.importNotes({ paths: [failedNote, validNote, blockedNote, ...sharedNotes] });
	assert.equal(batch.errors.length, 0);
	await idle();
	stopBatch();
	assert.equal((await workspace.getArticle({ id: batch.articles[0].id })).article.preparation.state, 'failed');
	assert.equal((await workspace.getArticle({ id: batch.articles[1].id })).article.preparation.state, 'ready');
	assert.equal((await workspace.getArticle({ id: batch.articles[2].id })).article.preparation.state, 'blocked');
	const batchJob = (await workspace.state()).jobs.find((job) => job.articleIds.includes(batch.articles[4].id));
	assert.equal(batchJob.articleIds.length, 5);
	for (const phase of ['snapshot', 'check', 'build']) {
		assert.equal(batchPhases.filter((event) => event.id === batchJob.id && event.phase === phase).length, 1, `${phase} 必须整批只执行一次`);
	}
	const preparedBatch = JSON.parse(await fs.readFile(stateFile, 'utf8')).articles.filter((entry) => batch.articles.slice(3).some((selected) => selected.id === entry.id));
	assert.equal(preparedBatch.length, 2);
	assert(preparedBatch.every((entry) => entry.preparation.state === 'ready'));
	assert.equal(preparedBatch[0].prepared.stageRoot, preparedBatch[1].prepared.stageRoot);
	await fs.access(path.join(preparedBatch[0].prepared.stageRoot, '.astro/cache/data-store.json'));
	assert.equal(preparedBatch[0].preparation.summary.converted, 1);
	assert.equal(preparedBatch[1].preparation.summary.converted, 0);
	assert.equal(preparedBatch[1].preparation.summary.reused, 1, '同一批文章中的相同附件不得重复转换');
	for (const entry of preparedBatch) {
		const html = await fs.readFile(path.join(entry.prepared.stageRoot, 'dist/blog', path.basename(entry.targetFileName, '.md'), 'index.html'), 'utf8');
		assert(html.includes('/media/'));
		assert(decodeURI(html).includes('/blog/批量有效'));
	}
	assert.deepEqual(await trackedBytes(), repositoryBeforeMedia, '批量整理与检查不得写入真实仓库');

	// A change during the shared check replaces only that article, not its batch peers.
	const sharedIds = batch.articles.slice(3).map((entry) => entry.id);
	const sharedArticle = (await workspace.getArticle({ id: sharedIds[0] })).article;
	let stopRevision;
	const replaced = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => { stopRevision(); reject(new Error('批量版本替代事件超时')); }, 180000);
		stopRevision = workspace.subscribe((event) => {
			if (event?.job.progress.phase !== 'check' || !event.job.articleIds.includes(sharedIds[0])) return;
			clearTimeout(timeout);
			stopRevision();
			Promise.all([
				workspace.prepare({ ids: [sharedIds[1]] }),
				workspace.updateArticle({ id: sharedIds[0], revision: sharedArticle.revision, metadata: {
					title: '批量期间的新标题', description: sharedArticle.description,
					completion_date: sharedArticle.completion_date, topicPath: sharedArticle.topicPath,
				} }),
			]).then(([duplicate]) => resolve({ jobId: event.job.id, duplicate }), reject);
		});
	});
	await workspace.prepare({ ids: sharedIds });
	const replacement = await replaced;
	assert.equal(replacement.duplicate.jobId, replacement.jobId);
	await idle();
	const replacedJob = workspace.job({ id: replacement.jobId });
	assert.equal(replacedJob.results.find((entry) => entry.articleId === sharedIds[0]).state, 'superseded');
	assert.equal(replacedJob.results.find((entry) => entry.articleId === sharedIds[1]).state, 'ready');
	for (const sharedId of sharedIds) assert.equal((await workspace.getArticle({ id: sharedId })).article.preparation.state, 'ready');
	assert.equal((await workspace.getArticle({ id: sharedIds[0] })).article.preparation.summary.reused, 1, '下一批准备仍应复用缓存');
	assert((await workspace.changes({ ids: [...sharedIds, batch.articles[1].id] })).files.some((file) => file.kind === 'media'));

	let stopObserving;
	const cancelled = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => { stopObserving(); reject(new Error('取消检查阶段事件超时')); }, 180000);
		stopObserving = workspace.subscribe((event) => {
			if (event?.job.progress.phase !== 'check' || !event.job.articleIds.includes(photoId)) return;
			clearTimeout(timeout);
			stopObserving();
			workspace.cancel({ id: event.job.id }).then(() => resolve(event.job.id), reject);
		});
	});
	await workspace.prepare({ ids: [photoId, batch.articles[1].id] });
	const cancelledId = await cancelled;
	await idle();
	assert.equal(workspace.job({ id: cancelledId }).state, 'cancelled');
	assert.equal((await workspace.getArticle({ id: photoId })).article.preparation.state, 'cancelled');
	assert.equal((await workspace.getArticle({ id: batch.articles[1].id })).article.preparation.state, 'cancelled');
	assert.deepEqual(await trackedBytes(), repositoryBeforeMedia);
	await workspace.prepare({ ids: [photoId] });
	await idle();
	const photoChanges = await workspace.changes({ ids: [photoId] });
	assert(photoChanges.files.some((file) => file.kind === 'media' && file.path.endsWith('.webp')));
	assert(!photoChanges.files.some((file) => file.path.endsWith('.png')));
	await workspace.commit({ token: photoChanges.token, message: '验证派生图片精确闭包' });
	const imagePublication = await workspace.publication();
	await workspace.publish({ token: imagePublication.token });
	await idle();
	assert.equal((await workspace.getArticle({ id: photoId })).article.status, 'pushed');

	const dependent = path.join(path.dirname(note), '未提交依赖.md');
	const linked = path.join(path.dirname(note), '有依赖.md');
	await write(dependent, '---\ntitle: 未提交依赖\ndescription: 关联检查\ncompletion_date: 2024-05-06\n---\n依赖正文\n');
	await write(linked, '---\ntitle: 有依赖\ndescription: 关联检查\ncompletion_date: 2024-05-06\n---\n[关联笔记](未提交依赖.md)\n');
	const linkedBatch = await workspace.importNotes({ paths: [dependent, linked] });
	await idle();
	await assert.rejects(workspace.changes({ ids: [linkedBatch.articles[1].id] }), /尚未提交/);
	assert((await workspace.changes({ ids: linkedBatch.articles.map((entry) => entry.id) })).files.filter((file) => file.kind === 'article').length === 2);
	const buildFailure = path.join(repoRoot, 'src/pages/批次构建失败.astro');
	await write(buildFailure, '---\nthrow new Error("batch-build-fixture");\n---\n<html><body>不可构建</body></html>\n');
	try {
		const failedBuild = await workspace.prepare({ ids: linkedBatch.articles.map((entry) => entry.id) });
		await idle();
		assert.equal(workspace.job({ id: failedBuild.jobId }).state, 'failed');
		assert.equal(workspace.job({ id: failedBuild.jobId }).results.filter((entry) => entry.state === 'failed').length, 2);
		for (const entry of linkedBatch.articles) assert.equal((await workspace.getArticle({ id: entry.id })).article.preparation.state, 'failed');
		await assert.rejects(workspace.changes({ ids: linkedBatch.articles.map((entry) => entry.id) }), /尚未通过当前版本检查/);
	} finally {
		await fs.rm(buildFailure);
	}
	await workspace.prepare({ ids: linkedBatch.articles.map((entry) => entry.id) });
	await idle();
	for (const entry of linkedBatch.articles) assert.equal((await workspace.getArticle({ id: entry.id })).article.preparation.state, 'ready');
	const topicsFile = path.join(repoRoot, 'src/data/topics.json');
	const topicBytes = await fs.readFile(topicsFile);
	const topicJobs = (await workspace.state()).jobs;
	let topicState = (await workspace.state()).topics;
	assert.equal(topicState.entries.find((entry) => entry.path.join('/') === 'Obsidian').description, 'baseline-topic-fixture');
	const topicPath = ['Obsidian', '云存储', 'GitHub'];
	const savedRoot = await workspace.updateTopic({ path: ['Obsidian'], revision: topicState.revision, description: 'root-edit-fixture' });
	await assert.rejects(workspace.updateTopic({ path: topicPath, revision: topicState.revision, description: 'stale-fixture' }), /版本已变化/);
	topicState = await workspace.updateTopic({ path: topicPath, revision: savedRoot.revision, description: 'child-edit-fixture' });
	assert.equal(topicState.dirtyPaths.length, 2);
	topicState = await workspace.updateTopic({ path: ['Obsidian'], revision: topicState.revision, description: 'root-edit-fixture', pinned: true });
	assert.deepEqual(topicState.pinnedPath, ['Obsidian']);
	topicState = await workspace.updateTopic({ path: ['SBTI'], revision: topicState.revision, description: '', pinned: true });
	assert.deepEqual(topicState.pinnedPath, ['SBTI']);
	const replacedPin = JSON.parse((await workspace.changes({ ids: [] })).files[0].after);
	assert.equal(replacedPin.Obsidian.pinned, undefined);
	assert.equal(replacedPin.SBTI.pinned, true);
	assert.equal(replacedPin.Obsidian.description, 'root-edit-fixture');
	assert.equal(replacedPin['Obsidian/云存储/GitHub'].description, 'child-edit-fixture');
	await assert.rejects(workspace.updateTopic({ path: topicPath, revision: topicState.revision, description: 'child-edit-fixture', pinned: true }));
	await assert.rejects(workspace.updateTopic({ path: ['SBTI'], revision: topicState.revision, description: '', pinned: 'true' }));
	topicState = await workspace.updateTopic({ path: ['SBTI'], revision: topicState.revision, description: '', pinned: false });
	assert.equal(topicState.pinnedPath, null);
	assert.equal(JSON.parse((await workspace.changes({ ids: [] })).files[0].after).SBTI, undefined, '取消新建的空描述置顶不残留空配置');
	topicState = await workspace.updateTopic({ path: ['Obsidian'], revision: topicState.revision, description: 'root-edit-fixture', pinned: true });
	assert.deepEqual(await fs.readFile(topicsFile), topicBytes, '描述保存只修改本地工作区，不写正式文件');
	assert.deepEqual((await workspace.state()).jobs, topicJobs, '描述编辑不创建文章准备任务');
	await assert.rejects(workspace.updateTopic({ path: ['../outside'], revision: topicState.revision, description: 'invalid-fixture' }), /非法字符/);
	await assert.rejects(workspace.updateTopic({ path: ['unknown'], revision: topicState.revision, description: 'unknown-fixture' }), /不存在/);
	await workspace.close();
	workspace = await createAdminWorkspace({ dataRoot, runtimeRoot, tools: { node: process.execPath, git: gitExecutable } });
	topicState = (await workspace.state()).topics;
	assert.equal(topicState.entries.find((entry) => entry.path.join('/') === topicPath.join('/')).description, 'child-edit-fixture');
	assert.equal(topicState.dirtyPaths.length, 2, '重启保留未提交的专题描述');
	assert.deepEqual(topicState.pinnedPath, ['Obsidian'], '重启保留置顶草稿');
	const staleTopics = await workspace.changes({ ids: [] });
	topicState = await workspace.updateTopic({ path: ['Obsidian'], revision: topicState.revision, description: 'root-edit-fixture', pinned: false });
	await assert.rejects(workspace.commit({ token: staleTopics.token, message: '不能提交旧置顶差异' }));
	topicState = await workspace.updateTopic({ path: topicPath, revision: topicState.revision, description: 'changed-after-review-fixture' });
	await assert.rejects(workspace.commit({ token: staleTopics.token, message: '不能提交旧专题差异' }), /失效/);
	const externalPlan = await workspace.changes({ ids: [] });
	await write(topicsFile, JSON.stringify({ Obsidian: { description: 'external-topic-fixture' } }));
	assert.equal((await workspace.state()).topics.conflict, true);
	await assert.rejects(workspace.changes({ ids: [] }), /冲突/);
	await assert.rejects(workspace.commit({ token: externalPlan.token, message: '不能覆盖外部专题修改' }), /失效/);
	topicState = await workspace.resetTopics({});
	assert.equal(topicState.entries.find((entry) => entry.path.join('/') === 'Obsidian').description, 'external-topic-fixture');
	assert.equal(topicState.dirtyPaths.length, 0);
	assert.equal(topicState.pinnedPath, null);
	await assert.rejects(workspace.changes({ ids: [] }), /请选择/);
	topicState = await workspace.updateTopic({ path: topicPath, revision: topicState.revision, description: 'committed-topic-fixture' });
	const combinedTopics = await workspace.changes({ ids: linkedBatch.articles.map((entry) => entry.id) });
	assert(combinedTopics.files.some((file) => file.kind === 'article'));
	assert(combinedTopics.files.some((file) => file.path === 'src/data/topics.json'));
	const topicOnly = await workspace.changes({ ids: [] });
	assert.deepEqual(topicOnly.files.map((file) => file.path), ['src/data/topics.json']);
	assert.deepEqual(topicOnly.topics, [topicPath]);
	const topicCommit = await workspace.commit({ token: topicOnly.token, message: 'Topic description fixture' });
	assert.deepEqual((await git(['diff-tree', '--no-commit-id', '--name-only', '-r', topicCommit.sha])).stdout.trim().split('\n'), ['src/data/topics.json']);
	assert.equal((await workspace.state()).topics.dirtyPaths.length, 0);
	assert((await workspace.changes({ ids: linkedBatch.articles.map((entry) => entry.id) })).files.some((file) => file.kind === 'article'), '专题提交不得使就绪文章检查失效');
	topicState = (await workspace.state()).topics;
	topicState = await workspace.updateTopic({ path: topicPath, revision: topicState.revision, description: '' });
	assert.equal(topicState.entries.find((entry) => entry.path.join('/') === topicPath.join('/')).description, '');
	assert.equal(JSON.parse((await workspace.changes({ ids: [] })).files[0].after)[topicPath.join('/')].description, '');
	await workspace.resetTopics({});
	topicState = (await workspace.state()).topics;
	const publicationBeforePin = await workspace.publication();
	topicState = await workspace.updateTopic({ path: ['Obsidian'], revision: topicState.revision, description: 'external-topic-fixture', pinned: true });
	await assert.rejects(workspace.publish({ token: publicationBeforePin.token }));
	const pinnedOnly = await workspace.changes({ ids: [] });
	assert.deepEqual(pinnedOnly.files.map((file) => file.path), ['src/data/topics.json']);
	assert.deepEqual(pinnedOnly.topics, [['Obsidian']]);
	const pinCommit = await workspace.commit({ token: pinnedOnly.token, message: 'Pinned topic fixture' });
	assert.deepEqual((await git(['diff-tree', '--no-commit-id', '--name-only', '-r', pinCommit.sha])).stdout.trim().split('\n'), ['src/data/topics.json']);
	assert.deepEqual((await workspace.state()).topics.pinnedPath, ['Obsidian']);
	assert.equal((await workspace.state()).topics.dirtyPaths.length, 0);
	assert.deepEqual((await workspace.state()).jobs, topicJobs, '置顶编辑与提交不创建准备任务');
	assert((await workspace.changes({ ids: linkedBatch.articles.map((entry) => entry.id) })).files.some((file) => file.kind === 'article'));
	topicState = (await workspace.state()).topics;
	topicState = await workspace.updateTopic({ path: ['Obsidian'], revision: topicState.revision, description: 'external-topic-fixture', pinned: false });
	assert.equal(topicState.pinnedPath, null);
	assert.equal(JSON.parse((await workspace.changes({ ids: [] })).files[0].after).Obsidian.pinned, undefined);
	await workspace.resetTopics({});
	const topicPublication = await workspace.publication();
	await workspace.publish({ token: topicPublication.token });
	await idle();
	assert.equal((await workspace.state()).publication.state, 'pushed');
	assert.equal(JSON.parse((await git(['show', 'refs/remotes/origin/master:src/data/topics.json'])).stdout)[topicPath.join('/')].description, 'committed-topic-fixture');
	assert.equal(JSON.parse((await git(['show', 'refs/remotes/origin/master:src/data/topics.json'])).stdout).Obsidian.pinned, true);
	const originalHead = (await git(['rev-parse', 'HEAD'])).stdout.trim();
	await workspace.close();
	const workspaceFile = path.join(dataRoot, 'config/workspace.json');
	const interrupted = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
	interrupted.jobs.push({ id: 'interrupted-fixture', state: 'running', articleIds: [photoId], progress: {}, errors: [] });
	await fs.writeFile(workspaceFile, JSON.stringify(interrupted));
	workspace = await createAdminWorkspace({ dataRoot, runtimeRoot, tools: { node: process.execPath, git: gitExecutable } });
	assert.equal(workspace.job({ id: 'interrupted-fixture' }).state, 'cancelled');
	assert.equal((await workspace.getArticle({ id: photoId })).article.preparation.state, 'unchecked');
	assert.equal((await git(['rev-parse', 'HEAD'])).stdout.trim(), originalHead);

	const isolatedGit = createRepositoryGit({ repoRoot, dataRoot, executable: gitExecutable });
	assert((await isolatedGit.pending()).head);
	const deployed = await isolatedGit.deployment({
		head: originalHead, remote: 'https://github.com/example/blog.git',
	}, 'https://example.invalid/', {
		request: async (url) => new Response(JSON.stringify(String(url).includes('api.github.com') ? {
			workflow_runs: [{ head_sha: originalHead, path: '.github/workflows/deploy.yml', status: 'completed', conclusion: 'success' }],
		} : { gitSha: originalHead }), { status: 200 }),
	});
	assert.equal(deployed.state, 'deployed');
	assert.equal(deployed.sha, originalHead);
	console.log(`PASS DSI Admin workspace: 持久草稿、隔离准备、真实 Astro、精确提交推送、源监听、附件冲突、图片转换与缓存、批量失败隔离、事件取消及中断恢复。${root}`);
} finally {
	await workspace?.close();
}

function pathToImport(relative) {
	return pathToFileURL(path.join(runtimeRoot, relative)).href;
}
