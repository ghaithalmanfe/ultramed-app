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
// Built from the supervisor's uploaded sales files: every ERP customer of the
// month with net + invoices + last invoice date, matched to app clinics; app
// clinics with no invoice in the month surface as the follow-up list. The
// lines are the month figure's own (UMCore.monthCustomerSales, v115): the
// card adds up to the Today figure and says how — clinics + online / channels
// + ignored accounts. Early in a month with no sales file yet it shows the
// last month that has one, and says so.
let erpDashTab = 'not';
function erpDashData(repOverride){
  const effRep = repOverride || clinicRepFilter;
  const ms = UMCore.monthCustomerSales(digestData(), { rep: effRep, fallback: true, isExchange: isExchangeLine });
  const fams = UMCore.clinicFamilies(clinics);
  // a shared account invoiced by two people is one line naming both
  const buyers = ms.accounts.map(a => ({ name: a.name, rep: a.reps.join(' + '), clinicId: a.clinicId, channel: a.channel, family: a.family,
    invoices: a.invoices, last: a.last, net: a.net, ret: a.ret }));
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
  return {buyers, nonBuyers, periodLabel: ms.current ? 'This month' : monthLabel(ms.month), maxDate: ms.last,
    hasData: ms.files > 0 || ms.missing > 0, ms, rep: effRep};
}
function erpDashRecon(d){
  try{ return erpDashReconHTML(d); }catch(e){ console.error('clinics card reconciliation', e); return ''; }
}
// How the card adds up to the month's sales (v115): clinics (the Bought list,
// linked to a clinic or not) + online / channels + ignored accounts = each
// person's month. For the running month that is the Today screen's figure,
// for an earlier month the Months report's — compared here, never assumed,
// and claimed only for the people that screen lists (the team for a
// supervisor, herself for a rep): someone off the team list can still be
// credited by the files (her clinics, her salesman) and is said to be.
function erpDashReconHTML(d){
  const ms = d.ms;
  if(!ms) return '';
  const sup = currentUser.role === 'supervisor';
  const listed = r => sup ? REPS.includes(r) : r === currentUser.name;
  const hasTarget = r => { const t = targets[r] || {}; return t.revenue > 0; };
  const amt = v => `<b dir="ltr" style="white-space:nowrap;">${money(v)}</b>`;
  const line = (part, label, v) => `<div class="row-between" data-part="${part}" style="gap:10px; padding:2px 0;"><span>${label}</span>${amt(v)}</div>`;
  const muted = t => `<div style="color:var(--muted); font-size:11.5px; margin-top:4px;"><span>${t}</span></div>`;
  const one = d.rep !== 'all';
  const p0 = { rep: d.rep, total: 0, clinics: 0, channels: 0, ignored: 0 };
  const parts = one ? (ms.people[0] || p0) : ms.totals;
  // the figure that screen shows for a person, from the same month pass; null when it shows none
  const data = digestData(), mtd = ms.mtd || {};
  const refFig = r => !listed(r) ? null
    : ms.current ? (hasTarget(r) ? UMCore.monthAchievement(r, data, mtd).amount : null)
    : (mtd[r] ? mtd[r].amount : 0);
  const off = [];   // a person whose figure here is not that screen's: said, never hidden
  const same = (r, v) => { const f = refFig(r); if(f == null) return false;
    if(Math.round(f * 100) !== Math.round(v * 100)){ off.push({ rep: r, ref: f }); return false; } return true; };
  const why = r => !listed(r) ? (ms.current ? 'not on the team list — not on the Today screen' : 'not on the team list — not in the Months report')
    : (ms.current && !hasTarget(r)) ? 'no sales target — no sales figure on the Today screen' : '';
  let totalLabel, oneNote = '';
  if(one){
    const ok = same(d.rep, parts.total);
    totalLabel = ms.current
      ? `<span><b>${esc(d.rep)}</b> · <span>${ok ? "Month's sales — the Today screen figure" : "Month's sales"}</span></span>`
      : `<span><b>${esc(monthLabel(ms.month))}</b> · <span>${ok ? 'sales as in the Months report' : 'sales'}</span></span>`;
    if(why(d.rep)) oneNote = muted(why(d.rep));
  } else {
    totalLabel = ms.current ? `<span>Month's sales — everyone</span>` : `<span><b>${esc(monthLabel(ms.month))}</b> · <span>everyone's sales</span></span>`;
  }
  let people = '';
  if(!one){
    let allSame = true;
    people = ms.people.map(p => {
      if(!same(p.rep, p.total)) allSame = false;
      const w = why(p.rep);
      const note = w ? ` <span style="color:var(--muted); font-size:11px;">· <span>${w}</span></span>` : '';
      return `<div class="row-between" data-person="${esc(p.rep)}" style="gap:10px; padding:1px 0;"><span><span>${esc(p.rep)}</span>${note}</span>${amt(p.total)}</div>`;
    }).join('');
    // "each as on that screen" only when every listed figure was checked against it
    const each = allSame ? muted(ms.current ? "Each person's figure is the one on the Today screen." : "Each person's figure is the one in the Months report.") : '';
    if(people) people = `<div style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--line);">${people}${each}</div>`;
  }
  let team = '';
  if(!one && ms.current && sup){
    // the Today card's Team line (teamTargetNow), on the same month pass
    const tt = teamTargetTotal(REPS.map(r => hasTarget(r) ? { goal: targets[r].revenue, ach: UMCore.monthAchievement(r, data, mtd).amount } : null));
    if(tt.n >= 1 && tt.pct != null && Math.round(tt.ach * 100) !== Math.round(ms.totals.total * 100))
      team = `<div data-part="team" style="color:var(--muted); font-size:11.5px; margin-top:4px;"><span>The Team line on the Today screen counts only team members with a sales target:</span> ${amt(tt.ach)}</div>`;
  }
  const offNote = off.map(x => `<div style="color:var(--coral-ink); font-size:11.5px; margin-top:4px;">⚠️ <b>${esc(x.rep)}</b> · <span>${ms.current ? 'The Today screen shows' : 'The Months report shows'}</span> ${amt(x.ref)} · <span>please report this difference.</span></div>`).join('');
  // "the Today screen shows 0" only when it shows a sales figure to be 0
  const todayZero = one ? (listed(d.rep) && hasTarget(d.rep)) : REPS.some(hasTarget);
  const noFile = ms.fallback ? `<div style="color:var(--amber-ink); font-size:11.5px; margin-top:4px;"><span>${todayZero ? 'No sales file for this month yet: the Today screen shows 0 until one is uploaded.' : 'No sales file for this month yet.'}</span></div>` : '';
  const missing = ms.missing ? `<div id="erpDashMissing" style="color:var(--amber-ink); font-weight:600; font-size:11.5px; line-height:1.55; margin-top:4px;">⚠️ ${ms.missing} <span>sales files did not load on this device — their invoices are not counted here.</span> <span class="link" style="color:var(--teal); cursor:pointer;" onclick="retryErpRows().then(() => { if(activeView === 'clinics' && clinicMode === 'dash') renderClinicDash(); }).catch(e => console.warn('retry sales rows', e))">🔄 <span>Load them again</span></span></div>` : '';
  return `<div id="erpDashRecon" style="margin:10px 0 4px; padding:9px 11px; border-radius:10px; background:var(--paper); font-size:12.5px; line-height:1.5;">
    <div style="font-weight:700; margin-bottom:4px;">🧮 <span>How this card adds up to the month's sales</span></div>
    ${line('clinics', 'Clinics — the Bought list', parts.clinics)}
    ${line('channels', 'Online / channels', parts.channels)}
    ${line('ignored', 'Ignored accounts', parts.ignored)}
    <div class="row-between" data-part="total" style="gap:10px; padding:4px 0 0; margin-top:3px; border-top:1px solid var(--line); font-weight:700;">${totalLabel}${amt(parts.total)}</div>
    ${oneNote}${people}${team}${offNote}
    ${muted('Online / channel and ignored accounts count in the month for the salesman who issued them; they are not in the clinic lists.')}
    ${noFile}${missing}
  </div>`;
}
function erpDashSection(){
  const d = erpDashData();
  if(!d.hasData) return `<div class="chartcard">${secHead('file', 'Customer sales (ERP)')}
    <div class="csub">Upload a sales file in Report → 📥 Import and every customer's buying status appears here.</div></div>`;
  const clinicBuyers = d.buyers.filter(b=>!b.channel);
  // the tiles are the reconciliation's own lines, so they add up on screen
  const recParts = d.rep !== 'all' ? (d.ms.people[0] || { clinics: 0, channels: 0 }) : d.ms.totals;
  const channelNet = recParts.channels;
  const buyersNet = recParts.clinics;
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
  <div class="chartcard cs-card">
    ${secHead('cart', "Customer sales — who bought & who didn't")}
    <div class="csub">${d.ms.current ? '<span>This month</span>' : `<b>${esc(d.periodLabel)}</b> · <span>the last month with a sales file</span>`}${d.ms.covered ? ` · <span>sales files to</span> ${fmtDate(d.ms.covered)}` : ''}</div>
    <div class="kpi4" style="margin:10px 0 4px;">
      <div class="k"><div class="ki">${I('cart')}</div><div class="kn">${clinicBuyers.length}</div><div class="kl">Bought · ${money(buyersNet)}</div></div>
      <div class="k"><div class="ki">${I('target')}</div><div class="kn" style="color:${d.nonBuyers.length?'var(--coral-ink)':'var(--sage-ink)'};">${d.nonBuyers.length}</div><div class="kl">Didn't buy yet</div></div>
      <div class="k"><div class="ki">${I('globe')}</div><div class="kn">${money(channelNet)}</div><div class="kl">Online / channels</div></div>
      <div class="k"><div class="ki">${I('refresh')}</div><div class="kn" style="color:${returnedTotal>0?'var(--coral-ink)':'var(--sage-ink)'};">${money(returnedTotal)}</div><div class="kl">Returned</div></div>
    </div>
    ${erpDashRecon(d)}
    ${donut}
  </div>
  <div class="chartcard">${secHead('award', 'Top buyers')}<div class="csub">${d.ms.current ? 'Net KD this month' : 'Net KD in the period'}</div>${topBars}</div>
  <div class="chartcard">${secHead('target', "Didn't buy — by class")}<div class="csub">A/B first: the money is there</div>${clsBars}</div>
  <div class="dash-toggle cs-tabs">
    <div class="dt ${erpDashTab==='not'?'on':''}" onclick="erpDashTab='not'; renderClinicDash();">⭕ Didn't buy (${d.nonBuyers.length})</div>
    <div class="dt ${erpDashTab==='bought'?'on':''}" onclick="erpDashTab='bought'; renderClinicDash();">🛒 Bought (${clinicBuyers.length})</div>
  </div>
  ${rows ? `<div class="lrows cs-rows">${rows}</div>` : '<div class="empty">Nothing here.</div>'}
  <div style="height:8px;"></div>`;
}
// A card's heading in the home screen's language: its icon in a pale-mint circle, then the words.
function secHead(icon, words){ return `<h4 class="sec-h"><span class="sec-ic" aria-hidden="true">${I(icon)}</span><span>${words}</span></h4>`; }
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
    <div class="k"><div class="ki">${I('chart')}</div><div class="kn">${money(totRev)}</div><div class="kl">Orders logged in visits · all time</div></div>
    <div class="k"><div class="ki">${I('calendar')}</div><div class="kn">${totVisits}</div><div class="kl">Visits logged</div></div>
    <div class="k"><div class="ki">${I('cart')}</div><div class="kn">${totOrders}</div><div class="kl">Orders \u00b7 ${totVisits?Math.round(totOrders/totVisits*100):0}% conv.</div></div>
    <div class="k"><div class="ki">${I('stethoscope')}</div><div class="kn">${totDocs}</div><div class="kl">Doctors on file</div></div>
    <div class="k"><div class="ki">${I('gift')}</div><div class="kn" style="color:var(--coral-ink);">${money(totDisc)}</div><div class="kl">Discount given</div></div>
  </div>

  ${erpDashSection()}

  <div class="chartcard">
    ${secHead('compass', 'Coverage')}
    <div class="csub">${active} of ${pool.length} clinics visited \u00b7 ${pool.length?Math.round(active/pool.length*100):0}%</div>
    <div class="bar-track" style="height:12px;"><div class="bar-fill" style="width:${pool.length?Math.round(active/pool.length*100):0}%;"></div></div>
    <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--muted); margin-top:7px;">
      <span>\u2705 ${active} visited</span><span>\u2b55 ${never.length} never visited</span>
    </div>
  </div>

  <div class="chartcard">
    ${secHead('layers', 'Portfolio by class')}
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
    ${secHead('pie', 'Account mix')}
    <div class="csub">How these clinics buy</div>
    ${svgBars([
      {l:'Credit', v:credit, c:'#5E5CE6'},
      {l:'Cash', v:cash, c:'#022917'},
      {l:'Not set', v:Math.max(pool.length-credit-cash,0), c:'#C7C7CC'},
      {l:'New', v:newC, c:'#FF9500'}
    ])}
  </div>

  ${topRev.length?`<div class="chartcard">${secHead('award', 'Top clinics by orders logged')}<div class="csub">Orders typed in visits, all time — invoices are in Customer sales above</div>
    ${topRev.map((x,i)=>rankRow(i, x.c.name, `Class ${x.c.cls||'-'} \u00b7 ${x.s.orders} order${x.s.orders===1?'':'s'} \u00b7 ${x.s.conv}% conv.`, money(x.s.rev))).join('')}
  </div>`:''}

  ${topVis.length?`<div class="chartcard">${secHead('activity', 'Most visited')}<div class="csub">Where your time goes \u2014 compare against sales above</div>
    ${topVis.map((x,i)=>rankRow(i, x.c.name, `Class ${x.c.cls||'-'} \u00b7 ${money(x.s.rev)} ordered`, x.s.visits)).join('')}
  </div>`:''}

  ${dormant.length?`<div class="chartcard">${secHead('clock', 'Going quiet')}<div class="csub">Visited before, but not recently</div>
    ${dormant.map((x,i)=>rankRow(i, x.c.name, `Class ${x.c.cls||'-'} \u00b7 last seen ${fmtDate(x.s.last)}`, x.s.daysSince+'d')).join('')}
  </div>`:''}

  <div class="chartcard">
    ${secHead('alert', 'Needs attention')}
    <div class="csub">Highest-value actions right now</div>
    ${overdue.length?`<div class="alertrow"><div class="ae">\u23F0</div><div><strong>${overdue.length} overdue follow-up${overdue.length===1?'':'s'}</strong><br><span style="color:var(--muted);">${esc(overdue.slice(0,3).map(c=>c.name).join(', '))}${overdue.length>3?' +'+(overdue.length-3)+' more':''}</span></div></div>`:''}
    ${priorityUnseen.length?`<div class="alertrow"><div class="ae">\u{1F48E}</div><div><strong>${priorityUnseen.length} A/B clinic${priorityUnseen.length===1?'':'s'} never visited</strong><br><span style="color:var(--muted);">${esc(priorityUnseen.slice(0,3).map(x=>x.c.name).join(', '))}${priorityUnseen.length>3?' +'+(priorityUnseen.length-3)+' more':''}</span></div></div>`:''}
    ${never.length?`<div class="alertrow"><div class="ae">\u2b55</div><div><strong>${never.length} clinic${never.length===1?'':'s'} with no visit yet</strong><br><span style="color:var(--muted);">Untapped territory.</span></div></div>`:''}
    ${totDisc>0 && totRev>0 && (totDisc/(totRev+totDisc))>0.15?`<div class="alertrow"><div class="ae">\u{1F3F7}\uFE0F</div><div><strong>Discounts are ${Math.round(totDisc/(totRev+totDisc)*100)}% of gross</strong><br><span style="color:var(--muted);">Worth reviewing pricing discipline.</span></div></div>`:''}
    ${closed?`<div class="alertrow"><div class="ae">\u{1F6AB}</div><div><strong>${closed} closed account${closed===1?'':'s'}</strong><br><span style="color:var(--muted);">Excluded from all figures above.</span></div></div>`:''}
    ${(!overdue.length && !priorityUnseen.length && !never.length)?`<div class="alertrow"><div class="ae">\u2705</div><div><strong>Nothing urgent.</strong><br><span style="color:var(--muted);">Full coverage, no overdue follow-ups. Excellent.</span></div></div>`:''}
  </div>

  <div class="chartcard">
    ${secHead('stethoscope', 'Doctors by specialty')}
    <div class="csub">${totDocs} recorded \u00b7 tap for the selling playbook</div>
    ${specList.length? specList.map(([sp,n])=>{
      const pb=SPECIALTY_PLAYBOOK[sp];
      return `<div class="rank" style="cursor:pointer;" onclick="openPlaybook('${sp}')">
        <div style="width:30px; height:30px; border-radius:50%; background:${pb?pb.color+'22':'var(--paper)'}; display:flex; align-items:center; justify-content:center; font-size:15px;">${pb?pb.icon:'\u{1F464}'}</div>
        <div class="rinfo"><div class="rname">${esc(sp)}</div><div class="rsub">Tap for tips &amp; objections</div></div>
        <div class="rval">${n}</div></div>`;
    }).join('') : `<div style="color:var(--muted); font-size:13px;">No doctors recorded yet. Add them from any clinic to unlock specialty insights.</div>`}
  </div>

  <button class="btn secondary" onclick="setClinicMode('list')">${I('clipboard')} <span>Browse full clinic list</span></button>
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
  renderNamelessCard();
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
  list.innerHTML = `<div class="lrows cl-rows">` + filtered.map(c=>{
    const st = statFor[c.id];
    const act = clinicNextAction(c, st);
    const visitTxt = st.total===0 ? '⭕ no visits yet' : `${st.total} visit${st.total===1?'':'s'}`;
    const nd = (c.doctors||[]).length;
    return `
    <div class="lrow cl-row" role="button" tabindex="0" onclick="openClinicDetail('${c.id}')" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openClinicDetail('${c.id}');}">
      <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
      <div class="lr-t">
        <div class="clinic-name">${esc(c.name)}${c.isNew?' <span style="font-size:11px;">🆕</span>':''}</div>
        <div class="clinic-sub">${[`${nd} doctor${nd===1?'':'s'}`, esc(c.rep||''), visitTxt, st.calls?`📞 ${st.calls} call${st.calls===1?'':'s'}`:'', st.last?`last ${fmtDate(st.last)}`:'', c.account?esc(c.account):''].filter(Boolean).map(x=>`<span>${x}</span>`).join('<span data-notr> · </span>')}</div>
        ${nd?`<div class="cl-spec">${c.doctors.slice(0,6).map(d=>SPECIALTY_PLAYBOOK[d.title]?SPECIALTY_PLAYBOOK[d.title].icon:'👤').join(' ')}</div>`:''}
        <div class="cl-act" style="color:${actColor[act.cls]||'var(--muted)'};"><span>${act.icon} ${act.text}</span>${act.reschedule?`<button class="chip small" onclick="event.stopPropagation(); openRescheduleFollowUp('${c.id}')">${I('calendar')} Reschedule</button>`:''}</div>
      </div>
      <span class="badge ${followStatus(c.nextFollowUp)}">${statusLabel(c.nextFollowUp).split('·')[0].trim()}</span>
    </div>`;
  }).join('') + `</div>`;
}

// ---- Clinics without a name (v119) ----
// The August restore could bring some clinics back only without a name
// ("⚠️ Restored clinic — rename me"); every list hid them, with their visits.
// Their owner (and the supervisor) sees them here, with what the visits say,
// and names them: a new name shows the clinic again; the name of a clinic
// already in the list moves the visits there and drops the empty record.
function namelessMine(){
  if(!currentUser) return [];
  const sup = currentUser.role === 'supervisor';
  return (hiddenPlaceholderClinics || []).filter(c => c && !tombSet('clinics').has(c.id) && (sup || c.rep === currentUser.name));
}
function renderNamelessCard(){
  const el = document.getElementById('namelessCard');
  if(!el) return;
  const n = namelessMine().length;
  const lost = UMCore.lostDoctors(clinics.filter(canNameForClinic), visits, tombSet('doctors'));
  const nd = Object.keys(lost).reduce((s, k) => s + lost[k].length, 0), nc = Object.keys(lost).length;
  const dups = currentUser && currentUser.role === 'supervisor' ? dupDoctorsFor(clinics).length : 0;
  el.innerHTML = (dups ? `<div class="card clickable" style="margin-top:12px; border-inline-start:4px solid var(--amber); background:var(--amber-dim);" onclick="openDupDoctors('')">
      <div style="font-weight:700; font-size:13.5px;">⚠️ ${dups} <span>possible duplicate doctors</span></div>
      <div style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Two records with one name at the same clinic. Both are kept until you check them.</span></div>
    </div>` : '') + (n ? `<div class="card clickable" style="margin-top:12px; border-inline-start:4px solid var(--amber); background:var(--amber-dim);" onclick="openNamelessClinics()">
      <div style="font-weight:700; font-size:13.5px;">⚠️ ${n} <span>clinics from August have no name</span></div>
      <div style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Their visits are kept. Tap to name them — they show again in the list.</span></div>
    </div>` : '') + (nd ? `<div class="card clickable" style="margin-top:12px; border-inline-start:4px solid var(--amber); background:var(--amber-dim);" onclick="openLostDoctors('')">
      <div style="font-weight:700; font-size:13.5px;">⚠️ ${nd} <span>doctors from earlier visits have no name</span> · ${nc} <span>clinics</span></div>
      <div style="font-size:12.5px; color:var(--muted); margin-top:2px;"><span>Their visits are kept. Tap to name them.</span></div>
    </div>` : '');
}
// Doctors the visits met and the clinic no longer lists (UMCore.lostDoctors):
// most were lost in August–September, before visits kept the names of the
// people met, and no backup or copy holds the names — the owner (or the
// supervisor) writes the name once and the doctor is back with the same id, so
// every visit, order and prescription of theirs joins them again.
function canNameForClinic(c){ return !!c && !!currentUser && (currentUser.role === 'supervisor' || c.rep === currentUser.name); }
function lostDoctorsOf(c){ return (c && UMCore.lostDoctors([c], visits, tombSet('doctors'))[c.id]) || []; }
function lostDoctorsLine(c){
  const n = canNameForClinic(c) ? lostDoctorsOf(c).length : 0;
  return n ? `<div class="card clickable" style="padding:8px 12px; border-inline-start:4px solid var(--amber); background:var(--amber-dim);" data-id="${esc(c.id)}" onclick="openLostDoctors(this.dataset.id)">
      <div style="font-weight:700; font-size:13px;">⚠️ ${n} <span>doctors from earlier visits have no name</span></div>
      <div style="font-size:12px; color:var(--muted);"><span>Their visits are kept. Tap to name them.</span></div>
    </div>` : '';
}
function openLostDoctors(scope){
  const list = clinics.filter(c => canNameForClinic(c) && (!scope || c.id === scope));
  const lost = UMCore.lostDoctors(list, visits, tombSet('doctors'));
  const kept = phoneCopyDoctors();   // what this phone still holds: offered, never applied on its own
  const body = list.filter(c => lost[c.id]).map(c => (scope ? '' : `<div class="section-title" dir="auto" style="margin-top:14px;">${esc(c.name)}</div>`) + lost[c.id].map(e => {
    const dates = e.visits.map(v => fmtDate(v.date)).filter((d, i, a) => a.indexOf(d) === i);
    const notes = e.visits.map(v => v.notes).filter(Boolean).slice(0, 2);
    const sugs = [], k = kept.get(c.id + '|' + e.id);
    if(k && k.name) sugs.push({ kind: 'copy', name: String(k.name), label: 'This phone kept this doctor:' });
    if(e.name && !sugs.some(x => UMCore.normDoctorName(x.name) === UMCore.normDoctorName(e.name))) sugs.push({ kind: 'visit', name: String(e.name), label: 'A visit recorded this name:' });
    const sugHTML = sugs.map(x => `<div style="font-size:12.5px; margin-top:6px;"><span>${x.label}</span> <b dir="auto">${esc(x.name)}</b>
        <div><button class="chip small" style="margin-top:4px;" data-c="${esc(c.id)}" data-d="${esc(e.id)}" data-name="${esc(x.name)}" data-kind="${x.kind}" data-scope="${esc(scope || '')}" onclick="nameLostDoctor(this.dataset.c, this.dataset.d, this.dataset.name, this.dataset.scope, this.dataset.kind)">✅ <span>Use this name</span></button></div>
      </div>`).join('');
    return `<div class="card" style="padding:10px 12px;" data-lostdoc="${esc(c.id + '|' + e.id)}">
      <div style="font-size:12.5px; color:var(--muted);">${e.visits.length} <span>visits</span> · ${dates.slice(0, 4).join(', ')}${dates.length > 4 ? ' …' : ''}</div>
      ${notes.map(t => `<div dir="auto" style="font-size:12.5px; margin-top:3px;">“${esc(t.slice(0, 120))}”</div>`).join('')}
      ${sugHTML}
      <div style="display:flex; gap:6px; margin-top:8px;">
        <input type="text" dir="auto" placeholder="Doctor name" style="flex:1; margin:0;">
        <button class="chip small" data-c="${esc(c.id)}" data-d="${esc(e.id)}" data-scope="${esc(scope || '')}" onclick="nameLostDoctor(this.dataset.c, this.dataset.d, this.parentElement.querySelector('input').value, this.dataset.scope, 'typed')">💾 Save</button>
      </div>
      <div style="margin-top:6px;"><button class="chip small" data-c="${esc(c.id)}" data-d="${esc(e.id)}" data-scope="${esc(scope || '')}" onclick="markDoctorGone(this.dataset.c, this.dataset.d, this.dataset.scope)"><span>Left the clinic or removed on purpose</span></button></div>
    </div>`;
  }).join('')).join('');
  showModal(`<h3 style="margin-top:0;" data-ic="stethoscope" data-tone="warn">⚠️ <span>Doctors without a name</span></h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-4px;"><span>Your visits met them, but their names were lost (most in August–September) and no backup holds them. Use a name this phone kept or a visit recorded, or write the name you remember: their visits, orders and prescriptions join it. Nothing changes until you tap. Leave empty anyone who left or was removed on purpose.</span></p>
    ${body || '<div class="empty"><span>Nothing left to name.</span></div>'}
    <button class="btn secondary" style="margin-top:8px;" data-scope="${esc(scope || '')}" onclick="closeModal(); if(this.dataset.scope) openClinicDetail(this.dataset.scope); else renderClinics();">Done</button>`);
}
// The visits of a clinic that name one doctor id
function visitsNaming(clinicId, docId){
  return visits.filter(v => v && v.clinicId === clinicId && ((Array.isArray(v.doctorIds) && v.doctorIds.includes(docId)) || v.doctorId === docId));
}
// A question asked inside the card it is about (the app's own confirm step:
// nothing changes until the second tap).
function askInCard(selector, html){
  const card = [...document.querySelectorAll('#modalInner [data-lostdoc], #modalInner [data-nameless], #modalInner [data-dupdoc]')].find(el => (el.dataset.lostdoc || el.dataset.nameless || el.dataset.dupdoc) === selector);
  if(card) card.innerHTML = html;
  return !!card;
}
async function nameLostDoctor(clinicId, docId, raw, scope, kind, confirmed){
  const name = String(raw || '').trim();
  if(!name){ showToast('Enter the doctor name'); return; }
  const busy = clinicId + '|' + docId;
  if(_namingBusy.has(busy)) return;
  const c = clinics.find(x => x && x.id === clinicId);
  if(!canNameForClinic(c) || !lostDoctorsOf(c).some(e => e.id === docId)){ openLostDoctors(scope); return; }
  const key = UMCore.normDoctorName(name);
  const same = key ? (c.doctors || []).find(d => d && UMCore.normDoctorName(d.name) === key) : null;
  if(same && !visitsComplete()){
    askInCard(busy, `<div style="font-size:13px; line-height:1.6;">⚠️ <span>Some months of visits did not load on this device, so not every visit could move. Nothing was changed.</span></div>
      <div style="margin-top:8px;"><button class="chip small" data-scope="${esc(scope || '')}" onclick="openLostDoctors(this.dataset.scope)"><span>OK</span></button></div>`);
    return;
  }
  if(!same && typeof confirmed === 'string' && confirmed){ showToast('This changed since you were asked — nothing was changed', 4000); openLostDoctors(scope); return; }
  if(same && confirmed !== 'same:' + same.id){
    // the same person was added again since: moving the visits to that record is a merge, so it is asked first
    const n = visitsNaming(clinicId, docId).length;
    askInCard(clinicId + '|' + docId, `<div style="font-size:13px; line-height:1.6;"><b dir="auto">${esc(same.name)}</b> <span>is already on this clinic's list.</span> <span>Move these visits to this doctor?</span> (${n} <span>visits</span>)</div>
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="chip small" data-c="${esc(clinicId)}" data-d="${esc(docId)}" data-name="${esc(name)}" data-kind="${esc(kind || '')}" data-scope="${esc(scope || '')}" data-ask="${esc('same:' + same.id)}" onclick="nameLostDoctor(this.dataset.c, this.dataset.d, this.dataset.name, this.dataset.scope, this.dataset.kind, this.dataset.ask)">✅ <span>Move the visits</span></button>
        <button class="chip small" data-scope="${esc(scope || '')}" onclick="openLostDoctors(this.dataset.scope)"><span>Cancel</span></button>
      </div>`);
    return;
  }
  _namingBusy.add(busy);
  try{
    if(same){
      const remap = Object.create(null); remap[docId] = same.id;
      let n = 0;
      visits.forEach(v => { if(v && v.clinicId === clinicId && UMCore.remapVisitDoctors(v, remap)) n++; });
      const r = await persistFor('visits');
      saveToast(r, 'visits', `✅ ${n} visits joined ${same.name}`, 4000); // what that save did: in the cloud, kept on this phone, refused, too large
    } else {
      // the record this phone kept (title, phone, notes…) when its name is the one used, else the name alone; same id either way
      const k = kind === 'copy' ? phoneCopyDoctors().get(clinicId + '|' + docId) : null;
      const base = k && UMCore.normDoctorName(k.name) === key ? JSON.parse(JSON.stringify(k)) : {};
      c.doctors = (c.doctors || []).concat([Object.assign({ title: '', phone: '', birthday: '', cadence: '', notes: '', handovers: [] }, base, { id: docId, name })]);
      const r = await persistFor('clinics');
      saveToast(r, 'clinics', `✅ ${name} is back on the clinic's list`, 4000);
    }
  } finally { _namingBusy.delete(busy); }
  renderAll();
  openLostDoctors(scope);
}
// A doctor who left the clinic or was removed on purpose: kept in the delete log
// for good, so the sheet stops offering them. Nothing else changes.
async function markDoctorGone(clinicId, docId, scope){
  const c = clinics.find(x => x && x.id === clinicId);
  if(!canNameForClinic(c) || !lostDoctorsOf(c).some(e => e.id === docId)){ openLostDoctors(scope); return; }
  tomb('doctors', clinicId + '|' + docId);
  const ok = await persistTombs();
  if(ok) showToast('✅ Taken off this list', 4000);
  else if(_saveParked.get('tombs') === 'refused') showToast(REFUSED_KEPT, 6000); // the rules refused it: kept on this phone, not sent (persistTombs)
  else showToast('⚠️ Taken off this list on this device — not saved to the cloud yet', 4000); // queued: it uploads by itself
  renderAll();
  openLostDoctors(scope);
}
// ---- Possible duplicate doctors (v123, the supervisor) ----
// Until v122 every phone collapsed two doctors of one clinic whose names
// matched once "Dr.", titles and punctuation were dropped, and the
// supervisor's phone wrote that back at start: the second record's phone,
// role and stage were lost and its visits moved — an automatic merge, against
// the owner's rule of 12 Nov. Now both records stay; the supervisor sees them
// here and decides by tap: the same person (merged — nothing either record
// held is lost, a differing value is written into the notes) or different
// people (never offered again).
function dupDoctorsFor(list){ return typeof UMCore.possibleDuplicateDoctors === 'function' ? UMCore.possibleDuplicateDoctors(list) : []; }
function dupDoctorsLine(c){
  if(!c || !currentUser || currentUser.role !== 'supervisor') return '';
  const n = dupDoctorsFor([c]).length;
  return n ? `<div class="card clickable" style="padding:8px 12px; border-inline-start:4px solid var(--amber); background:var(--amber-dim);" data-id="${esc(c.id)}" onclick="openDupDoctors(this.dataset.id)">
      <div style="font-weight:700; font-size:13px;">⚠️ ${n} <span>possible duplicate doctors</span></div>
      <div style="font-size:12px; color:var(--muted);"><span>Two records with one name. Tap to check.</span></div>
    </div>` : '';
}
// the record a merge keeps: the first on the clinic's list (the older one) —
// its id and name; every field of the other is kept (UMCore.mergeDoctorPair)
function dupKeepOf(c, g){ return g.doctors[0]; }
function dupDocFacts(c, d){
  const bits = [d.title, d.role, d.stage, d.phone, d.whatsapp, d.email].filter(x => x != null && String(x).trim() !== '').map(x => esc(String(x)));
  return `<div style="font-size:13px; margin-top:4px;"><b dir="auto">${esc(d.name || '—')}</b>${bits.length ? ' · <bdi>' + bits.join(' · ') + '</bdi>' : ''} · ${visitsNaming(c.id, d.id).length} <span>visits</span></div>`;
}
function openDupDoctors(scope){
  if(!currentUser || currentUser.role !== 'supervisor') return;
  const list = clinics.filter(c => c && (!scope || c.id === scope));
  const groups = dupDoctorsFor(list);
  const body = groups.map(g => {
    const c = clinics.find(x => x && x.id === g.clinicId);
    return (scope ? '' : `<div class="section-title" dir="auto" style="margin-top:14px;">${esc(c.name)}</div>`) + `<div class="card" style="padding:10px 12px;" data-dupdoc="${esc(g.clinicId + '|' + g.key)}">
      ${g.doctors.map(d => dupDocFacts(c, d)).join('')}
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="chip small" data-c="${esc(g.clinicId)}" data-k="${esc(g.key)}" data-scope="${esc(scope || '')}" onclick="mergeDupDoctors(this.dataset.c, this.dataset.k, this.dataset.scope)">🔗 <span>The same person — merge</span></button>
        <button class="chip small" data-c="${esc(g.clinicId)}" data-k="${esc(g.key)}" data-scope="${esc(scope || '')}" onclick="keepDupDoctors(this.dataset.c, this.dataset.k, this.dataset.scope)"><span>Different people — keep both</span></button>
      </div>
    </div>`;
  }).join('');
  showModal(`<h3 style="margin-top:0;" data-ic="users" data-tone="warn">⚠️ <span>Possible duplicate doctors</span></h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-4px;"><span>These doctors of one clinic have the same name once "Dr." and titles are left out. Both records are kept until you decide. Merging keeps everything either record holds: their visits, orders and prescriptions join one record. Nothing changes until you tap.</span></p>
    ${body || '<div class="empty"><span>Nothing left to check.</span></div>'}
    <button class="btn secondary" style="margin-top:8px;" data-scope="${esc(scope || '')}" onclick="closeModal(); if(this.dataset.scope) openClinicDetail(this.dataset.scope); else renderClinics();">Done</button>`);
}
const _dupBusy = new Set();
async function mergeDupDoctors(clinicId, key, scope, confirmed){
  if(!currentUser || currentUser.role !== 'supervisor') return;
  const c = clinics.find(x => x && x.id === clinicId);
  const g = c ? dupDoctorsFor([c]).find(x => x.key === key) : null;
  const sel = clinicId + '|' + key;
  if(!g){ showToast('This changed since you were asked — nothing was changed', 4000); openDupDoctors(scope); return; }
  if(_dupBusy.has(sel)) return;
  if(!visitsComplete()){
    askInCard(sel, `<div style="font-size:13px; line-height:1.6;">⚠️ <span>Some months of visits did not load on this device, so not every visit could move. Nothing was changed.</span></div>
      <div style="margin-top:8px;"><button class="chip small" data-scope="${esc(scope || '')}" onclick="openDupDoctors(this.dataset.scope)"><span>OK</span></button></div>`);
    return;
  }
  const keep = dupKeepOf(c, g), others = g.doctors.filter(d => d !== keep);
  const asked = 'merge:' + g.doctors.map(d => d.id).join(',') + '>' + keep.id;
  if(confirmed !== asked){
    // what the merge does, asked in the card first (the second tap applies it)
    let merged = keep, conflicts = [];
    others.forEach(d => { const m = UMCore.mergeDoctorPair(merged, d); merged = m.doctor; conflicts = conflicts.concat(m.conflicts); });
    const n = others.reduce((a, d) => a + visitsNaming(c.id, d.id).length, 0);
    askInCard(sel, `<div style="font-size:13px; line-height:1.6;"><span>Merge into</span> <b dir="auto">${esc(keep.name)}</b>: ${n} <span>visits of the other record join it.</span>${conflicts.length ? ` <span>Different values are kept in the notes:</span> <bdi>${[...new Set(conflicts)].map(esc).join(', ')}</bdi>.` : ''}</div>
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="chip small" data-c="${esc(clinicId)}" data-k="${esc(key)}" data-scope="${esc(scope || '')}" data-ask="${esc(asked)}" onclick="mergeDupDoctors(this.dataset.c, this.dataset.k, this.dataset.scope, this.dataset.ask)">✅ <span>Yes, merge</span></button>
        <button class="chip small" data-scope="${esc(scope || '')}" onclick="openDupDoctors(this.dataset.scope)"><span>Cancel</span></button>
      </div>`);
    return;
  }
  _dupBusy.add(sel);
  try{
    let merged = keep;
    others.forEach(d => { merged = UMCore.mergeDoctorPair(merged, d).doctor; });
    const remap = Object.create(null);
    others.forEach(d => { remap[d.id] = keep.id; });
    const gone = new Set(others.map(d => d.id));
    c.doctors = (c.doctors || []).filter(d => !(d && gone.has(d.id))).map(d => d === keep ? merged : d);
    c.doctorMerges = Object.assign({}, c.doctorMerges || {}, remap); // a visit a phone logged offline under the merged record still shows the kept one
    others.forEach(d => tomb('doctors', c.id + '|' + d.id));         // a stale copy of the clinic never brings the merged record back
    let n = 0;
    visits.forEach(v => { if(v && v.clinicId === c.id && UMCore.remapVisitDoctors(v, remap)) n++; });
    const rv = n ? await persistFor('visits') : null;
    const rc = await persistFor('clinics');
    saveToastAll([[rc, 'clinics'], [rv, 'visits']], `✅ ${others.length + 1} records are now one: ${keep.name}`, 4000);
  } finally { _dupBusy.delete(sel); }
  renderAll();
  openDupDoctors(scope);
}
async function keepDupDoctors(clinicId, key, scope){
  if(!currentUser || currentUser.role !== 'supervisor') return;
  const c = clinics.find(x => x && x.id === clinicId);
  const g = c ? dupDoctorsFor([c]).find(x => x.key === key) : null;
  if(!g){ openDupDoctors(scope); return; }
  const pairs = new Set(Array.isArray(c.distinctDoctors) ? c.distinctDoctors : []);
  for(let i = 0; i < g.doctors.length; i++) for(let j = i + 1; j < g.doctors.length; j++) pairs.add(UMCore.distinctPair(g.doctors[i].id, g.doctors[j].id));
  c.distinctDoctors = [...pairs].sort();
  const r = await persistTold('clinics');
  saveToast(r, 'clinics', '✅ Kept as different people', 4000);
  renderAll();
  openDupDoctors(scope);
}
// One spelling key for clinic names (case and spaces), as the nameless sheet's
// "already in the list" check always compared them.
function clinicNameKey(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
// A nameless record that turned out to be a clinic already listed: its visits,
// tasks and plan entries move there and the empty record goes (the delete log
// keeps a stale copy elsewhere from bringing it back). Memory only — the caller
// saves. → the number of visits moved
function repointClinic(fromId, toId){
  let n = 0;
  visits.forEach(v => { if(v && v.clinicId === fromId){ v.clinicId = toId; n++; } });
  tasks.forEach(t => { if(t && t.clinicId === fromId) t.clinicId = toId; });
  Object.keys(dayPlans || {}).forEach(d => Object.keys(dayPlans[d] || {}).forEach(r => {
    if(!Array.isArray(dayPlans[d][r])) return;
    dayPlans[d][r] = dayPlans[d][r].map(e => (typeof e === 'string' ? e : e && e.id) === fromId ? (typeof e === 'string' ? toId : Object.assign({}, e, { id: toId })) : e); }));
  tomb('clinics', fromId);
  hiddenPlaceholderClinics = hiddenPlaceholderClinics.filter(c => c && c.id !== fromId);
  return n;
}
function openNamelessClinics(){
  const list = namelessMine();
  // Suggestions only (v121): the record this phone kept under the same id, and
  // the name the app's own follow-up task recorded with it. A tap uses one; a
  // name another clinic already has, or one that would make sales lines count
  // for another person, is asked about first (nameNamelessClinic).
  const rec = UMCore.clinicNamesFromTasks(tasks, list.map(c => c.id)), kept = phoneCopyClinics();
  const rows = list.map(c => {
    const vs = visits.filter(v => v && v.clinicId === c.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const notes = vs.map(v => (v.notes || '').trim()).filter(Boolean).slice(0, 2);
    const sugs = [], k = kept.get(c.id);
    if(k) sugs.push({ kind: 'copy', name: String(k.name), label: 'This phone kept its record:' });
    if(rec[c.id] && !sugs.some(x => clinicNameKey(x.name) === clinicNameKey(rec[c.id]))) sugs.push({ kind: 'task', name: rec[c.id], label: 'The app recorded its name:' });
    const sugHTML = sugs.map(x => `<div style="font-size:12.5px; margin-top:6px;"><span>${x.label}</span> <b dir="auto">${esc(x.name)}</b>
        <div><button class="chip small" style="margin-top:4px;" data-id="${esc(c.id)}" data-name="${esc(x.name)}" data-kind="${x.kind}" onclick="nameNamelessClinic(this.dataset.id, this.dataset.name, this.dataset.kind)">✅ <span>Use this name</span></button></div>
      </div>`).join('');
    return `<div class="card" style="padding:10px 12px;" data-nameless="${esc(c.id)}">
      <div style="font-size:12.5px; color:var(--muted);">${esc(c.rep || '—')} · ${vs.length} <span>visits</span>${vs.length ? ' · ' + vs.map(v => fmtDate(v.date)).filter((d, i, a) => a.indexOf(d) === i).join(', ') : ''}</div>
      ${notes.map(t => `<div dir="auto" style="font-size:12.5px; margin-top:3px;">“${esc(t.slice(0, 120))}”</div>`).join('')}
      ${sugHTML}
      <div style="display:flex; gap:6px; margin-top:8px;">
        <input type="text" dir="auto" placeholder="Clinic name" style="flex:1; margin:0;">
        <button class="chip small" data-id="${esc(c.id)}" onclick="nameNamelessClinic(this.dataset.id, this.parentElement.querySelector('input').value, 'typed')">💾 Save</button>
      </div>
    </div>`;
  }).join('');
  showModal(`<h3 style="margin-top:0;" data-ic="building" data-tone="warn">⚠️ <span>Clinics without a name</span></h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-4px;"><span>Lost in August and brought back without their name. Use a name the app or this phone kept, or write it. Nothing changes until you tap; if another clinic already has the name, or sales would count for another person, you are asked first.</span></p>
    ${rows || '<div class="empty"><span>Nothing left to name.</span></div>'}
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal(); renderClinics();">Done</button>`);
}
// The record a phone kept, back under the placeholder's id: its name, details
// and doctors, with the placeholder's owner/class/dates where the copy has none.
function restoredFromCopy(h, kept){
  const c = Object.assign({}, JSON.parse(JSON.stringify(kept)), { id: h.id });
  // who owns it (and so whom its sales count for) stays as it is today, never the copy's
  ['rep', 'prevRep', 'repSince', 'shared', 'sharedSince'].forEach(f => { if(h[f] !== undefined) c[f] = h[f]; else delete c[f]; });
  ['cls', 'lastVisit', 'nextFollowUp'].forEach(f => { if(h[f] != null && h[f] !== '' && (c[f] == null || c[f] === '')) c[f] = h[f]; });
  c.doctors = UMCore.mergeDoctorLists(Array.isArray(c.doctors) ? c.doctors : [], Array.isArray(h.doctors) ? h.doctors : []).doctors;
  return c;
}
// What can be checked on this phone right now: a name that starts matching an ERP
// account is checked against the sales files whose rows are here, and a merge
// moves the visits this phone holds — with a file or a month missing, neither
// can be complete, so nothing is done.
function salesCheckComplete(){ return !_loadFailed.erpSales && !_mirrorUsed.erpSales && !_loadFailed.erpMap && !_mirrorUsed.erpMap && !erpPeriods().some(p => p && p.rowsMissing); }
function visitsComplete(){ return !_loadFailed.visits && !_mirrorUsed.visits && !(_visitsBroken && _visitsBroken.length) && !keptMonthsOnScreen(); } // (a past month from the phone's store is not read yet, v126 review)
const _namingBusy = new Set();   // one tap at a time per record: a double tap never runs twice
function namelessNotice(id, text){
  askInCard(id, `<div style="font-size:13px; line-height:1.6;">⚠️ <span>${text}</span></div>
    <div style="margin-top:8px;"><button class="chip small" onclick="openNamelessClinics()"><span>OK</span></button></div>`);
}
async function nameNamelessClinic(id, raw, kind, confirmed){
  const name = String(raw || '').trim();
  if(!name || isPlaceholderClinic({ name })){ showToast('Enter the clinic name'); return; }
  if(_namingBusy.has(id)) return;
  const h = (hiddenPlaceholderClinics || []).find(c => c && c.id === id);
  if(!h || !(currentUser.role === 'supervisor' || h.rep === currentUser.name)) return;
  if(tombSet('clinics').has(id)){ namelessNotice(id, 'This clinic was already handled on another device. Nothing was changed.'); return; }
  const sames = clinics.filter(c => c && clinicNameKey(c.name) === clinicNameKey(name));
  // a name two clinics carry, or (for a rep) another rep's clinic: the supervisor decides
  if(sames.length > 1 || (sames.length === 1 && currentUser.role !== 'supervisor' && sames[0].rep !== h.rep)){
    namelessNotice(id, 'Another clinic already has this name. The supervisor decides where these visits belong. Nothing was changed.'); return;
  }
  const same = sames[0] || null;
  if(same && !visitsComplete()){ namelessNotice(id, 'Some months of visits did not load on this device, so not every visit could move. Nothing was changed.'); return; }
  if(!same && !salesCheckComplete()){ namelessNotice(id, 'Some sales files did not load on this device, so what this name would move cannot be checked. Nothing was changed.'); return; }
  const k = kind === 'copy' ? phoneCopyClinics().get(id) : null;
  const kOk = !!(k && clinicNameKey(k.name) === clinicNameKey(name));
  const next = same ? null : normalizeClinic(kOk ? restoredFromCopy(h, k) : Object.assign({}, h, { name }));
  // a name that starts matching an ERP account moves those lines to the clinic's owner: shown before it happens
  const moves = next ? UMCore.erpAddClinicMoves({ erpSales, clinics, erpMap }, [next]) : [];
  // the second tap answers ONE question: if what would happen changed since, the new question is asked instead
  const asked = same ? 'same:' + same.id : (moves.length ? 'moves:' + moves.map(m => [m.customer, m.date, m.from, m.to].join('|')).sort().join(';') : '');
  // the doctors the nameless record carries (and the copy's, when the copy was tapped) join the clinic too
  const carry = same ? (Array.isArray(h.doctors) ? h.doctors : []).concat(kOk && Array.isArray(k.doctors) ? k.doctors : [])
    .filter(d => d && d.id != null && d.name && !tombSet('doctors').has(id + '|' + d.id) && !tombSet('doctors').has(same.id + '|' + d.id)) : [];
  // a confirming tap whose question no longer applies (the clinic it named is gone or changed) changes nothing
  if(typeof confirmed === 'string' && confirmed && !asked){ showToast('This changed since you were asked — nothing was changed', 4000); openNamelessClinics(); return; }
  if(asked && confirmed !== asked){
    const pairs = {}; moves.forEach(m => { const key = (m.from || '—') + '|' + (m.to || '—'); pairs[key] = (pairs[key] || 0) + 1; });
    const n = visits.filter(v => v && v.clinicId === id).length;
    const q = same
      ? `<div style="font-size:13px; line-height:1.6;"><b dir="auto">${esc(same.name)}</b> <span>is already in the list</span> (<span>${esc(same.rep || '—')}</span>). <span>Move this clinic's visits, tasks, plan entries and doctors there? The nameless record goes to the recycle bin.</span> (${n} <span>visits</span>${carry.length ? ` · ${carry.length} <span>doctors</span>` : ''})</div>`
      : `<div style="font-size:13px; line-height:1.6;"><b dir="auto">${esc(name)}</b>: ⚠️ ${moves.length} <span>sales lines would then count for another person</span>: ${Object.keys(pairs).map(x => `<span>${esc(x.split('|')[0])}</span> → <span>${esc(x.split('|')[1])}</span> ${pairs[x]}`).join(' · ')}</div>`;
    askInCard(id, `${q}
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="chip small" data-id="${esc(id)}" data-name="${esc(name)}" data-kind="${esc(kind || '')}" data-ask="${esc(asked)}" onclick="nameNamelessClinic(this.dataset.id, this.dataset.name, this.dataset.kind, this.dataset.ask)">✅ <span>${same ? 'Move the visits' : 'Use the name anyway'}</span></button>
        <button class="chip small" onclick="openNamelessClinics()"><span>Cancel</span></button>
      </div>`);
    return;
  }
  _namingBusy.add(id);
  try{
    if(same){
      // the clinic was added again since: its August visits, tasks, plan entries and doctors join it, the nameless record goes
      if(!await moveToBin('clinics', h, h.name)) return;
      repointClinic(id, same.id);
      if(carry.length){
        const m = UMCore.mergeDoctorLists(Array.isArray(same.doctors) ? same.doctors : [], JSON.parse(JSON.stringify(carry)));
        same.doctors = m.doctors;
        if(Object.keys(m.remap).length) visits.forEach(v => { if(v && v.clinicId === same.id) UMCore.remapVisitDoctors(v, m.remap); });
      }
      const r1 = await persistFor('visits'), r2 = await persistFor('clinics'), r3 = await persistFor('tasks'), r4 = await persistFor('dayPlans');
      saveToastAll([[r1, 'visits'], [r2, 'clinics'], [r3, 'tasks'], [r4, 'dayPlans']], `✅ Visits moved to ${same.name}`, 4000); // "moved" only when every list landed
    } else {
      clinics.push(next); hidePlaceholderClinics();
      const r = await persistFor('clinics');
      saveToast(r, 'clinics', `✅ ${next.name} is back in the list`, 4000);
    }
  } finally { _namingBusy.delete(id); }
  renderAll();
  openNamelessClinics();
}
function openAddClinic(){
  showModal(`
    <h3 style="margin-top:0;" data-ic="building">Add clinic</h3>
    <label>Clinic name</label>
    <input type="text" id="mClinicName" placeholder="e.g. Bright Smile Dental">
    ${addClinicOwnerHTML()}
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
    <div id="mClinicAsk"></div>
    <button class="btn" id="mClinicSave" onclick="submitAddClinic()">Save clinic</button>
  `);
}
// Whose the new clinic is (v123): a rep's is hers — no choice to get wrong
// (until v122 every seller was listed with the first one ticked, so Renova's
// new clinic was saved as Mariam's and its invoices counted for Mariam); the
// supervisor picks, with nothing ticked.
function addClinicOwnerHTML(){
  if(currentUser.role !== 'supervisor') return `<label>Assigned rep</label><div class="chip-row" id="mClinicRep"><div class="chip on" data-rep="${esc(currentUser.name)}">${esc(currentUser.name)}</div></div>`;
  return `<label>Whose clinic is it?</label>
    <div class="chip-row" id="mClinicRep">${REPS.map(r=>`<div class="chip" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>`;
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
// One check for every way a new clinic is made (v123 review): "+ Add clinic",
// the visit form's "New clinic" and the order form's "+ Add a new customer" —
// the last two skipped it, and a rep's new clinic took another person's
// invoices, closed months too. A name that starts matching an ERP account makes
// its invoices count for the new clinic's owner (UMCore.erpAddClinicMoves). A
// rep is stopped when another person's lines, or a closed month's, would move
// (the supervisor adds that clinic); the supervisor is asked first — "Count
// from this month" (prevRep = the person the earlier lines count for now,
// repSince = the 1st) or all of them. `confirmed`: the answer of one of the
// question's buttons (a signature of the lines it was asked about — asked
// again if they changed meanwhile); `retry`: the function those buttons call
// with it; `cancel`: what the Cancel button runs. → { ok: true } (nc then may
// carry prevRep / repSince) | { ok: false, html } — what to show where the form asks.
function newClinicSalesCheck(nc, confirmed, retry, cancel){
  const sup = currentUser.role === 'supervisor', rep = nc.rep, name = nc.name;
  const hasFiles = erpPeriods().some(p => p);
  if(hasFiles && !salesCheckComplete()) return { ok: false, html: '⚠️ <span>Some sales files did not load on this device, so what this name would move cannot be checked. Nothing was saved — try again with a connection.</span>' };
  const data = { erpSales, clinics: storedClinics(), erpMap };
  const moves = hasFiles ? UMCore.erpAddClinicMoves(data, [nc]) : [];
  if(!moves.length) return { ok: true };
  const sig = list => list.map(m => [m.customer, m.date, m.from, m.to].join('|')).sort().join(';');
  const month1 = todayStr().slice(0, 7) + '-01';
  const earlier = moves.filter(m => (m.date || '') < month1);
  const others = [...new Set(moves.map(m => m.from).filter(f => f && f !== rep))];
  // a rep never takes another person's sales by adding a clinic: the supervisor decides
  if(!sup && others.length) return { ok: false, html: `⚠️ <span>This name matches sales that count for another person now:</span> <b>${others.map(esc).join(', ')}</b>. <span>The supervisor adds this clinic. Nothing was saved.</span>` };
  // …nor changes a closed month's figures (they never move)
  if(!sup && earlier.length) return { ok: false, html: '⚠️ <span>This name matches sales of closed months. The supervisor adds this clinic. Nothing was saved.</span>' };
  // "count from this month": earlier lines stay with the person they count for now (one person, or it cannot be kept)
  const prev = [...new Set(earlier.map(m => m.from))];
  const sinceOk = !earlier.length || (prev.length === 1 && !!prev[0] && prev[0] !== rep);
  const ncSince = sinceOk && earlier.length ? Object.assign({}, nc, { prevRep: prev[0], repSince: month1 }) : nc;
  const movesSince = sinceOk ? UMCore.erpAddClinicMoves(data, [ncSince]) : null;
  const keepsClosed = !!movesSince && !movesSince.some(m => (m.date || '') < month1);
  const want = typeof confirmed === 'string' ? confirmed : '';
  const askedAll = 'all:' + sig(moves), askedSince = keepsClosed && earlier.length ? 'since:' + sig(movesSince) : null;
  if(want && want === askedSince){ nc.prevRep = ncSince.prevRep; nc.repSince = ncSince.repSince; return { ok: true }; }
  if(want && want === askedAll) return { ok: true };
  if(want) showToast('This changed since you were asked — nothing was changed', 4000);
  const net = list => Math.round(list.reduce((a, m) => a + (Number(m.net) || 0), 0) * 1000) / 1000;
  const pairs = {}; moves.forEach(m => { const k = (m.from || '—') + ' → ' + (m.to || '—'); pairs[k] = (pairs[k] || 0) + 1; });
  return { ok: false, html: `<div><b dir="auto">${esc(name)}</b>: ⚠️ ${moves.length} <span>sales lines would count for</span> <b>${esc(rep)}</b> (${money(net(moves))}): ${Object.keys(pairs).map(k => `<span dir="auto">${esc(k)}</span> ${pairs[k]}`).join(' · ')}</div>
        ${earlier.length ? `<div style="margin-top:4px;">${earlier.length} <span>of them are in closed months.</span></div>` : ''}
        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
          ${askedSince ? `<button class="chip small" data-ask="${esc(askedSince)}" onclick="${retry}(this.dataset.ask)">✅ <span>Count from this month</span> (${movesSince.length})</button>` : ''}
          <button class="chip small" data-ask="${esc(askedAll)}" onclick="${retry}(this.dataset.ask)">${askedSince ? '' : '✅ '}<span>${earlier.length ? 'Count all of them, closed months too' : 'Add the clinic'}</span></button>
          <button class="chip small" onclick="${cancel}"><span>Cancel</span></button>
        </div>
        ${askedSince ? `<div style="font-size:12px; color:var(--muted); margin-top:6px;"><span>Count from this month: the earlier lines stay with</span> <b>${esc(prev[0])}</b>.</div>` : ''}` };
}
// A new clinic made inside another form (the visit form, the order form, the call log) is saved
// FIRST, on its own (round 4): refused by the rules or too large for the cloud, it can never land
// as it is — the visit, order or call was saved all the same and pointed at a clinic nobody had.
// Now it comes off the list, nothing else is saved, the form keeps what was typed and its box
// says why. → the save's outcome when the form may go on (saved, or kept and queued), else null.
async function saveNewClinicFirst(nc, askId){
  const r = await persistTold('clinics');
  const o = (r && r.outcome) || {};
  if(r && (r.ok || !(o.denied || o.tooLarge))) return r;
  clinics = clinics.filter(c => c !== nc);
  const t = saveFailText(r, 'clinics'), msg = t ? t[0] : NOT_ALLOWED_MSG;
  const box = document.getElementById(askId);
  if(box) box.innerHTML = newClinicAskCard(`<span>${esc(msg)}</span> <span>What you typed is still here.</span>`); // (the save's own notice says it too)
  return null;
}
function newClinicAskCard(html){ return `<div class="card" style="margin-top:10px; border-inline-start:4px solid var(--amber); background:var(--amber-dim); font-size:13px; line-height:1.6;">${html}</div>`; }
// The same check for clinics made in bulk (round 3): Admin → Manage clinics →
// Import and the contact import made clinics with no check at all, and every
// invoice of an ERP account their names start matching then counted for the
// new clinic's owner — another person's, a closed month's too. Every account
// whose invoices would move is shown in the import's own confirmation (who
// they count for now → for whom then, lines, value, closed months), and none
// moves without the supervisor's tap; Cancel leaves the list to untick.
// `list`: the clinics the import would add (not on the list yet); `hint`: how to keep
// those sales where they count now, in that import's own words. → { ok: true } | { ok: false, html }
function bulkClinicSalesCheck(list, confirmed, retry, cancel, hint){
  if(!(list || []).length || !erpPeriods().some(p => p)) return { ok: true };
  if(!salesCheckComplete()) return { ok: false, html: '⚠️ <span>Some sales files did not load on this device, so what these names would move cannot be checked. Nothing was saved — try again with a connection.</span>' };
  const moves = UMCore.erpAddClinicMoves({ erpSales, clinics: storedClinics(), erpMap }, list);
  if(!moves.length) return { ok: true };
  const sig = 'bulk:' + moves.map(m => [m.customer, m.date, m.from, m.to].join('|')).sort().join(';');
  if(confirmed === sig) return { ok: true };
  if(confirmed) showToast('This changed since you were asked — nothing was changed', 4000);
  const month1 = todayStr().slice(0, 7) + '-01', by = {};
  moves.forEach(m => {
    const k = [m.customer, m.from || '—', m.to || '—'].join('\u0000');
    const g = by[k] = by[k] || { customer: m.customer, from: m.from || '—', to: m.to || '—', n: 0, net: 0, closed: 0 };
    g.n++; g.net += Number(m.net) || 0; if((m.date || '') < month1) g.closed++;
  });
  const rows = Object.values(by).sort((a, b) => String(a.customer).localeCompare(String(b.customer)));
  return { ok: false, html: `<div><b>⚠️ <span>Sales would then count for another person</span></b>: ${moves.length} <span>sales lines</span> · ${rows.length} <span>ERP accounts</span></div>
      <div style="max-height:200px; overflow:auto; margin-top:6px; font-size:12.5px;">${rows.map(g => `<div data-bulkmove style="padding:3px 0; border-bottom:1px dashed var(--line);"><b dir="auto">${esc(g.customer)}</b>: <span dir="auto">${esc(g.from)}</span> → <span dir="auto">${esc(g.to)}</span> · ${g.n} <span>sales lines</span> (${money(Math.round(g.net * 1000) / 1000)})${g.closed ? ` · ${g.closed} <span>in closed months</span>` : ''}</div>`).join('')}</div>
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="chip small" data-ask="${esc(sig)}" onclick="${retry}(this.dataset.ask)">✅ <span>Add them — these sales then count for the new clinics' owners</span></button>
        <button class="chip small" onclick="${cancel}"><span>Cancel</span></button>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-top:6px;"><span>Nothing was saved.</span> <span>${esc(trOf(hint) || hint)}</span></div>` };
}
async function submitAddClinic(confirmed){
  const name = document.getElementById('mClinicName').value.trim();
  if(!name){ showToast('Enter a name'); return; }
  const dup = clinics.find(c=>c.name.toLowerCase()===name.toLowerCase());
  if(dup){ showToast('A clinic with this name already exists'); return; }
  const sup = currentUser.role === 'supervisor';
  const repEl = document.querySelector('#mClinicRep .chip.on');
  const rep = sup ? (repEl ? repEl.dataset.rep : '') : currentUser.name; // a rep's own, always
  if(!rep || (sup && !REPS.includes(rep))){ showToast('Choose whose clinic this is'); return; }
  const clsEl = document.querySelector('#mClinicCls .chip.on');
  const acctEl2 = document.querySelector('#mClinicAcct .chip.on');
  const newEl2 = document.querySelector('#mClinicNew .chip.on');
  const nc = normalizeClinic({id:uid(), name, rep, cls: clsEl ? clsEl.dataset.cls : null,
    account: acctEl2?acctEl2.dataset.acct:null, dealType: dealFromChips('#mClinicDeal'), isNew: newEl2 ? newEl2.dataset.new==='yes' : false, addedOn: todayStr(), market:null, notes:'', contact: document.getElementById('mClinicContact').value.trim(), phone: document.getElementById('mClinicPhone').value.trim()});
  // A name that starts matching an ERP account makes those invoices count for
  // the new clinic's owner — closed months too (no handover date). Shown in
  // the sheet before anything is saved (v123, newClinicSalesCheck).
  const ask = document.getElementById('mClinicAsk');
  const say = html => { if(ask) ask.innerHTML = newClinicAskCard(html); };
  const chk = newClinicSalesCheck(nc, confirmed, 'submitAddClinic', 'closeModal()');
  if(!chk.ok){ say(chk.html); return; }
  clinics.push(nc);
  const r = await persistTold('clinics');
  const o = (r && r.outcome) || {};
  if(!r.ok && (o.denied || o.tooLarge)){
    // a clinic that can never land as it is (refused, too large) is not left
    // on the list as if it were added: off it, and the sheet keeps what was typed
    clinics = clinics.filter(c => c !== nc);
    const t = saveFailText(r, 'clinics');
    say(`<span>${esc(t ? t[0] : NOT_ALLOWED_MSG)}</span> <span>What you typed is still here.</span>`);
    renderClinics();
    return;
  }
  closeModal();
  renderClinics();
  saveToast(r, 'clinics', '🌟 New clinic added — territory growing');
}

function openClinicDetail(id){
  const c = clinics.find(x=>x.id===id);
  if(!c){ openDeletedClinic(id); return; }
  if(!canViewClinic(c)){ showToast('🔒 This clinic belongs to '+(c.rep||'another rep')); return; }
  const cVisits = visits.filter(v=>v.clinicId===id).sort((a,b)=>b.date.localeCompare(a.date));
  const canPlan = currentUser.name===c.rep;
  // the card's header (class, name, owner, status), the actions, then its sections as cards with icon headings:
  // a wide sheet in two columns on a laptop, a full-height sheet on the phone (data-wide, modalFrame)
  const sec = (icon, words, body, extra) => `<section class="cd-sec"><div class="section-title cd-st"><span class="sec-ic" aria-hidden="true">${I(icon)}</span><span>${words}</span>${extra||''}</div>${body}</section>`;
  const ownSec = (icon, html) => html ? `<section class="cd-sec">${html.replace(/<div class="section-title"([^>]*)>/, `<div class="section-title cd-st"$1><span class="sec-ic" aria-hidden="true">${I(icon)}</span>`)}</section>` : '';
  showModal(`
    <div class="cd-head" data-wide>
      <span class="cls cls-${c.cls} cd-cls">${c.cls||'-'}</span>
      <div class="cd-ht">
        <h3 style="margin-top:0;">${esc(c.name)}</h3>
        <div class="clinic-sub">${esc(c.rep||'')}${c.contact?' · '+esc(c.contact):''}${c.phone?' · '+esc(c.phone):''}</div>
        <div class="cd-tags">
          <div class="badge ${followStatus(c.nextFollowUp)}">${statusLabel(c.nextFollowUp)}</div>
          ${c.account?`<span class="chip small" style="background:var(--green-dim); color:var(--green-dark);">💳 ${esc(c.account)}</span>`:''}
          ${c.dealType?`<span class="chip small" style="background:var(--teal-dim); color:var(--teal);">${dealTypeLabel(c)}</span>`:''}
          ${c.isNew?`<span class="chip small" style="background:var(--amber-dim); color:var(--amber-ink);">${I('sparkles')} New customer</span>`:''}
        </div>
      </div>
    </div>
    <div class="cd-acts">
      <button class="btn" onclick="quickLogFrom('${c.id}'); closeModal();">Log a visit here</button>
      <div class="chip-row">
        <div class="chip small" onclick="openStandaloneOrder('${c.id}')">${I('cart')} Order only</div>
        <div class="chip small" onclick="openCallLog('${c.id}')">${I('phone')} Log a call</div>
        ${canPlan ? `<div class="chip small" onclick="addToPlan('${c.id}')">${I('calendar')} Today's plan</div>` : ''}
        ${currentUser.role==='supervisor' ? `<div class="chip small" onclick="openEditClinic('${c.id}')">${I('pencil')} Edit</div>` : ''}
      </div>
    </div>
    <div class="cd-grid">
      <div class="cd-col">
        ${sec('stethoscope', 'Doctors', `
          ${lostDoctorsLine(c)}
          ${dupDoctorsLine(c)}
          <div id="docListInModal">${renderDoctorRows(c)}</div>
          <input type="text" id="newDocName" dir="auto" placeholder="Doctor name">
          <div class="chip-row" id="newDocTitleChips" style="margin-top:8px;">${SPECIALTIES.map(t=>`<div class="chip small" data-title="${t}" onclick="pickDocTitle(this)">${SPECIALTY_PLAYBOOK[t].icon} ${t}</div>`).join('')}</div>
          <button class="btn secondary small" onclick="addDoctor('${c.id}')">Add doctor</button>`)}
        ${ownSec('compass', decisionMapBlock(c))}
        ${sec('clock', 'Visit history', cVisits.length===0 ? '<div style="color:var(--muted); font-size:13.5px;">No visits yet.</div>' :
      cVisits.map(v=>`<div class="visit-hist">${v.callOnly?`<em>${CHANNEL_LABELS[v.channel]||'📞 Call'}${v.contactName?' with '+esc(v.contactName):''}</em> · `:''}<strong>${fmtDate(v.date)}</strong>${v.orderTaken?' · '+money(v.orderTotal):''} · ${esc(v.rep)}${jointTag(v)}${v.mood?' · '+({pleased:'😊',neutral:'😐',concerned:'😟'}[v.mood]||''):''}${v.editHistory&&v.editHistory.length?` · <span style="color:var(--amber-ink); cursor:pointer;" onclick="event.stopPropagation(); showEditHistory('${v.id}')">✏️ edited</span>`:''}${contactNames(v,c)?`<br><span style="color:var(--muted); font-size:12.5px;">👥 ${esc(contactNames(v,c))}</span>`:''}${rxLinesHTML(v,c)}${v.notes ? (rxPadsOf(v) ? '' : '<br>')+esc(v.notes) : ''}
        ${(v.photos&&v.photos.length)?`<div class="photo-row">${v.photos.map(ph=>`<img class="photo-thumb" src="${ph.thumb}" data-cap="${esc(c.name)}" onclick="event.stopPropagation(); showLightbox('${ph.id}', this.dataset.cap)">`).join('')}</div>${photoWaitHTML(v)}`:''}
      </div>`).join(''))}
      </div>
      <div class="cd-col">
        ${ownSec('sparkles', sellGuideBlock(c))}
        ${sec('cart', 'Order history', renderClinicOrders(id))}
        ${currentUser.role==='supervisor' ? ownSec('file', clinicErpAccountsSection(c)) : ''}
        ${ownSec('refresh', clinicErpSection(id))}
        ${sec('pencil', 'Clinic profile notes', `
          <textarea id="profileNotesEdit" dir="auto" placeholder="Preferences, competitor products in use, best time to visit...">${esc(c.profileNotes)}</textarea>
          <button class="btn secondary small" onclick="saveProfileNotes('${c.id}')">Save notes</button>`)}
        ${sec('chat', 'No-sales reason', `
          <p style="color:var(--muted); font-size:12px; margin:0 0 6px;">If this account isn't buying yet, note why (e.g. prescription-only, budget cycle, stock on hand) — shown in the management report.</p>
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="text" value="${esc(c.noSaleReason||'')}" placeholder="e.g. Works on prescriptions — patients buy from pharmacy"
              onchange="saveNoSaleReason('${c.id}', this.value)" style="flex:1; margin:0;">
            <button class="chip small" style="flex-shrink:0;" onclick="saveNoSaleReason('${c.id}', this.parentElement.querySelector('input').value)">💾 Save</button>
          </div>`)}
      </div>
    </div>
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
  const r = await persistTold('erpNotes');
  saveToast(r, 'erpNotes', t ? '📝 Reason saved' : 'Reason cleared'); // "saved" only when it landed
}
// Free lines carry a classification: bonus inside a paying deal vs a
// sample/marketing giveaway. The heuristic sets the default; one tap fixes it.
function focKindOf(key, def){ const n = erpNotes[key]; return (n && n.kind) || def || 'sample'; }
async function saveErpNoteKind(key, kind, el){
  const n = erpNotes[key] || {};
  n.kind = kind; n.by = n.by || currentUser.name; n.on = n.on || todayStr();
  erpNotes[key] = n;
  const r = await persistTold('erpNotes');
  if(el && el.parentElement) el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c===el));
  saveToast(r, 'erpNotes', kind==='deal' ? '🤝 Marked: bonus within a deal' : '🎁 Marked: sample / marketing');
}
// Is this ERP line a marked EXCHANGE (تبديل)? Stock swap, not a real return.
function isExchangeLine(r){
  const n = erpNotes[erpNoteKey('ret', r)];
  return !!(n && n.kind === 'exchange');
}
// The line's key holds the ERP product name: it reaches the handler through
// data-key, never inside the onclick string (an apostrophe in a name would
// break the tap, and a quote with code in it would run).
function retKindChips(r){
  const key = erpNoteKey('ret', r);
  const k = (erpNotes[key] && erpNotes[key].kind) === 'exchange' ? 'exchange' : 'return';
  return `<div class="chip-row" style="margin-top:6px;" onclick="event.stopPropagation()">
    <div class="chip small ${k==='return'?'on':''}" data-key="${esc(key)}" onclick="saveRetKind(this.dataset.key,'return',this)">↩️ Return / مرتجع</div>
    <div class="chip small ${k==='exchange'?'on':''}" data-key="${esc(key)}" onclick="saveRetKind(this.dataset.key,'exchange',this)">🔁 Exchange / تبديل</div>
  </div>`;
}
async function saveRetKind(key, kind, el){
  const n = erpNotes[key] || {};
  if(kind === 'exchange') n.kind = 'exchange'; else delete n.kind;
  n.by = currentUser.name; n.on = todayStr();
  if(!n.text && !n.kind && kind !== 'exchange' && !erpNotes[key]){ /* nothing to keep */ }
  erpNotes[key] = n;
  const r = await persistTold('erpNotes');
  if(el && el.parentElement) el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c===el));
  renderView(activeView);
  saveToast(r, 'erpNotes', kind==='exchange' ? '🔁 Marked as exchange — removed from the returns figures' : '↩️ Marked as a real return');
}
function focKindChips(key, def){
  const k = focKindOf(key, def);
  return `<div class="chip-row" style="margin-top:6px;" onclick="event.stopPropagation()">
    <div class="chip small ${k==='deal'?'on':''}" data-key="${esc(key)}" onclick="saveErpNoteKind(this.dataset.key,'deal',this)">🤝 Deal bonus</div>
    <div class="chip small ${k==='sample'?'on':''}" data-key="${esc(key)}" onclick="saveErpNoteKind(this.dataset.key,'sample',this)">🎁 Sample / marketing</div>
  </div>`;
}
async function saveNoSaleReason(clinicId, val){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c) return;
  if(!canViewClinic(c)){ showToast('🔒 Not your clinic'); return; }
  c.noSaleReason = (val||'').trim();
  const r = await persistTold('clinics');
  saveToast(r, 'clinics', c.noSaleReason ? '📝 Reason saved' : 'Reason cleared');
}
// The ERP accounts whose invoices count on this branch (supervisor): each can
// be moved from here, and another account can be counted here — the editor
// shows what moves before anything is saved (11-erp.js, ERP ACCOUNT LINKS).
// Never takes the clinic card down with it: odd data shows no section.
function clinicErpAccountsSection(c){
  try{ return clinicErpAccountsHTML(c); }catch(e){ console.error('clinic ERP accounts', e); return ''; }
}
function clinicErpAccountsHTML(c){
  if(!c || !currentUser || currentUser.role !== 'supervisor') return '';
  const res = UMCore.erpAccounts(digestData());
  const here = res.accounts.filter(a => a.clinicId === c.id);
  const staleHere = (res.stale || []).filter(s => s.link === c.id);
  const inv = here.reduce((s, a) => s + a.invoices, 0), net = here.reduce((s, a) => s + a.net, 0);
  // a sales file whose rows did not load on this device: its invoices are not in these figures — said, with the retry
  const missing = res.rowsMissing || 0;
  const noInv = missing ? 'no invoice in the files loaded on this device' : 'no invoice in the saved files';
  const row = (a, stale) => `<div class="row-between" style="gap:8px; padding:7px 0; border-bottom:1px solid var(--line); align-items:flex-start;">
      <div style="flex:1; min-width:0;">
        <div dir="auto" style="font-size:13px; font-weight:700; overflow-wrap:anywhere;">${esc(a.name)}</div>
        <div class="clinic-sub" style="display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center;">${erpLinkBadge(a)} ${stale ? `<span>${noInv}</span>` : `<span>${a.invoices} × · <span dir="ltr">${money(a.net)}</span>${a.last ? ` · <span>last invoice</span> ${fmtDate(a.last)}` : ''}</span>`}</div>
      </div>
      <button class="chip small" style="flex-shrink:0;" data-erp-link="${esc(a.name)}" onclick="openErpLinkEdit(this.dataset.erpLink,'clinic:${c.id}')">Move…</button>
    </div>`;
  // the group's own name (no branch word) counts once, on its first branch — say where, on the other branches
  let famLine = '';
  const fams = UMCore.clinicFamilies(clinics), key = fams.byClinic[c.id];
  if(key){
    const fam = fams.fams[key];
    if(fam.ids[0] !== c.id && res.accounts.some(a => a.status === 'family' && fam.ids.includes(a.clinicId))){
      const land = clinics.find(x => x.id === fam.ids[0]);
      famLine = `<div class="clinic-sub" style="padding-top:6px; line-height:1.5;"><span>Accounts named after the whole group count once, on</span> <b dir="auto" style="overflow-wrap:anywhere;">${esc(land ? land.name : '')}</b></div>`;
    }
  }
  return `<div class="section-title" style="margin-top:20px;"><span>ERP accounts counted here</span> <span class="link" onclick="openErpLinks({back:'clinic:${c.id}'})">All accounts</span></div>
    <div class="card" id="clinicErpAccounts" data-clinic="${esc(c.id)}" style="padding:8px 12px 12px;">
      ${here.map(a => row(a, false)).join('')}${staleHere.map(s => row({ name: s.name, status: s.status }, true)).join('')}
      ${here.length || staleHere.length ? '' : `<div class="clinic-sub" style="padding:6px 0;">${missing ? 'No ERP account counts here in the files loaded on this device.' : 'No ERP account counts here yet.'}</div>`}
      ${here.length ? `<div class="clinic-sub" style="padding-top:8px;"><span>Total counted here</span> · ${inv} × · <span dir="ltr">${money(net)}</span>${missing ? '' : ' <span>(all saved files)</span>'}</div>` : ''}
      ${missing ? `<div id="clinicErpMissing" style="color:var(--amber-ink); font-weight:600; font-size:12px; line-height:1.55; padding-top:6px;">⚠️ ${missing} <span>sales files did not load on this device — their invoices are not counted here.</span> <span class="link" style="color:var(--teal); cursor:pointer;" onclick="clinicErpRetry(this.closest('#clinicErpAccounts').dataset.clinic)">🔄 <span>Load them again</span></span></div>` : ''}
      ${famLine}
      ${c.cls === 'Closed' ? '' /* a Closed clinic takes no new account: its own accounts can still be moved away */
        : `<button class="chip small" style="margin-top:10px;" onclick="openErpLinks({pickFor:'${c.id}', back:'clinic:${c.id}'})">${I('plus')} <span>Count another ERP account here…</span></button>`}
    </div>`;
}
// The card's retry: the rows load, and the card is redrawn only if it is
// still the sheet on screen (the person may have moved on meanwhile).
function clinicErpRetry(id){
  retryErpRows().then(() => {
    const back = document.getElementById('modalBack'), sec = document.querySelector('#modalInner #clinicErpAccounts');
    if(back && back.classList.contains('show') && sec && sec.dataset.clinic === id) openClinicDetail(id);
  }).catch(e => console.warn('retry sales rows', e));
}
function clinicErpLedger(clinicId){
  const ret = [], all = [];
  erpPeriods().forEach(p => erpViewRows(p).forEach(r => all.push(r)));
  const focAll = UMCore.focLinesAnnotated(all);
  const match = erpMatchFn();
  all.forEach(r => {
    const m = match((r.customer||'').trim() || '(no name)');
    if(m.clinicId !== clinicId) return;
    const rv = UMCore.returnValue(r);
    if(rv > 0) ret.push(Object.assign({}, r, {retAmount: Math.round(rv*1000)/1000}));
  });
  const foc = focAll.filter(r => {
    const m = match((r.customer||'').trim() || '(no name)');
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
    <h3 style="margin-top:0;" data-ic="pencil">Edit clinic</h3>
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
  const r = await persistTold('clinics');
  closeModal();
  saveToast(r, 'clinics', '✅ Clinic updated');
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
  const was = { name: p.name, brand: p.brand, id: p.id, price: p.price, desc: p.desc, specialties: p.specialties };
  const edit = { name, brand: document.getElementById('epBrand').value.trim() || 'Other', id: code, price: price===null ? null : Math.round(price*100)/100,
    desc: document.getElementById('epDesc').value.trim(), specialties: Array.from(document.querySelectorAll('#epSpecialtyChips .chip.on')).map(el=>el.dataset.spec) };
  Object.assign(p, edit);
  assignProductKeys();
  // The catalog first; visits are re-pointed to a new code only once it has
  // landed (v123 review): re-pointed alongside, a catalog refused ("Changed
  // on another device") left orders on a code the catalog did not have.
  // Refused: the screen keeps the product as the catalog has it. A save with
  // no answer in time that lands later re-points them then (onLate).
  const repoint = async (prod) => {
    if(code === oldId || !prod) return [];
    // every visit, order line and bin entry that pointed at the old key now points at the new one
    const newKey = productKey(prod);
    const remap = v => {
      let hit = false;
      if(Array.isArray(v.products) && v.products.includes(oldKey)){ v.products = v.products.map(x=>x===oldKey?newKey:x); hit = true; }
      (v.orders||[]).forEach(o=>(o.items||[]).forEach(it=>{ if(it.productId===oldKey){ it.productId = newKey; hit = true; } }));
      (v.orderItems||[]).forEach(it=>{ if(it && it.productId===oldKey){ it.productId = newKey; hit = true; } });
      return hit;
    };
    const n = visits.filter(remap).length;
    const nb = (recycleBin.visits||[]).filter(remap).length;
    const saves = [];
    if(n) saves.push([persistTold('visits'), 'visits']);
    if(nb) saves.push([persistTold('recycleBin'), 'recycleBin']);
    const res = await Promise.all(saves.map(x => x[0]));
    return res.map((r, i) => [r, saves[i][1]]);
  };
  const late = () => { const q = findProduct(oldKey) || findProduct(code); if(!q) return; Object.assign(q, edit); assignProductKeys(); repoint(q).then(pairs => { saveToastAll(pairs, '✅ Product updated'); renderAll(); }); };
  const pr = await persistTold('products', code !== oldId ? { onLate: late } : undefined);
  if(!pr.ok){
    Object.assign(p, was); assignProductKeys(); // not saved: as the catalog has it
    closeModal();
    saveToast(pr, 'products', '');
    if(document.getElementById('productListWrap')) renderProducts();
    if(document.getElementById('apPriceBody')) renderAdminPrices();
    return;
  }
  const pairs = await repoint(p);
  closeModal();
  saveToastAll([[pr, 'products']].concat(pairs), '✅ Product updated'); // "updated" only when every list it changed landed
  if(document.getElementById('productListWrap')) renderProducts();
  if(document.getElementById('apPriceBody')) renderAdminPrices();
}

// ---- RECYCLE BIN (soft delete) ----
const BIN_DAYS = 30;
async function moveToBin(kind, item, label){
  recycleBin[kind] = recycleBin[kind] || [];
  recycleBin[kind].push({...item, _deletedAt: Date.now(), _label: label});
  const r = await persistTold('recycleBin');
  if(!r.ok){
    // The bin is a whole document (no offline queue): a delete whose safety
    // copy never landed would be a delete with no way back — refuse it.
    recycleBin[kind] = recycleBin[kind].filter(x=>x.id!==item.id);
    const o = r.outcome || {};
    showToast(o.denied ? '🔒 Not allowed — nothing was deleted (ask the supervisor)'
      : o.tooLarge ? '🛑 The recycle bin is too large for the cloud — nothing was deleted. Ask the supervisor.'
      : '⚠️ لم يصل إلى سلة المحذوفات — لم يُحذف شيء، أعد المحاولة عند توفر الاتصال', 6000);
  }
  return r.ok;
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
  const r = await persistTold('products');
  closeModal();
  saveToast(r, 'products', 'Moved to recycle bin');
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
    <h3 style="margin-top:0;" data-ic="building" data-tone="danger">🗑️ ${esc(name)} <span style="color:var(--muted); font-size:12px; font-weight:400;">(deleted)</span></h3>
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
let _rcId = null; // the clinic being re-created (its sales check answers through confirmRecreateAsked)
function openRecreateClinic(id){
  if(!requireAdmin()) return;
  _rcId = id;
  const cVisits = visits.filter(v=>v.clinicId===id);
  const name = ((cVisits.find(v=>v.clinicName)||{}).clinicName || '').trim();
  // the rep who visited it most is almost certainly its owner
  const repCount = {};
  cVisits.forEach(v=>{ if(v.rep) repCount[v.rep]=(repCount[v.rep]||0)+1; });
  const guessRep = Object.keys(repCount).sort((a,b)=>repCount[b]-repCount[a])[0] || REPS[0] || '';
  showModal(`
    <h3 style="margin-top:0;" data-ic="refresh">♻️ Re-create clinic</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Its ${cVisits.length} logged visit${cVisits.length===1?'':'s'} reattach automatically.</p>
    <label>Clinic name</label>
    <input type="text" id="rcName" value="${esc(name)}" placeholder="Clinic name">
    <label>Rep</label>
    <div class="chip-row" id="rcRepChips">${REPS.map(r=>`<div class="chip ${r===guessRep?'on':''}" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>
    <label>Class</label>
    <div class="chip-row" id="rcClsChips">${['A','B','C'].map(k=>`<div class="chip ${k==='B'?'on':''}" data-cls="${k}" onclick="pickModalCls(this)">${k}</div>`).join('')}</div>
    <div id="rcAsk"></div>
    <button class="btn" style="margin-top:12px;" onclick="confirmRecreateClinic('${esc(id)}')">Create</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal()">Cancel</button>
  `);
}
function confirmRecreateAsked(ask){ if(_rcId) return confirmRecreateClinic(_rcId, ask); }
async function confirmRecreateClinic(id, confirmed){
  if(!requireAdmin()) return;
  const name = (document.getElementById('rcName').value||'').trim();
  if(!name){ showToast('Enter the clinic name'); return; }
  if(clinics.some(c=>c.id===id)){ showToast('This clinic is already back'); closeModal(); return; }
  const repEl = document.querySelector('#rcRepChips .chip.on');
  const clsEl = document.querySelector('#rcClsChips .chip.on');
  const nc = normalizeClinic({ id, name, rep: repEl?repEl.dataset.rep:(REPS[0]||''),
    cls: clsEl?clsEl.dataset.cls:'B', notes:'', addedOn: todayStr() });
  // the "+ Add clinic" sales check (round 3): the invoices its name (or a link to its id) starts matching are shown first
  const ask = document.getElementById('rcAsk');
  const chk = newClinicSalesCheck(nc, typeof confirmed === 'string' ? confirmed : '', 'confirmRecreateAsked', "document.getElementById('rcAsk').innerHTML=''");
  if(!chk.ok){ if(ask) ask.innerHTML = newClinicAskCard(chk.html); return; }
  clinics.push(nc);
  untomb('clinics', id); // alive again — cleared from every delete log, team-wide
  const r = await persistTold('clinics');
  closeModal();
  renderAll();
  saveToast(r, 'clinics', '♻️ Clinic re-created — all its history is attached');
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
  // the record's own list decides what the person is told
  const saves = [persistTold('recycleBin'), alreadyLive ? Promise.resolve(null) : persistTold(kind)];
  if(kind==='visits'){
    // the clinic's "last visit" must reflect the restored visit
    const clinic = clinics.find(c=>c.id===clean.clinicId);
    if(clinic){
      const cv = visits.filter(x=>x.clinicId===clinic.id && isFieldVisit(x));
      const last = cv.length ? cv.map(x=>x.date).sort().slice(-1)[0] : null;
      if(last !== (clinic.lastVisit||null)){ clinic.lastVisit = last; saves.push(persist('clinics')); }
    }
  }
  const [rb, rk] = await Promise.all(saves);
  if(alreadyLive) saveToast(rb, 'recycleBin', '✅ Already restored');
  else saveToastAll([[rk, kind], [rb, 'recycleBin']], '✅ Restored');
  renderAll();
  if(document.getElementById('apTabData')) { setAdminTab('data'); setDataSub('bin'); } // only refresh the bin view if it is open
}
async function purgeFromBin(kind, idx){
  if(!requireAdmin()) return;
  if(!(recycleBin[kind]||[])[idx]) return;
  recycleBin[kind].splice(idx,1);
  const r = await persistTold('recycleBin');
  saveToast(r, 'recycleBin', 'Permanently deleted');
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

