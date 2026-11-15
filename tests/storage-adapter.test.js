// The app's storage adapter (www/js/app/01-config.js, window.storage on
// Firestore) and the app revision it writes on every document (rev, v123):
// run from its own source against a stand-in Firestore whose writes pass or
// fail like the security rules do. (The same adapter on the real emulator:
// tests/rules/app-writes.test.js.)
//   'old'  — rules published before v123: { value, updated } only
//   'v123' — rev accepted, and refused below MIN_APP_REV() (0 as committed;
//            the owner may raise it in the console)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const WWW = process.env.WWW ? path.resolve(process.env.WWW) : path.join(__dirname, '..', 'www');

function adapter(){
  const src = fs.readFileSync(path.join(WWW, 'js', 'app', '01-config.js'), 'utf8');
  const a = src.indexOf('const FIREBASE_CONFIG = {'), b = src.indexOf('const PRODUCTS_SEED');
  assert.ok(a > 0 && b > a, '01-config.js: the adapter block was not found');
  const rev = src.match(/^const APP_REV = '([^']+)';/m)[1];
  return `const APP_REV = '${rev}';\n` + src.slice(a, b);
}
const ADAPTER = adapter();
const REV = parseInt(ADAPTER.match(/^const APP_REV = '([^']+)'/m)[1].replace(/\D/g, ''), 10); // the revision the app writes (APP_REV_NUM)
function world(){
  const W = { rules: 'old', min: 0, store: {}, writes: [], ls: {} };
  const refused = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; };
  const allowed = d => {
    const keys = Object.keys(d);
    if(W.rules === 'old') return keys.every(k => k === 'value' || k === 'updated');
    return keys.every(k => ['value', 'updated', 'rev'].includes(k)) && (('rev' in d ? d.rev : 0) >= W.min);
  };
  const docRef = k => ({
    async set(d){ W.writes.push({ k, rev: d.rev, ok: allowed(d) }); if(!allowed(d)) throw refused(); W.store[k] = d; },
    async get(){ return { exists: k in W.store, data: () => W.store[k] }; },
    async delete(){ delete W.store[k]; },
  });
  const db = {
    collection: () => ({ doc: docRef }),
    batch(){ const ops = []; return { set(ref, d){ ops.push([ref, d]); }, async commit(){ for(const [, d] of ops) if(!allowed(d)) throw refused(); for(const [ref, d] of ops) await ref.set(d); } }; },
    async runTransaction(fn){ const pend = []; const tx = { get: async ref => ref.get(), set: (ref, d) => pend.push([ref, d]) }; const r = await fn(tx); for(const [, d] of pend) if(!allowed(d)) throw refused(); for(const [ref, d] of pend) await ref.set(d); return r; },
  };
  // one phone: its web storage survives a reopen (W.ls), the app is started again from its source
  W.phone = () => {
    const prev = global.localStorage;
    global.localStorage = { getItem: k => (k in W.ls ? W.ls[k] : null), setItem: (k, v) => { W.ls[k] = String(v); }, removeItem: k => { delete W.ls[k]; } };
    const fb = { initializeApp(){}, firestore: Object.assign(() => db, { FieldPath: { documentId: () => '__id__' } }), auth: () => ({ onAuthStateChanged(cb){ cb({ email: 'rep@example.com' }); } }) };
    const win = { firebase: fb };
    try{ new Function('window', 'firebase', 'console', ADAPTER)(win, fb, { log(){}, warn(){}, error(){} }); }
    finally{ if(prev === undefined) delete global.localStorage; else global.localStorage = prev; }
    // the adapter reads web storage when it writes, too: keep this phone's while it works
    const s = win.storage, wrap = fn => async (...a) => { const p = global.localStorage; global.localStorage = { getItem: k => (k in W.ls ? W.ls[k] : null), setItem: (k, v) => { W.ls[k] = String(v); }, removeItem: k => { delete W.ls[k]; } }; try{ return await fn(...a); } finally{ if(p === undefined) delete global.localStorage; else global.localStorage = p; } };
    return { set: wrap(s.set.bind(s)), update: wrap(s.update.bind(s)), setMany: wrap(s.setMany.bind(s)) };
  };
  return W;
}

test('the rules published before v123, then the v123 rules with the oldest version allowed raised to 123 the same day: every save lands (v123 round 3)', async () => {
  const W = world();
  let s = W.phone();
  await s.set('tasks', '["morning"]');
  assert.equal(W.store.tasks.value, '["morning"]', 'old rules: lands (sent again without rev)');
  assert.equal(W.store.tasks.rev, undefined);
  W.rules = 'v123'; W.min = 123; // the owner publishes the v123 rules and raises MIN_APP_REV() that afternoon
  await s.set('tasks', '["afternoon"]');
  assert.equal(W.store.tasks.value, '["afternoon"]', 'a v123 phone that wrote without rev this morning lands its save: sent again with rev');
  assert.equal(W.store.tasks.rev, REV);
  await s.update('tasks', () => '["transaction"]');
  assert.equal(W.store.tasks.value, '["transaction"]', 'its next write carries rev at once');
  assert.deepEqual(W.writes.slice(-1).map(w => [w.rev, w.ok]), [[REV, true]], 'no refused try first: the shape that landed last is remembered');
  s = W.phone(); // the app reopened the same day
  await s.update('tasks', () => '["reopened"]');
  assert.equal(W.store.tasks.value, '["reopened"]', '…and after the app is reopened the same day');
  assert.deepEqual(W.writes.slice(-1).map(w => [w.rev, w.ok]), [[REV, true]]);
  await s.setMany([['visitsIndex', '{"v":1}'], ['erpSales', '{}']]);
  assert.equal(W.store.visitsIndex.rev, REV, 'a batch too');
});

test('the other way: a phone that last wrote without rev under the old rules; the v123 rules (MIN 0) take it as it is, and raised to 123 it goes back to rev (v123 round 3)', async () => {
  const W = world();
  const s = W.phone();
  await s.set('tasks', '["old rules"]');
  W.rules = 'v123'; W.min = 0; // the v123 rules as committed: rev optional
  await s.set('tasks', '["v123 rules, MIN 0"]');
  assert.equal(W.store.tasks.value, '["v123 rules, MIN 0"]');
  W.min = 123;
  await s.update('tasks', () => '["MIN 123"]');
  assert.equal(W.store.tasks.value, '["MIN 123"]', 'refused without rev → sent with rev → lands');
  assert.equal(W.store.tasks.rev, REV);
  // the old rules come back (the console's previous version re-published): sent again without rev, lands
  W.rules = 'old';
  await s.set('tasks', '["old again"]');
  assert.equal(W.store.tasks.value, '["old again"]');
});

test('refused both ways (a rep\'s save the rules refuse anyway): thrown, and the shape remembered stays', async () => {
  const W = world();
  W.rules = 'v123'; W.min = 0;
  const s = W.phone();
  await s.set('tasks', '["first"]');
  assert.equal(W.store.tasks.rev, REV);
  W.min = 999; // no shape can land
  await assert.rejects(s.set('tasks', '["refused"]'), e => e && e.code === 'permission-denied');
  W.min = 123;
  const n = W.writes.length;
  await s.set('tasks', '["after"]');
  assert.deepEqual(W.writes.slice(n).map(w => [w.rev, w.ok]), [[REV, true]], 'still writes rev first');
});
