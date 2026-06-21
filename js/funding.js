let fundingSort = { key: 'totalRaised', dir: 'desc' };
const FUNDING_PAGE_SIZE = 150;
let fundingShown = FUNDING_PAGE_SIZE;

function renderFundingStats(all) {
  const withFunding = all.filter(c => c.totalRaised != null);
  const totalRaisedSum = withFunding.reduce((s, c) => s + (c.totalRaised || 0), 0);
  const withValuation = all.filter(c => companyValuation(c) != null);
  document.getElementById('fundingStatRow').innerHTML = `
    <div class="stat-pill"><span class="num">${withFunding.length}</span><span class="label">Companies with disclosed funding</span></div>
    <div class="stat-pill"><span class="num">$${Math.round(totalRaisedSum).toLocaleString()}M</span><span class="label">Combined total raised</span></div>
    <div class="stat-pill"><span class="num">${withValuation.length}</span><span class="label">Companies with a disclosed valuation</span></div>
  `;
}

function renderFundingChart(rows) {
  const top = [...rows].filter(c => c.totalRaised != null).sort((a, b) => b.totalRaised - a.totalRaised).slice(0, 20);
  const canvas = document.getElementById('fundingChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 40;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (top.length === 0) { attachClickRegions(canvas, []); return; }

  const max = top[0].totalRaised;
  const padLeft = 200, padRight = 70, padTop = 10, padBottom = 10;
  const rowH = (canvas.height - padTop - padBottom) / top.length;
  const barAreaW = canvas.width - padLeft - padRight;
  const regions = [];

  top.forEach((c, i) => {
    const y = padTop + i * rowH;
    const barW = Math.max(4, (c.totalRaised / max) * barAreaW);
    const grad = ctx.createLinearGradient(padLeft, 0, padLeft + barW, 0);
    grad.addColorStop(0, segColor(c.segment));
    grad.addColorStop(1, '#e0699f');
    ctx.fillStyle = grad;
    const barH = rowH * 0.62;
    const barY = y + (rowH - barH) / 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(padLeft, barY, barW, barH, 6) : ctx.rect(padLeft, barY, barW, barH);
    ctx.fill();

    ctx.fillStyle = '#0d0a16';
    ctx.font = '600 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((c.name || '').slice(0, 26), padLeft - 10, barY + barH / 2 + 4);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#4d4760';
    ctx.font = '700 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('$' + Math.round(c.totalRaised).toLocaleString() + 'M', padLeft + barW + 8, barY + barH / 2 + 4);

    regions.push({ x: 0, y, w: canvas.width, h: rowH, onClick: () => { location.hash = '#company/' + encodeURIComponent(c.id); } });
  });
  attachClickRegions(canvas, regions);
}

function sortFundingRows(rows) {
  const { key, dir } = fundingSort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av, bv;
    if (key === 'valuation') { av = companyValuation(a); bv = companyValuation(b); }
    else { av = a[key]; bv = b[key]; }
    const aNull = av == null, bNull = bv == null;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (key === 'name' || key === 'lastFinancingDate') return String(av).localeCompare(String(bv)) * mult;
    return (av - bv) * mult;
  });
}

function renderFundingTable(rows) {
  const visible = rows.slice(0, fundingShown);
  document.getElementById('fundingTableBody').innerHTML = visible.map(c => `
    <tr>
      <td><span class="company-name company-hover" ${companyHoverAttrs(c)} onclick="location.hash='#company/${encodeURIComponent(c.id)}'" style="display:inline-flex;align-items:center;gap:8px;">${companyLogoHtml(c, 22)}${escapeHtml(c.name)}</span></td>
      <td>${c.totalRaised != null ? fmtMoneyPlain(c.totalRaised) : naText(null)}</td>
      <td>${fmtDate(c.lastFinancingDate)}</td>
      <td>${c.lastFinancingSize != null ? fmtMoneyPlain(c.lastFinancingSize) : naText(null)}</td>
      <td>${c.lastFinancingDealType ? tagHtml(c.lastFinancingDealType, segColor(c.segment)) : naText(null)}</td>
      <td>${companyValuation(c) != null ? fmtMoneyPlain(companyValuation(c)) : naText(null)}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="empty-state">No companies match.</td></tr>`;
  const note = document.getElementById('fundingMoreNote');
  if (rows.length > fundingShown) {
    note.innerHTML = `Showing ${fundingShown} of ${rows.length} — <a href="#" id="fundingLoadMore" style="color:var(--purple);font-weight:700;">load more</a>`;
    document.getElementById('fundingLoadMore').onclick = (e) => { e.preventDefault(); fundingShown += FUNDING_PAGE_SIZE; renderFundingTable(rows); };
  } else {
    note.textContent = `Showing all ${rows.length} companies.`;
  }
}

function applyFundingFilters() {
  if (!ALL.length) return;
  const q = document.getElementById('fundingSearch').value.toLowerCase();
  const seg = document.getElementById('fundingSegmentFilter').value;
  const raisedFilter = document.getElementById('fundingRaisedFilter').value;
  let rows = ALL;
  if (q) rows = rows.filter(c => (c.name || '').toLowerCase().includes(q));
  if (seg) rows = rows.filter(c => c.segment === seg);
  if (raisedFilter === 'raised') rows = rows.filter(c => c.totalRaised != null);
  if (raisedFilter === 'notraised') rows = rows.filter(c => c.totalRaised == null);
  renderFundingStats(rows);
  renderFundingChart(rows);
  rows = sortFundingRows(rows);
  fundingShown = FUNDING_PAGE_SIZE;
  renderFundingTable(rows);
  document.getElementById('fundingCount').textContent = rows.length;
}

function initFundingPage() {
  const segSel = document.getElementById('fundingSegmentFilter');
  if (!segSel.dataset.populated) {
    uniqueSorted(ALL.map(c => c.segment)).forEach(s => segSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`));
    segSel.dataset.populated = '1';
  }
  document.querySelectorAll('#view-funding th.sortable').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.fsort;
      if (fundingSort.key === key) fundingSort.dir = fundingSort.dir === 'asc' ? 'desc' : 'asc';
      else fundingSort = { key, dir: 'desc' };
      document.querySelectorAll('#view-funding th.sortable .arrow').forEach(a => a.textContent = '');
      th.querySelector('.arrow').textContent = fundingSort.dir === 'asc' ? '▾' : '▴';
      applyFundingFilters();
    };
  });
  ['fundingSearch','fundingSegmentFilter','fundingRaisedFilter'].forEach(id => {
    document.getElementById(id).oninput = applyFundingFilters;
    document.getElementById(id).onchange = applyFundingFilters;
  });
  window.addEventListener('resize', () => { if (location.hash === '#funding') applyFundingFilters(); });
  applyFundingFilters();
}
