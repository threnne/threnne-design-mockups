// ============================================================
// AO3 Works — src/lib/chapter-file-parse.js
// Download backup comment parse (TipTap doc restore).
// Dual module: CommonJS + window.ao3worksChapterFileParse
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksChapterFileParse = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const AO3WORKS_BACKUP_COMMENT_RE = /^\s*<!--\s*ao3works-backup:([A-Za-z0-9+/=]+)\s*-->\s*/;

  function stripBom(str) {
    return String(str || '').replace(/^\uFEFF/, '');
  }

  function base64ToUtf8(b64) {
    if (typeof Buffer !== 'undefined') {
      try {
        return Buffer.from(b64, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }

  function stripLeadingBackupComment(raw) {
    const s = stripBom(raw);
    const m = s.match(AO3WORKS_BACKUP_COMMENT_RE);
    if (!m) return { stripped: s, b64: null, hadComment: false };
    return { stripped: s.slice(m[0].length), b64: m[1], hadComment: true };
  }

  function parseImportedChapterFileText(raw) {
    const { stripped, b64, hadComment } = stripLeadingBackupComment(raw);
    if (b64) {
      const jsonStr = base64ToUtf8(b64);
      if (!jsonStr) {
        return { kind: 'backup_failed', reason: 'decode' };
      }
      try {
        const data = JSON.parse(jsonStr);
        if (
          data
          && data.ao3WorksSave === 1
          && data.doc
          && typeof data.doc === 'object'
          && data.doc.type === 'doc'
        ) {
          return { kind: 'doc', doc: data.doc };
        }
        return { kind: 'backup_failed', reason: 'invalid_doc' };
      } catch (e) {
        return { kind: 'backup_failed', reason: 'json', error: e };
      }
    }
    if (hadComment) {
      return { kind: 'backup_failed', reason: 'missing_payload' };
    }
    const html = stripped.trim() || stripBom(raw).trim();
    return { kind: 'html', html };
  }

  return {
    AO3WORKS_BACKUP_COMMENT_RE,
    stripBom,
    stripLeadingBackupComment,
    parseImportedChapterFileText,
  };
});
