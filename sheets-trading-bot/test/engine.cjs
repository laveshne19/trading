/**
 * engine.cjs — tests for 21_RiskPro, 22_Strategies, 23_Score.
 *
 *   node test/engine.cjs
 *
 * Cases are built from the account's own history where possible, so a pass
 * means the module would have made the decision that actually worked.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'apps-script');
const sandbox = {
  console, Math, Date, JSON, Number, String, Boolean, Array, Object, Error,
  isNaN, isFinite, parseInt, parseFloat, RegExp, Infinity,
  Logger: { log: () => {} },
  Utilities: { sleep: () => {}, formatDate: () => '' },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  UrlFetchApp: { fetch() { throw new Error('network call attempted'); } },
  MailApp: { sendEmail() {} },
  Session: { getEffectiveUser: () => ({ getEmail: () => 't@e.com' }) },
  ScriptApp: { getProjectTriggers: () => [] },
  SpreadsheetApp: { getActive: () => null }
};
const R = vm.createContext(sandbox);
for (const f of ['00_Config.gs','14_Util.gs','15_Costs.gs','16_Hold.gs',
                 '17_Gate.gs','18_Paper.gs','21_RiskPro.gs','22_Strategies.gs',
                 '23_Score.gs']) {
  const p = path.join(SRC, f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), R, { filename: f });
}

let pass = 0, fail = 0; const results = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) { pass++; results.push(['PASS', name, '']); }
    else { fail++; results.push(['FAIL', name, String(r)]); }
  } catch (e) { fail++; results.push(['FAIL', name, e.message]); }
}

// ===================================================== RISK

function state(over) {
  return Object.assign({
    capital: 200000, clearCash: 50000, realisedToday: 0, realisedWeek: 0,
    deployed: 0, openPositions: 0, tradesToday: 0, consecutiveLosses: 0,
    sectorCounts: {}, killSwitch: false
  }, over || {});
}

check('a clean state allows trading', () => {
  const g = R.riskGateGlobal(state());
  return g.allowed || g.blocks.join('; ');
});

check('the 25 Nov day (-6.95%) would have been BLOCKED by the 4% limit', () => {
  const g = R.riskGateGlobal(state({ realisedToday: -11409.50, capital: 164040 }));
  if (g.allowed) return 'allowed trading after -Rs 11,409 on Rs 164,040';
  return g.blocks.some(b => b.indexOf('daily loss limit') >= 0) || g.blocks.join(';');
});

check('negative clear_cash blocks new entries — the 11/12/13 Nov error', () => {
  const g = R.riskGateGlobal(state({ clearCash: -139627.83 }));
  if (g.allowed) return 'allowed a new entry on a Rs 139,628 debit';
  return g.blocks.some(b => b.indexOf('clear_cash') >= 0) || g.blocks.join(';');
});

check('three consecutive losses stands the bot down', () => {
  const g = R.riskGateGlobal(state({ consecutiveLosses: 3 }));
  return g.blocks.some(b => b.indexOf('consecutive losses') >= 0) || g.blocks.join(';');
});

check('the weekly loss limit blocks independently of the daily one', () => {
  const g = R.riskGateGlobal(state({ realisedToday: 0, realisedWeek: -7000 }));
  return g.blocks.some(b => b.indexOf('weekly loss limit') >= 0) || g.blocks.join(';');
});

check('every block is reported, not just the first', () => {
  const g = R.riskGateGlobal(state({
    killSwitch: true, clearCash: -1000, consecutiveLosses: 5, tradesToday: 9 }));
  return g.blocks.length >= 4 || 'only ' + g.blocks.length + ' blocks reported';
});

check('a warning fires at 70% of the daily limit without blocking', () => {
  // Effective limit is CFG_DEFAULTS' 4% of Rs 200,000 = Rs 8,000. 70% = 5,600.
  const g = R.riskGateGlobal(state({ realisedToday: -6000 }));
  if (!g.allowed) return 'blocked too early';
  return g.warnings.length === 1 || 'warnings ' + g.warnings.length;
});

// ----- sizing

check('sizing REFUSES when valueAtStop is missing — the 25 Nov error', () => {
  const r = R.riskSize(state(), { entryPrice: 81, lotSize: 550, sector: 'PHARMA' });
  if (r.ok) return 'sized a position without knowing the risk at its stop';
  return r.reason.indexOf('valueAtStop') >= 0 || r.reason;
});

check('sizing is driven by risk at the stop, not by cost', () => {
  // Rs 200,000 capital, 0.5% = Rs 1,000 budget.
  // Entry 81, value at stop 60 -> Rs 21/unit x 550 = Rs 11,550 per lot.
  const r = R.riskSize(state(), { entryPrice: 81, valueAtStop: 60, lotSize: 550,
    sector: 'PHARMA', targetPrice: 130 });
  if (r.ok) return 'took a trade risking Rs 11,550 against a Rs 1,000 budget';
  return r.reason.indexOf('zero lots') >= 0 || r.reason;
});

check('a trade inside the risk budget IS sized', () => {
  // 2,750 lot at 4.83, stop value 4.40 -> Rs 0.43 x 2750 = Rs 1,182.50/lot.
  // Effective RISK_PCT_PER_TRADE is CFG_DEFAULTS' 2%; on Rs 100,000 that is
  // Rs 2,000 -> 1 lot. Sizing must come from the risk, not the cost.
  const r = R.riskSize(state({ capital: 100000 }), {
    entryPrice: 4.83, valueAtStop: 4.40, lotSize: 2750, sector: 'METAL',
    targetPrice: 13 });
  if (!r.ok) return 'refused a trade inside budget: ' + r.reason;
  if (r.lots !== 1) return 'lots ' + r.lots;
  return Math.abs(r.riskAtStop - 1182.50) < 1 || 'riskAtStop ' + r.riskAtStop;
});

check('reward:risk below 2.0 is refused', () => {
  const r = R.riskSize(state({ capital: 5000000 }), {
    entryPrice: 100, valueAtStop: 90, lotSize: 50, sector: 'X',
    targetPrice: 110 });              // 1:1
  if (r.ok) return 'accepted a 1:1 trade';
  return r.reason.indexOf('reward:risk') >= 0 || r.reason;
});

check('the sector cap refuses a third position in one sector', () => {
  const r = R.riskSize(state({ capital: 5000000, sectorCounts: { BANK: 2 } }), {
    entryPrice: 36, valueAtStop: 30, lotSize: 650, sector: 'BANK',
    targetPrice: 60 });
  return (!r.ok && r.reason.indexOf('already open in BANK') >= 0) || r.reason;
});

check('the deploy cap limits lots even when the risk budget allows more', () => {
  const r = R.riskSize(state({ capital: 1000000, deployed: 295000 }), {
    entryPrice: 10, valueAtStop: 9.9, lotSize: 100, sector: 'X',
    targetPrice: 11 });
  if (!r.ok) return 'refused: ' + r.reason;
  return r.reason.indexOf('deploy cap') >= 0 || 'sized by ' + r.reason;
});

// ----- option value at the stop

check('option value at the stop keeps intrinsic and halves time value', () => {
  // HDFCBANK 830 CE, spot 870, premium 52.90, stop 852.
  const v = R.optionValueAtStop('CE', 830, 870, 52.90, 852);
  // intrinsic at stop = 22; time now = 52.90 - 40 = 12.90; half = 6.45
  return v === 28.45 || 'got ' + v;
});

check('a PUT keeps intrinsic on the correct side', () => {
  const v = R.optionValueAtStop('PE', 160, 162.60, 4.93, 163.40);
  return v === 2.47 || 'got ' + v;      // intrinsic 0 + 4.93/2
});

// ----- helpers

check('consecutive losses counts back from the most recent', () => {
  const c = R.consecutiveLosses([
    { netPnl: 100 }, { netPnl: -50 }, { netPnl: -20 }, { netPnl: -10 }]);
  return c === 3 || 'got ' + c;
});

check('a win resets the consecutive-loss count', () => {
  const c = R.consecutiveLosses([{ netPnl: -50 }, { netPnl: 10 }]);
  return c === 0 || 'got ' + c;
});

check('week start is the Monday', () => {
  if (R.weekStartISO('2026-11-26') !== '2026-11-23') return 'Thu -> ' + R.weekStartISO('2026-11-26');
  if (R.weekStartISO('2026-11-23') !== '2026-11-23') return 'Mon wrong';
  return R.weekStartISO('2026-11-29') === '2026-11-23' || 'Sun wrong';
});

// ===================================================== STRATEGIES

function snap(over) {
  return Object.assign({
    symbol: 'TEST', spot: 100, prevClose: 98, dayHigh: 101, dayLow: 97, open: 98.5,
    ema9: 99, ema20: 97, ema50: 95, vwap: 98, atr: 2, adx: 45,
    plusDI: 35, minusDI: 10, rsi: 60,
    stDirection: 1, stUpperBand: 108, stLowerBand: 92,
    volume: 200000, avgVolume: 100000,
    orHigh: 99, orLow: 97, prevDayHigh: 99, prevDayLow: 96,
    weeklyHighs: [90, 95, 100], weeklyLows: [85, 88, 92],
    marketTrend: 1
  }, over || {});
}

check('trend following fires long on a clean stack', () => {
  const r = R.stratTrendFollowing(snap());
  return (r.fired && r.side === 'CE') || r.reason;
});

check('trend following REFUSES a long against a falling market (23 Oct INFY)', () => {
  const r = R.stratTrendFollowing(snap({ marketTrend: -1 }));
  if (r.fired) return 'took a long into a falling market';
  return r.reason.indexOf('INFY') >= 0 || r.reason;
});

check('trend following refuses when ADX is weak', () => {
  const r = R.stratTrendFollowing(snap({ adx: 13 }));
  return !r.fired || 'fired at ADX 13';
});

check('momentum REFUSES an up day inside a downtrend (the VEDL case)', () => {
  const r = R.stratMomentum(snap({ stDirection: -1, spot: 102, prevClose: 100,
    volume: 400000 }));
  if (r.fired) return 'bought a bounce';
  return r.reason.indexOf('bounce') >= 0 || r.reason;
});

check('momentum needs unusual volume', () => {
  const r = R.stratMomentum(snap({ volume: 110000 }));
  return (!r.fired && r.reason.indexOf('volume') >= 0) || r.reason;
});

check('breakout refuses an unconfirmed break', () => {
  const r = R.stratBreakout(snap({ spot: 100, volume: 100000 }));
  return (!r.fired && r.reason.indexOf('false break') >= 0) || r.reason;
});

check('breakout fires on volume above the previous day high', () => {
  const r = R.stratBreakout(snap({ spot: 100, prevDayHigh: 99, volume: 300000 }));
  return (r.fired && r.side === 'CE') || r.reason;
});

check('mean reversion NEVER fires in a trending market', () => {
  const r = R.stratMeanReversion(snap({ adx: 45, spot: 90, rsi: 25 }));
  if (r.fired) return 'faded a trend at ADX 45';
  return r.reason.indexOf('never fade') >= 0 || r.reason;
});

check('mean reversion fires only when extended in a quiet market', () => {
  const r = R.stratMeanReversion(snap({ adx: 18, spot: 92, ema20: 97, rsi: 25,
    marketTrend: 0 }));
  return (r.fired && r.side === 'CE') || r.reason;
});

check('VWAP reversal refuses a bare touch', () => {
  const r = R.stratVwapReversal(snap({ spot: 98.1, dayLow: 97.9 }));
  if (r.fired) return 'traded a bare VWAP touch';
  return r.reason.indexOf('not a signal') >= 0 || r.reason;
});

check('opening range reports a FAILED break rather than firing', () => {
  const r = R.stratOpeningRange(snap({ spot: 98, dayHigh: 100, orHigh: 99 }));
  if (r.fired) return 'fired after a failed break';
  return r.reason.indexOf('FAILED') >= 0 || r.reason;
});

check('the index strategy refuses a mature trend near its ceiling', () => {
  const r = R.stratIndex(snap({ adx: 72, rsi: 77 }));
  if (r.fired) return 'entered a maxed-out index trend';
  return r.reason.indexOf('mature trend') >= 0 || r.reason;
});

check('the index strategy demands a stronger ADX than stocks do', () => {
  const r = R.stratIndex(snap({ adx: 27 }));
  return (!r.fired && r.reason.indexOf('stronger trend') >= 0) || r.reason;
});

check('conflicting strategies produce NO trade, not a coin flip', () => {
  // Force a disagreement: trend says long, mean reversion would say short.
  const s = snap({ adx: 20, spot: 108, ema20: 100, rsi: 75, marketTrend: 0,
    stDirection: 1, volume: 400000, prevDayHigh: 101 });
  const r = R.runStrategies(s, { isIndex: false });
  if (r.side !== null && !r.conflict) return 'picked a side: ' + r.side;
  return true;
});

check('agreement across strategies is counted', () => {
  const r = R.runStrategies(snap({ spot: 100.5, prevDayHigh: 99,
    volume: 350000, prevClose: 98 }), { isIndex: false });
  if (!r.side) return 'nothing fired: ' + r.reason;
  return r.agreement >= 2 || 'agreement ' + r.agreement;
});

check('index strategies do not run on stocks and vice versa', () => {
  const r = R.runStrategies(snap(), { isIndex: true });
  return (r.fired || []).every(f => f.key === 'INDEX') ||
    'stock strategy ran on an index';
});

// ===================================================== SCORING

check('a failed gate produces NO score at all', () => {
  const s = R.scoreCandidate({ pass: false, failures: ['INTRINSIC: 0%'] }, null, {});
  if (s.score !== null) return 'scored a failed candidate: ' + s.score;
  return s.reason.indexOf('invite overriding') >= 0 || s.reason;
});

check('a passing candidate scores between 0 and 100', () => {
  const gate = { pass: true, metrics: { intrinsicPct: 0.5, headroom: 100,
    spreadPct: 0.01, sdsToBreakeven: 0.2 } };
  const s = R.scoreCandidate(gate, { agreement: 2 }, {
    right: 'CE', adx: 65, plusDI: 32, minusDI: 9, atr: 42,
    volume: 200000, avgVolume: 100000, depthLots: 3,
    weeklyHighs: [1700, 1780, 1845], weeklyLows: [1620, 1700, 1760] });
  if (s.score === null) return 'no score';
  return (s.score >= 0 && s.score <= 100) || 'score ' + s.score;
});

check('a better candidate scores above a worse one', () => {
  const mk = (intr, adx, sds) => R.scoreCandidate(
    { pass: true, metrics: { intrinsicPct: intr, headroom: 100,
      spreadPct: 0.01, sdsToBreakeven: sds } },
    { agreement: 2 },
    { right: 'CE', adx: adx, plusDI: 32, minusDI: 9, atr: 42,
      volume: 200000, avgVolume: 100000, depthLots: 3,
      weeklyHighs: [1700, 1780, 1845], weeklyLows: [] });
  const good = mk(0.6, 70, 0.15), poor = mk(0.1, 30, 0.55);
  return good.score > poor.score || good.score + ' vs ' + poor.score;
});

check('ranking breaks ties toward the higher intrinsic ratio', () => {
  const a = { score: 70, gate: { metrics: { intrinsicPct: 0.2 } }, key: 'A' };
  const b = { score: 70, gate: { metrics: { intrinsicPct: 0.6 } }, key: 'B' };
  return R.rankCandidates([a, b])[0].key === 'B' || 'tie broken the wrong way';
});

check('ranking drops unscored candidates entirely', () => {
  const r = R.rankCandidates([{ score: null }, { score: 50,
    gate: { metrics: {} } }]);
  return r.length === 1 || 'kept ' + r.length;
});

// ===================================================== ALERTS

check('Telegram reports "not configured" rather than throwing', () => {
  const r = R.notifyTelegram('hello');
  return (!r.sent && r.reason.indexOf('not configured') >= 0) || JSON.stringify(r);
});

check('notify never throws, even with everything unavailable', () => {
  R.notify('CRITICAL', 'test', 'body');
  return true;
});

for (const [st, name, msg] of results) {
  if (st === 'FAIL') console.log('FAIL  ' + name + '  --  ' + msg);
  else if (process.env.VERBOSE) console.log('pass  ' + name);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
