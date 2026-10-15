import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSortedPosts } from '../utils/content';
import { getPublicArticleMetadata } from '../utils/content-index';

export const prerender = true;

export const GET: APIRoute = async () => {
	// Preparation workspaces can have no Git checkout; only a real build SHA
	// identifies a published revision, never a staging build with a null SHA.
	let gitSha: string | null = null;
	try {
		const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd: process.cwd() });
		gitSha = stdout.trim();
	} catch (error) {
		if (!(error instanceof Error) || !('code' in error)
			|| (error.code !== 'ENOENT' && !(error.code === 128
				&& 'stderr' in error && String(error.stderr).includes('not a git repository')))) {
			throw error;
		}
	}
	return new Response(JSON.stringify({
		gitSha,
		articles: getPublicArticleMetadata(await getSortedPosts(), import.meta.env.BASE_URL),
	}), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
