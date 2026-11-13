// management dashboard (supervisor): the month's invoiced sales, targets and field work on one sheet
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)

// ---- MANAGEMENT DASHBOARD (More → Tools, supervisor; v123) ----
// One read-only sheet for management. Every figure comes from
// UMCore.execDashboard (core.js): the month figure's own lines — the ERP sales
// files are the only measure of invoiced sales, the DSR gives the targets,
// visits and orders are as logged in the app and are never called sales. This
// file only lays that result out, the way "Month by month" does. It is
// computed once per (month, person, brand); a search box, a class chip, "Show
// all" and an ⓘ only redraw from that result. Nothing here writes to storage.
//
// Truth on screen: a value that is not measured shows "—" and says why; a
// table that is filtered says how many of how many and their subtotal; a total
// is printed as "adding up" only after it was added up here; "as on the Today
// screen" / "as in the Months report" is said only for a figure compared with
// that screen's own (bestMonthRevenue, teamTargetNow, erpRevenueForRange).
//
// Words: English in the code, Arabic in js/i18n.js by exact wording. Fixed
// wording goes through xdT() — one text node per phrase, so the dictionary
// finds it; names and numbers are data (dir="auto" / data-notr) and are never
// translated. tests/e2e/exec-dashboard.e2e.js reads every wording passed to
// xdT and xdW in this file and fails on one that has no Arabic.
//
// INTEGRATION(core): the fields the core is still getting (dash-spec.md, "Core
// additions") are read defensively — forecast, lastYear, daily, activity,
// customers.accounts[i].cls and UMCore.execDrill. Until they exist their tile,
// chart, chips or list is simply not drawn; nothing is made up in their place.
let _xdMonth = null, _xdRep = 'all', _xdBrand = 'all';              // the view (kept while the app is open)
let _xdD = null, _xdGen = 0, _xdBusy = false;                       // the result on screen; the run that is allowed to draw
let _xdCls = 'all', _xdQ = '', _xdAllCust = false, _xdOpenAcc = null; // customers: class chip, search, "Show all", the open row
let _xdPQ = '', _xdAllProd = false, _xdOpenProd = null;             // products: search, "Show all", the open row
let _xdAllFollow = false, _xdHow = null, _xdDaily = null;           // follow-ups "Show all"; the open ⓘ; the day chart's geometry
const XD_PAGE = 20, XD_SHORT = 10, XD_CHART_BRANDS = 8;

// ---- words, names, numbers ----
function xdT(s){ return '<span>' + s + '</span>'; }                                   // fixed wording: its own text node, found in the dictionary
function xdW(s){ return s; }                                                          // fixed wording used as an attribute, a bare label or passed on to xdT: marked so the harness finds it
function xdName(s){ return '<span dir="auto">' + esc(String(s == null ? '' : s)) + '</span>'; }   // a name is data
function xdN(s){ return '<span dir="ltr" data-notr class="xd-n">' + s + '</span>'; }  // a number reads left to right in both languages
function xdFix(n){ return (Math.round((Number(n) || 0) * 100) / 100 || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function xdInt(n){ return (Math.round(Number(n) || 0) || 0).toLocaleString('en-US'); }
function xdKd(n){ return n == null ? '—' : '<span class="xd-m">' + xdN(xdFix(n)) + '&nbsp;<span class="xd-u">KD</span></span>'; }   // the amount never leaves its currency
function xdPct(p){ return p == null ? '—' : xdN(p + '%'); }
function xdCents(n){ return Math.round((Number(n) || 0) * 100); }
function xdSep(){ return uiLang === 'ar' ? '، ' : ', '; }
function xdNames(list){ return list.map(xdName).join(xdSep()); }
function xdDate(d){
  if(!d) return '—';
  try{
    const o = String(d).slice(0, 4) === todayStr().slice(0, 4) ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' };
    return '<span class="xd-d">' + esc(new Date(d + 'T00:00:00').toLocaleDateString(uiLocale(), o)) + '</span>';
  }catch(e){ return esc(String(d)); }
}
function xdMonthName(m){ return '<span class="xd-d">' + esc(monthLabel(m)) + '</span>'; }
function xdDayNo(d){ return parseInt(String(d || '').slice(8, 10), 10) || 0; }
function xdAddMonth(m, n){ const y = +m.slice(0, 4), k = +m.slice(5, 7) - 1 + n; return String(y + Math.floor(k / 12)) + '-' + String(((k % 12) + 12) % 12 + 1).padStart(2, '0'); }
// The earliest month worth stepping back to: the first one a sales file, a saved target or a visit belongs to.
function xdFirstMonth(){
  let m = todayStr().slice(0, 7);
  const see = x => { if(typeof x === 'string' && /^\d{4}-\d{2}/.test(x) && x.slice(0, 7) < m) m = x.slice(0, 7); };
  erpPeriods().forEach(p => { if(p) see(p.from); });
  Object.keys((targets && targets._history) || {}).forEach(see);
  (visits || []).forEach(v => { if(v) see(v.date); });
  return m;
}
// A brand as the company writes it: the DSR's own spelling when a target names
// it, else the sales files' — the figures themselves are keyed by UMCore.normBrand.
function xdBrandNames(){
  const out = Object.create(null), seen = Object.create(null);
  const put = raw => { const s = String(raw == null ? '' : raw).trim(); if(!s || seen[s]) return; seen[s] = 1; const k = UMCore.normBrand(s); if(k && !out[k]) out[k] = s; };
  const fromT = t => { if(t && t.brands) Object.keys(t.brands).forEach(put); };
  Object.keys(targets || {}).forEach(r => { if(r.charAt(0) !== '_') fromT(targets[r]); });
  const hist = (targets && targets._history) || {};
  Object.keys(hist).sort().reverse().forEach(m => Object.keys(hist[m] || {}).forEach(r => fromT(hist[m][r])));
  erpPeriods().forEach(p => { if(p && Array.isArray(p.rows)) p.rows.forEach(a => { if(Array.isArray(a) && a[9] != null) put(a[9]); }); });
  return out;
}
function xdBrand(k){ const n = _xdD && _xdD._names ? _xdD._names[k] : null; return n || k; }
function xdInfoIcon(){ return '<svg class="svgi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.6v.2"/></svg>'; }

// ---- entry ----
// Supervisor only: a rep is not offered the tile, and a call does nothing.
// Returns a promise that settles once the sheet is drawn (the harness waits on it).
function openExecDashboard(){
  if(!currentUser || currentUser.role !== 'supervisor') return Promise.resolve(false);
  const cur = todayStr().slice(0, 7);
  if(!_xdMonth || !/^\d{4}-\d{2}$/.test(_xdMonth) || _xdMonth > cur) _xdMonth = cur;
  if(_xdRep !== 'all' && !REPS.includes(_xdRep)) _xdRep = 'all';
  _xdD = null; _xdHow = null; _xdOpenAcc = null; _xdOpenProd = null; _xdAllCust = false; _xdAllProd = false; _xdAllFollow = false;
  showModal(`<div id="xdRoot">
    ${xdStyle()}
    <h3 style="margin-top:0;">${I('chart')} ${xdW('Management dashboard')}</h3>
    <div class="xd-lead">${xdT('Invoiced sales come from the ERP sales files only, targets from the DSR, visits and orders from what the team logged in the app. Tap the i mark on a figure to see its source and how it is calculated.')}</div>
    <div id="xdFilters"></div>
    <div id="xdBody" aria-busy="true"><div class="card xd-wait">${xdT('Reading the sales files…')}</div></div>
    <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
      <button class="btn secondary" id="xdExportBtn" onclick="xdExport()" disabled>${I('download')} ${xdW('Export to Excel')}</button>
      <button class="btn secondary" onclick="closeModal()">${xdW('Close')}</button>
    </div>
  </div>`);
  return xdRun();
}
function xdStyle(){
  return `<style>
    #xdRoot .xd-lead{color:var(--muted); font-size:12.5px; line-height:1.5; margin:-6px 0 12px;}
    #xdRoot .xd-n{white-space:nowrap;}
    #xdRoot .xd-m{white-space:nowrap;}
    #xdRoot .xd-u{font-size:.68em; font-weight:600; color:var(--muted);}
    #xdRoot .xd-mu{color:var(--muted);}
    #xdRoot .xd-month{display:flex; align-items:center; gap:10px; margin-bottom:10px;}
    #xdRoot .xd-month .cal-nav:disabled{opacity:.3; cursor:default;}
    #xdRoot .xd-mlabel{flex:1; text-align:center; font-weight:800; font-size:17px;}
    #xdRoot .xd-mstate{font-size:11px; font-weight:700; color:var(--muted); text-align:center; margin:-6px 0 10px;}
    #xdRoot select.xd-sel{padding:10px 12px; margin-top:8px;}
    #xdRoot .xd-fresh{font-size:12.5px; margin:10px 0 4px; line-height:1.5;}
    #xdRoot .xd-note{font-size:12px; line-height:1.5; color:var(--amber-ink); background:var(--amber-dim); border-radius:10px; padding:7px 10px; margin-top:6px;}
    #xdRoot .xd-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); grid-auto-flow:row dense; gap:9px; margin:12px 0;}
    #xdRoot .xd-tile{background:var(--card); border-radius:14px; padding:11px 12px 12px; min-width:0; box-shadow:0 1px 2px rgba(0,0,0,.04);}
    #xdRoot .xd-tile.xd-hero{grid-column:1/-1; padding:14px 16px 15px;}
    #xdRoot .xd-tl{display:flex; justify-content:space-between; align-items:flex-start; gap:6px; font-size:11.5px; font-weight:700; color:var(--muted); line-height:1.35; min-height:31px;}
    #xdRoot .xd-tile.xd-hero .xd-tl{min-height:0; font-size:12.5px;}
    #xdRoot .xd-tv{font-size:19px; font-weight:700; letter-spacing:-.02em; line-height:1.2; margin-top:1px;}
    #xdRoot .xd-tile.xd-hero .xd-tv{font-size:32px; margin-top:2px;}
    #xdRoot .xd-tv .xd-sm{font-size:12px; font-weight:600; letter-spacing:0;}
    #xdRoot .xd-ts{font-size:11px; color:var(--muted); margin-top:4px; line-height:1.45;}
    #xdRoot .xd-meter{height:8px; border-radius:4px; background:var(--paper); overflow:hidden; margin-top:6px;}
    #xdRoot .xd-meter > div{height:100%; background:var(--sage-ink);}
    #xdRoot .xd-i{flex-shrink:0; position:relative; border:none; background:none; padding:0; margin:-3px -4px 0 0; width:24px; height:24px; font-size:17px; color:var(--green-dark); cursor:pointer; opacity:.75;}
    #xdRoot .xd-i::after{content:''; position:absolute; inset:-10px;}
    #xdRoot .xd-i[aria-expanded="true"]{opacity:1; color:var(--gold-ink);}
    #xdRoot .xd-how{grid-column:1/-1; background:var(--card); border-inline-start:4px solid var(--gold); border-radius:0 14px 14px 0; padding:11px 13px; font-size:12px; line-height:1.55;}
    #xdRoot .xd-how[hidden]{display:none;}
    #xdRoot .xd-hh{font-weight:800; font-size:12.5px; margin-bottom:4px;}
    #xdRoot .xd-hr{margin-top:6px;}
    #xdRoot .xd-hr > b{display:block; font-size:10.5px; color:var(--muted); font-weight:700;}
    #xdRoot .xd-kv{display:flex; justify-content:space-between; gap:10px; padding:2px 0; border-bottom:1px dashed var(--line);}
    #xdRoot .xd-kv:last-child{border-bottom:none;}
    #xdRoot .xd-kv > span:last-child{text-align:end;}
    #xdRoot .xd-tot{font-weight:800; border-top:1px solid var(--line);}
    #xdRoot .xd-ok{color:var(--sage-ink); font-weight:700;}
    #xdRoot .xd-sec{font-size:12px; font-weight:800; color:var(--ink-2); margin:14px 2px -4px;}
    #xdRoot .xd-card{background:var(--card); border-radius:var(--radius); padding:14px 15px; margin-bottom:10px; box-shadow:0 1px 2px rgba(0,0,0,.04);}
    #xdRoot .xd-ct{font-weight:800; font-size:14px;}
    #xdRoot .xd-cs{font-size:11.5px; color:var(--muted); line-height:1.5; margin-top:2px;}
    #xdRoot svg.xd-chart{display:block; width:100%; max-width:460px; height:auto; margin:8px 0 2px; touch-action:pan-y;}
    #xdRoot .xd-leg{display:flex; flex-wrap:wrap; gap:4px 14px; font-size:11px; color:var(--muted); margin-top:6px;}
    #xdRoot .xd-leg > span{display:inline-flex; align-items:center; gap:6px;}
    #xdRoot .xd-sw{display:inline-block; width:12px; height:8px; border-radius:2px; background:var(--sage-ink);}
    #xdRoot .xd-sw.tick{width:3px; height:13px; border-radius:1px; background:var(--ink-2);}
    #xdRoot .xd-sw.dash{width:16px; height:0; border-radius:0; background:none; border-top:2px dashed var(--ink-2);}
    #xdRoot .xd-sw.soft{opacity:.45;}
    #xdRoot .xd-read{font-size:11.5px; min-height:18px; margin-top:6px; line-height:1.5;}
    #xdRoot details.xd-nums{margin-top:8px; font-size:11.5px;}
    #xdRoot details.xd-nums > summary{cursor:pointer; color:var(--green-dark); font-weight:700;}
    #xdRoot .xd-scroll{overflow-x:auto; -webkit-overflow-scrolling:touch;}
    #xdRoot table.xd-tbl{width:100%; border-collapse:collapse; font-size:11.5px; margin-top:8px;}
    #xdRoot table.xd-tbl th{font-size:10.5px; color:var(--muted); font-weight:700; padding:4px 5px; text-align:end; white-space:nowrap;}
    #xdRoot table.xd-tbl td{padding:5px; text-align:end; border-top:1px solid var(--line); white-space:nowrap;}
    #xdRoot table.xd-tbl th:first-child, #xdRoot table.xd-tbl td:first-child{text-align:start; white-space:normal;}
    #xdRoot table.xd-tbl tr.tot td{font-weight:800; border-top:2px solid var(--green-dark);}
    #xdRoot table.xd-tbl tr.pick{cursor:pointer;}
    #xdRoot table.xd-tbl tr.on td{background:var(--green-dim);}
    #xdRoot table.xd-cmp td:first-child, #xdRoot table.xd-cmp th:first-child{position:sticky; inset-inline-start:0; background:var(--card); min-width:112px;}
    #xdRoot .xd-row{padding:9px 0; border-top:1px solid var(--line);}
    #xdRoot .xd-row.tap{cursor:pointer;}
    #xdRoot .xd-rn{font-weight:700; font-size:13px; line-height:1.35; overflow-wrap:anywhere;}
    #xdRoot .xd-rs{font-size:11.5px; color:var(--muted); margin-top:2px; line-height:1.5;}
    #xdRoot .xd-rv{font-weight:800; font-size:13px; flex-shrink:0; text-align:end;}
    #xdRoot .xd-tag{display:inline-block; font-size:10.5px; font-weight:700; padding:1px 7px; border-radius:8px; background:var(--paper); color:var(--muted);}
    #xdRoot .xd-drill{margin-top:8px; padding:9px 11px; border-radius:10px; background:var(--paper); font-size:12px; line-height:1.5; cursor:default;}
    #xdRoot .xd-drill h5{margin:8px 0 2px; font-size:11px; color:var(--muted);}
    #xdRoot .xd-drill h5:first-child{margin-top:0;}
    #xdRoot .xd-sum{font-size:12px; line-height:1.5; margin-top:8px;}
    #xdRoot .xd-foot{font-size:11.5px; color:var(--muted); line-height:1.5; margin-top:8px; padding-top:8px; border-top:1px dashed var(--line);}
    #xdRoot .xd-more{display:block; width:100%; margin-top:8px; padding:9px; border:none; border-radius:10px; background:var(--green-dim); color:var(--green-dark); font-weight:700; font-size:12.5px; font-family:inherit; cursor:pointer;}
    #xdRoot .xd-search{padding:10px 12px; margin-top:8px;}
    #xdRoot .xd-rule{font-size:11.5px; color:var(--muted); line-height:1.5; margin-top:2px;}
    #xdRoot .xd-sub{font-weight:800; font-size:12.5px; margin-top:12px;}
    #xdRoot .xd-wait{color:var(--muted); font-size:13px;}
    #xdRoot .xd-none{color:var(--muted);}
  </style>`;
}
// One run: the filter row follows the tap at once, the figures a moment later
// (the sheet stays on screen, dimmed, while the month is read). A later tap
// takes over — an earlier run never draws over it.
function xdRun(){
  const gen = ++_xdGen;
  _xdBusy = true;
  const body = document.getElementById('xdBody');
  if(body){ body.style.opacity = '.45'; body.setAttribute('aria-busy', 'true'); }
  const btn = document.getElementById('xdExportBtn'); if(btn) btn.disabled = true;
  xdDrawFilters();
  return new Promise(resolve => setTimeout(() => {
    if(gen !== _xdGen){ resolve(false); return; }
    if(!document.getElementById('xdRoot')){ _xdBusy = false; resolve(false); return; }   // the sheet was closed, or another one took its place
    let D = null;
    try{ D = xdCompute(); }catch(e){ console.error('management dashboard', e); }
    _xdD = D; _xdBusy = false; _xdHow = null; _xdOpenAcc = null; _xdOpenProd = null; _xdAllCust = false; _xdAllProd = false; _xdAllFollow = false;
    xdDraw();
    resolve(!!D);
  }, 30));
}
function xdCompute(){
  const data = Object.assign(digestData(), { today: todayStr() });
  const D = UMCore.execDashboard(data, { month: _xdMonth, rep: _xdRep, reps: REPS.slice(), brand: _xdBrand });
  D._names = xdBrandNames();
  return D;
}
function xdDraw(){
  if(!document.getElementById('xdRoot')) return;
  xdDrawFilters();
  const body = document.getElementById('xdBody'); if(!body) return;
  body.style.opacity = ''; body.setAttribute('aria-busy', 'false');
  const btn = document.getElementById('xdExportBtn'); if(btn) btn.disabled = !_xdD;
  const D = _xdD;
  if(!D){ body.innerHTML = `<div class="card xd-wait" data-note="failed">${xdT('The dashboard could not be calculated on this device. Nothing is shown rather than a figure that might be wrong.')}</div>`; return; }
  if(_xdCls !== 'all' && !xdClsKeys(D).includes(_xdCls)) _xdCls = 'all';
  body.innerHTML = xdNotes(D) + xdTiles(D) + xdCharts(D) + xdPeople(D) + xdCustomers(D) + xdBrands(D) + xdProducts(D) + xdAct(D) + xdActivity(D) + xdNewCustomers(D) + xdFollowUps(D)
    + `<div class="xd-card" data-card="doctor"><div class="xd-ct">${xdT('Sales by doctor')}</div><div class="xd-cs">${xdT('The ERP invoices name the account, not the doctor, so there is no such figure. Doctors are followed in the Doctors database: visits, prescriptions and follow-ups.')}</div></div>`;
}

// ---- A. filters and freshness ----
function xdDrawFilters(){
  const el = document.getElementById('xdFilters'); if(!el) return;
  const cur = todayStr().slice(0, 7), first = xdFirstMonth(), ar = uiLang === 'ar', D = _xdD;
  const who = ['all', ...REPS];
  const brands = D && D.byBrand ? D.byBrand.rows.map(b => b.brand) : [];
  if(_xdBrand !== 'all' && !brands.includes(UMCore.normBrand(_xdBrand))) brands.unshift(UMCore.normBrand(_xdBrand));
  el.innerHTML = `
    <div class="xd-month">
      <button class="cal-nav" onclick="xdStepMonth(-1)" aria-label="${xdW('Previous month')}" ${_xdMonth <= first ? 'disabled' : ''}>${ar ? '›' : '‹'}</button>
      <div class="xd-mlabel" id="xdMonthLabel" data-month="${_xdMonth}">${esc(monthLabel(_xdMonth))}</div>
      <button class="cal-nav" onclick="xdStepMonth(1)" aria-label="${xdW('Next month')}" ${_xdMonth >= cur ? 'disabled' : ''}>${ar ? '‹' : '›'}</button>
    </div>
    <div class="xd-mstate">${xdT(_xdMonth === cur ? 'The running month, to today' : 'A closed month, all of it')}</div>
    <div class="chip-row" id="xdPeople">${who.map((x, i) => `<div class="chip small ${_xdRep === x ? 'on' : ''}" data-rep="${esc(x)}" onclick="xdSetRep(${i})">${x === 'all' ? xdW('Team') : xdName(x)}</div>`).join('')}</div>
    <select class="xd-sel" id="xdBrandSel" aria-label="${xdW('Brand')}" onchange="xdSetBrand(this.value)">
      <option value="all" ${_xdBrand === 'all' ? 'selected' : ''}>${xdW('All brands')}</option>
      ${brands.map(b => `<option value="${esc(b)}" data-notr ${UMCore.normBrand(_xdBrand) === b && _xdBrand !== 'all' ? 'selected' : ''}>${esc(xdBrand(b))}</option>`).join('')}
    </select>`;
}
function xdStepMonth(n){
  const cur = todayStr().slice(0, 7), m = xdAddMonth(_xdMonth, n);
  if(m > cur || m < xdFirstMonth()) return Promise.resolve(false);   // never past the running month
  _xdMonth = m;
  return xdRun();
}
function xdSetRep(i){ const who = ['all', ...REPS][i]; if(who == null) return Promise.resolve(false); _xdRep = who; return xdRun(); }
function xdSetBrand(v){ _xdBrand = v && v !== 'all' ? String(v) : 'all'; return xdRun(); }
function xdPickBrand(i){ const b = _xdD && _xdD.byBrand.rows[i]; if(!b) return Promise.resolve(false); return xdSetBrand(_xdD.brand === b.brand ? 'all' : b.brand); }
// How far the sales files reach, and a line for each thing this view cannot measure.
function xdNotes(D){
  const S = D.sales, notes = [], who = D.byPerson.filter(p => p.measured);
  let fresh = '';
  if(S.measured){
    const split = who.length > 1 && who.some(p => p.asOf !== who[0].asOf);
    fresh = `<div class="xd-fresh" data-note="fresh" data-asof="${esc(S.asOf || '')}">${I('database')} ${xdT(D.current ? 'The sales files reach' : 'Closed month. The sales files reach')} <b>${xdDate(S.asOf)}</b>${D.current && S.asOf < D.today ? ` <span class="xd-mu">· ${xdT('today is')} ${xdDate(D.today)}</span>` : ''}
      ${split ? `<div class="xd-mu">${who.map(p => xdName(p.rep) + ' ' + xdDate(p.asOf)).join(' · ')}</div>` : ''}</div>`;
  }
  const note = (kind, html) => notes.push(`<div class="xd-note" data-note="${kind}">⚠️ ${html}</div>`);
  if(!S.measured && S.missing.every(x => x.why === 'nofile')) note('nofile', xdT('No sales file covers this month: every sales figure shows a dash, never a 0.'));
  S.missing.filter(x => x.why !== 'nofile' || S.measured).forEach(x => note('notinfiles', `${xdName(x.rep)}: ${xdT('the sales files of this month hold no line of this person, so there is no sales figure.')}`));
  const part = who.filter(p => !p.complete);
  if(part.length) note('partial', `${xdNames(part.map(p => p.rep))}: ${xdT('the sales files do not cover every day of the month so far, so the figure is partial.')}`);
  D.target.stale.forEach(x => note('stale', `${xdName(x.rep)}: ${xdT('the target shown belongs to')} ${xdMonthName(x.month)} ${xdT('because the DSR of this month is not uploaded yet.')}`));
  if(D.target.none.length) note('notarget', `${xdNames(D.target.none)}: ${xdT(D.brand ? 'no DSR target for this brand, so not in the achievement percentage.' : 'no sales target on file, so not in the achievement percentage.')}`);
  if(D.customers.missing > 0) note('missingfiles', `${xdN(String(D.customers.missing))} ${xdT('sales files did not load on this device — their invoices are not counted here.')}`);
  return fresh + notes.join('');
}

// ---- B. the KPI tiles ----
// o = { label, raw (the number, null = not measured), value (html), why (html, said under the dash), sub (html), meter (0–1), hero, attrs, src, formula, view }
function xdTile(id, o){
  const has = o.raw != null && isFinite(o.raw);
  return `<div class="xd-tile${o.hero ? ' xd-hero' : ''}" data-kpi="${id}" data-value="${has ? o.raw : ''}"${o.attrs || ''}>
      <div class="xd-tl"><span>${o.label}</span><button class="xd-i" data-how="${id}" aria-label="${xdW('How it is calculated')}" aria-expanded="${_xdHow === id ? 'true' : 'false'}" onclick="xdHowToggle('${id}')">${xdInfoIcon()}</button></div>
      <div class="xd-tv">${o.value != null ? o.value : '<span class="xd-none">—</span>'}</div>
      ${o.meter != null ? `<div class="xd-meter"><div style="width:${Math.round(Math.max(0, Math.min(1, o.meter)) * 100)}%;"></div></div>` : ''}
      <div class="xd-ts">${o.value != null ? (o.sub || '') : (o.why || '')}</div>
    </div>
    <div class="xd-how" data-how="${id}" ${_xdHow === id ? '' : 'hidden'}>
      <div class="xd-hh">${xdT('How it is calculated')}</div>
      <div class="xd-hr"><b>${xdT('Source')}</b>${o.src}</div>
      <div class="xd-hr"><b>${xdT('Formula')}</b>${o.formula}</div>
      <div class="xd-hr" data-how-view><b>${xdT('In this view')}</b>${o.view}</div>
    </div>`;
}
function xdHowToggle(id){
  _xdHow = _xdHow === id ? null : id;
  document.querySelectorAll('#xdRoot .xd-how').forEach(el => { el.hidden = el.dataset.how !== _xdHow; });
  document.querySelectorAll('#xdRoot .xd-i').forEach(b => b.setAttribute('aria-expanded', b.dataset.how === _xdHow ? 'true' : 'false'));
}
function xdKv(a, b, cls){ return `<div class="xd-kv${cls ? ' ' + cls : ''}"><span>${a}</span><span>${b}</span></div>`; }
function xdWhy(why){ return xdT(why === 'nofile' ? 'no sales file for this month' : 'not in the sales files of this month'); }
// A person's figure here against the screen that already shows it — said only when the two were compared and are the same.
function xdAsElsewhere(D, p){
  if(D.brand || !p.measured || !REPS.includes(p.rep)) return '';
  if(D.current){
    if(!((targets[p.rep] || {}).revenue > 0)) return '';                       // the Today card shows no sales figure without a sales target
    return xdCents(bestMonthRevenue(p.rep).amount) === xdCents(p.amount) ? 'today' : '';
  }
  const m = erpRevenueForRange(D.from, D.to, p.rep);                           // the Months report's achieved
  return m != null && xdCents(m) === xdCents(p.amount) ? 'months' : '';
}
function xdGrowth(g){
  if(g.fromZero) return xdT('from zero');
  if(g.growth == null) return null;
  const p = Math.round(g.growth * 100);
  return p === 0 ? xdN('0%') : `<span style="color:var(${p > 0 ? '--sage-ink' : '--coral-ink'});">${xdN((p > 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%')}</span>`;
}
// The comparison tiles (the month before; the same month a year before) share one shape.
function xdCompareTile(id, D, g, label, noPrev){
  const S = D.sales, val = g.measured ? xdGrowth(g) : null;
  const span = xdT('days 1 to') + ' ' + xdN(String(xdDayNo(g.to))) + ' ' + xdT('of') + ' ' + xdMonthName(g.month);
  return xdTile(id, {
    label: xdT(label), raw: g.measured && g.growth != null ? Math.round(g.growth * 100) : null, value: val,
    attrs: ` data-current="${g.current == null ? '' : g.current}" data-previous="${g.previous == null ? '' : g.previous}" data-fromzero="${g.fromZero ? 1 : 0}" data-prev-month="${esc(g.month || '')}"`,
    sub: g.measured ? `${xdKd(g.current)} ${xdT('against')} ${xdKd(g.previous)} · ${span}${g.mixed ? ' · ' + xdT('each person to the day the files reach') : ''}` : '',
    why: !S.measured ? xdT('No sales figure for this month') : !g.measured ? xdT(noPrev) : xdT('Nothing invoiced on these days in either month'),
    src: xdT('The ERP sales files of both months, for the people measured in both.'),
    formula: xdT('Growth % = (this month − the earlier month on the same days) ÷ the earlier month × 100. From nothing to something is said as "from zero", never as a percentage.'),
    view: g.measured
      ? xdKv(xdT('This month'), xdKd(g.current)) + xdKv(span, xdKd(g.previous))
        + (g.growth != null ? xdKv(xdT('Growth'), `( ${xdN(xdFix(g.current))} − ${xdN(xdFix(g.previous))} ) ÷ ${xdN(xdFix(g.previous))} × ${xdN('100')} = ${xdN(Math.round(g.growth * 100) + '%')}`) : '')
        + (g.people || []).filter(r => g.byRep && g.byRep[r]).map(r => xdKv(xdName(r), `${xdKd(g.byRep[r].current)} ${xdT('against')} ${xdKd(g.byRep[r].previous)}`)).join('')
        + ((g.left || []).length ? `<div class="xd-mu">${xdNames(g.left)}: ${xdT('not measured in the earlier month, so left out of both sides.')}</div>` : '')
      : `<div>${!S.measured ? xdT('No sales figure for this month') : xdT(noPrev)}</div>`
  });
}
function xdTiles(D){
  const S = D.sales, Tg = D.target, A = D.achievement, P = D.perDay, wd = P.workdays, by = D.byPerson, out = [];
  const needBoth = xdT('Needs a sales target and a sales figure for the same person');
  const noFigure = !S.measured && S.missing.every(x => x.why === 'nofile')
    ? xdT('No sales file covers this month — no figure, never a 0') : xdT('The sales files of this month hold no line of these people');
  // invoiced sales
  const tags = by.map(p => xdAsElsewhere(D, p));
  out.push(xdTile('sales', {
    hero: true, label: xdT('Invoiced sales'), raw: S.amount, value: S.measured ? xdKd(S.amount) : null, why: noFigure,
    sub: `${xdT('ERP sales files to')} ${xdDate(S.asOf)}${S.missing.length ? ' · ' + xdT('people with a figure:') + ' ' + xdN(String(by.length - S.missing.length)) + ' ' + xdT('of') + ' ' + xdN(String(by.length)) : ''}${D.brand ? ' · ' + xdName(xdBrand(D.brand)) : ''}`,
    src: xdT('The ERP sales files only: every invoice line, returns deducted. A line counts for the owner of the clinic; on a shared account, for the salesman who issued it.'),
    formula: xdT('The sum of the net invoiced value from day 1 of the month to the last day the sales files cover.'),
    view: by.map((p, i) => xdKv(xdName(p.rep), p.measured
        ? `${xdKd(p.amount)} <span class="xd-mu">· ${xdT('files to')} ${xdDate(p.asOf)}</span>${tags[i] ? ` <span class="xd-ok" data-same="${tags[i]}">✓ ${xdT(tags[i] === 'today' ? 'as on the Today screen' : 'as in the Months report')}</span>` : ''}`
        : `— <span class="xd-mu">${xdWhy(p.why)}</span>`)).join('')
      + (by.length > 1 ? xdKv(xdT('Total'), S.measured ? xdKd(S.amount) : '—', 'xd-tot') : '')
  }));
  // the target
  const tWhy = xdT(D.brand ? 'The DSR has no target for this brand' : 'No sales target on file for this month');
  out.push(xdTile('target', {
    label: xdT('Sales target'), raw: Tg.amount, value: Tg.amount != null ? xdKd(Tg.amount) : null, why: tWhy,
    sub: `${xdT('From the DSR targets file')}${Tg.none.length && Tg.people.length ? ' · ' + xdT('people with a target:') + ' ' + xdN(String(Tg.people.length)) + ' ' + xdT('of') + ' ' + xdN(String(by.length)) : ''}${Tg.stale.length ? ' · ' + xdT('the target of an earlier month') : ''}`,
    src: xdT('The DSR targets file. It gives the targets only: its achieved column is never used.'),
    formula: xdT(D.brand ? 'The sum of the DSR targets of this brand for the people of the view.' : 'The sum of the monthly sales targets of the people of the view.'),
    view: by.map(p => xdKv(xdName(p.rep), p.target != null ? xdKd(p.target) + (p.stale ? ` <span class="xd-mu">· ${xdT('target of')} ${xdMonthName(p.stale)}</span>` : '') : `— <span class="xd-mu">${xdT('no target on file')}</span>`)).join('')
      + (by.length > 1 ? xdKv(xdT('Total'), Tg.amount != null ? xdKd(Tg.amount) : '—', 'xd-tot') : '')
  }));
  // achievement: the people who have both a target and a figure (the Today card's Team line)
  let same = '';
  if(D.current && !D.brand && A.pct != null){
    if(!D.rep){ const tt = teamTargetNow(); if(D.people.length === REPS.length && tt.n >= 1 && tt.pct === A.pct && xdCents(tt.ach) === xdCents(A.achieved) && xdCents(tt.goal) === xdCents(A.target)) same = 'team'; }
    else { const t = targets[D.rep] || {}; if(REPS.includes(D.rep) && t.revenue > 0 && Math.round(bestMonthRevenue(D.rep).amount / t.revenue * 100) === A.pct) same = 'person'; }
  }
  out.push(xdTile('achievement', {
    label: xdT('Achievement'), raw: A.pct, value: A.pct != null ? xdPct(A.pct) : null, meter: A.pct != null ? A.pct / 100 : null, why: needBoth,
    attrs: ` data-achieved="${A.pct != null ? A.achieved : ''}" data-target="${A.pct != null ? A.target : ''}"`,
    sub: `${xdKd(A.achieved)} ${xdT('of')} ${xdKd(A.target)}`,
    src: xdT('Invoiced sales from the ERP files and the target from the DSR, counting only the people who have both.'),
    formula: xdT('Achievement % = invoiced sales ÷ target × 100'),
    view: (A.pct != null ? `<div>${xdN(xdFix(A.achieved))} ÷ ${xdN(xdFix(A.target))} × ${xdN('100')} = ${xdN(A.pct + '%')}</div>` : `<div>${needBoth}</div>`)
      + (A.people.length && A.people.length < by.length ? `<div class="xd-mu">${xdT('Counted:')} ${xdNames(A.people)}</div>` : '')
      + (A.notMeasured.length ? `<div class="xd-mu">${xdNames(A.notMeasured)}: ${xdT('a target but no sales figure in the files, so not in the percentage.')}</div>` : '')
      + (A.noTarget.length ? `<div class="xd-mu">${xdNames(A.noTarget)}: ${xdT('invoiced sales but no target, so not in the percentage.')}</div>` : '')
      + (same ? `<div class="xd-ok" data-same="${same}">✓ ${xdT(same === 'team' ? 'The same as the Team line on the Today screen.' : 'The same percentage as on the Today screen.')}</div>` : '')
  }));
  // what is left, and what it needs a working day
  const over = A.pct != null && D.remaining === 0;
  out.push(xdTile('remaining', {
    label: xdT('Remaining to target'), raw: D.remaining, value: D.remaining != null ? xdKd(D.remaining) : null, why: needBoth,
    sub: over ? xdT('Target reached') : xdT('Target minus invoiced sales, never below zero'),
    src: xdT('The same target and invoiced sales as the achievement percentage.'),
    formula: xdT('Remaining = max(target − invoiced sales, 0)'),
    view: D.remaining != null ? `<div>${xdN(xdFix(A.target))} − ${xdN(xdFix(A.achieved))} = ${xdKd(xdCents(A.target - A.achieved) / 100)}${over && A.achieved > A.target ? ' → ' + xdKd(0) : ''}</div>` : `<div>${needBoth}</div>`
  }));
  const pdWhy = P.closed ? xdT('The month is closed') : D.remaining == null ? needBoth : over ? xdT('Target reached') : xdT('No working day is left after the last day the sales files cover');
  out.push(xdTile('perday', {
    label: xdT('Needed per working day'), raw: P.amount, value: P.amount != null ? xdKd(P.amount) : null, why: pdWhy,
    sub: P.closed ? '' : `${xdT('Working days left:')} ${xdN(String(wd.left))}${P.soFar != null ? ' · ' + xdT('average so far:') + ' ' + xdKd(P.soFar) : ''}`,
    src: xdT('The remaining target, and the working days (Sunday to Thursday) after the last day the sales files cover.'),
    formula: xdT('Needed per working day = remaining ÷ working days left'),
    view: (P.amount != null ? `<div>${xdN(xdFix(D.remaining))} ÷ ${xdN(String(wd.left))} = ${xdKd(P.amount)}</div>` : `<div>${pdWhy}</div>`)
      + `<div class="xd-mu">${xdT('Working days of the month:')} ${xdN(String(wd.total))} · ${xdT('done:')} ${xdN(String(wd.done))} · ${xdT('left:')} ${xdN(String(wd.left))}${wd.asOf ? ' · ' + xdT('counted to') + ' ' + xdDate(wd.asOf) : ''}</div>`
      + (P.soFar != null ? `<div class="xd-mu">${xdT('Average so far:')} ${xdN(xdFix(A.achieved))} ÷ ${xdN(String(wd.done))} = ${xdKd(P.soFar)}</div>` : '')
  }));
  // INTEGRATION(core): D.forecast = { amount, closed, people, byRep: { name: { amount, asOf, done, total } }, target, pct } — the management report's formula
  const F = D.forecast;
  if(F && typeof F === 'object'){
    const fWhy = F.closed ? xdT('The month is closed') : xdT('Needs a sales figure for the running month');
    out.push(xdTile('forecast', {
      label: xdT('Month-end forecast'), raw: F.amount, value: F.amount != null ? xdKd(F.amount) : null, why: fWhy,
      attrs: ` data-pct="${F.pct == null ? '' : F.pct}"`,
      sub: F.pct != null ? `${xdPct(F.pct)} ${xdT('of the target, at the pace so far')}` : xdT('At the pace so far'),
      src: xdT('The pace of invoiced sales so far in the ERP files, person by person — the formula of the management report.'),
      formula: xdT('Forecast = invoiced so far ÷ working days done × working days of the month, for each person, then added up. A projection, not a sale.'),
      view: F.amount != null
        ? Object.keys(F.byRep || {}).map(r => { const x = F.byRep[r], p = by.find(q => q.rep === r);
            return xdKv(xdName(r), `${p && p.amount != null ? xdN(xdFix(p.amount)) + ' ÷ ' + xdN(String(Math.max(1, x.done))) + ' × ' + xdN(String(x.total)) + ' = ' : ''}${xdKd(x.amount)}`); }).join('')
          + xdKv(xdT('Total'), xdKd(F.amount), 'xd-tot')
          + (F.pct != null && F.target != null ? `<div class="xd-mu">${xdT('Against the target of the people who have one:')} ${xdKd(F.target)} → ${xdPct(F.pct)}</div>` : '')
        : `<div>${fWhy}</div>`
    }));
  }
  out.push(xdCompareTile('samedays', D, D.sameDays, xdW('Against the same days of the month before'), xdW('No sales file for the month before, so nothing to compare with')));
  // INTEGRATION(core): D.lastYear — the same shape as D.sameDays, for the same month one year before
  if(D.lastYear && typeof D.lastYear === 'object') out.push(xdCompareTile('lastyear', D, D.lastYear, xdW('Against the same month a year before'), xdW('No sales file for that month a year before, so nothing to compare with')));
  // the year so far
  const Y = D.ytd, withFile = Y.months.filter(m => m.sales != null).length;
  out.push(xdTile('ytd', {
    label: `${xdT('Year to date')} ${xdN(esc(String(Y.year)))}`, raw: Y.sales, value: Y.sales != null ? xdKd(Y.sales) : null, why: xdT('No sales file covers any month of this year'),
    attrs: ` data-target="${Y.target == null ? '' : Y.target}" data-pct="${Y.like.pct == null ? '' : Y.like.pct}"`,
    sub: (Y.target != null ? `${xdT('Targets of the months that have one:')} ${xdKd(Y.target)}${Y.like.pct != null ? ' · ' + xdPct(Y.like.pct) + ' ' + xdT('where a month has both') : ''}` : xdT('No target saved for these months'))
      + (Y.noFile.length ? ' · ' + xdT('months with no sales file:') + ' ' + xdN(String(Y.noFile.length)) : ''),
    src: xdT('The ERP sales files of each month and that month\'s own DSR target, from January to this month.'),
    formula: xdT('Year to date = the sum of the months\' invoiced sales. The percentage counts only the months and people that have both a sales figure and a target.'),
    view: xdKv(xdT('Invoiced sales'), `${Y.sales != null ? xdKd(Y.sales) : '—'} <span class="xd-mu">· ${xdT('months with a sales file:')} ${xdN(String(withFile))} ${xdT('of')} ${xdN(String(Y.months.length))}</span>`)
      + xdKv(xdT('Sales target'), Y.target != null ? xdKd(Y.target) : '—')
      + (Y.like.pct != null ? xdKv(xdT('Where a month has both'), `${xdN(xdFix(Y.like.sales))} ÷ ${xdN(xdFix(Y.like.target))} × ${xdN('100')} = ${xdN(Y.like.pct + '%')}`) : '')
      + (Y.noFile.length ? `<div class="xd-mu">${xdT('No sales file:')} ${Y.noFile.map(xdMonthName).join(xdSep())}</div>` : '')
  }));
  // new customers
  const NC = D.newCustomers;
  const ncWhy = !NC.covered ? xdT('No sales file covers this month') : xdT('Needs sales files that start at least a month earlier, or every account would look new');
  out.push(xdTile('newcustomers', {
    label: xdT('New customers'), raw: NC.count, value: NC.measurable ? xdN(String(NC.count)) : null, why: ncWhy,
    sub: xdT('First invoice ever in the saved sales files'),
    src: xdT('The ERP sales files: an account whose first invoice in all the saved files falls in this month. Online and channel accounts are not counted.'),
    formula: xdT('The number of those accounts for the people of the view.'),
    view: (NC.measurable ? `<div>${xdT('New accounts:')} ${xdN(String(NC.count))}</div>` : `<div>${ncWhy}</div>`) + (NC.since ? `<div class="xd-mu">${xdT('The saved sales files start on')} ${xdDate(NC.since)}</div>` : '')
  }));
  // INTEGRATION(core): D.activity = { measurable, openClinics, invoiced, visited, both, visitedNoInvoice: [...], invoicedNoVisit: [...] }
  const AC = D.activity;
  if(AC && typeof AC === 'object'){
    const acWhy = xdT('No sales figure for this month, so the invoiced clinics cannot be counted');
    out.push(xdTile('activity', {
      label: xdT('Customer activity'), raw: AC.measurable ? AC.invoiced : null, attrs: ` data-open="${AC.openClinics}" data-visited="${AC.visited}" data-both="${AC.both == null ? '' : AC.both}"`,
      value: AC.measurable ? `${xdN(String(AC.invoiced))} <span class="xd-sm">${xdT('of')} ${xdN(String(AC.openClinics))}</span>` : null,
      why: `${acWhy} · ${xdT('visited:')} ${xdN(String(AC.visited))} ${xdT('of')} ${xdN(String(AC.openClinics))}`,
      sub: `${xdT('open clinics invoiced in the month')} · ${xdT('visited:')} ${xdN(String(AC.visited))} · ${xdT('both:')} ${xdN(String(AC.both))}`,
      src: xdT('The open clinics of the people of the view: invoices from the ERP files (the branches of one clinic count together), field visits as logged in the app.'),
      formula: xdT('Invoiced = the clinic has an invoice in the month. Visited = a field visit in the month by one of these people.'),
      view: `<div>${xdT('Open clinics:')} ${xdN(String(AC.openClinics))} · ${xdT('visited:')} ${xdN(String(AC.visited))}${AC.measurable ? ' · ' + xdT('invoiced:') + ' ' + xdN(String(AC.invoiced)) + ' · ' + xdT('both:') + ' ' + xdN(String(AC.both)) : ''}</div>`
        + (AC.measurable ? `<div class="xd-mu">${xdT('Visited with no invoice:')} ${xdN(String((AC.visitedNoInvoice || []).length))} · ${xdT('invoiced with no visit:')} ${xdN(String((AC.invoicedNoVisit || []).length))}</div>` : `<div class="xd-mu">${acWhy}</div>`)
    }));
  }
  // field work, as logged in the app — never sales: its own group, under its own heading
  const files = out.splice(0);
  const allBrands = D.brand ? ' · ' + xdT('all brands: field work is not logged by brand') : '';
  out.push(xdTile('visits', {
    label: xdT('Field visits'), raw: D.visits.count, value: xdN(String(D.visits.count)),
    sub: `${xdT('Logged in the app')}${D.visits.joint ? ' · ' + xdT('joint visits:') + ' ' + xdN(String(D.visits.joint)) : ''}${allBrands}`,
    src: xdT('Visits logged in the app. Field visits only: no calls and no phone orders.'),
    formula: xdT('A visit counts for each person on it, and once for the team.'),
    view: `<div>${xdT('Field visits:')} ${xdN(String(D.visits.count))} · ${xdDate(D.from)} – ${xdDate(D.to)}${D.visits.joint ? ' · ' + xdT('joint visits:') + ' ' + xdN(String(D.visits.joint)) : ''}</div>`
  }));
  out.push(xdTile('orders', {
    label: xdT('Orders logged in the app'), raw: D.orders.count, attrs: ` data-amount="${D.orders.value}"`,
    value: `${xdN(String(D.orders.count))} <span class="xd-sm">· ${xdKd(D.orders.value)}</span>`,
    sub: `${xdT('Typed by the team, not invoiced sales')}${D.orders.phone ? ' · ' + xdT('by phone:') + ' ' + xdN(String(D.orders.phone)) : ''}${allBrands}`,
    src: xdT('Orders the team typed in the app, on a visit or by phone. They are not invoices: invoiced sales come from the ERP files only.'),
    formula: xdT('The number of logged orders, and the sum of the totals typed on them.'),
    view: `<div>${xdT('Orders logged:')} ${xdN(String(D.orders.count))} · ${xdT('their typed value:')} ${xdKd(D.orders.value)}${D.orders.phone ? ' · ' + xdT('by phone:') + ' ' + xdN(String(D.orders.phone)) : ''}</div>`
  }));
  const C = D.conversion;
  out.push(xdTile('conversion', {
    label: xdT('Visit-to-order conversion'), raw: C.pct, value: C.pct != null ? xdPct(C.pct) : null, why: xdT('No field visit logged in this month'),
    sub: `${xdT('Field visits that took an order:')} ${xdN(String(C.withOrder))} ${xdT('of')} ${xdN(String(C.visits))}${allBrands}`,
    src: xdT('Field visits and the orders typed on them, as logged in the app.'),
    formula: xdT('Conversion % = field visits that took an order ÷ field visits × 100'),
    view: C.pct != null ? `<div>${xdN(String(C.withOrder))} ÷ ${xdN(String(C.visits))} × ${xdN('100')} = ${xdN(C.pct + '%')}</div>` : `<div>${xdT('No field visit logged in this month')}</div>`
  }));
  const FU = D.followUps;
  out.push(xdTile('followups', {
    label: xdT('Follow-ups due'), raw: FU.count, value: xdN(String(FU.count)),
    sub: `${xdT('As of today, whatever the month')} · ${xdT('overdue:')} ${xdN(String(FU.overdue))} · ${xdT('due today:')} ${xdN(String(FU.today))}`,
    src: xdT('The next follow-up date of each open clinic in the app, as of today.'),
    formula: xdT('The open clinics whose follow-up is due today or overdue — the Due list of the Today screen.'),
    view: `<div>${xdN(String(FU.count))} = ${xdN(String(FU.overdue))} ${xdT('overdue')} + ${xdN(String(FU.today))} ${xdT('due today')}</div>`
      + (FU.offTeam ? `<div class="xd-mu">${xdT('Owned by someone who is not on the team list:')} ${xdN(String(FU.offTeam))}</div>` : '')
  }));
  return `<div class="xd-grid" id="xdTiles">${files.join('')}</div>
    <div class="xd-sec" data-sec="logged">${xdT('Field work as logged in the app — not invoiced sales')}</div>
    <div class="xd-grid" id="xdTilesLogged">${out.join('')}</div>`;
}

// ---- C. charts: inline SVG in the app's own colours, no library ----
// Invoiced sales are the subject (the app's green); a target is the reference
// they are read against, a dark neutral mark — a tick or a dashed line — so the
// two differ by shape as well as colour (checked with the palette validator:
// CVD ΔE 17.6, normal 21.1, both ≥ 3:1 on the card). In Arabic every chart is
// mirrored: the leading edge is on the right. The SVG inherits the sheet's
// direction, so text-anchor "start" is the leading edge in both languages and
// only the x positions flip. Every chart has a caption and its numbers as a table.
function xdScale(max){
  if(!(max > 0)) return { max: 1, step: 1 };
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}
function xdAxisNum(v, max){ return max < 10 ? String(Math.round(v * 100) / 100) : xdInt(v); }
function xdCut(s, n){ s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
// a bar from the baseline x0 to its data end x1 (to the left of x0 in Arabic): square at the baseline, rounded at the data end
function xdBarPath(x0, x1, y, h, r){
  const d = x1 >= x0 ? 1 : -1, len = Math.abs(x1 - x0), q = Math.min(r, len, h / 2);
  return `M${x0.toFixed(1)} ${y} L${(x1 - d * q).toFixed(1)} ${y} Q${x1.toFixed(1)} ${y} ${x1.toFixed(1)} ${y + q} L${x1.toFixed(1)} ${y + h - q} Q${x1.toFixed(1)} ${y + h} ${(x1 - d * q).toFixed(1)} ${y + h} L${x0.toFixed(1)} ${y + h} Z`;
}
function xdColPath(x, w, yTop, yBase, r){
  const q = Math.min(r, w / 2, Math.max(0, yBase - yTop));
  return `M${x.toFixed(1)} ${yBase} L${x.toFixed(1)} ${(yTop + q).toFixed(1)} Q${x.toFixed(1)} ${yTop.toFixed(1)} ${(x + q).toFixed(1)} ${yTop.toFixed(1)} L${(x + w - q).toFixed(1)} ${yTop.toFixed(1)} Q${(x + w).toFixed(1)} ${yTop.toFixed(1)} ${(x + w).toFixed(1)} ${(yTop + q).toFixed(1)} L${(x + w).toFixed(1)} ${yBase} Z`;
}
const XD_TXT = 'font-family:inherit; fill:var(--muted);';
function xdChartCard(id, title, caption, inner){
  return `<div class="xd-card" data-chart="${id}"><div class="xd-ct">${xdT(title)}</div><div class="xd-cs" data-caption>${caption}</div>${inner}</div>`;
}
function xdCharts(D){ return xdChartDaily(D) + xdChartYear(D) + xdChartPeople(D) + xdChartBrands(D); }
// (1) the month day by day: invoiced sales added up, against the straight line to the target.
// INTEGRATION(core): D.daily = { measured, to, days: [{ date, net }] } — the days add up to sales.amount.
function xdChartDaily(D){
  const dl = D.daily;
  _xdDaily = null;
  if(!dl || !dl.measured || !Array.isArray(dl.days) || !dl.days.length) return '';
  const rtl = uiLang === 'ar', dim = D.days, A = D.achievement;
  let c = 0;
  const cum = dl.days.map(d => { c += xdCents(d.net); return c / 100; }), last = cum[cum.length - 1], n = cum.length;
  // the target line only when the sales line and the target cover the same people
  const like = A.target > 0 && !A.noTarget.length && !A.notMeasured.length, target = like ? A.target : null;
  const sc = xdScale(Math.max(target || 0, ...cum, 0));
  const ticks = []; for(let v = 0; v <= sc.max + 1e-9; v += sc.step) ticks.push(v);
  const W = 320, H = 174, lead = 8 + 5.4 * Math.max(...ticks.map(v => xdAxisNum(v, sc.max).length)), trail = 12, top = 18, bottom = 24, pw = W - lead - trail, ph = H - top - bottom;
  const X = t => rtl ? W - lead - t * pw : lead + t * pw, Yv = v => top + ph * (1 - Math.max(0, v) / sc.max);
  const pts = [[X(0), Yv(0)]].concat(cum.map((v, i) => [X((i + 1) / dim), Yv(v)]));
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const end = pts[pts.length - 1], endT = n / dim;
  const tgtY = target != null ? Yv(target) : null;
  // the two direct labels: the target at the far end of its line, the running total at its last day (below the dot when the two would meet)
  const clash = target != null && endT > 0.6 && Math.abs(end[1] - tgtY) < 16;
  const days = [1, 5, 10, 15, 20, 25].filter(d => d < dim - 2).concat([dim]);
  _xdDaily = { W, lead, pw, dim, rtl, days: dl.days, cum, target, top, ph };
  const svg = `<svg class="xd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xdW('The month day by day')}" onpointermove="xdDayAt(event)" onpointerdown="xdDayAt(event)">
    ${ticks.map(v => `<line x1="${X(0).toFixed(1)}" x2="${X(1).toFixed(1)}" y1="${Yv(v).toFixed(1)}" y2="${Yv(v).toFixed(1)}" style="stroke:var(--line); stroke-width:1;"/>
      <text data-notr x="${(rtl ? X(0) + 5 : X(0) - 5).toFixed(1)}" y="${(Yv(v) + 3).toFixed(1)}" text-anchor="end" font-size="9" style="${XD_TXT}">${xdAxisNum(v, sc.max)}</text>`).join('')}
    ${days.map(d => `<text data-notr x="${X(d / dim).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" style="${XD_TXT}">${d}</text>`).join('')}
    <path d="${path} L${end[0].toFixed(1)} ${Yv(0).toFixed(1)} Z" style="fill:var(--sage-ink); opacity:.1;"/>
    ${target != null ? `<line x1="${X(0).toFixed(1)}" y1="${Yv(0).toFixed(1)}" x2="${X(1).toFixed(1)}" y2="${tgtY.toFixed(1)}" style="stroke:var(--ink-2); stroke-width:1.5; stroke-dasharray:5 4;"/>
      <text data-notr x="${X(1).toFixed(1)}" y="${(tgtY - 6).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="700" style="font-family:inherit; fill:var(--ink-2);">${xdFix(target)}</text>` : ''}
    <path d="${path}" style="fill:none; stroke:var(--sage-ink); stroke-width:2; stroke-linejoin:round; stroke-linecap:round;"/>
    <circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="4" style="fill:var(--sage-ink); stroke:var(--card); stroke-width:2;"/>
    <text data-notr x="${(end[0] + (endT > 0.6 ? (rtl ? 7 : -7) : (rtl ? -7 : 7))).toFixed(1)}" y="${(clash ? end[1] + 14 : end[1] - 7).toFixed(1)}" text-anchor="${endT > 0.6 ? 'end' : 'start'}" font-size="10" font-weight="800" style="font-family:inherit; fill:var(--ink);">${xdFix(last)}</text>
    <line id="xdHair" x1="0" x2="0" y1="${top}" y2="${top + ph}" style="stroke:var(--ink-2); stroke-width:1; display:none;"/>
  </svg>`;
  const line = d => target != null ? Math.round(target * d / dim * 100) / 100 : null;
  return xdChartCard('daily', xdW('The month day by day'),
    xdT(target != null ? 'Invoiced sales added up day by day, against the straight line from 0 to the target on the last day of the month.'
      : A.target > 0 ? 'Invoiced sales added up day by day. No target line: the sales here and the target do not cover the same people — open one person to see the line.'
      : 'Invoiced sales added up day by day. No target on file, so there is no target line.'),
    svg + `<div class="xd-leg"><span><i class="xd-sw"></i>${xdT('Invoiced sales so far')}</span>${target != null ? `<span><i class="xd-sw dash"></i>${xdT('Straight line to the target')}</span>` : ''}</div>
    <div class="xd-read" id="xdDayRead" aria-live="polite"><span class="xd-mu">${xdT('Tap the chart to read a day.')}</span></div>
    <details class="xd-nums"><summary>${xdT('Show the numbers')}</summary><div class="xd-scroll"><table class="xd-tbl" data-table="daily">
      <tr><th>${xdT('Day')}</th><th>${xdT('Invoiced that day')}</th><th>${xdT('So far')}</th>${target != null ? `<th>${xdT('Line to the target')}</th>` : ''}</tr>
      ${dl.days.map((d, i) => `<tr><td>${xdDate(d.date)}</td><td>${xdN(xdFix(d.net))}</td><td>${xdN(xdFix(cum[i]))}</td>${target != null ? `<td>${xdN(xdFix(line(i + 1)))}</td>` : ''}</tr>`).join('')}
    </table></div></details>`);
}
// The day under the pointer: a hairline on the chart and its numbers in words below it.
function xdDayAt(ev){
  const g = _xdDaily, svg = ev.currentTarget, out = document.getElementById('xdDayRead'), hair = document.getElementById('xdHair');
  if(!g || !svg || !out) return;
  const r = svg.getBoundingClientRect(); if(!(r.width > 0)) return;
  const x = (ev.clientX - r.left) / r.width * g.W, t = g.rtl ? (g.W - g.lead - x) / g.pw : (x - g.lead) / g.pw;
  const i = Math.max(1, Math.min(g.days.length, Math.ceil(t * g.dim))), d = g.days[i - 1];
  const hx = g.rtl ? g.W - g.lead - (i / g.dim) * g.pw : g.lead + (i / g.dim) * g.pw;
  if(hair){ hair.setAttribute('x1', hx.toFixed(1)); hair.setAttribute('x2', hx.toFixed(1)); hair.style.display = ''; }
  out.setAttribute('data-day', d.date);
  out.innerHTML = `<b>${xdDate(d.date)}</b> · ${xdT('invoiced that day:')} ${xdKd(d.net)} · ${xdT('so far:')} ${xdKd(g.cum[i - 1])}${g.target != null ? ' · ' + xdT('line to the target:') + ' ' + xdKd(Math.round(g.target * i / g.dim * 100) / 100) : ''}`;
}
// (2) the year so far: each month's invoiced sales against its own target.
function xdChartYear(D){
  const ms = (D.ytd && D.ytd.months) || [];
  if(!ms.some(m => m.sales != null || m.target != null)) return '';
  const rtl = uiLang === 'ar', sc = xdScale(Math.max(0, ...ms.map(m => Math.max(m.sales || 0, m.target || 0))));
  const ticks = []; for(let v = 0; v <= sc.max + 1e-9; v += sc.step) ticks.push(v);
  const W = 320, H = 170, lead = 8 + 5.4 * Math.max(...ticks.map(v => xdAxisNum(v, sc.max).length)), trail = 6, top = 16, bottom = 24, pw = W - lead - trail, ph = H - top - bottom;
  const X = t => rtl ? W - lead - t * pw : lead + t * pw, Yv = v => top + ph * (1 - Math.max(0, v) / sc.max), slot = pw / 12, bw = Math.min(14, slot * 0.5), tw = Math.min(20, slot * 0.82);
  const tickOf = m => uiLang === 'ar' ? String(+m.slice(5, 7)) : new Date(m + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' });
  const pctOf = m => m.likeTarget > 0 ? Math.round(m.likeSales / m.likeTarget * 100) : null;
  const labelY = m => { const y = Yv(m.sales) - 5; return m.target != null && Yv(m.target) > y - 13 && Yv(m.target) < y + 4 ? Yv(m.target) - 6 : y; };
  const marks = ms.map((m, i) => {
    const cx = X((i + 0.5) / 12), run = D.current && m.month === D.month, sel = m.month === D.month;
    return `<g data-month="${m.month}"><title data-notr>${esc(monthLabel(m.month))}: ${m.sales != null ? xdFix(m.sales) : '—'} / ${m.target != null ? xdFix(m.target) : '—'}</title>
      ${m.sales != null && m.sales > 0 ? `<path d="${xdColPath(cx - bw / 2, bw, Yv(m.sales), Yv(0), 4)}" style="fill:var(--sage-ink);${run ? ' opacity:.45;' : ''}"/>` : ''}
      ${m.sales == null ? `<text data-notr x="${cx.toFixed(1)}" y="${(Yv(0) - 5).toFixed(1)}" text-anchor="middle" font-size="10" style="${XD_TXT}">—</text>` : ''}
      ${m.target != null ? `<line x1="${(cx - tw / 2 - 1.5).toFixed(1)}" x2="${(cx + tw / 2 + 1.5).toFixed(1)}" y1="${Yv(m.target).toFixed(1)}" y2="${Yv(m.target).toFixed(1)}" style="stroke:var(--card); stroke-width:5.5;"/>
        <line x1="${(cx - tw / 2).toFixed(1)}" x2="${(cx + tw / 2).toFixed(1)}" y1="${Yv(m.target).toFixed(1)}" y2="${Yv(m.target).toFixed(1)}" style="stroke:var(--ink-2); stroke-width:2.5;"/>` : ''}
      ${sel && m.sales != null ? `<text data-notr x="${cx.toFixed(1)}" y="${labelY(m).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" style="font-family:inherit; fill:var(--ink);">${xdInt(m.sales)}</text>` : ''}
      <text data-notr x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" font-weight="${sel ? 800 : 400}" style="font-family:inherit; fill:var(${sel ? '--ink' : '--muted'});">${esc(tickOf(m.month))}</text></g>`;
  }).join('');
  const svg = `<svg class="xd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xdW('The year so far')}">
    ${ticks.map(v => `<line x1="${X(0).toFixed(1)}" x2="${X(1).toFixed(1)}" y1="${Yv(v).toFixed(1)}" y2="${Yv(v).toFixed(1)}" style="stroke:var(--line); stroke-width:1;"/>
      <text data-notr x="${(rtl ? X(0) + 5 : X(0) - 5).toFixed(1)}" y="${(Yv(v) + 3).toFixed(1)}" text-anchor="end" font-size="9" style="${XD_TXT}">${xdAxisNum(v, sc.max)}</text>`).join('')}
    ${marks}</svg>`;
  return xdChartCard('year', xdW('The year so far'),
    xdT('Invoiced sales of each month against the target of that same month. A dash means no sales file for the month.'),
    svg + `<div class="xd-leg"><span><i class="xd-sw"></i>${xdT('Invoiced sales')}</span><span><i class="xd-sw tick" style="width:13px; height:3px;"></i>${xdT('The target of that month')}</span>${D.current ? `<span><i class="xd-sw soft"></i>${xdT('The running month, to today')}</span>` : ''}</div>
    <details class="xd-nums"><summary>${xdT('Show the numbers')}</summary><div class="xd-scroll"><table class="xd-tbl" data-table="year">
      <tr><th>${xdT('Month')}</th><th>${xdT('Invoiced sales')}</th><th>${xdT('Sales target')}</th><th>${xdT('Achievement')}</th></tr>
      ${ms.map(m => `<tr data-month="${m.month}"><td>${xdMonthName(m.month)}</td><td>${m.sales != null ? xdN(xdFix(m.sales)) : '— <span class="xd-mu">' + xdT('no sales file') + '</span>'}</td><td>${m.target != null ? xdN(xdFix(m.target)) : '—'}</td><td>${xdPct(pctOf(m))}</td></tr>`).join('')}
      <tr class="tot"><td>${xdT('Total')}</td><td>${D.ytd.sales != null ? xdN(xdFix(D.ytd.sales)) : '—'}</td><td>${D.ytd.target != null ? xdN(xdFix(D.ytd.target)) : '—'}</td><td>${xdPct(D.ytd.like.pct)}</td></tr>
    </table></div><div class="xd-foot">${xdT('The percentage counts only the months and people that have both a sales figure and a target.')}</div></details>`);
}
// (3) and (4): a row per name — a bar for what was invoiced, a tick for the target, all on one scale.
// rows: [{ name, value (null = not measured), target, pct, why (fixed wording), on }]
function xdBullets(rows, label){
  const max = Math.max(0, ...rows.map(r => Math.max(r.value || 0, r.target || 0)));
  if(!rows.length || !(max > 0)) return '';
  const rtl = uiLang === 'ar', sc = xdScale(max), W = 320, lead = 3, trail = 3, pw = W - lead - trail, rh = 40, H = rows.length * rh + 20;
  const X = t => rtl ? W - lead - t * pw : lead + t * pw;
  const ticks = []; for(let v = 0; v <= sc.max + 1e-9; v += sc.step) ticks.push(v);
  return `<svg class="xd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
    ${ticks.map((v, i) => `<line x1="${X(v / sc.max).toFixed(1)}" x2="${X(v / sc.max).toFixed(1)}" y1="14" y2="${H - 17}" style="stroke:var(--line); stroke-width:1;"/>
      <text data-notr x="${X(v / sc.max).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}" font-size="9" style="${XD_TXT}">${xdAxisNum(v, sc.max)}</text>`).join('')}
    ${rows.map((r, i) => { const y = i * rh, x0 = X(0), xv = X(Math.max(0, r.value || 0) / sc.max), xt = r.target != null ? X(r.target / sc.max) : null;
      return `<g data-row="${i}"><title data-notr>${esc(r.name)}: ${r.value != null ? xdFix(r.value) : '—'} / ${r.target != null ? xdFix(r.target) : '—'}</title>
        <text data-notr x="${x0.toFixed(1)}" y="${y + 12}" text-anchor="start" font-size="11.5" font-weight="${r.on ? 800 : 700}" style="font-family:inherit; fill:var(--ink);">${esc(xdCut(r.name, 26))}</text>
        ${r.value != null ? `<text data-notr x="${X(1).toFixed(1)}" y="${y + 12}" text-anchor="end" font-size="10.5" font-weight="700" style="font-family:inherit; fill:var(--ink);">${(r.value < 0 ? '‎' : '') + xdFix(r.value)}${r.pct != null ? ' · ' + r.pct + '%' : ''}</text>`
          : `<text x="${X(1).toFixed(1)}" y="${y + 12}" text-anchor="end" font-size="10.5" style="${XD_TXT}">${r.why || '—'}</text>`}
        <rect x="${Math.min(x0, X(1)).toFixed(1)}" y="${y + 18}" width="${pw}" height="10" rx="5" style="fill:var(--paper);"/>
        ${r.value > 0 ? `<path d="${xdBarPath(x0, xv, y + 18, 10, 4)}" style="fill:var(--sage-ink);"/>` : ''}
        ${xt != null ? `<rect x="${(xt - 3.2).toFixed(1)}" y="${y + 13}" width="6.4" height="20" rx="2" style="fill:var(--card);"/><rect x="${(xt - 1.3).toFixed(1)}" y="${y + 14}" width="2.6" height="18" rx="1" style="fill:var(--ink-2);"/>` : ''}
      </g>`; }).join('')}
  </svg>`;
}
function xdBulletLegend(){ return `<div class="xd-leg"><span><i class="xd-sw"></i>${xdT('Invoiced sales')}</span><span><i class="xd-sw tick"></i>${xdT('Sales target')}</span></div>`; }
function xdChartPeople(D){
  const rows = D.byPerson.map(p => ({ name: p.rep, value: p.measured ? p.amount : null, target: p.target, pct: p.pct, why: p.measured ? '' : xdW(p.why === 'nofile' ? 'no sales file' : 'not in the sales files') }));
  const svg = xdBullets(rows, xdW('People: achieved against target'));
  if(!svg) return '';
  return xdChartCard('people', xdW('People: achieved against target'),
    xdT('A bar for what each person invoiced in the month, a mark for the target, all on one scale. The numbers are in the table below.'), svg + xdBulletLegend());
}
function xdChartBrands(D){
  const all = D.byBrand.rows.filter(b => b.net != null || b.target != null), rows = all.slice(0, XD_CHART_BRANDS).map(b => ({ name: xdBrand(b.brand), value: b.net, target: b.target, pct: b.pct, why: xdW('no sales file'), on: b.selected }));
  const svg = xdBullets(rows, xdW('Brands: sold against target'));
  if(!svg) return '';
  return xdChartCard('brands', xdW('Brands: sold against target'),
    `${xdT('A bar for what each brand was invoiced in the month, a mark for the DSR target of that brand, all on one scale. The numbers are in the Brands table below.')}${all.length > rows.length ? ' ' + xdT('The largest brands; the table has them all:') + ' ' + xdN(String(rows.length)) + ' ' + xdT('of') + ' ' + xdN(String(all.length)) : ''}`,
    svg + xdBulletLegend());
}

// ---- D. the tables ----
// People — the comparison: a row per measure, a column per person.
function xdPeopleRows(D){
  const by = D.byPerson, sd = p => p.sameDays, g = p => p.sameDays ? { growth: p.sameDays.previous > 0 ? (p.sameDays.current - p.sameDays.previous) / p.sameDays.previous : null, fromZero: !(p.sameDays.previous > 0) && p.sameDays.current > 0 } : null;
  const F = D.forecast && D.forecast.byRep ? D.forecast.byRep : null;   // INTEGRATION(core): forecast.byRep
  const rows = [
    { k: 'sales', label: xdW('Invoiced sales'), kd: true, v: p => p.measured ? p.amount : null },
    { k: 'target', label: xdW('Sales target'), kd: true, v: p => p.target },
    { k: 'pct', label: xdW('Achievement'), pct: true, v: p => p.pct },
    { k: 'remaining', label: xdW('Remaining to target'), kd: true, v: p => p.remaining }];
  if(F) rows.push({ k: 'forecast', label: xdW('Month-end forecast'), kd: true, v: p => F[p.rep] ? F[p.rep].amount : null });
  rows.push(
    { k: 'prev', label: xdW('Same days of the month before'), kd: true, v: p => sd(p) ? sd(p).previous : null },
    { k: 'growth', label: xdW('Change on those days'), html: p => { const x = g(p); return x ? (xdGrowth(x) || '—') : '—'; }, v: p => { const x = g(p); return x && x.growth != null ? Math.round(x.growth * 100) : null; } },
    { k: 'visits', label: xdW('Field visits'), v: p => p.visits },
    { k: 'orders', label: xdW('Orders logged in the app'), v: p => p.orders },
    { k: 'ordersValue', label: xdW('Typed value of those orders'), kd: true, v: p => p.ordersValue },
    { k: 'conversion', label: xdW('Visit-to-order conversion'), pct: true, v: p => p.conversion },
    { k: 'followUps', label: xdW('Follow-ups due'), v: p => p.followUps });
  return { by, rows };
}
function xdPeople(D){
  const { by, rows } = xdPeopleRows(D);
  const cell = (r, p) => { const v = r.v(p); return r.html ? r.html(p) : v == null ? '—' : r.kd ? xdN(xdFix(v)) : r.pct ? xdN(v + '%') : xdN(String(v)); };
  return `<div class="xd-card" data-card="people"><div class="xd-ct">${xdT('People — the comparison')}</div>
    <div class="xd-cs">${xdT('Amounts in KD. Sales and targets as in the tiles above; visits and orders as logged in the app.')}</div>
    <div class="xd-scroll"><table class="xd-tbl xd-cmp" data-table="people">
      <tr><th></th>${by.map(p => `<th data-rep="${esc(p.rep)}">${xdName(p.rep)}</th>`).join('')}</tr>
      ${rows.map(r => `<tr data-row="${r.k}"><td>${xdT(r.label)}</td>${by.map(p => { const v = r.v(p); return `<td data-rep="${esc(p.rep)}" data-value="${v == null ? '' : v}">${cell(r, p)}</td>`; }).join('')}</tr>`).join('')}
    </table></div>
    <div class="xd-foot">${xdT('A dash means not measured: no sales file, no target, or nothing to compare with. A joint visit counts for each person on it. Follow-ups are as of today.')}</div></div>`;
}
// Customers: class chips, search, the first 20, and what the rows add up to.
// INTEGRATION(core): customers.accounts[i].cls — until the core gives it there are no class chips (no second source here).
function xdAccCls(a){ return a && Object.prototype.hasOwnProperty.call(a, 'cls') ? (a.cls || null) : undefined; }
function xdClsKeys(D){
  const acc = D.customers.accounts;
  if(!acc.some(a => xdAccCls(a) !== undefined)) return [];
  const seen = Object.create(null); acc.forEach(a => { const c = xdAccCls(a); seen[c == null ? 'none' : c] = 1; });
  const known = ['A', 'B', 'C', 'D', 'F'];
  return known.filter(k => seen[k]).concat(Object.keys(seen).filter(k => k !== 'none' && !known.includes(k)).sort(), seen.none ? ['none'] : []);
}
function xdCustList(D){
  const q = _xdQ.trim().toLowerCase(), byCls = xdClsKeys(D).length > 0 && _xdCls !== 'all';
  return D.customers.accounts.map((a, i) => ({ a, i })).filter(x => {
    if(byCls){ const c = xdAccCls(x.a); if(_xdCls === 'none' ? c != null : c !== _xdCls) return false; }
    return !q || String(x.a.name || '').toLowerCase().includes(q);
  });
}
function xdSumCents(list, f){ return list.reduce((s, x) => s + xdCents(f(x)), 0); }
function xdCustomers(D){
  const acc = D.customers.accounts, keys = xdClsKeys(D);
  const n = k => acc.filter(a => { const c = xdAccCls(a); return k === 'none' ? c == null : c === k; }).length;
  const chip = (k, label, count) => `<div class="chip small ${_xdCls === k ? 'on' : ''}" data-cls="${esc(k)}" onclick="xdSetCls('${esc(k)}')">${label} ${xdN('(' + count + ')')}</div>`;
  return `<div class="xd-card" data-card="customers"><div class="xd-ct">${xdT('Customers')}</div>
    <div class="xd-cs">${xdT('Every account invoiced in the month, largest first: clinics, online and channel accounts. Accounts set to ignore are not listed.')}</div>
    ${keys.length ? `<div class="chip-row" id="xdClsChips" style="margin-top:8px;">${chip('all', xdT('All'), acc.length)}${keys.map(k => chip(k, k === 'none' ? xdT('No class') : k === 'Closed' ? xdT('Closed') : `<span data-notr>${esc(k)}</span>`, n(k))).join('')}</div>` : ''}
    <input type="text" class="xd-search" id="xdCustQ" value="${esc(_xdQ)}" placeholder="${xdW('Search customers…')}" aria-label="${xdW('Search customers…')}" dir="auto" oninput="xdSearchCust(this.value)">
    <div id="xdCustBox">${xdCustBox(D)}</div></div>`;
}
function xdCustBox(D){
  const acc = D.customers.accounts, list = xdCustList(D), filtered = list.length !== acc.length || _xdCls !== 'all' || !!_xdQ.trim();
  const allC = xdSumCents(acc, a => a.net), subC = xdSumCents(list, x => x.a.net), tot = D.customers.totals;
  const shown = _xdAllCust ? list : list.slice(0, XD_PAGE);
  if(!D.sales.measured) return `<div class="xd-sum xd-mu" data-sum="customers" data-measured="0">${xdT('No sales figure for this month, so there is no customer list.')}</div>`;
  const sum = filtered
    ? `${xdT('Customers shown:')} ${xdN(String(list.length))} ${xdT('of')} ${xdN(String(acc.length))} · ${xdT('their invoiced sales:')} ${xdKd(subC / 100)} ${xdT('of')} ${xdKd(allC / 100)}`
    : `${xdT('Customers:')} ${xdN(String(acc.length))} · ${xdT('their invoiced sales:')} ${xdKd(allC / 100)}`;
  // what the list adds up to, said only after adding it up: the rows + the accounts set to ignore = the tile
  const expect = xdCents(tot.clinics) + xdCents(tot.channels), adds = allC === expect && xdCents(tot.total) === xdCents(D.sales.amount), ign = xdCents(tot.ignored);
  const foot = adds
    ? (ign ? `${xdT('The customers listed')} ${xdKd(allC / 100)} + ${xdT('accounts set to ignore, not listed')} ${xdKd(tot.ignored)} = ${xdT('the invoiced sales above')} ${xdKd(D.sales.amount)}`
        : `${xdT('The customers listed add up to the invoiced sales above:')} ${xdKd(D.sales.amount)}`)
    : `${xdT('The rows as shown add up to')} ${xdKd(allC / 100)}; ${xdT('the invoiced sales above are')} ${xdKd(D.sales.amount)}${ign ? ' (' + xdT('accounts set to ignore, not listed') + ' ' + xdKd(tot.ignored) + ')' : ''}. ${xdT('Each row is rounded on its own.')}`;
  return `<div class="xd-sum" data-sum="customers" data-measured="1" data-shown="${list.length}" data-of="${acc.length}" data-subtotal="${subC / 100}" data-total="${allC / 100}" data-filtered="${filtered ? 1 : 0}">${sum}</div>
    ${shown.map(x => xdCustRow(D, x.a, x.i)).join('') || `<div class="xd-row xd-mu">${xdT('No customer matches.')}</div>`}
    ${!_xdAllCust && list.length > XD_PAGE ? `<button class="xd-more" id="xdCustMore" onclick="xdShowAll('cust')">${xdT('Show all')} ${xdN('(' + list.length + ')')}</button>` : ''}
    <div class="xd-foot" data-foot="customers" data-adds="${adds ? 1 : 0}">${foot}</div>`;
}
function xdCustRow(D, a, i){
  const c = xdAccCls(a), open = _xdOpenAcc === i;
  return `<div class="xd-row tap" data-acc="${i}" data-net="${a.net}" onclick="xdToggleRow('acc', ${i})">
    <div class="row-between" style="align-items:flex-start;">
      <div style="min-width:0;"><div class="xd-rn">${xdName(a.name)}</div>
        <div class="xd-rs">${c ? `<span class="cls cls-${esc(c)}" data-notr style="width:18px; height:18px; font-size:10.5px; vertical-align:-3px;">${esc(c === 'Closed' ? '×' : c)}</span> ` : ''}${xdNames(a.reps || [])} · ${xdT('invoices:')} ${xdN(String(a.invoices))} · ${xdT('last invoice')} ${xdDate(a.last)}${a.channel ? ` · <span class="xd-tag">${xdT('Online / channel')}</span>` : !a.clinicId ? ` · <span class="xd-tag">${xdT('not linked')}</span>` : ''}</div></div>
      <div class="xd-rv">${xdKd(a.net)}</div>
    </div>${open ? xdAccDrill(D, a, i) : ''}</div>`;
}
// One customer: what it bought and its invoices (the same lines again), and a way to its clinic.
// INTEGRATION(core): UMCore.execDrill(data, { month, rep, reps, brand, account: key }) → { total, brands, products, invoices }
function xdDrill(what){
  if(typeof UMCore.execDrill !== 'function' || !_xdD) return null;
  try{ return UMCore.execDrill(Object.assign(digestData(), { today: todayStr() }), Object.assign({ month: _xdD.month, rep: _xdD.rep || 'all', reps: REPS.slice(), brand: _xdD.brand || 'all' }, what)) || null; }
  catch(e){ console.error('management dashboard drill', e); return null; }
}
function xdCapNote(shown, all){ return all > shown ? `<div class="xd-mu" data-cap>${xdT('Shown: the first')} ${xdN(String(shown))} ${xdT('of')} ${xdN(String(all))}</div>` : ''; }
function xdAccDrill(D, a, i){
  const dr = xdDrill({ account: a.key });
  let inner = '';
  if(dr && dr.kind === 'account'){
    const same = xdCents(dr.total) === xdCents(a.net);
    const li = (name, v, sub) => xdKv(name + (sub ? ` <span class="xd-mu">${sub}</span>` : ''), xdKd(v));
    inner = `<h5>${xdT('What this customer bought, by brand')}</h5>${(dr.brands || []).map(b => li(xdName(xdBrand(b.brand)), b.net)).join('')}
      <h5>${xdT('By product')}</h5>${(dr.products || []).slice(0, XD_SHORT).map(p => li(xdName(p.name), p.net, '· ' + xdT('units:') + ' ' + xdN(String(p.qty)))).join('')}${xdCapNote(Math.min(XD_SHORT, (dr.products || []).length), (dr.products || []).length)}
      <h5>${xdT('Invoices')}</h5>${(dr.invoices || []).slice(0, XD_SHORT).map(v => li(`<span dir="ltr" data-notr>${esc(String(v.doc || ''))}</span> <span class="xd-mu">· ${xdDate(v.date)}${v.rep ? ' · ' + xdName(v.rep) : ''}</span>`, v.net)).join('')}${xdCapNote(Math.min(XD_SHORT, (dr.invoices || []).length), (dr.invoices || []).length)}
      ${xdKv(xdT('Total'), xdKd(dr.total), 'xd-tot')}
      ${same ? '' : `<div class="xd-note" data-note="drill-differs">⚠️ ${xdT('These lines add up to a different amount than the row above. Please report this difference.')}</div>`}`;
  } else {
    inner = `<div class="xd-mu">${xdT('Invoiced in the month:')} ${xdKd(a.net)} · ${xdT('invoices:')} ${xdN(String(a.invoices))}${a.ret > 0 ? ' · ' + xdT('returned:') + ' ' + xdKd(a.ret) : ''}</div>`;
  }
  return `<div class="xd-drill" data-drill="acc" onclick="event.stopPropagation()">${inner}
    ${a.clinicId ? `<button class="xd-more" data-open-clinic onclick="xdOpenClinic('acc', ${i})">${xdT('Open clinic')}</button>` : `<div class="xd-mu" style="margin-top:6px;">${xdT(a.channel ? 'An online or channel account: it has no clinic card.' : 'This ERP account is not linked to a clinic in the app.')}</div>`}</div>`;
}
function xdOpenClinic(kind, i){
  const D = _xdD; if(!D) return;
  const id = kind === 'acc' ? (D.customers.accounts[i] || {}).clinicId : kind === 'follow' ? (D.followUps.list[i] || {}).id
    : kind === 'pot' ? (D.act.potential[i] || {}).id : kind === 'under' ? (D.act.under[i] || {}).clinicId : kind === 'new' ? (D.newCustomers.list[i] || {}).clinicId
    : kind === 'vni' ? ((D.activity && D.activity.visitedNoInvoice || [])[i] || {}).id : kind === 'inv' ? ((D.activity && D.activity.invoicedNoVisit || [])[i] || {}).id : null;
  if(id != null) openClinicDetail(id);
}
function xdSetCls(k){ _xdCls = k; _xdAllCust = false; _xdOpenAcc = null; xdRedraw('customers'); }
function xdSearchCust(v){ _xdQ = String(v || ''); _xdAllCust = false; _xdOpenAcc = null; xdRedraw('custbox'); }
function xdSearchProd(v){ _xdPQ = String(v || ''); _xdAllProd = false; _xdOpenProd = null; xdRedraw('prodbox'); }
function xdShowAll(what){ if(what === 'cust'){ _xdAllCust = true; xdRedraw('custbox'); } else if(what === 'prod'){ _xdAllProd = true; xdRedraw('prodbox'); } else { _xdAllFollow = true; xdRedraw('follow'); } }
function xdToggleRow(what, i){
  if(what === 'acc'){ _xdOpenAcc = _xdOpenAcc === i ? null : i; xdRedraw('custbox'); }
  else { _xdOpenProd = _xdOpenProd === i ? null : i; xdRedraw('prodbox'); }
}
// A redraw of one part from the result already on screen — nothing is computed again.
function xdRedraw(part){
  const D = _xdD; if(!D) return;
  const put = (sel, html) => { const el = document.querySelector('#xdRoot ' + sel); if(el) el.innerHTML = html; };
  if(part === 'custbox') put('#xdCustBox', xdCustBox(D));
  else if(part === 'prodbox') put('#xdProdBox', xdProdBox(D));
  else if(part === 'customers'){ const el = document.querySelector('#xdRoot [data-card="customers"]'); if(el) el.outerHTML = xdCustomers(D); }
  else if(part === 'follow'){ const el = document.querySelector('#xdRoot [data-card="followups"]'); if(el) el.outerHTML = xdFollowUps(D); }
}
// Brands: tap one to see the whole dashboard for it.
function xdBrands(D){
  const B = D.byBrand, rows = B.rows;
  if(!rows.length) return `<div class="xd-card" data-card="brands"><div class="xd-ct">${xdT('Brands')}</div><div class="xd-cs">${xdT('No brand sold and no brand target in this view.')}</div></div>`;
  const rowsC = xdSumCents(rows.filter(b => b.net != null), b => b.net), adds = B.total != null && rowsC === xdCents(B.total);
  return `<div class="xd-card" data-card="brands"><div class="xd-ct">${xdT('Brands')}</div>
    <div class="xd-cs">${xdT('Sold from the ERP files, the target from the DSR. Tap a brand to see the whole dashboard for that brand; tap it again for all brands.')}</div>
    <div class="xd-scroll"><table class="xd-tbl" data-table="brands">
      <tr><th>${xdT('Brand')}</th><th>${xdT('Sold')}</th><th>${xdT('Sales target')}</th><th>%</th></tr>
      ${rows.map((b, i) => `<tr class="pick${b.selected ? ' on' : ''}" data-brand="${esc(b.brand)}" data-net="${b.net == null ? '' : b.net}" data-target="${b.target == null ? '' : b.target}" onclick="xdPickBrand(${i})"><td>${b.selected ? '✓ ' : ''}${xdName(xdBrand(b.brand))}</td><td>${b.net != null ? xdN(xdFix(b.net)) : '—'}</td><td>${b.target != null ? xdN(xdFix(b.target)) : '—'}</td><td>${xdPct(b.pct)}</td></tr>`).join('')}
      ${B.total != null ? `<tr class="tot" data-row="total" data-value="${B.total}"><td>${xdT(D.brand ? 'All brands' : 'Total')}</td><td>${xdN(xdFix(B.total))}</td><td></td><td></td></tr>` : ''}
    </table></div>
    <div class="xd-foot" data-foot="brands" data-adds="${adds ? 1 : 0}">${B.total == null ? xdT('No sales figure for this month: the targets only.')
      : adds ? xdT('The brands add up to the invoiced sales of all brands.')
      : `${xdT('The rows as shown add up to')} ${xdKd(rowsC / 100)}; ${xdT('the invoiced sales of all brands are')} ${xdKd(B.total)}. ${xdT('Each row is rounded on its own.')}`}
      ${xdT('A brand with no target in the DSR shows a dash.')}</div></div>`;
}
// Products: search, the first 20; tap one to see who bought it.
function xdProdList(D){
  const q = _xdPQ.trim().toLowerCase();
  return D.byProduct.rows.map((p, i) => ({ p, i })).filter(x => !q || String(x.p.name || '').toLowerCase().includes(q) || String(xdBrand(x.p.brand)).toLowerCase().includes(q));
}
function xdProducts(D){
  return `<div class="xd-card" data-card="products"><div class="xd-ct">${xdT('Products')}</div>
    <div class="xd-cs">${xdT('What was invoiced in the month, product by product as the ERP names them, largest first.')}</div>
    <input type="text" class="xd-search" id="xdProdQ" value="${esc(_xdPQ)}" placeholder="${xdW('Search products or brands…')}" aria-label="${xdW('Search products or brands…')}" dir="auto" oninput="xdSearchProd(this.value)">
    <div id="xdProdBox">${xdProdBox(D)}</div></div>`;
}
function xdProdBox(D){
  if(!D.sales.measured) return `<div class="xd-sum xd-mu" data-sum="products" data-measured="0">${xdT('No sales figure for this month, so there is no product list.')}</div>`;
  const all = D.byProduct.rows, list = xdProdList(D), filtered = list.length !== all.length || !!_xdPQ.trim(), allC = xdSumCents(all, p => p.net), subC = xdSumCents(list, x => x.p.net);
  const shown = _xdAllProd ? list : list.slice(0, XD_PAGE), adds = allC === xdCents(D.byProduct.total), drill = typeof UMCore.execDrill === 'function';
  const sum = filtered
    ? `${xdT('Products shown:')} ${xdN(String(list.length))} ${xdT('of')} ${xdN(String(all.length))} · ${xdT('their invoiced value:')} ${xdKd(subC / 100)} ${xdT('of')} ${xdKd(allC / 100)}`
    : `${xdT('Products:')} ${xdN(String(all.length))} · ${xdT('their invoiced value:')} ${xdKd(allC / 100)}`;
  return `<div class="xd-sum" data-sum="products" data-measured="1" data-shown="${list.length}" data-of="${all.length}" data-subtotal="${subC / 100}" data-total="${allC / 100}" data-filtered="${filtered ? 1 : 0}">${sum}</div>
    ${shown.map(x => { const p = x.p, open = drill && _xdOpenProd === x.i;
      return `<div class="xd-row${drill ? ' tap' : ''}" data-prod="${x.i}" data-net="${p.net}" ${drill ? `onclick="xdToggleRow('prod', ${x.i})"` : ''}>
        <div class="row-between" style="align-items:flex-start;"><div style="min-width:0;"><div class="xd-rn">${xdName(p.name || '—')}</div>
          <div class="xd-rs">${xdName(xdBrand(p.brand))} · ${xdT('units:')} ${xdN(String(p.qty))} · ${xdT('invoices:')} ${xdN(String(p.invoices))}</div></div>
          <div class="xd-rv">${xdKd(p.net)}</div></div>${open ? xdProdDrill(D, p) : ''}</div>`; }).join('') || `<div class="xd-row xd-mu">${xdT('No product matches.')}</div>`}
    ${!_xdAllProd && list.length > XD_PAGE ? `<button class="xd-more" id="xdProdMore" onclick="xdShowAll('prod')">${xdT('Show all')} ${xdN('(' + list.length + ')')}</button>` : ''}
    <div class="xd-foot" data-foot="products" data-adds="${adds ? 1 : 0}">${adds ? `${xdT('The products add up to the invoiced sales above:')} ${xdKd(D.byProduct.total)}`
      : `${xdT('The rows as shown add up to')} ${xdKd(allC / 100)}; ${xdT('the invoiced sales above are')} ${xdKd(D.byProduct.total)}. ${xdT('Each row is rounded on its own.')}`}</div>`;
}
// INTEGRATION(core): UMCore.execDrill(data, { …, product: { name, brand } }) → { total, qty, accounts: [{ name, net, qty, invoices }], people: [{ rep, net }] }
function xdProdDrill(D, p){
  const dr = xdDrill({ product: { name: p.name, brand: p.brand } });
  if(!dr || dr.kind !== 'product') return `<div class="xd-drill" data-drill="prod" onclick="event.stopPropagation()"><div class="xd-mu">${xdT('Who bought it is not available for this product.')}</div></div>`;
  const same = xdCents(dr.total) === xdCents(p.net);
  return `<div class="xd-drill" data-drill="prod" onclick="event.stopPropagation()">
    <h5>${xdT('Who bought it')}</h5>${(dr.accounts || []).slice(0, XD_SHORT).map(a => xdKv(`${xdName(a.name)} <span class="xd-mu">· ${xdT('units:')} ${xdN(String(a.qty))}</span>`, xdKd(a.net))).join('')}${xdCapNote(Math.min(XD_SHORT, (dr.accounts || []).length), (dr.accounts || []).length)}
    <h5>${xdT('Counted for')}</h5>${(dr.people || []).map(x => xdKv(xdName(x.rep), xdKd(x.net))).join('')}
    ${xdKv(xdT('Total'), xdKd(dr.total), 'xd-tot')}
    ${same ? '' : `<div class="xd-note" data-note="drill-differs">⚠️ ${xdT('These lines add up to a different amount than the row above. Please report this difference.')}</div>`}</div>`;
}
// Customers to act on, each list with its rule in words.
function xdAct(D){
  const a = D.act;
  const head = `<div class="xd-ct">${xdT('Customers to act on')}</div>`;
  if(!a || !a.measurable) return `<div class="xd-card" data-card="act">${head}<div class="xd-cs">${xdT('Not judged: no sales figure for this month.')}</div></div>`;
  const prior = a.prior.map(p => xdMonthName(p.month)).join(xdSep());
  const cls = c => c ? `<span class="cls cls-${esc(c)}" data-notr style="width:18px; height:18px; font-size:10.5px; vertical-align:-3px;">${esc(c === 'Closed' ? '×' : c)}</span> ` : '';
  const more = (shown, all) => all > shown ? `<div class="xd-foot">${xdT('More in the Excel export:')} ${xdN(String(all - shown))}</div>` : '';
  const under = a.prior.length < 2
    ? `<div class="xd-rule" data-rule="under-none">${xdT('Not judged: the sales files cover fewer than 2 of the 3 months before.')}</div>`
    : (a.under.slice(0, XD_SHORT).map((x, i) => `<div class="xd-row${x.clinicId ? ' tap' : ''}" data-under="${i}" ${x.clinicId ? `onclick="xdOpenClinic('under', ${i})"` : ''}><div class="row-between" style="align-items:flex-start;">
        <div style="min-width:0;"><div class="xd-rn">${cls(x.cls)}${xdName(x.name)}</div><div class="xd-rs">${xdName(x.owner)} · ${xdT('this month')} ${xdKd(x.current)} · ${xdT('its average')} ${xdKd(x.average)} · ${xdT('months it bought in:')} ${xdN(x.bought + ' / ' + x.months)}</div></div>
        <div class="xd-rv" style="color:var(--coral-ink);">${xdN('−' + xdFix(x.gap))}</div></div></div>`).join('') || `<div class="xd-row xd-mu">${xdT('No customer is under its usual level.')}</div>`) + more(XD_SHORT, a.under.length);
  const pot = a.potential.slice(0, XD_SHORT).map((x, i) => `<div class="xd-row tap" data-pot="${i}" onclick="xdOpenClinic('pot', ${i})"><div class="xd-rn">${cls(x.cls)}${xdName(x.name)}</div>
      <div class="xd-rs">${xdName(x.rep)} · ${x.lastVisit ? xdT('last field visit') + ' ' + xdDate(x.lastVisit) : xdT('never visited')} · ${xdT('months it bought in:')} ${xdN(x.bought + ' / ' + x.months)}</div></div>`).join('') || `<div class="xd-row xd-mu">${xdT('Every A and B clinic of this view bought this month, or buys regularly.')}</div>`;
  return `<div class="xd-card" data-card="act">${head}
    <div class="xd-cs">${xdT('Compared on days 1 to')} ${xdN(String(a.day))} ${xdT('of the month, against the same days of:')} ${prior || '—'}${D.brand ? ' · ' + xdName(xdBrand(D.brand)) : ''}</div>
    <div class="xd-sub" data-list="under">${xdT('Under-performing')} ${xdN('(' + a.under.length + ')')}</div>
    <div class="xd-rule">${xdT('Rule: the customer bought in at least 2 of those months, and this month is less than half of its average for the same days.')}</div>
    ${under}
    <div class="xd-sub" data-list="potential">${xdT('High potential')} ${xdN('(' + a.potential.length + ')')}</div>
    <div class="xd-rule">${xdT('Rule: an open clinic graded A or B with no invoice this month, and invoices in at most one of those months.')}</div>
    ${pot}${more(XD_SHORT, a.potential.length)}</div>`;
}
// INTEGRATION(core): D.activity.visitedNoInvoice: [{ id, name, rep, cls, lastVisit }], invoicedNoVisit: [{ id, name, rep, cls, net }]
function xdActivity(D){
  const AC = D.activity;
  if(!AC || typeof AC !== 'object') return '';
  const cls = c => c ? `<span class="cls cls-${esc(c)}" data-notr style="width:18px; height:18px; font-size:10.5px; vertical-align:-3px;">${esc(c === 'Closed' ? '×' : c)}</span> ` : '';
  const more = (shown, all) => all > shown ? `<div class="xd-foot">${xdT('More in the Excel export:')} ${xdN(String(all - shown))}</div>` : '';
  const vni = AC.visitedNoInvoice || [], inv = AC.invoicedNoVisit || [];
  return `<div class="xd-card" data-card="activity"><div class="xd-ct">${xdT('Customer activity')}</div>
    <div class="xd-cs">${xdT('Open clinics of this view in the month: a field visit as logged in the app, an invoice from the ERP files.')}</div>
    ${AC.measurable ? `<div class="xd-sub" data-list="vni">${xdT('Visited, no invoice')} ${xdN('(' + vni.length + ')')}</div>
      ${vni.slice(0, XD_SHORT).map((x, i) => `<div class="xd-row tap" data-vni="${i}" onclick="xdOpenClinic('vni', ${i})"><div class="xd-rn">${cls(x.cls)}${xdName(x.name)}</div><div class="xd-rs">${xdName(x.rep)} · ${xdT('last field visit')} ${xdDate(x.lastVisit)}</div></div>`).join('') || `<div class="xd-row xd-mu">${xdT('Every clinic visited in the month was invoiced.')}</div>`}${more(XD_SHORT, vni.length)}
      <div class="xd-sub" data-list="inv">${xdT('Invoiced, no visit')} ${xdN('(' + inv.length + ')')}</div>
      ${inv.slice(0, XD_SHORT).map((x, i) => `<div class="xd-row tap" data-inv="${i}" onclick="xdOpenClinic('inv', ${i})"><div class="row-between" style="align-items:flex-start;"><div style="min-width:0;"><div class="xd-rn">${cls(x.cls)}${xdName(x.name)}</div><div class="xd-rs">${xdName(x.rep)}</div></div><div class="xd-rv">${xdKd(x.net)}</div></div></div>`).join('') || `<div class="xd-row xd-mu">${xdT('Every clinic invoiced in the month was visited.')}</div>`}${more(XD_SHORT, inv.length)}`
      : `<div class="xd-rule">${xdT('No sales figure for this month, so the invoiced clinics cannot be counted')}</div>`}</div>`;
}
function xdNewCustomers(D){
  const NC = D.newCustomers;
  return `<div class="xd-card" data-card="newcustomers"><div class="xd-ct">${xdT('New customers')}${NC.measurable ? ' ' + xdN('(' + NC.count + ')') : ''}</div>
    <div class="xd-cs">${xdT('Accounts whose first invoice in all the saved sales files falls in this month.')}</div>
    ${!NC.measurable ? `<div class="xd-rule">${xdT(!NC.covered ? 'No sales file covers this month' : 'Needs sales files that start at least a month earlier, or every account would look new')}</div>`
      : NC.list.slice(0, XD_SHORT).map((x, i) => `<div class="xd-row${x.clinicId ? ' tap' : ''}" data-new="${i}" ${x.clinicId ? `onclick="xdOpenClinic('new', ${i})"` : ''}><div class="row-between" style="align-items:flex-start;">
          <div style="min-width:0;"><div class="xd-rn">${xdName(x.name)}</div><div class="xd-rs">${xdName(x.rep)} · ${xdT('first invoice')} ${xdDate(x.date)}</div></div><div class="xd-rv">${xdKd(x.net)}</div></div></div>`).join('')
        || `<div class="xd-row xd-mu">${xdT('No new account in this month.')}</div>`}
    ${NC.measurable && NC.list.length > XD_SHORT ? `<div class="xd-foot">${xdT('More in the Excel export:')} ${xdN(String(NC.list.length - XD_SHORT))}</div>` : ''}</div>`;
}
function xdFollowUps(D){
  const FU = D.followUps, list = _xdAllFollow ? FU.list : FU.list.slice(0, XD_SHORT);
  return `<div class="xd-card" data-card="followups"><div class="xd-ct">${xdT('Follow-ups due')} ${xdN('(' + FU.count + ')')}</div>
    <div class="xd-cs">${xdT('As of today, whatever the month: open clinics whose follow-up is due today or overdue. Tap one to open the clinic.')}</div>
    ${list.map((x, i) => `<div class="xd-row tap" data-follow="${i}" onclick="xdOpenClinic('follow', ${i})"><div class="row-between" style="align-items:flex-start;">
        <div style="min-width:0;"><div class="xd-rn">${xdName(x.name)}</div><div class="xd-rs">${x.rep ? xdName(x.rep) + ' · ' : ''}${xdT('due')} ${xdDate(x.date)}</div></div>
        <span class="badge ${x.overdue ? 'overdue' : 'today'}">${xdT(x.overdue ? 'Overdue' : 'Due today')}</span></div></div>`).join('') || `<div class="xd-row xd-mu">${xdT('No follow-up is due.')}</div>`}
    ${!_xdAllFollow && FU.list.length > XD_SHORT ? `<button class="xd-more" id="xdFollowMore" onclick="xdShowAll('follow')">${xdT('Show all')} ${xdN('(' + FU.list.length + ')')}</button>` : ''}</div>`;
}

// ---- E. Excel: the figures and tables of this view, the same numbers as on screen ----
// A value that is not measured is an empty cell with the reason beside it — never a 0.
function xdExportRows(){
  const D = _xdD; if(!D) return [];
  const S = D.sales, A = D.achievement, P = D.perDay, Y = D.ytd, NC = D.newCustomers, rows = [];
  const why = !S.measured ? (S.missing.every(x => x.why === 'nofile') ? 'no sales file covers this month' : 'the sales files of this month hold no line of these people') : '';
  const v = x => x == null ? '' : x;
  rows.push(['Management dashboard', '']);
  rows.push(['Month', D.month + (D.current ? ' (running month, to ' + D.to + ')' : ' (closed month)')]);
  rows.push(['People', D.rep ? D.rep : 'Team: ' + D.people.join(', ')]);
  rows.push(['Brand', D.brand ? xdBrand(D.brand) : 'All brands']);
  rows.push(['Sales files reach', S.asOf || 'no sales file for this month']);
  rows.push(['Exported on', D.today]);
  rows.push(['']);
  rows.push(['KPI', 'Value', 'Unit', 'Note']);
  rows.push(['Invoiced sales', v(S.amount), 'KD', S.measured ? 'ERP sales files to ' + S.asOf : why]);
  rows.push(['Sales target', v(D.target.amount), 'KD', D.target.amount == null ? 'no target on file' : 'DSR' + (D.target.stale.length ? ' — target of an earlier month: ' + D.target.stale.map(x => x.rep + ' ' + x.month).join(', ') : '')]);
  rows.push(['Achievement', v(A.pct), '%', A.pct == null ? 'needs a sales target and a sales figure for the same person' : A.achieved + ' of ' + A.target + (A.people.length < D.people.length ? ' — counted: ' + A.people.join(', ') : '')]);
  rows.push(['Remaining to target', v(D.remaining), 'KD', 'max(target − invoiced sales, 0)']);
  rows.push(['Needed per working day', v(P.amount), 'KD', P.closed ? 'the month is closed' : 'working days left: ' + P.workdays.left + ' of ' + P.workdays.total]);
  if(D.forecast && typeof D.forecast === 'object') rows.push(['Month-end forecast', v(D.forecast.amount), 'KD', D.forecast.pct != null ? D.forecast.pct + '% of the target at the pace so far' : 'a projection at the pace so far']);
  const cmp = (name, g) => rows.push([name, g.measured && g.growth != null ? Math.round(g.growth * 100) : '', '%', g.measured ? (g.fromZero ? 'from zero — ' : '') + g.current + ' against ' + g.previous + ' (days 1 to ' + xdDayNo(g.to) + ' of ' + g.month + ')' : 'nothing to compare with']);
  cmp('Against the same days of the month before', D.sameDays);
  if(D.lastYear && typeof D.lastYear === 'object') cmp('Against the same month a year before', D.lastYear);
  rows.push(['Year to date ' + Y.year, v(Y.sales), 'KD', 'targets of the months that have one: ' + (Y.target == null ? 'none' : Y.target) + (Y.like.pct != null ? ' — ' + Y.like.pct + '% where a month has both' : '') + (Y.noFile.length ? ' — no sales file: ' + Y.noFile.join(', ') : '')]);
  rows.push(['New customers', v(NC.count), 'accounts', NC.measurable ? 'first invoice ever in the saved sales files' : 'not measurable: the sales files do not reach a month back']);
  if(D.activity && typeof D.activity === 'object') rows.push(['Customer activity: open clinics invoiced', D.activity.measurable ? D.activity.invoiced : '', 'clinics', 'open clinics ' + D.activity.openClinics + ', visited ' + D.activity.visited + (D.activity.measurable ? ', both ' + D.activity.both : '')]);
  rows.push(['Field visits', D.visits.count, 'visits', 'logged in the app' + (D.visits.joint ? ' — joint: ' + D.visits.joint : '')]);
  rows.push(['Orders logged in the app', D.orders.count, 'orders', 'typed by the team, NOT invoiced sales']);
  rows.push(['Typed value of those orders', D.orders.value, 'KD', 'typed by the team, NOT invoiced sales']);
  rows.push(['Visit-to-order conversion', v(D.conversion.pct), '%', D.conversion.withOrder + ' of ' + D.conversion.visits + ' field visits took an order']);
  rows.push(['Follow-ups due', D.followUps.count, 'clinics', 'as of ' + D.today + ': overdue ' + D.followUps.overdue + ', due today ' + D.followUps.today]);
  // people
  const PR = xdPeopleRows(D);
  rows.push(['']); rows.push(['PEOPLE']);
  rows.push(['Measure', ...PR.by.map(p => p.rep)]);
  PR.rows.forEach(r => rows.push([r.label + (r.kd ? ' (KD)' : r.pct || r.k === 'growth' ? ' (%)' : ''), ...PR.by.map(p => v(r.v(p)))]));
  // customers, as filtered on screen
  const acc = D.customers.accounts, list = xdCustList(D), filt = [];
  if(_xdCls !== 'all' && xdClsKeys(D).length) filt.push('class ' + (_xdCls === 'none' ? 'none' : _xdCls));
  if(_xdQ.trim()) filt.push('search "' + _xdQ.trim() + '"');
  rows.push(['']); rows.push(['CUSTOMERS' + (filt.length ? ' — ' + filt.join(', ') + ': ' + list.length + ' of ' + acc.length : ' — ' + acc.length)]);
  rows.push(['Customer', 'Class', 'Counted for', 'Invoices', 'Last invoice', 'Invoiced (KD)', 'Kind']);
  list.forEach(x => { const a = x.a, c = xdAccCls(a); rows.push([a.name, c == null ? '' : c, (a.reps || []).join(' + '), a.invoices, a.last || '', a.net, a.channel ? 'online / channel' : a.clinicId ? 'clinic' : 'not linked']); });
  rows.push(['Subtotal of the rows', '', '', '', '', xdSumCents(list, x => x.a.net) / 100, '']);
  rows.push(['Accounts set to ignore (not listed)', '', '', '', '', D.customers.totals.ignored, '']);
  // brands
  rows.push(['']); rows.push(['BRANDS']);
  rows.push(['Brand', 'Sold (KD)', 'Target (KD)', 'Achievement (%)']);
  D.byBrand.rows.forEach(b => rows.push([xdBrand(b.brand), v(b.net), v(b.target), v(b.pct)]));
  if(D.byBrand.total != null) rows.push(['All brands', D.byBrand.total, '', '']);
  // products, as filtered on screen
  const pl = xdProdList(D);
  rows.push(['']); rows.push(['PRODUCTS' + (_xdPQ.trim() ? ' — search "' + _xdPQ.trim() + '": ' + pl.length + ' of ' + D.byProduct.rows.length : ' — ' + D.byProduct.rows.length)]);
  rows.push(['Product', 'Brand', 'Units', 'Invoices', 'Invoiced (KD)']);
  pl.forEach(x => rows.push([x.p.name, xdBrand(x.p.brand), x.p.qty, x.p.invoices, x.p.net]));
  // the year so far
  rows.push(['']); rows.push(['YEAR SO FAR ' + Y.year]);
  rows.push(['Month', 'Invoiced (KD)', 'Target (KD)', 'Achievement (%)', 'Note']);
  Y.months.forEach(m => rows.push([m.month, v(m.sales), v(m.target), m.likeTarget > 0 ? Math.round(m.likeSales / m.likeTarget * 100) : '', m.sales == null ? 'no sales file' : '']));
  rows.push(['Total', v(Y.sales), v(Y.target), v(Y.like.pct), 'the % counts only months and people with both a figure and a target']);
  // INTEGRATION(core): D.daily
  if(D.daily && D.daily.measured && Array.isArray(D.daily.days)){
    rows.push(['']); rows.push(['THE MONTH DAY BY DAY']); rows.push(['Day', 'Invoiced that day (KD)', 'So far (KD)']);
    let c = 0; D.daily.days.forEach(d => { c += xdCents(d.net); rows.push([d.date, d.net, c / 100]); });
  }
  // customers to act on
  const a = D.act;
  rows.push(['']); rows.push(['CUSTOMERS TO ACT ON' + (a && a.measurable ? ' — days 1 to ' + a.day + ' against the same days of ' + (a.prior.map(p => p.month).join(', ') || 'no earlier month') : ' — not judged: no sales figure for this month')]);
  if(a && a.measurable){
    rows.push(['Under-performing: bought in at least 2 of those months, and this month under half of its average for the same days']);
    rows.push(['Customer', 'Class', 'Owner', 'This month (KD)', 'Its average (KD)', 'Gap (KD)', 'Months it bought in']);
    a.under.forEach(x => rows.push([x.name, x.cls || '', x.owner, x.current, x.average, x.gap, x.bought + ' of ' + x.months]));
    rows.push(['High potential: an open A or B clinic with no invoice this month, and invoices in at most one of those months']);
    rows.push(['Clinic', 'Class', 'Owner', 'Last field visit', 'Months it bought in']);
    a.potential.forEach(x => rows.push([x.name, x.cls || '', x.rep, x.lastVisit || 'never visited', x.bought + ' of ' + x.months]));
  }
  // INTEGRATION(core): D.activity lists
  if(D.activity && typeof D.activity === 'object' && D.activity.measurable){
    rows.push(['']); rows.push(['CUSTOMER ACTIVITY']);
    rows.push(['Visited, no invoice']); rows.push(['Clinic', 'Class', 'Owner', 'Last field visit']);
    (D.activity.visitedNoInvoice || []).forEach(x => rows.push([x.name, x.cls || '', x.rep || '', x.lastVisit || '']));
    rows.push(['Invoiced, no visit']); rows.push(['Clinic', 'Class', 'Owner', 'Invoiced (KD)']);
    (D.activity.invoicedNoVisit || []).forEach(x => rows.push([x.name, x.cls || '', x.rep || '', x.net]));
  }
  rows.push(['']); rows.push(['NEW CUSTOMERS' + (NC.measurable ? ' — ' + NC.count : ' — not measurable')]);
  if(NC.measurable){ rows.push(['Account', 'Counted for', 'First invoice', 'Invoiced (KD)']); NC.list.forEach(x => rows.push([x.name, x.rep || '', x.date, x.net])); }
  rows.push(['']); rows.push(['FOLLOW-UPS DUE — as of ' + D.today + ': ' + D.followUps.count]);
  rows.push(['Clinic', 'Owner', 'Due', 'State']);
  D.followUps.list.forEach(x => rows.push([x.name, x.rep || '', x.date, x.overdue ? 'overdue' : 'due today']));
  rows.push(['']);
  rows.push(['Invoiced sales come from the ERP sales files only; targets from the DSR; visits and orders are as logged in the app and are not sales. An empty cell means not measured.']);
  return rows;
}
function xdExport(){
  if(!_xdD || !currentUser || currentUser.role !== 'supervisor') return;
  const D = _xdD, name = 'ultramed-dashboard-' + D.month + (D.rep ? '-' + D.rep.replace(/[^\w؀-ۿ-]+/g, '_') : '') + (D.brand ? '-' + D.brand.replace(/[^\w؀-ۿ-]+/g, '_') : '') + '.xlsx';
  const ok = downloadXlsx(name, xdExportRows(), 'Dashboard');
  showToast(xdW(ok === false ? 'The Excel file could not be made on this device' : 'Downloading the dashboard as Excel'));
}
