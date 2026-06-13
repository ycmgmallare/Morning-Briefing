// Local preview server for the Morning Briefing email.
//
// Renders the SAME template used for real sends (email-template.js) so you can
// preview the email as a webpage. No external deps — just Node's http module.
//
//   node serve.mjs            -> http://localhost:3000
//
// Routes:
//   /            the rendered email (static SAMPLE_BRIEFING)
//   /healthz     plain "ok" for tunnels/uptime checks

import http from 'node:http';
import { renderBriefingEmail, SAMPLE_BRIEFING } from './email-template.js';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (url === '/' || url === '/index.html') {
    const html = renderBriefingEmail(SAMPLE_BRIEFING);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n📨 Morning Briefing preview running:`);
  console.log(`   → http://localhost:${PORT}\n`);
  console.log(`   (Renders the same template used for real email sends.)`);
  console.log(`   Stop with Ctrl+C.\n`);
});
