# Operations (admin workflow)
1. Sign in at `/admin` (Basic auth). Dashboard shows counts.
2. **Orders** `/admin/orders`: open an order to see customer, vehicle confirmations per line (check make/model/year/LHD-RHD/side/position), history.
3. **Supplier queue** `/admin/queue`: paid orders are auto-queued by the `manual-queue` adapter. Download the PO (CSV or email-ready text), send it to the supplier yourself, click "Mark PO sent", then "Supplier accepted".
4. Enter the DHL/UPS/other tracking number: order becomes `dispatched`; customer sees it on `/track` (order no + email). Move to `in_transit` / `out_for_delivery` / `delivered` with the status control (illegal jumps are refused).
5. **Quotes/enquiries** `/admin/enquiries`: price-on-request quote requests and photo enquiries; reply by email/WhatsApp manually, then set status. When you decide a price, add it to `catalog/pricing.json` (restart the server).
6. **KYC flags**: flag only when needed; the customer is asked with consent. Clear the flag when done.
7. **Low-data report** shows products without price, images, low-resolution photos, no vehicle match.
8. **Integrations / Logs** show real status and errors. If supplier submit fails the order stays `paid` with the error; use "Submit to supplier adapter (retry)".
9. Cancel/refund: change status (refund itself is done in the gateway dashboard; the app does not call refund APIs yet).
