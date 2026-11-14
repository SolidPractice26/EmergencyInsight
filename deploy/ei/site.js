(() => {
  // Paste your Google Form (or other sign-up form) link here to turn on every "Join the waitlist" button.
  const WAITLIST_URL = "";

  const views = [...document.querySelectorAll('[data-view]')];
  const names = views.map(v => v.dataset.view);
  const navLinks = [...document.querySelectorAll('.nav a, .foot-links a')];

  function show(name, scroll) {
    if (!names.includes(name)) name = 'home';
    views.forEach(v => { v.hidden = v.dataset.view !== name; });
    navLinks.forEach(a => {
      if (a.getAttribute('href') === '#' + name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (name === 'report') resetFlow();
    if (scroll) window.scrollTo({ top: 0 });
  }

  // Get a report flow
  const flowAddress = document.getElementById('flow-address');
  const flowPreview = document.getElementById('flow-preview');
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const audLines = {
    buying: 'Includes a <b>Know Before You Buy</b> page with a before-you-sign checklist.',
    renting: 'Includes a <b>Know Before You Sign the Lease</b> page with questions for your landlord.',
    living: 'Includes a <b>What Your Home Has Been Through</b> page with things worth checking.'
  };
  let pendingAddress = '';

  function resetFlow() {
    if (pendingAddress) { goPreview(pendingAddress); pendingAddress = ''; return; }
    flowAddress.hidden = false; flowPreview.hidden = true;
    step1.setAttribute('aria-current', 'step'); step2.removeAttribute('aria-current');
  }
  const flowErr = document.getElementById('flow-err');
  const flowPdf = document.getElementById('flow-pdf'), flowPdfStatus = document.getElementById('flow-pdf-status');
  let flowReport = null;
  const esc2 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tierTint = { very_high: '#f2a29a', high: '#f5c08a', moderate: '#f2d48a', low: '#a9cbe6', very_low: '#a9cbe6' };

  async function goPreview(addr) {
    const shown = (addr || '').trim();
    flowErr.textContent = '';
    const lab = window.EI_LAB;
    if (!lab) { flowErr.textContent = 'The report tools did not load. Reload the page and try again.'; return; }
    await lab.ready;
    const r = lab.resolveInput(shown);
    if (r.error) {
      flowAddress.hidden = false; flowPreview.hidden = true;
      step1.setAttribute('aria-current', 'step'); step2.removeAttribute('aria-current');
      document.getElementById('addr-report').value = shown;
      flowErr.textContent = r.error;
      return;
    }
    const aud = (document.querySelector('input[name="audience"]:checked') || {}).value || 'buying';
    flowReport = lab.makeReport(r.val, aud);
    const { loc, data, pages } = flowReport;
    const exact = !!loc.flood_zone;
    document.getElementById('flow-notice').innerHTML = exact
      ? `You searched for <b>${esc2(shown)}</b>. This is one of our test addresses, so the report includes its real FEMA flood zone.`
      : `You searched for <b>${esc2(shown)}</b>. The prototype finds the area by ZIP code, so this report covers <b>${esc2(loc.county)}</b>. A report for an exact address will add its FEMA flood zone.`;
    document.getElementById('flow-place').textContent = exact ? loc.address : `ZIP code ${loc.zip_area}`;
    document.getElementById('flow-sub').textContent = exact ? `${loc.city}, FL ${loc.zip} · ${loc.county}` : `${loc.county}, Florida`;
    const above = data.hazards.filter(h => h.group === 'above');
    document.getElementById('flow-head').textContent = above.length
      ? `${above.length} hazard${above.length === 1 ? '' : 's'} stand${above.length === 1 ? 's' : ''} out ${exact ? 'at this address' : 'in this area'}`
      : `No hazard stands out ${exact ? 'at this address' : 'in this area'}`;
    const list = (above.length ? above : data.hazards.slice(0, 3)).slice(0, 5);
    document.getElementById('flow-items').innerHTML = list.map(h =>
      `<div class="item"><b>${esc2(h.name)}</b><span style="color: ${tierTint[h.tier_key] || '#a9cbe6'}; font-weight: 700;">${esc2(h.tier)}</span></div>`).join('');
    document.getElementById('flow-foot').textContent = `Real NOAA records for ${loc.county}, 1996–2025, ranked against every U.S. county.`;
    document.getElementById('aud-line').innerHTML = audLines[aud];
    flowPdfStatus.textContent = '';
    const pv = document.getElementById('flow-preview-pages');
    lab.renderPreview(pv, pages, pv.clientWidth && pv.clientWidth < 500 ? 0.3 : 0.36);
    flowAddress.hidden = true; flowPreview.hidden = false;
    step2.setAttribute('aria-current', 'step'); step1.removeAttribute('aria-current');
  }
  flowPdf.addEventListener('click', () => {
    if (flowReport && window.EI_LAB) window.EI_LAB.savePdf(flowReport.pages, flowReport.data, flowPdf, flowPdfStatus);
  });

  document.querySelectorAll('.js-search').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input[type="text"]');
      const addr = input ? input.value.trim() : '';
      if (form.closest('[data-view="report"]')) { goPreview(addr); window.scrollTo({ top: 0 }); return; }
      pendingAddress = addr || ' ';
      document.getElementById('addr-report').value = addr;
      if (location.hash === '#report') show('report', true); else location.hash = 'report';
    });
  });
  document.querySelectorAll('.js-restart').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); resetFlow(); window.scrollTo({ top: 0 });
  }));

  // Waitlist buttons
  if (WAITLIST_URL) {
    document.querySelectorAll('.js-waitlist').forEach(a => {
      a.href = WAITLIST_URL; a.target = '_blank'; a.rel = 'noopener';
    });
    document.getElementById('waitlist-status').textContent = 'Sign up with your email and the area you care about. We will only email you about launch.';
  } else {
    const main = document.querySelector('.js-waitlist-main');
    if (main) main.hidden = true;
  }

  // Copy email
  document.querySelectorAll('.js-copy').forEach(btn => btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.target);
    const status = document.getElementById('copy-status');
    const text = el.textContent.trim();
    navigator.clipboard.writeText(text).then(
      () => { status.textContent = 'Copied.'; },
      () => {
        const range = document.createRange(); range.selectNodeContents(el);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        status.textContent = 'Selected. Press Ctrl+C or Cmd+C to copy.';
      }
    );
  }));

  window.addEventListener('hashchange', () => show(location.hash.slice(1), true));
  show(location.hash.slice(1), false);
})();
