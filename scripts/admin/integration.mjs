import { fileURLToPath } from 'node:url';
import { createAdminLocal } from './local.mjs';
import path from 'node:path';
import { createAdminWorkspace } from './workspace.mjs';
import { createWorkspaceMiddleware } from './workspace-http.mjs';

// Astro reloads configuration when its imported manifest changes. Keep running jobs.
const coordinatorsKey = Symbol.for('dsi.admin.local.coordinators');
const coordinators = globalThis[coordinatorsKey] ??= new Map();
const workspaces = globalThis[Symbol.for('dsi.admin.workspaces')] ??= new Map();

/** The installed Astro integration API's development-only server hook. */
export default function adminLocalIntegration() {
	let repoRoot;
	return {
		name: 'dsi-admin-local',
		hooks: {
			'astro:config:done': ({ config }) => { repoRoot = fileURLToPath(config.root); },
			'astro:server:setup': ({ server }) => {
				if (!coordinators.has(repoRoot)) coordinators.set(repoRoot, createAdminLocal({ repoRoot }));
				server.middlewares.use(coordinators.get(repoRoot).middleware);
				let middleware;
				server.middlewares.use(async (request, response, next) => {
					if (!request.url?.startsWith('/__admin-workspace/')) { next(); return; }
					try {
						if (!workspaces.has(repoRoot)) {
							workspaces.set(repoRoot, createAdminWorkspace({
								repoRoot, runtimeRoot: repoRoot,
								dataRoot: process.env.DSI_ADMIN_DATA_ROOT || 'D:/ai-output/DSI Admin开发/dev-data',
								tools: {
									node: process.execPath,
									git: path.join(repoRoot, 'node_modules/dugite/git/mingw64/bin/git.exe'),
									ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
									ffprobe: process.env.FFPROBE_BIN || 'ffprobe',
								},
							}));
						}
						const workspace = await workspaces.get(repoRoot);
						if (!middleware) {
							middleware = createWorkspaceMiddleware(workspace, {
								origin(request) {
									const address = server.httpServer.address();
									const port = typeof address === 'object' && address ? address.port : 0;
									const url = new URL(`http://${request.headers.host}`);
									return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port) === port
										? url.origin : `http://127.0.0.1:${port}`;
								},
							});
							server.httpServer.once('close', () => {
								middleware.stop();
								void workspace.close().catch((error) => console.error('工作区退出失败：', error.message));
								workspaces.delete(repoRoot);
							});
						}
						await middleware.handler(request, response, next);
					} catch (error) {
						response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
						response.end(JSON.stringify({ error: error.message }));
					}
				});
			},
		},
	};
}
