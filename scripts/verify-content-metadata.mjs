import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { isValidCompletionDate, mergeBlogSource, normalizeCompletionDate, normalizeFrontmatter, normalizeOptionalDate, splitMarkdownSource, stripArticleHeader } from '../src/shared/content/frontmatter.mjs';
import { blogSchema } from './admin/metadata.mjs';

const metadata = (text) => parse(splitMarkdownSource(text).frontmatter);
const note = (fields, body = '## 正文\n手写内容\n') => `---\n${fields}\n---\n\n${body}`;
const legacy = note('title: 旧标题\ndescription: 旧摘要\npubDate: 2024-05-06\nmediaId: stable\ntopicPath: [旧专题, 子专题]\ncustom: 保留');
const header = '<!-- article-header:start -->\n\n# 新标题\n\n> *新摘要*\n<!-- article-header:end -->\n\n';

const migrated = normalizeFrontmatter(legacy, { fileName: '文章.md', collection: 'blog' });
assert.equal(metadata(migrated).completion_date, '2024-05-06');
assert.equal(metadata(migrated).pubDate, undefined);
assert.equal(splitMarkdownSource(migrated).body, splitMarkdownSource(legacy).body);
assert.equal(normalizeFrontmatter(migrated, { fileName: '文章.md', collection: 'blog' }), migrated);

const source = note('title: 新标题\ndescription: 新摘要\ncompletion_date: 2026-05-09\nstart_date:\nend_date:\ntopic: 新专题\ntags: [设计]', header + '## 正文\n手写内容\n');
const merged = mergeBlogSource(source, legacy, '文章.md');
assert.deepEqual(metadata(merged), {
	title: '新标题', description: '新摘要', completion_date: '2026-05-09',
	mediaId: 'stable', custom: '保留', topic: '新专题', tags: ['设计'], start_date: null, end_date: null,
});
assert.equal(splitMarkdownSource(merged).body, '\n## 正文\n手写内容\n');
assert.equal(mergeBlogSource(source, merged, '文章.md'), merged);
assert.equal(stripArticleHeader(header.replaceAll('\n', '\r\n') + '正文'), '正文');
assert.equal(stripArticleHeader('# 手写标题\n正文'), '# 手写标题\n正文');
assert.throws(() => stripArticleHeader('正文\n' + header), TypeError);
assert.throws(() => stripArticleHeader('<!-- article-header:start -->\n# 标题'), TypeError);
assert.throws(() => stripArticleHeader(header + header), TypeError);

for (const value of ['', null, '2026-02-30', '2026-5-9', '2026/05/09']) assert.equal(isValidCompletionDate(value), false);
assert.equal(isValidCompletionDate('2024-02-29'), true);
assert.equal(normalizeCompletionDate('2026/05/09'), '2026-05-09');
assert.equal(normalizeCompletionDate(' 2024-02-29 '), '2024-02-29');
for (const value of ['', null, '2026-02-30', '2026-5-9', '2026/02/30', '2026/5/9', 'bad']) assert.equal(normalizeCompletionDate(value), null);
assert.equal(mergeBlogSource(note('title: 新标题\ndescription: 新摘要\ncompletion_date: 2026/05/09\nstart_date:\nend_date:\ntopic: 新专题\ntags: [设计]', header + '## 正文\n手写内容\n'), legacy, '文章.md'), merged);
const slashedDraft = note('title: 未完成\ncompletion_date: 2026/05/09', '正文');
const slashedNormalized = normalizeFrontmatter(slashedDraft, { fileName: '文章.md', collection: 'blog' });
assert.equal(metadata(slashedNormalized).completion_date, '2026-05-09');
assert.equal(normalizeFrontmatter(slashedNormalized, { fileName: '文章.md', collection: 'blog' }), slashedNormalized);
assert.equal(normalizeOptionalDate('2026/05/09'), '2026-05-09');
assert.equal(normalizeOptionalDate(null), null);
assert.equal(normalizeOptionalDate(''), '');
assert.equal(normalizeOptionalDate('bad'), 'bad');
const boundsSlash = note('title: 新标题\ndescription: 新摘要\ncompletion_date: 2026-05-09\nstart_date: 2024/04/01\nend_date: 2024/05/02\ntopic: 新专题\ntags: [设计]', header + '## 正文\n手写内容\n');
const boundsCanonical = note('title: 新标题\ndescription: 新摘要\ncompletion_date: 2026-05-09\nstart_date: 2024-04-01\nend_date: 2024-05-02\ntopic: 新专题\ntags: [设计]', header + '## 正文\n手写内容\n');
assert.equal(mergeBlogSource(boundsSlash, legacy, '文章.md'), mergeBlogSource(boundsCanonical, legacy, '文章.md'));
const boundsDraft = note('title: 未完成\ncompletion_date: 2026-05-09\nstart_date: 2024/04/01\nend_date: null', '正文');
const boundsNormalized = normalizeFrontmatter(boundsDraft, { fileName: '文章.md', collection: 'blog' });
assert.equal(metadata(boundsNormalized).start_date, '2024-04-01');
assert.equal(metadata(boundsNormalized).end_date, null);
assert.equal(normalizeFrontmatter(boundsNormalized, { fileName: '文章.md', collection: 'blog' }), boundsNormalized);
assert.throws(() => mergeBlogSource(note('title: 未完成\ncompletion_date:'), legacy, '未完成.md'), /completion_date/);
assert.throws(() => mergeBlogSource(note('title: 新文章'), '', '新文章.md'), /completion_date/);
assert.equal(metadata(normalizeFrontmatter(note('title: 未完成\npubDate: 2024-05-06\ncompletion_date:'), { fileName: '文章.md', collection: 'blog' })).completion_date, null);
assert.equal(normalizeFrontmatter(legacy, { fileName: '文档.md', collection: 'docs', pubDate: '2026-10-10' }), legacy);
const valid = metadata(merged);
assert.equal(blogSchema.safeParse(valid).success, true);
assert.equal(blogSchema.safeParse({ ...valid, end_date: '' }).success, true);
for (const fields of [{ start_date: '2026-02-30' }, { end_date: 'bad' }, { tags: '标签' }, { topicPath: [''] }]) {
	assert.equal(blogSchema.safeParse({ ...valid, ...fields }).success, false);
}
console.log('[pass] Blog completion dates, legacy migration, source ownership, managed headers, missing-date rejection and unchanged Docs metadata');
