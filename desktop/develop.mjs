import path from 'node:path';
import { command } from '../scripts/admin/workspace-io.mjs';
import { repositoryRoot } from './runtime.mjs';

await command(process.execPath, [path.join(repositoryRoot, 'desktop/build.mjs'), '--directory-only'], {
	cwd: repositoryRoot, timeout: 1800000, onOutput: (text) => process.stdout.write(text),
});
const output = path.resolve(process.env.DSI_ADMIN_OUTPUT || 'D:/ai-output/DSI Admin安装包');
await command(path.join(output, 'win-unpacked/DSI Admin.exe'), [], {
	cwd: output, timeout: 86400000, onOutput: (text) => process.stdout.write(text),
});
