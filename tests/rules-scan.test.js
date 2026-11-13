'use strict';
// The security rules' source scan, inside `npm test` (v123, audit item 9):
// every write target in www/js/app is a key firestore.rules knows, and every
// computed one is resolved. A new key written by the app without a rule is
// refused in production — and was then reported as an offline save. The scan
// needs no emulator and no installed packages (tests/rules/app-writes.test.js,
// its "source scan" tests only; the emulator suite runs in rules.yml).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('the rules source scan passes (tests/rules: npm run scan)', () => {
  const file = path.join(__dirname, 'rules', 'app-writes.test.js');
  const env = Object.assign({}, process.env); delete env.NODE_TEST_CONTEXT; // a test run of its own, not one nested in this file's
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-name-pattern=source scan', file], { encoding: 'utf8', env, timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, 'the rules source scan failed:\n' + out.split('\n').filter(l => /✖|Error|expected|actual|missing|unresolved/.test(l)).slice(0, 40).join('\n'));
  assert.match(out, /every literal write target in www\/js\/app is a key the rules know/);
});
