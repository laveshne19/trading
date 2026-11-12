'use strict';
// STUB. Honest reality (see documentation/INTEGRATIONS.md): the official Shopify <-> Alibaba dropshipping app was withdrawn in Aug 2024 and
// Alibaba has no universal single-unit dropship API. Options (CoDropshipping, supplier-specific API/portal) must be verified with the supplier.
// This adapter NEVER fakes success: it reports not_configured.
const configured = () => !!(process.env.ALIBABA_APP_KEY && process.env.ALIBABA_APP_SECRET && process.env.ALIBABA_ACCESS_TOKEN);
const nc = () => ({ ok: false, status: 'not_configured', error: configured() ? 'Alibaba API integration is not implemented (no verified single-unit dropship API)' : 'Alibaba API credentials not set and no verified API exists for single-unit dropship' });
module.exports = {
  id: 'alibaba-api', label: 'Alibaba API (stub)',
  status: () => 'not_configured',
  submitOrder: async () => nc(), getStatus: async () => nc(), syncTracking: async () => nc(),
};
