// Verify an installed+patched growwapi is actually loadable and complete.
// Usage: node smoke-test.mjs <dir containing node_modules/growwapi>
// Uses dummy credentials only. Makes no network calls and places no orders.
const projectDir = process.argv[2];
if (!projectDir) { console.error('usage: node smoke-test.mjs <project-dir>'); process.exit(2); }

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' :: ' + String(e.message).split('\n').filter(Boolean)[0]); fail++; }
};

const base = new URL('file://' + projectDir.replace(/\/?$/, '/'));
const sdkUrl = new URL('node_modules/growwapi/dist/index.js', base).href;

let mod;
try { mod = await import(sdkUrl); }
catch (e) {
  console.error('\nCould not load the SDK at ' + sdkUrl);
  console.error(e.code + ': ' + e.message.split('\n')[0]);
  console.error('\nThe package is almost certainly unpatched. Run install-growwapi.sh.');
  process.exit(1);
}

const { GrowwAPI, Exchange, Segment, Product, OrderType, TransactionType, Validity,
        InstrumentType, LiveFeedSubscriptionType } = mod;

t('module loads', () => { if (!GrowwAPI) throw new Error('no GrowwAPI export'); });

t('rejects missing credentials', () => {
  const k = process.env.GROWW_API_KEY, s = process.env.GROWW_API_SECRET;
  delete process.env.GROWW_API_KEY; delete process.env.GROWW_API_SECRET;
  let ok = false;
  try { new GrowwAPI(); } catch (e) { ok = /GROWW_API_KEY/.test(e.message); }
  if (k) process.env.GROWW_API_KEY = k;
  if (s) process.env.GROWW_API_SECRET = s;
  if (!ok) throw new Error('constructor accepted missing env vars');
});

process.env.GROWW_API_KEY = 'smoke-test-key';
process.env.GROWW_API_SECRET = 'JBSWY3DPEHPK3PXP';   // RFC 4648 base32 test seed

let groww;
t('constructs with credentials', () => { groww = new GrowwAPI(); });

for (const r of ['orders', 'holdings', 'position', 'margins', 'liveData',
                 'historicData', 'instructions', 'liveFeed', 'auth'])
  t('exposes .' + r, () => { if (!groww[r]) throw new Error('missing'); });

for (const m of ['create', 'modify', 'cancel', 'status', 'statusByReference',
                 'getOrders', 'details', 'getTrades'])
  t('orders.' + m + '()', () => {
    if (typeof groww.orders[m] !== 'function') throw new Error('not a function');
  });

t('holdings.list()', () => { if (typeof groww.holdings.list !== 'function') throw new Error('missing'); });
t('position.user/tradingSymbol()', () => {
  for (const m of ['user', 'tradingSymbol'])
    if (typeof groww.position[m] !== 'function') throw new Error(m);
});
t('margins.details/requiredForOrder()', () => {
  for (const m of ['details', 'requiredForOrder'])
    if (typeof groww.margins[m] !== 'function') throw new Error(m);
});
t('liveData.getQuote/getLTP/getOHLC()', () => {
  for (const m of ['getQuote', 'getLTP', 'getOHLC'])
    if (typeof groww.liveData[m] !== 'function') throw new Error(m);
});
t('historicData.get()', () => {
  if (typeof groww.historicData.get !== 'function') throw new Error('missing');
});
t('instructions.getInstructions/getFilteredInstructions()', () => {
  for (const m of ['getInstructions', 'getFilteredInstructions'])
    if (typeof groww.instructions[m] !== 'function') throw new Error(m);
});

t('enum values match the Groww wire format', () => {
  const eq = (got, want, label) => { if (got !== want) throw new Error(label + ': ' + got); };
  eq(Exchange.NSE, 'NSE', 'Exchange.NSE');
  eq(Exchange.BSE, 'BSE', 'Exchange.BSE');
  eq(Segment.CASH, 'CASH', 'Segment.CASH');
  eq(Segment.FNO, 'FNO', 'Segment.FNO');
  eq(Product.CNC, 'CNC', 'Product.CNC');
  eq(Product.MIS, 'MIS', 'Product.MIS');
  eq(Product.NRML, 'NRML', 'Product.NRML');
  eq(OrderType.Limit, 'LIMIT', 'OrderType.Limit');
  eq(OrderType.Market, 'MARKET', 'OrderType.Market');
  eq(OrderType.Sl, 'SL', 'OrderType.Sl');
  eq(OrderType.SlM, 'SL_M', 'OrderType.SlM');
  eq(TransactionType.Buy, 'BUY', 'TransactionType.Buy');
  eq(TransactionType.Sell, 'SELL', 'TransactionType.Sell');
  eq(Validity.Day, 'DAY', 'Validity.Day');
});

t('Validity still has exactly one member', () => {
  const n = Object.keys(Validity).length;
  if (n !== 1) throw new Error('expected 1 member, found ' + n + ' - re-read the docs');
});

t('InstrumentType covers EQ/FUT/CE/PE/IDX', () => {
  for (const k of ['EQ', 'FUT', 'CE', 'PE', 'IDX'])
    if (InstrumentType[k] !== k) throw new Error(k);
});

t('LiveFeedSubscriptionType has all six channels', () => {
  for (const k of ['Price', 'Index', 'MarketDepth', 'FnoOrderUpdates',
                   'FnoPositionUpdates', 'EquityOrderUpdates'])
    if (!LiveFeedSubscriptionType[k]) throw new Error(k);
});

// The daily-token mechanism: a TOTP derived from GROWW_API_SECRET.
// otpauth is a transitive dep of growwapi and has an "exports" map, so resolve
// it through the project rather than guessing a path inside it.
const { createRequire } = await import('node:module');
const projectRequire = createRequire(new URL('package.json', base));
let OTPAuth;
try {
  OTPAuth = projectRequire('otpauth');
} catch {
  try { OTPAuth = await import(projectRequire.resolve('otpauth')); }
  catch { OTPAuth = null; }
}
if (!OTPAuth) {
  console.log('  SKIP  TOTP checks (otpauth not resolvable from the project)');
} else {

t('TOTP yields a 6-digit code from the API secret', () => {
  const code = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP'),
    algorithm: 'SHA1', digits: 6, period: 30,
  }).generate();
  if (!/^\d{6}$/.test(code)) throw new Error('got ' + code);
});

t('TOTP rotates across the 30s window', () => {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP'),
    algorithm: 'SHA1', digits: 6, period: 30,
  });
  if (totp.generate({ timestamp: 0 }) === totp.generate({ timestamp: 30000 }))
    throw new Error('code did not change - token refresh would stall');
});
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail === 0) console.log('\nSDK is installed, patched and complete. No live call was made.');
process.exit(fail ? 1 : 0);
