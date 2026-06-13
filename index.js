// Morning Briefing orchestrator (CLI).
//
// Flow: get leads (demo or real) -> AI generates a prioritized briefing
// (AI_PROVIDER: groq | claude) -> print it -> send via the selected email provider.
// The actual pipeline lives in run.js (shared with scheduler.mjs and serve.mjs).
//
// Usage:
//   node index.js                          # demo mode, send via default provider (resend)
//   node index.js --mode demo --no-send    # generate + print only, no email
//   node index.js --provider resend        # demo mode, send via Resend
//   node index.js --mode real              # real mode — yesterday's signups from Supabase

import 'dotenv/config';
import { runBriefing } from './run.js';
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

  const { leads, briefing, result } = await runBriefing({ mode, provider, send });
  console.log(`Loaded ${leads.length} lead(s).`);

  // Print the plain-text rendering of the same briefing.
  console.log('─'.repeat(60));
  console.log(renderBriefingText(briefing));
  console.log('─'.repeat(60) + '\n');

  if (result) {
    console.log(`✅ Sent via ${result.provider} → ${result.to} (id: ${result.id})`);
  } else {
    console.log('Skipping send (--no-send).');
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
