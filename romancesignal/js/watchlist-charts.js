/**
 * Watchlist book detail charts: synced year range, adaptive x-ticks, hover crosshair.
 * Keep tick/scale rules aligned with watchlist-chart-window.ts.
 */
(function () {
  const MS_PER_DAY = 86400000;

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
      if (m > 11) {
        m = 0;
        y += 1;
      }
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
    if (g === 'month') return selectMonthTicks(minMs, maxMs, 8);
    if (g === 'year') return selectYearTicks(seriesDates, minMs, maxMs, 8);
    return selectDayTicks(seriesDates, minMs, maxMs, 8);
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

  function renderXTicks(chartEl, config, minMs, maxMs) {
    const group = chartEl.querySelector('[data-wl-chart-x-ticks]');
    if (!group || !config) return;
    const granularity = chartTickGranularity(minMs, maxMs);
    const ticks = selectXTickDates(config.seriesDates || [], minMs, maxMs);
    const h = config.h;
    const y = h - 14;
    const svgNs = 'http://www.w3.org/2000/svg';
    group.replaceChildren();
    for (const d of ticks) {
      const x = xAt(parseDateMs(d), minMs, maxMs, config.layout);
      const text = document.createElementNS(svgNs, 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', granularity === 'year' ? '10' : '9');
      text.setAttribute('fill', 'var(--color-text-faint)');
      text.textContent = formatTickLabel(d, granularity);
      group.appendChild(text);
    }
  }

  function applyDomain(chartEl, minMs, maxMs) {
    const config = readConfig(chartEl);
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
        const circles = el.querySelectorAll('circle');
        circles.forEach((c) => {
          c.setAttribute('cx', String(cx));
          c.setAttribute('cy', String(cy));
        });
      }
    }

    const peakGroup = chartEl.querySelector('[data-wl-chart-peak]');
    if (peakGroup && config.peak) {
      const px = xAt(parseDateMs(config.peak.date), minMs, maxMs, config.layout);
      const py = yAt(config.peak.y, config.minY, config.maxY, config.layout, yScale);
      const circle = peakGroup.querySelector('circle');
      if (circle) {
        circle.setAttribute('cx', String(px));
        circle.setAttribute('cy', String(py));
      }
      const line = peakGroup.querySelector('line');
      if (line) {
        line.setAttribute('x1', String(px));
        line.setAttribute('y1', String(py - 8));
        line.setAttribute('x2', String(px + 42));
        line.setAttribute('y2', String(py - 28));
      }
      const text = peakGroup.querySelector('text');
      if (text) {
        text.setAttribute('x', String(px + 46));
        text.setAttribute('y', String(py - 24));
      }
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

  function initRangeBar(root) {
    const full = getDomain(root);
    root.querySelectorAll('[data-wl-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const range = btn.getAttribute('data-wl-range');
        root.querySelectorAll('[data-wl-range]').forEach((b) => {
          const on = b === btn;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (range === 'all') {
          applyRangeToAll(root, full.minMs, full.maxMs, 'All years');
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
  }

  function nearestPoint(hoverPoints, dateMs) {
    let best = null;
    let bestDist = Infinity;
    for (const p of hoverPoints) {
      const d = Math.abs(parseDateMs(p.date) - dateMs);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function initHover(chartEl) {
    const config = readConfig(chartEl);
    if (!config || !config.hoverPoints?.length) return;

    const svg = chartEl.querySelector('svg');
    const overlay = chartEl.querySelector('[data-wl-chart-overlay]');
    const crosshair = chartEl.querySelector('[data-wl-chart-crosshair]');
    const tooltip = chartEl.querySelector('[data-wl-chart-tooltip]');
    if (!svg || !overlay || !crosshair || !tooltip) return;

    const plotBottom = config.layout.padT + config.layout.plotH;

    function onMove(evt) {
      const minMs = Number(chartEl.dataset.domainMin);
      const maxMs = Number(chartEl.dataset.domainMax);
      const rect = overlay.getBoundingClientRect();
      const scaleX = config.w / rect.width;
      const localX = (evt.clientX - rect.left) * scaleX;
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
      crosshair.setAttribute('y2', String(plotBottom));
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
    overlay.addEventListener('touchstart', (e) => {
      if (e.touches[0]) onMove(e.touches[0]);
    }, { passive: true });
  }

  function init() {
    document.querySelectorAll('[data-wl-charts-root]').forEach((root) => {
      initRangeBar(root);
      root.querySelectorAll('[data-wl-chart]').forEach((chart) => initHover(chart));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
