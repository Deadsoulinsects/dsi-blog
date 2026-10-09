import { z } from 'astro/zod';
import rawSiteConfig from './site.json';

const nonEmptyString = z.string().min(1);

const navigationLabelsSchema = z
	.object({
		blog: nonEmptyString,
		projects: nonEmptyString,
		docs: nonEmptyString,
		origin: nonEmptyString,
		about: nonEmptyString,
	})
	.strict()
	.readonly();

const aboutSectionSchema = z
	.object({
		title: nonEmptyString,
		description: nonEmptyString,
	})
	.strict()
	.readonly();

const contactItemSchema = z
	.object({
		label: nonEmptyString,
		value: nonEmptyString,
		copyValue: nonEmptyString,
	})
	.strict()
	.readonly();

const siteConfigSchema = z
	.object({
		site: z
			.object({
				name: nonEmptyString,
				defaultDescription: nonEmptyString,
				brandTagline: nonEmptyString,
				footerMotto: nonEmptyString,
			})
			.strict()
			.readonly(),
		navigation: z
			.object({
				header: navigationLabelsSchema,
				home: navigationLabelsSchema,
			})
			.strict()
			.readonly(),
		home: z
			.object({
				metaDescription: nonEmptyString,
				kicker: nonEmptyString,
				subtitle: nonEmptyString,
				description: nonEmptyString,
				englishMotto: nonEmptyString,
				chineseMotto: nonEmptyString,
			})
			.strict()
			.readonly(),
		about: z
			.object({
				metaDescription: nonEmptyString,
				intro: z
					.object({
						kicker: nonEmptyString,
						headingPrefix: nonEmptyString,
						headingUnit: nonEmptyString,
						headingSuffix: nonEmptyString,
						lead: nonEmptyString,
					})
					.strict()
					.readonly(),
				overview: z
					.object({
						heading: nonEmptyString,
						note: nonEmptyString,
						sections: z.array(aboutSectionSchema).min(1).readonly(),
					})
					.strict()
					.readonly(),
				contact: z
					.object({
						heading: nonEmptyString,
						items: z.array(contactItemSchema).min(1).readonly(),
					})
					.strict()
					.readonly(),
			})
			.strict()
			.readonly(),
		rss: z
			.object({
				description: nonEmptyString,
			})
			.strict()
			.readonly(),
	})
	.strict()
	.readonly();

export const siteConfig = siteConfigSchema.parse(rawSiteConfig);
