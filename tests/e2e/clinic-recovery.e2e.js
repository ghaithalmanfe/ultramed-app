// Missing clinics, from the daily backups (v116), and lost doctors (v119).
// Export → Automatic backups → "Find missing clinics" lists every clinic a
// daily backup holds and the list does not, with its owner and the last day a
// backup had it, and brings back only the ticked ones — the visits, tasks and
// sales files stay exactly as they are; a clinic deleted in the app (recycle
// bin) is listed but not ticked. v119: opening the app downloads no backup
// (v117 downloaded all of them every day on every phone), and a doctor a visit
// met whose record is gone is offered from the phone's own copy or from the
// name the visit records — never one the team deleted. v121: nothing changes
// at start; every bring-back is a tap, and a merge or a name that would move
// sales to another person is asked first. Port 8217.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8217;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const cloud = {};
const mode = { failGet: null, snapReads: [] };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); if(/^snap_/.test(k)) mode.snapReads.push(k); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const G = 'Dr. Ghaith', M = 'Mariam', R = 'Renova';
const C = (id, name, rep, cls) => ({ id, name, rep, cls: cls || 'B', doctors: [] });
const M1 = C('m1', 'Dental 5 Clinic', M, 'A'), G1 = C('g1', 'Hilal Dental Center', G, 'A');
const R1 = C('r1', 'Summit Dental', R, 'A'), R1b = C('r1', 'Summit Dental Center', R, 'A'), R2 = C('r2', 'Juniper Dental Center', R), R3 = C('r3', 'Zenith Dental Center', R);
// a team-sized list (15+ clinics), so the wipe banner stays quiet and reads no backup of its own
const FILL = Array.from({ length: 14 }, (_, i) => C('f' + (i + 1), 'Filler Clinic ' + (i + 1), M));
const VISITS = [{ id: 'v1', clinicId: 'r1', rep: R, date: '2026-10-16' }, { id: 'v2', clinicId: 'm1', rep: M, date: '2026-10-19' }];
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:R, role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify([M1, G1].concat(FILL));                     // Renova's three are gone
  // the one-time repair sweeps of earlier releases have run, as on the team's phones
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: {}, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, periods: [] });
  cloud.erpSales = JSON.stringify(sp.index); Object.keys(sp.docs).forEach(k => { cloud[k] = JSON.stringify(sp.docs[k]); });
  cloud.visits = JSON.stringify(VISITS);
  cloud.recycleBin = JSON.stringify({ clinics: [Object.assign({ _deletedAt: Date.UTC(2026, 9, 16), _label: R3.name }, R3)], products: [], visits: [] }); // Apex was deleted on purpose
  cloud['snap_2026-10-15'] = JSON.stringify({ clinics: [M1, G1, R1, R2, R3].concat(FILL), products: [], visits: [], tasks: [] });
  cloud['snap_2026-10-18'] = JSON.stringify({ clinics: [M1, G1, R1b].concat(FILL), products: [], visits: [], tasks: [] });
  cloud['snap_2026-10-20'] = JSON.stringify({ clinics: [M1, G1].concat(FILL), products: [], visits: VISITS, tasks: [] });
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

  // ---- opening the app downloads no backup; nothing is brought back on its own ----
  seed();
  const visitsBefore = cloud.visits;
  mode.snapReads = [];
  await boot(R, 'rep');
  await page.waitForTimeout(400);
  check('start: no clinic brought back on its own (only the sheet does that)', JSON.parse(cloud.clinics).length === 16 && !cloud.repairLog, JSON.parse(cloud.clinics).length);
  check('start: no backup downloaded except the one check of today\'s own', mode.snapReads.every(k => k === 'snap_2026-10-20') && mode.snapReads.length <= 1, mode.snapReads);
  mode.snapReads = [];
  await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
  await page.evaluate(async () => { await selectUser('Renova', 'rep'); }); await page.waitForTimeout(400);
  check('start: a second start the same day downloads no backup at all', mode.snapReads.length === 0, mode.snapReads);
  // ---- the supervisor's sheet ----
  await boot(G, 'supervisor');
  let s = await sheet();
  const rv = (s.people || []).find(p => p.rep === R);
  check('sheet: Renova now 0, three in the backup of Oct 15', !!rv && /now 0 · most in a backup 3 \(Oct 15\)/.test(rv.t), s.people);
  const row = id => (s.rows || []).find(x => x.id === id) || {};
  check('sheet: Summit Dental Center (newest backup copy, last Oct 18) and Juniper (Oct 15) ticked; Zenith (deleted in the app) not ticked',
    row('r1').on === true && /Summit Dental Center/.test(row('r1').t) && /Oct 18/.test(row('r1').t) && row('r2').on === true && row('r3').on === false && /deleted in the app \(recycle bin\)/.test(row('r3').t), s.rows);
  const done = await page.evaluate(async () => { await restoreMissingClinics(); await new Promise(r => setTimeout(r, 300));
    return { note: (document.getElementById('recovNote') || {}).innerText || '' }; });
  const cl = JSON.parse(cloud.clinics), byId = Object.fromEntries(cl.map(c => [c.id, c]));
  check('sheet: Renova\'s two clinics are back in the cloud, as the newest backup holds them; Apex stays deleted',
    cl.length === 18 && byId.r1 && byId.r1.name === 'Summit Dental Center' && byId.r1.rep === R && byId.r2 && !byId.r3, cl.filter(c => !/^f/.test(c.id)).map(c => c.id + ':' + c.name));
  check('sheet: the note says what landed', /2 clinics are back in the list and saved/.test(done.note), done.note);
  check('visits untouched', cloud.visits === visitsBefore);
  // Arabic: the sheet speaks Arabic
  seed();
  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  s = await sheet();
  check('Arabic: the sheet speaks Arabic', /موجودة في نسخة احتياطية وليست في القائمة الآن/.test(s.text) && /آخر ظهور في نسخة احتياطية/.test(s.text), (s.text || '').slice(0, 300));
  // ---- v121: what a phone still holds is OFFERED; nothing changes until someone taps ----
  const sleep = ms => page.evaluate(t => new Promise(r => setTimeout(r, t)), ms);
  const modal = () => page.evaluate(() => (document.getElementById('modalInner') || {}).innerText.replace(/\s+/g, ' '));
  const toast = () => page.evaluate(() => document.getElementById('toast').textContent);
  const confirmTap = async () => { await page.evaluate(() => { const b = document.querySelector('#modalInner button[data-ask]'); if(!b) throw new Error('no confirm button'); b.click(); }); await sleep(350); };
  // August and September visits sit in their month's archive document once saved
  const allV = () => Object.keys(cloud).filter(k => k === 'visits' || /^visitsArch:/.test(k)).reduce((a, k) => { const v = JSON.parse(cloud[k]); return a.concat(Array.isArray(v) ? v : ((v && v.visits) || [])); }, []);
  // ---- doctors without a name ----
  const D = (id, name, x) => Object.assign({ id, name, title: '', phone: '', birthday: '', cadence: '', notes: '', handovers: [] }, x || {});
  const live = Object.assign({}, M1, { doctors: [D('dA', 'Dr. Amal')] });
  const vMet = (id, docs, names) => Object.assign({ id, clinicId: 'm1', rep: M, date: '2026-10-1' + id.slice(-1), doctorIds: docs, doctorId: docs[0] }, names ? { doctorNames: names } : {});
  seed();
  cloud.clinics = JSON.stringify([live, G1].concat(FILL));
  cloud.visits = JSON.stringify([vMet('vb2', ['dB']), vMet('vc3', ['dC']), vMet('vd4', ['dD'], { dD: 'Dr. Dana' }), vMet('ve5', ['dE']), vMet('vf6', ['dF'])]);
  cloud.tombs = JSON.stringify({ visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: { 'm1|dC': Date.now() } });   // Dr. Carla was deleted on purpose
  const phoneCopy = JSON.stringify([Object.assign({}, M1, { doctors: [D('dA', 'Dr. Amal'), D('dB', 'Dr. Basma', { title: 'Orthodontist', phone: '5555' }), D('dC', 'Dr. Carla'), D('dE', 'dr amal')] })]);
  const clinicsAtStart = cloud.clinics, visitsAtStart = cloud.visits;
  await boot(M, 'rep', { 'um_mirror_prev:clinics': phoneCopy });
  await page.waitForTimeout(600);
  check('start writes nothing: no doctor comes back on its own, no repair log', cloud.clinics === clinicsAtStart && cloud.visits === visitsAtStart && !cloud.repairLog, { repairLog: !!cloud.repairLog });
  await page.evaluate(() => openLostDoctors('m1')); await sleep(60);
  const ld = await modal();
  check('sheet: offers Dr. Basma (this phone kept her) and Dr. Dana (her visit recorded the name); not Dr. Carla, deleted on purpose',
    /This phone kept this doctor: Dr\. Basma/.test(ld) && /A visit recorded this name: Dr\. Dana/.test(ld) && !/Carla/.test(ld), ld.slice(0, 400));
  await page.evaluate(async () => { await nameLostDoctor('m1', 'dB', 'Dr. Basma', 'm1', 'copy'); }); await sleep(250);
  await page.evaluate(async () => { await nameLostDoctor('m1', 'dD', 'Dr. Dana', 'm1', 'visit'); }); await sleep(250);
  let m1 = JSON.parse(cloud.clinics).find(c => c.id === 'm1'), names = (m1.doctors || []).map(d => d.id + ':' + d.name);
  const basma = (m1.doctors || []).find(d => d.id === 'dB') || {};
  check('a tap brings Dr. Basma back, same id, with the details this phone kept; another brings Dr. Dana back',
    basma.name === 'Dr. Basma' && basma.title === 'Orthodontist' && basma.phone === '5555' && names.includes('dD:Dr. Dana'), names);
  check('the phone says what landed', /Dr\. Dana is back on the clinic's list/.test(await toast()), await toast());
  // dE: this phone kept "dr amal" — the same person as Dr. Amal, already listed: moving the visit there is asked first
  await page.evaluate(async () => { await nameLostDoctor('m1', 'dE', 'dr amal', 'm1', 'copy'); }); await sleep(80);
  const askD = await modal(), ve5a = JSON.parse(cloud.visits).find(v => v.id === 've5') || {};
  check('a name already on the list is ASKED first — nothing moves on the first tap', /Dr\. Amal is already on this clinic's list\. Move these visits to this doctor\?/.test(askD) && (ve5a.doctorIds || []).join() === 'dE', { ask: askD.slice(0, 200), ve5: ve5a.doctorIds });
  await confirmTap();
  const ve5 = JSON.parse(cloud.visits).find(v => v.id === 've5') || {};
  m1 = JSON.parse(cloud.clinics).find(c => c.id === 'm1');
  check('after the second tap the visit joins Dr. Amal; no second Dr. Amal', (ve5.doctorIds || []).join() === 'dA' && ve5.doctorId === 'dA' && (m1.doctors || []).length === 3, { ve5: ve5.doctorIds, docs: (m1.doctors || []).map(d => d.id) });
  const vn = await page.evaluate(() => visitDoctorNames('m1', ['dA', 'dB', 'nobody']));
  check('a visit records the names of the people met', JSON.stringify(vn) === JSON.stringify({ dA: 'Dr. Amal', dB: 'Dr. Basma' }), vn);
  // ---- clinics the August restore left without a name ----
  const PH = id => ({ id, name: '⚠️ Restored clinic — rename me', rep: R, cls: 'B', doctors: [] });
  seed();
  cloud.clinics = JSON.stringify([M1, G1, C('rs', 'Sample Seaside Hospital', R, 'A'), PH('p1'), PH('p2'), PH('p3')].concat(FILL));
  cloud.visits = JSON.stringify([{ id: 'w1', clinicId: 'p1', rep: R, date: '2026-10-05', notes: 'Dr is asking about light prices' },
    { id: 'w2', clinicId: 'p2', rep: R, date: '2026-10-06', notes: 'Dental department meeting' }, { id: 'w3', clinicId: 'p3', rep: R, date: '2026-10-07' }]);
  const copy3 = JSON.stringify([{ id: 'p3', name: 'Rami Clinic, Jabriya', rep: R, cls: 'C', phone: '2222', doctors: [{ id: 'dh', name: 'Dr. Hadi' }] }]);
  const nlAtStart = cloud.clinics;
  await boot(R, 'rep', { 'um_mirror_prev:clinics': copy3 });
  await page.waitForTimeout(600);
  check('start writes nothing: the three stay without a name until someone taps', cloud.clinics === nlAtStart && !cloud.repairLog);
  const card = await page.evaluate(async () => { switchView('clinics'); setClinicMode('list'); await new Promise(r => setTimeout(r, 50)); return (document.getElementById('namelessCard') || {}).innerText || ''; });
  check('nameless: Renova sees a card for the three without a name', /3 clinics from August have no name/.test(card), card);
  await page.evaluate(() => openNamelessClinics()); await sleep(60);
  const sheetTxt = await modal();
  check('nameless: the sheet shows what each one\'s visits say, and offers the record this phone kept',
    /Dr is asking about light prices/.test(sheetTxt) && /Dental department meeting/.test(sheetTxt) && /This phone kept its record: Rami Clinic, Jabriya/.test(sheetTxt), sheetTxt.slice(0, 400));
  await page.evaluate(async () => { await nameNamelessClinic('p3', 'Rami Clinic, Jabriya', 'copy'); }); await sleep(250);
  let live3 = JSON.parse(cloud.clinics), p3 = live3.find(c => c.id === 'p3') || {};
  check('a tap gives it back its real record from the phone copy: name, details and doctor, same id',
    p3.name === 'Rami Clinic, Jabriya' && p3.phone === '2222' && (p3.doctors || []).some(d => d.name === 'Dr. Hadi'), p3);
  await page.evaluate(async () => { await nameNamelessClinic('p1', 'Smile Point Clinic', 'typed'); }); await sleep(250);
  await page.evaluate(async () => { await nameNamelessClinic('p2', 'sample seaside hospital', 'typed'); }); await sleep(80);
  const askC = await modal();
  live3 = JSON.parse(cloud.clinics);
  const w2a = JSON.parse(cloud.visits).find(v => v.id === 'w2') || {};
  check('a new name shows the clinic again with its visit', (live3.find(c => c.id === 'p1') || {}).name === 'Smile Point Clinic');
  check('the name of a clinic already in the list is ASKED first — nothing moves on the first tap',
    /Sample Seaside Hospital is already in the list/.test(askC) && w2a.clinicId === 'p2' && live3.some(c => c.id === 'p2'), { ask: askC.slice(0, 240), w2: w2a.clinicId });
  await confirmTap();
  live3 = JSON.parse(cloud.clinics);
  const w2 = JSON.parse(cloud.visits).find(v => v.id === 'w2') || {};
  check('after the second tap its visit moves there and the empty record goes to the recycle bin', w2.clinicId === 'rs' && !live3.some(c => c.id === 'p2') && /p2/.test(cloud.recycleBin || ''), { w2: w2.clinicId, p2: live3.some(c => c.id === 'p2') });
  const after3 = await page.evaluate(() => { closeModal(); renderClinics(); return { card: (document.getElementById('namelessCard') || {}).innerText || '', list: [...document.querySelectorAll('#clinicList .clinic-name')].map(e => e.innerText.trim()) }; });
  check('nameless: nothing left without a name; Renova\'s list shows Smile Point and Hadi', !after3.card && after3.list.some(n => /Smile Point Clinic/.test(n)) && after3.list.some(n => /Rami Clinic/.test(n)), after3);
  // ---- names the app recorded in its follow-up tasks ----
  const MS = 'Mariam Sample', RS = 'Renova Sample', RMAP = { [MS]: M, [RS]: R };
  const erow = (d, doc, cust, net, sm) => [d, doc, 0, 'Intensiv Ortho-Strips', 1, net, net, 0, sm, 'Intensiv', cust, 'Clinics', 0, ''];
  const EROWS = [erow('2026-09-14', 'SINV1', 'Atrium', 60, MS), erow('2026-10-02', 'SINV2', 'Maple Hospital', 80, RS)];
  const seedV120 = () => {
    seed();
    const sp2 = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: RMAP, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true },
      periods: [{ id: 'so', from: '2026-09-01', to: '2026-10-15', net: 140, rowCount: EROWS.length, importedAt: '2026-10-16T08:00:00.000Z', repMap: RMAP, rev: 1, rows: EROWS }] });
    Object.keys(cloud).filter(k => /^erp/.test(k)).forEach(k => { delete cloud[k]; });
    cloud.erpSales = JSON.stringify(sp2.index); Object.keys(sp2.docs).forEach(k => { cloud[k] = JSON.stringify(sp2.docs[k]); });
    cloud.clinics = JSON.stringify([M1, G1, Object.assign(C('rs', 'Sample Seaside Hospital', R, 'A'), { doctors: [D('dK', 'Dr. Khaled')] }), C('r32', '21 Dental', R), PH('q1'), PH('q2'), PH('q3'), PH('q4')].concat(FILL));
    cloud.visits = JSON.stringify([
      { id: 'x1', clinicId: 'q1', rep: R, date: '2026-08-17' }, { id: 'x2', clinicId: 'q2', rep: R, date: '2026-08-09' },
      { id: 'x3', clinicId: 'q3', rep: R, date: '2026-08-12' }, { id: 'x4', clinicId: 'q4', rep: R, date: '2026-08-23', notes: 'Finalize orders' },
      { id: 'x5', clinicId: 'rs', rep: R, date: '2026-08-20', doctorIds: ['dL1'], doctorId: 'dL1', notes: 'Asked for samples' },
      { id: 'x6', clinicId: 'rs', rep: R, date: '2026-09-03', doctorIds: ['dL2'], doctorId: 'dL2' }]);
    const FU = (id, cid, name, created) => ({ id, text: 'Follow up: ' + name, done: false, created, rep: R, dueDate: '2026-09-01', clinicId: cid, kind: 'followup' });
    cloud.tasks = JSON.stringify([FU('t1', 'q1', 'Maple Hospital', '2026-08-17'), FU('t2', 'q2', '21 Dental', '2026-08-09'), FU('t3', 'q3', 'Atrium', '2026-08-12')]);
    cloud.dayPlans = JSON.stringify({ '2026-09-08': { [R]: [{ id: 'q2', note: '📅 Follow-up due' }] } });
  };
  seedV120();
  const v120AtStart = { clinics: cloud.clinics, tasks: cloud.tasks };
  await boot(R, 'rep');
  await page.waitForTimeout(800);
  check('recorded names: start writes nothing', cloud.clinics === v120AtStart.clinics && cloud.tasks === v120AtStart.tasks && !cloud.repairLog);
  await page.evaluate(async () => { switchView('clinics'); setClinicMode('list'); openNamelessClinics(); }); await sleep(60);
  const sh4 = await modal();
  check('the sheet offers each name the app recorded; the one with no task asks for a name',
    /The app recorded its name: Maple Hospital/.test(sh4) && /The app recorded its name: 21 Dental/.test(sh4) && /The app recorded its name: Atrium/.test(sh4) && /Finalize orders/.test(sh4), sh4.slice(0, 500));
  await page.evaluate(async () => { await nameNamelessClinic('q1', 'Maple Hospital', 'task'); }); await sleep(250);
  let L4 = JSON.parse(cloud.clinics), q4 = id => L4.find(c => c.id === id) || null;
  check('a tap: Maple Hospital is back under its own id (its invoice is Renova\'s own, so no sale moves and nothing is asked)', !!q4('q1') && q4('q1').name === 'Maple Hospital' && q4('q1').rep === R, q4('q1'));
  await page.evaluate(async () => { await nameNamelessClinic('q2', '21 Dental', 'task'); }); await sleep(80);
  const ask21 = await modal();
  check('"21 Dental" is already Renova\'s: asked first', /21 Dental is already in the list/.test(ask21) && !!JSON.parse(cloud.clinics).find(c => c.id === 'q2'), ask21.slice(0, 200));
  await confirmTap();
  L4 = JSON.parse(cloud.clinics);
  const V4 = allV(), T4 = JSON.parse(cloud.tasks), DP4 = JSON.parse(cloud.dayPlans || '{}');
  check('after the second tap its visit, task and plan entry join 21 Dental and the empty record goes',
    !q4('q2') && (V4.find(v => v.id === 'x2') || {}).clinicId === 'r32' && T4.find(t => t.id === 't2').clinicId === 'r32' && ((DP4['2026-09-08'] || {})[R] || [{}])[0].id === 'r32',
    { q2: !!q4('q2'), x2: (V4.find(v => v.id === 'x2') || {}).clinicId, t2: T4.find(t => t.id === 't2').clinicId, plan: DP4['2026-09-08'] });
  await page.evaluate(async () => { await nameNamelessClinic('q3', 'Atrium', 'task'); }); await sleep(80);
  const askOff = await modal();
  check('"Atrium" would make Mariam\'s September invoice count for Renova: that is shown and asked first, nothing changes yet',
    /1 sales lines would then count for another person: Mariam → Renova 1/.test(askOff) && /Use the name anyway/.test(askOff) && /rename me/.test((JSON.parse(cloud.clinics).find(c => c.id === 'q3') || {}).name || ''), askOff.slice(0, 300));
  await confirmTap();
  check('after the second tap "Atrium" is named', (JSON.parse(cloud.clinics).find(c => c.id === 'q3') || {}).name === 'Atrium');
  const det4 = await page.evaluate(async () => { closeModal(); openClinicDetail('rs'); await new Promise(r => setTimeout(r, 50)); return document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); });
  check('lost doctors: Sample Seaside says two doctors from earlier visits have no name', /2 doctors from earlier visits have no name/.test(det4), det4.slice(0, 300));
  const card4 = await page.evaluate(() => { closeModal(); renderClinics(); return ((document.getElementById('namelessCard') || {}).innerText || '').replace(/\s+/g, ' '); });
  check('lost doctors: the clinic list says so too', /2 doctors from earlier visits have no name · 1 clinics/.test(card4), card4);
  await page.evaluate(() => openLostDoctors('rs')); await sleep(60);
  const sh5 = await modal();
  check('lost doctors: the sheet shows what each one\'s visits say', /Doctors without a name/.test(sh5) && /Asked for samples/.test(sh5), sh5.slice(0, 300));
  await page.evaluate(async () => { await nameLostDoctor('rs', 'dL1', 'Dr. Lina', 'rs', 'typed'); }); await sleep(250);
  await page.evaluate(async () => { await nameLostDoctor('rs', 'dL2', 'dr khaled', 'rs', 'typed'); }); await sleep(80);
  await confirmTap();
  const seef = JSON.parse(cloud.clinics).find(c => c.id === 'rs') || {}, x6 = allV().find(v => v.id === 'x6') || {};
  check('lost doctors: a typed name brings the doctor back with the same id', (seef.doctors || []).some(d => d.id === 'dL1' && d.name === 'Dr. Lina'), seef.doctors);
  check('lost doctors: confirmed, the visit moves to the doctor already listed — no second Dr. Khaled',
    (x6.doctorIds || []).join() === 'dK' && x6.doctorId === 'dK' && (seef.doctors || []).length === 2, { x6, docs: (seef.doctors || []).map(d => d.id) });
  check('lost doctors: nothing left to name at Sample Seaside', /Nothing left to name/.test(await modal()));
  // Arabic
  seedV120();
  await boot(R, 'rep', { ultramed_lang: 'ar' });
  await page.waitForTimeout(800);
  const ar4 = await page.evaluate(async () => {
    switchView('clinics'); setClinicMode('list'); await new Promise(r => setTimeout(r, 80)); const card = ((document.getElementById('namelessCard') || {}).innerText || '');
    openNamelessClinics(); await new Promise(r => setTimeout(r, 80)); const nl = document.getElementById('modalInner').innerText;
    await nameNamelessClinic('q3', 'Atrium', 'task'); await new Promise(r => setTimeout(r, 120)); const ask = document.getElementById('modalInner').innerText;
    closeModal(); openLostDoctors('rs'); await new Promise(r => setTimeout(r, 80)); const ld = document.getElementById('modalInner').innerText;
    return (card + ' | ' + nl + ' | ' + ask + ' | ' + ld).replace(/\s+/g, ' ');
  });
  check('Arabic: the cards, sheets and questions speak Arabic', /طبيب من زيارات سابقة بدون اسم/.test(ar4) && /الاسم الذي سجّله التطبيق لها/.test(ar4) && /استخدم هذا الاسم/.test(ar4)
    && /سطر مبيعات سيُحسب عندها لشخص آخر/.test(ar4) && /استخدم الاسم رغم ذلك/.test(ar4) && /أطباء بدون اسم/.test(ar4) && /لا يتغير شيء حتى تضغط/.test(ar4), ar4.slice(0, 700));
  // ---- v121 review fixes ----
  {
    seed();
    const OLD = Date.now() - 30 * 86400000, NOW = Date.now();
    cloud.clinics = JSON.stringify([M1, G1, C('r32', '21 Dental', R), C('rm', 'Smile Point', M),
      Object.assign(PH('z1'), { doctors: [D('dq', 'Dr. Qasim', { title: 'Endodontist', phone: '1111' })] }), PH('z2'), PH('z3'), PH('z4'), PH('z5')].concat(FILL));
    cloud.visits = JSON.stringify([
      { id: 'y1', clinicId: 'z1', rep: R, date: '2026-10-03', doctorIds: ['dq', 'dz'], doctorId: 'dq' }, { id: 'y2', clinicId: 'z2', rep: R, date: '2026-10-04' },
      { id: 'y3', clinicId: 'z3', rep: R, date: '2026-10-05' }, { id: 'y5', clinicId: 'z5', rep: R, date: '2026-10-06' },
      { id: 'y6', clinicId: 'r32', rep: R, date: '2026-10-07', doctorIds: ['dold'], doctorId: 'dold' }, { id: 'y7', clinicId: 'r32', rep: R, date: '2026-10-08', doctorIds: ['dlx'], doctorId: 'dlx' }]);
    const FU = (id, cid, name) => ({ id, text: 'Follow up: ' + name, done: false, created: '2026-10-01', rep: R, dueDate: '2026-10-20', clinicId: cid, kind: 'followup' });
    cloud.tasks = JSON.stringify([FU('u1', 'z1', '21 Dental'), FU('u2', 'z2', 'Smile Point'), FU('u3', 'z3', 'Hidden Gem')]);
    const tombsDoc = { visits: {}, tasks: {}, clinics: { z4: NOW - 60000 }, events: {}, dayPlans: {}, doctors: { 'r32|dold': OLD } };
    cloud.tombs = JSON.stringify(tombsDoc);
    const copyZ = JSON.stringify([{ id: 'z1', name: '21 Dental', rep: R, doctors: [{ id: 'dz', name: 'Dr. Zaid' }] }, { id: 'z5', name: 'Jahra Clinic', rep: M, phone: '2468', doctors: [] }]);
    await boot(R, 'rep', { 'um_mirror_prev:clinics': copyZ, um_tombs: JSON.stringify(tombsDoc) });
    await page.waitForTimeout(600);
    await page.evaluate(() => { switchView('clinics'); setClinicMode('list'); openNamelessClinics(); }); await sleep(60);
    const sh = await page.evaluate(() => [...document.querySelectorAll('#modalInner [data-nameless]')].map(e => e.dataset.nameless));
    check('fix: a nameless record another device already handled (delete log) is not offered', !sh.includes('z4') && sh.includes('z1'), sh);
    // a rep cannot merge into another rep's clinic: nothing changes
    await page.evaluate(async () => { await nameNamelessClinic('z2', 'Smile Point', 'task'); }); await sleep(80);
    check('fix: a rep cannot merge her nameless clinic into another rep\'s clinic — nothing changes', /Another clinic already has this name/.test(await modal()) && (allV().find(v => v.id === 'y2') || {}).clinicId === 'z2', (await modal()).slice(0, 200));
    // the sales check needs every file's rows on this phone
    await page.evaluate(() => { openNamelessClinics(); erpSales.periods = [{ id: 'gone', from: '2026-09-01', to: '2026-09-30', rowsMissing: true }]; }); await sleep(40);
    await page.evaluate(async () => { await nameNamelessClinic('z3', 'Hidden Gem', 'task'); }); await sleep(80);
    check('fix: with a sales file missing on this phone, a name is not applied — nothing changes', /Some sales files did not load/.test(await modal()) && /rename me/.test((JSON.parse(cloud.clinics).find(c => c.id === 'z3') || {}).name || ''), (await modal()).slice(0, 200));
    await page.evaluate(() => { erpSales.periods = []; openNamelessClinics(); }); await sleep(40);
    // the copy's owner never replaces today's owner
    await page.evaluate(async () => { await nameNamelessClinic('z5', 'Jahra Clinic', 'copy'); }); await sleep(250);
    const z5 = JSON.parse(cloud.clinics).find(c => c.id === 'z5') || {};
    check('fix: the phone copy gives back the name and details, never another owner', z5.name === 'Jahra Clinic' && z5.rep === R && z5.phone === '2468', z5);
    // the confirming tap answers one question: if its clinic changed, nothing happens
    await page.evaluate(() => openNamelessClinics()); await sleep(40);
    await page.evaluate(async () => { await nameNamelessClinic('z1', '21 Dental', 'copy'); }); await sleep(80);
    const ask1 = await modal();
    await page.evaluate(() => { clinics.find(c => c.id === 'r32').name = '21 Dental Old'; });
    await confirmTap();
    check('fix: a confirming tap whose clinic changed meanwhile changes nothing', /rename me/.test((JSON.parse(cloud.clinics).find(c => c.id === 'z1') || {}).name || '') && /This changed since you were asked/.test(await toast()), { ask: ask1.slice(0, 160), toast: await toast() });
    await page.evaluate(() => { clinics.find(c => c.id === 'r32').name = '21 Dental'; openNamelessClinics(); }); await sleep(40);
    // the merge carries the nameless record's doctors and the copy's; a double tap runs once
    await page.evaluate(async () => { await nameNamelessClinic('z1', '21 Dental', 'copy'); }); await sleep(80);
    check('the merge question says the doctors go too', /visits, tasks, plan entries and doctors/.test(await modal()) && /2 doctors/.test(await modal()), (await modal()).slice(0, 260));
    await page.evaluate(() => { const b = document.querySelector('#modalInner button[data-ask]'); b.click(); b.click(); }); await sleep(450);
    const r32 = JSON.parse(cloud.clinics).find(c => c.id === 'r32') || {}, bin = JSON.parse(cloud.recycleBin || '{}');
    const binZ1 = ((bin.clinics) || []).filter(x => x.id === 'z1').length;
    check('fix: the merge keeps the doctors — the nameless record\'s own (with details) and the one this phone kept',
      (r32.doctors || []).some(d => d.id === 'dq' && d.phone === '1111') && (r32.doctors || []).some(d => d.id === 'dz' && d.name === 'Dr. Zaid'), (r32.doctors || []).map(d => d.id + ':' + d.name));
    check('fix: a double tap merges once (one recycle-bin copy)', binZ1 === 1 && (allV().find(v => v.id === 'y1') || {}).clinicId === 'r32', { binZ1 });
    // doctor removals stay in the delete log for good; "left / removed on purpose" takes one off the list
    const lostR32 = await page.evaluate(() => (UMCore.lostDoctors(clinics.filter(c => c.id === 'r32'), visits, tombSet('doctors')).r32 || []).map(e => e.id));
    check('fix: a doctor removed on purpose a month ago is not offered as lost', !lostR32.includes('dold') && lostR32.includes('dlx'), lostR32);
    await page.evaluate(async () => { closeModal(); await markDoctorGone('r32', 'dlx', 'r32'); }); await sleep(300);
    const lostAfter = await page.evaluate(() => (UMCore.lostDoctors(clinics.filter(c => c.id === 'r32'), visits, tombSet('doctors')).r32 || []).map(e => e.id));
    check('fix: "Left the clinic or removed on purpose" takes the doctor off the list and into the shared delete log', !lostAfter.includes('dlx') && !!(JSON.parse(cloud.tombs || '{}').doctors || {})['r32|dlx'], { lostAfter, tomb: !!(JSON.parse(cloud.tombs || '{}').doctors || {})['r32|dlx'] });
    check('fix: the old doctor delete is still in the shared log after that save', !!(JSON.parse(cloud.tombs || '{}').doctors || {})['r32|dold']);
  }
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
