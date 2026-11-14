// Q13: the adapter's "retry without rev" (01-config.js withRev) runs the app's
// own adapter code against a stand-in Firestore whose writes pass or fail like
// the rules: (1) rules published before v123 (only value + updated), then
// (2) the owner publishes the v123 rules and, later that day, raises
// MIN_APP_REV() to 123 as the comment in firestore.rules invites.
// Does a v123 phone's save still land once the v123 rules ask for rev ≥ 123?
const fs = require('fs'), path = require('path');
const WWW = process.env.WWW || '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/review2-safe/www';
const src = fs.readFileSync(path.join(WWW, 'js', 'app', '01-config.js'), 'utf8');
const a = src.indexOf('const FIREBASE_CONFIG = {'), b = src.indexOf('const PRODUCTS_SEED');
const rev = src.match(/^const APP_REV = '([^']+)';/m)[1];
const ADAPTER = `const APP_REV = '${rev}';\n` + src.slice(a, b);
let RULES = 'old'; // 'old': {value, updated} only · 'v123': rev optional, ≥ MIN · MIN
let MIN = 0;
const writes = [];
const refused = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; };
const allowed = d => {
  const keys = Object.keys(d);
  if(RULES === 'old') return keys.every(k => k === 'value' || k === 'updated');
  return keys.every(k => ['value', 'updated', 'rev'].includes(k)) && (('rev' in d ? d.rev : 0) >= MIN);
};
const store = {};
function makeDb(){
  const docRef = k => ({
    async set(d){ writes.push({ k, rev: d.rev, ok: allowed(d), rules: RULES + '/' + MIN }); if(!allowed(d)) throw refused(); store[k] = d; },
    async get(){ return { exists: k in store, data: () => store[k] }; },
    async delete(){ delete store[k]; },
  });
  return {
    collection: () => ({ doc: docRef }),
    batch(){ const ops = []; return { set(ref, d){ ops.push([ref, d]); }, async commit(){ for(const [ref, d] of ops) if(!allowed(d)) throw refused(); for(const [ref, d] of ops) await ref.set(d); } }; },
    async runTransaction(fn){ const pend = []; const tx = { get: async ref => ref.get(), set: (ref, d) => pend.push([ref, d]) }; const r = await fn(tx); for(const [ref, d] of pend) if(!allowed(d)) throw refused(); for(const [ref, d] of pend) await ref.set(d); return r; },
  };
}
const ls = {}; // the phone's web storage
global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
function phone(){
  const db = makeDb();
  const fb = { initializeApp(){}, firestore: Object.assign(() => db, { FieldPath: { documentId: () => '__id__' } }), auth: () => ({ onAuthStateChanged(cb){ cb({ email: 'rep@example.com' }); } }) };
  const win = { firebase: fb };
  new Function('window', 'firebase', 'console', ADAPTER)(win, fb, { log(){}, warn(){}, error(){} });
  return win.storage;
}
(async () => {
  const out = [];
  let s = phone();
  // 1. deploy day, morning: the console still has the rules published before v123
  await s.set('tasks', '["morning"]');
  out.push(['old rules: the save lands (sent again without rev)', store.tasks && store.tasks.value === '["morning"]', writes.slice(-2)]);
  // 2. the owner publishes the v123 rules; later the same day he raises MIN_APP_REV() to 123
  RULES = 'v123'; MIN = 123;
  let err = null;
  try{ await s.set('tasks', '["afternoon"]'); }catch(e){ err = e.code; }
  out.push(['v123 rules, MIN_APP_REV() = 123: a v123 phone\'s save lands', !err && store.tasks.value === '["afternoon"]', { error: err, lastWrites: writes.slice(-2), um_revOff: ls.um_revOff }]);
  // 3. the app reopened the same day
  s = phone(); err = null;
  try{ await s.update('tasks', cur => '["reopened"]'); }catch(e){ err = e.code; }
  out.push(['…and after the app is reopened the same day', !err && store.tasks.value === '["reopened"]', { error: err, lastWrites: writes.slice(-2) }]);
  let bad = 0;
  out.forEach(([name, ok, info]) => { if(!ok) bad++; console.log((ok ? '✅ ' : '❌ ') + 'Q13 ' + name + '  → ' + JSON.stringify(info)); });
  console.log(bad ? `\n${bad} PROBE(S) SHOW A PROBLEM` : '\nNO PROBLEM SHOWN');
})();
