'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const crypto = require('node:crypto'); const { tmpStore } = require('./helpers');
const { discountPct, buildTotals } = require('../../frontend/lib/pricing');
const { createCoupons, computeDiscount } = require('../../frontend/lib/coupons');
const { createInventory, InsufficientStock } = require('../../frontend/lib/inventory');
const { codCheck } = require('../../frontend/lib/cod');
const { createOrders, canTransition, TRANSITIONS } = require('../../frontend/lib/orders');
const { createLoyalty } = require('../../frontend/lib/loyalty');
const { createPincode } = require('../../frontend/lib/pincode');
const pets = require('../../frontend/lib/pets');
const { createSubscriptions } = require('../../frontend/lib/subscriptions');
const { verifyShopify } = require('../../frontend/lib/webhooks');
const razorpay = require('../../integrations/payments/razorpay'); const cashfree = require('../../integrations/payments/cashfree');
const { createShipping } = require('../../integrations/shipping');
const zones = require('../../config/pincode-zones.json'); const defaults = require('../../config/settings.defaults.json');

test('discount computed from MRP', () => { assert.equal(discountPct(1000, 800), 20); assert.equal(discountPct(500, 500), 0); assert.equal(discountPct(0, 10), 0); assert.equal(discountPct(299, 269), 10); });
test('totals: shipping threshold, coupon, loyalty, COD fee', () => {
  const lines = [{ unitPrice: 400, unitMrp: 500, qty: 1 }]; const s = defaults;
  let t = buildTotals({ lines, settings: s }); assert.equal(t.shipping, 79); assert.equal(t.total, 479); assert.equal(t.savings, 100);
  t = buildTotals({ lines: [{ unitPrice: 800, unitMrp: 800, qty: 1 }], settings: s }); assert.equal(t.shipping, 0);
  t = buildTotals({ lines: [{ unitPrice: 1000, unitMrp: 1000, qty: 1 }], couponDiscount: 150, loyaltyDiscount: 50, settings: s, paymentMethod: 'cod' }); assert.equal(t.total, 800 + 40);
  t = buildTotals({ lines, couponDiscount: 9999, settings: s }); assert.equal(t.couponDiscount, 400);
});
test('coupons: percent cap, flat, min cart, expiry, usage limits', () => {
  const st = tmpStore(); const c = createCoupons(st, [
    { code: 'P10', type: 'percent', value: 10, maxDiscount: 150, minCart: 500, expiresAt: '2999-01-01', usageLimit: 2, perUserLimit: 1, active: true },
    { code: 'OLD', type: 'flat', value: 50, minCart: 0, expiresAt: '2000-01-01', active: true }]);
  assert.equal(computeDiscount({ type: 'percent', value: 10, maxDiscount: 150 }, 5000), 150);
  assert.equal(c.evaluate('p10', { subtotal: 1000 }).discount, 100);
  assert.match(c.evaluate('P10', { subtotal: 100 }).reason, /minimum/);
  assert.match(c.evaluate('OLD', { subtotal: 100 }).reason, /expired/);
  assert.equal(c.evaluate('NOPE', { subtotal: 100 }).valid, false);
  c.consume('P10', 'u1', 'O1'); assert.match(c.evaluate('P10', { subtotal: 1000, userKey: 'u1' }).reason, /already used/);
  c.consume('P10', 'u2', 'O2'); assert.match(c.evaluate('P10', { subtotal: 1000, userKey: 'u3' }).reason, /usage limit/);
  c.release('O2'); assert.equal(c.evaluate('P10', { subtotal: 1000, userKey: 'u3' }).valid, true);
});
test('inventory: reserve, all-or-nothing, release, commit, expiry sweep, low stock', () => {
  const st = tmpStore(); const inv = createInventory(st, { A: { available: 5, reserved: 0, threshold: 3 }, B: { available: 1, reserved: 0, threshold: 3 } });
  inv.reserve('O1', [{ sku: 'A', qty: 2 }]); assert.deepEqual([inv.get('A').available, inv.get('A').reserved], [3, 2]);
  assert.throws(() => inv.reserve('O2', [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 5 }]), InsufficientStock); assert.equal(inv.get('A').available, 3);
  inv.reserve('O1', [{ sku: 'A', qty: 2 }]); assert.equal(inv.get('A').reserved, 2); // idempotent
  assert.equal(inv.release('O1'), true); assert.equal(inv.release('O1'), false); assert.deepEqual([inv.get('A').available, inv.get('A').reserved], [5, 0]);
  inv.reserve('O3', [{ sku: 'A', qty: 1 }], { ttlMs: 10, now: 1000 }); assert.deepEqual(inv.expireDue(2000), ['O3']);
  inv.commit('O3'); assert.deepEqual([inv.get('A').available, inv.get('A').reserved], [4, 0]);
  assert.deepEqual(inv.lowStock().map((x) => x.sku), ['B', 'A'].filter((s) => inv.get(s).available <= 3));
});
test('COD rules', () => {
  const base = { settings: { ...defaults, codEnabled: true }, subtotalAfterDiscount: 1000, lines: [], pin: '110001', zone: { cod: true } };
  assert.equal(codCheck(base).allowed, true);
  assert.equal(codCheck({ ...base, settings: { ...base.settings, codEnabled: false } }).allowed, false);
  assert.equal(codCheck({ ...base, subtotalAfterDiscount: 9000 }).allowed, false);
  assert.equal(codCheck({ ...base, zone: { cod: false } }).allowed, false);
  assert.equal(codCheck({ ...base, lines: [{ rx: true }] }).allowed, false);
  assert.equal(codCheck({ ...base, settings: { ...base.settings, codExcludedPinPrefixes: ['110'] } }).allowed, false);
});
function mkOrders() {
  const st = tmpStore(); const inv = createInventory(st, { A: { available: 5, reserved: 0, threshold: 1 } }); const coupons = createCoupons(st, []); const loyalty = createLoyalty(st);
  const orders = createOrders({ store: st, inventory: inv, coupons, loyalty, notifier: null, settings: () => defaults, brand: { orderPrefix: 'T' } });
  const mk = (method = 'prepaid', extra = {}) => orders.create({ userId: 'U1', email: 'a@b.co', name: 'N', address: { phone: '9876543210' }, items: [{ sku: 'A', qty: 2, unitPrice: 500, title: 't' }], totals: { total: 1000, shipping: 0, codFee: 0 }, payment: { method }, ...extra }).order;
  return { st, inv, orders, loyalty, mk };
}
test('order state machine: legal/illegal, idempotent, inventory + loyalty effects', () => {
  const { inv, orders, loyalty, mk } = mkOrders(); const o = mk();
  assert.equal(o.state, 'pending_payment'); assert.equal(inv.get('A').reserved, 2);
  assert.throws(() => orders.transition(o.no, 'shipped'), /Cannot move/);
  orders.markPaid(o.no, { gateway: 'x', paymentId: 'p1', amountRupees: 1000 }); assert.equal(orders.get(o.no).state, 'paid');
  assert.equal(orders.markPaid(o.no, { gateway: 'x', paymentId: 'p1' }).idempotent, true);
  assert.throws(() => orders.markPaid(mk().no, { gateway: 'x', paymentId: 'p2', amountRupees: 5 }), /amount/);
  for (const s of ['packed', 'shipped']) orders.transition(o.no, s); assert.equal(inv.get('A').reserved, 0 + 2); // second order still reserved
  assert.equal(orders.transition(o.no, 'shipped').idempotent, true);
  orders.transition(o.no, 'out_for_delivery'); orders.transition(o.no, 'delivered'); orders.transition(o.no, 'delivered', { key: 'k' });
  assert.equal(loyalty.balance('U1'), 20); // 2% of 1000
  orders.transition(o.no, 'return_requested'); orders.transition(o.no, 'refunded'); assert.equal(loyalty.balance('U1'), 0);
  assert.ok(Object.keys(TRANSITIONS).every((k) => Array.isArray(TRANSITIONS[k]))); assert.equal(canTransition('refunded', 'paid'), false);
});
test('cancel releases stock; unpaid orders expire; late payment flags refund; COD confirms immediately; idempotency key', () => {
  const { inv, orders, mk } = mkOrders(); const a = mk(); orders.cancel(a.no); assert.equal(inv.get('A').available, 5);
  const b = mk(); const swept = orders.sweepExpired(Date.now() + 3600e3); assert.deepEqual(swept, [b.no]); assert.equal(orders.get(b.no).state, 'cancelled');
  const r = orders.markPaid(b.no, { gateway: 'x', paymentId: 'late' }); assert.equal(r.lateAfterCancel, true); assert.equal(orders.get(b.no).payment.status, 'refund_due');
  const c = mk('cod'); assert.equal(c.state, 'cod_confirmed');
  const d1 = mk('prepaid', { idempotencyKey: 'K' }); const d2 = orders.create({ userId: 'U1', email: 'a@b.co', name: 'N', address: { phone: '9' }, items: [{ sku: 'A', qty: 1, unitPrice: 1, title: 't' }], totals: { total: 1, shipping: 0, codFee: 0 }, payment: { method: 'prepaid' }, idempotencyKey: 'K' });
  assert.equal(d2.duplicate, true); assert.equal(d2.order.no, d1.no);
  assert.throws(() => mk('prepaid', { items: [{ sku: 'A', qty: 99, unitPrice: 1, title: 't' }] }), InsufficientStock);
});
test('HMAC verification (razorpay checkout + webhook, cashfree webhook, shopify)', () => {
  const rz = razorpay.create({ RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 'sec', RAZORPAY_WEBHOOK_SECRET: 'wh' });
  const sig = crypto.createHmac('sha256', 'sec').update('order_1|pay_1').digest('hex');
  assert.equal(rz.verifyPayment({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }), true); assert.equal(rz.verifyPayment({ orderId: 'order_1', paymentId: 'pay_2', signature: sig }), false); assert.equal(rz.verifyPayment({ orderId: 'order_1', paymentId: 'pay_1', signature: 'short' }), false);
  const body = '{"event":"payment.captured"}'; const ws = crypto.createHmac('sha256', 'wh').update(body).digest('hex');
  assert.equal(rz.verifyWebhook(body, ws), true); assert.equal(rz.verifyWebhook(body + ' ', ws), false); assert.equal(rz.verifyWebhook(body, undefined), false);
  const cf = cashfree.create({ CASHFREE_APP_ID: 'a', CASHFREE_SECRET_KEY: 'cs' }); const cs = crypto.createHmac('sha256', 'cs').update('1700' + body).digest('base64');
  assert.equal(cf.verifyWebhook(body, cs, '1700'), true); assert.equal(cf.verifyWebhook(body, cs, '1701'), false);
  const ss = crypto.createHmac('sha256', 'sh').update(body).digest('base64'); assert.equal(verifyShopify(body, ss, 'sh'), true); assert.equal(verifyShopify(body, ss, 'other'), false); assert.equal(verifyShopify(body, ss, ''), false);
  assert.equal(razorpay.create({}).verifyPayment({ orderId: 'a', paymentId: 'b', signature: 'c' }), false);
});
test('adapters are not_configured without env and never fake success', async () => {
  const sh = createShipping({});
  for (const a of Object.values(sh.adapters)) { assert.equal(a.configured(), false); const r = await a.createOrder({}); assert.equal(r.ok, false); assert.equal(r.status, 'not_configured'); const t = await a.track('X'); assert.equal(t.ok, false); }
  assert.equal(sh.primary(), null); assert.equal((await razorpay.create({}).createOrder({ orderNo: 'x', amountRupees: 1 })).status, 'not_configured');
});
test('pincode: invalid, unserviceable, local estimate labelled, adapter used when configured', async () => {
  const pc = createPincode({ zones, shipping: createShipping({}), settings: () => defaults });
  assert.equal((await pc.check('12')).valid, false); assert.equal((await pc.check('012345')).valid, false);
  const r = await pc.check('110001'); assert.equal(r.serviceable, true); assert.equal(r.verified, false); assert.match(r.label, /not courier-verified/); assert.deepEqual(r.etaDays, [2, 4]);
  assert.equal((await pc.check('900001')).serviceable, false); assert.equal((await pc.check('781001')).cod, false);
  const fake = { primary: () => ({ name: 'fake', label: 'Fake', serviceability: async () => ({ ok: true, serviceable: false, cod: false, etaDays: null }) }) };
  const v = await createPincode({ zones, shipping: fake, settings: () => defaults }).check('110001'); assert.equal(v.verified, true); assert.equal(v.serviceable, false);
});
test('pet profile matching: type, age group, size only', () => {
  const dogAdult = { type: 'dog', ageYears: 3, weightKg: 30 }; const prod = { petType: ['dog'], ageGroup: ['puppy'], size: ['small'], petWeightKg: { min: 1, max: 10 } };
  assert.equal(pets.ageGroupOf('dog', 0.5), 'puppy'); assert.equal(pets.ageGroupOf('cat', 12), 'senior'); assert.equal(pets.sizeOf('dog', 30), 'large');
  const r = pets.suits(prod, dogAdult); assert.equal(r.suits, false); assert.ok(r.mismatch.length >= 2);
  assert.equal(pets.suits({ ...prod, petType: ['cat'] }, dogAdult).suits, false);
  assert.equal(pets.suits({ petType: ['dog'], ageGroup: ['adult'], size: ['large'], petWeightKg: { min: 10, max: 60 } }, dogAdult).suits, true);
  assert.ok(pets.validatePet({ type: 'bird', name: '' }).errors.length >= 2); assert.match(pets.DISCLAIMER, /not veterinary advice/);
});
test('subscriptions never charge or create orders', async () => {
  const st = tmpStore(); let notified = 0; const subs = createSubscriptions({ store: st, notifier: { notify: async () => { notified++; } } });
  const s = subs.create({ userId: 'U', sku: 'A', title: 'T', variantLabel: 'V', qty: 2, intervalDays: 30 });
  assert.equal(subs.RECURRING_PAYMENTS_ENABLED, false); assert.equal(s.paymentCollection, 'disabled');
  const sent = await subs.runDue('2999-01-01', () => 'x@y.z'); assert.deepEqual(sent, [s.id]); assert.equal(notified, 1);
  assert.equal(st.get('orders', null), null, 'no orders collection written'); assert.throws(() => subs.create({ userId: 'U', sku: 'A', title: 'T', variantLabel: 'V', intervalDays: 7 }));
  assert.equal(Object.keys(subs).some((k) => /charge|pay/i.test(k) && k !== 'RECURRING_PAYMENTS_ENABLED'), false);
});
