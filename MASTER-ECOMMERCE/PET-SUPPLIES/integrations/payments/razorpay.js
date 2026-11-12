'use strict';
// Razorpay adapter. Docs: https://razorpay.com/docs/api/orders/ , https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#16-verify-payment-signature
// Status: NOT verified against a live account in this repo (no keys available). Signature maths is unit-tested against the documented algorithm.
const { request } = require('../http');
const { hmacHex, timingSafeEq } = require('../../frontend/lib/util');

function create(env = process.env) {
  const keyId = env.RAZORPAY_KEY_ID; const keySecret = env.RAZORPAY_KEY_SECRET; const whSecret = env.RAZORPAY_WEBHOOK_SECRET;
  const base = env.RAZORPAY_BASE_URL || 'https://api.razorpay.com';
  const configured = !!(keyId && keySecret);
  const auth = () => 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return {
    name: 'razorpay', label: 'Razorpay', configured: () => configured, keyId: () => keyId,
    status: () => ({ configured, webhookConfigured: !!whSecret, mode: keyId ? (keyId.startsWith('rzp_live') ? 'live' : 'test') : null, note: configured ? 'Keys present. Not verified live in this repository.' : 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' }),
    async createOrder({ orderNo, amountRupees, notes = {} }) {
      if (!configured) return { ok: false, status: 'not_configured', error: 'Razorpay is not configured.' };
      try {
        const r = await request(base + '/v1/orders', { method: 'POST', headers: { Authorization: auth() }, body: { amount: Math.round(amountRupees * 100), currency: 'INR', receipt: orderNo, notes: { orderNo, ...notes } } });
        if (r.status >= 200 && r.status < 300 && r.json && r.json.id) return { ok: true, gatewayOrderId: r.json.id, raw: { id: r.json.id, status: r.json.status } };
        return { ok: false, status: 'error', error: (r.json && r.json.error && r.json.error.description) || 'Razorpay rejected the order', httpStatus: r.status };
      } catch (e) { return { ok: false, status: 'error', error: 'Razorpay unreachable: ' + e.message }; }
    },
    // Checkout signature: HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret) as hex.
    verifyPayment({ orderId, paymentId, signature }) {
      if (!keySecret || !orderId || !paymentId || !signature) return false;
      return timingSafeEq(hmacHex(keySecret, `${orderId}|${paymentId}`), String(signature));
    },
    // Webhook: header X-Razorpay-Signature = HMAC_SHA256(rawBody, webhook_secret) hex.
    verifyWebhook(rawBody, signature) {
      if (!whSecret || !signature) return false;
      return timingSafeEq(hmacHex(whSecret, rawBody), String(signature));
    },
  };
}
module.exports = { create };
