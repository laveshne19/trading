/**
 * paper.cjs — tests for the paper engine, then a REPLAY of this week's real
 * prices so you can watch it decide.
 *
 *   node test/paper.cjs           tests only
 *   node test/paper.cjs --replay  tests, then the session replay
 *
 * The replay uses prices actually observed on 25-26 Nov 2026. Where the real
 * outcome is known, the engine's decision can be judged against it.
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
for (const f of ['00_Config.gs','14_Util.gs','15_Costs.gs','16_Hold.gs','17_Gate.gs','18_Paper.gs']) {
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
const near = (a,b,t=0.01) => Math.abs(a-b) <= t;

// AUROPHARMA 1800 CE as it actually looked on 25 Nov at 12:22.
function goodCandidate(over) {
  return Object.assign({
    symbol: 'AUROPHARMA26DEC1800CE', underlying: 'AUROPHARMA', right: 'CE',
    strike: 1800, spot: 1840.30, ask: 81.00, bid: 80.55, lotSize: 550,
    optionDayChangePct: 0.344, oi: 1001, oiDayChangePct: 0.068,
    stUpperBand: 1905.10, stDirection: 1,
    adx: 65.58, plusDI: 31.50, minusDI: 9.37, atr: 42.00,
    daysToExpiry: 23, depthLots: 2, sector: 'PHARMA', sectorPositions: 0,
    weeklyHighs: [1700, 1780, 1845], weeklyLows: [1620, 1700, 1760],
    hasEventBeforeExpiry: false
  }, over || {});
}
const goodPlan = {
  lots: 1, stopLevel: 1805, targetPrice: 120, thesisVar: 'AUROPHARMA',
  timeStopDate: '2026-12-15', todayISO: '2026-11-25', nowHHMM: '12:22'
};

// ---------------------------------------------------------------- entries

check('a clean candidate fills, and fills at the ASK not the mid', () => {
  const b = R.newPaperBook(200000);
  const r = R.paperEnter(b, goodCandidate(), goodPlan);
  if (!r.accepted) return 'refused: ' + r.reason;
  if (r.position.entryPrice !== 81.00) return 'filled at ' + r.position.entryPrice +
    ' — paper must cross the spread, not take the mid';
  return b.positions.length === 1 || 'position not recorded';
});

check('cash is reduced by the full premium', () => {
  const b = R.newPaperBook(200000);
  R.paperEnter(b, goodCandidate(), goodPlan);
  return near(b.cash, 200000 - 81.00 * 550, 1) || 'cash ' + b.cash;
});

check('a gate failure is REFUSED and the reason is kept', () => {
  const b = R.newPaperBook(200000);
  const r = R.paperEnter(b, goodCandidate({ optionDayChangePct: 0.76 }), goodPlan);
  if (r.accepted) return 'accepted an option up 76%';
  if (b.rejections.length !== 1) return 'refusal not recorded';
  return r.reason.indexOf('IV_INFLATION') >= 0 || 'reason: ' + r.reason;
});

check('a stop inside 0.6 ATR is refused BEFORE the gate runs', () => {
  const b = R.newPaperBook(200000);
  const r = R.paperEnter(b, goodCandidate(),
    Object.assign({}, goodPlan, { stopLevel: 1835 }));   // 0.13 ATR
  if (r.accepted) return 'accepted a stop inside the ATR floor';
  return r.reason.indexOf('stop rejected') >= 0 || 'reason: ' + r.reason;
});

check('insufficient paper cash refuses the trade', () => {
  const b = R.newPaperBook(1000);
  const r = R.paperEnter(b, goodCandidate(), goodPlan);
  return (!r.accepted && r.reason.indexOf('insufficient') >= 0) || r.reason;
});

check('max concurrent positions is enforced', () => {
  const b = R.newPaperBook(500000);
  for (let i = 0; i < 3; i++) {
    R.paperEnter(b, goodCandidate({ symbol: 'S' + i, sectorPositions: 0,
      sector: 'SEC' + i }), goodPlan);
  }
  const r = R.paperEnter(b, goodCandidate({ symbol: 'S9', sector: 'SEC9' }),
    goodPlan);
  return (!r.accepted && r.reason.indexOf('max concurrent') >= 0) || r.reason;
});

check('max trades per day is enforced across closed trades too', () => {
  const b = R.newPaperBook(500000);
  b.tradesToday = 3; b.lastDate = '2026-11-25';
  const r = R.paperEnter(b, goodCandidate(), goodPlan);
  return (!r.accepted && r.reason.indexOf('max trades per day') >= 0) || r.reason;
});

// ---------------------------------------------------------------- exits

function bookWithPosition() {
  const b = R.newPaperBook(200000);
  R.paperEnter(b, goodCandidate(), goodPlan);
  return b;
}

check('an intraday wick through the stop does NOT close the position', () => {
  const b = bookWithPosition();
  const a = R.paperMark(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 60, bid: 59.5, ask: 60.5, underlyingPrice: 1800, underlyingClose: null
  }}, { todayISO: '2026-11-25', nowHHMM: '13:00' });
  if (b.positions.length !== 1) return 'position was closed on a wick';
  return a[0].rule === 'STOP_INTRADAY_ONLY' || 'rule ' + a[0].rule;
});

check('a CLOSE through the stop flags EXIT_AT_OPEN but does not sell today', () => {
  const b = bookWithPosition();
  const a = R.paperMark(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 60, bid: 59.5, ask: 60.5, underlyingPrice: 1800, underlyingClose: 1800
  }}, { todayISO: '2026-11-25', nowHHMM: '15:30' });
  if (b.positions.length !== 1) return 'sold on the same day as the close';
  if (a[0].action !== 'EXIT_AT_OPEN') return 'action ' + a[0].action;
  return b.positions[0].exitAtOpen !== undefined || 'flag not set';
});

check('the flagged exit executes at the next open, into the BID', () => {
  const b = bookWithPosition();
  R.paperMark(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 60, bid: 59.5, ask: 60.5, underlyingPrice: 1800, underlyingClose: 1800
  }}, { todayISO: '2026-11-25', nowHHMM: '15:30' });
  const a = R.paperOpenExits(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 58, bid: 57.5, ask: 58.5, underlyingPrice: 1795
  }}, { todayISO: '2026-11-26', nowHHMM: '09:20' });
  if (b.positions.length !== 0) return 'position not closed';
  if (b.closed.length !== 1) return 'not recorded as closed';
  return b.closed[0].exitPrice === 57.5 || 'exited at ' + b.closed[0].exitPrice +
    ' — must sell into the bid';
});

check('a closed trade records costs, and net is strictly below gross', () => {
  const b = bookWithPosition();
  R.paperMark(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 120, bid: 119.5, ask: 120.5, underlyingPrice: 1930, underlyingClose: null
  }}, { todayISO: '2026-11-26', nowHHMM: '11:00' });
  const t = b.closed[0];
  if (!t) return 'target exit did not fire';
  if (!(t.costs > 0)) return 'no costs charged';
  return t.netPnl < t.grossPnl || 'net ' + t.netPnl + ' not below gross ' + t.grossPnl;
});

check('no quote this tick leaves the position alone', () => {
  const b = bookWithPosition();
  const a = R.paperMark(b, {}, { todayISO: '2026-11-26', nowHHMM: '11:00' });
  if (b.positions.length !== 1) return 'closed a position with no data';
  return a[0].action === 'NO_MARK' || 'action ' + a[0].action;
});

check('nothing is decided before 09:45', () => {
  const b = bookWithPosition();
  const a = R.paperMark(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 130, bid: 129, ask: 131, underlyingPrice: 1950, underlyingClose: null
  }}, { todayISO: '2026-11-26', nowHHMM: '09:18' });
  if (b.closed.length !== 0) return 'took a decision on an opening print';
  return a[0].rule === 'OPENING_MINUTES_GUARD' || 'rule ' + a[0].rule;
});

// ---------------------------------------------------------------- trailing

check('trailing moves the stop and logs it', () => {
  const b = bookWithPosition();
  const moves = R.paperTrail(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 120, underlyingPrice: 1930
  }}, () => 1900);   // 30 points = 0.71 ATR
  if (!moves[0].moved) return 'did not trail: ' + moves[0].reason;
  return b.positions[0].stopLevel === 1900 || 'stop ' + b.positions[0].stopLevel;
});

check('trailing refuses to widen', () => {
  const b = bookWithPosition();
  R.paperTrail(b, { 'AUROPHARMA26DEC1800CE': { ltp: 120, underlyingPrice: 1930 }},
    () => 1700);
  return b.positions[0].stopLevel === 1805 || 'stop was widened';
});

// ---------------------------------------------------------------- reporting

check('the verdict refuses to validate under 30 trades', () => {
  const b = bookWithPosition();
  R.paperMark(b, { 'AUROPHARMA26DEC1800CE': {
    ltp: 120, bid: 119.5, ask: 120.5, underlyingPrice: 1930, underlyingClose: null
  }}, { todayISO: '2026-11-26', nowHHMM: '11:00' });
  const rep = R.paperReport(b);
  if (rep.netPnl <= 0) return 'a winning trade produced net ' + rep.netPnl;
  return rep.verdict.indexOf('NOT VALIDATED') === 0 ||
    'verdict claimed too much: ' + rep.verdict;
});

check('a losing record is reported as FAILED, not spun', () => {
  const b = R.newPaperBook(200000);
  for (let i = 0; i < 30; i++) {
    b.closed.push({ netPnl: -500, costs: 100, grossPnl: -400 });
  }
  const rep = R.paperReport(b);
  return rep.verdict.indexOf('FAILED') === 0 || 'verdict: ' + rep.verdict;
});

// ------------------------------------------------------------ reconcile

check('reconciliation catches a quantity mismatch', () => {
  const b = bookWithPosition();
  const r = R.paperReconcile(b, [
    { trading_symbol: 'AUROPHARMA26DEC1800CE', quantity: 275 }]);
  return (!r.ok && r.mismatches[0].broker === 275) || JSON.stringify(r);
});

check('reconciliation flags an UNEXPECTED broker position', () => {
  const b = R.newPaperBook(200000);
  const r = R.paperReconcile(b, [{ trading_symbol: 'MYSTERY26DEC100CE', quantity: 50 }]);
  if (r.ok) return 'missed an unexpected position';
  return r.mismatches[0].note.indexOf('UNEXPECTED') >= 0 || r.mismatches[0].note;
});

check('reconciliation passes when the books agree', () => {
  const b = bookWithPosition();
  const r = R.paperReconcile(b, [
    { trading_symbol: 'AUROPHARMA26DEC1800CE', quantity: 550 }]);
  return r.ok || JSON.stringify(r.mismatches);
});

// ================================================================ output

for (const [st, name, msg] of results) {
  if (st === 'FAIL') console.log('FAIL  ' + name + '  --  ' + msg);
  else if (process.env.VERBOSE) console.log('pass  ' + name);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');

// ================================================================ replay

if (process.argv.indexOf('--replay') !== -1) {
  console.log('\n' + '='.repeat(72));
  console.log('REPLAY — real prices, 25-26 Nov 2026');
  console.log('='.repeat(72));

  const book = R.newPaperBook(200000);
  const SYM = 'AUROPHARMA26DEC1800CE';

  function show(label, actions) {
    console.log('\n' + label);
    for (const a of actions) {
      console.log('   ' + (a.action + '        ').slice(0, 14) +
        (a.rule ? '[' + a.rule + '] ' : '') + a.reason);
    }
  }

  // --- 25 Nov 12:22 — the real entry decision -------------------------
  const e = R.paperEnter(book, goodCandidate(), goodPlan);
  console.log('\n25 Nov 12:22  ENTRY');
  console.log('   ' + (e.accepted ? 'FILLED' : 'REFUSED') + '  ' + e.reason);
  if (e.accepted) {
    const m = e.position.gateMetrics;
    console.log('   headroom Rs ' + m.headroom + ' · intrinsic ' +
      (m.intrinsicPct * 100).toFixed(1) + '% · DI ' + m.diRatio + 'x');
    console.log('   breakeven ' + m.breakevenPrice + ' after Rs ' +
      m.costPerRoundTrip + ' of costs · ' + m.sdsToBreakeven + ' SD needed');
  }

  // --- 25 Nov 15:30 close -------------------------------------------
  show('25 Nov 15:30  CLOSE  (stock 1,843.00, option 81.40)',
    R.paperMark(book, { [SYM]: { ltp: 81.40, bid: 81.00, ask: 81.80,
      underlyingPrice: 1843.00, underlyingClose: 1843.00 }},
      { todayISO: '2026-11-25', nowHHMM: '15:30' }));

  // --- 26 Nov 09:18 — the stale opening print ------------------------
  show('26 Nov 09:18  OPEN   (option marked 86.70 while the stock was DOWN)',
    R.paperMark(book, { [SYM]: { ltp: 86.70, bid: 80.00, ask: 87.00,
      underlyingPrice: 1839.10, underlyingClose: null }},
      { todayISO: '2026-11-26', nowHHMM: '09:18' }));

  // --- 26 Nov 09:43 — the collapse -----------------------------------
  show('26 Nov 09:43  DIP    (stock 1,831.10, option 76.45)',
    R.paperMark(book, { [SYM]: { ltp: 76.45, bid: 76.00, ask: 76.90,
      underlyingPrice: 1831.10, underlyingClose: null }},
      { todayISO: '2026-11-26', nowHHMM: '09:43' }));

  // --- 26 Nov 10:01 — recovery ---------------------------------------
  show('26 Nov 10:01  REBOUND(stock 1,844.00, option 83.90)',
    R.paperMark(book, { [SYM]: { ltp: 83.90, bid: 83.40, ask: 84.40,
      underlyingPrice: 1844.00, underlyingClose: null }},
      { todayISO: '2026-11-26', nowHHMM: '10:01' }));

  console.log('\n   trail attempt to 1,830 (14 pts = 0.33 ATR):');
  const tr = R.paperTrail(book, { [SYM]: { ltp: 83.90, underlyingPrice: 1844 }},
    () => 1830);
  console.log('   ' + (tr[0].moved ? 'MOVED' : 'REFUSED') + '  ' + tr[0].reason);

  // --- 26 Nov 11:21 ---------------------------------------------------
  show('26 Nov 11:21  NOW    (option 75.00)',
    R.paperMark(book, { [SYM]: { ltp: 75.00, bid: 74.50, ask: 75.50,
      underlyingPrice: 1829.00, underlyingClose: null }},
      { todayISO: '2026-11-26', nowHHMM: '11:21' }));

  const rep = R.paperReport(book);
  console.log('\n' + '-'.repeat(72));
  console.log('BOOK    open ' + rep.openPositions + ' · unrealised Rs ' +
    rep.openUnrealised + ' · cash Rs ' + rep.cash);
  console.log('        equity Rs ' + rep.equity + ' · closed trades ' + rep.trades);
  console.log('VERDICT ' + rep.verdict);
  console.log('-'.repeat(72));
}

process.exit(fail === 0 ? 0 : 1);
