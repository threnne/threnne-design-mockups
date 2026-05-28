// ============================================================
// AO3 Works — try-hash handler
// ------------------------------------------------------------
// Reads `window.location.hash` for `#try=<name>` and, on editor
// load, drops the user straight into a sample chapter scrolled
// to the requested block. Used by the marketing landing tiles.
//
// Recognised names map 1:1 to the existing Insert menu types in
// src/script.js (see `insertBindings`), plus a few landing-page
// aliases whose marketing slug differs from the internal block type:
//
//   imessage, whatsapp, snapchat, newspaper, letter, sticky, discord,
//   instagram, slack (→ chatroom), reddit
//
// Anything unrecognised → silent no-op. Anything thrown → console
// warning, editor continues with autosaved/empty content.
//
// Fail mode: NEVER block the editor from booting. Try/catch wraps
// every external call.
//
// Privacy: no analytics, no third-party calls. Hash is cleaned via
// history.replaceState so refresh doesn't re-fire.
// ============================================================

(function (root) {
  'use strict';

  /** Whitelist of accepted #try= values. */
  var TRY_BLOCK_NAMES = Object.freeze([
    'imessage',
    'whatsapp',
    'snapchat',
    'newspaper',
    'letter',
    'sticky',
    'discord',
    'instagram',
    'slack',
    'reddit',
  ]);

  /**
   * Map landing-page slug → internal block type used in data-skin.
   * Most slugs are identity; a handful differ (e.g. the landing markets
   * "Slack" but the editor stores it as `chatroom`).
   */
  var TRY_SLUG_TO_BLOCK_TYPE = Object.freeze({
    slack: 'chatroom',
  });

  function resolveBlockType(slug) {
    return TRY_SLUG_TO_BLOCK_TYPE[slug] || slug;
  }

  /**
   * Pure parser: given a hash string (e.g. "#try=imessage"), return
   * the block name if it matches the whitelist, else null.
   *
   * Exposed for testing without DOM/TipTap dependencies.
   *
   * @param {string|null|undefined} hash
   * @returns {string|null}
   */
  function parseTryHash(hash) {
    if (typeof hash !== 'string' || hash.length === 0) return null;
    // Strip leading '#' if present, then look for try=...
    var raw = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    // Tolerate something like "try=imessage&other=x"
    var segments = raw.split('&');
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i];
      if (s.indexOf('try=') !== 0) continue;
      var value = s.slice(4).toLowerCase().trim();
      if (value.length === 0) return null;
      if (TRY_BLOCK_NAMES.indexOf(value) === -1) return null;
      return value;
    }
    return null;
  }

  /**
   * Programmatically install the sample chapter into the running
   * editor, bypassing the confirm() dialog that the toolbar button
   * triggers. Mirrors the logic in script.js's load-qa-fixture-btn
   * click handler but without UI prompts.
   *
   * @returns {boolean} true on success.
   */
  function loadSampleChapter() {
    var te = root.tiptapEditor;
    var doc = root.ao3worksQaFixtureDocJson;
    if (!te || !doc || doc.type !== 'doc') return false;
    te.commands.setContent(doc, true);
    try {
      if (typeof root.flushAutosaveNow === 'function') root.flushAutosaveNow();
    } catch (_) {}
    try {
      if (typeof root.refreshMasterSkinCssAfterDocChange === 'function') {
        root.refreshMasterSkinCssAfterDocChange();
      }
    } catch (_) {}
    return true;
  }

  /**
   * Find the first rendered .skin-block DOM node whose data-skin
   * attribute matches the requested type and scroll it into view.
   *
   * @param {string} type
   * @returns {boolean} true if a node was found and scrolled.
   */
  function scrollFirstBlockIntoView(type) {
    var nodes = document.querySelectorAll('.skin-block[data-skin="' + type + '"]');
    if (!nodes.length) return false;
    var target = nodes[0];
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
      // Some older browsers reject the options object — fall back.
      target.scrollIntoView();
    }
    // Soft visual cue: outline + fade.
    try {
      target.classList.add('aw-try-highlight');
      setTimeout(function () { target.classList.remove('aw-try-highlight'); }, 2400);
    } catch (_) {}
    return true;
  }

  /**
   * Strip the #try=... fragment from the URL without reloading the
   * page so a refresh doesn't re-insert.
   */
  function cleanHashFromUrl() {
    try {
      if (typeof root.history !== 'undefined' && root.history.replaceState) {
        var url = root.location.pathname + root.location.search;
        root.history.replaceState(null, '', url);
      }
    } catch (_) {}
  }

  /**
   * Main entry: called once TipTap is ready. Reads location.hash,
   * parses it, and if it's a #try=<known> request, loads the sample
   * chapter and scrolls the matching block into view.
   */
  function handleTryHash() {
    try {
      var loc = root.location;
      if (!loc || typeof loc.hash !== 'string') return;
      var name = parseTryHash(loc.hash);
      if (!name) return; // silent no-op for unknown/missing

      var loaded = loadSampleChapter();
      if (!loaded) return;

      // Microtask + small timeout to let TipTap render NodeViews.
      // The QA fixture is large; we give the renderer a tick.
      var blockType = resolveBlockType(name);
      setTimeout(function () {
        try {
          var ok = scrollFirstBlockIntoView(blockType);
          if (!ok) {
            // Try one more time after a longer pause for slow paints.
            setTimeout(function () { scrollFirstBlockIntoView(blockType); }, 400);
          }
        } catch (innerErr) {
          // eslint-disable-next-line no-console
          console.warn('[AO3 Works] try-hash: scroll failed', innerErr);
        }
      }, 200);

      cleanHashFromUrl();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AO3 Works] try-hash handler failed (continuing with empty editor)', err);
    }
  }

  /** Boot wiring — wait for tiptap-ready, then run once. */
  function boot() {
    if (root.tiptapEditor) {
      handleTryHash();
    } else {
      root.addEventListener('tiptap-ready', function onReady() {
        root.removeEventListener('tiptap-ready', onReady);
        handleTryHash();
      });
    }
  }

  // Expose API for tests + manual debugging. CommonJS (Node tests)
  // gets the pure parser; the browser also gets the wiring entry.
  var api = {
    parseTryHash: parseTryHash,
    handleTryHash: handleTryHash,
    resolveBlockType: resolveBlockType,
    TRY_BLOCK_NAMES: TRY_BLOCK_NAMES,
    TRY_SLUG_TO_BLOCK_TYPE: TRY_SLUG_TO_BLOCK_TYPE,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.ao3worksTryHashHandler = api;
    // Auto-boot in the browser (document defined). Skipped in Node.
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
      } else {
        boot();
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
