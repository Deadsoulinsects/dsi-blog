import { slug as githubSlug } from 'github-slugger';
import { getFileTitle, isValidCompletionDate, isValidTitle, normalizeFrontmatter } from '../shared/content/frontmatter.mjs';
import { createContentIndex, normalizeMarkdownLinks } from '../shared/content/links.mjs';
import type { ContentFile } from '../shared/content/links.mjs';
import { parseSource } from './source';
import type { ParsedSource } from './source';

const PROJECT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const RESERVED_FILE_STEM_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

export type AdminDraftMetadata = {
	readonly title: unknown;
	readonly description: unknown;
	readonly completion_date: unknown;
	readonly topic: unknown;
	readonly tags?: unknown;
	readonly start_date?: unknown;
	readonly end_date?: unknown;
};

export type AdminDraftField = keyof AdminDraftMetadata;

export type AdminBlockingIssueCode =
	| 'empty_file' | 'missing_frontmatter' | 'empty_frontmatter' | 'unclosed_frontmatter' | 'invalid_yaml'
	| 'non_mapping_frontmatter' | 'invalid_metadata_type' | 'invalid_date' | 'invalid_filename' | 'impossible_slug'
	| 'unresolved_markdown_link';

export type AdminBlockingIssue = {
	readonly code: AdminBlockingIssueCode;
	readonly message: string;
	readonly field?: AdminDraftField;
	readonly line?: number;
	readonly column?: number;
};

export type AdminPublishingRequirementCode =
	| 'missing_title' | 'missing_description' | 'missing_date'
	| 'invalid_project_date_format' | 'empty_body';

export type AdminPublishingRequirement = {
	readonly code: AdminPublishingRequirementCode;
	readonly message: string;
	readonly field?: AdminDraftField;
};

export type AdminFileTarget = {
	readonly fileName: string;
	readonly slug: string;
	readonly path: `src/content/blog/${string}`;
};

export type AdminDraft = {
	readonly sourceFileName: string;
	readonly sourceText: string;
	readonly targetFileName: string;
	readonly titleFromFileName: boolean;
	readonly metadata: AdminDraftMetadata;
	readonly body: string;
	readonly contentFiles: readonly ContentFile[];
	readonly target: AdminFileTarget | null;
	readonly blockingIssues: readonly AdminBlockingIssue[];
	readonly publishingRequirements: readonly AdminPublishingRequirement[];
	readonly ready: boolean;
};

export type AdminDraftUpdate = {
	readonly targetFileName?: string;
	readonly metadata?: Partial<AdminDraftMetadata>;
};

export type AdminDraftImportOptions = {
	readonly contentFiles?: readonly ContentFile[];
	readonly lastModified?: number;
	readonly now?: Date;
};

type DraftState = ParsedSource & {
	readonly sourceFileName: string;
	readonly targetFileName: string;
	readonly titleFromFileName: boolean;
	readonly contentFiles: readonly ContentFile[];
};

const metadataIssues = (metadata: AdminDraftMetadata): readonly AdminBlockingIssue[] => {
	const issues: AdminBlockingIssue[] = [];
	if (metadata.title !== undefined && typeof metadata.title !== 'string')
		issues.push({ code: 'invalid_metadata_type', field: 'title', message: '标题必须是文本。' });
	if (metadata.description !== undefined && typeof metadata.description !== 'string')
		issues.push({ code: 'invalid_metadata_type', field: 'description', message: '描述必须是文本。' });
	if (metadata.topic !== undefined && typeof metadata.topic !== 'string')
		issues.push({ code: 'invalid_metadata_type', field: 'topic', message: '专题必须是文本。' });

	const date = metadata.completion_date;
	if (date !== undefined && date !== null && !(typeof date === 'string' && date.trim() === '')) {
		if (!(typeof date === 'string' || typeof date === 'number' || date instanceof Date)) {
			issues.push({ code: 'invalid_metadata_type', field: 'completion_date', message: '完成日期类型无效。' });
		} else {
			if (!isValidCompletionDate(date))
				issues.push({ code: 'invalid_date', field: 'completion_date', message: '完成日期无法解析。' });
		}
	}
	return Object.freeze(issues);
};

const deriveTarget = (fileName: string): { readonly target: AdminFileTarget | null; readonly issues: readonly AdminBlockingIssue[] } => {
	if (fileName.trim() === '') return { target: null, issues: [{ code: 'invalid_filename', message: '目标文件名不能为空。' }] };
	if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..'))
		return { target: null, issues: [{ code: 'invalid_filename', message: '目标文件名只能包含一个安全 basename。' }] };
	if (!fileName.endsWith('.md')) return { target: null, issues: [{ code: 'invalid_filename', message: '目标文件名必须以小写 .md 结尾。' }] };

	const stem = fileName.slice(0, -3);
	const [deviceStem = ''] = stem.split('.');
	const hasUnsafeCharacter = [...fileName].some((character) =>
		character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || '<>:"|?*'.includes(character));
	if (hasUnsafeCharacter || RESERVED_FILE_STEM_PATTERN.test(deviceStem))
		return { target: null, issues: [{ code: 'invalid_filename', message: '目标文件名包含不安全字符或保留名称。' }] };
	const slug = githubSlug(stem);
	if (slug === '') return { target: null, issues: [{ code: 'impossible_slug', message: '文件名无法生成文章 slug。' }] };

	return {
		target: Object.freeze({ fileName, slug, path: `src/content/blog/${fileName}` }),
		issues: [],
	};
};

const publishingRequirements = (metadata: AdminDraftMetadata, body: string): readonly AdminPublishingRequirement[] => {
	const issues: AdminPublishingRequirement[] = [];
	if (metadata.title === undefined || metadata.title === null || (typeof metadata.title === 'string' && metadata.title.trim() === ''))
		issues.push({ code: 'missing_title', field: 'title', message: '请填写标题。' });
	if (metadata.description === undefined || metadata.description === null || (typeof metadata.description === 'string' && metadata.description.trim() === ''))
		issues.push({ code: 'missing_description', field: 'description', message: '请填写描述。' });
	if (metadata.completion_date === undefined || metadata.completion_date === null || (typeof metadata.completion_date === 'string' && metadata.completion_date.trim() === '')) {
		issues.push({ code: 'missing_date', field: 'completion_date', message: '请填写完成日期。' });
	} else if (typeof metadata.completion_date !== 'string' || !PROJECT_DATE_PATTERN.test(metadata.completion_date.trim())) {
		issues.push({ code: 'invalid_project_date_format', field: 'completion_date', message: '完成日期须使用 YYYY-MM-DD。' });
	}
	if (body.trim() === '') issues.push({ code: 'empty_body', message: '正文不能为空。' });
	return Object.freeze(issues);
};

const buildDraft = (state: DraftState): AdminDraft => {
	const normalizedMetadata = Object.freeze({
		...state.metadata,
		topic: state.metadata.topic === undefined ? '' : state.metadata.topic,
	});
	const targetResult = deriveTarget(state.targetFileName);
	const indexedFiles = targetResult.target && !state.contentFiles.some((file) => file.path === targetResult.target?.path)
		? [
			...state.contentFiles.filter((file) => file.collection === 'blog'),
			{ path: targetResult.target.path, collection: 'blog' } satisfies ContentFile,
			...state.contentFiles.filter((file) => file.collection === 'docs'),
		]
		: state.contentFiles;
	const linkResult = targetResult.target
		? normalizeMarkdownLinks(state.body, targetResult.target.path, createContentIndex(indexedFiles))
		: { content: state.body, unresolvedLinks: [] };
	const linkIssues = linkResult.unresolvedLinks.map((href): AdminBlockingIssue => ({
		code: 'unresolved_markdown_link',
		message: `无法匹配站内 Markdown 链接：${href}`,
	}));
	const blockingIssues = Object.freeze([...state.issues, ...metadataIssues(normalizedMetadata), ...targetResult.issues, ...linkIssues]);
	const requirements = publishingRequirements(normalizedMetadata, state.body);
	return Object.freeze({
		sourceFileName: state.sourceFileName,
		sourceText: state.sourceText,
		targetFileName: state.targetFileName,
		titleFromFileName: state.titleFromFileName,
		metadata: normalizedMetadata,
		body: linkResult.content,
		contentFiles: state.contentFiles,
		target: targetResult.target,
		blockingIssues,
		publishingRequirements: requirements,
		ready: blockingIssues.length === 0 && requirements.length === 0,
	});
};

export const createAdminDraft = (sourceFileName: string, sourceText: string, options: AdminDraftImportOptions = {}): AdminDraft => {
	const original = parseSource(sourceText);
	const targetFileName = sourceFileName.replace(/\.md$/iu, '.md');
	const parsed = original.issues.some((issue) => issue.code !== 'missing_frontmatter')
		? original
		: parseSource(normalizeFrontmatter(original.sourceText, {
			fileName: targetFileName, collection: 'blog',
		}));
	return buildDraft({
		...parsed, sourceFileName, targetFileName,
		titleFromFileName: !isValidTitle(original.metadata.title),
		contentFiles: options.contentFiles ?? [],
	});
};

export const updateAdminDraft = (draft: AdminDraft, update: AdminDraftUpdate): AdminDraft => {
	const parsed = parseSource(draft.sourceText);
	const targetFileName = update.targetFileName ?? draft.targetFileName;
	const titleFromFileName = draft.titleFromFileName && !Object.hasOwn(update.metadata ?? {}, 'title');
	const metadata = { ...draft.metadata, ...update.metadata };
	return buildDraft({
		...parsed,
		sourceFileName: draft.sourceFileName,
		targetFileName,
		titleFromFileName,
		contentFiles: draft.contentFiles,
		metadata: titleFromFileName ? { ...metadata, title: getFileTitle(targetFileName) } : metadata,
	});
};
