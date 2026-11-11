// node scripts/backup/verify.js <backup.umbackup> [--out <bundle.json>]
//
// UltraMed Field Ops — checks one encrypted backup made by run.js: decrypts
// it with the passphrase (BACKUP_PASSPHRASE, or typed at the prompt without
// showing), checks the GCM tag, the data's sha256 and the manifest, and
// prints the counts and sizes per key prefix — never a value. With --out it
// also writes the decrypted bundle (exactly the bytes run.js encrypted) to a
// NEW local file, for restore.js into a SEPARATE project. That file is the
// whole database in clear text: it is refused inside this repository (which
// is public) and is created readable by you only. See docs/backup.md.
//
// Exit code: 0 the backup is sound, 1 it is not (wrong passphrase, damaged,
// inconsistent), 2 bad arguments or refused.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const B = require('./bundle.js');
const F = require('./firestore.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// Reads a line from the terminal without echoing it.
function askHidden(question, stdin, err){
  return new Promise((resolve, reject) => {
    err.write(question);
    const wasRaw = !!stdin.isRaw;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let buf = '';
    const finish = (fn, v) => { stdin.removeListener('data', onData); stdin.setRawMode(wasRaw); stdin.pause(); err.write('\n'); fn(v); };
    const onData = chunk => {
      for(const ch of chunk){
        if(ch === '\r' || ch === '\n' || ch === '\u0004') return finish(resolve, buf);
        if(ch === '\u0003') return finish(reject, new Error('cancelled'));
        if(ch === '\u007f' || ch === '\b'){ buf = Array.from(buf).slice(0, -1).join(''); continue; }
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}
// BACKUP_PASSPHRASE, else the terminal; null when neither is available.
async function getPassphrase(env, o){
  o = o || {};
  if(env.BACKUP_PASSPHRASE && String(env.BACKUP_PASSPHRASE).trim()) return String(env.BACKUP_PASSPHRASE);
  const stdin = o.stdin || process.stdin;
  if(!stdin || !stdin.isTTY || typeof stdin.setRawMode !== 'function') return null;
  const p = await askHidden('Backup passphrase (not shown): ', stdin, o.err || process.stderr);
  return p && p.trim() ? p : null;
}
// Is `file` (to be created) inside this repository? Symlinks resolved.
function insideRepo(file){
  const dir = fs.realpathSync(path.dirname(path.resolve(file)));
  const root = fs.realpathSync(REPO_ROOT);
  return dir === root || dir.startsWith(root + path.sep);
}
function describeHeader(h){
  return 'made ' + (h.createdAt || '?') + ' from project ' + (h.project || '?') + (h.tier ? ' (' + h.tier + ')' : '')
    + '; scrypt N=' + h.kdf.N + ' r=' + h.kdf.r + ' p=' + h.kdf.p + ', AES-256-GCM';
}

async function verify(argv, env, log, io){
  let file = null, out = null;
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(a === '--out' && argv[i + 1]) out = argv[++i];
    else if(a.startsWith('--out=')) out = a.slice(6);
    else if(a === '--help' || a === '-h'){ log.info('usage: node scripts/backup/verify.js <backup.umbackup> [--out <bundle.json>]'); return 0; }
    else if(a.startsWith('-')){ log.error('Verify', 'unknown option ' + a); return 2; }
    else if(!file) file = a;
    else{ log.error('Verify', 'only one backup file at a time'); return 2; }
  }
  if(!file){ log.error('Verify', 'usage: node scripts/backup/verify.js <backup.umbackup> [--out <bundle.json>]'); return 2; }
  if(out){
    try{
      if(insideRepo(out)){ log.error('Verify', 'refusing to write the decrypted bundle inside the repository folder: it is public, and the bundle is the whole database in clear text. Choose a folder outside it.'); return 2; }
    }catch(e){ log.error('Verify', 'the folder for --out does not exist'); return 2; }
    if(fs.existsSync(out)){ log.error('Verify', out + ' already exists; choose a new file name (nothing is overwritten)'); return 2; }
  }
  let buf;
  try{ buf = fs.readFileSync(file); }catch(e){ log.error('Verify', 'cannot read ' + file + ' (' + (e.code || 'error') + ')'); return 2; }
  let head;
  try{ head = B.readHeader(buf).header; }
  catch(e){ log.error('Backup NOT sound', path.basename(file) + ': ' + e.message); return 1; }
  log.info('Backup file: ' + path.basename(file) + ' (' + B.formatBytes(buf.length) + ', file sha256 ' + B.sha256hex(buf) + ')');
  log.info('  ' + describeHeader(head));

  const passphrase = await getPassphrase(env, io);
  if(!passphrase){ log.error('Verify', 'no passphrase: set BACKUP_PASSPHRASE or run this in a terminal to type it'); return 2; }
  log.addSecret(passphrase);
  let plaintext;
  try{ plaintext = B.decryptBackup(buf, passphrase).plaintext; }
  catch(e){ log.error('Backup NOT sound', e.message); return 1; }
  log.info('Decrypted: the passphrase is right and the file is exactly as it was made (AES-256-GCM tag checked).');
  const chk = B.checkBundle(plaintext);
  if(!chk.ok){ log.error('Backup NOT sound', 'decrypted, but ' + chk.problems.join('; ')); return 1; }
  const b = chk.bundle;
  log.info('Data checksum: sha256 ' + chk.sha256 + ' matches.');
  log.info('Manifest: matches. ' + plural(chk.count, 'document') + ', ' + B.formatBytes(chk.manifest.total.bytes) + ' of data, read from "' + b.collection + '" of ' + b.project + ' as of ' + (b.readTime || 'each page as it was read (no fixed read time)') + '.');
  log.info(B.prefixTable(chk.manifest));
  if(out){
    try{ fs.writeFileSync(out, plaintext, { flag: 'wx', mode: 0o600 }); }
    catch(e){ log.error('Verify', 'could not write ' + out + ' (' + (e.code || 'error') + ')'); return 2; }
    log.info('Wrote the decrypted bundle to ' + out + ' (' + B.formatBytes(plaintext.length) + '). It is the whole database in clear text: keep it private and delete it when you are done.');
  }
  log.info('The backup is sound.');
  return 0;
}

async function main(o){
  o = o || {};
  const env = o.env || process.env;
  const log = F.makeLogger({ out: o.out, err: o.err });
  try{ return await verify(o.argv || process.argv.slice(2), env, log, { stdin: o.stdin, err: o.err }); }
  catch(e){ log.error('Verify failed', (e && e.message) || String(e)); return 1; }
}

if(require.main === module){
  main().then(code => { process.exitCode = code; }, e => {
    process.stderr.write('Verify failed: ' + F.scrub((e && e.message) || e) + '\n');
    process.exitCode = 1;
  });
}
module.exports = { main, getPassphrase, insideRepo };
