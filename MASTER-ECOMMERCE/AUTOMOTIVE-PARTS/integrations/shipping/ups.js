'use strict';
const { httpsJson } = require('../payments');
const https = require('https');
const configured = () => !!(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET);
function token() {
  return new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials';
    const auth = Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString('base64');
    const req = https.request({ method: 'POST', host: 'onlinetools.ups.com', path: '/security/v1/oauth/token', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }, timeout: 15000 }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b).access_token); } catch (e) { reject(e); } });
    }); req.on('error', reject); req.end(body);
  });
}
module.exports = {
  id: 'ups', label: 'UPS',
  status: () => (configured() ? 'configured_untested' : 'not_configured'),
  async track(n) {
    if (!configured()) return { ok: false, status: 'not_configured', error: 'UPS_CLIENT_ID/UPS_CLIENT_SECRET not set' };
    const t = await token(); if (!t) return { ok: false, status: 'error', error: 'UPS auth failed' };
    const r = await httpsJson('GET', 'onlinetools.ups.com', `/api/track/v1/details/${encodeURIComponent(n)}`, { Authorization: `Bearer ${t}`, transId: String(Date.now()), transactionSrc: 'store' });
    return r.status === 200 ? { ok: true, raw: r.json } : { ok: false, status: 'error', error: `UPS HTTP ${r.status}` };
  },
  async rates() { return { ok: false, status: 'not_configured', error: 'Live UPS rating not implemented; use config/shipping.json estimates' }; },
  async createShipment() { return { ok: false, status: 'not_configured', error: 'Shipment creation not implemented' }; },
};
