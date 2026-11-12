# MASTER-ECOMMERCE

Two separate e-commerce projects, built to run locally today and connect to Shopify, payment gateways, couriers and suppliers once the accounts exist.

| | AUTOMOTIVE-PARTS | PET-SUPPLIES |
|---|---|---|
| Business | Premium car parts sourced from a China supplier, shipped to the customer after a prepaid order | Dog and cat supplies from Indian inventory, shipped by Indian couriers |
| Local port | 4100 | 4200 |
| Payments | Prepaid only (no COD, no pay-later) | Prepaid, plus COD that admin can switch on or off |
| Catalogue | 1,229 real supplier listings extracted from the Jushuo 2026 PDF | Demo catalogue (no supplier file was provided) |
| Look | Dark graphite, silver, one accent | Warm cream, forest green, peach |

The two projects share no code and no data. Each can be deployed, themed and connected to its own Shopify store on its own.

## Run locally

Requires Node 20 or newer. No packages to install.

```bash
cd AUTOMOTIVE-PARTS/frontend && cp ../.env.example .env && npm start   # http://localhost:4100
cd PET-SUPPLIES/frontend    && cp ../.env.example .env && npm start   # http://localhost:4200
```

Each project README covers tests, the admin area, and the Shopify connection steps.

## Why this architecture

Shopify is the commerce platform of record for both stores. Each project therefore contains:

- `frontend/` a working storefront with real cart, search, checkout and order logic, so the experience can be tested without a Shopify account.
- `shopify/` metafield definitions, a product import CSV generator, an Admin API push script (dry run by default) and a starter Online Store 2.0 theme.
- `integrations/` adapters for payments, couriers, suppliers and notifications. An adapter without credentials reports `not_configured`. None of them pretends to succeed.

The Shopify theme is a starter. It has not been tested against a live store because no store credentials were available. See each project's `documentation/TEST-REPORT.md` for what was actually run.

## Research findings that shaped the build

- **Alibaba and Shopify.** The official "Dropshipping by Alibaba" Shopify app was withdrawn from the App Store on 19 Aug 2024. Alibaba.com has no universal single-unit dropshipping API. The automotive store therefore defaults to an admin supplier queue with a PO export, and keeps an `alibaba-api` adapter that returns `not_configured`. Apps such as CoDropshipping advertise Alibaba/1688 support and tracking sync, but whether they work for this supplier's single-unit orders must be confirmed with the supplier and the app vendor before relying on them.
- **Shiprocket** publishes API docs for serviceability, order creation, AWB, labels, tracking and webhooks. Delhivery, DTDC and Blue Dart need direct business accounts to obtain API documentation and credentials.
- **Supertails** could not be fetched from the build sandbox, so the pet store was designed from the brief rather than from a live review of that site.

## Supplier catalogue notes (automotive)

The supplier PDF contains no prices, stock, warranty terms or company credentials. So:

- Products show "Price on request" with a quote flow until prices are added to `catalog/pricing.json`.
- Fitment is shown as "supplier-listed", never "verified".
- Product photos are the supplier's catalogue thumbnails (median about 500px wide, many smaller). They are not 4K. Studio photography is needed for a luxury presentation.
- Brand and model were inferred from the supplier's own text with rules in `catalog/tools/build_catalogue.py` and should be reviewed.

## Documents

- `MASTER-DOCUMENTATION/FINAL-REPORT.md` overall status, test summary, open items
- `AUTOMOTIVE-PARTS/documentation/` and `PET-SUPPLIES/documentation/` design system, architecture, integrations, SEO, operations, test report, missing information
