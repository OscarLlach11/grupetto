async function openStagePage(raceId, year, stageNum, pushHistory=true){
  _spRaceId=raceId; _spYear=year; _spStage=null;

  if(pushHistory){ _appHistoryDepth++; history.pushState(null,'',`#/stage/${raceId}/${year}/${stageNum}`); }

  const race = RACES.find(x=>x.id===raceId);
  const TYPE_ICON = {mountain:'⛰',tt:'⏱',ttt:'⏱⏱',cobbled:'◫',sprint:'━',hilly:'∧'};
  const TYPE_COL  = {mountain:'#c0392b',tt:'#1a3a8c',ttt:'#1a3a8c',cobbled:'#7b5e2a',sprint:'#1a5c2a',hilly:'#444'};
  const TYPE_LABEL= {mountain:'Mountain',tt:'Time Trial',ttt:'Team Time Trial',cobbled:'Cobbled',sprint:'Sprint',hilly:'Hilly'};

  // Show page immediately with loading state
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-stage').classList.add('active');
  document.querySelectorAll('.nav-a').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('active'));
  document.getElementById('stage-main').innerHTML = `<div style="padding:40px;color:var(--muted);">Loading…</div>`;
  document.getElementById('stage-sidebar').innerHTML = '';
  const stageScrollBody = document.querySelector('#page-stage .race-scroll-body');
  if(stageScrollBody) stageScrollBody.scrollTop = 0;

  // Load stage data
  let stages = await loadStages(raceId, year);
  if(!stages) stages = [];
  _spStage = stages.find(s=>s.num===stageNum) || null;
  const s = _spStage;

  if(!s){ document.getElementById('stage-main').innerHTML=`<div style="padding:40px;color:var(--muted);">Stage not found.</div>`; return; }

  const label   = s.num===0 ? 'Prologue' : `Stage ${s.label||s.num}`;
  const typeCol  = TYPE_COL[s.type]  || '#444';
  const typeIcon = TYPE_ICON[s.type] || '';
  const typeLabel= TYPE_LABEL[s.type]|| s.type||'';
  const route    = s.departure && s.arrival ? `${s.departure} → ${s.arrival}` : '';
  const userLog_ = getUserStageLog(raceId, year, stageNum);
  const isLogged = !!userLog_;

  // Prev/next navigation
  const idx = stages.findIndex(x=>x.num===stageNum);
  const prev = idx>0 ? stages[idx-1] : null;
  const next = idx<stages.length-1 ? stages[idx+1] : null;

  // ── Main column ──────────────────────────────────────────────────────────
  let mainHTML = `
    <div class="rsp-banner" style="background:${race?.gradient||'linear-gradient(135deg,#1a1a1a,#333)'}">
      <div style="position:relative;z-index:1;">
        <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,.6);margin-bottom:4px;text-transform:uppercase;">${race?.name||raceId} · ${year}</div>
        <div class="rsp-ttl">${label}</div>
        ${route?`<span class="rsp-sub">${route}</span>`:''}
      </div>
    </div>

    <!-- Type / Distance / Speed strip -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:24px;">
      <div style="flex:1;padding:14px 16px;border-right:1px solid var(--border);">
        <div style="font-size:9px;letter-spacing:2px;color:var(--muted);margin-bottom:4px;">TYPE</div>
        <div style="font-size:14px;font-weight:600;color:${typeCol};">${typeIcon} ${typeLabel}</div>
      </div>
      ${s.distance_km?`<div style="flex:1;padding:14px 16px;border-right:1px solid var(--border);">
        <div style="font-size:9px;letter-spacing:2px;color:var(--muted);margin-bottom:4px;">DISTANCE</div>
        <div style="font-size:14px;font-weight:600;">${s.distance_km} km</div>
      </div>`:''}
      ${s.avgSpeed?`<div style="flex:1;padding:14px 16px;">
        <div style="font-size:9px;letter-spacing:2px;color:var(--muted);margin-bottom:4px;">AVG SPEED</div>
        <div style="font-size:14px;font-weight:600;">${s.avgSpeed} km/h</div>
      </div>`:''}
      ${s.date?`<div style="flex:1;padding:14px 16px;${s.avgSpeed?'':''}">
        <div style="font-size:9px;letter-spacing:2px;color:var(--muted);margin-bottom:4px;">DATE</div>
        <div style="font-size:13px;font-weight:600;">${fmtDate(s.date)}</div>
      </div>`:''}
    </div>

    <!-- Log button -->
    <div style="display:flex;gap:10px;margin-bottom:28px;">
      <button class="bp" onclick="openStageLogModal()">${isLogged?'Edit My Log':'+ Log This Stage'}</button>
      <button class="bs" onclick="openRacePage('${raceId}',${year})">← Race Page</button>
    </div>`;

  // User's log for this stage
  if(isLogged){
    mainHTML+=`<div class="rsp-section"><div class="rsp-st">Your Log</div>
      <div class="log-entry-card">
        <div class="lec-head">
          <div>
            <div class="lec-year">${label}</div>
            <div class="stars" style="margin:4px 0;">${starsHTML(userLog_.rating||0,13)}</div>
            ${userLog_.date?`<div style="font-size:10px;color:var(--muted);margin-top:2px;">${fmtDate(userLog_.date)}</div>`:''}
          </div>
          <div class="lec-date">${userLog_.live?'<span style="font-size:8px;color:var(--live);border:1px solid var(--live);padding:1px 5px;">LIVE</span>':''}</div>
        </div>
        ${userLog_.review?`<div class="lec-review">"${userLog_.review}"</div>`:''}
        <div class="lec-actions">
          <button class="bs" style="font-size:9px;padding:5px 10px;" onclick="openStageLogModal()">Edit</button>
        </div>
      </div>
    </div>`;
  }

  // Prev / Next navigation
  mainHTML+=`<div style="display:flex;gap:8px;margin-top:16px;">
    ${prev?`<button class="bs" style="flex:1;text-align:left;" onclick="openStagePage('${raceId}',${year},${prev.num})">‹ ${prev.num===0?'Prologue':'Stage '+(prev.label||prev.num)}</button>`:'<div style="flex:1;"></div>'}
    ${next?`<button class="bs" style="flex:1;text-align:right;" onclick="openStagePage('${raceId}',${year},${next.num})">Stage ${next.label||next.num} ›</button>`:'<div style="flex:1;"></div>'}
  </div>`;

  document.getElementById('stage-main').innerHTML = mainHTML;

  // ── Stage edition comments (appended below stage content) ────────────────
  fetchStageEditionComments(raceId, year, stageNum).then(comments=>{
    const stageMain = document.getElementById('stage-main');
    if(!stageMain) return;
    const commentsDiv = document.createElement('div');
    commentsDiv.innerHTML = renderStageEditionCommentsHTML(raceId, year, stageNum, comments);
    stageMain.appendChild(commentsDiv.firstElementChild);
    const commentInput = document.getElementById('stage-comment-input');
    if(commentInput){
      commentInput.addEventListener('keydown', e=>{
        if(e.key==='Enter' && (e.ctrlKey||e.metaKey)) submitStageEditionComment(raceId, year, stageNum);
      });
    }
  });

  // ── Sidebar: top 10 ──────────────────────────────────────────────────────
  let sbHTML = '';

  if(s.winner){
    sbHTML += `<div class="sb-title">Stage Winner</div>
      <div style="font-family:'DM Serif Display',serif;font-size:17px;margin-bottom:2px;color:var(--gold);">${formatRiderName(s.winner)}</div>
      ${s.winnerTeam?`<div style="font-size:11px;color:var(--muted);margin-bottom:20px;">${s.winnerTeam}</div>`:'<div style="margin-bottom:20px;"></div>'}`;
  }

  if(s.top10 && s.top10.length){
    sbHTML += `<div class="sb-title" style="margin-top:4px;">Top 10</div><div>`;
    s.top10.forEach((entry,i)=>{
      const nm  = typeof entry==='string'?entry:(entry.rider||entry.rider_name||'');
      const tm  = typeof entry==='object'?(entry.time||entry.gap||''):'';
      const gap = typeof entry==='object'?(entry.gap||''):'';
      sbHTML+=`<div class="top10-row">
        <span class="t10-pos">${i+1}</span>
        <span class="t10-name" style="cursor:pointer;" onclick="navToRider('${nm}')" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color=''">${formatRiderName(nm)}</span>
        ${(i===0?tm:gap)?`<span style="font-size:10px;color:var(--muted);margin-left:auto;">${i===0?tm:gap}</span>`:''}
      </div>`;
    });
    sbHTML += `</div>`;
  }

  if(s.gcTop5 && s.gcTop5.length){
    sbHTML += `<div class="sb-title" style="margin-top:20px;">GC After Stage</div><div>`;
    s.gcTop5.forEach((entry,i)=>{
      const nm = typeof entry==='string'?entry:(entry.rider||entry.rider_name||'');
      const tm = typeof entry==='object'?(entry.time||''):'';
      sbHTML+=`<div class="top10-row">
        <span class="t10-pos">${i+1}</span>
        <span class="t10-name" style="cursor:pointer;" onclick="navToRider('${nm}')" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color=''">${formatRiderName(nm)}</span>
        ${tm?`<span style="font-size:10px;color:var(--muted);margin-left:auto;">${tm}</span>`:''}
      </div>`;
    });
    sbHTML += `</div>`;
  }

  if(!sbHTML) sbHTML=`<div style="font-size:11px;color:var(--muted);">No result data yet.</div>`;

  const isMobileStage = window.innerWidth <= 820;
  if(isMobileStage){
    const stageMainEl = document.getElementById('stage-main');
    if(stageMainEl) stageMainEl.insertAdjacentHTML('afterbegin', `<div class="rsp-section" style="border-bottom:1px solid var(--border);margin-bottom:24px;padding-bottom:20px;">${sbHTML}</div>`);
  } else {
    document.getElementById('stage-sidebar').innerHTML = sbHTML;
  }
}

// ── Stage edition comments ────────────────────────────────────────────────
const _stageCommentsCache = {};
async function fetchStageEditionComments(raceId, year, stageNum){
  const key=`${raceId}-${year}-${stageNum}`;
  if(_stageCommentsCache[key]) return _stageCommentsCache[key];
  const { data } = await sb.from('stage_edition_comments')
    .select('id,user_id,handle,display_name,text,created_at')
    .eq('race_slug',raceId).eq('year',year).eq('stage_num',stageNum)
    .order('created_at',{ascending:true});
  const result = data||[];
  _stageCommentsCache[key]=result;
  return result;
}

function renderStageEditionCommentsHTML(raceId, year, stageNum, comments){
  const myUid = currentUser?.id;
  let items = '';
  if(!comments.length){
    items=`<div style="color:var(--muted);font-size:12px;padding:12px 0;">No comments yet. Be the first!</div>`;
  } else {
    items=comments.map(c=>{
      const isOwn=c.user_id===myUid;
      return `<div class="edition-comment" id="sc-${c.id}">
        <div class="edition-comment-author">
          <span style="cursor:pointer;" onclick="openUserPage('${c.handle}')">${c.handle||c.display_name||'User'}</span>
          <span style="color:var(--muted);font-weight:400;font-size:10px;">${fmtDate((c.created_at||'').split('T')[0])}</span>
          ${isOwn?`<button class="edition-comment-delete" onclick="deleteStageEditionComment('${raceId}',${year},${stageNum},'${c.id}')">✕</button>`:''}
        </div>
        <div class="edition-comment-text">${c.text}</div>
      </div>`;
    }).join('');
  }
  const inputArea = currentUser
    ? `<div style="margin-top:16px;">
        <textarea class="rv-comment-input" id="stage-comment-input" placeholder="Comment on this stage…"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="bs" onclick="submitStageEditionComment('${raceId}',${year},${stageNum})">Post</button>
          <span style="font-size:10px;color:var(--muted);align-self:center;">Ctrl+Enter to post</span>
        </div>
      </div>`
    : `<div style="font-size:12px;color:var(--muted);margin-top:16px;"><button class="bs" style="font-size:10px;" onclick="openAuthModal()">Sign in to comment</button></div>`;

  return `<div class="rsp-section" style="margin-top:24px;">
    <div class="rsp-st">Stage Discussion <span style="color:var(--muted);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:400;">${comments.length||''}</span></div>
    <div id="stage-comments-list">${items}</div>
    ${inputArea}
  </div>`;
}

async function submitStageEditionComment(raceId, year, stageNum){
  if(!currentUser){ toast('Sign in to comment'); return; }
  const input=document.getElementById('stage-comment-input');
  const text=input?.value?.trim();
  if(!text){ toast('Write something first'); return; }
  input.value=''; input.disabled=true;
  const myHandle=profile?.handle||currentUser.email.split('@')[0];
  const myName=profile?.name||myHandle;
  const { data, error } = await sb.from('stage_edition_comments').insert({
    race_slug:raceId, year:parseInt(year), stage_num:parseInt(stageNum),
    user_id:currentUser.id, handle:myHandle, display_name:myName, text,
  }).select().single();
  input.disabled=false;
  if(error){ toast('Error posting comment'); console.error(error); return; }
  const key=`${raceId}-${year}-${stageNum}`;
  if(_stageCommentsCache[key]) _stageCommentsCache[key].push(data);
  else _stageCommentsCache[key]=[data];
  const listEl=document.getElementById('stage-comments-list');
  if(listEl){
    const newItem=document.createElement('div');
    newItem.className='edition-comment';
    newItem.id=`sc-${data.id}`;
    newItem.innerHTML=`<div class="edition-comment-author">
      <span>${myHandle}</span>
      <span style="color:var(--muted);font-weight:400;font-size:10px;">${fmtDate(data.created_at?.split('T')[0]||'')}</span>
      <button class="edition-comment-delete" onclick="deleteStageEditionComment('${raceId}',${year},${stageNum},'${data.id}')">✕</button>
    </div>
    <div class="edition-comment-text">${data.text}</div>`;
    const placeholder=listEl.querySelector('div[style*="No comments"]');
    if(placeholder) placeholder.remove();
    listEl.appendChild(newItem);
    newItem.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}

async function deleteStageEditionComment(raceId, year, stageNum, commentId){
  if(!currentUser) return;
  const { error }=await sb.from('stage_edition_comments').delete().eq('id',commentId).eq('user_id',currentUser.id);
  if(error){ toast('Error'); return; }
  const key=`${raceId}-${year}-${stageNum}`;
  if(_stageCommentsCache[key]) _stageCommentsCache[key]=_stageCommentsCache[key].filter(c=>c.id!==commentId);
  const el=document.getElementById(`sc-${commentId}`); if(el) el.remove();
}

// ── Stage Log Modal (reuses the race log modal elements) ──────────────────
function openStageLogModal(){
  if(!_spStage || !_spRaceId) return;
  const s = _spStage;
  const race = RACES.find(x=>x.id===_spRaceId);
  const saved = getUserStageLog(_spRaceId, _spYear, s.num);
  _spRating = saved?.rating || 0;
  formRating = _spRating;

  const label = s.num===0?'Prologue':`Stage ${s.label||s.num}`;

  // Hijack the existing log modal for a single-stage entry
  document.getElementById('log-mbanner').style.background = race?.gradient||'linear-gradient(135deg,#1a1a1a,#333)';
  document.getElementById('log-mtitle').textContent = label;
  document.getElementById('log-msub').textContent = `${race?.name||_spRaceId} · ${_spYear}`;
  document.getElementById('log-mdesc').textContent = [
    s.distance_km ? `${s.distance_km} km` : '',
    s.departure && s.arrival ? `${s.departure} → ${s.arrival}` : '',
  ].filter(Boolean).join('  ·  ');
  document.getElementById('log-minfo').innerHTML = '';
  document.getElementById('log-sgs').innerHTML = '';

  // Hide year/date/live header row and extra buttons (not needed for single stage)
  document.getElementById('lm-year').closest('div[style*="border-bottom"]').style.display='none';
  document.getElementById('lm-wl-btn').style.display='none';
  document.getElementById('lm-del-btn').style.display='none';
  document.getElementById('add-rewatch-btn').style.display='none';

  document.getElementById('log-form-body').innerHTML=`
    <div style="margin-bottom:14px;">
      <span class="slabel">Rating</span>
      ${buildHSHTML('sp-hs','overall',null,_spRating)}
    </div>
    <span class="slabel">Notes</span>
    <textarea class="rta" id="sp-review" placeholder="How was this stage?">${saved?.review||''}</textarea>
    <div class="frow" style="margin-top:12px;">
      <div><label class="flbl">Date Watched</label><input type="date" class="dinp" id="sp-date" value="${saved?.date||s.date||''}" max="${TODAY}"></div>
      <div><div style="height:18px;"></div>
        <div class="ltog ${saved?.live?'on':''}" id="sp-live" onclick="this.classList.toggle('on');if(this.classList.contains('on'))document.getElementById('sp-date').value='${s.date||''}'">
          <div class="ldot"></div><span>Watched Live</span>
        </div>
      </div>
    </div>`;

  // Override save button to call saveStagePageLog
  document.querySelector('#log-mo .bp[onclick="saveLog()"]').onclick = saveStagePageLog;

  attachHSEvents('sp-hs');
  openMO('log-mo');
}

// ── Separate stage log store — never touches userLog ─────────────────────
// stageLog[raceId][year][stageNum] = {rating, review, date, live, ts, stageLabel, dbId}
let stageLog = JSON.parse(localStorage.getItem('g3-stage-log') || '{}');
function persistStageLog(){ localStorage.setItem('g3-stage-log', JSON.stringify(stageLog)); }

// ── Save a single stage log entry to Supabase ──────────────────────────────
// Finds or creates the parent race_log row, then upserts the stage_log row.
async function saveStageLogToSupabase(raceId, year, stageNum) {
  if (!currentUser) return;
  const entry = stageLog[raceId]?.[year]?.[stageNum];
  if (!entry) return;

  // Save directly to stage_logs with all fields — no ghost race_log parent needed.
  // log_id is optional (null if user hasn't logged the full race).
  const logId = (userLog[raceId]?.watches || []).find(w => w.year === year)?.id || null;

  const row = {
    log_id:       logId,
    user_id:      currentUser.id,
    race_slug:    raceId,
    year:         year,
    stage_num:    stageNum,
    rating:       entry.rating || null,
    review:       entry.review || null,
    watched_live: entry.live || false,
    date_watched: entry.date || null,
  };

  let dbId = entry.dbId || null;
  if (dbId) {
    const { error } = await sb.from('stage_logs').update(row).eq('id', dbId);
    if (error) { console.error('stage_logs update error:', error); return; }
  } else {
    const { data, error } = await sb.from('stage_logs').insert(row).select().single();
    if (error) { console.error('stage_logs insert error:', error); return; }
    dbId = data.id;
  }

  if (stageLog[raceId]?.[year]?.[stageNum]) {
    stageLog[raceId][year][stageNum].dbId = dbId;
    persistStageLog();
  }
}

// ── Sync any locally-stored stage logs that haven't reached Supabase yet ──
// Runs once on sign-in. Iterates stageLog and calls saveStageLogToSupabase
// for any entry missing a dbId (i.e. never successfully saved to DB).

// ── Debug helper — call window.palmarèsDebug() from browser console ────────
window.palmarèsDebug = async function() {
  if (!currentUser) { console.error('Not signed in'); return; }
  const uid = currentUser.id;
  console.group('=== PALMARÈS DEBUG ===');
  console.log('Current user:', uid);

  // 1. What's in stage_logs for this user?
  const { data: myStages, error: e1 } = await sb.from('stage_logs')
    .select('id, user_id, race_slug, year, stage_num, rating, log_id')
    .eq('user_id', uid);
  console.log('My stage_logs rows:', myStages?.length ?? 'ERROR', e1 || '');
  console.table(myStages || []);

  // 2. What's in race_logs for this user?
  const { data: myRaces, error: e2 } = await sb.from('race_logs')
    .select('id, user_id, slug, year, rating, review, watched_live')
    .eq('user_id', uid);
  console.log('My race_logs rows:', myRaces?.length ?? 'ERROR', e2 || '');
  console.table(myRaces || []);

  // 3. Who am I following?
  const { data: following } = await sb.from('follows').select('following_id').eq('follower_id', uid);
  const followIds = (following || []).map(f => f.following_id);
  console.log('Following:', followIds);

  // 4. Can I read THEIR stage_logs? (tests RLS)
  if (followIds.length) {
    const { data: theirStages, error: e3 } = await sb.from('stage_logs')
      .select('id, user_id, race_slug, year, stage_num, rating')
      .in('user_id', followIds);
    console.log('Their stage_logs (RLS test):', theirStages?.length ?? 'ERROR', e3 || '');
    console.table(theirStages || []);

    const { data: theirRaces, error: e4 } = await sb.from('race_logs')
      .select('id, user_id, slug, year, rating')
      .in('user_id', followIds);
    console.log('Their race_logs (RLS test):', theirRaces?.length ?? 'ERROR', e4 || '');
    console.table(theirRaces || []);
  }

  // 5. Local stageLog store
  console.log('Local stageLog store:', JSON.parse(localStorage.getItem('g3-stage-log') || '{}'));

  console.groupEnd();
};

// Force re-sync all local stage logs to Supabase (clears dbId cache so all go through fresh inserts)
window.palmarèsRepairStageLogs = async function() {
  if (!currentUser) { console.error('Not signed in'); return; }
  console.log('Repairing stage logs — clearing dbId cache and re-syncing all to Supabase...');

  // Clear all dbIds from local store so everything goes through insert (not update)
  const local = JSON.parse(localStorage.getItem('g3-stage-log') || '{}');
  let count = 0;
  Object.values(local).forEach(years =>
    Object.values(years).forEach(stages =>
      Object.values(stages).forEach(s => { delete s.dbId; count++; })
    )
  );
  localStorage.setItem('g3-stage-log', JSON.stringify(local));
  // Reload stageLog in memory
  Object.assign(stageLog, local);

  // Delete all existing stage_logs for this user in DB (avoid duplicates)
  const { error: delErr } = await sb.from('stage_logs').delete().eq('user_id', currentUser.id);
  if (delErr) { console.error('Delete failed:', delErr); return; }
  console.log('Deleted existing stage_logs from DB. Re-inserting', count, 'entries...');

  // Re-sync all
  await syncLocalStageLogsToSupabase();
  console.log('Done. Run window.palmarèsDebug() to verify.');
  toast('Stage logs repaired and re-synced ✓');
};
console.log('%c[Palmarès] Debug ready — run window.palmarèsDebug() or window.palmarèsRepairStageLogs() in console', 'color:#f5a623');

async function syncLocalStageLogsToSupabase() {
  if (!currentUser) return;
  const entries = [];
  Object.entries(stageLog).forEach(([raceId, years]) => {
    Object.entries(years).forEach(([year, stages]) => {
      Object.entries(stages).forEach(([stageNum, sl]) => {
        if (!sl.dbId) {
          entries.push({ raceId, year: parseInt(year), stageNum: parseInt(stageNum) });
        }
      });
    });
  });
  if (!entries.length) return;
  console.log(`Syncing ${entries.length} unsynced stage log(s) to Supabase…`);
  for (const { raceId, year, stageNum } of entries) {
    await saveStageLogToSupabase(raceId, year, stageNum);
  }
}

// ── TTL Cache — stale-while-revalidate for expensive Supabase queries ─────
// Usage: cacheSet('key', data, ttlMinutes)  /  cacheGet('key') → data or null
const CACHE_PREFIX = 'g3-cache:';
const CACHE_VERSION = 'v5'; // bump this to bust all caches
function cacheSet(key, data, ttlMinutes = 30){
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data, expires: Date.now() + ttlMinutes * 60 * 1000, v: CACHE_VERSION
    }));
  } catch(e) {} // storage full — fail silently
}
function cacheGet(key){
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if(!raw) return null;
    const { data, expires, v } = JSON.parse(raw);
    if(v !== CACHE_VERSION) return null; // stale version
    if(Date.now() > expires) return null; // expired
    return data;
  } catch(e) { return null; }
}
function cacheClear(key){ localStorage.removeItem(CACHE_PREFIX + key); }

function getUserStageLogEntry(raceId, year, stageNum){
  return stageLog[raceId]?.[year]?.[stageNum] || null;
}

function saveStagePageLog(){
  if(!_spStage) return;
  const s = _spStage;
  let date = document.getElementById('sp-date').value;
  if(date && date>TODAY){ toast('Cannot log a future date'); return; }
  if(!date) date = TODAY; // default to today if not set
  const review = document.getElementById('sp-review').value.trim();
  const live   = document.getElementById('sp-live').classList.contains('on');
  const rating = formRating;

  // Save into the separate stageLog store — never touches userLog
  if(!stageLog[_spRaceId]) stageLog[_spRaceId] = {};
  if(!stageLog[_spRaceId][_spYear]) stageLog[_spRaceId][_spYear] = {};
  stageLog[_spRaceId][_spYear][s.num] = { rating, review, date, live, ts: Date.now(),
    stageLabel: s.label || String(s.num) };
  persistStageLog();

  persist();
  closeMO('log-mo');
  toast(`${s.num===0?'Prologue':`Stage ${s.label||s.num}`} logged ✓`);
  renderAll();
  _restoreLogModal();
  openStagePage(_spRaceId, _spYear, s.num, false);

  // Save to Supabase asynchronously
  if (currentUser) saveStageLogToSupabase(_spRaceId, _spYear, s.num);
}
