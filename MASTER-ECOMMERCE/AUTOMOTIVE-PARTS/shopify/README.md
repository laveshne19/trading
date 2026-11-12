# Shopify starter kit (UNTESTED against a live store)

| File | Purpose |
|---|---|
| `metafield-definitions.json` | Metafield + metaobject definitions for every spec field (namespace `automotive`) |
| `export-products-csv.js` | Builds a Shopify product import CSV from `catalog/data/products.json` |
| `push-to-shopify.js` | Admin GraphQL push (`productSet`). **Dry-run by default**; `--apply` needs `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` |
| `theme/` | Starter Online Store 2.0 theme skeleton mirroring the local frontend tokens. Not a finished theme |
| Webhook | `POST /webhooks/shopify/orders-paid` in the local server verifies `X-Shopify-Hmac-Sha256` over the raw body with `SHOPIFY_WEBHOOK_SECRET` |

Run: `node shopify/export-products-csv.js --site-url https://your-domain` and `node shopify/push-to-shopify.js --definitions --limit 5` (dry-run).
Products without a confirmed price (`catalog/pricing.json`) are exported as **draft** with price 0.00 and tag `price-on-request`.
The theme in `theme/` has not been uploaded or rendered; treat it as a starting point (upload with Shopify CLI `shopify theme push` to a dev store and fix what breaks).
