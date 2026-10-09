import type { APIRoute } from 'astro';
import { fontBytes, fontManifest } from '../../fonts/resources.mjs';

export const prerender = true;
export function getStaticPaths() {
	return fontManifest.faces.map((face) => ({ params: { font: face.id } }));
}
export const GET: APIRoute = ({ params }) => new Response(fontBytes(params.font!), {
	headers: { 'Content-Type': 'font/woff2' },
});
