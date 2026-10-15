import type { CollectionEntry } from 'astro:content';
import { getPinnedTopicPath, getTopicMeta } from '../data/topics';
import { toParamSlug } from './paths';

type BlogPost = CollectionEntry<'blog'>;

export interface TopicGroup {
	name: string;
	slug: string;
	path: string[];
	description?: string;
	posts: BlogPost[];
	directPosts: BlogPost[];
}

export const normalizeTopic = (topic?: string) => (topic ?? '').trim();

export const getTopicPath = (data: { topic?: string; topicPath?: string[] }): string[] => {
	const path = data.topicPath?.map(normalizeTopic).filter(Boolean);
	if (path?.length) {
		return path;
	}
	const topic = normalizeTopic(data.topic);
	return topic ? [topic] : [];
};

export const getTopicSlug = (path: string[]) => path.map(toParamSlug).join('/');

export const getTopicGroups = (posts: BlogPost[]): TopicGroup[] => {
	const groups = new Map<string, TopicGroup>();

	for (const post of posts) {
		const path = getTopicPath(post.data);
		for (let depth = 1; depth <= path.length; depth++) {
			const prefix = path.slice(0, depth);
			const key = JSON.stringify(prefix);
			let group = groups.get(key);
			if (!group) {
				const name = prefix[depth - 1];
				group = {
					name,
					slug: getTopicSlug(prefix),
					path: prefix,
					description: getTopicMeta(prefix.join('/'))?.description || undefined,
					posts: [],
					directPosts: [],
				};
				groups.set(key, group);
			}
			if (!group.posts.some((current) => current.id === post.id)) {
				group.posts.push(post);
			}
			if (depth === path.length && !group.directPosts.some((current) => current.id === post.id)) {
				group.directPosts.push(post);
			}
		}
	}

	return Array.from(groups.values())
		.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'), 'zh-CN'));
};

export const getChildTopics = (groups: TopicGroup[], path: string[]) =>
	groups.filter((group) => group.path.length === path.length + 1
		&& path.every((name, index) => group.path[index] === name));

export const getFeaturedTopicGroups = (groups: TopicGroup[], pinnedPath = getPinnedTopicPath()): TopicGroup[] => {
	const latestDate = (group: TopicGroup) => Math.max(...group.posts.map((post) => post.data.completion_date.getTime()));
	const recent = groups.filter((group) => group.path.length === 1 && group.posts.length)
		.sort((left, right) => latestDate(right) - latestDate(left)
			|| left.name.localeCompare(right.name, 'zh-CN'));
	const pinned = pinnedPath?.length === 1 ? recent.find((group) => group.name === pinnedPath[0]) : undefined;
	return pinned ? [pinned, ...recent.filter((group) => group !== pinned)].slice(0, 2) : recent.slice(0, 2);
};
