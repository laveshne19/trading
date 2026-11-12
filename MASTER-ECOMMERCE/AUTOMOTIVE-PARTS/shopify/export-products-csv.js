#!/usr/bin/env node
'use strict';
/**
 * Produces a Shopify product import CSV from catalog/data/products.json.
 *   node shopify/export-products-csv.js [--out shopify/products-import.csv] [--site-url https://your-domain]
 * - Products WITHOUT a confirmed price (catalog/pricing.json) are exported as Status=draft with price 0.00 and tag "price-on-request"
 *   (Shopify requires a price). Do not publish them until priced.
 * - Image Src needs a publicly reachable URL: --site-url (or SITE_URL env) + /assets/products/<file>.
 * - Metafield columns use the "(product.metafields.automotive.key)" header form. Define them first (metafield-definitions.json) and
 *   check your import in a Shopify dev store. NOT tested against a live store in this build.
 */
const fs = require('fs'); const path = require('path');
const { loadAll, bodyHtml, metafields } = require('./shared');
const args = process.argv.slice(2); const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(__dirname, 'products-import.csv')));
const siteUrl = (arg('--site-url', process.env.SITE_URL || 'http://localhost:4100')).replace(/\/+$/, '');
const { products, site, prices } = loadAll();
const MF = ['oem_number', 'oem_numbers', 'compatible_brands', 'vehicle_model', 'generation', 'production_years', 'side', 'position', 'condition', 'material', 'specs', 'supplier_ref', 'shipping_origin', 'dispatch_estimate', 'warranty', 'fitment_status'];
const MFTYPE = { oem_numbers: 'list.single_line_text_field', compatible_brands: 'list.single_line_text_field', specs: 'json', warranty: 'multi_line_text_field' };
const head = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Requires Shipping', 'Variant Taxable', 'Image Src', 'Image Position', 'Image Alt Text', 'SEO Title', 'SEO Description', 'Status', ...MF.map((k) => `${k} (product.metafields.automotive.${k})`)];
const q = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const rows = products.map((p) => {
  const price = prices[p.sku]; const mf = metafields(p, site);
  const tags = [p.brand, p.category_label, p.side !== 'n/a' ? p.side : '', price ? '' : 'price-on-request', 'supplier-listed-fitment'].filter(Boolean).join(', ');
  return [p.slug, p.title, bodyHtml(p, site), p.brand, p.category_label, tags, price ? 'TRUE' : 'FALSE', 'Title', 'Default Title', p.sku, '', '', 'deny', 'manual', price ? Number(price).toFixed(2) : '0.00', 'TRUE', 'TRUE',
    p.image ? `${siteUrl}/assets/products/${p.image}` : '', p.image ? 1 : '', `${p.title} - photo from supplier catalogue`, p.seo.title, p.seo.description, price ? 'active' : 'draft',
    ...MF.map((k) => (Array.isArray(mf[k]) ? JSON.stringify(mf[k]) : typeof mf[k] === 'object' ? JSON.stringify(mf[k]) : mf[k]))];
});
fs.writeFileSync(out, [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n');
console.log(`Wrote ${rows.length} rows to ${out} (${rows.filter((r) => r[22] === 'draft').length} draft / price-on-request)`);
