// Shared environment for the browser harnesses.
//   WWW          the app folder under test (env WWW overrides — e.g. a worktree)
//   launchOpts() Chromium launch options: env CHROME_PATH, else the pre-installed
//                browser of the Claude cloud container, else Playwright's own
//   salesFixture() path of the synthetic September ERP file (generated once per run)
const fs = require('fs'), path = require('path');
const WWW = process.env.WWW || path.join(__dirname, '..', '..', 'www');
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
module.exports = { WWW, launchOpts, salesFixture, blockFirebase };
