'use strict';
// Shared by rules.test.js and app-writes.test.js: the emulators, the rules
// under test, fictional logins, every document key and a seed account.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
// WWW=<path> checks another checkout's app (as the e2e harnesses do).
const WWW = process.env.WWW ? path.resolve(process.env.WWW) : path.join(ROOT, 'www');
const PROJECT = 'demo-ultramed-rules'; // a demo project: the emulators never reach a real one
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8295').split(':');
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:8299';
// RULES_FILE=<path> runs the suites on another rules file (e.g. the old open
// rule, to see what it lets through).
const RULES_FILE = process.env.RULES_FILE ? path.resolve(process.env.RULES_FILE) : path.join(ROOT, 'firestore.rules');
const RAW_RULES = fs.readFileSync(RULES_FILE, 'utf8');
const PLACEHOLDER = 'SUPERVISOR_EMAIL@ultramed-kw.com';
// The committed placeholder replaced by a test login — what the owner does
// with the real address in the console.
const rulesFor = (...emails) => RAW_RULES.replace(`['${PLACEHOLDER}']`, '[' + emails.map(e => `'${e}'`).join(', ') + ']');

// Fictional logins only — never a real address (the repository is public).
const SUP = 'test-supervisor@ultramed-kw.com';
const SUP2 = 'test-supervisor-2@ultramed-kw.com';
const REP_A = 'test-rep-a@ultramed-kw.com';
const REP_B = 'test-rep-b@ultramed-kw.com';
const REPORTS = 'test-reports@ultramed-kw.com'; // a dedicated login for the e-mail job

// Dates: the rules compare with request.time (UTC); the app names backups by
// the phone's own calendar day (Kuwait, UTC+3).
const utcDay = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + (offset || 0)); return d.toISOString().slice(0, 10); };
const ymd = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const localDay = (tz, offset) => { const [y, m, d] = ymd(new Date(), tz).split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + (offset || 0))); return t.toISOString().slice(0, 10); };
const kuwaitDay = (offset) => localDay('Asia/Kuwait', offset);
const snap = (offset) => 'snap_' + utcDay(offset);
const lastMonth = () => { const [y, m] = kuwaitDay(0).split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); };

// ---- every key the app and the e-mail job use (the inventory in firestore.rules) ----
const PHOTO = 'photo:mh3k2x9q7f1a';
const CHUNK = 'erpRows:mh1a2b3c4d:1762300000000:0';
const ARCH = 'visitsArch:' + lastMonth();
const TEAM_KEYS = ['clinics', 'visits', 'visitsIndex', 'tasks', 'dayPlans', 'events', 'tombs', 'recycleBin',
  'erpNotes', 'products', 'repairLog', 'chat', 'memories', 'mailLog', ARCH, PHOTO];
const SUPERVISOR_KEYS = ['staff', 'targets', 'benchmarks', 'categoryGuides', 'erpSales', 'erpMap', 'erpMapLog', 'rxTypes', CHUNK];
const STARTUP_SEED_KEYS = ['staff', 'benchmarks', 'categoryGuides']; // created by any phone when missing (04-sync.js:1037-1039)
const SNAP_KEYS = [snap(0), snap(-5), snap(-14)];
const ALL_KEYS = TEAM_KEYS.concat(SUPERVISOR_KEYS, SNAP_KEYS);

const clinicList = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'c-' + i, name: 'Test clinic ' + i, rep: i % 2 ? 'Rep A' : 'Rep B', cls: 'B', notes: '', doctors: [{ id: 'd' + i, name: 'Dr. Test ' + i }],
}));
function makeSeed(){
  const seed = {
    clinics: clinicList(30),
    visits: [{ id: 'v1', clinicId: 'c-1', rep: 'Rep A', date: kuwaitDay(0), ts: Date.now() }],
    visitsIndex: { months: { [lastMonth()]: { n: 1, rev: 1 } }, v: 1 },
    [ARCH]: [{ id: 'v0', clinicId: 'c-2', rep: 'Rep B', date: lastMonth() + '-05' }],
    tasks: [{ id: 't1', rep: 'Rep A', text: 'Call back', done: false }],
    dayPlans: { [kuwaitDay(0)]: { 'Rep A': ['c-1'] } },
    events: [{ id: 'e1', kind: 'stand', clinicId: 'c-1', rep: 'Rep A' }],
    tombs: { visits: {}, tasks: {}, clinics: {}, events: {}, dayPlans: {}, doctors: {} },
    recycleBin: { clinics: [], products: [], visits: [] },
    erpNotes: {}, repairLog: [], chat: [], memories: [],
    mailLog: { last: null, history: [] },
    [PHOTO]: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
    staff: [{ name: 'Rep A', role: 'rep', email: REP_A }, { name: 'Rep B', role: 'rep', email: REP_B }, { name: 'Supervisor', role: 'supervisor', email: SUP }],
    targets: { 'Rep A': { revenue: 1000 } }, benchmarks: { coverage: 80 }, products: [{ id: 'p1', name: 'Test brush', brand: 'Test', price: 4 }],
    categoryGuides: {}, erpSales: { periods: [] }, erpMap: {}, erpMapLog: [], rxTypes: { rev: 1, types: [] },
    [CHUNK]: [],
  };
  SNAP_KEYS.forEach(k => { seed[k] = { clinics: [], visits: [], tasks: [], ts: new Date().toISOString() }; });
  return seed;
}
const asValue = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const stored = (v) => ({ value: asValue(v), updated: Date.now() }); // exactly what window.storage writes

module.exports = {
  ROOT, WWW, PROJECT, HOST, PORT, AUTH_HOST, RULES_FILE, RAW_RULES, PLACEHOLDER, rulesFor,
  SUP, SUP2, REP_A, REP_B, REPORTS,
  utcDay, kuwaitDay, localDay, snap, lastMonth,
  PHOTO, CHUNK, ARCH, TEAM_KEYS, SUPERVISOR_KEYS, STARTUP_SEED_KEYS, SNAP_KEYS, ALL_KEYS,
  clinicList, makeSeed, asValue, stored,
};
