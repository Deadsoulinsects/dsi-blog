import fs from 'node:fs/promises';
import path from 'node:path';
import { WEB_MEDIA_POLICY } from '../../src/shared/content/web-media.mjs';
import { discoverMedia } from '../../src/shared/content/media.mjs';
import { createContentIndex } from '../../src/shared/content/links.mjs';
import { assetFiles, assetIntact, inventory, readManifest } from '../media/store.mjs';
import { command, markdownFiles, parseArticle, unix } from './workspace-io.mjs';

/** Shared node_modules must not share Astro's content cache with the real dev server. */
export async function workspaceValidationConfig(root) {
	const file = path.join(root, '.astro/admin.config.mjs');
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, "import config from '../astro.config.mjs';\nexport default { ...config, cacheDir: './.astro/cache/' };\n");
	return path.relative(root, file);
}

/** Validate the exact composite or committed tree, never the dirty real repository. */
export async function validateWorkspaceTree({ root, runtimeRoot, node, signal, onPhase }) {
	const config = await workspaceValidationConfig(root);
	for (const action of ['check', 'build']) {
		signal.throwIfAborted();
		onPhase(action);
		await command(node, [path.join(runtimeRoot, 'node_modules/astro/bin/astro.mjs'), action, '--config', config], {
			cwd: root, signal, timeout: 180000, env: { ELECTRON_RUN_AS_NODE: '1' },
		});
	}
	const manifest = await readManifest(path.join(root, 'src/data/media-manifest.json'));
	if ((await inventory(root, manifest)).storeBytes > WEB_MEDIA_POLICY.budget.storeBytes) throw new Error('合并后的网页媒体库超过共享存储预算。');
	for (const file of await markdownFiles(path.join(root, 'src/content/blog'))) {
		const article = parseArticle(await fs.readFile(file, 'utf8'), path.basename(file));
		if (!article.mediaId || !discoverMedia(article.body).references.length) continue;
		const document = manifest.documents[article.mediaId];
		if (!document) throw new Error(`已提交文章缺少对应媒体记录：${path.basename(file)}`);
		const relative = unix(path.relative(root, file));
		const route = createContentIndex([{ path: relative, collection: 'blog' }]).byFilePath.get(relative);
		const html = await fs.readFile(path.join(root, 'dist', route.slice(1), 'index.html'), 'utf8');
		const imageTags = (html.match(/<(?:img|source)\b[^>]*>/gi) || []).join('\n');
		const videoTags = (html.match(/<(?:video|source)\b[^>]*>/gi) || []).join('\n');
		for (const key of new Set(Object.values(document.resources))) {
			const asset = manifest.assets[key];
			if (!asset || !await assetIntact(root, asset)) throw new Error(`提交中的网页资源不完整：${path.basename(file)}`);
			const tags = asset.kind === 'video' ? videoTags : imageTags;
			if (!asset.variants.some((variant) => tags.includes(variant.url))) {
				throw new Error(`实际构建没有使用文章的网页派生资源：${path.basename(file)}。请先提交配套的网站渲染代码。`);
			}
			if (assetFiles(asset).some((variant) => variant.bytes > WEB_MEDIA_POLICY.budget.fileBytes)) throw new Error('提交中的单个网页资源超过共享预算。');
		}
	}
}

export async function committedWorkspaceTree({ git, sha, root, runtimeRoot, signal }) {
	await git.run(['clone', '--quiet', '--no-checkout', '--shared', '--', git.repoRoot, root], { signal });
	await git.run(['-C', root, 'checkout', '--quiet', '--detach', sha], { signal });
	const rejectLinks = async (directory) => {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			if (entry.name === '.git') continue;
			if (entry.isSymbolicLink()) throw new Error('提交中的工程包含符号链接，不能安全建立验证工作区。');
			if (entry.isDirectory()) await rejectLinks(path.join(directory, entry.name));
		}
	};
	await rejectLinks(root);
	await fs.symlink(path.join(runtimeRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction');
}
