// ════════════════════════════════════════════════════════
//  RACE DATA — loaded from Supabase at boot
// ════════════════════════════════════════════════════════
let RACES = [];            // populated by loadAppData()
// STAGES_CACHE[slug][year] = [{num, name, date, type, distance_km, departure, arrival, profile_img}]
const STAGES_CACHE = {};
let RACE_DATES = {};       // { race_id: { year: 'YYYY-MM-DD' } }
let FEATURED_RIDERS = [];  // populated by loadAppData()

const SG_LABELS = {cobbled:'Cobbled',gravel:'Gravel',mountain:'Mountain',sprint:'Sprinters',classics:'Classics',ardennes:'Ardennes',monument:'Monument',gc:'Grand Tour','stage-race':'Stage Race','tt':'Time Trial'};
const SG_CLASS  = {cobbled:'sg-cobbled',gravel:'sg-gravel',mountain:'sg-mountain',sprint:'sg-sprint',classics:'sg-classics',ardennes:'sg-ardennes',monument:'sg-classics',gc:'sg-stage','stage-race':'sg-stage','tt':'sg-tt'};

// ── Bootstrap: load all static data from Supabase before rendering ────────
async function loadAppData(){
  try {
    const RACE_COLS = 'slug,race_name,race_type,first_year,last_year,tv_year,tier,country,flag,distance,gradient,swatch,description,subgenres,stage_count,logo_url';

    // ── Stale-while-revalidate: serve cache instantly, refresh in background ──
    const cached = cacheGet('app-data');
    if(cached){
      applyAppData(cached);
      console.log('[cache] app-data served from cache, revalidating in background…');
      // Revalidate silently in background — update cache + live data without blocking
      fetchAppData(RACE_COLS).then(fresh => {
        if(fresh){ cacheSet('app-data', fresh, 60); applyAppData(fresh); }
      });
      return;
    }

    // No cache — fetch and block until ready
    const fresh = await fetchAppData(RACE_COLS);
    if(fresh){ cacheSet('app-data', fresh, 60); applyAppData(fresh); }

  } catch(e) {
    console.error('loadAppData failed:', e);
  }
}

async function fetchAppData(RACE_COLS){
  const [racesRes, datesRes, configRes] = await Promise.all([
    sb.from('races').select(RACE_COLS).order('tier').order('race_type').order('race_name').limit(500),
    sb.from('race_dates').select('race_id,year,race_date').order('year', {ascending: false}).limit(5000),
    sb.from('app_config').select('key,value'),
  ]);
  if(racesRes.error) console.warn('races error:', racesRes.error.message);
  if(datesRes.error) console.warn('race_dates error:', datesRes.error.message);
  if(configRes.error) console.warn('app_config error:', configRes.error.message);
  if(!racesRes.data?.length) return null;
  return { races: racesRes.data, dates: datesRes.data||[], config: configRes.data||[] };
}

function applyAppData({ races, dates, config }){
  if(races?.length){
    // Filter out shell rows that have no race_type AND no gradient
    // (after DB migration these won't exist, but guards against future accidents)
    const seen = new Map();
    races.filter(r => r.race_type || r.gradient).forEach(r => {
      // Championship races: always key by slug (RR and ITT share the same race_name)
      // All other races: key by normalised race_name to deduplicate shell/duplicate rows
      const key = r.race_type === 'championship'
        ? (r.slug || '').toLowerCase().trim()
        : (r.race_name || '').toLowerCase().trim();
      const existing = seen.get(key);
      if (!existing) { seen.set(key, r); return; }
      const existingWins =
        (existing.logo_url && !r.logo_url) ||
        (!!existing.logo_url === !!r.logo_url && existing.slug.length >= r.slug.length);
      if (!existingWins) seen.set(key, r);
    });
    RACES = Array.from(seen.values()).map(r => ({
      id:          cleanSlug(r.slug),
      name:        r.race_name || '',
      tier:        r.tier || 'Pro',
      country:     r.country || '',
      flag:        r.flag || '',
      type:        r.race_type || '',
      firstYear:   r.first_year,
      tvYear:      r.tv_year,
      distance:    r.distance || '',
      gradient:    r.gradient || 'linear-gradient(135deg,#1a1a1a,#333)',
      swatch:      r.swatch || '#333',
      description: r.description || '',
      subgenres:   r.subgenres || [],
      stageCount:  r.stage_count || null,
      logoUrl:     r.logo_url || null,
    }));
  }
  dates.forEach(row => {
    const dk = cleanSlug(row.race_id);
    if(!RACE_DATES[dk]) RACE_DATES[dk] = {};
    RACE_DATES[dk][row.year] = row.race_date;
  });
  config.forEach(row => {
    if(row.key === 'featured_riders') FEATURED_RIDERS = row.value;
  });
}

// ── getRaceFinalDate: reads from RACE_DATES (populated from Supabase) ─────
function getRaceFinalDate(id, year){
  return RACE_DATES[id]?.[year] || RACE_DATES[id]?.[String(year)] || null;
}

// ── getStageCount: reads stage_count from RACES ───────────────────────────
function getStageCount(id){
  return RACES.find(r => r.id === id)?.stageCount || null;
}

// ── buildStages: use real DB data if available, fall back to synthetic ────
function buildStages(id, year){
  // Check DB cache first
  if(STAGES_CACHE[id]?.[year]?.length) return STAGES_CACHE[id][year];
  // Synthetic fallback (used while DB data loads or for races not yet scraped)
  const cnt = getStageCount(id); if(!cnt) return null;
  const finalDate = getRaceFinalDate(id, year); if(!finalDate) return null;
  const isGT = cnt === 21;
  const span = isGT ? 22 : cnt - 1;
  const finalD = new Date(finalDate + 'T12:00:00');
  const startD = new Date(finalD);
  startD.setDate(startD.getDate() - span);
  const stages = [];
  let d = new Date(startD), stageNum = 0, calDay = 0;
  while(stageNum < cnt){
    if(isGT && (calDay === 9 || calDay === 16)){ d.setDate(d.getDate()+1); calDay++; continue; }
    stageNum++;
    stages.push({ num: stageNum, date: d.toISOString().split('T')[0], name: `Stage ${stageNum}${stageNum===cnt?' (Final)':''}`, type:'flat', distance_km:null, departure:'', arrival:'' });
    d.setDate(d.getDate()+1);
    calDay++;
  }
  return stages;
}

// ── loadStages: fetch real stage data from stage_results table ────────────
async function loadStages(id, year){
  if(STAGES_CACHE[id]?.[year]) return STAGES_CACHE[id][year];
  const { data, error } = await sb.from('stage_results')
    .select('stage_num,stage_label,stage_date,stage_type,distance_km,departure,arrival,profile_score,top10,gc_top5,winner,winner_team,avg_speed')
    .eq('race_slug', id).eq('year', year)
    .order('stage_num', {ascending:true});
  if(error || !data?.length) return null;
  const stages = data.map(s => ({
    num:         s.stage_num,
    label:       s.stage_label || String(s.stage_num),
    name:        s.stage_num === 0 ? 'Prologue' : `Stage ${s.stage_label || s.stage_num}`,
    date:        s.stage_date || '',
    type:        s.stage_type || 'hilly',
    distance_km: s.distance_km,
    departure:   s.departure || '',
    arrival:     s.arrival || '',
    profileScore:s.profile_score,
    top10:       s.top10 || [],
    gcTop5:      s.gc_top5 || [],
    winner:      s.winner || '',
    winnerTeam:  s.winner_team || '',
    avgSpeed:    s.avg_speed,
  }));
  if(!STAGES_CACHE[id]) STAGES_CACHE[id] = {};
  STAGES_CACHE[id][year] = stages;
  return stages;
}

// ── getAllRiders: pull from startlists table ──────────────────────────────
async function getAllRiders(){
  const { data } = await sb.from('startlists').select('rider_name').order('rider_name');
  if(!data?.length) return [];
  const seen = new Set();
  return data.map(r => r.rider_name).filter(n => {
    if(seen.has(n)) return false;
    seen.add(n);
    _registerDbName(n); // populate name normalisation map
    return true;
  });
}

// ── cleanSlug: strips apostrophes/special chars from DB slugs ──────────────
function cleanSlug(s){ return s ? s.replace(/'/g,'-').replace(/--+/g,'-') : s; }

// ── resolveRaceSlug: maps DB slug to RACES id ─────────────────────────────
function resolveRaceSlug(dbSlug){
  if(!dbSlug) return null;
  const direct = RACES.find(x => x.id === dbSlug);
  if(direct) return dbSlug;
  // Strip apostrophes so 'giro-d-italia' matches race name "Giro d'Italia"
  const norm = s => s.replace(/-/g,' ').replace(/[\u2018\u2019']/g,'').toLowerCase();
  const clean = norm(dbSlug);
  const fuzzy = RACES.find(r => norm(r.name).includes(clean) || clean.includes(norm(r.name).slice(0,6)));
  return fuzzy ? fuzzy.id : null;
}

// ════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════
// userLog structure:
// { raceId: { watches: [ { year, date, live, rating, review, stages:{1:{rating,review,date,live},...}, ts } ], range: [...] } }
// Migrate from old storage key if exists
(function(){
  try {
    const oldLog = localStorage.getItem('palmarès-log');
    if(oldLog && !localStorage.getItem('g3-log')){
      // Convert old flat format {id: [{type,year,rating,...}]} to new {id: {watches:[],range:[]}}
      const old = JSON.parse(oldLog);
      const newLog = {};
      Object.entries(old).forEach(([id, entries]) => {
        newLog[id] = {watches:[], range:[]};
        (entries||[]).forEach(e => {
          if(e.type === 'range' || e.yearRange) {
            newLog[id].range.push({from:e.yearRange?e.yearRange[0]:e.year, to:e.yearRange?e.yearRange[1]:e.year, rating:e.rating||0, review:e.review||'', ts:e.timestamp||Date.now()});
          } else {
            newLog[id].watches.push({year:e.year||CY, date:e.watchDate||'', live:e.live||false, rating:e.rating||0, review:e.review||'', stages:{}, ts:e.timestamp||Date.now()});
          }
        });
      });
      localStorage.setItem('g3-log', JSON.stringify(newLog));
    }
    const oldWL = localStorage.getItem('palmarès-watch');
    if(oldWL && !localStorage.getItem('g3-wl')) localStorage.setItem('g3-wl', oldWL);
  } catch(ex) { console.warn('Migration error', ex); }
})();

// One-time migration: clear old short-id keyed logs
if(localStorage.getItem('g3-log-migrated') !== '2') {
  localStorage.removeItem('g3-log');
  localStorage.removeItem('g3-wl');
  localStorage.removeItem('g3-results-cache');
  localStorage.setItem('g3-log-migrated', '2');
}
let userLog   = JSON.parse(localStorage.getItem('g3-log')   || '{}');
let watchlist = JSON.parse(localStorage.getItem('g3-wl')    || '[]');
// Cache of race results from Supabase: { [slug]: { [year]: { top10, stageWins } } }
let raceResultsCache = JSON.parse(localStorage.getItem('g3-results-cache') || '{}');

// Migration v3: purge stage:: keys from g3-log into g3-stage-log, and remove
// any race entries that were auto-created solely by stage logging (no rating/review/live set)
if(localStorage.getItem('g3-log-migrated') !== '3') {
  const stageLogMigrated = JSON.parse(localStorage.getItem('g3-stage-log') || '{}');
  Object.keys(userLog).filter(k => k.startsWith('stage::')).forEach(key => {
    // Parse stage::raceId::year::stageNum
    const parts = key.split('::');
    if(parts.length === 4) {
      const [, raceId, year, stageNum] = parts;
      const watch = userLog[key]?.watches?.[0];
      if(watch) {
        if(!stageLogMigrated[raceId]) stageLogMigrated[raceId] = {};
        if(!stageLogMigrated[raceId][year]) stageLogMigrated[raceId][year] = {};
        stageLogMigrated[raceId][year][stageNum] = {
          rating: watch.rating||0, review: watch.review||'',
          date: watch.date||'', live: watch.live||false,
          ts: watch.ts||Date.now(),
          stageLabel: watch._stage?.stageLabel || stageNum
        };
      }
    }
    delete userLog[key];
  });
  // Also remove race watch entries that were created empty by stage logging
  // (rating=0, review='', live=false, and only exist because saveStagePageLog created them)
  Object.keys(userLog).forEach(raceId => {
    const rl = userLog[raceId];
    if(!rl?.watches) return;
    rl.watches = rl.watches.filter(w => w.rating || w.review || w.live || w.rewatches?.length);
    if(!rl.watches.length) delete userLog[raceId];
  });
  localStorage.setItem('g3-stage-log', JSON.stringify(stageLogMigrated));
  localStorage.setItem('g3-log', JSON.stringify(userLog));
  localStorage.setItem('g3-log-migrated', '3');
}

async function loadRaceResultsForLog(){
  const slugsNeeded = Object.keys(userLog).filter(k => !k.startsWith('stage::'));
  if(!slugsNeeded.length) return;

  const slugsToFetch = slugsNeeded.filter(slug => !_resultsCache[slug]);
  if(!slugsToFetch.length) {
    Object.assign(raceResultsCache, _resultsCache);
    return;
  }

  const { data } = await sbFetchWithTimeout(
    sb.from('race_results').select('slug,year,top10').in('slug', slugsToFetch),
    8000
  );
  if(!data) return;
  data.forEach(row => {
    let top10 = row.top10;
    if(typeof top10 === 'string'){ try{ top10 = JSON.parse(top10); }catch(e){ top10 = []; } }
    _resultsCache[row.slug] = _resultsCache[row.slug] || {};
    _resultsCache[row.slug][row.year] = { top10: top10||[] };
    raceResultsCache[row.slug] = raceResultsCache[row.slug] || {};
    raceResultsCache[row.slug][row.year] = { top10: top10||[] };
  });
  localStorage.setItem('g3-results-cache', JSON.stringify(_resultsCache));
}
const TODAY = new Date().toISOString().split('T')[0];
const CY    = new Date().getFullYear();
const RL    = {0:'',0.5:'Just riding',1:'Unwatchable',1.5:'Very poor',2:'Disappointing',2.5:'Decent',3:'Good',3.5:'Very good',4:'Great',4.5:'Superb',5:'All-Time Classic'};

let curId=null, curWatchIdx=null; // which watch entry we're editing (null = new)
let formRating=0, stRatings={}; // stage ratings keyed by stage number
let wholeLive=false;

// ════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Show loading overlay while bootstrapping
  const overlay = document.createElement('div');
  overlay.id = 'app-loading';
  overlay.innerHTML = `<div style="text-align:center;">
    <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:6px;color:var(--gold);margin-bottom:12px;">PALMARÈS</div>
    <div style="display:flex;gap:6px;justify-content:center;">${Array(3).fill(0).map((_,i)=>`<div style="width:6px;height:6px;border-radius:50%;background:var(--gold);opacity:.3;animation:pulse 1.2s ${i*0.2}s ease-in-out infinite;"></div>`).join('')}</div>
  </div>`;
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--black);z-index:9000;display:flex;align-items:center;justify-content:center;transition:opacity .3s;';
  document.body.appendChild(overlay);

  // Load all static data FIRST — RACES must be populated before any rendering
  await loadAppData();
  document.getElementById('stat-races').textContent = RACES.length;

  // Restore discover filters from last session
  restoreDiscoverFilters();
  renderTabs();

  // Signal auth block that app data is ready — initAuth will now fire
  _appDataReady();

  // Start featured riders fetch in background only if cache is cold.
  // If cache is warm, renderRiders() serves it instantly and revalidates itself.
  const _ridersLsCached = cacheGet('featured-riders');
  if(!_ridersLsCached || !_ridersLsCached.length){
    _featuredRidersFetchPromise = _fetchFeaturedRiders().then(riders => {
      _featuredRidersFetchPromise = null;
      if(!riders) return;
      _featuredRidersCache = riders;
      cacheSet('featured-riders', riders, 120);
      _preloadRiderNames(riders.map(r => r.rider_name || r.name));
    });
  }
  if(location.hash && location.hash.length > 2) {
    if(!location.hash.startsWith('#/review/')) window._pendingRoute = location.hash;
  } else {
    showPage('discover');
  }

  // Fade out overlay
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 320);
});

// ════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════
let aPg='discover';

// Safe back navigation — never exits the app.
// Uses history.back() only if we know the previous entry was within Palmares
// (i.e. the history stack has more than 1 entry and we've already pushed at least one state).
// Falls back to Discover otherwise.
let _appHistoryDepth = 0; // incremented each time we pushState
