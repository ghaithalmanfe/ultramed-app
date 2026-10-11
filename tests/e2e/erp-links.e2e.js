// ERP account links: where an account's invoices count can be changed after a
// wrong choice (v113). The owner's case: Aline has three branches, all his; a
// fourth branch (Khairan) opened before it was in the app, so its ERP account
// was linked by hand to Salmiya. Reproduces that no screen could change the
// link, then checks the editor from every entry point (clinic card, audit,
// Unrecognized list, the account list): a new branch made from the editor
// takes the account and nobody's month moves; Undo (which also removes a
// branch made in the same step while nothing hangs on it); a save the cloud
// refuses, throws on, or confirms late never shows a link the cloud does not
// hold, and never redraws a sheet the person moved on to; two devices never
// overwrite each other's links; a move to another rep's clinic shows each
// month first and asks before touching a closed month (sales, discount check
// or new-account wins, each said apart); automatic matching; names with
// quotes; links to removed clinics; Closed clinics; a background refresh
// during a save; a rep sees nothing; Arabic; and an old queued whole-map save
// in the offline outbox is dropped. Section 21 is the safety pass: a name
// with a CR inside, an account named "__proto__", the change log's size, a
// Closed clinic through saveErpLink itself, a long name with no space, a
// clinic name with a quote and code in it as a photo caption, and customers
// named like built-in object properties in the reconciliation.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const core = require(WWW + '/js/core.js');
const PORT = 8204;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ---- fake cloud (Node side: survives reloads; can refuse, throw, be unreadable or slow) ----
// No `update` method: the app takes storageUpdate's get → fn → set path, so a
// change made "on another device" between the read and the write is visible.
// getDelay answers a read late with the value it had when it was asked — a
// background refresh that read before a save landed.
const cloud = {};
// maxBytes: { re, bytes } — a document bigger than that is refused, as Firestore refuses one over 1 MiB
const mode = { failSet: null, falseSet: null, failGet: null, delay: null, getDelay: null, maxBytes: null, sets: [] };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get');
    const v = k in cloud ? cloud[k] : null;
    if(mode.getDelay && mode.getDelay.re.test(k)) await sleep(mode.getDelay.ms);
    return v; },
  set: async (k, v) => { mode.sets.push(k);
    if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set');
    if(mode.maxBytes && mode.maxBytes.re.test(k) && Buffer.byteLength(String(v)) > mode.maxBytes.bytes) throw new Error('boom-set: the document exceeds the maximum size');
    if(mode.falseSet && mode.falseSet.test(k)) return false;
    if(mode.delay && mode.delay.re.test(k)) await sleep(mode.delay.ms);
    cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k]) => mode.sets.push(k)); if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,600):'')); if(!ok) failed++; }
const G = 'Dr. Ghaith', M = 'Mariam', GS = 'Ghaith Al Manfe', MS = 'Mariam Zohair';
const KH = 'Aline Dental Clinic - Khairan', BYSTANDER = 'Marketing Philips';
const QUOTED = `Dr. O'Neil "Smile" Clinic`;
const LONG = 'Al Salam International Hospital Dental Department Jabriya Branch Block Three Building Seven';
const SMILE = 'Smile Care Fintas';                 // an account no clinic matches, invoiced by Mariam's salesman
const VARIANT = 'ALINE DENTAL CLINIC - KHAIRAN';   // a spelling variant of Khairan's account

// ---- seed: three Aline branches (his), a Mariam clinic; Sep + Oct sales in split storage ----
// packed ERP row: [date, doc, type(1=return), product, qty, gross, net, sret, salesman, brand, customer, cls, dsret, ref]
const row = (d, doc, cust, net, sm, gross) => [d, doc, 0, 'Intensiv Ortho-Strips', 1, gross == null ? net : gross, net, 0, sm, 'Intensiv', cust, 'Clinics', 0, ''];
const ret = (d, doc, cust, net, sm, ref) => [d, doc, 1, 'Intensiv Ortho-Strips', -1, 0, net, -net, sm, 'Intensiv', cust, 'Clinics', 0, ref];
const SEP = [row('2026-09-14','SINV7001','Aline Dental Clinic - Salmiya',100,GS), row('2026-09-21','SINV7002',KH,60,GS,96), // 37.5% off: within A's 40%, over the 35% of other classes
  row('2026-09-22','SINV7003','Dental 8 Clinic',25,MS)];
const OCT = [row('2026-10-04','SINV7101','Aline Dental Clinic - Salmiya',50,GS), row('2026-10-05','SINV7102','Aline Dental Clinic - Hawally',30,GS),
  row('2026-10-06','SINV7103',KH,80,GS), row('2026-10-07','SINV7104',KH,15.5,GS), row('2026-10-06','SINV7105','Dental 8 Clinic',40,MS),
  // issued by a salesman outside the team: they count for nobody, so no month figure moves
  row('2026-10-03','SINV7106',QUOTED,12,'Stranger'), row('2026-10-03','SINV7107',LONG,7,'Stranger')];
const repMap = { [GS]: G, [MS]: M };
const sum = rows => Math.round(rows.reduce((s, r) => s + r[6], 0) * 1000) / 1000;
const makeSplit = (sep, oct) => core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: repMap,
  seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, // one-time boot repairs: already done
  periods: [
    { id: 'sep', from: '2026-09-01', to: '2026-09-30', net: sum(sep), rowCount: sep.length, importedAt: '2026-10-01T08:00:00.000Z', repMap, rev: 1, rows: sep },
    { id: 'oct', from: '2026-10-01', to: '2026-10-08', net: sum(oct), rowCount: oct.length, importedAt: '2026-10-09T08:00:00.000Z', repMap, rev: 1, rows: oct }] });
const split = makeSplit(SEP, OCT);
const SPLIT_SMILE = makeSplit(SEP, OCT.concat([row('2026-10-08','SINV7108',SMILE,70,MS)]));            // Mariam: 40 + 70
const SPLIT_VAR = makeSplit(SEP, OCT.concat([row('2026-10-02','SINV7129',VARIANT,6,MS)]));             // matches a new Khairan branch by name
const SPLIT_RET = makeSplit(SEP, OCT.concat([ret('2026-10-03','SRET7001',KH,-12,GS,'SINV7002')]));      // a September invoice returned in the October file
const SPLIT_NONAME = makeSplit(SEP, OCT.concat([row('2026-10-02','SINV7131','',11,GS)]));               // a line with no customer name, his salesman
// ---- names that test the plumbing (section 21) ----
const CRN = 'Smile Clinic\r\nFintas';               // a two-line cell: CSV and XLSX keep the CR inside a name
const EVIL = "Smile');window.__xss=(window.__xss||0)+1;//";   // a quote and code: as a clinic name it must stay text
const WORD = 'X'.repeat(420);                       // a long name with no space to break at
const BIG = ('Al Salam International Hospital Dental Department ').repeat(700).slice(0, 32000).trim(); // Excel's cell limit is 32,767
const PROTO_NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];
const SPLIT_CR = makeSplit(SEP, OCT.concat([row('2026-10-07','SINV7141',CRN,70,GS), row('2026-10-08','SINV7142',CRN,30,GS)]));
const SPLIT_PROTO = makeSplit(SEP, OCT.concat([row('2026-10-07','SINV7151','__proto__',33,GS)]));
const SPLIT_PN = makeSplit(SEP, OCT.concat(PROTO_NAMES.map((n, i) => row('2026-10-07', 'SINV716' + i, n, 11 + i, GS))));
const SPLIT_EVIL = makeSplit(SEP, OCT.concat([row('2026-10-07','SINV7171',EVIL,9,GS)]));
const SPLIT_WORD = makeSplit(SEP, OCT.concat([row('2026-10-07','SINV7181',WORD,9,GS)]));
const SPLIT_BIG = makeSplit(SEP, OCT.concat([row('2026-10-07','SINV7191',BIG,9,GS)]));
const CLINICS = [
  {id:'al1', name:'Aline Dental Clinic - Salmiya', rep:G, cls:'A', doctors:[]},
  {id:'al2', name:'Aline Dental Clinic - Hawally', rep:G, cls:'B', doctors:[]},
  {id:'al3', name:'Aline Dental Clinic - Jabriya', rep:G, cls:'B', doctors:[]},
  {id:'m1', name:'Dental 8 Clinic', rep:M, cls:'A', doctors:[]}];
const CL_EXTRA = CLINICS.concat([{id:'pe1', name:'Pearl Dental Clinic', rep:'', cls:'B', doctors:[]},   // no rep
  {id:'ft1', name:'Former Team Clinic', rep:'Hessa', cls:'B', doctors:[]},                               // a rep who is not on the team
  {id:'cl1', name:'Old Harbour Dental', rep:M, cls:'Closed', doctors:[]}]);
// Every phase can start from this state: the cloud as the owner left it, nothing on the device.
function reseed(o = {}){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  const sp = o.split || split;
  cloud.erpSales = JSON.stringify(sp.index);                                             // index document
  Object.keys(sp.docs).forEach(k => { cloud[k] = JSON.stringify(sp.docs[k]); });         // erpRows:<period>:<rev>:<n>
  cloud.erpMap = JSON.stringify(o.erpMap || { [KH]: 'al1', [BYSTANDER]: '@ignore' });    // the bystander must survive every save
  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]); // he sells (default)
  cloud.clinics = JSON.stringify(o.clinics || CLINICS);
  cloud.targets = JSON.stringify({ [G]: { revenue: 2000, month: '2026-10', brands: { Intensiv: 1500 } }, [M]: { revenue: 1000, month: '2026-10', brands: { Intensiv: 800 } } });
  Object.assign(mode, { failSet: null, falseSet: null, failGet: null, delay: null, getDelay: null, maxBytes: null });
}
reseed();

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // a phone
  await blockFirebase(ctx);
  // hermetic: nothing leaves the machine (the clinic card loads product photos from remote hosts)
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
  const errors = [], dialogs = [], guard = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    const t = m.text();
    if(m.type() === 'error' && /erpMap is saved per account/.test(t)){ guard.push(t); return; } // the persist('erpMap') tripwire (counted, checked below)
    if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-(set|get)|save failed/i.test(t)) errors.push('console: ' + t);
  });
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); }); // every question is asked ON the page — a native confirm() is a failure
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
    const off = new Date(2026, 9, 11, 10, 0, 0).getTime() - Date.now(); // Sun 11 Oct 2026, 10:00, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  // Every phase starts from a fresh boot: it proves the previous phase's save is in the cloud, and keeps each
  // phase far inside the app's 20 s background refresh, which reloads erpMap and could hide a missing rollback.
  const boot = async (who=G, role='supervisor', local) => {
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(150);
    await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local || null);
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };
  const bad = txt => (String(txt).match(/\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b/g) || []).slice(0, 3);
  const cloudMap = () => JSON.parse(cloud.erpMap || '{}');
  const cloudClinics = () => JSON.parse(cloud.clinics || '[]');
  const cloudBin = () => (JSON.parse(cloud.recycleBin || '{}').clinics || []);
  // Figures through the app's own code paths: the month (UMCore.monthAchievement — Today card, reports, e-mail),
  // the closed September (same function as of 30 Sep), this month per clinic (caMonthClinicSales).
  const figs = (id) => page.evaluate(id => { const d = digestData(), sep = Object.assign({}, d, { today: '2026-09-30' });
    const cs = caMonthClinicSales(), kd = x => cs[x] ? Math.round(cs[x].net * 100) / 100 : 0;
    return { g: UMCore.monthAchievement('Dr. Ghaith', d).amount, m: UMCore.monthAchievement('Mariam', d).amount,
      gSep: UMCore.monthAchievement('Dr. Ghaith', sep).amount, mSep: UMCore.monthAchievement('Mariam', sep).amount,
      al1: kd('al1'), al2: kd('al2'), al3: kd('al3'), m1: kd('m1'), id: id ? kd(id) : null,
      link: Object.prototype.hasOwnProperty.call(erpMap, 'Aline Dental Clinic - Khairan') ? erpMap['Aline Dental Clinic - Khairan'] : null,
      bystander: erpMap['Marketing Philips'] || null,
      mirror: (JSON.parse(localStorage.getItem('um_mirror:erpMap') || '{}'))['Aline Dental Clinic - Khairan'] || null }; }, id || null);
  // where an account counts in memory right now, as the list reads it
  const acctNow = name => page.evaluate(n => { const a = UMCore.erpAccounts(digestData()).accounts.find(x => x.name === n), c = a && clinics.find(x => x.id === a.clinicId);
    return a ? { status: a.status, clinicId: a.clinicId, at: c ? c.name : null, link: a.link } : null; }, name);
  const modal = () => page.evaluate(() => document.getElementById('modalInner').innerText.replace(/\s+/g, ' '));
  // ---- UI adapter: the ONLY place that knows the new screens' hooks (spec §4.8) ----
  const ui = (fn, arg) => page.evaluate(async ({fn, arg}) => {
    const q = s => document.querySelector('#modalInner ' + s);
    const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const linkBtn = name => [...document.querySelectorAll('#modalInner [data-erp-link]')].find(b => b.dataset.erpLink === name);
    try{
      if(fn === 'card'){ openClinicDetail(arg); await wait(120); const s = document.getElementById('clinicErpAccounts');
        return { text: txt(s), links: s ? [...s.querySelectorAll('[data-erp-link]')].map(b => b.dataset.erpLink) : [] }; }
      if(fn === 'auditRow'){ openErpRecon('oct'); await wait(80);
        const tr = [...document.querySelectorAll('#modalInner tr')].find(t => t.cells[0] && t.cells[0].innerText.trim() === arg);
        return { row: txt(tr), has: !!(tr && tr.querySelector('[data-erp-link]')), name: tr && tr.querySelector('[data-erp-link]') ? tr.querySelector('[data-erp-link]').dataset.erpLink : null }; }
      if(fn === 'list'){ if(typeof openErpLinks !== 'function') return { err: 'openErpLinks missing' }; openErpLinks(arg || {}); await wait(120);
        const l = document.getElementById('elList'); return { text: txt(l), first: l && l.querySelector('[data-erp-link]') ? l.querySelector('[data-erp-link]').dataset.erpLink : null, cards: l ? [...l.querySelectorAll('[data-erp-link]')].map(c => c.dataset.erpLink) : [] }; }
      if(fn === 'edit'){ if(typeof openErpLinkEdit !== 'function') return { err: 'openErpLinkEdit missing' }; openErpLinkEdit(arg, 'links'); await wait(150); return { ok: true }; }
      if(fn === 'openFrom'){ const b = linkBtn(arg); if(!b) return { err: 'no [data-erp-link] for ' + arg }; b.click(); await wait(150); return { ok: true }; }
      if(fn === 'pick'){ let c = q(`[data-target="${arg}"]`);
        if(!c && arg[0] !== '@'){ const s = q('#elClinicSearch'); const cl = clinics.find(x => x.id === arg);
          if(s && cl){ s.value = cl.name; s.dispatchEvent(new Event('input')); await wait(60); c = q(`#elPick [data-target="${arg}"]`); } }
        if(!c) return { err: 'no target ' + arg }; c.click(); await wait(200); return { ok: true }; }
      if(fn === 'newRep'){ const c = q(`#elNewRep .chip[data-rep="${arg}"]`); if(!c) return { err: 'no rep chip ' + arg }; c.click(); await wait(200); return { ok: true }; }
      if(fn === 'preview'){ const p = q('#elPreview'); if(!p) return { err: 'no #elPreview' };
        const s = q('#elSave');
        return { text: txt(p), months: [...p.querySelectorAll('.el-month[data-month]')].map(e => [e.dataset.month, txt(e)]),
          moves: [...p.querySelectorAll('.el-move[data-month]')].map(e => [e.dataset.month, txt(e)]),
          today: [...p.querySelectorAll('.el-today[data-rep]')].map(e => [e.dataset.rep, txt(e)]),
          outside: txt(p.querySelector('.el-outside')),
          closedOk: !!q('#elClosedOk'), saveDisabled: s ? s.disabled : null, err: txt(q('#elErr')) }; }
      if(fn === 'closedCard'){ const c = q('#elClosedCard'); return { text: txt(c), rows: c ? [...c.querySelectorAll('[data-closed]')].map(e => e.dataset.closed) : [] }; }
      if(fn === 'tick'){ const c = q('#elClosedOk'); if(!c) return { err: 'no #elClosedOk' }; c.checked = true; c.dispatchEvent(new Event('change')); await wait(40); return { saveDisabled: q('#elSave').disabled }; }
      if(fn === 'save' || fn === 'undo'){ const b = fn === 'save' ? q('#elSave') : document.getElementById('elUndo'); if(!b) return { err: 'no ' + fn + ' button' };
        if(b.disabled) return { err: fn + ' button disabled' };
        b.click(); await wait(80);
        for(let i = 0; i < 60 && (_erpLinkSaving || (typeof _elBusy !== 'undefined' && _elBusy)); i++) await wait(50);
        await wait(150); return { ok: true }; }
      if(fn === 'back'){ const b = q('#elBack'); if(!b) return { err: 'no #elBack' }; b.click(); await wait(150); return { ok: true }; }
      if(fn === 'backBtn'){ const b = [...document.querySelectorAll('#modalInner button')].find(x => x.innerText.trim() === '‹ Back'); if(!b) return { err: 'no ‹ Back' }; b.click(); await wait(150); return { ok: true }; }
      if(fn === 'search'){ const s = document.getElementById('elSearch'); if(!s) return { err: 'no #elSearch' }; s.value = arg; s.dispatchEvent(new Event('input')); await wait(80); return { ok: true }; }
      if(fn === 'listState'){ const s = document.getElementById('elSearch'); return { q: s ? s.value : null, cards: [...document.querySelectorAll('#elList [data-erp-link]')].map(c => c.dataset.erpLink) }; }
      if(fn === 'newFields'){ const n = q('#elNewName'), r = q('#elNewRep .chip.on'), c = q('#elNewCls .chip.on'), s = q('#elSave');
        return { name: n ? n.value : null, rep: r ? r.dataset.rep : null, cls: c ? c.dataset.cls : null, nameErr: txt(q('#elNewNameErr')), hint: txt(q('#elNewHint')), saveDisabled: s ? s.disabled : null,
          locked: !!q('#elNewSaved'), lockedText: txt(q('#elNewSaved')) }; }
      if(fn === 'setNewName'){ const n = q('#elNewName'); if(!n) return { err: 'no #elNewName' }; n.focus(); n.value = arg; n.dispatchEvent(new Event('input')); await wait(450);
        return { focused: document.activeElement === n, saveDisabled: q('#elSave').disabled, nameErr: txt(q('#elNewNameErr')) }; }
      if(fn === 'err'){ const e = q('#elErr'); return { text: txt(e), shown: !!(e && e.offsetParent), saveDisabled: q('#elSave') ? q('#elSave').disabled : null, reopen: !!q('#elReopen') }; }
      if(fn === 'note'){ return { text: txt(document.getElementById('erpImportNote')), undo: !!document.getElementById('elUndo') }; }
      if(fn === 'fits'){ // a phone: nothing wider than the sheet, no sideways page scroll
        const sheet = document.getElementById('modalContent'), wide = [...document.querySelectorAll('#modalInner *')].filter(e => e.getBoundingClientRect().right > sheet.getBoundingClientRect().right + 1 || e.getBoundingClientRect().left < sheet.getBoundingClientRect().left - 1);
        return { page: document.documentElement.scrollWidth <= window.innerWidth, sheet: sheet.scrollWidth <= sheet.clientWidth + 1, wide: wide.slice(0, 3).map(e => e.tagName + '.' + e.className + ' ' + (e.innerText || '').slice(0, 40)) }; }
      return { err: 'unknown ' + fn };
    }catch(e){ return { err: e.message }; }
  }, {fn, arg});
  const sheetNow = () => page.evaluate(() => ({ h3: (document.querySelector('#modalInner h3') || {}).innerText || null, shown: document.getElementById('modalBack').classList.contains('show'),
    toast: document.getElementById('toast').textContent, el: typeof _el !== 'undefined' && _el ? _el.name : null }));

  // =============== 0) seed and baseline ===============
  await boot();
  const st = await page.evaluate(() => ({ reps: REPS.slice(), periods: erpPeriods().map(p => [p.id, (p.rows||[]).length, !!p.rowsMissing]), today: todayStr() }));
  check('seed: he sells, Sep + Oct assembled from chunk documents, clock 11 Oct', JSON.stringify(st.reps) === JSON.stringify([M,'Renova',G]) && st.periods.length === 2 && st.periods.every(p => p[1] > 0 && !p[2]) && st.today === '2026-10-11', st);
  let f = await figs();
  check('baseline: Khairan linked by hand to Salmiya — his Oct 175.50 / Sep 160.00, hers 40 / 25, Salmiya 145.50, Hawally 30', f.g === 175.5 && f.gSep === 160 && f.m === 40 && f.mSep === 25 && f.al1 === 145.5 && f.al2 === 30 && f.link === 'al1' && f.bystander === '@ignore', f);

  // =============== 1) REPRODUCE: once linked, no screen offers a change ===============
  let a = await ui('card', 'al1');
  check('THE BUG: Salmiya\'s card lists the ERP accounts counted there — Khairan, by hand, with a Move… control', !!a.text && /Khairan/.test(a.text) && /by hand/i.test(a.text) && a.links.includes(KH), a);
  a = await ui('auditRow', KH);
  check('THE BUG: the audit row of a linked account offers a change', a.has && a.name === KH, a);
  a = await ui('list');
  check('THE BUG: a list of every ERP account and its link exists (openErpLinks)', !a.err && a.cards.includes(KH), a);

  // =============== 2) the owner's case: a new branch from Salmiya's card ===============
  await boot();
  await ui('card', 'al1'); a = await ui('openFrom', KH);
  const ed = await modal();
  check('card → Move… opens the editor on the account, counted at Salmiya, no NaN/undefined', !a.err && ed.includes(KH) && /Aline Dental Clinic - Salmiya/.test(ed) && !bad(ed).length, { a, bad: bad(ed), ed: ed.slice(0, 300) });
  const tg = await page.evaluate(() => [...document.querySelectorAll('#modalInner [data-target]')].map(x => x.dataset.target));
  check('editor offers the Aline branches, a new branch, and the not-a-clinic choices', ['al2','al3','@new','@auto','@channel','@ignore'].every(t => tg.includes(t)), tg);
  const inv = await page.evaluate(() => { const d = document.querySelector('#modalInner details'); if(!d) return null; d.open = true; return d.innerText.replace(/\s+/g, ' '); });
  check('"Show the invoices (3)": each document with its date, KD and salesman', /Show the invoices \(3\)/.test(inv || '') && /SINV7104/.test(inv || '') && /Ghaith Al Manfe/.test(inv || ''), inv);
  a = await ui('fits');
  check('phone (390 px): the editor fits — no sideways scroll, nothing wider than the sheet', a.page && a.sheet && !a.wide.length, a);
  await ui('pick', '@new');
  let nf = await ui('newFields');
  check('new branch: name prefilled with the ERP account, rep Dr. Ghaith, class A (Salmiya\'s)', nf.name === KH && nf.rep === G && nf.cls === 'A', nf);
  let pv = await ui('preview');
  const m9 = (pv.months || []).find(x => x[0] === '2026-09'), m10 = (pv.months || []).find(x => x[0] === '2026-10');
  check('preview: September 1 × 60.00 (closed), October 2 × 95.50, "Still counts for Dr. Ghaith", nothing changes hands', !pv.err && !!m9 && /1 ×/.test(m9[1]) && /60\.00/.test(m9[1]) && !!m10 && /2 ×/.test(m10[1]) && /95\.50/.test(m10[1]) && /Still counts for/i.test(pv.text) && /Dr\. Ghaith/.test(pv.text) && !pv.moves.length, pv);
  let cc = await ui('closedCard');
  check('[D6] the new branch\'s first invoice (21 Sep) falls in closed September: the card says new-account / first-time-product wins can change there — not sales, not the discount check — and Save waits for the tick',
    cc.rows.includes('wins') && !cc.rows.includes('sales') && !cc.rows.includes('discount') && /September 2026/.test(cc.text || '') && /wins can change/.test(cc.text || '') && pv.closedOk && pv.saveDisabled === true, { cc, saveDisabled: pv.saveDisabled });
  check('nothing saved before the tap', cloudMap()[KH] === 'al1' && cloudClinics().length === 4 && (await figs()).link === 'al1');
  a = await ui('fits');
  check('phone (390 px): the check-before-saving page fits too', a.page && a.sheet && !a.wide.length, a);
  await ui('tick');
  a = await ui('save');
  const made = cloudClinics().find(c => c.name === KH);
  const newId = made && made.id;
  f = await figs(newId);
  check('saved: the branch is in the cloud (Dr. Ghaith, A), the account points at it — cloud, memory and device copy; bystander kept', !a.err && !!made && made.rep === G && made.cls === 'A' && cloudMap()[KH] === newId && f.link === newId && f.mirror === newId && cloudMap()[BYSTANDER] === '@ignore', { a, made, map: cloudMap(), f });
  check('…his month unchanged (175.50, September 160.00); Salmiya 50.00, the new branch 95.50', f.g === 175.5 && f.gSep === 160 && f.al1 === 50 && f.id === 95.5, f);
  let note = await ui('note');
  check('…the origin sheet reopens with "Saved — … now counts at …" and an Undo button', /Saved/.test(note.text || '') && /now counts at/.test(note.text || '') && note.undo, note);
  await sleep(300);
  const log = JSON.parse(cloud.erpMapLog || '[]');
  check('…the change is logged in erpMapLog (who, from, to)', log.length >= 1 && log[0].n === KH && log[0].f === 'al1' && log[0].t === newId && log[0].by === G && log[0].fc === 'Aline Dental Clinic - Salmiya', log[0]);
  const c1 = await ui('card', 'al1'), c2 = await ui('card', newId);
  check('…the cards follow: Khairan gone from Salmiya, on the new branch with all its invoices (3 × · 155.50 KD)', c1.text != null && !c1.links.includes(KH) && c2.links.includes(KH) && /155\.50/.test(c2.text || ''), { c1, c2 });

  // =============== 3) Undo, from the note pinned right after the save ===============
  // The branch made in that same step has nothing of its own yet (no visit, no doctor, no other account
  // counted there): Undo removes it the way a clinic is removed (recycle bin + the team's delete log) and puts the link back.
  reseed(); await boot(); await ui('card', 'al1'); await ui('openFrom', KH); await ui('pick', '@new'); await ui('tick'); await ui('save');
  const made2 = cloudClinics().find(c => c.name === KH);
  a = await ui('undo'); note = await ui('note'); f = await figs();
  const mem3 = await page.evaluate(id => ({ inMem: clinics.some(c => c.id === id), tomb: tombSet('clinics').has(id) }), made2 && made2.id);
  check('[D1] Undo after the new branch: the account counts at Salmiya again (cloud and memory), the branch it made is removed — cloud, memory, recycle bin, delete log',
    !a.err && !!made2 && cloudMap()[KH] === 'al1' && f.link === 'al1' && f.al1 === 145.5 && f.g === 175.5 && !cloudClinics().some(c => c.id === made2.id) && !mem3.inMem && mem3.tomb && cloudBin().some(c => c.id === made2.id), { a, map: cloudMap(), f, mem3, clinics: cloudClinics().map(c => c.name) });
  check('[D1] …and the note says exactly that: the branch was removed, the account counts again at Salmiya', /Undone/.test(note.text || '') && /was removed/.test(note.text || '') && /counts again at/.test(note.text || '') && /Salmiya/.test(note.text || '') && !/stays in the clinic list/.test(note.text || ''), note);
  await sleep(300);
  const log2 = JSON.parse(cloud.erpMapLog || '[]');
  check('…both changes are in the log, newest first', log2.length === 2 && log2[0].f === (made2 && made2.id) && log2[0].t === 'al1' && log2[1].t === (made2 && made2.id), log2);
  await boot(); await ui('edit', KH); await sleep(250);
  const last = await page.evaluate(() => { const e = document.getElementById('elLast'); return e && e.offsetParent ? e.innerText.replace(/\s+/g, ' ') : null; });
  check('the editor shows the last change from the log: when, who, and where it counted before', /Last change:/.test(last || '') && /Dr\. Ghaith/.test(last || '') && /before:/.test(last || '') && /Aline Dental Clinic - Khairan/.test(last || ''), last);
  const tg3 = await page.evaluate(() => [...document.querySelectorAll('#modalInner [data-target]')].map(x => x.dataset.target));
  check('[D1] the removed branch is no longer offered', !!made2 && !tg3.includes(made2.id) && !tg3.includes('al1'), tg3); // al1: "counted here now", not a choice
  await ui('pick', 'al3'); await ui('tick'); await ui('save');
  a = await ui('undo'); note = await ui('note');
  check('Undo of a plain move: back at Salmiya, no word about a new branch', !a.err && cloudMap()[KH] === 'al1' && /Undone/.test(note.text || '') && !/branch/i.test(note.text || ''), { a, note });

  // =============== 4) failures: the old link stays everywhere, and the sheet says so ===============
  for(const [label, set] of [['refused (set → false)', () => { mode.falseSet = /^erpMap$/; }], ['offline (set throws)', () => { mode.failSet = /^erpMap$/; }]]){
    reseed(); await boot(); await ui('edit', KH); await ui('pick', 'al2');
    pv = await ui('preview');
    check(`${label}: Hawally is class B — SINV7002 (37.5%) goes over its limit in closed September, so Save waits for the tick`, pv.closedOk && pv.saveDisabled === true, pv);
    await ui('tick'); set(); await ui('save'); mode.falseSet = mode.failSet = null;
    f = await figs(); const e = await ui('err');
    check(`${label}: memory, cloud and device copy keep Salmiya; Hawally stays 30.00`, f.link === 'al1' && cloudMap()[KH] === 'al1' && f.mirror === 'al1' && f.al2 === 30 && f.al1 === 145.5, f);
    check(`${label}: the sheet itself says "Not saved" and Save is enabled again`, e.shown && /Not saved/.test(e.text || '') && e.saveDisabled === false, e);
  }
  // (c) the branch cannot reach the cloud: it stays on this device only, and the account does not move
  reseed(); await boot(); await ui('edit', KH); await ui('pick', '@new'); await ui('tick');
  mode.failSet = /^clinics$/; mode.sets = [];
  await ui('save'); mode.failSet = null;
  let e4 = await ui('err');
  check('(c) clinics refused: "saved on this device only… the link was not saved", where it counts now (Salmiya, by hand), no write to erpMap', e4.shown && /this device only/.test(e4.text || '') && /link was not saved/.test(e4.text || '') && /Salmiya/.test(e4.text || '') && !mode.sets.includes('erpMap') && cloudMap()[KH] === 'al1' && !cloudClinics().some(c => c.name === KH), { e4, sets: mode.sets });
  f = await figs();
  check('(c) …memory still counts Khairan at Salmiya', f.link === 'al1' && f.al1 === 145.5, f);
  // (d) the branch lands, the link does not — then Save again: one branch, the same id
  reseed(); await boot(); await ui('edit', KH); await ui('pick', '@new'); await ui('tick');
  mode.failSet = /^erpMap$/;
  await ui('save'); mode.failSet = null;
  e4 = await ui('err');
  const madeD = cloudClinics().filter(c => c.name === KH);
  check('(d) link refused after the branch landed: "the new branch was added, but the link was not saved" — and where it counts now (still Salmiya, by hand)', e4.shown && /new branch was added/.test(e4.text || '') && /not saved/.test(e4.text || '') && /Salmiya/.test(e4.text || '') && madeD.length === 1 && cloudMap()[KH] === 'al1', { e4, madeD });
  await ui('save');
  const madeD2 = cloudClinics().filter(c => c.name === KH);
  check('(d) Save again: the link points at that branch and there is exactly one branch with that name', madeD2.length === 1 && cloudMap()[KH] === madeD2[0].id && (await figs()).link === madeD2[0].id, { madeD2, map: cloudMap() });
  // (e) a new branch whose name is taken is refused inline; a new name is typed without losing focus
  await boot(); await ui('edit', KH); await ui('pick', '@new');
  nf = await ui('newFields');
  check('(e) a name that already exists is refused inline and Save is disabled', /already exists/.test(nf.nameErr || '') && nf.saveDisabled === true, nf);
  a = await ui('setNewName', 'Aline Dental Clinic - Khairan Mall');
  await ui('tick');
  nf = await ui('newFields');
  check('(e) typing a new name keeps the focus, clears the error and joins the Aline branch group', a.focused && !nf.nameErr && nf.saveDisabled === false && /Aline/.test(nf.hint || '') && /Joins/.test(nf.hint || ''), { a, nf });
  // (f) the links were not loaded from the cloud (device copy shown): changes are paused
  reseed(); mode.failGet = /^erpMap$/; await boot(G, 'supervisor', { 'um_mirror:erpMap': JSON.stringify({ [KH]: 'al1' }) }); mode.failGet = null;
  await ui('edit', KH);
  const pausedTxt = await modal();
  await ui('pick', 'al3'); pv = await ui('preview');
  check('(f) links served from the device copy: the editor says changes are paused and Save stays disabled', /changes are paused/.test(pausedTxt) && pv.saveDisabled === true, { pausedTxt: pausedTxt.slice(0, 200), pv });

  // =============== 5) two devices: compare-and-set on one account, other accounts never touched ===============
  reseed(); await boot(); await ui('edit', KH); await ui('pick', 'al2'); await ui('tick');
  cloud.erpMap = JSON.stringify(Object.assign(cloudMap(), { [KH]: 'al3' }));            // another device moved it meanwhile
  await ui('save'); e4 = await ui('err');
  f = await figs();
  check('(a) changed on another device: nothing saved, the cloud keeps Jabriya, the sheet says so — and the screen now shows the cloud\'s link', /changed on another device/.test(e4.text || '') && cloudMap()[KH] === 'al3' && f.link === 'al3' && f.mirror === 'al3', { e4, map: cloudMap(), f });
  check('[D4] …after the conflict Save is disabled (it could never succeed from this page) and "Open it again" is offered', e4.saveDisabled === true && e4.reopen, e4);
  await page.evaluate(() => { const b = document.getElementById('elReopen'); if(b) b.click(); }); await page.waitForTimeout(150);
  const reo = await page.evaluate(() => ({ h3: (document.querySelector('#modalInner h3') || {}).innerText, text: document.getElementById('modalInner').innerText.replace(/\s+/g, ' '), shownOld: _el ? _el.shownOld : null }));
  check('[D4] …"Open it again" reopens the editor on the cloud\'s link (Jabriya)', /Where do this account/.test(reo.h3 || '') && /Counted now at Aline Dental Clinic - Jabriya/.test(reo.text) && reo.shownOld === 'al3', { h3: reo.h3, shownOld: reo.shownOld, text: reo.text.slice(0, 260) });
  await boot(); await ui('edit', KH); await ui('pick', 'al2'); await ui('tick');
  cloud.erpMap = JSON.stringify(Object.assign(cloudMap(), { 'Dental 8 Clinic': 'm1' }));  // another device linked another account
  await ui('save');
  f = await figs();
  check('(b) another account linked elsewhere meanwhile: both links survive, memory takes the cloud copy', cloudMap()[KH] === 'al2' && cloudMap()['Dental 8 Clinic'] === 'm1' && cloudMap()[BYSTANDER] === '@ignore' && f.link === 'al2' && (await page.evaluate(() => erpMap['Dental 8 Clinic'])) === 'm1', { map: cloudMap(), f });
  const cm = cloudMap(); delete cm[KH]; cloud.erpMap = JSON.stringify(cm);              // another device removed Khairan's link
  await ui('edit', 'Dental 8 Clinic'); await ui('pick', '@auto'); await ui('save');
  check('(c) saving another account never brings a removed link back', !(KH in cloudMap()) && !('Dental 8 Clinic' in cloudMap()) && cloudMap()[BYSTANDER] === '@ignore' && (await figs()).link === null, cloudMap());

  // =============== 6) to another rep's clinic: the months and KD first, closed months need a tick ===============
  reseed(); await boot();
  a = await ui('auditRow', KH); a = await ui('openFrom', KH);
  check('audit "تغيير" → the editor for that account', !a.err && (await modal()).includes(KH), a);
  await ui('pick', 'm1'); pv = await ui('preview');
  const mv9 = (pv.moves || []).find(x => x[0] === '2026-09'), mv10 = (pv.moves || []).find(x => x[0] === '2026-10');
  check('preview: September 60.00 (closed) and October 95.50 move from Dr. Ghaith to Mariam', !!mv9 && /60\.00/.test(mv9[1]) && /closed/i.test(mv9[1]) && /Ghaith/.test(mv9[1]) && /Mariam/.test(mv9[1]) && !!mv10 && /95\.50/.test(mv10[1]), pv.moves);
  const tG = (pv.today || []).find(x => x[0] === G), tM = (pv.today || []).find(x => x[0] === M);
  check('Today lines: Dr. Ghaith 9% → 4%, Mariam 4% → 14%', !!tG && /now 9%/.test(tG[1]) && /after saving 4%/.test(tG[1]) && !!tM && /now 4%/.test(tM[1]) && /after saving 14%/.test(tM[1]), pv.today);
  cc = await ui('closedCard');
  check('[D6] the closed-month card says the sales change in September', cc.rows.includes('sales') && /Sales change in/.test(cc.text || '') && /September 2026/.test(cc.text || ''), cc);
  check('Save stays disabled until "I understand that closed months change" is ticked', pv.closedOk && pv.saveDisabled === true && (await ui('tick')).saveDisabled === false);
  check('…on the page, not a native confirm()', dialogs.length === 0, dialogs);
  await ui('back');
  f = await figs();
  check('‹ Pick another: nothing changed', cloudMap()[KH] === 'al1' && f.link === 'al1' && f.g === 175.5 && f.m === 40 && /Branches of the same clinic/i.test(await modal()), f);
  await ui('pick', 'm1'); await ui('tick'); await ui('save');
  f = await figs();
  check('saved: Dr. Ghaith October 80, September 100; Mariam October 135.50, September 85', f.g === 80 && f.gSep === 100 && f.m === 135.5 && f.mSep === 85 && cloudMap()[KH] === 'm1', f);
  await boot(); await ui('edit', KH); await ui('pick', 'al1'); await ui('tick'); await ui('save');
  f = await figs();
  check('moving it back restores the baseline', f.g === 175.5 && f.gSep === 160 && f.m === 40 && f.mSep === 25 && cloudMap()[KH] === 'al1', f);

  // =============== 7) automatic matching ===============
  reseed(); await boot(); await ui('edit', KH); await ui('pick', '@auto'); pv = await ui('preview');
  check('automatic: "Matches no clinic — each invoice counts for the salesman who issued it", nobody\'s figures move', /Matches no clinic/.test(pv.text || '') && /salesman who issued it/.test(pv.text || '') && /nobody's sales figures change/.test(pv.text || '') && !pv.moves.length, pv);
  check('[D6] …his own salesman issued its invoices, so it does go back to "Unrecognized customer names" — and the page says so', /goes back to "Unrecognized customer names"/.test(pv.text || ''), pv.text);
  // at no clinic SINV7002 is checked against the 35% limit, no longer class A's 40%: a closed month changes, so Save waits for the tick
  check('…SINV7002 leaves class A\'s discount limit in closed September: Save waits for the tick', pv.closedOk && pv.saveDisabled === true && /SINV7002/.test(pv.text || ''), pv);
  await ui('tick'); await ui('save');
  const unr = await page.evaluate(n => { openErpRecon('oct'); const rows = [...document.querySelectorAll('#modalInner [data-erp-link]')].filter(b => b.dataset.erpLink === n);
    return { listed: _erpUnmatched.includes(n), buttons: rows.length, selects: document.querySelectorAll('#modalInner select').length }; }, KH);
  f = await figs();
  check('saved: no Khairan key in the cloud; back in "Unrecognized customer names" with Link… (no <select>); his month 175.50', !(KH in cloudMap()) && cloudMap()[BYSTANDER] === '@ignore' && unr.listed && unr.buttons >= 1 && unr.selects === 0 && f.g === 175.5, { unr, f, map: cloudMap() });
  await page.evaluate(n => { const b = [...document.querySelectorAll('#modalInner [data-erp-link]')].filter(x => x.dataset.erpLink === n).pop(); if(b) b.click(); }, KH);
  await page.waitForTimeout(150);
  check('Unrecognized → Link… opens the editor (nothing saved on tap)', (await modal()).includes('Where do this account\'s invoices count?') && !(KH in cloudMap()));

  // =============== 8) names with quotes reach the editor intact ===============
  reseed(); await boot();
  a = await ui('auditRow', QUOTED);
  check('the audit row of an account named with \' and " carries the exact name', a.has && a.name === QUOTED, a);
  await ui('openFrom', QUOTED);
  const qn = await page.evaluate(() => ({ name: typeof _el !== 'undefined' && _el ? _el.name : null, title: document.querySelector('#modalInner h3') && document.querySelector('#modalInner h3').innerText }));
  check('…and the editor opens on exactly that name', qn.name === QUOTED && (await modal()).includes(QUOTED), qn);

  // =============== 9) a link to a removed clinic ===============
  reseed({ erpMap: { [KH]: 'al1', [BYSTANDER]: '@ignore', 'Aline Dental Clinic - Hawally': 'gone1' } }); await boot();
  a = await ui('list');
  check('the account linked to a removed clinic is listed first, as "removed clinic"', a.first === 'Aline Dental Clinic - Hawally' && /removed clinic/.test(a.text || ''), a);
  a = await ui('auditRow', 'Aline Dental Clinic - Hawally');
  check('the audit says عيادة محذوفة (counted for whoever issued it), not ✅', /عيادة محذوفة/.test(a.row || '') && !/✅/.test(a.row || ''), a);
  const del = await page.evaluate(() => { deleteClinic('al1'); return document.getElementById('modalInner').innerText.replace(/\s+/g, ' '); });
  check('removing Salmiya warns that an ERP account is linked to it by hand', /linked to this clinic by hand/.test(del) && /move them first/.test(del), del.slice(0, 300));

  // =============== 9b) "Count another ERP account here…" — the owner's shortest path, from the Jabriya card ===============
  reseed(); await boot();
  await ui('card', 'al3');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#clinicErpAccounts button')].find(x => /Count another ERP account here/.test(x.innerText)); if(b) b.click(); });
  await page.waitForTimeout(150);
  const pk = await page.evaluate(() => ({ text: document.getElementById('modalInner').innerText.replace(/\s+/g, ' '), first: [...document.querySelectorAll('#elList [data-erp-link]')].map(x => x.dataset.erpLink).slice(0, 3) }));
  check('pick mode: the list for Jabriya puts the accounts that look like it first (Aline …), not the ones already counted there', /Looks like this clinic/i.test(pk.text) && pk.first[0] === KH && !pk.first.includes('Aline Dental Clinic - Jabriya'), pk);
  await ui('openFrom', KH); pv = await ui('preview');
  check('…tapping Khairan goes straight to the check: Salmiya → Jabriya, nobody\'s figures change, SINV7002 leaves class A\'s limit (tick)', !pv.err && /Aline Dental Clinic - Jabriya/.test(pv.text) && /nobody's sales figures change/.test(pv.text) && pv.closedOk, pv);
  await ui('tick'); await ui('save');
  a = await ui('note'); const cj = await page.evaluate(() => ({ h3: document.querySelector('#modalInner h3').innerText, links: [...document.querySelectorAll('#clinicErpAccounts [data-erp-link]')].map(x => x.dataset.erpLink) }));
  check('…saved: back on the Jabriya card, which now lists Khairan, with the Saved note', cloudMap()[KH] === 'al3' && /Jabriya/.test(cj.h3) && cj.links.includes(KH) && /Saved/.test(a.text || ''), { cj, a, map: cloudMap() });
  // the import screen's card, and the list's way back to it
  a = await page.evaluate(() => { openErpImport(); const c = document.getElementById('erpLinksCard'); return c ? c.innerText.replace(/\s+/g, ' ') : null; });
  check('ERP import: a card "ERP account links · N accounts in your files · M need a link · K linked by hand"', /ERP account links/.test(a || '') && /accounts in your files/.test(a || '') && /2 need a link/.test(a || '') && /2 linked by hand/.test(a || ''), a);
  await page.evaluate(() => document.getElementById('erpLinksCard').click()); await page.waitForTimeout(120);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#modalInner .btn')].find(x => /Back/.test(x.innerText)); if(b) b.click(); }); await page.waitForTimeout(120);
  check('…which opens the list, whose ‹ Back returns to the import screen', !!(await page.evaluate(() => document.getElementById('erpLinksCard'))) && /Import/.test(await modal()));
  // a link no saved file carries (Marketing Philips): listed apart, editable; an internal account is never put on a clinic
  a = await ui('list');
  check('a link with no invoice in the saved files is listed apart ("Links with no invoice…")', /Links with no invoice in the saved files \(1\)/.test(a.text || '') && a.cards.includes(BYSTANDER), a.text && a.text.slice(-200));
  await ui('edit', BYSTANDER);
  const intl = await page.evaluate(() => ({ text: document.getElementById('modalInner').innerText.replace(/\s+/g, ' '), targets: [...document.querySelectorAll('#modalInner [data-target]')].map(x => x.dataset.target) }));
  check('…its editor: no invoice (applies to future uploads), and a company-internal account is never offered a clinic', /applies to future uploads/.test(intl.text) && /never counted on a clinic/.test(intl.text) && JSON.stringify(intl.targets) === JSON.stringify(['@auto', '@channel']), intl);
  // file rows that did not load on this device: changes wait
  await page.evaluate(() => { erpPeriods()[0].rowsMissing = true; }); await ui('edit', KH);
  a = await modal();
  check('a sales file whose rows did not load pauses changes (the figures would be short), with a retry', /did not load on this device/.test(a) && /Load them again/.test(a), a.slice(0, 260));
  a = await ui('card', 'al1');
  check('[D6] …and the clinic card says so too, with the retry — never "(all saved files)"', /did not load on this device/.test(a.text || '') && /Load them again/.test(a.text || '') && !/all saved files/.test(a.text || ''), a.text);
  a = await ui('list');
  check('[D6] …and the list never calls a link one "with no invoice in the saved files" while a file is missing', !/no invoice in the saved files/.test(a.text || '') && /loaded on this device/.test(a.text || ''), a.text && a.text.slice(-260));
  await page.evaluate(() => { delete erpPeriods()[0].rowsMissing; });

  // =============== 10) a save confirmed late: no false "saved", and the screen follows when it lands ===============
  reseed(); await boot();
  await page.evaluate(() => { ERP_LINK_WRITE_MS = 300; });
  mode.delay = { re: /^erpMap$/, ms: 1200 };
  await ui('edit', KH); await ui('pick', 'al3'); await ui('tick'); await ui('save');
  e4 = await ui('err'); f = await figs();
  check('slow cloud: "No confirmation from the cloud yet" and memory unchanged', /No confirmation from the cloud yet/.test(e4.text || '') && f.link === 'al1', { e4, f });
  await sleep(1800); mode.delay = null;
  f = await figs();
  note = await ui('note');
  check('…when it lands while its page is still open: memory follows the cloud, and the page finishes with the Saved note', f.link === 'al3' && cloudMap()[KH] === 'al3' && /Saved/.test(note.text || '') && /Jabriya/.test(note.text || ''), { f, note });
  await page.evaluate(() => { ERP_LINK_WRITE_MS = 12000; });

  // =============== 15) [D1] Undo after "New branch" made from Unrecognized ===============
  reseed({ split: SPLIT_SMILE }); await boot();
  f = await figs();
  let s15 = await acctNow(SMILE);
  check('[D1] seed: Smile Care Fintas matches no clinic (Mariam\'s salesman, 70 KD) — his Oct 175.50, hers 110', f.g === 175.5 && f.m === 110 && s15 && s15.status === 'none', { f, s15 });
  await page.evaluate(() => openErpRecon('oct')); a = await ui('openFrom', SMILE);
  await ui('pick', '@new'); await ui('newRep', G); await ui('tick');
  a = await ui('save');
  const sb = cloudClinics().find(c => c.name === SMILE);
  f = await figs();
  check('[D1] Unrecognized → Link… → New branch (Dr. Ghaith) → Save: the 70 KD now count for him — 245.50 / 40', !!sb && cloudMap()[SMILE] === sb.id && f.g === 245.5 && f.m === 40, { a, sb, f });
  a = await ui('undo'); note = await ui('note'); f = await figs();
  s15 = await acctNow(SMILE);
  const unr15 = await page.evaluate(n => { const st = { mem: clinics.some(c => c.name === n), bin: (recycleBin.clinics || []).some(c => c.name === n) }; openErpRecon('oct'); st.unr = _erpUnmatched.includes(n); return st; }, SMILE);
  check('[D1] Undo restores the exact previous state: "not linked", back in Unrecognized, figures 175.50 / 110 (both reps); the branch removed (cloud, memory) into the recycle bin',
    !a.err && !(SMILE in cloudMap()) && !cloudClinics().some(c => c.name === SMILE) && s15 && s15.status === 'none' && unr15.unr && !unr15.mem && unr15.bin && cloudBin().some(c => c.name === SMILE) && f.g === 175.5 && f.m === 110, { a, s15, unr15, f, map: cloudMap() });
  check('[D1] …and the note says so: the branch was removed and the account is not linked again', /Undone/.test(note.text || '') && /was removed/.test(note.text || '') && /not linked/.test(note.text || '') && !/stays in the clinic list/.test(note.text || ''), note);
  // the same, but a visit was logged at the new branch before Undo: the branch has something of its own and stays
  reseed({ split: SPLIT_SMILE }); await boot();
  await page.evaluate(() => openErpRecon('oct')); await ui('openFrom', SMILE); await ui('pick', '@new'); await ui('newRep', G); await ui('tick'); await ui('save');
  const sb2 = cloudClinics().find(c => c.name === SMILE);
  await page.evaluate(async id => { visits.push({ id: 'vprobe1', clinicId: id, rep: 'Dr. Ghaith', date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: {}, orderTotal: 0, doctorIds: [], notes: 'first visit at the new branch' }); await persist('visits'); }, sb2 && sb2.id);
  a = await ui('undo'); note = await ui('note'); f = await figs();
  s15 = await acctNow(SMILE);
  check('[D1] a visit was logged at the new branch before Undo: the branch stays, only the link is undone — and the account still counts at the branch, by name (245.50 / 40)',
    !a.err && !!sb2 && cloudClinics().some(c => c.id === sb2.id) && !(SMILE in cloudMap()) && s15 && s15.status === 'name' && s15.clinicId === sb2.id && f.g === 245.5 && f.m === 40, { a, s15, f, map: cloudMap() });
  check('[D1] …and the note tells the truth: the branch stays (it has a visit), the account counts at it by name, and removing the branch is what takes it back',
    /Undone/.test(note.text || '') && /stays/.test(note.text || '') && /visit/.test(note.text || '') && /by name/.test(note.text || '') && /remove the branch/i.test(note.text || '') && !/counts again at/.test(note.text || ''), note);

  // =============== 16) [D2] the branch landed or queued, the link did not: the sheet says where it counts NOW ===============
  reseed({ split: SPLIT_SMILE }); await boot();
  await ui('edit', SMILE); await ui('pick', '@new'); await ui('newRep', G); await ui('tick');
  mode.failSet = /^erpMap$/; await ui('save'); mode.failSet = null;
  e4 = await ui('err'); nf = await ui('newFields');
  const br16 = cloudClinics().find(c => c.name === SMILE);
  check('[D2] the branch landed, the link was refused, and the account never had a hand link: the sheet says it already counts at the new branch, by name — not "not linked"',
    !!br16 && /link was not saved/.test(e4.text || '') && /by name/.test(e4.text || '') && !/not linked/.test(e4.text || ''), { e4, br16: !!br16 });
  check('[D2] …the saved branch is shown as text — no name, rep or class to edit, so nothing typed now is silently ignored', nf.locked && nf.name === null && nf.rep === null && /Smile Care Fintas/.test(nf.lockedText || ''), nf);
  await ui('save');
  check('[D2] …the first Save again links the account to that branch (one branch)', !!br16 && cloudMap()[SMILE] === br16.id && cloudClinics().filter(c => c.name === SMILE).length === 1, { map: cloudMap() });
  // the first retry works even when the branch changed another account's match (a spelling variant)
  reseed({ split: SPLIT_VAR }); await boot();
  await ui('edit', KH); await ui('pick', '@new'); pv = await ui('preview');
  check('[D2] a spelling variant would match the new branch by name: it is listed under "Other accounts that change"', /Other accounts that change/i.test(pv.text || '') && (pv.text || '').includes(VARIANT), pv.text);
  await ui('tick');
  mode.failSet = /^erpMap$/; await ui('save'); mode.failSet = null;
  await ui('save');
  e4 = await ui('err');
  const brV = cloudClinics().filter(c => c.name === KH);
  check('[D2] …the branch landed, the link was refused — the FIRST Save again links it (no "figures changed")', brV.length === 1 && cloudMap()[KH] === brV[0].id && !/figures changed/.test(e4.text || ''), { e4, brV: brV.map(c => c.id), map: cloudMap() });
  // the branch only queued on this device (offline)
  reseed({ split: SPLIT_SMILE }); await boot();
  await ui('edit', SMILE); await ui('pick', '@new'); await ui('newRep', G); await ui('tick');
  mode.failSet = /^clinics$/; await ui('save'); mode.failSet = null;
  e4 = await ui('err');
  check('[D2] the branch is queued on this device: the sheet says the link was not saved and where the account counts NOW on this device — the new branch, by name ("not moved" would be false)',
    /this device only/.test(e4.text || '') && /link was not saved/.test(e4.text || '') && /by name/.test(e4.text || '') && !/not moved/.test(e4.text || '') && !/not linked/.test(e4.text || ''), e4);

  // =============== 17) [D3] a save that finishes or lands after the person moved on ===============
  // (a) lands late while another sheet ("Add clinic", half typed) is open
  reseed(); await boot();
  await page.evaluate(() => { ERP_LINK_WRITE_MS = 300; });
  mode.delay = { re: /^erpMap$/, ms: 2000 };
  await ui('edit', KH); await ui('pick', 'al3'); await ui('tick'); await ui('save');
  e4 = await ui('err');
  check('[D3] slow cloud: the timeout message is on the check page', /No confirmation from the cloud yet/.test(e4.text || ''), e4);
  await page.evaluate(() => { closeModal(); openAddClinic(); document.getElementById('mClinicName').value = 'Half typed clinic'; });
  await sleep(2600); mode.delay = null;
  let s17 = await page.evaluate(() => ({ h3: document.querySelector('#modalInner h3').innerText, typed: (document.getElementById('mClinicName') || {}).value || null, shown: document.getElementById('modalBack').classList.contains('show'),
    toast: document.getElementById('toast').textContent, link: erpMap['Aline Dental Clinic - Khairan'] }));
  check('[D3] it lands while "Add clinic" is open with typed text: that sheet is untouched; memory follows; a toast names the account and where it counts now',
    /Add clinic/.test(s17.h3) && s17.typed === 'Half typed clinic' && s17.shown && s17.link === 'al3' && s17.toast.includes(KH) && /Jabriya/.test(s17.toast), s17);
  await ui('list');
  const lc = await page.evaluate(() => { const c = document.getElementById('elLastChange'); return c ? c.innerText.replace(/\s+/g, ' ') : null; });
  check('[D3] …its Undo is reachable from the account list', !!lc && lc.includes(KH) && /Undo/.test(lc), lc);
  a = await ui('undo');
  check('[D3] …and undoes that account: back at Salmiya', !a.err && cloudMap()[KH] === 'al1' && (await figs()).link === 'al1', { a, map: cloudMap() });
  await page.evaluate(() => { ERP_LINK_WRITE_MS = 12000; });
  // (b) the person leaves the page while "Saving…" and opens another account's editor
  reseed(); await boot();
  mode.delay = { re: /^erpMap$/, ms: 1500 };
  await ui('edit', KH); await ui('pick', 'al3'); await ui('tick');
  const during = await page.evaluate(async () => { document.getElementById('elSave').click(); await new Promise(r => setTimeout(r, 120));
    const back = document.getElementById('elBack'); return { saving: !!(_erpLinkSaving || _elBusy), backDisabled: !!(back && back.disabled) }; });
  check('[D3] while "Saving…" the page offers no way to another account: ‹ Pick another is disabled', during.saving && during.backDisabled, during);
  await page.evaluate(() => { closeModal(); openErpLinkEdit('Dental 8 Clinic', 'links'); });
  await sleep(1900); mode.delay = null;
  const s17b = await page.evaluate(() => ({ el: _el ? _el.name : null, h3: document.querySelector('#modalInner h3').innerText, acct: (document.querySelector('#modalInner [dir="auto"]') || {}).innerText || null,
    note: !!document.getElementById('erpImportNote'), toast: document.getElementById('toast').textContent }));
  check('[D3] it finishes while another account\'s editor is open: that editor stays as it was (no note, no page swap, its state untouched)', s17b.el === 'Dental 8 Clinic' && /Where do this account/.test(s17b.h3) && s17b.acct === 'Dental 8 Clinic' && !s17b.note, s17b);
  check('[D3] …the toast names the account that was saved (Khairan, now at Jabriya) — never the one on screen', s17b.toast.includes(KH) && /Jabriya/.test(s17b.toast) && !/Dental 8/.test(s17b.toast), s17b.toast);
  await ui('list'); a = await ui('undo');
  check('[D3] …Undo from the list undoes Khairan (back at Salmiya) and leaves Dental 8 alone', !a.err && cloudMap()[KH] === 'al1' && !('Dental 8 Clinic' in cloudMap()), { a, map: cloudMap() });
  // (c) a retry is confirmed first, then the timed-out first attempt lands
  reseed(); await boot();
  await page.evaluate(() => { ERP_LINK_WRITE_MS = 300; });
  mode.delay = { re: /^erpMap$/, ms: 1500 };
  await ui('card', 'al1'); await ui('openFrom', KH); await ui('pick', 'al3'); await ui('tick'); await ui('save');
  mode.delay = null;
  await ui('save');
  note = await ui('note');
  await page.evaluate(() => { const n = document.getElementById('erpImportNote'); if(n) n.dataset.mark = 'first'; });
  await sleep(1700);
  const s17c = await page.evaluate(() => { const n = document.getElementById('erpImportNote'); return { mark: n ? n.dataset.mark || null : null, h3: document.querySelector('#modalInner h3').innerText }; });
  await sleep(300);
  const log17 = JSON.parse(cloud.erpMapLog || '[]');
  check('[D3] a retry confirmed first, then the timed-out first attempt lands: no second "Saved", the sheet is not redrawn, one log entry', /Saved/.test(note.text || '') && s17c.mark === 'first' && /Salmiya/.test(s17c.h3) && log17.length === 1, { note, s17c, log17 });
  await page.evaluate(() => { ERP_LINK_WRITE_MS = 12000; });

  // =============== 18) [D5] a background refresh during a new-branch save ===============
  // (a) the refresh read the clinic list before the branch landed, and replaced memory while the save was on its way
  reseed(); await boot();
  await ui('card', 'al1'); await ui('openFrom', KH); await ui('pick', '@new'); await ui('tick');
  mode.delay = { re: /^clinics$/, ms: 1200 }; mode.getDelay = { re: /^erpRows/, ms: 500 };
  await page.evaluate(async () => { const p = loadAll(); await new Promise(r => setTimeout(r, 30)); document.getElementById('elSave').click(); await p;
    for(let i = 0; i < 100 && (_elBusy || _erpLinkSaving); i++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 150)); });
  mode.delay = null; mode.getDelay = null;
  const c18 = await page.evaluate(() => { const b = clinics.find(c => c.name === 'Aline Dental Clinic - Khairan') || null; return { err: (document.getElementById('elErr') || {}).innerText || null, branch: b ? b.id : null, link: erpMap['Aline Dental Clinic - Khairan'] }; });
  check('[D5] a refresh that read the clinics before the new branch landed: the branch stays in memory and the link is saved (no "not in the list any more")', !!c18.branch && c18.link === c18.branch && cloudMap()[KH] === c18.branch && !/not in the list/.test(c18.err || ''), c18);
  // (b) the refresh's older list arrives after the link was confirmed
  reseed(); await boot();
  await ui('card', 'al1'); await ui('openFrom', KH); await ui('pick', '@new'); await ui('tick');
  mode.getDelay = { re: /^erpRows/, ms: 1500 };
  await page.evaluate(async () => { const p = loadAll(); await new Promise(r => setTimeout(r, 30)); document.getElementById('elSave').click();
    for(let i = 0; i < 100 && (_elBusy || _erpLinkSaving); i++) await new Promise(r => setTimeout(r, 50));
    await p; await new Promise(r => setTimeout(r, 150)); });
  mode.getDelay = null;
  const c18b = await page.evaluate(() => { const n = 'Aline Dental Clinic - Khairan', x = UMCore.erpAccounts(digestData()).accounts.find(y => y.name === n); return { link: erpMap[n], inMem: clinics.some(c => c.id === erpMap[n]), status: x && x.status }; });
  check('[D5] …and when that refresh lands after the link was confirmed, the branch is still in memory: the account counts at it (never "removed clinic")', c18b.inMem && c18b.status === 'hand' && cloudMap()[KH] === c18b.link, c18b);

  // =============== 19) [D6] notes that must be true ===============
  reseed({ clinics: CL_EXTRA }); await boot();
  await ui('edit', KH); await ui('pick', 'pe1'); pv = await ui('preview');
  check('[D6] to a clinic with no rep: "its invoices count for the salesman who issued them" — never "leave the team totals"', /no rep/.test(pv.text || '') && /count for the salesman who issued them/.test(pv.text || '') && !/leave the team totals/.test(pv.text || '') && /nobody's sales figures change/.test(pv.text || ''), pv.text);
  await ui('back'); await ui('pick', 'ft1'); pv = await ui('preview');
  check('[D6] to a clinic whose rep is not on the team: it counts for Hessa, not on the team — those sales leave the team totals', /Hessa/.test(pv.text || '') && /not on the team/.test(pv.text || '') && /leave the team totals/.test(pv.text || ''), pv.text);
  reseed(); await boot(); await ui('edit', KH); await ui('pick', 'al2');
  cc = await ui('closedCard');
  check('[D6] a same-rep move where only the discount check changes in September: "The discount check changes in" — never that the sales change', cc.rows.includes('discount') && !cc.rows.includes('sales') && /discount check changes in/i.test(cc.text || '') && /September 2026/.test(cc.text || '') && !/Sales change/.test(cc.text || '') && !/Their sales/.test(cc.text || ''), cc);
  reseed({ split: SPLIT_RET }); await boot(); await ui('edit', KH); await ui('pick', 'm1'); pv = await ui('preview');
  const r9 = (pv.months || []).find(x => x[0] === '2026-09'), mvr = (pv.moves || []).find(x => x[0] === '2026-09');
  check('[D6] a September invoice returned in the October file: under "What moves" September shows 60.00 — as the move does — and one line says the return counts in no month (−12.00 KD)',
    !!r9 && /60\.00/.test(r9[1]) && !!mvr && /60\.00/.test(mvr[1]) && /in no month/.test(pv.outside || '') && /12\.00/.test(pv.outside || ''), { months: pv.months, moves: pv.moves, outside: pv.outside });
  reseed({ split: SPLIT_SMILE }); await boot(); await ui('edit', SMILE); await ui('pick', '@new'); pv = await ui('preview');
  check('[D6] an Unrecognized account becomes a branch with its own name: no two first-invoice notes for it (the date does not change)', ((pv.text || '').match(/first invoice:/g) || []).length <= 1, pv.text);
  reseed({ erpMap: { [KH]: 'al1', [BYSTANDER]: '@ignore', [QUOTED]: 'al1' } }); await boot();
  await ui('edit', QUOTED);
  const autoSub = await page.evaluate(() => { const c = document.querySelector('#modalInner [data-target="@auto"]'); return c ? c.innerText.replace(/\s+/g, ' ') : null; });
  await ui('pick', '@auto'); pv = await ui('preview');
  check('[D6] an account invoiced only by a salesman outside the team, set back to automatic: never "goes back to Unrecognized customer names" (it would not be listed there) — it shows as not linked',
    !!autoSub && !/goes back/.test(autoSub) && /not linked/.test(autoSub) && !/goes back/.test(pv.text || '') && /shows as "not linked"/.test(pv.text || ''), { autoSub, pv: pv.text });

  // =============== 20) [D7] smaller ===============
  // (a) the list keeps its search across ‹ Back, Save and ‹ Pick another
  reseed(); await boot();
  await ui('list', { back: 'import' }); await ui('search', 'Dental 8');
  await ui('openFrom', 'Dental 8 Clinic'); await ui('backBtn');
  let ls = await ui('listState');
  check('[D7] the account list keeps its search across ‹ Back from the editor', ls.q === 'Dental 8' && JSON.stringify(ls.cards) === JSON.stringify(['Dental 8 Clinic']), ls);
  await ui('openFrom', 'Dental 8 Clinic'); await ui('pick', 'al3'); await ui('tick'); await ui('save');
  ls = await ui('listState');
  check('[D7] …and after a save', cloudMap()['Dental 8 Clinic'] === 'al3' && ls.q === 'Dental 8' && ls.cards.includes('Dental 8 Clinic'), { ls, map: cloudMap() });
  await ui('card', 'al2');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#clinicErpAccounts button')].find(x => /Count another ERP account here/.test(x.innerText)); if(b) b.click(); });
  await page.waitForTimeout(120);
  await ui('search', 'Khairan'); await ui('openFrom', KH); await ui('back');
  ls = await ui('listState');
  check('[D7] …and across ‹ Pick another in "Count another ERP account here…"', ls.q === 'Khairan' && ls.cards.includes(KH), ls);
  // (b) a line with no customer name in "Unrecognized customer names"
  reseed({ split: SPLIT_NONAME }); await boot();
  const nn = await page.evaluate(() => { openErpRecon('oct'); const dead = [...document.querySelectorAll('#modalInner [data-erp-link]')].filter(b => !b.dataset.erpLink.trim()).length;
    const l = document.getElementById('erpUnrNameless'); return { dead, unr: _erpUnmatched.slice(), line: l ? l.innerText.replace(/\s+/g, ' ') : null }; });
  check('[D7] a line with no customer name: no blank row with a dead Link… button under "Unrecognized customer names" — one line explains it, without a button', nn.dead === 0 && !!nn.line && /no customer name/.test(nn.line) && !/Link…/.test(nn.line), nn);
  // (c) Closed clinics take no new account
  reseed({ clinics: CL_EXTRA }); await boot();
  a = await ui('card', 'cl1');
  const chip = await page.evaluate(() => [...document.querySelectorAll('#clinicErpAccounts button')].some(b => /Count another ERP account here/.test(b.innerText)));
  check('[D7] a Closed clinic\'s card does not offer "Count another ERP account here…"', a.text !== null && !chip, { text: a.text, chip });
  await page.evaluate(() => openErpLinkPreviewFor('Dental 8 Clinic', 'cl1', 'clinic:cl1')); await page.waitForTimeout(200);
  pv = await ui('preview'); await ui('tick'); const pv2 = await ui('preview');
  check('[D7] …and the check page refuses a Closed clinic as the target: it says so and Save stays disabled', /closed/i.test(pv.err || '') && pv.saveDisabled === true && pv2.saveDisabled === true, { err: pv.err, s1: pv.saveDisabled, s2: pv2.saveDisabled });
  // (d) bulk delete names the hand links first
  reseed(); await boot();
  const bd = await page.evaluate(async () => { const msgs = []; const orig = window.confirm; window.confirm = m => { msgs.push(m); return false; };
    try{ openManageClinics(); mgToggle('al1', true); await bulkDeleteClinics(); } finally { window.confirm = orig; }
    return { msgs, still: clinics.some(c => c.id === 'al1') }; });
  check('[D7] Manage clinics → bulk delete says which ERP accounts are linked by hand (count and names) before deleting', bd.msgs.length === 1 && /linked by hand/.test(bd.msgs[0]) && bd.msgs[0].includes(KH) && /\b1\b/.test(bd.msgs[0]) && bd.still, bd);

  // =============== 21) [S] safety: a name reaches the cloud exactly as the file has it, and stays text ===============
  // (1) a CR inside a name: an HTML attribute turns CR / CRLF into a line feed, so a name carried in data-*
  //     keeps its CR only as &#13; — otherwise another key is saved while the screen says "Saved"
  const keysLike = re => Object.keys(cloudMap()).filter(k => re.test(k)).map(k => JSON.stringify(k));
  const crCarried = () => page.evaluate(n => [...document.querySelectorAll('#modalInner [data-erp-link]')].filter(b => /Fintas/.test(b.dataset.erpLink)).map(b => b.dataset.erpLink === n), CRN);
  reseed({ split: SPLIT_CR, erpMap: { [KH]: 'al1', [BYSTANDER]: '@ignore', [CRN]: 'al1' } }); await boot();
  await ui('card', 'al1'); const crCard = await crCarried();
  await ui('list'); const crList = await crCarried();
  await page.evaluate(() => openErpRecon('oct')); const crAudit = await crCarried();
  check('[S1] a name with a line break inside (a two-line ERP cell): the clinic card, the account list and the audit carry it exactly, CR and all',
    crCard.length === 1 && crList.length === 1 && crAudit.length === 1 && crCard.concat(crList, crAudit).every(Boolean), { crCard, crList, crAudit });
  await ui('card', 'al1');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#clinicErpAccounts [data-erp-link]')].find(x => /Fintas/.test(x.dataset.erpLink)); if(b) b.click(); });
  await page.waitForTimeout(150);
  const crEd = await page.evaluate(n => ({ exact: !!_el && _el.name === n, lines: _el ? _el.acc.lines : null, status: _el ? _el.acc.status : null, shownOld: _el ? _el.shownOld : null }), CRN);
  check('[S1] …Move… opens the editor on that very account: 2 invoices, linked by hand to Salmiya', crEd.exact && crEd.lines === 2 && crEd.status === 'hand' && crEd.shownOld === 'al1', crEd);
  await ui('pick', 'al2'); await ui('tick'); a = await ui('save');
  f = await figs();
  check('[S1] …moved to Hawally: its real key changes and no second key appears — Salmiya 145.50, Hawally 130.00, his month 275.50',
    !a.err && cloudMap()[CRN] === 'al2' && keysLike(/Fintas/).length === 1 && f.al1 === 145.5 && f.al2 === 130 && f.g === 275.5, { a, keys: keysLike(/Fintas/), f });
  reseed({ split: SPLIT_CR }); await boot();
  const crU = await page.evaluate(n => { openErpRecon('oct'); return { listed: _erpUnmatched.includes(n), carried: [...document.querySelectorAll('#modalInner [data-erp-link]')].filter(b => /Fintas/.test(b.dataset.erpLink)).map(b => b.dataset.erpLink === n) }; }, CRN);
  check('[S1] not linked: it is under "Unrecognized customer names", and its Link… carries the exact name', crU.listed && crU.carried.length === 2 && crU.carried.every(Boolean), crU);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#modalInner [data-erp-link]')].filter(x => /Fintas/.test(x.dataset.erpLink)).pop(); if(b) b.click(); });
  await page.waitForTimeout(150);
  await ui('pick', 'al2'); await ui('tick'); a = await ui('save');
  const crU2 = await page.evaluate(n => { openErpRecon('oct'); return _erpUnmatched.includes(n); }, CRN);
  check('[S1] …Link… → Hawally: saved under its real key, it leaves the list, Hawally 130.00', !a.err && cloudMap()[CRN] === 'al2' && keysLike(/Fintas/).length === 1 && !crU2 && (await figs()).al2 === 130, { a, keys: keysLike(/Fintas/), crU2 });
  const crG = await page.evaluate(() => { closeModal(); _el = null; openErpLinkEdit('Smile Clinic\nFintas', 'links');
    const r = { el: !!_el, sheet: document.getElementById('modalBack').classList.contains('show') };
    closeModal(); _el = null; openErpLinkPreviewFor('Smile Clinic\nFintas', 'al3', 'links'); r.el2 = !!_el; r.sheet2 = document.getElementById('modalBack').classList.contains('show'); return r; });
  check('[S1] a name that is neither an account of the files nor a stored link (a copy changed on its way) opens no editor — nothing can be saved under it', !crG.el && !crG.sheet && !crG.el2 && !crG.sheet2, crG);

  // (2) an account named "__proto__": assigning that key to a plain object is ignored, and Object.assign drops it
  reseed({ split: SPLIT_PROTO }); await boot();
  await ui('list'); a = await ui('openFrom', '__proto__');
  await ui('pick', 'al2'); pv = await ui('preview');
  const ppv = await page.evaluate(() => _elPv && _elPv.after ? [_elPv.after.status, _elPv.after.clinicId] : null);
  check('[S2] an account named "__proto__": the check says it will count at Hawally, by hand', !a.err && JSON.stringify(ppv) === '["hand","al2"]' && /Hawally/.test(pv.text || ''), { a, ppv, text: (pv.text || '').slice(0, 160) });
  a = await ui('save'); note = await ui('note'); await sleep(300);
  const pMem = await page.evaluate(() => Object.prototype.hasOwnProperty.call(erpMap, '__proto__') ? erpMap['__proto__'] : null);
  const pLog = JSON.parse(cloud.erpMapLog || '[]')[0] || {};
  f = await figs();
  check('[S2] …saved: the cloud and memory hold its own key, Hawally counts its 33.00 (63.00), the note and the log name Hawally',
    !a.err && Object.prototype.hasOwnProperty.call(cloudMap(), '__proto__') && cloudMap()['__proto__'] === 'al2' && pMem === 'al2' && f.al2 === 63 && /Hawally/.test(note.text || '') && pLog.n === '__proto__' && pLog.t === 'al2',
    { a, map: cloud.erpMap, pMem, al2: f.al2, note: note.text, pLog });
  a = await ui('undo');
  check('[S2] …Undo takes that key out again and leaves the other links alone', !a.err && !Object.prototype.hasOwnProperty.call(cloudMap(), '__proto__') && cloudMap()[KH] === 'al1' && cloudMap()[BYSTANDER] === '@ignore' && (await figs()).al2 === 30, { a, map: cloud.erpMap });
  reseed({ split: SPLIT_PROTO }); cloud.erpMap = '{"__proto__":"al3",' + JSON.stringify({ [KH]: 'al1', [BYSTANDER]: '@ignore' }).slice(1); await boot();
  const p3 = await page.evaluate(() => (UMCore.erpAccounts(digestData()).accounts.find(x => x.name === '__proto__') || {}).clinicId || null);
  await ui('edit', KH); await ui('pick', 'al2'); await ui('tick'); a = await ui('save');
  const p3m = await page.evaluate(() => Object.prototype.hasOwnProperty.call(erpMap, '__proto__') ? erpMap['__proto__'] : null);
  check('[S2] the cloud already links "__proto__" to Jabriya: saving another account keeps that link, in the cloud and in memory',
    p3 === 'al3' && !a.err && cloudMap()[KH] === 'al2' && Object.prototype.hasOwnProperty.call(cloudMap(), '__proto__') && cloudMap()['__proto__'] === 'al3' && p3m === 'al3', { p3, a, map: cloud.erpMap, p3m });

  // (3) the change log is bounded by its size, not only by its count: one long name cannot fill a document
  reseed({ split: SPLIT_BIG }); await boot();
  mode.maxBytes = { re: /^erpMapLog$/, bytes: 1048576 };   // a Firestore document holds at most 1 MiB
  await page.evaluate(async n => { for(let i = 0; i < 40; i++) erpLinkLog(n, i % 2 ? 'al1' : 'al2', i === 39 ? 'al3' : i % 2 ? 'al2' : 'al1'); await _elLogChain; await erpLinkLog('Dental 8 Clinic', null, 'al3'); }, BIG);
  mode.maxBytes = null;
  const lgs = cloud.erpMapLog || '', lg = JSON.parse(lgs || '[]');
  check('[S3] 40 changes to an account with a 32,000-character name: the log stays far below a document\'s 1 MiB and records every one of them, and the next change too',
    Buffer.byteLength(lgs) < 262144 && lg.length === 41 && lg[0].n === 'Dental 8 Clinic' && lg[0].t === 'al3' && lg[1].f === 'al1' && lg[1].t === 'al3', { bytes: Buffer.byteLength(lgs), entries: lg.length, top: lg.slice(0, 2).map(e => [String(e.n).slice(0, 24), e.f, e.t]) });
  await ui('edit', BIG); await sleep(300);
  const lastBig = await page.evaluate(() => { const e = document.getElementById('elLast'); return e && e.offsetParent ? e.innerText.replace(/\s+/g, ' ') : null; });
  check('[S3] …and that account\'s editor still finds its last change in the log', /Last change:/.test(lastBig || '') && /Dr\. Ghaith/.test(lastBig || '') && /Salmiya/.test(lastBig || ''), lastBig);

  // (4) a Closed clinic is never a new target, not even through saveErpLink itself; Undo still restores a link it had
  reseed({ clinics: CL_EXTRA }); await boot();
  const s4 = await page.evaluate(n => saveErpLink(n, 'cl1', 'al1'), KH);
  check('[S4] saveErpLink refuses a Closed clinic as a new target (a console call, a page left open): nothing is written', !!s4 && !s4.ok && cloudMap()[KH] === 'al1' && (await figs()).link === 'al1', { s4, map: cloudMap() });
  reseed({ clinics: CL_EXTRA, erpMap: { [KH]: 'al1', [BYSTANDER]: '@ignore', 'Dental 8 Clinic': 'cl1' } }); await boot();
  await ui('edit', 'Dental 8 Clinic'); await ui('pick', 'm1'); await ui('tick'); a = await ui('save');
  const s4b = cloudMap()['Dental 8 Clinic'];
  a = await ui('undo');
  check('[S4] an account linked to a Closed clinic is moved away — and Undo puts it back there (Undo restores; a Closed clinic is never offered)', s4b === 'm1' && !a.err && cloudMap()['Dental 8 Clinic'] === 'cl1', { s4b, a, map: cloudMap() });

  // (5) a long name with no space wraps instead of pushing a sheet sideways
  reseed({ split: SPLIT_WORD }); await boot();
  await ui('edit', WORD); await ui('pick', 'al2');
  a = await ui('fits'); pv = await ui('preview');
  check('[S5] a 420-letter name with no space: the check page, with its first-invoice note, fits a phone', a.page && a.sheet && !a.wide.length && /first invoice/.test(pv.text || ''), a);
  const rcFit = await page.evaluate(() => { openErpRecon('oct'); const s = document.getElementById('modalContent'); return { page: document.documentElement.scrollWidth <= window.innerWidth, sheet: s.scrollWidth <= s.clientWidth + 1, w: s.scrollWidth }; });
  check('[S5] …and the reconciliation sheet never scrolls sideways', rcFit.page && rcFit.sheet, rcFit);

  // (6) a branch made from an ERP name with a quote and code in it: its photo caption is text everywhere
  reseed({ split: SPLIT_EVIL }); await boot();
  await ui('edit', EVIL); await ui('pick', '@new'); await ui('tick'); a = await ui('save');
  const evb = cloudClinics().find(c => c.name === EVIL);
  const lb = await page.evaluate(async id => {
    visits.push({ id: 'vxss1', clinicId: id, rep: 'Dr. Ghaith', date: todayStr(), ts: Date.now(), products: [], orderTaken: false, orders: [], orderItems: {}, orderTotal: 0, doctorIds: [], notes: '',
      photos: [{ id: 'phx1', thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }] });
    await persist('visits');
    const tap = sel => { const img = document.querySelector(sel); if(!img) return 'no photo'; img.click(); const cap = document.getElementById('lbCap').textContent; document.getElementById('lightbox').classList.remove('show'); return cap; };
    const out = {};
    openClinicDetail(id); out.card = tap('#modalInner .photo-thumb');
    closeModal(); switchView('calendar'); calGoToday(); out.calendar = tap('#calAgenda .photo-thumb');
    openVisitLog(); out.visitLog = tap('#vlBody .photo-thumb');
    openPhotoGallery(); out.gallery = tap('#modalInner img[onclick]');
    await new Promise(r => setTimeout(r, 100));
    out.xss = window.__xss || 0;
    closeModal(); switchView('today');
    return out;
  }, evb ? evb.id : null);
  check('[S6] a new branch named after an ERP account with a quote and code in it: its visit photo shows that name as the caption and runs nothing — clinic card, calendar, visit log, photo gallery',
    !!evb && lb.xss === 0 && lb.card === EVIL && lb.calendar === EVIL && lb.visitLog === EVIL && String(lb.gallery).indexOf(EVIL + ' · ') === 0, { made: !!evb, a, lb });

  // (7) customers named like built-in object properties: the reconciliation opens, and nothing leaks into every object
  reseed({ split: SPLIT_PN }); await boot();
  const pn = await page.evaluate(names => { let err = null; try{ openErpRecon('oct'); }catch(e){ err = e.message; }
    const n = name => [...document.querySelectorAll('#modalInner [data-erp-link]')].filter(b => b.dataset.erpLink === name).length;
    return { err, h3: (document.querySelector('#modalInner h3') || {}).innerText || null, unr: names.filter(x => (_erpUnmatched || []).includes(x)), buttons: names.map(n), leaked: ['net', 'sret', 'docs'].filter(k => k in {}) }; }, PROTO_NAMES);
  check('[S7] customers named constructor, toString, __proto__, hasOwnProperty, valueOf: the reconciliation opens, each has its audit row and its Link… under "Unrecognized customer names", and nothing leaks into every object',
    !pn.err && /ERP reconciliation/.test(pn.h3 || '') && pn.unr.length === PROTO_NAMES.length && pn.buttons.every(x => x === 2) && !pn.leaked.length, pn);

  // =============== 11) a rep sees nothing of this ===============
  reseed(); await boot(M, 'rep');
  const rep = await page.evaluate(() => { openClinicDetail('m1'); const out = { section: !!document.getElementById('clinicErpAccounts'), links: document.querySelectorAll('#modalInner [data-erp-link]').length };
    closeModal(); try{ openErpLinks(); }catch(e){ out.err = e.message; } out.toast = document.getElementById('toast').textContent; out.list = !!document.getElementById('elList'); return out; });
  check('Mariam: no ERP accounts section on her clinic card; the account list answers "Supervisor only"', !rep.section && rep.links === 0 && !rep.list && /Supervisor only/.test(rep.toast), rep);

  // =============== 14) an old queued whole-map save in the offline outbox is dropped, never replayed ===============
  reseed(); guard.length = 0;
  await boot(G, 'supervisor', { um_outbox: JSON.stringify(['erpMap']), 'um_mirror:erpMap': JSON.stringify({ [KH]: 'al3' }) });
  await sleep(300);
  const ob = await page.evaluate(() => ({ outbox: outboxList(), link: erpMap['Aline Dental Clinic - Khairan'], mirrorUsed: !!_mirrorUsed.erpMap }));
  a = await ui('list');
  check('outbox: a queued "erpMap" is dropped at boot — the cloud copy is read, the list is not paused, the cloud is untouched', !ob.outbox.includes('erpMap') && ob.link === 'al1' && !ob.mirrorUsed && !/changes are paused/.test(a.text || '') && !/changes are paused/.test(await modal()) && cloudMap()[KH] === 'al1' && guard.length === 0, { ob, guard });
  const pg = await page.evaluate(async () => { const r = await persist('erpMap'); return r; });
  check('a direct persist(\'erpMap\') is refused (the per-account save is the only writer)', pg === false && guard.length === 1 && cloudMap()[KH] === 'al1', { pg, guard });
  guard.length = 0;

  // =============== 12) Arabic, last ===============
  reseed(); await boot();
  await page.evaluate(() => setUiLang('ar')); await page.waitForTimeout(200);
  await ui('edit', KH);
  const ar = await page.evaluate(() => ({ h3: (document.querySelector('#modalInner h3') || {}).innerText, dir: document.getElementById('modalInner').getAttribute('dir'), name: document.querySelector('#modalInner [dir="auto"]') && document.querySelector('#modalInner [dir="auto"]').innerText }));
  check('Arabic: the editor title is Arabic, the ERP name is untouched, the sheet is right to left', /على أي فرع تُحسب فواتير هذا الحساب؟/.test(ar.h3) && ar.name === KH && ar.dir === 'rtl', ar);
  await ui('pick', 'm1');
  const arPv = await modal();
  check('Arabic: the check-before-saving page is Arabic too', /راجِع قبل الحفظ/.test(arPv) && /شهر مغلق/.test(arPv) && arPv.includes(KH), arPv.slice(0, 300));
  const arCard = await page.evaluate(() => { const c = document.getElementById('elClosedCard'); return c ? c.innerText.replace(/\s+/g, ' ') : null; });
  check('[D6] Arabic: the closed-month card says, apart, that the sales change and that new-account wins can change — all in Arabic', /تتغير المبيعات في/.test(arCard || '') && /الحسابات الجديدة/.test(arCard || '') && !/فحص حد الخصم/.test(arCard || '') && !/[A-Za-z]{3,}/.test(arCard || ''), arCard);

  // =============== 13) end ===============
  check('no native dialogs', dialogs.length === 0, dialogs);
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
