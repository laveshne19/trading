# Shopify webhook mapping

Endpoint on this server: `POST /webhooks/shopify/:topic` (any topic slug). Verification: `X-Shopify-Hmac-Sha256` = base64(HMAC-SHA256(raw body, SHOPIFY_WEBHOOK_SECRET)), compared timing-safe against the **raw** request body. Idempotency: `X-Shopify-Webhook-Id`. Failures are retried with exponential backoff (5 attempts) and logged to the integration log (admin > Logs).

**Current behaviour (honest):** verified events are stored and shown in admin > Logs. They are NOT yet applied to local data automatically. The mapping below is the intended design.

| Shopify topic | Intended mapping | Status |
|---|---|---|
| `orders/create`, `orders/paid` | Create/mark order in local store (match by `name`) | logged only |
| `orders/cancelled` | `orders.cancel(no)` -> releases reserved stock | logged only |
| `refunds/create` | transition to `refunded` | logged only |
| `fulfillments/create`, `fulfillments/update` | `shipped` + AWB from `tracking_number` | logged only |
| `inventory_levels/update` | `inventory.setStock(sku)` via inventory_item_id -> SKU lookup | logged only |
| `products/update`, `products/delete` | Re-import / mark inactive | logged only |
| `customers/data_request`, `customers/redact`, `shop/redact` | **Mandatory GDPR-style topics for public apps; for DPDP handling wire to account erasure** | logged only |

Register webhooks in Shopify admin (Settings > Notifications > Webhooks) or via `webhookSubscriptionCreate`, pointing to `SITE_URL/webhooks/shopify/<topic-with-slash-replaced-by-dash>`.
