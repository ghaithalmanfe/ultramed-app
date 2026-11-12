// scripts/backup: verify.js checks a full backup file (Export → Full backup on
// the supervisor's phone), restore.js puts one into a TEST cloud — never the
// production cloud, never from the app. The phone side (reading the cloud,
// writing the file) is tests/e2e/full-backup.e2e.js.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const core = require('../www/js/core.js');
const verify = require('../scripts/backup/verify.js');
const restore = require('../scripts/backup/restore.js');
const ROOT = path.join(__dirname, '..');
const J = JSON.stringify;
const SECRET = 'Very private customer note 7731';   // must never be printed
function account(){
  const out = {}, put = (k, v, u) => { out[k] = { value: typeof v === 'string' ? v : J(v), updated: u == null ? 1762800000000 : u }; };
  put('clinics', [{ id: 'c1', name: 'عيادة النور — Al Noor', rep: 'Mariam', doctors: [{ id: 'd1', name: 'د. سارة' }], notes: SECRET }, { id: 'c2', name: 'Bayan 🦷', rep: 'Renova', doctors: [] }]);
  put('visits', [{ id: 'v1', clinicId: 'c1', date: '2026-11-02' }]);
  put('visitsArch:2026-10', [{ id: 'a1', clinicId: 'c1', date: '2026-10-02' }, { id: 'a2', clinicId: 'c2', date: '2026-10-03' }]);
  put('visitsIndex', { months: { '2026-10': { n: 2, rev: 1 } }, v: 1 });
  put('staff', [{ name: 'Mariam', role: 'rep', email: 'rep1@example.com' }, { name: 'Dr. Ghaith', role: 'supervisor', email: 'supervisor@example.com' }]);
  put('tombs', { visits: {}, clinics: { cx: 1 } });
  const row = (d, n) => [d, 'SINV' + n, 0, 'Brush', 1, 2, 2, 0, 'A Salesman', 'Tepe', 'Al Noor', 'Clinics', 0, ''];
  const sp = core.erpSplitForStorage({ periods: [{ id: 'oct', from: '2026-10-01', to: '2026-10-31', rev: 2, rows: [row('2026-10-01', 1), row('2026-10-02', 2), row('2026-10-03', 3)] }] }, 2);
  put('erpSales', sp.index); Object.keys(sp.docs).forEach(k => put(k, sp.docs[k]));
  put('snap_2026-11-10', { clinics: [{ id: 'c1' }], products: [], visits: [], tasks: [] });
  put('photo:p1', 'data:image/jpeg;base64,' + Buffer.from('jpeg bytes').toString('base64'), null);
  put('someFutureDoc', 'plain text, not JSON');
  return out;
}
const meta = { app: 'v120', project: 'test-project', takenAt: '2026-11-11T10:00:00.000Z', takenBy: 'Dr. Ghaith' };
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'um-backup-test-'));
const run = (script, args) => { const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'backup', script)].concat(args), { encoding: 'utf8', cwd: ROOT }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
function writeBackup(dir, mutate, pending){
  const f = core.fullBackupFile(account(), meta, pending);
  if(mutate) mutate(f);
  const p = path.join(dir, 'ultramed-full-backup-2026-11-11-1000.json');
  fs.writeFileSync(p, J(f));
  return { p, f };
}

describe('scripts/backup/verify.js', () => {
  test('an intact file: exit 0, the counts per key and per data set, and never a value', () => {
    const dir = tmpDir(), { p } = writeBackup(dir, null, { tasks: { value: J([{ id: 't9' }]), from: 'um_mirror:tasks' } });
    const r = run('verify.js', [p]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /Integrity: INTACT — 12 documents/);
    assert.match(r.out, /clinics\s+clinics\s+2 clinics, 1 doctors/);
    assert.match(r.out, /erpRows:oct:2:0\s+erpSales\s+2 lines/);
    assert.match(r.out, /snap_2026-11-10\s+snapshots\s+1 clinics, 0 visits, 0 products, 0 tasks/);
    assert.match(r.out, /Sales files \(ERP\)\s+1 files\s+3 documents\s+\(3 lines\)/);
    assert.match(r.out, /Visits\s+3 visits\s+3 documents\s+\(1 past months\)/);
    assert.match(r.out, /Pending on the phone[^\n]*NOT part of the cloud copy[\s\S]*tasks\s+from um_mirror:tasks/);
    assert.ok(!r.out.includes(SECRET) && !r.out.includes('عيادة النور') && !r.out.includes('example.com'), 'no value of any document is printed');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('a changed value, a missing part, an added part: exit 1, naming the part', () => {
    const dir = tmpDir();
    let r = run('verify.js', [writeBackup(dir, f => { f.data.clinics.value = f.data.clinics.value.replace('Al Noor', 'Al Nour'); }).p]);
    assert.equal(r.status, 1); assert.match(r.out, /clinics: sha256 does not match — the value was changed/); assert.match(r.out, /clinics[^\n]*← NOT INTACT/);
    r = run('verify.js', [writeBackup(dir, f => { delete f.data['erpRows:oct:2:1']; }).p]);
    assert.equal(r.status, 1); assert.match(r.out, /erpRows:oct:2:1: in the manifest, missing from the data/);
    r = run('verify.js', [writeBackup(dir, f => { f.data.planted = { value: '"x"', updated: null }; }).p]);
    assert.equal(r.status, 1); assert.match(r.out, /planted: in the data, not in the manifest/);
    r = run('verify.js', [writeBackup(dir, f => { f.manifest.parts.find(x => x.key === 'visits').counts.visits = 9; f.integrity.sha256 = verify.sha256(core.backupCanonical(f)); }).p]);
    assert.equal(r.status, 1, 'a count changed, even with the code recomputed'); assert.match(r.out, /visits: the record counts in the manifest do not match the data/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('a file cut short or missing: exit 2; something that is not a backup: exit 1', () => {
    const dir = tmpDir(), { p } = writeBackup(dir);
    const cut = path.join(dir, 'cut.json'); fs.writeFileSync(cut, fs.readFileSync(p, 'utf8').slice(0, 500));
    assert.equal(run('verify.js', [cut]).status, 2);
    assert.equal(run('verify.js', [path.join(dir, 'nope.json')]).status, 2);
    const other = path.join(dir, 'other.json'); fs.writeFileSync(other, J({ kind: 'something' }));
    const r = run('verify.js', [other]);
    assert.equal(r.status, 1); assert.match(r.out, /not an UltraMed full backup file/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('--json gives the same verdict and counts for a program', () => {
    const dir = tmpDir(), { p } = writeBackup(dir);
    const r = run('verify.js', [p, '--json']);
    assert.equal(r.status, 0);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.equal(j.documents, 12);
    assert.deepEqual(j.sets.find(s => s.id === 'erpSales').extra, { lines: 3, missingChunks: 0, staleChunks: 0 });
    assert.equal(j.sets.find(s => s.id === 'snapshots').records, 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('scripts/backup/restore.js — a test cloud only', () => {
  test('into an empty test cloud: every key back, byte for byte, with its timestamp; this phone\'s pending changes are never written', async () => {
    const docs = account(), f = core.fullBackupFile(docs, meta, { tasks: { value: '[]', from: 'um_mirror:tasks' } }), store = {};
    const r = await restore.restoreBackup(JSON.parse(J(f)), restore.memoryTestCloud(store));
    assert.deepEqual(Object.keys(store).sort(), Object.keys(docs).sort());
    Object.keys(docs).forEach(k => {
      assert.ok(Buffer.from(store[k].value, 'utf8').equals(Buffer.from(docs[k].value, 'utf8')), k);
      assert.equal(store[k].updated, docs[k].updated, k);
    });
    assert.equal(r.written, 12); assert.deepEqual(r.pendingNotRestored, ['tasks']); assert.ok(!('tasks' in store));
  });
  test('refused before anything is written: not a test cloud, a test cloud that holds data, a file that does not verify', async () => {
    const f = core.fullBackupFile(account(), meta);
    const writes = [];
    const prod = { kind: 'firestore', list: async () => [], get: async () => null, set: async k => { writes.push(k); } };
    await assert.rejects(restore.restoreBackup(f, prod), /not a test cloud/);
    await assert.rejects(restore.restoreBackup(f, null), /not a test cloud/);
    const busy = { clinics: { value: '[]', updated: 1 } };
    await assert.rejects(restore.restoreBackup(f, restore.memoryTestCloud(busy)), /already holds 1 document/);
    assert.deepEqual(busy, { clinics: { value: '[]', updated: 1 } });
    const bad = JSON.parse(J(f)); bad.data.staff.value = bad.data.staff.value.replace('Mariam', 'Maryam');
    const empty = {};
    await assert.rejects(restore.restoreBackup(bad, restore.memoryTestCloud(empty)), /not intact — staff: sha256/);
    assert.deepEqual(empty, {}); assert.deepEqual(writes, []);
  });
  test('--force writes over, and names the documents it left', async () => {
    const f = core.fullBackupFile(account(), meta), busy = { clinics: { value: '[]', updated: 1 }, keepMe: { value: '"x"', updated: 2 } };
    const r = await restore.restoreBackup(f, restore.memoryTestCloud(busy), { force: true });
    assert.equal(busy.clinics.value, f.data.clinics.value);
    assert.deepEqual(busy.keepMe, { value: '"x"', updated: 2 });
    assert.deepEqual([r.replaced, r.kept], [['clinics'], ['keepMe']]);
  });
  test('command line: into a new test-cloud file (checked from the disk), refused the second time without --force, accepted with it', () => {
    const dir = tmpDir(), { p, f } = writeBackup(dir), into = path.join(dir, 'restored.test-cloud.json');
    let r = run('restore.js', [p, '--into', into]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /Restored 12 documents into .*restored\.test-cloud\.json \(a test cloud\) — every key read back from the file and identical/);
    const tc = JSON.parse(fs.readFileSync(into, 'utf8'));
    assert.equal(tc.kind, 'ultramed-test-cloud');
    Object.keys(f.data).forEach(k => { assert.equal(tc.docs[k].value, f.data[k].value, k); assert.equal(tc.docs[k].updated, f.data[k].updated, k); });
    r = run('restore.js', [p, '--into', into]);
    assert.equal(r.status, 1); assert.match(r.out, /already holds 12 document\(s\).*--force/);
    r = run('restore.js', [p, '--into', into, '--force']);
    assert.equal(r.status, 0, r.out); assert.match(r.out, /Written over \(--force\): 12/);
    assert.ok(!r.out.includes(SECRET));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('command line: the production cloud, a URL, the published folder, another file name, a file that is not a test cloud — refused, nothing written', () => {
    const dir = tmpDir(), { p } = writeBackup(dir);
    const refused = (into, re) => { const r = run('restore.js', [p, '--into', into]); assert.equal(r.status, 1, into + ': ' + r.out); assert.match(r.out, re); };
    refused('https://firestore.googleapis.com/v1/projects/ultramed-field-ops/databases/(default)/documents/state', /a URL.*never the production cloud/);
    refused('firestore:ultramed-field-ops', /URL|production/);
    refused(path.join(dir, 'ultramed-field-ops.test-cloud.json'), /production cloud/);
    refused(path.join(ROOT, 'www', 'x.test-cloud.json'), /published folder \(www\/\)/);
    refused(path.join(ROOT, 'dist', 'x.test-cloud.json'), /published folder \(dist\/\)/);
    refused(path.join(dir, 'restored.json'), /<name>\.test-cloud\.json/);
    const notCloud = path.join(dir, 'notes.test-cloud.json'); fs.writeFileSync(notCloud, J({ hello: 'mine' }));
    refused(notCloud, /is not a test-cloud file — it is never overwritten/);
    assert.equal(fs.readFileSync(notCloud, 'utf8'), J({ hello: 'mine' }));
    assert.ok(!fs.existsSync(path.join(ROOT, 'www', 'x.test-cloud.json')) && !fs.existsSync(path.join(ROOT, 'dist', 'x.test-cloud.json')));
    const r = run('restore.js', [p]);
    assert.equal(r.status, 1); assert.match(r.out, /name the test cloud/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('a full backup never reaches the published site or the app', () => {
  // the restore's code, a way to load it, or a test cloud made by the app (the
  // file's own note may name the command — text, not a way in)
  const RESTORE_CODE = /\b(restoreBackup|restoreFullBackup|fileTestCloud|memoryTestCloud)\b|require\([^)]*scripts\/backup|ultramed-test-cloud/;
  test('nothing under www/ reaches the restore', () => {
    const hits = [];
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const q = path.join(d, e.name);
      if(e.isDirectory()) return walk(q);
      if(/\.(js|html|json)$/.test(e.name) && RESTORE_CODE.test(fs.readFileSync(q, 'utf8'))) hits.push(path.relative(ROOT, q));
    });
    walk(path.join(ROOT, 'www'));
    assert.deepEqual(hits, []);
  });
  test('the build refuses a backup file or a test cloud put in the published folder', () => {
    const { salesDataFiles } = require('../scripts/build.js');
    const src = tmpDir();
    fs.writeFileSync(path.join(src, 'ultramed-full-backup-2026-11-11-1000.json'), J(core.fullBackupFile(account(), meta)));
    fs.mkdirSync(path.join(src, 'old'));
    fs.writeFileSync(path.join(src, 'old', 'copy.json'), J({ kind: 'ultramed-test-cloud', docs: {} }));
    fs.writeFileSync(path.join(src, 'manifest.json'), J({ name: 'app' }));
    assert.deepEqual(salesDataFiles(src).sort(), ['old/copy.json', 'ultramed-full-backup-2026-11-11-1000.json']);
    fs.rmSync(src, { recursive: true, force: true });
  });
});
