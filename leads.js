// Lead source — switches between demo (hardcoded sample leads) and real (Supabase).
//
// Demo mode lets us exercise the full pipeline (AI summary + email) without a
// database. Real mode reads signups from the Supabase `signups` table, filtered
// to a one-day window (yesterday for the real 7 AM run, today for instant testing).

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
 * @param {'yesterday' | 'today'} when  which day's signups (real mode only)
 * @returns {Promise<Array<{name: string, email: string, company: string}>>}
 */
export async function getLeads(mode = 'demo', when = 'yesterday') {
  if (mode === 'real') {
    return getLeadsFromSupabase(when);
  }
  // Default / demo: the hardcoded sample set.
  return SAMPLE_LEADS;
}

/**
 * Real-mode lead source: a single day's rows from the Supabase `signups` table.
 *
 * The day boundary is computed in the briefing timezone (BRIEFING_TZ, default
 * Asia/Manila) so the window is correct regardless of where the server runs
 * (e.g. Render cron runs in UTC). Returns [] for a day with no signups — the
 * caller treats that as a valid outcome, not an error.
 *
 * Expects a `signups` table with: name, email, company, created_at (timestamptz).
 * If your schema differs, adjust the column list in .select() below.
 *
 * @param {'yesterday' | 'today'} when
 */
export async function getLeadsFromSupabase(when = 'yesterday') {
  const tz = process.env.BRIEFING_TZ || 'Asia/Manila';
  const { start, end } = dayWindow(tz, when === 'today' ? 0 : -1);

  const supabase = supabaseClient();
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
 * Insert one signup into the `signups` table. `created_at` is filled by the DB
 * default. Used by the local signup form (serve.mjs).
 * @param {{ name: string, email: string, company?: string }} signup
 * @returns {Promise<object>} the inserted row
 */
export async function addSignup({ name, email, company }) {
  const clean = (s) => (typeof s === 'string' ? s.trim() : '');
  const row = {
    name: clean(name),
    email: clean(email),
    company: clean(company) || null, // optional
  };
  if (!row.name || !row.email) {
    throw new Error('Signup requires both a name and an email.');
  }

  const supabase = supabaseClient();
  const { data, error } = await supabase.from('signups').insert(row).select().single();
  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
  return data;
}

/**
 * List a day's signups as FULL rows (id + created_at included) for the manager UI.
 * @param {'yesterday' | 'today'} when
 * @returns {Promise<Array<{id:number,name:string,email:string,company:string,created_at:string}>>}
 */
export async function listSignups(when = 'yesterday') {
  const tz = process.env.BRIEFING_TZ || 'Asia/Manila';
  const { start, end } = dayWindow(tz, when === 'today' ? 0 : -1);

  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from('signups')
    .select('id, name, email, company, created_at')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Supabase list failed: ${error.message}`);
  return data || [];
}

/** Delete one signup by id. */
export async function deleteSignup(id) {
  const supabase = supabaseClient();
  const { error } = await supabase.from('signups').delete().eq('id', Number(id));
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

/** Delete ALL signups. Returns how many rows were removed. */
export async function clearSignups() {
  const supabase = supabaseClient();
  // Supabase requires a filter on delete; identity ids start at 1, so gte(0) = all.
  const { data, error } = await supabase.from('signups').delete().gte('id', 0).select('id');
  if (error) throw new Error(`Supabase clear failed: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Seed test data: insert SAMPLE_LEADS dated midday YESTERDAY and midday TODAY
 * (in BRIEFING_TZ), so the Yesterday and Today send paths both have data.
 * Additive — pair with clearSignups() for a clean set. Returns rows inserted.
 */
export async function seedSignups() {
  const tz = process.env.BRIEFING_TZ || 'Asia/Manila';
  const HALF_DAY = 12 * 60 * 60 * 1000;

  const rows = [];
  for (const offsetDays of [-1, 0]) { // yesterday, then today
    const { start } = dayWindow(tz, offsetDays);
    const created_at = new Date(Date.parse(start) + HALF_DAY).toISOString(); // midday, in-window
    for (const lead of SAMPLE_LEADS) {
      rows.push({ ...lead, created_at });
    }
  }

  const supabase = supabaseClient();
  const { data, error } = await supabase.from('signups').insert(rows).select('id');
  if (error) throw new Error(`Supabase seed failed: ${error.message}`);
  return data?.length ?? rows.length;
}

/** Build a Supabase client from env vars (server-side use only). */
function supabaseClient() {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase config. Set SUPABASE_URL and SUPABASE_KEY in .env.');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Compute a single day's [start, end) instants as ISO strings, where the day
 * boundaries are midnight-to-midnight in the given IANA timezone.
 *
 * @param {string} tz         IANA timezone (e.g. "Asia/Manila")
 * @param {number} offsetDays  0 = today, -1 = yesterday
 * @returns {{ start: string, end: string }} ISO timestamps (UTC)
 */
function dayWindow(tz, offsetDays) {
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
    start: new Date(todayStartUTC + offsetDays * DAY).toISOString(),       // day 00:00 tz
    end: new Date(todayStartUTC + (offsetDays + 1) * DAY).toISOString(),   // next day 00:00 tz
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
