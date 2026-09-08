// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	integrations: [
		sitemap({
			filter: (page) => {
				const pathname = new URL(page).pathname;

				return !pathname.includes('/lab/field-notebook/') && !pathname.replace(/\/+$/, '').endsWith('/lab/full-bleed-topnav');
			},
		}),
	],
	site: 'https://blog.deadsoulinsects.cn',
});
