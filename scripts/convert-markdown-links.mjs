import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createContentIndex, normalizeMarkdownLinks } from '../src/shared/content/links.mjs';

const root = process.cwd();
const contentRoot = join(root, 'src', 'content');
const targets = [
	{ collection: 'blog', directory: join(contentRoot, 'blog') },
	{ collection: 'docs', directory: join(contentRoot, 'docs') },
];

const mode = process.argv.includes('--apply') ? 'apply' : 'check';

const toPosixPath = (path) => path.split(sep).join('/');

const collectMarkdownFiles = (directory) => {
	if (!existsSync(directory)) {
		return [];
	}

	const files = [];
	const entries = readdirSync(directory, { withFileTypes: true });

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

const contentFiles = targets.flatMap(({ collection, directory }) =>
	collectMarkdownFiles(directory).map((file) => ({
		collection,
		path: toPosixPath(relative(root, file)),
	})));
const contentIndex = createContentIndex(contentFiles);

const changes = [];
const unresolvedLinks = [];

for (const entry of contentFiles) {
	const file = join(root, entry.path);
	const stats = statSync(file);
	if (!stats.isFile()) {
		continue;
	}

	const original = readFileSync(file, 'utf8');
	const result = normalizeMarkdownLinks(original, entry.path, contentIndex);
	const next = result.content;
	changes.push(...result.changes.map(({ href, target }) => `${entry.path}: ${href} -> ${target}`));
	unresolvedLinks.push(...result.unresolvedLinks.map((href) => `${entry.path}: unresolved local Markdown link: ${href}`));

	if (next !== original && mode === 'apply') {
		writeFileSync(file, next, 'utf8');
	}
}

if (changes.length === 0 && unresolvedLinks.length === 0) {
	console.log('Markdown links are already normalized.');
	process.exit(0);
}

for (const change of changes) {
	console.log(change);
}

if (unresolvedLinks.length > 0) {
	console.error('Unresolved local Markdown links:');
	for (const link of unresolvedLinks) {
		console.error(`- ${link}`);
	}
}

if (mode === 'check') {
	if (changes.length > 0) {
		console.error('Markdown links need conversion. Run npm run links:apply.');
	}

	if (unresolvedLinks.length > 0) {
		console.error('Some local Markdown links do not match content files. Add the target files or update the links.');
	}

	process.exit(1);
}

if (unresolvedLinks.length > 0) {
	console.error('Some local Markdown links do not match content files. Add the target files or update the links.');
	process.exit(1);
}

console.log(`Converted ${changes.length} markdown link(s).`);
