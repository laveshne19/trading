'use strict';
const razorpay = require('./razorpay'); const cashfree = require('./cashfree'); const mock = require('./mock');
function createPayments({ env = process.env, config }) {
  const adapters = { razorpay: razorpay.create(env), cashfree: cashfree.create(env), mock: mock.create({ enabled: config.devMockPayment, secret: config.secret }) };
  const active = () => Object.values(adapters).filter((a) => a.configured());
  // Preference: real gateways first. Mock only if no real gateway is configured (or dev explicitly enabled and none else).
  const preferred = () => adapters.razorpay.configured() ? adapters.razorpay : adapters.cashfree.configured() ? adapters.cashfree : adapters.mock.configured() ? adapters.mock : null;
  return { adapters, active, preferred, get: (n) => adapters[n] };
}
module.exports = { createPayments };
