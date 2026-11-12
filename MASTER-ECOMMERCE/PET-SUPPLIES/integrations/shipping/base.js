'use strict';
// Shared helpers for courier adapters. Contract (every method returns a plain object, never throws):
//   configured()                      -> boolean
//   status()                          -> { configured, note, ... }
//   serviceability({pin, weightKg, cod}) -> { ok, serviceable?, etaDays?, cod?, couriers? } | { ok:false, status:'not_configured'|'error' }
//   createOrder(order) / assignAwb / label / track(awb)
//   verifyWebhook(headers, rawBody)   -> boolean   (timing-safe)
// Adapters NEVER fabricate success: when env credentials are missing they return {ok:false,status:'not_configured'}.
const NC = (name, what) => ({ ok: false, status: 'not_configured', error: `${name} is not configured; cannot ${what}.` });
const fail = (name, e) => ({ ok: false, status: 'error', error: `${name}: ${e && e.message ? e.message : String(e)}` });
module.exports = { NC, fail };
