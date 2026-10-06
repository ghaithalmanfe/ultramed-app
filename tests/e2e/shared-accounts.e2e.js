// Shared accounts and October handovers: an invoice the supervisor issues at a
// clinic still recorded under Mariam counts for Mariam (territory rule) until
// the clinic is reassigned to him; a hospital marked SHARED counts each invoice
// for whoever issued it, from the 1st of the month; September never moves.

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
  await new Promise(r=>server.listen(8198,r));
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
    const off = new Date(2026, 9, 6, 10, 0, 0).getTime() - Date.now(); // 28 Sep 2026, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async (who, role) => {
    await page.goto('http://localhost:8198/index.html'); await page.waitForTimeout(300);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };


  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify([
    {id:'nhc', name:'Dr. Nael Al Hazeem Dental Center - Sharq', rep:M, cls:'C', doctors:[]},
    {id:'moh', name:'Ministry Of Health', rep:M, cls:'B', doctors:[]},
    {id:'m1', name:'Dental 8 Clinic', rep:M, cls:'A', doctors:[]}]);
  cloud.targets = JSON.stringify({ [G]: {revenue: 9416.15, month:'2026-10'}, [M]: {revenue: 4640.4, month:'2026-10'} });
  // Synthetic export in the ERP's own column layout: Sep and Oct lines.
  const H = ',Date,Type,,Invoice#,Date of Stock Issue,Stock Issue #,Code,Account,Customer Class,Code,AltCode,Product,Quantity,Sales Gross,Discount Sales,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name,Remarks,';
  const L = (d, inv, acct, cls, net, sm) => `,${d},SalesInvoice,Credit,${inv},${d},MIV${inv},001,${acct},${cls},X1,01/1,Test product,1,${net},0,${net},0,0,${net},Intensiv,${sm},,`;
  const csv = [H,
    L('20/09/2026','SINV9001','Dr. Nael Al Hazeem Dental Center - Sharq','Clinics',40,'Ghaith Al Manfe'),
    L('05/10/2026','SINV9002','Dr. Nael Al Hazeem Dental Center - Sharq','Clinics',9.25,'Ghaith Al Manfe'),
    L('05/10/2026','SINV9003','Ministry Of Health','Government',100,'Ghaith Al Manfe'),
    L('05/10/2026','SINV9004','Ministry Of Health','Government',30,'Mariam Zohair'),
    L('05/10/2026','SINV9005','My Fatoorah','Online Customers ',12,'Ghaith Al Manfe'),
    L('05/10/2026','SINV9006','Dental 8 Clinic','Clinics',50,'Mariam Zohair')].join('\n');
  await page.goto('http://localhost:8198/index.html'); await page.waitForTimeout(300);
  await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); }); await page.waitForTimeout(250);
  await page.evaluate(async (csv) => { window.confirm = () => true; openErpImport(); await erpAutoImport(csv); await new Promise(r => setTimeout(r, 300));
    const b = [...document.querySelectorAll('button')].find(b => /Save & analyze/.test(b.textContent)); if(b) b.click(); await new Promise(r => setTimeout(r, 800)); try{ closeModal(); }catch(e){} }, csv);
  const ach = () => page.evaluate(() => { const d = digestData(); return { g: UMCore.monthAchievement('Dr. Ghaith', d).amount, m: UMCore.monthAchievement('Mariam', d).amount }; });
  const card = () => page.evaluate(() => { renderToday(); return document.getElementById('targetCard').innerText.replace(/\s+/g, ' '); });
  const mapped = await page.evaluate(() => JSON.stringify(erpSales.repMapGlobal));
  check('both salesmen mapped (Ghaith Al Manfe → Dr. Ghaith)', /Ghaith Al Manfe":"Dr. Ghaith/.test(mapped) && /Mariam Zohair":"Mariam/.test(mapped), mapped);
  let a = await ach();
  // the reported bug: his 9.25 at NHC and his 100 at the ministry count for Mariam
  check('before: clinics still under Mariam take his invoices (territory rule)', a.g === 12 && a.m === 189.25, a);
  await page.evaluate(async () => { await reassignClinic('nhc', 'Dr. Ghaith'); await toggleSharedClinic('moh'); });
  const c = await page.evaluate(() => clinics.filter(x => ['nhc','moh'].includes(x.id)).map(x => ({id:x.id, rep:x.rep, prevRep:x.prevRep, repSince:x.repSince, shared:x.shared, sharedSince:x.sharedSince})));
  check('NHC handed over from 1 Oct, Mariam kept as previous owner', c[0].rep === G && c[0].prevRep === M && c[0].repSince === '2026-10-01', c[0]);
  check('ministry marked shared from 1 Oct, owner unchanged', c[1].shared === true && c[1].sharedSince === '2026-10-01' && c[1].rep === M, c[1]);
  a = await ach();
  check('after: his October = 12 + 9.25 + 100 = 121.25; Mariam keeps her own 30 + 50', a.g === 121.25 && a.m === 80, a);
  const txt = await card();
  check('Today card shows his 121.25 of 9416.15', /Dr\. Ghaith 1% 121\.25 KD of 9416\.15 KD/.test(txt), txt.slice(0, 400));
  const saved = JSON.parse(cloud.clinics).filter(x => ['nhc','moh'].includes(x.id)).map(x => [x.id, x.rep, x.shared || false]);
  check('both changes saved to the cloud', JSON.stringify(saved) === JSON.stringify([['nhc', G, false], ['moh', M, true]]), saved);
  // September never moves: the 40 at NHC on 20 Sep is still Mariam's
  const sep = await page.evaluate(() => { const cl = clinics; const r = { customer: 'Dr. Nael Al Hazeem Dental Center - Sharq', salesman: 'Ghaith Al Manfe', date: '2026-09-20', net: 40 };
    return UMCore.erpRowRep(r, cl, erpMap, erpSales.repMapGlobal || {}); });
  check('September line at NHC stays with Mariam', sep === M, sep);
  const terr = await page.evaluate(() => { openAdminPanel(); const t = [...document.querySelectorAll('button, .tab, .chip')].find(x => /Territory/i.test(x.textContent)); if(t) t.click(); const s = document.getElementById('apTerrSearch'); if(s){ s.value = 'ministry'; renderAdminTerritory(); } const b = document.getElementById('apTerrBody'); return b ? b.innerText.replace(/\s+/g, ' ') : ''; });
  check('territory screen shows the Shared chip and explains it', /shared – each invoice counts for whoever issued it/.test(terr) && /Shared/.test(terr), terr.slice(0, 200));
  await page.evaluate(async () => { await toggleSharedClinic('moh'); });
  a = await ach();
  check('un-sharing gives the ministry back to its owner', a.g === 21.25 && a.m === 180, a);
  // ---- uploading a clinic distribution file: preview first, saved on tap ----
  const distCsv = ['Name,Account,Previous rep,Now with,Avg / month (KD)',
    'Mariam,Dental 8 Clinic,Mariam,Renova,35', 'Shared,Ministry Of Health,Mariam,Mariam + Ghaith,600',
    'Ghaith,Dr. Nael Al Hazeem Dental Center - Sharq,Mariam,Ghaith,374', 'Renova,White Dental Center,Renova,Renova,52',
    'Ghaith total (1 account),,,,374'].join('\n');
  const distPath = path.join(require('os').tmpdir(), 'dist-test.csv'); fs.writeFileSync(distPath, distCsv);
  await page.evaluate(() => { openAdminPanel(); setAdminTab('territory'); });
  await page.setInputFiles('#apDistFile', distPath);
  await page.waitForTimeout(500);
  const prev = await page.evaluate(() => document.querySelector('#modalBack').innerText.replace(/\s+/g, ' '));
  check('preview lists the 2 changes before anything is saved', /2 changes/.test(prev) && /Dental 8 Clinic/.test(prev) && /Mariam → Renova/.test(prev) && /shared/.test(prev), prev.slice(0, 500));
  check('preview: NHC already his (no change); White Dental not in the app', /1 clinic already as in the file/.test(prev) && /White Dental Center/.test(prev) && /not in the app/.test(prev), prev.slice(0, 700));
  check('nothing saved yet', JSON.parse(cloud.clinics).find(x => x.id === 'm1').rep === M);
  await page.evaluate(async () => { const b = [...document.querySelectorAll('button')].find(b => /Save 2 changes/.test(b.textContent)); b.click(); await new Promise(r => setTimeout(r, 700)); });
  const done = await page.evaluate(() => document.querySelector('#modalBack').innerText.replace(/\s+/g, ' '));
  const cl2 = JSON.parse(cloud.clinics);
  const m1 = cl2.find(x => x.id === 'm1'), moh = cl2.find(x => x.id === 'moh');
  check('saved: Dental 8 → Renova from 1 Oct, ministry shared again', /Distribution saved/.test(done) && m1.rep === 'Renova' && m1.prevRep === M && m1.repSince === '2026-10-01' && moh.shared === true && moh.rep === M, { done: done.slice(0, 120), m1, moh });
  a = await ach();
  check('after the upload: Mariam\'s 50 at Dental 8 is now Renova\'s; his ministry invoice is his', a.g === 121.25 && a.m === 30, a);
  // ---- the girls' invoice at his clinic: counted for him, and the Today card says who invoiced for whom ----
  const girlsCsv = [H, L('03/10/2026','SINV9101','Dr. Nael Al Hazeem Dental Center - Sharq','Clinics',60,'Mariam Zohair')].join('\n');
  await page.evaluate(async (csv) => { window.confirm = () => true; openErpImport(); await erpAutoImport(csv); await new Promise(r => setTimeout(r, 600)); try{ closeModal(); }catch(e){} }, girlsCsv);
  a = await ach();
  check('Mariam\'s 60 at NHC (his clinic) counts for him', a.g === 181.25, a);
  const note = await card();
  check('Today card warns: Mariam invoiced at his clinic, counted for the owner', /Invoices on another rep's clinic this month/.test(note) && /Mariam invoiced at Dr\. Nael Al Hazeem Dental Center - Sharq · 1 × · 60\.00 KD · counted for the clinic owner: Dr\. Ghaith/.test(note), note.slice(-300));
  const det = await page.evaluate(() => { const d = document.querySelector('#targetCard details'); if(!d) return ''; d.querySelector('summary').click(); return d.innerText.replace(/\s+/g, ' '); });
  const view = await page.evaluate(() => activeView);
  check('tapping the line opens its invoices: number, date, amount and product', /SINV9101 · Oct 3 · 60\.00 KD/.test(det) && /Test product · Intensiv · 1 × · 60\.00 KD/.test(det) && view === 'today', { det, view });
  // an older cached core.js (no invoice details) must not blank the Today screen
  const stale = await page.evaluate(() => { const real = UMCore.crossInvoices; UMCore.crossInvoices = d => real(d).map(x => { const { details, ...rest } = x; return rest; });
    let threw = null; try{ renderToday(); }catch(e){ threw = e.message; } const t = document.getElementById('targetCard').innerText; UMCore.crossInvoices = real; return { threw, card: /October target/.test(t), note: /another rep/.test(t) }; });
  check('a stale core.js without invoice details still draws the Today card and the notice', !stale.threw && stale.card && stale.note, stale);
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
