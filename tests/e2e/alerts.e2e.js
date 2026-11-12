// Alerts center (v121): the bell in the header and its sheet. Each alert shows
// when it should and not when it should not — overdue follow-ups, missed
// planned visits, someone with no field visit by the set hour (supervisor),
// the month target at risk, customers buying less than on the same days of
// last month, changes waiting in the outbox, a save that did not land, a
// failed import and today's backup (supervisor) — says why and opens the
// right screen; dismiss / snooze per person, not back the same day; the
// bell's count is the number of cards; a rep never sees a supervisor-only
// alert nor changes the settings; Arabic; 390 px without sideways scroll.
// The clock is fixed (Wed 11 Nov 2026, 13:30) and moves between reopenings.
// Port 8243.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8243, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const cloud = {};
const mode = { failSet: null, snapReads: [] };
const api = {
  get: async k => { if(/^snap_/.test(k)) mode.snapReads.push(k); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set ' + k); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith', MS = 'Mariam Zohair', RS = 'Renova Ayman';
const T = (d, h, mi) => new Date(2026, 10, d, h, mi || 0).getTime();   // a local time in November 2026
const LONG = 'Salmiya Specialised Orthodontic & Implant Polyclinic — Block 10, Salem Al Mubarak Street — Supercalifragilisticexpialidociousorthodonticsandimplantcentre';
const C = (id, name, rep, x) => Object.assign({ id, name, rep, cls: 'B', doctors: [] }, x || {});
const FILL = Array.from({ length: 14 }, (_, i) => C('f' + (i + 1), 'Filler Clinic ' + (i + 1), i % 2 ? R : M));   // a team-sized list
const CLINICS = [C('m1', 'Dental Eight Clinic', M, { cls: 'A' }), C('m2', 'Bayan Smile Center', M, { nextFollowUp: '2026-11-05' }),
  C('m3', 'Qurain Family Clinic', M), C('m4', 'Hawally Kids Dental', M, { nextFollowUp: '2026-11-11' }),
  C('m5', 'Old Closed Clinic', M, { cls: 'Closed', nextFollowUp: '2026-10-01' }), C('m6', 'Small Smile Clinic', M),
  C('mL', LONG, M, { nextFollowUp: '2026-11-07' }),
  C('r1', 'Crown Dental Center', R, { nextFollowUp: '2026-11-01' }), C('r2', 'Jibla Dental Center', R), C('r3', 'Apex Ortho Clinic', R)].concat(FILL);
const row = (d, doc, cust, net, sm) => [d, doc, 0, 'Waterpik Cordless Plus', 1, net, net, 0, sm, 'Waterpik', cust, 'Clinics', 0, ''];
const OCT = [row('2026-10-03', 'SINV1', 'Dental Eight Clinic', 800, MS), row('2026-10-04', 'SINV2', 'Bayan Smile Center', 500, MS),
  row('2026-10-05', 'SINV3', 'Small Smile Clinic', 60, MS), row('2026-10-06', 'SINV4', 'Crown Dental Center', 600, RS),
  row('2026-10-20', 'SINV5', 'Crown Dental Center', 300, RS), row('2026-10-02', 'SINV6', 'My Fatoorah', 400, MS), row('2026-10-03', 'SINV7', 'Marketing Philips', 200, MS)];
const NOV = [row('2026-11-02', 'SINV11', 'Dental Eight Clinic', 100, MS), row('2026-11-03', 'SINV12', 'Bayan Smile Center', 480, MS),
  row('2026-11-04', 'SINV13', 'Jibla Dental Center', 900, RS), row('2026-11-02', 'SINV14', 'My Fatoorah', 420, MS)];
const repMap = { [MS]: M, [RS]: R };
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();   // Mariam and Renova sell; Dr. Ghaith supervises and does not
  cloud.clinics = JSON.stringify(CLINICS);
  cloud.visits = JSON.stringify([{ id: 'v1', clinicId: 'm1', rep: M, date: '2026-11-09' }, { id: 'v2', clinicId: 'm6', rep: M, date: '2026-11-11' },
    { id: 'v3', clinicId: 'r2', rep: R, date: '2026-11-11', callOnly: true, channel: 'call' }]);
  cloud.dayPlans = JSON.stringify({ '2026-11-05': { [M]: [{ id: 'm2', note: '📅 Follow-up due' }] }, '2026-11-09': { [M]: [{ id: 'm3', note: '' }, 'm1'] },
    '2026-11-08': { [R]: ['r3', 'r1'] }, '2026-11-10': { [M]: ['m6'] }, '2026-11-11': { [R]: ['r2', 'r3'] }, '2026-10-20': { [M]: ['m3'] } });
  cloud.events = JSON.stringify([{ id: 'e1', date: '2026-11-11', rep: 'all', title: 'Team meeting', type: 'Meeting' }]);
  cloud.targets = JSON.stringify({ [M]: { revenue: 10000, month: '2026-11' }, [R]: { revenue: 2000, month: '2026-11' } });
  cloud.tasks = JSON.stringify([]);
  cloud.erpMap = JSON.stringify({ 'Marketing Philips': '@ignore' });
  // the one-time repair sweeps of earlier releases have run, as on the team's phones
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: { [MS]: M, [RS]: R }, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true },
    periods: [{ id: 'oct', from: '2026-10-01', to: '2026-10-31', repMap, rows: OCT, rowCount: OCT.length, net: 2860 },
      { id: 'nov', from: '2026-11-01', to: '2026-11-09', repMap, rows: NOV, rowCount: NOV.length, net: 1900 }] });
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
    // the clock: Wed 11 Nov 2026 13:30, or the instant the harness asked for; ticking
    let want = NaN; try{ want = Number(localStorage.getItem('__fakeNow')); }catch(e){}
    const base = isFinite(want) && want > 0 ? want : new Date(2026, 10, 11, 13, 30, 0).getTime();
    const off = base - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async (who, role, local, clock) => {
    await page.goto(URL); await page.waitForTimeout(150);
    await page.evaluate(({ l, c }) => { try{ localStorage.clear(); if(c) localStorage.setItem('__fakeNow', String(c)); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, { l: local || null, c: clock || null });
    await page.goto(URL); await page.waitForTimeout(250);
    await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role });
    await page.waitForTimeout(350);
  };
  // the same phone later: what it keeps stays (dismiss / snooze, the outbox…), the clock moves on
  const reopen = async (who, role, clock) => {
    await page.evaluate(c => { try{ localStorage.setItem('__fakeNow', String(c)); }catch(e){} }, clock);
    await page.goto(URL); await page.waitForTimeout(250);
    await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role });
    await page.waitForTimeout(350);
  };
  // opens the sheet and reads it the way a person sees it
  const center = () => page.evaluate(async () => {
    openAlerts(); await new Promise(r => setTimeout(r, 120));
    const box = document.getElementById('alertsCenter'), txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    const card = c => ({ id: c.dataset.alId, type: c.dataset.alType, title: txt(c.querySelector('.al-title')), why: [...c.querySelectorAll('.al-why > div')].map(txt),
      items: [...c.querySelectorAll('.al-item')].map(txt), clinics: [...c.querySelectorAll('.al-item[data-clinic]')].map(e => e.dataset.clinic),
      msg: txt(c.querySelector('.al-msg')), acts: [...c.querySelectorAll('.al-acts [data-act]')].map(b => b.dataset.act), sev: [...c.classList].find(k => /^al-(high|medium|low)$/.test(k)) });
    const bell = document.getElementById('alertsBell'), badge = document.getElementById('alertsBellN');
    return { cards: [...box.querySelectorAll('.al-card:not(.al-off)')].map(card), hiddenCards: [...box.querySelectorAll('.al-card.al-off')].map(card),
      badge: badge.classList.contains('show') ? badge.textContent : '', count: Number(bell.dataset.count), shown: _alerts.shown.length,
      aria: bell.getAttribute('aria-label'), head: txt(box.querySelector('h3')), sub: txt(box.querySelector('.al-sub')), empty: !!box.querySelector('.al-empty'),
      hiddenBtn: txt(document.getElementById('alertsHiddenBtn')), settingsBtn: !!document.getElementById('alertsSettingsBtn'),
      buttons: [...box.querySelectorAll('button')].map(txt), dir: document.getElementById('modalInner').getAttribute('dir') };
  });
  // a button of one card, found by the card's id (the ids carry names: never inside a selector)
  const act = (id, a) => page.evaluate(async ({ id, a }) => {
    const c = [...document.querySelectorAll('#alertsCenter .al-card')].find(x => x.dataset.alId === id);
    const b = c && c.querySelector(`[data-act="${a}"]`);
    if(!b) return 'no ' + a + ' on ' + id;
    b.click(); await new Promise(r => setTimeout(r, 300)); return 'ok';
  }, { id, a });
  const item = (id, clinic) => page.evaluate(async ({ id, clinic }) => {
    const c = [...document.querySelectorAll('#alertsCenter .al-card')].find(x => x.dataset.alId === id);
    const it = c && [...c.querySelectorAll('.al-item')].find(e => clinic ? e.dataset.clinic === clinic : true);
    if(!it) return { err: 'no item' };
    it.click(); await new Promise(r => setTimeout(r, 200));
    return { modal: document.getElementById('modalBack').classList.contains('show'), title: ((document.querySelector('#modalInner h3') || {}).innerText || '').trim() };
  }, { id, clinic });
  const where = () => page.evaluate(() => ({ view: activeView, modal: document.getElementById('modalBack').classList.contains('show'), rep: calRepFilter, sel: calSelected,
    title: ((document.querySelector('#modalInner h3') || {}).innerText || '').trim() }));
  const ids = c => c.cards.map(x => x.id).join(',');
  const byId = (c, id) => c.cards.find(x => x.id === id) || {};
  const counts = c => c.count === c.cards.length && c.shown === c.cards.length && c.badge === (c.cards.length ? String(c.cards.length) : '');
  const supOnly = c => c.cards.concat(c.hiddenCards).filter(x => /^(noActivity|erpImport|backup)$/.test(x.type)).map(x => x.id);
  const sayWhy = c => c.cards.every(x => x.why.length && x.why.every(w => w.length > 10));
  // the page and the sheet never scroll sideways; the bell and the account stamp sit inside the screen
  const fits = () => page.evaluate(() => { const s = document.getElementById('modalContent'), W = window.innerWidth;
    const inside = id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= W; };
    return { page: document.documentElement.scrollWidth <= W, sheet: s.scrollWidth <= s.clientWidth + 1, bell: inside('alertsBell'), header: inside('headerStamp'),
      w: [W, document.documentElement.scrollWidth, s.scrollWidth, s.clientWidth] }; });

  // ---- a rep: her own clinics and figures ----
  seed();
  await boot(M, 'rep');
  let c = await center();
  check('Mariam: 4 alerts — the target at risk first, then overdue follow-ups, missed plans, customers buying less; the bell counts the cards',
    ids(c) === 'target:Mariam:2026-11,overdue:Mariam,missed:Mariam,drop:Mariam:2026-11' && counts(c), { ids: ids(c), count: c.count, badge: c.badge });
  check('Mariam: every card says why it shows', sayWhy(c), c.cards.map(x => x.why));
  check('overdue: only follow-ups whose date has passed (due today and a closed clinic are not), oldest first',
    JSON.stringify(byId(c, 'overdue:Mariam').items) === JSON.stringify(['Bayan Smile Center — was due Nov 5 (6 days ago)', LONG + ' — was due Nov 7 (4 days ago)']), byId(c, 'overdue:Mariam').items);
  check('missed: the plan not visited on the day nor since; the overdue follow-up\'s own plan is not listed a second time',
    JSON.stringify(byId(c, 'missed:Mariam').items) === JSON.stringify(['Qurain Family Clinic — planned Nov 9']), byId(c, 'missed:Mariam').items);
  const tgt = byId(c, 'target:Mariam:2026-11');
  const todayFig = await page.evaluate(() => ({ amount: bestMonthRevenue('Mariam').amount, card: document.getElementById('targetCard').innerText }));
  check('target: says how it is computed — the month figure of the Today card, working days to the ERP cut-off, the pace, what is needed',
    JSON.stringify(tgt.why) === JSON.stringify(['Achieved 1000.00 KD of the 10000.00 KD target (10%) — ERP sales files to Nov 9.',
      'Working days (Sun–Thu) to the ERP cut-off: 7 of 22. An even pace would be 3181.82 KD (32%) by then.',
      'Pace: 31% of an even pace (the alert shows below 90%). At this pace the month ends near 3142.86 KD (31%).',
      'To reach the target: 600.00 KD a working day over the 15 working days left.']) && todayFig.amount === 1000 && /1000\.00 KD of 10000\.00 KD/.test(todayFig.card), { why: tgt.why, todayFig });
  check('customers: invoiced sales on the same days of last month (ERP only) — a channel, an internal account, a small buyer and a −4% are not listed',
    JSON.stringify(byId(c, 'drop:Mariam:2026-11').items) === JSON.stringify(['Dental Eight Clinic — 100.00 KD vs 800.00 KD (−88%)']) &&
    byId(c, 'drop:Mariam:2026-11').why[0] === 'Invoiced sales in the ERP files, net of returns: Nov 1 – Nov 9, against the same days last month (Oct 1 – Oct 9).', byId(c, 'drop:Mariam:2026-11'));
  check('a rep: no supervisor-only alert, no settings button', !supOnly(c).length && !c.settingsBtn, supOnly(c));
  // where each one leads
  await act('overdue:Mariam', 'open'); let w = await where();
  check('Open on overdue follow-ups: the Today screen, the sheet closed', w.view === 'today' && !w.modal, w);
  await center(); let it = await item('overdue:Mariam', 'm2');
  check('a follow-up line opens that follow-up\'s own sheet (log the visit, reschedule, clear)', it.modal && it.title === 'Bayan Smile Center', it);
  await center(); await act('missed:Mariam', 'open'); w = await where();
  const missedShown = await page.evaluate(() => getComputedStyle(document.getElementById('missedTitle')).display !== 'none' && /Qurain Family Clinic/.test(document.getElementById('missedList').innerText));
  check('Open on missed plans: the Today screen\'s missed list, which shows the clinic', w.view === 'today' && !w.modal && missedShown, w);
  await center(); await act('target:Mariam:2026-11', 'open'); w = await where();
  check('Open on the target: the Today screen (its target card)', w.view === 'today' && !w.modal, w);
  await center(); await act('drop:Mariam:2026-11', 'open'); w = await where();
  check('Open on customers buying less: the Clinics screen', w.view === 'clinics' && !w.modal, w);
  await center(); it = await item('drop:Mariam:2026-11', 'm1');
  check('a customer line opens the clinic', it.modal && it.title === 'Dental Eight Clinic', it);
  // dismiss / snooze
  c = await center();
  await act('missed:Mariam', 'dismiss'); c = await center();
  check('dismiss: the card goes, the bell says 3, the sheet says one is dismissed or snoozed',
    ids(c) === 'target:Mariam:2026-11,overdue:Mariam,drop:Mariam:2026-11' && counts(c) && c.badge === '3' && c.hiddenBtn === 'Dismissed or snoozed (1)', { ids: ids(c), badge: c.badge, hb: c.hiddenBtn });
  await page.evaluate(async () => { document.getElementById('alertsHiddenBtn').click(); await new Promise(r => setTimeout(r, 80)); });
  let hid = await page.evaluate(() => [...document.querySelectorAll('#alertsCenter .al-card.al-off')].map(x => x.dataset.alId + '|' + x.querySelector('.al-state').innerText.trim()));
  check('the dismissed card is listed apart, said so', JSON.stringify(hid) === JSON.stringify(['missed:Mariam|Dismissed for today']), hid);
  await act('missed:Mariam', 'restore'); c = await center();
  check('Show again brings it back (4)', c.count === 4 && counts(c) && !!byId(c, 'missed:Mariam').id, ids(c));
  await act('missed:Mariam', 'dismiss');
  await reopen(M, 'rep', T(11, 17, 0));
  c = await center();
  check('dismissed: not back the same day, after the app was opened again at 17:00', !byId(c, 'missed:Mariam').id && c.count === 3 && counts(c), ids(c));
  await act('drop:Mariam:2026-11', 'snooze'); c = await center();
  check('snooze: the customers card goes (2 left)', c.count === 2 && !byId(c, 'drop:Mariam:2026-11').id && counts(c), ids(c));
  await reopen(M, 'rep', T(12, 9, 0));
  c = await center();
  check('the next day: the dismissed card is back (with today\'s due follow-up now overdue); the snoozed one is not',
    ids(c) === 'target:Mariam:2026-11,overdue:Mariam,missed:Mariam' && byId(c, 'overdue:Mariam').items.length === 3 && counts(c), { ids: ids(c), od: byId(c, 'overdue:Mariam').items });
  await reopen(M, 'rep', T(14, 10, 0));
  c = await center();
  check('three days on, the snoozed card is back', !!byId(c, 'drop:Mariam:2026-11').id && c.count === 4 && counts(c), ids(c));
  // the same supervisor-only facts on a rep's phone say nothing to her
  seed();
  await boot(M, 'rep', { um_erpImport: JSON.stringify({ at: T(11, 10, 0), ok: false, msg: 'x', who: M }), um_snapLast: JSON.stringify({ day: '2026-11-11', at: T(11, 9, 0), result: 'failed', msg: 'y' }) }, T(11, 17, 0));
  c = await center();
  check('a rep at 17:00 with a failed import and a failed backup check on her phone: still no supervisor-only alert', !supOnly(c).length && c.count === 4 && counts(c), { sup: supOnly(c), ids: ids(c) });

  // ---- the other rep ----
  seed();
  await boot(R, 'rep');
  c = await center();
  check('Renova: her own only — overdue, missed, customers; on pace (141% of an even pace), so no target alert',
    ids(c) === 'overdue:Renova,missed:Renova,drop:Renova:2026-11' && counts(c) && !supOnly(c).length, ids(c));
  check('Renova: Crown is under overdue follow-ups only (its plan is not listed again), Apex missed, Crown buying less',
    JSON.stringify(byId(c, 'missed:Renova').clinics) === '["r3"]' && JSON.stringify(byId(c, 'drop:Renova:2026-11').items) === JSON.stringify(['Crown Dental Center — 0.00 KD vs 600.00 KD (−100%)']), c.cards);
  check('Renova never sees Mariam\'s clinics', !c.cards.some(x => x.clinics.some(id => /^m/.test(id))), c.cards.map(x => x.clinics));

  // ---- the supervisor ----
  seed();
  await boot(G, 'supervisor');
  c = await center();
  check('supervisor: everyone\'s, one card per person, and no field visit by 12:00 for Renova — 8 cards = the bell',
    ids(c) === 'target:Mariam:2026-11,overdue:Mariam,overdue:Renova,missed:Mariam,missed:Renova,noActivity:Renova:2026-11-11,drop:Mariam:2026-11,drop:Renova:2026-11' && counts(c) && c.settingsBtn, ids(c));
  check('supervisor: every card says why; the titles name the person', sayWhy(c) && byId(c, 'overdue:Mariam').title === 'Mariam: 2 follow-ups overdue' && byId(c, 'target:Mariam:2026-11').title === 'Mariam: month target at risk', c.cards.map(x => x.title));
  check('no field visit: the hour, the call she logged (not counted), her plan and the calendar — Mariam logged a field visit, so none for her',
    JSON.stringify(byId(c, 'noActivity:Renova:2026-11-11').why) === JSON.stringify(['Checked after 12:00 on a working day (the hour is set in alert settings). Only field visits count — calls and phone orders do not.',
      'Logged today: 1 call, 0 phone orders.', "Today's plan: 2 clinics.", 'In the calendar today: Team meeting (Meeting).']) && !byId(c, 'noActivity:Mariam:2026-11-11').id, byId(c, 'noActivity:Renova:2026-11-11'));
  const pairs = {}; let dup = 0;
  c.cards.filter(x => x.type === 'overdue' || x.type === 'missed').forEach(x => x.clinics.forEach(id => { if(pairs[id]) dup++; pairs[id] = 1; }));
  check('no duplicates: every card once, no clinic both overdue and missed', new Set(c.cards.map(x => x.id)).size === c.cards.length && !dup, pairs);
  check('no backup alert at 13:30 (not checked yet, before 16:00, nothing failed)', !c.cards.some(x => x.type === 'backup'), ids(c));
  await act('noActivity:Renova:2026-11-11', 'open'); w = await where();
  check('Open on no field visit: the calendar, today, Renova\'s', w.view === 'calendar' && w.rep === R && w.sel === '2026-11-11' && !w.modal, w);
  await reopen(G, 'supervisor', T(11, 11, 0));
  c = await center();
  check('at 11:00 (before the hour) no field-visit alert', !c.cards.some(x => x.type === 'noActivity') && counts(c), ids(c));
  // the supervisor's switches, for the whole team
  await reopen(G, 'supervisor', T(11, 13, 30));
  await center();
  const saved = await page.evaluate(async () => {
    document.getElementById('alertsSettingsBtn').click(); await new Promise(r => setTimeout(r, 80));
    const box = document.getElementById('alertSettings');
    if(!box) return { err: 'no settings sheet' };
    document.getElementById('alT_drop').checked = false;
    document.getElementById('alS_noActivityHour').value = '99';   // out of its limits: the hour in force stays
    document.getElementById('alertSettingsSave').click(); await new Promise(r => setTimeout(r, 300));
    return { toast: document.getElementById('toast').textContent, back: !!document.getElementById('alertsCenter') };
  });
  const bm = JSON.parse(cloud.benchmarks || '{}');
  check('settings: turning a type off is saved where the supervisor\'s settings live (benchmarks), the rest kept, a bad number ignored',
    bm.alerts && bm.alerts.types.drop === false && bm.alerts.types.overdue === true && bm.alerts.noActivityHour === 12 && bm.coverage === 75 && /saved for the whole team/.test(saved.toast) && saved.back, { saved, alerts: bm.alerts, coverage: bm.coverage });
  c = await center();
  check('settings: the supervisor\'s customers cards are gone (6)', c.count === 6 && counts(c) && !c.cards.some(x => x.type === 'drop'), ids(c));
  const bmBefore = cloud.benchmarks;
  await boot(M, 'rep');
  c = await center();
  check('settings: a type switched off shows to no one — Mariam sees 3, no customers card', c.count === 3 && counts(c) && !c.cards.some(x => x.type === 'drop'), ids(c));
  const repTry = await page.evaluate(async () => { openAlertSettings(); const opened = !!document.getElementById('alertSettings'); const toast1 = document.getElementById('toast').textContent;
    const r = await saveAlertSettings(); return { opened, r, toast1 }; });
  check('a rep can neither open nor save the alert settings — the cloud copy is untouched', !repTry.opened && repTry.r === false && /Supervisor only/.test(repTry.toast1) && cloud.benchmarks === bmBefore, repTry);

  // ---- this phone: changes waiting, a save that failed ----
  seed();
  await boot(R, 'rep');
  mode.failSet = /^tasks$/;
  await page.evaluate(async () => { closeModal(); document.getElementById('newTaskInput').value = 'Call Crown about the order'; await addTask(); });
  c = await center();
  const queued = await page.evaluate(() => outboxList());
  check('a change queued a minute ago: waiting, but not "for long" yet — no alert', queued.includes('tasks') && !byId(c, 'sync-wait').id && c.count === 3, { queued, ids: ids(c) });
  await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('um_outboxSince') || '{}'); m.tasks = Date.now() - 45 * 60000; localStorage.setItem('um_outboxSince', JSON.stringify(m)); refreshAlerts(); });
  c = await center();
  const sw = byId(c, 'sync-wait');
  check('waiting 45 minutes: "Changes on this phone waiting to upload", since when, with Upload now (a rep sees it too)',
    !!sw.id && /^Tasks — waiting since 12:4\d$/.test(sw.items[0] || '') && sw.acts.includes('flush') && c.count === 4 && counts(c), sw);
  await act('sync-wait', 'flush');
  const t1 = await page.evaluate(() => document.getElementById('toast').textContent);
  c = await center();
  check('Upload now while the cloud still does not answer: said so, the alert stays', /Not uploaded yet/.test(t1) && !!byId(c, 'sync-wait').id, t1);
  mode.failSet = null;
  await act('sync-wait', 'flush');
  c = await center();
  check('Upload now with the cloud back: uploaded, the alert goes', !byId(c, 'sync-wait').id && c.count === 3 && /Call Crown about the order/.test(cloud.tasks || ''), ids(c));
  seed();
  await boot(G, 'supervisor');
  mode.failSet = /^targets$/;
  const tr = await page.evaluate(async () => { targets.Mariam = Object.assign({}, targets.Mariam, { revenue: 12000 }); return persist('targets'); });
  mode.failSet = null;
  c = await center();
  const sf = byId(c, 'sync-failed');
  check('a save that reached neither the cloud nor the outbox: "1 save did not reach the cloud — Monthly targets", urgent',
    tr === false && sf.title === '1 save did not reach the cloud' && /^Monthly targets — not saved at 13:3\d$/.test(sf.items[0] || '') && sf.sev === 'al-high' && counts(c), sf);
  it = await item('sync-failed');
  check('its line opens the screen where the change is made again (the admin panel)', it.modal && /Admin panel/.test(it.title), it);
  await page.evaluate(() => persist('targets'));
  c = await center();
  check('the same data saved later: the alert goes', !byId(c, 'sync-failed').id && counts(c), ids(c));

  // ---- a failed import (supervisor) ----
  await page.evaluate(async () => { closeModal(); openErpImport(); await new Promise(r => setTimeout(r, 60)); await erpAutoImport('this is not a sales file'); });
  const status = await page.evaluate(() => (document.getElementById('erpStatus') || {}).textContent || '');
  c = await center();
  const ei = c.cards.find(x => x.type === 'erpImport') || {};
  check('a failed import: the import screen says it, and the alert keeps it with the reason and what the figures still come from',
    /Could not recognize this file/.test(status) && ei.msg === status && /^Tried on Nov 11 at 13:3\d — the message is below\.$/.test(ei.why[0] || '') &&
    ei.why[1] === 'The figures still come from the files saved before — the newest reaches Nov 9.' && ei.sev === 'al-high' && counts(c), { status, ei });
  await act(ei.id, 'open'); w = await where();
  check('Open on the failed import: the import screen', w.modal && /Import — fully automatic/.test(w.title), w);
  const csv = ['Date,Invoice #,Product,Qty,Gross,Net Sales,Name,Brand,Customer,Class', '2026-11-10,SINV900,Waterpik Cordless Plus,1,35,35,Mariam Zohair,Waterpik,Dental Eight Clinic,Clinics'].join('\n');
  await page.evaluate(async t => { await erpAutoImport(t); await new Promise(r => setTimeout(r, 200)); }, csv);
  c = await center();
  check('an import that works since: the alert goes', !c.cards.some(x => x.type === 'erpImport') && counts(c) && JSON.parse(cloud.erpSales).periods.length === 3, ids(c));

  // ---- today's backup (supervisor) ----
  seed();
  await boot(G, 'supervisor', null, T(11, 16, 30));
  mode.snapReads = [];
  c = await center();
  const bu = byId(c, 'backup-unchecked:2026-11-11');
  check('after 16:00, this phone has not checked today\'s backup: "not confirmed yet", Check now — and nothing was downloaded to find out',
    !!bu.id && bu.sev === 'al-low' && bu.acts.includes('checkBackup') && !mode.snapReads.length && counts(c), { bu, reads: mode.snapReads });
  await act('backup-unchecked:2026-11-11', 'checkBackup');
  const t2 = await page.evaluate(() => document.getElementById('toast').textContent);
  c = await center();
  check('Check now: one read of today\'s backup, missing, so written — said, and the alert goes',
    !!cloud['snap_2026-11-11'] && JSON.stringify(mode.snapReads) === '["snap_2026-11-11"]' && /was missing — it is saved now/.test(t2) && !c.cards.some(x => x.type === 'backup'), { reads: mode.snapReads, t2 });
  delete cloud['snap_2026-11-11'];
  await page.evaluate(() => { localStorage.removeItem('um_snapDay'); localStorage.removeItem('um_snapLast'); refreshAlerts(); });
  mode.failSet = /^snap_/;
  c = await center();
  await act('backup-unchecked:2026-11-11', 'checkBackup');
  mode.failSet = null;
  c = await center();
  const bf = byId(c, 'backup-failed:2026-11-11');
  check('a check whose write fails: "Today\'s backup could not be saved", urgent, with the message', !!bf.id && bf.sev === 'al-high' && /boom-set/.test(bf.msg) && !byId(c, 'backup-unchecked:2026-11-11').id && counts(c), bf);
  await act('backup-failed:2026-11-11', 'open'); w = await where();
  const backupList = await page.evaluate(() => !!document.getElementById('backupList'));
  check('Open on the backup: Export & backups', w.modal && /Export/.test(w.title) && backupList, w);

  // ---- Arabic, and 390 px ----
  seed();
  await boot(M, 'rep', { ultramed_lang: 'ar' });
  c = await center();
  const lines = x => [x.title].concat(x.why, x.items);
  const noAr = c.cards.flatMap(lines).filter(l => !/[؀-ۿ]/.test(l));
  check('Arabic (a rep): the sheet and every line of every card in Arabic — the names and figures stay — right to left',
    c.head === 'التنبيهات' && c.sub === 'ما يحتاج انتباهك الآن. كل بطاقة تذكر سبب ظهورها.' && !noAr.length && c.dir === 'rtl' && c.count === 4 &&
    byId(c, 'target:Mariam:2026-11').title === 'التارغت الشهري في خطر' && c.aria === 'التنبيهات (4)', { noAr, head: c.head, dir: c.dir, aria: c.aria, t: byId(c, 'target:Mariam:2026-11').title });
  check('Arabic: the buttons', ['فتح', 'إخفاء لليوم', 'تأجيل 3 أيام', 'إغلاق'].every(b => c.buttons.includes(b)), c.buttons);
  let f = await fits();
  check('390 px, Arabic: no sideways scroll on the page or in the sheet; the bell inside the screen', f.page && f.sheet && f.bell && f.header, f);
  seed();
  await boot(G, 'supervisor', { ultramed_lang: 'ar' });
  c = await center();
  const noAr2 = c.cards.flatMap(lines).filter(l => !/[؀-ۿ]/.test(l));
  check('Arabic (the supervisor): every card, his own types included', c.count === 8 && !noAr2.length && byId(c, 'noActivity:Renova:2026-11-11').title === 'Renova: لا زيارة ميدانية مسجلة اليوم حتى الساعة 12:00', { noAr2, t: byId(c, 'noActivity:Renova:2026-11-11').title });
  f = await fits();
  check('390 px, Arabic, the supervisor\'s 8 cards with a very long clinic name: no sideways scroll', f.page && f.sheet && f.bell && f.header, f);
  const st = await page.evaluate(async () => { openAlertSettings(); await new Promise(r => setTimeout(r, 100)); const txt = el => el.innerText.replace(/\s+/g, ' ').trim();
    const box = document.getElementById('alertSettings'), s = document.getElementById('modalContent');
    return { left: [...box.querySelectorAll('h3, .al-sub, .al-set b, .al-set-d, .al-num > span, button')].map(txt).filter(t => !/[؀-ۿ]/.test(t)), fit: document.documentElement.scrollWidth <= window.innerWidth && s.scrollWidth <= s.clientWidth + 1 }; });
  check('Arabic: the settings sheet, no English left, no sideways scroll', !st.left.length && st.fit, st);
  seed();
  await boot(G, 'supervisor');
  await center();
  f = await fits();
  check('390 px, English, the supervisor\'s sheet: no sideways scroll', f.page && f.sheet && f.bell && f.header, f);
  await page.evaluate(() => closeModal());
  const hdr = await page.evaluate(() => { const W = window.innerWidth, bell = document.getElementById('alertsBell');
    const inside = id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= W; };
    const out = {};
    for(const v of ['today', 'clinics', 'calendar', 'reports', 'more']){
      switchView(v);
      const withBell = document.documentElement.scrollWidth; bell.style.display = 'none';
      const without = document.documentElement.scrollWidth; bell.style.display = '';
      out[v] = inside('alertsBell') && inside('headerStamp') && withBell === without;
    }
    switchView('today');
    return { views: out, today: document.documentElement.scrollWidth <= W, badge: document.getElementById('alertsBellN').textContent }; });
  check('the bell adds no width: on every main screen it and the account stamp sit inside the 390 px screen; Today, behind the sheet, has no sideways scroll',
    Object.values(hdr.views).every(Boolean) && hdr.today && hdr.badge === '8', hdr);
  // the bell costs no download: a start reads no backup and nothing the app did not read before
  mode.snapReads = [];
  await reopen(G, 'supervisor', T(11, 13, 40));
  check('the bell reads nothing from the cloud: no backup downloaded at start', !mode.snapReads.length, mode.snapReads);

  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
