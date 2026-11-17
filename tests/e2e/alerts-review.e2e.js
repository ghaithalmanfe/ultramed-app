// The independent review of the alerts center (alerts-v126, 4133ac3: `git diff 328e2bc 4133ac3`). Each check below is a
// problem the review found, reproduced first: it fails on 4133ac3 and states the correct result. Invented data only.
//   R1  one pace rule: at 89.7 % of an even pace the home's target card says "On pace" (msPace rounds to a whole
//       percent) while the alerts center says "Month target at risk" and the coach says "behind" (UMCore.targetPace) —
//       on her own screen and on the supervisor's leaderboard
//   R2  a target from an earlier month: the card says "the month's pace is not judged against it", while the Today card
//       (and the coach) judge her pace against that very target ("Behind pace")
//   R3  customers buying less on a month the files hold only in part (this month's only file starts on Nov 5): a
//       customer whose purchase falls in the days no file holds is called "buying less" (−100 %), the window given as
//       "Nov 1 – Nov 9"
//   R4  the target at risk on that partial month: its reason says "ERP sales files to Nov 9" — the Today card says
//       "ERP to Nov 9 (partial month)"
//   R5  a client request answered on this phone: the bell keeps counting it (nothing on that screen asks the bell; the
//       sheet, opened, has one card fewer than the bell said) — until a drawing of the home or the next round's redraw
//   R6  today's backup: "Check now" on the card of a check that failed does nothing within the hour (maybeSnapshot's own
//       wait) and says "Today's backup could not be saved — try again later" — no read, no write was tried
//   R7  alert settings not saved (no connection): the phone's copy keeps them, and the next round that reads the
//       settings from that copy puts them in force on this phone — the sheet then shows them as the settings in force
//       (R7a); a later save of the same document (the KPI settings) then saves them for the whole team (R7b)
//   R8  the visit photo cards rest on the visits list too: when the visits were not read from the cloud (served from
//       the phone's copy), every other card says so — the photo cards do not (R8); the same in the early open's window,
//       where the sheet opened by a tap gives every other card the copy's basis (R8b)
//   R9  Arabic: the people are written as the home and the deck write them («رانوفا»، «مريم»), not in Latin letters
//   R10 Arabic: "(6 days ago)" written as the app writes it elsewhere («قبل 6 أيام»), not «قبل 6 يوم»
//   R11 a failed sales import on this phone, then the file imported on the supervisor's other device: the card still says
//       "The last sales file import failed" and "The figures still come from the files saved before" for seven days
//   R12 the alert settings: a number out of its limits is dropped without a word, and the toast says "saved for the whole team"
//   R1c the printed management report by the same rule; R7c the KPI settings told "not saved" never in force, the
//       document taken whole from the cloud (defaults for what it lacks); and the unproven items settled:
//   R13 (U1) an alert-settings save with no answer in time that never lands is never in force; R14 (U2) a dismissal
//       covers only what the card listed; R15 (U3) Upload now's words with one list only in memory; R16 (U4) targets
//       saved in Admin over another screen — the bell follows; R17 (U6) Check now while the day's check is on its way;
//       R18 (U9) the DSR is the supervisor's to upload, and the supervisor is never told to ask the supervisor
// The clock is fixed (Wed 11 Nov 2026, 13:30) and can be moved forward without a reload (window.__shiftMs: a phone that
// slept — its timers held back). Port 8294. Env: ONLY=R1,R2,…  WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8294, URL = `http://localhost:${PORT}/index.html`;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const cloud = {};
const mode = { failSet: null, failGet: null, snapReads: [], hangSet: null, slowSnap: 0, denySnap: false };
const api = {
  get: async k => { if(/^snap_/.test(k)){ mode.snapReads.push(k); if(mode.slowSnap) await new Promise(r => setTimeout(r, mode.slowSnap)); } if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get ' + k); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => {
    if(mode.hangSet && mode.hangSet.test(k)){ await new Promise(r => setTimeout(r, 9000)); throw new Error('boom-late ' + k); }   // no answer in time, then a failure: it never lands
    if(mode.denySnap && /^snap_/.test(k)){ const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }   // the security rules refuse it
    if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set ' + k); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith', MS = 'Mariam Sample', RS = 'Ranova Sample Person';
const DAY = 86400000, NOW0 = new Date(2026, 10, 11, 13, 30).getTime(), THUMB = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const C = (id, name, rep, x) => Object.assign({ id, name, rep, cls: 'B', doctors: [] }, x || {});
const FILL = Array.from({ length: 14 }, (_, i) => C('f' + (i + 1), 'Filler Clinic ' + (i + 1), i % 2 ? R : M));   // a team-sized list
const CLINICS = [C('m1', 'Amberline Clinic', M, { cls: 'A' }), C('m2', 'Birchwood Center', M, { nextFollowUp: '2026-11-05' }),
  C('m3', 'Cobaltia Clinic', M), C('m4', 'Dunevale Dental', M), C('m6', 'Emberly Clinic', M),
  C('r1', 'Fernhill Center', R, { nextFollowUp: '2026-11-01' }), C('r2', 'Garnetta Center', R), C('r3', 'Harborview Clinic', R)].concat(FILL);
const row = (d, doc, cust, net, sm) => [d, doc, 0, 'Waterpik Cordless Plus', 1, net, net, 0, sm, 'Waterpik', cust, 'Clinics', 0, ''];
const repMap = { [MS]: M, [RS]: R };
// The cloud as the team's phones left it. opts: { targets, nov: rows, novFrom, oct: rows, benchmarks, events, visits }
let seedNo = 0;
function seed(opts){
  opts = opts || {}; seedNo++;
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();   // Mariam and Renova sell; Dr. Ghaith supervises and does not
  cloud.clinics = JSON.stringify(CLINICS);
  cloud.visits = JSON.stringify(opts.visits || [{ id: 'v1', clinicId: 'm1', rep: M, date: '2026-11-09' }, { id: 'v2', clinicId: 'm6', rep: M, date: '2026-11-11' },
    { id: 'v3', clinicId: 'r2', rep: R, date: '2026-11-11', callOnly: true, channel: 'call' }]);
  cloud.dayPlans = JSON.stringify({ '2026-11-09': { [M]: ['m3'] }, '2026-11-08': { [R]: ['r3'] } });
  cloud.events = JSON.stringify(opts.events || []);
  cloud.targets = JSON.stringify(opts.targets || { [M]: { revenue: 10000, month: '2026-11' }, [R]: { revenue: 2000, month: '2026-11' } });
  cloud.tasks = JSON.stringify([]);
  cloud.erpMap = JSON.stringify({});
  if(opts.benchmarks) cloud.benchmarks = JSON.stringify(opts.benchmarks);
  const OCT = opts.oct || [row('2026-10-03', 'SINV1', 'Amberline Clinic', 800, MS), row('2026-10-04', 'SINV2', 'Birchwood Center', 500, MS), row('2026-10-06', 'SINV4', 'Fernhill Center', 600, RS)];
  const NOV = opts.nov || [row('2026-11-02', 'SINV11', 'Amberline Clinic', 700, MS), row('2026-11-03', 'SINV12', 'Birchwood Center', 480, MS), row('2026-11-04', 'SINV13', 'Garnetta Center', 900, RS)];
  const sum = rs => Math.round(rs.reduce((s, r) => s + r[6], 0) * 100) / 100;
  // the one-time repair sweeps of earlier releases have run, as on the team's phones
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: { [MS]: M, [RS]: R }, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true },
    periods: [{ id: 'oct' + seedNo, from: '2026-10-01', to: '2026-10-31', repMap, rows: OCT, rowCount: OCT.length, net: sum(OCT) },
      { id: 'nov' + seedNo, from: opts.novFrom || '2026-11-01', to: '2026-11-09', repMap, rows: NOV, rowCount: NOV.length, net: sum(NOV) }] });
  cloud.erpSales = JSON.stringify(sp.index); Object.keys(sp.docs).forEach(k => { cloud[k] = JSON.stringify(sp.docs[k]); });
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
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom/i.test(m.text())) errors.push('console: '+m.text()); });
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
    // the clock: Wed 11 Nov 2026 13:30, or the instant the harness asked for; ticking; window.__shiftMs moves it forward
    // with no reload (a phone that slept: its timers held back, the clock moved on)
    let want = NaN; try{ want = Number(localStorage.getItem('__fakeNow')); }catch(e){}
    const base = isFinite(want) && want > 0 ? want : new Date(2026, 10, 11, 13, 30, 0).getTime();
    const off = base - Date.now();
    window.__shiftMs = 0;
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off + window.__shiftMs); else super(...a); } static now(){ return _D.now() + off + window.__shiftMs; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    // the 20-second round driven by hand
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = () => fn(); return -1; } return _si(fn, ms, ...a); };
  });
  const settle = () => page.evaluate(async () => { await msWhenReady(); if(typeof alertsWhenReady === 'function') await alertsWhenReady(); await new Promise(r => setTimeout(r, 150)); });
  const boot = async (who, role, local, clock) => {
    await page.goto(URL); await page.waitForTimeout(150);
    await page.evaluate(({ l, c }) => { try{ localStorage.clear(); if(c) localStorage.setItem('__fakeNow', String(c)); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, { l: local || null, c: clock || null });
    await page.goto(URL); await page.waitForTimeout(250);
    await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role });
    await page.waitForTimeout(350);
    await settle();
  };
  // a round of the 20-second refresh, and what follows it (the bell is worked out after it)
  const round = async () => { await page.evaluate(async () => { await window.__bgTick(); }); await settle(); await page.waitForTimeout(300); await settle(); };
  // the bell as a person sees it, before the sheet is opened
  const bell = () => page.evaluate(() => { const b = document.getElementById('alertsBellN'); return b.hidden ? 0 : +b.textContent; });
  // opens the sheet and reads it the way a person sees it
  const center = () => page.evaluate(async () => {
    openAlerts(); await new Promise(r => setTimeout(r, 120));
    const box = document.getElementById('alertsCenter'), txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    const card = c => ({ id: c.dataset.alId, type: c.dataset.alType, title: txt(c.querySelector('.al-title')), why: [...c.querySelectorAll('.al-why > div')].map(txt),
      items: [...c.querySelectorAll('.al-item')].map(txt) });
    const badge = document.getElementById('alertsBellN');
    const out = { cards: [...box.querySelectorAll('.al-card:not(.al-off)')].map(card), badge: badge.hidden ? 0 : +badge.textContent };
    closeModal(); return out;
  });
  const byId = (c, id) => c.cards.find(x => x.id === id) || null;
  const ids = c => c.cards.map(x => x.id).join(',');
  const lbRow = who => page.evaluate(w => { const el = [...document.querySelectorAll('#targetCard .ms-person[data-person]')].find(x => x.dataset.person === w); const s = el && el.querySelector('.det .s'); return s ? s.textContent.replace(/\s+/g, ' ').trim() : null; }, who);
  const homePace = () => page.evaluate(() => { const el = document.querySelector('#targetCard [data-ms="pace"]'); return el ? { state: el.dataset.value, words: el.textContent.trim() } : null; });
  const coachText = () => page.evaluate(() => { switchView('reports'); const t = (document.getElementById('coachCard') || {}).innerText || ''; switchView('today'); return t.replace(/\s+/g, ' '); });

  // ---- R1: one pace rule — 89.7 % of an even pace ----
  if(want('R1')){
    // Mariam: 10,000 KD target; the files to Nov 9 (7 of the month's 22 working days: an even pace is 3,181.82 KD); she
    // invoiced 2,854.00 KD = 89.70 % of that even pace — below 90 % by the coach's rule, 90 % once rounded
    seed({ nov: [row('2026-11-02', 'SINV11', 'Amberline Clinic', 1854, MS), row('2026-11-03', 'SINV12', 'Birchwood Center', 1000, MS), row('2026-11-04', 'SINV13', 'Garnetta Center', 900, RS)] });
    await boot(M, 'rep');
    const home = await homePace(), c = await center(), coach = await coachText();
    const t = byId(c, 'target:Mariam:2026-11');
    check('R1a: Mariam at 89.7 % of an even pace — her Today card and the alerts center say the same (one rule): "Behind pace" with the "Month target at risk" card, or "On pace" with none',
      !!home && (home.state === 'behind') === !!t, { home, alert: t && t.title, pace: t && t.why[2], coach: (coach.match(/Mariam is [^.]*target/) || [])[0] });
    await boot(G, 'supervisor');
    const rowM = await lbRow(M), c2 = await center();
    const t2 = byId(c2, 'target:Mariam:2026-11');
    check('R1b: the supervisor — Mariam\'s leaderboard row and the alerts center say the same: never "On pace" beside "Mariam: month target at risk"',
      !!rowM && (/Behind pace/.test(rowM)) === !!t2, { row: rowM, alert: t2 && t2.title });
    // the printed management report's targets table (Pace, Status) — the same rule, its percentage on its word's side
    const rep1 = await page.evaluate(() => { const box = document.createElement('div'); box.innerHTML = buildMasterReportBody('en');
      const tr = [...box.querySelectorAll('tr')].find(x => /^Mariam$/.test(((x.querySelector('td b') || {}).textContent || '').trim()));
      const td = tr ? [...tr.querySelectorAll('td')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) : null; return td ? { pace: td[3], status: td[5] } : null; });
    check('R1c: the printed management report says the same by the same rule — Pace 89% and Behind for 89.7 % of an even pace (never 90% and On pace beside the alert\'s "Pace: 89%")',
      !!rep1 && rep1.pace === '89%' && rep1.status === 'Behind' && !!t2, { report: rep1, alert: t2 && t2.why[2] });
  }

  // ---- R2: a target from an earlier month ----
  if(want('R2')){
    // Renova's target is October's (2,000 KD); in November she invoiced 300 KD to Nov 9 (47 % of an even pace)
    seed({ targets: { [M]: { revenue: 10000, month: '2026-11' }, [R]: { revenue: 2000, month: '2026-10' } },
      nov: [row('2026-11-02', 'SINV11', 'Amberline Clinic', 700, MS), row('2026-11-04', 'SINV13', 'Garnetta Center', 300, RS)] });
    await boot(G, 'supervisor');
    const rowR = await lbRow(R), c = await center(), coach = await coachText();
    const ts = byId(c, 'target-stale:Renova:2026-11'), said = ts ? ts.why.join(' ') : '';
    const judged = /Behind pace|On pace|Ahead of pace/.test(rowR || '');
    check('R2a: a target from an earlier month — the card says only what is true of the Today card: the Today card judges Renova\'s pace against that target ("Behind pace"), so the card never says "the month\'s pace is not judged against it"',
      !!ts && !(judged && /pace is not judged/.test(said)), { row: rowR, card: ts && ts.why, coach: (coach.match(/Renova is [^.]*target/) || [])[0] });
    await boot(R, 'rep');
    const home = await homePace(), c2 = await center();
    const ts2 = byId(c2, 'target-stale:Renova:2026-11'), said2 = ts2 ? ts2.why.join(' ') : '';
    check('R2b: …on Renova\'s own phone as well: her target card says "' + (home && home.words) + '" against the October target, her alert must not say the pace is not judged against it',
      !!ts2 && !(home && /pace is not judged/.test(said2)), { home, card: ts2 && ts2.why });
  }

  // ---- R3 / R4: a month the files hold only in part ----
  if(want('R3') || want('R4')){
    // this month's only file covers Nov 5 – Nov 9 (the Nov 1 – 4 file was never uploaded): Amberline's November
    // purchase is in the days no file holds; Birchwood bought 480 KD on Nov 5
    seed({ novFrom: '2026-11-05', nov: [row('2026-11-05', 'SINV12', 'Birchwood Center', 480, MS), row('2026-11-08', 'SINV13', 'Garnetta Center', 300, RS)] });
    await boot(M, 'rep');
    const src = await page.evaluate(() => ((document.querySelector('#targetCard .ms-src2') || {}).textContent || '').trim());
    const c = await center();
    const drop = byId(c, 'drop:Mariam:2026-11'), tgt = byId(c, 'target:Mariam:2026-11');
    if(want('R3')) check('R3: the files hold Nov 5 – Nov 9 only (the Today card: "' + src + '") — no customer is called "buying less" for days no file holds: Amberline (bought 800 KD on Oct 3) is not listed at −100 % for "Nov 1 – Nov 9"',
      /partial month/.test(src) && !(drop && drop.items.some(t => /^Amberline Clinic/.test(t))), { src, drop });
    if(want('R4')) check('R4: a "Month target at risk" card on that month says, as the Today card does ("' + src + '"), that the files miss part of the month — never only "ERP sales files to Nov 9"',
      /partial month/.test(src) && (!tgt || tgt.why.some(w => /partial month/i.test(w))), { src, why: tgt && tgt.why });
  }

  // ---- R5: a client request answered on this phone ----
  if(want('R5')){
    seed({ events: [{ id: 'rq1', kind: 'issue', type: 'request', clinicId: 'm1', rep: M, text: 'Asked for the price list', at: '2026-11-10T10:00:00', createdBy: M }] });
    await boot(M, 'rep');
    const before = await bell(), had = await page.evaluate(() => _alerts.shown.some(a => a.id === 'request:Mariam'));
    // from More → Requests, escalations & stands (where a request is marked answered), as she does it
    await page.evaluate(async () => { closeModal(); switchView('more'); openClientLog(); await resolveClientLog('rq1'); closeModal(); });
    await page.waitForTimeout(1500);
    const after = await bell(), saved = /resolvedAt/.test(cloud.events || '');
    const c = await center();
    await round(); const afterRound = await bell();
    check('R5: a request answered on this phone ("✓ Answered", saved) — the bell follows by itself: its number is the cards the sheet then shows (no request card)',
      had && saved && after === c.cards.length && !byId(c, 'request:Mariam'), { before, after, sheet: c.cards.length, ids: ids(c), saved, afterTheNextRound: afterRound });
  }

  // ---- R6: today's backup, "Check now" on the card of a check that failed ----
  if(want('R6')){
    seed();
    await boot(G, 'supervisor', null, new Date(2026, 10, 11, 16, 30).getTime());
    mode.failSet = /^snap_/;   // the first check's write does not land
    await center(); await page.evaluate(async () => { await alertsCheckBackup(null); });
    mode.failSet = null;       // the cloud answers again
    const c0 = await center(), bf = byId(c0, 'backup-failed:2026-11-11');
    mode.snapReads = [];
    const r = await page.evaluate(async () => { await alertsCheckBackup(null); return document.getElementById('toast').textContent; });
    const c1 = await center();
    check('R6: "Check now" on the card of a backup check that failed (offered by that card): it checks now — one read of today\'s backup, written when missing — or says when the phone tries again; never "could not be saved" when nothing was tried',
      !!bf && (bf.why || []).length > 0 && !(mode.snapReads.length === 0 && /could not be saved/.test(r)),
      { card: bf && bf.why, reads: mode.snapReads, toast: r, written: !!cloud['snap_2026-11-11'], after: ids(c1) });
  }

  // ---- R7: alert settings not saved ----
  if(want('R7')){
    seed();
    await boot(G, 'supervisor');
    const c0 = await center();
    mode.failSet = /^benchmarks$/;   // no connection for the save
    const saved = await page.evaluate(async () => {
      openAlertSettings(); await new Promise(r => setTimeout(r, 80));
      document.getElementById('alT_drop').checked = false;
      const ok = await saveAlertSettings(); await new Promise(r => setTimeout(r, 200));
      return { ok, toast: document.getElementById('toast').textContent, inForce: UMCore.alertSettings(BENCHMARKS.alerts).types.drop };
    });
    mode.failSet = null;
    // the next round cannot read the settings from the cloud (still no connection for it): served from the phone's copy
    mode.failGet = /^benchmarks$/;
    await round();
    mode.failGet = null;
    const c1 = await center();
    const sheet = await page.evaluate(async () => { openAlertSettings(); await new Promise(r => setTimeout(r, 60)); const on = document.getElementById('alT_drop').checked; closeModal(); return on; });
    const drops = c => c.cards.filter(x => x.type === 'drop').length;
    const phoneCopy = await page.evaluate(() => { const b = UMCore.safeParse(localStorage.getItem('um_mirror:benchmarks'), null); return b && b.alerts ? { drop: b.alerts.types.drop } : null; });
    check('R7a: alert settings that were not saved stay not in force — after the next round (the settings read from this phone\'s copy) the customers cards still show and the settings sheet still shows that type on, as the cloud and every other phone have it',
      saved.ok === false && saved.inForce === true && drops(c0) > 0 && drops(c1) === drops(c0) && sheet === true,
      { saved, before: drops(c0), after: drops(c1), sheetShowsOn: sheet, phoneCopy });
    // the connection back: a round reads the cloud (which has no alert settings), then the supervisor saves the KPI settings
    await round();
    const c2 = await center();
    const kpi = await page.evaluate(async () => { openKpiSettings(); await new Promise(r => setTimeout(r, 60)); await saveKpiSettings(); await new Promise(r => setTimeout(r, 200)); closeModal(); return document.getElementById('toast').textContent; });
    const bm = JSON.parse(cloud.benchmarks || '{}');
    check('R7b: …and a later save of the same document (the KPI settings, the connection back) never saves the alert settings this phone was told were not saved — the cloud keeps the customers alerts on for the whole team',
      /KPI settings saved/.test(kpi) && !(bm.alerts && bm.alerts.types && bm.alerts.types.drop === false),
      { kpiToast: kpi, cloudAlerts: bm.alerts || null, cardsAfterConnectionBack: drops(c2) });
  }
  // ---- R7c: the KPI settings and the rest of the same document: never an unsaved edit, the defaults where the cloud has none ----
  if(want('R7')){
    seed({ benchmarks: { coverage: 70, priority: 90, conversion: 25, tasks: 85 } });   // the team's settings document: no KPI settings saved yet
    await boot(G, 'supervisor');
    const D24 = await page.evaluate(() => UMCore.KPI_DEFAULTS.responseHours);
    mode.failSet = /^benchmarks$/;   // no connection for the save
    const k1 = await page.evaluate(async () => { openKpiSettings(); await new Promise(r => setTimeout(r, 60)); document.getElementById('kpi_responseHours').value = '6';
      await saveKpiSettings(); await new Promise(r => setTimeout(r, 200)); closeModal();
      const copy = UMCore.safeParse(localStorage.getItem('um_mirror:benchmarks'), null);
      return { hours: kpiSettings().responseHours, toast: document.getElementById('toast').textContent, copyHours: copy && copy.kpi ? copy.kpi.responseHours : null }; });
    mode.failSet = null;
    await round();   // the connection back: the cloud's document — no KPI settings in it
    const k2 = await page.evaluate(() => ({ hours: kpiSettings().responseHours, coverage: BENCHMARKS.coverage, visitsPerDay: kpiSettings().visitsPerDay, alertsOn: UMCore.alertSettings(BENCHMARKS.alerts).types.drop }));
    // a later save of the same document that lands (the alert settings) carries nothing that was told "not saved"
    const k3 = await page.evaluate(async () => { openAlertSettings(); await new Promise(r => setTimeout(r, 80)); await saveAlertSettings(); await new Promise(r => setTimeout(r, 200)); closeModal(); return document.getElementById('toast').textContent; });
    const bm = JSON.parse(cloud.benchmarks || '{}');
    check('R7c: KPI settings told "not saved" never take effect either — the KPI hours stay the ones in force (' + D24 + ' h) on this phone and in its copy, the cloud\'s document is taken whole (its 70 % coverage, the defaults for what it lacks), and a later save of it carries none of the unsaved hours',
      /Not saved/.test(k1.toast) && k1.hours === D24 && k1.copyHours !== 6 && k2.hours === D24 && k2.coverage === 70 && k2.visitsPerDay === 5 && k2.alertsOn === true && /saved for the whole team/.test(k3) && !(bm.kpi && bm.kpi.responseHours === 6),
      { k1, k2, k3, cloudKpi: bm.kpi || null });
  }

  // ---- R8: what the visit photo cards rest on ----
  if(want('R8')){
    // Mariam's visit at Emberly carries a photo another phone took 4 days ago, still waiting to upload
    seed({ visits: [{ id: 'v1', clinicId: 'm1', rep: M, date: '2026-11-09' },
      { id: 'v2', clinicId: 'm6', rep: M, date: '2026-11-11', photos: [{ id: 'phOther', thumb: THUMB, pending: true, dev: 'dOther', at: NOW0 - 4 * DAY - 3600000 }] }] });
    await boot(M, 'rep', { um_device: 'dHarness' });
    // a round whose read of the visits fails: the visits on screen are this phone's copy
    mode.failGet = /^visits/;
    await round();
    mode.failGet = null;
    const flags = await page.evaluate(() => Object.keys(_mirrorUsed).concat(Object.keys(_loadFailed)));
    const c = await center();
    const missed = byId(c, 'missed:Mariam'), stale = byId(c, 'photos-stale');
    const basis = missed ? missed.why[missed.why.length - 1] : null;
    check('R8: the visits not read from the cloud — the visit photo cards say what they rest on, as every other card made from the visits does ("' + basis + '")',
      flags.includes('visits') && !!basis && /this phone's copy/i.test(basis) && !!stale && stale.why.some(w => /this phone's copy/i.test(w)), { flags, missed: missed && missed.why, stale: stale && stale.why });
  }

  // ---- R8b: the same in the early open's window ----
  if(want('R8')){
    seed({ visits: [{ id: 'v1', clinicId: 'm1', rep: M, date: '2026-11-09' },
      { id: 'v2', clinicId: 'm6', rep: M, date: '2026-11-11', photos: [{ id: 'phOther', thumb: THUMB, pending: true, dev: 'dOther', at: NOW0 - 4 * DAY - 3600000 }] }] });
    await boot(M, 'rep', { um_device: 'dHarness' });   // a whole read from the cloud: the phone's copy is marked (um_copyAt)
    // the app opened again the next moment: the early open draws from the phone's copy before the sign-in is confirmed —
    // the app's own drawing (loadAllNow({ local }), exactly as earlyOpen starts it; earlyOpen itself needs the Firebase
    // SDK, which these harnesses never load), and no read from the cloud
    await page.goto(URL); await page.waitForTimeout(300);
    const early = await page.evaluate(async () => {
      const info = JSON.parse(localStorage.getItem('um_copyAt') || 'null');
      if(!info) return { err: 'no copy mark' };
      const e = _early = { name: 'Mariam', role: 'rep', email: 'mariam@example.com', at: info.at, none: new Set(info.none), state: 'loading', confirmed: false, done: false };
      _copyTombs = copyTombsLoad();
      const r = await loadAllNow({ local: e });
      return { r, window: typeof alertsWindow === 'function' && alertsWindow(), line: (document.getElementById('copyLine') || {}).textContent || null };
    });
    const c = await center();
    const missed = byId(c, 'missed:Mariam'), stale = byId(c, 'photos-stale');
    const basis = missed ? missed.why[missed.why.length - 1] : null;
    check('R8b: the early open\'s window (this phone\'s copy on screen, no read from the cloud yet) — the visit photo cards state their basis like every other card the lists make ("' + basis + '"), never the cloud\'s state as if read',
      early.r === 'drawn' && early.window === true && !!basis && /this phone's copy/i.test(basis) && !!stale && stale.why.some(w => /this phone's copy/i.test(w)), { early, missed: missed && missed.why, stale: stale && stale.why });
  }

  // ---- R11: a failed import, then a file imported on another device of the supervisor ----
  if(want('R11')){
    seed();
    // this phone's import failed at 10:00 (an Excel file this browser could not open)
    const FAIL_AT = new Date(2026, 10, 11, 10, 0).getTime();
    await boot(G, 'supervisor', { um_erpImport: JSON.stringify({ at: FAIL_AT, ok: false, msg: '❌ Could not open this Excel file — save it as CSV and retry', who: G }) });
    const c0 = await center(), e0 = c0.cards.find(x => x.type === 'erpImport') || null;
    // 11:30: the supervisor imports the file on his laptop — the sales files now hold a file imported after the failure
    const idx = JSON.parse(cloud.erpSales);
    const extra = core.erpSplitForStorage({ periods: [{ id: 'novB' + seedNo, from: '2026-11-10', to: '2026-11-10', importedAt: new Date(2026, 10, 11, 11, 30).toISOString(), rev: 7, repMap,
      rows: [row('2026-11-10', 'SINV30', 'Amberline Clinic', 250, MS)], rowCount: 1, net: 250 }] });
    idx.periods.push(extra.index.periods[0]); cloud.erpSales = JSON.stringify(idx); Object.keys(extra.docs).forEach(k => { cloud[k] = JSON.stringify(extra.docs[k]); });
    await round();
    const c1 = await center(), e1 = c1.cards.find(x => x.type === 'erpImport') || null;
    const files = await page.evaluate(() => erpSales.periods.map(p => [p.from, p.to, p.importedAt]));
    check('R11: a file imported after this phone\'s failed import (on the supervisor\'s other device) is in the files — no card says any more that "The last sales file import failed" or that "The figures still come from the files saved before"',
      !!e0 && files.length === 3 && (!e1 || (e1.title !== 'The last sales file import failed' && !e1.why.some(w => /still come from the files saved before/.test(w)))),
      { before: e0 && [e0.title].concat(e0.why), after: e1 && [e1.title].concat(e1.why), files });
  }

  // ---- R12: a number out of its limits in the alert settings ----
  if(want('R12')){
    seed();
    await boot(G, 'supervisor');
    const r = await page.evaluate(async () => {
      openAlertSettings(); await new Promise(r => setTimeout(r, 80));
      document.getElementById('alS_noActivityHour').value = '25';   // the supervisor meant a later hour; 0–23 is allowed
      await saveAlertSettings(); await new Promise(r => setTimeout(r, 200));
      return { toast: document.getElementById('toast').textContent, inForce: UMCore.alertSettings(BENCHMARKS.alerts).noActivityHour, sheet: !!document.getElementById('alertSettings') };
    });
    check('R12: an hour typed out of its limits (25) is not kept — said so (or refused before saving), never "✅ Alert settings saved for the whole team" while the hour in force stays 12',
      r.inForce === 12 && !/saved for the whole team/.test(r.toast), r);
  }

  // ---- R13 (U1): an alert-settings save with no answer in time, that never lands ----
  if(want('R13')){
    seed();
    await boot(G, 'supervisor');
    const c0 = await center();
    mode.hangSet = /^benchmarks$/;   // the write gets no answer within the app's time, then fails: it never lands
    const r = await page.evaluate(async () => { openAlertSettings(); await new Promise(r => setTimeout(r, 80)); document.getElementById('alT_drop').checked = false;
      const ok = await saveAlertSettings(); await new Promise(r => setTimeout(r, 150));
      return { ok, toast: document.getElementById('toast').textContent, inForce: UMCore.alertSettings(BENCHMARKS.alerts).types.drop,
        copy: (UMCore.safeParse(localStorage.getItem('um_mirror:benchmarks'), null) || {}).alerts || null }; });
    const c1 = await center();
    await page.waitForTimeout(2500); mode.hangSet = null;   // (the write has failed by now)
    await round();
    const c2 = await center();
    const drops = c => c.cards.filter(x => x.type === 'drop').length;
    check('R13 (U1): an alert-settings save with no answer in time that never lands — not in force meanwhile (the customers cards stay, memory and the phone\'s copy keep the settings in force) nor after',
      r.ok === false && /No answer from the cloud yet/.test(r.toast) && r.inForce === true && !(r.copy && r.copy.types && r.copy.types.drop === false) && drops(c0) > 0 && drops(c1) === drops(c0) && drops(c2) === drops(c0),
      { r, cards: [drops(c0), drops(c1), drops(c2)] });
  }

  // ---- R14 (U2): a dismissal covers only what the card listed ----
  if(want('R14')){
    seed();
    await boot(M, 'rep');
    let c = await center();
    const before = (byId(c, 'overdue:Mariam') || {}).items;
    await page.evaluate(async () => { openAlerts(); await new Promise(r => setTimeout(r, 80)); const card = [...document.querySelectorAll('#alertsCenter .al-card')].find(x => x.dataset.alId === 'overdue:Mariam');
      card.querySelector('[data-act="dismiss"]').click(); await new Promise(r => setTimeout(r, 150)); closeModal(); });
    c = await center();
    const gone = !byId(c, 'overdue:Mariam');
    // another phone: Cobaltia's follow-up date was set for Nov 6 — a new overdue follow-up of hers, the same day
    { const cl = JSON.parse(cloud.clinics); cl.find(x => x.id === 'm3').nextFollowUp = '2026-11-06'; cloud.clinics = JSON.stringify(cl); }
    await round();
    c = await center();
    const back = byId(c, 'overdue:Mariam');
    check('R14 (U2): a dismissed card comes back the same day when something new of the same kind appears (a second overdue follow-up), with everything it lists; the bell counts it',
      gone && JSON.stringify(before) === JSON.stringify(['Birchwood Center — was due Nov 5 (6 days ago)']) && !!back && back.items.length === 2 && back.items.some(t => /^Cobaltia Clinic/.test(t)) && c.badge === c.cards.length,
      { before, gone, back: back && back.items, badge: c.badge, cards: c.cards.length });
  }

  // ---- R15 (U3): Upload now — a change only in the app's memory beside one kept on the phone ----
  if(want('R15')){
    seed();
    await boot(M, 'rep');
    mode.failSet = /^(tasks|events)$/;   // the cloud does not answer these saves
    await page.evaluate(async () => { closeModal(); document.getElementById('newTaskInput').value = 'Call Amberline about the samples'; await addTask(); });   // kept on the phone, queued
    await page.evaluate(async () => {
      window.__lsSet = Storage.prototype.setItem;   // the phone's storage full for this one list's copy: only in the app's memory
      Storage.prototype.setItem = function(k, v){ if(k === 'um_mirror:events') throw new DOMException('full', 'QuotaExceededError'); return window.__lsSet.call(this, k, v); };
      closeModal(); switchView('more'); openClientLog(); openClientLogForm('request'); await new Promise(r => setTimeout(r, 60));
      document.getElementById('clForm_clinic').value = 'Cobaltia Clinic'; document.getElementById('clForm_text').value = 'Asked for samples';
      await saveClientLog('request'); closeModal(); });
    const st = await page.evaluate(() => ({ queue: outboxList(), mem: [..._memOnly] }));
    const toast = await page.evaluate(async () => { await alertsUploadNow(null); return document.getElementById('toast').textContent; });
    await page.evaluate(() => { Storage.prototype.setItem = window.__lsSet; });
    mode.failSet = null;
    check('R15 (U3): Upload now with one list only in the app\'s memory and another kept on this phone — the words say both as they are, never that every change is only in the app\'s memory',
      st.queue.includes('tasks') && st.queue.includes('events') && st.mem.includes('events') && !st.mem.includes('tasks') && /only in the app's memory/.test(toast) && /stay on this phone/.test(toast),
      { st, toast });
  }

  // ---- R16 (U4): targets saved in Admin over another screen ----
  if(want('R16')){
    seed();
    await boot(G, 'supervisor');
    const before = await page.evaluate(() => _alerts.shown.map(a => a.id));
    // the supervisor on the Clinics screen opens Admin and raises Renova's target: 900 KD to Nov 9 is now far behind
    await page.evaluate(async () => { closeModal(); switchView('clinics'); openAdminPanel(); await new Promise(r => setTimeout(r, 120));
      const i = REPS.indexOf('Renova'); document.getElementById('tgRev' + i).value = '20000'; await saveTargets(); await new Promise(r => setTimeout(r, 100)); closeModal(); });
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({ ids: _alerts.shown.map(a => a.id), bell: document.getElementById('alertsBellN').hidden ? 0 : +document.getElementById('alertsBellN').textContent, saved: JSON.parse(localStorage.getItem('um_mirror:targets') || '{}') }));
    const c = await center();
    check('R16 (U4): targets saved in Admin over the Clinics screen — the bell follows by itself, with no round: "Renova: month target at risk" and the bell = the cards',
      !before.includes('target:Renova:2026-11') && after.ids.includes('target:Renova:2026-11') && after.bell === c.cards.length && /20000/.test(cloud.targets || ''),
      { before, after: { ids: after.ids, bell: after.bell }, sheet: c.cards.length });
  }

  // ---- R17 (U6): Check now while the day's backup check is on its way ----
  if(want('R17')){
    seed();
    await boot(G, 'supervisor', null, new Date(2026, 10, 11, 16, 30).getTime());
    mode.slowSnap = 1500;   // the read of today's backup takes a moment
    const r = await page.evaluate(async () => { maybeSnapshot(); await new Promise(r => setTimeout(r, 100)); await alertsCheckBackup(null); return document.getElementById('toast').textContent; });   // a save started the day's check; then the tap
    mode.slowSnap = 0;
    check('R17 (U6): "Check now" while the day\'s backup check is on its way — it waits for it and says what it found ("in the cloud"), never "could not be saved" meanwhile',
      /backup is in the cloud/.test(r) && !!cloud['snap_2026-11-11'], { toast: r, written: !!cloud['snap_2026-11-11'] });
  }

  // ---- R18 (U9): the DSR is the supervisor's to upload; the supervisor is never told to ask the supervisor ----
  if(want('R18')){
    seed({ targets: { [M]: { revenue: 10000, month: '2026-10' }, [R]: { revenue: 2000, month: '2026-11' } } });
    await boot(M, 'rep');
    const c = await center(), ts = byId(c, 'target-stale:Mariam:2026-11');
    seed();
    await boot(G, 'supervisor', null, new Date(2026, 10, 11, 16, 30).getTime());
    mode.denySnap = true;   // the cloud's security rules refuse this login's backup
    const toast = await page.evaluate(async () => { await alertsCheckBackup(null); return document.getElementById('toast').textContent; });
    mode.denySnap = false;
    const c2 = await center(), bf = byId(c2, 'backup-failed:2026-11-11');
    const sup = [toast].concat(bf ? bf.why : []);
    check('R18 (U9): a rep is told to ask the supervisor for this month\'s DSR (never to upload it), and the supervisor\'s backup card and toast never tell him to ask the supervisor',
      !!ts && /^Ask the supervisor to upload this month's DSR/.test(ts.why[0]) && !!bf && !sup.some(t => /ask the supervisor/i.test(t)) && sup.some(t => /security rules/.test(t)),
      { rep: ts && ts.why, sup });
  }

  // ---- R9 / R10: Arabic ----
  if(want('R9')){
    seed();
    await boot(G, 'supervisor', { ultramed_lang: 'ar' });
    const home = await page.evaluate(() => [...document.querySelectorAll('#targetCard .ms-person[data-person] .n')].map(e => e.textContent.trim()));
    const c = await center();
    const titles = c.cards.map(x => x.title), latin = titles.filter(t => /\b(Mariam|Renova)\b/.test(t));
    check('R9: Arabic, the supervisor — each card names the person as the home screen writes her (' + home.join('، ') + '), never in Latin letters',
      home.includes('رانوفا') && titles.length > 0 && !latin.length && titles.some(t => /رانوفا|مريم/.test(t)), { home, titles });
  }
  if(want('R10')){
    seed();
    await boot(M, 'rep', { ultramed_lang: 'ar' });
    const c = await center();
    const od = byId(c, 'overdue:Mariam'), line = od ? od.items.find(t => /Birchwood Center/.test(t)) : null;
    const own = await page.evaluate(() => UMI18N.tr('6 days ago'));
    check('R10: Arabic — "(6 days ago)" in an overdue line is written as the app writes it everywhere else («' + own + '»)',
      !!line && line.indexOf('(' + own + ')') >= 0, { line, own });
  }

  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
