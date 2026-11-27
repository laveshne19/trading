/**
 * 17_Gate.gs — the entry gate. Every rule here was paid for with a real loss,
 * and the loss is named.
 *
 * The gate's job is to say NO. It returns a list of failures, not a score,
 * because a score invites the caller to trade a 68/100 when two mandatory
 * conditions failed. A confidence number is not a probability of making money.
 *
 * Pass/fail only. One failure = no trade.
 */

var GATE_DEFAULTS = {
  MIN_ADX: 40,                 // below this there is no trend to follow
  MIN_DI_RATIO: 2.5,           // +DI/-DI for a long, inverted for a short
  MIN_INTRINSIC_PCT: 0.40,     // CHOLAFIN at 100% time value: -Rs 6,875
  MIN_HEADROOM_RS: 0,          // strike must sit below the supertrend ceiling
  MAX_OPTION_DAY_MOVE: 0.40,   // ICICIBANK bought at +40%: -Rs 15,750
  MAX_SPREAD_PCT: 0.02,
  MIN_DEPTH_LOTS: 1,
  MAX_SDS_TO_BREAKEVEN: 0.6,
  MIN_OI: 100,                 // TMPV dead contracts had OI 0
  MAX_POSITIONS_PER_SECTOR: 2, // 13 Nov: six banks, one rate print
  REQUIRE_OI_PRICE_AGREEMENT: true,
  MIN_LOW_DECLINE_PCT: 0.02,   // ITC's lows fell 1.6% in 3 weeks: a floor
  MIN_HIGH_RISE_PCT: 0.02      // same test, inverted, for longs
};

function gateCfg_(key) {
  // cfg() takes no arguments: it returns the whole resolved config object.
  var all = (typeof cfg === 'function') ? cfg() : null;
  var v = (all && key in all) ? all[key] : undefined;
  if (v === undefined || v === null || v === '') return GATE_DEFAULTS[key];
  if (typeof GATE_DEFAULTS[key] === 'boolean') {
    return (v === true || v === 'TRUE' || v === 'true');
  }
  return isNaN(Number(v)) ? GATE_DEFAULTS[key] : Number(v);
}

/**
 * @typedef {Object} GateCandidate
 * @property {string} symbol          option trading symbol, EXACT, from the
 *                                    live chain — never fuzzy search
 * @property {string} underlying
 * @property {string} right           'CE' | 'PE'
 * @property {number} strike
 * @property {number} spot
 * @property {number} ask
 * @property {number} bid
 * @property {number} lotSize
 * @property {number} optionDayChangePct   e.g. 0.68 for +68%
 * @property {number} oi
 * @property {number} oiDayChangePct
 * @property {number} stUpperBand     supertrend upper band of the underlying
 * @property {number} stDirection     +1 up, -1 down
 * @property {number} adx
 * @property {number} plusDI
 * @property {number} minusDI
 * @property {number} atr             daily ATR of the underlying
 * @property {number} daysToExpiry    trading days
 * @property {number} depthLots       lots available at the touch
 * @property {string} sector
 * @property {number} sectorPositions positions already open in that sector
 * @property {Array<number>} weeklyHighs  oldest -> newest, >= 3
 * @property {Array<number>} weeklyLows   oldest -> newest, >= 3
 * @property {boolean} hasEventBeforeExpiry
 */

/**
 * Run every check. Returns { pass, failures[], checks[] }.
 * `failures` empty means take the trade.
 */
function runGate(c) {
  var checks = [], failures = [];
  var isCall = (c.right || 'CE').toUpperCase() === 'CE';

  function add(name, ok, detail, lesson) {
    checks.push({ name: name, ok: ok, detail: detail, lesson: lesson || '' });
    if (!ok) failures.push(name + ': ' + detail);
  }

  // ---- 1. Contract is real and tradeable -------------------------------
  add('CONTRACT_LIVE',
      c.oi >= gateCfg_('MIN_OI'),
      'OI ' + c.oi + ' vs floor ' + gateCfg_('MIN_OI'),
      'fuzzy search returned TMPV contracts with OI 0 and volume 0');

  // ---- 2. Direction agrees with the supertrend -------------------------
  var dirOk = isCall ? (c.stDirection > 0) : (c.stDirection < 0);
  add('SUPERTREND_DIRECTION', dirOk,
      'supertrend ' + (c.stDirection > 0 ? 'UP' : 'DOWN') + ' vs ' + c.right,
      'VEDL +2.15% with supertrend DOWN and RSI 22 is a bounce, not a trend');

  // ---- 3. Trend strength ------------------------------------------------
  add('ADX', c.adx >= gateCfg_('MIN_ADX'),
      'ADX ' + round2_(c.adx) + ' vs floor ' + gateCfg_('MIN_ADX'),
      'NIFTY IT ADX 13 while INFY was +3.72% — no trend to follow');

  // ---- 4. Directional conviction ---------------------------------------
  var diRatio = isCall
    ? (c.minusDI > 0 ? c.plusDI / c.minusDI : Infinity)
    : (c.plusDI  > 0 ? c.minusDI / c.plusDI : Infinity);
  add('DI_RATIO', diRatio >= gateCfg_('MIN_DI_RATIO'),
      'DI ratio ' + round2_(diRatio) + ' vs floor ' + gateCfg_('MIN_DI_RATIO'),
      'BHARTIARTL DI fell 2.19x -> 1.62x and the position bled');

  // ---- 5. Headroom: strike must sit below the ceiling ------------------
  var headroom = isCall ? (c.stUpperBand - c.strike) : (c.strike - c.stUpperBand);
  add('HEADROOM', headroom > gateCfg_('MIN_HEADROOM_RS'),
      'headroom Rs ' + round2_(headroom),
      'SONACOMS 980 strike vs a 968.25 ceiling; BEL 420 vs 420.66');

  // ---- 6. Intrinsic ratio ----------------------------------------------
  var intrinsic = isCall ? Math.max(0, c.spot - c.strike)
                         : Math.max(0, c.strike - c.spot);
  var intrinsicPct = c.ask > 0 ? intrinsic / c.ask : 0;
  add('INTRINSIC', intrinsicPct >= gateCfg_('MIN_INTRINSIC_PCT'),
      round2_(intrinsicPct * 100) + '% intrinsic vs floor ' +
        round2_(gateCfg_('MIN_INTRINSIC_PCT') * 100) + '%',
      'CHOLAFIN 1880 CE at 100% time value whipsawed +/-Rs 3,000 on a flat stock');

  // ---- 7. IV inflation --------------------------------------------------
  add('IV_INFLATION',
      !(c.optionDayChangePct > gateCfg_('MAX_OPTION_DAY_MOVE')),
      'option ' + round2_((c.optionDayChangePct || 0) * 100) + '% today vs cap ' +
        round2_(gateCfg_('MAX_OPTION_DAY_MOVE') * 100) + '%',
      'ICICIBANK 1700 CE bought at +40%: -Rs 15,750');

  // ---- 8. OI paired with price -----------------------------------------
  if (gateCfg_('REQUIRE_OI_PRICE_AGREEMENT')) {
    var oiUp = c.oiDayChangePct > 0;
    var pxUp = c.optionDayChangePct > 0;
    var longBuildup = oiUp && pxUp;
    var shortCovering = !oiUp && pxUp;
    add('OI_CONFIRMS', longBuildup,
        'OI ' + round2_((c.oiDayChangePct || 0) * 100) + '% with price ' +
          round2_((c.optionDayChangePct || 0) * 100) + '% = ' +
          (longBuildup ? 'long buildup' :
           shortCovering ? 'SHORT COVERING, not fresh buying' : 'writers'),
        'ITC 260 CE read as "call writing" when rising OI + rising price was buying');
  }

  // ---- 9. Liquidity -----------------------------------------------------
  var sp = spreadPct(c.bid, c.ask);
  add('SPREAD', sp !== null && sp <= gateCfg_('MAX_SPREAD_PCT'),
      sp === null ? 'book not two-sided' : round2_(sp * 100) + '% spread',
      'MANKIND showed 11-48% spreads on zero volume');
  add('DEPTH', c.depthLots >= gateCfg_('MIN_DEPTH_LOTS'),
      c.depthLots + ' lots at the touch',
      '');

  // ---- 10. Distance to breakeven, in standard deviations ---------------
  var qty = c.lotSize;
  var be = breakevenMove(c.ask, qty, (c.ask - c.bid));
  var bePrice = isCall ? (c.strike + c.ask + be.absolute)
                       : (c.strike - c.ask - be.absolute);
  var movePct = Math.abs(bePrice - c.spot) / c.spot;
  var atrPct = c.spot > 0 ? c.atr / c.spot : 0;
  var sds = (atrPct > 0 && c.daysToExpiry > 0)
    ? movePct / (atrPct * Math.sqrt(c.daysToExpiry)) : Infinity;
  add('SDS_TO_BREAKEVEN', sds <= gateCfg_('MAX_SDS_TO_BREAKEVEN'),
      round2_(sds) + ' SD needed vs cap ' + gateCfg_('MAX_SDS_TO_BREAKEVEN') +
        ' (breakeven ' + round2_(bePrice) + ' after costs)',
      '');

  // ---- 11. Direction-specific structure --------------------------------
  var struct = isCall ? structureForLong_(c.weeklyHighs, c.weeklyLows)
                      : structureForShort_(c.weeklyHighs, c.weeklyLows);
  add('WEEKLY_STRUCTURE', struct.ok, struct.detail,
      'ITC: falling highs on a FLAT floor is a triangle on support, not a ' +
      'downtrend. Cost Rs 6,054.75.');

  // ---- 12. Sector concentration ----------------------------------------
  add('SECTOR_CAP',
      (c.sectorPositions || 0) < gateCfg_('MAX_POSITIONS_PER_SECTOR'),
      (c.sectorPositions || 0) + ' already open in ' + c.sector +
        ' vs cap ' + gateCfg_('MAX_POSITIONS_PER_SECTOR'),
      '13 Nov: six bank positions, one CPI print, all red together');

  // ---- 13. Event calendar ----------------------------------------------
  add('NO_EVENT', !c.hasEventBeforeExpiry,
      c.hasEventBeforeExpiry ? 'a scheduled event lands before expiry' : 'clear',
      'MAZDOCK fell 12.8% on results I had not looked up');

  return {
    pass: failures.length === 0,
    failures: failures,
    checks: checks,
    metrics: {
      headroom: round2_(headroom),
      intrinsicPct: round4_(intrinsicPct),
      diRatio: round2_(diRatio),
      spreadPct: sp === null ? null : round4_(sp),
      sdsToBreakeven: round2_(sds),
      breakevenPrice: round2_(bePrice),
      costPerRoundTrip: be.costs
    }
  };
}

/**
 * LONGS read the sequence of HIGHS. Rising highs = uptrend.
 */
function structureForLong_(highs, lows) {
  if (!highs || highs.length < 3) {
    return { ok: false, detail: 'need >= 3 weekly highs' };
  }
  var n = highs.length;
  var a = highs[n - 3], c = highs[n - 1];
  var rise = a > 0 ? (c - a) / a : 0;
  var minRise = gateCfg_('MIN_HIGH_RISE_PCT');

  if (c <= a) {
    return { ok: false,
      detail: 'highs ' + highs.slice(-3).join(' -> ') +
              ' not rising — a bounce inside lower highs' };
  }
  if (rise < minRise) {
    return { ok: false,
      detail: 'highs ' + highs.slice(-3).join(' -> ') + ' rise only ' +
              round2_(rise * 100) + '% (need ' + round2_(minRise * 100) +
              '%) — that is a range, not an uptrend' };
  }
  return { ok: true,
    detail: 'highs ' + highs.slice(-3).join(' -> ') + ' rising ' +
            round2_(rise * 100) + '%' };
}

/**
 * SHORTS read the sequence of LOWS. This is the half that flatters a put if
 * you skip it. Flat lows under falling highs is a descending triangle resting
 * on proven support — never buy its puts.
 */
function structureForShort_(highs, lows) {
  if (!lows || lows.length < 3) {
    return { ok: false, detail: 'need >= 3 weekly lows' };
  }
  var n = lows.length;
  var a = lows[n - 3], b = lows[n - 2], c = lows[n - 1];

  // Direction alone is not enough. ITC's lows were 256.95 -> 254.80 -> 252.85:
  // technically falling, but by 1.6% across three weeks. That is a floor being
  // tested, not a downtrend. TATASTEEL's were 184.34 -> 173.88 -> 158.89, a
  // 13.8% decline. The difference is magnitude, and it cost Rs 6,054.75.
  var minDecline = gateCfg_('MIN_LOW_DECLINE_PCT');
  var decline = a > 0 ? (a - c) / a : 0;
  var monotonic = (c < b && b < a);

  if (!monotonic) {
    return { ok: false,
      detail: 'lows ' + lows.slice(-3).join(' -> ') + ' not making lower lows' };
  }
  if (decline < minDecline) {
    return { ok: false,
      detail: 'lows ' + lows.slice(-3).join(' -> ') + ' fall only ' +
              round2_(decline * 100) + '% over three weeks (need ' +
              round2_(minDecline * 100) + '%) — that is compression on ' +
              'proven support, FLAT within noise, not a breakdown' };
  }
  return { ok: true,
    detail: 'lows ' + lows.slice(-3).join(' -> ') + ' falling ' +
            round2_(decline * 100) + '%' };
}

/**
 * Assert the API gave us the instrument we asked for. The Groww MCP silently
 * resolves "Nifty 50" to INFY and "Bank Nifty" to HDFCBANK when the segment
 * is CASH instead of INDEX, and raises no error.
 */
function assertSymbol(requested, returned) {
  if (!returned) throw new Error('symbol check: no symbol returned for ' + requested);
  var r = String(requested).toUpperCase().replace(/[^A-Z0-9]/g, '');
  var g = String(returned).toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (r === g) return true;
  if (r.length >= 4 && g.length >= 4 &&
      (g.indexOf(r) !== -1 || r.indexOf(g) !== -1)) return true;

  // NSE tickers abbreviate: "Aurobindo Pharma" -> AUROPHARMA, "Tata Consumer
  // Products" -> TATACONSUM. The ticker's letters appear in order inside the
  // company name. "Nifty 50" -> INFY does NOT satisfy this, which is the
  // whole point: that resolution is silently wrong and must throw.
  if (g.length >= 4 && isSubsequence_(g, r)) return true;
  if (r.length >= 4 && isSubsequence_(r, g)) return true;

  throw new Error('SYMBOL MISMATCH: asked for "' + requested +
    '", API returned "' + returned + '". Refusing to use this data.');
}

/** Are all of `needle`'s characters present in `hay`, in order? */
function isSubsequence_(needle, hay) {
  var i = 0;
  for (var j = 0; j < hay.length && i < needle.length; j++) {
    if (hay.charAt(j) === needle.charAt(i)) i++;
  }
  return i === needle.length;
}
