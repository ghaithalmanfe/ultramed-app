const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

test('the published build is one self-contained index.html holding every app file, in order', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'um-build-'));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js'), path.join(ROOT, 'www'), out], { stdio: 'pipe' });
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.equal(/<script src="js\/app\//.test(html), false, 'no external app script tags remain');
  assert.equal(fs.existsSync(path.join(out, 'js', 'app')), false, 'js/app is not shipped');
  const inline = html.match(/<script>\n([\s\S]*?)<\/script>/g) || [];
  assert.equal(inline.length, 1, 'exactly one inline script block');
  const files = fs.readdirSync(path.join(ROOT, 'www', 'js', 'app')).filter(f => f.endsWith('.js')).sort();
  const body = files.map(f => fs.readFileSync(path.join(ROOT, 'www', 'js', 'app', f), 'utf8').split('\n').slice(2).join('\n')).join('');
  assert.equal(inline[0], '<script>\n' + body + '</script>', 'the block is the files concatenated in order, headers removed');
  // everything the service worker precaches exists in the published folder
  const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  for(const p of shell){ if(p === './') continue; assert.ok(fs.existsSync(path.join(out, p)), 'precached file missing from the build: ' + p); }
  // the version in the page matches the service worker cache
  const rev = html.match(/const APP_REV = '(v\d+)'/)[1];
  assert.match(sw, new RegExp("const CACHE = 'ultramed-field-ops-" + rev + "'"));
  fs.rmSync(out, { recursive: true, force: true });
});

// v119: the site is public, so real sales data must never ship with it. Until
// v118 the August ERP export (customers, invoices, amounts) sat in www/ and was
// downloadable from the published site. A spreadsheet, or a JSON file holding
// ERP lines, anywhere in the published folder now stops the build.
test('the published folder carries no sales data', () => {
  const { salesDataFiles } = require('../scripts/build.js');
  assert.deepEqual(salesDataFiles(path.join(ROOT, 'www')), [], 'sales data in www/ would be published to everyone');
});
test('the build refuses a sales file put in the published folder', () => {
  const { salesDataFiles } = require('../scripts/build.js');
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'um-src-'));
  fs.cpSync(path.join(ROOT, 'www'), src, { recursive: true });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'um-out-'));
  // the app's packed ERP line: [date, invoice, type, product, qty, gross, net, return, salesman, brand, customer, class, disc]
  const line = ['2026-08-01', 'SINV001', 0, 'Brush', 1, 2, 2, 0, 'A Salesman', 'Brand', 'Some Customer', 'Clinics', 0];
  fs.writeFileSync(path.join(src, 'seed.json'), JSON.stringify({ month: '2026-08', rows: [line] }));
  fs.mkdirSync(path.join(src, 'data'));
  fs.writeFileSync(path.join(src, 'data', 'lines.json'), JSON.stringify([{ date: '2026-08-01', customer: 'Some Customer', net: 2 }]));
  fs.writeFileSync(path.join(src, 'data', 'Ultramed_Sales3.xlsx'), 'x');
  fs.writeFileSync(path.join(src, 'data', 'export.csv'), 'a,b\n1,2\n');
  assert.deepEqual(salesDataFiles(src).sort(), ['data/Ultramed_Sales3.xlsx', 'data/export.csv', 'data/lines.json', 'seed.json']);
  let msg = '';
  try{ execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js'), src, out], { stdio: 'pipe' }); }
  catch(e){ msg = String(e.stderr || ''); }
  assert.match(msg, /build failed: sales data must not be published: .*seed\.json/);
  assert.equal(fs.existsSync(path.join(out, 'index.html')), false, 'nothing is built');
  fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true });
});
