// The main screen (Today, v123) — the calm design the owner chose: the
// supervisor sees the team (every person of REPS, himself included) and opens
// any person's own screen; a rep sees only her own month and day. Every figure
// is checked against its one code path (bestMonthRevenue, teamTargetNow,
// UMCore.execDashboard, UMCore.kpiScorecard), on 3 people × 12 months of
// invented sales lines, a fixed clock and a fake cloud; laptop (1440) and phone
// (390) arrangements, Arabic right to left with no English left, everything the
// Today screen had still working, nothing written to the cloud by looking, no
// page errors, and a render that stays fast.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, amt, amtRe } = require('./_env.js');
const PORT = 8277;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(WWW, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); });
});
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- invented data: 3 people, 17 clinics, 12 months of sales lines (Nov 2025 – 8 Oct 2026): tests/e2e/fixtures/main-screen-data.js ----------
const { G, M, R, LINES, seed } = require('./fixtures/main-screen-data.js');

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const cloud = {}; let writes = [];
  const api = {
    get: async k => k in cloud ? cloud[k] : null,
    set: async (k, v) => { writes.push(k); cloud[k] = v; return true; },
    del: async k => { writes.push('-' + k); delete cloud[k]; return true; },
    list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
    setMany: async entries => { entries.forEach(([k, v]) => { writes.push(k); cloud[k] = v; }); return true; },
  };
  const errors = [];
  let ctx = null, page = null;
  // a fresh page at a viewport; `lang`, `now` (local time) optional
  const open = async (w, h, opts) => {
    opts = opts || {};
    if(ctx) await ctx.close();
    const phone = w < 600;
    ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
    await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());   // no network
    page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR/i.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
    await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
    await page.exposeFunction('__cSetMany', api.setMany);
    await page.addInitScript(({ lang, now }) => {
      try{ localStorage.setItem('ultramed_lang', lang || 'en'); }catch(e){}
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e),
        delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
      };
      const off = new Date(now || '2026-10-08T10:00:00').getTime() - Date.now();    // Thursday 8 October 2026, ticking
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    }, { lang: opts.lang, now: opts.now });
  };
  const boot = async (who, role, w, h, opts) => {
    await open(w, h, opts);
    await page.goto(`http://localhost:${PORT}/index.html`); await sleep(250);
    await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role });
    await sleep(300);
    await page.evaluate(() => msWhenReady());
    await sleep(120);                                                       // the translation runs as the nodes arrive
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // a tap or a sheet the screen offers: what it throws is a page error (red below), never the end of the harness
  const act = (fn, arg) => page.evaluate(fn, arg).catch(e => { errors.push('a tap or sheet threw: ' + String(e && e.message || e).split('\n')[0]); return null; });
  const ready = () => ev(() => msWhenReady().then(() => true));
  // the widths the screen must be sound at (phone … laptop), and the boxes whose content must stay inside them
  const SIZES = [[360, 780], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1366, 768], [1440, 900]];
  // the three figures under the sales card (label, amount, sub-line): the ones that take more than one line
  const statsWrap = () => {
    const lines = el => { const r = document.createRange(); r.selectNodeContents(el);
      const tops = [...r.getClientRects()].filter(x => x.width > 0).map(x => x.top).sort((a, b) => a - b);
      let n = 0, last = -1e9; tops.forEach(t => { if(t - last > 6){ n++; last = t; } }); return n; };
    return [...document.querySelectorAll('#msSales .ms-stats > div > *, #targetCard .ms-stats > div > *')].filter(e => e.offsetParent !== null && lines(e) > 1).map(e => e.innerText.replace(/\s+/g, ' ').trim());
  };
  const spilled = () => [...document.querySelectorAll('#view-today .ms-card, #view-today .ms-stats > div, #view-today .ms-person, #view-today .ms-item')]
    .filter(e => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
    .map(e => (e.id || e.className) + ': ' + e.scrollWidth + '>' + e.clientWidth + ' ' + e.innerText.replace(/\s+/g, ' ').slice(0, 40));
  // what the main screen shows: every figure carries data-ms / data-value
  const shown = () => ev(() => {
    const val = k => { const e = document.querySelector(`#view-today [data-ms="${k}"]`); return e ? (e.dataset.value === '' ? null : Number(e.dataset.value)) : undefined; };
    const txt = s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
    return { sales: val('sales'), achievement: val('achievement'), remaining: val('remaining'), perday: val('perday'), forecast: val('forecast'),
      visits: val('visits'), conversion: val('conversion'), orders: val('orders'), ordersValue: val('orders-value'), newcustomers: val('newcustomers'),
      perdayVisits: val('perday-visits'), weekVisits: val('week-visits'), doctors: val('doctors'), accounts: val('accounts'),
      cmp: val('cmp'), cmpYear: val('cmp-year'), ytd: val('ytd'), ofTarget: val('of-target'),
      growth: Object.fromEntries([...document.querySelectorAll('#targetCard [data-ms="person-growth"]')].map(e => [e.dataset.r, Number(e.dataset.value)])),
      brands: [...document.querySelectorAll('#msBrands .ms-person[data-brand]')].map(e => { const p = e.querySelector('[data-ms="brand-pct"]');
        return { brand: e.dataset.brand, pct: p && p.dataset.value !== '' ? Number(p.dataset.value) : null, s: e.querySelector('.s').innerText.replace(/\s+/g, ' ').trim() }; }),
      cust: [...document.querySelectorAll('#msCust .ms-item')].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
      chart: txt('#msChart'), daily: txt('#msDaily'), brandsTxt: txt('#msBrands'), kpi: val('kpi'),
      people: [...document.querySelectorAll('#targetCard .ms-person[data-person]')].map(e => e.dataset.person), names: [...document.querySelectorAll('#targetCard .ms-person[data-person] .n')].map(e => e.innerText.trim()),
      target: txt('#targetCard'), view: txt('#view-today'), switch: txt('#msSwitch'), who: txt('#msWho'), work: txt('#msWork'), next: txt('#msNext'), grid: document.getElementById('msGrid').className,
      // the whole screen as written, hidden parts too (laptop-only cards on a phone, folded cards), less the cross-invoice notice (the owner's v100 exception)
      html: (() => { const r = document.getElementById('view-today').cloneNode(true); r.querySelectorAll('.ms-cx').forEach(e => e.remove()); return r.innerHTML; })() };
  });
  // the phone's main view (≤ 600 px, the owner's review of v125): what is on screen — a box with a size, not clipped to a pixel
  // for a screen reader, not see-through — and each fact's places; More details closed, none of what it holds may show
  const phoneView = () => ev(() => {
    const on = el => !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 2 && el.getBoundingClientRect().height > 2 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const any = sel => [...document.querySelectorAll(sel)].some(on);
    const box = el => { if(!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    const team = document.getElementById('msGrid').classList.contains('ms-vteam');
    // each fact and every place the screen can show it: on the phone's main view exactly one of them shows
    const FACTS = {
      'follow-ups due': ['#msKpis [data-ms="due"]', '#msNext .ms-more', '#msDueCard', '#msAdvisor'],
      "today's plan": ['#msKpis .ms-kplan', '#msNext .ms-sum2', '#msPlanCard'],
      'field visits': ['#msKpis [data-ms="today-visits"]', '#targetCard .ms-hvis', '#msWork', '#targetCard .ms-lb .v'],
      'the amount a day': ['#view-today .ms-hfoot', '#msAdvisor'],
      'the KPI score': ['#msKpis [data-ms="kpi"]', '#msRows [data-row="kpi"]'],
      'the forecast': ['#msFcChip .ms-fc', '#msKpis .ms-kc.fc'],
    };
    const facts = Object.fromEntries(Object.entries(FACTS).map(([k, sels]) => [k, sels.filter(any)]));
    const details = ['#msRows', '#msWork', '#msPlanCard', '#msDueCard', '#msTaskCard', '#msRecentCard', '#targetCard .ms-cxcard', '#msAdvisor', '#msChart', '#msStatus'].filter(any);
    const tiles = [...document.querySelectorAll('#msKpis .ms-kc')].filter(on).map(box);
    const lb = [...document.querySelectorAll('#targetCard .ms-lbw > .ms-lb')].filter(on);
    const more = document.getElementById('msMore');
    return { team, facts, details, tiles, deltas: [...document.querySelectorAll('#msKpis .ms-kd, #msKpis .ms-spark, #msKpis .ms-chip')].filter(on).length,
      head: box(document.querySelector('header.top')), sales: box(document.querySelector(team ? '#msSales' : '#targetCard .ms-hero')), people: team ? box(document.querySelector('#targetCard .ms-people')) : null,
      next: box(document.getElementById('msNext')), chip: box(document.querySelector('#msFcChip .ms-fc')), more: box(more), expanded: more && more.getAttribute('aria-expanded'),
      lbRows: lb.length, lbParts: lb.slice(0, 1).map(r => ['.rk', '.av', '.n', '.bar', '.p', '.a', '.v'].filter(s => on(r.querySelector(s))).join(' ')).join(''),
      nextRows: [...document.querySelectorAll('#msNext .ms-ac')].filter(on).length, recs: on(document.querySelector('#msNext .ms-nrec')), viewAll: on(document.querySelector('#msNext .ms-nva')),
      doc: document.documentElement.scrollHeight, vh: innerHeight, page: getComputedStyle(document.body).backgroundColor };
  });
  const r2 = n => Math.round(n * 100) / 100;
  const whole = n => Math.round(n).toLocaleString('en-US');   // the picture's amounts: whole KWD with thousands separators (data-value keeps the fils)

  // ======================= the supervisor, laptop =======================
  seed(cloud);
  await boot(G, 'supervisor', 1440, 900);
  const truth = await ev(() => {
    const d = digestData(), out = { reps: REPS.slice(), people: {} };
    REPS.forEach(r => { const bm = bestMonthRevenue(r); out.people[r] = { amount: bm.amount, basis: bm.basis, asOf: bm.asOf, src: bm.src, target: (targets[r] || {}).revenue }; });
    out.tt = teamTargetNow();
    const D = UMCore.execDashboard(d, { rep: 'all', reps: REPS.slice() });
    out.D = { sales: D.sales.amount, pct: D.achievement.pct, remaining: D.remaining, perDay: D.perDay.amount, left: D.perDay.workdays.left, done: D.perDay.workdays.done, total: D.perDay.workdays.total,
      forecast: D.forecast ? D.forecast.amount : null, visits: D.visits.count, joint: D.visits.joint, conversion: D.conversion.pct, orders: D.orders.count, ordersValue: D.orders.value,
      newc: D.newCustomers.measurable ? D.newCustomers.count : null, under: D.act.under.length, potential: D.act.potential.length, firstUnder: D.act.under[0] ? D.act.under[0].name : null };
    // each person's same days: the team's byPerson and her own screen's execDashboard (rep: her, reps: [her], as the screen asks)
    out.growth = {}; out.ownGrowth = {};
    D.byPerson.forEach(p => { out.growth[p.rep] = p.sameDays && p.sameDays.growth != null ? Math.round(p.sameDays.growth * 100) : null; });
    REPS.forEach(r => { const o = UMCore.execDashboard(d, { rep: r, reps: [r] }).sameDays; out.ownGrowth[r] = o.growth != null ? Math.round(o.growth * 100) : null; });
    out.brands = D.byBrand.rows.filter(b => b.net || b.target).slice(0, 5).map(b => ({ brand: b.brand, pct: b.pct, achieved: b.achieved, goal: b.goal, net: b.net }));
    out.cmp = { sd: D.sameDays.growth != null ? Math.round(D.sameDays.growth * 100) : null, sdPrev: D.sameDays.previous, sdTo: D.sameDays.to, ly: D.lastYear.measured, lyMonth: D.lastYear.month,
      ytd: D.ytd.like.pct, ytdSales: D.ytd.like.sales, ytdTarget: D.ytd.like.target };
    out.daily = { sum: Math.round(D.daily.days.reduce((a, x) => a + x.net, 0) * 100) / 100, to: D.daily.to, n: D.daily.days.length };
    // the biggest customers: the dashboard's accounts, and the Clinics screen's card (erpDashData) for the same names
    const buyers = erpDashData('all').buyers;
    out.cust = D.customers.accounts.filter(a => !a.channel && a.net > 0).slice(0, 5).map(a => ({ name: a.name, net: a.net, clinics: (buyers.find(b => b.name === a.name) || {}).net }));
    return out;
  });
  check('fixture: 3 people × 12 months of invented sales lines, every person measured this month', LINES > 20000 && truth.reps.length === 3 && truth.reps.includes(G) && truth.reps.every(r => truth.people[r].basis === 'erp' && truth.people[r].asOf === '2026-10-08'), { lines: LINES, reps: truth.reps });
  let s = await shown();
  const sum = r2(truth.reps.reduce((a, r) => a + truth.people[r].amount, 0));
  check('Team: the team figure = the sum of each person\'s month figure (bestMonthRevenue) over REPS, himself included', s.sales === sum && truth.D.sales === sum, { shown: s.sales, sum, dashboard: truth.D.sales });
  const rowsOk = truth.reps.map(r => { const p = truth.people[r], pct = Math.round(p.amount / p.target * 100);
    return { r, ok: new RegExp(r.replace(/[.]/g, '\\.') + ' ' + pct + '% ' + amtRe(p.amount) + ' KD of ' + amtRe(p.target) + ' KD').test(s.target) }; });
  check('Team: each person\'s row is her own figure, "<name> <pct>% <achieved> KD of <target> KD" (Dr. Ghaith\'s own row too)', rowsOk.every(x => x.ok), { rowsOk, card: s.target.slice(0, 420) });
  // one initials rule for every avatar (integration pass): a title is left out — "Dr. Ghaith" is G on the leaderboard,
  // the sign-in tiles, the chat and the score cards (the sign-in tile said "DG")
  const avs = await page.evaluate(() => {
    const lb = {}; document.querySelectorAll('#targetCard .ms-lb').forEach(e => { const a = e.querySelector('.av'); if(a) lb[e.dataset.person] = a.textContent.trim(); });
    renderGate(); const gate = {}; document.querySelectorAll('#gateGrid .gate-tile').forEach(t => { gate[t.querySelector('.gate-name').textContent.trim()] = t.querySelector('.gate-av').textContent.trim(); });
    const keep = chatMsgs; chatMsgs = [{ id: 'av1', who: 'Dr. Ghaith', text: 'hello', ts: Date.now() }, { id: 'av2', who: 'Mariam', text: 'hi', ts: Date.now() }]; renderChat();
    const chat = [...document.querySelectorAll('#chatList .msg-av')].map(e => e.textContent.trim()); chatMsgs = keep; renderChat();
    renderScorecards(); const score = {}; document.querySelectorAll('#scorecards .score-card').forEach(c => { score[c.querySelector('.name').textContent.trim()] = c.querySelector('.stamp').textContent.trim(); });
    return { lb, gate, chat, score };
  });
  check('Avatars: one rule everywhere — "Dr. Ghaith" is G (the title left out), Mariam M, Renova R: leaderboard, sign-in tiles, chat, score cards',
    avs.lb[G] === 'G' && avs.lb[M] === 'M' && avs.lb[R] === 'R' && avs.gate[G] === 'G' && avs.gate[M] === 'M' && avs.chat.join() === 'G,M' && avs.score[G] === 'G' && avs.score[M] === 'M', avs);
  check('Team: the Team line = teamTargetNow (achieved of target, the number of people)', new RegExp(amtRe(truth.tt.ach) + ' KD of ' + amtRe(truth.tt.goal) + ' KD · \\w[\\w ]* · ' + truth.tt.n + ' reps').test(s.target) && new RegExp('Team ' + truth.tt.pct + '%').test(s.target), { tt: truth.tt });
  check('Team: the sales card says the team target it divides by (everyone with a target has a figure): teamTargetNow\'s (data-value to the fils, shown as whole KWD: "Monthly Target 21,000 KWD")', s.ofTarget === truth.tt.goal && new RegExp('Monthly Target ' + whole(truth.tt.goal) + ' KWD').test(s.view), { ofTarget: s.ofTarget, tt: truth.tt.goal });
  check('Team: achievement, remaining, per working day and forecast = UMCore.execDashboard for the team', s.achievement === truth.D.pct && s.remaining === truth.D.remaining && s.perday === truth.D.perDay && s.forecast === truth.D.forecast && truth.D.forecast != null,
    { shown: [s.achievement, s.remaining, s.perday, s.forecast], dashboard: [truth.D.pct, truth.D.remaining, truth.D.perDay, truth.D.forecast] });
  check('Team: the pace mark says "expected by" the day the sales files reach, from the working days (Sun–Thu)', new RegExp('expected by Oct 8: ' + Math.round(truth.D.done / truth.D.total * 100) + '%').test(s.view) && truth.D.done === 6 && truth.D.total === 21,
    { done: truth.D.done, total: truth.D.total, text: (s.view.match(/expected by [^%]*%/) || [])[0] });
  check('Team: field visits, conversion, orders and new customers = UMCore.execDashboard (visits counted once for the team, 3 joint visits among them)', truth.D.joint === 3 && s.visits === truth.D.visits && s.conversion === truth.D.conversion && s.orders === truth.D.orders && s.ordersValue === truth.D.ordersValue && s.newcustomers === truth.D.newc,
    { shown: [s.visits, s.conversion, s.orders, s.ordersValue, s.newcustomers], dashboard: [truth.D.visits, truth.D.conversion, truth.D.orders, truth.D.ordersValue, truth.D.newc], joint: truth.D.joint });
  check('Orders are labelled as logged in the app, never as sales — with the note that they are not invoiced sales', /Orders logged in the app 15 orders|Orders logged in the app \d+ orders?/.test(s.work) && /not invoiced sales: sales come from the ERP files only/.test(s.work) && !/Orders? (?:sales|invoiced)/i.test(s.work), s.work.slice(0, 300));
  const due = await ev(() => visibleDueClinics().length);
  check('Team: "Needs you today" counts the follow-ups due (visibleDueClinics) and names a customer to act on (execDashboard.act)', new RegExp(due + ' follow-ups due').test(s.next) && (truth.D.under ? s.next.includes(truth.D.firstUnder) : true) && new RegExp(truth.D.under + ' under-performing').test(s.next),
    { due, under: truth.D.under, first: truth.D.firstUnder, next: s.next.slice(0, 300) });
  check('Team: the leaderboard lists every person, himself included — a row opens that person\'s screen (the picture: it replaces the person switch)', s.people.slice().sort().join() === truth.reps.slice().sort().join() && s.switch === '', { people: s.people, switch: s.switch });
  check('Team: each person\'s ▲/▼ against the same days last month = the growth her own screen gives (execDashboard for her) = the team\'s byPerson',
    truth.reps.every(r => truth.growth[r] != null && s.growth[r] === truth.growth[r] && truth.growth[r] === truth.ownGrowth[r]) && truth.reps.every(r => new RegExp(r.replace(/[.]/g, '\\.') + ' \\d+% [^]*?[▲▼] ' + Math.abs(truth.growth[r]) + '% vs the same days last month').test(s.target)),
    { shown: s.growth, team: truth.growth, own: truth.ownGrowth });
  const bTxt = b => b.pct != null ? `${amt(b.achieved)} KD of ${amt(b.goal)} KD` + (Math.round(b.net * 100) !== Math.round(b.achieved * 100) ? ` · sold in all ${amt(b.net)} KD` : '') : null;
  check('Team: the brand rows = execDashboard.byBrand — the percentage over what the people with that brand\'s target sold of it ÷ their targets (achieved of goal)',
    truth.brands.length >= 3 && s.brands.length === truth.brands.length && truth.brands.every((b, i) => s.brands[i].brand === b.brand && s.brands[i].pct === b.pct && s.brands[i].s === bTxt(b)),
    { shown: s.brands, dashboard: truth.brands });
  check('Team: the chart\'s comparisons = execDashboard — the same days of September (growth, amount, days 1–8), no figure a year before (said with the month), year to date like for like',
    s.cmp === truth.cmp.sd && truth.cmp.sd != null && new RegExp(amtRe(truth.cmp.sdPrev) + ' KD · days 1–' + +truth.cmp.sdTo.slice(8) + ' Sep').test(s.daily)
      && !truth.cmp.ly && s.cmpYear === null && /Same month last year — No sales figure for October 2025/.test(s.daily)
      && s.ytd === truth.cmp.ytd && new RegExp(amtRe(truth.cmp.ytdSales) + ' KD of ' + amtRe(truth.cmp.ytdTarget) + ' KD').test(s.daily),
    { shown: [s.cmp, s.cmpYear, s.ytd], dashboard: truth.cmp, daily: s.daily.slice(-260) });
  check('Team: the day-by-day line is the month figure\'s own lines — its days add up to the team figure and it ends on it, on the day the files reach',
    truth.daily.sum === sum && truth.daily.to === '2026-10-08' && truth.daily.n === 8 && s.chart.includes(Math.round(sum).toLocaleString('en-US')), { daily: truth.daily, sum });
  check('Team: the biggest customers = execDashboard.customers.accounts, the same amounts as the Clinics screen\'s card',
    truth.cust.length === 5 && truth.cust.every((a, i) => a.net === a.clinics && s.cust[i] && s.cust[i].includes(a.name) && s.cust[i].endsWith(amt(a.net) + ' KD')), { shown: s.cust, dashboard: truth.cust });

  // ---------- layout: the owner's picture (15 Nov), the sidebar ----------
  // (the picture: the target card spans the content, the four figure cards follow in one row, Sales Performance sits beside
  // the leaderboard, then the sales advisor, the recent activity and the clinic photo side by side — the 14 Nov design had
  // the advisor, the recent visits and the pace card there; the pace card is now below the picture)
  const lay = await ev(() => {
    const q = sel => { const e = document.querySelector(sel); const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
    const nav = document.getElementById('bottomNav').getBoundingClientRect();
    const kpis = [...document.querySelectorAll('#msKpis .ms-kc')].map(e => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width) }; });
    return { sales: q('#msSales'), people: q('#targetCard .ms-people'), chart: q('#msChart'), adv: q('#msAdvisor'), recent: q('#msRecentCard'), photo: q('#msPhoto'), status: q('#msStatus'), next: q('#msNext'), kpis,
      nav: { x: nav.left, y: nav.top, w: nav.width, h: nav.height }, vw: innerWidth, vh: innerHeight,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, dir: document.documentElement.dir };
  });
  check('Laptop 1440×900: the target card spans the content at the top, the four figure cards in one row under it, Sales Performance beside the leaderboard, then the advisor, the recent activity and the photo side by side; the needs and the pace card below them',
    lay.sales.w >= 1000 && lay.kpis.length === 4 && lay.kpis.every((k, i) => k.y === lay.kpis[0].y && (!i || k.x > lay.kpis[i - 1].x)) && lay.kpis[0].y >= lay.sales.y + lay.sales.h
    && lay.chart.y === lay.people.y && lay.chart.x < lay.people.x && lay.chart.w > lay.people.w && lay.chart.y > lay.kpis[0].y
    && lay.adv.y === lay.recent.y && lay.recent.y === lay.photo.y && lay.adv.x < lay.recent.x && lay.recent.x < lay.photo.x && lay.adv.y > lay.chart.y
    && lay.next.y > lay.adv.y && lay.status.y > lay.adv.y, lay);
  // redesign: the laptop's navigation is a labelled sidebar (every destination by name) instead of the 96 px icon rail
  check('Laptop: the navigation is a sidebar (full height, at the start edge, wide enough for its labels: 200–280 px), not a bottom bar', lay.nav.h >= lay.vh - 1 && lay.nav.w >= 200 && lay.nav.w <= 280 && lay.nav.x === 0, lay.nav);
  const lap = await ev(() => ({ info: ['msSales', 'msWork', 'msAdvisor', 'targetCard', 'msChart', 'msDaily', 'msBrands', 'msCust'].filter(id => !document.querySelector('#' + id + ' .ms-i')),
    open: ['msPlanCard', 'msDueCard', 'msTaskCard', 'msRecentCard'].every(id => getComputedStyle(document.querySelector('#' + id + ' .ms-body')).display !== 'none'),
    rows: getComputedStyle(document.getElementById('msRows')).display }));
  // each ⓘ is wired: a tap opens "How it is calculated"
  const infoTap = (await act(() => ['msSales', 'msWork', 'msAdvisor', 'targetCard', 'msChart', 'msDaily', 'msBrands', 'msCust'].map(id => {
    const b = document.querySelector('#' + id + ' .ms-i'); if(!b) return id + ': no ⓘ';
    b.click(); const open = document.getElementById('modalBack').classList.contains('show'), t = document.getElementById('modalInner').innerText; closeModal();
    return open && /How it is calculated/.test(t) ? '' : id + ': ' + (open ? t.slice(0, 40) : 'nothing opened');
  }).filter(Boolean))) || ['the page threw'];
  check('Laptop: every card with figures has its ⓘ and each opens "How it is calculated"; the plan, follow-ups, tasks and visits are open; no phone rows', lap.info.length === 0 && infoTap.length === 0 && lap.open && lap.rows === 'none', Object.assign({ infoTap }, lap));

  // ---------- ⓘ: how it is calculated, with this view's numbers ----------
  const how = (await act(() => { msHow('sales'); const t = document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); closeModal(); return t; })) || '';
  check('ⓘ "How it is calculated": the source, the formula and this view\'s own numbers (each person, the division)', /How it is calculated/.test(how) && /The ERP sales files only/.test(how) && /Achievement % = invoiced sales ÷ target × 100/.test(how)
    && truth.reps.every(r => how.includes(amt(truth.people[r].amount))) && new RegExp('= ' + truth.D.pct + '%').test(how), how.slice(0, 500));

  // ---------- the person switch: Mariam's own screen ----------
  writes = [];
  await act(() => document.querySelector('#targetCard .ms-person[data-person="Mariam"]').click());   // her row on the leaderboard opens her screen
  await ready(); await sleep(100);
  const mTruth = await ev(() => {
    const d = digestData(), D = UMCore.execDashboard(d, { rep: 'Mariam', reps: ['Mariam'] });
    const card = kpiCards(['Mariam'], 'month')[0], week = kpiCards(['Mariam'], 'week')[0], S = kpiSettings();
    const it = (c, k) => c.items.find(x => x.key === k);
    return { amount: bestMonthRevenue('Mariam').amount, pct: D.achievement.pct, remaining: D.remaining, perDay: D.perDay.amount, forecast: D.forecast ? D.forecast.amount : null,
      kpi: card.total, visits: it(card, 'visits').value, week: it(week, 'visits').value, doctors: it(card, 'doctors').value, newbiz: it(card, 'newbiz').value, S };
  });
  const mSup = await shown();
  check('Switch → Mariam: her own screen (the person view), labelled with whose it is and a way back to the team', /ms-vperson/.test(mSup.grid) && /Viewing: Mariam/.test(mSup.view) && /Back to the team/.test(mSup.view), mSup.grid);
  check('Switch → Mariam: her sales, achievement, remaining, per day and forecast = bestMonthRevenue and execDashboard for her', mSup.sales === mTruth.amount && mSup.achievement === mTruth.pct && mSup.remaining === mTruth.remaining && mSup.perday === mTruth.perDay && mSup.forecast === mTruth.forecast,
    { shown: [mSup.sales, mSup.achievement, mSup.remaining, mSup.perday, mSup.forecast], truth: [mTruth.amount, mTruth.pct, mTruth.remaining, mTruth.perDay, mTruth.forecast] });
  const kv = (str, re) => { const x = String(str).match(re); return x ? Number(x[1]) : null; };
  check('Switch → Mariam: visits a day, this week, doctors and new accounts = UMCore.kpiScorecard for her (More → KPI scorecard)',
    mSup.perdayVisits === kv(mTruth.visits, /^([\d.]+) a day/) && mSup.weekVisits === kv(mTruth.week, /\((\d+) in/) && mSup.doctors === kv(mTruth.doctors, /^(\d+) doctors met/) && mSup.accounts === kv(mTruth.newbiz, /(\d+) new accounts?$/)
      && new RegExp('goal ' + mTruth.S.visitsPerDay + ' a day').test(mSup.work) && new RegExp(mSup.doctors + ' of ' + mTruth.S.doctorsPerMonth).test(mSup.work),
    { shown: [mSup.perdayVisits, mSup.weekVisits, mSup.doctors, mSup.accounts], kpi: [mTruth.visits, mTruth.week, mTruth.doctors, mTruth.newbiz] });
  check('Switch → Mariam: the KPI score out of 100 = kpiScorecard\'s total (her figure card)', mSup.kpi === mTruth.kpi && new RegExp('Performance ' + mTruth.kpi + '%').test(mSup.view), { kpi: mSup.kpi, truth: mTruth.kpi });
  check('Switch → Mariam: her growth against the same days last month = the ▲/▼ on her row in the team\'s card (one figure in both places)', mSup.cmp === truth.growth[M] && mSup.cmp === truth.ownGrowth[M], { her: mSup.cmp, row: truth.growth[M] });
  // the sheet More → KPI scorecard shows for her, opened from her score: the same total and the same figures
  const kpiSheet = (await act(() => { msKpi(); const t = document.getElementById('modalInner').innerText.replace(/\s+/g, ' ').trim(); closeModal(); return t; })) || '';
  const vn = (mSup.work.match(/(\d+) visits in (\d+) working days/) || []).slice(1).map(Number);
  check('Switch → Mariam: the score and the figures = what the KPI scorecard sheet shows for her (opened from the score): total, visits a day (count, working days), doctors met, new accounts',
    /^KPI scorecard/.test(kpiSheet) && /Mariam · This month · 6 working days/.test(kpiSheet) && kpiSheet.includes(mTruth.kpi + '/100') && vn.length === 2
      && kpiSheet.includes(`${mSup.perdayVisits.toFixed(1)} a day (${vn[0]} in ${vn[1]} working days)`) && kpiSheet.includes(`${mSup.doctors} doctors met`) && new RegExp(`· ${mSup.accounts} new accounts?\\b`).test(kpiSheet),
    { shown: [mSup.perdayVisits, vn, mSup.doctors, mSup.accounts, mTruth.kpi], sheet: kpiSheet.slice(0, 420) });
  check('Switch → Mariam: her target card says her own line, "Visits n/m" from her visits target, and no Team line', /Visits \d+\/80 \(\d+%\)/.test(mSup.target) && !/\bTeam\b/.test(mSup.target) && /Achieved: ERP to Oct 8 · target: DSR/.test(mSup.target), mSup.target.slice(0, 300));
  // the ⓘ sheets, the folded rows and the switch back: looking writes nothing
  await act(() => { msHow('visits'); closeModal(); msHow('work'); closeModal(); msActSheet(); closeModal(); msFold('msDueCard'); msFold('msDueCard'); });
  await act(() => document.querySelector('.ms-back').click()); await ready(); await sleep(100);
  const back = await shown();
  check('Back to the team: the team view again', /ms-vteam/.test(back.grid) && back.sales === sum, back.grid);
  check('Viewing the screen (switching people, ⓘ sheets, rows) writes nothing to the cloud', writes.length === 0, writes);

  // ---------- the Months button, the month report agrees ----------
  const months = (await act(() => { const b = [...document.querySelectorAll('#targetCard button.chip')].find(e => /Months/.test(e.textContent)); if(!b) return { list: '(no Months button)', rep: '' };
    b.click(); const list = document.getElementById('modalInner').innerText; renderMonthClose('2026-10'); const rep = document.getElementById('modalInner').innerText; closeModal(); return { list, rep }; })) || { list: '', rep: '' };
  check('The Months button opens the month reports, and October\'s report shows each person\'s figure as the main screen does', /تقارير الشهور/.test(months.list) && truth.reps.every(r => months.rep.includes(amt(truth.people[r].amount))), months.rep.slice(0, 300));

  // ---------- a brand someone sells with no target for it: the percentage counts only the people with its target ----------
  const bx = (await act(async () => {
    const keep = JSON.stringify(targets['Dr. Ghaith']);
    targets['Dr. Ghaith'].brands = {};                                    // in memory only: nothing is saved
    renderToday(); await msWhenReady();
    const D = UMCore.execDashboard(digestData(), { rep: 'all', reps: REPS.slice() });
    const rows = [...document.querySelectorAll('#msBrands .ms-person[data-brand]')].map(e => { const p = e.querySelector('[data-ms="brand-pct"]');
      return { brand: e.dataset.brand, pct: p && p.dataset.value !== '' ? Number(p.dataset.value) : null, s: e.querySelector('.s').innerText.replace(/\s+/g, ' ').trim() }; });
    msHow('brands'); const how = document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); closeModal();
    targets['Dr. Ghaith'] = JSON.parse(keep); renderToday(); await msWhenReady();
    return { rows, how, D: D.byBrand.rows.filter(b => b.net || b.target).slice(0, 5).map(b => ({ brand: b.brand, pct: b.pct, achieved: b.achieved, goal: b.goal, net: b.net })) };
  })) || { rows: [], D: [], how: '' };
  const bxSold = bx.D.filter(b => Math.round(b.net * 100) !== Math.round(b.achieved * 100));
  check('A brand Dr. Ghaith sells with no target of his: its row is what the people with its target sold ÷ their targets, and what everyone sold is said beside it ("sold in all") — as execDashboard.byBrand',
    bx.D.length >= 3 && bxSold.length >= 1 && bx.rows.length === bx.D.length && bx.D.every((b, i) => bx.rows[i].brand === b.brand && bx.rows[i].pct === b.pct && bx.rows[i].s === bTxt(b))
      && bxSold.every(b => b.pct === Math.round(b.achieved / b.goal * 100) && b.pct !== Math.round(b.net / b.goal * 100) || b.achieved / b.goal === b.net / b.goal),
    { shown: bx.rows, dashboard: bx.D });
  check('… and its ⓘ shows that division with this view\'s numbers (achieved ÷ goal × 100 = %, sold in all)',
    bx.D.every(b => b.pct == null || bx.how.includes(`${amt(b.achieved)} ÷ ${amt(b.goal)} × 100 = ${b.pct}%`)) && bxSold.every(b => bx.how.includes(`sold in all ${amt(b.net)} KD`)), bx.how.slice(0, 400));

  // ---------- speed: one render of the screen, with 3 people × 12 months of lines ----------
  const speed = await ev(async () => {
    await msWhenReady();
    const t = []; for(let i = 0; i < 3; i++){ const t0 = performance.now(); renderToday(); t.push(performance.now() - t0); }
    visits.push({ id: 'vspeed', clinicId: 'm2', rep: 'Mariam', date: '2026-10-08', ts: Date.now(), products: [], orderTaken: false, orderTotal: 0, doctorIds: [] });   // a change: the figures must be computed again
    const t1 = performance.now(); renderToday(); const first = performance.now() - t1;
    await msWhenReady(); const compute = _msModel.ms;
    visits.pop(); renderToday(); await msWhenReady();
    return { cached: Math.max(...t), first, compute };
  });
  check('Speed: a render stays under 150 ms (cached figures, and the render after a change — the figures are computed after it)', speed.cached < 150 && speed.first < 150 && speed.compute < 3000, speed);

  // ---------- kept: tasks, plan, follow-ups, See all, Plan today ----------
  writes = [];
  await page.fill('#newTaskInput', 'Check the stand at Harbor');
  await act(() => document.querySelector('#msTaskCard .ms-taskadd button').click()); await sleep(200);
  const task = await ev(() => ({ list: document.getElementById('taskList').innerText, saved: tasks.some(t => t.text === 'Check the stand at Harbor') }));
  check('Kept: the quick task is added from the main screen and saved', task.saved && /Check the stand at Harbor/.test(task.list) && writes.includes('tasks') && JSON.parse(cloud.tasks).some(t => t.text === 'Check the stand at Harbor'), { writes, list: task.list.slice(0, 120) });
  await act(() => document.querySelector('#planList .card[onclick]').click()); await sleep(150);
  const plan = await ev(() => ({ view: activeView, picked: typeof selectedClinicId !== 'undefined' ? selectedClinicId : (document.getElementById('clinicPick') || {}).value }));
  check('Kept: a plan entry opens its visit (the log form, the clinic picked)', plan.view === 'log' && plan.picked === 'm1', plan);
  await ev(() => switchView('today')); await sleep(100);
  await act(() => document.querySelector('#dueList .card').click()); await sleep(150);
  const fuTxt = await ev(() => { const t = document.getElementById('modalBack').classList.contains('show') ? document.getElementById('modalInner').innerText : ''; closeModal(); return t; });
  check('Kept: a follow-up opens its confirmation (log it, reschedule, clear)', /What's the next step\?/.test(fuTxt) && /Not yet — reschedule/.test(fuTxt), fuTxt.slice(0, 120));
  await act(() => [...document.querySelectorAll('#msRecentCard .link')].find(e => /View All/.test(e.textContent)).click()); await sleep(100);
  const seeAll = await ev(() => activeView);
  await ev(() => switchView('today')); await sleep(80);
  await act(() => document.getElementById('planLink').click()); await sleep(100);
  const planDay = await ev(() => { const t = document.getElementById('modalInner').innerText; closeModal(); return t; });
  check('Kept: View All (recent activity) opens the visit log; Plan today opens the day planner', seeAll === 'log' && /Plan today's visits/.test(planDay), { seeAll, planDay: planDay.slice(0, 60) });

  // ---------- no horizontal overflow; the phone arrangement ----------
  const over = [], spill = [], wrap = [], rowsAt = {};
  for(const [w, h] of SIZES){
    await page.setViewportSize({ width: w, height: h }); await sleep(120);
    const m = await ev(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if(m.sw > m.cw) over.push({ w, m });
    const sp = await ev(spilled); if(sp.length) spill.push({ w, sp });
    if(w >= 390){ const sw = await ev(statsWrap); if(sw.length) wrap.push({ w, sw }); }
    if(w >= 1024) rowsAt[w] = await ev(() => { const r = sel => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width) }; };
      return { sales: r('#msSales'), adv: r('#msAdvisor'), people: r('#targetCard .ms-people'), chart: r('#msChart'), recent: r('#msRecentCard'), photo: r('#msPhoto'),
        kpis: [...document.querySelectorAll('#msKpis .ms-kc')].map(e => Math.round(e.getBoundingClientRect().top)) }; });
  }
  // the owner's picture: the target card across the content and the four figures in one row at every laptop width; Sales
  // Performance beside the leaderboard from 1280 px (above it at 1024); the advisor and the recent activity side by side, each
  // wide enough for its words (≥ 360 px); the clinic photo beside them from 1366 px (a decoration: left out below)
  const okAt = (x, w) => !!x && x.kpis.length === 4 && x.kpis.every(t => t === x.kpis[0]) && x.sales.w >= 1.9 * x.adv.w
    && (w >= 1280 ? x.chart.y === x.people.y && x.chart.x !== x.people.x : x.people.y > x.chart.y)
    && x.adv.y === x.recent.y && x.adv.w >= 360 && x.recent.w >= 360 && (w >= 1366 ? x.photo.y === x.adv.y && x.photo.w > 0 : x.photo.w === 0);
  check('Laptop from 1024 to 1440 px: the target card across the content and the four figures in one row; Sales Performance beside the leaderboard from 1280 px (above it at 1024); the advisor and the recent activity side by side (≥ 360 px each), the photo beside them from 1366 px', [1024, 1280, 1366, 1440].every(w => okAt(rowsAt[w], w)), rowsAt);
  check('Supervisor (team, English): the three figures under the sales card — label, amount, sub-line — each on one line from 390 px up (360 may wrap, never spill)', wrap.length === 0, wrap.slice(0, 3));
  check('Supervisor: no horizontal page scroll at 360, 390, 768, 1024, 1280 and 1440 px', over.length === 0, over);
  check('Supervisor: no figure spills out of its box (cards, stats columns, rows) at any of those widths', spill.length === 0, spill.slice(0, 3));

  // ======================= a rep, phone =======================
  await boot(M, 'rep', 390, 844);
  const rep = await shown();
  const rTruth = await ev(() => {
    const card = kpiCards(['Mariam'], 'month')[0], others = ['Renova', 'Dr. Ghaith'].map(r => bestMonthRevenue(r).amount.toFixed(2));
    return { amount: bestMonthRevenue('Mariam').amount, kpi: card.total, others, tt: teamTargetNow() };
  });
  check('Rep: her sales = bestMonthRevenue(her); the same figures the supervisor sees on her screen', rep.sales === rTruth.amount && rep.sales === mSup.sales && rep.achievement === mSup.achievement && rep.remaining === mSup.remaining && rep.perday === mSup.perday && rep.forecast === mSup.forecast,
    { rep: [rep.sales, rep.achievement, rep.remaining, rep.perday, rep.forecast], sup: [mSup.sales, mSup.achievement, mSup.remaining, mSup.perday, mSup.forecast] });
  check('Rep: her growth against the same days last month = the supervisor\'s view of her', rep.cmp === mSup.cmp && rep.cmp != null, { rep: rep.cmp, sup: mSup.cmp });
  check('Rep: visits a day, this week, doctors, new accounts = kpiScorecard for her — and the same as on the supervisor\'s view of her', rep.perdayVisits === mSup.perdayVisits && rep.weekVisits === mSup.weekVisits && rep.doctors === mSup.doctors && rep.accounts === mSup.accounts && rep.perdayVisits === kv(mTruth.visits, /^([\d.]+) a day/),
    { rep: [rep.perdayVisits, rep.weekVisits, rep.doctors, rep.accounts], sup: [mSup.perdayVisits, mSup.weekVisits, mSup.doctors, mSup.accounts] });
  const kpiRow = await ev(() => { const r = document.querySelector('#msRows [data-row="kpi"]'); return r ? r.textContent.replace(/\s+/g, ' ') : ''; });
  check('Rep: the KPI score out of 100 = kpiScorecard — on her phone the Today row\'s figure, and the one-tap row of a wider screen (601–1023 px)', rep.kpi === rTruth.kpi && new RegExp('Performance score \\(KPI\\)\\s*' + rTruth.kpi + ' of 100').test(kpiRow), { tile: rep.kpi, kpiRow, kpi: rTruth.kpi });
  const leak = t => ['Renova', 'Ghaith', 'رانوفا', 'غيث', 'Team', 'الفريق'].filter(n => t.includes(n)).concat(rTruth.others.filter(x => t.includes(x) || t.includes(amt(+x)))).concat(t.includes(rTruth.tt.goal.toFixed(2)) || t.includes(rTruth.tt.ach.toFixed(2)) || t.includes(amt(rTruth.tt.goal)) || t.includes(amt(rTruth.tt.ach)) ? ['team total'] : []);
  check('Rep (English): only her own — no other person\'s name or figure, no team total, no leaderboard — in what shows and in the hidden parts', leak(rep.view).length === 0 && leak(rep.html).length === 0 && rep.people.length === 0 && /ms-vperson/.test(rep.grid), { shown: leak(rep.view), html: leak(rep.html) });
  await act(() => msOpenPerson('Renova')); await ready();
  const still = await shown();
  check('Rep: the switch cannot be forced (ownRepOnly): asking for another person keeps her own screen', still.sales === rTruth.amount && leak(still.view).length === 0, leak(still.view));
  const nav = await ev(() => { const n = document.getElementById('bottomNav').getBoundingClientRect(), l = document.querySelector('#bottomNav button[data-view="log"]').getBoundingClientRect();
    return { nav: { top: Math.round(n.top), bottom: Math.round(n.bottom), w: Math.round(n.width), h: Math.round(n.height) }, log: { top: Math.round(l.top), w: Math.round(l.width), h: Math.round(l.height) }, vh: innerHeight, vw: innerWidth }; });
  const pv = await phoneView();
  const below = (a, b) => !!a && !!b && a.y + a.h <= b.y;
  // the owner's review of v125: one column, in this order — the head, her target card, the Today row (three figures side by side),
  // her next actions, the forecast line, then "More details"; nothing of what it holds shows, and the page ends with it
  check('Phone 390×844 (her phone): one column in the owner\'s order — the head, her target card, the Today row (three figures side by side), her next actions, the forecast line, then "More details", each the width of the screen',
    below(pv.head, pv.sales) && below(pv.sales, pv.tiles[0]) && pv.tiles.length === 3 && pv.tiles.every(t => t.y === pv.tiles[0].y) && below(pv.tiles[0], pv.next) && below(pv.next, pv.chip) && below(pv.chip, pv.more)
      && [pv.sales, pv.next, pv.chip, pv.more].every(b => b.x === pv.sales.x && b.w >= 340), pv);
  check('Phone: each fact shows once on her main view — follow-ups due, today\'s plan, field visits, the amount a day, the KPI score and the forecast each in one place; no ▲/▼ or sparkline in the Today row; the advisor not on the page (its sheet: "Recommendations" under her next actions, three rows at most, then View All)',
    Object.values(pv.facts).every(x => x.length === 1) && pv.facts['the forecast'][0] === '#msFcChip .ms-fc' && pv.deltas === 0 && pv.recs && pv.viewAll && pv.nextRows >= 1 && pv.nextRows <= 3, { facts: pv.facts, deltas: pv.deltas, recs: pv.recs, viewAll: pv.viewAll, rows: pv.nextRows });
  check('Phone: "More details" closed — nothing it holds shows (rows, visits card, plan, follow-ups, tasks, recent activity, the cross-invoice notice) and the page ends with it: her main view ≤ 1.3 screens (390×844)',
    !!pv.more && pv.details.length === 0 && pv.expanded === 'false' && pv.doc <= Math.round(1.3 * pv.vh) && pv.doc - (pv.more.y + pv.more.h) < 160, { details: pv.details, doc: pv.doc, moreBottom: pv.more ? pv.more.y + pv.more.h : null, screens: Math.round(pv.doc / pv.vh * 100) / 100 });
  check('Phone: the main screen\'s page is a flat dark green (no gradient on the page or the target card)', /^rgb\(12, 44, 35\)$/.test(pv.page) && await ev(() => !/gradient/.test(getComputedStyle(document.body).backgroundImage.replace(/url\([^)]*\)/g, '')) && getComputedStyle(document.querySelector('#targetCard .ms-hero')).backgroundImage === 'none'), pv.page);
  check('Phone: the fixed bottom navigation, with "Log visit" in it (a thumb target ≥ 44 px) on the first screen', nav.nav.bottom === nav.vh && nav.nav.w === nav.vw && nav.nav.h < 120 && nav.log.top >= nav.vh - 120 && nav.log.h >= 44 && nav.log.w >= 44, nav);
  const fold = (await act(() => {
    const on = el => !!el && el.getClientRects().length > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const ids = ['msRows', 'msWork', 'msPlanCard', 'msDueCard', 'msTaskCard', 'msRecentCard'];
    document.getElementById('msMore').click();
    const opened = ids.filter(id => on(document.getElementById(id))), expanded = document.getElementById('msMore').getAttribute('aria-expanded');
    const body = () => getComputedStyle(document.querySelector('#msDueCard .ms-body')).display;
    const before = body(); document.querySelector('#msDueCard > .ms-ct').click(); const after = body();
    const rows = [...document.querySelectorAll('#msRows .ms-item')].filter(on).map(e => e.innerText.split('\n')[0]);
    return { opened, expanded, before, after, rows, due: document.getElementById('dueList').innerText.length };
  })) || { rows: [], opened: [] };
  check('Phone: "More details" opens the rest in place — the rows (day by day, brands, customers, orders), the visits card, the plan, follow-ups, tasks and recent activity; the follow-ups open in place',
    fold.opened.length === 6 && fold.expanded === 'true' && fold.before === 'none' && fold.after === 'block' && fold.due > 0 && fold.rows.length === 4, fold);
  await page.click('#bottomNav button[data-view="log"]', { timeout: 3000 }).catch(e => errors.push('the Log visit button could not be tapped: ' + e.message.split('\n')[0]));
  await sleep(150);
  check('Phone: logging a visit is one tap from her main screen', await ev(() => activeView === 'log' && document.getElementById('view-log').classList.contains('active')));
  await ev(() => switchView('today')); await ready();
  const over2 = [], spill2 = [], wrap2 = [];
  for(const [w, h] of SIZES){
    await page.setViewportSize({ width: w, height: h }); await sleep(120);
    const m = await ev(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if(m.sw > m.cw) over2.push({ w, m });
    const sp = await ev(spilled); if(sp.length) spill2.push({ w, sp });
    if(w >= 390){ const sw = await ev(statsWrap); if(sw.length) wrap2.push({ w, sw }); }
  }
  check('Rep: no horizontal page scroll at 360, 390, 768, 1024, 1280 and 1440 px', over2.length === 0, over2);
  check('Rep: no figure spills out of its box at any of those widths', spill2.length === 0, spill2.slice(0, 3));
  check('Rep (English, phone): her target card and figures in the picture\'s words — achieved over the target, remaining, N Work Days Left, the amount a day (whole KWD of the same figures); the forecast line: its amount (the figure card\'s), its % and "estimate"',
    wrap2.length === 0 && rep.remaining != null && new RegExp(whole(rep.ofTarget) + ' KWD ' + whole(rep.sales) + ' ' + whole(rep.remaining) + ' KWD Remaining \\d+ Work Days? Left ' + whole(rep.perday) + ' KWD / Day').test(rep.view)
      && new RegExp('Forecast ≈ ' + whole(rep.forecast) + ' KWD · \\d+% estimate').test(rep.view), { wrap2: wrap2.slice(0, 3), card: (rep.view.match(/Remaining[^]{0,160}/) || [''])[0], forecast: (rep.view.match(/Forecast[^]{0,60}/) || [''])[0] });

  // ======================= the supervisor, phone (the owner's review of v125) =======================
  const supPhone = async lang => {
    await boot(G, 'supervisor', 390, 844, { lang }); await sleep(100);
    const v = await phoneView(), below = (a, b) => !!a && !!b && a.y + a.h <= b.y;
    return { v, order: below(v.head, v.sales) && below(v.sales, v.tiles[0]) && v.tiles.length === 3 && v.tiles.every(t => t.y === v.tiles[0].y) && below(v.tiles[0], v.people) && below(v.people, v.next) && below(v.next, v.chip) && below(v.chip, v.more) };
  };
  for(const lang of ['en', 'ar']){
    const sp = await supPhone(lang);
    check(`Supervisor's phone (${lang}): the head, the team's target card, the Today row (three figures), the team ranking, his next actions, the forecast line, then "More details"`, sp.v.team && sp.order, sp.v);
    check(`Supervisor's phone (${lang}): the ranking is three compact rows — initials, name, the bar, % and the amount (no rank, no visits column)`, sp.v.lbRows === 3 && sp.v.lbParts === '.av .n .bar .p .a', { rows: sp.v.lbRows, parts: sp.v.lbParts });
    check(`Supervisor's phone (${lang}): each fact once (follow-ups due, today's plan, field visits, the amount a day, the KPI score, the forecast), no ▲/▼, nothing of "More details" until it is tapped, and the main view ≤ 1.6 screens`,
      Object.values(sp.v.facts).every(x => x.length === 1) && sp.v.deltas === 0 && sp.v.details.length === 0 && sp.v.doc <= Math.round(1.6 * sp.v.vh), { facts: sp.v.facts, details: sp.v.details, doc: sp.v.doc, screens: Math.round(sp.v.doc / sp.v.vh * 100) / 100 });
  }
  // a person's screen on his phone (her leaderboard row): her order, and the way back
  await act(() => msOpenPerson('Renova')); await ready(); await sleep(120);
  { const v = await phoneView(), below = (a, b) => !!a && !!b && a.y + a.h <= b.y;
    check('Supervisor\'s phone on Renova\'s screen: her target card, her Today row, her next actions, the forecast line and "More details" — each fact once', !v.team && below(v.sales, v.tiles[0]) && below(v.tiles[0], v.next) && below(v.next, v.more) && Object.values(v.facts).every(x => x.length <= 1) && v.details.length === 0, v); }

  // ======================= Arabic: right to left, no English left =======================
  const english = () => ev(() => {
    const root = document.getElementById('view-today'), left = [];
    const ok = t => !/[A-Za-z]/.test(t.replace(/\b(?:ERP|DSR|KPI)\b/g, ''));
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for(let n = walk.nextNode(); n; n = walk.nextNode()){
      const t = n.nodeValue.trim(), p = n.parentElement;
      if(!t || !p || p.closest('[dir="auto"], [data-notr], script, style')) continue;
      if(!ok(t)) left.push(t);
    }
    root.querySelectorAll('[aria-label],[placeholder],[title]').forEach(el => ['aria-label', 'placeholder', 'title'].forEach(a => { const v = el.getAttribute(a); if(v && !ok(v)) left.push(a + '=' + v); }));
    return { dir: document.documentElement.dir, left: [...new Set(left)] };
  });
  await boot(M, 'rep', 390, 844, { lang: 'ar' });
  const arPv = await phoneView();
  check('Arabic, rep (phone): the same order — target card, the Today row, next actions, the forecast line, More details — each fact once, ≤ 1.3 screens',
    arPv.tiles.length === 3 && arPv.tiles.every(t => t.y === arPv.tiles[0].y) && below(arPv.sales, arPv.tiles[0]) && below(arPv.tiles[0], arPv.next) && below(arPv.next, arPv.chip) && below(arPv.chip, arPv.more)
      && Object.values(arPv.facts).every(x => x.length === 1) && arPv.details.length === 0 && arPv.doc <= Math.round(1.3 * arPv.vh), { facts: arPv.facts, doc: arPv.doc });
  await act(() => { msMoreToggle(true); ['msPlanCard', 'msDueCard', 'msTaskCard', 'msRecentCard'].forEach(msFold); }); await sleep(150);
  let ar = await english();
  const arRep = await shown();
  check('Arabic, rep (phone): right to left, and no English left on the main screen (names, clinics and acronyms aside)', ar.dir === 'rtl' && ar.left.length === 0, ar.left.slice(0, 20));
  check('Arabic, rep: still only her own — no other person in Arabic or Latin letters, no team total (hidden parts too)', leak(arRep.view).length === 0 && leak(arRep.html).length === 0 && /أدائي/.test(arRep.view) && /المتبقي/.test(arRep.view) && /د\.ك/.test(arRep.view), { shown: leak(arRep.view), html: leak(arRep.html) });
  const arWrap = [];
  const wrapAt = async (who, sizes) => { for(const [w, h] of sizes){ await page.setViewportSize({ width: w, height: h }); await sleep(120); const sw = await ev(statsWrap); if(sw.length) arWrap.push({ who, w, sw }); } };
  const arWords = /التوقع للشهر/.test(arRep.view) && /د\.ك \/ يوم/.test(arRep.view) && /باقي (?:\d+ (?:يوم|أيام) عمل|يوم عمل واحد|يوما عمل)/.test(arRep.view) && /المتبقي/.test(arRep.view) && /تقدير/.test(arRep.view);
  await wrapAt('Mariam', [[390, 844], [1440, 900]]);
  await boot(G, 'supervisor', 1440, 900, { lang: 'ar' });
  ar = await english();
  const arSup = await shown();
  check('Arabic, supervisor (laptop): right to left, no English left, the people on the leaderboard in Arabic (مريم، رانوفا، د. غيث)', ar.dir === 'rtl' && ar.left.length === 0 && arSup.names.slice().sort().join('|') === ['مريم', 'رانوفا', 'د. غيث'].sort().join('|') && arSup.sales === sum, { left: ar.left.slice(0, 20), names: arSup.names });
  await wrapAt('team', [[390, 844], [1024, 768], [1280, 800], [1366, 768], [1440, 900]]);
  await act(() => msOpenPerson('Renova')); await ready(); await sleep(150);
  ar = await english();
  check('Arabic, supervisor on Renova\'s screen: no English left there either', ar.left.length === 0, ar.left.slice(0, 20));
  await wrapAt('Renova', [[390, 844], [1440, 900]]);
  check('Arabic: the target card\'s figures in the picture\'s words — her phone, the team (390 … 1440), another person\'s screen (المتبقي · باقي … يوم عمل · د.ك / يوم · التوقع للشهر … تقدير)',
    arWrap.length === 0 && arWords, { arWrap: arWrap.slice(0, 4), arWords });

  // ======================= a month with no sales file =======================
  seed(cloud, { noOctober: true });
  await boot(G, 'supervisor', 1440, 900);
  const none = await shown();
  check('No sales file for the month: the team figure says so in words — a dash, never a made-up 0', none.sales === null && /No ERP sales file for this month yet/.test(none.view) && !/^0\.00/.test(String(none.sales)) && /Achieved: no ERP sales file for this month yet · target: DSR/.test(none.target),
    { sales: none.sales, view: none.view.slice(0, 260) });
  await act(() => msOpenPerson('Mariam')); await ready();
  const noneM = await shown();
  check('No sales file: a person\'s screen says it too — a dash for remaining, per day and forecast, no achievement made up', noneM.sales === null && noneM.achievement === undefined && noneM.remaining === null && noneM.perday === null && noneM.forecast === null && /No ERP sales file for this month yet/.test(noneM.view),
    { sales: noneM.sales, ach: noneM.achievement, rest: [noneM.remaining, noneM.perday, noneM.forecast] });

  // ======================= a person the month's files do not hold =======================
  seed(cloud, { renovaNotInFiles: true });
  await boot(G, 'supervisor', 1440, 900);
  const nm = await shown();
  const nmT = await ev(() => {
    const d = digestData(), D = UMCore.execDashboard(d, { rep: 'all', reps: REPS.slice() }), bm = r => bestMonthRevenue(r);
    return { renova: bm('Renova'), sum: Math.round((bm('Mariam').amount + bm('Dr. Ghaith').amount) * 100) / 100, tt: teamTargetNow(),
      D: { sales: D.sales.amount, missing: D.sales.missing, pct: D.achievement.pct, notMeasured: D.achievement.notMeasured, target: D.achievement.target, achieved: D.achievement.achieved,
        remaining: D.remaining, perDay: D.perDay.amount, forecast: D.forecast.amount, people: D.forecast.people } };
  });
  check('A person the files do not hold (no line of Renova\'s this month): the team figure is the others\' sum, and achievement, remaining, per day and forecast are execDashboard\'s — she is named, never counted as a 0',
    nmT.renova.basis === 'erp' && nmT.renova.asOf === null && nm.sales === nmT.sum && nm.sales === nmT.D.sales && nm.achievement === nmT.D.pct && nm.remaining === nmT.D.remaining && nm.perday === nmT.D.perDay && nm.forecast === nmT.D.forecast
      && nmT.D.notMeasured.join() === 'Renova' && nmT.D.missing.map(x => x.rep + ':' + x.why).join() === 'Renova:notinfiles' && !nmT.D.people.includes('Renova')
      && /Renova: a target but no sales figure in the files, so not in the percentage\./.test(nm.view),
    { shown: [nm.sales, nm.achievement, nm.remaining, nm.perday, nm.forecast], truth: nmT });
  check('… the sales card adds up on its own: "of" the target its percentage divides (the people with a sales figure, not the team\'s 21000), remaining = that target − the figure',
    nm.ofTarget === nmT.D.target && nmT.D.target === 13000 && nmT.tt.goal === 21000 && /Target of the people with a sales figure 13,000 KWD/.test(nm.view) && !/Monthly Target/.test(nm.view)
      && nmT.D.remaining === Math.round((nmT.D.target - nmT.D.achieved) * 100) / 100 && nmT.D.achieved === nm.sales, { ofTarget: nm.ofTarget, D: nmT.D, tt: nmT.tt });
  check('… her row on the target card keeps the Today card\'s words (no figure yet, and why); the Team line stays teamTargetNow, as on every other screen',
    /Renova 0% 0\.00 KD of 8,000\.00 KD · no figure yet/.test(nm.target) && /no invoice of this rep in the ERP files uploaded/.test(nm.target) && new RegExp('Team ' + nmT.tt.pct + '%').test(nm.target),
    nm.target.slice(0, 700));
  await act(() => msOpenPerson('Renova')); await ready();
  const nmR = await shown();
  check('… and her own screen shows a dash with the words, never a made-up 0', nmR.sales === null && /The sales files of this month hold no line of this person yet/.test(nmR.view) && nmR.remaining === null && nmR.perday === null && nmR.forecast === null,
    { sales: nmR.sales, rest: [nmR.remaining, nmR.perday, nmR.forecast] });

  // ======================= a person's first month: the month before has a sales file, but no figure of hers =======================
  seed(cloud, { renovaNew: true });
  await boot(G, 'supervisor', 1440, 900);
  await act(() => msOpenPerson('Renova')); await ready();
  const nw = await shown();
  const nwT = await ev(() => { const d = digestData(), D = UMCore.execDashboard(d, { rep: 'Renova', reps: ['Renova'] });
    return { now: bestMonthRevenue('Renova').amount, sd: D.sameDays.measured, sepFile: erpPeriods().some(p => p.from <= '2026-09-30' && p.to >= '2026-09-01') }; });
  check('Her first month (a September file is loaded, but no line of hers in it): her screen says there is no sales figure of September to compare with — never "no sales file"',
    nwT.sepFile && nwT.sd === false && nw.sales === nwT.now && nw.cmp === null && /Same days last month — No sales figure for September 2026/.test(nw.daily) && !/No sales file for/.test(nw.view),
    { truth: nwT, daily: nw.daily.slice(-200) });

  check('no page errors', errors.length === 0, errors.slice(0, 6));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
