(function () {
  const form = document.getElementById('get-involved-form');
  const statusEl = document.getElementById('gi-status');
  const submitBtn = document.getElementById('gi-submit');
  if (!form || !statusEl || !submitBtn) return;

  const emailInput = document.getElementById('gi-email');
  const interestsFieldset = document.getElementById('gi-interests');
  const interestsError = document.getElementById('gi-interests-error');
  const watchlistCheck = form.querySelector('input[name="interestWatchlist"]');
  const writerCheck = form.querySelector('input[name="interestWriter"]');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setStatus(kind, message) {
    statusEl.hidden = false;
    statusEl.dataset.kind = kind;
    statusEl.textContent = message;
  }

  function clearStatus() {
    statusEl.hidden = true;
    statusEl.textContent = '';
    delete statusEl.dataset.kind;
  }

  function showInterestsError() {
    if (interestsFieldset instanceof HTMLFieldSetElement) {
      interestsFieldset.classList.add('gi-field--invalid');
      interestsFieldset.setAttribute('aria-invalid', 'true');
    }
    if (interestsError instanceof HTMLElement) {
      interestsError.hidden = false;
    }
    if (watchlistCheck instanceof HTMLInputElement) {
      watchlistCheck.focus();
    }
  }

  function clearInterestsError() {
    if (interestsFieldset instanceof HTMLFieldSetElement) {
      interestsFieldset.classList.remove('gi-field--invalid');
      interestsFieldset.removeAttribute('aria-invalid');
    }
    if (interestsError instanceof HTMLElement) {
      interestsError.hidden = true;
    }
  }

  function onInterestChange() {
    const watchlist = watchlistCheck instanceof HTMLInputElement && watchlistCheck.checked;
    const writer = writerCheck instanceof HTMLInputElement && writerCheck.checked;
    if (watchlist || writer) {
      clearInterestsError();
    }
  }

  if (watchlistCheck instanceof HTMLInputElement) {
    watchlistCheck.addEventListener('change', onInterestChange);
  }
  if (writerCheck instanceof HTMLInputElement) {
    writerCheck.addEventListener('change', onInterestChange);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();
    clearInterestsError();

    if (emailInput instanceof HTMLInputElement && !emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }

    const fd = new FormData(form);
    const email = String(fd.get('email') ?? '').trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      setStatus('error', 'Enter a valid email address.');
      if (emailInput instanceof HTMLInputElement) emailInput.focus();
      return;
    }

    const interestWatchlist = fd.get('interestWatchlist') === '1';
    const interestWriter = fd.get('interestWriter') === '1';

    if (!interestWatchlist && !interestWriter) {
      showInterestsError();
      return;
    }

    const payload = {
      email,
      interestWatchlist,
      interestWriter,
    };

    submitBtn.disabled = true;
    const prevLabel = submitBtn.textContent;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch("about:blank", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error', data.error || 'Something went wrong. Try again or email signal@threnne.com.');
        return;
      }
      form.reset();
      clearInterestsError();
      setStatus('success', "Thanks — you're on the list. We'll be in touch.");
    } catch {
      setStatus('error', 'Network error. Try again or email signal@threnne.com.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel ?? 'Submit';
    }
  });
})();
