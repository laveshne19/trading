'use strict';
const shiprocket = require('./shiprocket'); const delhivery = require('./delhivery'); const dtdc = require('./dtdc'); const bluedart = require('./bluedart');
function createShipping(env = process.env) {
  const adapters = { shiprocket: shiprocket.create(env), delhivery: delhivery.create(env), dtdc: dtdc.create(env), bluedart: bluedart.create(env) };
  const primary = () => {
    const want = env.SHIPPING_PRIMARY && adapters[env.SHIPPING_PRIMARY];
    if (want && want.configured()) return want;
    return null; // never silently choose a different courier than the one the operator named
  };
  return { adapters, primary, get: (n) => adapters[n] };
}
module.exports = { createShipping };
