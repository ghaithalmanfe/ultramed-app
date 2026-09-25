// ERP import and reconciliation, DSR basis, team total, monthly close, product movement
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- ERP IMPORT & RECONCILIATION (supervisor only) ----
let _erpParsed = null;      // parse result held between the parse and save steps
let _erpUnmatched = [];     // customer names awaiting a mapping choice
function erpPeriods(){ return (erpSales && Array.isArray(erpSales.periods)) ? erpSales.periods : []; }
function packErpRows(rows){ return rows.map(r=>[r.date,r.doc,r.type==='return'?1:0,r.product,r.qty,r.gross,r.net,r.sret,r.salesman,r.brand,r.customer,r.cls,r.dsret||0,r.ref||'']); }
function unpackErpRows(packed){ return (packed||[]).map(a=>({date:a[0],doc:a[1],type:a[2]?'return':'invoice',product:a[3],qty:a[4],gross:a[5],net:a[6],sret:a[7],salesman:a[8],brand:a[9],customer:a[10],cls:a[11],dsret:a[12]||0,ref:a[13]||null})); }
// ---- Returns of earlier months' invoices ----
// 'origin' (default): a return that reverses last month's invoice is counted in
// last month, so a new month never opens in the red for goods sold before it.
// 'erp': deduct in the month the return was booked, exactly as the ERP file.
function erpReturnPolicy(){ return (erpSales && erpSales.returnPolicy) === 'erp' ? 'erp' : 'origin'; }
let _erpCtxCache = { key: null, ctx: null };
function erpCtx(){
  const key = erpPeriods().map(x => x.id + ':' + (x.rows||[]).length).join('|');
  if(_erpCtxCache.key !== key){
    const all = []; erpPeriods().forEach(x => unpackErpRows(x.rows).forEach(r => all.push(r)));
    _erpCtxCache = { key, ctx: UMCore.returnContext(all) };
  }
  return _erpCtxCache.ctx;
}
// The rows every report sums: raw ERP rows with the returns policy applied.
function erpViewRows(p){ return UMCore.applyReturnPolicy(unpackErpRows(p.rows), erpReturnPolicy(), erpCtx()); }
// ---- Ignored salesmen ----
// A salesman mapped to "not my team" is not read at all: their lines are
// dropped at import and purged from stored files, so the reports only ever
// hold the team's own figures and stay fast.
// At import the mapping just chosen wins over the remembered one; when purging
// stored files the remembered (global) decision wins over a period's old map.
function ignoredSalesman(sm, repMap, globalWins){
  const g = (erpSales && erpSales.repMapGlobal) || {};
  const map = globalWins ? Object.assign({}, repMap || {}, g) : Object.assign({}, g, repMap || {});
  return Object.prototype.hasOwnProperty.call(map, sm) && map[sm] === null;
}
function dropIgnoredRows(rows, repMap, globalWins){
  const names = new Set(); const kept = [];
  (rows || []).forEach(r => { if(ignoredSalesman(r.salesman, repMap, globalWins)){ names.add(r.salesman); } else kept.push(r); });
  return { kept, dropped: (rows || []).length - kept.length, names: [...names] };
}
async function purgeIgnoredSalesmen(){
  let removed = 0, changed = false;
  erpPeriods().forEach(p => {
    const rows = unpackErpRows(p.rows);
    const d = dropIgnoredRows(rows, p.repMap || {}, true);
    if(!d.dropped) return;
    removed += d.dropped; changed = true;
    Object.keys(p.repMap || {}).forEach(k => { if(d.names.includes(k)) p.repMap[k] = null; });
    p.rows = packErpRows(d.kept); p.rowCount = d.kept.length; p.rev = Date.now(); // rows changed → new chunk documents
    p.net = Math.round(d.kept.reduce((a, r) => a + (r.net || 0), 0) * 1000) / 1000;
  });
  if(changed){
    erpPeriods().forEach(p => { if(!(p.rowCount > 0 || p.rowsMissing)) erpTombstone(p.id); }); // a file left empty is gone for good, on every device
    erpSales.periods = erpPeriods().filter(p => p.rowCount > 0 || p.rowsMissing);
    _erpCtxCache = { key: null, ctx: null };
    await persist('erpSales'); // on failure the retry pill stays up (persistErpSales sets _erpDirty)
  }
  return removed;
}
async function setSalesmanMap(name, value){
  erpSales.repMapGlobal = Object.assign({}, erpSales.repMapGlobal || {}, { [name]: value || null });
  erpSales.repMapAt = Object.assign({}, erpSales.repMapAt || {}, { [name]: Date.now() }); // newest decision wins across devices
  const ok = await persist('erpSales');
  const removed = value ? 0 : await purgeIgnoredSalesmen();
  renderAll();
  showToast(!ok ? '⚠️ لم يُحفظ بعد — اضغط شريط إعادة المحاولة' : value ? `${name} → ${value}` : `${name} ignored${removed ? ` — ${removed} stored lines removed` : ''}`);
  openErpImport();
}
function salesmenCard(){
  const map = (erpSales && erpSales.repMapGlobal) || {};
  const names = Object.keys(map).sort();
  if(!names.length) return '';
  const q = n => esc(n).replace(/'/g, "\\'");
  return `<div class="section-title">Salesmen in your files</div>
    <p style="color:var(--muted); font-size:12px; margin:-2px 0 8px;">Ignored salesmen are not read at all: their lines are dropped on import and removed from stored files. To bring one back, include them and re-upload the file.</p>
    ${names.map(n => `<div class="card" style="padding:10px 12px; margin-bottom:6px;">
      <div style="font-weight:700; font-size:13px; ${map[n]===null?'color:var(--muted);':''}">${esc(n)}${map[n]===null?' <span style="font-weight:400; font-size:11.5px;">· ignored — not read</span>':''}</div>
      <div class="chip-row" style="margin-top:6px;">${REPS.map(r => `<div class="chip small ${map[n]===r?'on':''}" onclick="setSalesmanMap('${q(n)}','${esc(r)}')">${esc(r)}</div>`).join('')}<div class="chip small ${map[n]===null?'on':''}" onclick="setSalesmanMap('${q(n)}', null)">Ignore</div></div>
    </div>`).join('')}`;
}
// Prior-invoice returns inside one uploaded period, for the reconciliation sheet.
function erpPriorReturns(p){ return UMCore.applyReturnPolicy(unpackErpRows(p.rows), 'origin', erpCtx()).filter(r => r.priorReturn); }
async function setReturnPolicy(v, reopenId){
  erpSales.returnPolicy = v === 'erp' ? 'erp' : 'origin';
  const ok = await persist('erpSales');
  renderAll();
  showToast(!ok ? '⚠️ لم يُحفظ بعد — اضغط شريط إعادة المحاولة' : v === 'erp' ? 'Returns now count in the month they were booked' : "Returns now count in the original invoice's month");
  if(reopenId) openErpRecon(reopenId);
}
function returnPolicyChips(reopenId){
  const pol = erpReturnPolicy();
  return `<div style="margin-top:10px;"><label>Returns of earlier months' invoices</label>
    <div class="chip-row">
      <div class="chip small ${pol==='origin'?'on':''}" onclick="setReturnPolicy('origin'${reopenId?`,'${reopenId}'`:''})">Count in the original invoice's month</div>
      <div class="chip small ${pol==='erp'?'on':''}" onclick="setReturnPolicy('erp'${reopenId?`,'${reopenId}'`:''})">Count in the month returned (as the ERP file)</div>
    </div></div>`;
}

// ---- The one basis for "sales achieved": the company's DSR basis ----
// The official DSR "MTD Sales" per rep is exactly the ERP net (after
// discount, returns deducted) of EVERY invoice line of that rep's salesman —
// all customers, all classes, the online/channel accounts included. Proven
// on the 23.08 DSR against the August export to the cent: Mariam 5,298.36
// and Renova 7,501.41. Filtering those channels out (as the buyers list
// rightly does — it is about clinic coverage) swallowed more than half of
// Renova's sales and showed 52% where the DSR basis says 62%. Every achieved
// / target figure below therefore counts every line; only the buyers and
// reconciliation lists stay clinic-only.
function erpRowCountsAsSales(r){ return true; }
// Sums imported ERP net for a range/rep. Returns null when no imported
// period overlaps the range, so callers can fall back to app-logged numbers.
function erpRevenueForRange(from, to, repFilter){
  const ps = erpPeriods().filter(p => (!from || p.to >= from) && (!to || p.from <= to));
  if(!ps.length) return null;
  let sum = 0;
  ps.forEach(p => erpViewRows(p).forEach(r => {
    if(!UMCore.inRange(r.date, from, to)) return;
    const rep = UMCore.erpRowRep(r, clinics, erpMap, p.repMap||{});
    if(!rep) return;
    if(repFilter !== 'all' && rep !== repFilter) return;
    if(!erpRowCountsAsSales(r)) return;
    sum += r.net;
  }));
  return Math.round(sum * 100) / 100;
}
// Month-to-date sales per rep from the uploaded reports, with each rep's
// as-of date (latest invoice her uploads cover) so pace math stays fair.
// One data bundle for the shared (core) month-figure code — the SAME code the
// daily e-mail runs on the server, so screen and e-mail can never disagree.
function digestData(){ return { today: todayStr(), targets, erpSales, clinics, erpMap, visits, tasks, events, dayPlans }; }
function erpMtdMap(){ return UMCore.erpMtd(digestData()); }
// Month-to-date ERP sales per rep per normalized brand, plus the latest
// invoice date — for brand tables that must follow the freshest upload.
function erpBrandMtd(rep){
  const today = todayStr(), mStart = today.slice(0,7)+'-01';
  const out = {}; let asOf = null;
  erpPeriods().filter(p => p.to >= mStart && p.from <= today).forEach(p => {
    erpViewRows(p).forEach(r => {
      if(r.date < mStart || r.date > today) return;
      if(UMCore.erpRowRep(r, clinics, erpMap, p.repMap||{}) !== rep) return;
      // Same scope as erpMtdMap (the DSR basis, every line) — so the brand
      // rows sum exactly to the rep's headline achieved figure, and a
      // channel-only brand like UNIVET shows its real number.
      if(!erpRowCountsAsSales(r)) return;
      const b = UMCore.normBrand(r.brand);
      out[b] = (out[b]||0) + r.net;
      if(!asOf || r.date > asOf) asOf = r.date;
    });
  });
  return { byBrand: out, asOf };
}
// Best month-to-date sales for a rep. The DSR is the company's OFFICIAL
// reconciled report — whenever one covers the current month it is
// authoritative, even over more recent raw sales-detail invoices (which may
// include rows the DSR excludes). Sales files only fill in when no
// current-month DSR exists; app-logged orders are the last resort.
function bestMonthRevenue(rep){ return UMCore.monthAchievement(rep, digestData()); }
// ---- Team total against target ----
// The SAME official figure as the per-rep lines (bestMonthRevenue), summed:
// achieved ÷ target across every rep with a monthly sales target. Shown
// wherever per-rep target figures appear (Today, reports, month reports,
// admin panel, the upload note, the reconciliation sheet, the PDF cover).
function teamTargetTotal(items){
  const rows = (items || []).filter(x => x && x.goal > 0);
  const goal = rows.reduce((s, x) => s + x.goal, 0);
  const ach = rows.reduce((s, x) => s + (x.ach || 0), 0);
  return { n: rows.length, goal: Math.round(goal * 100) / 100, ach: Math.round(ach * 100) / 100,
    pct: goal > 0 ? Math.round(ach / goal * 100) : null, any: rows.some(x => x.ach != null) };
}
// A monthly target that was uploaded/set for an EARLIER month: the figure
// still shows (last month's target is the best guess until this month's DSR
// arrives) but never silently — every target surface names the month.
function targetStaleMonth(rep){
  const t = targets[rep] || {};
  const m = t.month || (t.achievedAsOf ? t.achievedAsOf.slice(0, 7) : null);
  return (m && m < todayStr().slice(0, 7)) ? m : null;
}
function staleTargetNote(rep){
  const m = targetStaleMonth(rep);
  return m ? `<div style="font-size:11px; color:var(--amber-ink); margin-top:1px;">⚠️ Target is from ${monthLabel(m)} — upload this month's DSR</div>` : '';
}
function teamTargetNow(){
  return teamTargetTotal(REPS.map(r => { const t = targets[r] || {}; return t.revenue > 0 ? { goal: t.revenue, ach: bestMonthRevenue(r).amount } : null; }));
}
function pctInk(p){ return p >= 100 ? 'var(--sage-ink)' : p >= 60 ? 'var(--ink)' : 'var(--amber-ink)'; }
// One compact "Team" bar row, same look as the per-rep rows on the Today card.
function teamTargetRow(tt, opts){
  opts = opts || {};
  if(!tt || tt.pct == null || tt.n < 1) return '';
  const state = tt.pct >= 100 ? ['Achieved', 'var(--sage-ink)', 'var(--sage)'] : tt.pct >= 60 ? ['On pace', 'var(--sage-ink)', 'var(--teal)'] : ['Behind', 'var(--amber-ink)', 'var(--amber)'];
  return `<div style="padding:8px 0 2px; margin-top:6px; border-top:1px solid var(--line);">
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="width:${opts.labelWidth || 58}px; font-size:12.5px; font-weight:800; flex-shrink:0;">${opts.label || 'Team'}</div>
      <div style="flex:1; height:8px; border-radius:4px; background:var(--paper); overflow:hidden;"><div style="width:${Math.min(100, tt.pct)}%; height:100%; border-radius:4px; background:${state[2]};"></div></div>
      <div style="font-size:18px; font-weight:900; color:${state[1]}; flex-shrink:0; min-width:52px; text-align:end;">${tt.pct}%</div>
    </div>
    <div style="font-size:11.5px; color:var(--muted); margin-top:2px; padding-inline-start:${(opts.labelWidth || 58) + 10}px;">${money(tt.ach)} of ${money(tt.goal)} · ${state[0]} · ${tt.n} rep${tt.n === 1 ? '' : 's'}</div>
  </div>`;
}
// Target % per rep exactly as the Today card shows it — captured before and
// after every upload so the import can SAY what it changed ("Mariam 46% →
// 52%"), and say why when nothing moved.
function targetPctMap(){
  const out = {};
  REPS.forEach(r => {
    const t = targets[r] || {};
    if(!(t.revenue > 0)) return;
    const bm = bestMonthRevenue(r);
    out[r] = { pct: Math.round(bm.amount / t.revenue * 100), amount: bm.amount, goal: t.revenue, src: bm.src, asOf: bm.asOf };
  });
  return out;
}
function targetPctNote(before, after){
  const reps = Object.keys(after);
  if(!reps.length) return '🎯 لا يوجد تارغت لهذا الشهر بعد — ارفع ملف DSR ليظهر % التحقيق في شاشة اليوم.';
  const parts = reps.map(r => {
    const b = before[r], a = after[r];
    const moved = !b || b.pct !== a.pct || b.amount !== a.amount;
    return `${esc(r)}: ${b ? b.pct + '% → ' : ''}<b>${a.pct}%</b>${moved ? '' : ' (بدون تغيير)'} <span style="color:var(--muted);">· ${esc(a.src)}</span>`;
  });
  const teamOf = m => teamTargetTotal(Object.values(m).map(x => ({ goal: x.goal, ach: x.amount })));
  const tb = teamOf(before), ta = teamOf(after);
  if(ta.pct != null) parts.push(`<b>الفريق</b>: ${tb.pct != null ? tb.pct + '% → ' : ''}<b>${ta.pct}%</b> <span style="color:var(--muted);">· ${money(ta.ach)} من ${money(ta.goal)}</span>`);
  const none = reps.every(r => before[r] && before[r].pct === after[r].pct && before[r].amount === after[r].amount);
  const why = none ? '<div style="font-size:11.5px; color:var(--muted); margin-top:3px;">لم تتغير النسبة: الرقم الرسمي (DSR) يغطي حتى تاريخ أحدث من أو مساوٍ لآخر فاتورة في هذا الملف — الفواتير بعد تاريخ DSR فقط هي التي تُضاف.</div>' : '';
  return `🎯 <b>شاشة اليوم الآن:</b> ${parts.join(' · ')}${why}`;
}
// Shown on top of whichever modal is open right after an upload.
function erpShowImportNote(html){
  const box = document.getElementById('modalInner');
  if(!box) return;
  const old = document.getElementById('erpImportNote'); if(old) old.remove();
  const h3 = box.querySelector('h3');
  const div = document.createElement('div');
  div.id = 'erpImportNote';
  div.className = 'card';
  div.style.cssText = 'border-inline-start:4px solid var(--sage, #9ED0AF); margin:8px 0 10px; font-size:12.5px; line-height:1.6;';
  div.innerHTML = html;
  if(h3) h3.insertAdjacentElement('afterend', div); else box.prepend(div);
}

// The report's ONLY sales source: official uploads (DSR) or ERP invoices —
// never app-logged orders. App-logged orders are a field follow-up signal,
// not revenue, so they must never appear as "sales" in management figures.
function officialRevenue(rep){
  const t = targets[rep] || {};
  const em = erpMtdMap()[rep];
  const officialOk = t.achieved != null && t.achievedAsOf && t.achievedAsOf.slice(0,7) === todayStr().slice(0,7);
  const erpOk = em && em.amount != null;
  // BOTH uploads act: the current-month DSR anchors the official figure
  // through its as-of date, and clinic-sales invoices dated AFTER that date
  // extend it forward — each day counted from exactly one source, never both.
  if(officialOk){
    const extra = postDsrErp(rep, t.achievedAsOf);
    if(extra > 0){
      const asOf = em && em.asOf > t.achievedAsOf ? em.asOf : t.achievedAsOf;
      return { amount: Math.round((t.achieved + extra)*100)/100,
        src: `DSR ${fmtDate(t.achievedAsOf)} + ERP`, asOf, has: true };
    }
    return { amount: t.achieved, src: `DSR ${fmtDate(t.achievedAsOf)}`, asOf: t.achievedAsOf, has: true };
  }
  if(erpOk) return { amount: em.amount, src: `ERP ${fmtDate(em.asOf)}`, asOf: em.asOf, has: true };
  return { amount: null, src: null, asOf: null, has: false };
}
// Clinic-sales invoices dated strictly AFTER the DSR's as-of day (this month).
function postDsrErp(rep, asOf){
  if(!asOf) return 0;
  const d = new Date(asOf + 'T00:00:00'); d.setDate(d.getDate() + 1);
  const from = localDateStr(d), today = todayStr();
  if(from > today || from.slice(0,7) !== today.slice(0,7)) return 0;
  return erpRevenueForRange(from, today, rep) || 0;
}
// targets with each rep's achieved extended by post-DSR invoices — what every
// coach/insight consumer should see, so both uploads move every screen.
function blendedTargets(){
  const out = {};
  Object.keys(targets).filter(k => !k.startsWith('_')).forEach(rep => {
    const t = Object.assign({}, targets[rep]);
    const officialOk = t.achieved != null && t.achievedAsOf && t.achievedAsOf.slice(0,7) === todayStr().slice(0,7);
    if(officialOk){
      const extra = postDsrErp(rep, t.achievedAsOf);
      if(extra > 0){
        const em = erpMtdMap()[rep];
        t.achieved = Math.round((t.achieved + extra)*100)/100;
        if(em && em.asOf > t.achievedAsOf) t.achievedAsOf = em.asOf;
      }
    }
    out[rep] = t;
  });
  return out;
}
// ---- MONTHLY CLOSE REPORTS ----
// Any month with archived DSR figures or uploaded invoices can be opened, on
// its last day or any time after: target vs achieved with %, the per-brand
// breakdown, and that month's visit and invoice activity.
function monthLabel(m){
  try{ return new Date(m + '-01T00:00:00').toLocaleDateString(uiLocale(), {month:'long', year:'numeric'}); }
  catch(e){ return m; }
}
function monthEndOf(m){
  const y = +m.slice(0,4), mo = +m.slice(5,7);
  return m + '-' + String(new Date(y, mo, 0).getDate()).padStart(2,'0');
}
function openMonthReports(){
  const hist = (targets._history) || {};
  const months = new Set(Object.keys(hist));
  Object.keys(targets).filter(k=>!k.startsWith('_')).forEach(r => {
    const t = targets[r]; if(t && t.achievedAsOf) months.add(t.achievedAsOf.slice(0,7));
  });
  erpPeriods().forEach(p => { if(p.from) months.add(p.from.slice(0,7)); if(p.to) months.add(p.to.slice(0,7)); });
  const sorted = [...months].filter(Boolean).sort().reverse();
  if(!sorted.length){ showToast('لا توجد بيانات شهور بعد — ارفع ملف DSR أو المبيعات أولًا'); return; }
  showModal(`
    <h3 style="margin-top:0;">📚 تقارير الشهور</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;">افتح أي شهر — حتى بعد انتهائه — لترى التارغت والمحقق والنسبة وكل تفاصيله. رفع ملف DSR آخر يوم بالشهر (أو بعده) يُحدّث شهرَه تلقائيًا.</p>
    ${sorted.map(m=>`<div class="card clickable row-between" onclick="renderMonthClose('${m}')">
      <span style="font-weight:700;">${monthLabel(m)}</span><span style="color:var(--muted);">›</span>
    </div>`).join('')}
    <button class="btn secondary" style="margin-top:10px;" onclick="closeModal()">إغلاق</button>
  `);
}
function monthCloseData(m){
  const hist = (targets._history || {})[m] || {};
  const mStart = m + '-01', mEnd = monthEndOf(m);
  const reps = currentUser.role==='supervisor' ? REPS : [currentUser.name];
  return reps.map(rep => {
    let t = hist[rep];
    const cur = targets[rep];
    // live figures for the same month win when at least as fresh as the archive
    if(cur && (cur.achievedAsOf||'').slice(0,7) === m &&
       (!t || (t.achievedAsOf||'') <= (cur.achievedAsOf||''))) t = cur;
    const erpMonth = erpRevenueForRange(mStart, mEnd, rep);
    // official DSR figure + any invoices dated after its as-of day, capped to the month
    let achieved = null, src = '';
    if(t && t.achieved != null){
      const asOf = t.achievedAsOf || mStart;
      const d = new Date(asOf + 'T00:00:00'); d.setDate(d.getDate() + 1);
      const from = localDateStr(d);
      const extra = (from <= mEnd && from.slice(0,7) === m) ? (erpRevenueForRange(from, mEnd, rep) || 0) : 0;
      achieved = Math.round((t.achieved + extra) * 100) / 100;
      src = `DSR ${fmtDate(asOf)}${extra > 0 ? ' + فواتير بعده' : ''}`;
    } else if(erpMonth != null){
      achieved = erpMonth; src = 'فواتير ERP فقط';
    }
    const mv = UMCore.dedupeVisits(visits.filter(v => v && v.rep === rep && (v.date||'').slice(0,7) === m)).unique;
    return { rep, t, achieved, src, erpMonth,
      target: t && t.revenue > 0 ? t.revenue : null,
      pct: (t && t.revenue > 0 && achieved != null) ? Math.round(achieved / t.revenue * 100) : null,
      fieldVisits: mv.filter(UMCore.isFieldVisit).length,
      calls: mv.filter(v => v.callOnly).length,
      orders: mv.filter(v => v.orderTaken).length };
  });
}
function renderMonthClose(m){
  const rows = monthCloseData(m);
  const brandBlock = r => {
    const bt = (r.t && r.t.brands) || {}, ab = (r.t && r.t.achievedBrands) || {};
    const names = [...new Set([...Object.keys(bt), ...Object.keys(ab)])].sort((a,b)=>(bt[b]||0)-(bt[a]||0));
    if(!names.length) return '';
    return `<div style="margin-top:6px; overflow-x:auto;"><table style="width:100%; font-size:11.5px; border-collapse:collapse;">
      <tr style="color:var(--muted);"><td style="padding:2px 4px;">البراند</td><td style="text-align:start;">تارغت</td><td style="text-align:start;">محقق</td><td style="text-align:start;">%</td></tr>
      ${names.map(n=>{
        const tv = bt[n]||0, av = ab[n]||0;
        const p = tv>0 ? Math.round(av/tv*100) : null;
        return `<tr style="border-top:1px dashed var(--line);"><td style="padding:2px 4px;">${esc(n)}</td>
          <td style="text-align:start;">${tv?money(tv):'—'}</td><td style="text-align:start;">${av?money(av):'—'}</td>
          <td style="text-align:start; font-weight:700; color:${p==null?'var(--muted)':p>=100?'var(--sage-ink)':p>=60?'var(--gold-ink)':'var(--coral-ink)'};">${p==null?'—':p+'%'}</td></tr>`;
      }).join('')}
    </table></div>`;
  };
  const tt = teamTargetTotal(rows.map(r => ({ goal: r.target, ach: r.achieved })));
  showModal(`
    <div class="row-between" style="align-items:flex-start;">
      <h3 style="margin:0;">📅 ${monthLabel(m)}</h3>
      <button class="chip small" onclick="openMonthReports()">‹ الشهور</button>
    </div>
    ${tt.pct != null && tt.n > 1 ? `<div class="section-title">🏁 الفريق</div>
      <div class="card" style="padding:10px 12px;">
        <div class="spec-row"><span class="k">🎯 مجموع التارغت</span><span class="v">${money(tt.goal)}</span></div>
        <div class="spec-row"><span class="k">✅ مجموع المحقق</span><span class="v">${money(tt.ach)}</span></div>
        <div class="spec-row"><span class="k">نسبة تحقيق الفريق</span><span class="v" style="font-weight:800; color:${tt.pct>=100?'var(--sage-ink)':tt.pct>=60?'var(--gold-ink)':'var(--coral-ink)'};">${tt.pct}%</span></div>
        <div style="height:7px; border-radius:4px; background:var(--paper); overflow:hidden; margin:4px 0 2px;"><div style="width:${Math.min(100,tt.pct)}%; height:100%; background:${tt.pct>=100?'var(--sage)':'var(--teal)'};"></div></div>
      </div>` : ''}
    ${rows.map(r=>`
      <div class="section-title">${esc(r.rep)}</div>
      <div class="card" style="padding:10px 12px;">
        <div class="spec-row"><span class="k">🎯 التارغت</span><span class="v">${r.target!=null?money(r.target):'—'}</span></div>
        <div class="spec-row"><span class="k">✅ المحقق</span><span class="v">${r.achieved!=null?money(r.achieved):'—'}${r.src?` <span style="color:var(--muted); font-size:10.5px;">(${r.src})</span>`:''}</span></div>
        ${r.pct!=null?`<div class="spec-row"><span class="k">النسبة</span><span class="v" style="font-weight:800; color:${r.pct>=100?'var(--sage-ink)':r.pct>=60?'var(--gold-ink)':'var(--coral-ink)'};">${r.pct}%</span></div>
        <div style="height:7px; border-radius:4px; background:var(--paper); overflow:hidden; margin:4px 0 2px;"><div style="width:${Math.min(100,r.pct)}%; height:100%; background:${r.pct>=100?'var(--sage)':'var(--teal)'};"></div></div>`:''}
        ${r.erpMonth!=null?`<div class="spec-row"><span class="k">🧾 فواتير العيادات بالشهر (ERP)</span><span class="v">${money(r.erpMonth)}</span></div>`:''}
        <div class="spec-row"><span class="k">🚗 زيارات ميدانية · 📞 مكالمات · 🛒 طلبات</span><span class="v">${r.fieldVisits} · ${r.calls} · ${r.orders}</span></div>
        ${brandBlock(r)}
      </div>`).join('')}
    <p style="color:var(--muted); font-size:11.5px; margin-top:8px;">لتحديث الشهر بعد انتهائه: ارفع ملف DSR الخاص بآخر يوم فيه من شاشة الاستيراد — يُقفَل الشهر على أرقامه تلقائيًا.</p>
    <button class="btn secondary" onclick="closeModal()">إغلاق</button>
  `);
}
// Persistent status line inside the import modal — file handling must never
// fail silently (a missed 2-second toast reads as "nothing happened").
function erpStatus(msg, isErr){
  const el = document.getElementById('erpStatus');
  if(!el){ if(msg) showToast(msg); return; }
  el.style.display = 'block';
  el.style.color = isErr ? 'var(--coral)' : 'var(--muted)';
  el.textContent = msg;
}
// ---- Product movement: every brand → its products ranked by real paid sales ----
// Built from the stored ERP rows (team sales only — ignored salesmen are never
// read), classified fast / mid / slow by invoice frequency and units per month.
let _pmRep = 'all', _pmCls = 'all', _pmOpen = {};
const PM_CLS = { fast: ['🟢', 'Fast'], mid: ['🟡', 'Mid'], slow: ['🔴', 'Slow'], none: ['⚪', 'No sale'] };
function pmInt(n){ return Math.round(n || 0).toLocaleString('en-US'); }
function pmRows(){
  const sup = currentUser.role === 'supervisor';
  const rep = sup ? _pmRep : currentUser.name;
  const out = [];
  erpPeriods().forEach(p => {
    const map = p.repMap || {};
    unpackErpRows(p.rows).forEach(rw => {
      if(UMCore.matchCustomer((rw.customer || '').trim(), clinics, erpMap).ignored) return; // accounts the supervisor set to ignore
      if(rep !== 'all' && UMCore.erpRowRep(rw, clinics, erpMap, map) !== rep) return;
      out.push(rw);
    });
  });
  return out;
}
function openProductMovement(){
  const sup = currentUser.role === 'supervisor';
  const m = UMCore.productMovement(pmRows(), { isExchange: isExchangeLine });
  window._pm = m;
  const chip = (on, label, action) => `<div class="chip small ${on?'on':''}" onclick="${action}">${label}</div>`;
  showModal(`
    <h3 style="margin-top:0;">${I('chart')} Product movement</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Every brand, its products ranked by real paid sales from the uploaded ERP files. Fast = 4+ invoices a month, or 100+ units a month on 3+ invoices. Mid = 1 to 4 invoices a month. Slow = under one invoice a month, or sold only once. Rates are measured over at least 2 months, so a weeks-old launch is marked New rather than judged. Returns are shown next to sales, never hidden inside them.</p>
    ${sup ? `<div class="chip-row" style="margin-bottom:8px;">${chip(_pmRep==='all','All',"_pmRep='all'; openProductMovement();")}${REPS.map((r,i)=>chip(_pmRep===r, esc(r), `_pmRep=REPS[${i}]; openProductMovement();`)).join('')}</div>` : ''}
    ${!m.products ? `<div class="card" style="padding:14px;"><div style="color:var(--muted); font-size:13px;">${erpPeriods().length ? 'No sales for this selection in the uploaded files yet.' : (sup ? 'No sales files yet. Upload the ERP sales file first.' : 'No sales files yet.')}</div></div>` : `
    <div class="chip-row" style="margin-bottom:8px;">
      ${chip(_pmCls==='all', 'All · '+m.sold, "_pmCls='all'; renderPmList();")}
      ${['fast','mid','slow','none'].map(k=>chip(_pmCls===k, PM_CLS[k][0]+' '+PM_CLS[k][1]+' · '+m.counts[k], `_pmCls='${k}'; renderPmList();`)).join('')}
    </div>
    <div class="card" style="padding:12px; margin-bottom:10px;">
      <div class="row-between"><strong>${fmtDate(m.from)} → ${fmtDate(m.to)}</strong><span style="color:var(--muted); font-size:12.5px;">${m.months.toFixed(1)} months</span></div>
      <div style="color:var(--muted); font-size:12.5px; margin-top:4px;">${m.sold} product${m.sold===1?'':'s'} sold in ${m.brands.length} brand${m.brands.length===1?'':'s'} · ${erpPeriods().length} sales file${erpPeriods().length===1?'':'s'}${sup && _pmRep==='all' ? ' · team sales only (ignored salesmen are never read)' : ''}</div>
      ${m.provisional ? `<div style="color:var(--gold-ink); font-size:12px; margin-top:6px;">Under 2 months of data — classes settle as more sales files are uploaded.</div>` : ''}
    </div>
    <input type="text" id="pmSearch" placeholder="Search brands or products..." oninput="renderPmList()" style="margin-bottom:10px;">
    <div id="pmList"></div>`}
  `);
  renderPmList();
}
function pmFlagText(f){
  switch(f.k){
    case 'returns': return `Returns ${f.pct}% of sales` + (f.noInv ? ' — mostly stock returns without an invoice' : '');
    case 'exceed': return 'Returns exceed sales';
    case 'new': return `New: first sale ${fmtDate(f.first)}`;
    case 'fill': return `${f.pct}% of sales in one month (${f.month})`;
    case 'stale': return `No sale for ${f.days} days`;
    case 'decline': return 'Last 3 months under 40% of the average';
    case 'merged': return `Also sold as: ${f.names.join(' / ')}`;
    case 'exchanged': return `${pmInt(f.units)} exchanged (not a return)`;
    case 'focOnly': return `Free only (${pmInt(f.units)} units)`;
    case 'returnsOnly': return `Returns only (${pmInt(f.units)} units)`;
  }
  return '';
}
function pmRow(p){
  const [dot, label] = PM_CLS[p.cls];
  const retTxt = p.ret ? ` · ${pmInt(p.ret)} returned${(window._pm && window._pm.hasRefs && p.retNoInv) ? ` · ${pmInt(p.retNoInv)} without invoice` : ''}` : '';
  const nums = p.hasPaid
    ? `${pmInt(p.paid)} units · ${p.upm < 10 ? p.upm.toFixed(1) : pmInt(p.upm)}/mo · ${p.invoices} inv · ${p.customers} customer${p.customers===1?'':'s'}${retTxt} · ${money(p.kd)}`
    : [p.focNet > 0 ? `${pmInt(p.focNet)} free` : '', p.ret ? `${pmInt(p.ret)} returned` : '', p.kd ? money(p.kd) : ''].filter(Boolean).join(' · ');
  const flags = (p.flags || []).map(pmFlagText).filter(Boolean);
  return `<div data-pm-row="${p.cls}" style="display:flex; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); align-items:flex-start;">
    <div style="width:22px; text-align:center; color:var(--muted); font-size:12px; padding-top:2px;">${p.rank}</div>
    <div style="flex:1; min-width:0;">
      <div style="font-size:13.5px; font-weight:600;">${dot} ${esc(p.name)} <span style="color:var(--muted); font-weight:400; font-size:11.5px;">${label}${p.abc ? ` · ${p.abc}` : ''}</span></div>
      <div style="color:var(--muted); font-size:12px; margin-top:2px;">${nums}</div>
      ${flags.length ? `<div style="color:var(--gold-ink); font-size:11.5px; margin-top:2px;">${flags.map(esc).join(' · ')}</div>` : ''}
    </div>
  </div>`;
}
function pmToggle(i){ const B = (window._pm && window._pm.brands[i]); if(!B) return; _pmOpen[B.key] = !_pmOpen[B.key]; renderPmList(); }
function renderPmList(){
  const el = document.getElementById('pmList'); if(!el || !window._pm) return;
  const q = ((document.getElementById('pmSearch') || {}).value || '').trim().toLowerCase();
  const m = window._pm;
  const html = m.brands.map((B, bi) => {
    let prods = B.products;
    if(_pmCls !== 'all') prods = prods.filter(p => p.cls === _pmCls);
    if(q && !B.brand.toLowerCase().includes(q)) prods = prods.filter(p => p.name.toLowerCase().includes(q) || (p.otherNames || []).some(n => n.toLowerCase().includes(q)));
    if(!prods.length) return '';
    const open = !!_pmOpen[B.key] || !!q || _pmCls !== 'all';
    const c = B.counts, ret = B.retInv + B.retNoInv;
    return `<div class="card" style="margin-bottom:8px; padding:12px 14px;">
      <div class="row-between clickable" onclick="pmToggle(${bi})">
        <div style="flex:1; min-width:0;"><div class="clinic-name">${esc(B.brand) || 'No brand'}</div>
          <div class="clinic-sub">${B.sold} product${B.sold===1?'':'s'} · 🟢 ${c.fast} · 🟡 ${c.mid} · 🔴 ${c.slow}${c.none ? ` · ⚪ ${c.none}` : ''}</div>
          <div class="clinic-sub">${pmInt(B.paid)} units · ${money(B.kd)}${ret ? ` · ${pmInt(ret)} returned` : ''}</div></div>
        <span style="color:var(--muted);">${open ? '▾' : '›'}</span>
      </div>
      ${open ? `<div style="margin-top:8px; border-top:1px solid var(--line);">${prods.map(pmRow).join('')}</div>` : ''}
    </div>`;
  }).join('');
  el.innerHTML = html || `<div style="color:var(--muted); font-size:13px; text-align:center; padding:16px;">Nothing matches.</div>`;
}

function openErpImport(){
  if(currentUser.role!=='supervisor'){ showToast('Supervisor only'); return; }
  const periods = erpPeriods().slice().sort((a,b)=>(b.from||'').localeCompare(a.from||''));
  showModal(`
    <h3 style="margin-top:0;">📥 Import — fully automatic <span style="color:var(--muted); font-size:11px; font-weight:400;">${APP_REV}</span></h3>
    <div style="color:var(--muted); font-size:13px; line-height:1.6; margin-bottom:12px;">
      Drop the <b>sales-detail export</b> or the <b>DSR targets file</b> — Excel (.xlsx), CSV, or PDF text
      pasted below all work, and I detect which file is which and enter it by myself.
      Sales files import with zero clicks once I know who is who (I ask only the first time).
      <b>One file per rep works too</b> — upload Mariam's and Renova's exports separately and
      each is kept as its own report; re-importing one never touches the other.</div>
    ${erpHealthCard()}
    <input type="file" id="erpFile" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="erpHandleFile(this)">
    <div id="erpStatus" style="display:none; margin-top:8px; font-size:12.5px; line-height:1.5;"></div>
    <div id="erpCloudStatus" style="margin-top:8px; font-size:12px; color:var(--muted); line-height:1.5;">☁️ جارٍ التحقق مما تحمله السحابة فعلًا…</div>
    ${returnPolicyChips()}
    <label style="margin-top:10px;">…or paste the report text here</label>
    <textarea id="erpPaste" style="min-height:90px;" placeholder="Paste CSV rows, PDF report text, or target lines like: Renova 12000"></textarea>
    <button class="btn secondary small" style="margin-top:8px;" onclick="erpAutoImport(document.getElementById('erpPaste').value)">Read pasted text</button>
    ${salesmenCard()}
    ${periods.length?`<div class="section-title">Saved sales periods</div>
      ${periods.map(p=>{
        const reps = [...new Set(Object.values(p.repMap||{}).filter(Boolean))];
        const who = reps.length ? reps.join(' + ') : Object.keys(p.repMap||{}).join(' + ');
        return `<div class="card" style="padding:12px 14px; margin-bottom:8px;${p.rowsMissing?' border-inline-start:4px solid var(--coral);':''}">
        <div class="row-between">
          <div><div style="font-weight:700; font-size:13.5px;">${fmtDate(p.from)} – ${fmtDate(p.to)}${who?` <span style="color:var(--gold-ink); font-size:12px;">· ${esc(who)}</span>`:''}</div>
          <div style="color:var(--muted); font-size:12px;">${p.rowsMissing ? '⚠️ السطور لم تُحمَّل على هذا الجهاز — ' : ''}${money(p.net)} net · ${p.rowCount} lines</div></div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            ${p.rowsMissing ? `<button class="chip small on" onclick="retryErpRows().then(()=>openErpImport())">🔄</button>` : `<button class="chip small" onclick="openErpRecon('${p.id}')">📊 Report</button>`}
            <button class="chip small" onclick="deleteErpPeriod('${p.id}')">🗑</button>
          </div>
        </div>
      </div>`;}).join('')}`:''}
    <button class="btn" style="margin-top:12px;" onclick="closeModal()">Done</button>
  `);
  erpCloudStatus();
}
// What the CLOUD actually holds right now — read fresh, so the supervisor can
// see with their own eyes that an upload landed (and when).
async function erpCloudStatus(){
  const el = document.getElementById('erpCloudStatus');
  if(!el) return;
  try{
    const cur = await withTimeout(window.storage.get('erpSales', true, { server: true }), 10000);
    const idx = cur ? UMCore.safeParse(cur.value, null) : null;
    const ps = (idx && Array.isArray(idx.periods)) ? idx.periods : [];
    if(!document.getElementById('erpCloudStatus')) return;
    const rows = ps.reduce((s, p) => s + ((p.rowsRef && p.rowsRef.count) || (Array.isArray(p.rows) ? p.rows.length : p.rowCount) || 0), 0);
    const latest = ps.slice().sort((a,b)=>(b.to||'').localeCompare(a.to||''))[0];
    const localIds = new Set(erpPeriods().map(p => p.id));
    const same = ps.length === localIds.size && ps.every(p => localIds.has(p.id));
    el.innerHTML = `☁️ <b>السحابة الآن:</b> ${ps.length} ${ps.length === 1 ? 'ملف' : 'ملفات'} · ${rows} سطر${latest ? ` · آخر بيانات حتى <b>${fmtDate(latest.to)}</b>` : ''}${idx && idx.savedAt ? ` · آخر حفظ مؤكَّد ${new Date(idx.savedAt).toLocaleString('ar-KW', {dateStyle:'short', timeStyle:'short'})}` : ''}${same ? ' · <span style="color:var(--green, #1D7A38);">مطابقة لما تراه ✓</span>' : ' · <span style="color:var(--coral);">تختلف عمّا تراه هنا — أعد فتح التطبيق</span>'}`;
  }catch(e){
    el.innerHTML = '☁️ <span style="color:var(--coral);">تعذّر الوصول إلى السحابة الآن</span> — الرفع سيفشل بوضوح (لن يُعرض نجاح كاذب) حتى يعود الاتصال.';
  }
}
let _erpImporting = false; // one file at a time — a double tap must not race two saves
function erpHandleFile(input){
  const f = input.files && input.files[0];
  if(!f) return;
  input.value = ''; // so picking the same file again always re-fires onchange
  if(_erpImporting){ erpStatus('⏳ ملف آخر قيد الاستيراد — انتظر حتى ينتهي', true); return; }
  erpStatus(`📖 Reading ${f.name}…`);
  const fail = e => erpStatus('❌ Import failed: ' + (e && e.message ? e.message : e), true);
  const reader = new FileReader();
  reader.onerror = () => erpStatus('❌ Could not read the file — try again, or paste the report text below', true);
  if(/\.xlsx?$/i.test(f.name) || /spreadsheet|excel/i.test(f.type || '')){
    reader.onload = () => { try{ erpImportXlsx(reader.result, f.name).catch(fail); }catch(e){ fail(e); } };
    reader.readAsArrayBuffer(f);
  } else {
    reader.onload = () => { try{ Promise.resolve(erpAutoImport(String(reader.result||''))).catch(fail); }catch(e){ fail(e); } };
    reader.readAsText(f);
  }
}
// Excel path: read the workbook in the browser (no libraries), then feed the
// sheets to the same sales/targets detectors used for CSV.
// "DSR_11.08.26.xlsx" carries its own report date — truer than the upload
// day for judging which uploaded source is freshest.
function dsrDateFromName(name){
  const s = String(name || '');
  let y, mo, d;
  const iso = s.match(/(\d{4})[.\-_](\d{1,2})[.\-_](\d{1,2})/);   // DSR 2026-09-21.xlsx
  const dmy = s.match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{2,4})/); // DSR_21.09.26.xlsx
  if(iso){ y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
  else if(dmy){ d = +dmy[1]; mo = +dmy[2]; y = +dmy[3]; if(y < 100) y += 2000; }
  else return null;
  if(y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const out = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  // A date that cannot be this report's as-of day (in the future, or older
  // than ~2 months) would silently freeze the Today figure on a wrong day —
  // treat it as unknown so the upload day is used instead.
  const today = todayStr();
  if(out > today || UMCore.daysBetween(out, today) > 62) return null;
  return out;
}
async function erpImportXlsx(buf, fname){
  if(typeof DecompressionStream === 'undefined'){
    erpStatus('❌ This browser is too old to open Excel files — update the browser, or export the report as CSV and retry', true);
    return;
  }
  let sheets;
  try{ sheets = await UMCore.readXlsx(buf); }
  catch(e){ erpStatus('❌ Could not open this Excel file — save it as CSV and retry', true); return; }
  erpStatus('🔎 File opened — detecting sales / targets…');
  const toCsv = rows => rows.map(r => (r||[]).map(v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
  for(const sh of sheets){
    const csv = toCsv(sh.rows);
    if(!UMCore.parseErpCsv(csv).error){ await erpAutoImport(csv); return; } // awaited: a save error must reach the status line
  }
  const tg = UMCore.parseDsrTargets(sheets, REPS, {asOf: dsrDateFromName(fname) || todayStr()});
  if(!tg.error){ await applyTargetsFile(tg); return; }
  erpStatus('❌ Excel file read, but no sales or targets recognized in it — check it is the sales-detail or DSR export', true);
}
// One entry point, zero-touch: detect sales vs targets and enter the data.
// Sales files auto-save when every ERP salesman is already known (stored
// mapping from a previous import, or a confident fuzzy guess).
async function erpAutoImport(text){
  if(!text || !text.trim()){ erpStatus('Nothing to read yet', true); return; }
  if(_erpImporting){ erpStatus('⏳ ملف آخر قيد الاستيراد — انتظر حتى ينتهي', true); return; }
  _erpImporting = true;
  try{
    const sales = UMCore.parseErpFile(text);
    if(!sales.error){
      erpStatus('💾 Sales recognized — saving…');
      const totals = UMCore.erpTotals(sales.rows);
      const salesmen = Object.keys(totals.bySalesman);
      // A file that cannot be a sales export of this business (a span longer
      // than a year, or invoices dated in the future) is refused rather than
      // allowed to replace a whole year of stored data with mis-read dates.
      const span = UMCore.daysBetween(totals.from, totals.to);
      if(span > 400 || totals.to > UMCore.localDateStr(new Date(Date.now() + 2 * 86400000))){
        erpStatus(`❌ تواريخ الملف غير منطقية (${fmtDate(totals.from)} – ${fmtDate(totals.to)}) — تأكد من صيغة التاريخ في التصدير (يوم/شهر/سنة) ثم أعد الرفع`, true);
        return;
      }
      if(sales.dropped > 0 && !confirm(`${sales.dropped} سطرًا في الملف بلا تاريخ أو رقم فاتورة ولن تُقرأ (سيُقرأ ${sales.rows.length}).\nالمتابعة؟`)){
        erpStatus('↩️ أُلغي الاستيراد — راجع الملف', true);
        return;
      }
      const stored = erpSales.repMapGlobal || {};
      const guess = UMCore.guessRepMap(salesmen, REPS);
      // Zero-touch only for names the supervisor has already confirmed; a new
      // name — even one that looks like a rep's — is shown once for a click.
      const known = sm => Object.prototype.hasOwnProperty.call(stored, sm);
      if(salesmen.every(known)){
        // An older export than what is already stored (e.g. last week's file
        // picked by mistake) would silently roll the figures back — ask first.
        const storedTo = erpOlderThanStored(totals, salesmen);
        if(storedTo && !confirm(`الملف ينتهي في ${fmtDate(totals.to)} بينما المحفوظ يصل إلى ${fmtDate(storedTo)}.\nاستبدال البيانات الأحدث بهذا الملف الأقدم؟`)){
          erpStatus(`↩️ أُلغي الاستيراد — الملف أقدم من المحفوظ (${fmtDate(storedTo)})`, true);
          return;
        }
        const repMap = {};
        salesmen.forEach(sm => { repMap[sm] = Object.prototype.hasOwnProperty.call(stored, sm) ? stored[sm] : guess[sm]; });
        _erpParsed = { rows: sales.rows, totals, guess: repMap };
        await erpAutoSave(repMap);
        return;
      }
      erpParse(text); // a brand-new salesman name → verify once, remembered after
      return;
    }
    const tg = UMCore.parseTargetsFile(text, REPS);
    if(!tg.error){ await applyTargetsFile(tg); return; }
    erpStatus('❌ Could not recognize this file — export the sales detail or the targets as CSV/Excel and retry', true);
  } finally { _erpImporting = false; }
}
// A new file only replaces its own salesmen's rows inside overlapping saved
// periods — so Mariam's file and Renova's file for the same month coexist as
// two separate reports, and re-importing one rep's file never wipes the other.
function erpAbsorbOverlaps(t, newSalesmen, repMap){
  const names = new Set(newSalesmen.map(n => erpSalesmanKey(n, repMap)));
  let replaced = 0;
  const kept = [];
  erpPeriods().forEach(p => {
    if(!(p.from <= t.to && p.to >= t.from)){ kept.push(p); return; }
    if(p.rowsMissing){ kept.push(p); return; } // rows not on this device: never judge (or drop) what we cannot see
    const rows = unpackErpRows(p.rows);
    // Only the new file's salesmen AND only the days the new file covers are
    // replaced — a narrower re-export (one week, one rep) never wipes the
    // earlier weeks already stored.
    const remain = rows.filter(r => !(names.has(erpSalesmanKey(r.salesman, p.repMap)) && r.date >= t.from && r.date <= t.to));
    if(!remain.length){ replaced++; erpTombstone(p.id); return; } // fully superseded — never merged back from the cloud
    if(remain.length === rows.length){ kept.push(p); return; } // other rep's report — untouched
    const tt = UMCore.erpTotals(remain);                   // strip this rep, keep the rest
    replaced++;
    kept.push(Object.assign({}, p, { net: Math.round(tt.net*1000)/1000, rowCount: tt.lines,
      from: tt.from || p.from, to: tt.to || p.to, rev: Date.now(), rows: packErpRows(remain) }));
  });
  erpSales.periods = kept;
  return replaced;
}
// An import that did not reach the cloud is rolled back on screen and said so
// plainly — the old code showed "✅ imported" whatever the save returned, so
// the figures looked updated until the next open put the old file back.
function erpSaveFailed(before){
  erpStateRestore(before);
  erpStatus('❌ لم يُحفظ الملف على السحابة — تحقق من الاتصال وارفع الملف مرة أخرى', true);
  showToast('❌ لم يُحفظ ملف المبيعات — أعد المحاولة');
}
async function erpAutoSave(repMap){
  if(!_erpParsed) return;
  const d = dropIgnoredRows(_erpParsed.rows, repMap);
  if(!d.kept.length){ erpStatus('Nothing to import — every salesman in this file is ignored (not my team)', true); _erpParsed = null; return; }
  const t = UMCore.erpTotals(d.kept);
  const before = erpStateSnapshot();
  const pctBefore = targetPctMap();
  const replaced = erpAbsorbOverlaps(_erpParsed.totals, Object.keys(_erpParsed.totals.bySalesman), repMap);
  const period = { id: uid(), from: t.from, to: t.to, net: Math.round(t.net*1000)/1000,
    rowCount: d.kept.length, importedAt: new Date().toISOString(), repMap, rev: Date.now(), rows: packErpRows(d.kept) };
  erpSales.periods.push(period);
  erpSales.repMapGlobal = Object.assign({}, erpSales.repMapGlobal, repMap);
  if(!await persist('erpSales')){ erpSaveFailed(before); return; }
  _erpParsed = null;
  _erpCtxCache = { key: null, ctx: null };
  renderErpNudge();
  renderToday();          // the Today target card always follows the newest upload
  renderView(activeView); // repaint the live tab so new figures show at once
  showToast(`✅ Auto-imported ${fmtDate(period.from)}–${fmtDate(period.to)} · ${money(period.net)}${replaced?` (replaced ${replaced} older)`:''}${d.dropped?` · ignored ${d.dropped} lines (${d.names.join(', ')})`:''}`);
  openErpRecon(period.id);
  erpShowImportNote(`✅ حُفظ الملف في السحابة (${fmtDate(period.from)} – ${fmtDate(period.to)} · ${money(period.net)})<br>${targetPctNote(pctBefore, targetPctMap())}`);
}
// A month that ended must keep its target/achieved figures forever. Whenever a
// rep's stored figures carry an as-of date, a copy lands in
// targets._history[month] (newest as-of wins), so the Monthly reports screen
// can show any past month even after new targets replace the current ones —
// and re-uploading a month's LAST-day DSR after the month ends files it
// straight into that month's record.
async function archiveTargetsMonth(){
  try{
    if(!currentUser || currentUser.role !== 'supervisor') return;
    if(_loadFailed.targets || _mirrorUsed.targets) return;
    const hist = targets._history = targets._history || {};
    let changed = false;
    REPS.forEach(rep => {
      const t = targets[rep];
      if(!t || !t.achievedAsOf) return;
      const m = t.achievedAsOf.slice(0,7);
      const cur = (hist[m] = hist[m] || {})[rep];
      // newer as-of wins; a SAME-day re-upload (the corrected month-end file)
      // wins too, but identical figures don't cause a pointless write
      const fresher = !cur || (cur.achievedAsOf||'') < t.achievedAsOf ||
        ((cur.achievedAsOf||'') === t.achievedAsOf && JSON.stringify(cur) !== JSON.stringify(t));
      if(fresher){
        hist[m][rep] = JSON.parse(JSON.stringify(t));
        changed = true;
      }
    });
    if(changed) await persist('targets');
  }catch(e){ console.error('archive targets', e); }
}
async function applyTargetsFile(tg){
  const before = JSON.parse(JSON.stringify(targets));
  const pctBefore = targetPctMap();
  Object.keys(tg.targets).forEach(rep => {
    targets[rep] = Object.assign({}, targets[rep], tg.targets[rep]);
    targets[rep].month = (tg.targets[rep].achievedAsOf || todayStr()).slice(0, 7); // a target belongs to ONE month
  });
  await archiveTargetsMonth(); // the file's month keeps these figures permanently
  if(!await persist('targets')){
    targets = before;
    erpStatus('❌ لم تُحفظ الأهداف على السحابة — تحقق من الاتصال وارفع الملف مرة أخرى', true);
    return;
  }
  renderToday();
  if(document.getElementById('coachCard')) renderCoach();
  const note = targetPctNote(pctBefore, targetPctMap());
  showModal(`
    <h3 style="margin-top:0;">🎯 Targets entered automatically</h3>
    <div class="card" style="border-inline-start:4px solid var(--sage, #9ED0AF); margin:8px 0 10px; font-size:12.5px; line-height:1.6;">${note}</div>
    <div class="card">
      ${tg.matched.map(m=>`<div class="report-line"><span>${esc(m.rep)} <span style="color:var(--muted); font-size:11.5px;">(from “${esc(m.name)}”)</span></span><span class="v">${money(m.revenue)}${m.achieved?` · achieved ${money(m.achieved)}`:''}${m.visits?` · ${m.visits} visits`:''}${m.brandCount?` · ${m.brandCount} brand targets`:''}</span></div>`).join('')}
    </div>
    ${tg.unmatched.length?`<div class="nudge" style="margin-top:10px;">Skipped (not on your team): ${tg.unmatched.map(esc).join(', ')}</div>`:''}
    <div style="color:var(--muted); font-size:12.5px; margin-top:10px;">The sales coach and target bars now track these numbers automatically.</div>
    <button class="btn" style="margin-top:12px;" onclick="closeModal()">Done</button>
  `);
}
function erpParse(text){
  if(!text || !text.trim()){ showToast('Nothing to read yet'); return; }
  const res = UMCore.parseErpFile(text);
  if(res.error){
    showToast(res.error==='UNRECOGNIZED' ? 'File format not recognized — export as CSV and try again' : 'No data rows found in the file');
    return;
  }
  const totals = UMCore.erpTotals(res.rows);
  const guess = UMCore.guessRepMap(Object.keys(totals.bySalesman), REPS);
  _erpParsed = { rows: res.rows, totals, guess };
  showModal(`
    <h3 style="margin-top:0;">✅ File recognized — verify before saving</h3>
    <div class="card">
      <div class="spec-row"><span class="k">Period found</span><span class="v">${fmtDate(totals.from)} – ${fmtDate(totals.to)}</span></div>
      <div class="spec-row"><span class="k">Lines</span><span class="v">${totals.lines}${res.skipped?` (+${res.skipped} skipped)`:''}</span></div>
      <div class="spec-row"><span class="k">Invoices / returns</span><span class="v">${totals.invoiceCount} / ${totals.returnCount}</span></div>
      <div class="spec-row"><span class="k">Net sales</span><span class="v">${money(totals.net)}</span></div>
      <div class="spec-row"><span class="k">Returned value</span><span class="v">${money(totals.sret)}</span></div>
    </div>
    <div style="color:var(--muted); font-size:12.5px; margin:8px 0;">Check the net total against the report footer — if it matches, the file was read correctly.</div>
    <div class="section-title">Who is who? (ERP name → your rep)</div>
    <div class="card">
      ${Object.keys(totals.bySalesman).map((sm,i)=>`
        <div class="row-between" style="gap:8px; padding:6px 0; ${i?'border-top:1px solid var(--line);':''}">
          <div style="flex:1; font-size:13px;">${esc(sm)}<br><span style="color:var(--muted); font-size:11.5px;">${money(totals.bySalesman[sm].net)} net</span></div>
          <select id="erpRep-${i}" style="width:150px;">
            <option value="">— ignore (not my team) —</option>
            ${REPS.map(r=>`<option value="${esc(r)}" ${_erpParsed.guess[sm]===r?'selected':''}>${esc(r)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>
    <button class="btn" style="margin-top:12px;" onclick="erpSavePeriod()">💾 Save & analyze</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal()">Cancel</button>
  `);
}
async function erpSavePeriod(){
  if(!_erpParsed) return;
  const salesmen = Object.keys(_erpParsed.totals.bySalesman);
  const repMap = {};
  salesmen.forEach((sm,i)=>{
    const sel = document.getElementById('erpRep-'+i);
    repMap[sm] = sel && sel.value ? sel.value : null;
  });
  const d = dropIgnoredRows(_erpParsed.rows, repMap);
  if(!d.kept.length){ showToast('Nothing to import — every salesman in this file is ignored'); return; }
  const t = UMCore.erpTotals(d.kept);
  const storedTo = erpOlderThanStored(_erpParsed.totals, salesmen);
  if(storedTo && !confirm(`الملف ينتهي في ${fmtDate(_erpParsed.totals.to)} بينما المحفوظ يصل إلى ${fmtDate(storedTo)}.\nاستبدال البيانات الأحدث بهذا الملف الأقدم؟`)){ showToast('↩️ أُلغي — الملف أقدم من المحفوظ'); return; }
  const before = erpStateSnapshot();
  const pctBefore = targetPctMap();
  // A new file replaces only its own salesmen's data in overlapping periods —
  // weekly cumulative exports never pile up, per-rep files coexist.
  const replaced = erpAbsorbOverlaps(_erpParsed.totals, salesmen, repMap);
  if(replaced) showToast(`Replacing ${replaced} older overlapping period${replaced===1?'':'s'}`);
  const period = { id: uid(), from: t.from, to: t.to, net: Math.round(t.net*1000)/1000,
    rowCount: d.kept.length, importedAt: new Date().toISOString(), repMap, rev: Date.now(), rows: packErpRows(d.kept) };
  erpSales.periods.push(period);
  // Remember who-is-who forever, so every later import is zero-touch.
  erpSales.repMapGlobal = Object.assign({}, erpSales.repMapGlobal, repMap);
  if(!await persist('erpSales')){ erpStateRestore(before); closeModal(); openErpImport(); erpSaveFailed(before); return; } // roll back BEFORE the list renders
  _erpParsed = null;
  _erpCtxCache = { key: null, ctx: null };
  renderErpNudge();
  renderToday();          // the Today target card always follows the newest upload
  renderView(activeView); // repaint the live tab so new figures show at once
  showToast(`📥 Sales period saved — future imports of these names are automatic${d.dropped?` · ignored ${d.dropped} lines (${d.names.join(', ')})`:''}`);
  openErpRecon(period.id);
  erpShowImportNote(`✅ حُفظ الملف في السحابة (${fmtDate(period.from)} – ${fmtDate(period.to)} · ${money(period.net)})<br>${targetPctNote(pctBefore, targetPctMap())}`);
}
async function deleteErpPeriod(id){
  const p0 = erpPeriods().find(p => p.id === id);
  if(p0 && !confirm(`حذف ملف ${fmtDate(p0.from)} – ${fmtDate(p0.to)} (${money(p0.net)})؟\nيمكن استرجاعه خلال 7 أيام من النسخ الاحتياطية.`)) return;
  erpSales.periods = erpPeriods().filter(p=>p.id!==id);
  erpTombstone(id); // so a merge with another device never brings it back
  // A delete that could not be saved is NOT undone on screen: the tombstone
  // stays, the red pill offers the retry, and the next successful save (from
  // any action) carries it — so a delete whose write landed late can never
  // "come back" and then vanish again.
  const ok = await persist('erpSales');
  renderView(activeView); // repaint the live tab so figures drop the deleted file
  showToast(ok ? 'Deleted' : '⚠️ الحذف لم يُحفظ بعد — اضغط شريط إعادة المحاولة');
  openErpImport();
}
async function saveErpCustMap(idx, value, periodId){
  const cust = _erpUnmatched[idx];
  if(!cust) return;
  if(value) erpMap[cust] = value; else delete erpMap[cust];
  await persist('erpMap');
  openErpRecon(periodId);
}
function erpClinicOptions(){
  return clinics.filter(c=>c.cls!=='Closed').slice().sort((a,b)=>a.name.localeCompare(b.name))
    .map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}
// A fast, precise "what did the app do with this file?" audit: every salesman
// mapped to a rep, every customer classified (clinic / channel / ignored /
// unmatched / ambiguous branches), with row counts and net — so the supervisor
// can verify the processing at a glance before trusting the numbers.
function erpFileAudit(p){
  const rows = erpViewRows(p);
  const repMap = p.repMap || {};
  // 1) totals
  const t = { rows: rows.length, net: 0, inv: {}, ret: {}, retVal: 0 };
  rows.forEach(r=>{ t.net += r.net; (r.type==='return'?t.ret:t.inv)[r.doc]=1; if(isExchangeLine(r)) t.exchVal=(t.exchVal||0)+UMCore.returnValue(r); else t.retVal += UMCore.returnValue(r); });
  t.net = Math.round(t.net*100)/100; t.retVal = Math.round(t.retVal*100)/100;
  // 2) salesman -> rep
  const bySales = {};
  rows.forEach(r=>{ const k=(r.salesman||'—').trim()||'—'; const a=bySales[k]||(bySales[k]={name:k, rep:repMap[k]||null, rows:0, net:0}); a.rows++; a.net+=r.net; });
  const salesmen = Object.values(bySales).map(a=>({...a, net:Math.round(a.net*100)/100})).sort((a,b)=>b.net-a.net);
  // 3) customer -> classification
  const byCust = {};
  rows.forEach(r=>{
    const k=(r.customer||'').trim()||'(no name)';
    const a=byCust[k]||(byCust[k]={name:k, rep:UMCore.erpRowRep(r, clinics, erpMap, repMap)||null, docs:new Set(), net:0});
    a.docs.add(r.doc); a.net+=r.net;
  });
  const customers = Object.values(byCust).map(a=>{
    const m = UMCore.matchCustomer(a.name, clinics, erpMap);
    let kind, label, clinicName='';
    if(m.ignored){ kind='ignored'; label='⛔ متجاهَل'; }
    else if(m.channel){ kind='channel'; label='🌐 قناة / أونلاين'; }
    else if(m.ambiguous){ kind='ambiguous'; label='⚠️ ملتبس — عدة فروع'; }
    else if(m.method==='family'){ kind='clinic'; clinicName=m.familyLabel||''; label='✅ '+esc(m.familyLabel||'')+' <span style="color:var(--muted); font-size:10.5px;">(موحّد — '+m.branches+' فروع)</span>'; }
    else if(m.clinicId){ const c=clinics.find(x=>x.id===m.clinicId); clinicName=c?c.name:''; kind='clinic'; label='✅ '+esc(clinicName)+(m.method==='fuzzy'?' <span style="color:var(--muted);">(تقريبي)</span>':m.method==='map'?' <span style="color:var(--muted);">(يدوي)</span>':''); }
    else { kind='none'; label='⚠️ غير مطابق'; }
    return {name:a.name, rep:a.rep, invoices:a.docs.size, net:Math.round(a.net*100)/100, kind, label, method:m.method};
  }).sort((a,b)=>b.net-a.net);
  const counts = customers.reduce((c,x)=>{ c[x.kind]=(c[x.kind]||0)+1; return c; },{});
  return { rows, totals:t, salesmen, customers, counts };
}
function erpAuditSection(p){
  const a = erpFileAudit(p);
  const T = a.totals;
  const c = a.counts;
  const salesmanRows = a.salesmen.map(s=>`<tr style="border-top:1px solid var(--line);">
    <td style="padding:5px 6px;">${esc(s.name)}</td>
    <td style="padding:5px 6px;">${s.rep?esc(s.rep):'<span style="color:var(--coral-ink);">— خارج الفريق —</span>'}</td>
    <td style="text-align:end; padding:5px 6px;">${s.rows}</td>
    <td style="text-align:end; padding:5px 6px; font-weight:700;">${money(s.net)}</td></tr>`).join('');
  const needAttn = a.customers.filter(x=>x.kind==='none'||x.kind==='ambiguous');
  const custRows = a.customers.map(x=>{
    const bg = (x.kind==='none'||x.kind==='ambiguous') ? 'background:var(--amber-dim);' : '';
    return `<tr style="border-top:1px solid var(--line); ${bg}">
      <td style="padding:5px 6px;">${esc(x.name)}</td>
      <td style="padding:5px 6px; font-size:11.5px;">${x.label}</td>
      <td style="text-align:end; padding:5px 6px;">${x.invoices}</td>
      <td style="text-align:end; padding:5px 6px; font-weight:700; ${x.net<0?'color:var(--coral-ink);':''}">${money(x.net)}</td></tr>`;
  }).join('');
  return `
  <div class="section-title" style="margin-top:0;">🔍 مرجع المعالجة — كيف قرأ الموقع هذا الملف</div>
  <div class="card">
    <div class="report-line"><span>سطور الملف</span><span class="v">${T.rows}</span></div>
    <div class="report-line"><span>فواتير · مرتجعات</span><span class="v">${Object.keys(T.inv).length} · ${Object.keys(T.ret).length}</span></div>
    <div class="report-line"><span>صافي الملف الكامل</span><span class="v">${money(T.net)}</span></div>
    ${T.retVal>0.005?`<div class="report-line"><span>قيمة المرتجعات</span><span class="v" style="color:var(--coral-ink);">${money(T.retVal)}</span></div>`:''}
    <div class="report-line"><span>تصنيف العملاء</span><span class="v" style="font-size:12px;">✅ ${c.clinic||0} · 🌐 ${c.channel||0} · ⛔ ${c.ignored||0} · ⚠️ ${(c.none||0)+(c.ambiguous||0)}</span></div>
  </div>
  ${needAttn.length?`<div class="nudge" style="margin-bottom:10px; border-color:#FF9500;">⚠️ ${needAttn.length} عميل يحتاج ربطاً يدوياً (بالأصفر أدناه) — لن تُحسب مبيعاتهم لأي عيادة حتى تربطهم.</div>`:'<div class="nudge" style="margin-bottom:10px;">✅ كل العملاء مصنّفون — لا شيء معلّق.</div>'}
  <div class="section-title">👥 ربط البائعين بالمندوبات</div>
  <div class="card" style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
    <tr><th style="text-align:start; padding:4px 6px; color:var(--muted);">البائع في الملف</th><th style="text-align:start; padding:4px 6px; color:var(--muted);">المندوبة</th><th style="text-align:end; padding:4px 6px; color:var(--muted);">سطور</th><th style="text-align:end; padding:4px 6px; color:var(--muted);">صافي</th></tr>
    ${salesmanRows}
  </table></div>
  <div class="mr-note" style="color:var(--muted); font-size:11.5px; margin:6px 2px;">ملاحظة: مبيعات أي عيادة مطابَقة تُنسب لِـ<b>المندوبة المالكة للعيادة</b>، بغض النظر عن اسم البائع في الملف. الجدول أعلاه يبيّن ربط الأسماء كما في الملف فقط.</div>
  <div class="section-title">🏥 تصنيف كل عميل (مصدر المطابقة)</div>
  <div class="card" style="overflow-x:auto; max-height:340px; overflow-y:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
    <tr><th style="text-align:start; padding:4px 6px; color:var(--muted);">العميل في الملف</th><th style="text-align:start; padding:4px 6px; color:var(--muted);">صُنّف كـ</th><th style="text-align:end; padding:4px 6px; color:var(--muted);">فواتير</th><th style="text-align:end; padding:4px 6px; color:var(--muted);">صافي</th></tr>
    ${custRows}
  </table></div>`;
}
function openErpRecon(id){
  const p = erpPeriods().find(x=>x.id===id);
  if(!p){ showToast('Period not found'); return; }
  const rows = erpViewRows(p);
  const rec = UMCore.reconcileErp({ rows, visits, clinics, erpMap, repMap: p.repMap||{}, from: p.from, to: p.to, isExchange: isExchangeLine });
  _erpUnmatched = rec.unmatchedCustomers.slice();
  const priorRows = erpPriorReturns(p);
  const priorFor = rep => priorRows.filter(rw => UMCore.erpRowRep(rw, clinics, erpMap, p.repMap||{}) === rep);
  const kdRow = (label, val, color) => `<div class="report-line"><span>${label}</span><span class="v" ${color?`style="color:${color};"`:''}>${val}</span></div>`;
  const monthPrefix = todayStr().slice(0,7);
  const repCard = r => {
    const t = targets[r.rep] || {};
    const inThisMonth = (p.from||'').slice(0,7) === monthPrefix;
    const targetBar = (t.revenue > 0 && inThisMonth) ? (()=>{
      const pct = Math.min(100, Math.round(r.erp.net / t.revenue * 100));
      return `<div style="margin:8px 0 2px; font-size:12px; color:var(--muted);">Monthly target: ${money(r.erp.net)} of ${money(t.revenue)} (ERP-verified)</div>
        <div style="background:var(--paper); border-radius:8px; height:10px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:${pct>=100?'var(--sage)':pct>=60?'#FF9500':'var(--coral)'};"></div></div>
        ${t.achieved!=null?`<div style="font-size:11.5px; color:var(--muted); margin-top:4px;">Official DSR MTD: ${money(t.achieved)}${t.achievedAsOf?` (as of ${fmtDate(t.achievedAsOf)})`:''}</div>`:''}`;
    })() : '';
    return `
    <div class="section-title">👤 ${esc(r.rep)}</div>
    <div class="card">
      ${kdRow('ERP net sales', money(r.erp.net))}
      ${kdRow('— from clinics/customers', money(r.erp.clinicNet))}
      ${kdRow('— from online/channels', money(r.erp.channelNet))}
      ${kdRow('Invoices', r.erp.invoices)}
      ${r.erp.returns>0.005?kdRow('Returned value', money(r.erp.returns), 'var(--coral)'):''}
      ${(()=>{ const pr = priorFor(r.rep); if(!pr.length) return '';
        const val = pr.reduce((a,rw)=>a+UMCore.returnValue(rw),0);
        const docs = [...new Set(pr.map(rw=>rw.doc+' → '+rw.ref+' ('+(rw.originKnown?fmtDate(rw.date):'before this month')+')'))].join(', ');
        return kdRow(erpReturnPolicy()==='origin' ? "Returns of earlier invoices — counted in their own month" : "Returns of earlier invoices — deducted here (ERP policy)", money(val), 'var(--gold-ink)')
          + `<div style="font-size:11.5px; color:var(--muted); margin:-4px 0 6px;">${esc(docs)}</div>`; })()}
      ${r.erp.exchanged>0.005?kdRow('🔁 Exchanged (not a return)', money(r.erp.exchanged), 'var(--gold-ink)'):''}
      ${kdRow('Visits logged (deduped)', r.app.visits)}
      ${kdRow('Orders logged in app', r.app.orders + ' (' + money(r.app.logged) + ')')}
      ${kdRow('Visit→invoice linkage', r.linkagePct + '%', r.linkagePct>=50?'var(--sage)':'#FF9500')}
      ${targetBar}
    </div>
    ${(()=>{ // every account (clinic / customer) this rep sold to, from the uploaded file
      const acc = {};
      rows.forEach(rw => {
        if(!UMCore.inRange(rw.date, p.from, p.to)) return; // a prior-invoice return re-dated to its own month leaves this period's table
        if(UMCore.erpRowRep(rw, clinics, erpMap, p.repMap||{}) !== r.rep) return;
        const key = (rw.customer || '').trim() || '(no account name)';
        const a = acc[key] || (acc[key] = { net: 0, docs: new Set() });
        a.net += rw.net; a.docs.add(rw.doc);
      });
      const items = Object.entries(acc).sort((a,b)=>b[1].net-a[1].net);
      if(!items.length) return '';
      const total = items.reduce((s,[,a])=>s+a.net,0);
      return `<div class="card">
        <div style="font-weight:700; font-size:13px; margin-bottom:6px;">🏥 Sales by account (${esc(r.rep)})</div>
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr><th style="text-align:start; padding:4px 6px; color:var(--muted);">Account</th>
            <th style="text-align:end; padding:4px 6px; color:var(--muted);">Invoices</th>
            <th style="text-align:end; padding:4px 6px; color:var(--muted);">Net sales</th></tr>
          ${items.map(([cust, a])=>{
            const m = UMCore.matchCustomer(cust, clinics, erpMap);
            const clinic = m.clinicId ? clinics.find(x=>x.id===m.clinicId) : null;
            const tag = m.channel ? '<span style="color:var(--muted); font-size:11px;"> · 🌐 channel</span>'
              : clinic ? `<span style="color:var(--muted); font-size:11px;"> · ${esc(clinic.name)}</span>` : '';
            return `<tr style="border-top:1px solid var(--line);">
              <td style="padding:5px 6px;">${esc(cust)}${tag}</td>
              <td style="text-align:end; padding:5px 6px;">${a.docs.size}</td>
              <td style="text-align:end; padding:5px 6px; font-weight:700; ${a.net<0?'color:var(--coral-ink);':''}">${a.net.toFixed(2)}</td>
            </tr>`;
          }).join('')}
          <tr style="border-top:2px solid var(--line);">
            <td style="padding:5px 6px; font-weight:700;">Total</td>
            <td></td>
            <td style="text-align:end; padding:5px 6px; font-weight:700;">${total.toFixed(2)}</td>
          </tr>
        </table></div>
      </div>`;
    })()}
    ${(()=>{ // brand targets vs ERP actuals for this rep (from the DSR file)
      const bt = targets[r.rep] && targets[r.rep].brands;
      if(!bt || !Object.keys(bt).length) return '';
      const actual = {};
      rows.forEach(rw => {
        if(UMCore.erpRowRep(rw, clinics, erpMap, p.repMap||{}) !== r.rep) return;
        const b = UMCore.normBrand(rw.brand);
        actual[b] = (actual[b]||0) + rw.net;
      });
      const items = Object.entries(bt).filter(([,t])=>t>0).sort((a,b)=>b[1]-a[1]);
      if(!items.length) return '';
      const ab = targets[r.rep].achievedBrands || {};
      // The DSR's official brand MTD wins only while it is at least as fresh
      // as this sales period; a newer weekly sales upload takes over.
      const hasOfficial = Object.keys(ab).length > 0 &&
        (targets[r.rep].achievedAsOf || '') >= (p.to || '');
      return `<div class="card">
        <div style="font-weight:700; font-size:13px; margin-bottom:6px;">🎯 Brand targets vs achieved (${esc(r.rep)})</div>
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr><th style="text-align:start; padding:4px 6px; color:var(--muted);">Brand</th>
            <th style="text-align:end; padding:4px 6px; color:var(--muted);">Target</th>
            <th style="text-align:end; padding:4px 6px; color:var(--muted);">Invoiced</th>
            ${hasOfficial?'<th style="text-align:end; padding:4px 6px; color:var(--muted);">DSR MTD</th>':''}
            <th style="text-align:end; padding:4px 6px; color:var(--muted);">Ach.</th></tr>
          ${items.map(([brand, tgt])=>{
            const act = Math.round((actual[UMCore.normBrand(brand)]||0)*100)/100;
            const official = ab[brand];
            const achBase = hasOfficial && official != null ? official : act;
            const pct = Math.round(achBase/tgt*100);
            const col = pct>=60?'var(--sage)':pct>=25?'#FF9500':'var(--coral)';
            return `<tr style="border-top:1px solid var(--line);">
              <td style="padding:5px 6px;">${esc(brand)}</td>
              <td style="text-align:end; padding:5px 6px;">${tgt.toFixed(0)}</td>
              <td style="text-align:end; padding:5px 6px;">${act.toFixed(2)}</td>
              ${hasOfficial?`<td style="text-align:end; padding:5px 6px;">${official!=null?official.toFixed(2):'—'}</td>`:''}
              <td style="text-align:end; padding:5px 6px; font-weight:700; color:${col};">${pct}%</td>
            </tr>`;
          }).join('')}
        </table></div>
        <div style="color:var(--muted); font-size:11.5px; margin-top:6px;">Targets & official MTD from the DSR file · invoiced from this ERP period${hasOfficial?' · Ach.% uses the official DSR figure when present':''}. Green ≥60%, orange ≥25%, red below.</div>
      </div>`;
    })()}
    ${r.matched.length?`<div class="card" style="border-inline-start:4px solid var(--sage);">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">✅ Visited AND invoiced</div>
      ${r.matched.map(m=>`<div class="report-line"><span>${esc(m.clinicName)} <span style="color:var(--muted);">(${m.visits} visit${m.visits===1?'':'s'})</span></span><span class="v">${money(m.net)}</span></div>`).join('')}
    </div>`:''}
    ${r.visitedNoInvoice.length?`<div class="card" style="border-inline-start:4px solid #FF9500;">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">🕓 Visited, no invoice yet (pipeline)</div>
      ${r.visitedNoInvoice.map(m=>`<div class="report-line"><span>${esc(m.clinicName)}</span><span class="v">${m.visits} visit${m.visits===1?'':'s'}</span></div>`).join('')}
    </div>`:''}
    ${r.invoicedNoVisit.length?`<div class="card" style="border-inline-start:4px solid var(--coral);">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">⚠️ Invoiced with NO logged visit</div>
      <div style="color:var(--muted); font-size:12px; margin-bottom:6px;">Phone sales, or visits that were never logged — worth asking about.</div>
      ${r.invoicedNoVisit.map(m=>`<div class="report-line"><span>${esc(m.customer)}</span><span class="v">${money(m.net)}</span></div>`).join('')}
    </div>`:''}
    ${(r.app.unknownClinic||r.app.zeroOrders)?`<div class="card">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">🧹 Logging quality</div>
      ${r.app.unknownClinic?kdRow('Visits without a picked clinic', r.app.unknownClinic, '#FF9500'):''}
      ${r.app.zeroOrders?kdRow('Orders saved with 0.00 value', r.app.zeroOrders, '#FF9500'):''}
    </div>`:''}`;
  };
  showModal(`
    <h3 style="margin-top:0;">${I('chart')} ERP reconciliation</h3>
    ${returnPolicyChips(id)}
    <div style="color:var(--muted); font-size:13px; margin-bottom:10px;">${fmtDate(p.from)} – ${fmtDate(p.to)} · ERP invoices vs visits logged in this app</div>
    ${erpAuditSection(p)}
    <div style="height:6px;"></div>
    ${rec.dupRows?`<div class="nudge" style="margin-bottom:10px;">🧹 ${rec.dupRows} duplicate visit row${rec.dupRows===1?'':'s'} detected and ignored in these numbers.</div>`:''}
    ${(()=>{ // week-by-week direction: is each rep speeding up or slowing down?
      const trend = UMCore.erpWeeklyTrend(rows, p.repMap||{});
      if(trend.length < 2) return '';
      const trendReps = [...new Set(trend.flatMap(w=>Object.keys(w.byRep)))].sort();
      const arrow = (cur, prev) => prev==null ? '' :
        cur > prev ? ` <span style="color:var(--sage-ink); font-size:11px;">▲${UMCore.pctDelta(cur, prev)}%</span>` :
        cur < prev ? ` <span style="color:var(--coral-ink); font-size:11px;">▼${Math.abs(UMCore.pctDelta(cur, prev))}%</span>` : '';
      return `<div class="section-title" style="margin-top:0;"><span>${I('chart')} Week by week</span></div>
      <div class="card" style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr><th style="text-align:start; padding:5px 6px; color:var(--muted);">Week</th>
            ${trendReps.map(r=>`<th style="text-align:end; padding:5px 6px; color:var(--muted);">${esc(r)}</th>`).join('')}
            <th style="text-align:end; padding:5px 6px; color:var(--muted);">Total</th></tr>
          ${trend.map((w,i)=>{
            const prev = i>0 ? trend[i-1] : null;
            return `<tr style="border-top:1px solid var(--line);">
              <td style="padding:6px;">${fmtDate(w.from)}–${fmtDate(w.to)}</td>
              ${trendReps.map(r=>`<td style="text-align:end; padding:6px; white-space:nowrap;">${(w.byRep[r]||0).toFixed(2)}${arrow(w.byRep[r]||0, prev?(prev.byRep[r]||0):null)}</td>`).join('')}
              <td style="text-align:end; padding:6px; font-weight:700; white-space:nowrap;">${w.total.toFixed(2)}${arrow(w.total, prev?prev.total:null)}</td>
            </tr>`;
          }).join('')}
        </table>
        <div style="color:var(--muted); font-size:11.5px; margin-top:6px;">KD net per work week (Sun–Thu; Fri–Sat are the weekend — any sale dated then counts in the same week). Arrows compare with the week before.</div>
      </div>`;
    })()}
    ${(()=>{ // team total for this period on the same ERP-verified basis as the per-rep target bars
      if((p.from||'').slice(0,7) !== monthPrefix) return '';
      const tt = teamTargetTotal(rec.perRep.map(r => { const t = targets[r.rep] || {}; return t.revenue > 0 ? { goal: t.revenue, ach: r.erp.net } : null; }));
      return tt.pct != null && tt.n > 1 ? `<div class="section-title">🏁 Team</div><div class="card">
        <div style="font-size:12px; color:var(--muted);">Monthly target — team: ${money(tt.ach)} of ${money(tt.goal)} (ERP-verified, this file)</div>
        ${teamTargetRow(tt, { label: 'Team' })}
        <div style="font-size:11px; color:var(--muted); margin-top:4px;">The Today card blends the official DSR figure with these invoices — its team % can differ slightly.</div>
      </div>` : '';
    })()}
    ${rec.perRep.length?rec.perRep.map(repCard).join(''):'<div class="empty">No rows map to your team — check the salesman mapping when importing.</div>'}
    ${_erpUnmatched.length?`<div class="section-title">🔗 Unrecognized customer names</div>
    <div class="card">
      <div style="color:var(--muted); font-size:12.5px; margin-bottom:8px;">Tell me once who these ERP customers are — I'll remember forever.</div>
      ${_erpUnmatched.map((cust,i)=>`
        <div style="padding:6px 0; ${i?'border-top:1px solid var(--line);':''}">
          <div style="font-size:13px; margin-bottom:4px;">${esc(cust)}</div>
          <select onchange="saveErpCustMap(${i}, this.value, '${esc(p.id)}')" style="width:100%;">
            <option value="">— match to… —</option>
            <option value="@channel">🌐 Online / channel sale (not a clinic)</option>
            <option value="@ignore">🚫 Ignore this customer</option>
            ${erpClinicOptions()}
          </select>
        </div>`).join('')}
    </div>`:''}
    <button class="btn" style="margin-top:12px;" onclick="closeModal()">✅ Done</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="downloadErpReconFile('${esc(p.id)}')">⬇️ Save this report as a file</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="shareErpReconFile('${esc(p.id)}')">${I('share')} Share (WhatsApp / email)</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="openErpImport()">‹ Back to imports</button>
  `);
}

