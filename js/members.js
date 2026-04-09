async function renderMembersPage(){
  document.getElementById('members-search-input').value = '';
  document.getElementById('members-search-results').style.display = 'none';
  document.getElementById('members-grid').style.display = 'grid';
  document.getElementById('members-section-label').textContent = 'Popular This Week';

  const grid = document.getElementById('members-grid');

  // 1. In-memory cache — instant
  if(_membersCache){
    renderMemberCards(_membersCache);
    return;
  }

  // 2. localStorage cache — fast, stale-while-revalidate
  const lsCached = cacheGet('members');
  if(lsCached){
    _membersCache = lsCached;
    renderMemberCards(lsCached);
    // Revalidate silently in background
    _fetchMembers().then(async fresh => {
      if(fresh){
        _membersCache = fresh; // rider images already included by _fetchMembers
        cacheSet('members', enriched, 15);
        renderMemberCards(enriched);
      }
    });
    return;
  }

  // 3. No cache — show skeletons, then fetch
  grid.innerHTML = Array(5).fill(0).map(()=>`
    <div class="member-card" style="pointer-events:none;">
      <div class="skeleton" style="width:96px;height:96px;border-radius:50%;margin:0 auto 14px;"></div>
      <div class="skeleton" style="width:70%;height:14px;margin:0 auto 8px;border-radius:3px;"></div>
      <div class="skeleton" style="width:50%;height:10px;margin:0 auto 18px;border-radius:3px;"></div>
      <div class="skeleton" style="width:100%;height:30px;border-radius:3px;margin-bottom:14px;"></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;">
        ${Array(4).fill('<div class="skeleton" style="aspect-ratio:2/3;border-radius:2px;"></div>').join('')}
      </div>
    </div>`).join('');

  const sorted = await _fetchMembers();
  if(!sorted){
    grid.innerHTML = '<div style="color:var(--muted);font-size:12px;grid-column:1/-1;">No members found. Make sure the profiles table has a public SELECT policy in Supabase.</div>';
    return;
  }
  _membersCache = sorted; // rider images already included by _fetchMembers
  cacheSet('members', _membersCache, 15);
  renderMemberCards(_membersCache);
}

async function _fetchMembers(){
  // Fire profiles + follow counts in parallel
  const [{ data: profiles, error: profErr }, { data: followCounts }] = await Promise.all([
    sb.from('profiles').select('user_id,display_name,handle,avatar_url,fav_riders').not('display_name', 'is', null).limit(20),
    sb.from('follows').select('following_id').limit(5000),
  ]);
  if(profErr) console.error('profiles fetch error:', profErr.message, profErr.code);
  if(!profiles?.length) return null;

  let sorted;
  if(followCounts?.length){
    const counts = {};
    followCounts.forEach(r => { counts[r.following_id] = (counts[r.following_id]||0) + 1; });
    sorted = profiles
      .map(p => ({ ...p, followerCount: counts[p.user_id] || 0 }))
      .sort((a, b) => b.followerCount - a.followerCount)
      .slice(0, 5);
  } else {
    sorted = profiles.slice(0, 5).map(p => ({ ...p, followerCount: null }));
  }

  // Extract all fav_rider names from the top 5 results
  const getRiderName = r => (r && typeof r === 'object') ? (r.name||'') : (r||'');
  const allRiderNames = [...new Set(
    sorted.flatMap(m => (m.fav_riders||[]).map(getRiderName).filter(Boolean))
  )];

  // Fetch rider images in parallel with nothing (we already have profiles) — no extra wait
  if(allRiderNames.length){
    const { data: batchRows } = await sb.from('startlists')
      .select('rider_name,image_url,year')
      .in('rider_name', allRiderNames)
      .order('year', {ascending:false})
      .limit(500);
    const riderImgMap = {};
    (batchRows||[]).forEach(r => {
      const hasImg = r.image_url && r.image_url !== 'none';
      const key = r.rider_name.toLowerCase();
      const prev = riderImgMap[key];
      if(!prev || (hasImg && (!prev.image_url || prev.image_url === 'none'))) riderImgMap[key] = r;
    });
    // ilike fallback for accented names
    const missed = allRiderNames.filter(n => !riderImgMap[n.toLowerCase()]);
    if(missed.length){
      await Promise.all(missed.map(async name => {
        const { data: rows } = await sb.from('startlists')
          .select('rider_name,image_url,year').ilike('rider_name', name)
          .order('year', {ascending:false}).limit(10);
        (rows||[]).forEach(r => {
          const hasImg = r.image_url && r.image_url !== 'none';
          const key = r.rider_name.toLowerCase();
          const prev = riderImgMap[key];
          if(!prev || (hasImg && (!prev.image_url || prev.image_url === 'none'))) riderImgMap[key] = r;
        });
      }));
    }
    // Attach image URLs in ridersWithImages format expected by renderMemberCards
    sorted = sorted.map(m => ({
      ...m,
      ridersWithImages: (m.fav_riders||[]).map(getRiderName).filter(Boolean).map(name => ({
        name,
        image_url: riderImgMap[name.toLowerCase()]?.image_url || null,
      }))
    }));
  }

  return sorted;
}

async function enrichMembersWithRiderImages(members){
  // fav_riders can be objects {name, url, imageUrl} or plain strings
  const getRiderName = r => (r && typeof r === 'object') ? (r.name||'') : (r||'');

  const allRiderNames = [...new Set(
    members.flatMap(m => (m.fav_riders||[]).map(getRiderName).filter(Boolean))
  )];
  if(!allRiderNames.length) return members;

  // Batch all rider lookups in ONE query using .in() on normalised names,
  // then fall back to per-rider ilike only for names that returned no result.
  const riderImgMap = {};
  const { data: batchRows } = await sb.from('startlists')
    .select('rider_name,image_url,year')
    .in('rider_name', allRiderNames)
    .order('year', {ascending:false})
    .limit(500);
  (batchRows||[]).forEach(r => {
    const hasImg = r.image_url && r.image_url !== 'none';
    const key = r.rider_name.toLowerCase();
    const prev = riderImgMap[key];
    if(!prev || (hasImg && (!prev.image_url || prev.image_url === 'none')))
      riderImgMap[key] = r;
  });
  // For any names not matched by .in() (e.g. accented chars), fall back to ilike
  const missed = allRiderNames.filter(n => !riderImgMap[n.toLowerCase()]);
  if(missed.length){
    await Promise.all(missed.map(async name => {
      const { data: rows } = await sb.from('startlists')
        .select('rider_name,image_url,year')
        .ilike('rider_name', name)
        .order('year', {ascending:false})
        .limit(10);
      (rows||[]).forEach(r => {
        const hasImg = r.image_url && r.image_url !== 'none';
        const key = r.rider_name.toLowerCase();
        const prev = riderImgMap[key];
        if(!prev || (hasImg && (!prev.image_url || prev.image_url === 'none')))
          riderImgMap[key] = r;
      });
    }));
  }

  return members.map(m => ({
    ...m,
    ridersWithImages: (m.fav_riders||[]).map(getRiderName).filter(Boolean).map(name => ({
      name,
      image_url: riderImgMap[name.toLowerCase()]?.image_url || null,
    }))
  }));
}

function renderMemberCards(members){
  const grid = document.getElementById('members-grid');
  if(!members?.length){
    grid.innerHTML = '<div style="color:var(--muted);font-size:12px;grid-column:1/-1;">No members found.</div>';
    return;
  }
  if(!_followingIds.size && currentUser) loadFollowingIds();

  grid.innerHTML = members.map(m => {
    const ini = (m.display_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    const avatarHTML = m.avatar_url
      ? `<img src="${m.avatar_url}" alt="${m.display_name||''}">`
      : ini;
    const followerLine = m.followerCount != null
      ? `<div style="font-size:10px;color:var(--muted);margin-bottom:12px;">${m.followerCount} follower${m.followerCount!==1?'s':''}</div>`
      : '';
    const isFollowing = _followingIds.has(m.user_id);
    const isMe = currentUser && m.user_id === currentUser.id;
    const followBtn = !isMe
      ? `<button id="follow-btn-${m.user_id}" class="follow-btn ${isFollowing?'following':'follow'}"
           onclick="event.stopPropagation();toggleFollow('${m.user_id}')"
           style="width:100%;margin-bottom:14px;">${isFollowing?'Following':'Follow'}</button>`
      : '<div style="height:30px;margin-bottom:14px;"></div>';

    // Up to 4 fav riders
    const riders = (m.ridersWithImages||[]).slice(0,4);
    const riderSlots = riders.map(r => {
      const col = riderColor(r.name);
      const ini2 = riderInitials(r.name);
      const img = r.image_url && r.image_url !== 'none'
        ? `<img src="${r.image_url}" style="width:100%;height:100%;object-fit:cover;object-position:center top;" onerror="_imgError(this,0)">`
          + `<div class="member-rider-initials" style="display:none;background:${col};">${ini2}</div>`
        : `<div class="member-rider-initials" style="background:${col};">${ini2}</div>`;
      const encodedName = encodeURIComponent(r.name);
      return `<div class="member-rider-slot" title="${formatRiderName(r.name)}"
        onclick="event.stopPropagation();navToRider(decodeURIComponent('${encodedName}'))">${img}</div>`;
    }).join('');
    // Fill empty slots
    const emptySlots = Array(Math.max(0,4-riders.length)).fill(
      `<div class="member-rider-slot" style="background:var(--border);opacity:.3;"></div>`
    ).join('');

    return `<div class="member-card" onclick="openUserPage('${m.user_id}')">
      <div class="member-avatar-lg" onclick="event.stopPropagation();openUserPage('${m.user_id}')">${avatarHTML}</div>
      <div class="member-name" onclick="event.stopPropagation();openUserPage('${m.user_id}')">${(m.display_name||'Cyclist').toUpperCase()}</div>
      <div class="member-handle">@${m.handle||'cyclist'}</div>
      ${followerLine}
      ${followBtn}
      <div class="member-fav-riders">${riderSlots}${emptySlots}</div>
    </div>`;
  }).join('');
}

async function executeMembersSearch(){
  const q = (document.getElementById('members-search-input')?.value||'').trim();
  const resultsSection = document.getElementById('members-search-results');
  const resultsList = document.getElementById('members-results-list');
  const resultsLabel = document.getElementById('members-results-label');
  if(!q){ renderMembersPage(); return; }

  document.getElementById('members-grid').style.display = 'none';
  resultsSection.style.display = 'block';
  resultsList.innerHTML = '<div style="color:var(--muted);font-size:12px;">Searching…</div>';

  // Run two queries and merge — .or() with ilike has quoting issues in supabase-js
  const [byName, byHandle] = await Promise.all([
    sb.from('profiles').select('user_id,display_name,handle,avatar_url')
      .ilike('display_name', `%${q}%`).limit(20),
    sb.from('profiles').select('user_id,display_name,handle,avatar_url')
      .ilike('handle', `%${q}%`).limit(20),
  ]);

  // Deduplicate by user_id
  const seen = new Set();
  const data = [...(byName.data||[]), ...(byHandle.data||[])].filter(p => {
    if(seen.has(p.user_id)) return false;
    seen.add(p.user_id); return true;
  });

  if(!data.length){
    resultsList.innerHTML = '<div style="color:var(--muted);font-size:13px;font-style:italic;">No members found.</div>';
    resultsLabel.textContent = '0 results';
    return;
  }

  resultsLabel.textContent = `${data.length} result${data.length!==1?'s':''}`;
  if(!_followingIds.size && currentUser) await loadFollowingIds();

  resultsList.innerHTML = data.map(p => {
    const ini = (p.display_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    const avatarHTML = p.avatar_url
      ? `<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`
      : ini;
    const isFollowing = _followingIds.has(p.user_id);
    const isMe = currentUser && p.user_id === currentUser.id;
    return `<div class="members-result-row" onclick="openUserPage('${p.user_id}')">
      <div class="fc-avatar">${avatarHTML}</div>
      <div style="flex:1;">
        <div class="members-result-name">${p.display_name||'Cyclist'}</div>
        <div style="font-size:11px;color:var(--muted);">@${p.handle||'cyclist'}</div>
      </div>
      ${!isMe ? `<button id="follow-btn-${p.user_id}" class="follow-btn ${isFollowing?'following':'follow'}"
        onclick="event.stopPropagation();toggleFollow('${p.user_id}')">${isFollowing?'Following':'Follow'}</button>` : ''}
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  FOLLOWERS / FOLLOWING
// ════════════════════════════════════════════════════════
// SQL to run once in Supabase:
// create table if not exists follows (
//   follower_id uuid not null references auth.users(id) on delete cascade,
//   following_id uuid not null references auth.users(id) on delete cascade,
//   created_at timestamptz default now(),
//   primary key (follower_id, following_id)
// );
// alter table follows enable row level security;
// create policy "users can see all follows" on follows for select using (true);
// create policy "users can follow" on follows for insert with check (auth.uid() = follower_id);
// create policy "users can unfollow" on follows for delete using (auth.uid() = follower_id);

let _followerCounts = { followers: 0, following: 0 };
let _followingIds = new Set(); // IDs of people I follow

async function loadFollowerCounts(){
  if(!currentUser) return;
  const uid = currentUser.id;
  const [fersRes, fingRes] = await Promise.all([
    sb.from('follows').select('follower_id', {count:'exact',head:true}).eq('following_id', uid),
    sb.from('follows').select('following_id', {count:'exact',head:true}).eq('follower_id', uid),
  ]);
  _followerCounts.followers = fersRes.count || 0;
  _followerCounts.following = fingRes.count || 0;
  const elF = document.getElementById('stat-followers');
  const elG = document.getElementById('stat-following');
  if(elF) elF.textContent = _followerCounts.followers;
  if(elG) elG.textContent = _followerCounts.following;
}

async function loadFollowingIds(){
  if(!currentUser) return;
  const { data } = await sb.from('follows').select('following_id').eq('follower_id', currentUser.id);
  _followingIds = new Set((data||[]).map(r => r.following_id));
}

async function toggleFollow(targetUserId){
  if(!currentUser) { openAuthModal(); return; }
  if(_followingIds.has(targetUserId)){
    await sb.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', targetUserId);
    _followingIds.delete(targetUserId);
  } else {
    await sb.from('follows').insert({ follower_id: currentUser.id, following_id: targetUserId });
    _followingIds.add(targetUserId);
    // Notify the followed user
    createNotification({
      user_id: targetUserId,
      type: 'follow',
      actor_id: currentUser.id,
      actor_handle: profile.handle || '',
      actor_name: profile.name || 'Someone',
    });
  }
  // Refresh UI
  renderFollowButton(targetUserId);
  _membersCache = null; // force re-fetch on next members page load
  loadFollowerCounts();
  loadFollowingFeed();
}

function renderFollowButton(targetUserId){
  const btn = document.getElementById('follow-btn-'+targetUserId);
  if(!btn) return;
  const isFollowing = _followingIds.has(targetUserId);
  btn.textContent = isFollowing ? 'Following' : 'Follow';
  btn.className = 'follow-btn ' + (isFollowing ? 'following' : 'follow');
}

function renderFollowButton(targetUserId){
  const btn = document.getElementById('follow-btn-'+targetUserId);
  if(!btn) return;
  const isFollowing = _followingIds.has(targetUserId);
  btn.textContent = isFollowing ? 'Following' : 'Follow';
  btn.className = 'follow-btn ' + (isFollowing ? 'following' : 'follow');
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

let _notifications = [];

async function loadNotifications(){
  if(!currentUser) return;
  const { data, error } = await sb.from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if(error){ console.warn('notifications load error:', error); return; }
  _notifications = data || [];
  updateNotifBadge();
}

function updateNotifBadge(){
  const unread = _notifications.filter(n => !n.read).length;
  // Desktop badge
  const badge = document.getElementById('notif-badge');
  if(badge){
    badge.textContent = unread > 9 ? '9+' : (unread || '');
    badge.classList.toggle('hidden', unread === 0);
  }
  // Mobile badge
  const mobBadge = document.getElementById('mob-notif-badge');
  if(mobBadge){
    mobBadge.textContent = unread > 9 ? '9+' : (unread || '');
    mobBadge.style.display = unread > 0 ? 'flex' : 'none';
  }
}

async function createNotification(payload){
  const { error } = await sb.from('notifications').insert(payload);
  if(error) console.warn('createNotification error:', error.code, error.message, payload);
}

function openNotifDrawer(){
  document.getElementById('notif-drawer').classList.add('open');
  document.getElementById('notif-overlay').classList.add('open');
  // Always fetch fresh from Supabase on open, then render
  loadNotifications().then(() => renderNotifList());
  // Mark all as read after a short delay (let user see the unread state first)
  setTimeout(() => markAllNotificationsRead(), 1800);
}

function closeNotifDrawer(){
  document.getElementById('notif-drawer').classList.remove('open');
  document.getElementById('notif-overlay').classList.remove('open');
}

function _notifTimeAgo(iso){
  if(!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if(days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function _notifText(n){
  const actor = `<strong>${n.actor_name || 'Someone'}</strong>`;
  if(n.type === 'follow') return `${actor} started following you.`;
  if(n.type === 'like'){
    const race = n.race_id ? ` your review of <strong>${RACES.find(r=>r.id===n.race_id)?.name || n.race_id}</strong>` : ' your review';
    return `${actor} liked${race}.`;
  }
  if(n.type === 'comment'){
    const race = n.race_id ? ` on your review of <strong>${RACES.find(r=>r.id===n.race_id)?.name || n.race_id}</strong>` : ' on your review';
    const snippet = n.comment_text ? `<div style="margin-top:4px;color:var(--ml);font-size:11px;font-style:italic;">"${n.comment_text}"</div>` : '';
    return `${actor} commented${race}.${snippet}`;
  }
  return `${actor} interacted with your content.`;
}

function _notifIconHTML(type){
  if(type === 'like') return `<div class="notif-icon-wrap like"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" fill="none" stroke-width="2"/></svg></div>`;
  if(type === 'comment') return `<div class="notif-icon-wrap comment"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>`;
  if(type === 'follow') return `<div class="notif-icon-wrap follow"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></div>`;
  return `<div class="notif-icon-wrap"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>`;
}

function renderNotifList(){
  const list = document.getElementById('notif-list');
  if(!list) return;
  if(!_notifications.length){
    list.innerHTML = '<div class="notif-empty">No notifications yet.<br><span style="font-size:11px;margin-top:6px;display:block;">You\'ll be notified when someone follows you, likes a review, or leaves a comment.</span></div>';
    return;
  }
  list.innerHTML = _notifications.map(n => {
    const unreadClass = n.read ? '' : ' unread';
    const time = _notifTimeAgo(n.created_at);
    const text = _notifText(n);
    const icon = _notifIconHTML(n.type);
    // Click target
    let onclick = '';
    if(n.type === 'follow' && n.actor_handle) onclick = `onclick="closeNotifDrawer();openUserPage(null,'${n.actor_handle}')"`;
    else if((n.type === 'like' || n.type === 'comment') && n.review_key){
      const [rh, ri, ry, rn] = n.review_key.split('/');
      onclick = `onclick="closeNotifDrawer();navToReview('${rh}','${ri}',${ry||0},${rn||1})"`;
    } else if(n.actor_handle) onclick = `onclick="closeNotifDrawer();openUserPage(null,'${n.actor_handle}')"`;

    return `<div class="notif-item${unreadClass}" ${onclick}>
      ${icon}
      <div class="notif-body">
        <div class="notif-text">${text}</div>
        <div class="notif-meta">${time}</div>
      </div>
    </div>`;
  }).join('');
}

async function markAllNotificationsRead(){
  if(!currentUser || !_notifications.some(n=>!n.read)) return;
  await sb.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false);
  _notifications = _notifications.map(n => ({ ...n, read: true }));
  updateNotifBadge();
  // Re-render without unread highlights
  renderNotifList();
}
