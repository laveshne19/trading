# Test report (real results)

Run on 2026-11-11T04:25:31.589Z with Node v22.23.4.

## Unit tests - `npm test` (node:test)
20 tests, 20 passed, 0 failed. Coverage: pricing/discount from MRP, totals/shipping/COD fee, coupons (percent cap, flat, min cart, expiry, total and per-user limits, release), inventory (reserve all-or-nothing, idempotent, release, commit, expiry sweep, low stock), COD rules, order state machine (legal/illegal, idempotent, stock + loyalty side effects, cancel/expiry/late payment/idempotency key), HMAC verification (Razorpay checkout + webhook, Cashfree, Shopify), adapters never fake success without env, PIN serviceability (invalid, unserviceable, labelled estimate, adapter-verified), pet-profile matching, subscriptions never charge/create orders, CSV import validation, SMTP client against a local fake server, Shiprocket adapter against a local fake API, retry/backoff, CSV formula-injection guard.

## End-to-end - `npm run e2e` (Playwright + Chromium, fresh data dir, DEV mock payment, rate-limit multiplier 50 so the walk is not throttled)
Result: **27/27 passed**, horizontal overflow findings: 0, unexpected console/resource errors: 0.

| Result | Step |
|---|---|
| PASS | home: one h1, title, JSON-LD (Organization + WebSite/SearchAction), no fake ratings |
| PASS | home sections appear in the specified order |
| PASS | dog/cat navigation + mega menu |
| PASS | filters (dog: brand/age/size/price...) + sort; cat facets |
| PASS | rx categories flagged and not purchasable |
| PASS | search + suggestions endpoint |
| PASS | product page: variants, PIN check, SEO, no ratings, demo notice |
| PASS | add to cart (ajax), cart drawer, update quantity |
| PASS | coupon: valid applied, expired rejected |
| PASS | checkout validation errors; COD refused while disabled (UI + server) |
| PASS | checkout prepaid via DEV mock gateway: loud label, fail then success -> paid |
| PASS | tracking by order number + phone; wrong details rejected |
| PASS | admin: auth required, enable COD, low stock, coupons, integrations honest, CSV, pack order |
| PASS | COD order succeeds when enabled (fee shown); over-limit COD refused |
| PASS | order lifecycle via admin; courier shipment honestly not configured |
| PASS | account: register (consent required), pets, suits-my-pet, disclaimer |
| PASS | subscription setup stores schedule and never charges / creates an order |
| PASS | wishlist, saved address, shopping list, loyalty page |
| PASS | logged-in order -> delivered -> loyalty points earned -> reorder + redeem option |
| PASS | reviews: submit -> pending (hidden, no rating) -> admin approve -> shown + aggregateRating |
| PASS | newsletter consent + contact form stored; visible in admin |
| PASS | security: CSRF, headers, gzip, cache, XSS escaped, webhook signatures rejected, login rate limit |
| PASS | SEO: robots, sitemap, unique titles, one h1, meta description, valid JSON-LD, img alt+dimensions |
| PASS | mobile UX (390x844): tab bar, menu drawer, filter sheet, sticky ATC, cart drawer |
| PASS | viewports 360/390/768/1280/1920/3840: no horizontal overflow, screenshots saved |
| PASS | no unexpected console errors across the walk |
| PASS | stock accounting: active reservations only for open orders; no negative stock |

Screenshots (viewport captures of home, collection, product, cats, cart, checkout, track at 360x740, 390x844, 768x1024, 1280x800, 1920x1080, 3840x2160) are in documentation/screenshots/. I reviewed several (home, collection, product, checkout at mobile and desktop widths, 3840 home) by eye.

## Bugs found and fixed during this process
- Nested forms (checkout summary inside the checkout form; wishlist form inside the add-to-cart form) caused CSRF failures and wrong submissions - restructured.
- PIN checker forms were blocked by native pattern validation - now novalidate with server/JS messages.
- Hidden cart badge displayed because of display rules - global [hidden] rule added.
- Wishlist button aria-pressed rendered empty - fixed.
- Several test-script issues (selectors, over-limit cart not cleared, scroll distance) were fixed in the tests, not the product.

## Not tested / known limits
- No live payment, courier, WhatsApp, SMTP or Shopify calls (no credentials). Adapter request shapes are unverified.
- No automated accessibility audit (axe) or screen-reader test; WCAG 2.2 AA is a design intent, checked only by contrast arithmetic and keyboard behaviour in tests.
- No Lighthouse/Core Web Vitals measurement; Google Fonts were blocked in the test browser (fallback fonts were rendered in all screenshots).
- Only Chromium; Safari/Firefox untested. No load testing; JSON-file store is single-process.
- Order of homepage sections, filter facets, COD refusal, subscription no-charge and no-fake-ratings are asserted by the walk.
