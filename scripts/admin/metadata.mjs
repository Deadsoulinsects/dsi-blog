import { parseDocument, isMap } from 'yaml';
import { z } from 'astro/zod';
import { isValidCompletionDate } from '../../src/shared/content/frontmatter.mjs';

// Mirrors src/content.config.ts blog schema; shared validators enforce preparation rules.
const date = z.string().refine(isValidCompletionDate);
const optionalDate = z.preprocess((value) => value === null || value === '' ? undefined : value, date.optional());
export const blogSchema = z.object({ title: z.string(), description: z.string(), completion_date: date,
	start_date: optionalDate, end_date: optionalDate, tags: z.array(z.string()).default([]),
	topic: z.string().default(''), topicPath: z.array(z.string().trim().min(1)).optional(),
	mediaId: z.string().min(1).optional() });

export function metadataOf(parts) {
	if (!parts.closed) throw new Error('Unclosed frontmatter.');
	if (parts.frontmatter === null) return {};
	const yaml = parseDocument(parts.frontmatter, { strict: true, uniqueKeys: true });
	if (yaml.errors.length || yaml.warnings.length || !isMap(yaml.contents))
		throw new Error('Frontmatter must be a valid YAML mapping without duplicate keys.');
	return yaml.toJS({ maxAliasCount: 50 });
}
