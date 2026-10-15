import type { LocalInspection, LocalJob, LocalSelection } from '../../scripts/admin/local.mjs';
import { isInspection, isJob, localRequest } from './local-protocol';
import { localElement, localMessages, localValue, renderInspection } from './local-view';

export const initializeLocalPreparation = (
	page: HTMLElement,
	loadSource: (fileName: string, sourceText: string) => void,
): { readonly invalidate: () => void } => {
	const root = localElement<HTMLElement>(page, '[data-admin-local]');
	const form = localElement<HTMLFormElement>(root, '[data-local-form]');
	const inspect = localElement<HTMLButtonElement>(root, '[data-local-inspect]');
	const prepare = localElement<HTMLButtonElement>(root, '[data-local-prepare]');
	const status = localElement<HTMLElement>(root, '[data-local-status]');
	const verdict = localElement<HTMLElement>(root, '[data-local-verdict]');
	const progress = localElement<HTMLProgressElement>(root, '[data-local-progress]');
	const progressText = localElement<HTMLElement>(root, '[data-local-progress-text]');
	let report: LocalInspection | null = null;
	let available = false;
	let busy = false;
	let revision = 0;

	const controls = (): void => {
		inspect.disabled = busy || !available;
		prepare.disabled = busy || !available || !report?.canPrepare;
		for (const input of form.querySelectorAll<HTMLInputElement>('input')) input.disabled = busy || !available;
		form.setAttribute('aria-busy', String(busy));
	};
	const invalidate = (): void => {
		++revision;
		report = null;
		localElement<HTMLElement>(root, '[data-local-result]').hidden = true;
		localElement<HTMLAnchorElement>(root, '[data-local-article]').hidden = true;
		root.dataset.localState = 'unchecked';
		status.textContent = busy
			? '当前选择已失效；已启动的 Node 任务仍可能运行。任务结束后重新检查。'
			: '当前选择尚未检查；旧 Ready 结论已失效。';
		controls();
	};
	const failed = (error: unknown): void => {
		const message = error instanceof Error ? error.message : String(error);
		report = null;
		root.dataset.localState = 'failed';
		localElement<HTMLElement>(root, '[data-local-result]').hidden = false;
		localElement<HTMLAnchorElement>(root, '[data-local-article]').hidden = true;
		verdict.textContent = 'Error · 本次未达到 Ready';
		status.textContent = message;
		for (const name of ['metadata', 'matched', 'semantics', 'plan']) localValue(root, name, '本次未确认');
		localValue(root, 'prepared', '未确认成功；已有资源不删除，重新检查实际状态');
		localElement<HTMLUListElement>(root, '[data-local-resources]').replaceChildren();
		progress.value = 0;
		progressText.textContent = '失败 / 未确认';
		localMessages(root, 'errors', [message]);
		localMessages(root, 'warnings', []);
		localMessages(root, 'next', ['修正错误后重新检查。网络中断不代表 Node 任务取消；先检查状态，不重复启动转换。']);
	};
	const selection = (): LocalSelection => {
		const data = new FormData(form);
		return {
			note: String(data.get('note') ?? '').trim(),
			sourceRoot: String(data.get('sourceRoot') ?? '').trim(),
			id: String(data.get('id') ?? '').trim(),
			ffmpeg: String(data.get('ffmpeg') ?? '').trim(),
			ffprobe: String(data.get('ffprobe') ?? '').trim(),
		};
	};
	const renderJob = (job: LocalJob): void => {
		if (job.progress) {
			progress.max = Math.max(1, job.progress.total);
			progress.value = job.progress.completed;
			progressText.textContent = `${job.progress.completed} / ${job.progress.total} · ${job.progress.action}`;
		}
	};
	form.addEventListener('input', invalidate);
	form.addEventListener('submit', (event) => {
		event.preventDefault();
		if (busy || !available) return;
		const selected = selection();
		const current = ++revision;
		localValue(root, 'article', `${selected.id} · ${selected.note}`);
		busy = true;
		report = null;
		controls();
		localElement<HTMLElement>(root, '[data-local-result]').hidden = true;
		localElement<HTMLAnchorElement>(root, '[data-local-article]').hidden = true;
		status.textContent = '检查中：读取源、匹配附件、核对哈希与正式 renderer…';
		root.dataset.localState = 'checking';
		void (async () => {
			try {
				const response = await localRequest('inspect', selected);
				if (!isInspection(response)) throw new TypeError('本地检查响应格式无效；未确认 Ready。');
				if (current !== revision) return;
				report = response;
				loadSource(response.note.replace(/\\/gu, '/').split('/').at(-1) ?? response.id, response.sourceText);
				renderInspection(root, response);
				progress.value = 0;
				progressText.textContent = '尚未运行';
				status.textContent = response.formal.ready ? '检查完成：正式文章本地 Ready。' : '检查完成：尚有阻止项，见 Error 和下一步。';
			} catch (error) { if (current === revision) failed(error); }
			finally { busy = false; controls(); }
		})();
	});
	prepare.addEventListener('click', () => {
		if (busy || !available || !report?.canPrepare) return;
		const selected = selection();
		const current = ++revision;
		busy = true;
		controls();
		localElement<HTMLAnchorElement>(root, '[data-local-article]').hidden = true;
		verdict.textContent = '进行中 · Ready 暂时失效';
		root.dataset.localState = 'running';
		progress.removeAttribute('value');
		progressText.textContent = '启动中';
		localValue(root, 'prepared', '进行中；使用现有事务媒体准备管线');
		status.textContent = '准备中：请勿关闭本地服务；原文和附件保持只读。';
		void (async () => {
			try {
				let response = await localRequest('prepare', selected);
				if (!isJob(response)) throw new TypeError('准备任务响应格式无效。');
				let job = response;
				while (job.state === 'queued' || job.state === 'running') {
					renderJob(job);
					response = await localRequest(`jobs/${job.id}?after=${job.revision}`);
					if (!isJob(response)) throw new TypeError('任务状态响应格式无效。');
					job = response;
				}
				if (current !== revision) return;
				renderJob(job);
				switch (job.state) {
					case 'failed': throw new Error(job.error ?? job.errors.join('\n'));
					case 'succeeded': {
						if (!job.report || !job.result) throw new Error(job.errors.join('\n') || '资源已提交，但未取得新 readiness；请重新检查。');
						report = job.report;
						renderInspection(root, job.report);
						const result = job.result.preparation;
						localValue(root, 'prepared', `成功 · 复用 ${result.reused} · 转换 ${result.converted} · 合并 ${result.deduplicated}`);
						status.textContent = job.report.formal.ready ? '准备完成，重新检查后为 Ready。' : '资源准备成功，但正式文章尚未 Ready；请处理阻止项。';
						break;
					}
					default: throw new TypeError('任务未进入终态。');
				}
			} catch (error) { if (current === revision) failed(error); }
			finally { busy = false; controls(); }
		})();
	});
	controls();
	if (root.dataset.localEnabled === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
		void localRequest('capabilities').then((response) => {
			if (response === null || typeof response !== 'object' || !('available' in response) || response.available !== true)
				throw new TypeError('本地执行服务不可用。');
			available = true;
			controls();
			status.textContent = '本地执行服务可用。填写源路径后检查；只写网页资源，不覆盖正文或正式文章。';
		}).catch(failed);
	} else status.textContent = '本地执行仅在本机 npm run dev 可用；浏览器只读导入、字段检查和附件预览仍可使用。';
	return { invalidate };
};
