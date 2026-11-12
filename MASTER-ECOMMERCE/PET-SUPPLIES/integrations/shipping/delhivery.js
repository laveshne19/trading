'use strict';
// Delhivery (One / Express API) adapter. Docs: https://one.delhivery.com/developer-portal/documents (API access is account-specific).
//  Auth header: Authorization: Token <API token>
//  Prod base https://track.delhivery.com, staging https://staging-express.delhivery.com
//  GET  /c/api/pin-codes/json/?filter_codes=<pin>     -> delivery_codes[0].postal_code {pre_paid, cod, ...}
//  POST /api/cmu/create.json  (form: format=json&data={shipments:[...],pickup_location:{name}})
//  GET  /api/v1/packages/json/?waybill=<awb>          -> ShipmentData[0].Shipment.Status
//  GET  /api/p/packing_slip?wbns=<awb>&pdf=true       -> label
// Status: written from the public docs; NOT executed against a live account here.
const { request } = require('../http');
const { NC, fail } = require('./base');
const { timingSafeEq } = require('../../frontend/lib/util');

function create(env = process.env) {
  const tokenV = env.DELHIVERY_API_TOKEN; const configured = !!tokenV;
  const base = env.DELHIVERY_BASE_URL || (env.DELHIVERY_ENV === 'production' ? 'https://track.delhivery.com' : 'https://staging-express.delhivery.com');
  const H = () => ({ Authorization: 'Token ' + tokenV });
  return {
    name: 'delhivery', label: 'Delhivery', configured: () => configured,
    status: () => ({ configured, webhookConfigured: !!env.DELHIVERY_WEBHOOK_TOKEN, note: configured ? 'Token present. Not verified live.' : 'Set DELHIVERY_API_TOKEN.' }),
    async serviceability({ pin }) {
      if (!configured) return NC('Delhivery', 'check serviceability');
      try {
        const r = await request(`${base}/c/api/pin-codes/json/?filter_codes=${pin}`, { headers: H() });
        const d = r.json && r.json.delivery_codes;
        if (r.status === 200 && Array.isArray(d)) { const pc = d[0] && d[0].postal_code; return { ok: true, serviceable: !!pc && (pc.pre_paid === 'Y' || pc.cod === 'Y'), cod: !!pc && pc.cod === 'Y', etaDays: null }; }
        return { ok: false, status: 'error', error: 'Unexpected Delhivery response (HTTP ' + r.status + ')' };
      } catch (e) { return fail('Delhivery', e); }
    },
    async createOrder(o) {
      if (!configured) return NC('Delhivery', 'create a shipment');
      try {
        const a = o.address; const data = { shipments: [{ name: a.name, add: [a.line1, a.line2].filter(Boolean).join(', '), pin: a.pin, city: a.city, state: a.state, country: 'India', phone: a.phone, order: o.no, payment_mode: o.payment.method === 'cod' ? 'COD' : 'Prepaid', cod_amount: o.payment.method === 'cod' ? o.totals.total : 0, total_amount: o.totals.total, quantity: o.items.reduce((s, i) => s + i.qty, 0), weight: o.weightG || 500, products_desc: o.items.map((i) => i.title).join(', ').slice(0, 200) }], pickup_location: { name: env.DELHIVERY_PICKUP_NAME } };
        const r = await request(base + '/api/cmu/create.json', { method: 'POST', headers: { ...H(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'format=json&data=' + encodeURIComponent(JSON.stringify(data)) });
        const pk = r.json && r.json.packages && r.json.packages[0];
        return pk && pk.waybill ? { ok: true, awb: pk.waybill, courierOrderId: pk.refnum || o.no } : { ok: false, status: 'error', error: (r.json && (r.json.rmk || r.json.error)) || 'Delhivery rejected the shipment', httpStatus: r.status };
      } catch (e) { return fail('Delhivery', e); }
    },
    async label({ awb }) { if (!configured) return NC('Delhivery', 'fetch a label'); return { ok: true, url: `${base}/api/p/packing_slip?wbns=${encodeURIComponent(awb)}&pdf=true`, note: 'Requires Authorization header; fetch server-side.' }; },
    async track(awb) {
      if (!configured) return NC('Delhivery', 'track a shipment');
      try { const r = await request(`${base}/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`, { headers: H() }); const s = r.json && r.json.ShipmentData && r.json.ShipmentData[0] && r.json.ShipmentData[0].Shipment; return s ? { ok: true, raw: { status: s.Status } } : { ok: false, status: 'error', error: 'No tracking data' }; } catch (e) { return fail('Delhivery', e); }
    },
    verifyWebhook(headers) { const t = env.DELHIVERY_WEBHOOK_TOKEN; const got = headers['x-webhook-token'] || headers.authorization; return !!t && !!got && timingSafeEq(got, t); },
  };
}
module.exports = { create };
