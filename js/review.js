function handleRoute(hash){
  if(!hash || hash === '#' || hash === '#/') {
    showPage('discover'); return;
  }
  const parts = hash.replace(/^#\//, '').split('/');
  if(parts[0] === 'edition' && parts[1] && parts[2]) {
    openEditionPage(parts[1], parseInt(parts[2]), false);
  } else if(parts[0] === 'race' && parts[1]) {
    const slug = parts[1];
    const year = parts[2] ? parseInt(parts[2]) : null;
    openRacePage(slug, year, false);
  } else if(parts[0] === 'stage' && parts[1] && parts[2] && parts[3]) {
    // #/stage/{raceId}/{year}/{stageNum}
    openStagePage(parts[1], parseInt(parts[2]), parseInt(parts[3]), false);
  } else if(parts[0] === 'rider' && parts[1]) {
    openRiderPageBySlug(parts[1]);
  } else if(parts[0] === 'review' && parts[1] && parts[2] && parts[3]) {
    // #/review/{handle}/{raceId}/{year}[/{n}]
    openReviewPage(parts[1], parts[2], parseInt(parts[3]), parts[4] ? parseInt(parts[4]) : 1, false);
  } else if(parts[0] === 'user' && parts[1]) {
    openUserPage(parts[1], null, false);
  } else if(parts[0] === 'discover') {
    showPage('discover');
    if(parts[1] === 'riders') {
      setDiscoverSection('riders');
    }
  } else {
    // Try treating as a main page name (log, top, stats, profile)
    const validPages = ['discover','log','top','stats','profile'];
    if(validPages.includes(parts[0])) showPage(parts[0]);
    else { showPage('discover'); }
  }
}

window.addEventListener('popstate', () => handleRoute(location.hash));

// ════════════════════════════════════════════════════════
//  REVIEW PAGE
// ════════════════════════════════════════════════════════
function navToReview(handle, raceId, year, n){
  n = n || 1;
  openReviewPage(handle, raceId, year, n, true);
}

async function openReviewPage(handle, raceId, year, n, pushHistory=true){
  n = n || 1;
  if(pushHistory){
    const hash = `#/review/${handle}/${raceId}/${year}${n>1?'/'+n:''}`;
    _appHistoryDepth++; history.pushState(null, '', hash);
  }
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-review').classList.add('active');
  document.querySelectorAll('.nav-a').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('active'));

  const el = document.getElementById('review-page-inner');
  el.innerHTML = `<div style="color:var(--muted);padding:40px 0;">Loading review…</div>`;

  const r = RACES.find(x=>x.id===raceId);
  let reviewEntry = null;
  let isMyReview = false;

  const myHandle = profile.handle || (currentUser ? currentUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g,'') : '');

  if(handle === myHandle || handle === (currentUser?.id)){
    // Own review — use localStorage
    isMyReview = true;
    const rl = userLog[raceId] || {};
    const reviewWatches = (rl.watches||[]).filter(w=>w.review&&w.review.trim()).sort((a,b)=>(a.ts||0)-(b.ts||0));
    reviewEntry = reviewWatches[n-1] || null;

    // Fallback: also check Supabase race_logs directly
    if(!reviewEntry && currentUser){
      const { data: logs } = await sb.from('race_logs')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('slug', raceId)
        .not('review', 'is', null)
        .order('created_at', { ascending: true });
      if(logs && logs[n-1]){
        const lg = logs[n-1];
        reviewEntry = { review: lg.review, rating: lg.rating, live: lg.watched_live, year: lg.year, ts: new Date(lg.created_at).getTime() };
      }
    }
  } else {
    // Another user — look up their user_id from handle, then get their race_logs
    const { data: pData } = await sb.from('profiles').select('user_id,display_name,handle').eq('handle', handle).maybeSingle();
    if(pData){
      const { data: logs } = await sb.from('race_logs')
        .select('*')
        .eq('user_id', pData.user_id)
        .eq('slug', raceId)
        .not('review', 'is', null)
        .order('created_at', { ascending: true });
      if(logs && logs[n-1]){
        const lg = logs[n-1];
        reviewEntry = { review: lg.review, rating: lg.rating, live: lg.watched_live, year: lg.year, ts: new Date(lg.created_at).getTime() };
      }
    }
    isMyReview = myHandle && handle === myHandle;
  }

  if(!reviewEntry){
    el.innerHTML = `<div style="color:var(--muted);padding:40px 0;text-align:center;">Review not found.<br><span style="font-size:11px;margin-top:8px;display:block;">Make sure this review exists and is saved.</span></div>`;
    return;
  }

  // Get like count & whether current user liked it
  const reviewKey = `${handle}/${raceId}/${year}/${n}`;
  const { data: likesData } = await sb.from('review_likes').select('user_id').eq('review_key', reviewKey);
  const likeCount = likesData?.length || 0;
  const myUserId = currentUser?.id;
  const iLiked = myUserId && likesData?.some(l=>l.user_id===myUserId);

  // Get comments
  const { data: commentsData } = await sb.from('review_comments')
    .select('id, user_id, handle, display_name, text, created_at')
    .eq('review_key', reviewKey)
    .order('created_at', { ascending: true });

  const rName = r ? r.name : raceId;
  const rGradient = r ? r.gradient : 'var(--border)';

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid var(--border);">
      <div style="width:56px;height:56px;flex-shrink:0;background:${rGradient};"></div>
      <div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:3px;">${rName}</div>
        <div style="font-size:12px;color:var(--muted);">${year} Edition · Review by <span style="color:var(--gold);">@${handle}</span>${n>1?` (review #${n})`:''}</div>
      </div>
    </div>

    <div style="margin-bottom:24px;">
      ${reviewEntry.rating ? `<div style="margin-bottom:10px;">${starsHTML(reviewEntry.rating,16)}</div>` : ''}
      ${reviewEntry.live ? `<span style="font-size:9px;letter-spacing:1.5px;color:#e55;border:1px solid #e55;padding:2px 8px;margin-bottom:12px;display:inline-block;">WATCHED LIVE</span>` : ''}
      <div style="font-size:15px;line-height:1.8;color:var(--text);margin-top:12px;white-space:pre-wrap;">${reviewEntry.review}</div>
    </div>

    <div style="display:flex;align-items:center;gap:16px;padding:16px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:32px;">
      <button id="rv-like-btn" class="rv-like-btn ${iLiked?'liked':''}" onclick="toggleReviewLike('${reviewKey}',this)" ${isMyReview||!currentUser?'disabled title="'+(isMyReview?'You cannot like your own review':'Sign in to like')+'""':''}>
        ${iLiked?'♥':'♡'} <span id="rv-like-count">${likeCount}</span> ${likeCount===1?'like':'likes'}
      </button>
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;margin-bottom:16px;">Comments <span style="color:var(--muted);font-size:14px;">${commentsData?.length||0}</span></div>
      <div id="rv-comments-list">
        ${(commentsData||[]).map(c=>`
          <div class="rv-comment">
            <div class="rv-comment-author">@${c.handle||c.display_name||'User'} <span style="color:var(--muted);font-weight:400;font-size:10px;margin-left:6px;">${fmtDate((c.created_at||'').split('T')[0])}</span></div>
            <div class="rv-comment-text">${c.text}</div>
          </div>`).join('') || '<div style="color:var(--muted);font-size:12px;padding:12px 0;">No comments yet. Be the first!</div>'}
      </div>
      ${currentUser ? `
        <div style="margin-top:20px;">
          <textarea class="rv-comment-input" id="rv-comment-input" placeholder="Write a comment…"></textarea>
          <button class="bs" style="margin-top:8px;" onclick="submitReviewComment('${reviewKey}')">Post Comment</button>
        </div>` : `<div style="color:var(--muted);font-size:12px;margin-top:16px;">Sign in to leave a comment.</div>`}
    </div>`;
}

async function toggleReviewLike(reviewKey, btn){
  if(!currentUser) { toast('Sign in to like reviews'); return; }
  const myUserId = currentUser.id;
  const countEl = document.getElementById('rv-like-count');
  const isLiked = btn.classList.contains('liked');

  if(isLiked){
    await sb.from('review_likes').delete().eq('review_key', reviewKey).eq('user_id', myUserId);
    btn.classList.remove('liked');
    btn.innerHTML = `♡ <span id="rv-like-count">${Math.max(0,(parseInt(countEl?.textContent)||1)-1)}</span> likes`;
  } else {
    await sb.from('review_likes').insert({ review_key: reviewKey, user_id: myUserId });
    btn.classList.add('liked');
    btn.innerHTML = `♥ <span id="rv-like-count">${(parseInt(countEl?.textContent)||0)+1}</span> likes`;
    // Notify review owner (don't notify yourself)
    const ownerHandle = reviewKey.split('/')[0];
    const raceId = reviewKey.split('/')[1];
    const year = reviewKey.split('/')[2];
    if(ownerHandle && ownerHandle !== (profile.handle||'')){
      const { data: ownerData } = await sb.from('profiles').select('user_id').eq('handle', ownerHandle).maybeSingle();
      if(ownerData?.user_id && ownerData.user_id !== myUserId){
        createNotification({
          user_id: ownerData.user_id,
          type: 'like',
          actor_id: myUserId,
          actor_handle: profile.handle || '',
          actor_name: profile.name || 'Someone',
          review_key: reviewKey,
          race_id: raceId,
          year: parseInt(year) || null,
        });
      }
    }
  }
}

async function submitReviewComment(reviewKey){
  if(!currentUser) return;
  const input = document.getElementById('rv-comment-input');
  const text = input?.value?.trim();
  if(!text) return;
  input.value = '';
  const displayName = profile.name || currentUser.email.split('@')[0];
  const myHandle = profile.handle || currentUser.email.split('@')[0];
  const { data, error } = await sb.from('review_comments').insert({
    review_key: reviewKey,
    user_id: currentUser.id,
    handle: myHandle,
    display_name: displayName,
    text
  }).select().single();
  if(error){ toast('Error posting comment'); console.error(error); return; }
  // Notify review owner
  const ownerHandle = reviewKey.split('/')[0];
  const raceId = reviewKey.split('/')[1];
  const year = reviewKey.split('/')[2];
  if(ownerHandle && ownerHandle !== myHandle){
    const { data: ownerData } = await sb.from('profiles').select('user_id').eq('handle', ownerHandle).maybeSingle();
    if(ownerData?.user_id && ownerData.user_id !== currentUser.id){
      createNotification({
        user_id: ownerData.user_id,
        type: 'comment',
        actor_id: currentUser.id,
        actor_handle: myHandle,
        actor_name: displayName,
        review_key: reviewKey,
        race_id: raceId,
        year: parseInt(year) || null,
        comment_text: text.slice(0, 120),
      });
    }
  }
  // Append to list
  const list = document.getElementById('rv-comments-list');
  if(list){
    const placeholder = list.querySelector('div[style*="No comments"]');
    if(placeholder) placeholder.remove();
    list.insertAdjacentHTML('beforeend', `
      <div class="rv-comment">
        <div class="rv-comment-author">@${myHandle} <span style="color:var(--muted);font-weight:400;font-size:10px;margin-left:6px;">just now</span></div>
        <div class="rv-comment-text">${text}</div>
      </div>`);
  }
}

function openRacePageBySlug(id, preferYear){
  openRacePage(id, preferYear, true);
}

function navToRace(id, year){
  if(year) openEditionPage(id, year, true);
  else openRacePage(id, null, true);
}

function navToRider(displayOrRawName){
  // Could receive display format "Tadej Pogačar" or DB format "Pogačar Tadej"
  // Store raw (DB format) name for the query
  const slug = displayOrRawName.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  window._riderPageRawName = displayOrRawName;
  _appHistoryDepth++; history.pushState(null, '', `#/rider/${slug}`);
  renderRiderPage(displayOrRawName);
}

function openRiderPageBySlug(slug){
  const rawName = window._riderPageRawName || slug.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  renderRiderPage(rawName);
}

