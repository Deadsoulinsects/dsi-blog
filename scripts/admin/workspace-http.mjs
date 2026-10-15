import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const prefix = '/__admin-workspace';
const actions = {
	configure: 'configure',
	scan: 'scan',
	import: 'importNotes',
	bind: 'bindSource',
	update: 'updateArticle',
	'update-topic': 'updateTopic',
	'reset-topics': 'resetTopics',
	prepare: 'prepare',
	changes: 'changes',
	commit: 'commit',
	publish: 'publish',
	cancel: 'cancel',
	sync: 'sync',
};
const contentTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.woff2': 'font/woff2',
};

function json(response, code, value) {
	response.writeHead(code, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
	response.end(JSON.stringify(value));
}

async function body(request) {
	if (!request.headers['content-type']?.startsWith('application/json')) {
		throw new Error('操作请求必须使用 application/json。');
	}
	let length = 0;
	const parts = [];
	for await (const part of request) {
		length += part.length;
		if (length > 1024 * 1024) throw new Error('操作请求超过 1 MiB，请分批选择文章。');
		parts.push(part);
	}
	const value = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('操作参数必须是对象。');
	return value;
}

async function sendFile(request, response, file, mime) {
	const stat = await fs.stat(file);
	if (!stat.isFile()) throw new Error('资源不是文件。');
	const headers = { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
	const range = request.headers.range;
	let start = 0;
	let end = stat.size - 1;
	if (range) {
		const match = /^bytes=(\d*)-(\d*)$/.exec(range);
		if (!match || (!match[1] && !match[2])) {
			response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
			response.end();
			return;
		}
		start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
		end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
			response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
			response.end();
			return;
		}
		headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
	}
	headers['Content-Length'] = String(Math.max(0, end - start + 1));
	response.writeHead(range ? 206 : 200, headers);
	const stream = createReadStream(file, { start, end });
	response.once('close', () => stream.destroy());
	stream.once('error', () => response.destroy());
	stream.pipe(response);
}

export function createWorkspaceMiddleware(workspace, { origin }) {
	const streams = new Set();
	let activeMutations = 0;
	let closing = false;
	const unsubscribe = workspace.subscribe(() => {
		for (const response of streams) response.write('event: change\ndata: {}\n\n');
	});

	const handler = async (request, response, next) => {
		const expectedOrigin = typeof origin === 'function' ? origin(request) : origin;
		const url = new URL(request.url, expectedOrigin);
		if (!url.pathname.startsWith(`${prefix}/`)) {
			next?.();
			return false;
		}
		const sameHost = request.headers.host === new URL(expectedOrigin).host;
		const sameOrigin = !request.headers.origin || request.headers.origin === expectedOrigin;
		if (!sameHost || !sameOrigin || request.headers['sec-fetch-site'] === 'cross-site') {
			json(response, 403, { error: '本地操作只接受管理程序同源请求。' });
			return true;
		}
		if (closing) {
			json(response, 503, { error: '程序正在退出，不再接收新操作。' });
			return true;
		}
		const action = url.pathname.slice(prefix.length + 1);
		try {
			if (request.method === 'GET' && action === 'events') {
				response.writeHead(200, {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-store',
					Connection: 'keep-alive',
				});
				response.write('event: change\ndata: {}\n\n');
				streams.add(response);
				response.once('close', () => streams.delete(response));
			} else if (request.method === 'GET' && action === 'state') {
				json(response, 200, await workspace.state());
			} else if (request.method === 'GET' && action === 'article') {
				json(response, 200, await workspace.getArticle({ id: url.searchParams.get('id') }));
			} else if (request.method === 'GET' && action === 'binding-candidates') {
				json(response, 200, await workspace.bindingCandidates({ id: url.searchParams.get('id') }));
			} else if (request.method === 'GET' && action === 'publication') {
				json(response, 200, await workspace.publication());
			} else if (request.method === 'GET' && action === 'job') {
				json(response, 200, await workspace.job({ id: url.searchParams.get('id') }));
			} else if (request.method === 'GET' && action.startsWith('media/')) {
				const resource = await workspace.readMedia({ path: decodeURIComponent(action.slice(6)) });
				if (resource.bytes) {
					response.writeHead(200, { 'Content-Type': resource.mime, 'Cache-Control': 'no-store' });
					response.end(resource.bytes);
				} else {
					await sendFile(request, response, resource.path, resource.mime);
				}
			} else if (request.method === 'POST' && actions[action]) {
				if (request.headers.origin !== expectedOrigin) {
					json(response, 403, { error: '写入操作必须携带管理程序 Origin。' });
					return true;
				}
				activeMutations += 1;
				try {
					const result = await workspace[actions[action]](await body(request));
					json(response, 200, result);
				} finally {
					activeMutations -= 1;
				}
			} else {
				json(response, 404, { error: '不存在该管理操作。' });
			}
		} catch (error) {
			if (!response.headersSent) json(response, 400, { error: error.message });
			else response.destroy();
		}
		return true;
	};
	return {
		handler,
		get activeMutations() { return activeMutations; },
		stop() {
			closing = true;
			unsubscribe();
			for (const response of streams) response.end();
			streams.clear();
		},
	};
}

export async function serveAdminWorkspace(workspace, { uiRoot, port = 0 }) {
	const staticRoot = await fs.realpath(uiRoot);
	let origin;
	const middleware = createWorkspaceMiddleware(workspace, { origin: () => origin });
	const server = http.createServer(async (request, response) => {
		try {
			if (await middleware.handler(request, response)) return;
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				json(response, 405, { error: '静态页面不接受写入请求。' });
				return;
			}
			let relative = decodeURIComponent(new URL(request.url, origin).pathname);
			if (relative === '/') relative = '/admin/';
			if (relative.endsWith('/')) relative += 'index.html';
			const requested = path.resolve(staticRoot, `.${relative}`);
			if (!requested.startsWith(`${staticRoot}${path.sep}`)) throw new Error('页面路径越界。');
			const file = await fs.realpath(requested);
			if (!file.startsWith(`${staticRoot}${path.sep}`)) throw new Error('页面链接越界。');
			const mime = contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream';
			response.setHeader('Content-Security-Policy',
				"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'");
			response.setHeader('X-Content-Type-Options', 'nosniff');
			response.setHeader('Referrer-Policy', 'no-referrer');
			if (request.method === 'HEAD') {
				await fs.access(file);
				response.writeHead(200, { 'Content-Type': mime });
				response.end();
			} else {
				await sendFile(request, response, file, mime);
			}
		} catch (error) {
			if (!response.headersSent) json(response, error.code === 'ENOENT' ? 404 : 400, { error: error.message });
			else response.destroy();
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
	origin = `http://127.0.0.1:${server.address().port}`;
	return {
		origin,
		get activeMutations() { return middleware.activeMutations; },
		async close() {
			middleware.stop();
			await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
		},
	};
}
