import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatLocalDate, hasFrontmatter, isValidCompletionDate, normalizeFrontmatter, splitMarkdownSource } from '../src/shared/content/frontmatter.mjs';
import { parse } from 'yaml';

const root = process.cwd();
const isDryRun = process.argv.includes('--dry-run');

const today = formatLocalDate(new Date());

const targets = [
	{
		directory: join(root, 'src', 'content', 'blog'),
		collection: 'blog',
	},
	{
		directory: join(root, 'src', 'content', 'docs'),
		collection: 'docs',
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

for (const target of targets) {
	ensureDirectory(target.directory);

	for (const file of collectMarkdownFiles(target.directory)) {
		const stats = statSync(file);
		if (!stats.isFile()) {
			continue;
		}

		const original = readFileSync(file, 'utf8');
		const normalized = removeBom(original);
		const nextContent = normalizeFrontmatter(normalized, {
			fileName: file,
			pubDate: today,
			collection: target.collection,
		});
		if (target.collection === 'blog' && !isValidCompletionDate(parse(splitMarkdownSource(nextContent).frontmatter)?.completion_date)) {
			throw new TypeError(`${relative(root, file)}: completion_date 必须是 YYYY-MM-DD 的有效完成日期。`);
		}

		if (hasFrontmatter(normalized)) {
			if (nextContent !== normalized) {
				if (isDryRun) {
					console.log(`[dry-run] Would update frontmatter fields: ${relative(root, file)}`);
					continue;
				}

				writeFileSync(file, nextContent, 'utf8');
				console.log(`Updated frontmatter fields: ${relative(root, file)}`);
			}

			continue;
		}

		if (isDryRun) {
			console.log(`[dry-run] Would add frontmatter: ${relative(root, file)}`);
			continue;
		}

		writeFileSync(file, nextContent, 'utf8');
		console.log(`Added frontmatter: ${relative(root, file)}`);
	}
}
