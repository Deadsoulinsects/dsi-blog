import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';

/** Exercise the real middleware wire boundary with the shared sandbox fixture. */
export async function verifyAdminHttp(fixture) {
	const f = await fixture('http');
	const server = createServer((req, res) => { void f.api.middleware(req, res, () => { res.writeHead(404); res.end('not found'); }); });
	const listening = once(server, 'listening');
	server.listen(0, '127.0.0.1'); await listening;
	const origin = `http://127.0.0.1:${server.address().port}`;
	const call = (path, { method = 'GET', headers = {}, payload } = {}) => new Promise((resolvePromise, reject) => {
		const raw = payload === undefined ? undefined : typeof payload === 'string' ? payload : JSON.stringify(payload);
		const req = request(`${origin}${path}`, { method, signal: AbortSignal.timeout(15_000),
			headers: { Origin: origin, ...(raw === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) }), ...headers } }, (res) => {
			const chunks = [];
			res.on('data', (chunk) => chunks.push(chunk));
			res.on('end', () => {
				const text = Buffer.concat(chunks).toString();
				let data; try { data = JSON.parse(text); } catch { data = text; }
				resolvePromise({ status: res.statusCode, data });
			});
			res.on('error', reject);
		});
		req.on('error', reject); req.end(raw);
	});
	try {
		assert.equal((await call('/__admin-local/capabilities')).status, 200);
		assert.equal((await call('/__admin-local/capabilities', { headers: { Origin: 'http://evil.invalid' } })).status, 403);
		assert.equal((await call('/__admin-local/capabilities', { headers: { Host: 'evil.invalid', Origin: 'http://evil.invalid' } })).status, 403);
		assert.equal((await call('/__admin-local/capabilities', { headers: { Origin: '', 'Sec-Fetch-Site': 'same-origin' } })).status, 403);
		// Native browser GET omits Origin but sends this browser-controlled header.
		const native = await fetch(`${origin}/__admin-local/capabilities`, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
		assert.equal(native.status, 200);
		assert.equal((await fetch(`${origin}/__admin-local/capabilities`)).status, 403);
		assert.equal((await call('/__admin-local/nope')).status, 404);
		assert.equal((await call('/__admin-local/inspect', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, payload: f.input })).status, 415);
		assert.equal((await call('/__admin-local/inspect', { method: 'POST', payload: 'x'.repeat(16385) })).status, 413);
		assert.equal((await call('/__admin-local/inspect', { method: 'POST', payload: '{' })).status, 400);
		for (const input of [{ ...f.input, note: '../bad.md' }, { ...f.input, storeRoot: f.repoRoot }, { ...f.input, ffmpeg: 'cmd.exe /c anything' }, { ...f.input, note: f.target }])
			assert.equal((await call('/__admin-local/inspect', { method: 'POST', payload: input })).status, 400);
		const inspected = await call('/__admin-local/inspect', { method: 'POST', payload: f.input });
		assert.equal(inspected.status, 200);
		assert.equal(inspected.data.counts.resources, 2);
		let response = await call('/__admin-local/prepare', { method: 'POST', payload: f.input });
		assert.equal(response.status, 202);
		let job = response.data;
		while (!['succeeded', 'failed'].includes(job.state)) {
			response = await call(`/__admin-local/jobs/${job.id}?after=${job.revision}`);
			assert.equal(response.status, 200); job = response.data;
		}
		assert.equal(job.state, 'succeeded', job.error);
		assert.equal(job.report.formal.ready, true);
		assert.equal((await call(`/__admin-local/jobs/${job.id}?after=no`)).status, 400);
	} finally {
		const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed;
	}
}
