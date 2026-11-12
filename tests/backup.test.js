// The independent database backup (scripts/backup, .github/workflows/backup.yml,
// docs/backup.md), tested against a LOCAL fake of Firestore's REST API and
// identitytoolkit (node http on a random port): paging, page tokens tied to
// one read time, an aggregation count, atomic commits with preconditions.
// Every child process runs with a fetch guard that refuses any host but this
// computer, so no test can reach Google even by mistake.
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts', 'backup');
const B = require('../scripts/backup/bundle.js');
const F = require('../scripts/backup/firestore.js');
const APP = F.appFirebaseConfig();
const PROD = APP.projectId;
const PASS = 'correct horse battery staple — صحيح 2026';
const MARKER = 'PLAINTEXT-MARKER-q7Zx'; // in many documents: never in a file or a log
const AR = 'مبيعات مفوترة، المحقق منذ بداية الشهر';
const LOGIN = { email: 'backup@test.invalid', password: 'backup-pw-Qx81' };
const FAST_KDF = { N: 2 ** 14 }; // in-process format checks only; run.js always uses the full cost

// ---------- synthetic data ----------
function prng(seed){
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function noise(rand, n){ const a = new Array(n); for(let i = 0; i < n; i++) a[i] = ABC[(rand() * 64) | 0]; return a.join(''); }

function sourceDocs(){
  const rand = prng(20261111);
  const docs = new Map();
  let t = Date.parse('2026-11-01T05:00:00Z');
  const at = () => new Date(t += 61000).toISOString().replace(/Z$/, '456Z'); // microsecond stamps, as Firestore gives
  const put = (id, value, extra) => {
    const stamp = at();
    docs.set(id, { createTime: stamp, updateTime: stamp, fields: Object.assign({ value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) }, updated: { integerValue: String(t) } }, extra || {}) });
  };
  const names = ['عيادة الشفاء', 'مركز الابتسامة', 'Dental 8 Clinic', 'عيادة د. غيث', 'Crown Dental Center'];
  put('clinics', Array.from({ length: 60 }, (_, i) => ({ id: 'c' + i, name: names[i % 5] + ' ' + i, rep: i % 2 ? 'مريم' : 'رانوفا', note: AR + ' ‏٪' + i + ' ' + MARKER, doctors: [{ id: 'd' + i, name: 'د. سارة ' + i }] })));
  put('staff', [{ name: 'Mariam', role: 'rep', email: 'mariam@test.invalid' }, { name: 'Renova', role: 'rep', email: 'renova@test.invalid' }, { name: 'Dr. Ghaith', role: 'supervisor', email: 'ghaith@test.invalid' }]);
  put('visits', Array.from({ length: 120 }, (_, i) => ({ id: 'v' + i, clinicId: 'c' + (i % 60), date: '2026-11-0' + (1 + i % 9), note: MARKER + ' زيارة ' + i })));
  put('visitsIndex', { months: { '2026-08': { n: 3, rev: 2 } } });
  put('tasks', [{ id: 't1', text: 'Follow up: عيادة الشفاء 1', done: false }]);
  put('dayPlans', { '2026-11-12': { Mariam: [{ id: 'c1', note: 'عينات' }] } });
  put('events', []);
  put('targets', { Mariam: { revenue: 10000, month: '2026-11' } });
  put('erpSales', { periods: [{ id: 'sep26', rev: 3, chunks: 8 }] });
  put('erpMap', { 'مستوصف الري': 'c3', 'My Fatoorah': '@channel' });
  put('mailLog', { last: { to: [{ to: 'ghaith@test.invalid', ok: true }] } });
  put('currentUser', { name: 'Mariam', role: 'rep' });
  for(let m = 1; m <= 9; m++) put('visitsArch:2026-0' + m, Array.from({ length: 80 }, (_, i) => ({ id: 'a' + m + '-' + i, note: 'أرشيف ' + MARKER })));
  for(let i = 0; i < 8; i++) put('erpRows:sep26:3:' + i, JSON.stringify(Array.from({ length: 400 }, (_, k) => ['2026-09-' + (1 + k % 28), 'SINV' + i + k, noise(rand, 1300), AR, k * 1.5])));
  for(let d = 1; d <= 12; d++) put('snap_2026-11-' + String(d).padStart(2, '0'), { clinics: names, visits: noise(rand, 30000) + MARKER, ts: '2026-11-' + d });
  for(let i = 0; i < 15; i++) put('photo:p' + i, 'data:image/jpeg;base64,' + noise(rand, 30000));
  put('unicode', 'NUL:\u0000 TAB:\t NL:\n CR:\r LS:\u2028 PS:\u2029 BOM:\uFEFF RLM:\u200F LRM:\u200E ALM:\u061C quote:" backslash:\\ emoji:👩🏽‍⚕️🦷 astral:𝔘𝔐 ' + AR + ' ٠١٢٣٤٥٦٧٨٩ e\u0301 牙科 ' + MARKER);
  put('2026', 'an id that looks like a number');
  put('10', 'another one');
  put('note:عيادة الري', 'an Arabic id with a space');
  const stamp = at();
  docs.set('allTypes', { createTime: stamp, updateTime: stamp, fields: {
    value: { stringValue: '{}' }, updated: { integerValue: '1762900000000' }, d: { doubleValue: 3.25 }, b: { booleanValue: true }, n: { nullValue: null },
    t: { timestampValue: '2026-11-11T10:00:00.123456Z' }, by: { bytesValue: 'AAECAwQ=' }, g: { geoPointValue: { latitude: 29.37, longitude: 47.98 } },
    ref: { referenceValue: 'projects/' + PROD + '/databases/(default)/documents/state/clinics' },
    arr: { arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'ب' }] } }, emptyArr: { arrayValue: {} },
    map: { mapValue: { fields: { z: { stringValue: 'z' }, 10: { stringValue: 'ten' }, 2: { stringValue: 'two' }, 'ä': { stringValue: 'umlaut' } } } }, emptyMap: { mapValue: {} },
  } });
  const e = at();
  docs.set('emptyDoc', { createTime: e, updateTime: e, fields: {} });
  return docs;
}

// ---------- the fake Google ----------
function sortDeep(v){
  if(Array.isArray(v)) return v.map(sortDeep);
  if(v && typeof v === 'object'){ const o = {}; Object.keys(v).sort().forEach(k => { o[k] = sortDeep(v[k]); }); return o; }
  return v;
}
function startFake(){
  const fake = { projects: {}, requests: [], tokens: new Map(), snapshots: new Map(), failPage: null, rejectReadTime: false, countSkew: 0, afterPage: null };
  const send = (res, status, obj) => {
    const s = JSON.stringify(obj);
    res.writeHead(status, { 'content-type': 'application/json; charset=UTF-8', 'content-length': Buffer.byteLength(s) });
    res.end(s);
  };
  const err = (res, status, st, message) => send(res, status, { error: { code: status, message, status: st } });
  const view = (pid, readTime) => {
    if(!readTime) return fake.projects[pid].docs;
    const k = pid + '|' + readTime;
    if(!fake.snapshots.has(k)) fake.snapshots.set(k, structuredClone(fake.projects[pid].docs));
    return fake.snapshots.get(k);
  };
  function list(pid, u, res){
    const pageSize = Math.min(300, Math.max(1, Number(u.searchParams.get('pageSize')) || 20));
    const readTime = u.searchParams.get('readTime');
    if(readTime && fake.rejectReadTime) return err(res, 400, 'INVALID_ARGUMENT', 'read_time is not allowed for this request');
    let offset = 0;
    const pt = u.searchParams.get('pageToken');
    if(pt){
      const tk = JSON.parse(Buffer.from(pt, 'base64url').toString('utf8'));
      if((tk.r || null) !== (readTime || null)) return err(res, 400, 'INVALID_ARGUMENT', 'the page token belongs to another read');
      offset = tk.o;
    }
    const page = Math.floor(offset / pageSize) + 1;
    const f = fake.failPage;
    if(f && f.project === pid && f.page === page && f.count++ < f.times) return err(res, f.status, f.statusText, 'fake failure');
    const docs = view(pid, readTime);
    const ids = Array.from(docs.keys()).sort(B.compareIds);
    const out = {};
    const slice = ids.slice(offset, offset + pageSize);
    if(slice.length) out.documents = slice.map(id => {
      const d = docs.get(id), o = { name: 'projects/' + pid + '/databases/(default)/documents/state/' + id };
      if(d.fields && Object.keys(d.fields).length) o.fields = sortDeep(d.fields); // a server may reorder a map's keys
      o.createTime = d.createTime; o.updateTime = d.updateTime;
      return o;
    });
    if(offset + pageSize < ids.length) out.nextPageToken = Buffer.from(JSON.stringify({ o: offset + pageSize, r: readTime || null })).toString('base64url');
    send(res, 200, out);
    if(fake.afterPage) fake.afterPage(pid, page);
  }
  function count(pid, b, res){
    const q = b && b.structuredAggregationQuery;
    if(!q || !q.structuredQuery || !q.structuredQuery.from || q.structuredQuery.from[0].collectionId !== 'state' || !q.aggregations || !q.aggregations[0].count) return err(res, 400, 'INVALID_ARGUMENT', 'bad query');
    if(b.readTime && fake.rejectReadTime) return err(res, 400, 'INVALID_ARGUMENT', 'read_time is not allowed for this request');
    const n = view(pid, b.readTime).size + fake.countSkew;
    send(res, 200, [{ result: { aggregateFields: { [q.aggregations[0].alias]: { integerValue: String(n) } } }, readTime: b.readTime || new Date().toISOString() }]);
  }
  function commit(pid, b, res){
    const p = fake.projects[pid], prefix = 'projects/' + pid + '/databases/(default)/documents/state/';
    const writes = (b && b.writes) || [];
    for(const w of writes){
      if(!w.update || typeof w.update.name !== 'string' || !w.update.name.startsWith(prefix)) return err(res, 400, 'INVALID_ARGUMENT', 'bad write');
      if(w.currentDocument && w.currentDocument.exists === false && p.docs.has(w.update.name.slice(prefix.length))) return err(res, 409, 'ALREADY_EXISTS', 'Document already exists');
    }
    const stamp = new Date().toISOString().replace(/Z$/, '000Z');
    for(const w of writes){
      const id = w.update.name.slice(prefix.length), prev = p.docs.get(id);
      p.docs.set(id, { createTime: prev ? prev.createTime : stamp, updateTime: stamp, fields: w.update.fields || {} });
    }
    p.commits = (p.commits || 0) + 1;
    send(res, 200, { writeResults: writes.map(() => ({ updateTime: stamp })), commitTime: stamp });
  }
  function handle(req, body, res){
    const u = new URL(req.url, 'http://fake');
    fake.requests.push({ method: req.method, path: u.pathname, q: Object.fromEntries(u.searchParams), body: req.method === 'POST' && body.length < 20000 ? body : '' });
    if(req.method === 'POST' && u.pathname === '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'){
      const pid = Object.keys(fake.projects).find(id => fake.projects[id].apiKey === u.searchParams.get('key'));
      if(!pid) return err(res, 400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.');
      const b = JSON.parse(body);
      if(!b.email || fake.projects[pid].users[b.email] !== b.password) return send(res, 400, { error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } });
      const tok = 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ p: pid, n: fake.tokens.size })).toString('base64url') + '.c2lnbmVk';
      fake.tokens.set(tok, pid);
      return send(res, 200, { localId: 'uid-' + pid, email: b.email, idToken: tok, registered: true, refreshToken: 'refresh-' + fake.tokens.size + '-Zq9', expiresIn: '3600' });
    }
    const m = /^\/v1\/projects\/([^/]+)\/databases\/\(default\)\/documents(\/state|:runAggregationQuery|:commit)$/.exec(u.pathname);
    if(!m) return err(res, 404, 'NOT_FOUND', 'no such route');
    const pid = decodeURIComponent(m[1]);
    if(!fake.projects[pid]) return err(res, 404, 'NOT_FOUND', 'no such project');
    if(fake.tokens.get(String(req.headers.authorization || '').replace(/^Bearer /, '')) !== pid) return err(res, 401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.');
    if(m[2] === '/state' && req.method === 'GET') return list(pid, u, res);
    if(m[2] === ':runAggregationQuery' && req.method === 'POST') return count(pid, JSON.parse(body), res);
    if(m[2] === ':commit' && req.method === 'POST') return commit(pid, JSON.parse(body), res);
    return err(res, 405, 'INVALID_ARGUMENT', 'method');
  }
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { try{ handle(req, Buffer.concat(chunks).toString('utf8'), res); }catch(e){ err(res, 500, 'INTERNAL', 'fake: ' + e.message); } });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    fake.host = '127.0.0.1:' + server.address().port;
    fake.close = () => { server.closeAllConnections(); server.close(); };
    resolve(fake);
  }));
}

// ---------- running the scripts ----------
let tmp, guardFile, fake;
const GUARD = "const real = globalThis.fetch;\nglobalThis.fetch = function(input, init){\n  const u = new URL(typeof input === 'string' ? input : (input && input.url) || String(input));\n  if(u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return Promise.reject(new Error('test guard: a request to a non-local host was blocked'));\n  return real(input, init);\n};\n";
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'um-backup-'));
  guardFile = path.join(tmp, 'guard.js');
  fs.writeFileSync(guardFile, GUARD);
  fake = await startFake();
});
after(() => { if(fake) fake.close(); if(tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

function resetSource(){
  fake.projects[PROD] = { apiKey: APP.apiKey, users: { [LOGIN.email]: LOGIN.password }, docs: sourceDocs() };
  fake.failPage = null; fake.rejectReadTime = false; fake.countSkew = 0; fake.afterPage = null;
  // a read at time R sees the data as of R: changed data needs fresh snapshots
  // (two runs in the same second share a read time)
  fake.snapshots.clear();
}
// A clean environment: nothing from the developer's own shell (no real secrets).
function env(extra){
  return Object.assign({
    PATH: process.env.PATH, HOME: tmp, NODE_OPTIONS: '--require=' + guardFile,
    FIRESTORE_EMULATOR_HOST: fake.host, FIREBASE_AUTH_EMULATOR_HOST: fake.host,
    BACKUP_RETRY_BASE_MS: '5', BACKUP_PAGE_SIZE: '7',
  }, extra || {});
}
const backupEnv = (dir, extra) => env(Object.assign({ BACKUP_PASSPHRASE: PASS, BACKUP_LOGIN_EMAIL: LOGIN.email, BACKUP_LOGIN_PASSWORD: LOGIN.password, BACKUP_OUT_DIR: dir, BACKUP_TIER: 'daily' }, extra || {}));
function runNode(script, args, environment){
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(SCRIPTS, script)].concat(args || []), { env: environment, cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', errText = '';
    child.stdout.setEncoding('utf8').on('data', d => { out += d; });
    child.stderr.setEncoding('utf8').on('data', d => { errText += d; });
    child.on('close', code => resolve({ code, out, err: errText, all: out + errText }));
  });
}
const freshDir = name => fs.mkdtempSync(path.join(tmp, name + '-'));
const filesIn = dir => fs.readdirSync(dir);
function assertCleanLog(text){
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'an e-mail address in the log');
  assert.ok(!text.includes(PASS.trim()) && !text.includes('correct horse'), 'the passphrase in the log');
  assert.ok(!text.includes(LOGIN.password) && !text.includes('restore-pw'), 'a password in the log');
  assert.ok(!text.includes(MARKER), 'document data in the log');
  assert.doesNotMatch(text, /[\u0600-\u06FF]/, 'Arabic text from the data in the log');
  for(const tok of fake.tokens.keys()) assert.ok(!text.includes(tok), 'a sign-in token in the log');
  assert.ok(!/refresh-\d+-Zq9/.test(text), 'a refresh token in the log');
  assert.ok(!text.includes(APP.apiKey), 'the API key in the log');
}
function listRequests(pid, from){ return fake.requests.slice(from || 0).filter(r => r.method === 'GET' && r.path === '/v1/projects/' + pid + '/databases/(default)/documents/state'); }

// ---------- the file format, in process ----------
describe('backup file format (bundle.js)', () => {
  const docs = () => new Map([
    ['clinics', { createTime: 'c', updateTime: 'u', fields: { value: { stringValue: '[{"name":"' + AR + '"}]' } } }],
    ['10', { fields: {} }], ['9', { fields: { a: { integerValue: '1' } } }],
    ['snap_2026-11-01', { fields: { value: { stringValue: MARKER } } }], ['erpRows:p:1:0', { fields: { value: { stringValue: 'x' } } }],
  ]);
  test('a bundle encrypts and decrypts back to the same bytes; its sha256 and manifest check out', () => {
    const b = B.buildBundle({ docs: docs(), project: 'demo', createdAt: '2026-11-11T23:15:00.000Z', readTime: '2026-11-11T23:14:50Z', tier: 'daily' });
    const file = B.encryptBundle(b.plaintext, PASS, { createdAt: '2026-11-11T23:15:00.000Z', project: 'demo', tier: 'daily' }, FAST_KDF);
    assert.equal(file.subarray(0, 8).toString('ascii'), 'UMBACKUP');
    assert.ok(!file.includes(Buffer.from(MARKER)) && !file.includes(Buffer.from(AR)), 'no plaintext in the file');
    const back = B.decryptBackup(file, PASS);
    assert.ok(back.plaintext.equals(b.plaintext), 'byte for byte');
    assert.equal(back.header.project, 'demo');
    const c = B.checkBundle(back.plaintext);
    assert.equal(c.ok, true, c.problems.join('; '));
    assert.equal(c.count, 5); assert.equal(c.sha256, b.sha256);
    assert.deepEqual(Object.keys(c.manifest.prefixes).sort(), ['10', '9', 'clinics', 'erpRows:', 'snap_']);
    // salt and IV are random: the same data never gives the same file
    assert.ok(!B.encryptBundle(b.plaintext, PASS, {}, FAST_KDF).equals(file));
    // the passphrase is NFC-normalized and trimmed (a pasted trailing newline still opens it)
    assert.ok(B.decryptBackup(file, '  ' + PASS + '\n').plaintext.equals(b.plaintext));
  });
  test('a wrong passphrase, any changed byte, a cut file are all refused', () => {
    const b = B.buildBundle({ docs: docs(), project: 'demo', createdAt: 'x', tier: 'daily' });
    const file = B.encryptBundle(b.plaintext, PASS, { project: 'demo' }, FAST_KDF);
    assert.throws(() => B.decryptBackup(file, PASS + 'x'), e => e.code === 'WRONG_PASSPHRASE');
    const hlen = file.readUInt32BE(8);
    for(const at of [12 + 5, 12 + hlen + 3, Math.floor(file.length / 2), file.length - 1]){
      const t = Buffer.from(file); t[at] ^= 0x01;
      assert.throws(() => B.decryptBackup(t, PASS), e => ['DAMAGED', 'WRONG_PASSPHRASE'].includes(e.code), 'byte ' + at);
    }
    assert.throws(() => B.decryptBackup(file.subarray(0, file.length - 20), PASS), e => e.code === 'DAMAGED');
    assert.throws(() => B.decryptBackup(Buffer.from('{"not":"a backup"}'), PASS), e => e.code === 'NOT_A_BACKUP');
    // the header's key settings are bounded: a file cannot make the reader allocate gigabytes
    const h = JSON.parse(file.subarray(12, 12 + hlen).toString()); h.kdf.N = 2 ** 24;
    const hb = Buffer.from(JSON.stringify(h)), len = Buffer.alloc(4); len.writeUInt32BE(hb.length);
    assert.throws(() => B.decryptBackup(Buffer.concat([file.subarray(0, 8), len, hb, file.subarray(12 + hlen)]), PASS), e => e.code === 'UNSUPPORTED');
  });
  test('an inconsistent bundle is caught: count, checksum, manifest', () => {
    const b = JSON.parse(B.buildBundle({ docs: docs(), project: 'demo', createdAt: 'x' }).plaintext.toString());
    const bad = (mut) => { const x = structuredClone(b); mut(x); return B.checkBundle(Buffer.from(JSON.stringify(x))); };
    assert.match(bad(x => { x.count = 4; }).problems.join(), /says 4 documents but holds 5/);
    assert.match(bad(x => { x.keys.clinics.fields.value.stringValue += ' '; }).problems.join(), /checksum/);
    assert.match(bad(x => { x.manifest.prefixes.clinics.count = 2; }).problems.join(), /manifest/);
    assert.match(bad(x => { delete x.keys['9']; x.count = 4; x.sha256 = B.sha256hex(JSON.stringify(x.keys)); }).problems.join(), /manifest/);
    assert.equal(B.checkBundle(Buffer.from('{"format":')).ok, false);
    assert.doesNotThrow(() => B.checkBundle(Buffer.from(MARKER + '{')), 'a broken bundle is reported, never echoed');
    assert.ok(!B.checkBundle(Buffer.from(MARKER + '{')).problems.join().includes(MARKER));
  });
  test('key prefixes only ever show a name made of letters and digits', () => {
    assert.equal(B.keyPrefix('erpRows:sep:3:0'), 'erpRows:');
    assert.equal(B.keyPrefix('snap_2026-11-10'), 'snap_');
    assert.equal(B.keyPrefix('visitsArch:2026-08'), 'visitsArch:');
    assert.equal(B.keyPrefix('clinics'), 'clinics');
    assert.equal(B.keyPrefix('note:عيادة'), 'note:');
    assert.equal(B.keyPrefix('mariam@test.invalid'), '(other)');
    assert.equal(B.keyPrefix('constructor'), 'constructor');
    const m = B.buildManifest({ constructor: { fields: {} }, __proto__x: { fields: {} } });
    assert.equal(m.prefixes.constructor.count, 1);
  });
  test('restore batches stay under Firestore\'s commit limits', () => {
    const big = { value: { stringValue: 'x'.repeat(900 * 1024) } };
    const writes = Array.from({ length: 30 }, (_, i) => ({ name: 'projects/p/databases/(default)/documents/state/d' + i, fields: big }));
    const batches = F.planBatches(writes);
    assert.ok(batches.length >= 4);
    batches.forEach(bt => assert.ok(bt.reduce((s, w) => s + JSON.stringify(w.fields).length, 0) <= 8 * 1024 * 1024));
    assert.equal(F.planBatches(Array.from({ length: 1000 }, (_, i) => ({ name: 'n' + i, fields: {} }))).length, 3);
    assert.equal(batches.flat().length, 30);
  });
});

describe('configuration and log hygiene (firestore.js)', () => {
  test('the Firebase config is read from the app, and matches the daily e-mails\' copy', () => {
    assert.equal(PROD, 'ultramed-field-ops');
    assert.match(APP.apiKey, /^AIza/);
    const report = fs.readFileSync(path.join(ROOT, 'scripts', 'daily-report', 'report.js'), 'utf8');
    assert.ok(report.includes(APP.apiKey) && report.includes("projectId: '" + PROD + "'"), 'report.js and the app use the same project');
  });
  test('emulator hosts: both or neither, and only on this computer', () => {
    assert.equal(F.endpoints({}).emulator, false);
    assert.equal(F.endpoints({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }).identity, 'http://localhost:9099/identitytoolkit.googleapis.com');
    assert.throws(() => F.endpoints({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /set together/);
    assert.throws(() => F.endpoints({ FIRESTORE_EMULATOR_HOST: 'evil.example:80', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:1' }), /this computer/);
  });
  test('the log scrubber hides addresses, tokens, keys and the secrets it is given', () => {
    const s = F.scrub('to a.b@x.co with eyJhbGciOiJ.eyJzdWIiOiIx.c2lnbmF0dXJl, Bearer abc.def, ?key=AIzaSyAlkAW4-Eq4LKXtVOSx0wdP_UMzxht5_r4&x=1, hunter2-secret', ['hunter2-secret']);
    assert.doesNotMatch(s, /@|eyJ|abc\.def|AIza|hunter2/);
  });
});

// ---------- run.js ----------
describe('run.js: the backup', () => {
  before(resetSource);
  test('not configured: says so, writes nothing, contacts no one, exits 0', async () => {
    const n0 = fake.requests.length;
    for(const extra of [{}, { BACKUP_PASSPHRASE: PASS }, { BACKUP_LOGIN_EMAIL: LOGIN.email, BACKUP_LOGIN_PASSWORD: LOGIN.password }, { REPORT_LOGIN_EMAIL: LOGIN.email, REPORT_LOGIN_PASSWORD: LOGIN.password, BACKUP_PASSPHRASE: '' }]){
      const dir = freshDir('nc'), out = path.join(dir, 'gh-output');
      const r = await runNode('run.js', [], env(Object.assign({ BACKUP_OUT_DIR: path.join(dir, 'out'), GITHUB_OUTPUT: out, GITHUB_ACTIONS: 'true' }, extra)));
      assert.equal(r.code, 0, r.all);
      assert.match(r.out, /::warning title=Backup not configured::/);
      assert.match(r.out, /not configured, so nothing was backed up/);
      assert.equal(fs.existsSync(path.join(dir, 'out')), false, 'no output folder');
      assert.equal(fs.readFileSync(out, 'utf8'), 'configured=false\n');
      assertCleanLog(r.all);
    }
    assert.equal(fake.requests.length, n0, 'nothing was contacted');
  });
  test('a passphrase that is too short is refused before anything is read (and its length is not printed)', async () => {
    const n0 = fake.requests.length, dir = freshDir('short');
    const r = await runNode('run.js', [], backupEnv(dir, { BACKUP_PASSPHRASE: 'short-pass-123' }));
    assert.equal(r.code, 1);
    assert.match(r.err, /shorter than 20 characters/);
    assert.doesNotMatch(r.all, /\b14\b/);
    assert.deepEqual(filesIn(dir), []);
    assert.equal(fake.requests.length, n0);
  });
});

describe('run.js → file → verify.js → restore.js (one backup, used throughout)', () => {
  let outDir, file, bundlePath, runLog, source;
  before(() => {
    resetSource();
    source = structuredClone(fake.projects[PROD].docs);
    outDir = freshDir('out');
  });
  test('every document, through ten pages and a page that fails twice, at one read time, encrypted', async () => {
    fake.failPage = { project: PROD, page: 3, times: 2, status: 503, statusText: 'UNAVAILABLE', count: 0 };
    const n0 = fake.requests.length;
    const ghOut = path.join(tmp, 'gh-output-main'), summary = path.join(tmp, 'gh-summary-main');
    const r = await runNode('run.js', [], backupEnv(outDir, { GITHUB_OUTPUT: ghOut, GITHUB_STEP_SUMMARY: summary, GITHUB_ACTIONS: 'true' }));
    runLog = r.all;
    assert.equal(r.code, 0, r.all);
    assert.equal(fake.failPage.count, 3, 'page 3 was asked three times: two failures, then the answer');
    assert.match(r.out, /page 3: HTTP 503 UNAVAILABLE .*trying again/);
    assert.match(r.out, new RegExp('Listed ' + source.size + ' documents in ' + Math.ceil(source.size / 7) + ' pages'));
    assert.match(r.out, new RegExp('Count check: Firestore counts ' + source.size + ' documents'));
    // every page (and the count) read at the same instant
    const reads = listRequests(PROD, n0);
    assert.ok(reads.length >= 10);
    const rt = reads[0].q.readTime;
    assert.match(rt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.ok(reads.every(q => q.q.readTime === rt), 'one read time for every page');
    assert.ok(fake.requests.slice(n0).some(q => q.path.endsWith(':runAggregationQuery') && JSON.parse(q.body).readTime === rt));
    // one file, encrypted: no data, no plaintext left behind
    const files = filesIn(outDir);
    assert.equal(files.length, 1, files.join());
    assert.match(files[0], /^ultramed-state-daily-\d{8}-\d{6}Z\.umbackup$/);
    file = path.join(outDir, files[0]);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length > 2 * 1024 * 1024, 'several MB: ' + buf.length);
    assert.ok(!buf.includes(Buffer.from(MARKER)) && !buf.includes(Buffer.from(AR)) && !buf.includes(Buffer.from('mariam@test.invalid')));
    // the step outputs the workflow uses, and a summary without data
    const outputs = fs.readFileSync(ghOut, 'utf8');
    assert.match(outputs, /^configured=true$/m);
    assert.ok(outputs.includes('file=' + file + '\n'));
    assert.match(outputs, new RegExp('^count=' + source.size + '$', 'm'));
    assert.match(outputs, /^stamp=\d{8}-\d{6}Z$/m);
    const md = fs.readFileSync(summary, 'utf8');
    assert.match(md, /### Database backup: done \(daily\)/);
    assert.match(md, /\| `erpRows:` \| 8 \|/);
    assertCleanLog(r.all); assertCleanLog(md);
  });
  test('verify.js decrypts it, checks it and writes the bundle: every document byte for byte', async () => {
    bundlePath = path.join(freshDir('plain'), 'bundle.json');
    const r = await runNode('verify.js', [file, '--out', bundlePath], env({ BACKUP_PASSPHRASE: PASS }));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /The backup is sound\./);
    assert.match(r.out, /erpRows:\s+8\s/);
    assert.match(r.out, /visitsArch:\s+9\s/);
    assert.match(r.out, /snap_\s+12\s/);
    assertCleanLog(r.all);
    assert.equal(fs.statSync(bundlePath).mode & 0o077, 0, 'readable by its owner only');
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    // run.js and verify.js print the same data checksum
    const sha = /sha256 ([0-9a-f]{64})/.exec(runLog)[1];
    assert.equal(bundle.sha256, sha);
    assert.ok(r.out.includes(sha));
    assert.equal(B.sha256hex(JSON.stringify(bundle.keys)), sha);
    assert.equal(bundle.project, PROD); assert.equal(bundle.count, source.size); assert.equal(bundle.tier, 'daily');
    assert.equal(Object.keys(bundle.keys).length, source.size);
    for(const [id, d] of source){
      const e = bundle.keys[id];
      assert.ok(e, 'kept: ' + id);
      assert.deepStrictEqual(e.fields, d.fields, 'fields of ' + id);
      assert.equal(e.updateTime, d.updateTime); assert.equal(e.createTime, d.createTime);
      if(d.fields.value) assert.ok(Buffer.from(e.fields.value.stringValue, 'utf8').equals(Buffer.from(d.fields.value.stringValue, 'utf8')), 'value bytes of ' + id);
    }
    assert.ok(bundle.keys.unicode.fields.value.stringValue.includes('\u0000') && bundle.keys.unicode.fields.value.stringValue.includes('👩🏽‍⚕️'));
  });
  test('verify.js refuses a wrong passphrase, a changed or cut file, and a bundle inside the repository', async () => {
    const wrong = await runNode('verify.js', [file], env({ BACKUP_PASSPHRASE: PASS + '!' }));
    assert.equal(wrong.code, 1); assert.match(wrong.err, /wrong passphrase/);
    const buf = fs.readFileSync(file), hlen = buf.readUInt32BE(8);
    const changed = Buffer.from(buf); changed[12 + hlen + 1000] ^= 0x20;
    const headerChanged = Buffer.from(buf); const at = buf.indexOf('"createdAt":"') + 15; headerChanged[at] = headerChanged[at] === 0x31 ? 0x32 : 0x31;
    const cases = [['changed.umbackup', changed, /changed or damaged/], ['header.umbackup', headerChanged, /changed or damaged/], ['cut.umbackup', buf.subarray(0, buf.length - 5000), /changed or damaged/]];
    for(const [name, bytes, re] of cases){
      const p = path.join(tmp, name); fs.writeFileSync(p, bytes);
      const out = path.join(tmp, name + '.json');
      const r = await runNode('verify.js', [p, '--out', out], env({ BACKUP_PASSPHRASE: PASS }));
      assert.equal(r.code, 1, name + ': ' + r.all); assert.match(r.err, re, name);
      assert.equal(fs.existsSync(out), false, name + ': nothing written');
    }
    // a consistent-looking file whose bundle disagrees with itself (made with the library directly)
    const b = JSON.parse(fs.readFileSync(bundlePath, 'utf8')); b.count += 1;
    const lie = path.join(tmp, 'lie.umbackup');
    fs.writeFileSync(lie, B.encryptBundle(Buffer.from(JSON.stringify(b)), PASS, { project: PROD }, FAST_KDF));
    const r = await runNode('verify.js', [lie], env({ BACKUP_PASSPHRASE: PASS }));
    assert.equal(r.code, 1); assert.match(r.err, /says \d+ documents but holds/);
    // the decrypted bundle never lands inside this (public) repository
    const inRepo = path.join(ROOT, 'scripts', 'backup', 'should-not-exist.json');
    const r2 = await runNode('verify.js', [file, '--out', inRepo], env({ BACKUP_PASSPHRASE: PASS }));
    assert.equal(r2.code, 2); assert.match(r2.err, /inside the repository/);
    assert.equal(fs.existsSync(inRepo), false);
    // no passphrase and no terminal: a clear message
    const r3 = await runNode('verify.js', [file], env());
    assert.equal(r3.code, 2); assert.match(r3.err, /no passphrase/);
  });
  test('restore.js refuses production before reading the file or contacting anyone', async () => {
    const n0 = fake.requests.length;
    const creds = { RESTORE_API_KEY: 'k-restore', RESTORE_LOGIN_EMAIL: 'r@test.invalid', RESTORE_LOGIN_PASSWORD: 'restore-pw' };
    for(const id of [PROD, ' Ultramed-Field-Ops ']){
      const r = await runNode('restore.js', [path.join(tmp, 'no-such-file.json')], env(Object.assign({ RESTORE_PROJECT_ID: id }, creds)));
      assert.equal(r.code, 2, r.all); assert.match(r.err, /PRODUCTION/); assert.match(r.err, /--i-understand-this-overwrites-production/);
    }
    // the production app's API key signs in to production, whatever project id is named
    const r = await runNode('restore.js', [bundlePath], env(Object.assign({}, creds, { RESTORE_PROJECT_ID: 'demo-restore', RESTORE_API_KEY: APP.apiKey })));
    assert.equal(r.code, 2); assert.match(r.err, /production app's key/);
    const none = await runNode('restore.js', [bundlePath], env({ RESTORE_PROJECT_ID: 'demo-restore' }));
    assert.equal(none.code, 2); assert.match(none.err, /RESTORE_API_KEY, RESTORE_LOGIN_EMAIL, RESTORE_LOGIN_PASSWORD/);
    assert.equal(fake.requests.length, n0, 'nothing was contacted');
    // with the flag, production is still not empty: --force is needed too, and nothing is written
    fake.projects[PROD].users['r@test.invalid'] = 'restore-pw';
    const before = structuredClone(fake.projects[PROD].docs);
    const flagged = await runNode('restore.js', [bundlePath, '--i-understand-this-overwrites-production'], env(Object.assign({}, creds, { RESTORE_PROJECT_ID: PROD, RESTORE_API_KEY: APP.apiKey })));
    assert.equal(flagged.code, 2, flagged.all); assert.match(flagged.err, /already has documents/);
    assert.deepStrictEqual(fake.projects[PROD].docs, before);
    assert.ok(!fake.requests.some(q => q.path.endsWith(':commit')), 'no write was attempted');
  });
  const target = (id, docs) => { fake.projects[id] = { apiKey: 'key-' + id, users: { 'r@test.invalid': 'restore-pw' }, docs: docs || new Map() }; };
  const restoreEnv = (id, extra) => env(Object.assign({ RESTORE_PROJECT_ID: id, RESTORE_API_KEY: 'key-' + id, RESTORE_LOGIN_EMAIL: 'r@test.invalid', RESTORE_LOGIN_PASSWORD: 'restore-pw' }, extra || {}));
  test('restore.js into an empty separate project: every document identical, byte for byte', async () => {
    target('demo-restore');
    const dry = await runNode('restore.js', [bundlePath, '--dry-run'], restoreEnv('demo-restore'));
    assert.equal(dry.code, 0, dry.all); assert.match(dry.out, /Dry run: nothing was written/);
    assert.equal(fake.projects['demo-restore'].docs.size, 0);
    const r = await runNode('restore.js', [bundlePath], restoreEnv('demo-restore'));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, new RegExp('Read back: all ' + source.size + ' restored documents are identical'));
    assertCleanLog(r.all);
    const docs = fake.projects['demo-restore'].docs;
    assert.equal(docs.size, source.size);
    for(const [id, d] of source){
      assert.ok(docs.has(id), 'restored: ' + id);
      assert.deepStrictEqual(docs.get(id).fields, d.fields, id);
      if(d.fields.value) assert.ok(Buffer.from(docs.get(id).fields.value.stringValue).equals(Buffer.from(d.fields.value.stringValue)), 'value bytes of ' + id);
    }
  });
  test('restore.js refuses a non-empty project unless --force, and then leaves its other documents alone', async () => {
    const stamp = '2026-11-12T00:00:00.000000Z';
    target('demo-busy', new Map([['someoneElse', { createTime: stamp, updateTime: stamp, fields: { value: { stringValue: 'keep me' } } }], ['clinics', { createTime: stamp, updateTime: stamp, fields: { value: { stringValue: '[]' } } }]]));
    const r = await runNode('restore.js', [bundlePath], restoreEnv('demo-busy'));
    assert.equal(r.code, 2, r.all); assert.match(r.err, /already has documents/); assert.match(r.err, /--force/);
    assert.equal(fake.projects['demo-busy'].docs.size, 2);
    assert.equal(fake.projects['demo-busy'].docs.get('clinics').fields.value.stringValue, '[]');
    const f = await runNode('restore.js', [bundlePath, '--force'], restoreEnv('demo-busy'));
    assert.equal(f.code, 0, f.all);
    assert.match(f.out, /1 other document in the target was left as it was/);
    assert.equal(fake.projects['demo-busy'].docs.size, source.size + 1);
    assert.equal(fake.projects['demo-busy'].docs.get('someoneElse').fields.value.stringValue, 'keep me');
    assert.deepStrictEqual(fake.projects['demo-busy'].docs.get('clinics').fields, source.get('clinics').fields);
  });
  test('restore.js reads the encrypted file directly, and --only restores just the named documents', async () => {
    target('demo-only');
    const r = await runNode('restore.js', [file, '--only=clinics,visitsArch:'], restoreEnv('demo-only', { BACKUP_PASSPHRASE: PASS }));
    assert.equal(r.code, 0, r.all);
    assert.deepEqual(Array.from(fake.projects['demo-only'].docs.keys()).sort(), ['clinics'].concat(Array.from({ length: 9 }, (_, i) => 'visitsArch:2026-0' + (i + 1))).sort());
    const wrong = await runNode('restore.js', [file], restoreEnv('demo-only2', { BACKUP_PASSPHRASE: 'not the passphrase at all' }));
    assert.equal(wrong.code, 1); assert.match(wrong.err, /wrong passphrase/);
  });
});

describe('run.js refuses to write a backup it cannot vouch for', () => {
  before(resetSource);
  test('a page that keeps failing: no file, not even a partial one', async () => {
    resetSource();
    fake.failPage = { project: PROD, page: 4, times: Infinity, status: 500, statusText: 'INTERNAL', count: 0 };
    const dir = freshDir('fail'), ghOut = path.join(dir, 'gh');
    const r = await runNode('run.js', [], backupEnv(path.join(dir, 'out'), { GITHUB_OUTPUT: ghOut }));
    assert.equal(r.code, 1, r.all);
    assert.match(r.err, /page 4: HTTP 500 INTERNAL .*gave up after 5 attempts.*No backup file was written/);
    assert.equal(fake.failPage.count, 5);
    assert.ok(!fs.existsSync(path.join(dir, 'out')) || filesIn(path.join(dir, 'out')).length === 0);
    assert.equal(fs.existsSync(ghOut), false, 'no step output: the upload step is skipped');
    assertCleanLog(r.all);
  });
  test('a refused page (403) fails at once; a wrong login fails at sign-in', async () => {
    resetSource();
    fake.failPage = { project: PROD, page: 2, times: Infinity, status: 403, statusText: 'PERMISSION_DENIED', count: 0 };
    const dir = freshDir('denied');
    const r = await runNode('run.js', [], backupEnv(dir));
    assert.equal(r.code, 1); assert.match(r.err, /page 2: HTTP 403 PERMISSION_DENIED/);
    assert.equal(fake.failPage.count, 1, 'not retried');
    assert.deepEqual(filesIn(dir), []);
    fake.failPage = null;
    const bad = await runNode('run.js', [], backupEnv(dir, { BACKUP_LOGIN_PASSWORD: 'wrong-password' }));
    assert.equal(bad.code, 1); assert.match(bad.err, /sign-in: HTTP 400 \(INVALID_LOGIN_CREDENTIALS\)/);
    assert.deepEqual(filesIn(dir), []);
    assertCleanLog(r.all + bad.all);
  });
  test('the listing must agree with Firestore\'s own count, and must not be empty', async () => {
    resetSource();
    fake.countSkew = 1;
    const dir = freshDir('count');
    const r = await runNode('run.js', [], backupEnv(dir));
    assert.equal(r.code, 1); assert.match(r.err, /counts \d+ documents .* refusing to write an incomplete backup/);
    assert.deepEqual(filesIn(dir), []);
    fake.countSkew = 0; fake.projects[PROD].docs = new Map(); fake.snapshots.clear();
    const e = await runNode('run.js', [], backupEnv(dir));
    assert.equal(e.code, 1); assert.match(e.err, /listed no documents/);
    assert.deepEqual(filesIn(dir), []);
  });
  test('the fallback login is the daily e-mails\' one', async () => {
    resetSource();
    const dir = freshDir('report-login');
    const r = await runNode('run.js', [], env({ BACKUP_PASSPHRASE: PASS, REPORT_LOGIN_EMAIL: LOGIN.email, REPORT_LOGIN_PASSWORD: LOGIN.password, BACKUP_OUT_DIR: dir }));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /Signed in with the daily e-mails' login \(REPORT_LOGIN_EMAIL\)/);
    assert.match(filesIn(dir)[0], /^ultramed-state-manual-/);
  });
});

describe('run.js reads every page at one instant', () => {
  test('a save landing during the backup does not tear it', async () => {
    resetSource();
    const original = structuredClone(fake.projects[PROD].docs);
    fake.afterPage = (pid, page) => {
      if(pid !== PROD || page !== 1) return;
      const docs = fake.projects[PROD].docs;
      docs.get('visits').fields.value.stringValue = '["changed after page 1"]';
      docs.set('zzzLate', { createTime: 'x', updateTime: 'x', fields: { value: { stringValue: 'late' } } });
    };
    const dir = freshDir('consistent');
    const r = await runNode('run.js', [], backupEnv(dir));
    assert.equal(r.code, 0, r.all);
    const bundle = B.checkBundle(B.decryptBackup(fs.readFileSync(path.join(dir, filesIn(dir)[0])), PASS).plaintext);
    assert.equal(bundle.ok, true);
    assert.equal(bundle.count, original.size, 'the document added during the backup is not in it');
    assert.equal(bundle.bundle.keys.visits.fields.value.stringValue, original.get('visits').fields.value.stringValue, 'the backup holds the data as of its read time');
    assert.ok(bundle.bundle.readTime);
  });
  test('if Firestore refuses a fixed read time, it says so and reads page by page', async () => {
    resetSource();
    fake.rejectReadTime = true;
    const dir = freshDir('no-readtime');
    const r = await runNode('run.js', [], backupEnv(dir, { GITHUB_ACTIONS: 'true' }));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /::warning title=Backup read time refused::/);
    const bundle = B.checkBundle(B.decryptBackup(fs.readFileSync(path.join(dir, filesIn(dir)[0])), PASS).plaintext);
    assert.equal(bundle.ok, true); assert.equal(bundle.bundle.readTime, null);
    assert.equal(bundle.count, fake.projects[PROD].docs.size);
  });
});

describe('the workflow (.github/workflows/backup.yml)', () => {
  const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'backup.yml'), 'utf8');
  test('daily, weekly and monthly schedules plus a manual run; pinned actions; only the encrypted file uploaded', () => {
    for(const c of ["'15 23 * * *'", "'45 23 * * 4'", "'15 0 1 * *'"]) assert.ok(y.includes('- cron: ' + c), c);
    assert.match(y, /^\s+workflow_dispatch:/m);
    const uses = y.match(/uses: \S+/g);
    assert.equal(uses.length, 3);
    uses.forEach(u => assert.match(u, /^uses: actions\/[a-z-]+@[0-9a-f]{40}$/, u + ' is pinned to a commit'));
    assert.equal((y.match(/actions\/upload-artifact@/g) || []).length, 1);
    assert.match(y, /if: steps\.backup\.outputs\.file != ''/);
    assert.match(y, /path: \$\{\{ steps\.backup\.outputs\.file \}\}\n/);
    assert.match(y, /retention-days: \$\{\{ steps\.tier\.outputs\.days \}\}/);
    assert.match(y, /BACKUP_OUT_DIR: \$\{\{ runner\.temp \}\}/, 'the file is written outside the checkout');
    assert.match(y, /persist-credentials: false/);
    // secrets only ever reach the backup step's environment, never a command line
    const secretLines = y.split('\n').filter(l => l.includes('secrets.'));
    assert.ok(secretLines.length >= 5);
    secretLines.forEach(l => assert.match(l, /^\s+[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/, l));
    assert.match(y, /BACKUP_PASSPHRASE: \$\{\{ secrets\.BACKUP_PASSPHRASE \}\}/);
  });
  test('each schedule is its kind, kept 14 / 60 / 90 days', () => {
    const lines = y.split('\n');
    const start = lines.findIndex(l => /name: Which backup is this/.test(l));
    const runAt = lines.findIndex((l, i) => i > start && /^\s+run: \|$/.test(l));
    const indent = lines[runAt].search(/\S/);
    const body = [];
    for(let i = runAt + 1; i < lines.length && (lines[i].trim() === '' || lines[i].search(/\S/) > indent); i++) body.push(lines[i]);
    const script = path.join(tmp, 'tier.sh');
    fs.writeFileSync(script, body.join('\n') + '\n');
    const tier = (e) => {
      const out = path.join(tmp, 'tier-out-' + Math.random().toString(36).slice(2));
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], { env: Object.assign({ PATH: process.env.PATH, GITHUB_OUTPUT: out }, e), encoding: 'utf8' });
      return r.status === 0 ? fs.readFileSync(out, 'utf8') : 'exit ' + r.status;
    };
    assert.equal(tier({ EVENT: 'schedule', SCHEDULE: '15 23 * * *' }), 'tier=daily\ndays=14\n');
    assert.equal(tier({ EVENT: 'schedule', SCHEDULE: '45 23 * * 4' }), 'tier=weekly\ndays=60\n');
    assert.equal(tier({ EVENT: 'schedule', SCHEDULE: '15 0 1 * *' }), 'tier=monthly\ndays=90\n');
    assert.equal(tier({ EVENT: 'workflow_dispatch', CHOSEN: 'monthly' }), 'tier=monthly\ndays=90\n');
    assert.equal(tier({ EVENT: 'workflow_dispatch', CHOSEN: '' }), 'tier=daily\ndays=14\n');
    assert.equal(tier({ EVENT: 'workflow_dispatch', CHOSEN: 'forever' }), 'exit 1');
  });
});
