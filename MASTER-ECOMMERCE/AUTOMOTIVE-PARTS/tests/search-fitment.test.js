'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { normalizeOem, search } = require('../frontend/lib/search');
const fitment = require('../frontend/lib/fitment');
const { catalogFor } = require('./helpers');
const cat = catalogFor();

test('OEM normalisation ignores spaces, dashes, dots and case', () => {
  assert.equal(normalizeOem('6311 7398-766'), '63117398766');
  assert.equal(normalizeOem('a 222.900-3013'), 'A2229003013');
  assert.equal(normalizeOem(''), '');
});
test('OEM search finds the product regardless of formatting', () => {
  for (const q of ['63117398766', '6311 7398 766', '6311-7398-766', '63117398766 ']) {
    const r = search(cat.products, q);
    assert.ok(r.length > 0, q);
    assert.ok(r[0].oem_norm.includes('63117398766'), `top result for "${q}" has the OEM number`);
  }
});
test('partial OEM (prefix) still matches, short junk does not', () => {
  assert.ok(search(cat.products, '6311739').length > 0);
  assert.equal(search(cat.products, 'zzzzqqqq').length, 0);
});
test('model code search (F30) returns BMW parts', () => {
  const r = search(cat.products, 'F30');
  assert.ok(r.length > 5); assert.ok(r.slice(0, 5).every((p) => p.brand === 'BMW'));
});
test('fitment finder BMW > 3 Series > F30 returns chassis-code matches, all supplier-listed', () => {
  const r = fitment.find(cat.products, cat.vehicles, { make: 'bmw', model: '3-series', gen: 'f30' });
  assert.ok(r.strong > 0);
  for (const it of r.items) { assert.equal(it.product.fitment_status, 'supplier-listed'); assert.equal(it.product.brand, 'BMW'); }
  const chassis = r.items.filter((i) => i.level === 'chassis');
  assert.ok(chassis.every((i) => /F3[0-5]|F80/.test(i.product.vehicle_tokens.join(' '))));
});
test('year filter excludes non-overlapping products and flags unknown years', () => {
  const all = fitment.find(cat.products, cat.vehicles, { make: 'bmw', model: '3-series', gen: 'f30' });
  const y = fitment.find(cat.products, cat.vehicles, { make: 'bmw', model: '3-series', gen: 'f30', year: 2013 });
  assert.ok(y.items.length <= all.items.length);
  for (const it of y.items) { const p = it.product; if (p.year_from || p.year_to) assert.ok((p.year_from ?? -1) <= 2013 && (p.year_to ?? 9999) >= 2013); else assert.ok(it.yearNote); }
});
test('unknown make or empty selection returns nothing; cascading options are data-driven', () => {
  assert.equal(fitment.find(cat.products, cat.vehicles, { make: 'nope' }).items.length, 0);
  const o = fitment.options(cat.vehicles, { make: 'bmw', model: '3-series', gen: 'f30' });
  assert.ok(o.models.some((m) => m.slug === '3-series')); assert.ok(o.generations.some((g) => g.slug === 'f30')); assert.ok(o.years.includes(2013));
});
test('vehicle DB covers every listed brand', () => {
  const names = cat.vehicles.makes.map((m) => m.name);
  for (const n of ['Mercedes-Benz', 'BMW', 'Audi', 'Jaguar', 'Land Rover', 'Porsche', 'Bentley', 'Rolls-Royce', 'Lamborghini', 'Ferrari', 'Maserati', 'Aston Martin', 'Volvo', 'Lexus', 'Mini', 'Volkswagen', 'Skoda', 'Jeep', 'Toyota', 'Hyundai', 'Kia', 'Honda', 'Maruti Suzuki', 'Tata', 'Mahindra', 'MG', 'Renault', 'Nissan', 'Isuzu']) assert.ok(names.includes(n), n);
  const toyota = cat.vehicles.makes.find((m) => m.name === 'Toyota').models.map((m) => m.name);
  for (const n of ['Fortuner', 'Land Cruiser', 'Innova']) assert.ok(toyota.includes(n));
});
test('catalogue view invariants: unique slugs, no invented prices, left/right pairs consistent', () => {
  const slugs = new Set(cat.products.map((p) => p.slug)); assert.equal(slugs.size, cat.products.length);
  assert.ok(cat.products.every((p) => p.title.length > 5 && p.fitment_status === 'supplier-listed'));
  assert.ok(cat.products.every((p) => p.price_inr === null));
  for (const p of cat.products) if (p.pair_sku) { const q = cat.bySku.get(p.pair_sku); assert.equal(q.pair_sku, p.sku); assert.notEqual(q.side, p.side); }
});
