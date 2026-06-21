const PLAYBOOK_TYPES = {
  profile: { label: 'Company Profile', icon: '📋', color: '#8b5cf6', sub: 'Industry, business model, ownership, financials, products, competitors.' },
  investment: { label: 'Investment', icon: '💰', color: '#3fbb7d', sub: 'Growth drivers, risks, valuation signals, acquisition history, diligence checklist.' },
  operational: { label: 'Operational', icon: '⚙️', color: '#f5934f', sub: 'How it runs — operating model, technology signals, lifecycle stage.' },
  salesbd: { label: 'Sales & BD', icon: '🤝', color: '#3bc3da', sub: 'Decision-makers, pain points, value propositions for outreach.' },
};

let pbState = { board: null, search: '', companyId: null };

function renderPlaybookBoards() {
  document.getElementById('pbBoardGrid').innerHTML = Object.entries(PLAYBOOK_TYPES).map(([key, t]) => `
    <div class="pb-board" style="background:linear-gradient(135deg,${t.color},${t.color}aa); animation-delay:${Math.random()}s" data-board="${key}">
      <div class="pb-icon">${t.icon}</div>
      <div>
        <div class="pb-title">${t.label} Playbook</div>
        <div class="pb-sub">${t.sub}</div>
      </div>
      <div class="pb-cta">Browse ${ALL.length} companies →</div>
    </div>
  `).join('');
  document.querySelectorAll('.pb-board').forEach(el => el.addEventListener('click', () => openPlaybookPicker(el.dataset.board)));
}

function openPlaybookPicker(board) {
  pbState.board = board;
  pbState.search = '';
  document.getElementById('pbBoardGrid').style.display = 'none';
  document.getElementById('pbPickerWrap').style.display = '';
  document.getElementById('pbDetailWrap').style.display = 'none';
  const t = PLAYBOOK_TYPES[board];
  document.getElementById('pbPickerTitle').innerHTML = `${t.icon} ${t.label} Playbook <span class="subtle">— pick a company</span>`;
  document.getElementById('pbPickerTitle').style.color = t.color;
  document.getElementById('pbSearch').value = '';
  renderPlaybookCompanyGrid(ALL);
}

function renderPlaybookCompanyGrid(rows) {
  const visible = rows.slice(0, 200);
  document.getElementById('pbCompanyGrid').innerHTML = visible.map(c => `
    <div class="pb-company-card" data-pc-id="${escapeHtml(c.id)}">
      ${companyLogoHtml(c, 42)}
      <div>
        <div class="pb-cname">${escapeHtml(c.name)}</div>
        <div class="pb-cmeta">${naText(c.segment)}</div>
      </div>
    </div>
  `).join('') || '<div class="empty-state">No companies match your search.</div>';
  document.querySelectorAll('.pb-company-card').forEach(el => {
    el.addEventListener('click', () => openPlaybookDetail(pbState.board, el.dataset.pcId));
  });
  document.getElementById('pbShownNote').textContent = rows.length > 200
    ? `Showing first 200 of ${rows.length} — refine your search to find more.`
    : `${rows.length} companies.`;
}

function filterPlaybookCompanies() {
  const q = document.getElementById('pbSearch').value.toLowerCase();
  const rows = q ? ALL.filter(c => (c.name || '').toLowerCase().includes(q) || (c.segment || '').toLowerCase().includes(q)) : ALL;
  renderPlaybookCompanyGrid(rows);
}

function surpriseMeCompany() {
  const idx = Math.floor(Math.random() * ALL.length);
  openPlaybookDetail(pbState.board, ALL[idx].id);
}

/* ---------- Content builders (real data + clearly-labeled derived signals) ---------- */
function pbHighlights(c, ctx) {
  const lensResult = computeLensScore(c, ctx, 'investment');
  const bits = [];
  if (c.moat && c.moat !== 'Low Differentiation (Commodity Software)') bits.push(`Defensible moat: ${c.moat}`);
  if (isPublic(c)) bits.push('Publicly traded — transparent, liquid');
  if (lensResult.metrics.traction.score >= 65) bits.push('Strong commercial traction signal');
  if (c.totalRaised != null && c.totalRaised > 50) bits.push(`Well-capitalized: $${Math.round(c.totalRaised)}M raised to date`);
  if (!bits.length) bits.push('No standout highlight identified from available signals');
  return { bits, score: lensResult.overallScore };
}

function pbRisksAndDrivers(c, peers) {
  const risks = [], drivers = [];
  if (c.totalRaised == null) risks.push('No disclosed funding total — financial scale unverified.');
  if (companyValuation(c) == null) risks.push('No disclosed valuation in this dataset.');
  if (c.moat === 'Low Differentiation (Commodity Software)') risks.push('Classified as low differentiation — limited structural moat vs. competitors.');
  if (c.ownershipStatus === 'Acquired/Merged') risks.push('Already acquired/merged — independence and deal optionality may be limited.');
  if (peers.segmentModelPeers >= 8) risks.push(`Crowded niche: ${peers.segmentModelPeers} direct peers in the same segment + business model.`);
  if (!risks.length) risks.push('No specific risk flagged from available signals.');

  if (c.gtm) drivers.push(`Go-to-market via ${c.gtm}`);
  if (c.targetCustomer) drivers.push(`Focused customer base: ${c.targetCustomer}`);
  if (peers.segmentModelPeers === 0) drivers.push('Potential white space — no direct peers in this exact segment + business model.');
  if (!drivers.length) drivers.push('No specific growth driver identified from available signals.');
  return { risks, drivers };
}

function pbDueDiligence(c) {
  const items = [];
  if (c.totalRaised == null) items.push('Confirm actual revenue, funding, and cash position — not disclosed in this dataset.');
  else items.push(`Verify the $${Math.round(c.totalRaised)}M total-raised figure and underlying cap table.`);
  if (companyValuation(c) == null) items.push('Obtain a current valuation — none disclosed here.');
  if (c.moat) items.push(`Stress-test the claimed moat ("${c.moat}") against real competitive behavior.`);
  if (c.lastFinancingDate) items.push(`Check whether terms have changed since the last disclosed round (${fmtDate(c.lastFinancingDate)}).`);
  items.push('Confirm regulatory/licensing status in each operating geography.');
  items.push('Validate customer references and churn — not available in this dataset.');
  return items;
}

function pbValuePropAndPain(c) {
  const valueProps = [];
  if (c.moat) valueProps.push(`Differentiation: ${c.moat}`);
  if (c.revenueModel) valueProps.push(`Monetization: ${c.revenueModel}`);
  if (c.gtm) valueProps.push(`Reaches customers via: ${c.gtm}`);
  if (!valueProps.length) valueProps.push('No information available');

  let painPoint = 'No information available';
  if (c.description) {
    const m = c.description.match(/enabling ([^,.]+?) to ([^,.]+)/i);
    if (m) painPoint = `Likely cares about: helping "${m[1].trim()}" to "${m[2].trim()}" (inferred from description).`;
    else painPoint = `Inferred from description — see "What They Do" below; no structured pain-point field in this dataset.`;
  }
  return { valueProps, painPoint };
}

function pbDetailHtml(type, c, ctx, peers) {
  const t = PLAYBOOK_TYPES[type];
  if (type === 'profile') {
    const { bits } = pbHighlights(c, ctx);
    return `
      <div class="pb-section" style="animation-delay:.05s"><h4>🏷️ Industry & Classification</h4>
        <p>Segment: ${naText(c.segment)}${c.segment2 ? ' + ' + escapeHtml(c.segment2) : ''}<br>
        PitchBook Industry Code: ${naText(c.primaryIndustryCode)}</p></div>
      <div class="pb-section" style="animation-delay:.1s"><h4>💼 Business Model</h4><p>${naText(c.businessModel)}</p></div>
      <div class="pb-section" style="animation-delay:.15s"><h4>🏢 Ownership</h4>
        <p>${naText(c.ownershipStatus)}${c.parentCompany ? '<br>Parent company: ' + escapeHtml(c.parentCompany) : ''}</p></div>
      <div class="pb-section" style="animation-delay:.2s"><h4>💵 Financials</h4>
        <p>Total raised: ${c.totalRaised != null ? fmtMoney(c.totalRaised) : naText(null)}<br>
        Last round: ${c.lastFinancingDate ? fmtDate(c.lastFinancingDate) + (c.lastFinancingSize != null ? ' · ' + fmtMoney(c.lastFinancingSize) : '') + (c.lastFinancingDealType ? ' · ' + escapeHtml(c.lastFinancingDealType) : '') : naText(null)}<br>
        Valuation: ${companyValuation(c) != null ? fmtMoney(companyValuation(c)) : naText(null)}</p></div>
      <div class="pb-section" style="animation-delay:.25s"><h4>🛠️ Key Products / What They Do</h4><p>${naText(c.description)}</p></div>
      <div class="pb-section" style="animation-delay:.3s"><h4>⚔️ Competitors</h4><p>${naText(c.competitors)}</p></div>
      <div class="pb-section" style="animation-delay:.35s"><h4>⭐ Investment Highlights <span class="pb-derived-tag">derived</span></h4>
        <ul>${bits.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>
    `;
  }
  if (type === 'investment') {
    const { risks, drivers } = pbRisksAndDrivers(c, peers);
    const dd = pbDueDiligence(c);
    return `
      <div class="pb-section" style="animation-delay:.05s"><h4>📐 Market Size</h4><p>${naText(null)} <span class="subtle">— not tracked in this dataset.</span></p></div>
      <div class="pb-section" style="animation-delay:.1s"><h4>📈 Growth Drivers <span class="pb-derived-tag">derived</span></h4><ul>${drivers.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>
      <div class="pb-section" style="animation-delay:.15s"><h4>⚠️ Risks <span class="pb-derived-tag">derived</span></h4><ul>${risks.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul></div>
      <div class="pb-section" style="animation-delay:.2s"><h4>💲 Valuation & Score Signals</h4>
        <p>Total raised: ${c.totalRaised != null ? fmtMoney(c.totalRaised) : naText(null)}<br>
        Valuation: ${companyValuation(c) != null ? fmtMoney(companyValuation(c)) : naText(null)}<br>
        PitchBook Success Probability: ${c.successProbability != null ? c.successProbability + '/100' : naText(null)}</p></div>
      <div class="pb-section" style="animation-delay:.25s"><h4>🤝 Acquisition History</h4>
        <p>${c.parentCompany ? 'Subsidiary of ' + escapeHtml(c.parentCompany) + '.' : c.ownershipStatus === 'Acquired/Merged' ? 'Ownership status recorded as Acquired/Merged; specific acquirer not disclosed.' : 'No acquisition recorded in this dataset.'}</p></div>
      <div class="pb-section" style="animation-delay:.3s"><h4>✅ Key Due-Diligence Points <span class="pb-derived-tag">derived</span></h4><ul>${dd.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>
    `;
  }
  if (type === 'operational') {
    return `
      <div class="pb-section" style="animation-delay:.05s"><h4>🔁 Processes</h4><p>${naText(null)} <span class="subtle">— not tracked in this dataset.</span></p></div>
      <div class="pb-section" style="animation-delay:.1s"><h4>💻 Operating Model Signals</h4>
        <p>Capital intensity: ${naText(c.capitalIntensity)}<br>Business model: ${naText(c.businessModel)}<br>Revenue model: ${naText(c.revenueModel)}</p></div>
      <div class="pb-section" style="animation-delay:.15s"><h4>🧬 Lifecycle Stage</h4>
        <p>Business status: ${naText(c.businessStatus)}<br>Financing status: ${naText(c.companyFinancingStatus)}<br>Founded: ${naText(c.yearFounded)}</p></div>
      <div class="pb-section" style="animation-delay:.2s"><h4>🏗️ Organizational Structure</h4><p>${naText(null)} <span class="subtle">— headcount/org-chart data not tracked in this dataset.</span></p></div>
    `;
  }
  // salesbd
  const { valueProps, painPoint } = pbValuePropAndPain(c);
  return `
    <div class="pb-section" style="animation-delay:.05s"><h4>🧑‍💼 Decision-Maker</h4>
      <p>${naText(c.primaryContact)} <span class="subtle">${c.primaryContact ? '(PitchBook-listed primary contact)' : ''}</span></p></div>
    <div class="pb-section" style="animation-delay:.1s"><h4>😣 Pain Points <span class="pb-derived-tag">inferred</span></h4><p>${escapeHtml(painPoint)}</p></div>
    <div class="pb-section" style="animation-delay:.15s"><h4>💡 Value Propositions <span class="pb-derived-tag">derived</span></h4>
      <ul>${valueProps.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul></div>
    <div class="pb-section" style="animation-delay:.2s"><h4>📝 What They Do</h4><p>${naText(c.description)}</p></div>
  `;
}

function openPlaybookDetail(type, companyId) {
  const c = byId(companyId);
  if (!c) return;
  pbState.board = type;
  pbState.companyId = companyId;
  document.getElementById('pbPickerWrap').style.display = 'none';
  document.getElementById('pbDetailWrap').style.display = '';

  const t = PLAYBOOK_TYPES[type];
  document.getElementById('pbRibbon').style.background = `linear-gradient(120deg,${t.color},${t.color}cc)`;
  document.getElementById('pbRibbon').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="background:white;border-radius:50%;padding:3px;">${companyLogoHtml(c, 46)}</div>
      <div>
        <div style="font-size:13px;opacity:0.85;font-weight:700;">${t.icon} ${t.label} Playbook</div>
        <h1 style="margin:2px 0 0;">${escapeHtml(c.name)}</h1>
        <p style="margin:2px 0 0;">${naText(c.hq)}${c.yearFounded ? ' · Founded ' + c.yearFounded : ''}</p>
      </div>
    </div>
  `;

  document.getElementById('pbTypeSwitcher').innerHTML = Object.entries(PLAYBOOK_TYPES).map(([key, pt]) => `
    <div class="pb-type-tab ${key === type ? 'active' : ''}" style="${key === type ? 'background:' + pt.color : ''}" data-switch-type="${key}">${pt.icon} ${pt.label}</div>
  `).join('');
  document.querySelectorAll('[data-switch-type]').forEach(el => {
    el.onclick = () => openPlaybookDetail(el.dataset.switchType, companyId);
  });

  const ctx = buildScoreContext(ALL);
  const peers = peerContext(c, ctx);
  document.getElementById('pbSections').innerHTML = pbDetailHtml(type, c, ctx, peers);
}

function backToPlaybookPicker() {
  document.getElementById('pbDetailWrap').style.display = 'none';
  document.getElementById('pbPickerWrap').style.display = '';
}
function backToPlaybookBoards() {
  document.getElementById('pbPickerWrap').style.display = 'none';
  document.getElementById('pbDetailWrap').style.display = 'none';
  document.getElementById('pbBoardGrid').style.display = '';
}

function initPlaybooksPage() {
  document.getElementById('pbBoardGrid').style.display = '';
  document.getElementById('pbPickerWrap').style.display = 'none';
  document.getElementById('pbDetailWrap').style.display = 'none';
  renderPlaybookBoards();
  document.getElementById('pbSearch').oninput = filterPlaybookCompanies;
  document.getElementById('pbBackToBoardsBtn').onclick = backToPlaybookBoards;
  document.getElementById('pbBackToPickerBtn').onclick = backToPlaybookPicker;
  document.getElementById('pbSurpriseBtn').onclick = surpriseMeCompany;
}
