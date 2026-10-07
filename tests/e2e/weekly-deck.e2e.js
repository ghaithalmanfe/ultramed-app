// Weekly management deck: the supervisor's Thursday PowerPoint is built in the
// browser from the app's own data — this builds one from a known week and
// reads it back: every slide present, the right figures on them, every invoice,
// visit and win of the week in the appendix, and a real file download.
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
    const off = new Date(2026, 9, 8, 10, 0, 0).getTime() - Date.now(); // 28 Sep 2026, ticking
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
    {id:'c', name:'Crown Dental Center', rep:'Renova', cls:'A', doctors:[]},
    {id:'g', name:'Gamma Center', rep:G, cls:'B', doctors:[]},
    {id:'n', name:'New Smile Clinic', rep:G, cls:'C', doctors:[]}]);
  cloud.targets = JSON.stringify({ [M]: {revenue: 4640.4, month:'2026-10', brands: {'Intensiv': 660, 'Philips Sonicare': 960}}, Renova: {revenue: 5278.45, month:'2026-10', brands: {'Waterpik': 846.3}}, [G]: {revenue: 9416.15, month:'2026-10', brands: {'Intensiv': 1339.25, 'B&L Biotech': 1461}} });
  cloud.visits = JSON.stringify([
    {id:'v1', date:'2026-10-05', rep:M, clinicId:'a', doctorIds:['d1'], products:['p1','p2'], orderTaken:true, orderTotal:40, nextFollowUp:'2026-10-13', ts:1},
    {id:'v2', date:'2026-10-06', rep:G, withRep:M, clinicId:'n', products:['p1'], ts:2},
    {id:'v3', date:'2026-10-07', rep:'Renova', clinicId:'c', products:[], ts:3},
    {id:'v4', date:'2026-10-07', rep:M, clinicId:'b', callOnly:true, ts:4}]);
  cloud.dayPlans = JSON.stringify({ '2026-10-12': { [M]: ['b'] }, '2026-10-13': { Renova: ['c'] } });
  const H = ',Date,Type,,Invoice#,Date of Stock Issue,Stock Issue #,Code,Account,Customer Class,Code,AltCode,Product,Quantity,Sales Gross,Discount Sales,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name,Remarks,';
  const L = (d, inv, acct, net, product, brand, sm) => `,${d},SalesInvoice,Credit,${inv},${d},MIV${inv},001,${acct},Clinics,X1,01/1,${product},1,${net},0,${net},0,0,${net},${brand},${sm},,`;
  const csv = [H,
    L('10/07/2026','SINV7001','Gamma Center',50,'Ortho Strips','Intensiv','Ghaith Al Manfe'),
    L('28/09/2026','SINV7002','Alpha Dental Center',100,'Ortho Strips','Intensiv','Mariam Zohair'),
    L('05/10/2026','SINV7003','Alpha Dental Center',40,'Ortho Strips','Intensiv','Mariam Zohair'),
    L('05/10/2026','SINV7003','Alpha Dental Center',25,'Sonicare 4300','Philips Export BV','Mariam Zohair'),
    L('06/10/2026','SINV7004','New Smile Clinic',90,'Ortho Strips','Intensiv','Ghaith Al Manfe'),
    L('07/10/2026','SINV7005','Gamma Center',30,'Ortho Strips','Intensiv','Ghaith Al Manfe'),
    L('07/10/2026','SINV7006','Crown Dental Center',46.06,'Cordless Plus','Waterpik','Ranova Ayman Mohammed'),
    L('07/10/2026','SINV7007','Beta Clinic',0,'Sample toothpaste','Hismile','Ghaith Al Manfe')].join('\n');
  await page.goto('http://localhost:8201/index.html'); await page.waitForTimeout(300);
  await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); }); await page.waitForTimeout(250);
  await page.evaluate(async (csv) => { window.confirm = () => true; openErpImport(); await erpAutoImport(csv); await new Promise(r => setTimeout(r, 300));
    const b = [...document.querySelectorAll('button')].find(b => /Save & analyze/.test(b.textContent)); if(b) b.click(); await new Promise(r => setTimeout(r, 800)); try{ closeModal(); }catch(e){} }, csv);
  const tile = await page.evaluate(() => { switchView('more'); const el = document.getElementById('moreBody') || document.body; return /Weekly management deck/.test(el.innerText); });
  check('the supervisor has a "Weekly management deck" tile', tile);
  // build it and read every slide back with the zip library the bundle ships
  const deck = await page.evaluate(async () => {
    const pres = await buildWeeklyDeck('2026-10-08');
    const b64 = await pres.write({ outputType: 'base64' });
    const zip = await window.JSZip.loadAsync(b64, { base64: true });
    const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
    const texts = []; for(const n of names){ const x = await zip.file(n).async('string'); texts.push((x.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(t => t.replace(/<\/?a:t>/g, '')).join(' ')); }
    const charts = Object.keys(zip.files).filter(n => /^ppt\/charts\/chart\d+\.xml$/.test(n)).length;
    return { b64len: b64.length, texts, charts, b64 };
  });
  require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'weekly-deck-test.pptx'), Buffer.from(deck.b64, 'base64'));
  const T = deck.texts, all = T.join(' || ');
  check('the deck has its slides: title, glance, target, week by week, brands, field, wins, next week, appendix, method', T.length >= 12 && /Field Team Weekly Update/.test(T[0]) && /Week of 4 – 8 Oct 2026/.test(T[0]), T.map(t => t.slice(0, 40)));
  check('three native charts (target, week by week, brands)', deck.charts === 3, deck.charts);
  const glance = T.find(t => /The week at a glance/.test(t)) || '';
  check('glance: KD 231 invoiced (65 + 120 + 46), up 131% on the week before (100), field visits and wins', /KD 231/.test(glance) && /▲ 131% on the week before/.test(glance) && /Field visits/.test(glance) && /Wins this week/.test(glance) && /2 new · 1 back · 1 new products · 1 sampled/.test(glance), glance.slice(0, 400));
  check('highlights name the week\'s leader and the new accounts (the sample at Beta is Mariam\'s clinic, so it is hers)', /Dr\. Ghaith led the week with KD 120 invoiced \(2 invoices\)/.test(glance) && /2 new accounts placed a first order: New Smile Clinic, Crown Dental Center/.test(glance), glance.slice(300, 900));
  const tgt = T.find(t => /Month to date against target/.test(t)) || '';
  check('target table: Mariam 65 this week, 65 month to date of 4,640 (1%)', /Mariam KD 65 KD 65 KD 4,640 1%/.test(tgt), tgt.slice(0, 400));
  const wins = T.find(t => /Wins of the week/.test(t)) || '';
  check('wins slide: new account, back after 60+ days, new product placed, largest invoice', /New Smile Clinic/.test(wins) && /Gamma Center/.test(wins) && /Sonicare 4300 — Alpha Dental Center/.test(wins) && /KD 90\.00/.test(wins), wins.slice(0, 600));
  check('appendix lists every invoice of the week (5 with a value + the sample line)', /SINV7003/.test(all) && /SINV7004/.test(all) && /SINV7005/.test(all) && /SINV7006/.test(all) && /SINV7007/.test(all) && !/SINV7002/.test(all.split('every invoice')[1] || ''), '');
  check('appendix lists every visit and call with doctors met', /Alpha Dental Center visit Dr\. Huda Ali/.test(all) && /Dr\. Ghaith \+ Mariam/.test(all) && /Beta Clinic call/.test(all), '');
  check('next week shows the planned visits and follow-ups', /1 planned visit/.test(all) && /Mon · Beta Clinic/.test(all) && /13 Oct · Alpha Dental Center/.test(all), '');
  const kpi = T.find(t => /KPI scorecard – month to date/.test(t)) || '';
  check('KPI slide: the 10 measures with weights and a total out of 100 for each person', /Total score/.test(kpi) && /Sales achievement 30%/.test(kpi) && /Answering clients on time 5%/.test(kpi) && (kpi.match(/\d+ \/ 100/g) || []).length === 3, kpi.slice(0, 300));
  // the button downloads a real .pptx
  await page.evaluate(() => openWeeklyDeck());
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.evaluate(() => downloadWeeklyDeck())]);
  check('the button downloads UltraMed-Weekly-Update-<date>.pptx', /^UltraMed-Weekly-Update-2026-10-08\.pptx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
