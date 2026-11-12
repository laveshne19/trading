'use strict';
// Blue Dart (DHL Group) API gateway adapter. Docs are issued with API onboarding (Apigee developer portal: https://apigateway.bluedart.com).
//  Auth: GET /in/transportation/token/v1/login  headers ClientID, clientSecret -> {JWTToken} (valid ~24h)
//  Serviceability: POST /in/transportation/finder/v1/GetServicesforPincode  header JWTToken; body {pinCode, profile:{LoginID, LicenceKey, Api_type:'S'}}
//  Waybill: POST /in/transportation/waybill/v1/GenerateWayBill  (large payload; wired minimally below)
//  Tracking: GET /in/transportation/tracking/v1/ (handler=tnt&action=custawbquery&...)
// Status: written from memory of the public gateway docs; field names MUST be verified against your onboarding documentation. NOT executed live.
const { request } = require('../http');
const { NC, fail } = require('./base');
const { timingSafeEq } = require('../../frontend/lib/util');

function create(env = process.env) {
  const id = env.BLUEDART_CLIENT_ID; const sec = env.BLUEDART_CLIENT_SECRET; const configured = !!(id && sec && env.BLUEDART_LOGIN_ID && env.BLUEDART_LICENCE_KEY);
  const base = env.BLUEDART_BASE_URL || 'https://apigateway.bluedart.com'; let jwt = null; let exp = 0;
  async function token() {
    if (jwt && Date.now() < exp) return jwt;
    const r = await request(base + '/in/transportation/token/v1/login', { headers: { ClientID: id, clientSecret: sec } });
    if (!r.json || !r.json.JWTToken) throw new Error('auth failed (HTTP ' + r.status + ')');
    jwt = r.json.JWTToken; exp = Date.now() + 20 * 36e5; return jwt;
  }
  const profile = () => ({ LoginID: env.BLUEDART_LOGIN_ID, LicenceKey: env.BLUEDART_LICENCE_KEY, Api_type: 'S' });
  return {
    name: 'bluedart', label: 'Blue Dart', configured: () => configured,
    status: () => ({ configured, note: configured ? 'Credentials present. Unverified against live gateway.' : 'Set BLUEDART_CLIENT_ID, BLUEDART_CLIENT_SECRET, BLUEDART_LOGIN_ID, BLUEDART_LICENCE_KEY.' }),
    async serviceability({ pin }) {
      if (!configured) return NC('Blue Dart', 'check serviceability');
      try {
        const r = await request(base + '/in/transportation/finder/v1/GetServicesforPincode', { method: 'POST', headers: { JWTToken: await token() }, body: { pinCode: String(pin), profile: profile() }, idempotent: true });
        const res = r.json && (r.json.GetServicesforPincodeResult || r.json);
        if (res && res.IsError === false) return { ok: true, serviceable: res.ApexInbound === 'Yes' || res.eTailCODAirInbound === 'Yes' || res.eTailPrePaidAirInbound === 'Yes' || res.eTailPrePaidGroundInbound === 'Yes', cod: res.eTailCODAirInbound === 'Yes' || res.eTailCODGroundInbound === 'Yes', etaDays: null };
        return { ok: false, status: 'error', error: (res && res.ErrorMessage) || 'Unexpected Blue Dart response' };
      } catch (e) { return fail('Blue Dart', e); }
    },
    async createOrder() { return configured ? { ok: false, status: 'error', error: 'Blue Dart GenerateWayBill payload is account-specific and not wired. Use the courier dashboard or extend this adapter with your onboarding spec.' } : NC('Blue Dart', 'create a waybill'); },
    async label() { return NC('Blue Dart', 'generate a label (not wired)'); },
    async track(awb) {
      if (!configured) return NC('Blue Dart', 'track a shipment');
      try { const r = await request(`${base}/in/transportation/tracking/v1/?handler=tnt&action=custawbquery&loginid=${encodeURIComponent(env.BLUEDART_LOGIN_ID)}&awb=awb&numbers=${encodeURIComponent(awb)}&format=json&lickey=${encodeURIComponent(env.BLUEDART_LICENCE_KEY)}&verno=1&scan=1`, { headers: { JWTToken: await token() } }); return r.json ? { ok: true, raw: r.json } : { ok: false, status: 'error', error: 'No tracking data' }; } catch (e) { return fail('Blue Dart', e); }
    },
    verifyWebhook(headers) { const t = env.BLUEDART_WEBHOOK_TOKEN; const got = headers['x-webhook-token']; return !!t && !!got && timingSafeEq(got, t); },
  };
}
module.exports = { create };
