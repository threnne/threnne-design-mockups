#!/usr/bin/env node
/**
 * Generate self-contained design mockups from monorepo product folders.
 */
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  copyFile,
} from 'node:fs/promises';
import { execSync } from 'node:child_process';
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCKUPS_ROOT = resolve(__dirname, '..');
const MONOREPO_ROOT = resolve(MOCKUPS_ROOT, '..');
/** Set to `/repo-name` when deploying to GitHub Pages project sites. Empty for local serve at root. */
const MOCKUPS_BASE_PATH = (() => {
  const raw = (process.env.MOCKUPS_BASE_PATH || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
})();

const PATHS = {
  assets: join(MONOREPO_ROOT, '1-assets'),
  threnne: join(MONOREPO_ROOT, '2-threnne'),
  rsSite: join(MONOREPO_ROOT, '3-romancesignal', 'site'),
  ao3: join(MONOREPO_ROOT, '4-ao3works'),
  out: {
    brand: join(MOCKUPS_ROOT, 'brand'),
    threnne: join(MOCKUPS_ROOT, 'threnne'),
    rs: join(MOCKUPS_ROOT, 'romancesignal'),
    ao3: join(MOCKUPS_ROOT, 'ao3works'),
  },
};

const RS_BOOK_SLUG = 'heated-rivalry';
const AO3_MODAL_IDS = [
  { id: 'export-panel', title: 'Export to AO3' },
  { id: 'import-html-modal', title: 'Import chapter' },
  { id: 'link-modal', title: 'Link' },
  { id: 'image-modal', title: 'Insert image' },
  { id: 'header-import-replace-modal', title: 'Replace your draft?' },
  { id: 'header-theme-modal', title: 'Preview theme' },
  { id: 'header-clear-modal', title: 'Clear your draft?' },
  { id: 'help-modal', title: 'How AO3 Works runs' },
  { id: 'data-modal', title: 'Your Data & Privacy' },
];

function log(msg) {
  console.log(`[mockups] ${msg}`);
}

function run(cmd, cwd, extraEnv = {}) {
  log(`$ ${cmd}  (in ${relative(MONOREPO_ROOT, cwd) || '.'})`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest, filter) {
  await cp(src, dest, {
    recursive: true,
    force: true,
    filter: filter
      ? (srcPath) => {
          const rel = relative(src, srcPath);
          if (!rel) return true;
          return filter(rel, srcPath);
        }
      : undefined,
  });
}

function toRelativeAsset(absolutePath, htmlFile, productRoot) {
  if (
    !absolutePath ||
    !absolutePath.startsWith('/') ||
    absolutePath.startsWith('//') ||
    absolutePath.startsWith('/.')
  ) {
    return absolutePath;
  }
  let pathname = absolutePath.split('?')[0].split('#')[0];
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = join(productRoot, pathname.slice(1));
  let rel = relative(dirname(htmlFile), target);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.split(sep).join('/');
}

function rewriteRootPaths(html, htmlFile, productRoot) {
  let out = html.replace(
    /(\s(?:href|src|content)=["'])(\/[^"'#?]*)/g,
    (match, prefix, absPath) => {
      const suffix = absPath.match(/[#?].*/)?.[0] || '';
      const pathOnly = absPath.replace(/[#?].*/, '');
      const rel = toRelativeAsset(pathOnly, htmlFile, productRoot);
      return `${prefix}${rel}${suffix}`;
    },
  );
  out = out.replace(
    /(data-brand-(?:mark|wordmark)-(?:dark|light))="(\/[^"]+)"/g,
    (_, attr, absPath) => {
      const rel = toRelativeAsset(absPath, htmlFile, productRoot);
      return `${attr}="${rel}"`;
    },
  );
  return out;
}

function rewriteFetchHandlers(html) {
  return html.replace(
    /fetch\s*\(\s*["']\/\.netlify\/functions\/[^"']+["']/g,
    'fetch("about:blank"',
  );
}

function rewriteInlineScriptPaths(html, htmlFile, productRoot) {
  return html.replace(
    /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, body) => {
      const rewritten = body.replace(
        /(["'])(\/(?:css|js|brand|data|_astro|assets|src|dist)\/[^"']+)\1/g,
        (_, quote, absPath) => {
          const rel = toRelativeAsset(absPath, htmlFile, productRoot);
          return `${quote}${rel}${quote}`;
        },
      );
      if (rewritten === body) return match;
      return `<script${attrs}>${rewritten}</script>`;
    },
  );
}

function stripReviewChrome(html) {
  let out = html;
  out = out.replace(/<link rel="stylesheet" href="[^"]*review-banner\.css"[^>]*>\s*/gi, '');
  out = out.replace(/<p class="review-banner">[\s\S]*?<\/p>\s*/gi, '');
  return out;
}

/** Directory URL for the page (leading/trailing slash) so assets resolve without a trailing slash in the browser URL. */
function pageBaseHref(htmlFile) {
  const relDir = relative(MOCKUPS_ROOT, dirname(htmlFile));
  if (!relDir || relDir === '.') return null;
  const suffix = `/${relDir.split(sep).join('/')}/`;
  return MOCKUPS_BASE_PATH ? `${MOCKUPS_BASE_PATH}${suffix}` : suffix;
}

function injectBaseHref(html, htmlFile) {
  const base = pageBaseHref(htmlFile);
  if (!base) return html;
  if (/<base\s/i.test(html)) {
    return html.replace(/<base\s[^>]*>/i, `<base href="${base}" />`);
  }
  return html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${base}" />`);
}

/** HTML page that loads this script — asset URLs in JS must resolve from there, not from src/. */
function jsPathReferenceHtml(filePath, productRoot) {
  const rootLoaded = new Set([
    'landing-fic-data.js',
    'landing-fic-animation.js',
    'builders.js',
  ]);
  if (rootLoaded.has(basename(filePath))) {
    return join(productRoot, 'index.html');
  }
  return join(productRoot, 'editor', 'index.html');
}

async function processJsFile(filePath, productRoot) {
  let js = await readFile(filePath, 'utf8');
  const refHtml = jsPathReferenceHtml(filePath, productRoot);
  js = js.replace(
    /fetch\s*\(\s*["']\/\.netlify\/functions\/[^"']+["']/g,
    'fetch("about:blank"',
  );
  js = js.replace(
    /fetch\s*\(\s*["']\/api\/[^"']+["']/g,
    'fetch("about:blank"',
  );
  js = js.replace(
    /(["'])(\/(?:css|js|brand|data|_astro|assets|src|dist)\/[^"']+)\1/g,
    (match, quote, absPath) => {
      const rel = toRelativeAsset(absPath, refHtml, productRoot);
      return `${quote}${rel}${quote}`;
    },
  );
  await writeFile(filePath, js);
}

async function walkAndProcessJs(dir, productRoot) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) await walkAndProcessJs(full, productRoot);
    else if (ent.name.endsWith('.js')) await processJsFile(full, productRoot);
  }
}

async function processHtmlFile(filePath, productRoot) {
  let html = await readFile(filePath, 'utf8');
  html = rewriteRootPaths(html, filePath, productRoot);
  html = rewriteInlineScriptPaths(html, filePath, productRoot);
  html = rewriteFetchHandlers(html);
  html = injectBaseHref(html, filePath);
  html = stripReviewChrome(html);
  await writeFile(filePath, html);
}

async function walkAndProcessHtml(dir, productRoot) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) await walkAndProcessHtml(full, productRoot);
    else if (ent.name.endsWith('.html') || ent.name.endsWith('.htm'))
      await processHtmlFile(full, productRoot);
  }
}

async function cleanProductOutputs() {
  for (const dir of [PATHS.out.threnne, PATHS.out.rs, PATHS.out.ao3]) {
    if (await exists(dir)) await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }
  await mkdir(PATHS.out.brand, { recursive: true });
}

async function copyBrandGuide() {
  const src = join(PATHS.assets, 'threnne-brand-guide.pdf');
  if (!(await exists(src))) throw new Error(`Missing brand guide: ${src}`);
  await copyFile(src, join(PATHS.out.brand, 'threnne-brand-guide.pdf'));
  log('Copied brand guide PDF');
}

async function buildThrenne() {
  if (!(await exists(join(PATHS.threnne, 'node_modules')))) {
    run('npm install', PATHS.threnne);
  }
  run('npm run build', PATHS.threnne);
  await copyDir(join(PATHS.threnne, 'dist'), PATHS.out.threnne);
  await walkAndProcessHtml(PATHS.out.threnne, PATHS.out.threnne);
  log('Threnne mockups ready');
}

async function buildRomanceSignal() {
  if (!(await exists(join(PATHS.rsSite, 'node_modules')))) {
    run('npm install', PATHS.rsSite);
  }
  run('npm run build', PATHS.rsSite, {
    ASTRO_ADAPTER: 'netlify',
    NETLIFY: 'true',
  });

  const dist = join(PATHS.rsSite, 'dist');
  if (!(await exists(dist))) {
    throw new Error(`Romance Signal build produced no dist/ at ${dist}`);
  }

  await copyDir(dist, PATHS.out.rs);

  const watchlistDir = join(PATHS.out.rs, 'watchlist');
  if (await exists(watchlistDir)) {
    const { readdir } = await import('node:fs/promises');
    for (const ent of await readdir(watchlistDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (ent.name !== RS_BOOK_SLUG) {
        await rm(join(watchlistDir, ent.name), { recursive: true, force: true });
        log(`Removed watchlist slug: ${ent.name}`);
      }
    }
  }

  const designSystemSrc = join(PATHS.rsSite, 'public', 'design-system.html');
  if (await exists(designSystemSrc)) {
    await copyFile(designSystemSrc, join(PATHS.out.rs, 'design-system.html'));
  }

  await generateRsStates();
  await walkAndProcessHtml(PATHS.out.rs, PATHS.out.rs);
  await walkAndProcessJs(join(PATHS.out.rs, 'js'), PATHS.out.rs);
  log('Romance Signal mockups ready');
}

async function cloneHtmlState(srcRel, destRel, mutate) {
  const src = join(PATHS.out.rs, srcRel);
  const dest = join(PATHS.out.rs, 'states', destRel);
  await mkdir(dirname(dest), { recursive: true });
  let html = await readFile(src, 'utf8');
  const { document } = parseHTML(html);
  mutate(document);
  html = document.documentElement.outerHTML;
  if (!html.startsWith('<!DOCTYPE')) {
    html = `<!DOCTYPE html>\n${html}`;
  }
  await writeFile(dest, html);
}

async function generateRsStates() {
  const statesDir = join(PATHS.out.rs, 'states');
  await mkdir(statesDir, { recursive: true });

  await cloneHtmlState('index.html', 'nav-mobile-open.html', (doc) => {
    const panel = doc.getElementById('navMenuPanel');
    const toggle = doc.getElementById('navMenuToggle');
    if (panel) panel.removeAttribute('hidden');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
    }
  });

  await cloneHtmlState('index.html', 'get-involved-success.html', (doc) => {
    const status = doc.getElementById('gi-status');
    if (status) {
      status.removeAttribute('hidden');
      status.setAttribute('data-kind', 'success');
      status.textContent = 'Thanks — we got it.';
    }
  });

  await cloneHtmlState('index.html', 'theme-dark.html', (doc) => {
    doc.documentElement.setAttribute('data-theme', 'dark');
  });

  const bgSrc = (await exists(join(PATHS.out.rs, 'background', 'index.html')))
    ? 'background/index.html'
    : null;
  if (bgSrc) {
    await cloneHtmlState(bgSrc, 'background-row-expanded.html', (doc) => {
      const btn = doc.querySelector('.bg-expand-btn[aria-expanded="false"]');
      const detail = btn?.closest('tr')?.nextElementSibling;
      if (btn) btn.setAttribute('aria-expanded', 'true');
      if (detail) detail.removeAttribute('hidden');
    });
  }

  log('Romance Signal state variants generated');
}

const AO3_COPY_PATHS = [
  'index.html',
  'editor',
  'assets',
  'src',
  'dist',
  'manifest.webmanifest',
  'favicon-32-light.png',
  'favicon-16-light.png',
  'apple-touch-icon.png',
];

async function buildAo3Works() {
  if (!(await exists(join(PATHS.ao3, 'node_modules')))) {
    run('npm install', PATHS.ao3);
  }
  run('npm run build', PATHS.ao3);

  for (const item of AO3_COPY_PATHS) {
    const src = join(PATHS.ao3, item);
    if (await exists(src)) {
      await cp(src, join(PATHS.out.ao3, item), { recursive: true, force: true });
    }
  }

  await generateAo3States();
  await walkAndProcessHtml(PATHS.out.ao3, PATHS.out.ao3);
  await walkAndProcessJs(join(PATHS.out.ao3, 'src'), PATHS.out.ao3);
  await generateAo3ModalGallery();
  log('AO3 Works mockups ready');
}

async function generateAo3ModalGallery() {
  const editorHtml = await readFile(join(PATHS.ao3, 'editor', 'index.html'), 'utf8');
  const { document } = parseHTML(editorHtml);

  const galleryCss = relative(
    join(PATHS.out.ao3, 'editor-modals'),
    join(MOCKUPS_ROOT, 'shared', 'review-modal-gallery.css'),
  )
    .split(sep)
    .join('/');
  const appCss = '../src/style.css';
  const tokensCss = '../assets/brand/tokens.css';
  const themeCss = '../assets/brand/theme.css';
  const legacyCss = '../assets/brand/legacy-aliases.css';

  const frames = AO3_MODAL_IDS.map(({ id, title }) => {
    const el = document.getElementById(id);
    if (!el) return `<!-- missing modal: ${id} -->`;
    const clone = el.cloneNode(true);
    clone.classList.remove('hidden');
    clone.removeAttribute('hidden');
    return `<section class="review-modal-frame" id="frame-${id}">
  <h2 class="review-modal-frame__label">${title} <code>#${id}</code></h2>
  <div class="review-modal-frame__stage">${clone.outerHTML}</div>
</section>`;
  }).join('\n');

  const hub = relative(join(PATHS.out.ao3, 'editor-modals'), join(MOCKUPS_ROOT, 'index.html'))
    .split(sep)
    .join('/');

  const page = `<!DOCTYPE html>
<html lang="en" data-theme="dark" data-brand="works">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>AO3 Works — Modal gallery (design review)</title>
  <link rel="stylesheet" href="${tokensCss}" />
  <link rel="stylesheet" href="${themeCss}" />
  <link rel="stylesheet" href="${legacyCss}" />
  <link rel="stylesheet" href="${appCss}" />
  <link rel="stylesheet" href="${galleryCss}" />
</head>
<body class="aw-theme-default-a review-gallery-page">
  <header class="review-gallery-intro">
    <h1>AO3 Works — All modals</h1>
    <p>Each dialog shown open for visual review. <a href="../editor/index.html">Open full editor</a> · <a href="${hub}">Catalog</a>.</p>
  </header>
  <main>
${frames}
  </main>
</body>
</html>`;

  const outDir = join(PATHS.out.ao3, 'editor-modals');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), page);
  await processHtmlFile(join(outDir, 'index.html'), PATHS.out.ao3);
  log('AO3 modal gallery generated');
}

async function cloneAo3State(name, mutate) {
  const src = join(PATHS.out.ao3, 'editor', 'index.html');
  let html = await readFile(src, 'utf8');
  const { document } = parseHTML(html);
  mutate(document);
  html = document.documentElement.outerHTML;
  if (!html.startsWith('<!DOCTYPE')) {
    html = `<!DOCTYPE html>\n${html}`;
  }
  const dest = join(PATHS.out.ao3, 'states', `${name}.html`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
}

async function generateAo3States() {
  await mkdir(join(PATHS.out.ao3, 'states'), { recursive: true });

  await cloneAo3State('side-panel-open', (doc) => {
    const panel = doc.getElementById('side-panel');
    if (panel) {
      panel.classList.remove('hidden');
      panel.removeAttribute('hidden');
    }
  });

  await cloneAo3State('tour-welcome', (doc) => {
    const welcome = doc.getElementById('aw-tour-welcome');
    if (welcome) {
      welcome.classList.remove('hidden');
      welcome.removeAttribute('hidden');
    }
  });

  await cloneAo3State('theme-default-a', (doc) => {
    doc.body.className = 'aw-theme-default-a';
  });

  await cloneAo3State('theme-default-b', (doc) => {
    doc.body.className = 'aw-theme-default-b';
  });

  await cloneAo3State('header-confirms', (doc) => {
    for (const id of ['header-import-confirm', 'header-clear-confirm']) {
      const el = doc.getElementById(id);
      if (el) {
        el.classList.remove('hidden');
        el.removeAttribute('hidden');
      }
    }
  });

  log('AO3 Works state variants generated');
}

async function gitHead(dir) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function writeBuildInfo() {
  const info = {
    builtAt: new Date().toISOString(),
    monorepoRoot: 'threnne',
    sources: {
      '1-assets': await gitHead(MONOREPO_ROOT),
      '2-threnne': await gitHead(PATHS.threnne),
      '3-romancesignal': await gitHead(join(MONOREPO_ROOT, '3-romancesignal')),
      '4-ao3works': await gitHead(PATHS.ao3),
    },
    rsBookSlug: RS_BOOK_SLUG,
  };
  await writeFile(join(MOCKUPS_ROOT, 'BUILD_INFO.json'), JSON.stringify(info, null, 2));
  log('Wrote BUILD_INFO.json');
}

async function reprocessHtmlOnly() {
  for (const [name, dir] of [
    ['Threnne', PATHS.out.threnne],
    ['Romance Signal', PATHS.out.rs],
    ['AO3 Works', PATHS.out.ao3],
  ]) {
    if (await exists(dir)) {
      await walkAndProcessHtml(dir, dir);
      log(`Reprocessed HTML in ${name}`);
    }
  }
  const ao3Src = join(PATHS.out.ao3, 'src');
  if (await exists(ao3Src)) {
    await walkAndProcessJs(ao3Src, PATHS.out.ao3);
    log('Reprocessed JS in AO3 Works');
  }
}

async function main() {
  log(`Monorepo root: ${MONOREPO_ROOT}`);
  if (process.argv.includes('--reprocess-html')) {
    await reprocessHtmlOnly();
    log('Done — HTML reprocessed');
    return;
  }
  await cleanProductOutputs();
  await copyBrandGuide();
  await buildThrenne();
  await buildRomanceSignal();
  await buildAo3Works();
  await writeBuildInfo();
  log('Done — run npm run serve in mockups/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
