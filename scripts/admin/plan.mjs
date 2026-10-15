import { createEncoder } from '../media/encode.mjs';
import { assetIntact, hashFile, sha256, sourceFile } from '../media/store.mjs';

/** Exactly the preparer's content + kind + encoder-recipe identity; never encodes. */
export async function planResources({ document, sourceRoot, storeRoot, manifest, ffmpeg, ffprobe, resolveSource }) {
	const resources = [];
	let encoder;
	let encoderError;
	try { encoder = await createEncoder({ ffmpeg, ffprobe, needVideo: document.references.some((ref) => ref.kind === 'video') }); }
	catch (error) { encoderError = error.message; }
	const seen = new Set();
	for (const reference of new Map(document.references.filter((ref) => ref.normalizedPath)
		.map((ref) => [ref.normalizedPath, ref])).values()) {
		const resource = { identity: reference.normalizedPath, path: reference.normalizedPath, kind: reference.kind, status: 'matched', action: 'blocked', message: '' };
		try {
			const file = resolveSource ? await resolveSource(resource.path) : await sourceFile(sourceRoot, resource.path);
			Object.assign(resource, { file, ...await hashFile(file) });
			if (encoderError) throw new Error(encoderError);
			const recipe = sha256(encoder.recipes[reference.kind]);
			const key = sha256(`${reference.kind}\0${resource.sha256}\0${recipe}`);
			const asset = manifest.assets[key];
			const intact = !!asset && await assetIntact(storeRoot, asset);
			Object.assign(resource, { recipe, key, intact,
				action: seen.has(key) ? 'deduplicated' : intact ? 'reused' : 'convert' });
			seen.add(key);
		} catch (error) {
			resource.status = !resource.file ? 'missing' : 'error';
			resource.error = error.message;
			resource.message = error.message;
		}
		resources.push(resource);
	}
	for (const ref of document.references.filter((item) => !item.normalizedPath)) {
		resources.push({ identity: ref.sourceRef, path: ref.sourceRef, kind: ref.kind, action: 'blocked', status: 'error', message: ref.diagnostic, error: ref.diagnostic });
	}
	return resources;
}
