// ============================================================
// src/export-modal-helpers.js
// ============================================================
// Pure helpers for the Export-to-AO3 modal (PR D of v1.0 UX pass).
//
//   slugifyChapterTitle(title)
//     → URL-safe ascii slug for download filenames; falls back to
//       'ao3works-chapter' on empty / unusable input.
//
//   bigPillForSeverity({ severity, installed, current, chapterUsesNewBlock })
//     → { text, tone } for the big status pill in Tab 2.
//       tone ∈ 'not-installed' | 'up-to-date' | 'cosmetic'
//             | 'bug-fix' | 'new-feature' | 'new-feature-required'
//
//   chapterUsesAnyClass(html, classes)
//     → true iff any class in `classes` appears in the export HTML.
//       Tolerates html with or without surrounding whitespace.
//
//   chapterDependsOnNewerSkin(html, changesSince)
//     → true iff any `introduces:` class from `changesSince` appears
//       in the export HTML. Used to upgrade 'new-feature' severity
//       into 'new-feature-required' when relevant.
//
// Dual module: Node + browser (window.ao3worksExportModalHelpers).
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ao3worksExportModalHelpers = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function slugifyChapterTitle(title) {
    const fallback = 'ao3works-chapter';
    if (title == null) return fallback;
    const s = String(title)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return s || fallback;
  }

  function chapterUsesAnyClass(html, classes) {
    if (!html || !Array.isArray(classes) || classes.length === 0) return false;
    const src = String(html);
    for (const cls of classes) {
      if (!cls) continue;
      const re = new RegExp(
        '\\bclass\\s*=\\s*["\'][^"\']*\\b' +
          cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '\\b',
        'i'
      );
      if (re.test(src)) return true;
    }
    return false;
  }

  function chapterDependsOnNewerSkin(html, changesSince) {
    if (!Array.isArray(changesSince) || changesSince.length === 0) return false;
    const all = [];
    for (const entry of changesSince) {
      if (Array.isArray(entry.introduces)) {
        for (const c of entry.introduces) all.push(c);
      }
    }
    return chapterUsesAnyClass(html, all);
  }

  function bigPillForSeverity(opts) {
    const o = opts || {};
    const current = String(o.current || '');
    const installed = o.installed == null || o.installed === '' ? null : String(o.installed);
    const severity = o.severity || 'none';
    const dependsOnNew = !!o.chapterUsesNewBlock;

    if (installed == null) {
      return { text: 'Install the AO3 Works skin', tone: 'not-installed' };
    }
    if (severity === 'none') {
      return { text: 'You’re on skin v' + current + ' · up to date', tone: 'up-to-date' };
    }
    if (severity === 'cosmetic') {
      return { text: 'Skin update available (cosmetic) — optional', tone: 'cosmetic' };
    }
    if (severity === 'bug-fix') {
      return { text: 'Skin update recommended (bug-fix)', tone: 'bug-fix' };
    }
    if (severity === 'new-feature') {
      if (dependsOnNew) {
        return { text: 'Skin update REQUIRED for this chapter', tone: 'new-feature-required' };
      }
      return { text: 'Skin update available (new block)', tone: 'new-feature' };
    }
    return { text: 'Skin status', tone: 'up-to-date' };
  }

  return {
    slugifyChapterTitle,
    chapterUsesAnyClass,
    chapterDependsOnNewerSkin,
    bigPillForSeverity,
  };
});
