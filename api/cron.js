// Vercel Cron entry — runs the daily briefing for YESTERDAY's signups.
//
// Scheduled by vercel.json ("0 23 * * *" UTC = 07:00 Asia/Manila). Vercel attaches
// `Authorization: Bearer <CRON_SECRET>` to scheduled requests when CRON_SECRET is set,
// so we verify it here to stop the public from triggering sends via the URL.

import 'dotenv/config';
import { runBriefing } from '../run.js';

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers['authorization'] || '';
    if (header !== `Bearer ${secret}`) return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const { leads, result } = await runBriefing({ mode: 'real', when: 'yesterday', send: true });
    return json(res, 200, { ok: true, leads: leads.length, provider: result?.provider, to: result?.to, id: result?.id });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
}
