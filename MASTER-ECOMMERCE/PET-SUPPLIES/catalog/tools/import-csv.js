#!/usr/bin/env node
'use strict';
/* Catalogue CSV importer + validator. One CSV row per VARIANT; rows sharing `slug` form one product.
 * Usage:  node catalog/tools/import-csv.js catalogue.csv            (validate only - dry run)
 *         node catalog/tools/import-csv.js catalogue.csv --write    (writes catalog/data/products.json + inventory.json)
 * Spec: catalog/CSV-SPEC.md, template: catalog/templates/products-template.csv */
const fs = require('node:fs');
const path = require('node:path');
const { flatten } = require('../categories');

const HEADERS = ['slug', 'title', 'brand', 'pet_type', 'category', 'breed_suitability', 'age_group', 'size', 'pet_weight_min_kg', 'pet_weight_max_kg', 'food_type', 'food_preference', 'litter_type', 'description', 'benefits', 'ingredients', 'nutrition', 'feeding_instructions', 'materials', 'storage', 'manufacturer', 'country_of_origin', 'tags', 'faqs', 'featured', 'new', 'rx', 'image_urls',
  'variant_sku', 'variant_label', 'option_1_name', 'option_1_value', 'option_2_name', 'option_2_value', 'barcode', 'mrp', 'price', 'stock', 'reorder_threshold', 'weight_g', 'warehouse_location', 'batch', 'expiry'];
const REQUIRED = ['slug', 'title', 'brand', 'pet_type', 'category', 'variant_sku', 'variant_label', 'mrp', 'price', 'stock'];
const AGES = ['puppy', 'kitten', 'adult', 'senior']; const SIZES = ['small', 'medium', 'large'];
const TRUE = (v) => /^(1|y|yes|true)$/i.test(String(v || '').trim());
const list = (v, sep = ';') => String(v || '').split(sep).map((x) => x.trim()).filter(Boolean);

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false; text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x !== '')) rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

function validateRows(rows) {
  const errors = []; const { flat } = flatten(); const skus = new Set(); const byslug = {};
  rows.forEach((r, idx) => {
    const n = idx + 2; const e = (m) => errors.push(`Row ${n}: ${m}`);
    for (const k of REQUIRED) if (!String(r[k] ?? '').trim()) e(`missing required field "${k}"`);
    if (r.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug)) e('slug must be lowercase letters, digits and hyphens');
    const pets = list(r.pet_type); if (!pets.length || pets.some((p) => !['dog', 'cat'].includes(p))) e('pet_type must be dog, cat or "dog;cat"');
    if (r.category && !flat[r.category]) e(`unknown category "${r.category}" (see catalog/categories.js)`);
    for (const a of list(r.age_group)) if (!AGES.includes(a)) e(`age_group "${a}" not in ${AGES.join('/')}`);
    for (const s of list(r.size)) if (!SIZES.includes(s)) e(`size "${s}" not in ${SIZES.join('/')}`);
    const mrp = Number(r.mrp); const price = Number(r.price);
    if (r.mrp !== '' && (!Number.isFinite(mrp) || mrp <= 0)) e('mrp must be a positive number (rupees, inclusive of taxes)');
    if (r.price !== '' && (!Number.isFinite(price) || price <= 0)) e('price must be a positive number');
    if (Number.isFinite(mrp) && Number.isFinite(price) && price > mrp) e('price must not exceed MRP (Legal Metrology: MRP is the maximum retail price)');
    if (r.stock !== '' && !(Number.isInteger(Number(r.stock)) && Number(r.stock) >= 0)) e('stock must be a whole number >= 0');
    if (r.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(r.expiry)) e('expiry must be YYYY-MM-DD');
    if (r.variant_sku) { if (skus.has(r.variant_sku)) e(`duplicate variant_sku "${r.variant_sku}"`); skus.add(r.variant_sku); }
    if (r.slug) { const b = byslug[r.slug] || (byslug[r.slug] = { title: r.title, brand: r.brand, category: r.category }); if (b.title !== r.title || b.category !== r.category || b.brand !== r.brand) e(`rows for slug "${r.slug}" disagree on title/brand/category`); }
    if (TRUE(r.rx) && (r.price || r.stock)) { /* allowed: ignored, Rx products are never purchasable */ }
  });
  return { errors };
}

function rowsToProducts(rows) {
  const out = new Map(); let n = 0; const inventory = {};
  for (const r of rows) {
    let p = out.get(r.slug);
    if (!p) {
      n++; const rx = TRUE(r.rx); const imgs = list(r.image_urls, '|');
      p = { id: 'IMP-' + String(n).padStart(4, '0'), slug: r.slug, sku: r.slug.toUpperCase().slice(0, 24), title: r.title, brand: r.brand, petType: list(r.pet_type), category: r.category, categoryPath: [], rx, regulated: rx, purchasable: !rx,
        breedSuitability: list(r.breed_suitability).length ? list(r.breed_suitability) : ['All breeds'], ageGroup: list(r.age_group), size: list(r.size), petWeightKg: { min: Number(r.pet_weight_min_kg) || 0, max: Number(r.pet_weight_max_kg) || 100 },
        foodType: r.food_type || '', foodPreference: r.food_preference || '', litterType: r.litter_type || '', description: r.description || '', benefits: list(r.benefits, '|'), ingredients: r.ingredients || '', materials: r.materials || '',
        nutrition: r.nutrition ? Object.fromEntries(list(r.nutrition, '|').map((kv) => kv.split(':').map((x) => x.trim())).filter((x) => x.length === 2)) : null, feedingInstructions: r.feeding_instructions || '', manufacturer: r.manufacturer || '', countryOfOrigin: r.country_of_origin || '', storage: r.storage || '',
        faqs: list(r.faqs, '|').map((x) => x.split('::')).filter((x) => x.length === 2).map(([q, a]) => ({ q, a })), tags: list(r.tags), featured: TRUE(r.featured), isNew: TRUE(r.new), createdAt: new Date().toISOString(), variants: [], images: imgs.map((src, i) => ({ src, alt: `${r.title} image ${i + 1}`, w: 800, h: 800 })), demo: false, status: 'active' };
      const { parentOf } = flatten(); let cur = r.category; const cp = [cur]; while (parentOf[cur]) { cur = parentOf[cur]; cp.unshift(cur); } p.categoryPath = cp; out.set(r.slug, p);
    }
    const options = {}; if (r.option_1_name) options[r.option_1_name] = r.option_1_value; if (r.option_2_name) options[r.option_2_name] = r.option_2_value; if (!Object.keys(options).length) options.Option = r.variant_label;
    if (!p.rx) { p.variants.push({ sku: r.variant_sku, label: r.variant_label, options, mrp: Number(r.mrp), price: Number(r.price), barcode: r.barcode || '' }); inventory[r.variant_sku] = { available: Number(r.stock) || 0, reserved: 0, threshold: Number(r.reorder_threshold) || 5, location: r.warehouse_location || '', batch: r.batch || '', expiry: r.expiry || '', weightG: Number(r.weight_g) || 500 }; }
  }
  return [...out.values()];
}

function main() {
  const [, , file, ...flags] = process.argv;
  if (!file) { console.error('Usage: import-csv.js <file.csv> [--write]'); process.exit(2); }
  const rows = parseCsv(fs.readFileSync(file, 'utf8')); const { errors } = validateRows(rows);
  if (errors.length) { console.error(`${errors.length} problem(s):\n` + errors.map((e) => '  ' + e).join('\n')); process.exit(1); }
  const products = rowsToProducts(rows);
  console.log(`OK: ${rows.length} rows -> ${products.length} products.`);
  if (!flags.includes('--write')) { console.log('Dry run (no files written). Add --write to replace catalog/data/products.json and inventory.json.'); return; }
  const missing = products.filter((p) => !p.images.length); products.forEach((p) => { if (!p.images.length) p.images = [{ src: '/assets/img/products/placeholder.svg', alt: p.title + ' (no image supplied)', w: 800, h: 800 }]; });
  const dir = path.resolve(__dirname, '..', 'data'); const inv = {}; rowsToProducts(rows); for (const r of rows) inv[r.variant_sku] = null;
  const full = rowsToProducts(rows); const inventory = {}; rows.forEach((r) => { if (!TRUE(r.rx)) inventory[r.variant_sku] = { available: Number(r.stock) || 0, reserved: 0, threshold: Number(r.reorder_threshold) || 5, location: r.warehouse_location || '', batch: r.batch || '', expiry: r.expiry || '', weightG: Number(r.weight_g) || 500 }; });
  fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify(products, null, 1)); fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify(inventory, null, 1));
  console.log(`Wrote products.json and inventory.json. ${missing.length} product(s) have no image_urls. Delete data/runtime/inventory.json to re-seed stock, and fix bundles.json SKUs.`);
}
module.exports = { parseCsv, validateRows, rowsToProducts, HEADERS };
if (require.main === module) main();
