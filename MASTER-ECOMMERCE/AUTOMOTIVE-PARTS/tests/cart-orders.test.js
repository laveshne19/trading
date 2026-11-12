'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const cartLib = require('../frontend/lib/cart');
const { transition, canTransition, OrderStore, TRANSITIONS, STATUSES } = require('../frontend/lib/orders');
const { validateCheckout } = require('../frontend/lib/checkout');
const { priceFor } = require('../frontend/lib/pricing');
const { catalogFor, cfgFor, tmp } = require('./helpers');
const cfgDemo = cfgFor({ devDemoPrices: true, isProd: false });
const cat = catalogFor({ devDemoPrices: true, isProd: false });
const shipping = cfgDemo.shipping;

test('cart totals: subtotal + shipping, server re-priced, qty clamped', () => {
  const a = cat.products[0], b = cat.products[1];
  const cart = []; cartLib.addItem(cart, a.sku, 2); cartLib.addItem(cart, b.sku, 1); cartLib.addItem(cart, a.sku, 100);
  assert.equal(cart.find((l) => l.sku === a.sku).qty, 10);
  const r = cartLib.price(cart, cat, shipping, 'IN');
  const expect = priceFor(a, cfgDemo).amount * 10 + priceFor(b, cfgDemo).amount;
  assert.equal(r.subtotal, expect); assert.equal(r.total, expect + r.shipping.amount); assert.ok(r.shipping.amount > 0);
  assert.equal(r.devPrices, true);
});
test('unpriced products are never purchasable (price on request) and unknown skus are flagged', () => {
  const plain = catalogFor({ devDemoPrices: false });
  const cart = [{ sku: plain.products[0].sku, qty: 1 }, { sku: 'NOPE', qty: 1 }];
  const r = cartLib.price(cart, plain, shipping, 'IN');
  assert.equal(r.lines.length, 0); assert.equal(r.unpriced.length, 1); assert.deepEqual(r.missing, ['NOPE']); assert.equal(r.total, 0);
});
test('pricing.json real price wins; demo prices are flagged dev and never in production', () => {
  const p = cat.products[0];
  assert.equal(priceFor(p, { pricing: { [p.sku]: 12345 } }).amount, 12345);
  assert.equal(priceFor(p, { pricing: {}, devDemoPrices: true, isProd: false }).dev, true);
  assert.equal(priceFor(p, { pricing: {}, devDemoPrices: true, isProd: true }), null);
  assert.equal(priceFor(p, { pricing: {} }), null);
});
test('setQty removes line at 0', () => { const c = [{ sku: 'a', qty: 2 }]; cartLib.setQty(c, 'a', 0); assert.equal(c.length, 0); });

test('order state machine: legal flow, illegal jumps rejected, idempotent repeat', () => {
  const o = { status: 'pending_payment', history: [] };
  const flow = ['paid', 'supplier_queued', 'supplier_accepted', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered'];
  for (const s of flow) assert.ok(transition(o, s).ok, s);
  assert.equal(o.status, 'delivered');
  assert.equal(transition(o, 'delivered').noop, true);
  assert.equal(transition(o, 'paid').ok, false);
  const o2 = { status: 'pending_payment', history: [] };
  assert.equal(transition(o2, 'dispatched').ok, false);
  assert.ok(transition(o2, 'cancelled').ok); assert.ok(transition(o2, 'refunded').ok);
  assert.ok(STATUSES.every((s) => s in TRANSITIONS));
  assert.ok(canTransition('delivered', 'return_requested'));
});
test('order store creation is idempotent on idem_key and persists', () => {
  const dir = tmp(); const s = new OrderStore(dir);
  const base = { idem_key: 'abc', email: 'a@b.co', shipping: {}, lines: [], totals: { total: 1 } };
  const r1 = s.create(base), r2 = s.create(base), r3 = s.create({ ...base, idem_key: 'xyz' });
  assert.equal(r2.duplicate, true); assert.equal(r1.order.order_no, r2.order.order_no); assert.notEqual(r1.order.order_no, r3.order.order_no);
  assert.equal(new OrderStore(dir).all().length, 2);
});

const goodForm = (sku) => ({ name: 'Test Buyer', email: 'T@Example.com', phone: '+91 98765 43210', line1: '1 Road', city: 'Pune', state: 'MH', postal_code: '411001', country: 'IN', duties_ack: 'on', payment_method: 'mock',
  compat: { [sku]: { make: 'BMW', model: '3 Series', year: '2014', drive: 'RHD', side: 'left', position: 'front', oem_ack: 'on', fit_ack: 'on', high_ack: 'on' } } });
test('checkout validation: compat confirmation, duties ack, no mandatory Aadhaar/PAN', () => {
  const sku = cat.products[2].sku; const cart = [{ sku, qty: 1 }];
  const ok = validateCheckout(goodForm(sku), cart, cat, shipping); assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  const f = goodForm(sku); delete f.compat[sku].fit_ack; assert.ok(validateCheckout(f, cart, cat, shipping).errors[`compat:${sku}`].fit_ack);
  const f2 = goodForm(sku); delete f2.duties_ack; assert.ok(validateCheckout(f2, cart, cat, shipping).errors.duties_ack);
  assert.ok(!('aadhaar' in ok.errors) && !('pan' in ok.errors));
});
test('checkout: GSTIN optional but needs consent when given; bad format rejected', () => {
  const sku = cat.products[2].sku; const cart = [{ sku, qty: 1 }];
  const f = { ...goodForm(sku), gstin: '27AAPFU0939F1ZV' }; assert.ok(validateCheckout(f, cart, cat, shipping).errors.business_consent);
  assert.equal(validateCheckout({ ...f, business_consent: 'on' }, cart, cat, shipping).ok, true);
  assert.ok(validateCheckout({ ...f, gstin: 'BAD', business_consent: 'on' }, cart, cat, shipping).errors.gstin);
});
test('checkout: COD is rejected', () => {
  const sku = cat.products[2].sku; const cart = [{ sku, qty: 1 }];
  for (const m of ['cod', 'COD', 'cash_on_delivery', 'Cash on Delivery', 'pay-on-delivery']) {
    const v = validateCheckout({ ...goodForm(sku), payment_method: m }, cart, cat, shipping);
    assert.equal(v.ok, false, m); assert.match(v.errors.payment_method, /Cash on delivery|Unknown/);
  }
});
