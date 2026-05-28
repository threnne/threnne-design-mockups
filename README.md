# Threnne design mockups

Self-contained static snapshots of Threnne product UIs for isolated visual design review. Safe to push as its own GitHub repository.

## Contents

- **Hub** — [`index.html`](index.html) catalog of every mockup
- **Brand** — [`brand/threnne-brand-guide.pdf`](brand/threnne-brand-guide.pdf) (from `1-assets/`)
- **Threnne** — home, Exchange
- **Romance Signal** — marketing pages + `heated-rivalry` book detail only
- **AO3 Works** — home, editor, modal gallery, UI states

## Regenerate (from monorepo)

Requires a checkout where these folders are siblings of `mockups/`:

- `1-assets/`
- `2-threnne/`
- `3-romancesignal/site/`
- `4-ao3works/`

```bash
cd mockups
npm install
npm run build
```

This builds each product, copies output into `mockups/`, rewrites asset paths for static hosting, and writes `BUILD_INFO.json`.

## View locally

```bash
npm run serve
```

Open [http://localhost:4173](http://localhost:4173) for the hub, then browse into each product folder.

Nested pages include a `<base href="…/">` tag so CSS and assets load even when you visit clean URLs like `/threnne/exchange` (no trailing slash). If you already built mockups before this fix, run `node scripts/build.mjs --reprocess-html` instead of a full rebuild.

**Use `npm run serve` — do not open HTML files directly in the editor preview.** Opening `*.html` via `file://` or Cursor’s simple browser often blocks stylesheets and shows unstyled text.

## Publish to a new GitHub repo

1. Run `npm run build` so generated HTML/assets are current.
2. Initialize a repo with **this folder as the root** (or copy `mockups/*` into the new repo root).
3. Commit everything except `node_modules/` (generated pages **should** be committed so reviewers need not build).
4. Enable **GitHub Pages** → GitHub Actions (workflow deploys on push to `main`).

Live URL: `https://threnne.github.io/threnne-design-mockups/` (project site; CI rewrites `<base href>` for the repo prefix).

## Notes

- Forms and API calls are static-only (no Netlify functions in mockups).
- Romance Signal book detail includes only the `heated-rivalry` slug.
- AO3 editor requires `dist/editor.bundle.js` from the product build.
