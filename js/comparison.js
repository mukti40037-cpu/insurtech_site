let compareIds = [];
const COMPARE_COLORS = ['#9b85c4', '#d98ca3', '#7fb8c9', '#d99466', '#7fa876'];

function renderComparePicker() {
  document.getElementById('comparePicker').innerHTML = Array.from({ length: 5 }).map((_, i) => {
    const id = compareIds[i];
    const c = id ? byId(id) : null;
    if (!c) return `<div class="compare-slot">Slot ${i + 1} — <input type="text" class="compare-search" data-slot="${i}" placeholder="Search company..." style="border:none;font-size:12.5px;width:130px;outline:none;"></div>`;
    return `<div class="compare-slot filled" style="border-color:${COMPARE_COLORS[i]};display:flex;align-items:center;gap:8px;">
      ${companyLogoHtml(c, 28)}
      <div style="flex:1;"><span class="remove-x" data-remove-slot="${i}">✕</span>
      <strong>${escapeHtml(c.name)}</strong><br><span class="subtle">${naText(c.segment)}</span></div>
    </div>`;
  }).join('');

  document.querySelectorAll('[data-remove-slot]').forEach(el => {
    el.onclick = () => { compareIds.splice(parseInt(el.dataset.removeSlot), 1); renderComparePicker(); renderComparison(); };
  });
  document.querySelectorAll('.compare-search').forEach(input => {
    input.oninput = () => showCompareSuggestions(input);
  });
}

function showCompareSuggestions(input) {
  const q = input.value.toLowerCase();
  let box = document.getElementById('compareSuggestBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'compareSuggestBox';
    box.style.cssText = 'position:absolute;background:white;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.2);max-height:240px;overflow:auto;z-index:80;min-width:220px;';
    document.body.appendChild(box);
  }
  if (!q) { box.style.display = 'none'; return; }
  const matches = ALL.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = matches.map(c => `<div class="gsr-item" data-pick-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</div>`).join('') || '<div class="gsr-item">No matches</div>';
  const rect = input.getBoundingClientRect();
  box.style.left = rect.left + 'px';
  box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  box.style.display = 'block';
  box.querySelectorAll('[data-pick-id]').forEach(el => {
    el.onclick = () => {
      const slot = parseInt(input.dataset.slot);
      compareIds[slot] = el.dataset.pickId;
      box.style.display = 'none';
      renderComparePicker();
      renderComparison();
    };
  });
}
document.addEventListener('click', evt => {
  const box = document.getElementById('compareSuggestBox');
  if (box && !evt.target.closest('.compare-search') && !evt.target.closest('#compareSuggestBox')) box.style.display = 'none';
});

const COMPARE_METRICS = [
  { key: 'segment', label: 'Value Chain Segment', fmt: c => naText(c.segment), higherBetter: null },
  { key: 'businessModel', label: 'Business Model', fmt: c => naText(c.businessModel), higherBetter: null },
  { key: 'country', label: 'Country', fmt: c => naText(c.country || c.geo), higherBetter: null },
  { key: 'yearFounded', label: 'Founded', fmt: c => naText(c.yearFounded), higherBetter: null },
  { key: 'totalRaised', label: 'Total Raised ($M)', fmt: c => c.totalRaised != null ? fmtMoneyPlain(c.totalRaised) : naText(null), higherBetter: 'totalRaised' },
  { key: 'lastRound', label: 'Last Round', fmt: c => c.lastFinancingDate ? `${fmtDate(c.lastFinancingDate)} · ${c.lastFinancingSize != null ? fmtMoneyPlain(c.lastFinancingSize) : '—'}` : naText(null), higherBetter: null },
  { key: 'valuation', label: 'Valuation ($M)', fmt: c => companyValuation(c) != null ? fmtMoneyPlain(companyValuation(c)) : naText(null), higherBetter: 'valuation' },
  { key: 'capitalIntensity', label: 'Capital Intensity', fmt: c => naText(c.capitalIntensity), higherBetter: null },
  { key: 'revenueModel', label: 'Revenue Model', fmt: c => naText(c.revenueModel), higherBetter: null },
  { key: 'targetCustomer', label: 'Target Customer', fmt: c => naText(c.targetCustomer), higherBetter: null },
  { key: 'gtm', label: 'Go-to-Market Motion', fmt: c => naText(c.gtm), higherBetter: null },
  { key: 'moat', label: 'Moat / Defensibility', fmt: c => naText(c.moat), higherBetter: null },
  { key: 'ownershipStatus', label: 'Ownership Status', fmt: c => naText(c.ownershipStatus), higherBetter: null },
  { key: 'activeInvestors', label: 'Active Investors', fmt: c => naText(c.activeInvestors), higherBetter: null },
  { key: 'competitors', label: 'Competitors', fmt: c => naText(c.competitors), higherBetter: null },
  { key: 'ticker', label: 'Public Ticker', fmt: c => c.ticker ? withSource(escapeHtml(c.ticker), c.tickerSource, 'View source') : naText(null), higherBetter: null },
];

function renderComparison() {
  const companies = compareIds.map(byId).filter(Boolean);
  const wrap = document.getElementById('compareTableWrap');
  if (companies.length < 2) {
    wrap.innerHTML = '<div class="empty-state">Pick at least 2 companies above to compare.</div>';
    document.getElementById('compareCharts').innerHTML = '';
    return;
  }

  const ctx = buildScoreContext(ALL);
  const scored = companies.map(c => { const r = computeLensScore(c, ctx, 'investment'); return { c, score: r.overallScore, metrics: r.metrics }; });

  let html = '<table class="grid compare-table"><thead><tr><th class="metric-col">Metric</th>';
  companies.forEach((c, i) => html += `<th style="color:${COMPARE_COLORS[i]}">${escapeHtml(c.name)}</th>`);
  html += '</tr></thead><tbody>';

  html += '<tr><td class="metric-col">Opportunity Score</td>';
  const maxScore = Math.max(...scored.map(s => s.score));
  scored.forEach(s => html += `<td class="${s.score === maxScore ? 'best-cell' : ''}">${s.score.toFixed(1)}</td>`);
  html += '</tr>';

  COMPARE_METRICS.forEach(m => {
    html += `<tr><td class="metric-col">${m.label}</td>`;
    let best = null;
    if (m.higherBetter) {
      const vals = companies.map(c => m.higherBetter === 'valuation' ? companyValuation(c) : c[m.higherBetter]);
      best = Math.max(...vals.filter(v => v != null));
    }
    companies.forEach(c => {
      const raw = m.higherBetter ? (m.higherBetter === 'valuation' ? companyValuation(c) : c[m.higherBetter]) : null;
      const isBest = m.higherBetter && raw != null && raw === best;
      html += `<td class="${isBest ? 'best-cell' : ''}">${m.fmt(c)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;

  document.getElementById('compareCharts').innerHTML = `
    <div class="card" style="padding:20px;">
      <h3 style="margin-top:0;">Opportunity Score Breakdown (Radar)</h3>
      <canvas id="radarChart" width="500" height="420"></canvas>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;">
        ${companies.map((c, i) => `<span style="color:${COMPARE_COLORS[i]};font-weight:700;font-size:12px;">● ${escapeHtml(c.name)}</span>`).join('')}
      </div>
    </div>
    <div class="card" style="padding:20px;">
      <h3 style="margin-top:0;">Total Raised vs. Valuation</h3>
      <canvas id="compareBarChart" width="500" height="420"></canvas>
    </div>
  `;
  drawRadar(scored);
  drawCompareBars(companies);
}

function drawRadar(scored) {
  const canvas = document.getElementById('radarChart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dims = CANONICAL_CATEGORIES;
  const cx = canvas.width / 2, cy = canvas.height / 2, r = Math.min(cx, cy) - 60;
  const angleStep = (Math.PI * 2) / dims.length;

  ctx.strokeStyle = 'rgba(155,133,196,0.15)';
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    dims.forEach((d, i) => {
      const a = -Math.PI / 2 + i * angleStep;
      const rr = r * (ring / 4);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.stroke();
  }
  ctx.fillStyle = '#7d6e60'; ctx.font = '600 11px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
  dims.forEach((d, i) => {
    const a = -Math.PI / 2 + i * angleStep;
    const x = cx + Math.cos(a) * (r + 28), y = cy + Math.sin(a) * (r + 28);
    ctx.fillText(d.label, x, y);
  });

  scored.forEach((s, si) => {
    ctx.beginPath();
    dims.forEach((d, i) => {
      const val = (s.metrics[d.key] && s.metrics[d.key].score) ?? 0;
      const a = -Math.PI / 2 + i * angleStep;
      const rr = r * (val / 100);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = COMPARE_COLORS[si]; ctx.lineWidth = 2;
    ctx.fillStyle = COMPARE_COLORS[si] + '22';
    ctx.fill(); ctx.stroke();
  });
}

function drawCompareBars(companies) {
  const canvas = document.getElementById('compareBarChart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pairs = companies.map(c => ({ c, name: c.name, raised: c.totalRaised || 0, val: companyValuation(c) || 0 }));
  const max = Math.max(...pairs.map(p => Math.max(p.raised, p.val)), 1);
  const padLeft = 130, padTop = 20, rowH = (canvas.height - 40) / pairs.length;
  const regions = [];
  pairs.forEach((p, i) => {
    const y = padTop + i * rowH;
    ctx.fillStyle = '#3d342e'; ctx.font = '700 12px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((p.name || '').slice(0, 18), padLeft - 10, y + 14);
    const w1 = (p.raised / max) * (canvas.width - padLeft - 30);
    const w2 = (p.val / max) * (canvas.width - padLeft - 30);
    ctx.fillStyle = '#9b85c4'; ctx.fillRect(padLeft, y, w1, 12);
    ctx.fillStyle = '#d98ca3'; ctx.fillRect(padLeft, y + 16, w2, 12);
    ctx.fillStyle = '#7d6e60'; ctx.font = '600 10px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('$' + Math.round(p.raised) + 'M raised', padLeft + w1 + 6, y + 10);
    ctx.fillText('$' + Math.round(p.val) + 'M valuation', padLeft + w2 + 6, y + 26);
    regions.push({ x: 0, y, w: canvas.width, h: rowH, onClick: () => { location.hash = '#company/' + encodeURIComponent(p.c.id); } });
  });
  attachClickRegions(canvas, regions);
}

function initComparisonPage(initialIds) {
  compareIds = (initialIds || []).slice(0, 5);
  renderComparePicker();
  renderComparison();
}
