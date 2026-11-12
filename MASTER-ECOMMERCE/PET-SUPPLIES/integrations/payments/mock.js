'use strict';
// DEV-ONLY mock gateway. Only active when NODE_ENV != production AND DEV_MOCK_PAYMENT=1. Never moves real money.
// It still exercises the same signature-verification path: the "gateway" signs {orderId|paymentId} with a dev secret.
const crypto = require('node:crypto');
const { hmacHex, timingSafeEq } = require('../../frontend/lib/util');

function create({ enabled, secret }) {
  const devSecret = 'dev-mock-secret-' + (secret || 'x').slice(0, 16);
  return {
    name: 'mock', label: 'DEV MOCK PAYMENT', configured: () => !!enabled,
    status: () => ({ configured: !!enabled, mode: 'dev-mock', note: enabled ? 'DEV ONLY - no real payment is taken.' : 'Disabled (requires NODE_ENV != production and DEV_MOCK_PAYMENT=1).' }),
    async createOrder({ orderNo }) { return enabled ? { ok: true, gatewayOrderId: 'mock_' + crypto.randomBytes(6).toString('hex') + '_' + orderNo } : { ok: false, status: 'not_configured', error: 'Mock payments are disabled.' }; },
    sign(orderId, paymentId) { return hmacHex(devSecret, `${orderId}|${paymentId}`); },
    verifyPayment({ orderId, paymentId, signature }) { return !!enabled && timingSafeEq(hmacHex(devSecret, `${orderId}|${paymentId}`), String(signature || '')); },
  };
}
module.exports = { create };
