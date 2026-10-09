import type { APIRoute } from 'astro';
import { fontRevision, fontStylesheet, verifyPublishedFontCoverage } from '../../fonts/resources.mjs';

export const prerender = true;
export function getStaticPaths() {
	verifyPublishedFontCoverage();
	return ['lab', 'a1'].map((variant) => ({
		params: { sheet: `${variant}-${fontRevision}` },
		props: { variant },
	}));
}
export const GET: APIRoute = ({ props }) => new Response(fontStylesheet(props.variant, import.meta.env.BASE_URL), {
	headers: { 'Content-Type': 'text/css; charset=utf-8' },
});
