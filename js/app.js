let ALL = [];
let META = {};
let SCORE_CTX = null;

function uniqueSorted(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
function byId(id) { return ALL.find(c => String(c.id) === String(id)); }

initHoverCard();
initSourceTooltip();
updateEditAccessIndicator();
document.getElementById('slideOverBackdrop').onclick = closeSlideOver;

function softLoad(promise, fallback, label) {
  return promise.catch(err => { console.warn(`Non-critical data failed to load (${label}):`, err); return fallback; });
}

Promise.all([loadCompanies(), loadMeta()]).then(([companies, meta]) => {
  ALL = companies;
  META = meta;
  SCORE_CTX = buildScoreContext(ALL);
  initGlobalSearch();
  initChatbot();
  loadPublicPerformance(ALL);
  routeFromHash();

  // Secondary/optional data — a failure here (e.g. Prypco source file missing in a
  // given deployment) must not block the core screening app from loading.
  Promise.all([
    softLoad(loadShortlist(), [], 'shortlist'),
    softLoad(loadPrypcoData(), null, 'prypco'),
    softLoad(refreshCustomFieldDefs(), [], 'custom fields'),
  ]).then(([shortlist, prypco]) => {
    shortlistData = shortlist;
    PRYPCO = prypco;
    updateSidebarFunnelMini();
  });
}).catch(err => {
  document.querySelector('.main-col').innerHTML = `<div class="page"><div class="empty-state">Failed to load data from the server: ${err}. Is app.py running?</div></div>`;
});
