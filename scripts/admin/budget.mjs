import { WEB_MEDIA_POLICY } from '../../src/shared/content/web-media.mjs';
import { assetFiles } from '../media/store.mjs';

/** Report known prepared bytes once per immutable URL, exactly as preparation does. */
export function mediaBudgetReport({ resources, manifest, storeBytes }) {
	const files = new Map();
	let unknownResources = 0;
	for (const resource of resources) {
		const asset = manifest.assets[resource.key];
		if (!asset) { unknownResources++; continue; }
		for (const variant of assetFiles(asset)) files.set(variant.url, variant.bytes);
	}
	const documentBytes = [...files.values()].reduce((total, bytes) => total + bytes, 0);
	const policy = WEB_MEDIA_POLICY.budget;
	const warnings = [];
	const errors = [];
	if (documentBytes > policy.recommendedDocumentBytes)
		warnings.push('Prepared document exceeds the recommended 50 MiB; review before publishing.');
	if (documentBytes > policy.documentBytes) errors.push('Prepared document exceeds the 80 MiB hard budget.');
	if ([...files.values()].some((bytes) => bytes > policy.fileBytes)) errors.push('Prepared resource exceeds the 20 MiB file budget.');
	if (storeBytes > policy.storeBytes) errors.push('Media store exceeds 500 MiB; review orphan report and Git history.');
	return { summary: { documentBytes, storeBytes, webFiles: files.size, unknownResources }, warnings, errors };
}
