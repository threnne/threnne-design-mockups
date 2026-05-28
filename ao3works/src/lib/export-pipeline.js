// ============================================================
// AO3 STUDIO — src/lib/export-pipeline.js
// ============================================================
// Pure export-pipeline helpers extracted from src/script.js so the same
// code path can be exercised from Node (regression suite) AND the
// browser editor. No DOM or window access here.
//
// Dual module: when running in Node (CommonJS) it exports via
// module.exports; when loaded as a <script> in the browser it attaches
// the same names to window.ao3worksExportPipeline. The browser editor
// keeps using top-level locals via the wrapper at the bottom of this
// file, so src/script.js doesn't need to know about either form.
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksExportPipeline = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Strip TipTap-generated style attributes for text-align, collapse and
  // tidy empty paragraphs. Mirrors the legacy cleanExportHTML in script.js.
  function cleanExportHTML(html) {
    return (html || '')
      .replace(/style="[^"]*text-align:\s*center;?[^"]*"/gi, 'class="align-center"')
      .replace(/style="[^"]*text-align:\s*right;?[^"]*"/gi, 'class="align-right"')
      .replace(/style="[^"]*text-align:\s*justify;?[^"]*"/gi, 'class="align-justify"')
      .replace(/\n\s*/g, '')
      .replace(/(<p[^>]*><\/p>){3,}/g, '<p></p>')
      .replace(/<p((?:\s+[^>]*)?)><\/p>/g, '<p$1>&nbsp;</p>');
  }

  // Inject a class onto the FIRST opening <p>/<h1..h6> tag of an HTML snippet.
  function injectAlignClass(html, className) {
    if (!html || !className) return html;
    return html.replace(/^<(p|h[1-6])(\s[^>]*)?>/i, (full, tag, rest) => {
      const existing = rest || '';
      const m = existing.match(/^(.*?\sclass=")([^"]*)("[\s\S]*)$/i);
      if (m) {
        const current = m[2].trim();
        if (current.split(/\s+/).includes(className)) return full;
        return `<${tag}${m[1]}${current ? current + ' ' : ''}${className}${m[3]}>`;
      }
      return `<${tag}${existing} class="${className}">`;
    });
  }

  // Recursively clone JSON and strip attrs.textAlign === 'left'.
  function stripDefaultTextAlign(node) {
    if (!node || typeof node !== 'object') return node;
    const out = Array.isArray(node) ? node.slice() : Object.assign({}, node);
    if (out.attrs && out.attrs.textAlign === 'left') {
      const a = Object.assign({}, out.attrs);
      delete a.textAlign;
      out.attrs = a;
    }
    if (Array.isArray(out.content)) {
      out.content = out.content.map(stripDefaultTextAlign);
    }
    return out;
  }

  // Pure export-HTML builder. Takes:
  //   docJson — TipTap doc JSON ({ type: 'doc', content: [...] })
  //   opts:
  //     generateNodeHtml(doc) -> string  — required; serializes a one-node doc
  //                                         (typically @tiptap/html generateHTML)
  //     skinInnerHtmlFromAttrs(type, contentData) -> string — optional; renders
  //                                         a skin block's inner HTML
  //
  function utf8ToBase64Json(obj) {
    const json = JSON.stringify(obj || {});
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(json, 'utf8').toString('base64');
    }
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // Mirrors the behavior of getExportHTML() in src/script.js (Fixes 1+3+4 from PR #6).
  function buildExportHtmlFromJson(docJson, opts) {
    if (!docJson || !docJson.content || !Array.isArray(docJson.content)) return '';
    const generateNodeHtml = (opts && opts.generateNodeHtml) || null;
    const skinInner = (opts && opts.skinInnerHtmlFromAttrs) || null;
    if (typeof generateNodeHtml !== 'function') return '';

    const normalized = stripDefaultTextAlign(docJson);
    const parts = [];

    for (const node of normalized.content) {
      if (node.type === 'skinBlock') {
        const attrs = node.attrs || {};
        const data = attrs.contentData || {};
        if (data._importPlaceholder) {
          const label = String(data._importSkinLabel || 'skin block')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          parts.push(`<p><em>[Rebuild ${label} block in AO3 Works before exporting]</em></p>`);
        } else {
          const inner = skinInner
            ? skinInner(attrs.type, attrs.contentData)
            : '';
          const skinType = String(attrs.type || 'imessage');
          const b64 = utf8ToBase64Json(attrs.contentData || {});
          parts.push(`<!-- ao3works-skin:${skinType}:${b64} -->\n${inner}`);
        }
      } else {
        let nodeHtml = generateNodeHtml({ type: 'doc', content: [node] });
        const ta = node.attrs && node.attrs.textAlign;
        if (ta && ta !== 'left' && (ta === 'center' || ta === 'right' || ta === 'justify')) {
          nodeHtml = injectAlignClass(nodeHtml, `align-${ta}`);
        }
        parts.push(nodeHtml);
      }
    }

    return cleanExportHTML(parts.join('\n'));
  }

  return {
    cleanExportHTML,
    injectAlignClass,
    stripDefaultTextAlign,
    utf8ToBase64Json,
    buildExportHtmlFromJson
  };
});
