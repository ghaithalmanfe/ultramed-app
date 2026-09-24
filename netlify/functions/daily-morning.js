// Scheduled (see netlify.toml): the morning digest, 07:30 Kuwait.
exports.handler = require('./lib/daily-report.js').scheduled('morning');
