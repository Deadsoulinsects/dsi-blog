import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = 'src/pages/lab/index.astro';
const outputPath = 'dist/lab/index.html';
const familyRoutes = [
  ['field-notebook', 'Field Notebook', '8 个页面'],
  ['full-bleed-topnav', 'Full-Bleed Topnav', '1 个页面'],
  ['list-exploration', 'List Exploration', '8 个方案'],
  ['list-masters', 'List Masters', '3 个母版'],
  ['list-route-schemes', 'List Route Schemes', '5 条路线'],
];
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

function parseBase(args) {
  if (args.length === 0) return '/';
  let value;
  if (args.length === 2 && args[0] === '--base') value = args[1];
  if (args.length === 1 && args[0].startsWith('--base=')) value = args[0].slice(7);
  if (!value || value.includes('://') || /[?#]/.test(value)) {
    throw new Error('Usage: node scripts/verify-lab-overview.mjs [--base /path/]');
  }
  const rooted = value.replaceAll('\\', '/').startsWith('/') ? value : `/${value}`;
  return rooted === '/' ? '/' : `${rooted.replace(/\/+$/, '')}/`;
}

async function readOptional(relativePath) {
  try {
    return await readFile(join(projectRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function listRelative(directory) {
  try {
    return await readdir(join(projectRoot, directory), { recursive: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function openingTags(markup, name) { return markup.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? []; }

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? null;
}

function expectedBasePath(base, path) { return base === '/' ? path : `${base}${path.slice(1)}`; }

function verifySources(source) {
  assert(source !== null, `${sourcePath}: missing required source artifact`);
  if (source === null) return;
  for (const name of ['Layout', 'withBase', 'listExplorationVariants', 'listMasterVariants', 'listRouteSchemes']) {
    assert(new RegExp(`\\b${name}\\b`).test(source), `${sourcePath}: missing ${name} wiring`);
  }
  for (const name of ['listExplorationVariants', 'listMasterVariants', 'listRouteSchemes']) {
    assert(new RegExp(`(?:const|let)\\s+\\w+\\s*=\\s*${name}\\.length`).test(source), `${sourcePath}: count must be computed from ${name}.length`);
  }
  assert(/Field Notebook/.test(source) && /Full-Bleed Topnav/.test(source), `${sourcePath}: fixed family metadata is incomplete`);
  assert(/Field Notebook[\s\S]{0,160}?\b8\b/.test(source), `${sourcePath}: Field Notebook count must be fixed at 8`);
  assert(/Full-Bleed Topnav[\s\S]{0,160}?\b1\b/.test(source), `${sourcePath}: Full-Bleed Topnav count must be fixed at 1`);
  const paths = [...source.matchAll(/['"](\/lab\/(?:field-notebook|full-bleed-topnav|list-exploration|list-masters|list-route-schemes)\/)['"]/g)].map((match) => match[1]);
  assert(paths.length === familyRoutes.length && new Set(paths).size === familyRoutes.length, `${sourcePath}: expected exactly five family route paths`);
  assert(/href\s*=\s*\{[^}]*withBase\s*\(/.test(source), `${sourcePath}: family hrefs must use withBase`);
  assert(!/(?:VariantMap|SchemeMap|getStaticPaths|slug\s*:|(?:const|let|var)\s+\w+\s*=\s*\[)/.test(source), `${sourcePath}: copied child variant slugs/data arrays are forbidden`);
}

function verifyGeneratedPage(html, base) {
  const route = '/lab/';
  assert(html !== null, `${outputPath}: missing generated route output`);
  if (html === null) return;
  const htmlTag = openingTags(html, 'html')[0] ?? '';
  assert(attribute(htmlTag, 'lang') === 'zh-CN', `${route}: expected html lang="zh-CN"`);
  assert(openingTags(html, 'h1').length === 1, `${route}: expected exactly one h1`);
  assert(openingTags(html, 'main').filter((tag) => attribute(tag, 'id') === 'lab-directory').length === 1, `${route}: expected exactly one main#lab-directory`);
  const navs = openingTags(html, 'nav').filter((tag) => attribute(tag, 'aria-label')?.trim());
  assert(navs.length === 1, `${route}: expected exactly one named nav`);
  const robots = openingTags(html, 'meta').find((tag) => attribute(tag, 'name')?.toLowerCase() === 'robots');
  const robotRules = (attribute(robots ?? '', 'content') ?? '').toLowerCase().replace(/\s+/g, '');
  assert(robotRules.includes('noindex') && robotRules.includes('nofollow'), `${route}: missing noindex,nofollow`);
  assert(!openingTags(html, 'link').some((tag) => attribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical')), `${route}: canonical is forbidden`);

  const expected = familyRoutes.map(([slug]) => expectedBasePath(base, `/lab/${slug}/`));
  const familyAnchors = openingTags(html, 'a').filter((tag) => expected.includes(attribute(tag, 'href')));
  assert(familyAnchors.length === familyRoutes.length, `${route}: expected exactly five linked family rows`);
  familyRoutes.forEach(([slug, name, countLabel], index) => {
    const anchor = familyAnchors[index] ?? '';
    const href = attribute(anchor, 'href');
    assert(href === expected[index], `${route}: family ${slug} href/order is incorrect`);
    const row = html.match(new RegExp(`<a\\b[^>]*href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>[\\s\\S]*?<\\/a>`, 'i'))?.[0] ?? '';
    const text = row.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    assert(text.includes(name), `${route}: family ${slug} visible name is missing`);
    assert(text.includes(countLabel), `${route}: family ${slug} visible count must be ${countLabel}`);
  });
  const skipLinks = openingTags(html, 'a').filter((tag) => attribute(tag, 'href') === '#lab-directory');
  assert(skipLinks.length === 1, `${route}: expected one skip link to #lab-directory`);
  const ids = new Set([...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]));
  const links = openingTags(html, 'link').map((tag) => attribute(tag, 'href')).filter(Boolean);
  for (const href of [...openingTags(html, 'a').map((tag) => attribute(tag, 'href')).filter(Boolean), ...links]) {
    if (href.startsWith('#')) assert(ids.has(href.slice(1)), `${route}: missing hash target ${href}`);
    else if (!/^(?:https?:|mailto:|tel:|data:)/i.test(href)) assert(!href.startsWith('//') && href.startsWith(expectedBasePath(base, '/')), `${route}: internal link is not base-safe: ${href}`);
  }
}

async function verifySitemaps() {
  const files = (await listRelative('dist')).map(String).filter((entry) => /(?:^|[\\/])sitemap[^\\/]*\.xml$/i.test(entry));
  assert(files.length > 0, 'dist: expected generated sitemap XML');
  let retainsBlog = false;
  let retainsExploration = false;
  for (const file of files) {
    const xml = await readOptional(`dist/${file.replaceAll('\\', '/')}`) ?? '';
    assert(!/\/lab\/<\/loc>/i.test(xml), `dist/${file}: exact /lab/ overview URL leaked into sitemap`);
    retainsBlog ||= /\/blog\//.test(xml);
    retainsExploration ||= /\/lab\/list-exploration\//.test(xml);
  }
  assert(retainsBlog, 'dist: sitemap set must retain /blog/');
  assert(retainsExploration, 'dist: sitemap set must retain /lab/list-exploration/');
}

async function main() {
  const base = parseBase(process.argv.slice(2));
  verifySources(await readOptional(sourcePath));
  verifyGeneratedPage(await readOptional(outputPath), base);
  await verifySitemaps();
  if (failures.length > 0) {
    console.error(`Lab overview verification failed (${failures.length})`);
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`Expected Astro base: ${base}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Lab overview verification passed at base ${base}`);
}

main().catch((error) => {
  console.error(`Lab overview verification could not run: ${error.message}`);
  process.exitCode = 1;
});
