const SUPABASE_URL = 'https://pkbxgeloejmnblwpsuch.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrYnhnZWxvZWptbmJsd3BzdWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTU0MDcsImV4cCI6MjA4ODM5MTQwN30.2JbsShp7ZIQ4qs-kgF7_O4wWZDTgQ_qDdI9X9SFjnWA';
  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let currentUser = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await onSignedIn();
    } else {
      onSignedOut();
    }

    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        // If signInEmail already set currentUser and called onSignedIn, skip
        if (currentUser) return;
        currentUser = session.user;
        await onSignedIn();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        onSignedOut();
      }
    });
  }

  async function onSignedIn() {
    renderNavUser();

    // Start feed + following IDs in parallel with user data — they only need currentUser.id
    const feedPromise = loadFollowingIds().then(() => loadFollowingFeed());

    await Promise.all([
      loadUserData(),
      feedPromise,
      loadRaceResultsForLog(),
      loadNotifications(),
    ]);

    // Push any locally-stored stage logs that haven't been synced to Supabase yet
    syncLocalStageLogsToSupabase();
    renderAll();
    updateStats();
    renderRiders(); // use cache if available, don't force refresh
    if(window._pendingRoute){ handleRoute(window._pendingRoute); window._pendingRoute=null; }
  }

  function onSignedOut() {
    userLog    = {};
    watchlist  = [];
    stageLog   = {};
    _followingIds = new Set(); // clear so next login doesn't inherit stale following list
    if(typeof _notifications !== 'undefined') { _notifications = []; }
    if(typeof updateNotifBadge === 'function') updateNotifBadge();
    if(typeof closeNotifDrawer === 'function') closeNotifDrawer();
    // Clear feed cache so next user doesn't see stale data
    try { localStorage.removeItem(`g3-feed:${currentUser?.id}`); } catch(e){}
    profile    = {
      name: 'Cyclist',
      handle: 'velocipedist',
      favRiders: [null,null,null,null],
      favRace: null
    };
    renderNavGuest();
    renderAll();
    renderProfile();
    // Hide the following feed — logged-out users have no feed
    const _feedSection = document.getElementById('following-feed-section');
    const _feedList = document.getElementById('following-feed-list');
    if(_feedSection) _feedSection.style.display = 'none';
    if(_feedList) _feedList.innerHTML = '';
    // Always redirect to discover on sign out
    showPage('discover');
    if(window._pendingRoute){ handleRoute(window._pendingRoute); window._pendingRoute=null; }
  }

  // ── Sign up ───────────────────────────────────────────────────────────────
  function sanitizeHandle(raw){
    return raw.toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9_]/g,'').slice(0,24);
  }

  function suggestHandle(){
    const nameEl = document.getElementById('su-name');
    const handleEl = document.getElementById('su-handle');
    if(!nameEl || !handleEl) return;
    // Only auto-fill if user hasn't manually edited the handle field
    if(!handleEl.dataset.userEdited){
      handleEl.value = sanitizeHandle(nameEl.value);
      checkHandleAvailability();
    }
  }

  let _handleCheckTimer = null;
  function checkHandleAvailability(){
    const handleEl = document.getElementById('su-handle');
    const statusEl = document.getElementById('su-handle-status');
    if(!handleEl || !statusEl) return;
    handleEl.dataset.userEdited = '1';
    const raw = handleEl.value;
    const clean = sanitizeHandle(raw);
    // Keep input clean
    if(raw !== clean) { handleEl.value = clean; }
    if(!clean){
      statusEl.textContent = '';
      return;
    }
    if(clean.length < 3){
      statusEl.style.color = 'var(--muted)';
      statusEl.textContent = 'Username must be at least 3 characters';
      return;
    }
    statusEl.style.color = 'var(--muted)';
    statusEl.textContent = 'Checking…';
    clearTimeout(_handleCheckTimer);
    _handleCheckTimer = setTimeout(async () => {
      const { data } = await sb.from('profiles').select('user_id').eq('handle', clean).maybeSingle();
      const statusEl2 = document.getElementById('su-handle-status');
      if(!statusEl2) return;
      if(data){
        statusEl2.style.color = '#e55';
        statusEl2.textContent = '✗ @' + clean + ' is already taken';
      } else {
        statusEl2.style.color = '#4caf50';
        statusEl2.textContent = '✓ @' + clean + ' is available';
      }
    }, 400);
  }

  async function signUpEmail() {
    const name     = document.getElementById('su-name').value.trim();
    const email    = document.getElementById('su-email').value.trim();
    const password = document.getElementById('su-password').value;
    const handleEl = document.getElementById('su-handle');
    const handle   = sanitizeHandle(handleEl ? handleEl.value : name);

    if (!name)               { toast('Please enter your name');     return; }
    if (!handle || handle.length < 3) { toast('Please choose a username (min 3 characters)'); return; }
    if (!email)              { toast('Please enter your email');    return; }
    if (password.length < 6) { toast('Password min 6 characters'); return; }

    // Check handle availability one final time before submitting
    const { data: existingHandle } = await sb.from('profiles').select('user_id').eq('handle', handle).maybeSingle();
    if(existingHandle){
      toast('@' + handle + ' is already taken — please choose another');
      const statusEl = document.getElementById('su-handle-status');
      if(statusEl){ statusEl.style.color='#e55'; statusEl.textContent = '✗ @' + handle + ' is already taken'; }
      return;
    }

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name, handle },
        emailRedirectTo: 'https://palmares.pro'
      }
    });

    if (error) {
      console.error('signUp error:', error);
      const msg = error.message || '';
      if(msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')){
        toast('That email is already registered — try signing in');
      } else {
        toast('Sign up failed: ' + msg);
      }
      return;
    }

    // data.user exists but may be unconfirmed — profile insert happens via DB trigger.
    // Also attempt upsert from client as fallback (non-fatal if it fails).
    if(data?.user){
      const { error: profErr } = await sb.from('profiles').upsert({
        user_id:      data.user.id,
        display_name: name,
        handle,
      }, { onConflict: 'user_id' });
      if(profErr) console.warn('Profile upsert (non-fatal):', profErr.message);
      profile.name   = name;
      profile.handle = handle;
      persistProfile();
    }
    toast('Check your email to confirm your account ✓');
    closeMO('auth-mo');
  }

  // ── Sign in ───────────────────────────────────────────────────────────────
  async function signInEmail() {
    const email    = document.getElementById('si-email').value.trim();
    const password = document.getElementById('si-password').value;

    if (!email || !password) { toast('Please fill in all fields'); return; }

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { toast(error.message); return; }

    currentUser = data.user;
    closeMO('auth-mo');
    await onSignedIn();
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function signOut() {
    await sb.auth.signOut();
    // Clear all app localStorage so the reload starts completely fresh
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('g3-') || k.startsWith('sb-') || k.startsWith('supabase')) {
        localStorage.removeItem(k);
      }
    });
    window.location.href = window.location.pathname;
  }

  // ── Load all user data into local state ───────────────────────────────────
  async function loadUserData() {
    if (!currentUser) return;
    const uid = currentUser.id;

    // Run all queries in parallel
    const [profRes, wlRes, logsRes, stageLogsRes] = await Promise.all([
      sb.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      sb.from('watchlist').select('slug').eq('user_id', uid),
      sb.from('race_logs').select('id,slug,year,rating,review,watched_live,date_watched,created_at').eq('user_id', uid).order('created_at', { ascending: false }),
      sb.from('stage_logs').select('id,log_id,race_slug,year,stage_num,rating,review,watched_live,date_watched,created_at').eq('user_id', uid).order('created_at', { ascending: false }),
    ]);
    if (stageLogsRes.error) console.error('stage_logs load error:', stageLogsRes.error);

    const prof = profRes.data;
    if (prof) {
      profile = {
        name:      prof.display_name || 'Cyclist',
        handle:    prof.handle || 'velocipedist',
        avatarUrl: prof.avatar_url || null,
        favRiders: (() => { const r = Array.isArray(prof.fav_riders) ? prof.fav_riders.slice() : []; while(r.length < 4) r.push(null); return r; })(),
        favRace:   prof.fav_race_slug ? {
          id:       prof.fav_race_slug,
          year:     prof.fav_race_year,
          stageNum: prof.fav_race_stage,
        } : null,
      };
      persistProfile();
    }

    watchlist = ((wlRes.data) || []).map(r => r.slug);

    const logs = logsRes.data || [];
    const allStageLogs = stageLogsRes.data || [];

    userLog = {};
    stageLog = {};

    // Populate race logs
    logs.forEach(log => {
      const _ls = cleanSlug(log.slug);
      if (!userLog[_ls]) userLog[_ls] = { watches: [] };
      userLog[_ls].watches.push({
        id:     log.id,
        year:   log.year,
        date:   log.date_watched,
        live:   log.watched_live,
        rating: parseFloat(log.rating) || 0,
        review: log.review || '',
        stages: {},
        ts:     new Date(log.created_at).getTime(),
      });
    });

    // Populate stage logs directly from stage_logs table
    allStageLogs.forEach(s => {
      if (!s.race_slug || !s.year) return;
      if (!stageLog[s.race_slug]) stageLog[s.race_slug] = {};
      if (!stageLog[s.race_slug][s.year]) stageLog[s.race_slug][s.year] = {};
      stageLog[s.race_slug][s.year][s.stage_num] = {
        rating:     parseFloat(s.rating) || 0,
        review:     s.review || '',
        date:       s.date_watched || null,
        live:       s.watched_live || false,
        stageLabel: String(s.stage_num),
        ts:         s.created_at ? new Date(s.created_at).getTime() : Date.now(),
        dbId:       s.id,
      };
    });

    persist();
    persistStageLog();
  }

  // ── Save race log ─────────────────────────────────────────────────────────
  async function saveLogToSupabase(slug, watchEntry) {
    if (!currentUser) { console.warn('saveLogToSupabase: no currentUser'); toast('Not signed in — log saved locally only'); return null; }
    console.log('saveLogToSupabase: inserting', slug, watchEntry.year, 'user:', currentUser.id);

    const row = {
      user_id:      currentUser.id,
      slug,
      year:         watchEntry.year,
      rating:       watchEntry.rating || null,
      review:       watchEntry.review || null,
      watched_live: watchEntry.live || false,
      date_watched: watchEntry.date || null,
    };

    let logId = watchEntry.id;

    if (logId) {
      const { error } = await sb.from('race_logs').update(row).eq('id', logId);
      if (error) { console.error('race_logs update error:', error); toast('Save failed: ' + error.message); return null; }
    } else {
      const { data, error } = await sb
        .from('race_logs').insert(row).select().single();
      if (error) { console.error('race_logs insert error:', error); toast('Save failed: ' + error.message); return null; }
      logId = data?.id;
    }

    // NOTE: stage_logs are managed independently by saveStageLogToSupabase — do NOT touch them here.

    return logId;
  }

  // ── Save profile ──────────────────────────────────────────────────────────
  async function saveProfileToSupabase() {
    if (!currentUser) return;
    const payload = {
      user_id:        currentUser.id,
      display_name:   profile.name,
      handle:         profile.handle,
      avatar_url:     profile.avatarUrl || null,
      fav_riders:     profile.favRiders,
      fav_race_slug:  profile.favRace?.id        || null,
      fav_race_year:  profile.favRace?.year       || null,
      fav_race_stage: profile.favRace?.stageNum   || null,
    };
    const { error } = await sb.from('profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) { console.error('saveProfileToSupabase error:', error); toast('Profile save failed: ' + error.message); }
  }

  // ── Toggle watchlist ──────────────────────────────────────────────────────
  async function toggleWLSupabase(slug, adding) {
    if (!currentUser) return;
    if (adding) {
      await sb.from('watchlist').upsert({ user_id: currentUser.id, slug });
    } else {
      await sb.from('watchlist').delete()
        .eq('user_id', currentUser.id)
        .eq('slug', slug);
    }
  }

  // ── Nav ───────────────────────────────────────────────────────────────────
  function renderNavUser() {
    const el = document.getElementById('nav-cta-area');
    if (!el) return;
    const initials = (profile.name || 'U')
      .split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '12px';
    el.innerHTML = `
      <button class="nav-a nav-cta" onclick="openSearchModal()">+ Log Race</button>
      <div class="notif-bell-wrap">
        <button class="notif-bell-btn" onclick="openNotifDrawer()" title="Notifications">
          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </button>
        <span class="notif-badge hidden" id="notif-badge"></span>
      </div>
      <button class="nav-a" onclick="showPage('profile')"
        style="width:30px;height:30px;border-radius:50%;
               background:var(--gold);color:var(--black);
               font-weight:700;font-size:12px;display:flex;
               align-items:center;justify-content:center;flex-shrink:0;">
        ${initials}
      </button>
      <button class="nav-a" onclick="signOut()"
        style="font-size:10px;letter-spacing:2px;">Sign out</button>`;
    const navLog = document.getElementById('nav-log');
    const navProfile = document.getElementById('nav-profile');
    const navStats = document.getElementById('nav-stats');
    if(navLog) navLog.style.display = '';
    if(navProfile) navProfile.style.display = '';
    if(navStats) navStats.style.display = '';
    const mobLog = document.getElementById('mob-nav-log');
    const mobProfile = document.getElementById('mob-nav-profile');
    const mobSignin = document.getElementById('mob-nav-signin');
    const mobNotif = document.getElementById('mob-nav-notif');
    if(mobLog) mobLog.style.display = '';
    if(mobProfile) mobProfile.style.display = '';
    if(mobSignin) mobSignin.style.display = 'none';
    if(mobNotif) mobNotif.style.display = '';
    const mobSignout = document.getElementById('mob-nav-signout');
    if(mobSignout) mobSignout.style.display = '';
  }

  function renderNavGuest() {
    const el = document.getElementById('nav-cta-area');
    if (!el) return;
    el.innerHTML = `
      <button class="nav-a nav-cta" onclick="openAuthModal()">Sign in</button>`;
    const navLog = document.getElementById('nav-log');
    const navProfile = document.getElementById('nav-profile');
    const navStats = document.getElementById('nav-stats');
    if(navLog) navLog.style.display = 'none';
    if(navProfile) navProfile.style.display = 'none';
    if(navStats) navStats.style.display = 'none';
    const mobLog = document.getElementById('mob-nav-log');
    const mobProfile = document.getElementById('mob-nav-profile');
    const mobSignin = document.getElementById('mob-nav-signin');
    const mobNotif = document.getElementById('mob-nav-notif');
    if(mobLog) mobLog.style.display = 'none';
    if(mobProfile) mobProfile.style.display = 'none';
    if(mobSignin) mobSignin.style.display = '';
    if(mobNotif) mobNotif.style.display = 'none';
    const mobSignout = document.getElementById('mob-nav-signout');
    if(mobSignout) mobSignout.style.display = 'none';
  }

  function openAuthModal() {
    // Inject auth form fresh each time — keeps password fields out of the DOM on load
    // so browsers never trigger autofill/keychain popups
    document.getElementById('auth-modal-body').innerHTML = `
      <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:24px;">
        <button id="auth-tab-in" onclick="setAuthTab('in')"
          style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;background:none;border:none;color:var(--gold);padding:0 0 10px;margin-right:24px;border-bottom:2px solid var(--gold);cursor:pointer;">
          Sign In
        </button>
        <button id="auth-tab-up" onclick="setAuthTab('up')"
          style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;background:none;border:none;color:var(--muted);padding:0 0 10px;border-bottom:2px solid transparent;cursor:pointer;">
          Create Account
        </button>
      </div>
      <div id="auth-form-in">
        <label class="flbl">Email</label>
        <input type="email" class="dinp" id="si-email"
          style="width:100%;margin-bottom:12px;" placeholder="your@email.com"
          autocomplete="email"
          onkeydown="if(event.key==='Enter') signInEmail()">
        <label class="flbl">Password</label>
        <input type="password" class="dinp" id="si-password"
          style="width:100%;margin-bottom:20px;" placeholder="••••••••"
          autocomplete="current-password"
          onkeydown="if(event.key==='Enter') signInEmail()">
        <button class="bp" style="width:100%;" onclick="signInEmail()">Sign In</button>
      </div>
      <div id="auth-form-up" style="display:none;">
        <label class="flbl">Your Name</label>
        <input type="text" class="dinp" id="su-name"
          style="width:100%;margin-bottom:12px;" placeholder="Eddy Merckx" autocomplete="off"
          oninput="suggestHandle()">
        <label class="flbl">Username</label>
        <div style="position:relative;margin-bottom:4px;">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none;">@</span>
          <input type="text" class="dinp" id="su-handle"
            style="width:100%;padding-left:22px;box-sizing:border-box;" placeholder="eddymerckx"
            autocomplete="off" oninput="checkHandleAvailability()"
            onkeydown="if(event.key==='Enter') signUpEmail()">
        </div>
        <div id="su-handle-status" style="font-size:10px;letter-spacing:.5px;margin-bottom:12px;min-height:14px;"></div>
        <label class="flbl">Email</label>
        <input type="email" class="dinp" id="su-email"
          style="width:100%;margin-bottom:12px;" placeholder="your@email.com" autocomplete="off">
        <label class="flbl">Password</label>
        <input type="password" class="dinp" id="su-password"
          style="width:100%;margin-bottom:20px;" placeholder="Min 6 characters"
          autocomplete="new-password"
          onkeydown="if(event.key==='Enter') signUpEmail()">
        <button class="bp" style="width:100%;" onclick="signUpEmail()">Create Account</button>
      </div>`;
    openMO('auth-mo');
  }

  function setAuthTab(tab) {
    document.getElementById('auth-form-in').style.display = tab==='in' ? 'block' : 'none';
    document.getElementById('auth-form-up').style.display = tab==='up' ? 'block' : 'none';
    document.getElementById('auth-tab-in').style.color = tab==='in' ? 'var(--gold)' : 'var(--muted)';
    document.getElementById('auth-tab-up').style.color = tab==='up' ? 'var(--gold)' : 'var(--muted)';
    document.getElementById('auth-tab-in').style.borderBottomColor = tab==='in' ? 'var(--gold)' : 'transparent';
    document.getElementById('auth-tab-up').style.borderBottomColor = tab==='up' ? 'var(--gold)' : 'transparent';
  }

  // Auth is initialised after loadAppData() completes — resolved by the main script block
  let _appDataReady;
  const appDataReady = new Promise(resolve => { _appDataReady = resolve; });

  // Scripts load at bottom of <body> so DOM is already ready — no DOMContentLoaded needed.
  // data.js calls _appDataReady() after loadAppData() completes, which resolves this promise.
  appDataReady.then(() => initAuth());
