// Provider-agnostic email sender.
//
// Picks the transport from EMAIL_PROVIDER (default "gmail"), or an explicit
// `provider` argument. The HTML body comes from the shared briefing template
// (email-template.js), so sent emails look identical to the web preview.
//   - gmail  : NodeMailer over Gmail SMTP (same pattern as send-test.mjs)
//   - resend : Resend transactional API

import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { renderBriefingEmail, renderBriefingText } from './email-template.js';

/**
 * Send a structured briefing email via the selected provider.
 * @param {{ subject: string, briefing: object, provider?: 'gmail'|'resend' }} opts
 * @returns {Promise<{ provider: string, id: string, to: string }>}
 */
export async function sendBriefing({ subject, briefing, provider }) {
  const chosen = (provider || process.env.EMAIL_PROVIDER || 'gmail').toLowerCase();
  const html = renderBriefingEmail(briefing);
  const text = renderBriefingText(briefing);

  if (chosen === 'resend') {
    return sendViaResend({ subject, text, html });
  }
  if (chosen === 'gmail') {
    return sendViaGmail({ subject, text, html });
  }
  throw new Error(`Unknown EMAIL_PROVIDER "${chosen}". Use "gmail" or "resend".`);
}

async function sendViaGmail({ subject, text, html }) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error(
      'Missing Gmail credentials. Set GMAIL_USER and GMAIL_APP_PASSWORD (16-char App Password) in .env.'
    );
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      // App Passwords are often shown with spaces — strip them so either form works.
      pass: GMAIL_APP_PASSWORD.replace(/\s+/g, ''),
    },
  });

  await transporter.verify();
  const info = await transporter.sendMail({
    from: `"Morning Briefing" <${GMAIL_USER}>`,
    to: GMAIL_USER, // send to yourself for testing
    subject,
    text,
    html,
  });

  return { provider: 'gmail', id: info.messageId, to: GMAIL_USER };
}

async function sendViaResend({ subject, text, html }) {
  const { RESEND_API_KEY, RESEND_FROM, RESEND_TO } = process.env;
  if (!RESEND_API_KEY || !RESEND_FROM || !RESEND_TO) {
    throw new Error(
      'Missing Resend config. Set RESEND_API_KEY, RESEND_FROM, and RESEND_TO in .env.'
    );
  }

  const resend = new Resend(RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: RESEND_FROM,
    to: RESEND_TO,
    subject,
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message || JSON.stringify(error)}`);
  }
  return { provider: 'resend', id: data?.id, to: RESEND_TO };
}
