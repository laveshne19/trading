'use strict';
// Minimal SMTP client (AUTH LOGIN) over implicit TLS (SMTP_SECURE=1, port 465) or plain TCP (dev/test servers).
// STARTTLS upgrade is not implemented. Status: unit-tested against a local fake SMTP server only; not verified with a real provider.
const net = require('node:net'); const tls = require('node:tls');

function create(env = process.env) {
  const host = env.SMTP_HOST; const port = Number(env.SMTP_PORT || 465); const secure = env.SMTP_SECURE !== '0'; const from = env.EMAIL_FROM;
  const configured = !!(host && from);
  function send({ to, subject, text }) {
    return new Promise((resolve) => {
      if (!configured) return resolve({ ok: false, status: 'not_configured', error: 'SMTP is not configured (SMTP_HOST, EMAIL_FROM).' });
      const sock = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
      let buf = ''; let step = 0; let done = false; const user = env.SMTP_USER; const pass = env.SMTP_PASS;
      const fin = (r) => { if (!done) { done = true; try { sock.destroy(); } catch { /* ignore */ } resolve(r); } };
      const clean = (s) => String(s).replace(/[\r\n]+/g, ' ');
      const addr = (s) => (/<([^>]+)>/.exec(s) || [null, s])[1].trim();
      const plan = [];
      plan.push(['EHLO pawhearth.local', 250]);
      if (user && pass) { plan.push(['AUTH LOGIN', 334]); plan.push([Buffer.from(user).toString('base64'), 334]); plan.push([Buffer.from(pass).toString('base64'), 235]); }
      plan.push([`MAIL FROM:<${addr(from)}>`, 250]); plan.push([`RCPT TO:<${addr(to)}>`, 250]); plan.push(['DATA', 354]);
      const body = [`From: ${clean(from)}`, `To: ${clean(to)}`, `Subject: ${clean(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', `Date: ${new Date().toUTCString()}`, '', String(text).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'), '.'].join('\r\n');
      plan.push([body, 250]); plan.push(['QUIT', 221]);
      sock.setTimeout(10000, () => fin({ ok: false, status: 'error', error: 'SMTP timeout' }));
      sock.on('error', (e) => fin({ ok: false, status: 'error', error: 'SMTP: ' + e.message }));
      sock.on('data', (d) => {
        buf += d.toString();
        if (!buf.endsWith('\r\n')) return;
        const last = buf.trimEnd().split('\r\n').pop();
        if (!/^\d{3}( |$)/.test(last)) return; // multi-line reply still arriving
        const code = Number(last.slice(0, 3)); buf = '';
        if (step === 0) { if (code !== 220) return fin({ ok: false, status: 'error', error: 'SMTP greeting ' + code }); }
        else { const exp = plan[step - 1][1]; if (code !== exp) return fin({ ok: false, status: 'error', error: `SMTP step ${step} expected ${exp} got ${code}` }); if (step === plan.length) return fin({ ok: true }); }
        sock.write(plan[step][0] + '\r\n'); step++;
      });
    });
  }
  return { name: 'email', label: 'Email (SMTP)', configured: () => configured, status: () => ({ configured, note: configured ? 'SMTP settings present; tested only against a local fake server.' : 'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.' }), send };
}
module.exports = { create };
