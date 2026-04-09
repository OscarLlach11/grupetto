async function renderRiderPage(inputName){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-rider').classList.add('active');
  document.querySelectorAll('.nav-a').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('active'));

  const el = document.getElementById('rider-page-inner');

  // ── Check preload cache first ─────────────────────────────────────────
  const cacheKey = inputName.toLowerCase();
  const cachedPromise = _riderPageCache.get(cacheKey);
  let rows = null;

  if(cachedPromise){
    let resolved = false;
    const timeoutId = setTimeout(() => {
      if(!resolved) el.innerHTML = `<div style="padding:60px;text-align:center;color:var(--muted);">Loading rider data…</div>`;
    }, 80);
    rows = await cachedPromise;
    resolved = true;
    clearTimeout(timeoutId);
  } else {
    el.innerHTML = `<div style="padding:60px;text-align:center;color:var(--muted);">Loading rider data…</div>`;
    const namesToTry = [inputName];
    const parts = inputName.trim().split(' ').filter(Boolean);
    if(parts.length >= 2){
      const reversed = parts[parts.length-1] + ' ' + parts.slice(0,parts.length-1).join(' ');
      if(reversed !== inputName) namesToTry.push(reversed);
      namesToTry.push(`%${parts[parts.length-1]}%`);
      namesToTry.push(`%${parts[0]}%`);
    }
    console.log('renderRiderPage: searching for', namesToTry);
    for(const name of namesToTry){
      const { data, error } = await sb.from('startlists')
        .select('*').ilike('rider_name', name)
        .order('year', { ascending: false }).limit(200);
      if(error) console.error('startlists error:', error, 'for name:', name);
      if(data && data.length){
        if(name.includes('%') && data.length > 1){
          const parts2 = inputName.trim().split(' ').filter(Boolean);
          const exact = data.filter(r => r.rider_name.toLowerCase() === inputName.toLowerCase() ||
            r.rider_name.toLowerCase() === (parts2[parts2.length-1]+' '+parts2.slice(0,parts2.length-1).join(' ')).toLowerCase());
          rows = exact.length ? exact : [data[0]];
          const matchName = rows[0].rider_name;
          rows = data.filter(r => r.rider_name === matchName);
        } else { rows = data; }
        break;
      }
    }
  }

  const rawName = rows ? rows[0].rider_name : inputName;

  if(!rows || !rows.length){
    el.innerHTML = `<div style="padding:60px;text-align:center;color:var(--muted);">
      No data found for "${formatRiderName(inputName)}".<br>
      <span style="font-size:11px;margin-top:8px;display:block;">This rider may not be in the database yet.</span>
    </div>`;
    return;
  }

  const info = rows[0];
  const displayName = formatRiderName(rawName);
  const imgSrc = info.image_url && info.image_url !== 'none' ? info.image_url : null;
  const col = riderColor(rawName);
  const ini = riderInitials(rawName);

  const photoHtml = imgSrc
    ? `<img class="rider-page-photo" src="${imgSrc}" alt="${displayName}"
         onerror="_imgError(this,0)">
       <div class="rider-page-photo-placeholder" style="display:none;background:${col};">${ini}</div>`
    : `<div class="rider-page-photo-placeholder" style="background:${col};">${ini}</div>`;

  // Group entries by year, then by race slug within year
  const byYear = {};
  rows.forEach(r => {
    const rs = cleanSlug(r.slug);
    if(!byYear[r.year]) byYear[r.year] = {};
    if(!byYear[r.year][rs]) byYear[r.year][rs] = { ...r, slug: rs, stages: [] };
  });

  const sortedYears = Object.keys(byYear).map(Number).sort((a,b)=>b-a);
  const totalRaces = rows.reduce((acc, r) => { acc.add(r.year+'_'+(resolveRaceSlug(r.slug)||r.slug)); return acc; }, new Set()).size;

  // Use raw DB slugs for race_dates query — race_dates.race_id uses the same format as startlists.slug
  const riderNameLC = rawName.toLowerCase();

  // ── Fetch GC wins and stage wins in parallel ─────────────────────────────
  // RACE_DATES is already fully populated by loadAppData — no need to re-fetch
  let gcWinRows = [];
  let stageWinRows = [];
  await Promise.all([
    (async () => {
      try {
        const { data, error } = await sb.from('rider_wins').select('race_slug,year')
          .ilike('rider_name', rawName).order('year', { ascending: false });
        if(error) console.warn('trophy fetch error:', error.message);
        gcWinRows = data || [];
      } catch(e) { console.warn('trophy cabinet error (non-fatal):', e); }
    })(),
    (async () => {
      try {
        const { data, error } = await sb.from('stage_results')
          .select('race_slug,year,stage_num,stage_label,stage_date')
          .ilike('winner', rawName)
          .order('year', { ascending: false });
        if(error) console.warn('stage wins fetch error:', error.message);
        stageWinRows = data || [];
      } catch(e) { console.warn('stage wins error (non-fatal):', e); }
    })(),
  ]);

  // ── Build Race History HTML ───────────────────────────────────────────────
  // Build a set of GC wins for quick lookup: "slug|year"
  const gcWinSet = new Set(gcWinRows.map(w => { const s=cleanSlug(resolveRaceSlug(w.race_slug)||w.race_slug); return `${s}|${w.year}`; }));
  // Build stage win set: "slug|year|stage_num"
  const stageWinSet = new Set(stageWinRows.map(w => `${cleanSlug(w.race_slug)}|${w.year}|${w.stage_num}`));

  // Fetch race_dates for all slugs in this rider's history so date-based sorting works
  const allRiderSlugs = [...new Set(
    sortedYears.flatMap(year => Object.keys(byYear[year]))
  )];
  const resolvedSlugs = [...new Set(
    allRiderSlugs.map(s => resolveRaceSlug(s) || s).concat(allRiderSlugs)
  )];
  const { data: dateRows } = await sb.from('race_dates')
    .select('race_id,year,race_date')
    .in('race_id', resolvedSlugs);
  (dateRows || []).forEach(row => {
    const dk = cleanSlug(row.race_id);
    if (!RACE_DATES[dk]) RACE_DATES[dk] = {};
    RACE_DATES[dk][row.year] = row.race_date;
  });
  
  let racesHTML = '';
  sortedYears.forEach(year => {
    const racesInYear = Object.values(byYear[year]);
    racesInYear.sort((a, b) => {
      // Use resolved ID OR raw slug — RACE_DATES is keyed by whichever was returned by the query
      const raceIdA = resolveRaceSlug(a.slug) || a.slug;
      const raceIdB = resolveRaceSlug(b.slug) || b.slug;
      const dateA = RACE_DATES[raceIdA]?.[year] || RACE_DATES[raceIdA]?.[String(year)]
                 || RACE_DATES[a.slug]?.[year]   || RACE_DATES[a.slug]?.[String(year)] || '';
      const dateB = RACE_DATES[raceIdB]?.[year] || RACE_DATES[raceIdB]?.[String(year)]
                 || RACE_DATES[b.slug]?.[year]   || RACE_DATES[b.slug]?.[String(year)] || '';
      if(dateA && dateB) return dateA.localeCompare(dateB);
      if(dateA) return -1; if(dateB) return 1;
      return (a.slug||'').localeCompare(b.slug||'');
    });

    racesHTML += `<div style="margin-bottom:32px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:var(--gold);border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:12px;">${year}</div>`;
    racesInYear.forEach(entry => {
      // Always have a navigable ID: prefer resolved slug, fall back to raw DB slug
      const raceId = resolveRaceSlug(entry.slug) || entry.slug;
      const race = RACES.find(x => x.id === raceId) || null;
      const raceName = race ? race.name : entry.slug.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      const raceGradient = race ? race.gradient : 'linear-gradient(135deg,#222,#333)';
      const log = userLog[raceId] || null;
      const watch = log ? (log.watches||[]).find(w => w.year === year) : null;
      const myRating = watch?.rating
        ? `<div style="display:flex;align-items:center;gap:4px;background:rgba(232,200,74,0.08);border:1px solid rgba(232,200,74,0.2);padding:3px 8px;">
             <span style="color:var(--gold);font-size:11px;">★</span>
             <span style="color:var(--gold);font-size:12px;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">${watch.rating}</span>
           </div>` : '';
      const watchedBadge = watch
        ? `<div style="font-size:9px;color:var(--muted);border:1px solid var(--border);padding:3px 7px;letter-spacing:1.5px;font-family:'Bebas Neue',sans-serif;">WATCHED</div>` : '';
      // Use data attributes — safe against apostrophes and special chars in slug
      const safeId = raceId.replace(/"/g,'&quot;');
      const isGCWin = gcWinSet.has(`${raceId}|${year}`);
      const wonBadge = isGCWin
        ? `<div style="display:flex;align-items:center;gap:5px;background:rgba(232,200,74,0.12);border:1px solid rgba(232,200,74,0.3);padding:3px 8px;">
             <span style="font-size:10px;">🏆</span>
             <span style="font-size:9px;color:var(--gold);font-family:'Bebas Neue',sans-serif;letter-spacing:1.5px;">WIN</span>
           </div>` : '';

      racesHTML += `<div data-raceid="${safeId}" data-year="${year}"
        onclick="navToRace(this.dataset.raceid, parseInt(this.dataset.year))"
        onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='none'"
        style="padding:13px 0;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;">
        <div style="width:36px;height:36px;flex-shrink:0;background:${raceGradient};"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:2px;color:var(--white);">${raceName}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${entry.team_name || ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">${wonBadge}${myRating}${watchedBadge}</div>
      </div>`;
    });
    racesHTML += `</div>`;
  });

  // ── Build Trophy Cabinet HTML ─────────────────────────────────────────────
  // Category order and labels
  const CAT_ORDER = ['Grand Tour','Monument','Classic','Stage Race','One Day','Pro'];
  const CAT_LABELS = {
    'Grand Tour': 'Grand Tours',
    'Monument': 'Monuments',
    'Classic': 'Classics',
    'Stage Race': 'Stage Races',
    'One Day': 'One-Day Races',
    'Pro': 'Pro Series',
  };
  // WT vs Pro label helpers
  function _raceCategory(raceId){
    const race = RACES.find(x => x.id === raceId);
    return race ? (race.type || 'One Day') : 'One Day';
  }

  // Build GC trophy map: { raceId: { raceName, gradient, slug, tier, category, years:[] } }
  const gcTrophyMap = {};
  gcWinRows.forEach(({ race_slug, year }) => {
    const raceId = cleanSlug(resolveRaceSlug(race_slug) || race_slug);
    const race = RACES.find(x => x.id === raceId);
    if(!gcTrophyMap[raceId]){
      gcTrophyMap[raceId] = {
        raceName: race ? race.name : race_slug.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
        gradient: race ? race.gradient : 'linear-gradient(135deg,#333,#444)',
        slug: raceId, tier: race?.tier || 'Pro',
        category: _raceCategory(raceId),
        years: [], isStage: false
      };
    }
    const yr = parseInt(year);
    if(!gcTrophyMap[raceId].years.includes(yr)) gcTrophyMap[raceId].years.push(yr);
  });
  Object.values(gcTrophyMap).forEach(t => t.years.sort((a,b)=>b-a));

  // Build stage trophy map: { "raceId|stage_num": { raceName, gradient, slug, stageLabel, years:[] } }
  // But group by race, not individual stages — e.g. "Tour de France – Stages"
  // Group stage wins by race slug → array of {year, stageLabel}
  const stagesByRace = {};
  stageWinRows.forEach(row => {
    const raceId = cleanSlug(resolveRaceSlug(row.race_slug) || row.race_slug);
    if(!stagesByRace[raceId]) stagesByRace[raceId] = [];
    stagesByRace[raceId].push({ year: parseInt(row.year), stageLabel: row.stage_label || String(row.stage_num) });
  });

  // Build stage trophy entries per race
  const stageTrophyMap = {};
  Object.entries(stagesByRace).forEach(([raceId, wins]) => {
    const race = RACES.find(x => x.id === raceId);
    stageTrophyMap[raceId] = {
      raceName: (race ? race.name : raceId.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())) + ' – Stages',
      gradient: race ? race.gradient : 'linear-gradient(135deg,#333,#444)',
      slug: raceId, tier: race?.tier || 'Pro',
      category: _raceCategory(raceId),
      wins: wins.sort((a,b) => b.year - a.year || a.stageLabel.localeCompare(b.stageLabel, undefined, {numeric:true})),
      isStage: true
    };
  });

  // Merge all trophies into categories
  const allTrophies = [...Object.values(gcTrophyMap), ...Object.values(stageTrophyMap)];

  // Group by category
  const byCategory = {};
  allTrophies.forEach(t => {
    const cat = t.category;
    if(!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  });

  // Sort within category: GC wins first, then stage wins; within each, by win count desc
  Object.values(byCategory).forEach(arr => {
    arr.sort((a,b) => {
      if(a.isStage !== b.isStage) return a.isStage ? 1 : -1;
      const aCount = a.isStage ? a.wins.length : a.years.length;
      const bCount = b.isStage ? b.wins.length : b.years.length;
      return bCount - aCount || a.raceName.localeCompare(b.raceName);
    });
  });

  const totalGCWins = gcWinRows.length;
  const totalStageWins = stageWinRows.length;

  let trophyTabHTML = '';
  if(allTrophies.length === 0){
    trophyTabHTML = `<div style="padding:48px 0;text-align:center;color:var(--muted);font-size:13px;">No recorded wins in the database.</div>`;
  } else {
    // Summary bar
    trophyTabHTML += `<div style="display:flex;gap:24px;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:2px;color:var(--gold);">${totalGCWins}</div>
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);">GC / Overall Wins</div>
      </div>
      ${totalStageWins > 0 ? `<div style="border-left:1px solid var(--border);padding-left:24px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:2px;color:var(--ml);">${totalStageWins}</div>
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);">Stage Wins</div>
      </div>` : ''}
    </div>`;

    // Sections per category
    CAT_ORDER.forEach(cat => {
      if(!byCategory[cat]?.length) return;
      // Only show category if wins exist
      trophyTabHTML += `<div style="margin-bottom:36px;">
        <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border);">${CAT_LABELS[cat] || cat}</div>
        <div style="display:flex;flex-direction:column;gap:0;">`;

      byCategory[cat].forEach(t => {
        const count = t.isStage ? t.wins.length : t.years.length;
        const isGT = t.category === 'Grand Tour';
        const isMonument = t.category === 'Monument';
        const accentColor = isGT ? 'var(--gold)' : isMonument ? '#c8a87a' : 'var(--ml)';
        const rowId = `trophy-row-${encodeURIComponent(t.raceName).replace(/%/g,'').replace(/'/g,'').replace(/"/g,'')}`;

        const safeSlug = t.slug.replace(/'/g, "\\'");
        if(t.isStage){
          // Stage wins: expandable rows showing each stage win
          trophyTabHTML += `
          <div style="border-bottom:1px solid var(--border);">
            <div onclick="document.getElementById('${rowId}').style.display=document.getElementById('${rowId}').style.display==='none'?'block':'none';this.querySelector('.trophy-chevron').style.transform=this.querySelector('.trophy-chevron').style.transform==='rotate(90deg)'?'rotate(0deg)':'rotate(90deg)'"
              style="display:flex;align-items:center;gap:14px;padding:14px 0;cursor:pointer;transition:background .12s;"
              onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='none'">
              <div style="width:4px;height:36px;flex-shrink:0;background:${t.gradient};opacity:0.6;"></div>
              <div style="flex:1;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:2px;color:var(--white);">${t.raceName}</div>
              </div>
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px;color:${accentColor};">${count}</div>
                <div style="font-size:9px;letter-spacing:1.5px;color:var(--muted);">STAGE${count!==1?'S':''}</div>
                <div class="trophy-chevron" style="font-size:10px;color:var(--muted);transition:transform .2s;margin-left:4px;">▸</div>
              </div>
            </div>
            <div id="${rowId}" style="display:none;">
              <div style="padding:0 0 12px 18px;display:flex;flex-wrap:wrap;gap:8px;">
                ${t.wins.map(w => `
                  <div data-slug="${t.slug.replace(/"/g,'&quot;')}" data-year="${w.year}"
                    onclick="navToRace(this.dataset.slug, parseInt(this.dataset.year))"
                    style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--card-bg);border:1px solid var(--border);cursor:pointer;transition:border-color .15s;"
                    onmouseover="this.style.borderColor='var(--border-light)'" onmouseout="this.style.borderColor='var(--border)'">
                    <span style="font-size:10px;">🏆</span>
                    <span style="font-size:11px;color:var(--ml);font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">${w.year}</span>
                    <span style="font-size:9px;color:var(--muted);">S.${w.stageLabel}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>`;
        } else {
          // GC wins: single row with year chips
          trophyTabHTML += `
          <div style="border-bottom:1px solid var(--border);">
            <div onclick="document.getElementById('${rowId}').style.display=document.getElementById('${rowId}').style.display==='none'?'block':'none';this.querySelector('.trophy-chevron').style.transform=this.querySelector('.trophy-chevron').style.transform==='rotate(90deg)'?'rotate(0deg)':'rotate(90deg)'"
              style="display:flex;align-items:center;gap:14px;padding:14px 0;cursor:pointer;transition:background .12s;"
              onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='none'">
              <div style="width:4px;height:36px;flex-shrink:0;background:${t.gradient};"></div>
              <div style="flex:1;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:2px;color:var(--white);">${t.raceName}</div>
              </div>
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px;color:${accentColor};">${count}</div>
                <div style="font-size:9px;letter-spacing:1.5px;color:var(--muted);">WIN${count!==1?'S':''}</div>
                <div class="trophy-chevron" style="font-size:10px;color:var(--muted);transition:transform .2s;margin-left:4px;">▸</div>
              </div>
            </div>
            <div id="${rowId}" style="display:none;">
              <div style="padding:0 0 12px 18px;display:flex;flex-wrap:wrap;gap:8px;">
                ${t.years.map(y => `
                  <div data-slug="${t.slug.replace(/"/g,'&quot;')}" data-year="${y}"
                    onclick="navToRace(this.dataset.slug, parseInt(this.dataset.year))"
                    style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--card-bg);border:1px solid var(--border);cursor:pointer;transition:border-color .15s;"
                    onmouseover="this.style.borderColor='${accentColor}40'" onmouseout="this.style.borderColor='var(--border)'">
                    <span style="font-size:10px;">🏆</span>
                    <span style="font-size:12px;color:${accentColor};font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">${y}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>`;
        }
      });

      trophyTabHTML += `</div></div>`;
    });
  }

  // ── Render page with tabs ─────────────────────────────────────────────────
  const trophyCount = allTrophies.length;
  el.innerHTML = `
    <div class="rider-page-header">
      ${photoHtml}
      <div>
        <div class="rider-page-name">${displayName}</div>
        <div class="rider-page-meta">${[info.nationality, info.team_name].filter(Boolean).join(' · ')}</div>
        <div class="rider-page-meta" style="margin-top:6px;">${totalRaces} race${totalRaces!==1?'s':''} in database${trophyCount > 0 ? ` · ${totalGCWins} win${totalGCWins!==1?'s':''}${totalStageWins>0?' · '+totalStageWins+' stage win'+(totalStageWins!==1?'s':''):''}` : ''}</div>
      </div>
    </div>

    <!-- Tab bar -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-top:28px;margin-bottom:28px;">
      <button id="rider-tab-races" onclick="_riderTab('races')"
        style="background:none;border:none;border-bottom:2px solid var(--gold);color:var(--gold);padding:10px 20px 10px 0;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2.5px;cursor:pointer;transition:color .15s;">
        RACES
      </button>
      <button id="rider-tab-trophies" onclick="_riderTab('trophies')"
        style="background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);padding:10px 20px;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2.5px;cursor:pointer;transition:color .15s;">
        TROPHY CABINET${trophyCount > 0 ? ` <span style="font-size:10px;opacity:0.7;">(${totalGCWins + totalStageWins})</span>` : ''}
      </button>
    </div>

    <!-- Races tab -->
    <div id="rider-panel-races">
      ${racesHTML || '<div style="color:var(--muted);font-size:12px;">No race entries found.</div>'}
    </div>

    <!-- Trophy Cabinet tab -->
    <div id="rider-panel-trophies" style="display:none;">
      ${trophyTabHTML}
    </div>`;

  // Tab switching
  window._riderTab = function(tab){
    const tabs = ['races','trophies'];
    tabs.forEach(t => {
      const btn = document.getElementById(`rider-tab-${t}`);
      const panel = document.getElementById(`rider-panel-${t}`);
      const isActive = t === tab;
      if(btn){
        btn.style.borderBottomColor = isActive ? 'var(--gold)' : 'transparent';
        btn.style.color = isActive ? 'var(--gold)' : 'var(--muted)';
      }
      if(panel) panel.style.display = isActive ? 'block' : 'none';
    });
  };
}


// ════════════════════════════════════════════════════════
//  MEMBERS PAGE
// ════════════════════════════════════════════════════════
let _membersCache = null; // in-memory cache

