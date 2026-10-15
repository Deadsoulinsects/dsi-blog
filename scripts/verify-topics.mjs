import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real TypeScript utilities with the repository's existing
// compiler, without adding a runner dependency or writing generated files.
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Map();
function load(file) {
	if (modules.has(file)) return modules.get(file).exports;
	if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'));
	const module = { exports: {} };
	modules.set(file, module);
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	});
	runInThisContext(`(function(require, module, exports) {${outputText}\n})`, { filename: file })(
		(specifier) => load(resolve(dirname(file), specifier.endsWith('.json') ? specifier : `${specifier}.ts`)), module, module.exports,
	);
	return module.exports;
}
const { getTopicPath, getTopicSlug, getTopicGroups, getChildTopics, getFeaturedTopicGroups } = load(resolve(root, 'src/utils/topics.ts'));
const { topicMeta, getPinnedTopicPath } = load(resolve(root, 'src/data/topics.ts'));
assert.deepEqual(topicMeta, JSON.parse(readFileSync(resolve(root, 'src/data/topics.json'), 'utf8')));
for (const metadata of Object.values(topicMeta)) delete metadata.pinned;
assert.equal(getPinnedTopicPath(), null);
topicMeta.Root = { description: 'root-description-fixture' };
topicMeta['Root/Child'] = { description: 'child-description-fixture' };
const { getPublicArticleMetadata } = load(resolve(root, 'src/utils/content-index.ts'));
const post = (id, data) => ({
	id,
	filePath: 'D:/private/notes/source.md',
	body: 'PRIVATE BODY',
	data: {
		title: id, description: '', completion_date: new Date('2026-10-02T00:00:00Z'),
		topic: '', sourcePath: 'D:/private/notes/source.md', ...data,
	},
});
assert.deepEqual(getTopicPath({ topic: ' Legacy ' }), ['Legacy']);
assert.deepEqual(getTopicPath({ topic: ' Legacy ', topicPath: [] }), ['Legacy']);
assert.deepEqual(getTopicPath({ topic: 'Old', topicPath: [' Root ', ' Child '] }), ['Root', 'Child']);
assert.equal(getTopicSlug(['Obsidian']), 'obsidian');
assert.equal(getTopicSlug(['Root', 'A Child']), 'root/a-child');

const posts = [
	post('legacy', { topic: 'Legacy' }),
	post('root-direct', { topicPath: ['Root'] }),
	post('child', { topicPath: ['Root', 'Child'] }),
	post('grandchild', { topicPath: ['Root', 'Child', 'Leaf'] }),
	post('sibling', { topicPath: ['Root', 'Sibling'] }),
	post('other-child', { topicPath: ['Other', 'Child'] }),
	post('none', {}),
];
const groups = getTopicGroups([...posts, posts[3]]);
const rootGroup = groups.find((group) => group.slug === 'root');
assert.equal(rootGroup.description, 'root-description-fixture');
assert.equal(groups.find((group) => group.slug === 'root/child').description, 'child-description-fixture');
assert.equal(groups.find((group) => group.slug === 'other/child').description, undefined, '同名子专题按完整路径隔离描述');
topicMeta['Root/Child'].description = '';
assert.equal(getTopicGroups(posts).find((group) => group.slug === 'root/child').description, undefined);
assert.deepEqual(rootGroup.posts.map((item) => item.id), ['root-direct', 'child', 'grandchild', 'sibling']);
assert.deepEqual(rootGroup.directPosts.map((item) => item.id), ['root-direct']);
assert.deepEqual(getChildTopics(groups, ['Root']).map((group) => group.name), ['Child', 'Sibling']);
assert.deepEqual(getChildTopics(groups, ['Root', 'Child']).map((group) => group.name), ['Leaf']);
assert.deepEqual(groups.find((group) => group.slug === 'root/child').posts.map((item) => item.id), ['child', 'grandchild']);
assert.deepEqual(groups.find((group) => group.slug === 'other/child').posts.map((item) => item.id), ['other-child']);
assert.equal(groups.find((group) => group.name === 'Legacy').slug, 'legacy');
assert.deepEqual(groups.filter((group) => group.path.length === 1).map((group) => group.name), ['Legacy', 'Other', 'Root']);

const featuredGroups = getTopicGroups([
	post('alpha', { topic: 'Alpha', completion_date: new Date('2026-09-01') }),
	post('gamma', { topic: 'Gamma', completion_date: new Date('2026-10-10') }),
	post('beta-old', { topic: 'Beta', completion_date: new Date('2026-10-01') }),
	post('beta-latest', { topicPath: ['Beta', 'Child'], completion_date: new Date('2026-10-12') }),
]);
const featuredNames = (pin) => getFeaturedTopicGroups(featuredGroups, pin).map((group) => group.name);
assert.deepEqual(featuredNames(null), ['Beta', 'Gamma'], '最近专题包含后代文章日期，不依赖输入顺序');
assert.deepEqual(featuredNames(['Alpha']), ['Alpha', 'Beta']);
assert.deepEqual(featuredNames(['Beta']), ['Beta', 'Gamma'], '最近专题与置顶去重');
assert.deepEqual(featuredNames(['Missing']), ['Beta', 'Gamma'], '失效置顶自动补位');
assert.deepEqual(featuredNames(['Beta', 'Child']), ['Beta', 'Gamma'], '文章页保持一级专题');
assert.deepEqual(getFeaturedTopicGroups(featuredGroups.filter((group) => group.name === 'Alpha'), null).map((group) => group.name), ['Alpha']);
assert.deepEqual(getFeaturedTopicGroups([], null), []);
assert.deepEqual(getFeaturedTopicGroups([{ name: 'Empty', path: ['Empty'], slug: 'empty', posts: [], directPosts: [] }], ['Empty']), []);
topicMeta.Alpha = { description: '', pinned: true };
assert.deepEqual(getPinnedTopicPath(), ['Alpha']);
assert.deepEqual(getFeaturedTopicGroups(featuredGroups).map((group) => group.name), ['Alpha', 'Beta']);
delete topicMeta.Alpha.pinned;
const tiedGroups = getTopicGroups([post('echo', { topic: 'Echo' }), post('delta', { topic: 'Delta' })]);
assert.deepEqual(getFeaturedTopicGroups(tiedGroups, null).map((group) => group.name), ['Delta', 'Echo']);

const metadata = getPublicArticleMetadata(posts, '/site/');
assert.equal(metadata[0].path, '/site/blog/legacy/');
assert.equal(metadata[3].path, '/site/blog/grandchild/');
assert.deepEqual(metadata[3].topicPath, ['Root', 'Child', 'Leaf']);
assert.equal(metadata[3].topic, 'Root');
assert.equal(metadata[3].completion_date, '2026-10-02');
assert.deepEqual(Object.keys(metadata[3]), ['id', 'path', 'title', 'description', 'completion_date', 'topic', 'topicPath']);
assert.ok(!JSON.stringify(metadata).includes('private'));
assert.ok(!JSON.stringify(metadata).includes('PRIVATE BODY'));
console.log('[pass] Stable topics, descriptions, pinned-first two-slot recency fallback, deduplication and public metadata whitelist');
