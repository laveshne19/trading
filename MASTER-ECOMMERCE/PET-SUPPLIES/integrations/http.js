'use strict';
// Minimal JSON HTTP client with timeout and retry/backoff (retries only idempotent requests: GET, or when opts.idempotent).
const https = require('node:https');
const http = require('node:http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, { retries = 2, baseMs = 300, shouldRetry = () => true, sleepFn = sleep } = {}) {
  let attempt = 0;
  for (;;) {
    try { return await fn(attempt); } catch (e) {
      if (attempt >= retries || !shouldRetry(e)) throw e;
      await sleepFn(baseMs * 2 ** attempt + Math.floor(Math.random() * 50)); attempt++;
    }
  }
}
function once(url, { method = 'GET', headers = {}, body, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const lib = u.protocol === 'http:' ? http : https;
    const data = body === undefined ? undefined : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    const h = { Accept: 'application/json', ...headers };
    if (data !== undefined && !h['Content-Type'] && !h['content-type']) h['Content-Type'] = 'application/json';
    if (data !== undefined) h['Content-Length'] = Buffer.byteLength(data);
    const req = lib.request(u, { method, headers: h, timeout: timeoutMs }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'); let json; try { json = JSON.parse(text); } catch { /* not json */ }
        const out = { status: res.statusCode, headers: res.headers, text, json };
        if (res.statusCode >= 500) { const e = new Error('HTTP ' + res.statusCode); e.response = out; e.retryable = true; return reject(e); }
        resolve(out);
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { retryable: true })));
    req.on('error', (e) => { e.retryable = true; reject(e); });
    if (data !== undefined) req.write(data);
    req.end();
  });
}
async function request(url, opts = {}) {
  const idem = (opts.method || 'GET') === 'GET' || opts.idempotent;
  return withRetry(() => once(url, opts), { retries: idem ? (opts.retries ?? 2) : 0, shouldRetry: (e) => !!e.retryable, baseMs: opts.baseMs || 300 });
}
module.exports = { request, withRetry, sleep };
