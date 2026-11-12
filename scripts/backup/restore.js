// node scripts/backup/restore.js <ultramed-full-backup-….json> --into <name>.test-cloud.json [--force]
//
// Puts a full backup back into a TEST cloud — never the production one. The
// only target this script can write is a local file, <name>.test-cloud.json
// ({kind: 'ultramed-test-cloud', docs: {key: {value, updated}}}), the shape the
// browser harnesses' fake cloud reads (tests/e2e/full-backup.e2e.js restores a
// backup, opens the app on it and compares every key). There is no code here,
// and none in the app, that writes to Firestore; the app has no restore of a
// full backup at all.
//
// Refused, before anything is written:
//   - a backup file that does not verify (scripts/backup/verify.js);
//   - a target that is a URL, or names the production project or Firestore;
//   - a target that is not named <name>.test-cloud.json, or an existing file
//     that is not a test cloud (never overwritten);
//   - a target inside the published folder (www/, dist/ — the site is public);
//   - a test cloud that already holds documents, unless --force: then every
//     key of the backup is written over, and the documents the backup does not
//     have are left as they are, and named.
// The backup's pending changes (this phone's unsent edits) are never written:
// they were not in the cloud. Every key is read back from the target — from
// the file on disk for the command line — and compared byte for byte.
//
// Exit code: 0 restored and checked · 1 refused · 2 failed.
'use strict';
const fs = require('fs'), path = require('path');
const core = require('../../www/js/core.js');
const { sha256 } = require('./verify.js');

const TEST_KIND = 'ultramed-test-cloud';
const PRODUCTION = /firestore|googleapis|firebase|ultramed-field-ops/i;
const ROOT = path.join(__dirname, '..', '..');
class RestoreRefused extends Error {}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// file: the parsed backup. target: { kind: 'ultramed-test-cloud', list() → keys,
// get(key) → {value, updated}|null, set(key, value, updated), save()? }.
async function restoreBackup(file, target, opts){
  opts = opts || {};
  if(!target || target.kind !== TEST_KIND) throw new RestoreRefused('refused: the target is not a test cloud — a full backup is restored only into a test cloud, never into the production one');
  const v = core.verifyBackupFile(file, sha256);
  if(!v.ok) throw new RestoreRefused('refused: the backup file is not intact — ' + v.problems.slice(0, 3).join('; ') + (v.problems.length > 3 ? ' …' : ''));
  const keys = Object.keys(file.data).sort();
  const existing = await target.list();
  if(existing.length && !opts.force) throw new RestoreRefused('refused: the test cloud already holds ' + existing.length + ' document(s) — restore into an empty one, or pass --force to write over it');
  const inBackup = new Set(keys);
  const replaced = existing.filter(k => inBackup.has(k)).sort(), kept = existing.filter(k => !inBackup.has(k)).sort();
  for(const k of keys) await target.set(k, file.data[k].value, file.data[k].updated == null ? null : file.data[k].updated);
  if(typeof target.save === 'function') await target.save();
  const back = typeof target.reload === 'function' ? await target.reload() : target;   // read back from where it landed
  const mismatched = [];
  for(const k of keys){
    const got = await back.get(k), want = file.data[k];
    if(!got || typeof got.value !== 'string' || !Buffer.from(got.value, 'utf8').equals(Buffer.from(want.value, 'utf8')) || got.value !== want.value
      || (got.updated == null ? null : got.updated) !== (want.updated == null ? null : want.updated)) mismatched.push(k);
  }
  if(mismatched.length) throw new Error('the test cloud does not hold what was written: ' + mismatched.slice(0, 5).join(', '));
  return { written: keys.length, checked: keys.length, replaced, kept, pendingNotRestored: Object.keys(file.pending || {}).sort() };
}
// An in-memory test cloud over `store` ({key: {value, updated}}).
function memoryTestCloud(store){
  return {
    kind: TEST_KIND, name: 'memory',
    async list(){ return Object.keys(store); },
    async get(k){ return has(store, k) ? store[k] : null; },
    async set(k, value, updated){ store[k] = { value, updated: updated == null ? null : updated }; },
  };
}
// Why `into` can never be written, or null.
function refuseTarget(into){
  if(!into) return 'refused: name the test cloud — --into <name>.test-cloud.json';
  if(/^[a-z][a-z0-9+.-]*:\/\//i.test(into) || /^[a-z]{2,}:/i.test(into)) return 'refused: a URL — this restore writes only a local test-cloud file, never the production cloud';
  if(PRODUCTION.test(into)) return 'refused: this names the production cloud (Firestore, project ultramed-field-ops) — a full backup is restored only into a test cloud';
  if(!/\.test-cloud\.json$/i.test(into)) return 'refused: the test cloud must be a file named <name>.test-cloud.json';
  const abs = path.resolve(into);
  for(const pub of ['www', 'dist']){
    const dir = path.join(ROOT, pub) + path.sep;
    if(abs.startsWith(dir)) return 'refused: never inside the published folder (' + pub + '/) — the site is public';
  }
  return null;
}
// A test cloud kept in a local file.
function fileTestCloud(into){
  const why = refuseTarget(into);
  if(why) throw new RestoreRefused(why);
  const abs = path.resolve(into);
  let docs = Object.create(null);
  if(fs.existsSync(abs)){
    let cur = null;
    try{ cur = JSON.parse(fs.readFileSync(abs, 'utf8')); }catch(e){}
    if(!cur || cur.kind !== TEST_KIND || !cur.docs || typeof cur.docs !== 'object') throw new RestoreRefused('refused: ' + into + ' exists and is not a test-cloud file — it is never overwritten');
    Object.keys(cur.docs).forEach(k => { docs[k] = cur.docs[k]; });
  }
  const cloud = memoryTestCloud(docs);
  cloud.name = abs;
  cloud.save = async () => {
    const tmp = abs + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify({ kind: TEST_KIND, note: 'A TEST cloud restored from a full backup — customer, sales and team data: keep it private, never commit it.', docs }));
    fs.renameSync(tmp, abs);
  };
  cloud.reload = async () => {
    const back = JSON.parse(fs.readFileSync(abs, 'utf8')), d = Object.create(null);
    Object.keys(back.docs || {}).forEach(k => { d[k] = back.docs[k]; });
    return memoryTestCloud(d);
  };
  return cloud;
}
async function main(argv, out){
  out = out || (s => process.stdout.write(s + '\n'));
  const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--into');
  const i = argv.indexOf('--into'), into = i >= 0 ? argv[i + 1] : null, force = argv.includes('--force');
  if(!file){ out('usage: node scripts/backup/restore.js <ultramed-full-backup-….json> --into <name>.test-cloud.json [--force]'); return 1; }
  try{
    const target = fileTestCloud(into);
    let backup;
    try{ backup = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch(e){ throw new RestoreRefused('refused: could not read the backup file (' + (e.code === 'ENOENT' ? 'no such file' : 'not JSON') + ')'); }
    const r = await restoreBackup(backup, target, { force });
    out('Restored ' + r.written + ' documents into ' + target.name + ' (a test cloud) — every key read back from the file and identical, byte for byte.');
    if(r.replaced.length) out('Written over (--force): ' + r.replaced.length + ' document(s) that were already there.');
    if(r.kept.length) out('Left as they were (the backup does not have them): ' + r.kept.join(', '));
    if(r.pendingNotRestored.length) out('Not restored: this phone\'s pending changes (' + r.pendingNotRestored.join(', ') + ') — they were never in the cloud.');
    out('The test-cloud file holds customer, sales and team data: keep it private, never commit it (*.test-cloud.json is git-ignored).');
    return 0;
  }catch(e){
    out(e instanceof RestoreRefused ? e.message : 'restore failed: ' + (e && e.message || e));
    return e instanceof RestoreRefused ? 1 : 2;
  }
}
module.exports = { restoreBackup, memoryTestCloud, fileTestCloud, refuseTarget, RestoreRefused, TEST_KIND, main };
if(require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
