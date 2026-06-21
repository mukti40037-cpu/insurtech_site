function renderDashboardKpis() {
  const all = ALL;
  const withFunding = all.filter(c => c.totalRaised != null);
  const withValuation = all.filter(c => companyValuation(c) != null);
  const pub = all.filter(isPublic);
  const countries = new Set(all.map(c => c.country).filter(Boolean));
  const segments = new Set(all.map(c => c.segment).filter(Boolean));
  const totalRaisedSum = withFunding.reduce((s, c) => s + c.totalRaised, 0);
  const avgValuation = withValuation.length ? withValuation.reduce((s, c) => s + companyValuation(c), 0) / withValuation.length : null;
  const ages = all.map(c => c.yearFounded ? (new Date().getFullYear() - c.yearFounded) : null).filter(v => v != null);
  const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;

  const kpis = [
    ['Total Companies', all.length],
    ['Combined Total Raised', '$' + Math.round(totalRaisedSum).toLocaleString() + 'M'],
    ['Avg. Disclosed Valuation', avgValuation != null ? '$' + Math.round(avgValuation).toLocaleString() + 'M' : 'No information available'],
    ['Companies w/ Disclosed Funding', withFunding.length + ' / ' + all.length],
    ['Countries Covered', countries.size],
    ['Value Chain Segments', segments.size],
    ['Publicly Traded', pub.length],
    ['Avg. Company Age', avgAge != null ? avgAge + ' yrs' : 'No information available'],
  ];
  document.getElementById('dashKpiGrid').innerHTML = kpis.map(([label, val]) => `
    <div class="stat-pill"><span class="num">${val}</span><span class="label">${label}</span></div>
  `).join('');
}

function renderTopPicks() {
  const ctx = buildScoreContext(ALL);
  const top3 = ALL.map(c => ({ c, score: computeLensScore(c, ctx, 'investment').overallScore }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  document.getElementById('topPicksGeneral').innerHTML = top3.map((r, i) => `
    <div class="pb-company-card" style="margin-bottom:8px;cursor:pointer;" onclick="location.hash='#playbooks?company=${encodeURIComponent(r.c.id)}&type=investment'">
      <span class="rank-badge ${i < 1 ? 'top3' : ''}">${i + 1}</span>
      ${companyLogoHtml(r.c, 32)}
      <div><div class="pb-cname">${escapeHtml(r.c.name)}</div><div class="pb-cmeta">${naText(r.c.segment)} · Investment Score ${r.score.toFixed(1)}</div></div>
    </div>
  `).join('');

  if (PRYPCO && PRYPCO.roadmap) {
    const critical = PRYPCO.roadmap.filter(r => r.priority.tier === 'Critical');
    document.getElementById('topPicksPrypco').innerHTML = critical.map(r => `
      <div class="pb-company-card" style="margin-bottom:8px;cursor:pointer;" onclick="location.hash='#prypco'">
        <span class="rank-badge top3">${r.rank}</span>
        <div><div class="pb-cname">${escapeHtml(r.vertical)}</div><div class="pb-cmeta">${r.partners.length} partner(s) · ${escapeHtml(r.timeToLaunch.raw)}</div></div>
      </div>
    `).join('');
  } else {
    document.getElementById('topPicksPrypco').innerHTML = '<div class="subtle">Visit the Prypco Strategy page once to load this data.</div>';
  }
}

function renderSegmentTreemap() {
  const counts = {};
  ALL.forEach(c => { if (c.segment) counts[c.segment] = (counts[c.segment] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  document.getElementById('segmentTreemap').innerHTML = entries.map(([seg, count]) => {
    const pct = (count / total) * 100;
    return `<div class="tm-cell" style="flex-grow:${count};cursor:pointer;background:linear-gradient(135deg,${segColor(seg)},${segColor(seg)}cc);" title="${escapeHtml(seg)}: ${count}" data-tm-seg="${escapeHtml(seg)}">
      <div class="tm-label">${escapeHtml(seg)}</div>
      <div class="tm-count">${count}</div>
      <div class="tm-pct">${pct.toFixed(1)}%</div>
    </div>`;
  }).join('');
  document.querySelectorAll('[data-tm-seg]').forEach(el => {
    el.onclick = () => {
      const seg = el.dataset.tmSeg;
      const companies = ALL.filter(c => c.segment === seg);
      openChartPopup(`🧩 ${seg}`, `${companies.length} companies in this segment`, companies, { segment: seg });
    };
  });
}

function drawHBarChart(canvasId, data, opts) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 40;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (data.length === 0) { attachClickRegions(canvas, []); return; }
  const max = Math.max(...data.map(d => d.value));
  const padLeft = opts.padLeft || 160, padRight = 70, padTop = 10, padBottom = 10;
  const rowH = (canvas.height - padTop - padBottom) / data.length;
  const barAreaW = canvas.width - padLeft - padRight;
  const regions = [];
  data.forEach((d, i) => {
    const y = padTop + i * rowH;
    const barW = Math.max(4, (d.value / max) * barAreaW);
    const grad = ctx.createLinearGradient(padLeft, 0, padLeft + barW, 0);
    grad.addColorStop(0, d.color || '#9b85c4');
    grad.addColorStop(1, '#d98ca3');
    ctx.fillStyle = grad;
    const barH = rowH * 0.6;
    const barY = y + (rowH - barH) / 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(padLeft, barY, barW, barH, 6) : ctx.rect(padLeft, barY, barW, barH);
    ctx.fill();
    ctx.fillStyle = '#3d342e'; ctx.font = '600 12px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((d.label || '').slice(0, 22), padLeft - 10, barY + barH / 2 + 4);
    ctx.fillStyle = '#7d6e60'; ctx.font = '700 12px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(d.valueLabel || String(d.value), padLeft + barW + 8, barY + barH / 2 + 4);
    if (d.onClick) regions.push({ x: 0, y, w: canvas.width, h: rowH, onClick: d.onClick });
  });
  attachClickRegions(canvas, regions);
}

function renderTopCountries() {
  const counts = {};
  ALL.forEach(c => { if (c.country) counts[c.country] = (counts[c.country] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([country, n]) => ({
      label: country, value: n, valueLabel: String(n), color: '#7fb8c9',
      onClick: () => {
        const companies = ALL.filter(c => c.country === country);
        openChartPopup(`🌍 ${country}`, `${companies.length} companies headquartered here`, companies, { country });
      }
    }));
  drawHBarChart('topCountriesChart', top, {});
}

function renderFundingActivityByYear() {
  const counts = {};
  ALL.forEach(c => {
    if (!c.lastFinancingDate) return;
    const y = String(c.lastFinancingDate).slice(0, 4);
    if (y && y !== 'null' && /^\d{4}$/.test(y)) counts[y] = (counts[y] || 0) + 1;
  });
  const years = Object.keys(counts).sort();
  const canvas = document.getElementById('fundingActivityChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 40;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (years.length === 0) { attachClickRegions(canvas, []); return; }
  const max = Math.max(...years.map(y => counts[y]));
  const padLeft = 50, padRight = 20, padTop = 20, padBottom = 30;
  const w = canvas.width - padLeft - padRight, h = canvas.height - padTop - padBottom;
  const barW = w / years.length * 0.6;
  const regions = [];
  years.forEach((y, i) => {
    const barH = (counts[y] / max) * h;
    const x = padLeft + (i / years.length) * w + (w / years.length - barW) / 2;
    const grad = ctx.createLinearGradient(0, padTop + h - barH, 0, padTop + h);
    grad.addColorStop(0, '#9b85c4'); grad.addColorStop(1, '#7fb8c9');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, padTop + h - barH, barW, barH, 4) : ctx.rect(x, padTop + h - barH, barW, barH);
    ctx.fill();
    ctx.fillStyle = '#3d342e'; ctx.font = '700 11px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(counts[y], x + barW / 2, padTop + h - barH - 6);
    ctx.fillStyle = '#7d6e60'; ctx.font = '600 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(y, x + barW / 2, padTop + h + 18);
    regions.push({
      x, y: padTop, w: barW, h: h, onClick: () => {
        const companies = ALL.filter(c => c.lastFinancingDate && String(c.lastFinancingDate).slice(0, 4) === y);
        openChartPopup(`📈 Last rounds in ${y}`, `${companies.length} companies`, companies);
      }
    });
  });
  attachClickRegions(canvas, regions);
}

function renderRaisedVsValuationBubble() {
  const pts = ALL.filter(c => c.totalRaised != null && companyValuation(c) != null);
  const canvas = document.getElementById('bubbleChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 40;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('bubbleCount').textContent = pts.length;
  if (pts.length === 0) { attachClickRegions(canvas, []); return; }
  const pad = 50;
  const xs = pts.map(c => Math.log10(c.totalRaised + 1));
  const ys = pts.map(c => Math.log10(companyValuation(c) + 1));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const w = canvas.width - pad * 2, h = canvas.height - pad * 2;

  ctx.strokeStyle = 'rgba(155,133,196,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, pad + h); ctx.lineTo(pad + w, pad + h); ctx.stroke();
  ctx.fillStyle = '#7d6e60'; ctx.font = '600 11px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Total Raised (log scale) →', pad + w / 2, pad + h + 32);
  ctx.save(); ctx.translate(16, pad + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Valuation (log scale) →', 0, 0); ctx.restore();

  const regions = [];
  pts.forEach((c, i) => {
    const x = pad + ((xs[i] - xMin) / (xMax - xMin || 1)) * w;
    const y = pad + h - ((ys[i] - yMin) / (yMax - yMin || 1)) * h;
    ctx.beginPath();
    ctx.fillStyle = segColor(c.segment) + 'b0';
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    regions.push({
      x: x - 9, y: y - 9, w: 18, h: 18, onClick: () => {
        openChartPopup(`💎 ${c.name}`,
          `Raised ${fmtMoneyPlain(c.totalRaised)} · Valued ${fmtMoneyPlain(companyValuation(c))} · ${naText(c.segment)}`,
          [c]);
      }
    });
  });
  attachClickRegions(canvas, regions);
}

function renderCompanyAgeHistogram() {
  const buckets = { '0-2 yrs': [], '3-5 yrs': [], '6-10 yrs': [], '11-15 yrs': [], '16-20 yrs': [], '20+ yrs': [] };
  const curYear = new Date().getFullYear();
  ALL.forEach(c => {
    if (!c.yearFounded) return;
    const age = curYear - c.yearFounded;
    if (age <= 2) buckets['0-2 yrs'].push(c);
    else if (age <= 5) buckets['3-5 yrs'].push(c);
    else if (age <= 10) buckets['6-10 yrs'].push(c);
    else if (age <= 15) buckets['11-15 yrs'].push(c);
    else if (age <= 20) buckets['16-20 yrs'].push(c);
    else buckets['20+ yrs'].push(c);
  });
  const data = Object.entries(buckets).map(([label, companies]) => ({
    label, value: companies.length, valueLabel: String(companies.length), color: '#d98ca3',
    onClick: () => openChartPopup(`🎂 Companies aged ${label}`, `${companies.length} companies`, companies)
  }));
  drawHBarChart('ageHistogramChart', data, { padLeft: 90 });
}

/* ---------- Custom dashboard widgets (user-defined sections) ---------- */
const WIDGET_FIELD_OPTIONS = [
  { key: 'segment', label: 'Primary Segment' }, { key: 'businessModel', label: 'Business Model' },
  { key: 'country', label: 'Country' }, { key: 'ownershipStatus', label: 'Ownership Status' },
  { key: 'businessStatus', label: 'Business Status' }, { key: 'moat', label: 'Moat' },
  { key: 'capitalIntensity', label: 'Capital Intensity' },
];
const WIDGET_NUMERIC_FIELDS = [
  { key: 'totalRaised', label: 'Total Raised ($M)' }, { key: 'yearFounded', label: 'Year Founded' },
  { key: 'successProbability', label: 'Success Probability' },
];

let customWidgets = [];

function widgetCustomFieldOptions() {
  return CUSTOM_FIELD_DEFS.filter(f => f.field_type !== 'date').map(f => ({ key: 'custom:' + f.name, label: f.name + ' (custom)' }));
}

function widgetFieldValue(c, fieldKey) {
  if (fieldKey.startsWith('custom:')) return (c.customFields || {})[fieldKey.slice(7)];
  return c[fieldKey];
}

function computeKpiWidget(cfg) {
  const vals = ALL.map(c => widgetFieldValue(c, cfg.field)).filter(v => v != null && v !== '').map(Number).filter(v => !isNaN(v));
  if (cfg.aggregation === 'count') return ALL.filter(c => { const v = widgetFieldValue(c, cfg.field); return v != null && v !== ''; }).length;
  if (!vals.length) return null;
  if (cfg.aggregation === 'sum') return vals.reduce((a, b) => a + b, 0);
  if (cfg.aggregation === 'avg') return vals.reduce((a, b) => a + b, 0) / vals.length;
  return null;
}

function renderKpiWidget(w) {
  const val = computeKpiWidget(w.config);
  const display = val == null ? 'No information available' : Number.isFinite(val) ? val.toLocaleString(undefined, { maximumFractionDigits: 1 }) : val;
  return `<div class="stat-pill" style="background:rgba(155,133,196,0.08);"><span class="num" style="color:var(--purple);">${display}</span><span class="label">${escapeHtml(w.title)}</span></div>`;
}

function renderBarGroupWidget(w) {
  const counts = {};
  ALL.forEach(c => { const v = widgetFieldValue(c, w.config.groupByField); if (v) counts[v] = (counts[v] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, w.config.limit || 10);
  const max = Math.max(...top.map(t => t[1]), 1);
  return top.map(([label, count]) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div style="flex:1;background:rgba(155,133,196,0.08);border-radius:6px;height:18px;overflow:hidden;"><div style="height:100%;width:${(count/max)*100}%;background:linear-gradient(90deg,#9b85c4,#d98ca3);"></div></div>
      <div style="font-size:12.5px;font-weight:700;min-width:70px;">${escapeHtml(String(label))} (${count})</div>
    </div>`).join('') || '<div class="empty-state">No data.</div>';
}

function renderTopNWidget(w) {
  const lensKey = w.config.lens || 'investment';
  const top = ALL.map(c => ({ c, score: computeLensScore(c, SCORE_CTX, lensKey).overallScore })).sort((a, b) => b.score - a.score).slice(0, w.config.n || 5);
  return top.map((r, i) => `<div class="pb-company-card" style="margin-bottom:8px;cursor:pointer;" onclick="location.hash='#company/${encodeURIComponent(r.c.id)}'">
    <span class="rank-badge ${i < 1 ? 'top3' : ''}">${i + 1}</span>${companyLogoHtml(r.c, 28)}
    <div><div class="pb-cname">${escapeHtml(r.c.name)}</div><div class="pb-cmeta">${naText(r.c.segment)} · ${r.score.toFixed(1)}</div></div>
  </div>`).join('') || '<div class="empty-state">No data.</div>';
}

async function renderCustomWidgets() {
  customWidgets = await loadDashboardWidgets();
  document.getElementById('customWidgetsGrid').innerHTML = customWidgets.map(w => `
    <div class="card" style="padding:20px;" data-widget-id="${w.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0 0 10px;color:var(--purple);">${escapeHtml(w.title)}</h3>
        <span class="remove-x" data-remove-widget="${w.id}" title="Remove widget">×</span>
      </div>
      ${w.type === 'kpi' ? renderKpiWidget(w) : w.type === 'bargroup' ? renderBarGroupWidget(w) : renderTopNWidget(w)}
    </div>
  `).join('') || '<p class="footer-note">No custom widgets yet — click "+ Add Widget" to build your own dashboard section.</p>';

  document.querySelectorAll('[data-remove-widget]').forEach(x => {
    x.onclick = async () => {
      await deleteDashboardWidget(x.dataset.removeWidget);
      renderCustomWidgets();
    };
  });
}

function openAddWidgetPanel() {
  const allFieldOptions = WIDGET_FIELD_OPTIONS.concat(widgetCustomFieldOptions());
  const numericOptions = WIDGET_NUMERIC_FIELDS.concat(widgetCustomFieldOptions());
  const html = `
    <h2>+ Add Dashboard Widget</h2>
    <label>Widget Type
      <select id="widgetTypeSelect">
        <option value="kpi">KPI tile (a single aggregated number)</option>
        <option value="bargroup">Bar breakdown (count companies by a field)</option>
        <option value="topn">Top N companies by score</option>
      </select>
    </label>
    <label>Title <input type="text" id="widgetTitleInput" placeholder="e.g. Companies with Disclosed Funding"></label>
    <div id="widgetConfigArea"></div>
    <button class="mini-btn primary" id="submitWidgetBtn" style="margin-top:10px;">Add Widget</button>
  `;
  openSlideOver(html);

  function renderConfigArea() {
    const type = document.getElementById('widgetTypeSelect').value;
    const area = document.getElementById('widgetConfigArea');
    if (type === 'kpi') {
      area.innerHTML = `
        <label>Field <select id="kpiFieldSelect">${numericOptions.map(f => `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join('')}</select></label>
        <label>Aggregation <select id="kpiAggSelect"><option value="count">Count of companies with this field set</option><option value="sum">Sum</option><option value="avg">Average</option></select></label>`;
    } else if (type === 'bargroup') {
      area.innerHTML = `<label>Group by <select id="bargroupFieldSelect">${allFieldOptions.map(f => `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join('')}</select></label>
        <label>Show top <input type="number" id="bargroupLimitInput" value="10" min="3" max="20"></label>`;
    } else {
      area.innerHTML = `<label>Lens <select id="topnLensSelect"><option value="investment">Investment Opportunity</option><option value="acquisition">Acquisition Target</option><option value="replication">Replication Target</option></select></label>
        <label>Show top <input type="number" id="topnNInput" value="5" min="3" max="15"></label>`;
    }
  }
  document.getElementById('widgetTypeSelect').onchange = renderConfigArea;
  renderConfigArea();

  document.getElementById('submitWidgetBtn').onclick = async () => {
    const type = document.getElementById('widgetTypeSelect').value;
    const title = document.getElementById('widgetTitleInput').value.trim();
    if (!title) { alert('Enter a widget title.'); return; }
    let config = {};
    if (type === 'kpi') config = { field: document.getElementById('kpiFieldSelect').value, aggregation: document.getElementById('kpiAggSelect').value };
    else if (type === 'bargroup') config = { groupByField: document.getElementById('bargroupFieldSelect').value, limit: parseInt(document.getElementById('bargroupLimitInput').value) || 10 };
    else config = { lens: document.getElementById('topnLensSelect').value, n: parseInt(document.getElementById('topnNInput').value) || 5 };

    const result = await createDashboardWidget({ type, title, config });
    if (result && result.error) { alert(result.error); return; }
    closeSlideOver();
    renderCustomWidgets();
  };
}

function initDashboardPage() {
  renderDashboardKpis();
  renderTopPicks();
  renderCustomWidgets();
  renderSegmentTreemap();
  renderTopCountries();
  renderFundingActivityByYear();
  renderRaisedVsValuationBubble();
  renderCompanyAgeHistogram();
  document.getElementById('addWidgetBtn').onclick = openAddWidgetPanel;
}
window.addEventListener('resize', () => { if ((location.hash || '#dashboard') === '#dashboard') initDashboardPage(); });
