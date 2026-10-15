import { parseArgs } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareWebMedia } from './media/prepare.mjs';
import { inventory, readManifest } from './media/store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
	const { values } = parseArgs({
		options: {
			note: { type: 'string' }, 'source-root': { type: 'string' }, id: { type: 'string' },
			'store-root': { type: 'string', default: root },
			ffmpeg: { type: 'string' }, ffprobe: { type: 'string' },
			orphans: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
	});
	if (values.help) {
		console.log('npm run media:prepare -- --note <file.md> --source-root <reference root> --id <stable id>');
		console.log('Options: --ffmpeg <exe> --ffprobe <exe> --store-root <sandbox> --orphans');
		console.log('Originals are read-only. Orphans are reported, never removed.');
		return;
	}
	const storeRoot = resolve(values['store-root']);
	if (values.orphans) {
		const manifest = await readManifest(join(storeRoot, 'src', 'data', 'media-manifest.json'));
		console.log(JSON.stringify(await inventory(storeRoot, manifest), null, 2));
		return;
	}
	if (!values.note || !values['source-root'] || !values.id)
		throw new TypeError('Required: --note, --source-root, --id. Use --help.');
	const result = await prepareWebMedia({
		note: resolve(values.note), sourceRoot: resolve(values['source-root']), id: values.id, storeRoot,
		ffmpeg: values.ffmpeg, ffprobe: values.ffprobe,
		onProgress: ({ completed, total, action, kind }) => console.log(`[media] ${completed}/${total} ${kind} ${action}`),
	});
	const summary = { ...result };
	delete summary.files;
	console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
	if (!(error instanceof Error)) throw error;
	console.error(`[media] ${error.message}`);
	process.exitCode = 1;
});
