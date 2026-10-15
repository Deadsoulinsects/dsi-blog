import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = path.resolve(process.argv[2]);
const runtimeRoot = path.resolve(process.argv[3] || '.');
const { createAdminWorkspace } = await import(pathToFileURL(path.join(runtimeRoot, 'scripts/admin/workspace.mjs')));
const original = await fs.readFile(source);
const previous = JSON.parse(original);
const output = process.env.DSI_QA_ROOT || 'D:/ai-output/DSI Admin启动修复';
await fs.mkdir(output, { recursive: true });
const root = await fs.mkdtemp(path.join(output, 'legacy-'));
const dataRoot = path.join(root, 'data');
await fs.mkdir(path.join(dataRoot, 'config'), { recursive: true });
await fs.copyFile(source, path.join(dataRoot, 'config/workspace.json'));
let workspace;
try {
	workspace = await createAdminWorkspace({ dataRoot, runtimeRoot });
	const state = await workspace.state();
	for (const article of previous.articles) {
		const migrated = state.articles.find((entry) => entry.id === article.id);
		assert(migrated, '旧草稿必须保留。');
		assert.equal(Object.hasOwn(migrated, 'pubDate'), false);
		assert.equal(typeof migrated.completion_date, 'string');
		assert.equal(migrated.mediaId, article.mediaId);
	}
	await workspace.cancel({});
	await workspace.close();
	workspace = null;
	assert.deepEqual(await fs.readFile(source), original, '真实旧工作区不得被验收修改。');
	console.log(`LEGACY_STARTUP_PASS ${state.articles.length} articles ${root}`);
} finally {
	await workspace?.cancel({});
	await workspace?.close();
}
