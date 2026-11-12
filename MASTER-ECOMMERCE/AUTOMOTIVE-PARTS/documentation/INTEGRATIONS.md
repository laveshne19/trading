# Integrations: honest status
| Integration | Implemented | Status without credentials | Verified live? |
|---|---|---|---|
| Razorpay | create order, payment signature HMAC, webhook HMAC, checkout page | `not_configured` | **No** (unit-tested HMAC only) |
| Cashfree | create order, webhook signature (timestamp+body, base64 HMAC), SDK page | `not_configured` | **No** |
| DEV mock gateway | full flow | `disabled` unless NODE_ENV!=production and DEV_MOCK_PAYMENT=1 | Yes (e2e) |
| COD | impossible by design (`assertPrepaid`, unit + HTTP tests) | n/a | Yes |
| Supplier `manual-queue` (default) | admin queue, PO CSV/text export, admin enters tracking | configured | Yes (e2e) |
| Supplier `alibaba-api` | stub, always `not_configured` | `not_configured` | n/a |
| DHL / UPS | tracking call only; rates/shipment not implemented | `not_configured` | **No** |
| Email SMTP | minimal client (TLS/STARTTLS, AUTH LOGIN) | `not_configured` (logs, does not pretend) | **No** |
| WhatsApp Cloud API | text send; chat button via `WHATSAPP_NUMBER` | `not_configured` | button Yes, API No |
| Shopify | CSV, GraphQL push (dry-run), webhook receiver, theme starter | `not_configured` | webhook HMAC tested; rest **No** |

## Alibaba reality
The official Shopify-Alibaba dropshipping app was withdrawn in Aug 2024, and Alibaba has no universal single-unit dropship API. Options to verify with the supplier: their own portal/API, CoDropshipping or another dropship app/agent, or the manual PO queue (default). The `alibaba-api` adapter never fakes success.
## Supplier payload
Whitelist only: item refs, OEM, qty, vehicle fitment confirmation, ship-to name/address/phone and our PO reference. Email, KYC, GST, payment ids, account data are stripped (tested). Failures retry with exponential backoff (0.8s base, 3 retries) and are logged to `data/logs/integrations.jsonl` (viewable at `/admin/logs`).
## Couriers
`config/shipping.json` holds zone rates (PLACEHOLDER values) and ETA wording: "typically 6-7 working days to India on substantiated routes - confirm". Always shown as an estimate. Replace rates once real courier quotes exist.
