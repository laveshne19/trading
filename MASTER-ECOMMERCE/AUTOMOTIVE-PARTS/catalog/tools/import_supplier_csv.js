#!/usr/bin/env node
'use strict';
/**
 * Import a future supplier CSV into the raw supplier-products.json format, then rebuild the view layer.
 *   node catalog/tools/import_supplier_csv.js supplier.csv [--merge] [--out catalog/data/supplier-products.json] [--no-build]
 *
 * CSV COLUMN SPEC (header row required, UTF-8, RFC4180 quoting, extra columns ignored):
 *   sku            required  unique id (e.g. SUP-0001). Existing rows with same sku are replaced when --merge.
 *   title_raw      required  supplier product name, e.g. "Led Angel Eyes"
 *   category       required  one of the keys in catalog/tools/build_view.js CAT_LABEL (e.g. headlights/drl-angel-eyes) or a new "group/slug"
 *   brand          required  vehicle make as spelled in catalog/tools/vehicles-seed.js (BMW, Mercedes-Benz, Audi, ...), or Universal
 *   models_raw     optional  e.g. "3 Series 2012-2015"
 *   used_for_raw   optional  chassis codes / models text, e.g. "F30/F35/GT-F34"
 *   year_from      optional  integer
 *   year_to        optional  integer (blank = onward)
 *   oem_numbers    optional  separated by "|" or ";"
 *   side           optional  left | right | n/a
 *   supplier_note  optional
 *   image          optional  filename inside assets/products/
 *   price_inr      optional  number; blank = "Price on request". (Prices can also live in catalog/pricing.json)
 *   condition      optional  OEM | OEM-equivalent | aftermarket | to-be-confirmed-with-supplier (default)
 *   stock          optional  free text, default on-request
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); if (row.some((x) => x !== '')) rows.push(row); }
  return rows;
}
const int = (v) => (v === '' || v == null || isNaN(parseInt(v, 10)) ? null : parseInt(v, 10));

function rowsToProducts(csvText, supplier = 'supplier-csv') {
  const [head, ...body] = parseCSV(csvText);
  const h = head.map((x) => x.trim().toLowerCase());
  const errors = [];
  const out = body.map((r, n) => {
    const o = {}; h.forEach((k, i) => { o[k] = (r[i] ?? '').trim(); });
    for (const req of ['sku', 'title_raw', 'category', 'brand']) if (!o[req]) errors.push(`row ${n + 2}: missing ${req}`);
    const side = (o.side || 'n/a').toLowerCase();
    if (!['left', 'right', 'n/a'].includes(side)) errors.push(`row ${n + 2}: bad side "${o.side}"`);
    const price = o.price_inr === '' ? null : Number(o.price_inr);
    if (price !== null && !(price >= 0)) errors.push(`row ${n + 2}: bad price`);
    return {
      id: o.sku, supplier, supplier_section: o.supplier_section || 'CSV import', supplier_ref: `csv#${n + 2}`, title_raw: o.title_raw, category: o.category, brand: o.brand,
      models_raw: o.models_raw || '', used_for_raw: o.used_for_raw || '', year_from: int(o.year_from), year_to: int(o.year_to),
      oem_numbers: (o.oem_numbers || '').split(/[|;]/).map((x) => x.trim()).filter(Boolean), side, supplier_note: o.supplier_note || '',
      image: o.image || null, image_px: null, fitment_status: 'supplier-listed', price_inr: price, condition: o.condition || 'to-be-confirmed-with-supplier', stock: o.stock || 'on-request',
    };
  });
  return { products: out, errors };
}

module.exports = { parseCSV, rowsToProducts };

if (require.main === module) {
  const a = process.argv.slice(2);
  const file = a.find((x) => !x.startsWith('--'));
  if (!file) { console.error('usage: import_supplier_csv.js file.csv [--merge] [--out path] [--no-build]'); process.exit(2); }
  const oi = a.indexOf('--out');
  const out = path.resolve(ROOT, oi >= 0 ? a[oi + 1] : 'catalog/data/supplier-products.json');
  const { products, errors } = rowsToProducts(fs.readFileSync(file, 'utf8'));
  if (errors.length) { console.error(errors.slice(0, 30).join('\n')); process.exit(1); }
  let final = products;
  if (a.includes('--merge') && fs.existsSync(out)) {
    const cur = JSON.parse(fs.readFileSync(out, 'utf8')); const map = new Map(cur.map((p) => [p.id, p]));
    products.forEach((p) => map.set(p.id, p)); final = [...map.values()];
  }
  fs.writeFileSync(out, JSON.stringify(final, null, 1));
  console.log(`wrote ${final.length} products to ${out}`);
  if (!a.includes('--no-build')) execFileSync('node', [path.join(__dirname, 'build_view.js')], { stdio: 'inherit' });
}
