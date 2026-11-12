'use strict';
// Default supplier adapter: orders go to an admin queue. A human sends the PO (CSV/email export) and enters tracking. Nothing is auto-sent to the supplier.
const { buildSupplierPayload } = require('./payload');
module.exports = {
  id: 'manual-queue', label: 'Manual queue (admin sends PO, enters tracking)',
  status: () => 'configured',
  async submitOrder(order, catalog) {
    const payload = buildSupplierPayload(order, catalog);
    return { ok: true, status: 'queued', reference: `PO-${order.order_no}`, payload, note: 'Queued for manual submission by admin' };
  },
  async getStatus(order) { return { ok: true, status: order.supplier ? order.supplier.status : 'unknown', tracking: order.supplier && order.supplier.tracking }; },
  async syncTracking(order) { return { ok: true, status: 'manual', tracking: order.supplier && order.supplier.tracking, note: 'Tracking is entered by admin' }; },
};
