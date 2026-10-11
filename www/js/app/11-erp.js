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
// A salesman's name comes from the ERP file: it reaches setSalesmanMap through
// data-salesman (and the rep through data-rep), never inside the onclick
// string — an apostrophe would break the tap, a quote with code would run.
function salesmenCard(){
  const map = (erpSales && erpSales.repMapGlobal) || {};
  const names = Object.keys(map).sort();
  if(!names.length) return '';
  return `<div class="section-title">Salesmen in your files</div>
    <p style="color:var(--muted); font-size:12px; margin:-2px 0 8px;">Ignored salesmen are not read at all: their lines are dropped on import and removed from stored files. To bring one back, include them and re-upload the file.</p>
    ${names.map(n => `<div class="card" style="padding:10px 12px; margin-bottom:6px;">
      <div style="font-weight:700; font-size:13px; ${map[n]===null?'color:var(--muted);':''}">${esc(n)}${map[n]===null?' <span style="font-weight:400; font-size:11.5px;">· ignored — not read</span>':''}</div>
      <div class="chip-row" style="margin-top:6px;">${REPS.map(r => `<div class="chip small ${map[n]===r?'on':''}" data-salesman="${esc(n)}" data-rep="${esc(r)}" onclick="setSalesmanMap(this.dataset.salesman, this.dataset.rep)">${esc(r)}</div>`).join('')}<div class="chip small ${map[n]===null?'on':''}" data-salesman="${esc(n)}" onclick="setSalesmanMap(this.dataset.salesman, null)">Ignore</div></div>
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
function erpBrandMtd(rep){ const today = todayStr(); return erpBrandRange(rep, today.slice(0,7)+'-01', today); }
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
  const why = none ? '<div style="font-size:11.5px; color:var(--muted); margin-top:3px;">لم تتغير النسبة: المحقق يُحسب من ملفات مبيعات ERP فقط. ملف DSR يحدّد التارغت (لكل براند ولكل مندوبة وللفريق) ولا يُستخدم كمصدر للمحقق.</div>' : '';
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

// The report's ONLY sales source: the ERP sales files (owner's rule) — never
// the DSR's achieved column, never app-logged orders.
function officialRevenue(rep){
  const bm = bestMonthRevenue(rep);
  if(bm.basis !== 'erp') return { amount: null, src: null, asOf: null, has: false };
  return { amount: bm.amount, src: bm.src, asOf: bm.asOf, has: true, basis: bm.basis };
}
// targets as the coach/insights see them: DSR targets, achieved from ERP only.
function blendedTargets(){
  const out = {};
  Object.keys(targets).filter(k => !k.startsWith('_')).forEach(rep => {
    const t = Object.assign({}, targets[rep]);
    const bm = bestMonthRevenue(rep);
    delete t.achievedBrands;
    if(bm.basis === 'erp'){ t.achieved = bm.amount; t.achievedAsOf = bm.asOf; }
    else { delete t.achieved; delete t.achievedAsOf; }
    out[rep] = t;
  });
  return out;
}
// ERP net per normalized brand for a rep over [from, to] — the only
// "achieved per brand" figure (the DSR gives the brand targets).
function erpBrandRange(rep, from, to){
  const out = {}; let asOf = null;
  erpPeriods().filter(p => p.to >= from && p.from <= to).forEach(p => {
    erpViewRows(p).forEach(r => {
      if(r.date < from || r.date > to) return;
      if(UMCore.erpRowRep(r, clinics, erpMap, p.repMap||{}) !== rep) return;
      const b = UMCore.normBrand(r.brand);
      out[b] = (out[b]||0) + r.net;
      if(!asOf || r.date > asOf) asOf = r.date;
    });
  });
  return { byBrand: out, asOf };
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
    // Achieved = the ERP sales files for that month only (owner's rule); the DSR gives the target.
    const achieved = erpMonth;
    const src = erpMonth != null ? 'ERP' : 'لا يوجد ملف مبيعات لهذا الشهر';
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
    const bt = (r.t && r.t.brands) || {};
    const ab = erpBrandRange(r.rep, m + '-01', monthEndOf(m) < todayStr() ? monthEndOf(m) : todayStr()).byBrand; // achieved per brand = ERP
    const tNorm = new Set(Object.keys(bt).map(n => UMCore.normBrand(n)));
    const names = [...Object.keys(bt), ...Object.keys(ab).filter(n => !tNorm.has(n))].sort((a,b)=>(bt[b]||0)-(bt[a]||0));
    if(!names.length) return '';
    return `<div style="margin-top:6px; overflow-x:auto;"><table style="width:100%; font-size:11.5px; border-collapse:collapse;">
      <tr style="color:var(--muted);"><td style="padding:2px 4px;">البراند</td><td style="text-align:start;">تارغت</td><td style="text-align:start;">محقق (ERP)</td><td style="text-align:start;">%</td></tr>
      ${names.map(n=>{
        const tv = bt[n]||0, av = Math.round((ab[UMCore.normBrand(n)] || 0) * 100) / 100;
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
    ${erpLinksCard()}
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
  if(!UMCore.parseDistribution(sheets, REPS).error && openDistributionPreview(sheets)) return; // a clinic distribution file: preview, saved on tap
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
      // A name once ignored that now matches someone on the team (a supervisor
      // who started selling) is asked about again rather than silently dropped.
      const known = sm => Object.prototype.hasOwnProperty.call(stored, sm) && !(stored[sm] === null && guess[sm]);
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
      ${tg.matched.map(m=>`<div class="report-line"><span>${esc(m.rep)} <span style="color:var(--muted); font-size:11.5px;">(from “${esc(m.name)}”)</span></span><span class="v">${money(m.revenue)}${m.visits?` · ${m.visits} visits`:''}${m.brandCount?` · ${m.brandCount} brand targets`:''}</span></div>`).join('')}
    </div>
    ${tg.unmatched.length?`<div class="nudge" style="margin-top:10px;">Skipped (not on your team): ${tg.unmatched.map(esc).join(', ')}</div>`:''}
    <div style="color:var(--muted); font-size:12.5px; margin-top:10px;">The sales coach and target bars now track these numbers automatically.</div>
    <div style="color:var(--muted); font-size:12.5px; margin-top:4px;">From the DSR file: the targets and their split by brand only. Achieved always comes from the ERP sales files.</div>
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
// A fast, precise "what did the app do with this file?" audit: every salesman
// mapped to a rep, every customer classified (clinic / channel / ignored /
// unmatched / ambiguous branches), with row counts and net — so the supervisor
// can verify the processing at a glance before trusting the numbers.
function erpFileAudit(p){
  const rows = erpViewRows(p);
  const repMap = p.repMap || {};
  // 1) totals
  // every map here is keyed by a name or number from the file: no prototype, so a customer
  // or salesman named "constructor" or "__proto__" is a key like any other
  const t = { rows: rows.length, net: 0, inv: Object.create(null), ret: Object.create(null), retVal: 0 };
  rows.forEach(r=>{ t.net += r.net; (r.type==='return'?t.ret:t.inv)[r.doc]=1; if(isExchangeLine(r)) t.exchVal=(t.exchVal||0)+UMCore.returnValue(r); else t.retVal += UMCore.returnValue(r); });
  t.net = Math.round(t.net*100)/100; t.retVal = Math.round(t.retVal*100)/100;
  // 2) salesman -> rep
  const bySales = Object.create(null);
  rows.forEach(r=>{ const k=(r.salesman||'—').trim()||'—'; const a=bySales[k]||(bySales[k]={name:k, rep:repMap[k]||null, rows:0, net:0}); a.rows++; a.net+=r.net; });
  const salesmen = Object.values(bySales).map(a=>({...a, net:Math.round(a.net*100)/100})).sort((a,b)=>b.net-a.net);
  // 3) customer -> classification
  const byCust = Object.create(null);
  rows.forEach(r=>{
    const k=(r.customer||'').trim()||'(no name)';
    const a=byCust[k]||(byCust[k]={name:k, rep:UMCore.erpRowRep(r, clinics, erpMap, repMap)||null, docs:new Set(), net:0});
    a.docs.add(r.doc); a.net+=r.net;
  });
  const customers = Object.values(byCust).map(a=>{
    const m = UMCore.matchCustomer(a.name, clinics, erpMap);
    let kind, label, clinicName='';
    const closedTag = id => { const c = clinics.find(x=>x.id===id); return c && c.cls==='Closed' ? ' · مغلقة' : ''; };
    if(m.ignored){ kind='ignored'; label='⛔ متجاهَل'; }
    else if(m.channel){ kind='channel'; label='🌐 قناة / أونلاين'; }
    else if(m.ambiguous){ kind='ambiguous'; label='⚠️ ملتبس — عدة فروع'; }
    else if(m.method==='family'){ kind='clinic'; clinicName=m.familyLabel||''; label='✅ <span dir="auto">'+esc(m.familyLabel||'')+'</span> <span style="color:var(--muted); font-size:10.5px;">(موحّد — '+m.branches+' فروع)</span>'+closedTag(m.clinicId); }
    else if(m.clinicId){
      const c=clinics.find(x=>x.id===m.clinicId);
      // a hand link to a clinic that was removed counts at no clinic: each
      // invoice counts for the salesman who issued it (erpRowRep) — say so
      if(!c){ kind='gone'; label='⛔ عيادة محذوفة (يدوي) — تُحسب لمن أصدر الفاتورة'; }
      else { clinicName=c.name; kind='clinic'; label='✅ <span dir="auto">'+esc(clinicName)+'</span>'+(m.method==='fuzzy'?' <span style="color:var(--muted);">(تقريبي)</span>':m.method==='map'?' <span style="color:var(--muted);">(يدوي)</span>':'')+closedTag(c.id); }
    }
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
    <td style="padding:5px 6px; overflow-wrap:anywhere;">${esc(s.name)}</td>
    <td style="padding:5px 6px;">${s.rep?esc(s.rep):'<span style="color:var(--coral-ink);">— خارج الفريق —</span>'}</td>
    <td style="text-align:end; padding:5px 6px;">${s.rows}</td>
    <td style="text-align:end; padding:5px 6px; font-weight:700;">${money(s.net)}</td></tr>`).join('');
  const attn = x => x.kind==='none' || x.kind==='ambiguous' || x.kind==='gone';
  const needAttn = a.customers.filter(attn);
  const custRows = a.customers.map(x=>{
    const bg = attn(x) ? 'background:var(--amber-dim);' : '';
    // every named account can be moved from here: the editor shows what moves before anything is saved
    const change = x.name !== '(no name)' ? `<div><button class="chip small" style="padding:3px 8px; font-size:11px; margin-top:3px;" data-erp-link="${esc(x.name)}" onclick="openErpLinkEdit(this.dataset.erpLink,'recon:${esc(p.id)}')">${I('pencil')} تغيير</button></div>` : '';
    return `<tr style="border-top:1px solid var(--line); ${bg}">
      <td style="padding:5px 6px; overflow-wrap:anywhere;"><span dir="auto">${esc(x.name)}</span></td>
      <td style="padding:5px 6px; font-size:11.5px;">${x.label}${change}</td>
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
    <div class="report-line"><span>تصنيف العملاء</span><span class="v" style="font-size:12px;">✅ ${c.clinic||0} · 🌐 ${c.channel||0} · ⛔ ${c.ignored||0} · ⚠️ ${(c.none||0)+(c.ambiguous||0)+(c.gone||0)}</span></div>
  </div>
  ${needAttn.length?`<div class="nudge" style="margin-bottom:10px; border-color:#FF9500;">⚠️ ${needAttn.length} عميل يحتاج ربطاً يدوياً (بالأصفر أدناه) — لن تُحسب مبيعاتهم لأي عيادة حتى تربطهم.</div>`:'<div class="nudge" style="margin-bottom:10px;">✅ كل العملاء مصنّفون — لا شيء معلّق.</div>'}
  <div class="section-title">👥 ربط البائعين بالمندوبات</div>
  <div class="card" style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
    <tr><th style="text-align:start; padding:4px 6px; color:var(--muted);">البائع في الملف</th><th style="text-align:start; padding:4px 6px; color:var(--muted);">المندوبة</th><th style="text-align:end; padding:4px 6px; color:var(--muted);">سطور</th><th style="text-align:end; padding:4px 6px; color:var(--muted);">صافي</th></tr>
    ${salesmanRows}
  </table></div>
  <div class="mr-note" style="color:var(--muted); font-size:11.5px; margin:6px 2px;">ملاحظة: مبيعات أي عيادة مطابَقة تُنسب لِـ<b>المندوبة المالكة للعيادة</b>، بغض النظر عن اسم البائع في الملف. الجدول أعلاه يبيّن ربط الأسماء كما في الملف فقط.</div>
  <div class="section-title"><span>🏥 تصنيف كل عميل (مصدر المطابقة)</span> <span class="link" onclick="openErpLinks({back:'recon:${esc(p.id)}'})">كل الحسابات</span></div>
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
`;
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
      const acc = Object.create(null); // keyed by customer names: no prototype
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
              <td style="padding:5px 6px; overflow-wrap:anywhere;">${esc(cust)}${tag}</td>
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
      const actual = Object.create(null);
      rows.forEach(rw => {
        if(UMCore.erpRowRep(rw, clinics, erpMap, p.repMap||{}) !== r.rep) return;
        const b = UMCore.normBrand(rw.brand);
        actual[b] = (actual[b]||0) + rw.net;
      });
      const items = Object.entries(bt).filter(([,t])=>t>0).sort((a,b)=>b[1]-a[1]);
      if(!items.length) return '';
      const ab = {}, hasOfficial = false; // achieved = ERP only (owner's rule); the DSR gives the brand targets
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
        <div style="color:var(--muted); font-size:11.5px; margin-top:6px;">Targets from the DSR file · achieved = invoiced in this ERP period. Green ≥60%, orange ≥25%, red below.</div>
      </div>`;
    })()}
    ${r.matched.length?`<div class="card" style="border-inline-start:4px solid var(--sage);">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">✅ Visited AND invoiced</div>
      ${r.matched.map(m=>`<div class="report-line"><span style="overflow-wrap:anywhere; min-width:0;">${esc(m.clinicName)} <span style="color:var(--muted);">(${m.visits} visit${m.visits===1?'':'s'})</span></span><span class="v">${money(m.net)}</span></div>`).join('')}
    </div>`:''}
    ${r.visitedNoInvoice.length?`<div class="card" style="border-inline-start:4px solid #FF9500;">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">🕓 Visited, no invoice yet (pipeline)</div>
      ${r.visitedNoInvoice.map(m=>`<div class="report-line"><span style="overflow-wrap:anywhere; min-width:0;">${esc(m.clinicName)}</span><span class="v">${m.visits} visit${m.visits===1?'':'s'}</span></div>`).join('')}
    </div>`:''}
    ${r.invoicedNoVisit.length?`<div class="card" style="border-inline-start:4px solid var(--coral);">
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">⚠️ Invoiced with NO logged visit</div>
      <div style="color:var(--muted); font-size:12px; margin-bottom:6px;">Phone sales, or visits that were never logged — worth asking about.</div>
      ${r.invoicedNoVisit.map(m=>`<div class="report-line"><span style="overflow-wrap:anywhere; min-width:0;">${esc(m.customer)}</span><span class="v">${money(m.net)}</span></div>`).join('')}
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
    ${_erpUnmatched.length?(()=>{
      // a line with no customer name is never an account: it cannot be linked, so it gets a line of explanation, never a button
      const blank = c => { const t = String(c == null ? '' : c).trim(); return !t || t === '(no name)'; };
      const named = _erpUnmatched.filter(c => !blank(c));
      const nl = _erpUnmatched.some(blank) ? rows.filter(r => UMCore.inRange(r.date, p.from, p.to) && blank(r.customer)) : [];
      return `<div class="section-title">🔗 Unrecognized customer names</div>
    <div class="card">
      ${named.length ? `<div style="color:var(--muted); font-size:12.5px; margin-bottom:8px;">Tell me once who these ERP customers are — I'll remember forever.</div>` : ''}
      ${named.map((cust,i)=>`
        <div class="row-between" style="gap:8px; padding:6px 0; align-items:center; ${i?'border-top:1px solid var(--line);':''}">
          <div dir="auto" style="flex:1; min-width:0; font-size:13px; overflow-wrap:anywhere;">${esc(cust)}</div>
          <button class="chip small" style="flex-shrink:0;" data-erp-link="${esc(cust)}" onclick="openErpLinkEdit(this.dataset.erpLink,'recon:${esc(p.id)}')">Link…</button>
        </div>`).join('')}
      ${nl.length ? `<div id="erpUnrNameless" style="color:var(--muted); font-size:12px; line-height:1.55; padding:6px 0 0; ${named.length?'border-top:1px solid var(--line);':''}"><span>Lines with no customer name cannot be linked — each counts for the salesman who issued it:</span> ${nl.length} · <span dir="ltr">${money(nl.reduce((t, r) => t + (Number(r.net) || 0), 0))}</span></div>` : ''}
    </div>`; })():''}
    <button class="btn" style="margin-top:12px;" onclick="closeModal()">✅ Done</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="downloadErpReconFile('${esc(p.id)}')">⬇️ Save this report as a file</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="shareErpReconFile('${esc(p.id)}')">${I('share')} Share (WhatsApp / email)</button>
    <button class="btn secondary" style="margin-top:8px;" onclick="openErpImport()">‹ Back to imports</button>
  `);
}

// ---- ERP ACCOUNT LINKS (v113): which branch an account's invoices count at ----
// erpMap holds the links set by hand — { ERP customer name: clinicId |
// '@channel' | '@ignore' } — and every other name is matched automatically
// (UMCore.matchCustomer). A link chosen by mistake (the owner's case: a new
// Aline branch that was not in the app yet, linked to another branch) is
// changed here: the account list (openErpLinks), the editor (openErpLinkEdit)
// and its check-before-saving page (openErpLinkPreview), reached from the
// clinic card, the reconciliation audit, "Unrecognized customer names" and the
// import screen (supervisor only). Every figure comes from UMCore.erpAccounts /
// erpLinkPreview / monthAchievement — the code paths of every other screen. A
// save changes ONE account with a compare-and-set in the cloud (saveErpLink),
// never persist('erpMap'), which would overwrite the whole map; memory and the
// device copy change only once the cloud has confirmed.
// A save reads a snapshot of its page taken when Save was tapped, never _el:
// the person may leave the page while the cloud answers. Every editor sheet is
// stamped with its own number (elStamp); a save that finishes — in time or
// late — redraws only its own page while that page is still on screen, and
// otherwise just says what happened in a toast (the Undo waits in the list).
let ERP_LINK_WRITE_MS = 12000;   // a let, so a harness can shorten it
let _el = null;                  // the account being edited (see elInit)
let _elPv = null;                // its check-before-saving figures, as last shown
let _elUndo = null;              // the last confirmed change, for Undo
let _elUndoSeq = 0;
let _elBusy = false;             // a Save (new branch, then link) or an Undo is running
// Links this device asked for whose write the app stopped waiting for (a
// timeout): if the cloud later holds one of them, a refused save says "your
// earlier change landed meanwhile", never "changed on another device".
const _elOwnLate = Object.create(null);   // name → [values]
function elOwnLateAdd(name, v){ const a = _elOwnLate[name] || (_elOwnLate[name] = []); if(a.indexOf(v) < 0) a.push(v); if(a.length > 6) a.shift(); }
function elOwnLateHas(name, v){ return !!(_elOwnLate[name] && _elOwnLate[name].indexOf(v) >= 0); }
let _elStep = null;              // 'list' | 'edit' | 'preview' — the editor sheet last drawn
let _elSheet = 0;                // the stamp of that sheet (elOnScreen)
let _elSheetSeq = 0;
let _elListOpts = { filter: 'all', q: '' };
let _elAll = null;               // UMCore.erpAccounts() behind the open list
let _elDraftTimer = null;
let _elLogChain = Promise.resolve();
const EL_CLS = ['A', 'B', 'C', 'D', 'F'];
// The sentences that say what a link does — exactly what the engine does today.
const EL_TXT = {
  none: 'Matches no clinic — each invoice counts for the salesman who issued it, and the account goes back to "Unrecognized customer names".',
  noneOut: 'Matches no clinic — it was invoiced by salesmen outside the team, so it counts for nobody on the team; it shows as "not linked".',
  noneNow: 'Matches no clinic — each invoice counts for the salesman who issued it.',
  ambiguous: 'Several branches match — each invoice counts for the salesman who issued it until you choose one.',
  gone: 'Linked to a clinic that was removed — each invoice counts for the salesman who issued it.',
  ignore: "Ignored: it leaves the clinic lists, product movement and the weekly deck's week figures, but its invoices still count in the month's sales for the salesman who issued them.",
  channel: 'Online / channel: each invoice counts for the salesman who issued it, and it leaves the clinic lists and the discount check.',
  internal: 'A company-internal account (marketing / advertisement) is never counted on a clinic.',
  channelName: 'An online / channel account is never counted on a clinic.',
  handLine: 'A hand link shows as its own line in "Who bought", not inside the branch group.',
  notSaved: 'Not saved — nothing changed. Check the connection and tap Save again.',
  conflict: "This account's link was changed on another device — nothing was saved. Open it again to see where it counts now.",
  conflictAfterBranch: "The new branch was added, but this account's link was changed on another device meanwhile — the link was not saved. Open it again to see where it counts now.",
  conflictOwn: "Your earlier change to this account reached the cloud meanwhile — nothing else was saved. Open it again to see where it counts now.",
  conflictOwnAfterBranch: "The new branch was added, and your earlier change to this account reached the cloud meanwhile — the link was not saved again. Open it again to see where it counts now.",
  stale: 'Where this account counts changed since this page opened — nothing was saved. Open it again to see where it counts now.',
  timeout: 'No confirmation from the cloud yet — the screen still shows the old link. If the save lands later, the figures update and a message appears.',
  notLoaded: 'Account links were not loaded from the cloud on this device — changes are paused. Reopen the app with a connection.',
  rows: 'Some sales files did not load on this device — the figures here would be short, so changes are paused.',
  busy: 'A sales-file save is in progress or not confirmed yet — changes are paused. Tap the red bar first.',
  noClinic: 'That clinic is not in the list any more.',
  closedTarget: 'That clinic is closed — choose an open branch.',
  clinicsPending: 'Clinic changes made on this device are still uploading — link to a clinic once they are in the cloud.',
  same: 'This is already where it counts.',
  changed: 'The figures changed since this page opened — check them and tap Save again.',
  noCheck: 'The check could not be made — nothing can be saved from here.',
  undoGone: 'This change can no longer be undone from here — open the account to change it again.',
  saving: 'A save is still on its way — tap again in a moment.',
  stillTakes: "The branch matches this account's name, so it still takes it — remove the branch from its clinic card to go back.",
};
// One status vocabulary for the list, the editor and the clinic card.
const EL_STATUS = {
  hand: ['by hand', 'var(--green-dim)', 'var(--green-dark)'],
  gone: ['removed clinic', 'var(--coral-dim)', 'var(--coral-ink)'],
  name: ['by name', 'var(--sage-dim)', 'var(--sage-ink)'],
  family: ['branch group', 'var(--sage-dim)', 'var(--sage-ink)'],
  channel: ['online / channel', '#EEEDE7', 'var(--muted)'],
  ignored: ['ignored', '#EEEDE7', 'var(--muted)'],
  ambiguous: ['several branches match', 'var(--amber-dim)', 'var(--amber-ink)'],
  none: ['not linked', 'var(--amber-dim)', 'var(--amber-ink)'],
};
function erpLinkBadge(x){
  const s = EL_STATUS[x && x.status] || EL_STATUS.none;
  return `<span class="badge" style="background:${s[1]}; color:${s[2]};">${s[0]}</span>`
    + (x && x.closed ? ` <span class="badge" style="background:#EEEDE7; color:var(--coral-ink);">closed clinic</span>` : '');
}
const elClosedBadge = () => `<span class="badge" style="background:var(--amber-dim); color:var(--amber-ink);">closed month</span>`;
function erpLinkClinic(id){ return id ? clinics.find(c => c.id === id) || null : null; }
// The clinic an account (or a before/after side of a change) counts at, '' when none.
function erpLinkWhere(x, extra){
  if(!x) return '';
  if(x.status === 'gone'){ // the removed clinic's name while the recycle bin still has it; the badge says the rest
    const id = x.link != null ? x.link : x.value, b = (((recycleBin || {}).clinics) || []).find(c => c && c.id === id);
    return b ? b.name || '' : '';
  }
  const c = erpLinkClinic(x.clinicId) || (extra && x.clinicId && extra.id === x.clinicId ? extra : null);
  return c ? c.name : '';
}
function elSideHtml(x, extra){
  const where = erpLinkWhere(x, extra);
  return `${where ? `<b dir="auto" style="overflow-wrap:anywhere;">${esc(where)}</b> ` : ''}${erpLinkBadge(x)}`;
}
// Where an account counts RIGHT NOW, from memory as it is — never from a page's
// earlier figures: erpLinkPreview's "before" side (a SAME change reads no line).
function erpLinkSideNow(name){
  name = String(name == null ? '' : name).trim();
  const v = Object.prototype.hasOwnProperty.call(erpMap, name) ? erpMap[name] : null;
  try{ return UMCore.erpLinkPreview(digestData(), { name, to: v }).before; }catch(e){ console.warn('where an account counts', e); return null; }
}
// "Where it counts" as a phrase: at a clinic (its name and how), or the badge
// and what having no clinic means. mode 'now' (after a change), 'again' (the
// state it had before the change being undone), 'current' (said after a
// failure: where it counts at this moment).
const EL_WHERE = { now: ['now counts at', 'is now'], again: ['counts again at', 'is back to'], current: ['Right now it counts at', 'Right now it is'] };
function elWhereHtml(side, mode){
  if(!side) return '';
  const w = EL_WHERE[mode] || EL_WHERE.now;
  if(side.status !== 'gone' && erpLinkClinic(side.clinicId)) return `<span>${w[0]}</span> ${elSideHtml(side)}`;
  const why = { none: EL_TXT.noneNow, ambiguous: EL_TXT.ambiguous, gone: EL_TXT.gone, channel: EL_TXT.channel, ignored: EL_TXT.ignore }[side.status] || '';
  return `<span>${w[1]}</span> ${elSideHtml(side)}${why ? ` <span>${why}</span>` : ''}`;
}
// The same in plain text, for a toast: "Clinic (by hand)" or "not linked".
function elWhereText(side){
  const s = EL_STATUS[side && side.status] || EL_STATUS.none, where = erpLinkWhere(side);
  return where ? `${where} (${s[0]})` : s[0];
}
// "Matches no clinic": the account goes back to "Unrecognized customer names"
// only when some of its invoices count for a team member — that list shows
// nothing else (UMCore.reconcileErp).
function elNoneText(people){
  const list = (people || []).filter(p => Math.abs(p.net) >= 0.0005);
  if(!list.length) return EL_TXT.noneNow;
  return list.some(p => p.rep) ? EL_TXT.none : EL_TXT.noneOut;
}
function elWho(rep){ return rep ? `<b dir="auto" style="overflow-wrap:anywhere;">${esc(rep)}</b>` : `<b><span>outside the team</span></b>`; }
function erpLinkPeople(people){
  const list = (people || []).filter(p => Math.abs(p.net) >= 0.0005);
  return list.length ? list.map(p => `${elWho(p.rep)} <span dir="ltr" style="color:var(--muted);">${money(p.net)}</span>`).join(' · ') : '—';
}
function erpAccountsNow(){ return UMCore.erpAccounts(digestData()); }
const elNeedsLink = a => a.status === 'gone' || a.status === 'ambiguous' || a.status === 'none';
const elRowsMissing = () => erpPeriods().some(p => p && p.rowsMissing);
// Every editor sheet carries data-el-sheet="<n>" on its title. Work that ends
// later (a save, a late landing, a retry) redraws a sheet only while that very
// sheet is still the one on screen — closed, or replaced by any other sheet,
// it is left alone.
function elStamp(step){ _elStep = step; return (_elSheet = ++_elSheetSeq); }
function elOnScreen(tok){
  const back = document.getElementById('modalBack');
  return !!(tok && back && back.classList.contains('show') && document.querySelector('#modalInner [data-el-sheet="' + tok + '"]'));
}
// Changes wait while the figures behind them are not the team's real ones.
function erpLinksPaused(){
  if(_loadFailed.erpMap || _mirrorUsed.erpMap) return 'notLoaded';
  if(elRowsMissing()) return 'rows';
  if(_erpImporting || _erpSaving || _erpDirty) return 'busy';
  return null;
}
function erpLinksPauseCard(){
  const k = erpLinksPaused(); if(!k) return '';
  return `<div class="card" id="elPaused" role="alert" style="border-inline-start:4px solid var(--coral); background:var(--coral-dim); color:var(--coral-ink); margin-bottom:10px; padding:10px 12px; font-size:12.5px; line-height:1.5; font-weight:600;">⚠️ <span>${EL_TXT[k]}</span>
    ${k === 'rows' ? `<div class="chip-row" style="margin-top:8px;"><button class="chip small on" onclick="elRetryRows()">🔄 <span>Load them again</span></button></div>` : ''}</div>`;
}
function elRetryRows(){
  const tok = _elSheet, step = _elStep, el = _el;
  retryErpRows().then(() => {
    if(!elOnScreen(tok)) return; // the person moved on: nothing is redrawn under them
    if(step === 'preview' && el && el === _el) openErpLinkPreview();
    else if(step === 'edit' && el && el === _el) openErpLinkEdit(el.name, el.back, el);
    else if(step === 'list') openErpLinks(_elListOpts);
  }).catch(e => console.warn('retry sales rows', e));
}
// The import screen's way in: how many accounts, how many need a link.
function erpLinksCard(){
  let res; try{ res = erpAccountsNow(); }catch(e){ console.error('ERP account links card', e); return ''; }
  const hand = Object.keys(erpMap).filter(k => k.trim() && k.trim() !== '(no name)').length;
  if(!res.accounts.length && !hand) return '';
  const need = res.accounts.filter(elNeedsLink).length;
  return `<div class="card clickable" id="erpLinksCard" onclick="openErpLinks({back:'import'})" style="padding:12px 14px; margin:14px 0 8px; ${need ? 'border-inline-start:4px solid var(--amber);' : ''}">
    <div class="row-between" style="gap:8px;"><div style="flex:1; min-width:0;">
      <div style="font-weight:700; font-size:13.5px;">${I('building')} <span>ERP account links</span></div>
      <div class="clinic-sub">${res.accounts.length} <span>accounts in your files</span> · ${need} <span>need a link</span> · ${hand} <span>linked by hand</span></div>
    </div><span style="color:var(--muted); flex-shrink:0;">›</span></div></div>`;
}

// ---- the account list ----
// opts = { filter: 'all'|'need'|'hand'|'notclinic', q: the search, pickFor:
// clinicId (count an account at that clinic), back: where "‹ Back" and a save
// return to }. The search and the filter stay across ‹ Back, Save and
// ‹ Pick another (they live in _elListOpts). `noteFollows`: a note with its
// own Undo is pinned right after, so the "last change" card is not drawn.
const EL_FILTERS = {
  all: () => true,
  need: elNeedsLink,
  hand: a => a.byHand,
  notclinic: a => a.status === 'channel' || a.status === 'ignored',
};
function openErpLinks(opts, noteFollows){
  if(!requireAdmin()) return;
  _elListOpts = Object.assign({ filter: 'all', q: '' }, opts || {});
  _el = null;
  try{ _elAll = erpAccountsNow(); }catch(e){ console.error('ERP account list', e); showToast('⚠️ ' + EL_TXT.noCheck); return; }
  const tok = elStamp('list');
  const pick = _elListOpts.pickFor ? erpLinkClinic(_elListOpts.pickFor) : null;
  showModal(`
    <h3 style="margin-top:0;" data-el-sheet="${tok}">${I('building')} <span>${pick ? 'Count another ERP account here…' : 'ERP account links'}</span></h3>
    ${pick ? `<div style="margin:-6px 0 8px; font-size:13.5px;"><b dir="auto" style="overflow-wrap:anywhere;">${esc(pick.name)}</b></div>` : ''}
    <p style="color:var(--muted); font-size:12.5px; margin-top:-2px; line-height:1.5;">Every customer account in your sales files and the branch its invoices count at. Wrong branch? Tap it — you see what moves before anything is saved.</p>
    ${erpLinksPauseCard()}
    ${pick || noteFollows ? '' : elLastChangeCard()}
    <input type="text" id="elSearch" dir="auto" placeholder="Search accounts or clinics…" value="${esc(_elListOpts.q || '')}" oninput="elSearchInput(this.value)" autocomplete="off">
    <div class="chip-row" id="elFilters" style="margin:8px 0 10px;"></div>
    <div id="elList"></div>
    <div id="elFoot" style="color:var(--muted); font-size:11.5px; line-height:1.6; margin-top:6px;"></div>
    <button class="btn secondary" onclick="elReturn()">‹ Back</button>`);
  renderErpLinks();
}
// The last confirmed change, with its Undo, while the account still counts as
// that change left it: a save that finished while another sheet was open is
// undone from here (its toast says so).
function elLastChangeCard(){
  const u = _elUndo; if(!u) return '';
  const cur = Object.prototype.hasOwnProperty.call(erpMap, u.name) ? erpMap[u.name] : null;
  if(cur !== (u.now == null ? null : u.now)) return '';
  return `<div class="card" id="elLastChange" style="border-inline-start:4px solid var(--sage, #9ED0AF); padding:10px 12px; margin-bottom:10px; font-size:12.5px; line-height:1.6;">
    <span>Last change:</span> <b dir="auto" style="overflow-wrap:anywhere;">${esc(u.name)}</b> ${elWhereHtml(erpLinkSideNow(u.name), 'now')} ${elUndoBtn(u)}</div>`;
}
function elSearchInput(v){ _elListOpts.q = String(v == null ? '' : v); renderErpLinks(); }
function elSetFilter(f){ _elListOpts.filter = EL_FILTERS[f] ? f : 'all'; renderErpLinks(); }
function elListCard(a){
  const pick = _elListOpts.pickFor;
  const where = erpLinkWhere(a), ink = elNeedsLink(a) ? (a.status === 'gone' ? 'var(--coral)' : 'var(--amber)') : a.byHand ? 'var(--gold)' : 'var(--line)';
  const noInv = _elAll && _elAll.rowsMissing ? 'no invoice in the files loaded on this device' : 'no invoice in the saved files';
  return `<div class="card clickable" data-erp-link="${esc(a.name)}"${pick ? ` data-to="${esc(pick)}"` : ''}
      onclick="${pick ? 'openErpLinkPreviewFor(this.dataset.erpLink, this.dataset.to)' : "openErpLinkEdit(this.dataset.erpLink, 'links')"}"
      style="padding:10px 12px; margin-bottom:6px; border-inline-start:4px solid ${ink};">
    <div dir="auto" style="font-weight:700; font-size:13px; overflow-wrap:anywhere;">${esc(a.name)}</div>
    <div style="font-size:12px; margin-top:3px; display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center;">${where ? `<b dir="auto" style="overflow-wrap:anywhere;">${esc(where)}</b>` : ''}${erpLinkBadge(a)}</div>
    <div class="clinic-sub">${a.stale ? `<span>${noInv}</span>` : `${a.invoices} × · <span dir="ltr">${money(a.net)}</span>${a.last ? ` · <span>last invoice</span> ${fmtDate(a.last)}` : ''}`}</div>
  </div>`;
}
function renderErpLinks(){
  const el = document.getElementById('elList'); if(!el || !_elAll) return;
  const q = String(_elListOpts.q || '').trim().toLowerCase();
  const pickFor = _elListOpts.pickFor || null;
  const accs = _elAll.accounts.filter(a => !(pickFor && a.clinicId === pickFor)); // "count another account here": not the ones already here
  const f = EL_FILTERS[_elListOpts.filter] ? _elListOpts.filter : 'all';
  const fil = document.getElementById('elFilters');
  if(fil) fil.innerHTML = [['all', 'All'], ['need', 'Need a link'], ['hand', 'By hand'], ['notclinic', 'Not a clinic']].map(([k, label]) =>
    `<div class="chip small ${f === k ? 'on' : ''}" onclick="elSetFilter('${k}')"><span>${label}</span> (${accs.filter(EL_FILTERS[k]).length})</div>`).join('');
  const hit = a => !q || a.name.toLowerCase().includes(q) || erpLinkWhere(a).toLowerCase().includes(q);
  let list = accs.filter(EL_FILTERS[f]).filter(hit), html = '';
  if(pickFor && !q){
    // the accounts that look like this clinic (same first distinctive name word) first
    const c = erpLinkClinic(pickFor), word = c ? (UMCore.normClinicName(c.name).split(' ')[0] || '') : '';
    const like = word.length >= 4 ? list.filter(a => !a.internal && !a.channelName && (UMCore.normClinicName(a.name).split(' ')[0] || '') === word).slice(0, 5) : [];
    if(like.length){
      html += `<div class="section-title" style="margin-top:4px;">Looks like this clinic</div>${like.map(elListCard).join('')}<div class="section-title">All accounts</div>`;
      list = list.filter(a => !like.includes(a));
    }
  }
  html += list.slice(0, 40).map(elListCard).join('') || `<div style="color:var(--muted); font-size:13px; text-align:center; padding:14px;">Nothing matches.</div>`;
  if(list.length > 40) html += `<div style="color:var(--muted); font-size:12px; text-align:center; padding:6px;">Showing 40 of ${list.length} — search to find the others</div>`;
  // links whose name no loaded file carries: they apply to future uploads — or, while a file is missing here, may be in it
  const stale = pickFor ? [] : (_elAll.stale || []).filter(s => (f === 'all' || f === 'hand') && (!q || s.name.toLowerCase().includes(q)));
  if(stale.length) html += `<details style="margin-top:10px;"><summary style="cursor:pointer; font-size:12.5px; font-weight:700; padding:4px 2px;"><span>${_elAll.rowsMissing ? 'Links with no invoice in the files loaded on this device' : 'Links with no invoice in the saved files'}</span> (${stale.length})</summary>
    ${stale.map(s => elListCard({ name: s.name, link: s.link, byHand: true, status: s.status, clinicId: s.status === 'hand' ? s.link : null, stale: true })).join('')}</details>`;
  el.innerHTML = html;
  const foot = document.getElementById('elFoot');
  if(foot){
    const all = _elAll.accounts, inv = all.reduce((s, a) => s + a.invoices, 0), kd = all.reduce((s, a) => s + a.net, 0);
    foot.innerHTML = `<div><span>Accounts:</span> ${all.length} · <span>invoices:</span> ${inv} · <span dir="ltr">${money(kd)}</span> · <span>saved files:</span> ${_elAll.files}</div>`
      + (_elAll.nameless.lines ? `<div>+ ${_elAll.nameless.lines} <span>lines with no customer name (not linkable)</span> · <span dir="ltr">${money(_elAll.nameless.net)}</span></div>` : '')
      + (_elAll.rowsMissing ? `<div style="color:var(--amber-ink); font-weight:600;">⚠️ ${_elAll.rowsMissing} <span>sales files did not load on this device — their invoices are not counted here.</span> <span class="link" style="color:var(--teal); cursor:pointer;" onclick="elRetryRows()">🔄 <span>Load them again</span></span></div>` : '');
  }
}

// ---- the editor, step 1: where should this account's invoices count? ----
// The state of one edit. `shownOld` is the link the screen showed (null = no
// link): the save is refused if the cloud holds anything else by then. `flow`
// is shared by every attempt of this edit (a retry, ‹ Pick another): a change
// confirmed once is told once, whichever attempt lands first.
function elInit(name, back, keep){
  name = String(name == null ? '' : name).trim();
  if(!name || name === '(no name)') return false;   // a nameless line is never an account
  const d = digestData();
  const shownOld = Object.prototype.hasOwnProperty.call(erpMap, name) ? erpMap[name] : null;
  let acc = UMCore.erpAccounts(d).accounts.find(a => a.name === name);
  // Neither an account of the loaded files nor a stored link: not a name any
  // screen drew, but one changed on its way here — nothing is opened, so
  // nothing can be saved under a key that is not the account's.
  if(!acc && shownOld === null) return false;
  if(!acc){ // a link no saved file carries (it applies to future uploads): where it counts, no figures
    const b = UMCore.erpLinkPreview(d, { name, to: shownOld }).before || { status: 'none', clinicId: null, closed: false };
    acc = { name, link: shownOld, byHand: shownOld !== null, status: b.status, clinicId: b.clinicId, closed: b.closed, familyLabel: b.familyLabel, branches: b.branches, candidates: b.candidates,
      lines: 0, invoices: 0, returns: 0, net: 0, first: null, last: null, monthNet: 0, people: [], internal: UMCore.isInternalAccount(name), channelName: UMCore.isErpChannel(name), variants: [] };
  }
  const k = keep && keep.name === name ? keep : null; // "‹ Pick another" keeps a new branch already made
  _el = { name, back: back || 'links', shownOld, acc, to: undefined, addClinic: null, pickList: false,
    newId: k ? k.newId : null, newDraft: k ? k.newDraft : null, clinicSaved: !!(k && k.clinicSaved), branch: k ? k.branch : null,
    branchPv: k ? k.branchPv : null, flow: k && k.flow ? k.flow : {} };
  return true;
}
function erpAccountLines(name){ // one row per document: what "Show the invoices" lists
  const docs = {};
  erpPeriods().forEach(p => { if(p && !p.rowsMissing) erpViewRows(p).forEach(r => {
    if((r.customer || '').trim() !== name) return;
    const k = r.doc + '|' + r.type;
    const d = docs[k] || (docs[k] = { doc: r.doc, date: r.date, net: 0, salesman: r.salesman, type: r.type });
    d.net += Number(r.net) || 0; if((r.date || '') > (d.date || '')) d.date = r.date;
  }); });
  return Object.values(docs).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.doc).localeCompare(String(a.doc)));
}
function elInvoicesBlock(name){
  const docs = erpAccountLines(name);
  if(!docs.length) return '';
  return `<details style="margin:0 0 10px;"><summary style="cursor:pointer; font-size:12.5px; font-weight:700; padding:4px 2px;"><span>Show the invoices</span> (${docs.length})</summary>
    <div style="padding:2px 4px 4px;">${docs.slice(0, 60).map(d => `<div style="display:flex; flex-wrap:wrap; gap:2px 10px; padding:4px 0; border-top:1px dashed var(--line); font-size:12px;">
      <b dir="auto" style="overflow-wrap:anywhere;">${esc(d.doc || '—')}</b><span>${fmtDate(d.date)}</span><span dir="ltr" style="font-weight:700; ${d.net < 0 ? 'color:var(--coral-ink);' : ''}">${d.type === 'return' ? '↩ ' : ''}${money(d.net)}</span><span dir="auto" style="color:var(--muted); overflow-wrap:anywhere;">${esc(d.salesman || '')}</span></div>`).join('')}
    ${docs.length > 60 ? `<div style="color:var(--muted); font-size:11.5px; padding-top:4px;">The 60 newest are shown.</div>` : ''}</div></details>`;
}
// What an account with no line here says: no invoice in the saved files (the link applies to future uploads),
// or — while a file did not load on this device — only that none is in the files loaded here.
const elNoLinesText = () => elRowsMissing() ? 'No invoice in the files loaded on this device.' : 'No invoice in the saved files — the link applies to future uploads.';
function elTargetCard(c, acc){
  if(!c) return '';
  const here = !!(acc && acc.clinicId === c.id && acc.status !== 'gone');
  const rep = c.rep ? `<span dir="auto">${esc(c.rep)}</span>` : `<span style="color:var(--coral-ink); font-weight:700;">unassigned</span>`;
  return `<div class="card${here ? '' : ' clickable'}" ${here ? `data-current="${esc(c.id)}"` : `data-target="${esc(c.id)}" onclick="elChoose(this.dataset.target)"`}
      style="padding:10px 12px; margin-bottom:6px; ${here ? 'border-inline-start:4px solid var(--gold);' : ''}">
    <div class="row-between" style="gap:8px; align-items:flex-start;"><div style="flex:1; min-width:0;">
      <div dir="auto" style="font-weight:700; font-size:13.5px; overflow-wrap:anywhere;">${esc(c.name)}</div>
      <div class="clinic-sub">${rep} · ${c.cls === 'Closed' ? '<span>closed clinic</span>' : `<span>Class</span> ${esc(c.cls || '—')}`}${c.shared ? ' · <span>shared account</span>' : ''}</div>
    </div>${here ? `<span class="badge" style="background:var(--gold); color:#022917; flex-shrink:0;">counted here now</span>` : ''}</div></div>`;
}
function elChoiceCard(target, title, sub){
  return `<div class="card clickable" data-target="${target}" onclick="elChoose(this.dataset.target)" style="padding:10px 12px; margin-bottom:6px;">
    <div style="font-weight:700; font-size:13.5px;"><span>${title}</span></div>
    <div class="clinic-sub" style="line-height:1.5; display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center;">${sub}</div></div>`;
}
function openErpLinkEdit(name, back, keep){
  if(!requireAdmin()) return;
  let ok = false;
  try{ ok = elInit(name, back, keep); }catch(e){ console.error('ERP account editor', e); }
  if(!ok){ showToast('⚠️ ' + EL_TXT.noCheck); return; }
  const tok = elStamp('edit');
  const acc = _el.acc, notClinic = acc.internal || acc.channelName;
  const where = erpLinkWhere(acc);
  const now = acc.status === 'gone' ? EL_TXT.gone : acc.status === 'ambiguous' ? EL_TXT.ambiguous : acc.status === 'none' ? EL_TXT.noneNow : '';
  let autoSub = '';
  if(acc.byHand){ // what automatic matching would give, so removing a link is never a guess
    const m = UMCore.matchCustomer(_el.name, clinics, {}), c = erpLinkClinic(m.clinicId);
    let none = EL_TXT.noneNow;
    if(!m.channel && !c && !m.ambiguous){ // with no clinic: back to "Unrecognized customer names" only if a team member issued its invoices
      try{ const ap = UMCore.erpLinkPreview(digestData(), { name: _el.name, to: null }); if(!ap.error) none = elNoneText(ap.people); }catch(e){ console.warn('automatic match', e); }
    }
    autoSub = m.channel ? `<span>Would count at:</span> ${erpLinkBadge({ status: 'channel' })}`
      : c ? `<span>Would count at:</span> <b dir="auto" style="overflow-wrap:anywhere;">${esc(c.name)}</b> ${erpLinkBadge({ status: m.method === 'family' ? 'family' : 'name', closed: c.cls === 'Closed' })}`
      : `<span>${m.ambiguous ? EL_TXT.ambiguous : none}</span>`;
  }
  showModal(`
    <h3 style="margin-top:0;" data-el-sheet="${tok}">${I('building')} <span>Where do this account's invoices count?</span></h3>
    ${erpLinksPauseCard()}
    <div class="card" style="padding:12px 14px;">
      <div dir="auto" style="font-weight:800; font-size:15px; overflow-wrap:anywhere;">${esc(_el.name)}</div>
      <div class="clinic-sub"><span>ERP account</span> · ${acc.invoices} × · <span dir="ltr">${money(acc.net)}</span>${acc.first ? ` · ${fmtDate(acc.first)} – ${fmtDate(acc.last)}` : ''}</div>
      <div style="font-size:13px; margin-top:8px; display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center;"><span>Counted now at</span> ${where ? `<b dir="auto" style="overflow-wrap:anywhere;">${esc(where)}</b>` : ''} ${erpLinkBadge(acc)}</div>
      ${now ? `<div class="clinic-sub" style="line-height:1.5; margin-top:2px;"><span>${now}</span></div>` : ''}
      ${acc.lines ? `<div style="font-size:12.5px; margin-top:4px; line-height:1.5;"><span>Counts for</span> ${erpLinkPeople(acc.people)}</div>`
        : `<div class="clinic-sub" style="margin-top:4px;"><span>${elNoLinesText()}</span></div>`}
      <div id="elLast" style="display:none; font-size:12px; color:var(--muted); margin-top:4px; line-height:1.5;"></div>
      ${acc.variants.length ? `<div style="font-size:12px; margin-top:8px; line-height:1.9;"><span>Also in your files as:</span> ${acc.variants.map(v => `<button class="chip small" dir="auto" style="padding:3px 8px; font-size:11.5px; max-width:100%; overflow-wrap:anywhere;" data-erp-link="${esc(v)}" onclick="openErpLinkEdit(this.dataset.erpLink, _el ? _el.back : 'links')">${esc(v)}</button>`).join(' ')}</div>` : ''}
    </div>
    ${elInvoicesBlock(_el.name)}
    <div style="color:var(--muted); font-size:12px; margin:2px 2px 0;">One link for every saved file and every future upload.</div>
    ${notClinic ? `<div class="card" style="border-inline-start:4px solid var(--amber); background:var(--amber-dim); margin-top:12px; padding:10px 12px; font-size:12.5px; line-height:1.5;"><span>${acc.internal ? EL_TXT.internal : EL_TXT.channelName}</span></div>` : `
    <div class="section-title">Branches of the same clinic</div>
    ${UMCore.erpBranchCandidates(_el.name, clinics, erpMap).map(id => elTargetCard(erpLinkClinic(id), acc)).join('')}
    <div class="card clickable" data-target="@new" onclick="elChoose(this.dataset.target)" style="padding:10px 12px; margin-bottom:6px; background:transparent; border:1.5px dashed var(--gold-ink);">
      <div style="font-weight:700; font-size:13.5px;">${I('plus')} <span>New branch with this name</span></div>
      <div class="clinic-sub" dir="auto" style="overflow-wrap:anywhere;">${esc(_el.name)}</div>
    </div>
    <div class="section-title">Another clinic</div>
    <input type="text" id="elClinicSearch" dir="auto" placeholder="Search clinics…" oninput="renderElPick()" autocomplete="off">
    <div id="elPick" style="max-height:260px; overflow-y:auto; margin-top:8px;"></div>`}
    <div class="section-title">Not a clinic</div>
    ${acc.byHand ? elChoiceCard('@auto', 'Match by name (automatic)', autoSub) : ''}
    ${_el.shownOld !== '@channel' ? elChoiceCard('@channel', 'Online / channel sale', `<span>${EL_TXT.channel}</span>`) : ''}
    ${_el.shownOld !== '@ignore' ? elChoiceCard('@ignore', 'Ignore this customer', `<span>${EL_TXT.ignore}</span>`) : ''}
    <button class="btn secondary" onclick="elReturn()">‹ Back</button>`);
  renderElPick();
  erpLinkFillLast(_el.name);
}
function renderElPick(){
  const el = document.getElementById('elPick'); if(!el || !_el) return;
  const q = ((document.getElementById('elClinicSearch') || {}).value || '').trim().toLowerCase();
  const list = clinics.filter(c => c.cls !== 'Closed' && (!q || String(c.name || '').toLowerCase().includes(q) || String(c.rep || '').toLowerCase().includes(q)))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  el.innerHTML = list.slice(0, 40).map(c => elTargetCard(c, _el.acc)).join('')
    + (list.length > 40 ? `<div style="color:var(--muted); font-size:12px; text-align:center; padding:6px;">Showing 40 of ${list.length} — search to find the others</div>` : '')
    + (!list.length ? `<div style="color:var(--muted); font-size:13px; text-align:center; padding:12px;">Nothing matches.</div>` : '');
}
// The last change to this account, from the log (a convenience: nothing shows when it cannot be read).
async function erpLinkFillLast(name){
  try{
    const r = await withTimeout(window.storage.get('erpMapLog', true), 5000);
    const list = UMCore.safeParse(r && r.value, null);
    const key = elLogName(name), e = Array.isArray(list) ? list.find(x => x && (x.n === key || x.n === name)) : null; // (an entry written before names were bounded holds the whole name)
    const el = document.getElementById('elLast');
    if(!e || !el || !_el || _el.name !== name) return;
    const was = e.f == null ? '<span>Match by name (automatic)</span>' : e.f === '@channel' || e.f === '@ignore' ? erpLinkBadge({ status: e.f === '@channel' ? 'channel' : 'ignored' }) : `<b dir="auto" style="overflow-wrap:anywhere;">${esc(e.fc || e.f)}</b>`;
    el.innerHTML = `<span>Last change:</span> ${fmtDate(UMCore.localDateStr(new Date(e.at)))} · <b dir="auto" style="overflow-wrap:anywhere;">${esc(e.by || '—')}</b> · <span>before:</span> ${was}`;
    el.style.display = 'block';
  }catch(err){ /* the log is a convenience: nothing is shown */ }
}
function elChoose(t){
  if(!_el || !requireAdmin()) return;
  if(t === '@new'){
    if(_el.acc.internal || _el.acc.channelName) return;
    _el.newId = _el.newId || uid();   // a retry (or "‹ Pick another") reuses the same branch id
    _el.to = _el.newId; _el.addClinic = defaultBranch();
  } else if(t === '@auto'){ _el.to = null; _el.addClinic = null; }
  else { _el.to = t; _el.addClinic = null; }
  openErpLinkPreview();
}
// From the list in "count another account here" mode: straight to the check.
function openErpLinkPreviewFor(name, to, back){
  if(!requireAdmin()) return;
  let ok = false;
  try{ ok = elInit(name, back || _elListOpts.back || 'links'); }catch(e){ console.error('ERP account editor', e); }
  if(!ok){ showToast('⚠️ ' + EL_TXT.noCheck); return; }
  _el.pickList = true;
  elChoose(to);
}
// The new branch: named after the ERP account, owned like the branch it was
// counted at — never a silent first rep: with no clear owner, Save waits for one.
function defaultBranch(){
  if(_el.branch) return Object.assign({}, _el.branch); // already made by an earlier tap
  const acc = _el.acc;
  const cur = erpLinkClinic(acc.clinicId) || (acc.status === 'gone' ? (((recycleBin || {}).clinics) || []).find(b => b && b.id === acc.link) || null : null);
  let rep = cur && REPS.includes(cur.rep) ? cur.rep : null;
  if(!rep){
    const reps = [...new Set(UMCore.erpBranchCandidates(_el.name, clinics, erpMap).map(id => (erpLinkClinic(id) || {}).rep).filter(Boolean))];
    if(reps.length === 1 && REPS.includes(reps[0])) rep = reps[0];
  }
  if(!rep){ const top = (acc.people || [])[0]; if(top && top.rep && REPS.includes(top.rep)) rep = top.rep; }
  const nb = { id: _el.newId, name: _el.name, rep, cls: cur && EL_CLS.includes(cur.cls) ? cur.cls : 'B', account: cur ? cur.account || null : null, dealType: cur ? cur.dealType || null : null };
  return Object.assign(nb, _el.newDraft || {}, { id: _el.newId });
}

// ---- step 2: check before saving ----
// Once the branch is in the list (saved, or kept on this device until it
// uploads) it is shown as text: nothing typed after that could reach it.
function elNewBranchFields(nb){
  if(clinics.some(c => c.id === nb.id)){
    const c = erpLinkClinic(nb.id);
    return `<div class="card" id="elNewSaved" style="padding:10px 12px;"><div style="font-size:13px; line-height:1.6;"><span>New branch</span>: <b dir="auto" style="overflow-wrap:anywhere;">${esc(c.name)}</b> · <span dir="auto">${esc(c.rep || '—')}</span> · <span>Class</span> ${esc(c.cls || '—')}</div>
      <div class="clinic-sub"><span>${_el.clinicSaved ? 'The new branch is saved — now save the link.' : 'Saved on this device only — it uploads when the connection is back.'}</span></div></div>`;
  }
  return `<div class="card" id="elNewFields" style="padding:12px 14px;">
    <label for="elNewName" style="margin-top:0;">Branch name</label>
    <input type="text" id="elNewName" dir="auto" value="${esc(nb.name || '')}" oninput="elDraftChangedSoon()" autocomplete="off">
    <div id="elNewNameErr" style="display:none; color:var(--coral-ink); font-size:12px; font-weight:600; margin-top:4px;"></div>
    <div id="elNewHint" style="color:var(--muted); font-size:12px; margin-top:4px; line-height:1.5;"></div>
    <label>Assigned rep</label>
    <div class="chip-row" id="elNewRep">${REPS.map(r => `<div class="chip small ${nb.rep === r ? 'on' : ''}" data-rep="${esc(r)}" dir="auto" onclick="elPickNew(this)">${esc(r)}</div>`).join('')}</div>
    <label>Class</label>
    <div class="chip-row" id="elNewCls">${EL_CLS.map(c => `<div class="chip small ${nb.cls === c ? 'on' : ''}" data-cls="${c}" onclick="elPickNew(this)">${c}</div>`).join('')}</div>
  </div>`;
}
function elPickNew(el){ if(_elBusy) return; pickModalRep(el); elDraftChanged(); }
function elDraftChangedSoon(){ clearTimeout(_elDraftTimer); _elDraftTimer = setTimeout(elDraftChanged, 250); }
function elDraftChanged(){
  if(!_el || !_el.addClinic || _elBusy || clinics.some(c => c.id === _el.addClinic.id)) return;
  const n = document.getElementById('elNewName'); if(!n) return;
  const r = document.querySelector('#elNewRep .chip.on'), c = document.querySelector('#elNewCls .chip.on');
  _el.newDraft = { name: n.value.trim(), rep: r ? r.dataset.rep : null, cls: c ? c.dataset.cls : 'B' };
  _el.addClinic = Object.assign({}, _el.addClinic, _el.newDraft);
  elRenderMoves(); // only the figures re-render: the name field keeps its focus
}
// Does the new branch join the others' branch group? (same first name word,
// same rep, same type words — UMCore.clinicFamilies)
function elFamilyHint(nb){
  const nm = String(nb.name || '').trim(); if(!nm || !nb.rep) return '';
  const others = clinics.filter(c => c.id !== nb.id);
  const fams = UMCore.clinicFamilies(others.concat([Object.assign({}, nb, { name: nm })])), key = fams.byClinic[nb.id];
  if(key) return `<span>Joins the branch group</span> <b dir="auto" style="overflow-wrap:anywhere;">${esc(fams.fams[key].label)}</b> · ${fams.fams[key].count} <span>branches</span>`;
  const word = UMCore.normClinicName(nm).split(' ')[0] || '';
  if(word.length < 4) return '';
  const sib = others.filter(c => (UMCore.normClinicName(c.name).split(' ')[0] || '') === word);
  if(!sib.length) return '';
  const f0 = UMCore.clinicFamilies(others), k0 = sib.map(c => f0.byClinic[c.id]).find(Boolean);
  const label = k0 ? f0.fams[k0].label : String(sib[0].name || '').trim().split(/\s+/)[0];
  return `<span>Not grouped with the</span> <b dir="auto" style="overflow-wrap:anywhere;">${esc(label)}</b> <span>branches — the rep or the type words differ.</span>`;
}
function openErpLinkPreview(){
  if(!_el || !requireAdmin()) return;
  const tok = elStamp('preview'); _el.tok = tok;
  const nb = _el.addClinic;
  showModal(`
    <h3 style="margin-top:0;" data-el-sheet="${tok}">${I('check')} <span>Check before saving</span></h3>
    ${erpLinksPauseCard()}
    <div class="card" style="padding:10px 12px; margin-bottom:8px;"><div class="clinic-sub" style="margin:0 0 2px;"><span>ERP account</span></div>
      <div dir="auto" style="font-weight:800; font-size:14.5px; overflow-wrap:anywhere;">${esc(_el.name)}</div></div>
    ${nb ? elNewBranchFields(nb) : ''}
    <div id="elPreview"><div id="elMoves"></div></div>
    <div id="elErr" role="alert" style="display:none; margin-top:12px; padding:10px 12px; border-radius:12px; border-inline-start:4px solid var(--coral); background:var(--coral-dim); color:var(--coral-ink); font-size:12.5px; line-height:1.55; font-weight:600;"></div>
    <button class="btn" id="elSave" onclick="elSave()" disabled>Save</button>
    <button class="btn secondary" id="elBack" onclick="elBackToPick()">‹ Pick another</button>`);
  elRenderMoves();
}
// `reopen`: nothing can be saved from this page any more — offer the editor again, on fresh figures.
function elShowErr(html, reopen){
  const e = document.getElementById('elErr'); if(!e) return;
  e.innerHTML = '⚠️ ' + html + (reopen ? `<div class="chip-row" style="margin-top:8px;"><button class="chip small on" id="elReopen" onclick="elReopen()">🔄 <span>Open it again</span></button></div>` : '');
  e.style.display = 'block';
}
function elHideErr(){ const e = document.getElementById('elErr'); if(e){ e.style.display = 'none'; e.innerHTML = ''; } }
function elReopen(){ if(_el && !_elBusy) openErpLinkEdit(_el.name, _el.back); }
function elPvSig(pv){
  return JSON.stringify(pv ? { e: pv.error, a: pv.after && [pv.after.status, pv.after.clinicId], m: pv.moves, f: pv.limitFlips.map(x => x.doc), o: pv.others.map(x => x.name), n: pv.lines, c: pv.closedMonths } : null);
}
// Where this account counts changed since the page opened (another device, a
// refresh, a late landing): nothing can be saved from it.
function elStale(){
  if(!_el) return false;
  const cur = Object.prototype.hasOwnProperty.call(erpMap, _el.name) ? erpMap[_el.name] : null;
  return cur !== _el.shownOld;
}
function elCanSave(){
  if(!_el || _elBusy || _erpLinkSaving || !_elPv || _elPv.error || erpLinksPaused()) return false;
  if(_el.conflict || elStale()) return false;
  if(_el.addClinic && !_el.clinicSaved && _el.fieldErr) return false;
  const ck = document.getElementById('elClosedOk');
  return !(ck && !ck.checked);
}
function elUpdateSave(){
  const ck = document.getElementById('elClosedOk');
  if(ck && _el){ _el.closedOk = ck.checked; _el.closedOkSig = ck.dataset.sig || ''; }
  const s = document.getElementById('elSave'); if(s) s.disabled = !elCanSave();
}
// While a save runs nothing on its page can be changed or left from inside it:
// Save reads "Saving…", ‹ Pick another and the new-branch fields are locked.
function elSavingUi(on){
  const s = document.getElementById('elSave'), b = document.getElementById('elBack'), f = document.getElementById('elNewFields'), n = document.getElementById('elNewName');
  if(s){ s.disabled = true; s.textContent = on ? 'Saving…' : 'Save'; s.dataset.saving = on ? '1' : ''; }
  if(b) b.disabled = !!on;
  if(f){ f.style.pointerEvents = on ? 'none' : ''; f.style.opacity = on ? '.6' : ''; }
  if(n) n.disabled = !!on;
  if(!on) elUpdateSave();
}
// Everything the change does, worked out by UMCore.erpLinkPreview on the same
// rows as the month figures; the percentages by UMCore.monthAchievement.
function elRenderMoves(){
  const box = document.getElementById('elMoves'); if(!box || !_el) return;
  const nb = _el.addClinic;
  _el.fieldErr = null;
  if(nb && !clinics.some(c => c.id === nb.id)){
    const nm = String(nb.name || '').trim();
    const taken = nm && storedClinics().some(c => c.id !== nb.id && String(c.name || '').trim().toLowerCase() === nm.toLowerCase());
    _el.fieldErr = !nm ? 'Enter a branch name' : taken ? 'A clinic with this name already exists — choose it from the branches (‹ Pick another).' : !nb.rep ? 'Pick the rep who owns the new branch.' : null;
    const ne = document.getElementById('elNewNameErr');
    if(ne){ ne.innerHTML = _el.fieldErr ? `<span>${_el.fieldErr}</span>` : ''; ne.style.display = _el.fieldErr ? 'block' : 'none'; }
    const hint = document.getElementById('elNewHint');
    if(hint) hint.innerHTML = _el.fieldErr ? '' : elFamilyHint(nb);
  }
  let pv = null;
  try{ pv = UMCore.erpLinkPreview(digestData(), { name: _el.name, to: _el.to, addClinic: nb || null }, { settings: typeof kpiSettings === 'function' ? kpiSettings() : {} }); }
  catch(e){ console.error('ERP link preview', e); }
  _elPv = pv;
  elHideErr();
  if(!pv){ box.innerHTML = ''; elShowErr(`<span>${EL_TXT.noCheck}</span>`); elUpdateSave(); return; }
  const parts = [elSidesHtml(pv)];
  if(pv.error){
    const msg = pv.error === 'SAME' ? EL_TXT.same : pv.error === 'NO_CLINIC' ? EL_TXT.noClinic : pv.error === 'CLOSED_CLINIC' ? EL_TXT.closedTarget
      : pv.error === 'NOT_A_CLINIC_ACCOUNT' ? (UMCore.isInternalAccount(_el.name) ? EL_TXT.internal : EL_TXT.channelName) : EL_TXT.noCheck;
    box.innerHTML = parts.join('');
    elShowErr(`<span>${msg}</span>`); elUpdateSave(); return;
  }
  // what moves: this account, month by month (every saved file), as the month figures count it
  parts.push(`<div class="section-title">What moves</div><div class="card" style="padding:10px 12px;">
    <div style="font-size:13.5px; font-weight:800;">${pv.invoices} × · <span dir="ltr">${money(pv.net)}</span>${pv.first ? ` · ${fmtDate(pv.first)} – ${fmtDate(pv.last)}` : ''}</div>
    ${pv.months.map(m => `<div class="el-month report-line" data-month="${m.month}" style="font-size:12.5px; padding:6px 0; gap:8px; flex-wrap:wrap;">
      <span>${esc(monthLabel(m.month))}${m.closed ? ' ' + elClosedBadge() : ''}</span><span class="v">${m.invoices} × · <span dir="ltr">${money(m.net)}</span></span></div>`).join('')}
    ${pv.outside && pv.outside.lines ? `<div class="el-outside clinic-sub" style="margin-top:4px; line-height:1.5;"><span>Lines that count in no month's figure (returns dated back to a month their own file does not cover):</span> ${pv.outside.lines} · <span dir="ltr">${money(pv.outside.net)}</span></div>` : ''}
    ${!pv.lines ? `<div class="clinic-sub"><span>${elNoLinesText()}</span></div>` : ''}
    ${(pv.ledger.returns || pv.ledger.free) ? `<div class="clinic-sub" style="margin-top:6px; line-height:1.5;"><span>Return lines</span> ${pv.ledger.returns} · <span>free-goods lines</span> ${pv.ledger.free} — <span>they move with the account, with their reasons.</span></div>` : ''}
  </div>`);
  // who it counts for: the person behind every line that changes hands
  if(!pv.moves.length){
    parts.push(`<div class="section-title">Who it counts for</div><div class="card" style="padding:10px 12px; font-size:13px; line-height:1.6;">${pv.lines ? `<span>Still counts for</span> ${erpLinkPeople(pv.people)} — ` : ''}<span>nobody's sales figures change.</span></div>`);
  } else {
    let today = '';
    const cur = todayStr().slice(0, 7);
    if(pv.moves.some(m => m.month === cur)){
      // the Today card's own figures: now (bestMonthRevenue) and after saving (monthAchievement on the draft)
      const d1 = Object.assign({}, digestData(), pv.draft), withGoal = REPS.filter(r => (targets[r] || {}).revenue > 0);
      const nowKey = JSON.stringify([withGoal, erpReturnPolicy(), erpPeriods().map(p => p.id + ':' + (p.rev || '') + ':' + (p.rows || []).length), erpMap,
        clinics.map(c => [c.id, c.rep, c.prevRep, c.repSince, !!c.shared, c.sharedSince])]);
      if(!_el.nowAch || _el.nowAch.key !== nowKey){ const v = {}; withGoal.forEach(r => { v[r] = bestMonthRevenue(r).amount; }); _el.nowAch = { key: nowKey, v }; } // unchanged while the name is typed
      const now = _el.nowAch.v, aft = {}; withGoal.forEach(r => { aft[r] = UMCore.monthAchievement(r, d1).amount; });
      const pct = (a, g) => `<span dir="ltr">${Math.round(a / g * 100)}%</span>`;
      const lines = withGoal.filter(r => Math.abs(now[r] - aft[r]) >= 0.005).map(r => `<div class="el-today" data-rep="${esc(r)}" style="font-size:12.5px; padding:2px 0;">${elWho(r)}: <span>now</span> ${pct(now[r], targets[r].revenue)} · <span>after saving</span> ${pct(aft[r], targets[r].revenue)}</div>`);
      const t0 = teamTargetTotal(withGoal.map(r => ({ goal: targets[r].revenue, ach: now[r] }))), t1 = teamTargetTotal(withGoal.map(r => ({ goal: targets[r].revenue, ach: aft[r] })));
      if(lines.length && t0.pct != null && t0.n > 1 && (t0.pct !== t1.pct || t0.ach !== t1.ach)) lines.push(`<div class="el-today" data-rep="@team" style="font-size:12.5px; padding:2px 0;"><b><span>Team</span></b>: <span>now</span> <span dir="ltr">${t0.pct}%</span> · <span>after saving</span> <span dir="ltr">${t1.pct}%</span></div>`);
      if(lines.length) today = `<div style="margin-top:8px; padding-top:6px; border-top:1px dashed var(--line);"><div style="font-size:11.5px; color:var(--muted); font-weight:700;"><span>This month on the Today card</span></div>${lines.join('')}</div>`;
    }
    parts.push(`<div class="section-title">Who it counts for</div><div class="card" style="padding:6px 12px 10px;">
      ${pv.moves.map(m => `<div class="el-move" data-month="${m.month}" style="padding:7px 0; border-bottom:1px solid var(--line); font-size:12.5px; line-height:1.55;">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap;"><span><b>${esc(monthLabel(m.month))}</b>${m.closed ? ' ' + elClosedBadge() : ''}</span><span dir="ltr" style="font-weight:800;">${money(m.net)}</span></div>
        <div><span>From</span> ${elWho(m.from)} · <span>To</span> ${elWho(m.to)} · ${m.invoices} ×</div></div>`).join('')}
      ${today}</div>`);
  }
  if(pv.others.length) parts.push(`<div class="section-title">Other accounts that change</div><div class="card" style="padding:6px 12px;">${pv.others.map(o => `<div style="padding:6px 0; border-bottom:1px dashed var(--line); font-size:12.5px; line-height:1.55;">
      <div style="display:flex; justify-content:space-between; gap:8px;"><b dir="auto" style="overflow-wrap:anywhere; min-width:0;">${esc(o.name)}</b><span dir="ltr" style="font-weight:700; flex-shrink:0;">${money(o.net)}</span></div>
      <div style="display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center;"><span>Now</span>: ${elSideHtml(o.before, nb)} · <span>After saving</span>: ${elSideHtml(o.after, nb)}</div></div>`).join('')}</div>`);
  if(pv.limitFlips.length){
    const st = x => !x ? '<span>not in the discount check</span>' : `<span>${x.within ? 'within the limit' : 'over the limit'}</span> <span dir="ltr">(${x.limit}%)</span>`;
    parts.push(`<div class="section-title">Discount check</div><div class="card" style="padding:8px 12px;">
      <div style="font-size:12.5px; font-weight:700;"><span>Invoices whose discount check changes:</span> ${pv.limitFlips.length} · <span dir="ltr">${money(pv.limitFlips.reduce((s, x) => s + x.net, 0))}</span></div>
      ${pv.limitFlips.map(x => `<div style="padding:5px 0; border-top:1px dashed var(--line); font-size:12px; line-height:1.55;">
        <div><b dir="auto" style="overflow-wrap:anywhere;">${esc(x.doc)}</b> · ${fmtDate(x.date)} · <span dir="ltr">${x.pct}%</span> · <span dir="ltr">${money(x.net)}</span>${x.closed ? ' ' + elClosedBadge() : ''}</div>
        <div><span>Now</span>: ${st(x.before)} · <span>After saving</span>: ${st(x.after)}</div></div>`).join('')}</div>`);
  }
  parts.push(elNotesHtml(pv));
  // a closed month changes: said by cause — its sales, its discount check, its
  // new-account / first-time-product wins — and Save waits for an explicit tick
  const cm = pv.closedMonths || { sales: [], discount: [], wins: [] };
  if(cm.sales.length || cm.discount.length || cm.wins.length){
    const sig = JSON.stringify(cm), months = ms => ms.map(m => `<b>${esc(monthLabel(m))}</b>`).join(' · ');
    parts.push(`<div class="card" id="elClosedCard" style="border-inline-start:4px solid var(--amber); background:var(--amber-dim); margin-top:12px; padding:10px 12px; font-size:12.5px; line-height:1.55;">
      <div style="font-weight:700;">⚠️ <span>Closed months change</span></div>
      ${cm.sales.length ? `<div data-closed="sales" style="margin-top:4px;"><span>Sales change in:</span> ${months(cm.sales)}<div style="color:var(--ink-2); font-size:12px;"><span>The month-by-month page, the KPI and the weekly deck history follow.</span></div></div>` : ''}
      ${cm.discount.length ? `<div data-closed="discount" style="margin-top:4px;"><span>The discount check changes in:</span> ${months(cm.discount)}</div>` : ''}
      ${cm.wins.length ? `<div data-closed="wins" style="margin-top:4px;"><span>New-account / first-time-product wins can change in:</span> ${months(cm.wins)}</div>` : ''}
      <label style="display:flex; gap:10px; align-items:center; margin:8px 0 0; font-size:13px; color:var(--ink); font-weight:700; cursor:pointer;"><input type="checkbox" id="elClosedOk" data-sig="${esc(sig)}" ${_el.closedOk && _el.closedOkSig === sig ? 'checked' : ''} onchange="elUpdateSave()" style="width:22px; height:22px; flex-shrink:0; margin:0;"> <span>I understand that closed months change.</span></label>
    </div>`);
  }
  box.innerHTML = parts.join('');
  // nothing can be saved from a page whose starting point is gone: it says why, and offers the editor again
  if(_el.conflict) elShowErr(_el.conflict, true);
  else if(elStale()) elShowErr(`<span>${EL_TXT.stale}</span>`, true);
  elUpdateSave();
}
function elSidesHtml(pv){
  const line = (label, side, extra) => `<div class="report-line" style="gap:8px; align-items:center; flex-wrap:wrap; font-size:13px;"><span style="color:var(--muted); flex-shrink:0;"><span>${label}</span></span>
    <span style="display:flex; flex-wrap:wrap; gap:4px 6px; justify-content:flex-end; align-items:center; min-width:0; flex:1 1 auto; text-align:end;">${elSideHtml(side, extra)}</span></div>`;
  let h = `<div class="card" style="padding:2px 12px; margin-bottom:8px;">${pv.before ? line('Now', pv.before) : ''}${pv.after ? line('After saving', pv.after, _el.addClinic) : ''}</div>`;
  const a = pv.after, why = !a ? '' : a.status === 'none' ? elNoneText(pv.people) : a.status === 'ambiguous' ? EL_TXT.ambiguous : a.status === 'ignored' ? EL_TXT.ignore : a.status === 'channel' ? EL_TXT.channel : '';
  if(why) h += `<div class="clinic-sub" style="margin:-2px 2px 8px; line-height:1.5;"><span>${why}</span></div>`;
  return h;
}
function elNotesHtml(pv){
  const notes = [];
  const to = _el.to, tgt = typeof to === 'string' && to.charAt(0) !== '@' ? (erpLinkClinic(to) || (_el.addClinic && _el.addClinic.id === to ? _el.addClinic : null)) : null;
  if(tgt){
    const unsaved = !!(_el.addClinic && _el.addClinic.id === tgt.id && !clinics.some(c => c.id === tgt.id));
    if(tgt.shared) notes.push(`<span>Shared account:</span> <span>each invoice counts for the salesman who issued it from</span> ${tgt.sharedSince ? fmtDate(tgt.sharedSince) : '—'}.`);
    if(tgt.prevRep && tgt.repSince) notes.push(`<span>Handed over:</span> <span>lines dated before</span> ${fmtDate(tgt.repSince)} <span>count for</span> ${elWho(tgt.prevRep)}.`);
    // with no rep a line counts for the salesman who issued it (UMCore.erpRepOfMatch); only a rep
    // outside the team takes the sales out of the team totals (a new branch's missing rep is asked for above)
    if(!tgt.rep){ if(!unsaved) notes.push(`<span>This clinic has no rep — its invoices count for the salesman who issued them.</span>`); }
    else if(!REPS.includes(tgt.rep)) notes.push(`<span>This clinic counts for</span> ${elWho(tgt.rep)} <span>— not on the team, so those sales leave the team totals.</span>`);
    if(pv.before && pv.before.status === 'family') notes.push(`<span>${EL_TXT.handLine}</span>`);
    if(pv.before && pv.before.clinicId && pv.before.clinicId !== tgt.id) notes.push(`<span>Visits already logged stay on the branch they were logged at.</span>`);
  }
  // one note per name whose first paid invoice moves (UMCore merges an account and the branch named after it)
  const day = d => d ? fmtDate(d) : '<span>no paid invoice</span>';
  pv.firstInvoice.forEach(fi => notes.push(`<b dir="auto" style="overflow-wrap:anywhere;">${esc(fi.label)}</b> — <span>first invoice:</span> <span>now</span> ${day(fi.before)} · <span>after saving</span> ${day(fi.after)} — <span>new-account wins follow this date.</span>`));
  notes.push(`<span>The daily e-mail follows from its next run; decks and files already downloaded do not change.</span>`);
  return `<div class="section-title">Good to know</div><div class="card" style="padding:6px 12px;">${notes.map(n => `<div class="el-note" style="padding:5px 0; font-size:12px; line-height:1.55; color:var(--ink-2);">• ${n}</div>`).join('')}</div>`;
}
function elBackToPick(){
  if(!_el || _elBusy) return;
  if(_el.pickList) openErpLinks(_elListOpts); else openErpLinkEdit(_el.name, _el.back, _el);
}

// ---- save: a new branch first (it must be in the cloud), then the link ----
async function elSave(){
  if(!requireAdmin() || !_el || _elBusy) return;
  if(!elCanSave()){ elRenderMoves(); return; } // the figures say why nothing can be saved
  // what the person saw; a refresh or another device may have changed the data behind it: check again first
  const shown = elPvSig(_elPv);
  if(_el.addClinic && !_el.clinicSaved && document.getElementById('elNewName')){ clearTimeout(_elDraftTimer); elDraftChanged(); } // a name typed a moment ago counts
  else elRenderMoves();
  if(elPvSig(_elPv) !== shown){ elShowErr(`<span>${EL_TXT.changed}</span>`); return; }
  if(!elCanSave()){ elUpdateSave(); return; }
  // Everything below reads this snapshot, never _el / _elPv: the person may
  // leave this page while the cloud answers, and open anything else (its page:
  // elPageOf). `flow` is shared by every attempt of this edit (a retry, ‹ Pick
  // another): a change is told once and logged once, whichever attempt lands first.
  const s = { el: _el, flow: _el.flow, name: _el.name, to: _el.to, shownOld: _el.shownOld, back: _el.back,
    nb: _el.addClinic && !_el.clinicSaved ? Object.assign({}, _el.addClinic) : null, pv: _elPv };
  _elBusy = true;
  elSavingUi(true);
  elHideErr();
  let r;
  try{
    r = s.nb ? await elSaveBranch(s) : { ok: true };
    if(r.ok) r = await saveErpLink(s.name, s.to, s.shownOld, s);
  }catch(e){ console.error('ERP link save', e); r = { failed: true }; }
  _elBusy = false;
  try{ if(r.ok) elConfirmed(s); else elAfterFail(s, r); }
  catch(e){ console.error('ERP link save: the result', e); if(elPageOf(s)) elSavingUi(false); }
  elRefreshSaveState(); // an editor opened meanwhile (another account) gets its Save back
}
// The new branch: it must land in the cloud before any link points at it.
async function elSaveBranch(s){
  const nb = s.nb, nm = String(nb.name || '').trim();
  if(storedClinics().some(c => c.id !== nb.id && String(c.name || '').trim().toLowerCase() === nm.toLowerCase())) return { dup: true };
  let c = clinics.find(x => x.id === nb.id);
  if(!c){ c = normalizeClinic({ id: nb.id, name: nm, rep: nb.rep, cls: nb.cls, account: nb.account || null, dealType: nb.dealType || null,
    isNew: false, addedOn: todayStr(), market: null, notes: 'فرع جديد — أُنشئ من حساب الفواتير: ' + s.name, contact: '', phone: '' }); clinics.push(c); }
  keepClinicOnRefresh(c);             // a refresh that read the list before this save lands must not drop it (loadAll)
  delete _persistInfo.clinics;        // persist's early refusals (the factory-list guard) leave it untouched: never read an older save's outcome
  const ok = await persist('clinics');
  const mine = () => clinics.find(x => x.id === nb.id) || c;
  if(ok){
    if(!clinics.some(x => x.id === nb.id)) clinics.push(c); // a refresh replaced the list while the save was on its way
    s.el.clinicSaved = true; s.el.branch = Object.assign({}, mine()); s.el.addClinic = Object.assign({}, s.el.branch);
    s.el.branchPv = s.pv;             // the figures from before the branch existed: what Undo puts back
    renderAll();
    return { ok: true };
  }
  if(persistOutcome('clinics').queued){
    // kept: the outbox uploads it by itself, so taking it out of memory would not stop it
    s.el.addClinic = Object.assign({}, mine()); s.el.branch = Object.assign({}, s.el.addClinic); s.el.branchPv = s.pv;
    renderAll();
    return { queued: true };
  }
  clinics = clinics.filter(x => x.id !== nb.id);   // refused outright: nothing changed anywhere
  forgetKeptClinic(nb.id);
  return { failed: true };
}
// This edit's check page, if it is still the sheet on screen. The page may have
// been redrawn since Save was tapped (a failed attempt redraws it with the new
// branch as text; the rows' retry redraws it): every redraw of the same edit
// stamps _el.tok, so a save that ends — in time or late — finds its page.
function elPageOf(s){ return !!(s && s.el && _el === s.el && elOnScreen(s.el.tok)); }
// A save that did not (fully) land. Its page — if it is still the one on
// screen — says what happened and where the account counts NOW (computed,
// never assumed); a branch that exists by now is redrawn as text, so the next
// Save retries the link only. A page the person left is not redrawn: a toast,
// which names the new branch when one was added.
function elAfterFail(s, r){
  if(elToldAlready(s)){ elFinishPage(s); return; }  // an earlier attempt of this very change landed and was told: its page says "Saved" too
  const now = erpLinkSideNow(s.name);
  const msg = elFailMsg(s, r, now);
  if(r.conflict) s.el.conflict = msg;               // nothing can be saved from that page any more
  if(elPageOf(s)){
    if(r.dup){ elSavingUi(false); elRenderMoves(); return; }   // the name was taken meanwhile: said under the field
    if(s.el.clinicSaved || r.queued) openErpLinkPreview();      // the branch exists now: fresh figures, fields as text (still this edit's page: a late landing finishes it)
    else elSavingUi(false);
    elShowErr(msg, !!r.conflict);
    elUpdateSave();
    return;
  }
  const where = `${s.name}: ${elWhereText(now)}.`, bn = s.el.branch && s.el.branch.name ? s.el.branch.name : s.name;
  showToast(r.queued ? `📴 The new branch uploads when the connection is back; the link was not saved — ${where}`
    : s.el.clinicSaved && r.timeout ? `⏳ The new branch ${bn} was added; the link has no confirmation from the cloud yet — ${where}`
    : s.el.clinicSaved ? `⚠️ The new branch ${bn} was added, but the link was not saved — ${where}`
    : r.timeout ? `⏳ No confirmation from the cloud yet — ${where}`
    : `⚠️ Not saved — ${where}`, 6000);
}
function elFailMsg(s, r, now){
  const where = `<div style="margin-top:4px;">${elWhereHtml(now, 'current')}</div>`; // where it counts at this moment, on its own line
  if(r.queued) return `<span>The new branch is saved on this device only and uploads when the connection is back. The link was not saved.</span>${where}`;
  if(r.dup) return `<span>A clinic with this name already exists — choose it from the branches (‹ Pick another).</span>`;
  if(!s.el.clinicSaved) return elSaveErrMsg(r);
  if(r.timeout) return `<span>The new branch was added.</span> ${elSaveErrMsg(r)}${where}`;
  if(r.conflict) return `<span>${r.own ? EL_TXT.conflictOwnAfterBranch : EL_TXT.conflictAfterBranch}</span>${where}`;
  return `<span>The new branch was added, but the link was not saved.</span> <span>Tap Save to try again.</span>` + (r.failed ? '' : ' ' + elSaveErrMsg(r)) + where;
}
function elSaveErrMsg(r){
  return `<span>${r.conflict ? (r.own ? EL_TXT.conflictOwn : EL_TXT.conflict) : r.timeout ? EL_TXT.timeout : r.notLoaded ? EL_TXT.notLoaded : r.noClinic ? EL_TXT.noClinic : r.closedTarget ? EL_TXT.closedTarget : r.clinicsPending ? EL_TXT.clinicsPending : EL_TXT.notSaved}</span>`;
}
// The same change (same account, from the same link to the same target) was
// already confirmed and told by another attempt of this edit.
function elToldAlready(s){ const c = s && s.flow && s.flow.confirmed; return !!(c && c.next === s.to && c.shownOld === s.shownOld); }
function elUndoBtn(u){ return `<button class="chip small" id="elUndo" data-undo="${u.id}" style="margin-inline-start:4px;" onclick="undoErpLink(this)">Undo</button>`; }
// The cloud confirmed (in time, or late): back where the edit started, with
// what changed and an Undo — if this change's page is still the one on
// screen. Otherwise nothing is redrawn and _el is not touched: a toast names
// the account and where it counts now, and the Undo waits in the account list.
function elConfirmed(s){
  if(elToldAlready(s)){ elFinishPage(s); return; }  // a retry and a late landing of one change: told once — and no page of it is left on "Saving…"
  s.flow.confirmed = { next: s.to, shownOld: s.shownOld };
  const made = s.el.clinicSaved && s.el.branch && s.to === s.el.branch.id ? s.el.branch : null;
  const pv0 = made && s.el.branchPv ? s.el.branchPv : s.pv; // the account as it was before this change (and its branch)
  _elUndo = { id: String(++_elUndoSeq), name: s.name, prev: s.shownOld, now: s.to, back: s.back,
    branch: made ? made.id : null, branchName: made ? made.name : null,
    before: pv0 && pv0.before ? { status: pv0.before.status, clinicId: pv0.before.clinicId || null } : null,
    others: made && pv0 ? (pv0.others || []).map(o => ({ name: o.name, before: o.before })) : [] };
  renderAll();
  if(!elFinishPage(s)) showToast(`✅ Saved — ${s.name}: ${elWhereText(erpLinkSideNow(s.name))}. Undo: ERP account links.`, 6000);
}
// A confirmed change's page, if it is still on screen (whichever attempt of the
// edit drew it last — or a later page of the same edit, after ‹ Pick another,
// showing this very change): back where the edit started, with "Saved", where
// the account counts now and — while it is still the last change — its Undo.
// false: the page is gone (closed, or another sheet opened), nothing redrawn.
function elFinishPage(s){
  const same = !!(_el && s && (_el === s.el || (_el.flow === s.flow && _el.to === s.to && _el.shownOld === s.shownOld)));
  if(!same || !elOnScreen(_el.tok)) return false;
  const u = _elUndo && _elUndo.name === s.name && _elUndo.prev === s.shownOld && _elUndo.now === s.to ? _elUndo : null;
  _el = null; _elPv = null;
  elReturnTo(s.back, `✅ <span>Saved</span> — <b dir="auto" style="overflow-wrap:anywhere;">${esc(s.name)}</b> ${elWhereHtml(erpLinkSideNow(s.name), 'now')}${u ? ' ' + elUndoBtn(u) : ''}`);
  return true;
}
// A save or an Undo ended (in time or late, or another attempt told it): the
// editor page on screen, if any — another account's, opened meanwhile — gets
// its Save back as elCanSave says, without being redrawn. A page left reading
// "Saving…" while nothing runs is released; one whose account changed
// meanwhile says so (nothing can be saved from it).
function elRefreshSaveState(){
  if(!_el || !elOnScreen(_el.tok)) return;
  const idle = !_elBusy && !_erpLinkSaving, sv = document.getElementById('elSave');
  if(idle && sv && sv.dataset.saving === '1') elSavingUi(false);
  if(idle && !_el.conflict && elStale() && !document.querySelector('#modalInner #elReopen')) elShowErr(`<span>${EL_TXT.stale}</span>`, true);
  elUpdateSave();
}
// A save or an Undo the app stopped waiting for landed after all
// (erpMapReloadFromCloud has read the cloud copy into memory): it finishes as
// an in-time one would. true: said here (no generic toast).
function elAfterLateLanding(info){
  if(!info) return false;
  if(info.quiet){ elRefreshSaveState(); return true; }   // the same change was already confirmed and told: only the figures follow
  if(info.undo){ elUndoFinish(info.undo, info.btn, true).catch(e => console.error('undo: a late landing', e)); return true; }
  if(info.s){ elConfirmed(info.s); elRefreshSaveState(); return true; }
  return false;
}
// One account, compare-and-set in the cloud. next / shownOld: clinicId |
// '@channel' | '@ignore' | null (no link). The cloud must still hold what the
// screen showed (or already what we write); every other account is written
// back exactly as the cloud has it. Memory and the device copy follow only a
// confirmed write. `s`: the editor's save snapshot (none for an Undo).
// `opts.undo`: an Undo putting back the link it had (its record, from
// undoErpLink) — the one way a link may point at a Closed clinic again; no
// change ever makes one a new target. `opts.btn`: the Undo button tapped, so a
// write that lands late still reports on its note while that is on screen.
async function saveErpLink(name, next, shownOld, s, opts){
  name = String(name == null ? '' : name).trim();
  if(!requireAdmin()) return { failed: true };
  if(!name || name === '(no name)' || _erpLinkSaving) return { failed: true };
  if(_loadFailed.erpMap || _mirrorUsed.erpMap) return { notLoaded: true };
  next = next == null ? null : next; shownOld = shownOld == null ? null : shownOld;
  const isClinic = v => typeof v === 'string' && v.charAt(0) !== '@';
  if(next !== null && !isClinic(next) && next !== '@channel' && next !== '@ignore') return { failed: true }; // nothing else is ever stored
  const target = isClinic(next) ? clinics.find(c => c.id === next) : null;
  if(isClinic(next) && !target) return { noClinic: true };
  if(target && target.cls === 'Closed' && next !== shownOld && !(opts && opts.undo)) return { closedTarget: true };
  if(isClinic(next) && outboxHas('clinics')) return { clinicsPending: true }; // never a link to a clinic the cloud may not have
  const undo = opts && opts.undo && typeof opts.undo === 'object' ? opts.undo : null; // an Undo's record (undoErpLink)
  const once = s ? s.flow : undo;     // shared by every attempt of one change: it is logged once
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  let conflict = false, committed = null, seen = null;
  const fn = cloudStr => { // Firestore may run this more than once: every run starts clean
    conflict = false; committed = null; seen = null;
    // JSON.parse keeps every key as an own property, "__proto__" included; a
    // copy through JSON does too, and the one key changed is defined, never
    // assigned — Object.assign and `out[name] = …` drop or ignore "__proto__"
    const v = cloudStr == null ? null : UMCore.safeParse(cloudStr, null);
    const cloud = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    seen = cloud;
    const cur = has(cloud, name) ? cloud[name] : null;
    if(cur !== shownOld && cur !== next){ conflict = true; return null; }
    const out = JSON.parse(JSON.stringify(cloud));
    if(next === null) delete out[name];
    else Object.defineProperty(out, name, { value: next, enumerable: true, writable: true, configurable: true });
    committed = out; return JSON.stringify(out);
  };
  _erpLinkSaving = true;
  let op;
  try{ op = typeof window.storage.update === 'function' ? window.storage.update('erpMap', fn) : storageUpdate('erpMap', fn, ERP_LINK_WRITE_MS); }
  catch(e){ op = Promise.reject(e); }
  let written = null, timedOut = false;
  try{ written = await withTimeout(op, ERP_LINK_WRITE_MS); }
  catch(e){
    timedOut = /timeout/.test(String(e && e.message));
    if(!timedOut) console.warn('account link not saved', e);
    // the write the app stopped waiting for can still land: when it does, the screen follows the cloud,
    // and the change finishes as an in-time one would — its page, or an Undo's branch and its report
    else op.then(v => {
      if(v == null) return;
      const told = s ? elToldAlready(s) : !!(undo && undo.done); // a retry of the same change was confirmed and told first
      elLogOnce(once, name, shownOld, next);
      erpMapReloadFromCloud(told ? { quiet: true } : { name, next, shownOld, s: s || null, undo, btn: (opts && opts.btn) || null });
    }).catch(() => {});
  }
  finally{ _erpLinkSaving = false; }
  if(written == null){
    if(conflict && seen){ erpMap = seen; _erpMapGen++; mirrorSave('erpMap', JSON.stringify(seen)); renderAll(); } // what the cloud holds now: reopened, the editor shows it
    if(timedOut) elOwnLateAdd(name, next);
    const own = conflict && seen && elOwnLateHas(name, has(seen, name) ? seen[name] : null); // the cloud holds this device's own earlier change
    return conflict ? (own ? { conflict: true, own: true } : { conflict: true }) : timedOut ? { timeout: true } : { failed: true };
  }
  erpMap = committed; _erpMapGen++;
  mirrorSave('erpMap', written); _persistInfo.erpMap = { ok: true };
  elLogOnce(once, name, shownOld, next); // best effort: a failed log write never fails or undoes the link
  return { ok: true };
}
// One change, one log entry — whichever of its attempts (a retry, a write that
// landed late) is confirmed first. `once`: the edit's flow, or an Undo's record.
function elLogOnce(once, name, from, to){
  if(once){
    const k = JSON.stringify([from == null ? null : from, to == null ? null : to]);
    once.logged = once.logged || {};
    if(once.logged[k]) return;
    once.logged[k] = 1;
  }
  erpLinkLog(name, from, to);
}

// ---- Undo ----
// Puts the link back as it was. A branch made in that same change goes too
// while nothing of its own hangs on it yet (no visit, no doctor, no other ERP
// account counted there, no other hand link): removed the way any clinic is
// (recycle bin, the team's delete log). Otherwise it stays — then the note
// says why, and where the account counts now (a branch named after the
// account still takes it by name). Every word of the note is worked out after
// the undo, from memory as it is. An Undo whose write the app stopped waiting
// for finishes the same way when the write lands (elUndoFinish, late).
async function undoErpLink(btn){
  if(!requireAdmin()) return;
  const u = _elUndo, id = btn && btn.dataset ? btn.dataset.undo : null;
  if(!u || (id && u.id !== id)){ showToast('⚠️ ' + EL_TXT.undoGone); return; }
  if(_elBusy || _erpLinkSaving){ showToast('⏳ ' + EL_TXT.saving); return; }
  _elBusy = true;
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; u.btn = btn; } // the latest tap's note is where a late landing reports
  let r = null;
  try{ r = await saveErpLink(u.name, u.prev, u.now, null, { undo: u, btn }); }catch(e){ console.error('undo account link', e); r = { failed: true }; }
  try{
    // confirmed — or an earlier tap's write landed meanwhile and finishes it: told once
    if(r.ok || u.done){ await elUndoFinish(u, btn, false); return; }
    renderAll();
    const now = erpLinkSideNow(u.name);
    if(elNoteOn(btn)){
      const old = btn.parentElement && btn.parentElement.querySelector('.el-undo-err'); if(old) old.remove(); // a second failed tap: one message
      const d = document.createElement('div'); d.className = 'el-undo-err'; d.style.cssText = 'color:var(--coral-ink); font-weight:600; margin-top:6px;';
      d.innerHTML = '⚠️ ' + elSaveErrMsg(r) + `<div style="margin-top:2px;">${elWhereHtml(now, 'current')}</div>`;
      (btn.parentElement || btn).appendChild(d);
      btn.disabled = false; btn.textContent = 'Undo';
    } else showToast(r.timeout ? `⏳ No confirmation from the cloud yet — ${u.name}: ${elWhereText(now)}.` : `⚠️ Not saved — ${u.name}: ${elWhereText(now)}.`, 6000);
  }finally{
    _elBusy = false;
    elRefreshSaveState(); // an editor opened meanwhile gets its Save back
  }
}
// The Undo button's note is still on screen (its sheet was not closed or replaced).
function elNoteOn(btn){ const back = document.getElementById('modalBack'); return !!(btn && btn.isConnected && back && back.classList.contains('show')); }
// An Undo the cloud confirmed — in time (undoErpLink), or late: its write
// landed after the app stopped waiting (elAfterLateLanding). Finished once,
// whichever comes first: the branch made in the undone change goes while
// nothing of its own hangs on it, and the result is said — on the note while
// its sheet is open, else in a toast naming the account, what happened to the
// branch and where the account counts now. A late one never runs alongside
// another save or Undo (one could be linking an account to that branch): it
// waits for it, and if it cannot, the branch stays and the report says so.
async function elUndoFinish(u, btn, late){
  if(u.done) return;
  u.done = true;
  if(_elUndo === u) _elUndo = null;
  const tapped = () => [u.btn, btn].find(elNoteOn) || null; // the note of the latest tap (or of the one that landed), if still on screen
  if(late && tapped()) tapped().disabled = true;            // landed: that Undo has nothing left to do (the note is redrawn below)
  let br = null;
  if(u.branch){
    let mine = false;
    try{
      if(late){
        for(let i = 0; i < 300 && (_elBusy || _erpLinkSaving); i++) await new Promise(r => setTimeout(r, 100));
        if(_elBusy || _erpLinkSaving){ console.warn('undo: another save is still running — the new branch stays'); br = { kept: { why: 'check' } }; }
        else _elBusy = mine = true;
      }
      if(!br) br = await elUndoBranch(u);
    }catch(e){ console.error('undo: the new branch', e); br = { kept: { why: 'check' } }; }
    finally{ if(mine) _elBusy = false; }
  }
  renderAll();
  const now = erpLinkSideNow(u.name), t = tapped(), inNote = t && t.closest ? t.closest('#erpImportNote') : null;
  const toast = () => showToast(elUndoToast(u, br, now), br && (br.removed || br.kept) ? 9000 : 6000);
  if(t && late){        // landed late: the person kept working on this sheet — change only the note, never rebuild it
    if(inNote) inNote.innerHTML = elUndoNote(u, br, now) + ' <span style="color:var(--muted);">Reopen this page to see the updated figures.</span>';
    else toast();
  }
  else if(t && !inNote && document.getElementById('elList')) elReturnTo('links', elUndoNote(u, br, now)); // tapped on the list's "Last change" card: stay on the list
  else if(t) elReturnTo(u.back, elUndoNote(u, br, now));
  else toast();
  if(late) elRefreshSaveState();
}
// Can the branch made in the undone change go? null = yes; else why it stays.
function elBranchKeeps(c, name){
  if(_seedClinics) return { why: 'cloud' };
  if(elRowsMissing()) return { why: 'rows' };      // an account in a file not loaded here could count there
  if(visits.some(v => v && v.clinicId === c.id)) return { why: 'visits' };
  if((c.doctors || []).length) return { why: 'doctors' };
  const link = Object.keys(erpMap).find(k => k !== name && erpMap[k] === c.id);
  if(link != null) return { why: 'link', account: link };
  let acc = null;
  try{ acc = UMCore.erpAccounts(digestData()).accounts.find(a => a.name !== name && a.clinicId === c.id) || null; }
  catch(e){ console.warn('branch check', e); return { why: 'check' }; }
  return acc ? { why: 'account', account: acc.name } : null;
}
async function elUndoBranch(u){
  const c = clinics.find(x => x.id === u.branch);
  if(!c) return { gone: true };                     // removed already: nothing to do
  const keep = elBranchKeeps(c, u.name);
  if(keep) return { kept: keep };
  const r = await removeClinicToBin(c.id);
  if(r.bin === false) return { kept: { why: 'bin' } };
  return { removed: true, queued: !r.ok };
}
const EL_KEEP = {
  visits: 'it has a logged visit',
  doctors: 'it has doctors',
  link: 'another ERP account is linked to it by hand:',
  account: 'another ERP account counts there:',
  bin: 'the recycle bin could not be reached — remove it from its clinic card once the connection is back',
  cloud: 'the clinic list did not load from the cloud on this device',
  rows: 'some sales files did not load on this device, so it could not be checked',
  check: 'it could not be checked',
};
function elUndoNote(u, br, now){
  const again = !!(u.before && now && now.status === u.before.status && (now.clinicId || null) === (u.before.clinicId || null));
  const acct = `<b dir="auto" style="overflow-wrap:anywhere;">${esc(u.name)}</b> ${elWhereHtml(now, again ? 'again' : 'now')}`;
  const bn = `<b dir="auto" style="overflow-wrap:anywhere;">${esc(u.branchName || '')}</b>`;
  let h = `↩️ <span>Undone</span> — `;
  if(br && br.removed){
    h += `<span>The new branch</span> ${bn} <span>${br.queued ? 'was removed on this device — the removal uploads when the connection is back.' : 'was removed (it is in the recycle bin).'}</span> ${acct}`;
  } else if(br && br.kept){
    const k = br.kept;
    h += `<span>The new branch</span> ${bn} <span>stays in the clinic list:</span> <span>${EL_KEEP[k.why] || EL_KEEP.check}</span>${k.account != null ? ` <b dir="auto" style="overflow-wrap:anywhere;">${esc(k.account)}</b>` : ''}. ${acct}`;
    if(elBranchStillTakes(u, now)) h += ` <span>${EL_TXT.stillTakes}</span>`;
    const still = elStillOthers(u);
    if(still.length) h += ` <span>These accounts still count differently because of the branch:</span> ${still.map(n => `<b dir="auto" style="overflow-wrap:anywhere;">${esc(n)}</b>`).join(', ')}.`;
  } else h += acct;
  return h;
}
// The branch the undone change made still takes the account (by its name, or as its group's landing branch).
function elBranchStillTakes(u, now){ return !!(u.branch && now && now.clinicId === u.branch && now.status !== 'hand' && now.status !== 'gone'); }
// Other accounts that the kept branch still makes count differently.
function elStillOthers(u){
  return (u.others || []).filter(o => { const x = erpLinkSideNow(o.name); return x && o.before && (x.status !== o.before.status || (x.clinicId || null) !== (o.before.clinicId || null)); }).map(o => o.name);
}
// The same as a toast, for a person who left the note's sheet: plain text (the
// Arabic patterns are in i18n.js), naming what Undo did to the new branch.
function elUndoToast(u, br, now){
  let t = `↩️ Undone — ${u.name}: ${elWhereText(now)}.`;
  const bn = u.branchName || u.name;
  if(br && br.removed) t += br.queued ? ` The new branch ${bn} was removed on this device — the removal uploads when the connection is back.` : ` The new branch ${bn} was removed (it is in the recycle bin).`;
  else if(br && br.kept){
    const k = br.kept;
    t += ` The new branch ${bn} stays in the clinic list: ${EL_KEEP[k.why] || EL_KEEP.check}${k.account != null ? ' ' + k.account : ''}.`;
    if(elBranchStillTakes(u, now)) t += ' ' + EL_TXT.stillTakes;
    const n = elStillOthers(u).length;
    if(n) t += ` Other accounts that still count differently because of the branch: ${n}.`;
  }
  return t;
}
function elReturn(note){ return elReturnTo(_el ? _el.back : _elListOpts.back, note); }
function elReturnTo(back, note){
  back = String(back || '');
  const list = () => openErpLinks(Object.assign({}, _elListOpts, { pickFor: null }), !!note); // the plain list, its search kept
  if(back.indexOf('recon:') === 0) openErpRecon(back.slice(6));
  else if(back.indexOf('clinic:') === 0){ const id = back.slice(7); if(clinics.some(c => c.id === id)) openClinicDetail(id); else list(); }
  else if(back === 'import') openErpImport();
  else if(back === 'links') list();
  else { closeModal(); return; }
  if(note) erpShowImportNote(note);
}
// Who changed which link, when, from what — the only trace that explains a
// figure that moved (erpMap has no backup). Appended after the link landed,
// in its own transaction; a failure is logged, never shown as a failed save.
// The log is one cloud document (at most 1 MiB) and an ERP cell can hold
// 32,767 characters: every text in an entry is bounded, and the newest
// entries are kept while the whole stays under EL_LOG_MAX characters — one
// long name can never stop the log from recording.
function erpLinkLog(name, from, to){
  const label = v => { if(v == null || String(v).charAt(0) === '@') return null; const c = erpLinkClinic(v); return c ? c.name : clinicNameOf(v); };
  const entry = { n: elLogName(name), f: elLogText(from), t: elLogText(to), fc: elLogText(label(from)), tc: elLogText(label(to)), by: elLogText(currentUser ? currentUser.name : null), at: Date.now() };
  const run = () => storageUpdate('erpMapLog', s => {
    const cur = UMCore.safeParse(s, null), list = [entry].concat(Array.isArray(cur) ? cur : []).slice(0, 300);
    let size = 2, keep = 0;
    for(const e of list){ const n = JSON.stringify(e).length + 1; if(keep && size + n > EL_LOG_MAX) break; size += n; keep++; }
    return JSON.stringify(list.slice(0, keep));
  }, 8000).then(v => { if(v == null) throw new Error('not written'); }).catch(e => console.warn('erpMapLog: the link is saved, the log entry is not', e));
  _elLogChain = _elLogChain.then(run, run);
  return _elLogChain;
}
const EL_LOG_TEXT = 300, EL_LOG_MAX = 200000;
function elLogText(v){ if(v == null) return null; v = String(v); return v.length > EL_LOG_TEXT ? v.slice(0, EL_LOG_TEXT - 1) + '…' : v; }
// An account's key in the log: its name, or past EL_LOG_TEXT its start and a
// hash of the whole name (FNV-1a), so two long names never share an entry.
function elLogName(name){
  name = String(name == null ? '' : name);
  if(name.length <= EL_LOG_TEXT) return name;
  let h = 0x811c9dc5;
  for(let i = 0; i < name.length; i++){ h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return name.slice(0, EL_LOG_TEXT - 12) + '… #' + h.toString(16).padStart(8, '0');
}
