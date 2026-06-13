# Morning Briefing

An automated **morning email** that summarizes yesterday's signups. Every day at 7 AM, an AI
reads the people who signed up the day before, writes a short prioritized summary, and emails it
to you — so you start the day knowing who to contact first.

```
signup form ──▶ Supabase (signups table) ──▶ AI writes a summary ──▶ email to your inbox
                                            (Groq, free)            (Resend)
```

You can run the whole thing **for free**: Groq (AI), Resend (email), and Supabase (database) all
have free tiers, and it can be hosted on Vercel's free plan.

---

## What each page does

The web console (`app.js`, served locally by `serve.mjs` or on Vercel) has four pages:

| Page | What it's for |
|------|---------------|
| **`/`** | Dashboard — links to the other pages. |
| **`/signup`** | The signup form: Name, Email, optional Company, a "sign me up" checkbox. Submitting it adds a row to your Supabase `signups` table. This is what a real visitor would fill in. |
| **`/admin`** | The control room. See today's & yesterday's signups, **Delete** any row, **Seed test data** (adds 6 sample signups dated today + yesterday so you have something to summarize), **Clear all**, and **send a briefing now** — Demo, Today's, or Yesterday's — without waiting for 7 AM. |
| **`/preview`** | Shows what the email looks like, using sample data. |

> The briefing email always goes to your **`RESEND_TO`** address. Resend's free "sandbox" sender
> can only deliver to you, so the email typed into the signup form is just stored data — not where
> the briefing is sent. (To email other people, verify a domain in Resend and set `RESEND_FROM`.)

---

## The whole workflow

1. **Someone signs up** (via `/signup`, or you seed test data) → a row lands in Supabase.
2. **At 7 AM** (Vercel Cron, or Render, or the local `scheduler.mjs`) the app:
   - queries **yesterday's** signups from Supabase,
   - asks the **AI** to triage them into High / Medium / Low priority with a "top focus" lead,
   - **emails** that summary to you.
3. A day with **no signups** still sends a clean "No new signups" note (it doesn't error).

You can trigger steps 2–3 anytime from `/admin` instead of waiting for the schedule.

---

## Test it locally

You need [Node.js](https://nodejs.org) installed.

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create `.env`** — copy `.env.example` to `.env` and fill in your keys (see the table below).
   At minimum: `GROQ_API_KEY`, `RESEND_API_KEY` / `RESEND_FROM` / `RESEND_TO`, and (for real
   signups) `SUPABASE_URL` / `SUPABASE_KEY`. Leave `CONSOLE_PASSWORD` blank for no login locally.
3. **Start the console**
   ```bash
   node serve.mjs
   ```
   Open **http://localhost:3000**.
4. **Try the loop:** `/admin` → **Seed test data** → **Send Today's** → check your inbox.
   Or `/signup` → submit → `/admin` → **Send Today's**.

Command-line alternatives:
```bash
node index.js --mode demo --no-send   # print a briefing, don't email
node index.js --mode demo             # email a briefing using sample leads
node index.js --mode real             # email yesterday's real Supabase signups
node scheduler.mjs --now              # run once now, then keep the 7 AM schedule
```

---

## Deploy to Vercel (test from anywhere)

Vercel runs the app as serverless functions (`api/index.js` = the console, `api/cron.js` = the
daily send), wired up by `vercel.json`. The code already supports this — you just configure it.

1. **Push to GitHub** (already done if you cloned this repo).
2. Go to **[vercel.com](https://vercel.com)** → sign in with GitHub → **Add New → Project** →
   import **Morning-Briefing**.
3. **Add Environment Variables** (Project → Settings → Environment Variables) — see the table
   below. Be sure to set **`CONSOLE_PASSWORD`** (locks the console) and **`CRON_SECRET`** (locks
   the daily-send URL).
4. **Deploy.** Open your `*.vercel.app` URL:
   - `/signup` and `/admin` will prompt for the username/password (`CONSOLE_USER` / `CONSOLE_PASSWORD`).
   - The 7 AM send runs automatically via Vercel Cron (`0 23 * * *` UTC = 07:00 Asia/Manila).

> **Free-tier note:** the app sleeps when idle, so the first visit after a while takes ~1 minute
> to wake. That's normal.
>
> **Pick one cron:** this repo also has `render.yaml` for running the daily send on Render. Use
> **either** Vercel Cron **or** Render — not both, or you'll get two emails. On Vercel, the cron is
> already on; if you don't deploy to Render, you can ignore `render.yaml`.

---

## Environment variables

| Variable | What it is | Needed for |
|----------|-----------|------------|
| `AI_PROVIDER` | `groq` (free, default) or `claude` | always |
| `GROQ_API_KEY` | Groq API key (free, no card) — [console.groq.com/keys](https://console.groq.com/keys) | `AI_PROVIDER=groq` |
| `ANTHROPIC_API_KEY` | Claude API key | only if `AI_PROVIDER=claude` |
| `EMAIL_PROVIDER` | `resend` (default) or `gmail` | always |
| `RESEND_API_KEY` / `RESEND_FROM` / `RESEND_TO` | Resend email config; `RESEND_TO` is your inbox | `EMAIL_PROVIDER=resend` |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Gmail SMTP | only if `EMAIL_PROVIDER=gmail` |
| `SUPABASE_URL` / `SUPABASE_KEY` | Supabase project URL + `service_role` key | real signups (`--mode real`) |
| `BRIEFING_MODE` | `demo` or `real` (the scheduled send) | scheduler / Render |
| `BRIEFING_TZ` | IANA timezone, e.g. `Asia/Manila` — sets the "yesterday" window | always |
| `CONSOLE_USER` / `CONSOLE_PASSWORD` | Login for the deployed console (blank = open) | Vercel deploy |
| `CRON_SECRET` | Secret Vercel Cron sends to `/api/cron` | Vercel deploy |

Secrets live in `.env` locally (git-ignored) and in the Vercel/Render dashboard when deployed —
never commit real keys.

### Supabase table

The app expects a `signups` table. Create it once in Supabase's SQL Editor:

```sql
create table signups (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  company     text,
  created_at  timestamptz not null default now()
);
```

---

## Project layout

| File | Role |
|------|------|
| `app.js` | The web console request handler (pages + routes). No server — imported by the two below. |
| `serve.mjs` | Local server: wraps `app.js` for `node serve.mjs`. |
| `api/index.js` | Vercel function serving the console. |
| `api/cron.js` | Vercel Cron function: the daily send. |
| `leads.js` | Supabase access: query / insert / list / delete / seed signups. |
| `briefing.js` | Asks the AI (Groq or Claude) for the structured summary. |
| `email.js` + `email-template.js` | Renders and sends the email (Resend or Gmail). |
| `run.js` | The shared pipeline: leads → summary → send. Used by everything. |
| `index.js` | Command-line runner. |
| `scheduler.mjs` | Local 7 AM scheduler (node-cron). |
| `vercel.json` / `render.yaml` | Deploy configs (pick one for the cron). |
