// ============================================================
// AO3 STUDIO — welcome.js (draft import parsers)
// ============================================================
// Client-side parsers for .docx / .md / .txt / AO3 HTML imports.
// Used by the header Import button (editor/index.html).
//
// Exported on window.__ao3worksWelcomeInternals__ for unit tests.

(function () {
  'use strict';

  // ── File detection ───────────────────────────────────────────
  // Returns 'docx' | 'md' | 'txt' | 'html' | null
  function detectFileKind(file) {
    if (!file || !file.name) return null;
    var name = String(file.name).toLowerCase();
    var type = (file.type || '').toLowerCase();
    if (name.endsWith('.docx') ||
        type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'docx';
    }
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
    if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
    if (name.endsWith('.txt') || type === 'text/plain') return 'txt';
    if (type === 'text/markdown') return 'md';
    if (type === 'text/html') return 'html';
    return null;
  }

  // ── Minimal markdown → HTML ──────────────────────────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function applyInlineMd(line) {
    var s = escapeHtml(line);
    s = s.replace(/`([^`]+?)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, '$1<em>$2</em>');
    return s;
  }

  function mdToHtml(md) {
    if (md == null) return '';
    var src = String(md).replace(/\r\n?/g, '\n');
    var lines = src.split('\n');
    var out = [];
    var i = 0;
    var paraBuf = [];
    var listBuf = [];
    var listType = null;

    function flushPara() {
      if (!paraBuf.length) return;
      var text = paraBuf.join(' ').trim();
      if (text) out.push('<p>' + applyInlineMd(text) + '</p>');
      paraBuf = [];
    }
    function flushList() {
      if (!listBuf.length || !listType) return;
      out.push('<' + listType + '>' + listBuf.map(function (it) {
        return '<li>' + applyInlineMd(it) + '</li>';
      }).join('') + '</' + listType + '>');
      listBuf = [];
      listType = null;
    }

    while (i < lines.length) {
      var raw = lines[i];
      var line = raw.replace(/\s+$/, '');

      if (line === '') {
        flushPara();
        flushList();
        i++;
        continue;
      }

      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushPara();
        flushList();
        var level = h[1].length;
        out.push('<h' + level + '>' + applyInlineMd(h[2].trim()) + '</h' + level + '>');
        i++;
        continue;
      }

      var ul = line.match(/^[-*]\s+(.*)$/);
      if (ul) {
        flushPara();
        if (listType !== 'ul') { flushList(); listType = 'ul'; }
        listBuf.push(ul[1]);
        i++;
        continue;
      }

      var ol = line.match(/^\d+\.\s+(.*)$/);
      if (ol) {
        flushPara();
        if (listType !== 'ol') { flushList(); listType = 'ol'; }
        listBuf.push(ol[1]);
        i++;
        continue;
      }

      if (/^([-*_])\1{2,}$/.test(line.trim())) {
        flushPara();
        flushList();
        out.push('<hr>');
        i++;
        continue;
      }

      flushList();
      paraBuf.push(line.trim());
      i++;
    }
    flushPara();
    flushList();
    return out.join('\n');
  }

  function extractAo3BodyHtml(html) {
    if (!html) return '';
    var cleaned = String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '');

    if (typeof DOMParser === 'undefined') return cleaned;
    var doc;
    try { doc = new DOMParser().parseFromString(cleaned, 'text/html'); }
    catch (_) { return cleaned; }
    if (!doc || !doc.body) return cleaned;

    var workskin = doc.getElementById('workskin');
    if (workskin) return workskin.innerHTML;
    var userstuff = doc.querySelector('.userstuff');
    if (userstuff) return userstuff.innerHTML;
    return doc.body.innerHTML;
  }

  function parseTextFile(text, kind) {
    if (kind === 'md') return mdToHtml(text);
    if (kind === 'html') {
      var body = extractAo3BodyHtml(text);
      if (typeof window !== 'undefined' && typeof window.ao3worksSanitizeImportedHtml === 'function') {
        body = window.ao3worksSanitizeImportedHtml(body);
      }
      return body;
    }
    var blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
    return blocks
      .map(function (b) { return b.trim(); })
      .filter(Boolean)
      .map(function (b) {
        return '<p>' + escapeHtml(b).replace(/\n/g, '<br>') + '</p>';
      })
      .join('\n');
  }

  if (typeof window !== 'undefined') {
    window.__ao3worksWelcomeInternals__ = {
      detectFileKind: detectFileKind,
      mdToHtml: mdToHtml,
      extractAo3BodyHtml: extractAo3BodyHtml,
      parseTextFile: parseTextFile,
    };
  }
})();
