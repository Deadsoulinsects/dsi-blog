import type { CollectionEntry } from 'astro:content';
import { toParamSlug } from './paths';

type BlogPost = CollectionEntry<'blog'>;

export interface TopicGroup {
	name: string;
	slug: string;
	posts: BlogPost[];
}

export const normalizeTopic = (topic?: string) => (topic ?? '').trim();

export const getTopicGroups = (posts: BlogPost[]) => {
	const groups = new Map<string, BlogPost[]>();

	for (const post of posts) {
		const topic = normalizeTopic(post.data.topic);

		if (!topic) {
			continue;
		}

		const current = groups.get(topic) ?? [];

		current.push(post);
		groups.set(topic, current);
	}

	return Array.from(groups.entries())
		.map(([name, topicPosts]) => ({
			name,
			slug: toParamSlug(name),
			posts: topicPosts,
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
};
