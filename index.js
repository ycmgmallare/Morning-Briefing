// Morning Briefing orchestrator.
//
// Flow: get leads (demo or real) -> AI generates a prioritized briefing
// (AI_PROVIDER: groq | claude) -> print it -> send via the selected email provider.
//
// Usage:
//   node index.js                          # demo mode, send via default provider (resend)
//   node index.js --mode demo --no-send    # generate + print only, no email
//   node index.js --provider resend        # demo mode, send via Resend
//   node index.js --mode real              # real mode — yesterday's signups from Supabase

import 'dotenv/config';
import { getLeads } from './leads.js';
import { generateBriefing, emptyBriefing } from './briefing.js';
import { sendBriefing } from './email.js';
import { renderBriefingText } from './email-template.js';

function parseArgs(argv) {
  const args = { mode: 'demo', provider: undefined, send: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--provider') args.provider = argv[++i];
    else if (arg === '--no-send') args.send = false;
  }
  return args;
}

async function main() {
  const { mode, provider, send } = parseArgs(process.argv.slice(2));

  console.log(`\n📋 Morning Briefing — mode: ${mode}\n`);

  // 1. Leads
  const leads = await getLeads(mode);
  console.log(`Loaded ${leads.length} lead(s).`);

  // 2. Summary — a day with no signups is normal, not an error: skip Claude
  //    and send a simple "no signups" briefing instead.
  let briefing;
  if (leads.length === 0) {
    console.log('No new signups — sending a "no signups" briefing.\n');
    briefing = emptyBriefing();
  } else {
    console.log(`Generating prioritized briefing with ${(process.env.AI_PROVIDER || 'groq')}…\n`);
    briefing = await generateBriefing(leads);
  }

  // 3. Print (plain-text rendering of the same briefing)
  console.log('─'.repeat(60));
  console.log(renderBriefingText(briefing));
  console.log('─'.repeat(60) + '\n');

  // 4. Send
  if (!send) {
    console.log('Skipping send (--no-send).');
    return;
  }

  const result = await sendBriefing({
    subject: `Morning Briefing — ${briefing.date}`,
    briefing,
    provider,
  });
  console.log(`✅ Sent via ${result.provider} → ${result.to} (id: ${result.id})`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
