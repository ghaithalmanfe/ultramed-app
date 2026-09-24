// Scheduled (see netlify.toml): the end-of-day digest, 18:30 Kuwait.
exports.handler = require('./lib/daily-report.js').scheduled('evening');
