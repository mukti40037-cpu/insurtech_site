const REC_COLORS = {
  'Top Investment Opportunity': '#7fa876',
  'Best Acquisition Target': '#9b85c4',
  'Best Business Model to Replicate': '#7fb8c9',
  'Strategic Partnership Candidate': '#d99466',
  'High Potential, Higher Risk': '#d9b468',
  'Requires Further Due Diligence': '#6b6480',
};

let rankingsLens = 'investment';
let customCategories = [];
let rankingResults = [];
let scoreTemplates = [];

function defaultCustomCategories() {
  return LENS_PRESETS.investment.categories.map(c => ({ key: c.key, label: c.label, weight: c.weight }));
}

function renderLensTabs() {
  const tabs = [...Object.entries(LENS_PRESETS).map(([key, lens]) => ({ key, label: lens.label })), { key: 'custom', label: '🛠️ Custom' }];
  document.getElementById('rankingsLensTabs').innerHTML = tabs.map(t => `
    <div class="lens-mini-tab ${t.key === rankingsLens ? 'active' : ''}" data-lenskey="${t.key}">${t.label}</div>
  `).join('');
  document.querySelectorAll('#rankingsLensTabs .lens-mini-tab').forEach(tab => {
    tab.onclick = () => selectLens(tab.dataset.lenskey);
  });
}

function selectLens(key) {
  rankingsLens = key;
  if (key === 'custom' && !customCategories.length) customCategories = defaultCustomCategories();
  renderLensTabs();
  renderWeightsPanel();
  runRankings();
}

function renderWeightsPanel() {
  const isCustom = rankingsLens === 'custom';
  document.getElementById('customBuilderWrap').style.display = isCustom ? '' : 'none';
  document.getElementById('resetWeightsBtn').textContent = isCustom ? 'Reset to Investment Defaults' : 'This lens uses fixed preset weights';
  document.getElementById('resetWeightsBtn').disabled = !isCustom;
  document.getElementById('resetWeightsBtn').style.opacity = isCustom ? '1' : '0.5';

  if (isCustom) {
    document.getElementById('weightsPanelTitle').textContent = 'Custom Score Weights';
    document.getElementById('weightSliders').innerHTML = '';
    renderCustomCatRows();
    renderTemplateDropdown();
  } else {
    const lens = LENS_PRESETS[rankingsLens];
    document.getElementById('weightsPanelTitle').textContent = lens.label + ' Weights';
    document.getElementById('weightSliders').innerHTML = lens.categories.map(cat => `
      <div class="weight-row" style="grid-template-columns:1fr 60px;">
        <label>${cat.label}</label>
        <span class="wval">${cat.weight}%</span>
      </div>
    `).join('');
    document.getElementById('weightTotal').textContent = `Fixed preset — totals 100%. Switch to Custom to adjust.`;
    document.getElementById('weightTotal').classList.remove('bad');
  }
}

function rankingsAllCategoryOptions() {
  return CANONICAL_CATEGORIES.concat(customFieldCategoryDefs());
}

function renderCustomCatRows() {
  const usedKeys = customCategories.map(c => c.key);
  const allOptions = rankingsAllCategoryOptions();
  document.getElementById('customCatRows').innerHTML = customCategories.map((cat, i) => `
    <div class="custom-cat-row" data-idx="${i}">
      <select data-idx="${i}">
        ${allOptions.map(cc => `<option value="${cc.key}" ${cc.key === cat.key ? 'selected' : ''} ${usedKeys.includes(cc.key) && cc.key !== cat.key ? 'disabled' : ''}>${cc.label}</option>`).join('')}
      </select>
      <div class="custom-cat-weight-row">
        <input type="range" min="0" max="100" value="${cat.weight}" data-idx="${i}">
        <span class="wval" id="customwval-${i}">${cat.weight}%</span>
        <span class="remove-x" data-idx="${i}" title="Remove category">×</span>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('#customCatRows select').forEach(sel => {
    sel.onchange = () => {
      const i = parseInt(sel.dataset.idx);
      const def = allOptions.find(cc => cc.key === sel.value);
      customCategories[i] = { ...customCategories[i], key: sel.value, label: def.label };
      renderCustomCatRows();
      updateCustomWeightTotal();
      runRankings();
    };
  });
  document.querySelectorAll('#customCatRows input[type=range]').forEach(slider => {
    slider.oninput = () => {
      const i = parseInt(slider.dataset.idx);
      customCategories[i].weight = parseInt(slider.value);
      document.getElementById(`customwval-${i}`).textContent = slider.value + '%';
      updateCustomWeightTotal();
      runRankings();
    };
  });
  document.querySelectorAll('#customCatRows .remove-x').forEach(x => {
    x.onclick = () => {
      const i = parseInt(x.dataset.idx);
      if (customCategories.length <= 1) { alert('At least one category is required.'); return; }
      customCategories.splice(i, 1);
      renderCustomCatRows();
      updateCustomWeightTotal();
      runRankings();
    };
  });

  const totalOptions = rankingsAllCategoryOptions().length;
  document.getElementById('addCustomCatBtn').disabled = customCategories.length >= totalOptions;
  document.getElementById('addCustomCatBtn').style.opacity = customCategories.length >= totalOptions ? '0.5' : '1';
  updateCustomWeightTotal();
}

function addCustomCategory() {
  const usedKeys = customCategories.map(c => c.key);
  const next = rankingsAllCategoryOptions().find(cc => !usedKeys.includes(cc.key));
  if (!next) return;
  customCategories.push({ key: next.key, label: next.label, weight: 0 });
  renderCustomCatRows();
  runRankings();
}

function updateCustomWeightTotal() {
  const total = customCategories.reduce((s, c) => s + c.weight, 0);
  const el = document.getElementById('weightTotal');
  el.textContent = `Total weight: ${total}% — must sum to 100% (auto-normalized live; click Normalize to fix the sliders)`;
  el.classList.toggle('bad', total !== 100);
  let normBtn = document.getElementById('normalizeWeightsBtn');
  if (total !== 100 && customCategories.some(c => c.weight > 0)) {
    if (!normBtn) {
      el.insertAdjacentHTML('afterend', `<button class="reset-filters-btn" id="normalizeWeightsBtn" style="background:rgba(217,148,102,0.12);color:#d99466;width:100%;margin-top:6px;">Normalize to 100%</button>`);
      document.getElementById('normalizeWeightsBtn').onclick = normalizeCustomWeights;
    }
  } else if (normBtn) {
    normBtn.remove();
  }
}

function normalizeCustomWeights() {
  // Largest-remainder method: floor each share, then hand out the leftover points to the
  // categories with the biggest fractional remainder. Guarantees every weight stays >= 0
  // and the total is exactly 100 (a naive round-then-dump-remainder-on-last can go negative).
  const total = customCategories.reduce((s, c) => s + c.weight, 0) || 1;
  const raw = customCategories.map(c => (c.weight / total) * 100);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) floors[order[k % order.length].i]++;
  customCategories.forEach((c, i) => { c.weight = floors[i]; });
  renderCustomCatRows();
  runRankings();
}

function renderTemplateDropdown() {
  const sel = document.getElementById('templateLoadSelect');
  sel.innerHTML = '<option value="">Load saved template…</option>' +
    scoreTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
}

async function refreshTemplates() {
  scoreTemplates = await loadScoreTemplates();
  renderTemplateDropdown();
}

async function handleSaveTemplate() {
  const name = document.getElementById('templateNameInput').value.trim();
  if (!name) { alert('Enter a template name first.'); return; }
  const total = customCategories.reduce((s, c) => s + c.weight, 0);
  if (total !== 100) { alert(`Weights must sum to 100% before saving (currently ${total}%). Click Normalize to fix this.`); return; }
  await saveScoreTemplate(name, customCategories);
  document.getElementById('templateNameInput').value = '';
  await refreshTemplates();
  alert(`Template "${name}" saved.`);
}

async function handleDeleteTemplate() {
  const sel = document.getElementById('templateLoadSelect');
  if (!sel.value) { alert('Select a saved template to delete first.'); return; }
  await deleteScoreTemplate(sel.value);
  await refreshTemplates();
}

function handleLoadTemplate() {
  const sel = document.getElementById('templateLoadSelect');
  if (!sel.value) return;
  const t = scoreTemplates.find(t => String(t.id) === sel.value);
  if (!t) return;
  customCategories = t.categories.map(c => ({ ...c }));
  renderCustomCatRows();
  runRankings();
}

function resetWeights() {
  customCategories = defaultCustomCategories();
  renderCustomCatRows();
  runRankings();
}

function runRankings() {
  const ctx = buildScoreContext(ALL);
  const lensArg = rankingsLens === 'custom' ? customCategories : rankingsLens;
  rankingResults = ALL.map(c => {
    const lensResult = computeLensScore(c, ctx, lensArg);
    const classification = classifyRecommendation(c, ctx);
    return { c, score: lensResult.overallScore, confidence: lensResult.overallConfidence, breakdown: lensResult.breakdown, classification };
  }).sort((a, b) => b.score - a.score);
  renderLeaderboard();
  renderScoreDistribution();
}

function renderLeaderboard() {
  const top = rankingResults.slice(0, 100);
  document.getElementById('rankingsCount').textContent = rankingResults.length;
  document.getElementById('leaderboardBody').innerHTML = top.map((r, i) => `
    <tr>
      <td><span class="rank-badge ${i < 3 ? 'top3' : ''}">${i + 1}</span></td>
      <td><span class="company-name company-hover" ${companyHoverAttrs(r.c)} onclick="location.hash='#company/${encodeURIComponent(r.c.id)}'" style="display:inline-flex;align-items:center;gap:8px;">${companyLogoHtml(r.c, 22)}${escapeHtml(r.c.name)}</span></td>
      <td>${r.c.segment ? tagHtml(r.c.segment, segColor(r.c.segment)) : naText(null)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${r.score}%"></div></div>
          <strong>${r.score.toFixed(1)}</strong>
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="confidence-bar-bg"><div class="confidence-bar-fill" style="width:${r.confidence}%"></div></div>
          <span>${r.confidence}%</span>
        </div>
      </td>
      <td><span class="rec-badge" style="background:${REC_COLORS[r.classification.tag]}22;color:${REC_COLORS[r.classification.tag]};">${r.classification.emoji} ${escapeHtml(r.classification.tag)}</span></td>
      <td>${r.c.totalRaised != null ? fmtMoneyPlain(r.c.totalRaised) : naText(null)}</td>
      <td><button class="mini-btn" data-shortlist-id="${escapeHtml(r.c.id)}">+ Shortlist</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('#leaderboardBody [data-shortlist-id]').forEach(btn => {
    btn.onclick = async () => {
      await saveShortlist(btn.dataset.shortlistId, { status: 'Under Review', watchlist: 'Default' });
      btn.textContent = '✓ Added';
      btn.disabled = true;
    };
  });
}

function renderScoreDistribution() {
  const buckets = Array.from({ length: 10 }, () => []);
  rankingResults.forEach(r => { const b = Math.min(9, Math.floor(r.score / 10)); buckets[b].push(r); });
  const canvas = document.getElementById('scoreDistChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 40;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const max = Math.max(...buckets.map(b => b.length), 1);
  const padLeft = 40, padRight = 20, padTop = 16, padBottom = 28;
  const w = canvas.width - padLeft - padRight, h = canvas.height - padTop - padBottom;
  const barW = w / 10 * 0.7;
  const regions = [];
  buckets.forEach((items, i) => {
    const count = items.length;
    const barH = (count / max) * h;
    const x = padLeft + (i / 10) * w + (w / 10 - barW) / 2;
    const grad = ctx.createLinearGradient(0, padTop + h - barH, 0, padTop + h);
    grad.addColorStop(0, '#9b85c4'); grad.addColorStop(1, '#d98ca3');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, padTop + h - barH, barW, barH, 4) : ctx.rect(x, padTop + h - barH, barW, barH);
    ctx.fill();
    ctx.fillStyle = '#3d342e'; ctx.font = '700 11px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
    if (count) ctx.fillText(count, x + barW / 2, padTop + h - barH - 6);
    ctx.fillStyle = '#7d6e60'; ctx.font = '600 10px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${i * 10}-${i * 10 + 9}`, x + barW / 2, padTop + h + 16);
    if (count) {
      regions.push({
        x, y: padTop, w: barW, h, onClick: () => {
          openChartPopup(`🏆 Score ${i * 10}-${i * 10 + 9}`, `${count} companies`, items.map(r => r.c));
        }
      });
    }
  });
  attachClickRegions(canvas, regions);
}

async function initRankingsPage() {
  document.getElementById('scoreMethodologyNote').innerHTML = `
    <strong>Methodology:</strong> every category score is computed only from real fields in this dataset
    (funding events, classifications, and evidence found in company descriptions) — nothing is invented.
    Where a company has no real signal for a category, that category defaults to a neutral midpoint and its
    <strong>Confidence</strong> drops instead of its Score. Switch lenses or build a Custom weighting below;
    click any company to see the full explainable breakdown on its profile.
  `;
  rankingsLens = 'investment';
  customCategories = defaultCustomCategories();
  renderLensTabs();
  renderWeightsPanel();
  document.getElementById('resetWeightsBtn').onclick = resetWeights;
  document.getElementById('addCustomCatBtn').onclick = addCustomCategory;
  document.getElementById('saveTemplateBtn').onclick = handleSaveTemplate;
  document.getElementById('deleteTemplateBtn').onclick = handleDeleteTemplate;
  document.getElementById('templateLoadSelect').onchange = handleLoadTemplate;
  await refreshTemplates();
  runRankings();
}
