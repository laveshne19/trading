# Paw & Hearth store - run, connect Shopify, deploy

## Run locally
Node >= 22, no npm install needed.
```bash
cd PET-SUPPLIES && cp .env.example .env && npm start     # http://localhost:4200
```
Dev defaults: demo-catalogue notice ON, DEV mock payment ON (`DEV_MOCK_PAYMENT=1`, ignored in production), COD OFF until enabled in `/admin/settings`, admin `admin`/`pawhearth-dev`. Runtime data (orders, users, stock, sessions...) lives in `data/runtime/*.json` (`DATA_DIR`). Delete that folder to reset.

## Brand / config
`config/brand.json` (name, tagline, announcements, order prefix), `config/settings.defaults.json` (COD, shipping fee, loyalty - overridable live in admin), `config/pincode-zones.json` (estimated delivery zones). The wordmark/mark are in `frontend/lib/brand-svg.js` (and `assets/img/logo.svg`).

## Load the real catalogue
Fill the CSV per `catalog/CSV-SPEC.md`, run `npm run import -- file.csv` (validate) then `--write`. Delete `data/runtime/inventory.json` to re-seed stock from the new file. Replace demo bundles/coupons.

## Connect Shopify (optional path)
1. Define metafields: `SHOPIFY_SHOP=... SHOPIFY_ADMIN_TOKEN=... node shopify/push-to-shopify.js --definitions --execute`.
2. Export products: `SITE_URL=https://your-domain npm run export:shopify` and import `shopify/shopify-products.csv` in Shopify admin, or push via GraphQL: `npm run push:shopify` (dry-run) then `-- --execute --include-demo` only for test stores.
3. Starter theme: `shopify/theme` (untested skeleton). Webhooks: `shopify/WEBHOOKS.md`.
Status: none of this has been run against a live Shopify store.

## Deploy
Any Node 22 host/VM (single process; JSON storage is not multi-instance safe - see ARCHITECTURE.md). Set `NODE_ENV=production`, `SITE_URL`, `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, `DATA_DIR` (persistent disk), `TRUST_PROXY=1` behind a reverse proxy, TLS terminated at the proxy (HSTS is sent when `SITE_URL` is https). Set `DEMO_CATALOGUE=0` only after loading real products. Back up `DATA_DIR`. Configure a payment gateway and webhooks (INTEGRATIONS.md) before taking orders. Read LEGAL-NOTES.md and MISSING-INFO.md first.

## Document index
DESIGN-SYSTEM, ARCHITECTURE, INTEGRATIONS, SEO-GEO, OPERATIONS, LEGAL-NOTES, TEST-REPORT, MISSING-INFO.
