import { getCollection } from 'astro:content';
import { toParamSlug } from './paths';

export const sortByPubDateDesc = <T extends { data: { pubDate: Date } }>(items: T[]) =>
	items.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

export const formatDate = (date: Date) =>
	date.toLocaleDateString('zh-CN', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	});

export const formatDateTime = (date: Date) =>
	`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

export const getSortedPosts = async () => sortByPubDateDesc(await getCollection('blog'));

export const getSortedDocs = async () => sortByPubDateDesc(await getCollection('docs'));

export const getAllBlogTags = async () => {
	const posts = await getSortedPosts();
	const tagMap = new Map<string, number>();

	for (const post of posts) {
		for (const tag of post.data.tags) {
			const normalizedTag = tag.trim();

			if (!normalizedTag) {
				continue;
			}

			tagMap.set(normalizedTag, (tagMap.get(normalizedTag) ?? 0) + 1);
		}
	}

	return Array.from(tagMap.entries())
		.map(([name, count]) => ({
			name,
			count,
			slug: toParamSlug(name),
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
};

export const getAllDocCategories = async () => {
	const docs = await getSortedDocs();
	const categoryMap = new Map<string, number>();

	for (const doc of docs) {
		const normalizedCategory = doc.data.category.trim();

		if (!normalizedCategory) {
			continue;
		}

		categoryMap.set(normalizedCategory, (categoryMap.get(normalizedCategory) ?? 0) + 1);
	}

	return Array.from(categoryMap.entries())
		.map(([name, count]) => ({
			name,
			count,
			slug: toParamSlug(name),
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
};

export const getArchiveGroups = async () => {
	const posts = await getSortedPosts();
	const groups = new Map<string, typeof posts>();

	for (const post of posts) {
		const year = String(post.data.pubDate.getUTCFullYear());
		const current = groups.get(year) ?? [];

		current.push(post);
		groups.set(year, current);
	}

	return Array.from(groups.entries()).map(([year, items]) => ({ year, items }));
};
