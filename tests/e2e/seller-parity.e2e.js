// Seller parity: a supervisor who sells (the default — no setting touched)
// gets every rep feature for himself, built from the same data and the same
// code as a rep's: target and achieved, focus and coaching, per-clinic "what to
// sell", product movement, reports, coverage, planning, visit logging, the
// daily e-mail and the DSR targets upload. Mariam is the control: every check
// is made for her too, so "works for the girls" and "works for him" are the
// same statement.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, salesFixture, blockFirebase } = require('./_env.js');
const SALES_B64 = fs.readFileSync(salesFixture()).toString('base64');
const SEED = JSON.parse(fs.readFileSync(WWW + '/sales-seed-aug26.json', 'utf8'));
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});
const cloud = {};
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const G = 'Dr. Ghaith', M = 'Mariam';

(async()=>{
  await new Promise(r=>server.listen(8193,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext();
  await blockFirebase(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR/i.test(m.text())) errors.push('console: '+m.text()); });
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
  await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
  await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(() => {
    window.storage = {
      get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.__cSet(k, v),
      setMany: async entries => window.__cSetMany(entries),
      delete: async k => window.__cDel(k),
      list: async p => ({ keys: await window.__cList(p) }),
    };
    const off = new Date(2026, 8, 28, 10, 0, 0).getTime() - Date.now(); // 28 Sep 2026, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async (who, role) => {
    await page.goto('http://localhost:8193/index.html'); await page.waitForTimeout(300);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };

  // ---- the same shape of data for Mariam and for Dr. Ghaith ----
  // His record has NO "sells" field — exactly the production record.
  cloud.staff = JSON.stringify([
    {name:'Mariam', role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'},
    {name:G, role:'supervisor', email:'g@x.com'}]);
  const docs = id => [{id:id+'-d1', name:'Dr. '+id+' One', title:'Orthodontist'}];
  cloud.clinics = JSON.stringify([
    {id:'m1', name:'Dental 8 Clinic', rep:M, cls:'A', doctors:docs('m1'), nextFollowUp:'2026-09-20', lastVisit:'2026-09-10'},
    {id:'m2', name:'Smile Care Clinic', rep:M, cls:'B', doctors:docs('m2')},
    {id:'g1', name:'Crown Dental Center', rep:G, cls:'A', doctors:docs('g1'), nextFollowUp:'2026-09-20', lastVisit:'2026-09-10'},
    {id:'g2', name:'Bright Dental Center', rep:G, cls:'B', doctors:docs('g2')},
    {id:'r1', name:'Al Salam Hospital', rep:'Renova', cls:'B', doctors:docs('r1')}]);
  const vis = []; let n = 0;
  [[M,'m1','m2'],[G,'g1','g2']].forEach(([rep,a,b]) => {
    ['2026-09-03','2026-09-10','2026-09-17','2026-09-24'].forEach((d,i) => {
      vis.push({ id:'v'+(++n), clinicId: i%2?b:a, rep, date:d, ts: Date.parse(d+'T09:00:00'), products:[], orderTaken: i%2===0, orders:[], orderItems:{}, orderTotal: i%2===0?120:0,
        doctorIds:[(i%2?b:a)+'-d1'], doctorId:(i%2?b:a)+'-d1', nextFollowUp: i===3 ? '2026-10-08' : null, notes:'seed '+rep, noOrderReason: i%2 ? 'Budget/approval pending' : '' });
    });
  });
  cloud.visits = JSON.stringify(vis);
  const tgt = r => ({ revenue: 5000, visits: 40, month: '2026-09', brands: { 'Philips Sonicare': 2000, Waterpik: 1500, Tepe: 300 } });
  cloud.targets = JSON.stringify({ [M]: tgt(M), Renova: tgt('Renova'), [G]: tgt(G) });
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: SEED.repMap, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });

  // ---- 0) no setting touched: he is a seller ----
  await boot(G, 'supervisor');
  let reps = await page.evaluate(() => REPS.slice());
  check('his staff record has no "Also sells" field, yet he is in the sales team', reps.includes(G) && reps.includes(M), reps);
  await page.evaluate(async (b64) => { const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer; if(typeof openErpImport === 'function') openErpImport(); await erpImportXlsx(buf, 'Ultramed_Sales3_28.xlsx'); await new Promise(r => setTimeout(r, 300)); closeModal(); }, SALES_B64);

  // ---- 1) target and achieved: the same function, a figure for each ----
  const ach = await page.evaluate(({G,M}) => ({ g: bestMonthRevenue(G), m: bestMonthRevenue(M) }), {G,M});
  check('achieved from the ERP file: his clinics give him a figure, as hers give her one', ach.g.amount > 0 && ach.m.amount > 0 && ach.g.basis === 'erp' && ach.m.basis === 'erp', { g: ach.g.amount, m: ach.m.amount });
  const today = await page.evaluate(() => { switchView('today'); renderToday(); return { card: document.getElementById('targetCard').innerText }; });
  check('Today target card has his own row next to the reps', today.card.includes(G) && today.card.includes(M), today.card.split('\n').slice(0,8));

  // ---- 2) scorecard + coaching for him ----
  const sc = await page.evaluate(({G,M}) => { switchView('reports'); reportRepFilter = 'all'; reportRange = 30; reportCustom = null; renderReports(); const cards = [...document.querySelectorAll('#scorecards .score-card')].map(c => c.innerText); const shape = t => (t||'').split('\n').map(l => l.replace(/[\d.,%/]+/g,'#').trim()).filter(l => l && !/Ghaith|Mariam|^DG$|^M$/.test(l)).join('|'); const g = cards.find(t => t.includes(G)), m = cards.find(t => t.includes(M)); const kpis = t => shape(t).split(/\|(YOUR FOCUS THIS PERIOD|COACHING GUIDANCE)\|/i)[0]; return { g: kpis(g), m: kpis(m), gHead: /YOUR FOCUS THIS PERIOD/i.test(g||''), mHead: /COACHING GUIDANCE/i.test(m||''), ok: !!g && !!m }; }, {G,M});
  check('Reports: his scorecard has the same metrics as hers, with HIS guidance ("Your focus this period") where hers reads "Coaching guidance" for the supervisor', sc.ok && sc.g === sc.m && sc.g.length > 20 && sc.gHead && sc.mHead, sc);
  const rep = await page.evaluate(({G,M}) => { const out = {}; [G,M].forEach(r => { reportRepFilter = r; renderReports(); out[r] = reportVisitsBase().filter(v => v.rep === r).length; }); reportRepFilter = 'all'; const html = buildMasterReportBody('en','full'); out.master = html.includes(G) && html.includes(M); return out; }, {G,M});
  check('Reports filtered on him count his visits, as for her; the master report lists him', rep[G] === 4 && rep[M] === 4 && rep.master, rep);

  // ---- 3) what to sell: per-clinic brand targets ----
  const ca = await page.evaluate(({G,M}) => { const out = {}; [G,M].forEach(r => { caRep = r; switchView('clanalysis'); renderClinicAnalysis(); out[r] = document.getElementById('caBody').innerText; }); out.chips = document.getElementById('caRepChips').innerText; return out; }, {G,M});
  check('Clinic analysis ("what to sell"): his clinics get their brand targets, as hers do', /Crown Dental Center/.test(ca[G]) && /Dental 8 Clinic/.test(ca[M]) && /Philips|Waterpik/.test(ca[G]) && ca.chips.includes(G), { g: ca[G].split('\n').slice(0,4), m: ca[M].split('\n').slice(0,4) });
  const alloc = await page.evaluate(({G,M}) => { const f = r => { const a = UMCore.allocateClinicTargets({ rep: r, clinics, erpRows: erpPeriods().flatMap(p => p.rows||[]), erpMap: erpSales.erpMap || {}, brandTargets: targets[r].brands }); return Object.values(a.byClinic).reduce((s,c) => s + c.total, 0); }; return { g: f(G), m: f(M) }; }, {G,M});
  check('the per-clinic split adds up to the brand targets for him and for her', Math.abs(alloc.g - 3800) < 0.5 && Math.abs(alloc.m - 3800) < 0.5, alloc);
  const pm = await page.evaluate(({G,M}) => { const out = {}; [G,M].forEach(r => { _pmRep = r; openProductMovement(); out[r] = (window._pm || {}).products || 0; closeModal(); }); return out; }, {G,M});
  check('Product movement filtered on him shows his products, as for her', pm[G] > 0 && pm[M] > 0, pm);

  // ---- 4) coverage, clinics, planning ----
  const cov = await page.evaluate(({G}) => { openCoverageBoard(); setCovRep(G); const t = document.getElementById('modalInner').innerText; closeModal(); return t; }, {G});
  check('Coverage board filtered on him lists his clinics', /Crown Dental Center/.test(cov) && !/Dental 8 Clinic/.test(cov), cov.split('\n').slice(0,5));
  const cl = await page.evaluate(({G}) => { switchView('clinics'); clinicRepFilter = G; renderClinics(); return document.getElementById('view-clinics') ? document.getElementById('view-clinics').innerText : document.body.innerText; }, {G});
  check('Clinics filtered on him show his clinics', /Crown Dental Center/.test(cl) && /Bright Dental Center/.test(cl), cl.split('\n').slice(0,6));
  const plan = await page.evaluate(({G}) => { openDatePlanner('2026-09-29', G); const t = document.getElementById('modalInner').innerText; closeModal(); return t; }, {G});
  check('Day planner plans for him with his clinics', plan.includes(G) && /Crown Dental Center/.test(plan), plan.split('\n').slice(0,4));

  // ---- 5) visits: logs under his name; a rep can log a joint visit with him ----
  const lv = await page.evaluate(async () => {
    switchView('log'); prepLogView('g1'); const chips = [...document.querySelectorAll('#logAsChips .chip')].map(c => c.textContent.trim()); const def = logAsRep;
    pickClinic('g1'); selectedDoctorIds = ['g1-d1']; document.getElementById('visitNotes').value = 'parity visit';
    window._lastVisitSaveAt = 0; await saveVisit(); await new Promise(r => setTimeout(r, 300));
    const v = visits.find(x => x.notes === 'parity visit'); return { chips, def, rep: v && v.rep };
  });
  check('Log Visit: his name first and default, the visit is filed under him', lv.chips[0] === G && lv.def === G && lv.rep === G, lv);

  // ---- 6) daily e-mail: his own day plus the team ----
  const mail = await page.evaluate(({G,M}) => { const d = digestData(); const mine = UMCore.dailyDigest({ kind:'evening', data:d, reps: REPS, rep: G }); const hers = UMCore.dailyDigest({ kind:'evening', data:d, reps: REPS, rep: M }); const team = UMCore.dailyDigest({ kind:'morning', data:d, reps: REPS }); return { mine: mine.subject + '\n' + mine.text, hers: hers.subject, team: team.text }; }, {G,M});
  check('Daily e-mail: a personal digest for him built like hers, and his line in the team digest', mail.mine.includes(G) && !/Mariam/.test(mail.mine) && mail.hers.includes(M) && mail.team.includes(G + ':'), { mine: mail.mine.split('\n').slice(0,3), team: mail.team.split('\n').filter(l => l.includes(G)).slice(0,1) });

  // ---- 7) the DSR upload finds his block ----
  const dsr = await page.evaluate(() => {
    const rows = [['Salesman ','Brand','Target','MTD Sales 26','Achieved vs. Target'],
      ['Ghaith Al Manfe','Philips Sonicare',2080,null,0],[null,'Waterpik',1612,null,0],['Ghaith Al Manfe Total',null,3692,0,0],
      ['Mariam Zohair','Philips Sonicare',600,null,0],[null,'Waterpik',465,null,0],['Mariam Zohair Total',null,1065,0,0]];
    const r = UMCore.parseDsrTargets([{ name:'Sheet2', rows }], REPS); return { matched: r.matched.map(m => m.rep + ':' + m.revenue), err: r.error };
  });
  check('DSR targets file: his block ("Ghaith Al Manfe") is read for him, like hers', !dsr.err && dsr.matched.includes(G + ':3692') && dsr.matched.includes(M + ':1065'), dsr);

  // ---- 8) as Mariam: the same features exist for her (the control) ----
  await boot(M, 'rep');
  const her = await page.evaluate(() => { switchView('today'); renderToday(); const out = { card: document.getElementById('targetCard').innerText };
    switchView('reports'); renderReports(); out.sc = document.getElementById('scorecards').innerText;
    switchView('log'); prepLogView('m1'); out.joint = [...document.querySelectorAll('#jointChips .chip')].map(c => c.textContent.trim()); return out; });
  check('control: Mariam sees her own target and her own scorecard with "Your focus this period"', /KD/.test(her.card) && her.sc.includes('Mariam') && /YOUR FOCUS THIS PERIOD/i.test(her.sc), { card: her.card.split('\n').slice(0,3), sc: her.sc.split('\n').slice(0,3) });
  check('Mariam can mark a joint visit with him', her.joint.some(t => t.includes(G)), her.joint);

  // ---- 9) switching "Also sells" off still removes him, and nothing breaks for a seller with no clinics ----
  cloud.staff = JSON.stringify([{name:'Mariam', role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com', sells:false}]);
  await boot(G, 'supervisor');
  reps = await page.evaluate(() => REPS.slice());
  check('with "Also sells" switched off he leaves the sales team', !reps.includes(G), reps);
  cloud.staff = JSON.stringify([{name:'Mariam', role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify(JSON.parse(cloud.clinics).map(c => c.rep === G ? Object.assign(c, { rep: M }) : c));
  await boot(G, 'supervisor');
  await page.evaluate(() => { ['today','clinics','log','reports','clanalysis','more'].forEach(v => { switchView(v); }); caRep = REPS.find(r => r === 'Dr. Ghaith'); renderClinicAnalysis(); openCoverageBoard(); setCovRep('Dr. Ghaith'); closeModal(); });

  check('no page errors anywhere', errors.length === 0, errors.slice(0,5).map(e => String(e).slice(0,200)));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
