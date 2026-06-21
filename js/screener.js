const screenerState = {
  selected: new Set(),
  sort: { key: 'name', dir: 'asc' },
  shown: 150,
};

function screenerFilterValues() {
  const get = id => document.getElementById(id).value;
  const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
  return {
    segment: get('scrSegment'), businessModel: get('scrModel'), geo: get('scrGeo'), country: get('scrCountry'),
    yearMin: parseInt(get('scrYearMin')) || null, yearMax: parseInt(get('scrYearMax')) || null,
    ownershipStatus: get('scrOwnership'), publicPrivate: get('scrPublicPrivate'),
    raisedMin: parseFloat(get('scrRaisedMin')) || null, raisedMax: parseFloat(get('scrRaisedMax')) || null,
    valuationMin: parseFloat(get('scrValuationMin')) || null, valuationMax: parseFloat(get('scrValuationMax')) || null,
    dealType: get('scrDealType'),
    capitalIntensity: get('scrCapital'), revenueModel: get('scrRevenue'), targetCustomer: get('scrCustomer'), gtm: get('scrGtm'),
    moats: checked('moatChip'),
    excludeAcquired: document.getElementById('scrExcludeAcquired').checked,
    onlyFunded: document.getElementById('scrOnlyFunded').checked,
    q: get('scrSearch').toLowerCase(),
  };
}

function applyCompanyInfoFilters(rows, f) {
  if (f.segment) rows = rows.filter(c => c.segment === f.segment);
  if (f.businessModel) rows = rows.filter(c => c.businessModel === f.businessModel);
  if (f.geo) rows = rows.filter(c => c.geo === f.geo);
  if (f.country) rows = rows.filter(c => c.country === f.country);
  if (f.yearMin) rows = rows.filter(c => c.yearFounded && c.yearFounded >= f.yearMin);
  if (f.yearMax) rows = rows.filter(c => c.yearFounded && c.yearFounded <= f.yearMax);
  if (f.ownershipStatus) rows = rows.filter(c => c.ownershipStatus === f.ownershipStatus);
  if (f.publicPrivate === 'public') rows = rows.filter(isPublic);
  if (f.publicPrivate === 'private') rows = rows.filter(c => !isPublic(c));
  if (f.q) rows = rows.filter(c => (c.name || '').toLowerCase().includes(f.q) || (c.description || '').toLowerCase().includes(f.q));
  return rows;
}
function applyFinancialFilters(rows, f) {
  if (f.raisedMin != null) rows = rows.filter(c => c.totalRaised != null && c.totalRaised >= f.raisedMin);
  if (f.raisedMax != null) rows = rows.filter(c => c.totalRaised != null && c.totalRaised <= f.raisedMax);
  if (f.valuationMin != null) rows = rows.filter(c => companyValuation(c) != null && companyValuation(c) >= f.valuationMin);
  if (f.valuationMax != null) rows = rows.filter(c => companyValuation(c) != null && companyValuation(c) <= f.valuationMax);
  if (f.dealType) rows = rows.filter(c => c.lastFinancingDealType === f.dealType);
  return rows;
}
function applyQualityFilters(rows, f) {
  if (f.capitalIntensity) rows = rows.filter(c => c.capitalIntensity === f.capitalIntensity);
  if (f.revenueModel) rows = rows.filter(c => c.revenueModel === f.revenueModel);
  if (f.targetCustomer) rows = rows.filter(c => c.targetCustomer === f.targetCustomer);
  if (f.gtm) rows = rows.filter(c => c.gtm === f.gtm);
  if (f.moats.length) rows = rows.filter(c => f.moats.includes(c.moat));
  return rows;
}
function applyRiskFilters(rows, f) {
  if (f.excludeAcquired) rows = rows.filter(c => c.ownershipStatus !== 'Acquired/Merged');
  if (f.onlyFunded) rows = rows.filter(c => c.totalRaised != null);
  return rows;
}

function renderFunnel(stages) {
  document.getElementById('screenerFunnel').innerHTML = stages.map((s, i) => `
    ${i > 0 ? '<div class="funnel-arrow">→</div>' : ''}
    <div class="funnel-step">
      <div class="fs-bar" style="background:linear-gradient(135deg,${s.color},${s.color}99); width:${Math.max(60, 100 - i * 6)}px;">${s.count}</div>
      <div class="fs-label">${s.label}</div>
    </div>
  `).join('');
}

function sortScreenerRows(rows) {
  const { key, dir } = screenerState.sort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'totalRaised' || key === 'yearFounded') {
      av = av ?? -Infinity; bv = bv ?? -Infinity;
      return (av - bv) * mult;
    }
    av = av || ''; bv = bv || '';
    return String(av).localeCompare(String(bv)) * mult;
  });
}

let screenerResultRows = [];

function runScreener() {
  const f = screenerFilterValues();
  const stage0 = ALL;
  const stage1 = applyCompanyInfoFilters(stage0, f);
  const stage2 = applyFinancialFilters(stage1, f);
  const stage3 = applyQualityFilters(stage2, f);
  const stage4 = applyRiskFilters(stage3, f);

  renderFunnel([
    { label: 'All Companies', count: stage0.length, color: '#6b6480' },
    { label: 'Company Info', count: stage1.length, color: '#7ca3c4' },
    { label: 'Financial', count: stage2.length, color: '#7fb8c9' },
    { label: 'Quality / Fit', count: stage3.length, color: '#d99466' },
    { label: 'Risk Excludes', count: stage4.length, color: '#7fa876' },
  ]);

  screenerResultRows = sortScreenerRows(stage4);
  screenerState.shown = 150;
  renderScreenerResults();
  document.getElementById('screenerResultCount').textContent = stage4.length;
}

function renderScreenerResults() {
  const visible = screenerResultRows.slice(0, screenerState.shown);
  document.getElementById('screenerTableBody').innerHTML = visible.map(c => `
    <tr>
      <td><input type="checkbox" class="row-check" data-id="${escapeHtml(c.id)}" ${screenerState.selected.has(c.id) ? 'checked' : ''}></td>
      <td><span class="company-name company-hover" ${companyHoverAttrs(c)} onclick="location.hash='#company/${encodeURIComponent(c.id)}'" style="display:inline-flex;align-items:center;gap:8px;">${companyLogoHtml(c, 22)}${escapeHtml(c.name)}</span></td>
      <td>${c.segment ? tagHtml(c.segment, segColor(c.segment)) : naText(null)}</td>
      <td>${c.businessModel ? tagHtml(c.businessModel, modelColor(c.businessModel)) : naText(null)}</td>
      <td>${naText(c.country || c.geo)}</td>
      <td>${naText(c.yearFounded)}</td>
      <td>${c.totalRaised != null ? fmtMoneyPlain(c.totalRaised) : naText(null)}</td>
      <td>${companyValuation(c) != null ? fmtMoneyPlain(companyValuation(c)) : naText(null)}</td>
      <td>${naText(c.moat)}</td>
    </tr>
  `).join('') || `<tr><td colspan="9" class="empty-state">No companies match these filters.</td></tr>`;

  document.querySelectorAll('.row-check').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) screenerState.selected.add(cb.dataset.id);
      else screenerState.selected.delete(cb.dataset.id);
      updateScreenerActionBar();
    };
  });

  const note = document.getElementById('screenerMoreNote');
  if (screenerResultRows.length > screenerState.shown) {
    note.innerHTML = `Showing ${screenerState.shown} of ${screenerResultRows.length} — <a href="#" id="screenerLoadMore" style="color:var(--purple);font-weight:700;">load more</a>`;
    document.getElementById('screenerLoadMore').onclick = (e) => { e.preventDefault(); screenerState.shown += 150; renderScreenerResults(); };
  } else {
    note.textContent = `Showing all ${screenerResultRows.length} matching companies.`;
  }
  updateScreenerActionBar();
}

function updateScreenerActionBar() {
  document.getElementById('screenerSelectedCount').textContent = screenerState.selected.size;
}

function applyScreenerParams(params) {
  const map = {
    segment: 'scrSegment', businessModel: 'scrModel', geo: 'scrGeo', country: 'scrCountry',
    yearMin: 'scrYearMin', yearMax: 'scrYearMax', dealType: 'scrDealType',
  };
  Object.entries(params || {}).forEach(([key, val]) => {
    const id = map[key];
    if (id && document.getElementById(id)) document.getElementById(id).value = val;
  });
  runScreener();
}

function resetScreenerFilters() {
  ['scrSegment','scrModel','scrGeo','scrCountry','scrYearMin','scrYearMax','scrOwnership','scrPublicPrivate',
   'scrRaisedMin','scrRaisedMax','scrValuationMin','scrValuationMax','scrDealType',
   'scrCapital','scrRevenue','scrCustomer','scrGtm','scrSearch'].forEach(id => { document.getElementById(id).value = ''; });
  document.querySelectorAll('input[name="moatChip"]').forEach(el => el.checked = false);
  document.getElementById('scrExcludeAcquired').checked = false;
  document.getElementById('scrOnlyFunded').checked = false;
  runScreener();
}

function populateScreenerDropdowns() {
  const fill = (id, values) => {
    const sel = document.getElementById(id);
    if (sel.dataset.populated) return;
    uniqueSorted(values).forEach(v => sel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
    sel.dataset.populated = '1';
  };
  fill('scrSegment', META.segments);
  fill('scrModel', META.models);
  fill('scrGeo', META.geos);
  fill('scrCountry', ALL.map(c => c.country));
  fill('scrOwnership', ALL.map(c => c.ownershipStatus));
  fill('scrDealType', ALL.map(c => c.lastFinancingDealType));
  fill('scrCapital', META.capitalOptions);
  fill('scrRevenue', META.revenueModels);
  fill('scrCustomer', META.targetCustomers);
  fill('scrGtm', META.gtmMotions);

  const moatWrap = document.getElementById('scrMoatChips');
  if (!moatWrap.dataset.populated) {
    moatWrap.innerHTML = META.moats.map(m => `
      <label class="chip-option" data-chip>
        <input type="checkbox" name="moatChip" value="${escapeHtml(m)}" style="display:none;">${escapeHtml(m)}
      </label>`).join('');
    moatWrap.querySelectorAll('.chip-option').forEach(chip => {
      chip.addEventListener('click', () => {
        const cb = chip.querySelector('input');
        cb.checked = !cb.checked;
        chip.classList.toggle('active', cb.checked);
        runScreener();
      });
    });
    moatWrap.dataset.populated = '1';
  }
}

async function addSelectedToShortlist() {
  const ids = [...screenerState.selected];
  for (const id of ids) {
    await saveShortlist(id, { status: 'Under Review', watchlist: 'Default' });
  }
  alert(`Added ${ids.length} companies to your Investment Shortlist.`);
}

function sendSelectedToComparison() {
  const ids = [...screenerState.selected].slice(0, 5);
  if (ids.length < 2) { alert('Select at least 2 companies to compare.'); return; }
  location.hash = '#comparison?ids=' + ids.join(',');
}

function exportScreenerResults() {
  const ids = screenerResultRows.map(c => c.id).join(',');
  window.open(`/api/export/companies.xlsx?ids=${encodeURIComponent(ids)}`, '_blank');
}

async function bulkDeleteSelected() {
  const ids = [...screenerState.selected];
  if (!ids.length) { alert('Select at least one company first.'); return; }
  if (!confirm(`Delete ${ids.length} selected companies permanently? This cannot be undone.`)) return;
  const result = await bulkDeleteCompanies(ids);
  if (result && result.ok) {
    ALL = ALL.filter(c => !ids.includes(c.id));
    screenerState.selected.clear();
    alert(`Deleted ${result.deleted} companies.`);
    runScreener();
  } else {
    alert('Bulk delete failed — ' + (result && result.error ? result.error : 'unknown error'));
  }
}

function openAddCompanyPanel() {
  const html = `
    <h2>+ Add a Company</h2>
    <p class="subtle">Only the name is required. Anything you leave blank stays blank — nothing here gets auto-filled or guessed.</p>
    <label>Company Name <input type="text" id="newCoName" placeholder="Required"></label>
    <label>Website <input type="text" id="newCoWebsite" placeholder="example.com"></label>
    <label>HQ Location <input type="text" id="newCoHq"></label>
    <label>Description <textarea id="newCoDescription" rows="3"></textarea></label>
    <label>Primary Segment ${selectOptions('newCoSegmentSelect', META.segments, '')}</label>
    <label>Business Model ${selectOptions('newCoModelSelect', META.models, '')}</label>
    <button class="mini-btn primary" id="submitAddCompanyBtn" style="margin-top:10px;">Add Company</button>
    <div id="addCompanyStatus" class="save-status"></div>
  `;
  openSlideOver(html);
  document.getElementById('submitAddCompanyBtn').onclick = async () => {
    const name = document.getElementById('newCoName').value.trim();
    if (!name) { alert('Company name is required.'); return; }
    const status = document.getElementById('addCompanyStatus');
    status.textContent = 'Adding...';
    const payload = {
      name,
      website: document.getElementById('newCoWebsite').value.trim(),
      hq: document.getElementById('newCoHq').value.trim(),
      description: document.getElementById('newCoDescription').value.trim(),
      segment: document.querySelector('select[name="newCoSegmentSelect"]').value,
      businessModel: document.querySelector('select[name="newCoModelSelect"]').value,
    };
    const created = await createCompany(payload);
    if (created && created.error) { status.textContent = created.error; status.style.color = 'var(--red)'; return; }
    ALL.push(created);
    status.textContent = '✓ Added';
    status.style.color = 'var(--green)';
    runScreener();
    setTimeout(closeSlideOver, 700);
  };
}

function openBulkAddPanel() {
  const html = `
    <h2>+ Bulk Add Companies</h2>
    <p class="subtle">Paste one company name per line. Each gets added with just that name — no segment, funding, or other data is guessed.</p>
    <textarea id="bulkAddTextarea" rows="14" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid rgba(155,133,196,0.2);font-family:inherit;" placeholder="Company One&#10;Company Two&#10;Company Three"></textarea>
    <button class="mini-btn primary" id="submitBulkAddBtn" style="margin-top:10px;">Add All</button>
    <div id="bulkAddStatus" class="save-status"></div>
  `;
  openSlideOver(html);
  document.getElementById('submitBulkAddBtn').onclick = async () => {
    const names = document.getElementById('bulkAddTextarea').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!names.length) { alert('Paste at least one company name.'); return; }
    const status = document.getElementById('bulkAddStatus');
    status.textContent = `Adding ${names.length} companies...`;
    const result = await bulkCreateCompanies(names);
    if (result && result.error) { status.textContent = result.error; status.style.color = 'var(--red)'; return; }
    const fresh = await loadCompanies();
    ALL = fresh;
    status.textContent = `✓ Added ${result.created} companies`;
    status.style.color = 'var(--green)';
    runScreener();
    setTimeout(closeSlideOver, 1000);
  };
}

function initScreenerPage() {
  populateScreenerDropdowns();
  document.querySelectorAll('#screener-filters input, #screener-filters select').forEach(el => {
    if (el.name === 'moatChip') return;
    el.addEventListener('input', runScreener);
    el.addEventListener('change', runScreener);
  });
  document.getElementById('scrExcludeAcquired').addEventListener('change', runScreener);
  document.getElementById('scrOnlyFunded').addEventListener('change', runScreener);
  document.getElementById('resetFiltersBtn').onclick = resetScreenerFilters;
  document.getElementById('addToShortlistBtn').onclick = addSelectedToShortlist;
  document.getElementById('sendToComparisonBtn').onclick = sendSelectedToComparison;
  document.getElementById('exportScreenerBtn').onclick = exportScreenerResults;
  document.getElementById('bulkDeleteBtn').onclick = bulkDeleteSelected;
  document.getElementById('openAddCompanyBtn').onclick = openAddCompanyPanel;
  document.getElementById('openBulkAddBtn').onclick = openBulkAddPanel;
  document.querySelectorAll('#screenerTable th.sortable').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (screenerState.sort.key === key) screenerState.sort.dir = screenerState.sort.dir === 'asc' ? 'desc' : 'asc';
      else screenerState.sort = { key, dir: 'asc' };
      document.querySelectorAll('#screenerTable th.sortable .arrow').forEach(a => a.textContent = '');
      th.querySelector('.arrow').textContent = screenerState.sort.dir === 'asc' ? '▾' : '▴';
      screenerResultRows = sortScreenerRows(screenerResultRows);
      renderScreenerResults();
    };
  });
  runScreener();
}
