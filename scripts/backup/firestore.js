// UltraMed Field Ops — independent database backup: talking to Firebase over
// REST (as scripts/daily-report/report.js does): e-mail/password sign-in,
// listing a whole collection page by page, a count cross-check, atomic
// commits for a restore. Every request retries transient errors; nothing
// here prints a value, an e-mail address or a token (the repository and its
// Actions logs are public). See docs/backup.md.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PROD_PROJECT = 'ultramed-field-ops';
const CONFIG_FILE = path.join(__dirname, '..', '..', 'www', 'js', 'app', '01-config.js');

class ConfigError extends Error {}
class ApiError extends Error {
  constructor(message, o){
    super(message);
    o = o || {};
    this.status = o.status || 0; this.code = o.code || ''; this.transient = !!o.transient;
  }
}

// The app's public web config (apiKey, projectId), read from the app itself
// so the backup always follows the project the app syncs with.
function appFirebaseConfig(file){
  const src = fs.readFileSync(file || CONFIG_FILE, 'utf8');
  const block = /FIREBASE_CONFIG\s*=\s*\{([\s\S]*?)\}/.exec(src);
  const pick = k => { const m = block && new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']').exec(block[1]); return m ? m[1] : null; };
  const apiKey = pick('apiKey'), projectId = pick('projectId');
  if(!apiKey || !projectId) throw new ConfigError('could not read apiKey and projectId from www/js/app/01-config.js');
  return { apiKey, projectId };
}

// Real Google endpoints, or a local emulator / fake for tests. The emulator
// variables follow the Firebase Emulator Suite's names, must be set together
// (half real, half local would send a real password to Google while reading
// fake data) and may only point at this computer.
function isLocalHost(hostPort){
  let u;
  try{ u = new URL('http://' + hostPort); }catch(e){ return false; }
  const h = u.hostname;
  return h === 'localhost' || h === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}
function endpoints(env){
  const fsHost = String(env.FIRESTORE_EMULATOR_HOST || '').trim();
  const authHost = String(env.FIREBASE_AUTH_EMULATOR_HOST || '').trim();
  if(!fsHost && !authHost) return { firestore: 'https://firestore.googleapis.com', identity: 'https://identitytoolkit.googleapis.com', emulator: false };
  if(!fsHost || !authHost) throw new ConfigError('FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must be set together, or neither');
  if(!isLocalHost(fsHost) || !isLocalHost(authHost)) throw new ConfigError('the emulator hosts must be on this computer (localhost, 127.0.0.1 or [::1])');
  return { firestore: 'http://' + fsHost, identity: 'http://' + authHost + '/identitytoolkit.googleapis.com', emulator: true };
}

// ---- logging that cannot leak ----
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER_RE = /(Bearer\s+)\S+/gi;
const KEYPARAM_RE = /([?&](?:key|access_token|token|pageToken)=)[^&\s]+/gi;
const APIKEY_RE = /\bAIza[0-9A-Za-z_-]{30,}/g;
function scrub(text, secrets){
  let s = String(text);
  (secrets || []).forEach(v => { v = String(v || ''); if(v.length >= 4) s = s.split(v).join('***'); });
  return s.replace(JWT_RE, '<token>').replace(BEARER_RE, '$1<token>').replace(KEYPARAM_RE, '$1<hidden>')
    .replace(APIKEY_RE, '<api-key>').replace(EMAIL_RE, '<address>');
}
// GitHub workflow commands (::warning:: …) need %, CR and LF escaped.
const ghEscape = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
function makeLogger(o){
  o = o || {};
  const out = o.out || process.stdout, err = o.err || process.stderr;
  const secrets = (o.secrets || []).filter(Boolean).map(String);
  const gh = !!o.github;
  const clean = s => scrub(s, secrets);
  return {
    clean,
    addSecret(v){ if(v) secrets.push(String(v)); },
    info(s){ out.write(clean(s) + '\n'); },
    warn(title, s){ out.write((gh ? '::warning title=' + ghEscape(title) + '::' + ghEscape(clean(s)) : 'WARNING: ' + clean(s)) + '\n'); },
    error(title, s){ err.write((gh ? '::error title=' + ghEscape(title) + '::' + ghEscape(clean(s)) : 'ERROR: ' + clean(s)) + '\n'); },
  };
}

// ---- requests ----
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function retryOptions(env){
  const base = Number(env && env.BACKUP_RETRY_BASE_MS);
  return { attempts: 5, baseDelayMs: Number.isFinite(base) && base >= 0 ? base : 1000, timeoutMs: 120000 };
}
// Google APIs answer errors as {error: {code, message, status}}.
function errorDetail(text){
  let j;
  try{ j = JSON.parse(text); }catch(e){ return { status: '', message: '' }; }
  const e = j && (Array.isArray(j) ? j[0] && j[0].error : j.error);
  if(!e || typeof e !== 'object') return { status: '', message: '' };
  return { status: typeof e.status === 'string' ? e.status.slice(0, 40) : '', message: typeof e.message === 'string' ? e.message.slice(0, 160) : '' };
}
// One JSON request with retries (network errors, timeouts, 408/429/5xx, an
// answer cut short). body may be a function of the attempt number.
async function requestJSON(o){
  const attempts = o.attempts || 5, base = o.baseDelayMs == null ? 1000 : o.baseDelayMs, timeoutMs = o.timeoutMs || 120000;
  let last = null;
  for(let attempt = 1; attempt <= attempts; attempt++){
    let retryAfterMs = 0;
    try{
      const body = typeof o.body === 'function' ? o.body(attempt) : o.body;
      const res = await fetch(o.url, { method: o.method || 'GET', headers: o.headers || {}, body, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      if(res.ok){
        let json, parsed = true;
        try{ json = JSON.parse(text); }catch(e){ parsed = false; }
        if(parsed) return { json, headers: res.headers, status: res.status, attempts: attempt };
        last = new ApiError(o.label + ': the answer was cut short or is not JSON', { status: res.status, transient: true });
      }else{
        const d = errorDetail(text);
        last = new ApiError(o.label + ': HTTP ' + res.status + (d.status ? ' ' + d.status : '') + (d.message ? ' (' + d.message + ')' : ''),
          { status: res.status, code: d.status, transient: TRANSIENT.has(res.status) });
        const ra = Number(res.headers.get('retry-after'));
        if(Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 30000);
      }
    }catch(e){
      const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      const code = e && e.cause && typeof e.cause.code === 'string' ? ' ' + e.cause.code : '';
      last = new ApiError(o.label + ': ' + (timedOut ? 'no answer in time' : 'network error' + code), { transient: true });
    }
    if(!last.transient) break;
    if(attempt < attempts){
      const wait = Math.max(retryAfterMs, base * 2 ** (attempt - 1) + Math.floor(Math.random() * base / 4));
      if(o.log) o.log('  ' + last.message + ': trying again in ' + (wait / 1000).toFixed(1) + ' s (attempt ' + (attempt + 1) + ' of ' + attempts + ')');
      await sleep(wait);
    }
  }
  if(last.transient) last.message += ' (gave up after ' + attempts + ' attempts)';
  throw last;
}

// accounts:signInWithPassword → { idToken, refreshToken, serverTime (ms from the Date header, or null) }
async function signIn(o){
  const r = await requestJSON(Object.assign({}, o.retry, {
    url: o.identity + '/v1/accounts:signInWithPassword?key=' + encodeURIComponent(o.apiKey),
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: o.email, password: o.password, returnSecureToken: true }),
    label: 'sign-in', log: o.log,
  }));
  if(!r.json || typeof r.json.idToken !== 'string' || !r.json.idToken) throw new ApiError('sign-in: the answer holds no token');
  const t = Date.parse(r.headers.get('date') || '');
  return { idToken: r.json.idToken, refreshToken: typeof r.json.refreshToken === 'string' ? r.json.refreshToken : '', serverTime: Number.isFinite(t) ? t : null };
}

const docsRoot = (base, project) => base + '/v1/projects/' + encodeURIComponent(project) + '/databases/(default)/documents';
const docName = (project, collection, id) => 'projects/' + project + '/databases/(default)/documents/' + collection + '/' + id;

// Every document of a collection, page by page (documents.list, whole
// documents: no field mask). With readTime every page is read at the same
// instant, so a save landing during the backup cannot tear it. Any page that
// fails (after retries) fails the whole listing: there is no partial result.
// → { docs: Map(id → {createTime, updateTime, fields}), pages }
async function listCollection(o){
  const collection = o.collection || 'state';
  const prefix = docName(o.project, collection, '');
  const docs = new Map(), tokens = new Set();
  let token = null, page = 0;
  for(;;){
    page++;
    const qs = new URLSearchParams();
    qs.set('pageSize', String(o.pageSize || 25));
    if(token) qs.set('pageToken', token);
    if(o.readTime) qs.set('readTime', o.readTime);
    let r;
    try{
      r = await requestJSON(Object.assign({}, o.retry, {
        url: docsRoot(o.firestore, o.project) + '/' + encodeURIComponent(collection) + '?' + qs,
        headers: { authorization: 'Bearer ' + o.idToken }, label: 'page ' + page, log: o.log,
      }));
    }catch(e){ e.page = page; throw e; }
    const j = r.json;
    const list = j && typeof j === 'object' && !Array.isArray(j) ? (j.documents == null ? [] : j.documents) : null;
    if(!Array.isArray(list)) throw Object.assign(new ApiError('page ' + page + ': unexpected answer'), { page });
    for(const d of list){
      if(!d || typeof d.name !== 'string' || !d.name.startsWith(prefix)) throw Object.assign(new ApiError('page ' + page + ': the answer holds a document outside "' + collection + '"'), { page });
      const id = d.name.slice(prefix.length);
      if(!id || id.includes('/')) throw Object.assign(new ApiError('page ' + page + ': the answer holds a document with an unexpected name'), { page });
      if(docs.has(id)) throw Object.assign(new ApiError('page ' + page + ': a document came twice; the listing is not reliable'), { page });
      if(d.fields != null && (typeof d.fields !== 'object' || Array.isArray(d.fields))) throw Object.assign(new ApiError('page ' + page + ': a document with malformed fields'), { page });
      docs.set(id, { createTime: d.createTime || null, updateTime: d.updateTime || null, fields: d.fields || {} });
    }
    if(o.onPage) o.onPage(page, list.length, docs.size, r.attempts);
    const next = typeof j.nextPageToken === 'string' && j.nextPageToken ? j.nextPageToken : null;
    if(!next) break;
    if(tokens.has(next)) throw Object.assign(new ApiError('page ' + page + ': the server repeated a page token'), { page });
    tokens.add(next); token = next;
  }
  return { docs, pages: page };
}

// How many documents the collection holds (an aggregation count), read at
// the same instant as the listing when readTime is given.
async function countCollection(o){
  const body = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: o.collection || 'state' }] }, aggregations: [{ alias: 'n', count: {} }] } };
  if(o.readTime) body.readTime = o.readTime;
  const r = await requestJSON(Object.assign({}, o.retry, {
    url: docsRoot(o.firestore, o.project) + ':runAggregationQuery', method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + o.idToken },
    body: JSON.stringify(body), label: 'count', log: o.log,
  }));
  const arr = Array.isArray(r.json) ? r.json : [r.json];
  for(const x of arr){
    const v = x && x.result && x.result.aggregateFields && x.result.aggregateFields.n;
    if(v && v.integerValue != null && /^\d+$/.test(String(v.integerValue))) return Number(v.integerValue);
  }
  throw new ApiError('count: the answer holds no count');
}

// Groups whole-document writes into commits Firestore accepts (≤ 400 writes,
// ≤ 8 MB of JSON each; one document is at most 1 MiB).
function planBatches(writes, o){
  o = o || {};
  const maxWrites = o.maxWrites || 400, maxBytes = o.maxBytes || 8 * 1024 * 1024;
  const batches = [];
  let cur = [], bytes = 0;
  for(const w of writes){
    const b = Buffer.byteLength(JSON.stringify(w.fields), 'utf8') + Buffer.byteLength(w.name, 'utf8') + 64;
    if(cur.length && (cur.length >= maxWrites || bytes + b > maxBytes)){ batches.push(cur); cur = []; bytes = 0; }
    cur.push(w); bytes += b;
  }
  if(cur.length) batches.push(cur);
  return batches;
}
// One atomic commit of whole documents (replaced entirely, no field mask).
// mustNotExist adds "the document must not exist yet" to every write on the
// first attempt; a retry drops it, because the attempt before may have
// landed with its answer lost (the documents are then ours, and the
// read-back after the restore checks every one of them).
async function commitDocs(o){
  return requestJSON(Object.assign({}, o.retry, {
    url: docsRoot(o.firestore, o.project) + ':commit', method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + o.idToken },
    body: attempt => JSON.stringify({ writes: o.writes.map(w => Object.assign({ update: { name: w.name, fields: w.fields } },
      o.mustNotExist && attempt === 1 ? { currentDocument: { exists: false } } : {})) }),
    label: o.label || 'commit', log: o.log,
  }));
}

module.exports = {
  PROD_PROJECT, CONFIG_FILE, ConfigError, ApiError,
  appFirebaseConfig, endpoints, isLocalHost, scrub, ghEscape, makeLogger,
  retryOptions, requestJSON, signIn, listCollection, countCollection, planBatches, commitDocs, docName, docsRoot,
};
