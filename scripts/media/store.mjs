import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { normalizeMediaPath } from '../../src/shared/content/media.mjs';
import { parseWebMediaManifest } from '../../src/shared/content/web-media.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function hashFile(file) {
	const hash = createHash('sha256');
	let bytes = 0;
	for await (const chunk of createReadStream(file)) {
		hash.update(chunk);
		bytes += chunk.length;
	}
	return { sha256: hash.digest('hex'), bytes };
}

export async function readOptional(file) {
	try { return await readFile(file, 'utf8'); }
	catch (error) {
		if (error.code !== 'ENOENT') throw error;
		return null;
	}
}

export async function readManifest(file) {
	const text = await readOptional(file);
	return text === null
		? { schemaVersion: 1, documents: {}, assets: {}, recipes: {} }
		: parseWebMediaManifest(JSON.parse(text));
}

// Check directory entries, not Windows' case-insensitive open() or a basename fallback.
export async function sourceFile(root, identity) {
	if (normalizeMediaPath(identity).path !== identity) throw new TypeError('Invalid source identity.');
	let directory = await realpath(root);
	const segments = identity.split('/');
	for (const [index, segment] of segments.entries()) {
		const entries = (await readdir(directory, { withFileTypes: true }))
			.filter((entry) => entry.name.normalize('NFC') === segment);
		if (entries.length !== 1) throw new Error(`Missing or ambiguous attachment: ${identity}`);
		const entry = entries[0];
		if (entry.isSymbolicLink() || (index < segments.length - 1 ? !entry.isDirectory() : !entry.isFile()))
			throw new Error(`Attachment is not a regular contained file: ${identity}`);
		directory = join(directory, entry.name);
	}
	const actual = await realpath(directory);
	const offset = relative(await realpath(root), actual);
	if (offset.startsWith(`..${sep}`) || offset === '..' || resolve(actual) === resolve(root))
		throw new Error(`Attachment escapes source root: ${identity}`);
	return actual;
}

export const assetFiles = (asset) => [...asset.variants, ...(asset.poster ? [asset.poster] : [])];
export const publicFile = (root, variant) => join(root, 'public', variant.url.slice(1));

export async function assetIntact(root, asset) {
	for (const variant of assetFiles(asset)) {
		try {
			const actual = await hashFile(publicFile(root, variant));
			if (actual.sha256 !== variant.sha256 || actual.bytes !== variant.bytes) return false;
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
			return false;
		}
	}
	return true;
}

function sorted(value) {
	if (Array.isArray(value)) return value.map(sorted);
	if (value && typeof value === 'object')
		return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
	return value;
}
export const manifestText = (manifest) => `${JSON.stringify(sorted(manifest), null, 2)}\n`;

// Commit pointer last. A crash can leave harmless orphan files, never a partial manifest.
export async function promote(root, staged, manifest) {
	await mkdir(join(root, 'public', 'media'), { recursive: true });
	await mkdir(join(root, 'src', 'data'), { recursive: true });
	for (const { file, variant } of staged) {
		const destination = publicFile(root, variant);
		let intact = false;
		try { intact = (await hashFile(destination)).sha256 === variant.sha256; }
		catch (error) { if (error.code !== 'ENOENT') throw error; }
		if (!intact) await rename(file, destination);
	}
	const target = join(root, 'src', 'data', 'media-manifest.json');
	const text = manifestText(manifest);
	if (await readOptional(target) === text) return false;
	const temporary = join(dirname(staged[0]?.file ?? join(root, '.media-work', 'manifest')), 'manifest.json');
	const handle = await open(temporary, 'w');
	try { await handle.writeFile(text); await handle.sync(); }
	finally { await handle.close(); }
	await rename(temporary, target);
	return true;
}

export async function inventory(root, manifest) {
	const live = new Set(Object.values(manifest.assets).flatMap(assetFiles).map((v) => basename(v.url)));
	let entries = [];
	try { entries = await readdir(join(root, 'public', 'media'), { withFileTypes: true }); }
	catch (error) { if (error.code !== 'ENOENT') throw error; }
	const orphaned = [];
	const unmanaged = [];
	const files = [];
	let storeBytes = 0;
	for (const entry of entries) {
		const bytes = entry.isFile() ? (await stat(join(root, 'public', 'media', entry.name))).size : 0;
		storeBytes += bytes;
		if (!entry.isFile() || !/^[a-f0-9]{64}\.(webp|mp4)$/.test(entry.name)) {
			unmanaged.push(entry.name);
			continue;
		}
		files.push({ url: `/media/${entry.name}`, bytes });
		if (!live.has(entry.name)) orphaned.push({ url: `/media/${entry.name}`, bytes });
	}
	return { storeBytes, files, orphaned, unmanaged };
}

export async function withStoreLock(root, operation) {
	const directory = join(root, '.media-work');
	await mkdir(directory, { recursive: true });
	const lock = join(directory, 'lock');
	const handle = await open(lock, 'wx');
	try {
		await handle.writeFile(JSON.stringify({ pid: process.pid }));
		return await operation(directory);
	} finally {
		await handle.close();
		await rm(lock);
	}
}
