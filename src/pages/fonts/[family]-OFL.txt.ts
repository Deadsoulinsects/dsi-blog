import type { APIRoute } from 'astro';
import { fontLicense, fontManifest } from '../../fonts/resources.mjs';

export const prerender = true;
export function getStaticPaths() {
	return fontManifest.families.map((family) => ({ params: { family: family.id } }));
}
export const GET: APIRoute = ({ params }) => new Response(fontLicense(params.family!), {
	headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});
