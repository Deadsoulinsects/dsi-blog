import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Run with the shipped executable and ELECTRON_RUN_AS_NODE=1, not host node_modules.
const installRoot = path.resolve(process.argv[2]);
const runtimeRoot = path.join(installRoot, 'resources/app');
const packageMetadata = JSON.parse(await fs.readFile(path.join(runtimeRoot, 'package.json'), 'utf8'));
assert.equal(packageMetadata.version, '0.1.3');
const { createAdminWorkspace } = await import(pathToFileURL(path.join(runtimeRoot, 'scripts/admin/workspace.mjs')));
const { command, hash } = await import(pathToFileURL(path.join(runtimeRoot, 'scripts/admin/workspace-io.mjs')));
const { installedTools } = await import(pathToFileURL(path.join(runtimeRoot, 'desktop/runtime.mjs')));
const tools = await installedTools(runtimeRoot, process.execPath);
await fs.mkdir('D:/ai-output/DSI Admin优化', { recursive: true });
const root = await fs.mkdtemp('D:/ai-output/DSI Admin优化/打包验收-');
const repoRoot = path.join(root, 'repo');
const sourceRoot = path.join(root, '笔记');
const dataRoot = path.join(root, '程序/data');
const write = async (relative, text) => {
	const file = path.join(repoRoot, relative);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, text);
};
let workspace;
try {
	await fs.access(path.join(runtimeRoot, 'node_modules/astro/templates/content/types.d.ts'));
	await fs.access(path.join(runtimeRoot, 'node_modules/typescript/lib/lib.es2022.d.ts'));
	await write('package.json', JSON.stringify({ name: 'installed-fixture', type: 'module' }));
	await write('astro.config.mjs', "import { defineConfig } from 'astro/config'; export default defineConfig({});");
	await write('tsconfig.json', JSON.stringify({ extends: 'astro/tsconfigs/strict', include: ['.astro/types.d.ts', 'src/**/*'] }));
	await write('src/content.config.ts', `import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
export const collections = { blog: defineCollection({loader:glob({pattern:'**/*.md',base:'./src/content/blog'}),schema:z.object({title:z.string(),description:z.string(),completion_date:z.coerce.date()})}) };`);
	await write('src/pages/blog/[...slug].astro', `---
import { getCollection, render } from 'astro:content';
export async function getStaticPaths(){return (await getCollection('blog')).map(entry=>({params:{slug:entry.id},props:{entry}}));}
const { entry } = Astro.props; const { Content } = await render(entry);
---
<html><body><h1>{entry.data.title}</h1><Content /></body></html>`);
	const formalText = '---\ntitle: 正式文章\ndescription: 安装检查\ncompletion_date: 2024-05-06\n---\n正式正文\n';
	await write('src/content/blog/正式.md', formalText);
	await write('src/data/media-manifest.json', '{"schemaVersion":1,"documents":{},"assets":{},"recipes":{}}');
	await fs.mkdir(path.join(repoRoot, 'public'));
	await fs.mkdir(sourceRoot);
	const note = path.join(sourceRoot, '安装检查.md');
	await fs.writeFile(note, '---\ntitle: 安装检查\ndescription: 验证安装后的完整检查工具\ncompletion_date: 2024-05-06\nstart_date: 2024-05-01\nend_date:\ntags: [安装验收]\n---\n<!-- article-header:start -->\n\n# 安装检查\n<!-- article-header:end -->\n\n真实正文检查\n');
	const git = (args) => command(tools.git, args, { cwd: repoRoot });
	await git(['init']);
	await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', '.']);
	await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
	const initialHead = (await git(['rev-parse', 'HEAD'])).stdout.trim();
	workspace = await createAdminWorkspace({ dataRoot, runtimeRoot, tools });
	await workspace.configure({ repoRoot, sourceRoot });

	// Given an actual shipped Astro check; subscribe before starting import.
	let unsubscribe;
	let deadline;
	const checking = new Promise((resolve, reject) => {
		deadline = setTimeout(() => { unsubscribe(); reject(new Error('安装版检查事件超时')); }, 120000);
		unsubscribe = workspace.subscribe((event) => {
			if (event?.job.progress.phase !== 'check') return;
			clearTimeout(deadline);
			unsubscribe();
			resolve(event.job);
		});
	});
	const imported = await workspace.importNotes({ paths: [note] });
	assert.equal(imported.errors.length, 0);
	const id = imported.articles[0].id;
	const running = await checking;
	const duplicate = await workspace.prepare({ ids: [id] });
	assert.equal(duplicate.jobId, running.id, '相同运行版本必须复用任务');
	const article = (await workspace.getArticle({ id })).article;
	const metadata = { title: article.title, description: article.description, completion_date: article.completion_date, topicPath: article.topicPath };
	const first = workspace.updateArticle({ id, revision: article.revision, metadata: { ...metadata, title: '第一次修改' } });
	const latest = workspace.updateArticle({ id, revision: article.revision + 1, metadata: { ...metadata, title: '最新修改' } });
	await Promise.all([first, latest]);
	await workspace.whenIdle(AbortSignal.timeout(180000));

	// Then only the latest pending version finishes; runtime builds really succeed.
	const state = await workspace.state();
	const result = state.articles.find((entry) => entry.id === id);
	assert.equal(result.title, '最新修改');
	assert.equal(result.completion_date, '2024-05-06');
	assert.equal(result.start_date, '2024-05-01');
	assert.equal(result.end_date, null);
	assert.deepEqual(result.tags, ['安装验收']);
	assert(!result.body.includes('article-header'));
	assert.equal(result.preparation.state, 'ready', JSON.stringify(result.preparation));
	const jobs = state.jobs.filter((job) => job.articleIds.includes(id));
	assert.equal(jobs.length, 2, '连续修改只能保留一个最新待处理任务');
	assert(jobs[0].results.some((entry) => entry.state === 'superseded'));
	assert(jobs[1].results.some((entry) => entry.state === 'ready' && entry.revision === result.revision));
	assert.equal(hash(await fs.readFile(path.join(repoRoot, 'src/content/blog/正式.md'))), hash(formalText));
	assert.equal((await git(['rev-parse', 'HEAD'])).stdout.trim(), initialHead);
	const proof = {
		passed: true, installRoot, node: process.execPath, tools, runtimeTemplates: true,
		actualAstroCheckAndBuild: true, sameVersionDedup: true, latestRevisionCoalesced: true,
		formalFilesUnchanged: true, jobs,
	};
	await fs.writeFile(path.join(root, '打包运行验收.json'), JSON.stringify(proof, null, 2));
	if (process.argv[3]) {
		await workspace.close();
		const realRepo = await fs.realpath(process.argv[3]);
		const originalHead = (await command(tools.git, ['rev-parse', 'HEAD'], { cwd: realRepo })).stdout.trim();
		workspace = await createAdminWorkspace({ dataRoot: path.join(root, '实际工程检查/data'), runtimeRoot, tools });
		await workspace.configure({ repoRoot: realRepo, sourceRoot });
		const { discoverMedia } = await import(pathToFileURL(path.join(runtimeRoot, 'src/shared/content/media.mjs')));
		const formal = (await workspace.state()).articles.find((entry) => entry.description.trim() && !discoverMedia(entry.body).references.length);
		assert(formal, '实际工程需要至少一篇元数据完整的无附件文章用于纯读验收');
		const originalBytes = await fs.readFile(path.join(realRepo, formal.targetPath));
		await workspace.prepare({ ids: [formal.id] });
		await workspace.whenIdle(AbortSignal.timeout(300000));
		const checked = (await workspace.getArticle({ id: formal.id })).article;
		assert.equal(checked.preparation.state, 'ready', JSON.stringify(checked.preparation));
		assert.deepEqual(await fs.readFile(path.join(realRepo, formal.targetPath)), originalBytes);
		assert.equal((await command(tools.git, ['rev-parse', 'HEAD'], { cwd: realRepo })).stdout.trim(), originalHead);
		await fs.writeFile(path.join(root, '实际工程验收.json'), JSON.stringify({
			passed: true, runtimeRoot, project: realRepo, article: checked.title,
			targetPath: checked.targetPath, head: originalHead, preparation: checked.preparation,
			formalFileUnchanged: true, headUnchanged: true,
		}, null, 2));
	}
	console.log(`PACKAGE_PASS ${root}`);
} finally {
	await workspace?.cancel({});
	await workspace?.close();
}
