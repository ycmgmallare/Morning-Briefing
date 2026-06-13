// Lead source — switches between demo (hardcoded sample leads) and real (Supabase).
//
// Demo mode lets us exercise the full pipeline (Claude summary + email) without a
// database. Real mode queries yesterday's signups from the Supabase `signups` table.

import { createClient } from '@supabase/supabase-js';

export const SAMPLE_LEADS = [
  { name: 'Emily Johnson', email: 'emily.johnson@acmecorp.com', company: 'Acme Corp' },
  { name: 'Michael Smith', email: 'michael.smith@finflow.com', company: 'FinFlow' },
  { name: 'Olivia Brown', email: 'olivia.brown@growthlab.com', company: 'GrowthLab' },
  { name: 'James Williams', email: 'james.williams@stackr.com', company: 'Stackr' },
  { name: 'Sophia Davis', email: 'sophia.davis@clarityhq.com', company: 'Clarity HQ' },
  { name: 'Liam Miller', email: 'liam.miller@buildco.com', company: 'BuildCo' },
];

/**
 * Return the leads for the given mode.
 * @param {'demo' | 'real'} mode
 * @returns {Promise<Array<{name: string, email: string, company: string}>>}
 */
export async function getLeads(mode = 'demo') {
  if (mode === 'real') {
    return getLeadsFromSupabase();
  }
  // Default / demo: the hardcoded sample set.
  return SAMPLE_LEADS;
}

/**
 * Real-mode lead source: yesterday's rows from the Supabase `signups` table.
 *
 * "Yesterday" is computed in the briefing timezone (BRIEFING_TZ, default
 * Asia/Manila) so the date window is correct regardless of where the server
 * runs (e.g. Render cron runs in UTC). Returns [] for a day with no signups —
 * the caller treats that as a valid outcome, not an error.
 *
 * Expects a `signups` table with: name, email, company, created_at (timestamptz).
 * If your schema differs, adjust the column list in .select() below.
 */
export async function getLeadsFromSupabase() {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase config. Set SUPABASE_URL and SUPABASE_KEY in .env.');
  }

  const tz = process.env.BRIEFING_TZ || 'Asia/Manila';
  const { start, end } = yesterdayWindow(tz);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase
    .from('signups')
    .select('name, email, company, created_at')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  // Strip created_at — the briefing only needs name/email/company.
  return (data || []).map(({ name, email, company }) => ({ name, email, company }));
}

/**
 * Compute yesterday's [start, end) instants as ISO strings, where the day
 * boundaries are midnight-to-midnight in the given IANA timezone.
 *
 * Approach: find the current UTC offset for `tz`, derive "today 00:00" in that
 * zone, then walk back one day for the start. Asia/Manila has no DST so this is
 * exact there; for DST zones it's correct except for the ~1hr ambiguity around a
 * transition, which is fine for a daily signups window.
 *
 * @param {string} tz IANA timezone (e.g. "Asia/Manila")
 * @returns {{ start: string, end: string }} ISO timestamps (UTC)
 */
function yesterdayWindow(tz) {
  const now = new Date();

  // Offset (in minutes) of `tz` relative to UTC, right now.
  const offsetMin = tzOffsetMinutes(now, tz);

  // "Now" shifted into the target zone's wall-clock, read via UTC getters.
  const localNow = new Date(now.getTime() + offsetMin * 60_000);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();

  // Today 00:00 wall-clock in `tz`, expressed as a real UTC instant.
  const todayStartUTC = Date.UTC(y, m, d) - offsetMin * 60_000;
  const DAY = 24 * 60 * 60 * 1000;

  return {
    start: new Date(todayStartUTC - DAY).toISOString(), // yesterday 00:00 tz
    end: new Date(todayStartUTC).toISOString(),         // today 00:00 tz
  };
}

/**
 * The offset of `tz` from UTC at instant `date`, in minutes
 * (positive means ahead of UTC, e.g. Asia/Manila = +480).
 */
function tzOffsetMinutes(date, tz) {
  // Format the same instant as wall-clock in `tz`, parse it back as if UTC,
  // and the difference is the offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => Number(parts.find((p) => p.type === type).value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asUTC - date.getTime()) / 60_000);
}
