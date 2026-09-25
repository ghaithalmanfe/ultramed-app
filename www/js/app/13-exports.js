// professional report, master report, PDF and XLSX export
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- PROFESSIONAL REPORT ----
let BENCHMARKS = {coverage:75, priority:90, conversion:25, tasks:85};
function periodLabel(){
  if(reportCustom) return `${fmtDate(reportCustom.from)} – ${fmtDate(reportCustom.to)}`;
  return reportRange===7?'This Week':reportRange===30?'This Month':reportRange===90?'This Quarter':'All Time';
}
function computeScoreForVisits(repName, visitList){ return UMCore.computeScoreForVisits(repName, visitList, clinics); }
function computePrevPeriodScore(repName){
  if(reportCustom){
    // Compare against the window of the same length immediately before "from".
    const len = daysBetween(reportCustom.from, reportCustom.to) + 1;
    const prevEnd = new Date(reportCustom.from+'T00:00:00'); prevEnd.setDate(prevEnd.getDate()-1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate()-len+1);
    const prevVisits = UMCore.filterVisitsByRange(visits, localDateStr(prevStart), localDateStr(prevEnd));
    return computeScoreForVisits(repName, prevVisits);
  }
  if(reportRange===9999) return null;
  // the window of the same length immediately before the current one
  const b = reportRangeBounds();
  const prevEnd = new Date(b.from+'T00:00:00'); prevEnd.setDate(prevEnd.getDate()-1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate()-(reportRange-1));
  const prevVisits = UMCore.filterVisitsByRange(visits, localDateStr(prevStart), localDateStr(prevEnd));
  return computeScoreForVisits(repName, prevVisits);
}
function buildNarrative(rep, s, prev){
  const overdue = clinics.filter(c=>c.rep===rep && c.cls!=='Closed' && followStatus(c.nextFollowUp)==='overdue').length;
  const repTasks = tasks.filter(t=>t.rep===rep);
  const tasksDone = repTasks.filter(t=>t.done).length;
  const taskPct = repTasks.length ? Math.round(tasksDone/repTasks.length*100) : 0;

  const metrics = [
    {key:'coverage', label:'Clinic coverage', val:s.coveragePct, target:BENCHMARKS.coverage,
      good:`Strong clinic coverage — ${s.covered} of ${s.assignedCount} assigned clinics visited (${s.coveragePct}%).`,
      opp:`Only ${s.covered} of ${s.assignedCount} assigned clinics were visited (${s.coveragePct}%, target ${BENCHMARKS.coverage}%).`,
      action:`Block time for the ${Math.max(s.assignedCount-s.covered,0)} clinic${Math.max(s.assignedCount-s.covered,0)===1?'':'s'} not yet visited this period — even a short check-in keeps the relationship active.`},
    {key:'priority', label:'Priority (A/B) coverage', val:s.priorityPct, target:BENCHMARKS.priority,
      good:`Excellent focus on top-tier accounts — ${s.priorityCovered} of ${s.priorityAssignedCount} A/B class clinics covered (${s.priorityPct}%).`,
      opp:`${s.priorityAssignedCount-s.priorityCovered} of the highest-value (A/B class) clinics went unvisited this period.`,
      action:`Prioritize A/B class clinics at the start of each week — they represent the highest-value accounts, so a missed visit there costs more than a missed visit elsewhere.`},
    {key:'conversion', label:'Conversion rate', val:s.conversion, target:BENCHMARKS.conversion,
      good:`High conversion — ${s.conversion}% of visits led to an order, generating ${money(s.revenue)}.`,
      opp:`${s.conversion}% of visits converted to an order (target ${BENCHMARKS.conversion}%).`,
      action:`Lead with a specific product or bundle recommendation rather than a general catalog walkthrough — a concrete ask converts better than open browsing.`},
    {key:'tasks', label:'Task completion', val:taskPct, target:BENCHMARKS.tasks,
      good:`Reliable follow-through — ${tasksDone} of ${repTasks.length} tasks completed (${taskPct}%).`,
      opp:`${repTasks.length-tasksDone} open tasks are still pending (${taskPct}% completion).`,
      action:`Clear open tasks at the start of each day before new ones pile on top.`},
  ];

  const strengths = metrics.filter(m=>m.val>=m.target).sort((a,b)=>(b.val-b.target)-(a.val-a.target));
  const opportunities = metrics.filter(m=>m.val<m.target).sort((a,b)=>(a.val-a.target)-(b.val-b.target));
  if(overdue===0){ strengths.unshift({label:'Follow-up discipline', good:`Zero overdue follow-ups — nothing is falling through the cracks.`}); }
  else{ opportunities.unshift({label:'Overdue follow-ups', opp:`${overdue} follow-up${overdue===1?' is':'s are'} currently overdue.`, action:`Clear these first — overdue follow-ups are the easiest lost deals to prevent.`}); }

  let headline;
  if(strengths.length){
    const top = strengths[0];
    headline = `This period, ${rep}'s standout strength is ${top.label.toLowerCase()} — ${top.good.charAt(0).toLowerCase()+top.good.slice(1)}`;
  } else {
    headline = `This is a rebuilding period for ${rep}. The numbers below point to exactly where a small shift in focus will pay off fastest.`;
  }

  let trendHtml = '';
  if(prev){
    const visitDelta = prev.visits ? Math.round((s.visits-prev.visits)/prev.visits*100) : (s.visits>0?100:0);
    const revDelta = prev.revenue ? Math.round((s.revenue-prev.revenue)/prev.revenue*100) : (s.revenue>0?100:0);
    if(s.visits>0 || prev.visits>0){
      const dir = visitDelta>=0 ? 'up' : 'down';
      const arrow = visitDelta>=0 ? '▲' : '▼';
      trendHtml = `<div class="pr-trend ${dir}">${arrow} Visits ${dir} ${Math.abs(visitDelta)}% vs. the previous period · Sales ${revDelta>=0?'up':'down'} ${Math.abs(revDelta)}%</div>`;
    }
  }

  return {headline, strengths, opportunities, trendHtml};
}
function prKpiGrid(s){
  return `<div class="pr-kpi-grid">
    <div class="pr-kpi"><div class="n">${s.visits}</div><div class="l">Visits</div></div>
    <div class="pr-kpi"><div class="n">${money(s.revenue)}</div><div class="l">Sales</div></div>
    <div class="pr-kpi"><div class="n">${s.conversion}%</div><div class="l">Conversion</div></div>
    <div class="pr-kpi"><div class="n">${s.coveragePct}%</div><div class="l">Coverage</div></div>
  </div>`;
}
function renderRepReportSection(rep){
  const s = computeRepScore(rep);
  const prev = computePrevPeriodScore(rep);
  const n = buildNarrative(rep, s, prev);
  return `
  <div class="pr-rep-section">
    <div class="pr-rep-head">
      <div class="stamp">${initials(rep)}</div>
      <div>
        <h2>${esc(rep)}</h2>
        <div class="sub">Sales Representative — ${periodLabel()}</div>
      </div>
    </div>
    ${prKpiGrid(s)}
    ${n.trendHtml}
    <div class="pr-headline">${n.headline}</div>

    <div class="pr-block-title">Strengths</div>
    ${n.strengths.length ? n.strengths.map(x=>`<div class="pr-list-item"><div class="pr-icon good">✓</div><div>${x.good}</div></div>`).join('') : `<div class="pr-list-item"><div class="pr-icon opp">!</div><div>No metric is above target yet this period — see growth opportunities below for where to focus.</div></div>`}

    <div class="pr-block-title">Growth opportunities</div>
    ${n.opportunities.length ? n.opportunities.map(x=>`<div class="pr-list-item"><div class="pr-icon opp">!</div><div>${x.opp}${x.action?`<div class="pr-action">→ ${x.action}</div>`:''}</div></div>`).join('') : `<div class="pr-list-item"><div class="pr-icon good">✓</div><div>Every tracked metric is at or above target this period — excellent, consistent work.</div></div>`}
  </div>`;
}
function renderProDoc(){
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US',{weekday:'long', year:'numeric', month:'long', day:'numeric'});
  const repsToShow = currentUser.role==='supervisor' ? REPS : [currentUser.name];
  let teamBox = '';
  if(currentUser.role==='supervisor'){
    const base = reportVisitsBase();
    const totalVisits = base.length;
    const totalRevenue = base.reduce((s,v)=>s+(v.orderTotal||0),0);
    const totalOrders = base.filter(v=>v.orderTaken).length;
    const totalOverdue = clinics.filter(c=>c.cls!=='Closed' && followStatus(c.nextFollowUp)==='overdue').length;
    teamBox = `<div class="pr-team-box">
      <div class="kpi-grid">
        <div class="kpi"><div class="n">${totalVisits}</div><div class="l">Team Visits</div></div>
        <div class="kpi"><div class="n">${money(totalRevenue)}</div><div class="l">Team Sales</div></div>
        <div class="kpi"><div class="n">${totalOrders}</div><div class="l">Orders Taken</div></div>
        <div class="kpi"><div class="n">${totalOverdue}</div><div class="l">Overdue (Team)</div></div>
      </div>
    </div>`;
  }
  document.getElementById('prDoc').innerHTML = `
    <div class="pr-letterhead">
      <div class="brand">UltraMed</div>
      <h1>Field Performance Report</h1>
      <div class="meta">${periodLabel()} · Generated ${dateStr}</div>
    </div>
    ${teamBox}
    ${(()=>{
      const b = reportRangeBounds();
      const coach = UMCore.coachInsights({ erpMtd: erpMtdMap(),from:b.from, to:b.to, today:todayStr(),
        repFilter: currentUser.role==='supervisor' ? 'all' : currentUser.name,
        visits, clinics, targets: blendedTargets(), dayPlans});
      const levLabel = {act:'DO NOW', watch:'WATCH', good:'WORKING'};
      const levColor = {act:'#C0392B', watch:'#B9770E', good:'#1E8449'};
      return `<div style="margin:18px 0;">
        <h2 style="font-size:15px; margin:0 0 8px;">Recommended actions</h2>
        ${coach.map(i=>`<div style="padding:8px 0; border-bottom:1px solid #eee; font-size:12.5px; line-height:1.55;">
          <strong>${i.icon} ${esc(i.title)}</strong>
          <span style="font-size:10px; font-weight:800; color:${levColor[i.level]}; letter-spacing:.05em;"> ${levLabel[i.level]}</span><br>
          ${esc(i.detail)}
        </div>`).join('')}
      </div>`;
    })()}
    ${(()=>{ // Top products discussed in this period — what the field is actually pitching
      const base = reportVisitsBase(); const counts = {};
      base.forEach(v=>(v.products||[]).forEach(pid=>{ counts[pid]=(counts[pid]||0)+1; }));
      const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
      return top.length?`<div style="margin:18px 0;">
        <h2 style="font-size:15px; margin:0 0 8px;">Top products discussed</h2>
        <table class="pr-tbl"><tr><th>Product</th><th>Times discussed</th></tr>
        ${top.map(([pid,n])=>`<tr><td>${esc(productName(pid))}</td><td>${n}</td></tr>`).join('')}</table>
      </div>`:'';
    })()}
    ${(()=>{ // ERP-verified figures when an imported sales period overlaps this report
      const b = reportRangeBounds();
      const p = erpPeriods().find(x=> b.from ? (x.to >= b.from && (!b.to || x.from <= b.to)) : true);
      if(!p) return '';
      const rec = UMCore.reconcileErp({rows: erpViewRows(p), visits, clinics, erpMap, repMap: p.repMap||{}, from: p.from, to: p.to});
      if(!rec.perRep.length) return '';
      return `<div style="margin:18px 0;">
        <h2 style="font-size:15px; margin:0 0 8px;">ERP-verified sales (${fmtDate(p.from)} – ${fmtDate(p.to)})</h2>
        <table class="pr-tbl"><tr><th>Rep</th><th>ERP net</th><th>Invoices</th><th>Returned</th><th>Visit→invoice link</th></tr>
        ${rec.perRep.map(r=>`<tr><td>${esc(r.rep)}</td><td>${money(r.erp.net)}</td><td>${r.erp.invoices}</td><td>${money(r.erp.returns)}</td><td>${r.linkagePct}%</td></tr>`).join('')}</table>
        <div style="color:#8a8a85; font-size:11.5px; margin-top:4px;">Source: EXceed ERP sales detail, reconciled against visits logged in UltraMed Field Ops.</div>
      </div>`;
    })()}
    ${repsToShow.map(renderRepReportSection).join('')}
    <div class="pr-footer">Prepared from live UltraMed Field Ops data · ${dateStr}</div>
  `;
}

// ---- REPORT FILE EXPORT: save & share without printing ----
// Collects the :root palette and every pr-/kpi-/stamp rule from the page's own
// stylesheet, so the exported file looks exactly like the on-screen document.
function collectReportCss(){
  let out = '';
  const want = sel => /\.pr|\.proreport|\.kpi|\.stamp/.test(sel) || sel.trim() === ':root';
  for(const sheet of document.styleSheets){
    let rules; try{ rules = sheet.cssRules; }catch(e){ continue; }
    if(!rules) continue;
    for(const r of rules){ if(r.selectorText && want(r.selectorText)) out += r.cssText + '\n'; }
  }
  return out;
}
function wrapReportDoc(title, bodyHtml){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{margin:0; padding:0; background:#fff; color:#1A1A18; font-family:'Avenir Next','Segoe UI',system-ui,-apple-system,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact;}
${collectReportCss()}
.proreport{display:block; background:#fff;}
@media print{ .pr-doc{padding:0;} }
</style></head><body><div class="proreport active"><div class="pr-doc">${bodyHtml}</div></div></body></html>`;
}
function reportFileName(prefix){
  const b = reportRangeBounds();
  const range = b.from ? `${b.from}_to_${b.to || todayStr()}` : 'all-time';
  return `${prefix}-${range}-${reportLang.toUpperCase()}${reportFormat==='summary'?'-1page':''}.html`;
}
// ==== MASTER MANAGEMENT REPORT (bilingual EN/AR, full + one-pager) ====
let reportLang = 'en';       // 'en' | 'ar'
let reportFormat = 'full';   // 'full' | 'summary'

const REPORT_I18N = {
en: {
  title:'Field Performance Report', brandName:'UltraMed', confidential:'Confidential — for internal management use only',
  preparedBy:'Prepared by', generated:'Generated', period:'Period', team:'Whole team',
  s_exec:'Executive summary', s_chart:'Sales week by week', s_targets:'Targets & month-end forecast',
  s_brands:'Brand performance', s_recon:'Visits ↔ invoices reconciliation', s_returns:'Returns analysis',
  s_coverage:'Field coverage', s_reco:'Recommendations', s_plan:'Plan for the coming period',
  rep:'Rep', target:'Target', achieved:'Achieved', pace:'Pace', forecast:'Month-end forecast', status:'Status',
  st_hit:'Target achieved', st_on:'On pace', st_behind:'Behind', brandCol:'Brand', invoiced:'Invoiced', ach:'Ach.',
  officialNote:'Achieved figures are the official DSR numbers where available; otherwise ERP invoices.',
  linkage:'Visit→invoice linkage', matched:'Visited & invoiced', pipeline:'Visited, awaiting invoice',
  noVisit:'Invoiced with no logged visit', retTotal:'Total returned', retCount:'return lines',
  s_foc:'Free goods — deal bonuses & samples', s_activity:'Team activity — field & contact',
  focItemsGiven:'Items given', focUnits:'units', focValueLbl:'Value at gross price',
  focDealHead:'Deal bonuses (buy X, get Y free)', focSampleHead:'Samples & marketing (no sale attached)',
  focDealExplain:'Free units that were part of a paid invoice — the customer bought, and these came with the deal. A cost of the sale, not a giveaway.',
  focSampleExplain:'Free units on an all-free document or under a marketing brand — a marketing investment given without a sale.',
  focNoDeal:'No deal bonuses in this period.', focNoSample:'No samples or marketing goods in this period.',
  colCalls:'Calls / contact', colFollowOrders:'Orders logged (follow-up)', colErpSales:'Sales (ERP)',
  capActivity:(w)=>`Every rep's field work in ${w}: real visits, phone/remote contact, doctors met, and orders they logged for follow-up. Sales come only from the uploaded ERP files.`,
  actNote:'“Orders logged” is what reps note during a visit for follow-up — it is NOT the sales figure. Official sales are the “Sales (ERP)” column, from the files the supervisor uploads.',
  execNoErp:'No ERP/DSR sales file has been uploaded for this period yet — sales figures below await the upload. Field activity is shown in full.',
  awaitErp:'awaiting ERP upload', st_await:'Awaiting ERP', kAwaitErp:'Sales — awaiting ERP',
  focTotal:'Given out free',
  focNote:'Lines filed under a Marketing brand/account, plus invoice lines shipped with quantity but zero net (bonus goods).',
  colClinic:'Clinic / customer', colProduct:'Product', colDate:'Date', colQty:'Qty', colValue:'Value',
  colReason:'Justification', colModel:'Working model',
  s_buyers:'Accounts with & without sales', boughtLbl:'Accounts that bought', notBoughtLbl:'No sales yet', colInv:'Invoices',
  capTargets:'Official monthly target vs achieved sales for each rep, with pace and month-end forecast.',
  capBuyers:(w)=>`Every account with at least one invoice in the sales files — ${w}.`,
  capNonBuyers:(w)=>`Active accounts with no invoice yet — ${w} — with the working model and the reason recorded per clinic.`,
  capRetDetail:(w)=>`Each returned item in the period ${w}: which clinic returned it, when, its value, and the recorded justification.`,
  capRetBrand:'Total returned value grouped by brand (top 5).',
  capRetCust:'Total returned value grouped by clinic (top 5).',
  capFoc:(w)=>`Goods issued without revenue in the period ${w} — marketing-brand lines and zero-net bonus lines — with the clinic that received them and the justification.`,
  capRecon:'How well the logged visits explain the invoices: matched sales, visits awaiting an invoice, and invoices with no logged visit.',
  capCov:(w)=>`Every active clinic NOT visited between ${w}, with its last visit ever and why it needs attention.`,
  retValueCol:'Returned value', contLabel:'(continued)', colType:'Type',
  focDealLbl:'Bonus within deals', focSampleLbl:'Samples & marketing',
  focDealPill:'Deal bonus', focSamplePill:'Sample',
  rxModel:'Prescription model', directModel:'Direct sales', reasonedLbl:'Reasons recorded',
  buyersNote:'Prescription-model clinics create pharmacy demand even without direct invoices — a recorded reason turns every quiet account into a plan, not a problem.',
  byBrand:'By brand', byCustomer:'By customer', covered:'Clinics covered', needVisit:'Not visited this period',
  covRecon:(v,n,t)=>`${v} visited + ${n} not visited = ${t} active clinics — every clinic is accounted for.`,
  covLast:'Last visit', covWhy:'Priority', covNever:'never',
  covReason:{'overdue':'Follow-up overdue','due-today':'Follow-up due today','missed-plan':'Planned but missed','never-visited':'Never visited','dormant':'Quiet 30+ days','due-soon':'Follow-up this week','not-covered':'Not in this window'},
  overdue:'Overdue follow-ups', doNow:'Immediate action', watch:'Monitor', working:'Performing well',
  planIntro:'Auto-drafted from the most urgent findings — edit in the meeting and assign owners:',
  noData:'No data available for this period.', kd:'KD', week:'Week', total:'Total',
  kVisits:'Field visits', kSales:'Achieved sales', ofTarget:'of target', kSalesLogged:'Sales (logged)', kCoverage:'Coverage', kReturns:'Returned', retDocs:'return invoices', kContacts:'Contacts seen',
  execTeam:(ach,goal,pct,fc)=>`The team has delivered <b>${ach}</b> of the <b>${goal}</b> monthly target (<b>${pct}%</b>). At the current pace the month is projected to close at <b>${fc}</b>.`,
  execStar:(rep,amt)=>`Standout performer: <b>${rep}</b> with ${amt}.`,
  execRisk:(txt)=>`Main risk to address: ${txt}`,
},
ar: {
  title:'تقرير الأداء الميداني', brandName:'ألترا ميد — UltraMed', confidential:'سرّي — للاستخدام الإداري الداخلي فقط',
  preparedBy:'إعداد', generated:'تاريخ الإصدار', period:'الفترة', team:'كامل الفريق',
  s_exec:'الملخص التنفيذي', s_chart:'المبيعات أسبوعاً بأسبوع', s_targets:'الأهداف وتوقع نهاية الشهر',
  s_brands:'أداء البراندات', s_recon:'مطابقة الزيارات مع الفواتير', s_returns:'تحليل المرتجعات',
  s_coverage:'التغطية الميدانية', s_reco:'التوصيات', s_plan:'خطة الفترة القادمة',
  rep:'المندوبة', target:'الهدف', achieved:'المحقق', pace:'الوتيرة', forecast:'توقع نهاية الشهر', status:'الحالة',
  st_hit:'تم تحقيق الهدف', st_on:'ضمن الوتيرة', st_behind:'دون الوتيرة', brandCol:'البراند', invoiced:'المفوتر', ach:'التحقيق',
  officialNote:'أرقام المحقق هي الأرقام الرسمية من ملف DSR حيثما توفرت، وإلا فمن فواتير ERP.',
  linkage:'ربط الزيارات بالفواتير', matched:'زارت وفوترت', pipeline:'زارت وتنتظر الفاتورة',
  noVisit:'فواتير بدون زيارة مسجلة', retTotal:'إجمالي المرتجع', retCount:'سطر مرتجعات',
  s_foc:'البضاعة المجانية — بونص الصفقات والعينات', s_activity:'نشاط الفريق — الميداني والتواصل',
  focItemsGiven:'الكمية الموزعة', focUnits:'وحدة', focValueLbl:'قيمتها بسعر البيع',
  focDealHead:'بونص الصفقات (اشترِ X واحصل على Y مجاناً)', focSampleHead:'عينات وماركتنغ (بلا بيع مرتبط)',
  focDealExplain:'وحدات مجانية ضمن فاتورة مدفوعة — العميل اشترى، وهذه جاءت مع الصفقة. تكلفة بيع، وليست هدية.',
  focSampleExplain:'وحدات مجانية على مستند كله مجاني أو تحت براند الماركتنغ — استثمار تسويقي دون بيع مقابل.',
  focNoDeal:'لا بونص صفقات في هذه الفترة.', focNoSample:'لا عينات أو بضاعة ماركتنغ في هذه الفترة.',
  colCalls:'مكالمات / تواصل', colFollowOrders:'أوردرات مسجّلة (متابعة)', colErpSales:'المبيعات (ERP)',
  capActivity:(w)=>`عمل كل مندوبة الميداني في ${w}: الزيارات الفعلية، التواصل الهاتفي، الأطباء المقابَلون، والأوردرات المسجّلة للمتابعة. المبيعات من ملفات ERP المرفوعة فقط.`,
  actNote:'«الأوردرات المسجّلة» هي ما تدوّنه المندوبة أثناء الزيارة لغرض المتابعة — وهي ليست رقم المبيعات. المبيعات الرسمية في عمود «المبيعات (ERP)» من الملفات التي يرفعها المشرف.',
  execNoErp:'لم يُرفع ملف مبيعات ERP/DSR لهذه الفترة بعد — أرقام المبيعات أدناه بانتظار الرفع. النشاط الميداني معروض بالكامل.',
  awaitErp:'بانتظار رفع ERP', st_await:'بانتظار ERP', kAwaitErp:'المبيعات — بانتظار ERP',
  focTotal:'الكمية الموزعة مجاناً',
  focNote:'السطور المسجلة تحت براند/حساب الماركتنغ، وسطور الفواتير التي خرجت بكمية وصافي صفر (بضاعة مجانية).',
  colClinic:'العيادة / العميل', colProduct:'المنتج', colDate:'التاريخ', colQty:'الكمية', colValue:'القيمة',
  colReason:'المبرر / السبب', colModel:'طريقة التعامل',
  s_buyers:'الحسابات المشترية وغير المشترية', boughtLbl:'حسابات اشترت', notBoughtLbl:'بدون مبيعات بعد', colInv:'عدد الفواتير',
  capTargets:'الهدف الشهري الرسمي مقابل المبيعات المحققة لكل مندوبة، مع الوتيرة وتوقع نهاية الشهر.',
  capBuyers:(w)=>`كل حساب لديه فاتورة واحدة على الأقل في ملفات المبيعات — ${w}.`,
  capNonBuyers:(w)=>`الحسابات النشطة بلا فواتير بعد — ${w} — مع طريقة التعامل والسبب المسجل لكل عيادة.`,
  capRetDetail:(w)=>`كل صنف مرتجع في الفترة ${w}: العيادة التي أرجعته، التاريخ، القيمة، والمبرر المسجل.`,
  capRetBrand:'إجمالي قيمة المرتجعات حسب البراند (أعلى 5).',
  capRetCust:'إجمالي قيمة المرتجعات حسب العيادة (أعلى 5).',
  capFoc:(w)=>`البضاعة الصادرة دون إيراد في الفترة ${w} — سطور براند الماركتنغ والبونص بصافي صفر — مع العيادة المستلمة والمبرر.`,
  capRecon:'مدى تفسير الزيارات المسجلة للفواتير: مبيعات مطابقة، زيارات تنتظر فاتورة، وفواتير بلا زيارة مسجلة.',
  capCov:(w)=>`كل عيادة نشطة لم تُزَر بين ${w}، مع آخر زيارة لها على الإطلاق وسبب حاجتها للمتابعة.`,
  retValueCol:'قيمة المرتجع', contLabel:'(تكملة)', colType:'النوع',
  focDealLbl:'بونص ضمن صفقات', focSampleLbl:'عينات وماركتنغ',
  focDealPill:'بونص صفقة', focSamplePill:'عينة',
  rxModel:'نظام وصفات ℞', directModel:'بيع مباشر', reasonedLbl:'أسباب مسجلة',
  buyersNote:'عيادات نظام الوصفات تصنع طلباً في الصيدليات حتى بدون فواتير مباشرة — وتسجيل السبب يحوّل كل حساب هادئ إلى خطة عمل، لا مشكلة.',
  byBrand:'حسب البراند', byCustomer:'حسب العميل', covered:'عيادات مغطاة', needVisit:'لم تُزَر هذه الفترة',
  covRecon:(v,n,t)=>`${v} مُزارة + ${n} غير مُزارة = ${t} عيادة نشطة — كل عيادة محسوبة.`,
  covLast:'آخر زيارة', covWhy:'الأولوية', covNever:'لم تُزَر أبداً',
  covReason:{'overdue':'متابعة متأخرة','due-today':'متابعة اليوم','missed-plan':'مخططة ولم تتم','never-visited':'لم تُزَر أبداً','dormant':'هادئة +30 يوم','due-soon':'متابعة هذا الأسبوع','not-covered':'خارج هذه الفترة'},
  overdue:'متابعات متأخرة', doNow:'أولوية فورية', watch:'قيد المتابعة', working:'أداء جيد',
  planIntro:'مسودة آلية من أكثر النتائج إلحاحاً — تُناقش في الاجتماع ويُحدد مسؤول لكل بند:',
  noData:'لا تتوفر بيانات لهذه الفترة.', kd:'د.ك', week:'الأسبوع', total:'الإجمالي',
  kVisits:'زيارات ميدانية', kSales:'المبيعات المحققة', ofTarget:'من التارغت', kSalesLogged:'المبيعات المسجلة', kCoverage:'التغطية', kReturns:'المرتجع', retDocs:'فاتورة مرتجع', kContacts:'جهات اتصال',
  execTeam:(ach,goal,pct,fc)=>`حقق الفريق <b>${ach}</b> من الهدف الشهري البالغ <b>${goal}</b> (بنسبة <b>${pct}%</b>). وبالوتيرة الحالية يُتوقع إقفال الشهر عند <b>${fc}</b>.`,
  execStar:(rep,amt)=>`الأداء الأبرز: <b>${rep}</b> بمبيعات ${amt}.`,
  execRisk:(txt)=>`أهم خطر يجب معالجته: ${txt}`,
},
};
function mrMoney(n, lang){
  const v = (Math.round((n||0)*100)/100).toFixed(2);
  return lang==='ar' ? `<span class="num">${v}</span> د.ك` : `${v} KD`;
}
// Localized coach sentences rebuilt from each insight's structured data.
// Administrative register on purpose: recommendations are phrased impersonally
// (يُوصى بـ / يُقترح) with no gendered or direct-address imperatives, so the
// report reads professionally in front of management.
const AR_COACH = {
  followups: d=>`${d.count} متابعة متأخرة (${(d.names||[]).join('، ')}) — يُوصى بجدولتها أولاً؛ الزيارة الموعودة أقرب فرصة بيع.`,
  dormant: d=>`${d.count} عيادة مهمة بلا نشاط لأكثر من 30 يوماً (${(d.names||[]).join('، ')}) — يُوصى بإدراجها في خطة الأسبوع.`,
  missed: d=>`${d.count} زيارة مخططة لم تُنفَّذ خلال آخر أسبوعين — يُوصى بإعادة جدولتها.`,
  target: d=> d.state==='hit' ? `${d.rep}: تم تحقيق الهدف الشهري (${d.mtd.toFixed(2)} من ${d.goal.toFixed(2)} د.ك) — فرصة مناسبة للتوسع في منتجات جديدة.`
    : d.state==='behind' ? `${d.rep}: الإنجاز دون الهدف (${d.mtd.toFixed(2)} من ${d.goal.toFixed(2)} د.ك) — المطلوب ≈${d.perDay} د.ك يومياً لبقية ${d.daysLeft} يوماً.`
    : `${d.rep}: الأداء ضمن وتيرة الهدف (${d.mtd.toFixed(2)} من ${d.goal.toFixed(2)} د.ك) — يُوصى بالحفاظ على الإيقاع الحالي.`,
  conversion: d=> d.state==='low' ? `نسبة التحويل منخفضة: ${d.pct}% فقط من الزيارات تنتهي بطلب — يُوصى بمراجعة أدلة البيع وطرح الطلب قبل مغادرة العيادة.`
    : `نسبة تحويل قوية: ${d.pct}% من الزيارات بطلب — التوسع في عدد الزيارات هو أسرع مسار للنمو.`,
  contacts: d=> d.state==='low' ? `متوسط ${d.perVisit} جهة اتصال للزيارة — يُوصى باستهداف طبيبين أو أكثر في كل عيادة؛ كل طبيب إضافي عميل محتمل دون تكلفة.`
    : `تغطية ممتازة: ${d.perVisit} جهة اتصال في الزيارة الواحدة.`,
  stuck: d=>`${d.count} عيادة تمت زيارتها 3 مرات أو أكثر دون أي طلب (${(d.names||[]).join('، ')}) — يُوصى بتغيير أسلوب العرض أو ترتيب زيارة مشتركة.`,
  concentration: d=>`${d.share}% من المبيعات من عميل واحد (${d.name}) — يُوصى بتنمية 2–3 حسابات إضافية لتوزيع المخاطر.`,
  jointcoach: d=>`${d.top} بنسبة إغلاق ${d.topPct}% مقابل ${d.lowPct}% لدى ${d.low} — يُوصى بترتيب زيارات مشتركة لنقل الخبرة مباشرة.`,
  allgood: ()=>`لا مؤشرات خطر في هذه الفترة — يُوصى بالحفاظ على الإيقاع الحالي مع زيادة عدد الزيارات وجهات الاتصال.`,
};
function mrCoachText(i, lang){
  if(lang !== 'ar') return i.title + (i.detail ? ' — ' + i.detail : '');
  const k = i.key && i.key.indexOf('target-') === 0 ? 'target' : i.key;
  const f = AR_COACH[k];
  return f ? f(i.data || {}) : (i.title + (i.detail ? ' — ' + i.detail : ''));
}
const MASTER_REPORT_CSS = `
.mr-doc{max-width:780px; margin:0 auto; padding:26px 26px 60px; background:#fff; color:#1C231E;
  font-family:'Avenir Next','Segoe UI','SF Arabic','Noto Kufi Arabic',Tahoma,system-ui,sans-serif; font-size:13.5px; line-height:1.7;}
.mr-doc .num{direction:ltr; unicode-bidi:embed;}
.mr-doc.mr-pdf{padding:0; max-width:none;}
.mr-block{margin:0 0 24px;}
.mr-brandbar{display:flex; align-items:center; justify-content:space-between; gap:14px; padding:2px 4px 12px;}
.mr-brandbar img{height:34px; width:auto;}
.mr-brandbar .tb{font-size:10px; font-weight:800; letter-spacing:.18em; color:#0B3D22;}
.mr-cover{background:linear-gradient(135deg,#0B3D22 0%,#11512E 55%,#17663A 100%); color:#fff;
  border-radius:16px; padding:30px 26px 20px; text-align:center; margin:0 0 26px;}
.mr-cover .b{font-size:11.5px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:#9FD8B4;}
.mr-cover h1{font-family:Georgia,'Times New Roman',serif; font-size:29px; margin:8px 0 6px; color:#fff;}
.mr-cover .meta{color:#CFE7D6; font-size:12.5px;}
.mr-cover-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:18px;}
@media (max-width:560px){ .mr-cover-kpis{grid-template-columns:repeat(2,1fr);} .mr-kpis{grid-template-columns:repeat(2,1fr);} }
.mr-cover-kpis .ck{background:rgba(255,255,255,.13); border:1px solid rgba(255,255,255,.16); border-radius:11px; padding:10px 6px;}
.mr-cover-kpis .n{font-size:15.5px; font-weight:800; color:#fff; white-space:nowrap;}
.mr-cover-kpis .l{font-size:10px; color:#CFE7D6; margin-top:2px; line-height:1.35;}
.mr-conf{font-size:10px; color:#9CC7AA; letter-spacing:.06em; margin-top:14px; text-transform:uppercase;}
.mr-sec{margin:0 0 10px; display:flex; align-items:center; gap:10px; border-bottom:2px solid #E3EBE4; padding-bottom:7px; page-break-after:avoid; break-after:avoid;}
.mr-sec .no{font-family:Georgia,serif; font-size:12.5px; color:#fff; background:#0B3D22; font-weight:700;
  min-width:24px; height:24px; line-height:24px; text-align:center; border-radius:7px; flex-shrink:0;}
.mr-sec h2{font-family:Georgia,serif; font-size:17.5px; margin:0; color:#12241A;}
.mr-exec{background:#F4F7F4; border-inline-start:4px solid #0B3D22; border-radius:8px; padding:14px 18px; font-size:14px;}
.mr-tbl{width:100%; border-collapse:collapse; font-size:12.5px; margin:8px 0 4px;}
.mr-tbl th{background:#0B3D22; color:#EAF3EC; font-weight:700; text-align:start; padding:8px 10px; border:1px solid #0B3D22; font-size:11.5px; line-height:1.45;}
.mr-tbl td{padding:7px 10px; border:1px solid #E7EBE7; vertical-align:top;}
.mr-tbl tbody tr:nth-child(even) td{background:#F5F8F5;}
.mr-tbl thead{display:table-header-group;}
.mr-pill{display:inline-block; border-radius:999px; padding:1px 10px; font-size:11px; font-weight:700; white-space:nowrap;}
.mr-pill.g{background:#DFF1E4; color:#186A3B;} .mr-pill.o{background:#FBEDD3; color:#8A5A00;} .mr-pill.r{background:#FADDD7; color:#A93226;}
.mr-note{color:#7C877E; font-size:11.5px; margin:4px 0 0;}
.mr-cap{color:#41564A; font-size:11.5px; font-weight:600; margin:10px 0 2px; padding-inline-start:8px; border-inline-start:3px solid #9FD8B4;}
.mr-reco{border:1px solid #E7EBE7; border-radius:10px; padding:10px 14px; margin-bottom:8px; font-size:13px; background:#FDFEFD;}
.mr-reco.act{border-inline-start:4px solid #C0392B;} .mr-reco.watch{border-inline-start:4px solid #B9770E;} .mr-reco.good{border-inline-start:4px solid #1E8449;}
.mr-reco .lv{font-size:10px; font-weight:800; letter-spacing:.06em; text-transform:uppercase;}
.mr-reco.act .lv{color:#C0392B;} .mr-reco.watch .lv{color:#B9770E;} .mr-reco.good .lv{color:#1E8449;}
.mr-plan li{margin-bottom:7px;}
.mr-chart{direction:ltr;}
.mr-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:10px 0;}
.mr-kpi{background:#F4F7F4; border-radius:10px; padding:12px 8px; text-align:center; border:1px solid #E3EBE4;}
.mr-kpi .n{font-size:18px; font-weight:800; color:#0B3D22;}
.mr-kpi .l{font-size:10.5px; color:#6E7A70; margin-top:2px;}
.mr-foot{margin-top:30px; border-top:2px solid #0B3D22; padding-top:10px; color:#8A948C; font-size:11px; display:flex; justify-content:space-between; gap:10px;}
h3.mr-rep{font-size:14px; margin:12px 0 4px;}
@media print{
  @page{size:A4; margin:12mm;}
  .mr-doc{padding:0; max-width:none;}
  .mr-block{break-inside:avoid; page-break-inside:avoid;}
  .mr-block.long{break-inside:auto; page-break-inside:auto;}
  .mr-sec{page-break-after:avoid;}
  .mr-tbl tr{break-inside:avoid; page-break-inside:avoid;}
  .mr-cover{border-radius:12px; -webkit-print-color-adjust:exact; print-color-adjust:exact;}
}
`;
function mrChartSvg(trend, lang){
  if(!trend.length) return '';
  const repsList = [...new Set(trend.flatMap(w=>Object.keys(w.byRep)))].sort();
  if(!repsList.length) return '';
  const colors = ['#0B3D22','#C98A1E','#5E5CE6','#A93226'];
  const W=660, H=230, padL=46, padB=34, padT=16;
  const max = Math.max(1, ...trend.map(w=>Math.max(...repsList.map(r=>w.byRep[r]||0))));
  const iw = (W-padL-10)/trend.length;
  const bw = Math.min(26, (iw-14)/repsList.length);
  let bars='', labels='', grid='';
  for(let g=0; g<=3; g++){
    const val = max*g/3, y = H-padB-(H-padB-padT)*g/3;
    grid += `<line x1="${padL}" y1="${y}" x2="${W-6}" y2="${y}" stroke="#E7EBE7"/>`+
      `<text x="${padL-6}" y="${y+4}" font-size="9" fill="#8A948C" text-anchor="end">${Math.round(val)}</text>`;
  }
  trend.forEach((w,i)=>{
    const x0 = padL + i*iw + (iw - bw*repsList.length)/2;
    repsList.forEach((r,j)=>{
      const v = w.byRep[r]||0;
      const h = Math.max(0, (H-padB-padT)*v/max);
      bars += `<rect x="${x0+j*bw}" y="${H-padB-h}" width="${bw-3}" height="${h}" rx="2" fill="${colors[j%colors.length]}"/>`;
    });
    const lbl = w.from.slice(8,10)+'/'+w.from.slice(5,7);
    labels += `<text x="${padL+i*iw+iw/2}" y="${H-padB+14}" font-size="9.5" fill="#6E7A70" text-anchor="middle">${lbl}</text>`;
  });
  const legend = repsList.map((r,j)=>`<rect x="${padL+j*110}" y="${H-10}" width="9" height="9" rx="2" fill="${colors[j%colors.length]}"/><text x="${padL+j*110+13}" y="${H-2}" font-size="10" fill="#3C4A40">${esc(r)}</text>`).join('');
  return `<div class="mr-chart"><svg viewBox="0 0 ${W} ${H+6}" style="width:100%; height:auto;">${grid}${bars}${labels}${legend}</svg></div>`;
}
function buildMasterReportBody(lang, format){
  const L = REPORT_I18N[lang] || REPORT_I18N.en;
  const rtl = lang === 'ar';
  const b = reportRangeBounds();
  const today = todayStr();
  const m = getMonthDates(today);
  const daysInMonth = m.length;
  const repFilter = currentUser.role === 'supervisor' ? reportRepFilter : currentUser.name;
  const repsList = repFilter === 'all' ? REPS.slice() : [repFilter];
  // Per-rep sales files live as SEPARATE overlapping periods (Mariam's and
  // Renova's uploads), so every period touching the range must be merged —
  // picking one period silently dropped the other rep's invoices from the
  // whole report. Import-time overlap absorption already dedupes rows per
  // salesman, so concatenating here cannot double-count.
  const ps = erpPeriods().filter(x => b.from ? (x.to >= b.from && (!b.to || x.from <= b.to)) : true);
  const repMapAll = {};
  let allRows = [];
  ps.forEach(x => { Object.assign(repMapAll, x.repMap || {}); allRows = allRows.concat(erpViewRows(x)); });
  // Canonical sales set — the SAME rule every other figure uses, so the cover
  // headline, returns, FOC, and trend all agree with the buyers list and the
  // per-rep month-to-date numbers:
  //   • territory attribution (sales credited to the clinic's owner rep, not
  //     whoever's name is on the invoice), and
  //   • clinic sales only (online/channel accounts and supervisor-ignored
  //     customers excluded).
  // The old salesman-based sum over raw rows double-counted channel revenue and
  // mis-credited territory sales, so the big cover number came out too high.
  const rows = allRows.filter(r => {
    if(!UMCore.inRange(r.date, b.from, b.to)) return false;
    const mc = UMCore.matchCustomer((r.customer||'').trim(), clinics, erpMap);
    if(mc.ignored || mc.channel) return false;
    const rrep = UMCore.erpRowRep(r, clinics, erpMap, repMapAll);
    if(!rrep) return false;
    if(repFilter !== 'all' && rrep !== repFilter) return false;
    return true;
  });
  const psFrom = ps.length ? ps.map(x=>x.from).sort()[0] : null;
  const psTo = ps.length ? ps.map(x=>x.to).sort().slice(-1)[0] : null;
  // Reconcile over the REPORT window (clamped to the uploaded data span), so
  // the linkage table matches the period in the header and every other section.
  const recFrom = b.from ? (psFrom && psFrom > b.from ? psFrom : b.from) : psFrom;
  const recTo = b.to ? (psTo && psTo < b.to ? psTo : b.to) : psTo;
  const rec = ps.length ? UMCore.reconcileErp({rows: allRows, visits, clinics, erpMap, repMap: repMapAll, from: recFrom, to: recTo, isExchange: isExchangeLine}) : null;
  const trend = ps.length ? UMCore.erpWeeklyTrend(rows, repMapAll) : [];
  const coach = UMCore.coachInsights({ erpMtd: erpMtdMap(),from: b.from, to: b.to, today, repFilter, visits, clinics, targets: blendedTargets(), dayPlans});
  const cov = UMCore.clinicCoverage({from: b.from || m[0], to: b.to || today, today, repFilter, visits, clinics, dayPlans});
  const returns = UMCore.returnsAnalysis(rows, {clinics, erpMap, isExchange: isExchangeLine}); // branches unified; exchanges excluded
  const dateStr = new Date().toLocaleDateString(rtl ? 'ar' : 'en-US', {year:'numeric', month:'long', day:'numeric'});
  const AR_PERIODS = {'This Week':'هذا الأسبوع','This Month':'هذا الشهر','This Quarter':'هذا الربع','All Time':'كل الفترة'};
  const periodTxt = rtl ? (AR_PERIODS[periodLabel()] || periodLabel()) : periodLabel();
  // Every table carries a caption saying exactly WHAT it shows and for WHICH
  // dates — a table that continues onto another PDF page must still be
  // identifiable on its own.
  const winTxt = (b.from || b.to) ? `${b.from?fmtDate(b.from):'…'} – ${b.to?fmtDate(b.to):fmtDate(today)}` : (rtl?'كل الفترة':'all time');
  const cap = t => `<div class="mr-cap">${t}</div>`;
  let secNo = 0;
  // Each numbered section renders as a self-contained .mr-block so both the
  // PDF paginator and the browser's print engine keep a heading glued to its
  // content instead of splitting them across pages.
  const secHead = (title) => `<div class="mr-sec"><span class="no">${(++secNo)}</span><h2>${title}</h2></div>`;
  const block = (title, inner, cls) => `<section class="mr-block${cls?' '+cls:''}">${secHead(title)}${inner}</section>`;
  const contBlock = (inner) => `<section class="mr-block">${inner}</section>`;

  // Per-rep target math, shared by exec summary and the targets table.
  const tstats = repsList.map(rep => {
    const t = targets[rep] || {};
    if(!(t.revenue > 0)) return null;
    const bm = officialRevenue(rep);
    if(!bm.has) return { rep, goal: t.revenue, ach: null, src: null, fc: null, pace: null, state: 'nodata' };
    // Pace/forecast run on WORKING days (Sun–Thu) at the winning source's
    // as-of day, so a mid-month upload isn't measured against the calendar.
    const mStart = today.slice(0,7) + '-01';
    const monthEnd = today.slice(0,7) + '-' + String(daysInMonth).padStart(2,'0');
    const totalWork = UMCore.workingDaysBetween(mStart, monthEnd);
    const worked = Math.max(1, UMCore.workingDaysBetween(mStart, bm.asOf || today));
    const fc = Math.round(bm.amount / worked * totalWork * 100) / 100;
    const pace = Math.round(bm.amount / (t.revenue * worked / totalWork) * 100);
    const state = bm.amount >= t.revenue ? 'hit' : pace >= 90 ? 'on' : 'behind';
    return { rep, goal: t.revenue, ach: bm.amount, src: bm.src, fc, pace, state };
  }).filter(Boolean);

  // Team sums across every rep in scope — the report must always show the
  // COMBINED number for both reps, not just per-rep lines.
  const goalSum = tstats.reduce((s,x)=>s+x.goal,0), achSum = tstats.reduce((s,x)=>s+(x.ach||0),0), fcSum = tstats.reduce((s,x)=>s+(x.fc||0),0);
  const anyOfficial = tstats.some(x=>x.ach!=null);

  // 1 — executive summary
  let exec = '';
  if(tstats.length && anyOfficial){
    exec += `<p style="margin:0 0 6px;">${L.execTeam(mrMoney(achSum,lang), mrMoney(goalSum,lang), goalSum?Math.round(achSum/goalSum*100):0, mrMoney(fcSum,lang))}</p>`;
    const star = tstats.slice().filter(x=>x.ach!=null).sort((a,b)=>b.ach-a.ach)[0];
    if(star && star.ach > 0) exec += `<p style="margin:0 0 6px;">${L.execStar(esc(star.rep), mrMoney(star.ach,lang))}</p>`;
  } else if(tstats.length){
    exec += `<p style="margin:0 0 6px;">${L.execNoErp}</p>`;
  }
  const risk = coach.find(i=>i.level==='act');
  if(risk) exec += `<p style="margin:0;">${L.execRisk(esc(mrCoachText(risk, lang)))}</p>`;
  if(!exec) exec = `<p style="margin:0;">${L.noData}</p>`;

  const targetsTbl = tstats.length ? `${cap(L.capTargets)}<table class="mr-tbl"><thead><tr><th>${L.rep}</th><th>${L.target}</th><th>${L.achieved}</th><th>${L.pace}</th><th>${L.forecast}</th><th>${L.status}</th></tr></thead><tbody>
    ${tstats.map(x=>x.ach==null
      ? `<tr><td><b>${esc(x.rep)}</b></td><td>${mrMoney(x.goal,lang)}</td><td colspan="3"><span class="mr-note">${L.awaitErp}</span></td><td><span class="mr-pill o">${L.st_await}</span></td></tr>`
      : `<tr><td><b>${esc(x.rep)}</b></td><td>${mrMoney(x.goal,lang)}</td><td>${mrMoney(x.ach,lang)} <span class="mr-note num">${esc(x.src||'')}</span></td><td><span class="num">${x.pace}%</span></td><td>${mrMoney(x.fc,lang)}</td>
      <td><span class="mr-pill ${x.state==='hit'?'g':x.state==='on'?'g':'r'}">${x.state==='hit'?L.st_hit:x.state==='on'?L.st_on:L.st_behind}</span></td></tr>`).join('')}
    ${tstats.length>1&&anyOfficial?`<tr style="border-top:2px solid #022917;"><td><b>${L.total}</b></td><td><b>${mrMoney(goalSum,lang)}</b></td><td><b>${mrMoney(achSum,lang)}</b></td><td><span class="num"><b>${goalSum?Math.round(achSum/goalSum*100):0}%</b></span></td><td><b>${mrMoney(fcSum,lang)}</b></td><td></td></tr>`:''}
    </tbody></table><div class="mr-note">${L.officialNote}</div>` : `<p class="mr-note">${L.noData}</p>`;

  const brandParts = repsList.map(rep=>{
    const t = targets[rep]||{}; const bt = t.brands||{}; const ab = t.achievedBrands||{};
    const items = Object.entries(bt).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    if(!items.length) return '';
    // Freshest uploaded source per rep: the DSR's official brand MTD while it
    // is newest, the weekly sales invoices once they overtake it.
    const eb = erpBrandMtd(rep);
    const officialFresh = Object.keys(ab).length > 0 && (t.achievedAsOf||'') >= (eb.asOf||'');
    return `<h3 class="mr-rep">${esc(rep)}</h3><table class="mr-tbl">
      <thead><tr><th>${L.brandCol}</th><th>${L.target}</th><th>${L.achieved}</th><th>${L.ach}</th></tr></thead><tbody>
      ${items.map(([br,tg])=>{
        const a = officialFresh ? (ab[br]!=null?ab[br]:0)
          : Math.round((eb.byBrand[UMCore.normBrand(br)]||0)*100)/100;
        const pct = Math.round(a/tg*100);
        return `<tr><td>${esc(br)}</td><td><span class="num">${tg.toFixed(0)}</span></td><td><span class="num">${a.toFixed(2)}</span></td>
          <td><span class="mr-pill ${pct>=60?'g':pct>=25?'o':'r'}"><span class="num">${pct}%</span></span></td></tr>`;
      }).join('')}</tbody></table>`;
  }).filter(Boolean);

  // Per-rep FIELD ACTIVITY — every rep gets credit for the work they do:
  // real field visits, phone/remote contact, contacts met, and the orders they
  // logged FOR FOLLOW-UP (clearly marked as not the sales figure). Sales stay
  // in their own column, sourced only from the uploaded ERP/DSR files.
  const periodVisits = UMCore.filterVisitsByRange(visits, b.from, b.to).filter(v=>repsList.includes(v.rep) || repsList.includes(v.withRep));
  const fieldVisitsN = periodVisits.filter(v=>UMCore.isFieldVisit(v)).length;
  const actReps = repsList.slice();
  const actRows = actReps.map(r=>{
    const pv = periodVisits.filter(v=>v.rep===r || v.withRep===r);
    const field = UMCore.dedupeVisits(pv.filter(v=>UMCore.isFieldVisit(v))).unique;
    const led = periodVisits.filter(v=>v.rep===r);
    return {
      rep: r,
      visits: field.length,
      calls: led.filter(v=>v.callOnly).length,
      contacts: field.reduce((a,v)=>a+UMCore.contactCount(v),0),
      loggedOrders: led.filter(v=>v.orderTaken).length,
      erp: erpRevenueForRange(b.from, b.to, r),
    };
  });
  const actTotals = actRows.reduce((t,x)=>({visits:t.visits+x.visits, calls:t.calls+x.calls, contacts:t.contacts+x.contacts, loggedOrders:t.loggedOrders+x.loggedOrders, erp:(t.erp||0)+(x.erp||0)}),{visits:0,calls:0,contacts:0,loggedOrders:0,erp:0});
  // a joint visit sits in both reps' rows but is ONE visit for the team — the total row agrees with the cover KPI
  const teamField = UMCore.dedupeVisits(periodVisits.filter(v=>UMCore.isFieldVisit(v))).unique;
  actTotals.visits = teamField.length;
  actTotals.contacts = teamField.reduce((a,v)=>a+UMCore.contactCount(v),0);
  const anyErpAct = actRows.some(x=>x.erp!=null);
  const actSec = `${cap(L.capActivity(winTxt))}
    <table class="mr-tbl"><thead><tr>
      <th>${L.rep}</th><th>${L.kVisits}</th><th>${L.colCalls}</th><th>${L.kContacts}</th><th>${L.colFollowOrders}</th><th>${L.colErpSales}</th>
    </tr></thead><tbody>
    ${actRows.map(x=>`<tr><td><b>${esc(x.rep)}</b></td>
      <td><span class="num">${x.visits}</span></td>
      <td><span class="num">${x.calls}</span></td>
      <td><span class="num">${x.contacts}</span></td>
      <td><span class="num">${x.loggedOrders}</span></td>
      <td>${x.erp!=null?mrMoney(x.erp,lang):'<span class="mr-note">'+L.awaitErp+'</span>'}</td></tr>`).join('')}
    ${actReps.length>1?`<tr style="border-top:2px solid #022917;"><td><b>${L.total}</b></td>
      <td><span class="num"><b>${actTotals.visits}</b></span></td>
      <td><span class="num"><b>${actTotals.calls}</b></span></td>
      <td><span class="num"><b>${actTotals.contacts}</b></span></td>
      <td><span class="num"><b>${actTotals.loggedOrders}</b></span></td>
      <td><b>${anyErpAct?mrMoney(actTotals.erp,lang):'—'}</b></td></tr>`:''}
    </tbody></table>
    <div class="mr-note">${L.actNote}</div>`;

  const reconSec = rec && rec.perRep.length ? `${cap(L.capRecon)}<table class="mr-tbl">
    <thead><tr><th>${L.rep}</th><th>${L.linkage}</th><th>${L.matched}</th><th>${L.pipeline}</th><th>${L.noVisit}</th></tr></thead><tbody>
    ${rec.perRep.filter(r=>repsList.includes(r.rep)).map(r=>`<tr><td><b>${esc(r.rep)}</b></td>
      <td><span class="num">${r.linkagePct}%</span></td><td><span class="num">${r.matched.length}</span></td>
      <td><span class="num">${r.visitedNoInvoice.length}</span></td>
      <td><span class="num">${r.invoicedNoVisit.length}</span> (${mrMoney(r.invoicedNoVisit.reduce((s,x)=>s+x.net,0),lang)})</td></tr>`).join('')}
    </tbody></table>` : `<p class="mr-note">${L.noData}</p>`;

  // Every return line named to its clinic — "who returned what, when" is the
  // question the meeting actually asks; the brand/customer roll-up follows it.
  const retDetail = (returns.detail||[]).slice(0, 20);
  const noteFor = (kind, d) => { const n = erpNotes[kind+'|'+(d.doc||'')+'|'+(d.product||'')]; return n ? n.text : ''; };
  const exch = returns.exchange || {total:0, count:0};
  const retSec = (returns.count || exch.count) ? `<p style="margin:4px 0;">${L.retTotal}: <b>${mrMoney(returns.total,lang)}</b> (<span class="num">${returns.count}</span> ${L.retCount}${returns.docCount?` · <span class="num">${returns.docCount}</span> ${L.retDocs}`:''})</p>
    ${exch.count?`<p style="margin:4px 0;">${lang==='ar'?'التبديل (استبدال بضاعة — غير محسوب في المرتجعات)':'Exchanges (stock swap — excluded from returns)'}: <b>${mrMoney(exch.total,lang)}</b> (<span class="num">${exch.count}</span>)</p>`:''}
    ${cap(L.capRetDetail(winTxt))}
    <table class="mr-tbl"><thead><tr><th>${L.colClinic}</th><th>${L.colProduct}</th><th>${L.colDate}</th><th>${L.colValue}</th><th>${L.colReason}</th></tr></thead><tbody>
    ${retDetail.map(d=>`<tr><td>${esc(d.customer)}</td><td>${esc(d.product||d.brand)}${d.qty?` <span class="num">×${d.qty}</span>`:''}</td><td>${fmtDate(d.date)}</td><td>${mrMoney(d.amount,lang)}</td><td>${esc(noteFor('ret', d))||'<span class="mr-note">—</span>'}</td></tr>`).join('')}
    ${returns.detail.length>20?`<tr><td colspan="5"><span class="mr-note">+${returns.detail.length-20}</span></td></tr>`:''}
    </tbody></table>
    ${cap(L.capRetBrand)}
    <table class="mr-tbl"><thead><tr><th>${L.brandCol}</th><th>${L.retValueCol}</th></tr></thead><tbody>
    ${returns.byBrand.slice(0,5).map(x=>`<tr><td>${esc(x.name)}</td><td>${mrMoney(x.amount,lang)}</td></tr>`).join('')}</tbody></table>
    ${cap(L.capRetCust)}
    <table class="mr-tbl"><thead><tr><th>${L.colClinic}</th><th>${L.retValueCol}</th></tr></thead><tbody>
    ${returns.byCustomer.slice(0,5).map(x=>`<tr><td>${esc(x.name)}</td><td>${mrMoney(x.amount,lang)}</td></tr>`).join('')}</tbody></table>` : `<p class="mr-note">${L.noData}</p>`;

  // Marketing & free-of-charge goods: what left the warehouse with no revenue,
  // and which clinic received it.
  const foc = UMCore.focAnalysis(rows);
  // Deal bonuses (free goods inside a paying invoice) are a cost of the sale;
  // samples/marketing are an investment — the report never mixes the two.
  const focAll = UMCore.focLinesAnnotated(rows).map(r=>{
    const key = 'foc|'+(r.doc||'')+'|'+(r.product||'');
    const n = erpNotes[key];
    return Object.assign({}, r, { kind: (n && n.kind) || r.kindDefault, note: n ? n.text : '' });
  }).sort((a,b)=>(b.gross||0)-(a.gross||0));
  const focDeal = focAll.filter(r=>r.kind==='deal'), focSample = focAll.filter(r=>r.kind==='sample');
  const sumG = a=>Math.round(a.reduce((s,r)=>s+(r.gross||0),0)*100)/100;
  const focQty = a=>a.reduce((s,r)=>s+(r.qty||0),0);
  const focTable = (lines) => `<table class="mr-tbl"><thead><tr><th>${L.colClinic}</th><th>${L.colProduct}</th><th>${L.colDate}</th><th>${L.colValue}</th><th>${L.colReason}</th></tr></thead><tbody>
    ${lines.slice(0,15).map(r=>`<tr><td>${esc(r.customer||'—')}</td><td>${esc(r.product||r.brand)}${r.qty?` <span class="num">×${r.qty}</span>`:''}</td><td>${fmtDate(r.date)}</td><td>${mrMoney(r.gross||0,lang)}</td><td>${esc(r.note)||'<span class="mr-note">—</span>'}</td></tr>`).join('')}
    ${lines.length>15?`<tr><td colspan="5"><span class="mr-note">+${lines.length-15}</span></td></tr>`:''}
    </tbody></table>`;
  // Two distinct stories, never mixed: bonuses that are part of a paid deal
  // (buy-X-get-Y), vs samples/marketing given with no sale attached.
  const focSec = foc.count ? `
    <h3 class="mr-rep">🤝 ${L.focDealHead}</h3>
    <div class="mr-cap">${L.focDealExplain}</div>
    ${focDeal.length ? `<p style="margin:4px 0; font-size:12.5px;">${L.focItemsGiven}: <b><span class="num">${focQty(focDeal)}</span></b> ${L.focUnits} · ${L.focValueLbl}: <b>${mrMoney(sumG(focDeal),lang)}</b></p>${focTable(focDeal)}` : `<p class="mr-note">${L.focNoDeal}</p>`}
    <h3 class="mr-rep">🎁 ${L.focSampleHead}</h3>
    <div class="mr-cap">${L.focSampleExplain}</div>
    ${focSample.length ? `<p style="margin:4px 0; font-size:12.5px;">${L.focItemsGiven}: <b><span class="num">${focQty(focSample)}</span></b> ${L.focUnits} · ${L.focValueLbl}: <b>${mrMoney(sumG(focSample),lang)}</b></p>${focTable(focSample)}` : `<p class="mr-note">${L.focNoSample}</p>`}`
    : `<p class="mr-note">${L.noData}</p>`;

  // Who bought vs who didn't — counts plus every non-buying account with its
  // working model and the reason the team recorded, framed as pipeline.
  const dash = erpDashData(repFilter);
  const dashBuyers = dash.buyers.filter(b=>!b.channel);
  const buySec = dash.hasData ? `<div class="mr-kpis">
      <div class="mr-kpi"><div class="n"><span class="num">${dashBuyers.length}</span></div><div class="l">${L.boughtLbl}</div></div>
      <div class="mr-kpi"><div class="n"><span class="num">${dash.nonBuyers.length}</span></div><div class="l">${L.notBoughtLbl}</div></div>
      <div class="mr-kpi"><div class="n"><span class="num">${dash.nonBuyers.filter(x=>clinicIsRx(x.c)).length}</span></div><div class="l">${L.rxModel}</div></div>
      <div class="mr-kpi"><div class="n"><span class="num">${dash.nonBuyers.filter(x=>x.c.noSaleReason).length}</span></div><div class="l">${L.reasonedLbl}</div></div>
    </div>
    <h3 class="mr-rep">${L.boughtLbl} (${dashBuyers.length})</h3>
    ${cap(L.capBuyers(dash.periodLabel))}
    <table class="mr-tbl"><thead><tr><th>${L.colClinic}</th><th>${L.rep}</th><th>${L.colInv}</th><th>${L.colValue}</th></tr></thead><tbody>
    ${dashBuyers.slice(0,25).map(b=>`<tr><td>${esc(b.name)}</td><td>${esc(b.rep||'')}</td><td><span class="num">${b.invoices}</span></td><td>${mrMoney(b.net,lang)}</td></tr>`).join('')}
    ${dashBuyers.length>25?`<tr><td colspan="4"><span class="mr-note">+${dashBuyers.length-25}</span></td></tr>`:''}
    </tbody></table>
    <h3 class="mr-rep">${L.notBoughtLbl} (${dash.nonBuyers.length})</h3>
    ${cap(L.capNonBuyers(dash.periodLabel))}
    <table class="mr-tbl"><thead><tr><th>${L.colClinic}</th><th>${L.rep}</th><th>${L.colModel}</th><th>${L.colReason}</th></tr></thead><tbody>
    ${dash.nonBuyers.slice(0,40).map(x=>`<tr><td>${esc(x.c.name)}</td><td>${esc(x.c.rep||'')}</td>
      <td>${clinicIsRx(x.c)?`<span class="mr-pill g">${L.rxModel}</span>${clinicIsDirect(x.c)?' + '+L.directModel:''}`:clinicIsDirect(x.c)?L.directModel:'—'}</td>
      <td>${esc(x.c.noSaleReason||'')||'<span class="mr-note">—</span>'}</td></tr>`).join('')}
    ${dash.nonBuyers.length>40?`<tr><td colspan="4"><span class="mr-note">+${dash.nonBuyers.length-40}</span></td></tr>`:''}
    </tbody></table><div class="mr-note">${L.buyersNote}</div>` : `<p class="mr-note">${L.noData}</p>`;

  const covSec = `<div class="mr-kpis">
    <div class="mr-kpi"><div class="n"><span class="num">${cov.stats.visitedCount}/${cov.stats.totalClinics}</span></div><div class="l">${L.covered} (<span class="num">${cov.stats.coveragePct}%</span>)</div></div>
    <div class="mr-kpi"><div class="n"><span class="num">${cov.stats.needsCount}</span></div><div class="l">${L.needVisit}</div></div>
    <div class="mr-kpi"><div class="n"><span class="num">${cov.needsVisit.filter(c=>c.weight===0).length}</span></div><div class="l">${L.overdue}</div></div>
    <div class="mr-kpi"><div class="n"><span class="num">${cov.stats.contacts}</span></div><div class="l">${L.kContacts}</div></div>
  </div>
  <div class="mr-note">${L.covRecon(cov.stats.visitedCount, cov.stats.needsCount, cov.stats.totalClinics)}</div>
  ${cov.needsVisit.length?`${cap(L.capCov(winTxt))}<table class="mr-tbl"><thead><tr><th>${L.colClinic}</th><th>${L.rep}</th><th>${L.covLast}</th><th>${L.covWhy}</th></tr></thead><tbody>
    ${cov.needsVisit.slice(0,25).map(c=>`<tr><td>${esc(c.name)} <span class="num">${esc(c.cls||'')}</span></td><td>${esc(c.rep||'')}</td>
      <td>${c.lastVisit?fmtDate(c.lastVisit):L.covNever}</td><td>${L.covReason[c.reasons[0].key]||''}</td></tr>`).join('')}
    ${cov.needsVisit.length>25?`<tr><td colspan="4"><span class="mr-note">+${cov.needsVisit.length-25}</span></td></tr>`:''}
    </tbody></table>`:''}`;

  const recoItems = coach.map(i=>`<div class="mr-reco ${i.level}"><span class="lv">${i.level==='act'?L.doNow:i.level==='watch'?L.watch:L.working}</span><br>${i.icon} ${esc(mrCoachText(i, lang))}</div>`);
  const planItems = coach.filter(i=>i.level!=='good');
  const planSec = planItems.length ? `<p class="mr-note" style="margin-bottom:8px;">${L.planIntro}</p>
    <ol class="mr-plan">${planItems.map(i=>`<li>☐ ${esc(mrCoachText(i, lang))}</li>`).join('')}</ol>` : `<p class="mr-note">${L.noData}</p>`;

  // Headline numbers on the cover so the report says something before page 2.
  // Headline "achieved sales" — the OFFICIAL figure, identical to the targets
  // table and the per-rep numbers: the DSR (the company's official monthly
  // sales report) when it covers the current month, otherwise the ERP
  // invoices. Summed per rep so the cover total always equals Mariam + Renova,
  // and it never uses the raw invoice sum, which ignored the DSR entirely and
  // showed "awaiting ERP" when only the DSR had been uploaded.
  let officialSum = 0, officialAny = false;
  repsList.forEach(rep => { const o = officialRevenue(rep); if(o.has){ officialSum += o.amount; officialAny = true; } });
  const erpSalesVal = officialAny ? Math.round(officialSum*100)/100 : null;
  const callsN = periodVisits.filter(v=>v.callOnly).length;
  const loggedOrdersN = periodVisits.filter(v=>v.orderTaken).length;
  const brandBar = `<div class="mr-brandbar"><img src="${LOGO_DATAURI}" alt="UltraMed"><div class="tb">CLINICAL SALES TEAM</div></div>`;
  const cover = `<div class="mr-cover">
    <div class="b">${L.brandName}</div><h1>${L.title}</h1>
    <div class="meta">${L.period}: ${periodTxt} <span class="num">(${winTxt})</span>${repFilter!=='all'?' · '+esc(repFilter):' · '+L.team} &nbsp;·&nbsp; ${L.generated}: ${dateStr} &nbsp;·&nbsp; ${L.preparedBy}: ${esc(currentUser.name||'')}</div>
    <div class="mr-cover-kpis">
      <div class="ck"><div class="n"><span class="num">${fieldVisitsN}</span></div><div class="l">${L.kVisits}</div></div>
      <div class="ck"><div class="n">${erpSalesVal!=null?mrMoney(erpSalesVal,lang):'—'}</div><div class="l">${erpSalesVal!=null?L.kSales:L.kAwaitErp}${erpSalesVal!=null&&goalSum>0?` · <span class="num">${Math.round(achSum/goalSum*100)}%</span> ${L.ofTarget}`:''}</div></div>
      <div class="ck"><div class="n"><span class="num">${cov.stats.coveragePct}%</span></div><div class="l">${L.kCoverage} (<span class="num">${cov.stats.visitedCount}/${cov.stats.totalClinics}</span>)</div></div>
      <div class="ck"><div class="n">${mrMoney(returns.total,lang)}</div><div class="l">${L.kReturns}</div></div>
    </div>
    <div class="mr-conf">${L.confidential}</div></div>`;
  const foot = `<div class="mr-foot"><span>${L.brandName} · UltraMed Field Ops</span><span>${L.confidential}</span></div>`;

  if(format === 'summary'){
    return `<div class="mr-doc" dir="${rtl?'rtl':'ltr'}">${brandBar}${cover}
      ${block(L.s_exec, `<div class="mr-exec">${exec}</div>`)}
      ${trend.length>1?block(L.s_chart, mrChartSvg(trend,lang)):''}
      ${block(L.s_targets, targetsTbl)}
      ${block(L.s_reco, coach.filter(i=>i.level==='act').slice(0,3).map(i=>`<div class="mr-reco act"><span class="lv">${L.doNow}</span><br>${i.icon} ${esc(mrCoachText(i,lang))}</div>`).join('') || `<p class="mr-note">${L.noData}</p>`)}
      ${foot}</div>`;
  }
  // Narrative order: results first (summary → targets → trend), then the
  // customer story (who bought / who didn't and why), then product detail
  // (brands), then leakage (returns, free goods), then process health
  // (reconciliation, coverage), and finally actions (recommendations, plan).
  return `<div class="mr-doc" dir="${rtl?'rtl':'ltr'}">${brandBar}${cover}
    ${block(L.s_exec, `<div class="mr-exec">${exec}</div>`)}
    ${block(L.s_targets, targetsTbl)}
    ${trend.length>1?block(L.s_chart, mrChartSvg(trend,lang)):''}
    ${block(L.s_activity, actSec, 'long')}
    ${block(L.s_buyers, buySec, 'long')}
    ${brandParts.length?block(L.s_brands, brandParts[0])+brandParts.slice(1).map(contBlock).join(''):''}
    ${block(L.s_returns, retSec, 'long')}
    ${block(L.s_foc, focSec, 'long')}
    ${block(L.s_recon, reconSec, 'long')}
    ${block(L.s_coverage, covSec, 'long')}
    ${block(L.s_reco, recoItems[0]||`<p class="mr-note">${L.noData}</p>`)}${recoItems.slice(1).map(contBlock).join('')}
    ${block(L.s_plan, planSec)}
    ${foot}</div>`;
}
function buildMasterReportHtml(lang, format){
  const L = REPORT_I18N[lang] || REPORT_I18N.en;
  return `<!doctype html><html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${L.title} — UltraMed</title>
<style>body{margin:0; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact;}${MASTER_REPORT_CSS}</style>
</head><body>${buildMasterReportBody(lang, format)}</body></html>`;
}
function ensureMrCss(){
  if(document.getElementById('mrCss')) return;
  const st = document.createElement('style');
  st.id = 'mrCss';
  st.textContent = MASTER_REPORT_CSS;
  document.head.appendChild(st);
}

// ==== REAL PDF EXPORT (no libraries, fully offline) ====
// The report is laid out at a fixed pixel width, split into pages at block
// boundaries (so a heading never separates from its table), each page is
// rasterized via SVG <foreignObject> → canvas → JPEG, and the JPEGs are
// assembled by hand into a valid multi-page A4 PDF. The browser does the
// text shaping, so Arabic and emoji come out exactly as on screen.
const PDF_LAYOUT = {
  pageW: 595.28, pageH: 841.89,   // A4 in PDF points
  marginX: 36, marginTop: 34, marginBottom: 46,
  contentPx: 720,                 // CSS px width the report is laid out at
  scale: 2,                       // raster oversampling for crisp text
};
function pdfPtPerPx(){ return (PDF_LAYOUT.pageW - PDF_LAYOUT.marginX*2) / PDF_LAYOUT.contentPx; }
function pdfPageContentPx(){ return Math.floor((PDF_LAYOUT.pageH - PDF_LAYOUT.marginTop - PDF_LAYOUT.marginBottom) / pdfPtPerPx()); }
// Serialize a set of report blocks into standalone XHTML (styles inlined —
// page CSS does not reach inside an SVG image).
function pdfPageXhtml(blockEls, dir){
  const wrap = document.createElement('div');
  wrap.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const style = document.createElement('style');
  style.textContent = 'div{box-sizing:border-box;}' + MASTER_REPORT_CSS;
  wrap.appendChild(style);
  const doc = document.createElement('div');
  doc.className = 'mr-doc mr-pdf';
  if(dir) doc.setAttribute('dir', dir);
  blockEls.forEach(el=>doc.appendChild(el.cloneNode(true)));
  wrap.appendChild(doc);
  return new XMLSerializer().serializeToString(wrap);
}
function pdfRasterize(xhtml, w, h, scale){
  return new Promise((resolve, reject)=>{
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="${w}" height="${h}">${xhtml}</foreignObject></svg>`;
    const img = new Image();
    img.onload = ()=>{
      try{
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      }catch(e){ reject(e); }
    };
    img.onerror = ()=>reject(new Error('SVG rasterization failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
// Split any section taller than a page into continuation sections BEFORE
// pagination: each continuation re-states the section title ("… (continued)")
// and clones the table header, so no PDF page ever shows orphan rows that
// belong to nothing. Canvas slicing stays only as a fallback for non-table
// content.
function pdfSplitLongSections(root, maxH, contLabel){
  const secs = [...root.querySelectorAll('section.mr-block')];
  for(let i = 0; i < secs.length; i++){
    let sec = secs[i], guard = 0;
    while(sec.getBoundingClientRect().height > maxH && guard++ < 40){
      const secTop = sec.getBoundingClientRect().top;
      const target = [...sec.querySelectorAll('table.mr-tbl')].find(t =>
        t.tBodies[0] && t.tBodies[0].rows.length > 2 &&
        t.getBoundingClientRect().bottom - secTop > maxH);
      if(!target) break;
      const title = (sec.querySelector('.mr-sec h2') || sec.querySelector('.mr-cap') || {}).textContent || '';
      const cont = document.createElement('section');
      cont.className = 'mr-block';
      const capD = document.createElement('div');
      capD.className = 'mr-cap';
      capD.textContent = (title ? title + ' ' : '') + contLabel;
      const t2 = target.cloneNode(false);
      if(target.tHead) t2.appendChild(target.tHead.cloneNode(true));
      const tb2 = document.createElement('tbody');
      t2.appendChild(tb2);
      cont.appendChild(capD);
      cont.appendChild(t2);
      sec.after(cont);
      // Whatever follows the split table (notes, further tables) moves with
      // the continuation, then rows move until the original section fits.
      let after = target.nextSibling;
      while(after){ const n = after; after = after.nextSibling; cont.appendChild(n); }
      const tb = target.tBodies[0];
      let moved = 0;
      while(sec.getBoundingClientRect().height > maxH && tb.rows.length > 2){
        tb2.insertBefore(tb.rows[tb.rows.length-1], tb2.firstChild);
        moved++;
      }
      if(!moved){ cont.remove(); break; }
      sec = cont; // the continuation itself may still overflow — keep going
    }
  }
}
async function buildMasterReportPdf(lang, format){
  ensureMrCss();
  const dir = lang==='ar' ? 'rtl' : 'ltr';
  const host = document.createElement('div');
  host.style.cssText = `position:fixed; left:-10000px; top:0; width:${PDF_LAYOUT.contentPx}px; background:#fff;`;
  host.innerHTML = buildMasterReportBody(lang, format);
  const root = host.firstElementChild;
  root.classList.add('mr-pdf');
  document.body.appendChild(host);
  try{
    const pageHpx = pdfPageContentPx();
    // 48 = grouping buffer + the section's own bottom margin, so a split
    // section never re-enters the canvas-slice path over pure whitespace.
    pdfSplitLongSections(root, pageHpx - 48, (REPORT_I18N[lang]||REPORT_I18N.en).contLabel);
    const rootTop = root.getBoundingClientRect().top;
    const blocks = [...root.children].map(el=>{
      const r = el.getBoundingClientRect();
      const mb = parseFloat(getComputedStyle(el).marginBottom)||0;
      return {el, top: r.top-rootTop, bottom: r.bottom-rootTop+mb};
    }).filter(b=>b.bottom-b.top > 0.5);
    // Group blocks into pages at block boundaries; a block taller than one
    // page is rasterized alone and sliced. Grouping leaves a small buffer so
    // a rounding difference between the DOM measure and the SVG re-render
    // never clips the last row of a page.
    const groupHpx = pageHpx - 16;
    const pages = [];
    let cur = null;
    blocks.forEach(b=>{
      if(b.bottom-b.top > pageHpx){ if(cur){ pages.push(cur); cur=null; } pages.push({slice:b}); return; }
      if(cur && b.bottom - cur.start > groupHpx){ pages.push(cur); cur = null; }
      if(!cur) cur = {list:[b], start:b.top};
      else cur.list.push(b);
    });
    if(cur) pages.push(cur);
    const SCALE = PDF_LAYOUT.scale;
    const jpegs = [];
    for(const pg of pages){
      if(pg.slice){
        // Never cut a table row / card in half: page cuts snap to the nearest
        // element bottom above the limit. Blind fixed-height slicing was
        // losing half-rows at the bottom and top of every PDF page.
        const H = Math.ceil(pg.slice.bottom-pg.slice.top);
        const blockTop = pg.slice.el.getBoundingClientRect().top;
        const cutSet = new Set();
        pg.slice.el.querySelectorAll('tr, li, p, h2, h3, .mr-sec, .mr-reco, .mr-kpis, .mr-note, .mr-exec, svg').forEach(n=>{
          const r = n.getBoundingClientRect();
          if(r.height > 0) cutSet.add(Math.round(r.bottom - blockTop));
        });
        const cuts = [...cutSet].sort((a,b)=>a-b);
        const lastContent = cuts.length ? cuts[cuts.length-1] : H;
        const canvas = await pdfRasterize(pdfPageXhtml([pg.slice.el], dir), PDF_LAYOUT.contentPx, H+8, SCALE);
        let y0 = 0;
        while(y0 < H){
          if(y0 >= lastContent) break; // only trailing margin left — no blank page for it
          let end = Math.min(y0 + groupHpx, H);
          if(end < H){
            let safe = null;
            for(const c of cuts){ if(c <= end && c >= y0 + 60) safe = c; }
            if(safe !== null) end = safe; // fall back to a hard cut only when no boundary fits
          }
          const sh = Math.round((end - y0) * SCALE);
          if(sh < 8*SCALE) break; // ignore a sliver of trailing margin
          const c2 = document.createElement('canvas');
          c2.width = canvas.width; c2.height = sh;
          const ctx = c2.getContext('2d');
          ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,c2.width,c2.height);
          ctx.drawImage(canvas, 0, Math.round(y0*SCALE), canvas.width, sh, 0, 0, canvas.width, sh);
          jpegs.push({data:c2.toDataURL('image/jpeg',0.92), pw:c2.width, ph:c2.height});
          y0 = end;
        }
      } else {
        const last = pg.list[pg.list.length-1];
        const h = Math.ceil(last.bottom-pg.start)+8;
        const canvas = await pdfRasterize(pdfPageXhtml(pg.list.map(x=>x.el), dir), PDF_LAYOUT.contentPx, h, SCALE);
        jpegs.push({data:canvas.toDataURL('image/jpeg',0.92), pw:canvas.width, ph:canvas.height});
      }
    }
    if(!jpegs.length) throw new Error('empty report');
    return assemblePdf(jpegs);
  } finally {
    document.body.removeChild(host);
  }
}
// Hand-rolled PDF: one JPEG XObject per page + a Helvetica footer with the
// page number. Layout numbers are PDF points (72/inch), origin bottom-left.
function assemblePdf(jpegs){
  const {pageW, pageH, marginX, marginTop, scale} = PDF_LAYOUT;
  const k = pdfPtPerPx();
  const bin = str=>{ const u=new Uint8Array(str.length); for(let i=0;i<str.length;i++) u[i]=str.charCodeAt(i)&0xFF; return u; };
  const chunks=[]; let pos=0; const offsets=[];
  const push = d=>{ const u = typeof d==='string' ? bin(d) : d; chunks.push(u); pos += u.length; };
  const obj = (num, body)=>{ offsets[num]=pos; push(num+' 0 obj\n'+body+'\nendobj\n'); };
  push('%PDF-1.4\n%âãÏÓ\n');
  const n = jpegs.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${jpegs.map((_,i)=>(4+i*3)+' 0 R').join(' ')}] /Count ${n} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  jpegs.forEach((pg,i)=>{
    const imgBytes = bin(atob(pg.data.split(',')[1]));
    const W = pageW - marginX*2;
    const H = (pg.ph/scale) * k;
    const y = pageH - marginTop - H;
    const pn = `${i+1} / ${n}`;
    let st = `0.86 0.90 0.87 RG 0.8 w ${marginX} 32 m ${(pageW-marginX).toFixed(2)} 32 l S\n`;
    st += `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} ${marginX} ${y.toFixed(2)} cm /Im${i} Do Q\n`;
    st += `BT /F1 8.5 Tf 0.45 0.51 0.46 rg 1 0 0 1 ${marginX} 21 Tm (UltraMed Field Ops) Tj ET\n`;
    st += `BT /F1 8.5 Tf 0.45 0.51 0.46 rg 1 0 0 1 ${(pageW-marginX-pn.length*4.8).toFixed(2)} 21 Tm (${pn}) Tj ET\n`;
    obj(4+i*3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${6+i*3} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${5+i*3} 0 R >>`);
    offsets[5+i*3]=pos;
    push(`${5+i*3} 0 obj\n<< /Length ${st.length} >>\nstream\n${st}endstream\nendobj\n`);
    offsets[6+i*3]=pos;
    push(`${6+i*3} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.pw} /Height ${pg.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
    push(imgBytes);
    push('\nendstream\nendobj\n');
  });
  const maxObj = 3+n*3;
  const xrefPos = pos;
  let xref = `xref\n0 ${maxObj+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=maxObj;i++) xref += String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  push(xref);
  push(`trailer\n<< /Size ${maxObj+1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  return new Blob(chunks, {type:'application/pdf'});
}
function reportPdfName(){ return reportFileName('UltraMed-Report').replace(/\.html$/, '.pdf'); }
async function downloadReportPdf(){
  showToast('Building the PDF…');
  try{
    const blob = await buildMasterReportPdf(reportLang, reportFormat);
    const ok = tryDownload(reportPdfName(), blob, 'application/pdf');
    if(!ok) throw new Error('download blocked');
    showToast('⬇️ PDF saved');
  }catch(e){
    console.error('pdf export failed', e);
    // Very old WebViews can't rasterize foreignObject — print-to-PDF fallback.
    showToast('Could not build the PDF here — opening print instead');
    if(!document.getElementById('proreport').classList.contains('active')) showProReport();
    setTimeout(()=>window.print(), 300);
  }
}
function setMrLang(l){ reportLang = l; if(document.getElementById('proreport').classList.contains('active')) showProReport(); }
function setMrFormat(f){ reportFormat = f; if(document.getElementById('proreport').classList.contains('active')) showProReport(); }
function buildReportFileHtml(){
  return buildMasterReportHtml(reportLang, reportFormat);
}
function downloadReportFile(){
  const ok = tryDownload(reportFileName('UltraMed-Report'), buildReportFileHtml(), 'text/html;charset=utf-8;');
  showToast(ok ? '⬇️ Report saved — opens in any browser' : 'Could not save the file');
}
async function shareReportFile(){
  // Share the real PDF when the platform can; fall back to the HTML file.
  try{
    const blob = await buildMasterReportPdf(reportLang, reportFormat);
    const file = new File([blob], reportPdfName(), {type: 'application/pdf'});
    if(navigator.canShare && navigator.canShare({files: [file]})){
      await navigator.share({files: [file], title: 'UltraMed Field Performance Report'});
      return;
    }
    if(tryDownload(reportPdfName(), blob, 'application/pdf')){
      showToast('Sharing not available here — PDF saved instead');
      return;
    }
  }catch(e){
    if(e && e.name === 'AbortError') return;
    console.error('pdf share failed', e);
  }
  await shareHtmlFile(reportFileName('UltraMed-Report'), buildReportFileHtml(), 'UltraMed Field Performance Report');
}
async function shareHtmlFile(filename, html, title){
  try{
    const file = new File([html], filename, {type: 'text/html'});
    if(navigator.canShare && navigator.canShare({files: [file]})){
      await navigator.share({files: [file], title});
      return;
    }
  }catch(e){ if(e && e.name === 'AbortError') return; }
  const ok = tryDownload(filename, html, 'text/html;charset=utf-8;');
  showToast(ok ? 'Sharing not available here — saved as a file instead' : 'Could not share or save');
}
function buildErpReconFileHtml(id){
  const p = erpPeriods().find(x=>x.id===id);
  if(!p) return null;
  const rec = UMCore.reconcileErp({rows: erpViewRows(p), visits, clinics, erpMap, repMap: p.repMap||{}, from: p.from, to: p.to});
  const dateStr = new Date().toLocaleDateString('en-US',{year:'numeric', month:'long', day:'numeric'});
  const sec = r => `
  <div class="pr-rep-section">
    <div class="pr-rep-head"><div class="stamp">${initials(r.rep)}</div>
      <div><h2>${esc(r.rep)}</h2><div class="sub">ERP reconciliation — ${fmtDate(p.from)} – ${fmtDate(p.to)}</div></div></div>
    <table class="pr-tbl">
      <tr><th>ERP net sales</th><td>${money(r.erp.net)}</td></tr>
      <tr><th>— from clinics / customers</th><td>${money(r.erp.clinicNet)}</td></tr>
      <tr><th>— from online / channels</th><td>${money(r.erp.channelNet)}</td></tr>
      <tr><th>Invoices</th><td>${r.erp.invoices}</td></tr>
      <tr><th>Returned value</th><td>${money(r.erp.returns)}</td></tr>
      <tr><th>Visits logged (deduped)</th><td>${r.app.visits}</td></tr>
      <tr><th>Visit→invoice linkage</th><td>${r.linkagePct}%</td></tr>
    </table>
    ${r.matched.length?`<div class="pr-block-title">✅ Visited AND invoiced</div>
      <table class="pr-tbl"><tr><th>Clinic</th><th>Visits</th><th>Net</th></tr>
      ${r.matched.map(m=>`<tr><td>${esc(m.clinicName)}</td><td>${m.visits}</td><td>${money(m.net)}</td></tr>`).join('')}</table>`:''}
    ${r.visitedNoInvoice.length?`<div class="pr-block-title">🕓 Visited, no invoice yet (pipeline)</div>
      <table class="pr-tbl"><tr><th>Clinic</th><th>Visits</th></tr>
      ${r.visitedNoInvoice.map(m=>`<tr><td>${esc(m.clinicName)}</td><td>${m.visits}</td></tr>`).join('')}</table>`:''}
    ${r.invoicedNoVisit.length?`<div class="pr-block-title">⚠️ Invoiced with no logged visit</div>
      <table class="pr-tbl"><tr><th>Customer</th><th>Net</th></tr>
      ${r.invoicedNoVisit.map(m=>`<tr><td>${esc(m.customer)}</td><td>${money(m.net)}</td></tr>`).join('')}</table>`:''}
  </div>`;
  const body = `
    <div class="pr-letterhead"><div class="brand">UltraMed</div>
      <h1>Sales Reconciliation Report</h1>
      <div class="meta">${fmtDate(p.from)} – ${fmtDate(p.to)} · ERP invoices vs field visits · Generated ${dateStr}</div></div>
    ${rec.perRep.map(sec).join('') || '<div class="empty">No team rows in this period.</div>'}
    <div class="pr-footer">Prepared from EXceed ERP data reconciled with UltraMed Field Ops · ${dateStr}</div>`;
  return wrapReportDoc('UltraMed Sales Reconciliation', body);
}
function downloadErpReconFile(id){
  const p = erpPeriods().find(x=>x.id===id);
  const html = buildErpReconFileHtml(id);
  if(!p || !html) return;
  const ok = tryDownload(`UltraMed-Reconciliation-${p.from}_to_${p.to}.html`, html, 'text/html;charset=utf-8;');
  showToast(ok ? '⬇️ Reconciliation report saved' : 'Could not save the file');
}
async function shareErpReconFile(id){
  const p = erpPeriods().find(x=>x.id===id);
  const html = buildErpReconFileHtml(id);
  if(!p || !html) return;
  await shareHtmlFile(`UltraMed-Reconciliation-${p.from}_to_${p.to}.html`, html, 'UltraMed Sales Reconciliation');
}
function showProReport(){
  ensureMrCss();
  document.getElementById('prDoc').innerHTML = buildMasterReportBody(reportLang, reportFormat);
  const langBtns = document.getElementById('prLangBtns');
  if(langBtns) langBtns.innerHTML = `
    <button class="print ${reportLang==='en'?'':'off'}" onclick="setMrLang('en')">EN</button>
    <button class="print ${reportLang==='ar'?'':'off'}" onclick="setMrLang('ar')">عربي</button>
    <button class="print ${reportFormat==='full'?'':'off'}" onclick="setMrFormat('full')">${reportLang==='ar'?'كامل':'Full'}</button>
    <button class="print ${reportFormat==='summary'?'':'off'}" onclick="setMrFormat('summary')">${reportLang==='ar'?'صفحة واحدة':'1-page'}</button>`;
  document.getElementById('proreport').classList.add('active');
  // The report replaces the app on screen — without this it renders below
  // the whole app and only appears after a very long scroll.
  document.getElementById('app').style.display = 'none';
  document.getElementById('bottomNav').style.display = 'none';
  window.scrollTo(0,0);
}
function hideProReport(){
  document.getElementById('proreport').classList.remove('active');
  document.getElementById('app').style.display = 'block';
  document.getElementById('bottomNav').style.display = 'flex';
}


function csvEscape(v){ return UMCore.csvEscape(v); }
// One row per visit (or per order within a visit). Type distinguishes real
// field visits from phone orders and call logs so counts in Excel stay honest.
function visitTypeLabel(v){
  if(v.orderOnly) return 'Phone/remote order';
  if(v.callOnly) return 'Call';
  return 'Field visit';
}
function rowsToCsv(rows){ return rows.map(r=>r.map(csvEscape).join(',')).join('\n'); }
function buildVisitsCSV(range){
  const rows = [['Date','Rep','Joint With','Type','Channel','Clinic','Class','Contacts Seen','Order #','Products Discussed','Order Items','Subtotal (KD)','Discount %','Discount (KD)','Net Total (KD)','Order Notes','No-Order Reason','Next Follow-up','Visit Notes']];
  const base = visibleVisits(); // reps export only their own book
  const inRange = range ? UMCore.filterVisitsByRange(base, range.from, range.to) : base;
  // The export must MATCH the statistics: double-saved duplicates collapse
  // here exactly like they do in every count and report.
  const list = UMCore.dedupeVisits(inRange).unique;
  [...list].sort((a,b)=>a.date.localeCompare(b.date)).forEach(v=>{
    const c = clinics.find(x=>x.id===v.clinicId);
    const cname = clinicNameOf(v.clinicId, v);
    // Doctors picked on the visit — and for call logs, the person called.
    let seen = contactNames(v,c);
    if(!seen && v.callOnly && v.contactName) seen = v.contactName + (v.contactRole?' ('+v.contactRole+')':'');
    const channel = v.callOnly ? (v.channel||'call') : '';
    const type = visitTypeLabel(v);
    const prodNames = (v.products||[]).map(pid=>productName(pid)).filter(Boolean).join('; ');
    const orders = v.orders||[];
    if(orders.length===0){
      rows.push([v.date, v.rep, v.withRep||'', type, channel, cname, c?c.cls||'':'', seen, '', prodNames, '', '', '', '', '0.00', '', v.noOrderReason||'', v.nextFollowUp||'', v.notes||'']);
    } else {
      orders.forEach((o,i)=>{
        const items = (o.items||[]).map(it=>orderItemName(it)+' x'+it.qty).join('; ');
        rows.push([v.date, v.rep, v.withRep||'', type, channel, cname, c?c.cls||'':'', i===0?seen:'', i+1, i===0?prodNames:'', items, (o.gross||0).toFixed(2), o.discountPct||0, (o.discountAmount||0).toFixed(2), (o.total||0).toFixed(2), o.notes||'', '', i===0?(v.nextFollowUp||''):'', i===0?(v.notes||''):'']);
      });
    }
  });
  return rows;
}
function buildClinicsCSV(){
  const rows = [['Clinic','Rep','Class','Account Type','Working Model','New Customer','Total Visits','Calls','Orders','Sales (KD)','Last Visit','Next Follow-up','Status','Contact','Phone','Doctors','No-sales Reason','Profile Notes']];
  clinics.filter(c=>canViewClinic(c)).forEach(c=>{
    const docStr = (c.doctors||[]).map(d=>d.name+(d.title?' ('+d.title+')':'')).join('; ');
    // Compute from the visit log itself — c.lastVisit can go stale when a
    // visit is edited or deleted after the fact.
    const vs = visits.filter(v=>v.clinicId===c.id);
    const lastVisit = vs.reduce((m,v)=>v.date>m?v.date:m, c.lastVisit||'');
    const fieldCount = vs.filter(isFieldVisit).length;
    const callCount = vs.filter(v=>v.callOnly).length;
    const orderCount = vs.filter(v=>v.orderTaken).length;
    const rev = vs.reduce((s,v)=>s+(v.orderTotal||0),0);
    rows.push([c.name, c.rep||'', c.cls||'', c.account||'', clinicIsRx(c)?(clinicIsDirect(c)?'Prescription + Direct sales':'Prescription'):clinicIsDirect(c)?'Direct sales':'', c.isNew?'Yes':'No', fieldCount, callCount, orderCount, rev.toFixed(2), lastVisit||'', c.nextFollowUp||'', followStatus(c.nextFollowUp), c.contact||'', c.phone||'', docStr, c.noSaleReason||'', c.profileNotes||'']);
  });
  return rows;
}
function buildTasksCSV(range){
  const rows = [['Task','Rep','Status','Created','Due']];
  let list = visibleTasks();
  if(range) list = list.filter(t=>UMCore.inRange(t.created, range.from, range.to) || UMCore.inRange(t.dueDate, range.from, range.to));
  list.forEach(t=>{ rows.push([t.text, t.rep||'', t.done?'Done':'Open', t.created||'', t.dueDate||'']); });
  return rows;
}
function buildScorecardCSV(range){
  const rows = [['Rep','Visits','Orders','Sales (KD)','Conversion %','Clinics Covered','Assigned Clinics','Coverage %','Priority Covered','Priority Assigned','Priority Coverage %','Overdue Follow-ups','Tasks Done','Tasks Total']];
  (currentUser.role==='supervisor' ? REPS : [currentUser.name]).forEach(r=>{
    // no range = everything (the export sheet's own choice), never the Report tab's current window
    const s = UMCore.computeRepScore(r, {visits: range ? UMCore.filterVisitsByRange(visits, range.from, range.to) : visits, clinics, tasks, today: todayStr()});
    rows.push([s.rep, s.visits, s.orders, s.revenue.toFixed(2), s.conversion, s.covered, s.assignedCount, s.coveragePct, s.priorityCovered, s.priorityAssignedCount, s.priorityPct, s.overdue, s.tasksDone, s.tasksTotal]);
  });
  return rows;
}
function buildDoctorsCSV(){
  const rows = [['Clinic','Rep','Doctor','Title']];
  clinics.filter(c=>canViewClinic(c)).sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>{
    (c.doctors||[]).forEach(d=>{ rows.push([c.name, c.rep||'', d.name, d.title||'']); });
  });
  return rows;
}
// ---- REAL .XLSX EXPORT ----
// CSVs opened in Excel auto-parse dates into wide "00:00:00" datetimes that
// render as #### in the default column width. A real workbook fixes it for
// good: text dates stay 'YYYY-MM-DD', every column is pre-sized to its
// content, the header row is bold and frozen. Built by hand (an xlsx is just
// a zip of XML parts, stored uncompressed) — no libraries.
const _crcTable = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c; } return t; })();
function _crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c = _crcTable[(c ^ u8[i]) & 0xFF] ^ (c>>>8); return (c ^ 0xFFFFFFFF) >>> 0; }
function _xmlEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,''); }
function _colRef(i){ let r=''; i++; while(i>0){ r = String.fromCharCode(65 + ((i-1)%26)) + r; i = Math.floor((i-1)/26); } return r; }
function makeXlsx(rows, sheetName){
  const enc = new TextEncoder();
  const widths = [];
  rows.forEach(r=>r.forEach((v,i)=>{ const L = String(v==null?'':v).length; if(!widths[i] || L>widths[i]) widths[i]=L; }));
  const cols = widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(45, Math.max(9, w+2))}" customWidth="1"/>`).join('');
  const body = rows.map((r,ri)=>{
    const cells = r.map((v,ci)=>{
      const ref = _colRef(ci)+(ri+1);
      if(typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${ri===0?1:0}"><v>${v}</v></c>`;
      const sv = String(v==null?'':v);
      if(sv === '') return '';
      return `<c r="${ref}" s="${ri===0?1:0}" t="inlineStr"><is><t xml:space="preserve">${_xmlEsc(sv)}</t></is></c>`;
    }).join('');
    return `<row r="${ri+1}">${cells}</row>`;
  }).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`;
  const parts = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${_xmlEsc((sheetName||'Sheet1').slice(0,31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  // STORE-only zip
  const chunks = []; const central = []; let offset = 0;
  parts.forEach(([name, text])=>{
    const nameB = enc.encode(name), data = enc.encode(text), crc = _crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint32(10, 0, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint32(12, 0, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  });
  const centralSize = central.reduce((a,c)=>a+c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, parts.length, true); end.setUint16(10, parts.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total); let pos = 0;
  [...chunks, ...central, new Uint8Array(end.buffer)].forEach(c=>{ out.set(c, pos); pos += c.length; });
  return out;
}
function downloadXlsx(filename, rows, sheetName){
  const bytes = makeXlsx(rows, sheetName);
  return tryDownload(filename, new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function tryDownload(filename, content, mime){
  try{
    // Excel needs a UTF-8 BOM to read Arabic clinic/doctor names correctly —
    // without it every non-ASCII cell turns into mojibake.
    const isCsv = !mime || mime.indexOf('csv') !== -1;
    if(isCsv && typeof content === 'string' && content.charCodeAt(0) !== 0xFEFF) content = '\ufeff' + content;
    const blob = content instanceof Blob ? content : new Blob([content], {type: mime || 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    return true;
  }catch(e){ console.error('download failed', e); return false; }
}
function exportRange(){
  const from = document.getElementById('expFrom')?.value || '';
  const to = document.getElementById('expTo')?.value || '';
  if(!from && !to) return null;
  return {from: from || null, to: to || null};
}
function exportSuffix(){
  const r = exportRange();
  return r ? `-${r.from||'start'}-to-${r.to||'today'}` : '';
}
function setExportPreset(days){
  const to = todayStr();
  if(days===0){ document.getElementById('expFrom').value=''; document.getElementById('expTo').value=''; }
  else{
    const d = new Date(); d.setDate(d.getDate()-days+1);
    document.getElementById('expFrom').value = localDateStr(d);
    document.getElementById('expTo').value = to;
  }
}
function openExport(){
  showModal(`
    <h3 style="margin-top:0;">Export &amp; backups</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Downloads as CSV for Excel/Sheets or email. If a download doesn't start, use "Copy instead."</p>

    <div class="card" style="margin-bottom:14px;">
      <div style="font-weight:700; font-size:13.5px; margin-bottom:6px;">📅 Date range for exports</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 8px;">Applies to Visits, Scorecard and Tasks. Leave empty to export everything.</p>
      <div class="chip-row" style="margin-bottom:8px;">
        <div class="chip small" onclick="setExportPreset(7)">Last 7 days</div>
        <div class="chip small" onclick="setExportPreset(30)">Last 30 days</div>
        <div class="chip small" onclick="setExportPreset(90)">Last 90 days</div>
        <div class="chip small" onclick="setExportPreset(0)">Everything</div>
      </div>
      <div style="display:flex; gap:10px;">
        <div style="flex:1;"><label style="font-size:12px;">From</label><input type="date" id="expFrom"></div>
        <div style="flex:1;"><label style="font-size:12px;">To</label><input type="date" id="expTo"></div>
      </div>
    </div>

    <div class="export-section">
      <h4>Visits (full log, with order values)</h4>
      <div class="export-actions">
        <button class="btn secondary" onclick="downloadXlsx('ultramed-visits'+exportSuffix()+'.xlsx', buildVisitsCSV(exportRange()), 'Visits'); showToast('Downloading visits Excel')">Download Excel</button>
        <button class="btn secondary" onclick="showExportText('visitsExportText', rowsToCsv(buildVisitsCSV(exportRange())))">Copy instead</button>
      </div>
      <textarea class="export-textarea" id="visitsExportText" readonly></textarea>
    </div>

    <div class="export-section">
      <h4>Clinics (current status)</h4>
      <div class="export-actions">
        <button class="btn secondary" onclick="downloadXlsx('ultramed-clinics.xlsx', buildClinicsCSV(), 'Clinics'); showToast('Downloading clinics Excel')">Download Excel</button>
        <button class="btn secondary" onclick="showExportText('clinicsExportText', rowsToCsv(buildClinicsCSV()))">Copy instead</button>
      </div>
      <textarea class="export-textarea" id="clinicsExportText" readonly></textarea>
    </div>

    <div class="export-section">
      <h4>Doctors directory</h4>
      <div class="export-actions">
        <button class="btn secondary" onclick="downloadXlsx('ultramed-doctors.xlsx', buildDoctorsCSV(), 'Doctors'); showToast('Downloading doctors Excel')">Download Excel</button>
        <button class="btn secondary" onclick="showExportText('docsExportText', rowsToCsv(buildDoctorsCSV()))">Copy instead</button>
      </div>
      <textarea class="export-textarea" id="docsExportText" readonly></textarea>
    </div>

    <div class="export-section">
      <h4>Performance scorecard</h4>
      <div class="export-actions">
        <button class="btn secondary" onclick="downloadXlsx('ultramed-scorecard'+exportSuffix()+'.xlsx', buildScorecardCSV(exportRange()), 'Scorecard'); showToast('Downloading scorecard Excel')">Download Excel</button>
        <button class="btn secondary" onclick="showExportText('scoreExportText', rowsToCsv(buildScorecardCSV(exportRange())))">Copy instead</button>
      </div>
      <textarea class="export-textarea" id="scoreExportText" readonly></textarea>
    </div>

    <div class="export-section">
      <h4>Tasks</h4>
      <div class="export-actions">
        <button class="btn secondary" onclick="downloadXlsx('ultramed-tasks'+exportSuffix()+'.xlsx', buildTasksCSV(exportRange()), 'Tasks'); showToast('Downloading tasks Excel')">Download Excel</button>
        <button class="btn secondary" onclick="showExportText('tasksExportText', rowsToCsv(buildTasksCSV(exportRange())))">Copy instead</button>
      </div>
      <textarea class="export-textarea" id="tasksExportText" readonly></textarea>
    </div>

    ${currentUser.role==='supervisor'?`<div class="section-title" style="margin-top:4px;">Automatic backups</div>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-4px;">A snapshot of everything is saved automatically once a day. If data ever looks wrong, you can restore an earlier day here.</p>
    <div id="backupList"><div style="color:var(--muted); font-size:13px;">Loading backups...</div></div>`:''}
  `);
  if(currentUser.role==='supervisor') renderBackupsList();
}
function showExportText(id, content){
  const el = document.getElementById(id);
  el.value = content;
  el.style.display = 'block';
  el.select();
  try{ document.execCommand('copy'); showToast('Copied — paste into a sheet'); }
  catch(e){ navigator.clipboard.writeText(content).then(()=>showToast('Copied — paste into a sheet')).catch(()=>showToast('Select the text above and copy manually')); }
}
async function renderBackupsList(){
  const el = document.getElementById('backupList');
  try{
    const list = await window.storage.list('snap_', true);
    const dates = (list && list.keys || []).map(k=>k.replace('snap_','')).sort().reverse();
    let html = '';
    for(const d of dates){
      let info = '';
      try{
        const res = await window.storage.get('snap_'+d, true);
        const snap = res ? UMCore.safeParse(res.value, null) : null;
        if(snap) info = `${(snap.clinics||[]).length} عيادة · ${(snap.visits||[]).length} زيارة`;
      }catch(e){}
      html += `
      <div class="card row-between">
        <span>${esc(d)} <span style="color:var(--muted); font-size:11.5px;">${info}</span></span>
        <button class="btn secondary small" style="width:auto; margin:0;" onclick="restoreSnapshot('${d}')">Restore</button>
      </div>`;
    }
    if(!html) html = `<div style="color:var(--muted); font-size:13px;">No backups yet — one will be created automatically today.</div>`;
    // Copies kept on THIS device — the last resort if every cloud backup is bad.
    const devRows = [['um_mirror_prev:clinics','نسخة محفوظة قبل آخر تغيّر كبير','prev'],
                     ['um_mirror:clinics','آخر نسخة شاهدها هذا الجهاز','cur']]
      .map(([k,label,which])=>{
        let n = 0;
        try{ const arr = UMCore.safeParse(localStorage.getItem(k), null); n = Array.isArray(arr)?arr.length:0; }catch(e){}
        return n ? `<div class="card row-between">
          <span>📱 ${label} <span style="color:var(--muted); font-size:11.5px;">${n} عيادة</span></span>
          <button class="btn secondary small" style="width:auto; margin:0;" onclick="restoreDeviceClinics('${which}')">Restore</button>
        </div>` : '';
      }).join('');
    el.innerHTML = html + devRows;
  }catch(e){
    el.innerHTML = `<div style="color:var(--muted); font-size:13px;">Couldn't load backups right now.</div>`;
  }
}
async function restoreSnapshot(dateStr){
  if(!requireAdmin()) return; // a restore replaces the whole team's data
  if(!confirm(`Restore data from ${dateStr}? This will replace the current clinics, tasks and this month's visits with that day's backup (past months' visits are kept).`)) return;
  try{
    const res = await window.storage.get('snap_'+dateStr, true);
    if(!res){ showToast('Backup not found'); return; }
    const snap = JSON.parse(res.value);
    clinics = normalizeClinics(snap.clinics||[]); hidePlaceholderClinics();
    products = snap.products || products;
    // The backup holds the visits of ITS month; older months live in their
    // own archive documents and are kept as they are.
    visits = UMCore.visitsAssemble(Array.isArray(snap.visits) ? snap.visits : [], visitsArchivesObj(), todayStr());
    tasks = Array.isArray(snap.tasks) ? snap.tasks : [];
    _seedClinics = false; _bootCrashed = false;
    // Clear the delete log for every restored record FIRST — otherwise the
    // next merge or restart would silently delete them all over again.
    await untombMany({ clinics: clinics.map(c=>c.id), visits: visits.map(v=>v.id), tasks: tasks.map(t=>t.id) });
    // A restore is authoritative: write that day's copy exactly as it was.
    for(const [k, val] of [['clinics',storedClinics()],['products',products],['tasks',tasks]]){
      const str = JSON.stringify(val);
      await window.storage.set(k, str, true);
      mirrorSave(k, str);
    }
    await persistVisits({ authoritative: true });
    if(snap.erpIndex && Array.isArray(snap.erpIndex.periods)){
      // that day's sales index; its chunks are still in the cloud (7-day grace)
      await window.storage.set('erpSales', JSON.stringify(snap.erpIndex), true);
      _erpDirty = false; renderErpDirtyPill();
      erpSales = await loadErpSales();
    }
    // Records the backup brought back to life leave the recycle bin, or a
    // later "Restore" there would push a second copy with the same id.
    let binChanged = false;
    [['clinics',clinics],['products',products],['visits',visits]].forEach(([k,list])=>{
      const live = new Set(list.map(x=>x && x.id));
      const before = (recycleBin[k]||[]).length;
      recycleBin[k] = (recycleBin[k]||[]).filter(x=>!(x && live.has(x.id)));
      if(recycleBin[k].length !== before) binChanged = true;
    });
    if(binChanged) await persist('recycleBin');
    const bar = document.getElementById('wipeBanner'); if(bar) bar.remove();
    closeModal();
    renderAll();
    showToast(`✅ Restored ${dateStr} — ${clinics.length} clinics, ${visits.length} visits`);
  }catch(e){
    console.error(e);
    showToast('Restore failed');
  }
}
// Restore the clinic list from a copy kept on this device (mirror). Replaces
// the in-memory list, clears delete-log entries, then merges with the cloud so
// nothing saved by other devices meanwhile is lost.
async function restoreDeviceClinics(which){
  if(!requireAdmin()) return;
  const raw = which==='prev' ? (function(){ try{ return localStorage.getItem('um_mirror_prev:clinics'); }catch(e){ return null; } })() : mirrorGet('clinics');
  const list = normalizeClinics(UMCore.safeParse(raw, null));
  if(!list.length){ showToast('لا توجد نسخة صالحة على هذا الجهاز'); return; }
  if(!confirm(`استرجاع ${list.length} عيادة من نسخة هذا الجهاز؟`)) return;
  clinics = list; hidePlaceholderClinics();
  _seedClinics = false;
  await untombMany({ clinics: list.map(c=>c.id) });
  const ok = await persist('clinics', {allowShrink:true});
  const bar = document.getElementById('wipeBanner'); if(bar) bar.remove();
  closeModal();
  renderAll();
  showToast(ok ? `✅ أُعيدت ${clinics.length} عيادة من نسخة الجهاز` : '⚠️ الاسترجاع محلي فقط — أعد المحاولة عند توفر الاتصال');
}
// Boot-time wipe detector (supervisor): if today's clinic list is far smaller
// than a recent automatic backup, say so loudly and point at the restore.
async function checkWipeBanner(){
  try{
    if(!currentUser || currentUser.role !== 'supervisor') return;
    if(_loadFailed.clinics || _mirrorUsed.clinics) return; // offline — no verdict
    const healthy = clinics.length >= 15 && !_seedClinics;
    if(healthy) return;
    const threshold = _seedClinics ? 15 : Math.max(15, clinics.length * 2);
    const list = await window.storage.list('snap_', true).catch(()=>null);
    const dates = (list && list.keys || []).map(k=>k.replace('snap_','')).sort().reverse();
    let best = null;
    for(const d of dates.slice(0, 4)){
      const res = await window.storage.get('snap_'+d, true).catch(()=>null);
      const snap = res ? UMCore.safeParse(res.value, null) : null;
      const n = snap && Array.isArray(snap.clinics) ? snap.clinics.length : 0;
      if(n >= threshold){ best = {d, n}; break; }
    }
    if(!best) return;
    let bar = document.getElementById('wipeBanner');
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'wipeBanner';
      bar.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:10000; background:#8B0000; color:#fff; padding:10px 14px; font-size:13px; text-align:center; box-shadow:0 2px 12px rgba(0,0,0,.4);';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `⚠️ قائمة العيادات الحالية (${clinics.length}) أصغر بكثير من النسخة الاحتياطية ليوم ${esc(best.d)} (${best.n} عيادة) — البيانات ليست ضائعة.
      <button onclick="openExport()" style="margin-inline-start:10px; background:#fff; color:#8B0000; border:0; border-radius:8px; padding:5px 12px; font-weight:700;">استرجاع الآن</button>`;
  }catch(e){}
}
function copyReport(){
  let rv = reportVisitsBase();
  if(reportRepFilter !== 'all') rv = rv.filter(v=>v.rep===reportRepFilter);
  const rangeLabel = periodLabel();
  let text = `UltraMed Visit Report — ${rangeLabel}${reportRepFilter!=='all' ? ' — '+reportRepFilter : ' — Team'}\n`;
  text += `Visits logged: ${rv.filter(v=>UMCore.isFieldVisit(v)).length}\n`;
  text += `Calls: ${rv.filter(v=>v.callOnly).length}\n`;
  text += `Contacts seen: ${rv.reduce((s,v)=>s+UMCore.contactCount(v),0)}\n`;
  text += `Orders taken: ${rv.filter(v=>v.orderTaken).length}\n`;
  text += `Sales: ${money(rv.reduce((s,v)=>s+(v.orderTotal||0),0))}\n`;
  text += `Clinics covered: ${new Set(rv.map(v=>v.clinicId)).size}\n\n`;
  const b = reportRangeBounds();
  const coach = UMCore.coachInsights({ erpMtd: erpMtdMap(),from:b.from, to:b.to, today:todayStr(), repFilter:reportRepFilter, visits, clinics, targets: blendedTargets(), dayPlans});
  const actions = coach.filter(i=>i.level!=='good');
  if(actions.length){
    text += `Action list:\n`;
    actions.forEach(i=>{ text += `${i.level==='act'?'!!':'!'} ${i.title} — ${i.detail}\n`; });
    text += `\n`;
  }
  text += `Visit detail:\n`;
  [...rv].sort((a,b)=>b.date.localeCompare(a.date)).forEach(v=>{
    const c = clinics.find(x=>x.id===v.clinicId);
    const prodNames = (v.products||[]).map(pid=>productName(pid)).filter(Boolean).join(', ');
    text += `- ${fmtDate(v.date)} · ${clinicNameOf(v.clinicId)} (${v.rep})${v.orderTaken?' · '+money(v.orderTotal):''}${prodNames?' · '+prodNames:''}\n`;
  });
  navigator.clipboard.writeText(text).then(()=>showToast('Report copied')).catch(()=>showToast('Could not copy'));
}

