// ============================================================
// AO3 STUDIO — editor.js (The Core Engine)
// ============================================================
// Bundled by esbuild → dist/editor.bundle.js
// Responsibilities: TipTap Init, Export HTML Bridge, Paste Sanitization

import { Editor, Extension, isTextSelection } from '@tiptap/core';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import CharacterCount from '@tiptap/extension-character-count';
import { SkinBlock, focusEditableAfterSkinBlock, SKIN_EXIT_ZONE_PX } from './extensions/SkinBlock.js';

/** Keyboard shortcuts for UI actions (handled in script.js). */
const Ao3ToolbarShortcuts = Extension.create({
  name: 'ao3ToolbarShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        window.dispatchEvent(new CustomEvent('ao3works-open-link'));
        return true;
      },
      'Mod-Shift-i': () => {
        window.dispatchEvent(new CustomEvent('ao3works-open-image'));
        return true;
      },
    };
  },
});

/** * Keep the extension list DRY (Don't Repeat Yourself).
 * We need this exact array for both the live editor and the HTML export generator.
 */
export function getAo3EditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      horizontalRule: true,
      blockquote: true,
      bulletList: true,
      orderedList: true,
      hardBreak: true,
      history: true,
      link: false, // We use the dedicated Link extension below
      underline: false, // We use the dedicated Underline extension below
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    Image.configure({
      inline: false,
      allowBase64: true, // We allow it in the editor, but flag it for export
      HTMLAttributes: {
        class: 'responsive-img',
      },
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: null,
        target: null,
      },
    }),
    Subscript,
    Superscript,
    SkinBlock,
    CharacterCount,
    Ao3ToolbarShortcuts,
  ];
}

// ── RUTHLESS PASTE SANITIZER ─────────────────────────────────────
// Cleans Google Docs & MS Word paste garbage BEFORE it hits TipTap's state.

const ALIGN_BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

function parseTextDecoration(style) {
  const m = (style || '').match(/text-decoration\s*:\s*([^;]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/** Word/Docs use inline styles for strike/underline; TipTap parses those only if still present. Convert to semantic tags before we strip styles. */
function normalizePasteDecorations(doc) {
  const candidates = Array.from(doc.body.querySelectorAll('*')).reverse();
  for (const el of candidates) {
    const style = el.getAttribute('style') || '';
    if (!style || !/text-decoration/i.test(style)) continue;
    const td = parseTextDecoration(style);
    if (!td) continue;
    const hasStrike = td.includes('line-through');
    const hasUnderline = td.includes('underline');
    if (!hasStrike && !hasUnderline) continue;
    if (['S', 'DEL', 'STRIKE'].includes(el.tagName)) continue;
    if (el.tagName === 'U' && !hasStrike) continue; // keep <u> for underline-only; style strip leaves semantic tag

    const parent = el.parentNode;
    if (!parent) continue;

    if (hasStrike && hasUnderline) {
      const u = doc.createElement('u');
      const s = doc.createElement('s');
      while (el.firstChild) s.appendChild(el.firstChild);
      u.appendChild(s);
      parent.replaceChild(u, el);
    } else if (hasStrike) {
      const s = doc.createElement('s');
      while (el.firstChild) s.appendChild(el.firstChild);
      parent.replaceChild(s, el);
    } else if (hasUnderline && el.tagName !== 'U') {
      const u = doc.createElement('u');
      while (el.firstChild) u.appendChild(el.firstChild);
      parent.replaceChild(u, el);
    }
  }
}

/** TipTap TextAlign only reads style.textAlign — extract from style / align attr / align-* class and re-apply as the only remaining style after the main strip. */
function extractBlockTextAlign(el) {
  const style = el.getAttribute('style') || '';
  let ta = '';
  const m = style.match(/text-align\s*:\s*([^;]+)/i);
  if (m) ta = m[1].trim().toLowerCase();
  if (!ta) {
    const al = (el.getAttribute('align') || '').toLowerCase();
    if (['left', 'center', 'right', 'justify'].includes(al)) ta = al;
  }
  if (!ta) {
    const cls = el.getAttribute('class') || '';
    const cm = cls.match(/align-(left|center|right|justify)\b/i);
    if (cm) ta = cm[1].toLowerCase();
  }
  if (['left', 'center', 'right', 'justify'].includes(ta)) return ta;
  return '';
}

function sanitizePastedHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let hasUnhostedImages = false;

  // 1. Strip invisible junk completely
  doc.querySelectorAll('script, style, meta, link, xml').forEach(el => el.remove());

  // 2. Intelligently promote Google Docs/Word indents to AO3 Blockquotes
  doc.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6').forEach(el => {
    const style = el.getAttribute('style') || '';
    // Look for standard indenting techniques in word processors
    const marginLeft = style.match(/(?:margin-left|padding-left)\s*:\s*([\d.]+)(px|pt|in|cm)/i);
    
    if (marginLeft) {
      const val = parseFloat(marginLeft[1]);
      const unit = marginLeft[2].toLowerCase();
      // Rough conversion to pixels
      const px = unit === 'pt' ? val * 1.33 : unit === 'in' ? val * 96 : unit === 'cm' ? val * 37.8 : val;
      
      // If indented more than ~20px, the user probably wanted a blockquote
      if (px >= 20 && el.tagName !== 'BLOCKQUOTE') {
        const bq = doc.createElement('blockquote');
        while (el.firstChild) bq.appendChild(el.firstChild);
        el.replaceWith(bq);
      }
    }
  });

  // 3. Inline decorations → <s> / <u> so they survive style stripping (TipTap Strike/Underline parseHTML)
  normalizePasteDecorations(doc);

  // 4. Strip ALL inline styles and unsupported classes; restore text-align only on blocks TipTap aligns
  doc.querySelectorAll('*').forEach(el => {
    let alignOnly = '';
    if (ALIGN_BLOCK_TAGS.has(el.tagName)) {
      alignOnly = extractBlockTextAlign(el);
    }

    el.removeAttribute('style');
    el.removeAttribute('class');
    el.removeAttribute('dir');
    el.removeAttribute('id');
    el.removeAttribute('align');

    if (alignOnly) {
      el.setAttribute('style', `text-align: ${alignOnly}`);
    }

    // 5. Trap Unhosted Images (Base64 from Word, Ephemeral from GDocs)
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';
      if (
        src.startsWith('data:image') || 
        src.includes('googleusercontent.com') || 
        src.startsWith('file://') ||
        src.startsWith('blob:')
      ) {
        hasUnhostedImages = true;
      }
    }
  });

  // If we found unhosted images, dispatch an event to script.js to show the red warning banner
  if (hasUnhostedImages) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ao3works-unhosted-image-warning'));
    }, 50);
  }

  return doc.body.innerHTML;
}

// Called from script.js before toolbar mark/blockquote toggles.
// TipTap focus(null) does not resolve NodeSelection on atoms (e.g. skinBlock), so toggles no-op until we move the caret.
/** Same cleanup as paste (styles, blockquote heuristics, unhosted-image banner). Used by chapter import from HTML / Word. */
window.ao3worksSanitizeImportedHtml = sanitizePastedHTML;

window.ao3worksPrepareProseSelectionForToolbar = function (editor) {
  if (!editor || editor.isDestroyed) return;
  try {
    const sel = editor.state.selection;
    if (isTextSelection(sel)) return;
    const node = sel.node;
    if (node && node.isAtom) {
      const pos = Math.min(sel.to, editor.state.doc.content.size);
      editor.commands.setTextSelection(pos);
    }
  } catch (err) {
    console.warn('AO3 Works: prepare prose selection for toolbar', err);
  }
};

// ── TIPTAP INITIALIZATION ────────────────────────────────────────
/** Must stay in sync with AUTOSAVE_KEY in script.js */
const AUTOSAVE_KEY_BOOT = 'aw.draft';

// One-time migration from legacy non-aw.* keys. Idempotent + silent.
// Must run before any read of the new keys. See script.js for the
// canonical copy used during full init; this boot-time call ensures
// readInitialDocFromLocalStorage() sees migrated drafts on first load.
function migrateLegacyStorageKeysBoot() {
  const pairs = [
    ['ao3works_draft', 'aw.draft'],
    ['ao3works_sidebar_width_px', 'aw.sidebarWidth'],
  ];
  for (const [oldKey, newKey] of pairs) {
    try {
      const legacy = localStorage.getItem(oldKey);
      if (legacy == null) continue;
      if (localStorage.getItem(newKey) == null) {
        try { localStorage.setItem(newKey, legacy); } catch (_) { continue; }
      }
      try { localStorage.removeItem(oldKey); } catch (_) {}
    } catch (_) { /* ignore */ }
  }
}
migrateLegacyStorageKeysBoot();

function readInitialDocFromLocalStorage() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY_BOOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed;
  } catch (_) {
    /* ignore */
  }
  return null;
}

/** Prefer autosaved doc, then welcome JSON (defaultWelcomeDoc.js must load before this bundle). */
function getInitialEditorContent() {
  const saved = readInitialDocFromLocalStorage();
  if (saved) return saved;
  const welcome = typeof window !== 'undefined' ? window.ao3worksDefaultWelcomeDocJson : null;
  if (welcome && typeof welcome === 'object' && welcome.type === 'doc') return welcome;
  return '<p></p>';
}

function initEditor() {
  const editorElement = document.getElementById('editor');
  if (!editorElement) {
    console.error('Editor mount element #editor not found');
    return;
  }

  const extensions = getAo3EditorExtensions();

  // EXPORT BRIDGE: Expose a pure function to script.js to generate HTML from JSON
  // This completely eliminates the need to clone the DOM for AO3 export!
  window.ao3worksGenerateDocSliceHtml = (sliceDocJson) => {
    try {
      return generateHTML(sliceDocJson, extensions);
    } catch (err) {
      console.error('AO3 Works Export Error:', err);
      return '';
    }
  };

  const editor = new Editor({
    element: editorElement,
    extensions,
    content: getInitialEditorContent(),
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'ao3-editor',
        spellcheck: 'true',
      },
      transformPastedHTML(html) {
        return sanitizePastedHTML(html);
      },
      handlePaste(_view, event) {
        const clip = event.clipboardData;
        if (!clip) return false;
        const html = clip.getData('text/html') || clip.getData('text/plain') || '';
        const chapterImport = typeof window !== 'undefined' ? window.ao3worksChapterImport : null;
        if (
          chapterImport
          && typeof chapterImport.shouldUseChapterImport === 'function'
          && chapterImport.shouldUseChapterImport(html)
        ) {
          event.preventDefault();
          if (typeof window.ao3worksShowImportAo3PasteHint === 'function') {
            window.ao3worksShowImportAo3PasteHint();
          }
          return true;
        }
        return false;
      },
    },
  });

  // Expose the editor instance globally so script.js can control the toolbar/sidebar
  window.tiptapEditor = editor;

  // Clicks in dead space below a skin block should open a prose row underneath it.
  const editorWrap = document.getElementById('editor-wrap');
  if (editorWrap) {
    editorWrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.skin-block-actions')) return;

      const view = editor.view;
      const skinDom = e.target.closest('.skin-block');
      if (skinDom) {
        const rect = skinDom.getBoundingClientRect();
        if (e.clientY >= rect.bottom - SKIN_EXIT_ZONE_PX) {
          const pos = view.posAtDOM(skinDom, 0);
          const node = editor.state.doc.nodeAt(pos);
          if (node?.type.name === 'skinBlock') {
            e.preventDefault();
            focusEditableAfterSkinBlock(editor, pos);
          }
        }
        return;
      }

      const coords = { left: e.clientX, top: e.clientY };
      const hit = view.posAtCoords(coords);
      if (hit) {
        editor.commands.focus();
        return;
      }

      const pmRoot = view.dom;
      if (!pmRoot.contains(e.target) && e.target !== pmRoot) return;

      const blocks = pmRoot.querySelectorAll('.skin-block');
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        const rect = block.getBoundingClientRect();
        if (e.clientY < rect.top - 8) continue;
        if (e.clientY > rect.bottom + 96) continue;
        if (e.clientY < rect.bottom - 8) continue;

        const pos = view.posAtDOM(block, 0);
        const node = editor.state.doc.nodeAt(pos);
        if (!node || node.type.name !== 'skinBlock') continue;

        e.preventDefault();
        focusEditableAfterSkinBlock(editor, pos);
        return;
      }

      if (!e.target.closest('.skin-block')) editor.commands.focus();
    });
  }

  // Let the UI know the engine is ready
  window.dispatchEvent(new CustomEvent('tiptap-ready', { detail: { editor } }));

  return editor;
}

// Boot the engine when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditor);
} else {
  initEditor();
}
