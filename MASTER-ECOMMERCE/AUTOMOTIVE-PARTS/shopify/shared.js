'use strict';
// Shared mapping from catalog/data/products.json to Shopify fields. No invented data: unknowns become explicit "to be confirmed" text.
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function loadAll() {
  const products = read('catalog/data/products.json').products;
  const site = read('config/site.json');
  let prices = {}; try { prices = read('catalog/pricing.json').prices || {}; } catch {}
  return { products, site, prices };
}
function bodyHtml(p, site) {
  return `<p>${esc(p.title)}.</p><p><strong>Supplier-listed fitment, confirm before ordering.</strong> Fitment has not been independently verified.</p>` +
    `<ul>${p.oem_numbers.length ? `<li>OEM reference: ${esc(p.oem_numbers.join(', '))}</li>` : ''}<li>Condition: to be confirmed with supplier</li><li>Ships from ${esc(site.shipping_origin)}</li><li>${esc(site.warranty.summary)}</li></ul>`;
}
function metafields(p, site) {
  return {
    oem_number: p.oem_numbers[0] || '', oem_numbers: p.oem_numbers, compatible_brands: ['Universal', 'Other / multi-brand'].includes(p.brand) ? [] : [p.brand],
    vehicle_model: p.model_text || '', generation: p.chassis_text || '', production_years: p.years_text || '', side: p.side, position: /rear/i.test(p.supplier_note) ? 'rear' : /front/i.test(p.supplier_note) ? 'front' : 'n/a',
    condition: 'To be confirmed with supplier', material: 'Not stated by supplier', specs: { part_type: p.part_type, category: p.category_label, supplier_note: p.supplier_note }, supplier_ref: p.supplier_ref || '',
    shipping_origin: site.shipping_origin, dispatch_estimate: site.delivery_estimate.dispatch_text, warranty: site.warranty.summary, fitment_status: 'supplier-listed',
  };
}
module.exports = { loadAll, bodyHtml, metafields, esc };
