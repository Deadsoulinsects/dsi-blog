export const workspacePrefix = '/__admin-workspace';

export class WorkspaceRequestError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		this.name = 'WorkspaceRequestError';
	}
}

export async function workspaceRequest<Result>(
	action: string,
	values?: object,
	query?: Record<string, string>,
): Promise<Result> {
	const url = new URL(`${workspacePrefix}/${action}`, window.location.origin);
	for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
	const response = await fetch(url, {
		method: values === undefined ? 'GET' : 'POST',
		credentials: 'same-origin',
		cache: 'no-store',
		headers: values === undefined ? { Accept: 'application/json' } : {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: values === undefined ? undefined : JSON.stringify(values),
		signal: AbortSignal.timeout(values === undefined ? 30_000 : 120_000),
	});
	if (!response.headers.get('content-type')?.includes('application/json')) {
		throw new WorkspaceRequestError('当前页面没有可用的本地工作区服务。请使用 DSI Admin 安装版或本机开发服务。', response.status);
	}
	const result = await response.json();
	if (!response.ok) throw new WorkspaceRequestError(result.error ?? `本地操作失败（${response.status}）。`, response.status);
	return result as Result;
}
