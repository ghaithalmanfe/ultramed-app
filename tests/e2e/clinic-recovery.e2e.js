// Missing clinics, from the daily backups (v116), and lost doctors (v119).
// Export → Automatic backups → "Find missing clinics" lists every clinic a
// daily backup holds and the list does not, with its owner and the last day a
// backup had it, and brings back only the ticked ones — the visits, tasks and
// sales files stay exactly as they are; a clinic deleted in the app (recycle
// bin) is listed but not ticked. v119: opening the app downloads no backup
// (v117 downloaded all of them every day on every phone), and a doctor a visit
// met whose record is gone comes back from the phone's own copy or from the
// name the visit records — never one the team deleted. Port 8217.
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
const M1 = C('m1', 'Dental 8 Clinic', M, 'A'), G1 = C('g1', 'Bayan Dental Center', G, 'A');
const R1 = C('r1', 'Crown Dental', R, 'A'), R1b = C('r1', 'Crown Dental Center', R, 'A'), R2 = C('r2', 'Jibla Dental Center', R), R3 = C('r3', 'Apex Dental Center', R);
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
  check('sheet: Crown Dental Center (newest backup copy, last Oct 18) and Jibla (Oct 15) ticked; Apex (deleted in the app) not ticked',
    row('r1').on === true && /Crown Dental Center/.test(row('r1').t) && /Oct 18/.test(row('r1').t) && row('r2').on === true && row('r3').on === false && /deleted in the app \(recycle bin\)/.test(row('r3').t), s.rows);
  const done = await page.evaluate(async () => { await restoreMissingClinics(); await new Promise(r => setTimeout(r, 300));
    return { note: (document.getElementById('recovNote') || {}).innerText || '' }; });
  const cl = JSON.parse(cloud.clinics), byId = Object.fromEntries(cl.map(c => [c.id, c]));
  check('sheet: Renova\'s two clinics are back in the cloud, as the newest backup holds them; Apex stays deleted',
    cl.length === 18 && byId.r1 && byId.r1.name === 'Crown Dental Center' && byId.r1.rep === R && byId.r2 && !byId.r3, cl.filter(c => !/^f/.test(c.id)).map(c => c.id + ':' + c.name));
  check('sheet: the note says what landed', /2 clinics are back in the list and saved/.test(done.note), done.note);
  check('visits untouched', cloud.visits === visitsBefore);
  // Arabic: the sheet speaks Arabic
  seed();
  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  s = await sheet();
  check('Arabic: the sheet speaks Arabic', /موجودة في نسخة احتياطية وليست في القائمة الآن/.test(s.text) && /آخر ظهور في نسخة احتياطية/.test(s.text), (s.text || '').slice(0, 300));
  // ---- lost doctors (v119) ----
  const D = (id, name, x) => Object.assign({ id, name, title: '', phone: '', birthday: '', cadence: '', notes: '', handovers: [] }, x || {});
  const live = Object.assign({}, M1, { doctors: [D('dA', 'Dr. Amal')] });
  const vMet = (id, docs, names) => Object.assign({ id, clinicId: 'm1', rep: M, date: '2026-10-1' + id.slice(-1), doctorIds: docs, doctorId: docs[0] }, names ? { doctorNames: names } : {});
  seed();
  cloud.clinics = JSON.stringify([live, G1].concat(FILL));
  cloud.visits = JSON.stringify([vMet('vb2', ['dB']), vMet('vc3', ['dC']), vMet('vd4', ['dD'], { dD: 'Dr. Dana' }), vMet('ve5', ['dE']), vMet('vf6', ['dF'])]);
  cloud.tombs = JSON.stringify({ visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: { 'm1|dC': Date.now() } });   // Dr. Carla was deleted on purpose
  const phoneCopy = JSON.stringify([Object.assign({}, M1, { doctors: [D('dA', 'Dr. Amal'), D('dB', 'Dr. Basma', { title: 'Orthodontist', phone: '5555' }), D('dC', 'Dr. Carla'), D('dE', 'dr amal')] })]);
  await boot(M, 'rep', { 'um_mirror_prev:clinics': phoneCopy });
  await page.waitForTimeout(600);
  const m1 = JSON.parse(cloud.clinics).find(c => c.id === 'm1'), names = (m1.doctors || []).map(d => d.id + ':' + d.name);
  const basma = (m1.doctors || []).find(d => d.id === 'dB') || {};
  check('lost doctors: Dr. Basma comes back from the phone\'s copy with her details; Dr. Dana from the name her visit recorded',
    basma.name === 'Dr. Basma' && basma.title === 'Orthodontist' && basma.phone === '5555' && names.includes('dD:Dr. Dana'), names);
  check('lost doctors: not Dr. Carla (deleted on purpose), not a second Dr. Amal, nothing for a doctor no copy and no visit names',
    !names.some(n => /^dC:|^dE:|^dF:/.test(n)) && names.length === 3, names);
  const rlog = JSON.parse(cloud.repairLog || '[]');
  check('lost doctors: written to the repair log and said', rlog.length === 1 && rlog[0].kind === 'from-phone-copy' && rlog[0].doctors.map(x => x.id + '<' + x.from).join(',') === 'dB<phone copy,dD<visit',
    rlog.map(e => e.doctors));
  const t1 = await page.evaluate(() => document.getElementById('toast').textContent);
  check('lost doctors: the phone says so', /2 doctors brought back/.test(t1), t1);
  await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
  await page.evaluate(async () => { await selectUser('Mariam', 'rep'); }); await page.waitForTimeout(500);
  check('lost doctors: the next start brings nothing more', JSON.parse(cloud.repairLog || '[]').length === 1, JSON.parse(cloud.repairLog || '[]').length);
  const vn = await page.evaluate(() => visitDoctorNames('m1', ['dA', 'dB', 'nobody']));
  check('a visit records the names of the people met', JSON.stringify(vn) === JSON.stringify({ dA: 'Dr. Amal', dB: 'Dr. Basma' }), vn);
  // ---- clinics the August restore left without a name (v119) ----
  const PH = id => ({ id, name: '⚠️ Restored clinic — rename me', rep: R, cls: 'B', doctors: [] });
  seed();
  cloud.clinics = JSON.stringify([M1, G1, C('rs', 'Al Seef Hospital', R, 'A'), PH('p1'), PH('p2'), PH('p3')].concat(FILL));
  cloud.visits = JSON.stringify([{ id: 'w1', clinicId: 'p1', rep: R, date: '2026-10-05', notes: 'Dr is asking about light prices' },
    { id: 'w2', clinicId: 'p2', rep: R, date: '2026-10-06', notes: 'Dental department meeting' }, { id: 'w3', clinicId: 'p3', rep: R, date: '2026-10-07' }]);
  const copy3 = JSON.stringify([{ id: 'p3', name: 'Hadi Clinic, Jabriya', rep: R, cls: 'C', phone: '2222', doctors: [{ id: 'dh', name: 'Dr. Hadi' }] }]);
  await boot(R, 'rep', { 'um_mirror_prev:clinics': copy3 });
  await page.waitForTimeout(600);
  let live3 = JSON.parse(cloud.clinics), p3 = live3.find(c => c.id === 'p3') || {};
  check('nameless: the phone\'s copy gives one its real name, details and doctor back, and it shows in the list',
    p3.name === 'Hadi Clinic, Jabriya' && p3.phone === '2222' && (p3.doctors || []).some(d => d.name === 'Dr. Hadi'), p3);
  const card = await page.evaluate(() => { switchView('clinics'); setClinicMode('list'); return (document.getElementById('namelessCard') || {}).innerText || ''; });
  check('nameless: Renova sees a card for the two still without a name', /2 clinics from August have no name/.test(card), card);
  const sheetTxt = await page.evaluate(async () => { openNamelessClinics(); await new Promise(r => setTimeout(r, 50)); return document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); });
  check('nameless: the sheet shows what each one\'s visits say', /Dr is asking about light prices/.test(sheetTxt) && /Dental department meeting/.test(sheetTxt), sheetTxt.slice(0, 300));
  await page.evaluate(async () => { await nameNamelessClinic('p1', 'Smile Point Clinic'); await new Promise(r => setTimeout(r, 200)); await nameNamelessClinic('p2', 'al seef hospital'); await new Promise(r => setTimeout(r, 300)); });
  live3 = JSON.parse(cloud.clinics);
  const p1 = live3.find(c => c.id === 'p1') || {}, w2 = JSON.parse(cloud.visits).find(v => v.id === 'w2') || {};
  check('nameless: a new name shows the clinic again with its visit', p1.name === 'Smile Point Clinic' && p1.rep === R, p1);
  check('nameless: the name of a clinic already in the list moves the visit there and drops the empty record',
    w2.clinicId === 'rs' && !live3.some(c => c.id === 'p2'), { w2: w2.clinicId, p2: live3.some(c => c.id === 'p2') });
  const after3 = await page.evaluate(() => { closeModal(); renderClinics(); return { card: (document.getElementById('namelessCard') || {}).innerText || '', list: [...document.querySelectorAll('#clinicList .clinic-name')].map(e => e.innerText.trim()) }; });
  check('nameless: nothing left without a name; Renova\'s list shows Smile Point and Hadi', !after3.card && after3.list.some(n => /Smile Point Clinic/.test(n)) && after3.list.some(n => /Hadi Clinic/.test(n)), after3);
  // ---- names the app recorded (v120): a follow-up task names a nameless clinic; doctors without a name ----
  const MS = 'Mariam Zohair', RS = 'Renova Ayman', RMAP = { [MS]: M, [RS]: R };
  const erow = (d, doc, cust, net, sm) => [d, doc, 0, 'Intensiv Ortho-Strips', 1, net, net, 0, sm, 'Intensiv', cust, 'Clinics', 0, ''];
  const EROWS = [erow('2026-09-14', 'SINV1', 'Office', 60, MS), erow('2026-10-02', 'SINV2', 'Cedar Hospital', 80, RS)];
  const seedV120 = () => {
    seed();
    const sp2 = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: RMAP, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true },
      periods: [{ id: 'so', from: '2026-09-01', to: '2026-10-15', net: 140, rowCount: EROWS.length, importedAt: '2026-10-16T08:00:00.000Z', repMap: RMAP, rev: 1, rows: EROWS }] });
    Object.keys(cloud).filter(k => /^erp/.test(k)).forEach(k => { delete cloud[k]; });
    cloud.erpSales = JSON.stringify(sp2.index); Object.keys(sp2.docs).forEach(k => { cloud[k] = JSON.stringify(sp2.docs[k]); });
    cloud.clinics = JSON.stringify([M1, G1, Object.assign(C('rs', 'Al Seef Hospital', R, 'A'), { doctors: [D('dK', 'Dr. Khaled')] }), C('r32', '32 Dental', R), PH('q1'), PH('q2'), PH('q3'), PH('q4')].concat(FILL));
    cloud.visits = JSON.stringify([
      { id: 'x1', clinicId: 'q1', rep: R, date: '2026-08-17' }, { id: 'x2', clinicId: 'q2', rep: R, date: '2026-08-09' },
      { id: 'x3', clinicId: 'q3', rep: R, date: '2026-08-12' }, { id: 'x4', clinicId: 'q4', rep: R, date: '2026-08-23', notes: 'Finalize orders' },
      { id: 'x5', clinicId: 'rs', rep: R, date: '2026-08-20', doctorIds: ['dL1'], doctorId: 'dL1', notes: 'Asked for samples' },
      { id: 'x6', clinicId: 'rs', rep: R, date: '2026-09-03', doctorIds: ['dL2'], doctorId: 'dL2' }]);
    const FU = (id, cid, name, created) => ({ id, text: 'Follow up: ' + name, done: false, created, rep: R, dueDate: '2026-09-01', clinicId: cid, kind: 'followup' });
    cloud.tasks = JSON.stringify([FU('t1', 'q1', 'Cedar Hospital', '2026-08-17'), FU('t2', 'q2', '32 Dental', '2026-08-09'), FU('t3', 'q3', 'Office', '2026-08-12')]);
    cloud.dayPlans = JSON.stringify({ '2026-09-08': { [R]: [{ id: 'q2', note: '📅 Follow-up due' }] } });
  };
  seedV120();
  await boot(R, 'rep');
  await page.waitForTimeout(800);
  const L4 = JSON.parse(cloud.clinics), q4 = id => L4.find(c => c.id === id) || null;
  check('recorded names: Cedar Hospital is back under its own id (its invoice is Renova\'s own — no sale moves)', !!q4('q1') && q4('q1').name === 'Cedar Hospital' && q4('q1').rep === R, q4('q1'));
  // August and September visits sit in their month's archive document once saved
  const allV = () => Object.keys(cloud).filter(k => k === 'visits' || /^visitsArch:/.test(k)).reduce((a, k) => { const v = JSON.parse(cloud[k]); return a.concat(Array.isArray(v) ? v : ((v && v.visits) || [])); }, []);
  const V4 = allV(), T4 = JSON.parse(cloud.tasks), DP4 = JSON.parse(cloud.dayPlans || '{}');
  check('recorded names: "32 Dental" is already Renova\'s — its visit, task and plan entry join it, the empty record goes',
    !q4('q2') && (V4.find(v => v.id === 'x2') || {}).clinicId === 'r32' && T4.find(t => t.id === 't2').clinicId === 'r32' && ((DP4['2026-09-08'] || {})[R] || [{}])[0].id === 'r32',
    { q2: !!q4('q2'), x2: (V4.find(v => v.id === 'x2') || {}).clinicId, t2: T4.find(t => t.id === 't2').clinicId, plan: DP4['2026-09-08'] });
  check('recorded names: "Office" stays without a name — Mariam\'s September invoice would then count for Renova', !!q4('q3') && /rename me/.test(q4('q3').name), q4('q3'));
  const rl4 = JSON.parse(cloud.repairLog || '[]').find(e => e.kind === 'from-follow-up-tasks') || {};
  check('recorded names: written to the repair log, with what waits and why', (rl4.clinics || []).map(x => x.clinicId).join() === 'q1'
    && (rl4.merged || []).map(x => x.clinicId + '>' + x.into).join() === 'q2>r32' && (rl4.held || []).map(x => x.clinicId + ':' + x.why).join() === 'q3:sales', rl4);
  const t4 = await page.evaluate(() => document.getElementById('toast').textContent);
  check('recorded names: the phone says so', /2 clinics brought back/.test(t4), t4);
  const sh4 = await page.evaluate(async () => { switchView('clinics'); setClinicMode('list'); openNamelessClinics(); await new Promise(r => setTimeout(r, 50)); return document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); });
  check('card: "Office" offered with what it would move; the clinic with no task asks for a name', /The app recorded its name: Office/.test(sh4) && /1 sales lines would then count for another person: Mariam → Renova 1/.test(sh4)
    && /Use this name/.test(sh4) && /Finalize orders/.test(sh4), sh4.slice(0, 500));
  const det4 = await page.evaluate(async () => { closeModal(); openClinicDetail('rs'); await new Promise(r => setTimeout(r, 50)); return document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); });
  check('lost doctors: Al Seef says two doctors from earlier visits have no name', /2 doctors from earlier visits have no name/.test(det4), det4.slice(0, 300));
  const card4 = await page.evaluate(() => { closeModal(); renderClinics(); return ((document.getElementById('namelessCard') || {}).innerText || '').replace(/\s+/g, ' '); });
  check('lost doctors: the clinic list says so too', /2 doctors from earlier visits have no name · 1 clinics/.test(card4), card4);
  const sh5 = await page.evaluate(async () => { openLostDoctors('rs'); await new Promise(r => setTimeout(r, 50)); return document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); });
  check('lost doctors: the sheet shows what each one\'s visits say', /Doctors without a name/.test(sh5) && /Asked for samples/.test(sh5), sh5.slice(0, 300));
  await page.evaluate(async () => { await nameLostDoctor('rs', 'dL1', 'Dr. Lina', 'rs'); await new Promise(r => setTimeout(r, 250)); await nameLostDoctor('rs', 'dL2', 'dr khaled', 'rs'); await new Promise(r => setTimeout(r, 300)); });
  const seef = JSON.parse(cloud.clinics).find(c => c.id === 'rs') || {}, x6 = allV().find(v => v.id === 'x6') || {};
  check('lost doctors: a name brings the doctor back with the same id', (seef.doctors || []).some(d => d.id === 'dL1' && d.name === 'Dr. Lina'), seef.doctors);
  check('lost doctors: the name of a doctor already listed moves the visit to that record — no second Dr. Khaled',
    (x6.doctorIds || []).join() === 'dK' && x6.doctorId === 'dK' && (seef.doctors || []).length === 2, { x6, docs: (seef.doctors || []).map(d => d.id) });
  const left4 = await page.evaluate(() => document.getElementById('modalInner').innerText.replace(/\s+/g, ' '));
  check('lost doctors: nothing left to name at Al Seef', /Nothing left to name/.test(left4), left4.slice(0, 200));
  // Arabic
  seedV120();
  await boot(R, 'rep', { ultramed_lang: 'ar' });
  await page.waitForTimeout(800);
  const ar4 = await page.evaluate(async () => {
    switchView('clinics'); setClinicMode('list'); await new Promise(r => setTimeout(r, 80)); const card = ((document.getElementById('namelessCard') || {}).innerText || '');
    openNamelessClinics(); await new Promise(r => setTimeout(r, 80)); const nl = document.getElementById('modalInner').innerText;
    closeModal(); openLostDoctors('rs'); await new Promise(r => setTimeout(r, 80)); const ld = document.getElementById('modalInner').innerText;
    return (card + ' | ' + nl + ' | ' + ld).replace(/\s+/g, ' ');
  });
  check('Arabic: the cards and sheets speak Arabic', /طبيب من زيارات سابقة بدون اسم/.test(ar4) && /الاسم الذي سجّله التطبيق لها/.test(ar4) && /استخدم هذا الاسم/.test(ar4)
    && /سطر مبيعات سيُحسب عندها لشخص آخر/.test(ar4) && /أطباء بدون اسم/.test(ar4), ar4.slice(0, 600));
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
