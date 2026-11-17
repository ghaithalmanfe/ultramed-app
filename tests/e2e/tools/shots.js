#!/usr/bin/env node
// Screenshots of the real app for the redesign — NOT a harness (it checks nothing and never runs in
// `npm run e2e`: only tests/e2e/*.e2e.js files do). It serves a checkout's www/ (or dist/) with the
// harnesses' fake cloud, a fixed clock (Thursday 8 October 2026, 10:00) and the INVENTED main-screen
// fixture (tests/e2e/fixtures/main-screen-data.js: Mariam and Renova, reps; Dr. Ghaith, the supervisor
// who sells; 17 sample clinics, 12 months of made-up sales lines). Nothing real is used, nothing leaves
// localhost (every other request is aborted, as in the harnesses).
//
// For each language × width it signs in once, then for each step opens a view or runs a snippet, saves
// a PNG and writes what is off on that page:
//   - horizontal overflow (wider than the width the page was opened at — a phone widens its layout
//     viewport to such content) and the elements that reach past it (outside any scroll box of their own),
//   - tap targets under 44 px on widths ≤ 600 (a ::before/::after hit area counts; a checkbox is measured
//     by its label; pointer-events:none takes no taps) — tools/audit.js,
//   - targets in view that something else lies over (phone), page errors and console errors.
// Usage (from the checkout):
//   node tests/e2e/tools/shots.js --out <dir> [--www www|dist|<path>] [--as supervisor|rep|<name>]
//        [--views today,log,clinics,…] [--step "name=js snippet"]… [--steps steps.json]
//        [--widths 360,390,768,1024,1440] [--langs en,ar] [--dpr 1|2] [--viewport-only]
//        [--seed cross,missed,…] [--height 900] [--gate] [--port 0] [--settle 2400]
// (--settle: milliseconds to wait after the sign-in, so the start-up toast is gone from the pictures)
// Steps: a view name (today log clinics calendar reports more products playbook team clanalysis doctors)
// switches to that view; "gate" shoots the sign-in screen; "name=js" runs the snippet (awaited) and
// shoots what it opened (a sheet: the viewport, else the whole page). A steps file is a JSON array of
// { "name": "clinic-card", "view": "clinics", "js": "openClinicDetail('m1')", "wait": 300, "full": false }.
// Output: <out>/<lang>-<width>-<as>-<step>.png, <out>/report.json (every page) and <out>/report.txt.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const opt = { steps: [] };
for(let i = 0; i < args.length; i++){
  const a = args[i], v = () => args[++i];
  if(a === '--www') opt.www = v();
  else if(a === '--out') opt.out = v();
  else if(a === '--as') opt.as = v();
  else if(a === '--views') opt.views = v();
  else if(a === '--step') opt.steps.push(v());
  else if(a === '--steps') opt.stepsFile = v();
  else if(a === '--widths') opt.widths = v();
  else if(a === '--langs') opt.langs = v();
  else if(a === '--dpr') opt.dpr = Number(v());
  else if(a === '--viewport-only') opt.viewportOnly = true;
  else if(a === '--seed') opt.seed = v();
  else if(a === '--height') opt.height = Number(v());
  else if(a === '--gate') opt.gate = true;
  else if(a === '--port') opt.port = Number(v());
  else if(a === '--settle') opt.settle = Number(v());
  else if(a === '--help' || a === '-h'){ console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 27).join('\n')); process.exit(0); }
  else { console.error('unknown option ' + a); process.exit(2); }
}
if(!opt.out){ console.error('--out <dir> is required (try --help)'); process.exit(2); }
const CHECKOUT = path.resolve(__dirname, '..', '..', '..');
const WWW = path.resolve(opt.www ? (fs.existsSync(path.resolve(opt.www)) ? opt.www : path.join(CHECKOUT, opt.www)) : (process.env.WWW || path.join(CHECKOUT, 'www')));
process.env.WWW = WWW;   // the fixture loads core.js from the app under test
const { launchOpts, blockFirebase } = require('../_env.js');
const { G, M, R, seed } = require('../fixtures/main-screen-data.js');
const OUT = path.resolve(opt.out); fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = (opt.widths || '390,1440').split(',').map(Number).filter(Boolean);
const LANGS = (opt.langs || 'en').split(',').map(s => s.trim()).filter(Boolean);
const WHO = !opt.as || opt.as === 'supervisor' ? G : opt.as === 'rep' ? M : opt.as;
const ROLE = WHO === G ? 'supervisor' : 'rep';
const TAG = (WHO === G ? 'sup' : WHO === M ? 'rep' : WHO).replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
const VIEWS = ['today', 'log', 'clinics', 'calendar', 'reports', 'more', 'products', 'playbook', 'team', 'clanalysis', 'doctors'];
const steps = [];
if(opt.gate) steps.push({ name: 'gate', gate: true });
(opt.views || (opt.steps.length || opt.stepsFile ? '' : 'today')).split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
  if(s === 'gate') steps.push({ name: 'gate', gate: true });
  else if(VIEWS.includes(s)) steps.push({ name: s, view: s });
  else { console.error('unknown view ' + s + ' (use --step "name=js" for a snippet)'); process.exit(2); }
});
opt.steps.forEach(s => { const k = s.indexOf('='); steps.push(k > 0 ? { name: s.slice(0, k).trim(), js: s.slice(k + 1) } : { name: s.replace(/\W+/g, '-'), js: s }); });
if(opt.stepsFile) JSON.parse(fs.readFileSync(opt.stepsFile, 'utf8')).forEach(s => steps.push(s));
const seedOpts = {}; (opt.seed || '').split(',').map(s => s.trim()).filter(Boolean).forEach(k => { seedOpts[k] = true; });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.css': 'text/css', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
const heightFor = w => opt.height || (w <= 600 ? 844 : w < 1024 ? 1024 : 900);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// what is off on the page as it stands (runs in the page): tools/audit.js, the same rules phone-layout.e2e.js checks
const { audit } = require('./audit.js');

(async () => {
  await new Promise(r => server.listen(opt.port || 0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch(launchOpts());
  const cloud = {};
  const api = {
    get: async k => k in cloud ? cloud[k] : null,
    set: async (k, v) => { cloud[k] = v; return true; },
    setMany: async e => { e.forEach(([k, v]) => { cloud[k] = v; }); return true; },
    del: async k => { delete cloud[k]; return true; },
    list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  };
  const report = [];
  for(const lang of LANGS){
    for(const w of WIDTHS){
      seed(cloud, seedOpts);   // every language × width starts from the same invented data
      const phone = w <= 600, h = heightFor(w);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opt.dpr || 1, isMobile: phone, hasTouch: phone });
      await blockFirebase(ctx);
      await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
      page.on('dialog', d => d.dismiss().catch(() => {}));
      await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
      await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
      await page.addInitScript(({ lang, staff }) => {
        try{ localStorage.setItem('ultramed_lang', lang); localStorage.setItem('ultramed_staff_cache', staff); }catch(e){}
        window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
          setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
        const off = new Date('2026-10-08T10:00:00').getTime() - Date.now();
        const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      }, { lang, staff: cloud.staff });
      await page.goto(`http://localhost:${PORT}/index.html`);
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await sleep(300);
      let signedIn = false;
      for(const st of steps){
        if(!st.gate && !signedIn){
          await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who: WHO, role: ROLE });
          await sleep(opt.settle != null ? opt.settle : 2400); signedIn = true;
        }
        if(st.view) await page.evaluate(v => { closeModal(); switchView(v); scrollTo(0, 0); }, st.view).catch(e => errors.push('step ' + st.name + ': ' + e.message.split('\n')[0]));
        if(st.pre) await page.evaluate(async js => { const r = (0, eval)(js); if(r && typeof r.then === 'function') await r; }, st.pre).catch(e => errors.push('step ' + st.name + ' (pre): ' + e.message.split('\n')[0]));
        if(st.js) await page.evaluate(async js => { const r = (0, eval)(js); if(r && typeof r.then === 'function') await r; }, st.js).catch(e => errors.push('step ' + st.name + ': ' + e.message.split('\n')[0]));
        await page.evaluate(() => typeof msWhenReady === 'function' ? msWhenReady() : null).catch(() => {});
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        await sleep(st.wait || 250);
        await page.waitForFunction(() => !document.querySelector('#toast.show'), null, { timeout: 4000 }).catch(() => {});   // a toast of the step itself: wait it out
        await sleep(300);
        const sheet = await page.evaluate(() => !!document.querySelector('#modalBack.show, .lightbox.show'));
        const full = st.full != null ? !!st.full : !opt.viewportOnly && !sheet;
        const file = `${lang}-${w}-${TAG}-${st.name}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: full });
        const a = await page.evaluate(audit, { phone, width: w });
        report.push({ file, lang, width: w, as: WHO, step: st.name, sheet, overflow: a.scrollWidth > a.vw, scrollWidth: a.scrollWidth, wide: a.wide.slice(0, 30), small: a.small.slice(0, 60), covered: (a.covered || []).slice(0, 30), errors: errors.splice(0) });
        if(sheet) await page.evaluate(() => { closeModal(); const lb = document.getElementById('lightbox'); if(lb) lb.classList.remove('show'); }).catch(() => {});
        process.stdout.write('.');
      }
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const lines = report.map(r => `${r.overflow || r.wide.length || r.errors.length ? '!!' : 'ok'} ${r.file}${r.overflow ? `  OVERFLOW ${r.scrollWidth}>${r.width}` : ''}${r.wide.length ? `  wide: ${r.wide.slice(0, 4).join(' | ')}` : ''}${r.small.length ? `  small targets (${r.small.length}): ${r.small.slice(0, 6).join(' | ')}` : ''}${r.covered.length ? `  covered (${r.covered.length}): ${r.covered.slice(0, 4).join(' | ')}` : ''}${r.errors.length ? `  ERRORS: ${r.errors.join(' | ')}` : ''}`);
  fs.writeFileSync(path.join(OUT, 'report.txt'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
  console.log(`\n${report.length} screenshots in ${OUT}`);
  await browser.close(); server.close();
})().catch(e => { console.error('shots failed:', e); process.exit(1); });
