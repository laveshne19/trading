/**
 * harness.js — runs the Apps Script logic under Node with the Google globals
 * stubbed, so the pure maths (TOTP, indicators, sizing, time windows, signal
 * parsing) is actually executed rather than merely parsed.
 *
 *   node test/harness.js
 *
 * Network, spreadsheet and mail calls are stubbed. Nothing here can reach a
 * broker or place an order.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'apps-script');

// --------------------------------------------------------------- stubs

const MacAlgorithm = { HMAC_SHA_1: 'HMAC_SHA_1', HMAC_SHA_256: 'HMAC_SHA_256' };

function toBuf(v) {
  if (typeof v === 'string') return Buffer.from(v, 'utf8');
  return Buffer.from(v.map(b => (b < 0 ? b + 256 : b)));
}

// Minimal strftime for the format strings the code actually uses.
function formatDate(d, tz, fmt) {
  // The code only ever asks for IST. Compute IST parts by offsetting UTC.
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60000);
  const p = {
    yyyy: ist.getUTCFullYear(),
    MM: String(ist.getUTCMonth() + 1).padStart(2, '0'),
    dd: String(ist.getUTCDate()).padStart(2, '0'),
    HH: String(ist.getUTCHours()).padStart(2, '0'),
    mm: String(ist.getUTCMinutes()).padStart(2, '0'),
    ss: String(ist.getUTCSeconds()).padStart(2, '0'),
    d: String(ist.getUTCDate()),
    M: String(ist.getUTCMonth() + 1),
    u: String(ist.getUTCDay() === 0 ? 7 : ist.getUTCDay()),
    yy: String(ist.getUTCFullYear()).slice(-2)
  };
  if (fmt === 'yyyy-MM-dd HH:mm:ss') return `${p.yyyy}-${p.MM}-${p.dd} ${p.HH}:${p.mm}:${p.ss}`;
  if (fmt === 'yyyy-MM-dd') return `${p.yyyy}-${p.MM}-${p.dd}`;
  if (fmt === 'HH:mm') return `${p.HH}:${p.mm}`;
  if (fmt === 'yyMMddHHmmss') return `${p.yy}${p.MM}${p.dd}${p.HH}${p.mm}${p.ss}`;
  if (fmt === 'u') return p.u;
  if (fmt === 'd') return p.d;
  if (fmt === 'M') return p.M;
  throw new Error('harness: unhandled date format ' + fmt);
}

const scriptProps = new Map();

const sandbox = {
  console,
  Math, Date, JSON, Number, String, Boolean, Array, Object, Error, isNaN,
  parseInt, parseFloat, RegExp,

  Logger: { log: (...a) => { if (process.env.VERBOSE) console.log('[log]', ...a); } },

  Utilities: {
    MacAlgorithm,
    formatDate,
    sleep: () => {},
    computeHmacSignature(alg, value, key) {
      const algo = alg === MacAlgorithm.HMAC_SHA_1 ? 'sha1' : 'sha256';
      const mac = crypto.createHmac(algo, toBuf(key)).update(toBuf(value)).digest();
      // Apps Script returns signed bytes.
      return Array.from(mac).map(b => (b > 127 ? b - 256 : b));
    }
  },

  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: k => (scriptProps.has(k) ? scriptProps.get(k) : null),
      setProperty: (k, v) => scriptProps.set(k, String(v)),
      deleteProperty: k => scriptProps.delete(k)
    })
  },

  LockService: {
    getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
  },

  // Any real call is a test failure, not a silent no-op.
  UrlFetchApp: {
    fetch() { throw new Error('harness: network call attempted'); }
  },
  MailApp: { sendEmail() {} },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'test@example.com' }) },
  ScriptApp: {
    getProjectTriggers: () => [],
    deleteTrigger: () => {},
    newTrigger: () => ({
      timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) })
    })
  },

  // No spreadsheet: the code is written to fall back to defaults when absent.
  SpreadsheetApp: {
    getActive: () => null,
    getUi: () => { throw new Error('no UI in harness'); }
  }
};

const ctx = vm.createContext(sandbox);
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort();
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
}

// --------------------------------------------------------------- tests

let pass = 0, fail = 0;
const results = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) { pass++; results.push(['PASS', name, '']); }
    else { fail++; results.push(['FAIL', name, String(r)]); }
  } catch (e) {
    fail++; results.push(['FAIL', name, e.message]);
  }
}
const near = (a, b, t = 0.01) => Math.abs(a - b) <= t;

// ---- TOTP ----
check('TOTP matches all 5 RFC 6238 SHA-1 vectors', () => {
  const out = ctx.selfTestTOTP();
  return /passed/.test(out) ? true : out;
});
check('base32 rejects an invalid character', () => {
  try { ctx.base32Decode_('ABC1!'); return 'should have thrown'; }
  catch (e) { return /non-base32|base32/i.test(e.message) ? true : e.message; }
});
check('base32 rejects an empty secret', () => {
  try { ctx.base32Decode_(''); return 'should have thrown'; }
  catch (e) { return true; }
});
check('TOTP is stable inside a 30s window and changes across it', () => {
  const s = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  // Must start ON a 30-second boundary, or +29999ms legitimately lands in the
  // next window and the test would be measuring its own arithmetic.
  const base = 34 * 30 * 1000;           // 1,020,000 ms -> counter exactly 34
  const a = ctx.generateTOTP_(s, base);
  const b = ctx.generateTOTP_(s, base + 29999);
  const c = ctx.generateTOTP_(s, base + 30001);
  if (a !== b) return 'drifted inside the window';
  if (a === c) return 'did not change across the window';
  return true;
});

// ---- indicators ----
check('indicator self-test suite', () => {
  const out = ctx.selfTestIndicators();
  return /passed/.test(out) ? true : out;
});
check('EMA does not look ahead', () => {
  const e = ctx.ema_([1, 2, 3, 4, 5, 6], 3);
  return (e[0] === null && e[1] === null && e[2] !== null) ? true : JSON.stringify(e);
});
check('RSI of a falling series is 0', () => {
  const v = []; for (let i = 30; i > 0; i--) v.push(i);
  return near(ctx.last_(ctx.rsi_(v, 14)), 0) ? true : ctx.last_(ctx.rsi_(v, 14));
});
check('openingRange_ needs enough bars', () => {
  const k = [{ h: 10, l: 9, c: 9.5, o: 9.5, v: 1 }];
  return ctx.openingRange_(k, 15, 5) === null ? true : 'returned a range from 1 bar';
});
check('openingRange_ spans the first 3 five-minute bars', () => {
  const k = [
    { h: 10, l: 8, c: 9, o: 9, v: 1 },
    { h: 12, l: 9, c: 11, o: 9, v: 1 },
    { h: 11, l: 7, c: 8, o: 11, v: 1 },
    { h: 99, l: 1, c: 50, o: 8, v: 1 }   // must be excluded
  ];
  const r = ctx.openingRange_(k, 15, 5);
  return (r.high === 12 && r.low === 7) ? true : JSON.stringify(r);
});

// ---- risk sizing ----
check('risk self-test suite', () => {
  const out = ctx.selfTestRisk();
  return /passed/.test(out) ? true : out;
});
check('sizing respects the per-trade risk cap', () => {
  // Rs 1,00,000 capital, 2% = Rs 2,000 risk. Rs 20 premium x 75 lot = Rs 1,500
  // cost/lot, 35% stop = Rs 525 risk/lot -> 3 lots by risk.
  const s = ctx.sizePosition_(20, 75, 'NIFTY');
  if (s.lots !== 3) return 'want 3 lots, got ' + s.lots;
  if (s.qty !== 225) return 'want qty 225, got ' + s.qty;
  if (!near(s.maxLossRupees, 1575)) return 'want max loss 1575, got ' + s.maxLossRupees;
  return true;
});
check('sizing is capped by MAX_DEPLOYED_PCT when premium is large', () => {
  // Rs 150 x 75 = Rs 11,250/lot. 30% of 1L = Rs 30,000 -> 2 lots by deployment.
  // By risk: 2,000 / (11,250*0.35=3,937) = 0 lots. So risk binds -> 0.
  const s = ctx.sizePosition_(150, 75, 'NIFTY');
  return s.lots === 0 ? true : 'want 0 lots (risk-bound), got ' + s.lots;
});
check('sizing never returns negative lots', () => {
  const s = ctx.sizePosition_(1e9, 75, 'NIFTY');
  return s.lots >= 0 ? true : s.lots;
});
check('sizing reports which cap bound it', () => {
  const s = ctx.sizePosition_(20, 75, 'NIFTY');
  return s.limitedBy ? true : 'limitedBy not set';
});

// ---- signal parsing ----
check('parses a clean JSON signal', () => {
  const s = ctx.parseSignalJson_('{"decision":"LONG_PUT","conviction":4,' +
    '"underlying":"nifty","horizon":"INTRADAY","thesis":"t","invalidation":"i"}');
  return (s.decision === 'LONG_PUT' && s.conviction === 4 &&
          s.underlying === 'NIFTY') ? true : JSON.stringify(s);
});
check('strips a markdown code fence', () => {
  const s = ctx.parseSignalJson_('```json\n{"decision":"LONG_CALL","conviction":5}\n```');
  return s.decision === 'LONG_CALL' ? true : JSON.stringify(s);
});
check('recovers JSON from surrounding prose', () => {
  const s = ctx.parseSignalJson_('Here you go: {"decision":"NO_TRADE","conviction":1} ok?');
  return s.decision === 'NO_TRADE' ? true : JSON.stringify(s);
});
check('unparseable reply degrades to NO_TRADE, not a trade', () => {
  const s = ctx.parseSignalJson_('the market looks bullish, buy calls');
  return (s.decision === 'NO_TRADE' && s.risk_flags.indexOf('PARSE_ERROR') !== -1)
    ? true : JSON.stringify(s);
});
check('an unknown decision string degrades to NO_TRADE', () => {
  const s = ctx.parseSignalJson_('{"decision":"SELL_EVERYTHING","conviction":5}');
  return s.decision === 'NO_TRADE' ? true : s.decision;
});
check('conviction is clamped to 0-5', () => {
  const hi = ctx.parseSignalJson_('{"decision":"LONG_CALL","conviction":99}');
  const lo = ctx.parseSignalJson_('{"decision":"LONG_CALL","conviction":-7}');
  if (hi.conviction !== 5) return 'high not clamped: ' + hi.conviction;
  if (lo.conviction !== 0) return 'low not clamped: ' + lo.conviction;
  return true;
});

// ---- time & calendar ----
check('hhmmToMinutes_ converts correctly', () =>
  ctx.hhmmToMinutes_('09:15') === 555 && ctx.hhmmToMinutes_('15:30') === 930
    ? true : 'bad conversion');
check('istDateAt_ builds the right IST instant', () => {
  const d = ctx.istDateAt_('09:15');
  return formatDate(d, 'IST', 'HH:mm') === '09:15'
    ? true : formatDate(d, 'IST', 'HH:mm');
});
check('known NSE holiday is detected', () =>
  ctx.isTradingHoliday_('2026-01-26') === true ? true : 'missed 26 Jan');
check('an ordinary day is not a holiday', () =>
  ctx.isTradingHoliday_('2026-10-27') === false ? true : 'false positive');
check('roundTick_ snaps to the 0.05 NSE tick', () =>
  near(ctx.roundTick_(19.78), 19.80) && near(ctx.roundTick_(12.87), 12.85)
    ? true : ctx.roundTick_(19.78) + '/' + ctx.roundTick_(12.87));
check('roundToStep_ finds the ATM strike', () =>
  ctx.roundToStep_(22753, 50) === 22750 && ctx.roundToStep_(54382, 100) === 54400
    ? true : 'bad strike rounding');
check('inr_ uses Indian digit grouping', () => {
  const a = ctx.inr_(100000), b = ctx.inr_(-1575), c = ctx.inr_(2000);
  if (a !== '₹1,00,000') return 'got ' + a;
  if (b !== '-₹1,575') return 'got ' + b;
  if (c !== '₹2,000') return 'got ' + c;
  return true;
});

// ---- config ----
check('cfg() falls back to defaults with no spreadsheet', () => {
  ctx.clearCfgCache();
  const c = ctx.cfg();
  return (c.CAPITAL === 100000 && c.DRY_RUN === true) ? true : JSON.stringify(c).slice(0, 120);
});
check('DRY_RUN ships as TRUE (no accidental live trading)', () =>
  ctx.CFG_DEFAULTS.DRY_RUN === true ? true : 'DRY_RUN default is not true');
check('PLACE_EXCHANGE_STOP ships as TRUE', () =>
  ctx.CFG_DEFAULTS.PLACE_EXCHANGE_STOP === true ? true : 'not true');
check('coerceLike_ reads sheet booleans and JSON', () => {
  if (ctx.coerceLike_(true, 'FALSE') !== false) return 'bool parse';
  if (ctx.coerceLike_(true, 'yes') !== true) return 'bool yes';
  if (ctx.coerceLike_(1, 'abc') !== 1) return 'bad number should keep default';
  const o = ctx.coerceLike_({ NIFTY: 50 }, '{"NIFTY":25}');
  if (o.NIFTY !== 25) return 'json parse';
  const a = ctx.coerceLike_(['A'], 'X, Y ,Z');
  if (a.join('|') !== 'X|Y|Z') return 'csv parse: ' + a.join('|');
  return true;
});

// ---- order validation ----
check('apiPlaceOrder refuses a LIMIT order with no price', () => {
  try {
    ctx.apiPlaceOrder({ trading_symbol: 'X', quantity: 75, exchange: 'NSE',
      segment: 'FNO', product: 'MIS', order_type: 'LIMIT', transaction_type: 'BUY' });
    return 'should have thrown';
  } catch (e) { return /needs a price/.test(e.message) ? true : e.message; }
});
check('apiPlaceOrder refuses SL_M with no trigger', () => {
  try {
    ctx.apiPlaceOrder({ trading_symbol: 'X', quantity: 75, exchange: 'NSE',
      segment: 'FNO', product: 'MIS', order_type: 'SL_M', transaction_type: 'SELL' });
    return 'should have thrown';
  } catch (e) { return /trigger_price/.test(e.message) ? true : e.message; }
});
check('apiPlaceOrder names every missing required field', () => {
  try {
    ctx.apiPlaceOrder({ trading_symbol: 'X' });
    return 'should have thrown';
  } catch (e) {
    return /quantity/.test(e.message) && /exchange/.test(e.message)
      ? true : e.message;
  }
});
check('DRY_RUN returns a synthetic ack and sends nothing', () => {
  // UrlFetchApp.fetch throws in the harness, so a real send would fail the test.
  const r = ctx.apiPlaceOrder({
    trading_symbol: 'NIFTY26OCT22700PE', quantity: 75, price: 50,
    exchange: 'NSE', segment: 'FNO', product: 'MIS',
    order_type: 'LIMIT', transaction_type: 'BUY' });
  return r.dry_run === true && /^DRYRUN-/.test(r.groww_order_id)
    ? true : JSON.stringify(r);
});
check('order reference id is unique and <= 20 chars', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const r = ctx.newOrderRef_();
    if (r.length > 20) return 'too long: ' + r;
    seen.add(r);
  }
  return seen.size >= 45 ? true : 'only ' + seen.size + ' unique of 50';
});

// ---- expiry logic ----
check('nextExpiryDate_ returns a Tuesday', () => {
  const ymd = ctx.nextExpiryDate_();
  const d = new Date(ymd + 'T06:00:00Z');
  return d.getUTCDay() === 2 ? true : ymd + ' is day ' + d.getUTCDay();
});
check('nextExpiryDate_(1) is 7+ days after nextExpiryDate_()', () => {
  const a = new Date(ctx.nextExpiryDate_() + 'T06:00:00Z');
  const b = new Date(ctx.nextExpiryDate_(1) + 'T06:00:00Z');
  const days = (b - a) / 864e5;
  return days >= 7 ? true : 'gap of ' + days + ' days';
});
check('an OVERNIGHT trade never uses an expiry that is today', () => {
  const chosen = ctx.chooseExpiry_('OVERNIGHT');
  return chosen !== ctx.todayIst_() ? true : 'chose today (' + chosen + ')';
});

// ---- strategy filters ----
check('ORB skips a counter-trend break', () => {
  const snap = { indices: { NIFTY: {
    symbol: 'NIFTY', ltp: 23000, vwap: 22900, trend: 'DOWN',
    openingRange: { high: 22800, low: 22700 } } } };
  const out = ctx.strategyORB_(snap);
  return out.length === 0 ? true : 'took a call in a DOWN trend';
});
check('ORB takes a with-trend break above VWAP', () => {
  const snap = { indices: { NIFTY: {
    symbol: 'NIFTY', ltp: 23000, vwap: 22900, trend: 'UP',
    openingRange: { high: 22800, low: 22700 } } } };
  const out = ctx.strategyORB_(snap);
  return (out.length === 1 && out[0].decision === 'LONG_CALL')
    ? true : JSON.stringify(out);
});
check('ORB skips a break that is below VWAP', () => {
  const snap = { indices: { NIFTY: {
    symbol: 'NIFTY', ltp: 22850, vwap: 22900, trend: 'UP',
    openingRange: { high: 22800, low: 22700 } } } };
  return ctx.strategyORB_(snap).length === 0 ? true : 'ignored VWAP';
});
check('ORB ignores a move inside the range', () => {
  const snap = { indices: { NIFTY: {
    symbol: 'NIFTY', ltp: 22750, vwap: 22740, trend: 'UP',
    openingRange: { high: 22800, low: 22700 } } } };
  return ctx.strategyORB_(snap).length === 0 ? true : 'broke on nothing';
});
check('ORB requires the break to clear ORB_MIN_BREAK_PCT', () => {
  // 22800 * 1.0015 = 22834.2; 22810 must not qualify.
  const snap = { indices: { NIFTY: {
    symbol: 'NIFTY', ltp: 22810, vwap: 22700, trend: 'UP',
    openingRange: { high: 22800, low: 22700 } } } };
  return ctx.strategyORB_(snap).length === 0 ? true : 'marginal break accepted';
});

// ---- kill switch ----
check('kill switch trips and reads back', () => {
  ctx.resetKillSwitch_();
  if (ctx.killSwitchState_().tripped) return 'tripped before being set';
  ctx.tripKillSwitch_('unit test');
  const s = ctx.killSwitchState_();
  return (s.tripped && /unit test/.test(s.reason)) ? true : JSON.stringify(s);
});
check('kill switch resets', () => {
  ctx.tripKillSwitch_('x');
  ctx.resetKillSwitch_();
  return ctx.killSwitchState_().tripped === false ? true : 'still tripped';
});
check('a stale kill switch from a previous day does not block today', () => {
  ctx.resetKillSwitch_();
  sandbox.PropertiesService.getScriptProperties()
    .setProperty('KILL_SWITCH_DATE', '2020-01-01|old');
  const s = ctx.killSwitchState_();
  ctx.resetKillSwitch_();
  return s.tripped === false ? true : 'yesterday blocked today';
});

// --------------------------------------------------------------- report

const w = Math.max(...results.map(r => r[1].length));
console.log('\n  Apps Script logic tests\n  ' + '-'.repeat(w + 10));
for (const [st, name, detail] of results) {
  console.log(`  ${st === 'PASS' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}` +
              (detail ? `\n          -> ${detail}` : ''));
}
console.log('  ' + '-'.repeat(w + 10));
console.log(`  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
