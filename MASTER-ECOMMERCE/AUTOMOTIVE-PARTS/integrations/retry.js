'use strict';
// Exponential backoff with jitter. `not_configured` results are NOT errors and are never retried.
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, { retries = 3, baseMs = 500, maxMs = 15000, sleep = sleepReal, onError = () => {}, jitter = true } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fn(attempt);
      if (res && res.ok === false && res.retryable) throw Object.assign(new Error(res.error || 'retryable failure'), { retryable: true });
      return res;
    } catch (err) {
      onError(err, attempt);
      if (attempt >= retries) return { ok: false, status: 'error', error: err.message, attempts: attempt + 1 };
      const delay = Math.min(maxMs, baseMs * 2 ** attempt) * (jitter ? 0.5 + Math.random() / 2 : 1);
      await sleep(delay); attempt++;
    }
  }
}
module.exports = { withRetry };
