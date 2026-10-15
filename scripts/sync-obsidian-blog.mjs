import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { mergeBlogSource } from '../src/shared/content/frontmatter.mjs';

const root = process.cwd();
const isDryRun = process.argv.includes('--dry-run');
const fileOption = process.argv.indexOf('--file');
const explicitFile = fileOption < 0 ? null : process.argv[fileOption + 1];
if (fileOption >= 0 && (!explicitFile || explicitFile.startsWith('--') || !/\.md$/i.test(explicitFile))) {
	throw new TypeError('--file requires one existing Markdown file.');
}

if (!explicitFile) {
	console.log('已停用“博客发布”目录自动同步。请在 Admin 纳入或绑定原文；手动同步单篇可使用 --file <原文完整路径>。');
	process.exit(0);
}

if (!existsSync(explicitFile) || !statSync(explicitFile).isFile())
	throw new TypeError(`Markdown source does not exist: ${explicitFile}`);

const destination = join(root, 'src', 'content', 'blog');
const destinationFile = join(destination, basename(explicitFile));
const sourceContent = readFileSync(explicitFile, 'utf8');
const destinationContent = existsSync(destinationFile) ? readFileSync(destinationFile, 'utf8') : '';
const nextContent = mergeBlogSource(sourceContent, destinationContent, explicitFile);
if (!isDryRun) {
	mkdirSync(destination, { recursive: true });
	if (nextContent !== destinationContent) writeFileSync(destinationFile, nextContent, 'utf8');
}
console.log(isDryRun ? 'Obsidian blog markdown files that would be synced:' : 'Synced Obsidian blog markdown files:');
console.log(`- ${relative(root, destinationFile)}`);
