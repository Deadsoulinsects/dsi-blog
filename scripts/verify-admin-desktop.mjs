import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { serveAdminWorkspace } from './admin/workspace-http.mjs';
import { ensureDataDirectory } from '../desktop/runtime.mjs';

const output = process.env.DSI_QA_ROOT || (process.platform === 'win32' ? 'D:/ai-output/DSI Admin开发/桌面回归' : os.tmpdir());
await fs.mkdir(output, { recursive: true });
const root = await fs.mkdtemp(path.join(output, 'http-'));
const uiRoot = path.join(root, 'ui');
await fs.mkdir(path.join(uiRoot, 'admin'), { recursive: true });
await fs.writeFile(path.join(uiRoot, 'admin/index.html'), '<!doctype html><html><body>HTTP fixture</body></html>');
await fs.writeFile(path.join(root, 'secret.txt'), 'PRIVATE_FIXTURE');
const media = path.join(root, 'media.mp4');
await fs.writeFile(media, Buffer.from(Array.from({ length: 16 }, (_, index) => index)));
let observer;
let mutations = 0;
let entered;
let release;
const enteredSignal = new Promise((resolve) => { entered = resolve; });
const releaseSignal = new Promise((resolve) => { release = resolve; });
const workspace = {
	subscribe(callback) { observer = callback; return () => { observer = undefined; }; },
	async state() { return { configured: false, articles: [], jobs: [] }; },
	async bindingCandidates(values) {
		assert.equal(values.id, 'binding-fixture');
		return { candidates: [{ path: '/notes/article.md', relativePath: 'article.md' }] };
	},
	async configure(values) {
		assert.equal(values.repoRoot, 'fixture');
		mutations += 1;
		entered();
		await releaseSignal;
		return { configured: true };
	},
	async readMedia(values) {
		if (values.path !== 'article/media/hash.mp4') throw new Error('资源不属于当前文章');
		return { path: media, mime: 'video/mp4' };
	},
};
const server = await serveAdminWorkspace(workspace, { uiRoot });
const request = (pathname, init = {}) => new Promise((resolve, reject) => {
	const outgoing = http.request(`${server.origin}${pathname}`, {
		method: init.method || 'GET', headers: init.headers, signal: AbortSignal.timeout(10000),
	}, (response) => {
		if (pathname.endsWith('/events')) {
			const iterator = response[Symbol.asyncIterator]();
			resolve({ body: { getReader: () => ({
				read: () => iterator.next(),
				cancel: () => iterator.return(),
			}) } });
			return;
		}
		const chunks = [];
		response.on('data', (chunk) => chunks.push(chunk));
		response.once('error', reject);
		response.once('end', () => resolve(new Response(Buffer.concat(chunks), {
			status: response.statusCode, headers: response.headers,
		})));
	});
	outgoing.once('error', reject);
	outgoing.end(init.body);
});
async function event(reader) {
	let text = '';
	while (!text.includes('\n\n')) {
		const chunk = await reader.read();
		assert(!chunk.done);
		text += new TextDecoder().decode(chunk.value);
	}
	return text;
}
try {
	assert.equal((await request('/__admin-workspace/state')).status, 200);
	const candidates = await request('/__admin-workspace/binding-candidates?id=binding-fixture');
	assert.equal(candidates.status, 200);
	assert.deepEqual(await candidates.json(), { candidates: [{ path: '/notes/article.md', relativePath: 'article.md' }] });
	assert.equal((await request('/__admin-workspace/binding-candidates?id=binding-fixture', { headers: { Origin: 'https://other.invalid' } })).status, 403);
	assert.equal(mutations, 0);
	assert.equal((await request('/__admin-workspace/state', { headers: { Origin: 'https://other.invalid' } })).status, 403);
	assert.equal((await request('/__admin-workspace/state', { headers: { Host: 'other.invalid' } })).status, 403);
	assert.equal((await request('/__admin-workspace/state', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
	assert.equal((await request('/__admin-workspace/configure', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"repoRoot":"fixture"}',
	})).status, 403);
	assert.equal(mutations, 0);
	const mutation = request('/__admin-workspace/configure', {
		method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json' },
		body: '{"repoRoot":"fixture"}',
	});
	await Promise.race([
		enteredSignal,
		new Promise((_, reject) => {
			const signal = AbortSignal.timeout(10000);
			signal.addEventListener('abort', () => reject(signal.reason), { once: true });
		}),
	]);
	assert.equal(server.activeMutations, 1);
	release();
	assert.equal((await mutation).status, 200);
	assert.equal(server.activeMutations, 0);
	assert.equal(mutations, 1);
	const response = await request('/admin/');
	assert.equal(response.status, 200);
	assert(response.headers.get('content-security-policy').includes("default-src 'self'"));
	assert.equal((await request('/..%2fsecret.txt')).status, 400);
	assert.equal((await request('/__admin-workspace/media/unauthorized')).status, 400);
	const range = await request('/__admin-workspace/media/article/media/hash.mp4', { headers: { Range: 'bytes=4-7' } });
	assert.equal(range.status, 206);
	assert.equal(range.headers.get('content-range'), 'bytes 4-7/16');
	assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [4, 5, 6, 7]);
	assert.equal((await request('/__admin-workspace/media/article/media/hash.mp4', { headers: { Range: 'bytes=50-' } })).status, 416);
	const events = await request('/__admin-workspace/events');
	const reader = events.body.getReader();
	assert((await event(reader)).includes('event: change'));
	const changed = event(reader);
	observer();
	assert((await changed).includes('event: change'));
	await reader.cancel();
	const data = await ensureDataDirectory(path.join(root, '安装目录/data'));
	for (const name of ['config', 'drafts', 'cache', 'staging', 'logs']) assert((await fs.stat(path.join(data, name))).isDirectory());
	const unavailable = path.join(root, 'not-a-directory');
	await fs.writeFile(unavailable, '');
	await assert.rejects(ensureDataDirectory(unavailable), /不可写/);
	console.log(`PASS desktop HTTP: 同源保护、写入边界、SSE、私有路径拒绝、视频 Range、数据目录及不可写诊断。${root}`);
} finally {
	release();
	await server.close();
}
