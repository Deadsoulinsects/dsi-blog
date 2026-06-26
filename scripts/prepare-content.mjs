import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

const root = process.cwd();
const isDryRun = process.argv.includes('--dry-run');

const getToday = () => {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
};

const today = getToday();

const getTitleFromFile = (file) => basename(file, extname(file));

const escapeYamlString = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const targets = [
	{
		directory: join(root, 'src', 'content', 'blog'),
		ensureFrontmatterFields: ['topic: ""'],
		createFrontmatter: (file) => [
			'---',
			`title: "${escapeYamlString(getTitleFromFile(file))}"`,
			'description: ""',
			`pubDate: ${today}`,
			'tags: []',
			'topic: ""',
			'---',
			'',
		].join('\n'),
	},
	{
		directory: join(root, 'src', 'content', 'docs'),
		createFrontmatter: (file) => [
			'---',
			`title: "${escapeYamlString(getTitleFromFile(file))}"`,
			'description: ""',
			`pubDate: ${today}`,
			'category: "未分类"',
			'tags: []',
			'---',
			'',
		].join('\n'),
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

const ensureFrontmatterFields = (content, fields) => {
	if (fields.length === 0 || !hasFrontmatter(content)) {
		return content;
	}

	const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
	const closeMarker = `${lineEnding}---`;
	const closeIndex = content.indexOf(closeMarker, 3);

	if (closeIndex === -1) {
		return content;
	}

	const frontmatter = content.slice(0, closeIndex);
	const missingFields = fields.filter((field) => {
		const key = field.split(':', 1)[0];
		return !new RegExp(`^${key}:`, 'm').test(frontmatter);
	});

	if (missingFields.length === 0) {
		return content;
	}

	return `${frontmatter}${lineEnding}${missingFields.join(lineEnding)}${content.slice(closeIndex)}`;
};

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
			const nextContent = ensureFrontmatterFields(normalized, target.ensureFrontmatterFields ?? []);

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

		const frontmatter = target.createFrontmatter(file);
		const nextContent = normalized.length > 0 ? `${frontmatter}\n${normalized}` : frontmatter;

		if (isDryRun) {
			console.log(`[dry-run] Would add frontmatter: ${relative(root, file)}`);
			continue;
		}

		writeFileSync(file, nextContent, 'utf8');
		console.log(`Added frontmatter: ${relative(root, file)}`);
	}
}
