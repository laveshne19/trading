/**
 * discipline.cjs — tests for 15_Costs, 16_Hold, 17_Gate.
 *
 *   node test/discipline.cjs
 *
 * Every case is built from REAL prices observed on 20-26 Nov 2026, where the
 * correct answer is already known because the outcome happened. A test that
 * passes here means the module would have made the decision that actually
 * worked, on data that actually printed.
 *
 * Network is stubbed to throw. Nothing here can reach a broker.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'apps-script');

const sandbox = {
  console, Math, Date, JSON, Number, String, Boolean, Array, Object, Error,
  isNaN, parseInt, parseFloat, RegExp, Infinity,
  Logger: { log: () => {} },
  Utilities: { sleep: () => {}, formatDate: () => '' },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: () => null, setProperty: () => {}, deleteProperty: () => {}
    })
  },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  UrlFetchApp: { fetch() { throw new Error('network call attempted'); } },
  MailApp: { sendEmail() {} },
  Session: { getEffectiveUser: () => ({ getEmail: () => 't@e.com' }) },
  ScriptApp: { getProjectTriggers: () => [] },
  SpreadsheetApp: { getActive: () => null }
};
const ctx = vm.createContext(sandbox);

// Load only what these modules need, plus the modules themselves.
for (const f of ['00_Config.gs','14_Util.gs', '15_Costs.gs', '16_Hold.gs', '17_Gate.gs']) {
  const p = path.join(SRC, f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}

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
const R = ctx;

// ===================================================================
// COSTS
// ===================================================================

check('round trip on a Rs 70 option, 475 lot, charges only', () => {
  const c = R.optionRoundTripCost(70, 70, 475, 0);
  // Brokerage 40 is the floor; everything else scales off a Rs 66,500 turnover.
  if (c.brokerage !== 40) return 'brokerage ' + c.brokerage;
  if (!(c.total > 40)) return 'total not above brokerage: ' + c.total;
  if (!(c.total < 200)) return 'charges implausibly large: ' + c.total;
  return true;
});

check('STT is charged on the sell side only', () => {
  const a = R.optionRoundTripCost(70, 70, 475, 0);
  const b = R.optionRoundTripCost(70, 140, 475, 0);
  // Doubling the exit price must roughly double STT.
  return near(b.stt, a.stt * 2, 1) || 'stt did not scale with exit: ' + a.stt + ' -> ' + b.stt;
});

check('slippage scales with the spread and is excluded at spread 0', () => {
  const none = R.optionRoundTripCost(70, 75, 475, 0);
  const wide = R.optionRoundTripCost(70, 75, 475, 1.0);
  if (none.slippage !== 0) return 'slippage should be 0: ' + none.slippage;
  // 0.5 fraction x 1.0 spread x 475 qty x 2 sides = 475
  return near(wide.slippage, 475, 1) || 'slippage ' + wide.slippage;
});

check('TATASTEEL 2,750 lot: breakeven move is material', () => {
  // Real position: 2,750 qty at 4.83, a 0.02 spread on a ~5 rupee option.
  const be = R.breakevenMove(4.83, 2750, 0.02);
  if (!(be.absolute > 0)) return 'no breakeven move';
  // Over 1% of premium is the point: small options on big lots are not free.
  if (!(be.pct > 0.005)) return 'breakeven pct too small: ' + be.pct;
  return true;
});

check('net P&L is gross minus costs, never equal to gross', () => {
  const n = R.netPnl(4.83, 6.72, 2750, 0.02);
  const gross = (6.72 - 4.83) * 2750;
  if (!near(n.gross, gross, 1)) return 'gross wrong: ' + n.gross;
  if (!(n.net < n.gross)) return 'net not below gross';
  if (!near(n.net, n.gross - n.costs, 1)) return 'net != gross - costs';
  return true;
});

check('a 5-paisa scalp on a 2,750 lot is REFUSED as too thin', () => {
  // Buy 4.83, hope for 4.88. That is the "small profits" idea, costed.
  const v = R.scalpViability(4.83, 4.88, 2750, 0.02, 3);
  if (v.ok) return 'accepted a scalp that cannot clear costs 3x';
  if (v.reason.indexOf('breakeven') === -1) return 'wrong reason: ' + v.reason;
  return true;
});

check('a wide-enough scalp IS accepted', () => {
  const v = R.scalpViability(4.83, 5.50, 2750, 0.02, 3);
  return v.ok || 'rejected a viable scalp: ' + v.reason;
});

check('scalp with target below entry is refused outright', () => {
  const v = R.scalpViability(70, 68, 475, 0.5, 3);
  return (!v.ok && v.reason.indexOf('not above entry') >= 0) || 'wrong: ' + v.reason;
});

check('spreadPct returns null on a one-sided book', () => {
  if (R.spreadPct(0, 5) !== null) return 'bid 0 should be null';
  if (R.spreadPct(5, 0) !== null) return 'ask 0 should be null';
  if (R.spreadPct(6, 5) !== null) return 'crossed book should be null';
  return near(R.spreadPct(64.75, 65.50), 0.0115, 0.001) || 'spread maths wrong';
});

// ===================================================================
// HOLD — the real decisions from this week
// ===================================================================

const base = {
  symbol: 'X', right: 'CE', qty: 650, entryPrice: 36.00, ltp: 36.00,
  thesisVar: 'HDFCBANK', stopLevel: 831.55, targetPrice: 60,
  underlyingPrice: 843.20, underlyingClose: null, atr: 22.11,
  thesisIntact: true, peakPrice: 41.05,
  timeStopDate: null, nowHHMM: '13:07', todayISO: '2026-11-25'
};

check('25 Nov HDFCBANK at -Rs 2,015: HOLD, stop not hit', () => {
  const d = R.holdDecision(Object.assign({}, base, { ltp: 32.90 }));
  if (d.action !== 'HOLD') return 'got ' + d.action + ' — this call was worth Rs 5,297';
  return d.rule === 'UNDERWATER_BUT_INTACT' || 'rule ' + d.rule;
});

check('26 Nov 09:18: no decision at all before 09:45', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    ltp: 86.70, nowHHMM: '09:18', underlyingPrice: 1839.10,
    thesisVar: 'AUROPHARMA', stopLevel: 1820, atr: 42
  }));
  return d.rule === 'OPENING_MINUTES_GUARD' || 'rule ' + d.rule;
});

check('an intraday wick through the stop does NOT exit', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    underlyingPrice: 829.00, underlyingClose: null, nowHHMM: '11:00'
  }));
  if (d.action !== 'HOLD') return 'wick triggered an exit: ' + d.action;
  return d.rule === 'STOP_INTRADAY_ONLY' || 'rule ' + d.rule;
});

check('a dip that RECLAIMS by the close does not exit', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    underlyingPrice: 829.00, underlyingClose: 846.20, nowHHMM: '15:30'
  }));
  return d.rule === 'STOP_RECLAIMED' || 'rule ' + d.rule;
});

check('a CLOSE through the stop exits at the next open', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    underlyingPrice: 825.00, underlyingClose: 825.00, nowHHMM: '15:30'
  }));
  if (d.action !== 'EXIT_AT_OPEN') return 'got ' + d.action;
  return d.rule === 'STOP_HIT_ON_CLOSE' || 'rule ' + d.rule;
});

check('a PUT exits when the underlying closes ABOVE its stop', () => {
  const d = R.holdDecision({
    symbol: 'TATASTEEL160PE', right: 'PE', qty: 2750, entryPrice: 4.83, ltp: 5.62,
    thesisVar: 'TATASTEEL', stopLevel: 163.40, targetPrice: 13,
    underlyingPrice: 165.00, underlyingClose: 165.00, atr: 6.06,
    thesisIntact: true, nowHHMM: '15:30', todayISO: '2026-11-26'
  });
  return d.action === 'EXIT_AT_OPEN' || 'got ' + d.action + '/' + d.rule;
});

check('a PUT HOLDS while the underlying is below its stop', () => {
  const d = R.holdDecision({
    symbol: 'TATASTEEL160PE', right: 'PE', qty: 2750, entryPrice: 4.83, ltp: 5.62,
    thesisVar: 'TATASTEEL', stopLevel: 163.40, targetPrice: 13,
    underlyingPrice: 161.35, underlyingClose: null, atr: 6.06,
    thesisIntact: true, nowHHMM: '10:01', todayISO: '2026-11-26'
  });
  return d.action === 'HOLD' || 'got ' + d.action + '/' + d.rule;
});

check('target reached is a legitimate exit', () => {
  const d = R.holdDecision(Object.assign({}, base, { ltp: 60.00, nowHHMM: '12:00' }));
  if (d.action !== 'EXIT') return 'got ' + d.action;
  return d.rule === 'TARGET_REACHED' || 'rule ' + d.rule;
});

check('broken thesis exits even while winning', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    ltp: 50.00, thesisIntact: false, nowHHMM: '12:00'
  }));
  return d.rule === 'THESIS_BROKEN' || 'rule ' + d.rule;
});

check('time stop fires on its date', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    ltp: 37.00, nowHHMM: '12:00', timeStopDate: '2026-12-15', todayISO: '2026-12-15'
  }));
  return d.rule === 'TIME_STOP' || 'rule ' + d.rule;
});

check('a position with no target refuses to be managed', () => {
  const d = R.holdDecision(Object.assign({}, base, { targetPrice: 0, nowHHMM: '12:00' }));
  return d.rule === 'MISSING_TARGET' || 'rule ' + d.rule;
});

check('an option-price stop is rejected as not anchored', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    thesisVar: '', stopLevel: 0, nowHHMM: '12:00'
  }));
  return d.rule === 'STOP_NOT_ANCHORED' || 'rule ' + d.rule;
});

check('a big winner with an unhit stop still HOLDS, never books on a hunch', () => {
  const d = R.holdDecision(Object.assign({}, base, {
    ltp: 55.00, underlyingPrice: 880, nowHHMM: '14:00'
  }));
  if (d.action !== 'HOLD') return 'got ' + d.action;
  return d.rule === 'WINNER_INTACT' || 'rule ' + d.rule;
});

// ===================================================================
// TRAILING — the HDFCBANK error, mechanised
// ===================================================================

check('refuses to trail to 0.5 ATR — the 25 Nov 840 error', () => {
  // Stock 852.55, ATR 22.11. A stop at 840 is 0.57 ATR away.
  const t = R.trailStop(Object.assign({}, base, {
    underlyingPrice: 852.55, ltp: 52.00, entryPrice: 36.00
  }), 840);
  if (t.moved) return 'accepted a 0.57 ATR stop — this cost Rs 5,297 to learn';
  return t.reason.indexOf('ATR floor') >= 0 || 'wrong reason: ' + t.reason;
});

check('accepts a trail at a sane distance', () => {
  // 852.55 - 838 = 14.55 = 0.66 ATR. Above the 0.6 floor.
  const t = R.trailStop(Object.assign({}, base, {
    underlyingPrice: 852.55, ltp: 52.00, entryPrice: 36.00
  }), 838);
  return t.moved || 'rejected a valid trail: ' + t.reason;
});

check('NEVER widens a stop', () => {
  const t = R.trailStop(Object.assign({}, base, {
    underlyingPrice: 852.55, ltp: 52.00
  }), 800);
  if (t.moved) return 'widened the stop';
  return t.reason.indexOf('WIDER') >= 0 || 'wrong reason: ' + t.reason;
});

check('does not trail before the trade is meaningfully up', () => {
  const t = R.trailStop(Object.assign({}, base, {
    underlyingPrice: 852.55, ltp: 37.00, entryPrice: 36.00
  }), 838);
  if (t.moved) return 'trailed a trade up only 2.8%';
  return t.reason.indexOf('not armed') >= 0 || 'wrong reason: ' + t.reason;
});

check('refuses to trail with no ATR', () => {
  const t = R.trailStop(Object.assign({}, base, {
    underlyingPrice: 852.55, ltp: 52.00, atr: 0
  }), 838);
  return (!t.moved && t.reason.indexOf('blind') >= 0) || 'wrong: ' + t.reason;
});

check('entry stop validation rejects a too-tight stop', () => {
  const v = R.validateEntryStop(852.55, 848, 22.11, 'CE');  // 0.21 ATR
  return (!v.ok && v.reason.indexOf('ATR floor') >= 0) || 'wrong: ' + JSON.stringify(v);
});

check('entry stop validation rejects a stop on the wrong side', () => {
  const v = R.validateEntryStop(852.55, 860, 22.11, 'CE');
  return (!v.ok && v.reason.indexOf('wrong side') >= 0) || 'wrong: ' + JSON.stringify(v);
});

// ===================================================================
// GATE — the trades that lost money must be REFUSED
// ===================================================================

function cand(over) {
  return Object.assign({
    symbol: 'TEST', underlying: 'TEST', right: 'CE', strike: 1600, spot: 1636,
    ask: 66.10, bid: 65.25, lotSize: 700,
    optionDayChangePct: 0.05, oi: 2672, oiDayChangePct: 0.05,
    stUpperBand: 1676.80, stDirection: 1,
    adx: 80.40, plusDI: 44.75, minusDI: 4.87, atr: 39.42,
    daysToExpiry: 23, depthLots: 2, sector: 'BANK', sectorPositions: 0,
    weeklyHighs: [1500, 1560, 1640], weeklyLows: [1420, 1480, 1540],
    hasEventBeforeExpiry: false
  }, over || {});
}

check('ICICIBANK at +76% in a day is REFUSED by the IV filter', () => {
  const g = R.runGate(cand({ optionDayChangePct: 0.7565 }));
  if (g.pass) return 'accepted an option up 76% — this cost Rs 15,750';
  return g.failures.some(f => f.indexOf('IV_INFLATION') === 0) ||
    'wrong failures: ' + g.failures.join('; ');
});

check('CHOLAFIN at 100% time value is REFUSED by the intrinsic floor', () => {
  // Strike 1880, spot 1874.40 -> zero intrinsic.
  const g = R.runGate(cand({ strike: 1880, spot: 1874.40, ask: 73.45, bid: 73.00,
    stUpperBand: 1954.84, lotSize: 625 }));
  if (g.pass) return 'accepted a 100% time-value option — cost Rs 6,875';
  return g.failures.some(f => f.indexOf('INTRINSIC') === 0) ||
    'wrong failures: ' + g.failures.join('; ');
});

check('SONACOMS 980 strike above a 968.25 ceiling is REFUSED', () => {
  const g = R.runGate(cand({ strike: 980, spot: 929, stUpperBand: 968.25,
    ask: 30, bid: 29.5, lotSize: 1225 }));
  return g.failures.some(f => f.indexOf('HEADROOM') === 0) ||
    'headroom check did not fire: ' + g.failures.join('; ');
});

check('VEDL +2.15% with supertrend DOWN is REFUSED as a bounce', () => {
  const g = R.runGate(cand({ stDirection: -1, adx: 34.34, plusDI: 9.14,
    minusDI: 42.49, right: 'CE' }));
  if (g.pass) return 'accepted a call against a down supertrend';
  return g.failures.some(f => f.indexOf('SUPERTREND_DIRECTION') === 0) ||
    'wrong failures: ' + g.failures.join('; ');
});

check('NIFTY IT at ADX 13 is REFUSED for no trend', () => {
  const g = R.runGate(cand({ adx: 13.01, plusDI: 26.64, minusDI: 23.43 }));
  return g.failures.some(f => f.indexOf('ADX') === 0) ||
    'ADX check did not fire: ' + g.failures.join('; ');
});

check('ITC puts on a FLAT floor are REFUSED by the short-side structure check', () => {
  // The real ITC lows: 254.65, 253.15, 256.95, 254.80, 252.85 - flat.
  const g = R.runGate(cand({ right: 'PE', strike: 255, spot: 259.50,
    stDirection: -1, plusDI: 10, minusDI: 30, adx: 45,
    stUpperBand: 240, ask: 6, bid: 5.9, lotSize: 1600,
    weeklyLows: [254.80, 253.90, 252.85] }));
  if (g.pass) return 'accepted the ITC trade — it cost Rs 6,054.75';
  return g.failures.some(f => f.indexOf('WEEKLY_STRUCTURE') === 0) ||
    'structure check did not fire: ' + g.failures.join('; ');
});

check('short-side check PASSES on genuinely falling lows (TATASTEEL)', () => {
  const s = R.structureForShort_([194.00, 187.04, 173.80],
                                 [184.34, 173.88, 158.89]);
  return s.ok || 'rejected a real downtrend: ' + s.detail;
});

check('short-side check NAMES a flat floor as compression', () => {
  const s = R.structureForShort_([269, 267, 264], [254.80, 253.90, 252.85]);
  if (s.ok) return 'accepted a flat floor';
  return s.detail.indexOf('compression') >= 0 || 'did not identify compression: ' + s.detail;
});

check('a dead contract with OI 0 is REFUSED', () => {
  const g = R.runGate(cand({ oi: 0 }));
  return g.failures.some(f => f.indexOf('CONTRACT_LIVE') === 0) ||
    'OI check did not fire';
});

check('an 11% spread is REFUSED', () => {
  const g = R.runGate(cand({ bid: 60, ask: 67 }));
  return g.failures.some(f => f.indexOf('SPREAD') === 0) ||
    'spread check did not fire: ' + g.failures.join('; ');
});

check('a third position in one sector is REFUSED', () => {
  const g = R.runGate(cand({ sectorPositions: 2 }));
  return g.failures.some(f => f.indexOf('SECTOR_CAP') === 0) ||
    'sector cap did not fire';
});

check('an event before expiry is REFUSED', () => {
  const g = R.runGate(cand({ hasEventBeforeExpiry: true }));
  return g.failures.some(f => f.indexOf('NO_EVENT') === 0) ||
    'event check did not fire';
});

check('rising OI with FALLING price is read as writers, not buyers', () => {
  const g = R.runGate(cand({ optionDayChangePct: -0.1232, oiDayChangePct: 0.527 }));
  const f = g.failures.find(x => x.indexOf('OI_CONFIRMS') === 0);
  if (!f) return 'OI check did not fire';
  return f.indexOf('writers') >= 0 || 'wrong reading: ' + f;
});

check('rising price with FALLING OI is read as short covering', () => {
  const g = R.runGate(cand({ optionDayChangePct: 0.68, oiDayChangePct: -0.051 }));
  const f = g.failures.find(x => x.indexOf('OI_CONFIRMS') === 0);
  if (!f) return 'OI check did not fire';
  return f.indexOf('SHORT COVERING') >= 0 || 'wrong reading: ' + f;
});

// ===================================================================
// SYMBOL ASSERTION — the silent MCP defect
// ===================================================================

check('assertSymbol throws when Nifty 50 resolves to INFY', () => {
  try { R.assertSymbol('Nifty 50', 'INFY'); return 'did not throw'; }
  catch (e) { return e.message.indexOf('SYMBOL MISMATCH') >= 0 || e.message; }
});

check('assertSymbol throws when Bank Nifty resolves to HDFCBANK', () => {
  try { R.assertSymbol('Bank Nifty', 'HDFCBANK'); return 'did not throw'; }
  catch (e) { return e.message.indexOf('SYMBOL MISMATCH') >= 0 || e.message; }
});

check('assertSymbol accepts a correct resolution', () => {
  return R.assertSymbol('Aurobindo Pharma', 'AUROPHARMA') === true ||
         'rejected a valid match';
});

check('assertSymbol throws on a null symbol', () => {
  try { R.assertSymbol('NIFTY', null); return 'did not throw'; }
  catch (e) { return true; }
});

// ===================================================================
// A FULL PASS — the gate must be able to say yes
// ===================================================================

check('a clean setup PASSES every check', () => {
  const g = R.runGate(cand({
    strike: 1800, spot: 1840.30, ask: 81.00, bid: 80.55, lotSize: 550,
    stUpperBand: 1905.10, stDirection: 1, adx: 65.58,
    plusDI: 31.50, minusDI: 9.37, atr: 42.00, daysToExpiry: 23,
    optionDayChangePct: 0.344, oi: 1001, oiDayChangePct: 0.068,
    sector: 'PHARMA', sectorPositions: 0,
    weeklyHighs: [1700, 1780, 1845], weeklyLows: [1620, 1700, 1760]
  }));
  return g.pass || 'rejected a clean setup: ' + g.failures.join('; ');
});

// ===================================================================

for (const [st, name, msg] of results) {
  if (st === 'FAIL') console.log('FAIL  ' + name + '  --  ' + msg);
  else if (process.env.VERBOSE) console.log('pass  ' + name);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
