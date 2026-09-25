// node scripts/daily-report/run.js <morning|evening> [--manual]
// Exit code 1 when anything failed, so GitHub marks the run red and tells the
// repository owner — a digest that did not go out is never silent.
const report = require('./report.js');
const kind = process.argv[2] === 'evening' ? 'evening' : 'morning';
const manual = process.argv.includes('--manual');
const configured = !!(process.env.REPORT_LOGIN_EMAIL && process.env.REPORT_LOGIN_PASSWORD && process.env.RESEND_API_KEY);
if(!configured && !manual){
  // Not set up yet: a scheduled run says so in the log but does not flood the
  // owner with failure mails twice a day. A manual run fails loudly instead.
  console.log('::warning::Daily e-mail reports are not configured yet (add the REPORT_LOGIN_EMAIL, REPORT_LOGIN_PASSWORD, RESEND_API_KEY and MAIL_FROM repository secrets).');
  process.exit(0);
}
report.run(kind, { manual }).then(entry => {
  console.log(report.summarize(entry));
  if(entry.skipped) return;
  if(entry.failed || !entry.sent) process.exit(1);
}).catch(e => {
  console.error('Daily report failed: ' + String(e && e.message || e).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<address>'));
  process.exit(1);
});
