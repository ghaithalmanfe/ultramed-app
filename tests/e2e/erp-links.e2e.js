// ERP account links: where an account's invoices count can be changed after a
// wrong choice (v113). The owner's case: Aline has three branches, all his; a
// fourth branch (Khairan) opened before it was in the app, so its ERP account
// was linked by hand to Salmiya. Reproduces that no screen could change the
// link, then checks the editor from every entry point (clinic card, audit,
// Unrecognized list, the account list): a new branch made from the editor
// takes the account and nobody's month moves; Undo; a save the cloud refuses,
// throws on, or confirms late never shows a link the cloud does not hold; two
// devices never overwrite each other's links; a move to another rep's clinic
// shows each month first and asks before touching a closed month; automatic
// matching; names with quotes; links to removed clinics; a rep sees nothing;
// Arabic; and an old queued whole-map save in the offline outbox is dropped.
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
const cloud = {};
const mode = { failSet: null, falseSet: null, failGet: null, delay: null, sets: [] };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get'); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { mode.sets.push(k);
    if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set');
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

// ---- seed: three Aline branches (his), a Mariam clinic; Sep + Oct sales in split storage ----
// packed ERP row: [date, doc, type(1=return), product, qty, gross, net, sret, salesman, brand, customer, cls, dsret, ref]
const row = (d, doc, cust, net, sm, gross) => [d, doc, 0, 'Intensiv Ortho-Strips', 1, gross == null ? net : gross, net, 0, sm, 'Intensiv', cust, 'Clinics', 0, ''];
const SEP = [row('2026-09-14','SINV7001','Aline Dental Clinic - Salmiya',100,GS), row('2026-09-21','SINV7002',KH,60,GS,96), // 37.5% off: within A's 40%, over the 35% of other classes
  row('2026-09-22','SINV7003','Dental 8 Clinic',25,MS)];
const OCT = [row('2026-10-04','SINV7101','Aline Dental Clinic - Salmiya',50,GS), row('2026-10-05','SINV7102','Aline Dental Clinic - Hawally',30,GS),
  row('2026-10-06','SINV7103',KH,80,GS), row('2026-10-07','SINV7104',KH,15.5,GS), row('2026-10-06','SINV7105','Dental 8 Clinic',40,MS),
  // issued by a salesman outside the team: they count for nobody, so no month figure moves
  row('2026-10-03','SINV7106',QUOTED,12,'Stranger'), row('2026-10-03','SINV7107',LONG,7,'Stranger')];
const repMap = { [GS]: G, [MS]: M };
const sum = rows => Math.round(rows.reduce((s, r) => s + r[6], 0) * 1000) / 1000;
const split = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: repMap,
  seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, // one-time boot repairs: already done
  periods: [
    { id: 'sep', from: '2026-09-01', to: '2026-09-30', net: sum(SEP), rowCount: SEP.length, importedAt: '2026-10-01T08:00:00.000Z', repMap, rev: 1, rows: SEP },
    { id: 'oct', from: '2026-10-01', to: '2026-10-08', net: sum(OCT), rowCount: OCT.length, importedAt: '2026-10-09T08:00:00.000Z', repMap, rev: 1, rows: OCT }] });
const CLINICS = [
  {id:'al1', name:'Aline Dental Clinic - Salmiya', rep:G, cls:'A', doctors:[]},
  {id:'al2', name:'Aline Dental Clinic - Hawally', rep:G, cls:'B', doctors:[]},
  {id:'al3', name:'Aline Dental Clinic - Jabriya', rep:G, cls:'B', doctors:[]},
  {id:'m1', name:'Dental 8 Clinic', rep:M, cls:'A', doctors:[]}];
// Every phase can start from this state: the cloud as the owner left it, nothing on the device.
function reseed(o = {}){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.erpSales = JSON.stringify(split.index);                                          // index document
  Object.keys(split.docs).forEach(k => { cloud[k] = JSON.stringify(split.docs[k]); });   // erpRows:<period>:<rev>:<n>
  cloud.erpMap = JSON.stringify(o.erpMap || { [KH]: 'al1', [BYSTANDER]: '@ignore' });    // the bystander must survive every save
  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:'Renova', role:'rep', email:'r@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]); // he sells (default)
  cloud.clinics = JSON.stringify(o.clinics || CLINICS);
  cloud.targets = JSON.stringify({ [G]: { revenue: 2000, month: '2026-10', brands: { Intensiv: 1500 } }, [M]: { revenue: 1000, month: '2026-10', brands: { Intensiv: 800 } } });
  Object.assign(mode, { failSet: null, falseSet: null, failGet: null, delay: null });
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
      if(fn === 'preview'){ const p = q('#elPreview'); if(!p) return { err: 'no #elPreview' };
        const s = q('#elSave');
        return { text: txt(p), months: [...p.querySelectorAll('.el-month[data-month]')].map(e => [e.dataset.month, txt(e)]),
          moves: [...p.querySelectorAll('.el-move[data-month]')].map(e => [e.dataset.month, txt(e)]),
          today: [...p.querySelectorAll('.el-today[data-rep]')].map(e => [e.dataset.rep, txt(e)]),
          closedOk: !!q('#elClosedOk'), saveDisabled: s ? s.disabled : null, err: txt(q('#elErr')) }; }
      if(fn === 'tick'){ const c = q('#elClosedOk'); if(!c) return { err: 'no #elClosedOk' }; c.checked = true; c.dispatchEvent(new Event('change')); await wait(40); return { saveDisabled: q('#elSave').disabled }; }
      if(fn === 'save' || fn === 'undo'){ const b = fn === 'save' ? q('#elSave') : document.getElementById('elUndo'); if(!b) return { err: 'no ' + fn + ' button' };
        if(b.disabled) return { err: fn + ' button disabled' };
        b.click(); await wait(80);
        for(let i = 0; i < 60 && (_erpLinkSaving || (typeof _elBusy !== 'undefined' && _elBusy)); i++) await wait(50);
        await wait(150); return { ok: true }; }
      if(fn === 'back'){ const b = q('#elBack'); if(!b) return { err: 'no #elBack' }; b.click(); await wait(150); return { ok: true }; }
      if(fn === 'newFields'){ const n = q('#elNewName'), r = q('#elNewRep .chip.on'), c = q('#elNewCls .chip.on'), s = q('#elSave');
        return { name: n ? n.value : null, rep: r ? r.dataset.rep : null, cls: c ? c.dataset.cls : null, nameErr: txt(q('#elNewNameErr')), hint: txt(q('#elNewHint')), saveDisabled: s ? s.disabled : null }; }
      if(fn === 'setNewName'){ const n = q('#elNewName'); if(!n) return { err: 'no #elNewName' }; n.focus(); n.value = arg; n.dispatchEvent(new Event('input')); await wait(450);
        return { focused: document.activeElement === n, saveDisabled: q('#elSave').disabled, nameErr: txt(q('#elNewNameErr')) }; }
      if(fn === 'err'){ const e = q('#elErr'); return { text: txt(e), shown: !!(e && e.offsetParent), saveDisabled: q('#elSave') ? q('#elSave').disabled : null }; }
      if(fn === 'note'){ return { text: txt(document.getElementById('erpImportNote')), undo: !!document.getElementById('elUndo') }; }
      if(fn === 'fits'){ // a phone: nothing wider than the sheet, no sideways page scroll
        const sheet = document.getElementById('modalContent'), wide = [...document.querySelectorAll('#modalInner *')].filter(e => e.getBoundingClientRect().right > sheet.getBoundingClientRect().right + 1 || e.getBoundingClientRect().left < sheet.getBoundingClientRect().left - 1);
        return { page: document.documentElement.scrollWidth <= window.innerWidth, sheet: sheet.scrollWidth <= sheet.clientWidth + 1, wide: wide.slice(0, 3).map(e => e.tagName + '.' + e.className + ' ' + (e.innerText || '').slice(0, 40)) }; }
      return { err: 'unknown ' + fn };
    }catch(e){ return { err: e.message }; }
  }, {fn, arg});

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
  check('preview: September 1 × 60.00 (closed), October 2 × 95.50, "Still counts for Dr. Ghaith", nothing changes hands', !pv.err && !!m9 && /1 ×/.test(m9[1]) && /60\.00/.test(m9[1]) && !!m10 && /2 ×/.test(m10[1]) && /95\.50/.test(m10[1]) && /Still counts for/i.test(pv.text) && /Dr\. Ghaith/.test(pv.text) && !pv.moves.length && pv.saveDisabled === false, pv);
  check('nothing saved before the tap', cloudMap()[KH] === 'al1' && cloudClinics().length === 4 && (await figs()).link === 'al1');
  a = await ui('fits');
  check('phone (390 px): the check-before-saving page fits too', a.page && a.sheet && !a.wide.length, a);
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
  reseed(); await boot(); await ui('card', 'al1'); await ui('openFrom', KH); await ui('pick', '@new'); await ui('save');
  const made2 = cloudClinics().find(c => c.name === KH);
  a = await ui('undo'); note = await ui('note'); f = await figs();
  check('Undo after the new branch: the account counts at Salmiya again (cloud and memory), the branch stays in the cloud and the note says so', !a.err && !!made2 && cloudMap()[KH] === 'al1' && f.link === 'al1' && f.al1 === 145.5 && cloudClinics().filter(c => c.id === made2.id).length === 1 && /Undone/.test(note.text || '') && /branch stays/i.test(note.text || ''), { a, note, map: cloudMap(), f });
  await sleep(300);
  const log2 = JSON.parse(cloud.erpMapLog || '[]');
  check('…both changes are in the log, newest first', log2.length === 2 && log2[0].f === (made2 && made2.id) && log2[0].t === 'al1' && log2[1].t === (made2 && made2.id), log2);
  // the branch that now exists is offered with its siblings; moving to it and undoing that leaves no branch note
  await boot(); await ui('edit', KH); await sleep(250);
  const last = await page.evaluate(() => { const e = document.getElementById('elLast'); return e && e.offsetParent ? e.innerText.replace(/\s+/g, ' ') : null; });
  check('the editor shows the last change from the log: when, who, and where it counted before', /Last change:/.test(last || '') && /Dr\. Ghaith/.test(last || '') && /before:/.test(last || '') && /Aline Dental Clinic - Khairan/.test(last || ''), last);
  const tg3 = await page.evaluate(() => [...document.querySelectorAll('#modalInner [data-target]')].map(x => x.dataset.target));
  check('the new branch is now offered among the branches of the same clinic', !!made2 && tg3.includes(made2.id) && !tg3.includes('al1'), tg3); // al1: "counted here now", not a choice
  await ui('pick', made2 && made2.id); await ui('save');
  a = await ui('undo'); note = await ui('note');
  check('Undo of a plain move: back at Salmiya, no word about a new branch', !a.err && cloudMap()[KH] === 'al1' && /Undone/.test(note.text || '') && !/branch stays/i.test(note.text || ''), { a, note });

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
  reseed(); await boot(); await ui('edit', KH); await ui('pick', '@new');
  mode.failSet = /^clinics$/; mode.sets = [];
  await ui('save'); mode.failSet = null;
  let e4 = await ui('err');
  check('(c) clinics refused: "saved on this device only… the account was not moved", no write to erpMap', e4.shown && /this device only/.test(e4.text || '') && /not moved/.test(e4.text || '') && !mode.sets.includes('erpMap') && cloudMap()[KH] === 'al1' && !cloudClinics().some(c => c.name === KH), { e4, sets: mode.sets });
  f = await figs();
  check('(c) …memory still counts Khairan at Salmiya', f.link === 'al1' && f.al1 === 145.5, f);
  // (d) the branch lands, the link does not — then Save again: one branch, the same id
  reseed(); await boot(); await ui('edit', KH); await ui('pick', '@new');
  mode.failSet = /^erpMap$/;
  await ui('save'); mode.failSet = null;
  e4 = await ui('err');
  const madeD = cloudClinics().filter(c => c.name === KH);
  check('(d) link refused after the branch landed: "the new branch was added, but the link was not saved"', e4.shown && /new branch was added/.test(e4.text || '') && /not saved/.test(e4.text || '') && madeD.length === 1 && cloudMap()[KH] === 'al1', { e4, madeD });
  await ui('save');
  const madeD2 = cloudClinics().filter(c => c.name === KH);
  check('(d) Save again: the link points at that branch and there is exactly one branch with that name', madeD2.length === 1 && cloudMap()[KH] === madeD2[0].id && (await figs()).link === madeD2[0].id, { madeD2, map: cloudMap() });
  // (e) a new branch whose name is taken is refused inline; a new name is typed without losing focus
  await boot(); await ui('edit', KH); await ui('pick', '@new');
  nf = await ui('newFields');
  check('(e) a name that already exists is refused inline and Save is disabled', /already exists/.test(nf.nameErr || '') && nf.saveDisabled === true, nf);
  a = await ui('setNewName', 'Aline Dental Clinic - Khairan Mall');
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
  await boot(); await ui('edit', KH); await ui('pick', 'al2');
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
  const toast = await page.evaluate(() => document.getElementById('toast').textContent);
  check('…when it lands: memory follows the cloud and a message says so', f.link === 'al3' && cloudMap()[KH] === 'al3' && /وصل تغيير الربط/.test(toast), { f, toast });
  await page.evaluate(() => { ERP_LINK_WRITE_MS = 12000; });

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

  // =============== 13) end ===============
  check('no native dialogs', dialogs.length === 0, dialogs);
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
