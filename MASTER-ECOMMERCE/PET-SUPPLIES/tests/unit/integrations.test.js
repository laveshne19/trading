'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const net = require('node:net'); const http = require('node:http');
const email = require('../../integrations/notify/email'); const shiprocket = require('../../integrations/shipping/shiprocket');
const { withRetry } = require('../../integrations/http'); const { backoffMs } = require('../../frontend/lib/webhooks'); const { toCsv } = require('../../frontend/views/admin');

test('SMTP client talks to a local fake server (plain, AUTH LOGIN)', async () => {
  const log = [];
  const srv = net.createServer((s) => { s.write('220 fake\r\n'); let data = false; let buf = ''; s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0 || (data && buf.endsWith('\r\n.\r\n'))) { if (data) { if (!buf.endsWith('\r\n.\r\n')) break; log.push('BODY:' + buf); buf = ''; data = false; s.write('250 queued\r\n'); break; } const l = buf.slice(0, i); buf = buf.slice(i + 2); log.push(l); if (/^EHLO/.test(l)) s.write('250-fake\r\n250 AUTH LOGIN\r\n'); else if (l === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n'); else if (/^MAIL|^RCPT/.test(l)) s.write('250 ok\r\n'); else if (l === 'DATA') { s.write('354 go\r\n'); data = true; } else if (l === 'QUIT') { s.write('221 bye\r\n'); s.end(); } else if (log.filter((x) => !x.startsWith('BODY')).length <= 5 && !/^(EHLO|MAIL|RCPT)/.test(l)) s.write(log.length === 3 ? '334 UGFzc3dvcmQ6\r\n' : '235 ok\r\n'); } }); });
  await new Promise((r) => srv.listen(0, r));
  const m = email.create({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(srv.address().port), SMTP_SECURE: '0', EMAIL_FROM: 'Shop <s@x.in>', SMTP_USER: 'u', SMTP_PASS: 'p' });
  const r = await m.send({ to: 'a@b.co', subject: 'Hi\r\nBcc: evil@x', text: 'line\n.dot' }); srv.close();
  assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(log.some((l) => l === 'RCPT TO:<a@b.co>')); assert.ok(log.find((l) => l.startsWith('BODY')).includes('Subject: Hi Bcc: evil@x'), 'header injection neutralised');
  assert.equal((await email.create({}).send({ to: 'a@b.co', subject: 's', text: 't' })).status, 'not_configured');
});
test('shiprocket adapter against a local fake API (auth + serviceability)', async () => {
  const seen = [];
  const srv = http.createServer((q, s) => { seen.push(q.method + ' ' + q.url + ' ' + (q.headers.authorization || '')); s.setHeader('content-type', 'application/json'); if (q.url.includes('/auth/login')) return s.end('{"token":"T1"}'); s.end(JSON.stringify({ data: { available_courier_companies: [{ courier_company_id: 1, courier_name: 'X', estimated_delivery_days: '3', cod: 1, rate: 50 }] } })); });
  await new Promise((r) => srv.listen(0, r));
  const a = shiprocket.create({ SHIPROCKET_EMAIL: 'e', SHIPROCKET_PASSWORD: 'p', SHIPROCKET_BASE_URL: `http://127.0.0.1:${srv.address().port}`, PICKUP_PINCODE: '110001' });
  const r = await a.serviceability({ pin: '560001', cod: true }); srv.close();
  assert.equal(r.ok, true); assert.equal(r.serviceable, true); assert.deepEqual(r.etaDays, [3, 3]); assert.match(seen[1], /Bearer T1/); assert.match(seen[1], /delivery_postcode=560001/);
  assert.equal(a.verifyWebhook({ 'x-api-key': 'z' }), false);
});
test('retry with backoff retries then succeeds; webhook backoff grows', async () => {
  let n = 0; const delays = []; const r = await withRetry(async () => { if (++n < 3) throw new Error('x'); return 'ok'; }, { retries: 3, sleepFn: async (ms) => delays.push(ms) });
  assert.equal(r, 'ok'); assert.equal(n, 3); assert.ok(delays[1] > delays[0]); assert.ok(backoffMs(3) > backoffMs(2));
});
test('CSV export neutralises formula injection', () => { assert.equal(toCsv([['=1+1', 'a,b', 'ok']]), "'=1+1,\"a,b\",ok\r\n"); });
