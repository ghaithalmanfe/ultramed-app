// UltraMed Field Ops — daily e-mail digest (morning / end of day).
// Run by GitHub Actions (.github/workflows/daily-report.yml) on a schedule, or
// by hand from the Actions tab. Reads the team's data straight from Firestore
// (REST, signed in as a normal app user), builds each recipient's summary
// with the SAME code the app uses for its own figures (www/js/core.js), and
// sends through Resend. Every run is logged to the `mailLog` document, which
// the app's Admin → Email reports tab shows.
//
// Configuration — GitHub repo → Settings → Secrets and variables → Actions:
//   REPORT_LOGIN_EMAIL / REPORT_LOGIN_PASSWORD  an app login that may read the data
//   RESEND_API_KEY                              from resend.com
//   MAIL_FROM                                   e.g. "UltraMed Field Ops <reports@ultramed-kw.com>" (domain verified in Resend)
// Optional: MAIL_ALL_DAYS=1 (also Fri/Sat), MAIL_TO_OVERRIDE=<one address> (testing).
const core = require('../../www/js/core.js');

const FIREBASE = { apiKey: 'AIzaSyAlkAW4-Eq4LKXtVOSx0wdP_UMzxht5_r4', projectId: 'ultramed-field-ops' };
const DOCS = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;

function kuwaitToday(now){
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now || new Date());
}
async function signIn(email, password){
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE.apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if(!r.ok || !j.idToken) throw new Error('LOGIN_FAILED: ' + ((j.error && j.error.message) || r.status));
  return j.idToken;
}
// Reads several `state/<key>` documents in one request → { key: parsedValue|null }
async function readDocs(idToken, keys){
  const out = {};
  for(let i = 0; i < keys.length; i += 100){
    const slice = keys.slice(i, i + 100);
    const r = await fetch(`${DOCS}:batchGet`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ documents: slice.map(k => `projects/${FIREBASE.projectId}/databases/(default)/documents/state/${k}`) }),
    });
    if(!r.ok) throw new Error('READ_FAILED: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const arr = await r.json();
    (Array.isArray(arr) ? arr : []).forEach(x => {
      if(!x.found) return;
      const name = x.found.name.split('/').pop();
      const v = x.found.fields && x.found.fields.value && x.found.fields.value.stringValue;
      out[decodeURIComponent(name)] = v == null ? null : core.safeParse(v, null);
    });
  }
  return out;
}
async function writeDoc(idToken, key, value){
  const r = await fetch(`${DOCS}/state/${encodeURIComponent(key)}?updateMask.fieldPaths=value&updateMask.fieldPaths=updated`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + idToken },
    body: JSON.stringify({ fields: { value: { stringValue: JSON.stringify(value) }, updated: { integerValue: String(Date.now()) } } }),
  });
  if(!r.ok) throw new Error('WRITE_FAILED: ' + r.status);
}
// The whole account, sales rows included (index + chunks), as the app holds it.
async function loadData(idToken, today){
  const base = await readDocs(idToken, ['clinics', 'visits', 'tasks', 'dayPlans', 'events', 'targets', 'staff', 'erpSales', 'erpMap']);
  let erpSales = base.erpSales || { periods: [] };
  const chunkKeys = core.erpChunkKeys(erpSales);
  if(chunkKeys.length){
    const chunks = await readDocs(idToken, chunkKeys);
    erpSales = core.erpAssemble(erpSales, chunks).sales;
  }
  return {
    today, targets: base.targets || {}, erpSales, clinics: base.clinics || [], erpMap: base.erpMap || {},
    visits: base.visits || [], tasks: base.tasks || [], events: base.events || [], dayPlans: base.dayPlans || {},
    staff: Array.isArray(base.staff) ? base.staff : [],
  };
}
async function sendMail(apiKey, from, to, subject, html, text){
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error('SEND_FAILED ' + r.status + ': ' + (j.message || JSON.stringify(j)).slice(0, 200));
  return j.id || null;
}
// Builds every recipient's digest from loaded data. Pure apart from `core`.
function buildAll(kind, data){
  const reps = data.staff.filter(s => s && s.role === 'rep' && s.name).map(s => s.name);
  const out = [];
  data.staff.forEach(s => {
    if(!s || !s.email) return;
    if(s.role === 'rep') out.push({ to: s.email, name: s.name, role: 'rep', ...core.dailyDigest({ kind, data, reps, rep: s.name }) });
    else if(s.role === 'supervisor') out.push({ to: s.email, name: s.name, role: 'supervisor', ...core.dailyDigest({ kind, data, reps }) });
  });
  return out;
}
// One run. `io` can be replaced in tests. Returns the log entry written to state/mailLog.
async function run(kind, opts){
  opts = opts || {};
  const env = opts.env || process.env;
  const now = opts.now || new Date();
  const today = kuwaitToday(now);
  const manual = !!opts.manual;
  if(!manual && env.MAIL_ALL_DAYS !== '1' && !core.isWorkday(today)) return { skipped: 'weekend', today };
  if(!env.REPORT_LOGIN_EMAIL || !env.REPORT_LOGIN_PASSWORD) throw new Error('NO_LOGIN');
  if(!env.RESEND_API_KEY) throw new Error('NO_RESEND_KEY');
  const from = env.MAIL_FROM || 'UltraMed Field Ops <reports@ultramed-kw.com>';
  const io = Object.assign({ signIn, loadData, sendMail, writeDoc, readDocs }, opts.io || {});
  const idToken = await io.signIn(env.REPORT_LOGIN_EMAIL, env.REPORT_LOGIN_PASSWORD);
  const data = await io.loadData(idToken, today);
  const mails = buildAll(kind, data);
  const results = [];
  for(const m of mails){
    const to = env.MAIL_TO_OVERRIDE || m.to;
    try{ const id = await io.sendMail(env.RESEND_API_KEY, from, to, m.subject, m.html, m.text); results.push({ to, name: m.name, ok: true, id }); }
    catch(e){ results.push({ to, name: m.name, ok: false, error: String(e.message || e).slice(0, 200) }); }
  }
  const entry = { kind, today, at: now.toISOString(), manual, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, to: results };
  try{
    const cur = (await io.readDocs(idToken, ['mailLog'])).mailLog || {};
    const history = Array.isArray(cur.history) ? cur.history : [];
    await io.writeDoc(idToken, 'mailLog', { last: entry, history: [entry].concat(history).slice(0, 30) });
  }catch(e){ entry.logError = String(e.message || e); }
  return entry;
}
// A run summary safe for a PUBLIC log (the repository's Actions logs are
// public): names and outcomes only — never an e-mail address.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
function summarize(entry){
  if(!entry) return '';
  if(entry.skipped) return `${entry.kind || ''} ${entry.today}: skipped (${entry.skipped})`;
  const lines = [`${entry.kind} digest for ${entry.today}: ${entry.sent} sent, ${entry.failed} failed${entry.manual ? ' (manual run)' : ''}`];
  (entry.to || []).forEach(t => lines.push(`  ${t.ok ? 'OK  ' : 'FAIL'} ${t.name || '?'}${t.ok ? '' : ' — ' + String(t.error || '').replace(EMAIL_RE, '<address>')}`));
  if(entry.logError) lines.push('  (could not write mailLog: ' + String(entry.logError).replace(EMAIL_RE, '<address>') + ')');
  return lines.join('\n');
}
module.exports = { run, buildAll, summarize, kuwaitToday, loadData, readDocs };
