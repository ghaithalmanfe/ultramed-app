// UltraMed Field Ops — independent database backup: the bundle and its
// encryption. Pure (no network); used by run.js (make), verify.js (check,
// decrypt) and restore.js (read). See docs/backup.md.
//
// The bundle (plaintext JSON, never written by run.js):
//   { format, version, createdAt, project, database, collection, readTime,
//     tier, count, manifest: {measure, total, prefixes: {prefix: {count, bytes}}},
//     sha256Of, sha256, keys: { <document id>: {createTime, updateTime, fields} } }
//   `fields` is the document exactly as Firestore stores it (REST typed JSON),
//   so `fields.value.stringValue` is the app's value string, never parsed.
//   `sha256` = sha256 of JSON.stringify(keys).
//
// The file (.umbackup):
//   "UMBACKUP" (8 bytes) | header length (uint32 big-endian) | header (JSON, UTF-8)
//   | AES-256-GCM ciphertext of gzip(bundle) | GCM tag (16 bytes)
// Magic, length and header are the GCM additional data, so changing any byte
// of the file, header included, makes decryption fail. The key comes from
// scrypt(passphrase, random salt): 64 bytes, 32 for AES and 32 for a key
// check (HMAC) kept in the header, so a wrong passphrase is told apart from a
// damaged file. Salt and IV are random for every file.
'use strict';
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const MAGIC = Buffer.from('UMBACKUP', 'ascii');
const FORMAT = 'ultramed-state-backup';
const VERSION = 1;
// OWASP's minimum for scrypt: N=2^17, r=8, p=1 (128 MiB, about half a second).
const DEFAULT_KDF = { N: 2 ** 17, r: 8, p: 1 };
const KEY_CHECK_LABEL = 'UMBACKUP v1 key check';
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_PLAINTEXT_BYTES = 2 ** 31 - 1;
const MANIFEST_MEASURE = "UTF-8 bytes of each document's fields as JSON";

class BackupError extends Error {
  constructor(code, message){ super(message); this.code = code; }
}

function sha256hex(data){ return crypto.createHash('sha256').update(data).digest('hex'); }

// JSON.parse that never repeats the text in its error: Node's SyntaxError
// quotes a piece of the input, and here the input is the team's data.
function parseJSON(text, what){
  try{ return JSON.parse(text); }
  catch(e){ throw new BackupError('BAD_JSON', what + ' is not valid JSON'); }
}

// Own property even for a name such as "__proto__" (prototype-safe keys).
function setOwn(obj, key, value){
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

// Stable JSON for comparing two values: object keys sorted (Firestore may
// return a map's fields in another order than they were written).
function canonicalJSON(v){
  if(Array.isArray(v)) return '[' + v.map(canonicalJSON).join(',') + ']';
  if(isPlainObject(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

// Firestore orders document ids by their UTF-8 bytes; the bundle does too.
function compareIds(a, b){ return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')); }

// The group a document id belongs to in the manifest and the printed tables:
// "erpRows:sep:3:0" → "erpRows:", "snap_2026-11-10" → "snap_", "clinics" →
// "clinics". Only letters and digits make a prefix; anything else is
// "(other)", so a printed prefix can never carry more than a key's name.
function keyPrefix(id){
  const m = /^([A-Za-z0-9]+)([:_])/.exec(id);
  if(m) return m[1] + m[2];
  if(/^[A-Za-z0-9]+$/.test(id)) return id;
  return '(other)';
}
function fieldsBytes(fields){ return Buffer.byteLength(JSON.stringify(fields || {}), 'utf8'); }

function buildManifest(keys){
  const acc = new Map();
  let count = 0, bytes = 0;
  for(const id of Object.keys(keys)){
    const p = keyPrefix(id), b = fieldsBytes(keys[id] && keys[id].fields);
    const cur = acc.get(p) || { count: 0, bytes: 0 };
    cur.count++; cur.bytes += b; acc.set(p, cur);
    count++; bytes += b;
  }
  const prefixes = {};
  Array.from(acc.keys()).sort().forEach(p => setOwn(prefixes, p, acc.get(p)));
  return { measure: MANIFEST_MEASURE, total: { count, bytes }, prefixes };
}

// docs: Map(id → {createTime, updateTime, fields}). Returns the plaintext
// bundle as bytes (keys last, so the summary reads first) and its checksum.
function buildBundle({ docs, project, createdAt, readTime, tier, database, collection }){
  const ids = Array.from(docs.keys()).sort(compareIds);
  const keys = {};
  for(const id of ids){
    const d = docs.get(id) || {};
    setOwn(keys, id, { createTime: d.createTime || null, updateTime: d.updateTime || null, fields: d.fields || {} });
  }
  const keysJson = JSON.stringify(keys);
  const sha256 = sha256hex(keysJson);
  const manifest = buildManifest(keys);
  const head = {
    format: FORMAT, version: VERSION, createdAt, project,
    database: database || '(default)', collection: collection || 'state',
    readTime: readTime || null, tier: tier || null, count: ids.length,
    manifest, sha256Of: 'JSON.stringify(keys)', sha256,
  };
  const headJson = JSON.stringify(head);
  const text = headJson.slice(0, -1) + ',"keys":' + keysJson + '}';
  return { plaintext: Buffer.from(text, 'utf8'), sha256, manifest, count: ids.length };
}

function passphraseBytes(passphrase){
  // Spaces or a line break at either end are ignored (a secret pasted with
  // a trailing newline still opens the files); Unicode is NFC-normalized so
  // the same passphrase typed on another computer gives the same key.
  return Buffer.from(String(passphrase == null ? '' : passphrase).trim().normalize('NFC'), 'utf8');
}
function checkKdf(kdf){
  const ok = kdf && kdf.name === 'scrypt' && Number.isInteger(kdf.N) && kdf.N >= 2 ** 14 && kdf.N <= 2 ** 20 && (kdf.N & (kdf.N - 1)) === 0
    && Number.isInteger(kdf.r) && kdf.r >= 1 && kdf.r <= 32 && Number.isInteger(kdf.p) && kdf.p >= 1 && kdf.p <= 16
    && kdf.dkLen === 64 && 128 * kdf.N * kdf.r <= 2 ** 30;
  if(!ok) throw new BackupError('UNSUPPORTED', 'the file asks for key settings this tool does not accept');
}
function deriveKeys(passphrase, salt, kdf){
  checkKdf(kdf);
  const dk = crypto.scryptSync(passphraseBytes(passphrase), salt, 64, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 128 * kdf.N * kdf.r + 32 * 1024 * 1024 });
  const encKey = dk.subarray(0, 32);
  const check = crypto.createHmac('sha256', dk.subarray(32, 64)).update(KEY_CHECK_LABEL).digest().subarray(0, 16);
  return { encKey, check };
}

// plaintext: Buffer. meta: {createdAt, project, tier} shown in the clear
// header (authenticated, not secret). kdfParams only for tests (cheaper key).
function encryptBundle(plaintext, passphrase, meta, kdfParams){
  if(!passphraseBytes(passphrase).length) throw new BackupError('NO_PASSPHRASE', 'no passphrase');
  meta = meta || {};
  const kdf = Object.assign({ name: 'scrypt', dkLen: 64 }, DEFAULT_KDF, kdfParams || {});
  const salt = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const { encKey, check } = deriveKeys(passphrase, salt, kdf);
  const header = {
    format: FORMAT, version: VERSION,
    createdAt: meta.createdAt || null, project: meta.project || null, tier: meta.tier || null,
    kdf: { name: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, dkLen: 64, salt: salt.toString('base64') },
    cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), tagBytes: 16 },
    keyCheck: check.toString('base64'),
    compression: 'gzip',
  };
  const headerBuf = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32BE(headerBuf.length, 0);
  const aad = Buffer.concat([MAGIC, len, headerBuf]);
  const gz = zlib.gzipSync(plaintext, { level: 9 });
  const c = crypto.createCipheriv('aes-256-gcm', encKey, iv, { authTagLength: 16 });
  c.setAAD(aad);
  const body = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([aad, body, c.getAuthTag()]);
}

function isBackupFile(buf){ return Buffer.isBuffer(buf) && buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC); }
// GitHub hands an artifact over as a .zip holding the .umbackup file.
function isZip(buf){ return Buffer.isBuffer(buf) && buf.length >= 4 && buf.readUInt32BE(0) === 0x504B0304; }
const ZIP_HINT = 'this is a .zip file: unzip the downloaded artifact first (it holds one .umbackup file)';

// The clear header, without the passphrase (what the file says it is).
function readHeader(buf){
  if(isZip(buf)) throw new BackupError('NOT_A_BACKUP', ZIP_HINT);
  if(!isBackupFile(buf)) throw new BackupError('NOT_A_BACKUP', 'this is not an UltraMed backup file (.umbackup)');
  if(buf.length < 12) throw new BackupError('DAMAGED', 'the file is damaged or incomplete');
  const hlen = buf.readUInt32BE(8);
  if(hlen < 2 || hlen > MAX_HEADER_BYTES || buf.length < 12 + hlen + 16) throw new BackupError('DAMAGED', 'the file is damaged or incomplete');
  let header;
  try{ header = parseJSON(buf.subarray(12, 12 + hlen).toString('utf8'), 'the file header'); }
  catch(e){ throw new BackupError('DAMAGED', 'the file header is damaged'); }
  if(!isPlainObject(header) || header.format !== FORMAT) throw new BackupError('DAMAGED', 'the file header is damaged');
  if(header.version !== VERSION) throw new BackupError('UNSUPPORTED', 'this backup was made by a newer version of the tool (format ' + String(header.version).slice(0, 10) + ')');
  const c = header.cipher, k = header.kdf;
  if(!isPlainObject(c) || c.name !== 'aes-256-gcm' || c.tagBytes !== 16 || typeof c.iv !== 'string'
    || !isPlainObject(k) || typeof k.salt !== 'string' || typeof header.keyCheck !== 'string' || header.compression !== 'gzip'){
    throw new BackupError('DAMAGED', 'the file header is damaged');
  }
  const iv = Buffer.from(c.iv, 'base64'), salt = Buffer.from(k.salt, 'base64'), keyCheck = Buffer.from(header.keyCheck, 'base64');
  if(iv.length !== 12 || salt.length < 16 || keyCheck.length !== 16) throw new BackupError('DAMAGED', 'the file header is damaged');
  return { header, iv, salt, keyCheck, aad: buf.subarray(0, 12 + hlen), body: buf.subarray(12 + hlen, buf.length - 16), tag: buf.subarray(buf.length - 16) };
}

// → { header, plaintext } or throws BackupError WRONG_PASSPHRASE / DAMAGED / …
function decryptBackup(buf, passphrase){
  const h = readHeader(buf);
  const { encKey, check } = deriveKeys(passphrase, h.salt, h.header.kdf);
  if(!crypto.timingSafeEqual(check, h.keyCheck)){
    throw new BackupError('WRONG_PASSPHRASE', 'wrong passphrase: this file was not made with this BACKUP_PASSPHRASE (or its header was changed)');
  }
  let gz;
  try{
    const d = crypto.createDecipheriv('aes-256-gcm', encKey, h.iv, { authTagLength: 16 });
    d.setAAD(h.aad); d.setAuthTag(h.tag);
    gz = Buffer.concat([d.update(h.body), d.final()]);
  }catch(e){
    throw new BackupError('DAMAGED', 'the file was changed or damaged after it was made (authentication failed): do not trust it');
  }
  let plaintext;
  try{ plaintext = zlib.gunzipSync(gz, { maxOutputLength: MAX_PLAINTEXT_BYTES }); }
  catch(e){ throw new BackupError('DAMAGED', 'the decrypted data could not be decompressed'); }
  return { header: h.header, plaintext };
}

// Checks a plaintext bundle: structure, count, sha256 and manifest.
// → { ok, problems: [..], bundle, sha256, manifest, count }
function checkBundle(plaintext){
  const problems = [];
  let text = Buffer.isBuffer(plaintext) ? plaintext.toString('utf8') : String(plaintext);
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let bundle;
  try{ bundle = parseJSON(text, 'the backup contents'); }
  catch(e){ return { ok: false, problems: ['the contents are not valid JSON'], bundle: null }; }
  if(!isPlainObject(bundle) || bundle.format !== FORMAT){
    return { ok: false, problems: ['this is not an UltraMed state backup bundle'], bundle: null };
  }
  if(bundle.version !== VERSION) problems.push('unsupported bundle version');
  const keys = bundle.keys;
  if(!isPlainObject(keys)) return { ok: false, problems: problems.concat(['the bundle has no documents section']), bundle };
  const ids = Object.keys(keys);
  const bad = ids.filter(id => !isPlainObject(keys[id]) || !isPlainObject(keys[id].fields)).length;
  if(bad) problems.push(bad + ' document entr' + (bad === 1 ? 'y is' : 'ies are') + ' malformed');
  if(bundle.count !== ids.length) problems.push('the bundle says ' + bundle.count + ' documents but holds ' + ids.length);
  const sha256 = sha256hex(JSON.stringify(keys));
  if(bundle.sha256 !== sha256) problems.push('the checksum (sha256) does not match the documents');
  const manifest = bad ? null : buildManifest(keys);
  if(manifest && canonicalJSON(manifest) !== canonicalJSON(bundle.manifest)) problems.push('the manifest (per-prefix counts and sizes) does not match the documents');
  if(typeof bundle.project !== 'string' || !bundle.project) problems.push('the bundle does not name its project');
  return { ok: problems.length === 0, problems, bundle, sha256, manifest, count: ids.length };
}

function formatBytes(n){
  if(n < 1024) return n + ' B';
  if(n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if(n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
// Printable per-prefix table (counts and sizes only, never a value).
function prefixTable(manifest, indent){
  indent = indent || '  ';
  const rows = Object.keys(manifest.prefixes).map(p => [p, String(manifest.prefixes[p].count), formatBytes(manifest.prefixes[p].bytes)]);
  rows.push(['total', String(manifest.total.count), formatBytes(manifest.total.bytes)]);
  const w0 = Math.max(6, ...rows.map(r => r[0].length)), w1 = Math.max(9, ...rows.map(r => r[1].length)), w2 = Math.max(4, ...rows.map(r => r[2].length));
  const line = r => indent + r[0].padEnd(w0) + '  ' + r[1].padStart(w1) + '  ' + r[2].padStart(w2);
  return [line(['prefix', 'documents', 'size'])].concat(rows.map(line)).join('\n');
}

module.exports = {
  MAGIC, FORMAT, VERSION, DEFAULT_KDF, BackupError,
  sha256hex, parseJSON, canonicalJSON, compareIds, keyPrefix, buildManifest, buildBundle,
  encryptBundle, decryptBackup, readHeader, isBackupFile, isZip, ZIP_HINT, checkBundle, formatBytes, prefixTable, setOwn, hasOwn,
};
