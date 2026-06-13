// Shared briefing pipeline — the single source of truth for "produce a briefing
// and (optionally) send it". Used by the CLI (index.js), the local scheduler
// (scheduler.mjs), and the test server (serve.mjs) so the logic lives in one place.

import { getLeads } from './leads.js';
import { generateBriefing, emptyBriefing } from './briefing.js';
import { sendBriefing } from './email.js';

/**
 * Run the full pipeline: fetch leads → summarize (or empty-day note) → optionally send.
 *
 * @param {object} opts
 * @param {'demo'|'real'} [opts.mode='demo']
 * @param {'yesterday'|'today'} [opts.when='yesterday']  which day's signups (real mode)
 * @param {'gmail'|'resend'} [opts.provider]             override EMAIL_PROVIDER
 * @param {boolean} [opts.send=true]                     set false to generate without sending
 * @returns {Promise<{ leads: Array, briefing: object, result: object|null }>}
 */
export async function runBriefing({ mode = 'demo', when = 'yesterday', provider, send = true } = {}) {
  const leads = await getLeads(mode, when);

  // A day with no signups is normal, not an error: skip the AI call and send a
  // simple "no signups" briefing instead.
  const briefing = leads.length === 0 ? emptyBriefing() : await generateBriefing(leads);

  let result = null;
  if (send) {
    result = await sendBriefing({
      subject: `Morning Briefing — ${briefing.date}`,
      briefing,
      provider,
    });
  }

  return { leads, briefing, result };
}
