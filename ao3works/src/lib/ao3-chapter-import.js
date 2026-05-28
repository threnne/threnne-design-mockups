// ============================================================
// AO3 Works — src/lib/ao3-chapter-import.js
// ============================================================
// Segments AO3 chapter HTML into prose + skin blocks; reverse-parses
// rendered workskin markup into editable skinBlock data when possible.
// Dual module: CommonJS + window.ao3worksChapterImport
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksChapterImport = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function getSkinReverseModule() {
    if (typeof window !== 'undefined' && window.ao3worksSkinHtmlReverse) {
      return window.ao3worksSkinHtmlReverse;
    }
    if (typeof module === 'object' && module.exports) {
      try {
        return require('./skin-html-reverse.js');
      } catch {
        return null;
      }
    }
    return null;
  }

  const AO3WORKS_SKIN_COMMENT_RE = /^\s*ao3works-skin:([a-z]+):([A-Za-z0-9+/=]+)\s*$/i;

  const SKIN_REGISTRY = [
    { type: 'imessage', label: 'iMessage', selector: '.ios-phone' },
    { type: 'whatsapp', label: 'WhatsApp', selector: '.whatsapp-chat' },
    { type: 'snapchat', label: 'Snapchat', selector: '.snapchat-chat' },
    { type: 'android', label: 'Android SMS', selector: '.android-chat' },
    { type: 'chatroom', label: 'Slack', selector: '.slack-chat' },
    { type: 'discord', label: 'Discord', selector: '.discord-chat' },
    { type: 'letter', label: 'Letter', selector: '.letter-wrapper' },
    { type: 'tweet', label: 'Tweet', selector: '.tweet-container' },
    { type: 'gmail', label: 'Gmail', selector: '.gmail-container' },
    { type: 'tumblr', label: 'Tumblr', selector: '.tumblr-thread' },
    { type: 'spoiler', label: 'Spoiler', selector: 'details' },
    { type: 'review', label: 'Review', selector: '.review-box' },
    { type: 'reddit', label: 'Reddit', selector: '.reddit-post' },
    { type: 'bluesky', label: 'Bluesky', selector: '.bluesky-post' },
    { type: 'newspaper', label: 'Newspaper', selector: '.newspaper-wrap' },
    { type: 'forum', label: 'Forum', selector: '.forum-thread' },
    { type: 'facebook', label: 'Facebook', selector: '.facebook-post' },
    { type: 'instagram', label: 'Instagram', selector: '.instagram-post' },
    { type: 'sticky', label: 'Sticky note', selector: '.sticky-note' },
  ];

  const SKIN_ROOT_SELECTOR = SKIN_REGISTRY.map((e) => e.selector).join(', ');
  const SKIN_CLASS_RE = new RegExp(
    SKIN_REGISTRY.map((e) => e.selector.replace(/^\./, '')).join('|')
  );

  const BLOCK_TAGS = new Set([
    'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI',
    'HR', 'TABLE', 'DETAILS', 'PRE', 'FIGURE',
  ]);

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getDOMParser() {
    if (typeof DOMParser !== 'undefined') return DOMParser;
    return null;
  }

  function parseHtmlDocument(html) {
    const DP = getDOMParser();
    if (!DP) return null;
    try {
      return new DP().parseFromString(String(html || ''), 'text/html');
    } catch {
      return null;
    }
  }

  function extractChapterBody(html) {
    const cleaned = String(html || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '');
    const doc = parseHtmlDocument(cleaned);
    if (!doc || !doc.body) return cleaned;
    const workskin = doc.getElementById('workskin');
    if (workskin) return workskin.innerHTML;
    const userstuff = doc.querySelector('.userstuff');
    if (userstuff) return userstuff.innerHTML;
    return doc.body.innerHTML;
  }

  function registryEntryForElement(el) {
    if (!el || el.nodeType !== 1) return null;
    for (const entry of SKIN_REGISTRY) {
      try {
        if (el.matches(entry.selector)) return entry;
      } catch {
        /* invalid matches in old browsers */
      }
    }
    return null;
  }

  function promoteBlockNode(node) {
    if (!node || node.nodeType !== 1) return null;
    const entry = registryEntryForElement(node);
    if (entry) return { entry, el: node };

    if (node.tagName === 'P') {
      const kids = Array.from(node.children).filter((c) => c.nodeType === 1);
      if (kids.length === 1) {
        const inner = registryEntryForElement(kids[0]);
        if (inner) return { entry: inner, el: kids[0] };
      }
    }

    for (const reg of SKIN_REGISTRY) {
      let found;
      try {
        found = node.querySelector(reg.selector);
      } catch {
        found = null;
      }
      if (!found) continue;
      if (node.contains(found)) {
        const top = registryEntryForElement(found);
        if (top) return { entry: top, el: found };
      }
    }
    return null;
  }

  function isInsideKnownSkin(el) {
    let p = el.parentElement;
    while (p) {
      if (registryEntryForElement(p)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function looksLikeUnknownSkinBlock(node) {
    if (!node || node.nodeType !== 1) return false;
    if (registryEntryForElement(node)) return false;
    if (promoteBlockNode(node)) return false;
    const tag = node.tagName;
    if (tag !== 'DIV' && tag !== 'SECTION' && tag !== 'ARTICLE') return false;
    const cls = node.getAttribute('class') || '';
    if (!cls.trim()) return false;
    const html = node.outerHTML || '';
    if (html.length < 120) return false;
    if (isInsideKnownSkin(node)) return false;
    const nestedDivs = node.querySelectorAll('div').length;
    return nestedDivs >= 1;
  }

  function sanitizePreviewHtml(html) {
    const doc = parseHtmlDocument(html);
    if (!doc || !doc.body) return '';
    doc.querySelectorAll('script, style, iframe, object, embed').forEach((el) => el.remove());
    return doc.body.innerHTML.slice(0, 4000);
  }

  function buildImportPlaceholderInnerHtml(opts) {
    const skinLabel = esc(opts.skinLabel || 'Skin block');
    const skinType = esc(opts.skinType || '');
    const reason = opts.reason === 'unsupported'
      ? 'This block uses markup AO3 Works does not recognize (often another author\u2019s custom work skin).'
      : 'Imported from AO3 \u2014 not fully editable here yet. Rebuild it with + Insert to edit and export.';
    const insertHint = opts.reason === 'unsupported'
      ? 'Delete this placeholder and recreate the scene with supported blocks, or leave as prose.'
      : `Use <strong>+ Insert \u2192 ${skinLabel}</strong> to rebuild this block.`;
    const preview = opts.previewHtml
      ? sanitizePreviewHtml(opts.previewHtml)
      : '';
    const previewBlock = preview
      ? `<details class="aw-import-placeholder-details"><summary>Preview imported HTML</summary><div class="aw-import-placeholder-preview">${preview}</div></details>`
      : '';
    return (
      `<div class="aw-import-placeholder" data-import-skin-type="${skinType}">` +
      `<p class="aw-import-placeholder-title"><strong>${skinLabel}</strong> (imported placeholder)</p>` +
      `<p class="aw-import-placeholder-body">${reason}</p>` +
      `<p class="aw-import-placeholder-hint">${insertHint}</p>` +
      previewBlock +
      `</div>`
    );
  }

  function buildSkinBlockMarkerHtml(type, contentData) {
    const skinType = String(type || 'imessage');
    const json = JSON.stringify(contentData || {});
    const encoded = json
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    return `<div data-skin-block="" data-skin-type="${skinType}" data-skin-data="${encoded}"></div>`;
  }

  function decodeSkinCommentPayload(b64) {
    if (!b64) return null;
    try {
      let jsonStr;
      if (typeof Buffer !== 'undefined') {
        jsonStr = Buffer.from(b64, 'base64').toString('utf8');
      } else {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        jsonStr = new TextDecoder().decode(bytes);
      }
      const data = JSON.parse(jsonStr);
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  function parseSkinCommentNode(node) {
    if (!node || node.nodeType !== 8) return null;
    const m = String(node.textContent || '').match(AO3WORKS_SKIN_COMMENT_RE);
    if (!m) return null;
    const contentData = decodeSkinCommentPayload(m[2]);
    if (!contentData) return null;
    return { type: m[1], contentData };
  }

  /** AO3 often wraps skins in <p>; export comments sit before that wrapper, not the skin root. */
  function readPrecedingSkinComment(el) {
    if (!el) return null;
    let node = el;
    while (node) {
      let prev = node.previousSibling;
      while (prev) {
        if (prev.nodeType === 8) {
          const parsed = parseSkinCommentNode(prev);
          if (parsed) return parsed;
          break;
        }
        if (prev.nodeType === 3) {
          if ((prev.textContent || '').trim()) break;
          prev = prev.previousSibling;
          continue;
        }
        break;
      }
      const parent = node.parentElement;
      if (!parent || parent.id === 'ao3-chapter-import-root') break;
      node = parent;
    }
    return null;
  }

  function tryReverseParseSkin(type, outerHtml) {
    const rev = getSkinReverseModule();
    if (!rev || typeof rev.reverseParseSkinHtml !== 'function') {
      return null;
    }
    const result = rev.reverseParseSkinHtml(type, outerHtml);
    return result && result.ok && result.contentData ? result.contentData : null;
  }

  function segmentChapterDom(container) {
    const segments = [];
    if (!container) return segments;

    const proseNodes = [];

    function flushProse() {
      if (!proseNodes.length) return;
      const doc = container.ownerDocument;
      const wrap = doc.createElement('div');
      proseNodes.forEach((n) => wrap.appendChild(n.cloneNode(true)));
      segments.push({ kind: 'prose', html: wrap.innerHTML });
      proseNodes.length = 0;
    }

    let pendingSkinComment = null;

    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType === 8) {
        const parsed = parseSkinCommentNode(child);
        if (parsed) pendingSkinComment = parsed;
        continue;
      }
      if (child.nodeType === 3) {
        const t = child.textContent || '';
        if (t.trim()) proseNodes.push(child);
        continue;
      }
      if (child.nodeType !== 1) continue;

      const promoted = promoteBlockNode(child);
      if (promoted) {
        flushProse();
        const fromComment = pendingSkinComment || readPrecedingSkinComment(promoted.el);
        pendingSkinComment = null;
        segments.push({
          kind: 'skin',
          type: fromComment ? fromComment.type : promoted.entry.type,
          label: promoted.entry.label,
          reason: 'known',
          outerHtml: promoted.el.outerHTML,
          contentData: fromComment ? fromComment.contentData : null,
        });
        continue;
      }

      if (looksLikeUnknownSkinBlock(child)) {
        flushProse();
        segments.push({
          kind: 'skin',
          type: null,
          label: 'Unknown skin block',
          reason: 'unsupported',
          outerHtml: child.outerHTML,
        });
        continue;
      }

      proseNodes.push(child);
    }
    flushProse();
    return segments;
  }

  function shouldUseChapterImport(html) {
    const s = String(html || '');
    if (!s.trim()) return false;
    if (/<!--\s*ao3works-backup:/i.test(s)) return false;
    if (/\bid=["']workskin["']/i.test(s) || /\bclass=["'][^"']*\buserstuff\b/i.test(s)) {
      return true;
    }
    if (SKIN_CLASS_RE.test(s)) return true;
    if (s.length > 3500 && (s.match(/<(p|div|h[1-6]|blockquote)\b/gi) || []).length >= 3) {
      return true;
    }
    return false;
  }

  function buildEditorHtmlFromSegments(segments, sanitizeProseHtml) {
    const parts = [];
    const stats = {
      proseBlocks: 0,
      placeholders: 0,
      unsupported: 0,
      reconstructed: 0,
      types: [],
    };

    for (const seg of segments) {
      if (seg.kind === 'prose') {
        const raw = String(seg.html || '').trim();
        if (!raw) continue;
        const clean = typeof sanitizeProseHtml === 'function'
          ? sanitizeProseHtml(raw)
          : raw;
        if (String(clean).trim()) {
          parts.push(clean);
          stats.proseBlocks += 1;
        }
        continue;
      }

      if (seg.kind === 'skin') {
        const label = seg.label || 'Skin block';
        const typeKey = seg.type || 'unknown';
        if (seg.reason === 'unsupported') {
          stats.unsupported += 1;
          const inner = buildImportPlaceholderInnerHtml({
            skinLabel: label,
            skinType: typeKey,
            reason: 'unsupported',
            previewHtml: seg.outerHtml,
          });
          const contentData = {
            _importPlaceholder: true,
            _importSkinType: typeKey,
            _importSkinLabel: label,
            customHtml: inner,
          };
          parts.push(buildSkinBlockMarkerHtml('legal', contentData));
          continue;
        }

        let contentData = seg.contentData || null;
        if (!contentData) {
          contentData = tryReverseParseSkin(typeKey, seg.outerHtml);
        }
        if (contentData) {
          stats.reconstructed += 1;
          stats.types.push(typeKey);
          parts.push(buildSkinBlockMarkerHtml(typeKey, contentData));
          continue;
        }

        stats.placeholders += 1;
        stats.types.push(typeKey);
        const inner = buildImportPlaceholderInnerHtml({
          skinLabel: label,
          skinType: typeKey,
          reason: 'known',
          previewHtml: seg.outerHtml,
        });
        const placeholderData = {
          _importPlaceholder: true,
          _importSkinType: typeKey,
          _importSkinLabel: label,
          customHtml: inner,
        };
        parts.push(buildSkinBlockMarkerHtml('legal', placeholderData));
      }
    }

    return { html: parts.join('\n'), stats };
  }

  function convertAo3ChapterHtmlToEditorHtml(html, opts) {
    opts = opts || {};
    if (!shouldUseChapterImport(html)) return null;

    const bodyInner = extractChapterBody(html);
    const doc = parseHtmlDocument(`<div id="ao3-chapter-import-root">${bodyInner}</div>`);
    if (!doc) return null;

    const container = doc.getElementById('ao3-chapter-import-root');
    if (!container) return null;

    const segments = segmentChapterDom(container);
    if (!segments.length) return null;

    const hasSkin = segments.some((s) => s.kind === 'skin');
    if (!hasSkin && segments.length === 1 && segments[0].kind === 'prose') {
      return null;
    }

    return buildEditorHtmlFromSegments(segments, opts.sanitizeProseHtml);
  }

  function countImportPlaceholdersInDoc(docJson) {
    let n = 0;
    if (!docJson || !Array.isArray(docJson.content)) return 0;
    function walk(nodes) {
      for (const node of nodes) {
        if (node.type === 'skinBlock') {
          const data = node.attrs && node.attrs.contentData;
          if (data && data._importPlaceholder) n += 1;
        }
        if (node.content) walk(node.content);
      }
    }
    walk(docJson.content);
    return n;
  }

  return {
    SKIN_REGISTRY,
    SKIN_ROOT_SELECTOR,
    esc,
    extractChapterBody,
    segmentChapterDom,
    shouldUseChapterImport,
    buildImportPlaceholderInnerHtml,
    buildSkinBlockMarkerHtml,
    buildEditorHtmlFromSegments,
    convertAo3ChapterHtmlToEditorHtml,
    countImportPlaceholdersInDoc,
  };
});
