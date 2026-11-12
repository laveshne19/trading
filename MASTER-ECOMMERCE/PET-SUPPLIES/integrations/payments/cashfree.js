'use strict';
// Cashfree PG adapter (Orders API v2023-08-01). Docs: https://docs.cashfree.com/reference/pg-new-apis-endpoint
// Webhook signature (v2023-08-01): base64(HMAC_SHA256(timestamp + rawBody, secretKey)) in x-webhook-signature, timestamp in x-webhook-timestamp.
// Status: NOT verified against a live account in this repository.
const { request } = require('../http');
const { hmacB64, timingSafeEq } = require('../../frontend/lib/util');

function create(env = process.env) {
  const appId = env.CASHFREE_APP_ID; const secret = env.CASHFREE_SECRET_KEY; const prod = env.CASHFREE_ENV === 'production';
  const base = env.CASHFREE_BASE_URL || (prod ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com');
  const configured = !!(appId && secret);
  const hdr = () => ({ 'x-client-id': appId, 'x-client-secret': secret, 'x-api-version': '2023-08-01' });
  return {
    name: 'cashfree', label: 'Cashfree', configured: () => configured, mode: () => (prod ? 'production' : 'sandbox'),
    status: () => ({ configured, webhookConfigured: configured, mode: configured ? (prod ? 'production' : 'sandbox') : null, note: configured ? 'Credentials present. Not verified live in this repository.' : 'Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.' }),
    async createOrder({ orderNo, amountRupees, customer, returnUrl, notifyUrl }) {
      if (!configured) return { ok: false, status: 'not_configured', error: 'Cashfree is not configured.' };
      try {
        const r = await request(base + '/pg/orders', { method: 'POST', headers: hdr(), body: { order_id: orderNo, order_amount: Number(amountRupees.toFixed(2)), order_currency: 'INR', customer_details: { customer_id: String(customer.id || 'guest-' + orderNo).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50), customer_phone: customer.phone, customer_email: customer.email, customer_name: customer.name }, order_meta: { return_url: returnUrl, notify_url: notifyUrl } } });
        if (r.status >= 200 && r.status < 300 && r.json && r.json.payment_session_id) return { ok: true, gatewayOrderId: r.json.cf_order_id ? String(r.json.cf_order_id) : orderNo, paymentSessionId: r.json.payment_session_id };
        return { ok: false, status: 'error', error: (r.json && r.json.message) || 'Cashfree rejected the order', httpStatus: r.status };
      } catch (e) { return { ok: false, status: 'error', error: 'Cashfree unreachable: ' + e.message }; }
    },
    // Never trust the browser redirect: fetch the order status server-side.
    async fetchOrderStatus(orderNo) {
      if (!configured) return { ok: false, status: 'not_configured' };
      try { const r = await request(`${base}/pg/orders/${encodeURIComponent(orderNo)}`, { headers: hdr() }); return r.json ? { ok: true, orderStatus: r.json.order_status, raw: { order_status: r.json.order_status } } : { ok: false, status: 'error' }; } catch (e) { return { ok: false, status: 'error', error: e.message }; }
    },
    verifyWebhook(rawBody, signature, timestamp) {
      if (!secret || !signature || !timestamp) return false;
      return timingSafeEq(hmacB64(secret, String(timestamp) + rawBody), String(signature));
    },
  };
}
module.exports = { create };
