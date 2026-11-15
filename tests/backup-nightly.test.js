// The nightly encrypted backup outside Firebase (scripts/backup/nightly,
// .github/workflows/backup.yml, docs/backup.md), tested against a LOCAL fake
// of Firestore's REST API and identitytoolkit (node http on a random port):
// paging, page tokens tied to one read time, an aggregation count, atomic
// commits with preconditions. Every child process runs with a fetch guard
// that refuses any host but this computer, so no test can reach Google even
// by mistake. (The full backup taken on the phone, Export → Full backup, has
// its own tools, scripts/backup/verify.js and restore.js: tests/backup.test.js.)
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts', 'backup', 'nightly');
const B = require('../scripts/backup/nightly/bundle.js');
const F = require('../scripts/backup/nightly/firestore.js');
const APP = F.appFirebaseConfig();
const PROD = APP.projectId;
const crypto = require('node:crypto');
// A passphrase as the passphrase page makes them (bundle.js makePassphrase) —
// the same one at every run of these tests, built here so no file holds one.
const PASS = B.makePassphrase(crypto.createHash('sha256').update('tests/backup-nightly.test.js').digest().subarray(0, 25));
// Forty characters a person could think of. The backup accepted it (the rule
// was "20 characters or more") although anyone signed in to GitHub can download
// the encrypted files and try phrases against one.
const OLD_PHRASE = 'correct horse battery staple — صحيح 2026';
const otherChar = c => (c === 'a' ? 'b' : 'a');
const changedAt = (p, i) => p.slice(0, i) + otherChar(p[i]) + p.slice(i + 1);   // i: not a hyphen
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

// Every key and family of keys v122 keeps in "state": what the app's own full
// backup claims (core.BACKUP_SETS — tests/core.test.js checks it claims every
// key the app stores) and every key and pattern the security rules let anyone
// write (firestore.rules — a new kind of document must be listed there before
// production accepts it, so it lands here too).
function storedKinds(){
  const core = require('../www/js/core.js');
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const keys = new Set(), families = new Set();
  core.BACKUP_SETS.forEach(s => { (s.keys || []).forEach(k => keys.add(k)); (s.prefixes || []).forEach(p => families.add(p)); });
  for(const m of rules.matchAll(/key in \[([^\]]*)\]/g)) (m[1].match(/'[^']+'/g) || []).forEach(q => keys.add(q.slice(1, -1)));
  for(const m of rules.matchAll(/key\.matches\('([A-Za-z]+[:_])/g)) families.add(m[1]);
  return { keys: [...keys].sort(), families: [...families].sort() };
}
// a document of each kind as v122 stores it (the backup never parses one)
const V122_VALUES = {
  chat: [{ id: 'm1', who: 'مريم', text: AR + ' ' + MARKER, ts: 1762900000000, photoId: 'p3', thumb: 'data:image/jpeg;base64,AAAA' }],
  memories: [{ id: 'mem1', who: 'رانوفا', text: 'ذكرى ' + MARKER, ts: 1762900000001 }],
  // the delete log as v123 writes it: the writer's app revision and the revivals, inside the value
  tombs: { visits: { v9: 1762900000000 }, clinics: { c99: 1762900000000 }, doctors: { 'c1|d7': 1762900000000 }, revived: { clinics: { c5: 1762900000001 } }, rev: 123 },
  recycleBin: { clinics: [{ id: 'c98', name: 'عيادة محذوفة ' + MARKER, at: 1762900000000 }], visits: [] },
  rxTypes: { rev: 2, types: [{ id: 'fast', name: 'Ultramed fast moving products', active: true }, { id: 'tepe', name: 'Tepe prescription', active: true }] },
  erpMapLog: [{ at: 1762900000000, who: 'Dr. Ghaith', account: 'مستوصف الري', from: null, to: 'c3' }],
  repairLog: [{ at: 1762900000000, what: 'doctors named again', n: 2 }],
  products: [{ id: 'WP-450ME', name: '3-Pin Charger ' + MARKER, brand: 'Waterpik', price: 4 }],
  categoryGuides: { Waterpik: { pitch: AR } },
  benchmarks: { discount: { Tepe: 10 }, kpi: { visitsPerDay: 6 } },
  erpNotes: { 'SINV1|Brush': { reason: 'عينات ' + MARKER } },
};
const FAMILY_IDS = { 'visitsArch:': '2026-10', 'auditLog:': '2026-11', 'photo:': 'mh2k3x9ab', 'erpRows:': 'oct26:1:0', 'snap_': '2026-11-12' };
// Since v123 a document is { value, updated, rev } — rev = the app revision
// that saved it (window.storage, 01-config.js). One an older version saved, or
// one saved while the phone left the revision out (um_revOff), has no rev, and
// the e-mail job's mailLog never has one. These carry it here; the others do not.
const REV_IDS = ['clinics', 'visits', 'visitsIndex', 'tasks', 'tombs', 'products', 'chat', 'targets', 'photo:p0', 'visitsArch:2026-09', 'erpRows:sep26:3:0', 'snap_2026-11-12'];
const NO_REV_IDS = ['staff', 'dayPlans', 'events', 'erpSales', 'mailLog', 'memories', 'photo:p1', 'visitsArch:2026-08', 'erpRows:sep26:3:1', 'snap_2026-11-01'];

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
  // the change log, one document a month (auditLog:YYYY-MM), and every other
  // kind of document v122 keeps that is not above yet
  put('auditLog:2026-10', [{ at: 1762000000000, who: 'Mariam', what: 'visit saved', detail: AR + ' ' + MARKER }]);
  put('auditLog:2026-11', [{ at: 1762900000000, who: 'Dr. Ghaith', what: 'target saved', detail: MARKER }]);
  const kinds = storedKinds();
  kinds.keys.forEach(k => { if(!docs.has(k)) put(k, V122_VALUES[k] || { note: MARKER, ar: AR }); });
  kinds.families.forEach(p => { if(!Array.from(docs.keys()).some(id => id.startsWith(p))) put(p + (FAMILY_IDS[p] || 'x1'), { note: MARKER, ar: AR }); });
  REV_IDS.forEach(id => { docs.get(id).fields.rev = { integerValue: '123' }; });
  return docs;
}

// ---------- the fake Google ----------
function sortDeep(v){
  if(Array.isArray(v)) return v.map(sortDeep);
  if(v && typeof v === 'object'){ const o = {}; Object.keys(v).sort().forEach(k => { o[k] = sortDeep(v[k]); }); return o; }
  return v;
}
function startFake(){
  const fake = { projects: {}, requests: [], tokens: new Map(), snapshots: new Map(), failPage: null, rejectReadTime: false, countSkew: 0, afterPage: null, denyCommit: null, signInError: null };
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
    if(f && f.project === pid && f.page === page && f.count++ < f.times) return err(res, f.status, f.statusText, f.message || 'fake failure');
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
    // the project's security rules refuse the write (the whole commit fails, as in Firestore)
    if(fake.denyCommit === pid) return err(res, 403, 'PERMISSION_DENIED', 'Missing or insufficient permissions.');
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
      if(fake.signInError) return send(res, fake.signInError.status, { error: { code: fake.signInError.status, message: fake.signInError.message } });
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
  fake.failPage = null; fake.rejectReadTime = false; fake.countSkew = 0; fake.afterPage = null; fake.signInError = null;
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
  assert.ok(!text.includes(PASS) && !text.includes(PASS.replace(/-/g, '')) && !text.toLowerCase().includes(PASS.slice(0, 9)) && !text.includes('correct horse'), 'the passphrase in the log');
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
    // typed back from paper — capitals, spaces for hyphens, none at all, O for zero — it is the same key
    for(const typed of [PASS.toUpperCase(), PASS.replace(/-/g, ' '), PASS.replace(/-/g, ''), PASS.replace(/0/g, 'O').replace(/1/g, 'l'), '\u200f' + PASS.replace(/-/g, ' \u2013 ')]){
      assert.ok(B.decryptBackup(file, typed).plaintext.equals(b.plaintext), 'opens however it is typed');
    }
    // …and a file made with it typed that way opens with it as printed
    assert.ok(B.decryptBackup(B.encryptBundle(b.plaintext, PASS.toUpperCase().replace(/-/g, ''), {}, FAST_KDF), PASS).plaintext.equals(b.plaintext));
    // any other passphrase is taken as it is, capitals and all (files the library made before this rule still open)
    const legacy = B.encryptBundle(b.plaintext, OLD_PHRASE, {}, FAST_KDF);
    assert.ok(B.decryptBackup(legacy, OLD_PHRASE).plaintext.equals(b.plaintext));
    assert.throws(() => B.decryptBackup(legacy, OLD_PHRASE.toUpperCase()), e => e.code === 'WRONG_PASSPHRASE');
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

// The encrypted files are workflow artifacts of a PUBLIC repository: anyone
// signed in to GitHub can download them and try passphrases for as long as
// they like. So the only passphrase the backup takes is one the passphrase
// page made: 200 random bits, with check characters no typed phrase can fit.
describe('the passphrase (bundle.js)', () => {
  test('made: 200 random bits as 40 characters without look-alikes, 4 check characters, eleven groups of four', () => {
    const p = B.makePassphrase();
    assert.match(p, /^([0-9a-hjkmnp-tv-z]{4}-){10}[0-9a-hjkmnp-tv-z]{4}$/);
    assert.doesNotMatch(p, /[ilou]/, 'no letter that reads as a digit or as another letter');
    assert.equal(new Set(B.PASS_ALPHABET).size, 32); assert.match(B.PASS_ALPHABET, /^[0-9a-hjkmnp-tv-z]{32}$/);
    assert.equal(B.canonicalPassphrase(p), p); assert.equal(B.passphraseProblem(p), null);
    // random: never the same twice; every character of the alphabet is used, evenly enough
    const many = Array.from({ length: 4000 }, () => B.makePassphrase());
    assert.equal(new Set(many).size, 4000);
    const count = {};
    many.forEach(q => { for(const ch of q.replace(/-/g, '').slice(0, 40)) count[ch] = (count[ch] || 0) + 1; });
    assert.equal(Object.keys(count).length, 32);
    Object.values(count).forEach(n => assert.ok(n > 4500 && n < 5500, 'a character came ' + n + ' times of about 5000'));
    // the same 25 bytes give the same passphrase; the 40 characters are those bytes, five bits each
    const bytes = Buffer.from(Array.from({ length: 25 }, (_, i) => (i * 37 + 11) & 255));
    assert.equal(B.makePassphrase(bytes), B.makePassphrase(Buffer.from(bytes)));
    let bits = ''; for(const b of bytes) bits += b.toString(2).padStart(8, '0');
    assert.equal(B.makePassphrase(bytes).replace(/-/g, '').slice(0, 40), bits.match(/.{5}/g).map(x => B.PASS_ALPHABET[parseInt(x, 2)]).join(''));
    assert.throws(() => B.makePassphrase(Buffer.alloc(24)), e => e.code === 'BAD_RANDOM');
  });
  test('the check characters: one character changed, dropped, added or two swapped is never taken for a passphrase', () => {
    const flat = PASS.replace(/-/g, '');
    let n = 0;
    for(let i = 0; i < flat.length; i++){
      for(const ch of B.PASS_ALPHABET){
        if(ch === flat[i]) continue;
        const t = flat.slice(0, i) + ch + flat.slice(i + 1);
        assert.equal(B.canonicalPassphrase(t), null, 'character ' + (i + 1) + ' changed'); n++;
        assert.equal(B.passphraseProblem(t), 'miscopied');
      }
      assert.equal(B.passphraseProblem(flat.slice(0, i) + flat.slice(i + 1)), 'miscopied', 'character ' + (i + 1) + ' dropped');
      assert.equal(B.passphraseProblem(flat.slice(0, i) + 'a' + flat.slice(i)), 'miscopied', 'a character added at ' + (i + 1));
      if(i + 1 < flat.length && flat[i] !== flat[i + 1]) assert.equal(B.passphraseProblem(flat.slice(0, i) + flat[i + 1] + flat[i] + flat.slice(i + 2)), 'miscopied', 'characters ' + (i + 1) + ' and ' + (i + 2) + ' swapped');
    }
    assert.equal(n, 44 * 31);
    const groups = PASS.split('-');
    assert.equal(B.passphraseProblem([groups[1], groups[0]].concat(groups.slice(2)).join('-')), 'miscopied', 'two groups swapped');
    assert.equal(B.passphraseProblem(groups.slice(0, 10).join('-')), 'miscopied', 'the last group missing');
  });
  test('typed back from paper it reads the same: capitals, spaces or no hyphens, O for 0, I or L for 1, Arabic digits', () => {
    const forms = [PASS.toUpperCase(), PASS.replace(/-/g, ''), PASS.replace(/-/g, ' '), '  ' + PASS + '\r\n', PASS.replace(/-/g, ' \u2014 '), PASS.replace(/-/g, '\u2011'),
      PASS.replace(/0/g, 'o').replace(/1/g, 'I'), PASS.replace(/1/g, 'l'), PASS.replace(/[0-9]/g, d => String.fromCharCode(0x660 + Number(d))), PASS.replace(/[0-9]/g, d => String.fromCharCode(0x6f0 + Number(d))),
      '\u200f' + PASS + '\u200e', PASS.replace(/[0-9a-z]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0))];   // full-width, as some keyboards type
    forms.forEach(f => { assert.equal(B.canonicalPassphrase(f), PASS, JSON.stringify(f.slice(0, 12))); assert.equal(B.passphraseProblem(f), null); });
    // a letter the alphabet does not have is not guessed at
    assert.equal(B.canonicalPassphrase(PASS.replace(/[a-h]/, 'u')), null);
  });
  // The repository is public: an example someone copies must never open, or
  // make, a backup.
  test('no passphrase printed anywhere in the repository is one the backup takes', () => {
    const files = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(f => f && !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz|jar|xlsx)$/i.test(f) && !f.startsWith('node_modules/'));
    assert.ok(files.includes('docs/backup.md') && files.includes('www/backup-passphrase.html'), 'the scan sees the guide and the page');
    let seen = 0;
    for(const f of files){
      let text; try{ text = fs.readFileSync(path.join(ROOT, f), 'utf8'); }catch(e){ continue; }
      for(const m of text.matchAll(/[0-9A-Za-z\u0660-\u0669]{4}(?:[-\s][0-9A-Za-z\u0660-\u0669]{4}){10}/g)){
        seen++;
        assert.equal(B.canonicalPassphrase(m[0]), null, f + ' prints a working passphrase');
      }
    }
    assert.ok(seen >= 2, 'the guide\'s example and the format in bundle.js were checked (' + seen + ')');
  });
  test('nothing a person could think of, and no other generator\'s password, is one', () => {
    const others = ['', '   ', 'short-pass-123', OLD_PHRASE, 'our dental backups are kept safe in kuwait since 2026 and nobody will ever guess it',
      'Ultramed-Kuwait-Backup-Passphrase-2026', 'xK9#mQ2$vL7@pR4!nT6^wZ1&bY8*cF3%hJ5(dG0)', crypto.createHash('sha256').update('x').digest('hex'),
      'fuzvo3-gyvqok-qivbex', '0123-4567-89ab-cdef-ghjk-mnpq-rstv-wxyz-0123-4567-89ab', 'a'.repeat(44), '0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000',
      crypto.randomBytes(32).toString('base64'), PASS + PASS, null, undefined];
    for(const o of others){
      assert.equal(B.canonicalPassphrase(o), null, JSON.stringify(String(o).slice(0, 20)));
      assert.ok(['not-made', 'miscopied'].includes(B.passphraseProblem(o)));
    }
    assert.equal(B.passphraseProblem(OLD_PHRASE), 'not-made'); assert.equal(B.passphraseProblem('short-pass-123'), 'not-made');
  });
});

// The ONE way to make the passphrase: a page published with the app, opened on
// a phone or a computer, nothing installed. It runs in the browser only.
describe('the passphrase page (www/backup-passphrase.html)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'www', 'backup-passphrase.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  test('it holds one script and a policy that lets that script alone run and nothing out; it stores nothing', () => {
    assert.equal((html.match(/<script\b/g) || []).length, 1, 'one script block');
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)[1];
    assert.match(csp, /^default-src 'none';/);
    const hash = crypto.createHash('sha256').update(script, 'utf8').digest('base64');
    assert.ok(csp.includes("script-src 'sha256-" + hash + "';"), "the policy allows exactly the script the page holds: script-src 'sha256-" + hash + "'");
    assert.doesNotMatch(csp, /script-src[^;]*(unsafe|https?:|\*)|connect-src|\*/);
    for(const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /localStorage|sessionStorage|indexedDB|document\.cookie/, /serviceWorker/,
      /<img\b/i, /<iframe\b/i, /<form\b/i, /<link[^>]+stylesheet/i, /https?:\/\//, /\bon[a-z]+\s*=\s*["']/i]) assert.doesNotMatch(html, re, 'the page holds ' + re);
    assert.match(script, /getRandomValues/);
    assert.doesNotMatch(html, /Math\.random/, 'only the browser\'s secure random numbers');
    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.match(html, /BACKUP_PASSPHRASE/);
  });
  test('its own code makes passphrases the backup accepts, and reads a typed one exactly as the backup does', async () => {
    const vm = require('node:vm');
    const ctx = vm.createContext({ crypto: crypto.webcrypto, TextEncoder });   // no document: only the code, as a browser would run it
    vm.runInContext(script, ctx);
    const page = ctx.UMBackupPassphrase;
    assert.equal(page.canMake(), true);
    const made = new Set();
    for(let i = 0; i < 400; i++){
      const p = await page.make();
      assert.equal(B.canonicalPassphrase(p), p, 'the page made something the backup does not take as printed');
      assert.equal(B.passphraseProblem(p), null);
      made.add(p);
    }
    assert.equal(made.size, 400);
    const flat = PASS.replace(/-/g, '');
    const samples = [PASS, PASS.toUpperCase(), flat, PASS.replace(/-/g, ' '), ' ' + PASS + '\n', PASS.replace(/0/g, 'O').replace(/1/g, 'L'), PASS.replace(/[0-9]/g, d => String.fromCharCode(0x660 + Number(d))),
      PASS.replace(/-/g, ' \u2013 '), '\u200f' + PASS, changedAt(PASS, 0), changedAt(PASS, 20), changedAt(PASS, 53), PASS.slice(0, -1), PASS + 'a', flat.slice(1) + flat[0],
      OLD_PHRASE, '', 'a'.repeat(44), 'short-pass-123', PASS.replace(/[a-h]/, 'u'), B.makePassphrase(), B.makePassphrase().toUpperCase().replace(/-/g, '')];
    for(const t of samples) assert.equal(await page.canonical(t), B.canonicalPassphrase(t), 'the page and the backup read ' + JSON.stringify(t.slice(0, 14)) + ' differently');
    // a browser that cannot make secure random numbers makes nothing (the page then says so)
    const old = vm.createContext({ crypto: {}, TextEncoder });
    vm.runInContext(script, old);
    assert.equal(old.UMBackupPassphrase.canMake(), false);
  });
  test('the build publishes it beside the app, unchanged', () => {
    const out = freshDir('site');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js'), path.join(ROOT, 'www'), out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.readFileSync(path.join(out, 'backup-passphrase.html')).equals(Buffer.from(html, 'utf8')));
    // the service worker does not precache it: it is not part of the app (and needs no release of its own to change)
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'www', 'sw.js'), 'utf8'), /backup-passphrase/);
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
    // the API key is the app's own, read at run time: this file never holds one (tests/confidential.test.js)
    const s = F.scrub('to a.b@x.co with eyJhbGciOiJ.eyJzdWIiOiIx.c2lnbmF0dXJl, Bearer abc.def, ?key=' + APP.apiKey + '&x=1, bare ' + APP.apiKey + ', hunter2-secret', ['hunter2-secret']);
    assert.doesNotMatch(s, /@|eyJ|abc\.def|AIza|hunter2/);
  });
  test('the passphrase prompt reads a hidden line from a terminal; the variable wins; no terminal gives null', async () => {
    const { EventEmitter } = require('node:events');
    const { getPassphrase } = require('../scripts/backup/nightly/verify.js');
    const tty = Object.assign(new EventEmitter(), { isTTY: true, isRaw: false, setRawMode(v){ this.isRaw = v; }, resume(){}, pause(){}, setEncoding(){} });
    let shown = '';
    const p = getPassphrase({}, { stdin: tty, err: { write: s => { shown += s; } } });
    tty.emit('data', 'secret-passx');
    tty.emit('data', '\u007fphrase\r');
    assert.equal(await p, 'secret-passphrase');
    assert.equal(tty.isRaw, false, 'the terminal is put back as it was');
    assert.ok(!shown.includes('secret'), 'nothing typed is shown');
    assert.equal(await getPassphrase({ BACKUP_PASSPHRASE: 'from-env' }, { stdin: tty }), 'from-env');
    assert.equal(await getPassphrase({}, { stdin: { isTTY: false } }), null);
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
      // with no passphrase yet, the run says where one is made
      assert.equal(/The passphrase is made with the passphrase page: /.test(r.out), !extra.BACKUP_PASSPHRASE, JSON.stringify(Object.keys(extra)));
      assert.equal(fs.existsSync(path.join(dir, 'out')), false, 'no output folder');
      assert.equal(fs.readFileSync(out, 'utf8'), 'configured=false\n');
      assertCleanLog(r.all);
    }
    assert.equal(fake.requests.length, n0, 'nothing was contacted');
  });
  test('a passphrase the passphrase page did not make is refused before anything is read — with what to do, never the value or its length', async () => {
    const twoSwapped = (() => { const g = PASS.split('-'); return [g[1], g[0]].concat(g.slice(2)).join('-'); })();
    const cases = [
      ['a short password', 'short-pass-123', 'not-made'],
      ['a phrase a person thought of, long enough for the old rule', OLD_PHRASE, 'not-made'],
      ['a long sentence', 'our dental backups are kept safe in kuwait since 2026 and nobody will ever guess it', 'not-made'],
      ['a company-style password', 'Ultramed-Kuwait-Backup-Passphrase-2026', 'not-made'],
      ['a password manager\'s forty random characters', 'xK9#mQ2$vL7@pR4!nT6^wZ1&bY8*cF3%hJ5(dG0)', 'not-made'],
      ['64 random hexadecimal characters', crypto.createHash('sha256').update('x').digest('hex'), 'not-made'],
      ['one from the page with its last character missing', PASS.slice(0, -1), 'miscopied'],
      ['one from the page with a character changed', changedAt(PASS, 6), 'miscopied'],
      ['one from the page with two groups swapped', twoSwapped, 'miscopied'],
    ];
    const n0 = fake.requests.length;
    for(const [what, value, kind] of cases){
      const dir = freshDir('refused'), ghOut = path.join(dir, 'gh-output'), summary = path.join(dir, 'gh-summary');
      const r = await runNode('run.js', [], backupEnv(path.join(dir, 'out'), { BACKUP_PASSPHRASE: value, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'Some-Owner/some-app', GITHUB_OUTPUT: ghOut, GITHUB_STEP_SUMMARY: summary }));
      assert.equal(r.code, 1, what + ': ' + r.all);
      assert.match(r.err, /^::error title=Backup failed::BACKUP_PASSPHRASE /, what);
      if(kind === 'not-made'){
        assert.match(r.err, /is not a passphrase made by the passphrase page, so nothing was backed up/, what);
        assert.match(r.err, /anyone signed in to GitHub can download the encrypted backups/, what);
        assert.match(r.err, /Make one: open https:\/\/some-owner\.github\.io\/some-app\/backup-passphrase\.html on a phone or a computer/, what);
        assert.match(r.err, /keep the passphrase in a password manager and on paper/, what);
      }else{
        assert.match(r.err, /looks like a passphrase made by the passphrase page, but it is incomplete or one of its characters was changed/, what);
        assert.match(r.err, /Copy it again, whole, from where you keep it/, what);
        assert.match(r.err, /make one there: https:\/\/some-owner\.github\.io\/some-app\/backup-passphrase\.html/, what);
      }
      assert.match(r.err, /the repository secret BACKUP_PASSPHRASE \(Settings → Secrets and variables → Actions\)/, what);
      assert.match(r.err, /docs\/backup\.md, "The passphrase"/, what);
      assert.match(r.err, /No backup file was written\./, what);
      // never the value, any piece of it, or its length
      assert.ok(!r.all.includes(value) && !r.all.includes(value.slice(0, 12)) && !r.all.includes(value.slice(-12)), what + ': the value is in the log');
      assert.doesNotMatch(r.all, new RegExp('\\b' + Array.from(value).length + '\\b'), what + ': its length is in the log');
      assert.doesNotMatch(r.all, /\d/, what + ': no figure at all');
      assert.equal(fs.existsSync(path.join(dir, 'out')), false, what + ': no output folder');
      assert.equal(fs.existsSync(ghOut), false, what + ': no step output, so the upload step is skipped');
      assert.equal(fs.existsSync(summary), false, what);
      assertCleanLog(r.all);
    }
    assert.equal(fake.requests.length, n0, 'nothing was contacted');
    // outside GitHub (no repository to name) the page is still named
    const local = await runNode('run.js', [], backupEnv(freshDir('refused-local'), { BACKUP_PASSPHRASE: OLD_PHRASE }));
    assert.equal(local.code, 1); assert.match(local.err, /^ERROR: BACKUP_PASSPHRASE is not a passphrase made by the passphrase page/);
    assert.match(local.err, /the page backup-passphrase\.html of the app's site/);
  });
  test('a passphrase from the page is taken however it was pasted — capitals, spaces — and the file opens with it as printed', async () => {
    resetSource();
    const dir = freshDir('typed'), typed = PASS.toUpperCase().replace(/-/g, ' ') + '\n';
    const r = await runNode('run.js', [], backupEnv(dir, { BACKUP_PASSPHRASE: typed }));
    assert.equal(r.code, 0, r.all);
    const chk = B.checkBundle(B.decryptBackup(fs.readFileSync(path.join(dir, filesIn(dir)[0])), PASS).plaintext);
    assert.equal(chk.ok, true);
    assertCleanLog(r.all);
    assert.ok(!r.all.includes(typed.trim()) && !r.all.includes(PASS.toUpperCase()), 'no form of the passphrase in the log');
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
    assert.match(r.out, /page 3: HTTP 503 UNAVAILABLE: trying again/);
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
  test('every kind of document v122 keeps is in it, whole — the past months, the photos, the sales lines, the change log, chat and memories', () => {
    const kinds = storedKinds();
    // the derivation sees the kinds that matter (a typo in it must not make this test pass on nothing)
    for(const k of ['visits', 'visitsIndex', 'clinics', 'tasks', 'dayPlans', 'events', 'tombs', 'recycleBin', 'erpSales', 'erpMap', 'erpMapLog', 'erpNotes',
      'targets', 'staff', 'products', 'rxTypes', 'benchmarks', 'categoryGuides', 'repairLog', 'mailLog', 'chat', 'memories']) assert.ok(kinds.keys.includes(k), 'v122 keeps ' + k);
    for(const p of ['visitsArch:', 'erpRows:', 'photo:', 'snap_', 'auditLog:']) assert.ok(kinds.families.includes(p), 'v122 keeps ' + p + '…');
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    const ids = Object.keys(bundle.keys);
    for(const k of kinds.keys){
      assert.ok(ids.includes(k), 'in the backup: ' + k);
      assert.deepStrictEqual(bundle.keys[k].fields, source.get(k).fields, 'whole: ' + k);
    }
    for(const p of kinds.families){
      const mine = ids.filter(id => id.startsWith(p)), want = Array.from(source.keys()).filter(id => id.startsWith(p));
      assert.ok(want.length > 0, 'the test data holds a ' + p + ' document');
      assert.deepEqual(mine.sort(), want.sort(), 'every ' + p + ' document');
      mine.forEach(id => assert.deepStrictEqual(bundle.keys[id].fields, source.get(id).fields, 'whole: ' + id));
    }
    // the value string is the app's own text, never parsed: a photo stays its data URL
    assert.match(bundle.keys['photo:p0'].fields.value.stringValue, /^data:image\/jpeg;base64,/);
    assert.equal(bundle.keys['auditLog:2026-11'].fields.updated.integerValue, source.get('auditLog:2026-11').fields.updated.integerValue);
    // the run's table names each family by its prefix and count, never a value
    for(const [p, n] of [['auditLog:', 2], ['photo:', 15], ['visitsArch:', 9], ['erpRows:', 8], ['snap_', 12], ['chat', 1], ['memories', 1], ['visitsIndex', 1]]){
      assert.match(runLog, new RegExp('\\n  ' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' +' + n + ' '), p + ' in the run log');
    }
  });
  // v123: { value, updated, rev }. The backup takes the document, not a list of
  // fields: whatever a document carries is in the file, and nothing is added
  // to one that does not carry it (a restore must not date a document as v123's).
  const sameDoc = (got, want, what) => {
    assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), what + ': the same fields, none added, none dropped');
    for(const f of Object.keys(want)) assert.equal(JSON.stringify(got[f]), JSON.stringify(want[f]), what + ': field ' + f);
    assert.ok(Buffer.from(got.value.stringValue, 'utf8').equals(Buffer.from(want.value.stringValue, 'utf8')), what + ': the value, byte for byte');
  };
  test('a document with the app revision (rev, v123) and one without are in the backup exactly as stored', () => {
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    for(const id of REV_IDS){
      assert.deepEqual(source.get(id).fields.rev, { integerValue: '123' }, 'the test data: ' + id + ' carries rev');
      assert.deepEqual(bundle.keys[id].fields.rev, { integerValue: '123' }, id + ' keeps its rev');
      sameDoc(bundle.keys[id].fields, source.get(id).fields, id);
    }
    for(const id of NO_REV_IDS){
      assert.ok(!('rev' in source.get(id).fields), 'the test data: ' + id + ' has no rev');
      assert.ok(!('rev' in bundle.keys[id].fields), id + ' is not given a rev');
      sameDoc(bundle.keys[id].fields, source.get(id).fields, id);
    }
    // the delete log's own revision and its revivals are inside its value: text the backup never parses
    const tombs = JSON.parse(bundle.keys.tombs.fields.value.stringValue);
    assert.equal(tombs.rev, 123); assert.deepEqual(tombs.revived, { clinics: { c5: 1762900000001 } });
    assert.equal(bundle.keys.tombs.fields.value.stringValue, source.get('tombs').fields.value.stringValue);
  });
  test('verify.js refuses a wrong passphrase, a changed or cut file, and a bundle inside the repository', async () => {
    const wrong = await runNode('verify.js', [file], env({ BACKUP_PASSPHRASE: PASS + '!' }));
    assert.equal(wrong.code, 1); assert.match(wrong.err, /wrong passphrase/);
    // another passphrase from the page: wrong, and nothing more to say
    const another = await runNode('verify.js', [file], env({ BACKUP_PASSPHRASE: B.makePassphrase() }));
    assert.equal(another.code, 1); assert.match(another.err, /wrong passphrase: this file was not made with this BACKUP_PASSPHRASE \(or its header was changed\)\n$/);
    // typed from paper with a mistake: said as such, so the reader looks at the paper again — never repeated
    const typo = changedAt(PASS, 11), mistyped = await runNode('verify.js', [file], env({ BACKUP_PASSPHRASE: typo }));
    assert.equal(mistyped.code, 1); assert.match(mistyped.err, /wrong passphrase/);
    assert.match(mistyped.err, /not a whole one: a character is missing or wrong \(its check characters do not fit\)\. Compare it with the copy you keep, group by group\./);
    assert.ok(!mistyped.all.includes(typo) && !mistyped.all.includes(typo.slice(0, 9)));
    const phrase = await runNode('verify.js', [file], env({ BACKUP_PASSPHRASE: OLD_PHRASE }));
    assert.equal(phrase.code, 1); assert.match(phrase.err, /not one the passphrase page makes \(eleven groups of four letters and digits\)/);
    assert.ok(!phrase.all.includes('correct horse'));
    // typed from paper in capitals, with spaces: it opens
    const typedOk = await runNode('verify.js', [file], env({ BACKUP_PASSPHRASE: PASS.toUpperCase().replace(/-/g, ' ') }));
    assert.equal(typedOk.code, 0, typedOk.all); assert.match(typedOk.out, /The backup is sound\./);
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
    // the .zip GitHub hands over, given as it is
    const zip = path.join(tmp, 'artifact.zip');
    fs.writeFileSync(zip, Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.alloc(200)]));
    const z = await runNode('verify.js', [zip], env({ BACKUP_PASSPHRASE: PASS }));
    assert.equal(z.code, 1); assert.match(z.err, /unzip the downloaded artifact first/);
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
    // backup → verify → restore: rev comes back where it was, and only there
    for(const id of REV_IDS){ assert.deepEqual(docs.get(id).fields.rev, { integerValue: '123' }, id + ' restored with its rev'); sameDoc(docs.get(id).fields, source.get(id).fields, 'restored ' + id); }
    for(const id of NO_REV_IDS){ assert.ok(!('rev' in docs.get(id).fields), id + ' restored without a rev'); sameDoc(docs.get(id).fields, source.get(id).fields, 'restored ' + id); }
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
    assert.equal(wrong.code, 1); assert.match(wrong.err, /wrong passphrase/); assert.match(wrong.err, /not one the passphrase page makes/);
    const typo = await runNode('restore.js', [file], restoreEnv('demo-only2', { BACKUP_PASSPHRASE: PASS.slice(0, -2) }));
    assert.equal(typo.code, 1); assert.match(typo.err, /a character is missing or wrong/);
    const z = await runNode('restore.js', [path.join(tmp, 'artifact.zip')], restoreEnv('demo-only2'));
    assert.equal(z.code, 2); assert.match(z.err, /unzip the downloaded artifact first/);
  });
  test('given a full backup taken on the phone, verify.js and restore.js name the tools that read it, and write nothing', async () => {
    const core = require('../www/js/core.js');
    const phone = path.join(freshDir('phone'), 'ultramed-full-backup-2026-11-12-0900.json');
    fs.writeFileSync(phone, JSON.stringify(core.fullBackupFile({ clinics: { value: JSON.stringify([{ id: 'c1', name: AR, note: MARKER }]), updated: 1762900000000 } },
      { app: 'v122', project: PROD, takenAt: '2026-11-12T06:00:00.000Z', takenBy: 'Dr. Ghaith' })));
    const v = await runNode('verify.js', [phone], env({ BACKUP_PASSPHRASE: PASS }));
    assert.equal(v.code, 2, v.all);
    assert.match(v.err, /a full backup taken on the phone/); assert.match(v.err, /node scripts\/backup\/verify\.js/);
    assert.doesNotMatch(v.all, /NOT sound/, 'the file is not called damaged: it is another kind of backup');
    target('demo-phone');
    const n0 = fake.requests.length;
    const r = await runNode('restore.js', [phone], restoreEnv('demo-phone'));
    assert.equal(r.code, 2, r.all);
    assert.match(r.err, /a full backup taken on the phone/); assert.match(r.err, /node scripts\/backup\/restore\.js .*--into <name>\.test-cloud\.json/);
    assert.equal(fake.projects['demo-phone'].docs.size, 0);
    assert.ok(!fake.requests.slice(n0).some(q => q.path.includes('demo-phone')), 'the target was not contacted');
    assertCleanLog(v.all + r.all);
  });
  test('a write the target\'s security rules refuse is named as such, with what to do', async () => {
    target('demo-rules');
    const origCommit = fake.denyCommit;
    fake.denyCommit = 'demo-rules';
    try{
      const r = await runNode('restore.js', [bundlePath], restoreEnv('demo-rules'));
      assert.equal(r.code, 1, r.all);
      assert.match(r.err, /HTTP 403 PERMISSION_DENIED/);
      assert.match(r.err, /security rules refused/);
      assert.match(r.err, /docs\/backup\.md/);
      // what the published rules (v123) ask of a restore into production
      assert.match(r.err, /only the supervisor's login \(the e-mail and backup jobs' logins only read\)/);
      assert.match(r.err, /--only/);
      assert.match(r.err, /MIN_APP_REV\(\)/);
      assert.equal(fake.projects['demo-rules'].docs.size, 0);
      assertCleanLog(r.all);
    }finally{ fake.denyCommit = origCommit; }
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
    // …and says what the security rules ask of the backup's login (firestore.rules: a password login on the company's domain)
    assert.match(r.err, /the security rules refused the read: the backup's login must be an e-mail and password login on the company's domain \(docs\/backup\.md, "One-time setup"\)/);
    fake.failPage = null;
    const bad = await runNode('run.js', [], backupEnv(dir, { BACKUP_LOGIN_PASSWORD: 'wrong-password' }));
    assert.equal(bad.code, 1); assert.match(bad.err, /sign-in: HTTP 400 \(INVALID_LOGIN_CREDENTIALS\)/);
    assert.match(bad.err, /the sign-in was refused: check that the repository secrets BACKUP_LOGIN_EMAIL and BACKUP_LOGIN_PASSWORD hold the e-mail and password of a working login of the app \(docs\/backup\.md, "One-time setup"\)/);
    assert.deepEqual(filesIn(dir), []);
    // the e-mails' login, when that is the one used, is named by its own secrets
    const bad2 = await runNode('run.js', [], env({ BACKUP_PASSPHRASE: PASS, REPORT_LOGIN_EMAIL: LOGIN.email, REPORT_LOGIN_PASSWORD: 'wrong-password', BACKUP_OUT_DIR: dir }));
    assert.equal(bad2.code, 1); assert.match(bad2.err, /check that the repository secrets REPORT_LOGIN_EMAIL and REPORT_LOGIN_PASSWORD hold/);
    assertCleanLog(r.all + bad.all + bad2.all);
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

// The repository and its Actions logs are public. Whatever goes wrong, the
// log says what failed and what to do — never a value, an address, the
// passphrase, a password or a token. A server's own words are not printed at
// all (only its codes): an error message may quote what it was sent.
describe('the public log, on every path that can fail', () => {
  const QUOTED = 'Invalid value ' + MARKER + ' ' + AR + ' for backup@test.invalid, Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.c2lnbmVk';
  test('a server error that quotes data — on the sign-in, a page or the count — prints only its codes', async () => {
    resetSource();
    fake.signInError = { status: 400, message: 'USER_DISABLED : ' + QUOTED };
    const signIn = await runNode('run.js', [], backupEnv(freshDir('quoted-signin')));
    assert.equal(signIn.code, 1, signIn.all);
    assert.match(signIn.err, /sign-in: HTTP 400 \(USER_DISABLED\)/);
    assert.match(signIn.err, /the sign-in was refused/);
    fake.signInError = null;
    fake.failPage = { project: PROD, page: 2, times: Infinity, status: 400, statusText: 'INVALID_ARGUMENT', message: QUOTED, count: 0 };
    const page = await runNode('run.js', [], backupEnv(freshDir('quoted-page')));
    assert.equal(page.code, 1, page.all);
    assert.match(page.err, /page 2: HTTP 400 INVALID_ARGUMENT\. No backup file was written\./);
    fake.failPage = { project: PROD, page: 1, times: Infinity, status: 503, statusText: 'UNAVAILABLE', message: QUOTED, count: 0 };
    const retried = await runNode('run.js', [], backupEnv(freshDir('quoted-retry')));
    assert.equal(retried.code, 1, retried.all);
    assert.match(retried.out, /page 1: HTTP 503 UNAVAILABLE: trying again/);
    for(const r of [signIn, page, retried]){
      assert.ok(!r.all.includes('Invalid value'), 'the server\'s own words are not printed');
      assertCleanLog(r.all);
    }
  });
  test('a network failure — no answer from the sign-in or from Firestore — says so, and nothing else', async () => {
    resetSource();
    const closed = await new Promise(resolve => { const srv = http.createServer(); srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; srv.close(() => resolve('127.0.0.1:' + port)); }); });
    const fsDown = await runNode('run.js', [], backupEnv(freshDir('net-fs'), { FIRESTORE_EMULATOR_HOST: closed }));
    assert.equal(fsDown.code, 1, fsDown.all);
    assert.match(fsDown.err, /page 1: network error ECONNREFUSED \(gave up after 5 attempts\)\. No backup file was written\./);
    const allDown = await runNode('run.js', [], backupEnv(freshDir('net-all'), { FIRESTORE_EMULATOR_HOST: closed, FIREBASE_AUTH_EMULATOR_HOST: closed }));
    assert.equal(allDown.code, 1, allDown.all);
    assert.match(allDown.err, /sign-in: network error ECONNREFUSED \(gave up after 5 attempts\)\. No backup file was written\./);
    assert.doesNotMatch(allDown.err, /the sign-in was refused/, 'no answer is not a refusal');
    assertCleanLog(fsDown.all + allDown.all);
  });
  test('every other way a run ends, in the GitHub log, its summary and its outputs: nothing secret', async () => {
    resetSource();
    const runs = [];
    const go = async (name, extra, prep) => {
      resetSource(); if(prep) prep();
      const dir = freshDir('log-' + name), files = { GITHUB_OUTPUT: path.join(dir, 'gh-out'), GITHUB_STEP_SUMMARY: path.join(dir, 'gh-sum') };
      const r = await runNode('run.js', [], backupEnv(path.join(dir, 'out'), Object.assign({ GITHUB_ACTIONS: 'true' }, files, extra)));
      const side = Object.values(files).map(f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')).join('\n');
      runs.push([name, r, side]);
      return r;
    };
    assert.equal((await go('done', {})).code, 0);
    assert.equal((await go('size-warning', { BACKUP_WARN_MB: '1' })).code, 0);
    assert.equal((await go('not-configured', { BACKUP_PASSPHRASE: '' })).code, 0);
    assert.equal((await go('phrase', { BACKUP_PASSPHRASE: OLD_PHRASE })).code, 1);
    assert.equal((await go('miscopied', { BACKUP_PASSPHRASE: changedAt(PASS, 3) })).code, 1);
    assert.equal((await go('wrong-password', { BACKUP_LOGIN_PASSWORD: 'wrong-password' })).code, 1);
    assert.equal((await go('refused-read', {}, () => { fake.failPage = { project: PROD, page: 1, times: Infinity, status: 403, statusText: 'PERMISSION_DENIED', count: 0 }; })).code, 1);
    assert.equal((await go('count-differs', {}, () => { fake.countSkew = 2; })).code, 1);
    assert.equal((await go('read-time-refused', {}, () => { fake.rejectReadTime = true; })).code, 0);
    for(const [name, r, side] of runs){
      assertCleanLog(r.all); assertCleanLog(side);
      assert.ok(!(r.all + side).includes(changedAt(PASS, 3)) && !(r.all + side).toLowerCase().includes(PASS.replace(/-/g, '').slice(0, 10)), name + ': a form of the passphrase');
      // GitHub reads "::" at the start of a line as a command: only our own warning and error lines start so
      (r.all.match(/^::.*$/gm) || []).forEach(l => assert.match(l, /^::(warning|error) title=[^:]+::/, name + ': ' + l.slice(0, 60)));
    }
  });
});

// The whole file is built in memory, and one JavaScript string holds about
// 512 MB: past about 500 MB of data the build stops ("Invalid string length",
// measured: 480 MB of photos back up in 33 s at 3.8 GB, 560 MB do not). Photos
// (photo:<id>, ~250 KB each) are what grows. The run must say so long before,
// and say why when it happens.
describe('run.js and the size of the database', () => {
  test('from the warning size on (300 MB; BACKUP_WARN_MB here), the run warns — and still backs up', async () => {
    resetSource();
    const dir = freshDir('big'), summary = path.join(dir, 'gh-summary');
    const r = await runNode('run.js', [], backupEnv(path.join(dir, 'out'), { BACKUP_WARN_MB: '1', GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary }));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /::warning title=Database backup nearing its size limit::The database holds \d+(\.\d)? MB of data/);
    assert.match(r.out, /about 500 MB/); assert.match(r.out, /docs\/backup\.md, "Limits"/);
    assert.equal(filesIn(path.join(dir, 'out')).length, 1);
    // a green run is rarely opened line by line: the run's summary says it too
    assert.match(fs.readFileSync(summary, 'utf8'), /\*\*Nearing the size limit\.\*\* The database holds \d+(\.\d)? MB of data/);
    assertCleanLog(r.all);
    const small = freshDir('small'), quietSummary = path.join(small, 'gh-summary');
    const quiet = await runNode('run.js', [], backupEnv(path.join(small, 'out'), { GITHUB_STEP_SUMMARY: quietSummary }));
    assert.equal(quiet.code, 0, quiet.all);
    assert.doesNotMatch(quiet.all + fs.readFileSync(quietSummary, 'utf8'), /size limit/i, 'no warning below the warning size');
  });
  test('a build that runs out of room says the database is too large for this backup, and keeps nothing', async () => {
    resetSource();
    const dir = freshDir('too-big');
    const real = B.buildBundle;
    B.buildBundle = () => { throw new RangeError('Invalid string length'); };   // what V8 throws past ~512 MB
    let out = '', err = '';
    try{
      const run = require('../scripts/backup/nightly/run.js');
      const code = await run.main({ env: backupEnv(dir), argv: [], out: { write: s => { out += s; } }, err: { write: s => { err += s; } } });
      assert.equal(code, 1, out + err);
    }finally{ B.buildBundle = real; }
    assert.match(err, /Invalid string length — the database is too large for this backup to build in memory \(about 500 MB at most; docs\/backup\.md, "Limits"\)\. No backup file was written\./);
    assert.deepEqual(filesIn(dir), []);
    assertCleanLog(out + err);
  });
  test('the same is said when the written file is too large to read back, or a buffer cannot be made', async () => {
    resetSource();
    const run = require('../scripts/backup/nightly/run.js');
    const cases = [
      ['checkBundle', () => { throw Object.assign(new Error('Cannot create a string longer than 0x1fffffe8 characters'), { code: 'ERR_STRING_TOO_LONG' }); }],   // Buffer.toString past ~512 MB
      ['encryptBundle', () => { throw new RangeError('Array buffer allocation failed'); }],
    ];
    for(const [fn, thrower] of cases){
      const dir = freshDir('too-big-' + fn), real = B[fn];
      let out = '', err = '', code;
      B[fn] = thrower;
      try{ code = await run.main({ env: backupEnv(dir), argv: [], out: { write: s => { out += s; } }, err: { write: s => { err += s; } } }); }
      finally{ B[fn] = real; }
      assert.equal(code, 1, fn + ': ' + out + err);
      assert.match(err, /the database is too large for this backup to build in memory \(about 500 MB at most; docs\/backup\.md, "Limits"\)\. No backup file was written\./, fn);
      assert.deepEqual(filesIn(dir), [], fn + ': nothing kept, not even the file being written');
    }
    // any other failure is not called a size problem
    const dir = freshDir('not-size'), real = B.buildBundle;
    let err = '';
    B.buildBundle = () => { throw new RangeError('Maximum call stack size exceeded'); };
    try{ assert.equal(await run.main({ env: backupEnv(dir), argv: [], out: { write(){} }, err: { write: s => { err += s; } } }), 1); }
    finally{ B.buildBundle = real; }
    assert.doesNotMatch(err, /too large/);
  });
});

// A message that sends the reader to a section of the guide must name one
// that is there (the size messages said "Limits" before the guide had it).
describe('the guide (docs/backup.md)', () => {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'backup.md'), 'utf8');
  const headings = guide.split('\n').filter(l => /^#{1,3} /.test(l)).map(l => l.replace(/^#+ /, '').trim());
  test('every section a tool\'s message points to is in the guide', () => {
    const named = new Set();
    for(const f of ['run.js', 'verify.js', 'restore.js', 'bundle.js', 'firestore.js']){
      const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
      for(const m of src.matchAll(/docs\/backup\.md, "([^"]+)"(?:; for production, "([^"]+)")?/g)){ named.add(m[1]); if(m[2]) named.add(m[2]); }
    }
    assert.ok(named.has('Limits') && named.has('Restore into a separate project') && named.has('Restore into production'), 'the scan finds the sections the messages name: ' + [...named].join(' | '));
    for(const n of named) assert.ok(headings.some(h => h === n || h.startsWith(n + ' (')), 'docs/backup.md has no section "' + n + '" (it has: ' + headings.join(' | ') + ')');
  });
  // v123: the rules have a role that only reads (the jobs' logins), every
  // document carries the app revision, and the owner may raise the oldest
  // revision allowed to write. What the guide tells the owner must be those rules.
  test('what the guide says about the backup\'s login and about a restore into production is true for the published rules (v123)', () => {
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    assert.match(rules, /function JOB_EMAILS\(\)/, 'the rules have the jobs\' read-only logins');
    assert.match(rules, /function MIN_APP_REV\(\)/);
    assert.match(guide, /JOB_EMAILS\(\)/, 'the guide tells the owner to list the backup\'s login there');
    assert.doesNotMatch(guide, /no read-only role/, 'the rules have had a read-only role since v123');
    const at = guide.indexOf('\n## Restore into production');
    assert.ok(at > 0);
    const section = guide.slice(at, guide.indexOf('\n## ', at + 5));
    assert.match(section, /supervisor/); assert.match(section, /`rev`/); assert.match(section, /MIN_APP_REV\(\)/);
    // the --only list: every document the rules let someone write, and nothing they do not list
    const only = /--only=([A-Za-z0-9:_,]+)/.exec(section)[1].split(',');
    const keys = new Set(), families = new Set();
    for(const m of rules.matchAll(/key in \[([^\]]*)\]/g)) (m[1].match(/'[^']+'/g) || []).forEach(q => keys.add(q.slice(1, -1)));
    for(const m of rules.matchAll(/key\.matches\('([A-Za-z]+[:_])/g)) families.add(m[1]);
    assert.ok(keys.has('clinics') && keys.has('mailLog') && keys.has('staff') && families.has('visitsArch:') && families.has('snap_'), 'the scan reads the rules');
    families.delete('snap_');   // the app's own daily backups: the rules refuse an old one, so the list leaves them out
    for(const k of [...keys, ...families]) assert.ok(only.includes(k), 'the guide\'s --only list lacks ' + k);
    for(const k of only) assert.ok(keys.has(k) || families.has(k), 'the guide\'s --only list names ' + k + ', which the rules do not list');
    assert.equal(new Set(only).size, only.length, 'no name twice');
  });
  test('the owner\'s steps: the last section, numbered, in plain Arabic — no English word but the secrets he types', () => {
    const at = guide.indexOf('\n## خطوات المالك\n');
    assert.ok(at > 0, 'the guide has the owner\'s steps');
    assert.equal(guide.indexOf('\n## ', at + 5), -1, 'they are the last section');
    const steps = guide.slice(at);
    const numbered = (steps.match(/^\d+\. /gm) || []).map(x => parseInt(x, 10));
    assert.deepEqual(numbered, numbered.map((_, i) => i + 1), 'numbered 1, 2, 3 …');
    assert.ok(numbered.length >= 8);
    const words = new Set(steps.replace(/https:\/\/\S+/g, '').match(/[A-Za-z][A-Za-z_]+/g) || []);
    words.delete('GitHub');   // a name, not an English word
    assert.deepEqual([...words].sort(), ['BACKUP_LOGIN_EMAIL', 'BACKUP_LOGIN_PASSWORD', 'BACKUP_PASSPHRASE']);
    assert.doesNotMatch(steps, /```|\bnode\b|--/, 'no code');
    // the links: the passphrase page, where the secrets go, the backup's page
    assert.match(steps, /https:\/\/ghaithalmanfe\.github\.io\/ultramed-app\/backup-passphrase\.html/);
    assert.match(steps, /https:\/\/github\.com\/ghaithalmanfe\/ultramed-app\/settings\/secrets\/actions\/new/);
    assert.match(steps, /https:\/\/github\.com\/ghaithalmanfe\/ultramed-app\/actions\/workflows\/backup\.yml/);
    assert.ok(fs.existsSync(path.join(ROOT, '.github', 'workflows', 'backup.yml')) && fs.existsSync(path.join(ROOT, 'www', 'backup-passphrase.html')), 'the links name files this release publishes');
    for(const what of [/مدير كلمات المرور/, /ورقة/, /فلن يستطيع أحد فتح النسخ/, /بيدك/, /العلامة\s+الخضراء وحدها لا تكفي/, /ينزل على جهازك/, /مشروع تجريبي منفصل/, /بموافقتك/, /خاصاً/]) assert.match(steps, what);
  });
  test('the "Limits" section says the size the backup stops at, the warning before it, and what to do', () => {
    const at = guide.indexOf('\n## Limits\n');
    assert.ok(at > 0);
    const section = guide.slice(at, guide.indexOf('\n## ', at + 5));
    assert.match(section, /about 500 MB/); assert.match(section, /300 MB/); assert.match(section, /BACKUP_WARN_MB/);
    assert.match(section, /Database backup nearing its size limit/);
    assert.match(section, /the database is too large for this backup to build in\s+memory/);
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
  test('least rights: it reads the repository and nothing more, runs only on its schedule or by hand, and gives the secrets to one step', () => {
    // the only permission, at the top, for every job: read the code
    assert.match(y, /^permissions:\n  contents: read\n\n/m);
    assert.equal((y.match(/^\s*permissions:/gm) || []).length, 1, 'no job widens it');
    assert.doesNotMatch(y, /: write\b|write-all|read-all|id-token/);
    // never on a push or a pull request (a branch or a fork cannot make it run with the secrets)
    const on = /^on:\n([\s\S]*?)\n\S/m.exec(y)[1];
    assert.deepEqual((on.match(/^  ([a-z_]+):/gm) || []).map(l => l.trim()), ['schedule:', 'workflow_dispatch:']);
    assert.doesNotMatch(y, /pull_request_target|secrets: inherit/);
    assert.match(y, /^\s+timeout-minutes: \d+$/m);
    // the secrets: in the environment of the backup step only, which runs the tool with no argument
    const steps = y.split(/\n      - /).slice(1);
    const withSecrets = steps.filter(st => st.includes('secrets.'));
    assert.equal(withSecrets.length, 1, 'one step gets the secrets');
    assert.match(withSecrets[0], /\n        run: node scripts\/backup\/nightly\/run\.js\n/);
    assert.deepEqual((withSecrets[0].match(/secrets\.([A-Z_]+)/g) || []).sort(), ['secrets.BACKUP_LOGIN_EMAIL', 'secrets.BACKUP_LOGIN_PASSWORD', 'secrets.BACKUP_PASSPHRASE', 'secrets.REPORT_LOGIN_EMAIL', 'secrets.REPORT_LOGIN_PASSWORD']);
    // "not configured" uploads nothing; a failed backup step fails the run, and the upload after it does not run
    const upload = steps.find(st => st.includes('upload-artifact'));
    assert.match(upload, /\n        if: steps\.backup\.outputs\.file != ''\n/);
    assert.doesNotMatch(upload, /always\(\)|failure\(\)|continue-on-error/);
    assert.doesNotMatch(y, /continue-on-error/);
  });
  test('the guide tells the owner the first backup is made by hand, and how to read the result', () => {
    const guide = fs.readFileSync(path.join(ROOT, 'docs', 'backup.md'), 'utf8');
    assert.match(guide, /only from the default branch/);
    assert.match(guide, /\*\*Make the first backup by hand\*\*: Actions → "Database backup" → \*\*Run workflow\*\*/);
    assert.match(guide, /\*\*Check the result\*\*/); assert.match(guide, /A green tick alone is not the proof: the artifact is\./);
    assert.match(y, /runs a\n# schedule ONLY from the default branch/);
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
  test('each kind queues on its own: a weekly or monthly run waiting behind another kind is never cancelled', () => {
    // GitHub keeps ONE waiting run per concurrency group and cancels the older
    // waiting one when another arrives: in one shared group, a weekly run
    // waiting behind a late daily is cancelled by the monthly queued after it.
    const m = /^concurrency:\n\s+group: (.+)\n\s+cancel-in-progress: false$/m.exec(y);
    assert.ok(m, 'a concurrency group that never cancels a running backup');
    const groupOf = (schedule, tier) => m[1].replace(/\$\{\{(.+?)\}\}/g, (_, e) => {
      const js = e.replace(/github\.event\.schedule/g, 'S').replace(/inputs\.tier/g, 'T').replace(/==/g, '===');
      assert.match(js, /^[\sST'=&|a-z0-9*]+$/, 'a plain expression: ' + e);
      return String(new Function('S', 'T', 'return (' + js + ');')(schedule, tier));
    });
    const names = { daily: groupOf('15 23 * * *', null), weekly: groupOf('45 23 * * 4', null), monthly: groupOf('15 0 1 * *', null) };
    assert.equal(new Set(Object.values(names)).size, 3, 'one group per kind: ' + JSON.stringify(names));
    for(const k of ['daily', 'weekly', 'monthly']) assert.equal(groupOf(undefined, k), names[k], 'a ' + k + ' run by hand queues with the scheduled ' + k);
    assert.equal(groupOf(undefined, ''), names.daily);
  });
});

describe('a nightly backup never reaches the published site', () => {
  test('the build refuses an encrypted backup, one being written, or a decrypted bundle put in the published folder', () => {
    const { salesDataFiles } = require('../scripts/build.js');
    const src = freshDir('www');
    const plain = B.buildBundle({ docs: new Map([['clinics', { fields: { value: { stringValue: '[]' } } }]]), project: 'demo', createdAt: 'x' }).plaintext;
    fs.writeFileSync(path.join(src, 'ultramed-state-daily-20261112-231502Z.umbackup'), B.encryptBundle(plain, PASS, { project: 'demo' }, FAST_KDF));
    fs.writeFileSync(path.join(src, 'ultramed-state-daily-20261112-231502Z.umbackup.partial'), 'x');
    fs.mkdirSync(path.join(src, 'old'));
    fs.writeFileSync(path.join(src, 'old', 'bundle.json'), plain);
    fs.writeFileSync(path.join(src, 'manifest.json'), JSON.stringify({ name: 'app' }));
    assert.deepEqual(salesDataFiles(src).sort(), ['old/bundle.json', 'ultramed-state-daily-20261112-231502Z.umbackup', 'ultramed-state-daily-20261112-231502Z.umbackup.partial']);
  });
});
