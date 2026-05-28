// ============================================================
// AO3 Works — src/lib/dropdown-viewport.js
// Keep toolbar/header dropdown menus inside the viewport.
// Dual module: CommonJS + window.ao3worksDropdownViewport
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksDropdownViewport = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const VIEWPORT_PAD = 8;
  const GAP = 6;

  /**
   * @param {DOMRect} anchorRect
   * @param {number} menuWidth
   * @param {number} viewportWidth
   * @param {'start'|'end'} align
   * @param {number} [pad]
   * @returns {number}
   */
  function computeDropdownLeft(anchorRect, menuWidth, viewportWidth, align, pad) {
    const p = pad ?? VIEWPORT_PAD;
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const spaceLeft = anchorCenterX - p;
    const spaceRight = viewportWidth - p - anchorCenterX;

    let left;
    if (align === 'end') {
      left = anchorRect.right - menuWidth;
    } else if (align === 'start') {
      left = anchorRect.left;
    } else if (spaceRight < spaceLeft) {
      left = anchorRect.right - menuWidth;
    } else {
      left = anchorRect.left;
    }

    return Math.max(p, Math.min(left, viewportWidth - p - menuWidth));
  }

  /**
   * @param {DOMRect} anchorRect
   * @param {number} menuHeight
   * @param {number} viewportHeight
   * @param {number} [pad]
   * @param {number} [gap]
   * @returns {{ top: number, flipUp: boolean }}
   */
  function computeDropdownTop(anchorRect, menuHeight, viewportHeight, pad, gap) {
    const p = pad ?? VIEWPORT_PAD;
    const g = gap ?? GAP;
    let top = anchorRect.bottom + g;
    const fitsBelow = top + menuHeight <= viewportHeight - p;
    const fitsAbove = anchorRect.top - g - menuHeight >= p;
    let flipUp = false;

    if (!fitsBelow && fitsAbove) {
      top = anchorRect.top - g - menuHeight;
      flipUp = true;
    } else if (!fitsBelow) {
      top = Math.max(p, viewportHeight - p - menuHeight);
    }

    return { top, flipUp };
  }

  /**
   * @param {Element} menu
   * @returns {'start'|'end'|'auto'}
   */
  function getDropdownAlign(menu) {
    if (
      menu.classList.contains('aw-tb-insert-menu')
      || menu.classList.contains('aw-header-overflow-menu')
    ) {
      return 'end';
    }
    const dropdown = menu.closest('.toolbar-dropdown');
    if (dropdown?.getAttribute('data-dropdown-align')) {
      return dropdown.getAttribute('data-dropdown-align');
    }
    return 'start';
  }

  /**
   * @param {Element} menu
   */
  function resetDropdownMenuPosition(menu) {
    menu.style.removeProperty('left');
    menu.style.removeProperty('right');
    menu.style.removeProperty('top');
    menu.style.removeProperty('max-height');
    menu.style.removeProperty('position');
    menu.style.removeProperty('overflow-y');
    menu.classList.remove('aw-dropdown-flip-up');
  }

  /**
   * @param {Element} menu
   * @param {Element} toggle
   * @param {{ width?: number, height?: number }} [viewport]
   */
  function clampDropdownToViewport(menu, toggle, viewport) {
    if (!menu || !toggle) return;
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return;

    const position = getComputedStyle(menu).position;
    if (position === 'static' || position === 'fixed') return;

    resetDropdownMenuPosition(menu);

    const vw = viewport?.width ?? window.innerWidth;
    const vh = viewport?.height ?? window.innerHeight;
    const anchorRect = toggle.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    if (!menuWidth || !menuHeight) return;

    const align = getDropdownAlign(menu);
    const leftViewport = computeDropdownLeft(anchorRect, menuWidth, vw, align);
    const { top: topViewport, flipUp } = computeDropdownTop(anchorRect, menuHeight, vh);

    const offsetParent = menu.offsetParent;
    if (!offsetParent || !(offsetParent instanceof Element)) return;

    const parentRect = offsetParent.getBoundingClientRect();
    menu.style.left = `${Math.round(leftViewport - parentRect.left)}px`;
    menu.style.right = 'auto';
    menu.style.top = `${Math.round(topViewport - parentRect.top)}px`;

    if (flipUp) menu.classList.add('aw-dropdown-flip-up');

    const available = flipUp
      ? anchorRect.top - GAP - VIEWPORT_PAD
      : vh - VIEWPORT_PAD - topViewport;
    if (available > 0 && menuHeight > available) {
      menu.style.maxHeight = `${Math.floor(available)}px`;
      menu.style.overflowY = 'auto';
    }
  }

  /**
   * @param {Element} dropdown
   */
  function positionDropdown(dropdown) {
    if (!dropdown?.classList?.contains('open')) return;
    const menu = dropdown.querySelector(':scope > .dropdown-menu');
    const toggle = dropdown.querySelector(':scope > .dropdown-toggle');
    if (!menu || !toggle) return;
    clampDropdownToViewport(menu, toggle);
  }

  function positionOpenDropdowns() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.toolbar-dropdown.open').forEach(positionDropdown);
  }

  function initDropdownViewport() {
    if (typeof window === 'undefined') return;

    window.addEventListener('resize', positionOpenDropdowns);
    window.addEventListener(
      'scroll',
      () => {
        positionOpenDropdowns();
      },
      true
    );
  }

  return {
    VIEWPORT_PAD,
    GAP,
    computeDropdownLeft,
    computeDropdownTop,
    getDropdownAlign,
    resetDropdownMenuPosition,
    clampDropdownToViewport,
    positionDropdown,
    positionOpenDropdowns,
    initDropdownViewport,
  };
});
