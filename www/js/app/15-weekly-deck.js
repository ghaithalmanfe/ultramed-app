// Weekly management deck: the Thursday PowerPoint built in the browser from the app's own data
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)

// Figures come from UMCore.weeklyReport (the same rules as the Today card and
// the reports); this file only lays them out. The PowerPoint library is loaded
// on demand from js/vendor, so the rest of the app never pays for it.
// Same look as the Smart Vending proposal deck: Calibri, dark green, Ultramed
// green, yellow accents, light green-grey cards.
const WD = {
  dk: '0B2A1B', green: '1E7A55', sage: '5B8C7A', soft: 'C9D9CF', paper: 'EEF4F0', mint: 'DCEBE1', gold: 'F2B705', goldInk: '8A6A00',
  ink: '0B2A1B', text2: '33463C', muted: '6B7C73', pos: '1E7A55', line: 'E3E9E5', white: 'FFFFFF', red: 'D9534F',
  head: 'Calibri', body: 'Calibri',
};
const WD_BRANDS = { philips: 'Philips Sonicare', waterpik: 'Waterpik', intensiv: 'Intensiv', 'b&l biotech': 'B&L Biotech', bundles: 'Kits & bundles',
  flash: 'Flash', 'the breath co': 'The Breath Co.', scheu: 'SCHEU', tepe: 'TePe', hismile: 'Hismile', undo: 'UNDO', 'beverly hills': 'BHF',
  eversmile: 'EverSmile', shenzhen: 'Shenzhen', univet: 'Univet', silonn: 'Silonn' };
function wdBrand(b){ return WD_BRANDS[b] || String(b || '—').replace(/\b[a-z]/g, m => m.toUpperCase()); }
function wdKD(n, dec){ const v = Number(n) || 0; return 'KD ' + v.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
function wdPct(x){ return x == null ? '—' : Math.round(x * 100) + '%'; }
function wdDay(d){ return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function wdRange(a, b){
  const A = new Date(a + 'T00:00:00'), B = new Date(b + 'T00:00:00');
  const same = A.getMonth() === B.getMonth();
  return (same ? A.getDate() : wdDay(a)) + ' – ' + wdDay(b) + ' ' + B.getFullYear();
}
function wdCut(s, n){ s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function loadPptxLib(){
  if(window.PptxGenJS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/pptxgen.bundle.js';
    s.onload = () => window.PptxGenJS ? resolve() : reject(new Error('PowerPoint library did not start'));
    s.onerror = () => reject(new Error('Could not load the PowerPoint library — check the connection and retry'));
    document.head.appendChild(s);
  });
}

function openWeeklyDeck(){
  if(currentUser.role !== 'supervisor'){ showToast('The weekly management deck is a supervisor tool'); return; }
  let ask = ''; try{ ask = localStorage.getItem('um-deck-ask') || ''; }catch(e){}
  const ph = uiLang === 'ar' ? 'شيء واحد يحتاجه الفريق من الإدارة — يُطبع بين علامتي تنصيص' : 'One thing the team needs from management — printed in quotes';
  showModal(`
    <h3 style="margin-top:0;">${I('chart')} Weekly management deck</h3>
    <div style="color:var(--muted); font-size:12.5px; margin:-4px 0 12px;">A PowerPoint for the Thursday meeting: the week's money first, the plan to close the month, then growth, relationships, the people and next week's commitments — every figure in the appendix. Built from the ERP files, the DSR targets and the visits in the app.</div>
    <label style="font-size:12.5px; font-weight:700;">Week ending</label>
    <input type="date" id="wdEnd" value="${todayStr()}" max="${todayStr()}" onchange="wdRenderChecks()" style="margin:4px 0 12px;">
    <label style="font-size:12.5px; font-weight:700;">Our ask (optional)</label>
    <input type="text" id="wdAsk" maxlength="90" placeholder="${esc(ph)}" value="${esc(ask)}" style="margin:4px 0 8px;">
    <div id="wdChecks"></div>
    <div id="wdStatus" style="font-size:12.5px; color:var(--muted); min-height:18px; margin-top:8px;"></div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="btn" onclick="downloadWeeklyDeck()">⬇️ Download PowerPoint</button>
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>`);
  wdRenderChecks();
}
// Before the meeting: what to fix in the app first (a person with no plan
// for next week, key accounts not planned, samples at a key account with no
// visit logged, no sales file, no target) — the deck is built either way.
function wdRenderChecks(){
  const el = document.getElementById('wdChecks'); if(!el) return;
  let checks = [];
  try{ checks = weeklyDeckData((document.getElementById('wdEnd') || {}).value || todayStr()).checks || []; }catch(e){ console.error('deck checks', e); }
  const ar = uiLang === 'ar';
  if(!checks.length){ el.innerHTML = `<div style="font-size:12.5px; color:var(--muted); margin:6px 0;">${ar ? '✅ قبل الاجتماع: لا شيء يحتاج تصحيحاً في التطبيق.' : '✅ Before the meeting: nothing to fix in the app.'}</div>`; return; }
  el.innerHTML = `<div style="font-size:12.5px; font-weight:700; margin:8px 0 4px;">${ar ? 'قبل الاجتماع، صحّح في التطبيق:' : 'Before the meeting, fix in the app:'}</div>` +
    checks.map(c => `<div style="font-size:12.5px; margin:3px 0; color:${c.level === 'warn' ? 'var(--coral-ink)' : 'var(--muted)'};">${c.level === 'warn' ? '⚠️' : 'ℹ️'} ${esc(ar && c.ar ? c.ar : c.text)}</div>`).join('');
}
async function downloadWeeklyDeck(){
  const st = document.getElementById('wdStatus');
  const say = (t, bad) => { if(st){ st.textContent = t; st.style.color = bad ? 'var(--coral-ink)' : 'var(--muted)'; } };
  try{
    say('Building the presentation…');
    const end = (document.getElementById('wdEnd') || {}).value || todayStr();
    const ask = String((document.getElementById('wdAsk') || {}).value || '').trim().slice(0, 90);
    try{ localStorage.setItem('um-deck-ask', ask); }catch(e){}
    const pres = await buildWeeklyDeck(end, { ask, progress: t => say(t) });
    await pres.writeFile({ fileName: `UltraMed-Weekly-Update-${end}.pptx` });
    say('✅ Downloaded — open it in PowerPoint.');
  }catch(e){ console.error('weekly deck', e); say('❌ ' + (e && e.message ? e.message : e), true); }
}
// Month labels for the trend charts: "Aug", "Sep", "Oct (to 8th)".
function wdMonth(row, withYear){
  const n = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(row.month.slice(5, 7), 10) - 1] + (withYear ? ' ' + row.month.slice(0, 4) : '');
  return row.partial ? n + ' (to ' + parseInt(row.to.slice(8, 10), 10) + ')' : n;
}
function wdTrend(end, months){
  const d = Object.assign(digestData(), { today: todayStr() });
  return UMCore.monthlyTrend(d, { end, reps: REPS.slice(), months: months || 6, settings: (typeof kpiSettings === 'function') ? kpiSettings() : {} });
}
// ---- visuals, made in the browser at export time (no network needed) ----
// Icons: the app's own line icons, white on an Ultramed-green disc. Photos:
// catalog product photos (when the host allows it) and the team's own visit
// photos. Anything that cannot load is simply left out.
function wdData(url){ return String(url || '').replace(/^data:/, ''); }
const _wdIconCache = {};
async function wdIcon(name, fg, bg){
  const key = name + fg + bg;
  if(_wdIconCache[key] !== undefined) return _wdIconCache[key];
  _wdIconCache[key] = null;
  try{
    const sym = document.getElementById('i-' + name); if(!sym) return null;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256" fill="none" stroke="#${fg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${sym.innerHTML}</svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; setTimeout(bad, 3000); });
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    if(bg){ g.fillStyle = '#' + bg; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill(); g.drawImage(img, 60, 60, 136, 136); }
    else g.drawImage(img, 0, 0, 256, 256);
    _wdIconCache[key] = wdData(c.toDataURL('image/png'));
  }catch(e){ _wdIconCache[key] = null; }
  return _wdIconCache[key];
}
// A remote or stored image → a square-ish JPEG data URL (max 600 px), or null.
// Google Drive thumbnail links send no CORS header (their redirect), so the
// browser cannot read them; the same image on lh3.googleusercontent.com can.
function wdFixSrc(src){
  const m = String(src || '').match(/drive\.google\.com\/(?:thumbnail\?id=|file\/d\/|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w600' : src;
}
// Fetch an image as a Blob: the app's own files and data URLs directly,
// remote images with a time limit; remote ones are kept in Cache Storage so
// the next export works offline.
async function wdFetchBlob(src, timeoutMs){
  if(!src) return null;
  src = wdFixSrc(src);
  if(/^data:/.test(src)) return (await fetch(src)).blob();
  const remote = /^https?:/.test(src) && !src.startsWith(location.origin);
  let cache = null;
  if(remote && typeof caches !== 'undefined'){ try{ cache = await caches.open('um-deck-img'); const hit = await cache.match(src); if(hit) return hit.blob(); }catch(e){ cache = null; } }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), timeoutMs || 5000);
  try{
    const r = await fetch(src, { mode: 'cors', signal: ctl ? ctl.signal : undefined });
    if(!r.ok) return null;
    if(cache){ try{ await cache.put(src, r.clone()); }catch(e){} }
    return await r.blob();
  }finally{ clearTimeout(t); }
}
// An image → a JPEG data URL. maxPx limits the long side (the source is
// never enlarged); returns {data, w, h} or null when it cannot be loaded.
async function wdPhoto(src, timeoutMs, maxPx){
  try{
    const blob = await wdFetchBlob(src, timeoutMs); if(!blob) return null;
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, (maxPx || 600) / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
    return { data: wdData(c.toDataURL('image/jpeg', maxPx > 900 ? 0.82 : 0.86)), w, h, srcW: bmp.width, srcH: bmp.height };
  }catch(e){ return null; }
}
// An image fitted to a box of wIn × hIn inches at about 180 dpi: 'cover'
// crops to fill (focus fx, fy), 'contain' fits whole on a background colour;
// rounded corners are baked in the colour behind the box (PptxGenJS rounding
// would draw an ellipse). Returns {data, w, h} sized for the box, or null.
async function wdBoxImage(src, wIn, hIn, o){
  o = o || {};
  try{
    const blob = await wdFetchBlob(src, o.timeout || 6000); if(!blob) return null;
    const bmp = await createImageBitmap(blob);
    const dpi = o.dpi || 180, W = Math.round(wIn * dpi), H = Math.round(hIn * dpi);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const r = Math.round((o.radius || 0) * dpi);
    g.fillStyle = '#' + (o.behind || 'FFFFFF'); g.fillRect(0, 0, W, H);
    g.save();
    if(r){ g.beginPath(); g.moveTo(r, 0); g.arcTo(W, 0, W, H, r); g.arcTo(W, H, 0, H, r); g.arcTo(0, H, 0, 0, r); g.arcTo(0, 0, W, 0, r); g.closePath(); g.clip(); }
    g.fillStyle = '#' + (o.bg || 'FFFFFF'); g.fillRect(0, 0, W, H);
    if(o.mode === 'contain'){
      const pad = Math.round((o.pad || 0) * dpi), k = Math.min((W - 2 * pad) / bmp.width, (H - 2 * pad) / bmp.height, o.upscale ? 99 : 1.6);
      const w = bmp.width * k, h = bmp.height * k; g.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
    }else{
      const k = Math.max(W / bmp.width, H / bmp.height), sw = W / k, sh = H / k;
      const sx = Math.max(0, Math.min(bmp.width - sw, (o.fx == null ? 0.5 : o.fx) * bmp.width - sw / 2)), sy = Math.max(0, Math.min(bmp.height - sh, (o.fy == null ? 0.4 : o.fy) * bmp.height - sh / 2));
      g.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
    }
    g.restore();
    return { data: wdData(c.toDataURL('image/jpeg', o.quality || 0.85)), w: W, h: H, srcW: bmp.width, srcH: bmp.height };
  }catch(e){ return null; }
}
// The deck's image bundle (img/deck/manifest.json, loaded on demand):
// products = ERP name → manufacturer photo bundled with the app (Intensiv,
// SCHEU, B&L Biotech, Univet); store = ERP name → the official store photo
// (ultramedgcc.com, CORS-enabled CDN); photos = free-licence clinic photos.
let _wdManifest = null;
async function wdAssets(){
  if(_wdManifest) return _wdManifest;
  try{ const r = await fetch('img/deck/manifest.json', { cache: 'no-cache' }); _wdManifest = r.ok ? await r.json() : {}; }catch(e){ _wdManifest = {}; }
  return _wdManifest;
}
function wdProductSrc(name){ const M = _wdManifest || {}, n = String(name || '').trim(); return (M.products || {})[n] || (M.store || {})[n] || wdCatalogImg(n); }
async function wdScene(key, shape){ const ph = ((_wdManifest || {}).photos || {})[key]; return ph && ph[shape] ? wdPhoto(ph[shape], 8000, shape === 'l' ? 1600 : 1300) : null; }
function wdCatalogImg(name){ try{ const p = typeof findCatalogProduct === 'function' ? findCatalogProduct(name) : null; return p && p.img ? p.img : null; }catch(e){ return null; } }
// Display names for products: the ERP's long strings shortened to what a
// manager recognises (raw names stay in the appendix). Lines that share one
// photo fold into one family on the slides (UMCore.foldProducts).
const WD_NAMES = [
  [/swingle.*prof|prof.*swingle/i, 'Intensiv Swingle Professional Kit'], [/swingle|wg-?69/i, 'Intensiv Swingle handpiece'],
  [/ost400|ortho.*\bset ?0?2\b/i, 'Intensiv Ortho-Strips Set02 with tray'], [/ortho-?strips|orthostrips/i, 'Intensiv Ortho-Strips'],
  [/ipr.?distance|distance ?control/i, 'Intensiv IPR gauge set'], [/intensiv ejector/i, 'Intensiv Ejector'],
  [/imprelon s ?\+/i, 'SCHEU Imprelon S+ foil'], [/imprelon s/i, 'SCHEU Imprelon S foil'], [/durasoft/i, 'SCHEU Durasoft foil'], [/isofolan/i, 'SCHEU Isofolan foil'],
  [/alpha ?(ii|2).*(kit)|(kit).*alpha ?(ii|2)/i, 'B&L Super Endo Alpha II kit'], [/beta mini/i, 'B&L Beta Mini kit'], [/needle/i, 'B&L Super Endo Beta needles'],
  [/plugger/i, 'B&L taper pluggers'], [/kondenser|condenser/i, 'B&L condenser set'], [/gp pellet|pellet/i, 'B&L GP Pellet'],
  [/galilean/i, 'Univet Galilean loupes'], [/prismatic/i, 'Univet Prismatic loupes'], [/ergo advanced/i, 'Univet Ergo Advanced loupes'], [/my ?ergo/i, 'Univet MyErgo loupes'],
  [/lynx pro/i, 'Univet Lynx Pro headlight'], [/lynx/i, 'Univet Lynx headlight'], [/eos/i, 'Univet EOS headlight'],
  [/tl gal|techne 2/i, 'Univet Galilean loupes'], [/refr\.?|binocular/i, 'Univet loupes'], [/magnetic adapter|clip\/on|headlight adapter/i, 'Univet headlight adapter'],
  [/nose pad/i, 'Univet nose pads'], [/anti ?fog|len[s]? cleaner/i, 'Univet lens care'],
];
function wdName(product){
  const p = String(product || '').replace(/\s+/g, ' ').trim();
  for(const [re, name] of WD_NAMES) if(re.test(p)) return name;
  return p.replace(/^TheBreath\b/i, 'The Breath Co.').replace(/\s+IME$/i, '').replace(/\b([A-Z]{4,})\b/g, w => w.charAt(0) + w.slice(1).toLowerCase());
}
// one family = one photo: lines that resolve to the same photo fold together
function wdFamilyOf(p){
  const src = wdProductSrc(p.product);
  return src ? { key: src + '|' + p.brand, display: wdName(p.product) } : { key: null, display: wdName(p.product) };
}
// ISO week number of a date (photo rotation: the deck changes week to week)
function wdIsoWeek(d){
  const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7);
  const w1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}
// photo pools per place in the deck; never the same photo twice, never the
// second photo of a same-shoot pair
const WD_POOLS = {
  // stock photos only where no claim sits next to them (the cover and close
  // fallback, when this week's products have no photos): neutral clinic
  // scenes — no patients, no aligners, no handshakes, no branded loupes
  cover: ['dental-clinic-operatory', 'dental-chair-white', 'dental-instruments-flatlay'],
  close: ['dental-chair-white', 'dental-instruments-flatlay', 'dental-clinic-operatory'],
};
const WD_PAIRS = [];
function wdPickPhoto(pool, week, used){
  const list = WD_POOLS[pool] || [];
  for(let i = 0; i < list.length; i++){
    const k = list[(week + i) % list.length];
    if(used.has(k)) continue;
    const pair = WD_PAIRS.find(pr => pr.includes(k));
    if(pair && pair.some(x => x !== k && used.has(x))) continue;
    used.add(k); return k;
  }
  return null;
}
function weeklyDeckData(end){
  return UMCore.weeklyReport(Object.assign(digestData(), { today: todayStr() }), { end, reps: REPS.slice(), settings: (typeof kpiSettings === 'function') ? kpiSettings() : {} });
}

// ---- the deck ----
// What to say comes from UMCore.weeklyStory and its pages (money first, then
// the month and its plan, growth, price, relationships, the people and the
// commitments; every figure true and tied to the appendix); this lays it out
// in the Smart Vending deck's style: at most 12 main pages, then an appendix
// with every figure (including the ones that went down), and Arabic notes.
const WD_AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const WD_EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function wdDayAr(d){ return parseInt(d.slice(8, 10), 10) + ' ' + WD_AR_MONTHS[parseInt(d.slice(5, 7), 10) - 1]; }
function wdDm(d){ return parseInt(d.slice(8, 10), 10) + ' ' + WD_EN_MONTHS[parseInt(d.slice(5, 7), 10) - 1]; }
function wdWeekday(d){ return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T00:00:00').getDay()]; }
function wdTitleCase(s){ return String(s || '').replace(/\s+/g, ' ').trim().replace(/\b([a-z])([a-z]*)/g, (m, a, b) => a.toUpperCase() + b); }
// a font size that fits a text box (fit:'shrink' only works in PowerPoint)
function wdFit(t, base, w, h, min){
  t = String(t == null ? '' : t); let size = base;
  while(size > (min || 10)){
    const cpl = Math.max(1, Math.floor(w * 72 / (size * 0.52)));
    const lines = t.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / cpl)), 0);
    if(lines * size * 1.2 / 72 <= h) break;
    size -= 1;
  }
  return size;
}

async function buildWeeklyDeck(end, opts){
  opts = opts || {};
  const say = typeof opts.progress === 'function' ? opts.progress : () => {};
  await loadPptxLib();
  await wdAssets();
  say('Reading the week…');
  const W = weeklyDeckData(end);
  const kS = (typeof kpiSettings === 'function') ? kpiSettings() : {};
  const kd0 = Object.assign(digestData(), { today: todayStr() }), krows = UMCore.erpAttributedRows(kd0);
  const K = {}; W.reps.forEach(r => { K[r] = UMCore.kpiScorecard(kd0, { rep: r, from: W.monthStart, to: W.to, settings: kS, rows: krows }); });
  const TR = wdTrend(W.to), TM = TR.months;
  const S = UMCore.weeklyStory(W, { presenter: currentUser.name, brandName: wdBrand, trend: TR, kpi: K, familyOf: wdFamilyOf, ask: opts.ask || '' });
  const PG = S.pages;
  const VP = UMCore.valuePerPerson(kd0, { reps: W.reps, end: W.to, months: 3, settings: kS, rows: krows });
  const R = W.reps, P = W.perRep, H = W.history || [];
  const week = wdIsoWeek(W.to), used = new Set();
  const pres = new window.PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';            // 13.333 × 7.5 in
  pres.author = currentUser.name || 'Ultramed GCC';
  pres.company = 'Ultramed GCC';
  const weekLbl = wdRange(W.from, W.to);
  pres.title = 'Field team weekly update – ' + weekLbl;
  pres.theme = { headFontFace: 'Calibri', bodyFontFace: 'Calibri' };
  const FOOT = 'Ultramed GCC · Field team weekly update · ' + weekLbl + ' · Internal';
  const titlePh = (x, y, w, h, color, size, align, valign) => ({ placeholder: { options: { name: 'title', type: 'title', x, y, w, h, fontFace: 'Calibri', fontSize: size, bold: true, color, align, valign, margin: 0 }, text: '' } });
  const footer = (x, w, color) => ({ text: { text: FOOT, options: { x, y: 7.06, w, h: 0.28, fontSize: 10, color, fontFace: 'Calibri', margin: 0 } } });
  pres.defineSlideMaster({ title: 'UM_COVER', background: { color: WD.dk }, objects: [{ image: { path: 'icons/logo-white.png', x: 0.7, y: 0.6, w: 2.4, h: 0.54 } }] });
  pres.defineSlideMaster({ title: 'UM_PAGE', background: { color: WD.white }, margin: [0.5, 0.6, 0.7, 0.6],
    objects: [titlePh(0.6, 0.66, 12.13, 0.8, WD.dk, 30, 'center', 'middle'), footer(1.05, 7.5, WD.text2), { image: { path: 'icons/logo-green.png', x: 11.48, y: 7.06, w: 1.25, h: 0.28 } }],
    slideNumber: { x: 0.6, y: 7.06, w: 0.4, h: 0.28, fontSize: 10, color: WD.muted, fontFace: 'Calibri' } });
  pres.defineSlideMaster({ title: 'UM_DARK', background: { color: WD.dk },
    objects: [titlePh(0.6, 0.66, 12.13, 0.8, WD.white, 30, 'center', 'middle'), footer(1.05, 7.5, WD.soft), { image: { path: 'icons/logo-white.png', x: 11.48, y: 7.06, w: 1.25, h: 0.28 } }],
    slideNumber: { x: 0.6, y: 7.06, w: 0.4, h: 0.28, fontSize: 10, color: WD.soft, fontFace: 'Calibri' } });

  // ---- primitives
  const cut = wdCut;
  const txt = (s, t, o) => s.addText(t, Object.assign({ fontFace: 'Calibri', color: WD.ink, margin: 0, isTextBox: true, valign: 'top' }, o));
  const rr = (s, x, y, w, h, fill, o) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, Object.assign({ x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill } }, o || {}));
  const box = (s, x, y, w, h, fill, o) => s.addShape(pres.shapes.RECTANGLE, Object.assign({ x, y, w, h, fill: { color: fill }, line: { color: fill } }, o || {}));
  const kicker = (s, t, color, x, w, y) => txt(s, String(t).toUpperCase(), { x: x == null ? 0.6 : x, y: y == null ? 0.38 : y, w: w || 12.13, h: 0.28, fontSize: 12, bold: true, color: color || WD.green, charSpacing: 2, align: x == null ? 'center' : 'left' });
  const basisLine = (s, t, color, x, w) => { const b = cut(t, 230); txt(s, b, { x: x == null ? 0.6 : x, y: 6.7, w: w || 12.13, h: 0.32, fontSize: wdFit(b, 10, w || 12.13, 0.32, 9), color: color || WD.text2 }); };
  const page = (section, k, title) => { const s = pres.addSlide({ masterName: 'UM_PAGE', sectionTitle: section }); const t = cut(title, 66); s.addText(t, { placeholder: 'title', fontSize: t.length > 56 ? 25 : t.length > 46 ? 27 : 30 }); kicker(s, k); return s; };
  const bigSize = (b, max) => { const n = String(b).replace(/^[−-]?KD\s+/, '').length; return n <= 2 ? max : n <= 4 ? Math.round(max * 0.88) : n <= 6 ? Math.round(max * 0.74) : Math.round(max * 0.6); };
  const bigRuns = (b, size, color) => { const m = String(b).match(/^([−-]?)KD\s+(.*)$/);
    return m ? [{ text: m[1] + 'KD ', options: { fontSize: Math.max(14, Math.round(size * 0.42)), bold: true, color } }, { text: m[2], options: { fontSize: size, bold: true, color } }] : [{ text: String(b), options: { fontSize: size, bold: true, color } }]; };
  const notes = (s, lines) => s.addNotes(lines.filter(Boolean).join('\n'));
  const SRC_AR = 'المصدر: ملفات مبيعات ERP ' + (W.salesTo ? 'حتى ' + wdDayAr(W.salesTo) : '(لا يوجد ملف لهذا الأسبوع بعد)') + '، والزيارات كما سُجلت في التطبيق.';
  const LEFT_AR = PG.excluded.length ? 'خارج الصفحات الرئيسية (في الملحق): ' + PG.excluded.join('؛ ') + '.' : '';
  const monthName = WD_EN_LONG[parseInt(W.to.slice(5, 7), 10) - 1];
  say('Preparing icons and photos…');
  const IC = {}, MD = {};
  for(const n of ['award', 'arrow-up', 'chart', 'building', 'refresh', 'package', 'stethoscope', 'users', 'layers', 'calendar', 'cart', 'gift', 'target', 'shield', 'chat', 'star', 'compass', 'file', 'clipboard', 'sparkles', 'check', 'phone']){
    IC[n] = await wdIcon(n, 'FFFFFF', WD.green); MD[n] = await wdIcon(n, WD.dk, WD.gold);
  }
  const icon = (s, n, x, y, d, medal) => { const set = medal ? MD : IC, src = set[n] || set.sparkles; if(src) s.addImage({ data: src, x, y, w: d, h: d }); };
  const PC = [[WD.green, WD.white], [WD.gold, WD.dk], [WD.dk, WD.white], [WD.sage, WD.dk]];
  const pcOf = r => PC[Math.max(0, R.indexOf(r)) % PC.length];
  const initials = n => String(n || '?').replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(/\s+/).map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase();
  const avatar = (s, r, x, y, d, onDark) => { const c = pcOf(r);
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: c[0] }, line: { color: c[0] === WD.dk ? (onDark ? WD.soft : WD.white) : (onDark ? c[0] : WD.white), width: 2 } });
    txt(s, initials(r), { x, y, w: d, h: d, align: 'center', valign: 'middle', fontSize: Math.max(10, Math.round(d * 24)), bold: true, color: c[1] }); };
  const chip = (s, x, y, label, fill, color, h) => { h = h || 0.3; const w = String(label).length * h * 0.3 + 0.32;
    rr(s, x, y, w, h, fill, { rectRadius: h / 2 }); txt(s, label, { x, y, w, h, fontSize: Math.round(h * 34), bold: true, color, align: 'center', valign: 'middle' }); return w; };
  // a meter drawn as shapes: the base, the fill, a tick (e.g. working days gone)
  const meter = (s, x, y, w, h, frac, fill, tick, base) => { rr(s, x, y, w, h, base || WD.line, { rectRadius: h / 2 });
    const f = Math.max(0, Math.min(1, frac || 0)); if(f > 0) rr(s, x, y, Math.max(h, w * f), h, fill || WD.green, { rectRadius: h / 2 });
    if(tick != null) s.addShape(pres.shapes.LINE, { x: x + w * Math.max(0, Math.min(1, tick)), y: y - 0.08, w: 0, h: h + 0.16, line: { color: WD.dk, width: 1.75 } }); };
  // photos: a neutral clinic scene from a pool (never repeated), a product photo contained on white
  const scene = async (pool, wIn, hIn, behind, radius) => {
    const k = wdPickPhoto(pool, week, used); if(!k) return null;
    const ph = ((_wdManifest || {}).photos || {})[k], src = ph && (wIn / hIn < 1 ? ph.p : ph.l);
    return src ? wdBoxImage(src, wIn, hIn, { mode: 'cover', radius: radius || 0, behind: behind || 'FFFFFF', fy: 0.42 }) : null;
  };
  const prodCache = {};
  const prodImg = async (name, wIn, hIn, bg) => { const src = wdProductSrc(name); if(!src) return null; const key = src + '|' + wIn + 'x' + hIn + '|' + (bg || '');
    if(!(key in prodCache)) prodCache[key] = await wdBoxImage(src, wIn, hIn, { mode: 'contain', bg: bg || 'FFFFFF', behind: bg || 'FFFFFF', pad: 0.05, timeout: 7000 }); return prodCache[key]; };
  const visitPhoto = async (ph, wIn, hIn, minPx) => {
    let src = null; try{ src = typeof loadPhotoBlob === 'function' ? await loadPhotoBlob(ph.id) : null; }catch(e){}
    const im = (await wdBoxImage(src || ph.thumb, wIn, hIn, { mode: 'cover' })) || null;
    return im && (!minPx || Math.max(im.srcW, im.srcH) >= minPx) ? im : null;
  };
  const yellowFrame = s => rr(s, 8.3, 0.6, 4.3, 6.3, WD.gold, { rectRadius: 0.2 });
  // the frame on the cover and the close: this week's products (real photos,
  // one per family), else a neutral clinic scene; never people or outcomes
  const frameFill = async (s, pool) => {
    const fam = ((S.sold && S.sold.items) || []).slice(0, 8), tiles = [];
    for(const f of fam){ if(tiles.length >= 4) break; const im = await prodImg(f.first, 1.75, 1.75); if(im) tiles.push({ im, f }); }
    if(tiles.length >= 4){ tiles.forEach((t, i) => { const x = 8.55 + (i % 2) * 1.95, y = 0.95 + Math.floor(i / 2) * 2.85;
        rr(s, x, y, 1.85, 2.6, WD.white, { rectRadius: 0.1 }); s.addImage({ data: t.im.data, x: x + 0.05, y: y + 0.08, w: 1.75, h: 1.75 });
        txt(s, cut(t.f.display, 30), { x: x + 0.08, y: y + 1.88, w: 1.69, h: 0.62, fontSize: wdFit(cut(t.f.display, 30), 11, 1.69, 0.62, 9), bold: true, color: WD.dk, align: 'center' }); }); return 'products'; }
    const ph = await scene(pool, 3.8, 5.8, 'F2B705', 0.12);
    if(ph){ s.addImage({ data: ph.data, x: 8.55, y: 0.85, w: 3.8, h: 5.8 }); return 'scene'; }
    s.addImage({ path: 'icons/logo-green.png', x: 9.05, y: 3.43, w: 2.8, h: 0.63 }); return 'logo';
  };
  const slideNo = () => pres.slides.length;
  const MAIN = {};

  // ======== 1 · cover
  pres.addSection({ title: 'The money' });
  let s = pres.addSlide({ masterName: 'UM_COVER', sectionTitle: 'The money' });
  txt(s, 'WEEKLY UPDATE TO MANAGEMENT', { x: 0.7, y: 1.75, w: 6.7, h: 0.35, fontSize: 14, bold: true, color: WD.gold, charSpacing: 3 });
  txt(s, 'Field team weekly update', { x: 0.7, y: 2.1, w: 6.9, h: 1.2, fontSize: 44, bold: true, color: WD.white, valign: 'bottom' });
  const d1 = W.from, d2 = W.to, longRange = (d1.slice(5, 7) === d2.slice(5, 7) ? parseInt(d1.slice(8, 10), 10) : wdDm(d1)) + ' – ' + parseInt(d2.slice(8, 10), 10) + ' ' + WD_EN_LONG[parseInt(d2.slice(5, 7), 10) - 1] + ' ' + d2.slice(0, 4);
  txt(s, longRange + ' · Kuwait clinical sales · Ultramed GCC', { x: 0.7, y: 3.35, w: 6.9, h: 0.45, fontSize: 18, color: WD.soft });
  const cl = PG.cover;
  let teamY = 5.45;
  if(cl){ txt(s, 'THIS WEEK', { x: 0.7, y: 4.05, w: 6.7, h: 0.3, fontSize: 11, bold: true, color: WD.soft, charSpacing: 2 });
    txt(s, cl, { x: 0.7, y: 4.35, w: 6.7, h: 0.85, fontSize: wdFit(cl, 22, 6.7, 0.85, 16), bold: true, color: WD.gold }); }
  else teamY = 4.3;
  R.forEach((r, i) => { const x = 0.7 + i * 2.2; avatar(s, r, x, teamY, 0.62, true); txt(s, cut(r, 16), { x: x + 0.75, y: teamY, w: 1.4, h: 0.62, fontSize: 14, bold: true, color: WD.white, valign: 'middle' }); });
  txt(s, 'Prepared by ' + (currentUser.name || 'the supervisor') + ' · ' + (W.salesCovered ? 'ERP sales to ' + wdDm(W.salesTo) + ' (every document in A8)' : 'ERP sales file for this week not in the app yet') + ' · visits as logged in the app', { x: 0.7, y: 6.55, w: 7.2, h: 0.32, fontSize: 11, color: WD.soft });
  yellowFrame(s);
  say('Loading photos…');
  const coverKind = await frameFill(s, 'cover');
  if(coverKind === 'scene' && S.sold && S.sold.items.length){ let top = null, topIm = null;
    for(const f of S.sold.items.slice(0, 3)){ const im = await prodImg(f.first, 1.9, 1.25); if(im){ top = f; topIm = im; break; } }
    if(top){ rr(s, 7.45, 4.6, 2.3, 2.15, WD.white, { rectRadius: 0.15, shadow: { type: 'outer', blur: 8, offset: 3, angle: 90, color: '000000', opacity: 0.3 } });
      s.addImage({ data: topIm.data, x: 7.65, y: 4.72, w: 1.9, h: 1.25 });
      txt(s, cut(top.display, 26), { x: 7.55, y: 6.02, w: 2.1, h: 0.3, fontSize: 11, bold: true, color: WD.dk, align: 'center' });
      txt(s, 'this week\'s top product', { x: 7.55, y: 6.32, w: 2.1, h: 0.28, fontSize: 10, color: WD.green, align: 'center' }); } }
  notes(s, ['تقرير الفريق الميداني للأسبوع ' + wdDayAr(W.from) + ' – ' + wdDayAr(W.to) + '، يقدمه ' + (currentUser.name || 'المشرف') + '.',
    'نبدأ بالمال: مبيعات الأسبوع وموقفنا من هدف الشهر وخطتنا لإغلاق الفارق، ثم النمو والأسعار والعلاقات، ثم الفريق والتزاماتنا للأسبوع القادم.', 'كل رقم في هذا العرض موجود بالتفصيل في الملحق.', SRC_AR]);

  // ======== 2 · the week on one page (fixed tiles: the same four every week)
  const MO2 = PG.money;
  s = page('The money', 'The week on one page', MO2.title); MAIN.money = slideNo();
  const tIcons = { week: 'file', month: 'target', newbiz: 'sparkles', price: 'shield' };
  MO2.tiles.forEach((t, i) => { const x = 0.6 + i * 3.083, y = 1.62, w = 2.883, h = 2.78, dk = i === 0;
    rr(s, x, y, w, h, dk ? WD.dk : WD.paper, { rectRadius: 0.15 });
    icon(s, tIcons[t.key] || 'chart', x + 0.25, y + 0.25, 0.55, dk);
    txt(s, bigRuns(t.big, bigSize(t.big, 46), dk ? WD.gold : WD.green), { x: x + 0.25, y: y + 0.82, w: w - 0.5, h: 0.78, valign: 'bottom' });
    txt(s, t.label, { x: x + 0.25, y: y + 1.66, w: w - 0.5, h: 0.48, fontSize: wdFit(t.label, 13, w - 0.5, 0.48, 10.5), bold: true, color: dk ? WD.white : WD.dk });
    if(t.detail) txt(s, t.detail, { x: x + 0.25, y: y + 2.17, w: w - 0.5, h: 0.5, fontSize: wdFit(t.detail, 11.5, w - 0.5, 0.5, 9.5), color: dk ? WD.soft : WD.text2 }); });
  if(MO2.mix.length){
    const pos = MO2.mix.filter(m => m.kd > 0), posSum = pos.reduce((a, m) => a + m.kd, 0), neg = MO2.mix.filter(m => m.kd < 0);
    const mixCol = { existing: WD.green, newAccounts: WD.gold, channel: WD.sage, other: WD.soft };
    kicker(s, 'Where this week\'s ' + MO2.tiles[0].big + ' came from' + (neg.length ? ': ' + wdKD(MO2.salesBeforeReturns) + ' of sales, less ' + wdKD(-neg.reduce((a, m) => a + m.kd, 0)) + ' of returns' : ''), WD.green, 0.6, 12.13, 4.6);
    let bx = 0.6; const bw = 12.13;
    pos.forEach(m => { const w = bw * m.kd / posSum; box(s, bx, 4.96, Math.max(0.04, w), 0.42, mixCol[m.key] || WD.soft);
      if(w > 0.9) txt(s, Math.round(m.share * 100) + '%', { x: bx, y: 4.96, w, h: 0.42, fontSize: 12, bold: true, color: m.key === 'newAccounts' ? WD.dk : WD.white, align: 'center', valign: 'middle' }); bx += w; });
    const leg = pos.concat(neg), lw = 12.13 / Math.max(3, leg.length);
    leg.forEach((m, i) => { const x = 0.6 + i * lw;
      if(m.kd > 0) box(s, x, 5.54, 0.2, 0.2, mixCol[m.key] || WD.soft); else s.addShape(pres.shapes.RECTANGLE, { x, y: 5.54, w: 0.2, h: 0.2, fill: { color: WD.white }, line: { color: WD.sage, width: 1, dashType: 'dash' } });
      const sub = m.key === 'existing' && MO2.firstTimeKd > 0 ? ' · incl. ' + wdKD(MO2.firstTimeKd) + ' first-time products' : '';
      txt(s, [{ text: wdTitleCase(m.label.charAt(0)) + m.label.slice(1), options: { bold: true, color: WD.dk, breakLine: true } }, { text: (m.kd < 0 ? '−' : '') + wdKD(Math.abs(m.kd)) + ' · ' + Math.round(Math.abs(m.share) * 100) + '%' + (m.kd < 0 ? ' of sales' : '') + sub, options: { color: WD.text2 } }],
        { x: x + 0.3, y: 5.48, w: lw - 0.4, h: 0.62, fontSize: 11.5 }); });
    if(MO2.concentration){ const c = MO2.concentration, ti = W.mix.topInvoice;
      txt(s, 'Largest account this week: ' + cut(c.account, 44) + ', ' + wdKD(c.net) + ' (' + Math.round(c.share * 100) + '% of the week)' + (ti ? ' · largest invoice ' + wdKD(ti.net) + ' (' + ti.doc + ')' : ''),
        { x: 0.6, y: 6.2, w: 12.13, h: 0.32, fontSize: 12, color: WD.dk }); }
  } else txt(s, W.salesCovered ? 'No invoice in this week\'s sales file yet.' : 'Upload this week\'s ERP sales files: the four figures above fill in from them.', { x: 0.6, y: 4.6, w: 12.13, h: 0.6, fontSize: 16, color: WD.text2, align: 'center' });
  basisLine(s, MO2.recon + ' · discount gross-weighted on clinic invoices; free goods inside a deal count as discount · every document in A8');
  notes(s, [MO2.ar, MO2.askedLastWeek, SRC_AR, LEFT_AR]);

  // ======== 3 · the month that closed (days 1–10)
  const CL = PG.closed;
  if(CL){
    pres.addSection({ title: 'The month' });
    s = page('The month', CL.name + ' closed', CL.title); MAIN.closed = slideNo();
    rr(s, 0.6, 1.7, 5.4, 4.85, WD.dk, { rectRadius: 0.15 });
    icon(s, 'target', 0.95, 2.0, 0.65, true);
    txt(s, Math.round(CL.team.pct * 100) + '%', { x: 0.95, y: 2.65, w: 4.7, h: 1.25, fontSize: 88, bold: true, color: WD.gold, valign: 'bottom' });
    txt(s, 'of the ' + CL.name + ' target', { x: 0.95, y: 3.9, w: 4.7, h: 0.4, fontSize: 18, bold: true, color: WD.white });
    txt(s, wdKD(CL.team.kd) + ' of ' + wdKD(CL.team.target), { x: 0.95, y: 4.3, w: 4.7, h: 0.4, fontSize: 16, color: WD.soft });
    meter(s, 0.95, 4.85, 4.7, 0.26, CL.team.pct, WD.gold, null, '2E4A3B');
    if(CL.prev){ txt(s, CL.prevName + ': ' + wdKD(CL.prev.kd) + ' of ' + wdKD(CL.prev.target) + ' · ' + Math.round(CL.prev.pct * 100) + '%', { x: 0.95, y: 5.3, w: 4.7, h: 0.32, fontSize: 13, color: WD.soft });
      meter(s, 0.95, 5.7, 4.7, 0.16, CL.prev.pct, WD.sage, null, '2E4A3B'); }
    const rows3 = CL.people, rh3 = Math.min(1.5, 4.85 / Math.max(1, rows3.length));
    rows3.forEach((p, i) => { const y = 1.7 + i * rh3, x = 6.3;
      rr(s, x, y + 0.05, 6.43, rh3 - 0.15, WD.paper, { rectRadius: 0.12 });
      avatar(s, p.rep, x + 0.2, y + 0.22, 0.62);
      txt(s, cut(p.rep, 22), { x: x + 1.0, y: y + 0.15, w: 2.6, h: 0.4, fontSize: 17, bold: true, color: WD.dk });
      if(p.noFile){ txt(s, 'No ' + CL.name + ' sales file' + (p.first ? ' · ' + monthName + ' is the first month in the files' : ''), { x: x + 1.0, y: y + 0.6, w: 5.2, h: 0.35, fontSize: 12.5, color: WD.text2 }); return; }
      if(p.noTarget){ txt(s, (p.kd > 0 ? wdKD(p.kd) + ' invoiced at the clinics in their name · ' : '') + 'no ' + CL.name + ' target', { x: x + 1.0, y: y + 0.6, w: 5.2, h: 0.35, fontSize: 12.5, color: WD.text2 }); return; }
      txt(s, Math.round(p.pct * 100) + '%', { x: x + 5.0, y: y + 0.1, w: 1.25, h: 0.55, fontSize: 28, bold: true, color: WD.green, align: 'right' });
      txt(s, wdKD(p.kd) + ' of ' + wdKD(p.target) + (p.kpi != null ? '  ·  KPI ' + p.kpi + '/100' : ''), { x: x + 1.0, y: y + 0.55, w: 4.0, h: 0.3, fontSize: 12.5, color: WD.text2 });
      meter(s, x + 1.0, y + 0.95, p.up ? 2.55 : 5.2, 0.16, p.pct, pcOf(p.rep)[0] === WD.dk ? WD.green : pcOf(p.rep)[0]);
      if(p.up) chip(s, x + 3.7, y + 0.88, 'KD and % up from ' + CL.prevName.slice(0, 3), WD.gold, WD.dk, 0.3); });
    basisLine(s, CL.basis + ' · month by month in A6, per person in A3b');
    notes(s, [CL.ar, SRC_AR]);
  }

  // ======== 4 · the month: the gap and the plan
  const PN = PG.plan;
  if(PN){
    if(!CL) pres.addSection({ title: 'The month' });
    s = page('The month', monthName + ' · the plan', PN.title); MAIN.plan = slideNo();
    const wdFrac = PN.workdays.total ? PN.workdays.done / PN.workdays.total : null;
    txt(s, [{ text: 'Team  ', options: { bold: true, color: WD.dk } }, { text: wdKD(PN.team.mtd) + ' of ' + wdKD(PN.team.target), options: { color: WD.text2 } }], { x: 0.6, y: 1.62, w: 4.4, h: 0.35, fontSize: 15 });
    txt(s, 'day ' + PN.day + ' of ' + PN.dim + ' · ' + PN.workdays.done + ' of ' + PN.workdays.total + ' working days', { x: 3.4, y: 1.64, w: 2.9, h: 0.3, fontSize: 11, color: WD.text2, align: 'right' });
    meter(s, 0.6, 2.05, 5.7, 0.36, PN.team.pct, WD.green, wdFrac);
    const pr = PN.people, prh = Math.min(0.95, 2.9 / Math.max(1, pr.length));
    pr.forEach((p, i) => { const y = 2.65 + i * prh;
      avatar(s, p.rep, 0.6, y + 0.04, 0.5);
      txt(s, cut(p.rep, 18), { x: 1.22, y, w: 2.0, h: 0.32, fontSize: 13, bold: true, color: WD.dk });
      txt(s, p.target ? wdKD(p.mtd) + ' of ' + wdKD(p.target) : wdKD(p.mtd) + ' · no target', { x: 1.22, y: y + 0.3, w: 2.4, h: 0.28, fontSize: 11.5, color: WD.text2 });
      if(p.target) meter(s, 3.55, y + 0.14, 2.75, 0.2, p.pct, pcOf(p.rep)[0] === WD.dk ? WD.green : pcOf(p.rep)[0], wdFrac);
      txt(s, p.last ? 'last month: ' + Math.round(p.last.pct * 100) + '% of target' : p.first ? 'first month with a target' : '', { x: 3.55, y: y + 0.38, w: 2.75, h: 0.26, fontSize: 10.5, color: WD.text2 }); });
    let ly = 2.65 + pr.length * prh + 0.1;
    if(PN.afterLine){ txt(s, PN.afterLine, { x: 0.6, y: ly, w: 5.7, h: 0.55, fontSize: wdFit(PN.afterLine, 12, 5.7, 0.55, 10), italic: true, color: WD.dk }); ly += 0.6; }
    if(ly < 6.3) txt(s, PN.split, { x: 0.6, y: Math.min(6.25, ly), w: 5.7, h: 0.3, fontSize: 10.5, color: WD.text2 });
    // how we close it
    rr(s, 6.65, 1.6, 6.08, 4.95, WD.paper, { rectRadius: 0.15 });
    kicker(s, 'How we close it', WD.green, 6.95, 5.5, 1.78);
    const LV = PN.levers.slice(0, 4), lh = PN.ask ? 0.86 : 1.02;
    LV.forEach((l, i) => { const y = 2.2 + i * lh;
      s.addShape(pres.shapes.OVAL, { x: 6.95, y: y + 0.05, w: 0.48, h: 0.48, fill: { color: WD.gold }, line: { color: WD.gold } });
      txt(s, String(i + 1), { x: 6.95, y: y + 0.05, w: 0.48, h: 0.48, fontSize: 16, bold: true, color: WD.dk, align: 'center', valign: 'middle' });
      txt(s, [{ text: l.big + '  ', options: { bold: true, color: WD.green, fontSize: 18 } }, { text: l.text, options: { bold: true, color: WD.dk, fontSize: 13.5 } }], { x: 7.6, y, w: 4.95, h: 0.42, valign: 'middle' });
      if(l.detail) txt(s, cut(l.detail, 110), { x: 7.6, y: y + 0.42, w: 4.95, h: lh - 0.47, fontSize: wdFit(cut(l.detail, 110), 11, 4.95, lh - 0.47, 9.5), color: WD.text2 }); });
    if(!LV.length) txt(s, 'Every key account visited, nothing awaiting invoice: next week\'s plan is on the next-week page.', { x: 7.0, y: 2.3, w: 5.4, h: 0.8, fontSize: 13, color: WD.text2 });
    if(PN.ask){ rr(s, 6.95, 5.6, 5.5, 0.75, WD.gold, { rectRadius: 0.1 });
      txt(s, [{ text: 'OUR ASK  ', options: { bold: true, color: WD.dk, fontSize: 11, charSpacing: 2 } }, { text: '“' + PN.ask + '”', options: { color: WD.dk, fontSize: 13, bold: true } }], { x: 7.15, y: 5.6, w: 5.1, h: 0.75, valign: 'middle' }); }
    basisLine(s, 'ERP to ' + wdDm(W.salesTo || W.to) + ', returns netted, against the DSR targets · the tick = working days gone (Sun–Thu) · key accounts = class A clinics not visited this month · pace: A3 · months: A6');
    notes(s, [PN.ar, PN.notes, SRC_AR]);
  }

  // ======== 5 · new business and the pipeline
  const NB = PG.newBiz;
  if(NB.qualifies){
    pres.addSection({ title: 'Growth and quality' });
    s = page('Growth and quality', 'New business', NB.title); MAIN.newBiz = slideNo();
    rr(s, 0.6, 1.7, 3.3, 4.85, WD.dk, { rectRadius: 0.15 });
    icon(s, 'sparkles', 0.9, 1.95, 0.6, true);
    txt(s, bigRuns(W.salesCovered ? wdKD(NB.kd) : '—', 50, WD.gold), { x: 0.9, y: 2.6, w: 2.8, h: 0.95, valign: 'bottom' });
    txt(s, 'new business this week', { x: 0.9, y: 3.6, w: 2.8, h: 0.35, fontSize: 15, bold: true, color: WD.white });
    const nbl = [];
    if(NB.newAccounts.length) nbl.push(NB.newAccounts.length + (NB.newAccounts.length === 1 ? ' new account · ' : ' new accounts · ') + wdKD(NB.newKd));
    if(NB.firstTime.length) nbl.push(NB.firstTime.length + (NB.firstTime.length === 1 ? ' first-time product · ' : ' first-time products · ') + wdKD(NB.firstKd));
    if(NB.back.length) nbl.push(NB.back.length + ' back after 60+ days');
    if(NB.share != null && NB.kd > 0) nbl.push(Math.round(NB.share * 100) + '% of the week\'s ' + wdKD(W.team.week));
    if(NB.month) nbl.push(monthName + ' so far: ' + NB.month.newAccounts + ' new · ' + (NB.month.placements || 0) + ' first-time');
    const pm = NB.prevMonthNew, pmn = pm ? WD_EN_LONG[parseInt(pm.month.slice(5, 7), 10) - 1] : '';
    if(pm && pm.orderedAgain) nbl.push(pm.count === 1 ? pmn + '\'s new account ordered again' + (pm.kdSince > 0 ? ': ' + wdKD(pm.kdSince) + ' since' : '') : pm.orderedAgain + ' of ' + pmn + '\'s ' + pm.count + ' new accounts ordered again' + (pm.kdSince > 0 ? ': ' + wdKD(pm.kdSince) + ' since' : ''));
    txt(s, nbl.join('\n'), { x: 0.9, y: 4.05, w: 2.8, h: 2.35, fontSize: wdFit(nbl.join('\n'), 13, 2.8, 2.35, 10), color: WD.soft, paraSpaceAfter: 4 });
    const wpic = async (w, wIn, hIn) => w.product ? prodImg(w.product, wIn, hIn) : null;
    const wchip = (x, y, type, small) => chip(s, x, y, type === 'new' ? 'NEW ACCOUNT' : type === 'back' ? 'BACK AFTER 60+ DAYS' : 'FIRST-TIME PRODUCT', type === 'new' ? WD.gold : type === 'back' ? WD.dk : WD.green, type === 'new' ? WD.dk : type === 'back' ? WD.gold : WD.white, small ? 0.26 : 0.3);
    const WN = NB.wins;
    if(WN.length){
      const hero = WN[0];
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.1, y: 1.7, w: 4.55, h: 4.85, rectRadius: 0.12, fill: { color: WD.white }, line: { color: WD.soft, width: 1 } });
      const him = await wpic(hero, 4.25, 2.35);
      if(him) s.addImage({ data: him.data, x: 4.25, y: 1.85, w: 4.25, h: 2.35 }); else { rr(s, 4.25, 1.85, 4.25, 2.35, WD.paper); icon(s, hero.type === 'new' ? 'building' : 'package', 5.9, 2.5, 1.0); }
      wchip(4.3, 4.32, hero.type);
      txt(s, cut(hero.account, 44), { x: 4.3, y: 4.7, w: 4.2, h: 0.55, fontSize: wdFit(cut(hero.account, 44), 18, 4.2, 0.55, 13), bold: true, color: WD.dk });
      txt(s, hero.rep + (hero.net != null ? ' · ' + wdKD(hero.net) : '') + ' · ' + wdDm(hero.date), { x: 4.3, y: 5.25, w: 4.2, h: 0.36, fontSize: 14, bold: true, color: WD.green });
      txt(s, cut((hero.doc ? 'Invoice ' + hero.doc : '') + (hero.product ? ' · ' + wdName(hero.product) : ''), 70), { x: 4.3, y: 5.62, w: 4.2, h: 0.3, fontSize: 11, color: WD.text2 });
      txt(s, hero.type === 'new' ? 'first order in our files' + (W.historyFrom ? ' (from ' + wdDm(W.historyFrom) + ')' : '') + (hero.clinicId ? '' : ' · not yet a clinic in the app') : hero.type === 'product' ? 'first invoice of this product to this clinic in our files' : '',
        { x: 4.3, y: 5.92, w: 4.2, h: 0.5, fontSize: 10.5, color: WD.muted });
    } else {
      rr(s, 4.1, 1.7, 4.55, 4.85, WD.paper, { rectRadius: 0.12 });
      txt(s, 'No new account or first-time product in this week\'s files.\nThe prospects visited this week are on the right.', { x: 4.35, y: 3.3, w: 4.05, h: 1.2, fontSize: 14, color: WD.text2, align: 'center', valign: 'middle' });
    }
    // right: the other wins, then the pipeline
    let ry = 1.7; const rx = 8.85, rw = 3.88;
    const rest = WN.slice(1, NB.pipeline.clinics.length >= 3 ? 3 : 4);
    if(rest.length){ kicker(s, 'Also new this week', WD.green, rx, rw, ry); ry += 0.36;
      rest.forEach(w => { rr(s, rx, ry, rw, 0.62, WD.paper, { rectRadius: 0.08 });
        txt(s, [{ text: cut(w.product ? wdName(w.product) : w.type === 'back' ? 'Back after 60+ days' : 'New account', 34), options: { bold: true, color: WD.dk, breakLine: true } }, { text: cut(w.account, 26) + ' · ' + (w.net != null ? wdKD(w.net, w.net < 10 ? 2 : 0) + ' · ' : '') + w.rep, options: { color: WD.text2 } }],
          { x: rx + 0.15, y: ry + 0.04, w: rw - 0.3, h: 0.56, fontSize: 11 }); ry += 0.7; });
      if(WN.length > rest.length + 1) { txt(s, '+' + (WN.length - rest.length - 1) + ' more in A4', { x: rx, y: ry, w: rw, h: 0.26, fontSize: 10.5, color: WD.goldInk }); ry += 0.3; }
      ry += 0.1; }
    const pp = NB.pipeline;
    if(pp.clinics.length || pp.gov.length || pp.pharmacy.length){ kicker(s, 'Prospects visited this week', WD.green, rx, rw, ry); ry += 0.34;
      txt(s, 'no invoice since ' + wdDm(pp.since || W.from) + ' (our files start then)', { x: rx, y: ry, w: rw, h: 0.26, fontSize: 10.5, color: WD.text2 }); ry += 0.3;
      const lines = pp.clinics.slice(0, Math.max(2, Math.floor((6.25 - ry) / 0.32) - 1)).map(p => ({ text: cut(wdTitleCase(p.clinic), 30) + ' · ' + p.rep + (p.visits > 1 ? ' · ' + p.visits + ' visits' : ''), options: { bullet: true, breakLine: true } }));
      if(pp.clinics.length > lines.length) lines.push({ text: '+' + (pp.clinics.length - lines.length) + ' more in A11', options: { color: WD.goldInk, breakLine: true } });
      if(pp.gov.length) lines.push({ text: 'Government sites (tenders): ' + cut(pp.gov.map(p => wdTitleCase(p.clinic)).join(' · '), 70), options: { color: WD.text2, breakLine: true } });
      if(pp.pharmacy.length) lines.push({ text: 'Pharmacies: ' + cut(pp.pharmacy.map(p => wdTitleCase(p.clinic)).join(' · '), 60), options: { color: WD.text2 } });
      if(lines.length){ delete lines[lines.length - 1].options.breakLine; txt(s, lines, { x: rx, y: ry, w: rw, h: Math.max(0.4, 6.25 - ry), fontSize: 11.5, color: WD.dk, paraSpaceAfter: 2 }); } }
    if(NB.buying) chip(s, rx, 6.22, 'Buying: ' + NB.buying.active + ' of ' + NB.buying.territory + ' clinics since ' + wdDm(NB.buying.since || W.from), WD.mint, WD.dk, 0.3);
    basisLine(s, 'New = first invoice in our files (from ' + wdDm(W.historyFrom || W.from) + '); first-time product = first invoice of a product to a clinic that bought before' + (W.winsBlocked && W.winsBlocked.length ? ' · ' + W.winsBlocked.join(', ') + ': counted once the files cover 4 earlier weeks' : '') + ' · every win: A4');
    notes(s, [NB.ar, SRC_AR]);
  }

  // ======== 6 · what sold, and the brands against their month targets
  const BR = PG.brands;
  if(BR.qualifies){
    if(!MAIN.newBiz) pres.addSection({ title: 'Growth and quality' });
    s = page('Growth and quality', 'What sold', BR.title); MAIN.brands = slideNo();
    const items = BR.items.slice(0, 3);
    rr(s, 0.6, 1.7, 5.6, 4.85, WD.gold, { rectRadius: 0.2 });
    if(items.length){ const top = items[0];
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: 1.95, w: 5.1, h: 2.35, rectRadius: 0.15, fill: { color: WD.white }, line: { color: WD.white } });
      const tim = await prodImg(top.first, 4.7, 2.15);
      if(tim) s.addImage({ data: tim.data, x: 1.05, y: 2.05, w: 4.7, h: 2.15 }); else icon(s, 'package', 2.8, 2.5, 1.2);
      s.addShape(pres.shapes.OVAL, { x: 0.72, y: 1.82, w: 0.7, h: 0.7, fill: { color: WD.dk }, line: { color: WD.dk } });
      txt(s, '1', { x: 0.72, y: 1.82, w: 0.7, h: 0.7, fontSize: 22, bold: true, color: WD.gold, align: 'center', valign: 'middle' });
      const tn = top.display + (top.members.length > 1 ? ' · ' + top.members.length + ' types' : '');
      txt(s, cut(tn, 50), { x: 0.85, y: 4.38, w: 5.1, h: 0.42, fontSize: wdFit(cut(tn, 50), 18, 5.1, 0.42, 13), bold: true, color: WD.dk });
      txt(s, wdKD(top.net) + ' · ' + top.qty + (top.qty === 1 ? ' unit' : ' units') + ' · ' + top.accounts + (top.accounts === 1 ? ' clinic' : ' clinics') + ' · ' + wdBrand(top.brand), { x: 0.85, y: 4.8, w: 5.1, h: 0.32, fontSize: 13, bold: true, color: WD.dk });
      for(let i = 1; i < items.length; i++){ const it = items[i], y = 5.2 + (i - 1) * 0.65;
        rr(s, 0.85, y, 5.1, 0.57, WD.white, { rectRadius: 0.08 });
        const im = await prodImg(it.first, 0.5, 0.5); if(im) s.addImage({ data: im.data, x: 0.92, y: y + 0.035, w: 0.5, h: 0.5 }); else icon(s, 'package', 0.97, y + 0.08, 0.4);
        txt(s, [{ text: '#' + (i + 1) + '  ' + cut(it.display, 34), options: { bold: true, color: WD.dk } }, { text: '   ' + wdKD(it.net) + ' · ' + wdBrand(it.brand), options: { color: WD.goldInk, bold: true } }], { x: 1.5, y, w: 4.4, h: 0.57, fontSize: 11.5, valign: 'middle' }); }
    }
    // right: material brand targets, KD of target, the working-day tick
    const MT = BR.meters.slice(0, 6), wdFrac6 = PN ? PN.workdays.done / PN.workdays.total : null;
    kicker(s, monthName + ' by brand · KD invoiced of target', WD.green, 6.45, 6.28, 1.72);
    if(MT.length){ const mh = Math.min(0.78, 4.55 / MT.length);
      MT.forEach((m, i) => { const y = 2.12 + i * mh;
        txt(s, m.label, { x: 6.45, y, w: 2.6, h: 0.3, fontSize: 13, bold: true, color: WD.dk });
        txt(s, wdKD(m.mtd) + ' of ' + wdKD(m.target) + (m.past ? '' : ' · ' + wdKD(m.toGo) + ' to go'), { x: 8.6, y, w: 4.13, h: 0.3, fontSize: 11.5, color: WD.text2, align: 'right' });
        meter(s, 6.45, y + 0.34, 6.28, 0.17, m.mtd / m.target, m.past ? WD.gold : WD.green, wdFrac6);
        const tags = []; if(m.past) tags.push('past target'); if(m.push) tags.push('PUSH'); if(m.week > 0) tags.push('this week ' + wdKD(m.week)); if(m.samples.length) tags.push('samples: ' + cut(m.samples.join(', '), 30));
        if(tags.length) txt(s, tags.join(' · '), { x: 6.45, y: y + 0.52, w: 6.28, h: 0.24, fontSize: 10, bold: m.push || m.past, color: m.push ? WD.goldInk : WD.text2 }); });
    } else txt(s, 'No brand target of KD 1,000 or more this month (every brand target is in A10).', { x: 6.45, y: 2.2, w: 6.28, h: 0.6, fontSize: 13, color: WD.text2 });
    basisLine(s, 'ERP to ' + wdDm(W.salesTo || W.to) + ', returns netted · DSR brand targets of KD 1,000 or more (they add up to ' + wdKD(BR.meters.reduce((a, m) => a + m.target, 0)) + ' of the ' + wdKD(BR.teamTarget) + ' team target; all ' + wdKD(BR.targetsTotal) + ' of brand targets in A10) · lines sharing one photo grouped');
    notes(s, [BR.ar, 'الأكثر مبيعاً: ' + BR.items.slice(0, 5).map((it, i) => (i + 1) + '. ' + it.display + ' ' + Math.round(it.net) + ' ديناراً').join('، ') + '.', SRC_AR]);
  }

  // ======== 7 · price discipline (no costs here: never "margin")
  const PR = PG.price;
  if(PR.qualifies){
    s = page('Growth and quality', 'Price discipline', PR.title); MAIN.price = slideNo();
    rr(s, 0.6, 1.7, 3.75, 4.85, WD.dk, { rectRadius: 0.15 });
    icon(s, 'shield', 0.9, 1.95, 0.6, true);
    txt(s, PR.fils != null ? String(PR.fils) : '—', { x: 0.9, y: 2.6, w: 3.2, h: 1.0, fontSize: 64, bold: true, color: WD.gold, valign: 'bottom' });
    txt(s, 'fils paid per KD 1 of list price', { x: 0.9, y: 3.6, w: 3.2, h: 0.35, fontSize: 14, bold: true, color: WD.white });
    const pl7 = [];
    if(PR.invoices) pl7.push('Clinic invoices this week: ' + wdKD(PR.gross) + ' at list price, ' + wdKD(PR.net) + ' paid');
    if(PR.discount != null) pl7.push('Average discount ' + PR.discount + '%' + (PR.avgPrev != null ? ' (earlier weeks ' + PR.avgPrev + '%)' : ''));
    pl7.push('Limits: ' + PR.limText + ' · open days ' + PR.limits.openDay + '%');
    txt(s, pl7.join('\n'), { x: 0.9, y: 4.05, w: 3.25, h: 1.7, fontSize: wdFit(pl7.join('\n'), 12.5, 3.25, 1.7, 10), color: WD.soft, paraSpaceAfter: 3 });
    if(PR.invoices) chip(s, 0.9, 5.95, PR.within + ' of ' + PR.invoices + ' invoices within limits', PR.within === PR.invoices ? WD.gold : WD.soft, WD.dk, 0.32);
    // the discount week by week, with the limit lines
    const HX = PR.history, gx = 4.6, gy = 2.15, gw = 4.4, gh = 3.4;
    kicker(s, 'Average discount, week by week', WD.green, gx, gw, 1.72);
    const hv = HX.map(h => h.discount), hmax = Math.max(45, ...hv.filter(v => v != null));
    const yOf = v => gy + gh - gh * v / hmax;
    [PR.limits.other, PR.limits.A].forEach(v => { if(v != null) s.addShape(pres.shapes.LINE, { x: gx, y: yOf(v), w: gw, h: 0, line: { color: WD.goldInk, width: 1, dashType: 'dash' } }); });
    const stp = gw / HX.length;
    HX.forEach((h, k) => { const bw = Math.min(0.32, stp * 0.62), bx = gx + k * stp + (stp - bw) / 2;
      if(h.discount == null){ s.addShape(pres.shapes.LINE, { x: bx, y: gy + gh, w: bw, h: 0, line: { color: WD.sage, width: 1, dashType: 'dash' } }); }
      else { const bh = Math.max(0.03, gh * h.discount / hmax); box(s, bx, gy + gh - bh, bw, bh, h.current ? WD.green : WD.soft);
        txt(s, h.discount.toFixed(1) + '%', { x: bx - 0.3, y: gy + gh - bh - 0.24, w: bw + 0.6, h: 0.22, fontSize: 9.5, bold: !!h.current, color: WD.dk, align: 'center' }); }
      txt(s, (h.current ? 'this wk' : wdDm(h.from)) + (h.monthEnd ? '*' : ''), { x: bx - 0.25, y: gy + gh + 0.05, w: bw + 0.5, h: 0.22, fontSize: 9, color: WD.text2, align: 'center' }); });
    txt(s, [{ text: '- - - ', options: { color: WD.goldInk, bold: true } }, { text: 'limits: others ' + PR.limits.other + '%, A clinics ' + PR.limits.A + '% · * week with a month-end', options: { color: WD.text2 } }], { x: gx, y: gy + gh + 0.32, w: gw, h: 0.24, fontSize: 9.5 });
    // right: exceptions, free goods, samples, returns
    const rx7 = 9.25, rw7 = 3.48; let y7 = 1.72;
    const item7 = (ic, head, body) => { icon(s, ic, rx7, y7 + 0.02, 0.38); txt(s, [{ text: head, options: { bold: true, color: WD.dk, breakLine: !!body } }].concat(body ? [{ text: body, options: { color: WD.text2 } }] : []),
      { x: rx7 + 0.5, y: y7, w: rw7 - 0.5, h: 0.9, fontSize: 11.5 }); y7 += 0.98; };
    item7('check', PR.over.length ? PR.over.length + (PR.over.length === 1 ? ' invoice' : ' invoices') + ' above the limit' : 'No clinic invoice above its limit', PR.over.length ? cut(PR.over.slice(0, 2).map(o => o.account + ' ' + o.pct + '% (limit ' + o.limit + '%)').join(' · '), 80) + ' · all in A11' : (PR.mtd.invoices ? 'this month: ' + PR.mtd.within + ' of ' + PR.mtd.invoices + ' within' : ''));
    if(PR.deals.docs) item7('layers', 'Free goods inside deals: ' + wdKD(PR.deals.gross, PR.deals.gross < 10 ? 2 : 0), 'at list price, on ' + PR.deals.docs + (PR.deals.docs === 1 ? ' paid invoice' : ' paid invoices') + ' — already in the discount');
    item7('gift', PR.samples.docs ? 'Samples: ' + PR.samples.docs + (PR.samples.docs === 1 ? ' document, ' : ' documents, ') + wdKD(PR.samples.gross, PR.samples.gross < 10 ? 2 : 0) + ' at list price' : 'No samples this week', PR.samples.docs ? cut(PR.samples.accounts.join(' · '), 70) : '');
    if(PR.conversionOk) item7('refresh', 'Sampled ' + wdDm(PR.conversion.from) + ' – ' + wdDm(PR.conversion.to) + ': ' + PR.conversion.converted + ' of ' + PR.conversion.clinics + ' bought that brand within 30 days', (PR.conversion.kd > 0 ? wdKD(PR.conversion.kd) + ' · ' : '') + 'a follow-through, not proof of cause');
    if(PR.returns.week != null && y7 < 6.2) item7('shield', 'Returns ' + PR.returns.week + '% of sales this week', (PR.returns.mtd != null ? PR.returns.mtd + '% month to date · ' : '') + 'limit ' + PR.returns.max + '%');
    basisLine(s, 'Clinic invoices only (channel accounts and returns left out) · discount = (list − paid) ÷ list, weighted by value · free goods inside a deal count as discount · samples = documents with free goods only · every invoice in A11');
    notes(s, [PR.ar, SRC_AR]);
  }

  // ======== 8 · doctors and clinics: relationships, the clinic base, the field
  const BA = PG.base;
  if(BA.qualifies){
    s = page('Growth and quality', 'Doctors and clinics', BA.title); MAIN.base = slideNo();
    const cols = [[0.6, 3.9], [4.72, 3.9], [8.84, 3.89]];
    // our clinic base
    rr(s, cols[0][0], 1.7, cols[0][1], 4.85, WD.paper, { rectRadius: 0.15 });
    kicker(s, 'Our clinic base', WD.green, cols[0][0] + 0.25, cols[0][1] - 0.5, 1.88);
    if(BA.active){ txt(s, bigRuns(BA.active + ' of ' + BA.territory, 40, WD.green), { x: 0.85, y: 2.25, w: 3.4, h: 0.75, valign: 'bottom' });
      txt(s, 'clinics in our list bought since ' + wdDm(BA.since || W.from), { x: 0.85, y: 3.02, w: 3.4, h: 0.5, fontSize: 13, bold: true, color: WD.dk }); }
    const bl8 = [];
    if(BA.spread) bl8.push('Largest clinic: ' + Math.round(BA.spread.top.share * 100) + '% of clinic sales (' + cut(BA.spread.top.clinic, 26) + ')', 'Top 5 clinics: ' + Math.round(BA.spread.top5 * 100) + '% · ' + BA.spread.clinics + ' clinics bought');
    if(BA.newThisMonth != null) bl8.push('New accounts in ' + monthName + ': ' + BA.newThisMonth);
    if(bl8.length) txt(s, bl8.join('\n'), { x: 0.85, y: 3.65, w: 3.4, h: 2.0, fontSize: wdFit(bl8.join('\n'), 12, 3.4, 2.0, 10), color: WD.text2, paraSpaceAfter: 4 });
    // this week in the field (each counted once)
    const F8 = BA.field;
    kicker(s, 'This week in the field', WD.green, cols[1][0], cols[1][1], 1.72);
    const t8 = F8 ? [[F8.visits, F8.visits === 1 ? 'clinic visit' : 'clinic visits', 'stethoscope'], [F8.doctors, 'doctors and staff met', 'users'], [F8.followUpClinics, F8.followUpClinics === 1 ? 'clinic with a follow-up date' : 'clinics with a follow-up date', 'calendar'], [F8.products, F8.products === 1 ? 'product presented' : 'products presented', 'layers']] : [];
    t8.forEach((t, i) => { const x = cols[1][0] + (i % 2) * 1.98, y = 2.1 + Math.floor(i / 2) * 1.55;
      rr(s, x, y, 1.9, 1.45, WD.paper, { rectRadius: 0.1 }); icon(s, t[2], x + 0.15, y + 0.15, 0.38);
      txt(s, String(t[0]), { x: x + 0.15, y: y + 0.5, w: 1.6, h: 0.5, fontSize: 30, bold: true, color: WD.green });
      txt(s, t[1], { x: x + 0.15, y: y + 1.0, w: 1.65, h: 0.4, fontSize: wdFit(t[1], 11, 1.65, 0.4, 9), color: WD.dk }); });
    const fl8 = [];
    if(F8 && F8.orders.n) fl8.push(F8.orders.n + (F8.orders.n === 1 ? ' order' : ' orders') + ' taken in the field: ' + wdKD(F8.orders.value) + ' (as logged, not ERP sales)');
    if(F8) F8.joint.slice(0, 1).forEach(j => fl8.push('Joint visit: ' + j.reps[0] + ' with ' + j.reps[1] + ' at ' + cut(j.clinic, 22)));
    if(fl8.length) txt(s, fl8.join('\n'), { x: cols[1][0], y: 5.3, w: cols[1][1], h: 1.2, fontSize: 11, color: WD.text2, paraSpaceAfter: 3 });
    // relationships and client care
    kicker(s, 'Relationships', WD.green, cols[2][0], cols[2][1], 1.72);
    let y8 = 2.1; const it8 = (ic, head, body) => { if(y8 > 6.0) return; icon(s, ic, cols[2][0], y8 + 0.02, 0.36);
      txt(s, [{ text: head, options: { bold: true, color: WD.dk, breakLine: !!body } }].concat(body ? [{ text: body, options: { color: WD.text2 } }] : []), { x: cols[2][0] + 0.48, y: y8, w: cols[2][1] - 0.48, h: 0.92, fontSize: 11.5 }); y8 += 0.98; };
    if(BA.repeat.length) it8('refresh', BA.repeat.length + (BA.repeat.length === 1 ? ' clinic ordered again' : ' clinics ordered again'), cut(BA.repeat.join(' · '), 80));
    if(BA.linkage && BA.linkage.clinicNet > 0) it8('chart', Math.round(BA.linkage.pct * 100) + '% of ' + monthName + '\'s clinic sales', 'came from ' + BA.linkage.clinics + ' clinics we visited this month (' + wdKD(BA.linkage.visitedNet) + ' of ' + wdKD(BA.linkage.clinicNet) + ')');
    if(BA.gov.length) it8('building', BA.gov.length + (BA.gov.length === 1 ? ' government site visited' : ' government sites visited'), cut(BA.gov.join(' · '), 80));
    if(BA.requests.n) it8('chat', BA.requests.onTime + ' of ' + BA.requests.n + ' client requests answered on time', BA.requests.open ? BA.requests.open + ' still open' : 'none still open');
    if(BA.moods.rated >= 3) it8('star', BA.moods.pleased + ' of ' + BA.moods.rated + ' rated visits: the doctor was pleased', 'as the rep recorded it on the visit');
    basisLine(s, 'A visit = one clinic on one day, however many of us logged it · each person met counted once ("doctors and staff" until the visit form records roles) · clinic base = invoices since ' + wdDm(BA.since || W.from) + ' · visits: A9');
    notes(s, [BA.ar, SRC_AR]);
  }

  // ======== 9 · the people: the same rows for everyone, money first
  pres.addSection({ title: 'The team' });
  s = page('The team', 'The people', 'What each of us invoiced and won this week'); MAIN.people = slideNo();
  { const PP = PG.people, n = PP.length, cw = (12.13 - 0.25 * (n - 1)) / Math.max(1, n);
    const staffList = typeof staff !== 'undefined' && Array.isArray(staff) ? staff : [];
    PP.forEach((pe, i) => { const x = 0.6 + i * (cw + 0.25), y = 1.65, h = 4.95;
      rr(s, x, y, cw, h, WD.paper, { rectRadius: 0.15 });
      avatar(s, pe.rep, x + 0.25, y + 0.25, 0.75);
      txt(s, cut(pe.rep, 22), { x: x + 1.15, y: y + 0.24, w: cw - 1.35, h: 0.42, fontSize: wdFit(pe.rep, 19, cw - 1.35, 0.42, 14), bold: true, color: WD.dk });
      const st = staffList.find(z => z.name === pe.rep); txt(s, st && st.role === 'supervisor' ? 'Supervisor · also sells' : 'Field sales', { x: x + 1.15, y: y + 0.64, w: cw - 1.35, h: 0.3, fontSize: 11.5, color: WD.text2 });
      txt(s, bigRuns(pe.money.big, 40, WD.green), { x: x + 0.25, y: y + 1.05, w: cw - 0.5, h: 0.7, valign: 'bottom' });
      txt(s, pe.money.line, { x: x + 0.25, y: y + 1.76, w: cw - 0.5, h: 0.28, fontSize: 11.5, color: WD.text2 });
      txt(s, pe.month.text, { x: x + 0.25, y: y + 2.06, w: cw - 0.5, h: 0.32, fontSize: wdFit(pe.month.text, 12.5, cw - 0.5, 0.32, 10), bold: true, color: WD.dk });
      let yy = y + 2.42;
      if(pe.month.up){ chip(s, x + 0.25, yy, pe.month.up, WD.gold, WD.dk, 0.28); yy += 0.36; }
      s.addShape(pres.shapes.LINE, { x: x + 0.25, y: yy + 0.04, w: cw - 0.5, h: 0, line: { color: WD.soft, width: 1 } }); yy += 0.14;
      if(pe.signature){ txt(s, [{ text: pe.signature.big + '  ', options: { bold: true, color: WD.green, fontSize: 18 } }, { text: pe.signature.line, options: { bold: true, color: WD.dk, fontSize: 12.5 } }], { x: x + 0.25, y: yy, w: cw - 0.5, h: 0.62, valign: 'top' });
        yy += 0.64; if(pe.signature.proof){ txt(s, 'Invoice ' + pe.signature.proof, { x: x + 0.25, y: yy, w: cw - 0.5, h: 0.24, fontSize: 10, color: WD.text2 }); yy += 0.28; } }
      if(pe.field){ icon(s, 'stethoscope', x + 0.25, yy + 0.04, 0.3); txt(s, pe.field, { x: x + 0.65, y: yy, w: cw - 0.9, h: 0.42, fontSize: wdFit(pe.field, 11, cw - 0.9, 0.42, 9.5), color: WD.text2, valign: 'middle' }); yy += 0.48; }
      pe.facts.forEach(f => { if(yy > y + h - 0.45) return; icon(s, 'check', x + 0.25, yy + 0.04, 0.3); txt(s, f, { x: x + 0.65, y: yy, w: cw - 0.9, h: 0.44, fontSize: wdFit(f, 11, cw - 0.9, 0.44, 9.5), color: WD.text2, valign: 'middle' }); yy += 0.5; }); }); }
  basisLine(s, 'Sales: ERP invoices ' + weekLbl + ', returns netted, for the clinics in each person\'s name · visits as logged; a joint visit counts for each person present · KPI: month to date (A7) · value per person over 3 months: A3b');
  notes(s, [PG.people.map(p => p.ar).join('\n'), SRC_AR]);

  // ======== 10 · from the field (the team's own photos, conditional)
  const phs = [];
  { const seen = new Set();
    for(const ph of (W.photos || [])){ if(phs.length >= 5) break; if(seen.has(ph.clinic) && (W.photos || []).length > 5) continue; const im = await visitPhoto(ph, 6.0, 4.85, 500); if(im){ phs.push({ ph }); seen.add(ph.clinic); } } }
  const momentumOk = S.momentum.length > 0;
  const mainCount = () => Object.keys(MAIN).length + 2;   // + the cover and the close
  if(phs.length >= 3 && mainCount() + 1 + (momentumOk ? 1 : 0) + 1 <= 13){
    s = page('The team', 'From the field', 'From the field: ' + phs.length + ' photos from ' + new Set(phs.map(x => x.ph.clinic)).size + ' clinics'); MAIN.photos = slideNo();
    const boxes = phs.length === 3 ? [[0.6, 1.75, 7.2, 4.85], [8.0, 1.75, 4.73, 2.325], [8.0, 4.275, 4.73, 2.325]]
      : phs.length === 4 ? [[0.6, 1.75, 5.94, 2.325], [6.79, 1.75, 5.94, 2.325], [0.6, 4.275, 5.94, 2.325], [6.79, 4.275, 5.94, 2.325]]
      : [[0.6, 1.75, 5.94, 4.85], [6.79, 1.75, 2.87, 2.325], [9.86, 1.75, 2.87, 2.325], [6.79, 4.275, 2.87, 2.325], [9.86, 4.275, 2.87, 2.325]];
    for(let i = 0; i < Math.min(phs.length, boxes.length); i++){ const [x, y, w, h] = boxes[i], im = await visitPhoto(phs[i].ph, w, h);
      if(!im) continue; s.addImage({ data: im.data, x, y, w, h }); box(s, x, y + h - 0.38, w, 0.38, WD.dk, { fill: { color: WD.dk, transparency: 25 } });
      txt(s, cut(phs[i].ph.clinic, 34) + ' · ' + phs[i].ph.rep + ' · ' + wdDm(phs[i].ph.date), { x: x + 0.12, y: y + h - 0.38, w: w - 0.24, h: 0.38, fontSize: 11, color: WD.white, valign: 'middle' }); }
    if((W.photos || []).length > phs.length) basisLine(s, '+' + ((W.photos || []).length - phs.length) + ' more photos in the app');
    notes(s, ['صور الفريق من زيارات هذا الأسبوع، كل صورة باسم العيادة والشخص والتاريخ.']);
  }

  // ======== 11 · against the last 8 weeks (strict frames only, conditional)
  const MO = S.momentum;
  if(MO.length && mainCount() + 1 + 1 <= 13){
    s = page('The team', 'Against the last 8 weeks', S.momentumTitle || 'Against the last 8 weeks'); MAIN.momentum = slideNo();
    const n = MO.length, lay = n >= 4 ? MO.slice(0, 4).map((m, i) => [0.6 + (i % 2) * 6.19, 1.75 + Math.floor(i / 2) * 2.5, 5.94, 2.35]) : n === 3 ? MO.map((m, i) => [0.6 + i * 4.127, 1.75, 3.877, 4.85]) : n === 2 ? MO.map((m, i) => [0.6 + i * 6.19, 1.75, 5.94, 4.85]) : [[0.6, 1.75, 12.13, 4.85]];
    MO.slice(0, 4).forEach((m, i) => { const [x, y, w, h] = lay[i], tall = h > 3;
      rr(s, x, y, w, h, WD.paper, { rectRadius: 0.15 });
      icon(s, m.frame === 'record' ? 'award' : m.frame === 'streak' ? 'refresh' : 'arrow-up', x + 0.25, y + 0.25, 0.62, true);
      txt(s, bigRuns(m.big, tall ? 48 : 44, WD.green), { x: x + 1.05, y: y + 0.12, w: tall ? w - 1.3 : 2.1, h: 0.8, valign: 'bottom' });
      txt(s, m.label, { x: x + 1.05, y: y + 0.92, w: tall ? w - 1.3 : 2.2, h: 0.45, fontSize: 13, bold: true, color: WD.dk });
      const cw = Math.min(w - 0.5, m.chip.length * 0.1 + 0.4); rr(s, x + 0.25, y + (tall ? 1.55 : 1.5), cw, 0.38, WD.gold, { rectRadius: 0.19 });
      txt(s, m.chip, { x: x + 0.25, y: y + (tall ? 1.55 : 1.5), w: cw, h: 0.38, fontSize: 12, bold: true, color: WD.dk, align: 'center', valign: 'middle' });
      const ex = tall ? x + 0.35 : x + 3.4, ey = tall ? y + 2.3 : y + 0.3, ew = tall ? w - 0.7 : 2.3, eh = tall ? 1.9 : 1.45, vals = m.values;
      const max = Math.max(1, ...vals.filter(v => v != null)), step = ew / vals.length;
      vals.forEach((v, k) => { const bw = Math.min(0.22, step * 0.72), bx = ex + k * step + (step - bw) / 2, cur = k === vals.length - 1;
        if(v == null){ s.addShape(pres.shapes.LINE, { x: bx, y: ey + eh, w: bw, h: 0, line: { color: WD.sage, width: 1, dashType: 'dash' } }); return; }
        const bh = v > 0 ? Math.max(0.04, eh * v / max) : 0; if(bh) box(s, bx, ey + eh - bh, bw, bh, cur ? WD.green : WD.soft);
        txt(s, m.key === 'sales' ? Math.round(v / 100) / 10 + 'k' : String(v), { x: bx - 0.3, y: ey + eh - bh - 0.22, w: bw + 0.6, h: 0.2, fontSize: 9, bold: cur, color: WD.dk, align: 'center' }); });
      const firstWk = H.find((h, k) => vals[k] != null);
      txt(s, (firstWk ? wdDm(firstWk.from) : ''), { x: ex, y: ey + eh + 0.05, w: ew / 2, h: 0.22, fontSize: 10, color: WD.text2 });
      txt(s, 'this wk', { x: ex + ew / 2, y: ey + eh + 0.05, w: ew / 2, h: 0.22, fontSize: 10, color: WD.text2, align: 'right' }); });
    basisLine(s, 'A rise needs this week at least 10% above the average of the earlier weeks; every measure, week by week (including the ones that went down), is in A5 · a dashed line = a week the files cannot measure');
    notes(s, [MO.map(m => m.label + ': ' + m.chip).join(' · '), LEFT_AR]);
  }

  // ======== 12 · next week, by name
  const NX = PG.next;
  pres.addSection({ title: 'Commitments' });
  s = page('Commitments', 'Next week · ' + wdWeekday(NX.from) + ' ' + wdDm(NX.from) + ' – ' + wdWeekday(UMCore.addDaysStr ? UMCore.addDaysStr(NX.from, 4) : NX.to) + ' ' + wdDm(UMCore.addDaysStr ? UMCore.addDaysStr(NX.from, 4) : NX.to), NX.title); MAIN.next = slideNo();
  let heroes = [[NX.planned, NX.planned === 1 ? 'visit planned' : 'visits planned', 'calendar'], [NX.followUps, NX.followUps === 1 ? 'follow-up due' : 'follow-ups due', 'refresh'], [NX.keyDue, (NX.keyDue === 1 ? 'key account' : 'key accounts') + ' still to visit in ' + monthName, 'target']].filter(h => h[0] > 0);
  if(!heroes.length) heroes = [[0, 'visits planned so far', 'calendar']];
  const hw = (12.13 - 0.2 * (heroes.length - 1)) / heroes.length;
  heroes.forEach((h, i) => { const x = 0.6 + i * (hw + 0.2), y = 1.62;
    rr(s, x, y, hw, 1.05, WD.paper, { rectRadius: 0.12 }); icon(s, h[2], x + 0.2, y + 0.27, 0.5);
    txt(s, String(h[0]), { x: x + 0.85, y: y + 0.08, w: 1.0, h: 0.9, fontSize: 40, bold: true, color: h[0] ? WD.green : WD.muted, valign: 'middle' });
    txt(s, h[1], { x: x + 1.85, y: y + 0.12, w: hw - 2.0, h: 0.82, fontSize: wdFit(h[1], 13, hw - 2.0, 0.82, 10), bold: true, color: WD.dk, valign: 'middle' }); });
  const nxp = NX.people, rowH = Math.min(1.12, 3.3 / Math.max(1, nxp.length));
  const fri = UMCore.addDaysStr ? UMCore.addDaysStr(NX.from, 4) : NX.to;
  nxp.forEach((p, i) => { const y = 2.9 + i * rowH;
    s.addShape(pres.shapes.LINE, { x: 0.6, y: y - 0.04, w: 12.13, h: 0, line: { color: WD.line, width: 1 } });
    avatar(s, p.rep, 0.6, y + 0.1, 0.5);
    txt(s, cut(p.rep, 16), { x: 1.25, y: y + 0.12, w: 1.7, h: 0.42, fontSize: 14, bold: true, color: WD.dk, valign: 'middle' });
    const seen = new Set(), its = [];
    p.planned.concat(p.followUps.map(f => Object.assign({ fu: true }, f))).sort((a, b) => a.date < b.date ? -1 : 1).forEach(v => { const k = v.date + v.clinic; if(seen.has(k)) return; seen.add(k);
      its.push({ text: wdWeekday(v.date) + ' ', options: { bold: true, color: WD.green } }, { text: cut(wdTitleCase(v.clinic), 26) + (v.fu ? ' (follow-up)' : '') + ' · ', options: { color: WD.text2 } }); });
    let runs = its.slice(0, 10);
    if(its.length > 10) runs.push({ text: '+' + (its.length / 2 - 5) + ' more (A12)', options: { color: WD.text2 } });
    if(!its.length) runs = [{ text: 'No visits saved yet for ' + wdDm(NX.from) + ' – ' + wdDm(fri), options: { bold: true, color: WD.goldInk } }];
    else { const last = runs[runs.length - 1]; if(/ · $/.test(last.text)) runs[runs.length - 1] = { text: last.text.replace(/ · $/, ''), options: last.options }; }
    const kd = p.keyDue.filter(a => !a.planned);
    if(kd.length) runs = runs.concat([{ text: '', options: { breakLine: true } }, { text: 'Key accounts still due: ', options: { bold: true, color: WD.dk } }, { text: kd.slice(0, 4).map(a => cut(wdTitleCase(a.name), 24)).join(' · ') + (kd.length > 4 ? ' · +' + (kd.length - 4) : ''), options: { color: WD.text2 } }]);
    txt(s, runs, { x: 3.0, y: y + 0.16, w: 9.73, h: rowH - 0.2, fontSize: wdFit(runs.map(r => r.text).join(''), 12, 9.73, rowH - 0.2, 9.5), valign: 'top' }); });
  const bottom = [];
  if(NX.toInvoice.length) bottom.push('To invoice: ' + NX.toInvoice.slice(0, 3).map(o => cut(o.clinic, 24) + ' ' + wdKD(o.value)).join(' · ') + ' (as logged)');
  if(NX.lastPlanOk) bottom.push('This week\'s plan: ' + NX.lastPlan.plannedDone + ' of ' + NX.lastPlan.planned + ' planned visits done, ' + NX.lastPlan.followUpsDone + ' of ' + NX.lastPlan.followUps + ' follow-ups');
  if(bottom.length) txt(s, bottom.join('   ·   '), { x: 0.6, y: 6.3, w: 12.13, h: 0.34, fontSize: 12, bold: true, color: WD.dk });
  basisLine(s, 'Plans and follow-up dates as saved in the app today · key accounts = class A clinics not yet visited this month · every plan and follow-up, and this week\'s plan against what was done: A12');
  notes(s, [NX.ar, 'هذا ما هو محفوظ في التطبيق اليوم: خطط الأيام ومواعيد المتابعة والحسابات الرئيسية المتبقية لهذا الشهر.']);

  // ======== 13 · close: the commitments, the ask, the recap
  const CO = PG.close;
  s = pres.addSlide({ masterName: 'UM_COVER', sectionTitle: 'Commitments' }); MAIN.close = slideNo();
  txt(s, CO.kicker.toUpperCase(), { x: 0.7, y: 1.45, w: 7.2, h: 0.35, fontSize: 13, bold: true, color: WD.gold, charSpacing: 3 });
  txt(s, CO.title, { x: 0.7, y: 1.8, w: 7.3, h: 0.95, fontSize: 32, bold: true, color: WD.white, valign: 'top' });
  const cm = CO.commits.length ? CO.commits : [{ text: 'Every plan and follow-up for next week is in A12.' }];
  let cy = 2.95;
  cm.forEach((c, i) => { s.addShape(pres.shapes.OVAL, { x: 0.7, y: cy + 0.06, w: 0.52, h: 0.52, fill: { color: WD.gold }, line: { color: WD.gold } });
    txt(s, String(i + 1), { x: 0.7, y: cy + 0.06, w: 0.52, h: 0.52, fontSize: 17, bold: true, color: WD.dk, align: 'center', valign: 'middle' });
    txt(s, c.text, { x: 1.42, y: cy, w: 6.45, h: 0.66, fontSize: wdFit(c.text, 17, 6.45, 0.66, 12), color: WD.white, valign: 'middle' }); cy += 0.8; });
  if(CO.ask){ rr(s, 0.7, cy + 0.08, 7.17, 0.72, WD.gold, { rectRadius: 0.1 });
    txt(s, [{ text: 'OUR ASK  ', options: { bold: true, color: WD.dk, fontSize: 11, charSpacing: 2 } }, { text: '“' + CO.ask + '”', options: { bold: true, color: WD.dk, fontSize: 14 } }], { x: 0.9, y: cy + 0.08, w: 6.85, h: 0.72, valign: 'middle' }); cy += 0.9; }
  const ry0 = Math.max(cy + 0.12, 5.6), rtx = CO.recap + '\nEvery figure behind these pages is in the appendix that follows (A0).';
  txt(s, [{ text: CO.recap, options: { color: WD.soft, breakLine: true } }, { text: 'Every figure behind these pages is in the appendix that follows (A0).', options: { color: WD.soft, italic: true } }],
    { x: 0.7, y: ry0, w: 7.2, h: 6.95 - ry0, fontSize: wdFit(rtx, 12.5, 7.2, 6.95 - ry0, 10), paraSpaceAfter: 4 });
  yellowFrame(s);
  await frameFill(s, 'close');
  notes(s, [CO.ar, 'شكراً للفريق على أسبوعه.', LEFT_AR]);

  say('Writing the appendix…');
  await wdAppendix(pres, { W, S, PG, K, TM, VP, txt, rr, box, kicker, basisLine, page, icon, cut, weekLbl, H, R, P, kS, MAIN, monthName, avatar, meter, chip, say });
  return pres;
}

// ---- the appendix: every figure behind the story, in plain tables ----
// A0 lists the pages (each a link); every zero and every measure that went
// down lives here, with the definitions and the picture credits at the end.
async function wdAppendix(pres, c){
  const { W, S, PG, K, TM, VP, txt, rr, kicker, page, cut, H, R, P, MAIN, monthName } = c;
  const kd2 = n => n == null ? '—' : wdKD(n, 2), kd0 = n => n == null ? '—' : wdKD(n);
  const pc = x => x == null ? '—' : Math.round(x * 100) + '%';
  const dmy = d => d ? wdDm(d) : '—';
  const INDEX = [];
  pres.addSection({ title: 'Appendix' });
  // A0 first; its links are written once every page exists
  const a0 = pres.addSlide({ masterName: 'UM_PAGE', sectionTitle: 'Appendix' });
  a0.addText('Appendix — every figure behind the story', { placeholder: 'title', fontSize: 28 });
  kicker(a0, 'Appendix');
  const head = (cells) => cells.map(h => ({ text: h, options: { bold: true, color: WD.white, fill: { color: WD.dk }, fontSize: 10, valign: 'middle' } }));
  const cellOpt = (v, i, extra) => Object.assign({ fontSize: 10, color: WD.ink, fill: { color: i % 2 ? WD.white : WD.paper }, align: typeof v === 'number' || /^[−-]?KD |^\d+%$|^—$|^\d+(\.\d+)?%?$/.test(String(v)) ? 'right' : 'left', valign: 'middle' }, extra || {});
  // a paginated table: rows are arrays (a cell may be {text, options})
  const table = (code, title, cols, rows, colW, emptyMsg, per, note) => {
    per = per || 13; const pages = Math.max(1, Math.ceil(rows.length / per)); let first = null;
    for(let pg = 0; pg < pages; pg++){
      const s = page('Appendix', code + (pages > 1 ? ' · ' + (pg + 1) + ' of ' + pages : ''), cut(title, 66));
      if(first == null){ first = pres.slides.length; INDEX.push([code, title, first]); }
      const chunk = rows.slice(pg * per, pg * per + per);
      if(!chunk.length){ txt(s, emptyMsg || 'Nothing to list.', { x: 0.6, y: 1.8, w: 12.1, h: 0.5, fontSize: 14, color: WD.muted }); continue; }
      s.addTable([head(cols)].concat(chunk.map((r, i) => r.map(v => (v && typeof v === 'object' && 'text' in v) ? { text: String(v.text), options: cellOpt(v.text, i, v.options) } : { text: String(v == null ? '—' : v), options: cellOpt(v, i) }))),
        { x: 0.6, y: 1.6, w: 12.13, colW, rowH: 0.34, fontFace: 'Calibri', border: { type: 'solid', pt: 0.5, color: WD.line } });
      if(note) txt(s, note, { x: 0.6, y: 6.62, w: 12.13, h: 0.36, fontSize: 9.5, color: WD.text2 });
    }
    return first;
  };
  const neg = { color: WD.red };

  // A1 · every achievement, strongest first (down to the smallest)
  { const all = S.all, per = 24, pages = Math.max(1, Math.ceil(all.length / per));
    for(let pg = 0; pg < pages; pg++){
      const s = page('Appendix', 'A1' + (pages > 1 ? ' · ' + (pg + 1) + ' of ' + pages : ''), 'Every achievement of the week, strongest first');
      if(!pg) INDEX.push(['A1', 'Every achievement of the week', pres.slides.length]);
      const chunk = all.slice(pg * per, pg * per + per);
      if(!chunk.length){ txt(s, 'No achievement passed the truth rules this week; every figure is in the pages that follow.', { x: 0.6, y: 1.8, w: 12.1, h: 0.5, fontSize: 14, color: WD.muted }); continue; }
      chunk.forEach((it, i) => { const col = i < 12 ? 0 : 1, row = i % 12, x = 0.6 + col * 6.17, y = 1.6 + row * 0.42;
        c.icon(s, it.icon || 'check', x, y + 0.04, 0.28);
        txt(s, [{ text: (it.big ? it.big + ' · ' : '') + cut(it.headline, 60), options: { bold: true, color: WD.dk, fontSize: 11 } }, { text: '  ' + cut(it.basis || '', 70), options: { color: WD.text2, fontSize: 9 } }],
          { x: x + 0.38, y, w: 5.7, h: 0.4, valign: 'middle' }); });
    } }

  // A2 · the week per person (every zero lives here)
  { const rowsA2 = R.map(r => { const p = P[r]; const cov = p.weekCovered;
      return [r, cov ? kd0(p.week) : 'no file', p.prevWeek != null ? kd0(p.prevWeek) : '—', p.invoicesValue, p.fieldVisits, p.clinics, p.doctorsMet, p.productsPresented, p.joint, p.calls, p.phoneOrders, p.orders ? p.orders + ' · ' + kd0(p.orderValue) : '0', p.followUps, p.photos, p.aVisited + ' of ' + p.aTotal]; });
    const T = W.team; rowsA2.push([{ text: 'Team (distinct)', options: { bold: true } }, kd0(T.week), kd0(T.prevWeek), W.mix.invoices, T.fieldVisits, T.clinics, T.doctorsMet, T.productsPresented, '—', '—', '—', '—', T.followUpClinics + ' clinics', '—', '—']);
    table('A2', 'The week per person, ' + c.weekLbl, ['Person', 'Sales', 'Same days last wk', 'Invoices', 'Clinic visits', 'Clinics', 'Doctors & staff', 'Products shown', 'Joint', 'Calls', 'Phone orders', 'Orders (as logged)', 'Follow-ups set', 'Photos', 'Key accounts'], rowsA2,
      [1.35, 0.95, 0.95, 0.65, 0.7, 0.6, 0.75, 0.75, 0.55, 0.55, 0.65, 1.15, 0.75, 0.6, 1.18], '', 13, 'A visit = one clinic on one day; a joint visit counts for each person present, once per clinic-day; the team row counts each clinic-day, person and product once. "no file" = that person\'s salesman is not in this week\'s files.'); }

  // A3 · month to date against target (people, team, then every brand target)
  { const day = parseInt(W.to.slice(8, 10), 10), dim = new Date(+W.to.slice(0, 4), +W.to.slice(5, 7), 0).getDate();
    const rowsA3 = R.map(r => { const p = P[r]; return [r, kd0(p.mtd), p.target ? kd0(p.target) : 'no target', pc(p.pct), p.pace != null ? pc(p.pace) : '—', p.mtdSrc || '—']; });
    const tm = PG.plan ? PG.plan.team : null; if(tm) rowsA3.push([{ text: 'Team (people with a target)', options: { bold: true } }, kd0(tm.mtd), kd0(tm.target), pc(tm.pct), PG.plan.pace != null ? pc(PG.plan.pace) : '—', 'day ' + day + ' of ' + dim]);
    (W.brands || []).filter(b => b.target > 0).sort((a, b) => wdBrand(a.brand) < wdBrand(b.brand) ? -1 : 1).forEach(b => rowsA3.push(['Brand · ' + wdBrand(b.brand), kd0(b.mtd), kd0(b.target), pc(b.mtd / b.target), pc(b.mtd / b.target / day * dim), b.prevMonth != null ? 'last month ' + kd0(b.prevMonth) : '—']));
    table('A3', monthName + ' to date against target (ERP to ' + dmy(W.salesTo || W.to) + ')', ['Who', 'ERP month to date', 'DSR target', '% of target', 'Straight-line pace', 'Source / note'], rowsA3, [3.2, 1.7, 1.6, 1.3, 1.6, 2.73], 'No DSR target this month.', 14,
      '"Straight-line pace" = month to date ÷ days gone × days in the month — unfair early in a month (most sales come after day 10); it is kept here only. 0 with "no ERP sales file" means the file is missing, not zero sales.'); }

  // A3b · value per person, the last 3 closed months (management's raise and commission view)
  { const rowsB = []; (VP.months || []).forEach(m => R.forEach(r => { const v = m.byRep[r] || {};
      rowsB.push([wdMonth({ month: m.month, partial: false }), r, v.sales == null ? 'no file' : kd0(v.sales), v.target ? kd0(v.target) : '—', pc(v.pct), v.discount != null ? v.discount + '%' : '—', v.withinLimit != null ? Math.round(v.withinLimit * 100) + '% of ' + v.invoices : '—', v.returnsPct != null ? v.returnsPct + '%' : '—', v.newAccounts == null ? '—' : v.newAccounts, v.placements == null ? '—' : v.placements, v.kpi == null ? '—' : v.kpi, v.base == null ? '—' : kd0(v.base)]); }));
    table('A3b', 'Value per person, the last 3 closed months', ['Month', 'Person', 'ERP net', 'Target', '% of target', 'Avg discount', 'Invoices within limits', 'Returns', 'New accounts', 'First-time products', 'KPI /100', 'Commission base'], rowsB,
      [0.8, 1.3, 1.1, 1.0, 0.85, 0.95, 1.45, 0.8, 0.9, 1.0, 0.8, 1.18], 'No closed month in the files yet.', 13,
      'Commission base = ERP net (returns netted) minus the clinic invoices above their discount limit. "no file" = no sales file for that person that month. New accounts and first-time products: first in our files (from ' + dmy(W.historyFrom) + '). No profit is shown: the files carry no costs.'); }

  // A4 · every win of the week, biggest first; then the seeds (samples)
  { const wn = S.wins.map(w => [dmy(w.date), w.type === 'new' ? 'New account' : w.type === 'back' ? 'Back after 60+ days' : 'First-time product', cut(w.account, 40), w.rep, cut(w.product ? wdName(w.product) + ' (' + w.product + ')' : w.lastBefore ? 'previous order ' + dmy(w.lastBefore) : '', 60), w.doc || '—', w.net != null ? kd2(w.net) : '—'])
      .concat((W.free.samples.list || []).map(sm => [dmy(sm.date), 'Seed (samples)', cut(sm.account, 40), sm.rep, cut(sm.lines.map(l => l.qty + ' × ' + l.product).join(', '), 60), sm.doc, 'list ' + kd2(sm.gross)]));
    table('A4', 'Every win of the week, biggest first, then the seeds', ['Date', 'Type', 'Account', 'Person', 'Product or detail', 'Invoice', 'KD'], wn, [0.8, 1.65, 2.9, 1.15, 3.6, 1.15, 0.88], 'No new account, first-time product or sample in this week\'s files.', 13,
      (W.winsBlocked && W.winsBlocked.length ? 'Not counted yet for ' + W.winsBlocked.join(', ') + ': their sales files do not cover the 4 weeks before this week. ' : '') + 'Seeds are documents with free goods only (list value shown); a free line on a paid invoice is part of that deal.'); }

  // A5 · this week against the last 8 weeks (the sales chart and the money rows, then the rest)
  { const lab = H.map(h => h.current ? 'to ' + dmy(h.to) : dmy(h.from));
    const best = (vals) => { const m = Math.max(...vals.filter(v => v != null)); return v => v != null && v === m && vals.filter(x => x === m).length === 1; };
    const rowOf = (label, vals, money) => { const isBest = best(vals); return [{ text: label, options: { bold: true } }].concat(vals.map((v, k) => {
      const prev = k > 0 ? vals[k - 1] : null, arrow = v != null && prev != null && k === vals.length - 1 ? (v > prev ? ' ▲' : v < prev ? ' ▼' : '') : '';
      return { text: (v == null ? '—' : money ? Math.round(v).toLocaleString('en-US') : String(v)) + (isBest(v) ? ' ★' : '') + arrow, options: Object.assign({ align: 'right' }, arrow === ' ▼' ? neg : {}) }; })); };
    const grid = (s, rows, y, rowH) => s.addTable([head(['Measure'].concat(lab))].concat(rows.map((r, i) => r.map(v => ({ text: v.text, options: cellOpt(v.text, i, Object.assign({ fontSize: 10 }, v.options)) })))),
      { x: 0.6, y, w: 12.13, colW: [2.53].concat(H.map(() => 9.6 / H.length)), rowH, fontFace: 'Calibri', border: { type: 'solid', pt: 0.5, color: WD.line } });
    const foot = s => txt(s, '★ best of the 8 weeks · ▲▼ this week against last week · — = the files cannot measure that week (no sales file for that person, or before the team used the app) · weeks run Sunday–Saturday', { x: 0.6, y: 6.62, w: 12.13, h: 0.3, fontSize: 9.5, color: WD.text2 });
    const s = page('Appendix', 'A5 · 1 of 2', 'This week against the last 8 weeks: sales'); INDEX.push(['A5', 'This week against the last 8 weeks', pres.slides.length]);
    s.addChart(pres.charts.BAR, R.map(r => ({ name: r, labels: lab, values: H.map(h => h.byRep[r] == null ? null : Math.round(h.byRep[r])) })),
      { x: 0.6, y: 1.5, w: 12.13, h: 2.55, barDir: 'col', barGrouping: 'stacked', chartColors: [WD.green, WD.gold, WD.dk, WD.sage].slice(0, R.length), showLegend: true, legendPos: 'r', legendFontSize: 10,
        catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, catAxisLabelColor: WD.text2, valAxisLabelColor: WD.text2, valGridLine: { color: 'E3E9E5', size: 0.5 }, catGridLine: { style: 'none' }, valAxisLabelFormatCode: '#,##0' });
    const tl = S.salesLikeForLike;
    grid(s, [rowOf('Sales, KD (' + (tl.people.length < R.length ? tl.people.join(' + ') : 'team') + ')', tl.values, true)].concat(R.map(r => rowOf(r, H.map(h => h.byRep[r]), true))).concat([rowOf('Invoices', H.map(h => h.invoices))]), 4.2, 0.3);
    foot(s);
    const s2 = page('Appendix', 'A5 · 2 of 2', 'This week against the last 8 weeks: customers and the field');
    grid(s2, [rowOf('Clinic accounts invoiced', H.map(h => h.accounts)), rowOf('First-time products', H.map(h => h.placements)), rowOf('New accounts', H.map(h => h.newAccounts)),
      rowOf('Back after 60+ days', H.map(h => h.reactivated)), rowOf('Sample documents (seeds)', H.map(h => h.samples)), rowOf('Clinic visits', H.map(h => h.fieldVisits)), rowOf('Doctors & staff met', H.map(h => h.doctorsMet)),
      [{ text: 'Average discount', options: { bold: true } }].concat(H.map(h => ({ text: h.discount == null ? '—' : h.discount.toFixed(1) + '%', options: { align: 'right' } })))], 1.6, 0.42);
    foot(s2); }

  // A6 · month by month (two pages)
  { const mLbl = TM.map(m => wdMonth(m));
    const s = page('Appendix', 'A6 · 1 of 2', 'Month by month: sales against target'); INDEX.push(['A6', 'Month by month', pres.slides.length]);
    s.addChart(pres.charts.BAR, [{ name: 'Achieved', labels: mLbl, values: TM.map(m => m.team.sales == null ? null : Math.round(m.team.sales)) }, { name: 'Target', labels: mLbl, values: TM.map(m => m.team.target == null ? null : Math.round(m.team.target)) },
      { name: 'Same days (1–' + parseInt(W.to.slice(8, 10), 10) + ')', labels: mLbl, values: TM.map(m => m.team.sameDays == null ? null : Math.round(m.team.sameDays)) }],
      { x: 0.6, y: 1.55, w: 12.13, h: 2.4, barDir: 'col', barGrouping: 'clustered', chartColors: [WD.green, WD.soft, WD.gold], showLegend: true, legendPos: 'r', legendFontSize: 10, showValue: true, dataLabelFontSize: 8, dataLabelFormatCode: '#,##0',
        catAxisLabelFontSize: 10, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, catAxisLabelColor: WD.text2 });
    const rows6 = R.map(r => [r].concat(TM.map(m => { const v = m.byRep[r]; return v.sales == null ? 'no file' : kd0(v.sales) + (v.pct != null ? ' · ' + pc(v.pct) : ''); })));
    rows6.push([{ text: 'Team (with a target)', options: { bold: true } }].concat(TM.map(m => m.team.sales == null ? '—' : kd0(m.team.sales) + (m.team.pct != null ? ' · ' + pc(m.team.pct) : ''))));
    s.addTable([head(['Person'].concat(mLbl))].concat(rows6.map((r, i) => r.map(v => (v && typeof v === 'object' && 'text' in v) ? { text: v.text, options: cellOpt(v.text, i, v.options) } : { text: String(v), options: cellOpt(v, i) }))),
      { x: 0.6, y: 4.1, w: 12.13, colW: [2.13].concat(TM.map(() => 10 / TM.length)), rowH: 0.34, fontFace: 'Calibri', border: { type: 'solid', pt: 0.5, color: WD.line } });
    txt(s, 'Each month against its own DSR target · "no file" = no sales file for that person that month (never drawn as 0) · the running month is labelled with its last day', { x: 0.6, y: 6.62, w: 12.13, h: 0.3, fontSize: 9.5, color: WD.text2 });
    const s2 = page('Appendix', 'A6 · 2 of 2', 'Month by month: the field work and the KPI');
    const rowsF = [['Clinic visits a working day', m => R.map(r => r + ' ' + m.byRep[r].perDay).join(' · ')], ['Doctors & staff met', m => m.team.doctorsMet == null ? '—' : String(m.team.doctorsMet)], ['New accounts', m => m.team.newAccounts == null ? '—' : String(m.team.newAccounts)],
      ['First-time products', m => m.team.placements == null ? '—' : String(m.team.placements)], ['KPI total /100', m => R.map(r => r + ' ' + (m.byRep[r].kpi == null ? '—' : m.byRep[r].kpi)).join(' · ')]];
    s2.addTable([head(['Measure'].concat(mLbl))].concat(rowsF.map((f, i) => [{ text: f[0], options: cellOpt(f[0], i, { bold: true }) }].concat(TM.map(m => ({ text: f[1](m), options: cellOpt(f[1](m), i, { fontSize: 9.5, align: 'left' }) }))))),
      { x: 0.6, y: 1.6, w: 12.13, colW: [2.13].concat(TM.map(() => 10 / TM.length)), rowH: 0.6, fontFace: 'Calibri', border: { type: 'solid', pt: 0.5, color: WD.line } });
    txt(s2, 'New accounts and first-time products are left out ("—") for the first month of the files: every account would look new. The KPI total is left out for a month nobody logged a visit or call.', { x: 0.6, y: 6.55, w: 12.13, h: 0.36, fontSize: 9.5, color: WD.text2 }); }

  // A7 · the KPI scorecard, month to date
  { const items = (K[R[0]] && K[R[0]].items) || [];
    const fillOf = v => v == null ? null : v >= 0.85 ? WD.mint : v >= 0.6 ? 'FFF4D6' : null;
    const rows7 = items.map((it, k) => [it.label, it.weight].concat(R.map(r => { const x = (K[r] && K[r].items || [])[k] || {}; const f = fillOf(x.score);
      return { text: x.score == null ? '—' : Math.round(x.score * 100) + '%' + (x.value != null ? ' · ' + cut(String(x.value), 26) : ''), options: f ? { fill: { color: f } } : {} }; })));
    rows7.push([{ text: 'Total out of 100', options: { bold: true } }, 100].concat(R.map(r => ({ text: K[r] ? String(K[r].total) : '—', options: { bold: true } }))));
    table('A7', 'KPI scorecard, ' + wdRange(W.monthStart, W.to), ['Measure', 'Weight'].concat(R), rows7, [4.3, 0.8].concat(R.map(() => 7.03 / R.length)), 'No KPI data.', 14,
      'Management\'s 10 measures with the supervisor\'s settings · 85% and over shaded green, 60–85% yellow · — = nothing to measure yet (its weight is spread over the others).'); }

  // A8 · every invoice of the week, with the tie-out to the money page
  { const inv = (W.wins.invoices || []).filter(i => R.includes(i.rep));
    const rows8 = inv.slice().sort((a, b) => b.net - a.net || (a.date < b.date ? -1 : 1)).map(i => [dmy(i.date), i.rep, i.doc, cut(i.account, 38) + (i.channel ? ' (channel)' : i.internal ? ' (internal)' : ''), cut(i.brands.map(wdBrand).join(', '), 36), i.lines,
      { text: Math.abs(i.net) < 0.0005 ? 'sample · KD 0.00' : kd2(i.net), options: i.net < -0.0005 ? neg : {} }]);
    const mxA = W.mix;
    table('A8', 'Every invoice of the week, largest first', ['Date', 'Person', 'Document', 'Account', 'Brands', 'Lines', 'KD'], rows8, [0.8, 1.2, 1.45, 3.9, 2.9, 0.65, 1.23], 'No sales file for this week in the app yet.', 13,
      'Tie-out: ' + (W.salesCovered ? PG.money.recon : 'no file') + ' · channel = My Fatoorah and individual customers · returns in red.'); }

  // A9 · every visit and call of the week
  { const seen = {}; const rows9 = W.visits.map(v => { const k = v.clinic + '|' + v.date + '|' + v.type, dup = v.type === 'visit' && seen[k]; seen[k] = 1;
      return [dmy(v.date), v.rep + (v.withRep ? ' + ' + v.withRep : ''), cut(v.clinic, 34) + (dup ? ' (same visit)' : ''), v.type, cut(v.doctors.join(', ') || '—', 32), v.products || '—', v.order ? kd2(v.order) : '—', v.followUp ? dmy(v.followUp) : '—']; });
    table('A9', 'Every visit and call of the week', ['Date', 'Person(s)', 'Clinic', 'Type', 'Doctors & staff met', 'Products', 'Order (as logged)', 'Follow-up'], rows9, [0.8, 1.9, 2.95, 1.0, 2.5, 0.8, 1.2, 0.98], 'No visits logged this week.', 13,
      'A clinic-day logged twice (a joint visit logged by both) is marked "(same visit)" and counted once in the team figures.'); }

  // A10 · products, then brands
  { const rows10 = (W.products || []).map(p => [cut(p.product, 46), cut(wdName(p.product), 34), wdBrand(p.brand), p.qty, p.accounts, kd2(p.net)]);
    table('A10', 'Products invoiced this week', ['ERP product', 'Shown as', 'Brand', 'Units', 'Clinics', 'KD'], rows10, [4.3, 3.2, 1.6, 0.8, 0.8, 1.43], 'No sales file for this week in the app yet.', 13,
      'Services (delivery, maintenance, inspection fees) and internal marketing moves are left out · a family photo stands for every size or variant of its product line.');
    const day = parseInt(W.to.slice(8, 10), 10), dim = new Date(+W.to.slice(0, 4), +W.to.slice(5, 7), 0).getDate();
    const rowsB = (W.brands || []).filter(b => b.week || b.mtd || b.target).map(b => [wdBrand(b.brand), kd0(b.week), kd0(b.mtd), b.target ? kd0(b.target) : 'no target', b.target ? pc(b.mtd / b.target) : '—', b.target ? pc(b.mtd / b.target / day * dim) : '—', b.prevMonth != null ? kd0(b.prevMonth) : '—']);
    table('A10b', 'Brands: this week, the month and the targets', ['Brand', 'This week', 'Month to date', 'DSR target', '% of target', 'Straight-line pace', 'Last month'], rowsB, [2.6, 1.5, 1.6, 1.6, 1.4, 1.73, 1.7], 'No brand figures yet.', 13,
      'DSR brand targets add up to ' + kd0(PG.brands.targetsTotal) + ' (team target ' + kd0(PG.brands.teamTarget) + ') · a brand target under KD 1,000 never reaches the main pages.'); }

  // A11 · discount per invoice, clients and the pipeline, samples ledger
  { const lim = W.margin.limits || {};
    const rows11 = (UMCore.clinicInvoices ? UMCore.clinicInvoices(UMCore.erpAttributedRows(Object.assign(digestData(), { today: todayStr() })), R, W.from, W.to, Object.fromEntries((clinics || []).map(x => [x.id, x])), W.settings) : [])
      .map(i => [dmy(i.date), i.rep, i.doc, cut(i.account, 36), kd2(i.gross), kd2(i.net), { text: i.pct + '%', options: i.within ? {} : neg }, i.limit + '%', i.within ? 'within' : { text: 'above', options: neg }]);
    table('A11', 'Discount per clinic invoice against its limit', ['Date', 'Person', 'Invoice', 'Clinic', 'List KD', 'Paid KD', 'Discount', 'Limit', ''], rows11, [0.8, 1.2, 1.4, 3.43, 1.15, 1.15, 1.0, 0.8, 1.2], 'No clinic invoice this week.', 13,
      'Limits (supervisor\'s KPI settings): A clinics ' + lim.A + '%, others ' + lim.other + '%, open days ' + lim.openDay + '% · this week ' + (W.margin.discount != null ? W.margin.discount + '%' : '—') + ' against ' + (W.margin.avgPrev != null ? W.margin.avgPrev + '%' : '—') + ' in the earlier weeks.');
    const sat = W.satisfaction, ex = W.expansion;
    const rowsC = [['Client requests answered on time', sat.requests ? sat.answeredOnTime + ' of ' + sat.requests : 'none logged'], ['Requests still open', String(sat.open)], ['Escalations', String(sat.escalations)],
      ['Returns, this week', sat.returnsPct != null ? sat.returnsPct + '% (' + kd2(sat.returnsKd) + ')' : '—'], ['Returns, month to date', sat.returnsPctMtd != null ? sat.returnsPctMtd + '%' : '—'],
      ['Doctors\' mood (as the rep recorded it)', (sat.moods.pleased + sat.moods.neutral + sat.moods.concerned) ? sat.moods.pleased + ' pleased · ' + sat.moods.neutral + ' neutral · ' + sat.moods.concerned + ' concerned' : 'not rated yet'],
      ['Clinics buying since ' + dmy(ex.since), ex.active + ' of ' + ex.territory], ['New accounts this month', ex.newThisMonth ? ex.newThisMonth.map(x => x.account).join(', ') || 'none' : '—']]
      .concat((ex.pipeline || []).map(p => ['Prospect · ' + cut(p.clinic, 40) + (p.kind !== 'clinic' ? ' (' + p.kind + ')' : ''), p.rep + ' · ' + p.visits + (p.visits === 1 ? ' visit' : ' visits') + ' · last ' + dmy(p.last)]))
      .concat((W.free.samples.list || []).map(sm => ['Sample · ' + sm.doc + ' · ' + cut(sm.account, 30), sm.rep + ' · ' + dmy(sm.date) + ' · list ' + kd2(sm.gross) + ' · ' + cut(sm.lines.map(l => l.product).join(', '), 50)]))
      .concat((W.free.deals.list || []).map(d => ['Free inside a deal · ' + d.doc, cut(d.account, 30) + ' · list ' + kd2(d.gross) + ' · ' + cut(d.lines.map(l => l.product).join(', '), 50)]));
    table('A11b', 'Clients, the pipeline and the samples ledger', ['Measure', 'This week'], rowsC, [5.0, 7.13], '', 13, 'Prospects = clinics visited this week with no invoice since ' + dmy(ex.since) + ' (our files start then) · government sites and pharmacies are marked: they buy through tenders or other accounts.'); }

  // A12 · next week in full, and this week's plan against what was done
  { const rows12 = [];
    PG.next.people.forEach(p => { p.planned.forEach(v => rows12.push([p.rep, wdWeekday(v.date) + ' ' + dmy(v.date), 'Planned visit', cut(v.clinic, 46)]));
      p.followUps.forEach(v => rows12.push([p.rep, wdWeekday(v.date) + ' ' + dmy(v.date), 'Follow-up due', cut(v.clinic, 46)]));
      if(!p.planned.length) rows12.push([p.rep, '—', '0 planned', 'No visits saved yet for next week']);
      p.keyDue.forEach(a => rows12.push([p.rep, '—', 'Key account still due' + (a.planned ? ' (booked)' : ''), cut(a.name, 40) + (a.kd > 0 ? ' · bought ' + kd0(a.kd) + ' in the two months before' : '')])); });
    const lp = W.lastPlan;
    if(lp){ lp.plans.forEach(e => rows12.push([e.rep, dmy(e.date), 'This week\'s plan', cut(e.clinic, 40) + (e.done ? ' · done' : ' · not visited')]));
      lp.followUpList.forEach(e => rows12.push([e.rep, dmy(e.due), 'Follow-up due this week', cut(e.clinic, 40) + (e.done ? ' · done' : ' · not yet')])); }
    table('A12', 'Next week in full, and this week\'s plan against what was done', ['Person', 'Day', 'What', 'Clinic'], rows12, [1.6, 1.4, 2.6, 6.53], 'Nothing saved for next week yet.', 14,
      lp ? 'This week: ' + lp.plannedDone + ' of ' + lp.planned + ' planned visits done; ' + lp.followUpsDone + ' of ' + lp.followUps + ' follow-ups done.' : ''); }

  // A13 · how these figures are built, and the picture credits
  { const s = page('Appendix', 'A13', 'How these figures are built'); INDEX.push(['A13', 'How these figures are built', pres.slides.length]);
    const L = [
      ['Sources', 'ERP sales files to ' + dmy(W.salesTo || W.to) + ' (history from ' + dmy(W.historyFrom) + '); DSR targets (targets only — achieved is always the ERP); visits, plans and follow-ups as logged in the app.'],
      ['The money page', 'The same four figures every week whatever the direction: the week invoiced, the month against target, new business and the price kept. Its parts add up to the week (A8 ties it out).'],
      ['New and first-time', 'New account = first invoice in our files; first-time product = first invoice of a product to a clinic that bought before; claimed only for a person whose files cover the 4 weeks before.'],
      ['Seeds and discount', 'A sample is a document with free goods only (list value). A free line on a paid invoice is part of that deal and counts in its discount. Discount = (list − paid) ÷ list, weighted by value.'],
      ['Visits', 'A visit = one clinic on one day, however many of us logged it; each person met counted once; "doctors and staff" until the visit form records each contact\'s role.'],
      ['Comparisons', 'Weeks run Sunday–Saturday; a person\'s week counts only when their files cover every day of it. A rise needs +10% and at least 1.1 × the earlier weeks\' average; a streak needs 90 days of files before it.'],
      ['The month', 'Shown every week against the DSR target in KD with the working days left; the straight-line pace is kept in A3 only; "on pace" is never a headline before 6 working days.'],
      ['Pictures', 'Product photos: the manufacturers (intensiv.ch, scheu-dental.com, bnlbio.com, univetloupes.com) and the official Ultramed store; a family photo stands for every size or variant (e.g. a 0.75 mm box for a 1.0 mm foil). Clinic scenes: Unsplash / Pexels licences, illustrative only.']];
    L.forEach((l, i) => { const y = 1.6 + i * 0.63; txt(s, [{ text: l[0] + '  ', options: { bold: true, color: WD.green } }, { text: l[1], options: { color: WD.dk } }], { x: 0.6, y, w: 12.13, h: 0.6, fontSize: 11.5 }); }); }

  // A0 · the contents, each line a link to its page
  const cols = [INDEX.slice(0, Math.ceil(INDEX.length / 2)), INDEX.slice(Math.ceil(INDEX.length / 2))];
  cols.forEach((list, ci) => txt(a0, list.map(([code, title, n], k) => ({ text: code + ' · ' + title + '  (p. ' + n + ')', options: { hyperlink: { slide: n, tooltip: title }, color: WD.dk, breakLine: k < list.length - 1 } })),
    { x: 0.6 + ci * 6.2, y: 1.7, w: 5.9, h: 4.3, fontSize: 15, paraSpaceAfter: 8 }));
  const mainLinks = [['The week on one page', MAIN.money], ['The month and the plan', MAIN.plan], ['New business', MAIN.newBiz], ['Price discipline', MAIN.price], ['The people', MAIN.people], ['Next week', MAIN.next]].filter(x => x[1]);
  txt(a0, [{ text: 'Main pages: ', options: { bold: true, color: WD.green } }].concat(mainLinks.map(([t, n], k) => ({ text: t + (k < mainLinks.length - 1 ? ' · ' : ''), options: { hyperlink: { slide: n, tooltip: t }, color: WD.dk } }))), { x: 0.6, y: 6.05, w: 12.13, h: 0.32, fontSize: 12 });
  txt(a0, 'The main pages tell the story of the week; every measure — including the ones that went down — is in these pages.', { x: 0.6, y: 6.4, w: 12.13, h: 0.3, fontSize: 12, color: WD.text2 });
}
