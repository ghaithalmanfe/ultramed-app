'use strict';
// The whole-day Restore never writes the sales index (v129, the security audit's C5). Until v128 it put the daily
// backup's erpIndex back when this phone held no sales file — and a daily backup is written by whichever team login
// opens the app first that day, so a rep could forge the supervisor-only sales figures through the supervisor's own
// Restore; when the phone's sales read had failed, it replaced the cloud's index with that day's older one and every
// file imported since dropped out of the figures. The Restore's question promises the sales files stay as they are; a
// lost sales index is recovered from the nightly encrypted backup (docs/backup.md) or by importing the files again.
// This scan reads www/js/app/13-exports.js (WWW=<path> for another checkout).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WWW = path.resolve(process.env.WWW || path.join(__dirname, '..', 'www'));
const src = fs.readFileSync(path.join(WWW, 'js', 'app', '13-exports.js'), 'utf8');

test('the whole-day Restore writes no sales index and no sales chunk', () => {
  const start = src.indexOf('async function restoreSnapshotNow(');
  assert.ok(start >= 0, 'restoreSnapshotNow is in 13-exports.js');
  const rest = src.slice(start + 10);
  const next = rest.search(/\n(?:async\s+)?function\s/);
  const body = next >= 0 ? rest.slice(0, next) : rest;
  assert.ok(!/storage\.set\(\s*['"]erpSales['"]/.test(body), 'restoreSnapshotNow writes erpSales');
  assert.ok(!/storage\.set\(\s*['"`]erpRows:/.test(body), 'restoreSnapshotNow writes erpRows chunks');
  assert.ok(!/persistErpSales/.test(body), 'restoreSnapshotNow saves the sales files');
  assert.ok(!/snap\.erpIndex/.test(body), 'restoreSnapshotNow reads the backup\'s sales index');
});
