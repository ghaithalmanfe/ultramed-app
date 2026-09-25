// Runs every browser harness in turn (each owns a distinct port) and fails on
// the first red one. `npm run e2e` — or one file: `node tests/e2e/smoke-all.e2e.js`.
const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.e2e.js')).sort();
let failed = 0;
for(const f of files){
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'pipe', encoding: 'utf8', env: process.env, timeout: 15 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && /ALL CHECKS PASSED/.test(out);
  console.log(`${ok ? '✅' : '❌'} ${f}  (${Math.round((Date.now() - t0) / 1000)}s)`);
  if(!ok){ failed++; console.log(out.split('\n').filter(l => /^❌|HARNESS ERROR|Error|CHECK\(S\) FAILED/.test(l)).slice(0, 30).join('\n')); }
}
console.log(failed ? `\n${failed} harness file(s) failed` : '\nALL E2E HARNESSES PASSED');
process.exit(failed ? 1 : 0);
