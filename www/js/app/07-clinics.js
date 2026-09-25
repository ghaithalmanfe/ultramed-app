// clinics list, dashboards, ERP ledger, edit clinic/product, recycle bin
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- CLINICS ----

// ---- CLINIC DASHBOARD ----
let clinicMode = 'dash';
function setClinicMode(m){
  clinicMode = m;
  document.getElementById('dtDash').classList.toggle('on', m==='dash');
  document.getElementById('dtList').classList.toggle('on', m==='list');
  document.getElementById('clinicDash').style.display = m==='dash'?'block':'none';
  document.getElementById('clinicListPane').style.display = m==='list'?'block':'none';
  if(m==='dash') renderClinicDash(); else renderClinics();
}
function clinicStats(c){
  const vs = visits.filter(v=>v.clinicId===c.id);
  const field = vs.filter(isFieldVisit);         // physical visits only
  const orders = vs.filter(v=>v.orderTaken);     // includes remote orders
  const rev = vs.reduce((a,v)=>a+(v.orderTotal||0),0);
  const disc = vs.reduce((a,v)=>a+(v.orderDiscount||0),0);
  const last = field.length? field.map(v=>v.date).sort().slice(-1)[0] : null;
  return {visits:field.length, calls:vs.filter(v=>v.callOnly).length, orders:orders.length, rev, disc, last,
    daysSince: last? daysBetween(last, todayStr()) : null,
    conv: field.length? Math.round(field.filter(v=>v.orderTaken).length/field.length*100):0,
    docs:(c.doctors||[]).length};
}
// ---- ERP CUSTOMER SALES DASHBOARD (who bought / who didn't) ----
// Built from the supervisor's uploaded sales files: every ERP customer with
// net + invoices + last invoice date, matched to app clinics; app clinics
// with no invoice in the period surface as the follow-up list.
let erpDashTab = 'not';
function erpDashData(repOverride){
  const effRep = repOverride || clinicRepFilter;
  const today = todayStr(), mStart = today.slice(0,7)+'-01';
  let ps = erpPeriods().filter(p => p.to >= mStart && p.from <= today);
  let periodLabel = 'This month';
  if(!ps.length){ // early in a new month, fall back to the latest upload
    const latest = erpPeriods().slice().sort((a,b)=>(b.to||'').localeCompare(a.to||''))[0];
    if(latest){ ps = [latest]; periodLabel = fmtDate(latest.from)+' – '+fmtDate(latest.to); }
  }
  const cust = {}; let maxDate = '';
  const fams = UMCore.clinicFamilies(clinics);
  ps.forEach(p => erpViewRows(p).forEach(r => {
    const rep = UMCore.erpRowRep(r, clinics, erpMap, p.repMap||{});
    if(!rep) return; // salesmen outside the team stay out of the girls' lists
    if(effRep !== 'all' && rep !== effRep) return;
    let key = (r.customer||'').trim() || '(no name)';
    const m = UMCore.matchCustomer(key, clinics, erpMap);
    if(m.ignored) return;
    // Branch deliveries of one clinic family roll up to ONE line, counted
    // once — never "invoiced twice" because two branches took stock. An
    // explicit erpMap override stays its own line: it is the supervisor's
    // un-merge tool when a grouping is not wanted.
    const famKey = (m.clinicId && m.method !== 'map') ? (m.family || fams.byClinic[m.clinicId]) : null;
    let dispName = key;
    if(famKey && fams.fams[famKey]){ key = '@fam:'+famKey; dispName = fams.fams[famKey].label + ' ('+fams.fams[famKey].count+')'; }
    const a = cust[key] || (cust[key] = {name:dispName, net:0, ret:0, docs:new Set(), last:'', rep, clinicId:m.clinicId, channel:m.channel, family:famKey||null});
    a.net += r.net; if(!isExchangeLine(r)) a.ret += UMCore.returnValue(r); a.docs.add(r.doc);
    if(r.date > a.last) a.last = r.date;
    if(r.date > maxDate) maxDate = r.date;
  }));
  const buyers = Object.values(cust)
    .map(a=>({name:a.name, rep:a.rep, clinicId:a.clinicId, channel:a.channel, family:a.family,
      invoices:a.docs.size, last:a.last, net:Math.round(a.net*100)/100, ret:Math.round(a.ret*100)/100}))
    .sort((x,y)=>y.net-x.net);
  const boughtIds = new Set(buyers.filter(b=>b.clinicId).map(b=>b.clinicId));
  // A family purchase covers every branch — branch #2 must not show "didn't
  // buy" when the family's invoice simply shipped to branch #1.
  buyers.forEach(b=>{ if(b.family && fams.fams[b.family]) fams.fams[b.family].ids.forEach(id=>boughtIds.add(id)); });
  let pool = clinics.filter(c=>c.cls!=='Closed');
  if(effRep !== 'all') pool = pool.filter(c=>c.rep===effRep);
  const nonBuyers = pool.filter(c=>!boughtIds.has(c.id)).map(c=>{
    const lastV = visits.filter(v=>v.clinicId===c.id).map(v=>v.date).sort().pop() || null;
    const days = lastV ? Math.round((new Date(todayStr())-new Date(lastV))/86400000) : null;
    return {c, lastV, days};
  }).sort((a,b)=>{
    const order = {overdue:0, today:1, upcoming:2, none:3};
    const d = order[followStatus(a.c.nextFollowUp)] - order[followStatus(b.c.nextFollowUp)];
    return d !== 0 ? d : String(a.c.cls||'Z').localeCompare(String(b.c.cls||'Z'));
  });
  return {buyers, nonBuyers, periodLabel, maxDate, hasData: ps.length>0};
}
function erpDashSection(){
  const d = erpDashData();
  if(!d.hasData) return `<div class="chartcard"><h4>🧾 Customer sales (ERP)</h4>
    <div class="csub">Upload a sales file in Report → 📥 Import and every customer's buying status appears here.</div></div>`;
  const clinicBuyers = d.buyers.filter(b=>!b.channel);
  const channels = d.buyers.filter(b=>b.channel);
  const channelNet = Math.round(channels.reduce((s,b)=>s+b.net,0)*100)/100;
  const buyersNet = Math.round(clinicBuyers.reduce((s,b)=>s+b.net,0)*100)/100;
  const returnedTotal = Math.round(d.buyers.reduce((s,b)=>s+(b.ret||0),0)*100)/100;
  const donut = svgDonut(Object.assign([
    {l:'Bought', v: clinicBuyers.length, c:'#2E784C'},
    {l:"Didn't buy", v: d.nonBuyers.length, c:'#E5E5EA'},
  ], {centerLabel:'customers'}));
  const topBars = svgBars(clinicBuyers.slice(0,8).map(b=>({l:b.name, v:Math.max(0,b.net), t:money(b.net), c:'#2E784C'})));
  const CLS = ['A','B','C','D','F'];
  const clsBars = svgBars(CLS.map(k=>({l:k, v:d.nonBuyers.filter(x=>x.c.cls===k).length, c:clsColor(k)})));
  const rows = erpDashTab==='not'
    ? d.nonBuyers.slice(0,40).map(x=>`
      <div class="card clickable" style="padding:11px 14px; border-inline-start:4px solid ${clsColor(x.c.cls)};" onclick="openClinicDetail('${x.c.id}')">
        <div class="row-between">
          <div>
            <div class="clinic-name">${esc(x.c.name)}${clinicIsRx(x.c)?' <span style="font-size:11px; color:var(--teal); font-weight:700;">'+(clinicIsDirect(x.c)?'℞ + direct':'℞ prescription')+'</span>':''}</div>
            <div class="clinic-sub">${esc(x.c.rep||'')} · ${x.lastV ? 'last visit '+x.days+'d ago' : 'never visited'}${x.c.nextFollowUp?' · follow-up '+fmtDate(x.c.nextFollowUp):''}</div>
          </div>
          <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
            <span class="badge ${followStatus(x.c.nextFollowUp)}">${statusLabel(x.c.nextFollowUp).split('·')[0].trim()}</span>
            <button class="chip small" onclick="event.stopPropagation(); openCallLog('${x.c.id}')">📞</button>
          </div>
        </div>
        <div style="display:flex; gap:6px; margin-top:8px; align-items:center;" onclick="event.stopPropagation()">
          <input type="text" value="${esc(x.c.noSaleReason||'')}" placeholder="Why no sales yet? Add the reason…" dir="auto"
            onchange="saveNoSaleReason('${x.c.id}', this.value)"
            style="flex:1; margin:0; font-size:12.5px; padding:7px 10px;">
          <button class="chip small" style="flex-shrink:0;" onclick="saveNoSaleReason('${x.c.id}', this.parentElement.querySelector('input').value)">💾 Save</button>
        </div>
      </div>`).join('') + (d.nonBuyers.length>40?`<div style="color:var(--muted); font-size:12.5px; text-align:center; padding:6px;">+${d.nonBuyers.length-40} more in the list view</div>`:'')
    : clinicBuyers.slice(0,40).map(b=>`
      <div class="card ${b.clinicId?'clickable':''}" style="padding:11px 14px; border-inline-start:4px solid ${b.net<0?'var(--coral)':'var(--sage)'};" ${b.clinicId?`onclick="openClinicDetail('${b.clinicId}')"`:''}>
        <div class="row-between">
          <div>
            <div class="clinic-name">${esc(b.name)}${b.clinicId?'':' <span style="font-size:11px; color:var(--muted);">⚠ not linked</span>'}</div>
            <div class="clinic-sub">${esc(b.rep)} · ${b.invoices} invoice${b.invoices===1?'':'s'} · last ${fmtDate(b.last)}${b.ret>0?` · <span style="color:var(--coral-ink);">↩ ${money(b.ret)} returned</span>`:''}</div>
          </div>
          <div style="font-weight:800; ${b.net<0?'color:var(--coral-ink);':''}">${money(b.net)}</div>
        </div>
      </div>`).join('') + (clinicBuyers.length>40?`<div style="color:var(--muted); font-size:12.5px; text-align:center; padding:6px;">+${clinicBuyers.length-40} more</div>`:'');
  return `
  <div class="chartcard" style="border-inline-start:4px solid var(--gold);">
    <h4>🧾 Customer sales — who bought & who didn't</h4>
    <div class="csub">${d.periodLabel} · from the uploaded sales files${d.maxDate?' · to '+fmtDate(d.maxDate):''}</div>
    <div class="kpi4" style="margin:10px 0 4px;">
      <div class="k"><div class="ki">${I('cart')}</div><div class="kn">${clinicBuyers.length}</div><div class="kl">Bought · ${money(buyersNet)}</div></div>
      <div class="k"><div class="ki">${I('target')}</div><div class="kn" style="color:${d.nonBuyers.length?'var(--coral-ink)':'var(--sage-ink)'};">${d.nonBuyers.length}</div><div class="kl">Didn't buy yet</div></div>
      <div class="k"><div class="ki">${I('globe')}</div><div class="kn">${money(channelNet)}</div><div class="kl">Online / channels</div></div>
      <div class="k"><div class="ki">${I('refresh')}</div><div class="kn" style="color:${returnedTotal>0?'var(--coral-ink)':'var(--sage-ink)'};">${money(returnedTotal)}</div><div class="kl">Returned</div></div>
    </div>
    ${donut}
  </div>
  <div class="chartcard"><h4>🏆 Top buyers</h4><div class="csub">Net KD in the period</div>${topBars}</div>
  <div class="chartcard"><h4>⭕ Didn't buy — by class</h4><div class="csub">A/B first: the money is there</div>${clsBars}</div>
  <div class="chip-row" style="margin:12px 0 10px;">
    <div class="chip small ${erpDashTab==='not'?'on':''}" onclick="erpDashTab='not'; renderClinicDash();">⭕ Didn't buy (${d.nonBuyers.length})</div>
    <div class="chip small ${erpDashTab==='bought'?'on':''}" onclick="erpDashTab='bought'; renderClinicDash();">🛒 Bought (${clinicBuyers.length})</div>
  </div>
  ${rows || '<div class="empty">Nothing here.</div>'}
  <div style="height:8px;"></div>`;
}
function renderClinicDash(){
  const el = document.getElementById('clinicDash');
  let pool = clinics.filter(c=>c.cls!=='Closed');
  if(clinicRepFilter!=='all') pool = pool.filter(c=>c.rep===clinicRepFilter);
  const closed = clinics.filter(c=>c.cls==='Closed' && (clinicRepFilter==='all'||c.rep===clinicRepFilter)).length;

  const stats = pool.map(c=>({c, s:clinicStats(c)}));
  const totRev = stats.reduce((a,x)=>a+x.s.rev,0);
  const totVisits = stats.reduce((a,x)=>a+x.s.visits,0);
  const totOrders = stats.reduce((a,x)=>a+x.s.orders,0);
  const totDisc = stats.reduce((a,x)=>a+x.s.disc,0);
  const active = stats.filter(x=>x.s.visits>0).length;
  const totDocs = stats.reduce((a,x)=>a+x.s.docs,0);
  const overdue = pool.filter(c=>followStatus(c.nextFollowUp)==='overdue');
  const never = stats.filter(x=>x.s.visits===0);
  const credit = pool.filter(c=>c.account==='Credit account').length;
  const cash = pool.filter(c=>c.account==='Cash based').length;
  const newC = pool.filter(c=>c.isNew).length;

  // class distribution
  const CLS=['A','B','C','D','F'];
  const byCls = CLS.map(k=>({k, n:pool.filter(c=>c.cls===k).length, c:clsColor(k)}));
  const unc = pool.filter(c=>!c.cls || !CLS.includes(c.cls)).length;
  const clsTotal = pool.length||1;

  // rankings
  const topRev = stats.filter(x=>x.s.rev>0).sort((a,b)=>b.s.rev-a.s.rev).slice(0,5);
  const topVis = stats.filter(x=>x.s.visits>0).sort((a,b)=>b.s.visits-a.s.visits).slice(0,5);
  const dormant = stats.filter(x=>x.s.daysSince!==null && x.s.daysSince>=21)
                       .sort((a,b)=>b.s.daysSince-a.s.daysSince).slice(0,5);
  const priorityUnseen = stats.filter(x=>(x.c.cls==='A'||x.c.cls==='B') && x.s.visits===0).slice(0,6);

  // doctors by specialty
  const spec={};
  pool.forEach(c=>(c.doctors||[]).forEach(d=>{ if(d.title) spec[d.title]=(spec[d.title]||0)+1; }));
  const specList = Object.entries(spec).sort((a,b)=>b[1]-a[1]);

  const rankRow = (i,name,sub,val)=>`<div class="rank">
      <div class="rn ${i===0?'top':''}">${i+1}</div>
      <div class="rinfo"><div class="rname">${esc(name)}</div><div class="rsub">${esc(sub)}</div></div>
      <div class="rval">${val}</div></div>`;

  el.innerHTML = `
  <div class="kpi4">
    <div class="k"><div class="ki">${I('building')}</div><div class="kn">${pool.length}</div><div class="kl">Active clinics</div></div>
    <div class="k"><div class="ki">${I('chart')}</div><div class="kn">${money(totRev)}</div><div class="kl">Total sales</div></div>
    <div class="k"><div class="ki">${I('calendar')}</div><div class="kn">${totVisits}</div><div class="kl">Visits logged</div></div>
    <div class="k"><div class="ki">${I('cart')}</div><div class="kn">${totOrders}</div><div class="kl">Orders \u00b7 ${totVisits?Math.round(totOrders/totVisits*100):0}% conv.</div></div>
    <div class="k"><div class="ki">${I('stethoscope')}</div><div class="kn">${totDocs}</div><div class="kl">Doctors on file</div></div>
    <div class="k"><div class="ki">${I('gift')}</div><div class="kn" style="color:var(--coral-ink);">${money(totDisc)}</div><div class="kl">Discount given</div></div>
  </div>

  ${erpDashSection()}

  <div class="chartcard">
    <h4>Coverage</h4>
    <div class="csub">${active} of ${pool.length} clinics visited \u00b7 ${pool.length?Math.round(active/pool.length*100):0}%</div>
    <div class="bar-track" style="height:12px;"><div class="bar-fill" style="width:${pool.length?Math.round(active/pool.length*100):0}%;"></div></div>
    <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--muted); margin-top:7px;">
      <span>\u2705 ${active} visited</span><span>\u2b55 ${never.length} never visited</span>
    </div>
  </div>

  <div class="chartcard">
    <h4>Portfolio by class</h4>
    <div class="csub">Sales potential mix</div>
    <div class="segbar">
      ${byCls.filter(x=>x.n).map(x=>`<div style="flex:${x.n}; background:${x.c}; cursor:pointer;" title="Class ${x.k}: ${x.n} — tap to list them" onclick="showClinicClass('${x.k}')">${x.n}</div>`).join('')}
      ${unc?`<div style="flex:${unc}; background:#C7C7CC; cursor:pointer;" title="Unclassified — tap to list them" onclick="showClinicClass('none')">${unc}</div>`:''}
    </div>
    <div class="seglegend">
      ${byCls.filter(x=>x.n).map(x=>`<span style="cursor:pointer;" onclick="showClinicClass('${x.k}')"><i class="swatch" style="background:${x.c}"></i>Class ${x.k} \u00b7 ${x.n} (${Math.round(x.n/clsTotal*100)}%)</span>`).join('')}
      ${unc?`<span style="cursor:pointer;" onclick="showClinicClass('none')"><i class="swatch" style="background:#C7C7CC"></i>Unclassified \u00b7 ${unc}</span>`:''}
    </div>
    <div class="csub" style="margin-top:6px;">Tap a class to see its clinics by name</div>
  </div>

  <div class="chartcard">
    <h4>Account mix</h4>
    <div class="csub">How these clinics buy</div>
    ${svgBars([
      {l:'Credit', v:credit, c:'#5E5CE6'},
      {l:'Cash', v:cash, c:'#022917'},
      {l:'Not set', v:Math.max(pool.length-credit-cash,0), c:'#C7C7CC'},
      {l:'New', v:newC, c:'#FF9500'}
    ])}
  </div>

  ${topRev.length?`<div class="chartcard"><h4>\u{1F3C6} Top clinics by sales</h4><div class="csub">Where the money actually comes from</div>
    ${topRev.map((x,i)=>rankRow(i, x.c.name, `Class ${x.c.cls||'-'} \u00b7 ${x.s.orders} order${x.s.orders===1?'':'s'} \u00b7 ${x.s.conv}% conv.`, money(x.s.rev))).join('')}
  </div>`:''}

  ${topVis.length?`<div class="chartcard"><h4>\u{1F45F} Most visited</h4><div class="csub">Where your time goes \u2014 compare against sales above</div>
    ${topVis.map((x,i)=>rankRow(i, x.c.name, `Class ${x.c.cls||'-'} \u00b7 ${money(x.s.rev)} earned`, x.s.visits)).join('')}
  </div>`:''}

  ${dormant.length?`<div class="chartcard"><h4>\u{1F4A4} Going quiet</h4><div class="csub">Visited before, but not recently</div>
    ${dormant.map((x,i)=>rankRow(i, x.c.name, `Class ${x.c.cls||'-'} \u00b7 last seen ${fmtDate(x.s.last)}`, x.s.daysSince+'d')).join('')}
  </div>`:''}

  <div class="chartcard">
    <h4>\u{1F6A8} Needs attention</h4>
    <div class="csub">Highest-value actions right now</div>
    ${overdue.length?`<div class="alertrow"><div class="ae">\u23F0</div><div><strong>${overdue.length} overdue follow-up${overdue.length===1?'':'s'}</strong><br><span style="color:var(--muted);">${esc(overdue.slice(0,3).map(c=>c.name).join(', '))}${overdue.length>3?' +'+(overdue.length-3)+' more':''}</span></div></div>`:''}
    ${priorityUnseen.length?`<div class="alertrow"><div class="ae">\u{1F48E}</div><div><strong>${priorityUnseen.length} A/B clinic${priorityUnseen.length===1?'':'s'} never visited</strong><br><span style="color:var(--muted);">${esc(priorityUnseen.slice(0,3).map(x=>x.c.name).join(', '))}${priorityUnseen.length>3?' +'+(priorityUnseen.length-3)+' more':''}</span></div></div>`:''}
    ${never.length?`<div class="alertrow"><div class="ae">\u2b55</div><div><strong>${never.length} clinic${never.length===1?'':'s'} with no visit yet</strong><br><span style="color:var(--muted);">Untapped territory.</span></div></div>`:''}
    ${totDisc>0 && totRev>0 && (totDisc/(totRev+totDisc))>0.15?`<div class="alertrow"><div class="ae">\u{1F3F7}\uFE0F</div><div><strong>Discounts are ${Math.round(totDisc/(totRev+totDisc)*100)}% of gross</strong><br><span style="color:var(--muted);">Worth reviewing pricing discipline.</span></div></div>`:''}
    ${closed?`<div class="alertrow"><div class="ae">\u{1F6AB}</div><div><strong>${closed} closed account${closed===1?'':'s'}</strong><br><span style="color:var(--muted);">Excluded from all figures above.</span></div></div>`:''}
    ${(!overdue.length && !priorityUnseen.length && !never.length)?`<div class="alertrow"><div class="ae">\u2705</div><div><strong>Nothing urgent.</strong><br><span style="color:var(--muted);">Full coverage, no overdue follow-ups. Excellent.</span></div></div>`:''}
  </div>

  <div class="chartcard">
    <h4>\u{1F468}\u200D\u2695\uFE0F Doctors by specialty</h4>
    <div class="csub">${totDocs} recorded \u00b7 tap for the selling playbook</div>
    ${specList.length? specList.map(([sp,n])=>{
      const pb=SPECIALTY_PLAYBOOK[sp];
      return `<div class="rank" style="cursor:pointer;" onclick="openPlaybook('${sp}')">
        <div style="width:30px; height:30px; border-radius:50%; background:${pb?pb.color+'22':'var(--paper)'}; display:flex; align-items:center; justify-content:center; font-size:15px;">${pb?pb.icon:'\u{1F464}'}</div>
        <div class="rinfo"><div class="rname">${esc(sp)}</div><div class="rsub">Tap for tips &amp; objections</div></div>
        <div class="rval">${n}</div></div>`;
    }).join('') : `<div style="color:var(--muted); font-size:13px;">No doctors recorded yet. Add them from any clinic to unlock specialty insights.</div>`}
  </div>

  <button class="btn secondary" onclick="setClinicMode('list')">\u{1F4CB} Browse full clinic list</button>
  `;
}

// Visit-count filter on the clinic list: everyone can see at a glance who was
// never visited, who gets attention, and what to do next for each clinic.
let clinicVisitFilter = 'all';   // 'all' | '0' | '1-2' | '3-5' | '6+'
function setClinicVisitFilter(v){ clinicVisitFilter = v; renderClinics(); }
let clinicClsFilter = 'all';     // 'all' | 'A'..'F' | 'none' (unclassified)
function setClinicClsFilter(v){ clinicClsFilter = v; renderClinics(); }
// From the dashboard's class bar: "which clinics are class A?" → the list, filtered.
function showClinicClass(k){ clinicClsFilter = k; clinicVisitFilter = 'all'; setClinicMode('list'); }
function clinicVisitBucket(n){ return n===0 ? '0' : n<=2 ? '1-2' : n<=5 ? '3-5' : '6+'; }
// What should happen next with this clinic — one honest line per card.
function clinicNextAction(c, stats){
  const fs = followStatus(c.nextFollowUp);
  if(fs==='overdue'){
    const days = daysBetween(c.nextFollowUp, todayStr());
    return {icon:I('bell'), cls:'overdue', text:`Follow-up overdue by ${days}d (${fmtDate(c.nextFollowUp)}) — reschedule it now`, reschedule:true};
  }
  if(fs==='today') return {icon:I('target'), cls:'today', text:'Follow-up due TODAY — keep the promise', reschedule:false};
  if(stats.total===0) return {icon:I('sparkles'), cls:'never', text:'Never visited — book a first visit', reschedule:false};
  if(stats.daysSince!=null && stats.daysSince>=30 && fs!=='upcoming')
    return {icon:I('coffee'), cls:'dormant', text:`Quiet for ${stats.daysSince}d — plan a revisit and set a follow-up`, reschedule:false};
  if(fs==='upcoming') return {icon:I('calendar'), cls:'ok', text:`Next follow-up ${fmtDate(c.nextFollowUp)}`, reschedule:false};
  return {icon:I('plus'), cls:'none', text:`Last visit ${stats.daysSince}d ago — no follow-up set, schedule one`, reschedule:false};
}
function renderClinics(){
  const q = (document.getElementById('clinicSearch').value||'').toLowerCase();
  const list = document.getElementById('clinicList');
  let filtered = clinics.filter(c=>c.name.toLowerCase().includes(q));
  if(clinicRepFilter !== 'all') filtered = filtered.filter(c=>c.rep===clinicRepFilter);
  // Visit stats per clinic: field visits + phone orders count as "visited",
  // call logs shown separately so a phone call never masks a missing visit.
  const statFor = {};
  filtered.forEach(c=>{
    const vs = visits.filter(v=>v.clinicId===c.id);
    const field = vs.filter(isFieldVisit).length; // true field visits only
    const calls = vs.filter(v=>v.callOnly).length;
    const last = vs.length ? vs.map(v=>v.date).sort().slice(-1)[0] : null;
    statFor[c.id] = {total:field, calls, last, daysSince: last?daysBetween(last, todayStr()):null};
  });
  // Filter chips with live counts — they answer "how many were never visited?"
  const buckets = {'all':filtered.length, '0':0, '1-2':0, '3-5':0, '6+':0};
  filtered.forEach(c=>{ buckets[clinicVisitBucket(statFor[c.id].total)]++; });
  const chipDefs = [
    ['all','All'], ['0','⭕ Never visited'], ['1-2','1–2 visits'], ['3-5','3–5 visits'], ['6+','6+ visits'],
  ];
  const chipsEl = document.getElementById('clinicVisitChips');
  if(chipsEl) chipsEl.innerHTML = chipDefs.map(([k,l])=>
    `<div class="chip small ${clinicVisitFilter===k?'on':''}" onclick="setClinicVisitFilter('${k}')">${l} (${buckets[k]})</div>`).join('');
  if(clinicVisitFilter!=='all') filtered = filtered.filter(c=>clinicVisitBucket(statFor[c.id].total)===clinicVisitFilter);
  // Class chips — the names behind each slice of the portfolio bar.
  const clsOf = c => (c.cls && c.cls!=='Closed') ? c.cls : 'none';
  const clsCounts = {all: filtered.length};
  filtered.forEach(c=>{ const k=clsOf(c); clsCounts[k]=(clsCounts[k]||0)+1; });
  const clsEl = document.getElementById('clinicClsChips');
  if(clsEl) clsEl.innerHTML = [['all','All classes'],['A','Class A'],['B','Class B'],['C','Class C'],['D','Class D'],['F','Class F'],['none','Unclassified']]
    .filter(([k])=>k==='all' || clsCounts[k] || clinicClsFilter===k)
    .map(([k,l])=>`<div class="chip small ${clinicClsFilter===k?'on':''}" onclick="setClinicClsFilter('${k}')">${l} (${clsCounts[k]||0})</div>`).join('');
  if(clinicClsFilter!=='all') filtered = filtered.filter(c=>clsOf(c)===clinicClsFilter);
  filtered.sort((a,b)=>{
    const order = {overdue:0, today:1, upcoming:2, none:3};
    const d = order[followStatus(a.nextFollowUp)] - order[followStatus(b.nextFollowUp)];
    if(d!==0) return d;
    // Within the same urgency: least-visited first, then class A→F.
    return statFor[a.id].total - statFor[b.id].total || String(a.cls||'Z').localeCompare(String(b.cls||'Z'));
  });
  if(filtered.length===0){
    list.innerHTML = `<div class="empty"><div class="big">No clinics here</div>Try another filter — or add a new customer and grow the territory.</div>`;
    return;
  }
  const actColor = {overdue:'var(--coral)', today:'#FF9500', never:'var(--teal)', dormant:'#FF9500', ok:'var(--sage)', none:'var(--muted)'};
  list.innerHTML = filtered.map(c=>{
    const st = statFor[c.id];
    const act = clinicNextAction(c, st);
    const visitTxt = st.total===0 ? '⭕ no visits yet' : `${st.total} visit${st.total===1?'':'s'}`;
    return `
    <div class="card clickable" style="border-inline-start:4px solid ${clsColor(c.cls)};" onclick="openClinicDetail('${c.id}')">
      <div class="row-between">
        <div class="row-between" style="gap:11px;">
          <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
          <div>
            <div class="clinic-name">${esc(c.name)}${c.isNew?' <span style="font-size:11px;">🆕</span>':''}</div>
            <div class="clinic-sub">${esc(c.rep||'')} · ${visitTxt}${st.calls?` · 📞 ${st.calls} call${st.calls===1?'':'s'}`:''}${st.last?` · last ${fmtDate(st.last)}`:''}${c.account?' · '+esc(c.account):''}</div>
            ${c.doctors.length?`<div style="margin-top:5px; font-size:15px;">${c.doctors.slice(0,6).map(d=>SPECIALTY_PLAYBOOK[d.title]?SPECIALTY_PLAYBOOK[d.title].icon:'👤').join(' ')}</div>`:''}
          </div>
        </div>
        <span class="badge ${followStatus(c.nextFollowUp)}">${statusLabel(c.nextFollowUp).split('·')[0].trim()}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--line);">
        <div style="flex:1; font-size:12.5px; line-height:1.45; color:${actColor[act.cls]||'var(--muted)'};">${act.icon} ${act.text}</div>
        ${act.reschedule?`<button class="chip small" onclick="event.stopPropagation(); openRescheduleFollowUp('${c.id}')">${I('calendar')} Reschedule</button>`:''}
      </div>
    </div>`;
  }).join('');
}

function openAddClinic(){
  showModal(`
    <h3 style="margin-top:0;">Add clinic</h3>
    <label>Clinic name</label>
    <input type="text" id="mClinicName" placeholder="e.g. Bright Smile Dental">
    <label>Assigned rep</label>
    <div class="chip-row" id="mClinicRep">${REPS.map((r,i)=>`<div class="chip ${i===0?'on':''}" data-rep="${r}" onclick="pickModalRep(this)">${r}</div>`).join('')}</div>
    <label>Class</label>
    <div class="chip-row" id="mClinicCls">${['A','B','C','D','F'].map(c=>`<div class="chip" data-cls="${c}" onclick="pickModalCls(this)">${c}</div>`).join('')}</div>
    <label>Account type</label>
    <div class="chip-row" id="mClinicAcct">${ACCOUNT_TYPES.map(a=>`<div class="chip" data-acct="${a}" onclick="pickModalCls(this)">${a}</div>`).join('')}</div>
    <label>How does this clinic work with us?</label>
    <div class="chip-row" id="mClinicDeal">
      <div class="chip" data-deal="direct" onclick="pickModalMulti(this)">🛒 Direct sales</div>
      <div class="chip" data-deal="prescription" onclick="pickModalMulti(this)">℞ Prescription</div>
    </div>
    <label>New customer?</label>
    <div class="chip-row" id="mClinicNew"><div class="chip" data-new="yes" onclick="pickModalCls(this)">${I('sparkles')} Yes, new customer</div><div class="chip on" data-new="no" onclick="pickModalCls(this)">Existing</div></div>
    <label>Contact person</label>
    <input type="text" id="mClinicContact" dir="auto" placeholder="Optional">
    <label>Phone</label>
    <input type="tel" id="mClinicPhone" placeholder="Optional">
    <button class="btn" onclick="submitAddClinic()">Save clinic</button>
  `);
}
function pickDocTitle(el){ const was = el.classList.contains('on'); el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on')); if(!was) el.classList.add('on'); }
function pickModalCls(el){ el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on')); el.classList.add('on'); }
// Multi-select chips (a clinic can work with us in more than one way)
function pickModalMulti(el){ el.classList.toggle('on'); }
function clinicIsRx(c){ return !!c && (c.dealType==='prescription' || c.dealType==='both'); }
function clinicIsDirect(c){ return !!c && (c.dealType==='direct' || c.dealType==='both'); }
function dealTypeOf(rx, direct){ return rx && direct ? 'both' : rx ? 'prescription' : direct ? 'direct' : null; }
function dealFromChips(sel){
  const on = Array.from(document.querySelectorAll(sel+' .chip.on')).map(x=>x.dataset.deal);
  return dealTypeOf(on.includes('prescription'), on.includes('direct'));
}
function dealTypeLabel(c, opts){
  const short = opts && opts.short;
  if(!c || !c.dealType) return '';
  const rx = clinicIsRx(c), dir = clinicIsDirect(c);
  if(rx && dir) return short ? '℞ + Direct' : '℞ Prescription + 🛒 Direct sales';
  if(rx) return short ? '℞ Rx' : '℞ Prescription';
  return short ? '🛒 Direct' : '🛒 Direct sales';
}
function pickModalRep(el){ el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on')); el.classList.add('on'); }
async function submitAddClinic(){
  const name = document.getElementById('mClinicName').value.trim();
  if(!name){ showToast('Enter a name'); return; }
  const dup = clinics.find(c=>c.name.toLowerCase()===name.toLowerCase());
  if(dup){ showToast('A clinic with this name already exists'); return; }
  const repEl = document.querySelector('#mClinicRep .chip.on');
  const rep = repEl ? repEl.dataset.rep : REPS[0];
  const clsEl = document.querySelector('#mClinicCls .chip.on');
  const acctEl2 = document.querySelector('#mClinicAcct .chip.on');
  const newEl2 = document.querySelector('#mClinicNew .chip.on');

  clinics.push(normalizeClinic({id:uid(), name, rep, cls: clsEl ? clsEl.dataset.cls : null,
    account: acctEl2?acctEl2.dataset.acct:null, dealType: dealFromChips('#mClinicDeal'), isNew: newEl2 ? newEl2.dataset.new==='yes' : false, addedOn: todayStr(), market:null, notes:'', contact: document.getElementById('mClinicContact').value.trim(), phone: document.getElementById('mClinicPhone').value.trim()}));
  await persist('clinics');
  closeModal();
  renderClinics();
  showToast('🌟 New clinic added — territory growing');
}

function openClinicDetail(id){
  const c = clinics.find(x=>x.id===id);
  if(!c){ openDeletedClinic(id); return; }
  if(!canViewClinic(c)){ showToast('🔒 This clinic belongs to '+(c.rep||'another rep')); return; }
  const cVisits = visits.filter(v=>v.clinicId===id).sort((a,b)=>b.date.localeCompare(a.date));
  const canPlan = currentUser.name===c.rep;
  showModal(`
    <h3 style="margin-top:0;">${esc(c.name)}</h3>
    <div class="clinic-sub" style="margin-bottom:12px;">${esc(c.rep||'')}${c.contact?' · '+esc(c.contact):''}${c.phone?' · '+esc(c.phone):''}</div>
    <div class="chip-row" style="margin-bottom:14px;">
      ${c.account?`<span class="chip small" style="background:var(--green-dim); color:var(--green-dark);">💳 ${esc(c.account)}</span>`:''}
      ${c.dealType?`<span class="chip small" style="background:var(--teal-dim); color:var(--teal);">${dealTypeLabel(c)}</span>`:''}
      ${c.isNew?`<span class="chip small" style="background:var(--amber-dim); color:var(--amber-ink);">${I('sparkles')} New customer</span>`:''}
    </div>
    <div style="display:flex; gap:8px; margin-bottom:16px;">
      <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
      <div class="badge ${followStatus(c.nextFollowUp)}">${statusLabel(c.nextFollowUp)}</div>
    </div>
    <button class="btn" onclick="quickLogFrom('${c.id}'); closeModal();">Log a visit here</button>
    <div class="chip-row" style="margin-top:10px;">
      <div class="chip small" onclick="openStandaloneOrder('${c.id}')">${I('cart')} Order only</div>
      <div class="chip small" onclick="openCallLog('${c.id}')">${I('phone')} Log a call</div>
      ${canPlan ? `<div class="chip small" onclick="addToPlan('${c.id}')">${I('calendar')} Today's plan</div>` : ''}
      ${currentUser.role==='supervisor' ? `<div class="chip small" onclick="openEditClinic('${c.id}')">${I('pencil')} Edit</div>` : ''}
    </div>

    ${sellGuideBlock(c)}

    <div class="section-title" style="margin-top:20px;">Clinic profile notes</div>
    <textarea id="profileNotesEdit" dir="auto" placeholder="Preferences, competitor products in use, best time to visit...">${esc(c.profileNotes)}</textarea>
    <button class="btn secondary small" onclick="saveProfileNotes('${c.id}')">Save notes</button>

    <div class="section-title" style="margin-top:20px;">Doctors</div>
    <div id="docListInModal">${renderDoctorRows(c)}</div>
    <input type="text" id="newDocName" dir="auto" placeholder="Doctor name">
    <div class="chip-row" id="newDocTitleChips" style="margin-top:8px;">${SPECIALTIES.map(t=>`<div class="chip small" data-title="${t}" onclick="pickDocTitle(this)">${SPECIALTY_PLAYBOOK[t].icon} ${t}</div>`).join('')}</div>
    <button class="btn secondary small" onclick="addDoctor('${c.id}')">Add doctor</button>
    ${decisionMapBlock(c)}

    <div class="section-title" style="margin-top:20px;">Order history</div>
    ${renderClinicOrders(id)}
    ${clinicErpSection(id)}

    <div class="section-title" style="margin-top:20px;"><span>${I('chat')} No-sales reason</span></div>
    <p style="color:var(--muted); font-size:12px; margin:0 0 6px;">If this account isn't buying yet, note why (e.g. prescription-only, budget cycle, stock on hand) — shown in the management report.</p>
    <div style="display:flex; gap:6px; align-items:center;">
      <input type="text" value="${esc(c.noSaleReason||'')}" placeholder="e.g. Works on prescriptions — patients buy from pharmacy"
        onchange="saveNoSaleReason('${c.id}', this.value)" style="flex:1; margin:0;">
      <button class="chip small" style="flex-shrink:0;" onclick="saveNoSaleReason('${c.id}', this.parentElement.querySelector('input').value)">💾 Save</button>
    </div>

    <div class="section-title" style="margin-top:20px;">Visit history</div>
    ${cVisits.length===0 ? '<div style="color:var(--muted); font-size:13.5px;">No visits yet.</div>' :
      cVisits.map(v=>`<div class="visit-hist">${v.callOnly?`<em>${CHANNEL_LABELS[v.channel]||'📞 Call'}${v.contactName?' with '+esc(v.contactName):''}</em> · `:''}<strong>${fmtDate(v.date)}</strong>${v.orderTaken?' · '+money(v.orderTotal):''} · ${esc(v.rep)}${jointTag(v)}${v.editHistory&&v.editHistory.length?` · <span style="color:var(--amber-ink); cursor:pointer;" onclick="event.stopPropagation(); showEditHistory('${v.id}')">✏️ edited</span>`:''}${contactNames(v,c)?`<br><span style="color:var(--muted); font-size:12.5px;">👥 ${esc(contactNames(v,c))}</span>`:''}${v.notes ? '<br>'+esc(v.notes) : ''}
        ${(v.photos&&v.photos.length)?`<div class="photo-row">${v.photos.map(ph=>`<img class="photo-thumb" src="${ph.thumb}" onclick="event.stopPropagation(); showLightbox('${ph.id}','${esc(c.name)}')">`).join('')}</div>`:''}
      </div>`).join('')}
  `);
}
function renderClinicOrders(clinicId){
  const rows = [];
  visits.filter(v=>v.clinicId===clinicId).forEach(v=>{
    (v.orders||[]).forEach(o=>rows.push({date:v.date, rep:v.rep, o}));
  });
  if(rows.length===0) return `<div style="color:var(--muted); font-size:13.5px;">No orders yet.</div>`;
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  const lifetime = rows.reduce((s,r)=>s+(r.o.total||0),0);
  const savedTotal = rows.reduce((s,r)=>s+(r.o.discountAmount||0),0);
  return `<div class="card" style="background:var(--teal-dim); margin-bottom:10px;">
      <div class="row-between"><span style="font-size:13px;">Lifetime order value</span><strong>${money(lifetime)}</strong></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:4px;"><span>Total discount given</span><span>${money(savedTotal)}</span></div>
      <div class="row-between" style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Orders placed</span><span>${rows.length}</span></div>
    </div>` +
    rows.map(r=>{
      const items = r.o.items.map(it=>orderItemName(it)+' ×'+it.qty).join(', ');
      return `<div class="visit-hist">
        <strong>${fmtDate(r.date)}</strong> · ${money(r.o.total)}${r.o.discountPct?` <span style="color:var(--coral-ink);">(−${r.o.discountPct}%)</span>`:''} · ${esc(r.rep)}
        <br>${esc(items)}${r.o.notes?'<br><em>'+esc(r.o.notes)+'</em>':''}
      </div>`;
    }).join('');
}
// ---- PER-CLINIC ERP LEDGER: returns & free/marketing goods + justifications ----
// Every clinic account shows ITS OWN returns and giveaway lines from the
// uploaded sales files, and the team writes a reason against each event.
// Notes are keyed by kind|doc|product so they survive re-imports.
function erpNoteKey(kind, r){ return kind+'|'+(r.doc||'')+'|'+(r.product||''); }
function erpNoteText(key){ const n = erpNotes[key]; return n ? n.text : ''; }
async function saveErpNote(key, val){
  const t = (val||'').trim();
  const prev = erpNotes[key] || {};
  if(t || prev.kind) erpNotes[key] = {text:t, by:currentUser.name, on:todayStr(), kind: prev.kind};
  else delete erpNotes[key];
  await persist('erpNotes');
  showToast(t ? '📝 Reason saved' : 'Reason cleared');
}
// Free lines carry a classification: bonus inside a paying deal vs a
// sample/marketing giveaway. The heuristic sets the default; one tap fixes it.
function focKindOf(key, def){ const n = erpNotes[key]; return (n && n.kind) || def || 'sample'; }
async function saveErpNoteKind(key, kind, el){
  const n = erpNotes[key] || {};
  n.kind = kind; n.by = n.by || currentUser.name; n.on = n.on || todayStr();
  erpNotes[key] = n;
  await persist('erpNotes');
  if(el && el.parentElement) el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c===el));
  showToast(kind==='deal' ? '🤝 Marked: bonus within a deal' : '🎁 Marked: sample / marketing');
}
// Is this ERP line a marked EXCHANGE (تبديل)? Stock swap, not a real return.
function isExchangeLine(r){
  const n = erpNotes[erpNoteKey('ret', r)];
  return !!(n && n.kind === 'exchange');
}
function retKindChips(r){
  const key = erpNoteKey('ret', r);
  const k = (erpNotes[key] && erpNotes[key].kind) === 'exchange' ? 'exchange' : 'return';
  return `<div class="chip-row" style="margin-top:6px;" onclick="event.stopPropagation()">
    <div class="chip small ${k==='return'?'on':''}" onclick="saveRetKind('${esc(key)}','return',this)">↩️ Return / مرتجع</div>
    <div class="chip small ${k==='exchange'?'on':''}" onclick="saveRetKind('${esc(key)}','exchange',this)">🔁 Exchange / تبديل</div>
  </div>`;
}
async function saveRetKind(key, kind, el){
  const n = erpNotes[key] || {};
  if(kind === 'exchange') n.kind = 'exchange'; else delete n.kind;
  n.by = currentUser.name; n.on = todayStr();
  if(!n.text && !n.kind && kind !== 'exchange' && !erpNotes[key]){ /* nothing to keep */ }
  erpNotes[key] = n;
  await persist('erpNotes');
  if(el && el.parentElement) el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c===el));
  renderView(activeView);
  showToast(kind==='exchange' ? '🔁 Marked as exchange — removed from the returns figures' : '↩️ Marked as a real return');
}
function focKindChips(key, def){
  const k = focKindOf(key, def);
  return `<div class="chip-row" style="margin-top:6px;" onclick="event.stopPropagation()">
    <div class="chip small ${k==='deal'?'on':''}" onclick="saveErpNoteKind('${esc(key)}','deal',this)">🤝 Deal bonus</div>
    <div class="chip small ${k==='sample'?'on':''}" onclick="saveErpNoteKind('${esc(key)}','sample',this)">🎁 Sample / marketing</div>
  </div>`;
}
async function saveNoSaleReason(clinicId, val){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c) return;
  if(!canViewClinic(c)){ showToast('🔒 Not your clinic'); return; }
  c.noSaleReason = (val||'').trim();
  await persist('clinics');
  showToast(c.noSaleReason ? '📝 Reason saved' : 'Reason cleared');
}
function clinicErpLedger(clinicId){
  const ret = [], all = [];
  erpPeriods().forEach(p => erpViewRows(p).forEach(r => all.push(r)));
  const focAll = UMCore.focLinesAnnotated(all);
  all.forEach(r => {
    const m = UMCore.matchCustomer((r.customer||'').trim() || '(no name)', clinics, erpMap);
    if(m.clinicId !== clinicId) return;
    const rv = UMCore.returnValue(r);
    if(rv > 0) ret.push(Object.assign({}, r, {retAmount: Math.round(rv*1000)/1000}));
  });
  const foc = focAll.filter(r => {
    const m = UMCore.matchCustomer((r.customer||'').trim() || '(no name)', clinics, erpMap);
    return m.clinicId === clinicId;
  });
  const byDate = (a,b)=>(b.date||'').localeCompare(a.date||'');
  ret.sort(byDate); foc.sort(byDate);
  return {ret, foc};
}
function erpNoteInput(key){
  return `<input type="text" data-key="${esc(key)}" value="${esc(erpNoteText(key))}"
    placeholder="Why? Add the reason…" dir="auto" onclick="event.stopPropagation()"
    onchange="saveErpNote(this.dataset.key, this.value)"
    style="margin-top:6px; font-size:12.5px; padding:7px 10px;">`;
}
function clinicErpSection(clinicId){
  const led = clinicErpLedger(clinicId);
  if(!led.ret.length && !led.foc.length) return '';
  const retRows = led.ret.map(r=>`<div class="visit-hist" style="border-inline-start:3px solid ${isExchangeLine(r)?'var(--gold)':'var(--coral)'}; padding-inline-start:10px;">
      <strong>${fmtDate(r.date)}</strong> · ${esc(r.product||r.brand)}${r.qty?` ×${r.qty}`:''} · <span style="color:var(--coral-ink); font-weight:700;">−${money(r.retAmount)}</span> <span style="color:var(--muted); font-size:11.5px;">${esc(r.doc||'')}</span>
      ${retKindChips(r)}
      ${erpNoteInput(erpNoteKey('ret', r))}
    </div>`).join('');
  const focRows = led.foc.map(r=>{
    const key = erpNoteKey('foc', r);
    return `<div class="visit-hist" style="border-inline-start:3px solid var(--gold); padding-inline-start:10px;">
      <strong>${fmtDate(r.date)}</strong> · ${esc(r.product||r.brand)}${r.qty?` ×${r.qty}`:''} · free${r.gross?` <span style="color:var(--muted);">(worth ${money(r.gross)})</span>`:''} <span style="color:var(--muted); font-size:11.5px;">${esc(r.doc||'')}</span>
      ${focKindChips(key, r.kindDefault)}
      ${erpNoteInput(key)}
    </div>`;}).join('');
  return `
    ${led.ret.length?`<div class="section-title" style="margin-top:20px;">🔄 Returns from this account (${led.ret.length})</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 8px;">Write the reason under each line — it appears in the management report.</p>${retRows}`:''}
    ${led.foc.length?`<div class="section-title" style="margin-top:20px;">🎁 Marketing / free items to this account (${led.foc.length})</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 8px;">Free-of-charge and marketing-brand goods — justify each so the value shows as an investment, not a loss.</p>${focRows}`:''}`;
}

// The product catalog contains some repeated product codes (different items sharing
// an id). Resolving by id alone silently picks the wrong item and misprices orders,
// so prefer a unique row key when we have one and fall back to id.
function findProduct(key){
  return products.find(p => (p._key || p.id) === key) || products.find(p => p.id === key) || null;
}
function productKey(p){ return p._key || p.id; }
// Resolve a product name from any stored key (id or _key). Never silently
// blank: an unmatched key comes back as the raw key so exports stay honest
// instead of dropping the row's information.
function productName(key){
  const p = findProduct(key);
  return p ? p.name : String(key || '');
}
// Order items saved by the standalone-order flow carry a {name} snapshot —
// prefer the live catalog, fall back to the snapshot, then the raw id.
function orderItemName(it){
  const p = findProduct(it.productId);
  return p ? p.name : (it.name || String(it.productId || ''));
}
// Clinic name for exports/logs: live list first, then the recycle bin
// (deleted clinics keep their name in history), then an explicit marker —
// far more useful than a bare "Unknown".
function clinicNameOf(id, v){
  if(!id) return '(no clinic)';
  const c = clinics.find(x=>x.id===id);
  if(c) return c.name;
  if(v && v.clinicName) return v.clinicName + ' (deleted)'; // stamped at delete time
  const b = ((recycleBin && recycleBin.clinics)||[]).find(x=>x && x.id===id);
  return b ? b.name + ' (deleted)' : '(deleted clinic)';
}
function assignProductKeys(){
  const seen = {};
  products.forEach((p,i)=>{
    seen[p.id] = (seen[p.id]||0) + 1;
    p._key = seen[p.id] === 1 ? p.id : `${p.id}#${seen[p.id]}`;
  });
}

// ---- EDIT CLINIC ----
function openEditClinic(id){
  const c = clinics.find(x=>x.id===id);
  if(!c) return;
  showModal(`
    <h3 style="margin-top:0;">Edit clinic</h3>
    <label>Clinic name</label>
    <input type="text" id="ecName" value="${esc(c.name)}">
    <label>Assigned rep</label>
    <div class="chip-row" id="ecRep">${REPS.map(r=>`<div class="chip small ${c.rep===r?'on':''}" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>
    <label>Class</label>
    <div class="chip-row" id="ecCls">${['A','B','C','D','F'].map(x=>`<div class="chip small ${c.cls===x?'on':''}" data-cls="${x}" onclick="pickModalCls(this)">${x}</div>`).join('')}</div>
    <label>Account type</label>
    <div class="chip-row" id="ecAcct">${ACCOUNT_TYPES.map(a=>`<div class="chip small ${c.account===a?'on':''}" data-acct="${esc(a)}" onclick="pickModalCls(this)">${esc(a)}</div>`).join('')}</div>
    <label>How does this clinic work with us?</label>
    <div class="chip-row" id="ecDeal">
      <div class="chip small ${clinicIsDirect(c)?'on':''}" data-deal="direct" onclick="pickModalMulti(this)">🛒 Direct sales</div>
      <div class="chip small ${clinicIsRx(c)?'on':''}" data-deal="prescription" onclick="pickModalMulti(this)">℞ Prescription</div>
    </div>
    <label>Contact person</label>
    <input type="text" id="ecContact" value="${esc(c.contact||'')}" placeholder="Optional">
    <label>Phone</label>
    <input type="tel" id="ecPhone" value="${esc(c.phone||'')}" placeholder="Optional">
    <label>Status</label>
    <div class="chip-row" id="ecStatus">
      <div class="chip small ${c.cls!=='Closed'?'on':''}" data-st="open" onclick="pickModalCls(this)">Active</div>
      <div class="chip small ${c.cls==='Closed'?'on':''}" data-st="closed" onclick="pickModalCls(this)">Closed</div>
    </div>
    <button class="btn" onclick="saveEditClinic('${c.id}')">Save changes</button>
    <button class="btn ghost" onclick="deleteClinic('${c.id}')">Remove clinic</button>
  `);
  window._ecBase = clinicFormFields(c); // what the form was opened with — only fields the user changes are written
}
function clinicFormFields(c){
  return { name: c.name, rep: c.rep, cls: c.cls, account: c.account||null, dealType: c.dealType||null, contact: c.contact||'', phone: c.phone||'' };
}
async function saveEditClinic(id){
  if(!requireAdmin()) return;
  const c = clinics.find(x=>x.id===id);
  if(!c) return;
  const name = document.getElementById('ecName').value.trim();
  if(!name){ showToast('Enter a clinic name'); return; }
  const dup = clinics.find(x=>x.id!==id && x.name.toLowerCase()===name.toLowerCase());
  if(dup){ showToast('Another clinic already has that name'); return; }
  const repEl = document.querySelector('#ecRep .chip.on');
  const clsEl = document.querySelector('#ecCls .chip.on');
  const acctEl = document.querySelector('#ecAcct .chip.on');
  const stEl = document.querySelector('#ecStatus .chip.on');
  const closed = stEl && stEl.dataset.st==='closed';
  const form = { name, rep: repEl ? repEl.dataset.rep : c.rep, cls: closed ? 'Closed' : (clsEl ? clsEl.dataset.cls : null),
    account: acctEl ? acctEl.dataset.acct : null, dealType: dealFromChips('#ecDeal'),
    contact: document.getElementById('ecContact').value.trim(), phone: document.getElementById('ecPhone').value.trim() };
  // Another device may have edited this clinic while the form was open. Take
  // the freshest cloud copy for every field the user did NOT touch, and the
  // form's value only where they did — nobody's change is overwritten.
  const base = window._ecBase || {};
  let fresh = null;
  try{
    const cur = await withTimeout(window.storage.get('clinics', true), 5000);
    const arr = UMCore.safeParse(cur && cur.value, null);
    fresh = Array.isArray(arr) ? arr.find(x=>x && x.id===id) : null;
  }catch(e){}
  const same = (a, b) => JSON.stringify(a===undefined?null:a) === JSON.stringify(b===undefined?null:b);
  Object.keys(form).forEach(f=>{
    const touched = !(f in base) || !same(form[f], base[f]);
    if(touched) c[f] = form[f];
    else if(fresh && f in fresh && !same(fresh[f], c[f])) c[f] = fresh[f];
  });
  window._ecBase = null;
  await persist('clinics');
  closeModal();
  showToast('✅ Clinic updated');
  renderAll();
  if(document.getElementById('clinicList')) renderClinics();
}

// ---- EDIT PRODUCT ----
function openEditProduct(key){
  const p = findProduct(key);
  if(!p) return;
  const sharing = products.filter(x=>x.id===p.id).length;
  const mySpecs = new Set(p.specialties||[]);
  showModal(`
    <h3 style="margin-top:0;">Edit product</h3>
    <label>Product name</label>
    <input type="text" id="epName" value="${esc(p.name)}">
    <label>Brand</label>
    <input type="text" id="epBrand" value="${esc(p.brand||'')}">
    <label>Product code</label>
    <input type="text" id="epCode" value="${esc(p.id)}">
    ${sharing>1?`<p style="color:var(--coral-ink); font-size:12.5px; margin-top:6px;">⚠️ ${sharing} products share this code. Giving each a unique code prevents pricing mistakes.</p>`:''}
    <label>Price (KD)</label>
    <input type="number" step="0.01" min="0" id="epPrice" value="${p.price!=null?p.price:''}">
    <label>Description</label>
    <textarea id="epDesc" placeholder="Short product description shown to the whole team">${esc(p.desc||'')}</textarea>
    <label>Recommend for these doctor specialties</label>
    <p style="color:var(--muted); font-size:12px; margin:-4px 0 8px;">Tag the specialties this product is a good fit for — it'll show up under "Lead with these products" in that specialty's playbook.</p>
    <div class="chip-row" id="epSpecialtyChips">${SPECIALTIES.map(t=>`<div class="chip small ${mySpecs.has(t)?'on':''}" data-spec="${esc(t)}" onclick="this.classList.toggle('on')">${SPECIALTY_PLAYBOOK[t].icon} ${t}</div>`).join('')}</div>
    <button class="btn" onclick="saveEditProduct('${esc(key)}')">Save changes</button>
    <button class="btn ghost" onclick="removeProduct('${esc(key)}')">Remove product</button>
  `);
}
async function saveEditProduct(key){
  if(!requireAdmin()) return;
  const p = findProduct(key);
  if(!p) return;
  const name = document.getElementById('epName').value.trim();
  if(!name){ showToast('Enter a product name'); return; }
  const code = document.getElementById('epCode').value.trim();
  if(!code){ showToast('Enter a product code'); return; }
  const priceRaw = document.getElementById('epPrice').value;
  const price = priceRaw==='' ? null : parseFloat(priceRaw);
  if(price!==null && (isNaN(price) || price<0)){ showToast('Enter a valid price'); return; }
  const oldKey = productKey(p), oldId = p.id;
  p.name = name;
  p.brand = document.getElementById('epBrand').value.trim() || 'Other';
  p.id = code;
  p.price = price===null ? null : Math.round(price*100)/100;
  p.desc = document.getElementById('epDesc').value.trim();
  p.specialties = Array.from(document.querySelectorAll('#epSpecialtyChips .chip.on')).map(el=>el.dataset.spec);
  assignProductKeys();
  const saves = [persist('products')];
  if(code !== oldId){
    // every visit, order line and bin entry that pointed at the old key now points at the new one
    const newKey = productKey(p);
    const remap = v => {
      let hit = false;
      if(Array.isArray(v.products) && v.products.includes(oldKey)){ v.products = v.products.map(x=>x===oldKey?newKey:x); hit = true; }
      (v.orders||[]).forEach(o=>(o.items||[]).forEach(it=>{ if(it.productId===oldKey){ it.productId = newKey; hit = true; } }));
      (v.orderItems||[]).forEach(it=>{ if(it && it.productId===oldKey){ it.productId = newKey; hit = true; } });
      return hit;
    };
    const n = visits.filter(remap).length;
    const nb = (recycleBin.visits||[]).filter(remap).length;
    if(n) saves.push(persist('visits'));
    if(nb) saves.push(persist('recycleBin'));
  }
  await Promise.all(saves);
  closeModal();
  showToast('✅ Product updated');
  if(document.getElementById('productListWrap')) renderProducts();
  if(document.getElementById('apPriceBody')) renderAdminPrices();
}

// ---- RECYCLE BIN (soft delete) ----
const BIN_DAYS = 30;
async function moveToBin(kind, item, label){
  recycleBin[kind] = recycleBin[kind] || [];
  recycleBin[kind].push({...item, _deletedAt: Date.now(), _label: label});
  const ok = await persist('recycleBin');
  if(!ok){
    // The bin is a whole document (no offline queue): a delete whose safety
    // copy never landed would be a delete with no way back — refuse it.
    recycleBin[kind] = recycleBin[kind].filter(x=>x.id!==item.id);
    showToast('⚠️ لم يصل إلى سلة المحذوفات — لم يُحذف شيء، أعد المحاولة عند توفر الاتصال');
  }
  return ok;
}
function pruneBin(){
  const cutoff = Date.now() - BIN_DAYS*86400000;
  let changed = false;
  ['clinics','products','visits'].forEach(k=>{
    const before = (recycleBin[k]||[]).length;
    recycleBin[k] = (recycleBin[k]||[]).filter(x=>(x._deletedAt||0) > cutoff);
    if(recycleBin[k].length !== before) changed = true;
  });
  return changed;
}
function binCount(){ return ['clinics','products','visits'].reduce((s,k)=>s+(recycleBin[k]||[]).length,0); }
async function removeProduct(key){
  if(!requireAdmin()) return;
  const p = findProduct(key);
  if(!p) return;
  const idx = products.indexOf(p);
  if(idx<0) return;
  const copy = {...p}; delete copy._key;
  if(!await moveToBin('products', copy, p.name)) return;
  products.splice(idx,1);
  assignProductKeys();
  await persist('products');
  closeModal();
  showToast('Moved to recycle bin');
  if(document.getElementById('productListWrap')) renderProducts();
}
// A clinic the team still visits must stay REACHABLE even after deletion:
// tapping its name anywhere opens this read-only file from the recycle bin
// (or from what the visits themselves remember), with one-tap restore.
function openDeletedClinic(id){
  const binIdx = (recycleBin.clinics||[]).findIndex(x=>x && x.id===id);
  const b = binIdx >= 0 ? recycleBin.clinics[binIdx] : null;
  const cVisits = visits.filter(v=>v.clinicId===id).sort((a,b2)=>b2.date.localeCompare(a.date));
  const name = b ? b.name : (cVisits.find(v=>v.clinicName)||{}).clinicName || 'Deleted clinic';
  const sup = currentUser.role === 'supervisor';
  showModal(`
    <h3 style="margin-top:0;">🗑️ ${esc(name)} <span style="color:var(--muted); font-size:12px; font-weight:400;">(deleted)</span></h3>
    <div class="nudge" style="margin-bottom:10px;">This clinic was removed from the list, but its history is safe. ${b?'It can be restored exactly as it was.':'It is no longer in the recycle bin — only the visit history below remains.'}</div>
    ${b?`<div class="card" style="margin-bottom:10px;">
      ${b.rep?`<div class="spec-row"><span class="k">Rep</span><span class="v">${esc(b.rep)}</span></div>`:''}
      ${b.cls?`<div class="spec-row"><span class="k">Class</span><span class="v">${esc(b.cls)}</span></div>`:''}
      ${b.contact?`<div class="spec-row"><span class="k">Contact</span><span class="v">${esc(b.contact)}</span></div>`:''}
      ${b.phone?`<div class="spec-row"><span class="k">Phone</span><span class="v">${esc(b.phone)}</span></div>`:''}
      ${(b.doctors||[]).length?`<div class="spec-row"><span class="k">Doctors</span><span class="v">${b.doctors.map(d=>esc(d.name)).join(' · ')}</span></div>`:''}
      ${b.notes?`<div style="font-size:12.5px; color:var(--muted); padding-top:6px;">${esc(b.notes)}</div>`:''}
    </div>`:''}
    <div class="section-title">🗓️ Visits (${cVisits.length})</div>
    ${cVisits.slice(0,8).map(v=>`<div class="visit-hist"><strong>${fmtDate(v.date)}</strong> · ${esc(v.rep)}${v.callOnly?' · '+(CHANNEL_LABELS[v.channel]||'📞'):''}${v.orderTaken?' · '+money(v.orderTotal):''}${v.notes?`<div style="color:var(--muted); font-size:12px;">${esc(v.notes.slice(0,90))}</div>`:''}</div>`).join('') || '<div style="color:var(--muted); font-size:13px;">No visits recorded.</div>'}
    ${cVisits.length>8?`<div style="color:var(--muted); font-size:12px; text-align:center; padding:4px;">+${cVisits.length-8} more</div>`:''}
    ${b && sup ? `<button class="btn" style="margin-top:12px;" onclick="restoreFromBin('clinics', ${binIdx}); closeModal();">♻️ Restore this clinic</button>` : ''}
    ${!b && sup ? `<button class="btn" style="margin-top:12px;" onclick="openRecreateClinic('${esc(id)}')">♻️ Re-create this clinic (keeps all its history)</button>` : ''}
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal()">Close</button>
  `);
}
// The recycle bin only holds a deleted clinic for a while — after that, the
// visits still remember its id and name, so the clinic can be RE-CREATED with
// the SAME internal id: every past visit, plan and ERP name-match reattaches
// to it instantly, as if it was never deleted.
function openRecreateClinic(id){
  if(!requireAdmin()) return;
  const cVisits = visits.filter(v=>v.clinicId===id);
  const name = ((cVisits.find(v=>v.clinicName)||{}).clinicName || '').trim();
  // the rep who visited it most is almost certainly its owner
  const repCount = {};
  cVisits.forEach(v=>{ if(v.rep) repCount[v.rep]=(repCount[v.rep]||0)+1; });
  const guessRep = Object.keys(repCount).sort((a,b)=>repCount[b]-repCount[a])[0] || REPS[0] || '';
  showModal(`
    <h3 style="margin-top:0;">♻️ Re-create clinic</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Its ${cVisits.length} logged visit${cVisits.length===1?'':'s'} reattach automatically.</p>
    <label>Clinic name</label>
    <input type="text" id="rcName" value="${esc(name)}" placeholder="Clinic name">
    <label>Rep</label>
    <div class="chip-row" id="rcRepChips">${REPS.map(r=>`<div class="chip ${r===guessRep?'on':''}" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>
    <label>Class</label>
    <div class="chip-row" id="rcClsChips">${['A','B','C'].map(k=>`<div class="chip ${k==='B'?'on':''}" data-cls="${k}" onclick="pickModalCls(this)">${k}</div>`).join('')}</div>
    <button class="btn" style="margin-top:12px;" onclick="confirmRecreateClinic('${esc(id)}')">Create</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal()">Cancel</button>
  `);
}
async function confirmRecreateClinic(id){
  const name = (document.getElementById('rcName').value||'').trim();
  if(!name){ showToast('Enter the clinic name'); return; }
  if(clinics.some(c=>c.id===id)){ showToast('This clinic is already back'); closeModal(); return; }
  const repEl = document.querySelector('#rcRepChips .chip.on');
  const clsEl = document.querySelector('#rcClsChips .chip.on');
  clinics.push(normalizeClinic({ id, name, rep: repEl?repEl.dataset.rep:(REPS[0]||''),
    cls: clsEl?clsEl.dataset.cls:'B', notes:'', addedOn: todayStr() }));
  untomb('clinics', id); // alive again — cleared from every delete log, team-wide
  await persist('clinics');
  closeModal();
  renderAll();
  showToast('♻️ Clinic re-created — all its history is attached');
  openClinicDetail(id);
}
async function restoreFromBin(kind, idx){
  if(!requireAdmin()) return;
  const item = (recycleBin[kind]||[])[idx];
  if(!item) return;
  const clean = {...item}; delete clean._deletedAt; delete clean._label;
  // Already live (a backup restore brought it back, or the other device
  // restored it first): never push a second copy with the same id.
  const liveList = kind==='clinics' ? clinics : kind==='products' ? products : visits;
  const alreadyLive = liveList.some(x => x && x.id === clean.id);
  if(!alreadyLive){
    if(kind==='clinics') clinics.push(normalizeClinic(clean));
    if(kind==='products'){ delete clean._key; products.push(clean); assignProductKeys(); }
    if(kind==='visits') visits.push(clean);
  }
  untomb(kind, clean.id);
  recycleBin[kind].splice(idx,1);
  const saves = [persist('recycleBin')];
  if(!alreadyLive) saves.push(persist(kind));
  if(kind==='visits'){
    // the clinic's "last visit" must reflect the restored visit
    const clinic = clinics.find(c=>c.id===clean.clinicId);
    if(clinic){
      const cv = visits.filter(x=>x.clinicId===clinic.id && isFieldVisit(x));
      const last = cv.length ? cv.map(x=>x.date).sort().slice(-1)[0] : null;
      if(last !== (clinic.lastVisit||null)){ clinic.lastVisit = last; saves.push(persist('clinics')); }
    }
  }
  await Promise.all(saves);
  showToast(alreadyLive ? '✅ Already restored' : '✅ Restored');
  renderAll();
  if(document.getElementById('apTabData')) { setAdminTab('data'); setDataSub('bin'); } // only refresh the bin view if it is open
}
async function purgeFromBin(kind, idx){
  if(!requireAdmin()) return;
  if(!(recycleBin[kind]||[])[idx]) return;
  recycleBin[kind].splice(idx,1);
  await persist('recycleBin');
  showToast('Permanently deleted');
  setAdminTab('data'); setDataSub('bin');
}
function adminBinHTML(){
  if(pruneBin()) persist('recycleBin');
  const total = binCount();
  if(!total) return `<div class="empty"><div class="big">🗑 Recycle bin is empty</div>Deleted items appear here for ${BIN_DAYS} days.</div>`;
  const labels = {clinics:'Clinic', products:'Product', visits:'Visit'};
  let html = `<p style="color:var(--muted); font-size:12.5px; margin-top:0;">Items are kept for ${BIN_DAYS} days, then removed automatically.</p>`;
  ['clinics','products','visits'].forEach(kind=>{
    (recycleBin[kind]||[]).forEach((item,i)=>{
      const days = Math.max(0, BIN_DAYS - Math.floor((Date.now()-(item._deletedAt||0))/86400000));
      html += `<div class="card" style="margin-bottom:8px;">
        <div class="row-between">
          <div style="flex:1;">
            <div class="clinic-name">${esc(item._label || item.name || labels[kind])}</div>
            <div class="clinic-sub">${labels[kind]} · ${days} day${days===1?'':'s'} left</div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="chip small" onclick="restoreFromBin('${kind}',${i})">Restore</button>
            <button class="del" onclick="purgeFromBin('${kind}',${i})">&times;</button>
          </div>
        </div>
      </div>`;
    });
  });
  return html;
}

