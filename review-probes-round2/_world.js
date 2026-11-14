// Review probes: a fake cloud shared by several phones (in Node), modelled on
// the repository's sync-core / save-truth harnesses. Invented data only.
//   deny: { re, ops: 'r'|'w'|'rw', who?: Set } — permission-denied (FirebaseError code) for those keys/ops
//   offline: Set of phone labels with no connection
//   slowWrite[k] = ms, hang (Set of keys whose next read never answers), slowGet[k] = ms
//   LIMIT: a document above 1 MiB minus its name is refused (invalid-argument), like Firestore
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ENV = require('/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/review2-safe/tests/e2e/_env.js');
const WWW = path.resolve(process.env.WWW || '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/review2-safe/www');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const LIMIT = 1048576 - 100;
function makeWorld(PORT, clock){
  const V122 = path.resolve(process.env.WWW122 || '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/rv-work/v122/www');
  const server = http.createServer((req,res)=>{ let u = req.url.split('?')[0]; let root = WWW; if(u.startsWith('/v122/')){ root = V122; u = u.slice(5); } const f = path.join(root, u==='/'?'index.html':u); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
  const cloud = {};
  const mode = { deny: null, offline: new Set(), hang: new Set(), slowGet: {}, slowWrite: {}, reads: [], writes: [], tries: [] };
  let held = false; const waiters = [];
  const acquire = async () => { if(!held){ held = true; return true; } await new Promise(r => waiters.push(r)); return true; };
  const release = async () => { const next = waiters.shift(); if(next) next(); else held = false; return true; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const off = who => { if(mode.offline.has(who)) return { __err: 'unavailable', msg: 'boom-offline: Failed to get document because the client is offline.' }; return null; };
  const denied = (who, k, op) => !!(mode.deny && mode.deny.re.test(k) && mode.deny.ops.includes(op) && (!mode.deny.who || mode.deny.who.has(who)));
  const api = {
    get: async (who, k) => { const o = off(who); if(o) return o; mode.reads.push(who + '|' + k);
      if(mode.hang.has(k)){ mode.hang.delete(k); return new Promise(() => {}); }
      if(denied(who, k, 'r')) return { __err: 'permission-denied' };
      const v = k in cloud ? cloud[k] : null;
      if(mode.slowGet[k]){ const ms = mode.slowGet[k]; delete mode.slowGet[k]; await wait(ms); }
      return v; },
    set: async (who, k, v) => { const o = off(who); if(o) return o;
      if(mode.slowWrite[k]){ const ms = mode.slowWrite[k]; delete mode.slowWrite[k]; await wait(ms); }
      if(denied(who, k, 'w')){ mode.tries.push(who + '|' + k); return { __err: 'permission-denied' }; }
      if(Buffer.byteLength(v, 'utf8') > LIMIT){ mode.tries.push(who + '|' + k); return { __err: 'invalid-argument', msg: `Document 'state/${k}' cannot be written because its size (${Buffer.byteLength(v, 'utf8')} bytes) exceeds the maximum allowed size of 1,048,576 bytes.` }; }
      mode.writes.push(who + '|' + k); cloud[k] = v; if(mode.onWrite) try{ mode.onWrite(who, k, v); }catch(e){} return true; },
    setMany: async (who, e) => { const o = off(who); if(o) return o; for(const [k] of e){ if(denied(who, k, 'w')) return { __err: 'permission-denied' }; } e.forEach(([k, v]) => { mode.writes.push(who + '|' + k); cloud[k] = v; }); return true; },
    del: async (who, k) => { const o = off(who); if(o) return o; if(denied(who, k, 'w')) return { __err: 'permission-denied' }; mode.writes.push(who + '|del:' + k); delete cloud[k]; return true; },
    list: async (who, p) => { const o = off(who); if(o) return o; return Object.keys(cloud).filter(k => k.startsWith(p)); },
  };
  const results = []; let failed = 0;
  function check(name, ok, info){ const line = (ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,900):''); results.push(line); console.log(line); if(!ok) failed++; }
  const parse = s => { try{ return JSON.parse(s); }catch(e){ return null; } };
  let browser = null; const errors = {}, consoleLog = {};
  async function start(){ await new Promise(r=>server.listen(PORT,r)); browser = await chromium.launch(ENV.launchOpts()); }
  async function mkPhone(label, ctxOpts){
    const co = Object.assign({}, ctxOpts || {}); delete co.old; const ctx = await browser.newContext(co); await ENV.blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage(); errors[label] = []; consoleLog[label] = [];
    page.on('pageerror', e => errors[label].push('pageerror: ' + e.message));
    page.on('console', m => { consoleLog[label].push(m.type() + ': ' + m.text().slice(0, 300)); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', k => api.get(label, k)); await page.exposeFunction('__cSet', (k, v) => api.set(label, k, v)); await page.exposeFunction('__cDel', k => api.del(label, k));
    await page.exposeFunction('__cList', p => api.list(label, p)); await page.exposeFunction('__cSetMany', e => api.setMany(label, e));
    await page.exposeFunction('__cAcquire', acquire); await page.exposeFunction('__cRelease', release);
    await page.addInitScript((clock) => {
      const fail = r => { if(r && r.__err){ const e = new Error(r.__err === 'permission-denied' ? 'Missing or insufficient permissions.' : (r.msg || r.__err)); e.code = r.__err; e.name = 'FirebaseError'; throw e; } return r; };
      window.storage = {
        get: async k => { const v = fail(await window.__cGet(k)); return v == null ? null : { value: v }; },
        set: async (k, v) => fail(await window.__cSet(k, v)), setMany: async e => fail(await window.__cSetMany(e)), delete: async k => fail(await window.__cDel(k)), list: async p => ({ keys: fail(await window.__cList(p)) }),
        update: async (k, fn) => { await window.__cAcquire(); try{ const cur = fail(await window.__cGet(k)); const next = fn(cur == null ? null : cur); if(next == null) return null; fail(await window.__cSet(k, next)); return next; } finally { await window.__cRelease(); } },
      };
      const shift = () => { try{ return (parseFloat(sessionStorage.getItem('__shift') || '0') || 0); }catch(e){ return 0; } };
      const offs = clock - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + offs + shift()); else super(...a); } static now(){ return _D.now() + offs + shift(); } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      window.__shiftBy = ms => { sessionStorage.setItem('__shift', String(shift() + ms)); };
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { if(ms === 20000){ window.__bgTick = fn; return -1; } return _si(fn, ms, ...a); };
    }, clock);
    const goto = async () => { await page.goto(`http://localhost:${PORT}/${(ctxOpts && ctxOpts.old) ? 'v122/' : ''}index.html`); await page.waitForTimeout(250); };
    const boot = async (who, role, opts) => {
      await goto();
      const p = page.evaluate(async ({who, role}) => { await selectUser(who, role); }, {who, role});
      if(opts && opts.noWait) return p;
      await p; await page.waitForTimeout(350);
      await page.evaluate(() => { window.__toasts = []; const real = showToast; window.showToast = (m, ms) => { window.__toasts.push(String(m)); return real(m, ms); }; try{ _lastOfflineToast = 0; }catch(e){} });
    };
    const tick = async () => { await page.waitForFunction(() => !_flushing); await page.evaluate(async () => { await window.__bgTick(); }); await page.waitForTimeout(150); };
    const ev = (fn, arg) => page.evaluate(fn, arg);
    return { page, boot, tick, ev, label, ctx, goto };
  }
  async function finish(){
    console.log('\n' + results.join('\n'));
    Object.keys(errors).forEach(k => { if(errors[k].length) console.log('page errors ' + k + ': ' + JSON.stringify(errors[k]).slice(0, 800)); });
    await browser.close(); server.close();
    console.log(failed ? `\n${failed} PROBE(S) SHOW A PROBLEM` : '\nNO PROBLEM SHOWN');
    process.exit(0);
  }
  return { cloud, mode, start, mkPhone, check, parse, finish, errors, consoleLog, twoRepStaff: ENV.twoRepStaff };
}
module.exports = { makeWorld, WWW };
