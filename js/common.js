const SEGMENT_COLORS = {
  'Distribution & Sales': '#9b85c4',
  'Underwriting & Risk Assessment': '#d98ca3',
  'Policy Administration & Core Systems': '#7ca3c4',
  'Claims Management': '#d99466',
  'Customer & Member Engagement': '#7fb8c9',
  'Full-Stack Carriers / MGAs': '#7fa876',
  'Reinsurance Tech': '#8c7fc4',
  'Compliance / RegTech': '#d9b468',
  'Benefits Administration': '#c98599',
  'Infrastructure / Enabling Tech': '#6fa89e',
  'Adjacent / Non-Core': '#6b6480',
};

const MODEL_COLORS = {
  'Software / SaaS': '#9b85c4',
  'Full-Stack Carrier': '#7fa876',
  'MGA / Delegated Underwriting Authority': '#d98ca3',
  'Broker / Agency': '#7ca3c4',
  'Marketplace / Comparison Platform': '#d99466',
  'Data, Analytics & API Provider': '#7fb8c9',
  'Embedded / Affinity Insurance Enabler': '#8c7fc4',
  'Services / BPO': '#d9b468',
};

function segColor(seg) { return SEGMENT_COLORS[seg] || '#6b6480'; }
function modelColor(m) { return MODEL_COLORS[m] || '#6b6480'; }

/* ---------- Edit access gate (viewing is public; editing needs a shared code the
   owner can hand out to specific collaborators) ---------- */
function getEditToken() { return localStorage.getItem('editToken') || ''; }
function setEditToken(t) { if (t) localStorage.setItem('editToken', t); else localStorage.removeItem('editToken'); }

async function promptEditAccess() {
  const code = prompt("Editing this site requires a shared edit code. Enter it below (ask the site owner if you don't have one):");
  if (!code) return false;
  const check = await fetch('/api/edit-access/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: code })
  });
  const data = await check.json();
  if (!data.ok) { alert('That code is incorrect.'); return false; }
  setEditToken(code);
  alert('Editing unlocked for this browser.');
  updateEditAccessIndicator();
  return true;
}

async function editFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers, { 'X-Edit-Token': getEditToken() });
  let res = await fetch(url, options);
  if (res.status === 401) {
    const unlocked = await promptEditAccess();
    if (unlocked) {
      options.headers['X-Edit-Token'] = getEditToken();
      res = await fetch(url, options);
    }
  }
  return res;
}

function updateEditAccessIndicator() {
  const el = document.getElementById('editAccessIndicator');
  if (!el) return;
  el.textContent = getEditToken() ? '🔓 Editing unlocked' : '🔒 Editing locked';
  el.title = getEditToken() ? 'Click to lock editing again on this browser' : 'Click to unlock editing with a shared code';
}
function toggleEditAccess() {
  if (getEditToken()) { setEditToken(''); updateEditAccessIndicator(); }
  else promptEditAccess();
}

function tagHtml(text, color) {
  if (!text) return '';
  return `<span class="tag" style="background:${color}">${text}</span>`;
}

async function loadCompanies() {
  const res = await fetch('/api/companies');
  return res.json();
}

async function loadMeta() {
  const res = await fetch('/api/meta');
  return res.json();
}

function isPublic(c) {
  return !!(c.ticker && c.ticker.trim());
}

function companyValuation(c) { return c.lastFinancingValuation ?? c.valuationEstimate ?? null; }
function fmtMoney(v) { return v == null ? naText(null) : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M'; }
function fmtMoneyPlain(v) { return v == null ? '' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M'; }
function fmtDate(d) {
  if (!d) return naText(null);
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : escapeHtml(s);
}

async function loadShortlist() {
  const res = await fetch('/api/shortlist');
  return res.json();
}
async function saveShortlist(companyId, payload) {
  const res = await editFetch(`/api/shortlist/${encodeURIComponent(companyId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return res.json();
}
async function removeShortlist(companyId) {
  const res = await editFetch(`/api/shortlist/${encodeURIComponent(companyId)}`, { method: 'DELETE' });
  return res.json();
}

async function loadScoreTemplates() {
  const res = await fetch('/api/score-templates');
  return res.json();
}
async function saveScoreTemplate(name, categories) {
  const res = await editFetch('/api/score-templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, categories })
  });
  return res.json();
}
async function deleteScoreTemplate(id) {
  const res = await editFetch(`/api/score-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.json();
}

async function loadScreeningScorecards() {
  const res = await fetch('/api/screening-scorecards');
  return res.json();
}
async function saveScreeningScorecard(companyId, payload) {
  const res = await editFetch(`/api/screening-scorecards/${encodeURIComponent(companyId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return res.json();
}
async function removeScreeningScorecard(companyId) {
  const res = await editFetch(`/api/screening-scorecards/${encodeURIComponent(companyId)}`, { method: 'DELETE' });
  return res.json();
}

/* ---------- Company CRUD (add/edit/delete, single + bulk) ---------- */
async function createCompany(payload) {
  const res = await editFetch('/api/companies', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return res.json();
}
async function bulkCreateCompanies(names) {
  const res = await editFetch('/api/companies/bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names })
  });
  return res.json();
}
async function deleteCompany(companyId) {
  const res = await editFetch(`/api/companies/${encodeURIComponent(companyId)}`, { method: 'DELETE' });
  return res.json();
}
async function bulkDeleteCompanies(ids) {
  const res = await editFetch('/api/companies/bulk-delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids })
  });
  return res.json();
}

/* ---------- Custom data fields (user-defined columns + per-company values) ---------- */
async function loadCustomFieldDefs() {
  const res = await fetch('/api/custom-fields');
  return res.json();
}
async function createCustomFieldDef(name, fieldType) {
  const res = await editFetch('/api/custom-fields', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, field_type: fieldType })
  });
  return res.json();
}
async function deleteCustomFieldDef(id) {
  const res = await editFetch(`/api/custom-fields/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.json();
}
async function saveCustomFieldValue(companyId, fieldId, value) {
  const res = await editFetch(`/api/custom-fields/values/${encodeURIComponent(companyId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_id: fieldId, value })
  });
  return res.json();
}

/* ---------- Custom dashboard widgets ---------- */
async function loadDashboardWidgets() {
  const res = await fetch('/api/dashboard-widgets');
  return res.json();
}
async function createDashboardWidget(payload) {
  const res = await editFetch('/api/dashboard-widgets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return res.json();
}
async function deleteDashboardWidget(id) {
  const res = await editFetch(`/api/dashboard-widgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.json();
}
async function reorderDashboardWidget(id, position) {
  const res = await editFetch(`/api/dashboard-widgets/${encodeURIComponent(id)}/position`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position })
  });
  return res.json();
}

/* ---------- Generic slide-over (reused by chart-click popups, vertical-map detail, etc.) ---------- */
function openSlideOver(html) {
  document.getElementById('slideOverContent').innerHTML = html;
  document.getElementById('slideOver').classList.add('open');
  document.getElementById('slideOverBackdrop').classList.add('open');
}
function closeSlideOver() {
  document.getElementById('slideOver').classList.remove('open');
  document.getElementById('slideOverBackdrop').classList.remove('open');
}

function companyListHtml(companies, limit) {
  const shown = companies.slice(0, limit || 25);
  return `
    <div style="max-height:50vh;overflow-y:auto;margin-top:10px;">
      ${shown.map(c => `
        <div class="company-hover" ${companyHoverAttrs(c)} onclick="closeSlideOver(); location.hash='#company/${encodeURIComponent(c.id)}'"
             style="padding:9px 4px;border-bottom:1px solid rgba(155,133,196,0.08);cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;font-size:13px;color:var(--indigo);">${escapeHtml(c.name)}</span>
          <span class="subtle" style="font-size:11.5px;">${naText(c.segment)}</span>
        </div>
      `).join('')}
    </div>
    ${companies.length > shown.length ? `<p class="footer-note">+ ${companies.length - shown.length} more</p>` : ''}
  `;
}

function openChartPopup(title, subtitle, companies, screenerLinkParams) {
  openSlideOver(`
    <button class="so-close" onclick="closeSlideOver()">✕</button>
    <h2>${title}</h2>
    <p class="subtle">${subtitle || ''}</p>
    ${companyListHtml(companies, 30)}
    ${screenerLinkParams ? `<button class="mini-btn primary" style="margin-top:12px;width:100%;" onclick="closeSlideOver(); location.hash='#screener'; setTimeout(() => applyScreenerParams(${JSON.stringify(screenerLinkParams).replace(/"/g, '&quot;')}), 200);">Open in Screener →</button>` : ''}
  `);
}

/* Hit-testing helper for canvas charts: pass {x,y,w,h,onClick} regions, handles DPI/CSS-size scaling. */
function attachClickRegions(canvas, regions) {
  if (canvas._regionClickHandler) canvas.removeEventListener('click', canvas._regionClickHandler);
  const handler = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (evt.clientX - rect.left) * scaleX;
    const y = (evt.clientY - rect.top) * scaleY;
    for (const r of regions) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { r.onClick(); return; }
    }
  };
  canvas._regionClickHandler = handler;
  canvas.addEventListener('click', handler);
  canvas.style.cursor = regions.length ? 'pointer' : 'default';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/* Standard "missing value" rendering — used everywhere a field can be blank/null */
function naText(value) {
  if (value === null || value === undefined || value === '' ) return '<span class="no-info">No information available</span>';
  return escapeHtml(value);
}

/* Wrap a rendered value with a hoverable source-link icon. Pass the already-escaped/rendered
   inner HTML plus the raw source URL (and optional label). If no sourceUrl, returns innerHtml unchanged. */
function withSource(innerHtml, sourceUrl, sourceLabel) {
  if (!sourceUrl) return innerHtml;
  return `<span class="has-source" data-source-url="${escapeHtml(sourceUrl)}" data-source-label="${escapeHtml(sourceLabel || sourceUrl)}">${innerHtml}<sup class="src-icon">ⓘ</sup></span>`;
}

/* ---------- Hover card (shared across all views) ---------- */
function initHoverCard() {
  const card = document.createElement('div');
  card.id = 'hover-card';
  document.body.appendChild(card);
  let active = null;
  let overCard = false;
  let hideTimer = null;

  function row(label, value) {
    if (!value) return '';
    return `<div class="hc-row"><span class="hc-label">${label}</span><span class="hc-value">${escapeHtml(value)}</span></div>`;
  }

  function show(el, evt) {
    clearTimeout(hideTimer);
    active = el;
    const d = el.dataset;
    const perf = window.companyPerformance ? window.companyPerformance[d.id] : null;
    const c = typeof byId === 'function' ? byId(d.id) : null;
    const scaleMetric = (c && SCORE_CTX && typeof metricScale === 'function') ? metricScale(c, SCORE_CTX) : null;
    card.classList.remove('hc-positive', 'hc-negative');
    let perfRow = '';
    if (perf) {
      card.classList.add(perf.pct >= 0 ? 'hc-positive' : 'hc-negative');
      const arrow = perf.pct >= 0 ? '▲' : '▼';
      perfRow = `<div class="hc-row"><span class="hc-label">1Y performance</span><span class="hc-value" style="font-weight:800;color:${perf.pct >= 0 ? '#16a34a' : '#dc2626'}">${arrow} ${Math.abs(perf.pct).toFixed(1)}% (${perf.ticker})</span></div>`;
    }

    const verticalTags = (d.verticals || '').split(',').map(v => v.trim()).filter(Boolean);
    const emergingTags = (d.emergingspaces || '').split(',').map(v => v.trim()).filter(Boolean);
    const productsHtml = (verticalTags.length || emergingTags.length) ? `
      <div class="hc-row" style="align-items:flex-start;">
        <span class="hc-label">Products</span>
        <span class="hc-value">${verticalTags.map(v => `<span class="hc-tag">${escapeHtml(v)}</span>`).join('')}${emergingTags.map(v => `<span class="hc-tag hc-tag-emerging">${escapeHtml(v)}</span>`).join('')}</span>
      </div>` : '';

    const scaleHtml = scaleMetric ? `
      <div class="hc-scale-bar" data-scale-id="${escapeHtml(d.id)}">
        <div class="hc-scale-label">Scalability <span class="hc-scale-num">${Math.round(scaleMetric.score)}/100</span></div>
        <div class="hc-scale-track"><div class="hc-scale-fill" style="width:${Math.max(0, Math.min(100, scaleMetric.score))}%"></div></div>
        <div class="hc-scale-hint">Click for the full scalability breakdown →</div>
      </div>` : '';

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        ${companyLogoHtml({ name: d.name, website: d.website }, 30)}
        <div>
          <div class="hc-title" style="margin:0;">${escapeHtml(d.name)}</div>
          <div class="hc-sub" style="margin:0;">${escapeHtml(d.hq || 'Unknown HQ')}${d.founded ? ' · Founded ' + d.founded : ''}</div>
        </div>
      </div>
      ${perfRow}
      ${productsHtml}
      ${scaleHtml}
      ${row('Segment', d.segment)}
      ${row('Business model', d.model)}
      ${row('Geography', d.geo)}
      ${row('Revenue model', d.revenue)}
      ${row('Moat', d.moat)}
      ${d.strategynotes ? `<div class="hc-desc"><strong>Replicate insight:</strong> ${escapeHtml(d.strategynotes)}</div>` : ''}
      ${d.desc ? `<div class="hc-desc">${escapeHtml(d.desc)}</div>` : ''}
    `;
    card.querySelectorAll('.hc-scale-bar').forEach(bar => {
      bar.onclick = (e) => {
        e.stopPropagation();
        if (typeof companyDetailLens !== 'undefined') companyDetailLens = 'replication';
        hide();
        location.hash = '#company/' + encodeURIComponent(bar.dataset.scaleId);
      };
    });
    card.style.display = 'block';
    position(evt);
  }

  function position(evt) {
    const pad = 16;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const rect = card.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = evt.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight) y = evt.clientY - rect.height - pad;
    card.style.left = x + 'px';
    card.style.top = y + 'px';
  }

  function hide() { active = null; card.style.display = 'none'; }
  function scheduleHide() { hideTimer = setTimeout(hide, 150); }

  document.addEventListener('mouseover', evt => {
    const el = evt.target.closest('.company-hover');
    if (el) show(el, evt);
  });
  document.addEventListener('mousemove', evt => { if (active && !overCard) position(evt); });
  document.addEventListener('mouseout', evt => {
    const el = evt.target.closest('.company-hover');
    const toCard = evt.relatedTarget && evt.relatedTarget.closest && evt.relatedTarget.closest('#hover-card');
    if (el && !el.contains(evt.relatedTarget) && !toCard) scheduleHide();
  });
  card.addEventListener('mouseenter', () => { overCard = true; clearTimeout(hideTimer); });
  card.addEventListener('mouseleave', () => { overCard = false; scheduleHide(); });
}

/* ---------- Source tooltip (hover any "has-source" element to see + click the link) ---------- */
function initSourceTooltip() {
  const tip = document.createElement('div');
  tip.id = 'source-tip';
  document.body.appendChild(tip);
  let hideTimer = null;

  function show(el, evt) {
    clearTimeout(hideTimer);
    const url = el.dataset.sourceUrl;
    const label = el.dataset.sourceLabel || url;
    tip.innerHTML = `Source: <a href="${url}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    tip.style.display = 'block';
    position(el, evt);
  }
  function position(el, evt) {
    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let x = rect.left, y = rect.bottom + 8;
    if (x + tipRect.width > window.innerWidth) x = window.innerWidth - tipRect.width - 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function scheduleHide() { hideTimer = setTimeout(() => { tip.style.display = 'none'; }, 200); }

  document.addEventListener('mouseover', evt => {
    const el = evt.target.closest('.has-source');
    if (el) show(el, evt);
    else if (!evt.target.closest('#source-tip')) { /* leave tip alone if hovering tip itself */ }
  });
  document.addEventListener('mouseout', evt => {
    const el = evt.target.closest('.has-source');
    const toTip = evt.relatedTarget && evt.relatedTarget.closest && evt.relatedTarget.closest('#source-tip');
    if (el && !toTip) scheduleHide();
  });
  tip.addEventListener('mouseleave', scheduleHide);
  tip.addEventListener('mouseover', () => clearTimeout(hideTimer));
}

/* ---------- Company logos (favicon of their real website, with colored-initial fallback) ---------- */
const LOGO_AVATAR_COLORS = ['#9b85c4', '#d98ca3', '#7fb8c9', '#d99466', '#7fa876', '#8c7fc4', '#d9b468', '#c98599'];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_AVATAR_COLORS[hash % LOGO_AVATAR_COLORS.length];
}
function domainOf(website) {
  if (!website) return null;
  return String(website).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();
}
function companyLogoHtml(c, size) {
  size = size || 32;
  const initial = escapeHtml((c.name || '?')[0].toUpperCase());
  const color = avatarColor(c.name || '');
  const fallback = `this.outerHTML='<div class=&quot;logo-fallback&quot; style=&quot;width:${size}px;height:${size}px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${size*0.42}px;flex-shrink:0;&quot;>${initial}</div>'`;
  const domain = domainOf(c.website);
  if (!domain) {
    return `<div class="logo-fallback" style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${size*0.42}px;flex-shrink:0;">${initial}</div>`;
  }
  return `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size*2}" width="${size}" height="${size}" style="border-radius:50%;flex-shrink:0;background:#f3f0ff;object-fit:cover;" onerror="${fallback}" alt="">`;
}

function companyHoverAttrs(c) {
  return `data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}" data-hq="${escapeHtml(c.hq || '')}" data-founded="${c.yearFounded || ''}"
    data-segment="${escapeHtml(c.segment || '')}" data-model="${escapeHtml(c.businessModel || '')}"
    data-geo="${escapeHtml(c.geo || '')}" data-revenue="${escapeHtml(c.revenueModel || '')}"
    data-moat="${escapeHtml(c.moat || '')}" data-strategynotes="${escapeHtml(c.strategyNotes || '')}"
    data-desc="${escapeHtml((c.description || '').slice(0, 280))}" data-website="${escapeHtml(c.website || '')}"
    data-verticals="${escapeHtml(c.verticals || '')}" data-emergingspaces="${escapeHtml(c.emergingSpaces || '')}"`;
}

/* ---------- Real 1-year performance for public companies only (no fabricated signal for private cos) ---------- */
window.companyPerformance = {};
async function loadPublicPerformance(companies) {
  const publicCos = companies.filter(isPublic);
  for (const c of publicCos) {
    try {
      const res = await fetch(`/api/prices/${encodeURIComponent(c.ticker)}?range=1y`);
      const data = await res.json();
      if (data.points && data.points.length >= 2) {
        const first = data.points[0].close, last = data.points[data.points.length - 1].close;
        const pct = ((last - first) / first) * 100;
        window.companyPerformance[c.id] = { pct, ticker: c.ticker };
      }
    } catch (e) { /* skip silently — chart elsewhere will still report the fetch error */ }
  }
}
