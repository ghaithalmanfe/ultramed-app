// node scripts/backup/run.js [--out DIR]
//
// UltraMed Field Ops — independent, encrypted backup of the whole database,
// kept OUTSIDE Firebase (run daily by .github/workflows/backup.yml; see
// docs/backup.md). Signs in like the daily e-mails do, reads EVERY document
// of the Firestore collection `state` (whole documents, page by page, all at
// one instant), and writes ONE file: the bundle (bundle.js), gzipped, then
// encrypted with AES-256-GCM under a key derived by scrypt from
// BACKUP_PASSPHRASE. The plaintext never touches the disk.
//
// Refuses to write anything when a page fails (after retries), when the
// listing comes back empty or disagrees with Firestore's own count, or when
// the written file does not decrypt back to the same data. Never prints a
// value, an e-mail address or a token: the repository and its Actions logs
// are PUBLIC. Not configured (secrets absent) → says so, writes nothing,
// exits 0.
//
// Environment:
//   BACKUP_PASSPHRASE                            required; 20+ characters
//   BACKUP_LOGIN_EMAIL / BACKUP_LOGIN_PASSWORD   an app login that may read the data,
//     falling back to REPORT_LOGIN_EMAIL / REPORT_LOGIN_PASSWORD (the daily e-mails' login)
//   BACKUP_TIER        daily | weekly | monthly | manual (file name only; default manual)
//   BACKUP_OUT_DIR     where the file goes (default ./backups; --out wins)
//   BACKUP_PAGE_SIZE   documents per page (default 25)
//   FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST   a local emulator (tests)
// Exit code: 0 written (or not configured), 1 failed (nothing written), 2 bad arguments.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const B = require('./bundle.js');
const F = require('./firestore.js');

const TIERS = ['daily', 'weekly', 'monthly', 'manual'];
const MIN_PASSPHRASE_CHARS = 20;

class Refusal extends Error {}

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
// 2026-11-11T23:15:02.123Z → 20261111-231502Z
const stampOf = d => d.toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '').replace('T', '-');
function intIn(v, lo, hi, dflt){
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : dflt;
}
function pickLogin(env, log){
  const pair = (e, p) => !!(env[e] && String(env[e]).trim() && env[p]);
  if(!!env.BACKUP_LOGIN_EMAIL !== !!env.BACKUP_LOGIN_PASSWORD){
    log.warn('Backup login incomplete', 'Only one of BACKUP_LOGIN_EMAIL and BACKUP_LOGIN_PASSWORD is set; it is ignored.');
  }
  if(pair('BACKUP_LOGIN_EMAIL', 'BACKUP_LOGIN_PASSWORD')) return { email: String(env.BACKUP_LOGIN_EMAIL).trim(), password: String(env.BACKUP_LOGIN_PASSWORD), source: 'the backup login (BACKUP_LOGIN_EMAIL)' };
  if(pair('REPORT_LOGIN_EMAIL', 'REPORT_LOGIN_PASSWORD')) return { email: String(env.REPORT_LOGIN_EMAIL).trim(), password: String(env.REPORT_LOGIN_PASSWORD), source: "the daily e-mails' login (REPORT_LOGIN_EMAIL)" };
  return null;
}
// GitHub step outputs and job summary; a failure here never fails a backup
// that is already written.
function ghAppend(file, text, log){
  if(!file) return;
  try{ fs.appendFileSync(file, text); }catch(e){ log.warn('Backup', 'could not write the GitHub step output or summary'); }
}
const ghOutput = (env, pairs, log) => ghAppend(env.GITHUB_OUTPUT, Object.keys(pairs).map(k => k + '=' + pairs[k] + '\n').join(''), log);
const ghSummary = (env, md, log) => ghAppend(env.GITHUB_STEP_SUMMARY, md + '\n', log);
function writeDurable(file, buf){
  const fd = fs.openSync(file, 'w', 0o600);
  try{ fs.writeFileSync(fd, buf); fs.fsyncSync(fd); }finally{ fs.closeSync(fd); }
}

async function backup(env, argv, log, now){
  let outDir = env.BACKUP_OUT_DIR || 'backups';
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(a === '--out' && argv[i + 1]) outDir = argv[++i];
    else if(a.startsWith('--out=')) outDir = a.slice(6);
    else if(a === '--help' || a === '-h'){ log.info('usage: node scripts/backup/run.js [--out DIR]   (see docs/backup.md)'); return 0; }
    else{ log.error('Backup', 'unknown argument: ' + a + '   (usage: node scripts/backup/run.js [--out DIR])'); return 2; }
  }
  const tier = TIERS.includes(env.BACKUP_TIER) ? env.BACKUP_TIER : 'manual';

  // ---- configured? ----
  const passphrase = String(env.BACKUP_PASSPHRASE || '').trim().normalize('NFC');
  const login = pickLogin(env, log);
  const missing = [];
  if(!passphrase) missing.push('BACKUP_PASSPHRASE');
  if(!login) missing.push('BACKUP_LOGIN_EMAIL and BACKUP_LOGIN_PASSWORD (or REPORT_LOGIN_EMAIL and REPORT_LOGIN_PASSWORD)');
  if(missing.length){
    log.warn('Backup not configured', 'The database backup is not configured, so nothing was backed up. Missing repository secret(s): ' + missing.join('; ') + '. See docs/backup.md.');
    ghOutput(env, { configured: 'false' }, log);
    ghSummary(env, '### Database backup: not configured\n\nNothing was backed up. Missing repository secret(s): ' + missing.join('; ') + '. See `docs/backup.md`.', log);
    return 0;
  }
  log.addSecret(passphrase); log.addSecret(login.password); log.addSecret(login.email);
  if(Array.from(passphrase).length < MIN_PASSPHRASE_CHARS){
    // the length itself is not printed: it would say something about the secret
    throw new Refusal('BACKUP_PASSPHRASE is shorter than ' + MIN_PASSPHRASE_CHARS + ' characters. Use a long random one (a password manager can make 30+ characters): the encrypted files can be downloaded by anyone who can see this repository, so the passphrase is their only protection');
  }
  const app = F.appFirebaseConfig();
  const ends = F.endpoints(env);
  const retry = F.retryOptions(env);
  const pageSize = intIn(env.BACKUP_PAGE_SIZE, 1, 300, 25);
  const project = app.projectId;

  log.info('UltraMed database backup (' + tier + ') of project ' + project + ', started ' + now.toISOString());
  if(ends.emulator) log.info('Using the local emulator named by FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST, not the real Firebase.');
  const s = await F.signIn({ identity: ends.identity, apiKey: app.apiKey, email: login.email, password: login.password, retry, log: log.info });
  log.addSecret(s.idToken); log.addSecret(s.refreshToken);
  log.info('Signed in with ' + login.source + '.');

  // ---- read every document, all pages at one instant ----
  // The read time comes from Google's clock (the sign-in answer's Date
  // header), 10 s back, so it is never "in the future" for Firestore.
  let readTime = new Date(Math.floor(((s.serverTime || now.getTime()) - 10000) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  const listOpts = {
    firestore: ends.firestore, project, collection: 'state', idToken: s.idToken, pageSize, retry, log: log.info,
    onPage: (page, n, total) => log.info('  page ' + page + ': ' + plural(n, 'document') + ' (' + total + ' so far)'),
  };
  log.info('Reading every document of "state", ' + pageSize + ' per page, as of ' + readTime + ' ...');
  let listed;
  try{
    listed = await F.listCollection(Object.assign({}, listOpts, { readTime }));
  }catch(e){
    if(!(e instanceof F.ApiError) || e.status !== 400 || e.page !== 1) throw e;
    log.warn('Backup read time refused', 'Firestore refused a fixed read time (' + e.message + '). Reading each page as it is now instead: a save made during these seconds could be caught half-way.');
    readTime = null;
    listed = await F.listCollection(listOpts);
  }
  const docs = listed.docs;
  log.info('Listed ' + plural(docs.size, 'document') + ' in ' + plural(listed.pages, 'page') + '.');
  if(!docs.size) throw new Refusal('the "state" collection listed no documents: refusing to write an empty backup (may this login read the data?)');
  try{
    const n = await F.countCollection({ firestore: ends.firestore, project, collection: 'state', idToken: s.idToken, readTime, retry, log: log.info });
    if(n !== docs.size) throw new Refusal('Firestore counts ' + n + ' documents in "state" but the listing returned ' + docs.size + ': refusing to write an incomplete backup');
    log.info('Count check: Firestore counts ' + n + ' documents in "state"; the listing is complete.');
  }catch(e){
    if(e instanceof Refusal) throw e;
    log.warn('Backup count check skipped', 'Could not cross-check the number of documents (' + e.message + '); this backup relies on the listing alone.');
  }

  // ---- bundle → gzip → AES-256-GCM, in memory ----
  const createdAt = now.toISOString();
  const built = B.buildBundle({ docs, project, createdAt, readTime, tier });
  log.info('Data: ' + plural(built.count, 'document') + ', ' + B.formatBytes(built.manifest.total.bytes) + ', sha256 ' + built.sha256);
  log.info(B.prefixTable(built.manifest));
  const fileBuf = B.encryptBundle(built.plaintext, passphrase, { createdAt, project, tier });

  // ---- write, then prove the file opens again before keeping it ----
  fs.mkdirSync(outDir, { recursive: true });
  const name = 'ultramed-state-' + tier + '-' + stampOf(now) + '.umbackup';
  const file = path.resolve(outDir, name);
  const tmp = file + '.partial';
  try{
    writeDurable(tmp, fileBuf);
    const again = B.decryptBackup(fs.readFileSync(tmp), passphrase).plaintext;
    const chk = B.checkBundle(again);
    if(!chk.ok || chk.sha256 !== built.sha256 || !again.equals(built.plaintext)) throw new Error('the written file does not decrypt back to the same data');
    fs.renameSync(tmp, file);
  }catch(e){
    try{ fs.unlinkSync(tmp); }catch(_){}
    throw new Error('self-check failed: ' + e.message);
  }
  const fileSha = B.sha256hex(fileBuf);
  log.info('Checked: the file decrypts again with the passphrase and holds the same ' + plural(built.count, 'document') + '.');
  log.info('Saved ' + file + ' (' + B.formatBytes(fileBuf.length) + ', encrypted; file sha256 ' + fileSha + ').');
  ghOutput(env, { configured: 'true', file, name, stamp: stampOf(now), count: String(built.count) }, log);
  const rows = Object.keys(built.manifest.prefixes).map(p => '| `' + p + '` | ' + built.manifest.prefixes[p].count + ' | ' + B.formatBytes(built.manifest.prefixes[p].bytes) + ' |');
  ghSummary(env, [
    '### Database backup: done (' + tier + ')', '',
    '| | |', '|---|---|',
    '| File | `' + name + '` (' + B.formatBytes(fileBuf.length) + ', AES-256-GCM) |',
    '| Documents | ' + built.count + ' (' + B.formatBytes(built.manifest.total.bytes) + ' of data) |',
    '| Read as of | ' + (readTime || 'each page as it was read') + ' |',
    '| Data sha256 | `' + built.sha256 + '` |',
    '| File sha256 | `' + fileSha + '` |', '',
    '| prefix | documents | size |', '|---|---:|---:|',
  ].concat(rows).join('\n'), log);
  return 0;
}

async function main(o){
  o = o || {};
  const env = o.env || process.env;
  const log = F.makeLogger({ out: o.out, err: o.err, github: env.GITHUB_ACTIONS === 'true' });
  try{
    return await backup(env, o.argv || process.argv.slice(2), log, o.now ? o.now() : new Date());
  }catch(e){
    log.error('Backup failed', ((e && e.message) || String(e)) + '. No backup file was written.');
    return 1;
  }
}

if(require.main === module){
  main().then(code => { process.exitCode = code; }, e => {
    process.stderr.write('Backup failed: ' + F.scrub((e && e.message) || e) + '\n');
    process.exitCode = 1;
  });
}
module.exports = { main, stampOf };
