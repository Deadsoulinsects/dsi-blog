import fs from 'node:fs/promises';
import path from 'node:path';
import { createAdminWorkspace } from '../scripts/admin/workspace.mjs';
import { serveAdminWorkspace } from '../scripts/admin/workspace-http.mjs';

let workspace;
let server;
let credential = '';
let initialized = false;
const parent = process.parentPort;

async function initialize(options) {
	credential = options.credential || '';
	workspace = await createAdminWorkspace({ ...options, getToken: () => credential });
	server = await serveAdminWorkspace(workspace, { uiRoot: options.uiRoot });
	await fs.writeFile(path.join(options.dataRoot, 'logs', 'engine-start.json'),
		JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), cleanExit: false }));
	initialized = true;
	parent.postMessage({ type: 'ready', origin: server.origin });
}

parent.on('message', async ({ data }) => {
	try {
		if (data.type === 'initialize') {
			if (initialized) throw new Error('本地引擎已经启动。');
			await initialize(data.options);
			return;
		}
		if (!workspace) throw new Error('本地引擎尚未准备好。');
		let result;
		if (data.method === 'status') {
			const state = await workspace.state();
			result = { activeMutations: server.activeMutations, jobs: state.jobs, configuration: state.configuration };
		} else if (data.method === 'source') {
			result = (await workspace.getArticle({ id: data.id })).article.sourcePath;
		} else if (data.method === 'credential') {
			credential = data.token;
			result = true;
		} else if (data.method === 'shutdown') {
			const drained = server.close();
			if (data.cancel) await workspace.cancel({});
			await drained;
			if (data.cancel) await workspace.cancel({});
			await workspace.close();
			result = true;
			await fs.writeFile(path.join(data.dataRoot, 'logs', 'engine-start.json'),
				JSON.stringify({ pid: process.pid, stoppedAt: new Date().toISOString(), cleanExit: true }));
		} else {
			throw new Error('不存在该宿主操作。');
		}
		parent.postMessage({ type: 'reply', requestId: data.requestId, result });
		if (data.method === 'shutdown') process.exit(0);
	} catch (error) {
		parent.postMessage({ type: data.type === 'initialize' ? 'failed' : 'reply', requestId: data.requestId, error: error.message });
	}
});
