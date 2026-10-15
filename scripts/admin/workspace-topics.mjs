import path from 'node:path';
import { hash, optionalBytes } from './workspace-io.mjs';

const relative = 'src/data/topics.json';
const keyOf = (topicPath) => {
	if (!Array.isArray(topicPath) || !topicPath.length || topicPath.some((part) =>
		typeof part !== 'string' || !part.trim() || part !== part.trim() || /[/\\?#%]/u.test(part)
		|| [...part].some((character) => character.charCodeAt(0) < 32))) {
		throw new Error('专题路径包含空层级或非法字符。');
	}
	return topicPath.join('/');
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Topic edits stay in workspace data until the existing explicit Git confirmation. */
export function createWorkspaceTopics(state) {
	const official = async () => {
		const bytes = await optionalBytes(path.join(state.configuration.repoRoot, relative));
		const values = bytes ? JSON.parse(bytes.toString('utf8')) : {};
		if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('专题描述配置必须是 JSON 对象。');
		for (const [key, value] of Object.entries(values)) {
			keyOf(key.split('/'));
			if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.description !== 'string') {
				throw new Error(`专题描述配置无效：${key}`);
			}
			if (value.pinned !== undefined && typeof value.pinned !== 'boolean' || value.pinned && key.split('/').length !== 1) {
				throw new Error(`置顶配置必须对应一个一级专题：${key}`);
			}
		}
		if (Object.values(values).filter((value) => value.pinned).length > 1) throw new Error('只能设置一个置顶专题。');
		return { values, bytes, hash: bytes ? hash(bytes) : null };
	};
	const changedPaths = () => Object.keys(state.topics.values).filter((key) => !same(state.topics.values[key], state.topics.baseline[key]));
	async function read() {
		const current = await official();
		if (!state.topics || !changedPaths().length && current.hash !== state.topics.baseHash) {
			state.topics = {
				revision: (state.topics?.revision || 0) + 1, baseHash: current.hash,
				baseline: structuredClone(current.values), values: current.values,
			};
		}
		return current;
	}
	function catalog(articles) {
		const paths = new Set();
		for (const key of Object.keys(state.topics.values)) {
			const parts = key.split('/');
			for (let depth = 1; depth <= parts.length; depth++) paths.add(parts.slice(0, depth).join('/'));
		}
		for (const article of articles) {
			const parts = article.topicPath?.length ? article.topicPath : article.topic ? [article.topic] : [];
			for (let depth = 1; depth <= parts.length; depth++) paths.add(parts.slice(0, depth).join('/'));
		}
		return [...paths].sort((left, right) => left.localeCompare(right, 'zh-CN'));
	}
	return {
		async view(articles) {
			if (!state.configuration.repoRoot) return { revision: 0, entries: [], pinnedPath: null, dirtyPaths: [], conflict: false };
			const current = await read();
			return {
				revision: state.topics.revision,
				entries: catalog(articles).map((key) => ({ path: key.split('/'), description: state.topics.values[key]?.description || '' })),
				pinnedPath: Object.keys(state.topics.values).find((key) => state.topics.values[key].pinned)?.split('/') || null,
				dirtyPaths: changedPaths().map((key) => key.split('/')),
				conflict: current.hash !== state.topics.baseHash,
			};
		},
		async update(values, articles) {
			const current = await read();
			if (values.revision !== state.topics.revision) throw new Error('专题描述版本已变化，请重新读取后保存。');
			if (current.hash !== state.topics.baseHash) throw new Error('仓库专题描述已被外部修改，本地草稿仍保留，请先处理冲突。');
			const key = keyOf(values.path);
			if (!catalog(articles).includes(key)) throw new Error('专题不存在，请刷新列表。');
			if (typeof values.description !== 'string' || values.description.length > 10000) throw new Error('专题描述必须是不超过 10000 字符的文本。');
			if (values.pinned !== undefined && (typeof values.pinned !== 'boolean' || values.path.length !== 1)) throw new Error('置顶设置只接受一级专题与布尔值。');
			const description = values.description.trim();
			const next = structuredClone(state.topics.values);
			next[key] = { ...next[key], description };
			if (values.pinned === true) {
				for (const value of Object.values(next)) delete value.pinned;
				next[key].pinned = true;
			} else if (values.pinned === false) delete next[key].pinned;
			for (const [entryKey, value] of Object.entries(next)) {
				if (!value.description && !Object.hasOwn(state.topics.baseline, entryKey) && Object.keys(value).length === 1) delete next[entryKey];
			}
			if (same(next, state.topics.values)) return;
			state.topics.values = next;
			state.topics.revision += 1;
		},
		async reset() {
			const current = await official();
			state.topics = {
				revision: (state.topics?.revision || 0) + 1, baseHash: current.hash,
				baseline: structuredClone(current.values), values: current.values,
			};
		},
		async change() {
			const current = await read();
			if (!changedPaths().length) return null;
			if (current.hash !== state.topics.baseHash) throw new Error('仓库专题描述已变化，请处理本地草稿冲突后再提交。');
			return {
				path: relative, kind: 'topics', bytes: Buffer.from(`${JSON.stringify(state.topics.values, null, '\t')}\n`),
				before: current.bytes, beforeHash: current.hash, revision: state.topics.revision,
			};
		},
		async proof(file) {
			if (!file) return;
			const current = await official();
			if (state.topics.revision !== file.revision || current.hash !== file.beforeHash) throw new Error('专题描述差异已失效，请重新确认。');
		},
		committed(file) {
			if (!file) return;
			state.topics.baseHash = hash(file.bytes);
			state.topics.baseline = structuredClone(state.topics.values);
		},
	};
}
