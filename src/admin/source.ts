import { parseDocument } from 'yaml';
import { splitMarkdownSource, stripArticleHeader } from '../shared/content/frontmatter.mjs';
import type { AdminBlockingIssue, AdminDraftMetadata } from './content';

const MAX_YAML_ALIAS_COUNT = 50;

export type ParsedSource = {
	readonly sourceText: string;
	readonly metadata: AdminDraftMetadata;
	readonly body: string;
	readonly issues: readonly AdminBlockingIssue[];
};

const emptyMetadata = (): AdminDraftMetadata => ({
	title: undefined,
	description: undefined,
	completion_date: undefined,
	topic: '',
});

const isMapping = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' && value !== null && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';

const metadataFrom = (value: Readonly<Record<string, unknown>>): AdminDraftMetadata => ({
	title: value.title,
	description: value.description,
	completion_date: Object.hasOwn(value, 'completion_date') ? value.completion_date : value.pubDate,
	topic: value.topic === undefined ? '' : value.topic,
	tags: value.tags,
	start_date: value.start_date,
	end_date: value.end_date,
});

export const parseSource = (sourceText: string): ParsedSource => {
	const { normalized, frontmatter, body: sourceBody, closed } = splitMarkdownSource(sourceText);
	const body = stripArticleHeader(sourceBody);
	if (normalized.trim() === '') {
		return { sourceText: normalized, metadata: emptyMetadata(), body: '', issues: [{ code: 'empty_file', message: '文件内容为空。' }] };
	}

	if (frontmatter === null) {
		return {
			sourceText: normalized,
			metadata: emptyMetadata(),
			body,
			issues: [{ code: 'missing_frontmatter', message: '文件开头缺少 frontmatter。' }],
		};
	}

	if (!closed) {
		return {
			sourceText: normalized,
			metadata: emptyMetadata(),
			body: '',
			issues: [{ code: 'unclosed_frontmatter', message: 'frontmatter 缺少结束分隔线。' }],
		};
	}

	if (frontmatter.trim() === '') {
		return {
			sourceText: normalized,
			metadata: emptyMetadata(),
			body,
			issues: [{ code: 'empty_frontmatter', message: 'frontmatter 不能为空。' }],
		};
	}

	const document = parseDocument(frontmatter, { prettyErrors: true, strict: true, uniqueKeys: true });
	const yamlProblems = [...document.errors, ...document.warnings];
	if (yamlProblems.length > 0) {
		const issues = yamlProblems.map((error): AdminBlockingIssue => {
			const position = error.linePos?.[0];
			const summary = error.message.match(/^[^\n]*/u)?.[0] || error.code;
			if (position === undefined) return { code: 'invalid_yaml', message: `YAML 无法解析：${summary}` };
			const line = position.line + 1;
			return {
				code: 'invalid_yaml',
				message: `YAML 第 ${line} 行第 ${position.col} 列：${summary}`,
				line,
				column: position.col,
			};
		});
		return { sourceText: normalized, metadata: emptyMetadata(), body, issues: Object.freeze(issues) };
	}

	let value: unknown;
	try {
		value = document.toJS({ maxAliasCount: MAX_YAML_ALIAS_COUNT });
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		return {
			sourceText: normalized,
			metadata: emptyMetadata(),
			body,
			issues: [{ code: 'invalid_yaml', message: `YAML 无法展开：${error.message}` }],
		};
	}

	if (!isMapping(value)) {
		return {
			sourceText: normalized,
			metadata: emptyMetadata(),
			body,
			issues: [{ code: 'non_mapping_frontmatter', message: 'frontmatter 顶层必须是键值映射。' }],
		};
	}

	return { sourceText: normalized, metadata: metadataFrom(value), body, issues: [] };
};
