
function _restoreLogModal(){
  // Restore hidden elements
  const hdrDiv = document.getElementById('lm-year').closest('div[style*="border-bottom"]');
  if(hdrDiv) hdrDiv.style.display='';
  document.getElementById('lm-wl-btn').style.display='';
  document.getElementById('add-rewatch-btn').style.display='';
  // Restore save button
  const btn = document.querySelector('#log-mo .bp');
  if(btn) btn.onclick = saveLog;
}

// ════════════════════════════════════════════════════════
//  SEARCH MODAL
// ════════════════════════════════════════════════════════
function openSearchModal(){
  document.getElementById('search-modal-input').value='';
  document.getElementById('search-results').innerHTML='';
  openMO('search-mo');
  setTimeout(()=>document.getElementById('search-modal-input').focus(),100);
}
function renderSearchResults(q){
  const el=document.getElementById('search-results');
  if(!q.trim()){el.innerHTML='';return;}
  const ql=q.toLowerCase();
  const results=RACES.filter(r=>r.name.toLowerCase().includes(ql)||r.country.toLowerCase().includes(ql)||r.type.toLowerCase().includes(ql)).slice(0,10);
  if(!results.length){el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0;">No races found.</div>';return;}
  el.innerHTML=results.map(r=>{
    const cnt=(userLog[r.id]?.watches||[]).length;
    return `<div class="search-result" onclick="closeMO('search-mo');openLogModal('${r.id}')">
      <div class="sr-swatch" style="background:${r.gradient}"></div>
      <div style="flex:1;">
        <div class="sr-name">${r.name}</div>
        <div class="sr-meta">${r.flag} ${r.country} · ${r.type}${cnt?` · <span class="sr-logged">✓ ${cnt} logged</span>`:''}</div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  LOG MODAL
// ════════════════════════════════════════════════════════
async function openLogModal(id, watchIdx=null){
  const r=RACES.find(x=>x.id===id); if(!r) return;
  curId=id; curWatchIdx=watchIdx; formRating=0; stRatings={}; wholeLive=false;

  document.getElementById('log-mbanner').style.background=r.gradient;
  document.getElementById('log-mtitle').textContent=r.name;
  document.getElementById('log-msub').textContent=`${r.type} · ${r.flag} ${r.country}`;
  document.getElementById('log-mdesc').textContent=r.description;
  document.getElementById('log-minfo').innerHTML=`
    <div><div class="mil">Type</div><div class="miv">${r.type}</div></div>
    <div><div class="mil">Distance</div><div class="miv">${r.distance}</div></div>
    <div><div class="mil">First Held</div><div class="miv">${r.firstYear}</div></div>`;
  document.getElementById('log-sgs').innerHTML=sgBadgesHTML(id);

  const years=availYears(id);
  const opts=years.map(y=>`<option value="${y}">${y}</option>`).join('');
  document.getElementById('lm-year').innerHTML=opts;

  // WL button
  document.getElementById('lm-wl-btn').textContent=watchlist.includes(id)?'★ In Watchlist':'+ Watchlist';
  document.getElementById('lm-wl-btn').classList.toggle('on',watchlist.includes(id));
  // Del button
  document.getElementById('lm-del-btn').style.display=hasLog(id)?'inline-block':'none';

  // If editing existing watch
  const rl=userLog[id]||{};
  const isEditing=(watchIdx!==null&&rl.watches&&rl.watches[watchIdx]);
  if(isEditing){
    const w=rl.watches[watchIdx];
    document.getElementById('lm-year').value=w.year;
    document.getElementById('lm-year').disabled=true; // lock year: use "+ Add Another Watch" for a new entry
    document.getElementById('lm-date').value=w.date||TODAY;
    wholeLive=w.live||false;
    formRating=w.rating||0;
    stRatings=Object.fromEntries(Object.entries(w.stages||{}).map(([k,v])=>[parseInt(k),v.rating||0]));
    document.getElementById('lm-live').classList.toggle('on',wholeLive);
  } else {
    document.getElementById('lm-year').disabled=false;
    document.getElementById('lm-date').value=TODAY;
    document.getElementById('lm-live').classList.remove('on');
  }
  // Update save button label and rewatch button visibility
  const saveBtn=document.querySelector('#log-mo .bp[onclick="saveLog()"]');
  if(saveBtn) saveBtn.textContent=isEditing?'Save Changes':'Save Log';
  const rewatchBtn=document.getElementById('add-rewatch-btn');
  if(rewatchBtn) rewatchBtn.style.display=isEditing?'none':'inline-block';

  await renderLogFormBody();
  openMO('log-mo');
}

async function onYearChange(){
  stRatings={};
  if(wholeLive){
    const y=parseInt(document.getElementById('lm-year').value);
    await ensureRaceDates(curId);
    const fd=getRaceFinalDate(curId,y);
    if(fd) document.getElementById('lm-date').value=fd;
  }
  await renderLogFormBody();
}

async function toggleLive(){
  wholeLive=!wholeLive;
  document.getElementById('lm-live').classList.toggle('on',wholeLive);
  if(wholeLive){
    const y=parseInt(document.getElementById('lm-year').value);
    // Try cache first
    let fd = getRaceFinalDate(curId, y);
    if(!fd){
      // Direct query for this specific race+year
      const { data } = await sb.from('race_dates')
        .select('race_date')
        .eq('race_id', curId)
        .eq('year', y)
        .limit(1);
      fd = data?.[0]?.race_date || null;
      if(fd){
        RACE_DATES[curId] = RACE_DATES[curId] || {};
        RACE_DATES[curId][y] = fd;
      }
    }
    if(fd){
      document.getElementById('lm-date').value = fd;
    } else {
      console.warn(`No race date in DB for ${curId} ${y}`);
    }
  } else {
    document.getElementById('lm-date').value = TODAY;
  }
}

async function renderLogFormBody(){
  const id=curId;
  const r=RACES.find(x=>x.id===id);
  const year=parseInt(document.getElementById('lm-year').value);
  const cnt=getStageCount(id);
  const rl=userLog[id]||{};
  const w=(curWatchIdx!==null&&rl.watches)?rl.watches[curWatchIdx]:null;

  let html=``;

  // Overall rating
  html+=`<div style="margin-bottom:14px;">
    <span class="slabel">Overall Rating</span>
    ${buildHSHTML('form-overall','overall',null,formRating)}
  </div>`;

  // Review
  html+=`<span class="slabel">Review</span>
  <textarea class="rta" id="lm-review" placeholder="What made this edition memorable?">${w?.review||''}</textarea>`;

  document.getElementById('log-form-body').innerHTML=html;
  // Attach half-star events after DOM insertion
  attachHSEvents('form-overall');
}


async function addRewatch(){
  curWatchIdx=null; formRating=0; stRatings={};
  document.getElementById('lm-year').disabled=false;
  document.getElementById('lm-date').value=TODAY;
  document.getElementById('lm-live').classList.remove('on');
  wholeLive=false;
  // Restore "new log" button state
  const saveBtn=document.querySelector('#log-mo .bp[onclick="saveLog()"]');
  if(saveBtn) saveBtn.textContent='Save Log';
  const rewatchBtn=document.getElementById('add-rewatch-btn');
  if(rewatchBtn) rewatchBtn.style.display='inline-block';
  await renderLogFormBody();
  toast('New watch — fill in and save');
}

async function saveLog(){
  if(!curId) return;
  const year=parseInt(document.getElementById('lm-year').value);
  const date=document.getElementById('lm-date').value;
  if(!date||date>TODAY){toast('Cannot log a future date');return;}
  const review=document.getElementById('lm-review')?.value?.trim()||'';
  if(!userLog[curId]) userLog[curId]={watches:[],range:[]};
  const rl=userLog[curId];
  const entry={year,date,live:wholeLive,rating:formRating,review,stages:{},ts:Date.now()};
  if(curWatchIdx!==null&&rl.watches[curWatchIdx]){
    const existing=rl.watches[curWatchIdx];
    entry.stages=existing.stages||{};
    if(existing.id) entry.id=existing.id; // preserve DB row id so Supabase does UPDATE not INSERT
    rl.watches[curWatchIdx]=entry;
  } else {
    rl.watches.push(entry);
    curWatchIdx=rl.watches.length-1;
  }
  persist();
  // Close modal and show toast immediately
  const savedYear = year;
  const savedId = curId;
  const savedIdx = curWatchIdx;
  closeMO('log-mo');
  toast(`${savedYear} logged ✓`);
  // Re-render current subpage in place
  if(aPg==='edition' && _curEditionSlug===savedId && _curEditionYear===savedYear){
    openEditionPage(savedId, savedYear, false);
  }
  renderAll();
  // Save to Supabase in background
  if(currentUser){
    const watchEntry=rl.watches[savedIdx];
    const logId=await saveLogToSupabase(savedId, watchEntry);
    if(logId){watchEntry.id=logId; persist();}
  }
}

// ════════════════════════════════════════════════════════
//  HALF-STAR WIDGET  (self-contained, event-delegation)
// ════════════════════════════════════════════════════════
// Build widget: which='overall'|'stage', sn=stage number or null
function buildHSHTML(containerId, which, sn, initRating=0){
  const snStr = (sn === null || sn === undefined) ? 'null' : sn;
  const stars = [1,2,3,4,5].map(s => {
    const lv = s-0.5, rv = s;
    const fill = initRating >= rv ? 100 : initRating >= lv ? 50 : 0;
    return '<span class="hss" data-lv="'+lv+'" data-rv="'+rv+'" data-which="'+which+'" data-sn="'+snStr+'">' +
      '<svg viewBox="0 0 24 24"><path fill="var(--border-light)" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
      '<svg viewBox="0 0 24 24" style="clip-path:inset(0 '+(100-fill)+'% 0 0);"><path fill="var(--gold)" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
      '<span class="hsh"></span><span class="hsf"></span></span>';
  }).join('');
  return '<div class="hs-wrap" id="'+containerId+'">' +
    '<div class="hsrow">'+stars+'</div>' +
    '<span class="rval hs-val">'+(initRating>0?initRating.toFixed(1):'—')+'</span>' +
    '<div class="rlbl hs-lbl">'+(RL[initRating]||'')+'</div>' +
    '</div>';
}

function attachHSEvents(containerId){
  const wrap = document.getElementById(containerId); if(!wrap) return;
  const row = wrap.querySelector('.hsrow'); if(!row) return;
  row.onmousemove = function(e){
    const star = e.target.closest('.hss'); if(!star) return;
    const rect = star.getBoundingClientRect();
    const v = (e.clientX - rect.left) < rect.width/2 ? parseFloat(star.dataset.lv) : parseFloat(star.dataset.rv);
    hsUpdateDisplay(wrap, v);
  };
  row.onmouseleave = function(){
    const firstStar = row.querySelector('.hss'); if(!firstStar) return;
    const which = firstStar.dataset.which;
    const sn = firstStar.dataset.sn === 'null' ? null : parseInt(firstStar.dataset.sn);
    hsUpdateDisplay(wrap, hsGetRating(which, sn));
  };
  row.onclick = function(e){
    const star = e.target.closest('.hss'); if(!star) return;
    const rect = star.getBoundingClientRect();
    const v = (e.clientX - rect.left) < rect.width/2 ? parseFloat(star.dataset.lv) : parseFloat(star.dataset.rv);
    const which = star.dataset.which;
    const sn = star.dataset.sn === 'null' ? null : parseInt(star.dataset.sn);
    hsSetRating(which, sn, v);
    hsUpdateDisplay(wrap, v);
  };
}

function hsGetRating(which, sn){
  if(which === 'filter') return logFilter.rating || 0;
  return which === 'overall' ? formRating : (stRatings[sn] || 0);
}
function hsSetRating(which, sn, v){
  if(which === 'filter'){ setLogFilter('rating', v); return; }
  if(which === 'overall') formRating = v; else stRatings[sn] = v;
}

function hsUpdateDisplay(wrap, v){
  if(!wrap) return;
  wrap.querySelectorAll('.hss').forEach(function(star, i){
    const s = i+1, lv = s-0.5, rv = s;
    const fill = v >= rv ? 100 : v >= lv ? 50 : 0;
    const gsvg = star.querySelectorAll('svg')[1];
    if(gsvg) gsvg.style.clipPath = 'inset(0 '+(100-fill)+'% 0 0)';
  });
  const vel = wrap.querySelector('.hs-val'); if(vel) vel.textContent = v > 0 ? v.toFixed(1) : '—';
  const lel = wrap.querySelector('.hs-lbl'); if(lel) lel.textContent = RL[v] || '';
}
// ════════════════════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════════════════════
function deleteStageLog(raceId, year, stageNum){
  const entry = stageLog[raceId]?.[year]?.[stageNum];
  if(!entry) return;
  const dbId = entry.dbId || null;
  delete stageLog[raceId][year][stageNum];
  if(!Object.keys(stageLog[raceId][year]).length) delete stageLog[raceId][year];
  if(!Object.keys(stageLog[raceId]||{}).length) delete stageLog[raceId];
  persistStageLog();
  renderAll();
  toast('Stage log deleted');
  // Delete from Supabase asynchronously
  if (currentUser && dbId) {
    sb.from('stage_logs').delete().eq('id', dbId).then(({error}) => {
      if (error) console.error('stage_logs delete error:', error);
    });
  }
}

function renderSidebar(){
  const el=document.getElementById('sidebar-log');
  // Merge races and stages, sort by ts, take top 8
  const races = allEntries().map(([id,w])=>({type:'race',id,w,ts:w.ts||0}));
  const stages = allStageEntries().map(e=>({type:'stage',...e,ts:e.stageLog.ts||0}));
  const all = [...races,...stages].sort((a,b)=>b.ts-a.ts).slice(0,8);
  if(!all.length){el.innerHTML='<div class="empty-log">Log some races to see activity here.</div>';return;}
  el.innerHTML=all.map(item=>{
    if(item.type==='stage'){
      const race=RACES.find(x=>x.id===item.raceId);
      const stLabel=item.stageNum===0?'Prologue':`Stage ${item.stageLog.stageLabel||item.stageNum}`;
      return `<div class="sle" onclick="openStagePage('${item.raceId}',${item.year},${item.stageNum})">
        <div class="sle-name">${race?.name||item.raceId}</div>
        <div class="sle-yr">${item.year} · ${stLabel}</div>
        <div class="sle-d">${item.stageLog.date?fmtDate(item.stageLog.date):''}</div>
        <div class="stars">${starsHTML(item.stageLog.rating||0,9)}</div>
      </div>`;
    }
    const r=RACES.find(x=>x.id===item.id); if(!r) return '';
    return `<div class="sle" onclick="navToRace('${item.id}',${item.w.year||'null'})">
      <div class="sle-name">${r.name}</div>
      <div class="sle-yr">${item.w.from?`${item.w.from}–${item.w.to}`:item.w.year} Edition</div>
      <div class="sle-d">${item.w.date?fmtDate(item.w.date):''}</div>
      <div class="stars">${starsHTML(item.w.rating||0,9)}</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  LOG PAGE
// ════════════════════════════════════════════════════════
function renderLogPage(){
  const allRaces = allEntries();   // [[raceId, watchObj], ...]
  const allStages = allStageEntries(); // [{raceId, year, stageNum, stageLog}, ...]

  // Stats header — races only
  document.getElementById('log-cnt').textContent = allRaces.length;
  document.getElementById('log-live').textContent = allRaces.filter(([,w])=>w.live).length;
  document.getElementById('log-races').textContent = new Set(allRaces.map(([id])=>id)).size;
  const rts = allRaces.filter(([,w])=>w.rating).map(([,w])=>w.rating);
  document.getElementById('log-avg').textContent = rts.length?(rts.reduce((a,b)=>a+b,0)/rts.length).toFixed(1):'—';

  // Build unified list: races as {type:'race', id, w} + stages as {type:'stage', ...}
  let raceItems = allRaces
    .filter(([id])=>RACES.find(x=>x.id===id))
    .map(([id,w])=>({type:'race', id, w, ts:w.ts||0}));

  let stageItems = allStages.map(e=>({
    type:'stage', raceId:e.raceId, year:e.year, stageNum:e.stageNum,
    sl:e.stageLog, ts:e.stageLog.ts||0
  }));

  // Apply filters — stages use same live/rating filters; country/type filter only for races
  raceItems = raceItems.filter(({id,w})=>{
    const r=RACES.find(x=>x.id===id);
    if(logFilter.rating){ const rounded=(Math.round((w.rating||0)*2)/2); if(rounded!==logFilter.rating) return false; }
    if(logFilter.country){ const key=`${r.flag||''} ${r.country}`.trim(); if(key!==logFilter.country) return false; }
    if(logFilter.type && r.type!==logFilter.type) return false;
    if(logFilter.live==='live' && !w.live) return false;
    if(logFilter.live==='replay' && w.live) return false;
    return true;
  });
  stageItems = stageItems.filter(({raceId, sl})=>{
    const r=RACES.find(x=>x.id===raceId);
    if(logFilter.rating){ const rounded=(Math.round((sl.rating||0)*2)/2); if(rounded!==logFilter.rating) return false; }
    if(logFilter.country && r){ const key=`${r.flag||''} ${r.country}`.trim(); if(key!==logFilter.country) return false; }
    if(logFilter.type && r && r.type!==logFilter.type) return false;
    if(logFilter.live==='live' && !sl.live) return false;
    if(logFilter.live==='replay' && sl.live) return false;
    return true;
  });

  let combined = [...raceItems, ...stageItems];

  // Sort
  if(logFilter.sort==='rating') combined.sort((a,b)=>((b.w||b.sl).rating||0)-((a.w||a.sl).rating||0));
  else if(logFilter.sort==='year') combined.sort((a,b)=>((b.w||b.sl).year||b.year||0)-((a.w||a.sl).year||a.year||0));
  else if(logFilter.sort==='name') combined.sort((a,b)=>{
    const na=a.type==='race'?(RACES.find(x=>x.id===a.id)?.name||''):(RACES.find(x=>x.id===a.raceId)?.name||'');
    const nb=b.type==='race'?(RACES.find(x=>x.id===b.id)?.name||''):(RACES.find(x=>x.id===b.raceId)?.name||'');
    return na.localeCompare(nb);
  });
  else combined.sort((a,b)=>b.ts-a.ts); // recent first

  updateLogFilterUI();

  const list=document.getElementById('log-list');
  const totalAll = allRaces.length + allStages.length;
  if(!totalAll){list.innerHTML='<div class="empty">No races logged yet.</div>';return;}
  if(!combined.length){list.innerHTML='<div class="empty" style="padding:40px;">No entries match these filters.</div>';return;}

  list.innerHTML = combined.map(item=>{
    if(item.type==='stage'){
      const {raceId,year,stageNum,sl} = item;
      const race = RACES.find(x=>x.id===raceId);
      const stLabel = stageNum===0 ? 'Prologue' : `Stage ${sl.stageLabel||stageNum}`;
      return `<div class="lpe" onclick="openStagePage('${raceId}',${year},${stageNum})">
        <div class="lpe-sw" style="background:${race?.gradient||'var(--border)'}"></div>
        <div class="lpe-info">
          <div class="lpe-race">${race?.name||raceId}</div>
          <div class="lpe-ed">${year} · ${stLabel}</div>
          <div class="lpe-meta">${race?`${race.flag} ${race.country} · `:''}Stage</div>
          <div style="margin-bottom:4px;">${starsHTML(sl.rating||0,11)}</div>
          ${sl.review?`<div class="lpe-rev">"${sl.review}"</div>`:''}
        </div>
        <div class="lpe-right">
          ${sl.date?`<div class="lpe-date">${fmtDate(sl.date)}</div>`:''}
          ${sl.live?`<div class="live-badge">LIVE</div>`:''}
          <button class="le-del" onclick="event.stopPropagation();deleteStageLog('${raceId}',${year},${stageNum})">Delete</button>
        </div>
      </div>`;
    }
    const {id,w} = item;
    const r=RACES.find(x=>x.id===id);
    const yrLabel=w.from?`${w.from}–${w.to}`:w.year;
    return `<div class="lpe" onclick="navToRace('${id}',${w.year||'null'})">
      <div class="lpe-sw" style="background:${r.gradient}"></div>
      <div class="lpe-info">
        <div class="lpe-race">${r.name}</div>
        <div class="lpe-ed">${yrLabel} Edition</div>
        <div class="lpe-meta">${r.flag} ${r.country} · ${r.type}</div>
        <div style="margin-bottom:4px;">${starsHTML(w.rating||0,11)}</div>
        ${w.review?`<div class="lpe-rev">"${w.review}"</div>`:''}
      </div>
      <div class="lpe-right">
        ${w.date?`<div class="lpe-date">${fmtDate(w.date)}</div>`:''}
        ${w.live?`<div class="live-badge">LIVE</div>`:''}
        <button class="le-del" onclick="event.stopPropagation();confirmDeleteEntryFromLog('${id}',${w.ts||0})">Delete</button>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  LEADERBOARD
// ════════════════════════════════════════════════════════
// Minimum number of ratings required to appear in community leaderboard
const TOP_RACES_MIN_RATINGS = 2;

