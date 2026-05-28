// ============================================================
// src/lib/preview-renderer.js
// ============================================================
// Composes the HTML document loaded into the export-modal preview
// iframe. Pure / no-DOM. The result is exactly what AO3 will render:
//
//   <head>
//     <link rel="stylesheet" href="assets/ao3-baseline.css">  (AO3 site)
//     <style>…sanitized workskin CSS…</style>                 (master)
//   </head>
//   <body>
//     <div id="workskin" class="userstuff">…sanitized html…</div>
//   </body>
//
// The <link> is loaded FIRST so master-skin / user CSS layers on top
// per cascade order, exactly as on AO3. Content is wrapped in
// `#workskin.userstuff` because that's how AO3 wraps user content
// and many workskin rules depend on the `#workskin` ancestor.
//
// API:
//   buildPreviewDocument({ html, css, baselineHref })  → string
//
// Dual module: Node + browser (window.ao3worksPreviewRenderer).
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ao3worksPreviewRenderer = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function buildPreviewDocument({ html, css, baselineHref }) {
    const safeBaseline = baselineHref || 'assets/ao3-baseline.css';
    // Escape </style> inside user CSS to prevent premature close.
    const safeCss = (css || '').replace(/<\/style/gi, '<\\/style');
    return [
      '<!DOCTYPE html>',
      '<html><head>',
      '<meta charset="utf-8">',
      `<link rel="stylesheet" href="${safeBaseline}">`,
      `<style>${safeCss}</style>`,
      '</head><body>',
      `<div id="workskin" class="userstuff">${html || ''}</div>`,
      '</body></html>',
    ].join('\n');
  }

  return { buildPreviewDocument };
});
