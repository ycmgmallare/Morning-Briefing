// Briefing generator — provider-switchable.
//
// Takes the day's leads and asks an AI to return a STRUCTURED, prioritized
// briefing as JSON, matching the shape consumed by email-template.js:
//
//   { date, tiers: [{ name, leads: [{ name, company, email, reason, action }] }], topFocus }
//
// Provider is chosen by AI_PROVIDER (default "groq"):
//   groq   — Groq's free API tier (Llama 3.3 70B). No card required.
//   claude — Anthropic's Claude API (claude-haiku-4-5). Needs a funded balance.

import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const CLAUDE_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are a sales assistant that triages leads into a prioritized MORNING BRIEFING.

You will be given a JSON array of leads (name, email, company). Return ONLY a JSON object with this exact shape:

{
  "tiers": [
    { "name": "High priority", "leads": [ { "name": "...", "company": "...", "email": "...", "reason": "one concise sentence on why this priority", "action": "a short next step, e.g. 'Send a tailored intro email'" } ] },
    { "name": "Medium priority", "leads": [ ... ] },
    { "name": "Low priority", "leads": [ ... ] }
  ],
  "topFocus": { "name": "...", "company": "...", "reason": "one sentence on why to start here" }
}

Rules:
- Always include all three tiers (High priority, Medium priority, Low priority), even if a tier is empty (use an empty array).
- Assign every input lead to exactly one tier. Preserve each lead's exact name, company, and email.
- Infer priority from the company name / domain (e.g. fintech, growth-stage, dev tooling). This is a demo — plausible reasoning is fine; do NOT invent specific facts like funding amounts or headcount.
- "reason" and "action" must each be a single short sentence.
- "topFocus" must be the single most important lead to contact first.
- Output valid JSON only. No markdown, no commentary.`;

/**
 * Generate a structured, prioritized briefing for the given leads.
 * @param {Array<{name: string, email: string, company: string}>} leads
 * @returns {Promise<{date: string, tiers: Array, topFocus: object}>}
 */
export async function generateBriefing(leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error('generateBriefing() received no leads.');
  }

  const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const userPrompt =
    `Here are today's ${leads.length} leads:\n\n` +
    JSON.stringify(leads, null, 2) +
    '\n\nReturn the prioritized briefing JSON.';

  let parsed;
  if (provider === 'groq') {
    parsed = await generateWithGroq(userPrompt);
  } else if (provider === 'claude') {
    parsed = await generateWithClaude(userPrompt);
  } else {
    throw new Error(`Unknown AI_PROVIDER "${provider}". Use "groq" or "claude".`);
  }

  if (!Array.isArray(parsed.tiers) || !parsed.topFocus) {
    throw new Error('AI briefing JSON is missing required fields (tiers / topFocus).');
  }

  // Stamp the date (the model isn't asked to know "today").
  return { date: todayISO(), ...parsed };
}

/** Groq (free tier) — native JSON response format. */
async function generateWithGroq(userPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY. Set it in .env (free key at https://console.groq.com/keys).');
  }

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error('Groq returned an empty briefing.');
  }
  return parseJSON(raw, 'Groq');
}

/** Claude — prefill the assistant turn with "{" so it continues a JSON object. */
async function generateWithClaude(userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY. Set it in .env before generating a briefing.');
  }

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userPrompt },
      // Assistant prefill is supported on Haiku 4.5 (removed on Opus 4.6+/Sonnet 4.6).
      { role: 'assistant', content: '{' },
    ],
  });

  const continued = message.content?.[0]?.type === 'text' ? message.content[0].text : '';
  if (!continued) {
    throw new Error('Claude returned an empty briefing.');
  }
  return parseJSON('{' + continued, 'Claude');
}

function parseJSON(raw, label) {
  try {
    return JSON.parse(raw.trim());
  } catch {
    throw new Error(`${label} did not return valid JSON. Got:\n${raw.slice(0, 400)}`);
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A valid, briefing-shaped object for a day with NO new signups. Renders through
 * the same email template (empty tiers, a "nothing today" top-focus note) so we
 * can send a clean "no signups" email without calling the AI provider.
 * @returns {{date: string, tiers: Array, topFocus: object}}
 */
export function emptyBriefing() {
  return {
    date: todayISO(),
    tiers: [
      { name: 'High priority', leads: [] },
      { name: 'Medium priority', leads: [] },
      { name: 'Low priority', leads: [] },
    ],
    topFocus: {
      name: 'No new signups',
      company: 'yesterday',
      reason: 'Nothing to triage today — enjoy the quiet inbox.',
    },
  };
}
