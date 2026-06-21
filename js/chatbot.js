/* Local data-search assistant — no LLM, no API cost. Parses simple intents and returns
   real structured results from ALL / PRYPCO. Always labeled as a search tool, not free-form AI. */

const CHAT_HELP = `I can search the real data on this site. Try things like:
• "top 10 by total raised"
• "top 5 by valuation in Claims Management"
• "how many public companies"
• "companies in Germany"
• "companies with Network Effects moat"
• "UAE native companies" (Prypco data)
• "show me Klear.ai" (look up a company by name)
• "private companies in Embedded Insurance" (Prypco vertical)`;

function containsPhrase(query, phrase) {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z])' + esc + '($|[^a-z])', 'i').test(query);
}

function chatFindSegment(q) {
  return Object.keys(SEGMENT_COLORS).find(s => containsPhrase(q, s.toLowerCase()));
}
function chatFindModel(q) {
  return Object.keys(MODEL_COLORS).find(m => containsPhrase(q, m.toLowerCase()));
}
function chatFindMoat(q) {
  const moats = (META.moats || []);
  return moats.find(m => containsPhrase(q, m.toLowerCase())) ||
    (q.includes('network effect') ? 'Network Effects (Marketplace Liquidity)' :
     q.includes('regulatory') ? 'Regulatory License (MGA/Carrier Authority)' :
     q.includes('switching cost') ? 'Switching Costs / Deep System Integration' :
     q.includes('proprietary data') ? 'Proprietary Data & Analytics' :
     q.includes('brand') ? 'Brand & Distribution Scale' :
     q.includes('commodity') || q.includes('low differentiation') ? 'Low Differentiation (Commodity Software)' : null);
}
function chatFindCountry(q) {
  const countries = [...new Set(ALL.map(c => c.country).filter(Boolean))];
  return countries.find(c => containsPhrase(q, c.toLowerCase()));
}
function chatFindCompanyByName(q) {
  const sorted = [...ALL].sort((a, b) => (b.name || '').length - (a.name || '').length);
  return sorted.find(c => c.name && containsPhrase(q, c.name.toLowerCase()));
}

function chatRespond(rawQuery) {
  const q = rawQuery.toLowerCase().trim();
  if (!q) return { text: CHAT_HELP };
  if (/^(help|what can you do|hi|hello)/.test(q)) return { text: CHAT_HELP };

  // Direct company lookup
  const directCompany = chatFindCompanyByName(q);
  if (directCompany && (q.includes('show') || q.includes('who is') || q.includes('what is') || q.length < 40)) {
    return {
      text: `Here's what I have on ${directCompany.name}:`,
      companies: [directCompany],
      link: { label: 'Open full profile →', hash: '#company/' + encodeURIComponent(directCompany.id) }
    };
  }

  // Prypco-specific
  if (q.includes('uae') || q.includes('prypco')) {
    if (!PRYPCO) return { text: "Prypco data hasn't loaded yet — visit the Prypco Insurtech Map page once, then ask me again." };
    if (q.includes('native')) {
      const native = PRYPCO.companies.filter(c => c.uaeNative);
      return { text: `${native.length} UAE-native companies in the Prypco dataset:`, prypcoCompanies: native,
                link: { label: 'Open Prypco Landscape →', hash: '#prypco' } };
    }
    return { text: `The Prypco dataset has ${PRYPCO.meta.verticalCount} verticals, ${PRYPCO.meta.companyCount} companies, and ${PRYPCO.meta.roadmapCount} ranked initiatives (${PRYPCO.meta.criticalCount} Critical-priority).`,
              link: { label: 'Open Prypco Strategy →', hash: '#prypco' } };
  }

  // Build filter set from the main dataset
  let rows = ALL;
  const filtersApplied = [];

  const seg = chatFindSegment(q);
  if (seg) { rows = rows.filter(c => c.segment === seg); filtersApplied.push(`segment "${seg}"`); }

  const model = chatFindModel(q);
  if (model) { rows = rows.filter(c => c.businessModel === model); filtersApplied.push(`business model "${model}"`); }

  const moat = chatFindMoat(q);
  if (moat) { rows = rows.filter(c => c.moat === moat); filtersApplied.push(`moat "${moat}"`); }

  const country = chatFindCountry(q);
  if (country) { rows = rows.filter(c => c.country === country); filtersApplied.push(`country "${country}"`); }

  if (q.includes('public')) { rows = rows.filter(isPublic); filtersApplied.push('publicly traded'); }
  else if (q.includes('private')) { rows = rows.filter(c => !isPublic(c)); filtersApplied.push('private'); }

  // Count query
  if (/how many|count of|number of/.test(q)) {
    const desc = filtersApplied.length ? ` matching ${filtersApplied.join(', ')}` : '';
    return { text: `${rows.length} companies${desc} out of ${ALL.length} total.`, companies: rows.slice(0, 8),
              link: filtersApplied.length ? { label: 'Open in Screener →', hash: '#screener' } : null };
  }

  // Top-N sort query
  const topMatch = q.match(/top\s+(\d+)/);
  const topN = topMatch ? parseInt(topMatch[1]) : (q.includes('top') ? 10 : null);
  if (topN) {
    let sortKey = 'totalRaised', sortLabel = 'total raised';
    if (q.includes('valuation')) { sortKey = null; sortLabel = 'valuation'; }
    else if (q.includes('score') || q.includes('rank')) { sortLabel = 'opportunity score'; }

    let sorted;
    if (sortLabel === 'opportunity score') {
      const ctx = buildScoreContext(rows);
      sorted = rows.map(c => ({ c, s: computeLensScore(c, ctx, 'investment').overallScore })).sort((a, b) => b.s - a.s).map(x => x.c);
    } else if (sortLabel === 'valuation') {
      sorted = [...rows].filter(c => companyValuation(c) != null).sort((a, b) => companyValuation(b) - companyValuation(a));
    } else {
      sorted = [...rows].filter(c => c.totalRaised != null).sort((a, b) => b.totalRaised - a.totalRaised);
    }
    const top = sorted.slice(0, topN);
    const desc = filtersApplied.length ? ` in ${filtersApplied.join(', ')}` : '';
    return { text: `Top ${top.length} companies by ${sortLabel}${desc}:`, companies: top,
              link: { label: 'Open in Rankings →', hash: '#rankings' } };
  }

  // Plain filter listing (no top-N, no count keyword)
  if (filtersApplied.length) {
    return { text: `${rows.length} companies match ${filtersApplied.join(', ')}:`, companies: rows.slice(0, 10),
              link: { label: 'Open in Screener →', hash: '#screener' } };
  }

  // Fallback: free-text search across name/description
  const textHits = ALL.filter(c => (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  if (textHits.length) {
    return { text: `I found ${textHits.length} companies whose name or description mentions "${rawQuery}":`, companies: textHits.slice(0, 10) };
  }

  return { text: `I couldn't match that to a specific query. ${CHAT_HELP}` };
}

function chatRenderCompanyChip(c) {
  return `<div class="chat-company-chip company-hover" ${companyHoverAttrs(c)} onclick="location.hash='#company/${encodeURIComponent(c.id)}'">
    ${companyLogoHtml(c, 24)}
    <div><div class="ccc-name">${escapeHtml(c.name)}</div><div class="ccc-meta">${naText(c.segment)}${c.totalRaised != null ? ' · ' + fmtMoneyPlain(c.totalRaised) : ''}</div></div>
  </div>`;
}

function chatRenderPrypcoChip(c) {
  return `<div class="chat-company-chip">
    <div class="pb-avatar-mini" style="background:${avatarColor(c.company)}">${escapeHtml((c.company||'?')[0].toUpperCase())}</div>
    <div><div class="ccc-name">${escapeHtml(c.company)}${c.uaeNative ? ' 🇦🇪' : ''}</div><div class="ccc-meta">${escapeHtml(c.vertical)} · ${escapeHtml(c.hqRegion)}</div></div>
  </div>`;
}

function chatAppendMessage(role, html) {
  const log = document.getElementById('chatLog');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-' + role;
  div.innerHTML = html;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function chatHandleSubmit() {
  const input = document.getElementById('chatInput');
  const query = input.value.trim();
  if (!query) return;
  chatAppendMessage('user', escapeHtml(query));
  input.value = '';

  const result = chatRespond(query);
  let html = `<div class="chat-bot-label">🔎 Data Search Assistant</div><p>${escapeHtml(result.text)}</p>`;
  if (result.companies && result.companies.length) {
    html += `<div class="chat-chip-list">${result.companies.map(chatRenderCompanyChip).join('')}</div>`;
  }
  if (result.prypcoCompanies && result.prypcoCompanies.length) {
    html += `<div class="chat-chip-list">${result.prypcoCompanies.slice(0, 10).map(chatRenderPrypcoChip).join('')}</div>`;
  }
  if (result.link) {
    html += `<button class="mini-btn primary" style="margin-top:8px;" onclick="location.hash='${result.link.hash}'; toggleChatbot(false);">${result.link.label}</button>`;
  }
  chatAppendMessage('bot', html);
}

function toggleChatbot(forceState) {
  const panel = document.getElementById('chatPanel');
  const open = forceState !== undefined ? forceState : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  if (open) document.getElementById('chatInput').focus();
}

function initChatbot() {
  document.getElementById('chatFab').onclick = () => toggleChatbot();
  document.getElementById('chatCloseBtn').onclick = () => toggleChatbot(false);
  document.getElementById('chatForm').addEventListener('submit', (e) => { e.preventDefault(); chatHandleSubmit(); });
  document.querySelectorAll('.chat-suggestion').forEach(btn => {
    btn.onclick = () => { document.getElementById('chatInput').value = btn.textContent; chatHandleSubmit(); };
  });
  chatAppendMessage('bot', `<div class="chat-bot-label">🔎 Data Search Assistant</div><p>Hi! I search the real data on this site — no made-up answers. ${CHAT_HELP}</p>`);
}
