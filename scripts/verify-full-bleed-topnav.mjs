import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = 'src/experiments/full-bleed-topnav';
const sourceFiles = [
  `${sourceRoot}/DESIGN.md`,
  `${sourceRoot}/FullBleedTopnavLayout.astro`,
  `${sourceRoot}/full-bleed-topnav.css`,
  'src/pages/lab/full-bleed-topnav/index.astro',
];
const productionNavigation = [
  ['博客', '/blog'],
  ['项目', '/projects'],
  ['文档', '/docs'],
  ['起源', '/origin'],
  ['关于', '/about'],
];
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

function parseBase(args) {
  if (args.length === 0) return '/';
  let value;
  if (args.length === 2 && args[0] === '--base') value = args[1];
  if (args.length === 1 && args[0].startsWith('--base=')) value = args[0].slice(7);
  if (!value || value.includes('://') || /[?#]/.test(value)) {
    throw new Error('Usage: node scripts/verify-full-bleed-topnav.mjs [--base /path/]');
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

function classValues(markup) {
  return [...markup.matchAll(/\bclass\s*=\s*(["'])(.*?)\1/gi)].flatMap((match) => match[2].split(/\s+/));
}

function hasClass(markup, className) { return classValues(markup).includes(className); }

function hrefs(markup) {
  return openingTags(markup, 'a').map((tag) => attribute(tag, 'href')).filter(Boolean);
}

function expectedBasePath(base, path) { return base === '/' ? path : `${base}${path.slice(1)}`; }

function verifyGeneratedPage(html, base) {
  const route = '/lab/full-bleed-topnav/';
  const htmlTag = openingTags(html, 'html')[0] ?? '';
  assert(attribute(htmlTag, 'lang') === 'zh-CN', `${route}: expected html lang="zh-CN"`);
  assert(openingTags(html, 'h1').length === 1, `${route}: expected exactly one h1`);
  assert(openingTags(html, 'main').filter((tag) => attribute(tag, 'id') === 'main-content').length === 1, `${route}: expected exactly one main#main-content`);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? '';
  const description = openingTags(html, 'meta').find((tag) => attribute(tag, 'name')?.toLowerCase() === 'description');
  assert(title.length > 0, `${route}: expected non-empty title`);
  assert(Boolean(attribute(description ?? '', 'content')?.trim()), `${route}: expected non-empty meta description`);
  const robots = openingTags(html, 'meta').find((tag) => attribute(tag, 'name')?.toLowerCase() === 'robots');
  const robotRules = (attribute(robots ?? '', 'content') ?? '').toLowerCase();
  assert(robotRules.includes('noindex') && robotRules.includes('nofollow'), `${route}: missing noindex,nofollow`);
  const links = openingTags(html, 'link');
  assert(!links.some((tag) => attribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical')), `${route}: canonical is forbidden`);
  assert(hasClass(html, 'full-bleed-topnav-page'), `${route}: missing body scope class`);
  for (const hook of ['fb-hero-band', 'fb-rule-row', 'fb-footer-band']) {
    assert(hasClass(html, hook), `${route}: missing ${hook} hook`);
  }
  assert(hasClass(html, 'fb-topic-band') || hasClass(html, 'fb-chronology-band'), `${route}: expected topic or chronology content`);
  const skip = openingTags(html, 'a').filter((tag) => hasClass(tag, 'fb-skip-link') && attribute(tag, 'href') === '#main-content');
  assert(skip.length === 1, `${route}: expected one skip link to #main-content`);
  const nav = openingTags(html, 'nav').find((tag) => attribute(tag, 'aria-label') === '主导航');
  assert(Boolean(nav), `${route}: missing named main navigation`);
  const brand = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map(([markup]) => markup).find((markup) => hasClass(markup, 'fb-brand') && /Dead Soul Insects/i.test(markup)) ?? '';
  assert(Boolean(brand), `${route}: missing production brand link`);
  assert(attribute(brand, 'href') === expectedBasePath(base, '/'), `${route}: brand must target ${expectedBasePath(base, '/')}`);
  const navMarkup = nav ? html.match(new RegExp(`<nav\\b[^>]*aria-label=["']主导航["'][^>]*>[\\s\\S]*?<\\/nav>`, 'i'))?.[0] ?? '' : '';
  const navAnchors = openingTags(navMarkup, 'a');
  assert(navAnchors.length === productionNavigation.length, `${route}: production navigation count/order changed`);
  productionNavigation.forEach(([label, path], index) => {
    const tag = navAnchors[index] ?? '';
    const expectedHref = expectedBasePath(base, path);
    assert(attribute(tag, 'href') === expectedHref, `${route}: navigation item ${label} must target ${expectedHref}`);
    const nextText = html.slice(html.indexOf(tag) + tag.length).match(/^[\s\S]*?<\/a>/i)?.[0] ?? '';
    assert(nextText.replace(/<[^>]*>/g, '').trim().startsWith(label), `${route}: navigation item ${label} is missing or reordered`);
  });
  const ids = new Set([...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]));
  for (const href of [...hrefs(html), ...links.map((tag) => attribute(tag, 'href')).filter(Boolean)]) {
    if (href.startsWith('#')) assert(ids.has(href.slice(1)), `${route}: missing hash target ${href}`);
    else if (!/^(?:https?:|mailto:|tel:|data:)/i.test(href)) assert(href.startsWith(expectedBasePath(base, '/')), `${route}: internal link is not base-safe: ${href}`);
  }
}

function hasRule(css, selector, declaration) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(([, prelude, body]) => selector.test(prelude) && declaration.test(body));
}

function verifyStylesheet(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const scope = '.full-bleed-topnav-page';
  assert(clean.includes(`${scope} {`) || clean.includes(`${scope}{`), 'full-bleed-topnav.css: missing local token scope');
  for (const [, token] of clean.matchAll(/(--[\w-]+)\s*:/g)) assert(token.startsWith('--fb-'), `full-bleed-topnav.css: unscoped custom property ${token}`);
  for (const [, prelude] of clean.matchAll(/([^{}]+)\{/g)) {
    const selector = prelude.trim();
    if (selector.startsWith('@')) continue;
    for (const branch of selector.split(',')) assert(branch.includes(scope), `full-bleed-topnav.css: unscoped selector ${branch.trim()}`);
  }
  assert(!/:root\b|(?:^|[,\s])(?:html|body)\b|@import\b/.test(clean), 'full-bleed-topnav.css: global or imported styles are forbidden');
  assert(hasRule(clean, /\.fb-(?:topnav-band|hero-band|topic-band|chronology-band|footer-band)/, /inline-size\s*:\s*100%/), 'full-bleed-topnav.css: missing full-width band rule');
  assert(/minmax\(\s*0\s*,\s*1fr\s*\)/.test(clean), 'full-bleed-topnav.css: missing minmax(0, 1fr) guard');
  assert(/(?:min-(?:height|width)|block-size)\s*:\s*(?:44px|2\.75rem|var\(--fb-target-min\))/.test(clean), 'full-bleed-topnav.css: missing 44px target floor');
  assert(/@media\s*\(max-width\s*:\s*40rem\)/.test(clean), 'full-bleed-topnav.css: missing mobile rules');
  assert(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/.test(clean), 'full-bleed-topnav.css: missing reduced-motion rules');
  assert(hasRule(clean, /prefers-reduced-motion/, /transition\s*:\s*none|transition-duration\s*:\s*0s/), 'full-bleed-topnav.css: reduced motion must remove transitions');
  assert(!/(?:\.page-shell|\.page-card|\.entry-card|\.topic-card|\.post-card|rail|sidebar|tuning|slider|reset|undo|100vw|negative-margin|overflow\s*:\s*hidden|position\s*:\s*absolute|animation\s*:|@keyframes|box-shadow\s*:)/i.test(clean), 'full-bleed-topnav.css: forbidden card/rail/tuning/animation pattern');
}

async function verifySources() {
  for (const path of sourceFiles) assert(await readOptional(path) !== null, `${path}: missing required artifact`);
  const layout = await readOptional(sourceFiles[1]);
  const route = await readOptional(sourceFiles[3]);
  const css = await readOptional(sourceFiles[2]);
  const code = `${layout ?? ''}\n${route ?? ''}`;
  assert(!/(?:from\s*|import\s*(?:\(\s*)?)['"](?:react|tailwindcss)(?:\/|['"])/i.test(code), `${sourceRoot}: React/Tailwind import is forbidden`);
  assert(!/getCollection|astro:content|import\.meta\.glob|src\/content|@tailwind|@apply/i.test(code), `${sourceRoot}: copied content or framework shortcut is forbidden`);
  assert(!/(?:page-shell|page-card|entry-card|topic-card|post-card|rail|sidebar|tuning|slider|reset|undo|100vw|overflow\s*:\s*hidden|position\s*:\s*absolute|animation\s*:|@keyframes)/i.test(code), `${sourceRoot}: forbidden card/rail/tuning pattern`);
  assert(/withBase/.test(code), `${sourceRoot}: base-safe withBase usage is required`);
  if (css !== null) verifyStylesheet(css);
}

async function verifySitemaps() {
  const files = (await listRelative('dist')).map(String).filter((entry) => /(?:^|[\\/])sitemap[^\\/]*\.xml$/i.test(entry));
  assert(files.length > 0, 'dist: expected generated sitemap XML');
  let retainsBlog = false;
  for (const file of files) {
    const xml = await readOptional(`dist/${file.replaceAll('\\', '/')}`);
    assert(!xml?.includes('/lab/full-bleed-topnav/'), `dist/${file}: lab route leaked into sitemap`);
    retainsBlog ||= Boolean(xml?.includes('/blog/'));
  }
  assert(retainsBlog, 'dist: sitemap set must retain /blog/');
}

async function main() {
  const base = parseBase(process.argv.slice(2));
  await verifySources();
  const output = 'dist/lab/full-bleed-topnav/index.html';
  const html = await readOptional(output);
  assert(html !== null, `${output}: missing generated route output`);
  if (html !== null) verifyGeneratedPage(html, base);
  await verifySitemaps();
  if (failures.length > 0) {
    console.error(`Full-Bleed Topnav verification failed (${failures.length})`);
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`Expected Astro base: ${base}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Full-Bleed Topnav verification passed at base ${base}`);
}

main().catch((error) => {
  console.error(`Full-Bleed Topnav verification could not run: ${error.message}`);
  process.exitCode = 1;
});
