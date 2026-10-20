// Missing clinics, from the daily backups (v116). Renova's clinics were gone
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
const api = {
  get: async k => k in cloud ? cloud[k] : null,
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
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: '+m.text()); });
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

  seed();
  const visitsBefore = cloud.visits;
  await boot(G, 'supervisor');
  let s = await sheet();
  const rv = (s.people || []).find(p => p.rep === R);
  check('per person: Renova now 0, three in the backup of Oct 15', !!rv && /now 0 · most in a backup 3 \(Oct 15\)/.test(rv.t), s.people);
  const row = id => (s.rows || []).find(x => x.id === id) || {};
  check('missing: Crown Dental Center (newest backup copy, last Oct 18) and Jibla (Oct 15) ticked', row('r1').on === true && /Crown Dental Center/.test(row('r1').t) && /Oct 18/.test(row('r1').t) && row('r2').on === true && /Oct 15/.test(row('r2').t), s.rows);
  check('Apex, deleted in the app (recycle bin): listed, not ticked', row('r3').on === false && /deleted in the app \(recycle bin\)/.test(row('r3').t), row('r3'));
  check('nothing is written before the tap', JSON.parse(cloud.clinics).length === 2, JSON.parse(cloud.clinics).map(c => c.id));
  const done = await page.evaluate(async () => { await restoreMissingClinics(); await new Promise(r => setTimeout(r, 300));
    const body = document.getElementById('recovBody'); return { note: (document.getElementById('recovNote') || {}).innerText || '', text: body ? body.innerText.replace(/\s+/g, ' ') : '' }; });
  const cl = JSON.parse(cloud.clinics), byId = Object.fromEntries(cl.map(c => [c.id, c]));
  check('saved: Renova\'s two clinics are back in the cloud, as the newest backup holds them; Apex stays deleted', cl.length === 4 && byId.r1 && byId.r1.name === 'Crown Dental Center' && byId.r1.rep === R && byId.r2 && !byId.r3, cl.map(c => c.id + ':' + c.name));
  check('the note says what landed: 2 clinics back and saved', /2 clinics are back in the list and saved/.test(done.note), done.note);
  check('visits untouched (the whole-day Restore would have replaced them)', cloud.visits === visitsBefore, cloud.visits.slice(0, 120));
  const tail = done.text.toLowerCase().split('in a backup, not in the list now')[1] || '';
  check('the sheet now lists only Apex', /^ \(1\)/.test(tail) && /apex dental center/.test(tail) && !/jibla|crown/.test(tail), done.text.slice(0, 400));
  const list = await page.evaluate(() => { closeModal(); switchView('clinics'); setClinicRepFilter('Renova'); setClinicMode('list'); return [...document.querySelectorAll('#clinicList .clinic-name')].map(e => e.innerText.trim()); });
  check('the clinic list shows Renova\'s clinics again', list.length === 2 && list.some(n => /Crown Dental Center/.test(n)) && list.some(n => /Jibla/.test(n)), list);
  // a fresh open of the app keeps them (the delete log no longer removes them)
  await boot(G, 'supervisor');
  const after = await page.evaluate(() => clinics.filter(c => c.rep === 'Renova').map(c => c.id).sort());
  check('after reopening the app they are still there', JSON.stringify(after) === '["r1","r2"]', after);
  // Arabic
  seed();
  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  s = await sheet();
  check('Arabic: the sheet speaks Arabic', /موجودة في نسخة احتياطية وليست في القائمة الآن/.test(s.text) && /آخر ظهور في نسخة احتياطية/.test(s.text), (s.text || '').slice(0, 300));
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
