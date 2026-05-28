// ============================================================
// AO3 STUDIO: script.js (The UI Orchestrator)
// ============================================================
// Responsibilities: Toolbar bindings, Sidebar state, Export, Autosave

// ── LEGACY STORAGE MIGRATION ─────────────────────────────────
// One-time, idempotent move of pre-aw.* localStorage keys to their
// aw.* equivalents. Editor boot in editor.js runs an early copy of
// this before reading the draft; this version covers the rest of the
// script's reads (e.g. sidebar width) and is exported for tests.
function migrateLegacyStorageKeys(storage) {
  var stor = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!stor) return;
  var pairs = [
    ['ao3works_draft', 'aw.draft'],
    ['ao3works_sidebar_width_px', 'aw.sidebarWidth'],
  ];
  for (var i = 0; i < pairs.length; i++) {
    var oldKey = pairs[i][0], newKey = pairs[i][1];
    try {
      var legacy = stor.getItem(oldKey);
      if (legacy == null) continue;
      if (stor.getItem(newKey) == null) {
        try { stor.setItem(newKey, legacy); } catch (_) { continue; }
      }
      try { stor.removeItem(oldKey); } catch (_) {}
    } catch (_) { /* ignore */ }
  }
}

// ── HELPERS & STATE ──────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CUSTOM HTML SANITIZER ────────────────────────────────────
// Uses DOMPurify (loaded via CDN) with a strict AO3-safe allowlist.
// Falls back to empty string if DOMPurify hasn't loaded: safe by default.
const AO3_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p','em','strong','i','b','u','s','del','ins','span','a',
    'blockquote','pre','code','br','hr','ul','ol','li',
    'h1','h2','h3','h4','h5','h6','img','table','thead','tbody',
    'tr','th','td','div','sup','sub','details','summary','caption'
  ],
  ALLOWED_ATTR: [
    'class','id','title','href','rel','target','src','alt',
    'width','height','colspan','rowspan','scope','open'
  ],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
};

function sanitizeCustomHtml(html) {
  if (!html) return '';
  if (typeof DOMPurify === 'undefined') {
    console.warn('[AO3 Works] DOMPurify not loaded: custom HTML blocked for safety.');
    return '';
  }
  return DOMPurify.sanitize(html, AO3_SANITIZE_CONFIG);
}

// ── UNHOSTED IMAGE DETECTION ─────────────────────────────────
function hasUnhostedImagesInDoc(docJson) {
  if (!docJson?.content) return false;
  function check(nodes) {
    for (const node of nodes) {
      if (node.type === 'image') {
        const src = node.attrs?.src || '';
        if (src.startsWith('data:image') || src.includes('googleusercontent.com') ||
            src.startsWith('file://') || src.startsWith('blob:')) return true;
      }
      if (node.content && check(node.content)) return true;
    }
    return false;
  }
  return check(docJson.content);
}

// ── EXPORT PIPELINE ──────────────────────────────────────────
// The four pure helpers below are sourced from src/lib/export-pipeline.js,
// which exposes window.ao3worksExportPipeline when loaded as a <script>.
// Keeping wrappers here so the existing in-file call sites (getExportHTML,
// etc.) need no change, and so tests/utils.test.js which mirrors these
// inline keeps working.
const __exportPipeline = (typeof window !== 'undefined' && window.ao3worksExportPipeline) || null;
const __chapterImport = (typeof window !== 'undefined' && window.ao3worksChapterImport) || null;
const __chapterFileParse = (typeof window !== 'undefined' && window.ao3worksChapterFileParse) || null;

function countImportPlaceholdersInDoc(docJson) {
  return __chapterImport ? __chapterImport.countImportPlaceholdersInDoc(docJson) : 0;
}

function convertAo3ChapterHtmlForImport(html) {
  if (!__chapterImport || typeof __chapterImport.convertAo3ChapterHtmlToEditorHtml !== 'function') {
    return null;
  }
  const sanitize = typeof window.ao3worksSanitizeImportedHtml === 'function'
    ? window.ao3worksSanitizeImportedHtml
    : null;
  return __chapterImport.convertAo3ChapterHtmlToEditorHtml(html, { sanitizeProseHtml: sanitize });
}

function formatChapterImportToast(stats) {
  if (!stats) return '';
  const reconstructed = stats.reconstructed || 0;
  const placeholders = stats.placeholders || 0;
  const unsupported = stats.unsupported || 0;
  if (reconstructed && !placeholders && !unsupported) {
    const types = Array.isArray(stats.types) && stats.types.length
      ? stats.types.join(', ')
      : 'skin blocks';
    return `Imported prose and reconstructed ${reconstructed} skin block${reconstructed === 1 ? '' : 's'} (${types}).`;
  }
  const n = placeholders + unsupported;
  if (n === 0) return '';
  const parts = [];
  if (reconstructed) {
    parts.push(`${reconstructed} reconstructed`);
  }
  if (placeholders) {
    const types = Array.isArray(stats.types) && stats.types.length
      ? stats.types.join(', ')
      : 'skin blocks';
    parts.push(`${placeholders} placeholder${placeholders === 1 ? '' : 's'} (${types})`);
  }
  if (unsupported) {
    parts.push(`${unsupported} unsupported block${unsupported === 1 ? '' : 's'}`);
  }
  return `Imported prose; rebuild ${parts.join(' and ')} with + Insert before exporting.`;
}

if (typeof window !== 'undefined') {
  window.ao3worksConvertAo3ChapterHtml = convertAo3ChapterHtmlForImport;
}

function cleanExportHTML(html) {
  return __exportPipeline ? __exportPipeline.cleanExportHTML(html) : (html || '');
}

function injectAlignClass(html, className) {
  return __exportPipeline ? __exportPipeline.injectAlignClass(html, className) : html;
}

function stripDefaultTextAlign(node) {
  return __exportPipeline ? __exportPipeline.stripDefaultTextAlign(node) : node;
}

// ── CSS LOAD STATE ───────────────────────────────────────────
let masterCSSLoaded = false;

/** True while "Choose Word" is loading the docx bundle; cleared when the import modal closes so the file picker does not open after cancel. */
let importDocxPickerPending = false;

// ── WORK SKIN VERSION SYSTEM ─────────────────────────────────
// Bump MASTER_CSS_VERSION when the "Last updated" date in assets/master-skin.css changes.
// Bump MASTER_SKIN_BUNDLE_VERSION when the "Version:" line in that file changes (export notice + support).
const MASTER_CSS_VERSION = '2026-05-20';
const MASTER_SKIN_BUNDLE_VERSION = '1.46';

/** Copy for skin panels and modals wherever users paste hosted image URLs. */
const HOSTED_IMAGE_HELPER_HTML =
  'Images must be hosted online. AO3 cannot load files from your computer. ' +
  'Paste the <strong>direct</strong> image URL (usually ends in <code>.jpg</code>, <code>.png</code>, or similar; ' +
  '<strong>i.imgur.com</strong> and <strong>i.postimg.cc</strong> work well). ' +
  'Do not paste gallery or album pages (e.g. <code>postimg.cc/abc123</code>); open your upload and copy <strong>Direct link</strong> instead.';
const HOSTED_IMAGE_URL_PLACEHOLDER = 'https://i.postimg.cc/…/photo.jpg';
const HOSTED_AVATAR_URL_PLACEHOLDER = 'https://i.postimg.cc/…/avatar.jpg';
const HOSTED_AVATAR_FIELD_HINT =
  '<p class="panel-field-hint">Direct image URL only. Leave blank to show a letter initial instead.</p>';

function hostedImageHelper(prefix) {
  const lead = prefix ? `${prefix} ` : '';
  return `<p class="panel-helper">${lead}${HOSTED_IMAGE_HELPER_HTML}</p>`;
}

function formatVersionDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

let autosaveIndicatorTimer = null;
function showAutosaveIndicator() {
  const el = document.getElementById('header-autosave');
  if (!el) return;
  el.textContent = 'Saved';
  el.classList.add('visible');
  clearTimeout(autosaveIndicatorTimer);
  autosaveIndicatorTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

let toastTimer = null;
function showToast(message) {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

function isValidHttpUrlForEditor(raw) {
  const s = (raw || '').trim();
  if (!s || /^data:|^blob:|^file:/i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function closeAo3LinkModal() {
  hideEditorHoverEdit();
  document.getElementById('link-modal')?.classList.add('hidden');
}

function closeAo3ImageModal() {
  hideEditorHoverEdit();
  document.getElementById('image-modal')?.classList.add('hidden');
}

function openAo3LinkModal(te) {
  if (!te || te.isDestroyed) return;
  hideEditorHoverEdit();
  const urlEl = document.getElementById('link-modal-url');
  const modal = document.getElementById('link-modal');
  if (!urlEl || !modal) return;
  te.commands.focus();
  const attrs = te.getAttributes('link');
  urlEl.value = (attrs && attrs.href) ? attrs.href : '';
  modal.classList.remove('hidden');
  setTimeout(() => {
    urlEl.focus();
    urlEl.select();
  }, 0);
}

function openAo3ImageModal(te, opts) {
  if (!te || te.isDestroyed) return;
  hideEditorHoverEdit();
  const srcEl = document.getElementById('image-modal-src');
  const altEl = document.getElementById('image-modal-alt');
  const modal = document.getElementById('image-modal');
  const titleEl = document.getElementById('image-modal-title');
  if (!srcEl || !altEl || !modal) return;
  te.commands.focus();
  const sel = te.state.selection;
  const editing = !!(opts && opts.edit && sel.node && sel.node.type.name === 'image');
  if (titleEl) titleEl.textContent = editing ? 'Edit image' : 'Insert image';
  if (editing) {
    const attrs = te.getAttributes('image') || {};
    srcEl.value = attrs.src || '';
    altEl.value = attrs.alt || '';
  } else {
    srcEl.value = '';
    altEl.value = '';
  }
  modal.classList.remove('hidden');
  setTimeout(() => srcEl.focus(), 0);
}

function hideEditorHoverEdit() {
  const pop = document.getElementById('editor-hover-edit');
  if (pop) {
    pop.classList.add('hidden');
    pop.setAttribute('aria-hidden', 'true');
  }
  window.__ao3worksHoverTarget = null;
}

/** Select prose image node from its DOM node; returns true if selection was set. */
function selectImageAtDom(te, img) {
  const p = te.view.posAtDOM(img, 0);
  const doc = te.state.doc;
  const candidates = [p, p - 1, p + 1, p - 2, p + 2, p - 3, p + 3];
  for (const tryPos of candidates) {
    if (tryPos < 0 || tryPos > doc.content.size) continue;
    const $r = doc.resolve(tryPos);
    if ($r.nodeAfter && $r.nodeAfter.type.name === 'image') {
      te.chain().focus().setNodeSelection(tryPos).run();
      return true;
    }
    const n = doc.nodeAt(tryPos);
    if (n && n.type.name === 'image') {
      te.chain().focus().setNodeSelection(tryPos).run();
      return true;
    }
  }
  return false;
}

function positionEditorHoverEdit(el) {
  const pop = document.getElementById('editor-hover-edit');
  if (!pop || !el) return;
  const r = el.getBoundingClientRect();
  const margin = 8;
  pop.classList.remove('hidden');
  pop.setAttribute('aria-hidden', 'false');
  const ph = pop.offsetHeight || 36;
  let top = r.bottom + 4;
  if (top + ph > window.innerHeight - margin) {
    top = Math.max(margin, r.top - ph - 4);
  }
  const pw = pop.offsetWidth || 160;
  let left = r.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

function setupEditorHoverEdit(te) {
  const root = te?.view?.dom;
  const pop = document.getElementById('editor-hover-edit');
  const linkBtn = document.getElementById('editor-hover-edit-link');
  const imgBtn = document.getElementById('editor-hover-edit-image');
  if (!root || !pop || !linkBtn || !imgBtn) return;

  let hideTimer = null;
  let showTimer = null;

  const clearTimers = () => {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
  };

  const showFor = (kind, el) => {
    if (!el || te.isDestroyed) return;
    window.__ao3worksHoverTarget = el;
    linkBtn.classList.toggle('hidden', kind !== 'link');
    imgBtn.classList.toggle('hidden', kind !== 'image');
    positionEditorHoverEdit(el);
  };

  root.addEventListener('mouseover', (e) => {
    if (te.isDestroyed) return;
    const raw = e.target instanceof Element ? e.target : e.target.parentElement;
    if (!raw || !root.contains(raw)) return;

    const inSkin = !!raw.closest('.skin-block');
    const a = raw.closest('a[href]');
    const img = raw.closest('img');

    if (inSkin) {
      clearTimers();
      hideTimer = setTimeout(() => hideEditorHoverEdit(), 120);
      return;
    }

    if (a && root.contains(a) && !a.closest('.skin-block')) {
      clearTimeout(hideTimer);
      showTimer = setTimeout(() => showFor('link', a), 60);
      return;
    }
    if (img && root.contains(img) && !img.closest('.skin-block')) {
      clearTimeout(hideTimer);
      showTimer = setTimeout(() => showFor('image', img), 60);
      return;
    }

    clearTimers();
    hideTimer = setTimeout(() => hideEditorHoverEdit(), 180);
  });

  root.addEventListener('mouseout', (e) => {
    const related = e.relatedTarget;
    if (related && (pop.contains(related) || related === pop)) return;
    clearTimers();
    hideTimer = setTimeout(() => hideEditorHoverEdit(), 200);
  });

  pop.addEventListener('mouseenter', () => {
    clearTimers();
  });
  pop.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => hideEditorHoverEdit(), 200);
  });

  document.getElementById('editor-surface')?.addEventListener('scroll', () => hideEditorHoverEdit(), { passive: true });

  linkBtn.addEventListener('mousedown', (e) => e.preventDefault());
  linkBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = window.__ao3worksHoverTarget;
    hideEditorHoverEdit();
    if (!el || el.tagName !== 'A' || !el.getAttribute('href')) return;
    try {
      const pos = te.view.posAtDOM(el, 0);
      te.chain().focus().setTextSelection(pos).extendMarkRange('link').run();
      openAo3LinkModal(te);
    } catch (err) {
      console.warn('[AO3 Works] hover edit link', err);
    }
  });

  imgBtn.addEventListener('mousedown', (e) => e.preventDefault());
  imgBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = window.__ao3worksHoverTarget;
    hideEditorHoverEdit();
    if (!el || el.tagName !== 'IMG') return;
    if (selectImageAtDom(te, el)) {
      openAo3ImageModal(te, { edit: true });
    } else {
      showToast('Could not select that image: try the Image toolbar button.');
    }
  });

  document.addEventListener(
    'mousedown',
    (e) => {
      if (pop.classList.contains('hidden')) return;
      if (e.target.closest('#editor-hover-edit')) return;
      hideEditorHoverEdit();
    },
    true
  );
}

function bindAo3InsertModals(te) {
  const saveLink = () => {
    const href = document.getElementById('link-modal-url')?.value.trim() || '';
    if (!href) {
      showToast('Enter a URL, or use Remove link.');
      return;
    }
    if (!isValidHttpUrlForEditor(href)) {
      showToast('Use a full http(s) web address.');
      return;
    }
    const chain = te.chain().focus();
    if (te.state.selection.empty) {
      chain.insertContent({
        type: 'text',
        text: href,
        marks: [{ type: 'link', attrs: { href } }],
      }).run();
    } else if (te.isActive('link')) {
      chain.extendMarkRange('link').setLink({ href }).run();
    } else {
      chain.setLink({ href }).run();
    }
    closeAo3LinkModal();
    scheduleSave();
    updateToolbarState();
  };

  document.getElementById('link-modal-save')?.addEventListener('click', saveLink);
  document.getElementById('link-modal-remove')?.addEventListener('click', () => {
    if (te.isActive('link')) {
      te.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    closeAo3LinkModal();
    scheduleSave();
    updateToolbarState();
  });
  document.getElementById('link-modal-cancel')?.addEventListener('click', closeAo3LinkModal);
  document.getElementById('link-modal-close')?.addEventListener('click', closeAo3LinkModal);
  document.getElementById('link-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAo3LinkModal();
  });
  document.getElementById('link-modal-url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveLink(); }
  });

  const insertImage = () => {
    const src = document.getElementById('image-modal-src')?.value.trim() || '';
    const alt = document.getElementById('image-modal-alt')?.value.trim() || '';
    if (!src) {
      showToast('Enter the image URL.');
      return;
    }
    if (!isValidHttpUrlForEditor(src)) {
      showToast('Use a hosted http(s) image URL (not data: or file links).');
      return;
    }
    const sel = te.state.selection;
    const imageNode = sel.node && sel.node.type.name === 'image' ? sel.node : null;
    if (imageNode) {
      te.chain().focus().updateAttributes('image', { src, alt }).run();
    } else {
      te.chain().focus().setImage({ src, alt }).run();
    }
    closeAo3ImageModal();
    scheduleSave();
    updateToolbarState();
  };

  document.getElementById('image-modal-insert')?.addEventListener('click', insertImage);
  document.getElementById('image-modal-cancel')?.addEventListener('click', closeAo3ImageModal);
  document.getElementById('image-modal-close')?.addEventListener('click', closeAo3ImageModal);
  document.getElementById('image-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAo3ImageModal();
  });
  document.getElementById('image-modal-src')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); insertImage(); }
  });
}


// ── STATE MANAGEMENT ─────────────────────────────────────────
// Holds the data and location when editing an existing skin block
let skinTipTapEditCtx = null;

function cloneContentDataForAttrs(obj) {
  try {
    return structuredClone(obj ?? {});
  } catch {
    return JSON.parse(JSON.stringify(obj ?? {}));
  }
}

// Returns the payload for the sidebar form, or an empty object if new
function getSkinPanelInitialValues() {
  if (!skinTipTapEditCtx || skinTipTapEditCtx.contentData == null) return {};
  return cloneContentDataForAttrs(skinTipTapEditCtx.contentData);
}

// ── UI PANEL HELPERS ─────────────────────────────────────────

// ── LIVE PREVIEW INFRASTRUCTURE ──────────────────────────────
// Tracks which skin type is currently open in the panel.
let currentPanelPreviewType = null;
let previewRefreshTimer     = null;

// Tiny DOM helpers used by PANEL_DATA_GETTERS
function _val(id)       { const el = document.getElementById(id);  return el  ? el.value.trim()  : ''; }
function _txt(el, sel)  { const f  = el.querySelector(sel);        return f   ? f.value.trim()   : ''; }
function _sel(el, sel)  { const f  = el ? el.querySelector(sel) : document.querySelector(sel); return f ? f.value : ''; }
function _turns(mapper) { return [...document.querySelectorAll('#convo-turns .convo-turn')].map(mapper); }

// Maps each skin type to its builder function name on window
const PREVIEW_BUILDER_MAP = {
  imessage:  'buildIosPhoneHTML',  whatsapp:  'buildWhatsAppHTML',
  letter:    'buildLetterHTML',    spoiler:   'buildSpoilerHTML',
  tumblr:    'buildTumblrHTML',    tweet:     'buildTweetHTML',
  gmail:     'buildGmailHTML',     snapchat:  'buildSnapchatHTML',
  chatroom:  'buildSlackChatHTML', android:   'buildAndroidSMSHTML',
  review:    'buildReviewHTML',    discord:   'buildDiscordHTML',
  reddit:    'buildRedditHTML',    bluesky:   'buildBlueskyHTML',
  newspaper: 'buildNewspaperHTML',
  forum:     'buildForumHTML',     facebook:  'buildFacebookHTML',
  sticky:    'buildStickyNoteHTML',
  instagram: 'buildInstagramHTML',
};

// Reads current form state for each panel type
const PANEL_DATA_GETTERS = {
  imessage:  () => ({
    contactName: _val('ios-to-name'),
    headerAvatarUrl: _val('ios-header-avatar-url'),
    draftText: _val('ios-draft-text'),
    recipientTyping: !!(document.getElementById('ios-recipient-typing')?.checked),
    bodyScrollMode: (() => {
      const el = document.querySelector('input[name="ios-body-scroll-mode"]:checked');
      return el && el.value === 'scroll' ? 'scroll' : 'expand';
    })(),
    participants: [
      {
        id: document.getElementById('ios-imessage-local-id')?.value || 'p_local',
        label: _val('ios-from-name') || 'You'
      },
      {
        id: document.getElementById('ios-imessage-remote-id')?.value || 'p_remote',
        label: _val('ios-to-name') || 'Contact'
      }
    ],
    localSpeakerId: document.getElementById('ios-imessage-local-id')?.value || 'p_local',
    items: _turns(t => ({
      speakerId: _sel(t, '.convo-binary-speaker'),
      text: _txt(t, '.convo-turn-text'),
      delivery: _sel(t, '.ios-delivery-select') || 'imessage',
      readReceipt: !!(t.querySelector('.ios-read-receipt-check')?.checked)
    })).filter(i => i.text)
  }),
  whatsapp:  () => ({
    name: _val('wa-name'),
    avatarUrl: _val('wa-avatar-url'),
    draftText: _val('wa-draft-text'),
    recipientTyping: !!(document.getElementById('wa-recipient-typing')?.checked),
    bodyScrollMode: (() => {
      const el = document.querySelector('input[name="wa-body-scroll-mode"]:checked');
      return el && el.value === 'scroll' ? 'scroll' : 'expand';
    })(),
    participants: [
      { id: 'p_local', label: _val('wa-your-name') || 'You' },
      { id: 'p_remote', label: _val('wa-their-name') || 'Them' }
    ],
    localSpeakerId: 'p_local',
    turns: _turns(t => {
      const sp = _sel(t, '.convo-binary-speaker');
      return {
        speakerId: sp,
        text: _txt(t, '.convo-turn-text'),
        color: _sel(t, '.wa-color-select') || 'color-pink',
        readReceipt: !!(sp === 'p_local' && t.querySelector('.wa-read-receipt-check')?.checked)
      };
    }).filter(t => t.text)
  }),
  letter:    () => ({ to: _val('letter-to'), from: _val('letter-from'), subject: _val('letter-subject'), date: _val('letter-date'), body: _val('letter-body') }),
  spoiler:   () => ({ summary: _val('spoiler-summary'), body: _val('spoiler-body') }),
  tumblr:    () => ({
    posts: _turns(t => ({
      username: _txt(t,'.tumblr-username-input'),
      text: _txt(t,'.convo-turn-text'),
      avatarUrl: _txt(t,'.tumblr-avatar-url-input'),
      indentLevel: _sel(t,'.tumblr-post-type-select') || '0',
    })).filter(p => p.text || p.username),
  }),
  tweet:     () => ({ name: _val('tweet-name'), handle: _val('tweet-handle'), text: _val('tweet-text'), date: _val('tweet-date'), avatarUrl: _val('tweet-avatar-url'), mediaUrls: _val('tweet-media-urls'), retweets: _val('tweet-retweets'), likes: _val('tweet-likes'), replies: _val('tweet-replies'), views: _val('tweet-views'), bookmarks: _val('tweet-bookmarks') }),
  gmail:     () => ({ subject: _val('gmail-subject'), from: _val('gmail-from'), to: _val('gmail-to'), date: _val('gmail-date'), body: _val('gmail-body'), avatarUrl: _val('gmail-avatar-url') }),
  snapchat:  () => ({
    name: _val('snap-name'),
    avatarUrl: _val('snap-avatar-url'),
    draftText: _val('snap-draft-text'),
    recipientTyping: !!(document.getElementById('snap-recipient-typing')?.checked),
    bodyScrollMode: (() => {
      const el = document.querySelector('input[name="snap-body-scroll-mode"]:checked');
      return el && el.value === 'scroll' ? 'scroll' : 'expand';
    })(),
    participants: [
      { id: 'p_local', label: _val('snap-your-name') || 'You' },
      { id: 'p_remote', label: _val('snap-their-name') || 'Them' }
    ],
    localSpeakerId: 'p_local',
    turns: _turns(t => {
      const kind = t.querySelector('.snap-turn-kind')?.value || 'text';
      if (kind === 'savedImage') {
        return {
          turnKind: 'savedImage',
          speakerId: _sel(t, '.convo-binary-speaker'),
          imageUrl: _txt(t, '.snap-image-url'),
          imageAlt: _txt(t, '.snap-image-alt'),
          meta: _txt(t, '.snap-image-meta')
        };
      }
      if (kind === 'snapStatus') {
        const preset = _sel(t, '.snap-status-preset') || 'they_opened_chat';
        const base = SNAP_STATUS_ACTION_JSON[preset] || SNAP_STATUS_ACTION_JSON.they_opened_chat;
        let statusText = _txt(t, '.snap-status-text');
        if (preset === 'you_screenshot' && !statusText) statusText = 'Took a screenshot!';
        return Object.assign({ turnKind: 'snapStatus', statusText }, base);
      }
      return {
        turnKind: 'text',
        speakerId: _sel(t, '.convo-binary-speaker'),
        text: _txt(t, '.convo-turn-text'),
        saved: !!(t.querySelector('.snap-text-saved')?.checked)
      };
    }).filter(t => {
      if (t.turnKind === 'savedImage') return !!(t.imageUrl && String(t.imageUrl).trim());
      if (t.turnKind === 'snapStatus') return !!(t.statusText && String(t.statusText).trim());
      return !!(t.text && String(t.text).trim());
    })
  }),
  chatroom:  () => ({
    channel: _val('slack-channel'),
    draftText: _val('slack-draft-text'),
    typingText: _val('slack-typing-text'),
    bodyScrollMode: (() => {
      const el = document.querySelector('input[name="slack-body-scroll-mode"]:checked');
      return el && el.value === 'scroll' ? 'scroll' : 'expand';
    })(),
    turns: _turns(t => ({ username: _txt(t,'.slack-username-input'), text: _txt(t,'.convo-turn-text'), timestamp: _txt(t,'.slack-timestamp-input'), avatarUrl: _txt(t,'.slack-avatar-url') })).filter(t => t.text)
  }),
  android:   () => ({
    headerAvatarUrl: _val('android-header-avatar-url'),
    draftText: _val('android-draft-text'),
    recipientTyping: !!(document.getElementById('android-recipient-typing')?.checked),
    bodyScrollMode: (() => {
      const el = document.querySelector('input[name="android-body-scroll-mode"]:checked');
      return el && el.value === 'scroll' ? 'scroll' : 'expand';
    })(),
    participants: [
      { id: 'p_local', label: _val('android-your-name') || 'You' },
      { id: 'p_remote', label: _val('android-their-name') || 'Them' }
    ],
    localSpeakerId: 'p_local',
    androidTurns: _turns(t => ({
      speakerId: _sel(t, '.convo-binary-speaker'),
      text: _txt(t, '.convo-turn-text')
    })).filter(t => t.text)
  }),
  review:    () => ({ reviewer: _val('review-reviewer'), rating: _sel(null,'#review-rating'), date: _val('review-date'), text: _val('review-text'), avatarUrl: _val('review-avatar-url') }),
  discord:   () => ({
    channel: _val('discord-channel'),
    draftText: _val('discord-draft-text'),
    typingText: _val('discord-typing-text'),
    bodyScrollMode: (() => {
      const el = document.querySelector('input[name="discord-body-scroll-mode"]:checked');
      return el && el.value === 'scroll' ? 'scroll' : 'expand';
    })(),
    turns: _turns(t => ({
      username: _txt(t,'.discord-username'),
      color: _sel(t,'.discord-color'),
      text: _txt(t,'.convo-turn-text'),
      timestamp: _txt(t,'.discord-timestamp'),
      avatarUrl: _txt(t,'.discord-avatar-url'),
      replyToUsername: _txt(t,'.discord-reply-user'),
      replyToSnippet: _txt(t,'.discord-reply-snippet'),
      replyToAvatarUrl: _txt(t,'.discord-reply-avatar-url'),
    })).filter(t => t.text),
  }),
  reddit:    () => ({ subreddit: _val('rdt-sub'), author: _val('rdt-author'), title: _val('rdt-title'), body: _val('rdt-body'), score: _val('rdt-score'), commentCount: _val('rdt-comments-count'), comments: _turns(t => ({ username: _txt(t,'.rdt-c-username'), text: _txt(t,'.convo-turn-text'), score: _txt(t,'.rdt-c-score') })).filter(c => c.text) }),
  bluesky:   () => ({ name: _val('bsky-name'), handle: _val('bsky-handle'), text: _val('bsky-text'), date: _val('bsky-date'), likes: _val('bsky-likes'), reposts: _val('bsky-reposts'), replies: _val('bsky-replies'), avatarUrl: _val('bsky-avatar-url') }),
  newspaper: () => ({ publication: _val('np-publication'), dateline: _val('np-dateline'), headline: _val('np-headline'), subheadline: _val('np-subheadline'), byline: _val('np-byline'), body: _val('np-body') }),
  forum:     () => ({ forumName: _val('forum-name'), threadTitle: _val('forum-title'), posts: _turns(t => ({ username: _txt(t,'.forum-username'), role: _txt(t,'.forum-role'), postCount: _txt(t,'.forum-postcount'), date: _txt(t,'.forum-date'), postNum: _txt(t,'.forum-postnum'), content: _txt(t,'.convo-turn-text'), signature: _txt(t,'.forum-sig'), avatarUrl: _txt(t,'.forum-avatar-url') })).filter(p => p.content || p.username) }),
  facebook:  () => ({ name: _val('fb-name'), timestamp: _val('fb-timestamp'), body: _val('fb-body'), reactionEmojis: _val('fb-emojis'), reactions: _val('fb-reactions'), comments: _val('fb-comments'), shares: _val('fb-shares'), avatarUrl: _val('fb-avatar-url') }),
  sticky:    () => ({ text: _val('sticky-text'), color: _sel(null,'#sticky-color') }),
  instagram: () => ({
    username: _val('ig-username'),
    avatarUrl: _val('ig-avatar-url'),
    imageUrl: _val('ig-imageurl'),
    altText: _val('ig-alt'),
    caption: _val('ig-caption'),
    likes: _val('ig-likes'),
    comments: _val('ig-comments'),
    date: _val('ig-date'),
    carouselTotal: _val('ig-carousel-total'),
    carouselActive: _val('ig-carousel-active')
  }),
  legal:     () => ({ customHtml: _val('legal-html') }),
};

function refreshPanelPreview() {
  const previewEl = document.getElementById('panel-preview');
  if (!previewEl || !currentPanelPreviewType) return;
  if (currentPanelPreviewType === 'legal') {
    const el = document.getElementById('legal-html');
    const raw = el ? el.value : '';
    try {
      const sanitized = sanitizeCustomHtml(raw);
      previewEl.innerHTML = sanitized.trim()
        ? `<div id="workskin">${sanitized}</div>`
        : '<p class="panel-preview-empty">Type HTML above to preview (unsafe tags are stripped, same as on save).</p>';
    } catch {
      previewEl.innerHTML = '<p class="panel-preview-empty">Preview unavailable.</p>';
    }
    return;
  }
  const builderName = PREVIEW_BUILDER_MAP[currentPanelPreviewType];
  const getter      = PANEL_DATA_GETTERS[currentPanelPreviewType];
  const fn          = builderName && window[builderName];
  if (!fn || !getter) return;
  try {
    const html = fn(getter());
    previewEl.innerHTML = html && html.trim()
      ? `<div id="workskin">${html}</div>`
      : '<p class="panel-preview-empty">Fill in the fields above to see a preview.</p>';
  } catch {
    previewEl.innerHTML = '<p class="panel-preview-empty">Preview unavailable.</p>';
  }
}

function openPanel(title, bodyHTML) {
  closeImportHtmlModal();
  document.getElementById('side-panel-title').textContent = title;
  document.getElementById('side-panel-body').innerHTML = bodyHTML + `
    <div class="panel-preview-section">
      <p class="panel-preview-label">What readers will see on AO3</p>
      <div class="panel-preview-scroll">
        <div id="panel-preview"><p class="panel-preview-empty">Fill in the fields above to see a preview.</p></div>
      </div>
    </div>`;
  document.getElementById('side-panel').classList.remove('hidden');
  document.getElementById('export-panel').classList.add('hidden');
  document.getElementById('editor-surface').classList.add('panel-open');
  // Render initial preview after DOM is ready
  requestAnimationFrame(refreshPanelPreview);
}

function closeAllPanels() {
  hideEditorHoverEdit();
  document.getElementById('side-panel').classList.add('hidden');
  document.getElementById('export-panel').classList.add('hidden');
  document.getElementById('link-modal')?.classList.add('hidden');
  document.getElementById('image-modal')?.classList.add('hidden');
  document.getElementById('import-html-modal')?.classList.add('hidden');
  document.getElementById('editor-surface').classList.remove('panel-open');
  skinTipTapEditCtx       = null;
  currentPanelPreviewType = null;
}

function resetImportChapterModalControls() {
  const htmlBtn = document.getElementById('import-html-modal-confirm-html');
  const docxBtn = document.getElementById('import-html-modal-confirm-docx');
  const pasteImportBtn = document.getElementById('import-html-modal-import-paste');
  const cancelBtn = document.getElementById('import-html-modal-cancel');
  const closeBtn = document.getElementById('import-html-modal-close');
  const statusEl = document.getElementById('import-chapter-modal-status');
  const pasteArea = document.getElementById('import-html-paste-area');
  [htmlBtn, docxBtn, pasteImportBtn, cancelBtn, closeBtn].forEach((b) => {
    if (b) b.disabled = false;
  });
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.add('hidden');
  }
  if (pasteArea) pasteArea.value = '';
}

function closeImportHtmlModal() {
  importDocxPickerPending = false;
  resetImportChapterModalControls();
  document.getElementById('import-html-modal')?.classList.add('hidden');
}

function openImportHtmlModal() {
  importDocxPickerPending = false;
  resetImportChapterModalControls();
  document.getElementById('import-html-modal')?.classList.remove('hidden');
  const pasteArea = document.getElementById('import-html-paste-area');
  if (pasteArea) {
    requestAnimationFrame(() => {
      try { pasteArea.focus(); } catch (_) { /* ignore */ }
    });
  }
}

/** Imports from modal / post-header-confirm: avoids a second replace dialog. */
const IMPORT_MODAL_OPTS = { skipReplaceConfirm: true };

function importChapterFromModalPastedHtml(opts = {}) {
  const merged = Object.assign({}, IMPORT_MODAL_OPTS, opts);
  const area = document.getElementById('import-html-paste-area');
  const text = area ? String(area.value || '') : '';
  if (!text.trim()) {
    showToast('Paste HTML from AO3\'s chapter editor (HTML tab) into the box first.');
    return;
  }
  closeImportHtmlModal();
  importChapterFromFileText(text, merged);
}

function confirmImportChapterChooseHtml() {
  closeImportHtmlModal();
  const input = document.getElementById('import-chapter-file-input');
  if (input) {
    input.accept = '.html,.htm,text/html';
    input.value = '';
  }
  requestAnimationFrame(() => input?.click());
}

async function confirmImportChapterChooseDocx() {
  importDocxPickerPending = true;
  const htmlBtn = document.getElementById('import-html-modal-confirm-html');
  const docxBtn = document.getElementById('import-html-modal-confirm-docx');
  const cancelBtn = document.getElementById('import-html-modal-cancel');
  const statusEl = document.getElementById('import-chapter-modal-status');
  const setBusy = (on, message) => {
    [htmlBtn, docxBtn, cancelBtn].forEach((b) => {
      if (b) b.disabled = !!on;
    });
    if (statusEl) {
      statusEl.textContent = on ? (message || '') : '';
      statusEl.classList.toggle('hidden', !on || !message);
    }
  };
  setBusy(true, 'Loading Word converter…');
  try {
    await ensureDocxImportBundleLoaded();
  } catch (err) {
    console.warn('[AO3 Works] Word import bundle', err);
    showToast('Could not load Word import. Run npm run build and refresh, then try again.');
    setBusy(false, '');
    importDocxPickerPending = false;
    return;
  }
  if (!importDocxPickerPending) return;
  setBusy(false, '');
  closeImportHtmlModal();
  const input = document.getElementById('import-chapter-file-input');
  if (input) {
    input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    input.value = '';
  }
  requestAnimationFrame(() => input?.click());
}

// ── SKIN PANEL BUILDERS (The Form UIs) ───────────────────────

// Returns the correct primary button label based on whether
// we're inserting a new block or editing an existing one.
function getSaveLabel() {
  return (skinTipTapEditCtx && typeof skinTipTapEditCtx.getPos === 'function')
    ? 'Update Block'
    : 'Insert into Chapter';
}

function openSkinBuilder(type) {
  // Set preview type before opening so openPanel's requestAnimationFrame picks it up
  currentPanelPreviewType = (type === 'legal' || PREVIEW_BUILDER_MAP[type]) ? type : null;
  switch (type) {
    case 'imessage': openIMessagePanel();   break;
    case 'whatsapp': openWhatsAppPanel();   break;
    case 'android':  openAndroidPanel();    break;
    case 'snapchat': openSnapchatPanel();   break;
    case 'letter':   openLetterPanel();     break;
    case 'spoiler':  openSpoilerPanel();    break;
    case 'tumblr':   openTumblrPanel();     break;
    case 'tweet':    openTweetPanel();      break;
    case 'gmail':    openGmailPanel();      break;
    case 'chatroom': openChatroomPanel();   break;
    case 'review':   openReviewPanel();     break;
    case 'discord':  openDiscordPanel();    break;
    case 'reddit':   openRedditPanel();     break;
    case 'bluesky':  openBlueskyPanel();    break;
    case 'newspaper':openNewspaperPanel();  break;
    case 'forum':    openForumPanel();      break;
    case 'facebook': openFacebookPanel();   break;
    case 'instagram': openInstagramPanel();  break;
    case 'sticky':   openStickyNotePanel(); break;
    case 'legal':    openLegalPanel();      break;

    default:
      console.warn(`[AO3 Works] Skin builder for type "${type}" is not yet implemented.`);
      showToast(`The ${type} builder is coming soon!`);
      break;
  }
}

function generateParticipantId() {
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

function buildParticipantRowHTML(p) {
  p = p || { id: generateParticipantId(), label: '' };
  const id = p.id || generateParticipantId();
  return `
    <div class="convo-participant-row" data-participant-id="${escapeHTML(id)}">
      <input class="panel-input convo-participant-label" value="${escapeHTML(p.label || '')}" placeholder="Name (e.g. You, Steve)">
      <button type="button" class="convo-participant-remove" aria-label="Remove person">×</button>
    </div>`;
}

function participantOptionsHtml(participants, selectedId) {
  return (participants || []).map(part => {
    const sel = part.id === selectedId ? ' selected' : '';
    return `<option value="${escapeHTML(part.id)}"${sel}>${escapeHTML(part.label || part.id)}</option>`;
  }).join('');
}

/** Two-option speaker control: values always p_local (you) / p_remote (them). */
function buildBinarySpeakerSelectHtml(selectedBinary, yourLabel, theirLabel) {
  const y = escapeHTML(yourLabel || 'You');
  const th = escapeHTML(theirLabel || 'Them');
  const sel = selectedBinary === 'p_local' ? 'p_local' : 'p_remote';
  return `<label class="panel-label" style="font-size:0.72rem;">Message from</label>
        <select class="panel-select convo-binary-speaker" aria-label="Message from">
          <option value="p_remote"${sel === 'p_remote' ? ' selected' : ''}>${th}</option>
          <option value="p_local"${sel === 'p_local' ? ' selected' : ''}>${y}</option>
        </select>`;
}

function syncBinarySpeakerLabels(turnsSelector, yourInputId, theirInputId) {
  const yEl = document.getElementById(yourInputId);
  const tEl = document.getElementById(theirInputId);
  const y = (yEl && yEl.value.trim()) || 'You';
  const th = (tEl && tEl.value.trim()) || 'Them';
  document.querySelectorAll(`${turnsSelector} .convo-binary-speaker`).forEach(sel => {
    const v = sel.value;
    [...sel.options].forEach(opt => {
      if (opt.value === 'p_remote') opt.textContent = th;
      if (opt.value === 'p_local') opt.textContent = y;
    });
    if ([...sel.options].some(o => o.value === v)) sel.value = v;
    else sel.value = 'p_remote';
  });
}

function turnSpeakerToBinary(speakerId) {
  const s = speakerId != null ? String(speakerId) : '';
  return s === 'p_local' ? 'p_local' : 'p_remote';
}

/** Snapchat “Action” dropdown → JSON fields (Option A icon set). */
const SNAP_STATUS_ACTION_JSON = {
  they_sent_photo: { statusSide: 'in', snapType: 'photo', statusIcon: 'solidSquare' },
  they_sent_video: { statusSide: 'in', snapType: 'video', statusIcon: 'solidSquare' },
  they_opened_chat: { statusSide: 'in', snapType: 'chat', statusIcon: 'hollowArrow' },
  you_sent_photo: { statusSide: 'out', snapType: 'photo', statusIcon: 'solidArrow' },
  you_sent_video: { statusSide: 'out', snapType: 'video', statusIcon: 'solidArrow' },
  you_screenshot: { statusSide: 'out', snapType: 'chat', statusIcon: 'none' }
};

function snapStatusPresetFromTurn(t) {
  if (!t || t.turnKind !== 'snapStatus') return 'they_opened_chat';
  const side = t.statusSide === 'out' ? 'out' : 'in';
  const typ = t.snapType === 'photo' ? 'photo' : t.snapType === 'video' ? 'video' : 'chat';
  const ic = t.statusIcon || 'none';
  if (side === 'out' && typ === 'chat' && ic === 'none') return 'you_screenshot';
  if (side === 'out' && typ === 'photo' && ic === 'solidArrow') return 'you_sent_photo';
  if (side === 'out' && typ === 'video' && ic === 'solidArrow') return 'you_sent_video';
  if (side === 'in' && typ === 'photo' && (ic === 'solidSquare' || ic === 'hollowSquare')) return 'they_sent_photo';
  if (side === 'in' && typ === 'video' && (ic === 'solidSquare' || ic === 'hollowSquare')) return 'they_sent_video';
  if (side === 'in' && typ === 'chat' && ic === 'hollowArrow') return 'they_opened_chat';
  return 'they_opened_chat';
}

function collectParticipantsFromDom() {
  return [...document.querySelectorAll('#convo-participants .convo-participant-row')].map(row => ({
    id: row.dataset.participantId,
    label: row.querySelector('.convo-participant-label')?.value.trim() || 'Person'
  })).filter(r => r.id);
}

function syncConversationSpeakerSelects(turnsSelector) {
  const parts = collectParticipantsFromDom();
  if (!parts.length) return;
  document.querySelectorAll(`${turnsSelector} .convo-speaker-select`).forEach(sel => {
    const v = sel.value;
    sel.innerHTML = participantOptionsHtml(parts, '');
    if ([...sel.options].some(o => o.value === v)) sel.value = v;
    else sel.value = parts[0].id;
  });
  const localSel = document.getElementById('convo-local-speaker');
  if (localSel) {
    const cur = localSel.value;
    localSel.innerHTML = participantOptionsHtml(parts, '');
    if ([...localSel.options].some(o => o.value === cur)) localSel.value = cur;
    else localSel.value = parts[0].id;
  }
}

function bindConvoParticipantsUI(turnsSelector, onStructureChange) {
  const partEl = document.getElementById('convo-participants');
  const addBtn = document.getElementById('add-convo-participant');
  const localSel = document.getElementById('convo-local-speaker');
  if (!partEl || !addBtn) return;

  partEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('convo-participant-remove')) return;
    if (partEl.querySelectorAll('.convo-participant-row').length <= 2) return;
    e.target.closest('.convo-participant-row').remove();
    syncConversationSpeakerSelects(turnsSelector);
    if (onStructureChange) onStructureChange();
  });
  addBtn.addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = buildParticipantRowHTML({ id: generateParticipantId(), label: '' });
    partEl.appendChild(div.firstElementChild);
    syncConversationSpeakerSelects(turnsSelector);
    if (onStructureChange) onStructureChange();
  });
  partEl.addEventListener('input', (e) => {
    if (e.target.classList.contains('convo-participant-label')) {
      syncConversationSpeakerSelects(turnsSelector);
      if (onStructureChange) onStructureChange();
    }
  });
  if (localSel) {
    localSel.addEventListener('change', () => {
      if (onStructureChange) onStructureChange();
    });
  }
}

function getImessageParticipantPairFromDom() {
  return [
    { id: 'p_local', label: document.getElementById('ios-from-name')?.value.trim() || 'You' },
    { id: 'p_remote', label: document.getElementById('ios-to-name')?.value.trim() || 'Contact' }
  ];
}

function syncImessageSpeakerSelectLabels() {
  syncBinarySpeakerLabels('#convo-turns', 'ios-from-name', 'ios-to-name');
}

function refreshIMessageTurnExtras() {
  document.querySelectorAll('#convo-turns .convo-turn-imessage').forEach(row => {
    const sid = row.querySelector('.convo-binary-speaker')?.value;
    const extra = row.querySelector('.ios-msg-extra-fields');
    if (extra) extra.style.display = sid === 'p_local' ? 'block' : 'none';
    const del = row.querySelector('.ios-delivery-select')?.value;
    const rrChk = row.querySelector('.ios-read-receipt-check');
    const rrWrap = row.querySelector('.ios-read-receipt-wrap');
    const smsHint = row.querySelector('.ios-sms-read-hint');
    if (sid !== 'p_local') return;
    if (del === 'sms') {
      if (rrChk) {
        rrChk.checked = false;
        rrChk.disabled = true;
        rrChk.setAttribute('aria-disabled', 'true');
      }
      if (rrWrap) rrWrap.style.display = 'none';
      if (smsHint) smsHint.style.display = 'block';
    } else {
      if (rrChk) {
        rrChk.disabled = false;
        rrChk.removeAttribute('aria-disabled');
      }
      if (rrWrap) rrWrap.style.display = 'block';
      if (smsHint) smsHint.style.display = 'none';
    }
  });
}

function refreshWaColorWraps() {
  document.querySelectorAll('#convo-turns .convo-turn').forEach(row => {
    const sid = row.querySelector('.convo-binary-speaker')?.value;
    const wrap = row.querySelector('.wa-color-wrap');
    if (wrap) wrap.style.display = sid && sid !== 'p_local' ? 'block' : 'none';
    const extra = row.querySelector('.wa-msg-extra-fields');
    if (extra) extra.style.display = sid === 'p_local' ? 'block' : 'none';
  });
}

function openIMessagePanel() {
  const raw = getSkinPanelInitialValues();
  if (Array.isArray(raw.participants) && raw.participants.length > 2) {
    showToast('This chat listed more than two people; only you and the contact are kept when editing.');
  }
  const norm = window.normalizeIosPhoneData(raw);
  const participants = norm.participants;
  const localSpeakerId = norm.localSpeakerId && participants.some(p => p.id === norm.localSpeakerId)
    ? norm.localSpeakerId
    : participants[0].id;
  const localP = participants.find(p => p.id === localSpeakerId) || participants[0];
  const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
  const fromLabel = (localP && localP.label) || 'You';
  const toLabel = norm.contactName || (remoteP && remoteP.label) || 'Contact';
  const items = norm.items.length
    ? norm.items
    : [
        { kind: 'message', speakerId: 'p_remote', text: '', delivery: 'imessage', readReceipt: false },
        { kind: 'message', speakerId: 'p_local', text: '', delivery: 'imessage', readReceipt: false }
      ];
  const turnsHTML = items.map(it => buildIMessageTurnHTML(it, fromLabel, toLabel)).join('');
  const recipientTypingChecked = !!norm.recipientTyping;
  const bodyScrollChecked = norm.bodyScrollMode === 'scroll';

  openPanel('iMessage', `
    <p class="panel-helper">“To” is the name in the chat header. Each line is a sent message; at the bottom you can add typing dots and/or text still sitting in your composer (not sent).</p>
    ${hostedImageHelper('Optional header avatar below: direct image URL, or blank for the first letter of “To”.')}
    <input type="hidden" id="ios-imessage-local-id" value="p_local" aria-hidden="true">
    <input type="hidden" id="ios-imessage-remote-id" value="p_remote" aria-hidden="true">
    <div class="panel-field">
      <label class="panel-label">To (chat header)</label>
      <input class="panel-input" id="ios-to-name" value="${escapeHTML(toLabel)}" placeholder="e.g. Steve Rogers">
    </div>
    <div class="panel-field">
      <label class="panel-label">From (you)</label>
      <input class="panel-input" id="ios-from-name" value="${escapeHTML(fromLabel)}" placeholder="e.g. You">
    </div>
    <div class="panel-field">
      <label class="panel-label">Header avatar URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="ios-header-avatar-url" value="${escapeHTML(norm.headerAvatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}">
    </div>
    <div class="panel-section">
      <label class="panel-label">Messages</label>
      <div class="convo-turns" id="convo-turns">${turnsHTML}</div>
      <button class="add-turn-btn" id="add-imessage-turn">+ Add message</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-section">
      <label class="panel-label">For long threads</label>
      <p class="panel-helper" style="margin-top:0">On AO3: either the message area scrolls inside the phone, or the whole phone grows with every line.</p>
      <label class="panel-checkbox-label" style="display:block;margin-top:6px;">
        <input type="radio" name="ios-body-scroll-mode" value="scroll" ${bodyScrollChecked ? 'checked' : ''}> Scroll inside the phone
      </label>
      <label class="panel-checkbox-label" style="display:block;margin-top:4px;">
        <input type="radio" name="ios-body-scroll-mode" value="expand" ${!bodyScrollChecked ? 'checked' : ''}> Grow with all messages
      </label>
    </div>
    <div class="panel-section ios-in-progress-section">
      <label class="panel-label">In progress (optional)</label>
      <p class="panel-helper" style="margin-top:4px">Either or both: typing indicator from the person you’re texting, and/or grey text still in the composer bar.</p>
      <label class="panel-checkbox-label" style="display:block;margin-bottom:10px;">
        <input type="checkbox" id="ios-recipient-typing" ${recipientTypingChecked ? 'checked' : ''}> Show typing indicator (⋯)
      </label>
      <label class="panel-label">Unsent draft text (composer bar)</label>
      <input class="panel-input" id="ios-draft-text" value="${escapeHTML(norm.draftText || '')}" placeholder="Looks like you’re mid-type; not sent yet">
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="imessage-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'message');
  refreshIMessageTurnExtras();

  const onToFromInput = () => {
    syncImessageSpeakerSelectLabels();
    refreshIMessageTurnExtras();
  };
  document.getElementById('ios-to-name').addEventListener('input', onToFromInput);
  document.getElementById('ios-from-name').addEventListener('input', onToFromInput);

  document.getElementById('add-imessage-turn').addEventListener('click', () => {
    const turnsEl = document.getElementById('convo-turns');
    const fromN = document.getElementById('ios-from-name')?.value.trim() || 'You';
    const toN = document.getElementById('ios-to-name')?.value.trim() || 'Contact';
    const div = document.createElement('div');
    div.innerHTML = buildIMessageTurnHTML(
      { kind: 'message', speakerId: 'p_remote', text: '', delivery: 'imessage', readReceipt: false },
      fromN,
      toN
    );
    turnsEl.appendChild(div.firstElementChild);
    refreshIMessageTurnExtras();
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('convo-turns').addEventListener('change', (e) => {
    if (e.target.classList.contains('convo-binary-speaker') ||
        e.target.classList.contains('ios-delivery-select')) {
      refreshIMessageTurnExtras();
    }
  });
  document.getElementById('imessage-save').addEventListener('click', () => {
    const localSpk = 'p_local';
    const remoteSpk = 'p_remote';
    const itemsSaved = [...document.querySelectorAll('#convo-turns .convo-turn')].map(row => {
      const speakerId = row.querySelector('.convo-binary-speaker')?.value;
      const text = row.querySelector('.convo-turn-text')?.value.trim() || '';
      if (!text) return null;
      const delivery = speakerId === localSpk ? (row.querySelector('.ios-delivery-select')?.value || 'imessage') : 'imessage';
      const readReceipt = speakerId === localSpk && delivery === 'imessage' && row.querySelector('.ios-read-receipt-check')?.checked;
      return { kind: 'message', speakerId, text, delivery, readReceipt };
    }).filter(Boolean);
    const toName = document.getElementById('ios-to-name').value.trim() || 'Contact';
    const fromName = document.getElementById('ios-from-name').value.trim() || 'You';
    panelInsertOrUpdateSkin('imessage', {
      contactName: toName,
      headerAvatarUrl: document.getElementById('ios-header-avatar-url').value.trim(),
      draftText: document.getElementById('ios-draft-text').value.trim(),
      recipientTyping: document.getElementById('ios-recipient-typing').checked,
      bodyScrollMode: document.querySelector('input[name="ios-body-scroll-mode"]:checked')?.value === 'scroll' ? 'scroll' : 'expand',
      participants: [
        { id: localSpk, label: fromName },
        { id: remoteSpk, label: toName }
      ],
      localSpeakerId: localSpk,
      items: itemsSaved
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openWhatsAppPanel() {
  const raw = getSkinPanelInitialValues();
  if (Array.isArray(raw.participants) && raw.participants.length > 2) {
    showToast('This chat listed more than two people; only you and the other speaker are kept when editing.');
  }
  const norm = window.normalizeWhatsAppData(raw);
  const participants = norm.participants;
  const localP = participants.find(p => p.id === norm.localSpeakerId) || participants[0];
  const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
  const yourName = (localP && localP.label) || 'You';
  const theirName = (remoteP && remoteP.label) || 'Them';
  const turns = norm.turns.length
    ? norm.turns
    : [{ speakerId: 'p_remote', text: '', color: 'color-pink', readReceipt: false }];
  const turnsHTML = turns.map(t => buildWaTurnHTML(t, yourName, theirName)).join('');
  const recipientTypingChecked = !!norm.recipientTyping;
  const bodyScrollChecked = norm.bodyScrollMode === 'scroll';

  openPanel('WhatsApp', `
    <p class="panel-helper">Set the chat title and who is you vs. the other person. Each line picks who sent it; incoming lines can use a colored name label.</p>
    ${hostedImageHelper('Optional header image below uses a direct image URL.')}
    <div class="panel-field">
      <label class="panel-label">Chat name</label>
      <input class="panel-input" id="wa-name" value="${escapeHTML(norm.name || '')}" placeholder="e.g. The Avengers">
    </div>
    <div class="panel-field">
      <label class="panel-label">Header image URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="wa-avatar-url" value="${escapeHTML(norm.avatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}">
    </div>
    <div class="panel-field">
      <label class="panel-label">Your name (messages you send)</label>
      <input class="panel-input" id="wa-your-name" value="${escapeHTML(yourName)}" placeholder="e.g. You">
    </div>
    <div class="panel-field">
      <label class="panel-label">Sender name (messages they send)</label>
      <input class="panel-input" id="wa-their-name" value="${escapeHTML(theirName)}" placeholder="e.g. Steve">
    </div>
    <div class="panel-section">
      <div class="convo-turns" id="convo-turns">${turnsHTML}</div>
      <button class="add-turn-btn" id="add-wa-turn">+ Add message</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-section">
      <label class="panel-label">For long threads</label>
      <p class="panel-helper" style="margin-top:0">On AO3: either the message area scrolls inside the chat, or the whole chat grows with every line.</p>
      <label class="panel-checkbox-label" style="display:block;margin-top:6px;">
        <input type="radio" name="wa-body-scroll-mode" value="scroll" ${bodyScrollChecked ? 'checked' : ''}> Scroll inside the chat
      </label>
      <label class="panel-checkbox-label" style="display:block;margin-top:4px;">
        <input type="radio" name="wa-body-scroll-mode" value="expand" ${!bodyScrollChecked ? 'checked' : ''}> Grow with all messages
      </label>
    </div>
    <div class="panel-section wa-in-progress-section">
      <label class="panel-label">In progress (optional)</label>
      <p class="panel-helper" style="margin-top:4px">Either or both: typing indicator from the other person, and/or text still sitting in your composer (not sent).</p>
      <label class="panel-checkbox-label" style="display:block;margin-bottom:10px;">
        <input type="checkbox" id="wa-recipient-typing" ${recipientTypingChecked ? 'checked' : ''}> Show typing indicator (⋯)
      </label>
      <label class="panel-label">Unsent draft text (composer bar)</label>
      <input class="panel-input" id="wa-draft-text" value="${escapeHTML(norm.draftText || '')}" placeholder="Looks like you’re mid-type; not sent yet">
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="wa-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'message');
  const onWaNames = () => {
    syncBinarySpeakerLabels('#convo-turns', 'wa-your-name', 'wa-their-name');
    refreshWaColorWraps();
  };
  document.getElementById('wa-your-name').addEventListener('input', onWaNames);
  document.getElementById('wa-their-name').addEventListener('input', onWaNames);
  refreshWaColorWraps();
  document.getElementById('add-wa-turn').addEventListener('click', () => {
    const turnsEl = document.getElementById('convo-turns');
    const y = document.getElementById('wa-your-name')?.value.trim() || 'You';
    const th = document.getElementById('wa-their-name')?.value.trim() || 'Them';
    const div = document.createElement('div');
    div.innerHTML = buildWaTurnHTML({ speakerId: 'p_remote', text: '', color: 'color-pink', readReceipt: false }, y, th);
    turnsEl.appendChild(div.firstElementChild);
    refreshWaColorWraps();
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('convo-turns').addEventListener('change', (e) => {
    if (e.target.classList.contains('convo-binary-speaker')) refreshWaColorWraps();
  });
  document.getElementById('wa-save').addEventListener('click', () => {
    const your = document.getElementById('wa-your-name').value.trim() || 'You';
    const their = document.getElementById('wa-their-name').value.trim() || 'Them';
    const items = [...document.querySelectorAll('#convo-turns .convo-turn')].map(row => {
      const speakerId = row.querySelector('.convo-binary-speaker')?.value;
      const text = row.querySelector('.convo-turn-text')?.value.trim() || '';
      if (!text) return null;
      const readReceipt = speakerId === 'p_local' && row.querySelector('.wa-read-receipt-check')?.checked;
      return {
        speakerId,
        text,
        color: row.querySelector('.wa-color-select')?.value || 'color-pink',
        readReceipt: !!readReceipt
      };
    }).filter(Boolean);
    panelInsertOrUpdateSkin('whatsapp', {
      name: document.getElementById('wa-name').value.trim(),
      avatarUrl: document.getElementById('wa-avatar-url').value.trim(),
      draftText: document.getElementById('wa-draft-text').value.trim(),
      recipientTyping: document.getElementById('wa-recipient-typing').checked,
      bodyScrollMode: document.querySelector('input[name="wa-body-scroll-mode"]:checked')?.value === 'scroll' ? 'scroll' : 'expand',
      participants: [
        { id: 'p_local', label: your },
        { id: 'p_remote', label: their }
      ],
      localSpeakerId: 'p_local',
      turns: items
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openLetterPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Letter', `
    <p class="panel-helper">Creates a handwritten-style letter on aged parchment. "To" is the greeting, "From" is the sign-off, "Signature name" prints at the bottom. "Date" appears under the greeting when filled in.</p>
    <div class="panel-field"><label class="panel-label">To (greeting)</label>
      <input class="panel-input" id="letter-to" value="${escapeHTML(data.to || '')}" placeholder="e.g. Dear Steve,"></div>
    <div class="panel-field"><label class="panel-label">Date</label>
      <input class="panel-input" id="letter-date" value="${escapeHTML(data.date || '')}" placeholder="e.g. September 3rd, 1943"></div>
    <div class="panel-field"><label class="panel-label">Body</label>
      <textarea class="panel-textarea" id="letter-body" rows="6" placeholder="The letter text…">${escapeHTML(data.body || '')}</textarea></div>
    <div class="panel-field"><label class="panel-label">From (sign-off)</label>
      <input class="panel-input" id="letter-from" value="${escapeHTML(data.from || '')}" placeholder="e.g. With love,"></div>
    <div class="panel-field"><label class="panel-label">Signature name</label>
      <input class="panel-input" id="letter-subject" value="${escapeHTML(data.subject || '')}" placeholder="e.g. Peggy Carter"></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="letter-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('letter-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('letter', {
      to:      document.getElementById('letter-to').value.trim(),
      from:    document.getElementById('letter-from').value.trim(),
      subject: document.getElementById('letter-subject').value.trim(),
      date:    document.getElementById('letter-date').value.trim(),
      body:    document.getElementById('letter-body').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openSpoilerPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Spoiler / CW', `
    <p class="panel-helper">Readers click the label to reveal hidden content. AO3 supports this natively: no work skin CSS needed for this block!</p>
    <div class="panel-field"><label class="panel-label">Label (what readers see first)</label>
      <input class="panel-input" id="spoiler-summary" value="${escapeHTML(data.summary || 'Click to reveal spoiler')}" placeholder="e.g. Major character death"></div>
    <div class="panel-field"><label class="panel-label">Hidden content</label>
      <textarea class="panel-textarea" id="spoiler-body" rows="6" placeholder="The text readers will see after clicking…">${escapeHTML(data.body || '')}</textarea></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="spoiler-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('spoiler-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('spoiler', {
      summary: document.getElementById('spoiler-summary').value.trim(),
      body:    document.getElementById('spoiler-body').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function buildTumblrPostHTML(p) {
  p = p || { username: '', text: '', avatarUrl: '', indentLevel: '0' };
  const ind = p.indentLevel != null && p.indentLevel !== '' ? String(p.indentLevel) : '0';
  const indNorm = ind === '1' || ind === '2' ? ind : '0';
  return `
    <div class="convo-turn">
      <div class="convo-turn-left">
        <input class="panel-input tumblr-username-input" placeholder="Username" value="${escapeHTML(p.username || '')}">
        <input class="panel-input tumblr-avatar-url-input" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}" value="${escapeHTML(p.avatarUrl || '')}">
        <p class="panel-field-hint">Direct image URL for this post’s avatar. Blank = letter initial.</p>
        <div class="panel-field"><label class="panel-label">Post type</label>
          <select class="panel-select tumblr-post-type-select">
            <option value="0"${indNorm === '0' ? ' selected' : ''}>Original Post</option>
            <option value="1"${indNorm === '1' ? ' selected' : ''}>First Reblog</option>
            <option value="2"${indNorm === '2' ? ' selected' : ''}>Nested Reblog</option>
          </select></div>
        <textarea class="convo-turn-text" rows="3" placeholder="Post text…">${escapeHTML(p.text || '')}</textarea>
      </div>
      <button class="convo-turn-remove" aria-label="Remove post">×</button>
    </div>`;
}

function openTumblrPanel() {
  const data  = getSkinPanelInitialValues();
  const posts = data.posts || [{ username: '', text: '' }];
  openPanel('Tumblr Chain', `
    ${hostedImageHelper('Each reblog can show an avatar photo via a direct image URL on that post.')}
    <div class="panel-section">
      <div class="convo-turns" id="convo-turns">${posts.map(buildTumblrPostHTML).join('')}</div>
      <button class="add-turn-btn" id="add-tumblr-post">+ Add reblog</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="tumblr-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'reblog');
  document.getElementById('add-tumblr-post').addEventListener('click', () => {
    const turns = document.getElementById('convo-turns');
    const div = document.createElement('div');
    div.innerHTML = buildTumblrPostHTML({ username: '', text: '' });
    turns.appendChild(div.firstElementChild);
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('tumblr-save').addEventListener('click', () => {
    const posts = [...document.querySelectorAll('#convo-turns .convo-turn')].map(el => ({
      username:  el.querySelector('.tumblr-username-input').value.trim(),
      avatarUrl: el.querySelector('.tumblr-avatar-url-input').value.trim(),
      indentLevel: el.querySelector('.tumblr-post-type-select').value.trim(),
      text:      el.querySelector('.convo-turn-text').value.trim(),
    })).filter(p => p.text || p.username);
    panelInsertOrUpdateSkin('tumblr', {
      posts: posts.length ? posts : [{ username: '', text: '' }],
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openTweetPanel() {
  const data = getSkinPanelInitialValues();
  const mediaStr = typeof data.mediaUrls === 'string' ? data.mediaUrls : (Array.isArray(data.mediaUrls) ? data.mediaUrls.join('\n') : '');
  openPanel('Tweet / 𝕏 Post', `
    ${hostedImageHelper('Tweet card: date and stats show when filled. Profile photo and up to four post images below. Leave stats blank to hide the whole metrics row.')}
    <div class="panel-field"><label class="panel-label">Display name</label>
      <input class="panel-input" id="tweet-name" value="${escapeHTML(data.name || '')}" placeholder="e.g. Tony Stark"></div>
    <div class="panel-field"><label class="panel-label">Handle</label>
      <input class="panel-input" id="tweet-handle" value="${escapeHTML(data.handle || '')}" placeholder="Username, with or without @"></div>
    <div class="panel-field"><label class="panel-label">Post text</label>
      <textarea class="panel-textarea" id="tweet-text" rows="4" placeholder="What's happening?">${escapeHTML(data.text || '')}</textarea></div>
    <div class="panel-field"><label class="panel-label">Date / time (optional)</label>
      <input class="panel-input" id="tweet-date" value="${escapeHTML(data.date || '')}" placeholder="Shown under handle, e.g. 9:41 AM · Apr 11, 2025"></div>
    <div class="panel-field"><label class="panel-label">Profile photo URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="tweet-avatar-url" value="${escapeHTML(data.avatarUrl || data.profileImageUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}"></div>
    <div class="panel-field"><label class="panel-label">Images in post (optional)</label>
      <p class="panel-field-hint">One <strong>direct</strong> image URL per line (up to 4). Same rules as above: no gallery pages.</p>
      <textarea class="panel-textarea" id="tweet-media-urls" rows="3" placeholder="https://i.postimg.cc/…/photo1.jpg">${escapeHTML(mediaStr)}</textarea></div>
    <div class="panel-field"><label class="panel-label">Replies (optional)</label>
      <input class="panel-input" id="tweet-replies" value="${escapeHTML(data.replies || '')}" placeholder="e.g. 120"></div>
    <div class="panel-field"><label class="panel-label">Retweets (optional)</label>
      <input class="panel-input" id="tweet-retweets" value="${escapeHTML(data.retweets || '')}" placeholder="e.g. 42"></div>
    <div class="panel-field"><label class="panel-label">Likes (optional)</label>
      <input class="panel-input" id="tweet-likes" value="${escapeHTML(data.likes || '')}" placeholder="e.g. 3,000"></div>
    <div class="panel-field"><label class="panel-label">Views (optional)</label>
      <input class="panel-input" id="tweet-views" value="${escapeHTML(data.views || '')}" placeholder="e.g. 12.4K"></div>
    <div class="panel-field"><label class="panel-label">Bookmarks (optional)</label>
      <input class="panel-input" id="tweet-bookmarks" value="${escapeHTML(data.bookmarks || '')}" placeholder="e.g. 210"></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="tweet-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('tweet-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('tweet', {
      name:       document.getElementById('tweet-name').value.trim(),
      handle:     document.getElementById('tweet-handle').value.trim(),
      text:       document.getElementById('tweet-text').value.trim(),
      date:       document.getElementById('tweet-date').value.trim(),
      avatarUrl:  document.getElementById('tweet-avatar-url').value.trim(),
      mediaUrls:  document.getElementById('tweet-media-urls').value.trim(),
      replies:    document.getElementById('tweet-replies').value.trim(),
      retweets:   document.getElementById('tweet-retweets').value.trim(),
      likes:      document.getElementById('tweet-likes').value.trim(),
      views:      document.getElementById('tweet-views').value.trim(),
      bookmarks:  document.getElementById('tweet-bookmarks').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openGmailPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Gmail', `
    <p class="panel-helper">The first letter of "From" becomes the avatar initial unless you set a sender photo URL below. Leave "To" empty to hide it. ${HOSTED_IMAGE_HELPER_HTML}</p>
    <div class="panel-field"><label class="panel-label">Subject line</label>
      <input class="panel-input" id="gmail-subject" value="${escapeHTML(data.subject || '')}" placeholder="e.g. Re: The Accords"></div>
    <div class="panel-field"><label class="panel-label">From</label>
      <input class="panel-input" id="gmail-from" value="${escapeHTML(data.from || '')}" placeholder="e.g. Steve Rogers &lt;steve@avengers.org&gt;"></div>
    <div class="panel-field"><label class="panel-label">Sender avatar URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="gmail-avatar-url" value="${escapeHTML(data.avatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}"></div>
    <div class="panel-field"><label class="panel-label">To (optional)</label>
      <input class="panel-input" id="gmail-to" value="${escapeHTML(data.to || '')}" placeholder="e.g. Tony Stark"></div>
    <div class="panel-field"><label class="panel-label">Date (optional)</label>
      <input class="panel-input" id="gmail-date" value="${escapeHTML(data.date || '')}" placeholder="e.g. 3:42 PM"></div>
    <div class="panel-field"><label class="panel-label">Body</label>
      <textarea class="panel-textarea" id="gmail-body" rows="6" placeholder="Email body…">${escapeHTML(data.body || '')}</textarea></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="gmail-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('gmail-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('gmail', {
      subject: document.getElementById('gmail-subject').value.trim(),
      from:    document.getElementById('gmail-from').value.trim(),
      to:      document.getElementById('gmail-to').value.trim(),
      date:    document.getElementById('gmail-date').value.trim(),
      body:    document.getElementById('gmail-body').value.trim(),
      avatarUrl: document.getElementById('gmail-avatar-url').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function refreshSnapTurnFields(row) {
  if (!row || !row.classList.contains('convo-turn')) return;
  const kind = row.querySelector('.snap-turn-kind')?.value || 'text';
  const speakerRow = row.querySelector('.snap-speaker-row');
  const textFields = row.querySelector('.snap-fields-text');
  const imgFields = row.querySelector('.snap-fields-image');
  const statFields = row.querySelector('.snap-fields-status');
  if (speakerRow) speakerRow.style.display = kind === 'snapStatus' ? 'none' : 'block';
  if (textFields) textFields.style.display = kind === 'text' ? 'block' : 'none';
  if (imgFields) imgFields.style.display = kind === 'savedImage' ? 'block' : 'none';
  if (statFields) statFields.style.display = kind === 'snapStatus' ? 'block' : 'none';
}

function snapStatusPresetOptionsHtml(selectedKey) {
  const rows = [
    ['they_sent_photo', 'They sent a Photo'],
    ['they_sent_video', 'They sent a Video'],
    ['they_opened_chat', 'They opened a Chat'],
    ['you_sent_photo', 'You sent a Photo'],
    ['you_sent_video', 'You sent a Video'],
    ['you_screenshot', 'You took a Screenshot']
  ];
  return rows.map(([k, lab]) =>
    `<option value="${k}"${selectedKey === k ? ' selected' : ''}>${escapeHTML(lab)}</option>`
  ).join('');
}

function buildSnapTurnHTML(t, yourName, theirName) {
  t = t || { speakerId: '', text: '' };
  const bin = turnSpeakerToBinary(t.speakerId);
  const kind = t.turnKind === 'savedImage' ? 'savedImage' : t.turnKind === 'snapStatus' ? 'snapStatus' : 'text';
  const presetKey = kind === 'snapStatus' ? snapStatusPresetFromTurn(t) : 'they_opened_chat';
  const stText = t.statusText != null ? String(t.statusText) : '';
  return `
    <div class="convo-turn">
      <div class="convo-turn-left">
        <label class="panel-label" style="font-size:0.72rem;">Line type</label>
        <select class="panel-select snap-turn-kind">
          <option value="text" ${kind === 'text' ? 'selected' : ''}>Text message</option>
          <option value="savedImage" ${kind === 'savedImage' ? 'selected' : ''}>Saved image in chat</option>
          <option value="snapStatus" ${kind === 'snapStatus' ? 'selected' : ''}>Snap status (Delivered / Opened…)</option>
        </select>
        <div class="snap-speaker-row" style="display:${kind === 'snapStatus' ? 'none' : 'block'}">
          ${buildBinarySpeakerSelectHtml(bin, yourName, theirName)}
        </div>
        <div class="snap-fields-text" style="display:${kind === 'text' ? 'block' : 'none'}">
          <textarea class="convo-turn-text" rows="2" placeholder="Message…">${escapeHTML(t.text || '')}</textarea>
          <label class="panel-checkbox-label" style="display:block;margin-top:8px;font-size:0.85rem;">
            <input type="checkbox" class="snap-text-saved" ${t.saved ? 'checked' : ''}> Saved chat (grey pill background)
          </label>
        </div>
        <div class="snap-fields-image" style="display:${kind === 'savedImage' ? 'block' : 'none'}">
          <label class="panel-label" style="margin-top:8px;font-size:0.72rem;">Image URL</label>
          <p class="panel-field-hint">Direct link to the saved snap image (not a gallery page).</p>
          <input class="panel-input snap-image-url" type="url" placeholder="${HOSTED_IMAGE_URL_PLACEHOLDER}" value="${escapeHTML(t.imageUrl || '')}">
          <label class="panel-label" style="margin-top:6px;font-size:0.72rem;">Alt text (optional)</label>
          <input class="panel-input snap-image-alt" placeholder="Describe the image" value="${escapeHTML(t.imageAlt || '')}">
          <label class="panel-label" style="margin-top:6px;font-size:0.72rem;">Caption under image (e.g. Saved Photo • 10:33 AM)</label>
          <input class="panel-input snap-image-meta" placeholder="Saved Photo • 10:33 AM" value="${escapeHTML(t.meta || '')}">
        </div>
        <div class="snap-fields-status" style="display:${kind === 'snapStatus' ? 'block' : 'none'}">
          <label class="panel-label" style="font-size:0.72rem;margin-top:8px;">Action</label>
          <select class="panel-select snap-status-preset">
            ${snapStatusPresetOptionsHtml(presetKey)}
          </select>
          <label class="panel-label" style="margin-top:6px;font-size:0.72rem;">Status text</label>
          <input class="panel-input snap-status-text" placeholder="e.g. Opened • 10:35 AM (screenshot row: blank = Took a screenshot!)" value="${escapeHTML(stText)}">
        </div>
      </div>
      <button class="convo-turn-remove" aria-label="Remove message">×</button>
    </div>`;
}

function openSnapchatPanel() {
  const raw = getSkinPanelInitialValues();
  if (Array.isArray(raw.participants) && raw.participants.length > 2) {
    showToast('This chat listed more than two people; only you and the other speaker are kept when editing.');
  }
  const norm = window.normalizeSnapchatData(raw);
  const participants = norm.participants;
  const localP = participants.find(p => p.id === norm.localSpeakerId) || participants[0];
  const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
  const yourName = (localP && localP.label) || 'You';
  const theirName = (remoteP && remoteP.label) || 'Them';
  const turns = norm.turns.length
    ? norm.turns
    : [{ speakerId: 'p_remote', text: '' }];
  const turnsHTML = turns.map(t => buildSnapTurnHTML(t, yourName, theirName)).join('');
  const recipientTypingChecked = !!norm.recipientTyping;
  const bodyScrollChecked = norm.bodyScrollMode === 'scroll';

  openPanel('Snapchat', `
    <p class="panel-helper">Rails show who is “them” vs you; plain text sits flush without bubbles unless you check Saved chat. Saved images and snap status lines work as before. Yellow header accent matches Snapchat branding.</p>
    ${hostedImageHelper('Header avatar and “Saved image in chat” lines use direct image URLs.')}
    <div class="panel-field"><label class="panel-label">Friend's name (header)</label>
      <input class="panel-input" id="snap-name" value="${escapeHTML(norm.name || '')}" placeholder="e.g. Pepper Potts"></div>
    <div class="panel-field"><label class="panel-label">Header avatar URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="snap-avatar-url" value="${escapeHTML(norm.avatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}"></div>
    <div class="panel-field">
      <label class="panel-label">Your name (messages you send)</label>
      <input class="panel-input" id="snap-your-name" value="${escapeHTML(yourName)}" placeholder="e.g. You">
    </div>
    <div class="panel-field">
      <label class="panel-label">Sender name (messages they send)</label>
      <input class="panel-input" id="snap-their-name" value="${escapeHTML(theirName)}" placeholder="e.g. Friend">
    </div>
    <div class="panel-section">
      <div class="convo-turns" id="convo-turns">${turnsHTML}</div>
      <button class="add-turn-btn" id="add-snap-turn">+ Add message</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-section">
      <label class="panel-label">For long threads</label>
      <p class="panel-helper" style="margin-top:0">On AO3: either the message area scrolls inside the chat, or the whole chat grows with every line.</p>
      <label class="panel-checkbox-label" style="display:block;margin-top:6px;">
        <input type="radio" name="snap-body-scroll-mode" value="scroll" ${bodyScrollChecked ? 'checked' : ''}> Scroll inside the chat
      </label>
      <label class="panel-checkbox-label" style="display:block;margin-top:4px;">
        <input type="radio" name="snap-body-scroll-mode" value="expand" ${!bodyScrollChecked ? 'checked' : ''}> Grow with all messages
      </label>
    </div>
    <div class="panel-section snap-in-progress-section">
      <label class="panel-label">In progress (optional)</label>
      <p class="panel-helper" style="margin-top:4px">Typing indicator from the other person and/or unsent text in the composer bar.</p>
      <label class="panel-checkbox-label" style="display:block;margin-bottom:10px;">
        <input type="checkbox" id="snap-recipient-typing" ${recipientTypingChecked ? 'checked' : ''}> Show typing indicator (⋯)
      </label>
      <label class="panel-label">Unsent draft text (composer bar)</label>
      <input class="panel-input" id="snap-draft-text" value="${escapeHTML(norm.draftText || '')}" placeholder="Looks like you’re mid-type; not sent yet">
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="snap-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'message');
  const onSnapNames = () => syncBinarySpeakerLabels('#convo-turns', 'snap-your-name', 'snap-their-name');
  document.getElementById('snap-your-name').addEventListener('input', onSnapNames);
  document.getElementById('snap-their-name').addEventListener('input', onSnapNames);
  document.querySelectorAll('#convo-turns .convo-turn').forEach(refreshSnapTurnFields);
  document.getElementById('convo-turns').addEventListener('change', (e) => {
    if (e.target.classList.contains('snap-turn-kind')) refreshSnapTurnFields(e.target.closest('.convo-turn'));
  });
  document.getElementById('add-snap-turn').addEventListener('click', () => {
    const y = document.getElementById('snap-your-name')?.value.trim() || 'You';
    const th = document.getElementById('snap-their-name')?.value.trim() || 'Them';
    const div = document.createElement('div');
    div.innerHTML = buildSnapTurnHTML({ speakerId: 'p_remote', text: '' }, y, th);
    const row = div.firstElementChild;
    document.getElementById('convo-turns').appendChild(row);
    refreshSnapTurnFields(row);
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('snap-save').addEventListener('click', () => {
    const your = document.getElementById('snap-your-name').value.trim() || 'You';
    const their = document.getElementById('snap-their-name').value.trim() || 'Them';
    const turnsSaved = [...document.querySelectorAll('#convo-turns .convo-turn')].map(el => {
      const kind = el.querySelector('.snap-turn-kind')?.value || 'text';
      if (kind === 'savedImage') {
        return {
          turnKind: 'savedImage',
          speakerId: el.querySelector('.convo-binary-speaker')?.value,
          imageUrl: el.querySelector('.snap-image-url')?.value.trim() || '',
          imageAlt: el.querySelector('.snap-image-alt')?.value.trim() || '',
          meta: el.querySelector('.snap-image-meta')?.value.trim() || ''
        };
      }
      if (kind === 'snapStatus') {
        const preset = el.querySelector('.snap-status-preset')?.value || 'they_opened_chat';
        const base = SNAP_STATUS_ACTION_JSON[preset] || SNAP_STATUS_ACTION_JSON.they_opened_chat;
        let statusText = el.querySelector('.snap-status-text')?.value.trim() || '';
        if (preset === 'you_screenshot' && !statusText) statusText = 'Took a screenshot!';
        return Object.assign({ turnKind: 'snapStatus', statusText }, base);
      }
      return {
        turnKind: 'text',
        speakerId: el.querySelector('.convo-binary-speaker')?.value,
        text: el.querySelector('.convo-turn-text')?.value.trim() || '',
        saved: !!(el.querySelector('.snap-text-saved')?.checked)
      };
    }).filter(t => {
      if (t.turnKind === 'savedImage') return !!(t.imageUrl && String(t.imageUrl).trim());
      if (t.turnKind === 'snapStatus') return !!(t.statusText && String(t.statusText).trim());
      return !!(t.text && String(t.text).trim());
    });
    panelInsertOrUpdateSkin('snapchat', {
      name: document.getElementById('snap-name').value.trim(),
      avatarUrl: document.getElementById('snap-avatar-url').value.trim(),
      draftText: document.getElementById('snap-draft-text').value.trim(),
      recipientTyping: document.getElementById('snap-recipient-typing').checked,
      bodyScrollMode: document.querySelector('input[name="snap-body-scroll-mode"]:checked')?.value === 'scroll' ? 'scroll' : 'expand',
      participants: [
        { id: 'p_local', label: your },
        { id: 'p_remote', label: their }
      ],
      localSpeakerId: 'p_local',
      turns: turnsSaved,
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function buildSlackTurnHTML(t) {
  t = t || { username: '', text: '', color: 'color-blue', timestamp: '', avatarUrl: '' };
  return `
    <div class="convo-turn">
      <div class="convo-turn-left">
        <input class="panel-input slack-username-input" placeholder="Username" value="${escapeHTML(t.username || '')}">
        <input class="panel-input slack-avatar-url" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}" value="${escapeHTML(t.avatarUrl || '')}">
        <p class="panel-field-hint">Avatar (optional): direct image URL per message: not a Postimages/Imgur gallery page.</p>
        <textarea class="convo-turn-text" rows="2" placeholder="Message…">${escapeHTML(t.text || '')}</textarea>
        <input class="panel-input slack-timestamp-input" placeholder="Timestamp (e.g. 10:32 AM)" value="${escapeHTML(t.timestamp || '')}">
      </div>
      <button class="convo-turn-remove" aria-label="Remove message">×</button>
    </div>`;
}

function openChatroomPanel() {
  const raw = getSkinPanelInitialValues();
  const norm = window.normalizeSlackChatData(raw);
  const turns = norm.turns.length ? norm.turns : [{ username: '', text: '', timestamp: '', avatarUrl: '' }];
  const bodyScrollChecked = norm.bodyScrollMode === 'scroll';
  openPanel('Chatroom / Slack', `
    <p class="panel-helper">Enter the channel name and add messages in order. Timestamps are optional. Each message can have its own avatar photo (direct image URL) or a colored letter initial if you leave the avatar field blank. ${HOSTED_IMAGE_HELPER_HTML}</p>
    <div class="panel-field"><label class="panel-label">Channel name</label>
      <input class="panel-input" id="slack-channel" value="${escapeHTML(norm.channel || '')}" placeholder="e.g. #avengers-general"></div>
    <div class="panel-section">
      <div class="convo-turns" id="convo-turns">${turns.map(buildSlackTurnHTML).join('')}</div>
      <button class="add-turn-btn" id="add-slack-turn">+ Add message</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-section">
      <label class="panel-label">For long threads</label>
      <p class="panel-helper" style="margin-top:0">Scroll the message list inside the frame, or let the whole widget grow.</p>
      <label class="panel-checkbox-label" style="display:block;margin-top:6px;">
        <input type="radio" name="slack-body-scroll-mode" value="scroll" ${bodyScrollChecked ? 'checked' : ''}> Scroll inside the chat
      </label>
      <label class="panel-checkbox-label" style="display:block;margin-top:4px;">
        <input type="radio" name="slack-body-scroll-mode" value="expand" ${!bodyScrollChecked ? 'checked' : ''}> Grow with all messages
      </label>
    </div>
    <div class="panel-section">
      <label class="panel-label">In progress (optional)</label>
      <label class="panel-label" for="slack-typing-text">Typing status text (optional)</label>
      <input class="panel-input" id="slack-typing-text" value="${escapeHTML(norm.typingText || '')}" placeholder="e.g. Tony is typing...">
      <label class="panel-label" for="slack-draft-text">Unsent draft text (composer bar)</label>
      <input class="panel-input" id="slack-draft-text" value="${escapeHTML(norm.draftText || '')}" placeholder="Looks like you’re mid-type; not sent yet">
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="slack-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'message');
  document.getElementById('add-slack-turn').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = buildSlackTurnHTML({ username: '', text: '', timestamp: '', avatarUrl: '' });
    document.getElementById('convo-turns').appendChild(div.firstElementChild);
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('slack-save').addEventListener('click', () => {
    const turnsSaved = [...document.querySelectorAll('#convo-turns .convo-turn')].map(el => ({
      username:  el.querySelector('.slack-username-input').value.trim(),
      avatarUrl: el.querySelector('.slack-avatar-url')?.value.trim() || '',
      text:      el.querySelector('.convo-turn-text').value.trim(),
      timestamp: el.querySelector('.slack-timestamp-input').value.trim(),
    })).filter(t => t.text);
    panelInsertOrUpdateSkin('chatroom', {
      channel: document.getElementById('slack-channel').value.trim(),
      draftText: document.getElementById('slack-draft-text').value.trim(),
      typingText: document.getElementById('slack-typing-text').value.trim(),
      bodyScrollMode: document.querySelector('input[name="slack-body-scroll-mode"]:checked')?.value === 'scroll' ? 'scroll' : 'expand',
      turns: turnsSaved
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openAndroidPanel() {
  const raw = getSkinPanelInitialValues();
  if (Array.isArray(raw.participants) && raw.participants.length > 2) {
    showToast('This chat listed more than two people; only you and the other speaker are kept when editing.');
  }
  const norm = window.normalizeAndroidSmsData(raw);
  const participants = norm.participants;
  const localP = participants.find(p => p.id === norm.localSpeakerId) || participants[0];
  const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
  const yourName = (localP && localP.label) || 'You';
  const theirName = (remoteP && remoteP.label) || 'Them';
  const turns = norm.androidTurns.length
    ? norm.androidTurns
    : [{ speakerId: 'p_remote', text: '' }];
  const turnsHTML = turns.map(t => buildAndroidTurnHTML(t, yourName, theirName)).join('');
  const recipientTypingChecked = !!norm.recipientTyping;
  const bodyScrollChecked = norm.bodyScrollMode === 'scroll';

  openPanel('Android SMS', `
    <p class="panel-helper">Simple SMS bubbles: blue for sent, grey for received. Pick who sent each line.</p>
    ${hostedImageHelper('Optional header avatar: direct image URL, or blank for the first letter of the contact name.')}
    <div class="panel-field">
      <label class="panel-label">Your name (messages you send)</label>
      <input class="panel-input" id="android-your-name" value="${escapeHTML(yourName)}" placeholder="e.g. You">
    </div>
    <div class="panel-field">
      <label class="panel-label">Sender name (messages they send)</label>
      <input class="panel-input" id="android-their-name" value="${escapeHTML(theirName)}" placeholder="e.g. Them">
    </div>
    <div class="panel-field">
      <label class="panel-label">Header avatar URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="android-header-avatar-url" value="${escapeHTML(norm.headerAvatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}">
    </div>
    <div class="panel-section">
      <div class="convo-turns" id="convo-turns">${turnsHTML}</div>
      <button class="add-turn-btn" id="add-android-turn">+ Add message</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-section">
      <label class="panel-label">For long threads</label>
      <p class="panel-helper" style="margin-top:0">Scroll the message list inside the frame, or let the whole widget grow.</p>
      <label class="panel-checkbox-label" style="display:block;margin-top:6px;">
        <input type="radio" name="android-body-scroll-mode" value="scroll" ${bodyScrollChecked ? 'checked' : ''}> Scroll inside the chat
      </label>
      <label class="panel-checkbox-label" style="display:block;margin-top:4px;">
        <input type="radio" name="android-body-scroll-mode" value="expand" ${!bodyScrollChecked ? 'checked' : ''}> Grow with all messages
      </label>
    </div>
    <div class="panel-section">
      <label class="panel-label">In progress (optional)</label>
      <label class="panel-checkbox-label" style="display:block;margin-bottom:10px;">
        <input type="checkbox" id="android-recipient-typing" ${recipientTypingChecked ? 'checked' : ''}> Show typing indicator (⋯)
      </label>
      <label class="panel-label">Unsent draft text (composer bar)</label>
      <input class="panel-input" id="android-draft-text" value="${escapeHTML(norm.draftText || '')}" placeholder="Looks like you’re mid-type; not sent yet">
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="android-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'message');
  const onAndNames = () => syncBinarySpeakerLabels('#convo-turns', 'android-your-name', 'android-their-name');
  document.getElementById('android-your-name').addEventListener('input', onAndNames);
  document.getElementById('android-their-name').addEventListener('input', onAndNames);
  document.getElementById('add-android-turn').addEventListener('click', () => {
    const y = document.getElementById('android-your-name')?.value.trim() || 'You';
    const th = document.getElementById('android-their-name')?.value.trim() || 'Them';
    const div = document.createElement('div');
    div.innerHTML = buildAndroidTurnHTML({ speakerId: 'p_remote', text: '' }, y, th);
    document.getElementById('convo-turns').appendChild(div.firstElementChild);
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('android-save').addEventListener('click', () => {
    const your = document.getElementById('android-your-name').value.trim() || 'You';
    const their = document.getElementById('android-their-name').value.trim() || 'Them';
    const androidTurns = [...document.querySelectorAll('#convo-turns .convo-turn')].map(el => ({
      speakerId: el.querySelector('.convo-binary-speaker')?.value,
      text: el.querySelector('.convo-turn-text').value.trim(),
    })).filter(t => t.text);
    panelInsertOrUpdateSkin('android', {
      participants: [
        { id: 'p_local', label: your },
        { id: 'p_remote', label: their }
      ],
      localSpeakerId: 'p_local',
      headerAvatarUrl: document.getElementById('android-header-avatar-url').value.trim(),
      draftText: document.getElementById('android-draft-text').value.trim(),
      recipientTyping: document.getElementById('android-recipient-typing').checked,
      bodyScrollMode: document.querySelector('input[name="android-body-scroll-mode"]:checked')?.value === 'scroll' ? 'scroll' : 'expand',
      androidTurns
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openReviewPanel() {
  const data = getSkinPanelInitialValues();
  const rating = data.rating || 0;
  const starsHTML = [1,2,3,4,5].map(n =>
    `<option value="${n}" ${rating == n ? 'selected' : ''}>${'★'.repeat(n)}</option>`
  ).join('');
  openPanel('Review', `
    <p class="panel-helper">Creates a review card with a star rating. Stars appear as ★ symbols on AO3. Leave "Date" empty to hide it.</p>
    ${hostedImageHelper('Reviewer photo is optional.')}
    <div class="panel-field"><label class="panel-label">Reviewer name</label>
      <input class="panel-input" id="review-reviewer" value="${escapeHTML(data.reviewer || '')}" placeholder="e.g. CrypticReader42"></div>
    <div class="panel-field"><label class="panel-label">Star rating</label>
      <select class="panel-select" id="review-rating">
        <option value="0">No rating</option>${starsHTML}
      </select></div>
    <div class="panel-field"><label class="panel-label">Date (optional)</label>
      <input class="panel-input" id="review-date" value="${escapeHTML(data.date || '')}" placeholder="e.g. March 3, 2024"></div>
    <div class="panel-field"><label class="panel-label">Reviewer avatar URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="review-avatar-url" value="${escapeHTML(data.avatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}"></div>
    <div class="panel-field"><label class="panel-label">Review text</label>
      <textarea class="panel-textarea" id="review-text" rows="5" placeholder="The review content…">${escapeHTML(data.text || '')}</textarea></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="review-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('review-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('review', {
      reviewer:  document.getElementById('review-reviewer').value.trim(),
      rating:    document.getElementById('review-rating').value,
      date:      document.getElementById('review-date').value.trim(),
      avatarUrl: document.getElementById('review-avatar-url').value.trim(),
      text:      document.getElementById('review-text').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openStickyNotePanel() {
  const data = getSkinPanelInitialValues();
  const colors = [
    { value: '',             label: '🟡 Yellow (default)' },
    { value: 'sticky-pink',  label: '🩷 Pink' },
    { value: 'sticky-blue',  label: '🔵 Blue' },
    { value: 'sticky-green', label: '🟢 Green' },
    { value: 'sticky-orange',label: '🟠 Orange' },
  ];
  const colorOpts = colors.map(c =>
    `<option value="${c.value}" ${(data.color || '') === c.value ? 'selected' : ''}>${c.label}</option>`
  ).join('');
  openPanel('Sticky Note', `
    <p class="panel-helper">A Post-it style note with a handwritten font. Great for in-universe notes, annotations, or quick messages.</p>
    <div class="panel-field"><label class="panel-label">Note text</label>
      <textarea class="panel-textarea" id="sticky-text" rows="5" placeholder="Don't forget!\nCall Pepper">${escapeHTML(data.text || '')}</textarea></div>
    <div class="panel-field"><label class="panel-label">Color</label>
      <select class="panel-select" id="sticky-color">${colorOpts}</select></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="sticky-note-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('sticky-note-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('sticky', {
      text:  document.getElementById('sticky-text').value,
      color: document.getElementById('sticky-color').value,
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openInstagramPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Instagram Post', `
    ${hostedImageHelper('Profile photo and main post image use the fields below.')}
    <div class="panel-field"><label class="panel-label">Username</label>
      <input class="panel-input" id="ig-username" value="${escapeHTML(data.username || '')}" placeholder="e.g. tony.stark.official"></div>
    <div class="panel-field"><label class="panel-label">Profile photo URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="ig-avatar-url" value="${escapeHTML(data.avatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}"></div>
    <div class="panel-field"><label class="panel-label">Post image URL</label>
      <p class="panel-field-hint">Main photo in the post: direct link required.</p>
      <input class="panel-input" id="ig-imageurl" value="${escapeHTML(data.imageUrl || '')}" placeholder="${HOSTED_IMAGE_URL_PLACEHOLDER}"></div>
    <div class="panel-field"><label class="panel-label">Image description (for screen readers)</label>
      <input class="panel-input" id="ig-alt" value="${escapeHTML(data.altText || '')}" placeholder="e.g. Tony standing in the lab"></div>
    <div class="panel-field"><label class="panel-label">Caption (optional)</label>
      <textarea class="panel-textarea" id="ig-caption" rows="3" placeholder="Caption text…">${escapeHTML(data.caption || '')}</textarea></div>
    <div class="panel-field"><label class="panel-label">Like count (optional)</label>
      <input class="panel-input" id="ig-likes" value="${escapeHTML(data.likes || '')}" placeholder="e.g. 12,483"></div>
    <div class="panel-field"><label class="panel-label">Comment count (optional)</label>
      <input class="panel-input" id="ig-comments" value="${escapeHTML(data.comments || '')}" placeholder="e.g. 847"></div>
    <div class="panel-field"><label class="panel-label">Date (optional)</label>
      <input class="panel-input" id="ig-date" value="${escapeHTML(data.date || '')}" placeholder="e.g. March 15"></div>
    <div class="panel-field"><label class="panel-label">Carousel: total slides (1–12)</label>
      <input class="panel-input" id="ig-carousel-total" type="number" min="1" max="12" value="${escapeHTML(String(data.carouselTotal != null ? data.carouselTotal : '1'))}" placeholder="1"></div>
    <div class="panel-field"><label class="panel-label">Carousel: active slide # (1-based)</label>
      <input class="panel-input" id="ig-carousel-active" type="number" min="1" value="${escapeHTML(String(data.carouselActive != null ? data.carouselActive : '1'))}" placeholder="1"></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="ig-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('ig-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('instagram', {
      username: document.getElementById('ig-username').value.trim(),
      avatarUrl: document.getElementById('ig-avatar-url').value.trim(),
      imageUrl: document.getElementById('ig-imageurl').value.trim(),
      altText:  document.getElementById('ig-alt').value.trim(),
      caption:  document.getElementById('ig-caption').value.trim(),
      likes:    document.getElementById('ig-likes').value.trim(),
      comments: document.getElementById('ig-comments').value.trim(),
      date:     document.getElementById('ig-date').value.trim(),
      carouselTotal: document.getElementById('ig-carousel-total').value.trim(),
      carouselActive: document.getElementById('ig-carousel-active').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openLegalPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Legal / Custom HTML', `
    <p class="panel-helper">⚠️ For advanced use. Only AO3-safe HTML tags are allowed: scripts and event handlers are stripped automatically on save. The preview below uses the same sanitizer as save.</p>
    <div class="panel-field"><label class="panel-label">Custom HTML</label>
      <textarea class="panel-textarea" id="legal-html" rows="10" placeholder="Paste your AO3-compatible HTML here…">${escapeHTML(data.customHtml || '')}</textarea></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="legal-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('legal-save').addEventListener('click', () => {
    const raw = document.getElementById('legal-html').value;
    const sanitized = sanitizeCustomHtml(raw);
    if (raw.trim() && sanitized !== raw.trim()) showToast('Some unsafe HTML was removed before saving.');
    panelInsertOrUpdateSkin('legal', { customHtml: sanitized });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

// ── NEW SKIN PANELS ───────────────────────────────────────────

function buildDiscordTurnHTML(t) {
  t = t || { username: '', color: 'dc-av-blue', text: '', timestamp: '', avatarUrl: '', replyToUsername: '', replyToSnippet: '', replyToAvatarUrl: '' };
  const colors = ['dc-av-blue','dc-av-green','dc-av-red','dc-av-yellow','dc-av-purple','dc-av-pink'];
  const colorOpts = colors.map(c =>
    `<option value="${c}" ${t.color === c ? 'selected':''}>${c.replace('dc-av-','')}</option>`
  ).join('');
  return `
    <div class="convo-turn convo-turn-discord">
      <div class="convo-turn-left">
        <div class="convo-turn-header">Message</div>
        <div class="convo-subgroup convo-subgroup-speaker">
          <label class="panel-label" style="font-size:0.72rem;">Speaker</label>
          <p class="panel-helper" style="margin-top:0;margin-bottom:6px;font-size:0.78rem;">Set once per username: these travel with every message from this person.</p>
          <input class="panel-input discord-username" placeholder="Username" value="${escapeHTML(t.username || '')}">
          <label class="panel-label" style="font-size:0.72rem;margin-top:6px;">Avatar color</label>
          <select class="convo-side-select discord-color">${colorOpts}</select>
          <input class="panel-input discord-avatar-url" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}" value="${escapeHTML(t.avatarUrl || '')}">
          <p class="panel-field-hint">Direct image URL for this user’s avatar.</p>
        </div>
        <div class="convo-subgroup convo-subgroup-reply">
          <label class="panel-label" style="font-size:0.72rem;">Reply preview (optional)</label>
          <p class="panel-helper" style="margin-top:0;margin-bottom:6px;font-size:0.78rem;">Leave blank to auto-fetch if they spoke earlier in the chat.</p>
          <input class="panel-input discord-reply-user" placeholder="Reply to: username (optional)" value="${escapeHTML(t.replyToUsername || '')}">
          <input class="panel-input discord-reply-snippet" placeholder="Reply to: snippet (optional)" value="${escapeHTML(t.replyToSnippet || '')}">
          <input class="panel-input discord-reply-avatar-url" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}" value="${escapeHTML(t.replyToAvatarUrl || '')}">
          <p class="panel-field-hint">Direct image URL for the reply preview. Blank = auto from earlier message or initial.</p>
        </div>
        <textarea class="convo-turn-text" rows="2" placeholder="Message…">${escapeHTML(t.text || '')}</textarea>
        <input class="panel-input discord-timestamp" placeholder="Timestamp: e.g. Today at 9:00 AM" value="${escapeHTML(t.timestamp || '')}">
      </div>
      <button class="convo-turn-remove" aria-label="Remove">×</button>
    </div>`;
}

function openDiscordPanel() {
  const raw = getSkinPanelInitialValues();
  const norm = window.normalizeDiscordData(raw);
  const turns = norm.turns.length ? norm.turns : [{ username: '', color: 'dc-av-blue', text: '', timestamp: '', avatarUrl: '', replyToUsername: '', replyToSnippet: '', replyToAvatarUrl: '' }];
  const bodyScrollChecked = norm.bodyScrollMode === 'scroll';
  openPanel('Discord', `
    <p class="panel-helper">Messages from the same username in a row automatically collapse: only the first shows the avatar and username, just like real Discord.</p>
    ${hostedImageHelper('Per-user avatar URLs use direct image links.')}
    <div class="panel-field"><label class="panel-label">Channel name</label>
      <input class="panel-input" id="discord-channel" value="${escapeHTML(norm.channel || '')}" placeholder="e.g. avengers-general"></div>
    <div class="panel-section">
      <div class="convo-turns" id="convo-turns">${turns.map(buildDiscordTurnHTML).join('')}</div>
      <button class="add-turn-btn" id="add-discord-turn">+ Add message</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-section">
      <label class="panel-label">For long threads</label>
      <p class="panel-helper" style="margin-top:0">Scroll the message list inside the frame, or let the whole widget grow.</p>
      <label class="panel-checkbox-label" style="display:block;margin-top:6px;">
        <input type="radio" name="discord-body-scroll-mode" value="scroll" ${bodyScrollChecked ? 'checked' : ''}> Scroll inside the chat
      </label>
      <label class="panel-checkbox-label" style="display:block;margin-top:4px;">
        <input type="radio" name="discord-body-scroll-mode" value="expand" ${!bodyScrollChecked ? 'checked' : ''}> Grow with all messages
      </label>
    </div>
    <div class="panel-section">
      <label class="panel-label">In progress (optional)</label>
      <label class="panel-label" for="discord-typing-text">Typing status text (optional)</label>
      <input class="panel-input" id="discord-typing-text" value="${escapeHTML(norm.typingText || '')}" placeholder="e.g. Tony is typing...">
      <label class="panel-label" for="discord-draft-text">Unsent draft text (composer bar)</label>
      <input class="panel-input" id="discord-draft-text" value="${escapeHTML(norm.draftText || '')}" placeholder="Looks like you’re mid-type; not sent yet">
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="discord-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'message');
  document.getElementById('add-discord-turn').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = buildDiscordTurnHTML({ username: '', color: 'dc-av-blue', text: '', timestamp: '', avatarUrl: '', replyToUsername: '', replyToSnippet: '', replyToAvatarUrl: '' });
    document.getElementById('convo-turns').appendChild(div.firstElementChild);
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('discord-save').addEventListener('click', () => {
    const turnsSaved = [...document.querySelectorAll('#convo-turns .convo-turn')].map(el => ({
      username:  el.querySelector('.discord-username').value.trim(),
      color:     el.querySelector('.discord-color').value,
      text:      el.querySelector('.convo-turn-text').value.trim(),
      timestamp: el.querySelector('.discord-timestamp').value.trim(),
      avatarUrl: el.querySelector('.discord-avatar-url').value.trim(),
      replyToUsername: el.querySelector('.discord-reply-user').value.trim(),
      replyToSnippet: el.querySelector('.discord-reply-snippet').value.trim(),
      replyToAvatarUrl: el.querySelector('.discord-reply-avatar-url').value.trim(),
    })).filter(t => t.text);
    panelInsertOrUpdateSkin('discord', {
      channel: document.getElementById('discord-channel').value.trim(),
      draftText: document.getElementById('discord-draft-text').value.trim(),
      typingText: document.getElementById('discord-typing-text').value.trim(),
      bodyScrollMode: document.querySelector('input[name="discord-body-scroll-mode"]:checked')?.value === 'scroll' ? 'scroll' : 'expand',
      turns: turnsSaved,
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function buildRedditCommentHTML(c) {
  c = c || { username: '', text: '', score: '' };
  return `
    <div class="convo-turn">
      <div class="convo-turn-left">
        <input class="panel-input rdt-c-username" placeholder="u/username" value="${escapeHTML(c.username || '')}">
        <textarea class="convo-turn-text" rows="2" placeholder="Comment text…">${escapeHTML(c.text || '')}</textarea>
        <input class="panel-input rdt-c-score" placeholder="Score: e.g. 891" value="${escapeHTML(c.score || '')}">
      </div>
      <button class="convo-turn-remove" aria-label="Remove">×</button>
    </div>`;
}

function openRedditPanel() {
  const data     = getSkinPanelInitialValues();
  const comments = data.comments || [];
  openPanel('Reddit Post', `
    <p class="panel-helper">Creates a Reddit post card. Add comments below the post if you want a thread. Leave score empty to show a bullet instead of a number.</p>
    <div class="panel-field"><label class="panel-label">Subreddit</label>
      <input class="panel-input" id="rdt-sub" value="${escapeHTML(data.subreddit || '')}" placeholder="e.g. r/marvelstudios"></div>
    <div class="panel-field"><label class="panel-label">Posted by</label>
      <input class="panel-input" id="rdt-author" value="${escapeHTML(data.author || '')}" placeholder="e.g. u/fangirl99"></div>
    <div class="panel-field"><label class="panel-label">Post title</label>
      <input class="panel-input" id="rdt-title" value="${escapeHTML(data.title || '')}" placeholder="What's your hot take?"></div>
    <div class="panel-field"><label class="panel-label">Post body (optional)</label>
      <textarea class="panel-textarea" id="rdt-body" rows="4" placeholder="Elaborate…">${escapeHTML(data.body || '')}</textarea></div>
    <div class="panel-field"><label class="panel-label">Score (optional)</label>
      <input class="panel-input" id="rdt-score" value="${escapeHTML(data.score || '')}" placeholder="e.g. 4.2k"></div>
    <div class="panel-field"><label class="panel-label">Comment count (optional)</label>
      <input class="panel-input" id="rdt-comments-count" value="${escapeHTML(data.commentCount || '')}" placeholder="e.g. 312"></div>
    <div class="panel-section">
      <label class="panel-label">Comments (optional)</label>
      <div class="convo-turns" id="convo-turns">${comments.map(buildRedditCommentHTML).join('')}</div>
      <button class="add-turn-btn" id="add-rdt-comment">+ Add comment</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="rdt-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'comment');
  document.getElementById('add-rdt-comment').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = buildRedditCommentHTML({ username: '', text: '', score: '' });
    document.getElementById('convo-turns').appendChild(div.firstElementChild);
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('rdt-save').addEventListener('click', () => {
    const comments = [...document.querySelectorAll('#convo-turns .convo-turn')].map(el => ({
      username: el.querySelector('.rdt-c-username').value.trim(),
      text:     el.querySelector('.convo-turn-text').value.trim(),
      score:    el.querySelector('.rdt-c-score').value.trim(),
    })).filter(c => c.text);
    panelInsertOrUpdateSkin('reddit', {
      subreddit:    document.getElementById('rdt-sub').value.trim(),
      author:       document.getElementById('rdt-author').value.trim(),
      title:        document.getElementById('rdt-title').value.trim(),
      body:         document.getElementById('rdt-body').value.trim(),
      score:        document.getElementById('rdt-score').value.trim(),
      commentCount: document.getElementById('rdt-comments-count').value.trim(),
      comments,
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openBlueskyPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Bluesky Post', `
    <p class="panel-helper">Creates a Bluesky post card. Leave stats empty to hide them.</p>
    ${hostedImageHelper('Profile photo replaces the letter initial when set.')}
    <div class="panel-field"><label class="panel-label">Display name</label>
      <input class="panel-input" id="bsky-name" value="${escapeHTML(data.name || '')}" placeholder="e.g. Tony Stark"></div>
    <div class="panel-field"><label class="panel-label">Handle</label>
      <input class="panel-input" id="bsky-handle" value="${escapeHTML(data.handle || '')}" placeholder="e.g. @ironman.bsky.social"></div>
    <div class="panel-field"><label class="panel-label">Profile photo URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="bsky-avatar-url" value="${escapeHTML(data.avatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}"></div>
    <div class="panel-field"><label class="panel-label">Post text</label>
      <textarea class="panel-textarea" id="bsky-text" rows="4" placeholder="What's on your mind?">${escapeHTML(data.text || '')}</textarea></div>
    <div class="panel-field"><label class="panel-label">Date (optional)</label>
      <input class="panel-input" id="bsky-date" value="${escapeHTML(data.date || '')}" placeholder="e.g. Apr 11, 2025 · 9:41 AM"></div>
    <div class="panel-field"><label class="panel-label">Likes (optional)</label>
      <input class="panel-input" id="bsky-likes" value="${escapeHTML(data.likes || '')}" placeholder="e.g. 3.2k"></div>
    <div class="panel-field"><label class="panel-label">Reposts (optional)</label>
      <input class="panel-input" id="bsky-reposts" value="${escapeHTML(data.reposts || '')}" placeholder="e.g. 847"></div>
    <div class="panel-field"><label class="panel-label">Replies (optional)</label>
      <input class="panel-input" id="bsky-replies" value="${escapeHTML(data.replies || '')}" placeholder="e.g. 234"></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="bsky-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('bsky-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('bluesky', {
      name:      document.getElementById('bsky-name').value.trim(),
      handle:    document.getElementById('bsky-handle').value.trim(),
      avatarUrl: document.getElementById('bsky-avatar-url').value.trim(),
      text:      document.getElementById('bsky-text').value.trim(),
      date:      document.getElementById('bsky-date').value.trim(),
      likes:     document.getElementById('bsky-likes').value.trim(),
      reposts:   document.getElementById('bsky-reposts').value.trim(),
      replies:   document.getElementById('bsky-replies').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openNewspaperPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Newspaper Article', `
    <p class="panel-helper">Classic newspaper layout with a serif font. Separate body paragraphs with a blank line: each becomes its own paragraph.</p>
    <div class="panel-field"><label class="panel-label">Publication name (optional)</label>
      <input class="panel-input" id="np-publication" value="${escapeHTML(data.publication || '')}" placeholder="e.g. The Daily Bugle"></div>
    <div class="panel-field"><label class="panel-label">Dateline (optional)</label>
      <input class="panel-input" id="np-dateline" value="${escapeHTML(data.dateline || '')}" placeholder="e.g. NEW YORK, Wednesday, April 11"></div>
    <div class="panel-field"><label class="panel-label">Headline</label>
      <input class="panel-input" id="np-headline" value="${escapeHTML(data.headline || '')}" placeholder="SPIDER-MAN SAVES CITY AGAIN"></div>
    <div class="panel-field"><label class="panel-label">Subheadline (optional)</label>
      <input class="panel-input" id="np-subheadline" value="${escapeHTML(data.subheadline || '')}" placeholder="Web-slinger thwarts Vulture's latest scheme"></div>
    <div class="panel-field"><label class="panel-label">Byline (optional)</label>
      <input class="panel-input" id="np-byline" value="${escapeHTML(data.byline || '')}" placeholder="e.g. J. Jonah Jameson"></div>
    <div class="panel-field"><label class="panel-label">Article body</label>
      <textarea class="panel-textarea" id="np-body" rows="8" placeholder="Write the article here…\n\nBlank lines become new paragraphs.">${escapeHTML(data.body || '')}</textarea></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="np-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('np-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('newspaper', {
      publication: document.getElementById('np-publication').value.trim(),
      dateline:    document.getElementById('np-dateline').value.trim(),
      headline:    document.getElementById('np-headline').value.trim(),
      subheadline: document.getElementById('np-subheadline').value.trim(),
      byline:      document.getElementById('np-byline').value.trim(),
      body:        document.getElementById('np-body').value,
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function buildForumPostFormHTML(p) {
  p = p || { username: '', role: 'Member', postCount: '', date: '', postNum: '', content: '', signature: '', avatarUrl: '' };
  return `
    <div class="convo-turn convo-turn-forum">
      <div class="convo-turn-left">
        <div class="convo-turn-header">Post</div>
        <input class="panel-input forum-username" placeholder="Username" value="${escapeHTML(p.username || '')}">
        <input class="panel-input forum-avatar-url" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}" value="${escapeHTML(p.avatarUrl || '')}">
        <p class="panel-field-hint">Direct image URL for this poster’s avatar.</p>
        <input class="panel-input forum-role" placeholder="Role: e.g. Senior Member" value="${escapeHTML(p.role || 'Member')}">
        <input class="panel-input forum-postcount" placeholder="Post count: e.g. 2,341 posts" value="${escapeHTML(p.postCount || '')}">
        <input class="panel-input forum-date" placeholder="Date: e.g. March 15, 2012" value="${escapeHTML(p.date || '')}">
        <input class="panel-input forum-postnum" placeholder="Post number: e.g. #1" value="${escapeHTML(p.postNum || '')}">
        <textarea class="convo-turn-text" rows="3" placeholder="Post content…">${escapeHTML(p.content || '')}</textarea>
        <input class="panel-input forum-sig" placeholder="Signature: optional" value="${escapeHTML(p.signature || '')}">
      </div>
      <button class="convo-turn-remove" aria-label="Remove post">×</button>
    </div>`;
}

function openForumPanel() {
  const data  = getSkinPanelInitialValues();
  const posts = data.posts || [{ username: '', role: 'Member', postNum: '#1', content: '' }];
  openPanel('Forum / BBS Thread', `
    <p class="panel-helper">Classic internet forum layout with a user info sidebar. Add posts in the order they appear in the thread.</p>
    ${hostedImageHelper('Each post can include an avatar via a direct image URL in that post’s fields.')}
    <div class="panel-field"><label class="panel-label">Forum name</label>
      <input class="panel-input" id="forum-name" value="${escapeHTML(data.forumName || '')}" placeholder="e.g. SuperheroFanForum"></div>
    <div class="panel-field"><label class="panel-label">Thread title</label>
      <input class="panel-input" id="forum-title" value="${escapeHTML(data.threadTitle || '')}" placeholder="e.g. Best Iron Man moment?"></div>
    <div class="panel-section">
      <div class="convo-turns" id="convo-turns">${posts.map(buildForumPostFormHTML).join('')}</div>
      <button class="add-turn-btn" id="add-forum-post">+ Add post</button>
      <span id="panel-turn-count" class="turn-count-badge"></span>
    </div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="forum-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  initDraggableTurns('convo-turns', 'post');
  document.getElementById('add-forum-post').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = buildForumPostFormHTML({ username: '', role: 'Member', content: '' });
    document.getElementById('convo-turns').appendChild(div.firstElementChild);
  });
  document.getElementById('convo-turns').addEventListener('click', (e) => {
    if (e.target.classList.contains('convo-turn-remove')) e.target.closest('.convo-turn').remove();
  });
  document.getElementById('forum-save').addEventListener('click', () => {
    const posts = [...document.querySelectorAll('#convo-turns .convo-turn')].map(el => ({
      username:  el.querySelector('.forum-username').value.trim(),
      avatarUrl: el.querySelector('.forum-avatar-url')?.value.trim() || '',
      role:      el.querySelector('.forum-role').value.trim(),
      postCount: el.querySelector('.forum-postcount').value.trim(),
      date:      el.querySelector('.forum-date').value.trim(),
      postNum:   el.querySelector('.forum-postnum').value.trim(),
      content:   el.querySelector('.convo-turn-text').value.trim(),
      signature: el.querySelector('.forum-sig').value.trim(),
    })).filter(p => p.content || p.username);
    panelInsertOrUpdateSkin('forum', {
      forumName:   document.getElementById('forum-name').value.trim(),
      threadTitle: document.getElementById('forum-title').value.trim(),
      posts,
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

function openFacebookPanel() {
  const data = getSkinPanelInitialValues();
  openPanel('Facebook Post', `
    <p class="panel-helper">Creates a Facebook post card. The first letter of the name is the default avatar; add a profile photo URL to use a picture instead. Leave reaction/comment counts empty to hide them.</p>
    ${hostedImageHelper('Profile photo uses a direct image URL.')}
    <div class="panel-field"><label class="panel-label">Name</label>
      <input class="panel-input" id="fb-name" value="${escapeHTML(data.name || '')}" placeholder="e.g. Tony Stark"></div>
    <div class="panel-field"><label class="panel-label">Profile photo URL (optional)</label>
      ${HOSTED_AVATAR_FIELD_HINT}
      <input class="panel-input" id="fb-avatar-url" value="${escapeHTML(data.avatarUrl || '')}" placeholder="${HOSTED_AVATAR_URL_PLACEHOLDER}"></div>
    <div class="panel-field"><label class="panel-label">Timestamp</label>
      <input class="panel-input" id="fb-timestamp" value="${escapeHTML(data.timestamp || '')}" placeholder="e.g. 2 hours ago · 🌐"></div>
    <div class="panel-field"><label class="panel-label">Post text</label>
      <textarea class="panel-textarea" id="fb-body" rows="5" placeholder="What's on your mind?">${escapeHTML(data.body || '')}</textarea></div>
    <div class="panel-field"><label class="panel-label">Reaction emojis (optional)</label>
      <input class="panel-input" id="fb-emojis" value="${escapeHTML(data.reactionEmojis || '👍')}" placeholder="e.g. 👍❤️😂"></div>
    <div class="panel-field"><label class="panel-label">Reaction count (optional)</label>
      <input class="panel-input" id="fb-reactions" value="${escapeHTML(data.reactions || '')}" placeholder="e.g. 1.2k"></div>
    <div class="panel-field"><label class="panel-label">Comment count (optional)</label>
      <input class="panel-input" id="fb-comments" value="${escapeHTML(data.comments || '')}" placeholder="e.g. 234"></div>
    <div class="panel-field"><label class="panel-label">Share count (optional)</label>
      <input class="panel-input" id="fb-shares" value="${escapeHTML(data.shares || '')}" placeholder="e.g. 89"></div>
    <div class="panel-actions">
      <button class="panel-btn-primary" id="fb-save">${getSaveLabel()}</button>
      <button class="panel-btn-ghost" id="panel-cancel">Cancel</button>
    </div>`);
  document.getElementById('fb-save').addEventListener('click', () => {
    panelInsertOrUpdateSkin('facebook', {
      name:           document.getElementById('fb-name').value.trim(),
      avatarUrl:      document.getElementById('fb-avatar-url').value.trim(),
      timestamp:      document.getElementById('fb-timestamp').value.trim(),
      body:           document.getElementById('fb-body').value.trim(),
      reactionEmojis: document.getElementById('fb-emojis').value.trim(),
      reactions:      document.getElementById('fb-reactions').value.trim(),
      comments:       document.getElementById('fb-comments').value.trim(),
      shares:         document.getElementById('fb-shares').value.trim(),
    });
  });
  document.getElementById('panel-cancel').addEventListener('click', closeAllPanels);
}

// ── DRAGGABLE TURNS + TURN COUNT ─────────────────────────────
// Call after any panel with a #convo-turns list opens.
// label: singular term e.g. 'message', 'post', 'comment'
function initDraggableTurns(containerId, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Turn count badge
  function updateCount() {
    const el = document.getElementById('panel-turn-count');
    if (!el) return;
    const n = container.querySelectorAll('.convo-turn').length;
    el.textContent = n + ' ' + label + (n !== 1 ? 's' : '');
  }
  updateCount();
  new MutationObserver(updateCount).observe(container, { childList: true });

  // Drag-to-reorder
  let dragging = null;

  // Inject drag handle into each existing turn, watch for new ones
  function addHandle(turn) {
    if (turn.querySelector('.drag-handle')) return;
    const h = document.createElement('span');
    h.className   = 'drag-handle';
    h.textContent = '⠿';
    h.title       = 'Drag to reorder';
    turn.appendChild(h);
  }
  container.querySelectorAll('.convo-turn').forEach(addHandle);
  new MutationObserver(muts => muts.forEach(m =>
    m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('convo-turn')) addHandle(n); })
  )).observe(container, { childList: true });

  container.addEventListener('dragstart', (e) => {
    if (!e.target.classList.contains('drag-handle')) return;
    dragging = e.target.closest('.convo-turn');
    if (dragging) { dragging.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const target = e.target.closest('.convo-turn');
    if (!target || target === dragging) return;
    const mid = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    container.insertBefore(dragging, e.clientY < mid ? target : target.nextSibling);
  });
  container.addEventListener('dragend', () => {
    if (dragging) { dragging.classList.remove('dragging'); dragging = null; }
    clearTimeout(previewRefreshTimer);
    previewRefreshTimer = setTimeout(refreshPanelPreview, 100);
  });
}

// ── TIPTAP STATE MUTATION ────────────────────────────────────
function panelInsertOrUpdateSkin(type, dataObj) {
  const te = window.tiptapEditor;
  if (!te) return;
  
  const contentData = cloneContentDataForAttrs(dataObj);
  const isUpdate = !!(skinTipTapEditCtx && typeof skinTipTapEditCtx.getPos === 'function');

  let pos = null;
  if (isUpdate) {
    try {
      pos = skinTipTapEditCtx.getPos();
      // Verify the node still exists at this position
      const nodeAtPos = te.state.doc.nodeAt(pos);
      if (!nodeAtPos || nodeAtPos.type.name !== 'skinBlock') {
        showToast('Block was moved or deleted: inserting as new.');
        pos = null;
      }
    } catch {
      showToast('Block could not be found: inserting as new.');
      pos = null;
    }
  }

  if (isUpdate && pos !== null) {
    te.chain().focus().command(({ tr, dispatch }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node || node.type.name !== 'skinBlock') return false;
      tr.setNodeMarkup(pos, undefined, { type, contentData });
      dispatch(tr);
      return true;
    }).run();
  } else {
    te.chain().focus().insertContent({ type: 'skinBlock', attrs: { type, contentData } }).run();
  }
  
  closeAllPanels();
  scheduleSave();
}

// ── THE EXPORT ENGINE ────────────────────────────────────────
function getExportHTML() {
  const te = window.tiptapEditor;
  if (!te || typeof window.ao3worksGenerateDocSliceHtml !== 'function') return '';
  if (!__exportPipeline) return '';

  const rawJson = te.getJSON();
  return __exportPipeline.buildExportHtmlFromJson(rawJson, {
    generateNodeHtml: window.ao3worksGenerateDocSliceHtml,
    skinInnerHtmlFromAttrs: window.ao3worksSkinInnerHtmlFromAttrs || null
  });
}

// ── STUDIO CHAPTER FILE (download + import round-trip) ───────
// Downloaded .html = HTML comment (base64 JSON { ao3WorksSave, doc }) + same body as getExportHTML().

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function buildAo3WorksChapterFileContents() {
  const te = window.tiptapEditor;
  if (!te || te.isDestroyed) return '';
  const doc = te.getJSON();
  const payload = JSON.stringify({ ao3WorksSave: 1, doc });
  const b64 = utf8ToBase64(payload);
  const body = getExportHTML();
  return `<!-- ao3works-backup:${b64} -->\n` + body;
}

function syncChapterDownloadButtonState() {
  const btn = document.getElementById('download-chapter-html-btn');
  const te = window.tiptapEditor;
  if (!btn) return;
  if (!te || te.isDestroyed) {
    btn.disabled = true;
    return;
  }
  btn.disabled = hasUnhostedImagesInDoc(te.getJSON());
}

function syncExportButtonState() {
  const btn = document.getElementById('export-btn');
  const te = window.tiptapEditor;
  if (!btn) return;
  if (!te || te.isDestroyed) {
    return;
  }
  const placeholders = countImportPlaceholdersInDoc(te.getJSON());
  if (placeholders > 0) {
    btn.disabled = true;
    btn.title = `Rebuild ${placeholders} imported placeholder block(s) with + Insert before exporting`;
  } else {
    btn.disabled = false;
    btn.removeAttribute('title');
  }
}

function downloadAo3WorksChapterHtmlFile() {
  const te = window.tiptapEditor;
  if (!te || te.isDestroyed) {
    showToast('Editor is not ready.');
    return;
  }
  if (hasUnhostedImagesInDoc(te.getJSON())) {
    showToast('Fix unhosted images before downloading.');
    return;
  }
  const text = buildAo3WorksChapterFileContents();
  if (!String(text).trim()) {
    showToast('Nothing to export.');
    return;
  }
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const filename = `ao3works-export-${stamp}.html`;
  const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Saved ${filename}`);
}

function parseImportedChapterFileText(raw) {
  if (__chapterFileParse && typeof __chapterFileParse.parseImportedChapterFileText === 'function') {
    return __chapterFileParse.parseImportedChapterFileText(raw);
  }
  const html = String(raw || '').trim();
  return { kind: 'html', html };
}

/** Pull AO3 #workskin / .userstuff and run the same paste sanitizer as the editor. */
function preprocessImportedChapterHtml(html) {
  let out = String(html || '');
  const internals = typeof window !== 'undefined' ? window.__ao3worksWelcomeInternals__ : null;
  if (internals && typeof internals.extractAo3BodyHtml === 'function') {
    out = internals.extractAo3BodyHtml(out);
  }
  if (typeof window.ao3worksSanitizeImportedHtml === 'function') {
    out = window.ao3worksSanitizeImportedHtml(out);
  }
  return out;
}

function finishChapterImportAfterSetContent() {
  flushAutosaveNow();
  updateWordCount();
  updateToolbarState();
  syncChapterDownloadButtonState();
  syncExportButtonState();
  closeAllPanels();
}

function isTipTapEditorNonEmpty(te) {
  if (!te || te.isDestroyed) return false;
  return !te.isEmpty;
}

function isDocxChapterFile(file) {
  if (!file || !file.name) return false;
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return true;
  const t = (file.type || '').toLowerCase();
  return t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

let docxImportBundleLoadPromise = null;

function ensureDocxImportBundleLoaded() {
  if (typeof window.ao3worksConvertDocxArrayBufferToHtml === 'function') {
    return Promise.resolve();
  }
  if (docxImportBundleLoadPromise) return docxImportBundleLoadPromise;
  docxImportBundleLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '../dist/docx-import.bundle.js' + Date.now();
    s.async = true;
    s.onload = () => {
      if (typeof window.ao3worksConvertDocxArrayBufferToHtml !== 'function') {
        docxImportBundleLoadPromise = null;
        reject(new Error('Word import script did not initialize'));
      } else {
        resolve();
      }
    };
    s.onerror = () => {
      docxImportBundleLoadPromise = null;
      reject(new Error('Failed to load Word import script'));
    };
    document.body.appendChild(s);
  });
  return docxImportBundleLoadPromise;
}

async function importChapterFromDocxFile(file, opts = {}) {
  const skipReplaceConfirm = !!opts.skipReplaceConfirm;
  const te = window.tiptapEditor;
  if (!te || te.isDestroyed) {
    showToast('Editor is not ready.');
    return;
  }
  try {
    await ensureDocxImportBundleLoaded();
  } catch (err) {
    console.warn('[AO3 Works] Word import bundle', err);
    showToast('Could not load Word import. Run npm run build and refresh, then try again.');
    return;
  }
  let buf;
  try {
    buf = await file.arrayBuffer();
  } catch (e) {
    console.warn('[AO3 Works] docx file read failed', e);
    showToast('Could not read that file.');
    return;
  }
  let result;
  try {
    result = await window.ao3worksConvertDocxArrayBufferToHtml(buf);
  } catch (e) {
    console.warn('[AO3 Works] Mammoth convert failed', e);
    showToast('Could not read that Word file.');
    return;
  }
  let html = result && typeof result.value === 'string' ? result.value : '';
  if (!String(html).trim()) {
    showToast('That Word file has no readable text.');
    return;
  }
  if (typeof window.ao3worksSanitizeImportedHtml === 'function') {
    html = window.ao3worksSanitizeImportedHtml(html);
  }
  if (!skipReplaceConfirm && isTipTapEditorNonEmpty(te)) {
    if (!confirm('Replace everything in the editor with this Word document?\n\nFormatting is best effort. Tables and complex layout may be simplified. Editable skin blocks are not imported from Word.\n\nContinue?')) return;
  }
  try {
    te.commands.setContent(html, true);
  } catch (e) {
    console.warn('[AO3 Works] Import Word into editor failed', e);
    showToast('Could not place Word content in the editor.');
    return;
  }
  finishChapterImportAfterSetContent();
  showToast('Imported from Word (.docx). Formatting may be partial.');
}

/** Import HTML already converted from .md / .txt (header Import and similar). */
function importChapterFromPreparedHtml(html, opts = {}) {
  const skipReplaceConfirm = !!opts.skipReplaceConfirm;
  const te = window.tiptapEditor;
  if (!te || te.isDestroyed) {
    showToast('Editor is not ready.');
    return;
  }
  const body = String(html || '').trim();
  if (!body) {
    showToast('That file is empty.');
    return;
  }
  if (!skipReplaceConfirm && isTipTapEditorNonEmpty(te)) {
    if (!confirm('Replace everything in the editor with this HTML?\n\nFormatting from other sources may be incomplete. Editable skin blocks only restore from AO3 Works export files.\n\nContinue?')) return;
  }
  try {
    te.commands.setContent(body, true);
  } catch (e) {
    console.warn('[AO3 Works] Import HTML failed', e);
    showToast('Could not read that file as HTML.');
    return;
  }
  finishChapterImportAfterSetContent();
  showToast('Imported.');
}

function importChapterFromFileText(text, opts = {}) {
  const skipReplaceConfirm = !!opts.skipReplaceConfirm;
  const te = window.tiptapEditor;
  if (!te || te.isDestroyed) {
    showToast('Editor is not ready.');
    return;
  }
  if (!text || !String(text).trim()) {
    showToast('That file is empty.');
    return;
  }
  const parsed = parseImportedChapterFileText(text);
  if (parsed.kind === 'backup_failed') {
    console.warn('[AO3 Works] Backup restore failed:', parsed.reason, parsed.error || '');
    showToast('Backup damaged: re-download from AO3 Works or rebuild skin blocks manually.');
    return;
  }
  if (parsed.kind === 'doc') {
    if (!skipReplaceConfirm && isTipTapEditorNonEmpty(te)) {
      if (!confirm('Replace everything in the editor with this file?\n\nYou cannot undo this unless you use Undo in the editor right after.')) return;
    }
    try {
      te.commands.setContent(parsed.doc, true);
    } catch (e) {
      console.warn('[AO3 Works] Import AO3 Works backup failed', e);
      showToast('Could not restore that backup file.');
      return;
    }
    finishChapterImportAfterSetContent();
    showToast('Imported from AO3 Works file (full restore).');
    return;
  }
  let html = parsed.html;
  let importToast = 'Imported as HTML. Formatting may be partial; use Download backup for full round-trip including skins.';
  const chapterOut = convertAo3ChapterHtmlForImport(html);
  if (chapterOut && chapterOut.html) {
    html = chapterOut.html;
    const chapterMsg = formatChapterImportToast(chapterOut.stats);
    if (chapterMsg) importToast = chapterMsg;
  } else {
    html = preprocessImportedChapterHtml(html);
  }
  if (!html) {
    showToast('No chapter content found in that file.');
    return;
  }
  if (!skipReplaceConfirm && isTipTapEditorNonEmpty(te)) {
    if (!confirm('Replace everything in the editor with this HTML?\n\nFormatting from other sources may be incomplete. Editable skin blocks only restore from AO3 Works download files.\n\nContinue?')) return;
  }
  try {
    te.commands.setContent(html, true);
  } catch (e) {
    console.warn('[AO3 Works] Import HTML failed', e);
    showToast('Could not read that file as HTML.');
    return;
  }
  finishChapterImportAfterSetContent();
  showToast(importToast);
}

if (typeof window !== 'undefined') {
  window.ao3worksImportChapterFromFileText = importChapterFromFileText;
  window.ao3worksImportChapterFromPreparedHtml = importChapterFromPreparedHtml;
  window.ao3worksImportChapterFromDocxFile = importChapterFromDocxFile;
  window.ao3worksImportChapterFromModalPastedHtml = importChapterFromModalPastedHtml;
  window.ao3worksOpenImportHtmlModal = openImportHtmlModal;
  window.ao3worksShowImportAo3PasteHint = () => {
    showToast('Use Import → paste AO3 HTML in the box → Import pasted HTML.');
  };
  window.ao3worksParseImportedChapterFileText = parseImportedChapterFileText;
}

async function importChapterFromFileInput(file, opts = {}) {
  let text;
  try {
    text = await file.text();
  } catch (e) {
    console.warn('[AO3 Works] File read failed', e);
    showToast('Could not read that file.');
    return;
  }
  importChapterFromFileText(text, opts);
}

function initHeaderImportButton() {
  const btn = document.getElementById('header-import-btn');
  const confirmEl = document.getElementById('header-import-confirm');
  const cancelBtn = document.getElementById('header-import-confirm-cancel');
  const replaceBtn = document.getElementById('header-import-confirm-replace');
  const replaceModal = document.getElementById('header-import-replace-modal');
  const replaceModalCancel = document.getElementById('header-import-replace-modal-cancel');
  const replaceModalReplace = document.getElementById('header-import-replace-modal-replace');
  const replaceModalClose = document.getElementById('header-import-replace-modal-close');
  if (!btn) return;

  function openImportFlow() {
    if (typeof openImportHtmlModal === 'function') openImportHtmlModal();
  }

  function showInlineConfirm() {
    if (!confirmEl) {
      openImportFlow();
      return;
    }
    positionHeaderInlineConfirm(confirmEl, btn);
    confirmEl.classList.remove('hidden');
    confirmEl.setAttribute('aria-hidden', 'false');
    if (replaceBtn) {
      try { replaceBtn.focus(); } catch (_) { /* ignore */ }
    }
  }

  function hideInlineConfirm() {
    if (!confirmEl) return;
    confirmEl.classList.add('hidden');
    confirmEl.setAttribute('aria-hidden', 'true');
    resetHeaderInlineConfirmPosition(confirmEl);
  }

  function showReplaceModal() {
    if (!replaceModal) {
      openImportFlow();
      return;
    }
    hideInlineConfirm();
    replaceModal.classList.remove('hidden');
    try { replaceModalReplace?.focus(); } catch (_) { /* ignore */ }
  }

  function hideReplaceModal() {
    if (!replaceModal) return;
    replaceModal.classList.add('hidden');
  }

  function showConfirm() {
    if (isHeaderWrapOverflowed('.aw-header-import-wrap')) {
      showReplaceModal();
    } else {
      hideReplaceModal();
      showInlineConfirm();
    }
  }

  function hideConfirm() {
    hideInlineConfirm();
    hideReplaceModal();
  }

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const inlineOpen = confirmEl && !confirmEl.classList.contains('hidden');
    const modalOpen = replaceModal && !replaceModal.classList.contains('hidden');
    if (inlineOpen || modalOpen) {
      hideConfirm();
      return;
    }
    const te = window.tiptapEditor;
    const empty = !te || te.isDestroyed || te.isEmpty;
    if (empty) {
      openImportFlow();
    } else {
      showConfirm();
    }
  });

  if (cancelBtn) cancelBtn.addEventListener('click', () => { hideInlineConfirm(); });
  if (replaceBtn) {
    replaceBtn.addEventListener('click', () => {
      hideInlineConfirm();
      openImportFlow();
    });
  }

  replaceModalCancel?.addEventListener('click', hideReplaceModal);
  replaceModalClose?.addEventListener('click', hideReplaceModal);
  replaceModalReplace?.addEventListener('click', () => {
    hideReplaceModal();
    openImportFlow();
  });
  replaceModal?.addEventListener('click', (ev) => {
    if (ev.target === replaceModal) hideReplaceModal();
  });

  if (confirmEl) {
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !confirmEl.classList.contains('hidden')) hideInlineConfirm();
    });
  }
  if (replaceModal) {
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !replaceModal.classList.contains('hidden')) hideReplaceModal();
    });
  }
}

if (typeof window !== 'undefined') {
  window.ao3worksInitHeaderImport = initHeaderImportButton;
}

/** Loads full `assets/master-skin.css` (cache-busted). Used on boot and again before export when skins are present. */
function fetchMasterSkinCssText() {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '../assets/master-skin.css' + Date.now(), true);
    xhr.onload = function () {
      if (xhr.status === 200 || xhr.status === 0) resolve(xhr.responseText);
      else reject(new Error('Master CSS HTTP ' + xhr.status));
    };
    xhr.onerror = function () {
      reject(new Error('Master CSS network error'));
    };
    xhr.send();
  });
}

/** When the document uses skin blocks, reload master-skin.css into `window.ao3worksMasterCSS`. If the export modal is open, refresh the CSS tab too. */
function refreshMasterSkinCssAfterDocChange() {
  const te = window.tiptapEditor;
  if (!te) return;
  const docJson = te.getJSON();
  const usesSkins = Array.isArray(docJson?.content) && docJson.content.some((n) => n.type === 'skinBlock');
  if (!usesSkins) return;
  fetchMasterSkinCssText()
    .then((text) => {
      window.ao3worksMasterCSS = text;
      masterCSSLoaded = true;
      const modal = document.getElementById('export-panel');
      if (!modal || modal.classList.contains('hidden')) return;
      const cssOut = document.getElementById('export-css-output');
      if (cssOut) cssOut.textContent = text;
      const htmlOut = document.getElementById('export-html-output');
      if (htmlOut) htmlOut.textContent = getExportHTML();
    })
    .catch((e) => {
      console.warn('[AO3 Works] Could not refresh master skin after editor change.', e);
    });
}

// ── EXPORT MODAL v2 (PR D) ───────────────────────────────────
// Three-tab dialog: Overview / Your work skin / Your HTML.
// Open state is the modal's `hidden` class on `#export-panel`.
//
//   exportActiveTab  : 'overview' | 'skin' | 'html'
//   exportReturnFocus: element to restore focus to on close.
const EXPORT_TAB_ORDER = ['overview', 'skin', 'html'];
let exportActiveTab = 'overview';
let exportReturnFocus = null;

function getExportTabOrder() {
  const skinTab = document.getElementById('export-tab-skin');
  if (skinTab && skinTab.hidden) return ['overview', 'html'];
  return EXPORT_TAB_ORDER;
}

function setExportSkinTabVisible(visible) {
  const tab = document.getElementById('export-tab-skin');
  if (!tab) return;
  tab.hidden = !visible;
  tab.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/** Returns the slug used for `Download .html` from Tab 1. */
function deriveChapterSlug() {
  const helpers = window.ao3worksExportModalHelpers;
  if (!helpers) return 'ao3works-chapter';
  const te = window.tiptapEditor;
  let title = '';
  if (te && !te.isDestroyed) {
    const doc = te.getJSON();
    if (doc && Array.isArray(doc.content)) {
      for (const node of doc.content) {
        if (node && node.type === 'heading' && Array.isArray(node.content)) {
          const text = node.content.map((c) => c.text || '').join('').trim();
          if (text) { title = text; break; }
        }
      }
    }
  }
  return helpers.slugifyChapterTitle(title);
}

function downloadTextAsFile(text, filename, mime) {
  const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setExportActiveTab(name) {
  const order = getExportTabOrder();
  if (!order.includes(name)) name = order[0];
  exportActiveTab = name;
  const tabs = document.querySelectorAll('#export-panel .export-tab:not([hidden])');
  tabs.forEach((t) => {
    const isActive = t.getAttribute('data-tab') === name;
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.tabIndex = isActive ? 0 : -1;
  });
  const panels = {
    overview: document.getElementById('export-panel-overview'),
    skin: document.getElementById('export-panel-skin'),
    html: document.getElementById('export-panel-html'),
  };
  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    if (key === name) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  });
}

function renderExportOverview(usesSkins) {
  const body = document.getElementById('export-overview-body');
  if (!body) return;
  body.textContent = '';

  const status = document.createElement('p');
  status.className = 'export-overview-status';

  const lede = document.createElement('p');
  lede.className = 'export-overview-lede';

  const steps = document.createElement('ol');
  steps.className = 'export-overview-steps';

  function addJumpStep(tab, label, suffixHtml) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'export-overview-jump';
    btn.setAttribute('data-goto-tab', tab);
    btn.textContent = label;
    li.appendChild(btn);
    if (suffixHtml) {
      const tail = document.createElement('span');
      tail.innerHTML = suffixHtml;
      li.appendChild(tail);
    }
    steps.append(li);
  }

  if (usesSkins) {
    status.innerHTML =
      'You are using the <strong>AO3 Works</strong> custom work skin. This chapter includes skin blocks.';
    lede.textContent =
      'On AO3, skin blocks only show up after the Work Skin CSS is installed and attached to your fic. Follow these steps in order so preview looks right:';
    addJumpStep('skin', 'Your work skin', ': install or update the CSS on AO3 first.');
    const li2 = document.createElement('li');
    li2.innerHTML =
      'Attach that Work Skin to your fic (<strong>Post New Work</strong> or <strong>Edit Work</strong> → <strong>Select Work Skin</strong>).';
    steps.append(li2);
    addJumpStep('html', 'Your HTML', ': open a chapter on AO3, switch to <strong>HTML</strong> (not Rich Text), and paste.');
  } else {
    status.innerHTML =
      'You are <strong>not</strong> using the AO3 Works custom work skin. This chapter is prose only.';
    lede.textContent = 'You only need chapter HTML on AO3:';
    const li = document.createElement('li');
    li.innerHTML =
      'Post or edit your work on AO3, open <strong>New Chapter</strong> (or edit a chapter), switch to <strong>HTML</strong> (not Rich Text), then paste from ';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'export-overview-jump';
    btn.setAttribute('data-goto-tab', 'html');
    btn.textContent = 'Your HTML';
    li.append(btn, document.createTextNode('.'));
    steps.append(li);
  }

  body.append(status, lede, steps);
}

function renderSkinReleaseCard() {
  const versions = window.ao3worksSkinVersions;
  if (!versions) return;

  const release = versions.getCurrentSkinRelease
    ? versions.getCurrentSkinRelease()
    : versions.SKIN_VERSIONS[0];
  if (!release) return;

  const verSpan = document.getElementById('skin-current-version');
  if (verSpan) verSpan.textContent = release.version || versions.CURRENT_SKIN_VERSION;

  const dateEl = document.getElementById('skin-release-date');
  if (dateEl) {
    const iso = release.date || '';
    dateEl.setAttribute('datetime', iso);
    dateEl.textContent = versions.formatSkinReleaseDate
      ? versions.formatSkinReleaseDate(iso)
      : iso;
  }

  const touchesEl = document.getElementById('skin-release-touches');
  if (touchesEl) {
    const text = versions.releaseTouchesText
      ? versions.releaseTouchesText(release)
      : (release.touches || release.summary || '');
    touchesEl.textContent = '';
    if (text) {
      const lead = document.createElement('p');
      lead.className = 'skin-release-touches-lead';
      lead.textContent = 'What this update affects:';
      const body = document.createElement('p');
      body.className = 'skin-release-touches-body';
      body.textContent = text;
      touchesEl.append(lead, body);
    }
  }
}

async function openExportModal(opts) {
  const te = window.tiptapEditor;
  if (!te) return;
  const initialTab = (opts && opts.initialTab) || 'overview';

  closeImportHtmlModal();

  const docJson     = te.getJSON();
  const importPlaceholders = countImportPlaceholdersInDoc(docJson);
  if (importPlaceholders > 0) {
    showToast(`Rebuild ${importPlaceholders} imported placeholder block(s) with + Insert before exporting.`);
    return;
  }
  const usesSkins   = Array.isArray(docJson?.content) && docJson.content.some((n) => n.type === 'skinBlock');
  const hasUnhosted = hasUnhostedImagesInDoc(docJson);
  const modal       = document.getElementById('export-panel');

  // Always refresh master CSS so the work-skin tab stays current.
  try {
    window.ao3worksMasterCSS = await fetchMasterSkinCssText();
    masterCSSLoaded = true;
  } catch (e) {
    console.warn('[AO3 Works] Could not refresh master skin for export: using last loaded copy.', e);
  }

  document.getElementById('export-subtitle').textContent = usesSkins
    ? 'Skin blocks in this chapter: start on Overview, then work skin, then HTML.'
    : 'Prose only: see Overview, then copy HTML.';

  setExportSkinTabVisible(usesSkins);
  renderExportOverview(usesSkins);

  // HTML tab text.
  document.getElementById('export-html-output').textContent = getExportHTML();

  // Work skin tab: CSS + release card.
  const cssOut = document.getElementById('export-css-output');
  if (cssOut) {
    cssOut.textContent = window.ao3worksMasterCSS || '/* Master CSS not yet loaded. Try again in a moment. */';
  }
  const copyCssBtn = document.getElementById('copy-css-btn');
  if (copyCssBtn) copyCssBtn.disabled = !masterCSSLoaded;
  const downloadCssBtn = document.getElementById('download-css-btn');
  if (downloadCssBtn) downloadCssBtn.disabled = !masterCSSLoaded;
  renderSkinReleaseCard();

  // Tab 1 copy/download guards on unhosted images.
  const existingWarn = modal.querySelector('.export-image-warning');
  if (existingWarn) existingWarn.remove();
  const copyHtmlBtn = document.getElementById('copy-html-btn');
  const downloadHtmlBtn = document.getElementById('download-html-btn');
  if (hasUnhosted) {
    const warn = document.createElement('div');
    warn.className = 'export-image-warning top-banner';
    warn.innerHTML = '⚠️ <strong>Export blocked: unhosted images detected.</strong> AO3 requires images hosted on a service like Imgur. Replace them in the editor before copying.';
    modal.querySelector('.export-modal-body').prepend(warn);
    if (copyHtmlBtn) copyHtmlBtn.disabled = true;
    if (downloadHtmlBtn) downloadHtmlBtn.disabled = true;
  } else {
    if (copyHtmlBtn) copyHtmlBtn.disabled = false;
    if (downloadHtmlBtn) downloadHtmlBtn.disabled = false;
  }

  exportReturnFocus = document.activeElement && document.activeElement.focus ? document.activeElement : null;
  modal.classList.remove('hidden');
  setExportActiveTab(initialTab);

  // Focus the active tab button (may differ from initialTab if skin tab is hidden).
  const activeTabBtn = modal.querySelector(
    `#export-panel .export-tab[data-tab="${exportActiveTab}"]:not([hidden])`
  );
  if (activeTabBtn) activeTabBtn.focus();
}

function closeExportModal() {
  const modal = document.getElementById('export-panel');
  if (!modal) return;
  modal.classList.add('hidden');
  if (exportReturnFocus && document.contains(exportReturnFocus)) {
    try { exportReturnFocus.focus(); } catch (_) {}
  }
  exportReturnFocus = null;
}


// ── AUTOSAVE ─────────────────────────────────────────────────
/** Draft storage; must match AUTOSAVE_KEY_BOOT in editor.js */
const AUTOSAVE_KEY = 'aw.draft';
let autosaveTimer = null;

function flushAutosaveNow() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  const te = window.tiptapEditor;
  if (!te) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(te.getJSON()));
    showAutosaveIndicator();
  } catch (e) {
    console.warn('[AO3 Works] Could not save draft to localStorage', e);
  }
}

function scheduleSave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(flushAutosaveNow, 800);
}

function applyWelcomeDocIfAvailable() {
  const te = window.tiptapEditor;
  const doc = window.ao3worksDefaultWelcomeDocJson;
  if (!te || !doc || typeof doc !== 'object' || doc.type !== 'doc') return;
  te.commands.setContent(doc, true);
}

function restoreDraft() {
  const te = window.tiptapEditor;
  if (!te) return;
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) {
      applyWelcomeDocIfAvailable();
      return;
    }

    const parsedData = JSON.parse(saved);

    // Strict schema validation: must be a TipTap doc object
    if (parsedData && typeof parsedData === 'object' && parsedData.type === 'doc') {
      // emitUpdate true: run update listeners so CharacterCount / UI match restored marks
      te.commands.setContent(parsedData, true);
    } else {
      console.warn('Invalid draft format found in storage. Skipping restore.');
      applyWelcomeDocIfAvailable();
    }
  } catch (e) {
    console.warn('Failed to parse draft from storage', e);
    applyWelcomeDocIfAvailable();
  }
}

// ── WORD COUNT ───────────────────────────────────────────────
function updateWordCount() {
  const te = window.tiptapEditor;
  if (!te || !te.storage.characterCount) return;
  const words = te.storage.characterCount.words();
  document.getElementById('header-wordcount').textContent = `${words.toLocaleString()} words`;
}

// ── CLIPBOARD HELPER ─────────────────────────────────────────
function fallbackCopy(text, showStatus) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (showStatus) showStatus('✓ Copied!');
  } catch {
    if (showStatus) showStatus('⚠ Copy failed: select manually');
  }
  document.body.removeChild(ta);
}

function copyTextToClipboard(text, statusId) {
  const showStatus = (msg) => {
    const el = document.getElementById(statusId);
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 2500);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => showStatus('✓ Copied!'))
      .catch(() => fallbackCopy(text, showStatus));
  } else {
    fallbackCopy(text, showStatus);
  }
}

// ── DYNAMIC TURN HTML BUILDERS ───────────────────────────────
function buildIMessageTurnHTML(t, yourLabel, theirLabel) {
  const bin = turnSpeakerToBinary(t && t.speakerId);
  const showExtra = bin === 'p_local';
  const delivery = (t && t.delivery) === 'sms' ? 'sms' : 'imessage';
  const readR = !!(t && t.readReceipt);
  return `
    <div class="convo-turn convo-turn-imessage">
      <div class="convo-turn-left">
        ${buildBinarySpeakerSelectHtml(bin, yourLabel, theirLabel)}
        <textarea class="convo-turn-text" rows="2" placeholder="Message text…" aria-label="Message text">${escapeHTML((t && t.text) || '')}</textarea>
        <div class="ios-msg-extra-fields" style="display:${showExtra ? 'block' : 'none'}">
          <label class="panel-label" style="font-size:0.72rem;">Send as</label>
          <select class="panel-select ios-delivery-select" aria-label="Send as">
            <option value="imessage" ${delivery === 'imessage' ? 'selected' : ''}>iMessage (blue)</option>
            <option value="sms" ${delivery === 'sms' ? 'selected' : ''}>Text / SMS (green)</option>
          </select>
          <div class="ios-read-receipt-wrap" style="display:${delivery === 'imessage' ? 'block' : 'none'}">
            <label class="panel-checkbox-label ios-read-receipt-label" style="display:block;margin-top:8px;font-size:0.85rem;">
              <input type="checkbox" class="ios-read-receipt-check" ${readR ? 'checked' : ''} aria-label="Show Read under this bubble"> Read receipt (“Read” under bubble)
            </label>
          </div>
          <p class="ios-sms-read-hint panel-helper" style="display:${delivery === 'sms' ? 'block' : 'none'};margin-top:8px;margin-bottom:0;font-size:0.78rem;">
            Read receipts only apply to iMessage (blue), not SMS / text (green).
          </p>
        </div>
      </div>
      <button class="convo-turn-remove" aria-label="Remove row">×</button>
    </div>`;
}

function buildWaTurnHTML(t, yourName, theirName) {
  const bin = turnSpeakerToBinary(t && t.speakerId);
  const showColor = bin !== 'p_local';
  const showExtra = bin === 'p_local';
  const readR = !!(t && t.readReceipt);
  const waColors = [
    ['color-pink', 'Pink'],
    ['color-blue', 'Blue'],
    ['color-purple', 'Purple'],
    ['color-green', 'Green'],
  ];
  const colorOpts = waColors.map(([val, lab]) =>
    `<option value="${val}" ${((t && t.color) || 'color-pink') === val ? 'selected' : ''}>${lab}</option>`
  ).join('');
  return `
    <div class="convo-turn">
      <div class="convo-turn-left">
        ${buildBinarySpeakerSelectHtml(bin, yourName, theirName)}
        <div class="wa-color-wrap" style="display:${showColor ? 'block' : 'none'}">
          <label class="panel-label" style="margin-top:6px;font-size:0.72rem;">Name color (received)</label>
          <select class="panel-select wa-color-select" aria-label="Name color (received)">${colorOpts}</select>
        </div>
        <textarea class="convo-turn-text" rows="2" placeholder="Message…" aria-label="Message text">${escapeHTML((t && t.text) || '')}</textarea>
        <div class="wa-msg-extra-fields" style="display:${showExtra ? 'block' : 'none'}">
          <label class="panel-checkbox-label wa-read-receipt-label" style="display:block;margin-top:8px;font-size:0.85rem;">
            <input type="checkbox" class="wa-read-receipt-check" ${readR ? 'checked' : ''} aria-label="Show read ticks under this bubble"> Read ticks (\u2713\u2713 under your message)
          </label>
        </div>
      </div>
      <button class="convo-turn-remove" aria-label="Remove message">×</button>
    </div>`;
}

function buildAndroidTurnHTML(t, yourName, theirName) {
  t = t || { speakerId: '', text: '' };
  const bin = turnSpeakerToBinary(t.speakerId);
  return `
    <div class="convo-turn">
      <div class="convo-turn-left">
        ${buildBinarySpeakerSelectHtml(bin, yourName, theirName)}
        <textarea class="convo-turn-text" rows="2" placeholder="Message…" aria-label="Message text">${escapeHTML(t.text || '')}</textarea>
      </div>
      <button class="convo-turn-remove" aria-label="Remove message">×</button>
    </div>`;
}

// ── TOOLBAR STATE ────────────────────────────────────────────
function updateToolbarState() {
  const te = window.tiptapEditor;
  if (!te) return;

  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) undoBtn.disabled = !te.can().undo();
  const redoBtn = document.getElementById('redo-btn');
  if (redoBtn) redoBtn.disabled = !te.can().redo();

  const formats = {
    'bold-btn': 'bold',
    'italic-btn': 'italic',
    'underline-btn': 'underline',
    'code-btn': 'code',
    'subscript-btn': 'subscript',
    'superscript-btn': 'superscript',
    'blockquote-btn': 'blockquote'
  };

  const listBlocks = {
    'bullet-list-btn': 'bulletList',
    'ordered-list-btn': 'orderedList'
  };

  const atomNodeSelected = !!(te.state.selection.node && te.state.selection.node.isAtom);

  for (const [btnId, markName] of Object.entries(formats)) {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (btn.dataset.ao3TitleDefault === undefined) {
        btn.dataset.ao3TitleDefault = btn.getAttribute('title') || '';
      }
      const defaultTitle = btn.dataset.ao3TitleDefault || '';
      btn.title = atomNodeSelected && defaultTitle
        ? `${defaultTitle}: applies in prose after this block`
        : defaultTitle;
      btn.classList.toggle('active', te.isActive(markName));
      btn.classList.toggle('toolbar-format-atomic-context', atomNodeSelected);
    }
  }

  for (const [btnId, nodeName] of Object.entries(listBlocks)) {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (btn.dataset.ao3TitleDefault === undefined) {
        btn.dataset.ao3TitleDefault = btn.getAttribute('title') || '';
      }
      const defaultTitle = btn.dataset.ao3TitleDefault || '';
      btn.title = atomNodeSelected && defaultTitle
        ? `${defaultTitle}: applies in prose after this block`
        : defaultTitle;
      btn.classList.toggle('active', te.isActive(nodeName));
      btn.classList.toggle('toolbar-format-atomic-context', atomNodeSelected);
    }
  }

  const alignBtns = [
    ['align-left-btn', 'left'],
    ['align-center-btn', 'center'],
    ['align-right-btn', 'right'],
    ['align-justify-btn', 'justify']
  ];
  for (const [btnId, align] of alignBtns) {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (btn.dataset.ao3TitleDefault === undefined) {
        btn.dataset.ao3TitleDefault = btn.getAttribute('title') || '';
      }
      const defaultTitle = btn.dataset.ao3TitleDefault || '';
      btn.title = atomNodeSelected && defaultTitle
        ? `${defaultTitle}: applies in prose after this block`
        : defaultTitle;
      btn.classList.toggle('active', te.isActive({ textAlign: align }));
      btn.classList.toggle('toolbar-format-atomic-context', atomNodeSelected);
    }
  }

  const strikeBtn = document.getElementById('strike-btn');
  if (strikeBtn) {
    if (strikeBtn.dataset.ao3TitleDefault === undefined) {
      strikeBtn.dataset.ao3TitleDefault = strikeBtn.getAttribute('title') || '';
    }
    const dt = strikeBtn.dataset.ao3TitleDefault || '';
    strikeBtn.title = atomNodeSelected && dt ? `${dt}: applies in prose after this block` : dt;
    strikeBtn.classList.toggle('active', te.isActive('strike'));
    strikeBtn.classList.toggle('toolbar-format-atomic-context', atomNodeSelected);
  }

  const linkBtn = document.getElementById('link-btn');
  if (linkBtn) {
    if (linkBtn.dataset.ao3TitleDefault === undefined) {
      linkBtn.dataset.ao3TitleDefault = linkBtn.getAttribute('title') || '';
    }
    const dt = linkBtn.dataset.ao3TitleDefault || '';
    linkBtn.title = atomNodeSelected && dt ? `${dt}: applies in prose after this block` : dt;
    linkBtn.classList.toggle('active', te.isActive('link'));
    linkBtn.classList.toggle('toolbar-format-atomic-context', atomNodeSelected);
  }

  const hrBtn = document.getElementById('horizontal-rule-btn');
  if (hrBtn) {
    if (hrBtn.dataset.ao3TitleDefault === undefined) {
      hrBtn.dataset.ao3TitleDefault = hrBtn.getAttribute('title') || '';
    }
    const dt = hrBtn.dataset.ao3TitleDefault || '';
    hrBtn.title = atomNodeSelected && dt ? `${dt}: applies in prose after this block` : dt;
    hrBtn.classList.toggle('active', te.isActive('horizontalRule'));
    hrBtn.classList.toggle('toolbar-format-atomic-context', atomNodeSelected);
  }

  const textToggle = document.getElementById('text-type-toggle');
  if (textToggle) {
    let line = 'Text: Normal';
    for (let level = 1; level <= 6; level++) {
      if (te.isActive('heading', { level })) {
        line = `Text: Heading ${level}`;
        break;
      }
    }
    textToggle.textContent = `${line} ▾`;
  }
}

// ── DROPDOWN MANAGEMENT ──────────────────────────────────────
function closeAllDropdowns() {
  const dropdownViewport = window.ao3worksDropdownViewport;
  document.querySelectorAll('.toolbar-dropdown').forEach(d => {
    d.classList.remove('open');
    const toggle = d.querySelector('.dropdown-toggle');
    if (toggle && toggle.hasAttribute('aria-haspopup')) {
      toggle.setAttribute('aria-expanded', 'false');
    }
    const menu = d.querySelector(':scope > .dropdown-menu');
    if (menu && dropdownViewport?.resetDropdownMenuPosition) {
      dropdownViewport.resetDropdownMenuPosition(menu);
    }
  });
}

function hideToolbarTooltip() {
  window.dispatchEvent(new CustomEvent('ao3works-hide-toolbar-tooltip'));
}

function positionHeaderInlineConfirm(confirmEl, anchorEl, alignEnd) {
  if (!confirmEl || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  confirmEl.style.position = 'fixed';
  confirmEl.style.top = `${Math.round(rect.bottom + 8)}px`;
  confirmEl.style.zIndex = '280';
  if (alignEnd) {
    confirmEl.style.left = 'auto';
    confirmEl.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
  } else {
    confirmEl.style.left = `${Math.round(rect.left)}px`;
    confirmEl.style.right = 'auto';
  }
}

function resetHeaderInlineConfirmPosition(confirmEl) {
  if (!confirmEl) return;
  confirmEl.style.removeProperty('position');
  confirmEl.style.removeProperty('left');
  confirmEl.style.removeProperty('top');
  confirmEl.style.removeProperty('right');
}

function isHeaderWrapOverflowed(wrapSelector) {
  const wrap = document.querySelector(wrapSelector);
  return Boolean(wrap?.classList.contains('is-bar-hidden'));
}

function hideHeaderConfirmModals() {
  [
    'header-import-replace-modal',
    'header-clear-modal',
    'header-theme-modal',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('hidden')) return;
    el.classList.add('hidden');
  });
}

function hideHeaderInlineConfirms() {
  ['header-import-confirm', 'header-clear-confirm'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('hidden')) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    resetHeaderInlineConfirmPosition(el);
  });
  hideHeaderConfirmModals();
}

const HEADER_INLINE_CONFIRM_ANCHORS = {
  'header-import-confirm': 'header-import-btn',
  'header-clear-confirm': 'clear-draft-btn',
};

/** Close import/clear inline confirms when the user clicks outside them. */
function dismissHeaderInlineConfirmsOnOutsidePointer(ev) {
  Object.entries(HEADER_INLINE_CONFIRM_ANCHORS).forEach(([confirmId, anchorId]) => {
    const confirmEl = document.getElementById(confirmId);
    if (!confirmEl || confirmEl.classList.contains('hidden')) return;
    const anchor = document.getElementById(anchorId);
    if (confirmEl.contains(ev.target) || anchor?.contains(ev.target)) return;
    confirmEl.classList.add('hidden');
    confirmEl.setAttribute('aria-hidden', 'true');
    resetHeaderInlineConfirmPosition(confirmEl);
  });
}

/** Close tooltips, confirms, and open menus when another chrome control is activated. */
function dismissOtherChromePopovers(activator) {
  hideToolbarTooltip();
  hideHeaderInlineConfirms();

  if (activator?.closest?.('.dropdown-menu')) return;

  const clickToggle = activator?.closest?.('.dropdown-toggle');
  const clickDropdown = clickToggle?.closest?.('.toolbar-dropdown');

  document.querySelectorAll('.toolbar-dropdown.open').forEach((dd) => {
    if (clickDropdown === dd && clickToggle) return;
    dd.classList.remove('open');
    const toggle = dd.querySelector('.dropdown-toggle');
    if (toggle?.hasAttribute('aria-haspopup')) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function dismissOpenDropdownsOnOutsidePointer(ev) {
  const openDropdowns = document.querySelectorAll('.toolbar-dropdown.open');
  if (!openDropdowns.length) return;
  const insideOpen = [...openDropdowns].some((dd) => dd.contains(ev.target));
  if (!insideOpen) closeAllDropdowns();
}

function initChromePopoverDismiss() {
  document.addEventListener('pointerdown', (e) => {
    dismissHeaderInlineConfirmsOnOutsidePointer(e);
    dismissOpenDropdownsOnOutsidePointer(e);
  });

  const chromeRoots = document.querySelectorAll('.aw-header-v2, .aw-toolbar-v2');
  chromeRoots.forEach((root) => {
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.dropdown-menu')) return;
      const control = e.target.closest(
        '[data-tip], .dropdown-toggle, .aw-header-action-btn, .toolbar-btn, #export-btn, #header-import-btn, #clear-draft-btn'
      );
      if (!control) return;
      dismissOtherChromePopovers(e.target);
    }, true);
  });
}

// ── SIDE PANEL WIDTH (responsive CSS + drag + localStorage) ──
const SIDEBAR_WIDTH_STORAGE_KEY = 'aw.sidebarWidth';
const SIDEBAR_DRAG_MIN_PX = 320;
const SIDEBAR_DRAG_ABS_MAX_PX = 960;
const SIDEBAR_MIN_EDITOR_RESERVE_PX = 340;

function sidebarIsMobileLayout() {
  return window.matchMedia('(max-width: 800px)').matches;
}

function getSidebarMaxPx() {
  const vw = window.innerWidth;
  return Math.max(SIDEBAR_DRAG_MIN_PX, Math.min(SIDEBAR_DRAG_ABS_MAX_PX, vw - SIDEBAR_MIN_EDITOR_RESERVE_PX));
}

function clampSidebarWidthPx(px) {
  return Math.min(getSidebarMaxPx(), Math.max(SIDEBAR_DRAG_MIN_PX, Math.round(px)));
}

function applySidebarWidthPx(px) {
  const w = clampSidebarWidthPx(px);
  document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  return w;
}

function clearSidebarWidthOverride() {
  document.documentElement.style.removeProperty('--sidebar-w');
  try {
    localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
  } catch {}
}

function restoreSavedSidebarWidth() {
  if (sidebarIsMobileLayout()) return;
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw == null) return;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    applySidebarWidthPx(n);
  } catch {}
}

function reclampSidebarWidthOnResize() {
  if (sidebarIsMobileLayout()) return;
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw == null) return;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    applySidebarWidthPx(n);
  } catch {}
}

function initSidebarResize() {
  const handle = document.getElementById('side-panel-resize-handle');
  const panel = document.getElementById('side-panel');
  if (!handle || !panel) return;

  restoreSavedSidebarWidth();

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (e && typeof e.pointerId === 'number') {
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {}
    }
    document.body.classList.remove('side-panel-resizing');
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    try {
      const w = panel.getBoundingClientRect().width;
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(w)));
    } catch {}
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || sidebarIsMobileLayout()) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {}
    document.body.classList.add('side-panel-resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    applySidebarWidthPx(startWidth - delta);
  });

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  handle.addEventListener('dblclick', (e) => {
    if (sidebarIsMobileLayout()) return;
    e.preventDefault();
    clearSidebarWidthOverride();
  });

  handle.addEventListener('keydown', (e) => {
    if (sidebarIsMobileLayout()) return;
    const step = e.shiftKey ? 48 : 16;
    const cur = panel.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      applySidebarWidthPx(cur + step);
      try {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(panel.getBoundingClientRect().width)));
      } catch {}
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      applySidebarWidthPx(cur - step);
      try {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(panel.getBoundingClientRect().width)));
      } catch {}
    } else if (e.key === 'Home') {
      e.preventDefault();
      clearSidebarWidthOverride();
    }
  });

  window.addEventListener('resize', () => {
    reclampSidebarWidthOnResize();
  });
}

// ── FIRST PAINT (avoid FOUC on skin previews) ───────────────────
// index.html adds class ao3works-boot on <html> until styles apply + draft is restored.
const AO3_APP_STYLESHEET_ID = 'ao3-app-stylesheet';
const AO3_MASTER_STYLESHEET_ID = 'ao3-master-stylesheet';

function waitForStylesheetLink(link) {
  if (!link) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    function fin() {
      if (settled) return;
      settled = true;
      resolve();
    }
    link.addEventListener('load', fin, { once: true });
    link.addEventListener('error', fin, { once: true });
    queueMicrotask(() => {
      try {
        if (link.sheet) fin();
      } catch (_) {
        /* ignore */
      }
    });
  });
}

async function finishAo3WorksBoot() {
  try {
    await Promise.all([
      waitForStylesheetLink(document.getElementById(AO3_APP_STYLESHEET_ID)),
      waitForStylesheetLink(document.getElementById(AO3_MASTER_STYLESHEET_ID)),
    ]);
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  } finally {
    document.documentElement.classList.remove('ao3works-boot');
  }
}

// ── INITIALIZATION & BINDINGS ────────────────────────────────
// ── CHROME LIGHT/DARK MODE ─────────────────────────────────────
// Mode = chrome only (header/toolbar/footer/modals/side-panel). The writing
// canvas surface toggle (ao3-light / ao3-reversi / threnne) is independent.
// Default = system preference; prior localStorage value still applies on load.
function applyChromeMode(mode) {
  document.body.classList.toggle('aw-mode-light', mode === 'light');
  document.body.classList.toggle('aw-mode-dark', mode === 'dark');
}
function initChromeMode() {
  let stored = null;
  try { stored = localStorage.getItem('aw.mode'); } catch {}
  const systemLight = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: light)').matches;
  const mode = (stored === 'light' || stored === 'dark') ? stored : (systemLight ? 'light' : 'dark');
  applyChromeMode(mode);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChromeMode, { once: true });
  } else {
    initChromeMode();
  }
}

// ── COLLAPSIBLE TOOLBAR SECTIONS ──────────────────────────────
// Format + Insert sections collapse independently. State persists in localStorage.
function applyToolbarSectionState(group, toggle, collapsed) {
  if (!group) return;
  group.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
  if (toggle) {
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed
      ? toggle.getAttribute('aria-label')?.replace('Collapse', 'Expand') || 'Expand toolbar section'
      : toggle.getAttribute('aria-label')?.replace('Expand', 'Collapse') || 'Collapse toolbar section');
  }
}
function initToolbarCollapse() {
  const sections = [
    { groupId: 'toolbar-format-group', toggleId: 'toolbar-format-toggle', key: 'aw.toolbar.format' },
    { groupId: 'toolbar-insert-group', toggleId: 'toolbar-insert-toggle', key: 'aw.toolbar.insert' },
  ];
  for (const { groupId, toggleId, key } of sections) {
    const group = document.getElementById(groupId);
    const toggle = document.getElementById(toggleId);
    if (!group || !toggle) continue;
    let stored = null;
    try { stored = localStorage.getItem(key); } catch {}
    const collapsed = stored === 'collapsed';
    applyToolbarSectionState(group, toggle, collapsed);
    toggle.addEventListener('click', () => {
      const isCollapsed = group.getAttribute('data-collapsed') === 'true';
      const next = !isCollapsed;
      applyToolbarSectionState(group, toggle, next);
      try { localStorage.setItem(key, next ? 'collapsed' : 'expanded'); } catch {}
    });
  }
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToolbarCollapse, { once: true });
  } else {
    initToolbarCollapse();
  }
}

function initToolbarTooltips() {
  if (typeof window.ao3worksToolbarTooltips?.initToolbarTooltips === 'function') {
    window.ao3worksToolbarTooltips.initToolbarTooltips({
      roots: ['#toolbar', '.aw-header-v2'],
    });
  }
}
function initHeaderResponsive() {
  if (typeof window.ao3worksHeaderResponsive?.initHeaderResponsive === 'function') {
    window.ao3worksHeaderResponsive.initHeaderResponsive();
  }
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initToolbarTooltips();
      initHeaderResponsive();
    }, { once: true });
  } else {
    initToolbarTooltips();
    initHeaderResponsive();
  }
}

function init() {
  const te = window.tiptapEditor;
  if (!te) {
    document.documentElement.classList.remove('ao3works-boot');
    return;
  }

  if (window.__ao3worksAppInitDone) {
    console.warn('[AO3 Works] init() called more than once: skipping duplicate UI listeners.');
    return;
  }
  window.__ao3worksAppInitDone = true;
  console.info('[AO3 Works] Initializing UI (if Bold fails, check the Console for errors above this line).');

  migrateLegacyStorageKeys();
  initSidebarResize();

  // Set a fallback loading state immediately
  window.ao3worksMasterCSS = '/* Loading Master Skin CSS... Please wait. */';

  // Load the master CSS: XHR works on both http:// and file:// (fetch blocks on file://)
  fetchMasterSkinCssText()
    .then((text) => {
      window.ao3worksMasterCSS = text;
      masterCSSLoaded = true;
    })
    .catch(() => {
      window.ao3worksMasterCSS = '/* Error loading Master CSS. Please refresh the page. */';
      masterCSSLoaded = true;
    });

  // 1. Listen for clicks on Skin Block action buttons (edit, dup, delete)
  window.addEventListener('ao3works-edit-skin', (e) => {
    skinTipTapEditCtx = {
      type: e.detail.type,
      contentData: cloneContentDataForAttrs(e.detail.contentData),
      getPos: e.detail.getPos,
    };
    openSkinBuilder(e.detail.type);
  });

  window.addEventListener('ao3works-delete-skin', (e) => {
    const pos = e.detail.getPos();
    if (pos == null) return;
    const node = te.state.doc.nodeAt(pos);
    if (node) te.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    scheduleSave();
  });

  window.addEventListener('ao3works-duplicate-skin', (e) => {
    const pos = e.detail.getPos();
    if (pos == null) return;
    const node = te.state.doc.nodeAt(pos);
    if (node) {
      te.chain().focus().insertContentAt(pos + node.nodeSize, {
        type: 'skinBlock',
        attrs: { type: node.attrs.type, contentData: cloneContentDataForAttrs(node.attrs.contentData) }
      }).run();
      scheduleSave();
    }
  });

  // 2. Toolbar formatting: capture phase on #toolbar so clicks on inner nodes (<strong>B</strong>)
  //    still resolve; preventDefault on mousedown keeps the ProseMirror selection. Single listener
  //    avoids duplicate init() registering the same handler twice (which toggles marks twice = no-op).
  const FORMAT_BY_BUTTON_ID = {
    'undo-btn': 'undo',
    'redo-btn': 'redo',
    'bold-btn': 'toggleBold',
    'italic-btn': 'toggleItalic',
    'underline-btn': 'toggleUnderline',
    'align-left-btn': '__textAlign__:left',
    'align-center-btn': '__textAlign__:center',
    'align-right-btn': '__textAlign__:right',
    'align-justify-btn': '__textAlign__:justify',
    'code-btn': 'toggleCode',
    'subscript-btn': 'toggleSubscript',
    'superscript-btn': 'toggleSuperscript',
    'horizontal-rule-btn': 'setHorizontalRule',
    'strike-btn': 'toggleStrike',
    'link-btn': '__openLinkModal__',
    'image-btn': '__openImageModal__',
    'bullet-list-btn': 'toggleBulletList',
    'ordered-list-btn': 'toggleOrderedList',
    'blockquote-btn': 'toggleBlockquote',
    'clear-format-btn': '__clearFormatting__',
  };

  const runFormatCommand = (command) => {
    const skipPrepare =
      command === '__openLinkModal__' ||
      command === '__openImageModal__' ||
      command === 'undo' ||
      command === 'redo';
    if (!skipPrepare && typeof window.ao3worksPrepareProseSelectionForToolbar === 'function') {
      window.ao3worksPrepareProseSelectionForToolbar(te);
    }
    if (command === 'undo' || command === 'redo') {
      te.chain().focus()[command]().run();
      te.view.focus();
      scheduleSave();
      updateToolbarState();
      return;
    }
    if (command === '__openLinkModal__') {
      openAo3LinkModal(te);
      return;
    }
    if (command === '__openImageModal__') {
      openAo3ImageModal(te);
      return;
    }
    if (command.startsWith('__textAlign__:')) {
      const alignment = command.slice('__textAlign__:'.length);
      te.chain().focus().setTextAlign(alignment).run();
      te.view.focus();
      scheduleSave();
      updateToolbarState();
      return;
    }
    if (command === '__clearFormatting__') {
      const sel = te.state.selection;
      if (sel.node && sel.node.type.name === 'image') {
        te.chain().focus().deleteSelection().run();
        te.view.focus();
        scheduleSave();
        updateToolbarState();
        return;
      }
      let c = te.chain().focus().command(({ tr }) => {
        tr.setStoredMarks(null);
        return true;
      });
      // TipTap unsetAllMarks() skips empty selections: use per-mark unset with
      // extendEmptyMarkRange so a caret inside bold/link/etc. still clears.
      if (te.state.selection.empty) {
        for (const name of Object.keys(te.state.schema.marks)) {
          c = c.unsetMark(name, { extendEmptyMarkRange: true });
        }
      } else {
        c = c.unsetAllMarks();
      }
      if (typeof c.unsetTextAlign === 'function') c = c.unsetTextAlign();
      // Multi-row / mixed selections: isActive('heading') is false if only part of
      // the range is a heading. Use setBlockType across each range so every textblock
      // in the selection (e.g. multiple headings) becomes a paragraph.
      if (!te.state.selection.empty) {
        c = c.command(({ tr, state }) => {
          const p = state.schema.nodes.paragraph;
          if (!p) return false;
          for (let i = 0; i < state.selection.ranges.length; i++) {
            const { $from, $to } = state.selection.ranges[i];
            tr.setBlockType($from.pos, $to.pos, p);
          }
          return true;
        });
      } else if (te.isActive('heading')) {
        c = c.setParagraph();
      }
      c.run();
      let guard = 0;
      while (te.isActive('listItem') && guard < 40) {
        guard += 1;
        if (!te.chain().focus().liftListItem('listItem').run()) break;
      }
      let bqGuard = 0;
      while (te.isActive('blockquote') && bqGuard < 20) {
        bqGuard += 1;
        if (!te.chain().focus().unsetBlockquote().run()) break;
      }
      te.view.focus();
      scheduleSave();
      updateToolbarState();
      return;
    }
    const chain = te.chain().focus();
    if (typeof chain[command] !== 'function') {
      console.warn('[AO3 Works] Unknown format command:', command);
    } else {
      chain[command]().run();
    }
    te.view.focus();
    scheduleSave();
    updateToolbarState();
  };

  Object.keys(FORMAT_BY_BUTTON_ID).forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.type = 'button';
  });

  const toolbar = document.getElementById('toolbar');
  if (toolbar && !toolbar.dataset.ao3FormatBound) {
    toolbar.dataset.ao3FormatBound = '1';
    // Dedupe pointerdown + mousedown (same physical press). Do NOT listen for "click": it fires
    // later and would run toggleBold again, flipping the mark back off.
    let lastFormatGesture = { btnId: '', t: 0 };
    const handleFormatPointer = (e, btn, cmd) => {
      e.preventDefault();
      const t = performance.now();
      if (btn.id === lastFormatGesture.btnId && t - lastFormatGesture.t < 120) return;
      lastFormatGesture = { btnId: btn.id, t };
      runFormatCommand(cmd);
    };

    toolbar.addEventListener(
      'pointerdown',
      (e) => {
        if (!e.isPrimary) return;
        const btn = e.target.closest('button');
        const cmd = btn && FORMAT_BY_BUTTON_ID[btn.id];
        if (!cmd) return;
        handleFormatPointer(e, btn, cmd);
      },
      true
    );

    if (typeof window.PointerEvent === 'undefined') {
      toolbar.addEventListener(
        'mousedown',
        (e) => {
          if (e.button !== 0) return;
          const btn = e.target.closest('button');
          const cmd = btn && FORMAT_BY_BUTTON_ID[btn.id];
          if (!cmd) return;
          handleFormatPointer(e, btn, cmd);
        },
        true
      );
    }

    toolbar.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const btn = e.target.closest('button');
        const cmd = btn && FORMAT_BY_BUTTON_ID[btn.id];
        if (!cmd) return;
        e.preventDefault();
        runFormatCommand(cmd);
      },
      true
    );
  }

  // 3. UI Tracking
  te.on('update', () => {
    scheduleSave();
    updateWordCount();
    syncChapterDownloadButtonState();
    syncExportButtonState();
  });

  // Update toolbar buttons whenever cursor moves or text changes
  te.on('selectionUpdate', updateToolbarState);
  te.on('transaction', updateToolbarState);
  updateWordCount(); // Set initial count on load
  syncChapterDownloadButtonState();
  syncExportButtonState();

  window.addEventListener('ao3works-chapter-import-summary', (e) => {
    const msg = formatChapterImportToast(e.detail);
    if (msg) showToast(msg);
    syncExportButtonState();
  });

  // Flush draft before tab close / refresh so formatting is not lost waiting on the debounced save
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutosaveNow();
  });
  window.addEventListener('pagehide', flushAutosaveNow);

  // 4. Paste Warnings
  window.addEventListener('ao3works-unhosted-image-warning', () => {
    document.getElementById('unhosted-image-warning').classList.remove('hidden');
    syncChapterDownloadButtonState();
  });

  // 5. App Buttons
  document.getElementById('export-btn').addEventListener('click', () => void openExportModal());

  document.getElementById('data-btn').addEventListener('click', () => {
    document.getElementById('data-modal').classList.remove('hidden');
  });
  document.getElementById('data-modal-close').addEventListener('click', () => {
    document.getElementById('data-modal').classList.add('hidden');
  });
  document.getElementById('data-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });
  document.getElementById('open-data-modal-from-help').addEventListener('click', () => {
    document.getElementById('help-modal').classList.add('hidden');
    document.getElementById('data-modal').classList.remove('hidden');
  });

  document.getElementById('help-btn').addEventListener('click', () => {
    document.getElementById('help-modal').classList.remove('hidden');
  });
  document.getElementById('help-modal-close').addEventListener('click', () => {
    document.getElementById('help-modal').classList.add('hidden');
  });
  document.getElementById('help-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  (function initClearDraftConfirm() {
    const btn = document.getElementById('clear-draft-btn');
    const confirmEl = document.getElementById('header-clear-confirm');
    const cancelBtn = document.getElementById('header-clear-confirm-cancel');
    const eraseBtn = document.getElementById('header-clear-confirm-erase');
    const clearModal = document.getElementById('header-clear-modal');
    const clearModalCancel = document.getElementById('header-clear-modal-cancel');
    const clearModalErase = document.getElementById('header-clear-modal-erase');
    const clearModalClose = document.getElementById('header-clear-modal-close');
    if (!btn) return;

    function hideInlineConfirm() {
      if (!confirmEl) return;
      confirmEl.classList.add('hidden');
      confirmEl.setAttribute('aria-hidden', 'true');
      resetHeaderInlineConfirmPosition(confirmEl);
    }

    function showInlineConfirm() {
      if (!confirmEl) return;
      positionHeaderInlineConfirm(confirmEl, btn, true);
      confirmEl.classList.remove('hidden');
      confirmEl.setAttribute('aria-hidden', 'false');
      try { eraseBtn?.focus(); } catch {}
    }

    function showClearModal() {
      if (!clearModal) return;
      hideInlineConfirm();
      clearModal.classList.remove('hidden');
      try { clearModalErase?.focus(); } catch {}
    }

    function hideClearModal() {
      if (!clearModal) return;
      clearModal.classList.add('hidden');
    }

    function hideConfirm() {
      hideInlineConfirm();
      hideClearModal();
    }

    function showConfirm() {
      if (isHeaderWrapOverflowed('.aw-header-clear-wrap')) {
        showClearModal();
      } else {
        hideClearModal();
        showInlineConfirm();
      }
    }

    function eraseDraft() {
      hideConfirm();
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch {}
      window.tiptapEditor?.commands.clearContent();
      syncChapterDownloadButtonState();
      showToast('Draft cleared.');
    }

    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const inlineOpen = confirmEl && !confirmEl.classList.contains('hidden');
      const modalOpen = clearModal && !clearModal.classList.contains('hidden');
      if (inlineOpen || modalOpen) {
        hideConfirm();
        return;
      }
      showConfirm();
    });

    cancelBtn?.addEventListener('click', hideInlineConfirm);
    eraseBtn?.addEventListener('click', eraseDraft);
    clearModalCancel?.addEventListener('click', hideClearModal);
    clearModalClose?.addEventListener('click', hideClearModal);
    clearModalErase?.addEventListener('click', eraseDraft);
    clearModal?.addEventListener('click', (ev) => {
      if (ev.target === clearModal) hideClearModal();
    });

    if (confirmEl) {
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !confirmEl.classList.contains('hidden')) hideInlineConfirm();
      });
    }
    if (clearModal) {
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !clearModal.classList.contains('hidden')) hideClearModal();
      });
    }
  })();

  const loadQaFixtureBtn = document.getElementById('load-qa-fixture-btn');
  if (loadQaFixtureBtn) {
    loadQaFixtureBtn.addEventListener('click', () => {
      const doc = window.ao3worksQaFixtureDocJson;
      if (!doc || typeof doc !== 'object' || doc.type !== 'doc') {
        showToast('Sample chapter not loaded.');
        return;
      }
      if (!confirm('Replace the entire editor with the sample chapter?\n\nYour current draft will be overwritten and autosave will be updated.')) return;
      te.commands.setContent(doc, true);
      flushAutosaveNow();
      updateToolbarState();
      refreshMasterSkinCssAfterDocChange();
      showToast('Sample chapter loaded.');
    });
  }

  document.getElementById('side-panel-close').addEventListener('click', closeAllPanels);
  document.getElementById('export-panel-close').addEventListener('click', () => {
    closeExportModal();
  });

  // Close panels with the Escape key. The export modal handles its
  // own Esc on the dialog element (below) so it works no matter
  // which focusable inside it has focus; this fallback only fires
  // for the legacy side panel + smaller modals.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const exportModal = document.getElementById('export-panel');
    if (exportModal && !exportModal.classList.contains('hidden')) return;
    closeAllPanels();
  });

  // Backdrop click + Esc: wired directly on the dialog.
  const exportPanelEl = document.getElementById('export-panel');
  exportPanelEl.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeExportModal();
  });
  exportPanelEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (exportPanelEl.classList.contains('hidden')) return;
    e.preventDefault();
    e.stopPropagation();
    closeExportModal();
  });

  // ── Export modal tabs ─────────────────────────────────────
  const overviewPanel = document.getElementById('export-panel-overview');
  if (overviewPanel) {
    overviewPanel.addEventListener('click', (e) => {
      const jump = e.target.closest('[data-goto-tab]');
      if (!jump) return;
      const tab = jump.getAttribute('data-goto-tab');
      setExportActiveTab(tab);
      document.querySelector(`#export-panel .export-tab[data-tab="${tab}"]`)?.focus();
    });
  }

  const tabButtons = document.querySelectorAll('#export-panel .export-tab');
  tabButtons.forEach((tab) => {
    tab.addEventListener('click', () => setExportActiveTab(tab.getAttribute('data-tab')));
    tab.addEventListener('keydown', (e) => {
      const order = getExportTabOrder();
      const idx = order.indexOf(exportActiveTab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = order[(idx + 1) % order.length];
        setExportActiveTab(next);
        document.querySelector(`.export-tab[data-tab="${next}"]`)?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = order[(idx - 1 + order.length) % order.length];
        setExportActiveTab(prev);
        document.querySelector(`.export-tab[data-tab="${prev}"]`)?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setExportActiveTab(order[0]);
        document.querySelector(`.export-tab[data-tab="${order[0]}"]`)?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = order[order.length - 1];
        setExportActiveTab(last);
        document.querySelector(`.export-tab[data-tab="${last}"]`)?.focus();
      }
    });
  });

  // Focus trap inside the export modal.
  document.getElementById('export-panel').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const modal = document.getElementById('export-panel');
    if (!modal || modal.classList.contains('hidden')) return;
    const all = modal.querySelectorAll(
      'button:not([disabled]):not([hidden]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    // Exclude any element nested inside a hidden tabpanel.
    const focusables = Array.from(all).filter((el) => !el.closest('[hidden]'));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // ── Copy / Download: Tab 1 (HTML) ────────────────────────
  document.getElementById('copy-html-btn').addEventListener('click', () => {
    const htmlText = document.getElementById('export-html-output').textContent;
    copyTextToClipboard(htmlText, 'copy-html-status');
    showToast('HTML copied.');
  });
  document.getElementById('download-html-btn').addEventListener('click', () => {
    const btn = document.getElementById('download-html-btn');
    if (btn && btn.disabled) return;
    const htmlText = document.getElementById('export-html-output').textContent || '';
    const slug = deriveChapterSlug();
    downloadTextAsFile(htmlText, slug + '.html', 'text/html');
    showToast(`Saved ${slug}.html`);
  });

  // ── Copy / Download: Tab 2 (CSS) ─────────────────────────
  document.getElementById('copy-css-btn').addEventListener('click', () => {
    const text = window.ao3worksMasterCSS || '';
    copyTextToClipboard(text, 'copy-css-status');
    showToast('CSS copied.');
  });
  document.getElementById('download-css-btn').addEventListener('click', () => {
    const btn = document.getElementById('download-css-btn');
    if (btn && btn.disabled) return;
    const text = window.ao3worksMasterCSS || '';
    const ver = (window.ao3worksSkinVersions && window.ao3worksSkinVersions.CURRENT_SKIN_VERSION) || MASTER_SKIN_BUNDLE_VERSION;
    const name = `ao3works-skin-v${ver}.css`;
    downloadTextAsFile(text, name, 'text/css');
    showToast(`Saved ${name}`);
  });

  document.getElementById('download-chapter-html-btn').addEventListener('click', () => {
    const btn = document.getElementById('download-chapter-html-btn');
    if (btn && btn.disabled) return;
    downloadAo3WorksChapterHtmlFile();
  });

  // The legacy "Import chapter…" overflow item was removed in favor of
  // a first-class header Import button (wired inline in editor/index.html
  // using welcome.js parsers). The modal + file input below are kept for
  // any deep-linked / legacy callers, but the overflow trigger is gone.
  const importChapterBtnLegacy = document.getElementById('import-chapter-btn');
  if (importChapterBtnLegacy) {
    importChapterBtnLegacy.addEventListener('click', () => { openImportHtmlModal(); });
  }
  const importHtmlModalCloseBtn = document.getElementById('import-html-modal-close');
  if (importHtmlModalCloseBtn) importHtmlModalCloseBtn.addEventListener('click', closeImportHtmlModal);
  const importHtmlModalCancelBtn = document.getElementById('import-html-modal-cancel');
  if (importHtmlModalCancelBtn) importHtmlModalCancelBtn.addEventListener('click', closeImportHtmlModal);
  const importHtmlConfirmHtmlBtn = document.getElementById('import-html-modal-confirm-html');
  if (importHtmlConfirmHtmlBtn) importHtmlConfirmHtmlBtn.addEventListener('click', confirmImportChapterChooseHtml);
  const importHtmlConfirmDocxBtn = document.getElementById('import-html-modal-confirm-docx');
  if (importHtmlConfirmDocxBtn) importHtmlConfirmDocxBtn.addEventListener('click', () => {
    confirmImportChapterChooseDocx();
  });
  const importHtmlModalEl = document.getElementById('import-html-modal');
  if (importHtmlModalEl) importHtmlModalEl.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeImportHtmlModal();
  });
  const importPasteBtn = document.getElementById('import-html-modal-import-paste');
  if (importPasteBtn) {
    importPasteBtn.addEventListener('click', () => {
      importChapterFromModalPastedHtml();
    });
  }
  const importChapterFileInput = document.getElementById('import-chapter-file-input');
  if (importChapterFileInput) importChapterFileInput.addEventListener('change', (e) => {
    const input = e.target;
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    if (isDocxChapterFile(f)) importChapterFromDocxFile(f, IMPORT_MODAL_OPTS);
    else importChapterFromFileInput(f, IMPORT_MODAL_OPTS);
  });

  initHeaderImportButton();

  // Insert menus
  const insertBindings = {
    'insert-imessage': 'imessage', 'insert-whatsapp': 'whatsapp',
    'insert-android':  'android',  'insert-snapchat': 'snapchat',
    'insert-discord':  'discord',  'insert-chatroom': 'chatroom',
    'insert-tweet':    'tweet',    'insert-bluesky':  'bluesky',
    'insert-tumblr':   'tumblr',   'insert-reddit':   'reddit',
    'insert-facebook': 'facebook', 'insert-instagram': 'instagram', 'insert-letter':   'letter',
    'insert-gmail':    'gmail',    'insert-newspaper': 'newspaper',
    'insert-forum':    'forum',
    'insert-spoiler':  'spoiler',  'insert-review':   'review',
    'insert-sticky':   'sticky',   'insert-legal':    'legal',
  };
  Object.entries(insertBindings).forEach(([id, type]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => { closeAllDropdowns(); openSkinBuilder(type); });
  });

  window.ao3worksTour = {
    openImessageCustomizer() {
      document.getElementById('insert-imessage')?.click();
    },
    closeSidePanel() {
      const panel = document.getElementById('side-panel');
      if (!panel || panel.classList.contains('hidden')) return;
      const cancel = document.getElementById('panel-cancel');
      if (cancel) cancel.click();
      else closeAllPanels();
    },
    scrollImessageTourSections() {
      const body = document.getElementById('side-panel-body');
      if (!body) return;
      const scrollMode = body.querySelector('input[name="ios-body-scroll-mode"]');
      const scrollSection = scrollMode?.closest('.panel-section');
      const progress = body.querySelector('.ios-in-progress-section');
      if (scrollSection) {
        scrollSection.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      requestAnimationFrame(() => {
        if (progress) progress.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    },
  };

  const textTypeMenu = document.querySelector('.text-type-dropdown .dropdown-menu');
  if (textTypeMenu) {
    textTypeMenu.addEventListener('click', (e) => {
      const item = e.target.closest('button.dropdown-item');
      if (!item || !textTypeMenu.contains(item)) return;
      e.preventDefault();
      if (typeof window.ao3worksPrepareProseSelectionForToolbar === 'function') {
        window.ao3worksPrepareProseSelectionForToolbar(te);
      }
      if (item.dataset.textType === 'paragraph') {
        te.chain().focus().setParagraph().run();
      } else if (item.dataset.headingLevel != null && item.dataset.headingLevel !== '') {
        const level = parseInt(item.dataset.headingLevel, 10);
        if (level >= 1 && level <= 6) {
          // Heading dropdown semantics:
          //   - In a paragraph or matching heading → setHeading({level}) (convert in place;
          //     same-level no-ops, or toggleHeading if we wanted toggle-off: keeping setHeading
          //     to match the previous behavior for those cases).
          //   - In a DIFFERENT-level non-empty heading → insert a NEW heading block of the
          //     chosen level AFTER the current one, so picking H2 from inside a non-empty H6
          //     doesn't promote the H6 to an H2 (the bug reported in QA).
          //   - In an EMPTY heading of any level → convert in place; nothing to preserve.
          const { selection, doc } = te.state;
          const $from = selection.$from;
          // Depth 1 is the top-level block (heading/paragraph/etc.) inside the doc.
          const blockNode = $from.depth >= 1 ? $from.node(1) : null;
          const isHeading = blockNode && blockNode.type.name === 'heading';
          const isEmpty = blockNode ? blockNode.content.size === 0 : true;
          const currentLevel = isHeading ? blockNode.attrs.level : null;
          if (isHeading && !isEmpty && currentLevel !== level) {
            // Insert a fresh empty heading immediately after the current block.
            const insertPos = $from.end(1) + 1;
            te.chain().focus()
              .insertContentAt(insertPos, { type: 'heading', attrs: { level } })
              .setTextSelection(insertPos + 1)
              .run();
          } else {
            te.chain().focus().setHeading({ level }).run();
          }
        }
      }
      closeAllDropdowns();
      te.view.focus();
      scheduleSave();
      updateToolbarState();
    });
  }

  window.addEventListener('ao3works-open-link', () => openAo3LinkModal(window.tiptapEditor));
  window.addEventListener('ao3works-open-image', () => openAo3ImageModal(window.tiptapEditor));
  bindAo3InsertModals(te);
  setupEditorHoverEdit(te);

  // Live preview: refresh on any panel input/change
  const panelBody = document.getElementById('side-panel-body');
  panelBody.addEventListener('input',  () => { clearTimeout(previewRefreshTimer); previewRefreshTimer = setTimeout(refreshPanelPreview, 250); });
  panelBody.addEventListener('change', () => { clearTimeout(previewRefreshTimer); previewRefreshTimer = setTimeout(refreshPanelPreview, 250); });

  // Character soft-warning for message text fields
  panelBody.addEventListener('input', (e) => {
    if (!e.target.classList.contains('convo-turn-text')) return;
    const len = e.target.value.length;
    let counter = e.target.parentElement.querySelector('.char-counter');
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'char-counter';
      e.target.insertAdjacentElement('afterend', counter);
    }
    if (len > 280) {
      counter.textContent = `${len} characters: this bubble will be very long`;
      counter.classList.add('char-warn');
    } else if (len > 150) {
      counter.textContent = `${len} characters`;
      counter.classList.remove('char-warn');
    } else {
      counter.textContent = '';
    }
  });

  initChromePopoverDismiss();

  if (window.ao3worksDropdownViewport?.initDropdownViewport) {
    window.ao3worksDropdownViewport.initDropdownViewport();
  }

  // Dropdown toggles
  document.querySelectorAll('.dropdown-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = btn.closest('.toolbar-dropdown');
      const isOpen = dd.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        dd.classList.add('open');
        if (btn.hasAttribute('aria-haspopup')) {
          btn.setAttribute('aria-expanded', 'true');
        }
        const positionDropdown = window.ao3worksDropdownViewport?.positionDropdown;
        if (positionDropdown) {
          requestAnimationFrame(() => {
            if (!dd.classList.contains('open')) return;
            positionDropdown(dd);
          });
        }
      }
    });
  });
  document.addEventListener('click', closeAllDropdowns);
  document.querySelectorAll('.toolbar-dropdown .dropdown-menu').forEach(menu => {
    menu.addEventListener('click', (e) => {
      if (menu.classList.contains('view-as-menu')) return;
      if (e.target.closest('.dropdown-item')) closeAllDropdowns();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.querySelector('.toolbar-dropdown.open')) return;
    closeAllDropdowns();
  });

  restoreDraft();
  syncChapterDownloadButtonState();
  syncExportButtonState();

  void finishAo3WorksBoot();
}

// ── BOOTSTRAP ────────────────────────────────────────────────
// Wait for TipTap to announce it has finished building the engine
if (window.tiptapEditor) {
  init();
} else {
  window.addEventListener('tiptap-ready', init);
}

// ── FIRST-RUN TOUR ───────────────────────────────────────────
// Welcome banner + 9-step spotlight tour. No analytics.
//   aw.tour.completed : set when user hits "Done" on the last step
//   aw.tour.dismissed : set when user clicks × on the banner or Skip tour
(function () {
  var TOUR_COMPLETED_KEY = 'aw.tour.completed';
  var TOUR_DISMISSED_KEY = 'aw.tour.dismissed';

  function lsGet(k)        { try { return localStorage.getItem(k); }     catch (e) { return null; } }
  function lsSet(k, v)     { try { localStorage.setItem(k, v); }         catch (e) {} }
  function lsRemove(k)     { try { localStorage.removeItem(k); }         catch (e) {} }

  function tourHooks() {
    return window.ao3worksTour || null;
  }

  function steps() {
    return [
      {
        target: function () { return document.getElementById('header-import-btn'); },
        title: 'Start with a draft you already have',
        body: 'Use Import, paste AO3 chapter HTML into the box, then Import pasted HTML, or choose an HTML / Word file. That replaces your whole draft. You can still paste Google Docs or Word prose directly into the editor for small edits.'
      },
      {
        target: function () { return document.getElementById('editor-surface'); },
        title: 'This is your chapter',
        body: 'Write your prose here. When you add a skin block (like an iMessage thread), it\'ll preview inline so you can see roughly what readers will see on AO3 once your work skin is installed. Click any block to edit it.'
      },
      {
        target: function () { return document.getElementById('text-type-toggle'); },
        title: 'Text styles that match AO3',
        body: 'Normal and Heading 1 through 6 match AO3\'s chapter formatting exactly. Bold, italic, and lists are in the toolbar to the right.'
      },
      {
        target: function () { return document.getElementById('image-btn'); },
        title: 'Images need a web link, not a file',
        body: 'AO3 can\'t load images from your computer. You\'ll need to upload your image somewhere first (like imgur.com or postimage.org), then paste the direct link here. Direct links usually end in .jpg or .png. We\'ll flag any unhosted images before you export.'
      },
      {
        target: function () { return document.getElementById('aw-tb-insert-toggle'); },
        title: 'Add a skin block',
        body: 'Click + Insert, then choose iMessage. We\'ll open the customizer in the next step so you can shape the thread. Other block types (Instagram, letters, tweets, and more) live in the same menu.',
        onEnter: function () {
          var h = tourHooks();
          if (h && h.openImessageCustomizer) {
            requestAnimationFrame(function () { h.openImessageCustomizer(); });
          }
        }
      },
      {
        target: function () { return document.getElementById('side-panel'); },
        title: 'Build the thread',
        body: 'Three things to play with here. Length: for long threads, choose whether the phone scrolls inside its frame or grows tall enough to show every message. In progress: add typing dots or an unsent draft in the composer to suggest the conversation is still happening. Per message: pick who sent each one, and switch between iMessage blue and SMS green, with an optional read receipt.',
        onEnter: function () {
          var h = tourHooks();
          if (h && h.scrollImessageTourSections) {
            requestAnimationFrame(function () { h.scrollImessageTourSections(); });
          }
        },
        onLeave: function () {
          var h = tourHooks();
          if (h && h.closeSidePanel) h.closeSidePanel();
        }
      },
      {
        target: function () { return document.getElementById('view-as-toggle'); },
        title: 'Preview how it\'ll look in AO3 themes',
        body: 'Switch between Default and AO3 Reversi (the dark theme) to see how your chapter renders for readers using each one. This only changes the editor preview, not what gets exported.'
      },
      {
        target: function () { return document.getElementById('download-chapter-html-btn'); },
        title: 'Save a backup to your computer',
        body: 'Download saves your draft as a timestamped HTML file. You can re-import it later to keep working, or just keep it as a personal backup. Useful in addition to autosave, especially before browser cleanups or switching computers.'
      },
      {
        target: function () { return document.getElementById('export-btn'); },
        title: 'Export to AO3',
        body: 'If your chapter uses any skin blocks, you\'ll copy two things in order: first the Work Skin CSS (paste it into AO3 → My Skins), then the chapter HTML (paste it into AO3\'s HTML editor when posting). If your chapter is prose only, you\'ll just need the HTML.'
      }
    ];
  }

  var state = {
    index: 0,
    list: [],
    triggerEl: null,
    keydownHandler: null,
    resizeHandler: null
  };

  function $(id) { return document.getElementById(id); }

  function runStepLeave() {
    var step = state.list[state.index];
    if (step && typeof step.onLeave === 'function') step.onLeave();
  }

  function runStepEnter(step) {
    if (step && typeof step.onEnter === 'function') step.onEnter();
  }

  function positionFor(targetRect, tooltipEl) {
    var pad = 8;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var tw = tooltipEl.offsetWidth  || 280;
    var th = tooltipEl.offsetHeight || 160;
    var gap = 14;

    var top, left;
    var spaceRight  = vw - (targetRect.right + pad);
    var spaceBelow  = vh - (targetRect.bottom + pad);
    var spaceAbove  = targetRect.top - pad;
    var isMobile    = vw <= 720;

    if (isMobile) {
      // Stack below; if not enough space, above.
      if (spaceBelow >= th + gap) {
        top  = targetRect.bottom + pad + gap;
      } else if (spaceAbove >= th + gap) {
        top  = targetRect.top - pad - gap - th;
      } else {
        top  = Math.max(12, (vh - th) / 2);
      }
      left = 12; // CSS forces this on mobile too
    } else if (spaceRight >= tw + gap) {
      // Place to the right of the target.
      left = targetRect.right + pad + gap;
      top  = Math.max(12, Math.min(targetRect.top, vh - th - 12));
    } else if (spaceBelow >= th + gap) {
      left = Math.max(12, Math.min(targetRect.left, vw - tw - 12));
      top  = targetRect.bottom + pad + gap;
    } else if (spaceAbove >= th + gap) {
      left = Math.max(12, Math.min(targetRect.left, vw - tw - 12));
      top  = targetRect.top - pad - gap - th;
    } else {
      // Last resort: centered.
      left = Math.max(12, (vw - tw) / 2);
      top  = Math.max(12, (vh - th) / 2);
    }
    return { top: top, left: left };
  }

  function renderStep() {
    var overlay = $('aw-tour-overlay');
    var cutout  = $('aw-tour-cutout');
    var tip     = $('aw-tour-tooltip');
    if (!overlay || !cutout || !tip) return;

    var step = state.list[state.index];
    var targetEl = step && typeof step.target === 'function' ? step.target() : null;
    if (!targetEl) { endTour(false); return; }

    targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

    var rect = targetEl.getBoundingClientRect();
    var pad = 8;
    cutout.style.top    = (rect.top    - pad) + 'px';
    cutout.style.left   = (rect.left   - pad) + 'px';
    cutout.style.width  = (rect.width  + pad * 2) + 'px';
    cutout.style.height = (rect.height + pad * 2) + 'px';

    var n = state.list.length;
    $('aw-tour-step').textContent  = (state.index + 1) + ' of ' + n;
    $('aw-tour-title').textContent = step.title;
    $('aw-tour-body').textContent  = step.body;
    $('aw-tour-next').textContent  = (state.index === n - 1) ? 'Done' : 'Next';

    runStepEnter(step);

    function positionTooltipAndMaybeReflow() {
      var el = typeof step.target === 'function' ? step.target() : null;
      if (el) {
        var r = el.getBoundingClientRect();
        cutout.style.top    = (r.top    - pad) + 'px';
        cutout.style.left   = (r.left   - pad) + 'px';
        cutout.style.width  = (r.width  + pad * 2) + 'px';
        cutout.style.height = (r.height + pad * 2) + 'px';
        rect = r;
      }
      var pos = positionFor(rect, tip);
      tip.style.top  = pos.top  + 'px';
      tip.style.left = pos.left + 'px';
      tip.focus();
    }

    requestAnimationFrame(function () {
      positionTooltipAndMaybeReflow();
      requestAnimationFrame(positionTooltipAndMaybeReflow);
    });
  }

  function startTour(triggerEl) {
    state.list = steps();
    state.index = 0;
    state.triggerEl = triggerEl || document.activeElement || null;

    var overlay = $('aw-tour-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    // Hide the welcome banner while the tour runs.
    var banner = $('aw-tour-welcome');
    if (banner) banner.classList.add('hidden');

    state.keydownHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); endTour(false); }
    };
    document.addEventListener('keydown', state.keydownHandler);

    state.resizeHandler = function () { renderStep(); };
    window.addEventListener('resize', state.resizeHandler);
    window.addEventListener('scroll', state.resizeHandler, true);

    renderStep();
  }

  function nextStep() {
    if (state.index >= state.list.length - 1) {
      endTour(true);
      return;
    }
    runStepLeave();
    state.index += 1;
    renderStep();
  }

  function endTour(completed) {
    runStepLeave();
    var h = tourHooks();
    if (h && h.closeSidePanel) h.closeSidePanel();
    var overlay = $('aw-tour-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (state.keydownHandler) {
      document.removeEventListener('keydown', state.keydownHandler);
      state.keydownHandler = null;
    }
    if (state.resizeHandler) {
      window.removeEventListener('resize', state.resizeHandler);
      window.removeEventListener('scroll', state.resizeHandler, true);
      state.resizeHandler = null;
    }
    if (completed) {
      lsSet(TOUR_COMPLETED_KEY, 'true');
      showToast('You\'re all set. When you export, we\'ll give you the CSS first, then your chapter HTML.');
    } else {
      lsSet(TOUR_DISMISSED_KEY, 'true');
    }
    if (state.triggerEl && typeof state.triggerEl.focus === 'function') {
      try { state.triggerEl.focus(); } catch (e) {}
    }
    state.triggerEl = null;
  }

  function maybeShowWelcomeBanner() {
    var banner = $('aw-tour-welcome');
    if (!banner) return;
    if (lsGet(TOUR_COMPLETED_KEY) === 'true' || lsGet(TOUR_DISMISSED_KEY) === 'true') {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
    }
  }

  function initTour() {
    var banner       = $('aw-tour-welcome');
    var bannerBody   = $('aw-tour-welcome-body');
    var bannerClose  = $('aw-tour-welcome-dismiss');
    var replayBtn    = $('replay-tour-btn');
    var skipBtn      = $('aw-tour-skip');
    var nextBtn      = $('aw-tour-next');
    var overlay      = $('aw-tour-overlay');

    if (bannerBody) {
      bannerBody.addEventListener('click', function () {
        startTour(bannerBody);
      });
    }
    if (bannerClose) {
      bannerClose.addEventListener('click', function (e) {
        e.stopPropagation();
        lsSet(TOUR_DISMISSED_KEY, 'true');
        if (banner) banner.classList.add('hidden');
      });
    }
    if (replayBtn) {
      replayBtn.addEventListener('click', function () {
        lsRemove(TOUR_COMPLETED_KEY);
        lsRemove(TOUR_DISMISSED_KEY);
        maybeShowWelcomeBanner();
        startTour(replayBtn);
      });
    }
    if (skipBtn) skipBtn.addEventListener('click', function () { endTour(false); });
    if (nextBtn) nextBtn.addEventListener('click', function () { nextStep(); });
    if (overlay) {
      // Clicks on the dimmed area (outside the tooltip) skip the tour.
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay || e.target === document.getElementById('aw-tour-cutout')) {
          endTour(false);
        }
      });
    }

    maybeShowWelcomeBanner();
  }

  function bootTour() {
    if (window.tiptapEditor) initTour();
    else window.addEventListener('tiptap-ready', initTour, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootTour);
  } else {
    bootTour();
  }
})();
