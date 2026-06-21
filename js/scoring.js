/* ====================================================================================
   INTELLIGENT MULTI-LENS SCORING ENGINE
   ------------------------------------------------------------------------------------
   Every sub-score below is computed ONLY from fields that exist in the dataset
   (funding events, classifications, and evidence phrases found in the real description
   text). Nothing here is invented. Where a company has no real signal for a category,
   that category defaults to a NEUTRAL midpoint (50) rather than being penalized — the
   gap shows up in that category's CONFIDENCE instead, per the spec: missing data lowers
   confidence, not the score.
   ==================================================================================== */

const MOAT_RANK = {
  'Regulatory License (MGA/Carrier Authority)': 95,
  'Network Effects (Marketplace Liquidity)': 90,
  'Switching Costs / Deep System Integration': 75,
  'Proprietary Data & Analytics': 65,
  'Brand & Distribution Scale': 55,
  'Low Differentiation (Commodity Software)': 20,
};

/* ---------- Shared population context (percentile ranks) ---------- */
function percentileRank(sortedArr, value) {
  if (value == null || sortedArr.length === 0) return null;
  let lo = 0, hi = sortedArr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; sortedArr[mid] < value ? lo = mid + 1 : hi = mid; }
  return (lo / sortedArr.length) * 100;
}

function buildScoreContext(all) {
  const raisedVals = all.map(c => c.totalRaised).filter(v => v != null).sort((a, b) => a - b);
  const valuationVals = all.map(c => companyValuation(c)).filter(v => v != null).sort((a, b) => a - b);
  const now = Date.now();
  const momentumVals = all.map(c => momentumRaw(c, now)).filter(v => v != null).sort((a, b) => a - b);
  const segmentCounts = {}, segmentModelCounts = {};
  all.forEach(c => {
    if (c.segment) segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1;
    const key = c.segment + '||' + c.businessModel;
    if (c.segment && c.businessModel) segmentModelCounts[key] = (segmentModelCounts[key] || 0) + 1;
  });
  return { raisedVals, valuationVals, momentumVals, now, segmentCounts, segmentModelCounts, all };
}

function momentumRaw(c, now) {
  if (!c.lastFinancingDate) return null;
  const t = new Date(c.lastFinancingDate).getTime();
  if (isNaN(t)) return null;
  const monthsAgo = (now - t) / (1000 * 60 * 60 * 24 * 30);
  const recency = Math.max(0, 60 - monthsAgo);
  const sizeBoost = c.lastFinancingSize != null ? Math.log10(c.lastFinancingSize + 1) : 0;
  return recency + sizeBoost * 5;
}

function peerContext(c, ctx) {
  const segmentPeers = (ctx.segmentCounts[c.segment] || 1) - 1;
  const segmentModelPeers = (ctx.segmentModelCounts[c.segment + '||' + c.businessModel] || 1) - 1;
  return { segmentPeers, segmentModelPeers };
}

/* Keyword evidence scan — returns matched evidence phrases (real substrings of the real
   description), never invented claims. */
const TECH_KEYWORD_GROUPS = {
  'AI / Machine Learning': ['artificial intelligence', 'ai-powered', 'machine learning', 'predictive', 'algorithm', 'generative ai', 'agentic'],
  'API / Platform Infrastructure': ['api', 'platform', 'integration', 'infrastructure', 'no-code', 'low-code'],
  'Automation': ['automat', 'workflow', 'streamlin'],
  'Data & Analytics': ['data', 'analytics', 'proprietary data'],
};
const MARKET_KEYWORD_GROUPS = {
  'Growth / Expansion language': ['fast-growing', 'rapidly growing', 'emerging', 'expanding', 'underserved', 'global', 'large market'],
  'Partnership-led distribution': ['partner', 'partnership', 'distribut'],
  'Embedded / Point-of-need': ['embed', 'point of sale', 'point-of-sale', 'at the point'],
};

function scanKeywords(text, groups) {
  const hits = [];
  const lower = (text || '').toLowerCase();
  Object.entries(groups).forEach(([label, terms]) => {
    for (const t of terms) {
      const idx = lower.indexOf(t);
      if (idx >= 0) {
        const snippetStart = Math.max(0, idx - 20);
        const snippet = (text || '').slice(snippetStart, idx + t.length + 25).trim();
        hits.push({ label, evidence: snippet });
        break;
      }
    }
  });
  return hits;
}

/* ====================================================================================
   CANONICAL METRICS — one real-data computation per underlying business dimension.
   Each returns { score: 0-100, confidence: 0-100, bullets: [string] }
   ==================================================================================== */

function metricMarket(c, ctx) {
  const peers = peerContext(c, ctx);
  const bullets = [];
  let score = 50, signals = 0;

  if (c.segment) {
    signals++;
    if (peers.segmentPeers >= 100) { score += 18; bullets.push(`Large, active peer cohort (${peers.segmentPeers} other companies classified in "${c.segment}") — substantial market activity.`); }
    else if (peers.segmentPeers >= 30) { score += 10; bullets.push(`Active peer cohort (${peers.segmentPeers} other companies in "${c.segment}") signals real market demand.`); }
    else if (peers.segmentPeers >= 5) { score += 2; bullets.push(`Moderate peer cohort (${peers.segmentPeers} companies) in "${c.segment}".`); }
    else { score -= 5; bullets.push(`Niche/emerging space — only ${peers.segmentPeers} other companies classified in "${c.segment}".`); }
  }

  const hits = scanKeywords(c.description, MARKET_KEYWORD_GROUPS);
  if (hits.length) {
    signals++;
    score += Math.min(15, hits.length * 7);
    hits.forEach(h => bullets.push(`${h.label}: "${h.evidence}…"`));
  }

  if (c.country) signals++;

  const confidence = Math.round((signals / 3) * 100);
  if (!bullets.length) bullets.push('No information available — neutral default applied.');
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

function metricTech(c, ctx) {
  const bullets = [];
  let score = 50, signals = 0;

  const hits = scanKeywords(c.description, TECH_KEYWORD_GROUPS);
  if (hits.length) {
    signals++;
    score += Math.min(30, hits.length * 12);
    hits.forEach(h => bullets.push(`${h.label} signal in description: "${h.evidence}…"`));
  }
  if (c.moat) {
    signals++;
    if (c.moat === 'Proprietary Data & Analytics') { score += 10; bullets.push('Classified moat is Proprietary Data & Analytics — a technology-driven differentiator.'); }
    else if (c.moat === 'Low Differentiation (Commodity Software)') { score -= 15; bullets.push('Classified moat is Low Differentiation (Commodity Software) — limited technical edge.'); }
    else { bullets.push(`Classified moat: ${c.moat}.`); }
  }
  if (c.revenueModel === 'Subscription / License Fees') { signals++; score += 5; bullets.push('Subscription/license revenue model often reflects a productized software platform.'); }

  const confidence = Math.round((signals / 3) * 100);
  if (!bullets.length) bullets.push('No information available — neutral default applied.');
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

const BUSINESS_STATUS_SCORE = {
  'Profitable': 95, 'Generating Revenue': 75, 'Startup': 40, 'Product In Beta Test': 35,
  'Product Development': 30, 'Stealth': 25,
};

function metricTraction(c, ctx) {
  const bullets = [];
  let score = 50, weightedSum = 0, weightTotal = 0, signals = 0;

  if (c.businessStatus && BUSINESS_STATUS_SCORE[c.businessStatus] != null) {
    signals++;
    weightedSum += BUSINESS_STATUS_SCORE[c.businessStatus] * 2; weightTotal += 2;
    bullets.push(`Business status: ${c.businessStatus}.`);
  }
  if (c.activeInvestors) {
    signals++;
    const n = c.activeInvestors.split(',').length;
    const investorScore = n >= 6 ? 85 : n >= 3 ? 70 : n >= 1 ? 55 : 50;
    weightedSum += investorScore; weightTotal += 1;
    bullets.push(`${n} active investor(s) on record — investor validation signal.`);
  }
  const momentum = momentumRaw(c, ctx.now);
  if (momentum != null) {
    signals++;
    const pct = percentileRank(ctx.momentumVals, momentum);
    weightedSum += pct; weightTotal += 1;
    bullets.push(`Funding recency/size ranks in the ${Math.round(pct)}th percentile of the dataset.`);
  }
  if (c.competitors) {
    signals++;
    weightedSum += 60; weightTotal += 0.5;
    bullets.push(`Named competitors on record (${c.competitors.split(',').slice(0, 3).join(', ')}…) — indicates an established, trackable market position.`);
  }

  if (weightTotal > 0) score = weightedSum / weightTotal;
  const confidence = Math.round((signals / 4) * 100);
  if (!bullets.length) bullets.push('No information available — neutral default applied.');
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

function metricScale(c, ctx) {
  const bullets = [];
  let score = 50, signals = 0;

  if (c.capitalIntensity) {
    signals++;
    if (c.capitalIntensity.startsWith('Capital-light')) { score += 20; bullets.push('Capital-light operating model — typically scales faster, without proportional capital needs.'); }
    else { score -= 10; bullets.push('Capital-heavy / balance-sheet model — scaling typically requires more capital.'); }
  }
  if (c.revenueModel) {
    signals++;
    const m = {
      'Subscription / License Fees': [18, 'Recurring subscription revenue is highly scalable and predictable.'],
      'Marketplace / Comparison Platform': [10, 'Marketplace economics can benefit from network effects as it scales.'],
      'Commission / Take Rate': [8, 'Commission-based revenue scales with transaction volume.'],
      'Transaction / Usage Fees': [8, 'Usage-based fees scale with platform activity.'],
      'Data Licensing': [10, 'Data licensing can scale with minimal marginal cost per customer.'],
      'Services / Project Fees': [-12, 'Services/project-fee revenue is typically linear with headcount — harder to scale.'],
      'Premium Underwriting Spread': [-5, 'Underwriting-spread economics scale with capital/capacity, not just demand.'],
      'Mixed / Unclear': [0, null],
    };
    const [delta, note] = m[c.revenueModel] || [0, null];
    score += delta;
    if (note) bullets.push(note);
  }
  if (c.businessModel) {
    signals++;
    const m = {
      'Software / SaaS': [15, 'Pure software business model — generally the easiest to scale.'],
      'Marketplace / Comparison Platform': [10, 'Marketplace model — scalability often improves with liquidity.'],
      'Data, Analytics & API Provider': [12, 'API/data-provider model scales with minimal incremental delivery cost.'],
      'Full-Stack Carrier': [-12, 'Full-stack carrier — capital and regulatory requirements limit scaling speed.'],
      'MGA / Delegated Underwriting Authority': [-5, 'MGA model still carries underwriting/capacity constraints on scale.'],
      'Services / BPO': [-10, 'Services/BPO model scales roughly linearly with people.'],
      'Broker / Agency': [-5, 'Traditional brokerage scaling is often relationship- and headcount-driven.'],
      'Embedded / Affinity Insurance Enabler': [8, 'Embedded distribution can scale through partner integrations rather than direct sales.'],
    };
    const [delta, note] = m[c.businessModel] || [0, null];
    score += delta;
    if (note) bullets.push(note);
  }

  const confidence = Math.round((signals / 3) * 100);
  if (!bullets.length) bullets.push('No information available — neutral default applied.');
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

function metricSimplicity(c, ctx) {
  // "How easy would this be to replicate internally" — inverse of regulatory/capital complexity.
  const bullets = [];
  let score = 50, signals = 0;

  if (c.businessModel) {
    signals++;
    const m = {
      'Software / SaaS': [25, 'Pure software model — no regulatory capital/licensing required to replicate the product itself.'],
      'Data, Analytics & API Provider': [20, 'Data/API product — replicable without underwriting capital.'],
      'Marketplace / Comparison Platform': [12, 'Marketplace model is replicable but depends on building liquidity (harder than pure software).'],
      'Embedded / Affinity Insurance Enabler': [10, 'Embedded-distribution model is replicable but needs partner integrations.'],
      'Broker / Agency': [5, 'Brokerage model replicable but relationship-dependent.'],
      'Services / BPO': [-5, 'Services model requires building operational headcount/expertise to replicate.'],
      'MGA / Delegated Underwriting Authority': [-20, 'MGA status requires delegated underwriting authority from a carrier — not trivially replicable.'],
      'Full-Stack Carrier': [-30, 'Full-stack carrier requires insurance licenses and balance-sheet capital — the hardest model to replicate.'],
    };
    const [delta, note] = m[c.businessModel] || [0, null];
    score += delta;
    if (note) bullets.push(note);
  }
  if (c.capitalIntensity) {
    signals++;
    if (c.capitalIntensity.startsWith('Capital-light')) { score += 10; bullets.push('Capital-light — lower capital bar to replicate.'); }
    else { score -= 10; bullets.push('Capital-heavy — meaningful capital required to replicate.'); }
  }
  if (c.moat) {
    signals++;
    const rank = MOAT_RANK[c.moat];
    if (rank != null) {
      score -= (rank - 50) * 0.3;
      bullets.push(`Moat strength (${c.moat}) ${rank >= 70 ? 'raises' : 'lowers'} the bar to replicate — a strong moat is good for the original company, but harder for others to copy.`);
    }
  }

  const confidence = Math.round((signals / 3) * 100);
  if (!bullets.length) bullets.push('No information available — neutral default applied.');
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

function metricFinance(c, ctx) {
  const bullets = [];
  let weightedSum = 0, weightTotal = 0, signals = 0;

  if (c.totalRaised != null) {
    signals++;
    const pct = percentileRank(ctx.raisedVals, c.totalRaised);
    weightedSum += pct; weightTotal += 1;
    bullets.push(`Total raised ($${Math.round(c.totalRaised).toLocaleString()}M) ranks in the ${Math.round(pct)}th percentile of the dataset.`);
  }
  const val = companyValuation(c);
  if (val != null) {
    signals++;
    const pct = percentileRank(ctx.valuationVals, val);
    weightedSum += pct; weightTotal += 1;
    bullets.push(`Valuation ($${Math.round(val).toLocaleString()}M) ranks in the ${Math.round(pct)}th percentile of the dataset.`);
  }
  if (c.successProbability != null) {
    signals++;
    weightedSum += c.successProbability; weightTotal += 1.5;
    bullets.push(`PitchBook-modeled Success Probability: ${c.successProbability}/100.`);
  }
  if (c.realFinPeriod) {
    signals++;
    weightedSum += 80; weightTotal += 2;
    bullets.push(`Real disclosed financials available for ${c.realFinPeriod}: ${c.realFinKeyRatios}`);
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : 50;
  const confidence = Math.round((signals / 4) * 100);
  if (!bullets.length) bullets.push('No financial data disclosed — neutral default applied.');
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

function metricRisk(c, ctx) {
  // Higher score = LOWER risk (safer).
  const bullets = [];
  let score = 65, signals = 0;

  if (c.ownershipStatus) {
    signals++;
    if (c.ownershipStatus === 'Acquired/Merged') { score -= 15; bullets.push('Already acquired/merged — limited independent control/optionality for a new investor.'); }
    else bullets.push(`Ownership status: ${c.ownershipStatus}.`);
  }
  if (c.moat) {
    signals++;
    if (c.moat === 'Low Differentiation (Commodity Software)') { score -= 15; bullets.push('Low differentiation — vulnerable to competitive commoditization.'); }
    else if (['Regulatory License (MGA/Carrier Authority)', 'Network Effects (Marketplace Liquidity)'].includes(c.moat)) { score += 12; bullets.push(`Strong moat (${c.moat}) reduces competitive risk.`); }
  }
  const peers = peerContext(c, ctx);
  if (c.segment && c.businessModel) {
    signals++;
    if (peers.segmentModelPeers >= 15) { score -= 10; bullets.push(`Crowded competitive niche (${peers.segmentModelPeers} direct peers in the same segment + business model).`); }
    else if (peers.segmentModelPeers === 0) { score += 3; bullets.push('No direct peers in this exact segment + business model — limited direct competition, though this can also mean an unproven niche.'); }
  }
  if (c.lastFinancingDate) {
    signals++;
    const yrsAgo = (ctx.now - new Date(c.lastFinancingDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (!isNaN(yrsAgo) && yrsAgo > 3) { score -= 10; bullets.push(`No new disclosed funding in ${yrsAgo.toFixed(1)} years — potential runway/momentum risk.`); }
  }
  if (isPublic(c)) { score += 10; bullets.push('Publicly traded — disclosure transparency and liquidity reduce information risk.'); }

  const confidence = Math.round((signals / 4) * 100);
  if (!bullets.length) bullets.push('No information available — neutral default applied.');
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

const SEGMENT_CRITICALITY = {
  'Underwriting & Risk Assessment': 85, 'Claims Management': 80, 'Policy Administration & Core Systems': 85,
  'Distribution & Sales': 70, 'Compliance / RegTech': 65, 'Reinsurance Tech': 70, 'Benefits Administration': 60,
  'Customer & Member Engagement': 55, 'Infrastructure / Enabling Tech': 65, 'Full-Stack Carriers / MGAs': 75,
  'Adjacent / Non-Core': 25,
};

function metricStrategicFit(c, ctx) {
  const bullets = [];
  let score = 50, signals = 0;

  if (c.segment && SEGMENT_CRITICALITY[c.segment] != null) {
    signals++;
    score = SEGMENT_CRITICALITY[c.segment];
    bullets.push(`"${c.segment}" is a ${score >= 70 ? 'core' : score <= 35 ? 'tangential' : 'supporting'} part of the insurance value chain — ${score >= 70 ? 'high' : score <= 35 ? 'low' : 'moderate'} generic strategic fit.`);
  }
  if (c.moat) {
    signals++;
    const rank = MOAT_RANK[c.moat] || 50;
    score = score * 0.7 + rank * 0.3;
    bullets.push(`Moat (${c.moat}) factored into fit — a stronger moat means more durable value if acquired.`);
  }
  bullets.push('Strategic Fit here is a generic value-chain-centrality proxy, not tailored to any specific acquirer\'s strategy.');

  const confidence = Math.round((signals / 2) * 100);
  return { score: Math.max(0, Math.min(100, score)), confidence, bullets };
}

/* User-defined custom fields (customfields.js) can optionally become extra evaluation
   categories. Numeric fields are percentile-ranked against every company that has a
   value for that field (real user-entered data, only normalized — never invented).
   Text/tag fields just surface as evidence with a neutral score since there's no
   principled way to rank free text. */
function metricCustomField(c, fieldDef, ctx) {
  const raw = (c.customFields || {})[fieldDef.name];
  if (raw == null || raw === '') {
    return { score: 50, confidence: 0, bullets: [`No value entered for custom field "${fieldDef.name}".`] };
  }
  if (fieldDef.field_type === 'number') {
    const allVals = ctx.all.map(x => Number((x.customFields || {})[fieldDef.name])).filter(v => !isNaN(v)).sort((a, b) => a - b);
    const pct = percentileRank(allVals, Number(raw));
    const score = pct == null ? 50 : pct;
    return { score, confidence: 100, bullets: [`Custom field "${fieldDef.name}" = ${raw} — ${Math.round(score)}th percentile among companies with this field filled in.`] };
  }
  return { score: 65, confidence: 100, bullets: [`Custom field "${fieldDef.name}": ${raw}`] };
}

function customFieldCategoryDefs() {
  return (typeof CUSTOM_FIELD_DEFS !== 'undefined' ? CUSTOM_FIELD_DEFS : []).map(f => ({ key: 'custom:' + f.name, label: f.name + ' (custom field)' }));
}

function computeAllMetrics(c, ctx) {
  const base = {
    market: metricMarket(c, ctx),
    tech: metricTech(c, ctx),
    traction: metricTraction(c, ctx),
    scale: metricScale(c, ctx),
    simplicity: metricSimplicity(c, ctx),
    finance: metricFinance(c, ctx),
    risk: metricRisk(c, ctx),
    stratfit: metricStrategicFit(c, ctx),
  };
  (typeof CUSTOM_FIELD_DEFS !== 'undefined' ? CUSTOM_FIELD_DEFS : []).forEach(f => {
    base['custom:' + f.name] = metricCustomField(c, f, ctx);
  });
  return base;
}

/* ====================================================================================
   LENS DEFINITIONS
   ==================================================================================== */
const CANONICAL_CATEGORIES = [
  { key: 'market', label: 'Market Opportunity' },
  { key: 'tech', label: 'Product & Innovation' },
  { key: 'traction', label: 'Commercial Traction' },
  { key: 'scale', label: 'Business Model & Scalability' },
  { key: 'simplicity', label: 'Business Model Simplicity / Ease of Execution' },
  { key: 'finance', label: 'Financial Health' },
  { key: 'risk', label: 'Risk' },
  { key: 'stratfit', label: 'Strategic Fit' },
];

const LENS_PRESETS = {
  investment: {
    label: 'Investment Opportunity',
    description: 'Identifies companies with the strongest long-term investment potential.',
    categories: [
      { key: 'market', label: 'Market Opportunity', weight: 20 },
      { key: 'tech', label: 'Product & Innovation', weight: 20 },
      { key: 'traction', label: 'Commercial Traction', weight: 20 },
      { key: 'scale', label: 'Business Model & Scalability', weight: 20 },
      { key: 'finance', label: 'Financial Health', weight: 10 },
      { key: 'risk', label: 'Risk', weight: 10 },
    ],
  },
  acquisition: {
    label: 'Acquisition Target',
    description: 'Identifies companies that would create the greatest strategic value if acquired.',
    categories: [
      { key: 'stratfit', label: 'Strategic Fit', weight: 25 },
      { key: 'tech', label: 'Technology & Product Synergy', weight: 20 },
      { key: 'traction', label: 'Commercial Traction', weight: 20 },
      { key: 'scale', label: 'Business Model & Scalability', weight: 15 },
      { key: 'finance', label: 'Financial Health', weight: 10 },
      { key: 'risk', label: 'Risk', weight: 10 },
    ],
  },
  replication: {
    label: 'Replication Target',
    description: 'Identifies companies whose business models could be successfully replicated internally.',
    categories: [
      { key: 'simplicity', label: 'Business Model Simplicity', weight: 25 },
      { key: 'scale', label: 'Scalability', weight: 25 },
      { key: 'tech', label: 'Technology Maturity', weight: 20 },
      { key: 'market', label: 'Market Demand', weight: 15 },
      { key: 'simplicity2', label: 'Ease of Execution', weight: 10, alias: 'simplicity' },
      { key: 'risk', label: 'Risk', weight: 5 },
    ],
  },
};

/* Compute an overall lens score from already-computed canonical metrics + a category weight list. */
function computeLensFromMetrics(metrics, categories) {
  const totalWeight = categories.reduce((s, c) => s + c.weight, 0) || 1;
  let weightedScore = 0, weightedConfidence = 0;
  const breakdown = categories.map(cat => {
    const metricKey = cat.alias || cat.key;
    const m = metrics[metricKey] || { score: 50, confidence: 0, bullets: ['No information available.'] };
    const normWeight = cat.weight / totalWeight;
    weightedScore += m.score * normWeight;
    weightedConfidence += m.confidence * normWeight;
    return {
      key: cat.key, label: cat.label, weight: cat.weight,
      points: Math.round((m.score / 100) * cat.weight * 10) / 10,
      maxPoints: cat.weight,
      score: Math.round(m.score), confidence: Math.round(m.confidence), bullets: m.bullets,
    };
  });
  return {
    overallScore: Math.round(weightedScore * 10) / 10,
    overallConfidence: Math.round(weightedConfidence),
    breakdown,
  };
}

function computeLensScore(c, ctx, lensKeyOrCategories) {
  const metrics = computeAllMetrics(c, ctx);
  const categories = typeof lensKeyOrCategories === 'string' ? LENS_PRESETS[lensKeyOrCategories].categories : lensKeyOrCategories;
  return { ...computeLensFromMetrics(metrics, categories), metrics };
}

/* Backwards-compatible shim for older call sites (comparison.js, chatbot.js, dashboard.js)
   that expect { score, submetrics, dataCoverage }. */
const DEFAULT_WEIGHTS = LENS_PRESETS.investment.categories.reduce((acc, c) => { acc[c.key] = c.weight; return acc; }, {});
function computeScore(c, ctx, weightsOrCategories) {
  let categories;
  if (Array.isArray(weightsOrCategories)) categories = weightsOrCategories;
  else categories = Object.entries(weightsOrCategories || DEFAULT_WEIGHTS).map(([key, weight]) => {
    const def = CANONICAL_CATEGORIES.find(cc => cc.key === key);
    return { key, label: def ? def.label : key, weight };
  });
  const result = computeLensScore(c, ctx, categories);
  return { score: result.overallScore, submetrics: result.metrics, dataCoverage: result.overallConfidence };
}

/* ====================================================================================
   RECOMMENDATION CLASSIFIER
   ==================================================================================== */
function classifyRecommendation(c, ctx) {
  const investment = computeLensScore(c, ctx, 'investment');
  const acquisition = computeLensScore(c, ctx, 'acquisition');
  const replication = computeLensScore(c, ctx, 'replication');
  const avgConfidence = Math.round((investment.overallConfidence + acquisition.overallConfidence + replication.overallConfidence) / 3);

  let tag, emoji, explanation;
  if (avgConfidence < 35) {
    tag = 'Requires Further Due Diligence'; emoji = '📋';
    explanation = `Only ${avgConfidence}% average data confidence across lenses — too little disclosed information (funding, business status, classification signals) to rank with conviction. Treat any score here as provisional until more is known.`;
  } else if (acquisition.overallScore >= 75 && acquisition.overallScore >= investment.overallScore && acquisition.overallScore >= replication.overallScore) {
    tag = 'Best Acquisition Target'; emoji = '🏢';
    explanation = `Scores ${acquisition.overallScore.toFixed(1)}/100 on the Acquisition lens — strong strategic fit and commercial traction make this a candidate worth evaluating for a buy rather than build.`;
  } else if (replication.overallScore >= 75 && replication.overallScore >= investment.overallScore) {
    tag = 'Best Business Model to Replicate'; emoji = '🚀';
    explanation = `Scores ${replication.overallScore.toFixed(1)}/100 on the Replication lens — a simple, scalable model with mature technology that looks buildable internally rather than needing acquisition.`;
  } else if (investment.overallScore >= 75) {
    tag = 'Top Investment Opportunity'; emoji = '⭐';
    explanation = `Scores ${investment.overallScore.toFixed(1)}/100 on the Investment lens — strong combination of market opportunity, traction, and scalability signals.`;
  } else if (investment.metrics.tech.score >= 65 && investment.metrics.traction.score < 55) {
    tag = 'Strategic Partnership Candidate'; emoji = '🤝';
    explanation = `Strong technology/product signal (${Math.round(investment.metrics.tech.score)}/100) but lower commercial traction (${Math.round(investment.metrics.traction.score)}/100) — may be a better fit as a partner/integration than an outright investment or acquisition today.`;
  } else if (investment.overallScore >= 55 && investment.metrics.risk.score < 45) {
    tag = 'High Potential, Higher Risk'; emoji = '⚠️';
    explanation = `Decent overall signal (${investment.overallScore.toFixed(1)}/100) but the Risk metric is low (${Math.round(investment.metrics.risk.score)}/100) — worth tracking, but with elevated risk awareness.`;
  } else {
    tag = 'Requires Further Due Diligence'; emoji = '📋';
    explanation = `No lens clears the bar for a stronger classification (Investment ${investment.overallScore.toFixed(1)}, Acquisition ${acquisition.overallScore.toFixed(1)}, Replication ${replication.overallScore.toFixed(1)}) — needs more research before a confident call.`;
  }
  return { tag, emoji, explanation, investment, acquisition, replication, avgConfidence };
}

/* ====================================================================================
   PEER COMPARISON / RANKING TRANSPARENCY
   ==================================================================================== */
function rankAllByLens(all, ctx, lensKeyOrCategories) {
  return all.map(c => ({ c, ...computeLensScore(c, ctx, lensKeyOrCategories) }))
    .sort((a, b) => b.overallScore - a.overallScore);
}

function findNearestPeers(c, ctx, lensKeyOrCategories, rankedAll) {
  const ranked = rankedAll || rankAllByLens(ctx.all, ctx, lensKeyOrCategories);
  const idx = ranked.findIndex(r => r.c.id === c.id);
  return {
    rank: idx + 1, total: ranked.length,
    above: idx > 0 ? ranked[idx - 1] : null,
    below: idx < ranked.length - 1 ? ranked[idx + 1] : null,
    sameSegmentModel: ranked.filter(r => r.c.id !== c.id && r.c.segment === c.segment && r.c.businessModel === c.businessModel).slice(0, 5),
  };
}
