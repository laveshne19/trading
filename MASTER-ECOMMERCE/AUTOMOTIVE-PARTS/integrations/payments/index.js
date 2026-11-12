'use strict';
// Payment adapter registry. PREPAID ONLY. Providers expose: id, label, status(), createOrder(order), verifyPayment(payload), verifyWebhook(raw, headers).
const crypto = require('crypto');
const https = require('https');

const timingEq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };
const PREPAID_METHODS = new Set(['razorpay', 'cashfree', 'mock']);
function assertPrepaid(method) {
  const m = String(method || '').toLowerCase();
  if (/cod|cash.?on.?delivery|pay.?on.?delivery|pod/.test(m)) return { ok: false, error: 'Cash on delivery is not available. Orders are prepaid only.' };
  if (!PREPAID_METHODS.has(m)) return { ok: false, error: 'Unknown payment method' };
  return { ok: true, method: m };
}

function httpsJson(method, host, pathName, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({ method, host, path: pathName, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers }, timeout: 15000 }, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c)); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }); } catch { resolve({ status: res.statusCode, json: { raw: buf.slice(0, 200) } }); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    if (data) req.write(data); req.end();
  });
}

// ---- Razorpay ----
const razorpay = {
  id: 'razorpay', label: 'Razorpay (UPI, cards, netbanking)',
  status: () => (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? 'configured' : 'not_configured'),
  verifyPaymentSignature(orderId, paymentId, signature, secret = process.env.RAZORPAY_KEY_SECRET) {
    if (!secret || !orderId || !paymentId || !signature) return false;
    return timingEq(crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex'), signature);
  },
  verifyWebhookSignature(rawBody, signature, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
    if (!secret || !signature) return false;
    return timingEq(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), signature);
  },
  async createOrder(order) {
    if (razorpay.status() !== 'configured') return { ok: false, status: 'not_configured', error: 'Razorpay keys are not set' };
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const r = await httpsJson('POST', 'api.razorpay.com', '/v1/orders', { Authorization: `Basic ${auth}` }, { amount: Math.round(order.totals.total * 100), currency: 'INR', receipt: order.order_no });
    if (r.status >= 200 && r.status < 300) return { ok: true, provider_order_id: r.json.id, key_id: process.env.RAZORPAY_KEY_ID, amount: r.json.amount };
    return { ok: false, status: 'error', error: `Razorpay HTTP ${r.status}`, retryable: r.status >= 500 };
  },
  verifyPayment(p) { return razorpay.verifyPaymentSignature(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature); },
  verifyWebhook(raw, headers) { return razorpay.verifyWebhookSignature(raw, headers['x-razorpay-signature']); },
};

// ---- Cashfree ----
const cashfree = {
  id: 'cashfree', label: 'Cashfree Payments',
  status: () => (process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY ? 'configured' : 'not_configured'),
  // signature = base64(HMAC_SHA256(timestamp + rawBody, secretKey))
  verifyWebhookSignature(rawBody, timestamp, signature, secret = process.env.CASHFREE_SECRET_KEY) {
    if (!secret || !timestamp || !signature) return false;
    return timingEq(crypto.createHmac('sha256', secret).update(String(timestamp) + rawBody).digest('base64'), signature);
  },
  async createOrder(order) {
    if (cashfree.status() !== 'configured') return { ok: false, status: 'not_configured', error: 'Cashfree keys are not set' };
    const host = process.env.CASHFREE_ENV === 'production' ? 'api.cashfree.com' : 'sandbox.cashfree.com';
    const r = await httpsJson('POST', host, '/pg/orders', { 'x-client-id': process.env.CASHFREE_APP_ID, 'x-client-secret': process.env.CASHFREE_SECRET_KEY, 'x-api-version': '2023-08-01' },
      { order_id: order.order_no, order_amount: order.totals.total, order_currency: 'INR', customer_details: { customer_id: order.order_no, customer_phone: order.shipping.phone, customer_email: order.email } });
    if (r.status >= 200 && r.status < 300) return { ok: true, provider_order_id: r.json.cf_order_id || r.json.order_id, payment_session_id: r.json.payment_session_id };
    return { ok: false, status: 'error', error: `Cashfree HTTP ${r.status}`, retryable: r.status >= 500 };
  },
  verifyPayment() { return false; }, // Cashfree is confirmed via webhook / order fetch only
  verifyWebhook(raw, headers) { return cashfree.verifyWebhookSignature(raw, headers['x-webhook-timestamp'], headers['x-webhook-signature']); },
};

// ---- DEV mock gateway: NEVER available in production ----
const mock = {
  id: 'mock', label: 'DEV MOCK GATEWAY - no real payment',
  status: () => (process.env.NODE_ENV !== 'production' && process.env.DEV_MOCK_PAYMENT === '1' ? 'dev_only' : 'disabled'),
  async createOrder(order) { if (mock.status() !== 'dev_only') return { ok: false, status: 'not_configured', error: 'Mock gateway disabled' }; return { ok: true, provider_order_id: `mock_${order.order_no}` }; },
  verifyPayment() { return mock.status() === 'dev_only'; },
  verifyWebhook() { return false; },
};
const providers = { razorpay, cashfree, mock };
function available() { return Object.values(providers).filter((p) => ['configured', 'dev_only'].includes(p.status())); }
module.exports = { providers, available, assertPrepaid, httpsJson, timingEq, razorpay, cashfree, mock };
