import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { isValidCompletionDate, normalizeCompletionDate } from './shared/content/frontmatter.mjs';

const completionDate = z.preprocess(
	(value) => value instanceof Date && !Number.isNaN(value.getTime())
		? value.toISOString().slice(0, 10)
		: normalizeCompletionDate(value) ?? value,
	z.string().refine(isValidCompletionDate, '请填写 YYYY-MM-DD（或 YYYY/MM/DD）的有效完成日期。').transform((value) => new Date(value)),
);
const optionalDate = z.preprocess((value) => value === null || value === '' ? undefined : value, completionDate.optional());

const blog = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		completion_date: completionDate,
		start_date: optionalDate,
		end_date: optionalDate,
		tags: z.array(z.string()).default([]),
		topic: z.string().default(''),
		topicPath: z.array(z.string().trim().min(1)).optional(),
		mediaId: z.string().min(1).optional(),
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
