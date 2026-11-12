'use strict';
const manual = require('./manual-queue');
const alibaba = require('./alibaba-api');
const { withRetry } = require('../retry');
const { logEvent } = require('../log');
const adapters = { 'manual-queue': manual, 'alibaba-api': alibaba };
const getAdapter = (name) => adapters[name] || manual;
// Submit with exponential backoff; every failure is logged. not_configured is returned as-is (never retried, never faked).
async function submitWithRetry(adapter, order, catalog, dataDir, opts = {}) {
  return withRetry(async () => {
    const r = await adapter.submitOrder(order, catalog);
    if (!r.ok && r.status !== 'not_configured') throw Object.assign(new Error(r.error || 'submit failed'), { retryable: true });
    return r;
  }, { retries: 3, baseMs: 800, ...opts, onError: (e, n) => logEvent(dataDir, { integration: 'supplier:' + adapter.id, op: 'submitOrder', order_no: order.order_no, attempt: n + 1, error: e.message }) });
}
module.exports = { adapters, getAdapter, submitWithRetry };
