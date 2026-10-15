// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';
import mediaManifest from './src/data/media-manifest.json' with { type: 'json' };
import { parseWebMediaManifest } from './src/shared/content/web-media.mjs';
import { remarkWebMedia } from './src/shared/content/remark-web-media.mjs';
import adminLocalIntegration from './scripts/admin/integration.mjs';

// https://astro.build/config
export default defineConfig({
	integrations: [
		adminLocalIntegration(),
		sitemap({
			filter: (page) => {
				const pathname = new URL(page).pathname;
				const normalizedPath = pathname.replace(/\/+$/, '');

				return (
					!pathname.includes('/lab/field-notebook/') &&
					!normalizedPath.endsWith('/lab/full-bleed-topnav') &&
					!normalizedPath.endsWith('/lab') &&
					!normalizedPath.endsWith('/admin')
				);
			},
		}),
	],
	site: 'https://blog.deadsoulinsects.cn',
	markdown: {
		remarkPlugins: [[remarkWebMedia, {
			manifest: parseWebMediaManifest(mediaManifest),
			publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
		}]],
	},
});
