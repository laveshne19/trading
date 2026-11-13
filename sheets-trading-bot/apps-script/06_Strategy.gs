/**
 * 06_Strategy.gs — snapshot building, strike selection, and the strategies.
 *
 * A strategy's only job is to produce a candidate: direction, underlying,
 * instrument and a reason. It never sizes and never places. The risk gate
 * decides size; 08_Orders.gs does the placing.
 */

// ---------------------------------------------------------------- snapshot

/**
 * Assemble everything the decision needs into one object. This is what gets
 * handed to Claude and what the rule engine reads, so the two always see
 * exactly the same facts.
 */
function buildMarketSnapshot_() {
  var c = cfg();
  var snap = {
    asOf: fmtIst_(new Date()),
    isExpiry: isExpiryToday_(),
    isTradingDay: isTradingDay_(),
    indices: {},
    watchlist: [],
    account: null,
    openPositions: openPositions_().map(function (p) {
      return { symbol: p.tradingSymbol, lots: p.lots, entry: p.entryPrice,
               stop: p.stopPrice, horizon: p.horizon };
    }),
    dailyRealisedPnl: dailyRealisedPnl_(),
    tradesToday: countTodayEntries_()
  };

  // Indices: daily history for trend, today's 5-minute bars for structure.
  c.INDEX_UNDERLYINGS.forEach(function (u) {
    try {
      snap.indices[u] = indexRead_(u);
    } catch (e) {
      snap.indices[u] = { error: truncate_(e.message, 160) };
    }
  });

  // Watchlist: only rows marked enabled.
  readSheet_(SH.WATCHLIST).forEach(function (w) {
    if (!truthy_(w.enabled)) return;
    try {
      var r = symbolRead_(String(w.symbol).toUpperCase(),
                          w.exchange || E.EXCHANGE.NSE,
                          w.segment || E.SEGMENT.CASH);
      r.theme = w.theme || '';
      snap.watchlist.push(r);
    } catch (e) {
      snap.watchlist.push({ symbol: w.symbol, error: truncate_(e.message, 120) });
    }
  });

  try {
    var m = apiUserMargin();
    snap.account = {
      optionBuyAvailable: m.optionBuyAvailable,
      cashAvailable: m.cashAvailable
    };
  } catch (e) {
    snap.account = { error: truncate_(e.message, 120) };
  }

  return snap;
}

function indexRead_(underlying) {
  var end = new Date();
  var start = new Date(end.getTime() - 120 * 864e5);
  var daily = apiCandles(E.EXCHANGE.NSE, E.SEGMENT.CASH, underlying,
                         fmtApi_(start), fmtApi_(end), 1440);
  var intraday = apiCandles(E.EXCHANGE.NSE, E.SEGMENT.CASH, underlying,
                            fmtApi_(istDateAt_('09:15')), fmtApi_(end), 5);
  var read = technicalRead_(daily, intraday, 5);
  read.symbol = underlying;
  if (daily.length >= 2) {
    read.prevClose = round2_(daily[daily.length - 2].c);
    if (read.ltp && read.prevClose) {
      read.changePct = round2_((read.ltp / read.prevClose - 1) * 100);
    }
  }
  return read;
}

function symbolRead_(symbol, exchange, segment) {
  var end = new Date();
  var start = new Date(end.getTime() - 120 * 864e5);
  var daily = apiCandles(exchange, segment, symbol, fmtApi_(start), fmtApi_(end), 1440);
  var intraday = apiCandles(exchange, segment, symbol,
                            fmtApi_(istDateAt_('09:15')), fmtApi_(end), 5);
  var read = technicalRead_(daily, intraday, 5);
  read.symbol = symbol;
  if (daily.length >= 2) {
    read.prevClose = round2_(daily[daily.length - 2].c);
    if (read.ltp && read.prevClose) {
      read.changePct = round2_((read.ltp / read.prevClose - 1) * 100);
    }
  }
  return read;
}

function truthy_(v) {
  if (typeof v === 'boolean') return v;
  return /^(true|yes|y|1|on)$/i.test(String(v).trim());
}

// ---------------------------------------------------------------- expiry

/**
 * Last Tuesday of the month — NSE's monthly index/stock F&O expiry as of the
 * 2025 revision. Weekly Nifty expiries are also Tuesday.
 *
 * VERIFY this against the NSE circular for your trading year: the exchange has
 * moved expiry day more than once (Thursday -> Wednesday -> Tuesday) and this
 * one function decides whether the bot thinks it is an expiry day.
 */
var EXPIRY_WEEKDAY = 2;   // 1=Mon, 2=Tue, ... 7=Sun

function isExpiryToday_() {
  var dow = Number(Utilities.formatDate(new Date(), cfgTz_(), 'u'));
  if (dow !== EXPIRY_WEEKDAY) return false;
  return !isTradingHoliday_();
}

function isMonthlyExpiryToday_() {
  if (!isExpiryToday_()) return false;
  var now = new Date();
  var d = Number(Utilities.formatDate(now, cfgTz_(), 'd'));
  var m = Number(Utilities.formatDate(now, cfgTz_(), 'M'));
  // If adding 7 days lands in a different month, this is the last one.
  var next = new Date(now.getTime() + 7 * 864e5);
  return Number(Utilities.formatDate(next, cfgTz_(), 'M')) !== m || d > 24;
}

// ---------------------------------------------------------------- strikes

/**
 * Resolve the option to trade by reading the live option chain, so the exact
 * `trading_symbol` comes from Groww rather than being constructed from a
 * guessed naming convention.
 *
 * @param {string} underlying  e.g. 'NIFTY'
 * @param {string} optionType  'CE' | 'PE'
 * @param {number} spot
 * @param {string} expiryDate  'yyyy-MM-dd'
 * @param {string} moneyness   'ATM' | 'ITM1' | 'OTM1'
 */
function resolveOption_(underlying, optionType, spot, expiryDate, moneyness) {
  var c = cfg();
  var step = (c.STRIKE_STEP && c.STRIKE_STEP[underlying]) || 50;
  var atm = roundToStep_(spot, step);

  var shift = 0;
  if (moneyness === 'ITM1') shift = (optionType === 'CE' ? -1 : +1);
  if (moneyness === 'OTM1') shift = (optionType === 'CE' ? +1 : -1);
  var want = atm + shift * step;

  var chain = null;
  try {
    chain = apiOptionChain(E.EXCHANGE.NSE, underlying, expiryDate);
  } catch (e) {
    throw new Error('Option chain unavailable for ' + underlying + ' ' +
      expiryDate + ' — cannot resolve a strike without it. ' +
      'Groww Live Data is a paid add-on; if this is a 401/403 that is why. (' +
      truncate_(e.message, 120) + ')');
  }

  var strikes = (chain && (chain.strikes || chain.option_chain)) || [];
  var best = null, bestDist = Infinity;
  strikes.forEach(function (s) {
    var sp = Number(s.strike_price !== undefined ? s.strike_price : s.strike);
    var leg = optionType === 'CE' ? (s.ce || s.CE) : (s.pe || s.PE);
    if (!leg || !sp) return;
    var d = Math.abs(sp - want);
    if (d < bestDist) { bestDist = d; best = { strike: sp, leg: leg }; }
  });

  if (!best) {
    throw new Error('No ' + optionType + ' leg found near strike ' + want +
      ' in the ' + underlying + ' ' + expiryDate + ' chain.');
  }

  var ltp = Number(best.leg.ltp);
  if (!(ltp > 0)) {
    throw new Error('Resolved ' + best.leg.trading_symbol + ' but its LTP is ' +
      best.leg.ltp + ' — refusing to trade an instrument with no price.');
  }

  return {
    underlying: underlying,
    tradingSymbol: best.leg.trading_symbol,
    exchangeSymbol: 'NSE_' + best.leg.trading_symbol,
    optionType: optionType,
    strike: best.strike,
    expiry: expiryDate,
    premium: round2_(ltp),
    openInterest: best.leg.open_interest || null,
    volume: best.leg.volume || null,
    greeks: best.leg.greeks || null,
    lotSize: (cfg().LOT_SIZE && cfg().LOT_SIZE[underlying]) || null,
    underlyingLtp: chain.underlying_ltp || spot
  };
}

// ---------------------------------------------------------------- strategies

/**
 * Opening-range breakout on an index, expressed as an option buy.
 *
 * Rule: build the first ORB_RANGE_MINUTES of the session. Take the first
 * completed 5-minute bar that closes beyond the range by ORB_MIN_BREAK_PCT,
 * in the direction of the daily trend. Counter-trend breaks are skipped —
 * that filter is the whole edge.
 */
function strategyORB_(snap) {
  var c = cfg();
  var candidates = [];

  c.INDEX_UNDERLYINGS.forEach(function (u) {
    var r = snap.indices[u];
    if (!r || r.error || !r.openingRange || !r.ltp) return;

    var or = r.openingRange;
    var upTrig   = or.high * (1 + c.ORB_MIN_BREAK_PCT);
    var downTrig = or.low  * (1 - c.ORB_MIN_BREAK_PCT);

    var dir = null;
    if (r.ltp > upTrig)        dir = 'LONG_CALL';
    else if (r.ltp < downTrig) dir = 'LONG_PUT';
    if (!dir) return;

    // Trend filter: do not buy calls under a falling 20/50, or puts above a
    // rising one. This is what stops the bot buying every false break.
    if (dir === 'LONG_CALL' && r.trend === 'DOWN') return;
    if (dir === 'LONG_PUT'  && r.trend === 'UP')   return;

    // VWAP must agree with the direction.
    if (r.vwap) {
      if (dir === 'LONG_CALL' && r.ltp < r.vwap) return;
      if (dir === 'LONG_PUT'  && r.ltp > r.vwap) return;
    }

    candidates.push({
      source: 'ORB',
      decision: dir,
      underlying: u,
      conviction: (r.trend === 'MIXED') ? 3 : 4,
      horizon: 'INTRADAY',
      thesis: u + ' broke the ' + c.ORB_RANGE_MINUTES + '-minute range (' +
              or.low + '-' + or.high + ') at ' + r.ltp +
              ', with the daily trend ' + r.trend + ' and price ' +
              (dir === 'LONG_CALL' ? 'above' : 'below') + ' VWAP ' + r.vwap + '.',
      invalidation: 'A close back inside the opening range.',
      levels: or
    });
  });

  return candidates;
}

/**
 * Overnight carry: at EOD_CARRY_AT, if the index closed in the top or bottom
 * quarter of its day range AND the daily trend agrees, buy the next series
 * slightly in the money and hold.
 *
 * Off by default. Overnight option risk is gap risk, and a gap through your
 * stop ignores the stop — the exchange stop does not protect you across a
 * close. Paper-run this for a month before enabling.
 */
function strategyEodCarry_(snap) {
  var c = cfg();
  var out = [];
  c.INDEX_UNDERLYINGS.forEach(function (u) {
    var r = snap.indices[u];
    if (!r || r.error || r.closeLocation === null || r.closeLocation === undefined) return;

    var dir = null;
    if (r.closeLocation >= 0.75 && r.trend === 'UP')   dir = 'LONG_CALL';
    if (r.closeLocation <= 0.25 && r.trend === 'DOWN') dir = 'LONG_PUT';
    if (!dir) return;

    out.push({
      source: 'EOD_CARRY',
      decision: dir,
      underlying: u,
      conviction: 3,
      horizon: 'OVERNIGHT',
      thesis: u + ' closing at ' + Math.round(r.closeLocation * 100) +
              '% of the day range with the daily trend ' + r.trend + '.',
      invalidation: 'A gap open against the position, or a loss of VWAP in ' +
                    'the first 30 minutes.',
      moneyness: 'ITM1'
    });
  });
  return out;
}

/**
 * Combine the rule engines with Claude's view.
 *
 * REQUIRE_AI_CONFIRMATION on (the default) means a rule candidate only
 * survives if Claude independently reaches the same direction. Two
 * uncorrelated reasons to be long beat one.
 */
function generateSignals_() {
  var c = cfg();
  var snap = buildMarketSnapshot_();
  var candidates = [];

  if (c.ENABLE_ORB && isMarketOpen_()) {
    candidates = candidates.concat(strategyORB_(snap));
  }
  if (c.ENABLE_EOD_CARRY && nowIstMinutes_() >= hhmmToMinutes_(c.EOD_CARRY_AT)) {
    candidates = candidates.concat(strategyEodCarry_(snap));
  }

  var ai = null;
  if (c.ENABLE_AI_SIGNAL) {
    try {
      ai = claudeSignal_(snap, candidates.length ? c.MODEL_INTRADAY : c.MODEL_STRATEGIC);
      logSignal_('CLAUDE', ai, '');
    } catch (e) {
      audit_('AI_ERROR', e.message);
      // A model outage must not silently become "trade on rules alone" when
      // the operator asked for confirmation.
      if (c.REQUIRE_AI_CONFIRMATION) {
        audit_('AI_ERROR', 'Confirmation required but unavailable — standing down.');
        return [];
      }
    }
  }

  // Claude alone can originate a trade when the rules are quiet.
  if (!candidates.length && ai && ai.decision !== 'NO_TRADE' && ai.conviction >= 4) {
    candidates.push({
      source: 'CLAUDE',
      decision: ai.decision,
      underlying: ai.underlying,
      conviction: ai.conviction,
      horizon: ai.horizon,
      thesis: ai.thesis,
      invalidation: ai.invalidation
    });
  }

  var kept = candidates.filter(function (cand) {
    if (!c.REQUIRE_AI_CONFIRMATION || cand.source === 'CLAUDE') return true;
    if (!ai) return false;
    if (ai.decision !== cand.decision) {
      logSignal_(cand.source, cand, 'AI disagreed (' + ai.decision + ')');
      return false;
    }
    cand.conviction = Math.max(cand.conviction, ai.conviction);
    cand.thesis += ' [AI concurs: ' + truncate_(ai.thesis, 120) + ']';
    return true;
  });

  // Highest conviction first; we only ever act on the best one.
  kept.sort(function (a, b) { return b.conviction - a.conviction; });
  kept.forEach(function (k) { logSignal_(k.source, k, ''); });
  return kept;
}

function logSignal_(source, sig, blockReason) {
  appendObj_(SH.SIGNALS, {
    ts: new Date(),
    source: source,
    model: sig._model || '',
    underlying: sig.underlying || '',
    decision: sig.decision,
    conviction: sig.conviction,
    horizon: sig.horizon || '',
    thesis: truncate_(sig.thesis || '', 500),
    invalidation: truncate_(sig.invalidation || '', 300),
    riskFlags: (sig.risk_flags || []).join('; '),
    acted: '',
    blockReason: blockReason || ''
  });
}
