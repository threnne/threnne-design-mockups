// ============================================================
// AO3 Works — src/lib/header-responsive.js
// Progressive header collapse: proxy items in ⋯ menu (no DOM reparent).
// Dual module: CommonJS + window.ao3worksHeaderResponsive
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksHeaderResponsive = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const MOBILE_MAX = 640;
  const GAP_PX = 8;
  /** Theme collapses last (rank 7); uses proxy-modal in ⋯ when off the bar. */
  const THEME_COLLAPSE_RANK = '7';
  /** Visual order in the actions bar (not collapse order). */
  const BAR_RANK_ORDER = ['5', '6', '7', '3', '2', '1', '4'];
  /** Collapse rank 1 first (Tour), … 7 last (Theme). */
  const COLLAPSE_RANKS = ['1', '2', '3', '4', '5', '6', '7'];
  /** Ranks that may appear as proxy items in the ⋯ menu. */
  const OVERFLOW_MENU_RANKS = [...COLLAPSE_RANKS];
  /**
   * Viewport width tiers: at or above minWidth, only ranks listed are forced
   * into overflow (cumulative). Theme (7) is last in the collapse sequence.
   */
  const WIDTH_STEPS = [
    { minWidth: 1280, overflowRanks: [] },
    { minWidth: 1080, overflowRanks: ['1'] },
    { minWidth: 980, overflowRanks: ['1', '2'] },
    { minWidth: 900, overflowRanks: ['1', '2', '3'] },
    { minWidth: 820, overflowRanks: ['1', '2', '3', '4'] },
    { minWidth: 760, overflowRanks: ['1', '2', '3', '4', '5'] },
    { minWidth: 700, overflowRanks: ['1', '2', '3', '4', '5', '6'] },
    { minWidth: 641, overflowRanks: [...OVERFLOW_MENU_RANKS] },
  ].sort((a, b) => b.minWidth - a.minWidth);

  /**
   * @param {Element} el
   * @returns {Element|null}
   */
  function getTriggerElement(el) {
    if (!el) return null;
    if (el.matches('button[id], .dropdown-toggle[id]')) return el;
    return el.querySelector('button[id], .dropdown-toggle[id]');
  }

  /**
   * @param {Element} el
   * @returns {{
   *   rank: string,
   *   policy: string,
   *   triggerId: string,
   *   label: string,
   *   accent: string,
   *   el: Element,
   *   trigger: Element|null,
   * }}
   */
  function getOverflowMeta(el) {
    const rank = el.getAttribute('data-collapse-rank') || '';
    const policy = el.getAttribute('data-overflow-policy') || 'proxy';
    const trigger = getTriggerElement(el);
    const triggerId = trigger?.id || '';
    const label =
      el.getAttribute('data-overflow-label')
      || trigger?.getAttribute('aria-label')
      || (trigger?.textContent || '').trim()
      || '';
    const accent = el.getAttribute('data-overflow-accent') || '';
    return { rank, policy, triggerId, label, accent, el, trigger };
  }

  /**
   * @param {Element[]} collapsibles
   * @returns {Map<string, ReturnType<typeof getOverflowMeta>>}
   */
  function buildOverflowRegistry(collapsibles) {
    const map = new Map();
    collapsibles.forEach((el) => {
      const meta = getOverflowMeta(el);
      if (meta.rank) map.set(meta.rank, meta);
    });
    return map;
  }

  function goesToOverflowMenu(el) {
    const policy = el?.getAttribute('data-overflow-policy') || 'proxy';
    return policy !== 'hide';
  }

  function usesProxyOverflow(el) {
    const policy = el?.getAttribute('data-overflow-policy') || 'proxy';
    return policy === 'proxy' || policy === 'proxy-modal';
  }

  function getOverflowRanksForWidth(viewportWidth) {
    if (viewportWidth <= MOBILE_MAX) return [...OVERFLOW_MENU_RANKS];
    for (let i = 0; i < WIDTH_STEPS.length; i += 1) {
      if (viewportWidth >= WIDTH_STEPS[i].minWidth) {
        return [...WIDTH_STEPS[i].overflowRanks];
      }
    }
    return [...OVERFLOW_MENU_RANKS];
  }

  function initHeaderResponsive(options) {
    const header = (options && options.header) || document.querySelector('.app-header.aw-header-v2');
    if (!header) return;

    const headerRight = header.querySelector('.header-right');
    const actions = header.querySelector('.aw-header-actions');
    const overflowSlot = header.querySelector('[data-overflow-slot]');
    const overflowDropdown = header.querySelector('.aw-header-overflow');
    const exportWrap = header.querySelector('.aw-header-export-wrap');
    if (!headerRight || !actions || !overflowSlot || !overflowDropdown || !exportWrap) return;

    const collapsibles = BAR_RANK_ORDER
      .map((rank) => header.querySelector(`.aw-header-collapsible[data-collapse-rank="${rank}"]`))
      .filter(Boolean);

    const registry = buildOverflowRegistry(collapsibles);

    /** @type {Set<string>} */
    let collapsedRanks = new Set();
    let layoutQueued = false;
    let proxyClickBound = false;

    function isMobile() {
      return window.innerWidth <= MOBILE_MAX;
    }

    function closeOverflowMenu() {
      overflowDropdown.classList.remove('open');
      const toggle = overflowDropdown.querySelector('.dropdown-toggle');
      if (toggle?.hasAttribute('aria-haspopup')) {
        toggle.setAttribute('aria-expanded', 'false');
      }
      const menu = overflowDropdown.querySelector('.dropdown-menu');
      if (menu && window.ao3worksDropdownViewport?.resetDropdownMenuPosition) {
        window.ao3worksDropdownViewport.resetDropdownMenuPosition(menu);
      }
    }

    function bindProxyClicks() {
      if (proxyClickBound) return;
      proxyClickBound = true;
      overflowSlot.addEventListener('click', (e) => {
        const proxy = e.target.closest('[data-overflow-proxy]');
        if (!proxy) return;
        e.stopPropagation();
        const targetId = proxy.getAttribute('data-overflow-proxy');
        const target = targetId ? document.getElementById(targetId) : null;
        closeOverflowMenu();
        if (target) target.click();
      });
    }

    function restoreBarOrder() {
      BAR_RANK_ORDER.forEach((rank) => {
        const el = header.querySelector(`.aw-header-collapsible[data-collapse-rank="${rank}"]`);
        if (el && !actions.contains(el)) actions.appendChild(el);
      });
      collapsibles.forEach((el) => {
        el.classList.remove('is-overflowed', 'is-bar-hidden');
      });
      overflowSlot.querySelectorAll('[data-overflow-proxy]').forEach((node) => node.remove());
      collapsedRanks = new Set();
    }

    function collapseRank(rank) {
      const meta = registry.get(rank);
      if (!meta) return;
      if (meta.policy === 'hide') {
        meta.el.classList.add('is-bar-hidden');
        meta.el.classList.remove('is-overflowed');
        return;
      }
      collapsedRanks.add(rank);
      meta.el.classList.add('is-bar-hidden');
      meta.el.classList.remove('is-overflowed');
    }

    function syncOverflowProxies() {
      overflowSlot.querySelectorAll('[data-overflow-proxy]').forEach((node) => node.remove());

      const sorted = [...collapsedRanks].sort((a, b) => Number(a) - Number(b));
      sorted.forEach((rank) => {
        const meta = registry.get(rank);
        if (!meta || meta.policy === 'hide') return;

        meta.el.classList.add('is-bar-hidden');
        meta.el.classList.remove('is-overflowed');

        if (!meta.triggerId) return;

        const proxy = document.createElement('button');
        proxy.type = 'button';
        proxy.className = 'dropdown-item aw-header-overflow-proxy';
        if (meta.accent) proxy.classList.add(`aw-overflow-proxy--${meta.accent}`);
        proxy.setAttribute('role', 'menuitem');
        proxy.setAttribute('data-overflow-proxy', meta.triggerId);
        proxy.setAttribute('data-collapse-rank', rank);
        if (meta.policy === 'proxy-modal') {
          proxy.setAttribute('data-overflow-policy', 'proxy-modal');
        }
        proxy.textContent = meta.label;
        const tip = meta.trigger?.getAttribute('data-tip');
        if (tip) proxy.setAttribute('data-tip', tip);

        overflowSlot.appendChild(proxy);
      });

      registry.forEach((meta, rank) => {
        if (collapsedRanks.has(rank)) return;
        if (meta.el.classList.contains('is-bar-hidden') && meta.policy !== 'hide') {
          meta.el.classList.remove('is-bar-hidden');
        }
      });
    }

    function inBar() {
      return collapsibles.filter((el) => {
        if (!actions.contains(el) || el.classList.contains('is-bar-hidden')) return false;
        const rank = el.getAttribute('data-collapse-rank');
        if (rank && collapsedRanks.has(rank)) return false;
        return true;
      });
    }

    function measureBarWidth() {
      let total = 0;
      inBar().forEach((el) => {
        total += el.offsetWidth + GAP_PX;
      });
      return Math.max(0, total - GAP_PX);
    }

    /** Width allotted to the actions nav (flex child), not the whole header-right. */
    function availableBudget() {
      const width = actions.clientWidth;
      if (width > 0) return width;
      let reserved = 0;
      [...headerRight.children].forEach((child) => {
        if (child === actions) return;
        reserved += child.offsetWidth + GAP_PX;
      });
      return Math.max(0, headerRight.clientWidth - reserved);
    }

    function applyForcedOverflow(rankSet) {
      const force = new Set(rankSet);
      registry.forEach((meta, rank) => {
        if (!force.has(rank)) return;
        collapseRank(rank);
      });
    }

    function collapseNextInBar() {
      const barItems = inBar();
      if (barItems.length === 0) return false;
      const victim = barItems.sort(
        (a, b) => Number(a.getAttribute('data-collapse-rank')) - Number(b.getAttribute('data-collapse-rank'))
      )[0];
      const rank = victim.getAttribute('data-collapse-rank');
      if (!rank) return false;
      collapseRank(rank);
      return true;
    }

    function updateChromeState() {
      const hasOverflowItems = overflowSlot.children.length > 0;
      const themeWrap = registry.get(THEME_COLLAPSE_RANK)?.el;
      header.classList.toggle('aw-header--compact', isMobile());
      header.classList.toggle('aw-header--has-overflow', hasOverflowItems);
      header.classList.toggle(
        'aw-header--theme-hidden',
        Boolean(themeWrap?.classList.contains('is-bar-hidden'))
      );
      header.dataset.headerVisibleCount = String(inBar().length);
    }

    function layout() {
      restoreBarOrder();

      const forced = getOverflowRanksForWidth(window.innerWidth);
      applyForcedOverflow(forced);

      let guard = 0;
      const budget = () => availableBudget();
      while (measureBarWidth() > budget() + 1 && guard < collapsibles.length + 2) {
        guard += 1;
        if (!collapseNextInBar()) break;
      }

      syncOverflowProxies();
      updateChromeState();
    }

    function queueLayout() {
      if (layoutQueued) return;
      layoutQueued = true;
      requestAnimationFrame(() => {
        layoutQueued = false;
        layout();
      });
    }

    bindProxyClicks();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(queueLayout);
      ro.observe(header);
      ro.observe(headerRight);
    }
    window.addEventListener('resize', queueLayout, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(queueLayout).catch(() => {});
    }
    queueLayout();
  }

  return {
    initHeaderResponsive,
    MOBILE_MAX,
    BAR_RANK_ORDER,
    THEME_COLLAPSE_RANK,
    OVERFLOW_MENU_RANKS,
    WIDTH_STEPS,
    getOverflowRanksForWidth,
    goesToOverflowMenu,
    usesProxyOverflow,
    getOverflowMeta,
    buildOverflowRegistry,
    getTriggerElement,
  };
});
