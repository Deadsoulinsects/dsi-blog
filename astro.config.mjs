// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	integrations: [
		sitemap({
			filter: (page) => {
				const pathname = new URL(page).pathname;
				const normalizedPath = pathname.replace(/\/+$/, '');

				return (
					!pathname.includes('/lab/field-notebook/') &&
					!normalizedPath.endsWith('/lab/full-bleed-topnav') &&
					!normalizedPath.endsWith('/lab')
				);
			},
		}),
	],
	site: 'https://blog.deadsoulinsects.cn',
});
