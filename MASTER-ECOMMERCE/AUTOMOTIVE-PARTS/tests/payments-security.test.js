'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const crypto = require('crypto'); const http = require('http');
const pay = require('../integrations/payments');
const { hmacB64, hmacHex } = require('../frontend/lib/util');
const { buildSupplierPayload, assertNoPII } = require('../integrations/supplier/payload');
const { validateUpload, parseMultipart, MAX_BYTES } = require('../frontend/lib/uploads');
const { withRetry } = require('../integrations/retry');
const alibaba = require('../integrations/supplier/alibaba-api'); const manual = require('../integrations/supplier/manual-queue');
const { hashPassword, verifyPassword } = require('../frontend/lib/accounts');
const { RateLimiter } = require('../frontend/lib/security');
const { rowsToProducts } = require('../catalog/tools/import_supplier_csv');
const seo = require('../frontend/lib/seo');
const { catalogFor, tmp } = require('./helpers');

test('Razorpay payment signature: valid passes, tampered fails', () => {
  const secret = 'rzp_secret'; const sig = crypto.createHmac('sha256', secret).update('order_X|pay_Y').digest('hex');
  assert.equal(pay.razorpay.verifyPaymentSignature('order_X', 'pay_Y', sig, secret), true);
  assert.equal(pay.razorpay.verifyPaymentSignature('order_X', 'pay_Z', sig, secret), false);
  assert.equal(pay.razorpay.verifyPaymentSignature('order_X', 'pay_Y', sig, ''), false);
  assert.equal(pay.razorpay.verifyPaymentSignature('order_X', 'pay_Y', 'short', secret), false);
});
test('Razorpay + Cashfree webhook signatures (raw body, timing-safe)', () => {
  const body = '{"event":"payment.captured"}';
  assert.equal(pay.razorpay.verifyWebhookSignature(body, hmacHex('whsec', body), 'whsec'), true);
  assert.equal(pay.razorpay.verifyWebhookSignature(body + ' ', hmacHex('whsec', body), 'whsec'), false);
  const ts = '1700000000'; const cf = crypto.createHmac('sha256', 'cfsecret').update(ts + body).digest('base64');
  assert.equal(pay.cashfree.verifyWebhookSignature(body, ts, cf, 'cfsecret'), true);
  assert.equal(pay.cashfree.verifyWebhookSignature(body, '1700000001', cf, 'cfsecret'), false);
});
test('adapters report not_configured without keys; mock disabled in production', () => {
  const keep = { ...process.env }; for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'DEV_MOCK_PAYMENT']) delete process.env[k];
  assert.equal(pay.razorpay.status(), 'not_configured'); assert.equal(pay.cashfree.status(), 'not_configured'); assert.equal(pay.mock.status(), 'disabled');
  process.env.DEV_MOCK_PAYMENT = '1'; process.env.NODE_ENV = 'production'; assert.equal(pay.mock.status(), 'disabled');
  process.env.NODE_ENV = 'development'; assert.equal(pay.mock.status(), 'dev_only');
  Object.assign(process.env, keep); if (!keep.DEV_MOCK_PAYMENT) delete process.env.DEV_MOCK_PAYMENT; if (!keep.NODE_ENV) delete process.env.NODE_ENV;
});
test('COD / unknown methods rejected by assertPrepaid', () => {
  for (const m of ['cod', 'cash on delivery', 'COD', 'pay on delivery', 'cheque', '']) assert.equal(pay.assertPrepaid(m).ok, false, m);
  for (const m of ['razorpay', 'cashfree', 'mock']) assert.equal(pay.assertPrepaid(m).ok, true);
});
test('supplier payload strips KYC / PII not needed by supplier', () => {
  const cat = catalogFor(); const p = cat.products[5];
  const order = { order_no: 'AP-1001', email: 'secret@buyer.com', access_token: 'tok', idem_key: 'idem', user_id: 'u1', kyc: { flagged: true, document: 'abc.pdf', consent_at: 'x' },
    business: { name: 'Acme', gstin: '27AAPFU0939F1ZV', consent: true }, payment: { provider: 'razorpay', id: 'pay_123', provider_order_id: 'order_9' }, ack: {},
    shipping: { name: 'Buyer', line1: '1 Rd', line2: '', city: 'Pune', state: 'MH', postal_code: '411001', country: 'IN', phone: '+919999999999' },
    lines: [{ sku: p.sku, title: p.title, qty: 2, unit: 100, total: 200 }], compat: { [p.sku]: { make: 'BMW', model: '3', year: 2014, drive: 'RHD', side: 'left', position: 'front', oem_ack: true } }, totals: { total: 200 } };
  const payload = buildSupplierPayload(order, cat); const s = JSON.stringify(payload);
  for (const leak of ['secret@buyer.com', 'abc.pdf', '27AAPFU0939F1ZV', 'Acme', 'pay_123', 'order_9', 'tok', 'idem', 'u1', 'razorpay', '"totals"', '"unit"']) assert.ok(!s.includes(leak), `leaked ${leak}`);
  assert.deepEqual(assertNoPII(payload), []);
  assert.equal(payload.ship_to.phone, '+919999999999'); assert.equal(payload.items[0].quantity, 2);
  assert.ok(assertNoPII({ kyc: 1 }).includes('kyc'));
});
test('upload validation: type, magic bytes, size', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  const pdf = Buffer.from('%PDF-1.4 test'); const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
  assert.equal(validateUpload('a.png', png).ok, true); assert.equal(validateUpload('a.JPG', jpg).ok, true); assert.equal(validateUpload('a.jpeg', jpg).ok, true);
  assert.equal(validateUpload('a.pdf', pdf).ok, true); assert.equal(validateUpload('a.webp', webp).ok, true);
  assert.equal(validateUpload('evil.exe', png).ok, false); assert.equal(validateUpload('a.svg', Buffer.from('<svg/>')).ok, false); assert.equal(validateUpload('a.html', Buffer.from('<html>')).ok, false);
  assert.equal(validateUpload('a.png', jpg).ok, false, 'content/extension mismatch'); assert.equal(validateUpload('a.png', Buffer.from('not an image')).ok, false);
  assert.equal(validateUpload('big.png', Buffer.concat([png, Buffer.alloc(MAX_BYTES)])).ok, false); assert.equal(validateUpload('e.png', Buffer.alloc(0)).ok, false);
});
test('multipart parser extracts fields and files', () => {
  const b = '----x'; const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="name"\r\n\r\nAmit\r\n--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), Buffer.from([1, 2, 3, 0xff]), Buffer.from(`\r\n--${b}--\r\n`)]);
  const r = parseMultipart(body, `multipart/form-data; boundary=${b}`);
  assert.equal(r.fields.name, 'Amit'); assert.equal(r.files.length, 1); assert.deepEqual([...r.files[0].data], [1, 2, 3, 0xff]); assert.equal(r.files[0].filename, 'a.png');
});
test('retry: exponential backoff, not_configured is not retried, final failure logged', async () => {
  const waits = []; let n = 0;
  const r = await withRetry(async () => { n++; if (n < 3) throw new Error('boom'); return { ok: true }; }, { retries: 3, baseMs: 100, jitter: false, sleep: async (ms) => waits.push(ms) });
  assert.equal(r.ok, true); assert.deepEqual(waits, [100, 200]);
  const w2 = []; const f = await withRetry(async () => { throw new Error('down'); }, { retries: 2, baseMs: 50, jitter: false, sleep: async (ms) => w2.push(ms) });
  assert.equal(f.ok, false); assert.equal(f.attempts, 3); assert.deepEqual(w2, [50, 100]);
  const r3 = await alibaba.submitOrder({}); assert.equal(r3.ok, false); assert.equal(r3.status, 'not_configured');
  assert.equal((await manual.submitOrder({ order_no: 'AP-1', lines: [], compat: {}, shipping: {} }, { bySku: new Map() })).status, 'queued');
});
test('password hashing uses scrypt with per-user salt', () => {
  const a = hashPassword('correct horse'), b = hashPassword('correct horse');
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.hash, b.hash); assert.equal(verifyPassword('correct horse', a), true); assert.equal(verifyPassword('wrong', a), false); assert.ok(!a.hash.includes('correct'));
});
test('rate limiter blocks after limit and recovers after window', () => {
  const l = new RateLimiter(); for (let i = 0; i < 3; i++) assert.ok(l.check('k', 3, 1000, 0)); assert.equal(l.check('k', 3, 1000, 10), false); assert.ok(l.check('k', 3, 1000, 2000));
});
test('CSV import validates the column spec', () => {
  const ok = rowsToProducts('sku,title_raw,category,brand,oem_numbers,year_from,side,price_inr\nS1,Led Module,headlights/led-modules-boards,BMW,123|456,2015,left,\n');
  assert.equal(ok.errors.length, 0); assert.deepEqual(ok.products[0].oem_numbers, ['123', '456']); assert.equal(ok.products[0].price_inr, null); assert.equal(ok.products[0].year_from, 2015);
  assert.ok(rowsToProducts('sku,title_raw,category,brand\n,x,y,z\n').errors.length > 0);
});
test('JSON-LD: Product has no aggregateRating; offers omitted without real price or when dev price', () => {
  const cat = catalogFor(); const p = cat.products[0]; const cfg = { siteUrl: 'https://x.test', siteName: 'X' };
  for (const price of [null, { amount: 100, dev: true }]) { const j = seo.product(cfg, p, price); assert.equal('offers' in j, false); assert.equal('aggregateRating' in j, false); assert.equal('review' in j, false); }
  const j = seo.product(cfg, p, { amount: 100, dev: false }); assert.equal(j.offers.price, '100'); assert.equal('aggregateRating' in j, false);
});

// ---- HTTP level: CSRF, COD over the wire, Shopify webhook HMAC (raw body) ----
const { createApp } = require('../frontend/server');
function req(port, method, path_, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => { const r = http.request({ port, method, path: path_, headers }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); }); r.on('error', reject); if (body) r.write(body); r.end(); });
}
test('HTTP: CSRF enforced; COD impossible; Shopify webhook HMAC verified on raw body', async () => {
  process.env.SHOPIFY_WEBHOOK_SECRET = 'shpsecret'; process.env.DEV_MOCK_PAYMENT = '1'; delete process.env.NODE_ENV;
  const app = createApp({ dataDir: tmp(), devDemoPrices: true, devMockPayment: true, isProd: false, port: 0 });
  await new Promise((r) => app.server.listen(0, r)); const port = app.server.address().port;
  try {
    const home = await req(port, 'GET', '/'); const cookie = home.headers['set-cookie'][0].split(';')[0]; const csrf = /name="csrf" content="([^"]+)"/.exec(home.body)[1];
    assert.match(home.headers['content-security-policy'], /default-src 'self'/); assert.equal(home.headers['x-content-type-options'], 'nosniff');
    const noToken = await req(port, 'POST', '/cart/add', { headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: 'sku=x' }); assert.equal(noToken.status, 403);
    const sku = app.catalog.products[0].sku;
    const add = await req(port, 'POST', '/cart/add', { headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: `_csrf=${csrf}&sku=${sku}&qty=1` }); assert.equal(add.status, 200);
    const form = new URLSearchParams({ _csrf: csrf, idem: 'i1', name: 'A', email: 'a@b.co', phone: '9876543210', line1: 'x', city: 'Pune', state: 'MH', postal_code: '411001', country: 'IN', duties_ack: 'on', payment_method: 'cod' });
    for (const [k, v] of Object.entries({ make: 'BMW', model: '3', year: '2014', drive: 'RHD', side: 'left', position: 'front', oem_ack: 'on', fit_ack: 'on', high_ack: 'on' })) form.set(`compat[${sku}][${k}]`, v);
    const cod = await req(port, 'POST', '/checkout', { headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    assert.equal(cod.status, 400); assert.match(cod.body, /Cash on delivery is not available/); assert.equal(app.orders.all().length, 0);
    form.set('payment_method', 'mock'); const okp = await req(port, 'POST', '/checkout', { headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    assert.equal(okp.status, 303); assert.equal(app.orders.all().length, 1); assert.equal(app.orders.all()[0].status, 'pending_payment');
    const dup = await req(port, 'POST', '/checkout', { headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() }); assert.equal(app.orders.all().length, 1, 'double submit is idempotent');
    const payload = JSON.stringify({ id: 1, name: '#1001', total_price: '10.00', currency: 'INR' });
    assert.equal((await req(port, 'POST', '/webhooks/shopify/orders-paid', { headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': 'bad' }, body: payload })).status, 401);
    assert.equal((await req(port, 'POST', '/webhooks/shopify/orders-paid', { headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': hmacB64('shpsecret', payload) }, body: payload })).status, 200);
    assert.equal((await req(port, 'POST', '/webhooks/shopify/orders-paid', { headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': hmacB64('shpsecret', payload) }, body: payload + ' ' })).status, 401);
    assert.equal((await req(port, 'GET', '/admin')).status, 401);
    assert.equal((await req(port, 'GET', '/admin', { headers: { authorization: 'Basic ' + Buffer.from('admin:admin-dev-pass').toString('base64') } })).status, 200);
  } finally { app.server.close(); delete process.env.SHOPIFY_WEBHOOK_SECRET; delete process.env.DEV_MOCK_PAYMENT; }
});
test('production safety: admin disabled without credentials; SESSION_SECRET required', () => {
  assert.throws(() => createApp({ isProd: true, sessionSecret: '', dataDir: tmp() }), /SESSION_SECRET/);
  const a = createApp({ isProd: true, sessionSecret: 'x'.repeat(32), admin: { enabled: false }, dataDir: tmp() }); assert.equal(a.cfg.admin.enabled, false);
});
