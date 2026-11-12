# Website One: luxury automotive parts (India-first, China-sourced, prepaid dropship)

Zero-dependency Node 22 storefront (server-rendered, SEO-friendly) + catalogue tooling + Shopify starter kit.
Catalogue = 1,229 real supplier-listed products from the Guangzhou Jushuo Boan catalogue PDF. **No prices, stock or warranty terms exist in that PDF**, so products show "Price on request" until you fill `catalog/pricing.json`.

```bash
npm start                 # http://localhost:4100  (PORT env to change)
npm run dev               # same, with DEV_DEMO_PRICES=1 DEV_MOCK_PAYMENT=1 (loudly labelled fake prices / fake gateway)
npm test                  # node:test unit + HTTP tests
node tests/e2e.js         # Playwright walk (needs global playwright + chromium), screenshots in documentation/screenshots/
node catalog/tools/build_view.js   # rebuild catalog/data/products.json + vehicles.json
```
Admin: `/admin` (HTTP Basic, `ADMIN_USER`/`ADMIN_PASS`; dev default printed at boot; disabled in production if unset).
Docs: see `documentation/` (README, ARCHITECTURE, DESIGN-SYSTEM, INTEGRATIONS, SEO-GEO, KYC-PRIVACY, OPERATIONS, TEST-REPORT, MISSING-INFO).
Never do: claim fitment is verified, invent reviews/certs, enable COD. Do not commit `.env` or `data/`.
