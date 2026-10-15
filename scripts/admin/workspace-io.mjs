import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { parseDocument, isMap } from 'yaml';
import { splitMarkdownSource, formatLocalDate, getFileTitle, stripArticleHeader, isValidPubDate, mergeBlogSource, normalizeCompletionDate, normalizeOptionalDate } from '../../src/shared/content/frontmatter.mjs';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const contains = (root, file) => {
	const offset = path.relative(root, file);
	return offset === '' || (!offset.startsWith(`..${path.sep}`) && offset !== '..' && !path.isAbsolute(offset));
};
export const unix = (file) => file.split(path.sep).join('/');
export const isPublishingCopy = (file) => file.split(/[\\/]/).includes('博客发布');

export async function optionalBytes(file) {
	try { return await fs.readFile(file); }
	catch (error) {
		if (error.code === 'ENOENT') return null;
		throw error;
	}
}

export async function atomicJson(file, value) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${randomUUID()}.tmp`;
	await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
	await fs.rename(temporary, file);
}

export function parseArticle(text, fileName) {
	const parts = splitMarkdownSource(text);
	if (!parts.closed) throw new Error('Markdown frontmatter 未关闭。');
	const document = parseDocument(parts.frontmatter || '');
	if (document.errors.length) throw new Error(`frontmatter 格式无效：${document.errors[0].message}`);
	if (document.contents && !isMap(document.contents)) throw new Error('frontmatter 必须是字段映射。');
	const fields = document.toJSON() || {};
	for (const field of ['title', 'description']) {
		if (fields[field] !== undefined && typeof fields[field] !== 'string') throw new Error(`${field} 必须是文本。`);
	}
	const topics = Array.isArray(fields.topicPath) ? fields.topicPath
		: typeof fields.topic === 'string' && fields.topic.trim() ? [fields.topic] : [];
	const date = Object.hasOwn(fields, 'completion_date') ? fields.completion_date
		: isValidPubDate(fields.pubDate) ? new Date(fields.pubDate).toISOString().slice(0, 10) : fields.pubDate;
	return {
		baseFrontmatter: parts.frontmatter || '',
		body: stripArticleHeader(parts.body),
		title: typeof fields.title === 'string' ? fields.title : getFileTitle(fileName),
		description: typeof fields.description === 'string' ? fields.description : '',
		completion_date: date instanceof Date ? formatLocalDate(date)
			: date === undefined || date === null ? '' : normalizeCompletionDate(date) ?? String(date),
		topic: topics[0] || '',
		topicPath: topics,
		topicFromSource: Object.hasOwn(fields, 'topic') || Object.hasOwn(fields, 'topicPath'),
		tags: fields.tags,
		start_date: normalizeOptionalDate(fields.start_date),
		end_date: normalizeOptionalDate(fields.end_date),
		mediaId: typeof fields.mediaId === 'string' ? fields.mediaId : '',
	};
}

export function articleMarkdown(article, body = article.body) {
	const document = parseDocument(article.baseFrontmatter || '');
	for (const field of ['title', 'description', 'completion_date', 'mediaId']) document.set(field, article[field]);
	document.delete('pubDate');
	for (const field of ['tags', 'start_date', 'end_date']) {
		if (article[field] === undefined) document.delete(field);
		else document.set(field, article[field]);
	}
	if (article.topicPath.length) {
		document.set('topic', article.topicPath[0]);
		document.set('topicPath', article.topicPath);
	} else {
		document.delete('topic');
		document.delete('topicPath');
	}
	return `---\n${document.toString()}---\n${body.replace(/^\n/, '')}`;
}

export function applySourceArticle(article, parsed) {
	const merged = mergeBlogSource(`---\n${parsed.baseFrontmatter}\n---\n${parsed.body}`,
		articleMarkdown(article), article.targetFileName);
	Object.assign(article, parseArticle(merged, article.targetFileName));
}

export function sourceMatchesArticle(article, fileName, title = '') {
	const key = (value) => value.replace(/\.(md|markdown)$/i, '').normalize('NFC').toLowerCase().replace(/\s+/g, '');
	const articleKeys = [article.targetFileName, article.title].filter(Boolean).map(key);
	return [fileName, title].filter(Boolean).some((value) => articleKeys.includes(key(value)));
}

export function command(executable, args, { cwd, env, signal, timeout = 120_000, allowFailure = false, onOutput } = {}) {
	return new Promise((resolve, reject) => {
		signal?.throwIfAborted();
		const child = spawn(executable, args, {
			cwd, env: { ...process.env, ...env }, shell: false, windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const stdout = [], stderr = [];
		let size = 0;
		let error;
		const terminate = () => {
			if (process.platform === 'win32') {
				const killer = spawn(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'),
					['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
				killer.once('error', () => child.kill());
			} else child.kill();
		};
		const abort = () => { error = signal.reason; terminate(); };
		signal?.addEventListener('abort', abort, { once: true });
		const timer = setTimeout(() => {
			error = new Error('处理命令超过限定时间。');
			terminate();
		}, timeout);
		const collect = (target) => (bytes) => {
			size += bytes.length;
			if (size > 16 * 1024 * 1024) {
				error = new Error('处理命令输出超过 16 MiB。');
				terminate();
			} else {
				target.push(bytes);
				onOutput?.(bytes.toString('utf8'));
			}
		};
		child.stdout.on('data', collect(stdout));
		child.stderr.on('data', collect(stderr));
		child.once('error', (failure) => { error = failure; });
		child.once('close', (code) => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', abort);
			const stdoutBytes = Buffer.concat(stdout);
			const result = { code, stdout: stdoutBytes.toString('utf8'), stdoutBytes, stderr: stripVTControlCharacters(Buffer.concat(stderr).toString('utf8')) };
			if (error) reject(error);
			else if (code && !allowFailure) reject(new Error(result.stderr.trim() || `处理命令退出码 ${code}。`));
			else resolve(result);
		});
	});
}

export async function markdownFiles(root, { excludePicture = false, excludePublishingCopies = false } = {}) {
	const files = [];
	if (excludePublishingCopies && isPublishingCopy(root)) return files;
	const walk = async (directory) => {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				if (entry.name.startsWith('.') || excludePicture && entry.name.toLowerCase() === 'picture'
					|| excludePublishingCopies && entry.name === '博客发布') continue;
				await walk(path.join(directory, entry.name));
			} else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) files.push(path.join(directory, entry.name));
		}
	};
	await walk(root);
	return files.sort();
}

export async function codeFingerprint(repoRoot) {
	const values = [];
	const walk = async (directory) => {
		for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const file = path.join(directory, entry.name);
			const relative = unix(path.relative(repoRoot, file));
			if (['src/content/blog', 'src/content/docs', 'src/data/media-manifest.json', 'src/data/topics.json'].includes(relative)) continue;
			if (entry.isSymbolicLink()) throw new Error(`工程代码不允许符号链接：${file}`);
			if (entry.isDirectory()) await walk(file);
			else values.push([unix(path.relative(repoRoot, file)), hash(await fs.readFile(file))]);
		}
	};
	for (const name of ['src', 'astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
		const file = path.join(repoRoot, name);
		const stat = await fs.stat(file).catch((error) => {
			if (error.code === 'ENOENT') return null;
			throw error;
		});
		if (stat?.isDirectory()) await walk(file);
		else if (stat) values.push([name, hash(await fs.readFile(file))]);
	}
	return hash(JSON.stringify(values));
}

export async function snapshotRepository(repoRoot, stageRoot, runtimeRoot) {
	await fs.mkdir(stageRoot, { recursive: true });
	const preserveManifest = Boolean(await optionalBytes(path.join(stageRoot, 'src/data/media-manifest.json')));
	const excluded = new Set(['.git', '.astro', '.omo', 'node_modules', 'dist', '.media-work', 'desktop']);
	await fs.cp(repoRoot, stageRoot, {
		recursive: true,
		filter: async (file) => {
			const relative = unix(path.relative(repoRoot, file));
			if (excluded.has(relative.split('/')[0])) return false;
			if (preserveManifest && relative === 'src/data/media-manifest.json') return false;
			const stat = await fs.lstat(file);
			if (stat.isSymbolicLink()) throw new Error(`工程暂存不接受符号链接：${relative}`);
			return true;
		},
	});
	const modules = path.join(stageRoot, 'node_modules');
	try { await fs.lstat(modules); }
	catch (error) {
		if (error.code !== 'ENOENT') throw error;
		await fs.symlink(path.join(runtimeRoot, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir');
	}
}
