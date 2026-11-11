'use strict';
// Proves ../../firestore.rules on the local Firestore emulator (port 8295,
// demo project "demo-ultramed-rules": the emulator never reaches the real
// Firebase project). Run from tests/rules:  npm ci && npm test
//
// The committed rules carry a placeholder for the supervisor's e-mail; the
// suite puts a fictional test login in its place, exactly as the owner puts
// the real one in the console — and checks the file as committed too.
// Every login below is fictional (test-…@ultramed-kw.com).
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs,
  documentId, runTransaction, writeBatch, setLogLevel,
} = require('firebase/firestore');
setLogLevel('silent'); // the refusals below are expected; the SDK would log each one

const PROJECT = 'demo-ultramed-rules';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8295').split(':');
// RULES_FILE=<path> runs the same suite on another rules file (e.g. the old
// open rule, to see what it lets through).
const RULES_FILE = process.env.RULES_FILE ? path.resolve(process.env.RULES_FILE) : path.join(__dirname, '..', '..', 'firestore.rules');
const REPORT_JS = path.join(__dirname, '..', '..', 'scripts', 'daily-report', 'report.js');
const PLACEHOLDER = 'SUPERVISOR_EMAIL@ultramed-kw.com';
const RAW_RULES = fs.readFileSync(RULES_FILE, 'utf8');

const SUP = 'test-supervisor@ultramed-kw.com';
const REP_A = 'test-rep-a@ultramed-kw.com';
const REP_B = 'test-rep-b@ultramed-kw.com';
const REPORTS = 'test-reports@ultramed-kw.com'; // a dedicated login for the e-mail job
const rulesFor = (supervisorEmail) => RAW_RULES.replace(`['${PLACEHOLDER}']`, `['${supervisorEmail}']`);

// ---- dates (UTC, as request.time is) ----
const utcDay = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const kuwaitToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const snap = (offset) => 'snap_' + utcDay(offset);

// ---- every key the app and the e-mail job use (see the inventory in firestore.rules) ----
const TEAM_KEYS = ['clinics', 'visits', 'visitsIndex', 'tasks', 'dayPlans', 'events', 'tombs', 'recycleBin',
  'erpNotes', 'repairLog', 'chat', 'memories', 'mailLog', 'visitsArch:2026-10', 'photo:mh3k2x9q7f1a'];
const SUPERVISOR_KEYS = ['staff', 'targets', 'benchmarks', 'products', 'categoryGuides', 'erpSales',
  'erpMap', 'erpMapLog', 'rxTypes', 'erpRows:mh1a2b3c4d:1762300000000:0'];
const SNAP_KEYS = [snap(0), snap(-5), snap(-14)];
const ALL_KEYS = TEAM_KEYS.concat(SUPERVISOR_KEYS, SNAP_KEYS);

const clinicList = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'c-' + i, name: 'Test clinic ' + i, rep: i % 2 ? 'Rep A' : 'Rep B', cls: 'B', notes: '', doctors: [{ id: 'd' + i, name: 'Dr. Test ' + i }],
}));
const SEED = {
  clinics: clinicList(30),
  visits: [{ id: 'v1', clinicId: 'c-1', rep: 'Rep A', date: utcDay(0) }],
  visitsIndex: { months: { '2026-10': { n: 1, rev: 1 } }, v: 1 },
  'visitsArch:2026-10': [{ id: 'v0', clinicId: 'c-2', rep: 'Rep B', date: '2026-10-05' }],
  tasks: [{ id: 't1', rep: 'Rep A', text: 'Call back' }],
  dayPlans: { [utcDay(0)]: { 'Rep A': ['c-1'] } },
  events: [{ id: 'e1', kind: 'stand', clinicId: 'c-1', rep: 'Rep A' }],
  tombs: { visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} },
  recycleBin: { clinics: [], products: [], visits: [] },
  erpNotes: {}, repairLog: [], chat: [], memories: [],
  mailLog: { last: null, history: [] },
  'photo:mh3k2x9q7f1a': 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
  staff: [{ name: 'Rep A', role: 'rep', email: REP_A }, { name: 'Rep B', role: 'rep', email: REP_B }, { name: 'Supervisor', role: 'supervisor', email: SUP }],
  targets: { 'Rep A': { revenue: 1000 } }, benchmarks: { coverage: 80 }, products: [{ id: 'p1', name: 'Test brush', price: 4 }],
  categoryGuides: {}, erpSales: { periods: [] }, erpMap: {}, erpMapLog: [], rxTypes: { rev: 1, types: [] },
  'erpRows:mh1a2b3c4d:1762300000000:0': [],
};
SNAP_KEYS.forEach(k => { SEED[k] = { clinics: [], visits: [], tasks: [], ts: new Date().toISOString() }; });
const asValue = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const stored = (v) => ({ value: asValue(v), updated: Date.now() }); // exactly what window.storage writes

let env;
const ref = (db, key) => doc(db, 'state', key);
const read = (db, key) => getDoc(ref(db, key));
const save = (db, key, v) => setDoc(ref(db, key), stored(v === undefined ? SEED[key] || [] : v));
const remove = (db, key) => deleteDoc(ref(db, key));
const listPrefix = (db, prefix) => getDocs(query(collection(db, 'state'), where(documentId(), '>=', prefix), where(documentId(), '<', prefix + '')));
const uidOf = (s) => 'u-' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const passwordToken = (email, extra) => Object.assign({ email, email_verified: false, firebase: { sign_in_provider: 'password', identities: { email: [email] } } }, extra || {});
const login = (email, extra) => env.authenticatedContext(uidOf(email), passwordToken(email, extra)).firestore();
const withProvider = (provider, email) => env.authenticatedContext(uidOf(provider + (email || '')), Object.assign(email ? { email } : {}, { firebase: { sign_in_provider: provider, identities: {} } })).firestore();

async function seed(){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), b = writeBatch(db);
    Object.keys(SEED).forEach(k => b.set(ref(db, k), stored(SEED[k])));
    await b.commit();
  });
}
async function unseed(key){ await env.withSecurityRulesDisabled(ctx => deleteDoc(ref(ctx.firestore(), key))); }
async function exists(key){ let e = null; await env.withSecurityRulesDisabled(async ctx => { e = (await getDoc(ref(ctx.firestore(), key))).exists(); }); return e; }
async function storedValue(key){ let v = null; await env.withSecurityRulesDisabled(async ctx => { const s = await getDoc(ref(ctx.firestore(), key)); v = s.exists() ? s.data().value : null; }); return v; }

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: rulesFor(SUP), host: HOST, port: Number(PORT) } });
});
after(async () => { if(env) await env.cleanup(); });
beforeEach(seed);

describe('the rules file as committed', () => {
  test('names the supervisor only by the placeholder — no real e-mail address in the file', () => {
    assert.equal(RAW_RULES.split(`['${PLACEHOLDER}']`).length, 2, 'the SUPERVISOR_EMAILS() list holds the placeholder exactly once');
    const emails = RAW_RULES.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    assert.ok(emails.length > 0);
    emails.forEach(e => assert.equal(e, PLACEHOLDER, 'an e-mail address other than the placeholder: ' + e));
  });
  test('the placeholder is upper case, so it can never match a login (Firebase e-mails are lower case)', () => {
    assert.notEqual(PLACEHOLDER, PLACEHOLDER.toLowerCase());
  });
});

describe('signed-out, anonymous and other sign-in methods are refused everything', () => {
  const who = {
    'signed out': () => env.unauthenticatedContext().firestore(),
    'anonymous': () => withProvider('anonymous'),
    'custom token with a company e-mail': () => withProvider('custom', REP_A),
    'Google sign-in with a company e-mail': () => withProvider('google.com', REP_A),
    'phone sign-in': () => withProvider('phone'),
  };
  for(const [name, make] of Object.entries(who)){
    test(`${name}: cannot read any document`, async () => {
      const db = make();
      for(const k of ALL_KEYS) await assertFails(read(db, k));
    });
    test(`${name}: cannot list the backups or the whole collection`, async () => {
      const db = make();
      await assertFails(listPrefix(db, 'snap_'));
      await assertFails(getDocs(collection(db, 'state')));
    });
    test(`${name}: cannot create, overwrite or delete`, async () => {
      const db = make();
      await assertFails(save(db, 'clinics', []));
      await assertFails(save(db, 'visits', []));
      await assertFails(save(db, 'staff', [{ name: 'Intruder', role: 'supervisor', email: REP_A }]));
      await assertFails(save(db, snap(0)));
      await assertFails(save(db, 'photo:new1'));
      await assertFails(remove(db, 'photo:mh3k2x9q7f1a'));
      await assertFails(remove(db, snap(-14)));
      await assertFails(remove(db, 'clinics'));
      assert.ok(await exists('clinics') && await exists('photo:mh3k2x9q7f1a') && await exists(snap(-14)));
    });
  }
});

describe('only password logins on the company domain', () => {
  const outsiders = ['someone@gmail.com', 'boss@ultramed-kw.com.evil.io', 'boss@evil-ultramed-kw.com',
    'boss@ultramedXkw.com', 'boss@ultramed-kw.co', 'boss@sub.ultramed-kw.com', 'ultramed-kw.com@gmail.com'];
  for(const email of outsiders){
    test(`${email}: cannot read or write`, async () => {
      const db = login(email);
      await assertFails(read(db, 'clinics'));
      await assertFails(read(db, 'staff'));
      await assertFails(listPrefix(db, 'snap_'));
      await assertFails(save(db, 'visits', []));
      await assertFails(save(db, 'mailLog'));
    });
  }
  test('the domain check ignores letter case (Test-Rep-A@UltraMed-KW.com reads)', async () => {
    await assertSucceeds(read(login('Test-Rep-A@UltraMed-KW.com'), 'clinics'));
  });
  test('an unverified company account is accepted (console-created accounts are unverified)', async () => {
    await assertSucceeds(read(login(REP_A, { email_verified: false }), 'clinics'));
    await assertSucceeds(save(login(REP_A, { email_verified: false }), 'visits'));
  });
});

describe('a rep (a password login on the company domain)', () => {
  test('can read every document the app and the e-mail job use', async () => {
    const db = login(REP_A);
    for(const k of ALL_KEYS) await assertSucceeds(read(db, k));
  });
  test('can run the id-range lists the app runs (backups, visit archives) and the old whole-collection read', async () => {
    const db = login(REP_A);
    const snaps = await assertSucceeds(listPrefix(db, 'snap_'));
    assert.equal(snaps.size, SNAP_KEYS.length);
    const arch = await assertSucceeds(listPrefix(db, 'visitsArch:'));
    assert.equal(arch.size, 1);
    await assertSucceeds(getDocs(collection(db, 'state')));
  });
  for(const key of TEAM_KEYS){
    test(`can save ${key}`, async () => {
      await assertSucceeds(save(login(REP_A), key));
    });
    test(`can create ${key} when it does not exist yet`, async () => {
      await unseed(key);
      await assertSucceeds(save(login(REP_B), key));
    });
  }
  test('saves the way the app does: the read-merge-write transaction (storageUpdate) and a new month archive', async () => {
    const db = login(REP_A);
    await assertSucceeds(runTransaction(db, async tx => {
      const cur = await tx.get(ref(db, 'visits'));
      const arr = JSON.parse(cur.data().value);
      arr.push({ id: 'v2', clinicId: 'c-3', rep: 'Rep A', date: utcDay(0) });
      tx.set(ref(db, 'visits'), stored(arr));
    }));
    await assertSucceeds(save(db, 'visitsArch:2026-09', [{ id: 'v9', date: '2026-09-30' }]));
    assert.match(await storedValue('visits'), /"v2"/);
  });
  for(const key of SUPERVISOR_KEYS){
    test(`cannot overwrite ${key}`, async () => {
      await assertFails(save(login(REP_A), key));
      assert.equal(await storedValue(key), asValue(SEED[key]));
    });
    test(`cannot create ${key} when it is missing`, async () => {
      await unseed(key);
      await assertFails(save(login(REP_A), key));
      assert.equal(await exists(key), false);
    });
  }
  test('cannot save the sales file: the batch of row chunks + index lands all or nothing (setMany)', async () => {
    const db = login(REP_A), b = writeBatch(db);
    b.set(ref(db, 'erpRows:mhNEW:1762400000000:0'), stored([[1, 2, 3]]));
    b.set(ref(db, 'erpSales'), stored({ periods: [{ id: 'mhNEW' }] }));
    await assertFails(b.commit());
    assert.equal(await exists('erpRows:mhNEW:1762400000000:0'), false);
    assert.equal(await storedValue('erpSales'), asValue(SEED.erpSales));
  });
  test('cannot delete any document the app never deletes', async () => {
    const db = login(REP_A);
    for(const k of TEAM_KEYS.filter(k => !k.startsWith('photo:')).concat(SUPERVISOR_KEYS)) await assertFails(remove(db, k));
    for(const k of TEAM_KEYS.concat(SUPERVISOR_KEYS)) assert.ok(await exists(k), k + ' is still there');
  });
  test('can delete a visit photo (removeEditPhoto)', async () => {
    await assertSucceeds(remove(login(REP_A), 'photo:mh3k2x9q7f1a'));
    assert.equal(await exists('photo:mh3k2x9q7f1a'), false);
  });
  test('cannot delete the sales row chunks (only the supervisor\'s save prunes them)', async () => {
    await assertFails(remove(login(REP_A), 'erpRows:mh1a2b3c4d:1762300000000:0'));
  });
  test('cannot wipe the clinic list: a save under a third of its size is refused', async () => {
    const db = login(REP_A);
    await assertFails(save(db, 'clinics', []));
    await assertFails(save(db, 'clinics', clinicList(7)));
    assert.equal(await storedValue('clinics'), asValue(SEED.clinics));
  });
  test('ordinary clinic saves still land (a clinic or doctor more or less, notes edited)', async () => {
    const db = login(REP_A);
    await assertSucceeds(save(db, 'clinics', clinicList(29)));
    await assertSucceeds(save(db, 'clinics', clinicList(31)));
    await assertSucceeds(save(db, 'clinics', clinicList(31).map(c => Object.assign(c, { notes: '' }))));
  });
  test('cannot write a document the app does not use, or any other collection', async () => {
    const db = login(REP_A);
    for(const k of ['foo', 'clinics2', 'Clinics', 'snap_latest', 'visitsArch:2026', 'visitsArch:2026-10-01', 'currentUser', 'erpRows', 'photo:'])
      await assertFails(save(db, k, []));
    await assertFails(setDoc(doc(db, 'users', 'x'), { value: '[]', updated: 1 }));
    await assertFails(getDoc(doc(db, 'users', 'x')));
  });
  test('only the app\'s document shape { value: string, updated: number } is accepted', async () => {
    const db = login(REP_A);
    await assertFails(setDoc(ref(db, 'visits'), { value: '[]', updated: 1, owner: 'me' }));
    await assertFails(setDoc(ref(db, 'visits'), { value: [], updated: 1 }));
    await assertFails(setDoc(ref(db, 'visits'), { value: '[]' }));
    await assertFails(setDoc(ref(db, 'visits'), { value: '[]', updated: 'now' }));
    await assertFails(setDoc(ref(db, 'visits'), {}));
    await assertSucceeds(setDoc(ref(db, 'visits'), { value: '[]', updated: 1.5 }));
  });
});

describe('daily backups (snap_YYYY-MM-DD)', () => {
  test('any team phone writes today\'s backup, and again later the same day (maybeSnapshot)', async () => {
    await unseed(snap(0));
    await assertSucceeds(save(login(REP_A), snap(0)));
    await assertSucceeds(save(login(REP_B), snap(0)));
    await assertSucceeds(save(login(SUP), snap(0)));
  });
  test(`Kuwait's date (${kuwaitToday}) and the UTC days either side are accepted (a phone's time zone)`, async () => {
    const db = login(REP_A);
    for(const k of ['snap_' + kuwaitToday, snap(-1), snap(1)]) await assertSucceeds(save(db, k));
  });
  test('nobody can overwrite an older backup or write one ahead — not even the supervisor', async () => {
    for(const email of [REP_A, SUP]){
      const db = login(email);
      for(const k of [snap(-2), snap(-5), snap(-14), snap(2), snap(30)]) await assertFails(save(db, k));
    }
    assert.equal(await storedValue(snap(-5)), asValue(SEED[snap(-5)]));
  });
  test('a backup 13 or more days old is deleted by any team phone (the app\'s clean-up, 13–19 days back)', async () => {
    const db = login(REP_A);
    await assertSucceeds(remove(db, snap(-14)));
    for(const k of [snap(-13), snap(-19), 'snap_2026-01-05']) await assertSucceeds(remove(db, k));
    assert.equal(await exists(snap(-14)), false);
  });
  test('the last 11 days of backups cannot be deleted — not even by the supervisor', async () => {
    for(const email of [REP_A, SUP]){
      const db = login(email);
      for(const k of [snap(0), snap(-5), snap(-11), snap(1)]) await assertFails(remove(db, k));
    }
    assert.ok(await exists(snap(0)) && await exists(snap(-5)));
  });
  test('a malformed backup id cannot be written or deleted', async () => {
    const db = login(SUP);
    for(const k of ['snap_2026-13-45', 'snap_26-1-1', 'snap_' + utcDay(0) + 'x']){
      await assertFails(save(db, k));
      await assertFails(remove(db, k));
    }
  });
});

describe('the supervisor (the e-mail in SUPERVISOR_EMAILS)', () => {
  for(const key of SUPERVISOR_KEYS){
    test(`can save ${key}`, async () => {
      await assertSucceeds(save(login(SUP), key));
    });
  }
  test('can create the supervisor documents on a fresh account (the start-up seeding)', async () => {
    const db = login(SUP);
    for(const key of ['staff', 'products', 'benchmarks', 'categoryGuides', 'rxTypes']){
      await unseed(key);
      await assertSucceeds(save(db, key));
    }
  });
  test('can save every team document too', async () => {
    const db = login(SUP);
    for(const key of TEAM_KEYS) await assertSucceeds(save(db, key));
  });
  test('saves the sales file the way the app does: row chunks + index in one batch (setMany)', async () => {
    const db = login(SUP), b = writeBatch(db);
    b.set(ref(db, 'erpRows:mhNEW:1762400000000:0'), stored([[1, 2, 3]]));
    b.set(ref(db, 'erpRows:mhNEW:1762400000000:1'), stored([[4, 5, 6]]));
    b.set(ref(db, 'erpSales'), stored({ periods: [{ id: 'mhNEW' }] }));
    await assertSucceeds(b.commit());
    assert.ok(await exists('erpRows:mhNEW:1762400000000:1'));
  });
  test('saves an account link by compare-and-set, as saveErpLink does (transaction on erpMap)', async () => {
    const db = login(SUP);
    await assertSucceeds(runTransaction(db, async tx => {
      const cur = await tx.get(ref(db, 'erpMap'));
      const m = JSON.parse(cur.data().value); m['TEST ACCOUNT'] = 'c-1';
      tx.set(ref(db, 'erpMap'), stored(m));
    }));
  });
  test('deletes sales row chunks that are no longer referenced (the save\'s clean-up)', async () => {
    await assertSucceeds(remove(login(SUP), 'erpRows:mh1a2b3c4d:1762300000000:0'));
  });
  test('may shrink the clinic list (bulk delete, restore from a backup)', async () => {
    await assertSucceeds(save(login(SUP), 'clinics', clinicList(4)));
  });
  test('cannot delete documents the app never deletes', async () => {
    const db = login(SUP);
    for(const k of ['clinics', 'visits', 'staff', 'erpSales', 'products', 'tombs', 'recycleBin', 'targets'])
      await assertFails(remove(db, k));
  });
  test('cannot write a document the app does not use', async () => {
    const db = login(SUP);
    for(const k of ['foo', 'admin', 'currentUser']) await assertFails(save(db, k, []));
  });
  test('is recognised in any letter case of the e-mail', async () => {
    await assertSucceeds(save(login(SUP.toUpperCase()), 'targets'));
  });
  test('must also sign in with a password: the same e-mail through another provider is refused', async () => {
    await assertFails(save(withProvider('google.com', SUP), 'targets'));
    await assertFails(save(withProvider('custom', SUP), 'staff'));
  });
});

describe('nobody can make themselves supervisor', () => {
  test('a rep cannot rewrite the team list to promote herself', async () => {
    const db = login(REP_A);
    const promoted = SEED.staff.map(s => s.email === REP_A ? Object.assign({}, s, { role: 'supervisor' }) : s);
    await assertFails(save(db, 'staff', promoted));
    await unseed('staff');
    await assertFails(save(db, 'staff', promoted));
  });
  test('being listed as supervisor in the staff document gives no rights', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(ref(ctx.firestore(), 'staff'), stored([{ name: 'Rep A', role: 'supervisor', email: REP_A }])));
    const db = login(REP_A);
    for(const k of ['targets', 'staff', 'erpMap', 'products']) await assertFails(save(db, k));
  });
  test('token claims give no rights (role / admin / supervisor claims)', async () => {
    const db = login(REP_A, { role: 'supervisor', admin: true, supervisor: true });
    for(const k of ['targets', 'staff', 'erpSales', 'rxTypes']) await assertFails(save(db, k));
  });
  test('another team login is not the supervisor', async () => {
    for(const email of [REP_B, REPORTS]) await assertFails(save(login(email), 'targets'));
  });
});

describe('the daily e-mail job (scripts/daily-report/report.js), same REST requests', () => {
  const DOCS = `http://${HOST}:${PORT}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  // An unsigned emulator token, the shape createMockUserToken builds.
  const token = (email, provider) => {
    const sub = uidOf((provider || 'password') + (email || ''));
    return b64({ alg: 'none', type: 'JWT' }) + '.' + b64(Object.assign({
      iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, iat: 0, exp: 3600, auth_time: 0, sub, user_id: sub,
      firebase: { sign_in_provider: provider || 'password', identities: {} },
    }, email ? { email, email_verified: false } : {})) + '.';
  };
  // The key list the job reads first, taken from report.js itself, plus what it reads next.
  const src = fs.readFileSync(REPORT_JS, 'utf8');
  const m = src.match(/readDocs\(idToken, \[([^\]]+)\]\)/);
  const BASE_KEYS = m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : [];
  const JOB_KEYS = BASE_KEYS.concat(['visitsArch:2026-10', 'erpRows:mh1a2b3c4d:1762300000000:0', 'mailLog']);
  const batchGet = (tk, keys) => fetch(`${DOCS}:batchGet`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk },
    body: JSON.stringify({ documents: keys.map(k => `projects/${PROJECT}/databases/(default)/documents/state/${k}`) }),
  });
  const writeMailLog = (tk) => fetch(`${DOCS}/state/${encodeURIComponent('mailLog')}?updateMask.fieldPaths=value&updateMask.fieldPaths=updated`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk },
    body: JSON.stringify({ fields: { value: { stringValue: JSON.stringify({ last: { kind: 'morning' }, history: [] }) }, updated: { integerValue: String(Date.now()) } } }),
  });

  test('report.js still reads the keys this suite expects', () => {
    assert.deepEqual(BASE_KEYS, ['clinics', 'visits', 'visitsIndex', 'tasks', 'dayPlans', 'events', 'targets', 'staff', 'erpSales', 'erpMap']);
  });
  for(const [name, email] of [['a dedicated job login', REPORTS], ['the supervisor\'s login', SUP], ['a rep\'s login', REP_A]]){
    test(`${name}: reads everything the digest needs in one batchGet`, async () => {
      const r = await batchGet(token(email), JOB_KEYS);
      assert.equal(r.status, 200, await r.clone().text());
      const arr = await r.json();
      assert.equal(arr.filter(x => x.found).length, JOB_KEYS.length);
    });
    test(`${name}: logs the run to mailLog (PATCH with an update mask)`, async () => {
      const r = await writeMailLog(token(email));
      assert.equal(r.status, 200, await r.clone().text());
      assert.match(await storedValue('mailLog'), /morning/);
    });
  }
  test('an anonymous or off-domain login gets nothing and logs nothing', async () => {
    for(const tk of [token(null, 'anonymous'), token('reports@gmail.com'), token(REPORTS, 'custom')]){
      assert.equal((await batchGet(tk, JOB_KEYS)).status, 403);
      assert.equal((await writeMailLog(tk)).status, 403);
    }
    assert.equal(await storedValue('mailLog'), asValue(SEED.mailLog));
  });
  test('the job\'s login cannot change the sales or the team list', async () => {
    await assertFails(save(login(REPORTS), 'erpSales'));
    await assertFails(save(login(REPORTS), 'staff'));
  });
});

// Last: the file exactly as committed (placeholder untouched) — it must lock
// the supervisor documents for everyone and still let the team work.
describe('the rules exactly as committed (placeholder not yet replaced)', () => {
  before(async () => {
    await env.cleanup();
    env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: RAW_RULES, host: HOST, port: Number(PORT) } });
  });
  test('compile, and make nobody supervisor — not even a login spelled like the placeholder', async () => {
    for(const email of [SUP, PLACEHOLDER, PLACEHOLDER.toLowerCase()]){
      const db = login(email);
      await assertFails(save(db, 'staff'));
      await assertFails(save(db, 'targets'));
    }
  });
  test('the team still reads everything and saves its own documents', async () => {
    const db = login(REP_A);
    await assertSucceeds(read(db, 'staff'));
    await assertSucceeds(save(db, 'visits'));
    await assertSucceeds(save(db, 'clinics'));
  });
});
