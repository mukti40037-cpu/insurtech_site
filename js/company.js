function selectOptions(name, options, current) {
  return `<select name="${name}">${options.map(o =>
    `<option value="${escapeHtml(o)}" ${o === current ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
}

let companyDetailLens = 'investment';

function buildInvestmentSummary(c, classification, lensResult, peers) {
  const { tag, explanation } = classification;
  const sortedByPoints = [...lensResult.breakdown].sort((a, b) => b.score - a.score);
  const strongest = sortedByPoints[0];
  const weakest = sortedByPoints[sortedByPoints.length - 1];
  const missing = lensResult.breakdown.filter(b => b.confidence < 50).map(b => b.label);

  const parts = [];
  parts.push(`Why it ranks where it does: ${escapeHtml(c.name)} scores ${lensResult.overallScore.toFixed(1)}/100 on this lens, driven most by ${strongest.label} (${strongest.score}/100) and held back most by ${weakest.label} (${weakest.score}/100).`);
  parts.push(`Biggest strength: ${escapeHtml(strongest.bullets[0] || strongest.label)}`);
  parts.push(`Biggest weakness/concern: ${escapeHtml(weakest.bullets[0] || weakest.label)}`);
  if (peers.segmentModelPeers === 0) parts.push(`Investment opportunity: potential white space — no other companies share this exact segment + business model combination.`);
  else parts.push(`Investment opportunity: operates alongside ${peers.segmentModelPeers} direct peers in "${c.segment}" / "${c.businessModel}" — differentiation vs. those peers is the key diligence question.`);
  if (c.moat) parts.push(`Acquisition synergy angle: its classified moat (${c.moat}) is the main asset an acquirer would be buying — ${MOAT_RANK[c.moat] >= 70 ? 'a durable one' : 'though it is not currently a strong moat'}.`);
  if (c.businessModel === 'Software / SaaS' || c.businessModel === 'Data, Analytics & API Provider') parts.push(`Replication potential: as a ${c.businessModel} business, this model could plausibly be built internally without needing an insurance license or balance sheet.`);
  else if (c.businessModel === 'Full-Stack Carrier' || c.businessModel === 'MGA / Delegated Underwriting Authority') parts.push(`Replication potential: as a ${c.businessModel}, replicating this internally would require regulatory licensing and/or underwriting capital — acquisition or partnership is more realistic than building from scratch.`);
  const ddQuestions = [];
  if (c.totalRaised == null) ddQuestions.push('What is the actual funding/cap-table history? (not disclosed here)');
  if (companyValuation(c) == null) ddQuestions.push('What is the current valuation? (not disclosed here)');
  if (!c.description) ddQuestions.push('What exactly does the product do? (no description on file)');
  if (missing.length) ddQuestions.push(`Request data on: ${missing.join(', ')} — these had insufficient signal to score confidently.`);
  ddQuestions.push('Confirm current revenue, retention, and customer concentration — none of this is in the dataset.');
  parts.push(`Recommended next due-diligence questions: ${ddQuestions.map(escapeHtml).join(' · ')}`);

  return parts;
}

function renderScoreExplanation(c, ctx) {
  const classification = classifyRecommendation(c, ctx);
  const lensResult = classification[companyDetailLens];
  const peers = peerContext(c, ctx);
  const transparency = findNearestPeers(c, ctx, companyDetailLens);
  const summaryParts = buildInvestmentSummary(c, classification, lensResult, peers);

  const sortedBreakdown = [...lensResult.breakdown].sort((a, b) => b.score - a.score);
  const helped = sortedBreakdown.slice(0, 2);
  const hurt = sortedBreakdown.slice(-2).reverse();
  const missingMetrics = lensResult.breakdown.filter(b => b.confidence < 50);

  document.getElementById('companyThesisSection').innerHTML = `
    <h3>Classification</h3>
    <div class="ai-insight-box" style="font-size:14px;">
      <span class="ai-label">AI-generated classification</span>
      <p style="margin:6px 0 0;font-size:16px;font-weight:800;">${classification.emoji} ${escapeHtml(classification.tag)}</p>
      <p style="margin:4px 0 0;">${escapeHtml(classification.explanation)}</p>
      <p class="subtle" style="margin-top:6px;">Average data confidence across all 3 lenses: ${classification.avgConfidence}%</p>
    </div>

    <h3 style="margin-top:20px;">Score <span class="pb-derived-tag">${LENS_PRESETS[companyDetailLens].label} lens</span></h3>
    <div class="lens-tab-row" id="companyLensTabs">
      ${Object.entries(LENS_PRESETS).map(([key, lens]) => `<div class="lens-mini-tab ${key === companyDetailLens ? 'active' : ''}" data-lenskey="${key}">${lens.label}</div>`).join('')}
    </div>
    <div style="display:flex;gap:24px;align-items:center;margin:12px 0;flex-wrap:wrap;">
      <div><div class="subtle">Investment Score</div><div style="font-size:28px;font-weight:800;color:var(--purple);">${lensResult.overallScore.toFixed(1)}/100</div></div>
      <div><div class="subtle">Confidence Score</div><div style="font-size:28px;font-weight:800;color:${lensResult.overallConfidence >= 60 ? 'var(--green)' : lensResult.overallConfidence >= 35 ? 'var(--orange)' : 'var(--red)'};">${lensResult.overallConfidence}/100</div></div>
    </div>
    <p class="subtle">${escapeHtml(LENS_PRESETS[companyDetailLens].description)}</p>

    <h3>Reasoning</h3>
    ${lensResult.breakdown.map(b => `
      <div class="pb-section" style="opacity:1;animation:none;margin-bottom:10px;">
        <h4>${escapeHtml(b.label)} (${b.points}/${b.maxPoints}) <span class="pb-derived-tag" style="background:${b.confidence >= 60 ? 'rgba(127,168,118,0.15)' : 'rgba(201,122,122,0.15)'};color:${b.confidence >= 60 ? 'var(--green)' : 'var(--red)'};">confidence ${b.confidence}%</span></h4>
        <ul>${b.bullets.map(bul => `<li>${escapeHtml(bul)}</li>`).join('')}</ul>
      </div>
    `).join('')}

    <h3>Investment Summary <span class="pb-derived-tag">auto-generated</span></h3>
    <div class="thesis-box">${summaryParts.map(p => `<p style="margin:6px 0;">${p}</p>`).join('')}</div>

    <h3>Ranking Transparency</h3>
    <div class="pb-section" style="opacity:1;animation:none;">
      <p><strong>Rank:</strong> #${transparency.rank} of ${transparency.total} on the ${LENS_PRESETS[companyDetailLens].label} lens.</p>
      <p><strong>Helped the score most:</strong> ${helped.map(h => `${escapeHtml(h.label)} (${h.score}/100)`).join(', ')}</p>
      <p><strong>Reduced the score most:</strong> ${hurt.map(h => `${escapeHtml(h.label)} (${h.score}/100)`).join(', ')}</p>
      <p><strong>Missing/low-confidence metrics:</strong> ${missingMetrics.length ? missingMetrics.map(m => escapeHtml(m.label)).join(', ') : 'None — all categories have reasonable signal.'}</p>
      ${transparency.above ? `<p><strong>Ranked just above:</strong> <span class="company-hover" ${companyHoverAttrs(transparency.above.c)} style="cursor:pointer;color:var(--indigo);font-weight:700;" onclick="location.hash='#company/${encodeURIComponent(transparency.above.c.id)}'">${escapeHtml(transparency.above.c.name)}</span> (${transparency.above.overallScore.toFixed(1)}/100) — ${escapeHtml(diffExplain(lensResult, transparency.above))}</p>` : ''}
      ${transparency.below ? `<p><strong>Ranked just below:</strong> <span class="company-hover" ${companyHoverAttrs(transparency.below.c)} style="cursor:pointer;color:var(--indigo);font-weight:700;" onclick="location.hash='#company/${encodeURIComponent(transparency.below.c.id)}'">${escapeHtml(transparency.below.c.name)}</span> (${transparency.below.overallScore.toFixed(1)}/100) — ${escapeHtml(diffExplain(lensResult, transparency.below))}</p>` : ''}
      <p class="subtle">Want to see how changing category weights affects this ranking? Try the live sliders on the <a href="#rankings" style="color:var(--purple);font-weight:700;">Rankings page</a>.</p>
    </div>

    <h3>Peer Context</h3>
    <p class="subtle">${peers.segmentPeers} other companies share the "${escapeHtml(c.segment || 'unclassified')}" segment.
    ${peers.segmentModelPeers} share both this segment and the "${escapeHtml(c.businessModel || 'unclassified')}" business model.</p>
  `;

  document.querySelectorAll('#companyLensTabs .lens-mini-tab').forEach(tab => {
    tab.onclick = () => { companyDetailLens = tab.dataset.lenskey; renderScoreExplanation(c, ctx); };
  });
}

function diffExplain(thisLens, otherLens) {
  let best = null, bestDelta = -1;
  thisLens.breakdown.forEach(b => {
    const ob = otherLens.breakdown.find(x => x.key === b.key);
    if (ob) {
      const delta = Math.abs(b.score - ob.score);
      if (delta > bestDelta) { bestDelta = delta; best = { label: b.label, mine: b.score, theirs: ob.score }; }
    }
  });
  if (!best) return 'comparable category signals.';
  return best.mine > best.theirs
    ? `mainly because of stronger ${best.label} (${best.mine} vs ${best.theirs}).`
    : `mainly because of weaker ${best.label} (${best.mine} vs ${best.theirs}).`;
}

function renderCompanyDetail(id) {
  const c = byId(id);
  if (!c) { document.getElementById('companyHero').innerHTML = '<h1>Company not found</h1>'; return; }

  document.getElementById('companyHero').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="background:white;border-radius:50%;padding:3px;">${companyLogoHtml(c, 52)}</div>
      <div>
        <h1 style="margin:0;">${escapeHtml(c.name)}</h1>
        <p style="margin:2px 0 0;">${naText(c.hq)}${c.yearFounded ? ' · Founded ' + c.yearFounded : ''}
          ${c.website ? ' · <a href="https://' + escapeHtml((c.website||'').replace(/^https?:\/\//,'')) + '" target="_blank" style="color:white;text-decoration:underline;">' + escapeHtml(c.website) + '</a>' : ''}
        </p>
      </div>
    </div>
    <div style="margin-top:14px;"><button class="mini-btn primary" id="heroShortlistBtn">★ Add to Shortlist</button>
    <button class="mini-btn" id="heroCompareBtn" style="background:rgba(255,255,255,0.2);color:white;border-color:rgba(255,255,255,0.4);">⇄ Add to Comparison</button>
    <button class="mini-btn" id="heroPlaybookBtn" style="background:rgba(255,255,255,0.2);color:white;border-color:rgba(255,255,255,0.4);">🎯 View Playbooks</button></div>
  `;
  document.getElementById('heroShortlistBtn').onclick = async () => {
    await quickAddToShortlist(c.id);
    document.getElementById('heroShortlistBtn').textContent = '✓ Shortlisted';
  };
  document.getElementById('heroCompareBtn').onclick = () => {
    if (!compareIds.includes(c.id) && compareIds.length < 5) compareIds.push(c.id);
    location.hash = '#comparison';
  };
  document.getElementById('heroPlaybookBtn').onclick = () => {
    location.hash = `#playbooks?company=${encodeURIComponent(c.id)}&type=profile`;
  };

  const prypcoMatch = PRYPCO ? PRYPCO.companies.find(pc => pc.company.toLowerCase() === c.name.toLowerCase()) : null;
  document.getElementById('companyPrypcoNote').innerHTML = prypcoMatch ? `
    <div class="ai-insight-box" style="margin-top:14px;">
      <span class="ai-label">Cross-referenced</span>
      <p style="margin:4px 0 0;">Also tracked in the <strong>Prypco Strategy</strong> dataset
      ${prypcoMatch.uaeNative ? 'as a <strong>UAE-native</strong> company ' : ''}
      in the "${escapeHtml(prypcoMatch.vertical)}" vertical — relevance: ${escapeHtml(prypcoMatch.relevance.label)}.
      <a href="#" onclick="event.preventDefault(); switchPrypcoSubview && switchPrypcoSubview('landscape'); location.hash='#prypco';">Open in Prypco Landscape →</a></p>
    </div>` : '';

  document.getElementById('companyInfoTable').innerHTML = `
    <tr><th>Description</th><td>${naText(c.description)}</td></tr>
    <tr><th>Business Status</th><td>${naText(c.businessStatus)}</td></tr>
    <tr><th>Ownership Status</th><td>${naText(c.ownershipStatus)}</td></tr>
    <tr><th>Total Raised ($M)</th><td>${c.totalRaised != null ? fmtMoney(c.totalRaised) : naText(null)}</td></tr>
    <tr><th>Last Round</th><td>${c.lastFinancingDate ? fmtDate(c.lastFinancingDate) + (c.lastFinancingSize != null ? ' · ' + fmtMoney(c.lastFinancingSize) : '') + (c.lastFinancingDealType ? ' · ' + escapeHtml(c.lastFinancingDealType) : '') : naText(null)}</td></tr>
    <tr><th>Valuation ($M)</th><td>${companyValuation(c) != null ? fmtMoney(companyValuation(c)) : naText(null)}</td></tr>
    <tr><th>Active Investors</th><td>${naText(c.activeInvestors)}</td></tr>
    <tr><th>Competitors</th><td>${naText(c.competitors)}</td></tr>
  `;

  document.getElementById('companyPlaybookTable').innerHTML = `
    <tr><th>Revenue Model</th><td>${naText(c.revenueModel)}</td></tr>
    <tr><th>Target Customer</th><td>${naText(c.targetCustomer)}</td></tr>
    <tr><th>Go-to-Market Motion</th><td>${naText(c.gtm)}</td></tr>
    <tr><th>Moat / Defensibility</th><td>${naText(c.moat)}</td></tr>
    <tr><th>Hardest part to copy</th><td>${naText(c.strategyNotes)}</td></tr>
  `;

  const ctx = buildScoreContext(ALL);
  renderScoreExplanation(c, ctx);

  const chartSection = document.getElementById('companyChartSection');
  if (c.ticker) {
    chartSection.innerHTML = `
      <h3>Stock Price (${withSource(escapeHtml(c.ticker), c.tickerSource, 'View source')})</h3>
      <div id="chart-controls">
        <button type="button" data-range="1mo">1M</button>
        <button type="button" data-range="6mo">6M</button>
        <button type="button" data-range="1y" class="active">1Y</button>
        <button type="button" data-range="5y">5Y</button>
      </div>
      <canvas id="priceChart" width="600" height="260"></canvas>
      <p class="footer-note" id="chart-status" style="margin-top:8px;">Loading…</p>
    `;
    wireChart(c.ticker);
  } else if (c.tickerNote) {
    chartSection.innerHTML = `
      <h3>Public-Market Status</h3>
      <div class="ticker-note-box">${withSource(escapeHtml(c.tickerNote), c.tickerSource, 'View source')}</div>
    `;
  } else {
    chartSection.innerHTML = '';
  }

  document.getElementById('verifiedBadge').innerHTML = c.isHumanVerified
    ? `<span class="verified-pill">✓ verified ${c.lastEditedAt ? '· ' + escapeHtml(c.lastEditedAt) : ''}</span>` : '';

  document.getElementById('editForm').innerHTML = `
    <label>Company Name <input type="text" name="name" value="${escapeHtml(c.name || '')}"></label>
    <label>Website <input type="text" name="website" value="${escapeHtml(c.website || '')}" placeholder="example.com"></label>
    <label>HQ Location <input type="text" name="hq" value="${escapeHtml(c.hq || '')}"></label>
    <label>Year Founded <input type="number" name="yearFounded" value="${c.yearFounded || ''}"></label>
    <label>Description <textarea name="description" rows="3">${escapeHtml(c.description || '')}</textarea></label>
    <label>Primary Segment ${selectOptions('segment', META.segments, c.segment)}</label>
    <label>Secondary Segment ${selectOptions('segment2', [''].concat(META.segments), c.segment2)}</label>
    <label>Business Model ${selectOptions('businessModel', META.models, c.businessModel)}</label>
    <label>Geography Region ${selectOptions('geo', META.geos, c.geo)}</label>
    <label>Capital Intensity ${selectOptions('capitalIntensity', META.capitalOptions, c.capitalIntensity)}</label>
    <label>Revenue Model ${selectOptions('revenueModel', META.revenueModels, c.revenueModel)}</label>
    <label>Target Customer ${selectOptions('targetCustomer', META.targetCustomers, c.targetCustomer)}</label>
    <label>Go-to-Market Motion ${selectOptions('gtm', META.gtmMotions, c.gtm)}</label>
    <label>Moat / Defensibility ${selectOptions('moat', META.moats, c.moat)}</label>
    <label>Business Status <input type="text" name="businessStatus" value="${escapeHtml(c.businessStatus || '')}" placeholder="e.g. Generating Revenue"></label>
    <label>Ownership Status <input type="text" name="ownershipStatus" value="${escapeHtml(c.ownershipStatus || '')}" placeholder="e.g. Privately Held"></label>
    <label>Parent Company <input type="text" name="parentCompany" value="${escapeHtml(c.parentCompany || '')}"></label>
    <label>Total Raised ($M) <input type="number" step="0.1" name="totalRaised" value="${c.totalRaised ?? ''}"></label>
    <label>Last Financing Date <input type="date" name="lastFinancingDate" value="${(c.lastFinancingDate || '').slice(0,10)}"></label>
    <label>Last Financing Size ($M) <input type="number" step="0.1" name="lastFinancingSize" value="${c.lastFinancingSize ?? ''}"></label>
    <label>Last Financing Deal Type <input type="text" name="lastFinancingDealType" value="${escapeHtml(c.lastFinancingDealType || '')}"></label>
    <label>Valuation Estimate ($M) <input type="number" step="0.1" name="valuationEstimate" value="${c.valuationEstimate ?? ''}"></label>
    <label>Success Probability (0-100) <input type="number" min="0" max="100" name="successProbability" value="${c.successProbability ?? ''}"></label>
    <label>Active Investors <input type="text" name="activeInvestors" value="${escapeHtml(c.activeInvestors || '')}" placeholder="comma-separated"></label>
    <label>Competitors <input type="text" name="competitors" value="${escapeHtml(c.competitors || '')}" placeholder="comma-separated"></label>
    <label>Primary Contact <input type="text" name="primaryContact" value="${escapeHtml(c.primaryContact || '')}"></label>
    <label>Verticals (real PitchBook tags) <input type="text" name="verticals" value="${escapeHtml(c.verticals || '')}" placeholder="comma-separated"></label>
    <label>Emerging Spaces <input type="text" name="emergingSpaces" value="${escapeHtml(c.emergingSpaces || '')}" placeholder="comma-separated"></label>
    <label>Ticker (Yahoo Finance symbol) <input type="text" name="ticker" value="${escapeHtml(c.ticker || '')}" placeholder="e.g. LMND"></label>
    <label>Ticker Source (URL) <input type="text" name="tickerSource" value="${escapeHtml(c.tickerSource || '')}" placeholder="https://..."></label>
    <label>Ticker Note <textarea name="tickerNote" rows="2">${escapeHtml(c.tickerNote || '')}</textarea></label>
    <label>Strategy Notes <textarea name="strategyNotes" rows="2">${escapeHtml(c.strategyNotes || '')}</textarea></label>
    <label>Notes <textarea name="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></label>
    <div id="customFieldsEditWrap"></div>
    <button type="button" class="save-btn" id="saveBtn">Save Changes</button>
    <div class="save-status" id="saveStatus"></div>
    <button type="button" class="reset-filters-btn" id="deleteCompanyBtn" style="background:rgba(229,72,77,0.1);color:var(--red);margin-top:14px;">🗑️ Delete This Company</button>
  `;

  document.getElementById('saveBtn').onclick = () => saveCompany(c.id);
  document.getElementById('deleteCompanyBtn').onclick = async () => {
    if (!confirm(`Delete "${c.name}" permanently? This also removes it from any shortlist, screening scorecards, and custom field values. This cannot be undone.`)) return;
    const result = await deleteCompany(c.id);
    if (result && result.ok) {
      ALL = ALL.filter(x => x.id !== c.id);
      alert(`${c.name} has been deleted.`);
      location.hash = '#screener';
    } else {
      alert('Delete failed — ' + (result && result.error ? result.error : 'unknown error'));
    }
  };
  renderCustomFieldsEditor(c);
}

async function saveCompany(id) {
  const form = document.getElementById('editForm');
  const payload = {};
  form.querySelectorAll('select, input, textarea').forEach(el => { payload[el.name] = el.value; });

  const status = document.getElementById('saveStatus');
  status.textContent = 'Saving...';
  status.style.color = 'var(--muted)';
  try {
    const res = await editFetch(`/api/companies/${encodeURIComponent(id)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = await res.json();
    const idx = ALL.findIndex(c => String(c.id) === String(id));
    if (idx >= 0) ALL[idx] = updated;
    status.textContent = '✓ Saved';
    status.style.color = 'var(--green)';
    renderCompanyDetail(id);
  } catch (e) {
    status.textContent = 'Failed to save — check the server is running.';
    status.style.color = 'var(--red)';
  }
}

function wireChart(ticker) {
  const canvas = document.getElementById('priceChart');
  const ctx = canvas.getContext('2d');
  const status = document.getElementById('chart-status');

  function draw(points) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!points || points.length === 0) { status.textContent = 'No price data available.'; return; }
    const closes = points.map(p => p.close);
    const min = Math.min(...closes), max = Math.max(...closes);
    const pad = 30, w = canvas.width - pad * 2, h = canvas.height - pad * 2;
    ctx.strokeStyle = '#9b85c4'; ctx.lineWidth = 2.5; ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad + (i / (points.length - 1)) * w;
      const y = pad + h - ((p.close - min) / (max - min || 1)) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    status.textContent = `${ticker}: $${closes[0].toFixed(2)} → $${closes[closes.length-1].toFixed(2)} (${points[0].date} to ${points[points.length-1].date})`;
  }

  function load(range) {
    status.textContent = 'Loading...';
    fetch(`/api/prices/${encodeURIComponent(ticker)}?range=${range}`)
      .then(r => r.json())
      .then(data => { if (data.error) { status.textContent = data.error; return; } draw(data.points); })
      .catch(() => { status.textContent = 'Failed to load price data.'; });
  }

  document.querySelectorAll('#chart-controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chart-controls button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      load(btn.dataset.range);
    });
  });
  load('1y');
}
