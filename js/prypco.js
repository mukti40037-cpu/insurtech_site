let PRYPCO = null;
let prypcoSubview = 'overview';
let landscapeFilterState = { verticals: new Set(), region: '', stage: '', relevance: '' };
let vmapMode = 'diagram';
let roadmapSort = 'rank';

const TIER_COLORS = { Critical: '#c97a7a', High: '#d99466', Medium: '#d9b468', Watch: '#7fa876' };
function tierColor(tier) { return TIER_COLORS[tier] || '#6b6480'; }

async function loadPrypcoData() {
  if (PRYPCO) return PRYPCO;
  const res = await fetch('/api/prypco');
  PRYPCO = await res.json();
  return PRYPCO;
}

function switchPrypcoSubview(view) {
  prypcoSubview = view;
  document.querySelectorAll('#view-prypco .prypco-subtabs .view-tab').forEach(t => t.classList.toggle('active', t.dataset.psub === view));
  ['overview', 'map', 'landscape', 'roadmap'].forEach(v => {
    document.getElementById('prypco-' + v).style.display = v === view ? '' : 'none';
  });
}

/* ---------- Overview ---------- */
function renderPrypcoOverview() {
  const m = PRYPCO.meta;
  document.getElementById('prypcoKpiRow').innerHTML = `
    <div class="stat-pill"><span class="num">${m.verticalCount}</span><span class="label">Insurtech Verticals Mapped</span></div>
    <div class="stat-pill"><span class="num">~${m.companyCount}</span><span class="label">Companies Tracked</span></div>
    <div class="stat-pill"><span class="num">${m.roadmapCount}</span><span class="label">Prioritized Initiatives</span></div>
    <div class="stat-pill"><span class="num">${m.criticalCount}</span><span class="label">Critical-Priority Opportunities</span></div>
  `;
  document.getElementById('prypcoTierTeaser').innerHTML = ['Critical', 'High', 'Medium', 'Watch'].map(tier => `
    <div class="tier-chip" style="background:${tierColor(tier)}">
      <span class="tc-count">${m.tierCounts[tier] || 0}</span>${tier}
    </div>
  `).join('');
  if (m.extraCompanyVerticals.length) {
    document.getElementById('prypcoDataNote').innerHTML = `
      <p class="footer-note">Note: the company directory also tags ${m.extraCompanyVerticals.length} companies under
      "${m.extraCompanyVerticals.join('", "')}" — categories present in the company list but without a formal entry in the
      Vertical Map sheet. They're still browsable in the Insurtech Landscape.</p>`;
  }
}

/* ---------- Vertical Map ---------- */
function renderVerticalMap() {
  if (vmapMode === 'diagram') {
    document.getElementById('vmapDiagramWrap').style.display = '';
    document.getElementById('vmapCardWrap').style.display = 'none';
    drawVerticalMapDiagram();
  } else {
    document.getElementById('vmapDiagramWrap').style.display = 'none';
    document.getElementById('vmapCardWrap').style.display = '';
    renderVerticalCardGrid();
  }
}

function drawVerticalMapDiagram() {
  const verticals = PRYPCO.verticals;
  const wrap = document.getElementById('vmapSvgWrap');
  const size = 720, cx = size / 2, cy = size / 2, r = 280;
  const angleStep = (Math.PI * 2) / verticals.length;

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" style="max-width:720px;display:block;margin:0 auto;">`;
  verticals.forEach((v, i) => {
    const a = -Math.PI / 2 + i * angleStep;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${tierColor(v.priority.tier)}" stroke-width="2" stroke-opacity="0.4"/>`;
  });
  svg += `<circle cx="${cx}" cy="${cy}" r="58" fill="#1a1530"/><text x="${cx}" y="${cy+5}" text-anchor="middle" class="vmap-center" font-size="16">PRYPCO</text>`;
  verticals.forEach((v, i) => {
    const a = -Math.PI / 2 + i * angleStep;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const nodeR = 44;
    svg += `<g class="vmap-node" data-vertical="${escapeHtml(v.vertical)}" onclick="openVerticalDetail('${escapeHtml(v.vertical).replace(/'/g, "\\'")}')">
      <circle cx="${x}" cy="${y}" r="${nodeR}" fill="${tierColor(v.priority.tier)}"/>
      <text x="${x}" y="${y - 4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="white">${wrapSvgText(v.vertical, x)}</text>
      <text x="${x}" y="${y + nodeR + 14}" text-anchor="middle" font-size="10" font-weight="700" fill="${tierColor(v.priority.tier)}">${v.priority.emoji}</text>
    </g>`;
  });
  svg += `</svg>`;
  wrap.innerHTML = svg;
}

function wrapSvgText(text, x) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => { if ((cur + ' ' + w).trim().length > 14) { lines.push(cur.trim()); cur = w; } else { cur += ' ' + w; } });
  if (cur.trim()) lines.push(cur.trim());
  return lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? -((lines.length - 1) * 10) : 11}">${escapeHtml(l)}</tspan>`).join('');
}

function renderVerticalCardGrid() {
  document.getElementById('vmapCardWrap').innerHTML = PRYPCO.verticals.map(v => `
    <div class="vertical-card" style="border-color:${tierColor(v.priority.tier)}" onclick="openVerticalDetail('${escapeHtml(v.vertical).replace(/'/g, "\\'")}')">
      <h4>${v.priority.emoji} ${escapeHtml(v.vertical)}</h4>
      <div class="vc-business-line">${escapeHtml(v.businessLine)}</div>
      <p class="subtle" style="font-size:12.5px;">${escapeHtml((v.howItConnects || '').slice(0, 110))}…</p>
    </div>
  `).join('');
}

function openVerticalDetail(verticalName) {
  const v = PRYPCO.verticals.find(x => x.vertical === verticalName);
  if (!v) return;
  const companyCount = PRYPCO.companies.filter(c => c.verticalMapMatch === verticalName).length;
  openSlideOver(`
    <button class="so-close" onclick="closeSlideOver()">✕</button>
    <h2>${v.priority.emoji} ${escapeHtml(v.vertical)}</h2>
    <p class="subtle">Priority: <strong style="color:${tierColor(v.priority.tier)}">${v.priority.tier}</strong></p>
    <div class="so-field"><label>Prypco Business Line Touched</label><p>${escapeHtml(v.businessLine)}</p></div>
    <div class="so-field"><label>How It Connects to Prypco</label><p>${escapeHtml(v.howItConnects)}</p></div>
    <div class="so-field"><label>Value Created for Prypco</label><p>${escapeHtml(v.valueForPrypco)}</p></div>
    <div class="so-field"><label>Value Created for Customer</label><p>${escapeHtml(v.valueForCustomer)}</p></div>
    <button class="mini-btn primary" style="margin-top:10px;width:100%;" onclick="goToLandscapeFor('${escapeHtml(verticalName).replace(/'/g, "\\'")}')">View ${companyCount} companies in this vertical →</button>
  `);
}
function goToLandscapeFor(verticalName) {
  closeSlideOver();
  landscapeFilterState.verticals = new Set([verticalName]);
  switchPrypcoSubview('landscape');
  renderLandscapeFilters();
  applyLandscapeFilters();
}

/* ---------- Landscape ---------- */
function allLandscapeVerticals() {
  return [...new Set(PRYPCO.companies.map(c => c.vertical))].sort();
}

function renderLandscapeFilters() {
  const vWrap = document.getElementById('landscapeVerticalChips');
  vWrap.innerHTML = allLandscapeVerticals().map(v => `
    <label class="chip-option ${landscapeFilterState.verticals.has(v) ? 'active' : ''}" data-vchip="${escapeHtml(v)}">${escapeHtml(v)}</label>
  `).join('');
  vWrap.querySelectorAll('[data-vchip]').forEach(chip => {
    chip.onclick = () => {
      const v = chip.dataset.vchip;
      landscapeFilterState.verticals.has(v) ? landscapeFilterState.verticals.delete(v) : landscapeFilterState.verticals.add(v);
      chip.classList.toggle('active');
      applyLandscapeFilters();
    };
  });

  const regionSel = document.getElementById('landscapeRegion');
  if (!regionSel.dataset.populated) {
    uniqueSorted(PRYPCO.companies.map(c => c.hqRegion)).forEach(r => regionSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`));
    regionSel.dataset.populated = '1';
  }
  const stageSel = document.getElementById('landscapeStage');
  if (!stageSel.dataset.populated) {
    uniqueSorted(PRYPCO.companies.map(c => c.stageBucket)).forEach(s => stageSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`));
    stageSel.dataset.populated = '1';
  }
}

function starsHtmlPrypco(stars) {
  if (stars < 0) return '<span class="subtle">Low</span>';
  if (stars === 0) return '<span class="subtle">Moderate</span>';
  return `<span class="relevance-stars">${'★'.repeat(stars)}${'<span class="empty">' + '★'.repeat(2 - stars) + '</span>'}</span>`;
}

function applyLandscapeFilters() {
  const region = document.getElementById('landscapeRegion').value;
  const stage = document.getElementById('landscapeStage').value;
  const relevance = document.getElementById('landscapeRelevance').value;
  const q = document.getElementById('landscapeSearch').value.toLowerCase();
  let rows = PRYPCO.companies;
  if (landscapeFilterState.verticals.size) rows = rows.filter(c => landscapeFilterState.verticals.has(c.vertical));
  if (region) rows = rows.filter(c => c.hqRegion === region);
  if (stage) rows = rows.filter(c => c.stageBucket === stage);
  if (relevance) rows = rows.filter(c => c.relevance.label === relevance);
  if (q) rows = rows.filter(c => c.company.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));

  const sortMode = document.getElementById('landscapeSort').value;
  if (sortMode === 'alpha') rows = [...rows].sort((a, b) => a.company.localeCompare(b.company));
  else if (sortMode === 'region') rows = [...rows].sort((a, b) => a.hqRegion.localeCompare(b.hqRegion));
  else rows = [...rows].sort((a, b) => b.relevance.stars - a.relevance.stars);

  document.getElementById('landscapeCount').textContent = rows.length;
  document.getElementById('landscapeTableBody').innerHTML = rows.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.company)}</strong>${c.uaeNative ? '<span class="uae-native-badge">UAE-Native</span>' : ''}<br><span class="region-badge">${escapeHtml(c.hqRegion)}</span></td>
      <td><span class="stage-badge">${escapeHtml(c.stage)}</span></td>
      <td>${tagHtml(c.vertical, '#9b85c4')}</td>
      <td class="desc">${escapeHtml(c.description)}</td>
      <td>${starsHtmlPrypco(c.relevance.stars)}<div class="subtle" style="margin-top:4px;max-width:200px;">${escapeHtml(c.relevance.text)}</div></td>
      <td>${c.verticalMapMatch ? `<a href="#" class="mini-btn" onclick="event.preventDefault(); switchPrypcoSubview('map'); openVerticalDetail('${escapeHtml(c.verticalMapMatch).replace(/'/g, "\\'")}');">View in context</a>` : ''}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="empty-state">No companies match.</td></tr>`;
}

function resetLandscapeFilters() {
  landscapeFilterState = { verticals: new Set(), region: '', stage: '', relevance: '' };
  document.getElementById('landscapeRegion').value = '';
  document.getElementById('landscapeStage').value = '';
  document.getElementById('landscapeRelevance').value = '';
  document.getElementById('landscapeSearch').value = '';
  renderLandscapeFilters();
  applyLandscapeFilters();
}

/* ---------- Roadmap ---------- */
function renderRoadmap() {
  let items = [...PRYPCO.roadmap];
  if (roadmapSort === 'time') items.sort((a, b) => (a.timeToLaunch.midpointMonths || 999) - (b.timeToLaunch.midpointMonths || 999));
  else items.sort((a, b) => (a.rank || 999) - (b.rank || 999));

  const maxMonths = Math.max(...PRYPCO.roadmap.map(r => r.timeToLaunch.midpointMonths || 0));

  document.getElementById('roadmapLadder').innerHTML = items.map(r => `
    <div class="roadmap-rung" style="border-color:${tierColor(r.priority.tier)}">
      <div>
        <div class="rr-rank" style="color:${tierColor(r.priority.tier)}">${r.priority.emoji}</div>
        <div class="rr-rank">#${r.rank}</div>
        <div class="rr-tier">${r.priority.tier}</div>
      </div>
      <div>
        <h4>${escapeHtml(r.vertical)}</h4>
        <div>${r.partners.map(p => p.matchedCompany
          ? `<span class="partner-chip" onclick="switchPrypcoSubview('landscape'); document.getElementById('landscapeSearch').value='${escapeHtml(p.matchedCompany).replace(/'/g, "\\'")}'; applyLandscapeFilters();">${escapeHtml(p.matchedCompany)}</span>`
          : `<span class="partner-chip no-link">${escapeHtml(p.raw)}</span>`).join('')}
        </div>
        <div class="rr-revenue">💰 ${escapeHtml(r.revenueModel)}</div>
      </div>
      <div>
        <div class="time-axis-track"><div class="time-axis-fill" style="width:${((r.timeToLaunch.midpointMonths || 0) / maxMonths) * 100}%"></div></div>
        <div class="time-axis-label">${escapeHtml(r.timeToLaunch.raw)}</div>
      </div>
    </div>
  `).join('');
}

function initPrypcoPage() {
  loadPrypcoData().then(() => {
    renderPrypcoOverview();
    renderVerticalMap();
    renderLandscapeFilters();
    applyLandscapeFilters();
    renderRoadmap();
    switchPrypcoSubview(prypcoSubview);
  });

  document.querySelectorAll('#view-prypco .prypco-subtabs .view-tab').forEach(tab => {
    tab.onclick = () => switchPrypcoSubview(tab.dataset.psub);
  });
  document.getElementById('vmapModeDiagram').onclick = () => { vmapMode = 'diagram'; renderVerticalMap(); };
  document.getElementById('vmapModeCards').onclick = () => { vmapMode = 'cards'; renderVerticalMap(); };
  document.getElementById('slideOverBackdrop').onclick = closeSlideOver;
  ['landscapeRegion','landscapeStage','landscapeRelevance','landscapeSearch','landscapeSort'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyLandscapeFilters);
    document.getElementById(id).addEventListener('change', applyLandscapeFilters);
  });
  document.getElementById('resetLandscapeBtn').onclick = resetLandscapeFilters;
  document.getElementById('roadmapSortRank').onclick = () => { roadmapSort = 'rank'; document.getElementById('roadmapSortRank').classList.add('active'); document.getElementById('roadmapSortTime').classList.remove('active'); renderRoadmap(); };
  document.getElementById('roadmapSortTime').onclick = () => { roadmapSort = 'time'; document.getElementById('roadmapSortTime').classList.add('active'); document.getElementById('roadmapSortRank').classList.remove('active'); renderRoadmap(); };
  document.getElementById('roadmapPrintBtn').onclick = () => window.print();
}
