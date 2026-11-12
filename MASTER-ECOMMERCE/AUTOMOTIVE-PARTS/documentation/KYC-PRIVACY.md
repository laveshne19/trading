# KYC and privacy
- **No mandatory Aadhaar or PAN anywhere.** Checkout asks only name, email, phone, address, vehicle confirmations; GST/business details are optional and stored only with a ticked consent.
- KYC document request happens only when an admin flags an order (reason shown to customer). The customer sees a consent checkbox on `/track`; without consent nothing is stored; they may decline and discuss cancel/refund.
- Documents are saved under `data/uploads/kyc/` with random names (0600), served only to admin as attachments, never sent to the supplier (payload whitelist, tested).
- Enquiry uploads: jpg/png/webp/pdf, 5MB, magic-byte checked; page tells users not to upload ID.
- Passwords: scrypt with per-user salt. Sessions: signed HttpOnly cookie. Logs contain no card data or documents.
- Open legal items (need a lawyer): privacy policy text, data-retention period, customs/ID requirements for imports, GST invoicing. Drafts are labelled as drafts.
