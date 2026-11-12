'use strict';
// Integration error/event log: data/logs/integrations.jsonl (never contains secrets or full PII).
const fs = require('fs');
const path = require('path');
function logEvent(dataDir, evt) {
  try {
    const dir = path.join(dataDir, 'logs'); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'integrations.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...evt }) + '\n', { mode: 0o600 });
  } catch (e) { /* logging must never crash the app */ }
}
function readLog(dataDir, limit = 200) {
  try { return fs.readFileSync(path.join(dataDir, 'logs', 'integrations.jsonl'), 'utf8').trim().split('\n').filter(Boolean).slice(-limit).reverse().map((l) => JSON.parse(l)); } catch { return []; }
}
module.exports = { logEvent, readLog };
