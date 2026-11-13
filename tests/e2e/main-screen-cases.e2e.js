// The main screen (Today, v123) in the cases the independent review (13 Nov) found
// it saying something untrue or showing someone else's figures: a month with no
// sales figure yet, the 1st of a month, a person the files do not hold, someone
// selling with no target or with a visits target only, a supervisor who does not
// sell, joint visits, a person's first month, files that stop on different days,
// the last day of a month, figures that cannot be worked out; and in the roles:
// a plan made from the main screen, the supervisor's view of a person = her own
// phone, targets saved from the Admin panel, a quick task on a person's screen,
// what the folded cards hold, a teammate's change on a rep's phone (speed), the
// names a rep's phone may show, thumb targets, the customers' ⓘ, negatives in
// Arabic, a language switch, the person switch with long or many names, and one
// word per pace state. Invented data (fixtures/main-screen-data.js), a fixed
// clock, a fake cloud, no network.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const D = require('./fixtures/main-screen-data.js');
const { G, M, R, SM, seed, filePeriods, setFiles, setTargets, monthRows, rng } = D;
const PORT = 8278;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(WWW, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(d); });
});
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = n => Math.round(n * 100) / 100;
const num = (s, re) => { const x = String(s).match(re); return x ? Number(x[1]) : null; };

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
  const boot = async (who, role, w, h, opts) => {
    opts = opts || {};
    if(ctx) await ctx.close();
    const phone = w < 600;
    ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
    await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());   // no network
    page = await ctx.newPage();
    page.on('pageerror', e => { if(!/main-screen-cases probe/.test(e.message)) errors.push('pageerror: ' + e.message); });
    page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|main-screen-cases probe/i.test(m.text())) errors.push('console: ' + m.text()); });
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
    await page.goto(`http://localhost:${PORT}/index.html`); await sleep(250);
    await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role });
    await sleep(300); await page.evaluate(() => msWhenReady()); await sleep(150);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const act = (fn, arg) => page.evaluate(fn, arg).catch(e => { errors.push('a tap or sheet threw: ' + String(e && e.message || e).split('\n')[0]); return null; });
  const ready = () => ev(() => msWhenReady().then(() => true));
  const txt = s => ev(s => { const e = document.querySelector(s); return e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : ''; }, s);
  const how = async id => (await act(id => { msHow(id); const t = document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); closeModal(); return t; }, id)) || '';
  const person = async r => { await act(r => msOpenPerson(r), r); await ready(); await sleep(120); };
  const val = (k, scope) => ev(({ k, scope }) => { const e = document.querySelector(`${scope || '#view-today'} [data-ms="${k}"]`); return e ? (e.dataset.value === '' ? null : Number(e.dataset.value)) : undefined; }, { k, scope });
  const dash = (opts) => ev(o => UMCore.execDashboard(digestData(), o), opts);
  const week = s => ({ orders: num(s, /(\d+) orders? logged in the app \(/), value: num(s, /orders? logged in the app \(([\d.]+) KD\)/), sales: num(s, /Sales this week \(ERP-verified\): ([\d.]+) KD/), visits: num(s, /(\d+) visits?\b/) });
  const unfold = () => act(() => ['msPlanCard', 'msDueCard', 'msTaskCard', 'msRecentCard'].forEach(id => { const e = document.getElementById(id); if(e && !e.classList.contains('open')) msFold(id); }));
  const english = (sel) => ev((sel) => {
    const root = document.querySelector(sel || '#view-today'), left = [];
    const ok = t => !/[A-Za-z]/.test(t.replace(/\b(?:ERP|DSR|KPI|[ABC])\b/g, ''));   // acronyms and the clinic classes A, B, C stay as they are
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for(let n = walk.nextNode(); n; n = walk.nextNode()){
      const t = n.nodeValue.trim(), p = n.parentElement;
      if(!t || !p || p.closest('[dir="auto"], [data-notr], script, style')) continue;
      if(!ok(t)) left.push(t);
    }
    root.querySelectorAll('[aria-label],[placeholder],[title]').forEach(el => ['aria-label', 'placeholder', 'title'].forEach(a => { const v = el.getAttribute(a); if(v && !ok(v)) left.push(a + '=' + v); }));
    return [...new Set(left)];
  }, sel);
  // every ⓘ of the screen, in turn: the English left in each sheet
  const englishHow = async ids => { const out = {}; for(const id of ids){ await act(id => msHow(id), id); await sleep(60); const l = await english('#modalInner'); if(l.length) out[id] = l; await act(() => closeModal()); } return out; };

  // ======================= the running month has no sales figure yet (no October file): September holds everyone =======================
  seed(cloud, { noOctober: true });
  await boot(G, 'supervisor', 1440, 900);
  const sep = await ev(() => { const d = Object.assign(digestData(), { today: '2026-09-30' }); return REPS.map(r => UMCore.monthAchievement(r, d)).map(a => a.basis === 'erp' && a.asOf === '2026-09-30'); });
  const sdA = (await dash({ rep: 'all', reps: await ev(() => REPS.slice()) })).sameDays;
  let chart = await txt('#msChart'), rows = await txt('#msRows'), hChart = await how('chart'), hSales = await how('sales');
  check('No October file, September held for everyone: the core says why there is nothing to compare (this month has no figure), not that September has none', sep.every(Boolean) && sdA.measured === false && sdA.why === 'nocurrent', { sep, sameDays: { measured: sdA.measured, why: sdA.why, people: sdA.people, left: sdA.left } });
  check('… the team\'s comparison never says "No sales figure for September 2026"; it says this month has no figure yet', !/No sales figure for September 2026/.test(chart) && /Same days last month — No sales figure for this month yet, so nothing to compare/.test(chart), chart.slice(-260));
  check('… the phone row never says "No sales figure for the month before"', !/No sales figure for the month before/.test(rows) && /No sales figure for this month yet/.test(rows), rows);
  check('… neither ⓘ says the month before has no sales figure', !/No sales figure for the month before/.test(hChart + hSales) && /No sales figure for this month yet, so nothing to compare with/.test(hChart) && /No sales figure for this month yet, so nothing to compare with/.test(hSales),
    hChart.slice(hChart.indexOf('Against the same days'), hChart.indexOf('Against the same days') + 220));
  await person(M);
  chart = await txt('#msChart');
  check('… Mariam\'s screen (the same on her phone) never says "No sales figure for September 2026"', !/No sales figure for September 2026/.test(chart) && /No sales figure for this month yet, so nothing to compare/.test(chart), chart.slice(-220));

  // ======================= the 1st of a month: October's file runs to 31 Oct, no November file =======================
  seed(cloud); { const P = filePeriods(); P.find(p => p.id === 'f2026-10').to = '2026-10-31'; setFiles(cloud, P); }
  await boot(G, 'supervisor', 1440, 900, { now: '2026-11-01T10:00:00' });
  chart = await txt('#msChart');
  const cust = await txt('#msCust');
  check('1 November, October\'s file to 31 Oct: never "No sales figure for October 2026"; November has none yet', !/No sales figure for October 2026/.test(chart) && /No sales figure for this month yet, so nothing to compare/.test(chart), chart.slice(-220));
  check('… the customers card never claims "No customer invoiced this month yet" with no file for the month; it says there is no sales figure yet', !/No customer invoiced this month yet/.test(cust) && /No sales figure for this month yet\./.test(cust), cust);
  await person(M);
  const custM = await txt('#msCust');
  check('… nor on a person\'s screen', !/No customer invoiced this month yet/.test(custM) && /No sales figure for this month yet\./.test(custM), custM);

  // ======================= a person the month's files do not hold (no line of Renova's in October) =======================
  seed(cloud, { renovaNotInFiles: true });
  await boot(G, 'supervisor', 1440, 900);
  const ofT = await val('of-target', '#msSales'), ch = await ev(() => [...document.querySelectorAll('#msChart svg text')].map(t => t.textContent));
  const nmA = await dash({ rep: 'all', reps: await ev(() => REPS.slice()) });
  check('Renova not in the files: the chart\'s line to the target ends on the target the sales card divides by (the people with a sales figure), not the team\'s', ofT === nmA.achievement.target && ofT === 13000 && ch.includes('13,000') && !ch.includes('21,000'), { ofTarget: ofT, labels: ch });
  check('… and its forecast and last point are those people\'s (the card\'s forecast, the card\'s figure)', ch.includes(Math.round(nmA.forecast.forTarget).toLocaleString('en-US')) && ch.includes(Math.round(nmA.achievement.achieved).toLocaleString('en-US')), { labels: ch, forTarget: nmA.forecast.forTarget, achieved: nmA.achievement.achieved });
  const teamLine = await ev(() => { const e = document.querySelector('#targetCard .ms-person.team'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
  check('… the Team line (teamTargetNow, the app-wide rule) says who it counts as 0, so its % and the sales card\'s can be told apart', /Renova counted as 0 \(no figure in the files\)/.test(teamLine), teamLine);
  await person(R);
  chart = await txt('#msChart');
  const rw = await txt('#msWork');
  check('… her screen never says "No sales figure for September 2026" (September holds her); it says this month has none', !/No sales figure for September 2026/.test(chart) && /No sales figure for this month yet, so nothing to compare/.test(chart), chart.slice(-220));
  check('… and never "Sales this week (ERP-verified): 0.00 KD": the week has no invoiced figure of hers, said in words', !/Sales this week \(ERP-verified\): 0\.00 KD/.test(rw) && /no invoiced sales figure/.test(rw), rw.slice(-200));

  // ======================= someone sells with no target (Dr. Ghaith) =======================
  seed(cloud); setTargets(cloud, t => { delete t[G]; });
  await boot(G, 'supervisor', 1440, 900);
  const nt = await dash({ rep: 'all', reps: await ev(() => REPS.slice()) });
  const ntS = { sales: await val('sales', '#msSales'), of: await val('of-target', '#msSales'), ach: await val('achievement', '#msSales'), rem: await val('remaining', '#msSales'), fc: await val('forecast', '#msSales'), txt: await txt('#msSales') };
  const ntPct = num(ntS.txt, /Forecast [\d.]+ KD (\d+)% of target/), gAmt = await ev(() => bestMonthRevenue('Dr. Ghaith').amount);
  check('No target for Dr. Ghaith: the sales card adds up on its own — its amount ÷ the target it shows = its %, the target − the amount = remaining, the forecast ÷ the target = the forecast\'s %',
    ntS.of === 17000 && Math.round(ntS.sales / ntS.of * 100) === ntS.ach && Math.abs(r2(ntS.of - ntS.sales) - ntS.rem) < 0.011 && Math.round(ntS.fc / ntS.of * 100) === ntPct,
    { shown: ntS, forecastPct: ntPct, dashboard: { achieved: nt.achievement.achieved, target: nt.achievement.target, pct: nt.achievement.pct, forTarget: nt.forecast.forTarget, all: nt.forecast.amount } });
  check('… his invoiced sales are said on their own line with his name and amount, and the team\'s total beside them', new RegExp('Dr\\. Ghaith[^.]*' + gAmt.toFixed(2).replace('.', '\\.') + ' KD').test(ntS.txt) && ntS.txt.includes(nt.sales.amount.toFixed(2)), ntS.txt.slice(-320));
  const ch2 = await ev(() => [...document.querySelectorAll('#msChart svg text')].map(t => t.textContent));
  check('… the chart draws the same people: the line to 17,000, their forecast and their figure (not everyone\'s 22,174)', ch2.includes('17,000') && ch2.includes(Math.round(nt.forecast.forTarget).toLocaleString('en-US')) && !ch2.includes(Math.round(nt.forecast.amount).toLocaleString('en-US')) && ch2.includes(Math.round(nt.achievement.achieved).toLocaleString('en-US')),
    { labels: ch2, forTarget: nt.forecast.forTarget, all: nt.forecast.amount });
  const hs = await how('sales');
  const fLines = await ev(() => REPS.map(r => ({ r, a: bestMonthRevenue(r).amount })));
  check('ⓘ forecast: each person\'s line shows her own invoiced figure in the division (amount ÷ days done × days = forecast), and the % of target is worked out',
    fLines.every(x => hs.includes(`${x.a.toFixed(2)} ÷ 6 × 21`)) && hs.includes(`${nt.forecast.forTarget.toFixed(2)} ÷ ${nt.forecast.target.toFixed(2)} × 100 = ${nt.forecast.pct}%`),
    hs.slice(hs.indexOf('Forecast for the month'), hs.indexOf('Forecast for the month') + 420));

  // ======================= a visits target only (Dr. Ghaith) =======================
  seed(cloud); setTargets(cloud, t => { t[G] = { visits: 20, month: '2026-10' }; });
  await boot(G, 'supervisor', 1440, 900);
  const card3 = await txt('#targetCard'), all3 = await ev(() => REPS.map(r => bestMonthRevenue(r).amount));
  const row3 = (card3.match(/Dr\. Ghaith[^]*?no sales target set/) || [''])[0];
  check('A visits target only: his row says his invoiced sales — the rows add up to the team\'s sales', row3.includes(all3[2].toFixed(2)) && all3.every(a => card3.includes(a.toFixed(2))), { row: row3, amounts: all3 });

  // ======================= a supervisor who does not sell =======================
  seed(cloud, { noSell: true, ghaithPlan: true });
  await boot(G, 'supervisor', 1440, 900);
  const work4 = await txt('#msWork'), w4 = week(work4), mOrders = await val('orders', '#msWork'), mSales = await val('sales', '#msSales');
  const truth4 = await ev(() => { const reps = REPS.slice(), wk = UMCore.getWeekDates(todayStr())[0];
    const vis = visits.filter(v => v.date >= wk && v.date <= todayStr());
    return { reps, orders: vis.filter(v => v.orderTaken && reps.includes(v.rep)).length, visits: vis.filter(v => UMCore.isFieldVisit(v) && reps.some(r => v.rep === r || v.withRep === r)).length }; });
  check('A supervisor who does not sell: the week\'s orders and visits are the team\'s (REPS) by the month card\'s rules, never more than the month\'s', w4.orders === truth4.orders && w4.visits === truth4.visits && w4.orders <= mOrders && truth4.reps.join() === 'Mariam,Renova', { week: w4, truth: truth4, monthOrders: mOrders });
  check('… and the week\'s invoiced sales are the team\'s, never more than the month figure', w4.sales != null && w4.sales <= mSales, { week: w4.sales, month: mSales });
  const sum4 = await txt('#msPlanSum'), list4 = await txt('#planList');
  check('… his own plan for today is in the plan card\'s summary, as the list below it shows it', /Hilal Sample Dental Clinic/.test(list4) && /Dr\. Ghaith 0 of 1/.test(sum4), { sum: sum4, list: list4.slice(0, 120) });

  // ======================= joint visits someone else led =======================
  seed(cloud); { const v = JSON.parse(cloud.visits); v.filter(x => x.rep === R && x.date >= '2026-10-04' && x.orderTaken && !x.withRep).slice(0, 3).forEach(x => { x.withRep = G; }); cloud.visits = JSON.stringify(v); }
  await boot(G, 'supervisor', 1440, 900); await person(G);
  const w5 = week(await txt('#msWork')), g5 = await dash({ rep: G, reps: [G] });
  const led5 = await ev(() => { const wk = UMCore.getWeekDates(todayStr())[0]; return visits.filter(v => v.date >= wk && v.orderTaken && v.rep === 'Dr. Ghaith').length; });
  check('Dr. Ghaith joined 3 of Renova\'s visits that took orders: his week\'s "orders logged in the app" are the ones he logged (the month card\'s rule), never more than his month\'s', w5.orders === led5 && w5.orders <= g5.orders.count, { week: w5, led: led5, month: g5.orders.count });
  seed(cloud, { jointRenovaMariam: true });
  await boot(M, 'rep', 390, 844);
  const w6 = week(await txt('#heroCard')), m6 = await dash({ rep: M, reps: [M] });
  const led6 = await ev(() => { const wk = UMCore.getWeekDates(todayStr())[0]; const o = visits.filter(v => v.date >= wk && v.orderTaken && v.rep === 'Mariam'); return { n: o.length, value: Math.round(o.reduce((s, v) => s + v.orderTotal, 0) * 100) / 100 }; });
  check('Mariam\'s phone, a joint visit Renova led took a 777 KD order: her week counts only the orders she logged (count and value), never Renova\'s', w6.orders === led6.n && w6.value === led6.value && w6.orders <= m6.orders.count, { week: w6, led: led6, month: m6.orders });

  // ======================= a person's first month (the files before October hold no line of Renova's) =======================
  seed(cloud, { renovaNew: true });
  await boot(G, 'supervisor', 1440, 900);
  const nc = (await dash({ rep: 'all', reps: await ev(() => REPS.slice()) })), work7 = await txt('#msWork'), chart7 = await txt('#msChart'), hc7 = await how('chart'), hw7 = await how('work');
  check('Her first month: the team\'s new customers leave Renova out (her September is not in the files) — the card names her', nc.newCustomers.blocked.join() === 'Renova' && /New customers \d+ without Renova/.test(work7) && /Renova/.test(hw7), { blocked: nc.newCustomers.blocked, work: work7.slice(0, 260) });
  check('… the same-days comparison leaves her out (sameDays.left) — the card names her, and the ⓘ\'s "This month" says whose it is', nc.sameDays.left.join() === 'Renova' && /Same days last month [^]*? without Renova/.test(chart7) && /This month \(Mariam, Dr\. Ghaith\)/.test(hc7), { left: nc.sameDays.left, chart: chart7.slice(-260), how: hc7.slice(hc7.indexOf('Against the same days'), hc7.indexOf('Against the same days') + 300) });
  await person(R);
  const acc7 = await val('accounts', '#msWork'), mine7 = (await dash({ rep: R, reps: [R] })).newCustomers, work7r = await txt('#msWork');
  check('… her screen counts no "new accounts" where the files cannot tell (every account would look new): not measured yet', mine7.measurable === false && acc7 == null && /New accounts — not measured yet/.test(work7r), { shown: acc7, dashboard: { measurable: mine7.measurable, blocked: mine7.blocked }, work: work7r.slice(0, 300) });

  // ======================= files that stop on different days (Renova's to 6 Oct, the others' to 8 Oct) =======================
  seed(cloud); { const P = filePeriods(); const oct = P.find(p => p.id === 'f2026-10'), rest = P.filter(p => p !== oct);
    setFiles(cloud, rest.concat([{ id: 'oct-mg', from: '2026-10-01', to: '2026-10-08', rows: oct.rows.filter(r => r[8] !== SM[R]), repMap: { [SM[M]]: M, [SM[G]]: G } },
      { id: 'oct-r', from: '2026-10-01', to: '2026-10-06', rows: oct.rows.filter(r => r[8] === SM[R] && r[0] <= '2026-10-06'), repMap: { [SM[R]]: R } }])); }
  await boot(G, 'supervisor', 1440, 900);
  const mx = (await dash({ rep: 'all', reps: await ev(() => REPS.slice()) })).sameDays, chart8 = await txt('#msChart'), src8 = await txt('#msSource'), hc8 = await how('chart');
  check('Files to different days (sameDays.mixed): the comparison does not claim "days 1–8 Sep" for all of it; it says each person to the day her file reaches, the ⓘ person by person',
    mx.mixed && !/days 1–8 Sep/.test(chart8) && /each person to the day her file reaches/.test(chart8) && /Renova: days 1 to 6 September 2026/.test(hc8) && /Mariam: days 1 to 8 September 2026/.test(hc8), { mixed: mx.mixed, chart: chart8.slice(-220), how: hc8.slice(hc8.indexOf('Against the same days'), hc8.indexOf('Against the same days') + 360) });
  check('… and the header does not claim one day for everyone: it names the earliest and the latest', /Oct 6/.test(src8) && /Oct 8/.test(src8) && /each person to the day her file reaches/.test(src8), src8);

  // ======================= the last day of a month: no working day left, target not reached =======================
  seed(cloud); { const P = filePeriods(); const oct = P.find(p => p.id === 'f2026-10'); oct.rows = monthRows('2026-10', 29, rng(99)); oct.to = '2026-10-31'; setFiles(cloud, P); }
  setTargets(cloud, t => { [M, R, G].forEach(r => { t[r].revenue *= 3; }); });
  await boot(G, 'supervisor', 1440, 900, { now: '2026-10-31T10:00:00' });
  const s10 = await txt('#msSales');
  check('31 Oct (a Saturday), files to 31 Oct, target not reached: "Per work day" says why it has no figure', /Per work day — no working day left/.test(s10), (s10.match(/Remaining[^]*?Forecast/) || [''])[0]);

  // ======================= the default month: pace words, the customers' ⓘ, targets saved from Admin, figures that fail =======================
  seed(cloud);
  await boot(G, 'supervisor', 1440, 900);
  const pill = await txt('#msSales .ms-pill'), tl = await ev(() => { const e = document.querySelector('#targetCard .ms-person.team'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
  check('One word per pace state: the sales card\'s pill and the Team line say the same word for the same figures', !!pill && tl.includes('· ' + pill + ' ·'), { pill, team: tl });
  const custInfo = await act(() => { const b = document.querySelector('#msCust .ms-i'); if(!b) return 'no ⓘ'; b.click(); const t = document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); closeModal(); return t; });
  const ctot = await ev(() => { const D = UMCore.execDashboard(digestData(), { rep: 'all', reps: REPS.slice() }); const top = D.customers.accounts.filter(a => !a.channel && a.net > 0).slice(0, 5);
    return { top: Math.round(top.reduce((s, a) => s + a.net, 0) * 100) / 100, total: D.customers.totals.total }; });
  check('The team\'s "Biggest customers this month" has its ⓘ: the source, and this view\'s numbers (the accounts shown against the month total)', /How it is calculated/.test(custInfo) && custInfo.includes(ctot.top.toFixed(2)) && custInfo.includes(ctot.total.toFixed(2)), { custInfo: String(custInfo).slice(0, 300), ctot });
  const tg7 = await act(async () => { openAdminPanel(); const el = document.getElementById('tgRev0'); if(!el) return null; el.value = '12000'; await saveTargets(); closeModal();
    await new Promise(r => setTimeout(r, 50)); await msWhenReady();
    const v = k => { const e = document.querySelector(`#msSales [data-ms="${k}"]`); return e ? Number(e.dataset.value) : null; };
    const t = document.querySelector('#targetCard .ms-person.team'), tt = teamTargetNow();
    return { of: v('of-target'), pct: v('achievement'), team: t ? t.textContent.replace(/\s+/g, ' ') : '', tt }; });
  check('Targets saved from the Admin panel over the main screen: the sales card follows at once — its target and % are the Team line\'s', tg7 && tg7.tt.goal === 24000 && tg7.of === tg7.tt.goal && tg7.pct === tg7.tt.pct && new RegExp('Team ' + tg7.tt.pct + '%').test(tg7.team), tg7);
  const hAct = await how('act');
  const act8 = await dash({ rep: 'all', reps: await ev(() => REPS.slice()) });
  check('ⓘ customers to act on: this view\'s counts and the months they were compared with', hAct.includes(`Under-performing ${act8.act.under.length}`) && hAct.includes(`High potential ${act8.act.potential.length}`) && act8.act.prior.length > 0 && act8.act.prior.every(p => hAct.includes(new Date(p.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))),
    hAct.slice(0, 500));
  const stuck = await act(async () => { const real = UMCore.execDashboard; UMCore.execDashboard = () => { throw new Error('main-screen-cases probe'); };
    visits.push({ id: 'vx', clinicId: 'm2', rep: 'Mariam', date: '2026-10-08', products: [], orderTaken: false, orderTotal: 0, doctorIds: [] });
    renderToday(); await msWhenReady(); await new Promise(r => setTimeout(r, 200)); renderToday(); await msWhenReady();
    const t = document.getElementById('msSales').textContent.replace(/\s+/g, ' ');
    UMCore.execDashboard = real; visits.pop(); renderToday(); await msWhenReady(); return t; });
  check('The month\'s figures cannot be worked out (execDashboard throws): the card says so instead of "Calculating the month…" for ever', !!stuck && !/Calculating the month/.test(stuck) && /could not be worked out on this device/.test(stuck), String(stuck).slice(0, 220));

  // ======================= a language switch mid-session (the cross-invoice notice) =======================
  seed(cloud, { cross: true });
  await boot(G, 'supervisor', 1440, 900);
  await act(() => setUiLang('ar')); await sleep(300); await ready(); await sleep(200);
  const cx = await ev(() => { const d = document.querySelector('#targetCard details'); const box = d && d.closest('div[onclick]'); document.querySelectorAll('#targetCard details').forEach(x => { x.open = true; }); return box ? box.innerText.replace(/\s+/g, ' ') : ''; });
  check('Switching to Arabic mid-session: the cross-invoice notice follows at once — the people in Arabic, the dates in Arabic', !!cx && /مريم/.test(cx) && /رانوفا/.test(cx) && !/\b(?:Mariam|Renova)\b/.test(cx) && !/\bOct\b/.test(cx), cx.slice(0, 300));

  // ======================= today's plan: a call is not a visit, a joint field visit is =======================
  seed(cloud, { extraVisits: [
    { id: 'call1', clinicId: 'm1', rep: M, withRep: null, date: '2026-10-08', ts: Date.parse('2026-10-08T09:40:00'), callOnly: true, channel: 'phone', products: [], orderTaken: false, orderTotal: 0, doctorIds: [] },
    { id: 'joint1', clinicId: 'r1', rep: M, withRep: R, date: '2026-10-08', ts: Date.parse('2026-10-08T09:50:00'), products: ['p1'], orderTaken: false, orderTotal: 0, doctorIds: ['r1d1'], noOrderReason: 'Stock still available' }] });
  await boot(M, 'rep', 1440, 900);
  const n13 = await txt('#msNext'), sum13 = await txt('#msPlanSum'), list13 = await ev(() => [...document.querySelectorAll('#planList .card')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('Mariam only phoned Harbor (planned): her plan says 1 of 2 done and Harbor is next — the next step, the plan row and the list agree',
    /Today's plan: 1 of 2 done/.test(n13) && /Harbor Sample Dental Clinic In today's plan · not visited yet/.test(n13) && /^1 of 2 done$/.test(sum13) && list13.some(t => /Harbor/.test(t) && !/Visited today/.test(t)), { next: n13.slice(0, 140), sum: sum13, list: list13 });
  await boot(R, 'rep', 1440, 900);
  const r13 = await txt('#msNext'), rsum13 = await txt('#msPlanSum'), rlist13 = await txt('#planList');
  check('Renova was on a joint field visit at Mira (planned): her plan counts it as visited — everywhere', /Today's plan: 1 of 1 done/.test(r13) && !/Mira Sample Dental Clinic In today's plan · not visited yet/.test(r13) && /^1 of 1 done$/.test(rsum13) && /Visited today/.test(rlist13), { next: r13.slice(0, 140), sum: rsum13, list: rlist13.slice(0, 120) });

  // ======================= planning today from the main screen =======================
  seed(cloud); { const p = JSON.parse(cloud.dayPlans); delete p['2026-10-08'][M]; cloud.dayPlans = JSON.stringify(p); }
  await boot(M, 'rep', 390, 844);
  await act(async () => { const b = [...document.querySelectorAll('#msNext .ms-btn')].find(x => /Plan today/.test(x.textContent)); b.click();
    await togglePlanClinic('m6'); await togglePlanClinic('m1'); [...document.querySelectorAll('#modalInner .btn')].find(x => /Done/.test(x.textContent)).click(); });
  await sleep(400);
  const pl = { next: await txt('#msNext'), sum: await txt('#msPlanSum'), list: await txt('#planList') };
  check('Planning today from her next-step card (two clinics she has not visited today): the card names the first planned clinic and the plan row counts them at once (no wait for a refresh)',
    /Lagoon Sample Dental Clinic In today's plan · not visited yet/.test(pl.next) && /^0 of 2 done$/.test(pl.sum) && /Lagoon/.test(pl.list) && /Harbor/.test(pl.list), pl);

  // ======================= the supervisor's view of a person = her own phone; what the folded cards hold =======================
  const occ = [{ id: 'm7', name: 'Quay Sample Dental Clinic', rep: M, cls: 'B', market: 'A', nextFollowUp: null, doctors: [{ id: 'm7d1', name: 'Dr. Example Q', birthday: '1985-10-08', cadence: 'weekly' }] },
    { id: 'u1', name: 'Unassigned Sample Clinic', rep: '', cls: 'C', market: 'A', nextFollowUp: '2026-10-02', doctors: [{ id: 'u1d1', name: 'Dr. Example U' }] }];
  seed(cloud, { extraClinics: occ, missed: true });
  const parts = () => ev(() => {
    const t = s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
    return { docCards: t('#docCardsNudge'), occasions: t('#occasionsCard'), plan: t('#planList'), missed: t('#missedList'), due: t('#dueList'), tasks: t('#taskList'), recent: t('#recentVisits'),
      planSum: t('#msPlanSum'), dueSum: t('#msDueSum'), taskSum: t('#msTaskSum'), recentSum: t('#msRecentSum') };
  });
  await boot(M, 'rep', 390, 844);
  const own = await parts();
  check('Her phone, folded: the missed plan, the birthday today and the doctor cards to complete are named in the summaries, no tap needed',
    /1 missed/.test(own.planSum) && /1 birthday today/.test(own.taskSum) && /doctor cards? to complete/.test(own.taskSum) && /birthday TODAY/.test(own.occasions) && /Pearl/.test(own.missed), { planSum: own.planSum, taskSum: own.taskSum });
  await boot(G, 'supervisor', 390, 844); await person(M);
  const sup = await parts();
  const diff = Object.keys(own).filter(k => own[k] !== sup[k]).map(k => ({ k, phone: own[k].slice(0, 160), supervisor: sup[k].slice(0, 160) }));
  check('The supervisor\'s view of Mariam shows what her phone shows: doctor cards, occasions, plan, missed plans, follow-ups, tasks, visits and the summaries', diff.length === 0, diff);

  // ======================= a quick task on a person's screen =======================
  seed(cloud);
  await boot(G, 'supervisor', 1440, 900); await person(M);
  writes = [];
  await page.fill('#newTaskInput', 'Call Opal about the demo');
  await act(async () => { await addTask(); }); await sleep(250);
  const tk = await ev(() => tasks.filter(t => /Call Opal/.test(t.text)).map(t => t.rep));
  await boot(R, 'rep', 390, 844); await unfold();
  const rTasks = await txt('#taskList');
  await boot(M, 'rep', 390, 844); await unfold();
  const mTasks = await txt('#taskList');
  check('A quick task the supervisor adds on Mariam\'s screen is hers: saved for Mariam, on her phone, not on Renova\'s', tk.join() === 'Mariam' && /Call Opal about the demo/.test(mTasks) && !/Call Opal/.test(rTasks), { saved: tk, renova: rTasks.slice(0, 160), mariam: mTasks.slice(0, 160) });

  // ======================= what a rep's phone may show of others =======================
  seed(cloud, { cross: true, jointRenovaMariam: true, teamTask: true });
  const leakCheck = async (w, h, lang) => {
    await boot(M, 'rep', w, h, { lang }); await unfold();
    await act(() => document.querySelectorAll('#view-today details').forEach(d => { d.open = true; }));
    return ev(() => {
      const root = document.getElementById('view-today').cloneNode(true);
      const notice = [...root.querySelectorAll('.ms-cx')];
      notice.forEach(e => e.remove());
      const html = root.innerHTML;
      const figs = ['Renova', 'Dr. Ghaith'].map(r => bestMonthRevenue(r).amount.toFixed(2)).concat([teamTargetNow().goal.toFixed(2), teamTargetNow().ach.toFixed(2)]);
      const names = ['Renova', 'Ghaith', 'رانوفا', 'غيث'].filter(n => html.includes(n));
      const list = UMCore.crossInvoices(digestData());
      return { notice: notice.length, names, figs: figs.filter(f => html.includes(f)),
        noticeOk: list.filter(x => x.issuer === 'Mariam' || x.owner === 'Mariam').length === document.querySelectorAll('#targetCard .ms-cx details').length };
    });
  };
  const lk1 = await leakCheck(1440, 900, 'en'), lk2 = await leakCheck(390, 844, 'ar');
  check('A rep\'s phone, with invoices across two reps\' clinics, a joint visit Renova led (her 777 KD order) and a Team task: no other person\'s name or figure anywhere in the screen (hidden parts too), outside the cross-invoice notice',
    [lk1, lk2].every(x => x.notice === 1 && x.names.length === 0 && x.figs.length === 0), { en1440: lk1, ar390: lk2 });
  check('… and that notice (the owner\'s rule, v100) lists only invoices she issued or that count for her', lk1.noticeOk && lk2.noticeOk, { en1440: lk1.noticeOk, ar390: lk2.noticeOk });

  // ======================= thumb targets on the phone =======================
  const thumbs = () => ev(async () => {
    ['msPlanCard', 'msDueCard', 'msTaskCard', 'msRecentCard'].forEach(id => { const e = document.getElementById(id); if(e && !e.classList.contains('open')) msFold(id); });
    const sel = '#view-today .ms-ct .link, #view-today .ms-ct button, #view-today .ms-taskadd input, #view-today .ms-taskadd button, #view-today .ms-i, #view-today .ms-back, #view-today .ms-more, #view-today .ms-btn, #view-today .ms-item, #msSwitch button';
    const out = [];
    for(const e of [...document.querySelectorAll(sel)].filter(x => x.offsetParent !== null)){
      e.scrollIntoView({ block: 'center' }); await new Promise(r => requestAnimationFrame(r));
      const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const hits = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === e || e.contains(h)); };
      const tall = hits(cx, cy - 21.5) && hits(cx, cy + 21.5), wide = b.width >= 44 || (hits(cx - 21.5, cy) && hits(cx + 21.5, cy));
      if(!tall || !wide) out.push(`${(e.getAttribute('aria-label') || e.textContent || e.placeholder || e.className).trim().replace(/\s+/g, ' ').slice(0, 26)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    window.scrollTo(0, 0);
    return out;
  });
  seed(cloud, { missed: true });
  await boot(M, 'rep', 390, 844);
  const th1 = await thumbs();
  await boot(G, 'supervisor', 390, 844, { lang: 'ar' });
  const th2 = await thumbs();
  check('Phone 390: every control of the main screen (fold links, Months, the quick task, ⓘ, rows, buttons, the switch) has a 44 px hit area — her phone, and the supervisor\'s in Arabic', th1.length === 0 && th2.length === 0, { rep: th1, supervisorAr: th2 });

  // ======================= a negative in Arabic =======================
  seed(cloud, { negBrand: true });
  await boot(M, 'rep', 1440, 900, { lang: 'ar' });
  const left = await english();
  const neg = await ev(() => {
    const row = document.querySelector('#msBrands .ms-person[data-brand="curaprox"]');
    if(!row) return null;
    row.scrollIntoView({ block: 'center' });
    const charsX = el => { const tn = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for(let n = w.nextNode(); n; n = w.nextNode()) tn.push(n);
      const out = []; tn.forEach(n => { for(let i = 0; i < n.nodeValue.length; i++){ const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); if(b.width && n.nodeValue[i].trim()) out.push([n.nodeValue[i], b.left]); } });
      return out.sort((a, b) => a[1] - b[1]).map(x => x[0]).join(''); };
    return { pct: charsX(row.querySelector('.p')), sub: charsX(row.querySelector('.s')), rows: document.getElementById('msRows').textContent.replace(/\s+/g, ' ') };
  });
  check('Arabic, a brand that is a return this month: no English left (the phone rows too), and the minus stays to the left of its digits (-14%, -123.45), never after them',
    left.length === 0 && !!neg && /^-\d+%$/.test(neg.pct) && /-123\.45/.test(neg.sub) && !/123\.45-/.test(neg.sub), { left: left.slice(0, 10), neg });
  const howRep = await englishHow(['sales', 'visits', 'chart', 'brands', 'pcust']);
  // the team in Arabic: Renova's first month (left out of the comparison and the new customers), Dr. Ghaith with no target and his file to 6 Oct
  seed(cloud, { renovaNew: true }); setTargets(cloud, t => { delete t[G]; });
  { const P = filePeriods().map(p => p.id === 'f2026-10' ? p : Object.assign(p, { rows: p.rows.filter(r => r[8] !== SM[R]), repMap: { [SM[M]]: M, [SM[G]]: G } }));
    const oct = P.find(p => p.id === 'f2026-10'), rest = P.filter(p => p !== oct);
    setFiles(cloud, rest.concat([{ id: 'oct-mr', from: '2026-10-01', to: '2026-10-08', rows: oct.rows.filter(r => r[8] !== SM[G]), repMap: { [SM[M]]: M, [SM[R]]: R } },
      { id: 'oct-g', from: '2026-10-01', to: '2026-10-06', rows: oct.rows.filter(r => r[8] === SM[G] && r[0] <= '2026-10-06'), repMap: { [SM[G]]: G } }]), { [SM[M]]: M, [SM[G]]: G }); }
  await boot(G, 'supervisor', 1440, 900, { lang: 'ar' });
  const arTeam = await ev(() => { const D = UMCore.execDashboard(digestData(), { rep: 'all', reps: REPS.slice() }); return { mixed: D.sameDays.mixed, left: D.sameDays.left, blocked: D.newCustomers.blocked, noTarget: D.achievement.noTarget }; });
  await unfold();
  const leftTeam = await english(), howTeam = await englishHow(['sales', 'work', 'chart', 'brands', 'cust', 'act']);
  await person(R);
  const leftR = await english(), howR = await englishHow(['sales', 'visits', 'chart', 'pcust']);
  check('Arabic: the new words are Arabic too — the team (a person left out, no target, files to different days) and a person\'s screen, every ⓘ sheet included',
    arTeam.mixed && arTeam.left.join() === 'Renova' && arTeam.noTarget.join() === 'Dr. Ghaith' && arTeam.blocked.join() === 'Renova' && leftTeam.length === 0 && leftR.length === 0 && !Object.keys(howTeam).length && !Object.keys(howR).length && !Object.keys(howRep).length,
    { arTeam, leftTeam, leftR, howTeam, howR, howRep });

  // ======================= the person switch, long or many names =======================
  const cutAt = async (w) => { await page.setViewportSize({ width: w, height: 844 }); await sleep(150);
    return ev(() => ({ cut: [...document.querySelectorAll('#msSwitch button')].filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()), over: document.documentElement.scrollWidth > document.documentElement.clientWidth })); };
  seed(cloud);
  await boot(G, 'supervisor', 360, 780);
  const sw1 = await cutAt(360);
  seed(cloud, { extraRep: 'Sara Example' });
  await boot(G, 'supervisor', 390, 844);
  const sw2 = await cutAt(390), sw3 = await cutAt(360);
  check('The person switch never cuts a name: 3 people at 360 px, 4 at 390 and 360 px — and no page scroll', [sw1, sw2, sw3].every(x => x.cut.length === 0 && !x.over), { sw1, sw2, sw3 });

  // ======================= the clinic card's "Add to today's plan": one entry per clinic, with the time it was planned =======================
  seed(cloud);
  await boot(M, 'rep', 390, 844);
  const ap = await ev(async () => {
    const t = todayStr(), me = currentUser.name;
    dayPlans[t] = dayPlans[t] || {};
    const mine = clinics.filter(c => c.rep === me && c.cls !== 'Closed').map(c => c.id);
    const a = mine[0];
    dayPlans[t][me] = (dayPlans[t][me] || []).filter(e => planEntryId(e) !== a).concat([{ id: a, note: 'planned in the picker', at: Date.now() - 3600000 }]);
    const b = mine.find(id => id !== a && !dayPlans[t][me].some(e => planEntryId(e) === id));
    await addToPlan(a); await addToPlan(b);
    const list = dayPlans[t][me];
    return { a, b, countA: list.filter(e => planEntryId(e) === a).length, keptA: list.find(e => planEntryId(e) === a), countB: list.filter(e => planEntryId(e) === b).length, entryB: list.find(e => planEntryId(e) === b) };
  });
  check('Add to today\'s plan from the clinic card: a clinic already planned is not listed twice and keeps its note and time; a new one is stored with the time it was planned (as the plan picker stores it)',
    !!ap.b && ap.countA === 1 && !!ap.keptA && ap.keptA.note === 'planned in the picker' && ap.countB === 1 && !!ap.entryB && typeof ap.entryB === 'object' && typeof ap.entryB.at === 'number', ap);

  // ======================= a rep's phone at phone speed, a year of visits =======================
  seed(cloud, { yearVisits: true });
  await boot(M, 'rep', 390, 844);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const sp = await ev(async () => {
    await msWhenReady();
    const now = () => performance.now(), calls = { tt: 0, build: 0 };
    const tt = window.teamTargetNow; window.teamTargetNow = function(){ calls.tt++; return tt.apply(this, arguments); };
    const b = window.msBuild; window.msBuild = function(){ calls.build++; return b.apply(this, arguments); };
    const cached = []; for(let i = 0; i < 3; i++){ const t0 = now(); renderToday(); cached.push(now() - t0); }
    // a teammate's visit at her own clinic arrives with a refresh (her clinic's follow-up moves too, as a visit save does): nothing of Mariam's changes
    const c = clinics.find(x => x.id === 'r2'); const keep = { lv: c.lastVisit, nf: c.nextFollowUp };
    visits.push({ id: 'vteam', clinicId: 'r2', rep: 'Renova', date: '2026-10-08', ts: Date.now(), products: [], orderTaken: false, orderTotal: 0, doctorIds: [] }); c.lastVisit = '2026-10-08'; c.nextFollowUp = '2026-10-20';
    const t1 = now(); renderToday(); const teammate = now() - t1; await msWhenReady();
    const afterTeammate = { build: calls.build, tt: calls.tt };
    // her own visit: her figures are worked out again (after the screen is drawn)
    visits.push({ id: 'vmine', clinicId: 'm2', rep: 'Mariam', date: '2026-10-08', ts: Date.now(), products: [], orderTaken: false, orderTotal: 0, doctorIds: [] });
    const t2 = now(); renderToday(); const mine = now() - t2; await msWhenReady();
    visits.pop(); visits.pop(); c.lastVisit = keep.lv; c.nextFollowUp = keep.nf; renderToday(); await msWhenReady();
    window.teamTargetNow = tt; window.msBuild = b;
    return { visits: visits.length, cached: Math.round(Math.max(...cached)), teammate: Math.round(teammate), mine: Math.round(mine), afterTeammate, builds: calls.build, tt: calls.tt };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check('A rep\'s phone at phone speed (4× slower CPU), a year of visits: a teammate\'s change that touches nothing of hers works out none of her figures again, and her screen never works out a team total',
    sp.visits > 2000 && sp.afterTeammate.build === 0 && sp.tt === 0 && sp.builds >= 1, sp);
  check('… and the screen stays quick: a repaint and a teammate\'s change under 150 ms, her own change drawn under 300 ms (her figures follow just after)', sp.cached < 150 && sp.teammate < 150 && sp.mine < 300, sp);

  check('no page errors', errors.length === 0, errors.slice(0, 6));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
