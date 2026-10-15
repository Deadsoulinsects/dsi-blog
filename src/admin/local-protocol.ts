import type { LocalInspection, LocalJob } from '../../scripts/admin/local.mjs';

const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === 'string');
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const isInspection = (value: unknown): value is LocalInspection => {
	if (!record(value) || !record(value.counts) || !record(value.metadata) || !record(value.formal)
		|| !record(value.instructions)) return false;
	const counts = value.counts;
	const instructions = value.instructions;
	return ['id', 'note', 'sourceRoot', 'sourceText'].every((key) => typeof value[key] === 'string')
		&& typeof value.canPrepare === 'boolean' && strings(value.errors) && strings(value.warnings)
		&& Object.values(value.counts).every(number)
		&& ['references', 'resources', 'galleries', 'videos', 'matched', 'missing'].every((key) => number(counts[key]))
		&& ['official', 'source'].includes(String(value.metadata.owner)) && strings(value.metadata.requirements)
		&& typeof value.formal.ready === 'boolean' && typeof value.formal.rendered === 'boolean'
		&& typeof value.formal.path === 'string' && typeof value.formal.url === 'string'
		&& /^\/blog\/[^/?#]+\/$/u.test(value.formal.url) && strings(value.formal.errors)
		&& ['sync', 'normalize', 'build'].every((key) => typeof instructions[key] === 'string')
		&& Array.isArray(value.references) && value.references.every((ref) => record(ref)
			&& ['body', 'gallery'].includes(String(ref.usage)) && ['image', 'video'].includes(String(ref.kind)))
		&& Array.isArray(value.resources) && value.resources.every((resource) => record(resource)
			&& typeof resource.path === 'string' && typeof resource.message === 'string'
			&& ['matched', 'missing', 'error'].includes(String(resource.status))
			&& ['reused', 'convert', 'deduplicated', 'blocked'].includes(String(resource.action))
			&& ['image', 'video'].includes(String(resource.kind)));
};

export const isJob = (value: unknown): value is LocalJob => {
	if (!record(value)) return false;
	const result = value.result;
	const preparation = record(result) ? result.preparation : null;
	return typeof value.id === 'string' && /^[a-f0-9-]{36}$/u.test(value.id)
		&& ['queued', 'running', 'succeeded', 'failed'].includes(String(value.state))
		&& number(value.revision) && strings(value.errors)
		&& (value.error === null || typeof value.error === 'string')
		&& (value.report === null || isInspection(value.report))
		&& (value.progress === null || (record(value.progress) && number(value.progress.completed)
			&& number(value.progress.total) && ['reused', 'converted', 'deduplicated'].includes(String(value.progress.action))))
		&& (result === null || (record(preparation)
			&& ['converted', 'reused', 'deduplicated'].every((key) => number(preparation[key]))));
};

export const localRequest = async (path: string, selection?: object): Promise<unknown> => {
	const response = await fetch(`/__admin-local/${path}`, {
		method: selection ? 'POST' : 'GET',
		credentials: 'same-origin',
		headers: selection ? { 'Content-Type': 'application/json' } : {},
		...(selection ? { body: JSON.stringify(selection) } : {}),
		signal: AbortSignal.timeout(path.startsWith('jobs/') ? 35_000 : 120_000),
	});
	const data: unknown = await response.json();
	if (!response.ok) throw new Error(record(data) && typeof data.error === 'string' ? data.error : `本地服务 HTTP ${response.status}`);
	return data;
};
