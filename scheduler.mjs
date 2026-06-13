// Daily Morning Briefing scheduler.
//
// Uses node-cron to run the briefing pipeline every day at 7:00 AM
// Philippine time (Asia/Manila). The `timezone` option means it fires at PHT
// regardless of this machine's system timezone.
//
//   node scheduler.mjs          start the scheduler (stays running)
//   node scheduler.mjs --now    fire one send immediately, then keep scheduling
//
// Tunables via .env (optional):
//   BRIEFING_CRON=0 7 * * *     cron expression (default: 7:00 AM)
//   BRIEFING_TZ=Asia/Manila     IANA timezone (default: Asia/Manila)
//   BRIEFING_MODE=demo          demo | real (real = yesterday's Supabase signups)
//   EMAIL_PROVIDER=resend       gmail | resend
//
// NOTE: this in-process scheduler is for LOCAL use. In the cloud (Render Cron
// Job) we run `node index.js --mode real` on a schedule instead — see render.yaml.
//
// NOTE: node-cron is in-process — it only fires while THIS script is running,
// and not while the machine is asleep/off. For a set-and-forget setup that
// survives reboots, use Windows Task Scheduler (see the README/notes).

import 'dotenv/config';
import cron from 'node-cron';
import { getLeads } from './leads.js';
import { generateBriefing, emptyBriefing } from './briefing.js';
import { sendBriefing } from './email.js';

const CRON = process.env.BRIEFING_CRON || '0 7 * * *'; // 7:00 AM daily
const TZ = process.env.BRIEFING_TZ || 'Asia/Manila';
const MODE = process.env.BRIEFING_MODE || 'demo'; // demo | real

function stamp() {
  return new Date().toLocaleString('en-US', { timeZone: TZ, hour12: false });
}

async function runBriefing() {
  console.log(`\n[${stamp()} ${TZ}] Running daily briefing (mode: ${MODE})…`);
  try {
    const leads = await getLeads(MODE);
    const briefing = leads.length === 0 ? emptyBriefing() : await generateBriefing(leads);
    const result = await sendBriefing({
      subject: `Morning Briefing — ${briefing.date}`,
      briefing,
    });
    console.log(`[${stamp()} ${TZ}] ✅ Sent via ${result.provider} → ${result.to} (id: ${result.id})`);
  } catch (err) {
    // Log and keep the scheduler alive — one bad run shouldn't kill the job.
    console.error(`[${stamp()} ${TZ}] ❌ Briefing failed: ${err.message}`);
  }
}

if (!cron.validate(CRON)) {
  console.error(`Invalid BRIEFING_CRON expression: "${CRON}"`);
  process.exit(1);
}

const task = cron.schedule(CRON, runBriefing, {
  timezone: TZ,
  name: 'morning-briefing',
  noOverlap: true, // skip a run if the previous one is still in flight
});

const next = task.getNextRun();
console.log('📅 Morning Briefing scheduler armed.');
console.log(`   Schedule : ${CRON}  (${TZ})`);
console.log(`   Provider : ${(process.env.EMAIL_PROVIDER || 'gmail')}`);
console.log(`   Next run : ${next ? next.toLocaleString('en-US', { timeZone: TZ, hour12: true }) + ` ${TZ}` : 'unknown'}`);
console.log('   Keep this process running. Stop with Ctrl+C.\n');

// --now: fire one immediate end-to-end send for testing, then keep scheduling.
if (process.argv.includes('--now')) {
  console.log('▶ --now: sending one briefing immediately…');
  task.execute();
}
