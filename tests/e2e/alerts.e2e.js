// Alerts center (v121, on v122): the bell in the header and its sheet. Each
// alert shows when it should and not when it should not — overdue follow-ups
// (the Today list's own), missed planned visits, someone with no field visit by
// the set hour (supervisor), the month target at risk (the sales coach's rule,
// and the coach says the same) or a target from an earlier month (named as the
// Today card names it), customers buying less than on the same days of last
// month, what v122's own sync bars and photo notes say (the queue the pill
// counts, the red bar of a full phone, visit photos waiting / only in the app's
// memory / lost / not arrived from another phone, the sales files' retry bar),
// a failed import and today's backup (supervisor) — says why and opens the
// right screen; dismiss / snooze per person, not back the same day; the bell's
// count is the number of cards; a rep never sees a supervisor-only alert, nor
// anyone else's, nor changes the settings; Arabic; 390 px without sideways scroll.
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
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith', MS = 'Mariam Sample', RS = 'Ranova Sample Person';
const T = (d, h, mi) => new Date(2026, 10, d, h, mi || 0).getTime();   // a local time in November 2026
const LONG = 'Indigoview Specialised Orthodontic & Implant Polyclinic — Block 99, Sample Street — Supercalifragilisticexpialidociousorthodonticsandimplantcentre';
const C = (id, name, rep, x) => Object.assign({ id, name, rep, cls: 'B', doctors: [] }, x || {});
const FILL = Array.from({ length: 14 }, (_, i) => C('f' + (i + 1), 'Filler Clinic ' + (i + 1), i % 2 ? R : M));   // a team-sized list
const CLINICS = [C('m1', 'Amberline Clinic', M, { cls: 'A' }), C('m2', 'Birchwood Center', M, { nextFollowUp: '2026-11-05' }),
  C('m3', 'Cobaltia Clinic', M), C('m4', 'Dunevale Dental', M, { nextFollowUp: '2026-11-11' }),
  C('m5', 'Old Closed Clinic', M, { cls: 'Closed', nextFollowUp: '2026-10-01' }), C('m6', 'Emberly Clinic', M),
  C('mL', LONG, M, { nextFollowUp: '2026-11-07' }),
  C('r1', 'Fernhill Center', R, { nextFollowUp: '2026-11-01' }), C('r2', 'Garnetta Center', R), C('r3', 'Harborview Clinic', R)].concat(FILL);
const row = (d, doc, cust, net, sm) => [d, doc, 0, 'Waterpik Cordless Plus', 1, net, net, 0, sm, 'Waterpik', cust, 'Clinics', 0, ''];
const OCT = [row('2026-10-03', 'SINV1', 'Amberline Clinic', 800, MS), row('2026-10-04', 'SINV2', 'Birchwood Center', 500, MS),
  row('2026-10-05', 'SINV3', 'Emberly Clinic', 60, MS), row('2026-10-06', 'SINV4', 'Fernhill Center', 600, RS),
  row('2026-10-20', 'SINV5', 'Fernhill Center', 300, RS), row('2026-10-02', 'SINV6', 'My Fatoorah', 400, MS), row('2026-10-03', 'SINV7', 'Marketing Philips', 200, MS)];
const NOV = [row('2026-11-02', 'SINV11', 'Amberline Clinic', 100, MS), row('2026-11-03', 'SINV12', 'Birchwood Center', 480, MS),
  row('2026-11-04', 'SINV13', 'Garnetta Center', 900, RS), row('2026-11-02', 'SINV14', 'My Fatoorah', 420, MS)];
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
      badge: !badge.hidden ? badge.textContent : '', count: Number(bell.dataset.count), shown: _alerts.shown.length,
      aria: bell.getAttribute('aria-label'), head: txt(document.querySelector('#modalInner h3')), sub: txt(document.querySelector('#modalInner .al-sub')), empty: !!box.querySelector('.al-empty'),
      hiddenBtn: txt(document.getElementById('alertsHiddenBtn')), settingsBtn: !!document.getElementById('alertsSettingsBtn'),
      buttons: [...document.querySelectorAll('#modalInner button')].map(txt), dir: document.getElementById('modalInner').getAttribute('dir'),
      // the sheet frame of the component layer (v125): the header tile, the buttons in the foot, the lines that open something as list rows
      frame: { tile: !!document.querySelector('#modalInner h3.mh .mh-ic'), foot: [...document.querySelectorAll('#modalInner .modal-foot .btn')].map(txt),
        rows: [...box.querySelectorAll('.al-item')].every(e => e.classList.contains('lrow') && !!e.closest('.lrows')), chips: [...box.querySelectorAll('.al-acts [data-act]')].every(e => e.classList.contains('chip')) } };
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
  check('the v125 look: the sheet frame\'s header tile, Close in its foot, every line that opens something a list row, the actions chips',
    c.frame.tile && JSON.stringify(c.frame.foot) === JSON.stringify(['Close']) && c.frame.rows && c.frame.chips && c.head === 'Alerts', c.frame);

  check('overdue: only follow-ups whose date has passed (due today and a closed clinic are not), oldest first',
    JSON.stringify(byId(c, 'overdue:Mariam').items) === JSON.stringify(['Birchwood Center — was due Nov 5 (6 days ago)', LONG + ' — was due Nov 7 (4 days ago)']), byId(c, 'overdue:Mariam').items);
  check('missed: the plan not visited on the day nor since; the overdue follow-up\'s own plan is not listed a second time',
    JSON.stringify(byId(c, 'missed:Mariam').items) === JSON.stringify(['Cobaltia Clinic — planned Nov 9']), byId(c, 'missed:Mariam').items);
  const tgt = byId(c, 'target:Mariam:2026-11');
  const todayFig = await page.evaluate(async () => { await msWhenReady(); const n = sel => { const el = document.querySelector('#targetCard [data-ms="' + sel + '"]'); return el ? Number(el.getAttribute('data-value')) : null; };
    return { amount: bestMonthRevenue('Mariam').amount, sales: n('sales'), goal: n('of-target') }; });
  check('target: says how it is computed — the month figure of the Today card, working days to the ERP cut-off, the pace, what is needed',
    JSON.stringify(tgt.why) === JSON.stringify(['Achieved 1,000.00 KD of the 10,000.00 KD target (10%) — ERP sales files to Nov 9.',
      'Working days (Sun–Thu) to the ERP cut-off: 7 of 22. An even pace would be 3,181.82 KD (32%) by then.',
      'Pace: 31% of an even pace — below 90%, the sales coach\'s rule (Reports). At this pace the month ends near 3,142.86 KD (31%).',
      'To reach the target: 600.00 KD a working day over the 15 working days left.']) && todayFig.amount === 1000 && todayFig.sales === 1000 && todayFig.goal === 10000, { why: tgt.why, todayFig });
  check('customers: invoiced sales on the same days of last month (ERP only) — a channel, an internal account, a small buyer and a −4% are not listed',
    JSON.stringify(byId(c, 'drop:Mariam:2026-11').items) === JSON.stringify(['Amberline Clinic — 100.00 KD vs 800.00 KD (−88%)']) &&
    byId(c, 'drop:Mariam:2026-11').why[0] === 'Invoiced sales in the ERP files, net of returns: Nov 1 – Nov 9, against the same days last month (Oct 1 – Oct 9).', byId(c, 'drop:Mariam:2026-11'));
  check('a rep: no supervisor-only alert, no settings button', !supOnly(c).length && !c.settingsBtn, supOnly(c));
  // where each one leads
  await act('overdue:Mariam', 'open'); let w = await where();
  check('Open on overdue follow-ups: the Today screen, the sheet closed', w.view === 'today' && !w.modal, w);
  await center(); let it = await item('overdue:Mariam', 'm2');
  check('a follow-up line opens that follow-up\'s own sheet (log the visit, reschedule, clear)', it.modal && it.title === 'Birchwood Center', it);
  await center(); await act('missed:Mariam', 'open'); w = await where();
  const missedShown = await page.evaluate(() => getComputedStyle(document.getElementById('missedTitle')).display !== 'none' && /Cobaltia Clinic/.test(document.getElementById('missedList').innerText));
  check('Open on missed plans: the Today screen\'s missed list, which shows the clinic', w.view === 'today' && !w.modal && missedShown, w);
  await center(); await act('target:Mariam:2026-11', 'open'); w = await where();
  const coach = await page.evaluate(() => (document.getElementById('coachCard') || {}).innerText || '');
  check('Open on the target: the sales coach on Reports, which says the same by the same rule (UMCore.targetPace)',
    w.view === 'reports' && !w.modal && /Mariam is behind the monthly target/.test(coach) && /Needs about 600 KD\/day for the remaining 15 working days/.test(coach), { w, coach });
  // the follow-ups are the Today screen's own list (visibleDueClinics), its overdue part
  const dueSame = await page.evaluate(() => { const a = _alerts.shown.find(x => x.type === 'overdue');
    return JSON.stringify(((a && a.items) || []).map(i => i.clinicId)) === JSON.stringify(visibleDueClinics().filter(c => followStatus(c.nextFollowUp) === 'overdue').map(c => c.id)); });
  check('overdue follow-ups: exactly the overdue part of the Today screen\'s due list (visibleDueClinics)', dueSame);
  await center(); await act('drop:Mariam:2026-11', 'open'); w = await where();
  check('Open on customers buying less: the Clinics screen', w.view === 'clinics' && !w.modal, w);
  await center(); it = await item('drop:Mariam:2026-11', 'm1');
  check('a customer line opens the clinic', it.modal && it.title === 'Amberline Clinic', it);
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
  check('Renova: Fernhill is under overdue follow-ups only (its plan is not listed again), Harborview missed, Fernhill buying less',
    JSON.stringify(byId(c, 'missed:Renova').clinics) === '["r3"]' && JSON.stringify(byId(c, 'drop:Renova:2026-11').items) === JSON.stringify(['Fernhill Center — 0.00 KD vs 600.00 KD (−100%)']), c.cards);
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
  const dueSup = await page.evaluate(() => { const got = _alerts.shown.filter(x => x.type === 'overdue').flatMap(a => a.items.map(i => i.clinicId)).sort();
    const want = visibleDueClinics().filter(c => followStatus(c.nextFollowUp) === 'overdue').map(c => c.id).sort(); return { same: JSON.stringify(got) === JSON.stringify(want), got, want }; });
  check('the supervisor\'s overdue follow-ups: exactly the Today screen\'s, one card per owner', dueSup.same, dueSup);
  const coachAll = await page.evaluate(() => { switchView('reports'); setReportRepFilter('all'); return document.getElementById('coachCard').innerText; });
  check('target at risk for the supervisor: whoever the coach calls behind, and no one else (Mariam yes, Renova on pace)',
    /Mariam is behind the monthly target/.test(coachAll) && /Renova is on pace for the monthly target/.test(coachAll) && !!byId(c, 'target:Mariam:2026-11').id && !c.cards.some(x => x.id === 'target:Renova:2026-11'), coachAll);
  await page.evaluate(() => switchView('today'));
  await center();
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

  // ---- a target from an earlier month (v122: never judged, never silent) ----
  seed();
  cloud.targets = JSON.stringify({ [M]: { revenue: 10000, month: '2026-11' }, [R]: { revenue: 2000, month: '2026-10' } });
  await boot(G, 'supervisor');
  c = await center();
  const staleNote = await page.evaluate(() => { const m = (document.getElementById('targetCard').innerText.match(/Target is from ([^—\n]+?) — upload this month's DSR/) || [])[1]; return m || null; });
  const ts = byId(c, 'target-stale:Renova:2026-11');
  check('a target from an earlier month: named as the Today card names it ("Target is from October 2026"), never judged against',
    ts.title === 'Renova: target is from ' + staleNote && staleNote === 'October 2026' && !c.cards.some(x => x.id === 'target:Renova:2026-11') && ts.sev === 'al-low' && counts(c), { ts, staleNote });
  await act('target-stale:Renova:2026-11', 'open'); w = await where();
  check('Open on it (the supervisor): the import screen, where this month\'s DSR is uploaded', w.modal && /Import — fully automatic/.test(w.title), w);
  await boot(R, 'rep');
  c = await center();
  check('Renova sees her own target named too, and Open takes her to her target card', !!byId(c, 'target-stale:Renova:2026-11').id && byId(c, 'target-stale:Renova:2026-11').title === 'Target is from October 2026' && counts(c), ids(c));
  await act('target-stale:Renova:2026-11', 'open'); w = await where();
  check('…the Today screen with her target card', w.view === 'today' && !w.modal, w);
  await boot(M, 'rep');
  c = await center();
  check('Mariam never sees Renova\'s target', !c.cards.some(x => /Renova/.test(x.id)), ids(c));

  // ---- this phone: what v122's own bars say (the queue the pill counts, the red bar of a full phone) ----
  seed();
  await boot(R, 'rep');
  mode.failSet = /^tasks$/;
  await page.evaluate(async () => { closeModal(); document.getElementById('newTaskInput').value = 'Call Fernhill about the order'; await addTask(); });
  c = await center();
  const queued = await page.evaluate(() => outboxList());
  check('a change queued a minute ago: waiting, but not "for long" yet — no alert', queued.includes('tasks') && !byId(c, 'sync-wait').id && c.count === 3, { queued, ids: ids(c) });
  // 45 minutes later: the time the queue keeps (in memory, and on the phone)
  await page.evaluate(() => { _outboxSince.tasks = Date.now() - 45 * 60000; const m = JSON.parse(localStorage.getItem('um_outboxSince') || '{}'); m.tasks = _outboxSince.tasks; localStorage.setItem('um_outboxSince', JSON.stringify(m)); refreshAlerts(); });
  c = await center();
  let sw = byId(c, 'sync-wait');
  const pill = await page.evaluate(() => { const el = document.getElementById('syncPill'); return el && el.style.display !== 'none' ? el.textContent : ''; });
  check('waiting 45 minutes: "Changes on this phone waiting to upload", since when, with Upload now — the very keys the pill counts (a rep sees it too)',
    !!sw.id && sw.items.length === 1 && /^Tasks — waiting since 12:4\d$/.test(sw.items[0] || '') && pill === '⏳ Uploading offline changes (1)…' && sw.acts.includes('flush') && c.count === 4 && counts(c), { sw, pill });
  await act('sync-wait', 'flush');
  const t1 = await page.evaluate(() => document.getElementById('toast').textContent);
  c = await center();
  check('Upload now while the cloud still does not answer: said so, the alert stays', /Not uploaded yet/.test(t1) && !!byId(c, 'sync-wait').id, t1);
  // the phone's queue copy could not be rewritten (v122: memory is the queue this session) — a key the
  // phone's copy still lists but memory has sent is not waiting: the pill does not count it, nor does the bell
  const ghost = await page.evaluate(() => { const was = _outboxMem.has('tasks'); _outboxMem.delete('tasks'); _outboxDeviceBad = true; refreshAlerts();
    const r = { device: JSON.parse(localStorage.getItem('um_outbox') || '[]'), queue: outboxList(), alert: !!_alerts.shown.find(a => a.id === 'sync-wait') };
    _outboxDeviceBad = false; if(was) _outboxMem.add('tasks'); refreshAlerts(); return r; });
  check('the queue as the pill counts it — memory, not an older copy on the phone: a key memory has sent is not "waiting"',
    ghost.device.includes('tasks') && !ghost.queue.includes('tasks') && !ghost.alert, ghost);
  mode.failSet = null;
  await act('sync-wait', 'flush');
  c = await center();
  check('Upload now with the cloud back: uploaded, the alert goes', !byId(c, 'sync-wait').id && c.count === 3 && /Call Fernhill about the order/.test(cloud.tasks || ''), ids(c));
  // a full phone: the save is only in the app's memory — the red bar, said by the bell at once, in the bar's words
  mode.failSet = /^tasks$/;
  await page.evaluate(() => { window.__lsSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(/^um_(mirror:|outbox)/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return window.__lsSet.call(this, k, v); }; });
  await page.evaluate(async () => { document.getElementById('newTaskInput').value = 'Bring the new brochures'; await addTask(); });
  // read before the sheet is opened, once the bell has had its chance to follow (it waits 60 ms for a burst of changes; up to 3 s on a busy machine)
  const badgeBefore = await page.evaluate(async () => { const t0 = Date.now(); while(Date.now() - t0 < 3000 && document.getElementById('alertsBellN').textContent !== '4') await new Promise(r => setTimeout(r, 50)); return document.getElementById('alertsBellN').textContent; });
  c = await center();
  const bar = await page.evaluate(() => { const el = document.getElementById('memOnlyBar'); return el ? el.textContent.split('\n') : []; });
  const sm = byId(c, 'sync-mem');
  check('a full phone: the red bar\'s own lines are the alert\'s reason, said at once (no wait), the key named, urgent, Upload now',
    bar.length === 1 && JSON.stringify(sm.why) === JSON.stringify(bar) && JSON.stringify(sm.items) === JSON.stringify(["Tasks — only in the app's memory"]) && sm.sev === 'al-high' && sm.acts.includes('flush') && counts(c), { bar, sm });
  check('…and the same key is not listed again under waiting', !(byId(c, 'sync-wait').items || []).some(t => /^Tasks/.test(t)), byId(c, 'sync-wait'));
  check('the bell\'s number follows the red bar by itself, before the sheet is opened (the save repainted only the Today screen)', badgeBefore === String(c.count) && c.count === 4, { badgeBefore, count: c.count });
  await act('sync-mem', 'flush');
  const t2m = await page.evaluate(() => document.getElementById('toast').textContent);
  check('Upload now while the cloud does not answer: never "stays on this phone" for what is only in memory', /only in the app's memory/.test(t2m) && !/stay on this phone/.test(t2m), t2m);
  mode.failSet = null;
  await act('sync-mem', 'flush');
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
  c = await center();
  const barGone = await page.evaluate(() => !document.getElementById('memOnlyBar'));
  check('the cloud back: uploaded, the red bar down and its alert with it', barGone && !byId(c, 'sync-mem').id && /Bring the new brochures/.test(cloud.tasks || '') && counts(c), { barGone, ids: ids(c) });
  await page.evaluate(() => { Storage.prototype.setItem = window.__lsSet; });
  // a whole-document save that fails (no queue for it): v122's own toast says so — no bar, so no sync card
  mode.failSet = /^targets$/;
  const tr = await page.evaluate(async () => persist('targets'));
  mode.failSet = null;
  c = await center();
  check('a failed save of a document that is never queued: v122 says it in its toast and puts up no bar — the bell adds no card of its own', tr === false && !c.cards.some(x => x.type === 'sync') && counts(c), ids(c));

  // ---- visit photos, as their notes under the visit say them ----
  seed();
  const day = 86400000, NOW0 = new Date(2026, 10, 11, 13, 30).getTime(), THUMB = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const vs = JSON.parse(cloud.visits);
  vs[0].photos = [{ id: 'phKept', thumb: THUMB, pending: true, dev: 'dHarness', at: NOW0 - 45 * 60000 }];   // this phone's, kept here, 45 minutes
  vs[1].photos = [{ id: 'phOther', thumb: THUMB, pending: true, dev: 'dOther', at: NOW0 - 4 * day - 3600000 }];   // another phone's, 4 days
  vs.push({ id: 'v4', clinicId: 'm3', rep: M, date: '2026-11-08', photos: [{ id: 'phLost', thumb: THUMB, lost: true, dev: 'dOther', at: NOW0 - 3 * day }] });
  vs.push({ id: 'v5', clinicId: 'r2', rep: R, date: '2026-11-07', photos: [{ id: 'phHers', thumb: THUMB, pending: true, dev: 'dRenova', at: NOW0 - 4 * day }] });
  cloud.visits = JSON.stringify(vs);
  mode.failSet = /^photo:/;   // the uploads do not land
  await boot(M, 'rep', { um_device: 'dHarness', 'um_photo:phKept': JSON.stringify({ id: 'phKept', data: THUMB, visitId: 'v1', ts: NOW0 - 45 * 60000 }) });
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  c = await center();
  const notes = await page.evaluate(() => { const o = {}; visits.forEach(v => { const w = photoWaitInfo(v); if(w) o[v.id] = [w.wait, w.lostTxt]; }); return o; });
  const pw = byId(c, 'photos-wait'), ps = byId(c, 'photos-stale'), pl = byId(c, 'photos-lost');
  check('this phone\'s photo waiting 45 minutes: listed with the very line its visit shows ("kept on this phone"), Upload now',
    pw.title === '1 visit photo waiting to upload from this phone' && JSON.stringify(pw.items) === JSON.stringify(['Amberline Clinic · Nov 9 ' + notes.v1[0]]) && notes.v1[0] === '⏳ Photo waiting to upload · kept on this phone' && pw.acts.includes('flush'), { pw, notes });
  check('another phone\'s photo: from 3 days its note gives its age — and so does the bell, in the note\'s words',
    JSON.stringify(ps.items) === JSON.stringify(['Emberly Clinic · Nov 11 ' + notes.v2[0]]) && /4 days now — it can only come from the phone that took it, if that phone still has it$/.test(notes.v2[0]) && ps.sev === 'al-low', { ps, notes });
  check('a photo lost before it uploaded: its note\'s line', JSON.stringify(pl.items) === JSON.stringify(['Cobaltia Clinic · Nov 8 ' + notes.v4[1]]) && notes.v4[1] === '⚠️ Photo lost before it uploaded — only this small preview is kept', { pl, notes });
  check('a rep: never another person\'s visit photo (Renova\'s 4-day photo is not on Mariam\'s bell); the bell counts the cards', !c.cards.some(x => x.clinics.includes('r2')) && counts(c), c.cards.map(x => x.clinics));
  // a photo with this phone's mark that the phone no longer holds (an earlier session's; offline, so not settled yet):
  // its note says only "waiting to upload" — never listed under a card whose reason is "kept on this phone"
  const owed = await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });   // no look-up while offline
    const v = visits.find(x => x.id === 'v4'); v.photos.push({ id: 'phOwed', thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', pending: true, dev: photoDevice(), at: Date.now() - 50 * 60000 });
    refreshAlerts(); const a = _alerts.shown.find(x => x.id === 'photos-wait'), w = photoWaitInfo(v);
    const r = { note: w.wait, listed: !!(a && a.items.some(i => i.visitId === 'v4')), title: a ? a.title : null };
    v.photos.pop(); delete navigator.onLine; refreshAlerts(); return r; });
  check('a photo with this phone\'s mark that it no longer holds: its note says only "waiting to upload", and it is not counted as kept on this phone',
    owed.note === '⏳ Photo waiting to upload' && !owed.listed && owed.title === '1 visit photo waiting to upload from this phone', owed);
  const shown = await page.evaluate(async () => { closeModal(); openClinicDetail('m1'); await new Promise(r => setTimeout(r, 100)); const el = document.querySelector('#modalInner .photo-wait'); return el ? el.textContent : null; });
  check('the visit itself says the same line under its thumbnails', shown === notes.v1[0], shown);
  await center(); await act('photos-lost', 'open'); w = await where();
  check('Open on a photo card: the visit photos gallery', w.modal && /Visit photos/.test(w.title), w);
  // the same photo only in the app's memory (a full phone): the red bar, and the bell says it at once
  await page.evaluate(() => { const r = _photoKept.get('phKept'); r.on = 'mem'; localStorage.removeItem('um_photo:phKept'); renderMemOnlyBar(); });
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  c = await center();
  const bar2 = await page.evaluate(() => { const el = document.getElementById('memOnlyBar'); return el ? el.textContent.split('\n') : []; });
  const sm2 = byId(c, 'sync-mem'), note2 = await page.evaluate(() => photoWaitInfo(visits.find(v => v.id === 'v1')).wait);
  check('a photo only in the app\'s memory: the red bar\'s words, at once, with the visit\'s own line — and not listed again under waiting photos',
    JSON.stringify(sm2.why) === JSON.stringify(bar2) && bar2[0] === "This phone's storage is full — a photo is only in the app's memory: keep the app open and connected until it says Saved" &&
    JSON.stringify(sm2.items) === JSON.stringify(['Amberline Clinic · Nov 9 ' + note2]) && note2 === "⚠️ Photo waiting to upload · only in the app's memory — keep the app open" && !byId(c, 'photos-wait').id && counts(c), { sm2, bar2, note2 });
  // it lands: the bar comes down, the card goes, the visit stops saying waiting
  mode.failSet = null;
  await page.evaluate(async () => { for(let i = 0; i < 10; i++){ if(await photoUpload('phKept', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')) break; await new Promise(r => setTimeout(r, 200)); }
    const t0 = Date.now(); while(Date.now() - t0 < 6000 && (document.getElementById('memOnlyBar') || (photoWaitInfo(visits.find(v => v.id === 'v1')) || {}).wait)) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 200)); });   // the bar comes down on its own 1-second look (04); the bell follows 60 ms later
  const badgeAfter = await page.evaluate(() => !document.getElementById('alertsBellN').hidden ? document.getElementById('alertsBellN').textContent : '');
  c = await center();
  const after = await page.evaluate(() => ({ bar: !!document.getElementById('memOnlyBar'), w: (photoWaitInfo(visits.find(v => v.id === 'v1')) || {}).wait || null }));
  check('the photo landed: the red bar down, its card gone, nothing waiting on the visit — the bell follows by itself', !after.bar && !after.w && !byId(c, 'sync-mem').id && !byId(c, 'photos-wait').id && counts(c) && badgeAfter === (c.count ? String(c.count) : ''), { after, badgeAfter, ids: ids(c) });
  seed(); cloud.visits = JSON.stringify(vs);
  await boot(G, 'supervisor', { um_device: 'dBoss' });
  c = await center();
  check('the supervisor: every person\'s photos not arrived, each line naming whose visit it is',
    JSON.stringify(byId(c, 'photos-stale').items) === JSON.stringify(['Garnetta Center · Nov 7 · Renova ' + notes.v2[0], 'Emberly Clinic · Nov 11 · Mariam ' + notes.v2[0]]) &&
    JSON.stringify(byId(c, 'photos-lost').items) === JSON.stringify(['Cobaltia Clinic · Nov 8 · Mariam ' + notes.v4[1]]) && !byId(c, 'photos-wait').id && counts(c), { stale: byId(c, 'photos-stale'), lost: byId(c, 'photos-lost') });

  // the same cards in Arabic at 390 px: the notes' own Arabic, the names and dates kept
  seed(); cloud.visits = JSON.stringify(vs);
  mode.failSet = /^photo:/;
  await boot(M, 'rep', { ultramed_lang: 'ar', um_device: 'dHarness', 'um_photo:phKept': JSON.stringify({ id: 'phKept', data: THUMB, visitId: 'v1', ts: NOW0 - 45 * 60000 }) });
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await page.evaluate(() => { _memOnly.add('visits'); renderMemOnlyBar(); });   // and the red bar of a full phone
  await page.evaluate(() => new Promise(r => setTimeout(r, 120)));
  c = await center();
  const arSync = c.cards.filter(x => x.type === 'sync').flatMap(x => [x.title].concat(x.why, x.items)).filter(l => !/[؀-ۿ]/.test(l));
  let fa = await fits();
  check('Arabic: the red bar\'s card and the photo cards — every title, reason, line and note in Arabic, no sideways scroll',
    ['sync-mem', 'photos-wait', 'photos-stale', 'photos-lost'].every(id => !!byId(c, id).id) && !arSync.length && c.dir === 'rtl' && fa.page && fa.sheet && counts(c), { arSync, ids: ids(c), fa });
  await page.evaluate(() => { _memOnly.delete('visits'); renderMemOnlyBar(); closeModal(); });
  mode.failSet = null;

  // ---- the sales files' red retry bar (supervisor) ----
  seed();
  await boot(G, 'supervisor');
  mode.failSet = /^erpSales$|^erpRows/;
  await page.evaluate(async () => { await persist('erpSales'); });
  mode.failSet = null;
  c = await center();
  const se = byId(c, 'sync-erp'), erpPill = await page.evaluate(() => !!document.getElementById('erpDirtyPill'));
  check('sales file changes the cloud has not confirmed: the red retry bar, and the bell says the same with Retry the save', erpPill && se.title === 'Sales file changes not saved' && se.acts.includes('retryErp') && se.sev === 'al-high' && counts(c), { se, erpPill });
  await act('sync-erp', 'retryErp');
  c = await center();
  check('Retry the save with the cloud back: saved, the bar and the card gone', !byId(c, 'sync-erp').id && !(await page.evaluate(() => !!document.getElementById('erpDirtyPill'))) && counts(c), ids(c));

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
  const csv = ['Date,Invoice #,Product,Qty,Gross,Net Sales,Name,Brand,Customer,Class', '2026-11-10,SINV900,Waterpik Cordless Plus,1,35,35,Mariam Sample,Waterpik,Amberline Clinic,Clinics'].join('\n');
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
    !!cloud['snap_2026-11-11'] && JSON.stringify(mode.snapReads) === '["snap_2026-11-11"]' && /backup is in the cloud/.test(t2) && !c.cards.some(x => x.type === 'backup'), { reads: mode.snapReads, t2 });
  delete cloud['snap_2026-11-11'];
  await page.evaluate(() => { localStorage.removeItem('um_snapDay'); localStorage.removeItem('um_snapFail'); refreshAlerts(); });
  mode.failSet = /^snap_/;
  c = await center();
  await act('backup-unchecked:2026-11-11', 'checkBackup');
  mode.failSet = null;
  c = await center();
  const bf = byId(c, 'backup-failed:2026-11-11');
  check('a check whose write fails: v123\'s own record says it (um_snapFail) — "Today\'s backup was not saved from this phone", urgent, when it tried and that it tries again within the hour',
    !!bf.id && bf.sev === 'al-high' && bf.title === "Today's backup was not saved from this phone" && /This phone tried at 16:3\d\.$/.test(bf.why[0] || '') && bf.why[1] === 'It tries again within the hour.' && !byId(c, 'backup-unchecked:2026-11-11').id && counts(c), bf);
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
    const box = document.getElementById('modalInner'), s = document.getElementById('modalContent');
    return { boxed: !!document.getElementById('alertSettings'), left: [...box.querySelectorAll('h3, .al-sub, .al-set b, .al-set-d, .al-num > span, button')].map(txt).filter(t => !/[؀-ۿ]/.test(t)), fit: document.documentElement.scrollWidth <= window.innerWidth && s.scrollWidth <= s.clientWidth + 1 }; });
  check('Arabic: the settings sheet, no English left, no sideways scroll', st.boxed && !st.left.length && st.fit, st);
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
