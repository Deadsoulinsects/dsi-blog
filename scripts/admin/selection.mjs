import { lstat, realpath } from 'node:fs/promises';
import { basename, isAbsolute, relative, sep } from 'node:path';

const contains = (root, file) => {
	const offset = relative(root, file);
	return offset === '' || (offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset));
};
const fail = (status, message) => Object.assign(new Error(message), { status });
const unsafeControl = (value) => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

/** Parse explicit source/tool paths; callers cannot choose a repository write destination. */
export async function selectLocalSource(input, storeRoot) {
	if (!input || typeof input !== 'object' || Array.isArray(input)
		|| Object.keys(input).some((key) => !['note', 'sourceRoot', 'id', 'ffmpeg', 'ffprobe'].includes(key)))
		throw fail(400, 'Only note, sourceRoot, id, ffmpeg and ffprobe are accepted.');
	for (const field of ['note', 'sourceRoot']) {
		if (typeof input[field] !== 'string' || !isAbsolute(input[field]) || unsafeControl(input[field]))
			throw fail(400, `${field} must be an absolute local path.`);
		if (/^(?:\\|\/\/)/u.test(input[field])) throw fail(400, 'Network paths are not allowed.');
	}
	const name = basename(input.note);
	if (input.id !== undefined && typeof input.id !== 'string') throw fail(400, 'id must be text.');
	const id = input.id || name.slice(0, -3);
	if (typeof id !== 'string') throw fail(400, 'id must be text.');
	if (!name.endsWith('.md') || !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,99}$/u.test(id)
		|| /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(id))
		throw fail(400, 'Select a Markdown basename with a safe media document id.');
	const noteStat = await lstat(input.note), rootStat = await lstat(input.sourceRoot);
	if (!noteStat.isFile() || noteStat.isSymbolicLink() || !rootStat.isDirectory() || rootStat.isSymbolicLink())
		throw fail(400, 'Select a regular note and attachment directory, not symlinks.');
	if (noteStat.size > 4 * 1024 * 1024) throw fail(413, 'Selected Markdown exceeds 4 MiB.');
	const note = await realpath(input.note), sourceRoot = await realpath(input.sourceRoot);
	const repository = await realpath(storeRoot);
	if (contains(repository, note) || contains(repository, sourceRoot) || contains(sourceRoot, repository))
		throw fail(400, 'Original sources and the repository store must be separate.');
	const tools = {};
	for (const tool of ['ffmpeg', 'ffprobe']) {
		if (input[tool] === '' || input[tool] === undefined) continue;
		const executable = input[tool];
		if (typeof executable !== 'string' || !isAbsolute(executable) || unsafeControl(executable)
			|| ![tool, `${tool}.exe`].includes(basename(executable).toLowerCase()))
			throw fail(400, `${tool} must be an explicit absolute ${tool} executable path, not command arguments.`);
		if (!(await lstat(executable)).isFile()) throw fail(400, `${tool} is not a regular executable.`);
		tools[tool] = await realpath(executable);
	}
	return { id, name, note, sourceRoot, ...tools };
}
