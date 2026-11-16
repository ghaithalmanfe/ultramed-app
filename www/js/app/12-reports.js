// reports, AI assistant, comparison, team chat, motivation, charts, scorecards, email → tasks
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- REPORTS ----
function setReportRange(days){
  reportRange = days;
  reportCustom = null;
  document.getElementById('repCustomRow').style.display = 'none';
  document.getElementById('repWeek').classList.toggle('on', days===7);
  document.getElementById('repMonth').classList.toggle('on', days===30);
  document.getElementById('repQuarter').classList.toggle('on', days===90);
  document.getElementById('repAll').classList.toggle('on', days===9999);
  document.getElementById('repCustom').classList.remove('on');
  renderReports();
}
function toggleReportCustom(){
  const row = document.getElementById('repCustomRow');
  const show = row.style.display === 'none';
  row.style.display = show ? 'block' : 'none';
  if(show && !document.getElementById('repFrom').value){
    const d = new Date(); d.setDate(d.getDate()-30);
    document.getElementById('repFrom').value = localDateStr(d);
    document.getElementById('repTo').value = todayStr();
  }
}
function applyReportCustomRange(){
  const from = document.getElementById('repFrom').value;
  const to = document.getElementById('repTo').value;
  if(!from || !to){ showToast('Pick both dates'); return; }
  if(from > to){ showToast('"From" must be before "To"'); return; }
  reportCustom = {from, to};
  ['repWeek','repMonth','repQuarter','repAll'].forEach(id=>document.getElementById(id).classList.remove('on'));
  document.getElementById('repCustom').classList.add('on');
  renderReports();
  showToast(`Showing ${fmtDate(from)} – ${fmtDate(to)}`);
}
// Called from the calendar's range summary: jump to Reports pre-filtered to the same dates.
function openReportForRange(from, to){
  document.getElementById('repFrom').value = from;
  document.getElementById('repTo').value = to;
  document.getElementById('repCustomRow').style.display = 'block';
  switchView('reports');
  applyReportCustomRange();
}
// ---- AI ASSISTANT: not available (v123) ----
// It went through a small function on the old Netlify site, which the team no
// longer uses (its address answers "site not found"), and every question sent
// that address the team's clinics, phones, doctors, visit notes, tasks, events,
// both reps' targets and the catalog. Nothing is sent anywhere now: the ✨
// button and the More tile are gone, and anything still linking here says it
// is not available. A future assistant must check the signed-in user first.
function openAssistant(){
  showModal(`
    <h3 style="margin-top:0;">${I('sparkles')} Assistant</h3>
    <p style="font-size:13.5px; line-height:1.6;">The assistant is not available in this version of the app. Nothing is sent from this screen.</p>
    <button class="btn" onclick="closeModal()">OK</button>`);
}

// ---- PERIOD COMPARISON ----
function openCompare(){
  const repOpts = currentUser.role==='supervisor'
    ? ['all', ...REPS].map(r=>`<option value="${esc(r)}">${r==='all'?'Whole team':esc(r)}</option>`).join('')
    : `<option value="${esc(currentUser.name)}">${esc(currentUser.name)}</option>`;
  showModal(`
    <h3 style="margin-top:0;">Compare two periods</h3>
    <div class="chip-row" style="margin-bottom:10px;">
      <div class="chip small" onclick="cmpPreset('month')">This vs last month</div>
      <div class="chip small" onclick="cmpPreset('week')">This vs last week</div>
      <div class="chip small" onclick="cmpPreset('quarter')">Last 90 vs previous 90</div>
    </div>
    <label>Who</label>
    <select id="cmpRep">${repOpts}</select>
    <div style="font-weight:700; font-size:13px; margin:12px 0 4px; color:var(--green);">Period A</div>
    <div style="display:flex; gap:10px;">
      <div style="flex:1;"><label style="font-size:12px;">From</label><input type="date" id="cmpAF"></div>
      <div style="flex:1;"><label style="font-size:12px;">To</label><input type="date" id="cmpAT"></div>
    </div>
    <div style="font-weight:700; font-size:13px; margin:12px 0 4px; color:var(--muted);">Period B (to compare against)</div>
    <div style="display:flex; gap:10px;">
      <div style="flex:1;"><label style="font-size:12px;">From</label><input type="date" id="cmpBF"></div>
      <div style="flex:1;"><label style="font-size:12px;">To</label><input type="date" id="cmpBT"></div>
    </div>
    <button class="btn" style="margin-top:12px;" onclick="renderCompare()">Compare</button>
    <div id="cmpResult"></div>
  `);
  cmpPreset('month');
}
function cmpPreset(kind){
  const today = todayStr();
  let aF, aT, bF, bT;
  if(kind==='month'){
    const m = getMonthDates(today); aF=m[0]; aT=m[m.length-1];
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1);
    const pm = getMonthDates(localDateStr(d)); bF=pm[0]; bT=pm[pm.length-1];
  } else if(kind==='week'){
    const w = getWeekDates(today); aF=w[0]; aT=w[6];
    const d = new Date(w[0]+'T00:00:00'); d.setDate(d.getDate()-7);
    const pw = getWeekDates(localDateStr(d)); bF=pw[0]; bT=pw[6];
  } else {
    const d = new Date(); aT=today;
    d.setDate(d.getDate()-89); aF=localDateStr(d);
    const e = new Date(aF+'T00:00:00'); e.setDate(e.getDate()-1); bT=localDateStr(e);
    const s = new Date(e); s.setDate(s.getDate()-89); bF=localDateStr(s);
  }
  document.getElementById('cmpAF').value=aF; document.getElementById('cmpAT').value=aT;
  document.getElementById('cmpBF').value=bF; document.getElementById('cmpBT').value=bT;
  renderCompare();
}
function renderCompare(){
  const aF=document.getElementById('cmpAF').value, aT=document.getElementById('cmpAT').value;
  const bF=document.getElementById('cmpBF').value, bT=document.getElementById('cmpBT').value;
  const rep=document.getElementById('cmpRep').value;
  const el=document.getElementById('cmpResult');
  if(!aF||!aT||!bF||!bT){ showToast('Fill in all four dates'); return; }
  const data = {visits, clinics, tasks, events, dayPlans};
  const A = UMCore.rangeSummary(aF, aT, rep, data);
  const B = UMCore.rangeSummary(bF, bT, rep, data);
  const fmtRow = (label, a, b, isMoney) => {
    const d = UMCore.pctDelta(a, b);
    const arrow = d>0 ? `<span style="color:var(--sage-ink); font-weight:700;">▲ +${d}%</span>`
      : d<0 ? `<span style="color:var(--coral-ink); font-weight:700;">▼ ${d}%</span>`
      : `<span style="color:var(--muted);">—</span>`;
    const show = v => isMoney ? money(v) : v;
    return `<div style="display:grid; grid-template-columns:1.2fr 1fr 1fr .8fr; gap:6px; padding:8px 0; border-bottom:1px solid var(--line); font-size:12.5px; align-items:center;">
      <span style="font-weight:600;">${label}</span><span>${show(a)}</span><span style="color:var(--muted);">${show(b)}</span><span style="text-align:start;">${arrow}</span>
    </div>`;
  };
  el.innerHTML = `
    <div style="display:grid; grid-template-columns:1.2fr 1fr 1fr .8fr; gap:6px; padding:10px 0 6px; font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase;">
      <span></span><span>${fmtDate(aF)}–${fmtDate(aT)}</span><span>${fmtDate(bF)}–${fmtDate(bT)}</span><span>Change</span>
    </div>
    ${fmtRow('Visits', A.fieldVisits, B.fieldVisits)}
    ${fmtRow('Contacts', A.contacts, B.contacts)}
    ${fmtRow('Calls', A.calls, B.calls)}
    ${fmtRow('Orders', A.orders, B.orders)}
    ${fmtRow('Orders logged in the app', A.revenue, B.revenue, true)}
    ${fmtRow('Conversion %', A.conversion, B.conversion)}
    ${fmtRow('Clinics covered', A.clinicsCovered, B.clinicsCovered)}
    ${fmtRow('Events', A.events, B.events)}`;
}
function reportVisitsBase(){
  const b = reportRangeBounds(); // whole days, inclusive — no time-of-day drift, no dropped first day
  return UMCore.filterVisitsByRange(visits, b.from, b.to);
}
// One home for every way a report can leave the system.
function openReportTools(){
  showModal(`
    <h3 style="margin-top:0;">${I('share')} Export &amp; share</h3>
    <div style="color:var(--muted); font-size:12.5px; margin-bottom:10px;">Uses the period and rep selected on the Report tab.</div>
    <label>Language / اللغة</label>
    <div class="chip-row" style="margin-bottom:8px;">
      <div class="chip small ${reportLang==='en'?'on':''}" onclick="reportLang='en'; openReportTools()">English</div>
      <div class="chip small ${reportLang==='ar'?'on':''}" onclick="reportLang='ar'; openReportTools()">العربية</div>
    </div>
    <label>Format</label>
    <div class="chip-row" style="margin-bottom:12px;">
      <div class="chip small ${reportFormat==='full'?'on':''}" onclick="reportFormat='full'; openReportTools()">Full report · كامل</div>
      <div class="chip small ${reportFormat==='summary'?'on':''}" onclick="reportFormat='summary'; openReportTools()">One-pager · صفحة واحدة</div>
    </div>
    <button class="btn" onclick="closeModal(); shareReportFile()">${I('share')} Share (WhatsApp / email)</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal(); downloadReportPdf()">${I('download')} Save as PDF</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal(); downloadReportFile()">${I('globe')} Save as HTML (opens in any browser)</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal(); showProReport()">${I('eye')} View on screen / print</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal(); copyReport()">${I('clipboard')} Copy as text</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal(); openExport()">${I('database')} Data exports &amp; backups (CSV)</button>
  `);
}
function reportRangeBounds(){
  if(reportCustom) return {from: reportCustom.from, to: reportCustom.to};
  if(reportRange===9999) return {from: null, to: null};
  // "7 days" = today and the 6 days before it (whole days, inclusive)
  const d = new Date(todayStr()+'T00:00:00'); d.setDate(d.getDate()-(reportRange-1));
  return {from: UMCore.localDateStr(d), to: todayStr()};
}
// mtd (optional): the month's lines of everyone, worked out once by the Report's draw (renderReports, v126 speed)
function renderCoach(mtd){
  const el = document.getElementById('coachCard');
  if(!el) return;
  const b = reportRangeBounds();
  mtd = mtd || erpMtdMap();
  const insights = UMCore.coachInsights({ erpMtd: mtd,
    from: b.from, to: b.to, today: todayStr(), repFilter: reportRepFilter,
    visits, clinics, targets: blendedTargets(mtd), dayPlans,
  });
  const styles = {
    act:   {c:'var(--coral)',  ink:'var(--coral-ink)', label:'DO NOW'},
    watch: {c:'var(--amber)',  ink:'var(--amber-ink)', label:'WATCH'},
    good:  {c:'var(--sage)',   ink:'var(--sage-ink)',  label:'WORKING'},
  };
  el.innerHTML = `<div class="coach-card"><img class="coach-robot" src="img/robot.svg" alt="" width="96" height="110"><div class="coach-list">` + insights.map(i=>{
    const st = styles[i.level] || styles.watch;
    return `<div class="coach-item lv-${i.level || 'watch'}">
      <div style="display:flex; gap:10px; align-items:baseline;">
        <span style="font-size:17px;">${i.icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13.5px;">${esc(i.title)}
            <span class="coach-tag" style="color:${st.ink};">${st.label}</span></div>
          <div style="font-size:12.5px; color:var(--muted); line-height:1.55; margin-top:3px;">${esc(i.detail)}</div>
        </div>
      </div>
    </div>`;
  }).join('') + `</div></div>`;
}
function renderReports(){
  // the month's lines of everyone, once for the whole screen: the coach, each person's target row and the team's (each
  // of them worked them out again before — about a second on a slower phone with a heavy year, v126 speed)
  const mtd = erpMtdMap();
  renderCoach(mtd);
  let rv = reportVisitsBase();
  if(reportRepFilter !== 'all') rv = rv.filter(v=>v.rep===reportRepFilter);
  document.getElementById('repVisits').textContent = rv.filter(isFieldVisit).length;
  document.getElementById('repContacts').textContent = rv.reduce((s,v)=>s+UMCore.contactCount(v),0);
  document.getElementById('repOrders').textContent = rv.filter(v=>v.orderTaken).length;
  // One authoritative revenue number: ERP invoices when a period covers this
  // range, app-logged otherwise. The other source drops to a small note.
  const loggedRev = rv.reduce((s,v)=>s+(v.orderTotal||0),0);
  const bounds = reportRangeBounds();
  const erpRev = erpRevenueForRange(bounds.from, bounds.to, reportRepFilter);
  document.getElementById('repRevenue').textContent = money(erpRev != null ? erpRev : loggedRev);
  document.getElementById('repRevenueLabel').textContent = erpRev != null ? 'Sales (ERP-verified)' : 'Orders logged in the app';
  const erpRow = document.getElementById('repErpRow');
  if(erpRow){
    erpRow.style.display = erpRev != null ? '' : 'none';
    if(erpRev != null) document.getElementById('repErpRevenue').textContent = `logged in app for the same period: ${money(loggedRev)}`;
  }
  document.getElementById('repDiscount').textContent = money(rv.reduce((s,v)=>s+(v.orderDiscount||0),0));
  document.getElementById('repClinics').textContent = new Set(rv.map(v=>v.clinicId)).size;
  let overdueClinics = clinics.filter(c=>c.cls!=='Closed' && followStatus(c.nextFollowUp)==='overdue');
  if(reportRepFilter !== 'all') overdueClinics = overdueClinics.filter(c=>c.rep===reportRepFilter);
  document.getElementById('repOverdue').textContent = overdueClinics.length;

  const compareTitle = document.getElementById('teamCompareTitle');
  const compareCard = document.getElementById('teamCompareCard');
  if(currentUser.role==='supervisor'){
    compareTitle.style.display='flex'; compareCard.style.display='block';
    const base = reportVisitsBase();
    const cmpBounds = reportRangeBounds();
    const rows = REPS.map(r=>{
      const rvr = base.filter(v=>v.rep===r);
      return {rep:r, visits:rvr.length, revenue:rvr.reduce((s,v)=>s+(v.orderTotal||0),0),
        erp: erpRevenueForRange(cmpBounds.from, cmpBounds.to, r), tgt: targetPct(r, mtd)};
    });
    const anyErp = rows.some(r=>r.erp != null);
    const anyTgt = rows.some(r=>r.tgt != null);
    const rowCls = 'compare-row ' + (anyErp && anyTgt ? 'c5' : (anyErp || anyTgt) ? 'c4' : '');
    const tgtCell = r => anyTgt ? `<div style="font-weight:800; color:${r.tgt?(r.tgt.pct>=100?'var(--sage-ink)':r.tgt.pct>=60?'var(--ink)':'var(--amber-ink)'):'var(--muted)'};">${r.tgt?r.tgt.pct+'%':'—'}</div>` : '';
    const tt0 = rows.length > 1 ? teamTargetTotal(rows.map(r => r.tgt ? { goal: r.tgt.target, ach: r.tgt.amount } : null)) : null;
    const pc = (name, v, logged, erp, tgt, team) => `<div class="cmp-card${team ? ' team' : ''}"><div class="cmp-n">${name}</div><div class="cmp-g">
      <span><span>Visits</span><b>${v}</b></span><span><span>Logged</span><b>${logged}</b></span>${anyErp ? `<span><span>ERP</span><b>${erp}</b></span>` : ''}${anyTgt ? `<span><span>Target</span><b>${tgt}</b></span>` : ''}</div></div>`;
    const phone = `<div class="cmp-cards">${rows.map(r => pc(esc(r.rep), r.visits, money(r.revenue), r.erp != null ? money(r.erp) : '—', r.tgt ? r.tgt.pct + '%' : '—')).join('')}${rows.length > 1
      ? pc('<span>Team</span>', rows.reduce((s2, r) => s2 + r.visits, 0), money(rows.reduce((s2, r) => s2 + r.revenue, 0)), rows.some(r => r.erp != null) ? money(rows.reduce((s2, r) => s2 + (r.erp || 0), 0)) : '—', tt0 && tt0.pct != null ? tt0.pct + '%' : '—', true) : ''}</div>`;
    compareCard.innerHTML = phone + `<div class="cmp-table">
      <div class="${rowCls}" style="margin-bottom:8px;">
        <div class="h">Rep</div><div class="h">Visits</div><div class="h">Logged</div>${anyErp?'<div class="h">ERP</div>':''}${anyTgt?'<div class="h">Target</div>':''}
      </div>
      ${rows.map(r=>`<div class="${rowCls}" style="padding:6px 0; border-top:1px solid var(--line);"><div>${esc(r.rep)}</div><div>${r.visits}</div><div>${money(r.revenue)}</div>${anyErp?`<div>${r.erp!=null?money(r.erp):'—'}</div>`:''}${tgtCell(r)}</div>`).join('')}
      ${rows.length>1?(()=>{ // team line: sums, and the team target % on the same official basis
        const tt = teamTargetTotal(rows.map(r => r.tgt ? { goal: r.tgt.target, ach: r.tgt.amount } : null));
        const erpAny = rows.some(r=>r.erp!=null);
        return `<div class="${rowCls}" style="padding:6px 0; border-top:2px solid var(--ink); font-weight:800;"><div>Team</div><div>${rows.reduce((s,r)=>s+r.visits,0)}</div><div>${money(rows.reduce((s,r)=>s+r.revenue,0))}</div>${anyErp?`<div>${erpAny?money(rows.reduce((s,r)=>s+(r.erp||0),0)):'—'}</div>`:''}${anyTgt?`<div style="color:${tt.pct!=null?pctInk(tt.pct):'var(--muted)'};">${tt.pct!=null?tt.pct+'%':'—'}</div>`:''}</div>`;
      })():''}
    </div>`;
  } else {
    compareTitle.style.display='none'; compareCard.style.display='none';
  }

  const counts = {};
  rv.forEach(v=>(v.products||[]).forEach(pid=>{ counts[pid]=(counts[pid]||0)+1; }));
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const el = document.getElementById('repTopProducts');
  if(top.length===0){
    el.innerHTML = `<div style="color:var(--muted); font-size:13.5px;">No products logged in this range.</div>`;
  } else {
    el.innerHTML = top.map(([pid,count])=>{
      return `<div class="report-line"><span>${esc(productName(pid))}</span><span class="v">${count}</span></div>`;
    }).join('');
  }
  const reasons = {};
  rv.filter(v=>!v.orderTaken && v.noOrderReason).forEach(v=>{ reasons[v.noOrderReason]=(reasons[v.noOrderReason]||0)+1; });
  const rlist = Object.entries(reasons).sort((a,b)=>b[1]-a[1]);
  const noEl = document.getElementById('repNoOrder');
  const totalNo = rv.filter(v=>!v.orderTaken).length;
  if(rlist.length===0){
    noEl.innerHTML = `<div style="color:var(--muted); font-size:13.5px;">${totalNo>0?'No reasons recorded yet for the '+totalNo+' visit(s) without an order.':'Every visit in this range resulted in an order.'}</div>`;
  } else {
    const max = rlist[0][1];
    noEl.innerHTML = rlist.map(([r,c])=>`<div class="bar-row">
      <div class="bar-label"><span>${esc(r)}</span><span>${c}</span></div>
      <div class="bar-track"><div class="bar-fill coral" style="width:${Math.round(c/max*100)}%;"></div></div>
    </div>`).join('');
  }
  renderCharts();
  renderScorecards(mtd);
}




// ---- PHOTOS / CHAT / MEMORIES ----
let chatMsgs = [];
let memories = [];
let visitPhotos = [];      // {id, data} for the visit being logged
let pendingChatPhoto = null;
let teamTab = 'chat';
const PHOTO_MAX = 900;     // px longest edge
const THUMB_MAX = 320;

function pickImage(cb, useCamera){
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  if(useCamera) inp.capture='environment';
  inp.onchange = async ()=>{
    const f = inp.files && inp.files[0];
    if(!f) return;
    showToast('\u{1F5BC} Processing photo...');
    try{
      // Firestore caps a document at 1MB; base64 adds ~33% over the binary
      // size, so keep re-compressing smaller/lower-quality until it clears
      // a safe margin instead of only discovering the failure on save.
      const attempts = [[PHOTO_MAX,0.72],[700,0.6],[500,0.5],[380,0.4]];
      let full;
      for(const [edge,q] of attempts){
        full = await compressImage(f, edge, q);
        if(full.length < 700000) break;
      }
      const thumb = await compressImage(f, THUMB_MAX, 0.6);
      cb({full, thumb});
    }catch(e){ console.error(e); showToast('Could not read that image'); }
  };
  inp.click();
}
function compressImage(file, maxEdge, quality){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onerror = ()=>rej(new Error('read'));
    fr.onload = ()=>{
      const img = new Image();
      img.onerror = ()=>rej(new Error('decode'));
      img.onload = ()=>{
        let {width:w, height:h} = img;
        const scale = Math.min(1, maxEdge/Math.max(w,h));
        w = Math.round(w*scale); h = Math.round(h*scale);
        const c = document.createElement('canvas');
        c.width=w; c.height=h;
        const ctx=c.getContext('2d');
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        res(c.toDataURL('image/jpeg', quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
// ---- Photos waiting to upload (v122) ----
// A full photo goes to its own cloud document (photo:<id>); the visit keeps
// its thumbnail inline. Saving a visit used to wait for every upload: with no
// signal it never finished, and the visit was in no list, on no phone and in
// no queue. Now the visit is saved first, its photos marked "waiting to
// upload" (pending), and each full photo is kept on this phone until the
// cloud holds it — IndexedDB (room for photos, apart from the small web
// storage the app's copies and queue share), else that web storage, else (a
// full phone) the app's memory only, which the visit and the toast say. The
// uploads run in the background; the queue's flush (so every 20-second
// refresh) retries them. One that lands: the phone lets go of its copy (the
// cloud holds the full photo) and the visit's mark is settled — that mark
// only, in the cloud document holding the visit (settlePhotos).
let PHOTO_UP_MS = 20000;       // how long a screen waits for one upload before it says so (the write itself goes on)
const PHOTO_LS = 'um_photo:';  // the web-storage fallback, one key per photo
const _photoKept = new Map();  // id → { id, data, visitId, ts, on: 'idb' | 'ls' | 'mem' }: every photo this phone still holds for the cloud
const _photoUp = {};           // id → its upload on the way (one at a time per photo)
const _photoLanded = new Set();  // photos this phone saw land this session: their visits' marks are settled
const _photoChecked = new Set(); // this phone's own waiting photos looked up in the cloud this session
const _photoLost = new Set();    // …found in no store of this phone and not in the cloud: their visits say lost (asked again until that lands)
const _photoGone = new Set();    // photos this phone let go of this session (landed, or removed): never read back from a store whose delete lags
const _photoAskedUnread = new Set(); // own waiting photos the cloud did not have while this phone's stores could not be read: asked again once they are
const _photoSession = new Set(); // photos taken on this phone this session (marked on a visit before they are kept)
let _photoDbP = null, _photoRead = false, _photoRetrying = false, _photoSettling = null, _photoSettleAgain = false, _photoDev = null;
const PHOTO_DB_MS = 5000;      // an IndexedDB open that has not answered by then is taken as "not read" (asked again later)
const PHOTO_STALE_DAYS = 3;    // a photo waiting longer than this on another phone is said with its age (it may never arrive)
// Other tabs or windows of the app on this phone share its stores and its
// mark: one may hold a photo only in its memory (a full phone) while its
// upload is on its way. Asked before a photo is called lost (needs no storage).
const _photoBC = (() => { try{ return typeof BroadcastChannel === 'function' ? new BroadcastChannel('um_photos') : null; }catch(e){ return null; } })();
if(_photoBC) _photoBC.addEventListener('message', e => {
  const m = e && e.data;
  if(m && m.ask != null && (_photoKept.has(m.ask) || _photoUp[m.ask] || _photoSession.has(m.ask))){ try{ _photoBC.postMessage({ have: m.ask }); }catch(x){} }
});
function photoOtherTabHas(id, ms){
  if(!_photoBC) return Promise.resolve(false);
  return new Promise(res => {
    let t = 0;
    const on = e => { if(e && e.data && e.data.have === id) done(true); };
    const done = v => { clearTimeout(t); _photoBC.removeEventListener('message', on); res(v); };
    _photoBC.addEventListener('message', on);
    t = setTimeout(() => done(false), ms || 1000);
    try{ _photoBC.postMessage({ ask: id }); }catch(e){ done(false); }
  });
}
// This phone's mark on the photos it takes: after a restart it knows which
// waiting photos were its own, so one it no longer holds is looked up in the
// cloud — uploaded (the mark goes) or lost (said). The id lives with this
// phone's storage, exactly where its photos are kept.
function photoDevice(){
  if(_photoDev) return _photoDev;
  try{ _photoDev = localStorage.getItem('um_device'); }catch(e){}
  if(!_photoDev){ _photoDev = 'd' + uid(); try{ localStorage.setItem('um_device', _photoDev); }catch(e){} }
  return _photoDev;
}
// The entry a new photo gets on its visit: thumbnail inline, "waiting to
// upload", this phone's mark, and when it was taken (a photo that never
// arrives is said with its age — the phone that took it may be gone).
function photoMark(id, thumb){ _photoSession.add(id); return { id, thumb, pending: true, dev: photoDevice(), at: Date.now() }; }
// This phone's photo store → the database; null: nothing can be kept there —
// this phone has no IndexedDB, or it never opened here (some private modes:
// the web storage keeps the photos); false: it opened on this phone before
// (PHOTO_IDB_SEEN) but not now — an error (a full disk…), a missing store, or
// no answer within PHOTO_DB_MS. False is "not read", never "nothing kept" (a
// photo kept there was called lost on every phone), and it is asked again at
// the next call.
const PHOTO_IDB_SEEN = 'um_idbOk';
function photoDb(){
  if(!_photoDbP){
    let done = false;
    const open = new Promise(res => {
      let rq;
      try{
        if(typeof indexedDB === 'undefined' || !indexedDB) return res(null);
        rq = indexedDB.open('um_photos', 1);
      }catch(e){ return res(null); } // refused outright (some private modes): no IndexedDB here
      rq.onupgradeneeded = () => { try{ rq.result.createObjectStore('up', { keyPath: 'id' }); }catch(e){} };
      rq.onsuccess = () => { const db = rq.result; if(done){ try{ db.close(); }catch(e){} return; }
        if(db.objectStoreNames.contains('up')){ try{ localStorage.setItem(PHOTO_IDB_SEEN, '1'); }catch(e){} res(db); } else { db.close(); res(false); } };
      rq.onerror = () => res(false);
    });
    const p = _photoDbP = withTimeout(open, PHOTO_DB_MS).catch(() => false).then(db => {
      done = true;
      if(db !== false) return db;
      if(_photoDbP === p) _photoDbP = null; // asked again next time
      let seen = true; try{ seen = localStorage.getItem(PHOTO_IDB_SEEN) === '1'; }catch(e){}
      return seen ? false : null; // never opened here: nothing was ever kept in it
    });
  }
  return _photoDbP;
}
function photoDbDo(mode, fn){
  return withTimeout(photoDb().then(db => new Promise((res, rej) => {
    if(!db) return rej(new Error('no IndexedDB'));
    const tx = db.transaction('up', mode), rq = fn(tx.objectStore('up'));
    tx.oncomplete = () => res(rq.result);
    tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB'));
  })), 5000);
}
// Keep one photo on this phone until the cloud holds it → where it is kept.
async function photoKeep(rec){
  _photoKept.set(rec.id, rec);
  const row = { id: rec.id, data: rec.data, visitId: rec.visitId || null, ts: rec.ts || Date.now() };
  try{ await photoDbDo('readwrite', st => st.put(row)); return (rec.on = 'idb'); }
  catch(e){
    // no room left: the phone's copy of documents the cloud holds (um_keep, 04-sync.js) gives way to a photo that
    // exists only here — before it would take the offline queue's room in web storage (v126 review)
    if(e && /quota/i.test(String(e.name || '') + ' ' + String(e.message || '')) && await keepClear()){
      try{ await photoDbDo('readwrite', st => st.put(row)); return (rec.on = 'idb'); }catch(e2){}
    }
  }
  if(deviceSet(PHOTO_LS + rec.id, JSON.stringify(row), true)) return (rec.on = 'ls');
  return (rec.on = 'mem');
}
async function photoForget(id){
  _photoKept.delete(id); _photoGone.add(id);
  try{ localStorage.removeItem(PHOTO_LS + id); }catch(e){}
  try{ await photoDbDo('readwrite', st => st.delete(id)); }catch(e){}
}
// What earlier sessions left waiting on this phone (read again until both
// stores answer; a phone with no IndexedDB at all has nothing kept there, one
// whose IndexedDB did not open is not read).
async function photoReadKept(){
  if(_photoRead) return;
  let ok = true;
  const add = on => r => { if(r && r.id != null && r.data && !_photoKept.has(r.id) && !_photoGone.has(r.id)) _photoKept.set(r.id, Object.assign(r, { on })); };
  const db = await photoDb();
  if(db === false) ok = false;
  else if(db){ try{ ((await photoDbDo('readonly', st => st.getAll())) || []).forEach(add('idb')); }catch(e){ ok = false; } }
  try{ Object.keys(localStorage).forEach(k => { if(k.startsWith(PHOTO_LS)) add('ls')(UMCore.safeParse(localStorage.getItem(k), null)); }); }catch(e){ ok = false; }
  _photoRead = ok;
}
// The stores read at start whatever the signal (flushOutbox, 04): with no
// signal the screens said a photo kept here was only on "the phone that took
// it" — this phone. Redrawn when the read added anything.
function photoReadKeptQuiet(){
  if(_photoRead) return;
  const n0 = _photoKept.size;
  photoReadKept().then(() => { if(_photoKept.size !== n0 && typeof renderAll === 'function') renderAll(); }).catch(() => {});
}
// One photo in this phone's stores, read now — another tab or window of the
// app (the same stores) may have kept it after this one read them → its
// record ({id, data, on}), null (in neither store), or undefined (a store did
// not answer: nothing can be said this round).
async function photoFindKept(id){
  if(_photoGone.has(id)) return null;
  const db = await photoDb();
  if(db === false) return undefined;
  if(db){
    try{ const r = await photoDbDo('readonly', st => st.get(id)); if(r && r.data) return Object.assign(r, { on: 'idb' }); }
    catch(e){ return undefined; }
  }
  try{ const r = UMCore.safeParse(localStorage.getItem(PHOTO_LS + id), null); if(r && r.data) return Object.assign(r, { on: 'ls' }); }
  catch(e){ return undefined; }
  return null;
}
// One upload of a full photo. The cloud's client keeps a write it was given
// until it lands (the app open), so the same photo is never sent again while
// one is on its way; when it lands, a photo this phone keeps is settled.
function photoUpload(id, dataUrl){
  if(!_photoUp[id]){
    _photoUp[id] = Promise.resolve().then(() => window.storage.set('photo:'+id, dataUrl, true))
      .then(r => r !== false, e => { console.warn('photo upload', id, (e && e.message) || e); return false; })
      .then(ok => { delete _photoUp[id]; if(ok && _photoKept.has(id)) photoLanded(id).catch(e => console.warn('photo settle', e)); return ok; });
  }
  return _photoUp[id];
}
// An upload a screen waits for: true once the cloud holds it, false on a
// refusal or when it is still on its way after `ms` — never a hang.
async function savePhotoBlob(id, dataUrl, ms){
  try{ return await withTimeout(photoUpload(id, dataUrl), ms || PHOTO_UP_MS); }
  catch(e){ return false; }
}
// A kept photo is in the cloud: the phone lets go of its copy (the cloud
// holds the full photo now) and its visit stops saying "waiting" — that mark
// only (settlePhotos). Saving the whole list here wrote this phone's copy of
// every visit back over the cloud: an edit, a photo added or removed on
// another phone meanwhile was undone (v122 review).
async function photoLanded(id){
  const rec = _photoKept.get(id);
  if(!rec || rec.settling) return;
  rec.up = true; rec.settling = true; // in the cloud: never sent again
  try{
    _photoLanded.add(id);
    if(rec.on === 'mem' && typeof memOnlyPhotoLanded === 'function') memOnlyPhotoLanded(); // the red bar may say "Saved" (04)
    await photoForget(id);
    await settlePhotos();
  } finally { rec.settling = false; }
}
// Retry every photo this phone keeps (from flushOutbox: the queue's flush and
// the 20-second refresh), then settle the marks this phone still owes.
async function retryPhotos(){
  if(_photoRetrying) return;
  _photoRetrying = true;
  try{
    photoDevice(); // the phone's mark exists before its first photo (room is likelier now than when the phone is full)
    await photoReadKept();
    _photoKept.forEach(rec => { if(rec.up) photoLanded(rec.id).catch(e => console.warn('photo settle', e)); else if(rec.data && !_photoUp[rec.id]) photoUpload(rec.id, rec.data); });
  }catch(e){ console.warn('photo retry', e); }
  finally{ _photoRetrying = false; }
  settlePhotos().catch(e => console.warn('photo settle', e));
}
// The marks this phone owes the team, settled in the cloud (one round at a time):
// - a photo that landed here: its visit stops saying "waiting";
// - this phone's own waiting photo that it no longer holds (an earlier
//   session's, not on its way): looked up once — in the cloud, the mark goes
//   (its save did not land, or an older app version put it back); not there,
//   this phone's stores are read again for it (another tab of the app may
//   keep it: then it is sent from here); in neither, the photo was lost
//   before it uploaded (the app closed while it was only in memory) and the
//   visit says so, keeping its small preview. Never a photo still on its way
//   from here, and no verdict while a store does not answer;
// - a verdict whose save did not land is sent again the next round;
// - a month whose revision in the index still has to move (04).
// Other phones' photos are theirs to settle. A phone whose storage was
// cleared has a new mark and never settles its old ones: other phones say
// such a photo's age (photoWaitHTML).
function settlePhotos(){
  if(_photoSettling){ _photoSettleAgain = true; return _photoSettling; }
  _photoSettling = (async () => {
    do { _photoSettleAgain = false; await settlePhotosOnce(); } while(_photoSettleAgain);
  })().finally(() => { _photoSettling = null; });
  return _photoSettling;
}
async function settlePhotosOnce(){
  if(!currentUser || !Array.isArray(visits)) return;
  await photoReadKept().catch(() => {});
  const me = photoDevice(), changes = [], lookups = [];
  visits.forEach(v => (v && Array.isArray(v.photos) ? v.photos : []).forEach(p => {
    if(!p || p.id == null || !(p.pending || p.lost)) return;
    if(_photoLanded.has(p.id)){ changes.push({ visitId: v.id, photoId: p.id, lost: false }); return; }
    if(!p.pending) return; // lost: only a landing changes it
    if(_photoKept.has(p.id) || _photoUp[p.id] || _photoSession.has(p.id)) return; // still on its way from this phone
    if(_photoLost.has(p.id)){ changes.push({ visitId: v.id, photoId: p.id, lost: true }); return; } // its verdict, until that lands
    if(p.dev && p.dev === me && !_photoChecked.has(p.id) && (_photoRead || !_photoAskedUnread.has(p.id)) && lookups.length < 3) lookups.push({ visitId: v.id, photoId: p.id });
  }));
  if(!changes.length && !lookups.length){
    if(typeof visitsIndexOwed === 'function' && visitsIndexOwed() && navigator.onLine) await patchVisitPhotos([]); // a month's revision still to move (04)
    return;
  }
  if(!navigator.onLine) return; // asked again when the signal is back
  for(const c of lookups){
    let r;
    try{ r = await withTimeout(window.storage.get('photo:' + c.photoId, true), 15000); }catch(e){ continue; } // no answer: asked again next round
    if(r && r.value){ _photoChecked.add(c.photoId); _photoLanded.add(c.photoId); changes.push({ visitId: c.visitId, photoId: c.photoId, lost: false }); continue; }
    if(!_photoRead){ _photoAskedUnread.add(c.photoId); continue; } // the stores were not read: no verdict (asked again once they are)
    const held = await photoFindKept(c.photoId); // not in the cloud: is it on this phone after all (another tab)?
    if(held === undefined) continue; // a store did not answer: no verdict this round
    if(held){ _photoChecked.add(c.photoId); if(!_photoKept.has(c.photoId)) _photoKept.set(c.photoId, held); photoUpload(c.photoId, held.data); continue; } // kept here: sent from here
    if(await photoOtherTabHas(c.photoId, 1000)) continue; // another tab holds it or is sending it: asked again next round
    _photoChecked.add(c.photoId);
    _photoLost.add(c.photoId);
    changes.push({ visitId: c.visitId, photoId: c.photoId, lost: true });
  }
  if(!changes.length){
    if(typeof visitsIndexOwed === 'function' && visitsIndexOwed()) await patchVisitPhotos([]); // a month's revision still to move (04) — a look-up that found nothing never holds it back
    return;
  }
  const res = await patchVisitPhotos(changes);
  let moved = 0;
  changes.forEach(c => {
    if(res[c.photoId] !== 'done' && res[c.photoId] !== 'missing') return; // not reached: next round
    const v = (visits || []).find(x => x && x.id === c.visitId);
    const p = v && Array.isArray(v.photos) ? v.photos.find(x => x && x.id === c.photoId) : null;
    if(p && UMCore.settlePhotoMark(p, c.lost)) moved++; // a visit still queued on the phone carries it in its save
  });
  if(!moved) return;
  visitsMirrorSave(visits);
  renderAll();
  const row = document.getElementById('editPhotoRow');
  if(row && row.dataset.visit) renderEditPhotos(row.dataset.visit);
}
// The full photos of a visit: kept on this phone and uploaded in the
// background → 'phone', or 'mem' when one could only be kept in memory.
// { upload: false }: kept now, uploaded by the caller once the visit is saved.
async function keepVisitPhotos(visitId, shots, opts){
  shots.forEach(ph => _photoSession.add(ph.id));
  const where = await Promise.all(shots.map(ph => photoKeep({ id: ph.id, data: ph.full, visitId, ts: Date.now() })));
  if(!(opts && opts.upload === false)) shots.forEach(ph => photoUpload(ph.id, ph.full));
  if(where.includes('mem') && typeof renderMemOnlyBar === 'function') renderMemOnlyBar(); // the red bar names it until it lands (04)
  return where.includes('mem') ? 'mem' : 'phone';
}
function photoPending(id){ return (visits || []).some(v => v && Array.isArray(v.photos) && v.photos.some(p => p && p.id === id && p.pending)); }
// A visit's own entry for a photo ({id, thumb, pending | lost}), or null.
function visitPhotoEntry(id){
  for(const v of (visits || [])) for(const p of ((v && Array.isArray(v.photos)) ? v.photos : [])) if(p && p.id === id) return p;
  return null;
}
// The photos this phone still has to send to the cloud: all it keeps, or only
// those kept in the app's memory (a full phone) — for the red bar and the toasts.
function photosToUpload(memOnly){ let n = 0; _photoKept.forEach(r => { if(r && !r.up && (!memOnly || r.on === 'mem')) n++; }); return n; }
function photosLeftText(n){ return n === 1 ? '1 photo still waiting to upload' : n + ' photos still waiting to upload'; }
const PHOTO_LOST_1 = '⚠️ Photo lost before it uploaded — only this small preview is kept';
// How many whole days a photo has waited (from its mark), 0 when not known.
function photoWaitDays(p){ const at = p && Number(p.at); return at > 0 ? Math.max(0, Math.floor((Date.now() - at) / 86400000)) : 0; }
function photoStaleText(days){ return days + ' days now — it can only come from the phone that took it, if that phone still has it'; }
// Under a visit's thumbnails: what its photos still wait for, said per photo —
// kept on this phone (IndexedDB or the web storage), only in the app's memory,
// or neither (on the phone that took it, or not kept yet) — and the photos
// lost before they uploaded ({lost: true}: only the thumbnail exists).
function photoWaitHTML(v){
  const ps = ((v && v.photos) || []).filter(p => p);
  // this phone knows before its mark's save lands: one it saw land is not
  // waiting, one it found in no store and not in the cloud is lost
  const waiting = ps.filter(p => p.pending && !_photoLanded.has(p.id) && !_photoLost.has(p.id));
  const lost = ps.filter(p => !_photoLanded.has(p.id) && ((p.lost && !p.pending) || (p.pending && _photoLost.has(p.id))));
  const me = photoDevice();
  let out = '';
  if(waiting.length){
    let here = 0, mem = 0, old = 0;
    waiting.forEach(p => { const r = _photoKept.get(p.id); if(!r){ if(p.dev !== me && photoWaitDays(p) >= PHOTO_STALE_DAYS) old = Math.max(old, photoWaitDays(p)); return; } if(r.on === 'idb' || r.on === 'ls') here++; else if(r.on === 'mem' && !r.up) mem++; });
    const n = waiting.length, parts = [(mem ? '⚠️ ' : '⏳ ') + (n === 1 ? 'Photo waiting to upload' : n + ' photos waiting to upload')];
    if(here) parts.push(here === n ? 'kept on this phone' : here + ' kept on this phone');
    if(mem) parts.push(mem === n ? "only in the app's memory — keep the app open" : mem + " only in the app's memory — keep the app open");
    // another phone's photo, not here for days: it can only come from the
    // phone that took it — which may no longer have it (its data cleared, the
    // phone replaced). Never said of this phone's own: it holds it, sends it or settles it.
    if(old) parts.push(photoStaleText(old));
    out += `<div class="photo-wait" style="font-size:12px; color:var(${mem ? '--coral-ink' : '--amber-ink'}); margin-top:4px;">${esc(parts.join(' · '))}</div>`;
  }
  if(lost.length){
    const txt = lost.length === 1 ? PHOTO_LOST_1 : '⚠️ ' + lost.length + ' photos lost before they uploaded — only their small previews are kept';
    out += `<div class="photo-lost" style="font-size:12px; color:var(--coral-ink); margin-top:4px;">${esc(txt)}</div>`;
  }
  return out;
}
async function loadPhotoBlob(id){
  try{ const r = await window.storage.get('photo:'+id, true); return r? r.value : null; }
  catch(e){ return null; }
}

// ---------- visit photos ----------
function renderVisitPhotos(){
  const el = document.getElementById('visitPhotoRow');
  el.innerHTML = visitPhotos.map(p=>`<div class="ph-wrap">
      <img class="photo-thumb" src="${p.thumb}" onclick="showLightbox('${p.id}','Visit photo')">
      <button class="ph-del" onclick="removeVisitPhoto('${p.id}')">&times;</button>
    </div>`).join('') +
    `<div class="photo-add" onclick="addVisitPhoto()">\u{1F4F7}<span>ADD</span></div>`;
}
function addVisitPhoto(){
  pickImage(({full,thumb})=>{
    visitPhotos.push({id:uid(), full, thumb});
    renderVisitPhotos();
    if(typeof lvPaint === 'function') lvPaint();
    showToast('\u{1F4F8} Photo added');
  }, true);
}
function removeVisitPhoto(id){ visitPhotos = visitPhotos.filter(p=>p.id!==id); renderVisitPhotos(); }

// ---------- lightbox ----------
let _lbRun = 0; // the tap the lightbox shows: a slow read for an earlier tap never replaces it
// The line under the caption (v122): what the picture is when it is not the full photo.
function lbNote(txt){
  let el = document.getElementById('lbNote');
  if(!el && txt){
    el = document.createElement('div'); el.id = 'lbNote'; el.className = 'lbcap'; el.setAttribute('data-notr', '');
    el.style.cssText = 'margin-top:8px; font-size:13px; color:#FFD27A;';
    (document.querySelector('#lightbox .lb-frame') || document.getElementById('lightbox')).appendChild(el);   // inside the photo's frame
  }
  if(!el) return;
  el.textContent = txt ? (trOf(txt) || txt) : '';
  el.style.display = txt ? '' : 'none';
}
async function showLightbox(photoId, cap, direct){
  const run = ++_lbRun;
  const lb=document.getElementById('lightbox'), img = document.getElementById('lbImg');
  document.getElementById('lbCap').textContent = cap||'';
  img.src = direct || '';
  img.style.cssText = ''; lbNote(null);
  lb.classList.add('show');
  if(!direct){
    const local = visitPhotos.find(p=>p.id===photoId);
    if(!local && !_photoKept.has(photoId) && photoPending(photoId)) await photoReadKept().catch(()=>{}); // kept by an earlier session, not read yet
    const kept = _photoKept.get(photoId); // still waiting to upload: this phone's copy
    // the cloud is asked even while the visit says waiting: its mark can be late
    const data = local ? local.full : (kept && kept.data) ? kept.data : await loadPhotoBlob(photoId);
    if(run !== _lbRun) return; // another photo was tapped meanwhile
    if(data){ img.src = data; return; }
    // No full photo on this phone or in the cloud (v122): a visit photo still
    // waiting to upload on the phone that took it, or lost before it did —
    // its thumbnail, enlarged, said for what it is (never an empty frame).
    const ph = visitPhotoEntry(photoId);
    if(ph && ph.thumb && (ph.pending || ph.lost)){
      img.src = ph.thumb;
      img.style.cssText = 'width:min(100%, 520px); height:auto; object-fit:contain;';
      const own = ph.dev && ph.dev === photoDevice();
      const days = ph.pending && !own ? photoWaitDays(ph) : 0;
      lbNote(ph.pending && _photoLanded.has(photoId) ? '⏳ The full photo is in the cloud — it shows when this phone is connected; this is its small preview'
        : (!ph.pending || _photoLost.has(photoId)) ? PHOTO_LOST_1 : days >= PHOTO_STALE_DAYS
        ? '⏳ The full photo has not arrived in ' + days + ' days — it can only come from the phone that took it, if that phone still has it. This is its small preview'
        : '⏳ The full photo is still waiting to upload from the phone that took it — this is its small preview');
    }
  }
}
function closeLightbox(e, force){
  if(force || e.target.id==='lightbox') document.getElementById('lightbox').classList.remove('show');
}

// ---------- team data ----------
// Saves vs the refresh (v122). loadTeam — the 20-second refresh, opening the
// Team tab, "Refresh messages" — put the list it read over memory. A message
// or memory whose save was still on its way, or queued on this phone, was not
// in that copy: the queue's next upload, built from memory, sent the list
// without it and emptied the queue — gone everywhere, after "Saved on this
// device". Now the rule the other lists follow (v121, _localGen in 04-sync.js),
// per list: every save of chat or memories moves _teamGen[key] and is counted
// in _teamSaving[key] while it runs; a read that began before it moved, or
// ends while one runs, keeps memory and puts it back in the phone's copy (the
// read overwrote it) — the next refresh reads again. A list queued on this
// phone keeps what memory holds, with what the phone's copy adds. These lists
// only grow (nothing in them is edited or deleted): a union loses nothing.
const _teamGen = { chat: 0, memories: 0 }, _teamSaving = { chat: 0, memories: 0 };
function teamList(key){ const map={chat:chatMsgs, memories:memories}; return map[key]; } // the team's lists by cloud key, as they are now
function setTeamList(key, v){ if(key === 'chat') chatMsgs = v; else memories = v; }
// a ∪ b by id, ONE entry per id from both lists (the first copy kept, a's before b's; an entry of a
// without an id kept as it is), oldest first, the chat's last 300 — the merge persistTeam makes with
// the cloud, and every read. v121 could store a memory several times under one id (Share tapped again
// while its photo hung): only b's copies were dropped, so every phone showed it three times, the
// achievements counted it three times, and every save wrote the copies back.
function teamMerge(key, a, b){
  let v = [];
  const have = new Set();
  (Array.isArray(a) ? a : []).forEach(x => { if(x && x.id != null){ if(have.has(x.id)) return; have.add(x.id); } v.push(x); });
  (Array.isArray(b) ? b : []).forEach(x => { if(x && x.id != null && !have.has(x.id)){ v.push(x); have.add(x.id); } });
  v.sort((x, y) => ((x && x.ts) || 0) - ((y && y.ts) || 0));
  if(key === 'chat' && v.length > 300) v = v.slice(-300);
  return v;
}
// ---- When chat and memories are read (v126 speed) ----
// They were downloaded at every start (before the screen was drawn) and every
// 20-second round: about 1 MB a time on a heavy year, more than every other
// list together. Now: every refresh while their screen (Team) is open, at once
// when it opens and on "Refresh messages", and otherwise once every
// TEAM_PACE_MS since the last real read (um_teamReadAt, kept on the phone across
// starts) — never at a start, which draws this phone's copy of the last read
// (teamFromPhone; a list this phone never read is read just after the first
// paint). Nothing waits for them. What the screens say stays true: a list never
// read here and still empty says it is loading (never "Start the conversation"),
// and "Refresh messages" still says "Up to date" only after a real read.
const TEAM_PACE_MS = 15 * 60000;
const TEAM_READ_AT = 'um_teamReadAt';
const _teamFrom = {};   // key → 'phone' (this phone's copy of the last read) | 'cloud' (read this session) | 'tried' (a read answered from neither)
const _teamShown = {};  // key → { text, ref }: the cloud's text the list on screen was taken from (the same read again keeps it)
function teamReadAt(key){ try{ const o = JSON.parse(localStorage.getItem(TEAM_READ_AT) || '{}'); return +(o && o[key]) || 0; }catch(e){ return 0; } }
function teamReadNow(key){ try{ const o = JSON.parse(localStorage.getItem(TEAM_READ_AT) || '{}') || {}; o[key] = Date.now(); localStorage.setItem(TEAM_READ_AT, JSON.stringify(o)); }catch(e){} }
// The lists the screens show until a read this session: this phone's copy of the last one (once per session; memory
// that already holds a list — a sign-in after another — keeps it).
function teamFromPhone(){
  ['chat', 'memories'].forEach(key => {
    if(_teamFrom[key]) return;
    if(teamList(key).length){ _teamFrom[key] = 'phone'; return; }
    const a = UMCore.safeParse(mirrorGet(key), null);
    // no copy on this phone (never read here, or it did not fit: a full phone): unknown until a read — read just after the
    // first paint (teamDue), its screens say it is loading meanwhile
    if(Array.isArray(a)){ setTeamList(key, teamMerge(key, a, null)); _teamFrom[key] = 'phone'; }
  });
}
// The lists a refresh reads: both while the Team screen is open; at a start only a list this phone never read (just
// after the first paint, never waited for); otherwise those whose last real read is TEAM_PACE_MS old.
function teamDue(boot){
  const keys = ['chat', 'memories'];
  if(typeof activeView !== 'undefined' && activeView === 'team') return keys;
  if(boot) return keys.filter(k => !_teamFrom[k]);
  const now = Date.now();
  return keys.filter(k => { const t = teamReadAt(k); return !t || Math.abs(now - t) >= TEAM_PACE_MS; });
}
// A refresh's read of them is in (loadAllNow): drawn where they show, only if it changed what memory holds.
function teamRead(before){
  const chatNew = chatMsgs !== before.chat, memNew = memories !== before.memories;
  if(!chatNew && !memNew) return;
  if(typeof activeView !== 'undefined' && activeView === 'team'){ if(teamTab === 'mem'){ if(memNew) renderMemories(); } else if(chatNew) renderChat(); }
  if(memNew && typeof activeView !== 'undefined' && activeView === 'today' && !_msHeld) renderBadges(); // the Memory Maker badge counts them (a home frame kept whole meanwhile: its swap draws them)
}
// keys: the lists to read (both when left out).
async function loadTeam(keys){
  // each list is taken (or kept) the moment its own read is back: nothing runs between
  // cloudGet writing the phone's copy and that copy being put back
  // how: key → about THIS read only — 'cloud' (read from the cloud: the list now in memory) | 'queued' (a change of
  // this phone's waits in the queue: what the phone has) | 'kept' (a save of the list ran while it read: the read was
  // set aside, the list stays as this phone has it) | 'phone' (no answer from the cloud: what the phone has)
  const how = {};
  await Promise.all((keys || ['chat', 'memories']).map(async key => {
    const gen0 = _teamGen[key];
    // The read flags are session-wide and only loadAll cleared them: after one read answered from the phone, a
    // later one that worked still said "No connection" (v122 review). They describe the latest read now — cloudGet
    // sets them again when it answers from the phone or not at all — and src says what THIS call got (another read
    // of the list can change them meanwhile). No save of these lists reads them: persistTeamNow merges with the
    // cloud's copy by union, in one transaction (and the daily backup holds neither list).
    delete _mirrorUsed[key]; delete _loadFailed[key];
    const src = {};
    const r = await cloudGet(key, src).catch(() => null);
    how[key] = src.cloud && !(r == null && !navigator.onLine) ? 'cloud' : 'phone';
    if(how[key] === 'cloud'){ teamReadNow(key); _teamFrom[key] = 'cloud'; } else if(!_teamFrom[key]) _teamFrom[key] = 'tried';
    try{
      const mine = teamList(key);
      if(_teamGen[key] !== gen0 || _teamSaving[key] > 0){
        console.warn(key + ': a save ran while the refresh read — the list on screen is kept');
        mirrorSave(key, JSON.stringify(teamMerge(key, mine, UMCore.safeParse(mirrorGet(key), null))));
        how[key] = 'kept'; // "Refresh messages" reads it again once that save is over (it said "Up to date" here)
        delete _teamShown[key];
        return;
      }
      // v126 speed: the very text the list on screen was taken from, nothing of this phone's waiting: kept as it is
      const txt = r && typeof r.value === 'string' ? r.value : null, sh = _teamShown[key];
      if(how[key] === 'cloud' && !outboxHas(key) && sh && sh.text === txt && sh.ref === mine) return;
      const read = UMCore.safeParse(r && r.value, null);
      const got = Array.isArray(read) ? read : [];
      if(!outboxHas(key)){ setTeamList(key, teamMerge(key, got, null)); if(how[key] === 'cloud') _teamShown[key] = { text: txt, ref: teamList(key) }; else delete _teamShown[key]; return; } // one entry per id
      delete _teamShown[key];
      how[key] = 'queued'; // the queue as the read came back, not as it began
      const all = teamMerge(key, mine, got); // queued: nothing memory holds is dropped, nor left off the phone's copy
      setTeamList(key, all);
      const gotIds = new Set(got.map(x => x && x.id));
      if(all.some(x => x && !gotIds.has(x.id))) mirrorSave(key, JSON.stringify(all));
    }catch(e){ console.warn('team ' + key, e); how[key] = 'phone'; } // the list on screen is kept
  }));
  return how;
}
// Read → union → write as ONE atomic step (v121): two phones posting at the
// same moment each wrote the whole list back, so the later write dropped the
// other's message — and a read that failed fell through to a blind write.
async function persistTeam(key){
  _teamGen[key]++; _teamSaving[key]++; // a refresh on its way keeps this list (loadTeam)
  try{ return await persistTeamNow(key); }
  finally{ _teamSaving[key]--; _teamGen[key]++; }
}
// Chat and memories are one document each, with a small photo preview on
// every photo message and memory (v123): kept under TEAM_DOC_BYTES by leaving
// out the previews of the OLDEST entries — the entry itself (its words, who,
// when) and its full photo (its own document) stay, and tapping it opens the
// full photo. Never an entry dropped. Still over the cloud's limit: not saved,
// said for what it is (persistNow's saveBlocked), never queued.
const TEAM_DOC_BYTES = 900000;
async function persistTeamNow(key){
  let value = null, seen = new Set(), big = 0; // the merged copy (the catch keeps it on the phone) and every id it was made of
  try{
    const str = await storageUpdate(key, cur => {
      big = 0; // a transaction may run more than once
      const cloud = cur != null ? UMCore.safeParse(cur, null) : null;
      const mine = teamList(key); // as it is now: a message sent since this save began goes too
      seen = new Set(mine.concat(Array.isArray(cloud) ? cloud : []).map(x => x && x.id));
      value = Array.isArray(cloud) ? teamMerge(key, mine, cloud) : mine.slice();
      if(typeof UMCore.trimTeamThumbs === 'function'){
        const t = UMCore.trimTeamThumbs(value, TEAM_DOC_BYTES);
        value = t.list;
        if(!t.fits){ big = UMCore.utf8Len(JSON.stringify(value)); return null; }
      }
      const out = JSON.stringify(value);
      if(!UMCore.fitsBytes(out, DOC_MAX_BYTES)){ big = UMCore.utf8Len(out); return null; }
      return out;
    }, 12000);
    if(big) throw tooLargeError(key, null, big);
    if(str == null) throw new Error(key + ' update failed');
    // Never put back the copy this save took (v122): a message sent while it was on its way (the
    // queue's upload running when she sent one) dropped out of memory, and the next upload, built
    // from memory, lost it. What was added meanwhile stays — on the phone too — and the queue keeps
    // the list until a save carries it.
    const later = teamList(key).filter(x => x && !seen.has(x.id));
    const now = later.length ? teamMerge(key, value, later) : value;
    setTeamList(key, now);
    mirrorSave(key, later.length ? JSON.stringify(now) : str);
    if(!later.length){ if(outboxHas(key)) outboxRemove(key); memOnlyLanded(key); }
    saveUnblocked(key);
    return true;
  }
  catch(e){
    // refused by the rules, or too large for the cloud: never queued as "offline" (v123) —
    // but a refusal on a phone with no access to the team's data (signed out, a sign-in that
    // ended) is kept and queued like a save with no connection (v123 review, accessLost)
    const kind = saveErrKind(e);
    const acc = kind === 'refused' ? await accessCheck() : null;
    const lost = acc === 'lost', unsure = acc === 'unknown'; // unsure: the cloud did not say — kept, tried again (round 3)
    if(kind && !lost && !unsure){ _teamLastFail[key] = saveBlocked(key, kind, e); return false; }
    // queued in memory always (it uploads while the app stays open); on the phone when both fit —
    // everything memory holds, with what this save had merged from the cloud
    let onPhone = false;
    try{
      const mOk = mirrorSave(key, JSON.stringify(teamMerge(key, teamList(key), value)));
      onPhone = outboxAdd(key) && mOk;
    }catch(e2){}
    if(lost) parkSave(key, 'noAccess');
    if(!onPhone){ _memOnly.add(key); renderMemOnlyBar(); }
    updateSyncBadge();
    if(lost || unsure) noAccessToast(onPhone ? (lost ? NO_ACCESS_KEPT : ACCESS_UNKNOWN_KEPT) : '⚠️ Device storage full — kept in memory only: keep the app open until it uploads');
    else offlineToast(onPhone ? '📴 Saved on this device — uploads automatically when back online'
                              : '⚠️ Device storage full — kept in memory only: keep the app open until it uploads');
    return false;
  }
}
const _teamLastFail = {}; // key → the outcome of its last save that could not land (saveMemory says it)
function setTeamTab(t){
  teamTab=t;
  document.getElementById('tabChat').classList.toggle('on', t==='chat');
  document.getElementById('tabMem').classList.toggle('on', t==='mem');
  document.getElementById('teamChat').style.display = t==='chat'?'block':'none';
  document.getElementById('teamMem').style.display = t==='mem'?'block':'none';
  if(t==='mem') renderMemories(); else renderChat();
}
const TEAM_SAVE_WAIT_MS = 5000; // "Refresh messages" waits at most this long for a save of a list it read
async function refreshTeam(){
  const how = (await loadTeam()) || {};
  renderChat(); renderMemories();
  // A save of a list ran while it was read: the read was set aside, the list on screen is this phone's.
  // That list is read once more when its save is over (v122 review: "Up to date" was said with her
  // message only queued, and the newer messages the read brought were not shown).
  const kept = Object.keys(how).filter(k => how[k] === 'kept');
  if(kept.length){
    const t0 = Date.now();
    while(kept.some(k => _teamSaving[k] > 0) && Date.now() - t0 < TEAM_SAVE_WAIT_MS) await new Promise(res => setTimeout(res, 150));
    const again = kept.filter(k => !(_teamSaving[k] > 0)); // one still saving stays 'kept': still uploading
    if(again.length){ Object.assign(how, (await loadTeam(again)) || {}); renderChat(); renderMemories(); }
  }
  // The word says how things are when it is said, not what a read found seconds before (third v122 review:
  // her queued message uploaded while the refresh waited for a memory's save, or a save began and landed
  // during the second read, and the last word was "Yours are still uploading" with nothing of hers saving or
  // queued, just after "Memory shared with the team"). A list whose 'queued' or 'kept' no longer holds,
  // nothing of it saving or queued now, is read once more first. Each list at most once here: a second
  // round only for the other list, had it stopped holding during the first round's read.
  const keys = Object.keys(how);
  const pending = k => _teamSaving[k] > 0 || outboxHas(k);
  const reread = new Set();
  for(let round = 0; round < keys.length; round++){
    const stale = keys.filter(k => !reread.has(k) && (how[k] === 'queued' || how[k] === 'kept') && !pending(k));
    if(!stale.length) break;
    stale.forEach(k => reread.add(k));
    Object.assign(how, (await loadTeam(stale)) || {}); renderChat(); renderMemories();
  }
  // "Still uploading" while something of hers for a list on screen is saving or queued now, or when a change
  // of hers overlapped that list's last read: a save ran while it read ('kept', the read set aside), or it
  // came back queued ('queued' that no longer holds: only another tab of the app can cause that by now).
  // "Up to date" only when every list on screen is the one just read from the cloud (v122: it was said
  // after a failed read too).
  showToast(keys.some(k => pending(k) || how[k] === 'kept' || how[k] === 'queued') ? '📤 Yours are still uploading — showing what this phone has'
          : keys.some(k => how[k] === 'phone') ? '📴 No connection — showing what this phone has'
          : '\u{1F504} Up to date');
}
function fmtWhen(ts){
  const d=new Date(ts), n=new Date();
  const sameDay = d.toDateString()===n.toDateString();
  return sameDay ? d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})
                 : d.toLocaleDateString([], {month:'short',day:'numeric'})+' '+d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}
function renderChat(){
  const el = document.getElementById('chatList');
  if(!chatMsgs.length && !_teamFrom.chat){ el.innerHTML = `<div class="empty">Loading messages…</div>`; return; } // never read on this phone yet (v126 speed)
  if(!chatMsgs.length){
    el.innerHTML = `<div class="empty"><div class="big">\u{1F4AC} Start the conversation</div>Share a win, ask for help, or drop a photo from the road.</div>`;
    return;
  }
  // a day line where the day changes; each message beside its sender's initials (one's own on the end side)
  let lastDay = '';
  el.innerHTML = chatMsgs.slice(-60).map(m=>{
    const me = m.who===currentUser.name;
    const day = m.ts ? localDateStr(new Date(m.ts)) : '';
    let sep = '';
    if(day && day !== lastDay){ lastDay = day; sep = `<div class="chat-day"><span>${day === todayStr() ? 'Today' : esc(new Date(m.ts).toLocaleDateString(uiLocale(), { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>`; }
    const ini = initials(msName(m.who));   // the one rule (UMCore.initials): "Dr. Ghaith" → G
    return `${sep}<div class="msg-row ${me?'me':'them'}"><span class="msg-av" data-notr aria-hidden="true">${esc(ini)}</span><div class="msg ${me?'me':'them'}">
      ${me?'':`<div class="who">${esc(m.who)}</div>`}
      ${m.text?`<div dir="auto">${esc(m.text)}</div>`:''}
      ${m.photoId?(m.thumb?`<img src="${m.thumb}" onclick="showLightbox('${m.photoId}','${esc((m.text||'').replace(/'/g,''))}')">`
        :`<button class="chip small" style="margin-top:4px;" onclick="showLightbox('${m.photoId}','${esc((m.text||'').replace(/'/g,''))}')">📷 <span>Photo — tap to open</span></button>`):''}
      <div class="when">${fmtWhen(m.ts)}</div>
    </div></div>`;
  }).join('');
}
function pickChatPhoto(useCamera){
  pickImage(({full,thumb})=>{
    pendingChatPhoto = {id:uid(), full, thumb};
    document.getElementById('chatPhotoPreview').innerHTML =
      `<div class="ph-wrap" style="margin-bottom:8px;"><img class="photo-thumb" src="${thumb}">
       <button class="ph-del" onclick="clearChatPhoto()">&times;</button></div>`;
  }, !!useCamera);
}
function clearChatPhoto(){ pendingChatPhoto=null; document.getElementById('chatPhotoPreview').innerHTML=''; }
let chatSending = false;
async function sendChat(){
  if(chatSending) return;
  const inp = document.getElementById('chatInput');
  const text = inp.value.trim();
  if(!text && !pendingChatPhoto){ return; }
  chatSending = true;
  const btn = document.getElementById('chatSendBtn');
  if(btn) btn.style.opacity = '.4';
  try{
    const msg = {id:uid(), who:currentUser.name, text, ts:Date.now()};
    const ph = pendingChatPhoto; // as attached when Send was tapped (the preview can be cleared while it uploads)
    if(ph){
      // Gives up after PHOTO_UP_MS (v122: with no signal it never answered and the chat could not send again).
      const ok = await savePhotoBlob(ph.id, ph.full);
      if(!ok){
        // Keep the draft — never silently drop the photo the user attached.
        showToast('⚠️ Photo failed to upload — try again');
        return;
      }
      msg.photoId = ph.id; msg.thumb = ph.thumb;
    }
    chatMsgs.push(msg);
    if(chatMsgs.length>300) chatMsgs = chatMsgs.slice(-300);
    // Clear only what this send took (v122): a photo attached, or words typed, while its
    // photo uploaded are her next message — they were wiped from the draft unsent.
    if(pendingChatPhoto === ph) clearChatPhoto();
    if(inp.value.trim() === text) inp.value = '';
    delete _teamLastFail.chat;
    const sent = await persistTeam('chat');
    if(!sent && _teamLastFail.chat){
      // refused, or the chat too large for the cloud (v123): in no list and never uploading — taken
      // back, and what she wrote goes back in the box (its words were already said on screen)
      chatMsgs = chatMsgs.filter(x => !(x && x.id === msg.id));
      if(!inp.value.trim()) inp.value = text;
      if(ph && !pendingChatPhoto){ pendingChatPhoto = ph; const pv = document.getElementById('chatPhotoPreview'); if(pv) pv.innerHTML = `<div class="ph-wrap" style="margin-bottom:8px;"><img class="photo-thumb" src="${ph.thumb}"><button class="ph-del" onclick="clearChatPhoto()">&times;</button></div>`; }
    }
    renderChat();
    window.scrollTo(0, document.body.scrollHeight);
  } finally {
    chatSending = false;
    if(btn) btn.style.opacity = '';
  }
}

// ---------- memories ----------
function pickMemoryPhoto(){
  pickImage(({full,thumb})=>{
    const pm = {id:uid(), full, thumb};
    showModal(`
      <h3 style="margin-top:0;">\u{1F4F8} Add a memory</h3>
      <img src="${thumb}" style="width:100%; border-radius:14px; margin-bottom:12px;">
      <label>Caption</label>
      <input type="text" id="memCap" placeholder="What's happening here?">
      <label>Tag it</label>
      <div class="chip-row" id="memTags">${['\u{1F3C6} Win','\u{1F697} On the road','\u{1F3E5} Clinic visit','\u{1F91D} Team','\u{1F389} Celebration','\u{1F4E6} Product'].map((t,i)=>`<div class="chip small ${i===0?'on':''}" data-tag="${t}" onclick="pickModalCls(this)">${t}</div>`).join('')}</div>
      <button class="btn" id="memShareBtn" data-mem="${pm.id}" onclick="saveMemory()">Share memory</button>
    `);
    window._pendingMem = pm;
  }, false);
}
// One share per memory at a time: a second tap while its photo uploads stored it
// twice. Another memory shares beside it (v122): one guard for all refused it
// without a word, and the first share, when it finished, cleared and closed
// whatever sheet was open — the second memory was lost while the screen said
// "Memory shared with the team".
const _memSharing = new Set();
// this memory's sheet is the one on screen (she may have closed it and opened another meanwhile)
function memSheetShown(pm){ const b = document.getElementById('memShareBtn'); return !!b && b.dataset.mem === pm.id && document.getElementById('modalBack').classList.contains('show'); }
async function saveMemory(){
  const pm = window._pendingMem;
  if(!pm) return;
  if(_memSharing.has(pm.id)){ showToast('Already sharing this memory…'); return; }
  _memSharing.add(pm.id);
  try{
    const cap = (document.getElementById('memCap').value||'').trim();
    const tagEl = document.querySelector('#memTags .chip.on');
    const ok = await savePhotoBlob(pm.id, pm.full); // gives up after PHOTO_UP_MS: the sheet stays open with the photo
    if(!ok){ showToast('⚠️ Photo failed to upload — try again'); return; }
    if(!memories.some(m => m && m.id === pm.id)) memories.push({id:pm.id, thumb:pm.thumb, cap, tag:tagEl?tagEl.dataset.tag:'', who:currentUser.name, ts:Date.now()});
    delete _teamLastFail.memories;
    const saved = await persistTeam('memories');
    const blocked = !saved && _teamLastFail.memories;
    if(blocked){
      // refused, or too large: in no list and never uploading — taken back, the sheet stays open with the photo
      memories = memories.filter(m => !(m && m.id === pm.id));
      showToast(blocked.denied ? NOT_ALLOWED_MSG : tooLargeText({ key: 'memories' }), 7000);
      return;
    }
    if(window._pendingMem === pm){ window._pendingMem = null; if(memSheetShown(pm)) closeModal(); } // only this memory's sheet
    setTeamTab('mem');
    renderBadges();
    // The real outcome (v122): "shared with the team" was said for a memory only kept on this phone.
    if(saved) showToast('\u{1F4F8} Memory shared with the team');
    else showToast(_memOnly.has('memories') ? "⚠️ This phone's storage is full — this memory is only in the app's memory: keep the app open until it uploads"
                   : _saveParked.get('memories') === 'noAccess' ? NO_ACCESS_KEPT // signed out: kept, it uploads after the next sign-in (v123 review)
                   : '📴 Memory saved on this phone — the team sees it once it uploads, automatically when back online', 4000);
  } finally { _memSharing.delete(pm.id); }
}
function renderMemories(){
  const el = document.getElementById('memGrid');
  if(!memories.length && !_teamFrom.memories){ el.innerHTML = `<div class="empty" style="grid-column:1/-1;">Loading memories…</div>`; return; } // never read on this phone yet (v126 speed)
  if(!memories.length){
    el.innerHTML = `<div class="empty" style="grid-column:1/-1;"><div class="big">\u{1F4F8} No memories yet</div>Every team has a story. Add the first photo.</div>`;
    return;
  }
  el.innerHTML = [...memories].sort((a,b)=>b.ts-a.ts).map(m=>`
    <div class="mcard" onclick="showLightbox('${m.id}','${esc((m.cap||'').replace(/'/g,''))}')">
      ${m.thumb ? `<img src="${m.thumb}" alt="" onerror="this.style.display='none'">` : `<div style="aspect-ratio:1; display:flex; align-items:center; justify-content:center; font-size:12.5px; color:var(--muted);">📷 <span>Photo — tap to open</span></div>`}
      <div class="mmeta">
        <div class="mcap">${m.tag?m.tag+' ':''}${esc(m.cap||'Untitled')}</div>
        <div class="mwho">${esc(m.who)} \u00b7 ${new Date(m.ts).toLocaleDateString([], {month:'short',day:'numeric'})}</div>
      </div>
    </div>`).join('');
}

// ---- MOTIVATION ENGINE ----
const WELCOME_MSGS = [
 {e:'\u{1F31E}',m:"Every clinic you walk into today is a chance you didn't have yesterday."},
 {e:'\u{1F680}',m:"Big results come from ordinary visits done consistently. Let's go."},
 {e:'\u{1F3AF}',m:"You don't have to close every door \u2014 just knock on the right ones."},
 {e:'\u{1F4AA}',m:"The best rep isn't the loudest. It's the one who shows up again."},
 {e:'\u{1F331}',m:"Relationships compound. Today's coffee chat is next quarter's order."},
 {e:'\u2728',m:"Confidence comes from preparation. You know the catalogue \u2014 now go use it."},
 {e:'\u{1F9ED}',m:"A 'no' today is just information. Learn it, log it, move on."},
 {e:'\u{1F525}',m:"Momentum is built one logged visit at a time. Start now."},
 {e:'\u{1F91D}',m:"People buy from people. Be the rep they're glad walked in."},
 {e:'\u{1F4C8}',m:"Small wins stack. Two orders this week beats one perfect pitch."},
 {e:'\u{1F3C6}',m:"You're not selling toothpaste. You're selling better outcomes for patients."},
 {e:'\u{1F4A1}',m:"Ask one more question than you're comfortable asking. That's where deals live."},
 {e:'\u{1F30A}',m:"Consistency beats intensity. Show up, log it, repeat."},
 {e:'\u{1F5FA}',m:"Plan the day before the day plans you."},
 {e:'\u{1F48E}',m:"Your A-class clinics deserve your best hours, not your leftover ones."},
 {e:'\u{1F343}',m:"Follow-ups are where trust is built. Nothing falls through your cracks."},
 {e:'\u26A1',m:"Speed of follow-up is a competitive advantage. Yours is fast."},
 {e:'\u{1F9E0}',m:"Know the doctor before you know the pitch. Check the playbook."},
];
function pickWelcome(){
  let last = -1;
  try{ last = parseInt(localStorage.getItem('um_lastWelcome')); }catch(e){}
  let i = Math.floor(Math.random()*WELCOME_MSGS.length);
  if(WELCOME_MSGS.length>1){ let guard=0; while(i===last && guard++<8) i = Math.floor(Math.random()*WELCOME_MSGS.length); }
  try{ localStorage.setItem('um_lastWelcome', i); }catch(e){}
  return WELCOME_MSGS[i];
}
function renderWelcome(){
  const el = document.getElementById('welcomeCard');
  if(!el) return;
  if(welcomeDismissed){ el.innerHTML=''; return; }
  const w = pickWelcome();
  const hr = new Date().getHours();
  const greet = hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const first = currentUser.name.replace('Dr. ','').split(' ')[0];
  el.innerHTML = `<div class="welcome">
    <button class="wclose" onclick="dismissWelcome()">&times;</button>
    <div class="wemoji">${w.e}</div>
    <div class="wmsg">${greet}, ${esc(first)}.</div>
    <div class="wsub">${esc(w.m)}</div>
  </div>`;
}
function dismissWelcome(){ welcomeDismissed = true; renderWelcome(); }

// --- streak: consecutive days with at least one logged visit ---
function calcStreak(rep){
  return UMCore.calcStreak(visits.filter(v=>v.rep===rep).map(v=>v.date), todayStr());
}
function renderStreak(){
  const el = document.getElementById('streakCard');
  if(!el) return;
  const st = calcStreak(currentUser.name);
  const myVisits = visits.filter(v=>v.rep===currentUser.name).length;
  if(st>=2){
    el.innerHTML = `<div class="streak"><div class="sf">\u{1F525}</div><div>
      <div class="sn">${st}-day streak</div>
      <div class="sl">${st>=5?'Outstanding consistency \u2014 keep it alive!':'Log a visit today to keep it going.'}</div>
    </div></div>`;
  } else if(myVisits===0){
    el.innerHTML = `<div class="streak" style="background:linear-gradient(120deg,#C4E4CE,#9ED0AF);"><div class="sf">\u{1F331}</div><div>
      <div class="sn" style="color:#022917;">Your first visit awaits</div>
      <div class="sl" style="color:#0B3D22;">Log one visit to start your streak.</div>
    </div></div>`;
  } else { el.innerHTML=''; }
}

// --- achievements ---
function achievements(rep){
  const mine = visits.filter(v=>v.rep===rep);
  const orders = mine.filter(v=>v.orderTaken);
  const revenue = mine.reduce((a,v)=>a+(v.orderTotal||0),0);
  const clinicsSeen = new Set(mine.map(v=>v.clinicId)).size;
  const assigned = clinics.filter(c=>c.rep===rep && c.cls!=='Closed');
  const prio = assigned.filter(c=>c.cls==='A'||c.cls==='B');
  const prioSeen = prio.filter(c=>mine.some(v=>v.clinicId===c.id)).length;
  const docs = clinics.filter(c=>c.rep===rep).reduce((a,c)=>a+(c.doctors||[]).length,0);
  const newCust = clinics.filter(c=>c.rep===rep && c.isNew).length;
  const overdue = assigned.filter(c=>followStatus(c.nextFollowUp)==='overdue').length;
  const streak = calcStreak(rep);
  const brands = new Set();
  mine.forEach(v=>(v.orders||[]).forEach(o=>o.items.forEach(it=>{
    const p=findProduct(it.productId); if(p) brands.add(p.brand);
  })));
  const A=(i,t,cur,goal,desc)=>({i,t,cur:Math.min(cur,goal),goal,earned:cur>=goal,desc});
  return [
    A('\u{1F6AA}','First Visit',mine.length,1,'Log your very first clinic visit.'),
    A('\u{1F91D}','Deal Maker',orders.length,1,'Close your first order.'),
    A('\u{1F525}','On a Roll',streak,3,'Log visits 3 days in a row.'),
    A('\u{1F3C3}','Road Warrior',mine.length,25,'Log 25 clinic visits.'),
    A('\u{1F48E}','Priority Focus',prioSeen,Math.max(prio.length,1),'Visit every A/B class clinic you own.'),
    A('\u{1F4B0}','1K Club',Math.round(revenue),1000,'Generate 1,000 KD in orders.'),
    A('\u{1F5FA}','Territory Mapper',clinicsSeen,Math.max(Math.round(assigned.length*0.6),1),'Visit 60% of your clinics.'),
    A('\u{1F468}\u200D\u2695\uFE0F','People Person',docs,10,'Record 10 doctors across your clinics.'),
    A('\u{1F31F}','Rainmaker',newCust,3,'Bring in 3 new customers.'),
    A('\u2705','Clean Slate',overdue===0&&mine.length>0?1:0,1,'Zero overdue follow-ups.'),
    A('\u{1F308}','Full Range',brands.size,5,'Sell products from 5 different brands.'),
    A('\u{1F4F8}','Memory Maker',memories.filter(m=>m.who===rep).length,3,'Share 3 team memories.'),
    A('\u{1F5BC}','Field Reporter',mine.filter(v=>v.photos&&v.photos.length).length,5,'Attach photos to 5 visits.'),
    A('\u{1F3C6}','Century',orders.length,100,'Close 100 orders.'),
  ];
}
function renderBadges(){
  if(typeof _msHeld !== 'undefined' && _msHeld) return; // a home frame kept whole meanwhile: its swap draws the badges (v126 speed)
  const list = achievements(currentUser.name);
  const earned = list.filter(a=>a.earned);
  const next = list.filter(a=>!a.earned).sort((a,b)=>(b.cur/b.goal)-(a.cur/a.goal));
  const show = [...earned, ...next].slice(0,10);
  const strip = document.getElementById('badgeStrip');
  if(!strip) return;
  strip.innerHTML = show.map(a=>`
    <div class="ach ${a.earned?'earned':'locked'}" onclick="openAchievements()">
      ${a.earned?'<div class="aglow"></div>':''}
      <div class="ai">${a.i}</div>
      <div class="at">${esc(a.t)}</div>
      <div class="ap">${a.earned?'\u2713 Earned':a.cur+'/'+a.goal}</div>
    </div>`).join('');
  // nudge: closest unearned
  const el = document.getElementById('nudgeCard');
  if(!el) return;
  const target = next[0];
  if(target && target.goal>0){
    const left = target.goal-target.cur;
    el.innerHTML = `<div class="nudge">${target.i} <strong>${esc(target.t)}</strong> \u2014 ${esc(target.desc)}<div class="progline">${left} more to unlock \u00b7 ${Math.round(target.cur/target.goal*100)}% there</div></div>`;
  } else if(earned.length===list.length){
    el.innerHTML = `<div class="nudge">\u{1F3C6} <strong>Every achievement unlocked.</strong> That is genuinely exceptional work.</div>`;
  } else { el.innerHTML=''; }
}
function openAchievements(){
  const list = achievements(currentUser.name);
  const earned = list.filter(a=>a.earned).length;
  showModal(`
    <h3 style="margin-top:0;">Achievements</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${earned} of ${list.length} unlocked \u2014 ${earned===list.length?'all of them. Remarkable.':'keep going, you\u2019re building something.'}</p>
    <div class="bar-track" style="margin-bottom:18px;"><div class="bar-fill" style="width:${Math.round(earned/list.length*100)}%;"></div></div>
    ${list.map(a=>`
      <div class="card" style="display:flex; gap:13px; align-items:center; ${a.earned?'border-inline-start:4px solid var(--green);':'opacity:.7;'}">
        <div style="font-size:28px; ${a.earned?'':'filter:grayscale(1); opacity:.5;'}">${a.i}</div>
        <div style="flex:1;">
          <div style="font-weight:700; font-size:14.5px;">${esc(a.t)} ${a.earned?'<span style="color:var(--green-dark);">\u2713</span>':''}</div>
          <div style="font-size:12.5px; color:var(--muted); margin-top:2px;">${esc(a.desc)}</div>
          ${!a.earned?`<div class="bar-track" style="margin-top:7px; height:6px;"><div class="bar-fill" style="width:${Math.round(a.cur/a.goal*100)}%;"></div></div>
            <div style="font-size:11px; color:var(--muted); margin-top:4px;">${a.cur} / ${a.goal}</div>`:''}
        </div>
      </div>`).join('')}
  `);
}

// ---- LIVE CHARTS ----
const CHART_COLORS = ['#207860','#2B7F68','#57B795','#E8762B','#5E5CE6','#E5484D','#C98A1E','#0F5257'];   // the home chart's greens first
function svgBars(data, opts){
  opts = opts||{};
  if(!data.length) return `<div style="color:var(--muted); font-size:13px;">Not enough data yet.</div>`;
  const max = Math.max(...data.map(d=>d.v), 1);
  const bw = 100/data.length;
  return `<svg viewBox="0 0 320 130" style="width:100%; height:auto;" preserveAspectRatio="none">
    ${data.map((d,i)=>{
      const h = Math.max(2, (d.v/max)*88);
      const x = i*(320/data.length)+ (320/data.length)*0.18;
      const w = (320/data.length)*0.64;
      // the largest bar carries its value in the home chart's dark pill; the others in plain ink
      const top = d.v === max && d.v > 0, tx = String(d.t||d.v), pw = Math.max(26, tx.length * 5.6 + 12);
      return `<rect x="${x}" y="${100-h}" width="${w}" height="${h}" rx="3" fill="${d.c||'#2B7F68'}"><title>${esc(d.l)}: ${d.t||d.v}</title></rect>
        ${top ? `<rect x="${(x+w/2-pw/2).toFixed(1)}" y="${(100-h-19).toFixed(1)}" width="${pw.toFixed(1)}" height="15" rx="5" fill="#093A30"/><text x="${x+w/2}" y="${(100-h-8.5).toFixed(1)}" font-size="9" text-anchor="middle" fill="#fff" font-weight="700">${tx}</text>`
          : `<text x="${x+w/2}" y="${100-h-4}" font-size="9" text-anchor="middle" fill="#1F2A3C" font-weight="700">${tx}</text>`}
        <text x="${x+w/2}" y="${114}" font-size="8.5" text-anchor="middle" fill="#5B6676" font-weight="500">${esc(String(d.l).slice(0,9))}</text>`;
    }).join('')}
  </svg>`;
}
function svgLine(points){
  if(points.length<2) return `<div style="color:var(--muted); font-size:13px;">Not enough data yet.</div>`;
  const max = Math.max(...points.map(p=>p.v), 1);
  const step = 300/(points.length-1);
  const coords = points.map((p,i)=>[10+i*step, 100-(p.v/max)*80]);
  const path = coords.map((c,i)=>(i?'L':'M')+c[0].toFixed(1)+' '+c[1].toFixed(1)).join(' ');
  const area = path+` L${coords[coords.length-1][0].toFixed(1)} 100 L${coords[0][0].toFixed(1)} 100 Z`;
  return `<svg viewBox="0 0 320 125" style="width:100%; height:auto;">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2B7F68" stop-opacity=".35"/><stop offset="100%" stop-color="#2B7F68" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#lg)"/>
    <path d="${path}" fill="none" stroke="#1E7360" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${coords.map((c,i)=>`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3" fill="#fff" stroke="#1E7360" stroke-width="2"><title>${esc(points[i].l)}: ${points[i].t||points[i].v}</title></circle>`).join('')}
    ${points.map((p,i)=>`<text x="${coords[i][0].toFixed(1)}" y="118" font-size="8.5" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}" fill="#5B6676" font-weight="500">${esc(p.l)}</text>`).join('')}
  </svg>`;
}
function svgDonut(slices){
  const total = slices.reduce((a,s)=>a+s.v,0);
  if(!total) return `<div style="color:var(--muted); font-size:13px;">Not enough data yet.</div>`;
  let ang = -Math.PI/2, paths='';
  slices.forEach((sl,i)=>{
    const frac = sl.v/total, a2 = ang + frac*Math.PI*2;
    const large = frac>0.5?1:0;
    const x1=60+42*Math.cos(ang), y1=60+42*Math.sin(ang);
    const x2=60+42*Math.cos(a2),  y2=60+42*Math.sin(a2);
    if(frac>0.9999){
      paths += `<circle cx="60" cy="60" r="42" fill="none" stroke="${sl.c}" stroke-width="17"/>`;
    } else {
      paths += `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} A42 42 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${sl.c}" stroke-width="17"><title>${esc(sl.l)}: ${sl.v}</title></path>`;
    }
    ang = a2;
  });
  return `<div class="donut-wrap">
    <svg viewBox="0 0 120 120" style="width:120px; height:120px; flex-shrink:0;">${paths}
      <text x="60" y="58" font-size="19" text-anchor="middle" font-weight="700" fill="#1C1C1E">${total}</text>
      <text x="60" y="72" font-size="9" text-anchor="middle" fill="#8E8E93">${esc((slices.centerLabel||'visits'))}</text>
    </svg>
    <div class="donut-legend">${slices.map(sl=>`<div><span class="swatch" style="background:${sl.c}"></span>${esc(sl.l)} — <strong>${sl.v}</strong></div>`).join('')}</div>
  </div>`;
}
function renderCharts(){
  let rv = reportVisitsBase();
  if(reportRepFilter!=='all') rv = rv.filter(v=>v.rep===reportRepFilter);
  const wrap = document.getElementById('chartsWrap');

  // 1) revenue trend — the report window [from,to] split into contiguous
  //    whole-day buckets, so the buckets sum to exactly the KPI above them
  const b = reportRangeBounds();
  const pts=[];
  if(b.from){
    const len = daysBetween(b.from, b.to)+1;
    const buckets = Math.max(1, reportCustom ? Math.max(4, Math.min(9, len)) : Math.min(len, reportRange===90?9:(reportRange===30?6:7)));
    const day = (str, n) => { const d = new Date(str+'T00:00:00'); d.setDate(d.getDate()+n); return UMCore.localDateStr(d); };
    for(let i=0;i<buckets;i++){
      const bFrom = day(b.from, Math.floor(i*len/buckets));
      const bTo = day(b.from, Math.floor((i+1)*len/buckets)-1);
      const vs = UMCore.filterVisitsByRange(rv, bFrom, bTo);
      pts.push({l:new Date(bTo+'T00:00:00').toLocaleDateString(uiLocale(),{month:'short',day:'numeric'}), v:vs.reduce((a,v)=>a+(v.orderTotal||0),0), t:''});
    }
  }
  // 2) revenue by rep — a rep sees her own bar only; the supervisor's chart honours the rep chip like every other card
  const repList = currentUser.role==='supervisor' ? REPS : [currentUser.name];
  const repBars = repList.map((r,i)=>{
    const vs = rv.filter(v=>v.rep===r);
    return {l:r.replace('Dr. ',''), v:vs.reduce((a,v)=>a+(v.orderTotal||0),0), t:'', c:CHART_COLORS[i]};
  });
  repBars.forEach(b=>b.t=amt2(b.v, 0));
  // 3) order vs no order donut
  const won = rv.filter(v=>v.orderTaken).length, lost = rv.length-won;
  // 4) top brands by revenue
  const brandRev={};
  rv.forEach(v=>(v.orders||[]).forEach(o=>o.items.forEach(it=>{
    const p=findProduct(it.productId); if(!p||p.price==null) return;
    brandRev[p.brand]=(brandRev[p.brand]||0)+p.price*it.qty*(1-(o.discountPct||0)/100);
  })));
  const brandBars=Object.entries(brandRev).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([b,v],i)=>({l:b,v,t:amt2(v, 0),c:CHART_COLORS[i]}));
  // 5) no-order reasons
  const reasons={};
  rv.filter(v=>!v.orderTaken&&v.noOrderReason).forEach(v=>{reasons[v.noOrderReason]=(reasons[v.noOrderReason]||0)+1;});
  const reasonBars=Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([r,c],i)=>({l:r,v:c,c:CHART_COLORS[i]}));
  // 6) clinic class coverage
  const covered=new Set(rv.map(v=>v.clinicId));
  const classBars=['A','B','C','D','F'].map((cl,i)=>{
    let pool=clinics.filter(c=>c.cls===cl&&c.cls!=='Closed');
    if(reportRepFilter!=='all') pool=pool.filter(c=>c.rep===reportRepFilter);
    const cov=pool.filter(c=>covered.has(c.id)).length;
    return {l:'Class '+cl, v:pool.length?Math.round(cov/pool.length*100):0, t:(pool.length?Math.round(cov/pool.length*100):0)+'%', c:clsColor(cl)};
  });

  wrap.innerHTML = `
    <div class="chartcard">${secHead('trend', 'Orders logged in the app — trend')}<div class="csub">${periodLabel()} · KD</div>${svgLine(pts)}</div>
    <div class="chartcard">${secHead('users', 'Sales by rep')}<div class="csub">${periodLabel()} · KD</div>${svgBars(repBars)}</div>
    <div class="chartcard"><h4>Visit outcome</h4><div class="csub">Orders won vs. no order</div>
      ${svgDonut([{l:'Order taken',v:won,c:'#022917'},{l:'No order',v:lost,c:'#E5E5EA'}])}</div>
    <div class="chartcard">${secHead('package', 'Orders logged in the app by brand')}<div class="csub">Top 5 · KD</div>${svgBars(brandBars)}</div>
    <div class="chartcard"><h4>Why orders weren't placed</h4><div class="csub">Most common reasons</div>${svgBars(reasonBars)}</div>
    <div class="chartcard"><h4>Coverage by clinic class</h4><div class="csub">% of clinics visited</div>${svgBars(classBars)}</div>
  `;
}

// ---- EVALUATION SCORECARDS ----
function computeRepScore(repName){
  return UMCore.computeRepScore(repName, {visits: reportVisitsBase(), clinics, tasks, today: todayStr()});
}
// Month-to-date achievement against the rep's monthly sales target, as the
// same official figure the Today card and the month reports use.
function targetPct(rep, mtd){
  const t = targets[rep] || {};
  if(!(t.revenue>0)) return null;
  const bm = bestMonthRevenue(rep, mtd);
  return { pct: Math.round(bm.amount/t.revenue*100), amount: bm.amount, target: t.revenue, src: bm.src };
}
function targetBarRow(rep, mtd){
  const tp = targetPct(rep, mtd);
  if(!tp) return '';
  const monthName = new Date(todayStr()+'T00:00:00').toLocaleDateString(uiLocale(),{month:'short'});
  return `<div class="bar-row">
        <div class="bar-label"><span>${monthName} target achieved</span><span><b style="color:${tp.pct>=100?'var(--sage-ink)':tp.pct>=60?'var(--ink)':'var(--amber-ink)'};">${tp.pct}%</b> · ${money(tp.amount)} / ${money(tp.target)}</span></div>
        <div class="bar-track"><div class="bar-fill ${tp.pct<60?'coral':''}" style="width:${Math.min(100,tp.pct)}%;"></div></div>
      </div>`;
}
function renderScorecards(mtd){
  const wrap = document.getElementById('scorecards');
  mtd = mtd || erpMtdMap(); // every person's target row and the team's: one pass of the month's lines
  const repsToShow = currentUser.role==='supervisor' ? REPS : [currentUser.name];
  const sb = reportRangeBounds();
  wrap.innerHTML = repsToShow.map(r=>{
    const s = computeRepScore(r);
    // Sales figure comes from the supervisor's uploaded files whenever they
    // cover the range — app-logged orders are only the fallback.
    const erpSales_ = erpRevenueForRange(sb.from, sb.to, r);
    return `
    <div class="card score-card">
      <div class="score-head">
        <div class="stamp">${initials(r)}</div>
        <div class="name">${esc(r)}</div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="n">${s.visits}</div><div class="l">Visits</div></div>
        <div class="kpi"><div class="n">${money(erpSales_!=null?erpSales_:s.revenue)}</div><div class="l">${erpSales_!=null?'Sales (uploaded)':'Orders logged in the app'}</div></div>
        <div class="kpi"><div class="n">${s.conversion}%</div><div class="l">Conversion rate</div></div>
        <div class="kpi"><div class="n">${s.overdue}</div><div class="l">Overdue follow-ups</div></div>
      </div>
      ${targetBarRow(r, mtd)}
      <div class="bar-row">
        <div class="bar-label"><span>Clinic coverage</span><span>${s.covered}/${s.assignedCount} (${s.coveragePct}%)</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${s.coveragePct}%;"></div></div>
      </div>
      <div class="bar-row">
        <div class="bar-label"><span>Priority (A/B) clinic coverage</span><span>${s.priorityCovered}/${s.priorityAssignedCount} (${s.priorityPct}%)</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${s.priorityPct}%;"></div></div>
      </div>
      <div class="bar-row" style="margin-bottom:0;">
        <div class="bar-label"><span>Task completion</span><span>${s.tasksDone}/${s.tasksTotal} (${s.taskPct}%)</span></div>
        <div class="bar-track"><div class="bar-fill ${s.overdue>0?'coral':''}" style="width:${s.taskPct}%;"></div></div>
      </div>
      ${renderGuidanceBlock(r, s)}
    </div>`;
  }).join('') + (()=>{ // team target card under the scorecards, supervisor view
    if(currentUser.role!=='supervisor') return '';
    const tt = teamTargetNow(mtd);
    if(tt.pct == null || tt.n < 2) return '';
    const monthName = new Date(todayStr()+'T00:00:00').toLocaleDateString(uiLocale(),{month:'short'});
    return `<div class="card score-card"><div class="score-head"><div class="stamp">${I('target')}</div><div class="name">Team · ${monthName} target</div></div>${teamTargetRow(tt, { label: 'Team' })}</div>`;
  })();
}
function renderFocusCard(){
  const el = document.getElementById('focusCard');
  if(!el) return;
  const reps = currentUser.role==='supervisor' ? REPS : [currentUser.name];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
  const recentVisits = visits.filter(v=>new Date(v.date)>=cutoff);
  const candidates = reps.map(r=>{
    const s = computeScoreForVisits(r, recentVisits);
    const n = buildNarrative(r, s, null);
    return {rep:r, top: n.opportunities[0] || null};
  }).filter(c=>c.top);
  candidates.sort((a,b)=>(a.top.label==='Overdue follow-ups'?-1:0) - (b.top.label==='Overdue follow-ups'?-1:0));
  const best = candidates[0];
  if(!best){ el.innerHTML=''; return; }
  const prefix = currentUser.role==='supervisor' && REPS.length>1 ? `${esc(best.rep)} — ` : '';
  el.innerHTML = `<div class="focus-card">
    <div class="focus-label">${I('target')} ${currentUser.role==='supervisor' ? 'Team focus' : 'Your focus today'}</div>
    <div class="focus-text">${prefix}${best.top.opp}</div>
    ${best.top.action?`<div class="focus-action">→ ${best.top.action}</div>`:''}
  </div>`;
}
function renderGuidanceBlock(rep, s){
  const prev = computePrevPeriodScore(rep);
  const n = buildNarrative(rep, s, prev);
  const items = [...n.opportunities, ...n.strengths];
  if(!items.length) return '';
  return `<div class="guidance-block">
    <div class="guidance-head">${currentUser.role==='supervisor' && rep!==currentUser.name ? I('target')+' Coaching guidance' : I('target')+' Your focus this period'}</div>
    ${n.opportunities.slice(0,3).map(x=>`<div class="pr-list-item"><div class="pr-icon opp">!</div><div>${x.opp}${x.action?`<div class="pr-action">→ ${x.action}</div>`:''}</div></div>`).join('')}
    ${n.opportunities.length===0 ? `<div class="pr-list-item"><div class="pr-icon good">✓</div><div>Every tracked metric is at or above target this period — excellent, consistent work.</div></div>` : ''}
  </div>`;
}

// ---- EMAIL → TASKS ----
function openEmailImport(){
  showModal(`
    <h3 style="margin-top:0;">Import tasks from an email</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Paste the email below. Action items are detected automatically — review, untick anything you don't want, then add.</p>
    <textarea id="emailPaste" placeholder="Paste the full email here..." style="min-height:130px;"></textarea>
    <button class="btn" onclick="parseEmailTasks()">Find tasks</button>
    <div id="emailParseResults" style="margin-top:16px;"></div>
  `);
}
function parseEmailTasks(){
  const raw = document.getElementById('emailPaste').value || '';
  const lines = raw.split(/\n+/).map(l=>l.trim()).filter(Boolean);
  const skipRe = /^(from|to|cc|bcc|sent|date|subject|hi|hello|dear|thanks|thank you|regards|best|sincerely|kind regards)\b/i;
  const actionRe = /\b(please|kindly|need|needs|required|require|send|share|follow up|followup|deliver|prepare|arrange|confirm|check|update|provide|submit|schedule|visit|call|contact|order|quote|sample|asap)\b/i;
  const bulletRe = /^\s*([-*•·]|\d+[.)])\s+/;
  const found = [];
  lines.forEach(l=>{
    const clean = l.replace(bulletRe,'').trim();
    if(clean.length < 6 || clean.length > 180) return;
    if(skipRe.test(clean)) return;
    if(bulletRe.test(l) || actionRe.test(clean)) found.push(clean);
  });
  const uniq = [...new Set(found)].slice(0,15);
  const el = document.getElementById('emailParseResults');
  if(uniq.length===0){
    el.innerHTML = `<div style="color:var(--muted); font-size:13.5px;">No clear action items found. You can still add one manually below.</div>
      <input type="text" id="manualTaskFromEmail" placeholder="Type the task yourself" style="margin-top:10px;">
      <button class="btn secondary small" onclick="addManualEmailTask()">Add task</button>`;
    return;
  }
  window._emailTasks = uniq.map(t=>({text:t, on:true}));
  el.innerHTML = `<div class="section-title" style="margin-top:0;">Found ${uniq.length} possible task${uniq.length===1?'':'s'}</div>` +
    uniq.map((t,i)=>`<div class="task-item" style="padding:8px 0; border-bottom:1px solid var(--line);">
      <div class="task-check checked" id="etask-${i}" onclick="toggleEmailTask(${i})">✓</div>
      <div class="task-text" style="font-size:13.5px;">${esc(t)}</div>
    </div>`).join('') +
    `<button class="btn" onclick="commitEmailTasks()">Add selected tasks</button>`;
}
function toggleEmailTask(i){
  const t = window._emailTasks[i];
  t.on = !t.on;
  const el = document.getElementById('etask-'+i);
  el.classList.toggle('checked', t.on);
  el.textContent = t.on ? '✓' : '';
}
async function commitEmailTasks(){
  const chosen = (window._emailTasks||[]).filter(t=>t.on);
  if(chosen.length===0){ showToast('Nothing selected'); return; }
  chosen.forEach(t=>{
    tasks.push({id:uid(), text:t.text, done:false, created:todayStr(), source:'email', rep: currentUser.role==='supervisor' ? 'Team' : currentUser.name});
  });
  const r = await persistTold('tasks');
  closeModal();
  renderToday();
  saveToast(r, 'tasks', chosen.length+' task'+(chosen.length===1?'':'s')+' added'); // "added" only when it landed
}
async function addManualEmailTask(){
  const val = (document.getElementById('manualTaskFromEmail').value||'').trim();
  if(!val){ showToast('Type a task first'); return; }
  tasks.push({id:uid(), text:val, done:false, created:todayStr(), source:'email', rep: currentUser.role==='supervisor' ? 'Team' : currentUser.name});
  const r = await persistTold('tasks');
  closeModal();
  renderToday();
  saveToast(r, 'tasks', 'Task added');
}

