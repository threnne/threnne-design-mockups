// ============================================================
// src/lib/sanitizer-warnings.js
// ============================================================
// Diffs raw vs sanitized HTML/CSS and returns a structured warning
// payload so the editor can show users WHAT AO3 will strip BEFORE
// they paste into AO3.
//
// Pure / no-DOM. Inputs are strings; outputs are plain data.
//
// API:
//   computeWarnings({ rawHtml, sanitizedHtml, rawCss, sanitizedCss })
//     → {
//         total,                     // number
//         htmlTags:  [{ tag, count }],
//         htmlAttrs: [{ tag, attr, count }],
//         cssProps:  [{ selector, prop, count }],
//       }
//
// Dual module: Node + browser (window.ao3worksSanitizerWarnings).
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ao3worksSanitizerWarnings = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Tokenize HTML into a sequence of { tag, attrs } events for opening
  // tags only. This is intentionally aligned with the sanitizer's own
  // regex-based scanner — same shape, same limitations. Good enough to
  // count drops, not to reconstruct.
  function scanOpenTags(html) {
    const out = [];
    if (!html) return out;
    const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
    let m;
    while ((m = tagRe.exec(html)) !== null) {
      const tag = m[1].toLowerCase();
      const rest = m[2];
      const attrs = [];
      let a;
      attrRe.lastIndex = 0;
      while ((a = attrRe.exec(rest)) !== null) {
        attrs.push(a[1].toLowerCase());
      }
      out.push({ tag, attrs });
    }
    return out;
  }

  // Count a multiset key → count. Order-independent; the sanitizer
  // never reorders content so positional comparison would be
  // unnecessarily fragile.
  function multisetCount(items, keyFn) {
    const map = new Map();
    for (const item of items) {
      const k = keyFn(item);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  // Compute drops = rawCount - sanCount for each key. Negatives are
  // clamped to 0 (sanitizer should never add things).
  function diffMultisets(raw, sanitized) {
    const out = [];
    for (const [k, rawCount] of raw) {
      const sanCount = sanitized.get(k) || 0;
      const dropped = rawCount - sanCount;
      if (dropped > 0) out.push({ key: k, count: dropped });
    }
    return out;
  }

  function diffHtmlTags(rawHtml, sanitizedHtml) {
    const rawTags = scanOpenTags(rawHtml);
    const sanTags = scanOpenTags(sanitizedHtml);
    const rawMap = multisetCount(rawTags, (e) => e.tag);
    const sanMap = multisetCount(sanTags, (e) => e.tag);
    return diffMultisets(rawMap, sanMap)
      .map((d) => ({ tag: d.key, count: d.count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  function diffHtmlAttrs(rawHtml, sanitizedHtml) {
    const rawTags = scanOpenTags(rawHtml);
    const sanTags = scanOpenTags(sanitizedHtml);
    // For attribute diffing we count (tag, attr) pairs across all
    // opening tags. Attribute drops within a kept tag are the case
    // we care about; tags that were entirely removed already show
    // up in diffHtmlTags so we exclude their attrs here.
    const sanTagMultiset = multisetCount(sanTags, (e) => e.tag);
    const rawAttrs = [];
    // Track how many of each tag remain "kept" so we only count
    // attribute drops within the surviving instances.
    const remaining = new Map(sanTagMultiset);
    for (const ev of rawTags) {
      const left = remaining.get(ev.tag) || 0;
      if (left <= 0) continue; // tag entirely stripped → not an attr drop
      remaining.set(ev.tag, left - 1);
      for (const a of ev.attrs) rawAttrs.push({ tag: ev.tag, attr: a });
    }
    const sanAttrs = [];
    for (const ev of sanTags) {
      for (const a of ev.attrs) sanAttrs.push({ tag: ev.tag, attr: a });
    }
    const rawMap = multisetCount(rawAttrs, (e) => `${e.tag}|${e.attr}`);
    const sanMap = multisetCount(sanAttrs, (e) => `${e.tag}|${e.attr}`);
    return diffMultisets(rawMap, sanMap).map((d) => {
      const [tag, attr] = d.key.split('|');
      return { tag, attr, count: d.count };
    }).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag) || a.attr.localeCompare(b.attr));
  }

  // CSS prop diff: per-selector property names that disappeared.
  function parseCssDecls(css) {
    if (!css) return [];
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      const selector = m[1].trim();
      const decls = m[2].split(';').map((d) => d.trim()).filter(Boolean);
      for (const decl of decls) {
        const idx = decl.indexOf(':');
        if (idx < 0) continue;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        out.push({ selector, prop });
      }
    }
    return out;
  }

  function diffCssProps(rawCss, sanitizedCss) {
    const rawList = parseCssDecls(rawCss);
    const sanList = parseCssDecls(sanitizedCss);
    const rawMap = multisetCount(rawList, (e) => `${e.selector}|${e.prop}`);
    const sanMap = multisetCount(sanList, (e) => `${e.selector}|${e.prop}`);
    return diffMultisets(rawMap, sanMap).map((d) => {
      const idx = d.key.indexOf('|');
      return {
        selector: d.key.slice(0, idx),
        prop: d.key.slice(idx + 1),
        count: d.count,
      };
    }).sort((a, b) => b.count - a.count || a.selector.localeCompare(b.selector) || a.prop.localeCompare(b.prop));
  }

  function computeWarnings({ rawHtml, sanitizedHtml, rawCss, sanitizedCss }) {
    const htmlTags = diffHtmlTags(rawHtml || '', sanitizedHtml || '');
    const htmlAttrs = diffHtmlAttrs(rawHtml || '', sanitizedHtml || '');
    const cssProps = (rawCss != null && sanitizedCss != null)
      ? diffCssProps(rawCss, sanitizedCss)
      : [];
    const total =
      htmlTags.reduce((s, x) => s + x.count, 0) +
      htmlAttrs.reduce((s, x) => s + x.count, 0) +
      cssProps.reduce((s, x) => s + x.count, 0);
    return { total, htmlTags, htmlAttrs, cssProps };
  }

  return { computeWarnings, scanOpenTags, parseCssDecls };
});
