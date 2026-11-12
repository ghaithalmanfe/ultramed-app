// RESTORE_PROJECT_ID=<target> RESTORE_API_KEY=<its web API key> \
// RESTORE_LOGIN_EMAIL=<a login of the target> RESTORE_LOGIN_PASSWORD=<…> \
//   node scripts/backup/restore.js <bundle.json | backup.umbackup> [options]
//
// UltraMed Field Ops — writes a backup's documents into the `state`
// collection of a SEPARATE Firebase project, given only by explicit
// RESTORE_* variables (never the production config, never the backup or
// report logins). The input is the bundle verify.js --out wrote, or the
// encrypted file itself (decrypted in memory with BACKUP_PASSPHRASE, or the
// passphrase typed at the prompt). Every document is written whole, exactly
// as stored, then the target is read back and compared document by document.
//
//   --dry-run   check everything and say what would be written; write nothing
//   --force     the target already has documents: replace those with the same
//               names (the others are left as they are)
//   --only=a,b  only these documents; a name ending in ":" or "_" is a prefix
//               (--only=clinics,visitsArch:)
//   --i-understand-this-overwrites-production
//               needed when the target is the production project (or the
//               project the backup came from); with --force, since it is not empty
//
// Refuses (exit 2) production without that flag, a non-empty target without
// --force, missing configuration. Exit 1: the backup does not check out, or
// the restore failed or did not read back identical. Exit 0: restored and
// every document read back identical. See docs/backup.md.
'use strict';
const fs = require('node:fs');
const B = require('./bundle.js');
const F = require('./firestore.js');
const { getPassphrase } = require('./verify.js');

const PROD_FLAG = '--i-understand-this-overwrites-production';
const USAGE = 'usage: RESTORE_PROJECT_ID=… RESTORE_API_KEY=… RESTORE_LOGIN_EMAIL=… RESTORE_LOGIN_PASSWORD=… node scripts/backup/restore.js <bundle.json | backup.umbackup> [--dry-run] [--force] [--only=a,b] [' + PROD_FLAG + ']';
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

function parseArgs(argv){
  const a = { file: null, force: false, dryRun: false, prod: false, only: null, help: false };
  for(let i = 0; i < argv.length; i++){
    const x = argv[i];
    if(x === '--force') a.force = true;
    else if(x === '--dry-run') a.dryRun = true;
    else if(x === PROD_FLAG) a.prod = true;
    else if(x === '--only' && argv[i + 1]) a.only = argv[++i];
    else if(x.startsWith('--only=')) a.only = x.slice(7);
    else if(x === '--help' || x === '-h') a.help = true;
    else if(x.startsWith('-')) return { error: 'unknown option ' + x };
    else if(!a.file) a.file = x;
    else return { error: 'only one input file' };
  }
  if(a.only != null){
    a.only = a.only.split(',').map(s => s.trim()).filter(Boolean);
    if(!a.only.length) return { error: '--only needs at least one document name' };
  }
  return a;
}
const matchesOnly = (id, only) => only.some(s => id === s || (/[:_]$/.test(s) && id.startsWith(s)));

async function restore(argv, env, log, io){
  const a = parseArgs(argv);
  if(a.error){ log.error('Restore', a.error + '\n' + USAGE); return 2; }
  if(a.help){ log.info(USAGE); return 0; }

  // ---- 1. production guard, before anything is read or contacted ----
  const app = F.appFirebaseConfig();
  const target = String(env.RESTORE_PROJECT_ID || '').trim();
  if(!target){ log.error('Restore', 'RESTORE_PROJECT_ID is not set: name the project to restore INTO (a separate project, never production).\n' + USAGE); return 2; }
  const prodIds = [F.PROD_PROJECT, app.projectId].map(s => s.toLowerCase());
  const targetIsProd = prodIds.includes(target.toLowerCase());
  const keyIsProd = String(env.RESTORE_API_KEY || '').trim() === app.apiKey;
  if((targetIsProd || keyIsProd) && !a.prod){
    log.error('Restore refused', (targetIsProd ? 'the target project ' + target + ' is PRODUCTION' : "RESTORE_API_KEY is the production app's key (it signs in to production)")
      + '. Restore into a separate project. To really overwrite production add ' + PROD_FLAG + ' (and --force: production is not empty).');
    return 2;
  }
  if(targetIsProd || keyIsProd) log.warn('PRODUCTION', 'writing into the PRODUCTION project, as ' + PROD_FLAG + ' asks.');
  const need = ['RESTORE_API_KEY', 'RESTORE_LOGIN_EMAIL', 'RESTORE_LOGIN_PASSWORD'].filter(k => !String(env[k] || '').trim());
  if(need.length){ log.error('Restore', 'not set: ' + need.join(', ') + ' (the target project\'s web API key and a login of that project).\n' + USAGE); return 2; }
  if(!a.file){ log.error('Restore', USAGE); return 2; }
  const email = String(env.RESTORE_LOGIN_EMAIL).trim(), password = String(env.RESTORE_LOGIN_PASSWORD), apiKey = String(env.RESTORE_API_KEY).trim();
  log.addSecret(password); log.addSecret(email);

  // ---- 2. the backup, checked ----
  let buf;
  try{ buf = fs.readFileSync(a.file); }catch(e){ log.error('Restore', 'cannot read ' + a.file + ' (' + (e.code || 'error') + ')'); return 2; }
  let plaintext = buf;
  if(B.isZip(buf)){ log.error('Restore', B.ZIP_HINT); return 2; }
  if(B.isBackupFile(buf)){
    const passphrase = await getPassphrase(env, io);
    if(!passphrase){ log.error('Restore', 'the input is encrypted: set BACKUP_PASSPHRASE or run this in a terminal to type it'); return 2; }
    log.addSecret(passphrase);
    try{ plaintext = B.decryptBackup(buf, passphrase).plaintext; }
    catch(e){ log.error('Restore', 'the backup does not open: ' + e.message); return 1; }
  }
  const chk = B.checkBundle(plaintext);
  if(!chk.ok){ log.error('Restore', 'the backup does not check out: ' + chk.problems.join('; ')); return 1; }
  const bundle = chk.bundle;
  if(String(bundle.project).toLowerCase() === target.toLowerCase() && !a.prod){
    log.error('Restore refused', 'this backup was taken from ' + target + ' itself: restoring it there overwrites the live data. Add ' + PROD_FLAG + ' (and --force) if that is really what you want.');
    return 2;
  }
  let ids = Object.keys(bundle.keys);
  if(a.only){
    ids = ids.filter(id => matchesOnly(id, a.only));
    if(!ids.length){ log.error('Restore', 'nothing in the backup matches --only'); return 2; }
  }
  const selected = {};
  ids.forEach(id => B.setOwn(selected, id, bundle.keys[id]));
  log.info('Backup: made ' + bundle.createdAt + ' from ' + bundle.project + ', ' + plural(chk.count, 'document') + ', sha256 and manifest check out.');
  log.info((a.dryRun ? 'Would restore ' : 'Restoring ') + plural(ids.length, 'document') + (a.only ? ' (--only)' : '') + ' into project ' + target + ':');
  log.info(B.prefixTable(B.buildManifest(selected)));

  // ---- 3. the target: signed in, and empty unless --force ----
  const ends = F.endpoints(env);
  const retry = F.retryOptions(env);
  if(ends.emulator) log.info('Using the local emulator named by FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST.');
  const s = await F.signIn({ identity: ends.identity, apiKey, email, password, retry, log: log.info });
  log.addSecret(s.idToken); log.addSecret(s.refreshToken);
  const probe = await F.requestJSON(Object.assign({}, retry, {
    url: F.docsRoot(ends.firestore, target) + '/state?pageSize=1',
    headers: { authorization: 'Bearer ' + s.idToken }, label: 'checking the target', log: log.info,
  }));
  const nonEmpty = !!(probe.json && Array.isArray(probe.json.documents) && probe.json.documents.length);
  if(nonEmpty && !a.force){
    log.error('Restore refused', 'the target project ' + target + ' already has documents in "state": refusing to write over them. Use an empty project, or add --force to replace the documents that have the same names (the others are left as they are).');
    return 2;
  }
  if(nonEmpty) log.warn('Target not empty', '--force: documents with the same names are replaced; the others are left as they are.');
  else log.info('The target is empty.');
  if(a.dryRun){ log.info('Dry run: nothing was written.'); return 0; }

  // ---- 4. write, whole documents, in atomic batches ----
  const writes = ids.map(id => ({ id, name: F.docName(target, 'state', id), fields: bundle.keys[id].fields }));
  const batches = F.planBatches(writes);
  let done = 0;
  for(let i = 0; i < batches.length; i++){
    try{
      await F.commitDocs({ firestore: ends.firestore, project: target, idToken: s.idToken, writes: batches[i], mustNotExist: !a.force,
        label: 'batch ' + (i + 1) + ' of ' + batches.length, retry, log: log.info });
    }catch(e){
      const appeared = !a.force && (e.code === 'ALREADY_EXISTS' || e.code === 'FAILED_PRECONDITION') ? ' (a document appeared in the target meanwhile)' : '';
      log.error('Restore stopped', e.message + appeared + '. ' + done + ' of ' + writes.length + ' documents had been written'
        + (done ? '; the target now holds a partial copy: run again with --force to finish' : '') + '.');
      return 1;
    }
    done += batches[i].length;
    log.info('  batch ' + (i + 1) + ' of ' + batches.length + ': ' + plural(batches[i].length, 'document') + ' (' + done + ' of ' + writes.length + ')');
  }

  // ---- 5. read everything back and compare ----
  const back = await F.listCollection({ firestore: ends.firestore, project: target, collection: 'state', idToken: s.idToken,
    pageSize: Number(env.BACKUP_PAGE_SIZE) > 0 ? Math.min(300, Math.floor(Number(env.BACKUP_PAGE_SIZE))) : 10, retry, log: log.info });
  let same = 0, differ = 0, missing = 0;
  for(const w of writes){
    const d = back.docs.get(w.id);
    if(!d) missing++;
    else if(B.canonicalJSON(d.fields) === B.canonicalJSON(w.fields)) same++;
    else differ++;
  }
  const others = Array.from(back.docs.keys()).filter(id => !B.hasOwn(selected, id)).length;
  if(missing || differ){
    log.error('Restore NOT complete', 'read back ' + writes.length + ' documents: ' + missing + ' missing, ' + differ + ' different from the backup.');
    return 1;
  }
  log.info('Read back: all ' + plural(same, 'restored document') + ' are identical to the backup.'
    + (others ? ' ' + plural(others, 'other document') + ' in the target ' + (others === 1 ? 'was' : 'were') + ' left as ' + (others === 1 ? 'it was' : 'they were') + '.' : ''));
  return 0;
}

async function main(o){
  o = o || {};
  const env = o.env || process.env;
  const log = F.makeLogger({ out: o.out, err: o.err });
  try{ return await restore(o.argv || process.argv.slice(2), env, log, { stdin: o.stdin, err: o.err }); }
  catch(e){ log.error('Restore failed', (e && e.message) || String(e)); return 1; }
}

if(require.main === module){
  main().then(code => { process.exitCode = code; }, e => {
    process.stderr.write('Restore failed: ' + F.scrub((e && e.message) || e) + '\n');
    process.exitCode = 1;
  });
}
module.exports = { main, parseArgs, PROD_FLAG };
