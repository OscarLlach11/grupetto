async function renderLeaderboard(){
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '<div style="padding:24px 40px;color:var(--muted);font-size:12px;">Loading community rankings…</div>';

  // Fetch rated race logs AND rated stage logs in parallel
  const [logsRes, stageLogsRes] = await Promise.all([
    sb.from('race_logs')
      .select('slug,year,rating')
      .not('rating', 'is', null)
      .gt('rating', 0)
      .limit(5000),
    sb.from('stage_logs')
      .select('stage_num, rating, race_slug, year')
      .not('rating', 'is', null)
      .gt('rating', 0)
      .not('race_slug', 'is', null)
      .limit(5000),
  ]);

  if(logsRes.error) console.error('leaderboard race_logs error:', logsRes.error);
  if(stageLogsRes.error) console.error('leaderboard stage_logs error:', stageLogsRes.error);

  const map = {}; // key: "slug|year" or "slug|year|stageN"

  // Aggregate race logs
  (logsRes.data || []).forEach(log => {
    const key = `${log.slug}|${log.year}`;
    if(!map[key]) map[key] = { slug: log.slug, year: log.year, stageNum: null, ratings: [] };
    map[key].ratings.push(parseFloat(log.rating));
  });

  // Aggregate stage logs
  (stageLogsRes.data || []).forEach(sl => {
    if(!sl.race_slug || !sl.year) return;
    const key = `${sl.race_slug}|${sl.year}|stage${sl.stage_num}`;
    if(!map[key]) map[key] = { slug: sl.race_slug, year: sl.year, stageNum: sl.stage_num, ratings: [] };
    map[key].ratings.push(parseFloat(sl.rating));
  });

  // Build entries, filter by minimum rating count
  const entries = Object.values(map)
    .filter(e => e.ratings.length >= TOP_RACES_MIN_RATINGS)
    .map(e => {
      const avg = e.ratings.reduce((a,b)=>a+b,0) / e.ratings.length;
      const race = RACES.find(r => r.id === e.slug);
      return { slug: e.slug, year: e.year, stageNum: e.stageNum, avg, count: e.ratings.length, race };
    })
    .filter(e => e.race)
    .sort((a,b) => b.avg - a.avg || b.count - a.count);

  if(!entries.length){
    lb.innerHTML = `<div class="empty">Not enough ratings yet — each race or stage needs at least ${TOP_RACES_MIN_RATINGS} ratings to appear.</div>`;
    return;
  }

  lb.innerHTML = entries.map(({slug, year, stageNum, avg, count, race}, i) => {
    const isStage = stageNum !== null;
    const label = isStage
      ? `${race.name} <span style="color:var(--muted);font-size:13px;">${year} · Stage ${stageNum}</span>`
      : `${race.name} <span style="color:var(--muted);font-size:13px;">${year}</span>`;
    const sublabel = isStage
      ? `${race.flag} ${race.country} · Stage ${stageNum} · ${count} rating${count!==1?'s':''}`
      : `${race.flag} ${race.country} · ${race.type} · ${count} rating${count!==1?'s':''}`;
    const onclick = isStage
      ? `openStagePage('${slug}',${year},${stageNum})`
      : `openRacePage('${slug}')`;
    const logoCell = race.logoUrl
      ? `<div style="width:44px;height:44px;flex-shrink:0;background:${race.gradient};display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
           <img src="${race.logoUrl}" alt="" style="max-width:80%;max-height:80%;object-fit:contain;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));" onerror="this.parentElement.style.background='${race.gradient}';this.remove()">
           ${isStage ? `<div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);font-size:6px;letter-spacing:1px;color:var(--gold);font-family:'Bebas Neue',sans-serif;background:rgba(0,0,0,.6);padding:0 3px;">S${stageNum}</div>` : ''}
         </div>`
      : `<div class="lbsw" style="background:${race.gradient}">
           ${isStage ? `<div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:7px;letter-spacing:1px;color:var(--gold);font-family:'Bebas Neue',sans-serif;">S${stageNum}</div>` : ''}
         </div>`;
    return `
    <div class="lbi" onclick="${onclick}">
      <div class="lbrank ${i<3?'pod':''}">${i+1}</div>
      ${logoCell}
      <div class="lbinfo">
        <div class="lbname">${label}</div>
        <div class="lbsub">${sublabel}</div>
        <div style="margin-top:3px;">${starsHTML(avg, 10)}</div>
      </div>
      <div><div class="lbsc">${avg.toFixed(2)}</div><div class="lbsc-s">/ 5.0</div></div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  RIDERS
// ════════════════════════════════════════════════════════

// Returns { counts, gcWins, stageWins, raceHistory }
// counts[name]     = total editions seen (GC top10 appearances)
// gcWins[name]     = number of overall race wins seen
// stageWins[name]  = number of stage wins seen
// raceHistory[name]= [{id, year, pos (0-based), stageWins}]
function getRiderData(){
  const counts={}, overallWins={}, gcWins={}, stageWins={}, raceHistory={};
  const stageRaceTypes = new Set(['Grand Tour','Stage Race']);

  Object.entries(userLog).forEach(([id,rl])=>{
    if(id.startsWith('stage::')) return;
    const watchList = Array.isArray(rl) ? rl : (rl.watches||[]);
    const raceObj = RACES.find(r=>r.id===id);
    watchList.forEach(w=>{
      const yr = parseInt(w.year);
      if(!yr) return;
      // Use cached Supabase results (keyed as slug:year in raceResultsCache)
      const res = raceResultsCache[id]?.[yr] || raceResultsCache[id]?.[String(yr)];
      if(!res) return;

      const raceName = raceObj?.name || id;
      const isStageRace = stageRaceTypes.has(raceObj?.type);

      // Count top-10 appearances + overall wins (winner of ANY race)
      (res.top10||[]).forEach((name, pos)=>{
        if(!name || typeof name!=='string') return;
        counts[name]=(counts[name]||0)+1;
        if(pos===0){
          overallWins[name]=(overallWins[name]||0)+1;         // all races
          if(isStageRace) gcWins[name]=(gcWins[name]||0)+1;  // stage races only
        }
        if(!raceHistory[name]) raceHistory[name]=[];
        if(!raceHistory[name].find(x=>x.id===id&&x.year===yr)){
          raceHistory[name].push({id, year:yr, raceName, gcPos:pos, stages:0});
        }
      });


    });
  });

  // Count stage wins — loop stageLog independently so all logged stages are counted
  // regardless of whether a parent race log entry exists
  Object.entries(stageLog).forEach(([raceId, years]) => {
    const raceObj = RACES.find(r => r.id === raceId);
    const raceName = raceObj?.name || raceId;
    Object.entries(years).forEach(([yearStr, stages]) => {
      const yr = parseInt(yearStr);
      const cachedStages = STAGES_CACHE[raceId]?.[yr] || STAGES_CACHE[raceId]?.[yearStr] || [];
      Object.keys(stages).forEach(stageNumStr => {
        const stageNum = parseInt(stageNumStr);
        const stageData = cachedStages.find(s => s.num === stageNum);
        const winnerName = stageData?.winner;
        if(!winnerName || typeof winnerName !== 'string') return;
        stageWins[winnerName]=(stageWins[winnerName]||0)+1;
        if(!raceHistory[winnerName]) raceHistory[winnerName]=[];
        let entry = raceHistory[winnerName].find(x=>x.id===raceId&&x.year===yr);
        if(!entry){
          raceHistory[winnerName].push({id:raceId, year:yr, raceName, gcPos:-1, stages:0});
          entry = raceHistory[winnerName][raceHistory[winnerName].length-1];
        }
        entry.stages=(entry.stages||0)+1;
      });
    });
  });

  return {counts, overallWins, gcWins, stageWins, raceHistory};
}

function showRiderDetail(name){
  const {counts, overallWins, gcWins, stageWins, raceHistory}=getRiderData();
  const history=(raceHistory[name]||[]).sort((a,b)=>b.year-a.year||a.id.localeCompare(b.id));
  const totalRaces=counts[name]||0;
  const totalOverallWins=overallWins[name]||0;
  const totalGCWins=gcWins[name]||0;
  const totalStageWins=stageWins[name]||0;

  document.getElementById('rider-detail-name').textContent=name;
  document.getElementById('rider-detail-stats').innerHTML=`
    <div style="flex:1;background:var(--card);border:1px solid var(--border);padding:12px;text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--accent);">${totalRaces}</div>
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;">RACES</div>
    </div>
    <div style="flex:1;background:var(--card);border:1px solid var(--border);padding:12px;text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--accent);">${totalOverallWins}</div>
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;">OVERALL WINS</div>
    </div>
    <div style="flex:1;background:var(--card);border:1px solid var(--border);padding:12px;text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--gold);">${totalGCWins}</div>
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;">GC WINS</div>
    </div>
    <div style="flex:1;background:var(--card);border:1px solid var(--border);padding:12px;text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:#58a6ff;">${totalStageWins}</div>
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;">STAGE WINS</div>
    </div>`;

  document.getElementById('rider-detail-races').innerHTML = history.length
    ? history.map(e=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${e.raceName} <span style="color:var(--muted);font-weight:400;">${e.year}</span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">
            ${e.gcPos>=0?`<span style="color:${e.gcPos===0?'var(--accent)':'var(--muted)'}">${e.gcPos===0?'🏆 Winner':e.gcPos===1?'🥈 2nd':e.gcPos===2?'🥉 3rd':`${e.gcPos+1}th GC`}</span>`:''}
            ${e.stages>0?`<span style="color:#58a6ff;margin-left:${e.gcPos>=0?6:0}px;">⚡ ${e.stages} stage${e.stages!==1?'s':''}</span>`:''}
          </div>
        </div>
      </div>`).join('')
    : '<div style="color:var(--muted);font-size:13px;">No logged races found for this rider.</div>';

  document.getElementById('rider-detail').style.display='block';
}

// FEATURED_RIDERS loaded from app_config table via loadAppData()


function renderRiderCard(rider){
  const rawName = rider.rider_name || rider.name || '';
  if(!rawName) return '';
  const name = formatRiderName(rawName);
  const imgSrc = rider.image_url && rider.image_url !== 'none' ? rider.image_url : null;
  const col = riderColor(rawName);
  const ini = riderInitials(rawName);
  const encodedName = encodeURIComponent(rawName);
  // Team display: "Retired" only if not in any startlist in the past 3 years
  const CUR_YEAR = new Date().getFullYear();
  const lastYear = rider.last_year || rider.year || 0;
  // Only show "Retired" if not seen in a startlist in the past 2 seasons
  const teamLabel = (!lastYear || CUR_YEAR - lastYear > 2) ? 'Retired' : (rider.team_name || '');
  const thumb = imgSrc
    ? `<img src="${imgSrc}" data-src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;object-position:center top;" loading="lazy" decoding="async"
         onerror="_imgError(this,0)">
       <div style="display:none;width:100%;height:100%;background:${col};align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;">${ini}</div>`
    : `<div style="width:100%;height:100%;background:${col};display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;">${ini}</div>`;
  return `<div style="cursor:pointer;border:1px solid var(--border);overflow:hidden;transition:border-color .15s;" data-rider="${encodedName}" onclick="navToRider(decodeURIComponent(this.dataset.rider))" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
    <div style="width:100%;aspect-ratio:2/3;overflow:hidden;position:relative;">${thumb}</div>
    <div style="padding:6px 8px;background:var(--card-bg);">
      <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;line-height:1.3;">${name}</div>
      <div style="font-size:9px;color:${teamLabel==='Retired'?'var(--muted)':'var(--muted)'};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${teamLabel==='Retired'?'font-style:italic;':''}">${teamLabel}</div>
    </div>
  </div>`;
}

// Cache for featured riders — in-memory for session, localStorage for cross-session
let _featuredRidersCache = null;
// In-flight fetch promise — stored so renderRiders can await it rather than start a second fetch
let _featuredRidersFetchPromise = null;

// ── Rider name normalisation map ──────────────────────────────────────────────
// Maps lowercase title-case name (e.g. "pogacar tadej") → canonical DB format ("POGACAR Tadej")
// Populated lazily from any startlists fetch. Used by formatRiderName() to fix
// race_results.top10 names that are stored in plain "Lastname Firstname" title case.
const _riderNameMap = new Map();
function _registerDbName(dbName){
  if(!dbName) return;
  // Key 1: exact lowercase of the DB name ("pogacar tadej" from "POGACAR Tadej")
  _riderNameMap.set(dbName.toLowerCase(), dbName);
  // Key 2: title-case version of the DB name ("Pogacar Tadej") — matches race_results format
  const titleCase = dbName.split(/\s+/).map(_toTitleCase).join(' ').toLowerCase();
  _riderNameMap.set(titleCase, dbName);
}

// ── Rider page data preload cache ────────────────────────────────────────────
// Maps lowercase rider_name (DB format) → Promise<rows[]>
// Preloaded for featured riders and fav riders so clicking is instant.
const _riderPageCache = new Map();
// Trophy preload cache: dbName.toLowerCase() → Promise<trophies[]>
const _riderTrophyCache = new Map();

async function _preloadRiderData(dbName){
  const key = dbName.toLowerCase();
  if(_riderPageCache.has(key)) return; // already loading or loaded
  const promise = (async () => {
    const { data } = await sb.from('startlists')
      .select('*')
      .ilike('rider_name', dbName)
      .order('year', { ascending: false })
      .limit(200);
    if(data) data.forEach(r => _registerDbName(r.rider_name));
    return data && data.length ? data : null;
  })();
  _riderPageCache.set(key, promise);
}

// Fetch trophies for a rider from the rider_wins table and cache the result
function _preloadRiderTrophies(dbName){
  const key = dbName.toLowerCase();
  if(_riderTrophyCache.has(key)) return;
  const promise = (async () => {
    try {
      const { data, error } = await sb
        .from('rider_wins')
        .select('race_slug,year')
        .ilike('rider_name', dbName)
        .order('year', { ascending: false });
      if(error){ console.warn('trophy fetch error:', error.message); return []; }
      return _buildTrophies(data || []);
    } catch(e){ console.warn('trophy preload exception:', e); return []; }
  })();
  _riderTrophyCache.set(key, promise);
}

// Build sorted trophies array from rider_wins rows
function _buildTrophies(winRows){
  const trophyMap = {};
  winRows.forEach(({ race_slug, year }) => {
    const raceId = cleanSlug(resolveRaceSlug(race_slug) || race_slug);
    const race = RACES.find(x => x.id === raceId);
    if(!trophyMap[raceId]){
      trophyMap[raceId] = {
        raceName: race ? race.name : race_slug.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
        gradient: race ? race.gradient : 'linear-gradient(135deg,#333,#444)',
        slug: raceId, years: []
      };
    }
    const yr = parseInt(year);
    if(!trophyMap[raceId].years.includes(yr)) trophyMap[raceId].years.push(yr);
  });
  Object.values(trophyMap).forEach(t => t.years.sort((a,b) => b-a));
  return Object.values(trophyMap).sort((a,b) => b.years.length - a.years.length || a.raceName.localeCompare(b.raceName));
}

function _preloadRiderNames(names){
  // names: array of DB-format strings (may be null/undefined — filtered out)
  const filtered = (names || []).filter(Boolean).map(n =>
    (n && typeof n === 'object') ? (n.name || '') : (n || '')
  ).filter(Boolean);

  // Kick off startlist preloads immediately (small selects, fast)
  filtered.forEach(name => _preloadRiderData(name));

  // Stagger trophy preloads: wait 5s then do one rider every 1.5s
  // This avoids hammering Supabase while the main UI is loading
  filtered.forEach((name, i) => {
    setTimeout(() => {
      const key = name.toLowerCase();
      const startlistPromise = _riderPageCache.get(key);
      if(startlistPromise && !_riderTrophyCache.has(key)){
        _preloadRiderTrophies(name);
      }
    }, 5000 + i * 1500);
  });
}

const RIDER_SKELETON = `<div style="border:1px solid var(--border);overflow:hidden;pointer-events:none;">
  <div class="skeleton" style="width:100%;aspect-ratio:2/3;"></div>
  <div style="padding:6px 8px;background:var(--card-bg);">
    <div class="skeleton skeleton-text" style="width:80%;"></div>
    <div class="skeleton skeleton-text" style="width:55%;margin-bottom:0;"></div>
  </div>
</div>`;

async function renderRiders(forceRefresh){
  const grid = document.getElementById('riders-grid');
  const label = document.querySelector('#riders-list > div:first-child');
  if(!grid) return;

  // Helper to render riders into the grid
  const show = (riders) => {
    if(label) label.textContent = 'Featured Riders';
    grid.innerHTML = riders.map(r => renderRiderCard(r)).join('');
    _preloadRiderNames(riders.map(r => r.rider_name || r.name));
  };

  // 1. In-memory cache — instant, no network
  if(_featuredRidersCache && !forceRefresh){
    show(_featuredRidersCache);
    return;
  }

  // 2. localStorage cache — serve immediately, revalidate in background
  const lsCached = cacheGet('featured-riders');
  if(lsCached && lsCached.length > 0 && !forceRefresh){
    _featuredRidersCache = lsCached;
    show(lsCached);
    // Always revalidate in background — but only if not already fetching
    if(!_featuredRidersFetchPromise){
      _featuredRidersFetchPromise = _fetchFeaturedRiders().then(fresh => {
        _featuredRidersFetchPromise = null;
        if(!fresh) return;
        _featuredRidersCache = fresh;
        cacheSet('featured-riders', fresh, 120);
        if(document.getElementById('riders-grid')) show(fresh);
      });
    }
    return;
  }

  // 3. No usable cache — await in-flight fetch or start one, show skeletons meanwhile
  grid.innerHTML = Array(FEATURED_RIDERS.length || 10).fill(RIDER_SKELETON).join('');

  const riders = await (_featuredRidersFetchPromise
    ? _featuredRidersFetchPromise.then(() => _featuredRidersCache)
    : _fetchFeaturedRiders());
  if(!riders){ grid.innerHTML = '<div style="color:var(--muted);font-size:12px;grid-column:1/-1;">Could not load riders.</div>'; return; }

  _featuredRidersCache = riders;
  cacheSet('featured-riders', riders, 120);
  show(riders);
}

async function _fetchFeaturedRiders(){
  // FEATURED_RIDERS entries may be objects {name, url, imageUrl} or plain strings
  const extractName = entry => (entry && typeof entry === 'object') ? (entry.name || '') : (entry || '');
  const extractImg  = entry => (entry && typeof entry === 'object') ? (entry.imageUrl || null) : null;
  const featuredNames = FEATURED_RIDERS.map(extractName).filter(Boolean);
  // Build a fallback image map from app_config data
  const configImgMap = {};
  FEATURED_RIDERS.forEach(entry => {
    const name = extractName(entry);
    const img  = extractImg(entry);
    if(name && img) configImgMap[name.toLowerCase()] = img;
  });

  const allRows = [];
  await Promise.all(featuredNames.map(async name => {
    const { data: rows, error: err } = await sb.from('startlists')
      .select('rider_name,team_name,nationality,image_url,year')
      .ilike('rider_name', name)
      .order('year', {ascending: false})
      .limit(50);
    if(err){ console.warn('[riders] ilike error for', name, err.message); return; }
    if(!rows?.length){
      const { data: fuzzy } = await sb.from('startlists')
        .select('rider_name,team_name,nationality,image_url,year')
        .ilike('rider_name', `%${name}%`)
        .order('year', {ascending: false})
        .limit(10);
      if(!fuzzy?.length){
        const parts = name.trim().split(' ');
        const { data: byFirst } = await sb.from('startlists')
          .select('rider_name,team_name,nationality,image_url,year')
          .ilike('rider_name', `%${parts[parts.length-1]}%`)
          .order('year', {ascending: false})
          .limit(5);
        console.warn('[riders] no match for', name, '— closest by first name:', byFirst?.map(r=>r.rider_name));
      }
      (fuzzy||[]).forEach(r => allRows.push(r));
    } else {
      rows.forEach(r => allRows.push(r));
    }
  }));

  if(!allRows.length) return null;

  const seenBest   = new Map();
  const seenYear   = new Map();
  const seenLatest = new Map();
  allRows.forEach(r => {
    const key = r.rider_name.toLowerCase();
    if(!seenYear.has(key) || r.year > seenYear.get(key)){
      seenYear.set(key, r.year);
      seenLatest.set(key, r);
    }
    const prev = seenBest.get(key);
    if(!prev) { seenBest.set(key, r); return; }
    const rHasImg  = r.image_url && r.image_url !== 'none';
    const pvHasImg = prev.image_url && prev.image_url !== 'none';
    if(rHasImg && !pvHasImg) { seenBest.set(key, r); return; }
    if(!rHasImg && pvHasImg) return;
    if(r.year > prev.year) seenBest.set(key, r);
  });

  return featuredNames.map(name => {
    const key    = name.toLowerCase();
    const best   = seenBest.get(key)   || {rider_name: name, image_url: null, year: null};
    const latest = seenLatest.get(key) || best;
    const lastYr = seenYear.get(key)   || best.year;
    // Use startlists image if available, fall back to app_config imageUrl
    const image_url = (best.image_url && best.image_url !== 'none')
      ? best.image_url
      : (configImgMap[key] || null);
    return { ...best, image_url, team_name: latest.team_name, nationality: latest.nationality, last_year: lastYr };
  });
}

async function executeRiderSearch(){
  const q = (document.getElementById('rider-search')?.value || '').trim();
  const grid = document.getElementById('riders-grid');
  const label = document.querySelector('#riders-list > div:first-child');
  if(!grid) return;
  if(!q){ renderRiders(); return; }

  grid.innerHTML = '<div style="color:var(--muted);font-size:12px;grid-column:1/-1;">Searching…</div>';

  // DB stores "LASTNAME Firstname" e.g. "MARTIN Dan", "VAN DEN BROECK Jurgen".
  //
  // The challenge: common short words like "van", "den", "de", "le" appear in
  // hundreds of names — querying %van% alone returns 400+ rows and the target
  // rider may be cut off. But every word in the query IS present in the DB name,
  // so the approach is:
  //
  //   1. ANCHOR queries: use only longer words (≥4 chars) for DB intersection.
  //      These are rare enough that 400 rows captures all matches.
  //   2. DB-FORMAT variant queries: convert the full input to every possible
  //      "LASTNAME Firstname" permutation (all split points, both directions)
  //      and query each as a substring. One will match the actual DB string.
  //   3. MERGE & POST-FILTER: combine all results, then client-side filter
  //      requiring ALL query words to appear in the raw DB name (case-insensitive).
  //      Short words are checked here, not in the DB query.

  const qLower = q.toLowerCase();
  const qWords = q.trim().split(/\s+/).filter(Boolean);
  const qWordsLower = qWords.map(w => w.toLowerCase());

  // 1. Anchor queries — only words with ≥4 chars (skip "van", "den", "de", "le", etc.)
  const anchorWords = qWords.filter(w => w.length >= 4);
  // If all words are short (e.g. "Van De"), use the longest one as anchor
  const queryWords = anchorWords.length > 0 ? anchorWords : [qWords.reduce((a,b) => a.length >= b.length ? a : b)];

  const anchorRows = await Promise.all(
    queryWords.map(word =>
      sb.from('startlists')
        .select('rider_name,team_name,nationality,image_url,year')
        .ilike('rider_name', `%${word}%`)
        .order('year', {ascending:false})
        .limit(400)
        .then(res => res.data || [])
    )
  );

  // Intersect anchor results
  const anchorSets = anchorRows.map(rows => new Set(rows.map(r => r.rider_name.toLowerCase())));
  const fromAnchors = anchorSets.reduce((acc, s) => new Set([...acc].filter(x => s.has(x))));

  // 2. DB-format variant queries — exhaustive split-point permutations
  const dbVariants = _queryToDbVariants(q);
  const variantRows = (await Promise.all(
    dbVariants.map(v =>
      sb.from('startlists')
        .select('rider_name,team_name,nationality,image_url,year')
        .ilike('rider_name', `%${v}%`)
        .order('year', {ascending:false})
        .limit(50)
        .then(res => res.data || [])
    )
  )).flat();

  // Union: everything from anchors intersection + everything from variant queries
  const allRows = [...anchorRows.flat(), ...variantRows];
  const candidateNames = new Set([
    ...fromAnchors,
    ...variantRows.map(r => r.rider_name.toLowerCase())
  ]);

  // 3. Build best-row map (image preferred, then most recent year)
  const bestRow   = new Map();
  const latestRow = new Map();
  allRows.forEach(r => {
    const key = r.rider_name.toLowerCase();
    if(!candidateNames.has(key)) return;
    if(!latestRow.has(key) || r.year > (latestRow.get(key).year || 0)) latestRow.set(key, r);
    const prev = bestRow.get(key);
    if(!prev){ bestRow.set(key, r); return; }
    const rHasImg  = r.image_url && r.image_url !== 'none';
    const pvHasImg = prev.image_url && prev.image_url !== 'none';
    if(rHasImg && !pvHasImg){ bestRow.set(key, r); return; }
    if(!rHasImg && pvHasImg) return;
    if(r.year > prev.year) bestRow.set(key, r);
  });

  // 4. Post-filter: ALL query words must appear in the raw DB name (handles short words)
  const results = Array.from(bestRow.values())
    .filter(r => {
      const dbLower = r.rider_name.toLowerCase();
      return qWordsLower.every(w => dbLower.includes(w));
    })
    .map(r => {
      const parsed = _parseRiderName(r.rider_name);
      const latest = latestRow.get(r.rider_name.toLowerCase()) || r;
      return { ...r, _display: parsed.display, _parsed: parsed,
               team_name: latest.team_name, nationality: latest.nationality,
               last_year: latest.year || r.year };
    });

  // 5. Rank: display starts with query > display contains query > alphabetical
  results.sort((a, b) => {
    const da = a._display.toLowerCase();
    const db_ = b._display.toLowerCase();
    const score = n => n.startsWith(qLower) ? 0 : (n.includes(qLower) ? 1 : 2);
    const diff = score(da) - score(db_);
    return diff !== 0 ? diff : da.localeCompare(db_);
  });

  if(!results.length){
    grid.innerHTML = `<div style="color:var(--muted);font-size:12px;grid-column:1/-1;">No riders found for "${q}".</div>`;
    if(label) label.textContent = 'Riders';
    return;
  }

  if(label) label.textContent = `${results.length} result${results.length!==1?'s':''}`;
  grid.innerHTML = results.map(r => renderRiderCard(r)).join('');
}

// Reset rider search input and restore featured riders when leaving the section
function resetRiderSearch(){
  const input = document.getElementById('rider-search');
  if(input && input.value){
    input.value = '';
    renderRiders(); // restore featured riders (uses cache, instant)
  }
}

// ════════════════════════════════════════════════════════
//  STATS
// ════════════════════════════════════════════════════════
function showStatsRidersPanel(){
  const {counts, overallWins, gcWins, stageWins}=getRiderData();
  const top10=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const panel=document.getElementById('stats-riders-panel');
  const list=document.getElementById('stats-riders-list');
  if(!top10.length){list.innerHTML='<div style="color:var(--muted);font-size:13px;">Log some races first.</div>';panel.style.display='block';return;}
  list.innerHTML=top10.map(([name,cnt],i)=>{
    const ow=overallWins[name]||0, gw=gcWins[name]||0, sw=stageWins[name]||0;
    return `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="showRiderDetail('${name.replace(/'/g,"\\'")}');showDiscover('riders');">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${i<3?'var(--accent)':'var(--muted)'};width:24px;text-align:center;">${i+1}</div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;">${formatRiderName(name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">
          ${ow?`🏆 ${ow} overall win${ow!==1?'s':''}`:''} ${gw?`🟡 ${gw} GC win${gw!==1?'s':''}`:''} ${sw?`⚡ ${sw} stage${sw!==1?'s':''}`:''}</div>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--text);">${cnt}</div>
      <div style="font-size:10px;color:var(--muted);width:48px;">edition${cnt!==1?'s':''}</div>
    </div>`;
  }).join('');
  panel.style.display='block';
}

function renderStats(){
  document.getElementById('stats-riders-panel').style.display='none';
  // Hide any open stat panels
  ['stats-race-panel','stats-gcwins-panel','stats-gcwins2-panel','stats-stagewins-panel'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  const all=allEntries();
  const liveCount=all.filter(([,w])=>w.live).length;
  const total=all.length;
  const rts=all.filter(([,w])=>w.rating).map(([,w])=>w.rating);
  const avgRating=rts.length?(rts.reduce((a,b)=>a+b,0)/rts.length).toFixed(2):null;

  // By type
  const byType={};
  all.forEach(([id,w])=>{
    const r=RACES.find(x=>x.id===id); if(!r) return;
    if(!byType[r.type]) byType[r.type]={cnt:0,rts:[]};
    byType[r.type].cnt++;
    if(w.rating) byType[r.type].rts.push(w.rating);
  });

  // Most watched race
  const raceCnts={};
  all.forEach(([id])=>{raceCnts[id]=(raceCnts[id]||0)+1;});
  const topRace=Object.entries(raceCnts).sort((a,b)=>b[1]-a[1])[0];
  const topRaceObj=topRace?RACES.find(x=>x.id===topRace[0]):null;

  // Rider stats
  const{counts,overallWins,gcWins,stageWins}=getRiderData();
  const topRider=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  const topOverallWinner=Object.entries(overallWins).sort((a,b)=>b[1]-a[1])[0];
  const topGCWinner=Object.entries(gcWins).sort((a,b)=>b[1]-a[1])[0];
  const topStageWinner=Object.entries(stageWins).sort((a,b)=>b[1]-a[1])[0];


  // Stage count + stage ratings

  // Stage count + stage ratings
  const stageEntries = allStageEntries();
  const totalStages = stageEntries.length;
  const stageLiveCount = stageEntries.filter(e=>e.stageLog.live).length;
  const stageRated = stageEntries.filter(e=>e.stageLog.rating).length;
  const stageRatings = stageEntries.filter(e=>e.stageLog.rating).map(e=>e.stageLog.rating);
  const avgStageRating = stageRatings.length ? (stageRatings.reduce((a,b)=>a+b,0)/stageRatings.length).toFixed(1) : null;

  const el=document.getElementById('stats-content');
  el.innerHTML=`<div class="stats-grid">
    <div class="stat-card">
      <div class="stat-card-title">Overview</div>
      <div class="stat-big">${total}</div>
      <div class="stat-big-sub">Races Logged</div>
      <div style="margin-top:16px;" class="stat-row"><span class="stat-row-label">Watched Live</span><span class="stat-row-val">${liveCount} <span style="font-size:12px;color:var(--muted);">(${total?Math.round(liveCount/total*100):0}%)</span></span></div>
      <div class="stat-row"><span class="stat-row-label">Avg Rating</span><span class="stat-row-val">${avgRating||'—'}</span></div>
      <div class="stat-row"><span class="stat-row-label">Distinct Races</span><span class="stat-row-val">${new Set(all.map(([id])=>id)).size}</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">Stages</div>
      <div class="stat-big">${totalStages}</div>
      <div class="stat-big-sub">Stages Logged</div>
      <div style="margin-top:16px;" class="stat-row"><span class="stat-row-label">Watched Live</span><span class="stat-row-val">${stageLiveCount} <span style="font-size:12px;color:var(--muted);">(${totalStages?Math.round(stageLiveCount/totalStages*100):0}%)</span></span></div>
      <div class="stat-row"><span class="stat-row-label">Rated</span><span class="stat-row-val">${stageRated}</span></div>
      <div class="stat-row"><span class="stat-row-label">Avg Stage Rating</span><span class="stat-row-val">${avgStageRating||'—'}</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">By Race Type</div>
      ${Object.entries(byType).map(([type,d])=>`
        <div class="stat-row">
          <span class="stat-row-label">${type}</span>
          <span><span class="stat-row-val">${d.cnt}</span> <span style="font-size:10px;color:var(--muted);">${d.rts.length?`avg ${(d.rts.reduce((a,b)=>a+b,0)/d.rts.length).toFixed(1)}`:''}</span></span>
        </div>`).join('')}
    </div>
    <div class="stat-card">
      <div class="stat-card-title">Most Watched</div>
      ${topRaceObj?`<div class="stat-row stat-clickrow" onclick="showStatsPanel('race')"><span class="stat-row-label">Race ↓</span><span class="stat-row-val" style="font-size:13px;text-align:right;max-width:60%;">${topRaceObj.name}<br><span style="font-size:11px;color:var(--muted);">${topRace[1]} races</span></span></div>`:'<div style="color:var(--muted);font-size:12px;">No data yet</div>'}
      ${topRider?`<div class="stat-row stat-clickrow" onclick="showStatsPanel('rider')"><span class="stat-row-label">Rider ↓</span><span class="stat-row-val" style="font-size:13px;text-align:right;">${formatRiderName(topRider[0])}<br><span style="font-size:11px;color:var(--muted);">${topRider[1]} races seen</span></span></div>`:''}
      ${topOverallWinner?`<div class="stat-row stat-clickrow" onclick="showStatsPanel('gcwins')"><span class="stat-row-label">Overall Wins ↓</span><span class="stat-row-val" style="font-size:13px;text-align:right;">${formatRiderName(topOverallWinner[0])}<br><span style="font-size:11px;color:var(--muted);">${topOverallWinner[1]} overall wins</span></span></div>`:''}
      ${topGCWinner?`<div class="stat-row stat-clickrow" onclick="showStatsPanel('gcwins2')"><span class="stat-row-label">GC Wins ↓</span><span class="stat-row-val" style="font-size:13px;text-align:right;">${formatRiderName(topGCWinner[0])}<br><span style="font-size:11px;color:var(--muted);">${topGCWinner[1]} GC wins</span></span></div>`:''}
      <div class="stat-row${topStageWinner?' stat-clickrow':''}" ${topStageWinner?`onclick="showStatsPanel('stagewins')"`:''}><span class="stat-row-label">Stage Wins ↓</span><span class="stat-row-val" style="font-size:13px;text-align:right;">${topStageWinner?`${formatRiderName(topStageWinner[0])}<br><span style="font-size:11px;color:var(--muted);">${topStageWinner[1]} stage wins</span>`:'<span style="font-size:12px;color:var(--muted);">—</span>'}</span></div>
    </div>
  </div>`;
}

function showStatsPanel(type){
  // Hide all panels first
  ['stats-riders-panel','stats-race-panel','stats-gcwins-panel','stats-gcwins2-panel','stats-stagewins-panel'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  if(type==='rider'){
    showStatsRidersPanel(); return;
  }
  if(type==='race'){
    const raceCnts={};
    allEntries().forEach(([id])=>{raceCnts[id]=(raceCnts[id]||0)+1;});
    const top10=Object.entries(raceCnts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const panel=document.getElementById('stats-race-panel');
    document.getElementById('stats-race-list').innerHTML=top10.map(([id,cnt],i)=>{
      const r=RACES.find(x=>x.id===id)||{name:id,gradient:'var(--border)',flag:'',country:''};
      return `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${i<3?'var(--accent)':'var(--muted)'};width:24px;text-align:center;">${i+1}</div>
        <div style="width:6px;height:36px;background:${r.gradient};flex-shrink:0;"></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${r.name}</div><div style="font-size:11px;color:var(--muted);">${r.flag} ${r.country}</div></div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;">${cnt}</div>
        <div style="font-size:10px;color:var(--muted);width:48px;">race${cnt!==1?'s':''}</div>
      </div>`;
    }).join('');
    panel.style.display='block';
    return;
  }
  if(type==='gcwins'){
    const {overallWins}=getRiderData();
    const top10=Object.entries(overallWins).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const panel=document.getElementById('stats-gcwins-panel');
    document.getElementById('stats-gcwins-list').innerHTML=top10.map(([name,cnt],i)=>
      `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${i<3?'var(--accent)':'var(--muted)'};width:24px;text-align:center;">${i+1}</div>
        <div style="flex:1;font-size:13px;font-weight:600;">${formatRiderName(name)}</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;">${cnt}</div>
        <div style="font-size:10px;color:var(--muted);width:56px;">overall win${cnt!==1?'s':''}</div>
      </div>`
    ).join('');
    panel.style.display='block';
    return;
  }
  if(type==='gcwins2'){
    const {gcWins}=getRiderData();
    const top10=Object.entries(gcWins).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const panel=document.getElementById('stats-gcwins2-panel');
    document.getElementById('stats-gcwins2-list').innerHTML=top10.map(([name,cnt],i)=>
      `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${i<3?'var(--gold)':'var(--muted)'};width:24px;text-align:center;">${i+1}</div>
        <div style="flex:1;font-size:13px;font-weight:600;">${formatRiderName(name)}</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;">${cnt}</div>
        <div style="font-size:10px;color:var(--muted);width:48px;">GC win${cnt!==1?'s':''}</div>
      </div>`
    ).join('');
    panel.style.display='block';
    return;
  }
  if(type==='stagewins'){
    const {stageWins}=getRiderData();
    const top10=Object.entries(stageWins).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const panel=document.getElementById('stats-stagewins-panel');
    document.getElementById('stats-stagewins-list').innerHTML=top10.map(([name,cnt],i)=>
      `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${i<3?'#58a6ff':'var(--muted)'};width:24px;text-align:center;">${i+1}</div>
        <div style="flex:1;font-size:13px;font-weight:600;">${formatRiderName(name)}</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;">${cnt}</div>
        <div style="font-size:10px;color:var(--muted);width:48px;">stage${cnt!==1?'s':''}</div>
      </div>`
    ).join('');
    panel.style.display='block';
    return;
  }
}


// ════════════════════════════════════════════════════════
//  WATCHLIST
// ════════════════════════════════════════════════════════
