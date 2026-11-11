// Confidentiality guard (v121). The repository is public and www/ is published
// on GitHub Pages, so nothing real may be committed under www/ or tests/: no
// address at the company's e-mail domain, no Kuwaiti mobile number, no sales
// file (spreadsheet, CSV, or JSON holding ERP lines) outside the synthetic
// fixtures, no invoice number as the ERP prints it, no private key or token.
// Test data is invented (tests/e2e/fixtures). A genuine false positive goes in
// tests/confidential-allow.txt with its reason; an entry that no longer matches
// anything fails the test too, so that list stays short.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { holdsSalesLines } = require('../scripts/build.js');

const ROOT = path.join(__dirname, '..');
const SCOPE = ['www', 'tests'];
const ALLOW_FILE = 'tests/confidential-allow.txt';
const SELF = new Set(['tests/confidential.test.js', ALLOW_FILE]);
const FIXTURES = /^tests\/e2e\/fixtures\//;                      // synthetic data files may live here
const SHEET = /\.(xlsx|xlsm|xlsb|xls|ods|numbers|csv|tsv)$/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|woff2?|ttf|otf|eot|mp3|mp4|mov|zip|gz|jar)$/i;

const RULES = [
  { id: 'email', what: "an address at the company's e-mail domain",
    re: /[A-Za-z0-9._%+-]+@ultramed-kw\.com\b/gi },
  // Kuwaiti mobiles: 8 digits starting 4, 5, 6 or 9, with or without +965 / 00965,
  // a space or a dash in the middle. Part of a longer number, a code ("WP-462ME"),
  // a file name ("…-93568623-1.png") or a barcode / item-code field is not a phone.
  { id: 'mobile', what: 'a Kuwaiti mobile number',
    re: /(?<![\w+.\/\\-])(?:(?:\+|00)965[\s.-]?)?[4569]\d{3}[\s.-]?\d{4}(?![\w.\/-])/g,
    skip: (text, at) => /(?:barcode|ean|upc|gtin|sku|code|id)["']?\s*[:=]\s*["']?$/i.test(text.slice(Math.max(0, at - 24), at)),
    norm: s => s.replace(/\D/g, '').replace(/^(?:00)?965(?=\d{8}$)/, '') },
  // The ERP's own document numbers carry 7 digits (an invoice, a return, a stock
  // issue). Invented ones in tests are shorter, or built at run time.
  { id: 'erp-doc', what: 'an invoice / return number as the ERP prints it',
    re: /\b(?:SINV|SRT|MIV|SRN|SCN|SDN|CRN|PINV)\d{7,}\b/g },
  { id: 'secret', what: 'a private key or an access token',
    re: new RegExp([
      /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/.source,
      /\bgh[pousr]_[A-Za-z0-9]{30,}/.source, /\bgithub_pat_[A-Za-z0-9_]{40,}/.source,
      /\bxox[abprs]-[A-Za-z0-9-]{10,}/.source, /\bAKIA[0-9A-Z]{16}\b/.source,
      /\bAIza[0-9A-Za-z_-]{35}/.source,                                  // Google API keys (the Firebase web key is public: allow-listed)
      /\bsk-ant-[A-Za-z0-9_-]{20,}/.source, /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/.source,
      /\b[rs]k_live_[0-9A-Za-z]{16,}/.source, /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{12,}/.source,
      /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/.source,
      /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.source,                       // a JWT
      /\b(?:api[_-]?key|secret|token|passw(?:or)?d)["']?\s*[:=]\s*["'][A-Za-z0-9_\-+\/=.]{24,}["']/.source, // a long literal assigned to a key
    ].join('|'), 'gi'),
    norm: s => (s.match(/["']([^"']+)["']$/) || [, s])[1] },        // an assignment is allowed by its value
];

function trackedFiles(){
  let list = null;
  try{
    // tracked files plus new ones not ignored, so a leak is caught before it is committed
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SCOPE],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    list = out.split('\0').filter(Boolean);
  }catch(e){ list = null; }
  if(!list || !list.length){
    list = [];                                                    // no git (an exported tree): every file under the scope
    const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => {
      const p = d + '/' + e.name;
      if(e.isDirectory()){ if(e.name !== 'node_modules' && e.name !== '.git') walk(p); } else list.push(p);
    });
    SCOPE.forEach(d => { if(fs.existsSync(path.join(ROOT, d))) walk(d); });
  }
  return [...new Set(list)].filter(f => !SELF.has(f) && fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
}

// One entry per line:  <rule> <path or glob, * = any file> <the flagged text>  # why
function readAllow(){
  const src = fs.readFileSync(path.join(ROOT, ALLOW_FILE), 'utf8');
  return src.split('\n').map((l, i) => ({ l: l.replace(/\s+#.*$/, '').trim(), n: i + 1 })).filter(x => x.l && !x.l.startsWith('#')).map(x => {
    const m = x.l.match(/^(\S+)\s+(\S+)\s+(.+)$/);
    assert.ok(m, `${ALLOW_FILE}:${x.n}: expected "<rule> <path> <text>"`);
    assert.ok(RULES.some(r => r.id === m[1]) || m[1] === 'sales-file', `${ALLOW_FILE}:${x.n}: unknown rule "${m[1]}"`);
    const glob = new RegExp('^' + m[2].split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return { rule: m[1], glob, text: m[3].trim(), line: x.n, used: 0 };
  });
}

function scan(files, allow, base){
  base = base || ROOT;
  const found = [];
  const allowed = (rule, file, text) => {
    const r = RULES.find(x => x.id === rule), norm = r && r.norm ? r.norm : (s => s);
    const hit = allow.find(a => a.rule === rule && a.glob.test(file) && norm(a.text) === norm(text));
    if(hit) hit.used++;
    return !!hit;
  };
  for(const f of files){
    const full = path.join(base, f);
    if(SHEET.test(f) && !FIXTURES.test(f)){
      if(!allowed('sales-file', f, path.basename(f))) found.push(`${f}: a spreadsheet / CSV (sales files never go in the repository)`);
      continue;
    }
    if(BINARY.test(f)) continue;
    const buf = fs.readFileSync(full);
    if(buf.includes(0)) continue;                                  // binary
    const text = buf.toString('utf8');
    if(/\.json$/i.test(f) && !FIXTURES.test(f)){
      let v = null; try{ v = JSON.parse(text); }catch(e){}
      if(v != null && holdsSalesLines(v) && !allowed('sales-file', f, path.basename(f))) found.push(`${f}: JSON holding ERP sales lines`);
    }
    for(const r of RULES){
      r.re.lastIndex = 0;
      let m;
      while((m = r.re.exec(text))){
        if(r.skip && r.skip(text, m.index)) continue;
        if(allowed(r.id, f, m[0])) continue;
        const line = text.slice(0, m.index).split('\n').length;
        found.push(`${f}:${line}: ${r.what} (${r.id})`);       // where, never the value: CI logs are public
      }
    }
  }
  return found;
}

test('nothing real under www/ or tests/: no company e-mail, mobile number, sales file, ERP document number or secret', () => {
  const allow = readAllow();
  const files = trackedFiles();
  assert.ok(files.some(f => f.startsWith('www/')) && files.some(f => f.startsWith('tests/')), 'the guard sees the tree');
  const found = scan(files, allow);
  assert.deepEqual(found, [], 'real data in the public repository — replace it with an invented stand-in (or, for a false positive, add a line to ' + ALLOW_FILE + ')');
  const stale = allow.filter(a => !a.used).map(a => `${ALLOW_FILE}:${a.line}`);
  assert.deepEqual(stale, [], 'allow-list entries that match nothing any more — remove them');
});

test('the guard catches each kind of leak (and says where, never what)', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'um-conf-'));
  try{
    // the probes are assembled at run time, so this file never holds one
    const mail = ['some.one', 'ultramed-kw.com'].join('@');
    const key = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    const tok = 'gh' + 'p_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    const bare = '9' + '1234567', intl = '+965 ' + '6' + '5432109', code = '9' + '3568623';
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'tests', 'a.js'), [
      `const who = '${mail}';`,                                             // e-mail
      `const t2 = "${bare}";`,                                               // mobile, bare
      `const t3 = '${intl}';`,                                               // mobile, +965
      `const inv = '${'SINV' + '0012345'}';`,                                // ERP document number
      key, `const k = '${tok}';`,                                            // two secrets
      `const ok = { barcode: '${code}' }, img = 'x-${code}-1.png', big = ${code}1234;`, // not phones
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'tests', 'sales.csv'), 'Date,Invoice#\n');
    const line = ['2026-08-01', 'SINV001', 0, 'Brush', 1, 2, 2, 0, 'A Salesman', 'Brand', 'Some Customer', 'Clinics', 0];
    fs.writeFileSync(path.join(dir, 'tests', 'rows.json'), JSON.stringify({ rows: [line] }));
    fs.mkdirSync(path.join(dir, 'tests', 'e2e', 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tests', 'e2e', 'fixtures', 'synthetic.csv'), 'Date,Invoice#\n');
    const files = ['tests/a.js', 'tests/sales.csv', 'tests/rows.json', 'tests/e2e/fixtures/synthetic.csv'];
    const found = scan(files, [], dir);
    const kind = s => (s.match(/\(([\w-]+)\)$/) || [, /spreadsheet/.test(s) ? 'sheet' : 'json'])[1];
    assert.deepEqual(found.map(kind).sort(), ['email', 'erp-doc', 'json', 'mobile', 'mobile', 'secret', 'secret', 'sheet'], found.join('\n'));
    assert.ok(!found.some(s => /fixtures/.test(s)), 'the synthetic fixtures folder may hold data files');
    assert.ok(found.every(s => !s.includes('ultramed-kw') && !s.includes(bare) && !s.includes(tok)), 'the report names the place, never the value');
    // an allow-list entry clears exactly its own text, however it is written
    const allow = [{ rule: 'mobile', glob: /.*/, text: '6543-2109', used: 0 }];
    assert.equal(scan(['tests/a.js'], allow, dir).filter(s => /\(mobile\)/.test(s)).length, 1);
    assert.equal(allow[0].used, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
