# Architecture

```
PET-SUPPLIES/
  frontend/server.js        http server, router, ctx (session/CSRF/flash), routes, webhooks, dispatcher
  frontend/lib/             config, store (JSON), catalogue, pricing, coupons, inventory, orders (state machine), loyalty,
                            pets, subscriptions, pincode, cod, security (rate limit, CSP, sessions, scrypt), webhooks, services (composition + cart)
  frontend/views/           layout, ui kit, pages-shop, pages-user, admin (template functions with auto-escaping `h` tag)
  integrations/payments     razorpay, cashfree, mock (DEV only)      integrations/shipping  shiprocket, delhivery, dtdc, bluedart
  integrations/notify       SMTP email, WhatsApp Cloud, lifecycle templates
  catalog/                  categories.js (tree), data/*.json (generated demo), tools/seed-demo.js, tools/import-csv.js, CSV-SPEC.md
  content/                  blog guides, policies/FAQ/about, SEO landing copy
  assets/                   css, js, svg (served at /assets, long-cache when ?v=)
  shopify/                  metafield defs, CSV export, GraphQL push (dry-run), webhook docs, OS2.0 theme skeleton
  tests/                    unit (node:test) + e2e (Playwright)
```
## Data & state
`Store` keeps each collection as `data/runtime/<name>.json`, loaded into memory, written atomically (tmp + rename). Collections: users (addresses, pets, wishlist, lists inside user), sessions, carts, orders, inventory, reservations, coupons, coupon_usage, loyalty, reviews, subscriptions, enquiries, newsletter, settings, counters, notifications, integration_log, webhook_events. **Limits:** single process, whole-file rewrites, no transactions - fine for a demo or very low volume; move to a database (Postgres) before real traffic. Catalogue is read-only JSON loaded at start.

## Request flow
Router -> rate limit (global + per-endpoint) -> cookie/session (lazy) -> body parse (200 KB; webhooks keep the raw body, 1 MB) -> CSRF check on every non-webhook POST -> handler -> `layout()` -> gzip. Server is authoritative for prices, stock, coupons, loyalty, COD and PIN rules; the client JS only enhances.

## Orders and inventory
`orders.js` state machine: pending_payment -> paid | cancelled; paid/cod_confirmed -> packed -> shipped -> out_for_delivery -> delivered -> return_requested -> refunded; also rto, cancelled -> refunded. Transitions are idempotent (same state = no-op; event keys de-duplicated). Stock: `reserve` (at order creation, all-or-nothing) moves available -> reserved; `release` on cancel/expiry; `commit` on shipped; `restock` on RTO. Unpaid orders auto-cancel after `reservationTtlMinutes` (sweeper every 60 s, also at start). Late payment after cancellation is flagged `refund_due`, never silently revived. Checkout has an idempotency key against double submit. Loyalty points are earned on delivered, reversed on refund.

## Payments
Adapter per gateway: create order, verify signature (HMAC, timing-safe), verify webhook on the raw body. Gateways are `not_configured` without env; the DEV mock exists only when `NODE_ENV != production` and `DEV_MOCK_PAYMENT=1` and is labelled on every page. The browser result is never trusted: Razorpay signature is verified server-side, Cashfree status is re-fetched, webhooks reconcile.

## Security
CSP (`default-src 'self'`, gateway hosts only when configured), nosniff, frame deny, referrer policy, HSTS on https; HttpOnly SameSite=Lax session cookie; per-session CSRF token; escaping by construction; scrypt password hashes; login/register/contact/review/checkout/track/webhook rate limits; admin Basic auth with timing-safe compare; CSV formula-injection guard; no secrets in code (`.env`).
