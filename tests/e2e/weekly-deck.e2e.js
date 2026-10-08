// Weekly management deck: the supervisor's Thursday PowerPoint is built in the
// browser from the app's own data — this builds one from a known week (4–8 Oct
// 2026, day 8 of the month) and reads it back: the money page with its four
// fixed figures that tie to the ERP, the closed month, the month's plan, new
// business, brands, price, relationships, the people, next week and the
// commitments; the appendix with every figure; Arabic notes; the dialog's
// checklist and "Our ask"; and a real file download.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
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
  await new Promise(r=>server.listen(8201,r));
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
    const off = new Date(2026, 9, 8, 10, 0, 0).getTime() - Date.now(); // 8 Oct 2026, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async (who, role) => {
    await page.goto('http://localhost:8201/index.html'); await page.waitForTimeout(300);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };



  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify([
    {id:'a', name:'Alpha Dental Center', rep:M, cls:'A', doctors:[{id:'d1', name:'Dr. Huda Ali'}], nextFollowUp:'2026-10-13'},
    {id:'b', name:'Beta Clinic', rep:M, cls:'A', doctors:[]},
    {id:'c', name:'Crown Dental Center', rep:'Renova', cls:'A', doctors:[{id:'d2', name:'Dr. Sami'}]},
    {id:'k', name:'Kaifan Dental', rep:'Renova', cls:'A', doctors:[]},
    {id:'f', name:'Farwaniya Polyclinic', rep:'Renova', cls:'B', doctors:[]},
    {id:'u', name:'Blue Dental', rep:'Renova', cls:'B', doctors:[{id:'d3', name:'Dr. Q'}]},
    {id:'g', name:'Gamma Center', rep:G, cls:'B', doctors:[]},
    {id:'n', name:'New Smile Clinic', rep:G, cls:'C', doctors:[]}]);
  cloud.targets = JSON.stringify({ [M]: {revenue: 4640.4, month:'2026-10', brands: {'Intensiv': 660, 'Philips Sonicare': 960}}, Renova: {revenue: 5278.45, month:'2026-10', brands: {'Waterpik': 846.3}}, [G]: {revenue: 9416.15, month:'2026-10', brands: {'Intensiv': 1339.25, 'B&L Biotech': 1461}},
    _history: { '2026-09': { [M]: {revenue: 1500, month:'2026-09'}, Renova: {revenue: 2500, month:'2026-09'} }, '2026-08': { [M]: {revenue: 1800, month:'2026-08'}, Renova: {revenue: 2600, month:'2026-08'} } } });
  cloud.visits = JSON.stringify([
    {id:'v0', date:'2026-09-29', rep:M, clinicId:'a', doctorIds:['d1'], products:['p1'], nextFollowUp:'2026-10-06', ts:0},
    {id:'v1', date:'2026-10-05', rep:M, clinicId:'a', doctorIds:['d1'], products:['p1','p2'], orderTaken:true, orderTotal:40, nextFollowUp:'2026-10-13', mood:'pleased', ts:1},
    {id:'v2', date:'2026-10-06', rep:G, withRep:M, clinicId:'n', products:['p1'], mood:'pleased', ts:2},
    {id:'v3', date:'2026-10-07', rep:'Renova', clinicId:'c', doctorIds:['d2'], products:[], mood:'neutral', ts:3},
    {id:'v4', date:'2026-10-07', rep:M, clinicId:'b', callOnly:true, ts:4},
    {id:'v5', date:'2026-10-05', rep:'Renova', clinicId:'f', products:['p3'], mood:'pleased', ts:5},
    {id:'v6', date:'2026-10-06', rep:'Renova', clinicId:'u', doctorIds:['d3'], products:['p3'], orderTaken:true, orderTotal:198, ts:6}]);
  cloud.dayPlans = JSON.stringify({ '2026-10-05': { [M]: ['a'] }, '2026-10-12': { [M]: ['b'] }, '2026-10-13': { [G]: ['g'] } });
  const H = ',Date,Type,,Invoice#,Date of Stock Issue,Stock Issue #,Code,Account,Customer Class,Code,AltCode,Product,Quantity,Sales Gross,Discount Sales,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name,Remarks,';
  const L = (d, inv, acct, net, product, brand, sm, gross) => { const g = gross == null ? net : gross; return `,${d},${/^SRT/.test(inv) ? 'SalesReturn' : 'SalesInvoice'},Credit,${inv},${d},MIV${inv},001,${acct},Clinics,X1,01/1,${product},1,${g},${Math.round((g - net) * 1000) / 1000},${net},0,0,${net},${brand},${sm},,`; };
  const MZ = 'Mariam Zohair', RA = 'Ranova Ayman Mohammed', GA = 'Ghaith Al Manfe';
  const lines = [H, L('10/07/2026','SINV7001','Gamma Center',50,'Ortho Strips','Intensiv',GA)];
  ['03/08','10/08','17/08','24/08'].forEach((d, i) => lines.push(L(d + '/2026','SINV71' + i,'Alpha Dental Center',325,'Ortho Strips','Intensiv',MZ,430), L(d.replace(/^\d+/, x => String(+x + 1).padStart(2, '0')) + '/2026','SINV72' + i,'Crown Dental Center',500,'Cordless Plus','Waterpik',RA,650)));
  ['01/09','08/09','15/09','22/09'].forEach((d, i) => lines.push(L(d + '/2026','SINV73' + i,'Alpha Dental Center',300,'Ortho Strips','Intensiv',MZ,400), L(d.replace(/^\d+/, x => String(+x + 1).padStart(2, '0')) + '/2026','SINV74' + i,'Crown Dental Center',500,'Cordless Plus','Waterpik',RA,650)));
  lines.push(L('10/09/2026','SINV7501','Kaifan Dental',200,'Sonicare 3100','Philips Export BV',RA,260), L('24/09/2026','SINV7502','Kaifan Dental',200,'Sonicare 3100','Philips Export BV',RA,260));
  lines.push(L('01/10/2026','SINV8000','Alpha Dental Center',70,'Ortho Strips','Intensiv',MZ,90));
  // the week: a first-time product, a new account, a clinic back after 60+ days, a deal with a free line, a sample, a channel sale, a return
  lines.push(L('05/10/2026','SINV8001','Alpha Dental Center',40,'Ortho Strips','Intensiv',MZ,50), L('05/10/2026','SINV8001','Alpha Dental Center',25,'Sonicare 4300','Philips Export BV',MZ,30),
    L('06/10/2026','SINV8002','New Smile Clinic',90,'Ortho Strips','Intensiv',GA,110), L('07/10/2026','SINV8003','Gamma Center',30,'Ortho Strips','Intensiv',GA),
    L('07/10/2026','SINV8004','Crown Dental Center',46.06,'Cordless Plus','Waterpik',RA,60), L('07/10/2026','SINV8004','Crown Dental Center',0,'Waterpik tips','Waterpik',RA,5),
    L('07/10/2026','SINV8005','Beta Clinic',0,'Sample toothpaste','Hismile',GA,4), L('06/10/2026','SINV8006','My Fatoorah',20,'Ortho Strips','Intensiv',RA),
    L('06/10/2026','SRT8007','Alpha Dental Center',-11.25,'Ortho Strips','Intensiv',MZ,-11.25));
  const csv = lines.join('\n');
  await page.goto('http://localhost:8201/index.html'); await page.waitForTimeout(300);
  await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); }); await page.waitForTimeout(250);
  await page.evaluate(async (csv) => { window.confirm = () => true; openErpImport(); await erpAutoImport(csv); await new Promise(r => setTimeout(r, 300));
    const b = [...document.querySelectorAll('button')].find(b => /Save & analyze/.test(b.textContent)); if(b) b.click(); await new Promise(r => setTimeout(r, 800)); try{ closeModal(); }catch(e){} }, csv);
  const tile = await page.evaluate(() => { switchView('more'); const el = document.getElementById('moreBody') || document.body; return /Weekly management deck/.test(el.innerText); });
  check('the supervisor has a "Weekly management deck" tile', tile);
  // the dialog: the checklist before the meeting and the optional ask
  const dlg = await page.evaluate(() => { openWeeklyDeck(); const m = document.querySelector('#modalBack') || document.body; return { text: m.innerText, ask: !!document.getElementById('wdAsk') }; });
  check('the dialog lists what to fix before the meeting (Renova has no visits planned next week) and offers "Our ask"', dlg.ask && /Renova has no visits planned for next week|لا توجد زيارات مخططة لـRenova/.test(dlg.text) && /Kaifan|key \(A\) account|حسابات رئيسية/.test(dlg.text), dlg.text.slice(0, 600));
  // build it and read every slide (and its notes) back with the zip library the bundle ships
  const deck = await page.evaluate(async () => {
    const pres = await buildWeeklyDeck('2026-10-08', { ask: 'Approve two Sonicare demo units for Crown and Kaifan' });
    const b64 = await pres.write({ outputType: 'base64' });
    const zip = await window.JSZip.loadAsync(b64, { base64: true });
    const num = n => parseInt(n.match(/(\d+)\.xml$/)[1], 10);
    const dec = t => t.replace(/<\/?a:t>/g, '').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    const texts = []; for(const n of names){ const x = await zip.file(n).async('string'); texts.push((x.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(dec).join(' ')); }
    const nn = Object.keys(zip.files).filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    const notes = []; for(const n of nn){ const x = await zip.file(n).async('string'); notes.push((x.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(dec).join(' ')); }
    const charts = Object.keys(zip.files).filter(n => /^ppt\/charts\/chart\d+\.xml$/.test(n)).length;
    const links = []; for(const n of Object.keys(zip.files).filter(n => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n))){ const x = await zip.file(n).async('string'); (x.match(/Target="slide\d+\.xml"/g) || []).forEach(t => links.push(t)); }
    return { texts, notes, charts, links: links.length, b64 };
  });
  require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'weekly-deck-test.pptx'), Buffer.from(deck.b64, 'base64'));
  const T = deck.texts, all = T.join(' || ');
  const at = re => T.findIndex(t => re.test(t)), pg = re => T.find(t => re.test(t)) || '';
  const iA0 = at(/Appendix — every figure behind the story/);
  check('the main story is at most 12 pages, then the appendix', iA0 > 0 && iA0 <= 12, iA0);
  check('cover: the week\'s new business in KD — the presenter\'s own new account is not named (R11)', /Field team weekly update/.test(T[0]) && /4 – 8 October 2026/.test(T[0]) && /KD 115 of new business: 1 new account and 1 first-time product/.test(T[0]) && !/New Smile/.test(T[0]), T[0].slice(0, 400));
  const p2 = T[1];
  check('page 2, the week on one page: the money title and the four fixed figures (week, month, new business, price)', /KD 240 invoiced, all clinic invoices within discount limits/.test(p2) && /KD\s+240/.test(p2) && /invoiced 4–7 Oct, returns netted/.test(p2) && /October to date, of a KD 19,335 target/.test(p2) && /new business this week/.test(p2) && /average discount, clinic invoices/.test(p2) && /4 of 4 within limits/.test(p2), p2.slice(0, 700));
  check('page 2 ties to the ERP: 5 invoices with value + 1 sample document + 1 return = KD 239.81; the parts of the week add up', /ERP 4–7 Oct: 5 invoices with value \(KD 251\.06\) \+ 1 sample document \(KD 0\) \+ 1 return \(−KD 11\.25\) = KD 239\.81/.test(p2) && /Clinics that already buy/.test(p2) && /New accounts/.test(p2) && /My Fatoorah and individual customers/.test(p2) && /Returns/.test(p2), p2.slice(500, 1500));
  const p3 = pg(/closed at \d+% of target/);
  check('page 3, the closed month (day 8): September at 90% of target, KD 3,600 of KD 4,000; Renova\'s KD and % both up from August', /September closed at 90% of target: KD 3,600 of KD 4,000/.test(p3) && /August: KD 3,300 of KD 4,400 · 75%/.test(p3) && /KD and % up from Aug/.test(p3) && /no September target/.test(p3), p3.slice(0, 600));
  const p4 = pg(/to go in \d+ working days — the plan/);
  check('page 4, the month and the plan: KD to go in working days, the team and each person, the named levers and the ask', /October: KD 19,025 to go in 15 working days — the plan/.test(p4) && /How we close it/i.test(p4) && /key accounts still to visit in October/.test(p4) && /they bought KD 400/.test(p4) && /KD 198/.test(p4) && /taken in the field, awaiting invoice/.test(p4) && /Intensiv · B&L Biotech/.test(p4) && /“Approve two Sonicare demo units for Crown and Kaifan”/.test(p4), p4.slice(0, 900));
  const p5 = pg(/KD 115 new business:/);
  check('page 5, new business in KD with its invoice; the prospects, government sites apart', /KD 115 new business: 1 new account, 1 first-time product/.test(p5) && /New Smile Clinic/.test(p5) && /Invoice SINV8002/.test(p5) && /Blue Dental/.test(p5) && /Government sites \(tenders\): Farwaniya Polyclinic/.test(p5) && /1 back after 60\+ days/.test(p5), p5.slice(0, 800));
  const p6 = pg(/carried the week|led the week/);
  check('page 6, what sold and the brands against their targets (material targets only, PUSH on the gaps)', /Intensiv carried the week: KD 169 of our KD 240/.test(p6) && /B&L Biotech/.test(p6) && /PUSH/.test(p6) && !/Philips Sonicare\s+KD/.test(p6), p6.slice(0, 700));
  const p7 = pg(/Price discipline/i);
  check('page 7, price discipline: realisation, the weekly discount, no invoice above its limit, the deal\'s free goods, the sample, the returns', /fils paid per KD 1 of list price/.test(p7) && /No clinic invoice above its limit/.test(p7) && /Free goods inside deals/.test(p7) && /Samples: 1 document/.test(p7) && /Returns/.test(p7) && !/margin/i.test(p7), p7.slice(0, 900));
  const p8 = pg(/clinics we visited|doctors and staff met;/);
  check('page 8, doctors and clinics: the visit → invoice share leads; the field counted once; repeat orders; government sites', /90% of October's clinic sales came from clinics we visited/.test(p8) && /clinic visits/.test(p8) && /doctors and staff met/.test(p8) && /government site visited/.test(p8), p8.slice(0, 900));
  const p9 = pg(/What each of us invoiced and won this week/);
  check('page 9, the people: the same rows for everyone, money first', /Mariam/.test(p9) && /Renova/.test(p9) && /Dr\. Ghaith/.test(p9) && /KD\s+54/.test(p9) && /KD\s+66/.test(p9) && /KD\s+120/.test(p9) && /New account New Smile Clinic: first order/.test(p9) && /First-time product at Alpha Dental Center/.test(p9), p9.slice(0, 1000));
  const p12 = pg(/NEXT WEEK ·/);
  check('next week by name: 2 planned, 1 follow-up due, key accounts still due, Renova "no visits saved yet", the order to invoice', /Next week: 2 visits planned and 1 follow-up due/.test(p12) && /No visits saved yet for 11 Oct – 15 Oct/.test(p12) && /Kaifan Dental/.test(p12) && /To invoice: Blue Dental KD 198 \(as logged\)/.test(p12), p12.slice(0, 900));
  const pc = pg(/What you will see from us next Thursday/);
  check('the close: three commitments, the ask in quotes, the recap in page 2\'s words', /OUR COMMITMENTS FOR 11–15 OCT/.test(pc) && /Key accounts: 1 of the 2 still due is booked for next week/.test(pc) && /Invoice the KD 198 taken in the field; push Intensiv and B&L Biotech/.test(pc) && /“Approve two Sonicare demo units for Crown and Kaifan”/.test(pc) && /This week: KD 240 invoiced · KD 115 new business/.test(pc), pc.slice(0, 900));
  check('no "Up on last week" title, no NaN / undefined / null anywhere', !/Up on last week/.test(all) && !/NaN|undefined|\bnull\b/.test(all), (all.match(/.{40}(NaN|undefined|\bnull\b).{40}/) || [''])[0]);
  check('appendix: contents with links, every invoice (with the tie-out), value per person, next week in full, how the figures are built', deck.links >= 10 && /Every invoice of the week, largest first/.test(all) && ['SINV8001', 'SINV8002', 'SINV8003', 'SINV8004', 'SINV8005', 'SINV8006', 'SRT8007'].every(d => all.includes(d)) && /Tie-out: ERP 4–7 Oct/.test(all) && /Value per person, the last 3 closed months/.test(all) && /Next week in full/.test(all) && /How these figures are built/.test(all), deck.links);
  check('appendix: the seed (sample document) is listed with its list value, the deal\'s free line apart', /Seed \(samples\)/.test(all) && /Free inside a deal · SINV8004/.test(all), '');
  check('native charts in the appendix (8 weeks, month by month)', deck.charts >= 2, deck.charts);
  const N = deck.notes.join(' || ');
  check('speaker notes in Arabic: the money, the closed month, the plan, the commitments', /فوترنا هذا الأسبوع 240 ديناراً/.test(N) && /أغلقنا سبتمبر عند 90% من الهدف/.test(N) && /خطتنا بالأسماء/.test(N) && /التزامنا للأسبوع القادم/.test(N), N.slice(0, 500));
  // the button downloads a real .pptx
  await page.evaluate(() => openWeeklyDeck());
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.evaluate(() => downloadWeeklyDeck())]);
  check('the button downloads UltraMed-Weekly-Update-<date>.pptx', /^UltraMed-Weekly-Update-2026-10-08\.pptx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
