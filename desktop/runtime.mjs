import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function ensureDataDirectory(dataRoot) {
	const marker = path.join(dataRoot, `.write-check-${process.pid}`);
	try {
		await fs.mkdir(dataRoot, { recursive: true });
		await fs.writeFile(marker, '', { flag: 'wx' });
		await fs.unlink(marker);
	} catch (error) {
		throw new Error(`程序数据目录不可写：${dataRoot}。请选择可写的安装目录，不需要常驻管理员权限。`, { cause: error });
	}
	for (const name of ['config', 'drafts', 'cache', 'staging', 'logs']) {
		await fs.mkdir(path.join(dataRoot, name), { recursive: true });
	}
	return fs.realpath(dataRoot);
}

export async function installedTools(runtimeRoot, executable) {
	const require = createRequire(path.join(runtimeRoot, 'package.json'));
	const dugiteRoot = path.dirname(require.resolve('dugite/package.json'));
	const git = path.join(dugiteRoot, 'git', 'mingw64', 'bin', 'git.exe');
	const toolRoot = path.join(runtimeRoot, 'desktop', 'tools');
	const ffmpeg = path.join(toolRoot, 'ffmpeg.exe');
	const ffprobe = path.join(toolRoot, 'ffprobe.exe');
	await Promise.all([git, ffmpeg, ffprobe].map((tool) => fs.access(tool)));
	return { node: executable, git, ffmpeg, ffprobe };
}
