# Operations

**Daily:** admin > Dashboard (warnings), Orders (move through packed/shipped/delivered; Create courier shipment when a courier is configured, otherwise book externally and mark shipped with AWB), Low stock report, Reviews (approve/reject), Enquiries.
**Stock:** admin > Inventory edits available/reorder threshold/location/batch/expiry per variant. Reserved = held for orders not yet shipped. Check expiry dates on food.
**Coupons:** admin > Coupons (percentage with optional cap, or flat; minimum cart; expiry; total and per-user limits).
**COD:** admin > Settings & COD (enable, fee, min/max order value, excluded PIN prefixes). The rules are enforced server-side at checkout.
**Refunds:** orders with `payment: refund_due` need a manual refund in the gateway dashboard, then "Refunded" in admin (restores loyalty effects).
**Subscriptions:** schedules only; reminders are logged as notifications (no scheduler sends them until email/WhatsApp are connected; `subscriptions.runDue()` is available for a cron job but is not wired to a timer).
**Backups:** copy `DATA_DIR` regularly. **Reset dev data:** delete `data/runtime`.
**Monitoring:** `/healthz`, admin > Logs (integration errors, notification outcomes, webhook retries).
**Go-live checklist:** real catalogue and photos, `DEMO_CATALOGUE=0`, legal review, gateway + webhooks verified with test payments, courier verified, strong admin password, HTTPS + `TRUST_PROXY=1`, backups, DPDP processes (consent/erasure) in place.
