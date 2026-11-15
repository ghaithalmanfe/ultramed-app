'use strict';
// The nightly encrypted backup (scripts/backup/nightly, docs/backup.md) on
// Google's own emulators, under ../../firestore.rules as published (v123):
//  - the backup's own login — a JOB login: it reads everything and writes
//    only mailLog — lists and counts the whole collection, and every document
//    the app keeps is in the backup whole, with its app revision (`rev`) where
//    it has one and none where it has not; with no backup login set, the daily
//    e-mails' login makes the same backup; before the owner lists the login in
//    JOB_EMAILS() it still reads everything;
//  - a login outside the domain is refused at the first page: no file, and the
//    run says what the login must be;
//  - the backup's login cannot restore: the rules refuse its writes;
//  - a whole restore into the project as the supervisor is refused by the
//    published rules (old daily backups, a key they do not list) — nothing is
//    written, and the restore says it was the rules; the guide's own --only
//    list puts back every document the app keeps, exactly, `rev` included;
//  - once MIN_APP_REV() is raised in the console, a document an older version
//    saved (no `rev`) is refused — a restore never adds one — and restores
//    again with it back at 0;
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
const { ROOT, PROJECT, HOST, PORT, AUTH_HOST, SUP, REPORTS, BACKUPS, snap, ARCH, AUDIT, PHOTO, CHUNK, TEAM_KEYS, SUPERVISOR_KEYS, JOB_KEYS, SNAP_KEYS, stored } = F;
const NF = require(path.join(ROOT, 'scripts', 'backup', 'nightly', 'firestore.js'));
const NB = require(path.join(ROOT, 'scripts', 'backup', 'nightly', 'bundle.js'));

const PASSWORD = 'test-password-1';
const PASS = NB.makePassphrase();                        // as the passphrase page makes them: the only kind the backup takes
const OUTSIDER = 'test-outsider@example.org';            // not the company domain: the rules refuse it
const J = JSON.stringify;
const FS_HOST = HOST + ':' + PORT;
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
let env, SEED, tmp;
// Saved by v123 (they carry the app revision); every other document of the seed
// was saved before it, or by the e-mail job, and has none.
const WITH_REV = ['clinics', 'visits', 'visitsIndex', ARCH, 'products', 'tombs', 'staff', 'targets', CHUNK, PHOTO];
const REV = { integerValue: '123' };
const matchesOnly = (k, only) => only.some(s => k === s || (/[:_]$/.test(s) && k.startsWith(s)));
// the list the guide gives for a restore into production, exactly as printed
function guideOnlyList(){
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'backup.md'), 'utf8');
  const at = guide.indexOf('\n## Restore into production');
  assert.ok(at > 0, 'docs/backup.md has the section "Restore into production"');
  const m = /--only=([A-Za-z0-9:_,]+)/.exec(guide.slice(at, guide.indexOf('\n## ', at + 5)));
  assert.ok(m, 'the section gives an --only list');
  return m[1].split(',');
}
// MIN_APP_REV() raised in the console, as the owner may do once every phone runs the new version
const minRev = n => F.rulesFor(SUP).replace(/function MIN_APP_REV\(\) \{\s*return 0;/, 'function MIN_APP_REV() {\n      return ' + n + ';');

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
  assert.ok(!text.includes(PASSWORD) && !text.includes(PASS) && !text.includes(PASS.replace(/-/g, '')), 'a password or the passphrase in the log');
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
  for(const email of [REPORTS, BACKUPS, SUP, OUTSIDER]) await createLogin(email);
  // every key the app keeps (the rules' inventory, fixtures.js), and a key from
  // an old app version the rules no longer list
  SEED = Object.assign(F.makeSeed(), { currentUser: { name: 'Rep A', role: 'rep' } });
  WITH_REV.forEach(k => assert.ok(k in SEED, 'the seed holds ' + k));
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(); const b = db.batch();
    Object.keys(SEED).forEach(k => b.set(db.collection('state').doc(k), WITH_REV.includes(k) ? Object.assign(stored(SEED[k]), { rev: 123 }) : stored(SEED[k])));
    await b.commit();
  });
});
// one document set straight in the emulator (no rules): damage, or a mark to see what a restore touched
async function setRaw(key, data){ await env.withSecurityRulesDisabled(ctx => ctx.firestore().collection('state').doc(key).set(data)); }
function assertRevAsStored(docs, what){
  for(const [k, fields] of docs){
    if(WITH_REV.includes(k)) assert.deepEqual(fields.rev, REV, what + ': ' + k + ' keeps its rev');
    else assert.ok(!('rev' in fields), what + ': ' + k + ' is given no rev');
  }
}
after(async () => {
  if(env){ await putRules(F.rulesFor(SUP)); await env.cleanup(); }
  if(tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the nightly backup under the published rules (v123)', () => {
  let file, original, sha;
  test('the backup\'s own login — a job login, which only reads — backs up every document the app keeps, whole, with its rev where it has one', async () => {
    original = await stateNow();
    assert.equal(original.size, Object.keys(SEED).length);
    assertRevAsStored(original, 'the seed');
    // set beside the e-mails' login, the backup's own is the one used
    const r = await runBackup({ BACKUP_LOGIN_EMAIL: BACKUPS, BACKUP_LOGIN_PASSWORD: PASSWORD, REPORT_LOGIN_EMAIL: OUTSIDER, REPORT_LOGIN_PASSWORD: PASSWORD });
    assert.equal(r.code, 0, r.log);
    assert.match(r.out, /Signed in with the backup login \(BACKUP_LOGIN_EMAIL\)/);
    assert.match(r.out, new RegExp('Count check: Firestore counts ' + original.size + ' documents'));
    assert.equal(r.files.length, 1);
    file = r.files[0];
    const chk = NB.checkBundle(NB.decryptBackup(fs.readFileSync(file), PASS).plaintext);
    assert.ok(chk.ok, chk.problems.join('; '));
    assert.equal(chk.count, original.size);
    sha = chk.sha256;
    for(const [k, fields] of original){
      assert.ok(NB.hasOwn(chk.bundle.keys, k), 'in the backup: ' + k);
      assert.equal(NB.canonicalJSON(chk.bundle.keys[k].fields), NB.canonicalJSON(fields), 'whole: ' + k);
    }
    assertRevAsStored(new Map(Object.keys(chk.bundle.keys).map(k => [k, chk.bundle.keys[k].fields])), 'the backup');
    for(const k of [ARCH, AUDIT, PHOTO, CHUNK, 'chat', 'memories', 'visitsIndex', 'mailLog'].concat(SNAP_KEYS)) assert.ok(NB.hasOwn(chk.bundle.keys, k), k);
    // the emulator does not read an RFC 3339 time in a query string (Firestore does): the run says so and reads page by page
    assert.ok(chk.bundle.readTime || /Firestore refused a fixed read time/.test(r.out), r.out);
    assertCleanLog(r.log);
  });
  test('with no backup login set, the daily e-mails\' login makes the same backup', async () => {
    const r = await runBackup({ REPORT_LOGIN_EMAIL: REPORTS, REPORT_LOGIN_PASSWORD: PASSWORD });
    assert.equal(r.code, 0, r.log);
    assert.match(r.out, /Signed in with the daily e-mails' login/);
    const chk = NB.checkBundle(NB.decryptBackup(fs.readFileSync(r.files[0]), PASS).plaintext);
    assert.ok(chk.ok, chk.problems.join('; '));
    assert.equal(chk.sha256, sha, 'the same documents, byte for byte');
    assertCleanLog(r.log);
  });
  test('before the owner lists it in JOB_EMAILS() (the rules exactly as committed) the backup\'s login still reads everything', async () => {
    await putRules(F.RAW_RULES);
    try{
      const r = await runBackup({ BACKUP_LOGIN_EMAIL: BACKUPS, BACKUP_LOGIN_PASSWORD: PASSWORD });
      assert.equal(r.code, 0, r.log);
      assert.equal(NB.checkBundle(NB.decryptBackup(fs.readFileSync(r.files[0]), PASS).plaintext).sha256, sha);
    }finally{ await putRules(F.rulesFor(SUP)); }
  });
  test('a login outside the company domain is refused at the first page, no file is kept, and the run says what the login must be', async () => {
    const r = await runBackup({ BACKUP_LOGIN_EMAIL: OUTSIDER, BACKUP_LOGIN_PASSWORD: PASSWORD });
    assert.equal(r.code, 1, r.log);
    assert.match(r.err, /page 1: HTTP 403 PERMISSION_DENIED/);
    assert.match(r.err, /the security rules refused the read: the backup's login must be an e-mail and password login on the company's domain/);
    assert.match(r.err, /No backup file was written/);
    assert.deepEqual(r.files, []);
    assertCleanLog(r.log);
  });
  test('the backup\'s login only reads: a restore with it is refused, and nothing changes (it may write mailLog, the jobs\' own log, and nothing else)', async () => {
    await setRaw('clinics', { value: '[]', updated: 1 });           // a list damaged since the backup
    const before = await stateNow();
    for(const only of ['clinics', 'visits', 'staff', PHOTO, snap(0), guideOnlyList().join(',')]){
      const r = await runRestore(file, ['--force', '--only=' + only], BACKUPS);
      assert.equal(r.code, 1, only + ': ' + r.log);
      assert.match(r.err, /HTTP 403 PERMISSION_DENIED/, only);
      assert.match(r.err, /only the supervisor's login \(the e-mail and backup jobs' logins only read\)/, only);
      assertCleanLog(r.log);
    }
    const now = await stateNow();
    for(const [k, fields] of before) assert.equal(NB.canonicalJSON(now.get(k)), NB.canonicalJSON(fields), 'unchanged: ' + k);
    assert.equal(now.size, before.size);
    const own = await runRestore(file, ['--force', '--only=mailLog'], BACKUPS);
    assert.equal(own.code, 0, own.log);
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
  test('the guide\'s own --only list, as the supervisor: every document the app keeps comes back exactly — rev where it was and only there', async () => {
    await env.clearFirestore();
    const only = guideOnlyList();
    // the list names every document the rules let the supervisor write (the fixtures' inventory of firestore.rules)
    for(const k of TEAM_KEYS.concat(SUPERVISOR_KEYS, JOB_KEYS)) assert.ok(matchesOnly(k, only), 'the guide\'s --only list covers ' + k);
    const r = await runRestore(file, ['--only=' + only.join(',')], SUP);
    assert.equal(r.code, 0, r.log);
    const now = await stateNow();
    const want = Array.from(original.keys()).filter(k => matchesOnly(k, only)).sort();
    assert.deepEqual(Array.from(now.keys()).sort(), want);
    assert.deepEqual(Array.from(original.keys()).filter(k => !matchesOnly(k, only)).sort(), SNAP_KEYS.concat(['currentUser']).sort(), 'left out: the app\'s own daily backups and a key the rules do not list');
    for(const k of want) assert.equal(NB.canonicalJSON(now.get(k)), NB.canonicalJSON(original.get(k)), 'restored exactly: ' + k);
    assertRevAsStored(now, 'restored');
    assertCleanLog(r.log);
  });
  test('into the project as it stands (--force): the documents come back, and the app\'s daily backups and every other document are left as they are', async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => { const db = ctx.firestore(); const b = db.batch(); for(const [k] of original) b.set(db.collection('state').doc(k), WITH_REV.includes(k) ? Object.assign(stored(SEED[k]), { rev: 123 }) : stored(SEED[k])); await b.commit(); });
    await setRaw('clinics', { value: '[]', updated: 1, rev: 123 });   // damaged since the backup
    await setRaw('tasks', { value: '[]', updated: 2, rev: 123 });     // …and saved by v123 since: the backup's copy has no rev
    await setRaw(snap(-5), { value: '"kept as it was"', updated: 3 });
    await setRaw('currentUser', { value: '"kept as it was"', updated: 4 });
    const r = await runRestore(file, ['--force', '--only=' + guideOnlyList().join(',')], SUP);
    assert.equal(r.code, 0, r.log);
    const now = await stateNow();
    for(const k of ['clinics', 'tasks']) assert.equal(NB.canonicalJSON(now.get(k)), NB.canonicalJSON(original.get(k)), 'back as it was in the backup: ' + k);
    assert.deepEqual(now.get('clinics').rev, REV);
    assert.ok(!('rev' in now.get('tasks')), 'tasks is exactly the backup\'s document: the rev a later save gave it is gone, none is invented');
    for(const k of [snap(-5), 'currentUser']) assert.equal(now.get(k).value.stringValue, '"kept as it was"', 'not touched: ' + k);
    assertCleanLog(r.log);
  });
  test('once MIN_APP_REV() is raised in the console, a document an older version saved (no rev) is refused; the others, and mailLog, restore; back at 0 it restores too', async () => {
    await setRaw('tasks', { value: '"damaged"', updated: 5, rev: 123 });
    await putRules(minRev(123));
    try{
      const old = await runRestore(file, ['--force', '--only=tasks'], SUP);
      assert.equal(old.code, 1, old.log);
      assert.match(old.err, /HTTP 403 PERMISSION_DENIED/);
      assert.match(old.err, /once MIN_APP_REV\(\) was raised in the console, only documents carrying that app revision/);
      assert.equal((await stateNow()).get('tasks').value.stringValue, '"damaged"', 'nothing was written');
      const cur = await runRestore(file, ['--force', '--only=' + WITH_REV.join(',')], SUP);
      assert.equal(cur.code, 0, cur.log);
      const job = await runRestore(file, ['--force', '--only=mailLog'], SUP);
      assert.equal(job.code, 0, job.log + ' (the jobs\' log is not held to the revision)');
      assertCleanLog(old.log + cur.log + job.log);
    }finally{ await putRules(F.rulesFor(SUP)); }
    const again = await runRestore(file, ['--force', '--only=tasks'], SUP);
    assert.equal(again.code, 0, again.log);
    const now = await stateNow();
    assert.equal(NB.canonicalJSON(now.get('tasks')), NB.canonicalJSON(original.get('tasks')));
    assert.ok(!('rev' in now.get('tasks')));
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
      assertRevAsStored(now, 'restored');
      assertCleanLog(r.log);
    }finally{ await putRules(F.rulesFor(SUP)); }
  });
});
