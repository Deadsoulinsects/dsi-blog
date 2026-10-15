import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRepositoryGit } from './admin/workspace-git.mjs';
import { atomicJson, command, hash } from './admin/workspace-io.mjs';

const root = await fs.mkdtemp('D:/ai-output/DSI Admin开发/回归/recovery-');
const repoRoot = path.join(root, 'repo');
const dataRoot = path.join(root, 'data');
const relative = 'src/content/blog/recovery.md';
const target = path.join(repoRoot, relative);
const journalFile = path.join(dataRoot, 'config/commit-journal.json');
const before = Buffer.from('before\n');
const after = Buffer.from('after\n');
await fs.mkdir(path.dirname(target), { recursive: true });
const git = (args) => command('git', args, { cwd: repoRoot });
await git(['init']);
await git(['config', 'user.name', 'Recovery fixture']);
await git(['config', 'user.email', 'recovery@example.invalid']);
await git(['config', 'core.autocrlf', 'false']);
await fs.writeFile(target, before);
await git(['add', '--', relative]);
await git(['commit', '-m', 'Fixture baseline']);
const baseline = (await git(['rev-parse', 'HEAD'])).stdout.trim();
const journal = () => ({
	state: 'committing', head: baseline,
	files: [{ path: relative, before: before.toString('base64'), beforeHash: hash(before), afterHash: hash(after) }],
});
const engine = createRepositoryGit({ repoRoot, dataRoot });

// The crash occurs after owned writes and staging, before a commit exists.
await fs.writeFile(target, after);
await git(['add', '--', relative]);
await atomicJson(journalFile, journal());
await engine.recover();
assert.deepEqual(await fs.readFile(target), before);
assert.equal((await git(['diff', '--cached', '--name-only'])).stdout, '');
assert.equal(JSON.parse(await fs.readFile(journalFile, 'utf8')).state, 'rolled-back');

// An external edit after the interrupted write must never be overwritten.
const external = Buffer.from('external edit\n');
await fs.writeFile(target, external);
await atomicJson(journalFile, journal());
assert.equal((await engine.recover()).length, 1);
assert.deepEqual(await fs.readFile(target), external);
assert.equal(JSON.parse(await fs.readFile(journalFile, 'utf8')).state, 'needs-review');

// The commit completed, but the process died before recording its SHA.
await fs.writeFile(target, after);
await git(['add', '--', relative]);
await git(['commit', '-m', 'Completed before crash']);
const completed = (await git(['rev-parse', 'HEAD'])).stdout.trim();
await atomicJson(journalFile, journal());
await engine.recover();
const recovered = JSON.parse(await fs.readFile(journalFile, 'utf8'));
assert.equal(recovered.state, 'committed');
assert.equal(recovered.sha, completed);
assert.equal(recovered.recovered, true);
await engine.recover();
assert.equal((await git(['rev-parse', 'HEAD'])).stdout.trim(), completed);
assert.equal((await git(['rev-list', '--count', 'HEAD'])).stdout.trim(), '2');

const topicRelative = 'src/data/topics.json';
const topicTarget = path.join(repoRoot, topicRelative);
await fs.mkdir(path.dirname(topicTarget), { recursive: true });
const topicBefore = Buffer.from('{"fixture":{"description":"before"}}\n');
const topicAfter = Buffer.from('{"fixture":{"description":"after"}}\n');
await fs.writeFile(topicTarget, topicBefore);
await fs.writeFile(topicTarget, topicAfter);
await atomicJson(journalFile, {
	state: 'writing', head: completed,
	files: [{ path: topicRelative, before: topicBefore.toString('base64'), beforeHash: hash(topicBefore), afterHash: hash(topicAfter) }],
});
await engine.recover();
assert.deepEqual(await fs.readFile(topicTarget), topicBefore, '专题描述提交中断可安全恢复原文件');

await atomicJson(path.join(root, '恢复验收.json'), {
	passed: true, ownedWriteRollback: true, externalEditPreserved: true,
	completedCommitReconciled: true, noDuplicateCommit: true, baseline, completed,
});
console.log(`RECOVERY_PASS ${root}`);
