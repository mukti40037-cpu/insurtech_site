const FIN_DIMENSIONS = {
  stage: { label: 'Funding Stage', icon: '🚦' },
  size: { label: 'Funding Size', icon: '💵' },
  valuation: { label: 'Valuation Tier', icon: '📐' },
  recency: { label: 'Financing Recency', icon: '🕒' },
  status: { label: 'Ownership Status', icon: '🏛️' },
};
const FIN_BOARD_COLORS = ['#9b85c4', '#d98ca3', '#7fb8c9', '#d99466', '#7fa876', '#8c7fc4', '#d9b468', '#c98599', '#7ca3c4', '#c97a7a'];

let finDimension = 'stage';
let finBucketRows = [];
let finBucketLabel = '';
let finSelected = new Set();
let finSort = { key: 'totalRaised', dir: 'desc' };

function sizeBucket(c) {
  if (c.totalRaised == null) return 'No disclosed funding';
  const v = c.totalRaised;
  if (v < 5) return '<$5M';
  if (v < 20) return '$5M–$20M';
  if (v < 50) return '$20M–$50M';
  if (v < 100) return '$50M–$100M';
  if (v < 500) return '$100M–$500M';
  return '$500M+';
}
const SIZE_ORDER = ['No disclosed funding', '<$5M', '$5M–$20M', '$20M–$50M', '$50M–$100M', '$100M–$500M', '$500M+'];

function valuationBucket(c) {
  const v = companyValuation(c);
  if (v == null) return 'No disclosed valuation';
  if (v < 50) return '<$50M';
  if (v < 200) return '$50M–$200M';
  if (v < 1000) return '$200M–$1B';
  return '$1B+';
}
const VALUATION_ORDER = ['No disclosed valuation', '<$50M', '$50M–$200M', '$200M–$1B', '$1B+'];

function recencyBucket(c) {
  if (!c.lastFinancingDate) return 'No disclosed date';
  const t = new Date(c.lastFinancingDate).getTime();
  if (isNaN(t)) return 'No disclosed date';
  const yrs = (Date.now() - t) / (1000 * 60 * 60 * 24 * 365);
  if (yrs < 1) return 'Last 12 months';
  if (yrs < 2) return '1–2 years ago';
  if (yrs < 3) return '2–3 years ago';
  if (yrs < 5) return '3–5 years ago';
  return '5+ years ago';
}
const RECENCY_ORDER = ['Last 12 months', '1–2 years ago', '2–3 years ago', '3–5 years ago', '5+ years ago', 'No disclosed date'];

function bucketFor(c, dim) {
  if (dim === 'stage') return c.lastFinancingDealType || 'Not disclosed';
  if (dim === 'size') return sizeBucket(c);
  if (dim === 'valuation') return valuationBucket(c);
  if (dim === 'recency') return recencyBucket(c);
  if (dim === 'status') return c.ownershipStatus || 'Not disclosed';
}

function orderFor(dim, keys) {
  if (dim === 'size') return SIZE_ORDER.filter(k => keys.includes(k));
  if (dim === 'valuation') return VALUATION_ORDER.filter(k => keys.includes(k));
  if (dim === 'recency') return RECENCY_ORDER.filter(k => keys.includes(k));
  // stage/status: sort by count desc, cap to top 12 + "Other"
  return keys;
}

function renderFinBoards() {
  const dim = finDimension;
  const groups = {};
  ALL.forEach(c => { const k = bucketFor(c, dim); groups[k] = groups[k] || []; groups[k].push(c); });

  let keys = Object.keys(groups);
  if (dim === 'stage' || dim === 'status') {
    keys = keys.sort((a, b) => groups[b].length - groups[a].length);
    if (keys.length > 12) {
      const rest = keys.slice(12);
      const restCompanies = rest.flatMap(k => groups[k]);
      keys = keys.slice(0, 12);
      if (restCompanies.length) { groups['Other'] = restCompanies; keys.push('Other'); }
    }
  } else {
    keys = orderFor(dim, keys);
  }

  document.getElementById('finBoardGrid').innerHTML = keys.map((k, i) => {
    const rows = groups[k];
    const withRaised = rows.filter(c => c.totalRaised != null);
    const avgRaised = withRaised.length ? withRaised.reduce((s, c) => s + c.totalRaised, 0) / withRaised.length : null;
    const color = FIN_BOARD_COLORS[i % FIN_BOARD_COLORS.length];
    return `<div class="pb-board" style="background:linear-gradient(135deg,${color},${color}aa);animation-delay:${(i*0.07)}s;min-height:150px;" data-bucket="${escapeHtml(k)}">
      <div class="pb-icon" style="font-size:30px;">${FIN_DIMENSIONS[dim].icon}</div>
      <div>
        <div class="pb-title" style="font-size:15px;">${escapeHtml(k)}</div>
        <div class="pb-sub">${avgRaised != null ? 'Avg raised: ' + fmtMoneyPlain(avgRaised) : 'Avg raised: n/a'}</div>
      </div>
      <div class="pb-cta">${rows.length} companies →</div>
    </div>`;
  }).join('');

  document.querySelectorAll('#finBoardGrid .pb-board').forEach(el => {
    el.onclick = () => openFinBucket(el.dataset.bucket, groups[el.dataset.bucket]);
  });
}

function openFinBucket(label, rows) {
  finBucketRows = rows;
  finBucketLabel = label;
  finSelected = new Set();
  document.getElementById('finBoardGrid').style.display = 'none';
  document.getElementById('finBucketDetail').style.display = '';
  document.getElementById('finBucketTitle').textContent = `${FIN_DIMENSIONS[finDimension].icon} ${label}`;
  document.getElementById('finBucketCount').textContent = rows.length;
  renderFinTable();
}

/* Funding-derived proxy ratios — NOT financial-statement ratios. Computed only from real
   funding fields we have (total raised, valuation, founding year), clearly labeled "proxy"
   everywhere they're shown so they're never mistaken for revenue/EBITDA-based metrics. */
function markupMultiple(c) {
  const v = companyValuation(c);
  if (v == null || c.totalRaised == null || c.totalRaised === 0) return null;
  return v / c.totalRaised;
}
function raisedPerYear(c) {
  if (c.totalRaised == null || !c.yearFounded) return null;
  const years = Math.max(1, new Date().getFullYear() - c.yearFounded);
  return c.totalRaised / years;
}

function finRowValue(c, key) {
  if (key === 'valuation') return companyValuation(c);
  if (key === 'markupMultiple') return markupMultiple(c);
  if (key === 'raisedPerYear') return raisedPerYear(c);
  return c[key];
}

function sortFinRows(rows) {
  const { key, dir } = finSort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av = finRowValue(a, key);
    let bv = finRowValue(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (key === 'lastFinancingDate') return String(av).localeCompare(String(bv)) * mult;
    return (av - bv) * mult;
  });
}

function renderFinTable() {
  const rows = sortFinRows(finBucketRows);
  document.getElementById('finTableBody').innerHTML = rows.map(c => `
    <tr>
      <td><input type="checkbox" class="row-check" data-fid="${escapeHtml(c.id)}" ${finSelected.has(c.id) ? 'checked' : ''}></td>
      <td><span class="company-name company-hover" ${companyHoverAttrs(c)} onclick="location.hash='#company/${encodeURIComponent(c.id)}'" style="display:inline-flex;align-items:center;gap:8px;">${companyLogoHtml(c, 20)}${escapeHtml(c.name)}</span></td>
      <td>${c.segment ? tagHtml(c.segment, segColor(c.segment)) : naText(null)}</td>
      <td>${c.totalRaised != null ? fmtMoneyPlain(c.totalRaised) : naText(null)}</td>
      <td>${fmtDate(c.lastFinancingDate)}</td>
      <td>${c.lastFinancingSize != null ? fmtMoneyPlain(c.lastFinancingSize) : naText(null)}</td>
      <td>${c.lastFinancingDealType ? tagHtml(c.lastFinancingDealType, '#9b85c4') : naText(null)}</td>
      <td>${companyValuation(c) != null ? fmtMoneyPlain(companyValuation(c)) : naText(null)}</td>
      <td>${c.successProbability != null ? c.successProbability + '/100' : naText(null)}</td>
      <td>${naText(c.ownershipStatus)}</td>
      <td>${markupMultiple(c) != null ? markupMultiple(c).toFixed(1) + '×' : naText(null)}</td>
      <td>${raisedPerYear(c) != null ? fmtMoneyPlain(raisedPerYear(c)) + '/yr' : naText(null)}</td>
    </tr>
  `).join('') || `<tr><td colspan="12" class="empty-state">No companies in this bucket.</td></tr>`;

  document.querySelectorAll('#finTableBody .row-check').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) finSelected.add(cb.dataset.fid); else finSelected.delete(cb.dataset.fid);
      document.getElementById('finSelectedCount').textContent = finSelected.size;
    };
  });
  document.getElementById('finSelectedCount').textContent = finSelected.size;
}

function backToFinBoards() {
  document.getElementById('finBucketDetail').style.display = 'none';
  document.getElementById('finBoardGrid').style.display = '';
}

function renderRealFinCards() {
  const withReal = ALL.filter(c => c.realFinPeriod);
  const wrap = document.getElementById('realFinCards');
  if (!withReal.length) {
    wrap.innerHTML = '<div class="empty-state">No real period financials loaded yet.</div>';
    return;
  }
  wrap.innerHTML = withReal.map(c => `
    <div class="card" style="padding:18px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        ${companyLogoHtml(c, 32)}
        <div>
          <strong class="company-hover" ${companyHoverAttrs(c)} style="cursor:pointer;" onclick="location.hash='#company/${encodeURIComponent(c.id)}'">${escapeHtml(c.name)}</strong>
          <div class="subtle">${escapeHtml(c.realFinPeriod)} · Ticker ${withSource(escapeHtml(c.ticker || ''), c.tickerSource, 'View source')}</div>
        </div>
      </div>
      <table class="kv2" style="width:100%;">
        <tr><th>Revenue</th><td>${escapeHtml(c.realFinRevenue)}</td></tr>
        <tr><th>Net Income</th><td>${escapeHtml(c.realFinNetIncome)}</td></tr>
        <tr><th>Key Ratios</th><td>${escapeHtml(c.realFinKeyRatios)}</td></tr>
      </table>
      ${withSource('<span class="footer-note">Source ⓘ</span>', c.realFinSource, 'View source')}
    </div>
  `).join('');
}

function initFinancialsPage() {
  renderRealFinCards();
  document.querySelectorAll('#finTabs .view-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('#finTabs .view-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      finDimension = tab.dataset.findim;
      backToFinBoards();
      renderFinBoards();
    };
  });
  document.getElementById('finBackBtn').onclick = backToFinBoards;
  document.querySelectorAll('#finTable th.sortable').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.finsort;
      if (finSort.key === key) finSort.dir = finSort.dir === 'asc' ? 'desc' : 'asc';
      else finSort = { key, dir: 'desc' };
      document.querySelectorAll('#finTable th.sortable .arrow').forEach(a => a.textContent = '');
      th.querySelector('.arrow').textContent = finSort.dir === 'asc' ? '▾' : '▴';
      renderFinTable();
    };
  });
  document.getElementById('finAddShortlistBtn').onclick = async () => {
    for (const id of finSelected) await saveShortlist(id, { status: 'Under Review', watchlist: 'Default' });
    alert(`Added ${finSelected.size} companies to your Investment Shortlist.`);
  };
  document.getElementById('finAddCompareBtn').onclick = () => {
    const ids = [...finSelected].slice(0, 5);
    if (ids.length < 2) { alert('Select at least 2 companies to compare.'); return; }
    location.hash = '#comparison?ids=' + ids.join(',');
  };
  document.getElementById('finExportBtn').onclick = () => {
    const ids = finBucketRows.map(c => c.id).join(',');
    window.open(`/api/export/companies.xlsx?ids=${encodeURIComponent(ids)}`, '_blank');
  };
  document.getElementById('finOpenScreenerBtn').onclick = () => {
    const params = {};
    if (finDimension === 'stage') params.dealType = finBucketLabel;
    location.hash = '#screener';
    setTimeout(() => applyScreenerParams(params), 200);
  };

  document.getElementById('finBoardGrid').style.display = '';
  document.getElementById('finBucketDetail').style.display = 'none';
  renderFinBoards();
}
