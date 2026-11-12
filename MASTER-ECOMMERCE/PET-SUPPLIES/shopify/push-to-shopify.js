#!/usr/bin/env node
'use strict';
/* Push catalogue to Shopify via the Admin GraphQL API. DRY-RUN BY DEFAULT: prints the operations it would perform.
 *   node shopify/push-to-shopify.js                 dry-run: products
 *   node shopify/push-to-shopify.js --definitions   dry-run: metafield definitions
 *   add --execute to really send (needs SHOPIFY_SHOP, SHOPIFY_ADMIN_TOKEN with write_products scope; optional SHOPIFY_API_VERSION)
 * NOT TESTED against a live store in this repository. Uses productSet (idempotent upsert by handle) - verify the input shape against your API version. */
const fs = require('node:fs'); const path = require('node:path'); const https = require('node:https');
const ROOT = path.resolve(__dirname, '..'); const args = process.argv.slice(2); const EXECUTE = args.includes('--execute');
const shop = process.env.SHOPIFY_SHOP; const token = process.env.SHOPIFY_ADMIN_TOKEN; const ver = process.env.SHOPIFY_API_VERSION || '2025-01';
const gql = (query, variables) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ query, variables });
  const req = https.request({ host: shop, path: `/admin/api/${ver}/graphql.json`, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, 'Content-Length': Buffer.byteLength(body) } }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); });
  req.on('error', reject); req.end(body);
});
const DEF_MUT = 'mutation($d: MetafieldDefinitionInput!){ metafieldDefinitionCreate(definition:$d){ createdDefinition{ id } userErrors{ field message code } } }';
const SET_MUT = 'mutation($input: ProductSetInput!, $synchronous: Boolean!){ productSet(input:$input, synchronous:$synchronous){ product{ id handle } userErrors{ field message code } } }';
function productInput(p, inv) {
  const names = p.variants[0] ? Object.keys(p.variants[0].options) : [];
  return { handle: p.slug, title: p.title, vendor: p.brand, descriptionHtml: `<p>${p.description}</p>`, status: p.rx || p.purchasable === false ? 'DRAFT' : 'ACTIVE', tags: [...(p.tags || []), ...(p.demo ? ['demo-catalogue'] : [])],
    productOptions: names.map((n) => ({ name: n, values: [...new Set(p.variants.map((v) => v.options[n]))].map((name) => ({ name })) })),
    variants: p.variants.map((v) => ({ sku: v.sku, price: String(v.price), compareAtPrice: v.mrp > v.price ? String(v.mrp) : null, optionValues: names.map((n) => ({ optionName: n, name: v.options[n] })), inventoryItem: { tracked: true, sku: v.sku } })),
    metafields: [{ namespace: 'pet', key: 'pet_type', type: 'list.single_line_text_field', value: JSON.stringify(p.petType) }, { namespace: 'pet', key: 'age_group', type: 'list.single_line_text_field', value: JSON.stringify(p.ageGroup || []) }, { namespace: 'pet', key: 'prescription_required', type: 'boolean', value: String(!!p.rx) }, { namespace: 'pet', key: 'manufacturer', type: 'single_line_text_field', value: p.manufacturer || '-' }, { namespace: 'pet', key: 'country_of_origin', type: 'single_line_text_field', value: p.countryOfOrigin || '-' }].filter((m) => m.value && m.value !== '[]') };
}
(async () => {
  if (EXECUTE && (!shop || !token)) { console.error('SHOPIFY_SHOP and SHOPIFY_ADMIN_TOKEN are required with --execute.'); process.exit(1); }
  console.log(EXECUTE ? `EXECUTING against ${shop} (API ${ver})` : 'DRY RUN (no network calls). Add --execute to send.');
  if (args.includes('--definitions')) {
    const defs = require('./metafields.json').definitions;
    for (const d of defs) { const v = { d: { namespace: d.namespace, key: d.key, name: d.name, type: d.type, ownerType: 'PRODUCT', description: d.description || '' } }; if (!EXECUTE) console.log('would create definition', d.namespace + '.' + d.key); else { const r = await gql(DEF_MUT, v); const e = r.data && r.data.metafieldDefinitionCreate.userErrors; console.log(d.key, e && e.length ? JSON.stringify(e) : 'ok'); } }
    return;
  }
  const dir = path.join(ROOT, 'catalog', 'data'); const products = JSON.parse(fs.readFileSync(path.join(dir, 'products.json'), 'utf8')); const inv = JSON.parse(fs.readFileSync(path.join(dir, 'inventory.json'), 'utf8'));
  const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || products.length;
  for (const p of products.slice(0, limit)) {
    if (p.demo && EXECUTE && !args.includes('--include-demo')) { console.log('skip demo product (use --include-demo to push demo data):', p.slug); continue; }
    const input = productInput(p, inv);
    if (!EXECUTE) { console.log(`would productSet ${p.slug} (${input.variants.length} variants, status ${input.status})`); continue; }
    const r = await gql(SET_MUT, { input, synchronous: true }); const e = r.data && r.data.productSet && r.data.productSet.userErrors; console.log(p.slug, e && e.length ? 'ERRORS ' + JSON.stringify(e) : 'ok');
  }
})().catch((e) => { console.error(e); process.exit(1); });
