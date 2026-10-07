// KPI scorecard: the 10 measures for each person on screen, the requests /
// escalations / stands log feeding them (kept out of the calendar), the KPI
// settings saved without touching the other evaluation targets, and the
// government flag in Territory.
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
  await new Promise(r=>server.listen(8202,r));
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
    await page.goto('http://localhost:8202/index.html'); await page.waitForTimeout(300);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };




  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify([
    {id:'a', name:'Alpha Dental Center', rep:M, cls:'A', doctors:[{id:'d1', name:'Dr. Huda Ali', influence:'decider'}]},
    {id:'b', name:'Beta Clinic', rep:M, cls:'B', doctors:[]},
    {id:'moh', name:'Ministry Of Health', rep:M, shared:true, sharedWith:[M, G], doctors:[]},
    {id:'h', name:'Royale Hayat Hospital', rep:'Renova', cls:'B', doctors:[]}]);
  cloud.targets = JSON.stringify({ [M]: {revenue: 1000, month:'2026-10'} });
  cloud.benchmarks = JSON.stringify({ coverage: 70, priority: 90, conversion: 25, tasks: 85 });
  cloud.visits = JSON.stringify([{id:'v1', date:'2026-10-05', ts: 1, rep:M, clinicId:'a', doctorIds:['d1'], products:['p1']}]);
  await page.goto('http://localhost:8202/index.html'); await page.waitForTimeout(300);
  await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); }); await page.waitForTimeout(250);
  const tiles = await page.evaluate(() => { switchView('more'); return document.body.innerText; });
  check('More has "KPI scorecard" and "Requests, escalations & stands"', /KPI scorecard/.test(tiles) && /Requests, escalations & stands/.test(tiles));
  let txt = await page.evaluate(() => { openKpiScorecard(); return document.querySelector('#modalBack').innerText.replace(/\s+/g, ' '); });
  check('team table: every person, total score and the 10 measures with weights', /Total score/.test(txt) && /Sales achievement 30%/.test(txt) && /Answering clients on time 5%/.test(txt) && /Dr\. Ghaith/.test(txt) && /Renova/.test(txt), txt.slice(0, 400));
  // log a request (answered in time), an escalation and a stand through the forms
  const log = async (kind, clinic, text, extra) => page.evaluate(async ({kind, clinic, text, extra}) => { openClientLogForm(kind); document.getElementById('clForm_clinic').value = clinic; document.getElementById('clForm_text').value = text;
    if(extra) Object.keys(extra).forEach(k => { document.getElementById(k).value = extra[k]; }); await saveClientLog(kind); }, {kind, clinic, text, extra});
  await log('request', 'Beta Clinic', 'needs a price list');
  await log('escalation', 'Alpha Dental Center', 'complained about a late delivery', { clForm_via: 'the manager' });
  await log('stand', 'Alpha Dental Center', 'by reception', { clForm_brand: 'Philips Sonicare counter stand' });
  const ev = JSON.parse(cloud.events || '[]');
  check('three records saved to the cloud, owned by the clinic\'s rep, with a time and no calendar date', ev.length === 3 && ev.every(e => e.rep === 'Mariam' && /^2026-10-08T\d\d:\d\d:\d\d$/.test(e.at) && !e.date) && ev.find(e => e.type === 'escalation').via === 'the manager', ev);
  txt = await page.evaluate(() => document.querySelector('#modalBack').innerText.replace(/\s+/g, ' '));
  check('the log lists the open request, the escalation and the stand', /Open requests \(1\)/i.test(txt) && /needs a price list/.test(txt) && /Escalation · Alpha Dental Center · Mariam/.test(txt) && /went to the manager/.test(txt) && /Philips Sonicare counter stand/.test(txt), txt.slice(0, 600));
  await page.evaluate(async () => { const e = events.find(x => x.type === 'request'); await resolveClientLog(e.id); const s = events.find(x => x.kind === 'stand'); await checkStand(s.id); });
  check('answering a request closes it with a time', !!JSON.parse(cloud.events).find(e => e.type === 'request').resolvedAt);
  const cal = await page.evaluate(() => UMCore.calendarDayItems(todayStr(), 'all', { visits, clinics, tasks, events, dayPlans }).events.length);
  check('requests, escalations and stands never appear in the calendar', cal === 0, cal);
  txt = await page.evaluate(() => { _kpiRep = 'Mariam'; _kpiPeriod = 'month'; openKpiScorecard(); return document.querySelector('#modalBack').innerText.replace(/\s+/g, ' '); });
  check('Mariam\'s scorecard: total out of 100, the escalation counted, the request answered on time, the stand tracked', /\d+\/100/.test(txt) && /1 escalation/.test(txt) && /1 of 1 answered within 24h/.test(txt) && /1 active · 1 checked/.test(txt), txt.slice(0, 900));
  check('government coverage: the Ministry (shared with her) counts, the private hospital does not', /0% of 1 government accounts visited per week/.test(txt) || /of 1 government accounts/.test(txt), (txt.match(/[^.]*government[^.]*/) || [''])[0]);
  // settings: saved with the other evaluation targets kept
  await page.evaluate(async () => { openKpiSettings(); document.getElementById('kpi_discountOther').value = '30'; document.getElementById('kpi_openDays').value = '2026-10-15, bad, 2026-10-22'; await saveKpiSettings(); });
  const bm = JSON.parse(cloud.benchmarks);
  check('KPI settings saved; evaluation targets untouched; bad dates dropped', bm.kpi.discountOther === 30 && JSON.stringify(bm.kpi.openDays) === '["2026-10-15","2026-10-22"]' && bm.coverage === 70, bm);
  // government flag in Territory
  await page.evaluate(async () => { openAdminPanel(); setAdminTab('territory'); await toggleGovClinic('h'); });
  check('marking the private hospital as government is saved', JSON.parse(cloud.clinics).find(c => c.id === 'h').gov === true);
  // a rep sees only her own scorecard
  await page.evaluate(async () => { await selectUser('Mariam', 'rep'); }); await page.waitForTimeout(250);
  txt = await page.evaluate(() => { openKpiScorecard(); return document.querySelector('#modalBack').innerText.replace(/\s+/g, ' '); });
  check('a rep sees her own scorecard only (no Team chip, no settings)', /Mariam · This month/.test(txt) && !/Team/.test(txt) && !/KPI settings/.test(txt), txt.slice(0, 200));
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
