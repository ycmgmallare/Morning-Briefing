// Morning Briefing web console — the request handler, shared by the local server
// (serve.mjs) and the Vercel serverless function (api/index.js).
//
// IMPORTANT: this module has NO side effects on import — it does not bind a port.
// serve.mjs wraps `handler` in http.createServer().listen(); Vercel imports it.
//
// Routes:
//   GET  /            dashboard (links to the tools below)
//   GET  /signup      signup form  (Name, Email, optional Company, consent, Submit)
//   POST /signup      insert the signup into Supabase
//   GET  /admin       signups manager + force-send (Demo / Today / Yesterday)
//   POST /send-now    run the pipeline now and report the result
//   POST /seed|/clear|/delete   manage the signups table
//   GET  /preview     preview the email template (static sample)
//   GET  /healthz     plain "ok" (always open — for uptime checks)
//
// Auth: if CONSOLE_PASSWORD is set, every route except /healthz requires HTTP
// Basic Auth (user = CONSOLE_USER || "admin"). Unset = open (local dev).
//
// NOTE: the briefing email always goes to RESEND_TO (Resend sandbox can only
// deliver to the account owner). The Email typed into the signup form is stored
// lead data — it is NOT where the briefing is sent.

import 'dotenv/config';
import { renderBriefingEmail, SAMPLE_BRIEFING } from './email-template.js';
import { addSignup, listSignups, deleteSignup, clearSignups, seedSignups } from './leads.js';
import { runBriefing } from './run.js';

// ---------------------------------------------------------------------------
// Design tokens — shared with email-template.js for a cohesive editorial look
// ---------------------------------------------------------------------------
const C = {
  paper: '#efe9dd', surface: '#fbf8f2', ink: '#1d1b26', muted: '#75727f',
  hair: '#e3ddd0', gold: '#b07d35', high: '#bb432f', low: '#4f6f6b',
};
const FONT_DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
const FONT_BODY = "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
function page({ title, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${esc(title)} · Morning Briefing</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --paper:${C.paper}; --surface:${C.surface}; --ink:${C.ink}; --muted:${C.muted}; --hair:${C.hair}; --gold:${C.gold}; --high:${C.high}; --low:${C.low}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--ink);
    font-family: ${FONT_BODY};
    background:
      radial-gradient(900px 420px at 12% -8%, rgba(176,125,53,0.10), transparent 60%),
      radial-gradient(820px 480px at 100% 0%, rgba(79,111,107,0.08), transparent 55%),
      var(--paper);
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 600px; margin: 0 auto; padding: 44px 20px 72px; }
  .eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold);
  }
  h1 { font-family: ${FONT_DISPLAY}; font-weight: 600; letter-spacing: -0.03em; line-height: 1.08; font-size: 38px; margin: 14px 0 0; }
  .lede { font-size: 15px; line-height: 1.65; color: var(--muted); margin: 10px 0 0; max-width: 46ch; }
  nav.top { display: flex; gap: 18px; margin-top: 16px; }
  nav.top a { font-size: 13px; font-weight: 600; color: var(--muted); text-decoration: none; padding-bottom: 2px; border-bottom: 1.5px solid transparent; transition: color .18s ease, border-color .18s ease; }
  nav.top a:hover { color: var(--ink); border-color: var(--gold); }
  nav.top a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; border-radius: 2px; }

  .card {
    background: var(--surface); border: 1px solid var(--hair); border-radius: 18px;
    padding: 26px; margin-top: 22px;
    box-shadow: 0 1px 2px rgba(29,27,38,0.04), 0 18px 40px -22px rgba(29,27,38,0.22);
  }
  .card h2 { font-family: ${FONT_DISPLAY}; font-weight: 600; letter-spacing: -0.02em; font-size: 21px; margin: 0 0 4px; }
  .card p.sub { font-size: 13.5px; line-height: 1.6; color: var(--muted); margin: 0 0 18px; }

  label { display: block; font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em; color: var(--ink); margin: 16px 0 7px; }
  label .opt { color: var(--muted); font-weight: 500; }
  input[type=text], input[type=email] {
    width: 100%; font-family: ${FONT_BODY}; font-size: 15px; color: var(--ink);
    background: #fff; border: 1px solid var(--hair); border-radius: 11px; padding: 12px 14px;
    transition: border-color .16s ease, box-shadow .16s ease;
  }
  input::placeholder { color: #b7b3ad; }
  input:focus-visible { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(176,125,53,0.18); }

  .consent { display: flex; gap: 11px; align-items: flex-start; margin-top: 20px; padding: 14px 15px; background: rgba(176,125,53,0.06); border: 1px solid rgba(176,125,53,0.22); border-radius: 12px; }
  .consent input { margin-top: 2px; width: 17px; height: 17px; accent-color: var(--gold); flex: none; }
  .consent label { margin: 0; font-weight: 500; font-size: 13.5px; line-height: 1.5; color: var(--ink); }

  .btn {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    font-family: ${FONT_BODY}; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
    color: #fbf8f2; background: var(--ink); border: none; border-radius: 11px; padding: 13px 20px;
    transition: transform .14s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease, background .18s ease;
    box-shadow: 0 10px 22px -12px rgba(29,27,38,0.6);
  }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 16px 30px -14px rgba(29,27,38,0.6); }
  .btn:active { transform: translateY(0); }
  .btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  .btn.gold { background: var(--gold); box-shadow: 0 10px 22px -12px rgba(176,125,53,0.7); }
  .btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--hair); box-shadow: none; }
  .btn.ghost:hover { border-color: var(--gold); }
  .btn-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 22px; }
  .full { width: 100%; justify-content: center; margin-top: 24px; }

  .note { font-size: 12.5px; line-height: 1.6; color: var(--muted); margin-top: 16px; }
  .note strong { color: var(--ink); font-weight: 600; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13.5px; margin: 0; }
  .kv dt { color: var(--muted); }
  .kv dd { margin: 0; font-weight: 600; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; }
  .ok { color: var(--low); background: #e6eeec; }
  .bad { color: var(--high); background: #f7e9e4; }
  .stat { display: flex; gap: 26px; margin: 4px 0 2px; }
  .stat .n { font-family: ${FONT_DISPLAY}; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; line-height: 1; }
  .stat .l { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
  .list { margin-top: 16px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--hair); }
  .row:first-child { border-top: none; }
  .row-name { font-size: 14.5px; font-weight: 600; color: var(--ink); }
  .row-co { color: var(--muted); font-weight: 500; }
  .row-sub { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .day-tag { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gold); margin-right: 8px; vertical-align: 1px; }
  .btn.sm { padding: 7px 13px; font-size: 12.5px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; background: rgba(29,27,38,0.05); padding: 1px 5px; border-radius: 5px; }
  a.back { display: inline-block; margin-top: 26px; font-size: 13px; font-weight: 600; color: var(--muted); text-decoration: none; }
  a.back:hover { color: var(--ink); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 520px) { h1 { font-size: 30px; } .grid2 { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">◆&nbsp;&nbsp;Morning Briefing</div>
    ${body}
  </div>
</body>
</html>`;
}

const masthead = (title, lede) => `
  <h1>${esc(title)}</h1>
  ${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
  <nav class="top">
    <a href="/signup">Sign up</a>
    <a href="/admin">Send a test</a>
    <a href="/preview">Email preview</a>
  </nav>`;

const recipientNote = () => `
  <p class="note"><strong>Where does the email go?</strong> Always to your
  <strong>RESEND_TO</strong> inbox (${esc(process.env.RESEND_TO || 'unset')}). Resend's
  sandbox sender can only deliver to you — the email typed into the form is stored as lead
  data, not a destination.</p>`;

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
function dashboardPage() {
  const body = `
  ${masthead('Test console', 'A cockpit for the briefing pipeline — create signups, then fire a send on demand instead of waiting for 7 AM.')}
  <div class="card">
    <h2>1 · Add a signup</h2>
    <p class="sub">Drop a lead into your Supabase table the same way a real signup form would.</p>
    <a class="btn gold" href="/signup">Open signup form →</a>
  </div>
  <div class="card">
    <h2>2 · Send a briefing now</h2>
    <p class="sub">Summarize and email the demo leads, today's fresh signups, or yesterday's — instantly.</p>
    <a class="btn" href="/admin">Open send console →</a>
  </div>
  <div class="card">
    <h2>Email preview</h2>
    <p class="sub">See the email template rendered as a webpage (static sample data).</p>
    <a class="btn ghost" href="/preview">View preview →</a>
  </div>`;
  return page({ title: 'Test console', body });
}

function signupPage({ values = {}, error = '' } = {}) {
  const v = (k) => esc(values[k] || '');
  const body = `
  ${masthead('Sign up', "Add a lead to the signups table. Tomorrow's 7 AM briefing (or a test send) will summarize them.")}
  <form class="card" method="POST" action="/signup" novalidate>
    <h2>New signup</h2>
    <p class="sub">Name and email are required. Company is optional but makes the summary sharper.</p>
    ${error ? `<div class="consent bad" style="background:#f7e9e4;border-color:rgba(187,67,47,.3)"><span class="pill bad">!</span><label style="color:var(--high)">${esc(error)}</label></div>` : ''}

    <label for="name">Name</label>
    <input id="name" name="name" type="text" required placeholder="Jane Doe" value="${v('name')}">

    <label for="email">Email</label>
    <input id="email" name="email" type="email" required placeholder="jane@company.com" value="${v('email')}">

    <label for="company">Company <span class="opt">— optional</span></label>
    <input id="company" name="company" type="text" placeholder="Acme Corp" value="${v('company')}">

    <div class="consent">
      <input id="consent" name="consent" type="checkbox" required>
      <label for="consent">Yes, sign me up for the morning briefing list.</label>
    </div>

    <button class="btn gold full" type="submit">Sign up →</button>
  </form>
  ${recipientNote()}
  <a class="back" href="/">← Back to console</a>`;
  return page({ title: 'Sign up', body });
}

function signupSuccessPage(row) {
  const body = `
  ${masthead('You’re on the list', '')}
  <div class="card">
    <h2>Signup saved <span class="pill ok">added</span></h2>
    <p class="sub">Stored in Supabase just now.</p>
    <dl class="kv">
      <dt>Name</dt><dd>${esc(row.name)}</dd>
      <dt>Email</dt><dd>${esc(row.email)}</dd>
      <dt>Company</dt><dd>${esc(row.company || '—')}</dd>
    </dl>
    <div class="btn-row">
      <a class="btn gold" href="/admin">Send a test briefing now →</a>
      <a class="btn ghost" href="/signup">Add another</a>
    </div>
  </div>
  <p class="note"><strong>Tip:</strong> on the send console, click <strong>Today</strong> to
  email yourself a briefing that includes the signup you just made.</p>
  <a class="back" href="/">← Back to console</a>`;
  return page({ title: 'Signed up', body });
}

async function adminPage({ flash = '' } = {}) {
  const tz = process.env.BRIEFING_TZ || 'Asia/Manila';

  // Pull full rows so we can both count AND list them. Best-effort — Supabase
  // may not be configured yet, so degrade to a friendly message.
  let signupsCard;
  try {
    const [today, yesterday] = await Promise.all([listSignups('today'), listSignups('yesterday')]);

    const rowHtml = (r, day) => {
      const time = new Date(r.created_at).toLocaleString('en-US', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true,
      });
      return `
      <div class="row">
        <div>
          <div class="row-name"><span class="day-tag">${day}</span>${esc(r.name)}${r.company ? ` <span class="row-co">· ${esc(r.company)}</span>` : ''}</div>
          <div class="row-sub">${esc(r.email)} — ${esc(time)}</div>
        </div>
        <form method="POST" action="/delete" onsubmit="return confirm('Delete this signup?')">
          <input type="hidden" name="id" value="${esc(r.id)}">
          <button class="btn ghost sm" type="submit">Delete</button>
        </form>
      </div>`;
    };

    const rows = [...today.map((r) => rowHtml(r, 'Today')), ...yesterday.map((r) => rowHtml(r, 'Yest'))].join('');
    const list = rows
      ? `<div class="list">${rows}</div>`
      : `<p class="note">No signups in today's or yesterday's window yet. Use the signup form, or <strong>Seed test data</strong> below.</p>`;

    signupsCard = `
    <div class="card">
      <h2>Signups in Supabase</h2>
      <p class="sub">Rows whose <code>created_at</code> falls in each day's window (timezone ${esc(tz)}).</p>
      <div class="stat">
        <div><div class="n">${today.length}</div><div class="l">Today</div></div>
        <div><div class="n">${yesterday.length}</div><div class="l">Yesterday</div></div>
      </div>
      ${list}
    </div>`;
  } catch (err) {
    signupsCard = `<div class="card">
      <h2>Signups in Supabase</h2>
      <p class="note" style="color:var(--high)">Supabase not connected yet: ${esc(err.message)}<br>Demo sends still work. Fill SUPABASE_URL / SUPABASE_KEY to enable real signups.</p>
    </div>`;
  }

  const sendBtn = (label, mode, when, cls) =>
    `<form method="POST" action="/send-now" style="display:inline">
       <input type="hidden" name="mode" value="${mode}">
       <input type="hidden" name="when" value="${when}">
       <button class="btn ${cls}" type="submit">${esc(label)}</button>
     </form>`;

  const body = `
  ${masthead('Send a test', 'Manage signups and fire a briefing on demand. Sends are real — they land in your RESEND_TO inbox.')}
  ${flash}
  <div class="card">
    <h2>Current setup</h2>
    <dl class="kv">
      <dt>AI provider</dt><dd>${esc(process.env.AI_PROVIDER || 'groq')}</dd>
      <dt>Email provider</dt><dd>${esc(process.env.EMAIL_PROVIDER || 'gmail')}</dd>
      <dt>Sends to</dt><dd>${esc(process.env.RESEND_TO || 'unset')}</dd>
    </dl>
  </div>
  ${signupsCard}
  <div class="card">
    <h2>Test data</h2>
    <p class="sub">Populate or reset the table. <strong>Seed</strong> adds the 6 sample leads dated both today and yesterday (12 rows); it's additive, so use Clear for a fresh set.</p>
    <div class="btn-row">
      <form method="POST" action="/seed" style="display:inline"><button class="btn gold" type="submit">Seed test data</button></form>
      <form method="POST" action="/clear" style="display:inline" onsubmit="return confirm('Delete ALL signups?')"><button class="btn ghost" type="submit">Clear all</button></form>
    </div>
  </div>
  <div class="card">
    <h2>Send a briefing now</h2>
    <p class="sub"><strong>Demo</strong> uses the 6 sample leads. <strong>Today</strong> / <strong>Yesterday</strong> use real signups from that day's window.</p>
    <div class="btn-row">
      ${sendBtn('Send Demo', 'demo', 'yesterday', 'gold')}
      ${sendBtn("Send Today's", 'real', 'today', '')}
      ${sendBtn("Send Yesterday's", 'real', 'yesterday', 'ghost')}
    </div>
  </div>
  ${recipientNote()}
  <a class="back" href="/">← Back to console</a>`;
  return page({ title: 'Send a test', body });
}

function sendResultFlash({ ok, mode, when, leads, briefing, result, error }) {
  if (!ok) {
    return `<div class="card"><h2>Send failed <span class="pill bad">error</span></h2>
      <p class="sub">${esc(error)}</p></div>`;
  }
  const tiers = (briefing.tiers || []).map((t) => `${esc(t.name)}: ${t.leads.length}`).join(' · ');
  const scope = mode === 'demo' ? 'demo leads' : `${when}'s signups`;
  return `<div class="card">
    <h2>Sent <span class="pill ok">${esc(result.provider)}</span></h2>
    <p class="sub">Summarized <strong>${leads.length}</strong> ${esc(scope)} and emailed the briefing.</p>
    <dl class="kv">
      <dt>To</dt><dd>${esc(result.to)}</dd>
      <dt>Tiers</dt><dd>${tiers || '—'}</dd>
      <dt>Top focus</dt><dd>${esc(briefing.topFocus?.name || '—')}${briefing.topFocus?.company ? ' · ' + esc(briefing.topFocus.company) : ''}</dd>
      <dt>Message id</dt><dd style="font-weight:500;color:var(--muted)">${esc(result.id || '—')}</dd>
    </dl>
    <p class="note">Check your <strong>${esc(result.to)}</strong> inbox.</p>
  </div>`;
}

/** Run a manage action (seed/clear/delete) and return a flash card. */
async function manageFlash(fn, okMsg) {
  try {
    const result = await fn();
    return `<div class="card"><h2>Done <span class="pill ok">ok</span></h2><p class="sub">${esc(okMsg(result))}</p></div>`;
  } catch (err) {
    return `<div class="card"><h2>Failed <span class="pill bad">error</span></h2><p class="sub">${esc(err.message)}</p></div>`;
  }
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/** Parse a form body. Uses Vercel's pre-parsed req.body when present, else the stream. */
function readForm(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return Promise.resolve(new URLSearchParams(req.body));
    if (typeof req.body === 'object') {
      const params = new URLSearchParams();
      for (const [k, val] of Object.entries(req.body)) params.append(k, String(val));
      return Promise.resolve(params);
    }
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Body too large')); // crude guard
    });
    req.on('end', () => resolve(new URLSearchParams(data)));
    req.on('error', reject);
  });
}

const send = (res, status, html, type = 'text/html; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(html);
};

/** HTTP Basic Auth gate. Returns true if allowed; otherwise writes a 401 and returns false. */
function authorized(req, res) {
  const pass = process.env.CONSOLE_PASSWORD;
  if (!pass) return true; // no gate configured (local dev)

  const user = process.env.CONSOLE_USER || 'admin';
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    const u = decoded.slice(0, i);
    const p = decoded.slice(i + 1);
    if (u === user && p === pass) return true;
  }

  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Morning Briefing console", charset="UTF-8"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Authentication required.');
  return false;
}

// ---------------------------------------------------------------------------
// The handler (no server here — see serve.mjs / api/index.js)
// ---------------------------------------------------------------------------
export async function handler(req, res) {
  const url = (req.url || '/').split('?')[0];
  const method = req.method || 'GET';

  try {
    if (method === 'GET' && url === '/healthz') return send(res, 200, 'ok', 'text/plain; charset=utf-8');

    // Everything else is behind the password gate (when configured).
    if (!authorized(req, res)) return;

    if (method === 'GET' && (url === '/' || url === '/index.html')) return send(res, 200, dashboardPage());
    if (method === 'GET' && url === '/preview') return send(res, 200, renderBriefingEmail(SAMPLE_BRIEFING));
    if (method === 'GET' && url === '/signup') return send(res, 200, signupPage());

    if (method === 'POST' && url === '/signup') {
      const form = await readForm(req);
      const values = { name: form.get('name'), email: form.get('email'), company: form.get('company') };
      if (!form.get('consent')) {
        return send(res, 200, signupPage({ values, error: 'Please tick the box to confirm you want to sign up.' }));
      }
      if (!values.name?.trim() || !values.email?.trim()) {
        return send(res, 200, signupPage({ values, error: 'Name and email are both required.' }));
      }
      try {
        const row = await addSignup(values);
        return send(res, 200, signupSuccessPage(row));
      } catch (err) {
        return send(res, 200, signupPage({ values, error: err.message }));
      }
    }

    if (method === 'GET' && url === '/admin') return send(res, 200, await adminPage());

    if (method === 'POST' && url === '/send-now') {
      const form = await readForm(req);
      const mode = form.get('mode') === 'real' ? 'real' : 'demo';
      const when = form.get('when') === 'today' ? 'today' : 'yesterday';
      let flash;
      try {
        const { leads, briefing, result } = await runBriefing({ mode, when, send: true });
        flash = sendResultFlash({ ok: true, mode, when, leads, briefing, result });
      } catch (err) {
        flash = sendResultFlash({ ok: false, error: err.message });
      }
      return send(res, 200, await adminPage({ flash }));
    }

    if (method === 'POST' && url === '/seed') {
      const flash = await manageFlash(() => seedSignups(), (n) => `Seeded ${n} rows (6 today, 6 yesterday).`);
      return send(res, 200, await adminPage({ flash }));
    }

    if (method === 'POST' && url === '/clear') {
      const flash = await manageFlash(() => clearSignups(), (n) => `Cleared ${n} signup${n === 1 ? '' : 's'}.`);
      return send(res, 200, await adminPage({ flash }));
    }

    if (method === 'POST' && url === '/delete') {
      const form = await readForm(req);
      const flash = await manageFlash(() => deleteSignup(form.get('id')), () => 'Deleted signup.');
      return send(res, 200, await adminPage({ flash }));
    }

    return send(res, 404, page({ title: 'Not found', body: `${masthead('404', 'No such page.')}<a class="back" href="/">← Back to console</a>` }));
  } catch (err) {
    return send(res, 500, page({ title: 'Error', body: `${masthead('Something broke', esc(err.message))}<a class="back" href="/">← Back to console</a>` }));
  }
}
