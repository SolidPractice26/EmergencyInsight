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
  let pending = null;   // a search started on the home page, run when the report page opens
  const fState = document.getElementById('addr-state'), fZip = document.getElementById('addr-zip'), fCounty = document.getElementById('addr-county');

  // County list follows the chosen state
  async function fillCounties(selected) {
    const st = fState.value;
    fCounty.innerHTML = '<option value="">' + (st ? 'Loading counties…' : 'Choose a state first') + '</option>';
    fCounty.disabled = true;
    if (!st || !window.EI_LAB) return;
    try {
      const list = await window.EI_LAB.countiesOf(st);
      if (fState.value !== st) return;
      fCounty.innerHTML = '<option value="">Use the ZIP code</option>' + list.map(c => `<option value="${c.fips}">${esc2(c.name)}</option>`).join('');
      fCounty.disabled = false;
      if (selected) fCounty.value = selected;
    } catch (e) { fCounty.innerHTML = '<option value="">Counties did not load</option>'; }
  }
  fState.addEventListener('change', () => { flowErr.textContent = ''; fillCounties(); });
  fZip.addEventListener('input', () => { flowErr.textContent = ''; if (fZip.value) fCounty.value = ''; });
  fCounty.addEventListener('change', () => { flowErr.textContent = ''; if (fCounty.value) fZip.value = ''; });
  const formPlace = () => ({ state: fState.value, zip: fZip.value.trim(), county: fCounty.value });

  function resetFlow() {
    if (pending) { const p = pending; pending = null; goPreview(p); return; }
    flowAddress.hidden = false; flowPreview.hidden = true;
    step1.setAttribute('aria-current', 'step'); step2.removeAttribute('aria-current');
  }
  const flowErr = document.getElementById('flow-err');
  const flowPdf = document.getElementById('flow-pdf'), flowPdfStatus = document.getElementById('flow-pdf-status');
  let flowReport = null;
  const esc2 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tierTint = { very_high: '#f2a29a', high: '#f5c08a', moderate: '#f2d48a', low: '#a9cbe6', very_low: '#a9cbe6' };

  function showForm(msg) {
    flowAddress.hidden = false; flowPreview.hidden = true;
    step1.setAttribute('aria-current', 'step'); step2.removeAttribute('aria-current');
    flowErr.textContent = msg || '';
  }

  async function goPreview(place) {
    flowErr.textContent = '';
    const lab = window.EI_LAB;
    if (!lab) { showForm('The report tools did not load. Reload the page and try again.'); return; }
    const r = await lab.resolvePlace(place);
    if (r.error) { showForm(r.error); return; }
    const aud = (document.querySelector('input[name="audience"]:checked') || {}).value || 'buying';
    flowReport = lab.makeReport(r.val, aud);
    const { loc, data, pages } = flowReport;
    document.getElementById('flow-notice').innerHTML = loc.zip_area
      ? `You searched for ZIP code <b>${esc2(loc.zip_area)}</b> in ${esc2(loc.state_name)}. This report covers <b>${esc2(loc.county)}</b>.${loc.zip_note ? esc2(loc.zip_note) : ''}`
      : `This report covers <b>${esc2(loc.county)}</b>, ${esc2(loc.state_name)}.`;
    document.getElementById('flow-place').textContent = loc.zip_area ? `ZIP code ${loc.zip_area}` : loc.county;
    document.getElementById('flow-sub').textContent = `${loc.county}, ${loc.state_name}`;
    const above = data.hazards.filter(h => h.group === 'above');
    document.getElementById('flow-head').textContent = above.length
      ? `${above.length} hazard${above.length === 1 ? '' : 's'} stand${above.length === 1 ? 's' : ''} out in this area`
      : 'No hazard stands out in this area';
    const list = (above.length ? above : data.hazards.filter(h => !h.not_included && h.years_with_event > 0).slice(0, 3)).slice(0, 5);
    document.getElementById('flow-items').innerHTML = list.map(h =>
      `<div class="item"><b>${esc2(h.name)}</b><span style="text-align: right;"><span style="font-weight: 700;">${h.years_with_event} of ${h.window_years} years</span><small style="display: block; font-size: 13px; color: var(--on-navy-muted);"><i style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${tierTint[h.tier_key] || '#a9cbe6'}; margin-right: 6px;"></i>more often than ${h.percentile}% of U.S. counties</small></span></div>`).join('');
    const nDecl = (data.declarations || []).length;
    document.getElementById('flow-foot').textContent = `Real NOAA records for ${loc.county}, 2016–2025, compared with every U.S. county. ${nDecl ? `Plus every federal disaster declared for the county since 2016 (${nDecl} FEMA declaration${nDecl === 1 ? '' : 's'}).` : 'No federal disaster declarations since 2016.'}`;
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
      if (form.closest('[data-view="report"]')) { goPreview(formPlace()); window.scrollTo({ top: 0 }); return; }
      // home page: copy state and ZIP into the report form, then open it
      const st = document.getElementById('home-state').value, zip = document.getElementById('addr-home').value.trim();
      fState.value = st; fZip.value = zip; fillCounties();
      pending = { state: st, zip, county: '' };
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
