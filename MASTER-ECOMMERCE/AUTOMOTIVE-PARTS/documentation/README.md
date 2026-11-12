# Documentation index and quick start

## Run locally
1. Node >= 20 (built on 22). No `npm install` needed (zero dependencies).
2. `cp .env.example .env` is optional: the server reads real environment variables only (no dotenv). Example: `PORT=4100 SITE_URL=http://localhost:4100 npm start`.
3. `npm run dev` for demo mode (fake DEV prices + DEV mock gateway) so you can test cart, checkout, admin queue, tracking.
4. Rebuild catalogue after changing `catalog/data/supplier-products.json`, `catalog/tools/vehicles-seed.js` or importing a CSV: `node catalog/tools/build_view.js`.

## Catalogue tooling (re-runnable)
- `catalog/tools/build_view.js`: supplier rows to clean titles, unique slugs, SEO fields, left/right pairing, chassis-code vehicle linking (`products.json`) and vehicle DB (`vehicles.json`, seeded from `vehicles-seed.js`: public generation codes/years only; empty generation lists where unsure).
- `catalog/tools/import_supplier_csv.js file.csv [--merge]`: future supplier CSV import. **Column spec** (header row, UTF-8): `sku*, title_raw*, category*, brand*, models_raw, used_for_raw, year_from, year_to, oem_numbers (| or ;), side (left|right|n/a), supplier_note, image (file in assets/products), price_inr, condition, stock`. (`*` required.)
- `catalog/pricing.json`: `{"prices": {"<sku>": 12500}}` real INR selling prices. Empty = all "Price on request".

## Connect Shopify (optional, untested against a live store)
See `shopify/README.md`: create metafield definitions, export CSV (`node shopify/export-products-csv.js --site-url https://your-domain`) or push via Admin GraphQL (`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, dry-run by default), install webhook `/webhooks/shopify/orders-paid` with `SHOPIFY_WEBHOOK_SECRET`, upload `shopify/theme/` to a dev store and iterate.

## Deploy
Any Node host/VPS behind HTTPS reverse proxy (nginx/Caddy). Set: `NODE_ENV=production`, `SITE_URL`, `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASS`, `TRUST_PROXY=1`, payment keys, `DATA_DIR` on persistent disk (orders/accounts/uploads are JSON files + files: back them up; move to a database before real scale). In production DEV flags are ignored, the mock gateway is disabled and the admin refuses to run without credentials. Point `SITE_URL` at the real domain once bought; canonical URLs, sitemap, JSON-LD and OG tags follow it.
