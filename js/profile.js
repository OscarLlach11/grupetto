
function renderProfile(){
  const all = allEntries();
  const liveCount = all.filter(([,w])=>w.live).length;
  const rts = all.filter(([,w])=>w.rating).map(([,w])=>w.rating);
  const avg = rts.length ? (rts.reduce((a,b)=>a+b,0)/rts.length).toFixed(1) : '—';
  const stTotal = allStageEntries().length;
  document.getElementById('profile-stat-grid').innerHTML = [
    [all.length,'Races'],
    [liveCount,'Live'],
    [avg,'Avg ★'],
    [stTotal,'Stages'],
    ['…','Followers','followers'],
    ['…','Following','following'],
  ].map(([n,l,action])=>action
    ? `<div class="profile-stat-cell clickable" id="stat-cell-${action}" onclick="openFollowersPage('${action}')"><div class="profile-stat-n" id="stat-${action}">${n}</div><div class="profile-stat-l">${l}</div></div>`
    : `<div class="profile-stat-cell"><div class="profile-stat-n">${n}</div><div class="profile-stat-l">${l}</div></div>`
  ).join('');
  // Load follower counts async
  loadFollowerCounts();

  // Avatar + name
  const initials = (profile.name||'C').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?';
  const avatarEl = document.getElementById('profile-avatar');
  if(profile.avatarUrl){
    avatarEl.innerHTML = `<img src="${profile.avatarUrl}" alt="avatar">`;
  } else {
    avatarEl.textContent = initials;
  }
  document.getElementById('profile-name-display').textContent = (profile.name||'Cyclist').toUpperCase();
  document.getElementById('profile-handle-display').textContent = '@'+(profile.handle||'velocipedist');

  // ── Rating distribution ───────────────────────────────────────────────
  const allRatings = all.filter(([,w])=>w.rating).map(([,w])=>w.rating);
  // Also include stage ratings
  Object.values(userLog).forEach(rl=>(rl.watches||[]).forEach(w=>Object.values(w.stages||{}).forEach(s=>{if(s.rating) allRatings.push(s.rating);})));
  const distEl = document.getElementById('profile-rating-dist');
  if(allRatings.length){
    const buckets={};
    for(let v=0.5;v<=5.0;v+=0.5) buckets[v.toFixed(1)]=0;
    allRatings.forEach(r=>{ const k=(Math.round(r*2)/2).toFixed(1); if(buckets[k]!==undefined) buckets[k]++; });
    const maxCnt=Math.max(...Object.values(buckets),1);
    const BAR_MAX_H = 52;
    const entries = Object.entries(buckets);
    const barsRow = entries.map(([v,cnt])=>{
      const barH = maxCnt>0 ? Math.max(Math.round(cnt/maxCnt*BAR_MAX_H), cnt>0?2:0) : 0;
      const rating = parseFloat(v);
      const tooltip = cnt>0 ? `${cnt} race${cnt!==1?'s':''} rated ★${rating}` : '';
      const clickable = cnt>0 ? `onclick="filterByRating(${rating})" style="flex:1;height:${BAR_MAX_H}px;display:flex;align-items:flex-end;cursor:pointer;position:relative;" title="${tooltip}"` : `style="flex:1;height:${BAR_MAX_H}px;display:flex;align-items:flex-end;position:relative;"`;
      return `<div ${clickable}
        ${cnt>0 ? `onmouseover="this.querySelector('.dist-bar').style.background='var(--gold-dim)';this.querySelector('.dist-tip').style.opacity='1'"
                   onmouseout="this.querySelector('.dist-bar').style.background='${cnt>0?'var(--gold)':'var(--border)'}'  ;this.querySelector('.dist-tip').style.opacity='0'"` : ''}>
        <div class="dist-bar" style="width:100%;height:${barH}px;background:${cnt>0?'var(--gold)':'var(--border)'};border-radius:2px 2px 0 0;transition:background .15s;"></div>
        ${cnt>0 ? `<div class="dist-tip" style="opacity:0;transition:opacity .15s;position:absolute;bottom:${barH+4}px;left:50%;transform:translateX(-50%);background:var(--card-bg);border:1px solid var(--border);padding:3px 7px;font-size:9px;white-space:nowrap;pointer-events:none;color:var(--gold);letter-spacing:.5px;">${cnt}</div>` : ''}
      </div>`;
    }).join('');
    const labelsRow = entries.map(([v])=>
      `<div style="flex:1;text-align:center;font-size:8px;color:var(--muted);line-height:1;">${parseFloat(v)%1===0?parseFloat(v):''}</div>`
    ).join('');
    distEl.innerHTML=`
      <div style="display:flex;align-items:flex-end;gap:2px;">${barsRow}</div>
      <div style="display:flex;gap:2px;margin-top:3px;">${labelsRow}</div>`;
  } else {
    distEl.innerHTML='<div style="color:var(--muted);font-size:11px;">Rate some races to see your distribution.</div>';
  }

  // ── Yearly stats ─────────────────────────────────────────────────────
  const byYear={};
  all.forEach(([id,w])=>{
    const yr=w.year; if(!yr) return;
    if(!byYear[yr]) byYear[yr]={cnt:0,live:0,rts:[],races:new Set()};
    byYear[yr].cnt++;
    if(w.live) byYear[yr].live++;
    if(w.rating) byYear[yr].rts.push(w.rating);
    byYear[yr].races.add(id);
  });
  const yrEl = document.getElementById('profile-yearly-stats');
  const yrKeys = Object.keys(byYear).sort((a,b)=>b-a);
  if(yrKeys.length){
    yrEl.innerHTML = yrKeys.map(yr=>{
      const d=byYear[yr];
      const yrAvg=d.rts.length?(d.rts.reduce((a,b)=>a+b,0)/d.rts.length).toFixed(1):'—';
      const uid=`yr-${yr}`;
      return `<div class="yr-row" onclick="toggleYearDetail('${uid}')">
        <div class="yr-num">${yr}</div>
        <div style="flex:1;font-size:12px;color:var(--muted);">${d.cnt} edition${d.cnt!==1?'s':''} · ★ ${yrAvg}</div>
        <div style="font-size:12px;color:var(--muted);">▸</div>
      </div>
      <div class="yr-detail" id="${uid}">
        <div>Races watched: <strong>${d.cnt}</strong></div>
        <div>Watched live: <strong>${d.live}</strong></div>
        <div>Distinct races: <strong>${d.races.size}</strong></div>
        <div>Avg rating: <strong>${yrAvg}</strong></div>
      </div>`;
    }).join('');
  } else {
    yrEl.innerHTML='<div style="color:var(--muted);font-size:11px;">No races logged yet.</div>';
  }

  // ── Favourite riders grid ─────────────────────────────────────────────
  const grid = document.getElementById('fav-riders-grid');
  if(!Array.isArray(profile.favRiders) || profile.favRiders.length < 4){
    profile.favRiders = [null,null,null,null];
  }
  grid.innerHTML = profile.favRiders.map((rider, i) => {
    if(rider){
      const name = rider.name || rider;
      const imgSrc = rider.imageUrl && rider.imageUrl !== 'none' ? rider.imageUrl : null;
      const col = riderColor(name);
      const ini = riderInitials(name);
      const photoHtml = imgSrc
        ? `<img class="fav-rider-photo" src="${imgSrc}" alt="${name}"
             onerror="_imgError(this,0)">
           <div class="fav-rider-photo-placeholder" style="display:none;">
             <div class="fav-rider-icon" style="background:${col};color:#fff;">${ini}</div>
           </div>`
        : `<div class="fav-rider-photo-placeholder">
             <div class="fav-rider-icon" style="background:${col};color:#fff;">${ini}</div>
           </div>`;
      const editOverlay = profileEditMode ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;opacity:0;transition:opacity .15s;" class="edit-overlay">✏️</div>` : '';
      const clickAction = profileEditMode ? `openRiderPicker(${i})` : `navToRider(decodeURIComponent(this.dataset.rider))`;
      const title = profileEditMode ? 'Change rider' : formatRiderName(name);
      return `<div class="fav-rider-slot filled" data-rider="${encodeURIComponent(name)}" onclick="${clickAction}" title="${title}" style="position:relative;"
        ${profileEditMode ? 'onmouseover="this.querySelector(\'.edit-overlay\').style.opacity=1" onmouseout="this.querySelector(\'.edit-overlay\').style.opacity=0"' : ''}>
        ${photoHtml}
        ${editOverlay}
        <div class="fav-rider-name-overlay">${profileEditMode ? '✏ ' : ''}${formatRiderName(name)}</div>
      </div>`;
    }
    if(profileEditMode){
      return `<div class="fav-rider-slot" onclick="openRiderPicker(${i})">
        <div style="font-size:22px;color:var(--border-light);">+</div>
        <div class="fav-rider-name" style="color:var(--muted);">Rider ${i+1}</div>
      </div>`;
    }
    return `<div class="fav-rider-slot" style="cursor:default;border-color:var(--border);">
      <div style="font-size:22px;color:var(--border);">—</div>
    </div>`;
  }).join('');
  // Preload rider page data for all set fav riders
  _preloadRiderNames(profile.favRiders);

  // ── Favourite race ────────────────────────────────────────────────────
  const favRaceEl = document.getElementById('fav-race-display');
  if(profile.favRace){
    const fr = profile.favRace;
    const race = RACES.find(x=>x.id===fr.id);
    const label = fr.stageNum ? `Stage ${fr.stageNum}, ${fr.year} edition` : `${fr.year} edition`;
    favRaceEl.innerHTML = `<div class="fav-race-card filled" onclick="navToRace('${fr.id}', ${fr.year})" style="cursor:pointer;">
      <div class="fav-race-swatch" style="background:${race?race.gradient:'var(--border)'}"></div>
      <div class="fav-race-info">
        <div class="fav-race-name">${race?race.name:'Unknown race'}</div>
        <div class="fav-race-sub">${label}</div>
        <div style="margin-top:6px;font-size:10px;color:var(--muted);letter-spacing:1px;">★ All-time favourite</div>
      </div>
    </div>`;
  } else {
    favRaceEl.innerHTML = `<div class="fav-race-card" style="cursor:default;border-style:dashed;">
      <div class="fav-race-swatch" style="background:var(--border);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--border-light);">★</div>
      <div class="fav-race-info">
        <div class="fav-race-empty" style="color:var(--muted);">Set your all-time favourite in Edit Profile</div>
      </div>
    </div>`;
  }

  // ── Recent Activity (5 most recent — race logs + stage logs combined) ──
  const raceItems = all.map(([id,w])=>({type:'race', id, w, ts:w.ts||0}));
  const stageItems = allStageEntries().map(e=>({
    type:'stage', id:e.raceId, year:e.year, stageNum:e.stageNum,
    stageLog:e.stageLog, ts:e.stageLog.ts||0
  }));
  const recent = [...raceItems, ...stageItems].sort((a,b)=>b.ts-a.ts).slice(0,5);
  const raEl = document.getElementById('profile-recent-activity');
  if(recent.length){
    raEl.innerHTML = recent.map(item=>{
      const r=RACES.find(x=>x.id===item.id)||{name:item.id,gradient:'var(--border)',flag:'',country:''};
      if(item.type==='stage'){
        const sl = item.stageLog;
        const stLabel = item.stageNum===0?'Prologue':`Stage ${sl.stageLabel||item.stageNum}`;
        const dateStr = sl.date ? fmtDate(sl.date) : (item.year||'');
        return `<div class="recent-activity-card" onclick="openStagePage('${item.id}',${item.year},${item.stageNum})">
          <div class="ra-swatch" style="background:${r.gradient}"></div>
          <div>
            <div class="ra-name">${r.name} <span style="font-weight:400;color:var(--muted);">${item.year} · ${stLabel}</span></div>
            <div class="ra-meta">${dateStr}${sl.live?' · 🔴 Live':''}${sl.rating?' · ★ '+sl.rating:''}</div>
          </div>
        </div>`;
      } else {
        const w = item.w;
        const dateStr = w.date ? fmtDate(w.date) : (w.year||'');
        return `<div class="recent-activity-card" onclick="navToRace('${item.id}',${w.year||'null'})">
          <div class="ra-swatch" style="background:${r.gradient}"></div>
          <div>
            <div class="ra-name">${r.name} <span style="font-weight:400;color:var(--muted);">${w.year}</span></div>
            <div class="ra-meta">${dateStr}${w.live?' · 🔴 Live':''}${w.rating?' · ★ '+w.rating:''}</div>
          </div>
        </div>`;
      }
    }).join('');
  } else {
    raEl.innerHTML='<div style="color:var(--muted);font-size:12px;">No logged races yet.</div>';
  }

  // ── Countries watched ─────────────────────────────────────────────────
  const countriesEl = document.getElementById('profile-countries');
  const countryCounts = {};
  all.forEach(([id]) => {
    const r = RACES.find(x => x.id === id);
    if (r && r.country) {
      const key = `${r.flag||''} ${r.country}`.trim();
      countryCounts[key] = (countryCounts[key] || 0) + 1;
    }
  });
  const sortedCountries = Object.entries(countryCounts).sort((a,b) => b[1]-a[1]);
  if (sortedCountries.length) {
    countriesEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;">` +
      sortedCountries.map(([country, cnt]) =>
        `<div data-country="${encodeURIComponent(country)}" onclick="filterByCountry(decodeURIComponent(this.dataset.country))"
              style="display:flex;align-items:center;gap:6px;background:var(--card-bg);cursor:pointer;
                     border:1px solid var(--border);padding:5px 10px;font-size:11px;letter-spacing:1px;
                     transition:border-color .15s,color .15s;"
              onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
              onmouseout="this.style.borderColor='var(--border)';this.style.color=''">
          <span>${country}</span>
          <span style="color:var(--muted);font-size:10px;">${cnt}</span>
        </div>`
      ).join('') + `</div>`;
  } else {
    countriesEl.innerHTML = '<div style="color:var(--muted);font-size:12px;">Log some races to see countries.</div>';
  }

  // ── Recent Reviews (5 most recent with a review) ──────────────────────
  const withReviews = all
    .filter(([,w])=>w.review&&w.review.trim())
    .map(([id,w])=>({id,w,ts:w.ts||0}))
    .sort((a,b)=>b.ts-a.ts)
    .slice(0,5);
  const revEl = document.getElementById('profile-recent-reviews');
  if(withReviews.length){
    const userHandle = profile.handle || 'user';
    revEl.innerHTML=withReviews.map(({id,w})=>{
      const r=RACES.find(x=>x.id===id)||{name:id};
      const rating = w.rating||null;
      // Find which review number this is (1-indexed among reviews for this race)
      const allReviewsForRace = (userLog[id]?.watches||[]).filter(x=>x.review&&x.review.trim()).sort((a,b)=>(a.ts||0)-(b.ts||0));
      const n = allReviewsForRace.findIndex(x=>x.ts===w.ts)+1 || 1;
      return `<div class="review-card" onclick="navToReview('${userHandle}','${id}',${w.year},${n})">
        <div class="review-race">${r.name} ${w.year}${rating?` · ★ ${rating}`:''}</div>
        <div class="review-text">"${w.review.slice(0,220)}${w.review.length>220?'…':''}"</div>
        <div style="font-size:10px;color:var(--muted);margin-top:6px;letter-spacing:.5px;">View review →</div>
      </div>`;
    }).join('');
  } else {
    revEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Write a review when logging a race — it will appear here.</div>';
  }
}

function toggleYearDetail(uid){
  const el=document.getElementById(uid);
  if(!el) return;
  el.style.display = el.style.display==='block' ? 'none' : 'block';
}


// ── Edit profile (name / handle) ──
let profileEditMode = false;

function openEditProfile(){
  document.getElementById('ep-name').value = profile.name||'';
  renderEPRiders();
  renderEPFavRace();
  profileEditMode = true;
  renderProfile();
  openMO('edit-profile-mo');
}

function renderEPRiders(){
  const grid = document.getElementById('ep-riders-grid');
  if(!grid) return;
  if(!Array.isArray(profile.favRiders) || profile.favRiders.length < 4) profile.favRiders = [null,null,null,null];
  grid.innerHTML = profile.favRiders.map((rider, i) => {
    if(rider){
      const name = rider.name || rider;
      const imgSrc = rider.imageUrl && rider.imageUrl !== 'none' ? rider.imageUrl : null;
      const col = riderColor(name); const ini = riderInitials(name);
      const photo = imgSrc
        ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;object-position:center top;" onerror="_imgError(this,0)"><div style="display:none;width:100%;height:100%;background:${col};align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:18px;color:#fff;">${ini}</div>`
        : `<div style="width:100%;height:100%;background:${col};display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:18px;color:#fff;">${ini}</div>`;
      return `<div onclick="openRiderPicker(${i})" style="width:90px;aspect-ratio:2/3;position:relative;cursor:pointer;border:1px solid var(--border-light);overflow:hidden;flex-shrink:0;" title="Change rider">
        ${photo}
        <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);padding:4px 5px;font-size:8px;letter-spacing:0.5px;text-transform:uppercase;line-height:1.2;">${formatRiderName(name)}</div>
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;font-size:16px;opacity:0;transition:all .15s;" onmouseover="this.style.background='rgba(0,0,0,0.5)';this.style.opacity=1" onmouseout="this.style.background='rgba(0,0,0,0)';this.style.opacity=0">✏️</div>
      </div>`;
    }
    return `<div onclick="openRiderPicker(${i})" style="width:90px;aspect-ratio:2/3;background:var(--card-bg);border:1px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;gap:6px;flex-shrink:0;">
      <div style="font-size:20px;color:var(--border-light);">+</div>
      <div style="font-size:8px;color:var(--muted);letter-spacing:1px;">RIDER ${i+1}</div>
    </div>`;
  }).join('');
}

function renderEPFavRace(){
  const el = document.getElementById('ep-fav-race-display');
  if(!el) return;
  if(profile.favRace){
    const fr = profile.favRace;
    const race = RACES.find(x=>x.id===fr.id);
    el.innerHTML = `<div onclick="openFavRacePicker()" style="display:flex;align-items:center;gap:14px;padding:12px;background:var(--card-bg);border:1px solid var(--border-light);cursor:pointer;">
      <div style="width:40px;height:40px;background:${race?race.gradient:'var(--border)'};flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-size:12px;letter-spacing:1px;">${race?race.name:'Unknown'}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;">${fr.year}${fr.stageNum?' · Stage '+fr.stageNum:''}</div>
      </div>
      <div style="font-size:10px;color:var(--muted);">Change ›</div>
    </div>`;
  } else {
    el.innerHTML = `<div onclick="openFavRacePicker()" style="padding:12px;background:var(--card-bg);border:1px dashed var(--border);cursor:pointer;text-align:center;color:var(--muted);font-size:11px;letter-spacing:1px;">+ Choose Favourite Race</div>`;
  }
}

function saveProfile(){
  const n = document.getElementById('ep-name').value.trim();
  if(n) profile.name = n;
  // handle is never changed — it's set from user_id on signup
  persistProfile();
  if(currentUser) saveProfileToSupabase();
  closeMO('edit-profile-mo');
  profileEditMode = false;
  renderProfile();
  toast('Profile saved');
}

// ── Rider picker ──
let _riderSlot = 0;
let _riderPickerDebounce = null;

function openRiderPicker(slotIdx){
  _riderSlot = slotIdx;
  const input = document.getElementById('rider-picker-search');
  const el = document.getElementById('rider-picker-list');
  input.value = '';
  el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0;">Type a name to search riders…</div>';
  openMO('rider-picker-mo');
  setTimeout(()=>input.focus(), 80);
}

async function searchRidersFromSupabase(q){
  const el = document.getElementById('rider-picker-list'); if(!el) return;
  if(!q || q.length < 2){
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0;">Type at least 2 characters…</div>';
    return;
  }
  el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0;">Searching…</div>';

  const qLower = q.toLowerCase();
  const qWords = q.trim().split(/\s+/).filter(Boolean);
  const qWordsLower = qWords.map(w => w.toLowerCase());

  // Anchor: longer words only (≥4 chars) — short particles like "van"/"den" match too many rows
  const anchorWords = qWords.filter(w => w.length >= 4);
  const queryWords  = anchorWords.length > 0 ? anchorWords : [qWords.reduce((a,b) => a.length >= b.length ? a : b)];

  const anchorRows = await Promise.all(
    queryWords.map(word =>
      sb.from('startlists')
        .select('rider_name, team_name, nationality, rider_url, image_url')
        .ilike('rider_name', `%${word}%`)
        .order('rider_name').limit(400)
        .then(res => res.data || [])
    )
  );
  const anchorSets = anchorRows.map(rows => new Set(rows.map(r => r.rider_name.toLowerCase())));
  const fromAnchors = anchorSets.reduce((acc, s) => new Set([...acc].filter(x => s.has(x))));

  // DB-format variant queries — exhaustive split-point permutations
  const dbVariants = _queryToDbVariants(q);
  const variantRows = (await Promise.all(
    dbVariants.map(v =>
      sb.from('startlists')
        .select('rider_name, team_name, nationality, rider_url, image_url')
        .ilike('rider_name', `%${v}%`)
        .order('rider_name').limit(50)
        .then(res => res.data || [])
    )
  )).flat();

  const candidateNames = new Set([
    ...fromAnchors,
    ...variantRows.map(r => r.rider_name.toLowerCase())
  ]);

  const allRows = [...anchorRows.flat(), ...variantRows];
  const seen = new Map();
  allRows.forEach(r => {
    const key = r.rider_name.toLowerCase();
    if(!candidateNames.has(key)) return;
    if(!seen.has(key)) seen.set(key, r);
  });

  // Post-filter: ALL query words must appear in raw DB name (catches short words like "van")
  let unique = Array.from(seen.values()).filter(r => {
    const dbLower = r.rider_name.toLowerCase();
    return qWordsLower.every(w => dbLower.includes(w));
  });

  // Sort: display name starts with query first, then alphabetical
  unique.sort((a, b) => {
    const da = _parseRiderName(a.rider_name).display.toLowerCase();
    const db_ = _parseRiderName(b.rider_name).display.toLowerCase();
    const aS = da.startsWith(qLower) ? 0 : 1;
    const bS = db_.startsWith(qLower) ? 0 : 1;
    if(aS !== bS) return aS - bS;
    return da.localeCompare(db_);
  });

  if(!unique.length){ el.innerHTML='<div style="color:var(--muted);font-size:12px;padding:10px 0;">No riders found.</div>'; return; }

  window._riderPickerFiltered = unique.map(r => ({name: r.rider_name, url: r.rider_url, imageUrl: r.image_url}));

  el.innerHTML = unique.map((r, idx) => {
    const col = riderColor(r.rider_name);
    const ini = riderInitials(r.rider_name);
    const isCur = (profile.favRiders||[]).some(fr => fr && (fr.name||fr) === r.rider_name);
    const imgSrc = r.image_url && r.image_url !== 'none' ? r.image_url : null;
    const meta = [r.team_name, r.nationality].filter(Boolean).join(' · ');
    const thumb = imgSrc
      ? `<img src="${imgSrc}" style="width:36px;height:36px;object-fit:cover;object-position:top;border-radius:2px;flex-shrink:0;"
           onerror="_imgError(this,0)">`
        + `<div class="picker-item-icon" style="background:${col};color:#fff;display:none;">${ini}</div>`
      : `<div class="picker-item-icon" style="background:${col};color:#fff;">${ini}</div>`;
    return '<div class="picker-item" onclick="selectFavRiderByIdx('+idx+')">'
      + thumb
      +'<div style="flex:1;">'
      +'<div class="picker-item-name">'+formatRiderName(r.rider_name)+'</div>'
      +'<div class="picker-item-meta">'+meta+'</div>'
      +'</div>'
      +(isCur?'<span class="picker-selected-badge">Selected</span>':'')
      +'</div>';
  }).join('');
}

function onRiderPickerSearch(q){
  clearTimeout(_riderPickerDebounce);
  _riderPickerDebounce = setTimeout(()=>searchRidersFromSupabase(q), 250);
}

function selectFavRiderByIdx(idx){
  const rider = window._riderPickerFiltered && window._riderPickerFiltered[idx];
  if(rider) selectFavRider(rider);
}

function selectFavRider(rider){
  if(!profile.favRiders) profile.favRiders=[null,null,null,null];
  profile.favRiders[_riderSlot] = typeof rider === 'string'
    ? {name: rider, url: null, imageUrl: null}
    : rider;
  persistProfile();
  if(currentUser) saveProfileToSupabase();
  closeMO('rider-picker-mo');
  // Re-render EP modal grid if open, otherwise re-render profile
  if(document.getElementById('edit-profile-mo').classList.contains('open')){
    renderEPRiders();
  } else {
    renderProfile();
  }
  const name = rider.name || rider;
  toast(`${name} added to favourites`);
}

// ── Favourite race picker ──
// Builds a flat list of all possible favourite race options:
// every year of every race in the DB, plus individual stages for GT/stage races
function buildRacePickerOptions(){
  const opts = [];
  RACES.forEach(r => {
    const years = availYears(r.id);
    years.forEach(y => {
      // Whole race option
      opts.push({id:r.id, year:y, stageNum:null, label:`${r.name} — ${y}`, sublabel:r.type+' · '+r.flag+' '+r.country, gradient:r.gradient});
      // Stage options for stage races / GTs
      const stages = buildStages(r.id, y);
      if(stages){
        stages.forEach(s => {
          if(s.date <= TODAY){
            opts.push({id:r.id, year:y, stageNum:s.num, label:`${r.name} — Stage ${s.num}, ${y}`, sublabel:`${fmtDate(s.date)} · ${r.flag} ${r.country}`, gradient:r.gradient});
          }
        });
      }
    });
  });
  return opts;
}
let _racePickerOpts = null;
function openFavRacePicker(){
  if(!_racePickerOpts) _racePickerOpts = buildRacePickerOptions();
  document.getElementById('race-picker-search').value = '';
  renderRacePickerList('');
  openMO('race-picker-mo');
  setTimeout(()=>document.getElementById('race-picker-search').focus(), 80);
}
function renderRacePickerList(q){
  const el = document.getElementById('race-picker-list'); if(!el) return;
  if(!_racePickerOpts) _racePickerOpts = buildRacePickerOptions();
  const ql = q.toLowerCase().trim();
  const filtered = ql ? _racePickerOpts.filter(o=>o.label.toLowerCase().includes(ql)) : _racePickerOpts;
  if(!filtered.length){ el.innerHTML='<div style="color:var(--muted);font-size:12px;padding:10px 0;">No matches.</div>'; return; }
  el.innerHTML = filtered.slice(0,60).map(o => {
    const isCur = profile.favRace && profile.favRace.id===o.id && profile.favRace.year===o.year && profile.favRace.stageNum===o.stageNum;
    return `<div class="picker-item" onclick="selectFavRace('${o.id}',${o.year},${o.stageNum===null?'null':o.stageNum})">
      <div style="width:36px;height:36px;flex-shrink:0;background:${o.gradient};"></div>
      <div style="flex:1;">
        <div class="picker-item-name">${o.label}</div>
        <div class="picker-item-meta">${o.sublabel}</div>
      </div>
      ${isCur?'<span class="picker-selected-badge">★</span>':''}
    </div>`;
  }).join('');
}
function selectFavRace(id, year, stageNum){
  profile.favRace = {id, year, stageNum: stageNum===null||stageNum==='null'?null:parseInt(stageNum)};
  persistProfile();
  if(currentUser) saveProfileToSupabase();
  closeMO('race-picker-mo');
  if(document.getElementById('edit-profile-mo').classList.contains('open')){
    renderEPFavRace();
  } else {
    renderProfile();
  }
  const r = RACES.find(x=>x.id===id);
  toast(`${r?r.name:'Race'} ${year} set as favourite`);
}

function triggerAvatarUpload(){
  if(!currentUser){ toast('Sign in to upload a photo'); return; }
  document.getElementById('avatar-file-input').click();
}

async function handleAvatarUpload(event){
  const file = event.target.files[0];
  if(!file) return;
  if(file.size > 2*1024*1024){ toast('Image must be under 2MB'); return; }
  toast('Uploading…');
  const ext = file.name.split('.').pop();
  const path = `avatars/${currentUser.id}.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if(error){ toast('Upload failed: ' + error.message); return; }
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  profile.avatarUrl = data.publicUrl + '?t=' + Date.now();
  persistProfile();
  await saveProfileToSupabase();
  renderProfile();
  toast('Photo updated!');
  event.target.value = '';
}

function editUsername(){ openEditProfile(); }

// ════════════════════════════════════════════════════════
//  HASH ROUTING
// ════════════════════════════════════════════════════════
