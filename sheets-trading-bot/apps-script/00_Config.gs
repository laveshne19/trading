/**
 * 00_Config.gs — single source of truth for every tunable.
 *
 * Edit numbers HERE, not scattered through the code. Anything a human should
 * be able to change while the market is open lives in the `Config` sheet
 * instead and is read through cfg() below, which overlays sheet values on
 * these defaults.
 */

var CFG_DEFAULTS = {

  // ---------- Capital & risk (rupees unless stated) ----------
  CAPITAL: 100000,
  RISK_PCT_PER_TRADE: 0.02,       // 2% = Rs 2,000 max loss on one trade
  DAILY_LOSS_LIMIT_PCT: 0.04,     // 4% = Rs 4,000 realised -> kill switch
  MAX_DEPLOYED_PCT: 0.30,         // never more than 30% of capital as premium
  MAX_CONCURRENT_POSITIONS: 2,
  MAX_TRADES_PER_DAY: 3,
  MIN_PREMIUM: 4.0,               // below this, spreads eat the edge
  MAX_PREMIUM: 120.0,             // above this, one lot breaks the risk budget

  // ---------- Option-buy exit rules (fraction of premium paid) ----------
  STOP_PCT: 0.35,                 // hard stop at -35% of premium
  TARGET_PCT: 0.60,               // book at +60%
  TRAIL_ARM_PCT: 0.40,            // arm the trail once +40%
  TRAIL_GIVEBACK_PCT: 0.20,       // then exit on a 20pt giveback from peak

  // ---------- Session windows (IST, "HH:MM") ----------
  MARKET_OPEN: '09:15',
  MARKET_CLOSE: '15:30',
  NO_ENTRY_BEFORE: '09:25',       // let the opening auction settle
  NO_ENTRY_AFTER: '14:45',
  EXPIRY_NO_ENTRY_AFTER: '13:00', // expiry day: gamma/theta cliff
  INTRADAY_FLAT_BY: '15:15',      // square off intraday positions by here
  EOD_CARRY_AT: '15:10',          // overnight-carry decision time
  OVERNIGHT_EXIT_BY: '09:45',     // exit carried positions next morning

  // ---------- Instruments ----------
  INDEX_UNDERLYINGS: ['NIFTY', 'BANKNIFTY'],
  OPTION_MONEYNESS: 'ATM',        // ATM | ITM1 | OTM1
  STRIKE_STEP: { NIFTY: 50, BANKNIFTY: 100 },
  // NIFTY 65 read live from Groww's OI endpoint on 2026-10-27.
  // BANKNIFTY is NOT verified — sources disagree (30 vs 35). Confirm against
  // the NSE contract specs before trading it; it changes every size figure.
  LOT_SIZE: { NIFTY: 65, BANKNIFTY: 35 },

  // ---------- Strategy toggles ----------
  ENABLE_ORB: true,               // opening-range breakout -> index option
  ENABLE_EOD_CARRY: false,        // overnight carry (off until you've paper-run)
  ENABLE_AI_SIGNAL: true,         // Claude reviews the snapshot and votes
  REQUIRE_AI_CONFIRMATION: true,  // a rule signal only fires if Claude agrees

  ORB_RANGE_MINUTES: 15,          // opening range = first N minutes
  ORB_MIN_BREAK_PCT: 0.0015,      // break must clear the range by 0.15%

  // ---------- Models ----------
  // Opus for the few high-value decisions, Sonnet for frequent checks.
  MODEL_STRATEGIC: 'claude-opus-5-5',
  MODEL_INTRADAY: 'claude-sonnet-5-5',
  AI_MAX_TOKENS: 2000,

  // ---------- Execution ----------
  DRY_RUN: true,                  // TRUE = log the order, do not send it.
                                  // Leave TRUE until you have watched a full
                                  // session behave correctly.
  PRODUCT: 'MIS',                 // MIS intraday, NRML for carry
  ORDER_TYPE: 'LIMIT',
  LIMIT_SLIPPAGE_PCT: 0.01,       // pay up 1% over LTP to get filled
  PLACE_EXCHANGE_STOP: true,      // ALWAYS true in live mode. See 07_Risk.gs.

  // ---------- Ops ----------
  NOTIFY_EMAIL: '',               // blank = use the sheet owner's address
  LOG_RETENTION_ROWS: 5000,
  API_RETRY: 3,
  API_BACKOFF_MS: 700
};

/** Sheet names — change here if you rename tabs. */
var SH = {
  DASH:      'Dashboard',
  CONFIG:    'Config',
  WATCHLIST: 'Watchlist',
  SIGNALS:   'Signals',
  ORDERS:    'Orders',
  POSITIONS: 'Positions',
  TRADELOG:  'TradeLog',
  MARKET:    'MarketData',
  AUDIT:     'AuditLog'
};

/** Groww API surface. Base + headers are confirmed; see README on the rest. */
var GROWW = {
  BASE: 'https://api.groww.in',
  API_VERSION: '1.0',

  // Confirmed from Groww's public cURL docs:
  TOKEN:          { m: 'post', p: '/v1/token/api/access' },
  ORDER_CREATE:   { m: 'post', p: '/v1/order/create' },
  ORDER_MODIFY:   { m: 'post', p: '/v1/order/modify' },
  ORDER_CANCEL:   { m: 'post', p: '/v1/order/cancel' },
  MARGIN_USER:    { m: 'get',  p: '/v1/margins/detail/user' },
  MARGIN_ORDERS:  { m: 'post', p: '/v1/margins/detail/orders' },

  // Best-known paths — run `Trading Bot > Diagnostics > Verify endpoints`
  // which probes each and tells you exactly which to correct. Fix them here.
  ORDER_STATUS:   { m: 'get',  p: '/v1/order/status' },
  ORDER_LIST:     { m: 'get',  p: '/v1/order/list' },
  ORDER_DETAIL:   { m: 'get',  p: '/v1/order/detail' },
  ORDER_TRADES:   { m: 'get',  p: '/v1/order/trades' },
  POSITIONS_USER: { m: 'get',  p: '/v1/positions/user' },
  POSITION_SYM:   { m: 'get',  p: '/v1/positions/trading-symbol' },
  HOLDINGS:       { m: 'get',  p: '/v1/holdings/user' },
  LTP:            { m: 'get',  p: '/v1/live-data/ltp' },
  OHLC:           { m: 'get',  p: '/v1/live-data/ohlc' },
  QUOTE:          { m: 'get',  p: '/v1/live-data/quote' },
  GREEKS:         { m: 'get',  p: '/v1/live-data/greeks' },
  OPTION_CHAIN:   { m: 'get',  p: '/v1/live-data/option-chain' },
  CANDLES:        { m: 'get',  p: '/v1/historical/candle/range' }
};

/** Groww enums. Passing a string outside these is the top cause of rejects. */
var E = {
  EXCHANGE:    { NSE: 'NSE', BSE: 'BSE' },
  SEGMENT:     { CASH: 'CASH', FNO: 'FNO' },
  PRODUCT:     { CNC: 'CNC', MIS: 'MIS', NRML: 'NRML' },
  ORDER_TYPE:  { MARKET: 'MARKET', LIMIT: 'LIMIT', SL: 'SL', SL_M: 'SL_M' },
  TXN:         { BUY: 'BUY', SELL: 'SELL' },
  VALIDITY:    { DAY: 'DAY', IOC: 'IOC' }
};

var CLAUDE_API = {
  URL: 'https://api.anthropic.com/v1/messages',
  VERSION: '2023-06-01'
};

// ---------------------------------------------------------------------------

var _cfgCache = null;

/**
 * Effective config: CFG_DEFAULTS overlaid with any key/value pairs the user has
 * set in the `Config` sheet (column A = key, column B = value).
 */
function cfg() {
  if (_cfgCache) return _cfgCache;
  var out = {};
  for (var k in CFG_DEFAULTS) out[k] = CFG_DEFAULTS[k];

  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SH.CONFIG);
    if (sh && sh.getLastRow() > 1) {
      var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < rows.length; i++) {
        var key = String(rows[i][0]).trim();
        if (!key || !(key in out)) continue;
        out[key] = coerceLike_(out[key], rows[i][1]);
      }
    }
  } catch (e) {
    // Running headless (e.g. from a trigger with no active spreadsheet) —
    // defaults are correct in that case.
  }
  _cfgCache = out;
  return out;
}

function clearCfgCache() { _cfgCache = null; }

/** Coerce a sheet cell to the same shape as the default it overrides. */
function coerceLike_(proto, v) {
  if (v === '' || v === null || v === undefined) return proto;
  if (typeof proto === 'boolean') {
    if (typeof v === 'boolean') return v;
    return /^(true|yes|y|1|on)$/i.test(String(v).trim());
  }
  if (typeof proto === 'number') {
    var n = Number(v);
    return isNaN(n) ? proto : n;
  }
  if (Array.isArray(proto)) {
    return String(v).split(',').map(function (s) { return s.trim(); })
                    .filter(function (s) { return s; });
  }
  if (proto && typeof proto === 'object') {
    try { return JSON.parse(v); } catch (e) { return proto; }
  }
  return v;
}
