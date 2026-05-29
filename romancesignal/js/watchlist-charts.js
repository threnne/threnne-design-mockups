/**
 * Watchlist book detail charts: data-fit domain, adaptive x-ticks, in-bounds peak
 * callout, hover crosshair, and scroll-reveal line draw.
 * Server renders an initial SVG; this engine re-layouts from the embedded config
 * so geometry (padding, markers, callouts, ticks) is corrected on the client and
 * stays correct across range changes.
 */
(function () {
  const MS_PER_DAY = 86400000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Generous internal padding so markers, peak rings and callouts never clip.
  const PAD = { L: 58, R: 30, T: 30, B: 46 };

  function parseDateMs(iso) {
    return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  }

  function chartTickGranularity(minMs, maxMs) {
    const spanDays = (maxMs - minMs) / MS_PER_DAY;
    if (spanDays > 400) return 'year';
    if (spanDays > 45) return 'month';
    return 'day';
  }

  function formatAxisYear(iso) {
    return iso.slice(0, 4);
  }
  function formatAxisDate(iso) {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  function formatAxisDay(iso) {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function formatTickLabel(iso, granularity) {
    if (granularity === 'year') return formatAxisYear(iso);
    if (granularity === 'month') return formatAxisDate(iso);
    return formatAxisDay(iso);
  }

  function thinTicks(ticks, maxTicks) {
    if (ticks.length <= maxTicks) return ticks;
    const step = Math.ceil(ticks.length / maxTicks);
    const out = [];
    for (let i = 0; i < ticks.length; i += step) out.push(ticks[i]);
    const last = ticks[ticks.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }

  function selectMonthTicks(minMs, maxMs, maxTicks) {
    const minDate = new Date(minMs);
    const maxDate = new Date(maxMs);
    let y = minDate.getUTCFullYear();
    let m = minDate.getUTCMonth();
    const endY = maxDate.getUTCFullYear();
    const endM = maxDate.getUTCMonth();
    const ticks = [];
    while (y < endY || (y === endY && m <= endM)) {
      ticks.push(`${y}-${String(m + 1).padStart(2, '0')}-01`);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return thinTicks(ticks, maxTicks);
  }

  function selectYearTicks(seriesDates, minMs, maxMs, maxTicks) {
    const sorted = [...new Set(seriesDates)].sort();
    const minYear = new Date(minMs).getUTCFullYear();
    const maxYear = new Date(maxMs).getUTCFullYear();
    const yearTicks = [];
    for (let yr = minYear; yr <= maxYear; yr += 1) {
      const match = sorted.find((d) => d.slice(0, 4) === String(yr));
      yearTicks.push(match || `${yr}-06-01`);
    }
    return thinTicks(yearTicks, maxTicks);
  }

  function selectDayTicks(seriesDates, minMs, maxMs, maxTicks) {
    const sorted = [...new Set(seriesDates)].sort();
    if (sorted.length === 0) return [];
    const minYear = new Date(minMs).getUTCFullYear();
    const maxYear = new Date(maxMs).getUTCFullYear();
    if (maxYear > minYear) return selectYearTicks(seriesDates, minMs, maxMs, maxTicks);
    if (sorted.length <= maxTicks) return sorted;
    const out = [];
    for (let i = 0; i < maxTicks; i += 1) {
      const idx = Math.round((i / (maxTicks - 1)) * (sorted.length - 1));
      out.push(sorted[Math.min(idx, sorted.length - 1)]);
    }
    return out;
  }

  function selectXTickDates(seriesDates, minMs, maxMs) {
    const g = chartTickGranularity(minMs, maxMs);
    if (g === 'month') return selectMonthTicks(minMs, maxMs, 7);
    if (g === 'year') return selectYearTicks(seriesDates, minMs, maxMs, 8);
    return selectDayTicks(seriesDates, minMs, maxMs, 7);
  }

  function logRank(rank) {
    return Math.log10(Math.max(1, rank));
  }

  function xAt(dateMs, minMs, maxMs, layout) {
    const span = maxMs - minMs || 1;
    const t = (dateMs - minMs) / span;
    return layout.padL + t * layout.plotW;
  }
  function yAtLinear(value, minY, maxY, layout) {
    const span = maxY - minY || 1;
    const t = (value - minY) / span;
    return layout.padT + layout.plotH - t * layout.plotH;
  }
  function yAtLog(rank, minY, maxY, layout) {
    const span = logRank(maxY) - logRank(minY) || 1;
    const t = (logRank(rank) - logRank(minY)) / span;
    return layout.padT + t * layout.plotH;
  }
  function yAt(value, minY, maxY, layout, yScale) {
    return yScale === 'log' ? yAtLog(value, minY, maxY, layout) : yAtLinear(value, minY, maxY, layout);
  }

  function buildPathD(points, minMs, maxMs, minY, maxY, layout, yScale) {
    if (!points.length) return '';
    return points
      .map((p, i) => {
        const x = xAt(parseDateMs(p.date), minMs, maxMs, layout);
        const y = yAt(p.y, minY, maxY, layout, yScale);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function readConfig(chartEl) {
    const script = chartEl.querySelector('[data-wl-chart-config]');
    if (!script) return null;
    try {
      return JSON.parse(script.textContent || '{}');
    } catch {
      return null;
    }
  }

  /* ---- Geometry normalisation -------------------------------------------- */
  // Recompute layout from the SVG's own viewBox using generous padding, and
  // rebuild the static chrome (axes + y gridlines) so everything fits.
  function normalizeChart(chartEl, config) {
    const svg = chartEl.querySelector('svg');
    if (!svg) return;
    const vb = (svg.getAttribute('viewBox') || `0 0 ${config.w} ${config.h}`).split(/\s+/).map(Number);
    const w = vb[2] || config.w;
    const h = vb[3] || config.h;
    const layout = {
      padL: PAD.L, padR: PAD.R, padT: PAD.T, padB: PAD.B,
      plotW: w - PAD.L - PAD.R,
      plotH: h - PAD.T - PAD.B,
    };
    config.w = w;
    config.h = h;
    config.layout = layout;

    // For linear charts, snap the axis floor to a clean rounded value so the
    // bottom label reads e.g. "0" or "2K" instead of a raw minimum like "163".
    if ((config.yScale || 'linear') !== 'log' && typeof config.minY === 'number') {
      const span = (config.maxY - config.minY) || 1;
      const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
      const niceFloor = config.minY <= step ? 0 : Math.floor(config.minY / step) * step;
      if (niceFloor < config.minY) config.minY = niceFloor;
    }

    // Rebuild Y axis line + gridlines/labels for the (possibly) new plot box.
    rebuildYAxis(chartEl, config);
  }

  function niceLinearTicks(minY, maxY, count) {
    const span = maxY - minY || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
    step *= mag;
    const start = Math.ceil(minY / step) * step;
    const ticks = [];
    for (let v = start; v <= maxY + 1e-6; v += step) ticks.push(v);
    if (ticks[0] > minY) ticks.unshift(minY);
    return ticks;
  }

  function formatNumberShort(n) {
    const abs = Math.abs(n);
    if (abs >= 1000000) return (n / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (abs >= 1000) return (n / 1000).toFixed(abs >= 100000 ? 0 : abs >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }

  function rebuildYAxis(chartEl, config) {
    const svg = chartEl.querySelector('svg');
    if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg';
    const L = config.layout;
    const plotRight = L.padL + L.plotW;
    const plotBottom = L.padT + L.plotH;

    // X axis baseline
    let xaxis = svg.querySelector('[data-wl-xaxis]');
    if (!xaxis) {
      xaxis = svg.querySelector('line');
      if (xaxis) xaxis.setAttribute('data-wl-xaxis', '');
    }
    if (xaxis) {
      xaxis.setAttribute('x1', L.padL); xaxis.setAttribute('x2', plotRight);
      xaxis.setAttribute('y1', plotBottom); xaxis.setAttribute('y2', plotBottom);
    }

    // Y gridline group: clear and rebuild
    let grid = svg.querySelector('[data-wl-ygrid]');
    if (!grid) {
      grid = document.createElementNS(ns, 'g');
      grid.setAttribute('data-wl-ygrid', '');
      // insert before the first data path so lines sit behind data
      const firstPath = svg.querySelector('path[data-wl-path]');
      svg.insertBefore(grid, firstPath || null);
      // remove legacy server-rendered gridline <g> blocks (the ones with dashed lines + axis labels)
      svg.querySelectorAll('g').forEach((g) => {
        if (g === grid) return;
        if (g.hasAttribute('data-wl-chart-peak')) return;
        const ln = g.querySelector('line');
        const tx = g.querySelector('text');
        if (ln && tx && ln.getAttribute('stroke') && ln.getAttribute('stroke').includes('border')) {
          g.remove();
        }
      });
    }
    grid.replaceChildren();

    const yScale = config.yScale || 'linear';
    let levels;
    if (yScale === 'log') {
      levels = [];
      const lo = Math.floor(logRank(config.minY));
      const hi = Math.ceil(logRank(config.maxY));
      for (let e = lo; e <= hi; e += 1) levels.push(Math.pow(10, e));
    } else {
      levels = niceLinearTicks(config.minY, config.maxY, 4);
    }

    for (const lv of levels) {
      const y = yAt(lv, config.minY, config.maxY, L, yScale);
      if (y < L.padT - 0.5 || y > plotBottom + 0.5) continue;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', L.padL); line.setAttribute('x2', plotRight);
      line.setAttribute('y1', y.toFixed(2)); line.setAttribute('y2', y.toFixed(2));
      line.setAttribute('stroke', 'var(--color-border)');
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('stroke-dasharray', Math.abs(y - plotBottom) < 0.5 ? '0' : '2,3');
      grid.appendChild(line);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', L.padL - 8);
      text.setAttribute('y', (y + 3).toFixed(2));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('font-size', '9');
      text.setAttribute('fill', 'var(--color-text-faint)');
      text.textContent = yScale === 'log' ? '#' + formatNumberShort(lv) : formatNumberShort(lv);
      grid.appendChild(text);
    }

    // Reposition the rotated Y-axis title and X-axis "Date" caption
    svg.querySelectorAll('text').forEach((t) => {
      const tr = t.getAttribute('transform') || '';
      if (tr.includes('rotate(-90')) {
        const cy = (L.padT + plotBottom) / 2;
        t.setAttribute('x', 14);
        t.setAttribute('y', cy);
        t.setAttribute('transform', `rotate(-90 14 ${cy})`);
      } else if ((t.textContent || '').trim() === 'Date') {
        t.setAttribute('x', (L.padL + plotRight) / 2);
        t.setAttribute('y', config.h - 6);
      }
    });
  }

  function renderXTicks(chartEl, config, minMs, maxMs) {
    let group = chartEl.querySelector('[data-wl-chart-x-ticks]');
    const svg = chartEl.querySelector('svg');
    if (!group && svg) {
      group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('data-wl-chart-x-ticks', '');
      svg.appendChild(group);
    }
    if (!group || !config) return;
    const granularity = chartTickGranularity(minMs, maxMs);
    let ticks = selectXTickDates(config.seriesDates || [], minMs, maxMs);
    const L = config.layout;
    const plotRight = L.padL + L.plotW;
    const y = (L.padT + L.plotH) + 18;
    const svgNs = 'http://www.w3.org/2000/svg';
    group.replaceChildren();

    // Drop ticks that fall outside the visible domain (avoids stray pre-data labels).
    ticks = ticks.filter((d) => {
      const ms = parseDateMs(d);
      return ms >= minMs - MS_PER_DAY && ms <= maxMs + MS_PER_DAY;
    });

    // Suppress collisions: skip a tick if it lands too close to the previous one.
    const MIN_GAP = granularity === 'year' ? 44 : 46;
    let lastX = -Infinity;
    ticks.forEach((d, i) => {
      let x = xAt(parseDateMs(d), minMs, maxMs, L);
      const isFirst = i === 0;
      const isLast = i === ticks.length - 1;
      let anchor = 'middle';
      if (isFirst) { anchor = 'start'; x = Math.max(x, L.padL); }
      else if (isLast) { anchor = 'end'; x = Math.min(x, plotRight); }
      // collision guard (never drop the last tick; instead drop the prior crowding one)
      if (!isLast && x - lastX < MIN_GAP && !isFirst) return;
      if (isLast && x - lastX < MIN_GAP) {
        // remove the previously placed label so the end label wins
        const prev = group.lastChild;
        if (prev) group.removeChild(prev);
      }
      const text = document.createElementNS(svgNs, 'text');
      text.setAttribute('x', String(x.toFixed(1)));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', anchor);
      text.setAttribute('font-size', granularity === 'year' ? '10' : '9');
      text.setAttribute('fill', 'var(--color-text-faint)');
      text.textContent = formatTickLabel(d, granularity);
      group.appendChild(text);
      lastX = x;
    });
  }

  // Place the peak callout fully inside the plot, flipping the leader toward
  // open space when the peak sits near the top or right edge.
  function placePeak(peakGroup, px, py, config) {
    const L = config.layout;
    const plotRight = L.padL + L.plotW;
    const circle = peakGroup.querySelector('circle');
    const line = peakGroup.querySelector('line');
    const text = peakGroup.querySelector('text');
    if (circle) { circle.setAttribute('cx', String(px)); circle.setAttribute('cy', String(py)); }

    const nearTop = py < L.padT + 34;
    const nearRight = px > plotRight - 90;
    const dx = nearRight ? -44 : 44;
    const dy = nearTop ? 24 : -24; // point down if near top, else up
    const lx2 = px + dx;
    const ly2 = py + dy;
    if (line) {
      line.setAttribute('x1', String(px));
      line.setAttribute('y1', String(py + (nearTop ? 8 : -8)));
      line.setAttribute('x2', String(lx2));
      line.setAttribute('y2', String(ly2));
    }
    if (text) {
      const tx = nearRight ? lx2 - 4 : lx2 + 4;
      text.setAttribute('x', String(tx));
      text.setAttribute('y', String(ly2 + (nearTop ? 3 : 0)));
      text.setAttribute('text-anchor', nearRight ? 'end' : 'start');
    }
  }

  function applyDomain(chartEl, minMs, maxMs) {
    const config = chartEl._wlConfig || readConfig(chartEl);
    if (!config) return;
    chartEl.dataset.domainMin = String(minMs);
    chartEl.dataset.domainMax = String(maxMs);

    const yScale = config.yScale || 'linear';
    for (const pathCfg of config.paths || []) {
      const pathEl = chartEl.querySelector(pathCfg.selector);
      if (!pathEl) continue;
      pathEl.setAttribute('d', buildPathD(pathCfg.points, minMs, maxMs, config.minY, config.maxY, config.layout, yScale));
    }

    for (const pt of config.hoverPoints || []) {
      const el = chartEl.querySelector(`[data-wl-hover-date="${pt.date}"]`);
      if (!el) continue;
      const cx = xAt(parseDateMs(pt.date), minMs, maxMs, config.layout);
      const cy = yAt(pt.y, config.minY, config.maxY, config.layout, yScale);
      el.setAttribute('cx', String(cx));
      el.setAttribute('cy', String(cy));
      if (el.tagName === 'g') {
        el.querySelectorAll('circle').forEach((c) => {
          c.setAttribute('cx', String(cx));
          c.setAttribute('cy', String(cy));
        });
      }
    }

    const peakGroup = chartEl.querySelector('[data-wl-chart-peak]');
    if (peakGroup && config.peak) {
      const px = xAt(parseDateMs(config.peak.date), minMs, maxMs, config.layout);
      const py = yAt(config.peak.y, config.minY, config.maxY, config.layout, yScale);
      const inView = px >= config.layout.padL - 1 && px <= config.layout.padL + config.layout.plotW + 1;
      peakGroup.setAttribute('visibility', inView ? 'visible' : 'hidden');
      if (inView) placePeak(peakGroup, px, py, config);
    }

    renderXTicks(chartEl, config, minMs, maxMs);
  }

  function getDomain(root) {
    return {
      minMs: Number(root.dataset.fullMin),
      maxMs: Number(root.dataset.fullMax),
      chartStart: root.dataset.chartStart || '',
    };
  }

  function setRangeLabel(root, label) {
    const el = root.querySelector('[data-wl-range-label]');
    if (el) el.textContent = label;
  }

  function applyRangeToAll(root, minMs, maxMs, label) {
    root.querySelectorAll('[data-wl-chart]').forEach((chart) => applyDomain(chart, minMs, maxMs));
    setRangeLabel(root, label);
    root.dataset.activeMin = String(minMs);
    root.dataset.activeMax = String(maxMs);
  }

  // Data-driven extent for a single chart's own series.
  function chartExtent(chart) {
    const cfg = chart._wlConfig || readConfig(chart);
    let min = Infinity, max = -Infinity;
    (cfg.seriesDates || []).forEach((d) => {
      const ms = parseDateMs(d);
      if (ms < min) min = ms;
      if (ms > max) max = ms;
    });
    if (!isFinite(min)) return null;
    const span = max - min || MS_PER_DAY * 30;
    // pad both edges so first/last markers + peak callout have breathing room
    return { minMs: min - span * 0.015, maxMs: max + span * 0.04 };
  }

  // Fit each chart to its OWN data span (default view). Syncing every chart to
  // the widest signal crammed short-window signals (e.g. Wikipedia) into a
  // sliver; per-chart fit makes each timeline readable on its own terms.
  function applyFitToAll(root, label) {
    root.querySelectorAll('[data-wl-chart]').forEach((chart) => {
      const ext = chartExtent(chart);
      if (ext) applyDomain(chart, ext.minMs, ext.maxMs);
    });
    setRangeLabel(root, label);
  }

  function initRangeBar(root) {
    const full = getDomain(root);

    root.querySelectorAll('[data-wl-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const range = btn.getAttribute('data-wl-range');
        root.querySelectorAll('[data-wl-range]').forEach((b) => {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        if (range === 'all') {
          // "All" fits each chart to its own data span (no empty backfill window).
          applyFitToAll(root, 'All data');
          return;
        }
        const year = Number(range);
        const yStart = parseDateMs(`${year}-01-01`);
        const yEnd = parseDateMs(`${year}-12-31`);
        const minMs = Math.max(full.minMs, yStart);
        const maxMs = Math.min(full.maxMs, yEnd);
        applyRangeToAll(root, minMs, Math.max(minMs, maxMs), `Viewing ${year}`);
      });
    });

    // Default view: each chart fit to its own data so none is crammed into a corner.
    applyFitToAll(root, 'All data');
    const allBtn = root.querySelector('[data-wl-range="all"]');
    if (allBtn) {
      root.querySelectorAll('[data-wl-range]').forEach((b) => b.setAttribute('aria-pressed', b === allBtn ? 'true' : 'false'));
    }
  }

  function nearestPoint(hoverPoints, dateMs) {
    let best = null, bestDist = Infinity;
    for (const p of hoverPoints) {
      const d = Math.abs(parseDateMs(p.date) - dateMs);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }

  function initHover(chartEl) {
    const config = chartEl._wlConfig || readConfig(chartEl);
    if (!config || !config.hoverPoints?.length) return;

    const svg = chartEl.querySelector('svg');
    const overlay = chartEl.querySelector('[data-wl-chart-overlay]');
    const crosshair = chartEl.querySelector('[data-wl-chart-crosshair]');
    const tooltip = chartEl.querySelector('[data-wl-chart-tooltip]');
    if (!svg || !overlay || !crosshair || !tooltip) return;

    // Keep the overlay rect aligned with the (new) plot box.
    const L = config.layout;
    overlay.setAttribute('x', L.padL);
    overlay.setAttribute('y', L.padT);
    overlay.setAttribute('width', L.plotW);
    overlay.setAttribute('height', L.plotH);

    function onMove(evt) {
      const minMs = Number(chartEl.dataset.domainMin);
      const maxMs = Number(chartEl.dataset.domainMax);
      const rect = overlay.getBoundingClientRect();
      const scaleX = config.w / svg.getBoundingClientRect().width;
      const localX = (evt.clientX - svg.getBoundingClientRect().left) * scaleX;
      const { padL, plotW } = config.layout;
      if (localX < padL || localX > padL + plotW) {
        crosshair.setAttribute('visibility', 'hidden');
        tooltip.hidden = true;
        return;
      }
      const span = maxMs - minMs || 1;
      const t = (localX - padL) / plotW;
      const dateMs = minMs + t * span;
      const point = nearestPoint(config.hoverPoints, dateMs);
      if (!point) return;

      const x = xAt(parseDateMs(point.date), minMs, maxMs, config.layout);
      crosshair.setAttribute('x1', String(x));
      crosshair.setAttribute('x2', String(x));
      crosshair.setAttribute('y1', String(config.layout.padT));
      crosshair.setAttribute('y2', String(config.layout.padT + config.layout.plotH));
      crosshair.setAttribute('visibility', 'visible');

      tooltip.hidden = false;
      tooltip.textContent = point.tooltip || `${point.date}: ${point.value}`;
      const hostRect = chartEl.getBoundingClientRect();
      const tipX = ((x / config.w) * svg.getBoundingClientRect().width) + svg.getBoundingClientRect().left - hostRect.left;
      tooltip.style.left = `${Math.min(Math.max(tipX, 8), hostRect.width - 120)}px`;
      tooltip.style.top = '8px';
    }

    function onLeave() {
      crosshair.setAttribute('visibility', 'hidden');
      tooltip.hidden = true;
    }

    overlay.addEventListener('pointermove', onMove);
    overlay.addEventListener('pointerleave', onLeave);
    overlay.addEventListener('touchstart', (e) => { if (e.touches[0]) onMove(e.touches[0]); }, { passive: true });
  }

  // Animate data paths drawing in when the chart scrolls into view.
  function initReveal(chartEl) {
    if (reduceMotion) return;
    const paths = chartEl.querySelectorAll('path[data-wl-path]');
    if (!paths.length) return;
    const peak = chartEl.querySelector('[data-wl-chart-peak]');
    paths.forEach((p) => {
      try {
        const len = p.getTotalLength();
        if (!len || !isFinite(len)) return;
        p.style.transition = 'none';
        p.style.strokeDasharray = `${len}`;
        p.style.strokeDashoffset = `${len}`;
        p.dataset.wlLen = String(len);
      } catch {}
    });
    // Peak callout stays visible; only the line draw animates.

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        paths.forEach((p, i) => {
          const len = p.dataset.wlLen;
          if (!len) return;
          p.style.transition = `stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1) ${i * 0.12}s`;
          requestAnimationFrame(() => { p.style.strokeDashoffset = '0'; });
          // clear dasharray after the draw so dashed bridge styles (set via attr) restore
          window.setTimeout(() => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.style.transition = ''; }, 1400 + i * 120);
        });
        obs.disconnect();
      });
    }, { threshold: 0.25 });
    obs.observe(chartEl);
  }

  function init() {
    document.querySelectorAll('[data-wl-charts-root]').forEach((root) => {
      // Cache + normalise geometry for every chart before first layout.
      root.querySelectorAll('[data-wl-chart]').forEach((chart) => {
        const cfg = readConfig(chart);
        if (!cfg) return;
        chart._wlConfig = cfg;
        normalizeChart(chart, cfg);
      });
      initRangeBar(root);
      root.querySelectorAll('[data-wl-chart]').forEach((chart) => {
        initHover(chart);
        initReveal(chart);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
