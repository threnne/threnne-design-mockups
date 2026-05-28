// ============================================================
// AO3 STUDIO — SkinBlock.js (TipTap Extension)
// ============================================================
// Defines the custom Node for all AO3 templates (text messages, letters, etc.)

import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Safely clones the data object to prevent the UI from mutating TipTap's
 * internal state by reference before the user clicks "Save".
 */
function cloneContentData(obj) {
  try {
    return structuredClone(obj ?? {});
  } catch {
    return JSON.parse(JSON.stringify(obj ?? {}));
  }
}

/**
 * Routes the block's data to the pure HTML builder functions.
 * These functions are expected to be globally available from `builders.js`.
 */
export function skinInnerHtmlFromAttrs(type, contentData) {
  const data = contentData || {};
  const w = typeof window !== 'undefined' ? window : {};
  
  switch (type) {
    case 'imessage': return w.buildIosPhoneHTML  ? w.buildIosPhoneHTML(data)  : '';
    case 'tweet':    return w.buildTweetHTML      ? w.buildTweetHTML(data)      : '';
    case 'letter':   return w.buildLetterHTML     ? w.buildLetterHTML(data)     : '';
    case 'spoiler':  return w.buildSpoilerHTML    ? w.buildSpoilerHTML(data)    : '';
    case 'chatroom': return w.buildSlackChatHTML  ? w.buildSlackChatHTML(data)  : '';
    case 'whatsapp': return w.buildWhatsAppHTML   ? w.buildWhatsAppHTML(data)   : '';
    case 'gmail':    return w.buildGmailHTML      ? w.buildGmailHTML(data)      : '';
    case 'snapchat': return w.buildSnapchatHTML   ? w.buildSnapchatHTML(data)   : '';
    case 'tumblr':   return w.buildTumblrHTML     ? w.buildTumblrHTML(data)     : '';
    case 'review':   return w.buildReviewHTML     ? w.buildReviewHTML(data)     : '';
    case 'android':  return w.buildAndroidSMSHTML ? w.buildAndroidSMSHTML(data) : '';
    case 'discord':  return w.buildDiscordHTML    ? w.buildDiscordHTML(data)    : '';
    case 'reddit':   return w.buildRedditHTML     ? w.buildRedditHTML(data)     : '';
    case 'bluesky':  return w.buildBlueskyHTML    ? w.buildBlueskyHTML(data)    : '';
    case 'newspaper':return w.buildNewspaperHTML  ? w.buildNewspaperHTML(data)  : '';
    case 'forum':    return w.buildForumHTML      ? w.buildForumHTML(data)      : '';
    case 'facebook': return w.buildFacebookHTML   ? w.buildFacebookHTML(data)   : '';
    case 'instagram': return w.buildInstagramHTML   ? w.buildInstagramHTML(data)   : '';
    case 'sticky':   return w.buildStickyNoteHTML ? w.buildStickyNoteHTML(data) : '';
    case 'legal':
      return data.customHtml || '';
    default:
      return '';
  }
}

/**
 * The HTML for the action bar that hovers over the block.
 * Notice the `data-drag-handle` attribute—this activates native drag-and-drop.
 */
/** Pixels from the block bottom treated as “click below to keep writing”. */
export const SKIN_EXIT_ZONE_PX = 44;

/**
 * Move the text caret into a paragraph after a skin block, inserting one if needed.
 */
export function focusEditableAfterSkinBlock(editor, skinPos) {
  if (!editor || editor.isDestroyed || skinPos == null) return false;
  const node = editor.state.doc.nodeAt(skinPos);
  if (!node || node.type.name !== 'skinBlock') return false;

  const after = skinPos + node.nodeSize;
  const next = editor.state.doc.nodeAt(after);
  const chain = editor.chain().focus();

  if (!next || next.type.name === 'skinBlock') {
    return chain
      .insertContentAt(after, { type: 'paragraph' })
      .setTextSelection(after + 1)
      .run();
  }

  if (next.isTextblock) {
    return chain.setTextSelection(after + 1).run();
  }

  return chain.setTextSelection(after + 1).run();
}

function isSkinExitZoneClick(dom, clientY) {
  const rect = dom.getBoundingClientRect();
  return clientY >= rect.bottom - SKIN_EXIT_ZONE_PX;
}

function skinActionsHTML() {
  return (
    '<span class="skin-block-drag" data-drag-handle draggable="true" title="Drag to reorder" aria-label="Drag to reorder block">⠿</span>' +
    '<button type="button" class="skin-block-action" data-skin-action="edit" aria-label="Edit block">Edit</button>' +
    '<button type="button" class="skin-block-action" data-skin-action="duplicate" aria-label="Duplicate block">Duplicate</button>' +
    '<button type="button" class="skin-block-action skin-block-action--delete" data-skin-action="delete" aria-label="Delete block">Delete</button>'
  );
}

export const SkinBlock = Node.create({
  name: 'skinBlock',
  group: 'block',
  atom: true,       // The text cursor treats this whole block as a single, unbreakable unit
  draggable: true,  // Tells TipTap this node can be picked up and moved

  addAttributes() {
    return {
      type: { default: 'imessage' },
      contentData: {
        default: {},
        // How TipTap reads this data if someone pastes HTML containing a skin block
        parseHTML: (el) => {
          const raw = el.getAttribute('data-skin-data');
          if (!raw) return {};
          try {
            return JSON.parse(raw) || {};
          } catch {
            return {};
          }
        },
        // How TipTap writes this data to HTML (used for copy/paste and standard export)
        renderHTML: (attrs) => ({
          'data-skin-data': JSON.stringify(attrs.contentData ?? {}),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-skin-block]',
        getAttrs: (el) => ({
          type: el.getAttribute('data-skin-type') || 'imessage',
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-skin-block': '',
        'data-skin-type': node.attrs.type,
        class: 'skin-block-pm-host',
      }),
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentNode = node; // Shadow variable — avoids mutating the destructured param

      // 1. Create the outer wrapper (Cursor cannot enter this)
      const dom = document.createElement('div');
      dom.className = 'skin-block';
      dom.setAttribute('contenteditable', 'false');
      dom.dataset.skin = currentNode.attrs.type;

      // 2. Create the UI action bar
      const actions = document.createElement('div');
      actions.className = 'skin-block-actions';
      actions.innerHTML = skinActionsHTML();

      dom.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.skin-block-actions')) return;
        if (!isSkinExitZoneClick(dom, e.clientY)) return;
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;
        e.preventDefault();
        e.stopPropagation();
        focusEditableAfterSkinBlock(editor, pos);
      });

      // 3. Create the preview container
      // Editor preview container.
      // Uses id="workskin" (intentionally matching master-skin.css selectors) so the
      // preview is styled identically to the AO3 output. Multiple instances on the
      // same page is valid for CSS purposes; no code selects this ID via getElementById.
      const workskin = document.createElement('div');
      workskin.id = 'workskin';

      dom.appendChild(actions);
      dom.appendChild(workskin);

      // Render the visual HTML based on the node's current attributes
      const renderInner = (n) => {
        workskin.innerHTML = skinInnerHtmlFromAttrs(n.attrs.type, n.attrs.contentData);
      };
      
      renderInner(currentNode);

      // Dispatch events to the global UI script
      const fire = (name, detail) => {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      };

      actions.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-skin-action]');
        if (!btn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const action = btn.getAttribute('data-skin-action');
        // Check getPos exists but DO NOT evaluate it yet — pass the live reference
        if (typeof getPos !== 'function' || getPos() == null) return;

        if (action === 'edit') {
          fire('ao3works-edit-skin', {
            getPos: getPos,
            type: currentNode.attrs.type,
            contentData: cloneContentData(currentNode.attrs.contentData),
          });
        } else if (action === 'duplicate') {
          fire('ao3works-duplicate-skin', { getPos: getPos });
        } else if (action === 'delete') {
          fire('ao3works-delete-skin', { getPos: getPos });
        }
      });

      return {
        dom,
        // TipTap calls this when the user clicks the block
        selectNode() {
          dom.classList.add('selected');
        },
        // TipTap calls this when the user clicks away
        deselectNode() {
          dom.classList.remove('selected');
        },
        // Prevent TipTap from stealing focus when we click buttons inside the wrapper
        stopEvent(event) {
          if (event.target.closest('.skin-block-actions')) return true;
          if (event.type === 'mousedown' && isSkinExitZoneClick(dom, event.clientY)) return true;
          return false;
        },
        // Ignore mutations so if browser extensions alter the DOM, TipTap doesn't crash
        ignoreMutation() {
          return true;
        },
        // Called when the Sidebar saves new data to the node
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'skinBlock') return false;
          
          const prev = JSON.stringify(currentNode.attrs.contentData ?? {});
          const next = JSON.stringify(updatedNode.attrs.contentData ?? {});
          
          if (updatedNode.attrs.type !== currentNode.attrs.type || prev !== next) {
            currentNode = updatedNode;
            dom.dataset.skin = currentNode.attrs.type;
            renderInner(currentNode);
          }
          return true;
        },
      };
    };
  },
});

// Expose the HTML builder globally so the Export function in script.js can use it
if (typeof window !== 'undefined') {
  window.ao3worksSkinInnerHtmlFromAttrs = skinInnerHtmlFromAttrs;
}
