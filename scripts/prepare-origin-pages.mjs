import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

const root = process.cwd();
const originPagesDirectory = join(root, 'src', 'pages', 'origin', '详情文章');

const hasFrontmatter = (content) => /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(content);

const escapeYamlString = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const createFrontmatter = (fileName) => {
	const title = basename(fileName, extname(fileName));

	return [
		'---',
		'layout: ../../../layouts/OriginDetailLayout.astro',
		`title: "${escapeYamlString(title)}"`,
		'description: "起源详情文章"',
		'---',
	].join('\n');
};

console.log(`Origin detail pages directory: ${originPagesDirectory}`);

if (!existsSync(originPagesDirectory)) {
	console.warn(`Warning: origin detail pages directory does not exist: ${originPagesDirectory}`);
	process.exit(0);
}

const directoryStats = statSync(originPagesDirectory);
if (!directoryStats.isDirectory()) {
	console.warn(`Warning: origin detail pages path is not a directory: ${originPagesDirectory}`);
	process.exit(0);
}

const markdownEntries = readdirSync(originPagesDirectory, { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
	.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

if (markdownEntries.length === 0) {
	console.warn(`Warning: no origin detail markdown files found in: ${originPagesDirectory}`);
	process.exit(0);
}

console.log('Scanned origin detail markdown files:');
for (const entry of markdownEntries) {
	console.log(`- ${entry.name}`);
}

for (const entry of markdownEntries) {
	const file = join(originPagesDirectory, entry.name);
	const original = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

	if (hasFrontmatter(original)) {
		console.log(`Skipped existing frontmatter: ${relative(root, file)}`);
		continue;
	}

	const frontmatter = createFrontmatter(entry.name);
	const nextContent = original.length > 0 ? `${frontmatter}\n\n${original}` : frontmatter;

	writeFileSync(file, nextContent, 'utf8');
	console.log(`Added frontmatter: ${relative(root, file)}`);
}
