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
// ---- AI ASSISTANT ----
// Calls go through a small Netlify Function so the AI key never lives in this
// page. Absolute URL so the installed Android/PWA app reaches it too.
const AI_ENDPOINT = 'https://resonant-granita-6e6cce.netlify.app/.netlify/functions/assistant';
let aiMsgs = [];
let aiBusy = false;
function openAssistant(){
  showModal(`
    <h3 style="margin-top:0;">${I('sparkles')} Assistant</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;">Ask anything about your clinics, visits, products or plans — in Arabic or English. It only sees this app's data.</p>
    <div id="aiThread" style="max-height:45vh; overflow-y:auto; margin-bottom:10px;"></div>
    <div style="display:flex; gap:8px;">
      <input type="text" id="aiInput" dir="auto" placeholder="e.g. What should I focus on this week?" onkeydown="if(event.key==='Enter') sendAssistant()">
      <button class="btn" style="width:auto; padding:0 18px;" id="aiSendBtn" onclick="sendAssistant()">Send</button>
    </div>`);
  renderAiThread();
  const inp = document.getElementById('aiInput');
  if(inp) inp.focus();
}
function renderAiThread(){
  const el = document.getElementById('aiThread');
  if(!el) return;
  el.innerHTML = aiMsgs.length ? aiMsgs.map(m=>`
    <div style="margin-bottom:8px; ${m.role==='user'?'text-align:end;':''}">
      <div style="display:inline-block; max-width:88%; text-align:start; padding:9px 12px; border-radius:12px; font-size:13.5px; line-height:1.55; white-space:pre-wrap; ${m.role==='user'?'background:var(--green); color:#fff;':'background:var(--paper);'}">${esc(m.content)}</div>
    </div>`).join('')
    : `<div style="color:var(--muted); font-size:12.5px; text-align:center; padding:12px 0;">Try: “Summarize my month so far” · “لخص لي عيادة قبل زيارتي” · “Write a follow-up WhatsApp message”</div>`;
  el.scrollTop = el.scrollHeight;
}
function buildAssistantContext(){
  const me = currentUser;
  const mine = r => me.role==='supervisor' || r===me.name;
  const cname = id => clinicLabel(id);
  const m = getMonthDates(todayStr());
  const data = {visits, clinics, tasks, events, dayPlans};
  return {
    today: todayStr(),
    user: {name: me.name, role: me.role},
    monthSummary: UMCore.rangeSummary(m[0], m[m.length-1], me.role==='supervisor'?'all':me.name, data),
    monthlyTargets: targets,
    clinics: clinics.filter(c=>mine(c.rep)).map(c=>({name:c.name, cls:c.cls, rep:c.rep, area:c.area||'', phone:c.phone||'', nextFollowUp:c.nextFollowUp||null, notes:(c.notes||'').slice(0,150), doctors:(c.doctors||[]).map(d=>d.name+(d.title?' ('+d.title+')':'')).slice(0,6)})),
    recentVisits: [...visits].sort((a,b)=>(b.ts||0)-(a.ts||0)).filter(v=>mine(v.rep)||mine(v.withRep)).slice(0,40)
      .map(v=>({date:v.date, rep:v.rep, jointWith:v.withRep||null, clinic:cname(v.clinicId), contacts:UMCore.contactCount(v), order:!!v.orderTaken, totalKD:v.orderTotal||0, call:!!v.callOnly, notes:(v.notes||'').slice(0,120)})),
    openTasks: tasks.filter(t=>!t.done && (mine(t.rep)||t.rep==='Team')).slice(0,25).map(t=>({text:t.text, due:t.dueDate||null, rep:t.rep})),
    upcomingEvents: events.filter(e=>e.date>=todayStr()).slice(0,15).map(e=>({title:e.title, date:e.date, time:e.time||'', type:e.type, rep:e.rep, notes:e.notes||''})),
    dormantClinics: UMCore.dormantClinics(clinics, visits, todayStr(), {days:30}).filter(c=>mine(c.rep)).slice(0,12),
    productCatalog: products.slice(0,200).map(p=>({name:p.name, brand:p.brand, priceKD:p.price})),
  };
}
async function sendAssistant(){
  if(aiBusy) return;
  const inp = document.getElementById('aiInput');
  const q = (inp.value||'').trim();
  if(!q) return;
  inp.value = '';
  aiBusy = true;
  aiMsgs.push({role:'user', content:q});
  aiMsgs.push({role:'assistant', content:'Thinking…', pending:true});
  renderAiThread();
  try{
    const res = await fetch(AI_ENDPOINT, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        messages: aiMsgs.filter(m=>!m.pending).map(m=>({role:m.role, content:m.content})),
        context: buildAssistantContext(),
      }),
    });
    const data = await res.json().catch(()=>({}));
    aiMsgs = aiMsgs.filter(m=>!m.pending);
    if(res.ok && data.reply){
      aiMsgs.push({role:'assistant', content:data.reply});
    } else if(data.error==='NO_KEY'){
      aiMsgs.push({role:'assistant', content:'The assistant isn\'t activated yet. The supervisor needs to add the AI key once in Netlify: Site settings → Environment variables → add ANTHROPIC_API_KEY, then redeploy.'});
    } else {
      aiMsgs.push({role:'assistant', content:'Something went wrong reaching the assistant — please try again in a moment.'});
    }
  }catch(e){
    aiMsgs = aiMsgs.filter(m=>!m.pending);
    aiMsgs.push({role:'assistant', content:'Couldn\'t reach the assistant service. Check your internet connection and try again.'});
  }
  aiBusy = false;
  renderAiThread();
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
    ${fmtRow('Sales', A.revenue, B.revenue, true)}
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
function renderCoach(){
  const el = document.getElementById('coachCard');
  if(!el) return;
  const b = reportRangeBounds();
  const insights = UMCore.coachInsights({ erpMtd: erpMtdMap(),
    from: b.from, to: b.to, today: todayStr(), repFilter: reportRepFilter,
    visits, clinics, targets: blendedTargets(), dayPlans,
  });
  const styles = {
    act:   {c:'var(--coral)',  ink:'var(--coral-ink)', label:'DO NOW'},
    watch: {c:'var(--amber)',  ink:'var(--amber-ink)', label:'WATCH'},
    good:  {c:'var(--sage)',   ink:'var(--sage-ink)',  label:'WORKING'},
  };
  el.innerHTML = insights.map(i=>{
    const st = styles[i.level] || styles.watch;
    return `<div class="card" style="border-inline-start:4px solid ${st.c}; margin-bottom:8px; padding:12px 14px;">
      <div style="display:flex; gap:9px; align-items:baseline;">
        <span style="font-size:17px;">${i.icon}</span>
        <div style="flex:1;">
          <div style="font-weight:700; font-size:13.5px;">${esc(i.title)}
            <span style="font-size:10px; font-weight:800; color:${st.ink}; letter-spacing:.06em; margin-inline-start:4px;">${st.label}</span></div>
          <div style="font-size:12.5px; color:var(--muted); line-height:1.55; margin-top:3px;">${esc(i.detail)}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}
function renderReports(){
  renderCoach();
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
  document.getElementById('repRevenueLabel').textContent = erpRev != null ? 'Sales (ERP-verified)' : 'Sales';
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
        erp: erpRevenueForRange(cmpBounds.from, cmpBounds.to, r), tgt: targetPct(r)};
    });
    const anyErp = rows.some(r=>r.erp != null);
    const anyTgt = rows.some(r=>r.tgt != null);
    const rowCls = 'compare-row ' + (anyErp && anyTgt ? 'c5' : (anyErp || anyTgt) ? 'c4' : '');
    const tgtCell = r => anyTgt ? `<div style="font-weight:800; color:${r.tgt?(r.tgt.pct>=100?'var(--sage-ink)':r.tgt.pct>=60?'var(--ink)':'var(--amber-ink)'):'var(--muted)'};">${r.tgt?r.tgt.pct+'%':'—'}</div>` : '';
    compareCard.innerHTML = `
      <div class="${rowCls}" style="margin-bottom:8px;">
        <div class="h">Rep</div><div class="h">Visits</div><div class="h">Logged</div>${anyErp?'<div class="h">ERP</div>':''}${anyTgt?'<div class="h">Target</div>':''}
      </div>
      ${rows.map(r=>`<div class="${rowCls}" style="padding:6px 0; border-top:1px solid var(--line);"><div>${esc(r.rep)}</div><div>${r.visits}</div><div>${money(r.revenue)}</div>${anyErp?`<div>${r.erp!=null?money(r.erp):'—'}</div>`:''}${tgtCell(r)}</div>`).join('')}
      ${rows.length>1?(()=>{ // team line: sums, and the team target % on the same official basis
        const tt = teamTargetTotal(rows.map(r => r.tgt ? { goal: r.tgt.target, ach: r.tgt.amount } : null));
        const erpAny = rows.some(r=>r.erp!=null);
        return `<div class="${rowCls}" style="padding:6px 0; border-top:2px solid var(--ink); font-weight:800;"><div>Team</div><div>${rows.reduce((s,r)=>s+r.visits,0)}</div><div>${money(rows.reduce((s,r)=>s+r.revenue,0))}</div>${anyErp?`<div>${erpAny?money(rows.reduce((s,r)=>s+(r.erp||0),0)):'—'}</div>`:''}${anyTgt?`<div style="color:${tt.pct!=null?pctInk(tt.pct):'var(--muted)'};">${tt.pct!=null?tt.pct+'%':'—'}</div>`:''}</div>`;
      })():''}
    `;
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
  renderScorecards();
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
async function savePhotoBlob(id, dataUrl){
  try{ await window.storage.set('photo:'+id, dataUrl, true); return true; }
  catch(e){ console.error('photo save', e); showToast('Photo too large to save'); return false; }
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
    showToast('\u{1F4F8} Photo added');
  }, true);
}
function removeVisitPhoto(id){ visitPhotos = visitPhotos.filter(p=>p.id!==id); renderVisitPhotos(); }

// ---------- lightbox ----------
async function showLightbox(photoId, cap, direct){
  const lb=document.getElementById('lightbox');
  document.getElementById('lbCap').textContent = cap||'';
  document.getElementById('lbImg').src = direct || '';
  lb.classList.add('show');
  if(!direct){
    const local = visitPhotos.find(p=>p.id===photoId);
    const data = local ? local.full : await loadPhotoBlob(photoId);
    if(data) document.getElementById('lbImg').src = data;
  }
}
function closeLightbox(e, force){
  if(force || e.target.id==='lightbox') document.getElementById('lightbox').classList.remove('show');
}

// ---------- team data ----------
async function loadTeam(){
  try{
    const [c,m] = await Promise.all([
      cloudGet('chat').catch(()=>null),
      cloudGet('memories').catch(()=>null),
    ]);
    chatMsgs = c ? JSON.parse(c.value) : [];
    memories = m ? JSON.parse(m.value) : [];
  }catch(e){ chatMsgs=[]; memories=[]; }
}
async function persistTeam(key){
  const map={chat:chatMsgs, memories:memories};
  let value = map[key]; // hoisted: the catch mirrors the merged copy
  try{
    try{
      const cur = await withTimeout(window.storage.get(key, true), 5000);
      const cloud = cur ? UMCore.safeParse(cur.value, null) : null;
      if(Array.isArray(cloud)){
        const have = new Set(value.map(x=>x && x.id));
        cloud.forEach(x=>{ if(x && x.id != null && !have.has(x.id)) value.push(x); });
        value.sort((a,b)=>(a.ts||0)-(b.ts||0));
        if(key==='chat' && value.length>300) value = value.slice(-300);
        if(key==='chat') chatMsgs = value; else memories = value;
      }
    }catch(e){}
    const str = JSON.stringify(value);
    await withTimeout(window.storage.set(key, str, true), 7000);
    mirrorSave(key, str);
    if(outboxHas(key)) outboxRemove(key);
    return true;
  }
  catch(e){
    try{
      const mOk = mirrorSave(key, JSON.stringify(value || map[key]));
      if(mOk) outboxAdd(key);
    }catch(e2){}
    updateSyncBadge();
    offlineToast('📴 Saved on this device — uploads automatically when back online');
    return false;
  }
}
function setTeamTab(t){
  teamTab=t;
  document.getElementById('tabChat').classList.toggle('on', t==='chat');
  document.getElementById('tabMem').classList.toggle('on', t==='mem');
  document.getElementById('teamChat').style.display = t==='chat'?'block':'none';
  document.getElementById('teamMem').style.display = t==='mem'?'block':'none';
  if(t==='mem') renderMemories(); else renderChat();
}
async function refreshTeam(){
  await loadTeam();
  renderChat(); renderMemories();
  showToast('\u{1F504} Up to date');
}
function fmtWhen(ts){
  const d=new Date(ts), n=new Date();
  const sameDay = d.toDateString()===n.toDateString();
  return sameDay ? d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})
                 : d.toLocaleDateString([], {month:'short',day:'numeric'})+' '+d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}
function renderChat(){
  const el = document.getElementById('chatList');
  if(!chatMsgs.length){
    el.innerHTML = `<div class="empty"><div class="big">\u{1F4AC} Start the conversation</div>Share a win, ask for help, or drop a photo from the road.</div>`;
    return;
  }
  el.innerHTML = chatMsgs.slice(-60).map(m=>{
    const me = m.who===currentUser.name;
    return `<div class="msg ${me?'me':'them'}">
      ${me?'':`<div class="who">${esc(m.who)}</div>`}
      ${m.text?`<div dir="auto">${esc(m.text)}</div>`:''}
      ${m.photoId?`<img src="${m.thumb||''}" onclick="showLightbox('${m.photoId}','${esc((m.text||'').replace(/'/g,''))}')">`:''}
      <div class="when">${fmtWhen(m.ts)}</div>
    </div>`;
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
    if(pendingChatPhoto){
      const ok = await savePhotoBlob(pendingChatPhoto.id, pendingChatPhoto.full);
      if(!ok){
        // Keep the draft — never silently drop the photo the user attached.
        showToast('⚠️ Photo failed to upload — try again');
        return;
      }
      msg.photoId = pendingChatPhoto.id; msg.thumb = pendingChatPhoto.thumb;
    }
    chatMsgs.push(msg);
    if(chatMsgs.length>300) chatMsgs = chatMsgs.slice(-300);
    inp.value=''; clearChatPhoto();
    await persistTeam('chat');
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
    showModal(`
      <h3 style="margin-top:0;">\u{1F4F8} Add a memory</h3>
      <img src="${thumb}" style="width:100%; border-radius:14px; margin-bottom:12px;">
      <label>Caption</label>
      <input type="text" id="memCap" placeholder="What's happening here?">
      <label>Tag it</label>
      <div class="chip-row" id="memTags">${['\u{1F3C6} Win','\u{1F697} On the road','\u{1F3E5} Clinic visit','\u{1F91D} Team','\u{1F389} Celebration','\u{1F4E6} Product'].map((t,i)=>`<div class="chip small ${i===0?'on':''}" data-tag="${t}" onclick="pickModalCls(this)">${t}</div>`).join('')}</div>
      <button class="btn" onclick="saveMemory('${full.length}')">Share memory</button>
    `);
    window._pendingMem = {id:uid(), full, thumb};
  }, false);
}
async function saveMemory(){
  const pm = window._pendingMem;
  if(!pm) return;
  const cap = (document.getElementById('memCap').value||'').trim();
  const tagEl = document.querySelector('#memTags .chip.on');
  const ok = await savePhotoBlob(pm.id, pm.full);
  if(!ok) return;
  memories.push({id:pm.id, thumb:pm.thumb, cap, tag:tagEl?tagEl.dataset.tag:'', who:currentUser.name, ts:Date.now()});
  await persistTeam('memories');
  window._pendingMem=null;
  closeModal();
  setTeamTab('mem');
  renderBadges();
  showToast('\u{1F4F8} Memory shared with the team');
}
function renderMemories(){
  const el = document.getElementById('memGrid');
  if(!memories.length){
    el.innerHTML = `<div class="empty" style="grid-column:1/-1;"><div class="big">\u{1F4F8} No memories yet</div>Every team has a story. Add the first photo.</div>`;
    return;
  }
  el.innerHTML = [...memories].sort((a,b)=>b.ts-a.ts).map(m=>`
    <div class="mcard" onclick="showLightbox('${m.id}','${esc((m.cap||'').replace(/'/g,''))}')">
      <img src="${m.thumb}" alt="" onerror="this.style.display='none'">
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
const CHART_COLORS = ['#022917','#0B3D22','#FF9500','#5E5CE6','#34C759','#FF3B30','#C98A1E','#0F5257'];
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
      return `<rect x="${x}" y="${100-h}" width="${w}" height="${h}" rx="4" fill="${d.c||'#022917'}"><title>${esc(d.l)}: ${d.t||d.v}</title></rect>
        <text x="${x+w/2}" y="${100-h-4}" font-size="9" text-anchor="middle" fill="#3A3A3C" font-weight="700">${d.t||d.v}</text>
        <text x="${x+w/2}" y="${114}" font-size="8.5" text-anchor="middle" fill="#8E8E93">${esc(String(d.l).slice(0,9))}</text>`;
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
      <stop offset="0%" stop-color="#022917" stop-opacity=".55"/><stop offset="100%" stop-color="#022917" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#lg)"/>
    <path d="${path}" fill="none" stroke="#0B3D22" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${coords.map((c,i)=>`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3" fill="#fff" stroke="#0B3D22" stroke-width="2"><title>${esc(points[i].l)}: ${points[i].t||points[i].v}</title></circle>`).join('')}
    ${points.map((p,i)=>`<text x="${coords[i][0].toFixed(1)}" y="118" font-size="8.5" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}" fill="#8E8E93">${esc(p.l)}</text>`).join('')}
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
  repBars.forEach(b=>b.t=b.v.toFixed(0));
  // 3) order vs no order donut
  const won = rv.filter(v=>v.orderTaken).length, lost = rv.length-won;
  // 4) top brands by revenue
  const brandRev={};
  rv.forEach(v=>(v.orders||[]).forEach(o=>o.items.forEach(it=>{
    const p=findProduct(it.productId); if(!p||p.price==null) return;
    brandRev[p.brand]=(brandRev[p.brand]||0)+p.price*it.qty*(1-(o.discountPct||0)/100);
  })));
  const brandBars=Object.entries(brandRev).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([b,v],i)=>({l:b,v,t:v.toFixed(0),c:CHART_COLORS[i]}));
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
    <div class="chartcard"><h4>Sales trend</h4><div class="csub">${periodLabel()} · KD</div>${svgLine(pts)}</div>
    <div class="chartcard"><h4>Sales by rep</h4><div class="csub">${periodLabel()} · KD</div>${svgBars(repBars)}</div>
    <div class="chartcard"><h4>Visit outcome</h4><div class="csub">Orders won vs. no order</div>
      ${svgDonut([{l:'Order taken',v:won,c:'#022917'},{l:'No order',v:lost,c:'#E5E5EA'}])}</div>
    <div class="chartcard"><h4>Sales by brand</h4><div class="csub">Top 5 · KD</div>${svgBars(brandBars)}</div>
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
function targetPct(rep){
  const t = targets[rep] || {};
  if(!(t.revenue>0)) return null;
  const bm = bestMonthRevenue(rep);
  return { pct: Math.round(bm.amount/t.revenue*100), amount: bm.amount, target: t.revenue, src: bm.src };
}
function targetBarRow(rep){
  const tp = targetPct(rep);
  if(!tp) return '';
  const monthName = new Date(todayStr()+'T00:00:00').toLocaleDateString(uiLocale(),{month:'short'});
  return `<div class="bar-row">
        <div class="bar-label"><span>${monthName} target achieved</span><span><b style="color:${tp.pct>=100?'var(--sage-ink)':tp.pct>=60?'var(--ink)':'var(--amber-ink)'};">${tp.pct}%</b> · ${money(tp.amount)} / ${money(tp.target)}</span></div>
        <div class="bar-track"><div class="bar-fill ${tp.pct<60?'coral':''}" style="width:${Math.min(100,tp.pct)}%;"></div></div>
      </div>`;
}
function renderScorecards(){
  const wrap = document.getElementById('scorecards');
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
        <div class="kpi"><div class="n">${money(erpSales_!=null?erpSales_:s.revenue)}</div><div class="l">Sales${erpSales_!=null?' (uploaded)':' (logged)'}</div></div>
        <div class="kpi"><div class="n">${s.conversion}%</div><div class="l">Conversion rate</div></div>
        <div class="kpi"><div class="n">${s.overdue}</div><div class="l">Overdue follow-ups</div></div>
      </div>
      ${targetBarRow(r)}
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
    const tt = teamTargetNow();
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
    <div class="guidance-head">${currentUser.role==='supervisor' ? I('target')+' Coaching guidance' : I('target')+' Your focus this period'}</div>
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
  await persist('tasks');
  closeModal();
  renderToday();
  showToast(chosen.length+' task'+(chosen.length===1?'':'s')+' added');
}
async function addManualEmailTask(){
  const val = (document.getElementById('manualTaskFromEmail').value||'').trim();
  if(!val){ showToast('Type a task first'); return; }
  tasks.push({id:uid(), text:val, done:false, created:todayStr(), source:'email', rep: currentUser.role==='supervisor' ? 'Team' : currentUser.name});
  await persist('tasks');
  closeModal();
  renderToday();
  showToast('Task added');
}

