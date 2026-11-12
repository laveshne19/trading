'use strict';
// DTDC adapter. DTDC API access (customer integration / Shipsy-hosted) is issued per customer account; endpoints below follow
// DTDC's published integration notes as best known and MUST be verified against the docs DTDC gives you at onboarding.
//  Consignment softdata (create): POST https://dtdcapi.shipsy.io/api/customer/integration/consignment/softdata   header: api-key
//  Tracking: POST https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails   header: X-Access-Token
// Serviceability: DTDC exposes a pincode service under the same customer integration; no public stable endpoint is wired here -> falls back to the local table.
// Status: STUB-LEVEL. Returns not_configured without env; with env it attempts the calls above; unverified.
const { request } = require('../http');
const { NC, fail } = require('./base');
const { timingSafeEq } = require('../../frontend/lib/util');

function create(env = process.env) {
  const apiKey = env.DTDC_API_KEY; const trackTok = env.DTDC_TRACKING_TOKEN; const configured = !!(apiKey && env.DTDC_CUSTOMER_CODE);
  const create_ = env.DTDC_CREATE_URL || 'https://dtdcapi.shipsy.io/api/customer/integration/consignment/softdata';
  const track_ = env.DTDC_TRACK_URL || 'https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails';
  return {
    name: 'dtdc', label: 'DTDC', configured: () => configured,
    status: () => ({ configured, note: configured ? 'Credentials present. Endpoints unverified; check DTDC onboarding docs.' : 'Set DTDC_API_KEY and DTDC_CUSTOMER_CODE (issued by DTDC).' }),
    async serviceability() { return configured ? { ok: false, status: 'error', error: 'DTDC pincode serviceability endpoint is not wired; using local estimate.' } : NC('DTDC', 'check serviceability'); },
    async createOrder(o) {
      if (!configured) return NC('DTDC', 'create a consignment');
      try {
        const a = o.address; const r = await request(create_, { method: 'POST', headers: { 'api-key': apiKey }, body: { consignments: [{ customer_code: env.DTDC_CUSTOMER_CODE, service_type_id: 'B2C PRIORITY', load_type: 'NON-DOCUMENT', description: 'Pet supplies', dimension_unit: 'cm', length: '20', width: '15', height: '10', weight_unit: 'kg', weight: String(Math.max(0.1, (o.weightG || 500) / 1000)), declared_value: String(o.totals.total), cod_amount: o.payment.method === 'cod' ? String(o.totals.total) : '0', cod_collection_mode: o.payment.method === 'cod' ? 'cash' : '', reference_number: o.no, num_pieces: '1', destination_details: { name: a.name, phone: a.phone, address_line_1: a.line1, address_line_2: a.line2 || '', pincode: a.pin, city: a.city, state: a.state } }] } });
        const d = r.json && r.json.data && r.json.data[0];
        return d && d.reference_number && d.success !== false ? { ok: true, awb: d.reference_number, courierOrderId: o.no } : { ok: false, status: 'error', error: (d && d.message) || 'DTDC rejected the consignment', httpStatus: r.status };
      } catch (e) { return fail('DTDC', e); }
    },
    async label() { return NC('DTDC', 'generate a label (not wired)'); },
    async track(awb) {
      if (!trackTok) return NC('DTDC', 'track a shipment');
      try { const r = await request(track_, { method: 'POST', headers: { 'X-Access-Token': trackTok }, body: { trkType: 'cnno', strcnno: awb, addtnlDtl: 'Y' } }); return r.json ? { ok: true, raw: r.json } : { ok: false, status: 'error', error: 'No tracking data' }; } catch (e) { return fail('DTDC', e); }
    },
    verifyWebhook(headers) { const t = env.DTDC_WEBHOOK_TOKEN; const got = headers['x-webhook-token']; return !!t && !!got && timingSafeEq(got, t); },
  };
}
module.exports = { create };
