const { app, dialog, shell } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const applicationRoot = process.env.DSI_TEST_APP;
const dataRoot = process.env.DSI_ADMIN_DATA_ROOT;
const reportRoot = process.env.DSI_TEST_REPORT;
assert(applicationRoot && dataRoot && reportRoot);
let source;
let window;
let passed = false;
let closedWithTask = false;
let opened;
let pickerOptions;
let cancelPicker = false;
const deadline = setTimeout(() => {
	console.error('DESKTOP_FAIL 原生宿主验收超时');
	app.exit(1);
}, 180000);
dialog.showErrorBox = (title, message) => {
	console.error(`DESKTOP_FAIL ${title}: ${message}`);
	app.exit(1);
};
dialog.showMessageBox = async (...args) => {
	const options = args.at(-1);
	assert.equal(options.buttons.length, args.length === 2 ? 3 : 2);
	closedWithTask = true;
	return { response: 1 };
};
dialog.showOpenDialog = async (_parent, options) => {
	pickerOptions = options;
	return {
		canceled: cancelPicker,
		filePaths: cancelPicker ? [] : [options.properties.includes('openDirectory') ? path.dirname(source) : source],
	};
};
shell.openExternal = async (url) => { opened = url; };
app.on('browser-window-created', (_event, created) => {
	window = created;
	window.webContents.once('did-finish-load', () => {
		void inspect().catch((error) => {
			console.error(`DESKTOP_FAIL ${error.stack}`);
			app.exit(1);
		});
	});
});
app.on('will-quit', () => {
	if (!passed) { console.error('DESKTOP_FAIL 未完成界面断言即退出'); process.exitCode = 1; }
	clearTimeout(deadline);
});

async function uiState(condition, action = '') {
	await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
		const observer=new MutationObserver(check);
		const timer=setTimeout(()=>{observer.disconnect();window.removeEventListener('resize',check);reject(new Error('绑定界面状态超时'));},10000);
		function check(){if(${condition}){observer.disconnect();window.removeEventListener('resize',check);clearTimeout(timer);resolve();}}
		observer.observe(document.body,{subtree:true,childList:true,attributes:true});
		window.addEventListener('resize',check);
		${action}
		check();
	})`);
}

async function bindingUi(state) {
	const open = async (name) => {
		const article = state.articles.find((entry) => entry.targetFileName === name);
		assert(article);
		await uiState(`document.querySelector('#workspace-title').value===${JSON.stringify(article.title)} && !document.querySelector('[data-workspace-bind-source]').disabled`, `{
			const search=document.querySelector('[data-workspace-search]');
			search.value=${JSON.stringify(article.title)};search.dispatchEvent(new Event('input'));
			document.querySelector('[data-workspace-articles] .workspace-article-open').click();
		}`);
		await uiState(`document.querySelector('[data-workspace-bind-dialog]').open && !document.querySelector('[data-workspace-pick-binding]').disabled`,
			`document.querySelector('[data-workspace-bind-source]').click();`);
		return article;
	};
	const close = () => window.webContents.executeJavaScript(`document.querySelector('[data-workspace-bind-dialog] [data-workspace-close-dialog]').click()`);
	const unique = await open('唯一.md');
	const candidate = path.join(state.configuration.sourceRoot, '专题/唯一.MARKDOWN');
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-binding-path]').value`), candidate);
	assert.equal((await window.webContents.executeJavaScript(`fetch('/__admin-workspace/article?id=${unique.id}').then(r=>r.json())`)).article.sourcePath, null);
	await uiState(`!document.querySelector('[data-workspace-bind-dialog]').open`, `document.querySelector('[data-workspace-binding-form]').requestSubmit();`);
	assert.equal((await window.webContents.executeJavaScript(`fetch('/__admin-workspace/article?id=${unique.id}').then(r=>r.json())`)).article.sourcePath, candidate);
	await uiState(`!document.querySelector('[data-workspace-bind-source]').disabled`);
	await open('多个.md');
	const options = await window.webContents.executeJavaScript(`Array.from(document.querySelector('[data-workspace-binding-candidates]').options,option=>({value:option.value,text:option.textContent}))`);
	assert.deepEqual(options.map((option) => option.value), ['', path.join(state.configuration.sourceRoot, '分类甲/多个.md'), path.join(state.configuration.sourceRoot, '分类乙/多个.markdown')].sort());
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-binding-path]').value`), '');
	await window.webContents.executeJavaScript(`{
		const select=document.querySelector('[data-workspace-binding-candidates]');
		select.value=${JSON.stringify(path.join(state.configuration.sourceRoot, '分类乙/多个.markdown'))};
		select.dispatchEvent(new Event('change'));
	}`);
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-binding-path]').value`), path.join(state.configuration.sourceRoot, '分类乙/多个.markdown'));
	window.webContents.debugger.attach('1.3');
	for (const width of [1280, 900, 375]) {
		await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
		await uiState(`innerWidth===${width}`);
		const geometry = await window.webContents.executeJavaScript(`(()=>{
			const dialog=document.querySelector('[data-workspace-bind-dialog]');const select=document.querySelector('[data-workspace-binding-candidates]');
			const box=dialog.getBoundingClientRect(),field=select.getBoundingClientRect();
			return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogWidth:dialog.clientWidth,dialogScrollWidth:dialog.scrollWidth,left:box.left,right:box.right,fieldLeft:field.left,fieldRight:field.right};
		})()`);
		assert(geometry.scrollWidth <= width + 1 && geometry.dialogScrollWidth <= geometry.dialogWidth + 1);
		assert(geometry.left >= 0 && geometry.right <= width && geometry.fieldLeft >= geometry.left && geometry.fieldRight <= geometry.right);
		const shot = await window.webContents.debugger.sendCommand('Page.captureScreenshot');
		await fs.writeFile(path.join(reportRoot, `绑定候选-${width}.png`), Buffer.from(shot.data, 'base64'));
	}
	await window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
	window.webContents.debugger.detach();
	await close();
	const absent = await open('无匹配.md');
	assert(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-binding-candidates-field]').hidden`));
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-binding-path]').value`), '');
	await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-pick-binding]').click()`);
	await uiState(`document.querySelector('[data-workspace-binding-path]').value===${JSON.stringify(source)} && !document.querySelector('[data-workspace-pick-binding]').disabled`);
	assert.equal(pickerOptions.defaultPath, state.configuration.sourceRoot);
	assert.equal((await window.webContents.executeJavaScript(`fetch('/__admin-workspace/article?id=${absent.id}').then(r=>r.json())`)).article.sourcePath, null);
	await close();
	await open('已绑定.md');
	await close();
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-range-value]').textContent`), '2026-07-01 — 2026-07-10');
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-preview-range]').hidden`), false);
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-preview-range-label]').textContent`), '起止时间');
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-preview-start]').textContent`), '2026-07-01');
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-preview-end]').textContent`), '2026-07-10');
	await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-range-value]').scrollIntoView({block:'center'})`);
	await fs.writeFile(path.join(reportRoot, '起止时间-编辑面板.png'), (await window.webContents.capturePage()).toPNG());
	await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-preview-range]').scrollIntoView({block:'center'})`);
	await fs.writeFile(path.join(reportRoot, '起止时间-预览.png'), (await window.webContents.capturePage()).toPNG());
	await open('唯一.md');
	await close();
	assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-range-value]').textContent`), '源笔记未提供');
	assert(await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-preview-range]').hidden`));
	await window.webContents.executeJavaScript(`{
		const search=document.querySelector('[data-workspace-search]');search.value='';search.dispatchEvent(new Event('input'));
	}`);
}

async function inspect() {
	await fs.mkdir(reportRoot, { recursive: true });
	const state = await window.webContents.executeJavaScript(`fetch('/__admin-workspace/state').then(r=>r.json())`);
	assert(state.configured && state.articles.length);
	const bound = state.articles.find((article) => article.sourcePath);
	const unbound = state.articles.find((article) => !article.sourcePath);
	assert(bound && unbound, '原生宿主验收需要已绑定和未绑定文章');
	source = bound.sourcePath;
	const bridge = await window.webContents.executeJavaScript(`({
		keys:Object.keys(window.dsiDesktop), node:typeof require, process:typeof process,
		context:window.dsiDesktop ? true : false
	})`);
	assert.equal(bridge.node, 'undefined');
	assert.equal(bridge.process, 'undefined');
	assert(!bridge.keys.includes('readFile') && !bridge.keys.includes('getCredential'));
	assert.equal(await window.webContents.executeJavaScript('window.dsiDesktop.chooseDirectory()'), path.dirname(source));
	assert.equal(await window.webContents.executeJavaScript('window.dsiDesktop.chooseMarkdown()'), source);
	assert.equal(pickerOptions.defaultPath, state.configuration.sourceRoot);
	assert.deepEqual(pickerOptions.properties, ['openFile']);
	assert.deepEqual(pickerOptions.filters, [{ name: 'Markdown 文章', extensions: ['md', 'markdown'] }]);
	assert.equal(await window.webContents.executeJavaScript(`window.dsiDesktop.chooseMarkdown(${JSON.stringify(bound.id)})`), source);
	assert.equal(pickerOptions.defaultPath, path.dirname(source));
	assert.equal(await window.webContents.executeJavaScript(`window.dsiDesktop.chooseMarkdown(${JSON.stringify(unbound.id)})`), source);
	assert.equal(pickerOptions.defaultPath, state.configuration.sourceRoot);
	const access = fs.access;
	try {
		for (const code of ['ENOENT', 'ENOTDIR']) {
			fs.access = async (file, ...args) => {
				if (file === source) throw Object.assign(new Error('picker missing probe'), { code });
				return access(file, ...args);
			};
			assert.equal(await window.webContents.executeJavaScript(`window.dsiDesktop.chooseMarkdown(${JSON.stringify(bound.id)})`), source);
			assert.equal(pickerOptions.defaultPath, state.configuration.sourceRoot);
		}
		pickerOptions = undefined;
		fs.access = async (file, ...args) => {
			if (file === source) throw Object.assign(new Error('picker permission probe'), { code: 'EACCES' });
			return access(file, ...args);
		};
		assert(await window.webContents.executeJavaScript(`window.dsiDesktop.chooseMarkdown(${JSON.stringify(bound.id)}).then(()=>false,error=>error.message.includes('picker permission probe'))`));
		assert.equal(pickerOptions, undefined, '非缺失类文件错误不得被吞掉或继续打开选择器');
	} finally {
		fs.access = access;
	}
	assert(await window.webContents.executeJavaScript(`window.dsiDesktop.chooseMarkdown(null).then(()=>false,()=>true)`));
	assert(await window.webContents.executeJavaScript(`window.dsiDesktop.chooseMarkdown(${JSON.stringify(source)}).then(()=>false,()=>true)`));
	assert.equal(pickerOptions, undefined, 'renderer 路径不能代替可信文章标识');
	cancelPicker = true;
	try {
		assert.equal(await window.webContents.executeJavaScript(`window.dsiDesktop.chooseMarkdown(${JSON.stringify(bound.id)})`), null);
	} finally {
		cancelPicker = false;
	}
	const afterPicker = await window.webContents.executeJavaScript(`fetch('/__admin-workspace/state').then(r=>r.json())`);
	for (const article of [bound, unbound]) {
		assert.equal(afterPicker.articles.find((entry) => entry.id === article.id).sourcePath, article.sourcePath, '文件选择不能直接绑定源文件');
	}
	await window.webContents.executeJavaScript(`window.dsiDesktop.setCredential('fixture-desktop-token')`);
	const encrypted = await fs.readFile(path.join(dataRoot, 'config/github-credential.bin'));
	assert(!encrypted.includes(Buffer.from('fixture-desktop-token')));
	const { safeStorage } = require('electron');
	assert.equal(safeStorage.decryptString(encrypted), 'fixture-desktop-token');
	await window.webContents.executeJavaScript(`window.dsiDesktop.openSource(${JSON.stringify(state.articles.find((article) => article.sourcePath).id)})`);
	assert.equal(opened, `obsidian://open?path=${encodeURIComponent(source)}`);
	assert(await window.webContents.executeJavaScript(`window.dsiDesktop.openExternal('https://other.invalid/').then(()=>false,()=>true)`));
	window.webContents.debugger.attach('1.3');
	await window.webContents.executeJavaScript(`{
		const field=document.createElement('input'); field.type='file'; field.id='native-path-probe'; document.body.append(field);
	}`);
	const document = await window.webContents.debugger.sendCommand('DOM.getDocument');
	const node = await window.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#native-path-probe' });
	await window.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [source] });
	assert.equal(await window.webContents.executeJavaScript(`window.dsiDesktop.pathForFile(document.querySelector('#native-path-probe').files[0])`), source);
	await window.webContents.executeJavaScript(`document.querySelector('#native-path-probe').remove()`);
	window.webContents.debugger.detach();
	if (process.env.DSI_TEST_BINDING_UI === '1') await bindingUi(state);
	await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
		const ready=()=>document.querySelector('[data-workspace-articles] button');
		if(ready()){ready().click();resolve();return;}
		const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timer);ready().click();resolve();}});
		const timer=setTimeout(()=>{observer.disconnect();reject(new Error('文章列表未加载'));},10000);
		observer.observe(document.body,{subtree:true,childList:true,attributes:true});
	})`);
	await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
		const ready=()=>document.querySelector('#workspace-title:not(:disabled)');
		if(ready()){resolve();return;}
		const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timer);resolve();}});
		const timer=setTimeout(()=>{observer.disconnect();reject(new Error('编辑器未加载'));},10000);
		observer.observe(document.body,{subtree:true,childList:true,attributes:true});
	})`);
	const geometry = await window.webContents.executeJavaScript(`({
		width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
		flush:typeof window.dsiWorkspaceFlush, local:document.querySelector('#workspace-title').disabled
	})`);
	assert.equal(geometry.flush, 'function');
	assert.equal(geometry.local, false);
	assert(geometry.scrollWidth <= geometry.width + 1);
	await fs.writeFile(path.join(reportRoot, '原生桌面.png'), (await window.webContents.capturePage()).toPNG());
	await window.webContents.executeJavaScript(`{
		const field=document.querySelector('#workspace-title');
		field.value='桌面退出自动保存';field.dispatchEvent(new Event('input',{bubbles:true}));
	}`);
	const saved = new Promise((resolve, reject) => {
		const signal = AbortSignal.timeout(150000);
		signal.addEventListener('abort', () => reject(signal.reason), { once: true });
		app.once('before-quit', async (event) => {
			event.preventDefault();
			try {
				const stored = JSON.parse(await fs.readFile(path.join(dataRoot, 'config/workspace.json')));
				assert(stored.articles.some((article) => article.title === '桌面退出自动保存'));
				assert(closedWithTask);
				assert(JSON.parse(await fs.readFile(path.join(dataRoot, 'logs/engine-start.json'))).cleanExit);
				passed = true;
				await fs.writeFile(path.join(reportRoot, '原生验收.json'), JSON.stringify({ geometry, bridge, flush: true, taskCancellation: true, encryptedCredential: true, nativeFilePath: true, pickerDefaultDirectory: true }, null, 2));
				console.log('DESKTOP_PASS 原生沙箱、受限桥、DPAPI、真实 File 路径、退出 flush、任务取消与干净退出');
				resolve();
				app.quit();
			} catch (error) { reject(error); }
		});
	});
	if (process.env.DSI_TEST_CLOSE_MODE === 'renderer') {
		await window.webContents.executeJavaScript('window.dsiWorkspaceFlush()');
		await window.webContents.executeJavaScript('window.close()');
	} else {
		window.close();
	}
	await saved;
}
require(path.join(applicationRoot, 'desktop/main.cjs'));
