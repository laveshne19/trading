'use strict';
// Builds the ONLY data the supplier receives. WHITELIST approach: anything not listed here (KYC, GST, email, payment ids, account, IP, notes) is never sent.
function buildSupplierPayload(order, catalog) {
  return {
    reference: order.order_no,
    items: order.lines.map((l) => {
      const p = catalog.bySku.get(l.sku) || {};
      const c = (order.compat && order.compat[l.sku]) || {};
      return {
        supplier_sku: l.sku, supplier_ref: p.supplier_ref || null, title_raw: p.title_raw || l.title, oem_numbers: p.oem_numbers || [], quantity: l.qty,
        fitment: { make: c.make || null, model: c.model || null, year: c.year || null, generation: c.generation || null, drive: c.drive || null, side: c.side || null, position: c.position || null },
      };
    }),
    ship_to: { name: order.shipping.name, line1: order.shipping.line1, line2: order.shipping.line2 || '', city: order.shipping.city, state: order.shipping.state, postal_code: order.shipping.postal_code, country: order.shipping.country, phone: order.shipping.phone },
  };
}
const FORBIDDEN_KEYS = ['email', 'kyc', 'gst', 'gstin', 'pan', 'aadhaar', 'payment', 'account', 'password', 'access_token', 'idem_key', 'consent'];
function assertNoPII(payload) { // defensive check used in tests and before sending
  const s = JSON.stringify(payload).toLowerCase();
  return FORBIDDEN_KEYS.filter((k) => s.includes(`"${k}`));
}
module.exports = { buildSupplierPayload, assertNoPII };
