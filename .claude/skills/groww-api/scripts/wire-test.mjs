// Prove the SDK forms a correct Groww auth + order request, with fetch stubbed.
// No real network call, no real credentials, no real order.
const proj = process.argv[2];
const base = new URL('file://' + proj.replace(/\/?$/, '/'));

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method, headers: opts.headers,
               body: opts.body ? JSON.parse(opts.body) : null });
  if (String(url).includes('/token/api/access')) {
    return { ok: true, status: 200, statusText: 'OK',
      json: async () => ({ token: 'STUB-ACCESS-TOKEN',
        expiry: new Date(Date.now() + 3600e3).toISOString() }),
      text: async () => '' };
  }
  return { ok: true, status: 200, statusText: 'OK',
    json: async () => ({ status: 'SUCCESS', payload: {
      groww_order_id: 'GMK123', order_status: 'ACKED', order_reference_id: 'bot-0001' } }),
    text: async () => '' };
};

process.env.GROWW_API_KEY = 'stub-api-key';
process.env.GROWW_API_SECRET = 'JBSWY3DPEHPK3PXP';

const { GrowwAPI, Exchange, Segment, Product, OrderType, TransactionType, Validity } =
  await import(new URL('node_modules/growwapi/dist/index.js', base).href);

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  PASS  ' + n); pass++; }
  catch (e) { console.log('  FAIL  ' + n + ' :: ' + e.message); fail++; } };

const groww = new GrowwAPI();
const res = await groww.orders.create({
  tradingSymbol: 'RELIANCE', quantity: 1, price: 2800, triggerPrice: 0,
  validity: Validity.Day, exchange: Exchange.NSE, segment: Segment.CASH,
  product: Product.CNC, orderType: OrderType.Limit,
  transactionType: TransactionType.Buy, orderReferenceId: 'bot-0001',
});

const auth = calls.find(c => c.url.includes('/token/api/access'));
const order = calls.find(c => !c.url.includes('/token/api/access'));

t('mints an access token before ordering', () => { if (!auth) throw new Error('no auth call'); });
t('auth hits the documented endpoint', () => {
  if (auth.url !== 'https://api.groww.in/v1/token/api/access') throw new Error(auth.url);
});
t('auth sends the API key as Bearer', () => {
  if (auth.headers.Authorization !== 'Bearer stub-api-key') throw new Error(auth.headers.Authorization);
});
t('auth body carries a 6-digit TOTP', () => {
  if (!/^\d{6}$/.test(String(auth.body.totp))) throw new Error(JSON.stringify(auth.body));
});
t('auth body carries no secret', () => {
  if (JSON.stringify(auth.body).includes('JBSWY3DPEHPK3PXP'))
    throw new Error('the TOTP seed leaked into the request body');
});

t('order request was made', () => { if (!order) throw new Error('no order call'); });
t('order uses the minted token, not the API key', () => {
  const a = order.headers?.Authorization || order.headers?.authorization || '';
  if (!a.includes('STUB-ACCESS-TOKEN')) throw new Error(a);
});
t('order params are snake_cased on the wire', () => {
  const b = order.body || {};
  for (const k of ['trading_symbol', 'transaction_type', 'order_type', 'order_reference_id'])
    if (!(k in b)) throw new Error('missing ' + k + ' -> ' + Object.keys(b).join(','));
  if ('tradingSymbol' in b) throw new Error('camelCase leaked through');
});
t('order carries the right values', () => {
  const b = order.body;
  const eq = (g, w, n) => { if (g !== w) throw new Error(n + '=' + JSON.stringify(g)); };
  eq(b.trading_symbol, 'RELIANCE', 'trading_symbol'); eq(b.quantity, 1, 'quantity');
  eq(b.price, 2800, 'price'); eq(b.exchange, 'NSE', 'exchange');
  eq(b.segment, 'CASH', 'segment'); eq(b.product, 'CNC', 'product');
  eq(b.order_type, 'LIMIT', 'order_type'); eq(b.transaction_type, 'BUY', 'transaction_type');
  eq(b.validity, 'DAY', 'validity'); eq(b.order_reference_id, 'bot-0001', 'order_reference_id');
});
t('response is camelCased back', () => {
  const s = JSON.stringify(res);
  if (!/growwOrderId|orderStatus|orderReferenceId/.test(s)) throw new Error(s.slice(0, 200));
});

// second call must reuse the cached token
const before = calls.filter(c => c.url.includes('/token/api/access')).length;
await groww.orders.create({
  tradingSymbol: 'TCS', quantity: 1, price: 3000, triggerPrice: 0,
  validity: Validity.Day, exchange: Exchange.NSE, segment: Segment.CASH,
  product: Product.CNC, orderType: OrderType.Limit,
  transactionType: TransactionType.Buy,
});
t('caches the token across calls (no re-mint)', () => {
  const after = calls.filter(c => c.url.includes('/token/api/access')).length;
  if (after !== before) throw new Error('re-minted: ' + before + ' -> ' + after);
});

globalThis.fetch = realFetch;
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
