// A supervisor who also sells (staff.sells = true) counts like a rep, and a
// clinic handed over mid-year keeps its earlier months with the previous owner.
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

(async()=>{
  await new Promise(r=>server.listen(8191,r));
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
    // fixed clock: 28 Sep 2026 (the synthetic file is Sep 1–21)
    const off = new Date(2026, 8, 28, 10, 0, 0).getTime() - Date.now(); // clock keeps ticking, shifted into September
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async () => {
    await page.goto('http://localhost:8191/index.html'); await page.waitForTimeout(300);
    await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); });
    await page.waitForTimeout(200);
  };
  const importFile = () => page.evaluate(async (b64) => {
    const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer;
    if(typeof openErpImport === 'function') openErpImport();
    await erpImportXlsx(buf, 'Ultramed_Sales3_28.xlsx');
    await new Promise(r => setTimeout(r, 300));
  }, SALES_B64);

  // ---- 1) supervisor WITHOUT the flag: two reps, as before ----
  cloud.staff = JSON.stringify([
    {name:'Mariam', role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'},
    {name:'Dr. Ghaith', role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify([{id:'c1',name:'Dental 8 Clinic',rep:'Mariam',cls:'A'},{id:'c2',name:'Crown Dental Center',rep:'Renova',cls:'A'}]);
  cloud.erpSales = JSON.stringify({ periods: [], repMapGlobal: SEED.repMap, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  await boot();
  let reps = await page.evaluate(() => REPS.slice());
  check('without the flag the supervisor is not a rep', JSON.stringify(reps)===JSON.stringify(['Mariam','Renova']), reps);

  // ---- 2) flag on (as Admin → Team would save it) → third rep everywhere ----
  const st = JSON.parse(cloud.staff); st[2].sells = true; cloud.staff = JSON.stringify(st);
  await boot();
  reps = await page.evaluate(() => REPS.slice());
  check('with sells:true the supervisor joins REPS', JSON.stringify(reps)===JSON.stringify(['Mariam','Renova','Dr. Ghaith']), reps);
  const chips = await page.evaluate(() => { openAdminPanel(); setAdminTab('territory'); return [...document.querySelectorAll('#apTerrBody .chip')].map(c => c.textContent.trim()); });
  check('clinic assignment offers the supervisor as an owner', chips.includes('Dr. Ghaith'), chips.slice(0,6));
  const guess = await page.evaluate(() => UMCore.guessRepMap(['Ghaith Al Manfe', 'Mariam Zohair', 'Mr. Sundeep Kohli'], REPS));
  check('his ERP salesman name maps to him by first name', guess['Ghaith Al Manfe']==='Dr. Ghaith' && guess['Mr. Sundeep Kohli']===null, guess);

  // ---- 3) handover: Crown → Dr. Ghaith from 1 Sep keeps nothing for Renova; from 1 Oct keeps all of Sep for her ----
  await page.evaluate(() => closeModal());
  await importFile();
  const before = await page.evaluate(() => erpMtdMap());
  check('September file imported, Crown counted for Renova', before.Renova && before.Renova.amount > 0 && !before['Dr. Ghaith'], before);
  await page.evaluate(async () => { await reassignClinic('c2', 'Dr. Ghaith'); });
  let c2 = JSON.parse(cloud.clinics).find(c => c.id==='c2');
  check('reassign records the handover from the 1st of this month', c2.rep==='Dr. Ghaith' && c2.prevRep==='Renova' && c2.repSince==='2026-09-01', c2);
  let after = await page.evaluate(() => erpMtdMap());
  check('this month\'s Crown sales now count for the supervisor', after['Dr. Ghaith'] && Math.abs((after['Dr. Ghaith'].amount + (after.Renova ? after.Renova.amount : 0)) - before.Renova.amount) < 0.01 && after['Dr. Ghaith'].amount > 0, after);
  // an earlier handover date (set as if done next month) leaves September with Renova
  await page.evaluate(async () => { const c = clinics.find(x => x.id==='c2'); c.repSince = '2026-10-01'; await persist('clinics'); });
  after = await page.evaluate(() => erpMtdMap());
  check('with repSince 1 Oct, September stays entirely with the previous owner', !after['Dr. Ghaith'] && after.Renova && Math.abs(after.Renova.amount - before.Renova.amount) < 0.01, after);
  // handing it back within the same month erases the handover
  await page.evaluate(async () => { const c = clinics.find(x => x.id==='c2'); c.repSince = '2026-09-01'; await persist('clinics'); await reassignClinic('c2', 'Renova'); });
  c2 = JSON.parse(cloud.clinics).find(c => c.id==='c2');
  check('handing a clinic back in the same month clears the handover', c2.rep==='Renova' && !c2.prevRep && !c2.repSince, c2);

  // ---- 4) a name once ignored that now matches a seller is asked about again ----
  const es = JSON.parse(cloud.erpSales); es.repMapGlobal = Object.assign({}, es.repMapGlobal, { 'Ghaith Al Manfe': null }); cloud.erpSales = JSON.stringify(es);
  await boot();
  const asked = await page.evaluate(() => {
    const stored = erpSales.repMapGlobal || {}; const guess = UMCore.guessRepMap(['Ghaith Al Manfe','Reem Omar'], REPS);
    const known = sm => Object.prototype.hasOwnProperty.call(stored, sm) && !(stored[sm] === null && guess[sm]);
    return { ghaith: known('Ghaith Al Manfe'), reem: known('Reem Omar') };
  });
  check('an ignored name that now matches the selling supervisor is re-asked; other ignored names stay silent', asked.ghaith===false && asked.reem===true, asked);

  const realErrors = errors.filter(e => !/boom/.test(String(e)));
  check('no page errors', realErrors.length===0, realErrors.slice(0,5).map(e=>String(e).slice(0,200)));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
