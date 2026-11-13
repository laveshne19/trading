/**
 * 05_Indicators.gs — plain, dependency-free indicators over candle arrays.
 *
 * Every function takes candles as [{t,o,h,l,c,v}, ...] oldest-first and returns
 * either a single latest value or an array aligned to the input (leading nulls
 * where there is not enough history). No lookahead: index i uses only 0..i.
 */

function closes_(k) { return k.map(function (x) { return x.c; }); }

function sma_(vals, n) {
  var out = [], sum = 0;
  for (var i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= n) sum -= vals[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

function ema_(vals, n) {
  var out = [], k = 2 / (n + 1), prev = null;
  for (var i = 0; i < vals.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    if (prev === null) {
      var s = 0;
      for (var j = i - n + 1; j <= i; j++) s += vals[j];
      prev = s / n;
    } else {
      prev = vals[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

/** Wilder RSI. */
function rsi_(vals, n) {
  n = n || 14;
  var out = new Array(vals.length).fill(null);
  if (vals.length <= n) return out;

  var gain = 0, loss = 0;
  for (var i = 1; i <= n; i++) {
    var d = vals[i] - vals[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  var ag = gain / n, al = loss / n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);

  for (var j = n + 1; j < vals.length; j++) {
    var dd = vals[j] - vals[j - 1];
    var g = dd > 0 ? dd : 0, l = dd < 0 ? -dd : 0;
    ag = (ag * (n - 1) + g) / n;
    al = (al * (n - 1) + l) / n;
    out[j] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

/** Wilder ATR. */
function atr_(k, n) {
  n = n || 14;
  var tr = [];
  for (var i = 0; i < k.length; i++) {
    if (i === 0) { tr.push(k[i].h - k[i].l); continue; }
    tr.push(Math.max(k[i].h - k[i].l,
                     Math.abs(k[i].h - k[i - 1].c),
                     Math.abs(k[i].l - k[i - 1].c)));
  }
  var out = new Array(k.length).fill(null);
  if (k.length < n) return out;
  var s = 0;
  for (var j = 0; j < n; j++) s += tr[j];
  out[n - 1] = s / n;
  for (var m = n; m < k.length; m++) out[m] = (out[m - 1] * (n - 1) + tr[m]) / n;
  return out;
}

/** Session VWAP over the candles given (pass only today's candles). */
function vwap_(k) {
  var pv = 0, vol = 0, out = [];
  for (var i = 0; i < k.length; i++) {
    var tp = (k[i].h + k[i].l + k[i].c) / 3;
    pv += tp * k[i].v; vol += k[i].v;
    out.push(vol > 0 ? pv / vol : k[i].c);
  }
  return out;
}

function last_(arr) {
  for (var i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) return arr[i];
  }
  return null;
}

/**
 * Opening range over the first `minutes` of the session.
 * @return {{high:number, low:number, bars:number}|null}
 */
function openingRange_(todayCandles, minutes, barMinutes) {
  var need = Math.max(1, Math.round(minutes / barMinutes));
  if (todayCandles.length < need) return null;
  var slice = todayCandles.slice(0, need);
  return {
    high: Math.max.apply(null, slice.map(function (x) { return x.h; })),
    low:  Math.min.apply(null, slice.map(function (x) { return x.l; })),
    bars: need
  };
}

/**
 * Where in the day's range the last close sits, 0 = at the low, 1 = at the high.
 * A close above 0.75 or below 0.25 is the shape that carries overnight.
 */
function closeLocation_(todayCandles) {
  if (!todayCandles.length) return null;
  var hi = Math.max.apply(null, todayCandles.map(function (x) { return x.h; }));
  var lo = Math.min.apply(null, todayCandles.map(function (x) { return x.l; }));
  if (hi === lo) return 0.5;
  return (todayCandles[todayCandles.length - 1].c - lo) / (hi - lo);
}

/** Compact technical read used in the Claude snapshot and the rule engine. */
function technicalRead_(daily, intraday, barMinutes) {
  var dc = closes_(daily);
  var e20 = ema_(dc, 20), e50 = ema_(dc, 50), r14 = rsi_(dc, 14);
  var a14 = atr_(daily, 14);
  var lastC = dc.length ? dc[dc.length - 1] : null;

  var read = {
    lastClose: lastC ? round2_(lastC) : null,
    ema20: last_(e20) ? round2_(last_(e20)) : null,
    ema50: last_(e50) ? round2_(last_(e50)) : null,
    rsi14: last_(r14) ? round2_(last_(r14)) : null,
    atr14: last_(a14) ? round2_(last_(a14)) : null,
    trend: null,
    higherHighs: null
  };

  if (read.ema20 && read.ema50 && lastC) {
    read.trend = (lastC > read.ema20 && read.ema20 > read.ema50) ? 'UP'
               : (lastC < read.ema20 && read.ema20 < read.ema50) ? 'DOWN'
               : 'MIXED';
  }

  // Swing-high sequence over the last ~6 weeks: the single most useful fact
  // for deciding whether a bounce is worth buying.
  if (daily.length >= 30) {
    var w = daily.slice(-30);
    var firstHalf = Math.max.apply(null, w.slice(0, 15).map(function (x) { return x.h; }));
    var secondHalf = Math.max.apply(null, w.slice(15).map(function (x) { return x.h; }));
    read.higherHighs = secondHalf > firstHalf;
  }

  if (intraday && intraday.length) {
    read.vwap = round2_(last_(vwap_(intraday)));
    read.closeLocation = round2_(closeLocation_(intraday));
    var or = openingRange_(intraday, cfg().ORB_RANGE_MINUTES, barMinutes || 5);
    if (or) read.openingRange = { high: round2_(or.high), low: round2_(or.low) };
    read.dayHigh = round2_(Math.max.apply(null, intraday.map(function (x) { return x.h; })));
    read.dayLow  = round2_(Math.min.apply(null, intraday.map(function (x) { return x.l; })));
    read.ltp     = round2_(intraday[intraday.length - 1].c);
  }

  return read;
}

/** Unit tests for the indicator maths. Run from Diagnostics. */
function selfTestIndicators() {
  var fails = [];
  var eq = function (name, got, want, tol) {
    tol = tol || 0.01;
    if (got === null || Math.abs(got - want) > tol) {
      fails.push(name + ': want ' + want + ' got ' + got);
    }
  };

  // SMA of 1..5, n=3 -> last = (3+4+5)/3 = 4
  eq('sma', last_(sma_([1, 2, 3, 4, 5], 3)), 4);

  // RSI of a monotonically rising series is 100
  eq('rsi all-up', last_(rsi_([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], 14)), 100);

  // ATR of constant-range candles equals that range
  var flat = [];
  for (var i = 0; i < 20; i++) flat.push({ o: 10, h: 11, l: 9, c: 10, v: 1 });
  eq('atr flat', last_(atr_(flat, 14)), 2);

  // VWAP with equal volumes equals the mean typical price
  var k = [{ h: 11, l: 9, c: 10, v: 100 }, { h: 21, l: 19, c: 20, v: 100 }];
  eq('vwap', last_(vwap_(k)), 15);

  // closeLocation: close at the high -> 1
  eq('closeLoc high', closeLocation_([{ h: 10, l: 5, c: 10 }]), 1);
  eq('closeLoc low',  closeLocation_([{ h: 10, l: 5, c: 5  }]), 0);

  // EMA must not look ahead: leading values null until n-1
  var e = ema_([1,2,3,4,5], 3);
  if (e[0] !== null || e[1] !== null || e[2] === null) fails.push('ema warmup wrong');

  var msg = fails.length ? 'INDICATOR TESTS FAILED:\n' + fails.join('\n')
                         : 'Indicator self-test passed (7/7).';
  Logger.log(msg);
  return msg;
}
