'use strict';
// Email (SMTP) + WhatsApp Cloud API. Reports 'not_configured' honestly and logs instead of pretending to send.
const net = require('net');
const tls = require('tls');
const https = require('https');
const { logEvent } = require('../log');

const emailStatus = () => (process.env.SMTP_HOST && process.env.SMTP_FROM ? 'configured_untested' : 'not_configured');
const waStatus = () => (process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configured_untested' : 'not_configured');
const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').slice(0, 300);

function smtpSend({ host, port, secure, user, pass, from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    let sock = secure ? tls.connect(port, host, { servername: host }) : net.connect(port, host);
    sock.setTimeout(15000, () => { sock.destroy(); reject(new Error('SMTP timeout')); });
    let buf = ''; let waiter = null; let upgraded = false;
    const onData = (d) => { buf += d.toString(); const lines = buf.split('\r\n'); if (lines.length > 1 && /^\d{3} /.test(lines[lines.length - 2] || '')) { const r = buf; buf = ''; if (waiter) { const w = waiter; waiter = null; w(r); } } };
    sock.on('data', onData); sock.on('error', reject);
    const read = () => new Promise((r) => (waiter = r));
    const cmd = async (c, expect) => { sock.write(c + '\r\n'); const r = await read(); if (!r.startsWith(expect)) throw new Error(`SMTP unexpected: ${r.slice(0, 80)}`); return r; };
    (async () => {
      const g = await read(); if (!g.startsWith('220')) throw new Error('SMTP greeting failed');
      let ehlo = await cmd('EHLO localhost', '250');
      if (!secure && /STARTTLS/i.test(ehlo)) {
        await cmd('STARTTLS', '220'); sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: host }); sock.on('data', onData); sock.on('error', reject); upgraded = true;
        ehlo = await cmd('EHLO localhost', '250');
      }
      if (user) { await cmd('AUTH LOGIN', '334'); await cmd(Buffer.from(user).toString('base64'), '334'); await cmd(Buffer.from(pass).toString('base64'), '235'); }
      await cmd(`MAIL FROM:<${from.replace(/[<>\r\n]/g, '')}>`, '250'); await cmd(`RCPT TO:<${to.replace(/[<>\r\n]/g, '')}>`, '25');
      await cmd('DATA', '354');
      const body = [`From: ${from}`, `To: ${to}`, `Subject: ${clean(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', text.replace(/^\./gm, '..')].join('\r\n');
      await cmd(body + '\r\n.', '250'); sock.write('QUIT\r\n'); sock.end(); resolve({ ok: true });
    })().catch(reject);
  });
}

async function sendEmail(dataDir, { to, subject, text }) {
  if (emailStatus() === 'not_configured') { logEvent(dataDir, { integration: 'email', status: 'not_configured', subject: clean(subject), note: 'SMTP env not set; email NOT sent' }); return { ok: false, status: 'not_configured' }; }
  try {
    await smtpSend({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === '1', user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.SMTP_FROM, to, subject, text });
    logEvent(dataDir, { integration: 'email', status: 'sent', subject: clean(subject) }); return { ok: true, status: 'sent' };
  } catch (e) { logEvent(dataDir, { integration: 'email', status: 'error', error: e.message }); return { ok: false, status: 'error', error: e.message }; }
}
function sendWhatsApp(dataDir, { to, text }) {
  if (waStatus() === 'not_configured') { logEvent(dataDir, { integration: 'whatsapp', status: 'not_configured', note: 'WhatsApp Cloud API env not set; message NOT sent' }); return Promise.resolve({ ok: false, status: 'not_configured' }); }
  return new Promise((resolve) => {
    const body = JSON.stringify({ messaging_product: 'whatsapp', to: String(to).replace(/\D/g, ''), type: 'text', text: { body: String(text).slice(0, 1000) } });
    const req = https.request({ method: 'POST', host: 'graph.facebook.com', path: `/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 }, (res) => {
      res.resume(); res.on('end', () => { const ok = res.statusCode < 300; logEvent(dataDir, { integration: 'whatsapp', status: ok ? 'sent' : 'error', http: res.statusCode }); resolve({ ok, status: ok ? 'sent' : 'error' }); });
    });
    req.on('error', (e) => { logEvent(dataDir, { integration: 'whatsapp', status: 'error', error: e.message }); resolve({ ok: false, status: 'error' }); });
    req.end(body);
  });
}
module.exports = { emailStatus, waStatus, sendEmail, sendWhatsApp };
