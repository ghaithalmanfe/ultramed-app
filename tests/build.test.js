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
