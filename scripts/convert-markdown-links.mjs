import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

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

// Match Astro content route IDs: remove dots, collapse spaces, and keep Chinese names intact.
const toRouteSlug = (file) => {
	const name = basename(file, extname(file));

	return name.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '-');
};

const stripWrappingAngles = (value) => {
	if (value.startsWith('<') && value.endsWith('>')) {
		return value.slice(1, -1);
	}

	return value;
};

const splitTarget = (target) => {
	const match = target.match(/^(\S+)(\s+.+)$/);

	if (!match) {
		return { href: target, suffix: '' };
	}

	return { href: match[1], suffix: match[2] };
};

const isIgnoredHref = (href) => /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href);

// Preserve heading anchors when rewriting relative Markdown links to public routes.
const splitHash = (href) => {
	const hashIndex = href.indexOf('#');

	if (hashIndex === -1) {
		return { pathname: href, hash: '' };
	}

	return {
		pathname: href.slice(0, hashIndex),
		hash: href.slice(hashIndex),
	};
};

const resolveMarkdownFile = (fromFile, pathname, byFilePath, bySlug) => {
	let decodedPathname = pathname;

	try {
		decodedPathname = decodeURIComponent(pathname);
	} catch {
		decodedPathname = pathname;
	}

	const absolutePath = resolve(dirname(fromFile), decodedPathname);
	const candidates = [
		absolutePath,
		`${absolutePath}.md`,
		join(absolutePath, 'index.md'),
	];

	for (const candidate of candidates) {
		const route = byFilePath.get(resolve(candidate));

		if (route) {
			return route;
		}
	}

	const lastSegment = decodedPathname.replace(/[\\/]+$/, '').split(/[\\/]/).pop();

	if (!lastSegment) {
		return null;
	}

	return bySlug.get(lastSegment.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')) ?? null;
};

const allFiles = targets.flatMap(({ directory }) => collectMarkdownFiles(directory));
const byFilePath = new Map();
const bySlug = new Map();

for (const target of targets) {
	for (const file of collectMarkdownFiles(target.directory)) {
		const route = `/${target.collection}/${toRouteSlug(file)}/`;
		byFilePath.set(resolve(file), route);
		bySlug.set(toRouteSlug(file), route);
	}
}

const changes = [];

for (const file of allFiles) {
	const stats = statSync(file);
	if (!stats.isFile()) {
		continue;
	}

	const original = readFileSync(file, 'utf8');
	const next = original.replace(/(!?)\[([^\]\n]+)\]\(([^)\n]+)\)/g, (match, imagePrefix, text, rawTarget) => {
		if (imagePrefix) {
			return match;
		}

		const { href: rawHref, suffix } = splitTarget(rawTarget.trim());
		const href = stripWrappingAngles(rawHref);

		if (isIgnoredHref(href)) {
			return match;
		}

		const { pathname, hash } = splitHash(href);
		const route = resolveMarkdownFile(file, pathname, byFilePath, bySlug);

		if (!route) {
			return match;
		}

		const nextTarget = `${route}${hash}${suffix}`;
		changes.push(`${toPosixPath(relative(root, file))}: ${href} -> ${route}${hash}`);

		return `[${text}](${nextTarget})`;
	});

	if (next !== original && mode === 'apply') {
		writeFileSync(file, next, 'utf8');
	}
}

if (changes.length === 0) {
	console.log('Markdown links are already normalized.');
	process.exit(0);
}

for (const change of changes) {
	console.log(change);
}

if (mode === 'check') {
	console.error('Markdown links need conversion. Run npm run links:apply.');
	process.exit(1);
}

console.log(`Converted ${changes.length} markdown link(s).`);
