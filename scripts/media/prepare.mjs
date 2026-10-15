import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { discoverMedia } from '../../src/shared/content/media.mjs';
import { splitMarkdownSource } from '../../src/shared/content/frontmatter.mjs';
import { parseWebMediaManifest, WEB_MEDIA_POLICY } from '../../src/shared/content/web-media.mjs';
import { createEncoder } from './encode.mjs';
import {
	assetFiles, assetIntact, hashFile, inventory, promote, readManifest,
	sha256, sourceFile, withStoreLock,
} from './store.mjs';

const documentId = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,99}$/u;
const uniqueFiles = (assets) => new Map(
	assets.flatMap(assetFiles).map((variant) => [variant.url, variant.bytes]),
);

/**
 * All consumers use shared discovery + policy; no private Markdown rewrite or Gallery dialect.
 * The filesystem adapter is deliberately separate from browser File/object-URL sessions.
 */
export async function prepareWebMedia(options) {
	const { id, note, sourceRoot, storeRoot, onProgress = () => {} } = options;
	if (!documentId.test(id)) throw new TypeError('Invalid document id.');
	const offset = relative(resolve(sourceRoot), resolve(storeRoot));
	if (offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !/^[A-Z]:/i.test(offset)))
		throw new TypeError('Resource store must be outside the original attachment root.');
	const markdown = await readFile(note, 'utf8');
	const source = splitMarkdownSource(markdown);
	if (!source.closed) throw new TypeError('Unclosed Markdown frontmatter.');
	const document = discoverMedia(source.body);
	if (document.diagnostics.length) throw new TypeError(document.diagnostics.join('\n'));
	const references = new Map(document.references.map((ref) => [ref.normalizedPath, ref]));

	return withStoreLock(storeRoot, async (working) => {
		const manifestFile = join(storeRoot, 'src', 'data', 'media-manifest.json');
		const previous = await readManifest(manifestFile);
		const encoder = await createEncoder({
			ffmpeg: options.ffmpeg, ffprobe: options.ffprobe,
			needVideo: document.references.some((ref) => ref.kind === 'video'),
			signal: options.signal,
		});
		const stage = await mkdtemp(join(working, 'stage-'));
		try {
			const assets = new Map();
			const resources = [];
			const originals = [];
			const staged = [];
			const recipes = { ...previous.recipes };
			let converted = 0;
			let reused = 0;
			let deduplicated = 0;
			for (const [identity, reference] of references) {
				options.signal?.throwIfAborted();
				const file = options.resolveSource ? await options.resolveSource(identity) : await sourceFile(sourceRoot, identity);
				const fingerprint = await hashFile(file);
				originals.push({ file, ...fingerprint });
				const recipe = sha256(encoder.recipes[reference.kind]);
				recipes[recipe] = encoder.recipes[reference.kind];
				const key = sha256(`${reference.kind}\0${fingerprint.sha256}\0${recipe}`);
				let asset = assets.get(key);
				let action = 'deduplicated';
				if (asset) deduplicated += 1;
				else if (Object.hasOwn(previous.assets, key) && await assetIntact(storeRoot, previous.assets[key])) {
					asset = previous.assets[key];
					action = 'reused';
					reused += 1;
				} else {
					const workDir = join(stage, key);
					await mkdir(workDir);
					const encoded = await encoder.encode({ file, kind: reference.kind, workDir });
					options.signal?.throwIfAborted();
					const variant = async (output) => {
						const { sha256: hash, bytes } = await hashFile(output.file);
						if (bytes > WEB_MEDIA_POLICY.budget.fileBytes)
							throw new RangeError(`Web resource exceeds file budget: ${identity}`);
						const result = {
							url: `/media/${hash}.${output.type === 'image/webp' ? 'webp' : 'mp4'}`,
							sha256: hash, bytes, width: output.width, height: output.height, type: output.type,
						};
						staged.push({ file: output.file, variant: result });
						return result;
					};
					asset = {
						kind: reference.kind, recipe,
						source: { ...encoded.source, ...fingerprint },
						variants: await Promise.all(encoded.variants.map(variant)),
						...(encoded.poster ? { poster: await variant(encoded.poster) } : {}),
					};
					action = 'converted';
					converted += 1;
				}
				assets.set(key, asset);
				resources.push([identity, key]);
				onProgress({ completed: resources.length, total: references.size, action, kind: reference.kind });
			}
			const documents = {
				...previous.documents,
				[id]: { markdownSha256: sha256(markdown), resources: Object.fromEntries(resources) },
			};
			const reachable = new Set(Object.values(documents).flatMap((doc) => Object.values(doc.resources)));
			const nextAssets = Object.fromEntries([...reachable].sort().map((key) => [key, assets.get(key) ?? previous.assets[key]]));
			const neededRecipes = new Set(Object.values(nextAssets).map((asset) => asset.recipe));
			const next = parseWebMediaManifest({
				schemaVersion: 1, documents, assets: nextAssets,
				recipes: Object.fromEntries([...neededRecipes].sort().map((key) => [key, recipes[key]])),
			});
			const docFiles = uniqueFiles([...assets.values()]);
			const documentBytes = [...docFiles.values()].reduce((sum, bytes) => sum + bytes, 0);
			const imageBytes = [...assets.values()].filter((asset) => asset.kind === 'image')
				.reduce((sum, asset) => sum + asset.variants.reduce((total, v) => total + v.bytes, 0), 0);
			const videoBytes = [...assets.values()].filter((asset) => asset.kind === 'video')
				.reduce((sum, asset) => sum + asset.variants[0].bytes, 0);
			const posterBytes = [...assets.values()].reduce((sum, asset) => sum + (asset.poster?.bytes ?? 0), 0);
			if (documentBytes > WEB_MEDIA_POLICY.budget.documentBytes)
				throw new RangeError(`Prepared document is ${(documentBytes / 1048576).toFixed(2)} MiB, exceeds 80 MiB budget; images=${imageBytes}, videos=${videoBytes}, posters=${posterBytes}.`);
			const warnings = documentBytes > WEB_MEDIA_POLICY.budget.recommendedDocumentBytes
				? ['Prepared document exceeds the recommended 50 MiB; review before publishing.'] : [];
			const before = await inventory(storeRoot, previous);
			const projected = new Map(before.files.map((file) => [file.url, file.bytes]));
			for (const { variant } of staged) projected.set(variant.url, variant.bytes);
			const unmanagedBytes = before.storeBytes - before.files.reduce((sum, file) => sum + file.bytes, 0);
			if (unmanagedBytes + [...projected.values()].reduce((sum, bytes) => sum + bytes, 0) > WEB_MEDIA_POLICY.budget.storeBytes)
				throw new RangeError('Media store exceeds 500 MiB budget; review orphan report and Git history.');
			// Source mutation while transcoding cannot silently publish a mixed snapshot.
			if (await readFile(note, 'utf8') !== markdown) throw new Error('Markdown changed during preparation.');
			for (const original of originals) {
				if ((await hashFile(original.file)).sha256 !== original.sha256)
					throw new Error(`Source attachment changed during preparation: ${original.file}`);
			}
			options.signal?.throwIfAborted();
			const manifestChanged = await promote(storeRoot, staged, next);
			const after = await inventory(storeRoot, next);
			return {
				id, references: document.references.length, paths: references.size, assets: assets.size,
				converted, reused, deduplicated, manifestChanged,
				sourceBytes: originals.reduce((sum, item) => sum + item.bytes, 0),
				documentBytes, imageBytes, videoBytes, posterBytes, warnings, webFiles: docFiles.size, ...after,
				manifest: manifestFile,
			};
		} finally { await rm(stage, { recursive: true, force: true }); }
	});
}
