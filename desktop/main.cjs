const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, utilityProcess } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let window;
let engine;
let origin;
let dataRoot;
let quitting = false;
let closing = false;
let sequence = 0;
const requests = new Map();
const credentialName = 'github-credential.bin';

function engineRequest(method, values = {}) {
	return new Promise((resolve, reject) => {
		const requestId = ++sequence;
		const timeout = setTimeout(() => {
			requests.delete(requestId);
			reject(new Error('本地引擎未在限定时间内响应，请查看恢复记录。'));
		}, method === 'shutdown' ? 30 * 60 * 1000 : 30 * 1000);
		requests.set(requestId, { resolve, reject, timeout });
		engine.postMessage({ requestId, method, ...values });
	});
}

async function readCredential() {
	try {
		const bytes = await fs.readFile(path.join(dataRoot, 'config', credentialName));
		return safeStorage.decryptString(bytes);
	} catch (error) {
		if (error.code === 'ENOENT') return '';
		throw new Error('GitHub 凭据无法解密，请在设置中重新连接。', { cause: error });
	}
}

function authorize(event) {
	const url = new URL(event.senderFrame.url);
	if (!window || event.sender !== window.webContents || event.senderFrame !== event.senderFrame.top
		|| url.origin !== origin || url.pathname !== '/admin/') {
		throw new Error('该窗口没有本地管理权限。');
	}
}

function installBridge() {
	ipcMain.handle('dsi:choose-directory', async (event) => {
		authorize(event);
		const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
		return result.canceled ? null : result.filePaths[0];
	});
	ipcMain.handle('dsi:choose-markdown', async (event, id) => {
		authorize(event);
		if (id !== undefined && typeof id !== 'string') throw new Error('文章标识无效。');
		const { configuration } = await engineRequest('status');
		let defaultPath = configuration.sourceRoot || undefined;
		if (id !== undefined) {
			const source = await engineRequest('source', { id });
			if (source) {
				try {
					await fs.access(source);
					defaultPath = path.dirname(source);
				} catch (error) {
					if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
				}
			}
		}
		const result = await dialog.showOpenDialog(window, {
			defaultPath,
			properties: ['openFile'],
			filters: [{ name: 'Markdown 文章', extensions: ['md', 'markdown'] }],
		});
		return result.canceled ? null : result.filePaths[0];
	});
	ipcMain.handle('dsi:open-source', async (event, id) => {
		authorize(event);
		if (typeof id !== 'string') throw new Error('文章标识无效。');
		const source = await engineRequest('source', { id });
		if (!source || !/\.(md|markdown)$/i.test(source)) throw new Error('该文章尚未绑定 Markdown 源文件。');
		await fs.access(source);
		await shell.openExternal(`obsidian://open?path=${encodeURIComponent(source)}`);
	});
	ipcMain.handle('dsi:set-credential', async (event, token) => {
		authorize(event);
		if (typeof token !== 'string' || token.length > 4096) throw new Error('GitHub 凭据无效。');
		if (!safeStorage.isEncryptionAvailable()) throw new Error('当前 Windows 用户的凭据加密不可用。');
		const file = path.join(dataRoot, 'config', credentialName);
		if (token.trim()) {
			const temporary = `${file}.tmp`;
			await fs.writeFile(temporary, safeStorage.encryptString(token.trim()));
			await fs.rename(temporary, file);
		} else {
			await fs.rm(file, { force: true });
		}
		await engineRequest('credential', { token: token.trim() });
		return { connected: Boolean(token.trim()) };
	});
	ipcMain.handle('dsi:open-external', async (event, value) => {
		authorize(event);
		const url = new URL(value);
		const { configuration } = await engineRequest('status');
		const siteHost = configuration.siteUrl ? new URL(configuration.siteUrl).hostname : '';
		if (url.protocol !== 'https:' || ![siteHost, 'github.com'].includes(url.hostname)) {
			throw new Error('只能打开博客或 GitHub 的 HTTPS 链接。');
		}
		await shell.openExternal(url.href);
	});
}

async function closeApplication() {
	if (closing) return;
	closing = true;
	const parent = window && !window.isDestroyed() ? window : null;
	try {
		if (parent) await parent.webContents.executeJavaScript('window.dsiWorkspaceFlush()');
		const status = await engineRequest('status');
		const busy = status.activeMutations > 0 || status.jobs.some((job) => ['queued', 'running'].includes(job.state));
		let cancel = false;
		if (busy) {
			const options = {
				type: 'question',
				title: '仍有任务正在进行',
				message: '请选择如何结束本次工作。',
				detail: '提交或推送已经进入关键阶段时，会先核对实际结果，不会直接重复操作。',
				buttons: parent ? ['完成后退出', '取消任务并退出', '继续使用'] : ['完成后退出', '取消任务并退出'],
		defaultId: 0,
				cancelId: parent ? 2 : 0,
			};
			const answer = await dialog.showMessageBox(...(parent ? [parent, options] : [options]));
			if (answer.response === 2) return;
			cancel = answer.response === 1;
			parent?.setTitle(cancel ? 'DSI Admin — 正在取消任务' : 'DSI Admin — 完成任务后退出');
		}
		await engineRequest('shutdown', { cancel, dataRoot });
		quitting = true;
		app.quit();
	} catch (error) {
		const options = {
			type: 'error', title: '暂时无法安全退出', message: error.message,
			detail: parent ? '窗口将保留，任务结果记录也将保留。可查看日志后重试退出。' : '恢复记录已保留；重新启动时会核对未完成操作，不会自动重复提交或推送。',
		};
		await dialog.showMessageBox(...(parent ? [parent, options] : [options]));
		if (!parent) { engine?.kill(); quitting = true; app.quit(); }
	} finally {
		closing = false;
	}
}

async function start(runtime) {
	const runtimeRoot = path.resolve(__dirname, '..');
	const tools = await runtime.installedTools(runtimeRoot, process.execPath);
	let credentialProblem;
	const credential = await readCredential().catch((error) => {
		credentialProblem = error.message;
		return '';
	});
	engine = utilityProcess.fork(path.join(__dirname, 'engine.mjs'), [], { stdio: 'pipe', serviceName: 'DSI Admin 内容引擎' });
	const log = path.join(dataRoot, 'logs', 'engine.log');
	const writeLog = (bytes) => { fs.appendFile(log, bytes).catch((error) => console.error('引擎日志写入失败：', error.message)); };
	engine.stdout.on('data', writeLog);
	engine.stderr.on('data', writeLog);
	const ready = new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('本地引擎启动超时。')), 30000);
		engine.on('message', (message) => {
			if (message.type === 'ready') {
				clearTimeout(timeout);
				resolve(message.origin);
			} else if (message.type === 'failed') {
				clearTimeout(timeout);
				reject(new Error(message.error));
			} else if (message.type === 'reply') {
				const request = requests.get(message.requestId);
				if (!request) return;
				requests.delete(message.requestId);
				clearTimeout(request.timeout);
				if (message.error) request.reject(new Error(message.error));
				else request.resolve(message.result);
			}
		});
		engine.once('exit', (code) => {
			for (const request of requests.values()) {
				clearTimeout(request.timeout);
				request.reject(new Error(`本地引擎已退出（${code}），未完成操作需要恢复核对。`));
			}
			requests.clear();
			if (!quitting) {
				quitting = true;
				dialog.showErrorBox('DSI Admin 内容引擎停止', '恢复记录已经保留。请重新启动程序核对任务状态。');
				app.quit();
			}
		});
	});
	engine.postMessage({
		type: 'initialize',
		options: { dataRoot, runtimeRoot, tools, credential, uiRoot: path.join(__dirname, 'ui') },
	});
	origin = await ready;
	installBridge();
	window = new BrowserWindow({
		width: 1440, height: 960, minWidth: 720, minHeight: 600,
		title: 'DSI Admin', backgroundColor: '#08090c', autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true, sandbox: true, nodeIntegration: false,
		},
	});
	window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	window.webContents.on('will-navigate', (event, url) => {
		if (url !== `${origin}/admin/`) event.preventDefault();
	});
	window.on('close', (event) => {
		if (quitting) return;
		event.preventDefault();
		void closeApplication();
	});
	await window.loadURL(`${origin}/admin/`);
	if (credentialProblem) await dialog.showMessageBox(window, {
		type: 'warning', title: '请重新连接 GitHub', message: credentialProblem,
		detail: '草稿与本地管理仍可使用；在设置中重新保存凭据后再发布。',
	});
}

async function bootstrap() {
	const runtime = await import(pathToFileURL(path.join(__dirname, 'runtime.mjs')).href);
	const installRoot = app.isPackaged ? path.dirname(process.execPath) : path.resolve('D:/ai-output/DSI Admin开发');
	dataRoot = await runtime.ensureDataDirectory(process.env.DSI_ADMIN_DATA_ROOT || path.join(installRoot, 'data'));
	const profile = path.join(dataRoot, 'cache', 'electron');
	const crash = path.join(dataRoot, 'logs', 'crash');
	await fs.mkdir(profile, { recursive: true });
	await fs.mkdir(crash, { recursive: true });
	app.setPath('userData', profile);
	app.setPath('sessionData', profile);
	app.setPath('crashDumps', crash);
	if (!app.requestSingleInstanceLock()) {
		quitting = true;
		app.quit();
		return;
	}
	app.on('second-instance', () => {
		if (window?.isMinimized()) window.restore();
		window?.focus();
	});
	app.on('window-all-closed', () => {
		if (!quitting) void closeApplication();
	});
	app.on('before-quit', (event) => {
		if (quitting) return;
		event.preventDefault();
		if (window) void closeApplication();
		else {
			engine?.kill();
			quitting = true;
			app.quit();
		}
	});
	await app.whenReady();
	await start(runtime);
}
bootstrap().catch((error) => {
	dialog.showErrorBox('DSI Admin 无法启动', error.message);
	engine?.kill();
	quitting = true;
	app.quit();
});
