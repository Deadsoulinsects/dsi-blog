import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build, Platform, Arch } from 'electron-builder';
import { repositoryRoot } from './runtime.mjs';
import { command } from '../scripts/admin/workspace-io.mjs';

const require = createRequire(import.meta.url);
const outputRoot = path.resolve(process.env.DSI_ADMIN_OUTPUT || 'D:/ai-output/DSI Admin安装包');
const resourcesRoot = path.join(outputRoot, '构建资源');
const uiRoot = path.join(resourcesRoot, 'ui');
const toolsRoot = path.join(resourcesRoot, 'tools');
const unpackedRoot = path.join(outputRoot, 'win-unpacked');
const ffmpegRoot = process.env.DSI_FFMPEG_ROOT || 'D:/script/DSI-media-tools/ffmpeg-9.0.2-essentials_build';
const directoryOnly = process.argv.includes('--directory-only');
const installerOnly = process.argv.includes('--installer-only');
await fs.mkdir(resourcesRoot, { recursive: true });
if (await fs.stat(path.join(unpackedRoot, 'data')).catch((error) => {
	if (error.code === 'ENOENT') return null;
	throw error;
})) throw new Error('构建目录含有程序运行数据，不能清空或打入安装包。请设置 DSI_ADMIN_OUTPUT 为新的构建目录。');
await fs.mkdir(toolsRoot, { recursive: true });
for (const name of ['ffmpeg', 'ffprobe']) {
	const file = path.join(ffmpegRoot, 'bin', `${name}.exe`);
	const version = await command(file, ['-version']);
	await fs.copyFile(file, path.join(toolsRoot, `${name}.exe`));
	await fs.writeFile(path.join(toolsRoot, `${name}-版本.txt`), version.stdout);
}
await fs.copyFile(path.join(ffmpegRoot, 'LICENSE'), path.join(toolsRoot, 'FFmpeg-LICENSE.txt'));
console.log('TOOLS_READY');
await command(process.execPath, [path.join(repositoryRoot, 'node_modules/astro/bin/astro.mjs'), 'build'], {
	cwd: repositoryRoot, timeout: 180000, onOutput: (text) => process.stdout.write(text),
});
await fs.rm(uiRoot, { recursive: true, force: true });
await fs.mkdir(uiRoot, { recursive: true });
for (const directory of ['admin', '_astro']) {
	await fs.cp(path.join(repositoryRoot, 'dist', directory), path.join(uiRoot, directory), { recursive: true });
}
for (const file of ['favicon.svg', 'favicon.ico']) {
	await fs.copyFile(path.join(repositoryRoot, 'public', file), path.join(uiRoot, file));
}
const gitRoot = path.join(path.dirname(require.resolve('dugite/package.json')), 'git');
const electronVersion = require('electron/package.json').version;
process.env.ELECTRON_BUILDER_CACHE ||= path.join(outputRoot, '构建缓存');
const configuration = {
	appId: 'cn.deadsoulinsects.admin',
	productName: 'DSI Admin',
	asar: false,
	npmRebuild: false,
	electronVersion,
	electronDist: path.join(repositoryRoot, 'node_modules/electron/dist'),
	directories: { output: outputRoot },
	files: ['desktop/{main.cjs,preload.cjs,engine.mjs,runtime.mjs,README.md,CHANGELOG.md,产品介绍.md,验收记录.md}', 'scripts/admin/**/*.mjs', 'scripts/media/**/*.mjs', 'src/shared/**/*', 'package.json'],
	extraMetadata: { name: 'dsi-admin', version: '0.1.3', main: 'desktop/main.cjs', description: 'Dead Soul Insects 桌面文章管理程序', author: 'Dead Soul Insects' },
	extraResources: [
		{ from: uiRoot, to: 'app/desktop/ui' },
		{ from: toolsRoot, to: 'app/desktop/tools' },
		{ from: gitRoot, to: 'app/node_modules/dugite/git' },
	],
	win: { signAndEditExecutable: false, requestedExecutionLevel: 'asInvoker' },
	nsis: {
		oneClick: false,
		perMachine: false,
		allowElevation: false,
		allowToChangeInstallationDirectory: true,
		deleteAppDataOnUninstall: false,
		artifactName: 'DSI Admin-安装-${version}.${ext}',
	},
};
if (!installerOnly) await build({
	projectDir: repositoryRoot, targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64),
	config: structuredClone(configuration),
});
console.log(`UNPACKED_READY ${unpackedRoot}`);
// Astro check runs inside the installed app. Declarations are runtime inputs here,
// not development leftovers: electron-builder otherwise removes every .d.ts.
const packedModules = path.join(unpackedRoot, 'resources/app/node_modules');
let declarations = 0;
async function restoreDeclarations(source, destination) {
	for (const entry of await fs.readdir(source, { withFileTypes: true })) {
		if (entry.isSymbolicLink() || ['node_modules', '.git'].includes(entry.name)) continue;
		const from = path.join(source, entry.name);
		const to = path.join(destination, entry.name);
		if (entry.isDirectory()) await restoreDeclarations(from, to);
		else if (/\.d\.(?:ts|mts|cts)$/.test(entry.name)) {
			await fs.mkdir(path.dirname(to), { recursive: true });
			await fs.copyFile(from, to);
			declarations += 1;
		}
	}
}
for (const entry of await fs.readdir(packedModules, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const names = entry.name.startsWith('@')
		? (await fs.readdir(path.join(packedModules, entry.name))).map((name) => `${entry.name}/${name}`)
		: [entry.name];
	for (const name of names) {
		await restoreDeclarations(path.join(repositoryRoot, 'node_modules', name), path.join(packedModules, name));
	}
}
await fs.access(path.join(packedModules, 'astro/templates/content/types.d.ts'));
await fs.access(path.join(packedModules, 'typescript/lib/lib.es2022.d.ts'));
// installer-only also refreshes the compiled UI and version documentation.
await fs.cp(uiRoot, path.join(unpackedRoot, 'resources/app/desktop/ui'), { recursive: true });
for (const file of ['README.md', 'CHANGELOG.md', '产品介绍.md', '验收记录.md']) {
	await fs.copyFile(path.join(repositoryRoot, 'desktop', file), path.join(unpackedRoot, 'resources/app/desktop', file));
}
console.log(`RUNTIME_TYPES_READY ${declarations}`);
if (!directoryOnly) {
	const owned = await fs.readdir(unpackedRoot, { withFileTypes: true });
	const removal = [];
	for (const entry of owned) {
		if (entry.name === 'data') throw new Error('打包期间出现运行数据，停止生成安装包。');
		if (!/^[\w .-]+$/.test(entry.name)) throw new Error(`不能生成卸载清单：${entry.name}`);
		removal.push(`${entry.isDirectory() ? 'RMDir /r' : 'Delete /REBOOTOK'} "$INSTDIR\\${entry.name}"`);
	}
	const include = path.join(resourcesRoot, '数据保留.nsh');
	await fs.writeFile(include, '\uFEFF' + `
!define MUI_DIRECTORYPAGE_TEXT_TOP "请选择当前用户可写的独立程序目录，例如 D:\\Apps\\DSI Admin。配置、草稿与缓存保存在该目录的 data 中。不要安装到博客 Git 仓库或 Obsidian 笔记库内部，否则程序会拒绝连接这些目录。覆盖升级将保留 data。"
!macro customRemoveFiles
  SetOutPath $TEMP
  \${IfNot} \${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "是否同时删除安装目录 data 中的配置、草稿、缓存和日志？选择否将保留全部数据。" /SD IDNO IDNO dsi_keep_data
    RMDir /r "$INSTDIR\\data"
    dsi_keep_data:
  \${EndIf}
  ${removal.join('\n  ')}
  Delete /REBOOTOK "$INSTDIR\\Uninstall DSI Admin.exe"
  RMDir "$INSTDIR"
!macroend
`);
	await build({
		projectDir: repositoryRoot, prepackaged: unpackedRoot,
		targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
		config: { ...structuredClone(configuration), nsis: { ...configuration.nsis, include } },
	});
	for (const file of ['README.md', 'CHANGELOG.md', '产品介绍.md', '验收记录.md']) {
		await fs.copyFile(path.join(repositoryRoot, 'desktop', file), path.join(outputRoot, file));
	}
	console.log(`INSTALLER_READY ${outputRoot}`);
}
