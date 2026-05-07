import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

const sources = [
	'D:\\GitHub\\cloud-storage\\obsidian\\AI项目\\博客发布',
	'D:\\GitHub\\cloud-storage\\obsidian\\improving\\博客发布',
	'D:\\GitHub\\cloud-storage\\obsidian\\问题\\博客发布',
];

const destination = join(root, 'src', 'content', 'blog');
const copiedFiles = [];
const seenFiles = new Map();

const splitFrontmatter = (content) => {
	const normalized = content.replace(/^\uFEFF/, '');
	const match = normalized.match(/^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n)?([\s\S]*)$/);

	if (!match) {
		return { frontmatter: null, body: normalized };
	}

	return { frontmatter: match[1], body: match[2] };
};

const syncMarkdownFile = (sourceFile, destinationFile) => {
	const sourceContent = readFileSync(sourceFile, 'utf8');
	const sourceParts = splitFrontmatter(sourceContent);

	if (!existsSync(destinationFile)) {
		writeFileSync(destinationFile, sourceContent, 'utf8');
		return;
	}

	const destinationContent = readFileSync(destinationFile, 'utf8');
	const destinationParts = splitFrontmatter(destinationContent);

	if (!destinationParts.frontmatter) {
		writeFileSync(destinationFile, sourceContent, 'utf8');
		return;
	}

	writeFileSync(destinationFile, `${destinationParts.frontmatter}\n\n${sourceParts.body.replace(/^(?:\r?\n)+/, '')}`, 'utf8');
};

mkdirSync(destination, { recursive: true });

for (const source of sources) {
	if (!existsSync(source)) {
		console.warn(`Warning: Obsidian blog source does not exist: ${source}`);
		continue;
	}

	const sourceStats = statSync(source);
	if (!sourceStats.isDirectory()) {
		console.warn(`Warning: Obsidian blog source is not a directory: ${source}`);
		continue;
	}

	const entries = readdirSync(source, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.md')) {
			continue;
		}

		const sourceFile = join(source, entry.name);
		const destinationFile = join(destination, entry.name);
		const previousSource = seenFiles.get(entry.name);

		if (previousSource) {
			console.warn(`Warning: duplicate markdown file "${entry.name}" from ${sourceFile} overwrites ${previousSource}`);
		}

		syncMarkdownFile(sourceFile, destinationFile);
		seenFiles.set(entry.name, sourceFile);
		copiedFiles.push(relative(root, destinationFile));
	}
}

if (copiedFiles.length === 0) {
	console.log('No Obsidian blog markdown files synced.');
	process.exit(0);
}

console.log('Synced Obsidian blog markdown files:');
for (const file of copiedFiles) {
	console.log(`- ${file}`);
}
