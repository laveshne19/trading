'use strict';
// Shiprocket adapter. Official API docs: https://apidocs.shiprocket.in/  (base https://apiv2.shiprocket.in/v1/external)
//  POST /auth/login {email,password} -> {token} (token valid ~10 days; cached here for 9 days)
//  GET  /courier/serviceability/?pickup_postcode=&delivery_postcode=&weight=&cod=0|1
//  POST /orders/create/adhoc                  -> {order_id, shipment_id}
//  POST /courier/assign/awb {shipment_id, courier_id?}
//  POST /courier/generate/label {shipment_id:[...]}  -> {label_url}
//  GET  /courier/track/awb/{awb}
//  Webhook: Shiprocket sends the token you configure in the panel as header "x-api-key" (not an HMAC) -> compared timing-safe.
// Status: written from the public docs; NOT executed against a live account here. Request/response shapes may need adjusting.
const { request } = require('../http');
const { NC, fail } = require('./base');
const { timingSafeEq } = require('../../frontend/lib/util');

function create(env = process.env) {
  const email = env.SHIPROCKET_EMAIL; const password = env.SHIPROCKET_PASSWORD; const base = env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external';
  const configured = !!(email && password); let tok = null; let tokExp = 0;
  async function token() {
    if (tok && Date.now() < tokExp) return tok;
    const r = await request(base + '/auth/login', { method: 'POST', body: { email, password }, idempotent: true });
    if (!r.json || !r.json.token) throw new Error('auth failed (HTTP ' + r.status + ')');
    tok = r.json.token; tokExp = Date.now() + 9 * 864e5; return tok;
  }
  const authed = async (path, opts = {}) => request(base + path, { ...opts, headers: { Authorization: 'Bearer ' + (await token()), ...(opts.headers || {}) } });
  return {
    name: 'shiprocket', label: 'Shiprocket', configured: () => configured,
    status: () => ({ configured, webhookConfigured: !!env.SHIPROCKET_WEBHOOK_TOKEN, note: configured ? 'Credentials present. Not verified live.' : 'Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD (API user).' }),
    async serviceability({ pin, weightKg = 0.5, cod = false, pickupPin = env.PICKUP_PINCODE }) {
      if (!configured) return NC('Shiprocket', 'check serviceability');
      if (!pickupPin) return { ok: false, status: 'error', error: 'PICKUP_PINCODE is not set.' };
      try {
        const r = await authed(`/courier/serviceability/?pickup_postcode=${pickupPin}&delivery_postcode=${pin}&weight=${weightKg}&cod=${cod ? 1 : 0}`);
        const list = r.json && r.json.data && r.json.data.available_courier_companies;
        if (r.status === 200 && Array.isArray(list)) {
          const etds = list.map((c) => Number(c.estimated_delivery_days)).filter(Boolean);
          return { ok: true, serviceable: list.length > 0, cod: list.some((c) => c.cod === 1), etaDays: etds.length ? [Math.min(...etds), Math.max(...etds)] : null, couriers: list.slice(0, 5).map((c) => ({ id: c.courier_company_id, name: c.courier_name, rate: c.rate })) };
        }
        if (r.status === 404 || (r.json && r.json.status_code === 422)) return { ok: true, serviceable: false, cod: false, etaDays: null };
        return { ok: false, status: 'error', error: 'Unexpected Shiprocket response (HTTP ' + r.status + ')' };
      } catch (e) { return fail('Shiprocket', e); }
    },
    async createOrder(o) {
      if (!configured) return NC('Shiprocket', 'create an order');
      try {
        const a = o.address; const r = await authed('/orders/create/adhoc', { method: 'POST', body: {
          order_id: o.no, order_date: o.createdAt.slice(0, 16).replace('T', ' '), pickup_location: env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
          billing_customer_name: a.name.split(' ')[0], billing_last_name: a.name.split(' ').slice(1).join(' ') || '.', billing_address: a.line1, billing_address_2: a.line2 || '', billing_city: a.city, billing_pincode: a.pin, billing_state: a.state, billing_country: 'India', billing_email: o.email, billing_phone: a.phone,
          shipping_is_billing: true, order_items: o.items.map((i) => ({ name: i.title, sku: i.sku, units: i.qty, selling_price: i.unitPrice })), payment_method: o.payment.method === 'cod' ? 'COD' : 'Prepaid', sub_total: o.totals.total,
          length: 20, breadth: 15, height: 10, weight: Math.max(0.1, (o.weightG || 500) / 1000) } });
        if (r.json && r.json.order_id) return { ok: true, courierOrderId: String(r.json.order_id), shipmentId: String(r.json.shipment_id) };
        return { ok: false, status: 'error', error: (r.json && r.json.message) || 'Shiprocket rejected the order', httpStatus: r.status };
      } catch (e) { return fail('Shiprocket', e); }
    },
    async assignAwb({ shipmentId, courierId }) {
      if (!configured) return NC('Shiprocket', 'assign an AWB');
      try { const r = await authed('/courier/assign/awb', { method: 'POST', body: { shipment_id: shipmentId, ...(courierId ? { courier_id: courierId } : {}) } }); const d = r.json && r.json.response && r.json.response.data; return d && d.awb_code ? { ok: true, awb: d.awb_code, courier: d.courier_name } : { ok: false, status: 'error', error: (r.json && r.json.message) || 'AWB assignment failed' }; } catch (e) { return fail('Shiprocket', e); }
    },
    async label({ shipmentId }) {
      if (!configured) return NC('Shiprocket', 'generate a label');
      try { const r = await authed('/courier/generate/label', { method: 'POST', body: { shipment_id: [shipmentId] } }); return r.json && r.json.label_url ? { ok: true, url: r.json.label_url } : { ok: false, status: 'error', error: 'Label not available' }; } catch (e) { return fail('Shiprocket', e); }
    },
    async track(awb) {
      if (!configured) return NC('Shiprocket', 'track a shipment');
      try { const r = await authed('/courier/track/awb/' + encodeURIComponent(awb)); return r.json && r.json.tracking_data ? { ok: true, raw: r.json.tracking_data } : { ok: false, status: 'error', error: 'No tracking data' }; } catch (e) { return fail('Shiprocket', e); }
    },
    verifyWebhook(headers) { const t = env.SHIPROCKET_WEBHOOK_TOKEN; const got = headers['x-api-key']; return !!t && !!got && timingSafeEq(got, t); },
    // Map a Shiprocket tracking webhook payload to an internal order state (best-effort; statuses per Shiprocket docs).
    mapStatus(payload) {
      const s = String(payload.current_status || payload.shipment_status || '').toUpperCase();
      if (/OUT FOR DELIVERY/.test(s)) return 'out_for_delivery'; if (/^DELIVERED/.test(s)) return 'delivered'; if (/RTO/.test(s)) return 'rto';
      if (/(PICKED UP|IN TRANSIT|SHIPPED|REACHED|DISPATCH)/.test(s)) return 'shipped'; return null;
    },
  };
}
module.exports = { create };
