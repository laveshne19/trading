'use strict';
const { httpsJson } = require('../payments');
const configured = () => !!process.env.DHL_API_KEY;
module.exports = {
  id: 'dhl', label: 'DHL',
  status: () => (configured() ? 'configured_untested' : 'not_configured'),
  // Tracking via DHL Shipment Tracking (Unified) API: needs DHL_API_KEY only. NOT tested against live API in this build.
  async track(trackingNumber) {
    if (!configured()) return { ok: false, status: 'not_configured', error: 'DHL_API_KEY not set' };
    const r = await httpsJson('GET', 'api-eu.dhl.com', `/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`, { 'DHL-API-Key': process.env.DHL_API_KEY });
    return r.status === 200 ? { ok: true, raw: r.json } : { ok: false, status: 'error', error: `DHL HTTP ${r.status}` };
  },
  async rates() { return { ok: false, status: 'not_configured', error: 'Live DHL rating requires a DHL Express account (DHL_API_KEY/DHL_API_SECRET); use config/shipping.json estimates' }; },
  async createShipment() { return { ok: false, status: 'not_configured', error: 'Shipment creation not implemented; supplier ships and admin enters tracking' }; },
};
