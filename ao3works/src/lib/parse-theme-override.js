// ============================================================
// src/lib/parse-theme-override.js
// ============================================================
// Pure parser for the ?theme=... query parameter used by /editor/.
//
// The param is an ephemeral surface override for QA and design
// preview — it applies for the current page load only and is NOT
// persisted to aw.viewAsSurface localStorage. See PR-L.
//
// Recognized values mirror the SURFACES map in editor/index.html:
//   default-a, default-b, ao3-reversi
//
// API:
//   parseThemeOverride(search) → string | null
//     search: a query string (e.g. window.location.search) or null
//     returns: a recognized surface id, or null if absent/unknown
//
// Dual module: Node + browser (window.ao3worksParseThemeOverride).
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ao3worksParseThemeOverride = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const RECOGNIZED = ['default-a', 'default-b', 'ao3-reversi'];

  function parseThemeOverride(search) {
    if (typeof search !== 'string' || !search) return null;
    try {
      const qp = new URLSearchParams(search);
      const t = qp.get('theme');
      if (t && RECOGNIZED.indexOf(t) !== -1) return t;
    } catch (e) { /* old browser / malformed */ }
    return null;
  }

  return { parseThemeOverride, RECOGNIZED };
});
