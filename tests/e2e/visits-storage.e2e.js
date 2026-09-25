// Visits storage (v90): one live document for the current month plus one
// archive document per past month, assembled in memory. Two devices on a
// shared fake cloud with an atomic update(), clock pinned to 2026-09-21.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const PORT = 8233;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const cloud = {}; let lock = Promise.resolve();
const mode = { failGet: null, reads: [] };
const api = {
  get: async k => { mode.reads.push(k); if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { cloud[k] = v; return true; }, setMany: async e => { e.forEach(([k, v]) => { cloud[k] = v; }); return true; },
  del: async k => { delete cloud[k]; return true; }, list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,500):'')); if(!ok) failed++; }
const SEP_OFFSET = new Date('2026-09-21T10:00:00').getTime() - Date.now();
const OCT_OFFSET = new Date('2026-10-01T09:00:00').getTime() - Date.now();
const keys = () => Object.keys(cloud).filter(k => /^visits/.test(k)).sort();
const doc = k => UMCoreParse(cloud[k]);
function UMCoreParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }
(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  const mkPage = async (label, offset) => {
    const ctx = await browser.newContext(); await blockFirebase(ctx);
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-get/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set); await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
    let releaseFn = null;
    await page.exposeFunction('__cAcquire', async () => { await lock; let rel; lock = new Promise(r => rel = r); releaseFn = rel; return true; });
    await page.exposeFunction('__cRelease', async () => { if(releaseFn){ releaseFn(); releaseFn = null; } return true; });
    await page.addInitScript((off) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { await window.__cAcquire(); try{ const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(); } },
      };
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    }, offset == null ? SEP_OFFSET : offset);
    const boot = async (who, role) => { await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250); await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role}); await page.waitForTimeout(300); };
    return { page, boot, label };
  };
  const A = await mkPage('A'), B = await mkPage('B');
  // ---------- seed: a LEGACY account — every visit in the single `visits` document ----------
  await A.boot('Dr. Ghaith', 'supervisor');
  const base = await A.page.evaluate(() => ({ clinics: clinics.filter(c => c.cls !== 'Closed').slice(0, 6).map(c => ({ id: c.id, rep: c.rep })), reps: REPS.slice() }));
  const mk = (id, date, rep, extra) => Object.assign({ id, clinicId: base.clinics[id.length % base.clinics.length].id, rep, date, ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'seed ' + id }, extra || {});
  const legacy = [];
  const days = { '2026-07': [1, 8, 15, 22, 29], '2026-08': [2, 9, 16, 23, 30], '2026-09': [1, 7, 14, 20] };
  Object.keys(days).forEach(m => days[m].forEach(d => base.reps.forEach((rep, i) => legacy.push(mk(`v-${m}-${d}-${i}`, `${m}-${String(d).padStart(2,'0')}`, rep)))));
  cloud.visits = JSON.stringify(legacy);
  cloud.clinics = JSON.stringify(await A.page.evaluate(() => clinics));
  cloud.tasks = '[]'; cloud.dayPlans = '{}'; cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  delete cloud.tombs;
  const N = legacy.length;
  await A.boot('Dr. Ghaith', 'supervisor');
  const s1 = await A.page.evaluate(() => ({ n: visits.length, sep: visits.filter(v => v.date >= '2026-09-01').length, broken: _visitsBroken.slice() }));
  check('legacy account boots with every visit (' + N + ') from the single document', s1.n === N && s1.broken.length === 0, s1);
  // the first save splits the log: this month stays in `visits`, past months move to their archives
  await A.page.evaluate(async () => { visits.push({ id: 'new-A1', clinicId: clinics[0].id, rep: REPS[0], date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], notes: 'first save after upgrade' }); return persist('visits'); });
  const after = { keys: keys(), live: doc('visits').length, jul: (doc('visitsArch:2026-07')||[]).length, aug: (doc('visitsArch:2026-08')||[]).length, idx: doc('visitsIndex') };
  check('first save: live = September + the new visit; July and August in their own documents; index lists both months',
    after.live === 4*2+1 && after.jul === 5*2 && after.aug === 5*2 && after.idx && Object.keys(after.idx.months).sort().join()==='2026-07,2026-08' && after.idx.months['2026-08'].n === 10, after);
  const mem1 = await A.page.evaluate(() => ({ n: visits.length, dup: visits.length - new Set(visits.map(v=>v.id)).size }));
  check('memory still holds every visit exactly once', mem1.n === N + 1 && mem1.dup === 0, mem1);
  // reload from the split documents: identical list, archives read once, then only live + index each refresh
  mode.reads = [];
  await A.boot('Dr. Ghaith', 'supervisor');
  const s2 = await A.page.evaluate(() => ({ n: visits.length, all: reportVisitsBase().length }));
  const reads1 = mode.reads.filter(k => /^visits/.test(k));
  mode.reads = [];
  await A.page.evaluate(() => loadAll());
  const reads2 = mode.reads.filter(k => /^visits/.test(k));
  check('reload assembles the same ' + (N+1) + ' visits; boot reads live+index+2 archives, a refresh reads only live+index', s2.n === N + 1 && reads1.length === 4 && reads2.sort().join() === 'visits,visitsIndex', { n: s2.n, reads1, reads2 });
  // ---------- two devices ----------
  await B.boot('Mariam', 'rep');
  const augId = 'v-2026-08-9-0';
  await B.page.evaluate(async (id) => { const v = visits.find(x => x.id === id); v.notes = 'edited on B'; return persist('visits'); }, augId);
  const bWrite = { aug: doc('visitsArch:2026-08').find(v => v.id === augId).notes, live: doc('visits').some(v => v.id === augId), rev: doc('visitsIndex').months['2026-08'].rev };
  await A.page.evaluate(() => loadAll());
  const aSees = await A.page.evaluate((id) => visits.find(x => x.id === id).notes, augId);
  check('an edit to an August visit on B lands in the August document and reaches A on its next refresh (index revision changed)', bWrite.aug === 'edited on B' && !bWrite.live && aSees === 'edited on B', { bWrite, aSees });
  // concurrent saves from both devices — both land
  const addV = (pg, id) => pg.evaluate(async (id) => { visits.push({ id, clinicId: clinics[0].id, rep: currentUser.name, date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [] }); return persist('visits'); }, id);
  const [okA, okB] = await Promise.all([addV(A.page, 'race-A'), addV(B.page, 'race-B')]);
  check('concurrent saves on two devices both land in the live document', okA && okB && doc('visits').some(v=>v.id==='race-A') && doc('visits').some(v=>v.id==='race-B'));
  // delete an old visit on A; B (stale) saves — it must not come back; restore from bin brings it back into its month
  await A.boot('Dr. Ghaith', 'supervisor');
  const delId = 'v-2026-07-15-1';
  await A.page.evaluate(async (id) => { await deleteVisit(id); }, delId);
  await B.page.evaluate(async () => { visits.find(v => v.id === 'race-B').notes = 'touch'; return persist('visits'); });
  const afterDel = { jul: doc('visitsArch:2026-07').some(v => v.id === delId), bin: doc('recycleBin').visits.some(v => v.id === delId), onB: await B.page.evaluate((id) => visits.some(v => v.id === id), delId) };
  check('deleting a July visit removes it from the July document, a stale device\'s save does not resurrect it, and it sits in the bin', !afterDel.jul && afterDel.bin && !afterDel.onB, afterDel);
  await A.page.evaluate(async (id) => { const i = recycleBin.visits.findIndex(v => v.id === id); await restoreFromBin('visits', i); }, delId);
  check('restoring it from the bin puts it back into the July document', doc('visitsArch:2026-07').some(v => v.id === delId) && !doc('visits').some(v => v.id === delId));
  // a date edit moves a visit from September to August: it must end up in ONE document only
  const moveId = 'v-2026-09-7-0';
  await A.page.evaluate(async (id) => { openEditVisit(id); document.getElementById('evDate').value = '2026-08-12'; await saveEditVisit(id); }, moveId);
  const moved = { live: doc('visits').some(v => v.id === moveId), aug: doc('visitsArch:2026-08').filter(v => v.id === moveId).length, mem: await A.page.evaluate((id) => visits.filter(v => v.id === id).map(v => v.date), moveId) };
  check('a visit whose date moved to August leaves the live document and sits once in August (memory: one copy, new date)', !moved.live && moved.aug === 1 && moved.mem.join() === '2026-08-12', moved);
  // an old app version writes the WHOLE list back into `visits` (legacy union) — the next save re-homes it, nothing duplicated or lost
  const before = await A.page.evaluate(() => visits.length);
  cloud.visits = JSON.stringify(doc('visits').concat(doc('visitsArch:2026-07'), doc('visitsArch:2026-08'), [mk('old-dev-aug', '2026-08-28', base.reps[1], { notes: 'logged by an old version, straight into visits' })]));
  await A.page.evaluate(() => loadAll());
  await A.page.evaluate(async () => { visits.push({ id: 'new-A2', clinicId: clinics[0].id, rep: REPS[0], date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [] }); return persist('visits'); });
  const rehomed = { liveOld: doc('visits').filter(v => v.date < '2026-09-01').length, augHasOld: doc('visitsArch:2026-08').some(v => v.id === 'old-dev-aug'), mem: await A.page.evaluate(() => ({ n: visits.length, dup: visits.length - new Set(visits.map(v=>v.id)).size, hasOld: visits.some(v=>v.id==='old-dev-aug') })) };
  check('an old version\'s full-list write is re-homed on the next save: nothing old left in live, the old-version visit is kept, no duplicates', rehomed.liveOld === 0 && rehomed.augHasOld && rehomed.mem.dup === 0 && rehomed.mem.hasOld && rehomed.mem.n === before + 2, rehomed);
  // an unreadable archive: warning card, the month is never written, saving still works, retry loads it
  mode.failGet = /^visitsArch:2026-07$/;
  await A.boot('Dr. Ghaith', 'supervisor');
  const julBefore = cloud['visitsArch:2026-07'];
  const brokenState = await A.page.evaluate(async () => { const before = { n: visits.length, broken: _visitsBroken.slice(), nudge: (document.getElementById('visitsNudge')||{}).innerText||'' }; visits.push({ id: 'new-A3', clinicId: clinics[0].id, rep: REPS[0], date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [] }); const ok = await persist('visits'); return Object.assign(before, { ok }); });
  mode.failGet = null;
  const retried = await A.page.evaluate(async () => { await retryVisitsArchives(); return { n: visits.length, broken: _visitsBroken.slice(), nudge: (document.getElementById('visitsNudge')||{}).style.display }; });
  check('July unreadable → warning card, July visits missing for now, saving works and never writes July; retry brings July back', brokenState.broken.join()==='2026-07' && /2026-07/.test(brokenState.nudge) && brokenState.ok && cloud['visitsArch:2026-07'] === julBefore && retried.broken.length === 0 && retried.n === brokenState.n + 1 + 10 && retried.nudge === 'none', { brokenState, retried });
  // the daily backup carries this month's visits only and a restore keeps the archived months
  const snap = await A.page.evaluate(async () => { const k = 'snap_' + todayStr(); await window.storage.delete(k); await maybeSnapshot(); const s = JSON.parse((await window.storage.get(k)).value); return { visits: s.visits.length, months: s.visitsMonths, key: k }; });
  check('the daily backup holds September only (past months are their own documents)', snap.visits === doc('visits').length && snap.months && snap.months['2026-08'] > 0, snap);
  const restored = await A.page.evaluate(async (k) => { await restoreSnapshot(k.replace('snap_','')); return { n: visits.length, jul: visits.filter(v => v.date < '2026-08-01').length }; }, snap.key);
  check('restoring that backup keeps July and August', restored.jul === 10 && restored.n === (await A.page.evaluate(() => visits.length)), restored);
  // ---------- month rollover: October 1 ----------
  const C = await mkPage('C', OCT_OFFSET);
  await C.boot('Dr. Ghaith', 'supervisor');
  const oct0 = await C.page.evaluate(() => ({ today: todayStr(), n: visits.length }));
  await C.page.evaluate(async () => { visits.push({ id: 'oct-1', clinicId: clinics[0].id, rep: REPS[0], date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [] }); return persist('visits'); });
  const oct = { live: doc('visits').map(v => v.id), sep: (doc('visitsArch:2026-09')||[]).length, idx: Object.keys(doc('visitsIndex').months).sort().join(), mem: await C.page.evaluate(() => visits.length) };
  check('on October 1 the first save moves September into its own document; live holds only the new October visit; nothing lost', oct0.today === '2026-10-01' && oct.live.join() === 'oct-1' && oct.sep === doc('visitsArch:2026-09').length && oct.sep >= 8 && oct.idx === '2026-07,2026-08,2026-09' && oct.mem === oct0.n + 1, { oct0, oct });
  // a month that would exceed the cloud's document cap is refused with a plain message, nothing half-written
  const big = await A.page.evaluate(async () => { const toasts = []; const real = showToast; window.showToast = m => { toasts.push(m); real(m); }; const before = JSON.stringify(await window.storage.get('visits')); visits.push({ id: 'huge', clinicId: clinics[0].id, rep: REPS[0], date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: [], orderTotal: 0, doctorIds: [], photos: [{ id: 'p', thumb: 'x'.repeat(1000000) }] }); const ok = await persist('visits'); window.showToast = real; visits = visits.filter(v => v.id !== 'huge'); outboxWrite(outboxList().filter(k => k !== 'visits')); return { ok, toast: toasts.find(t => /كبيرة جدًا/.test(t)) || '', unchanged: JSON.stringify(await window.storage.get('visits')) === before }; });
  check('a month over the document cap is refused with a plain message and the cloud is untouched', big.ok === false && /كبيرة جدًا/.test(big.toast) && big.unchanged, big);
  check('no page errors on any device', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
