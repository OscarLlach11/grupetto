
async function openFollowersPage(mode){ // mode = 'followers' | 'following'
  if(!currentUser) { openAuthModal(); return; }
  const uid = currentUser.id;
  const title = mode === 'followers' ? 'Followers' : 'Following';
  document.getElementById('followers-page-title').textContent = title;
  document.getElementById('followers-page-list').innerHTML = '<div style="color:var(--muted);font-size:12px;">Loading…</div>';

  // Switch page
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-followers').classList.add('active');
  document.querySelectorAll('.nav-a').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('active'));

  // Load the list
  let userIds = [];
  if(mode === 'followers'){
    const { data } = await sb.from('follows').select('follower_id').eq('following_id', uid);
    userIds = (data||[]).map(r => r.follower_id);
  } else {
    const { data } = await sb.from('follows').select('following_id').eq('follower_id', uid);
    userIds = (data||[]).map(r => r.following_id);
  }

  if(!userIds.length){
    document.getElementById('followers-page-list').innerHTML =
      `<div style="color:var(--muted);font-size:13px;font-style:italic;">No ${title.toLowerCase()} yet.</div>`;
    return;
  }

  const { data: profiles } = await sb.from('profiles').select('user_id,display_name,handle,avatar_url').in('user_id', userIds);
  const list = document.getElementById('followers-page-list');
  list.innerHTML = (profiles||[]).map(p => {
    const ini = (p.display_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    const avatarHTML = p.avatar_url
      ? `<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`
      : ini;
    return `<div class="follower-card" onclick="openUserPage('${p.user_id}')">
      <div class="fc-avatar">${avatarHTML}</div>
      <div style="flex:1;">
        <div class="fc-name">${p.display_name||'Cyclist'}</div>
        <div class="fc-handle">@${p.handle||'cyclist'}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Following feed on discover page ───────────────────────────────────────
async function loadFollowingFeed(){
  const section = document.getElementById('following-feed-section');
  const list = document.getElementById('following-feed-list');
  if(!section || !currentUser) { if(section) section.style.display='none'; return; }

  if(!_followingIds.size) await loadFollowingIds();
  if(!_followingIds.size){ section.style.display='none'; return; }

  // ── Instant render from cache ─────────────────────────────────────────
  const cacheKey = `g3-feed:${currentUser.id}`;
  // Use localStorage so feed survives tab close (5-min TTL)
  const _feedRaw = localStorage.getItem(cacheKey);
  const _feedEntry = _feedRaw ? (() => { try{ return JSON.parse(_feedRaw); }catch(e){ return null; } })() : null;
  const cached = _feedEntry && _feedEntry.expires > Date.now() ? _feedEntry.html : null;
  if(cached){
    list.innerHTML = cached;
    section.style.display = 'block';
  }

  const followArr = [..._followingIds];

  // Fetch race logs (with nested stage_logs) in one query
  // Joining stage_logs through race_logs avoids needing a separate stage_logs SELECT RLS policy
  const [raceLogsRes, stageLogsRes] = await Promise.all([
    sb.from('race_logs')
      .select('id, user_id, slug, year, rating, date_watched, created_at')
      .in('user_id', followArr)
      .not('rating', 'is', null).gt('rating', 0)
      .order('created_at', {ascending: false})
      .limit(20),
    sb.from('stage_logs')
      .select('id, user_id, stage_num, rating, review, date_watched, created_at, race_slug, year')
      .in('user_id', followArr)
      .not('race_slug', 'is', null)
      .order('created_at', {ascending: false})
      .limit(20),
  ]);
  if(raceLogsRes.error) console.error('feed race_logs error:', raceLogsRes.error);
  if(stageLogsRes.error) console.error('feed stage_logs error:', stageLogsRes.error);
  const raceLogs = raceLogsRes.data;
  const stageLogs = stageLogsRes.data;

  // Normalise into a unified list
  const items = [];
  (raceLogs||[]).forEach(log => {
    items.push({ type:'race', user_id:log.user_id, slug:log.slug, year:log.year,
      rating:log.rating, date:log.date_watched||log.created_at, ts:new Date(log.created_at).getTime() });
  });
  (stageLogs||[]).forEach(sl => {
    const slug = sl.race_slug;
    const year = sl.year;
    if(!slug||!year) return;
    items.push({ type:'stage', user_id:sl.user_id, slug, year, stageNum:sl.stage_num,
      rating:sl.rating, date:sl.date_watched||sl.created_at, ts:new Date(sl.created_at).getTime() });
  });

  // Sort by recency, dedupe, take top 15
  items.sort((a,b)=>b.ts-a.ts);
  const seen = new Set();
  const feed = items.filter(item => {
    const key = `${item.user_id}|${item.slug}|${item.year}|${item.stageNum||''}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 15);

  if(!feed.length){ section.style.display='none'; return; }

  // Get profiles
  const uids = [...new Set(feed.map(i => i.user_id))];
  const { data: profiles } = await sb.from('profiles').select('user_id,display_name,handle,avatar_url').in('user_id', uids);
  const profMap = Object.fromEntries((profiles||[]).map(p => [p.user_id, p]));

  list.innerHTML = feed.map(item => {
    const p = profMap[item.user_id] || {};
    const race = RACES.find(r => r.id === item.slug);
    const raceName = race?.name || item.slug;
    const gradient = race?.gradient || 'linear-gradient(135deg,#1a1a1a,#333)';
    const logoUrl = race?.logoUrl || null;
    const ini = (p.display_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    const avatarHTML = p.avatar_url ? `<img src="${p.avatar_url}">` : ini;
    const dateLabel = item.date ? fmtDate(item.date.slice(0,10)) : '';
    const isStage = item.type === 'stage';
    const onclick = isStage
      ? `openStagePage('${item.slug}',${item.year},${item.stageNum})`
      : `openRacePage('${item.slug}')`;

    const posterBg = logoUrl
      ? `<div class="feed-poster-bg" style="background:${gradient};display:flex;align-items:center;justify-content:center;">
           <img src="${logoUrl}" alt="${raceName}" style="max-width:78%;max-height:65%;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,.55));" onerror="this.style.display='none'">
         </div>`
      : `<div class="feed-poster-bg" style="background:${gradient}"><div class="feed-poster-title">${raceName}</div></div>`;

    return `<div class="feed-item" onclick="${onclick}">
      <div class="feed-poster">
        ${posterBg}
        <div style="position:absolute;bottom:0;left:0;right:0;padding:6px 8px;background:linear-gradient(transparent,rgba(0,0,0,.75));font-size:10px;letter-spacing:1px;color:rgba(255,255,255,.8);">${item.year}${isStage ? ' · S'+item.stageNum : ''}</div>
        ${isStage ? '<div class="feed-poster-stage">STAGE</div>' : ''}
      </div>
      <div class="feed-user">
        <div class="feed-avatar" onclick="event.stopPropagation();openUserPage('${item.user_id}')">${avatarHTML}</div>
        <span class="feed-username" onclick="event.stopPropagation();openUserPage('${item.user_id}')">${p.display_name||'Cyclist'}</span>
      </div>
      <div class="feed-stars">${item.rating ? starsHTML(item.rating, 9) : ''}</div>
      <div class="feed-date">${dateLabel}</div>
    </div>`;
  }).join('');

  // Save to localStorage for instant render on next load (5-min TTL)
  try { localStorage.setItem(cacheKey, JSON.stringify({ html: list.innerHTML, expires: Date.now() + 5*60*1000 })); } catch(e){}

  section.style.display = 'block';
}

// ── User profile page ──────────────────────────────────────────────────────
let _upageUserId = null;
let _upageLoading = false;
function _upageFollow(){ if(_upageUserId) toggleFollow(_upageUserId); }

async function openUserPage(userId, handle, pushHistory=true){
  // If called with handle only (from notifications), resolve userId first
  if(!userId && handle){
    const { data } = await sb.from('profiles').select('user_id').eq('handle', handle).maybeSingle();
    if(data?.user_id) userId = data.user_id;
    else { toast('User not found'); return; }
  }
  if(currentUser && userId === currentUser.id){ showPage('profile'); return; }

  // Prevent concurrent calls (e.g. click + popstate firing together)
  if(_upageLoading) return;
  _upageLoading = true;

  _upageUserId = userId;
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-user').classList.add('active');
  document.querySelectorAll('.nav-a').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('active'));
  if(pushHistory){ _appHistoryDepth++; history.pushState(null,'',`#/user/${userId}`); }

  // Show skeleton loading state
  document.getElementById('upage-name').innerHTML = '<div class="skeleton" style="width:160px;height:20px;border-radius:3px;display:inline-block;"></div>';
  document.getElementById('upage-handle').innerHTML = '<div class="skeleton" style="width:90px;height:12px;border-radius:3px;display:inline-block;margin-top:4px;"></div>';
  document.getElementById('upage-stat-grid').innerHTML = Array(4).fill(`
    <div style="text-align:center;">
      <div class="skeleton" style="width:36px;height:24px;border-radius:3px;margin:0 auto 6px;"></div>
      <div class="skeleton" style="width:48px;height:10px;border-radius:3px;margin:0 auto;"></div>
    </div>`).join('');
  document.getElementById('upage-fav-riders-grid').innerHTML = Array(4).fill(`
    <div style="border:1px solid var(--border);overflow:hidden;pointer-events:none;">
      <div class="skeleton" style="width:100%;aspect-ratio:2/3;"></div>
      <div style="padding:4px 6px;background:var(--card-bg);">
        <div class="skeleton skeleton-text" style="width:85%;"></div>
      </div>
    </div>`).join('');
  document.getElementById('upage-fav-race-display').innerHTML = '';
  document.getElementById('upage-recent-activity').innerHTML = Array(3).fill(`
    <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;">
      <div class="skeleton" style="width:36px;height:36px;flex-shrink:0;border-radius:2px;"></div>
      <div style="flex:1;">
        <div class="skeleton skeleton-title" style="width:60%;"></div>
        <div class="skeleton skeleton-text" style="width:35%;"></div>
      </div>
    </div>`).join('');
  document.getElementById('upage-recent-reviews').innerHTML = '';
  document.getElementById('upage-countries').innerHTML = '';
  document.getElementById('upage-rating-dist').innerHTML = '';
  document.getElementById('upage-yearly-stats').innerHTML = '';

  // Load profile + logs + stage_logs + follower count in parallel
  const [profRes, logsRes, stageLogsRes, followersRes] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('race_logs').select('id,slug,year,rating,review,date_watched,watched_live,created_at')
      .eq('user_id', userId).order('created_at', {ascending:false}),
    sb.from('stage_logs').select('id,race_slug,year,stage_num,rating,review,date_watched,watched_live,created_at')
      .eq('user_id', userId).order('created_at', {ascending:false}),
    sb.from('follows').select('follower_id',{count:'exact',head:true}).eq('following_id', userId),
  ]);

  if(profRes.error) console.error('openUserPage profile error:', profRes.error);
  if(logsRes.error) console.error('openUserPage logs error:', logsRes.error);
  if(stageLogsRes.error) console.error('openUserPage stage_logs error:', stageLogsRes.error);
  if(logsRes.error?.code === '42501') console.warn('race_logs RLS is blocking reads — add public SELECT policy.');
  if(stageLogsRes.error?.code === '42501') console.warn('stage_logs RLS is blocking reads — add public SELECT policy.');

  const p = profRes.data || {};
  const logs = logsRes.data || [];
  const stageLogRows = stageLogsRes.data || [];
  const followerCount = followersRes.count || 0;

  // Build allEntries from real race_log entries (non-ghost)
  const all = logs.map(log => [log.slug, {
    year: log.year,
    date: log.date_watched,
    live: log.watched_live,
    rating: parseFloat(log.rating)||0,
    review: log.review||'',
    ts: new Date(log.created_at).getTime(),
    type: 'race',
  }]);

  // Build stage entries for recent activity / reviews display
  const stageEntries = stageLogRows.map(s => [s.race_slug, {
    year: s.year,
    date: s.date_watched,
    live: s.watched_live,
    rating: parseFloat(s.rating)||0,
    review: s.review||'',
    ts: new Date(s.created_at).getTime(),
    type: 'stage',
    stageNum: s.stage_num,
  }]);
  const allWithStages = [...all, ...stageEntries];

  // ── Avatar + name ────────────────────────────────────────────────────
  const ini = (p.display_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const avatarEl = document.getElementById('upage-avatar');
  if(p.avatar_url){
    avatarEl.innerHTML = `<img src="${p.avatar_url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    avatarEl.textContent = ini;
  }
  document.getElementById('upage-name').textContent = (p.display_name||'Cyclist').toUpperCase();
  document.getElementById('upage-handle').textContent = '@'+(p.handle||'cyclist');

  // ── Follow button ───────────────────────────────────────────────────
  const followBtn = document.getElementById('upage-follow-btn');
  if(followBtn){
    if(!currentUser){
      followBtn.style.display = 'none';
    } else {
      if(!_followingIds.size) await loadFollowingIds();
      const isFollowing = _followingIds.has(userId);
      followBtn.textContent = isFollowing ? 'Following' : 'Follow';
      followBtn.className = 'follow-btn ' + (isFollowing ? 'following' : 'follow');
      followBtn.id = 'follow-btn-'+userId;
      followBtn.style.display = '';
    }
  }

  // ── Stats grid ──────────────────────────────────────────────────────
  const liveCount = allWithStages.filter(([,w])=>w.live).length;
  const rts = allWithStages.filter(([,w])=>w.rating).map(([,w])=>w.rating);
  const avg = rts.length ? (rts.reduce((a,b)=>a+b,0)/rts.length).toFixed(1) : '—';
  document.getElementById('upage-stat-grid').innerHTML = [
    [allWithStages.length, 'Logged',  ()=>openUserLog(userId, p.display_name, logs, 'all')],
    [liveCount,  'Live',     ()=>openUserLog(userId, p.display_name, logs, 'live')],
    [avg,        'Avg ★',    null],
    [followerCount,'Followers', null],
  ].map(([n,l,fn])=> fn
    ? `<div class="profile-stat-cell clickable" onclick="_upageStatClick(${_upageStatFns.push(fn)-1})"><div class="profile-stat-n">${n}</div><div class="profile-stat-l">${l}</div></div>`
    : `<div class="profile-stat-cell"><div class="profile-stat-n">${n}</div><div class="profile-stat-l">${l}</div></div>`
  ).join('');

  // ── Rating distribution ──────────────────────────────────────────────
  const distEl = document.getElementById('upage-rating-dist');
  if(rts.length){
    const buckets={};
    for(let v=0.5;v<=5.0;v+=0.5) buckets[v.toFixed(1)]=0;
    rts.forEach(r=>{ const k=(Math.round(r*2)/2).toFixed(1); if(buckets[k]!==undefined) buckets[k]++; });
    const maxCnt=Math.max(...Object.values(buckets),1);
    const BAR_MAX_H=52;
    const bEntries=Object.entries(buckets);
    const barsRow=bEntries.map(([v,cnt])=>{
      const barH=cnt>0?Math.max(Math.round(cnt/maxCnt*BAR_MAX_H),2):0;
      return `<div style="flex:1;height:${BAR_MAX_H}px;display:flex;align-items:flex-end;"><div style="width:100%;height:${barH}px;background:${cnt>0?'var(--gold)':'var(--border)'};border-radius:2px 2px 0 0;"></div></div>`;
    }).join('');
    const labelsRow=bEntries.map(([v])=>`<div style="flex:1;text-align:center;font-size:8px;color:var(--muted);">${parseFloat(v)%1===0?parseFloat(v):''}</div>`).join('');
    distEl.innerHTML=`<div style="display:flex;align-items:flex-end;gap:2px;">${barsRow}</div><div style="display:flex;gap:2px;margin-top:3px;">${labelsRow}</div>`;
  } else {
    distEl.innerHTML='<div style="color:var(--muted);font-size:11px;">No ratings yet.</div>';
  }

  // ── Yearly stats ────────────────────────────────────────────────────
  const byYear={};
  allWithStages.forEach(([,w])=>{ const yr=w.year; if(!yr) return; if(!byYear[yr]) byYear[yr]={cnt:0,live:0,rts:[]}; byYear[yr].cnt++; if(w.live) byYear[yr].live++; if(w.rating) byYear[yr].rts.push(w.rating); });
  const yrEl=document.getElementById('upage-yearly-stats');
  const yrKeys=Object.keys(byYear).sort((a,b)=>b-a);
  yrEl.innerHTML = yrKeys.length ? yrKeys.map(yr=>{
    const d=byYear[yr], yrAvg=d.rts.length?(d.rts.reduce((a,b)=>a+b,0)/d.rts.length).toFixed(1):'—';
    return `<div class="yr-row"><div class="yr-num">${yr}</div><div style="flex:1;font-size:12px;color:var(--muted);">${d.cnt} edition${d.cnt!==1?'s':''} · ★ ${yrAvg}</div></div>`;
  }).join('') : '<div style="color:var(--muted);font-size:11px;">No races logged yet.</div>';

  // ── Favourite riders ────────────────────────────────────────────────
  // fav_riders stored as [{name, imageUrl}] objects or plain strings
  const rawRiders = Array.isArray(p.fav_riders) ? p.fav_riders.filter(Boolean) : [];
  const favRiders = rawRiders.map(r => typeof r === 'object' ? (r.name || '') : r).filter(Boolean);
  const favRiderImgs = Object.fromEntries(rawRiders.map(r => {
    const name = typeof r === 'object' ? r.name : r;
    const img  = typeof r === 'object' ? r.imageUrl : null;
    return [name, img];
  }));
  const ridersGrid = document.getElementById('upage-fav-riders-grid');
  if(favRiders.length){
    // Try to get better/more recent images from startlists
    const { data: riderRows } = await sb.from('startlists').select('rider_name,image_url,year').in('rider_name', favRiders).order('year',{ascending:false});
    const imgMap={};
    (riderRows||[]).forEach(r=>{ if(!imgMap[r.rider_name]||(r.image_url&&r.image_url!=='none'&&(!imgMap[r.rider_name].image_url||imgMap[r.rider_name].image_url==='none'))) imgMap[r.rider_name]=r; });
    ridersGrid.innerHTML = favRiders.map(name=>{
      const col=riderColor(name), ini2=riderInitials(name);
      const imgSrc = (imgMap[name]?.image_url && imgMap[name].image_url!=='none') ? imgMap[name].image_url : favRiderImgs[name];
      const hasImg = imgSrc && imgSrc !== 'none';
      return `<div class="fav-rider-slot filled" onclick="navToRider('${name.replace(/'/g,"\\'")}')">
        ${hasImg?`<img class="fav-rider-photo" src="${imgSrc}" onerror="_imgError(this,0)">`:'' }
        <div class="fav-rider-photo-placeholder" style="display:${hasImg?'none':'flex'};background:${col};"><div class="fav-rider-icon" style="background:${col};color:#fff;">${ini2}</div></div>
        <div class="fav-rider-name-overlay">${formatRiderName(name)}</div>
      </div>`;
    }).join('');
  } else {
    ridersGrid.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:12px 0;">No favourite riders set.</div>';
  }

  // ── Favourite race ──────────────────────────────────────────────────
  const favRaceEl=document.getElementById('upage-fav-race-display');
  const favRaceId=p.fav_race_slug, favRaceObj=favRaceId?RACES.find(r=>r.id===favRaceId):null;
  favRaceEl.innerHTML = favRaceObj
    ? `<div class="fav-race-card filled" onclick="navToRace('${favRaceId}',${p.fav_race_year||'null'})" style="cursor:pointer;">
        <div class="fav-race-swatch" style="background:${favRaceObj.gradient||'var(--border)'}"></div>
        <div class="fav-race-info"><div class="fav-race-name">${favRaceObj.name}</div><div class="fav-race-sub">${p.fav_race_year?p.fav_race_year+' edition':''}</div><div style="margin-top:6px;font-size:10px;color:var(--muted);letter-spacing:1px;">★ All-time favourite</div></div>
       </div>`
    : '<div style="color:var(--muted);font-size:12px;padding:12px 0;">No favourite race set.</div>';

  // ── Countries watched ───────────────────────────────────────────────
  const countryCounts={};
  allWithStages.forEach(([id])=>{ const r=RACES.find(x=>x.id===id); if(r&&r.country){ const key=`${r.flag||''} ${r.country}`.trim(); countryCounts[key]=(countryCounts[key]||0)+1; } });
  const sortedC=Object.entries(countryCounts).sort((a,b)=>b[1]-a[1]);
  document.getElementById('upage-countries').innerHTML = sortedC.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">`+sortedC.map(([c,n])=>`<div style="display:flex;align-items:center;gap:6px;background:var(--card-bg);border:1px solid var(--border);padding:5px 10px;font-size:11px;letter-spacing:1px;"><span>${c}</span><span style="color:var(--muted);font-size:10px;">${n}</span></div>`).join('')+'</div>'
    : '<div style="color:var(--muted);font-size:12px;">No races logged yet.</div>';

  // ── Recent activity (races + stages combined) ───────────────────────
  const recent=[...allWithStages].sort((a,b)=>b[1].ts-a[1].ts).slice(0,8);
  document.getElementById('upage-recent-activity').innerHTML = recent.length ? recent.map(([id,w])=>{
    const r=RACES.find(x=>x.id===id)||{name:id,gradient:'var(--border)',flag:'',country:''};
    const dateStr=w.date?fmtDate(w.date):(w.year||'');
    const isStage = w.type==='stage';
    const stageLabel = isStage ? ` · Stage ${w.stageNum}` : '';
    const onclick = isStage ? `openStagePage('${id}',${w.year},${w.stageNum})` : `navToRace('${id}',${w.year})`;
    return `<div class="recent-activity-card" onclick="${onclick}">
      <div class="ra-swatch" style="background:${r.gradient}"></div>
      <div><div class="ra-name">${r.name} <span style="font-weight:400;color:var(--muted);">${w.year}${stageLabel}</span></div>
      <div class="ra-meta">${dateStr}${w.live?' · 🔴 Live':''}${w.rating?' · ★ '+w.rating:''}</div></div>
    </div>`;
  }).join('') : '<div style="color:var(--muted);font-size:12px;">No logged races yet.</div>';

  // ── Recent reviews (races + stages combined) ─────────────────────────
  const withReviews=allWithStages.filter(([,w])=>w.review&&w.review.trim()).sort((a,b)=>b[1].ts-a[1].ts).slice(0,5);
  const upageHandle=p.handle||'user';
  document.getElementById('upage-recent-reviews').innerHTML = withReviews.length ? withReviews.map(([id,w])=>{
    const r=RACES.find(x=>x.id===id)||{name:id};
    const isStage = w.type==='stage';
    const stageLabel = isStage ? ` · Stage ${w.stageNum}` : '';
    // Compute review number: 1-indexed position among all reviews for this race, sorted by ts
    const reviewsForRace = all.filter(([rid,rw])=>rid===id && rw.review && rw.review.trim()).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
    const n = Math.max(1, reviewsForRace.findIndex(([,rw])=>rw.ts===w.ts) + 1);
    return `<div class="review-card" onclick="navToReview('${upageHandle}','${id}',${w.year},${n})">
      <div class="review-race">${r.name} ${w.year}${stageLabel}${w.rating?` · ★ ${w.rating}`:''}</div>
      <div class="review-text">"${w.review.slice(0,220)}${w.review.length>220?'…':''}"</div>
      <div style="font-size:10px;color:var(--muted);margin-top:6px;letter-spacing:.5px;">View review →</div>
    </div>`;
  }).join('') : '<div style="color:var(--muted);font-size:12px;">No reviews yet.</div>';

  _upageLoading = false;
}


// ── User log overlay (called from clickable stats on other user's profile) ──
const _upageStatFns = [];
function _upageStatClick(i){ if(_upageStatFns[i]) _upageStatFns[i](); }

function openUserLog(userId, displayName, logs, filter){
  // Build modal showing this user's log filtered by 'all' or 'live'
  const filtered = filter === 'live' ? logs.filter(l=>l.watched_live) : logs;
  const title = filter === 'live'
    ? `${displayName||'User'}'s Live Races`
    : `${displayName||'User'}'s Race Log`;

  const rows = [...filtered]
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .map(log => {
      const race = RACES.find(r=>r.id===log.slug);
      const name = race?.name || log.slug;
      const stars = log.rating ? `★ ${parseFloat(log.rating).toFixed(1)}` : '';
      const date  = log.date_watched ? log.date_watched.slice(0,10) : '';
      return `<div class="lbi" style="cursor:pointer;" onclick="navToRace('${log.slug}',${log.year||'null'})">
        <div class="lbsw" style="background:${race?.gradient||'var(--border)'}"></div>
        <div class="lbinfo">
          <div class="lbname">${name} <span style="color:var(--muted);font-size:13px;">${log.year||''}</span></div>
          <div class="lbsub">${[date, log.watched_live?'🔴 Live':'', stars].filter(Boolean).join(' · ')}</div>
        </div>
        ${log.rating ? `<div><div class="lbsc">${parseFloat(log.rating).toFixed(1)}</div><div class="lbsc-s">/ 5.0</div></div>` : ''}
      </div>`;
    }).join('');

  // Reuse the search modal as a lightweight overlay
  const mo = document.getElementById('search-mo');
  const inner = document.getElementById('search-results');
  document.getElementById('search-modal-input').style.display = 'none';
  inner.innerHTML = `
    <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:var(--gold);margin-bottom:16px;">${title}</div>
    ${rows || '<div style="color:var(--muted);font-size:13px;">No races found.</div>'}`;
  openMO('search-mo');

  // Restore search input when closed
  mo.addEventListener('click', function restore(e){
    if(e.target===mo){ document.getElementById('search-modal-input').style.display=''; mo.removeEventListener('click',restore); }
  }, {once:true});
}

function sgBadgesHTML(id){
  const race = RACES.find(r => r.id === id);
  const sgs = race?.subgenres || [];
  return sgs.map(sg=>`<span class="sg-badge ${SG_CLASS[sg]||''}">${SG_LABELS[sg]||sg}</span>`).join('');
}
</script>
