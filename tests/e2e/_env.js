// Shared environment for the browser harnesses.
//   WWW          the app folder under test (env WWW overrides — e.g. a worktree)
//   launchOpts() Chromium launch options: env CHROME_PATH, else the pre-installed
//                browser of the Claude cloud container, else Playwright's own
//   salesFixture() path of the synthetic September ERP file (generated once per run)
const fs = require('fs'), path = require('path');
const WWW = path.resolve(process.env.WWW || path.join(__dirname, '..', '..', 'www'));
const CLOUD_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
function launchOpts(){
  const exe = process.env.CHROME_PATH || (fs.existsSync(CLOUD_CHROME) ? CLOUD_CHROME : null);
  return exe ? { executablePath: exe } : {};
}
let _fixture = null;
function salesFixture(){
  if(!_fixture){ process.env.WWW = WWW; _fixture = require('./fixtures/make-sales-xlsx.js').makeSalesFixture(path.join(require('os').tmpdir(), 'ultramed-e2e-Ultramed_Sales3_28.xlsx')); }
  return _fixture;
}
// The harnesses run against a fake cloud: the real Firebase SDK must never
// load (on GitHub's runners it would, and the app would then call
// firebase.auth() on an app that was never initialised). A regex, because
// Playwright's '**/gstatic.com/**' glob does not match 'www.gstatic.com'.
async function blockFirebase(ctx){
  await ctx.route(/gstatic\.com\/firebasejs\//, r => r.abort());
  await ctx.route(/\.netlify\/functions\//, r => r.abort());
}
// The roster these harnesses were written for: two reps and a supervisor who
// does NOT sell (a supervisor sells by default since v95; the selling case is
// covered by supervisor-sells.e2e.js). The addresses are invented.
function twoRepStaff(){
  return JSON.stringify([
    {name:'Mariam', role:'rep', email:'mariam@example.com'},
    {name:'Renova', role:'rep', email:'renova@example.com'},
    {name:'Dr. Ghaith', role:'supervisor', email:'ghaith@example.com', sells:false}]);
}
// An amount as the screens write it (UMCore.money's digits: toFixed, thousands grouped): amt(12989) → "12,989.00".
// For a check that reads an amount as text; the exact value to the fils is still what is compared.
function amt(n, dec){ const p = (Number(n) || 0).toFixed(dec == null ? 2 : dec).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
// The same, escaped for a RegExp ("12,989\\.00").
function amtRe(n, dec){ return amt(n, dec).replace('.', '\\.'); }
module.exports = { WWW, launchOpts, salesFixture, blockFirebase, twoRepStaff, amt, amtRe };
