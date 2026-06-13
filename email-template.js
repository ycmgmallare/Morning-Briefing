// Shared briefing render layer.
//
// One source of truth for how a briefing looks — used by BOTH the web preview
// (serve.mjs) and the real email sends (email.js). The HTML is email-safe
// (table layout + inline styles) so it renders the same in Gmail/Resend and in
// a browser, while still hitting a refined, editorial "morning briefing" look.

// ---------------------------------------------------------------------------
// Design tokens (kept here so the whole template stays consistent)
// ---------------------------------------------------------------------------
const C = {
  paper: '#efe9dd', // warm page background
  surface: '#fbf8f2', // card surface
  ink: '#1d1b26', // primary text
  muted: '#75727f', // secondary text
  hair: '#e3ddd0', // hairline borders
  gold: '#b07d35', // brand accent (honey/amber)
  high: '#bb432f', // High priority  — clay red
  medium: '#c08a2d', // Medium priority — amber
  low: '#4f6f6b', // Low priority    — deep sage
};

const TIER_META = {
  'High priority': { color: C.high, tint: '#f7e9e4', label: 'HIGH' },
  'Medium priority': { color: C.medium, tint: '#f7eed9', label: 'MED' },
  'Low priority': { color: C.low, tint: '#e6eeec', label: 'LOW' },
};

const FONT_DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
const FONT_BODY =
  "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// ---------------------------------------------------------------------------
// Sample data — a hand-written structured briefing for the 6 sample leads.
// Used by the preview server and as a safe fallback.
// ---------------------------------------------------------------------------
export const SAMPLE_BRIEFING = {
  date: '2026-06-13',
  tiers: [
    {
      name: 'High priority',
      leads: [
        {
          name: 'Michael Smith',
          company: 'FinFlow',
          email: 'michael.smith@finflow.com',
          reason: 'Fintech buyer with budget and a clear pain point — highest deal potential today.',
          action: 'Send a tailored intro email',
        },
        {
          name: 'Olivia Brown',
          company: 'GrowthLab',
          email: 'olivia.brown@growthlab.com',
          reason: 'Growth-stage and actively hunting for scalable tooling — warm timing.',
          action: 'Book a product demo',
        },
      ],
    },
    {
      name: 'Medium priority',
      leads: [
        {
          name: 'James Williams',
          company: 'Stackr',
          email: 'james.williams@stackr.com',
          reason: 'Dev-tooling team — likely an integration play, needs a little qualification.',
          action: 'Share product one-pager',
        },
        {
          name: 'Sophia Davis',
          company: 'Clarity HQ',
          email: 'sophia.davis@clarityhq.com',
          reason: 'Workflow-focused org — potential efficiency win, worth a nurture touch.',
          action: 'Send a relevant case study',
        },
      ],
    },
    {
      name: 'Low priority',
      leads: [
        {
          name: 'Emily Johnson',
          company: 'Acme Corp',
          email: 'emily.johnson@acmecorp.com',
          reason: 'Large enterprise — long procurement cycle, keep warm for the long game.',
          action: 'Add to nurture list',
        },
        {
          name: 'Liam Miller',
          company: 'BuildCo',
          email: 'liam.miller@buildco.com',
          reason: 'Construction vertical — weaker fit, low urgency for now.',
          action: 'Send a light intro',
        },
      ],
    },
  ],
  topFocus: {
    name: 'Michael Smith',
    company: 'FinFlow',
    reason: 'Best-fit, highest-value lead — open the day here while attention is sharp.',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  // iso: 'YYYY-MM-DD' -> 'Friday, June 13, 2026' (no Date.now dependency)
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return esc(iso);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  // Zeller-free weekday via UTC Date is fine here (no "now" call).
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `${weekday}, ${months[m - 1]} ${d}, ${y}`;
}

function countLeads(briefing) {
  return briefing.tiers.reduce((n, t) => n + t.leads.length, 0);
}

function leadRow(lead, color, tint) {
  return `
  <tr>
    <td style="padding:14px 0; border-top:1px solid ${C.hair};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top; width:6px; padding:0;">
            <div style="width:6px; height:6px; border-radius:50%; background:${color}; margin-top:7px;"></div>
          </td>
          <td style="vertical-align:top; padding:0 0 0 12px;">
            <div style="font-family:${FONT_BODY}; font-size:15px; font-weight:600; color:${C.ink}; letter-spacing:-0.01em;">
              ${esc(lead.name)}
              <span style="color:${C.muted}; font-weight:500;">&nbsp;·&nbsp;${esc(lead.company)}</span>
            </div>
            <div style="font-family:${FONT_BODY}; font-size:13.5px; line-height:1.6; color:${C.muted}; margin-top:3px;">
              ${esc(lead.reason)}
            </div>
            <div style="margin-top:9px;">
              <span style="display:inline-block; font-family:${FONT_BODY}; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${color}; background:${tint}; padding:5px 11px; border-radius:999px;">
                ${esc(lead.action)}
              </span>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function tierCard(tier) {
  const meta = TIER_META[tier.name] || { color: C.gold, tint: '#f3ead8', label: '—' };
  const rows = tier.leads.map((l) => leadRow(l, meta.color, meta.tint)).join('');
  return `
  <tr>
    <td style="padding:0 0 18px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate; background:${C.surface}; border:1px solid ${C.hair}; border-radius:16px; box-shadow:0 1px 2px rgba(29,27,38,0.04), 0 12px 28px -16px rgba(29,27,38,0.18);">
        <tr>
          <td style="padding:20px 22px 6px 22px; border-left:3px solid ${meta.color}; border-top-left-radius:16px; border-bottom-left-radius:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:${FONT_DISPLAY}; font-size:18px; font-weight:600; color:${C.ink}; letter-spacing:-0.01em;">
                  ${esc(tier.name)}
                </td>
                <td align="right" style="font-family:${FONT_BODY}; font-size:11px; font-weight:700; letter-spacing:0.08em; color:${meta.color};">
                  ${meta.label}&nbsp;·&nbsp;${tier.leads.length}
                </td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
              ${rows}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Public: full HTML email document
// ---------------------------------------------------------------------------
export function renderBriefingEmail(briefing) {
  const total = countLeads(briefing);
  const tiers = briefing.tiers.map(tierCard).join('');
  const tf = briefing.topFocus;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Morning Briefing — ${esc(briefing.date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${C.paper}; }
  /* Browser-only atmosphere; email clients ignore and just show the paper color. */
  .bg-wrap {
    background:
      radial-gradient(900px 420px at 12% -8%, rgba(176,125,53,0.10), transparent 60%),
      radial-gradient(820px 480px at 100% 0%, rgba(79,111,107,0.08), transparent 55%),
      ${C.paper};
  }
  a { text-decoration:none; }
  @media (max-width:620px){ .container { width:100% !important; } .pad { padding-left:18px !important; padding-right:18px !important; } }
</style>
</head>
<body>
<div class="bg-wrap" style="padding:40px 12px;">
  <table role="presentation" class="container" width="600" align="center" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; margin:0 auto; border-collapse:collapse;">

    <!-- Masthead -->
    <tr>
      <td class="pad" style="padding:4px 8px 22px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-family:${FONT_BODY}; font-size:11px; font-weight:700; letter-spacing:0.22em; text-transform:uppercase; color:${C.gold};">
              ◆&nbsp;&nbsp;Morning Briefing
            </td>
            <td align="right" style="font-family:${FONT_BODY}; font-size:12px; color:${C.muted};">
              ${formatDate(briefing.date)}
            </td>
          </tr>
        </table>
        <div style="font-family:${FONT_DISPLAY}; font-size:34px; line-height:1.1; font-weight:600; color:${C.ink}; letter-spacing:-0.03em; margin-top:14px;">
          Your leads, triaged for today
        </div>
        <div style="font-family:${FONT_BODY}; font-size:14px; line-height:1.6; color:${C.muted}; margin-top:8px;">
          ${total} leads prioritized — start at the top and work down.
        </div>
      </td>
    </tr>

    <!-- Top focus banner -->
    <tr>
      <td class="pad" style="padding:0 8px 22px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate; background:${C.ink}; border-radius:16px; box-shadow:0 18px 36px -20px rgba(29,27,38,0.55);">
          <tr>
            <td style="padding:22px 24px;">
              <div style="font-family:${FONT_BODY}; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:${C.gold};">
                ★&nbsp;&nbsp;Top focus today
              </div>
              <div style="font-family:${FONT_DISPLAY}; font-size:22px; font-weight:600; color:#fbf8f2; letter-spacing:-0.02em; margin-top:8px;">
                ${esc(tf.name)} <span style="color:#b8b4c2; font-weight:500;">— ${esc(tf.company)}</span>
              </div>
              <div style="font-family:${FONT_BODY}; font-size:13.5px; line-height:1.6; color:#c9c5d2; margin-top:6px;">
                ${esc(tf.reason)}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Tiers -->
    <tr>
      <td class="pad" style="padding:0 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${tiers}
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td class="pad" style="padding:14px 8px 8px 8px;">
        <div style="border-top:1px solid ${C.hair}; padding-top:18px; font-family:${FONT_BODY}; font-size:12px; line-height:1.6; color:${C.muted};">
          Generated by your Morning Briefing assistant · powered by Claude.<br>
          You're receiving this because you're set up for daily lead briefings.
        </div>
      </td>
    </tr>

  </table>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public: plain-text version (email fallback + console output)
// ---------------------------------------------------------------------------
export function renderBriefingText(briefing) {
  const lines = [];
  lines.push(`MORNING BRIEFING — ${formatDate(briefing.date)}`);
  lines.push('='.repeat(52));
  lines.push('');
  for (const tier of briefing.tiers) {
    lines.push(`${tier.name.toUpperCase()} (${tier.leads.length})`);
    for (const l of tier.leads) {
      lines.push(`  • ${l.name} — ${l.company}`);
      lines.push(`    ${l.reason}`);
      lines.push(`    → ${l.action}`);
    }
    lines.push('');
  }
  lines.push(`TOP FOCUS TODAY: ${briefing.topFocus.name} (${briefing.topFocus.company})`);
  lines.push(`  ${briefing.topFocus.reason}`);
  return lines.join('\n');
}
