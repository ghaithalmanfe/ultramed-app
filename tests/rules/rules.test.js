'use strict';
// Who may read, write and delete what: ../../firestore.rules on the local
// Firestore emulator (demo project — never the real one), with tokens shaped
// like Firebase Auth's (password, anonymous, custom, Google, phone).
// Run from tests/rules:  npm ci && npm test
//
// The committed rules carry a placeholder for the supervisor's e-mail; the
// suite puts fictional test logins in its place, exactly as the owner puts
// the real one in the console — and checks the file as committed too.
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs,
  documentId, runTransaction, writeBatch, setLogLevel,
} = require('firebase/firestore');
const F = require('./fixtures');
const { PROJECT, HOST, PORT, RAW_RULES, PLACEHOLDER, JOB_PLACEHOLDER, SUP, SUP2, REP_A, REP_B, REPORTS, BACKUPS, snap, utcDay, kuwaitDay,
  PHOTO, CHUNK, TEAM_KEYS, SUPERVISOR_KEYS, JOB_KEYS, STARTUP_SEED_KEYS, SNAP_KEYS, ALL_KEYS, clinicList, asValue, stored } = F;
setLogLevel('silent'); // the refusals below are expected; the SDK would log each one

let env, SEED;
const ref = (db, key) => doc(db, 'state', key);
const read = (db, key) => getDoc(ref(db, key));
const save = (db, key, v) => setDoc(ref(db, key), stored(v === undefined ? (SEED[key] !== undefined ? SEED[key] : []) : v));
const remove = (db, key) => deleteDoc(ref(db, key));
const listPrefix = (db, prefix) => getDocs(query(collection(db, 'state'), where(documentId(), '>=', prefix), where(documentId(), '<', prefix + '')));
const uidOf = (s) => 'u-' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const passwordToken = (email, extra) => Object.assign({ email, email_verified: false, firebase: { sign_in_provider: 'password', identities: { email: [email] } } }, extra || {});
const login = (email, extra) => env.authenticatedContext(uidOf(email), passwordToken(email, extra)).firestore();
const withProvider = (provider, email) => env.authenticatedContext(uidOf(provider + (email || '')), Object.assign(email ? { email } : {}, { firebase: { sign_in_provider: provider, identities: {} } })).firestore();

async function seed(){
  SEED = F.makeSeed();
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
  // two supervisor logins, the list form the owner uses when there are several
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: F.rulesFor(SUP, SUP2), host: HOST, port: Number(PORT) } });
});
after(async () => { if(env) await env.cleanup(); });
beforeEach(seed);

describe('the rules file as committed', () => {
  test('names the supervisor and the job logins only by their placeholders — no real e-mail address in the file', () => {
    assert.equal(RAW_RULES.split(`['${PLACEHOLDER}']`).length, 2, 'the SUPERVISOR_EMAILS() list holds the placeholder exactly once');
    assert.equal(RAW_RULES.split(`['${JOB_PLACEHOLDER}']`).length, 2, 'the JOB_EMAILS() list holds its placeholder exactly once');
    const emails = RAW_RULES.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    assert.ok(emails.length > 0);
    emails.forEach(e => assert.ok(e === PLACEHOLDER || e === JOB_PLACEHOLDER, 'an e-mail address other than the placeholders: ' + e));
  });
  test('the placeholders are upper case, so they can never match a login (Firebase e-mails are lower case)', () => {
    assert.notEqual(PLACEHOLDER, PLACEHOLDER.toLowerCase());
    assert.notEqual(JOB_PLACEHOLDER, JOB_PLACEHOLDER.toLowerCase());
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
      await assertFails(remove(db, PHOTO));
      await assertFails(remove(db, snap(-14)));
      await assertFails(remove(db, 'clinics'));
      await unseed('benchmarks');
      await assertFails(save(db, 'benchmarks')); // not even the start-up seeding
      assert.ok(await exists('clinics') && await exists(PHOTO) && await exists(snap(-14)));
    });
  }
});

describe('only password logins on the company domain', () => {
  const outsiders = ['someone@gmail.com', 'test-boss@ultramed-kw.com.evil.io', 'boss@evil-ultramed-kw.com',
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
  test('can run the id-range lists the app runs (backups, visit archives) and a whole-collection read', async () => {
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
      arr.push({ id: 'v2', clinicId: 'c-3', rep: 'Rep A', date: kuwaitDay(0) });
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
    if(!STARTUP_SEED_KEYS.includes(key)) test(`cannot create ${key} when it is missing`, async () => {
      await unseed(key);
      await assertFails(save(login(REP_A), key));
      assert.equal(await exists(key), false);
    });
  }
  for(const key of STARTUP_SEED_KEYS){
    test(`can create ${key} only when the account has none (start-up seeding) — never change it after`, async () => {
      await unseed(key);
      const db = login(REP_A);
      await assertSucceeds(save(db, key));
      await assertFails(save(db, key, { changed: true }));
    });
  }
  test('cannot write mailLog — the e-mail job\'s log is the job logins\' and the supervisor\'s (v123)', async () => {
    await assertFails(save(login(REP_A), 'mailLog'));
    await unseed('mailLog');
    await assertFails(save(login(REP_B), 'mailLog'));
    assert.equal(await exists('mailLog'), false);
  });
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
    for(const k of TEAM_KEYS.filter(k => k !== PHOTO).concat(SUPERVISOR_KEYS)) await assertFails(remove(db, k));
    for(const k of TEAM_KEYS.concat(SUPERVISOR_KEYS)) assert.ok(await exists(k), k + ' is still there');
  });
  test('can delete a visit photo (removeEditPhoto)', async () => {
    await assertSucceeds(remove(login(REP_A), PHOTO));
    assert.equal(await exists(PHOTO), false);
  });
  test('cannot delete the sales row chunks (only the supervisor\'s save prunes them)', async () => {
    await assertFails(remove(login(REP_A), CHUNK));
  });
  test('cannot empty the clinic list: a save leaving under a tenth of it is refused', async () => {
    const db = login(REP_A);
    await assertFails(save(db, 'clinics', []));
    await assertFails(save(db, 'clinics', clinicList(2)));
    assert.equal(await storedValue('clinics'), asValue(SEED.clinics));
  });
  test('every clinic save the app itself allows still lands — down to a third of the list (the app\'s own guard)', async () => {
    const db = login(REP_A);
    await assertSucceeds(save(db, 'clinics', clinicList(10)));
    await seed();
    await assertSucceeds(save(db, 'clinics', clinicList(29)));
    await assertSucceeds(save(db, 'clinics', clinicList(31)));
    await assertSucceeds(save(db, 'clinics', clinicList(31).map(c => Object.assign(c, { doctors: [] }))));
  });
  test('cannot write a document the app does not use, or any other collection', async () => {
    const db = login(REP_A);
    for(const k of ['foo', 'clinics2', 'Clinics', 'snap_latest', 'visitsArch:2026', 'visitsArch:2026-10-01', 'currentUser', 'erpRows', 'photo:',
      'auditLog:', 'auditLog:2026', 'auditLog:2026-11-12', 'auditlog:2026-11', 'auditLogs:2026-11', 'audit:2026-11'])
      await assertFails(save(db, k, []));
    await assertFails(setDoc(doc(db, 'users', 'x'), { value: '[]', updated: 1 }));
    await assertFails(getDoc(doc(db, 'users', 'x')));
  });
  test('the change log: every phone appends to a month document auditLog:YYYY-MM (any month, an offline phone catches up); nobody deletes one', async () => {
    const append = (db, key, e) => runTransaction(db, async tx => {
      const cur = await tx.get(ref(db, key));
      const d = cur.exists() ? JSON.parse(cur.data().value) : { v: 1, month: key.slice(9), entries: [], dropped: 0, trimmed: 0 };
      d.entries.push(e);
      tx.set(ref(db, key), stored(d));
    });
    for(const [email, who] of [[REP_A, 'Rep A'], [REP_B, 'Rep B'], [SUP, 'Supervisor']]){
      await assertSucceeds(append(login(email), F.AUDIT, { eid: 'e-' + who, at: new Date().toISOString(), by: who }));
      await assertSucceeds(append(login(email), 'auditLog:2026-09', { eid: 'old-' + who, at: '2026-09-30T20:00:00.000Z', by: who }));
    }
    const d = JSON.parse(await storedValue(F.AUDIT));
    assert.deepEqual(d.entries.map(e => e.eid), ['seed-1', 'e-Rep A', 'e-Rep B', 'e-Supervisor']);
    for(const email of [REP_A, SUP]){
      await assertFails(remove(login(email), F.AUDIT));
      await assertFails(remove(login(email), 'auditLog:2026-09'));
    }
    assert.ok(await exists(F.AUDIT) && await exists('auditLog:2026-09'));
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
  const today = 'snap_' + kuwaitDay(0); // the day the phones name it by (Kuwait, UTC+3)
  test('any team phone creates today\'s backup once (maybeSnapshot) — and nobody on the team can overwrite it then; only the supervisor may replace it', async () => {
    await unseed(today);
    await assertSucceeds(save(login(REP_A), today));
    await assertFails(save(login(REP_B), today, { clinics: [], visits: [], tasks: [], poisoned: true }));
    await assertFails(save(login(REP_A), today, { clinics: [] }));
    assert.equal(await storedValue(today), asValue(SEED[today] !== undefined ? SEED[today] : []), 'still the backup rep A created');
    await assertSucceeds(save(login(SUP), today));
  });
  test(`the team creates only Kuwait's date (${kuwaitDay(0)}): not yesterday's, not tomorrow's (a pre-filled later day would make every phone skip it)`, async () => {
    const db = login(REP_A);
    for(const k of ['snap_' + kuwaitDay(-1), 'snap_' + kuwaitDay(1), 'snap_' + kuwaitDay(2)]){ await unseed(k); await assertFails(save(db, k)); assert.equal(await exists(k), false, k); }
    await unseed(today);
    await assertSucceeds(save(db, today));
  });
  test('the supervisor writes a current backup (yesterday, today or tomorrow in UTC — a phone\'s time zone), created or replaced', async () => {
    const db = login(SUP);
    for(const k of [today, snap(-1), snap(1)]) await assertSucceeds(save(db, k));
    for(const k of [today, snap(-1), snap(1)]) await assertSucceeds(save(db, k, { clinics: [], replaced: true }));
  });
  test('the job logins (e-mail, backup) read the backups but cannot create, change or delete one', async () => {
    for(const email of [REPORTS, BACKUPS]){
      const db = login(email);
      await assertSucceeds(listPrefix(db, 'snap_'));
      await unseed(today);
      await assertFails(save(db, today));
      await assertFails(remove(db, snap(-14)));
    }
    assert.ok(await exists(snap(-14)));
  });
  test('nobody can overwrite an older backup or write one ahead — not even the supervisor', async () => {
    for(const email of [REP_A, SUP]){
      const db = login(email);
      for(const k of [snap(-2), snap(-5), snap(-14), snap(2), snap(30)]) await assertFails(save(db, k));
    }
    assert.equal(await storedValue(snap(-5)), asValue(SEED[snap(-5)]));
  });
  test('a backup 11 or more days old is deleted by any team phone (the app\'s clean-up)', async () => {
    const db = login(REP_A);
    await assertSucceeds(remove(db, snap(-14)));
    for(const k of [snap(-11), snap(-13), snap(-19), 'snap_2026-01-05']) await assertSucceeds(remove(db, k));
    assert.equal(await exists(snap(-14)), false);
  });
  test('the backups of the last 10 days cannot be deleted — not even by the supervisor', async () => {
    for(const email of [REP_A, SUP]){
      const db = login(email);
      for(const k of [snap(0), snap(-5), snap(-10), snap(1)]) await assertFails(remove(db, k));
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

describe('the supervisor (an e-mail in SUPERVISOR_EMAILS)', () => {
  for(const key of SUPERVISOR_KEYS){
    test(`can save ${key}`, async () => {
      await assertSucceeds(save(login(SUP), key));
    });
  }
  test('a second supervisor login in the list has the same rights', async () => {
    const db = login(SUP2);
    for(const key of ['staff', 'targets', 'erpMap', 'rxTypes']) await assertSucceeds(save(db, key));
  });
  test('can create the supervisor documents on a fresh account', async () => {
    const db = login(SUP);
    for(const key of SUPERVISOR_KEYS){
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
    await assertSucceeds(remove(login(SUP), CHUNK));
  });
  test('may shrink the clinic list as far as he likes (bulk delete, restore from a backup)', async () => {
    await assertSucceeds(save(login(SUP), 'clinics', clinicList(1)));
  });
  test('cannot delete documents the app never deletes', async () => {
    const db = login(SUP);
    for(const k of ['clinics', 'visits', 'staff', 'erpSales', 'products', 'tombs', 'recycleBin', 'targets', F.AUDIT])
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
    const promoted = SEED.staff.map(s => s.email === REP_A ? Object.assign({}, s, { role: 'supervisor' }) : s);
    await assertFails(save(login(REP_A), 'staff', promoted));
    assert.equal(await storedValue('staff'), asValue(SEED.staff));
  });
  test('being listed as supervisor in the staff document gives no rights — even one she created on an empty account', async () => {
    await unseed('staff');
    const db = login(REP_A);
    await assertSucceeds(save(db, 'staff', [{ name: 'Rep A', role: 'supervisor', email: REP_A }])); // start-up seeding
    for(const k of ['targets', 'staff', 'erpMap', 'erpSales', 'rxTypes']) await assertFails(save(db, k));
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
  const src = fs.readFileSync(path.join(F.ROOT, 'scripts', 'daily-report', 'report.js'), 'utf8');
  const m = src.match(/readDocs\(idToken, \[([^\]]+)\]\)/);
  const BASE_KEYS = m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : [];
  const JOB_KEYS = BASE_KEYS.concat([F.ARCH, CHUNK, 'mailLog']);
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
  }
  for(const [name, email] of [['a dedicated job login', REPORTS], ['the supervisor\'s login', SUP]]){
    test(`${name}: logs the run to mailLog (PATCH with an update mask)`, async () => {
      const r = await writeMailLog(token(email));
      assert.equal(r.status, 200, await r.clone().text());
      assert.match(await storedValue('mailLog'), /morning/);
    });
  }
  test('a rep\'s login cannot write mailLog (v123: it keeps the recipients and outcomes of the job)', async () => {
    const r = await writeMailLog(token(REP_A));
    assert.equal(r.status, 403);
    assert.equal(await storedValue('mailLog'), asValue(SEED.mailLog));
  });
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
  test('the job logins (the e-mail job, the nightly backup) read every document and write nothing but mailLog', async () => {
    for(const email of [REPORTS, BACKUPS]){
      const db = login(email);
      for(const k of ALL_KEYS) await assertSucceeds(read(db, k));
      await assertSucceeds(getDocs(collection(db, 'state')));          // the nightly backup reads the whole collection
      for(const k of TEAM_KEYS.concat(SUPERVISOR_KEYS)) await assertFails(save(db, k));
      await assertFails(remove(db, PHOTO));
      await unseed('benchmarks');
      await assertFails(save(db, 'benchmarks'));                       // not even the start-up seeding
      await assertSucceeds(save(db, 'mailLog', { last: { kind: 'evening' }, history: [] }));
    }
    for(const k of TEAM_KEYS) assert.equal(await storedValue(k), asValue(SEED[k]), k + ' unchanged');
  });
});

// Last: the file exactly as committed (placeholder untouched) — it must lock
// the supervisor documents for everyone and still let the team work.
// v123 review (audit item 15): every document carries the app's revision, so
// the owner can stop an older app version from writing once every phone has
// the new one (MIN_APP_REV() in the rules, raised in the console).
describe('the app revision on every document (rev)', () => {
  const withRev = (v, rev) => Object.assign(stored(v), { rev });
  const minRev = n => F.rulesFor(SUP, SUP2).replace(/function MIN_APP_REV\(\) \{\s*return 0;/, `function MIN_APP_REV() {\n      return ${n};`);
  test('the committed rules let every version write: MIN_APP_REV() is 0', () => {
    assert.match(RAW_RULES, /function MIN_APP_REV\(\) \{\s*return 0;\s*\}/);
    assert.notEqual(minRev(123), F.rulesFor(SUP, SUP2), 'the test can raise it');
  });
  test('a save carrying the app revision lands (the team\'s, the supervisor\'s, a new document); one without it too (an older app); a revision that is not a whole number, or any other field, is refused', async () => {
    await assertSucceeds(setDoc(ref(login(REP_A), 'visits'), withRev(SEED.visits, 123)));
    await assertSucceeds(setDoc(ref(login(SUP), 'targets'), withRev(SEED.targets, 123)));
    await unseed('tasks'); await assertSucceeds(setDoc(ref(login(REP_B), 'tasks'), withRev([], 123)));
    await assertSucceeds(save(login(REP_A), 'visits'));
    await assertFails(setDoc(ref(login(REP_A), 'visits'), withRev(SEED.visits, 'v123')));
    await assertFails(setDoc(ref(login(REP_A), 'visits'), withRev(SEED.visits, 123.5)));
    await assertFails(setDoc(ref(login(REP_A), 'visits'), Object.assign(withRev(SEED.visits, 123), { by: 'Rep A' })));
  });
  describe('the oldest version allowed raised in the console (MIN_APP_REV() → 123)', () => {
    before(async () => { await env.cleanup(); env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: minRev(123), host: HOST, port: Number(PORT) } }); });
    after(async () => { await env.cleanup(); env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: F.rulesFor(SUP, SUP2), host: HOST, port: Number(PORT) } }); });
    test('an older app is refused — no revision, or an older one — on the team\'s and the supervisor\'s documents, new or not; the current version lands', async () => {
      await assertFails(save(login(REP_A), 'visits'));
      await assertFails(setDoc(ref(login(REP_A), 'visits'), withRev(SEED.visits, 122)));
      await assertSucceeds(setDoc(ref(login(REP_A), 'visits'), withRev(SEED.visits, 123)));
      await assertFails(save(login(SUP), 'targets'));
      await assertSucceeds(setDoc(ref(login(SUP), 'targets'), withRev(SEED.targets, 124)));
      await unseed('snap_' + kuwaitDay(0));
      await assertFails(save(login(REP_A), 'snap_' + kuwaitDay(0), { clinics: [] }));
      await assertSucceeds(setDoc(ref(login(REP_A), 'snap_' + kuwaitDay(0)), withRev({ clinics: [] }, 123)));
      assert.equal(await storedValue('targets'), asValue(SEED.targets));
    });
    test('the daily e-mail job\'s log is not held to it (the job writes no revision)', async () => {
      await assertSucceeds(save(login(REPORTS), 'mailLog', { last: { at: new Date().toISOString() } }));
    });
    test('reads are never held to it', async () => {
      for(const k of ['clinics', 'visits', 'staff', 'targets']) await assertSucceeds(read(login(REP_B), k));
    });
  });
});

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
    await assertSucceeds(save(db, 'products'));
  });
  test('no login is a job login until its placeholder is replaced: the job\'s login is an ordinary team login, and nobody writes mailLog', async () => {
    for(const email of [REPORTS, JOB_PLACEHOLDER, JOB_PLACEHOLDER.toLowerCase(), REP_A]) await assertFails(save(login(email), 'mailLog'));
    await assertSucceeds(read(login(REPORTS), 'clinics'));
  });
});
