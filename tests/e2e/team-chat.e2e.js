// Team chat and memories (v122): a message or a memory lost, or "shared" said
// for one that had not landed. Each case was reproduced first; the checks stay.
//   C1–C4, C7, M3 (already in v121): the refresh — loadTeam: the 20-second refresh,
//     opening the Team tab, "Refresh messages" — put the list it read over
//     memory while a message's save was on its way or queued on the phone. The
//     queue's next upload, built from memory, sent the list without it and
//     emptied the queue: gone everywhere, after "Saved on this device". The
//     queue's own upload did the same to a message sent while it ran (C4), and
//     a read of a queued list whose copy on the phone could not be read (C7).
//   C6: a photo attached, and words typed, while the previous message's photo
//     was still uploading were cleared from the draft without being sent.
//   M1: a second memory shared while the first one's photo was still uploading
//     was refused without a word, then thrown away when the first one finished
//     (its sheet closed, "Memory shared with the team").
//   M2: the photo landed but the memories list was only queued on the phone (or
//     only in the app's memory on a full phone): "Memory shared with the team"
//     replaced the honest message.
//   C5, M4: a send / share that lands is unchanged.
// Fake cloud in Node (shared by the phones), clock pinned to Mon 21 Sep 2026,
// the 20-second refresh driven by hand (window.__bgTick), the photo picker
// stubbed (it hands a photo over as pickImage does). Names are invented.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase, twoRepStaff } = require('./_env.js');
const PORT = 8272;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- fake cloud (Node: shared by every phone) ----
// net.down: no signal — every read and write fails at once; a photo write is
//   kept by the cloud's client until land() (the signal back, the page open).
// net.dead[phone] = { readMs, txMs }: no data although the phone thinks it is
//   online — a read fails after readMs, a transaction gives up after txMs.
// net.holdPhoto: a slow link — photo uploads wait for land(), documents answer at once.
// net.lag[phone] = ms: every read answers ms later; net.wlag[phone] = ms: every document write lands ms later.
// net.keyFail[phone]: writes of these keys are refused (the commit does not get through).
// net.failAfter[phone]: once a write of these keys lands, the next ones are refused (the signal goes again).
const cloud = {};
const net = { down: new Set(), holdPhoto: new Set(), dead: {}, lag: {}, wlag: {}, keyFail: {}, failAfter: {}, reads: [], txReads: [], writes: [], writing: [] };
let held = []; // photo uploads on their way: { who, k, v, res }
const busy = {}, queue = {}; // one transaction per document at a time, first come first served
const acquire = async k => { if(!busy[k]){ busy[k] = true; return true; } await new Promise(r => (queue[k] = queue[k] || []).push(r)); return true; };
const release = async k => { const next = (queue[k] || []).shift(); if(next) next(); else busy[k] = false; return true; };
const down = who => { if(net.down.has(who)) throw new Error('boom-offline'); };
const refusedKey = (who, k) => !!(net.keyFail[who] && net.keyFail[who].has(k));
const api = {
  get: async (who, k) => {
    if(net.dead[who]){ await sleep(net.dead[who].readMs); throw new Error('boom-dead'); }
    down(who); net.reads.push(who + ' ' + k); if(net.lag[who]) await sleep(net.lag[who]); return k in cloud ? cloud[k] : null; },
  txGet: async (who, k) => { // a transaction's read
    net.txReads.push(who + ' ' + k);
    if(net.dead[who]){ await sleep(net.dead[who].txMs); throw new Error('boom-dead'); }
    return api.get(who, k); },
  set: async (who, k, v) => {
    if(/^photo:/.test(k)){
      if(net.down.has(who) || net.dead[who] || net.holdPhoto.has(who)) return new Promise(res => held.push({ who, k, v, res }));
    } else {
      if(net.dead[who]) throw new Error('boom-dead');
      down(who);
      if(net.wlag[who]){ net.writing.push(who + ' ' + k); await sleep(net.wlag[who]); }
      if(refusedKey(who, k)) throw new Error('boom-write ' + k);
    }
    net.writes.push(who + ' ' + k); cloud[k] = v;
    if(net.failAfter[who] && net.failAfter[who].delete(k)) (net.keyFail[who] = net.keyFail[who] || new Set()).add(k);
    return true; },
  setMany: async (who, e) => { if(net.dead[who]) throw new Error('boom-dead'); down(who); e.forEach(([k, v]) => { net.writes.push(who + ' ' + k); cloud[k] = v; }); return true; },
  del: async (who, k) => { if(net.dead[who]) throw new Error('boom-dead'); down(who); delete cloud[k]; return true; },
  list: async (who, p) => { if(net.dead[who]) throw new Error('boom-dead'); down(who); return Object.keys(cloud).filter(k => k.startsWith(p)); },
};
// those uploads (all of that phone's, or the one of key k) reach the cloud now
const land = (who, k) => { const mine = held.filter(h => h.who === who && (!k || h.k === k)); held = held.filter(h => !mine.includes(h)); mine.forEach(h => { net.writes.push(who + ' ' + h.k); cloud[h.k] = h.v; h.res(true); }); return mine.length; };
const heldKeys = who => held.filter(h => h.who === who).map(h => h.k);
const J = k => { try{ return JSON.parse(cloud[k]); }catch(e){ return null; } };
const chatIn = t => (J('chat') || []).filter(m => m && m.text === t);
const memIn = c => (J('memories') || []).filter(m => m && m.cap === c);
const cloudTexts = () => ({ chat: (J('chat') || []).map(m => m.text), memories: (J('memories') || []).map(m => m.cap) });
const writesOf = (who, k) => net.writes.filter(w => w === who + ' ' + k).length;

const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,900):'')); if(!ok) failed++; }
async function phase(id, name, fn){
  results.push('— ' + id + ' ' + name);
  try{ await fn(); }catch(e){ check(id + ' ' + name + ': phase crashed', false, String(e && e.message || e).split('\n')[0].slice(0, 300)); }
}
const until = async (test, ms) => { const t0 = Date.now(); while(Date.now() - t0 < (ms || 8000)){ if(await test()) return true; await sleep(100); } return !!(await test()); };
const CLOCK = new Date('2026-09-21T10:00:00').getTime();
const M = 'Mariam';
function seed(){
  Object.keys(cloud).forEach(k => delete cloud[k]);
  cloud.staff = twoRepStaff();
  cloud.clinics = JSON.stringify([{ id: 'c1', name: 'Sample Harbor Dental Clinic', rep: M, cls: 'A', doctors: [{ id: 'd1', name: 'Dr. Sample One' }] }]);
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}';
  cloud.recycleBin = JSON.stringify({ clinics: [], products: [], visits: [] });
  cloud.erpSales = JSON.stringify({ periods: [], seeds: { sales3_aug26: true, orphanRestore_v58: true, autoRestore_v64: true, deepRestore_v65: true } });
  cloud.chat = JSON.stringify([{ id: 'old1', who: 'Renova', text: 'an earlier message', ts: CLOCK - 60000 }]);
  cloud.memories = JSON.stringify([{ id: 'oldm', thumb: '', cap: 'an earlier memory', tag: '', who: 'Renova', ts: CLOCK - 86400000 }]);
  net.down.clear(); net.holdPhoto.clear(); net.dead = {}; net.lag = {}; net.wlag = {}; net.keyFail = {}; net.failAfter = {}; held = [];
}

(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = {};
  const mkPhone = async label => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort()); // hermetic
    const page = await ctx.newPage(); errors[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource|boom-|save failed|update failed|snapshot error/i.test(m.text())) errors[label].push('console: '+m.text().slice(0,200)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cTxGet', k => api.txGet(label, k));
    await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript(({ clock }) => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }),
        update: async (k, fn) => { await window.__cAcquire(k); try{ const cur = await window.__cTxGet(k); const next = fn(cur == null ? null : cur); if(next == null) return null; await window.__cSet(k, next); return next; } finally { await window.__cRelease(k); } },
      };
      const off = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
      // a photo as pickImage hands it over: a full image and its thumbnail (data URLs), a new colour each time
      window.__n = 0;
      window.__shot = n => { const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = ['#c33', '#3a3', '#33c', '#cc3', '#3cc', '#c3c', '#888', '#a52'][n % 8]; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillText('photo ' + n, 4, 14); return c.toDataURL('image/jpeg', 0.8); };
        return { full: mk(160, 120), thumb: mk(40, 30) }; };
    }, { clock: CLOCK });
    const boot = async (who, role) => {
      await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
      await page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); };
        window.pickImage = cb => { cb(window.__shot(window.__n++)); }; }); // the gallery hands a photo over at once
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); };
    // More → "Team chat & memories", on the Chat or the Memories tab (its own read done)
    const openTeam = tab => page.evaluate(async tab => { closeModal(); switchView('team'); setTeamTab(tab); await loadTeam(); setTeamTab(tab); }, tab);
    return { page, ctx, boot, tick, openTeam, label };
  };
  // what the phone holds for the chat or the memories: memory, the phone's copy, the queue, the screen, the toasts
  const team = (ph, key) => ph.page.evaluate(key => {
    const txt = m => m && (key === 'chat' ? m.text : m.cap);
    let copy = null; try{ copy = (JSON.parse(localStorage.getItem('um_mirror:' + key) || 'null') || []).map(txt); }catch(e){ copy = 'unreadable'; }
    const t = document.getElementById('toast'), bar = document.getElementById('memOnlyBar');
    return { mem: (key === 'chat' ? chatMsgs : memories).map(txt), copy, queued: outboxHas(key),
      screen: (document.getElementById(key === 'chat' ? 'chatList' : 'memGrid') || {}).innerText || '',
      toasts: (window.__toasts || []).slice(-4), toastNow: t && t.classList.contains('show') ? t.textContent : '', redBar: bar ? bar.textContent : null,
      sheetOpen: document.getElementById('modalBack').classList.contains('show') };
  }, key);
  const toastCount = ph => ph.page.evaluate(() => (window.__toasts || []).length);
  const toastsFrom = (ph, n) => ph.page.evaluate(n => (window.__toasts || []).slice(n), n);
  // Team → Memories → "Add a memory" (the gallery hands a photo over), the caption typed → the memory's id
  const addMemory = async (ph, cap) => {
    await ph.page.click('#teamMem button:has-text("Add a memory")');
    await ph.page.waitForSelector('#modalBack.show #memCap', { timeout: 5000 });
    await ph.page.fill('#memCap', cap);
    return ph.page.evaluate(() => window._pendingMem && window._pendingMem.id);
  };
  const share = ph => ph.page.click('#modalInner button:has-text("Share memory")');
  const sheet = ph => ph.page.evaluate(() => ({ open: document.getElementById('modalBack').classList.contains('show'), pending: window._pendingMem ? window._pendingMem.id : null,
    caption: (document.getElementById('memCap') || {}).value || null }));
  const SHARED = '📸 Memory shared with the team';
  const ON_PHONE = '📴 Memory saved on this phone — the team sees it once it uploads, automatically when back online';
  const MEM_ONLY = "⚠️ This phone's storage is full — this memory is only in the app's memory: keep the app open until it uploads";
  const BUSY = 'Already sharing this memory…';

  // =====================================================================
  // C1 — the Team tab's read of the chat while a message is being saved
  // (slow link: reads take 2.5 s, the chat write does not get through)
  // =====================================================================
  await phase('C1', 'a read of the chat while a message is being saved', async () => {
    seed();
    const A = await mkPhone('C1-Mariam'); await A.boot(M, 'rep'); await A.openTeam('chat');
    net.lag[A.label] = 2500; net.keyFail[A.label] = new Set(['chat']);
    await A.page.evaluate(() => { document.getElementById('chatInput').value = 'C1 message'; window.__s = sendChat(); });
    await sleep(400);
    await A.page.evaluate(() => { window.__l = loadTeam(); }); // the Team tab's read (opening it, or the refresh)
    await A.page.evaluate(async () => { await window.__s; await window.__l; renderChat(); });
    const s = await team(A, 'chat');
    check('C1. the chat read while a message is being saved: the message stays in memory, on the phone and in the upload queue, and on screen (it said "Saved on this device")',
      s.mem.includes('C1 message') && Array.isArray(s.copy) && s.copy.includes('C1 message') && s.queued && s.screen.includes('C1 message') && s.toasts.some(t => /Saved on this device/.test(t)), s);
    delete net.lag[A.label]; delete net.keyFail[A.label];
    await A.tick(); await sleep(300);
    const after = await team(A, 'chat');
    check('C1b. …signal back, the next refresh: it is in the cloud once, with the earlier message, and the queue is empty',
      chatIn('C1 message').length === 1 && chatIn('an earlier message').length === 1 && !after.queued, { cloud: cloudTexts().chat, after });
    await A.ctx.close();
  });

  // =====================================================================
  // C2 — the 20-second refresh while a message is being saved (no data:
  // reads fail at once, the transaction gives up after 2.5 s)
  // =====================================================================
  await phase('C2', 'the 20-second refresh while a message is being saved, no data', async () => {
    seed();
    const A = await mkPhone('C2-Mariam'); await A.boot(M, 'rep'); await A.openTeam('chat');
    net.dead[A.label] = { readMs: 300, txMs: 2500 };
    await A.page.evaluate(() => { document.getElementById('chatInput').value = 'C2 message'; window.__s = sendChat(); });
    await sleep(500);
    await A.tick(); // nothing queued yet: the refresh reads every list (loadAll → loadTeam), Team → Chat open
    await A.page.evaluate(async () => { await window.__s; });
    await sleep(300);
    const s = await team(A, 'chat');
    check('C2. the 20-second refresh while the message is being saved with no data: it stays in memory, on the phone, queued and on screen',
      s.mem.includes('C2 message') && Array.isArray(s.copy) && s.copy.includes('C2 message') && s.queued && s.screen.includes('C2 message'), s);
    await until(() => !busy.chat, 10000);
    await A.tick(); // still no data: the queue's retry fails again
    const s2 = await team(A, 'chat');
    check('C2b. …a retry with still no data keeps it in memory, on the phone and queued', s2.mem.includes('C2 message') && Array.isArray(s2.copy) && s2.copy.includes('C2 message') && s2.queued, s2);
    delete net.dead[A.label];
    await until(() => !busy.chat, 10000);
    await A.tick(); await sleep(300);
    const after = await team(A, 'chat');
    check('C2c. …signal back, the next refresh: it is in the cloud once and the queue is empty', chatIn('C2 message').length === 1 && !after.queued, { cloud: cloudTexts().chat, after });
    await A.ctx.close();
  });

  // =====================================================================
  // C3 — a message already queued on the phone, a second one, then
  // "Refresh messages" while that one is being saved (no data)
  // =====================================================================
  await phase('C3', 'a message queued, a second one, "Refresh messages" while it is being saved', async () => {
    seed();
    const A = await mkPhone('C3-Mariam'); await A.boot(M, 'rep'); await A.openTeam('chat');
    net.dead[A.label] = { readMs: 300, txMs: 2000 };
    await A.page.evaluate(async () => { document.getElementById('chatInput').value = 'C3 first message'; await sendChat(); });
    await until(() => !busy.chat, 10000);
    await A.page.evaluate(() => { document.getElementById('chatInput').value = 'C3 second message'; window.__s = sendChat(); });
    await sleep(500);
    await A.page.evaluate(() => document.querySelector('#teamChat button[onclick="refreshTeam()"]').click()); // she taps "Refresh messages"
    await A.page.evaluate(async () => { await window.__s; });
    await sleep(300);
    const s = await team(A, 'chat');
    check('C3. a message already queued, a second sent and "Refresh messages" tapped while it saves: both stay in memory, on the phone, queued and on screen',
      ['C3 first message', 'C3 second message'].every(t => s.mem.includes(t) && Array.isArray(s.copy) && s.copy.includes(t) && s.screen.includes(t)) && s.queued, s);
    delete net.dead[A.label];
    await until(() => !busy.chat, 10000);
    await A.tick(); await sleep(300);
    check('C3b. …signal back, the next refresh: both are in the cloud, once each', ['C3 first message', 'C3 second message'].every(t => chatIn(t).length === 1), cloudTexts().chat);
    await A.ctx.close();
  });

  // =====================================================================
  // C4 — a message sent while the queue's upload of the chat is on its way
  // (the signal back but slow), and its own save refused (the signal goes
  // again): the upload must not put back the list it took
  // =====================================================================
  await phase('C4', 'a message sent while the queue uploads the chat', async () => {
    seed();
    const A = await mkPhone('C4-Mariam'); await A.boot(M, 'rep'); await A.openTeam('chat');
    net.down.add(A.label);
    await A.page.evaluate(async () => { document.getElementById('chatInput').value = 'C4 queued message'; await sendChat(); });
    net.down.delete(A.label);
    net.wlag[A.label] = 1500; net.failAfter[A.label] = new Set(['chat']); net.writing.length = 0;
    await A.page.waitForFunction(() => !_flushing);
    await A.page.evaluate(() => { window.__t = window.__bgTick(); }); // the 20-second refresh: the queue uploads the chat
    const writing = await until(() => net.writing.includes(A.label + ' chat'), 5000);
    await A.page.evaluate(() => { document.getElementById('chatInput').value = 'C4 sent meanwhile'; window.__s = sendChat(); });
    await A.page.evaluate(async () => { await window.__t; await window.__s; });
    await sleep(300);
    const s = await team(A, 'chat');
    check('C4. a message sent while the queue\'s upload of the chat is on its way (its own save then refused): it stays in memory, on the phone and queued',
      writing && chatIn('C4 queued message').length === 1 && s.mem.includes('C4 sent meanwhile') && Array.isArray(s.copy) && s.copy.includes('C4 sent meanwhile') && s.queued, { writing, cloud: cloudTexts().chat, s });
    delete net.wlag[A.label]; delete net.keyFail[A.label]; delete net.failAfter[A.label];
    await A.tick(); await sleep(300);
    const after = await team(A, 'chat');
    check('C4b. …signal back, the next refresh: both are in the cloud once each, the queue empty', ['C4 queued message', 'C4 sent meanwhile'].every(t => chatIn(t).length === 1) && !after.queued, { cloud: cloudTexts().chat, after });
    await A.ctx.close();
  });

  // =====================================================================
  // C5 — a send that lands, with and without a photo: as before
  // =====================================================================
  await phase('C5', 'a send that lands', async () => {
    seed();
    const A = await mkPhone('C5-Mariam'); await A.boot(M, 'rep'); await A.openTeam('chat');
    const w0 = writesOf(A.label, 'chat');
    await A.page.fill('#chatInput', 'C5 hello team');
    await A.page.click('#chatSendBtn');
    await until(() => chatIn('C5 hello team').length === 1, 5000); await A.page.waitForFunction(() => !chatSending);
    const s = await team(A, 'chat');
    const box = await A.page.evaluate(() => document.getElementById('chatInput').value);
    check('C5. a send that lands: one write, in the cloud once, on screen, the box cleared, nothing queued, no warning',
      writesOf(A.label, 'chat') - w0 === 1 && chatIn('C5 hello team').length === 1 && s.screen.includes('C5 hello team') && box === '' && !s.queued && !s.toasts.some(t => /device|failed|memory/i.test(t)), { writes: writesOf(A.label, 'chat') - w0, box, s });
    await A.page.click('button[aria-label="Attach from gallery"]');
    await A.page.fill('#chatInput', 'C5 with a photo');
    await A.page.click('#chatSendBtn');
    await until(() => chatIn('C5 with a photo').length === 1, 5000); await A.page.waitForFunction(() => !chatSending);
    const m = chatIn('C5 with a photo')[0] || {};
    const d = await A.page.evaluate(() => ({ draft: !!pendingChatPhoto, preview: document.querySelectorAll('#chatPhotoPreview img').length, box: document.getElementById('chatInput').value }));
    check('C5b. …with a photo: posted with it (the full photo in the cloud), the draft and the box cleared', !!m.photoId && !!cloud['photo:' + m.photoId] && !d.draft && d.preview === 0 && d.box === '', { m: { photoId: m.photoId }, d });
    await A.ctx.close();
  });

  // =====================================================================
  // C6 — a photo attached and words typed while the previous message's
  // photo is still uploading (slow link)
  // =====================================================================
  await phase('C6', 'the next message\'s photo attached while the previous one uploads', async () => {
    seed();
    const A = await mkPhone('C6-Mariam'); await A.boot(M, 'rep'); await A.openTeam('chat');
    net.holdPhoto.add(A.label);
    await A.page.click('button[aria-label="Attach from gallery"]'); // photo A
    const a = await A.page.evaluate(() => ({ id: pendingChatPhoto.id, thumb: pendingChatPhoto.thumb }));
    await A.page.fill('#chatInput', 'C6 first message with photo A');
    await A.page.click('#chatSendBtn');
    await until(() => heldKeys(A.label).includes('photo:' + a.id), 3000);
    await A.page.click('button[aria-label="Attach from gallery"]'); // photo B, for her next message, while A uploads
    await A.page.fill('#chatInput', 'C6 next message');
    const b = await A.page.evaluate(() => ({ id: pendingChatPhoto.id, thumb: pendingChatPhoto.thumb }));
    land(A.label, 'photo:' + a.id); // photo A reaches the cloud
    await A.page.waitForFunction(() => !chatSending, null, { timeout: 10000 });
    await sleep(200);
    const s = await A.page.evaluate(() => ({ draft: pendingChatPhoto ? pendingChatPhoto.id : null, preview: [...document.querySelectorAll('#chatPhotoPreview img')].map(i => i.getAttribute('src')),
      box: document.getElementById('chatInput').value, posted: chatMsgs.filter(m => /^C6/.test(m.text || '')).map(m => ({ text: m.text, photoId: m.photoId })) }));
    const first = chatIn('C6 first message with photo A')[0] || {};
    check('C6. photo A\'s message is posted with photo A; photo B and the words typed meanwhile stay in the draft for the next message',
      first.photoId === a.id && s.draft === b.id && s.preview.length === 1 && s.preview[0] === b.thumb && s.box === 'C6 next message', { draftIsB: s.draft === b.id, preview: s.preview.length, box: s.box, posted: s.posted, cloudPhoto: first.photoId === a.id });
    net.holdPhoto.delete(A.label);
    await A.page.click('#chatSendBtn');
    await until(() => chatIn('C6 next message').length === 1, 5000); await A.page.waitForFunction(() => !chatSending, null, { timeout: 10000 });
    const next = chatIn('C6 next message')[0] || {};
    check('C6b. …sent next: that message goes with photo B (both in the cloud, each with its own photo)', next.photoId === b.id && !!cloud['photo:' + b.id] && !!cloud['photo:' + a.id], { next: next.photoId === b.id, photoB: !!cloud['photo:' + b.id] });
    await A.ctx.close();
  });

  // =====================================================================
  // C7 — a message queued on the phone whose copy there cannot be read: the
  // read of the chat goes to the cloud (and writes its copy over the phone's)
  // =====================================================================
  await phase('C7', 'a queued message, the phone\'s copy unreadable, then a read of the chat', async () => {
    seed();
    const A = await mkPhone('C7-Mariam'); await A.boot(M, 'rep'); await A.openTeam('chat');
    net.down.add(A.label);
    await A.page.evaluate(async () => { document.getElementById('chatInput').value = 'C7 queued message'; await sendChat(); });
    net.down.delete(A.label); net.keyFail[A.label] = new Set(['chat']); // the signal is back, the queue's upload does not get through yet
    await A.page.evaluate(async () => { localStorage.setItem('um_mirror:chat', '{not a list'); await loadTeam(); renderChat(); });
    const s = await team(A, 'chat');
    check('C7. a queued message whose copy on the phone cannot be read, then a read of the chat: it stays in memory, on the phone (readable again), queued and on screen',
      s.mem.includes('C7 queued message') && Array.isArray(s.copy) && s.copy.includes('C7 queued message') && s.queued && s.screen.includes('C7 queued message'), s);
    delete net.keyFail[A.label];
    await A.tick(); await sleep(300);
    check('C7b. …the next refresh uploads it: in the cloud once', chatIn('C7 queued message').length === 1, cloudTexts().chat);
    await A.ctx.close();
  });

  // =====================================================================
  // M1 — a second memory shared while the first one's photo is still
  // uploading (slow link: photo uploads wait; the app's own 20-second wait)
  // =====================================================================
  await phase('M1', 'a second memory shared while the first one uploads', async () => {
    seed();
    const A = await mkPhone('M1-Mariam'); await A.boot(M, 'rep'); await A.openTeam('mem');
    net.holdPhoto.add(A.label);
    const id1 = await addMemory(A, 'M1 first memory');
    await share(A);
    await until(() => heldKeys(A.label).includes('photo:' + id1), 3000);
    await A.page.click('#modalContent .modal-close'); // she closes the sheet: nothing showed it was uploading
    const id2 = await addMemory(A, 'M1 second memory');
    const n0 = await toastCount(A);
    await share(A);
    await sleep(400);
    const told = await toastsFrom(A, n0);
    check('M1. a second memory shared while the first one\'s photo uploads is not refused without a word: its photo goes up too',
      heldKeys(A.label).includes('photo:' + id2), { uploading: heldKeys(A.label).map(k => k === 'photo:' + id1 ? 'photo 1' : k === 'photo:' + id2 ? 'photo 2' : k), toastsAfterTap: told });
    land(A.label, 'photo:' + id1); // photo 1 lands, well inside the 20-second wait
    await until(() => memIn('M1 first memory').length === 1, 8000); await sleep(400);
    const s1 = await sheet(A);
    check('M1b. …when the first one is shared, the second one\'s sheet is left as it is (open, its memory still pending)', s1.open && s1.pending === id2, s1);
    land(A.label); // the slow link catches up
    await until(() => memIn('M1 second memory').length === 1, 8000); await sleep(400);
    const s = await team(A, 'memories');
    check('M1c. both memories are shared: in memory, on the phone and in the cloud once each, each with its photo, and the sheet closes',
      ['M1 first memory', 'M1 second memory'].every(c => s.mem.includes(c) && Array.isArray(s.copy) && s.copy.includes(c) && memIn(c).length === 1) && !!cloud['photo:' + id1] && !!cloud['photo:' + id2] && !s.sheetOpen,
      { cloud: cloudTexts().memories, photo1: !!cloud['photo:' + id1], photo2: !!cloud['photo:' + id2], s });
    await A.ctx.close();
  });
  await phase('M1d', 'the first memory is shared while the second one\'s sheet is being written', async () => {
    seed();
    const A = await mkPhone('M1d-Mariam'); await A.boot(M, 'rep'); await A.openTeam('mem');
    net.holdPhoto.add(A.label);
    const id1 = await addMemory(A, 'M1d first memory');
    await share(A);
    await until(() => heldKeys(A.label).includes('photo:' + id1), 3000);
    await A.page.click('#modalContent .modal-close');
    const id2 = await addMemory(A, 'M1d second memory'); // written, not shared yet
    land(A.label, 'photo:' + id1);
    await until(() => memIn('M1d first memory').length === 1, 8000); await sleep(400);
    const s1 = await sheet(A);
    check('M1d. the first memory is shared while the second one\'s sheet is open: that sheet stays, with its caption and its photo pending', s1.open && s1.pending === id2 && s1.caption === 'M1d second memory', s1);
    net.holdPhoto.delete(A.label);
    if(s1.open) await share(A);
    await until(() => memIn('M1d second memory').length === 1, 8000);
    check('M1e. …and is shared when she taps Share', memIn('M1d second memory').length === 1 && !!cloud['photo:' + id2], cloudTexts().memories);
    await A.ctx.close();
  });
  await phase('M1f', 'Share tapped twice for one memory while its photo uploads', async () => {
    seed();
    const A = await mkPhone('M1f-Mariam'); await A.boot(M, 'rep'); await A.openTeam('mem');
    net.holdPhoto.add(A.label);
    const id = await addMemory(A, 'M1f one memory');
    await share(A);
    await until(() => heldKeys(A.label).includes('photo:' + id), 3000);
    const n0 = await toastCount(A);
    await share(A); // a second tap while it uploads
    await sleep(300);
    const told = await toastsFrom(A, n0);
    land(A.label);
    await until(() => memIn('M1f one memory').length === 1, 8000); await sleep(600);
    check('M1f. Share tapped again while the photo uploads: the screen says it is already being shared, and the memory is stored once',
      told.includes(BUSY) && memIn('M1f one memory').length === 1 && writesOf(A.label, 'photo:' + id) === 1, { toastsAfterSecondTap: told, inCloud: memIn('M1f one memory').length, photoWrites: writesOf(A.label, 'photo:' + id) });
    await A.ctx.close();
  });

  // =====================================================================
  // M2 — the photo lands, the memories list is only queued on the phone
  // (its save refused), or only in the app's memory (a full phone)
  // =====================================================================
  await phase('M2', 'the photo lands, the list only queued', async () => {
    seed();
    const A = await mkPhone('M2-Mariam'); await A.boot(M, 'rep'); await A.openTeam('mem');
    net.keyFail[A.label] = new Set(['memories']);
    const id = await addMemory(A, 'M2 queued memory');
    await A.page.evaluate(async () => { await saveMemory(); });
    const s = await team(A, 'memories');
    check('M2. the photo landed, the list only queued on this phone: the last word is not "shared with the team" — the memory is saved on this phone until it uploads',
      s.toastNow === ON_PHONE && !!cloud['photo:' + id] && memIn('M2 queued memory').length === 0 && s.queued && Array.isArray(s.copy) && s.copy.includes('M2 queued memory') && !s.sheetOpen && s.screen.includes('M2 queued memory'),
      { toastNow: s.toastNow, toasts: s.toasts, queued: s.queued, photo: !!cloud['photo:' + id] });
    const id2 = await addMemory(A, 'M2 second memory'); // within the same minute (the queue's own message shows once a minute)
    await A.page.evaluate(async () => { await saveMemory(); });
    const s2 = await team(A, 'memories');
    check('M2b. …a second one in the same minute is told the same', s2.toastNow === ON_PHONE && !!cloud['photo:' + id2] && s2.queued, { toastNow: s2.toastNow, toasts: s2.toasts });
    delete net.keyFail[A.label];
    await A.tick(); await sleep(300);
    const after = await team(A, 'memories');
    check('M2c. …the next refresh uploads the list: both in the cloud once each, the earlier memory kept, the queue empty',
      memIn('M2 queued memory').length === 1 && memIn('M2 second memory').length === 1 && memIn('an earlier memory').length === 1 && !after.queued, { cloud: cloudTexts().memories, queued: after.queued });
    await A.ctx.close();
  });
  await phase('M2d', 'a full phone: the photo lands, the list only in the app\'s memory', async () => {
    seed();
    const F = await mkPhone('M2d-Mariam-full'); await F.boot(M, 'rep'); await F.openTeam('mem');
    await F.page.evaluate(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(k === 'um_mirror:memories' || k === 'um_outbox') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; });
    net.keyFail[F.label] = new Set(['memories']);
    const id = await addMemory(F, 'M2d full phone memory');
    await F.page.evaluate(async () => { await saveMemory(); });
    const s = await team(F, 'memories');
    check('M2d. a full phone: the last word says the memory is only in the app\'s memory (keep the app open), the red bar stays — not "shared with the team"',
      s.toastNow === MEM_ONLY && !!s.redBar && s.mem.includes('M2d full phone memory') && !!cloud['photo:' + id] && memIn('M2d full phone memory').length === 0, { toastNow: s.toastNow, toasts: s.toasts, redBar: s.redBar });
    delete net.keyFail[F.label];
    await F.tick(); await sleep(300);
    const after = await team(F, 'memories');
    check('M2e. …kept open until it uploads: in the cloud once, the red bar gone', memIn('M2d full phone memory').length === 1 && !after.redBar, { cloud: cloudTexts().memories, redBar: after.redBar });
    await F.ctx.close();
  });

  // =====================================================================
  // M3 — the memories read while one is being saved (slow link: reads take
  // 2.5 s, the list write does not get through)
  // =====================================================================
  await phase('M3', 'a read of the memories while one is being saved', async () => {
    seed();
    const A = await mkPhone('M3-Mariam'); await A.boot(M, 'rep'); await A.openTeam('mem');
    const id = await addMemory(A, 'M3 memory');
    net.lag[A.label] = 2500; net.keyFail[A.label] = new Set(['memories']); net.txReads.length = 0;
    await A.page.evaluate(() => { window.__m = saveMemory(); });
    await until(() => net.txReads.includes(A.label + ' memories'), 5000);
    await sleep(300);
    await A.page.evaluate(() => { window.__l = loadTeam(); });
    await A.page.evaluate(async () => { await window.__m; await window.__l; renderMemories(); });
    const s = await team(A, 'memories');
    check('M3. the memories read while one is being saved: it stays in memory, on the phone, queued and in the grid',
      s.mem.includes('M3 memory') && Array.isArray(s.copy) && s.copy.includes('M3 memory') && s.queued && s.screen.includes('M3 memory') && !!cloud['photo:' + id], s);
    delete net.lag[A.label]; delete net.keyFail[A.label];
    await A.tick(); await sleep(300);
    const after = await team(A, 'memories');
    check('M3b. …signal back, the next refresh: it is in the cloud once, its photo too, the queue empty', memIn('M3 memory').length === 1 && !!cloud['photo:' + id] && !after.queued, { cloud: cloudTexts().memories, after });
    await A.ctx.close();
  });

  // =====================================================================
  // M4 — a share that lands: as before
  // =====================================================================
  await phase('M4', 'a share that lands', async () => {
    seed();
    const A = await mkPhone('M4-Mariam'); await A.boot(M, 'rep'); await A.openTeam('mem');
    const w0 = writesOf(A.label, 'memories');
    const id = await addMemory(A, 'M4 team lunch');
    await share(A);
    await until(() => memIn('M4 team lunch').length === 1, 5000); await sleep(300);
    const s = await team(A, 'memories');
    check('M4. a share that lands: "Memory shared with the team", the sheet closed, one write, in the cloud once with its photo, in the grid, nothing queued',
      s.toastNow === SHARED && !s.sheetOpen && writesOf(A.label, 'memories') - w0 === 1 && memIn('M4 team lunch').length === 1 && !!cloud['photo:' + id] && s.screen.includes('M4 team lunch') && !s.queued,
      { toastNow: s.toastNow, writes: writesOf(A.label, 'memories') - w0, s });
    await A.ctx.close();
  });

  // =====================================================================
  // AR — Arabic for every new message
  // =====================================================================
  await phase('AR', 'Arabic', async () => {
    const A = await mkPhone('AR-Mariam'); await A.boot(M, 'rep');
    const out = await A.page.evaluate(strs => strs.map(s => [s, window.UMI18N ? UMI18N.tr(s) : null]), [BUSY, ON_PHONE, MEM_ONLY]);
    const bad = out.filter(([, a]) => !a || !/[؀-ۿ]/.test(a));
    check('AR. every new message has its Arabic', bad.length === 0, bad.length ? bad : out.map(x => x[1]));
    await A.ctx.close();
  });

  check('no page errors on any phone', Object.values(errors).every(e => e.length === 0), errors);
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
