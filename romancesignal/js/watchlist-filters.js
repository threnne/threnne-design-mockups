/**
 * Watchlist listing - text search + collapsible facet filters.
 */
(function () {
  const panel = document.getElementById('wl-filters');
  const booksWrap = document.getElementById('wl-books-list');
  const statusEl = document.getElementById('wl-filter-status');
  const clearBtn = document.getElementById('wl-filters-clear');
  const searchInput = document.getElementById('wl-filter-search');
  const filtersToggle = document.getElementById('wl-filters-toggle');
  const filtersPanel = document.getElementById('wl-filters-panel');
  const moreToggle = document.getElementById('wl-filters-more-toggle');
  const morePanel = document.getElementById('wl-filters-more');
  if (!panel || !booksWrap) return;

  const totalBooks = Number(booksWrap.dataset.totalBooks || '0');
  const rows = Array.from(booksWrap.querySelectorAll('.wl-book-row[data-wl-filters]'));

  /** @type {Record<string, 'single' | 'multi'>} */
  const controlTypes = {};
  const facetRoot = filtersPanel || panel;
  facetRoot.querySelectorAll('[data-filter-dimension]').forEach((group) => {
    const key = group.getAttribute('data-filter-dimension');
    const control = group.getAttribute('data-filter-control');
    if (key && control) controlTypes[key] = /** @type {'single' | 'multi'} */ (control);
  });

  /** @type {Record<string, string | Set<string>>} */
  let active = {};
  let searchQuery = '';

  function parseFilters(raw) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }

  function scalarVal(filters, key) {
    const val = filters[key];
    if (val == null || val === '') return null;
    if (Array.isArray(val)) return null;
    return val;
  }

  function arrayVal(filters, key) {
    const val = filters[key];
    return Array.isArray(val) ? val : [];
  }

  function dimensionMatches(filters, key, selection) {
    const control = controlTypes[key] || 'single';
    if (control === 'single') {
      const bookVal = scalarVal(filters, key);
      if (bookVal == null) return false;
      return String(bookVal) === selection;
    }
    const bookTags = arrayVal(filters, key);
    if (bookTags.length === 0) return false;
    for (const tag of /** @type {Set<string>} */ (selection)) {
      if (bookTags.includes(tag)) return true;
    }
    return false;
  }

  function rowMatchesFacets(filters) {
    const hasFacetSelection = Object.entries(active).some(([, sel]) => {
      if (sel instanceof Set) return sel.size > 0;
      return Boolean(sel);
    });
    if (!hasFacetSelection) return true;
    if (!filters || Object.keys(filters).length === 0) return false;
    for (const [key, selection] of Object.entries(active)) {
      if (!selection || (selection instanceof Set && selection.size === 0)) continue;
      if (!dimensionMatches(filters, key, selection)) return false;
    }
    return true;
  }

  function rowMatchesSearch(row) {
    if (!searchQuery) return true;
    const haystack = (row.getAttribute('data-wl-search') || '').toLowerCase();
    return haystack.includes(searchQuery);
  }

  function activeFilterCount() {
    let n = 0;
    for (const val of Object.values(active)) {
      if (val instanceof Set) n += val.size;
      else if (val) n += 1;
    }
    return n;
  }

  function syncControlStates() {
    facetRoot.querySelectorAll('.wl-segment__btn[data-dimension]').forEach((btn) => {
      const key = btn.getAttribute('data-dimension');
      const value = btn.getAttribute('data-value');
      if (!key || !value) return;
      const pressed = active[key] === value;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      btn.classList.toggle('wl-segment__btn--active', pressed);
    });

    facetRoot.querySelectorAll('.wl-select[data-dimension]').forEach((select) => {
      const key = select.getAttribute('data-dimension');
      if (!key) return;
      const val = active[key];
      select.value = typeof val === 'string' ? val : '';
    });

    facetRoot.querySelectorAll('.wl-checkgrid input[type="checkbox"][data-dimension]').forEach((input) => {
      const key = input.getAttribute('data-dimension');
      const value = input.getAttribute('data-value');
      if (!key || !value) return;
      const set = active[key];
      input.checked = set instanceof Set && set.has(value);
    });

    if (filtersToggle) {
      const count = activeFilterCount();
      const base = 'Filters';
      filtersToggle.textContent = count > 0 ? `${base} (${count})` : base;
    }
  }

  function resetFormControls() {
    facetRoot.querySelectorAll('.wl-select[data-dimension]').forEach((select) => {
      select.value = '';
    });
    facetRoot.querySelectorAll('.wl-checkgrid input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    facetRoot.querySelectorAll('.wl-segment__btn[data-dimension]').forEach((btn) => {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('wl-segment__btn--active');
    });
    if (searchInput instanceof HTMLInputElement) searchInput.value = '';
    searchQuery = '';
  }

  function setFiltersPanelOpen(open) {
    if (!filtersPanel || !filtersToggle) return;
    filtersPanel.hidden = !open;
    filtersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function updateUrl() {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    for (const [key, val] of Object.entries(active)) {
      if (val instanceof Set) {
        if (val.size > 0) params.set(key, [...val].sort().join(','));
      } else if (val) {
        params.set(key, val);
      }
    }
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', next);
  }

  function applyFilters() {
    let visible = 0;
    rows.forEach((row) => {
      const filters = parseFilters(row.getAttribute('data-wl-filters'));
      const show = rowMatchesSearch(row) && rowMatchesFacets(filters);
      row.hidden = !show;
      if (show) visible += 1;
    });
    if (statusEl) {
      const hasSearch = searchQuery.length > 0;
      const hasFacets = activeFilterCount() > 0;
      if (visible === totalBooks && !hasSearch && !hasFacets) {
        statusEl.textContent = `Showing all ${totalBooks} books.`;
      } else {
        statusEl.textContent = `Showing ${visible} of ${totalBooks} books.`;
      }
    }
    syncControlStates();
    updateUrl();
  }

  function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      searchQuery = q.trim().toLowerCase();
      if (searchInput instanceof HTMLInputElement) searchInput.value = q.trim();
    }

    /** @type {Record<string, string | Set<string>>} */
    const next = {};
    for (const key of Object.keys(controlTypes)) {
      const raw = params.get(key);
      if (!raw) continue;
      if (controlTypes[key] === 'multi') {
        next[key] = new Set(raw.split(',').filter(Boolean));
      } else {
        next[key] = raw;
      }
    }
    active = next;

    if (filtersPanel && activeFilterCount() > 0) {
      setFiltersPanelOpen(true);
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      applyFilters();
    });
  }

  if (filtersToggle && filtersPanel) {
    filtersToggle.addEventListener('click', () => {
      setFiltersPanelOpen(filtersPanel.hidden);
    });
  }

  facetRoot.addEventListener('click', (event) => {
    const btn = event.target.closest('.wl-segment__btn[data-dimension]');
    if (!btn) return;
    const key = btn.getAttribute('data-dimension');
    const value = btn.getAttribute('data-value');
    if (!key || !value) return;

    if (active[key] === value) {
      delete active[key];
    } else {
      active[key] = value;
    }
    applyFilters();
  });

  facetRoot.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;

    const key = target.getAttribute('data-dimension');
    if (!key) return;

    if (target instanceof HTMLSelectElement) {
      if (target.value) active[key] = target.value;
      else delete active[key];
      applyFilters();
      return;
    }

    if (target.type !== 'checkbox') return;
    const value = target.getAttribute('data-value');
    if (!value) return;

    const set = active[key] instanceof Set ? new Set(active[key]) : new Set();
    if (target.checked) set.add(value);
    else set.delete(value);
    if (set.size === 0) delete active[key];
    else active[key] = set;
    applyFilters();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      active = {};
      resetFormControls();
      setFiltersPanelOpen(false);
      applyFilters();
    });
  }

  if (moreToggle && morePanel) {
    moreToggle.addEventListener('click', () => {
      const open = morePanel.hidden;
      morePanel.hidden = !open;
      moreToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  loadFromUrl();
  applyFilters();
})();
