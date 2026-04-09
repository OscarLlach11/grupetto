function navBack(){
  if(_appHistoryDepth > 0){
    _appHistoryDepth--;
    history.back();
  } else {
    showPage('discover');
  }
}

function showPage(p){
  // Redirect guests away from auth-only pages
  if(!currentUser && (p==='log' || p==='profile' || p==='stats')){ openAuthModal(); return; }
  if(aPg==='log' && p!=='log'){
    logFilter = { rating:0, country:'', type:'', sort:'date', live:'' };
  }
  // Reset ALL discover filters when leaving the discover page
  if(aPg==='discover' && p!=='discover'){
    aTab='all'; aFil='all'; aSearch=''; aTier='all';
    localStorage.removeItem('g3-filters');
    const si=document.getElementById('search-input'); if(si) si.value='';
    document.querySelectorAll('.tier-btn').forEach((x,i)=>x.classList.toggle('active',i===0));
    if(aDiscSection==='riders') resetRiderSearch();
  }
  // Reset sub-page scroll when leaving race/stage/rider/review/edition pages
  if(['race','stage','rider','review','edition'].includes(aPg) && !['race','stage','rider','review','edition'].includes(p)){
    ['#page-race .race-scroll-body','#page-stage .race-scroll-body','#page-rider .rider-scroll-body','#page-review .race-scroll-body','#page-edition .race-scroll-body'].forEach(sel=>{
      const el=document.querySelector(sel); if(el) el.scrollTop=0;
    });
  }
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  document.querySelectorAll('.nav-a').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('active'));
  const nb=document.getElementById('nav-'+p); if(nb) nb.classList.add('active');
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('active'));
  const mb=document.getElementById('mob-nav-'+p); if(mb) mb.classList.add('active');
  aPg=p;
  if(['discover','log','top','stats','profile'].includes(p)){
    localStorage.setItem('g3-activePage', p);
    // Push hash so page reload restores position (except discover/races which is the default)
    if(p === 'discover' && aDiscSection !== 'riders') history.replaceState(null, '', location.pathname);
    else if(p !== 'discover') history.replaceState(null, '', `#/${p}`);
  }
  if(p!=='discover') curRacePageId=null;
  if(p!=='edition'){ _curEditionSlug=null; _curEditionYear=null; }
  if(p==='log') renderLogPage();
  else if(p==='top') renderLeaderboard();
  else if(p==='stats'){
    loadRaceResultsForLog().then(async ()=>{
      // Also load stage winners for all logged stages so getRiderData() can use them
      const stageFetches = [];
      Object.entries(stageLog).forEach(([raceId, years]) => {
        Object.keys(years).forEach(year => {
          if(!STAGES_CACHE[raceId]?.[year]) {
            stageFetches.push(loadStages(raceId, parseInt(year)));
          }
        });
      });
      if(stageFetches.length) await Promise.all(stageFetches);
      renderStats();
    });
  }
  else if(p==='profile') renderProfile();
  else if(p==='followers') {} // rendered by openFollowersPage()
  else if(p==='user') {}      // rendered by openUserPage()
  else if(p==='members') { renderMembersPage(); }
  else if(p==='discover') {
    renderTabs(); renderGrid();
    if(aDiscSection==='riders') renderRiders();
    loadFollowingFeed();
  }
}

// ════════════════════════════════════════════════════════
//  TABS / FILTERS / SEARCH
// ════════════════════════════════════════════════════════
let aTab='all',aFil='all',aSearch='',aTier='all';

function saveDiscoverFilters(){
  localStorage.setItem('g3-filters', JSON.stringify({aTab,aFil,aSearch}));
}

function restoreDiscoverFilters(){
  try {
    const saved = JSON.parse(localStorage.getItem('g3-filters') || '{}');
    aTab   = saved.aTab   || 'all';
    aFil   = saved.aFil   || 'all';
    aSearch= saved.aSearch|| '';
    aTier  = 'all'; // always reset tier to default on page load
    // Restore UI state for tier buttons
    document.querySelectorAll('.tier-btn').forEach(btn => {
      const t = btn.getAttribute('onclick')?.match(/'(\w+)'\)/)?.[1];
      btn.classList.toggle('active', t === aTier);
    });
    // Restore search input
    const si = document.getElementById('search-input');
    if(si) si.value = aSearch;
  } catch(e) {}
}

// ── Championship country data ─────────────────────────────────────────────────
// Maps country name (as it appears in PCS race_name) → { flag, gradient }
// Includes common PCS aliases (e.g. "Great Britain", "United States", "Korea").
const COUNTRY_CHAMP_DATA = {
  'Afghanistan':      { flag:'🇦🇫', gradient:'linear-gradient(135deg,#000000,#009a44,#000000)' },
  'Albania':          { flag:'🇦🇱', gradient:'linear-gradient(135deg,#e41e20,#000000)' },
  'Algeria':          { flag:'🇩🇿', gradient:'linear-gradient(135deg,#006233,#ffffff,#d21034)' },
  'Argentina':        { flag:'🇦🇷', gradient:'linear-gradient(135deg,#74acdf,#ffffff,#74acdf)' },
  'Armenia':          { flag:'🇦🇲', gradient:'linear-gradient(135deg,#d90012,#0033a0,#f2a800)' },
  'Australia':        { flag:'🇦🇺', gradient:'linear-gradient(135deg,#00008b,#cf142b,#ffffff)' },
  'Austria':          { flag:'🇦🇹', gradient:'linear-gradient(135deg,#ed2939,#ffffff,#ed2939)' },
  'Azerbaijan':       { flag:'🇦🇿', gradient:'linear-gradient(135deg,#0092bc,#e8192c,#00b050)' },
  'Bahrain':          { flag:'🇧🇭', gradient:'linear-gradient(135deg,#ce1126,#ffffff)' },
  'Belarus':          { flag:'🇧🇾', gradient:'linear-gradient(135deg,#cf101a,#009027,#ffffff)' },
  'Belgium':          { flag:'🇧🇪', gradient:'linear-gradient(135deg,#000000,#ffd90c,#ef3340)' },
  'Bolivia':          { flag:'🇧🇴', gradient:'linear-gradient(135deg,#d52b1e,#f4e400,#007a3d)' },
  'Bosnia':           { flag:'🇧🇦', gradient:'linear-gradient(135deg,#002395,#fecb00)' },
  'Brazil':           { flag:'🇧🇷', gradient:'linear-gradient(135deg,#009c3b,#ffdf00,#002776)' },
  'Bulgaria':         { flag:'🇧🇬', gradient:'linear-gradient(135deg,#ffffff,#00966e,#d62612)' },
  'Canada':           { flag:'🇨🇦', gradient:'linear-gradient(135deg,#ff0000,#ffffff,#ff0000)' },
  'Chile':            { flag:'🇨🇱', gradient:'linear-gradient(135deg,#d52b1e,#ffffff,#003087)' },
  'China':            { flag:'🇨🇳', gradient:'linear-gradient(135deg,#de2910,#ffde00)' },
  'Colombia':         { flag:'🇨🇴', gradient:'linear-gradient(135deg,#fcd116,#003087,#ce1126)' },
  'Costa Rica':       { flag:'🇨🇷', gradient:'linear-gradient(135deg,#002b7f,#ffffff,#ce1126,#ffffff,#002b7f)' },
  'Croatia':          { flag:'🇭🇷', gradient:'linear-gradient(135deg,#ff0000,#ffffff,#003087)' },
  'Cuba':             { flag:'🇨🇺', gradient:'linear-gradient(135deg,#002a8f,#ffffff,#cc0001)' },
  'Cyprus':           { flag:'🇨🇾', gradient:'linear-gradient(135deg,#ffffff,#d57800)' },
  'Czech Republic':   { flag:'🇨🇿', gradient:'linear-gradient(135deg,#d7141a,#ffffff,#11457e)' },
  'Denmark':          { flag:'🇩🇰', gradient:'linear-gradient(135deg,#c60c30,#ffffff)' },
  'Ecuador':          { flag:'🇪🇨', gradient:'linear-gradient(135deg,#ffd100,#003087,#ce1126)' },
  'Egypt':            { flag:'🇪🇬', gradient:'linear-gradient(135deg,#ce1126,#ffffff,#000000)' },
  'El Salvador':      { flag:'🇸🇻', gradient:'linear-gradient(135deg,#0f47af,#ffffff,#0f47af)' },
  'Estonia':          { flag:'🇪🇪', gradient:'linear-gradient(135deg,#0072ce,#000000,#ffffff)' },
  'Ethiopia':         { flag:'🇪🇹', gradient:'linear-gradient(135deg,#078930,#fcdd09,#da121a)' },
  'Finland':          { flag:'🇫🇮', gradient:'linear-gradient(135deg,#ffffff,#003580)' },
  'France':           { flag:'🇫🇷', gradient:'linear-gradient(135deg,#002395,#ffffff,#ed2939)' },
  'Georgia':          { flag:'🇬🇪', gradient:'linear-gradient(135deg,#ffffff,#ff0000)' },
  'Germany':          { flag:'🇩🇪', gradient:'linear-gradient(135deg,#000000,#dd0000,#ffce00)' },
  'Ghana':            { flag:'🇬🇭', gradient:'linear-gradient(135deg,#006b3f,#fcd116,#ce1126)' },
  'Great Britain':    { flag:'🇬🇧', gradient:'linear-gradient(135deg,#012169,#c8102e,#ffffff)' },
  'Greece':           { flag:'🇬🇷', gradient:'linear-gradient(135deg,#0d5eaf,#ffffff)' },
  'Guatemala':        { flag:'🇬🇹', gradient:'linear-gradient(135deg,#4997d0,#ffffff,#4997d0)' },
  'Hungary':          { flag:'🇭🇺', gradient:'linear-gradient(135deg,#ce2939,#ffffff,#477050)' },
  'Iceland':          { flag:'🇮🇸', gradient:'linear-gradient(135deg,#003897,#ffffff,#d72828)' },
  'India':            { flag:'🇮🇳', gradient:'linear-gradient(135deg,#ff9933,#ffffff,#138808)' },
  'Indonesia':        { flag:'🇮🇩', gradient:'linear-gradient(135deg,#ce1126,#ffffff)' },
  'Iran':             { flag:'🇮🇷', gradient:'linear-gradient(135deg,#239f40,#ffffff,#da0000)' },
  'Iraq':             { flag:'🇮🇶', gradient:'linear-gradient(135deg,#ce1126,#ffffff,#000000)' },
  'Ireland':          { flag:'🇮🇪', gradient:'linear-gradient(135deg,#169b62,#ffffff,#ff883e)' },
  'Israel':           { flag:'🇮🇱', gradient:'linear-gradient(135deg,#ffffff,#0038b8)' },
  'Italy':            { flag:'🇮🇹', gradient:'linear-gradient(135deg,#009246,#ffffff,#ce2b37)' },
  'Japan':            { flag:'🇯🇵', gradient:'linear-gradient(135deg,#ffffff,#bc002d)' },
  'Jordan':           { flag:'🇯🇴', gradient:'linear-gradient(135deg,#007a3d,#ffffff,#000000)' },
  'Kazakhstan':       { flag:'🇰🇿', gradient:'linear-gradient(135deg,#00afca,#ffd700)' },
  'Kenya':            { flag:'🇰🇪', gradient:'linear-gradient(135deg,#006600,#000000,#cc0000)' },
  'Kosovo':           { flag:'🇽🇰', gradient:'linear-gradient(135deg,#244aa5,#fcd116)' },
  'Kuwait':           { flag:'🇰🇼', gradient:'linear-gradient(135deg,#007a3d,#ffffff,#ce1126,#000000)' },
  'Kyrgyzstan':       { flag:'🇰🇬', gradient:'linear-gradient(135deg,#e8112d,#ffd700)' },
  'Latvia':           { flag:'🇱🇻', gradient:'linear-gradient(135deg,#9e3039,#ffffff,#9e3039)' },
  'Lebanon':          { flag:'🇱🇧', gradient:'linear-gradient(135deg,#ffffff,#ee161f)' },
  'Lithuania':        { flag:'🇱🇹', gradient:'linear-gradient(135deg,#fdb913,#006a44,#c1272d)' },
  'Luxembourg':       { flag:'🇱🇺', gradient:'linear-gradient(135deg,#ef3340,#ffffff,#00a2e1)' },
  'Malaysia':         { flag:'🇲🇾', gradient:'linear-gradient(135deg,#cc0001,#ffffff,#010082)' },
  'Mexico':           { flag:'🇲🇽', gradient:'linear-gradient(135deg,#006847,#ffffff,#ce1126)' },
  'Moldova':          { flag:'🇲🇩', gradient:'linear-gradient(135deg,#003DA5,#FFD200,#CC0000)' },
  'Montenegro':       { flag:'🇲🇪', gradient:'linear-gradient(135deg,#d4af37,#d3001c,#d4af37)' },
  'Morocco':          { flag:'🇲🇦', gradient:'linear-gradient(135deg,#c1272d,#006233)' },
  'Netherlands':      { flag:'🇳🇱', gradient:'linear-gradient(135deg,#ae1c28,#ffffff,#21468b)' },
  'New Zealand':      { flag:'🇳🇿', gradient:'linear-gradient(135deg,#00247d,#cc142b)' },
  'Nigeria':          { flag:'🇳🇬', gradient:'linear-gradient(135deg,#008751,#ffffff,#008751)' },
  'North Macedonia':  { flag:'🇲🇰', gradient:'linear-gradient(135deg,#ce2028,#f9d616)' },
  'Norway':           { flag:'🇳🇴', gradient:'linear-gradient(135deg,#ef2b2d,#ffffff,#002868)' },
  'Pakistan':         { flag:'🇵🇰', gradient:'linear-gradient(135deg,#01411c,#ffffff)' },
  'Panama':           { flag:'🇵🇦', gradient:'linear-gradient(135deg,#da121a,#ffffff,#005293)' },
  'Paraguay':         { flag:'🇵🇾', gradient:'linear-gradient(135deg,#d52b1e,#ffffff,#0038a8)' },
  'Peru':             { flag:'🇵🇪', gradient:'linear-gradient(135deg,#d91023,#ffffff,#d91023)' },
  'Philippines':      { flag:'🇵🇭', gradient:'linear-gradient(135deg,#0038a8,#ffffff,#ce1126)' },
  'Poland':           { flag:'🇵🇱', gradient:'linear-gradient(135deg,#ffffff,#dc143c)' },
  'Portugal':         { flag:'🇵🇹', gradient:'linear-gradient(135deg,#006600,#ff0000)' },
  'Puerto Rico':      { flag:'🇵🇷', gradient:'linear-gradient(135deg,#ed0000,#ffffff,#002a8f)' },
  'Romania':          { flag:'🇷🇴', gradient:'linear-gradient(135deg,#002b7f,#fcd116,#ce1126)' },
  'Russia':           { flag:'🇷🇺', gradient:'linear-gradient(135deg,#ffffff,#0039a6,#d52b1e)' },
  'Saudi Arabia':     { flag:'🇸🇦', gradient:'linear-gradient(135deg,#006c35,#ffffff)' },
  'Serbia':           { flag:'🇷🇸', gradient:'linear-gradient(135deg,#c6363c,#0c4076,#ffffff)' },
  'Singapore':        { flag:'🇸🇬', gradient:'linear-gradient(135deg,#ef3340,#ffffff)' },
  'Slovakia':         { flag:'🇸🇰', gradient:'linear-gradient(135deg,#ffffff,#0b4ea2,#ee1c25)' },
  'Slovenia':         { flag:'🇸🇮', gradient:'linear-gradient(135deg,#003DA5,#ffffff,#CC0000)' },
  'South Africa':     { flag:'🇿🇦', gradient:'linear-gradient(135deg,#007a4d,#000000,#ffb81c,#ffffff,#de3831,#002395)' },
  'South Korea':      { flag:'🇰🇷', gradient:'linear-gradient(135deg,#ffffff,#cd2e3a,#003478)' },
  'Spain':            { flag:'🇪🇸', gradient:'linear-gradient(135deg,#aa151b,#f1bf00,#aa151b)' },
  'Sweden':           { flag:'🇸🇪', gradient:'linear-gradient(135deg,#006aa7,#fecc02)' },
  'Switzerland':      { flag:'🇨🇭', gradient:'linear-gradient(135deg,#ff0000,#ffffff)' },
  'Taiwan':           { flag:'🇹🇼', gradient:'linear-gradient(135deg,#fe0000,#000095)' },
  'Thailand':         { flag:'🇹🇭', gradient:'linear-gradient(135deg,#a51931,#ffffff,#2d2a4a,#ffffff,#a51931)' },
  'Tunisia':          { flag:'🇹🇳', gradient:'linear-gradient(135deg,#e70013,#ffffff)' },
  'Turkey':           { flag:'🇹🇷', gradient:'linear-gradient(135deg,#e30a17,#ffffff)' },
  'Ukraine':          { flag:'🇺🇦', gradient:'linear-gradient(135deg,#005bbb,#ffd500)' },
  'UAE':              { flag:'🇦🇪', gradient:'linear-gradient(135deg,#00732f,#ffffff,#000000,#ff0000)' },
  'United States':    { flag:'🇺🇸', gradient:'linear-gradient(135deg,#b22234,#ffffff,#3c3b6e)' },
  'Uruguay':          { flag:'🇺🇾', gradient:'linear-gradient(135deg,#ffffff,#5b9bd5)' },
  'Uzbekistan':       { flag:'🇺🇿', gradient:'linear-gradient(135deg,#1eb53a,#ffffff,#ce1126)' },
  'Venezuela':        { flag:'🇻🇪', gradient:'linear-gradient(135deg,#cf142b,#ffffff,#00247d)' },
  'Vietnam':          { flag:'🇻🇳', gradient:'linear-gradient(135deg,#da251d,#ffcd00)' },
  // ── PCS-specific aliases and additional countries ──────────────────────────
  'Great Britain':    { flag:'🇬🇧', gradient:'linear-gradient(135deg,#012169,#c8102e,#ffffff)' },
  'United States':    { flag:'🇺🇸', gradient:'linear-gradient(135deg,#b22234,#ffffff,#3c3b6e)' },
  'USA':              { flag:'🇺🇸', gradient:'linear-gradient(135deg,#b22234,#ffffff,#3c3b6e)' },
  'Korea':            { flag:'🇰🇷', gradient:'linear-gradient(135deg,#ffffff,#cd2e3a,#003478)' },
  'Chinese Taipei':   { flag:'🇹🇼', gradient:'linear-gradient(135deg,#fe0000,#000095)' },
  'Hong Kong':        { flag:'🇭🇰', gradient:'linear-gradient(135deg,#de2910,#ffffff)' },
  'Czechia':          { flag:'🇨🇿', gradient:'linear-gradient(135deg,#d7141a,#ffffff,#11457e)' },
  'Slovak Republic':  { flag:'🇸🇰', gradient:'linear-gradient(135deg,#ffffff,#0b4ea2,#ee1c25)' },
  'Bosnia and Herzegovina': { flag:'🇧🇦', gradient:'linear-gradient(135deg,#002395,#fecb00)' },
  'Trinidad and Tobago': { flag:'🇹🇹', gradient:'linear-gradient(135deg,#ce1126,#000000,#ffffff)' },
  'North Korea':      { flag:'🇰🇵', gradient:'linear-gradient(135deg,#024fa2,#ffffff,#be0000)' },
  'Dominican Republic': { flag:'🇩🇴', gradient:'linear-gradient(135deg,#002d62,#ffffff,#ce1126)' },
  'Burkina Faso':     { flag:'🇧🇫', gradient:'linear-gradient(135deg,#ef2b2d,#fcd116,#009a00)' },
  'Cameroon':         { flag:'🇨🇲', gradient:'linear-gradient(135deg,#007a5e,#ce1126,#fcd116)' },
  'Ivory Coast':      { flag:'🇨🇮', gradient:'linear-gradient(135deg,#f77f00,#ffffff,#009a44)' },
  'Democratic Republic of Congo': { flag:'🇨🇩', gradient:'linear-gradient(135deg,#007fff,#f7d618,#ce1126)' },
  'Eritrea':          { flag:'🇪🇷', gradient:'linear-gradient(135deg,#4189dd,#12ad2b,#ff0000)' },
  'Rwanda':           { flag:'🇷🇼', gradient:'linear-gradient(135deg,#20603d,#fad201,#20a0d6)' },
  'Senegal':          { flag:'🇸🇳', gradient:'linear-gradient(135deg,#00853f,#fdef42,#e31b23)' },
  'Tanzania':         { flag:'🇹🇿', gradient:'linear-gradient(135deg,#1eb53a,#000000,#fcd116,#009bde)' },
  'Uganda':           { flag:'🇺🇬', gradient:'linear-gradient(135deg,#000000,#fcdc04,#de3908)' },
  'Zimbabwe':         { flag:'🇿🇼', gradient:'linear-gradient(135deg,#006400,#ffd200,#d40000,#000000)' },
  'New Caledonia':    { flag:'🇳🇨', gradient:'linear-gradient(135deg,#009a44,#fcd116,#ce1126)' },
  'Puerto Rico':      { flag:'🇵🇷', gradient:'linear-gradient(135deg,#ed0000,#ffffff,#002a8f)' },
  'Serbia and Montenegro': { flag:'🇷🇸', gradient:'linear-gradient(135deg,#c6363c,#0c4076,#ffffff)' },
  'FR Yugoslavia':    { flag:'🇷🇸', gradient:'linear-gradient(135deg,#c6363c,#0c4076,#ffffff)' },
  'Soviet Union':     { flag:'🇷🇺', gradient:'linear-gradient(135deg,#cc0000,#cc0000)' },
  'East Germany':     { flag:'🇩🇪', gradient:'linear-gradient(135deg,#000000,#dd0000,#ffce00)' },
  'West Germany':     { flag:'🇩🇪', gradient:'linear-gradient(135deg,#000000,#dd0000,#ffce00)' },
  'Czechoslovakia':   { flag:'🇨🇿', gradient:'linear-gradient(135deg,#d7141a,#ffffff,#11457e)' },
  'Yugoslavia':       { flag:'🇷🇸', gradient:'linear-gradient(135deg,#0032a0,#ffffff,#de0000)' },
};
const CHAMP_CATEGORY_DATA = {
  'worlds':   { flag:'🌍', gradient:'linear-gradient(135deg,#8b0000 0%,#e84c00 20%,#d4a800 40%,#1a7a1a 60%,#0044cc 80%,#7b00d4 100%)' },
  'european': { flag:'🇪🇺', gradient:'linear-gradient(135deg,#003399 0%,#1558c0 50%,#ffcc00 100%)' },
};

function getChampData(r) {
  const sgs = r.subgenres || [];
  // 1. Category-level (worlds / european) wins first
  for (const cat of ['worlds','european']) {
    if (sgs.includes(cat) || r.id.includes(cat.replace('worlds','world-championship').replace('european','european-championship'))) {
      return CHAMP_CATEGORY_DATA[cat];
    }
  }
  if (r.id.startsWith('world-championship')) return CHAMP_CATEGORY_DATA['worlds'];
  if (r.id.startsWith('european-championship')) return CHAMP_CATEGORY_DATA['european'];

  // 2. Parse country from PCS race_name: "National Championships {Country} ME/WE/MU23/etc"
  const mName = r.name.match(/National Championships?\s+(.+?)\s+(?:ME|WE|MU23|WU23|MJ|WJ)(?:\s*[-\u2013]|$)/i);
  // 3. Broad slug match - grab everything after "national-championship(s)-", strip trailing discipline suffix
  const mSlug = r.id.match(/^national-championships?-(.+?)(?:-(?:me|we|mu23|wu23|mj|wj)(?:-itt)?)?$/i);

  const candidates = [];
  if (mName) candidates.push(mName[1].trim());
  if (mSlug) {
    const raw = mSlug[1].replace(/-/g, ' ');
    candidates.push(raw.replace(/\b\w/g, c => c.toUpperCase())); // Title Case
    candidates.push(raw.toUpperCase());                            // UPPERCASE fallback
  }

  // Aliases for countries whose PCS names differ from COUNTRY_CHAMP_DATA keys
  const ALIASES = { 'United Arab Emirates': 'UAE', 'Uae': 'UAE', 'UNITED ARAB EMIRATES': 'UAE' };

  for (const country of candidates) {
    const key = ALIASES[country] || country;
    if (COUNTRY_CHAMP_DATA[key]) return COUNTRY_CHAMP_DATA[key];
    const lower = country.toLowerCase();
    // Check aliases
    for (const [alias, aKey] of Object.entries(ALIASES)) {
      if (lower === alias.toLowerCase() || lower.includes(alias.toLowerCase())) {
        if (COUNTRY_CHAMP_DATA[aKey]) return COUNTRY_CHAMP_DATA[aKey];
      }
    }
    // Fuzzy substring match against all known countries
    for (const [k, v] of Object.entries(COUNTRY_CHAMP_DATA)) {
      if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
    }
  }

  // Last resort: scan slug word-by-word against all known country keys
  const slugLower = r.id.replace(/-/g, ' ').toLowerCase();
  for (const [k, v] of Object.entries(COUNTRY_CHAMP_DATA)) {
    if (slugLower.includes(k.toLowerCase())) return v;
  }

  if (candidates.length) return { flag: r.flag || '🏳', gradient: 'linear-gradient(135deg,#1e1e2e,#2a2a3e)' };
  return { flag: r.flag || '', gradient: r.gradient || 'linear-gradient(135deg,#1a1a1a,#333)' };
}

function isWT(r){ return r.tier === 'WT'; }
function isChamp(r){ return r.type === 'championship'; }

function setTier(el, t){
  aTier=t; aTab='all';
  document.querySelectorAll('.tier-btn').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  saveDiscoverFilters();
  renderTabs(); renderGrid();
}

function renderTabs(){
  const b=document.getElementById('tabs-bar');
  let types;
  if(aTier==='wt')         types=['Grand Tour','Monument','Classic','Stage Race','One Day'];
  else if(aTier==='pro')   types=['Stage Race','One Day'];
  else if(aTier==='champ') types=['RR','ITT'];
  else                     types=['Grand Tour','Monument','Classic','Stage Race','One Day'];
  // Only include types that exist in current tier
  const tierRaces = RACES.filter(r => aTier==='all' || (aTier==='wt'&&isWT(r)) || (aTier==='pro'&&!isWT(r)&&!isChamp(r)) || (aTier==='champ'&&isChamp(r)));
  const presentTypes = aTier==='champ'
    ? new Set(tierRaces.flatMap(r => {
        const sgs = r.subgenres || [];
        const tags = [...sgs];
        if (!tags.includes('ITT') && r.id.endsWith('-itt')) tags.push('ITT');
        if (!tags.includes('RR')  && !r.id.endsWith('-itt') && isChamp(r)) tags.push('RR');
        return tags;
      }))
    : new Set(tierRaces.map(r=>r.type));
  const filtered = types.filter(t => presentTypes.has(t));
  const labels = {'Grand Tour':'Grand Tours','Monument':'Monuments','Classic':'Classics','Stage Race':'Stage Races','One Day':'One Day','RR':'Road Race','ITT':'Time Trial'};
  const ts=[{k:'all',l:'All'},...filtered.map(t=>({k:t,l:labels[t]||t}))];
  b.innerHTML=ts.map(t=>`<div class="tab ${t.k===aTab?'active':''}" onclick="setTab(this,'${t.k}')">${t.l}</div>`).join('');
}
// Log-specific filters (separate from discover)
let logFilter = { rating: 0, country: '', type: '', sort: 'date', live: '' };

function setTab(el,t){aTab=t;document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));el.classList.add('active');saveDiscoverFilters();renderGrid();}
function setFilter(el,f){aFil=f;document.querySelectorAll('.fb').forEach(x=>x.classList.remove('active'));el.classList.add('active');saveDiscoverFilters();renderGrid();}
function setSearch(v){aSearch=v.toLowerCase();saveDiscoverFilters();renderGrid();}

// ── Log filter dropdown logic ────────────────────────────
function toggleLogDD(id){
  document.querySelectorAll('.log-filter-dd').forEach(d=>{ if(d.id!==id) d.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
  // Build half-star widget when rating dropdown opens
  if(id==='lfd-rating' && document.getElementById('lfd-rating').classList.contains('open')){
    const wrap = document.getElementById('lfd-hs-wrap');
    if(wrap){
      wrap.innerHTML = buildHSHTML('lfd-hs', 'filter', null, logFilter.rating||0);
      attachHSEvents('lfd-hs');
    }
  }
}
document.addEventListener('click', e=>{
  if(!e.target.closest('.log-filter-dd')) document.querySelectorAll('.log-filter-dd').forEach(d=>d.classList.remove('open'));
});
function setLogFilter(key, val){
  logFilter[key] = val;
  document.querySelectorAll('.log-filter-dd').forEach(d=>d.classList.remove('open'));
  updateLogFilterUI();
  renderLogPage();
}
function clearLogFilters(){
  logFilter = { rating:0, country:'', type:'', sort:'date', live:'' };
  updateLogFilterUI();
  renderLogPage();
}
function filterByCountry(country){
  logFilter.country = country;
  showPage('log');
  updateLogFilterUI();
  renderLogPage();
}
function filterByRating(rating){
  logFilter.rating = rating;
  showPage('log');
  updateLogFilterUI();
  renderLogPage();
}
function updateLogFilterUI(){
  const rEl=document.getElementById('lfd-rating-val');
  const cEl=document.getElementById('lfd-country-val');
  const tEl=document.getElementById('lfd-type-val');
  const sEl=document.getElementById('lfd-sort-val');
  if(rEl) rEl.textContent = logFilter.rating ? `★${logFilter.rating}` : '';
  if(cEl) cEl.textContent = logFilter.country ? logFilter.country.replace(/^\S+\s*/,'') : '';
  if(tEl) tEl.textContent = logFilter.type || '';
  const sortLabels={date:'Date',rating:'Rating',name:'Name',year:'Year'};
  if(sEl) sEl.textContent = sortLabels[logFilter.sort]||'Date';

  // Refresh HS widget if open
  const hsWrap = document.getElementById('lfd-hs');
  if(hsWrap) hsUpdateDisplay(hsWrap, logFilter.rating||0);

  // Type options
  document.querySelectorAll('.lfd-type-opt').forEach(o=>{
    o.classList.toggle('active', o.dataset.v===logFilter.type);
  });

  const liveEl=document.getElementById('lfd-live-val');
  if(liveEl) liveEl.textContent = logFilter.live==='live' ? '🔴 Live' : logFilter.live==='replay' ? 'Replay' : '';

  // Live options
  document.querySelectorAll('#lfd-live .lfd-type-opt').forEach(o=>{
    o.classList.toggle('active', o.dataset.v===logFilter.live);
  });

  const hasFilter = logFilter.rating || logFilter.country || logFilter.type || logFilter.live;
  const cl=document.getElementById('log-clear-filters');
  if(cl) cl.style.display = hasFilter ? 'block' : 'none';

  // Country dropdown
  const panel=document.getElementById('lfd-country-panel');
  if(panel){
    const all=allEntries();
    const countries={};
    all.forEach(([id])=>{ const r=RACES.find(x=>x.id===id); if(r){ const k=`${r.flag||''} ${r.country}`.trim(); countries[k]=(countries[k]||0)+1; } });
    const sorted=Object.entries(countries).sort((a,b)=>b[1]-a[1]);
    panel.innerHTML=`<div class="log-dd-opt${!logFilter.country?' active':''}" onclick="setLogFilter('country','')">Any Country</div>`+
      sorted.map(([c,n])=>`<div class="log-dd-opt${logFilter.country===c?' active':''}" data-c="${encodeURIComponent(c)}" onclick="setLogFilter('country',decodeURIComponent(this.dataset.c))">${c} <span style="color:var(--muted);font-size:10px;margin-left:4px;">${n}</span></div>`).join('');
  }
}

let aDiscSection='races';
function setDiscoverSection(section){
  // Reset rider search when leaving the riders section
  if(aDiscSection === 'riders' && section !== 'riders') resetRiderSearch();
  aDiscSection=section;
  document.querySelectorAll('.disc-subtab').forEach(x=>x.classList.remove('active'));
  const btn=document.getElementById('dsubt-'+section);
  if(btn) btn.classList.add('active');
  document.getElementById('disc-section-races').style.display=section==='races'?'block':'none';
  document.getElementById('disc-section-riders').style.display=section==='riders'?'block':'none';
  // Update hash so reload stays on this sub-section
  if(section === 'riders') history.replaceState(null, '', '#/discover/riders');
  else history.replaceState(null, '', location.pathname);
  if(section==='riders') renderRiders();
}

// ════════════════════════════════════════════════════════
//  FUTURE BLOCKING
// ════════════════════════════════════════════════════════
function isFuture(id,year){
  if(year>CY) return true;
  if(year<CY) return false;
  const fd=getRaceFinalDate(id,year);
  return fd?fd>TODAY:false;
}
function availYears(id){
  const r=RACES.find(x=>x.id===id); if(!r) return [];
  const ys=[];
  for(let y=CY;y>=r.tvYear;y--) if(!isFuture(id,y)) ys.push(y);
  return ys;
}

// ════════════════════════════════════════════════════════
//  RENDER ALL
// ════════════════════════════════════════════════════════
function renderAll(){renderGrid();renderSidebar();updateStats();if(curRacePageId) openRacePage(curRacePageId, null, false); if(_curEditionSlug && _curEditionYear && aPg==='edition') openEditionPage(_curEditionSlug, _curEditionYear, false);}

function filteredRaces(){
  const filtered = RACES.filter(r=>{
    if(aTier==='wt'    && (!isWT(r) || isChamp(r))) return false;
    if(aTier==='pro'   && (isWT(r)  || isChamp(r))) return false;
    if(aTier==='champ' && !isChamp(r))              return false;
    // For championships, RR/ITT tabs filter by subgenres array (or slug suffix fallback)
    if(aTier==='champ' && aTab==='ITT' && !(r.subgenres||[]).includes('ITT') && !r.id.endsWith('-itt')) return false;
    if(aTier==='champ' && aTab==='RR'  && !(r.subgenres||[]).includes('RR')  && r.id.endsWith('-itt')) return false;
    if(aTier!=='champ' && aTab!=='all' && r.type!==aTab) return false;
    const l=hasLog(r.id);
    if(aFil==='logged'&&!l) return false;
    if(aFil==='unlogged'&&l) return false;
    if(aFil==='watchlist'&&!watchlist.includes(r.id)) return false;
    if(aSearch&&!r.name.toLowerCase().includes(aSearch)&&!r.country.toLowerCase().includes(aSearch)) return false;
    return true;
  });
  // Helper: get race date for sorting — prefer 2025, then most recent year available
  const sortDate = r => {
    const dates = RACE_DATES[r.id];
    if(!dates) return '';
    // Try 2025 first, then walk back through available years
    for(const y of [2025, 2024, 2023, 2022, 2021, 2020]){
      if(dates[y]) return dates[y];
    }
    // Fallback: any year
    const years = Object.keys(dates).map(Number).sort((a,b)=>b-a);
    for(const y of years){ if(dates[y]) return dates[y]; }
    return '';
  };
  filtered.sort((a,b)=>{
    const aWT = isWT(a) ? 0 : 1;
    const bWT = isWT(b) ? 0 : 1;
    if(aWT !== bWT) return aWT - bWT;
    // Within tier: compare MM-DD only (calendar position in the season)
    const mmddA = (sortDate(a)||'').slice(5);
    const mmddB = (sortDate(b)||'').slice(5);
    if(mmddA && mmddB) return mmddA.localeCompare(mmddB);
    if(mmddA) return -1;
    if(mmddB) return 1;
    return (a.tvYear||a.firstYear||9999) - (b.tvYear||b.firstYear||9999);
  });
  return filtered;
}

function renderGrid(){
  const races=filteredRaces();
  const grid=document.getElementById('race-grid');
  const none=document.getElementById('no-results');
  if(!races.length){grid.innerHTML='';none.style.display='block';return;}
  none.style.display='none';
  grid.innerHTML=races.map((r,i)=>{
    const rl=userLog[r.id];
    const cnt=rl?(rl.watches||[]).length:0;
    const bestR=rl?Math.max(0,...(rl.watches||[]).map(w=>w.rating||0)):0;
    const inWL=watchlist.includes(r.id);
    const sgs = r.subgenres || [];
    // For championships: resolve flag, gradient and label from country map
    const champData = isChamp(r) ? getChampData(r) : null;
    const dispFlag     = champData ? champData.flag     : (r.flag || '');
    const dispGradient = champData ? champData.gradient : r.gradient;
    // RR/ITT label — fall back to slug suffix if subgenres not yet seeded
    const isITT = sgs.includes('ITT') || r.id.endsWith('-itt');
    const isRR  = sgs.includes('RR')  || (!isITT && isChamp(r));
    const champLabel = isChamp(r) ? (isRR && isITT ? 'RR + ITT' : isITT ? 'Time Trial' : 'Road Race') : '';
    // Worlds / European logos — injected by slug, no DB change needed
    const CHAMP_LOGOS = {
      'world-championship':     'https://upload.wikimedia.org/wikipedia/commons/b/b4/Jersey_rainbow.svg',
      'world-championship-itt': 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Jersey_rainbow.svg',
    };
    const effectiveLogoUrl = r.logoUrl || CHAMP_LOGOS[r.id] || null;
    return `<div class="rc" style="animation-delay:${Math.min(i*.025,.5)}s" onclick="openRacePage('${r.id}')">
      <div class="rc-img" style="background:${dispGradient};position:relative;overflow:hidden;">
        <span class="rc-cat">${r.type==='championship'?'CHAMPS':r.type.toUpperCase()}</span>${isWT(r)&&!isChamp(r)?'<span class="rc-wt">WT</span>':''}
        ${effectiveLogoUrl
          ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:10px 8px 22px;"><img src="${effectiveLogoUrl}" alt="${r.name}" style="max-width:80%;max-height:70%;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5));" onerror="this.parentElement.remove()"></div>`
          : isChamp(r) && dispFlag
            ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><span style="font-size:48px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6));">${dispFlag}</span></div>`
            : ''}
      </div>
      <div class="rc-body">
        <div class="rc-ctry">${dispFlag} ${r.country}</div>
        <div class="rc-name">${r.name}</div>
        ${isChamp(r)&&champLabel?`<div class="rc-yr" style="color:var(--gold);font-size:10px;letter-spacing:1px;text-transform:uppercase;">${champLabel}</div>`:''}
        <div class="rc-yr">Est. ${r.firstYear}</div>
        <div class="stars" style="margin-bottom:4px;">${starsHTML(bestR,11)}</div>
        <div class="ra">
          <button class="bsm logged ${cnt?'active':''}" onclick="event.stopPropagation();openLogModal('${r.id}')">${cnt?`✓ ${cnt} logged`:'+ Log'}</button>
          <button class="bsm ${inWL?'active':''}" onclick="event.stopPropagation();toggleWL('${r.id}')">${inWL?'★':'☆'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  RACE SUBPAGE
// ════════════════════════════════════════════════════════
let curRacePageId = null;
let _curEditionSlug = null, _curEditionYear = null, _curEditionYears = [];

// ── Year nav for edition page ─────────────────────────────────────────────
function editionNavYear(dir, specificYear){
  const years = _curEditionYears;
  if(!years.length || !_curEditionSlug) return;
  let target;
  if(specificYear !== undefined){
    target = specificYear;
  } else {
    const idx = years.indexOf(_curEditionYear);
    const newIdx = idx + dir; // years sorted desc, so -1 = newer, +1 = older
    if(newIdx < 0 || newIdx >= years.length) return;
    target = years[newIdx];
  }
  openEditionPage(_curEditionSlug, target, true);
}

function updateEditionYearNav(years, currentYear){
  _curEditionYears = years;
  const sel = document.getElementById('edition-year-sel');
  const prevBtn = document.getElementById('edition-prev-btn');
  const nextBtn = document.getElementById('edition-next-btn');
  if(!sel) return;
  sel.innerHTML = years.map(y => `<option value="${y}"${y===currentYear?' selected':''}>${y}</option>`).join('');
  if(prevBtn) prevBtn.disabled = years.indexOf(currentYear) <= 0;
  if(nextBtn) nextBtn.disabled = years.indexOf(currentYear) >= years.length - 1;
}
