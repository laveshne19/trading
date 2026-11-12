# Information still required from the business
- **Prices** for every product (catalog/pricing.json) or a supplier price list; margin/currency policy.
- Supplier agreement: stock, MOQ, lead time, **warranty terms**, return acceptance, condition per part (OEM/equivalent/aftermarket), inspection/QC process, whether supplier can dropship single units and how (API/portal/agent).
- Real shipping rates (DHL/UPS accounts), weights/dimensions, HS codes, duty/GST rules and who pays; replace placeholders in `config/shipping.json` and `config/site.json`.
- Payment gateway account and keys (Razorpay and/or Cashfree), webhook secrets; SMTP credentials; WhatsApp number/Cloud API; Shopify store + token (if used).
- Legal: company name/registration/GSTIN/address/phone, reviewed policies, privacy retention.
- Brand name and domain (placeholder "Apex Lumen" is configurable via `SITE_NAME`), logo, **hero photography and product photography** (supplier thumbnails are small; 97 have <200px width).
- Digital dashboard/instrument cluster products (none in the supplier PDF).
- Vehicle DB enrichment: Bentley/Ferrari/Lamborghini/Aston and most Indian-market models have no generation data (left empty deliberately).
- Production secrets: SESSION_SECRET, ADMIN_USER/ADMIN_PASS, persistent DATA_DIR + backups.
