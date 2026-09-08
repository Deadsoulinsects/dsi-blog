import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const routes = [
  ['/lab/field-notebook/', 'dist/lab/field-notebook/index.html', 'home'],
  ['/lab/field-notebook/blog/', 'dist/lab/field-notebook/blog/index.html', 'blog'],
  ['/lab/field-notebook/article/', 'dist/lab/field-notebook/article/index.html', 'article'],
  ['/lab/field-notebook/docs/', 'dist/lab/field-notebook/docs/index.html', 'docs'],
  ['/lab/field-notebook/projects/', 'dist/lab/field-notebook/projects/index.html', 'projects'],
  ['/lab/field-notebook/archive/', 'dist/lab/field-notebook/archive/index.html', 'archive'],
  ['/lab/field-notebook/categories/', 'dist/lab/field-notebook/categories/index.html', 'categories'],
  ['/lab/field-notebook/not-found/', 'dist/lab/field-notebook/not-found/index.html', 'not-found'],
];
const forbiddenRootRoutes = [
  ['/article/', ['src/pages/article.astro', 'src/pages/article/index.astro'], ['dist/article/index.html']],
  ['/visual-preview/', ['src/pages/visual-preview.astro'], ['dist/visual-preview/index.html']],
];
const requiredTokens = [
  '--field-color-paper', '--field-color-rail', '--field-color-ink', '--field-color-muted',
  '--field-color-faint', '--field-color-accent', '--field-color-accent-strong',
  '--field-color-code', '--field-color-code-ink', '--field-font-reading', '--field-font-ui',
  '--field-font-mono', '--field-space-5', '--field-space-6', '--field-shell-width',
  '--field-reading-measure', '--field-rail-width', '--field-toc-width',
  '--field-touch-target', '--field-motion-fast',
];
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

function parseBase(args) {
  if (args.length === 0) return '/';
  let value;
  if (args.length === 2 && args[0] === '--base') value = args[1];
  if (args.length === 1 && args[0].startsWith('--base=')) value = args[0].slice(7);
  if (!value || value.includes('://') || /[?#]/.test(value)) {
    throw new Error('Usage: node scripts/verify-field-notebook.mjs [--base /path/]');
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

function openingTags(html, name) { return html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? []; }

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? null;
}

function hasClass(html, className) {
  return (html.match(/\bclass\s*=\s*(["'])(.*?)\1/gi) ?? []).some((match) => {
    const value = match.replace(/^.*?(["'])/, '').replace(/(["'])$/, '');
    return value.split(/\s+/).includes(className);
  });
}

function anchorHrefs(html) { return openingTags(html, 'a').map((tag) => attribute(tag, 'href')).filter(Boolean); }

function expectedBasePrefix(base) { return base === '/' ? '/' : base; }

function verifyCommonPage(route, html, base) {
  const htmlTag = openingTags(html, 'html')[0] ?? '';
  assert(attribute(htmlTag, 'lang') === 'zh-CN', `${route}: expected html lang="zh-CN"`);
  assert(openingTags(html, 'h1').length === 1, `${route}: expected exactly one h1`);

  const mains = openingTags(html, 'main').filter((tag) => attribute(tag, 'id') === 'main-content');
  assert(mains.length === 1, `${route}: expected exactly one main#main-content`);

  const anchors = openingTags(html, 'a');
  const skipLinks = anchors.filter((tag) => {
    const classes = attribute(tag, 'class')?.split(/\s+/) ?? [];
    return classes.includes('skip-link') && attribute(tag, 'href') === '#main-content';
  });
  assert(skipLinks.length === 1, `${route}: expected one skip link to #main-content`);

  const robots = openingTags(html, 'meta').find((tag) => attribute(tag, 'name')?.toLowerCase() === 'robots');
  const robotRules = (attribute(robots ?? '', 'content') ?? '').toLowerCase();
  assert(robotRules.includes('noindex') && robotRules.includes('nofollow'), `${route}: missing noindex,nofollow`);

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? '';
  const description = openingTags(html, 'meta').find((tag) => attribute(tag, 'name')?.toLowerCase() === 'description');
  assert(title.length > 0, `${route}: expected a non-empty title`);
  assert(Boolean(attribute(description ?? '', 'content')?.trim()), `${route}: expected a meta description`);
  assert(hasClass(html, 'field-notebook'), `${route}: missing .field-notebook scope root`);
  assert(hasClass(html, 'field-notebook__rail'), `${route}: missing notebook rail`);
  assert(hasClass(html, 'field-notebook__main'), `${route}: missing notebook main hook`);

  const navs = openingTags(html, 'nav');
  assert(navs.length > 0, `${route}: expected at least one navigation landmark`);
  assert(
    navs.every((tag) => attribute(tag, 'aria-label') || attribute(tag, 'aria-labelledby')),
    `${route}: every navigation landmark needs an accessible name`,
  );
  const currentLinks = anchors.filter((tag) => attribute(tag, 'aria-current') === 'page');
  assert(currentLinks.length <= 1, `${route}: expected at most one aria-current="page" link`);
  if (!route.endsWith('/not-found/')) assert(currentLinks.length === 1, `${route}: missing current navigation state`);

  const ids = new Set(
    (html.match(/\bid\s*=\s*(["'])(.*?)\1/gi) ?? []).map((match) => match.replace(/^.*?(["'])/, '').replace(/(["'])$/, '')),
  );
  const links = openingTags(html, 'link');
  assert(links.some((tag) => attribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('icon')), `${route}: expected a favicon link`);
  assert(!links.some((tag) => attribute(tag, 'rel')?.toLowerCase() === 'canonical'), `${route}: canonical metadata is forbidden for this lab`);
  const hrefs = [...anchorHrefs(html), ...links.map((tag) => attribute(tag, 'href')).filter(Boolean)];
  for (const href of hrefs) {
    if (href.startsWith('#')) {
      assert(href.length > 1 && ids.has(href.slice(1)), `${route}: hash target ${href} does not exist`);
      continue;
    }
    if (/^(?:https?:|mailto:|tel:)/i.test(href)) continue;
    assert(!href.startsWith('//') && href.startsWith(expectedBasePrefix(base)), `${route}: internal link is not base-safe: ${href}`);
  }
  assert(!html.includes('src/content/'), `${route}: production content path leaked into output`);
}

function verifyView(route, view, html) {
  if (view === 'home') {
    assert(hasClass(html, 'field-notebook__current-entry'), `${route}: missing current-entry editorial block`);
  }
  if (view === 'home' || view === 'blog') {
    const orderedLogs = openingTags(html, 'ol').filter((tag) => (attribute(tag, 'class') ?? '').split(/\s+/).includes('field-notebook__log'));
    assert(orderedLogs.length === 1, `${route}: expected one semantic numbered log`);
    assert(hasClass(html, 'field-notebook__log-row'), `${route}: missing numbered log rows`);
    assert(hasClass(html, 'field-notebook__type'), `${route}: missing visible content-type labels`);
  }
  if (view !== 'article') return;

  assert(hasClass(html, 'field-notebook__article-grid'), `${route}: missing article grid`);
  assert(hasClass(html, 'field-notebook__prose'), `${route}: missing article prose`);
  const toc = openingTags(html, 'nav').find((tag) => (attribute(tag, 'class') ?? '').split(/\s+/).includes('field-notebook__toc'));
  assert(Boolean(toc), `${route}: missing labelled article TOC`);
  const tocMarkup = html.match(/<nav\b[^>]*class\s*=\s*(["'])[^"']*field-notebook__toc[^"']*\1[^>]*>[\s\S]*?<\/nav>/i)?.[0] ?? '';
  const headingIds = new Set(
    [...html.matchAll(/<h[2-6]\b[^>]*\bid\s*=\s*(["'])(.*?)\1[^>]*>/gi)].map((match) => match[2]),
  );
  const tocTargets = anchorHrefs(tocMarkup).filter((href) => href.startsWith('#'));
  assert(tocTargets.length > 0, `${route}: TOC needs hash links`);
  for (const target of tocTargets) {
    assert(headingIds.has(target.slice(1)), `${route}: TOC target ${target} is not an article heading`);
  }
  assert(/<pre\b[^>]*>[\s\S]*?<code\b/i.test(html), `${route}: missing semantic code sample`);
  assert(openingTags(html, 'table').length === 1, `${route}: expected one semantic table`);
  assert(openingTags(html, 'caption').length === 1, `${route}: table needs a caption`);
  const headers = openingTags(html, 'th');
  assert(headers.length > 0 && headers.every((tag) => ['col', 'row'].includes(attribute(tag, 'scope'))), `${route}: every table header needs scope`);
}

function hasRule(css, selectorPattern, declarationPattern) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(([, selector, declarations]) => selectorPattern.test(selector) && declarationPattern.test(declarations));
}

async function verifyStylesheet() {
  const path = 'src/styles/field-notebook.css';
  const source = await readOptional(path);
  assert(source !== null, `${path}: missing isolated stylesheet`);
  if (source === null) return;
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokenBlock = css.match(/\.field-notebook\s*\{([^{}]*)\}/)?.[1] ?? '';
  for (const token of requiredTokens) assert(tokenBlock.includes(`${token}:`), `${path}: missing ${token} in .field-notebook`);
  for (const [, token] of css.matchAll(/(--[\w-]+)\s*:/g)) {
    assert(token.startsWith('--field-'), `${path}: unscoped custom property ${token}`);
  }
  for (const [, prelude] of css.matchAll(/([^{}]+)\{/g)) {
    const selector = prelude.trim();
    if (selector.startsWith('@')) continue;
    for (const branch of selector.split(',')) assert(branch.includes('.field-notebook'), `${path}: unscoped selector ${branch.trim()}`);
  }
  assert(!/:root\b/.test(css) && !/@import\b/.test(css), `${path}: global root or imported styles are forbidden`);
  assert(!/var\(\s*--field-[\w-]+\s*,/.test(css), `${path}: field tokens must not use fallback values`);
  assert(/minmax\(\s*0\s*,\s*1fr\s*\)/.test(css), `${path}: missing minmax(0, 1fr) shrink guard`);
  assert(hasRule(css, /pre|code/, /overflow-x\s*:\s*auto/), `${path}: code needs local horizontal overflow`);
  assert(hasRule(css, /table/, /overflow-x\s*:\s*auto/), `${path}: table needs local horizontal overflow`);
  assert(hasRule(css, /field-notebook__toc/, /position\s*:\s*sticky/), `${path}: desktop TOC must be sticky`);
  assert(hasRule(css, /field-notebook__toc/, /align-self\s*:\s*start/), `${path}: sticky TOC needs align-self: start`);
  assert(hasRule(css, /:focus-visible/, /outline\s*:/), `${path}: visible focus outline missing`);
  assert(/min-(?:height|width)\s*:\s*(?:44px|2\.75rem|var\(--field-touch-target\))/.test(css), `${path}: 44px touch target floor missing`);
  const mobileIndex = css.search(/@media\s*\(max-width\s*:\s*760px\)/);
  const mobileCss = mobileIndex >= 0 ? css.slice(mobileIndex) : '';
  assert(mobileIndex >= 0, `${path}: 760px mobile breakpoint missing`);
  assert(hasRule(mobileCss, /field-notebook__rail/, /position\s*:\s*static/), `${path}: mobile rail must return to normal flow`);
  assert(hasRule(mobileCss, /field-notebook__rail[^,]*nav|field-notebook__nav/, /overflow-x\s*:\s*auto/), `${path}: mobile navigation must scroll locally`);
  const reducedIndex = css.search(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/);
  const reducedCss = reducedIndex >= 0 ? css.slice(reducedIndex) : '';
  assert(reducedIndex >= 0, `${path}: reduced-motion media query missing`);
  assert(/scroll-behavior\s*:\s*auto|transition-duration\s*:\s*(?:0s|0\.01ms)/.test(reducedCss), `${path}: reduced-motion override is incomplete`);
  assert(!/(?:box-shadow|backdrop-filter)\s*:|(?:linear|radial)-gradient\(/.test(css), `${path}: card/glass depth effects are forbidden`);
}

async function verifySourceIsolation() {
  const roots = ['src/pages/lab/field-notebook', 'src/components/field-notebook'];
  const files = (await Promise.all(roots.map(async (root) => (await listRelative(root)).map((entry) => `${root}/${String(entry).replaceAll('\\', '/')}`))))
    .flat()
    .filter((path) => /\.(?:astro|css|js|jsx|mjs|ts|tsx)$/.test(path));
  const stylesheet = 'src/styles/field-notebook.css';
  if (await readOptional(stylesheet) !== null) files.push(stylesheet);
  const forbiddenCode = /astro:content|\bgetCollection\b|\bgetSortedPosts\b|src\/content|import\.meta\.glob|(?:from\s*|import\s*(?:\(\s*)?)["'](?:react|tailwindcss)(?:\/[^"']*)?["']|@tailwind|@apply/;
  const imports = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g;
  for (const path of files) {
    const source = await readOptional(path);
    assert(!/\.(?:jsx|tsx)$/.test(path) && !forbiddenCode.test(source ?? ''), `${path}: forbidden content, React, or Tailwind usage`);
    for (const [, specifier] of (source ?? '').matchAll(imports)) {
      const normalized = specifier.replaceAll('\\', '/');
      const target = normalized.startsWith('.') ? relative(projectRoot, resolve(dirname(join(projectRoot, path)), normalized)).replaceAll('\\', '/') : normalized;
      const productionLayout = /(?:^|\/)layouts\//.test(target);
      const productionComponent = /(?:^|\/)components\//.test(target) && !/(?:^|\/)components\/field-notebook\//.test(target);
      const productionContent = /(?:^|\/)(?:src\/)?content\//.test(target);
      const productionPage = /^src\/pages\/(?!lab\/field-notebook\/)/.test(target);
      assert(!productionLayout && !productionComponent && !productionContent && !productionPage, `${path}: forbidden production import ${specifier}`);
    }
  }
}

async function verifySitemaps() {
  const files = (await listRelative('dist')).map((entry) => String(entry).replaceAll('\\', '/')).filter((entry) => /(?:^|\/)sitemap[^/]*\.xml$/.test(entry));
  assert(files.length > 0, 'dist: expected generated sitemap XML');
  for (const file of files) {
    const xml = await readOptional(`dist/${file}`);
    assert(!xml?.includes('/lab/field-notebook/'), `dist/${file}: Field Notebook lab leaked into sitemap`);
  }
}

async function verifyForbiddenRootRoutes() {
  for (const [route, sources, outputs] of forbiddenRootRoutes) {
    for (const path of [...sources, ...outputs]) assert(await readOptional(path) === null, `${route}: root-level candidate exists at ${path}`);
  }
  assert((await listRelative('src/pages/visual-preview')).length === 0, '/visual-preview/: root-level candidate source directory exists');
}

async function main() {
  const base = parseBase(process.argv.slice(2));
  for (const [route, output, view] of routes) {
    const html = await readOptional(output);
    assert(html !== null, `${route}: missing generated output ${output}`);
    if (html === null) continue;
    verifyCommonPage(route, html, base);
    verifyView(route, view, html);
  }
  await verifyStylesheet();
  await verifySourceIsolation();
  await verifySitemaps();
  await verifyForbiddenRootRoutes();

  if (failures.length > 0) {
    console.error(`Field Notebook verification failed (${failures.length})`);
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`Expected Astro base: ${base}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Field Notebook verification passed: ${routes.length} routes at base ${base}`);
  console.log('Checks: semantics, accessibility, links, article anchors, isolation, sitemap, scoped CSS');
}

main().catch((error) => {
  console.error(`Field Notebook verification could not run: ${error.message}`);
  process.exitCode = 1;
});
