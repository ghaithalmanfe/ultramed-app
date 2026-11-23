// The supervisor's sales card "The sales figures are from this device's copy" (the owner's report of 19 Nov: it stayed
// up a long time and said nothing more). The card says what keeps it up, gives a way to try again now and says when that
// last ended without the cloud — in professional words, in English and in Arabic (the owner, 22 Nov: never "جرّب هلّق").
// Each check fails on 326a9df but the guards (C0, C8, "no page errors"):
//   C0  setup: the phone kept its copies at an online start; reopened while the cloud's sales read fails, the card is up
//   C1  the card says the cloud could not be read, that the app tries again by itself every 20 seconds, and offers
//       "Retry now" (until now: "The cloud was not read when the app opened", nothing else, no button)
//   C2  Retry now while the cloud still fails: the button says "Retrying…" and cannot be tapped twice, then the card
//       says "Last attempt: <time> — not completed." (the time in the screen's own format)
//   C3  still up 2 minutes after it first showed: "Still not updated after 2 minutes — check this device's internet
//       connection." (a timer is armed for it); this device offline: said at once instead
//   C4  the same card in Arabic: «إعادة المحاولة الآن» and every line in Arabic, no English left
//   C5  in English: no Arabic letter in the card
//   C6  the cloud answers again: Retry now reads it, the card goes and the toast says the figures are the cloud's
//   C7  sales changes this device has not saved (the supervisor's): the card says so, never "tries again by itself",
//       and Retry now saves them first — saved, the card goes
//   C8  guard: a 20-second round that reads the cloud again takes the card away by itself, even when nothing else on
//       the screen changes (erpNudgeSync)
// The clock is fixed (Wed 11 Nov 2026, 13:30, ticking). Port 8306. Env: WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8306, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const cloud = {};
const mode = { failGet: null, failSet: null, slowGet: null };
const api = {
  get: async k => { if(mode.slowGet && mode.slowGet.test(k)) await new Promise(r => setTimeout(r, 900)); if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get ' + k); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set ' + k); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith', MS = 'Mariam Sample', RS = 'Ranova Sample Person';
const row = (d, doc, cust, net, sm) => [d, doc, 0, 'Waterpik Cordless Plus', 1, net, net, 0, sm, 'Waterpik', cust, 'Clinics', 0, ''];
const C = (id, name, rep, x) => Object.assign({ id, name, rep, cls: 'B', doctors: [] }, x || {});
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  Object.keys(mode).forEach(k => { mode[k] = null; });
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([C('m1', 'Amberline Clinic', M), C('r1', 'Fernhill Center', R)]
    .concat(Array.from({ length: 14 }, (_, i) => C('f' + (i + 1), 'Filler Clinic ' + (i + 1), i % 2 ? R : M))));
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.erpMap = '{}';
  cloud.targets = JSON.stringify({ [M]: { revenue: 10000, month: '2026-11' }, [R]: { revenue: 2000, month: '2026-11' } });
  const rows = [row('2026-11-03', 'S-1', 'Amberline Clinic', 300, MS), row('2026-11-04', 'S-2', 'Fernhill Center', 200, RS)];
  const period = { id: 'p1', from: '2026-11-01', to: '2026-11-10', repMap: { [MS]: M, [RS]: R }, rows, rowCount: rows.length, net: 500 };
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: { [MS]: M, [RS]: R }, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, periods: [period] });
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
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
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
    let off = new Date(2026, 10, 11, 13, 30, 0).getTime() - Date.now();
    window.__addTime = ms => { off += ms; };
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    // the 20-second round driven by hand
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = () => fn(); return -1; } return _si(fn, ms, ...a); };
  });
  const settle = () => page.evaluate(async () => { if(typeof msWhenReady === 'function') await msWhenReady(); for(let i = 0; i < 100 && _localSaving > 0; i++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 150)); });
  const signIn = async () => { await page.evaluate(async who => { await selectUser(who, 'supervisor'); }, G); await page.waitForTimeout(350); await settle(); await page.evaluate(() => { closeModal(); switchView('today'); }); await page.waitForTimeout(150); };
  // the sales card about this device's copy, as the screen shows it
  const card = () => page.evaluate(() => {
    const el = document.getElementById('erpNudge');
    if(!el || el.style.display === 'none') return null;
    const c = [...el.querySelectorAll('.card')].find(x => /device's copy|نسخة هذا الجهاز/.test(x.textContent));
    if(!c) return null;
    const b = c.querySelector('button');
    return { text: c.innerText.replace(/\s+/g, ' ').trim(), btn: b ? b.textContent.trim() : null, disabled: b ? !!b.disabled : null };
  });
  const tapRetry = () => page.evaluate(() => {
    const c = [...document.querySelectorAll('#erpNudge .card')].find(x => /device's copy|نسخة هذا الجهاز/.test(x.textContent));
    const b = c && c.querySelector('button'); if(!b) return false; b.click(); return true;
  });
  const retryDone = () => page.evaluate(async () => { for(let i = 0; i < 200 && typeof _erpCopyTry !== 'undefined' && _erpCopyTry; i++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 200)); });
  try{
    seed();
    // an online start: the phone keeps its copies (the sales files with their rows)
    await page.goto(URL); await page.waitForTimeout(150);
    await page.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
    await page.goto(URL); await page.waitForTimeout(250);
    await signIn();
    // reopened while the cloud's sales read fails (no early open: the person this phone last signed in is forgotten)
    mode.failGet = /^erpSales$/;
    await page.evaluate(() => { try{ localStorage.removeItem('um_lastUser'); }catch(e){} });
    await page.goto(URL); await page.waitForTimeout(250);
    await signIn();
    let k = await card();
    check('C0 setup: reopened while the cloud\'s sales read fails, the card "from this device\'s copy" is up', !!k, k);

    k = await card();
    check('C1 the card says the cloud could not be read, that the app tries again by itself every 20 seconds, and offers "Retry now"',
      !!k && /The cloud could not be read/.test(k.text) && /The app tries again by itself every 20 seconds while it is open\./.test(k.text) && k.btn === 'Retry now' && !/when the app opened/.test(k.text), k);

    // C2 — Retry now while the cloud still fails (its answer takes a moment: the card is read meanwhile)
    mode.slowGet = /^erpSales$/;
    let tapped = await tapRetry();
    await page.waitForTimeout(150);
    const during = tapped ? await card() : null;
    await retryDone();
    mode.slowGet = null;
    k = await card();
    check('C2 Retry now while the cloud still fails: "Retrying…" (not tappable twice), then "Last attempt: <time> — not completed."',
      tapped && !!during && during.btn === 'Retrying…' && during.disabled === true && !!k && /Last attempt: \d{2}:\d{2} — not completed\./.test(k.text) && k.btn === 'Retry now',
      { tapped, during, after: k });

    // C3 — two minutes after the card first showed (the timer armed for it fires: drawn here by hand), and offline
    const armed = await page.evaluate(() => typeof _erpCopyTimer !== 'undefined' && !!_erpCopyTimer);
    await page.evaluate(() => { window.__addTime(121000); renderErpNudge(); });
    const late = await card();
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get(){ return false; }, configurable: true }); renderErpNudge(); });
    const off = await card();
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get(){ return true; }, configurable: true }); renderErpNudge(); });
    check('C3 still up after 2 minutes: "check this device\'s internet connection" (a timer armed for it); offline: said at once',
      armed && !!late && /Still not updated after 2 minutes — check this device's internet connection\./.test(late.text)
      && !!off && /This device is offline/.test(off.text), { armed, late, off });

    // C5 — English (C4, Arabic, comes last: going back to English reloads the page, setUiLang)
    const en = await card();
    check('C5 in English: no Arabic letter in the card', !!en && !/[\u0600-\u06FF]/.test(en.text), en);

    // C6 — the cloud answers again: Retry now
    mode.failGet = null;
    tapped = await tapRetry();
    await retryDone();
    k = await card();
    const toast = await page.evaluate(() => document.getElementById('toast').textContent);
    check('C6 the cloud answers again: Retry now reads it, the card goes, the toast says the figures are the cloud\'s',
      tapped && !k && /The sales figures are up to date with the cloud/.test(toast), { tapped, k, toast });

    // C7 — sales changes this device has not saved
    mode.failGet = /^erpSales$/;
    await page.evaluate(async () => { window.__bgTick(); for(let i = 0; i < 100 && (refreshRunning() || _roundBusy); i++) await new Promise(r => setTimeout(r, 50)); });
    await settle();
    await page.evaluate(() => { _erpDirty = true; renderErpDirtyPill(); renderErpNudge(); });
    const dirty = await card();
    mode.failGet = null;
    tapped = await tapRetry();
    await retryDone();
    k = await card();
    const saved = await page.evaluate(() => ({ dirty: _erpDirty, pill: !!document.getElementById('erpDirtyPill') }));
    check('C7 unsaved sales changes: the card says so (never "tries again by itself"); Retry now saves them, then the card goes',
      !!dirty && /This device has sales changes the cloud does not hold yet/.test(dirty.text) && !/every 20 seconds/.test(dirty.text) && dirty.btn === 'Retry now'
      && tapped && !k && !saved.dirty && !saved.pill, { dirty, tapped, k, saved });

    // C8 — a 20-second round that reads the cloud again takes the card away by itself
    mode.failGet = /^erpSales$/;
    await page.evaluate(async () => { window.__bgTick(); for(let i = 0; i < 100 && (refreshRunning() || _roundBusy); i++) await new Promise(r => setTimeout(r, 50)); });
    await settle();
    const upAgain = await card();
    mode.failGet = null;
    await page.evaluate(async () => { window.__bgTick(); for(let i = 0; i < 100 && (refreshRunning() || _roundBusy); i++) await new Promise(r => setTimeout(r, 50)); });
    await settle();
    k = await card();
    check('C8 guard: a round that reads the cloud again takes the card away by itself', !!upAgain && !k, { upAgain, k });

    // C4 — the same card in Arabic: up again (the read fails), a Retry that ends without the cloud, two minutes on
    mode.failGet = /^erpSales$/;
    await page.evaluate(async () => { window.__bgTick(); for(let i = 0; i < 100 && (refreshRunning() || _roundBusy); i++) await new Promise(r => setTimeout(r, 50)); });
    await settle();
    await page.evaluate(() => setUiLang('ar')); await page.waitForTimeout(300); await settle();
    await page.evaluate(() => { closeModal(); switchView('today'); }); await page.waitForTimeout(150);
    const arFirst = await card();
    tapped = await tapRetry();
    await retryDone();
    await page.evaluate(() => { window.__addTime(121000); renderErpNudge(); }); await page.waitForTimeout(150);
    const ar = await card();
    check('C4 in Arabic: «إعادة المحاولة الآن» and every line in Arabic (no English left)',
      !!arFirst && arFirst.btn === 'إعادة المحاولة الآن' && !/[A-Za-z]/.test(arFirst.text)
      && tapped && !!ar && ar.btn === 'إعادة المحاولة الآن' && !/[A-Za-z]/.test(ar.text) && /آخر محاولة/.test(ar.text) && /دقيقتين/.test(ar.text), { arFirst, ar });
  }catch(e){ check('harness ran to the end', false, String(e && e.stack || e)); }
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})();
