# Architecture
```
catalog/data/supplier-products.json  (raw, from PDF)  --build_view.js-->  products.json + vehicles.json   (+ pricing.json overlay)
frontend/server.js        router, sessions, CSRF, rate limits, headers, gzip, admin
frontend/lib/             catalog, search (OEM normalisation), fitment, pricing, cart, checkout validation, orders (state machine), accounts (scrypt), uploads, fulfilment, seo (JSON-LD), content (policies/blog/FAQ)
frontend/views/           server-rendered HTML via auto-escaping `html` tagged templates (components, catalogPages, commerce, info, admin)
integrations/             payments (razorpay, cashfree, dev mock), supplier (manual-queue, alibaba-api stub, PII-safe payload), shipping (dhl, ups), notifications (SMTP, WhatsApp), retry (exponential backoff), log (data/logs)
config/                   site.json (pending-business copy), shipping.json (zone rates/ETAs, placeholders)
data/                     runtime: orders.json, accounts.json, enquiries.json, uploads/, logs/ (git-ignored)
shopify/                  metafield defs, CSV export, GraphQL push, theme skeleton
```
**Order flow**: cart (session, server re-priced) -> checkout validation (per-product vehicle confirmation, duties ack, prepaid method) -> order `pending_payment` (idempotent on form key) -> gateway -> `paid` (signature/webhook verified; idempotent) -> supplier adapter queue -> `supplier_queued` -> admin: sent/accepted -> tracking -> `dispatched` -> `in_transit` -> `out_for_delivery` -> `delivered`; also `cancelled`, `refunded`, `return_requested` per `TRANSITIONS` in `frontend/lib/orders.js`.
**Security**: CSP (self + fonts), nosniff, frame-ancestors none, signed HttpOnly SameSite cookie, per-session CSRF token on every POST (webhooks exempt: HMAC), sliding-window rate limits (forms 60/min, enquiry/KYC 6/10min, auth 10/10min, admin failures), HTML auto-escape, JSON-LD `<` escaping, upload magic-byte + extension + 5MB check and random names, CSV formula-injection guard, admin Basic with timing-safe compare. Storage is JSON files (fine for a pilot, single process).
