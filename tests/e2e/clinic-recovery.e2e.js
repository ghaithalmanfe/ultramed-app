// Missing clinics, from the daily backups (v116, v117: brought back on their own). Renova's clinics were gone
// from the list. Export → Automatic backups → "Find missing clinics" lists
// every clinic a daily backup holds and the list does not, with its owner and
// the last day a backup had it, and brings back only the ticked ones — the
// visits, tasks and sales files stay exactly as they are. A clinic deleted in
// the app (recycle bin) is listed but not ticked. Port 8217.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8217;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const cloud = {};
const mode = { failGet: null };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const G = 'Dr. Ghaith', M = 'Mariam', R = 'Renova';
const C = (id, name, rep, cls) => ({ id, name, rep, cls: cls || 'B', doctors: [] });
const M1 = C('m1', 'Dental 8 Clinic', M, 'A'), G1 = C('g1', 'Bayan Dental Center', G, 'A');
const R1 = C('r1', 'Crown Dental', R, 'A'), R1b = C('r1', 'Crown Dental Center', R, 'A'), R2 = C('r2', 'Jibla Dental Center', R), R3 = C('r3', 'Apex Dental Center', R);
const VISITS = [{ id: 'v1', clinicId: 'r1', rep: R, date: '2026-10-16' }, { id: 'v2', clinicId: 'm1', rep: M, date: '2026-10-19' }];
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:R, role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify([M1, G1]);                     // Renova's three are gone
  // the one-time repair sweeps of earlier releases have run, as on the team's phones
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: {}, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, periods: [] });
  cloud.erpSales = JSON.stringify(sp.index); Object.keys(sp.docs).forEach(k => { cloud[k] = JSON.stringify(sp.docs[k]); });
  cloud.visits = JSON.stringify(VISITS);
  cloud.recycleBin = JSON.stringify({ clinics: [Object.assign({ _deletedAt: Date.UTC(2026, 9, 16), _label: R3.name }, R3)], products: [], visits: [] }); // Apex was deleted on purpose
  cloud['snap_2026-10-15'] = JSON.stringify({ clinics: [M1, G1, R1, R2, R3], products: [], visits: [], tasks: [] });
  cloud['snap_2026-10-18'] = JSON.stringify({ clinics: [M1, G1, R1b], products: [], visits: [], tasks: [] });
  cloud['snap_2026-10-20'] = JSON.stringify({ clinics: [M1, G1], products: [], visits: VISITS, tasks: [] });
}

(async()=>{
  const server = http.createServer((req,res)=>{
    const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
  });
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-get/i.test(m.text())) errors.push('console: '+m.text()); });
  page.on('dialog', d => d.accept());
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
    const off = new Date(2026, 9, 20, 10, 0, 0).getTime() - Date.now();   // 20 Oct 2026, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async (who, role, local) => {
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(150);
    await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local || null);
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(300);
  };
  const sheet = () => page.evaluate(async () => {
    openExport(); await new Promise(r => setTimeout(r, 50));
    const b = [...document.querySelectorAll('#modalInner button')].find(x => /Find missing clinics|ابحث عن العيادات الناقصة/.test(x.textContent));
    if(!b) return { err: 'no button' };
    b.click();
    for(let i = 0; i < 40 && !document.querySelector('#recovBody .section-title'); i++) await new Promise(r => setTimeout(r, 50));
    const body = document.getElementById('recovBody'), txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    return { text: txt(body), people: [...body.querySelectorAll('[data-person]')].map(e => ({ rep: e.dataset.person, t: txt(e) })),
      rows: [...body.querySelectorAll('input[data-recov]')].map(i => ({ id: i.dataset.recov, on: i.checked, t: txt(i.closest('label')) })) };
  });

  // ---- nobody taps anything: the first device that opens the app brings them back (v117) ----
  seed();
  const visitsBefore = cloud.visits;
  await boot(R, 'rep');
  await page.waitForTimeout(400);
  let cl = JSON.parse(cloud.clinics), byId = Object.fromEntries(cl.map(c => [c.id, c]));
  check('auto: on Renova\'s own phone, her two clinics are back in the cloud, as the newest backup holds them; Apex (deleted in the app) stays deleted',
    cl.length === 4 && byId.r1 && byId.r1.name === 'Crown Dental Center' && byId.r1.rep === R && byId.r2 && !byId.r3, cl.map(c => c.id + ':' + c.name));
  check('auto: visits, tasks and sales files untouched', cloud.visits === visitsBefore, cloud.visits.slice(0, 120));
  const toast = await page.evaluate(() => document.getElementById('toast').textContent);
  check('auto: the phone says so', /2 clinics brought back from the daily backups/.test(toast), toast);
  const log = JSON.parse(cloud.repairLog || '[]');
  check('auto: what came back is written to the repair log (who, when, which, last seen)', log.length === 1 && log[0].by === R && log[0].saved === true && log[0].clinics.map(x => x.id + '@' + x.lastSeen).join(',') === 'r1@2026-10-18,r2@2026-10-15', log);
  const mine = await page.evaluate(() => { switchView('clinics'); setClinicMode('list'); return [...document.querySelectorAll('#clinicList .clinic-name')].map(e => e.innerText.trim()); });
  check('auto: Renova sees her clinics again', mine.length === 2 && mine.some(n => /Crown Dental Center/.test(n)) && mine.some(n => /Jibla/.test(n)), mine);
  // the next device finds nothing to do
  await boot(G, 'supervisor');
  check('auto: the next device writes nothing more', JSON.parse(cloud.clinics).length === 4 && JSON.parse(cloud.repairLog || '[]').length === 1, { n: JSON.parse(cloud.clinics).length, log: JSON.parse(cloud.repairLog || '[]').length });
  // ---- the supervisor's sheet: what is left is the clinic deleted in the app, not ticked; he can still bring it back ----
  let s = await sheet();
  const rv = (s.people || []).find(p => p.rep === R);
  check('sheet: Renova now 2, three in the backup of Oct 15', !!rv && /now 2 · most in a backup 3 \(Oct 15\)/.test(rv.t), s.people);
  const row = id => (s.rows || []).find(x => x.id === id) || {};
  check('sheet: only Apex is listed — deleted in the app (recycle bin), not ticked', (s.rows || []).length === 1 && row('r3').on === false && /deleted in the app \(recycle bin\)/.test(row('r3').t), s.rows);
  const done = await page.evaluate(async () => { recovToggle('r3', true); await restoreMissingClinics(); await new Promise(r => setTimeout(r, 300));
    const body = document.getElementById('recovBody'); return { note: (document.getElementById('recovNote') || {}).innerText || '', text: body ? body.innerText.replace(/\s+/g, ' ') : '' }; });
  cl = JSON.parse(cloud.clinics);
  check('sheet: ticked by hand, Apex comes back and leaves the recycle bin', cl.some(c => c.id === 'r3') && !JSON.parse(cloud.recycleBin).clinics.some(c => c.id === 'r3'), cl.map(c => c.id));
  check('sheet: the note says what landed', /1 clinics are back in the list and saved/.test(done.note), done.note);
  check('sheet: nothing is missing now', /no clinic is missing/i.test(done.text), done.text.slice(0, 300));
  check('visits still untouched', cloud.visits === visitsBefore);
  // ---- a phone that could not read the recycle bin brings nothing back (it cannot tell a deliberate delete) ----
  seed();
  mode.failGet = /^recycleBin$/;
  await boot(G, 'supervisor');
  mode.failGet = null;
  check('no clean read of the recycle bin: nothing is brought back', JSON.parse(cloud.clinics).length === 2 && !cloud.repairLog, JSON.parse(cloud.clinics).map(c => c.id));
  // Arabic: the sheet speaks Arabic
  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  s = await sheet();
  check('Arabic: the sheet speaks Arabic', /موجودة في نسخة احتياطية وليست في القائمة الآن/.test(s.text) && /آخر ظهور في نسخة احتياطية|لا توجد عيادة ناقصة/.test(s.text), (s.text || '').slice(0, 300));
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
