function toggleWL(id){
  const i=watchlist.indexOf(id);
  const adding=i<0;
  if(adding){watchlist.push(id);toast('Added to watchlist ★');}
  else{watchlist.splice(i,1);toast('Removed from watchlist');}
  localStorage.setItem('g3-wl',JSON.stringify(watchlist));
  if(currentUser) toggleWLSupabase(id,adding);
  renderGrid();
}
function toggleWLModal(){
  if(curId) toggleWL(curId);
  const inWL=watchlist.includes(curId);
  const b=document.getElementById('lm-wl-btn');
  if(b){b.textContent=inWL?'★ In Watchlist':'+ Watchlist';b.classList.toggle('on',inWL);}
}

// ════════════════════════════════════════════════════════
//  CONFIRM & DELETE
// ════════════════════════════════════════════════════════
let _cb=null;
function showConfirm(title,msg,cb){
  document.getElementById('c-title').textContent=title;
  document.getElementById('c-msg').innerHTML=msg;
  document.getElementById('c-yes').onclick=()=>{closeConfirm();cb();};
  document.getElementById('confirm-mo').classList.add('open');
}
function closeConfirm(){document.getElementById('confirm-mo').classList.remove('open');}

function confirmDeleteWatch(id,idx){
  const r=RACES.find(x=>x.id===id);
  const w=userLog[id]?.watches?.[idx];
  if(!w) return;
  showConfirm('Delete Log',`Delete your log for <strong>${r.name} ${w.year}</strong>?`,async ()=>{
    const dbId = w.id;
    const deletedYear = w.year;
    userLog[id].watches.splice(idx,1);
    if(!userLog[id].watches.length) delete userLog[id];
    persist();
    if(dbId && currentUser){
      const { error } = await sb.from('race_logs').delete().eq('id', dbId).eq('user_id', currentUser.id);
      if(error) console.error('Delete from DB failed:', error);
    }
    if(aPg==='edition' && _curEditionSlug===id && _curEditionYear===deletedYear){
      openEditionPage(id, deletedYear, false);
    } else {
      openRacePage(id, null, false);
    }
    renderAll(); toast('Deleted');
  });
}

function confirmDeleteEntryFromLog(id,ts){
  const r=RACES.find(x=>x.id===id);
  const rl=userLog[id]; if(!rl) return;
  const wi=(rl.watches||[]).findIndex(w=>w.ts===ts);
  if(wi===-1) return;
  showConfirm('Delete Log',`Delete this <strong>${r.name}</strong> log entry?`,async ()=>{
    const dbId = rl.watches[wi].id;
    if(dbId && currentUser){
      const { error } = await sb.from('race_logs').delete().eq('id', dbId).eq('user_id', currentUser.id);
      if(error) { console.error('Delete from DB failed:', error); toast('Delete failed'); return; }
    }
    rl.watches.splice(wi,1);
    if(!rl.watches?.length) delete userLog[id];
    persist(); renderLogPage(); renderAll(); toast('Deleted');
  });
}
function confirmDeleteRaceLogs(){
  const r=RACES.find(x=>x.id===curId); if(!r) return;
  showConfirm('Delete All Logs',`Delete all logs for <strong>${r.name}</strong>?`,async ()=>{
    const dbIds = (userLog[curId]?.watches||[]).map(w=>w.id).filter(Boolean);
    if(dbIds.length && currentUser){
      const { error } = await sb.from('race_logs').delete().in('id', dbIds).eq('user_id', currentUser.id);
      if(error) { console.error('Delete from DB failed:', error); toast('Delete failed'); return; }
    }
    delete userLog[curId]; persist(); closeMO('log-mo'); renderAll(); toast('All logs deleted');
  });
}
function confirmClearAll(){
  const n=allEntries().length;
  const hasAnything = n > 0 || watchlist.length > 0;
  if(!hasAnything){toast('Nothing to clear');return;}
  showConfirm('Clear All Data',`Delete all logs, ratings and reset everything to zero? This cannot be undone.`,async ()=>{
    // Wipe all local state immediately
    userLog={};
    raceResultsCache={};
    localStorage.removeItem('g3-log');
    localStorage.removeItem('g3-results-cache');
    persist();
    renderLogPage(); renderAll(); toast('Clearing from server…');

    if(currentUser){
      // Delete ALL race_logs for this user (server-side, catches any orphaned rows too)
      const { error } = await sb.from('race_logs')
        .delete()
        .eq('user_id', currentUser.id);
      if(error) { console.error('Delete race_logs failed:', error); toast('Server delete failed: ' + error.message); return; }
      // stage_logs are cascade-deleted by FK, but explicitly clean up too
      await sb.from('stage_logs').delete().eq('user_id', currentUser.id);
      toast('All cleared ✓');
    } else {
      toast('All local data cleared ✓');
    }
  });
}

// ════════════════════════════════════════════════════════
//  MODAL HELPERS
// ════════════════════════════════════════════════════════
function openMO(id){document.getElementById(id).classList.add('open');}
function closeMO(id){
  if(id === 'auth-mo') {
    ['si-password','su-password'].forEach(function(eid) {
      var el = document.getElementById(eid);
      if(el) { el.type = 'text'; el.value = ''; }
    });
  }document.getElementById(id).classList.remove('open');if(id==='log-mo'){curId=null;_restoreLogModal();}}
function handleMOClick(e,id){if(e.target===document.getElementById(id)) closeMO(id);}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMO('log-mo');closeMO('search-mo');closeMO('auth-mo');closeMO('rider-picker-mo');closeMO('race-picker-mo');closeMO('edit-profile-mo');closeConfirm();}});

// ════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════
function persist(){localStorage.setItem('g3-log',JSON.stringify(userLog));}
function hasLog(id){const rl=userLog[id];return !!(rl&&(rl.watches||[]).length);}
function allEntries(){
  const out=[];
  Object.entries(userLog).forEach(([id,rl])=>{
    if(id.startsWith('stage::')) return; // legacy cleanup — ignore any old stage:: keys
    (rl.watches||[]).forEach(w=>out.push([id,w]));
  });
  return out.sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
}
// Returns flat list of all logged stages: [{raceId, year, stageNum, stageLog}]
function allStageEntries(){
  const out=[];
  Object.entries(stageLog).forEach(([raceId,years])=>{
    Object.entries(years).forEach(([year,stages])=>{
      Object.entries(stages).forEach(([num,sl])=>{
        out.push({raceId, year:parseInt(year), stageNum:parseInt(num), stageLog:sl});
      });
    });
  });
  return out;
}
function fmtDate(d){if(!d) return '';return new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function updateStats(){
  const all=allEntries();
  document.getElementById('stat-watched').textContent=all.length;
  document.getElementById('stat-ratings').textContent=all.filter(([,w])=>w.rating).length;
}

function starsHTML(rating,sz=12){
  return [1,2,3,4,5].map(s=>{
    const fill=Math.min(1,Math.max(0,rating-(s-1)));
    const pct=Math.round(fill*100);
    return `<div class="sw" style="width:${sz}px;height:${sz}px;">
      <svg style="width:${sz}px;height:${sz}px;" viewBox="0 0 24 24"><path fill="var(--border-light)" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      <svg style="width:${sz}px;height:${sz}px;clip-path:inset(0 ${100-pct}% 0 0);position:absolute;top:0;left:0;" viewBox="0 0 24 24"><path fill="var(--gold)" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════
// Storage keys: g3-profile = {name, handle, favRiders:[4 names], favRace:{id,year,stageNum|null}}
let profile = JSON.parse(localStorage.getItem('g3-profile') || '{"name":"Cyclist","handle":"velocipedist","favRiders":[null,null,null,null],"favRace":null}');
function persistProfile(){ localStorage.setItem('g3-profile', JSON.stringify(profile)); }

// Rider avatar colours — cycle through a palette
const RIDER_PALETTE = ['#1a3a8c','#00594a','#c0392b','#9a8430','#4527a0','#00838f','#6d4c41','#1a4db3'];
function riderColor(name){ let h=0; for(let c of name) h=(h*31+c.charCodeAt(0))&0xffff; return RIDER_PALETTE[h % RIDER_PALETTE.length]; }
function riderInitials(name){ return name.split(' ').filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase(); }

// ── Rider image retry helper ──────────────────────────────────────────────────
// Called from onerror on every rider <img>. Retries up to 2 times with
// increasing delays; on final failure hides the img and shows the initials
// fallback sibling element.
function _imgError(img, retries){
  retries = retries || 0;
  if(retries < 2){
    setTimeout(function(){
      var src = img.getAttribute('data-src') || img.src;
      img.src = '';
      img.src = src;
      img.onerror = function(){ _imgError(img, retries + 1); };
    }, 1000 * (retries + 1));
  } else {
    img.style.display = 'none';
    var fb = img.nextElementSibling;
    if(fb) fb.style.display = 'flex';
  }
}
// Parse PCS DB format: "UPPERCASE Last Middle First"
// Words in ALL-CAPS (possibly with accented chars) = last name.
// First word that is NOT all-caps starts the given name.
// e.g. "VAN AERT Wout"           → "Wout Van Aert"
//      "DE LA CRUZ David"        → "David De La Cruz"
//      "MATAMOROS Sergio Emiliano"→ "Sergio Emiliano Matamoros"
//      "POGAČAR Tadej"           → "Tadej Pogačar"
// ── Name formatting ───────────────────────────────────────────────────────────
// DB stores names as "LASTNAME Firstname" (e.g. "MARTIN Dan", "VAN AERT Wout").
// All functions below treat the DB string as the source of truth and only
// reformat for display. No heuristic "all-caps" splitting happens at search time.

function _toTitleCase(w){
  if(!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

// Returns true if a word is fully uppercased (the DB last-name convention)
function _isAllCaps(w){
  return /[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÃÕÑČŠŽĆĐ]/u.test(w) && w === w.toUpperCase();
}

// Split a DB-format name into { first, last, display }
// DB format: "LASTNAME Firstname" — uppercase words are last name, rest is first name.
// e.g. "MARTIN Dan"      → { last:"Martin",   first:"Dan",  display:"Dan Martin" }
//      "VAN AERT Wout"   → { last:"Van Aert",  first:"Wout", display:"Wout Van Aert" }
//      "POGAČAR Tadej"   → { last:"Pogačar",   first:"Tadej",display:"Tadej Pogačar" }
function _parseRiderName(dbName){
  if(!dbName) return { first: '', last: '', display: '' };
  const parts = dbName.trim().split(/\s+/).filter(Boolean);
  let splitIdx = parts.length; // assume all words are last name until proven otherwise
  for(let i = 0; i < parts.length; i++){
    if(!_isAllCaps(parts[i])){ splitIdx = i; break; }
  }
  const last  = parts.slice(0, splitIdx).map(_toTitleCase).join(' ');
  const first = parts.slice(splitIdx).join(' ');
  return { first, last, display: first ? first + ' ' + last : last };
}

// Display-only: convert DB "MARTIN Dan" → "Dan Martin"
// Also handles plain "Lastname Firstname" title-case names from race_results.top10
// by looking them up in _riderNameMap (populated from startlists fetches).
function formatRiderName(name){
  if(!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const hasAllCapsWord = parts.some(w => _isAllCaps(w));
  // Already in DB format — parse and flip
  if(hasAllCapsWord) return _parseRiderName(name).display || _toTitleCase(name);
  // Look up in the name map (populated from startlists) to get proper DB format, then flip
  const canonical = _riderNameMap.get(name.trim().toLowerCase());
  if(canonical) return _parseRiderName(canonical).display || _toTitleCase(canonical);
  // Fallback: return as-is with title case (already in display order or unknown format)
  return parts.map(_toTitleCase).join(' ');
}

// Generate every possible DB-format string from a user query by trying all split points
// from both directions.
//
// DB format is always "LASTNAME Firstname" where LASTNAME words are uppercase.
// Given "jurgen van den broeck", we try every possible assignment of words to
// last-name vs first-name, from both ends:
//   From back:  last i words = last name → "BROECK Jurgen van den",
//               "DEN BROECK Jurgen van", "VAN DEN BROECK Jurgen" ✓, "JURGEN VAN DEN BROECK"
//   From front: first i words = last name → "JURGEN van den broeck",
//               "JURGEN VAN den broeck", "JURGEN VAN DEN broeck", "JURGEN VAN DEN BROECK"
//
// One of these will be an ilike substring match for the actual DB name.
function _queryToDbVariants(q){
  const words = q.trim().split(/\s+/).filter(Boolean);
  if(words.length === 0) return [];
  if(words.length === 1) return [words[0]];
  const variants = new Set();
  for(let i = 1; i <= words.length; i++){
    // Last i words as last name (DB puts last name first, first name after)
    const lastPart  = words.slice(words.length - i).map(w => w.toUpperCase()).join(' ');
    const firstPart = words.slice(0, words.length - i).join(' ');
    variants.add(firstPart ? lastPart + ' ' + firstPart : lastPart);
    // First i words as last name
    const lastPart2  = words.slice(0, i).map(w => w.toUpperCase()).join(' ');
    const firstPart2 = words.slice(i).join(' ');
    variants.add(firstPart2 ? lastPart2 + ' ' + firstPart2 : lastPart2);
  }
  return [...variants];
}
