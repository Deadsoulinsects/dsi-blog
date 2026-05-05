import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

const getToday = () => {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
};

const today = getToday();

const targets = [
	{
		directory: join(root, 'src', 'content', 'blog'),
		createFrontmatter: () => ['---', 'title: ""', 'description: ""', `pubDate: ${today}`, 'tags: []', '---', ''].join('\n'),
	},
	{
		directory: join(root, 'src', 'content', 'docs'),
		createFrontmatter: () => ['---', 'title: ""', 'description: ""', `pubDate: ${today}`, 'category: ""', 'tags: []', '---', ''].join('\n'),
	},
];

const ensureDirectory = (directory) => {
	if (!existsSync(directory)) {
		mkdirSync(directory, { recursive: true });
	}
};

const collectMarkdownFiles = (directory) => {
	const entries = readdirSync(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = join(directory, entry.name);

		if (entry.isDirectory()) {
			files.push(...collectMarkdownFiles(fullPath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith('.md')) {
			files.push(fullPath);
		}
	}

	return files;
};

const removeBom = (content) => content.replace(/^\uFEFF/, '');

const hasFrontmatter = (content) => content.startsWith('---\n') || content.startsWith('---\r\n');

for (const target of targets) {
	ensureDirectory(target.directory);

	for (const file of collectMarkdownFiles(target.directory)) {
		const stats = statSync(file);
		if (!stats.isFile()) {
			continue;
		}

		const original = readFileSync(file, 'utf8');
		const normalized = removeBom(original);

		if (hasFrontmatter(normalized)) {
			continue;
		}

		const frontmatter = target.createFrontmatter();
		const nextContent = normalized.length > 0 ? `${frontmatter}\n${normalized}` : frontmatter;

		writeFileSync(file, nextContent, 'utf8');
		console.log(`Added frontmatter: ${relative(root, file)}`);
	}
}
