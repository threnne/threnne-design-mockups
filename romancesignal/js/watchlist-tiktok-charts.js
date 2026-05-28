(function () {
  const root = document.querySelector('[data-wl-tt-charts]');
  if (!root) return;

  const tabs = root.querySelectorAll('[data-wl-tt-tab]');
  const panels = root.querySelectorAll('[data-wl-tt-panel]');

  function activate(view) {
    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-wl-tt-tab') === view;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel) => {
      const on = panel.getAttribute('data-wl-tt-panel') === view;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-wl-tt-tab');
      if (view) activate(view);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const list = Array.from(tabs);
      const i = list.indexOf(tab);
      const next = e.key === 'ArrowRight' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next].focus();
      activate(list[next].getAttribute('data-wl-tt-tab'));
    });
  });

  if (location.hash === '#tt-engagement') {
    activate('engagement');
  }
})();
