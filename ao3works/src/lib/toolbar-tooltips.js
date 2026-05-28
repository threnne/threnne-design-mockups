// ============================================================
// AO3 Works — src/lib/toolbar-tooltips.js
// Viewport-aware toolbar button tooltips (reads data-tip).
// Dual module: CommonJS + window.ao3worksToolbarTooltips
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksToolbarTooltips = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const SHOW_DELAY_MS = 250;
  const HIDE_DELAY_MS = 80;
  const VIEWPORT_PAD = 8;
  const GAP = 6;

  /**
   * @param {DOMRect} anchorRect
   * @param {{ width: number, height: number }} tipSize
   * @param {{ width?: number, height?: number }} [viewport]
   * @returns {{ top: number, left: number }}
   */
  function positionToolbarTooltip(anchorRect, tipSize, viewport, options) {
    const vw = viewport?.width ?? 1024;
    const vh = viewport?.height ?? 768;
    const tw = tipSize.width;
    const th = tipSize.height;
    const align = options?.align ?? 'auto';
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const spaceLeft = anchorCenterX - VIEWPORT_PAD;
    const spaceRight = vw - VIEWPORT_PAD - anchorCenterX;

    let left;
    if (align === 'start') {
      left = anchorRect.left;
    } else if (align === 'end') {
      left = anchorRect.right - tw;
    } else if (align === 'auto') {
      if (tw / 2 <= spaceLeft && tw / 2 <= spaceRight) {
        left = anchorRect.left + (anchorRect.width - tw) / 2;
      } else if (spaceRight < spaceLeft) {
        left = anchorRect.right - tw;
      } else {
        left = anchorRect.left;
      }
    } else {
      left = anchorRect.left + (anchorRect.width - tw) / 2;
    }

    let top = anchorRect.bottom + GAP;

    left = Math.max(VIEWPORT_PAD, Math.min(left, vw - VIEWPORT_PAD - tw));

    const fitsBelow = top + th <= vh - VIEWPORT_PAD;
    const fitsAbove = anchorRect.top - GAP - th >= VIEWPORT_PAD;
    if (!fitsBelow && fitsAbove) {
      top = anchorRect.top - GAP - th;
    } else if (!fitsBelow) {
      top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - th);
    }

    return { top: Math.round(top), left: Math.round(left) };
  }

  function initToolbarTooltips(options) {
    const rootSelectors = (options && options.roots)
      || ((options && options.toolbar) ? [options.toolbar] : ['#toolbar', '.aw-header-v2']);
    const roots = rootSelectors
      .map((sel) => (typeof sel === 'string' ? document.querySelector(sel) : sel))
      .filter(Boolean);
    let tipEl = (options && options.tipEl) || document.getElementById('aw-toolbar-tooltip');
    if (roots.length === 0) return;

    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'aw-toolbar-tooltip';
      tipEl.className = 'aw-toolbar-tooltip';
      tipEl.setAttribute('role', 'tooltip');
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }

    let active = null;
    let showTimer = null;
    let hideTimer = null;

    function clearTimers() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    }

    function hideNow() {
      if (active) active.classList.remove('tooltip-active');
      active = null;
      tipEl.hidden = true;
      tipEl.classList.remove('is-visible');
      tipEl.textContent = '';
      tipEl.removeAttribute('style');
    }

    function measureAndPosition(anchor) {
      const text = anchor.getAttribute('data-tip');
      if (!text) return;

      tipEl.textContent = text;
      tipEl.hidden = false;
      tipEl.classList.add('is-visible');
      tipEl.style.visibility = 'hidden';
      tipEl.style.left = '0px';
      tipEl.style.top = '0px';

      const rect = anchor.getBoundingClientRect();
      const align = anchor.getAttribute('data-tip-align');
      const pos = positionToolbarTooltip(rect, {
        width: tipEl.offsetWidth,
        height: tipEl.offsetHeight,
      }, undefined, align ? { align } : undefined);

      tipEl.style.left = `${pos.left}px`;
      tipEl.style.top = `${pos.top}px`;
      tipEl.style.visibility = '';
    }

    function switchAwayFrom(anchor) {
      if (active && active !== anchor) hideNow();
    }

    function show(anchor) {
      if (!anchor || !anchor.getAttribute('data-tip')) return;
      clearTimeout(hideTimer);
      switchAwayFrom(anchor);
      if (active === anchor && tipEl.classList.contains('is-visible')) {
        measureAndPosition(anchor);
        return;
      }
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        if (active && active !== anchor) active.classList.remove('tooltip-active');
        active = anchor;
        anchor.classList.add('tooltip-active');
        measureAndPosition(anchor);
      }, SHOW_DELAY_MS);
    }

    function scheduleHide(anchor) {
      clearTimeout(showTimer);
      hideTimer = setTimeout(() => {
        if (active !== anchor) return;
        hideNow();
      }, HIDE_DELAY_MS);
    }

    function isToolbarTipTarget(node) {
      if (!node || typeof node.closest !== 'function') return false;
      return roots.some((root) => node.closest('[data-tip]') && root.contains(node.closest('[data-tip]')));
    }

    function dismissOnActivate() {
      clearTimers();
      hideNow();
    }

    roots.forEach((root) => {
      root.querySelectorAll('[data-tip]').forEach((btn) => {
        btn.addEventListener('pointerenter', () => show(btn));
        btn.addEventListener('pointerleave', () => scheduleHide(btn));
        btn.addEventListener('focus', () => show(btn));
        btn.addEventListener('blur', () => scheduleHide(btn));
        btn.addEventListener('pointerdown', dismissOnActivate);
        btn.addEventListener('click', dismissOnActivate);
      });

      root.addEventListener('pointerleave', (e) => {
        if (isToolbarTipTarget(e.relatedTarget)) return;
        clearTimers();
        hideNow();
      });

      root.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.dropdown-menu')) return;
        const control = e.target.closest('[data-tip], .dropdown-toggle');
        if (!control) return;
        switchAwayFrom(control);
      }, true);
    });

    window.addEventListener('ao3works-hide-toolbar-tooltip', hideNow);

    window.addEventListener('scroll', () => {
      if (active) measureAndPosition(active);
    }, true);
    window.addEventListener('resize', () => {
      if (active) measureAndPosition(active);
    });
  }

  return { initToolbarTooltips, positionToolbarTooltip };
});
