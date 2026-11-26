/**
 * 22_Strategies.gs — strategies A to G as pure functions.
 *
 * Every one takes a snapshot and returns the same shape:
 *
 *   { fired:boolean, side:'CE'|'PE'|null, reason:string,
 *     stopLevel:number|null, targetLevel:number|null, quality:number }
 *
 * Pure means: no I/O, no clock, no config reads beyond the passed snapshot.
 * That makes them testable with no mocking, and it makes the backtester and
 * the live scanner share one code path instead of two that drift apart.
 *
 * `quality` is 0..1 and describes how cleanly the setup matched, NOT the
 * probability of making money. 23_Score combines it with everything else.
 *
 * A snapshot:
 *   {
 *     symbol, spot, prevClose, dayHigh, dayLow, open,
 *     ema9, ema20, ema50, vwap, atr, adx, plusDI, minusDI, rsi,
 *     stDirection, stUpperBand, stLowerBand,
 *     volume, avgVolume,
 *     orHigh, orLow,              opening range
 *     prevDayHigh, prevDayLow,
 *     weeklyHighs:[], weeklyLows:[],
 *     marketTrend: +1|0|-1        index regime
 *   }
 */

/** Shared empty answer. */
function stratNo_(reason) {
  return { fired: false, side: null, reason: reason,
           stopLevel: null, targetLevel: null, quality: 0 };
}

function stratYes_(side, reason, stop, target, quality) {
  return { fired: true, side: side, reason: reason,
           stopLevel: round2_(stop), targetLevel: round2_(target),
           quality: Math.max(0, Math.min(1, quality)) };
}

// =====================================================================
// A. TREND FOLLOWING
// =====================================================================

function stratTrendFollowing(s) {
  if (!(s.adx > 0)) return stratNo_('no ADX');
  if (s.adx < 25) return stratNo_('ADX ' + round2_(s.adx) + ' — no trend');

  var stackUp   = s.ema9 > s.ema20 && s.ema20 > s.ema50;
  var stackDown = s.ema9 < s.ema20 && s.ema20 < s.ema50;
  var diUp   = s.minusDI > 0 ? s.plusDI / s.minusDI : Infinity;
  var diDown = s.plusDI  > 0 ? s.minusDI / s.plusDI : Infinity;

  if (stackUp && s.spot > s.vwap && s.stDirection > 0 && diUp >= 2) {
    if (s.marketTrend < 0) {
      return stratNo_('long setup against a falling market — the 23 Oct INFY error');
    }
    var stop = Math.max(s.ema20, s.spot - 1.5 * s.atr);
    return stratYes_('CE',
      'EMA 9>20>50, above VWAP, supertrend up, DI ' + round2_(diUp) + 'x, ADX ' +
        round2_(s.adx),
      stop, s.spot + 3 * s.atr,
      Math.min(1, (s.adx / 60) * 0.5 + Math.min(diUp / 5, 1) * 0.5));
  }

  if (stackDown && s.spot < s.vwap && s.stDirection < 0 && diDown >= 2) {
    if (s.marketTrend > 0) {
      return stratNo_('short setup against a rising market');
    }
    var stopD = Math.min(s.ema20, s.spot + 1.5 * s.atr);
    return stratYes_('PE',
      'EMA 9<20<50, below VWAP, supertrend down, DI ' + round2_(diDown) + 'x',
      stopD, s.spot - 3 * s.atr,
      Math.min(1, (s.adx / 60) * 0.5 + Math.min(diDown / 5, 1) * 0.5));
  }

  return stratNo_('EMA stack, VWAP side and supertrend do not agree');
}

// =====================================================================
// B. BREAKOUT
// =====================================================================

function stratBreakout(s) {
  if (!(s.prevDayHigh > 0) || !(s.prevDayLow > 0)) {
    return stratNo_('no previous day range');
  }
  var relVol = s.avgVolume > 0 ? s.volume / s.avgVolume : 0;
  if (relVol < 1.2) {
    return stratNo_('relative volume ' + round2_(relVol) +
      ' — an unconfirmed break is a false break');
  }

  var buffer = 0.15 * s.atr;   // must clear by something, not merely touch

  if (s.spot > s.prevDayHigh + buffer && s.spot > s.vwap && s.stDirection > 0) {
    return stratYes_('CE',
      'cleared the previous day high ' + round2_(s.prevDayHigh) + ' on ' +
        round2_(relVol) + 'x volume',
      s.prevDayHigh - 0.2 * s.atr, s.spot + 2.5 * s.atr,
      Math.min(1, 0.4 + Math.min(relVol / 3, 1) * 0.6));
  }

  if (s.spot < s.prevDayLow - buffer && s.spot < s.vwap && s.stDirection < 0) {
    return stratYes_('PE',
      'broke the previous day low ' + round2_(s.prevDayLow) + ' on ' +
        round2_(relVol) + 'x volume',
      s.prevDayLow + 0.2 * s.atr, s.spot - 2.5 * s.atr,
      Math.min(1, 0.4 + Math.min(relVol / 3, 1) * 0.6));
  }

  return stratNo_('inside the previous day range');
}

// =====================================================================
// C. MOMENTUM
// =====================================================================

function stratMomentum(s) {
  var relVol = s.avgVolume > 0 ? s.volume / s.avgVolume : 0;
  if (relVol < 2) return stratNo_('relative volume ' + round2_(relVol) +
    ' — momentum needs unusual participation');

  var chg = s.prevClose > 0 ? (s.spot - s.prevClose) / s.prevClose : 0;

  // The INFY/BEL/VEDL rule: a big day inside a downtrend is a bounce.
  if (chg > 0 && s.stDirection < 0) {
    return stratNo_('up ' + round2_(chg * 100) + '% with supertrend DOWN — ' +
      'a bounce, not momentum (VEDL +2.15% at RSI 22)');
  }
  if (chg < 0 && s.stDirection > 0) {
    return stratNo_('down inside an uptrend — a dip, not a breakdown');
  }

  if (chg >= 0.02 && s.spot > s.vwap && s.rsi < 80 && s.marketTrend >= 0) {
    return stratYes_('CE',
      'up ' + round2_(chg * 100) + '% on ' + round2_(relVol) + 'x volume, ' +
        'above VWAP, RSI ' + round2_(s.rsi),
      s.vwap - 0.3 * s.atr, s.spot + 2 * s.atr,
      Math.min(1, Math.min(relVol / 4, 1) * 0.6 + Math.min(chg / 0.05, 1) * 0.4));
  }

  if (chg <= -0.02 && s.spot < s.vwap && s.rsi > 20 && s.marketTrend <= 0) {
    return stratYes_('PE',
      'down ' + round2_(chg * 100) + '% on ' + round2_(relVol) + 'x volume',
      s.vwap + 0.3 * s.atr, s.spot - 2 * s.atr,
      Math.min(1, Math.min(relVol / 4, 1) * 0.6 + Math.min(-chg / 0.05, 1) * 0.4));
  }

  return stratNo_('move too small, or RSI already extreme');
}

// =====================================================================
// D. VWAP REVERSAL — confirmation required, never a bare touch
// =====================================================================

function stratVwapReversal(s) {
  if (!(s.vwap > 0) || !(s.atr > 0)) return stratNo_('no VWAP or ATR');

  var dist = (s.spot - s.vwap) / s.atr;

  // Reclaim from below, with the daily trend up.
  if (dist > 0 && dist < 0.3 && s.stDirection > 0 && s.spot > s.open &&
      s.dayLow < s.vwap - 0.3 * s.atr) {
    return stratYes_('CE',
      'reclaimed VWAP from below after testing ' + round2_(s.dayLow) +
        ', with the daily trend',
      s.dayLow, s.vwap + 2 * s.atr, 0.55);
  }

  // Rejection from above, with the daily trend down.
  if (dist < 0 && dist > -0.3 && s.stDirection < 0 && s.spot < s.open &&
      s.dayHigh > s.vwap + 0.3 * s.atr) {
    return stratYes_('PE',
      'rejected at VWAP after testing ' + round2_(s.dayHigh) +
        ', with the daily trend',
      s.dayHigh, s.vwap - 2 * s.atr, 0.55);
  }

  return stratNo_('at VWAP but without a reclaim or rejection — a touch is ' +
    'not a signal');
}

// =====================================================================
// E. MEAN REVERSION — never in a strong trend
// =====================================================================

function stratMeanReversion(s) {
  if (s.adx >= 30) {
    return stratNo_('ADX ' + round2_(s.adx) + ' — never fade a trending market');
  }
  if (!(s.atr > 0) || !(s.ema20 > 0)) return stratNo_('no ATR or EMA20');

  var ext = (s.spot - s.ema20) / s.atr;

  if (ext <= -2 && s.rsi < 30 && s.marketTrend >= 0) {
    return stratYes_('CE',
      round2_(-ext) + ' ATR below EMA20 with RSI ' + round2_(s.rsi) +
        ' in a non-trending market',
      s.spot - 1.5 * s.atr, s.ema20, 0.45);
  }
  if (ext >= 2 && s.rsi > 70 && s.marketTrend <= 0) {
    return stratYes_('PE',
      round2_(ext) + ' ATR above EMA20 with RSI ' + round2_(s.rsi),
      s.spot + 1.5 * s.atr, s.ema20, 0.45);
  }

  return stratNo_('not statistically extended');
}

// =====================================================================
// F. OPENING RANGE
// =====================================================================

function stratOpeningRange(s) {
  if (!(s.orHigh > 0) || !(s.orLow > 0)) return stratNo_('opening range not formed');
  var range = s.orHigh - s.orLow;
  if (!(range > 0)) return stratNo_('zero opening range');

  var relVol = s.avgVolume > 0 ? s.volume / s.avgVolume : 0;
  var buffer = 0.0015 * s.spot;          // must clear by 0.15%

  if (s.spot > s.orHigh + buffer && s.spot > s.vwap && s.stDirection > 0 &&
      relVol >= 1) {
    return stratYes_('CE',
      'opening-range break above ' + round2_(s.orHigh) + ', above VWAP, with ' +
        'the daily trend',
      s.orLow, s.spot + 2 * range,
      Math.min(1, 0.5 + Math.min(relVol / 3, 1) * 0.5));
  }
  if (s.spot < s.orLow - buffer && s.spot < s.vwap && s.stDirection < 0 &&
      relVol >= 1) {
    return stratYes_('PE',
      'opening-range break below ' + round2_(s.orLow),
      s.orHigh, s.spot - 2 * range,
      Math.min(1, 0.5 + Math.min(relVol / 3, 1) * 0.5));
  }

  // A failed break is information, not a trade.
  if (s.dayHigh > s.orHigh + buffer && s.spot < s.orHigh) {
    return stratNo_('FAILED break above the opening range — stand aside');
  }
  return stratNo_('inside the opening range');
}

// =====================================================================
// G. INDEX — deliberately stricter than the stock strategies
// =====================================================================

function stratIndex(s) {
  if (!(s.adx > 0)) return stratNo_('no ADX');
  if (s.adx < 30) return stratNo_('index ADX ' + round2_(s.adx) +
    ' — indices need a stronger trend than single stocks');

  // An index at the top of a six-month ADX range is mature, not starting.
  if (s.adx > 70 && s.rsi > 75) {
    return stratNo_('ADX ' + round2_(s.adx) + ' with RSI ' + round2_(s.rsi) +
      ' — a mature trend near its ceiling, not an entry');
  }

  var diUp = s.minusDI > 0 ? s.plusDI / s.minusDI : Infinity;
  var headroom = s.stUpperBand > 0 ? (s.stUpperBand - s.spot) / s.atr : 0;

  if (s.stDirection > 0 && diUp >= 3 && s.spot > s.vwap && headroom >= 1) {
    return stratYes_('CE',
      'index trend up, DI ' + round2_(diUp) + 'x, ' + round2_(headroom) +
        ' ATR of headroom to the ceiling',
      s.spot - 1.2 * s.atr, s.stUpperBand, Math.min(1, 0.4 + headroom / 5));
  }

  var diDown = s.plusDI > 0 ? s.minusDI / s.plusDI : Infinity;
  if (s.stDirection < 0 && diDown >= 3 && s.spot < s.vwap) {
    return stratYes_('PE',
      'index trend down, DI ' + round2_(diDown) + 'x',
      s.spot + 1.2 * s.atr, s.spot - 3 * s.atr, 0.5);
  }

  return stratNo_('index trend not clean enough');
}

// =====================================================================

var STRATEGIES = [
  { key: 'TREND',     name: 'Trend following', fn: stratTrendFollowing, index: false },
  { key: 'BREAKOUT',  name: 'Breakout',        fn: stratBreakout,       index: false },
  { key: 'MOMENTUM',  name: 'Momentum',        fn: stratMomentum,       index: false },
  { key: 'VWAP_REV',  name: 'VWAP reversal',   fn: stratVwapReversal,   index: false },
  { key: 'MEAN_REV',  name: 'Mean reversion',  fn: stratMeanReversion,  index: false },
  { key: 'ORB',       name: 'Opening range',   fn: stratOpeningRange,   index: false },
  { key: 'INDEX',     name: 'Index',           fn: stratIndex,          index: true }
];

/**
 * Run every enabled strategy over one snapshot.
 *
 * Strategies that fire on OPPOSITE sides cancel: two models disagreeing is
 * not a signal, it is noise, and trading it is how 23 Oct went 0 for 2
 * reversing direction inside ninety minutes.
 */
function runStrategies(s, opts) {
  opts = opts || {};
  var isIndex = !!opts.isIndex;
  var enabled = opts.enabled || null;

  var fired = [], rejected = [];
  STRATEGIES.forEach(function (st) {
    if (st.index !== isIndex) return;
    if (enabled && enabled.indexOf(st.key) === -1) return;
    var r;
    try { r = st.fn(s); }
    catch (e) { r = stratNo_('error: ' + e.message); }
    r.key = st.key; r.name = st.name;
    if (r.fired) fired.push(r); else rejected.push(r);
  });

  var calls = fired.filter(function (f) { return f.side === 'CE'; });
  var puts  = fired.filter(function (f) { return f.side === 'PE'; });

  if (calls.length && puts.length) {
    return { side: null, fired: [], rejected: rejected, conflict: true,
      reason: 'strategies disagree — ' +
        calls.map(function (c) { return c.key; }).join('/') + ' say CE, ' +
        puts.map(function (p) { return p.key; }).join('/') + ' say PE. ' +
        'Disagreement is noise, not a signal.' };
  }

  var agreed = calls.length ? calls : puts;
  if (!agreed.length) {
    return { side: null, fired: [], rejected: rejected, conflict: false,
      reason: 'no strategy fired' };
  }

  // Agreement across independent strategies is the real signal.
  var best = agreed.reduce(function (a, b) {
    return b.quality > a.quality ? b : a;
  });

  return {
    side: agreed[0].side,
    fired: agreed,
    rejected: rejected,
    conflict: false,
    agreement: agreed.length,
    best: best,
    stopLevel: best.stopLevel,
    targetLevel: best.targetLevel,
    reason: agreed.map(function (f) { return f.key + ': ' + f.reason; }).join(' | ')
  };
}
