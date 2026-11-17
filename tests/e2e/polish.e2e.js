// Small truth fixes found while the guides were checked against the code (alerts-v126 at 6b3f503). Each check
// below fails on 6b3f503 and states the correct result — but the guards, which pass on both: H0, H1's setup line and
// its line once the photo has landed, and "no page errors". Invented data only.
//   H  Help & Support's "Waiting to be sent" counts everything this phone has not put in the cloud: a visit photo
//      waiting or kept on this phone (H1), only in the app's memory (H2), this phone's own photo not confirmed in the
//      cloud yet (H3), a list kept only in the app's memory (H4), a list kept on this phone and not sent because the
//      cloud refused it (H5), the delete log by its name, in Arabic (H6), another phone's photo (H7) — and says
//      "Nothing — everything has reached the cloud" only when that is true (H0). Until then the line read the queue
//      alone and said "Nothing" while a visit photo waited.
//   A  Arabic left in English: the offline pill (A1), the follow-up sheet (A2), the sign-in errors (A3), Territory —
//      Shared, Gov, the distribution upload, its save button and what they tell (A4), the admin tab "Email reports" and
//      its headings (A5), the KPI settings' fields and their saved message (A6)
//   O  the order-only sheet never calls an order logged in the app revenue — the owner's rule: orders logged in the
//      app are never sales (English and Arabic)
//   P  one pace rule everywhere (the owner's decision of 17 Nov: "on pace" from 90 % of the expected share, UMCore.paceOf)
//      — each check fails on 239c2c3: the Reports and Admin team line (teamTargetRow) said "On pace" from 60 % of the
//      target whatever the day (P1: 70 % of an even pace on Nov 26) and "Behind" below it (P1b: 94 % of an even pace on
//      Nov 9); the Reports colours, the month close, the printed report's Total row and brand pills judged by 60 % too
//      (P2–P4); the home's forecast tile rounded 89.7 % of an even pace to "90%" beside "Behind pace" (P5)
// The clock is fixed (Wed 11 Nov 2026, 13:30, ticking; P1–P4: Thu 26 Nov). Port 8302. Env: ONLY=H,A,O,P  WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const core = require(path.resolve(WWW, 'js/core.js'));
const PORT = 8302, URL = `http://localhost:${PORT}/index.html`;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const cloud = {};
const mode = { failSet: null, failGet: null, denySet: null };
const deny = k => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; };
const api = {
  get: async k => { if(mode.failGet && mode.failGet.test(k)) throw new Error('boom-get ' + k); return k in cloud ? cloud[k] : null; },
  set: async (k, v) => { if(mode.denySet && mode.denySet.test(k)) throw deny(k); if(mode.failSet && mode.failSet.test(k)) throw new Error('boom-set ' + k); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) throw new Error('boom-set'); entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith', MS = 'Mariam Sample', RS = 'Ranova Sample Person';
// a sales file of the month (invented lines, the ERP export's columns): its rows and its days
const row = (d, doc, cust, net, sm) => [d, doc, 0, 'Waterpik Cordless Plus', 1, net, net, 0, sm, 'Waterpik', cust, 'Clinics', 0, ''];
const file = (id, to, rows) => ({ id, from: '2026-11-01', to, repMap: { [MS]: M, [RS]: R }, rows, rowCount: rows.length, net: Math.round(rows.reduce((a, r) => a + r[6], 0) * 100) / 100 });
const C = (id, name, rep, x) => Object.assign({ id, name, rep, cls: 'B', doctors: [] }, x || {});
const FILL = Array.from({ length: 14 }, (_, i) => C('f' + (i + 1), 'Filler Clinic ' + (i + 1), i % 2 ? R : M));   // a team-sized list
const THUMB = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
function seed(opts){
  opts = opts || {};
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  Object.keys(mode).forEach(k => { mode[k] = null; });
  cloud.staff = twoRepStaff();   // Mariam and Renova sell; Dr. Ghaith supervises and does not
  cloud.clinics = JSON.stringify([C('m1', 'Amberline Clinic', M, { cls: 'A', nextFollowUp: '2026-11-05', doctors: [{ id: 'd1', name: 'Dr. Huda Sample' }] }),
    C('m2', 'Birchwood Center', M, { doctors: [{ id: 'd2', name: 'Dr. Basil Sample' }] }), C('r1', 'Fernhill Center', R)].concat(FILL));
  cloud.visits = JSON.stringify(opts.visits || [{ id: 'v1', clinicId: 'm2', rep: M, date: '2026-11-09', doctorIds: ['d2'] }]);
  cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.erpMap = '{}';
  cloud.targets = JSON.stringify(opts.targets || { [M]: { revenue: 10000, month: '2026-11' }, [R]: { revenue: 2000, month: '2026-11' } });
  // the one-time repair sweeps of earlier releases have run, as on the team's phones; opts.periods: the month's sales files
  const sp = core.erpSplitForStorage({ returnPolicy: 'origin', repMapGlobal: opts.periods ? { [MS]: M, [RS]: R } : {}, seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true }, periods: opts.periods || [] });
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
  // A phone: its own browser context (its own web storage and IndexedDB). opts.noIDB: no IndexedDB at all;
  // opts.fullRe: web-storage keys this phone has no room for (a full phone).
  const phone = async (opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 } });
    await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom/i.test(m.text())) errors.push('console: '+m.text()); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
    await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
    await page.exposeFunction('__cSetMany', api.setMany);
    await page.addInitScript(({ noIDB, fullRe, now }) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v),
        setMany: async entries => window.__cSetMany(entries),
        delete: async k => window.__cDel(k),
        list: async p => ({ keys: await window.__cList(p) }),
      };
      const off = (now || new Date(2026, 10, 11, 13, 30, 0).getTime()) - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      // the 20-second round driven by hand
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = () => fn(); return -1; } return _si(fn, ms, ...a); };
      if(noIDB){ try{ Object.defineProperty(window, 'indexedDB', { get(){ return undefined; }, configurable: true }); }catch(e){} }
      if(fullRe){ const re = new RegExp(fullRe), real = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(re.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; }
      // a photo as pickImage hands it over: a full image and its thumbnail (data URLs)
      window.__shot = n => { const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = ['#c33', '#3a3', '#33c'][n % 3]; x.fillRect(0, 0, w, h); return c.toDataURL('image/jpeg', 0.8); };
        return { id: uid(), full: mk(160, 120), thumb: mk(40, 30) }; };
    }, { noIDB: !!opts.noIDB, fullRe: opts.fullRe || null, now: opts.now || null });
    const boot = async (who, role, local) => {
      await page.goto(URL); await page.waitForTimeout(150);
      await page.evaluate(l => { try{ localStorage.clear(); Object.keys(l || {}).forEach(k => localStorage.setItem(k, l[k])); }catch(e){} }, local || null);
      await page.goto(URL); await page.waitForTimeout(250);
      if(who){ await page.evaluate(async ({ who, role }) => { await selectUser(who, role); }, { who, role }); await page.waitForTimeout(350); await settle(); }
    };
    const settle = () => page.evaluate(async () => { if(typeof msWhenReady === 'function') await msWhenReady(); for(let i = 0; i < 100 && _localSaving > 0; i++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 150)); });
    return { ctx, page, boot, settle };
  };
  // Help & Support's "Waiting to be sent", as the sheet shows it (its lines, in order)
  const help = p => p.page.evaluate(async () => {
    openHelp(); await new Promise(r => setTimeout(r, 80));   // (the Arabic is put in as the sheet appears)
    const kv = [...document.querySelectorAll('#modalInner .kv')].find(r => /Waiting to be sent|بانتظار الإرسال/.test(r.firstElementChild.textContent));
    const v = kv ? kv.lastElementChild : null;
    const text = v ? v.innerText.replace(/[ \t]+/g, ' ').trim() : null;
    closeModal();
    return { text, flat: text == null ? null : text.replace(/\s+/g, ' ') };
  });
  const NOTHING = /Nothing — everything has reached the cloud|لا شيء — كل شيء وصل إلى السحابة/;
  // the visit form, filled as a rep does; photos as pickImage hands them over; then Save visit
  const logVisit = (p, o) => p.page.evaluate(async o => {
    closeModal(); switchView('log'); prepLogView(o.clinicId); pickClinic(o.clinicId); pickDoctorSeen(o.docId);
    document.getElementById('visitNotes').value = o.note || 'met the doctor';
    for(let i = 0; i < (o.photos || 0); i++) visitPhotos.push(window.__shot(i));
    renderVisitPhotos();
    await saveVisit();
    for(let i = 0; i < 100 && _localSaving > 0; i++) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 300));
    return document.getElementById('toast').textContent;
  }, o);
  // English left in a part of the screen: the words of its own text nodes, data (names, e-mails, products) and the
  // terms the team writes in Latin letters taken out
  const english = (p, sel, extra) => p.page.evaluate(({ sel, extra }) => {
    const root = document.querySelector(sel); if(!root) return ['(no ' + sel + ')'];
    const data = new Set();
    (typeof clinics !== 'undefined' ? clinics : []).forEach(c => { if(c){ data.add(c.name); (c.doctors || []).forEach(d => d && data.add(d.name)); } });
    (typeof staff !== 'undefined' ? staff : []).forEach(s => { if(s){ data.add(s.name); data.add(s.email); } });
    (extra || []).forEach(x => data.add(x));
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for(let n = w.nextNode(); n; n = w.nextNode()){
      const el = n.parentElement;
      if(!el || el.closest('[data-notr], [dir="auto"], script, style, svg')) continue;
      if(!el.getClientRects().length) continue;   // not on screen (a hidden part)
      let t = n.nodeValue.replace(/\s+/g, ' ').trim(); if(!t) continue;
      [...data].sort((a, b) => String(b).length - String(a).length).forEach(d => { if(d && String(d).length > 1) t = t.split(d).join(' '); });
      t = t.replace(/\b(ERP|DSR|KPI|KD|CSV|Excel|xlsx|GitHub|e\.g)\b/g, ' ');
      if(/[A-Za-z]{2,}/.test(t)) out.push(n.nodeValue.replace(/\s+/g, ' ').trim());
    }
    return [...new Set(out)];
  }, { sel, extra: extra || [] });
  const latin = s => /[A-Za-z]{2,}/.test(String(s || '').replace(/\b(ERP|KPI|KD)\b/g, ''));
  const toast = p => p.page.evaluate(() => document.getElementById('toast').textContent);

  // ======================= H: Help & Support's "Waiting to be sent" =======================
  if(want('H')){
    // H0 nothing waiting: said so
    seed();
    let ph = await phone();
    await ph.boot(M, 'rep');
    let h = await help(ph);
    check('H0: nothing waiting on this phone and none of its visits waits for a photo → "Nothing — everything has reached the cloud"', NOTHING.test(h.flat || ''), h);
    // H1 a visit photo waiting to upload, kept on this phone (the upload fails); nothing else waits
    mode.failSet = /^photo:/;
    const t1 = await logVisit(ph, { clinicId: 'm1', docId: 'd1', photos: 1 });
    const v1 = (JSON.parse(cloud.visits).find(v => v.clinicId === 'm1') || {});
    const q1 = await ph.page.evaluate(() => ({ queue: outboxList(), kept: photosToUpload(false), mem: photosToUpload(true) }));
    h = await help(ph);
    check('H1 (setup): the visit reached the cloud, its photo waits on this phone (kept there), nothing is queued',
      !!v1.id && (v1.photos || []).length === 1 && v1.photos[0].pending === true && q1.queue.length === 0 && q1.kept === 1 && q1.mem === 0, { t1, q1, photos: v1.photos });
    check('H1: a visit photo waiting to upload, kept on this phone → never "Nothing — everything has reached the cloud": "1 visit photo waiting to upload from this phone · kept on this phone"',
      !NOTHING.test(h.flat || '') && /1 visit photo waiting to upload from this phone/.test(h.flat || '') && /kept on this phone/.test(h.flat || ''), h);
    await ph.page.evaluate(() => setUiLang('ar')); await ph.page.waitForTimeout(300);
    h = await help(ph);
    check('H1 in Arabic: «صورة زيارة واحدة بانتظار الرفع من هذا الجهاز · محفوظة على هذا الهاتف» — never «لا شيء — كل شيء وصل إلى السحابة», no English left',
      !NOTHING.test(h.flat || '') && /صورة زيارة واحدة بانتظار الرفع من هذا الجهاز/.test(h.flat || '') && !latin(h.flat), h);
    // …and once the photo has landed, nothing again
    mode.failSet = null;
    await ph.page.evaluate(async () => { await retryPhotos(); for(let i = 0; i < 60 && photosToUpload(false); i++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 300)); });
    h = await help(ph);
    check('H1: once the photo is in the cloud → «لا شيء — كل شيء وصل إلى السحابة» again', NOTHING.test(h.flat || ''), h);
    await ph.ctx.close();

    // H2 a photo only in the app's memory (no IndexedDB, no room in web storage for photos)
    seed();
    ph = await phone({ noIDB: true, fullRe: '^um_photo:' });
    await ph.boot(M, 'rep');
    mode.failSet = /^photo:/;
    await logVisit(ph, { clinicId: 'm1', docId: 'd1', photos: 1 });
    const q2 = await ph.page.evaluate(() => ({ kept: photosToUpload(false), mem: photosToUpload(true) }));
    h = await help(ph);
    check('H2: a visit photo only in the app\'s memory → said so ("1 visit photo waiting to upload from this phone · only in the app\'s memory — keep the app open")',
      q2.mem === 1 && !NOTHING.test(h.flat || '') && /1 visit photo waiting to upload from this phone/.test(h.flat || '') && /only in the app's memory — keep the app open/.test(h.flat || ''), { q2, h });
    await ph.ctx.close();

    // H3 this phone's own photo, still marked waiting, that it no longer holds — the cloud does not answer for it
    seed({ visits: [{ id: 'v9', clinicId: 'm1', rep: M, date: '2026-11-10', doctorIds: ['d1'], photos: [{ id: 'ph9', thumb: THUMB, pending: true, dev: 'dPHONE1', at: new Date(2026, 10, 10, 9, 0).getTime() }] }] });
    mode.failGet = /^photo:/;
    ph = await phone();
    await ph.boot(M, 'rep', { um_device: 'dPHONE1' });
    h = await help(ph);
    check('H3: this phone\'s own photo still marked waiting, not on this phone any more and not confirmed in the cloud → "1 visit photo taken on this phone, not confirmed in the cloud yet", never "Nothing"',
      !NOTHING.test(h.flat || '') && /1 visit photo taken on this phone, not confirmed in the cloud yet/.test(h.flat || ''), h);
    await ph.ctx.close();

    // H4 a list kept only in the app's memory (the phone has no room for its copy) — no connection
    seed();
    ph = await phone({ fullRe: '^um_mirror:tasks$' });
    await ph.boot(M, 'rep');
    mode.failSet = /^tasks$/;
    await ph.page.evaluate(async () => { tasks.push({ id: 'tq1', text: 'Call the clinic back', done: false, created: todayStr(), rep: currentUser.name }); await persist('tasks'); });
    const q4 = await ph.page.evaluate(() => ({ queue: outboxList(), mem: [..._memOnly] }));
    h = await help(ph);
    check('H4: a list kept only in the app\'s memory → "Tasks — only in the app\'s memory"', q4.mem.includes('tasks') && /Tasks — only in the app's memory/.test(h.flat || ''), { q4, h });
    await ph.ctx.close();

    // H5 a list kept on this phone and not sent: the cloud refuses it for this login (parked)
    seed();
    ph = await phone();
    await ph.boot(M, 'rep');
    mode.failSet = /^tasks$/;   // no connection for it first: queued
    await ph.page.evaluate(async () => { tasks.push({ id: 'tq2', text: 'Bring the samples', done: false, created: todayStr(), rep: currentUser.name }); await persist('tasks'); });
    mode.failSet = null; mode.denySet = /^tasks$/;   // then the rules say no
    await ph.page.evaluate(async () => { await flushOutbox(); await new Promise(r => setTimeout(r, 200)); });
    const q5 = await ph.page.evaluate(() => ({ queue: outboxList(), parked: [..._saveParked.entries()] }));
    h = await help(ph);
    check('H5: a list the cloud refused, kept on this phone and not sent → "Tasks — kept on this phone, not sent" (not counted as uploading)',
      q5.queue.includes('tasks') && q5.parked.some(([k]) => k === 'tasks') && /Tasks — kept on this phone, not sent/.test(h.flat || ''), { q5, h });
    await ph.ctx.close();

    // H6 the delete log waiting to upload, named in Arabic
    seed();
    ph = await phone();
    await ph.boot(M, 'rep', { ultramed_lang: 'ar' });
    mode.failSet = /^tombs$/;
    await ph.page.evaluate(async () => { tomb('tasks', 'gone-task'); await persistTombs(); });
    const q6 = await ph.page.evaluate(() => outboxList());
    h = await help(ph);
    check('H6: the delete log waiting to upload is named in Arabic («سجل الحذف»), no English left', q6.includes('tombs') && /سجل الحذف/.test(h.flat || '') && !latin(h.flat), { q6, h });
    await ph.ctx.close();

    // H7 the supervisor: another phone's photo waits on that phone — this phone has nothing to send
    seed({ visits: [{ id: 'v8', clinicId: 'r1', rep: R, date: '2026-11-10', doctorIds: [], photos: [{ id: 'ph8', thumb: THUMB, pending: true, dev: 'dRENOVA', at: new Date(2026, 10, 10, 9, 0).getTime() }] }] });
    ph = await phone();
    await ph.boot(G, 'supervisor');
    h = await help(ph);
    check('H7: another phone\'s visit photo still waiting → not "Nothing — everything has reached the cloud": "Nothing from this phone" and "1 visit photo not arrived from another phone"',
      !NOTHING.test(h.flat || '') && /Nothing from this phone/.test(h.flat || '') && /1 visit photo not arrived from another phone/.test(h.flat || ''), h);
    await ph.ctx.close();
  }

  // ======================= A: Arabic left in English =======================
  if(want('A')){
    seed();
    const ph = await phone({ viewport: { width: 1280, height: 900 } });
    await ph.boot(G, 'supervisor', { ultramed_lang: 'ar' });
    // A1 the offline pill: uploading, then offline
    await ph.page.evaluate(() => { outboxAdd('tasks'); updateSyncBadge(); }); await ph.page.waitForTimeout(120);
    const up = await ph.page.evaluate(() => (document.getElementById('syncPill') || {}).textContent || '');
    await ph.ctx.setOffline(true); await ph.page.waitForTimeout(200);
    const off = await ph.page.evaluate(() => (document.getElementById('syncPill') || {}).textContent || '');
    await ph.ctx.setOffline(false); await ph.page.waitForTimeout(400); await ph.settle();
    check('A1: the offline pill in Arabic — "Uploading offline changes (1)…" and "Offline — saving locally"', !!up && !latin(up) && /1/.test(up) && !!off && !latin(off) && /[؀-ۿ]/.test(off), { up, off });

    // A2 the follow-up sheet (an overdue follow-up) and its reschedule sheet
    await ph.page.evaluate(() => confirmFollowUp('m1')); await ph.page.waitForTimeout(150);
    const fu = await english(ph, '#modalInner');
    const fuText = await ph.page.evaluate(() => document.getElementById('modalInner').innerText);
    await ph.page.evaluate(() => openRescheduleFollowUp('m1')); await ph.page.waitForTimeout(150);
    const rs = await english(ph, '#modalInner');
    check('A2: the follow-up sheet in Arabic — its question and "Log the visit now" / "Not yet — reschedule" — and the reschedule sheet: no English left but the clinic\'s name',
      !fu.length && !rs.length && /سجّل الزيارة الآن/.test(fuText), { fu, rs, fuText });

    // A4 Territory: the tab, the distribution upload's check sheet, and what each tap tells
    await ph.page.evaluate(() => { openAdminPanel(); setAdminTab('territory'); }); await ph.page.waitForTimeout(150);
    const terr = await english(ph, '#apBody', ['Account', 'Now with', 'New rep', 'Owner', 'Mariam + Ghaith']);
    const chips = await ph.page.evaluate(() => [...document.querySelectorAll('#apTerrBody .chip')].filter(c => /toggle(Shared|Gov)Clinic/.test(c.getAttribute('onclick') || '')).slice(0, 2).map(c => ({ t: c.innerText.trim(), title: c.title })));
    await ph.page.evaluate(() => openDistributionPreview([{ name: 'distribution.csv', rows: [['Account', 'Now with'], ['Amberline Clinic', 'Renova'], ['Fernhill Center', 'Mariam + Renova'], ['Nowhere Clinic', 'Mariam'], ['Birchwood Center', 'Somebody']] }])); await ph.page.waitForTimeout(150);
    const dist = await english(ph, '#modalInner', ['Nowhere Clinic', 'Somebody']);
    const save = await ph.page.evaluate(() => { const b = [...document.querySelectorAll('#modalInner button')].find(x => /applyDistributionUpload/.test(x.getAttribute('onclick') || '')); return b ? b.innerText.trim() : null; });
    await ph.page.evaluate(async () => { await applyDistributionUpload(); }); await ph.page.waitForTimeout(250);
    const saved = await english(ph, '#modalInner');
    const toasts = await ph.page.evaluate(async () => {
      const out = [], t = () => out.push(document.getElementById('toast').textContent);
      await toggleSharedClinic('m2'); t(); await toggleSharedClinic('m2'); t();
      await toggleGovClinic('m2'); t(); await toggleGovClinic('m2'); t();
      await reassignClinic('m2', 'Renova'); t(); await reassignClinic('m2', 'Mariam'); t();
      return out;
    });
    const tLeft = toasts.map(x => x.replace(/Birchwood Center|Mariam|Renova/g, '')).filter(latin);
    check('A4: Territory in Arabic — "Shared", "Gov" (and what they mean), "Upload a clinic distribution", every clinic\'s line; the check sheet, its save button («حفظ التغييرين»: the two changes) and the saved sheet; what each tap tells — no English left but names and the file\'s column names',
      !terr.length && chips.length === 2 && chips.every(c => !latin(c.t) && !latin(c.title)) && !dist.length && !!save && !latin(save) && /2|التغييرين/.test(save) && !saved.length && !tLeft.length,
      { terr: terr.slice(0, 12), chips, dist, save, saved, toasts });

    // A5 the admin panel's tabs ("Email reports") and the Email reports tab's headings
    await ph.page.evaluate(() => { openAdminPanel(); setAdminTab('mail'); }); await ph.page.waitForTimeout(200);
    const tabs = await ph.page.evaluate(() => [...document.querySelectorAll('#modalInner .chip-row')][0].innerText.replace(/\s+/g, ' ').trim());
    const heads = await ph.page.evaluate(() => [...document.querySelectorAll('#apBody .section-title')].map(e => e.innerText.trim()));
    check('A5: the admin tabs in Arabic ("📧 Email reports" too) and the Email reports tab\'s headings in Arabic only', !latin(tabs) && heads.length === 3 && heads.every(t => !latin(t)), { tabs, heads });

    // A6 the KPI settings: every field, and the saved message
    await ph.page.evaluate(() => openKpiSettings()); await ph.page.waitForTimeout(150);
    const kpi = (await english(ph, '#modalInner')).filter(t => !/^A$/.test(t.trim()));
    const kpiToast = await ph.page.evaluate(async () => { await saveKpiSettings(); await new Promise(r => setTimeout(r, 120)); return document.getElementById('toast').textContent; });
    check('A6: the KPI settings in Arabic — every field — and their saved message («✅ حُفظت إعدادات المؤشرات»)', !kpi.length && /حُفظت إعدادات المؤشرات/.test(kpiToast) && !latin(kpiToast), { kpi, kpiToast });
    // A3 the sign-in screen and its errors: signed out on a phone that knows the team's e-mails
    await ph.page.evaluate(() => { closeModal(); switchUser(); }); await ph.page.waitForTimeout(300);
    let r = await ph.page.evaluate(async () => {
      const out = {};
      gateTap('Mariam'); await new Promise(r => setTimeout(r, 120));
      document.getElementById('gatePassword').value = 'not-the-password';
      await submitGateLogin('Mariam'); await new Promise(r => setTimeout(r, 80));
      out.gate = document.getElementById('toast').textContent;
      openEmailLogin(); await new Promise(r => setTimeout(r, 120));
      document.getElementById('elEmail').value = 'someone@example.com'; document.getElementById('elPwd').value = 'not-the-password';
      await submitEmailLogin(); await new Promise(r => setTimeout(r, 80));
      out.email = document.getElementById('toast').textContent;
      out.saved = trOf('📴 Offline — using this device’s saved data');
      closeModal();
      return out;
    });
    await ph.ctx.setOffline(true); await ph.page.waitForTimeout(150);
    r.offline = await ph.page.evaluate(async () => { gateTap('Mariam'); await new Promise(r => setTimeout(r, 120)); document.getElementById('gatePassword').value = 'x'; await submitGateLogin('Mariam'); await new Promise(r => setTimeout(r, 80)); closeModal(); return document.getElementById('toast').textContent; });
    await ph.ctx.setOffline(false); await ph.page.waitForTimeout(150);
    check('A3: the sign-in errors in Arabic — wrong password, wrong e-mail or password, no connection, offline with the saved data',
      !latin(r.gate) && /[؀-ۿ]/.test(r.gate) && !latin(r.email) && /[؀-ۿ]/.test(r.email) && !latin(r.offline) && /[؀-ۿ]/.test(r.offline) && !!r.saved && !latin(r.saved), r);

    await ph.ctx.close();
  }

  // ======================= O: the order-only sheet =======================
  if(want('O')){
    seed();
    const ph = await phone();
    await ph.boot(M, 'rep');
    const en = await ph.page.evaluate(async () => { openStandaloneOrder(); await new Promise(r => setTimeout(r, 80)); const p = document.querySelector('#modalInner p'); return p ? p.innerText : ''; });
    await ph.page.evaluate(() => { closeModal(); setUiLang('ar'); }); await ph.page.waitForTimeout(300);
    const ar = await ph.page.evaluate(async () => { openStandaloneOrder(); await new Promise(r => setTimeout(r, 80)); const p = document.querySelector('#modalInner p'); return p ? p.innerText : ''; });
    check('O: "Order only" never calls the order revenue — it is logged in the app as an order, not a field visit, and is not sales (English)', !!en && !/revenue/i.test(en) && /not (invoiced )?sales|never (counted as )?sales/i.test(en), en);
    check('O: …in Arabic: no «إيراد», and it says the order is not sales', !!ar && !/إيراد/.test(ar) && /(ليست|لا تُحسب) مبيعات/.test(ar) && !latin(ar.replace(/ERP/g, '')), ar);
    await ph.ctx.close();
  }

  // ======================= P: one pace rule everywhere (the owner's decision of 17 Nov) =======================
  if(want('P')){
    const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    // Reports as the supervisor sees it: the team line under the scorecards (teamTargetRow), the per-person target bars,
    // the team comparison's Target column — and the Today card's Team line beside them, for the same figures
    const reports = p => p.page.evaluate(async () => {
      const t = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
      const home = t(document.querySelector('#targetCard .ms-person.team'));
      switchView('reports'); renderReports(); await new Promise(r => setTimeout(r, 80));   // (the Arabic is put in as the cards appear)
      const cards = [...document.querySelectorAll('#scorecards .score-card')], team = cards[cards.length - 1];
      const out = { home, team: t(team), line: t(team && team.querySelector('[data-pace]')),
        bars: [...document.querySelectorAll('#scorecards .bar-row')].filter(b => /target achieved|المستهدف/.test(b.innerText)).map(b => ({ pace: b.dataset.pace || null, coral: !!b.querySelector('.bar-fill.coral') })),
        cmp: [...document.querySelectorAll('#teamCompareCard .cmp-table [data-pace]')].map(e => e.dataset.pace) };
      switchView('today'); return out; });
    const NOV26 = new Date(2026, 10, 26, 13, 30, 0).getTime();   // a Thursday: the files to Nov 26 = 20 of November's 22 working days
    // P1 — late in the month: the team 7,640 of 12,000 KD (64 % of the target) = 70 % of an even pace (10,909.09 KD by Nov 26);
    // Mariam 6,440 of 10,000 (70.8 % of an even pace), her Waterpik 6,440 of 8,000 (88.6 %); Renova 1,200 of 2,000 (66 %)
    seed({ targets: { [M]: { revenue: 10000, month: '2026-11', achievedAsOf: '2026-11-24', brands: { Waterpik: 8000 } }, [R]: { revenue: 2000, month: '2026-11', achievedAsOf: '2026-11-24' } },   // (a DSR of Nov 24: the month close takes the targets of its month)
      periods: [file('nov26', '2026-11-26', [row('2026-11-03', 'SINV21', 'Amberline Clinic', 4000, MS), row('2026-11-17', 'SINV22', 'Birchwood Center', 2440, MS), row('2026-11-18', 'SINV23', 'Fernhill Center', 1200, RS)])] });
    let ph = await phone({ now: NOV26, viewport: { width: 1280, height: 900 } });
    await ph.boot(G, 'supervisor');
    let r = await reports(ph);
    check('P1: Reports — the team line at 70 % of an even pace (64 % of the target, Nov 26) says "Behind pace · 70% of an even pace", never "On pace" (the 60 % rule) — as the Today card\'s Team line says',
      /Team · \w+ target/.test(r.team || '') && /64%/.test(r.line || '') && /Behind pace · 70% of an even pace · 2 reps/.test(r.line || '') && !/On pace/.test(r.team || '') && /Behind pace/.test(r.home || ''), r);
    check('P2: Reports — the per-person target bars and the team comparison\'s Target column judge by the same rule: behind (amber / coral), not "fine" from 60 %',
      r.bars.length === 2 && r.bars.every(b => b.pace === 'behind' && b.coral) && r.cmp.length === 3 && r.cmp.every(x => x === 'behind'), r);
    // the reconciliation sheet of the file (Admin → ERP import): the people's target bars, the brand table, the team line
    const rec = await ph.page.evaluate(() => { openErpRecon('nov26'); const box = document.getElementById('modalInner');
      const out = { text: box.innerText.replace(/\s+/g, ' '), brand: [...box.querySelectorAll('td[data-pace]')].map(e => e.dataset.pace), bars: [...box.querySelectorAll('div[data-pace]')].map(e => e.dataset.pace) }; closeModal(); return out; });
    const teamRec = (rec.text.match(/Monthly target — team:.*?reps/) || [''])[0];
    check('P3: the reconciliation sheet — "Behind pace · 70% of an even pace" on the team line, each person\'s target bar and the brand table by the rule (no "Green ≥60%")',
      /Behind pace · 70% of an even pace/.test(teamRec) && /Monthly target: 6,440\.00 KD of 10,000\.00 KD \(ERP-verified\) · Behind pace/.test(rec.text) && rec.brand.length === 1 && rec.brand[0] === 'behind'
        && !/≥60%/.test(rec.text) && /Green: on pace or better — from 90% of an even share/.test(rec.text), { teamRec, brand: rec.brand, bars: rec.bars, text: rec.text.slice(0, 600) });
    // the month close (Months → November): the team's, each person's and the brand's % coloured by the rule
    const mc = await ph.page.evaluate(() => { renderMonthClose('2026-11'); const els = [...document.querySelectorAll('#modalInner [data-pace]')].map(e => ({ pace: e.dataset.pace, color: e.style.color, t: e.textContent.trim() })); closeModal(); return els; });
    check('P4: the month close — the team\'s 64 %, Mariam\'s 64 %, Renova\'s 60 % and Waterpik\'s 81 % are behind (coral), not "gold" from 60 %',
      mc.length === 4 && mc.every(x => x.pace === 'behind' && /coral-ink/.test(x.color)), mc);
    // the printed management report: the Total row's Pace is the team's pace (it carried the % of the target), with its status; the brand pill by the rule
    const pr = await ph.page.evaluate(() => { const box = document.createElement('div'); box.innerHTML = buildMasterReportBody('en');
      const rowOf = re => { const tr = [...box.querySelectorAll('tr')].find(x => re.test(((x.querySelector('td b') || x.querySelector('td') || {}).textContent || '').trim())); return tr ? [...tr.querySelectorAll('td')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) : null; };
      const wp = [...box.querySelectorAll('tr')].find(x => ((x.querySelector('td') || {}).textContent || '').trim() === 'Waterpik');
      return { total: rowOf(/^Total$/), mariam: rowOf(/^Mariam$/), brand: wp ? (wp.querySelector('.mr-pill') || {}).className : null }; });
    check('P4b: the printed report — the Total row\'s Pace is the team\'s pace by the rule (70% · Behind), never the % of the target (64%); Waterpik\'s pill is red (behind), not green from 60 %',
      !!pr.total && pr.total[3] === '70%' && pr.total[5] === 'Behind' && !!pr.mariam && pr.mariam[3] === '70%' && pr.mariam[5] === 'Behind' && /\br\b/.test(pr.brand || ''), pr);
    // …and in Arabic: the team line has no English left
    await ph.page.evaluate(() => setUiLang('ar')); await ph.page.waitForTimeout(300); await ph.settle();
    r = await reports(ph);
    check('P1 in Arabic: the team line «دون الوتيرة · 70% من الوتيرة المتساوية», no English left', !!r.line && /دون الوتيرة · 70% من الوتيرة المتساوية/.test(r.line) && !latin(r.line), r.line);
    await ph.ctx.close();

    // P1b — early in the month: the team 3,600 of 12,000 KD (30 % of the target) on Nov 9 = 94 % of an even pace (3,818.18 KD): on pace, never "Behind" (the 60 % rule)
    seed({ periods: [file('nov9', '2026-11-09', [row('2026-11-02', 'SINV31', 'Amberline Clinic', 3000, MS), row('2026-11-04', 'SINV32', 'Fernhill Center', 600, RS)])] });
    ph = await phone({ viewport: { width: 1280, height: 900 } });
    await ph.boot(G, 'supervisor');
    r = await reports(ph);
    check('P1b: Reports — the team line at 94 % of an even pace (30 % of the target, Nov 9) says "On pace · 94% of an even pace", never "Behind" — as the Today card\'s Team line says',
      /On pace · 94% of an even pace · 2 reps/.test(r.line || '') && !/Behind/.test(r.team || '') && /On pace/.test(r.home || ''), r);
    await ph.ctx.close();

    // P5 — the home's forecast tile: Mariam 2,854 of 10,000 KD to Nov 9 = 89.7 % of an even pace (8,969.71 KD forecast)
    seed({ periods: [file('nov9b', '2026-11-09', [row('2026-11-02', 'SINV41', 'Amberline Clinic', 1854, MS), row('2026-11-03', 'SINV42', 'Birchwood Center', 1000, MS), row('2026-11-04', 'SINV43', 'Fernhill Center', 900, RS)])] });
    ph = await phone();
    await ph.boot(M, 'rep');
    const home = await ph.page.evaluate(() => { const t = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
      const out = { tile: t(document.querySelector('#msKpis [data-ms="forecast"]')), value: (document.querySelector('#msKpis [data-ms="forecast"]') || {}).dataset?.value, pace: t(document.querySelector('#msStatus .ms-stt')) };
      msHow('sales'); out.how = (document.getElementById('modalInner').innerText.match(/8,969\.71 ÷ 10,000\.00 × 100 = \d+%/) || [null])[0]; closeModal(); return out; });
    check('P5: the forecast tile prints on the side of the line its pace card states — "89%" beside "Behind pace" (89.7 % of an even pace), never "90%"; the ⓘ works it out the same way',
      home.tile === '89%' && Number(home.value) === 8969.71 && home.pace === 'Behind pace' && home.how === '8,969.71 ÷ 10,000.00 × 100 = 89%', home);
    await ph.ctx.close();
  }

  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
