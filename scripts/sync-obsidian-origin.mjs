import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceDirectory = 'D:\\GitHub\\cloud-storage\\obsidian\\AI项目\\创建Dead Soul Insects博客\\起源';
const destinationDirectory = join(root, 'src', 'pages', 'origin', '详情文章');
const isDryRun = process.argv.includes('--dry-run');

// Origin detail pages keep site-managed frontmatter; Obsidian only provides the body.
const splitFrontmatter = (content) => {
	const normalized = content.replace(/^\uFEFF/, '');
	const match = normalized.match(/^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n)?([\s\S]*)$/);

	if (!match) {
		return { frontmatter: null, body: normalized };
	}

	return { frontmatter: match[1], body: match[2] };
};

console.log(`Obsidian origin source: ${sourceDirectory}`);

if (!existsSync(sourceDirectory)) {
	console.warn(`Warning: Obsidian origin source does not exist: ${sourceDirectory}`);
	process.exit(0);
}

const sourceStats = statSync(sourceDirectory);
if (!sourceStats.isDirectory()) {
	console.warn(`Warning: Obsidian origin source is not a directory: ${sourceDirectory}`);
	process.exit(0);
}

const markdownEntries = readdirSync(sourceDirectory, { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
	.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

if (markdownEntries.length === 0) {
	console.warn(`Warning: no markdown files found in Obsidian origin source: ${sourceDirectory}`);
	process.exit(0);
}

console.log('Scanned Obsidian origin markdown files:');
for (const entry of markdownEntries) {
	console.log(`- ${entry.name}`);
}

mkdirSync(destinationDirectory, { recursive: true });

for (const entry of markdownEntries) {
	const sourceFile = join(sourceDirectory, entry.name);
	const destinationFile = join(destinationDirectory, entry.name);
	const sourceContent = readFileSync(sourceFile, 'utf8');
	const sourceParts = splitFrontmatter(sourceContent);
	const sourceBody = sourceParts.body.replace(/^(?:\r?\n)+/, '');

	let nextContent = sourceBody;
	let action = '';

	if (existsSync(destinationFile)) {
		const destinationContent = readFileSync(destinationFile, 'utf8');
		const destinationParts = splitFrontmatter(destinationContent);

		if (destinationParts.frontmatter) {
			nextContent = `${destinationParts.frontmatter}\n\n${sourceBody}`;
			action = 'kept target frontmatter';
		} else {
			action = 'target has no frontmatter; waiting for prepare:origin';
		}
	} else {
		action = 'created new target without frontmatter; waiting for prepare:origin';
	}

	if (!isDryRun) {
		writeFileSync(destinationFile, nextContent, 'utf8');
	}

	console.log(`${isDryRun ? '[dry-run] Would sync' : 'Synced'}: ${relative(root, destinationFile)}`);
	console.log(`  - ${action}`);

	if (sourceParts.frontmatter) {
		console.log('  - ignored source frontmatter');
	}
}
