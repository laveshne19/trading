#!/usr/bin/env node
'use strict';
/* Export catalog/data/products.json (+ inventory.json) to a Shopify product-import CSV (Shopify "Product CSV" format).
 * Usage: node shopify/export-products-csv.js [out.csv]    (default shopify/shopify-products.csv)
 * Rx / non-purchasable products are exported as Draft (never Active). Demo products are exported with the 'demo-catalogue' tag. */
const fs = require('node:fs'); const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const HEADERS = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position', 'Image Alt Text', 'Status',
  'pet.pet_type (product.metafields.pet.pet_type)', 'pet.age_group (product.metafields.pet.age_group)', 'pet.size (product.metafields.pet.size)', 'pet.breed_suitability (product.metafields.pet.breed_suitability)', 'pet.ingredients (product.metafields.pet.ingredients)', 'pet.manufacturer (product.metafields.pet.manufacturer)', 'pet.country_of_origin (product.metafields.pet.country_of_origin)', 'pet.prescription_required (product.metafields.pet.prescription_required)'];
const q = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function buildRows(products, inventory, siteUrl = '') {
  const rows = [];
  for (const p of products) {
    const names = p.variants[0] ? Object.keys(p.variants[0].options) : [];
    const body = `<p>${esc(p.description)}</p>${p.benefits && p.benefits.length ? '<ul>' + p.benefits.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>' : ''}${p.ingredients ? `<h4>Ingredients</h4><p>${esc(p.ingredients)}</p>` : ''}`;
    const status = p.rx || p.purchasable === false ? 'draft' : 'active'; const tags = [...(p.tags || []), ...(p.demo ? ['demo-catalogue'] : []), ...(p.rx ? ['prescription-required'] : [])].join(', ');
    const meta = [(p.petType || []).join(', '), (p.ageGroup || []).join(', '), (p.size || []).join(', '), (p.breedSuitability || []).join(', '), p.ingredients, p.manufacturer, p.countryOfOrigin, p.rx ? 'TRUE' : 'FALSE'];
    const variants = p.variants.length ? p.variants : [{ sku: p.sku, options: {}, price: 0, mrp: 0 }];
    variants.forEach((v, i) => {
      const inv = inventory[v.sku] || { available: 0 }; const first = i === 0;
      const row = [p.slug, first ? p.title : '', first ? body : '', first ? p.brand : '', '', first ? (p.categoryPath || []).join(' > ') : '', first ? tags : '', first ? (status === 'active' ? 'TRUE' : 'FALSE') : '', first && names[0] ? names[0] : '', v.options[names[0]] || '', first && names[1] ? names[1] : '', v.options[names[1]] || '', v.sku, inv.weightG || 500, 'shopify', inv.available, 'deny', 'manual', v.price, v.mrp > v.price ? v.mrp : '', 'TRUE', 'TRUE', v.barcode || '', '', '', '', first ? status : '', ...(first ? meta : meta.map(() => ''))];
      rows.push(row);
    });
    (p.images || []).forEach((im, i) => { if (!/^https?:/.test(im.src) && !siteUrl) return; const r = new Array(HEADERS.length).fill(''); r[0] = p.slug; r[HEADERS.indexOf('Image Src')] = /^https?:/.test(im.src) ? im.src : siteUrl + im.src; r[HEADERS.indexOf('Image Position')] = i + 1; r[HEADERS.indexOf('Image Alt Text')] = im.alt; rows.push(r); });
  }
  return rows;
}
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function toCsv(products, inventory, siteUrl) { return [HEADERS, ...buildRows(products, inventory, siteUrl)].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'; }
module.exports = { toCsv, buildRows, HEADERS };
if (require.main === module) {
  const out = process.argv[2] || path.join(__dirname, 'shopify-products.csv'); const d = path.join(ROOT, 'catalog', 'data');
  const csv = toCsv(JSON.parse(fs.readFileSync(path.join(d, 'products.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(d, 'inventory.json'), 'utf8')), process.env.SITE_URL || '');
  fs.writeFileSync(out, csv); console.log(`Wrote ${out} (${csv.split('\r\n').length - 2} rows). Set SITE_URL so image URLs are absolute (Shopify must be able to fetch them). Placeholder SVGs are not suitable for a live store.`);
}
