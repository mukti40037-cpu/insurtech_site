let currentSegmentRows = [];

function renderBoards() {
  const counts = {};
  ALL.forEach(c => { if (c.segment) counts[c.segment] = (counts[c.segment] || 0) + 1; });
  const segments = Object.keys(SEGMENT_COLORS).filter(s => counts[s]);
  document.getElementById('boardGrid').innerHTML = segments.map(seg => {
    const sample = ALL.filter(c => c.segment === seg).slice(0, 2).map(c => c.name).join(', ');
    return `
    <div class="board" style="background:linear-gradient(135deg, ${segColor(seg)}, ${segColor(seg)}cc)" data-segment="${escapeHtml(seg)}">
      <div class="board-chip">${counts[seg]} companies</div>
      <div>
        <div class="board-title">${escapeHtml(seg)}</div>
        <div class="board-sub">${escapeHtml(sample)}${counts[seg] > 2 ? '…' : ''}</div>
      </div>
      <div class="board-count">${counts[seg]}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('.board').forEach(el => el.addEventListener('click', () => openFiltered(el.dataset.segment, null)));
}

function renderMatrix() {
  const segments = META.segments || [];
  const models = META.models || [];
  const counts = {};
  segments.forEach(s => { counts[s] = {}; models.forEach(m => counts[s][m] = 0); });
  ALL.forEach(c => { if (counts[c.segment] && c.businessModel in counts[c.segment]) counts[c.segment][c.businessModel]++; });

  let html = '<thead><tr><th class="corner"></th>';
  models.forEach(m => html += `<th class="col-label">${escapeHtml(m)}</th>`);
  html += '<th class="total-cell">Total</th></tr></thead><tbody>';
  const modelTotals = {}; models.forEach(m => modelTotals[m] = 0);
  let grand = 0;
  segments.forEach(s => {
    html += `<tr><th class="row-label" style="color:${segColor(s)}">${escapeHtml(s)}</th>`;
    let rowTotal = 0;
    models.forEach(m => {
      const v = counts[s][m];
      rowTotal += v; modelTotals[m] += v; grand += v;
      html += v > 0
        ? `<td class="cell-link" data-segment="${escapeHtml(s)}" data-model="${escapeHtml(m)}" style="color:${segColor(s)}">${v}</td>`
        : `<td class="cell-empty">·</td>`;
    });
    html += `<td class="total-cell">${rowTotal}</td></tr>`;
  });
  html += `<tr><th class="row-label total-cell">Total</th>`;
  models.forEach(m => html += `<td class="total-cell">${modelTotals[m]}</td>`);
  html += `<td class="total-cell">${grand}</td></tr></tbody>`;
  document.getElementById('matrixTable').innerHTML = html;

  document.querySelectorAll('#matrixTable .cell-link').forEach(td => {
    td.addEventListener('click', () => openFiltered(td.dataset.segment, td.dataset.model));
  });
}

function openFiltered(seg, model) {
  currentSegmentRows = ALL.filter(c => c.segment === seg && (!model || c.businessModel === model));
  document.getElementById('boardGrid').style.display = 'none';
  document.getElementById('matrixWrap').style.display = 'none';
  document.querySelector('#view-valuechain .view-tabs').style.display = 'none';
  document.getElementById('boardDetail').classList.remove('hidden');
  const title = model ? `${seg} → ${model}` : seg;
  document.getElementById('detailTitle').textContent = title;
  document.getElementById('detailTitle').style.color = segColor(seg);
  document.getElementById('detailCount').textContent = currentSegmentRows.length;
  document.getElementById('detailCount').style.background = segColor(seg);

  const modelSel = document.getElementById('detailModelFilter');
  modelSel.innerHTML = '<option value="">All business models</option>';
  [...new Set(currentSegmentRows.map(c => c.businessModel).filter(Boolean))].sort().forEach(m =>
    modelSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`));

  document.getElementById('detailSearch').value = '';
  renderValueChainDetailTable(currentSegmentRows);
}

function renderValueChainDetailTable(rows) {
  document.getElementById('detailTableBody').innerHTML = rows.map(c => `
    <tr>
      <td><span class="company-name company-hover" ${companyHoverAttrs(c)} onclick="location.hash='#company/${encodeURIComponent(c.id)}'">${escapeHtml(c.name)}</span></td>
      <td>${c.businessModel ? tagHtml(c.businessModel, modelColor(c.businessModel)) : naText(null)}</td>
      <td>${naText(c.geo)}</td>
      <td>${naText(c.yearFounded)}</td>
      <td class="desc">${c.description ? escapeHtml(c.description.slice(0, 160)) + (c.description.length > 160 ? '…' : '') : naText(null)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="empty-state">No companies match.</td></tr>`;
}

function filterValueChainDetail() {
  const q = document.getElementById('detailSearch').value.toLowerCase();
  const model = document.getElementById('detailModelFilter').value;
  let rows = currentSegmentRows;
  if (q) rows = rows.filter(c => (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  if (model) rows = rows.filter(c => c.businessModel === model);
  renderValueChainDetailTable(rows);
}

function initValueChainPage() {
  document.querySelectorAll('#view-valuechain .view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#view-valuechain .view-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isMatrix = tab.dataset.vctab === 'matrix';
      document.getElementById('matrixWrap').style.display = isMatrix ? '' : 'none';
      document.getElementById('boardGrid').style.display = isMatrix ? 'none' : '';
    });
  });
  document.getElementById('backBtn').addEventListener('click', () => {
    document.getElementById('boardDetail').classList.add('hidden');
    document.querySelector('#view-valuechain .view-tabs').style.display = '';
    const matrixActive = document.querySelector('#view-valuechain .view-tab[data-vctab="matrix"]').classList.contains('active');
    document.getElementById('matrixWrap').style.display = matrixActive ? '' : 'none';
    document.getElementById('boardGrid').style.display = matrixActive ? 'none' : '';
  });
  document.getElementById('detailSearch').addEventListener('input', filterValueChainDetail);
  document.getElementById('detailModelFilter').addEventListener('change', filterValueChainDetail);
  renderBoards();
  renderMatrix();
}
