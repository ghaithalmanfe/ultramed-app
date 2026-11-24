// The clinic list's order and the same-name hint (v129, the owner's request of 23 Nov: "let me sort the clinics A–Z or
// Z–A so I can catch the ones typed in twice — Mariam's English is weak"). Each check fails on 65f9a90 but the guards:
//   S1  the list offers Priority order / Name A–Z / Name Z–A; Priority order is the default (an overdue follow-up first)
//   S2  Name A–Z: the rows in UMCore.clinicNameCompare order (capitals, spaces and punctuation do not count, "Clinic 2"
//       before "Clinic 10"), and the choice is remembered on this device after a reopen
//   S3  Name Z–A: the same rows the other way round
//   S4  the supervisor's All: "Possible duplicates (N)" counts the clinics UMCore.possibleDuplicateClinics groups, each
//       of them says which clinic it may duplicate; branches 1 and 2 and two different Arabic names are not flagged
//   S5  the duplicates filter: only those clinics, each group together
//   S6  a rep's list: only her own clinics are compared (her twin at another rep's clinic is not hers to see)
//   S7  Admin → data quality "Possible duplicate clinics" follows the same rule (two different Arabic names were
//       counted as one duplicate: only Latin letters were compared)
//   S8  in Arabic: «حسب الأولوية» «الاسم A–Z» «الاسم Z–A» «احتمال تكرار (N)» «قد تكون مكررة مع», no English left
//   S9  guard: sorting and filtering write nothing to the cloud; no page errors
// The clock is fixed (Mon 9 Nov 2026, 10:00). Port 8307. Env: WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8307, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const cloud = {}; let writes = [];
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { writes.push(k); cloud[k] = v; return true; },
  del: async k => { writes.push('-' + k); delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { writes.push(k); cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
const C = (id, name, rep, x) => Object.assign({ id, name, rep, cls: 'B', doctors: [] }, x || {});
const CLINICS = [
  C('c1', 'Smile Dental Clinic', M), C('c2', 'smile-dental  clinic', M), C('c3', 'Smile Dentel Clinic', R),
  C('c4', 'Bright Care', M), C('c5', 'Zenith Dental', R, { nextFollowUp: '2026-11-02' }), C('c6', 'Amberline Clinic', M),
  C('c7', 'عيادة النور', M), C('c8', 'عيادة الياسمين', M), C('c9', 'Clinic 10', M), C('c10', 'Clinic 2', M),
  C('c11', 'Orion Dental 1', R), C('c12', 'Orion Dental 2', R), C('c13', 'عياده النور', R),
];
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify(CLINICS);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.erpMap = '{}';
  cloud.targets = JSON.stringify({ [M]: { revenue: 1000, month: '2026-11' }, [R]: { revenue: 1000, month: '2026-11' } });
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
  const open = async (who, role, lang) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: '+m.text()); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
    await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
    await page.exposeFunction('__cSetMany', api.setMany);
    await page.addInitScript(l => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v),
        setMany: async entries => window.__cSetMany(entries),
        delete: async k => window.__cDel(k),
        list: async p => ({ keys: await window.__cList(p) }),
      };
      if(l) try{ localStorage.setItem('ultramed_lang', l); }catch(e){}
      const off = new Date(2026, 10, 9, 10, 0, 0).getTime() - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => ms === 20000 ? -1 : _si(fn, ms, ...a);
    }, lang || null);
    const signIn = async () => {
      await page.goto(URL); await page.waitForTimeout(200);
      await page.evaluate(async a => { await selectUser(a[0], a[1]); }, [who, role]);
      await page.evaluate(async () => { if(typeof msWhenReady === 'function') await msWhenReady(); closeModal(); switchView('clinics'); setClinicMode('list'); });
      await page.waitForTimeout(250);
    };
    await signIn();
    return { ctx, page, signIn };
  };
  const view = page => page.evaluate(() => ({
    chips: [...document.querySelectorAll('#clinicSortChips .chip')].map(b => ({ t: b.textContent.replace(/\s+/g, ' ').trim(), on: b.classList.contains('on') })),
    rows: [...document.querySelectorAll('#clinicList .cl-row')].map(r => ({ name: r.querySelector('.clinic-name').childNodes[0].textContent.trim(),
      dup: r.querySelector('.cl-dup') ? r.querySelector('.cl-dup').textContent.replace(/\s+/g, ' ').trim() : '' })),
  }));
  const tap = (page, re) => page.evaluate(src => { const b = [...document.querySelectorAll('#clinicSortChips .chip')].find(x => new RegExp(src).test(x.textContent)); if(b) b.click(); return !!b; }, re.source);
  const byName = new Map(CLINICS.map(c => [c.name, c]));
  const order = (names, dir) => names.slice().sort((a, b) => (dir || 1) * core.clinicNameCompare(byName.get(a), byName.get(b)));
  try{
    seed();
    let s = await open(G, 'supervisor');
    let v = await view(s.page);
    check('S1 the list offers Priority order / Name A–Z / Name Z–A, Priority order is the default (the overdue follow-up first)',
      v.chips.slice(0, 3).map(c => c.t).join('|') === 'Priority order|Name A–Z|Name Z–A' && v.chips[0].on && v.rows.length === CLINICS.length && v.rows[0].name === 'Zenith Dental', v);
    const all = v.rows.map(r => r.name);
    await tap(s.page, /^Name A–Z$/); await s.page.waitForTimeout(150);
    v = await view(s.page);
    const az = order(all);
    const okAz = JSON.stringify(v.rows.map(r => r.name)) === JSON.stringify(az);
    await s.signIn();
    const v2 = await view(s.page);
    check('S2 Name A–Z: the rows in name order (capitals, spaces and punctuation do not count, "Clinic 2" before "Clinic 10"), remembered after a reopen',
      okAz && az.indexOf('Clinic 2') < az.indexOf('Clinic 10') && Math.abs(az.indexOf('Smile Dental Clinic') - az.indexOf('smile-dental  clinic')) === 1
        && v2.chips[1] && v2.chips[1].on && JSON.stringify(v2.rows.map(r => r.name)) === JSON.stringify(az), { okAz, rows: v.rows.map(r => r.name), az, reopened: v2.chips });
    await tap(s.page, /^Name Z–A$/); await s.page.waitForTimeout(150);
    v = await view(s.page);
    check('S3 Name Z–A: the same rows the other way round', JSON.stringify(v.rows.map(r => r.name)) === JSON.stringify(order(all, -1)), v.rows.map(r => r.name));
    // S4 the hint over the supervisor's All
    const want = core.possibleDuplicateClinics(CLINICS);
    const nDup = Object.keys(want.byId).length;
    const dupChip = v.chips.find(c => /Possible duplicates/.test(c.t));
    const hint = n => (v.rows.find(r => r.name === n) || {}).dup || '';
    check('S4 "Possible duplicates (N)" over every clinic, each says which it may duplicate; branches 1/2 and two different Arabic names are not flagged',
      nDup === 5 && !!dupChip && dupChip.t === `Possible duplicates (${nDup})`
        && /Possible duplicate of/.test(hint('Smile Dental Clinic')) && /smile-dental clinic/.test(hint('Smile Dental Clinic')) && /Smile Dentel Clinic/.test(hint('Smile Dental Clinic'))
        && /عياده النور/.test(hint('عيادة النور')) && !hint('عيادة الياسمين') && !hint('Orion Dental 1') && !hint('Orion Dental 2') && !hint('Clinic 2') && !hint('Bright Care'),
      { nDup, dupChip, hints: v.rows.filter(r => r.dup).map(r => r.name + ': ' + r.dup) });
    await tap(s.page, /Possible duplicates/); await s.page.waitForTimeout(150);
    v = await view(s.page);
    const names = v.rows.map(r => r.name);
    const together = want.groups.every(g => { const at = g.map(id => names.indexOf(CLINICS.find(c => c.id === id).name)).sort((a, b) => a - b); return at[0] >= 0 && at[at.length - 1] - at[0] === g.length - 1; });
    check('S5 the duplicates filter: only those clinics, each group together', names.length === nDup && together, names);
    await tap(s.page, /Possible duplicates/); await s.page.waitForTimeout(100);
    // S7 Admin → data quality
    const dq = await s.page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = adminHealthHTML(); const c = [...d.querySelectorAll('.card')].find(x => /Possible duplicate clinics/.test(x.textContent)); return c ? c.textContent.replace(/\s+/g, ' ').trim() : null; }).catch(e => 'ERR ' + e.message);
    check('S7 Admin data quality "Possible duplicate clinics" follows the list\'s rule (two different Arabic names are not a duplicate)',
      !!dq && / 2$/.test(dq) && /Smile Dental Clinic/.test(dq) && /عيادة النور/.test(dq) && !/الياسمين/.test(dq), dq);
    await s.ctx.close();
    // S6 a rep's own list
    s = await open(M, 'rep');
    v = await view(s.page);
    const mine = CLINICS.filter(c => c.rep === M);
    const wantM = core.possibleDuplicateClinics(mine);
    const dc = v.chips.find(c => /Possible duplicates/.test(c.t));
    const h1 = (v.rows.find(r => r.name === 'Smile Dental Clinic') || {}).dup || '';
    check('S6 a rep\'s list compares only her own clinics', v.rows.length === mine.length && !!dc && dc.t === `Possible duplicates (${Object.keys(wantM.byId).length})`
      && /smile-dental clinic/.test(h1) && !/Dentel/.test(h1) && !((v.rows.find(r => r.name === 'عيادة النور') || {}).dup), { chips: v.chips, h1 });
    await s.ctx.close();
    // S8 Arabic
    s = await open(G, 'supervisor', 'ar');
    v = await view(s.page);
    const ar = await s.page.evaluate(() => ({ line: document.querySelector('.cl-chipline').innerText, hint: (document.querySelector('#clinicList .cl-dup') || {}).innerText || '', aria: document.getElementById('clinicSortChips').getAttribute('aria-label') }));
    check('S8 in Arabic: «حسب الأولوية» «الاسم A–Z» «الاسم Z–A» «احتمال تكرار (N)» «قد تكون مكررة مع», no English left',
      /حسب الأولوية/.test(ar.line) && /الاسم A–Z/.test(ar.line) && /الاسم Z–A/.test(ar.line) && new RegExp('احتمال تكرار \\(' + nDup + '\\)').test(ar.line)
        && /قد تكون مكررة مع/.test(ar.hint) && ar.aria === 'ترتيب العيادات' && !/Priority|Name|Possible/.test(ar.line + ar.hint), ar);
    await s.ctx.close();
    const wrote = writes.filter(k => !/^(categoryGuides|benchmarks|snap_|products)/.test(k));
    check('S9 guard: sorting and filtering write nothing to the cloud', wrote.length === 0, wrote);
    check('S9 guard: no page errors', errors.length === 0, errors.slice(0, 5));
  } catch(e){ check('harness ran without throwing', false, e.stack); }
  finally {
    await browser.close(); server.close();
    console.log(results.join('\n'));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
