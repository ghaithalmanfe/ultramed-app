// Stored-XSS guard (security review, 17 Nov). Everything the team types is data and must reach the DOM only as
// text or as a quoted attribute value — never as markup. The whole `products` document is writable by any team
// phone (a rep's "+ Add product" has no supervisor check), so a product's free-typed image URL is the sharpest
// probe: if it were put into src="…" unescaped, a crafted value would break out of the attribute and run on every
// teammate's Products screen. This harness seeds that value (as another phone would) and types one into the form,
// then opens the Products screen, a product's detail sheet and a clinic card, and checks nothing ran and nothing
// escaped its attribute. A text field (a clinic name) is the positive control: it was already escaped. Invented
// data only, a fake cloud, a fixed clock; nothing leaves localhost.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const PORT = 8304;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(WWW, u === '/' ? 'index.html' : u);
  if(!f.startsWith(WWW)){ res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if(e){ res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
const cloud = {};
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async e => { e.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 600) : '')); if(!ok) failed++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const G = 'Dr. Ghaith', M = 'Mariam';

// The probe is assembled from pieces so this file never holds a working one-liner. It sets a window flag if the
// browser ever runs it (an onerror on an <img> that cannot load), and would need to break out of src="…" to do so.
const MARK = '__xss_fired__';
const BREAKOUT = 'https://x/' + 'no.png" onerror="window.' + MARK + '=(window.' + MARK + '||0)+1" data-' + MARK + '="1';
const NESTED = '"><img src=y onerror="window.' + MARK + '=(window.' + MARK + '||0)+1">';

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext();
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
  await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(({ mark }) => {
    try{ window[mark] = 0; }catch(e){}
    // every request the page's own Content-Security-Policy blocks, for the check at the end
    window.__cspV = [];
    document.addEventListener('securitypolicyviolation', e => { window.__cspV.push(e.violatedDirective + ' ' + String(e.blockedURI || '').slice(0, 80)); });
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
      setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
    const off = new Date('2026-10-08T10:00:00').getTime() - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  }, { mark: MARK });

  // Another phone (any team login may write `products`) stored a product whose image URL is an attribute breakout,
  // and a clinic whose NAME carries markup (the text-context control).
  cloud.staff = JSON.stringify([{ name: M, role: 'rep', email: 'm@x.com' }, { name: G, role: 'supervisor', email: 'g@x.com' }]);
  cloud.clinics = JSON.stringify([{ id: 'a', name: 'Alpha ' + NESTED + ' Clinic', rep: M, cls: 'A', notes: NESTED, contact: NESTED,
    doctors: [{ id: 'd1', name: 'Dr. ' + NESTED, title: 'Dentist' }] }]);
  cloud.products = JSON.stringify([
    { id: 'p1', name: 'Clean Brush', brand: 'Philips', price: 49, img: BREAKOUT },
    { id: 'p2', name: 'Plain ' + NESTED, brand: 'TePe' + NESTED, price: 9 }]);
  cloud.targets = '{}'; cloud.events = '[]'; cloud.visits = '[]'; cloud.tasks = '[]'; cloud.dayPlans = '{}';
  cloud.benchmarks = JSON.stringify({ coverage: 70, priority: 90, conversion: 25, tasks: 85 });

  await page.goto(`http://localhost:${PORT}/index.html`);
  await sleep(300);
  await page.evaluate(async ({ g }) => { await selectUser(g, 'supervisor'); }, { g: G });
  await sleep(1200);

  // each probe starts from a clean slate (the flag is a cumulative counter, nodes from the last render removed)
  const reset = () => page.evaluate(({ mark }) => { window[mark] = 0; document.querySelectorAll('[data-' + mark + ']').forEach(n => n.remove()); }, { mark: MARK });

  // 1) Products screen: the seeded malicious img must stay inside its src attribute, and nothing must run.
  await page.evaluate(() => { closeModal(); switchView('products'); });
  await reset(); await page.evaluate(() => renderProducts()); await sleep(600);
  const prod = await page.evaluate(({ mark }) => ({ fired: window[mark] || 0, anyMarkAttr: !!document.querySelector('#productListWrap [data-' + mark + ']') }), { mark: MARK });
  check('Products screen: a stored product image URL cannot break out of src="…" and run', prod.fired === 0 && !prod.anyMarkAttr, prod);

  // 2) Product detail sheet (the big image) — same stored value, same guarantee.
  await reset();
  await page.evaluate(() => { const p = products.find(x => x.id === 'p1'); openProductDetail(productKey(p)); });
  await sleep(600);
  const detail = await page.evaluate(({ mark }) => ({ fired: window[mark] || 0, anyMarkAttr: !!document.querySelector('#modalInner [data-' + mark + ']') }), { mark: MARK });
  check('Product detail sheet: the big product image cannot break out of src="…" and run', detail.fired === 0 && !detail.anyMarkAttr, detail);

  // 3) A clinic card: the name, notes, contact and doctor name are the text-context control — already escaped.
  await reset();
  await page.evaluate(() => { closeModal(); switchView('clinics'); openClinicDetail('a'); });
  await sleep(500);
  const clinic = await page.evaluate(({ mark }) => ({ fired: window[mark] || 0, anyMark: !!document.querySelector('#modalInner [data-' + mark + ']'),
    nameText: (document.querySelector('#modalInner .clinic-name, #modalInner h3') || {}).textContent || '' }), { mark: MARK });
  check('Clinic card: a clinic name / notes / doctor name with markup renders as text, nothing runs', clinic.fired === 0 && !clinic.anyMark, clinic);

  // 4) Add a product through the form with a non-http(s) image URL: it is not stored as a live value.
  await reset();
  await page.evaluate(() => { closeModal(); switchView('products'); openAddProduct(); });
  await sleep(200);
  await page.evaluate(({ breakout }) => {
    document.getElementById('mProdName').value = 'Guard Test Product';
    document.getElementById('mProdBrand').value = 'Curaprox';
    document.getElementById('mProdImg').value = breakout;
  }, { breakout: BREAKOUT });
  await page.evaluate(() => submitAddProduct());
  await sleep(300);
  const added = await page.evaluate(({ mark }) => {
    const p = (typeof products !== 'undefined' ? products : []).find(x => x.name === 'Guard Test Product');
    return { fired: window[mark] || 0, saved: !!p, img: p ? (p.img == null ? null : String(p.img)) : 'MISSING',
      anyMarkAttr: !!document.querySelector('[data-' + mark + ']') };
  }, { mark: MARK });
  check('Add product form: a non-http(s) / markup image URL is rejected, not stored as a live value', added.fired === 0 && (added.img == null || !/["<>]|onerror/.test(added.img)), added);

  // 5) The weekly deck reads a visit photo's inline preview (a data: URL, the thumbnail kept on the visit) with
  //    fetch() when the full photo is not on the phone (wdFetchBlob). The page's security policy must let that
  //    through: a connect-src without data: made every such photo vanish from the deck, silently.
  const deckImg = await page.evaluate(async () => {
    const png = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    try{ const r = await wdPhoto(png, 2000, 100); return { ok: !!(r && r.data), w: r ? r.w : null }; }catch(e){ return { ok: false, err: String(e) }; }
  });
  check('Weekly deck: a visit photo kept as its inline preview (data:) still loads under the page\'s security policy', deckImg.ok, deckImg);

  // 6) The sign-in system (security review, item 1): with Firebase's e-mail enumeration protection on (the default
  //    for projects made since September 2023, and the review's advice), a wrong password comes back as
  //    auth/invalid-credential, not auth/wrong-password. Change password must still say the current one is wrong.
  const cp = await page.evaluate(async () => {
    const shown = []; const _t = window.showToast; window.showToast = m => { shown.push(m); };
    const _fb = window.firebase;
    window.firebase = { auth: Object.assign(() => ({ currentUser: {
      reauthenticateWithCredential: async () => { const e = new Error('invalid'); e.code = 'auth/invalid-credential'; throw e; },
      updatePassword: async () => {} } }), { EmailAuthProvider: { credential: () => ({}) } }) };
    try{
      openChangePassword();
      document.getElementById('cpCurrent').value = 'not-the-password';
      document.getElementById('cpNew').value = 'another-password-1';
      document.getElementById('cpConfirm').value = 'another-password-1';
      await submitChangePassword();
    }catch(e){ shown.push('threw: ' + e.message); }
    finally{ window.firebase = _fb; window.showToast = _t; try{ closeModal(); }catch(e){} }
    return shown;
  });
  check('Change password: a wrong current password is said as such, also under e-mail enumeration protection', cp.includes('Current password is incorrect'), cp);

  const csp = await page.evaluate(() => window.__cspV || []);
  check('nothing the app itself asked for was blocked by its own security policy', csp.length === 0, csp.slice(0, 6));

  check('no page or console error while rendering the probes', errors.length === 0, errors.slice(0, 6));

  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
