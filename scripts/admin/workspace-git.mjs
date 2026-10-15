import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, optionalBytes, atomicJson, hash, contains } from './workspace-io.mjs';

export function createRepositoryGit({ repoRoot, dataRoot, executable = 'git', getToken = () => '', author = {} }) {
	const auth = () => {
		const token = getToken();
		return token ? {
			GIT_CONFIG_COUNT: '1',
			GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
			GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
		} : {};
	};
	const run = (args, options = {}) => command(executable, args, {
		cwd: repoRoot, env: { ...auth(), GIT_TERMINAL_PROMPT: '0', GIT_TRACE: '0', GIT_CURL_VERBOSE: '0' }, ...options,
	});
	const revision = async (ref) => {
		const result = await run(['rev-parse', '--verify', ref], { allowFailure: true });
		return result.code ? null : result.stdout.trim();
	};
	const blobs = new Map();
	const blob = async (ref, file) => {
		if (ref === null || ref === undefined) return null;
		const key = `${ref}:${file}`;
		if (ref && blobs.has(key)) return blobs.get(key);
		const result = await run(['show', ref ? `${ref}:${file}` : `:${file}`], { allowFailure: true });
		const value = result.code ? null : result.stdoutBytes;
		if (ref) blobs.set(key, value);
		return value;
	};
	const journalFile = path.join(dataRoot, 'config', 'commit-journal.json');

	async function destination(relative) {
		const absolute = path.resolve(repoRoot, relative);
		if (!contains(repoRoot, absolute) || !/^(src\/content\/blog\/.+\.md|src\/data\/(?:media-manifest|topics)\.json|public\/media\/[a-f\d]+\.(webp|mp4))$/u.test(relative)) {
			throw new Error(`不允许写入提交闭包之外的文件：${relative}`);
		}
		let current = repoRoot;
		for (const part of relative.split('/')) {
			current = path.join(current, part);
			const stat = await fs.lstat(current).catch((error) => {
				if (error.code === 'ENOENT') return null;
				throw error;
			});
			if (stat?.isSymbolicLink()) throw new Error(`提交目标不能是符号链接：${relative}`);
		}
		return absolute;
	}

	async function unstageOwn(files, head) {
		const own = [];
		for (const file of files) {
			const staged = await blob('', file.path);
			if (staged && hash(staged) === file.afterHash) own.push(file.path);
		}
		if (!own.length) return;
		await run(head ? ['restore', '--staged', '--', ...own] : ['rm', '--cached', '--ignore-unmatch', '--', ...own]);
	}

	async function rollback(journal) {
		const conflicts = [];
		for (const file of journal.files) {
			const target = await destination(file.path);
			const current = await optionalBytes(target);
			if ((current ? hash(current) : null) !== file.afterHash) {
				if ((current ? hash(current) : null) !== file.beforeHash) conflicts.push(file.path);
				continue;
			}
			if (file.before === null) await fs.rm(target, { force: true });
			else await fs.writeFile(target, Buffer.from(file.before, 'base64'));
		}
		await unstageOwn(journal.files, journal.head);
		journal.state = conflicts.length ? 'needs-review' : 'rolled-back';
		journal.conflicts = conflicts;
		await atomicJson(journalFile, journal);
		return conflicts;
	}

	async function recover() {
		const bytes = await optionalBytes(journalFile);
		if (!bytes) return [];
		const journal = JSON.parse(bytes);
		if (!['writing', 'committing'].includes(journal.state)) return journal.state === 'needs-review' ? [`上次提交存在需要核对的外部修改：${journal.conflicts.join('、')}`] : [];
		const head = await revision('HEAD');
		if (head && head !== journal.head) {
			let matches = true;
			for (const file of journal.files) {
				const committed = await blob(head, file.path);
				if (!committed || hash(committed) !== file.afterHash) matches = false;
			}
			if (matches) {
				await atomicJson(journalFile, { ...journal, state: 'committed', sha: head, recovered: true });
				return ['上次提交已经完成，已按实际 Git 结果恢复，没有重复提交。'];
			}
			await atomicJson(journalFile, { ...journal, state: 'needs-review', conflicts: journal.files.map((file) => file.path) });
			return ['上次提交期间 Git 历史发生变化，请先核对提交记录。程序没有重写历史。'];
		}
		const conflicts = await rollback(journal);
		return [conflicts.length ? '上次提交中断且存在外部修改，请核对恢复记录。' : '上次提交中断，程序已撤回自身未完成的写入；草稿仍保留。'];
	}

	async function commit({ files, head, message }) {
		if (typeof message !== 'string' || !message.trim() || message.length > 8192) throw new Error('请填写不超过 8192 字符的自定义提交信息。');
		if (await revision('HEAD') !== head) throw new Error('Git HEAD 已变化，请重新检查差异。');
		if ((await run(['diff', '--cached', '--name-only', '-z'])).stdout) throw new Error('Git 暂存区已有内容，请先处理；Admin 不会夹带或清除它。');
		if (!files.length) throw new Error('当前没有可提交的变化。');
		const identityName = author.name || (await run(['config', 'user.name'], { allowFailure: true })).stdout.trim();
		const identityEmail = author.email || (await run(['config', 'user.email'], { allowFailure: true })).stdout.trim();
		if (!identityName || !identityEmail) throw new Error('请在设置中填写 Git 提交作者与邮箱。');
		const journal = { state: 'writing', head, message, createdAt: new Date().toISOString(), files: [] };
		for (const file of files) {
			const target = await destination(file.path);
			const before = await optionalBytes(target);
			if ((before ? hash(before) : null) !== file.beforeHash) throw new Error(`正式文件已变化：${file.path}`);
			journal.files.push({ path: file.path, before: before?.toString('base64') ?? null, beforeHash: file.beforeHash, afterHash: hash(file.bytes) });
		}
		await atomicJson(journalFile, journal);
		try {
			for (const file of files) {
				const target = await destination(file.path);
				await fs.mkdir(path.dirname(target), { recursive: true });
				await fs.writeFile(target, file.bytes);
			}
			await run(['add', '--', ...files.map((file) => file.path)]);
			const indexed = (await run(['diff', '--cached', '--name-only', '-z'])).stdout.split('\0').filter(Boolean);
			if (indexed.some((file) => !files.some((selected) => selected.path === file))) throw new Error('提交期间有外部内容进入暂存区，请重新核对。');
			const messageFile = path.join(dataRoot, 'config', 'commit-message.txt');
			await fs.writeFile(messageFile, message);
			journal.state = 'committing';
			await atomicJson(journalFile, journal);
			await run(['-c', `user.name=${identityName}`, '-c', `user.email=${identityEmail}`, 'commit', '-F', messageFile, '--only', '--', ...files.map((file) => file.path)]);
			const sha = await revision('HEAD');
			await atomicJson(journalFile, { ...journal, state: 'committed', sha });
			return sha;
		} catch (error) {
			if (await revision('HEAD') === head) await rollback(journal);
			else await recover();
			throw error;
		}
	}

	async function pending() {
		const head = await revision('HEAD');
		const branch = (await run(['symbolic-ref', '--short', 'HEAD'], { allowFailure: true })).stdout.trim();
		const remote = (await run(['remote', 'get-url', 'origin'], { allowFailure: true })).stdout.trim();
		const remoteHead = branch ? await revision(`refs/remotes/origin/${branch}`) : null;
		const errors = [];
		if (!head) errors.push('仓库还没有本地提交。');
		if (!branch) errors.push('当前不是可发布的本地分支。');
		if (!remote) errors.push('仓库没有 origin 远端。');
		const commits = head ? (await run(['rev-list', '--reverse', remoteHead ? `${remoteHead}..${head}` : head])).stdout.trim().split('\n').filter(Boolean) : [];
		const ahead = [];
		for (const sha of commits) {
			const message = (await run(['show', '-s', '--format=%B', sha])).stdout.trim();
			const paths = (await run(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', sha])).stdout.split('\0').filter(Boolean);
			ahead.push({ sha, message, paths });
		}
		return { head, branch, remote, remoteHead, ahead, errors };
	}

	async function push(plan) {
		if (plan.errors.length || !plan.ahead.length) throw new Error(plan.errors.join('\n') || '没有待推送提交。');
		await run(['fetch', 'origin'], { timeout: 120_000 });
		const current = await pending();
		if (current.head !== plan.head || current.remoteHead !== plan.remoteHead || current.remote !== plan.remote) {
			throw new Error('本地或远端版本已变化，请重新确认发布清单。');
		}
		if (current.remoteHead && (await run(['merge-base', '--is-ancestor', current.remoteHead, current.head], { allowFailure: true })).code) {
			throw new Error('远端历史不能直接快进，需要先处理同步；Admin 不会强制推送。');
		}
		await run(['push', 'origin', `${plan.head}:refs/heads/${plan.branch}`], { timeout: 120_000 });
		return current.head;
	}

	async function deployment(plan, siteUrl, { signal, onProgress, request = fetch } = {}) {
		const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(plan.remote);
		if (!match) return { state: 'pushed', sha: plan.head, message: '已推送至 Git 远端；该远端不是 GitHub Pages，未声称站点已上线。' };
		const repository = `${match[1]}/${match[2]}`;
		const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) };
		const deadline = Date.now() + 15 * 60_000;
		while (Date.now() < deadline) {
			signal?.throwIfAborted();
			const response = await request(`https://api.github.com/repos/${repository}/actions/runs?head_sha=${plan.head}&per_page=30`, { headers, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
			if (!response.ok) throw new Error(`GitHub Actions 查询失败（HTTP ${response.status}）；内容已推送，但上线尚未确认。`);
			const runs = (await response.json()).workflow_runs || [];
			const run = runs.find((item) => item.head_sha === plan.head && /(?:^|\/)deploy\.ya?ml(?:@|$)/.test(item.path || ''));
			if (run?.status === 'completed' && run.conclusion !== 'success') return { state: 'failed', sha: plan.head, url: run.html_url, message: `已推送，部署结果为 ${run.conclusion}。` };
			if (run?.status === 'completed' && siteUrl) {
				const index = await request(new URL('content-index.json', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), cache: 'no-store' });
				if (index.ok && (await index.json()).gitSha === plan.head) return { state: 'deployed', sha: plan.head, url: siteUrl, message: 'Actions 成功，正式站文章索引已确认本次版本。' };
			}
			onProgress?.({ state: 'deploying', sha: plan.head, url: run?.html_url, message: run ? '正在等待站点确认本次版本。' : '等待本次提交的部署任务。' });
			await delay(5000, undefined, { signal });
		}
		return { state: 'unverified', sha: plan.head, message: '内容已推送，上线验证超时；可重新查询部署状态，不重复推送。' };
	}

	return { repoRoot, run, revision, blob, recover, commit, pending, push, deployment };
}
