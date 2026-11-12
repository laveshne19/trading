#!/usr/bin/env node
'use strict';
/**
 * Push products (and optionally definitions) to Shopify via the Admin GraphQL API.
 *   node shopify/push-to-shopify.js [--limit 10] [--apply] [--definitions] [--site-url https://public-host]
 * DRY-RUN by default: prints what would be sent. --apply performs the calls.
 * Env: SHOPIFY_STORE_DOMAIN (your-store.myshopify.com), SHOPIFY_ADMIN_TOKEN (Admin API access token, write_products scope; write_metaobject_definitions/metafield definitions for --definitions).
 * NOT tested against a live store in this build.
 */
const https = require('https'); const fs = require('fs'); const path = require('path');
const { loadAll, bodyHtml, metafields } = require('./shared');
const args = process.argv.slice(2); const flag = (k) => args.includes(k); const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const APPLY = flag('--apply'); const LIMIT = parseInt(arg('--limit', '5'), 10); const API = '2025-01';
const siteUrl = (arg('--site-url', process.env.SITE_URL || '')).replace(/\/+$/, '');
const domain = process.env.SHOPIFY_STORE_DOMAIN, token = process.env.SHOPIFY_ADMIN_TOKEN;
if (APPLY && (!domain || !token)) { console.error('ERROR: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN must be set to use --apply. (Dry-run needs no credentials.)'); process.exit(2); }
if (!APPLY) console.log('DRY RUN: nothing will be sent. Re-run with --apply and credentials to push.\n');

function gql(query, variables) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({ method: 'POST', host: domain, path: `/admin/api/${API}/graphql.json`, headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`Bad response HTTP ${res.statusCode}`)); } });
    }); req.on('error', reject); req.end(body);
  });
}
const MF_TYPE = { oem_numbers: 'list.single_line_text_field', compatible_brands: 'list.single_line_text_field', specs: 'json', warranty: 'multi_line_text_field' };

async function definitions() {
  const defs = JSON.parse(fs.readFileSync(path.join(__dirname, 'metafield-definitions.json'), 'utf8'));
  for (const m of defs.metaobject_definitions) {
    const v = { definition: { type: m.type, name: m.name, fieldDefinitions: m.fieldDefinitions } };
    console.log(`metaobjectDefinitionCreate ${m.type}`); if (APPLY) console.log(JSON.stringify((await gql('mutation($definition: MetaobjectDefinitionCreateInput!){metaobjectDefinitionCreate(definition:$definition){userErrors{field message code}}}', v)).data));
  }
  for (const f of defs.product_metafields) {
    const v = { definition: { name: f.name, namespace: defs.namespace, key: f.key, type: f.type, ownerType: 'PRODUCT', ...(f.validations ? { validations: f.validations } : {}) } };
    console.log(`metafieldDefinitionCreate ${defs.namespace}.${f.key}`); if (APPLY) console.log(JSON.stringify((await gql('mutation($definition: MetafieldDefinitionInput!){metafieldDefinitionCreate(definition:$definition){userErrors{field message code}}}', v)).data));
  }
}
function toInput(p, site, prices) {
  const price = prices[p.sku]; const mf = metafields(p, site);
  return {
    title: p.title, handle: p.slug, descriptionHtml: bodyHtml(p, site), vendor: p.brand, productType: p.category_label, status: price ? 'ACTIVE' : 'DRAFT',
    tags: [p.brand, p.category_label, 'supplier-listed-fitment', ...(price ? [] : ['price-on-request'])],
    seo: { title: p.seo.title, description: p.seo.description },
    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants: [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }], sku: p.sku, price: price ? String(Number(price).toFixed(2)) : '0.00' }],
    metafields: Object.entries(mf).map(([key, value]) => ({ namespace: 'automotive', key, type: MF_TYPE[key] || 'single_line_text_field', value: typeof value === 'string' ? value : JSON.stringify(value) })),
    ...(p.image && siteUrl ? { files: [{ originalSource: `${siteUrl}/assets/products/${p.image}`, alt: `${p.title} - photo from supplier catalogue`, contentType: 'IMAGE' }] } : {}),
  };
}
(async () => {
  if (flag('--definitions')) await definitions();
  const { products, site, prices } = loadAll();
  const batch = products.slice(0, LIMIT);
  console.log(`\nProducts: ${batch.length} of ${products.length} (use --limit N).${siteUrl ? '' : ' No --site-url/SITE_URL: images will not be sent (Shopify needs a public URL).'}`);
  for (const p of batch) {
    const input = toInput(p, site, prices);
    if (!APPLY) { console.log(`[dry-run] productSet ${p.sku} ${p.slug} (${input.status})`); continue; }
    const r = await gql('mutation($input: ProductSetInput!){productSet(synchronous:true,input:$input){product{id handle} userErrors{field message code}}}', { input });
    const errs = r.errors || (r.data && r.data.productSet && r.data.productSet.userErrors);
    console.log(errs && errs.length ? `ERROR ${p.sku}: ${JSON.stringify(errs)}` : `OK ${p.sku} -> ${r.data.productSet.product.handle}`);
    await new Promise((s) => setTimeout(s, 600)); // stay under API rate limits
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
