let ALL = [];
let META = {};
let SCORE_CTX = null;

function uniqueSorted(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
function byId(id) { return ALL.find(c => String(c.id) === String(id)); }

initHoverCard();
initSourceTooltip();
updateEditAccessIndicator();
document.getElementById('slideOverBackdrop').onclick = closeSlideOver;

Promise.all([loadCompanies(), loadMeta(), loadShortlist(), loadPrypcoData(), refreshCustomFieldDefs()]).then(([companies, meta, shortlist]) => {
  ALL = companies;
  META = meta;
  shortlistData = shortlist;
  SCORE_CTX = buildScoreContext(ALL);
  initGlobalSearch();
  updateSidebarFunnelMini();
  initChatbot();
  loadPublicPerformance(ALL);
  routeFromHash();
}).catch(err => {
  document.querySelector('.main-col').innerHTML = `<div class="page"><div class="empty-state">Failed to load data from the server: ${err}. Is app.py running?</div></div>`;
});
