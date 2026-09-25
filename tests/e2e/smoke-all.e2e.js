// Whole-app smoke + invariants: every view and modal, both roles, seeded realistic data.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, salesFixture } = require('./_env.js');
const PORT = 8199;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});
const cloud = {};
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { cloud[k] = v; return true; },
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,500):'')); if(!ok) failed++; }
const SEED = JSON.parse(fs.readFileSync(WWW + '/sales-seed-aug26.json', 'utf8'));

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext();
  await ctx.route('**/gstatic.com/**', r => r.abort());
  await ctx.route('**/.netlify/**', r => r.abort());
  const page = await ctx.newPage();
  let errors = []; const dialogs = []; let acceptDialogs = false;
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: '+m.text().slice(0,200)); });
  page.on('dialog', async d => { dialogs.push(d.message()); if(acceptDialogs) await d.accept(); else await d.dismiss(); });
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
  await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(() => {
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
  });
  const boot = async (who, role) => {
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(300);
  };
  // ---- 1) pull the factory data out of the page to build realistic seeds ----
  await boot('Dr. Ghaith', 'supervisor');
  const base = await page.evaluate(() => ({ clinics: clinics.map(c => ({ id: c.id, name: c.name, rep: c.rep, cls: c.cls })), products: products.slice(0, 30).map(p => ({ id: p._key || p.id, name: p.name, price: p.price })), reps: REPS.slice(), today: todayStr() }));
  const today = base.today;
  const d = (off) => { const x = new Date(today + 'T00:00:00'); x.setDate(x.getDate() + off); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  const byRep = {}; base.clinics.forEach(c => { if(c.cls !== 'Closed') (byRep[c.rep] = byRep[c.rep] || []).push(c); });
  const reps = base.reps;
  const clinicsSeed = base.clinics.map((c, i) => ({ id: c.id, name: c.name, rep: c.rep, cls: c.cls, market: 'A', phone: i % 3 ? '9900' + i : '', notes: '', doctors: i % 2 ? [{ id: 'doc-' + i + 'a', name: 'Dr. Test ' + i, title: 'Orthodontist' }, { id: 'doc-' + i + 'b', name: 'Dr. Second ' + i, title: '' }] : [] }));
  let vid = 0; const visitsSeed = [];
  const prods = base.products.filter(p => p.price > 0);
  reps.forEach((rep, ri) => {
    const mine = byRep[rep] || [];
    for(let k = 0; k < 22; k++){
      const c = mine[k % mine.length]; if(!c) continue;
      const off = -(k * 2 + ri); // spread over ~45 days incl. this week
      const cs = clinicsSeed.find(x => x.id === c.id);
      const withOrder = k % 3 !== 0;
      const items = withOrder ? [{ pid: prods[k % prods.length].id, qty: 1 + (k % 3) }] : [];
      const gross = items.reduce((s, it) => s + (prods.find(p => p.id === it.pid).price * it.qty), 0);
      visitsSeed.push({ id: 'v' + (++vid), clinicId: c.id, rep, withRep: k % 7 === 0 ? reps[(ri + 1) % reps.length] : null, date: d(off), ts: Date.now() - (k * 2 + ri) * 86400000,
        products: items.map(i => i.pid), orderTaken: withOrder, orders: withOrder ? [{ id: 'o' + vid, items: items.map(i => ({ productId: i.pid, qty: i.qty })), discountPct: 10, gross, net: Math.round(gross * 0.9 * 100) / 100 }] : [],
        orderItems: Object.fromEntries(items.map(i => [i.pid, i.qty])), orderGross: gross, orderDiscount: Math.round(gross * 0.1 * 100) / 100, orderTotal: Math.round(gross * 0.9 * 100) / 100,
        doctorId: cs.doctors[0] ? cs.doctors[0].id : null, doctorIds: cs.doctors[0] ? [cs.doctors[0].id] : [], nextFollowUp: d(off + 14), notes: 'seed visit ' + vid, callOnly: k % 11 === 5, orderOnly: k % 13 === 7, noOrderReason: withOrder ? '' : 'Budget/approval pending' });
      cs.lastVisit = cs.lastVisit && cs.lastVisit > d(off) ? cs.lastVisit : d(off); cs.nextFollowUp = d(off + 14);
    }
  });
  const tasksSeed = reps.flatMap((rep, i) => [{ id: 't' + i + 'a', text: 'Call clinic ' + i, done: false, rep, due: d(1), clinicId: (byRep[rep][0] || {}).id }, { id: 't' + i + 'b', text: 'Send price list ' + i, done: true, rep, due: d(-3) }]);
  const dayPlans = {}; reps.forEach(rep => { [d(0), d(1), d(-1), d(-5)].forEach(dt => { (dayPlans[dt] = dayPlans[dt] || {})[rep] = (byRep[rep] || []).slice(0, 3).map(c => c.id); }); });
  const events = [{ id: 'e1', type: 'Meeting', title: 'Team meeting', date: d(2), rep: 'all' }, { id: 'e2', type: 'Conference', title: 'Dental expo', date: d(-4), rep: reps[0] }];
  const targets = {}; reps.forEach((rep, i) => { targets[rep] = { revenue: 10000 + i * 2000, visits: 40, achieved: 3000 + i * 1000, achievedAsOf: d(-7), month: today.slice(0, 7), brands: { 'Philips Sonicare': 2000, Waterpik: 1500, Tepe: 300 }, achievedBrands: { 'Philips Sonicare': 800, Waterpik: 400 } }; });
  Object.assign(cloud, {
    clinics: JSON.stringify(clinicsSeed), visits: JSON.stringify(visitsSeed), tasks: JSON.stringify(tasksSeed), dayPlans: JSON.stringify(dayPlans), events: JSON.stringify(events), targets: JSON.stringify(targets),
    erpSales: JSON.stringify({ periods: [{ id: 'seed_sales3_aug26', from: SEED.from, to: SEED.to, net: SEED.net, rowCount: SEED.rowCount, repMap: SEED.repMap, rows: SEED.rows, importedAt: '2026-08-27T00:00:00Z' }], repMapGlobal: SEED.repMap, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } }),
  });
  const VIEWS = ['today','clinics','log','calendar','reports','more','doctors','products','playbook','team','clanalysis'];
  const bad = txt => (txt.match(/\bNaN\b|\bundefined\b|\[object Object\]/g) || []).slice(0, 3);
  const modalOf = () => page.evaluate(() => (document.getElementById('modalInner')||{}).innerText || '');
  const tryModal = async (label, code) => {
    const before = errors.length;
    const txt = await page.evaluate(async (c) => { try{ const r = eval(c); if(r && r.then) await r; }catch(e){ return 'THROW ' + e.message; } await new Promise(r => setTimeout(r, 120)); const t = (document.getElementById('modalInner')||{}).innerText || ''; try{ closeModal(); }catch(e){} return t; }, code);
    const errs = errors.slice(before);
    check(`modal ${label}`, !/^THROW/.test(txt) && txt.trim().length > 10 && !bad(txt).length && !errs.length, { len: txt.length, head: txt.slice(0, 60).replace(/\n/g,' '), bad: bad(txt), errs: errs.slice(0,2), throw: /^THROW/.test(txt) ? txt : undefined });
  };

  for(const [who, role] of [['Dr. Ghaith','supervisor'], [reps[0],'rep'], [reps[1],'rep']]){
    errors = [];
    await boot(who, role);
    check(`${who}: boot clean`, errors.length===0, errors.slice(0,3));
    const counts = await page.evaluate(() => ({ clinics: clinics.length, visits: visits.length, vis: visibleVisits().length, tasks: tasks.length }));
    check(`${who}: data loaded`, counts.clinics > 50 && counts.visits === 44, counts);
    for(const v of VIEWS){
      const before = errors.length;
      const txt = await page.evaluate(async (v) => { try{ switchView(v); }catch(e){ return 'THROW ' + e.message; } await new Promise(r => setTimeout(r, 150)); const el = document.getElementById('view-' + v); return el ? el.innerText : 'NO VIEW'; }, v);
      const errs = errors.slice(before);
      check(`${who}: view ${v}`, !/^THROW|^NO VIEW/.test(txt) && txt.length > 20 && !bad(txt).length && !errs.length, { len: txt.length, bad: bad(txt), errs: errs.slice(0,2) });
    }
    // calendar navigation across the month boundary
    const cal = await page.evaluate(async () => { switchView('calendar'); const out = []; for(const step of [['month',1],['month',-2],['week',1],['week',-3]]){ setCalMode(step[0]); shiftCal(step[1]); await new Promise(r=>setTimeout(r,60)); out.push((document.getElementById('view-calendar')||{}).innerText.length); } return out; });
    check(`${who}: calendar month/week navigation renders`, cal.every(n => n > 50), cal);
    // reports ranges
    const rep = await page.evaluate(async () => { switchView('reports'); const out = {}; for(const r of [7, 30, 9999]){ reportRange = r; reportCustom = null; renderReports(); await new Promise(x=>setTimeout(x,80)); out[r] = (document.getElementById('view-reports')||{}).innerText.length; } return out; });
    check(`${who}: reports for 7/30/all days render`, Object.values(rep).every(n => n > 200), rep);
    // exports
    const ex = await page.evaluate(() => {
      const out = {};
      const tryB = (k, f) => { try{ let s = f(); if(Array.isArray(s)) s = s.map(r => Array.isArray(r) ? r.join(',') : String(r)).join('\n'); out[k] = { len: String(s).length, lines: String(s).split('\n').length, bad: (String(s).match(/\bNaN\b|\bundefined\b/g)||[]).length }; }catch(e){ out[k] = { err: e.message }; } };
      tryB('visitsCSV', () => buildVisitsCSV(exportRange())); tryB('clinicsCSV', () => buildClinicsCSV()); tryB('tasksCSV', () => buildTasksCSV(exportRange())); tryB('scorecardCSV', () => buildScorecardCSV(exportRange())); tryB('doctorsCSV', () => buildDoctorsCSV());
      tryB('masterEN', () => buildMasterReportBody('en', 'full')); tryB('masterAR', () => buildMasterReportBody('ar', 'full'));
      out.visibleVisits = visibleVisits().length; out.visibleClinics = clinics.filter(c => canViewClinic(c)).length;
      return out;
    });
    check(`${who}: CSV/PDF builders run without NaN/undefined`, Object.values(ex).every(x => typeof x !== 'object' || (!x.err && !x.bad)), ex);
    check(`${who}: visits CSV has one row per visible visit`, ex.visitsCSV && ex.visitsCSV.lines >= ex.visibleVisits + 1, { lines: ex.visitsCSV && ex.visitsCSV.lines, visible: ex.visibleVisits });
    check(`${who}: master report EN/AR are substantial`, ex.masterEN.len > 5000 && ex.masterAR.len > 5000, { en: ex.masterEN.len, ar: ex.masterAR.len });
    // modals common to both roles
    const first = await page.evaluate(() => { const mine = clinics.filter(c => canViewClinic(c) && c.cls !== 'Closed'); const withDoc = mine.find(c => c.doctors && c.doctors.length) || mine[0]; return { id: withDoc.id, docId: withDoc.doctors[0] && withDoc.doctors[0].id, visitId: (visibleVisits()[0]||{}).id }; });
    await tryModal('openClinicDetail', `openClinicDetail(${JSON.stringify(first.id)})`);
    await tryModal('openEditVisit', `openEditVisit(${JSON.stringify(first.visitId)})`);
    await tryModal('openCallLog', `openCallLog(${JSON.stringify(first.id)})`);
    await tryModal('openStandaloneOrder', `openStandaloneOrder(${JSON.stringify(first.id)})`);
    await tryModal('openPlanDay', `openPlanDay()`);
    await tryModal('openDatePlanner', `openDatePlanner(todayStr())`);
    await tryModal('openAddEvent', `openAddEvent(todayStr())`);
    await tryModal('openCompare', `openCompare()`);
    await tryModal('openReportTools', `openReportTools()`);
    await tryModal('openAchievements', `openAchievements()`);
    await tryModal('openMonthReports', `openMonthReports()`);
    await tryModal('renderMonthClose Sep', `renderMonthClose('2026-09')`);
    await tryModal('renderMonthClose Aug', `renderMonthClose('2026-08')`);
    await tryModal('openExport', `openExport()`);
    await tryModal('openDoctorsDirectory', `openDoctorsDirectory()`);
    await tryModal('openDoctorRecords', `openDoctorRecords(${JSON.stringify(first.id)})`);
    if(first.docId) await tryModal('openDoctorProfile', `openDoctorProfile(${JSON.stringify(first.id)}, ${JSON.stringify(first.docId)})`);
    await tryModal('openCoverageBoard', `openCoverageBoard()`);
    await tryModal('openProductMovement', `openProductMovement()`);
    await tryModal('openCategoryGuides', `openCategoryGuides()`);
    await tryModal('openPlaybook', `openPlaybook(SPECIALTIES[0])`);
    await tryModal('openVisitLog', `openVisitLog()`);
    await tryModal('openDataEntry', `openDataEntry()`);
    if(role === 'supervisor'){
      await tryModal('openAdminPanel', `openAdminPanel()`);
      await tryModal('openManageClinics', `openManageClinics()`);
      await tryModal('openMissingClinics', `openMissingClinics()`);
      await tryModal('openContactImport', `openContactImport()`);
      await tryModal('openErpImport', `openErpImport()`);
      await tryModal('openErpRecon', `openErpRecon('seed_sales3_aug26')`);
      await tryModal('openAddClinic', `openAddClinic()`);
      await tryModal('openEditClinic', `openEditClinic(${JSON.stringify(first.id)})`);
    }
    // ---- rep isolation ----
    if(role === 'rep'){
      const iso = await page.evaluate((me) => {
        const other = clinics.filter(c => c.rep && c.rep !== me && c.cls !== 'Closed').slice(0, 5).map(c => c.name);
        switchView('clinics'); const listTxt = (document.getElementById('view-clinics')||{}).innerText || '';
        const leaks = other.filter(n => listTxt.includes(n));
        const vv = visibleVisits(); const foreign = vv.filter(v => v.rep !== me && v.withRep !== me).length;
        const csv = buildVisitsCSV(exportRange()); const csvForeign = csv.slice(1).filter(l => l && !String(Array.isArray(l)?l.join(','):l).includes(me)).length;
        const tk = visibleTasks().filter(t => t.rep && t.rep !== me).length;
        return { leaks, foreign, csvForeign, tk, vv: vv.length };
      }, who);
      check(`${who}: sees only her own clinics/visits/tasks/CSV`, !iso.leaks.length && iso.foreign===0 && iso.csvForeign===0 && iso.tk===0, iso);
      // ---- log a visit end to end, edit it, delete it ----
      const flow = await page.evaluate(async (me) => {
        const out = {};
        const mine = clinics.filter(c => c.rep === me && c.cls !== 'Closed');
        const c = mine[3] || mine[0];
        const nBefore = visits.length;
        switchView('log'); prepLogView(c.id);
        openQuickAddDoctor(c.id); document.getElementById('newDocName').value = 'Dr. Flow Test'; await quickAddDoctorSave(c.id);
        out.selectedDoctors = selectedDoctorIds.length;
        const pid = products.find(p => p.price > 0); toggleProductChip(pid._key || pid.id);
        document.getElementById('visitNotes').value = 'smoke flow visit';
        const fu = document.getElementById('followUpDate'); if(fu) fu.value = '2026-10-05';
        await saveVisit(); await new Promise(r => setTimeout(r, 400));
        out.saved = visits.length === nBefore + 1;
        const v = visits.find(x => x.notes === 'smoke flow visit');
        out.visit = v && { clinicId: v.clinicId === c.id, rep: v.rep, doctorIds: v.doctorIds.length, products: v.products.length, date: v.date, nextFollowUp: v.nextFollowUp };
        const cc = clinics.find(x => x.id === c.id);
        out.clinicLastVisit = cc.lastVisit; out.clinicFollowUp = cc.nextFollowUp;
        if(v){ openEditVisit(v.id); out.editModal = (document.getElementById('modalInner')||{}).innerText.length > 30; closeModal(); }
        out.newVisitId = v && v.id;
        return out;
      }, who);
      check(`${who}: log visit end-to-end saves with doctor/product/follow-up and stamps the clinic`, flow.saved && flow.visit && flow.visit.clinicId && flow.visit.doctorIds===1 && flow.visit.products===1 && flow.visit.date===today && flow.clinicLastVisit===today && flow.visit.nextFollowUp==='2026-10-05' && flow.editModal, flow);
      const inCloud = JSON.parse(cloud.visits).some(v => v.notes === 'smoke flow visit');
      check(`${who}: the new visit reached the cloud`, inCloud);
      acceptDialogs = true;
      const del = await page.evaluate(async (id) => { const n = visits.length; await deleteVisit(id); await new Promise(r => setTimeout(r, 300)); return { gone: visits.length === n - 1 && !visits.some(v => v.id === id) }; }, flow.newVisitId);
      acceptDialogs = false;
      check(`${who}: delete visit removes it locally and in the cloud`, del.gone && !JSON.parse(cloud.visits).some(v => v.id === flow.newVisitId), del);
      // task add/toggle/delete
      const task = await page.evaluate(async () => { switchView('today'); const n = tasks.length; document.getElementById('newTaskInput').value = 'smoke task'; await addTask(); const t = tasks.find(x => x.text === 'smoke task'); await toggleTask(t.id); const done = t.done; await deleteTask(t.id); return { added: tasks.length >= n, done, removed: !tasks.some(x => x.id === t.id) }; });
      check(`${who}: task add/toggle/delete`, task.added && task.done && task.removed, task);
    }
    check(`${who}: no page errors during the tour`, errors.length===0, errors.slice(0,6));
  }
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
