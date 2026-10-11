// Late landings of account-link saves and Undos (v113 review, round 3): a write
// the app stopped waiting for lands while the person keeps working. Port 8209.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8209;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cloud = {};
const mode = { failSet: null, falseSet: null, failGet: null, delay: null, getDelay: null, sets: [] };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get');
    const v = k in cloud ? cloud[k] : null;
    if(mode.getDelay && mode.getDelay.re.test(k)) await sleep(mode.getDelay.ms);
    return v; },
  set: async (k, v) => { mode.sets.push(k);
    if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set');
    if(mode.falseSet && mode.falseSet.test(k)) return false;
    if(mode.delay && mode.delay.re.test(k)) await sleep(mode.delay.ms);
    cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k]) => mode.sets.push(k)); if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const G = 'Dr. Ghaith', M = 'Mariam', GS = 'Ghaith Al Manfe', MS = 'Mariam Zohair';
const KH = 'Aline Dental Clinic - Khairan', BYSTANDER = 'Marketing Philips';
const SMILE = 'Smile Care Fintas';
const VARIANT = 'ALINE DENTAL CLINIC - KHAIRAN';
const row = (d, doc, cust, net, sm, gross) => [d, doc, 0, 'Intensiv Ortho-Strips', 1, gross == null ? net : gross, net, 0, sm, 'Intensiv', cust, 'Clinics', 0, ''];
const ret = (d, doc, cust, net, sm, ref) => [d, doc, 1, 'Intensiv Ortho-Strips', -1, 0, net, -net, sm, 'Intensiv', cust, 'Clinics', 0, ref];
const SEP = [row('2026-09-14','SINV7001','Aline Dental Clinic - Salmiya',100,GS), row('2026-09-21','SINV7002',KH,60,GS,96), row('2026-09-22','SINV7003','Dental 8 Clinic',25,MS)];
const OCT = [row('2026-10-04','SINV7101','Aline Dental Clinic - Salmiya',50,GS), row('2026-10-05','SINV7102','Aline Dental Clinic - Hawally',30,GS),
  row('2026-10-06','SINV7103',KH,80,GS), row('2026-10-07','SINV7104',KH,15.5,GS), row('2026-10-06','SINV7105','Dental 8 Clinic',40,MS)];
const repMap = { [GS]: G, [MS]: M };
const sum = rows => Math.round(rows.reduce((s, r) => s + r[6], 0) * 1000) / 1000;
const makeSplit = (sep, oct) => core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: repMap,
  seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true },
  periods: [
    { id: 'sep', from: '2026-09-01', to: '2026-09-30', net: sum(sep), rowCount: sep.length, importedAt: '2026-10-01T08:00:00.000Z', repMap, rev: 1, rows: sep },
    { id: 'oct', from: '2026-10-01', to: '2026-10-08', net: sum(oct), rowCount: oct.length, importedAt: '2026-10-09T08:00:00.000Z', repMap, rev: 1, rows: oct }] });
const split = makeSplit(SEP, OCT);
const SPLIT_SMILE = makeSplit(SEP, OCT.concat([row('2026-10-08','SINV7108',SMILE,70,MS)]));
const SPLIT_VAR = makeSplit(SEP, OCT.concat([row('2026-10-02','SINV7129',VARIANT,6,MS)]));
const CLINICS = [
  {id:'al1', name:'Aline Dental Clinic - Salmiya', rep:G, cls:'A', doctors:[]},
  {id:'al2', name:'Aline Dental Clinic - Hawally', rep:G, cls:'B', doctors:[]},
  {id:'al3', name:'Aline Dental Clinic - Jabriya', rep:G, cls:'B', doctors:[]},
  {id:'m1', name:'Dental 8 Clinic', rep:M, cls:'A', doctors:[]}];
function reseed(o = {}){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  const sp = o.split || split;
  cloud.erpSales = JSON.stringify(sp.index);
  Object.keys(sp.docs).forEach(k => { cloud[k] = JSON.stringify(sp.docs[k]); });
  cloud.erpMap = JSON.stringify(o.erpMap || { [KH]: 'al1', [BYSTANDER]: '@ignore' });
  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify(o.clinics || CLINICS);
  cloud.targets = JSON.stringify({ [G]: { revenue: 2000, month: '2026-10', brands: { Intensiv: 1500 } }, [M]: { revenue: 1000, month: '2026-10', brands: { Intensiv: 800 } } });
  Object.assign(mode, { failSet: null, falseSet: null, failGet: null, delay: null, getDelay: null });
}
async function setup(){
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
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { const t = m.text(); if(m.type() === 'error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-(set|get)|save failed|erpMap is saved per account/i.test(t)) errors.push('console: ' + t); });
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
  await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
  await page.exposeFunction('__cSetMany', api.setMany);
  await page.exposeFunction('__cDelay', async k => { mode.sets.push('update:' + k); if(mode.delay && mode.delay.re.test(k)) await sleep(mode.delay.ms); return true; });
  await page.exposeFunction('__cGetRaw', async k => (k in cloud ? cloud[k] : null));
  await page.exposeFunction('__cSetRaw', async (k, v) => { if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set'); if(mode.falseSet && mode.falseSet.test(k)) return false; cloud[k] = v; return true; });
  await page.addInitScript(() => {
    const useUpdate = (() => { try{ return localStorage.getItem('__h_update') === '1'; }catch(e){ return false; } })();
    window.storage = {
      get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.__cSet(k, v),
      setMany: async entries => window.__cSetMany(entries),
      delete: async k => window.__cDel(k),
      list: async p => ({ keys: await window.__cList(p) }),
      update: !useUpdate ? undefined : async (k, fn) => { await window.__cDelay(k); const cur = await window.__cGetRaw(k); const next = fn(cur); if(next == null) return null; const ok = await window.__cSetRaw(k, next); if(!ok) throw new Error('set failed'); return next; },
    };
    const off = new Date(2026, 9, 11, 10, 0, 0).getTime() - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  const boot = async (who=G, role='supervisor', local) => {
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(150);
    await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local || null);
    await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
    await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
    await page.waitForTimeout(250);
  };
  const cloudMap = () => JSON.parse(cloud.erpMap || '{}');
  const cloudClinics = () => JSON.parse(cloud.clinics || '[]');
  const figs = (id) => page.evaluate(id => { const d = digestData(), sep = Object.assign({}, d, { today: '2026-09-30' });
    const cs = caMonthClinicSales(), kd = x => cs[x] ? Math.round(cs[x].net * 100) / 100 : 0;
    return { g: UMCore.monthAchievement('Dr. Ghaith', d).amount, m: UMCore.monthAchievement('Mariam', d).amount,
      gSep: UMCore.monthAchievement('Dr. Ghaith', sep).amount, mSep: UMCore.monthAchievement('Mariam', sep).amount,
      al1: kd('al1'), al2: kd('al2'), al3: kd('al3'), m1: kd('m1'), id: id ? kd(id) : null,
      link: Object.prototype.hasOwnProperty.call(erpMap, 'Aline Dental Clinic - Khairan') ? erpMap['Aline Dental Clinic - Khairan'] : null }; }, id || null);
  const acctNow = name => page.evaluate(n => { const a = UMCore.erpAccounts(digestData()).accounts.find(x => x.name === n), c = a && clinics.find(x => x.id === a.clinicId);
    return a ? { status: a.status, clinicId: a.clinicId, at: c ? c.name : null, link: a.link } : null; }, name);
  const modal = () => page.evaluate(() => document.getElementById('modalInner').innerText.replace(/\s+/g, ' '));
  const ui = (fn, arg) => page.evaluate(async ({fn, arg}) => {
    const q = s => document.querySelector('#modalInner ' + s);
    const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const linkBtn = name => [...document.querySelectorAll('#modalInner [data-erp-link]')].find(b => b.dataset.erpLink === name);
    try{
      if(fn === 'card'){ openClinicDetail(arg); await wait(120); const s = document.getElementById('clinicErpAccounts');
        return { text: txt(s), links: s ? [...s.querySelectorAll('[data-erp-link]')].map(b => b.dataset.erpLink) : [] }; }
      if(fn === 'list'){ openErpLinks(arg || {}); await wait(120);
        const l = document.getElementById('elList'); return { text: txt(l), cards: l ? [...l.querySelectorAll('[data-erp-link]')].map(c => c.dataset.erpLink) : [] }; }
      if(fn === 'edit'){ openErpLinkEdit(arg, 'links'); await wait(150); return { ok: true }; }
      if(fn === 'openFrom'){ const b = linkBtn(arg); if(!b) return { err: 'no [data-erp-link] for ' + arg }; b.click(); await wait(150); return { ok: true }; }
      if(fn === 'pick'){ let c = q(`[data-target="${arg}"]`);
        if(!c && arg[0] !== '@'){ const s = q('#elClinicSearch'); const cl = clinics.find(x => x.id === arg);
          if(s && cl){ s.value = cl.name; s.dispatchEvent(new Event('input')); await wait(60); c = q(`#elPick [data-target="${arg}"]`); } }
        if(!c) return { err: 'no target ' + arg }; c.click(); await wait(200); return { ok: true }; }
      if(fn === 'newRep'){ const c = q(`#elNewRep .chip[data-rep="${arg}"]`); if(!c) return { err: 'no rep chip ' + arg }; c.click(); await wait(200); return { ok: true }; }
      if(fn === 'preview'){ const p = q('#elPreview'); if(!p) return { err: 'no #elPreview' };
        const s = q('#elSave');
        return { text: txt(p), closedOk: !!q('#elClosedOk'), saveDisabled: s ? s.disabled : null, err: txt(q('#elErr')) }; }
      if(fn === 'tick'){ const c = q('#elClosedOk'); if(!c) return { err: 'no #elClosedOk' }; c.checked = true; c.dispatchEvent(new Event('change')); await wait(40); return { saveDisabled: q('#elSave').disabled }; }
      if(fn === 'save' || fn === 'undo'){ const b = fn === 'save' ? q('#elSave') : document.getElementById('elUndo'); if(!b) return { err: 'no ' + fn + ' button' };
        if(b.disabled) return { err: fn + ' button disabled' };
        b.click(); await wait(80);
        for(let i = 0; i < 60 && (_erpLinkSaving || (typeof _elBusy !== 'undefined' && _elBusy)); i++) await wait(50);
        await wait(150); return { ok: true }; }
      if(fn === 'back'){ const b = q('#elBack'); if(!b) return { err: 'no #elBack' }; b.click(); await wait(150); return { ok: true }; }
      if(fn === 'err'){ const e = q('#elErr'); return { text: txt(e), shown: !!(e && e.offsetParent), saveDisabled: q('#elSave') ? q('#elSave').disabled : null, reopen: !!q('#elReopen') }; }
      if(fn === 'note'){ return { text: txt(document.getElementById('erpImportNote')), undo: !!document.getElementById('elUndo') }; }
      return { err: 'unknown ' + fn };
    }catch(e){ return { err: e.message }; }
  }, {fn, arg});
  const sheetNow = () => page.evaluate(() => ({ h3: (document.querySelector('#modalInner h3') || {}).innerText || null, shown: document.getElementById('modalBack').classList.contains('show'),
    toast: document.getElementById('toast').textContent, toastShown: document.getElementById('toast').classList.contains('show'), el: typeof _el !== 'undefined' && _el ? _el.name : null,
    err: ((document.querySelector('#modalInner #elErr') || {}).innerText || '').replace(/\s+/g, ' ') || null,
    errShown: !!(document.querySelector('#modalInner #elErr') && document.querySelector('#modalInner #elErr').offsetParent),
    save: document.querySelector('#modalInner #elSave') ? { disabled: document.querySelector('#modalInner #elSave').disabled, text: document.querySelector('#modalInner #elSave').innerText } : null,
    note: ((document.getElementById('erpImportNote') || {}).innerText || '').replace(/\s+/g, ' ') || null }));
  const close = async () => { await browser.close(); server.close(); };
  return { page, cloud, mode, reseed, boot, figs, acctNow, modal, ui, sheetNow, cloudMap, cloudClinics, errors, dialogs, close, sleep };
}


// ---- checks
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok ? '✅' : '❌') + ' ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); if(!ok) failed++; }
const B = { reseed, cloud, mode, G, KH, SMILE, SPLIT_SMILE };
(async () => {
  const t = await setup(); const { page, ui, sheetNow, cloudMap, mode, sleep, acctNow } = t;
  const slow = async (ms, wait) => { await page.evaluate(w => { ERP_LINK_WRITE_MS = w; }, wait); mode.delay = { re: /^erpMap$/, ms }; };
  const fast = async () => { mode.delay = null; await page.evaluate(() => { ERP_LINK_WRITE_MS = 12000; }); };
  // 1 · an Undo that lands late changes only its note: what the person typed meanwhile on that sheet stays
  for(const kind of ['plain', 'branch']){
    B.reseed(kind === 'branch' ? { split: B.SPLIT_SMILE } : {}); await t.boot();
    if(kind === 'plain'){ await ui('card', 'al1'); await ui('openFrom', B.KH); await ui('pick', 'al3'); await ui('tick'); await ui('save'); }
    else { await page.evaluate(() => { openClinicDetail('al2'); }); await sleep(150); await ui('edit', B.SMILE); await page.evaluate(() => { _el.back = 'clinic:al2'; });
      await ui('pick', '@new'); await ui('newRep', B.G); await ui('tick'); await ui('save'); }
    await slow(1800, 300);
    await ui('undo');
    await page.evaluate(() => { const a = document.getElementById('profileNotesEdit'), b = document.getElementById('newDocName'); if(a) a.value = 'Half typed profile note'; if(b) b.value = 'Dr. Half Typed'; });
    await sleep(2600); await fast();
    const s = await sheetNow();
    const kept = await page.evaluate(() => ({ notes: (document.getElementById('profileNotesEdit') || {}).value, doc: (document.getElementById('newDocName') || {}).value }));
    check(`late Undo (${kind}): the card stays, the typed text is kept, the note says Undone and to reopen for the figures`,
      kept.notes === 'Half typed profile note' && kept.doc === 'Dr. Half Typed' && /Undone/.test(s.note || '') && /Reopen this page/.test(s.note || '') && /Aline Dental Clinic - (Salmiya|Hawally)/.test(s.h3 || ''), { h3: s.h3, note: s.note, kept });
    check(`late Undo (${kind}): the cloud is back where it was`, kind === 'plain' ? cloudMap()[B.KH] === 'al1' : !(B.SMILE in cloudMap()), cloudMap());
  }
  // 2 · an Undo tapped on the list's "Last change" card that lands late: the person stays on the list with the search
  B.reseed(); await t.boot();
  await ui('card', 'al1'); await ui('openFrom', B.KH); await ui('pick', 'al3'); await ui('tick'); await ui('save');
  await page.evaluate(() => { closeModal(); openErpLinks({}); }); await sleep(150);
  await slow(1800, 300);
  await ui('undo');
  await page.evaluate(() => { const s = document.getElementById('elSearch'); s.value = 'Dental 8'; s.dispatchEvent(new Event('input')); });
  await sleep(2600); await fast();
  const l = await sheetNow(), search = await page.evaluate(() => (document.getElementById('elSearch') || {}).value || null);
  check('late Undo from the list: the list and its search stay, a toast says Undone', /ERP account links/.test(l.h3 || '') && search === 'Dental 8' && /Undone/.test(l.toast || '') && cloudMap()[B.KH] === 'al1', { h3: l.h3, search, toast: l.toast });
  // 3 · this device's own earlier write lands while a second save of the same account is on its way: never "another device"
  B.reseed(); await t.boot('Dr. Ghaith', 'supervisor', { '__h_update': '1' });
  await ui('card', 'al1'); await ui('openFrom', B.KH); await ui('pick', 'al3'); await ui('tick'); await ui('save');
  await slow(1500, 300);
  await ui('undo');
  await slow(3000, 8000);
  await ui('edit', B.KH); await ui('pick', 'al2'); await ui('tick');
  await page.evaluate(() => { const b = document.querySelector('#modalInner #elSave'); if(b && !b.disabled) b.click(); });
  await sleep(4500); await fast(); await sleep(300);
  const c = await sheetNow();
  check('own late Undo vs a new save: the page says the earlier change from this device landed, not "another device"',
    /your earlier change/i.test(c.err || '') && !/another device/.test(c.err || ''), { err: c.err });
  check('…and the cloud keeps the Undo (Salmiya)', cloudMap()[B.KH] === 'al1', cloudMap()[B.KH]);
  check('no page errors', t.errors.length === 0, t.errors);
  check('no native dialogs', t.dialogs.length === 0, t.dialogs);
  await t.close();
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
