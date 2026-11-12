'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { parseCsv, validateRows, rowsToProducts, HEADERS } = require('../../catalog/tools/import-csv');
const row = (o = {}) => ({ slug: 'x-prod', title: 'X', brand: 'B', pet_type: 'dog', category: 'dog-dry-food', variant_sku: 'S1', variant_label: '1 kg', mrp: '100', price: '90', stock: '5', age_group: 'adult', ...o });
test('csv parser handles quotes, commas, newlines', () => { const r = parseCsv('a,b\n"x,1","he said ""hi"""\n'); assert.deepEqual(r, [{ a: 'x,1', b: 'he said "hi"' }]); });
test('valid rows pass', () => { const { errors } = validateRows([row()]); assert.deepEqual(errors, []); });
test('invalid rows are reported with row numbers', () => {
  const { errors } = validateRows([row({ pet_type: 'bird' }), row({ category: 'nope', variant_sku: 'S2' }), row({ price: '200', variant_sku: 'S3' }), row({ variant_sku: 'S1' }), row({ mrp: 'abc', variant_sku: 'S4' }), row({ title: '', variant_sku: 'S5' })]);
  const txt = errors.join('\n'); for (const k of [/pet_type/, /category/, /price.*MRP/, /duplicate/i, /mrp/i, /title/]) assert.match(txt, k); assert.match(errors[0], /^Row 2/);
});
test('rows group into products with variants and Rx is never purchasable', () => {
  const p = rowsToProducts([row(), row({ variant_sku: 'S2', variant_label: '2 kg' }), row({ slug: 'rx-one', variant_sku: 'R1', rx: 'yes' })]);
  assert.equal(p.length, 2); assert.equal(p[0].variants.length, 2); assert.equal(p[1].rx, true); assert.equal(p[1].purchasable, false); assert.ok(HEADERS.includes('expiry'));
});
