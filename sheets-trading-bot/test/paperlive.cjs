/**
 * paperlive.cjs — tests for 19_PaperLive.gs, the layer that touches the
 * network and the spreadsheet.
 *
 *   node test/paperlive.cjs
 *
 * apiQuote is stubbed per test. The real UrlFetchApp still throws, so a path
 * that forgot to go through the stub fails loudly instead of silently
 * reaching Groww.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'apps-script');

// --- a spreadsheet that lives in memory -------------------------------
function makeSheets() {
  const data = {};   // name -> array of rows (row 0 = header)
  function ensure(name) { if (!data[name]) data[name] = [[]]; return data[name]; }
  function sheetObj(name) {
    const rows = ensure(name);
    return {
      getLastRow: () => rows.length,
      getLastColumn: () => (rows[0] || []).length,
      setFrozenRows: () => {},
      autoResizeColumns: () => {},
      appendRow: r => { rows.push(r.slice()); },
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
      getRange: (r, c, nr, nc) => ({
        getValues: () => {
          const out = [];
          for (let i = 0; i < (nr || 1); i++) {
            const row = rows[r - 1 + i] || [];
            const slice = [];
            for (let j = 0; j < (nc || 1); j++) slice.push(row[c - 1 + j] ?? '');
            out.push(slice);
          }
          return out;
        },
        setValues: vals => {
          vals.forEach((row, i) => {
            const ri = r - 1 + i;
            while (rows.length <= ri) rows.push([]);
            row.forEach((v, j) => { rows[ri][c - 1 + j] = v; });
          });
          return { setFontWeight: () => ({ setBackground: () => {} }) };
        },
        clearContent: () => {
          for (let i = 0; i < (nr || 1); i++) {
            const ri = r - 1 + i;
            if (rows[ri]) for (let j = 0; j < (nc || 1); j++) rows[ri][c - 1 + j] = '';
          }
        },
        setFontWeight: () => ({ setBackground: () => ({}) }),
        setBackground: () => ({})
      })
    };
  }
  return {
    data,
    api: {
      getActive: () => ({
        getSheetByName: n => (data[n] ? sheetObj(n) : null),
        insertSheet: n => { ensure(n); return sheetObj(n); },
        setActiveSheet: () => {}, moveActiveSheet: () => {}
      })
    },
    obj: sheetObj
  };
}

const props = new Map();
const SS = makeSheets();

const sandbox = {
  console, Math, Date, JSON, Number, String, Boolean, Array, Object, Error,
  isNaN, parseInt, parseFloat, RegExp, Infinity,
  Logger: { log: () => {} },
  Utilities: {
    sleep: () => {},
    formatDate: (d, tz, fmt) => {
      const ist = new Date(d.getTime() + (5 * 60 + 30) * 60000);
      const p = {
        y: ist.getUTCFullYear(),
        M: String(ist.getUTCMonth() + 1).padStart(2, '0'),
        d: String(ist.getUTCDate()).padStart(2, '0'),
        H: String(ist.getUTCHours()).padStart(2, '0'),
        m: String(ist.getUTCMinutes()).padStart(2, '0'),
        s: String(ist.getUTCSeconds()).padStart(2, '0')
      };
      if (fmt === 'HH:mm') return `${p.H}:${p.m}`;
      if (fmt === 'yyyy-MM-dd') return `${p.y}-${p.M}-${p.d}`;
      return `${p.y}-${p.M}-${p.d} ${p.H}:${p.m}:${p.s}`;
    }
  },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (props.has(k) ? props.get(k) : null),
    setProperty: (k, v) => props.set(k, String(v)),
    deleteProperty: k => props.delete(k)
  })},
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  UrlFetchApp: { fetch() { throw new Error('real network call attempted'); } },
  MailApp: { sendEmail() {} },
  Session: { getEffectiveUser: () => ({ getEmail: () => 't@e.com' }) },
  ScriptApp: { getProjectTriggers: () => [] },
  SpreadsheetApp: SS.api
};
const R = vm.createContext(sandbox);
for (const f of ['00_Config.gs','10_SheetIO.gs','14_Util.gs','15_Costs.gs',
                 '16_Hold.gs','17_Gate.gs','18_Paper.gs','19_PaperLive.gs','20_PaperMenu.gs']) {
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

const POS = {
  symbol: 'AUROPHARMA26DEC1800CE', thesisVar: 'AUROPHARMA',
  right: 'CE', atr: 42, entryPrice: 70, qty: 550, stopLevel: 1805
};

// ------------------------------------------------------------ quotes

check('a normal quote produces a usable mark', () => {
  R.apiQuote = (ex, seg, sym) => seg === 'FNO'
    ? { payload: { trading_symbol: sym, last_price: 81,
        depth: { buy: [{ price: 80.55 }], sell: [{ price: 81.00 }] } } }
    : { payload: { trading_symbol: 'AUROPHARMA', last_price: 1840.30 } };
  const m = R.paperFetchMark_(POS);
  if (!m.ok) return 'not ok: ' + m.reason;
  if (m.ltp !== 81) return 'ltp ' + m.ltp;
  return m.underlyingPrice === 1840.30 || 'underlying ' + m.underlyingPrice;
});

check('no LTP but a two-sided book falls back to the mid (the 429 case)', () => {
  R.apiQuote = (ex, seg, sym) => seg === 'FNO'
    ? { payload: { trading_symbol: sym, last_price: 0,
        depth: { buy: [{ price: 64.35 }], sell: [{ price: 65.30 }] } } }
    : { payload: { trading_symbol: 'AUROPHARMA', last_price: 1840 } };
  const m = R.paperFetchMark_(POS);
  if (!m.ok) return 'not ok: ' + m.reason;
  return m.ltp === 64.82 || 'ltp ' + m.ltp;   // 64.825 rounds down in IEEE 754
});

check('a SYMBOL MISMATCH on the underlying is a failure, not a fake mark', () => {
  R.apiQuote = (ex, seg, sym) => seg === 'FNO'
    ? { payload: { trading_symbol: sym, last_price: 81,
        depth: { buy: [{ price: 80 }], sell: [{ price: 81 }] } } }
    : { payload: { trading_symbol: 'INFY', last_price: 1124.60 } };
  const m = R.paperFetchMark_(POS);
  if (m.ok) return 'accepted INFY as AUROPHARMA';
  return m.reason.indexOf('SYMBOL MISMATCH') >= 0 || 'reason: ' + m.reason;
});

check('no underlying price means no mark — the stop cannot be evaluated', () => {
  R.apiQuote = (ex, seg, sym) => seg === 'FNO'
    ? { payload: { trading_symbol: sym, last_price: 81,
        depth: { buy: [{ price: 80 }], sell: [{ price: 81 }] } } }
    : { payload: { trading_symbol: 'AUROPHARMA', last_price: 0 } };
  const m = R.paperFetchMark_(POS);
  return (!m.ok && m.reason.indexOf('cannot evaluate the stop') >= 0) || m.reason;
});

check('an exception from the broker is caught and reported', () => {
  R.apiQuote = () => { throw new Error('503 upstream'); };
  const m = R.paperFetchMark_(POS);
  return (!m.ok && m.reason.indexOf('503') >= 0) || 'reason: ' + m.reason;
});

check('a dead contract with no price at all is refused', () => {
  R.apiQuote = (ex, seg, sym) => seg === 'FNO'
    ? { payload: { trading_symbol: sym, last_price: 0, depth: {} } }
    : { payload: { trading_symbol: 'AUROPHARMA', last_price: 1840 } };
  const m = R.paperFetchMark_(POS);
  return (!m.ok && m.reason.indexOf('no usable option price') >= 0) || m.reason;
});

// ------------------------------------------------------------ persistence

check('the book survives a save/load round trip', () => {
  R.paperReset();
  const b = R.newPaperBook(200000);
  b.positions.push(Object.assign({}, POS, {
    id: 'P1', underlying: 'AUROPHARMA', strike: 1800, lotSize: 550, lots: 1,
    entryPrice: 81, entryTs: '2026-11-25 12:22', entrySpread: 0.45,
    targetPrice: 120, timeStopDate: '2026-12-15', sector: 'PHARMA',
    peakPrice: 86.7, ltp: 75
  }));
  b.cash = 155450;
  R.paperBookSave_(b);

  const b2 = R.paperBookLoad_();
  if (b2.positions.length !== 1) return 'positions ' + b2.positions.length;
  const p = b2.positions[0];
  if (p.symbol !== POS.symbol) return 'symbol ' + p.symbol;
  if (Number(p.stopLevel) !== 1805) return 'stop ' + p.stopLevel;
  if (Number(p.targetPrice) !== 120) return 'target ' + p.targetPrice;
  return Math.abs(b2.cash - 155450) < 1 || 'cash ' + b2.cash;
});

check('paperReset clears the book', () => {
  R.paperReset();
  const b = R.paperBookLoad_();
  return b.positions.length === 0 || 'positions remained: ' + b.positions.length;
});

// ------------------------------------------------------------ trailing

check('the trail proposer sits 0.8 ATR below price for a CALL', () => {
  const v = R.paperProposeTrail_({ right: 'CE', atr: 42 }, { underlyingPrice: 1900 });
  return v === 1866.4 || 'proposed ' + v;
});

check('the trail proposer sits 0.8 ATR ABOVE price for a PUT', () => {
  const v = R.paperProposeTrail_({ right: 'PE', atr: 6.06 },
    { underlyingPrice: 157 });
  return v === 161.85 || 'proposed ' + v;
});

check('REGRESSION: the HDFCBANK 26 Nov case actually tightens the stop', () => {
  // Stock 870.15, ATR 22.11, stop sitting at 838, position +47%.
  // At 1.5 ATR the proposal was 836.98 - a widening, so the stop never moved
  // and stayed 32 points behind the market.
  const proposed = R.paperProposeTrail_({ right: 'CE', atr: 22.11 },
    { underlyingPrice: 870.15 });
  if (!(proposed > 838)) return 'proposed ' + proposed + ' would still widen';
  const t = R.trailStop({ right: 'CE', entryPrice: 36, ltp: 52.90,
    underlyingPrice: 870.15, stopLevel: 838, atr: 22.11 }, proposed);
  return t.moved || 'trailStop refused: ' + t.reason;
});

check('the trail proposer returns null without an ATR', () => {
  return R.paperProposeTrail_({ right: 'CE', atr: 0 },
    { underlyingPrice: 1900 }) === null || 'did not refuse';
});

// ------------------------------------------------------------ the tick

check('the tick does nothing outside market hours', () => {
  R.isMarketOpen_ = () => false;
  const r = R.jobPaperTick();
  if (!r.skipped) return 'ran while the market was closed';
  R.isMarketOpen_ = () => true;
  return true;
});

check('a quote failure leaves the position untouched and is reported', () => {
  R.paperReset();
  R.isMarketOpen_ = () => true;
  R.isTradingDay_ = () => true;
  const b = R.newPaperBook(200000);
  b.positions.push(Object.assign({}, POS, {
    id: 'P1', underlying: 'AUROPHARMA', strike: 1800, lotSize: 550, lots: 1,
    entryPrice: 81, entryTs: '2026-11-25 12:22', entrySpread: 0.45,
    targetPrice: 120, sector: 'PHARMA', peakPrice: 81, ltp: 81
  }));
  R.paperBookSave_(b);

  R.apiQuote = () => { throw new Error('upstream down'); };
  const r = R.jobPaperTick();
  if (r.skipped) return 'skipped: ' + r.skipped;
  if (r.quoteFailures.length !== 1) return 'failures ' + r.quoteFailures.length;
  const after = R.paperBookLoad_();
  return after.positions.length === 1 ||
    'position lost on a quote failure: ' + after.positions.length;
});

check('the dashboard verdict never claims validation under 30 trades', () => {
  const b = R.paperBookLoad_();
  const rep = R.paperWriteDashboard_(b, []);
  return rep.verdict.indexOf('NOT VALIDATED') === 0 || 'verdict: ' + rep.verdict;
});

check('option symbols parse into underlying, strike and right', () => {
  const a = R.parseOptionSymbol_('AUROPHARMA26DEC1800CE');
  if (a.underlying !== 'AUROPHARMA') return 'underlying ' + a.underlying;
  if (a.strike !== 1800) return 'strike ' + a.strike;
  if (a.right !== 'CE') return 'right ' + a.right;
  const b = R.parseOptionSymbol_('TATASTEEL26DEC160PE');
  return (b.underlying === 'TATASTEEL' && b.strike === 160 && b.right === 'PE')
    || JSON.stringify(b);
});

check('an unfamiliar symbol returns blanks rather than a guess', () => {
  const x = R.parseOptionSymbol_('SOMETHING_ODD');
  return (x.underlying === '' && x.right === '') || JSON.stringify(x);
});

check('seeding refuses a row with no stop, target or ATR', () => {
  R.paperReset();
  R.apiPositions = () => ({ payload: [
    { trading_symbol: 'AUROPHARMA26DEC1800CE', quantity: 550,
      buying_price: 70, last_traded_price: 72, lot_size: 550 }]});
  // PaperSeed row left blank on purpose.
  R.appendObj_('PaperSeed', { tradingSymbol: 'AUROPHARMA26DEC1800CE',
    thesisVar: 'AUROPHARMA', right: 'CE', strike: 1800, lotSize: 550,
    stopLevel: '', targetPrice: '', atr: '' });
  const msg = R.paperSeedCommit();
  if (R.paperBookLoad_().positions.length !== 0) return 'opened without a stop';
  return msg.indexOf('stopLevel is blank') >= 0 || msg;
});

check('seeding opens a complete row at the REAL entry price', () => {
  R.paperReset();
  R.apiPositions = () => ({ payload: [
    { trading_symbol: 'AUROPHARMA26DEC1800CE', quantity: 550,
      buying_price: 70, last_traded_price: 72, lot_size: 550 }]});
  const sh = R.sheet_('PaperSeed');
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }
  R.appendObj_('PaperSeed', { tradingSymbol: 'AUROPHARMA26DEC1800CE',
    thesisVar: 'AUROPHARMA', right: 'CE', strike: 1800, lotSize: 550,
    stopLevel: 1805, targetPrice: 120, atr: 42, sector: 'PHARMA' });
  R.paperSeedCommit();
  const b = R.paperBookLoad_();
  if (b.positions.length !== 1) return 'positions ' + b.positions.length;
  const p = b.positions[0];
  if (Number(p.entryPrice) !== 70) return 'entry ' + p.entryPrice +
    ' — must use the real fill, not the current price';
  return Number(p.qty) === 550 || 'qty ' + p.qty;
});

check('seeding the same symbol twice does not duplicate it', () => {
  const before = R.paperBookLoad_().positions.length;
  R.paperSeedCommit();
  return R.paperBookLoad_().positions.length === before || 'duplicated';
});

check('a position closed today (qty 0) is not treated as open', () => {
  R.apiPositions = () => ({ payload: [
    { trading_symbol: 'X26DEC100CE', quantity: 0, buying_price: 10 }]});
  return R.paperLivePositions_().length === 0 || 'counted a closed position';
});

check('no order function is reachable from this module', () => {
  const raw = fs.readFileSync(path.join(SRC, '19_PaperLive.gs'), 'utf8');
  // Strip comments: the module header legitimately NAMES apiPlaceOrder to
  // state that nothing here calls it. What matters is executable code.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const bad of ['apiPlaceOrder', 'apiModifyOrder', 'apiCancelOrder',
                     'ORDER_CREATE', 'place_order']) {
    if (code.indexOf(bad) !== -1) return 'module CALLS ' + bad;
  }
  return true;
});

for (const [st, name, msg] of results) {
  if (st === 'FAIL') console.log('FAIL  ' + name + '  --  ' + msg);
  else if (process.env.VERBOSE) console.log('pass  ' + name);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
