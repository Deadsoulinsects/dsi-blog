import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeMediaPath } from './media.mjs';

const inside = (root, file) => {
	const relative = path.relative(root, file);
	return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

async function exactFile(root, relative) {
	const parts = relative.split('/').filter(Boolean);
	let current = root;
	for (const part of parts) {
		const entries = await fs.readdir(current, { withFileTypes: true });
		const aliases = entries.filter((entry) => entry.name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase());
		if (aliases.length > 1) throw new Error(`附件名称存在大小写或 Unicode 冲突：${relative}`);
		if (!aliases.length) return null;
		if (aliases[0].name !== part) throw new Error(`附件引用大小写或 Unicode 不一致：${relative}`);
		current = path.join(current, part);
		const stat = await fs.lstat(current);
		if (stat.isSymbolicLink()) throw new Error(`附件不允许符号链接：${relative}`);
		if (!inside(root, await fs.realpath(current))) throw new Error(`附件路径越界：${relative}`);
	}
	return (await fs.stat(current)).isFile() ? current : null;
}

async function pictureFiles(root) {
	let entries;
	try { entries = await fs.readdir(root, { withFileTypes: true }); }
	catch (error) {
		if (error.code === 'ENOENT') return [];
		throw error;
	}
	const files = [];
	for (const entry of entries) {
		if (entry.isSymbolicLink()) throw new Error(`picture 中不允许符号链接：${entry.name}`);
		const file = path.join(root, entry.name);
		if (entry.isDirectory()) files.push(...await pictureFiles(file));
		else if (entry.isFile()) files.push(file);
	}
	return files;
}

/** One authorized adapter for planning, preparation and the original-image preview. */
export async function createSourceResolver({ note, sourceRoot }) {
	const noteStat = await fs.lstat(note);
	const rootStat = await fs.lstat(sourceRoot);
	if (!noteStat.isFile() || noteStat.isSymbolicLink() || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
		throw new Error('请选择普通 Markdown 文件与来源目录，不允许符号链接。');
	}
	const root = await fs.realpath(sourceRoot);
	const parent = await fs.realpath(path.dirname(note));
	if (!inside(root, await fs.realpath(note))) throw new Error('笔记不在已授权来源目录内。');
	let pictures;
	return async (identity) => {
		const normalized = normalizeMediaPath(identity);
		if (!normalized.path || normalized.diagnostic) throw new Error(normalized.diagnostic || '附件引用无效。');
		const reference = normalized.path;
		const local = await exactFile(parent, reference);
		if (local) return local;
		if (parent !== root) {
			const rooted = await exactFile(root, reference);
			if (rooted) return rooted;
		}
		const pictureRoot = path.join(parent, 'picture');
		const pictureStat = await fs.lstat(pictureRoot).catch((error) => {
			if (error.code === 'ENOENT') return null;
			throw error;
		});
		if (!pictureStat) throw new Error(`找不到附件：${reference}`);
		if (!pictureStat.isDirectory() || pictureStat.isSymbolicLink()) throw new Error('同级 picture 必须是普通目录。');
		const nested = await exactFile(pictureRoot, reference.replace(/^picture\//, ''));
		if (nested) return nested;
		pictures ??= await pictureFiles(pictureRoot);
		const name = path.posix.basename(reference);
		const matches = pictures.filter((file) => path.basename(file).normalize('NFC').toLowerCase() === name.normalize('NFC').toLowerCase());
		if (matches.length > 1) throw new Error(`附件存在多个候选，请修正引用：${reference}`);
		if (!matches.length) throw new Error(`找不到附件：${reference}`);
		if (path.basename(matches[0]) !== name) throw new Error(`附件引用大小写或 Unicode 不一致：${reference}`);
		return matches[0];
	};
}
