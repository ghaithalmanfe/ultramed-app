// node scripts/backup/verify.js <ultramed-full-backup-….json> [--json]
//
// Checks a full backup file taken on the phone (Export → Full backup, the
// supervisor): every part against the size, sha256 and record counts written in
// the file's manifest, nothing missing or added, this phone's pending changes,
// and the one integrity code over the manifest — with Node's own SHA-256, not the
// phone's. Prints the counts per key and per data set. It never prints a value:
// the file holds customer, sales and team data.
//
// Exit code: 0 intact · 1 not intact, or not a backup file · 2 could not be read.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const core = require('../../www/js/core.js');

function sha256(s){ return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }
function readBackup(file){ return JSON.parse(fs.readFileSync(file, 'utf8')); }
function verifyObject(obj){ return core.verifyBackupFile(obj, sha256); }

function size(b){ return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(1) + ' KB'; }
function countsText(c){
  if(c == null) return 'not readable as its data';
  const ks = Object.keys(c);
  return ks.length ? ks.map(k => c[k] + ' ' + k).join(', ') : '—';
}
function pad(s, n){ s = String(s); return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length); }
function setExtra(s){
  const x = s.extra || {}, out = [];
  if(s.id === 'visits'){ out.push(x.archivedMonths + ' past months'); if(x.missingMonths && x.missingMonths.length) out.push('listed but missing: ' + x.missingMonths.join(', ')); }
  if(s.id === 'erpSales'){ out.push((x.lines == null ? '?' : x.lines) + ' lines'); if(x.missingChunks) out.push(x.missingChunks + ' chunks missing from the cloud'); if(x.staleChunks) out.push(x.staleChunks + ' chunks of replaced files'); }
  if(s.id === 'targets' && x.pastMonths) out.push(x.pastMonths + ' past months kept');
  if(s.id === 'snapshots' && x.oldest) out.push(x.oldest + ' … ' + x.newest);
  if(s.inside) out.push('inside ' + s.inside);
  if(s.unreadable && s.unreadable.length) out.push('not readable as data: ' + s.unreadable.join(', '));
  return out.length ? '(' + out.join('; ') + ')' : '';
}
// The report, as lines of text (no value of any document).
function report(res, file){
  const L = [];
  L.push('UltraMed full backup: ' + (file ? path.basename(file) : ''));
  L.push('Taken ' + (res.takenAt || '?') + ' by ' + (res.takenBy || '?') + ' — app ' + (res.app || '?') + ' — project ' + (res.project || '?'));
  if(res.ok) L.push('Integrity: INTACT — ' + res.documents + ' documents, ' + size(res.bytes) + '; every part matches its sha256, size and counts; integrity sha256 ' + res.sha256);
  else {
    L.push('Integrity: NOT INTACT — ' + res.problems.length + ' problem(s):');
    res.problems.slice(0, 200).forEach(p => L.push('  - ' + p));
    if(res.problems.length > 200) L.push('  … and ' + (res.problems.length - 200) + ' more');
  }
  if(res.parts.length){
    L.push('', 'Per key (' + res.parts.length + ' documents):');
    res.parts.slice().sort((a, b) => a.key < b.key ? -1 : 1).forEach(p =>
      L.push('  ' + pad(p.key, 30) + pad(p.set, 15) + pad(countsText(p.counts), 44) + size(p.bytes || 0) + (p.ok ? '' : '   ← NOT INTACT')));
  }
  if(res.sets.length){
    L.push('', 'Per data set:');
    res.sets.forEach(s => L.push('  ' + pad(s.id === 'other' ? s.key + ' (other document)' : s.label, 42)
      + pad(s.records == null ? '—' : s.records + (s.unit ? ' ' + s.unit : ''), 18) + pad(s.docs + ' documents', 15) + setExtra(s)));
  }
  if(res.pending.length){
    L.push('', 'Pending on the phone when it was taken — NOT part of the cloud copy (a restore never writes them):');
    res.pending.forEach(p => L.push('  ' + pad(p.key, 20) + pad('from ' + (p.from || 'nowhere: no copy on the phone'), 34) + size(p.bytes || 0) + (p.ok ? '' : '   ← NOT INTACT')));
  }
  L.push('', 'Result: ' + (res.ok ? 'INTACT' : 'NOT INTACT'));
  return L;
}
function main(argv, out){
  out = out || (s => process.stdout.write(s + '\n'));
  const json = argv.includes('--json'), file = argv.find(a => !a.startsWith('--'));
  if(!file){ out('usage: node scripts/backup/verify.js <ultramed-full-backup-….json> [--json]'); return 2; }
  let obj;
  try{ obj = readBackup(file); }
  catch(e){
    const why = e.code === 'ENOENT' ? 'no such file' : e instanceof SyntaxError ? 'not a JSON file (cut short, or not a backup)' : (e.code || e.message);
    out(json ? JSON.stringify({ ok: false, error: 'could not read the file: ' + why }) : 'Could not read ' + file + ': ' + why);
    return 2;
  }
  const res = verifyObject(obj);
  if(json) out(JSON.stringify({ ok: res.ok, problems: res.problems, documents: res.documents, bytes: res.bytes, sha256: res.sha256,
    takenAt: res.takenAt, takenBy: res.takenBy, app: res.app, project: res.project,
    sets: res.sets.map(s => ({ id: s.id, key: s.key, label: s.label, records: s.records, unit: s.unit, docs: s.docs, bytes: s.bytes, extra: s.extra, unreadable: s.unreadable })),
    parts: res.parts, pending: res.pending }));
  else report(res, file).forEach(l => out(l));
  return res.ok ? 0 : 1;
}
module.exports = { sha256, readBackup, verifyObject, report, main };
if(require.main === module) process.exitCode = main(process.argv.slice(2));
