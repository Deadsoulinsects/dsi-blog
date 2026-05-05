import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		tags: z.array(z.string()).default([]),
	}),
});

const docs = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		category: z.string(),
		tags: z.array(z.string()).default([]),
	}),
});

export const collections = {
	blog,
	docs,
};
