/**
 * Background page - comparison table filter, sort, expand.
 * Rows are SSR'd; this script toggles visibility and order.
 */
(function () {
  const tbody = document.getElementById('bg-tbody');
  const statusEl = document.getElementById('bg-table-status');
  const searchInput = document.getElementById('bg-search');
  const filterWrap = document.getElementById('bg-filters');
  if (!tbody || !filterWrap) return;

  const categories = Array.from(filterWrap.querySelectorAll('.bg-chip')).map((b) => b.dataset.cat);
  let active = new Set(categories);
  let query = '';
  let sortKey = 'category';
  let sortDir = 'asc';
  const openRows = new Set();

  function pairs() {
    /** @type {Array<{ data: HTMLTableRowElement, detail: HTMLTableRowElement | null }>} */
    const out = [];
    const dataRows = tbody.querySelectorAll('.bg-data-row');
    dataRows.forEach((data) => {
      const id = data.dataset.id;
      const detail = id ? tbody.querySelector(`tr.bg-detail-row[data-detail="${id}"]`) : null;
      out.push({ data, detail });
    });
    return out;
  }

  function updateStatus(visible) {
    if (!statusEl) return;
    const n = visible.length;
    statusEl.textContent = n === 1 ? '1 row shown.' : `${n} rows shown.`;
  }

  function rowMatches(pair) {
    const r = pair.data;
    const cat = r.dataset.category || '';
    if (!active.has(cat)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    const pub = r.querySelector('.bg-acq-cell .bg-cell-summary');
    const hol = r.querySelector('.bg-scout-cell .bg-cell-summary');
    return (
      cat.toLowerCase().includes(q) ||
      (r.dataset.dimension || '').toLowerCase().includes(q) ||
      (pub?.textContent || '').toLowerCase().includes(q) ||
      (hol?.textContent || '').toLowerCase().includes(q)
    );
  }

  function sortValue(pair, key) {
    const r = pair.data;
    if (key === 'pubMetric') return Number(r.dataset.pubMetric) || 0;
    if (key === 'hwMetric') return Number(r.dataset.hwMetric) || 0;
    if (key === 'dimension') return r.dataset.dimension || '';
    return r.dataset.category || '';
  }

  function applySort(list) {
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function syncExpandButtons() {
    tbody.querySelectorAll('.bg-expand-btn').forEach((btn) => {
      const id = btn.getAttribute('data-expand');
      const open = id && openRows.has(id);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      const icon = btn.querySelector('[aria-hidden="true"]');
      if (icon) icon.textContent = open ? '−' : '+';
    });
  }

  function renderTable() {
    const all = pairs();
    const visible = all.filter(rowMatches);
    applySort(visible);

    all.forEach((p) => {
      p.data.classList.add('bg-row-hidden');
      if (p.detail) p.detail.classList.add('bg-row-hidden');
    });

    visible.forEach((p) => {
      p.data.classList.remove('bg-row-hidden');
      if (p.detail) {
        p.detail.classList.remove('bg-row-hidden');
        const id = p.data.dataset.id;
        const open = id && openRows.has(id);
        if (open) {
          p.detail.removeAttribute('hidden');
        } else {
          p.detail.setAttribute('hidden', '');
        }
      }
      tbody.appendChild(p.data);
      if (p.detail) tbody.appendChild(p.detail);
    });

    syncExpandButtons();
    updateStatus(visible);
  }

  function updateSortAria() {
    document.querySelectorAll('#bg-comparison-table th button[data-sort]').forEach((btn) => {
      const k = btn.getAttribute('data-sort');
      if (k === sortKey) {
        btn.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      } else {
        btn.setAttribute('aria-sort', 'none');
      }
    });
  }

  filterWrap.querySelectorAll('.bg-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.cat;
      if (!c) return;
      if (active.has(c)) {
        active.delete(c);
        btn.setAttribute('aria-pressed', 'false');
      } else {
        active.add(c);
        btn.setAttribute('aria-pressed', 'true');
      }
      if (active.size === 0) {
        active = new Set(categories);
        filterWrap.querySelectorAll('.bg-chip').forEach((b) => b.setAttribute('aria-pressed', 'true'));
      }
      renderTable();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      query = searchInput.value.trim().toLowerCase();
      renderTable();
    });
  }

  document.querySelectorAll('#bg-comparison-table th button[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-sort');
      if (!k) return;
      if (sortKey === k) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = k;
        sortDir = 'asc';
      }
      updateSortAria();
      renderTable();
    });
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.bg-expand-btn');
    if (!btn) return;
    const id = btn.getAttribute('data-expand');
    if (!id) return;
    if (openRows.has(id)) openRows.delete(id);
    else openRows.add(id);
    renderTable();
  });

  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const btn = e.target.closest('.bg-expand-btn');
    if (!btn) return;
    e.preventDefault();
    btn.click();
  });

  updateSortAria();
  renderTable();
})();
