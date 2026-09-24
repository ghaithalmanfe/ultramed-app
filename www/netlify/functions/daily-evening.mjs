// Scheduled: the end-of-day digest at 18:30 Kuwait (cron is UTC).
import report from '../lib/daily-report.js';
export default async () => {
  try{ const r = await report.run('evening'); console.log('daily-report evening', JSON.stringify(r)); return new Response(JSON.stringify(r), { status: 200 }); }
  catch(e){ console.error('daily-report evening', e); return new Response(String(e && e.message || e), { status: 500 }); }
};
export const config = { schedule: '30 15 * * *' };
