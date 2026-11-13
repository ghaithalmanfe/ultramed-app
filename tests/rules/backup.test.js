'use strict';
// The nightly encrypted backup (scripts/backup/nightly, docs/backup.md) on
// Google's own emulators, under ../../firestore.rules as published:
//  - the daily e-mails' login — a password login on the company domain, the
//    one the backup falls back to — lists and counts the whole collection, and
//    every document the app keeps is in the backup whole;
//  - a login outside the domain is refused at the first page: no file;
//  - a whole restore into the project as the supervisor is refused by the
//    published rules (old daily backups, a key they do not list) — nothing is
//    written, and the restore says it was the rules; restoring the documents
//    the rules accept (--only) puts each back exactly;
//  - with rules that let the restore login write, the whole backup comes back
//    exactly.
// The scripts run in this process with the app's Firebase config swapped for
// the demo project; every non-local request is refused.
// Run from tests/rules: npm ci && npm test
const realFetch = globalThis.fetch;
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if(!LOCAL.test(url)) return Promise.reject(new Error('blocked a non-local request: ' + url));
  return realFetch(input, init);
};

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const F = require('./fixtures');
const { ROOT, PROJECT, HOST, PORT, AUTH_HOST, SUP, REPORTS, snap, ARCH, AUDIT, PHOTO, CHUNK, TEAM_KEYS, SUPERVISOR_KEYS, stored } = F;
const NF = require(path.join(ROOT, 'scripts', 'backup', 'nightly', 'firestore.js'));
const NB = require(path.join(ROOT, 'scripts', 'backup', 'nightly', 'bundle.js'));

const PASSWORD = 'test-password-1';
const PASS = 'a long test passphrase — عبارة مرور طويلة 2026';
const OUTSIDER = 'test-outsider@example.org';            // not the company domain: the rules refuse it
const J = JSON.stringify;
const FS_HOST = HOST + ':' + PORT;
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
let env, SEED, tmp;

// the demo project instead of the app's: the scripts read their project and key from it
NF.appFirebaseConfig = () => ({ apiKey: 'demo-api-key', projectId: PROJECT });
const run = require(path.join(ROOT, 'scripts', 'backup', 'nightly', 'run.js'));
const restore = require(path.join(ROOT, 'scripts', 'backup', 'nightly', 'restore.js'));

function sink(){ let s = ''; return { write(x){ s += x; return true; }, get text(){ return s; } }; }
const emu = { FIRESTORE_EMULATOR_HOST: FS_HOST, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, BACKUP_RETRY_BASE_MS: '5' };
async function runBackup(env2){
  const out = sink(), err = sink(), dir = fs.mkdtempSync(path.join(tmp, 'out-'));
  const code = await run.main({ env: Object.assign({ BACKUP_PASSPHRASE: PASS, BACKUP_OUT_DIR: dir, BACKUP_TIER: 'daily', BACKUP_PAGE_SIZE: '7' }, emu, env2), argv: [], out, err });
  return { code, log: out.text + err.text, out: out.text, err: err.text, files: fs.readdirSync(dir).map(f => path.join(dir, f)) };
}
async function runRestore(file, args, login){
  const out = sink(), err = sink();
  const code = await restore.main({ env: Object.assign({ RESTORE_PROJECT_ID: PROJECT, RESTORE_API_KEY: 'demo-api-key', RESTORE_LOGIN_EMAIL: login, RESTORE_LOGIN_PASSWORD: PASSWORD, BACKUP_PASSPHRASE: PASS }, emu),
    argv: [file, '--i-understand-this-overwrites-production'].concat(args || []), out, err });
  return { code, log: out.text + err.text, err: err.text };
}
function assertCleanLog(text){
  assert.doesNotMatch(text, EMAIL, 'an e-mail address in the log');
  assert.ok(!text.includes(PASSWORD) && !text.includes(PASS), 'a password or the passphrase in the log');
  assert.doesNotMatch(text, /\beyJ[A-Za-z0-9_-]{4,}\./, 'a sign-in token in the log');
}
// every document as Firestore holds it, typed fields included (the emulator's owner access)
async function stateNow(){
  const docs = new Map(); let token = null;
  do{
    const r = await realFetch(DOCS + '/state?pageSize=50' + (token ? '&pageToken=' + encodeURIComponent(token) : ''), { headers: { authorization: 'Bearer owner' } });
    assert.equal(r.status, 200);
    const j = await r.json();
    (j.documents || []).forEach(d => docs.set(d.name.split('/documents/state/')[1], d.fields || {}));
    token = j.nextPageToken;
  }while(token);
  return docs;
}
async function putRules(src){
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', body: J({ rules: { files: [{ name: 'firestore.rules', content: src }] } }) });
  assert.equal(r.status, 200, await r.text());
}
async function createLogin(email){
  const r = await realFetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ email, password: PASSWORD, returnSecureToken: true }) });
  assert.equal(r.status, 200, await r.text());
}

before(async () => {
  const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'um-rules-backup-'));
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: F.rulesFor(SUP), host: HOST, port: Number(PORT) } });
  await realFetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  for(const email of [REPORTS, SUP, OUTSIDER]) await createLogin(email);
  // every key the app keeps (the rules' inventory, fixtures.js), and a key from
  // an old app version the rules no longer list
  SEED = Object.assign(F.makeSeed(), { currentUser: { name: 'Rep A', role: 'rep' } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => { const db = ctx.firestore(); const b = db.batch(); Object.keys(SEED).forEach(k => b.set(db.collection('state').doc(k), stored(SEED[k]))); await b.commit(); });
});
after(async () => {
  if(env){ await putRules(F.rulesFor(SUP)); await env.cleanup(); }
  if(tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the nightly backup under the published rules', () => {
  let file, original;
  test('the daily e-mails\' login backs up every document the app keeps, whole', async () => {
    original = await stateNow();
    assert.equal(original.size, Object.keys(SEED).length);
    const r = await runBackup({ REPORT_LOGIN_EMAIL: REPORTS, REPORT_LOGIN_PASSWORD: PASSWORD });
    assert.equal(r.code, 0, r.log);
    assert.match(r.out, /Signed in with the daily e-mails' login/);
    assert.match(r.out, new RegExp('Count check: Firestore counts ' + original.size + ' documents'));
    assert.equal(r.files.length, 1);
    file = r.files[0];
    const chk = NB.checkBundle(NB.decryptBackup(fs.readFileSync(file), PASS).plaintext);
    assert.ok(chk.ok, chk.problems.join('; '));
    assert.equal(chk.count, original.size);
    for(const [k, fields] of original){
      assert.ok(NB.hasOwn(chk.bundle.keys, k), 'in the backup: ' + k);
      assert.equal(NB.canonicalJSON(chk.bundle.keys[k].fields), NB.canonicalJSON(fields), 'whole: ' + k);
    }
    for(const k of [ARCH, AUDIT, PHOTO, CHUNK, 'chat', 'memories', 'visitsIndex']) assert.ok(NB.hasOwn(chk.bundle.keys, k), k);
    // the emulator does not read an RFC 3339 time in a query string (Firestore does): the run says so and reads page by page
    assert.ok(chk.bundle.readTime || /Firestore refused a fixed read time/.test(r.out), r.out);
    assertCleanLog(r.log);
  });
  test('a login outside the company domain is refused at the first page, and no file is kept', async () => {
    const r = await runBackup({ BACKUP_LOGIN_EMAIL: OUTSIDER, BACKUP_LOGIN_PASSWORD: PASSWORD });
    assert.equal(r.code, 1, r.log);
    assert.match(r.err, /page 1: HTTP 403 PERMISSION_DENIED/);
    assert.match(r.err, /No backup file was written/);
    assert.deepEqual(r.files, []);
    assertCleanLog(r.log);
  });
  test('a whole restore as the supervisor is refused by the published rules, and nothing is written', async () => {
    await env.clearFirestore();
    const r = await runRestore(file, [], SUP);
    assert.equal(r.code, 1, r.log);
    assert.match(r.err, /HTTP 403 PERMISSION_DENIED/);
    assert.match(r.err, /security rules refused/);
    assert.equal((await stateNow()).size, 0, 'a refused commit writes none of its documents');
    assertCleanLog(r.log);
  });
  test('the documents the published rules accept, restored as the supervisor (--only), come back exactly', async () => {
    await env.clearFirestore();
    const fam = { [ARCH]: 'visitsArch:', [AUDIT]: 'auditLog:', [PHOTO]: 'photo:', [CHUNK]: 'erpRows:' };
    const only = TEAM_KEYS.concat(SUPERVISOR_KEYS).map(k => fam[k] || k).concat([snap(0)]);
    const r = await runRestore(file, ['--only=' + only.join(',')], SUP);
    assert.equal(r.code, 0, r.log);
    const now = await stateNow();
    const want = Array.from(original.keys()).filter(k => only.some(s => k === s || (/[:_]$/.test(s) && k.startsWith(s)))).sort();
    assert.deepEqual(Array.from(now.keys()).sort(), want);
    for(const k of want) assert.equal(NB.canonicalJSON(now.get(k)), NB.canonicalJSON(original.get(k)), 'restored exactly: ' + k);
    assertCleanLog(r.log);
  });
  test('with rules that let the restore login write, the whole backup comes back exactly', async () => {
    await env.clearFirestore();
    await putRules("rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /state/{key} { allow read, write: if request.auth != null && request.auth.token.email == '" + SUP + "'; }\n  }\n}\n");
    try{
      const r = await runRestore(file, [], SUP);
      assert.equal(r.code, 0, r.log);
      assert.match(r.log, new RegExp('Read back: all ' + original.size + ' restored documents are identical'));
      const now = await stateNow();
      assert.equal(now.size, original.size);
      for(const [k, fields] of original) assert.equal(NB.canonicalJSON(now.get(k)), NB.canonicalJSON(fields), 'restored exactly: ' + k);
      assertCleanLog(r.log);
    }finally{ await putRules(F.rulesFor(SUP)); }
  });
});
