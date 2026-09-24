// Scheduled: the morning digest at 07:30 Kuwait (cron is UTC). Fridays and
// Saturdays are skipped inside the function unless MAIL_ALL_DAYS=1.
import report from '../lib/daily-report.js';
export default async () => {
  try{ const r = await report.run('morning'); console.log('daily-report morning', JSON.stringify(r)); return new Response(JSON.stringify(r), { status: 200 }); }
  catch(e){ console.error('daily-report morning', e); return new Response(String(e && e.message || e), { status: 500 }); }
};
export const config = { schedule: '30 4 * * *' };
