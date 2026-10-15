import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { siteConfig } from '../data/site-config';

export const GET: APIRoute = async (context) => {
	const posts = (await getCollection('blog')).sort((a, b) => b.data.completion_date.getTime() - a.data.completion_date.getTime());
	const site = context.site ?? 'https://blog.deadsoulinsects.cn';

	return rss({
		title: siteConfig.site.name,
		description: siteConfig.rss.description,
		site,
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.completion_date,
			description: post.data.description,
			link: `/blog/${post.id}/`,
		})),
	});
};
