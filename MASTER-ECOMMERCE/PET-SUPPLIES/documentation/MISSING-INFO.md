# Missing information (required before launch)

| Item | Why it matters |
|---|---|
| **Real product photography** (multiple angles per SKU, lifestyle shots) | All 162 images are generated SVG development placeholders marked DEV PLACEHOLDER. They must be replaced; `image_urls` in the CSV or `assets/img/products`. A shot list: front, back/label, size-in-use, detail. Also an OG image (`assets/img/og-default.png` is a placeholder) and real hero imagery. |
| Supplier catalogue | No real products, prices, MRPs, SKUs, EAN/barcodes, pack weights, ingredients, nutrition, manufacturer, FSSAI/importer details |
| Brand partner agreements and logos | "Trusted brands" shows an empty state by design |
| Business identity | Legal name, registered address, GSTIN, support email/phone, domain (`SITE_URL`) - `config/brand.json` holds placeholders |
| Payment gateway account | Razorpay and/or Cashfree keys and webhook secrets; none verified live |
| Courier accounts | Shiprocket / Delhivery / DTDC / Blue Dart credentials, pickup PIN, rate cards; adapters unverified |
| WhatsApp Business | `WHATSAPP_NUMBER` (click-to-chat) and Cloud API token + approved templates (names in `integrations/notify/templates.js`) |
| SMTP / email provider | Transactional + newsletter delivery |
| Legal review | Policy text is a template (LEGAL-NOTES.md) |
| Return window, minimum shelf-life, COD limits, loyalty economics | Business decisions; defaults are placeholders |
| Real reviews | None exist; only moderated customer submissions are shown |
| Subscription mandate provider | Needed to enable recurring payments (currently disabled by design) |
| Brand name/trademark check | "Paw & Hearth" is a placeholder; check availability before use |
| Production database | JSON-file store is for demo/low volume |
| Fonts self-hosting (optional) | Fraunces/DM Sans load from Google Fonts with system fallbacks |
