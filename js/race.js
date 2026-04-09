async function openRacePage(id, preferYear, pushHistory=true){
  curRacePageId = id;
  const r=RACES.find(x=>x.id===id); if(!r) return;
  const rl=userLog[id]||{};
  const watches=(rl.watches||[]);
  const cnt=getStageCount(id);

  // Push hash immediately with whatever year we have (will be updated once years load)
  if(pushHistory){ _appHistoryDepth++; history.pushState(null, '', preferYear ? `#/race/${id}/${preferYear}` : `#/race/${id}`); }

  // Main column
  let mainHTML=`
    <div class="rsp-banner" style="background:${r.gradient};position:relative;overflow:hidden;">
      ${r.logoUrl ? `<div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);height:75%;max-width:38%;display:flex;align-items:center;justify-content:center;"><img src="${r.logoUrl}" alt="${r.name}" style="max-height:100%;max-width:100%;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6));opacity:.92;" onerror="this.parentElement.remove()"></div>` : ''}
      <div style="position:relative;z-index:1;">
        <div class="rsp-ttl">${r.name}</div>
        <span class="rsp-sub">${r.type} · ${r.flag} ${r.country} · Est. ${r.firstYear}</span>
      </div>
    </div>
    <div style="margin-bottom:16px;">${sgBadgesHTML(id)}</div>
    <p style="font-size:14px;color:#888;line-height:1.8;margin-bottom:24px;">${r.description}</p>
    <div style="font-size:10px;color:var(--muted);letter-spacing:1px;border-left:2px solid var(--border-light);padding:6px 10px;margin-bottom:20px;">Community ratings &amp; reviews require a backend — this is your personal journal. Race results are shown from a curated database; for full results visit <a href="https://www.procyclingstats.com" target="_blank" style="color:var(--gold-dim);">ProCyclingStats.com</a>.</div>
    <div style="display:flex;gap:10px;margin-bottom:28px;">
      <button class="bp" onclick="openLogModal('${id}')">+ Log Edition</button>
      <button class="bwl ${watchlist.includes(id)?'on':''}" id="rsp-wl-btn" onclick="toggleWL('${id}');document.getElementById('rsp-wl-btn').classList.toggle('on',watchlist.includes('${id}'));document.getElementById('rsp-wl-btn').textContent=watchlist.includes('${id}')?'★ In Watchlist':'+ Watchlist';">${watchlist.includes(id)?'★ In Watchlist':'+ Watchlist'}</button>
    </div>`;

  // Your logs section
  if(watches.length){
    mainHTML+=`<div class="rsp-section"><div class="rsp-st">Your Logs</div>`;
    watches.forEach((w,i)=>{
      mainHTML+=`<div class="log-entry-card">
        <div class="lec-head">
          <div>
            <div class="lec-year">${w.year} Edition</div>
            <div class="stars" style="margin:4px 0;">${starsHTML(w.rating||0,13)}</div>
          </div>
          <div class="lec-date">${w.date?fmtDate(w.date):''}<br>${w.live?'<span style="font-size:8px;color:var(--live);border:1px solid var(--live);padding:1px 5px;">LIVE</span>':''}</div>
        </div>
        ${w.review?`<div class="lec-review">"${w.review}"</div>`:''}
        <div class="lec-actions">
          <button class="bs" style="font-size:9px;padding:5px 10px;" onclick="openLogModal('${id}',${i})">Edit</button>
          <button class="bdanger" onclick="confirmDeleteWatch('${id}',${i})">Delete</button>
        </div>
      </div>`;
    });

    mainHTML+=`</div>`;
  }

  // Your Stage Logs section — independent from race logs
  const raceStageEntries = allStageEntries().filter(e => e.raceId === id);
  if(raceStageEntries.length){
    // Group by year
    const byYear = {};
    raceStageEntries.forEach(e => {
      if(!byYear[e.year]) byYear[e.year] = [];
      byYear[e.year].push(e);
    });
    const sortedYears = Object.keys(byYear).map(Number).sort((a,b)=>b-a);

    mainHTML += `<div class="rsp-section" style="margin-top:8px;"><div class="rsp-st">Your Stage Logs</div>`;
    sortedYears.forEach(year => {
      const entries = byYear[year].sort((a,b)=>a.stageNum-b.stageNum);
      mainHTML += `<div style="margin-bottom:16px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:6px;">${year} Edition</div>`;
      entries.forEach(e => {
        const sl = e.stageLog;
        const stLabel = e.stageNum === 0 ? 'Prologue' : `Stage ${sl.stageLabel || e.stageNum}`;
        const r = RACES.find(x=>x.id===id);
        mainHTML += `<div class="log-entry-card" style="cursor:pointer;" onclick="openStagePage('${id}',${year},${e.stageNum})">
          <div class="lec-head">
            <div>
              <div class="lec-year" style="font-size:13px;">${stLabel}</div>
              <div class="stars" style="margin:3px 0;">${starsHTML(sl.rating||0,11)}</div>
              ${sl.date?`<div style="font-size:10px;color:var(--ml);margin-top:2px;">${fmtDate(sl.date)}${sl.live?' · <span style="color:var(--live);">LIVE</span>':''}</div>`:''}
            </div>
            <div class="lec-date" style="font-size:10px;color:var(--muted);">
              ${sl.ts ? fmtDate(new Date(sl.ts).toISOString().slice(0,10)) : ''}
            </div>
          </div>
          ${sl.review?`<div class="lec-review">"${sl.review}"</div>`:''}
          <div class="lec-actions">
            <button class="bs" style="font-size:9px;padding:5px 10px;" onclick="event.stopPropagation();openStagePage('${id}',${year},${e.stageNum})">Edit</button>
            <button class="bdanger" onclick="event.stopPropagation();deleteStageLog('${id}',${year},${e.stageNum})">Delete</button>
          </div>
        </div>`;
      });
      mainHTML += `</div>`;
    });
    mainHTML += `</div>`;
  }

  document.getElementById('rsp-main').innerHTML=mainHTML;

  // Reset scroll position
  const raceScrollBody = document.querySelector('#page-race .race-scroll-body');
  if(raceScrollBody) raceScrollBody.scrollTop = 0;

  showPage('race');

  // Fetch available years AFTER showing the page (auth may now be ready)
  const years = await fetchAvailYears(id);
  const bestYear = preferYear && years.includes(preferYear) ? preferYear : years[0];
  history.replaceState(null, '', bestYear ? `#/race/${id}/${bestYear}` : `#/race/${id}`);

  const isMobileRace = window.innerWidth <= 820;
  const editionsHTML = `<div class="sb-title">Editions</div>
    <div style="margin-bottom:16px;"><label class="flbl">Jump to edition:</label>
    <select class="ysel" id="rsp-yr-sel" onchange="openEditionPage('${id}',parseInt(this.value))" style="width:100%;">
      ${years.map(y=>`<option value="${y}"${y===bestYear?' selected':''}>  ${y}</option>`).join('')}
    </select></div>
    <button class="bp" style="width:100%;margin-bottom:16px;" onclick="openEditionPage('${id}',${bestYear||years[0]})">View ${bestYear||years[0]} Edition →</button>`;

  if(isMobileRace){
    // On mobile: sidebar is hidden, so append editions nav to bottom of main
    const mainEl = document.getElementById('rsp-main');
    if(mainEl) mainEl.insertAdjacentHTML('beforeend', `<div class="rsp-section" style="border-top:1px solid var(--border);margin-top:24px;padding-top:20px;">${editionsHTML}</div>`);
  } else {
    document.getElementById('rsp-sidebar').innerHTML = editionsHTML + `<div id="rsp-results"><div style="font-size:11px;color:var(--muted);line-height:1.8;">Select an edition above to see full results, startlist, and community discussion.</div></div>`;
  }
}

async function renderRSPResults(id, year){
  const el = document.getElementById('rsp-results'); if(!el) return;
  el.innerHTML = Array(5).fill(`<div style="padding:9px 0;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;">
    <div class="skeleton" style="width:18px;height:12px;border-radius:2px;flex-shrink:0;"></div>
    <div class="skeleton" style="flex:1;height:11px;border-radius:2px;"></div>
  </div>`).join('');

  const race = RACES.find(r=>r.id===id);
  const isStageRace = race && (race.type === 'Grand Tour' || race.type === 'Stage Race');

  const [result, stages] = await Promise.all([
    fetchRaceResults(id, year),
    isStageRace ? loadStages(id, year) : Promise.resolve(null),
  ]);

  const top10 = result?.top10;
  let html = '';

  // ── Overall GC / race result ─────────────────────────────────────────────
  if(top10 && Array.isArray(top10) && top10.length){
    // Pre-populate _riderNameMap for any names not yet registered
    const unmapped = top10.map(e => typeof e==='string'?e:(e.rider||e.rider_name||'')).filter(n => n && !_riderNameMap.has(n.trim().toLowerCase()));
    if(unmapped.length){
      const { data: slRows } = await sb.from('startlists').select('rider_name').in('rider_name', unmapped).limit(50);
      if(slRows) slRows.forEach(r => _registerDbName(r.rider_name));
    }
    html += `<div style="font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2px;color:var(--ml);margin-bottom:10px;">${year} Final Result</div><div>`;
    top10.forEach((entry, i) => {
      const name = typeof entry === 'string' ? entry : (entry.rider || entry.rider_name || '');
      const time = typeof entry === 'object' ? (entry.time||entry.gap||'') : '';
      html += `<div class="top10-row">
        <span class="t10-pos">${i+1}</span>
        <span class="t10-name" data-rider="${encodeURIComponent(name)}" style="cursor:pointer;" onclick="navToRider(decodeURIComponent(this.dataset.rider))" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color=''">${formatRiderName(name)}</span>
        ${time?`<span style="font-size:10px;color:var(--muted);margin-left:auto;">${time}</span>`:''}
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div style="font-size:12px;color:var(--muted);font-style:italic;line-height:1.8;">No results for ${year}.<br>
      <a href="https://www.procyclingstats.com/race/${id}/${year}" target="_blank" style="color:var(--gold-dim);">View on PCS ↗</a></div>`;
  }

  // ── Per-stage results (stage races only) ─────────────────────────────────
  if(isStageRace && stages && stages.length){
    const TYPE_ICON = {mountain:'⛰',tt:'⏱',ttt:'⏱⏱',cobbled:'◫',sprint:'━',hilly:'∧'};
    const TYPE_COL  = {mountain:'#c0392b',tt:'#1a3a8c',ttt:'#1a3a8c',cobbled:'#7b5e2a',sprint:'#1a5c2a',hilly:'#555'};

    html += `<div style="margin-top:24px;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2px;color:var(--ml);margin-bottom:10px;">Stage Results</div>`;

    stages.forEach(s => {
      const userStage = getUserStageLog(id, year, s.num);
      const isLogged = !!userStage;
      const icon  = TYPE_ICON[s.type] || '';
      const col   = TYPE_COL[s.type]  || '#555';
      const dist  = s.distance_km ? `${s.distance_km} km` : '';
      const route = s.departure && s.arrival ? `${s.departure} → ${s.arrival}` : '';
      const dateStr = s.date ? fmtDate(s.date) : '';
      const winner = s.winner ? formatRiderName(s.winner) : '';
      const label  = s.num === 0 ? 'P' : (s.label || s.num);

      html += `<div style="border:1px solid var(--border);margin-bottom:5px;cursor:pointer;transition:border-color .15s;"
                    onmouseover="this.style.borderColor='var(--gold-dim)'" onmouseout="this.style.borderColor='var(--border)'"
                    onclick="openStagePage('${id}',${year},${s.num})">
        <div style="display:flex;align-items:stretch;">
          <div style="width:3px;background:${col};flex-shrink:0;"></div>
          <div style="flex:1;padding:8px 10px;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-family:'Bebas Neue',sans-serif;font-size:13px;color:var(--gold);min-width:20px;">${label}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:500;display:flex;align-items:center;gap:6px;">
                  <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${route || dateStr}</span>
                  ${icon?`<span style="font-size:10px;color:${col};">${icon}</span>`:''}
                  ${dist?`<span style="font-size:10px;color:var(--muted);">${dist}</span>`:''}
                </div>
                ${winner?`<div style="font-size:10px;color:var(--muted);margin-top:1px;">★ ${winner}</div>`:''}
              </div>
              ${isLogged?`<span style="font-size:8px;color:var(--gold-dim);border:1px solid var(--gold-dim);padding:1px 4px;flex-shrink:0;">LOGGED</span>`:''}
              <span style="font-size:10px;color:var(--muted);flex-shrink:0;">›</span>
            </div>
          </div>
        </div>
      </div>`;
    });
  } else if(isStageRace){
    html += `<div style="margin-top:20px;font-size:11px;color:var(--muted);font-style:italic;">Stage data loading — check back once the scraper completes.</div>`;
  }

  el.innerHTML = html;
}

// ── fetchStageResults: get per-stage results for a race/year ───────────────
const _stageResultsCache = {};
async function fetchStageResults(slug, year){
  const key = `${slug}-${year}`;
  if(_stageResultsCache[key]) return _stageResultsCache[key];
  const { data, error } = await sb.from('stage_results')
    .select('stage_num,stage_label,stage_date,stage_type,distance_km,departure,arrival,top10,gc_top5,winner,winner_team,avg_speed,profile_score')
    .eq('race_slug', slug).eq('year', year)
    .order('stage_num', {ascending:true});
  if(error || !data?.length) return [];
  const results = data.map(r => ({
    stage_num:   r.stage_num,
    stage_label: r.stage_label || String(r.stage_num),
    stage_date:  r.stage_date,
    stage_type:  r.stage_type,
    distance_km: r.distance_km,
    departure:   r.departure,
    arrival:     r.arrival,
    top10:       Array.isArray(r.top10) ? r.top10 : [],
    gc_top5:     Array.isArray(r.gc_top5) ? r.gc_top5 : [],
    winner:      r.winner,
    winner_team: r.winner_team,
    avg_speed:   r.avg_speed,
    profile_score: r.profile_score,
  }));
  _stageResultsCache[key] = results;
  return results;
}


// Cache for race_results data: { slug: { year: { top10, stage_wins } } }
let _resultsCache = JSON.parse(localStorage.getItem('g3-results-cache') || '{}');

// Fetch with a timeout — if Supabase hangs (e.g. RLS blocking anon), don't wait forever
async function sbFetchWithTimeout(queryPromise, timeoutMs=5000){
  return Promise.race([
    queryPromise,
    new Promise(resolve => setTimeout(() => resolve({data: null, error: {message:'timeout'}}), timeoutMs))
  ]);
}

// Fetch available years for a race — uses race_results table (which years have data)
// Also back-fills RACE_DATES for years not already loaded
async function fetchAvailYears(id){
  // Check cache first
  if(_resultsCache[id]){
    const cached = Object.keys(_resultsCache[id]).map(Number).sort((a,b)=>b-a);
    if(cached.length) {
      await ensureRaceDates(id);
      return cached;
    }
  }

  const { data, error } = await sbFetchWithTimeout(
    sb.from('race_results').select('year,top10').eq('slug', id).order('year', { ascending: false }).limit(200)
  );

  console.log('fetchAvailYears', id, '→', data?.length ?? 'null', 'rows', error?.message||'ok');

  if(data && data.length){
    _resultsCache[id] = _resultsCache[id] || {};
    data.forEach(row => {
      let top10 = row.top10;
      if(typeof top10 === 'string'){ try{ top10 = JSON.parse(top10); }catch(e){ top10 = []; } }
      _resultsCache[id][row.year] = { top10: top10||[] };
    });
    localStorage.setItem('g3-results-cache', JSON.stringify(_resultsCache));
    await ensureRaceDates(id);
    return data.map(r => r.year);
  }

  if(error?.message === 'timeout'){
    console.warn('race_results timed out for', id);
    const el = document.getElementById('rsp-results');
    if(el) el.innerHTML = `<div style="font-size:11px;color:var(--muted);line-height:1.8;">Results require sign-in.<br><a href="https://www.procyclingstats.com/race/${id}" target="_blank" style="color:var(--gold-dim);font-size:11px;">View on PCS ↗</a></div>`;
  }

  // Fallback: generate year list from race data
  const r = RACES.find(x => x.id === id);
  if(!r) return [];
  const ys = [];
  for(let y = CY - 1; y >= (r.tvYear || 1990); y--) ys.push(y);
  return ys;
}

// Set of race IDs whose full date history has been loaded
const _raceDatesFullyLoaded = new Set();

async function ensureRaceDates(id){
  if(_raceDatesFullyLoaded.has(id)) return;
  const { data } = await sbFetchWithTimeout(
    sb.from('race_dates').select('year,race_date').eq('race_id', id).order('year', {ascending: false}),
    5000
  );
  if(data?.length){
    RACE_DATES[id] = RACE_DATES[id] || {};
    data.forEach(row => { RACE_DATES[id][row.year] = row.race_date; });
  }
  _raceDatesFullyLoaded.add(id);
}

// Fetch race results for a specific year (uses cache)
async function fetchRaceResults(slug, year){
  if(_resultsCache[slug]?.[year]) return _resultsCache[slug][year];

  const { data, error } = await sbFetchWithTimeout(
    sb.from('race_results').select('top10').eq('slug', slug).eq('year', year).limit(1)
  );
  if(error?.message === 'timeout' || !data?.length) return null;

  const row = data[0];
  let top10 = row.top10;
  if(typeof top10 === 'string'){ try{ top10 = JSON.parse(top10); }catch(e){ top10 = []; } }
  const result = { top10: top10||[] };
  _resultsCache[slug] = _resultsCache[slug] || {};
  _resultsCache[slug][year] = result;
  localStorage.setItem('g3-results-cache', JSON.stringify(_resultsCache));
  return result;
}

// ════════════════════════════════════════════════════════
//  EDITION PAGE  (specific race × year)
// ════════════════════════════════════════════════════════

// Cache for edition comments so rapid re-renders don't re-fetch
const _editionCommentsCache = {};

async function openEditionPage(slug, year, pushHistory=true){
  year = parseInt(year);
  const r = RACES.find(x=>x.id===slug);
  if(!r){ toast('Race not found'); return; }

  _curEditionSlug = slug;
  _curEditionYear = year;

  if(pushHistory){ _appHistoryDepth++; history.pushState(null,'',`#/edition/${slug}/${year}`); }

  // Switch to edition page immediately with loading state
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-edition').classList.add('active');
  document.querySelectorAll('.nav-a,.mob-nav-btn').forEach(x=>x.classList.remove('active'));

  const breadcrumbEl = document.getElementById('edition-breadcrumb');
  if(breadcrumbEl) breadcrumbEl.textContent = `${r.name} · ${year}`;

  // Reset scroll
  const scrollEl = document.querySelector('#page-edition .race-scroll-body');
  if(scrollEl) scrollEl.scrollTop = 0;

  document.getElementById('edition-main').innerHTML = `<div style="padding:40px;color:var(--muted);">Loading…</div>`;
  document.getElementById('edition-sidebar').innerHTML = '';

  // ── Fetch data in parallel ──────────────────────────────────────────────
  const isStageRace = r.type === 'Grand Tour' || r.type === 'Stage Race';

  const [result, stages, raceDate, communityReviews, editionComments, availYears] = await Promise.all([
    fetchRaceResults(slug, year),
    isStageRace ? loadStages(slug, year) : Promise.resolve(null),
    ensureRaceDateSingle(slug, year),
    fetchEditionCommunityReviews(slug, year),
    fetchEditionComments(slug, year),
    fetchAvailYears(slug),
  ]);

  // Populate year nav
  updateEditionYearNav(availYears, year);

  // ── Main column ──────────────────────────────────────────────────────────
  const rl = userLog[slug] || {};
  const watches = (rl.watches || []).filter(w => w.year === year);
  const watchIdxMap = {}; // year-watch to global watchIdx
  (userLog[slug]?.watches || []).forEach((w,i)=>{ if(w.year===year) watchIdxMap[i]=i; });
  const globalWatchIdxes = (userLog[slug]?.watches||[]).map((w,i)=>w.year===year?i:null).filter(x=>x!==null);

  // Championship gradient handling
  let gradient = r.gradient;
  let flag = r.flag;
  if(r.type === 'championship'){
    const cd = getChampData(r);
    gradient = cd.gradient;
    flag = cd.flag;
  }

  let mainHTML = `
    <div class="rsp-banner" style="background:${gradient};position:relative;overflow:hidden;">
      ${r.logoUrl ? `<div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);height:75%;max-width:38%;display:flex;align-items:center;justify-content:center;"><img src="${r.logoUrl}" alt="${r.name}" style="max-height:100%;max-width:100%;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6));opacity:.92;" onerror="this.parentElement.remove()"></div>` : ''}
      <div style="position:relative;z-index:1;">
        <div class="edition-subhead">${r.type} · ${flag} ${r.country}</div>
        <div class="rsp-ttl">${r.name}</div>
        <span class="rsp-sub" style="font-size:14px;">${year} Edition${raceDate?' · '+fmtDate(raceDate):''}</span>
      </div>
    </div>
    <div style="margin-bottom:16px;">${sgBadgesHTML(slug)}</div>

    <div style="display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap;">
      <button class="bp" onclick="openLogModalForEdition('${slug}',${year})">+ Log This Edition</button>
      <button class="bwl ${watchlist.includes(slug)?'on':''}" id="edition-wl-btn"
        onclick="toggleWL('${slug}');this.classList.toggle('on',watchlist.includes('${slug}'));this.textContent=watchlist.includes('${slug}')?'★ In Watchlist':'+ Watchlist';">
        ${watchlist.includes(slug)?'★ In Watchlist':'+ Watchlist'}
      </button>
      <button class="bs" style="font-size:10px;" onclick="openRacePage('${slug}',${year})">All Editions ↗</button>
    </div>`;

  // Your logs for this edition
  if(watches.length){
    mainHTML += `<div class="rsp-section"><div class="rsp-st">Your Log</div>`;
    watches.forEach((w) => {
      const globalIdx = (userLog[slug]?.watches||[]).findIndex(x=>x===w);
      mainHTML += `<div class="log-entry-card">
        <div class="lec-head">
          <div>
            <div class="lec-year">${year} Edition</div>
            <div class="stars" style="margin:4px 0;">${starsHTML(w.rating||0,13)}</div>
          </div>
          <div class="lec-date">${w.date?fmtDate(w.date):''}<br>${w.live?'<span style="font-size:8px;color:var(--live);border:1px solid var(--live);padding:1px 5px;">LIVE</span>':''}</div>
        </div>
        ${w.review?`<div class="lec-review">"${w.review}"</div>`:''}
        <div class="lec-actions">
          <button class="bs" style="font-size:9px;padding:5px 10px;" onclick="openLogModal('${slug}',${globalIdx})">Edit</button>
          <button class="bdanger" onclick="confirmDeleteWatch('${slug}',${globalIdx})">Delete</button>
        </div>
      </div>`;
    });
    mainHTML += `</div>`;
  }

  // ── Stages section in main column (stage races only) ────────────────────
  if(isStageRace && stages && stages.length){
    const TYPE_COL   = {mountain:'#c0392b',tt:'#1a3a8c',ttt:'#1a3a8c',cobbled:'#7b5e2a',sprint:'#1a5c2a',hilly:'#555'};
    const TYPE_LABEL = {mountain:'Mountain',tt:'Time Trial',ttt:'Team TTT',cobbled:'Cobbled',sprint:'Sprint',hilly:'Hilly'};

    mainHTML += `<div class="rsp-section"><div class="rsp-st">Stages</div>
      <div style="display:grid;grid-template-columns:1fr;gap:4px;">`;

    stages.forEach(s => {
      const userStage = getUserStageLog(slug, year, s.num);
      const isLogged  = !!userStage;
      const col    = TYPE_COL[s.stage_type || s.type]  || '#444';
      const typeLabel = TYPE_LABEL[s.stage_type || s.type] || '';
      const dist   = s.distance_km ? `${s.distance_km} km` : '';
      const route  = s.departure && s.arrival ? `${s.departure} → ${s.arrival}` : '';
      const dateStr= s.date || s.stage_date ? fmtDate(s.date || s.stage_date) : '';
      const winner = s.winner ? formatRiderName(s.winner) : '';
      const label  = s.num === 0 ? 'P' : (s.stage_label || s.label || s.num);
      const stageRating = userStage?.rating || 0;

      const ratingBadge = stageRating
        ? `<div onclick="event.stopPropagation();openStagePage('${slug}',${year},${s.num})"
              style="display:flex;align-items:center;gap:4px;background:rgba(232,200,74,0.08);border:1px solid rgba(232,200,74,0.2);padding:3px 8px;cursor:pointer;flex-shrink:0;">
             <span style="color:var(--gold);font-size:11px;">★</span>
             <span style="color:var(--gold);font-size:12px;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">${stageRating}</span>
           </div>` : '';
      const loggedBadge = isLogged
        ? `<div style="font-size:9px;color:var(--muted);border:1px solid var(--border);padding:3px 7px;letter-spacing:1.5px;font-family:'Bebas Neue',sans-serif;flex-shrink:0;">LOGGED</div>` : '';

      mainHTML += `<div style="display:flex;align-items:stretch;border:1px solid var(--border);cursor:pointer;transition:border-color .15s,background .15s;"
          onmouseover="this.style.borderColor='var(--gold-dim)';this.style.background='rgba(255,255,255,.02)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.background=''"
          onclick="openStagePage('${slug}',${year},${s.num})">
        <div style="width:3px;background:${col};flex-shrink:0;"></div>
        <div style="flex:1;padding:10px 14px;min-width:0;display:flex;align-items:center;gap:12px;">
          <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--gold);min-width:28px;line-height:1;">${label}</span>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${route || dateStr}</span>
              ${typeLabel ? `<span style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${col};border:1px solid ${col};padding:1px 5px;flex-shrink:0;">${typeLabel}</span>` : ''}
              ${dist ? `<span style="font-size:10px;color:var(--muted);flex-shrink:0;">${dist}</span>` : ''}
            </div>
            ${winner ? `<div style="font-size:11px;color:var(--muted);margin-top:3px;">★ ${winner}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${ratingBadge}${loggedBadge}
            <span style="font-size:12px;color:var(--muted);">›</span>
          </div>
        </div>
      </div>`;
    });

    mainHTML += `</div></div>`;
  } else if(isStageRace){
    mainHTML += `<div class="rsp-section"><div class="rsp-st">Stages</div>
      <div style="font-size:12px;color:var(--muted);font-style:italic;">Stage data not yet available for ${year}.</div></div>`;
  }

  // Community reviews for this edition
  mainHTML += renderEditionCommunityReviewsHTML(communityReviews, slug, year);

  // Edition comments
  mainHTML += renderEditionCommentsHTML(slug, year, editionComments);

  document.getElementById('edition-main').innerHTML = mainHTML;

  // Attach edition comment submit handler
  const commentInput = document.getElementById('edition-comment-input');
  if(commentInput){
    commentInput.addEventListener('keydown', e=>{
      if(e.key==='Enter' && (e.ctrlKey||e.metaKey)) submitEditionComment(slug, year);
    });
  }

  // ── Sidebar: results + startlist ────────────────────────────────────────
  renderEditionSidebar(slug, year, r, result, stages, isStageRace);
}

// ── Helper: ensure a single race date is fetched ──────────────────────────
async function ensureRaceDateSingle(slug, year){
  if(RACE_DATES[slug]?.[year]) return RACE_DATES[slug][year];
  const { data } = await sb.from('race_dates').select('race_date').eq('race_id',slug).eq('year',year).limit(1);
  const date = data?.[0]?.race_date || null;
  if(date){ RACE_DATES[slug] = RACE_DATES[slug]||{}; RACE_DATES[slug][year]=date; }
  return date;
}

// ── Helper: fetch most recent community reviews for this edition ──────────
async function fetchEditionCommunityReviews(slug, year){
  const { data } = await sb.from('race_logs')
    .select('user_id, rating, review, date_watched, watched_live, profiles(handle,display_name)')
    .eq('slug', slug)
    .eq('year', year)
    .not('review','is',null)
    .neq('review','')
    .order('created_at',{ascending:false})
    .limit(6);
  return data || [];
}

// ── Render community reviews HTML ─────────────────────────────────────────
function renderEditionCommunityReviewsHTML(reviews, slug, year){
  if(!reviews.length) return '';
  let html = `<div class="rsp-section"><div class="rsp-st">Community Reviews</div>`;
  reviews.forEach((row,i) => {
    const handle = row.profiles?.handle || '';
    const name = row.profiles?.display_name || handle;
    if(!handle) return;
    // Find the n-th review by this user for this race/year
    html += `<div class="community-review-row" onclick="navToReview('${handle}','${slug}',${year},1)">
      <div class="community-review-meta">
        <span class="community-review-handle">@${handle}</span>
        ${row.rating?starsHTML(row.rating,10):''}
        ${row.watched_live?'<span style="font-size:8px;color:#e55;border:1px solid #e55;padding:1px 4px;">LIVE</span>':''}
        ${row.date_watched?`<span style="font-size:10px;color:var(--muted);margin-left:auto;">${fmtDate(row.date_watched)}</span>`:''}
      </div>
      <div class="community-review-text">"${row.review}"</div>
    </div>`;
  });
  html += `</div>`;
  return html;
}

// ── Fetch edition comments ────────────────────────────────────────────────
async function fetchEditionComments(slug, year){
  const key = `${slug}-${year}`;
  if(_editionCommentsCache[key]) return _editionCommentsCache[key];
  const { data } = await sb.from('edition_comments')
    .select('id,user_id,handle,display_name,text,created_at')
    .eq('race_slug',slug).eq('year',year)
    .order('created_at',{ascending:true});
  const result = data || [];
  _editionCommentsCache[key] = result;
  return result;
}

// ── Render edition comments HTML ──────────────────────────────────────────
function renderEditionCommentsHTML(slug, year, comments){
  const myUid = currentUser?.id;
  const myHandle = profile?.handle || '';

  let commentItems = '';
  if(!comments.length){
    commentItems = `<div style="color:var(--muted);font-size:12px;padding:12px 0;">No comments yet. Start the discussion!</div>`;
  } else {
    commentItems = comments.map(c=>{
      const isOwn = c.user_id === myUid;
      return `<div class="edition-comment" id="ec-${c.id}">
        <div class="edition-comment-author">
          <span style="cursor:pointer;" onclick="openUserPage('${c.handle}')">${c.handle||c.display_name||'User'}</span>
          <span style="color:var(--muted);font-weight:400;font-size:10px;">${fmtDate((c.created_at||'').split('T')[0])}</span>
          ${isOwn?`<button class="edition-comment-delete" onclick="deleteEditionComment('${slug}',${year},'${c.id}')">✕</button>`:''}
        </div>
        <div class="edition-comment-text">${c.text}</div>
      </div>`;
    }).join('');
  }

  const inputArea = currentUser
    ? `<div style="margin-top:16px;">
        <textarea class="rv-comment-input" id="edition-comment-input" placeholder="Join the discussion…"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="bs" onclick="submitEditionComment('${slug}',${year})">Post</button>
          <span style="font-size:10px;color:var(--muted);align-self:center;">Ctrl+Enter to post</span>
        </div>
      </div>`
    : `<div style="color:var(--muted);font-size:12px;margin-top:16px;"><button class="bs" style="font-size:10px;" onclick="openAuthModal()">Sign in to comment</button></div>`;

  return `<div class="rsp-section">
    <div class="rsp-st">Edition Discussion <span style="color:var(--muted);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:400;">${comments.length||''}</span></div>
    <div id="edition-comments-list">${commentItems}</div>
    ${inputArea}
  </div>`;
}

// ── Submit edition comment ────────────────────────────────────────────────
async function submitEditionComment(slug, year){
  if(!currentUser){ toast('Sign in to comment'); return; }
  const input = document.getElementById('edition-comment-input');
  const text = input?.value?.trim();
  if(!text){ toast('Write something first'); return; }
  input.value='';
  input.disabled=true;

  const myHandle = profile?.handle || currentUser.email.split('@')[0];
  const myName = profile?.name || myHandle;

  const { data, error } = await sb.from('edition_comments').insert({
    race_slug: slug,
    year: parseInt(year),
    user_id: currentUser.id,
    handle: myHandle,
    display_name: myName,
    text,
  }).select().single();

  input.disabled=false;
  if(error){ toast('Error posting comment'); console.error(error); return; }

  // Update cache and re-render comments list
  const key = `${slug}-${year}`;
  if(_editionCommentsCache[key]) _editionCommentsCache[key].push(data);
  else _editionCommentsCache[key] = [data];

  const listEl = document.getElementById('edition-comments-list');
  if(listEl){
    const myUid = currentUser.id;
    const newItem = document.createElement('div');
    newItem.className = 'edition-comment';
    newItem.id = `ec-${data.id}`;
    newItem.innerHTML = `<div class="edition-comment-author">
      <span>${myHandle}</span>
      <span style="color:var(--muted);font-weight:400;font-size:10px;">${fmtDate(data.created_at?.split('T')[0]||'')}</span>
      <button class="edition-comment-delete" onclick="deleteEditionComment('${slug}',${year},'${data.id}')">✕</button>
    </div>
    <div class="edition-comment-text">${data.text}</div>`;
    // Remove "no comments yet" placeholder if present
    const placeholder = listEl.querySelector('div[style*="No comments"]');
    if(placeholder) placeholder.remove();
    listEl.appendChild(newItem);
    newItem.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}

// ── Delete edition comment ────────────────────────────────────────────────
async function deleteEditionComment(slug, year, commentId){
  if(!currentUser) return;
  const { error } = await sb.from('edition_comments').delete().eq('id',commentId).eq('user_id',currentUser.id);
  if(error){ toast('Error deleting comment'); return; }
  // Remove from cache
  const key = `${slug}-${year}`;
  if(_editionCommentsCache[key]) _editionCommentsCache[key] = _editionCommentsCache[key].filter(c=>c.id!==commentId);
  // Remove from DOM
  const el = document.getElementById(`ec-${commentId}`);
  if(el) el.remove();
}

// ── Open log modal pre-set to a specific year ─────────────────────────────
async function openLogModalForEdition(slug, year){
  await openLogModal(slug);
  // Set year select and trigger date update
  const yrSel = document.getElementById('lm-year');
  if(yrSel){
    yrSel.value = year;
    // Pre-fill date with race date if available
    const raceDate = RACE_DATES[slug]?.[year] || await ensureRaceDateSingle(slug, year);
    if(raceDate) document.getElementById('lm-date').value = raceDate;
    await renderLogFormBody();
  }
}

// ── Render edition sidebar: results + startlist ───────────────────────────
async function renderEditionSidebar(slug, year, r, result, stages, isStageRace){
  const isMobile = window.innerWidth <= 820;
  // On mobile, sidebar is hidden — inject content into main column instead
  const el = isMobile
    ? document.getElementById('edition-main')
    : document.getElementById('edition-sidebar');
  if(!el) return;

  const TYPE_ICON = {mountain:'⛰',tt:'⏱',ttt:'⏱⏱',cobbled:'◫',sprint:'━',hilly:'∧'};
  const TYPE_COL  = {mountain:'#c0392b',tt:'#1a3a8c',ttt:'#1a3a8c',cobbled:'#7b5e2a',sprint:'#1a5c2a',hilly:'#555'};
  const top10 = result?.top10;

  // Pre-populate _riderNameMap for top10 names not yet registered
  if(top10 && top10.length){
    const unmapped = top10.map(e=>typeof e==='string'?e:(e.rider||e.rider_name||'')).filter(n=>n&&!_riderNameMap.has(n.trim().toLowerCase()));
    if(unmapped.length){
      const { data: slRows } = await sb.from('startlists').select('rider_name').in('rider_name', unmapped).limit(50);
      if(slRows) slRows.forEach(r=>_registerDbName(r.rider_name));
    }
  }

  // On mobile, wrap in a section and append; on desktop, replace sidebar
  let html = isMobile
    ? `<div class="rsp-section" style="border-top:1px solid var(--border);margin-top:24px;padding-top:20px;"><div class="sb-title">Results</div>`
    : `<div class="sb-title">Results</div>`;

  if(top10 && top10.length){
    html += `<div style="margin-bottom:20px;">`;
    top10.forEach((entry,i)=>{
      const name = typeof entry==='string'?entry:(entry.rider||entry.rider_name||'');
      const time = typeof entry==='object'?(entry.time||entry.gap||''):'';
      html += `<div class="top10-row">
        <span class="t10-pos">${i+1}</span>
        <span class="t10-name" style="cursor:pointer;" onclick="navToRider('${name}')" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color=''">${formatRiderName(name)}</span>
        ${(i===0?time:(typeof entry==='object'?entry.gap||'':''))?`<span style="font-size:10px;color:var(--muted);margin-left:auto;">${i===0?time:(typeof entry==='object'?entry.gap||'':'')}</span>`:''}
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div style="font-size:12px;color:var(--muted);margin-bottom:20px;font-style:italic;">No results for ${year}.<br>
      <a href="https://www.procyclingstats.com/race/${slug}/${year}" target="_blank" style="color:var(--gold-dim);">View on PCS ↗</a></div>`;
  }

  // Stage list for stage races
  if(isStageRace && stages && stages.length){
    html += `<div class="sb-title" style="margin-top:4px;">Stages</div>`;
    stages.forEach(s=>{
      const icon = TYPE_ICON[s.type]||'';
      const col  = TYPE_COL[s.type]||'#555';
      const label = s.num===0?'P':(s.label||s.num);
      const winner = s.winner ? formatRiderName(s.winner) : '';
      html += `<div style="border-left:2px solid ${col};padding:5px 0 5px 8px;margin-bottom:4px;cursor:pointer;transition:opacity .15s;" onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'" onclick="openStagePage('${slug}',${year},${s.num})">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-family:'Bebas Neue',sans-serif;font-size:12px;color:var(--gold);min-width:16px;">${label}</span>
          <span style="font-size:10px;color:var(--muted);">${icon}</span>
          <span style="font-size:10px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.departure&&s.arrival?`${s.departure}→${s.arrival}`:s.date?fmtDate(s.date):''}</span>
        </div>
        ${winner?`<div style="font-size:9px;color:var(--muted);padding-left:22px;">★ ${winner}</div>`:''}
      </div>`;
    });
  }

  // Startlist toggle
  html += `<div style="margin-top:20px;">
    <div class="sb-title">Startlist</div>
    <button class="bs" id="edition-sl-btn" style="width:100%;margin-bottom:10px;" onclick="toggleEditionStartlist('${slug}',${year})">Show Startlist ▾</button>
    <div id="edition-startlist-container"></div>
  </div>`;

  if(isMobile){
    html += `</div>`; // close rsp-section wrapper
    el.insertAdjacentHTML('beforeend', html);
  } else {
    el.innerHTML = html;
  }
}

// ── Startlist toggle ──────────────────────────────────────────────────────
let _editionStartlistLoaded = {};
async function toggleEditionStartlist(slug, year){
  const container = document.getElementById('edition-startlist-container');
  const btn = document.getElementById('edition-sl-btn');
  if(!container || !btn) return;

  if(container.children.length > 0){
    container.innerHTML='';
    btn.textContent='Show Startlist ▾';
    return;
  }

  btn.textContent='Loading…';
  btn.disabled=true;

  const key=`${slug}-${year}`;
  let rows = _editionStartlistLoaded[key];
  if(!rows){
    const { data } = await sb.from('startlists')
      .select('rider_name,team_name,nationality,image_url')
      .eq('race_slug',slug).eq('year',year)
      .order('team_name').order('rider_name');
    rows = data || [];
    _editionStartlistLoaded[key] = rows;
  }

  btn.textContent='Hide Startlist ▴';
  btn.disabled=false;

  if(!rows.length){
    container.innerHTML=`<div style="font-size:11px;color:var(--muted);">No startlist data for ${year}.</div>`;
    return;
  }

  // Group by team
  const byTeam = {};
  rows.forEach(r=>{ if(!byTeam[r.team_name]) byTeam[r.team_name]=[]; byTeam[r.team_name].push(r); });

  // Search input + grid
  let html = `<input type="text" placeholder="Search startlist…" class="rv-comment-input" style="min-height:unset;padding:8px 12px;margin-bottom:10px;font-size:11px;"
    oninput="filterEditionStartlist(this.value,'${slug}',${year})">
    <div id="edition-sl-grid" class="startlist-grid">`;

  rows.forEach(rider=>{
    const col = riderColor(rider.rider_name);
    const ini = riderInitials(rider.rider_name);
    const hasImg = rider.image_url && rider.image_url!=='none';
    const thumb = hasImg
      ? `<img src="${rider.image_url}" class="startlist-rider-photo" onerror="_imgError(this,0)">`
        + `<div class="startlist-rider-photo-placeholder" style="background:${col};color:#fff;display:none;">${ini}</div>`
      : `<div class="startlist-rider-photo-placeholder" style="background:${col};color:#fff;">${ini}</div>`;
    html += `<div class="startlist-rider-card" data-name="${rider.rider_name.toLowerCase()}" data-team="${(rider.team_name||'').toLowerCase()}" onclick="navToRider('${rider.rider_name}')">
      ${thumb}
      <div style="min-width:0;">
        <div class="startlist-rider-name">${formatRiderName(rider.rider_name)}</div>
        <div class="startlist-rider-team">${rider.team_name||''}</div>
        ${rider.nationality?`<div style="font-size:9px;color:var(--muted);">${rider.nationality}</div>`:''}
      </div>
    </div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

function filterEditionStartlist(q, slug, year){
  const grid = document.getElementById('edition-sl-grid'); if(!grid) return;
  const lq = q.toLowerCase().trim();
  grid.querySelectorAll('.startlist-rider-card').forEach(card=>{
    const match = !lq || card.dataset.name.includes(lq) || card.dataset.team.includes(lq);
    card.style.display = match ? '' : 'none';
  });
}

// ════════════════════════════════════════════════════════
//  STAGE PAGE  (stage edition comments added below stage-main)
// ════════════════════════════════════════════════════════


// Helper: get the logged stage entry for a given race/year/stageNum
function getUserStageLog(raceId, year, stageNum){
  return stageLog[raceId]?.[year]?.[stageNum] || null;
}

// State for stage page log modal
let _spRaceId=null, _spYear=null, _spStage=null, _spRating=0;

