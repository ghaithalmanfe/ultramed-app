// Manual trigger from the app (Admin → Email reports → Send now).
exports.handler = require('../lib/daily-report.js').manual;
