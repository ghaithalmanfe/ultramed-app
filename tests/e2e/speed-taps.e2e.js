// How soon every view and the main sheets are painted after their tap (the owner, 16 Nov: "astronomically
// fast, with no problems"), on a heavy year of invented data (fixtures/heavy-year.js: 300 clinics, 919
// doctors, 3,631 visits, 20,903 sales lines, 520 tasks) — the supervisor and a rep, on a PHONE (390x844, the
// CPU 4x slower through CDP) and a LAPTOP (1440x900). The steps are the integration sweep's
// (tools/sweep-steps.js, the list phone-layout.e2e.js lays out). A step's time runs from the tap (its
// handler called, as the button's onclick does) to the frame painted after it: the handler's work, its
// promise when it returns one, the home figures when the step ends on the home screen (msWhenReady), then two
// animation frames. Nothing leaves localhost; the cloud answers at once (the time measured is the phone's own
// work), the clock is fixed, the 20-second round is driven by hand (never mid-step).
// Checks: every step runs without an error, no page or console error; and T1 (fails on 8f2dd7e, the start-up speed
// review's commit): on the 4x phone the taps that took seconds there — a clinic's card 24.5 s, the clinic sales
// analysis 21.8 s, a doctor's profile 12.9 s, a clinic picked in Log a visit 11.3 s, the management report 12.9 s, the
// Report 8.5 s, month by month 6.9 s … (every ERP line's customer matched against every clinic again, the month's lines
// worked out again for each figure, every doctor going over every visit of the year) — paint within a budget a few
// times what they take now, so a slower machine still passes and a return of the old work fails.
// Steps "chat" and "memories" wait 900 ms by themselves (the sweep's screenshot staging): the "team" step is the tap.
// Env: PROFILES=phone,laptop (default phone)  ONLY=sup|rep  STEPS=a,b,c (names)  OUT=<dir> (speed-taps.json)
//      REPEAT=n (median)  HEAVY_SCALE=x  WWW=<dir>  NOCHECK=1 (the table only: a before/after run on another checkout)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const { STEPS } = require('./tools/sweep-steps.js');
const PORT = 8285;
const FIX = require('./fixtures/heavy-year.js').build({ scale: +process.env.HEAVY_SCALE || 1 });
const CLOCK = Date.parse(FIX.now);
const PROFILES = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4 }, laptop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, cpu: 1 } };
const PROFS = (process.env.PROFILES || 'phone').split(',').filter(p => PROFILES[p]);
const PEOPLE = process.env.ONLY === 'rep' ? [['Mariam', 'rep']] : process.env.ONLY === 'sup' ? [['Dr. Ghaith', 'supervisor']] : [['Dr. Ghaith', 'supervisor'], ['Mariam', 'rep']];
const ONLY_STEPS = process.env.STEPS ? new Set(process.env.STEPS.split(',')) : null;
const REPEAT = Math.max(1, +process.env.REPEAT || 1);
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : null;
const NOCHECK = process.env.NOCHECK === '1';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); });
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 1200) : '')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
// T1's budgets on the 4x phone (ms, tap → painted). 8f2dd7e (supervisor / rep): clinic-card 24,508 / 23,650, clanalysis
// 21,780 / 20,406, analysis 21,654 / 21,138, doctor-profile 12,922 / 12,614, log-filled 11,339 / 11,012, pro-report
// 12,929 / 8,081, reports 8,515 / 2,595, report-chart 7,974 / 2,460, report-coach 8,260 / 2,438, report-score 8,258 /
// 2,495, month-by-month 6,924 / 4,233, dsr-upload 3,670, admin-team 2,417, erp-preview 2,079, coverage 1,623,
// admin-territory 1,241, recycle-bin 1,118, kpi-person 1,169 / 628
const BUDGET = { 'clinic-card': 2500, clanalysis: 3000, analysis: 3000, 'doctor-profile': 1500, 'log-filled': 1500, 'pro-report': 2000, reports: 1500,
  'report-chart': 1500, 'report-coach': 1500, 'report-score': 1500, 'month-by-month': 2500, 'dsr-upload': 1500, 'admin-team': 1000, 'erp-preview': 1500,
  coverage: 1200, 'admin-territory': 800, 'recycle-bin': 800, 'kpi-person': 900 };
// A slower machine (a CI runner) is told apart from slower code: each phone first times a fixed piece of work (JSON.parse
// of its clinics and visits, twice; the median of 9) and the budgets grow by how much slower than here it is (CAL_REF:
// this machine's 4x phone, 46–56 ms), never shrink, at most 4 times — 8f2dd7e stays over them on the same machine.
const CAL_REF = 50;

let cloud = new Map();
const api = {
  get: async k => cloud.has(k) ? cloud.get(k) : null,
  set: async (k, v) => { cloud.set(k, v); return true; },
  setMany: async e => { e.forEach(([k, v]) => cloud.set(k, v)); return true; },
  del: async k => { cloud.delete(k); return true; },
  list: async p => [...cloud.keys()].filter(k => k.startsWith(p)),
};

async function device(browser, profName, who, role){
  const prof = PROFILES[profName];
  cloud = new Map(Object.entries(FIX.docs));
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, locale: 'en-US', timezoneId: 'Asia/Kuwait' });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set); await page.exposeFunction('__cDel', api.del);
  await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(({ clock, staff }) => {
    try{ localStorage.setItem('ultramed_staff_cache', staff); }catch(e){}
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
      setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
      update: async (k, fn) => { const cur = await window.__cGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } };
    const off = clock - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    window.__lt = []; try{ new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([e.startTime, e.duration]))).observe({ entryTypes: ['longtask'] }); }catch(e){}
    // work counters (T1, T2): visits looked at by doctorAnalytics, and dates formatted
    window.__work = { daVisits: 0, daCalls: 0, dates: 0 };
    const wrapCore = () => {
      if(!window.UMCore || window.__coreWrapped) return; window.__coreWrapped = true;
      const da = UMCore.doctorAnalytics;
      UMCore.doctorAnalytics = function(opts){ window.__work.daCalls++; return da.apply(this, arguments); };
      const tl = Date.prototype.toLocaleDateString;
      Date.prototype.toLocaleDateString = function(){ window.__work.dates++; return tl.apply(this, arguments); };
    };
    document.addEventListener('DOMContentLoaded', wrapCore);
  }, { clock: CLOCK, staff: FIX.docs.staff });
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  await page.evaluate(async ({ who, role }) => { await selectUser(who, role); await msWhenReady(); }, { who, role });
  await sleep(1500);
  await page.evaluate(() => msWhenReady());
  const cal = await page.evaluate(() => { const s = JSON.stringify({ c: clinics, v: visits }), ts = [];
    for(let i = 0; i < 9; i++){ const t = performance.now(); for(let j = 0; j < 2; j++) JSON.parse(s); ts.push(performance.now() - t); }
    ts.sort((a, b) => a - b); return Math.round(ts[4]); });
  return { ctx, page, cdp, errors, cal };
}

// one step, timed in the page: tap → its work (and promise) → the home figures if it ends there → painted
async function timeStep(page, st){
  return page.evaluate(async st => {
    try{ closeModal(); const lb = document.getElementById('lightbox'); if(lb) lb.classList.remove('show'); try{ hideProReport(); }catch(e){} }catch(e){}
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 30));
    window.__lt.length = 0;
    const w0 = Object.assign({}, window.__work);
    const t0 = performance.now();
    let err = null;
    try{
      if(st.view){ closeModal(); switchView(st.view); scrollTo(0, 0); }
      if(st.js){ const r = (0, eval)(st.js); if(r && typeof r.then === 'function') await r; }
      if(typeof activeView !== 'undefined' && activeView === 'today' && typeof msWhenReady === 'function') await msWhenReady();
    }catch(e){ err = String(e && e.message || e).slice(0, 160); }
    const t1 = performance.now();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t2 = performance.now();
    const lt = window.__lt.filter(l => l[0] >= t0 - 1);
    const sheet = document.getElementById('modalBack').classList.contains('show');
    const box = sheet ? document.getElementById('modalInner') : document.querySelector('.view.active');
    const text = box ? box.innerText.replace(/\s+/g, ' ').trim() : '';
    const w = window.__work;
    return { ms: Math.round(t2 - t0), work: Math.round(t1 - t0), maxLong: Math.round(lt.reduce((m, l) => Math.max(m, l[1]), 0)), sheet, err, text,
      daCalls: w.daCalls - w0.daCalls, dates: w.dates - w0.dates, wait: !!document.querySelector('.view.active .ms-wait') };
  }, st);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const table = {}; // step → config → { ms, … }
  const cfgs = [], cals = {};
  for(const profName of PROFS){
    for(const [who, role] of PEOPLE){
      const cfg = `${profName} ${role === 'supervisor' ? 'sup' : 'rep'}`; cfgs.push(cfg);
      const d = await device(browser, profName, who, role); cals[cfg] = d.cal;
      for(const st of STEPS){
        if(st.gate || (st.sup && role !== 'supervisor')) continue;
        if(ONLY_STEPS && !ONLY_STEPS.has(st.name)) continue;
        const runs = [];
        for(let i = 0; i < REPEAT; i++) runs.push(await timeStep(d.page, st));
        if(st.wait) await sleep(Math.min(st.wait, 1500));
        const r = runs[0]; r.ms = median(runs.map(x => x.ms)); r.work = median(runs.map(x => x.work));
        r.hash = crypto.createHash('sha1').update(r.text).digest('hex').slice(0, 10); r.chars = r.text.length; delete r.text;
        (table[st.name] = table[st.name] || {})[cfg] = r;
        process.stdout.write(r.err ? 'x' : '.');
      }
      // a 20-second round between the views: never mid-step (the round is the harness's)
      check(`${cfg}: no page or console error over the sweep`, !d.errors.length, d.errors.slice(0, 6));
      await d.ctx.close();
    }
  }
  console.log('');
  // the table: tap → ms per configuration
  const names = Object.keys(table);
  console.log(`\ntap → painted (ms) on the heavy year · ${cfgs.join(' | ')}`);
  names.forEach(n => console.log(`${n.padEnd(16)} ${cfgs.map(c => { const r = table[n][c]; return r ? String(r.ms).padStart(6) + (r.err ? '!' : ' ') : '     —'; }).join(' ')}`));
  if(OUT){ fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'speed-taps.json'), JSON.stringify({ www: WWW, cfgs, table }, null, 1)); }
  const errs = []; names.forEach(n => cfgs.forEach(c => { const r = table[n][c]; if(r && r.err) errs.push(`${n} (${c}): ${r.err}`); }));
  check('every step of the sweep ran without an error', !errs.length, errs.slice(0, 8));
  if(!NOCHECK && PROFS.includes('phone')){
    const over = [], measured = [], factors = {};
    cfgs.filter(c => c.startsWith('phone')).forEach(c => {
      const f = factors[c] = Math.round(Math.max(1, Math.min(4, (cals[c] || CAL_REF) / CAL_REF)) * 100) / 100;
      names.forEach(n => { const b0 = BUDGET[n], r = table[n][c]; if(!b0 || !r) return; const b = Math.round(b0 * f); measured.push(n); if(r.ms > b) over.push(`${n} (${c}) ${r.ms} ms > ${b}`); });
    });
    check(`T1: on the 4x phone the taps that took seconds on 8f2dd7e paint within their budget (${measured.length} taps measured; this machine's phone ${cfgs.filter(c => c.startsWith('phone')).map(c => `${c} ${cals[c]} ms → budgets ×${factors[c]}`).join(', ')})`, measured.length > 0 && !over.length, over);
  }
  console.log('\n' + results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
