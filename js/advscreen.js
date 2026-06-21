/* ====================================================================================
   ADVANCED SCREENING MODE — 5-stage hybrid screening pipeline.
   Reuses the same canonical metrics engine as Rankings (scoring.js) so every number here
   traces back to real fields (funding, classification, description evidence) — nothing
   fabricated. The 5 stages feed forward into one another (interconnected): changing any
   assumption recomputes every downstream stage live.
   ==================================================================================== */

const ADV_STAGE_LABELS = ['Dealbreaker Filter', 'Cluster-Relative Scoring', 'Weighted Ranking', 'Multi-Lens Validation', 'Final Comparison'];

const DEALBREAKER_RULE_DEFS = [
  {
    key: 'acquired', label: 'Already Acquired / Merged', hasThreshold: false,
    test: (c) => c.ownershipStatus === 'Acquired/Merged',
    reasonFn: () => 'Already acquired/merged — no longer an independent investable/acquirable target.',
  },
  {
    key: 'severeRisk', label: 'Severe PitchBook Success Probability', hasThreshold: true,
    thresholdLabel: 'Exclude if Success Probability below', defaultThreshold: 15,
    test: (c, t) => c.successProbability != null && c.successProbability < t,
    reasonFn: (c, t) => `PitchBook-modeled Success Probability is ${c.successProbability}/100 — below the severe-risk threshold of ${t}.`,
  },
  {
    key: 'staleStartup', label: 'Stalled Pre-Revenue Company', hasThreshold: true,
    thresholdLabel: 'Exclude if no funding in (years)', defaultThreshold: 5,
    test: (c, t) => {
      if (!c.lastFinancingDate) return false;
      const yrs = (Date.now() - new Date(c.lastFinancingDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (isNaN(yrs) || yrs < t) return false;
      return ['Startup', 'Product Development', 'Stealth', 'Product In Beta Test'].includes(c.businessStatus);
    },
    reasonFn: (c) => {
      const yrs = (Date.now() - new Date(c.lastFinancingDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
      return `No new disclosed funding in ${yrs.toFixed(1)} years while still at a pre-revenue stage (${c.businessStatus}) — a going-concern-style stall.`;
    },
  },
  {
    key: 'unverifiable', label: 'Unverifiable Record', hasThreshold: false,
    test: (c) => !c.description && !c.website && c.totalRaised == null,
    reasonFn: () => 'No description, website, or disclosed funding on file — cannot be verified or screened with any rigor.',
  },
  {
    key: 'weakCommodity', label: 'Commodity Moat + Capital-Heavy', hasThreshold: false,
    test: (c) => c.moat === 'Low Differentiation (Commodity Software)' && (c.capitalIntensity || '').startsWith('Capital-heavy'),
    reasonFn: () => 'Commodity-software moat combined with a capital-heavy operating model — a structurally weak combination.',
  },
  {
    key: 'blankRecord', label: 'Essentially Blank Record', hasThreshold: true,
    thresholdLabel: 'Exclude if avg. data confidence below (%)', defaultThreshold: 15,
    test: (c, t, metrics) => {
      const avg = CANONICAL_CATEGORIES.reduce((s, cat) => s + metrics[cat.key].confidence, 0) / CANONICAL_CATEGORIES.length;
      return avg < t;
    },
    reasonFn: (c, t, metrics) => {
      const avg = Math.round(CANONICAL_CATEGORIES.reduce((s, cat) => s + metrics[cat.key].confidence, 0) / CANONICAL_CATEGORIES.length);
      return `Average data confidence across all categories is only ${avg}% — essentially a blank record with too little real signal to screen.`;
    },
  },
];

let advState = null;
let advCurrentStage = 1;
let advResult = null;
let advAssumptionsOpen = true;
let advTemplates = [];
let advManualSearchTimer = null;

function advDefaultState() {
  return {
    rules: DEALBREAKER_RULE_DEFS.map(d => ({ ...d, enabled: true, threshold: d.defaultThreshold })),
    sizeBands: { small: 5, mid: 50 },
    stage3Categories: LENS_PRESETS.investment.categories.map(c => ({ ...c })),
    stage4TopN: 25,
    consensusThreshold: 2,
    blendRatio: 0.6,
    finalShortlistN: 7,
    manuallyAdded: new Set(),
    scorecards: {},
  };
}

function advSizeBand(c, bands) {
  if (c.totalRaised == null) return 'Undisclosed';
  if (c.totalRaised < bands.small) return 'Small';
  if (c.totalRaised < bands.mid) return 'Mid';
  return 'Large';
}

/* ---------- Core pipeline (pure computation over current advState) ---------- */
function runAdvPipeline() {
  const metricsById = {};
  ALL.forEach(c => { metricsById[c.id] = computeAllMetrics(c, SCORE_CTX); });

  const excluded = [];
  const passed = [];
  ALL.forEach(c => {
    const metrics = metricsById[c.id];
    let hit = null;
    for (const rule of advState.rules) {
      if (!rule.enabled) continue;
      if (rule.test(c, rule.threshold, metrics)) { hit = rule; break; }
    }
    if (hit) excluded.push({ c, rule: hit, reason: hit.reasonFn(c, hit.threshold, metrics) });
    else passed.push(c);
  });
  const exclusionRate = ALL.length ? excluded.length / ALL.length : 0;

  const clusters = {};
  passed.forEach(c => {
    const band = advSizeBand(c, advState.sizeBands);
    const seg = c.segment || 'Unclassified';
    const key = seg + '||' + band;
    (clusters[key] = clusters[key] || { segment: seg, band, members: [] }).members.push(c);
  });
  const GLOBAL_KEY = '__global__';
  clusters[GLOBAL_KEY] = { segment: 'All passed companies', band: '(fallback)', members: passed };

  const allMetricKeys = CANONICAL_CATEGORIES.concat(customFieldCategoryDefs());

  const clusterStats = {};
  Object.entries(clusters).forEach(([key, cl]) => {
    const stats = {};
    allMetricKeys.forEach(cat => {
      const vals = cl.members.map(c => metricsById[c.id][cat.key].score);
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1);
      stats[cat.key] = { mean, stdev: Math.sqrt(variance) || 1, n: vals.length };
    });
    clusterStats[key] = stats;
  });

  const MIN_CLUSTER_SIZE = 3;
  const clusterKeyById = {}, usedFallbackById = {};
  passed.forEach(c => {
    const band = advSizeBand(c, advState.sizeBands);
    const seg = c.segment || 'Unclassified';
    const key = seg + '||' + band;
    const useFallback = clusters[key].members.length < MIN_CLUSTER_SIZE;
    const statsKey = useFallback ? GLOBAL_KEY : key;
    const stats = clusterStats[statsKey];
    const metrics = metricsById[c.id];
    const z = {}, rel = {};
    allMetricKeys.forEach(cat => {
      const s = stats[cat.key];
      const zv = s.stdev > 0 ? (metrics[cat.key].score - s.mean) / s.stdev : 0;
      z[cat.key] = zv;
      rel[cat.key] = Math.max(0, Math.min(100, 50 + zv * 15));
    });
    metrics._z = z; metrics._rel = rel;
    clusterKeyById[c.id] = key;
    usedFallbackById[c.id] = useFallback;
  });

  function scoreWithCats(c, cats) {
    const rel = metricsById[c.id]._rel;
    const totalWeight = cats.reduce((s, cat) => s + cat.weight, 0) || 1;
    let score = 0;
    cats.forEach(cat => {
      const key = cat.alias || cat.key;
      score += (rel[key] != null ? rel[key] : 50) * (cat.weight / totalWeight);
    });
    return Math.round(score * 10) / 10;
  }

  const stage3 = passed.map(c => ({ c, score: scoreWithCats(c, advState.stage3Categories) })).sort((a, b) => b.score - a.score);

  const topN = stage3.slice(0, advState.stage4TopN);
  const LENS_A = [{ key: 'finance', weight: 40 }, { key: 'scale', weight: 30 }, { key: 'traction', weight: 20 }, { key: 'risk', weight: 10 }];
  const LENS_B = [{ key: 'stratfit', weight: 40 }, { key: 'market', weight: 25 }, { key: 'tech', weight: 20 }, { key: 'traction', weight: 15 }];
  const lensCCats = (() => {
    const cats = advState.stage3Categories.map(c => ({ ...c }));
    const riskCat = cats.find(c => (c.alias || c.key) === 'risk');
    if (riskCat) riskCat.weight *= 2; else cats.push({ key: 'risk', label: 'Risk', weight: 20 });
    return cats;
  })();

  const lensAResults = topN.map(r => ({ c: r.c, score: scoreWithCats(r.c, LENS_A) })).sort((a, b) => b.score - a.score);
  const lensBResults = topN.map(r => ({ c: r.c, score: scoreWithCats(r.c, LENS_B) })).sort((a, b) => b.score - a.score);
  const lensCResults = topN.map(r => ({ c: r.c, score: scoreWithCats(r.c, lensCCats) })).sort((a, b) => b.score - a.score);

  const top10A = new Set(lensAResults.slice(0, 10).map(r => r.c.id));
  const top10B = new Set(lensBResults.slice(0, 10).map(r => r.c.id));
  const top10C = new Set(lensCResults.slice(0, 10).map(r => r.c.id));

  const consensus = [], lowConfidence = [];
  const lensRankById = {};
  topN.forEach(r => {
    const inA = top10A.has(r.c.id), inB = top10B.has(r.c.id), inC = top10C.has(r.c.id);
    const inCount = [inA, inB, inC].filter(Boolean).length;
    lensRankById[r.c.id] = {
      a: lensAResults.findIndex(x => x.c.id === r.c.id) + 1,
      b: lensBResults.findIndex(x => x.c.id === r.c.id) + 1,
      c: lensCResults.findIndex(x => x.c.id === r.c.id) + 1,
      inA, inB, inC, inCount,
    };
    if (inCount >= advState.consensusThreshold) consensus.push(r);
    else if (inCount === 0) lowConfidence.push(r);
  });

  const candidateIds = new Set([...consensus.map(r => r.c.id), ...advState.manuallyAdded]);
  const candidates = ALL.filter(c => candidateIds.has(c.id)).map(c => {
    const stage3Entry = stage3.find(r => r.c.id === c.id);
    const sc = advState.scorecards[c.id] || {};
    const ratingVals = [sc.management_quality, sc.integration_complexity, sc.market_timing, sc.deal_feasibility].filter(v => v != null && v !== '');
    const qualAvg = ratingVals.length ? ratingVals.reduce((a, b) => a + Number(b), 0) / ratingVals.length : null;
    const quantScore = stage3Entry ? stage3Entry.score : 0;
    const blend = advState.blendRatio;
    const combined = qualAvg != null ? (quantScore * blend + (qualAvg * 20) * (1 - blend)) : quantScore * blend;
    return { c, quantScore, qualAvg, combined: Math.round(combined * 10) / 10, ratings: sc, isConsensus: consensus.some(r => r.c.id === c.id) };
  }).sort((a, b) => b.combined - a.combined);

  const finalShortlist = candidates.slice(0, advState.finalShortlistN);

  return {
    metricsById, excluded, passed, exclusionRate, clusters, clusterStats, clusterKeyById, usedFallbackById,
    stage3, topN, lensAResults, lensBResults, lensCResults, lensRankById, consensus, lowConfidence,
    candidates, finalShortlist,
  };
}

function advRecompute() {
  advResult = runAdvPipeline();
  advRenderFunnel();
  advRenderStepper();
  advRenderStage();
  advRenderAssumptionsSanity();
}

/* ---------- Stepper + funnel ---------- */
function advRenderStepper() {
  document.getElementById('advStepper').innerHTML = ADV_STAGE_LABELS.map((label, i) => {
    const n = i + 1;
    let count = '';
    if (advResult) {
      if (n === 1) count = advResult.passed.length;
      else if (n === 2 || n === 3) count = advResult.passed.length;
      else if (n === 4) count = advResult.topN.length;
      else if (n === 5) count = advResult.candidates.length;
    }
    return `<div class="adv-step ${n === advCurrentStage ? 'active' : ''} ${n < advCurrentStage ? 'done' : ''}" data-stage="${n}">
      <div class="adv-step-num">${n}</div>
      <div class="adv-step-label">${label}</div>
      <div class="adv-step-count">${count !== '' ? count + ' in play' : ''}</div>
    </div>${n < 5 ? '<div class="adv-step-connector"></div>' : ''}`;
  }).join('');
  document.querySelectorAll('#advStepper .adv-step').forEach(el => {
    el.onclick = () => { advCurrentStage = parseInt(el.dataset.stage); advRenderStepper(); advRenderStage(); };
  });
}

function advRenderFunnel() {
  if (!advResult) return;
  const steps = [
    { label: 'Universe', value: ALL.length, color: '#8b5cf6' },
    { label: 'Pass Dealbreakers', value: advResult.passed.length, color: '#3bc3da' },
    { label: 'Scored & Ranked', value: advResult.passed.length, color: '#3fbb7d' },
    { label: 'Multi-Lens Check', value: advResult.topN.length, color: '#f5934f' },
    { label: 'Consensus Picks', value: advResult.consensus.length, color: '#ecca52' },
    { label: 'Final Shortlist', value: advResult.finalShortlist.length, color: '#e0699f' },
  ];
  document.getElementById('advFunnelViz').innerHTML = steps.map((s, i) => `
    <div class="funnel-step">
      <div class="fs-bar" style="background:linear-gradient(135deg,${s.color},${s.color}cc);">${s.value}</div>
      <div class="fs-label">${s.label}</div>
    </div>${i < steps.length - 1 ? '<div class="funnel-arrow">→</div>' : ''}
  `).join('');
}

function advRenderAssumptionsSanity() {
  const el = document.getElementById('advSanityNote');
  if (!advResult) { el.innerHTML = ''; return; }
  const pct = (advResult.exclusionRate * 100).toFixed(1);
  if (advResult.exclusionRate > 0.20) {
    el.innerHTML = `⚠️ ${pct}% of companies were excluded — that's above the ~20% sanity threshold. These rules may be behaving like an old-style sequential elimination funnel rather than true dealbreakers. Consider loosening a rule.`;
    el.classList.add('bad');
  } else {
    el.innerHTML = `✓ ${pct}% excluded — within the expected range for true dealbreakers only.`;
    el.classList.remove('bad');
  }
}

/* ---------- Assumptions panel ---------- */
function advRenderAssumptions() {
  document.getElementById('advDealbreakerRules').innerHTML = advState.rules.map((r, i) => `
    <div class="adv-rule-row">
      <label class="adv-rule-toggle"><input type="checkbox" data-rule-idx="${i}" ${r.enabled ? 'checked' : ''}> ${escapeHtml(r.label)}</label>
      ${r.hasThreshold ? `<span class="adv-rule-threshold">${escapeHtml(r.thresholdLabel)} <input type="number" data-threshold-idx="${i}" value="${r.threshold}" style="width:55px;"></span>` : ''}
    </div>
  `).join('');
  document.querySelectorAll('#advDealbreakerRules [data-rule-idx]').forEach(cb => {
    cb.onchange = () => { advState.rules[parseInt(cb.dataset.ruleIdx)].enabled = cb.checked; advRecompute(); };
  });
  document.querySelectorAll('#advDealbreakerRules [data-threshold-idx]').forEach(inp => {
    inp.onchange = () => { advState.rules[parseInt(inp.dataset.thresholdIdx)].threshold = parseFloat(inp.value); advRecompute(); };
  });

  document.getElementById('advSizeBandInputs').innerHTML = `
    <div class="adv-rule-row"><label>Small / Mid breakpoint ($M raised) <input type="number" id="advSizeSmallInput" value="${advState.sizeBands.small}" style="width:65px;"></label></div>
    <div class="adv-rule-row"><label>Mid / Large breakpoint ($M raised) <input type="number" id="advSizeMidInput" value="${advState.sizeBands.mid}" style="width:65px;"></label></div>
  `;
  document.getElementById('advSizeSmallInput').onchange = (e) => { advState.sizeBands.small = parseFloat(e.target.value) || 0; advRecompute(); };
  document.getElementById('advSizeMidInput').onchange = (e) => { advState.sizeBands.mid = parseFloat(e.target.value) || 0; advRecompute(); };

  advRenderStage3CatRows();

  document.getElementById('advStage4TopNInput').value = advState.stage4TopN;
  document.getElementById('advStage4TopNInput').onchange = (e) => { advState.stage4TopN = Math.max(5, parseInt(e.target.value) || 25); advRecompute(); };
  document.getElementById('advConsensusThresholdInput').value = advState.consensusThreshold;
  document.getElementById('advConsensusThresholdInput').onchange = (e) => { advState.consensusThreshold = Math.max(1, Math.min(3, parseInt(e.target.value) || 2)); advRecompute(); };

  document.getElementById('advBlendRatioInput').value = Math.round(advState.blendRatio * 100);
  document.getElementById('advBlendRatioVal').textContent = Math.round(advState.blendRatio * 100) + '%';
  document.getElementById('advBlendRatioInput').oninput = (e) => {
    advState.blendRatio = parseInt(e.target.value) / 100;
    document.getElementById('advBlendRatioVal').textContent = e.target.value + '%';
    advRecompute();
  };
  document.getElementById('advFinalShortlistNInput').value = advState.finalShortlistN;
  document.getElementById('advFinalShortlistNInput').onchange = (e) => { advState.finalShortlistN = Math.max(1, parseInt(e.target.value) || 7); advRecompute(); };

  document.getElementById('advAssumptionsToggle').onclick = () => {
    advAssumptionsOpen = !advAssumptionsOpen;
    document.getElementById('advAssumptionsBody').style.display = advAssumptionsOpen ? '' : 'none';
    document.getElementById('advAssumptionsCaret').textContent = advAssumptionsOpen ? '▾' : '▸';
  };
}

function advAllCategoryOptions() {
  return CANONICAL_CATEGORIES.concat(customFieldCategoryDefs());
}

function advRenderStage3CatRows() {
  const usedKeys = advState.stage3Categories.map(c => c.alias || c.key);
  const allOptions = advAllCategoryOptions();
  document.getElementById('advStage3CatRows').innerHTML = advState.stage3Categories.map((cat, i) => `
    <div class="custom-cat-row" data-idx="${i}">
      <select data-idx="${i}">
        ${allOptions.map(cc => `<option value="${cc.key}" ${cc.key === (cat.alias || cat.key) ? 'selected' : ''} ${usedKeys.includes(cc.key) && cc.key !== (cat.alias || cat.key) ? 'disabled' : ''}>${cc.label}</option>`).join('')}
      </select>
      <div class="custom-cat-weight-row">
        <input type="range" min="0" max="100" value="${cat.weight}" data-idx="${i}">
        <span class="wval" id="advwval-${i}">${cat.weight}%</span>
        <span class="remove-x" data-idx="${i}">×</span>
      </div>
    </div>
  `).join('');
  document.querySelectorAll('#advStage3CatRows select').forEach(sel => {
    sel.onchange = () => {
      const i = parseInt(sel.dataset.idx);
      const def = allOptions.find(cc => cc.key === sel.value);
      advState.stage3Categories[i] = { key: sel.value, label: def.label, weight: advState.stage3Categories[i].weight };
      advRenderStage3CatRows(); advRecompute();
    };
  });
  document.querySelectorAll('#advStage3CatRows input[type=range]').forEach(slider => {
    slider.oninput = () => {
      const i = parseInt(slider.dataset.idx);
      advState.stage3Categories[i].weight = parseInt(slider.value);
      document.getElementById(`advwval-${i}`).textContent = slider.value + '%';
      advUpdateWeightTotal(); advRecompute();
    };
  });
  document.querySelectorAll('#advStage3CatRows .remove-x').forEach(x => {
    x.onclick = () => {
      if (advState.stage3Categories.length <= 1) { alert('At least one category is required.'); return; }
      advState.stage3Categories.splice(parseInt(x.dataset.idx), 1);
      advRenderStage3CatRows(); advRecompute();
    };
  });
  document.getElementById('advAddCatBtn').disabled = advState.stage3Categories.length >= allOptions.length;
  advUpdateWeightTotal();
}

function advUpdateWeightTotal() {
  const total = advState.stage3Categories.reduce((s, c) => s + c.weight, 0);
  const el = document.getElementById('advWeightTotal');
  el.textContent = `Total weight: ${total}% (auto-normalized for scoring; aim for 100%)`;
  el.classList.toggle('bad', total !== 100);
}

function advAddCategory() {
  const usedKeys = advState.stage3Categories.map(c => c.alias || c.key);
  const next = advAllCategoryOptions().find(cc => !usedKeys.includes(cc.key));
  if (!next) return;
  advState.stage3Categories.push({ key: next.key, label: next.label, weight: 0 });
  advRenderStage3CatRows(); advRecompute();
}

async function advLoadTemplatesIntoDropdown() {
  advTemplates = await loadScoreTemplates();
  const sel = document.getElementById('advTemplateLoadSelect');
  sel.innerHTML = '<option value="">Load a saved Rankings template…</option>' +
    advTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  sel.onchange = () => {
    if (!sel.value) return;
    const t = advTemplates.find(t => String(t.id) === sel.value);
    if (!t) return;
    advState.stage3Categories = t.categories.map(c => ({ ...c }));
    advRenderStage3CatRows(); advRecompute();
  };
}

/* ---------- Stage content rendering ---------- */
function advRenderStage() {
  if (!advResult) return;
  const body = document.getElementById('advStageContent');
  if (advCurrentStage === 1) body.innerHTML = advStage1Html();
  else if (advCurrentStage === 2) body.innerHTML = advStage2Html();
  else if (advCurrentStage === 3) body.innerHTML = advStage3Html();
  else if (advCurrentStage === 4) body.innerHTML = advStage4Html();
  else body.innerHTML = advStage5Html();
  advWireStageEvents();
}

function advCompanyChip(c) {
  return `<span class="company-name company-hover" ${companyHoverAttrs(c)} style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;" data-adv-trace="${escapeHtml(c.id)}">${companyLogoHtml(c, 18)}${escapeHtml(c.name)}</span>`;
}

function advStage1Html() {
  const r = advResult;
  return `
    <div>
      <div class="section-title"><span>🚫 Stage 1 — Dealbreaker Filter</span></div>
      <p class="subtle">Only true hard exclusions eliminate a company here — not "slightly weak on one metric." Edit the rules in the Assumptions panel; this stage recomputes live.</p>
      <div class="adv-funnel-line">${ALL.length} companies → <strong>${r.passed.length} pass</strong> (${(r.exclusionRate * 100).toFixed(1)}% excluded)</div>
      <details class="adv-collapsible">
        <summary>Show ${r.excluded.length} excluded companies and their reasons</summary>
        <table class="grid"><thead><tr><th>Company</th><th>Rule</th><th>Reason</th></tr></thead>
          <tbody>${r.excluded.slice(0, 300).map(x => `<tr><td>${advCompanyChip(x.c)}</td><td>${escapeHtml(x.rule.label)}</td><td>${escapeHtml(x.reason)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty-state">None excluded.</td></tr>'}</tbody>
        </table>
        ${r.excluded.length > 300 ? `<p class="footer-note">Showing first 300 of ${r.excluded.length}.</p>` : ''}
      </details>
    </div>`;
}

function advStage2Html() {
  const r = advResult;
  const clusterEntries = Object.entries(r.clusters).filter(([k]) => k !== '__global__').sort((a, b) => b[1].members.length - a[1].members.length);
  return `
    <div>
      <div class="section-title"><span>🧩 Stage 2 — Cluster-Relative Scoring</span></div>
      <p class="subtle">Companies are grouped with their true peers — same industry segment, similar funding size — so a software company is compared to other software companies, not to a logistics company. Clusters with fewer than 3 peers fall back to the full passed population (flagged below). Business Model & Scalability is shown by default since it's the headline factor for replication-style screening.</p>
      <div class="adv-metric-picker">Metric: <select id="advClusterMetricSelect">${advAllCategoryOptions().map(cat => `<option value="${cat.key}" ${cat.key === 'scale' ? 'selected' : ''}>${cat.label}</option>`).join('')}</select></div>
      <table class="grid"><thead><tr><th>Segment</th><th>Size Band</th><th>Peers</th><th>Avg Score (this metric)</th><th></th></tr></thead>
        <tbody>${clusterEntries.map(([key, cl]) => {
          const stats = r.clusterStats[key];
          return `<tr data-cluster-key="${escapeHtml(key)}"><td>${escapeHtml(cl.segment)}</td><td>${escapeHtml(cl.band)}</td><td>${cl.members.length}</td><td id="adv-cluster-avg-${escapeHtml(key).replace(/[^a-zA-Z0-9]/g,'_')}">—</td><td><button class="mini-btn" data-cluster-view="${escapeHtml(key)}">View members</button></td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

function advStage3Html() {
  const r = advResult;
  const top = r.stage3.slice(0, 100);
  return `
    <div>
      <div class="section-title"><span>📊 Stage 3 — Weighted Ranking</span><span class="badge-count" style="background:#f5934f;">${r.stage3.length}</span></div>
      <p class="subtle">Same factor-weight model as the simple Rankings page (edit weights in the Assumptions panel) — but applied to the cluster-relative scores from Stage 2 instead of raw/global scores. Nothing is eliminated here, this is an ordering only.</p>
      <table class="grid"><thead><tr><th>#</th><th>Company</th><th>Segment</th><th>Overall Score</th></tr></thead>
        <tbody>${top.map((row, i) => `<tr><td>${i + 1}</td><td>${advCompanyChip(row.c)}</td><td>${row.c.segment ? tagHtml(row.c.segment, segColor(row.c.segment)) : naText(null)}</td><td><strong>${row.score.toFixed(1)}</strong></td></tr>`).join('')}</tbody>
      </table>
      <p class="footer-note">Showing top 100 of ${r.stage3.length} passed companies.</p>
    </div>`;
}

function advLensTable(label, results, top10Set, color) {
  return `
    <div class="adv-lens-col">
      <h4 style="color:${color};">${label}</h4>
      <table class="grid adv-lens-table">
        <tbody>${results.slice(0, 10).map((row, i) => `<tr><td>${i + 1}</td><td>${advCompanyChip(row.c)}</td><td>${row.score.toFixed(1)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function advStage4Html() {
  const r = advResult;
  return `
    <div>
      <div class="section-title"><span>🔍 Stage 4 — Multi-Lens Validation</span></div>
      <p class="subtle">The top ${r.topN.length} companies by Stage 3 score, re-ranked under 3 independent lenses. A <strong>Consensus Pick</strong> (top 10 in ≥${advState.consensusThreshold} of 3 lenses) is one an investment committee can trust most — it isn't winning on just one blended number.</p>
      <div class="adv-lens-row">
        ${advLensTable('Lens A — Financial Strength', r.lensAResults, null, '#3fbb7d')}
        ${advLensTable('Lens B — Strategic Fit', r.lensBResults, null, '#8b5cf6')}
        ${advLensTable('Lens C — Risk-Adjusted', r.lensCResults, null, '#e0699f')}
      </div>
      <h4 style="margin-top:22px;">⭐ Consensus Picks (${r.consensus.length})</h4>
      <table class="grid"><thead><tr><th>Company</th><th>Stage 3 Score</th><th>Lens A Rank</th><th>Lens B Rank</th><th>Lens C Rank</th></tr></thead>
        <tbody>${r.consensus.map(row => {
          const lr = r.lensRankById[row.c.id];
          return `<tr class="adv-consensus-row"><td>${advCompanyChip(row.c)}</td><td>${row.score.toFixed(1)}</td>
            <td class="${lr.inA ? 'best-cell' : ''}">${lr.a}</td><td class="${lr.inB ? 'best-cell' : ''}">${lr.b}</td><td class="${lr.inC ? 'best-cell' : ''}">${lr.c}</td></tr>`;
        }).join('') || '<tr><td colspan="5" class="empty-state">No consensus picks at the current threshold.</td></tr>'}</tbody>
      </table>
      ${r.lowConfidence.length ? `<details class="adv-collapsible" style="margin-top:14px;">
        <summary>⚠️ ${r.lowConfidence.length} lower-confidence companies (strong composite, but 0 lens top-10s)</summary>
        <table class="grid"><tbody>${r.lowConfidence.map(row => `<tr><td>${advCompanyChip(row.c)}</td><td>${row.score.toFixed(1)}</td></tr>`).join('')}</tbody></table>
      </details>` : ''}
    </div>`;
}

function advStage5Html() {
  const r = advResult;
  return `
    <div>
      <div class="section-title"><span>🤝 Stage 5 — Final Pairwise Comparison</span></div>
      <div class="ai-insight-box"><span class="ai-label">Human judgment workspace</span><p style="margin:4px 0 0;">This stage is for your team's judgment — the data can't fully capture management quality, integration complexity, market timing, or deal feasibility. Ratings are saved automatically.</p></div>

      <div class="adv-manual-add">
        <input type="text" id="advManualAddInput" placeholder="Manually add a high-conviction company that wasn't a Consensus Pick…">
        <div id="advManualAddResults"></div>
      </div>

      <div id="advCandidateCards">${r.candidates.map(advCandidateCardHtml).join('') || '<div class="empty-state">No candidates yet — they will appear here once Stage 4 produces Consensus Picks, or you add one manually above.</div>'}</div>

      <h3 style="margin-top:26px;">🏁 Final Shortlist (top ${advState.finalShortlistN})</h3>
      <table class="grid"><thead><tr><th>Company</th><th>Overall Score</th><th>Qualitative Avg</th><th>Combined Score</th><th>Rationale</th></tr></thead>
        <tbody>${r.finalShortlist.map(x => `<tr>
          <td>${advCompanyChip(x.c)}</td><td>${x.quantScore.toFixed(1)}</td><td>${x.qualAvg != null ? x.qualAvg.toFixed(1) + '/5' : naText(null)}</td><td><strong>${x.combined.toFixed(1)}</strong></td>
          <td class="subtle">${advRationale(x)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty-state">No final shortlist yet.</td></tr>'}</tbody>
      </table>
      ${r.finalShortlist.length ? `<button class="mini-btn primary" id="advExportShortlistBtn" style="margin-top:10px;">Export Final Shortlist (.xlsx)</button>` : ''}
    </div>`;
}

function advRationale(x) {
  const bits = [];
  if (x.isConsensus) bits.push('Consensus Pick across multiple lenses');
  bits.push(`Stage 3 composite ${x.quantScore.toFixed(1)}/100`);
  if (x.qualAvg != null) bits.push(`qualitative average ${x.qualAvg.toFixed(1)}/5`);
  else bits.push('qualitative scorecard not yet completed');
  return bits.join(' · ');
}

function advCandidateCardHtml(x) {
  const sc = x.ratings || {};
  const dims = [
    ['management_quality', 'Management Quality'],
    ['integration_complexity', 'Integration Complexity (5 = easiest)'],
    ['market_timing', 'Market Timing'],
    ['deal_feasibility', 'Deal Feasibility'],
  ];
  return `
    <div class="adv-candidate-card" data-candidate-id="${escapeHtml(x.c.id)}">
      <div class="adv-candidate-head">
        ${advCompanyChip(x.c)}
        ${x.isConsensus ? '<span class="rec-badge" style="background:rgba(236,202,82,0.25);color:#9c7a06;">⭐ Consensus Pick</span>' : '<span class="rec-badge" style="background:rgba(139,92,246,0.12);color:var(--purple);">Manually added</span>'}
        <span class="adv-candidate-combined">Combined: <strong>${x.combined.toFixed(1)}</strong></span>
        <span class="remove-x" data-remove-candidate="${escapeHtml(x.c.id)}" title="Remove candidate">×</span>
      </div>
      <div class="adv-scorecard-grid">
        ${dims.map(([key, label]) => `
          <label class="adv-scorecard-dim">${label}
            <select data-sc-key="${key}" data-sc-id="${escapeHtml(x.c.id)}">
              <option value="">—</option>
              ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${String(sc[key]) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </label>`).join('')}
      </div>
    </div>`;
}

/* ---------- Wiring per-stage interactive elements ---------- */
function advWireStageEvents() {
  document.querySelectorAll('[data-adv-trace]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); advShowTraceability(el.dataset.advTrace); });
  });

  if (advCurrentStage === 2) {
    const sel = document.getElementById('advClusterMetricSelect');
    function refreshClusterAverages() {
      const metricKey = sel.value;
      Object.entries(advResult.clusters).forEach(([key, cl]) => {
        if (key === '__global__') return;
        const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_');
        const el2 = document.getElementById('adv-cluster-avg-' + safeKey);
        if (el2) el2.textContent = advResult.clusterStats[key][metricKey].mean.toFixed(1);
      });
    }
    sel.onchange = refreshClusterAverages;
    refreshClusterAverages();
    document.querySelectorAll('[data-cluster-view]').forEach(btn => {
      btn.onclick = () => advRenderClusterMembers(btn.dataset.clusterView, sel.value);
    });
  }

  if (advCurrentStage === 5) {
    document.querySelectorAll('[data-sc-id]').forEach(sel => {
      sel.onchange = () => advSaveScorecardField(sel.dataset.scId, sel.dataset.scKey, sel.value);
    });
    document.querySelectorAll('[data-remove-candidate]').forEach(x => {
      x.onclick = async () => {
        const id = x.dataset.removeCandidate;
        advState.manuallyAdded.delete(id);
        delete advState.scorecards[id];
        await removeScreeningScorecard(id);
        advRecompute();
      };
    });
    const input = document.getElementById('advManualAddInput');
    input.oninput = () => {
      clearTimeout(advManualSearchTimer);
      advManualSearchTimer = setTimeout(() => {
        const q = input.value.toLowerCase().trim();
        const box = document.getElementById('advManualAddResults');
        if (!q) { box.innerHTML = ''; return; }
        const matches = ALL.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 8);
        box.innerHTML = matches.map(c => `<div class="adv-manual-result" data-add-id="${escapeHtml(c.id)}">${escapeHtml(c.name)} <span class="subtle">${naText(c.segment)}</span></div>`).join('') || '<div class="subtle" style="padding:6px;">No matches.</div>';
        box.querySelectorAll('[data-add-id]').forEach(el => {
          el.onclick = async () => {
            advState.manuallyAdded.add(el.dataset.addId);
            await saveScreeningScorecard(el.dataset.addId, { manually_added: 1 });
            input.value = ''; box.innerHTML = '';
            advRecompute();
          };
        });
      }, 200);
    };
    const exportBtn = document.getElementById('advExportShortlistBtn');
    if (exportBtn) exportBtn.onclick = () => {
      const ids = advResult.finalShortlist.map(x => x.c.id).join(',');
      window.open(`/api/export/companies.xlsx?ids=${encodeURIComponent(ids)}`, '_blank');
    };
  }
}

function advRenderClusterMembers(clusterKey, metricKey) {
  const cl = advResult.clusters[clusterKey];
  const allOptions = advAllCategoryOptions();

  function tableHtml(mk) {
    return `<table class="grid"><thead><tr><th>Company</th><th>Raw Score</th><th>Cluster Z-score</th><th>Cluster-Relative Score</th></tr></thead>
      <tbody>${cl.members.map(c => {
        const m = advResult.metricsById[c.id];
        const fallback = advResult.usedFallbackById[c.id];
        return `<tr><td>${advCompanyChip(c)}${fallback ? ' <span class="pb-derived-tag">global fallback</span>' : ''}</td><td>${m[mk].score}</td><td>${m._z[mk].toFixed(2)}</td><td>${m._rel[mk].toFixed(1)}</td></tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  const html = `
    <h2>${escapeHtml(cl.segment)} · ${escapeHtml(cl.band)}</h2>
    <p class="subtle">${cl.members.length} peer companies in this cluster.</p>
    <div class="adv-metric-picker">Metric: <select id="advClusterMembersMetricSelect">${allOptions.map(cat => `<option value="${cat.key}" ${cat.key === metricKey ? 'selected' : ''}>${cat.label}</option>`).join('')}</select></div>
    <div id="advClusterMembersTable">${tableHtml(metricKey)}</div>
  `;
  openSlideOver(html);
  document.getElementById('advClusterMembersMetricSelect').onchange = (e) => {
    document.getElementById('advClusterMembersTable').innerHTML = tableHtml(e.target.value);
    wireClusterMemberTraceLinks();
  };
  wireClusterMemberTraceLinks();
}

function wireClusterMemberTraceLinks() {
  document.querySelectorAll('#slideOverContent [data-adv-trace]').forEach(el => {
    el.onclick = (e) => { e.preventDefault(); advShowTraceability(el.dataset.advTrace); };
  });
}

async function advSaveScorecardField(companyId, key, value) {
  advState.scorecards[companyId] = advState.scorecards[companyId] || {};
  advState.scorecards[companyId][key] = value === '' ? null : parseInt(value);
  advState.scorecards[companyId].manually_added = advState.manuallyAdded.has(companyId) ? 1 : 0;
  await saveScreeningScorecard(companyId, advState.scorecards[companyId]);
  advRecompute();
}

/* ---------- Traceability slide-over ---------- */
function advShowTraceability(companyId) {
  const c = byId(companyId);
  if (!c || !advResult) return;
  const excludedEntry = advResult.excluded.find(x => x.c.id === companyId);
  const passed = !excludedEntry;
  const metrics = advResult.metricsById[companyId];
  const stage3Entry = advResult.stage3.find(r => r.c.id === companyId);
  const stage3Rank = stage3Entry ? advResult.stage3.findIndex(r => r.c.id === companyId) + 1 : null;
  const inTopN = advResult.topN.some(r => r.c.id === companyId);
  const lensRank = advResult.lensRankById[companyId];
  const sc = advState.scorecards[companyId] || {};

  let html = `<h2>${escapeHtml(c.name)}</h2><p class="subtle">${naText(c.segment)} · ${naText(c.hq)}</p>`;
  html += `<h3>Stage 1 — Dealbreaker Filter</h3>`;
  html += passed ? `<p style="color:var(--green);font-weight:700;">✓ Passed</p>` : `<p style="color:var(--red);font-weight:700;">✗ Excluded — ${escapeHtml(excludedEntry.rule.label)}</p><p class="subtle">${escapeHtml(excludedEntry.reason)}</p>`;

  if (passed) {
    const clusterKey = advResult.clusterKeyById[companyId];
    const cl = advResult.clusters[clusterKey];
    html += `<h3>Stage 2 — Cluster</h3><p>Cluster: <strong>${escapeHtml(cl.segment)} · ${escapeHtml(cl.band)}</strong> (${cl.members.length} peers)${advResult.usedFallbackById[companyId] ? ' <span class="pb-derived-tag">global fallback used (too few peers)</span>' : ''}</p>
      <table class="kv2"><tbody>${CANONICAL_CATEGORIES.map(cat => `<tr><th>${escapeHtml(cat.label)}</th><td>raw ${metrics[cat.key].score} · z ${metrics._z[cat.key].toFixed(2)} · cluster-relative ${metrics._rel[cat.key].toFixed(1)}</td></tr>`).join('')}</tbody></table>`;

    html += `<h3>Stage 3 — Weighted Ranking</h3><p>Overall Score: <strong>${stage3Entry.score.toFixed(1)}/100</strong> — rank #${stage3Rank} of ${advResult.passed.length}.</p>`;

    html += `<h3>Stage 4 — Multi-Lens Validation</h3>`;
    if (inTopN && lensRank) {
      html += `<table class="kv2"><tbody>
        <tr><th>Lens A — Financial Strength</th><td>rank #${lensRank.a} of ${advResult.topN.length} ${lensRank.inA ? '✓ top 10' : ''}</td></tr>
        <tr><th>Lens B — Strategic Fit</th><td>rank #${lensRank.b} of ${advResult.topN.length} ${lensRank.inB ? '✓ top 10' : ''}</td></tr>
        <tr><th>Lens C — Risk-Adjusted</th><td>rank #${lensRank.c} of ${advResult.topN.length} ${lensRank.inC ? '✓ top 10' : ''}</td></tr>
      </tbody></table><p>${lensRank.inCount >= advState.consensusThreshold ? '⭐ Consensus Pick' : lensRank.inCount === 0 ? '⚠️ Lower-confidence (0 lens top-10s)' : 'In 1 lens top-10.'}</p>`;
    } else {
      html += `<p class="subtle">Did not make the top ${advState.stage4TopN} carried into Stage 4.</p>`;
    }

    html += `<h3>Stage 5 — Final Comparison</h3>`;
    const isCandidate = advState.manuallyAdded.has(companyId) || (lensRank && lensRank.inCount >= advState.consensusThreshold);
    if (isCandidate) {
      html += `<table class="kv2"><tbody>
        <tr><th>Management Quality</th><td>${naText(sc.management_quality)}</td></tr>
        <tr><th>Integration Complexity</th><td>${naText(sc.integration_complexity)}</td></tr>
        <tr><th>Market Timing</th><td>${naText(sc.market_timing)}</td></tr>
        <tr><th>Deal Feasibility</th><td>${naText(sc.deal_feasibility)}</td></tr>
      </tbody></table><p class="subtle">Edit these on the Stage 5 candidate card.</p>`;
    } else {
      html += `<p class="subtle">Not currently a Stage 5 candidate — add it manually on Stage 5 if you believe it was missed.</p>`;
    }
  }
  html += `<p style="margin-top:16px;"><a href="#company/${encodeURIComponent(companyId)}" style="color:var(--purple);font-weight:700;">Open full Company Profile →</a></p>`;
  openSlideOver(html);
}

/* ---------- Init ---------- */
async function initAdvScreenPage() {
  if (!advState) advState = advDefaultState();
  if (!advState._scorecardsLoaded) {
    const rows = await loadScreeningScorecards();
    rows.forEach(row => {
      advState.scorecards[row.company_id] = row;
      if (row.manually_added) advState.manuallyAdded.add(row.company_id);
    });
    advState._scorecardsLoaded = true;
  }
  await advLoadTemplatesIntoDropdown();
  document.getElementById('advAddCatBtn').onclick = advAddCategory;
  advRenderAssumptions();
  document.getElementById('advAssumptionsBody').style.display = advAssumptionsOpen ? '' : 'none';
  advRecompute();
}
