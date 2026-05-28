// ============================================================
// src/lib/ao3-sanitize.js
// ============================================================
// JS port of AO3's HTML + CSS sanitizers. Sources of truth:
//   /home/user/workspace/ao3_config.yml (HTML & CSS allowlists)
//   /home/user/workspace/ao3_css_cleaner.rb (CSS cleaning logic)
//
// Single source of truth shared by the editor preview pipeline AND the
// regression suite. Promoted from qa/regression/ in Phase 1 of the
// editor-parity work.
//
// The Ruby is the authoritative implementation in production. This JS
// port covers the surface area we actually need to assert on:
//   1. HTML tag allowlist (everything else gets unwrapped or stripped)
//   2. HTML attribute allowlist (per-tag + global)
//   3. Empty <p></p> stripping (this is what PR #6 Fix 4 works around)
//   4. CSS property allowlist (longhand + shorthand-prefix)
//
// API:
//   sanitizeJS(html, css?) → { html: string, css: string|null }
//
// Both PR runs (fast, JS only) and nightly runs (compare to Ruby) call
// this same function. ao3-sanitize-ruby-bridge.js wraps the real Ruby
// implementation and produces the same shape.
//
// Dual module: when running in Node (CommonJS) it exports via
// module.exports; when loaded as a <script> in the browser it attaches
// the same names to window.ao3worksSanitize.
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksSanitize = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // ── HTML allowlist (mirrors sanitizer_config.rb ARCHIVE config) ──
const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'acronym', 'address', 'b', 'big', 'blockquote', 'br',
  'caption', 'center', 'cite', 'code', 'col', 'colgroup',
  'details', 'figcaption', 'figure',
  'dd', 'del', 'dfn', 'div', 'dl', 'dt',
  'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'i', 'img', 'ins',
  'kbd',
  'li',
  'ol',
  'p', 'pre',
  'q',
  'rp', 'rt', 'ruby',
  's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'tt',
  'u', 'ul',
  'var'
]);

// Tags whose CONTENTS are also stripped (not just the tag).
const REMOVE_CONTENT_TAGS = new Set([
  'iframe', 'math', 'noembed', 'noframes', 'noscript', 'plaintext',
  'script', 'style', 'svg', 'xmp'
]);

// Per-tag allowed attribute lists; 'all' applies to every element.
const ALLOWED_ATTRS = {
  all: new Set(['align', 'title', 'dir', 'class']),
  a: new Set(['href', 'name', 'rel', 'target']),
  blockquote: new Set(['cite']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span', 'width']),
  details: new Set(['open']),
  hr: new Set(['align', 'width']),
  img: new Set(['align', 'alt', 'border', 'height', 'src', 'width']),
  ol: new Set(['start', 'type']),
  q: new Set(['cite']),
  table: new Set(['border', 'summary', 'width']),
  td: new Set(['abbr', 'axis', 'colspan', 'height', 'rowspan', 'width']),
  th: new Set(['abbr', 'axis', 'colspan', 'height', 'rowspan', 'scope', 'width']),
  ul: new Set(['type'])
};

// data-* attributes are NOT in AO3's allowlist (verified against
// sanitizer_config.rb — no wildcard attribute config).

// ── CSS allowlist (mirrors config.yml SUPPORTED_CSS_PROPERTIES) ──
// (Subset: enough to validate skin CSS rules. The runner only sanitizes
// CSS when given a css argument, which the harness currently doesn't
// exercise — kept here for future regression of work-skin CSS.)
const CSS_LONGHAND = new Set([
  'accelerator','accent-color','align-content','align-items','align-self',
  'box-shadow','box-sizing','clear','clip','color','content','counter-increment',
  'counter-reset','cursor','direction','display','filter','float','font','font-family',
  'font-size','font-style','font-variant','font-weight','height','justify-content',
  'left','letter-spacing','line-height','max-height','max-width','min-height',
  'min-width','opacity','order','position','right','table-layout','top',
  'unicode-bidi','vertical-align','visibility','white-space','widows','width',
  'word-break','word-spacing','word-wrap','writing-mode','z-index'
]);
const CSS_SHORTHAND = new Set([
  'background','border','column','cue','flex','font','layer-background',
  'layout-grid','list-style','margin','marker','outline','overflow','padding',
  'page-break','pause','scrollbar','text','transform','transition'
]);
// Known stripped in practice even when the shorthand regex would accept
// (mirrors qa/lib/property-allowlist-check.js KNOWN_STRIPPED_OVERRIDES on PR #5).
const KNOWN_STRIPPED = new Set([
  'flex-wrap','flex-direction','flex-basis','flex-grow','flex-shrink','flex-flow',
  'column-gap'
]);

function isCssPropertyAllowed(prop) {
  prop = prop.toLowerCase();
  if (prop.startsWith('--')) return false;
  if (KNOWN_STRIPPED.has(prop)) return false;
  if (CSS_LONGHAND.has(prop)) return true;
  for (const sh of CSS_SHORTHAND) {
    if (prop === sh || prop.startsWith(sh + '-')) return true;
  }
  return false;
}

// ── HTML scanner ──────────────────────────────────────────────────
// A purposefully small, deterministic HTML scanner. It is NOT a full
// HTML parser — it is enough to walk AO3 Works's well-formed export. If
// the export ever diverges, the runner will diff and we'll catch it.

// Self-closing void elements (HTML5 spec).
const VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'
]);

function parseAttrs(attrString) {
  // Tokenize: name="value" | name='value' | name | name=value
  const out = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    out.push({ name, value });
  }
  return out;
}

function attrAllowed(tag, attrName) {
  if (ALLOWED_ATTRS.all.has(attrName)) return true;
  const set = ALLOWED_ATTRS[tag];
  return set ? set.has(attrName) : false;
}

function renderAttrs(tag, attrs) {
  const kept = [];
  for (const { name, value } of attrs) {
    if (!attrAllowed(tag, name)) continue;
    if (value === '') {
      kept.push(name);
    } else {
      const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      kept.push(`${name}="${escaped}"`);
    }
  }
  return kept.length ? ' ' + kept.join(' ') : '';
}

function sanitizeHtml(html) {
  // First pass: drop scripts/styles/etc. with their contents.
  let cleaned = html;
  for (const tag of REMOVE_CONTENT_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
    cleaned = cleaned.replace(re, '');
    // Also strip standalone open/close tags that may have been present.
    cleaned = cleaned.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '');
  }

  // Strip HTML comments.
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Walk all opening / self-closing / closing tags and rewrite/strip.
  cleaned = cleaned.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (full, rawTag, rest) => {
    const tag = rawTag.toLowerCase();
    const isClose = full.startsWith('</');
    if (!ALLOWED_TAGS.has(tag)) {
      // Disallowed tag → strip tag, keep contents (the regex doesn't
      // know about nesting; this matches AO3's "unwrap" behavior).
      return '';
    }
    if (isClose) return `</${tag}>`;
    const attrs = parseAttrs(rest);
    const selfClose = /\/\s*$/.test(rest) || VOID_TAGS.has(tag);
    const attrStr = renderAttrs(tag, attrs);
    return selfClose ? `<${tag}${attrStr}>` : `<${tag}${attrStr}>`;
  });

  // Strip truly-empty <p></p> (this is what PR #6 Fix 4 works around;
  // we keep this here so we can assert <p>&nbsp;</p> survives.)
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');

  return cleaned;
}

function sanitizeCss(css) {
  if (!css) return '';
  // Parse rule blocks: selector { decls }
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors, body) => {
    const declarations = body.split(/;/).map(d => d.trim()).filter(Boolean);
    const kept = [];
    for (const decl of declarations) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (isCssPropertyAllowed(prop)) kept.push(`${prop}: ${value}`);
    }
    if (!kept.length) return '';
    return `${selectors.trim()} { ${kept.join('; ')}; }`;
  });
}

function sanitizeJS(html, css) {
  return {
    html: sanitizeHtml(html || ''),
    css: css === undefined ? null : sanitizeCss(css)
  };
}

  return { sanitizeJS, sanitizeHtml, sanitizeCss, isCssPropertyAllowed };
});
