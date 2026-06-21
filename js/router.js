const VIEWS = ['dashboard', 'screener', 'valuechain', 'rankings', 'advscreen', 'comparison', 'funding', 'financials', 'shortlist', 'reports', 'company', 'prypco', 'playbooks', 'comments'];

function showView(view) {
  VIEWS.forEach(v => { document.getElementById('view-' + v).style.display = v === view ? '' : 'none'; });
  document.querySelectorAll('.navlink').forEach(a => a.classList.toggle('active', a.dataset.view === view));
}

function routeFromHash() {
  const raw = (location.hash || '#dashboard').slice(1);
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');

  if (path.startsWith('company/')) {
    showView('company');
    renderCompanyDetail(decodeURIComponent(path.split('/')[1]));
    return;
  }
  if (!VIEWS.includes(path)) { showView('dashboard'); initDashboardPage(); return; }

  showView(path);
  if (path === 'dashboard') initDashboardPage();
  else if (path === 'screener') initScreenerPage();
  else if (path === 'valuechain') initValueChainPage();
  else if (path === 'rankings') initRankingsPage();
  else if (path === 'advscreen') initAdvScreenPage();
  else if (path === 'comparison') initComparisonPage(params.get('ids') ? params.get('ids').split(',') : compareIds);
  else if (path === 'funding') initFundingPage();
  else if (path === 'financials') initFinancialsPage();
  else if (path === 'shortlist') initShortlistPage();
  else if (path === 'reports') initReportsPage();
  else if (path === 'prypco') initPrypcoPage();
  else if (path === 'playbooks') {
    initPlaybooksPage();
    if (params.get('company')) {
      openPlaybookDetail(params.get('type') || 'profile', params.get('company'));
    }
  }
  else if (path === 'comments') initCommentsPage();
}
window.addEventListener('hashchange', routeFromHash);

/* ---------- Global search (topbar) ---------- */
function initGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const box = document.getElementById('globalSearchResults');
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { box.style.display = 'none'; return; }
    const matches = ALL.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.segment || '').toLowerCase().includes(q) ||
      (c.country || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    ).slice(0, 10);
    box.innerHTML = matches.map(c => `
      <div class="gsr-item" data-go="${escapeHtml(c.id)}">
        <strong>${escapeHtml(c.name)}</strong> <span class="subtle">${naText(c.segment)} · ${naText(c.country || c.geo)}</span>
      </div>`).join('') || '<div class="gsr-item subtle">No matches</div>';
    box.style.display = 'block';
    box.querySelectorAll('[data-go]').forEach(el => {
      el.onclick = () => { location.hash = '#company/' + encodeURIComponent(el.dataset.go); box.style.display = 'none'; input.value = ''; };
    });
  });
  document.addEventListener('click', evt => { if (!evt.target.closest('.topbar')) box.style.display = 'none'; });
}

/* ---------- Sidebar mini funnel (always-visible reminder of current screener funnel) ---------- */
function updateSidebarFunnelMini() {
  const el = document.getElementById('sidebarFunnelMini');
  if (!screenerResultRows || screenerResultRows.length === 0) {
    el.innerHTML = `<div class="fm-row">Run the Screener to start narrowing your ${ALL.length} companies →</div>`;
    return;
  }
  el.innerHTML = `
    <div class="fm-row">All companies <b>${ALL.length}</b></div>
    <div class="fm-row">After current filters <b>${screenerResultRows.length}</b></div>
    <div class="fm-row">Shortlisted <b>${shortlistData ? shortlistData.length : 0}</b></div>
  `;
}
