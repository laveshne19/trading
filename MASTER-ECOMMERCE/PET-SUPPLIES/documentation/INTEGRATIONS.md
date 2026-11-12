# Integrations - honest status

**No integration below has been verified against a live account in this repository.** Code was written from the vendors' public documentation as best known; endpoints may have changed. Without credentials every adapter returns `not_configured` and never fakes success. Admin > Integrations shows the live status.

| Integration | Code | Env | Tested here | Status |
|---|---|---|---|---|
| Razorpay | orders API, checkout signature, webhook HMAC (`/webhooks/razorpay`) | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | signature maths unit-tested against the documented algorithm | unverified live |
| Cashfree | Orders API v2023-08-01, JS SDK launcher, server status fetch, webhook (`/webhooks/cashfree`) | `CASHFREE_APP_ID/SECRET_KEY/ENV` | webhook maths unit-tested | unverified live |
| DEV mock gateway | full flow incl. signature check | `DEV_MOCK_PAYMENT=1`, not production | e2e | dev only |
| Shiprocket | auth, serviceability, create order, AWB, label, tracking, webhook (`x-api-key` token) | `SHIPROCKET_*` | serviceability + auth against a local fake API | unverified live |
| Delhivery | pincode, create (form-encoded), tracking, label | `DELHIVERY_*` | not-configured path only | unverified |
| DTDC | consignment softdata, tracking | `DTDC_*` | not-configured path only | endpoints must be confirmed in DTDC onboarding docs |
| Blue Dart | JWT auth, pincode finder, tracking; waybill creation NOT wired | `BLUEDART_*` | not-configured path only | partial, unverified |
| SMTP email | minimal AUTH LOGIN client, implicit TLS or plain | `SMTP_*`, `EMAIL_FROM` | against a local fake SMTP server; STARTTLS not implemented | unverified with a real provider |
| WhatsApp Cloud API | template messages (names in `notify/templates.js`) | `WHATSAPP_CLOUD_TOKEN/PHONE_NUMBER_ID` | not-configured path only | unverified; templates need Meta approval |
| WhatsApp click-to-chat button | link `wa.me/<number>` | `WHATSAPP_NUMBER` | e2e (footer/contact) | works |
| Shopify | CSV export, GraphQL push (dry-run default), webhook verification (`/webhooks/shopify/*`), theme skeleton | `SHOPIFY_*` | CSV export runs; push dry-run runs | unverified live; webhooks logged, not applied |

## Setup notes
- **Razorpay:** create keys; add webhook `SITE_URL/webhooks/razorpay` for `payment.captured`, `order.paid`, `payment.failed`; set the same secret in `RAZORPAY_WEBHOOK_SECRET`.
- **Cashfree:** set app id/secret; webhook URL `SITE_URL/webhooks/cashfree`; `return_url` is sent per order.
- **Shiprocket:** API user email/password, pickup location name, `PICKUP_PINCODE`, `SHIPPING_PRIMARY=shiprocket` to make PIN checks courier-verified; in Shiprocket webhook settings set a token and put it in `SHIPROCKET_WEBHOOK_TOKEN` (sent as `x-api-key`).
- Only the courier named in `SHIPPING_PRIMARY` is used for serviceability; otherwise the local zone table is used and labelled "Estimated, not courier-verified".
- Webhooks: signature/token verified on the raw body (timing-safe), duplicates dropped by event id, failures retried (30 s doubling, 5 attempts) and logged; see admin > Logs.
- Refunds are NOT executed through gateways; admin marks `refunded` after refunding in the gateway dashboard.
