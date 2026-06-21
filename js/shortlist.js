let shortlistData = [];

function starsHtml(companyId, rating) {
  return Array.from({ length: 5 }).map((_, i) => `
    <span class="star ${i < (rating || 0) ? 'filled' : ''}" data-star="${i + 1}" data-company="${escapeHtml(companyId)}">★</span>
  `).join('');
}

async function renderShortlist() {
  shortlistData = await loadShortlist();
  document.getElementById('shortlistCount').textContent = shortlistData.length;
  const wrap = document.getElementById('shortlistList');
  if (shortlistData.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No companies shortlisted yet. Add some from the Screener, Rankings, or any company page.</div>';
    return;
  }
  wrap.innerHTML = shortlistData.map(item => {
    const c = item.company;
    if (!c) return '';
    return `
    <div class="shortlist-card">
      <div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${companyLogoHtml(c, 30)}
          <span class="company-name company-hover" ${companyHoverAttrs(c)} style="font-size:15px;font-weight:800;" onclick="location.hash='#company/${encodeURIComponent(c.id)}'">${escapeHtml(c.name)}</span>
          ${c.segment ? tagHtml(c.segment, segColor(c.segment)) : ''}
        </div>
        <div class="subtle" style="margin:6px 0;">${naText(c.country || c.geo)} · Founded ${naText(c.yearFounded)} · Total raised ${c.totalRaised != null ? fmtMoneyPlain(c.totalRaised) : naText(null)}</div>
        <div class="star-rating">${starsHtml(item.companyId, item.rating)}</div>
        <textarea class="rationale-box" data-field="rationale" data-company="${escapeHtml(item.companyId)}" placeholder="Investment rationale..." rows="2" style="width:100%;margin-top:8px;border:1.5px solid rgba(155,133,196,0.18);border-radius:8px;padding:8px;font-family:inherit;font-size:12.5px;">${escapeHtml(item.rationale || '')}</textarea>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--muted);">Status</label>
        <select class="status-select" data-field="status" data-company="${escapeHtml(item.companyId)}" style="width:100%;margin-bottom:10px;">
          ${['Under Review','Strong Candidate','Shortlisted Finalist','Passed','On Hold'].map(s => `<option ${s===item.status?'selected':''}>${s}</option>`).join('')}
        </select>
        <label style="font-size:11px;font-weight:700;color:var(--muted);">Watchlist</label>
        <input type="text" data-field="watchlist" data-company="${escapeHtml(item.companyId)}" value="${escapeHtml(item.watchlist || 'Default')}" style="width:100%;margin-bottom:10px;border:1.5px solid rgba(155,133,196,0.18);border-radius:8px;padding:6px 10px;font-size:12.5px;">
        <label style="font-size:11px;font-weight:700;color:var(--muted);">Internal Notes</label>
        <textarea data-field="notes" data-company="${escapeHtml(item.companyId)}" rows="2" style="width:100%;border:1.5px solid rgba(155,133,196,0.18);border-radius:8px;padding:6px 10px;font-size:12.5px;font-family:inherit;">${escapeHtml(item.notes || '')}</textarea>
        <button class="mini-btn" style="margin-top:8px;" data-playbook="${escapeHtml(item.companyId)}">🎯 View Playbooks</button>
        <button class="mini-btn" style="margin-top:8px;color:var(--red);" data-remove="${escapeHtml(item.companyId)}">Remove</button>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-playbook]').forEach(btn => {
    btn.onclick = () => { location.hash = `#playbooks?company=${encodeURIComponent(btn.dataset.playbook)}&type=profile`; };
  });
  wrap.querySelectorAll('.star').forEach(star => {
    star.onclick = async () => {
      await saveShortlist(star.dataset.company, { rating: parseInt(star.dataset.star) });
      renderShortlist();
    };
  });
  wrap.querySelectorAll('[data-field]').forEach(el => {
    const save = async () => {
      await saveShortlist(el.dataset.company, { [el.dataset.field]: el.value });
    };
    el.addEventListener('change', save);
  });
  wrap.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = async () => { await removeShortlist(btn.dataset.remove); renderShortlist(); };
  });
}

function initShortlistPage() {
  document.getElementById('exportShortlistBtn').onclick = () => window.open('/api/export/shortlist.xlsx', '_blank');
  renderShortlist();
}

async function quickAddToShortlist(companyId) {
  await saveShortlist(companyId, { status: 'Under Review', watchlist: 'Default' });
}
