import type { CollectionEntry } from 'astro:content';
import { withBase } from './paths';
import { getTopicPath } from './topics';

export const getPublicArticleMetadata = (posts: CollectionEntry<'blog'>[], base: string) =>
	posts.map((post) => {
		const topicPath = getTopicPath(post.data);
		return {
			id: post.id,
			path: withBase(base, `/blog/${post.id}/`),
			title: post.data.title,
			description: post.data.description,
			completion_date: post.data.completion_date.toISOString().slice(0, 10),
			topic: topicPath[0] ?? '',
			topicPath,
			...(post.data.mediaId ? { mediaId: post.data.mediaId } : {}),
		};
	});
