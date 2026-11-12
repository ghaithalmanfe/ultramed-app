// Nothing real ships with the app (v121): the site and the repository are
// public. The one-time August DSR figures, the factory list of the company's
// clinics and the team's sign-in addresses are gone from the code — and the
// team's own data is untouched by their removal:
//   - an existing account opened by the supervisor in August 2026 (when the old
//     DSR seed would have applied) and today keeps its targets document and its
//     clinic list byte for byte;
//   - a brand-new account starts with no clinics (nothing written at start) and
//     its first clinic saves;
//   - a phone that never signed in shows the team's names; a name whose address
//     this phone does not know asks for the work e-mail instead of failing on a
//     password; once the team list is read the phone signs in by name as before.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8240;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
let cloud = {};
const writes = [];
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { writes.push(k); cloud[k] = v; return true; },
  setMany: async e => { e.forEach(([k, v]) => { writes.push(k); cloud[k] = v; }); return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,400):'')); if(!ok) failed++; }

async function newPage(browser, isoNow, errors){
  const ctx = await browser.newContext();                     // a fresh context = a phone with nothing stored
  await blockFirebase(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load/i.test(m.text())) errors.push('console: '+m.text().slice(0,200)); });
  page.on('dialog', d => d.dismiss());
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set); await page.exposeFunction('__cDel', api.del);
  await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
  const off = new Date(isoNow).getTime() - Date.now();
  await page.addInitScript((off) => {
    window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v),
      setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) };
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  }, off);
  return { ctx, page };
}
const open = async (page, who, role) => {
  await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
  if(who) await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
  await page.waitForTimeout(400);
};

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = [];

  // ---- an existing account (invented data), opened by the supervisor in August 2026 and today ----
  const existing = () => ({
    staff: twoRepStaff(),
    clinics: JSON.stringify([{ id:'k1', name:'Sample Dental Clinic', rep:'Mariam', cls:'A', doctors:[] }, { id:'k2', name:'Example Smile Center', rep:'Renova', cls:'B', doctors:[] }]),
    // no "as of" date: exactly the case the old one-time DSR seed overwrote
    targets: JSON.stringify({ Mariam: { revenue: 5000, month: '2026-08', brands: { Tepe: 500 } }, Renova: { revenue: 6000, month: '2026-08' } }),
    erpSales: JSON.stringify({ periods: [], seeds: { orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } }),
  });
  for(const [label, iso] of [['in August 2026', '2026-08-20T10:00:00'], ['today', '2026-11-12T10:00:00']]){
    cloud = existing(); writes.length = 0;
    if(label === 'today') cloud.targets = cloud.targets.replace(/2026-08/g, '2026-11');
    const before = { targets: cloud.targets, clinics: cloud.clinics };
    const { ctx, page } = await newPage(browser, iso, errors);
    await open(page, 'Dr. Ghaith', 'supervisor');
    const seen = await page.evaluate(() => ({ today: todayStr(), toast: (document.getElementById('toast')||{}).innerText || '', n: clinics.length,
      dsr: typeof DSR_SEED !== 'undefined' || typeof applyDsrSeed === 'function', factory: typeof CLINICS_SEED !== 'undefined' && CLINICS_SEED.length > 0 }));
    check(`opened ${label}: the targets document is exactly as it was`, cloud.targets === before.targets && !/DSR/.test(seen.toast), { today: seen.today, changed: cloud.targets !== before.targets, toast: seen.toast });
    check(`opened ${label}: the clinic list is exactly as it was`, cloud.clinics === before.clinics && seen.n === 2, { n: seen.n, written: writes.includes('clinics') });
    check(`opened ${label}: no DSR seed and no factory clinic list in the code`, !seen.dsr && !seen.factory, seen);
    await ctx.close();
  }

  // ---- a brand-new account: no clinics, nothing written at start, the first clinic saves ----
  {
    cloud = { staff: twoRepStaff() }; writes.length = 0;
    const { ctx, page } = await newPage(browser, '2026-11-12T10:00:00', errors);
    await open(page, 'Dr. Ghaith', 'supervisor');
    const fresh = await page.evaluate(() => ({ n: clinics.length, seed: _seedClinics, finder: missingClinicCandidates().filter(x => x.src === 'seed').length }));
    check('a new account starts with no clinics, and nothing is written for them at start', fresh.n === 0 && !('clinics' in cloud) && !fresh.seed, { fresh, written: writes.includes('clinics') });
    check('the missing-clinic finder offers no factory list', fresh.finder === 0, fresh.finder);
    const saved = await page.evaluate(async () => { clinics.push(normalizeClinic({ id: 'n1', name: 'First Sample Clinic', rep: 'Mariam', cls: 'B', doctors: [] })); return await persist('clinics'); });
    check('the new account\'s first clinic saves', saved !== false && JSON.parse(cloud.clinics || '[]').some(c => c.id === 'n1'), { saved });
    await ctx.close();
  }

  // ---- a phone that never signed in ----
  {
    cloud = { staff: twoRepStaff(), clinics: '[]' };
    const { ctx, page } = await newPage(browser, '2026-11-12T10:00:00', errors);
    await open(page, null);
    const gate = await page.evaluate(() => ({ tiles: (document.getElementById('gateGrid')||{}).innerText || '', addr: staff.map(s => s.email || '') }));
    check('the sign-in screen shows the team by name, and the code holds no address', /Mariam/.test(gate.tiles) && /Renova/.test(gate.tiles) && /Dr\. Ghaith/.test(gate.tiles) && gate.addr.every(a => !a), gate);
    const first = await page.evaluate(() => { gateTap('Mariam'); const m = document.getElementById('modalInner') || document.body; return { email: !!document.getElementById('elEmail'), pwdOnly: !!document.getElementById('gatePassword'), text: m.innerText }; });
    check('a name this phone has no address for asks for the work e-mail (not a password that cannot work)', first.email && !first.pwdOnly && /first sign-in on this phone/i.test(first.text), first);
    await page.evaluate(() => closeModal());
    // signed in once: the team list (with addresses) is read and kept on the phone
    await page.evaluate(async () => { await selectUser('Mariam', 'rep'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => switchUser());
    const again = await page.evaluate(() => { gateTap('Renova'); return { pwd: !!document.getElementById('gatePassword'), email: !!document.getElementById('elEmail'), kept: JSON.parse(localStorage.getItem('ultramed_staff_cache') || '[]').filter(s => s.email).length }; });
    check('after the first sign-in the phone knows the team list: a name asks for the password as before', again.pwd && !again.email && again.kept === 3, again);
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 4));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
