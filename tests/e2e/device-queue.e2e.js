// The changes waiting on a phone belong to the login that made them (v129, the security audit's C7). On 65f9a90 the
// queue belonged to the phone: after a rep queued changes and signed out, the next login on that phone uploaded them
// under its own credential, told only "Offline changes uploaded & merged"; a queue planted in the phone's storage —
// even a supervisor-only document — was replayed the same way; and a login whose reads the cloud refused was shown
// the copies another login had synced on the phone since.
//   Q1  Mariam's queued change, then the supervisor signs in on that phone: he is asked first, naming Mariam and the
//       lists — nothing is sent before he answers
//   Q2  "Not now — sign out": he is signed out, the change stays on the phone, the cloud does not have it
//   Q3  Mariam signs in again: no question, her change uploads under her own session
//   Q4  queued again, and the supervisor taps "Upload them under my login": it uploads, as he chose
//   Q5  a queue planted in the phone's storage (a supervisor-only "targets", no owner) is never sent
//   Q6  a login whose reads are refused is shown no copy another login synced on this phone (clinics, chat)
//   Q7  guard: no page errors
//   Q8  the same question in Arabic
// Invented data, a fake cloud, a fixed clock (Tue 10 Nov 2026, 10:00). Port 8311. Env: WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8311, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const cloud = {}, mode = { failSet: null, deny: false };
const writes = [];
const api = {
  get: async k => mode.deny ? { __err: 'permission-denied' } : (k in cloud ? cloud[k] : null),
  set: async (k, v) => { if(mode.deny) return { __err: 'permission-denied' }; if(mode.failSet && mode.failSet.test(k)) return { __err: 'unavailable' }; writes.push(k); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => mode.deny ? { __err: 'permission-denied' } : Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(mode.deny) return { __err: 'permission-denied' }; if(mode.failSet && entries.some(([k]) => mode.failSet.test(k))) return { __err: 'unavailable' }; entries.forEach(([k, v]) => { writes.push(k); cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info).slice(0, 600):'')); if(!ok) failed++; }
const M = 'Mariam', R = 'Renova', G = 'Dr. Ghaith';
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([
    { id: 'm1', name: 'Alpha Dental Clinic (invented)', rep: M, cls: 'B', doctors: [] },
    { id: 'r1', name: 'Beta Dental Clinic (invented)', rep: R, cls: 'B', doctors: [] },
  ]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.erpMap = '{}';
  cloud.chat = '[]'; cloud.memories = '[]';
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });   // ONE phone: its storage is shared by every sign-in
  await blockFirebase(ctx);
  await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|permission|unavailable/i.test(m.text())) errors.push('console: '+m.text()); });
  page.on('dialog', d => d.accept());
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
  await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
  await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(() => {
    const err = r => { if(r && r.__err){ const e = new Error(r.__err === 'permission-denied' ? 'Missing or insufficient permissions.' : 'The service is currently unavailable.'); e.code = r.__err; throw e; } return r; };
    window.storage = {
      get: async k => { const v = err(await window.__cGet(k)); return v == null ? null : { value: v }; },
      set: async (k, v) => err(await window.__cSet(k, v)),
      setMany: async entries => err(await window.__cSetMany(entries)),
      delete: async k => window.__cDel(k),
      list: async p => ({ keys: err(await window.__cList(p)) }),
    };
    const off = new Date(2026, 10, 10, 10, 0, 0).getTime() - Date.now();
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
    const _si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => ms === 20000 ? -1 : _si(fn, ms, ...a);
  });
  const wait = ms => page.waitForTimeout(ms || 300);
  const signIn = async (who, role) => { await page.evaluate(async a => { await selectUser(a[0], a[1]); if(typeof msWhenReady === 'function') await msWhenReady(); }, [who, role]); await wait(); };
  // a sign-in that may be asked first: started, not awaited
  const startSignIn = async (who, role) => { await page.evaluate(a => { window.__sel = selectUser(a[0], a[1]).then(() => 'done', e => 'threw ' + e.message); }, [who, role]); await wait(400); };
  const sheet = () => page.evaluate(() => { const b = document.getElementById('modalBack'); return b && b.classList.contains('show') ? document.getElementById('modalInner').innerText.replace(/\s+/g, ' ') : ''; });
  const answer = async yes => { await page.evaluate(y => { const b = document.querySelector('#modalInner [data-queue="' + (y ? 'yes' : 'no') + '"]'); if(!b) throw new Error('no answer button'); b.click(); }, yes); await page.evaluate(() => window.__sel); await wait(); };
  const queueMariamTask = async id => {
    mode.failSet = /^tasks$/;
    const r = await page.evaluate(async id => { tasks.push({ id, title: 'Call back (invented)', rep: 'Mariam', clinicId: 'm1', status: 'open', due: '2026-11-11', created: Date.now() }); const r = await persistTold('tasks'); return { ok: r.ok, queued: outboxHas('tasks') }; }, id);
    mode.failSet = null;
    return r;
  };
  const cloudTaskIds = () => JSON.parse(cloud.tasks || '[]').map(t => t.id);
  try{
    seed();
    await page.goto(URL); await wait(200);
    await page.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
    await page.goto(URL); await wait(200);
    // Q1 — Mariam queues a change with no connection, signs out; the supervisor signs in on her phone
    await signIn(M, 'rep');
    const q = await queueMariamTask('tM1');
    await page.evaluate(() => switchUser()); await wait(200);
    const before = writes.length;
    await startSignIn(G, 'supervisor');
    const s1 = await sheet();
    check('Q1 the supervisor signing in on a phone with Mariam\'s queued change is asked first, naming her and the list; nothing is sent meanwhile',
      q.queued && /Changes waiting on this phone/.test(s1) && /Mariam/.test(s1) && /Tasks/.test(s1) && !cloudTaskIds().includes('tM1') && writes.length === before, { q, s1, cloudTasks: cloudTaskIds(), wrote: writes.slice(before) });
    // Q2 — "Not now — sign out"
    await answer(false);
    const q2 = await page.evaluate(() => ({ who: currentUser, gate: getComputedStyle(document.getElementById('gate')).display !== 'none', queued: outboxHas('tasks') }));
    check('Q2 "Not now — sign out": signed out, the change stays on the phone, the cloud does not have it', q2.who === null && q2.gate && q2.queued && !cloudTaskIds().includes('tM1'), { q2, cloudTasks: cloudTaskIds() });
    // Q3 — Mariam again: hers, no question
    await signIn(M, 'rep');
    const s3 = await sheet();
    await page.evaluate(async () => { await flushOutbox(); }); await wait();
    check('Q3 Mariam signs in again: no question, her change uploads under her own session', !/Changes waiting on this phone/.test(s3) && cloudTaskIds().includes('tM1'), { s3, cloudTasks: cloudTaskIds() });
    // Q4 — queued again; the supervisor chooses to upload them under his login
    const q4q = await queueMariamTask('tM2');
    await page.evaluate(() => switchUser()); await wait(200);
    await startSignIn(G, 'supervisor');
    const s4 = await sheet();
    await answer(true);
    await page.evaluate(async () => { await flushOutbox(); }); await wait();
    const q4 = await page.evaluate(() => ({ who: currentUser && currentUser.name, queued: outboxHas('tasks') }));
    check('Q4 queued again, the supervisor taps "Upload them under my login": signed in, it uploads, as he chose', q4q.queued && /Mariam/.test(s4) && q4.who === 'Dr. Ghaith' && !q4.queued && cloudTaskIds().includes('tM2'), { q4q, s4: s4.slice(0, 120), q4, cloudTasks: cloudTaskIds() });
    // Q5 — a queue planted in the phone's storage: a supervisor-only document, no owner noted
    const targetsBefore = cloud.targets;
    await page.evaluate(() => { switchUser(); localStorage.setItem('um_outbox', '["targets"]'); localStorage.setItem('um_mirror:targets', JSON.stringify({ Mariam: { revenue: 1, month: '2026-11' }, Renova: { revenue: 999999, month: '2026-11' } })); localStorage.removeItem('um_outboxOwner'); });
    await page.goto(URL); await wait(200);
    await signIn(G, 'supervisor');
    const s5 = await sheet();
    await page.evaluate(async () => { await flushOutbox(); }); await wait();
    const q5 = await page.evaluate(() => ({ queued: outboxList() }));
    check('Q5 a queue planted in the phone\'s storage (a supervisor-only "targets") is never sent', cloud.targets === targetsBefore && !q5.queued.includes('targets') && !/Changes waiting/.test(s5), { q5, s5: s5.slice(0, 80), targets: cloud.targets });
    // Q6 — the supervisor's session synced a clinic and a chat message on this phone; then a login whose reads are refused
    const cs = JSON.parse(cloud.clinics); cs.push({ id: 'cV6', name: 'Gamma Clinic synced later (invented)', rep: M, cls: 'C', doctors: [] }); cloud.clinics = JSON.stringify(cs);
    cloud.chat = JSON.stringify([{ id: 'm1', who: 'Dr. Ghaith', text: 'a message after her removal (invented)', ts: Date.now() }]);
    await page.evaluate(async () => { await loadAll(); if(typeof loadTeam === 'function') await loadTeam(); }); await wait();
    await page.evaluate(() => switchUser()); await wait(200);
    mode.deny = true;
    await page.goto(URL); await wait(200);
    await signIn(M, 'rep');
    const q6 = await page.evaluate(async () => { if(typeof teamFromPhone === 'function') teamFromPhone(); return { clinics: clinics.map(c => c.id), chat: (typeof chatMsgs !== 'undefined' ? chatMsgs : []).map(m => m.text) }; });
    mode.deny = false;
    check('Q6 a login whose reads are refused is shown no copy another login synced on this phone (the later clinic, the chat)', !q6.clinics.includes('cV6') && !q6.chat.some(t => /after her removal/.test(t)), q6);
    // Q8 — the same question in Arabic
    seed();
    await page.evaluate(() => { try{ localStorage.clear(); localStorage.setItem('ultramed_lang', 'ar'); }catch(e){} });
    await page.goto(URL); await wait(200);
    await signIn(M, 'rep');
    await queueMariamTask('tM8');
    await page.evaluate(() => switchUser()); await wait(200);
    await startSignIn(G, 'supervisor');
    const s8 = await sheet();
    check('Q8 in Arabic: the question, the lists and both answers in Arabic, no English left', /تغييرات بانتظار الإرسال على هذا الهاتف/.test(s8) && /مريم/.test(s8) && /المهام/.test(s8)
      && /ارفعها باسم حسابي/.test(s8) && /ليس الآن — تسجيل الخروج/.test(s8) && !/[A-Za-z]{3,}/.test(s8.replace(/\d{1,2}:\d{2}/g, '')), s8);
    await answer(false);
    check('Q7 guard: no page errors', errors.length === 0, errors.slice(0, 5));
  } catch(e){ check('harness ran without throwing', false, e.stack); }
  finally {
    await browser.close(); server.close();
    console.log(results.join('\n'));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
